// tests/v3249_recall_finalize_and_candidate_scope.test.mjs — v3.249.0 M-O1：
//   ① 召回收尾唯一出口：LLM 精排成功不再提前 return（审计 / 楼层记账 / 本地意图重排
//      四条路径恰一次），且顺序由上游那一次重排决定，收尾不得用本地排序覆盖精排；
//   ② 图谱候选「资格 / 粗排 / 限额」三层分离：上限只截返回名单，不截参赛名单。
//
// 判据纪律（本仓既有约定）：
//   · 行为面不靠读字符串 —— 把 index.js 的收尾块**真抽出来**在 harness 里跑；
//   · 负控制 = 真源码破坏 → 在破坏副本上重跑同一判决，且原版上同判据必须为真（两向自证）；
//   · 锚点恰中 1 次、破坏文本不得等于锚点原文。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const idxSrc = fs.readFileSync(path.join(REPO, 'index.js'), 'utf8');
const urSrc = fs.readFileSync(path.join(REPO, 'unified-recall.js'), 'utf8');

/* ══════════ 抽块：index.js 的召回收尾 ══════════ */
const IR_ANCHOR = 'const finalMerged = this.intentRerank(merged, query.text);';
const TAIL_ANCHOR = "this._rerankPath = 'local';\n            return _finalize();";
assert.equal(idxSrc.split(IR_ANCHOR).length - 1, 1, '收尾块起点锚点须恰中 1 次');
assert.equal(idxSrc.split(TAIL_ANCHOR).length - 1, 1, '收尾块终点锚点须恰中 1 次');
const FINALIZE_REGION = idxSrc.slice(idxSrc.indexOf(IR_ANCHOR), idxSrc.indexOf(TAIL_ANCHOR) + TAIL_ANCHOR.length);

function mkRunner(regionCode) {
    // regionCode 内只依赖 this / query / results / merged / errLog / PLUGIN_NAME
    const factory = new Function('query', 'results', 'merged', 'errLog', 'PLUGIN_NAME',
        'return (async function(){\n' + regionCode + '\n});');
    return factory;
}
function mkEngine(opt = {}) {
    const calls = { audit: 0, record: 0, intent: 0, rerank: 0, auditInjected: null, rerankPathAtAudit: null };
    const engine = {
        _rerankPath: '',
        config: { config: {
            rerankEnabled: opt.rerankEnabled === true,
            rerankCandidates: opt.rerankCandidates || 12,
            recallAuditEnabled: opt.recallAuditEnabled !== false,
            debugMode: false,
        } },
        llm: {
            getLastIntent: () => '意图',
            rerank: async (q, cands) => {
                calls.rerank++;
                if (opt.rerankThrows) throw new Error('rerank 挂了');
                return typeof opt.order === 'function' ? opt.order(cands) : opt.order;
            },
        },
        _auditRecall: (q, r, injected) => {
            calls.audit++;
            calls.auditInjected = injected.map(x => String(x.id));
            calls.rerankPathAtAudit = String(engine._rerankPath);
            return { floorHits: { 3: 1 }, vecHeatCount: 0 };
        },
        _recordFloorRecall: () => { calls.record++; return 1; },
        intentRerank: (m, qtext) => {
            calls.intent++;
            return typeof opt.intentOrder === 'function' ? opt.intentOrder(m) : m.slice();
        },
    };
    return { engine, calls };
}
const mkItems = (ids) => ids.map(id => ({ id, text: '内容' + id, rrfScore: 1 }));

/* ══════════ A 行为面：四条路径恰一次审计与记账 ══════════ */
test('【A1】精排成功：审计 / 记账 / 本地重排各恰一次，且不再提前离场', async () => {
    const merged = mkItems(['a', 'b', 'c', 'd']);
    const { engine, calls } = mkEngine({
        rerankEnabled: true,
        intentOrder: (m) => m.slice().reverse(),           // 本地意图重排的意见：d c b a
        order: () => [1, 0, 2, 3],                          // LLM 精排的意见：c d b a
    });
    const run = mkRunner(FINALIZE_REGION)({ text: '旧事', floor: 7 }, {}, merged, () => {}, 'LonSha');
    const out = await run.call(engine);
    const ids = out.map(x => String(x.id));
    assert.deepEqual(ids, ['c', 'd', 'b', 'a'], '顺序必须由 LLM 精排决定，不得被收尾的本地排序覆盖（实得 ' + ids.join(',') + '）');
    assert.equal(calls.intent, 1, '本地意图重排恰一次（它只负责给精排提供输入顺序）');
    assert.equal(calls.audit, 1, '召回审计恰一次（修前精排成功时为 0）');
    assert.equal(calls.record, 1, '楼层记账恰一次（修前精排成功时为 0）');
    assert.equal(calls.rerank, 1, 'LLM 精排恰一次');
    assert.deepEqual(calls.auditInjected, ids, '审计拿到的必须就是最终注入顺序（端到端同一份）');
    assert.equal(engine._rerankPath, 'llm', '路径归因落 llm');
    assert.equal(calls.rerankPathAtAudit, 'llm', '审计时路径归因已就位（坏归因可分辨）');
});

test('【A2】精排关闭 / 失败 / 回空值：同样恰一次审计与记账，顺序退回本地重排', async () => {
    const cases = [
        ['关闭', { rerankEnabled: false }],
        ['失败', { rerankEnabled: true, rerankThrows: true }],
        ['回空值', { rerankEnabled: true, order: () => null }],
        ['回空数组', { rerankEnabled: true, order: () => [] }],
    ];
    for (const [label, opt] of cases) {
        const merged = mkItems(['a', 'b', 'c', 'd']);
        const { engine, calls } = mkEngine({ intentOrder: (m) => m.slice().reverse(), ...opt });
        const run = mkRunner(FINALIZE_REGION)({ text: '旧事', floor: 7 }, {}, merged, () => {}, 'LonSha');
        const out = await run.call(engine);
        assert.deepEqual(out.map(x => String(x.id)), ['d', 'c', 'b', 'a'], label + '：顺序退回本地意图重排');
        assert.equal(calls.audit, 1, label + '：审计恰一次');
        assert.equal(calls.record, 1, label + '：记账恰一次');
        assert.equal(engine._rerankPath, 'local', label + '：路径归因落 local');
    }
});

test('【A3】审计关闭时零调用且不抛（召回结果照常返回）', async () => {
    const merged = mkItems(['a', 'b']);
    const { engine, calls } = mkEngine({ rerankEnabled: true, order: () => [1, 0], recallAuditEnabled: false, intentOrder: (m) => m.slice().reverse() });
    const run = mkRunner(FINALIZE_REGION)({ text: 'q', floor: 1 }, {}, merged, () => { throw new Error('不得调 errLog'); }, 'LonSha');
    const out = await run.call(engine);
    assert.deepEqual(out.map(x => String(x.id)), ['b', 'a'], '本地重排仍是唯一排序来源（候选过少不进精排）');
    assert.equal(calls.audit, 0, '审计关闭 → 零调用');
    assert.equal(calls.record, 0, '审计关闭 → 零记账');
});

test('【A4】精排给出的下标越界 / 重复：条目不得丢失（长度守恒）', async () => {
    const merged = mkItems(['a', 'b', 'c', 'd']);
    const { engine } = mkEngine({ rerankEnabled: true, order: () => [9, 1, 1] });
    const run = mkRunner(FINALIZE_REGION)({ text: 'q', floor: 1 }, {}, merged, () => {}, 'LonSha');
    const out = await run.call(engine);
    const ids = out.map(x => String(x.id)).sort();
    assert.deepEqual(ids, ['a', 'b', 'c', 'd'], '精排只换次第、不丢条目（实得 ' + ids.join(',') + '）');
    assert.equal(out.length, 4);
});

test('【A5】短名单不触发精排（merged.length <= 3 的既有门控不变）', async () => {
    const merged = mkItems(['a', 'b']);
    const { engine, calls } = mkEngine({ rerankEnabled: true, order: () => [1, 0] });
    const run = mkRunner(FINALIZE_REGION)({ text: 'q', floor: 1 }, {}, merged, () => {}, 'LonSha');
    await run.call(engine);
    assert.equal(calls.rerank, 0, '候选过少不调精排');
    assert.equal(calls.audit, 1, '但仍走共同收尾');
});

/* ══════════ B 结构面：位置三段不破 ══════════ */
test('【B1】收尾三段顺序：本地重排 → 审计 → 精排（v3150 的窗口判据不破）', () => {
    const ir = idxSrc.indexOf(IR_ANCHOR);
    const au = idxSrc.indexOf('const rec = this._auditRecall(query, results, finalMerged);', ir);
    const rr = idxSrc.indexOf('const order = await this.llm.rerank(_rq, candidates);', ir);
    assert.ok(ir > 0 && au > ir && rr > au, `三段顺序必须为 重排@${ir} < 审计@${au} < 精排@${rr}`);
    assert.ok(au - ir < 400, '审计仍在收尾块内（距重排 ' + (au - ir) + ' 字符）');
    assert.equal(idxSrc.split(IR_ANCHOR).length - 1, 1, '收尾只有一处');
});

test('【B2】精排块内的 splice 与 _finalize 两处都在场（形态自证）', () => {
    assert.equal(idxSrc.split('finalMerged.splice(0, candidates.length, ...head);').length - 1, 1, '就地重排');
    assert.equal(idxSrc.split('return _finalize();').length - 1, 2, '_finalize 两个出口（精排成功 / 收尾）');
    assert.ok(/const _finalize = \(\) => \{/.test(idxSrc), '_finalize 定义在场');
});

/* ══════════ C 负控制：真源码破坏 → 同判据必须翻红 ══════════ */
// [首跑修正] 初版第二组用 TAIL_ANCHOR（跨两行：归因赋值 + `return _finalize();`）做锚点、把
//   **本地路径**那条出口换成裸返回。但同一块里精排成功路径**还有**一条 `return _finalize();`，
//   而判据走的是精排成功路径 ⇒ 审计/记账照样各一次、判决仍为 true：这组「负控制」是**假绿**
//   （锚点在场、破坏也真的改了源码，唯独没落在判据观测的那条路上 —— 与 v3172 J3 记的形态③同源，
//   本仓把它归为「破坏打在空气上」的变体：空气不是文本，而是**判据的观测点**）。
//   修法两条：① 破坏改打判据实际经过的那条出口（精排成功路径，缩进 24 空格与本地路径可分辨）；
//   ② 每组补 `witness` 判据：把「破坏必须真的摘掉目标」变成断言，不靠人眼看破坏文本像不像。
const NC = [
    {
        label: '就地重排被摘掉（精排换了次第但不落到名单上）',
        anchor: 'finalMerged.splice(0, candidates.length, ...head);',
        broken: 'void head;',
        witness: (reg) => !reg.includes('finalMerged.splice(0, candidates.length, ...head);'),
    },
    {
        label: '精排成功路径绕过收口（修前形态：审计与记账各 0 次）',
        anchor: '                        return _finalize();',
        broken: '                        return finalMerged;',
        // 原块恰有两条收口出口（精排成功 / 本地路径），破坏必须削掉其中一条
        witness: (reg) => (reg.split('return _finalize();').length - 1) === 1,
    },
];
test('【C1】负控制：破坏副本上同款判据必翻红，原版上必为真（两向自证）', async () => {
    // 出口条数由真源码数出来（不把锚点字面量写进判据 —— 防自我指涉）
    const exitsIn = (src) => src.split('return _finalize();').length - 1;
    assert.equal(exitsIn(FINALIZE_REGION), 2, '原块必须恰有两条收口出口（精排成功 / 本地路径）');
    for (const { label, anchor, broken, witness } of NC) {
        assert.equal(FINALIZE_REGION.split(anchor).length - 1, 1, label + '：锚点在本块内须恰中 1 次');
        assert.equal(idxSrc.split(anchor).length - 1, 1, label + '：锚点在真源码（磁盘）里须恰中 1 次');
        assert.notEqual(broken, anchor, label + '：破坏文本不得等于锚点原文');
        const brokenRegion = FINALIZE_REGION.replace(anchor, broken);
        assert.notEqual(brokenRegion, FINALIZE_REGION, label + '：破坏必须真改到源码');
        assert.ok(witness(brokenRegion), label + '：破坏必须真的摘掉目标（否则破坏打在判据看不见的地方）');
        const merged = mkItems(['a', 'b', 'c', 'd']);
        const { engine, calls } = mkEngine({
            rerankEnabled: true,
            intentOrder: (m) => m.slice().reverse(),
            order: () => [1, 0, 2, 3],
        });
        const run = mkRunner(brokenRegion)({ text: '旧事', floor: 7 }, {}, merged, () => {}, 'LonSha');
        const out = await run.call(engine);
        const ids = out.map(x => String(x.id));
        const judge = (ids, calls) => (ids.join(',') === 'c,d,b,a' && calls.audit === 1 && calls.record === 1);
        assert.equal(judge(ids, calls), false, label + '：破坏后判据必须翻红（实得 ' + ids.join(',') + ' audit=' + calls.audit + '）');
        // 原版对照：同一判决在原块上必须为真
        const merged2 = mkItems(['a', 'b', 'c', 'd']);
        const e2 = mkEngine({ rerankEnabled: true, intentOrder: (m) => m.slice().reverse(), order: () => [1, 0, 2, 3] });
        const run2 = mkRunner(FINALIZE_REGION)({ text: '旧事', floor: 7 }, {}, merged2, () => {}, 'LonSha');
        const out2 = await run2.call(e2.engine);
        assert.equal(judge(out2.map(x => String(x.id)), e2.calls), true, label + '：原版上同判据必须为真');
    }
});

/* ══════════ D 模块面：候选资格与最终限额分离 ══════════ */
function loadUR(src) {
    const sbox = { module: { exports: {} } };
    const fn = new Function('globalThis', 'module', 'window', 'self',
        src + '\nreturn (typeof module !== "undefined" && module.exports) ? module.exports : globalThis.LonShaUnifiedRecall;');
    return fn(sbox, sbox.module, undefined, undefined);
}
const UR = loadUR(urSrc);
const mkNodes = (n) => Array.from({ length: n }, (_, i) => ({
    id: 'n' + i, type: 'misc', name: '节点' + i, data: { summary: 'x' + i },
    timestamp: 1000 + i,        // 越小越旧：n0 最旧
}));

test('【D1】includeDeferred：旧节点不再被上限挡在评分之外', () => {
    const nodes = mkNodes(30);
    const carry = {};
    const full = UR.graphToCandidates(nodes, { includeDeferred: true }, carry);
    assert.ok(Array.isArray(full), '裸数组契约');
    assert.equal(full.length, 30, '参赛名单 = 全部可候选化节点');
    assert.ok(full.some(c => c.id === 'n0'), '最旧节点必须能进入评分（它是「最旧」不是「最不相关」）');
    assert.equal(carry.deferred, 6, '仍报「按默认上限本会被挡下」的条数（有损必有计数）');
    assert.equal(carry.dropped, 0, 'includeDeferred 时不伪报丢弃');
    assert.equal(carry.candsTotal, 30);
});

test('【D2】默认返回与读数一字不改（既有契约不变）', () => {
    const nodes = mkNodes(30);
    const carry = {};
    const c = UR.graphToCandidates(nodes, {}, carry);
    assert.equal(c.length, 24, '默认上限 24');
    assert.equal(carry.dropped, 6);
    assert.equal(carry.kept, 24);
    assert.equal(carry.cap, 24);
    const c2 = UR.graphToCandidates(nodes, {}, {});
    assert.deepEqual(c2.map(x => x.id), c.map(x => x.id), '带/不带 carry 结果一致');
    assert.equal(UR.graphToCandidates(nodes, { maxCandidates: 10 }).length, 10, '上限可覆盖');
    assert.equal(UR.graphToCandidates(nodes, { maxCandidates: 40 }).length, 30, '上限放大可见真候选数');
});

test('【D3】保留层可关 / 保底不越过总预算 / 返回值确定性', () => {
    const nodes = mkNodes(30);
    assert.equal(UR.graphToCandidates(nodes, { keepGuaranteed: false }).length, 24, '关掉保底仍是 24 条（不越预算）');
    const a = UR.graphToCandidates(nodes, {}, {}).map(x => x.id);
    const b = UR.graphToCandidates(nodes, {}, {}).map(x => x.id);
    assert.deepEqual(a, b, '同输入同结果（时间等分权重不引入随机）');
    const allOld = Array.from({ length: 30 }, (_, i) => ({ id: 'o' + i, type: 'misc', name: 'o' + i, data: { summary: 's' + i }, timestamp: 5 }));
    const same = UR.graphToCandidates(allOld, {}, {}).map(x => x.id);
    assert.equal(same.length, 24, '同一时间戳也恰好 24 条');
    assert.equal(new Set(same).size, 24, '不重复入选');
});

test('【D4】负控制：模块破坏（includeDeferred 失效）→ 同判据必翻红', () => {
    const anchor = 'if (includeDeferred) {';
    assert.equal(urSrc.split(anchor).length - 1, 1, '锚点须恰中 1 次');
    const brokenSrc = urSrc.replace(anchor, 'if (false) {');
    assert.notEqual(brokenSrc, urSrc, '破坏必须真改到源码');
    const B = loadUR(brokenSrc);
    const full = B.graphToCandidates(mkNodes(30), { includeDeferred: true }, {});
    assert.equal(full.length, 24, '破坏后全量退回被截断（真判据在此副本上翻红）');
    assert.ok(!full.some(c => c.id === 'n0'), '破坏后最旧节点又被挡在评分之外');
    // 原版对照
    const ok = UR.graphToCandidates(mkNodes(30), { includeDeferred: true }, {});
    assert.equal(ok.length, 30, '原版上判据为真');
});

/* ══════════ E 宿主接线：两处改动的字面形态 ══════════ */
test('【E1】宿主接线：全量候选 + 精排路径入账', () => {
    assert.ok(idxSrc.includes('graphToCandidates(this.graph.nodes, { includeDeferred: true }, _urCarry)'), '图谱路取全量候选');
    assert.ok(idxSrc.includes('_funnel.graphDeferred'), 'deferred 入漏斗台账');
    assert.ok(idxSrc.includes("_funnel.rerankPath = 'llm'"), '精排路径入漏斗台账（有条件，不破坏空读轮次语义）');
    assert.ok(idxSrc.includes('rec.rerankPath = String(this._rerankPath'), '审计记录路径归因');
    assert.ok(idxSrc.includes('rec.injectedIds = finalMerged.slice(0, 8)'), '审计记录最终注入顺序');
});

test('【E2】版本与注册（四源同源 + 本套件出生锚）', () => {
    const vnum = (s) => Number(String(s).split('.').map((x) => x.padStart(3, '0')).join(''));
    // 本套件的**出生版本锚**（历史测试只锁自己的出生版本；当版号由 scan_version_guard
    //   的 V4/V6/V7 四源同源看守，不由历史测试硬等号看守 —— v3.203.0 的既有口径）。
    const BIRTH = vnum('3.249.0');
    const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
    assert.equal(manifest.version, v, 'manifest 同源');
    assert.equal(pkg.version, v, 'package 同源');
    assert.ok(vnum(v) >= BIRTH, '本套件只在 3.249.0 及以后成立，实得 ' + v);
    for (const f of ['ai-select.js', 'unified-recall.js', 'api-channels.js', 'text-chunk.js']) {
        assert.ok(manifest.extra_js.includes(f), f + ' 已注册 extra_js');
    }
});

console.log('\n[v3.249.0] 召回收尾唯一出口 + 候选资格分层：正测 13 组 / 负控制 3 组');
