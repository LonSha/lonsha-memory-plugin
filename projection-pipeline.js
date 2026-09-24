/* ================================================================
 * projection-pipeline.js — [v3.208.0] 投影管线（纯函数，零依赖）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   v3.176.0 给「本插件侧账本 → 世界账本对读」修好了一根线：宿主在
 *   index.js 里手工收集两个投影（`_localPeopleLocations()` / `_localFactKeys()`），
 *   随 opts 传给 `clock.readWorldLedger`。实测问题有三：
 *     ① **通路只通两根线**：WorldAxis 对外有 12 条面（worldClock / pulse / digest /
 *        currents / echoes / facts / people / opinion / counts / filter …），
 *        本插件侧能参与对读的却只有「人物位置」「事实键」两项，其余**连读数都没有**；
 *     ② **没有管线，只有两次手工调用**：每加一个投影就要再改一遍宿主函数体，
 *        且「加没加」无从判定（零调用即静默缺席）；
 *     ③ **缺席不可归因**：收集失败与「源里本来就没有」同形——都返回 `{}` / `[]`，
 *        下游 `diffPeople` 于是把「查不出来」当成「两边一致」。
 *
 * 【本模块补的到底是什么（不是「多读几个字段」，是三类结构性缺口）】
 *   ① **声明式登记**：投影是**一张表**（PROJECTIONS），不是散在宿主里的两次调用。
 *      每个投影声明 ①id ②它服务哪个对读面 ③取值器（值提供器）④空值形状。
 *      加投影 = 加一行；「有没有被收集」变成可机检事实。
 *   ② **三态读数**（本模块的核心纪律，与 world-ledger-reader 的 sectionState 同规格）：
 *      · `ok`      —— 取到了，且非空（value）
 *      · `empty`   —— 取到了，但源明确说「没有」（空数组/空对象/显式 null）
 *      · `absent`  —— 压根取不到（提供器未注册 / 抛异常 / 宿主字段不存在）
 *      `absent` 与 `empty` 处置相反（前者降级并留痕，后者照常对读），压成一态就再也分不出来。
 *      **提供器抛异常一律记 `absent` 并带上原因**，绝不静默退化成空对象。
 *   ③ **归因**：每个投影带 `reason`（缺席原因字符串）+ `elapsedMs`（取数耗时），
 *      诊断面因此能回答「为什么这个投影是空的」而不是只知道「它是空的」。
 *
 * 【本模块**不做**什么（边界）】
 *   · 不做对读本身（diff/diffPeople/diffFacts 在 world-ledger-reader.js，单一真源）；
 *   · 不做世界状态的读或写（那是 world-clock-reader 的事）；
 *   · 不把 `{}` 当「没有」——空对象与「源里没这项」在本模块里**必须可分**（这是本模块存在的理由）。
 * ================================================================ */
(function (global) {
    'use strict';

    const PROJECTION_VERSION = 1;

    /**
     * 投影登记表（单一真源）。
     * 每项：{ id, face, empty, why }
     *   id    —— 投影标识（诊断面与对读面都用它认领）
     *   face  —— 它服务哪个对读面（people / facts 是 v3.176 既有两算；其余为新增读数）
     *   empty —— 空值形状：'object' | 'array'（三态判定要按形状区分「空对象」与「空数组」）
     *   why   —— 这个投影为什么存在（缺席时也照实说出来，不含糊）
     * 顺序即诊断面展示顺序。
     */
    const PROJECTIONS = Object.freeze([
        { id: 'peopleLocations', face: 'people', empty: 'object', why: '本插件记「谁在哪里」，与世界侧 people 对读；位置对不上是剧情真正会崩的地方' },
        { id: 'factKeys', face: 'facts', empty: 'array', why: '本插件已完成的事实键集（大纲节拍 + 世界推进事件），与世界侧 facts 对读' },
        { id: 'characterNames', face: 'people', empty: 'array', why: '角色表全体名字（含无位置者）——「世界侧提了一个我不认识的人」要能看出来' },
        { id: 'clockDay', face: 'worldClock', empty: 'value', why: '本插件侧剧情日（世界钟对读的另一半；此前只有世界侧单边读数）' },
        { id: 'promiseKeys', face: 'currents', empty: 'array', why: '未了结的约定/伏笔的主题键，与世界侧暗流 title 对读' },
        { id: 'knowledgeOwners', face: 'facts', empty: 'object', why: '「谁知道这条事实」（角色→事实键），用于发现「我知道了但角色不知道」的认知错位' },
    ]);

    /** 三态判定（按声明形状）。与 world-ledger-reader.sectionState 同规格，但不共享实现（跨模块耦合成本高于重复 6 行）。 */
    function stateOf(value, emptyShape) {
        if (value === undefined || value === null) return { present: false, kind: (value === null ? 'empty' : 'absent'), count: 0 };
        if (Array.isArray(value)) return { present: true, kind: value.length ? 'value' : 'empty', count: value.length };
        if (typeof value === 'object') {
            const n = Object.keys(value).length;
            return { present: true, kind: n ? 'value' : 'empty', count: n };
        }
        // 标量：有值即 value（clockDay 这类；0 是合法值，不得当空）
        return { present: true, kind: 'value', count: 1 };
    }

    /** 归一：把空形状与声明对齐（提供器返回错形状时按声明纠正，不静默放行）。 */
    function shapeAs(value, emptyShape) {
        if (value === undefined || value === null) return emptyShape === 'array' ? [] : (emptyShape === 'object' ? {} : null);
        return value;
    }

    /**
     * 跑投影管线。
     * @param providers { id: () => value } 值提供器表（宿主侧只负责「怎么取值」）
     * @param opts { only?: string[], nowProvider?: () => number, declaration?: array }
     *   only —— 只跑这些 id（默认全跑；用于「关掉某些投影」的配置面，且关掉的仍进读数并标 skipped）
     * @returns { version, ts, projections: { id: read }, summary, identity }
     *
     * 纪律：**任何提供器抛异常都不得中断管线**（其余投影照跑），异常投影记 absent + reason='thrown: ...'。
     */
    function runPipeline(providers, opts) {
        const o = opts || {};
        const decl = Array.isArray(o.declaration) && o.declaration.length ? o.declaration : PROJECTIONS;
        const prov = (providers && typeof providers === 'object') ? providers : {};
        const only = Array.isArray(o.only) ? new Set(o.only) : null;
        const clock = (typeof o.nowProvider === 'function') ? o.nowProvider : (() => Date.now());
        let t0 = 0;
        try { t0 = Number(clock()) || 0; } catch (_e) { t0 = 0; }

        const read = {};
        let okN = 0, emptyN = 0, absentN = 0, skippedN = 0;

        for (const d of decl) {
            const id = String(d && d.id || '');
            if (!id) continue;
            const entry = { id, face: d.face || '', why: d.why || '', empty: d.empty || 'object' };
            if (only && !only.has(id)) {
                entry.present = false; entry.kind = 'absent'; entry.count = 0;
                entry.reason = 'skipped-by-config'; entry.elapsedMs = 0; entry.value = entry.empty === 'array' ? [] : (entry.empty === 'object' ? {} : null);
                skippedN++; read[id] = entry; continue;
            }
            const fn = prov[id];
            if (typeof fn !== 'function') {
                // 提供器未注册 ≠ 源为空：这条必须与 empty 可分，否则「忘了接」会伪装成「没有」
                entry.present = false; entry.kind = 'absent'; entry.count = 0;
                entry.reason = 'no-provider'; entry.elapsedMs = 0;
                entry.value = entry.empty === 'array' ? [] : (entry.empty === 'object' ? {} : null);
                absentN++; read[id] = entry; continue;
            }
            const s0 = Number(clock()) || 0;
            let value;
            try { value = fn(); }
            catch (e) {
                entry.present = false; entry.kind = 'absent'; entry.count = 0;
                entry.reason = 'thrown: ' + String((e && e.message) || e);
                entry.elapsedMs = Math.max(0, (Number(clock()) || 0) - s0);
                entry.value = entry.empty === 'array' ? [] : (entry.empty === 'object' ? {} : null);
                absentN++; read[id] = entry; continue;
            }
            const v = shapeAs(value, entry.empty);
            const st = stateOf(v, entry.empty);
            entry.present = st.present; entry.kind = st.kind; entry.count = st.count;
            entry.reason = st.kind === 'value' ? 'ok' : (st.kind === 'empty' ? 'source-empty' : 'absent');
            entry.elapsedMs = Math.max(0, (Number(clock()) || 0) - s0);
            entry.value = v;
            if (st.kind === 'value') okN++; else if (st.kind === 'empty') emptyN++; else absentN++;
            read[id] = entry;
        }

        const summary = { total: Object.keys(read).length, ok: okN, empty: emptyN, absent: absentN, skipped: skippedN };
        return {
            version: PROJECTION_VERSION,
            ts: t0,
            projections: read,
            summary,
            // 自洽：三态 + skipped 必须恰好盖满登记表（漏算即账目崩，账本自己报出来）
            identity: {
                declared: decl.length,
                counted: okN + emptyN + absentN + skippedN,
                ok: (okN + emptyN + absentN + skippedN) === decl.length,
            },
        };
    }

    /**
     * 供给对读面的投影值（把 read 表按 face 归拢成 world-ledger-reader 认的 opts 形状）。
     * 只搬 `value`，不搬读数元数据——对读面不该因为多了一层管线而改变契约。
     */
    function faceValues(pipeline, face) {
        const out = {};
        const ps = (pipeline && pipeline.projections) || {};
        for (const id of Object.keys(ps)) {
            const e = ps[id];
            if (String(e.face || '') !== String(face || '')) continue;
            out[id] = e.value;
        }
        return out;
    }

    /** 一行诊断（纯字符串，不抛）。缺席**必须**说出来——只报「有 N 项」会把缺席藏掉。 */
    function pipelineLine(pipeline) {
        try {
            if (!pipeline || !pipeline.summary) return '—';
            const s = pipeline.summary;
            const parts = ['投影 ' + s.ok + '/' + s.total];
            if (s.empty) parts.push('源空 ' + s.empty);
            if (s.absent) parts.push('缺 ' + s.absent);
            if (s.skipped) parts.push('配置关 ' + s.skipped);
            if (pipeline.identity && pipeline.identity.ok === false) parts.push('⚠️ 账目不自洽');
            return parts.join(' · ');
        } catch (_e) { return '—（投影异常）'; }
    }

    /** 缺席清单（诊断面用：只列 absent 的 id + 原因，让人一眼看到「漏接了什么」）。 */
    function absentList(pipeline) {
        const out = [];
        try {
            const ps = (pipeline && pipeline.projections) || {};
            for (const id of Object.keys(ps)) {
                if (ps[id].kind === 'absent') out.push({ id, reason: ps[id].reason });
            }
        } catch (_e) { /* 降级为空清单 */ }
        return out;
    }

    const api = {
        PROJECTIONS,
        runPipeline,
        stateOf,
        faceValues,
        pipelineLine,
        absentList,
        PROJECTION_VERSION,
    };

    if (typeof window !== 'undefined') window.LonShaProjectionPipeline = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
