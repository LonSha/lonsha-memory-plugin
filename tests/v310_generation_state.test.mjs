// tests/v310_generation_state.test.mjs
// v3.10 生成状态与并发测试：_generationActive 生命周期 / 自愈守卫 / 防重入 / 降级排队
// 运行: node tests/v310_generation_state.test.mjs
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
let pass = 0;
const ok = (msg) => { pass++; console.log('ok: ' + msg); };

/* ---------- 提取器 ---------- */
function braceEnd(s, open) {
    let depth = 0;
    for (let i = open; i < s.length; i++) {
        const ch = s[i];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return i; }
        else if (ch === "'" || ch === '"' || ch === '`') { const q = ch; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } }
        else if (ch === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; }
    }
    return -1;
}
function extractAsyncMethod(name) {
    const start = src.indexOf(`        async ${name}(`);
    if (start < 0) throw new Error('missing ' + name);
    const brace = src.indexOf('{', src.indexOf(')', start));
    return 'async function ' + src.slice(start + 14, braceEnd(src, brace) + 1);
}
function extractMethod(name) {
    const start = src.indexOf(`        ${name}(`);
    if (start < 0) throw new Error('missing ' + name);
    const brace = src.indexOf('{', src.indexOf(')', start));
    return 'function ' + src.slice(start + 8, braceEnd(src, brace) + 1);
}

/* ══════════ 1. _generationActive 生命周期（静态） ══════════ */
{
    assert.ok(src.includes('this._generationActive = false;             // [v3.10]'), '引擎挂载');
    // 置位点在 GENERATION_STARTED 处理器内
    const gsIdx = src.indexOf('types.GENERATION_STARTED');
    const gsBlock = src.slice(gsIdx, gsIdx + 1500);
    assert.ok(gsBlock.includes('this.engine._generationActive = true;'), '生成开始置位');
    // 复位点在 onMessageReceived 开头
    const omrIdx = src.indexOf('async onMessageReceived(message, messageId = null) {');
    const omrHead = src.slice(omrIdx, omrIdx + 300);
    assert.ok(omrHead.includes('this._generationActive = false;'), '生成结束复位');
    ok('静态1: 生成标志生命周期（挂载/置位/复位）');
}

/* ══════════ 2. 自愈执行体守卫（行为） ══════════ */
{
    const fnSrc = extractAsyncMethod('_runFloorHeal');
    const heal = new Function('window', 'errLog', 'PLUGIN_NAME', `
        ${fnSrc}
        return _runFloorHeal;
    `);
    const mkEnv = (generationActive, extractDelay) => {
        const state = { extracted: [], engineGeneration: generationActive };
        const win = {
            SillyTavern: { getContext: () => ({ chat: [{ mes: 'AI楼', is_user: false }] }) },
        };
        const self = {
            _selfHealRunning: false,
            _editHealPending: new Set([0]),
            _editHealTimer: null,
            engine: {
                _generationActive: generationActive,
                isOmittedFloor: () => false,
                onMessageReceived: async () => {
                    state.extracted.push(1);
                    if (extractDelay) await new Promise(r => setTimeout(r, extractDelay));
                },
            },
        };
        const fn = heal(win, () => {}, 'LonSha记忆引擎');
        return { self, state, run: () => fn.call(self) };
    };

    // 场景1: 生成中 → 不提取、留在待愈集合
    {
        const { self, state, run } = mkEnv(true, 0);
        await run();
        assert.equal(state.extracted.length, 0, '生成中不提取');
        assert.equal(self._editHealPending.size, 1, '留在待愈集合');
        assert.ok(self._editHealTimer !== null, '安排了 5s 重试');
        clearTimeout(self._editHealTimer);
        ok('守卫1: 生成中 → 不提取+留集合+排重试');
    }

    // 场景2: 非生成中 → 正常提取
    {
        const { self, state, run } = mkEnv(false, 0);
        await run();
        assert.equal(state.extracted.length, 1);
        assert.equal(self._editHealPending.size, 0);
        assert.equal(self._selfHealRunning, false, '执行完复位');
        ok('守卫2: 非生成中 → 正常提取+复位');
    }

    // 场景3: 防重入——执行中再调用直接跳过
    {
        const { self, state, run } = mkEnv(false, 150);
        self._selfHealRunning = true;   // 模拟已在执行
        await run();
        assert.equal(state.extracted.length, 0, '防重入跳过');
        ok('守卫3: 执行中再调用 → 防重入跳过');
    }

    // 场景4: 生成中重试后恢复（模拟标志复位后再跑）
    {
        const { self, state, run } = mkEnv(false, 0);
        // 第一轮：生成中
        self.engine._generationActive = true;
        await run();
        assert.equal(state.extracted.length, 0);
        // 标志复位 + 手动触发重试（模拟 5s 定时器）
        self.engine._generationActive = false;
        clearTimeout(self._editHealTimer);
        await run();
        assert.equal(state.extracted.length, 1, '标志复位后重试成功');
        ok('守卫4: 生成中延后 → 标志复位后重试成功');
    }
}

/* ══════════ 3. 降级排队（静态） ══════════ */
{
    assert.ok(src.includes('_lockDegradePending'), '降级待补集合存在');
    assert.ok(src.includes('this._lockDegradePending.add(message.index'), '降级时记录楼层');
    // 锁释放点后挂补提取
    const relIdx = src.indexOf('this.mutex.release();');
    const relBlock = src.slice(relIdx, relIdx + 900);
    assert.ok(relBlock.includes('_lockDegradePending'), '锁释放后检查待补集合');
    assert.ok(relBlock.includes('backfillFloors'), '补提取调用');
    // 上限保护
    assert.ok(relBlock.includes('.slice(0, 10)'), '单次最多 10 楼');
    ok('静态2: 降级排队→锁释放补提取链路完整');
}

/* ══════════ 4. 调度器与执行体分离（静态） ══════════ */
{
    assert.ok(src.includes('_scheduleFloorHeal(f) {'), '调度器入口');
    assert.ok(src.includes('async _runFloorHeal() {'), '执行体分离');
    assert.ok(src.includes('this._runFloorHeal();'), '调度器调执行体');
    // 调度器轻量化（不再内联全量逻辑）
    const schedIdx = src.indexOf('_scheduleFloorHeal(f) {');
    const schedEnd = src.indexOf('_runFloorHeal() {', schedIdx);
    const schedLen = schedEnd - schedIdx;
    assert.ok(schedLen < 700, `调度器应轻量 (<700 字符, 实际 ${schedLen})`);
    ok('静态3: 调度器/执行体分离，调度器轻量化');
}

console.log(`\n✓ v3.10 生成状态测试全过 (${pass} 项)`);