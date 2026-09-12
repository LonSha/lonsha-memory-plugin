// tests/v311_save_blocks.test.mjs
// v3.11 settings-ui 历史降级保存块修复测试：三保存块统一 collectExport / 完整导入管线 / version 动态化
// 运行: node tests/v311_save_blocks.test.mjs
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const srcI = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const srcS = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');
let pass = 0;
const ok = (msg) => { pass++; console.log('ok: ' + msg); };

/* ══════════ 1. 旧降级保存块绝迹（静态） ══════════ */
{
    // 旧 '1.3.0' 存盘块绝迹
    assert.ok(!srcS.includes("version: '1.3.0'"), "旧 '1.3.0' 保存块绝迹");
    // 旧 '2.7.0' 存盘块绝迹（settings-ui 内）
    assert.ok(!srcS.includes("version: '2.7.0'"), "settings-ui 旧 '2.7.0' 保存块绝迹");
    // 旧 '2.0.0' 清空块绝迹
    assert.ok(!srcS.includes("version: '2.0.0'"), "旧 '2.0.0' 清空块绝迹");
    ok('静态1: 三处旧版本硬编码保存块全部绝迹');
}

/* ══════════ 2. 统一 collectExport（静态） ══════════ */
{
    const count = [...srcS.matchAll(/collectExport\(\)\)/g)].length;
    assert.ok(count >= 4, `collectExport 统一保存应 >= 4 处（快照恢复+携带包+清空+文件导入, 实际 ${count}）`);
    ok('静态2: 存盘统一走 collectExport（引擎唯一序列化出口）');
}

/* ══════════ 3. 完整导入管线（静态） ══════════ */
{
    // 文件导入块应导入全部子系统
    const importIdx = srcS.indexOf('reader.onload = async () => {');
    assert.ok(importIdx > 0, 'onload 已改 async');
    const importBlock = srcS.slice(importIdx, importIdx + 2200);
    for (const sub of ['pov.import', 'timeline.import', 'status.import', 'ledger.import', 'suspense.import', 'scene.import', 'echo.import', 'reflection.import', 'itemOps']) {
        assert.ok(importBlock.includes(sub), `导入管线缺 ${sub}`);
    }
    ok('静态3: 文件导入管线覆盖全部子系统（原只导 4 个）');
}

/* ══════════ 4. 清空操作字段补齐（静态） ══════════ */
{
    const clearIdx = srcS.indexOf("#ls-clear').addEventListener('click', async () => {");
    assert.ok(clearIdx > 0, '清空回调已改 async');
    const clearBlock = srcS.slice(clearIdx, clearIdx + 1800);
    for (const sub of ['itemOps', 'reflection.items', 'suspense.items', 'opsLog', 'echo.items']) {
        assert.ok(clearBlock.includes(sub), `清空缺 ${sub}`);
    }
    ok('静态4: 清空操作覆盖全部子系统（原 5 个子系统残留）');
}

/* ══════════ 5. version 动态化（静态） ══════════ */
{
    assert.ok(srcI.includes('version: VERSION,   // [v3.11] 硬编码'), 'carryover pack version 动态化');
    // 确认 index.js 内不再有旧硬编码版本号（除 VERSION 定义与兼容迁移逻辑外）
    const legacy = [...srcI.matchAll(/version: '(\d+\.\d+\.\d+)'/g)].map(m => m[1]);
    assert.ok(legacy.length === 0, `index.js 不应有硬编码版本号残留（实际: ${legacy.join(',')}）`);
    ok('静态5: index.js 硬编码版本号清零');
}

/* ══════════ 6. await 语法健康（node --check 已过，此处断言回调 async 化） ══════════ */
{
    assert.ok(srcS.includes("reader.onload = async () => {"), 'onload async 化');
    assert.ok(srcS.includes("const apply = async (p) => {"), 'apply async 化');
    assert.ok(srcS.includes("#ls-clear').addEventListener('click', async () => {"), '清空回调 async 化');
    ok('静态6: 三处回调 async 化（await 合法）');
}

/* ══════════ 7. applyCarryover 调用语义（行为快验） ══════════ */
{
    // 从 index.js 抠 applyCarryover 验证携带包导入的字段兼容
    const start = srcI.indexOf('        applyCarryover(pack) {');
    const brace = srcI.indexOf('{', srcI.indexOf(')', start));
    const end = braceEndI(srcI, brace);
    const fnSrc = 'function ' + srcI.slice(start + 8, end + 1);
    const engine = {
        summary: { summaries: [], volumes: [] }, suspense: { import: (d) => { engine._sus = d; }, items: [] },
        timeline: { entries: [] }, graph: { import: () => {} }, pov: { import: () => {} },
        diary: { import: () => {} }, reflection: { import: () => {} }, scene: { import: () => {} },
        vector: { import: () => {} }, itemOps: [],
        bm25: { rebuild: () => {} }, config: { config: { bm25Enabled: false, debugMode: false, sceneEnabled: true, vectorEnabled: true } },
    };
    const fn = new Function('errLog', `return ${fnSrc}`)(() => {});
    fn.call(engine, {
        summaries: [{ floor: 1, text: 's1' }],
        itemOps: [{ floor: 1, fp: 'x', action: 'add', name: '剑' }],
    });
    assert.equal(engine.summary.summaries.length, 1);
    assert.equal(engine.itemOps.length, 1);
    assert.equal(engine.itemOps[0].carried, true, 'carryover ops 标 carried');
    ok('行为1: applyCarryover 携带包导入语义正常');
}

// 供断言7使用的提取器
function braceEndI(s, open) {
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

console.log(`\n✓ v3.11 保存块统一测试全过 (${pass} 项)`);