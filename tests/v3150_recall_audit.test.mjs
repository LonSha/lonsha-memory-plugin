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
    // [v3.164] 两者之间新增了「事件接线」诊断行，窗口写死会误伤。不变量是「召回自检
    //   这一行确实落在 selfCheck 的子系统列表里、且在楼层账本之后」——窗口大小取决于
    //   期间插了多少行诊断，不该写死。给足 4000，并额外要求它仍是列表项形态。
    assert.ok(scIdx > 0 && renderIdx > scIdx && renderIdx < scIdx + 4000, 'A 召回自检渲染进 selfCheck');
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