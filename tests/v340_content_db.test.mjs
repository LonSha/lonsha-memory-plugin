// tests/v340_content_db.test.mjs
// v3.4 测试：DB1 TDZ 修复（settings-ui）+ DB2-4 骤减保护（EmergencyBackup + storage.save 守卫）
// 运行: node tests/v340_content_db.test.mjs
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const srcI = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
/* [v3.264.0 A1 第五刀] StorageManager 已外移 memory-organs.js：「从 index.js 抽 save 方法」的抽取面改读该模块（语义一字不改）。 */
const orgSrc = readFileSync(new URL('../memory-organs.js', import.meta.url), 'utf8');
const srcS = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');
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

/* ══════════ 1. DB1: TDZ 修复（静态断言） ══════════ */
{
    const declIdx = srcS.indexOf("const overlay = makeSheet('lonsha-settings-overlay'");
    const useIdx = srcS.indexOf("overlay.querySelector('#ls-snap-restore')");
    assert.ok(declIdx > 0, 'overlay 声明存在');
    assert.ok(useIdx > 0, 'snap-restore 绑定存在');
    assert.ok(declIdx < useIdx, `TDZ 修复：声明必须在首次使用之前 (decl=${declIdx}, use=${useIdx})`);
    ok('DB1a TDZ 修复：overlay 声明先于 ls-snap-restore 绑定');

    // 全局扫描：每个函数内 const overlay 前的 overlay 使用数为 0（排除已知 makeSheet 内部）
    let violations = 0;
    const re = /const overlay = /g; let m;
    while ((m = re.exec(srcS))) {
        const di = m.index;
        const fnStart = Math.max(srcS.lastIndexOf('= function', di), srcS.lastIndexOf('= async function', di), srcS.lastIndexOf('plugin.show', di - 2000));
        const seg = srcS.slice(Math.max(0, fnStart), di);
        if (/\boverlay\./.test(seg)) violations++;
    }
    assert.equal(violations, 0, `不应有 overlay 声明前使用（实际 ${violations}）`);
    ok('DB1b 全文件扫描：无同类 TDZ 隐患');
}

/* ══════════ 2. DB2: EmergencyBackup 结构（静态断言） ══════════ */
{
    /* [v3.258.0 A1 第二刀] EmergencyBackup 已抽为 memory-aux.js，构造点走统一取库口并显式注入
     *   errLog（诊断函数显式注入，不在模块里另存一份）。 */
    const _auxSrc = readFileSync(new URL('../memory-aux.js', import.meta.url), 'utf8');
    assert.ok(_auxSrc.includes('class EmergencyBackup'), 'EmergencyBackup 类存在');
    assert.ok(srcI.includes("this.emergency = _newMemoryAux('EmergencyBackup', {"), '插件实例挂载');
    assert.ok(srcI.includes('errLog: (e, tag) =>'), 'errLog 显式注入');
    assert.ok(_auxSrc.includes('lonsha_emergency_backup'), 'localStorage 键存在');
    ok('DB2 EmergencyBackup 类 + 挂载 + LS 兜底键');
}

/* ══════════ 3. DB4: storage.save 骤减守卫（行为测试） ══════════ */
{
    // 从 index.js 提取 save 方法体
    /* [v3.264.0] save 已随 StorageManager 外移：先在 index.js 找，找不到就到模块里找（同一方法、同一语义）。 */
    /* [v3.264.0 A1 第五刀] 模块内的类已去 4 空格缩进（IIFE 顶层），故同一方法在两面**行首缩进不同**。
     *   两个面各用自己的写法取；indexOf 合法下界是 0（命中第 0 行也是命中）。 */
    const START_H = '        async save(chatId, data) {';
    const START_M = '    async save(chatId, data) {';
    const _host = srcI.indexOf(START_H);
    const _src = _host >= 0 ? srcI : orgSrc;
    const start = _host >= 0 ? _host : orgSrc.indexOf(START_M);
    /* [v3.264.0] 原句 `start > 0`：save 随 StorageManager 外移后模块内首行即可能命中（indexOf 合法返回 0）。 */
    assert.ok(start >= 0, 'save 方法存在（indexOf 合法下界为 0）');
    const brace = _src.indexOf('{', start);
    const end = braceEnd(_src, brace);
    const methodSrc = _src.slice(_src.indexOf('async save', start), end + 1);

    function makeEnv(prevData) {
        const calls = [];
        const ctx = {
            chatMetadata: { extensions: prevData === null ? {} : { lonsha_memory: { data: prevData } } },
            saveChat: async () => {},
        };
        const win = {
            SillyTavern: { getContext: () => ctx },
            LonShaMemory: { emergency: { save: async (...args) => { calls.push(args); } } },
        };
        const obj = new Function('window', 'errLog', 'PLUGIN_NAME', 'VERSION', `
            const obj = { STORAGE_KEY: 'lonsha_memory', ${methodSrc} };
            return obj;
        `)(win, () => {}, 'LonSha记忆引擎', '3.4.0');
        return { obj, ctx, calls };
    }

    const mkSums = (n) => ({ summaries: Array.from({ length: n }, (_, i) => ({ floor: i, text: 's' + i })) });

    // 场景1: 骤减触发（100→10）
    {
        const { obj, calls } = makeEnv({ summaries: mkSums(100) });
        await obj.save('chat1', { summaries: mkSums(10) });
        assert.equal(calls.length, 1, '骤减应触发紧急备份');
        assert.ok(calls[0][1].includes('100→10'), `reason 含 100→10: ${calls[0][1]}`);
        ok('DB4a 骤减 100→10 → 触发紧急备份');
    }

    // 场景2: 正常缩减不触发（100→60）
    {
        const { obj, calls } = makeEnv({ summaries: mkSums(100) });
        await obj.save('chat1', { summaries: mkSums(60) });
        assert.equal(calls.length, 0, '正常缩减不应触发');
        ok('DB4b 正常缩减 100→60 → 不触发');
    }

    // 场景3: 首次保存（无 prev）不触发
    {
        const { obj, calls } = makeEnv(null);
        await obj.save('chat1', { summaries: mkSums(5) });
        assert.equal(calls.length, 0, '首次保存不触发');
        ok('DB4c 首次保存（无 prev）→ 不触发');
    }

    // 场景4: 小规模骤减不触发（20→2，prevN<30）
    {
        const { obj, calls } = makeEnv({ summaries: mkSums(20) });
        await obj.save('chat1', { summaries: mkSums(2) });
        assert.equal(calls.length, 0, '小规模不触发（阈值保护）');
        ok('DB4d 小规模 20→2 → 不触发（<30 保护）');
    }

    // 场景5: 数组格式兼容（旧格式 summaries 直接是数组）
    {
        const { obj, calls } = makeEnv({ summaries: mkSums(80) });
        await obj.save('chat1', { summaries: mkSums(5) });
        assert.equal(calls.length, 1, '旧数组格式也应检测');
        assert.ok(calls[0][1].includes('80→5'));
        ok('DB4e 旧数组格式（80→5）→ 触发');
    }

    // 场景6: 保存正常路径写 metadata
    {
        const { obj, ctx } = makeEnv({ summaries: mkSums(10) });
        await obj.save('chat1', { summaries: mkSums(12) });
        assert.equal(ctx.chatMetadata.extensions.lonsha_memory.data.summaries.summaries.length, 12);
        ok('DB4f 正常保存路径写入 metadata');
    }
}

console.log(`\n✓ v3.4 内容升级+DB测试全过 (${pass} 项)`);