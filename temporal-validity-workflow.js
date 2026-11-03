/* ========================================================
 * temporal-validity-workflow.js — [M8-O3 · 第八期规划] 时间有效性工作流内核（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   解决“曾经为真、现在仍真、未来计划、已取消”在记忆库中混为一谈的问题：
 *     ① 双时间轴：eventTime（事件发生时点）与 learnTime（人物获知时点）；
 *     ② 五大生命周期状态：historical（历史旧事）/ current_valid（当前有效）/
 *        planned（未来计划）/ cancelled（已取消）/ uncertain（无法确定）；
 *     ③ 严格故事时钟比对：绝不拿真实机器时间硬套故事剧情时间；
 *     ④ 针对当前上下文的纯函数筛选与过期保护。
 * ======================================================== */
(function (root) {
    'use strict';

    const TEMPORAL_STATUS = Object.freeze({
        CURRENT_VALID: 'current_valid', // 当前依然成立的事实
        HISTORICAL: 'historical',       // 过去曾成立，如今已有新演变
        PLANNED: 'planned',             // 未来的安排或承诺
        CANCELLED: 'cancelled',         // 曾经计划但后来被取消
        UNCERTAIN: 'uncertain'          // 时间线索不全，无法判定
    });

    function safeStr(v) { return String(v == null ? '' : v).trim(); }
    function safeNum(v, fallback = 0) {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    }
    function safeArr(v) { return Array.isArray(v) ? v : []; }
    function finiteOrNull(v) {
        if (v == null || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    function ownNumber(o, key) {
        return o && Object.prototype.hasOwnProperty.call(o, key) ? finiteOrNull(o[key]) : null;
    }
    /**
     * 根据故事时间判定单条事实的时间有效性状态
     */
    function classifyFactValidity(fact, storyTimelineMarker) {
        if (!fact || typeof fact !== 'object') {
            return { status: TEMPORAL_STATUS.UNCERTAIN, reason: 'invalid-fact' };
        }
        if (fact.isCancelled === true) {
            return { status: TEMPORAL_STATUS.CANCELLED, reason: 'explicitly-cancelled' };
        }

        const currentStoryFloor = typeof storyTimelineMarker === 'number' ? storyTimelineMarker : null;
        const validUntilFloor = typeof fact.validUntilFloor === 'number' ? fact.validUntilFloor : null;
        const validFromFloor = typeof fact.validFromFloor === 'number' ? fact.validFromFloor : null;
        if (validFromFloor == null && validUntilFloor == null && !TEMPORAL_STATUS[Object.keys(TEMPORAL_STATUS).find(k => TEMPORAL_STATUS[k] === fact.status)]) {
            return { status: TEMPORAL_STATUS.UNCERTAIN, reason: 'no-validity-range' };
        }
        if (currentStoryFloor == null) {
            // 没有提供故事参照点时，若有明确状态则返回，否则标为 uncertain
            return {
                status: fact.status && Object.values(TEMPORAL_STATUS).includes(fact.status) ? fact.status : TEMPORAL_STATUS.UNCERTAIN,
                reason: 'no-story-timeline-marker'
            };
        }

        // 检查未来计划
        if (validFromFloor != null && validFromFloor > currentStoryFloor) {
            return { status: TEMPORAL_STATUS.PLANNED, reason: 'scheduled-for-future' };
        }

        // 检查历史过期
        if (validUntilFloor != null && validUntilFloor <= currentStoryFloor) {
            return { status: TEMPORAL_STATUS.HISTORICAL, reason: 'superseded-or-expired' };
        }

        return { status: TEMPORAL_STATUS.CURRENT_VALID, reason: 'within-valid-window' };
    }

    /**
     * 过滤出适用于当前情境的事实列表
     * @param {Array} facts
     * @param {number} currentStoryFloor 当前故事进展楼层或序号
     * @param {Object} options { allowPlanned: boolean, allowHistorical: boolean }
     */
    function filterFactsByTemporalWindow(facts, currentStoryFloor, options = {}) {
        const list = safeArr(facts);
        const allowPlanned = options.allowPlanned === true;
        const allowHistorical = options.allowHistorical === true;

        return list.filter(fact => {
            const verdict = classifyFactValidity(fact, currentStoryFloor);
            if (verdict.status === TEMPORAL_STATUS.CURRENT_VALID) return true;
            if (verdict.status === TEMPORAL_STATUS.PLANNED) return allowPlanned;
            if (verdict.status === TEMPORAL_STATUS.HISTORICAL) return allowHistorical;
            if (verdict.status === TEMPORAL_STATUS.CANCELLED) return false;
            // 未知不能冒充当前有效；调用方必须显式选择 allowUncertain。
            return options.allowUncertain === true;
        });
    }
    function factRange(fact) {
        const f = fact && typeof fact === 'object' ? fact : {};
        return {
            from: ownNumber(f, 'from') != null ? ownNumber(f, 'from') : ownNumber(f, 'validFromFloor'),
            to: ownNumber(f, 'to') != null ? ownNumber(f, 'to') : ownNumber(f, 'validUntilFloor')
        };
    }
    function coordForFact(fact, coords, actor) {
        const f = fact && typeof fact === 'object' ? fact : {};
        const ids = [f.id, f.factId, f.subject].filter(v => v != null && String(v) !== '');
        const wantActor = safeStr(actor);
        for (const c of safeArr(coords)) {
            if (!c || typeof c !== 'object') continue;
            if (wantActor && safeStr(c.actor) !== wantActor) continue;
            if (ids.some(id => safeStr(c.subject) === safeStr(id))) return c;
        }
        return null;
    }
    function rowFacts(row) { return row && Array.isArray(row.values) ? row.values : []; }
    function factId(fact) { return fact && fact.id != null ? String(fact.id) : ''; }
    function stateRows(state, at, opts) {
        const o = opts || {};
        const FV = o.factVersion;
        if (!FV || typeof FV.readAt !== 'function') return null;
        try {
            const result = FV.readAt(state, at == null ? null : at, o.factVersionOptions);
            return result && Array.isArray(result.rows) ? result.rows : [];
        } catch (_e) { return null; }
    }
    function versionEvidence(fact, rows) {
        const id = factId(fact);
        for (const row of safeArr(rows)) {
            const values = rowFacts(row);
            if (values.some(f => factId(f) === id)) return { state: row.state, row: row, matched: true };
            if (!id && safeStr(row.subject) === safeStr(fact && fact.subject)
                && safeStr(row.predicate) === safeStr(fact && fact.predicate)) {
                return { state: row.state, row: row, matched: true };
            }
        }
        return { state: null, row: null, matched: false };
    }
    function dualEvidence(fact, opts, at) {
        const o = opts || {};
        const DT = o.dualTime;
        const coord = o.coord || coordForFact(fact, o.coords, o.actor);
        if (!coord || !DT || typeof DT.visibleAt !== 'function') {
            return { state: coord ? 'unavailable' : 'not-tracked', known: 'unknown', coord: coord || null };
        }
        const point = finiteOrNull(at);
        const visible = point == null ? { known: 'unknown', why: 'no-story-time' } : DT.visibleAt(coord, point);
        return { state: visible.known, known: visible.known, why: visible.why, learnedAt: visible.learnedAt, coord: coord };
    }
    /** 统一组合 fact-version 与 dual-time 的只读解释，不复制底层判据。 */
    function explainFact(fact, opts = {}) {
        const f = fact && typeof fact === 'object' ? fact : {};
        const at = ownNumber(opts, 'at');
        const range = factRange(f);
        const lifecycleFact = Object.assign({}, f, { validFromFloor: range.from, validUntilFloor: range.to });
        let validity = classifyFactValidity(lifecycleFact, at);
        const rows = stateRows(opts.state, at, opts);
        const version = versionEvidence(f, rows);
        if (version.state === 'current' && (range.from != null || range.to != null || f.status === TEMPORAL_STATUS.CURRENT_VALID)) validity = { status: TEMPORAL_STATUS.CURRENT_VALID, reason: 'version-current' };
        else if (version.state === 'historical') validity = { status: TEMPORAL_STATUS.HISTORICAL, reason: 'version-historical' };
        else if (version.state === 'none-at' || version.state === 'none-current') validity = { status: TEMPORAL_STATUS.HISTORICAL, reason: 'version-not-selected' };
        const dual = dualEvidence(f, opts, at);
        const historicalQuery = at != null;
        let eligible = validity.status === TEMPORAL_STATUS.CURRENT_VALID
            || (historicalQuery && validity.status === TEMPORAL_STATUS.HISTORICAL && opts.allowHistorical === true)
            || (validity.status === TEMPORAL_STATUS.PLANNED && opts.allowPlanned === true)
            || (validity.status === TEMPORAL_STATUS.UNCERTAIN && opts.allowUncertain === true);
        let reason = eligible ? validity.reason : 'temporal-' + validity.status;
        if (opts.actor != null && dual.known !== 'yes') {
            eligible = false;
            reason = dual.known === 'no' ? 'not-yet-known' : 'knowledge-unknown';
        }
        if (version.state === 'ambiguous') { eligible = false; reason = 'version-ambiguous'; }
        if (version.state === 'none-trusted' || version.state === 'none-revoked') { eligible = false; reason = 'version-' + version.state; }
        return { ok: !!fact && typeof fact === 'object', id: f.id == null ? null : String(f.id), fact: f, at: at,
            range: range, validity: validity, version: { state: version.state || 'unread', row: version.row },
            dualTime: dual, eligible: eligible, reason: reason };
    }
    /** 当前选择只收当前版本；历史选择必须显式给时点并允许历史。 */
    function selectFacts(facts, opts = {}) {
        const list = safeArr(facts);
        const at = ownNumber(opts, 'at');
        const rows = stateRows(opts.state, at, opts);
        const selected = [], excluded = [];
        for (const fact of list) {
            const evidence = versionEvidence(fact, rows);
            const explanation = explainFact(fact, Object.assign({}, opts, { at: at }));
            if (rows && !evidence.matched) {
                explanation.eligible = false;
                explanation.reason = at == null ? 'not-current-version' : 'not-at-version';
            }
            if (explanation.eligible) selected.push(fact);
            else excluded.push({ fact: fact, reason: explanation.reason, explanation: explanation });
        }
        return { ok: true, at: at, selected: selected, excluded: excluded,
            explanations: list.map(f => explainFact(f, Object.assign({}, opts, { at: at }))) };
    }
    function readAt(rawState, at, opts = {}) {
        const rows = stateRows(rawState, at, opts);
        if (rows == null) return { ok: false, reason: 'fact-version-unavailable', at: at == null ? null : at, rows: [] };
        const enriched = rows.map(row => {
            const explanations = rowFacts(row).map(f => explainFact(f, Object.assign({}, opts, { at: at })));
            if (opts.unknownTime === true) {
                explanations.forEach(e => { e.eligible = false; e.reason = 'unknown-time'; });
            }
            return Object.assign({}, row, { explanations: explanations, eligible: explanations.some(e => e.eligible) });
        });
        return { ok: true, at: at == null ? null : at, rows: enriched, unknownTime: at == null && opts.unknownTime === true };
    }
    function resolveQuery(rawState, text, opts = {}) {
        const FV = opts.factVersion;
        if (!FV || typeof FV.resolveQuery !== 'function') return { ok: false, reason: 'fact-version-unavailable', rows: [] };
        const base = FV.resolveQuery(rawState, text, { at: opts.at == null ? null : opts.at });
        const out = readAt(rawState, base.at, Object.assign({}, opts, { unknownTime: base.unknownTime }));
        return Object.assign(out, { intent: base.intent, intentCue: base.intentCue, unknownTime: !!base.unknownTime });
    }
    function line(rawState, opts = {}) {
        const parts = [];
        try { if (opts.factVersion && typeof opts.factVersion.line === 'function') parts.push(opts.factVersion.line(rawState)); } catch (_e) { parts.push('事实账异常'); }
        try { if (opts.dualTime && typeof opts.dualTime.line === 'function') parts.push(opts.dualTime.line(opts.coords)); } catch (_e) { parts.push('时间坐标异常'); }
        return parts.length ? parts.join(' · ') : '时间模块未加载';
    }
    function temporalValiditySelfCheck() {
        const problems = [];
        if (Object.keys(TEMPORAL_STATUS).length !== 5) problems.push('TEMPORAL_STATUS 必须恰好为 5 项');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        TEMPORAL_STATUS,
        classifyFactValidity,
        filterFactsByTemporalWindow,
        explainFact, selectFacts, readAt, resolveQuery, line,
        temporalValiditySelfCheck
    });

    root.LonShaTemporalValidity = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);