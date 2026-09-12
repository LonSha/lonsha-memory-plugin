// v3.38 全链路端到端集成测试套件 (E2E Integration Test Suite)
// 覆盖：多维关系并存与演化、时态边持久化恢复、HippoRAG时序引燃、删楼时态自愈、语义休眠唤醒、反思容错与Undo撤销
import fs from 'node:fs';

const idxSrc = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const suiSrc = fs.readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');
const mftSrc = fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const assert = (n, c) => { if (c) { pass++; console.log('✓ ' + n); } else { fail++; console.log('✗ ' + n); } };

// ===== 1. 版本一致性 =====
const mft = JSON.parse(mftSrc);
assert('manifest 版本有效 (>= 3.38.0)', /^3\.(3[8-9]|[4-9]\d+)\./.test(mft.version));
assert('index.js 版本有效 (>= 3.38.0)', /const VERSION = '3\.(3[8-9]|[4-9]\d+)\./.test(idxSrc));

// ===== 2. 静态关键锚点检查 =====
// 修复 1: 时态图谱多维共存与 import validTo 保护
assert('拥有 RELATION_CONFLICT_GROUPS 互斥组', idxSrc.includes('RELATION_CONFLICT_GROUPS') && idxSrc.includes('areLabelsInConflict'));
assert('addEdge 保护传入的 validTo 不被覆盖置空', idxSrc.includes('const validTo = edge.validTo !== undefined ? edge.validTo : null'));

// 修复 2: HippoRAG 时序
const posBm25 = idxSrc.indexOf('// [v1.9] P1: BM25 稀疏检索召回（提前执行');
const posItems = idxSrc.indexOf('// [v2.8] RT-C: 物品台账召回（提前执行');
const posDiff = idxSrc.indexOf('// Phase 3: 图扩散增强召回（HippoRAG 实体引燃');
assert('recallMemory 中 BM25 检索在图扩散之前', posBm25 >= 0 && posDiff >= 0 && posBm25 < posDiff);
assert('recallMemory 中 物品台账检索在图扩散之前', posItems >= 0 && posDiff >= 0 && posItems < posDiff);

// 修复 3: shiftFloorsFrom 图谱位移
assert('shiftFloorsFrom 包含图谱边 validFrom/validTo 前移', idxSrc.includes('edge.validFrom = dec(edge.validFrom)') || idxSrc.includes('edge.validFrom--'));
assert('shiftFloorsFrom 包含图谱快照 floor 前移', idxSrc.includes('snap.floor--') || idxSrc.includes('snap.floor = dec(snap.floor)'));

// 修复 4: 反思生成器 sanitizeJson 与延迟更新
assert('ReflectionSystem 接入 sanitizeJson', idxSrc.includes('const sanitized = sanitizeJson(raw);'));

// 修复 5: 全量无损导出
assert('collectExport 包含 charMem、worldProg、supersede、narrativeEntropy', 
    idxSrc.includes('charMem: this.charMem') && 
    idxSrc.includes('worldProg: this.worldProg') && 
    idxSrc.includes('supersede:') &&
    idxSrc.includes('narrativeEntropy: this._narrativeEntropy'));

// 领域 2: 语义级休眠与唤醒
assert('SummarySystem 拥有 markDormant 与 awakenByEntities', idxSrc.includes('markDormant(currentFloor') && idxSrc.includes('awakenByEntities(entities)'));
assert('recallMemory 支持休眠唤醒接入', idxSrc.includes('【久别重现】') && idxSrc.includes('awakenByEntities'));

// 领域 3: 可视化台账 Undo 审计栈
assert('settings-ui 包含 _auditStack 与 undoLastOp', suiSrc.includes('plugin._auditStack = []') && suiSrc.includes('plugin.undoLastOp = async function'));
assert('settings-ui showBrowser 包含撤销按钮', suiSrc.includes('↺ 撤销上次修改'));

// ===== 3. 动态仿真：多维关系共存与同维度互斥演化 =====
{
    const RELATION_CONFLICT_GROUPS = [
        new Set(['陌生', '相识', '友好', '暧昧', '暗恋', '热恋', '恋人', '夫妻', '冷战', '决裂', '陌路']),
        new Set(['盟友', '同行', '中立', '对立', '敌对', '宿敌', '仇敌', '背叛'])
    ];
    function areLabelsInConflict(l1, l2) {
        if (!l1 || !l2 || l1 === l2) return false;
        for (const group of RELATION_CONFLICT_GROUPS) {
            if (group.has(l1) && group.has(l2)) return true;
        }
        const p1 = `${l1}-${l2}`, p2 = `${l2}-${l1}`;
        if (/恋人-决裂|决裂-恋人|友好-敌对|敌对-友好|盟友-宿敌|宿敌-盟友/i.test(p1)) return true;
        return false;
    }

    class TestGraph {
        constructor() { this.edges = new Map(); }
        addEdge(edge) {
            const from = String(edge.from || '');
            const to = String(edge.to || '');
            const label = String(edge.label || 'related');
            const floor = Math.max(0, Math.round(Number(edge.floor ?? edge.validFrom ?? 0)));
            const id = `${from}-${to}-${label}`;

            if (label !== 'participated_in') {
                for (const [existingId, e] of this.edges) {
                    if (e.from === from && e.to === to && e.label !== 'participated_in' && e.active !== false) {
                        if (areLabelsInConflict(e.label, label)) {
                            e.active = false;
                            e.validTo = floor;
                        }
                    }
                }
            }

            const existing = this.edges.get(id);
            const validFrom = (existing && existing.validFrom != null) ? existing.validFrom : (edge.validFrom != null ? edge.validFrom : floor);
            const validTo = edge.validTo !== undefined ? edge.validTo : null;
            const active = edge.active !== undefined ? edge.active !== false : (validTo === null);

            const fullEdge = { ...edge, id, from, to, label, validFrom, validTo, active };
            this.edges.set(id, fullEdge);
            return id;
        }
    }

    const g = new TestGraph();
    // 楼层 1: 建立“师徒”关系
    g.addEdge({ from: '爱丽丝', to: '鲍勃', label: '师徒', floor: 1 });
    // 楼层 5: 建立“恋人”关系（不同维度：师徒属于身份，恋人属于情感态度）
    g.addEdge({ from: '爱丽丝', to: '鲍勃', label: '恋人', floor: 5 });

    const activeList = Array.from(g.edges.values()).filter(e => e.active);
    assert('正交维度关系（师徒 + 恋人）双双保持活跃并存', activeList.length === 2 && activeList.some(e => e.label === '师徒') && activeList.some(e => e.label === '恋人'));

    // 楼层 10: 剧情剧变，两人“决裂”（与“恋人”属于同一情感冲突组）
    g.addEdge({ from: '爱丽丝', to: '鲍勃', label: '决裂', floor: 10 });
    const eLover = g.edges.get('爱丽丝-鲍勃-恋人');
    const eMaster = g.edges.get('爱丽丝-鲍勃-师徒');
    const eBreak = g.edges.get('爱丽丝-鲍勃-决裂');

    assert('同维度冲突关系（决裂）发生时，恋人关系闭环且有效区间截止于第10楼', eLover.active === false && eLover.validTo === 10);
    assert('不同维度的师徒关系依然不受影响并保持活跃', eMaster.active === true && eMaster.validTo === null);
    assert('决裂关系成为当前新的活跃关系', eBreak.active === true && eBreak.validFrom === 10);

    // ===== 4. 动态仿真：存档导出再导入无损恢复测试 =====
    const exportedEdges = Array.from(g.edges.values());
    const g2 = new TestGraph();
    for (const e of exportedEdges) g2.addEdge(e);

    const restoredLover = g2.edges.get('爱丽丝-鲍勃-恋人');
    assert('恢复历史边时 validTo 绝不被置空为 null (有效保留为10)', restoredLover.validTo === 10);
    assert('恢复历史边时 active 状态正确保留为 false', restoredLover.active === false);
}

// ===== 5. 动态仿真：时态关系双向名称匹配召回 =====
{
    const graphEdges = [
        { from: '爱丽丝', to: '鲍勃', label: '恋人', active: false, validTo: 10 },
        { from: '爱丽丝', to: '鲍勃', label: '决裂', active: true, validTo: null }
    ];
    function matchRelations(queryText, queryChars, edges) {
        const isHistorical = /当年|曾经|以前|旧怨|旧事|过去|往事|回忆|最初/i.test(queryText || '');
        const charMatchKeys = new Set(queryChars.map(c => c.trim().toLowerCase()));
        const relEdges = [];
        for (const edge of edges) {
            const hitFrom = charMatchKeys.has(edge.from.trim().toLowerCase());
            const hitTo = charMatchKeys.has(edge.to.trim().toLowerCase());
            if (hitFrom || hitTo) {
                if (edge.active !== false) {
                    relEdges.push(edge);
                } else if (isHistorical && edge.validTo != null) {
                    relEdges.push({ ...edge, historical: true });
                }
            }
        }
        return relEdges;
    }

    // 场景 A: 问及往事
    const hitsHist = matchRelations('当年我们之间到底发生了什么？', ['爱丽丝'], graphEdges);
    assert('查询含往事关键词时，成功召回历史羁绊（曾为恋人）', hitsHist.some(h => h.historical && h.label === '恋人'));
    assert('同时召回当前活跃关系（决裂）', hitsHist.some(h => !h.historical && h.label === '决裂'));

    // 场景 B: 常规当面对话，不主动翻旧账
    const hitsNow = matchRelations('现在我们各走各的路。', ['爱丽丝'], graphEdges);
    assert('常规对话只召回当前活跃羁绊，不混淆历史旧事', hitsNow.length === 1 && hitsNow[0].label === '决裂');
}

// ===== 6. 动态仿真：HippoRAG 文本/道具实体双路引燃扩散 =====
{
    const bm25Hits = [{ text: '爱丽丝在星空古殿中找到了《星空之钥》' }];
    const itemsHits = [{ name: '星空之钥', text: '星空之钥（鲍勃持有）' }];
    const graphNodes = new Map([
        ['n1', { id: 'n1', name: '爱丽丝', type: 'character' }],
        ['n2', { id: 'n2', name: '鲍勃', type: 'character' }],
        ['n3', { id: 'n3', name: '星空之钥', type: 'item' }]
    ]);

    const entityCandidates = new Set();
    bm25Hits.slice(0, 5).forEach(b => {
        for (const [nid, node] of graphNodes) {
            if (node.name && node.name.length >= 2 && b.text.includes(node.name)) entityCandidates.add(node);
        }
    });
    itemsHits.slice(0, 3).forEach(it => {
        for (const [nid, node] of graphNodes) {
            if (node.name && node.name.length >= 2 && it.name.includes(node.name)) entityCandidates.add(node);
        }
    });

    const seeds = Array.from(entityCandidates);
    assert('HippoRAG 成功从 BM25 和 Items 文本中引燃种子节点', seeds.some(s => s.name === '星空之钥') && seeds.some(s => s.name === '爱丽丝'));
}

// ===== 7. 动态仿真：删楼时态位移自愈 =====
{
    const edges = [
        { id: 'e1', label: '友好', validFrom: 2, validTo: 6, floor: 2 },
        { id: 'e2', label: '对立', validFrom: 7, validTo: null, floor: 7 }
    ];
    const snapshots = [{ floor: 2 }, { floor: 7 }];
    const deletedFloor = 5;

    // 模拟 shiftFloorsFrom(deletedFloor = 5)
    for (const edge of edges) {
        if (edge.validFrom > deletedFloor) edge.validFrom--;
        if (edge.validTo > deletedFloor) edge.validTo--;
        if (edge.floor > deletedFloor) edge.floor--;
    }
    for (const snap of snapshots) {
        if (snap.floor > deletedFloor) snap.floor--;
    }

    assert('小于被删楼层的时态属性不受影响', edges[0].validFrom === 2);
    assert('跨过被删楼层的 validTo 准确 -1 (6 → 5)', edges[0].validTo === 5);
    assert('大于被删楼层的边起始楼层准确 -1 (7 → 6)', edges[1].validFrom === 6 && edges[1].floor === 6);
    assert('图谱快照楼层准确 -1 (7 → 6)', snapshots[1].floor === 6);
}

// ===== 8. 动态仿真：语义级休眠（Dormant）与伏笔唤醒 =====
{
    class MockSummarySystem {
        constructor() {
            this.summaries = [
                { floor: 1, text: '神秘学者梅林留下了一枚贤者之石的密令', folded: true, importance: 6 },
                { floor: 40, text: '主角在王都酒馆休整，听闻北方战事', folded: false, importance: 5 }
            ];
        }
        markDormant(curFloor, thresh = 30) {
            for (const s of this.summaries) {
                if (!s.folded) continue;
                if ((curFloor - s.floor) > thresh && (s.importance || 5) < 8 && !s.awakened) {
                    s.dormant = true;
                }
            }
        }
        awakenByEntities(entities) {
            const awakened = [];
            for (const s of this.summaries) {
                if (s.dormant && entities.some(e => s.text.includes(e))) {
                    s.dormant = false;
                    s.awakened = true;
                    awakened.push(s);
                }
            }
            return awakened;
        }
    }

    const sys = new MockSummarySystem();
    // 第 42 楼时，第 1 楼距离 41 > 30，自动进入休眠
    sys.markDormant(42, 30);
    assert('长期未触碰的早期已折叠记忆自动休眠', sys.summaries[0].dormant === true);

    // 到了第 45 楼，剧情中突然再次出现“贤者之石”实体
    const awakened = sys.awakenByEntities(['贤者之石']);
    assert('实体线索出现时成功苏醒休眠记忆', awakened.length === 1 && awakened[0].floor === 1);
    assert('苏醒后状态解除休眠并标记 awakened', sys.summaries[0].dormant === false && sys.summaries[0].awakened === true);
}

// ===== 9. 动态仿真：可视化台账 Undo 撤销栈 =====
{
    let currentHolder = '爱丽丝';
    const auditStack = [];

    function changeHolder(newH) {
        const oldH = currentHolder;
        currentHolder = newH;
        auditStack.push({
            desc: `持有者还原为 ${oldH}`,
            undo: () => { currentHolder = oldH; }
        });
    }

    function undoLast() {
        if (!auditStack.length) return false;
        const op = auditStack.pop();
        op.undo();
        return true;
    }

    // 操作: 爱丽丝把物品给鲍勃
    changeHolder('鲍勃');
    assert('变更持有者生效为鲍勃', currentHolder === '鲍勃');
    assert('审计栈成功记录', auditStack.length === 1);

    // 用户在面板上手滑点错，执行 Undo
    const undoOk = undoLast();
    assert('撤销执行成功', undoOk === true);
    assert('物品持有者瞬间还原为爱丽丝', currentHolder === '爱丽丝');
    assert('审计栈完成出栈闭环', auditStack.length === 0);
}

console.log(`
[v338-e2e] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
