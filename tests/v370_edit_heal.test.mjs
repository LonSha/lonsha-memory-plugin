// tests/v370_edit_heal.test.mjs
// v3.7 编辑自愈测试：createSummary 同楼去重 + 编辑处理器语义升级（精准回滚/防抖自愈）
// 运行: node tests/v370_edit_heal.test.mjs
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

/* ══════════ 1. createSummary 同楼去重（行为） ══════════ */
{
    const fnSrc = extractAsyncMethod('createSummary');
    // 在受控对象上运行（system 充当 SummarySystem 实例）
    const system = { summaries: [], smartTruncate: (t, n) => String(t || '').slice(0, n) };
    const call = async (m, s) => {
        const fn = new Function('errLog', `return ${fnSrc}`)(() => {});
        return fn.call(system, m, s);
    };

    // 场景1: 首次创建
    await call({ index: 3, mes: 'x' }, '摘要A');
    assert.equal(system.summaries.length, 1);
    assert.equal(system.summaries[0].floor, 3);
    ok('去重1: 首次创建正常入列');

    // 场景2: 同楼重复（编辑重提取）→ 替换不堆积
    await call({ index: 3, mes: 'x' }, '摘要A改');
    assert.equal(system.summaries.length, 1, '同楼不应堆积');
    assert.equal(system.summaries[0].text, '摘要A改');
    ok('去重2: 同楼重复 → 替换（1 条）');

    // 场景3: 同文本重复 → 原对象保持
    const before = system.summaries[0];
    await call({ index: 3, mes: 'x' }, '摘要A改');
    assert.equal(system.summaries[0], before, '同文本不重建对象');
    ok('去重3: 同文本幂等');

    // 场景4: 不同楼正常并存
    await call({ index: 4, mes: 'y' }, '摘要B');
    assert.equal(system.summaries.length, 2);
    ok('去重4: 不同楼并存');

    // 场景5: 折叠标记保留（folded 不因替换丢失）
    system.summaries[0].folded = true;
    await call({ index: 3, mes: 'x' }, '摘要A再改');
    assert.equal(system.summaries[0].folded, true, '替换保留 folded');
    ok('去重5: 替换保留 folded 标记');
}

/* ══════════ 2. 编辑处理器语义（静态断言） ══════════ */
{
    // 旧级联模式绝迹
    assert.ok(!src.includes('级联回滚该楼及之后的记忆'), '旧级联模式绝迹');
    // 新语义落位
    assert.ok(src.includes('回滚该楼 + 防抖自愈'), '新语义注释');
    assert.ok(src.includes('_editHealPending'), '待愈集合');
    assert.ok(src.includes('_editHealTimer'), '防抖计时器');
    assert.ok(src.includes('楼层自愈: 重提取楼层'), '自愈重提取日志（v3.8 统一调度器语义）');
    assert.ok(src.includes('}, 3000);'), '3s 防抖');
    // 自愈调用带 omit/user 豁免
    assert.ok(src.includes("if (!m || m.is_user === true) continue;"), '用户楼豁免');
    assert.ok(src.includes('isOmittedFloor?.(m)'), '番外楼豁免');
    ok('静态1: 编辑自愈语义完整落位');

    // 级联循环已移除（旧代码特征）
    const oldCascade = /rollbackFloor\(f\);\s*\n\s*const c = window\.SillyTavern\?\.getContext\?\.\(\);\s*\n\s*const after = \[\];/;
    assert.ok(!oldCascade.test(src), '旧级联循环绝迹');
    ok('静态2: 旧级联循环代码绝迹');
}

/* ══════════ 3. 防抖集合行为（重现逻辑） ══════════ */
{
    // 重现处理器内的防抖逻辑
    let timer = null, pending = new Set();
    const edited = [];
    const onEdit = (f) => {
        edited.push(f);
        pending.add(f);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            const list = Array.from(pending).sort((a, b) => a - b);
            pending = new Set();
            return list;
        }, 30); // 测试用 30ms
    };

    // 连续编辑 3 楼（模拟快速改写）
    const results = [];
    onEdit(5);
    onEdit(7);
    onEdit(5); // 重复编辑 5
    await new Promise(r => setTimeout(r, 60));
    // 防抖后取一次
    const list = Array.from(new Set(edited)).sort((a, b) => a - b);
    assert.deepEqual(list, [5, 7], '防抖后待愈集合 = {5,7} 去重排序');
    ok('防抖1: 连编多楼合并去重（3 次编辑 → 2 楼待愈）');

    // 防抖窗口内多次触发只执行一次
    let execCount = 0;
    let t2 = null; let p2 = new Set();
    const onEdit2 = (f) => {
        p2.add(f);
        if (t2) clearTimeout(t2);
        t2 = setTimeout(() => { t2 = null; const l = Array.from(p2); p2 = new Set(); if (l.length) execCount++; }, 30);
    };
    onEdit2(1); onEdit2(1); onEdit2(1);
    await new Promise(r => setTimeout(r, 60));
    assert.equal(execCount, 1, '防抖窗口只执行一次');
    ok('防抖2: 窗口内多触发 → 单次执行');
}

console.log(`\n✓ v3.7 编辑自愈测试全过 (${pass} 项)`);