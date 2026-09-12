// tests/chaos_resilience.test.mjs
// LonSha 记忆引擎混沌测试与极端环境韧性验证
// 覆盖：悬挂边与脏数据自愈、并发竞态护盾、畸形持久化数据容错、长线增删内存泄漏
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (msg) => { pass++; console.log('✓ ' + msg); };
const bad = (msg) => { fail++; console.log('✗ ' + msg); };

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
function extractClass(name) {
    const start = src.indexOf(`class ${name} {`);
    if (start < 0) throw new Error('missing class ' + name);
    const brace = src.indexOf('{', start);
    return src.slice(start, braceEnd(src, brace) + 1);
}

const normFn = (n) => String(n || '').normalize('NFKC').replace(/\s+/g, '').trim().toLowerCase();
const errLog = (e, ctx) => { /* 静默捕获用于韧性验证 */ };

const conflictDef = `
const RELATION_CONFLICT_GROUPS = [
    new Set(['陌生', '相识', '友好', '暧昧', '暗恋', '热恋', '恋人', '夫妻', '冷战', '决裂', '陌路']),
    new Set(['盟友', '同行', '中立', '对立', '敌对', '宿敌', '仇敌', '背叛'])
];
function areLabelsInConflict(l1, l2) {
    if (!l1 || !l2 || l1 === l2) return false;
    for (const group of RELATION_CONFLICT_GROUPS) {
        if (group.has(l1) && group.has(l2)) return true;
    }
    const p1 = '\${l1}-\${l2}';
    if (/恋人-决裂|决裂-恋人|友好-敌对|敌对-友好|盟友-宿敌|宿敌-盟友/i.test(p1)) return true;
    return false;
}
`;

const graphSrc = extractClass('MemoryGraph');
const mkGraph = () => new Function('normalizeCharName', 'errLog', `
    ${conflictDef}
    ${graphSrc}
    return new MemoryGraph();
`)(normFn, errLog);

const summarySrc = extractClass('SummarySystem');
const mkSummary = () => new Function('errLog', `
    ${summarySrc}
    return new SummarySystem();
`)(errLog);

console.log('=== [CHAOS SCENARIO 1] 悬挂边 (Dangling Edges) 与损坏外键容错 ===');
{
    const g = mkGraph();
    const idA = g.addNode({ name: '真实角色A', type: 'character' });
    // 故意注入指向虚无 ID 的边（模拟 JSON 数据损坏或节点被孤立删除）
    g.addEdge({ from: idA, to: 'non_existent_uuid_xyz', relation: '暗恋', validFrom: 1 });
    g.addEdge({ from: 'ghost_node_123', to: idA, relation: '敌对', validFrom: 1 });
    assert.equal(g.edges.size, 2);
    
    // 验证：在导出与重新导入时，是否能自愈或安全处理，不报 TypeError
    try {
        const exported = g.export();
        const g2 = mkGraph();
        g2.import(exported);
        ok('场景1.1: 存在悬挂边时 export/import 不崩溃');
    } catch (e) {
        bad('场景1.1: 存在悬挂边时崩溃: ' + e.message);
    }
}

console.log('=== [CHAOS SCENARIO 2] 畸形总结与脏数据防御 ===');
{
    const s = mkSummary();
    // 注入脏数据：null、空对象、缺少关键字段、无效楼层
    try {
        await s.createSummary(null, null);
        await s.createSummary({ floor: NaN, mes: '无有效楼层总结' }, null);
        await s.createSummary({ index: 'invalid_index', mes: null }, null);
        await s.createSummary({ index: 20, mes: '正常总结内容' }, 'LLM提炼内容');
        ok('场景2.1: 注入极端脏数据与空消息，createSummary 安全容错未崩溃');
    } catch (e) {
        bad('场景2.1: 注入脏数据直接崩溃: ' + e.message);
    }

    try {
        s.markDormant(50, 30);
        ok('场景2.2: 脏数据下执行 markDormant 休眠标记未崩溃');
    } catch (e) {
        bad('场景2.2: markDormant 崩溃: ' + e.message);
    }

    try {
        s.awakenByEntities(['测试实体', null, undefined]);
        ok('场景2.3: 包含 null/undefined 实体列表执行 awakenByEntities 未崩溃');
    } catch (e) {
        bad('场景2.3: awakenByEntities 崩溃: ' + e.message);
    }
}

console.log('=== [CHAOS SCENARIO 3] 500 轮高频快照/回滚长线内存压力测试 ===');
{
    const g = mkGraph();
    // 模拟 500 轮交互，每轮都拍快照，并高频 truncateGraphFrom 模拟滑卡
    for (let f = 1; f <= 500; f++) {
        g.addNode({ name: `轮次_${f}`, type: 'character', floor: f });
        g.snapshotGraph(f);
        if (f % 5 === 0) {
            // 模拟滑卡回滚到 2 楼之前，再推进
            g.truncateGraphFrom(f - 2);
        }
    }
    // 验证快照队列是否被严格限制在 SNAP_MAX (6 张)，防止内存泄漏
    assert.ok(g._snapshots.length <= 6, `快照堆积泄漏: 当前快照数 ${g._snapshots.length} > 6`);
    ok(`场景3.1: 500 轮交互后快照队列严格维持在 ${g._snapshots.length} 张 (上限 6)，无内存堆积`);
}

console.log(`\n[CHAOS TESTS SUMMARY] Pass: ${pass}, Fail: ${fail}`);
assert.equal(fail, 0, '混沌极端环境测试存在失败项！');
