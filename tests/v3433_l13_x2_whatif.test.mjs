// tests/v3433_l13_x2_whatif.test.mjs — [v3.433.0 · L13-X2] 反事实推演面判据
//
// 主题：如果一件事没发生，谁会被波及（Proposal L13-X2 验收）
//   - 选一个已有事实，推演出「受影响 N 条」且每条都带真实 id（可点开核对）；
//   - 推演前后 worldProg 与记忆条目逐字不变（本条最重要的一条）；
//   - 推演结果标注 hypothetical: true，绝不写回任何槽位；
//   - 负控制：破坏 hypothetical 标注 / 影响面计算 / 让推演写回槽位 -> 判据必红；
//   - 回归守卫：settings-ui.js 必须可编译（v3.432 曾引入缺右括号致面板加载即炸）。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const readRoot = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const MODULE_SRC = readRoot('counterfactual-experiment-bench.js');
const DIAG_SRC = readRoot('engine-diagnostic-lines.js');
const HOST_SRC = readRoot('index.js');
const UI_SRC = readRoot('settings-ui.js');

function loadBenchInVM(src = MODULE_SRC) {
    const sandbox = { globalThis: {}, module: { exports: {} }, window: {} };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    return sandbox.module.exports && Object.keys(sandbox.module.exports).length
        ? sandbox.module.exports
        : sandbox.CounterfactualExperimentBench;
}

/* 模拟引擎：覆盖 cfCollectPools 的全部四类既有槽位
 *   fact / locked / node / memory。withMapGraph=true 时 graph.nodes 用
 *   Map 形态（与 index.js 的 _newCore('MemoryGraph') 同构），
 *   false 时用 Array 形态（可 JSON 全序列化，供逐字不变比对）。 */
function buildMockEngine(withMapGraph) {
    const nodes = withMapGraph
        ? new Map([['n_wy', { key: 'n_wy', name: '王英', type: 'person', data: { description: '本届冠军得主' } }]])
        : [{ id: 'n_wy', name: '王英', type: 'person', data: { description: '本届冠军得主' } }];
    return {
        worldProg: {
            facts: [
                { id: 'f_anchor', subject: '王英', predicate: '夺得', value: '冠军', type: 'event' },
                { id: 'f_related', subject: '王英', predicate: '失去', value: '资格', type: 'event' },
                { id: 'f_unrelated', subject: '张三', predicate: '购买', value: '马车', type: 'event' }
            ]
        },
        lockedFacts: [
            { id: 'lf_1', text: '王英的冠军成绩已录入县志' },
            { id: 'lf_2', text: '渡口每旬开放一次' }
        ],
        graph: { nodes },
        memories: {
            李四: { core: [{ id: 'cm_1', text: '王英赢了冠军，我输掉了全部赌注', floor: 3, ts: 100 }], recent: [] }
        }
    };
}

test('A: 基础输入校验与边界三态', () => {
    const CB = loadBenchInVM();
    assert.ok(CB, '模块成功装载');
    assert.equal(typeof CB.counterfactualImpact, 'function', 'counterfactualImpact 必须是函数');
    assert.equal(typeof CB.createExperimentBranch, 'function', '既有出口不回归');
    assert.equal(typeof CB.addExperimentOutcome, 'function', '既有出口不回归');

    // 1. 空假设必拒
    const empty = CB.counterfactualImpact('', {});
    assert.equal(empty.ok, false, '空假设必须 ok:false');
    assert.equal(empty.reason, 'hypothesis-required', '原因必须标明 hypothesis-required');
    assert.equal(empty.hypothetical, true, '拒绝形态也必须带 hypothetical 标注');
    assert.equal(empty.writesNothing, true, '必须只读');

    // 2. 不存在的锚点事实
    const notFound = CB.counterfactualImpact({ factId: 'fact_missing_404' }, { engine: buildMockEngine(false) });
    assert.equal(notFound.ok, false, '锚点不存在必须 ok:false');
    assert.equal(notFound.reason, 'fact-not-found', '原因标明 fact-not-found');
    assert.equal(notFound.hypothetical, true);

    // 3. 描述式假设（无 factId）也可推演
    const desc = CB.counterfactualImpact('假设 王英 没有夺冠', { engine: buildMockEngine(false) });
    assert.equal(desc.ok, true, '描述式假设（无 factId）应可推演');
    assert.equal(desc.factId, '', '描述式无锚点 id');
    assert.ok(desc.terms.includes('王英'), '描述式词项含主体名');
    assert.ok(Array.isArray(desc.affected) && desc.affected.length > 0, '描述式也能算出影响面');
});

test('B: 核心验收 —— 锚点推演受影响集合（含 Map 图节点池）', () => {
    const CB = loadBenchInVM();
    const eng = buildMockEngine(true); // Map 形态 graph.nodes
    const res = CB.counterfactualImpact({ factId: 'f_anchor' }, { engine: eng });

    assert.equal(res.ok, true, '推演成功');
    assert.equal(res.writesNothing, true, '全程只读');
    assert.equal(res.hypothetical, true, '根级 hypothetical: true');
    assert.equal(res.factId, 'f_anchor');
    assert.equal(res.matchedFact && res.matchedFact.id, 'f_anchor', '锚点事实命中');
    assert.ok(res.terms.includes('王英'), '锚点词项含主体名');

    const ids = res.affected.map(a => a.id);
    assert.ok(ids.includes('f_related'), '同主体事实进受影响集合');
    assert.ok(ids.includes('lf_1'), 'lockedFacts 命中（text 字段路径，v3.433 首版漏扫自纠的回归位）');
    assert.ok(ids.includes('n_wy'), '图节点命中（Map.values 分支）');
    assert.ok(ids.includes('cm_1'), '记忆条目命中（core 池）');
    assert.ok(!ids.includes('f_unrelated'), '无关事实不得混入');
    assert.ok(!ids.includes('f_anchor'), '锚点自身不算受影响');
    assert.equal(res.scannedCount >= 6, true, '扫描计数覆盖全部池条目');

    for (const a of res.affected) {
        assert.equal(a.hypothetical, true, '每条受影响条目带 hypothetical: true');
        assert.ok(typeof a.id === 'string' && a.id.length > 0, '每条都带真实 id（可点开核对）');
    }
    assert.equal(res.layers.FACT_BOUND, 2, '铁律层：f_related + lf_1');
    assert.equal(res.layers.PLAUSIBLE_DEDUCTION, 2, '推演层：n_wy + cm_1');
    // fact_bound 优先排序
    assert.equal(res.affected[0].layer, 'fact_bound', '铁律层排最前');
    assert.equal(res.affected[1].layer, 'fact_bound', '铁律层排最前');
});

test('C: 只读铁律 —— 推演前后 worldProg 与记忆条目逐字不变（本条最重要）', () => {
    const CB = loadBenchInVM();
    const eng = buildMockEngine(false); // Array 形态，可 JSON 全序列化
    const beforeAll = JSON.stringify(eng);
    const beforeWorld = JSON.stringify(eng.worldProg);
    const beforeMem = JSON.stringify(eng.memories);
    const beforeLocked = JSON.stringify(eng.lockedFacts);

    const res = CB.counterfactualImpact({ factId: 'f_anchor' }, { engine: eng });
    assert.equal(res.ok, true, '推演成功');

    assert.equal(JSON.stringify(eng.worldProg), beforeWorld, 'worldProg 逐字不变');
    assert.equal(JSON.stringify(eng.memories), beforeMem, '记忆条目逐字不变');
    assert.equal(JSON.stringify(eng.lockedFacts), beforeLocked, 'lockedFacts 逐字不变');
    assert.equal(JSON.stringify(eng), beforeAll, '引擎整体逐字不变（无任何槽位被写）');
});

test('D: 宿主与面板接线 —— index / engine-diagnostic-lines / settings-ui', () => {
    assert.match(HOST_SRC, /counterfactualWhatIf\(/, 'index.js 必须有 counterfactualWhatIf 转发桩');
    assert.match(HOST_SRC, /_counterfactualLine\(/, 'index.js 必须有 _counterfactualLine 转发桩');
    assert.match(DIAG_SRC, /function counterfactualWhatIf\(/, 'engine-diagnostic-lines 必须有实现');
    assert.match(DIAG_SRC, /function _counterfactualLine\(/, 'engine-diagnostic-lines 必须有状态行实现');
    assert.match(DIAG_SRC, /module-unavailable/, '宿主必须有模块缺席三态 module-unavailable');
    assert.match(DIAG_SRC, /未写回任何槽位/, '状态行必须言明未写回任何槽位');
    assert.match(UI_SRC, /data-view="whatif"/, '面板必须有 whatif 统计卡入口');
    assert.match(UI_SRC, /counterfactualWhatIf\(\{ factId \}\)/, '面板绑定必须走宿主只读口');
    assert.match(UI_SRC, /data-cf-ref=/, '受影响条目必须带可点开核对的 data-cf-ref');
});

test('E: 语法回归守卫 —— 四文件必须可编译（v3.432 settings-ui 缺右括号致面板加载即炸）', () => {
    const files = [
        ['counterfactual-experiment-bench.js', MODULE_SRC],
        ['engine-diagnostic-lines.js', DIAG_SRC],
        ['index.js', HOST_SRC],
        ['settings-ui.js', UI_SRC]
    ];
    for (const [rel, s] of files) {
        assert.doesNotThrow(() => new vm.Script(s, { filename: rel }), rel + ' 必须可编译（经典 <script> 注入不被 node --test 覆盖，必须专项守卫）');
    }
});

test('F: 负控制① —— 破坏 hypothetical 标注必翻红', () => {
    const broken = breakSource(
        MODULE_SRC,
        "ok: false, reason: '', hypothetical: true, writesNothing: true,",
        "ok: false, reason: '', hypothetical: false, writesNothing: true,",
        'L13-X2-破坏hypothetical标注'
    );
    const CB = loadBenchInVM(broken);
    const res = CB.counterfactualImpact({ factId: 'f_anchor' }, { engine: buildMockEngine(false) });
    assert.throws(() => {
        // 原版断言（B 段同款）：根级 hypothetical: true
        assert.equal(res.hypothetical, true, '根级 hypothetical: true');
    }, assert.AssertionError, '破坏标注后，原版断言必须翻红');
});

test('G: 负控制② —— 让推演写回槽位必翻红（只读铁律的证伪面）', () => {
    const broken = breakSource(
        MODULE_SRC,
        'base.poolsScanned++;',
        "eng._cfLeak = 'poison'; base.poolsScanned++;",
        'L13-X2-让推演写回槽位'
    );
    const CB = loadBenchInVM(broken);
    const eng = buildMockEngine(false);
    const before = JSON.stringify(eng);
    const res = CB.counterfactualImpact({ factId: 'f_anchor' }, { engine: eng });
    assert.equal(res.ok, true, '破坏版仍能跑通（否则红得不明不白）');
    assert.throws(() => {
        // 原版断言（C 段同款）：引擎整体逐字不变
        assert.equal(JSON.stringify(eng), before, '引擎整体逐字不变');
    }, assert.AssertionError, '推演写回槽位必须被逐字比对抓住');
});

test('H: 负控制③ —— 破坏影响面计算必翻红', () => {
    const broken = breakSource(
        MODULE_SRC,
        'const hitTerm = terms.find(t => text.indexOf(t) >= 0);',
        'const hitTerm = null;',
        'L13-X2-破坏影响面计算'
    );
    const CB = loadBenchInVM(broken);
    const res = CB.counterfactualImpact({ factId: 'f_anchor' }, { engine: buildMockEngine(true) });
    assert.throws(() => {
        // 原版断言（B 段同款）：受影响集合非空
        assert.ok(res.affected.length > 0, '受影响集合非空');
    }, assert.AssertionError, '影响面被算空必须翻红');
});

const CUR = '3.433.0';
function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}

test('I: 当版锚点 —— 锁当版 3.433.0', () => {
    assert.equal(vnum(CUR), 3433000);
    assert.equal(vnum('3.433.0'), vnum(CUR));
    assert.ok(HOST_SRC.includes("'3.433.0'"), 'index.js 当版版本号必须是 3.433.0');
});
