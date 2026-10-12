/* ============================================================
 * tests/v3321_b_pack_long_memory_time.test.mjs — [v3.321.0 · B 包 M3-O1/O4/O6/X1]（24 条）
 *
 * 【本套件要证明的是「长聊记忆不只剩最近内容，问题能回到出处」，不是「函数返回了对象」】
 *   M3-O1 召回融合（unified-recall.js::fuseCandidates + index.js 接线）：
 *      ① 近重复抑制留下**分更高**的那条（确定性，不随机留）；
 *      ② 角色/事件覆盖把被去重**误删的分组代表找回来**（去重的副作用由覆盖补）；
 *      ③ 未结关键事实（承诺/约定/欠）**上浮** —— 1 分的未结排在 7 分的非未结之前；
 *      ④ **无键不分组**（没有 eventId/actor 的两条不得被当成同一件事）；
 *      ⑤ 纯函数（不改入参）+ 读数可归因；
 *      ⑥ 宿主接线位置在 intentRerank **之后**、_finalize **之前**，且**不传 budget**
 *         （注入预算的 owner 是既有注入面；召回侧再截一次就是第二个预算真源）。
 *   M3-O4 长篇摘要保底（stm-ltm.js）：
 *      ① 保底句在**原文还在手上时**抽（consolidate 阶段随条目携带）——
 *         放在 rollover 抽是错的：那时 text 已是摘要产物，保底段会静默变空；
 *      ② 差量更新：摘要通道首元素是**上一版摘要**（不是每轮从零重写）；
 *      ③ 保底段附在**截断之后**（保底句本来就是被摘要压掉的那部分，不该再被额度挤掉）；
 *      ④ 保底句没有楼层号 ⇒ **不可回源必须计数**（unrecoverableSources），不假装能回源；
 *      ⑤ 归档只存 **2-gram 关键词**、不复制正文（否则归档变成第二份真源）；
 *      ⑥ 全局正则 lastIndex 已复位；**引号内的句末标点不是句末**（否则「原话」类恒空）。
 *   M3-O6 大型库查询（evidence-query.js）：
 *      ① 账条件非空 ⇒ 只扫被点名的账，被跳过的账**可见**（state=skipped + total=null）；
 *      ② 收窄面与**真实登记表求交**：点的账一本都不存在 ⇒ 退回全扫
 *         （否则「用户点错账名」与「九账全取不到」同形 —— 两者处置相反）；
 *      ③ 逐账投影缓存**三态可分**（未给 off / 可用 on / 旧格式 stale 并明说作废），
 *         命中即复用（行浅拷贝 + _score 归零，防两次查询互相污染）；
 *      ④ 协作式查询分片让出、可取消，取消报 `state='canceled'` + processed（**不是 empty**）；
 *      ⑤ 范围上限只在触顶时给可继续入口（不造恒在场的假入口）；
 *      ⑥ query 与 queryAsync 共用同一个 assemble（**唯一真源**，不是两份口径）。
 *   M3-X1 带证据问答（evidence-query.js::planQuestion/composeAnswer）：
 *      ① 规划只产出 **FILTERS 登记表里的键**（未知键进 dropped，不猜）；
 *      ② 认不出人名**不编一个人名**进去，而是把「谁」留在 gaps；
 *      ③ 每个关键句**可回源**（带 ref/ledger/floor）；
 *      ④ 遮蔽行只报**存在性 + 知识范围**，正文一格不带；
 *      ⑤ 无答案给**缺口**而非编补（查不到 ≠ 没有这件事 ≠ 没查）。
 *         且缺席路径的 `knownActors` 是**真读数**（「模块没加载」≠「一个名字都没有」）；
 *      ⑦ 出口**不扩权** —— 只回合成句与逐计划读数，`rows` 一格不外带（档头写死的纪律）；
 *      ⑧ 读侧缺口**具名** —— 「未参与的账」与「账里确实没有」分列，不再报
 *         「九账全部取不到」这种与场景不符的模板句（本刀修掉的正是这一处）。
 *
 * 负控制一律：真源码破坏（锚点恰中 1 次）→ 在**破坏副本**上重跑**同款真判据** → 必须现形；
 *   并反向对照「原版同判据必须通过」。
 * 【当版锚点】本档自锚常量 + vnum（锚必须住在当版档案里）。
 * 【首跑自伤留痕】本档首跑 7 红，其中 **2 处是实现真缺陷**（已修，见 CHANGELOG）：
 *   · O4「原话」类恒空（splitSentences 不区分引号内外，引号内句末符被当句末）；
 *   · O6 缓存三态塌陷（宿主首跑的空对象与旧格式同形 ⇒ 缓存路径永不进入）。
 *   另 2 处是**本档判据自己的期望写错**（把「保底段必在额度之外」当成恒真、
 *   把「未结必排第一」当成恒真）—— 判据错与实现错必须分开记，否则会去改对的实现。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { breakOnce } from './_break_kit.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const require_ = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const IDX = read('index.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const EQ_SRC = read('evidence-query.js');
const SL_SRC = read('stm-ltm.js');
const UR_SRC = read('unified-recall.js');
const SELF = read(path.join('tests', 'v3321_b_pack_long_memory_time.test.mjs'));
/** 在隔离 vm 里加载 IIFE 模块（与生产同形：window 即全局，module 缺席）。 */
function loadIIFE(src, globalName, extra) {
    const ctx = Object.assign({
        console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
        isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError
    }, extra || {});
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const api = ctx[globalName];
    if (!api) throw new Error('模块未挂 ' + globalName);
    return api;
}
const EQ = loadIIFE(EQ_SRC, 'LonShaEvidenceQuery');
const SL = loadIIFE(SL_SRC, 'LonShaStmLtm');
const UR = loadIIFE(UR_SRC, 'LonShaUnifiedRecall');
/* ══════════════ 负控制锚点（在判据层只声明一次 —— H5 判据纯度） ══════════════
 *   ★ 收成一张表：锚点若在「破坏调用」与「纯度断言」两处各写一份，
 *     改一处漏一处时纯度检查会恒过（它数的是自己那一份）。
 *   ★ 用 String.raw 保留真换行与真字符，避免「按字面量数出现次数」数的是转义串。 */
const ANCHORS = Object.freeze({
    o1Dedupe: String.raw`    if (dup) { c.fusionDupDropped += 1; continue; }`,
    o4Carried: String.raw`  const entrySalient = keepSalient(pending, { maxPerKind: 2, maxTotal: 8 })`,
    o6Intersect: String.raw`        let _onlyHit = false;`,
    o4Bigrams: String.raw`      for (const w of bigrams(t)) {`,
    x1Masked: String.raw`                if (row && row.masked === true) {`,
    /* [v3.322.0 收尾] 宿主出口侧锚点：缺席回执的恒定键面。
     *   破坏形态 = **删掉这一格**（不是改值）—— 那样在场/缺席两条路径的键数不同，
     *   下游按键断言当场破；这正是本刀修掉的那处真缺陷的**反向**。 */
});
/* ══════════════ 判据（纯函数/纯异步，供正反两向复用） ══════════════ */
/** M3-O1 判据一：近重复只留分更高那条；无键不分组；未结上浮；纯函数。 */
function o1JudgeFuse(ur) {
    const mk = (id, score, text, ref) => ({ id, score, searchText: text, sourceRef: ref || {} });
    const long = '她答应过要在周三之前把那本书还给图书馆管理员';
    const list = [
        mk('hi', 9, long, { eventId: 'e1' }),
        mk('lo', 5, long + '，说定了', { eventId: 'e1' }),
        mk('k1', 7, '完全无关的另一件事：车票买好了', {}),
        mk('k2', 3, '另一件毫不相干的事：行李还没收', {}),
        mk('open', 1, '她还欠着房东三个月的房租没结', { eventId: 'e9' })
    ];
    const carry = {};
    const out = ur.fuseCandidates(list, {}, carry);
    const ids = out.map((x) => x.id);
    if (!ids.includes('hi')) throw new Error('近重复抑制没留下分更高那条');
    if (ids.includes('lo')) throw new Error('近重复没被抑制（两条同义都在）');
    if (carry.fusionDupDropped !== 1) throw new Error('去重读数不可归因：' + carry.fusionDupDropped);
    if (!ids.includes('k1') || !ids.includes('k2')) throw new Error('无键项被当同一件事合并（「没有键」不等于「同一件事」）');
    if (carry.fusionOut !== out.length) throw new Error('输出读数与实际不符');
    /* 未结上浮的**唯一硬判据**：1 分的未结（open）必须排在 7 分的非未结（k1）之前。
     *   不写「未结必排第一」—— 同为未结的条目之间仍按分数，那是正确行为。 */
    if (!(ids.indexOf('open') < ids.indexOf('k1'))) {
        throw new Error('未结关键事实没上浮（1 分的未结排在 7 分的非未结之后）：' + ids.join(','));
    }
    if (carry.fusionOpenKept < 1) throw new Error('未结保底读数缺失');
    if (list[0].id !== 'hi' || list.length !== 5) throw new Error('fuseCandidates 改了入参数组');
    return out;
}
/** M3-O1 判据二：覆盖把被去重误删的分组代表找回来。 */
function o1JudgeCover(ur) {
    const t = '同一角色的两件事在语义上高度接近所以会被判重';
    const list = [
        { id: 'a', score: 9, searchText: t + '甲', sourceRef: { eventId: 'g1' } },
        { id: 'b', score: 8, searchText: t + '乙', sourceRef: { eventId: 'g2' } }
    ];
    const carry = {};
    const out = ur.fuseCandidates(list, {}, carry);
    if (!out.some((x) => x.id === 'a')) throw new Error('代表 a 丢了');
    if (!out.some((x) => x.id === 'b')) throw new Error('另一分组的代表被去重误删且没找回来（覆盖没补上副作用）');
    if (carry.fusionCoverAdded < 1) throw new Error('覆盖找回没有读数：' + JSON.stringify(carry));
}
/** M3-O1 判据三：宿主接线次序与「不传 budget」。 */
function o1JudgeWiring(src) {
    const iRerank = src.indexOf('const finalMerged = this.intentRerank(');
    const iFuse = src.indexOf('fuseCandidates(finalMerged');
    const iFinalize = src.indexOf('const _finalize = () => {');
    if (iRerank < 0 || iFuse < 0 || iFinalize < 0) throw new Error('接线三锚点必须在场');
    if (!(iRerank < iFuse && iFuse < iFinalize)) throw new Error('融合接线次序错：必须在 intentRerank 之后、_finalize 之前');
    const seg = src.slice(iFuse, iFinalize);
    if (/budget\s*:/.test(seg)) throw new Error('宿主给召回侧传了 budget（注入预算 owner 是既有注入面，这里再截就是第二个真源）');
}
/** M3-O4 判据一：保底句在原文阶段抽 + 差量更新 + 保底段在截断之后。 */
async function o4JudgeSalient(S) {
    const seen = [];
    /* 摘要通道返回**超额度**的长文本：这样「保底段附在截断之后」才有可判据的位置。 */
    const summarize = async (texts) => { seen.push(texts[0]); return 'Y'.repeat(S.LTM_SUMMARY_CAP + 500); };
    let st = { unconsolidated_stm: [{ text: '她答应过周三之前把书还回去。', msg_id: 'm0', floor: 1 }] };
    st = (await S.consolidate(st, { force: true, summarize })).state;
    for (let i = 1; i <= 45; i++) {
        st.unconsolidated_stm = [{ text: '第' + i + '轮：她说好下周把东西交过来。', msg_id: 'm' + i, floor: i + 1 }];
        st = (await S.consolidate(st, { force: true, summarize })).state;
    }
    const withBlock = st.ltm_entries.filter((e) => typeof e.summary === 'string' && e.summary.includes('【关键保底】'));
    if (!withBlock.length) throw new Error('保底段为空 —— 关键句不是在原文阶段抽的（摘要产物里已没有承诺/原话）');
    const e = withBlock[0];
    if (!Array.isArray(e.salient) || !e.salient.length) throw new Error('条目未携带 salient 读数');
    const idx = e.summary.indexOf('【关键保底】');
    if (idx <= S.LTM_SUMMARY_CAP - 1) throw new Error('保底段被摘要额度挤掉（应在截断之后）：idx=' + idx + ' cap=' + S.LTM_SUMMARY_CAP);
    /* 保底段必须在**尾部**：其后只剩保底段自身（不是又接了一段摘要）。 */
    const tail = e.summary.slice(idx);
    if (!/^- \[/.test(tail.split('\n')[1] || '')) throw new Error('保底段不在摘要尾部：' + JSON.stringify(tail.slice(0, 60)));
    const delta = seen.filter((x) => typeof x === 'string' && x.startsWith('【上一版摘要·增量合并】'));
    if (!delta.length) throw new Error('摘要通道首元素不是上一版摘要（差量更新没生效，每轮从零重写会漂移）');
    if (!e.salient.some((t) => /答应|说好|约定/.test(t))) throw new Error('保底句里没有承诺类句子（抽的不是原文阶段的文本）');
}
/** M3-O4 判据二：不可回源必须计数，且自述里报出来。 */
async function o4JudgeUnrecoverable(S) {
    let st = { unconsolidated_stm: [{ text: '说好明天来。', msg_id: 'a' }] };
    st = (await S.consolidate(st, { force: true })).state;
    for (let i = 0; i < 45; i++) {
        st.unconsolidated_stm = [{ text: '约定好下周交东西。', msg_id: 'z' + i }];
        st = (await S.consolidate(st, { force: true })).state;
    }
    if (!(st.loss.unrecoverableSources > 0)) throw new Error('不可回源没计数（假装还能回源）');
    if (!S.LOSS_KEYS.includes('unrecoverableSources')) throw new Error('LOSS_KEYS 未登记 unrecoverableSources');
    const sr = S.selfReport(st);
    if (!sr.reasons.some((r) => r.includes('源楼层不可回源'))) throw new Error('自述未报不可回源：' + JSON.stringify(sr.reasons));
    if (sr.ok !== false || sr.degraded !== true) throw new Error('有损时 ok 必须为 false');
    if (sr.counters.unrecoverableSources !== st.loss.unrecoverableSources) throw new Error('counters 与 loss 不一致');
}
/** M3-O4 判据三：归档只存 2-gram 关键词、不复制正文；纯读；分页如实报 truncated。 */
async function o4JudgeArchive(S) {
    let st = { unconsolidated_stm: [{ text: '约定好周一交东西。', msg_id: 'q0', floor: 1 }] };
    st = (await S.consolidate(st, { force: true })).state;
    for (let i = 0; i < 45; i++) {
        st.unconsolidated_stm = [{ text: '约定好周一交东西。', msg_id: 'q' + (i + 1), floor: i + 2 }];
        st = (await S.consolidate(st, { force: true })).state;
    }
    const before = JSON.stringify(st);
    const idx = S.salienceIndex(st);
    const lk = S.lookupSalient(st, '约定', { limit: 2 });
    if (JSON.stringify(st) !== before) throw new Error('归档/查询改了 state（必须纯读）');
    if (JSON.stringify(idx).includes('约定好周一交东西')) throw new Error('归档里出现正文副本（中文按整句切词 ⇒ 索引退化成第二份真源）');
    if (!(lk.count >= 1)) throw new Error('lookupSalient 没命中');
    if (typeof lk.hits[0].recoverable !== 'boolean') throw new Error('recoverable 必须是布尔，不许含糊成 null');
    if (lk.hits.length !== 2 || lk.truncated !== true) throw new Error('limit/truncated 语义不对');
}
/** M3-O4 判据四：四类关键句各自可达（含引号内原话）；lastIndex 已复位；空保底不留空标题。 */
function o4JudgeStable(S) {
    const frags = ['说好周三给答复。', '但是他改了主意。', '「我不等了。」', '三个小时。'];
    const a = S.keepSalient(frags), b = S.keepSalient(frags);
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('keepSalient 两次结果不一致（lastIndex 未复位）');
    const kinds = a.map((x) => x.kind).sort().join(',');
    if (kinds !== 'number,open,quote,turn') throw new Error('四类关键句未各自可达（实得 ' + kinds + '）—— 「原话」类恒空说明切句不区分引号内外');
    if (S.renderSalient([]) !== '') throw new Error('无句可保时不该留空标题');
}
/* ── M3-O6 / M3-X1 夹具 ── */
const WB = require_(path.join(R, 'evidence-workbench.js'));
const LEDGERS = WB.LEDGERS;
const APIS = {};
for (const s of LEDGERS) APIS[s.id] = {};
const mkHost = () => ({
    worldProg: {
        commitmentLedger: {
            items: [
                { id: 'c1', actor: '苏晴', counterpart: '林一', content: '答应周三还书', status: 'open', floor: 3, updatedFloor: 3, revision: 1 },
                { id: 'c2', actor: '苏晴', counterpart: '林一', content: '答应带的伞', status: 'fulfilled', floor: 9, updatedFloor: 12, revision: 2 }
            ]
        }
    }
});
/** M3-O6 判据一：收窄只扫被点名的账，且被跳过的账可见。 */
function o6JudgeNarrow(Q) {
    const res = Q.query(mkHost(), { ledgers: ['commitment'] }, { ledgers: LEDGERS, apis: APIS });
    const cov = res.coverage;
    const skipped = cov.skippedByLedgerFilter;
    if (!Array.isArray(skipped) || skipped.length !== LEDGERS.length - 1) throw new Error('被跳过的账没被如实报出：' + JSON.stringify(skipped));
    if (cov.counts.ok !== 1) throw new Error('收窄后只应扫 1 本账，实扫 ' + cov.counts.ok);
    if (res.total !== 2) throw new Error('收窄后命中数不对：' + res.total);
    for (const id of skipped) {
        const rec = cov.ledgers[id];
        if (!rec || rec.state !== 'skipped') throw new Error(id + ' 应以 state=skipped 表达（否则「被筛掉」与「不存在」同形）');
        if (rec.total !== null) throw new Error(id + ' 未扫时 total 必须为 null（条数未知），不得报 0');
        if (!rec.reason) throw new Error(id + ' 缺 reason');
    }
    return res;
}
/** M3-O6 判据二：点的账一本都不存在 ⇒ 退回全扫（点错账名 ≠ 九账全取不到）。 */
function o6JudgeUnknownLedger(Q) {
    const res = Q.query(mkHost(), { ledgers: ['no-such-ledger-xyz'] }, { ledgers: LEDGERS, apis: APIS });
    if (res.coverage.counts.ok < 1) throw new Error('点错账名时退回了空扫描面（「用户点错」被报成「九账全取不到」）');
    if ((res.coverage.skippedByLedgerFilter || []).length !== 0) throw new Error('交集为空时必须退回全扫，不该跳过任何账');
}
/** M3-O6 判据三：缓存三态可分 + 命中复用 + 两次查询互不污染。 */
function o6JudgeCache(Q) {
    /* ① 未给缓存 ⇒ off。 */
    const off = Q.query(mkHost(), { ledgers: ['commitment'] }, { ledgers: LEDGERS, apis: APIS });
    if (off.coverage.projectionCache.state !== 'off' || off.coverage.projectionCache.enabled !== false) {
        throw new Error('未给缓存时应报 off：' + JSON.stringify(off.coverage.projectionCache));
    }
    /* ② 给了**空对象**（宿主首跑的真实形态）⇒ 当场可用（修前这里是 false，缓存路径永不进入）。 */
    const cache = {};
    const o = { ledgers: LEDGERS, apis: APIS, projectionCache: cache };
    const r1 = Q.query(mkHost(), { ledgers: ['commitment'] }, o);
    if (r1.coverage.projectionCache.enabled !== true || r1.coverage.projectionCache.state !== 'on') {
        throw new Error('宿主空缓存对象应被当作可用（「还没建」与「格式已作废」不得同形）：' + JSON.stringify(r1.coverage.projectionCache));
    }
    if (r1.coverage.projectionCache.hits !== 0 || r1.coverage.projectionCache.misses < 1) throw new Error('首跑应全 miss');
    const r2 = Q.query(mkHost(), { ledgers: ['commitment'] }, o);
    if (r2.coverage.projectionCache.hits < 1) throw new Error('第二跑没命中缓存（指纹复用没生效）');
    if (r2.total !== r1.total) throw new Error('缓存复用改了结论：' + r1.total + ' vs ' + r2.total);
    const score1 = r1.rows[0]._score;
    r2.rows[0]._score = 999;
    if (r1.rows[0]._score !== score1) throw new Error('两次查询共享了同一行引用（本次分数写进了上次的行）');
    if (!cache.version) throw new Error('缓存未带格式号（换格式无法作废旧缓存）');
    /* ③ 旧格式缓存 ⇒ stale，且**明说作废**（不得静默当成没有）。 */
    const stale = { version: -1, fp: {}, rows: {} };
    const r3 = Q.query(mkHost(), { ledgers: ['commitment'] }, { ledgers: LEDGERS, apis: APIS, projectionCache: stale });
    if (r3.coverage.projectionCache.state !== 'stale' || r3.coverage.projectionCache.stale !== true) {
        throw new Error('旧格式缓存应报 stale 并作废：' + JSON.stringify(r3.coverage.projectionCache));
    }
    if (r3.coverage.projectionCache.hits !== 0) throw new Error('旧格式缓存不得被复用');
}
/** M3-O6 判据四：协作式查询可取消，取消 ≠ empty。 */
async function o6JudgeAsync(Q) {
    let calls = 0;
    const res = await Q.queryAsync(mkHost(), { ledgers: ['commitment'] }, {
        ledgers: LEDGERS, apis: APIS, shardRows: 1,
        yieldTo: () => { calls += 1; },
        shouldCancel: () => calls >= 1
    });
    if (res.state !== 'canceled') throw new Error('取消没被如实报成 canceled（实为 ' + res.state + '）');
    if (res.canceled !== true || res.partial !== true) throw new Error('取消读数缺失');
    if (!res.processed || typeof res.processed.totalRows !== 'number') throw new Error('取消未报 processed（「没查完」与「没有」必须分开）');
    if (calls < 1) throw new Error('协作式查询没有让出（yieldTo 未被调用）');
    const full = await Q.queryAsync(mkHost(), { ledgers: ['commitment'] }, { ledgers: LEDGERS, apis: APIS });
    if (full.state !== 'ok' || full.total !== 2) throw new Error('不取消时应得完整结果');
    const sync = Q.query(mkHost(), { ledgers: ['commitment'] }, { ledgers: LEDGERS, apis: APIS });
    if (JSON.stringify(full.rows) !== JSON.stringify(sync.rows)) throw new Error('query 与 queryAsync 结论不一致（应共用同一个 assemble）');
}
/** M3-O6 判据五：范围上限只在触顶时给可继续入口。 */
function o6JudgeContinue(Q) {
    const small = Q.query(mkHost(), { ledgers: ['commitment'] }, { ledgers: LEDGERS, apis: APIS, maxPerLedger: 1 });
    if (!small.continueWith) throw new Error('触顶时未给可继续入口');
    if (!Array.isArray(small.continueWith.ledgers) || !small.continueWith.ledgers.length) throw new Error('可继续入口未点名触顶的账');
    if (!(small.continueWith.maxPerLedger > 1)) throw new Error('可继续入口未给出更大的上限');
    const big = Q.query(mkHost(), { ledgers: ['commitment'] }, { ledgers: LEDGERS, apis: APIS });
    if (big.continueWith !== null) throw new Error('没触顶却给了入口（恒在场入口会被读成「上次没查完」）');
}
/** M3-X1 判据一：规划受控 + 认不出人名不编。 */
function x1JudgePlan(Q) {
    const known = new Set(Q.FILTERS.map((f) => f.key));
    const p = Q.planQuestion('苏晴答应了什么？', { knownActors: ['苏晴', '林一'] });
    if (!p.intents.includes('promise')) throw new Error('未识别「答应了什么」问题型');
    const plan = p.plans.filter((x) => x.id === 'promise')[0];
    if (!plan) throw new Error('未产出 promise 计划');
    if (JSON.stringify(plan.spec.ledgers) !== '["commitment"]') throw new Error('约定账名必须写死，不推导');
    for (const k of Object.keys(plan.spec)) {
        if (k === 'inverted') continue;
        if (!known.has(k)) throw new Error('规划产出非登记键：' + k);
    }
    if (plan.spec.actors[0] !== '苏晴') throw new Error('认出人名时未按人名筛');
    const no = Q.planQuestion('苏晴答应了什么？', { knownActors: ['王五'] });
    if (no.plans[0].spec.actors !== null) throw new Error('认不出人名却编了一个进去');
    if (!no.gaps.some((g) => g.kind === 'actor')) throw new Error('「谁」的缺口没留在 gaps');
    const none = Q.planQuestion('那台冰箱');
    if (none.intents.length !== 0) throw new Error('未识别问题型却硬认了意图');
    if (none.plans.length !== 1 || none.plans[0].id !== 'text') throw new Error('意图不明时缺兜底宽查（「怪问题」与「系统坏了」会同形）');
}
/** M3-X1 判据二：可回源 / 遮蔽不外带 / 无答案给缺口。 */
function x1JudgeCompose(Q) {
    const row = (over) => Object.assign({
        ref: 'commitment:c1', ledger: 'commitment', ledgerLabel: '约定',
        title: '答应周三还书', detail: '苏晴 对 林一', status: 'open',
        floor: 3, updatedFloor: null, times: [], revision: 1, revisionKnown: true,
        source: 'commitmentLedger', actors: [], text: '', scope: null, masked: false, _score: null
    }, over || {});
    const q = (over) => Object.assign({
        state: 'ok', total: 1, scanned: 5, pages: 1, pageOutOfRange: false,
        rows: [row()], hitsByLedger: { commitment: 1 }, emptyReason: ''
    }, over || {});
    const c = Q.composeAnswer({ question: 'q', intents: ['promise'], plans: [], gaps: [] }, [{ id: 'promise', query: q() }]);
    const sent = c.answer.filter((s) => s.ref);
    if (!sent.length) throw new Error('未产出带出处的句子');
    if (c.refs.length !== c.resourced) throw new Error('refs 与可回源句数不一致');
    if (sent[0].ref !== 'commitment:c1' || sent[0].floor !== 3) throw new Error('句子缺 ref/floor（回不到出处）');
    const m = Q.composeAnswer({ question: 'q', plans: [], gaps: [] }, [{
        id: 'promise', query: q({ rows: [row({ ledger: 'secret', ref: 'secret:s1', masked: true, scope: 'listed', title: '（正文不对外提供）' })], hitsByLedger: { secret: 1 } })
    }]);
    const ms = m.answer.filter((s) => s.kind === 'masked');
    if (!ms.length) throw new Error('遮蔽行没被单列（会被当普通行把正文带出去）');
    if (m.masked !== 1) throw new Error('遮蔽计数不对');
    if (!/listed/.test(ms[0].text)) throw new Error('遮蔽句未报知识范围');
    const empty = Q.composeAnswer({ question: 'q', plans: [], gaps: [] }, [{ id: 'promise', query: q({ state: 'empty', total: 0, rows: [], hitsByLedger: {}, emptyReason: '扫描面为空' }) }]);
    if (empty.answer.length !== 0) throw new Error('查不到却产出了句子（编补）');
    if (!empty.gaps.some((g) => g.kind === 'no-rows')) throw new Error('查不到未给具名缺口');
    const absent = Q.composeAnswer({ question: 'q', plans: [], gaps: [] }, [{ id: 'promise', query: null }]);
    if (!absent.gaps.some((g) => g.kind === 'result-absent')) throw new Error('「没跑」与「没命中」未分列');
}
/* ══════════════ A. M3-O1 召回融合 ══════════════ */
test('v3321 A1. ★★ M3-O1 近重复抑制 + 无键不分组 + 未结上浮（纯函数）', () => {
    o1JudgeFuse(UR);
    console.log('  ✓ 留下分更高那条、无键不合并、未结上浮、入参未被改');
});
test('v3321 A2. ★★ M3-O1 覆盖把被去重误删的分组代表找回来', () => {
    o1JudgeCover(UR);
    console.log('  ✓ 两个分组的代表都在场，且找回量有读数');
});
test('v3321 A3. ★★ M3-O1 宿主接线：在 intentRerank 之后、_finalize 之前，且不传 budget', () => {
    o1JudgeWiring(IDX);
    console.log('  ✓ 次序正确；召回侧未成为第二个预算真源');
});
/* ══════════════ B. M3-O4 长篇摘要保底 ══════════════ */
test('v3321 B1. ★★★ M3-O4 保底句在原文阶段抽 + 差量更新 + 保底段在截断之后', async () => {
    await o4JudgeSalient(SL);
    console.log('  ✓ 保底段非空且在摘要尾部；摘要通道收到上一版摘要');
});
test('v3321 B2. ★★ M3-O4 不可回源必须计数（不假装能回源）', async () => {
    await o4JudgeUnrecoverable(SL);
    console.log('  ✓ unrecoverableSources 已计数、已进 LOSS_KEYS、已在自述里报出');
});
test('v3321 B3. ★★ M3-O4 归档只存 2-gram 关键词、纯读、分页如实', async () => {
    await o4JudgeArchive(SL);
    console.log('  ✓ 归档不含正文副本；查询不改 state；limit/truncated 语义正确');
});
test('v3321 B4. ★★★ M3-O4 四类关键句各自可达（含引号内原话）+ lastIndex 复位', () => {
    o4JudgeStable(SL);
    console.log('  ✓ open/turn/quote/number 四类都命中；可复现；空保底不留空标题');
});
/* ══════════════ C. M3-O6 大型库查询 ══════════════ */
test('v3321 C1. ★★★ M3-O6 账条件收窄只扫被点名的账，被跳过的账可见且 total=null', () => {
    o6JudgeNarrow(EQ);
    console.log('  ✓ skipped 账逐本可见、reason 在场、未扫不报 0 条');
});
test('v3321 C2. ★★★ M3-O6 点错账名退回全扫（不与「九账全取不到」同形）', () => {
    o6JudgeUnknownLedger(EQ);
    console.log('  ✓ 交集为空时退回全扫，不跳过任何账');
});
test('v3321 C3. ★★★ M3-O6 缓存三态可分（off/on/stale）+ 复用 + 互不污染', () => {
    o6JudgeCache(EQ);
    console.log('  ✓ 空对象可当场用；旧格式报 stale；行浅拷贝 + _score 归零');
});
test('v3321 C4. ★★★ M3-O6 协作式查询：分片让出 + 取消报 canceled（不是 empty）', async () => {
    await o6JudgeAsync(EQ);
    console.log('  ✓ 让出发生；取消带 processed；queryAsync 与 query 结论一致（共用 assemble）');
});
test('v3321 C5. ★★ M3-O6 范围上限只在触顶时给可继续入口', () => {
    o6JudgeContinue(EQ);
    console.log('  ✓ 触顶给入口 + 点名账 + 更大上限；没触顶为 null');
});
/* ══════════════ D. M3-X1 带证据问答 ══════════════ */
test('v3321 D1. ★★★ M3-X1 规划只产出登记表键；认不出人名不编', () => {
    x1JudgePlan(EQ);
    console.log('  ✓ 受控条件；人名只从 knownActors 认；缺口留在 gaps');
});
test('v3321 D2. ★★★ M3-X1 合成：可回源 / 遮蔽不外带 / 无答案给缺口', () => {
    x1JudgeCompose(EQ);
    console.log('  ✓ 每句带出处；遮蔽只报存在性；查不到不编补');
});
test('v3321 D3. ★ M3-X1 未结/已结按各账真实状态档分列（不合并成一档）', () => {
    const rows = [
        { ref: 'commitment:c1', ledger: 'commitment', ledgerLabel: '约定', title: 'a', detail: '', status: 'open', floor: 1, masked: false },
        { ref: 'commitment:c2', ledger: 'commitment', ledgerLabel: '约定', title: 'b', detail: '', status: 'fulfilled', floor: 2, masked: false },
        { ref: 'commitment:c3', ledger: 'commitment', ledgerLabel: '约定', title: 'c', detail: '', status: 'broken', floor: 3, masked: false }
    ];
    const c = EQ.composeAnswer({ question: 'q', plans: [], gaps: [] }, [{ id: 'promise', query: { state: 'ok', total: 3, scanned: 3, pages: 1, pageOutOfRange: false, rows, hitsByLedger: { commitment: 3 }, emptyReason: '' } }]);
    const kinds = c.answer.filter((s) => s.ref).map((s) => s.kind);
    assert.ok(kinds.includes('open'), '缺未结档：' + JSON.stringify(kinds));
    assert.equal(kinds.filter((k) => k === 'settled').length, 2, 'fulfilled 与 broken 都算已结但不合并：' + JSON.stringify(kinds));
    console.log('  ✓ 未结 1 / 已结 2，各按真状态');
});
/* ══════════════ E. 负控制（真源码破坏 → 破坏副本上重跑同款判据） ══════════════ */
test('v3321 E1. ★★★ 破坏 M3-O1 去重 ⇒ A1 判据必须转红', () => {
    const bad = breakOnce(UR_SRC, ANCHORS.o1Dedupe, '    if (false) { c.fusionDupDropped += 1; continue; }', 'o1 去重');
    const UR2 = loadIIFE(bad, 'LonShaUnifiedRecall');
    let threw = false, msg = '';
    try { o1JudgeFuse(UR2); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '去重失效后判据必须转红（否则「重复占预算」抓不住）');
    assert.match(msg, /近重复/);
    o1JudgeFuse(UR);   // 反向对照：原版同判据必须过
});
test('v3321 E2. ★★★ 破坏 M3-O4 原文阶段抽取 ⇒ B1 判据必须转红', async () => {
    const bad = breakOnce(SL_SRC, ANCHORS.o4Carried, '  const entrySalient = []', 'o4 携带');
    const SL2 = loadIIFE(bad, 'LonShaStmLtm');
    let threw = false, msg = '';
    try { await o4JudgeSalient(SL2); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '保底句退回摘要阶段后判据必须转红（否则「保底段静默变空」抓不住）');
    assert.match(msg, /保底/);
    await o4JudgeSalient(SL);
});
test('v3321 E3. ★★★ 破坏 M3-O6 收窄求交 ⇒ C2 判据必须转红', () => {
    const bad = breakOnce(EQ_SRC, ANCHORS.o6Intersect, '        let _onlyHit = true;', 'o6 求交');
    const EQ2 = loadIIFE(bad, 'LonShaEvidenceQuery');
    let threw = false, msg = '';
    try { o6JudgeUnknownLedger(EQ2); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '不求交后判据必须转红（否则「点错账名 = 九账全取不到」抓不住）');
    assert.match(msg, /全取不到|点错/);
    o6JudgeUnknownLedger(EQ);
});
test('v3321 E4. ★★ 破坏 M3-O4 中文分词 ⇒ B3 判据必须转红', async () => {
    const bad = breakOnce(SL_SRC, ANCHORS.o4Bigrams, "      for (const w of String(t).split(/\\s+/)) {", 'o4 分词');
    const SL2 = loadIIFE(bad, 'LonShaStmLtm');
    let threw = false, msg = '';
    try { await o4JudgeArchive(SL2); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '整句切词后判据必须转红（否则「归档退化成第二份正文」抓不住）');
    assert.match(msg, /正文副本/);
    await o4JudgeArchive(SL);
});
test('v3321 E5. ★★★ 破坏 M3-X1 遮蔽分支 ⇒ D2 判据必须转红', () => {
    const bad = breakOnce(EQ_SRC, ANCHORS.x1Masked, '                if (false) {', 'x1 遮蔽');
    const EQ2 = loadIIFE(bad, 'LonShaEvidenceQuery');
    let threw = false, msg = '';
    try { x1JudgeCompose(EQ2); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '遮蔽分支失效后判据必须转红（否则正文被当普通行带出去）');
    assert.match(msg, /遮蔽/);
    x1JudgeCompose(EQ);
});
/* ══════════════ F. 锚点自证 + 版本锚 ══════════════ */
test('v3321 F1. ★★ H5 判据纯度：每个破坏锚点在**本档源码**里恰中 1 次', () => {
    for (const k of Object.keys(ANCHORS)) {
        const n = SELF.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '锚点 ' + k + ' 在本档里出现 ' + n + ' 次（判据纯度要求恰 1 次；两处各写一份会让纯度检查恒过）');
    }
});
test('v3321 F2. ★★ H6 工具两向自证：锚点不存在 / 不唯一 / 同值替换必须抛', () => {
    assert.throws(() => breakOnce(UR_SRC, '这段源码根本不存在', 'x', '不存在锚点'), /恰中 1 次|命中 0 次/);
    assert.throws(() => breakOnce(UR_SRC, 'const ', 'x', '不唯一锚点'), /恰中 1 次|要求恰好 1 次/);
    assert.throws(() => breakOnce(UR_SRC, ANCHORS.o1Dedupe, ANCHORS.o1Dedupe, '同值替换'), /必须真的改变源码/);
});
const vnum = (s) => { const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s).trim()); return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN; };
const BORN = '3.321.0';
test('v3321 F3. ★★★ 版本锚：本档出生版本 + 六源同源（V4 当版锚点形态）', () => {
    assert.equal(vnum(BORN), 3321000, 'vnum 序数必须可数（当版锚点）');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(codeVer, '入口版本常量必须在场');
    assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立；当前 ' + codeVer);
    assert.equal(MF.version, codeVer, 'manifest 与入口同源');
    assert.equal(PKG.version, codeVer, 'package.json 与入口同源');
    for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const mv = (/let VERSION = '([^']+)'/.exec(read(m)) || [])[1];
        assert.equal(mv, codeVer, m + ' 副本须与入口同源（须是 let：bindDeps 可换，const 会 TypeError）');
    }
    /* [v3.323.0 交棒] 原文是 `assert.equal(MF.extra_js.length, 96, ...)` ——
     *   【硬锁出生版读数】：96 是 B 包那一刀的一次性事实，C 包新增三模块后
     *   （96 → 99）它会翻红，而翻红的信息量只剩「数字不对」。本仓同族坑已定性两轮
     *   （v3296 §8 的总项数锁交棒）。交棒**不弱化**：本档改守**下界**（不低于出生时的
     *   96），当版项数锁由 tests/v3323_c_pack_group_relation.test.mjs 的 F3 接管。 */
    assert.ok(MF.extra_js.length >= 96,
        'extra_js 项数不得低于本档出生时的 96（当版项数锁已交棒 v3323 F3），实 ' + MF.extra_js.length);
    assert.ok(SELF.includes("const BORN = '3.321.0'"), '当版锚点必须显式留在本档里');
    assert.equal(SELF.includes('vnum(BORN)'), true, '锚形须可被守卫计数');
});
test('v3321 F4. B 包记忆侧四项版本读数在场（可被下游与诊断读到）', () => {
    assert.equal(EQ.QUERY_VERSION, 3, 'M3-O6 抬到 3（新增缓存/索引/协作式查询三面）');
    assert.equal(EQ.QA_VERSION, 1, 'M3-X1 问答面版本在场');
    assert.equal(EQ.PROJECTION_CACHE_VERSION, 1, '投影缓存格式号在场');
    assert.equal(EQ.QUERY_ASYNC_SHARD, 2000, '协作式查询让出粒度在场');
    assert.equal(SL.LTM_SUMMARY_CAP > 0, true, '摘要额度仍在（保底段附在它之后）');
    console.log('  ✓ QUERY_VERSION=3 / QA_VERSION=1 / 缓存与分片常量在场');
});