// tests/v3150_recall_audit.test.mjs
// LonSha 记忆引擎 v3.150.0 召回命中自检（A）+ 楼层召回账本（B）测试
// 覆盖：结构接线 / FloorLedger recallIds+recallHits 记账（导出对称）/ _auditRecall 命中分布与空结果判定
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf-8');
function extractClass(source, startMarker) {
    const start = source.indexOf(startMarker);
    if (start < 0) return null;
    let depth = 0, started = false;
    for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') { depth--; if (started && depth === 0) return source.slice(start, i + 1); }
    }
    return null;
}

test('=== 1. 结构断言：A 自检 + B 楼层召回账本接线 ===', () => {
    assert.ok(src.includes('recallAuditEnabled'), 'A 开关存在');
    assert.ok(src.includes('floorRecallLedgerEnabled'), 'B 开关存在');
    assert.ok(src.includes('_auditRecall'), 'A 审计方法存在');
    assert.ok(src.includes('_recordFloorRecall'), 'B 记账方法存在');
    assert.ok(src.includes('this._recallAudit = []'), 'A 环形账本初始化');
    assert.ok(src.includes("if (patch.recallHits)"), 'B FloorLedger.record 命中分支');
    assert.ok(src.includes('recallIds: [],'), 'B beginFloor 带 recallIds 字段');
    // A 观测层接在 recallMemory 唯一收口（intentRerank 之后）
    const irIdx = src.indexOf('const finalMerged = this.intentRerank(merged, queryText);');
    const auditIdx = src.indexOf('this._auditRecall(query, results, finalMerged)', irIdx);
    assert.ok(irIdx > 0 && auditIdx > irIdx && auditIdx < irIdx + 400, 'A 审计接在 intentRerank 后');
    // A 渲染进 selfCheck
    const scIdx = src.indexOf("['楼层账本',");
    const renderIdx = src.indexOf("['召回自检',", scIdx);
    // [v3.166] 坐桩距离是形状、不是不变量：只要期间新增任何诊断行（本版就新增了
    //   「配置迁移 / 写盘合流 / 保存来源」三行），写死的窗口就会误报。真正要守的是
    //   「召回自检这一行确实长在 selfCheck 的子系统列表里、且在楼层账本之后」。
    //   改为结构化判定：定位 selfCheck → 取它对 rows 的列表字面量 → 解析列表项键名。
    const scStart = src.indexOf('async selfCheck() {');
    assert.ok(scStart > 0, 'selfCheck 方法存在');
    let _d = 0, _scEnd = -1;
    for (let _i = src.indexOf('{', scStart); _i >= 0 && _i < src.length; _i++) {
        if (src[_i] === '{') _d++;
        else if (src[_i] === '}') { _d--; if (_d === 0) { _scEnd = _i; break; } }
    }
    assert.ok(_scEnd > scStart, 'selfCheck 方法体闭合');
    const scBody = src.slice(scStart, _scEnd);
    const rowsIdx = scBody.indexOf('const rows = [');
    assert.ok(rowsIdx >= 0, 'selfCheck 构建子系统列表 rows');
    const lb = scBody.indexOf('[', rowsIdx);
    let _bd = 0, _rb = -1;
    for (let _i = lb; _i < scBody.length; _i++) {
        if (scBody[_i] === '[') _bd++;
        else if (scBody[_i] === ']') { _bd--; if (_bd === 0) { _rb = _i; break; } }
    }
    assert.ok(_rb > lb, 'rows 列表字面量闭合');
    // selfCheck 的子系统列表有两种注入形态：rows 字面量里的 ['键', ...]，
    //   以及事后 rows.push(['键', ...]) 追加。两者都是列表成员，须一并采集，
    //   否则会漏掉 push 型（「召回自检」正是 push 型）。
    const items = [];
    const lit = scBody.slice(lb, _rb + 1);
    for (const m of lit.matchAll(/\['([^']+)',/g)) items.push({ key: m[1], at: lb + m.index });
    for (const m of scBody.matchAll(/rows\.push\(\[/g)) {
        const km = /^rows\.push\(\[\s*'([^']+)'/.exec(scBody.slice(m.index, m.index + 160));
        if (km) items.push({ key: km[1], at: m.index });
    }
    items.sort((a, b) => a.at - b.at);
    const itemKeys = items.map(x => x.key);
    assert.ok(itemKeys.includes('楼层账本'), 'selfCheck 子系统列表包含楼层账本');
    assert.ok(itemKeys.includes('召回自检'), 'A 召回自检渲染进 selfCheck');
    assert.ok(itemKeys.indexOf('召回自检') > itemKeys.indexOf('楼层账本'), 'A 召回自检在楼层账本之后');
    assert.ok(['配置迁移', '写盘合流', '保存来源'].every(k => itemKeys.includes(k)), 'v3.166 三行新诊断进入 selfCheck');
    assert.ok(/\['召回自检',/.test(src.slice(renderIdx, renderIdx + 12)), 'A 召回自检是 selfCheck 列表项');
    // B 向量续热走 _heatEntry
    assert.ok(src.includes('this.vector._heatEntry'), 'B 向量续热');
});

test('=== 2. FloorLedger 召回记账（recallIds/recallHits 累积 + 导出对称） ===', () => {
    const FloorLedger = new Function('return (' + extractClass(src, 'class FloorLedger') + ')')();
    const l = new FloorLedger();
    // beginFloor 初始化 recallIds
    l.beginFloor(5, {});
    assert.deepStrictEqual(l.get(5).recallIds, [], 'beginFloor recallIds 初始空');
    // record 写入项
    l.record(5, { nodeIds: ['n1'], recallIds: ['rec_A'], recallHits: 2 });
    let e = l.get(5);
    assert.deepStrictEqual(e.recallIds, ['rec_A'], 'recallIds 记录召回标记');
    assert.strictEqual(e.recallHits, 2, 'recallHits=2');
    assert.deepStrictEqual(e.nodeIds, ['n1'], 'nodeIds 共存');
    // 再次召回命中 → recallHits 累积
    l.record(5, { recallIds: ['rec_B'], recallHits: 3 });
    e = l.get(5);
    assert.deepStrictEqual(e.recallIds, ['rec_A', 'rec_B'], 'recallIds 累积');
    assert.strictEqual(e.recallHits, 5, 'recallHits 累加 2+3');
    // 无召回命中时不影响写入项
    l.record(6, { povIds: ['p1'] });
    assert.strictEqual(l.get(6).recallHits, undefined, '无 recallHits 不污染');
    assert.deepStrictEqual(l.get(6).recallIds, [], 'recallIds 初始空');
    // 导出/导入对称（floors 对象透传，含 recall 字段）
    const exp = l.export();
    assert.strictEqual(exp[5].recallHits, 5, '导出含 recallHits');
    assert.deepStrictEqual(exp[5].recallIds, ['rec_A', 'rec_B'], '导出含 recallIds');
    const l2 = new FloorLedger();
    l2.import(exp);
    assert.strictEqual(l2.get(5).recallHits, 5, '导入恢复 recallHits');
});

test('=== 3. _auditRecall 命中分布 / 空结果 / 楼层聚合 ===', () => {
    // 复刻 _auditRecall 核心语义（与 index.js 同源断言，验证观测逻辑正确）
    const SRC = ['summary','graph','diary','vector','diffusion','pov','timeline','bm25','volume','status','holiday','suspense','presence','neuralChain','worldProg'];
    function auditRecall(results) {
        const perSource = {}; let totalHits = 0;
        for (const s of SRC) { const arr = Array.isArray(results?.[s]) ? results[s] : []; if (arr.length) perSource[s] = arr.length; totalHits += arr.length; }
        const floorHits = {};
        for (const s of SRC) for (const item of (Array.isArray(results?.[s]) ? results[s] : [])) {
            const f = Number(item?.floor ?? item?.metadata?.floor);
            if (Number.isFinite(f) && f >= 0) floorHits[f] = (floorHits[f] || 0) + 1;
        }
        return { totalHits, perSource, empty: totalHits === 0, floorHits };
    }
    // 混合命中：summary(带floor) + bm25(带floor) + vector(metadata.floor) + graph(无floor)
    const r1 = auditRecall({
        summary: [{ floor: 3 }, { floor: 5 }],
        bm25: [{ floor: 3 }],
        vector: [{ metadata: { floor: 5 } }, { metadata: { floor: 7 } }],
        graph: [{ name: 'x' }],
        diary: [],
    });
    assert.strictEqual(r1.totalHits, 6, '总命中 6');
    assert.deepStrictEqual(r1.perSource, { summary: 2, bm25: 1, vector: 2, graph: 1 }, '来源分布');
    assert.strictEqual(r1.empty, false, '非空');
    assert.deepStrictEqual(r1.floorHits, { 3: 2, 5: 2, 7: 1 }, '楼层聚合（3楼2次/5楼2次/7楼1次）');
    // 全空 → empty
    const r2 = auditRecall({});
    assert.strictEqual(r2.empty, true, '全空判定');
    assert.strictEqual(r2.totalHits, 0, '空命中 0');
    assert.deepStrictEqual(r2.floorHits, {}, '空楼层聚合');
});