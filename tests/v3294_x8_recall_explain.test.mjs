/* ============================================================
 * tests/v3294_x8_recall_explain.test.mjs — [v3.294.0 · X8] 召回解释：一次真实轮次的阶段归因
 *
 * 【本套件要证明的六件事（不是「函数返回了对象」）】
 *   ① **解释只来自同一轮真 trace**：账本身份**被证伪**（楼层不符 / 入选条目对不上）
 *      ⇒ 整份解释降级为「判不了」，且**不编原因**（verdict 文本必须携带那条具体原因，
 *      不是档位通用文案）；反过来，身份**无从核对**不得被当成「对不上」——
 *      否则每一轮解释都会因为宿主没给可比身份而落 unknown，
 *      真正的「账本拿错了」反而混在里面看不出来（本仓最忌的同形）。
 *   ② **缺源 ≠ 零命中**：源全被禁用是**明确的**结论（最有把握的一条），
 *      不得占 `missing`（那是「判不了」的位置）；零命中另有其时：源在岗、无错、合计 0。
 *   ③ **别名过滤与有效性过滤分开占档**：两者处置相反（补别名 vs 修过时事实），
 *      合成一档就等于把「改查询」与「改内容」指成同一件事。
 *   ④ **建议里每个数字都可在输入里指出来**：`apply.auto` 恒为 false、
 *      `requiresUserChoice` 恒为 true，且 `evidence[].field` 是真实字段路径；
 *      判不了时**只给一条**「先修观测面」建议（在错的读数上调参比不调更坏）。
 *   ⑤ **反馈不能自动改成历史事实**：`feedback` 返回体显式带 `writesHistoryFact:false`，
 *      且是纯函数（不改入参、环形有界）。
 *   ⑥ **判不了不许记 0**：任何一格测不到都给 `null`。`missing`（没测到）与
 *      `empty`（测了，确实 0）是**两态**；「链走完却无定论」另标 `unproven`。
 * 另加**真源码破坏的负控制**（判据 A/B/C/D 各配一份破坏副本，原版同判据作反向对照）：
 *   · 拆「身份被证伪 ⇒ 降级」闸门 ⇒ 判据 A 翻红；
 *   · 拆「全关是明确结论（不占 missing）」⇒ 判据 B 翻红；
 *   · 拆「判不了只给一条建议」闸门 ⇒ 判据 C 翻红；
 *   · 拆「missing 不记 0」⇒ 判据 D 翻红。
 *
 * 【当版锚点】形态按本仓 V4 惯例：**不写死版本号**，与三源同源比对（下限锚）。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { breakSource } from './_break_kit.mjs';
const R = process.cwd();
const require_ = createRequire(import.meta.url);
const X8_SRC = fs.readFileSync(path.join(R, 'recall-explain.js'), 'utf8');
const IDX_SRC = fs.readFileSync(path.join(R, 'index.js'), 'utf8');
const MAN_SRC = fs.readFileSync(path.join(R, 'manifest.json'), 'utf8');
const X8 = require_(path.join(R, 'recall-explain.js'));
const pkgRaw = JSON.parse(fs.readFileSync(path.join(R, 'package.json'), 'utf8')).version;
const vnum = (v) => String(v).split('.').map(Number);
/** 加载被破坏的模块副本（用完必须还原全局）。 */
function loadBrokenX8(src, mutate) {
    const broken = mutate(src);
    assert.notStrictEqual(broken, src, '破坏必须真的发生');
    const saved = globalThis.LonShaRecallExplain;
    const tmp = path.join(R, '__negctl_x8.tmp.cjs');
    fs.writeFileSync(tmp, broken);
    let api;
    try {
        delete require_.cache[require_.resolve(tmp)];
        api = require_(tmp);
    } finally {
        try { fs.unlinkSync(tmp); } catch (_e) { /* 清理失败不影响判定 */ }
        if (saved) { try { globalThis.LonShaRecallExplain = saved; } catch (_e) { /* 冻结全局：忽略 */ } }
    }
    return api;
}
/* ──────────────────────────────────────────────────────────
 * 判据函数（正负两跑共用同一份；破坏副本上必须翻红）
 * ────────────────────────────────────────────────────────── */
/** 夹具：一轮「全通」的真 trace（六档都有读数）。 */
function okFixture() {
    return {
        query: { text: '林砚为什么没来', floor: 12 },
        sources: [
            { key: 'vector', label: '向量', enabled: true, hits: 4, switchKey: 'vectorEnabled' },
            { key: 'bm25', label: 'BM25', enabled: true, hits: 2, switchKey: 'bm25Enabled' },
        ],
        alias: { expanded: true, mapSize: 5, filtered: 0 },
        validity: { filtered: 0, byRule: {} },
        budget: { preTrimChars: 3200, budgetChars: 3000, trimmed: false, kept: 6, dropped: 0 },
        injected: { count: 3, refs: ['sum_9', 'ev_4'] },
        audit: { floor: 12, totalHits: 6, perSource: { vector: 4, bm25: 2 }, srcKeys: ['vector', 'bm25'] },
    };
}
/** 判据 A：身份被证伪 ⇒ 降级且携带具体原因；无从核对 ⇒ 不降级但须留痕。 */
function judgeA(api) {
    const bad = {};
    // A1 楼层不符（宿主**明示**比对结果）
    const x1 = okFixture();
    x1.audit = { floor: 11, floorMatched: 'mismatch', totalHits: 6 };
    const r1 = api.explainRecall(x1);
    bad.a1 = (r1.verdict.stage !== 'unknown') || (r1.degraded !== true);
    // A2 入选条目对不上（另一路证伪）
    const x2 = okFixture();
    x2.audit = { floor: 12, totalHits: 6, idMatched: false };
    const r2 = api.explainRecall(x2);
    bad.a2 = (r2.verdict.stage !== 'unknown') || (r2.degraded !== true);
    // A3 降级时 verdict 必须携带**具体原因**（不是档位通用文案）
    bad.a3 = !(r2.verdict.text && r2.verdict.text.indexOf('账本') >= 0);
    // A4 无从核对**不得**被当成对不上：不降级、如实标层级、并留一条注记
    const x3 = okFixture();
    delete x3.audit.floor;
    const r3 = api.explainRecall(x3);
    bad.a4 = (r3.paired !== true) || (r3.degraded !== false)
        || (r3.evidence.identityLevel !== 'unverifiable')
        || !r3.truncated.notes.some((n) => n.indexOf('无从核对') >= 0);
    // A5 内容级身份是最可靠的一档：给了 true 就记 injected-ids
    const x4 = okFixture();
    x4.audit = { floor: 12, totalHits: 6, idMatched: true };
    const r4 = api.explainRecall(x4);
    bad.a5 = (r4.evidence.identityLevel !== 'injected-ids') || (r4.paired !== true);
    return bad;
}
/** 判据 B：全源禁用是**明确**结论（最有把握的一条），不得被自己下游的空档判成「判不了」。 */
function judgeB(api) {
    const bad = {};
    const x = okFixture();
    x.sources = x.sources.map((s) => ({ ...s, enabled: false, hits: 0 }));
    x.audit = { floor: 12, totalHits: 0 };
    delete x.alias;   // 一个下游面真缺读：必须记「没跑到」，既不得阻断也不得算收窄
    const r = api.explainRecall(x);
    bad.b1 = (r.verdict.stage !== 'source-missing');
    bad.b2 = (r.degraded !== false);
    bad.b3 = (r.blockingMissing.length !== 0);
    bad.b4 = !(r.stages[0].why && r.stages[0].why.indexOf('全部源关闭') >= 0);
    bad.b5 = !(r.unreadDownstream.indexOf('alias-filtered') >= 0);
    bad.b6 = (r.narrowed.indexOf('alias-filtered') >= 0);
    // 下游档的 why 必须与分类同口径（否则读数表自相矛盾）
    const row = r.stages.filter((s) => s.id === 'alias-filtered')[0];
    bad.b7 = !(row && row.why.indexOf('没跑到') >= 0);
    // 读数行不得报「0」（无源在岗时零命中不是独立读数）
    bad.b8 = !(api.line(r).indexOf('无命中') < 0);
    return bad;
}
/** 判据 C：判不了只给一条建议，且那条是修观测面。 */
function judgeC(api) {
    const bad = {};
    const x = okFixture();
    x.audit = { floor: 11, floorMatched: 'mismatch', totalHits: 6 };
    const r = api.explainRecall(x);
    const s = api.suggestFor(r, x);
    bad.c1 = (s.suggestions.length !== 1);
    bad.c2 = (s.suggestions[0].id !== 'fix-observability');
    bad.c3 = (s.autoParamTuning !== false);
    // 全通时：不得产出 fix-observability（那不是降级）
    const ok = api.explainRecall(okFixture());
    const s2 = api.suggestFor(ok, okFixture());
    bad.c4 = s2.suggestions.some((z) => z.id === 'fix-observability');
    // 所有建议一律不自动执行
    bad.c5 = s2.suggestions.some((z) => z.apply.auto !== false || z.requiresUserChoice !== true);
    return bad;
}
/** 判据 D：测不到就给 null，绝不记 0；「链走完无定论」另标 unproven。 */
function judgeD(api) {
    const bad = {};
    // D1 源级与合计都缺读数 ⇒ no-hit 判不了（count 必须 null）
    const x1 = okFixture();
    x1.audit = { floor: 12 };
    x1.sources = [{ key: 'vector', enabled: true, hits: 0 }, { key: 'bm25', enabled: true }];
    const r1 = api.explainRecall(x1);
    bad.d1 = (r1.stages[1].state !== 'missing') || (r1.stages[1].count !== null);
    // D2 链走完但载荷面没读数 ⇒ unproven，既不算已注入也不算判不了
    const x2 = okFixture();
    delete x2.injected;
    const r2 = api.explainRecall(x2);
    bad.d2 = (r2.verdict.unproven !== true) || (r2.verdict.stage === 'injected') || (r2.degraded !== false);
    // D3 判不了不报 0：line 在降级时不得出现孤立的「0」
    const x3 = okFixture();
    x3.audit = { floor: 11, floorMatched: 'mismatch', totalHits: 6 };
    bad.d3 = !(api.line(api.explainRecall(x3)).indexOf('0') < 0);
    // D4 三态字段必须存在（下游要能分辨「收窄」与「阻断」与「没跑到」）
    const r4 = api.explainRecall(okFixture());
    bad.d4 = !(Array.isArray(r4.narrowed) && Array.isArray(r4.blockingMissing) && Array.isArray(r4.unreadDownstream));
    return bad;
}
const allJudged = (api) => Object.assign({}, judgeA(api), judgeB(api), judgeC(api), judgeD(api));
const anyBad = (b) => Object.keys(b).filter((k) => b[k]);
/* ========== A 阶段归因主体 ========== */
test('v3294 A. 解释只来自同一轮真 trace：被证伪 ⇒ 降级且报出具体原因；无从核对 ≠ 对不上', () => {
    const bad = judgeA(X8);
    assert.deepEqual(anyBad(bad), [], 'A 段失败项：' + JSON.stringify(bad));
});
/* ========== B 缺源 ≠ 零命中 ========== */
test('v3294 B. 缺源是明确结论（不占 missing），且不被下游空档反打成「判不了」', () => {
    const bad = judgeB(X8);
    assert.deepEqual(anyBad(bad), [], 'B 段失败项：' + JSON.stringify(bad));
});
/* ========== C 建议纪律 ========== */
test('v3294 C. 建议带证据、默认不自动、判不了只给一条修观测面', () => {
    const bad = judgeC(X8);
    assert.deepEqual(anyBad(bad), [], 'C 段失败项：' + JSON.stringify(bad));
});
/* ========== D 三态不混 ========== */
test('v3294 D. missing/empty/unproven 三态不混：测不到一律 null，不记 0', () => {
    const bad = judgeD(X8);
    assert.deepEqual(anyBad(bad), [], 'D 段失败项：' + JSON.stringify(bad));
});
/* ========== E 七档登记表 ========== */
test('v3294 E. 七档登记表是单一真源：顺序、required、判据链一致', () => {
    assert.strictEqual(X8.STAGE_IDS.length, 7, '七档');
    assert.deepEqual(X8.STAGE_IDS.map(String), [
        'source-missing', 'no-hit', 'alias-filtered', 'validity-filtered', 'budget-trimmed', 'injected', 'unknown',
    ], '档位顺序即严重度');
    assert.deepEqual(Array.from(X8.RECALL_ORDER).map(String), [
        'source-missing', 'no-hit', 'alias-filtered', 'validity-filtered', 'budget-trimmed', 'injected',
    ], '判定链顺序');
    assert.ok(X8.RECALL_ORDER.indexOf('unknown') < 0, 'unknown 不是链上的一环（它是「链本身没法走」）');
    assert.ok(Object.isFrozen(X8.RECALL_ORDER), '链序必须冻结（防运行时被改）');
    const req = X8.STAGE_IDS.map((id) => X8.STAGE_BY_ID[id].required);
    assert.deepEqual(req, [true, true, false, false, false, false, true],
        'required 区分「缺了判不了」与「缺了只收窄范围」');
    for (const s of X8.STAGES) assert.ok(s.why && s.why.length > 10, s.id + ' 必须写明「读出该状态意味着什么」');
});
/* ========== F 建议的证据是可核对字段路径 ========== */
test('v3294 F. 建议的每个证据都指向输入上真实存在的字段路径', () => {
    const x = okFixture();
    x.budget = { preTrimChars: 5200, budgetChars: 3000, trimmed: true, kept: 4, dropped: 7 };
    const r = X8.explainRecall(x);
    const s = X8.suggestFor(r, x);
    const sug = s.suggestions.filter((z) => z.id === 'raise-injection-budget')[0];
    assert.ok(sug, '预算被裁时必须给出一条预算建议');
    assert.strictEqual(sug.apply.auto, false, '自动调参默认关闭');
    assert.strictEqual(sug.apply.key, 'injectionBudget', '改动的是配置键');
    assert.ok(sug.evidence.some((e) => e.field === 'budget.preTrimChars' && e.value === 5200), '证据须指向真实字段');
    assert.ok(sug.verify.how.indexOf('X3') >= 0, '验证口径须以同候选重跑比较为依据');
});
/* ========== G 反馈不写历史事实 ========== */
test('v3294 G. 反馈只记意见：纯函数、有界、显式声明不写历史事实', () => {
    const prev = [{ at: 1, floor: 1, verdictStage: 'injected', agree: true }];
    const out = X8.feedback(prev, { floor: 12, verdictStage: 'budget-trimmed', agree: false, note: 'x' });
    assert.strictEqual(out.writesHistoryFact, false, 'X8 验收原文：反馈不能自动改成历史事实');
    assert.strictEqual(out.list.length, 2);
    assert.strictEqual(prev.length, 1, '纯函数：不得改入参');
    let list = [];
    for (let i = 0; i < X8.MAX_FEEDBACK + 20; i++) list = X8.feedback(list, { floor: i }).list;
    assert.strictEqual(list.length, X8.MAX_FEEDBACK, '环形有界');
});
/* ========== H 宿主接线与模块注册 ========== */
test('v3294 H. 宿主三出口 + 诊断行 + 模块注册 + 退路在场', () => {
    for (const m of ['_recallExplainLib() {', 'explainRecallHost() {', 'suggestRecallFixes(explanation, opts) {', '_recallExplainLine() {']) {
        assert.ok(IDX_SRC.indexOf(m) >= 0, '宿主缺出口：' + m);
    }
    assert.ok(IDX_SRC.indexOf("window.LonShaRecallExplain, 'recall-explain.js'") >= 0, '取库口须走 _moduleLib 契约');
    assert.ok(IDX_SRC.indexOf("['召回解释', line") >= 0, '诊断行须在场');
    assert.ok(IDX_SRC.indexOf("selfCheck.recallExplain") >= 0, '诊断行须自兜（try 包住）');
    assert.ok(MAN_SRC.indexOf('"recall-explain.js"') >= 0, '模块须注册进 manifest.extra_js');
    assert.ok(IDX_SRC.indexOf('srcKeys: SRC.slice()') >= 0, '账本须带源名册（源清单单一真源）');
});
/* ========== I 版本三源同源（V1 惯例：不写死具体号，只钉同源与推进） ========== */
test('v3294 I. 版本三源同源且不低于 X7 版', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(R, 'package.json'), 'utf8')).version;
    const man = JSON.parse(fs.readFileSync(path.join(R, 'manifest.json'), 'utf8')).version;
    const idx = (IDX_SRC.match(/const VERSION = '([0-9.]+)'/) || [])[1];
    assert.strictEqual(pkg, man, 'package.json 与 manifest.json 必须同版');
    assert.strictEqual(pkg, idx, 'index.js VERSION 必须同版');
    /* 当版锚（frontier）：本套件是 v3.294.0 的交付套件，故恰好锚当版；
     *   下一版接管时由继任套件写自己的号，本行随之降为历史下界（V3 口径）。 */
    const a = vnum(pkg), b = vnum('3.294.0');
    assert.ok(a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2]))),
        '版本必须不低于 X8 出生版本 3.294.0（实际 ' + pkg + '）');
});
/* ========== 负控制：真源码破坏（正向先验，再证明同一份判据在破坏副本上翻红） ========== */
test('v3294 N0. 负控制前置：正类判据在**原版**上全绿（否则负控制无意义）', () => {
    const bad = anyBad(allJudged(X8));
    assert.deepEqual(bad, [], '原版上判据必须全绿：' + JSON.stringify(bad));
});
test('v3294 N1. 负控制：拆「身份被证伪 ⇒ 降级」⇒ 判据 A 翻红', () => {
    const broken = loadBrokenX8(X8_SRC, (s) => breakSource(s,
        "                && input.audit.floorMatched !== 'mismatch' && input.audit.idMatched !== false);",
        "                && true);",
        'x8-pairing'));
    const bad = judgeA(broken);
    assert.ok(anyBad(bad).length > 0, '拆掉身份闸门后判据 A 必须翻红');
});
test('v3294 N2. 负控制：拆「全关不占 missing」⇒ 判据 B 翻红', () => {
    const broken = loadBrokenX8(X8_SRC, (s) => breakSource(s, "                    state: 'filtered',\n                    count: missing,", "                    state: allOff ? 'missing' : 'filtered',\n                    count: missing,", 'x8-alloff'));
    const bad = judgeB(broken);
    assert.ok(anyBad(bad).length > 0, '拆掉「全关是明确结论」后判据 B 必须翻红');
});
test('v3294 N3. 负控制：拆「判不了只给一条建议」⇒ 判据 C 翻红', () => {
    const broken = loadBrokenX8(X8_SRC, (s) => breakSource(s,
        "                return { ok: true, suggestions: out, count: out.length, autoParamTuning: false };\n            }\n            const sm = stageOf('source-missing');",
        "                /* 破坏：不再提前收口，继续往下产建议 */\n            }\n            const sm = stageOf('source-missing');",
        'x8-degraded-early-return'));
    const bad = judgeC(broken);
    assert.ok(anyBad(bad).length > 0, '拆掉降级早退后判据 C 必须翻红');
});
test('v3294 N4. 负控制：拆「测不到给 null」⇒ 判据 D 翻红', () => {
    const broken = loadBrokenX8(X8_SRC, (s) => breakSource(s,
        "                    why: '既无审计面合计读数，源级命中数也不齐（' + known.length + '/' + onDuty.length + ' 个在场源报数）⇒ 不倒推', refs: [] };",
        "                    why: '破坏：把测不到写成 0', count: 0, refs: [] };",
        'x8-missing-as-zero'));
    const bad = judgeD(broken);
    assert.ok(anyBad(bad).length > 0, '拆掉「测不到给 null」后判据 D 必须翻红');
});