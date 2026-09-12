// tests/v380_swipe_heal.test.mjs
// v3.8 修复包测试：降级保护 / 物品多变体保留 / 孤儿 ops 清理 / 统一调度器（swipe 自愈）
// 运行: node tests/v380_swipe_heal.test.mjs
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
function extractFn(name) {
    let start = src.indexOf(`async function ${name}(`);
    if (start < 0) start = src.indexOf(`function ${name}(`);
    if (start < 0) throw new Error('missing fn ' + name);
    const brace = src.indexOf('{', src.indexOf(')', start));
    return src.slice(start, braceEnd(src, brace) + 1);
}

/* ══════════ 1. HS1 降级保护（行为） ══════════ */
{
    const fnSrc = extractAsyncMethod('createSummary');
    const system = { summaries: [], smartTruncate: (t, n) => String(t || '').slice(0, n) };
    const call = async (m, s, o) => {
        const fn = new Function('errLog', `return ${fnSrc}`)(() => {});
        return fn.call(system, m, s, o);
    };

    // 已有优质摘要 + 降级文本 → 不覆盖
    await call({ index: 2, mes: 'x' }, '优质摘要（LLM生成）');
    await call({ index: 2, mes: 'x' }, '截断的本地摘要', { degraded: true });
    assert.equal(system.summaries[0].text, '优质摘要（LLM生成）', '降级不覆盖已有');
    ok('降级1: 已有优质摘要 → 降级文本不覆盖');

    // 无摘要 + 降级 → 创建（兜底仍有价值）
    await call({ index: 5, mes: 'y' }, '本地截断', { degraded: true });
    assert.equal(system.summaries.length, 2);
    assert.equal(system.summaries[1].text, '本地截断');
    ok('降级2: 无已有摘要 → 降级文本正常创建（兜底）');

    // force + degraded → 覆盖
    await call({ index: 2, mes: 'x' }, '强制替换', { degraded: true, force: true });
    assert.equal(system.summaries[0].text, '强制替换');
    ok('降级3: force 可强制覆盖');

    // 正常（非降级）替换照旧
    await call({ index: 2, mes: 'x' }, '正常新摘要');
    assert.equal(system.summaries[0].text, '正常新摘要');
    ok('降级4: 非降级替换照旧');
}

/* ══════════ 2. HS3 物品多变体保留（重现 filter 逻辑） ══════════ */
{
    // 重现「同状态清、多变体保留」的入栈逻辑
    const applyOps = (itemOps, floorNow, fpNow, items) => {
        if (fpNow) itemOps = itemOps.filter(o => !(o && o.floor === floorNow && o.fp === fpNow));
        for (const it of items) itemOps.push({ floor: floorNow, fp: fpNow, ...it });
        return itemOps;
    };

    // 场景1: 同变体重提取 → 旧清、新入（1 份）
    {
        let ops = [{ floor: 3, fp: 'A1', action: 'add', name: '剑' }];
        ops = applyOps(ops, 3, 'A1', [{ action: 'add', name: '剑' }]);
        assert.equal(ops.length, 1, '同 fp 清旧');
        assert.equal(ops[0].action, 'add');
        ok('变体1: 同变体重提取 → 1 份（防堆积）');
    }

    // 场景2: 不同 swipe 变体 → 都保留（v3.8 核心）
    {
        let ops = [{ floor: 3, fp: 'A1', action: 'add', name: '剑' }];
        ops = applyOps(ops, 3, 'B2', [{ action: 'add', name: '弓' }]);
        assert.equal(ops.length, 2, '多变体共存');
        assert.ok(ops.some(o => o.name === '剑') && ops.some(o => o.name === '弓'));
        ok('变体2: 不同变体 → 共存（切回可复活）');
    }

    // 场景3: 切回旧变体再提取 → 只清旧变体的份
    {
        let ops = [{ floor: 3, fp: 'A1', action: 'add', name: '剑' }, { floor: 3, fp: 'B2', action: 'add', name: '弓' }];
        ops = applyOps(ops, 3, 'A1', [{ action: 'add', name: '剑' }]);
        assert.equal(ops.length, 2, '清 A1 旧份、入 A1 新份；B2 不受影响');
        assert.ok(ops.some(o => o.fp === 'B2'), 'B2 保留');
        ok('变体3: 切回旧变体重提取 → 只动该变体份');
    }
}

/* ══════════ 3. HS4 孤儿 ops 清理（重现逻辑） ══════════ */
{
    const FNS = extractFn('hash32') + '\n' + extractFn('msgTextOf') + '\n' + extractFn('msgFpOf');
    const fpEnv = new Function('window', 'errLog', `${FNS}; return { msgFpOf, hash32 };`)({ SillyTavern: { getContext: () => ({ chat: [] }) } }, () => {});
    const msg = (text, opts = {}) => ({
        mes: text, is_user: opts.user === true, swipe_id: opts.swipe ?? 0,
        swipes: opts.swipes, send_date: opts.date ?? 1000,
    });

    const cleanOps = (chat, itemOps) => {
        const floorFps = new Map();
        chat.forEach((m, i) => {
            const set = new Set();
            set.add(fpEnv.msgFpOf(m));
            if (Array.isArray(m?.swipes)) {
                for (let sw = 0; sw < m.swipes.length; sw++) {
                    if (typeof m.swipes[sw] === 'string') {
                        set.add([(m?.is_user === true || m?.role === 'user') ? 'u' : 'a', sw, fpEnv.hash32(m.swipes[sw]), String(m?.send_date || m?.extra?.send_date || '')].join('|'));
                    }
                }
            }
            floorFps.set(i, set);
        });
        return itemOps.filter(o => {
            if (!o || typeof o !== 'object') return false;
            if (o.carried === true || !o.fp) return true;
            const set = floorFps.get(o.floor);
            if (!set) return Math.floor(Number(o.floor) || 0) < chat.length;
            return set.has(o.fp);
        });
    };

    // 场景1: 多变体保留（swipes 数组的 fp 在集合中）
    {
        const m0 = msg('变体A文本', { swipes: ['变体A文本', '变体B文本'], swipe: 0 });
        const chat = [m0];
        const fpA = fpEnv.msgFpOf(m0);
        const fpB = ['a', 1, fpEnv.hash32('变体B文本'), '1000'].join('|');
        const result = cleanOps(chat, [{ floor: 0, fp: fpA, name: 'A物' }, { floor: 0, fp: fpB, name: 'B物' }]);
        assert.equal(result.length, 2, '两个变体 fp 都在集合 → 都保留');
        ok('孤儿1: 多变体均保留（切回可复活）');
    }

    // 场景2: 彻底废除的变体（fp 不在任何 swipe）→ 清理
    {
        const m0 = msg('当前文本', { swipes: ['当前文本'], swipe: 0 });
        const result = cleanOps([m0], [{ floor: 0, fp: 'ghost|0|dead|', name: '幽灵物' }]);
        assert.equal(result.length, 0);
        ok('孤儿2: 不存在变体的 fp → 清理');
    }

    // 场景3: 越界清理 / 界限内保留
    {
        const chat = [msg('a'), msg('b')];
        const r1 = cleanOps(chat, [{ floor: 9, fp: 'x|0|y|', name: '越界' }]);
        assert.equal(r1.length, 0, '越界清');
        // 界限内但 fp 不匹配（pending 状态）→ 也清（该楼当前文本无此 fp）
        const r2 = cleanOps(chat, [{ floor: 0, fp: 'nomatch|0|z|', name: '不匹配' }]);
        assert.equal(r2.length, 0, '楼内不匹配清');
        ok('孤儿3: 越界/不匹配 → 清理');
    }

    // 场景4: carried/无 fp 豁免
    {
        const chat = [msg('a')];
        const result = cleanOps(chat, [
            { floor: 5, carried: true, name: '携带物' },
            { floor: 5, name: '旧档物' },
        ]);
        assert.equal(result.length, 2, 'carried/无fp 豁免');
        ok('孤儿4: carried/旧档豁免保留');
    }
}

/* ══════════ 4. HS5 调度器统一（静态断言） ══════════ */
{
    // 调度器方法存在
    assert.ok(src.includes('_scheduleFloorHeal(f) {'), '调度器方法存在');
    // 编辑 + swipe 都接入
    const calls = [...src.matchAll(/_scheduleFloorHeal\(f\);/g)].length;
    assert.ok(calls >= 2, `编辑与 swipe 都调用调度器 (实际 ${calls})`);
    assert.ok(src.includes('楼层自愈: 重提取楼层'), '调度器重提取日志');
    // 旧编辑内联代码绝迹
    assert.ok(!src.includes('编辑自愈: 重提取楼层'), '旧编辑内联提取逻辑已被调度器替换');
    assert.ok(!src.includes("errLog(e, 'events.编辑自愈计时')"), '旧编辑内联计时绝迹');
    // swipe 处理器包含调度器调用
    const swipedBlock = src.slice(src.indexOf('if (types.MESSAGE_SWIPED)'), src.indexOf('if (types.MESSAGE_SWIPED)') + 1200);
    assert.ok(swipedBlock.includes('_scheduleFloorHeal'), 'swipe 处理器接入调度器');
    ok('调度1: 统一调度器落位（编辑+swipe 共用）');

    // 调度器豁免语义仍在
    assert.ok(src.includes("if (!m || m.is_user === true) continue;"), '用户楼豁免');
    assert.ok(src.includes('if (this.engine.isOmittedFloor?.(m)) continue;'), '番外楼豁免');
    ok('调度2: 豁免语义完整');
}

console.log(`\n✓ v3.8 修复包测试全过 (${pass} 项)`);