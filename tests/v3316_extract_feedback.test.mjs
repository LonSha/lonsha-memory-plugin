// tests/v3316_extract_feedback.test.mjs — v3.316.0 · M-X7 提取质量反馈与可控策略配置
// 主题：**这次为什么提取错了、怎样减少同类错误** —— 五类错法各自可指认，建议必须有据。
//
//   【与 v3294（X8 召回解释）的关系（两个方向）】
//     X8 答「**召回链路**断在哪一格」（注入没进来 / 被裁掉 / 源被关）；
//     M-X7 答「**提取**错在哪一类、建议有没有据」。本档判**后者**。
//
//   【承重面】
//     · 五类错法**不得压成一句「提错了」**（它们指向五个不同的面）；
//     · 建议的背书**只看真读数**：对照重跑（X3）缺席 ⇒ unproven（判不了），
//       留出集未验 / 退化 ⇒ overfit（只优化了当前样本）——「当前样本对了」不算证据；
//     · `apply.auto` **恒为 false**（M-X7 验收：自动调参默认关闭）；
//     · 反馈**不写历史事实**（返回面显式带 `writesHistoryFact:false`），原文依据只存**摘要**；
//     · 「等待用户」≠「不可用」≠「判不了」（应用闸四态不得压格）。
//
//   【边界（诚实）】
//     ① 本档不替 X3 / O6 背书：对照重跑读数由调用方给出（本档只判**怎么用**这些读数）。
//     ② 不判「用户的分类对不对」（那是人的判定 —— 本档判的是「分类结果指向的面是否可处置」）。
//     ③ 全量未跑（用户纪律）：本档为定向复验。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { breakSource, assertSingleHit } from './_break_kit.mjs';
import { stripComments } from './_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ok = (m) => console.log('  ✓ ' + m);

const MOD = 'extract-feedback.js';
const IDX = 'index.js';
const BORN = '3.316.0';
const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);

import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);

const MOD_SRC = read(MOD);
const SELF = read('tests/v3316_extract_feedback.test.mjs');
const IDX_SRC = read(IDX);
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));

const FB = require_(path.join(ROOT, MOD));
/** 依赖装配（与宿主 `_extractFeedbackDeps()` 同口径：对照必需、召回解释可选）。 */
const DEPS = Object.freeze({
    COMPARE: { compareStrategies() {} },
    RECALL_EXPLAIN: { explainRecall() {} }
});
/** 真读数桩：对照可测 + 留出集真跑且改善 ⇒ proven。 */
const TR_PROVEN = Object.freeze({ compare: { measurable: true }, holdout: { measured: true, improved: true } });
const TR_OVERFIT = Object.freeze({ compare: { measurable: true }, holdout: { measured: false } });
const TR_REGRESS = Object.freeze({ compare: { measurable: true }, holdout: { measured: true, regressed: true } });
const TR_NONE = Object.freeze({});

/* ── 破坏锚点（逐字取自真源，禁改；本档须逐字持有） ── */
const A_UNKNOWN = "            if (PROBLEM_CLASSES.indexOf(raw) >= 0) {";
const A_MULTI = "        if (hit.length === 1) {";
const A_TARGET = "        missed: 'extraction-trigger', misrecorded: 'extraction-content',";
const A_PROVEN = "            } else if (ho.improved === true) {";
const A_GATE = "        if (s.proof === 'unproven') {";
const A_LINK = "            const lk = LINK_STATES.indexOf(r.link) >= 0 ? r.link : 'indeterminate';";
const A_AUTO = "                auto: false, kind: kind, key: null, from: null, to: null,";
const A_DIGEST = "                evidenceDigest: ev.sourceText ? ev.sourceText.slice(0, 80) : '',";
const A_SELF_LEN = 'assert.ok(SELF.length > 4000';

/* ══════════════════ 判据本体（纯函数：负控制要在破坏副本上重跑它们） ══════════════════ */

/** M1：登记面恰一次（位置不作判据）+ 零兄弟依赖 + 双导出 + 冻结 + 离线。 */
function judgeMeta(P, mf, src) {
    if (!P || typeof P !== 'object') return '模块须可加载（CJS 双导出）';
    const hits = (mf.extra_js || []).filter((f) => f === MOD);
    if (hits.length !== 1) return 'extra_js 里 ' + MOD + ' 必须恰出现 1 次，实 ' + hits.length;
    if (mf.extra_js.indexOf('knowledge-preview.js') < 0) return '本模块与其追加时的邻居（knowledge-preview.js）须都在 extra_js（位置不作判据）';
    const code = stripComments(src);
    for (const w of ['require(', 'fetch(', 'XMLHttpRequest', 'localStorage', 'indexedDB', 'WebSocket']) {
        if (code.indexOf(w) >= 0) return '模块须零依赖零联网：不得出现 ' + w;
    }
    if (!code.includes('module.exports = api')) return '必须保留 CJS 导出';
    if (!/global\.LonShaExtractFeedback = api;|root\.LonShaExtractFeedback = api;/.test(code)) return '必须挂浏览器全局（宿主按全局名取件）';
    if (!/const api = Object\.freeze\(\{/.test(code)) return '导出面须冻结（防宿主侧被改写）';
    if (typeof globalThis.LonShaExtractFeedback !== 'object') return 'globalThis.LonShaExtractFeedback 必须被挂上';
    if (Object.isFrozen(globalThis.LonShaExtractFeedback) !== true) return '全局挂载须冻结（防宿主侧被改写）';
    return '';
}

/** M2：导出面逐字（五类三表 / 三背书 / 四态表 / 依赖声明面）。 */
function judgeExports(P) {
    for (const k of ['classify', 'evidenceOf', 'record', 'tally', 'suggest', 'evidence', 'gate', 'batch',
        'describe', 'selfCheck', 'line', 'surfaceDigest']) {
        if (typeof P[k] !== 'function') return '导出面缺函数：' + k;
    }
    if (P.FB_VERSION !== 1 || P.FB_RECORD_VERSION !== 1) return '版本常量须为 1';
    if (P.FB_KIND !== 'extract_feedback') return 'kind 须为 extract_feedback';
    if (P.PROBLEM_CLASSES.join(',') !== 'missed,misrecorded,wrong-role,stale-not-superseded,should-not-record') {
        return '五类逐字：' + P.PROBLEM_CLASSES.join(',');
    }
    if (P.PROOF_VERDICTS.join(',') !== 'proven,overfit,unproven') return '背书三态逐字：' + P.PROOF_VERDICTS.join(',');
    if (P.GATE_STATES.join(',') !== 'awaiting-user,planned,not-applicable,indeterminate') return '应用闸四态逐字：' + P.GATE_STATES.join(',');
    if (P.EVIDENCE_FIELDS.join(',') !== 'floor,sourceText,extractVersion') return '原始依据三件逐字：' + P.EVIDENCE_FIELDS.join(',');
    /* ★ 五类 -> 目标面**一一对应**（两类别指向同一面 ⇒ 有类别无法被定向处置）。 */
    const seen = {};
    for (const c of P.PROBLEM_CLASSES) {
        const t = P.CLASS_TARGETS[c];
        if (!t) return '类别缺目标面：' + c;
        if (seen[t]) return '两类指向同一面（无法定向处置）：' + t;
        seen[t] = true;
        if (!P.CLASS_LABELS[c]) return '类别缺标签：' + c;
        if (!P.CLASS_KINDS[c]) return '类别缺动作种类：' + c;
    }
    return '';
}

/** C1：五类各自可达且指向不同面；未知类别 / 多信号不得落默认档。 */
function judgeClasses(P) {
    const byFlag = {
        missed: { notExtracted: true }, misrecorded: { contentWrong: true },
        'wrong-role': { roleMismatch: true }, 'stale-not-superseded': { supersededMissing: true },
        'should-not-record': { notRecordable: true }
    };
    for (const c of P.PROBLEM_CLASSES) {
        const r = P.classify({ flags: byFlag[c] });
        if (r['class'] !== c) return '信号 ' + JSON.stringify(byFlag[c]) + ' 应落 ' + c + '，实 ' + r['class'];
        if (r.ok !== true) return '单信号须判得了：' + c;
        if (!r.target || r.target !== P.CLASS_TARGETS[c]) return '目标面须取自真源：' + c;
    }
    /* ★ 显式类别优先，但**表外一律 unknown**（不得落默认档）。 */
    const bad = P.classify({ 'class': 'something-else' });
    if (bad['class'] !== 'unknown' || bad.ok !== false) return '表外类别须判 unknown（不落默认档），实 ' + bad['class'];
    /* ★ 多信号共存 ⇒ 判不了（按一面处置会改错地方）。 */
    const multi = P.classify({ flags: { notExtracted: true, contentWrong: true } });
    if (multi['class'] !== 'unknown' || multi.ok !== false) return '多信号共存须判不了，实 ' + multi['class'];
    if (!/多个信号/.test(multi.why)) return '多信号的理由须点名「多个信号」';
    /* 无信号 / 非对象一律判不了（不猜）。 */
    if (P.classify({}).ok !== false) return '无信号须判不了';
    if (P.classify(null).ok !== false) return '非对象须判不了';
    return '';
}

/** R1：反馈记录 —— 不写历史事实 / 依据三件分列 / 只存摘要（不复制第二份事实库）。 */
function judgeRecord(P) {
    const item = { 'class': 'missed', floor: 7, sourceText: '她那阵子把首饰都当掉了，一直没赎回来。后来绸缎庄的账也赊着，掌柜催了两回，她把耳钻也卖了。那一冬她没添过一件衣裳，灶下的柴都是拣的，院里堆着的都是半截的烛头，霜降了还晒着萝卜干。', extractVersion: 'v1' };
    const r = P.record([], item, { now: 123 });
    if (r.ok !== true || r.count !== 1) return '记录须成功，实 ' + r.ok + '/' + r.count;
    /* ★ 验收①：反馈不得直接成为历史事实 —— 返回面显式带 false。 */
    if (r.writesHistoryFact !== false) return '★ 反馈不得写历史事实（返回面须显式带 false）';
    const rec = r.list[0];
    if (rec.link !== 'linked') return '依据齐备时 link 须 linked，实 ' + rec.link;
    if (rec.evidenceComplete !== true) return '依据齐备时须自报完整';
    /* ★ 只存摘要：不得整段携带（反馈面不是第二条事实库）。 */
    if (rec.evidenceDigest.length > 80) return '原文依据只准存摘要（<= 80 字），实 ' + rec.evidenceDigest.length;
    if (rec.sourceText !== undefined) return '记录不得携带 sourceText 全字段（只存摘要）';
    /* 依据缺件 ⇒ 如实降级（不得用空串冒充给出了依据）。 */
    const part = P.record([], { 'class': 'missed', floor: 7 }, {});
    if (part.list[0].link !== 'missing-evidence') return '依据缺件须报 missing-evidence，实 ' + part.list[0].link;
    if (part.list[0].evidenceMissing.indexOf('sourceText') < 0) return '缺件须逐项点名（sourceText）';
    /* 楼层 0 与「没给楼层」不得同形。 */
    const zero = P.record([], { 'class': 'missed', floor: 0, sourceText: 'x', extractVersion: 'v1' }, {});
    if (zero.list[0].floor !== 0) return '楼层 0 须保留为 0（不得读成未给）';
    const none = P.record([], { 'class': 'missed', sourceText: 'x', extractVersion: 'v1' }, {});
    if (none.list[0].floor !== null) return '未给楼层须为 null（不得编 0）';
    /* 悬空与依据不全不同形。 */
    const dang = P.record([], { 'class': 'missed', floor: 9, sourceText: 'x', extractVersion: 'v1', dangling: true }, {});
    if (dang.list[0].link !== 'dangling') return '悬空须单列 dangling，实 ' + dang.list[0].link;
    /* 类别判不了 ⇒ link 也判不了（不得报「记录得挺好」）。 */
    const ind = P.record([], { 'class': 'nope', floor: 1, sourceText: 'x', extractVersion: 'v1' }, {});
    if (ind.list[0].link !== 'indeterminate') return '类别判不了时 link 须 indeterminate，实 ' + ind.list[0].link;
    /* 有界环形 + 不改入参。 */
    let list = [];
    for (let i = 0; i < P.MAX_RECORDS + 5; i++) list = P.record(list, item, {}).list;
    if (list.length !== P.MAX_RECORDS) return '反馈列表须有界（MAX_RECORDS=' + P.MAX_RECORDS + '），实 ' + list.length;
    const before = JSON.stringify(item);
    P.record(list, item, {});
    if (JSON.stringify(item) !== before) return '记录不得就地改写入参';
    /* 入参畸形 ⇒ 降级为读数（不抛、不假装记下了）。 */
    const mal = P.record([], 'not-an-object', {});
    if (mal.ok !== false || mal.writesHistoryFact !== false) return '入参畸形须降级（不抛、不假装记下了）';
    if (mal.decidable !== false) return '入参畸形须报 decidable:false';
    return '';
}

/** T1：按五类聚合 + 关联四态分列（悬空 ≠ 依据不全 ≠ 未归类 ≠ 已关联）。 */
function judgeTally(P) {
    const list = [
        { cls: 'missed', link: 'linked' }, { cls: 'missed', link: 'linked' },
        { cls: 'wrong-role', link: 'dangling' }, { cls: 'nope', link: 'dangling' },
        { cls: 'misrecorded', link: 'missing-evidence' }, { cls: 'x', link: 'weird' }
    ];
    const t = P.tally(list, {});
    if (t.measurable !== true) return '列表可测';
    if (t.total !== 6) return '合计须为 6，实 ' + t.total;
    if (t.byClass['missed'] !== 2) return 'missed 须计 2，实 ' + t.byClass['missed'];
    if (t.byClass['wrong-role'] !== 1) return 'wrong-role 须计 1';
    /* ★ 不在五类内的**计入 unknown**（不得归入任何一类）。 */
    if (t.unknown !== 2) return '不在五类内的须计 unknown，实 ' + t.unknown;
    /* ★ 关联四态分列：悬空 / 依据不全 / 未归类 / 已关联各计各的。 */
    if (!t.byLink) return '关联状态须分列（byLink）';
    if (t.byLink['linked'] !== 2) return 'linked 须计 2，实 ' + t.byLink['linked'];
    if (t.byLink['dangling'] !== 2) return 'dangling 须计 2，实 ' + t.byLink['dangling'];
    if (t.byLink['missing-evidence'] !== 1) return 'missing-evidence 须计 1';
    if (t.byLink['indeterminate'] !== 1) return '未知 link 须计 indeterminate，实 ' + t.byLink['indeterminate'];
    /* 指向面读数据：只给真出现过的类别。 */
    if (t.targets['extraction-trigger'] !== 2) return '指向面读据须只含真出现的类别，实 ' + JSON.stringify(t.targets);
    if (t.targets['admission-gate'] !== undefined) return '未出现的类别不得出现在指向面里';
    /* 空列表与「非列表」不同形。 */
    const e = P.tally([], {});
    if (e.total !== 0 || e.empty !== true || e.measurable !== true) return '空列表须 measurable 且 empty';
    const na = P.tally('nope', {});
    if (na.measurable === true) return '非列表不得报可测';
    return '';
}

/** S1：建议的**背书只看真读数**（对照缺席 ⇒ 判不了；留出集未验 / 退化 ⇒ 过拟合）。 */
function judgeSuggest(P) {
    const fb = { cls: 'missed', evidenceComplete: true };
    /* ① 无对照读数 ⇒ unproven（★ 不用「当前样本」代替证据，不编原因）。 */
    const none = P.suggest(fb, TR_NONE, {});
    if (none.proof !== 'unproven') return '无对照读数须 unproven，实 ' + none.proof;
    if (none.decidable !== false) return 'unproven 须报 decidable:false（判不了 ≠ 改不动）';
    /* ② 对照可测但留出集未验 ⇒ overfit（只证明了当前样本）。 */
    const ov = P.suggest(fb, TR_OVERFIT, {});
    if (ov.proof !== 'overfit') return '留出集未验须 overfit，实 ' + ov.proof;
    if (!/过拟合|未验/.test(ov.proofWhy)) return 'overfit 的理由须点名过拟合/未验，实 ' + ov.proofWhy;
    /* ③ 留出集**退化** ⇒ 明确不建议采用（不是「差不多」）。 */
    const rg = P.suggest(fb, TR_REGRESS, {});
    if (rg.proof !== 'overfit') return '留出集退化须 overfit，实 ' + rg.proof;
    if (!/退化/.test(rg.proofWhy)) return '退化理由须点名「退化」';
    /* ④ 对照可测 + 留出集改善 ⇒ proven。 */
    const pv = P.suggest(fb, TR_PROVEN, {});
    if (pv.proof !== 'proven') return '双绿须 proven，实 ' + pv.proof;
    if (pv.decidable !== true) return 'proven 须 decidable:true';
    /* ★ 验收③：apply.auto 恒为 false（不是「默认值是 false」）。 */
    if (pv.suggestions[0].apply.auto !== false) return '★ apply.auto 须恒为 false（自动调参默认关闭）';
    if (pv.autoParamTuning !== false) return 'autoParamTuning 须恒为 false';
    /* ★ 建议必须指向该类的面（不得一律给同一个面）。 */
    if (pv.suggestions[0].targets.join(',') !== P.CLASS_TARGETS['missed']) return '建议须指向该类对应的面';
    /* ★ evidence[].field 必须是可核路径（含类别与真读数路径）。 */
    const fields = pv.suggestions[0].evidence.map((e) => e.field).join('|');
    if (fields.indexOf('cls') < 0) return '依据须含类别路径';
    if (fields.indexOf('holdout.improved') < 0) return '依据须含留出集路径（不编原因）';
    /* ⑤ 类别判不了 ⇒ **只给一条**「先修归类」，绝不在错的类别上编配置建议。 */
    const bad = P.suggest({ cls: 'nope' }, TR_PROVEN, {});
    if (bad.count !== 1) return '类别判不了时须只给一条建议，实 ' + bad.count;
    if (bad.suggestions[0].id !== 'fix-classification') return '那条建议须是「先修归类」';
    if (bad.decidable !== false) return '类别判不了时 decidable 须 false';
    /* ⑥ 坏源降级：轨迹入参畸形 ⇒ unproven（不抛）。 */
    const mal = P.suggest(fb, 'not-an-object', {});
    if (mal.proof !== 'unproven') return '轨迹入参畸形须 unproven';
    if (!/降级|畸形/.test(mal.proofWhy)) return '畸形理由须点名降级';
    /* 无反馈 ⇒ 不产建议（不为了「有建议」而编）。 */
    const noFb = P.suggest(null, TR_PROVEN, {});
    if (noFb.count !== 0 || noFb.ok !== false) return '无反馈须不产建议';
    /* 不改入参。 */
    const fbSnap = JSON.stringify(fb);
    P.suggest(fb, TR_PROVEN, {});
    if (JSON.stringify(fb) !== fbSnap) return '建议不得就地改写入参';
    return '';
}

/** G1：应用闸四态 —— 等待用户 ≠ 不可用 ≠ 判不了。 */
function judgeGate(P) {
    const pv = P.suggest({ cls: 'missed' }, TR_PROVEN, {}).suggestions[0];
    /* 有背书但未确认 ⇒ awaiting-user（该提示用户）。 */
    const a = P.gate(pv, {});
    if (a.state !== 'awaiting-user') return '未确认须 awaiting-user，实 ' + a.state;
    if (a.decidable !== true) return 'awaiting-user 是判得了的（decidable:true）';
    if (a.mayApply !== false) return '未确认不得可应用';
    /* 确认后 ⇒ planned。 */
    const p = P.gate(pv, { userConfirmed: true });
    if (p.state !== 'planned' || p.mayApply !== true) return '确认后须 planned 且 mayApply';
    /* 依据不全（且要求依据）⇒ not-applicable（判得了，但不适用）。 */
    const na = P.gate({ proof: 'proven', evidenceComplete: false }, { requiresEvidence: true });
    if (na.state !== 'not-applicable') return '依据不全须 not-applicable，实 ' + na.state;
    if (na.decidable !== true) return 'not-applicable 仍判得了';
    /* ★ 无背书 ⇒ indeterminate（判不了），**不得被读成「不用做」**。 */
    const ind = P.gate({ proof: 'unproven' }, { userConfirmed: true });
    if (ind.state !== 'indeterminate') return '无背书须 indeterminate，实 ' + ind.state;
    if (ind.mayApply !== false) return '无背书不得可应用（哪怕用户已确认）';
    if (ind.decidable !== false) return 'indeterminate 须 decidable:false';
    /* 无建议 ⇒ 判不了（不假装没什么要做的）。 */
    const n = P.gate(null, {});
    if (n.state !== 'indeterminate' || n.decidable !== false) return '无建议须 indeterminate';
    /* ★ 四态必须都能到达且互不同形。 */
    const states = [a.state, p.state, na.state, ind.state];
    if ((new Set(states)).size !== P.GATE_STATES.length) return '四态须齐备且互不同形：' + states.join(',');
    return '';
}

/** B1：批量与单条同函 + 空批 ≠ 全判不了 + 非数组不可测。 */
function judgeBatch(P) {
    const list = [{ cls: 'missed' }, { cls: 'nope' }, { cls: 'misrecorded' }];
    const b = P.batch(list, TR_PROVEN, {});
    if (b.total !== 3) return '批量须逐条出读数';
    if (b.measurable !== true) return '列表批量可测';
    /* ★ 与单条**同函**：逐条与直接调单条读数一致。 */
    for (let i = 0; i < list.length; i++) {
        const one = P.suggest(list[i], TR_PROVEN, {});
        if (b.rows[i].proof !== one.proof) return '批量第 ' + i + ' 条须与单条同函（proof 不一致）';
        if (b.rows[i].decidable !== one.decidable) return '批量第 ' + i + ' 条 decidable 须与单条一致';
    }
    if (b.byProof['unproven'] !== 1) return 'byProof 须计入判不了的那条，实 ' + JSON.stringify(b.byProof);
    if (b.indeterminate !== 1) return 'indeterminate 计数须可见，实 ' + b.indeterminate;
    if (b.autoParamTuning !== false) return '批量面同样恒 false';
    /* ★ 空批与「有但全判不了」不同形。 */
    const e = P.batch([], TR_PROVEN, {});
    if (e.total !== 0 || e.measurable !== true || e.empty !== true) return '空批须 measurable 且 empty';
    if (e.indeterminate !== 0) return '空批不得报判不了';
    const allInd = P.batch([{ cls: 'nope' }], TR_NONE, {});
    if (allInd.total !== 1 || allInd.indeterminate !== 1) return '全判不了的批须与空批不同形';
    if (allInd.empty !== false) return '全判不了的批不是空批';
    /* 非数组不可测。 */
    const na = P.batch('nope', TR_PROVEN, {});
    if (na.measurable === true) return '非数组不得报可测';
    return '';
}

/** D1：依赖面 —— 缺格只列必需件；自检真跑；判定「类→面」不变量。 */
function judgeDeps(P) {
    const d = P.describe({});
    if (d.missingDeps.join(',') !== 'COMPARE') return '缺格须只列必需件，实 ' + d.missingDeps.join(',');
    if (P.describe(DEPS).missingDeps.length !== 0) return '依赖齐备时不得报缺格';
    if (P.describe({}).optionalMissing.indexOf('RECALL_EXPLAIN') < 0) return '可选件缺席须另列';
    /* ★ 三条不变量自述。 */
    if (d.autoParamTuning !== false) return '自述须写明自动调参关闭';
    if (d.writesHistoryFact !== false) return '自述须写明反馈不写历史事实';
    if (d.evidenceDigestOnly !== true) return '自述须写明依据只存摘要';
    if (d.targetDistinct !== true) return '自述须报五类指向的面互不相同';
    /* 自检真跑。 */
    const sc = P.selfCheck({});
    if (sc.ok !== true) return '自检须通过：' + JSON.stringify(sc.problems);
    if (sc.probes.missed !== 'missed' || sc.probes.shouldNotRecord !== 'should-not-record') return '自检须真跑首末两类';
    if (sc.probes.unknownClass !== 'unknown' || sc.probes.multiSignal !== 'unknown') return '自检须含判不了探针';
    if (sc.probes.unproven !== 'unproven' || sc.probes.proven !== 'proven' || sc.probes.overfit !== 'overfit') return '自检须真跑三种背书';
    if (sc.probes.gateInd !== 'indeterminate') return '自检须含应用闸判不了探针';
    if (sc.probes.noHistoryFact !== false) return '自检须验「不写历史事实」';
    if (sc.probes.autoOff !== false) return '自检须验「自动调参关闭」';
    /* evidenceOf 三态可见。 */
    const ev = P.evidenceOf({ floor: 3, sourceText: 'x', extractVersion: 'v1' });
    if (ev.complete !== true || ev.missing.length !== 0) return '依据三件齐备须报完整';
    const ev2 = P.evidenceOf({});
    if (ev2.complete !== false || ev2.missing.length !== 3) return '依据全缺须三项都点名';
    return '';
}

/** Z1：零写（源码零写口 / 三处快照）+ 面级四处「源码」不变量（负控制要重跑它们）。 */
function judgeZeroWrite(P, src) {
    const code = stripComments(src);
    for (const w of ['storage.save', 'localStorage.setItem', 'writeFile', 'collectExport(']) {
        if (code.indexOf(w) >= 0) return '反馈面不得带写口：' + w;
    }
    /* 三处入参快照（列表 / 反馈 / 轨迹）。 */
    const list = [{ cls: 'missed', link: 'linked' }];
    const item = { 'class': 'missed', floor: 1, sourceText: 'x', extractVersion: 'v1' };
    const trace = { compare: { measurable: true }, holdout: { measured: true, improved: true } };
    const s1 = JSON.stringify(list), s2 = JSON.stringify(item), s3 = JSON.stringify(trace);
    P.tally(list, {});
    P.record(list, item, {});
    P.suggest(item, trace, {});
    P.batch(list, trace, {});
    if (JSON.stringify(list) !== s1 || JSON.stringify(item) !== s2 || JSON.stringify(trace) !== s3) {
        return '反馈面不得改写传入的 list / item / trace（本面零写）';
    }
    /* ★ 源码级不变量：五类 -> 五面一一对应 + apply.auto 恒 false + 依据只存摘要。 */
    const targets = P.PROBLEM_CLASSES.map((c) => P.CLASS_TARGETS[c]);
    if ((new Set(targets)).size !== targets.length) return '五类指向的面必须互不相同';
    if (P.suggest({ cls: 'missed' }, TR_PROVEN, {}).suggestions[0].apply.auto !== false) return 'apply.auto 恒 false';
    const segAt = code.indexOf('auto: false, kind: kind');
    if (segAt < 0) return '建议的 apply 须显式写 auto: false（不是靠默认值）';
    return '';
}

/** H1：宿主接线逐符号在场（取库口 / 装配点 / 十出口 / 降级 / 诊断行 / 不落笔）。 */
function judgeHost(src) {
    for (const s of [
        "_moduleLib(() => window.LonShaExtractFeedback, 'extract-feedback.js')",
        'function _extractFeedbackLib() {', '_extractFeedbackDeps() {', '_extractFeedbackAbsent(reason) {',
        'extractFeedbackClassify(item) {', 'extractFeedbackRecord(list, item, opts) {',
        'extractFeedbackTally(list, opts) {', 'extractFeedbackSuggest(feedback, trace, opts) {',
        'extractFeedbackGate(suggestion, opts) {', 'extractFeedbackBatch(list, trace, opts) {',
        'extractFeedbackDescribe() {', 'extractFeedbackLine() {'
    ]) {
        const n = src.split(s).length - 1;
        if (n !== 1) return '宿主口须恰好在场一次：' + s + '（实 ' + n + '）';
    }
    for (const s of ["['提取反馈',", '_lastFeedback', 'this.extractFeedbackLine()']) {
        const n = src.split(s).length - 1;
        if (n < 1) return '宿主口须在场：' + s + '（实 ' + n + '）';
    }
    /* ★ 与「召回解释」诊断行**分列**（两个问题，不得合成一行）。 */
    for (const s of ["['提取反馈'", "['召回解释'", "['知识预演'"]) {
        if (src.indexOf(s) < 0) return '诊断行须自成一行且与姊妹面分列：' + s;
    }
    /* ★ 装配点键名须与内核 REQUIRED_DEPS 逐字一致（判在装配点方法体切片里）。 */
    const da = src.indexOf('_extractFeedbackDeps() {');
    const db = src.indexOf('extractFeedbackClassify(item) {');
    if (da < 0 || db <= da) return '装配点方法体切片失败（判据失效）';
    const depsSeg = src.slice(da, db);
    for (const need of FB.REQUIRED_DEPS) {
        if (depsSeg.indexOf(need.key + ':') < 0) return '装配点缺依赖键：' + need.key;
    }
    for (const opt of FB.OPTIONAL_DEPS) {
        if (depsSeg.indexOf(opt + ':') < 0) return '装配点缺可选依赖键：' + opt;
    }
    if (depsSeg.indexOf('LonShaProjectionPipeline') < 0) return '装配点必须取对照重跑内核（唯一真源）';
    /* ★ 出口不得自己落笔（纯函数面：写口归 owner）。 */
    const pa = src.indexOf('extractFeedbackClassify(item) {');
    const pb = src.indexOf('extractFeedbackLine() {');
    if (pa < 0 || pb <= pa) return '出口方法体切片失败（判据失效）';
    const outSeg = src.slice(pa, pb);
    for (const w of ['storage.save', 'restoreFromPayload(', 'localStorage', 'collectExport(', 'writeFile']) {
        if (outSeg.indexOf(w) >= 0) return '本面是纯函数面，出口不得落笔：' + w;
    }
    if (outSeg.indexOf('FB.classify(') < 0) return '归类出口必须真调用内核 classify';
    if (outSeg.indexOf('FB.record(') < 0) return '记录出口必须真调用内核 record';
    if (outSeg.indexOf('FB.suggest(') < 0) return '建议出口必须真调用内核 suggest';
    if (outSeg.indexOf('FB.gate(') < 0) return '应用闸出口必须真调用内核 gate';
    if (outSeg.indexOf('FB.batch(') < 0) return '批量出口必须真调用内核 batch';
    return '';
}

/* ───────────────── 宿主夹具（真取库口 + 真模块，不走 mock） ───────────────── */
const HOST_METHODS = [
    '_extractFeedbackDeps() {', '_extractFeedbackAbsent(reason) {',
    'extractFeedbackClassify(item) {', 'extractFeedbackRecord(list, item, opts) {',
    'extractFeedbackTally(list, opts) {', 'extractFeedbackSuggest(feedback, trace, opts) {',
    'extractFeedbackGate(suggestion, opts) {', 'extractFeedbackBatch(list, trace, opts) {',
    'extractFeedbackDescribe() {', 'extractFeedbackLine() {'
];
const LIB_FNS = ['function _moduleLib(getGlobal, fileName) {', 'function _extractFeedbackLib() {'];
function methodBody(src, header) {
    const at = src.indexOf(header);
    if (at < 0) return null;
    const close = src.indexOf(')', at);
    if (close < 0) return null;
    const open = src.indexOf('{', close);
    if (open < 0) return null;
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > 0 ? src.slice(at, end + 1) : null;
}
function engineFrom(src, win) {
    const J = String.fromCharCode(10);
    const libs = LIB_FNS.map((h) => methodBody(src, h)).join(J);
    const body = HOST_METHODS.map((h) => methodBody(src, h)).join(',' + J);
    if (!libs || HOST_METHODS.some((h) => methodBody(src, h) === null)) {
        throw new Error('宿主接线抽取失败（接线被摘或改名）：判据扫描面失效');
    }
    const eng = new Function('errLog', 'PLUGIN_NAME', 'window', 'ARCHIVE_TOP_LEVEL_KEYS',
        libs + J + 'return ({ ' + body + ' });')(() => {}, 'v3316', win || libWindow(), []);
    return Object.assign(eng, { config: { config: { debugMode: false } }, _lastFeedback: null, _lastFeedbackTally: null });
}
const libWindow = () => ({ LonShaExtractFeedback: FB, LonShaProjectionPipeline: { compareStrategies() {} }, LonShaRecallExplain: { explainRecall() {} } });

/** 破坏副本（落盘 + 语法校验 + 真加载）。 */
function loadBroken(tag, anchor, repl) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3316-' + tag + '-'));
    const fp = path.join(dir, MOD);
    const broken = breakSource(MOD_SRC, anchor, repl, tag);
    assertSingleHit(MOD_SRC, anchor, tag);
    fs.writeFileSync(fp, broken);
    const chk = require_('node:child_process').spawnSync(process.execPath, ['--check', fp], { encoding: 'utf8' });
    assert.equal(chk.status, 0, '破坏副本必须语法可过（否则归因不成立）：' + String(chk.stderr).slice(-300));
    return require_(fp);
}

/* ══════════════════ M 模块与导出面 ══════════════════ */
test('v3316 M1. ★★★★ 模块登记面：分发面恰一次（零兄弟依赖 / 零联网）+ 双导出 + 冻结', () => {
    assert.ok(fs.existsSync(path.join(ROOT, MOD)), MOD + ' 必须在场');
    assert.equal(judgeMeta(FB, MF, MOD_SRC), '', '登记面判据');
    assert.equal(MF.extra_js.filter((x) => x === MOD).length, 1, MOD + ' 须恰登记一次');
    ok('模块 ' + MOD + '：' + MOD_SRC.split('\n').length + ' 行 / ' + Object.keys(FB).length + ' 导出项');
});

test('v3316 M2. ★★★★ 导出面：十二函数 + 五类三表 + 三背书 + 四态表 + 依据三件', () => {
    assert.equal(judgeExports(FB), '', '导出面判据');
    const d = FB.surfaceDigest(FB);
    assert.equal(d.count, Object.keys(FB).length, '指纹须覆盖全部导出名');
    ok('导出面 ' + d.count + ' 项 / digest ' + d.digest);
});

/* ══════════════════ C 分类面 ══════════════════ */
test('v3316 C1. ★★★★★ 五类各自可达且指向不同面；未知类别 / 多信号不落默认档', () => {
    assert.equal(judgeClasses(FB), '', '分类面判据');
    ok('五类 → 五面一一对应；表外类别与多信号共存各自判不了');
});

/* ══════════════════ R 记录面 ══════════════════ */
test('v3316 R1. ★★★★★ 反馈不写历史事实（显式 false）+ 依据三件分列 + 只存摘要', () => {
    assert.equal(judgeRecord(FB), '', '记录面判据');
    ok('记录层：writesHistoryFact:false / 四态 link / 有界环形 / 不改入参');
});

test('v3316 T1. ★★★★ 按五类聚合 + 关联四态分列（悬空 ≠ 依据不全 ≠ 未归类 ≠ 已关联）', () => {
    assert.equal(judgeTally(FB), '', '聚合面判据');
    ok('聚合层：五类计数 + 关联四态分列 + 指向面读据只含真出现者');
});

/* ══════════════════ S 建议面 ══════════════════ */
test('v3316 S1. ★★★★★ 建议背书只看真读数（对照缺席 ⇒ 判不了；留出集未验/退化 ⇒ 过拟合）', () => {
    assert.equal(judgeSuggest(FB), '', '建议面判据');
    ok('建议层：三种背书各自可达 + apply.auto 恒 false + 不改入参');
});

test('v3316 G1. ★★★★★ 应用闸四态：等待用户 ≠ 不可用 ≠ 判不了', () => {
    assert.equal(judgeGate(FB), '', '应用闸判据');
    ok('应用闸：awaiting-user / planned / not-applicable / indeterminate 四态齐备');
});

/* ══════════════════ B 批量面 ══════════════════ */
test('v3316 B1. ★★★★ 批量与单条同函；空批 ≠ 全判不了；非数组不可测', () => {
    assert.equal(judgeBatch(FB), '', '批量面判据');
    ok('批量层：逐条同函 + byProof 计数 + 空批别于全判不了');
});

/* ══════════════════ D 依赖面 ══════════════════ */
test('v3316 D1. ★★★★ 依赖缺格只列必需件 + 自检真跑 + 依据三态可见', () => {
    assert.equal(judgeDeps(FB), '', '依赖面判据');
    ok('依赖层：缺格只列 COMPARE；自检真跑五类/三背书/四态');
});

/* ══════════════════ Z 零写面 ══════════════════ */
test('v3316 Z1. ★★★★★ 零写（源码零写口 + 三处快照）+ 五类应面一一对应', () => {
    assert.equal(judgeZeroWrite(FB, MOD_SRC), '', '零写面判据');
    ok('零写层：list/item/trace 三处快照；源码零写口');
});

/* ══════════════════ H 宿主接线 ══════════════════ */
test('v3316 H1. ★★★★★ 宿主接线逐符号在场（取库口 / 装配点 / 十出口 / 降级 / 诊断行 / 不落笔）', () => {
    assert.equal(judgeHost(IDX_SRC), '', '宿主接线判据');
    ok('宿主接线：定义面恰一次 / 使用面 ≥1 / 装配点键名逐字 / 出口不落笔');
});

test('v3316 H2. ★★★★★ 端到端：宿主真跑一次反馈 → 建议 → 应用闸，各自成读数', () => {
    const eng = engineFrom(IDX_SRC);
    /* 依赖齐备：对照重跑在场。 */
    const deps = eng._extractFeedbackDeps();
    assert.ok(deps.COMPARE, '对照重跑须在场');
    /* 归类。 */
    const cls = eng.extractFeedbackClassify({ flags: { roleMismatch: true } });
    assert.equal(cls['class'], 'wrong-role', '归类须落到错角色');
    assert.equal(cls.target, 'identity-disambiguation', '目标面须取自真源');
    /* 记录（不写历史事实）。 */
    const rec = eng.extractFeedbackRecord([], { 'class': 'missed', floor: 7, sourceText: '她的旧事', extractVersion: 'v1' }, {});
    assert.equal(rec.count, 1, '记录须成功');
    assert.equal(rec.writesHistoryFact, false, '反馈不得写历史事实');
    /* 建议（真读数双语 ⇒ proven）+ apply.auto 恒 false。 */
    const sug = eng.extractFeedbackSuggest(rec.list[0], TR_PROVEN, {});
    assert.equal(sug.proof, 'proven', '双绿须 proven');
    assert.equal(sug.suggestions[0].apply.auto, false, '自动调参须关闭');
    /* 应用闸。 */
    const g = eng.extractFeedbackGate(sug.suggestions[0], { userConfirmed: true });
    assert.equal(g.state, 'planned', '确认后须 planned');
    /* 诊断行三种读数各自成一体。 */
    assert.ok(eng.extractFeedbackLine().indexOf('待用') >= 0, '未跑过聚合时诊断行须报「待用」');
    eng._lastFeedbackTally = eng.extractFeedbackTally(rec.list, {});
    assert.ok(eng.extractFeedbackLine().indexOf('漏记 1') >= 0, '有反馈读数时诊断行须给类别计数');
    /* 模块缺席 ⇒ 同键降级（不报「改过了没事」）。
     * ★ 走「窗口里没有该库」的**新引擎**，而不是在实例上换 `_extractFeedbackLib`：
     *   取库口是**模块级函数**（不在实例上），换实例属性测不到真实缺席路径 ——
     *   首版就是这么写的，实测假绿（降级根本没被触发，仍报 ok:true）。 */
    const engAbsent = engineFrom(IDX_SRC, { LonShaProjectionPipeline: { compareStrategies() {} } });
    const gone = engAbsent.extractFeedbackClassify({ 'class': 'missed' });
    assert.equal(gone.ok, false, '模块缺席须报 ok:false');
    assert.equal(gone.state, 'absent', '模块缺席须报 state:absent');
    assert.equal(gone.writesHistoryFact, false, '降级面同样自报不写历史事实');
    assert.equal(engAbsent.extractFeedbackLine(), '模块未加载（extract-feedback.js）', '模块缺席的诊断行自成一体');
    ok('端到端：deps / 归类 / 记录 / 建议 / 闸 / 降级 六段各自成读数');
});

/* ══════════════════ V 版本锚 ══════════════════ */
test('v3316 V2. ★★★ 版本锚：本档出生版本 + 六源同源（V4 当版锚点形态）', () => {
    assert.equal(vnum(BORN), 3316000, 'vnum 序数必须可数（当版锚点）');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX_SRC) || [])[1];
    assert.ok(codeVer, '入口版本常量必须在场');
    assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立；当前 ' + codeVer);
    assert.equal(MF.version, codeVer, 'manifest 与入口同源');
    assert.equal(PKG.version, codeVer, 'package.json 与入口同源');
    for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const mv = (/let VERSION = '([^']+)'/.exec(read(m)) || [])[1];
        assert.equal(mv, codeVer, m + ' 副本须与入口同源（须是 let：bindDeps 可换，const 会 TypeError）');
    }
    assert.ok(SELF.includes("const BORN = '3.316.0'"), '当版锚点必须显式留在本档里');
});

/* ══════════════════ X 真源码破坏 → 同一条真判据必须翻红 ══════════════════ */
test('v3316 X1. ★★★★★ 真源码破坏 -> 同一条真判据必须翻红（八条各自现形，且原版必须绿）', () => {
    /* L0 地基：同一批判据在**原版**上必须全部通过（否则「翻红」不归因于破坏）。 */
    assert.equal(judgeExports(FB), '', '地基 exports');
    assert.equal(judgeClasses(FB), '', '地基 classes');
    assert.equal(judgeRecord(FB), '', '地基 record');
    assert.equal(judgeTally(FB), '', '地基 tally');
    assert.equal(judgeSuggest(FB), '', '地基 suggest');
    assert.equal(judgeGate(FB), '', '地基 gate');
    assert.equal(judgeBatch(FB), '', '地基 batch');
    assert.equal(judgeDeps(FB), '', '地基 deps');
    assert.equal(judgeZeroWrite(FB, MOD_SRC), '', '地基 zeroWrite');
    assert.equal(judgeHost(IDX_SRC), '', '地基 host');
    /* ★ 破坏副本**抛错**也算翻红：不能因为异常逃逸就让后续断言静默漏跑（本仓负向探针纪律）。 */
    const broke = (fn) => { try { return fn(); } catch (e) { return '破副本抛错（视作翻红）：' + String((e && e.message) || e); } };
    /* ① 表外类别落默认档（写错类别名 ⇒ 静默归到某一类，改错面）。 */
    {
        const b = loadBroken('unknown', A_UNKNOWN, '            if (true) {');
        assert.notEqual(broke(() => judgeClasses(b)), '', '破坏 unknown 后分类面判据必须翻红');
    }
    /* ② 多信号共存被当单信号（按一面处置 ⇒ 改错地方）。 */
    {
        const b = loadBroken('multi', A_MULTI, '        if (hit.length >= 1) {');
        assert.notEqual(broke(() => judgeClasses(b)), '', '破坏 multi 后多信号判据必须翻红');
    }
    /* ③ 两类指向同一个面（有类别无法被定向处置）。 */
    {
        const b = loadBroken('target', A_TARGET, "        missed: 'extraction-trigger', misrecorded: 'extraction-trigger',");
        assert.notEqual(broke(() => judgeZeroWrite(b, MOD_SRC)), '', '破坏 target 后五类应面判据必须翻红');
    }
    /* ④ 留出集改善不再当作背书（把「当前样本对了」当证据）。 */
    {
        const b = loadBroken('proven', A_PROVEN, '            } else if (false) {');
        assert.notEqual(broke(() => judgeSuggest(b)), '', '破坏 proven 后背书判据必须翻红');
    }
    /* ⑤ 无背书被当成可应用（判不了与「不用做」同形）。 */
    {
        const b = loadBroken('gate', A_GATE, '        if (false) {');
        assert.notEqual(broke(() => judgeGate(b)), '', '破坏 gate 后应用闸判据必须翻红');
    }
    /* ⑥ 关联状态被压成一态（悬空与依据不全同形）。 */
    {
        const b = loadBroken('link', A_LINK, "            const lk = 'linked';");
        assert.notEqual(broke(() => judgeTally(b)), '', '破坏 link 后关联分列判据必须翻红');
    }
    /* ⑦ 自动调参不再关闭（apply.auto 变成 true）。 */
    {
        const b = loadBroken('auto', A_AUTO, '                auto: true, kind: kind, key: null, from: null, to: null,');
        assert.notEqual(broke(() => judgeZeroWrite(b, MOD_SRC)), '', '破坏 auto 后自动调参判据必须翻红');
    }
    /* ⑧ 原文依据被整段携带（反馈面变成第二条事实库）。 */
    {
        const b = loadBroken('digest', A_DIGEST, '                evidenceDigest: ev.sourceText,');
        assert.notEqual(broke(() => judgeRecord(b)), '', '破坏 digest 后摘要判据必须翻红');
    }
});

/* ══════════════════ W 工具两向自证 + 判据纯度 ══════════════════ */
test('v3316 W1. ★★★ 破坏工具两向自证：锚点不存在 / 同值替换 / 命中多次必须拒绍', () => {
    assert.throws(() => breakSource(MOD_SRC, '__no_such_anchor__', 'x', 'W1'), /拒绝破坏/);
    assert.throws(() => breakSource(MOD_SRC, 'const FB_VERSION = 1;', 'const FB_VERSION = 1;', 'W1'), /拒绝破坏/);
    assert.throws(() => breakSource(MOD_SRC, 'const ', 'const ', 'W1'), /拒绝破坏/);
    assert.throws(() => breakSource(MOD_SRC, '', 'x', 'W1'), /拒绝破坏/);
});

test('v3316 W2. ★★★ 判据纯度：锚点字面量在本档内只准声明一次；判据不引用锚点串', () => {
    /* ★ 锚点字面量已在文件头声明一次；断言体里不得再重复出现（否则「改一半」会静默）。 */
    for (const [name, a] of [['A_UNKNOWN', A_UNKNOWN], ['A_MULTI', A_MULTI], ['A_TARGET', A_TARGET],
        ['A_PROVEN', A_PROVEN], ['A_GATE', A_GATE], ['A_LINK', A_LINK], ['A_AUTO', A_AUTO], ['A_DIGEST', A_DIGEST]]) {
        assert.equal(SELF.split(a).length - 1, 1, name + ' 须恰出现一次（只在声明处 —— 使用处一律走变量引用，否则「改一半」会静默），实际 '
            + (SELF.split(a).length - 1));
    }
    assert.ok(SELF.length > 4000, '本档不得被压缩（判据实体 ' + SELF.length + ' 字符）');
    /* 判据本体不得住在本档（必须调真函数）：本档不定义 judge* 之外的写口。 */
    /* 写口断言用**调用形态**剖析（`.setItem(`）：本档判据体里必然出现"写口词表"
     * （那是判据的扫描面），故只能判「真调用了写口」，不能判「提到了这个词」。 */
    assert.equal(SELF.split('localStorage' + '.setItem(').length - 1, 0, '本档不得真调写口');
    assert.equal(SELF.split('storage' + '.save(').length - 1, 0, '本档不得真调写口');
});
