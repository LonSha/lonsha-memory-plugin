/* ============================================================
 * tests/v3441_l13_x4_evidence_gap.test.mjs — v3.441.0
 * ------------------------------------------------------------
 * L13-X4 · 证据缺口工作台 —— 把 `memory-archaeology-gap-bench.js` 接进产品。
 *
 * 【真实现场（接产品之前）】该内核登记在 `manifest.extra_js`、真被加载、`v3385` 单测绿，
 *   而 `module_consumption_ledger` 里 `prod_call_sites = 0`：产品端一次都没调用。
 *   且它此前只到「手工造线索树 + 单条准入」——**没有任何一面回答「我这些结论里哪些证据薄」**。
 *   于是「这条事实可不可信」在面板上只剩「有值 / 没值」一种读数，而「没值」被当
 *   「没有这个事实」还是「没记过」读，谁也说不清。
 *
 * 【本档钉住的六件事】
 *   A  内核三档：`no-source` / `source-lost` / `contradicted` 各造一例，成因不同、互不吞并；
 *      `resolveSource` 返回 null 时**不得**写 source-lost（「没核验」不许栽赃成「证据丢了」）；
 *      `conflictsAvailable:false` 时**不得**判「查过没矛盾」；`counts` 与 `hitCounts` 双表并存
 *   B  面板：四档徽章逐档不同文不同形、四格分列、空态必须念 scanned/thick/threshold、
 *      缺席态明写「不是证据都齐了」、动作只有两个（去补证 / 逐条降级）、**没有任何一键补全**
 *   C  只读自证：`evidenceGapBench` 前后 engine 既有槽位**逐字不变**（双向核对 + 无新键）
 *   D  降级落 deltas：走 `setOrigin` 改来源（stated → inferred，trust 0.3 被现状查询挡住）
 *      + `DeltaBook.add(..., 'uncertain')` 留痕；幂等重放不重复落笔；失败面逐个如实报
 *   E  真源码破坏三条（原版对照 + 破坏副本必红）：判不了被写成证据丢了 / 矛盾被并进从没证据 /
 *      矛盾账不在却报「查过」
 *   F  当版锚 v3.441.0（vnum 形，守卫认得那一形）
 *
 * 【两条纪律（本仓反复付过学费）】
 *   1. 判据切片一律用**真实锚点 + 唯一性自证**，锚点不唯一时判据自己先红。
 *   2. 负控制一律「真源码破坏 → 加载破坏副本 → 在副本上重跑同一条判据」；
 *      判据函数不引用锚点串（避免自我指涉）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';

const require_ = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const KB_SRC = read('memory-archaeology-gap-bench.js');
const DIAG_SRC = read('engine-diagnostic-lines.js');
const HOST_SRC = read('index.js');
const UI_SRC = read('settings-ui.js');
const MANIFEST = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const KB = require_(path.join(ROOT, 'memory-archaeology-gap-bench.js'));
const FV = require_(path.join(ROOT, 'fact-version.js'));
const LEDGERS = require_(path.join(ROOT, 'memory-ledgers.js'));

// ── 锚点（文件头声明一次；判据函数**不**引用这些串） ──────────────────────
const A_UI_VIEW = "else if (viewType === 'archive') {";
const A_UI_VIEW_END = "else if (viewType === 'lockedfacts') {";
const A_UI_BIND = "\n            if (viewType === 'archive') {";
const A_UI_BIND_END = '            // [v3.63] lockedfacts 视图的交互绑定';
const A_NEG_LOST = 'else if (r === false) { sourceChecked = true; causes.push(GAP_CAUSES.SOURCE_LOST); }';
const A_NEG_MERGE = 'if (sk && conflictSubjects.has(sk)) causes.push(GAP_CAUSES.CONTRADICTED);';
const A_NEG_CONFLICT_ON = 'if (conflictsAvailable) {';
const A_HOST_FWD = 'evidenceGapBench(...args) {';

const at = (hay, needle) => hay.indexOf(needle);
const occ = (hay, needle) => hay.split(needle).length - 1;
/** 切片；并**自证锚点唯一**（不唯一直接红，不许取第一个了事）。 */
function seg(hay, start, end, label) {
  const n = occ(hay, start);
  assert.equal(n, 1, '切片锚点必须唯一（' + (label || start.slice(0, 30)) + '），实际出现 ' + n + ' 次');
  const s = at(hay, start);
  if (end == null) return hay.slice(s);
  const e = hay.indexOf(end, s + start.length);
  assert.ok(e > s, '终点锚点必须在起点之后：' + String(end).slice(0, 40));
  return hay.slice(s, e);
}

// ── 夹具 ────────────────────────────────────────────────────────────────
// ★ 夹具纪律：六条事实**各代表一种形态**，任何两条并入同一档都会让本档判据失明。
//   ⑤ 必须「够厚」（evidence + 一条带 source 的 assert 历史），否则 thinThreshold 那一支永不被执行，
//   于是「阈值生效」这条判据是空转的（本仓记过的负控制假绿第一形）。
const FACTS = [
  { id: 'f_nosrc', subject: '沈砚', predicate: '身份', value: '学徒', origin: 'stated', evidence: '', floor: 2, history: [] },
  { id: 'f_lost', subject: '阿绣', predicate: '住处', value: '西巷老宅', origin: 'stated', evidence: '她说她住在西巷老宅里', floor: 5, history: [] },
  { id: 'f_contra', subject: '柳氏', predicate: '年纪', value: '二十', origin: 'reported', evidence: '', floor: 7, history: [] },
  { id: 'f_both', subject: '柳氏', predicate: '本名', value: '柳三娘', origin: 'stated', evidence: '她签的名字是柳三娘三个字', floor: 9, history: [] },
  { id: 'f_thick', subject: '沈砚', predicate: '佩剑', value: '青锋', origin: 'confirmed', evidence: '剑鞘上的铭文', floor: 3, history: [{ action: 'assert', source: '第3楼正文' }] },
  { id: 'f_rev', subject: '阿绣', predicate: '旧姓', value: '苏', origin: 'stated', evidence: '', revoked: true, floor: 4, history: [] }
];
const CONFLICTS = [{ subject: '柳氏', versionA: '二十', versionB: '二十六', note: '年龄两说' }];
/** 解算器：一律「找不到」。故 f_lost / f_both 会走 false 支（source-lost）。 */
const NO_SOURCE_FOUND = () => false;
/** 解算器：一律「判不了」。故两条都不许进 source-lost。 */
const UNDECIDABLE = () => null;

/** 造一个最小引擎：只持有本面真源（事实账 / 矛盾账 / 增量账）。 */
function makeEngine(seed) {
    const DL = require_(path.join(ROOT, 'engine-diagnostic-lines.js'));
    const engine = Object.assign({}, seed || {});
    engine._moduleLib = function (getter, name) {
        /* 真宿主用 `_moduleLib(() => window.X, 'x.js')` 取库；这里按参数还原成 require。
         *   ★ 不伪造内核 —— 取到的是磁盘上那一份（破坏它，判据必红）。 */
        const cands = [];
        const m = String(getter).match(/'([^']+\.js)'/);
        if (m) cands.push(m[1]);
        if (name) cands.push(String(name));
        for (const c of cands) {
            try { return require_(path.join(ROOT, c)); } catch (_e) { /* 下一个 */ }
        }
        return null;
    };
    DL.bindDeps({
        moduleLib: engine._moduleLib,
        errLog: () => {},
        _changeset: () => null,
        libs: {
            _gapBenchLib: () => require_(path.join(ROOT, 'memory-archaeology-gap-bench.js')),
            _factVersionLib: () => require_(path.join(ROOT, 'fact-version.js'))
        }
    });
    return { DL, engine };
}

// ═══════════════════════════════════════════════════════════════════════
// A 组：内核三档 —— 成因互不吞并，判不了不栽赃
// ═══════════════════════════════════════════════════════════════════════
test('A1: 三档各造一例 —— 成因不同、互不吞并、双表并存', () => {
    const r = KB.auditGaps({ facts: FACTS, conflicts: CONFLICTS, conflictsAvailable: true },
        { resolveSource: NO_SOURCE_FOUND });
    assert.equal(r.ok, true);
    assert.equal(r.writesNothing, true, '盘点是纯读');

    /* scanned **不含**已撤销那一条；但它必须单列计数（静默跳过等于把它藏了） */
    assert.equal(r.scanned, 5, '扫过 5 条（f_rev 已撤销不进盘）');
    assert.equal(r.skippedRevoked, 1, '已撤销未盘必须单列，不许静默');
    assert.equal(r.thick, 1, 'f_thick 证据 2 条 > 阈值 1 ⇒ 足够厚');
    assert.equal(r.thin.length, 4, '四条证据薄');

    /* 逐档：每条的主因必须与它的形态对得上（不是「都归进缺证据」） */
    const byId = {};
    for (const it of r.thin) byId[it.factId] = it;
    assert.equal(byId.f_nosrc.cause, 'no-source');
    assert.equal(byId.f_lost.cause, 'source-lost');
    assert.equal(byId.f_contra.cause, 'contradicted');
    assert.equal(byId.f_both.cause, 'contradicted', '双因条目的主因取更严重的一档');
    assert.deepEqual(byId.f_both.causes, ['contradicted', 'source-lost'], '命中集去重且按严重度降序');

    /* 双表：counts 按主因（总和 = thin 条数）、hitCounts 按命中（总和可 > thin 条数） */
    assert.equal(Object.values(r.counts).reduce((a, b) => a + b, 0), r.thin.length,
        'counts 总和必须等于 thin 条数（一条只进一格）');
    assert.equal(r.counts['no-source'], 1);
    assert.equal(r.counts['source-lost'], 1);
    assert.equal(r.counts.contradicted, 2);
    assert.equal(r.counts.undecided, 0);
    assert.equal(r.hitCounts['source-lost'], 2, 'f_lost 与 f_both 都命中 source-lost');
    assert.equal(r.hitCounts.contradicted, 2);
    assert.ok(Object.values(r.hitCounts).reduce((a, b) => a + b, 0) > r.thin.length,
        'hitCounts 总和可大于 thin 条数 —— 只看 counts 会漏「这条也矛盾」');

    /* 排序：严重度降序 → 楼层新的在前 */
    assert.equal(r.thin[0].factId, 'f_both', '矛盾档排最前（矛盾是「两条都自称真」，误导最重）');
    assert.equal(r.thin[r.thin.length - 1].factId, 'f_nosrc', '从没证据排在证据失效之后');

    /* 三档的 note **逐档不同文** —— 共用一句话就是「合成一档」的软形态 */
    const notes = new Set([byId.f_nosrc.note, byId.f_lost.note, byId.f_contra.note]);
    assert.equal(notes.size, 3, '三档说明必须逐档不同文，实际：' + [...notes].join(' | '));
});

test('A2: 判不了 —— resolveSource 返回 null 时**绝不**写 source-lost', () => {
    const r = KB.auditGaps({ facts: FACTS, conflicts: CONFLICTS, conflictsAvailable: true },
        { resolveSource: UNDECIDABLE });
    const byId = {};
    for (const it of r.thin) byId[it.factId] = it;
    /* f_lost 有证据引用、但没人核验得了 ⇒ 该判不了，不是「证据丢了」 */
    assert.equal(byId.f_lost.cause, 'undecided', '判不了就是判不了（主因格里的兜底）');
    assert.equal(byId.f_lost.sourceChecked, false, 'sourceChecked 必须如实为 false');
    assert.equal(r.counts['source-lost'], 0, '一个都不许被判成证据失效');
    assert.ok(/判不了|无法核验/.test(byId.f_lost.note), '说明必须点出「判不了」，实际：' + byId.f_lost.note);

    /* 不传解算器（连核验手段都没有）⇒ 同上，绝不当成 false */
    const r2 = KB.auditGaps({ facts: FACTS, conflicts: CONFLICTS, conflictsAvailable: true }, {});
    assert.equal(r2.checked.source, false, '没有解算器 ⇒ 来源侧未核验');
    assert.equal(r2.counts['source-lost'], 0, '没有解算器时不得凭空判证据失效');
});

test('A3: 矛盾账不在 ⇒ 不判「查过没矛盾」；账在但空 ⇒ 才能说查过', () => {
    /* 账不在（宿主根本没装这本账） */
    const absent = KB.auditGaps({ facts: FACTS, conflicts: [], conflictsAvailable: false }, { resolveSource: NO_SOURCE_FOUND });
    assert.equal(absent.checked.conflict, false, '账不在 ⇒ 矛盾侧未核验');
    assert.equal(absent.counts.contradicted, 0, '账不在时不许判出任何矛盾（也不许说没有矛盾）');
    for (const it of absent.thin) {
        assert.equal(it.conflictChecked, false, '账不在时每条的矛盾侧都必须是未核验：' + it.factId);
    }

    /* 账在但是空的 —— 与「账不在」必须不同形 */
    const empty = KB.auditGaps({ facts: FACTS, conflicts: [], conflictsAvailable: true }, { resolveSource: NO_SOURCE_FOUND });
    assert.equal(empty.checked.conflict, true, '账在 ⇒ 矛盾侧已核验');
    assert.equal(empty.counts.contradicted, 0, '账是空的 ⇒ 确实没矛盾（这才敢说）');
    for (const it of empty.thin) {
        assert.equal(it.conflictChecked, true, '账在时每条都核验过：' + it.factId);
    }
});

test('A4: 阈值 / 畸形 / 空账三态 —— 三态必须可分', () => {
    const one = KB.auditGaps({ facts: [FACTS[4]] }, {});
    assert.equal(one.thick, 1);
    assert.equal(one.thin.length, 0);
    assert.equal(one.reason, 'empty', '没有缺口是 empty —— 但它同时报了 scanned/thick，不是「没扫」');

    /* ★ 首跑这条红（5 !== 0），是**判据侧的错**，不是内核：
     *   阈值口径是「证据数 **<=** 阈值即入盘」，故 threshold=2 时 f_thick（恰好 2 条）
     *   `2 > 2` 不成立 ⇒ **仍入盘**。我原断言「抬到 2 就一条都不剩」是把「<=」误读成「<」。
     *   正确的可观测差异是：threshold 1 → thick 1 / thin 4；threshold 2 → thick 0 / thin 5。 */
    const base = KB.auditGaps({ facts: FACTS }, {});
    assert.equal(base.thick, 1);
    assert.equal(base.thin.length, 4);
    const raised = KB.auditGaps({ facts: FACTS }, { thinThreshold: 2 });
    assert.equal(raised.threshold, 2);
    assert.equal(raised.thick, 0, '阈值抬到 2 ⇒ f_thick（恰 2 条）不再算厚');
    assert.equal(raised.thin.length, 5, 'f_thick 反过来落进缺口盘（阈值是 <= 不是 <）');
    assert.ok(raised.thin.some((x) => x.factId === 'f_thick'), '抬阈值后 f_thick 必须出现在缺口盘里');

    const bad = KB.auditGaps({ facts: [null, 42, FACTS[0]] }, {});
    assert.equal(bad.ok, true, '畸形条目不许外抛');
    assert.equal(bad.skippedMalformed, 2, '认不出的条目必须计数可见');
    assert.equal(bad.degraded, true);
    assert.equal(bad.reason, 'degraded', '有被略掉的条目 ⇒ reason 必须说清是降级态');

    /* null / 空入参：读数而不是异常 */
    const nil = KB.auditGaps(null, null);
    assert.equal(nil.ok, true);
    assert.equal(nil.scanned, 0, '空账 ⇒ 扫过 0 条（与「扫了 N 条都够厚」不同形）');
});

test('A5: downgradePayload 只出载荷 —— 内核不落笔，幂等不重复', () => {
    const p = KB.downgradePayload(FACTS[0], { reason: '证据薄' });
    assert.equal(p.ok, true);
    assert.equal(p.writesNothing, true, '内核只出载荷，真落笔走既有 owner');
    assert.equal(p.fromOrigin, 'stated');
    assert.equal(p.toOrigin, 'inferred');
    assert.equal(p.deltaStatus, 'uncertain');
    assert.ok(p.deltaSummary.indexOf('降级为推测') >= 0);
    assert.ok(p.deltaSummary.length <= 150, '长度按 DeltaBook 的 150 字上限截，不另定一个');

    const already = KB.downgradePayload({ id: 'x', origin: 'inferred', subject: 's', predicate: 'p', value: 'v' }, {});
    assert.equal(already.ok, true);
    assert.equal(already.reason, 'already-inferred', '已是推测 ⇒ 幂等返回，不重复落笔');
    assert.equal(already.deltaSummary, '');

    assert.equal(KB.downgradePayload(null, {}).ok, false);
    assert.equal(KB.downgradePayload({ subject: 's' }, {}).reason, 'fact-id-required');
});

// ═══════════════════════════════════════════════════════════════════════
// B 组：面板 —— 四档逐档不同形，动作只有两个
// ═══════════════════════════════════════════════════════════════════════
test('B1: 四档分列 / 逐档不同文 / 空态念读数 / 缺席不冒充「都齐了」', () => {
    const view = seg(UI_SRC, A_UI_VIEW, A_UI_VIEW_END, 'archive 视图');
    /* 三个渲染态各有机读标记，且缺席态**不许**与空态同形 */
    for (const need of ['data-ls-face="absent"', 'data-ls-gap-face="empty"', 'data-gap-group=', 'data-gap-fact=', 'data-gap-cause=']) {
        assert.ok(view.indexOf(need) >= 0, '面板缺渲染标记：' + need);
    }
    assert.ok(view.indexOf('不是「证据都齐了」') >= 0, '缺席必须显式否掉误读（否则会把「面没装上」读成「证据齐了」）');

    /* 空态必须念出「扫了多少 / 够厚多少 / 阈值多少」——否则空扫与真扫同形 */
    assert.ok(view.indexOf('gap.scanned') >= 0, '空态必须念 scanned');
    assert.ok(view.indexOf('gap.thick') >= 0, '空态必须念 thick');
    assert.ok(view.indexOf('gap.threshold') >= 0, '空态必须念 threshold');

    /* 四档：徽章文案逐档不同，且渲染循环照四档分格 */
    for (const t of ['从没证据', '证据失效', '证据矛盾', '判不了']) {
        assert.ok(view.indexOf(t) >= 0, '四档徽章缺文案：' + t);
    }
    assert.ok(view.indexOf("['contradicted', 'source-lost', 'no-source', 'undecided']") >= 0,
        '渲染必须按四档逐格（顺序 = 严重度序），不许合成一个「缺证据」');

    /* 两侧核验状态行必在场 —— 它是「判不了」这一格能说清的前提 */
    assert.ok(view.indexOf('chk.source') >= 0 && view.indexOf('chk.conflict') >= 0,
        '必须报两侧核验状态（正文可读？矛盾账在？）');
    assert.ok(view.indexOf('不判「证据失效」') >= 0, '正文不可读时必须明写不判证据失效');

    /* 动作面：只有两个按钮，且**没有任何一键补全** */
    assert.ok(view.indexOf('data-gap-refill') >= 0, '缺「去补证」动作');
    assert.ok(view.indexOf('data-gap-down') >= 0, '缺「降级为推测」动作');
    assert.equal(/data-gap-(auto|all|bulk|fill)\b/.test(view), false,
        '不得渲染任何「一键补全 / 批量补齐」类动作（计划明令禁止由模型无凭捏造补全）');
    assert.ok(view.indexOf('没有一键补全') >= 0, '口径句必须把「没有一键补全」说出来');
});

test('B2: 交互绑定与渲染选择器一一对应（点了没反应是本仓反复治过的一类）', () => {
    const bind = seg(UI_SRC, A_UI_BIND, A_UI_BIND_END, 'archive 绑定');
    assert.ok(/querySelectorAll\(\s*['"]\[data-gap-refill\]/.test(bind), '必须遍历全部「去补证」按钮逐个绑定');
    assert.ok(/querySelectorAll\(\s*['"]\[data-gap-down\]/.test(bind), '必须遍历全部「降级」按钮逐个绑定');
    assert.ok(bind.indexOf('s.evidenceGapDowngrade') >= 0, '降级必须回宿主写（不就地改 DOM）');
    assert.ok(bind.indexOf("showBrowser('lockedfacts')") >= 0, '「去补证」跳到证据面，本面不代劳补证');
    assert.ok(bind.indexOf("showBrowser('archive')") >= 0, '成功后回同一视图重建（面板与内核走同一条路）');
    /* 渲染与绑定两处都出现 ⇒ 选择器不是「只画不挂」 */
    assert.ok(occ(UI_SRC, 'data-gap-refill') >= 2, 'data-gap-refill 必须在渲染与绑定两处都出现，实际 ' + occ(UI_SRC, 'data-gap-refill'));
    assert.ok(occ(UI_SRC, 'data-gap-down') >= 2, 'data-gap-down 必须在渲染与绑定两处都出现，实际 ' + occ(UI_SRC, 'data-gap-down'));
    /* 失败必须报原因 —— 点了没反应与「点了被拒」是两种事 */
    assert.ok(bind.indexOf('降级未生效') >= 0, '被拒时必须 toast 出原因，不许静默');
    assert.ok(bind.indexOf('留痕未成') >= 0, '人读侧留痕失败时不得说成成功');
});

test('B3: 缺口面与存档体检合并展示 —— 缺口在上、容器在下，且两段都在 body 里', () => {
    const view = seg(UI_SRC, A_UI_VIEW, A_UI_VIEW_END, 'archive 视图');
    assert.ok(view.indexOf('body = sourceBlock + gapBlock + archiveBody;') >= 0, '两块必须拼进同一 body（只算不拼 = 白做）');
    assert.equal(/^\s*body\s*=\s*head \+ warn/m.test(view), false,
        '存档体检那段不得再直接写 body（否则会把缺口面整块盖掉）');
    assert.ok(view.indexOf('archiveBody') >= 0, '存档体检必须落到独立变量再拼装');
    /* 面板不重判：读数一律回宿主 */
    assert.ok(view.indexOf('s.evidenceGapBench') >= 0, '面板必须经宿主 evidenceGapBench 取数');
    assert.equal(/auditGaps\s*\(/.test(view), false, '面板不得自己调内核重算（面板不重判）');
});

// ═══════════════════════════════════════════════════════════════════════
// C 组：只读自证 —— 前后既有槽位逐字不变
// ═══════════════════════════════════════════════════════════════════════
test('C1: evidenceGapBench 是只读面 —— 前后 engine 逐字不变、无新键', () => {
    const { DL, engine } = makeEngine({
        _factVersionState: { version: 1, seq: 0, facts: FACTS.map((f) => Object.assign({}, f)) },
        conflicts: { conflicts: CONFLICTS.map((c) => Object.assign({}, c)) },
    });
    const keysBefore = Object.keys(engine).sort().join(',');
    const snapBefore = JSON.stringify({
        facts: engine._factVersionState.facts,
        seq: engine._factVersionState.seq,
        conflicts: engine.conflicts.conflicts,
    });
    const r = DL.evidenceGapBench(engine, {});
    const snapAfter = JSON.stringify({
        facts: engine._factVersionState.facts,
        seq: engine._factVersionState.seq,
        conflicts: engine.conflicts.conflicts,
    });
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.writesNothing, true, '读数体必须自证不写');
    assert.equal(snapAfter, snapBefore, '只读面前后既有槽位必须逐字不变（双向核对）');
    assert.equal(Object.keys(engine).sort().join(','), keysBefore, '不得新增任何缓存键（缓存本身也是一次写）');
    /* 再跑一次：仍然逐字不变（幂等读取，不累积） */
    DL.evidenceGapBench(engine, {});
    assert.equal(JSON.stringify(engine._factVersionState.facts), JSON.stringify(JSON.parse(snapBefore).facts),
        '重复读取不得改动事实账');
});

test('C2: 缺席面 —— 不抛、同 kind、带 ok 布尔、键面恒定', () => {
    const { DL } = makeEngine({});
    const r = DL.evidenceGapBench({}, {});
    assert.equal(r.kind, 'evidence_gap', '缺席也必须给同一 kind（不塌成 undefined）');
    assert.equal(typeof r.ok, 'boolean');
    assert.equal(Array.isArray(r.thin), true, '缺席面 thin 必须是数组（不是缺键）');
    assert.ok(r.reason, '缺席必须说清原因');
    /* ★ 首跑这条红（true !== false），是**判据侧的错**：我原以为「engine 传 null 就是面没装上」，
     *   而实际语义是——`engine` 为 null 时本面**照样能扫**（事实账读成空、矛盾账读成不在），
     *   于是它给的是 `ok:true / scanned:0` 的**空账**，不是缺席。
     *   这两态本来就该不同形：缺席 = 模块取不到（ok:false + reason），空账 = 扫了 0 条。
     *   判据改为核实「不抛 + 键面恒定 + 空账如实报 0」，缺席态另用真·无库的 bindDeps 造。 */
    const nilEngine = DL.evidenceGapBench(null, {});
    assert.equal(typeof nilEngine.ok, 'boolean', 'engine 为 null 不许外抛');
    assert.equal(Array.isArray(nilEngine.thin), true);
    assert.equal(nilEngine.scanned, 0, '没有账 ⇒ 扫过 0 条（空账，不是缺席）');
    /* 真·缺席：把取库口摘空 ⇒ 必须 ok:false 且 reason 可归因 */
    const noLib = makeEngine({});
    noLib.DL.bindDeps({ moduleLib: noLib.engine._moduleLib, errLog: () => {}, _changeset: () => null, libs: {} });
    const gone = noLib.DL.evidenceGapBench(noLib.engine, {});
    assert.equal(gone.ok, false, '取库口摘空 ⇒ 必须是缺席（ok:false），不许伪装成空账');
    assert.equal(gone.reason, 'module-unavailable');
    assert.equal(gone.writesNothing, true);
    /* 键面恒定：缺席面与在场面必须有同一组顶层键（否则下游要写两套读法） */
    const { DL: DL2, engine } = makeEngine({
        _factVersionState: { facts: FACTS.map((f) => Object.assign({}, f)) },
        conflicts: { conflicts: [] },
    });
    const live = DL2.evidenceGapBench(engine, {});
    const missing = Object.keys(r).filter((k) => !(k in live));
    assert.deepEqual(missing, [], '缺席面多出的键必须为零，实际：' + missing.join(','));
});

// ═══════════════════════════════════════════════════════════════════════
// D 组：降级是唯一写入 —— 走既有两个 owner，落进 deltas
// ═══════════════════════════════════════════════════════════════════════
test('D1: 降级改来源 + 留痕 —— 条目落进 deltas 视图，且被现状查询挡住', () => {
    const stated = FV.assertFact({}, { subject: '沈砚', predicate: '身份', value: '学徒', origin: 'stated', floor: 2, evidence: '' });
    assert.equal(stated.ok, true);
    const { DL, engine } = makeEngine({
        _factVersionState: stated.state,
        conflicts: { conflicts: [] },
        deltaBook: new LEDGERS.DeltaBook(),
    });
    const fid = engine._factVersionState.facts[0].id;
    const r = DL.evidenceGapDowngrade(engine, { factId: fid, why: '无来源' });
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.writes, true);
    assert.equal(r.fromOrigin, 'stated');
    assert.equal(r.toOrigin, 'inferred');
    assert.equal(r.delta, 'recorded', '人读侧必须留痕（落进既有 deltas 视图）');
    assert.equal(r.factId, fid, '必须逐条，不许批量');

    /* ① 来源真的改了，且信任度从账侧取（不在诊断层抄门槛表） */
    assert.equal(engine._factVersionState.facts[0].origin, 'inferred');
    assert.equal(engine._factVersionState.facts[0].trust, FV.ORIGIN_TRUST.inferred);
    assert.equal(r.trust, FV.ORIGIN_TRUST.inferred);
    assert.ok(r.trust < FV.DEFAULT_MIN_TRUST, '推测档必须低于默认信任门槛 —— 这是降级有效性的机制依据');

    /* ② 降级后**现状查询**真的取不到了（机制级断言，不是断字符串） */
    const look = FV.lookup(engine._factVersionState, { subject: '沈砚' });
    assert.equal(look.reason, 'none-trusted', '降级后该条被信任门槛挡住，实际 reason=' + look.reason);
    assert.ok(look.excludedByTrust >= 1, '必须如实报「被信任门槛排除了几条」');

    /* ③ 人读侧：deltas 视图取得到（status=uncertain；changeSince 是 deltas 视图的取数口） */
    assert.equal(engine.deltaBook.deltas.length, 1);
    assert.equal(engine.deltaBook.deltas[0].status, 'uncertain');
    assert.ok(engine.deltaBook.deltas[0].summary.indexOf('降级为推测') >= 0);
    const view = engine.deltaBook.getChangesSince(-1, 50);
    assert.equal(view.length, 1, '降级条目必须出现在 deltas 视图的取数口');
    assert.equal(view[0].status, 'uncertain');

    /* ④ 幂等：再降一次不重复落 origin 事件、也不重复留痕 */
    const revBefore = engine._factVersionState.facts[0].history.length;
    const r2 = DL.evidenceGapDowngrade(engine, { factId: fid, why: '无来源' });
    assert.equal(r2.ok, true);
    assert.equal(r2.writes, false, '已是推测 ⇒ 不改写');
    assert.equal(r2.delta, 'skipped:already-inferred');
    assert.equal(engine.deltaBook.deltas.length, 1, '幂等重放不得重复留痕');
    assert.equal(engine._factVersionState.facts[0].history.length, revBefore, '幂等重放不得重复落历史事件');
});

test('D2: 降级失败面逐个如实报 —— 不抛、不写、reason 可归因', () => {
    const { DL, engine } = makeEngine({
        _factVersionState: { facts: FACTS.map((f) => Object.assign({}, f)) },
        conflicts: { conflicts: [] },
    });
    const shot = JSON.stringify(engine._factVersionState.facts);
    for (const [opt, want] of [
        [{}, 'fact-id-required'],
        [{ factId: '不存在' }, 'fact-not-found'],
    ]) {
        const r = DL.evidenceGapDowngrade(engine, opt);
        assert.equal(r.ok, false);
        assert.equal(r.writes, false);
        assert.equal(r.reason, want, '失败原因必须可归因：' + want);
    }
    assert.equal(JSON.stringify(engine._factVersionState.facts), shot, '失败路径一个字都不许改账');

    /* 账不在 / 内核取不到：同样是可归因的失败，不是静默 */
    const noLedger = makeEngine({}).DL.evidenceGapDowngrade({}, { factId: 'x' });
    assert.equal(noLedger.ok, false);
    assert.equal(noLedger.reason, 'fact-ledger-absent');
    const noMod = makeEngine({ _factVersionState: { facts: [] } });
    noMod.DL.bindDeps({ moduleLib: noMod.engine._moduleLib, errLog: () => {}, _changeset: () => null, libs: {} });
    const noKernel = noMod.DL.evidenceGapDowngrade(noMod.engine, { factId: 'x' });
    assert.equal(noKernel.ok, false);
    assert.equal(noKernel.reason, 'module-unavailable');
});

test('D3: 宿主接线 —— 三出口在场，取库口挂的是无前缀挂载名', () => {
    assert.ok(at(HOST_SRC, A_HOST_FWD) > 0, '宿主必须转发 evidenceGapBench');
    assert.ok(at(HOST_SRC, 'evidenceGapDowngrade(...args) {') > 0, '宿主必须转发 evidenceGapDowngrade');
    assert.ok(at(HOST_SRC, '_evidenceGapBenchLine(...args) {') > 0, '宿主必须转发诊断行');
    /* 挂载名：本模块是 `MemoryArchaeologyGapBench`（**无** LonSha 前缀），取库口必须照它写。
     *   ★ 首跑这条红（注释没命中）是**判据切片错**：我从 `function _gapBenchLib() {` 起切，
     *   而口径注释写在函数**之前**，于是「与 memory-archaeology.js 的分野」那句被切在片外。
     *   起点改为注释块首行（它在本文件里唯一）。 */
    const libFn = seg(HOST_SRC, '/* [v3.441.0 · L13-X4] 证据缺口工作台的取库口。',
        '/* [v3.430.0 · L12-X] X 系列六面的四件', '_gapBenchLib 注释+函数');
    assert.ok(libFn.indexOf('MemoryArchaeologyGapBench') >= 0, '取库口必须挂 MemoryArchaeologyGapBench（无 LonSha 前缀）');
    assert.equal(libFn.indexOf('LonShaMemoryArchaeologyGapBench'), -1, '不许写成带前缀的名字（那是另一个空挂载）');
    /* 与「沿革叙述」不是同一件 —— 两者名字近似，注释必须说清 */
    assert.ok(libFn.indexOf('memory-archaeology.js') >= 0, '注释必须点名与 memory-archaeology.js 的分野');
    assert.ok(libFn.indexOf('_moduleLib(() => window.MemoryArchaeologyGapBench') >= 0, '真取数口必须在片内（防止只切到注释）');
});

// ═══════════════════════════════════════════════════════════════════════
// E 组：负控制 —— 真源码破坏 → 加载破坏副本 → 在副本上重跑同一条判据
// ═══════════════════════════════════════════════════════════════════════
// 【三种假绿形态，逐条避开】
//   ① 对原文件断言（破坏没发生也绿）→ 一律在破坏副本上跑；
//   ② 破坏写死成模拟常量（真判据根本没被调用）→ 一律 loadBroken 真加载；
//   ③ 破坏把判据自己删了（自我指涉）→ 判据函数不引用锚点串。
let NEG_SEQ = 0;
function loadBroken(mutatedSrc, tag) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3441_neg_'));
    const f = path.join(dir, 'gap-broken-' + (NEG_SEQ++) + '-' + (tag || 'x') + '.js');
    fs.writeFileSync(f, mutatedSrc, 'utf8');
    const mod = require_(f);
    fs.rmSync(dir, { recursive: true, force: true });
    return mod;
}

/* 判据①：「判不了」不得被写成「证据丢了」。只吃模块实例，不引用锚点串。 */
function judgeUndecidableStaysUndecidable(mod) {
    const out = [];
    const facts = [{ id: 'n1', subject: '甲', predicate: '住处', value: '东巷', origin: 'stated', evidence: '一条足够长的引用文字' }];
    const r = mod.auditGaps({ facts, conflicts: [], conflictsAvailable: true }, { resolveSource: () => null });
    for (const it of (r.thin || [])) {
        if (it.cause === 'source-lost') out.push('判不了被写成证据失效:' + it.factId);
        if (it.sourceChecked !== false) out.push('sourceChecked 撒谎:' + it.sourceChecked);
    }
    if (r.counts['source-lost'] !== 0) out.push('source-lost 计数应为 0，实为 ' + r.counts['source-lost']);
    return out;
}

/* 判据②：矛盾是独立一档，不得被并进「从没证据」。 */
function judgeContradictionSeparate(mod) {
    const out = [];
    const facts = [{ id: 'n2', subject: '甲', predicate: '身份', value: '学徒', origin: 'stated', evidence: '' }];
    const r = mod.auditGaps({ facts, conflicts: [{ subject: '甲', versionA: 'a', versionB: 'b' }], conflictsAvailable: true }, {});
    const it = (r.thin || []).find((x) => x.factId === 'n2');
    if (!it) return ['条目未入盘'];
    if (it.cause !== 'contradicted') out.push('主因被并成:' + it.cause);
    if ((it.causes || []).indexOf('contradicted') < 0) out.push('命中集丢掉了矛盾');
    if (r.counts.contradicted !== 1) out.push('矛盾档计数:' + r.counts.contradicted);
    return out;
}

/* 判据③：矛盾账不在时不得报「查过」。 */
function judgeAbsentLedgerNotChecked(mod) {
    const out = [];
    const facts = [{ id: 'n3', subject: '乙', predicate: '年纪', value: '二十', origin: 'stated', evidence: '' }];
    const r = mod.auditGaps({ facts, conflicts: [], conflictsAvailable: false }, {});
    if (r.checked.conflict !== false) out.push('checked.conflict 撒谎:' + r.checked.conflict);
    for (const it of (r.thin || [])) {
        if (it.conflictChecked !== false) out.push('条目侧谎报已核验:' + it.factId);
    }
    return out;
}

test('E1: 负控制①把「判不了」写成「证据丢了」→ 判据必红', () => {
    const broken = loadBroken(breakSource(KB_SRC, A_NEG_LOST,
        'else { sourceChecked = true; causes.push(GAP_CAUSES.SOURCE_LOST); }', '判不了当丢了'), 'lost');
    assert.equal(typeof broken.auditGaps, 'function', '破坏副本必须还能加载（否则红在加载栈，判据没跑）');
    assert.deepEqual(judgeUndecidableStaysUndecidable(KB), [], '原版上同判据必须绿（否则是判据本身错）');
    assert.ok(judgeUndecidableStaysUndecidable(broken).length > 0,
        '判不了被写成证据失效后判据必须红（若仍绿说明判据没盯住真源）');
});

test('E2: 负控制②把矛盾并进「从没证据」→ 分档判据必红', () => {
    const broken = loadBroken(breakSource(KB_SRC, A_NEG_MERGE,
        'if (sk && conflictSubjects.has(sk)) causes.push(GAP_CAUSES.NO_SOURCE);', '合并矛盾档'), 'merge');
    assert.deepEqual(judgeContradictionSeparate(KB), [], '原版上同判据必须绿');
    assert.ok(judgeContradictionSeparate(broken).length > 0,
        '矛盾被并进从没证据后判据必须红（这正是计划点名的负控制）');
});

test('E3: 负控制③矛盾账不在却当「查过」→ 核验判据必红', () => {
    const broken = loadBroken(breakSource(KB_SRC, A_NEG_CONFLICT_ON, 'if (true) {', '账不在也当查过'), 'conflict');
    assert.deepEqual(judgeAbsentLedgerNotChecked(KB), [], '原版上同判据必须绿');
    assert.ok(judgeAbsentLedgerNotChecked(broken).length > 0,
        '矛盾账不在却报「查过且没矛盾」后判据必须红');
});

test('E4: 负控制④已撤销条目被静默跳过（不计数）→ 判据必红', () => {
    const out = [];
    const facts = [
        { id: 'r1', subject: '甲', predicate: '旧姓', value: '苏', origin: 'stated', evidence: '', revoked: true },
        { id: 'r2', subject: '甲', predicate: '新名', value: '苏二', origin: 'stated', evidence: '' }
    ];
    const judge = (mod) => {
        const r = mod.auditGaps({ facts, conflicts: [], conflictsAvailable: true }, {});
        return (r.skippedRevoked === 1) ? [] : ['已撤销未盘应为 1，实为 ' + r.skippedRevoked];
    };
    const broken = loadBroken(breakSource(KB_SRC, 'if (f.revoked === true) { skippedRevoked += 1; continue; }',
        'if (f.revoked === true) { continue; }', '撤销被静默'), 'revoked');
    assert.deepEqual(judge(KB), [], '原版必须如实报「已撤销未盘 1 条」');
    assert.ok(judge(broken).length > 0, '静默跳过撤销条目后判据必须红（静默跳过等于把它们藏了）');
});

// ═══════════════════════════════════════════════════════════════════════
// F 组：当版锚点
// ═══════════════════════════════════════════════════════════════════════
test('F1: 出生锚 + 三源互等 —— 本档生于 3.441.0，只承诺不倒退（当版锚已交棒）', () => {
    /* ★ 本档是**历史档案**：它的职责是钉住「本面落在 3.441.0」这件事，
     *   不是钉「今天的当版还是 3.441.0」。把出生版写成永恒当版，抬版当天必红
     *   （v3.442.0 批验实测：assert.equal(MANIFEST.version, CUR) 实 3.442.0 / 期望 3.441.0）。
     *   当版锚的职责已交棒给当版档案 tests/v3442_l13_x6_silence_list.test.mjs 的 F2。
     *   口径照 tests/v3203_version_guard_handover.test.mjs 第 12 条「交棒链已拆」：
     *   出生锚下界 + 三源互等（钉同源，不钉字面量）+ 只承诺不倒退。 */
    const BORN_V = '3.441.0';
    const vnum = (v) => {
        const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(v || '').trim());
        return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
    };
    assert.equal(vnum(BORN_V), 3441000, '出生锚（vnum 形）：3.441.0 ⇒ 3441000');
    /* 三源互等：钉的是「同源」，一个字面量都不写死。 */
    const live = (/const VERSION = '([0-9]+[.][0-9]+[.][0-9]+)'/.exec(HOST_SRC) || [])[1];
    assert.equal(live, MANIFEST.version, 'index.js VERSION 与 manifest 必须同源（实 ' + live + ' / ' + MANIFEST.version + '）');
    assert.equal(MANIFEST.version, PKG.version, 'manifest 与 package 必须同源');
    /* 只承诺不倒退（本项目版本号单调递增）。 */
    assert.ok(vnum(live) >= vnum(BORN_V), '当版不得低于出生版（实 ' + live + ' / 出生 ' + BORN_V + '）');
    assert.ok(at(KB_SRC, 'const GAP_VERSION = ') > 0, '内核版本常量必须在场（防测了旧版）');
    assert.equal(KB.GAP_VERSION, 1);
    assert.ok(fs.existsSync(path.join(ROOT, 'memory-archaeology-gap-bench.js')));
    /* 诊断层版本声明也要在场（本面在 v3.441.0 落地） */
    assert.ok(at(DIAG_SRC, 'L13-X4 证据缺口工作台') > 0, '诊断层必须有本面的分区注释');
    assert.ok(at(UI_SRC, '[v3.441.0 · L13-X4]') > 0, '面板必须有本面的分区标记');
});
