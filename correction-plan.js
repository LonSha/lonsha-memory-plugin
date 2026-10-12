/* ========================================================
 * correction-plan.js — [M3-O7 + M3-X9 · v3.324.0] 纠错：可比较的修正方案 + 局部重提取与原文对照
 *
 * 【为什么两面放在一个模块里（不是打包省事，是「范围与暂存只能有一份真源」）】
 *   O7（提取反馈 → 可比较的修正方案）与 X9（圈定范围 → 局部重提取 → 原文对照）是同一件事的
 *   两个面：**都是「先给一个受范围约束的提案，用户逐项确认，确认前一个字节都不写」**。
 *   若各写一份范围归一与暂存状态，就会出现两份「什么算在范围内」——本仓已有过一次
 *   同形事故（v3.303.0 面板手抄字段表成了第二套字段清单）。故两出口共用：
 *     · `floorRange()`  —— 范围归一（**唯一真源**）；
 *     · `stage()`       —— 逐项确认三态（proposed / selected / rejected）。
 *
 * 【修前实测的落点缺口（逐条可指认）】
 *   O7 面：
 *     ① 反馈面（extract-feedback.js）已能给出「改哪个面」，但 `apply.key/from/to` **固定 null**
 *        —— 「建议」没有可比较的替身：用户拿不到「改前是什么、改后是什么、差多少」；
 *     ② 「改了到底有没有用」在旧面上**无处证明**（只有一句目标面名）；
 *     ③ 撤回**没有落点**：改了一条事实与改了一个参数是两件事，旧面把「撤销」只当一件事说。
 *   X9 面：
 *     ④ 「只重提我圈的那一段」没有可复算的范围读数 —— 旧链路只能整楼重跑，
 *        而「未选范围一条不动」**无法被证明**（没有范围读数就没有这条验收）；
 *     ⑤ 重试会重复落事实（按新结果直接写，没有以事实键为轴的幂等）；
 *     ⑥ 新旧正文无法并排：对照读数里没有「出处」这一格。
 *
 * 【六条纪律】
 *   ① **纯函数零写**：不写账、不改配置、不改传入的条目（一律 copy），返回面带 `zeroWrite:true`；
 *   ② **未圈范围不产提案**（`scoped:false` + 空提案）—— 「没选范围」不等于「全选」；
 *   ③ **确认前不写**：`writes` 恒 0；`staged.proposed` 未确认项一律在 proposed 里；
 *   ④ **以事实键为轴的幂等**：同一条事实重试**不产生第二条**（added 只计一次）；
 *   ⑤ **区间读不到就不产提案**（`known:false`）—— 不拿「全楼」冒充「我圈的那段」；
 *   ⑥ **配置撤回与事实撤回分开**：两个撤销凭证、两种 kind、两条处置路径，绝不合成一个「撤销」。
 *
 * 【词表对齐（不写第二份真源的落法）】
 *   本模块的 `CLASS_CANDIDATES` 键集必须与 `extract-feedback.js` 的 `PROBLEM_CLASSES` 逐字对齐；
 *   **由套件按真源对账**（漂移即红），不在本文件里再抄一份中文标签真源。
 *
 * 【可移植性说明】
 *   机制动机来自「纠错必须先能比较、必须受范围约束、必须在确认前不落笔」这一通用需求；
 *   实现按本仓规范重写（零依赖、IIFE 双导出、词表与档位可注入），未复制任何外部代码。
 * ======================================================== */
(function (root) {
    'use strict';

    /** 本面结构版本（形状一变必须抬这个数）。 */
    const CP_VERSION = 1;
    /** 读数 kind。 */
    const CP_KIND = 'correction_plan';
    /** 两个面（**不合成一个「纠错」**：改参数与改事实的处置路径不同）。 */
    const FACES = Object.freeze(['config', 'data']);
    /** 逐项确认三态（等待确认 ≠ 拒绝 ≠ 已确认）。 */
    const STAGES = Object.freeze(['proposed', 'selected', 'rejected']);
    /** 对照四态（X9 验收：展示新增/保留/替换/冲突，**逐项确认**）。 */
    const OUTCOMES = Object.freeze(['added', 'kept', 'replaced', 'conflicted']);
    /** 建议种类三态（config / data / rerun；**只给面向，不给值**）。 */
    const KINDS = Object.freeze(['config', 'data', 'rerun']);
    /**
     * 五类错法 → 候选动作（键集与 `extract-feedback.js::PROBLEM_CLASSES` **逐字对齐**，
     *   由套件按真源对账 —— 本文件不复制它的中文标签）。
     *   `measurable` 表示该候选是否**必须**先跑对照重跑（不可测 ⇒ 一律 unproven，不编原因）。
     */
    const CLASS_CANDIDATES = Object.freeze({
        'missed': Object.freeze({ kind: 'config', target: 'extraction-trigger', measurable: true }),
        'misrecorded': Object.freeze({ kind: 'data', target: 'extraction-content', measurable: true }),
        'wrong-role': Object.freeze({ kind: 'data', target: 'identity-disambiguation', measurable: true }),
        'stale-not-superseded': Object.freeze({ kind: 'config', target: 'fact-supersede', measurable: true }),
        'should-not-record': Object.freeze({ kind: 'config', target: 'admission-gate', measurable: true })
    });
    /** 撤销凭证两种（**分开**：撤配置不动事实，撤事实不动配置）。 */
    const UNDO_KINDS = Object.freeze(['config-undo', 'fact-undo']);

    /** 单行化。 */
    function oneLine(value) {
        return String(value == null ? '' : value).replace(/\s*[\r\n]+\s*/g, ' ').trim();
    }
    /** 楼层归一：有限非负整数否则 null（**不写 0**：0 是第 0 楼，与「不知道第几楼」处置相反）。 */
    function floorOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'boolean' || typeof v === 'object') return null;
        const n = Number(v);
        if (!Number.isFinite(n)) return null;
        const f = Math.floor(n);
        return f < 0 ? null : f;
    }
    /**
     * 范围归一（**唯一真源**）：接受 `{from,to}` / `[a,b]` / 单个数 / 显式楼层数组。
     *   ★ 三个「判不了」各自不同形：**缺范围**（scoped:false）/ **区间颠倒**（reversed）/ 
     *     **端点读不到**（known:false）—— 处置全部不同（前者让用户先圈、中者要用户改、
     *     后者是数据没给楼号）。
     */
    function floorRange(range) {
        const out = { from: null, to: null, scoped: false, known: false, reversed: false, explicit: null, reason: '' };
        if (range === null || range === undefined || range === '') { out.reason = 'no-range'; return out; }
        if (Array.isArray(range)) {
            if (range.length === 0) { out.reason = 'empty-range'; return out; }
            const nums = [];
            let dropped = 0;
            for (const x of range) { const f = floorOrNull(x); if (f === null) dropped++; else nums.push(f); }
            nums.sort((a, b) => a - b);
            if (!nums.length) { out.reason = 'no-usable-floor'; out.reversed = false; return out; }
            out.explicit = nums;
            out.from = nums[0];
            out.to = nums[nums.length - 1];
            out.scoped = true;
            out.known = true;
            if (dropped) out.reason = 'dropped-unreadable:' + dropped;   // 读不到的端点**如实计数**
            return out;
        }
        if (typeof range === 'object') {
            const a = floorOrNull(range.from);
            const b = floorOrNull(range.to);
            if (a === null || b === null) {
                /* 端点读不到 ⇒ **不产提案**（不拿全楼冒充「我圈的那段」）。 */
                out.reason = 'endpoint-unreadable';
                return out;
            }
            out.scoped = true;
            out.known = true;
            if (a > b) {
                /* 区间颠倒：**如实标 reversed 并给空**，不擅自交换端点
                 *   （交换等于替用户改输入，且掩盖了「上来/下去」的真实意图）。 */
                out.from = a; out.to = b; out.reversed = true; out.known = false;
                out.reason = 'reversed-range';
                return out;
            }
            out.from = a; out.to = b;
            return out;
        }
        const one = floorOrNull(range);
        if (one === null) { out.reason = 'unreadable-floor'; return out; }
        out.from = one; out.to = one; out.scoped = true; out.known = true;
        return out;
    }
    /** 某楼层是否在范围内（范围判不了 ⇒ 恒 false，**绝不按「全选」处置**）。 */
    function inScope(sc, floor) {
        if (!sc || sc.known !== true) return false;
        const f = floorOrNull(floor);
        if (f === null) return false;
        if (sc.explicit) return sc.explicit.indexOf(f) >= 0;
        return f >= sc.from && f <= sc.to;
    }
    /** 事实键（幂等与对照的轴）：显式 key 优先，退化到 谓词+主体+楼层。 */
    function factKey(f) {
        if (!f || typeof f !== 'object') return '';
        const k = oneLine(f.key || f.factId || f.id);
        if (k) return k;
        const pred = oneLine(f.predicate || f.pred || f.kind);
        const subj = oneLine(f.subject || f.actor || f.who);
        const fl = floorOrNull(f.floor);
        const comb = [pred, subj].filter(Boolean).join('|');
        return comb ? (comb + '@' + (fl === null ? '?' : fl)) : '';
    }
    /** 事实值（对照用；取不到给空串并把「取不到」交回调用方计数）。 */
    function factValue(f) {
        if (!f || typeof f !== 'object') return '';
        return oneLine(f.value != null ? f.value : (f.text != null ? f.text : f.content));
    }

    /* ─────────────── X9 面：局部重提取与原文对照 ─────────────── */

    /**
     * 产出**受范围约束**的重提取提案 + 原文对照（**逐项确认，确认前不写**）。
     *
     * @param input {
     *   range,                 圈定范围（唯一真源 floorRange）
     *   rewritten,             被改写段落（按楼层）；**未给 ⇒ 不做「只补受影响段」的声明**
     *   oldFacts, newFacts,    旧/新提取结果（对照两侧；条目须带 floor 或 key）
     *   selections             已确认项 [{key, decision}]（可选；不给 ⇒ 全部 proposed）
     *   failed                上一轮失败项（重试面；以事实键为轴幂等）
     * }
     * @returns 提案读数（零写）
     */
    function planReextract(input, opts) {
        const inp = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
        /* ★ `null` 与「没传」不同形：没传是「没有输入」，`null` 是**调用方真的传了一个非对象**
         *   （与数组/字符串同族），一律如实计畸形 —— 静默当空输入会让「读不到」看起来像「没有内容」。 */
        const malformedInput = (input !== undefined && (input === null || typeof input !== 'object' || Array.isArray(input)));
        const sc = floorRange(inp.range);
        const oldList = Array.isArray(inp.oldFacts) ? inp.oldFacts : [];
        const newList = Array.isArray(inp.newFacts) ? inp.newFacts : [];

        /* ① **未圈范围不产提案**（纪律②）。范围颠倒 / 端点读不到同样不产。
         *   ★ **恒定键面**（本仓纪律，C 包 D1 判据治过的形态）：早退面必须与正常路径
         *     **逐字同键** —— 缺 `rewritten` / `readings` 会让下游「按 `rewritten.declared` 断言」
         *     在未圈范围时读到 undefined，而 undefined 与 false 处置相反。 */
        if (!sc.scoped || !sc.known) {
            const rewrittenIn0 = Array.isArray(inp.rewritten) ? inp.rewritten : [];
            const rewritten0 = [];
            let rewrittenNoFloor0 = 0;
            for (const r of rewrittenIn0) { const f = floorOrNull(r); if (f === null) rewrittenNoFloor0++; else rewritten0.push(f); }
            rewritten0.sort((a, b) => a - b);
            return {
                kind: CP_KIND + '@reextract', version: CP_VERSION, face: 'data',
                scope: sc, items: [], byOutcome: { added: 0, kept: 0, replaced: 0, conflicted: 0 },
                staged: { proposed: 0, selected: 0, rejected: 0 }, untouched: oldList.length,
                rewritten: { floors: rewritten0, noFloor: rewrittenNoFloor0, declared: rewritten0.length > 0,
                    why: rewritten0.length ? '只补被改写段（未列出的楼一条不动）'
                        : '未给被改写段 ⇒ 不声明「只补受影响段」' },
                retry: { pending: 0, keys: [], idempotentByFactKey: true, duplicatesPrevented: 0, nothingLostOnFailure: true },
                readings: { considered: newList.length, inScope: 0, outOfScope: 0, oldNoKey: 0, newNoKey: 0, newNoFloor: 0, evidenceIncomplete: 0 },
                writes: 0, applied: false, zeroWrite: true,
                scoped: false, decidable: false,
                why: '范围未圈定（' + (sc.reason || 'no-range') + '）⇒ 不产全量重抽提案；'
                    + '「没选范围」不等于「全选」',
                malformedInput: malformedInput, degraded: false
            };
        }

        const oldMap = new Map();
        let oldNoKey = 0;
        for (const f of oldList) {
            const k = factKey(f);
            if (!k) { oldNoKey++; continue; }
            oldMap.set(k, f);
        }
        const selections = Array.isArray(inp.selections) ? inp.selections : [];
        const decisionOf = new Map();
        for (const s of selections) {
            const k = oneLine(s && (s.key || s.factId));
            const d = oneLine(s && s.decision).toLowerCase();
            if (k && STAGES.indexOf(d) >= 0) decisionOf.set(k, d);
        }

        const items = [];
        const byOutcome = { added: 0, kept: 0, replaced: 0, conflicted: 0 };
        const seenKeys = new Set();
        let duplicatesPrevented = 0;
        let outOfScope = 0;
        let noFloor = 0;
        let newNoKey = 0;
        for (const nf of newList) {
            const floor = floorOrNull(nf && nf.floor);
            if (floor === null) noFloor++;
            if (floor !== null && !inScope(sc, floor)) { outOfScope++; continue; }
            const k = factKey(nf);
            /* ★ 无键的事实**进不了对照**（对照与幂等都以事实键为轴）：如实计数，不静默吞掉。 */
            if (!k) { newNoKey++; continue; }
            /* ★ 幂等轴：同一条事实（同键）重试**只出一项**。 */
            if (seenKeys.has(k)) { duplicatesPrevented++; continue; }
            seenKeys.add(k);
            const prev = oldMap.get(k);
            const nv = factValue(nf);
            const pv = prev ? factValue(prev) : '';
            let outcome;
            if (!prev) outcome = 'added';
            else if (pv === nv) outcome = 'kept';
            /* 「替换」与「冲突」不同形：新值到达时旧值是否**已被标记换代**由 facts 自述
             *   （`supersedes` / `stale` 货真价实地写在条目上）；未标记 ⇒ 冲突
             *   （「改了口径」与「同一时点两个值」处置相反）。 */
            else if (nf && (nf.supersedes === true || nf.stale === true)) outcome = 'replaced';
            else outcome = 'conflicted';
            byOutcome[outcome]++;
            const d = decisionOf.get(k) || 'proposed';
            items.push({
                key: k, floor: floor, outcome: outcome, decision: d,
                before: prev ? { value: pv, floor: floorOrNull(prev.floor), sourceRef: oneLine(prev.sourceRef || prev.ref) } : null,
                after: { value: nv, floor: floor, sourceRef: oneLine(nf.sourceRef || nf.ref) },
                /* 出处两格（X9 验收「新旧正文并排且有出处」）：**取不到如实标空**，不编。 */
                evidenceComplete: !!(prev && oneLine(prev.sourceRef || prev.ref)) && !!(oneLine(nf.sourceRef || nf.ref)),
                requiresUserChoice: d === 'proposed'
            });
        }
        items.sort((a, b) => ((a.floor === null ? -1 : a.floor) - (b.floor === null ? -1 : b.floor)) || a.key.localeCompare(b.key, 'en'));

        const staged = { proposed: 0, selected: 0, rejected: 0 };
        for (const it of items) staged[it.decision]++;

        /* ② 重试面：失败项**可继续**，且以事实键为轴不重复落条。 */
        const failedList = Array.isArray(inp.failed) ? inp.failed : [];
        const retryKeys = [];
        for (const f of failedList) { const k = factKey(f); if (k && retryKeys.indexOf(k) < 0) retryKeys.push(k); }

        const rewrittenIn = Array.isArray(inp.rewritten) ? inp.rewritten : [];
        const rewritten = [];
        let rewrittenNoFloor = 0;
        for (const r of rewrittenIn) { const f = floorOrNull(r); if (f === null) rewrittenNoFloor++; else rewritten.push(f); }
        rewritten.sort((a, b) => a - b);

        return {
            kind: CP_KIND + '@reextract', version: CP_VERSION, face: 'data',
            scope: sc,
            items: items, byOutcome: byOutcome,
            staged: staged,
            untouched: outOfScope,
            rewritten: { floors: rewritten, noFloor: rewrittenNoFloor, declared: rewritten.length > 0,
                why: rewritten.length ? '只补被改写段（未列出的楼一条不动）'
                    : '未给被改写段 ⇒ 不声明「只补受影响段」' },
            retry: {
                pending: retryKeys.length, keys: retryKeys.slice(0, 20),
                idempotentByFactKey: true, duplicatesPrevented: duplicatesPrevented,
                nothingLostOnFailure: true
            },
            readings: {
                considered: newList.length, inScope: items.length, outOfScope: outOfScope,
                oldNoKey: oldNoKey, newNoKey: newNoKey, newNoFloor: noFloor,
                evidenceIncomplete: items.filter((i) => !i.evidenceComplete).length
            },
            /* ★ 纪律③：**确认前不写** —— `writes` 恒 0；`applied` 只在调用方显式确认后由外部置位。 */
            writes: 0, applied: false, zeroWrite: true, scoped: true, decidable: true,
            why: '提案已受范围约束；逐项确认前不落笔（未确认项留在 staged.proposed）',
            malformedInput: malformedInput, degraded: false
        };
    }

    /* ─────────────── O7 面：可比较的修正方案 ─────────────── */

    /**
     * 由反馈生成**可比较**的候选方案（改前 / 改后读数 + 撤回两路分开）。
     *
     * @param feedback 一条或多条反馈（数组即逐条给候选）
     * @param trace    { compare, holdout, measured } —— 对照重跑与留出集读数（**唯一真源**）
     * @param opts     { range, apply } —— `range` 用来圈定「这次只改哪一段」；
     *                  `apply:false` 是**唯一合法值**（本面不提供自动应用，见纪律⑥）
     * @returns 候选读数（零写）
     */
    function planConfigFix(feedback, trace, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const list = Array.isArray(feedback) ? feedback : (feedback ? [feedback] : []);
        if (!list.length) {
            /* ★ **恒定键面**：与下面正常路径**逐字同键**（缺 `proof` / `compareState` / `scope` /
             *   `writes` 会让下游按键断言在「无反馈」时读到 undefined —— 那与 false 处置相反）。
             *   `reason:'no-feedback'` 是**额外**一格，不是替代品（不产候选 ≠ 判不了对照）。 */
            return {
                kind: CP_KIND + '@config', version: CP_VERSION, face: 'config',
                candidates: [], count: 0, unknownClass: 0, scope: (o.range === undefined ? null : floorRange(o.range)),
                undo: { kinds: UNDO_KINDS.slice(), separate: true,
                    configUndo: { kind: 'config-undo', token: 'undo:config:' + (o.now ? String(o.now) : 'latest'),
                        what: '把参数改回改前的值', touchesFacts: false },
                    factUndo: { kind: 'fact-undo', token: 'undo:fact:' + (o.now ? String(o.now) : 'latest'),
                        what: '把这次重提取落下的条目撤回并保留换代链', touchesConfig: false },
                    note: '撤配置不动事实，撤事实不动配置 —— 合成一个「撤销」会让人以为两件都回退了' },
                applied: false, defaultAuto: false, writes: 0, zeroWrite: true,
                decidable: false, proof: 'unproven', compareState: 'absent',
                reason: 'no-feedback', why: '无反馈 ⇒ 不产候选（不产空候选集，也不产「无事可做」的假结论）',
                malformedInput: false, degraded: false
            };
        }
        /* 对照读数（不编原因：不可测一律 unproven，与 extract-feedback 同纪律）。
         *   ★ **「对照缺席」与「对照判不了」严格分开**（本仓「缺席 ≠ 旧版」同款纪律）：
         *     前者是「还没跑过」，后者是「跑了但读不出可测结论」——
         *     合成一档会让读者以为「跑过了、只是结论不好」。 */
        const tr = (trace && typeof trace === 'object') ? trace : {};
        const cmpState = !tr.compare ? 'absent'
            : ((tr.compare.measurable === false || tr.compare.ok === false) ? 'unmeasurable' : 'measurable');
        const measurable = (cmpState === 'measurable');
        const holdoutOk = !!(tr.holdout && tr.holdout.measured === true && tr.holdout.improved === true);
        const proof = measurable ? (holdoutOk ? 'proven' : 'overfit') : 'unproven';
        const sc = o.range === undefined ? null : floorRange(o.range);

        const candidates = [];
        let unknown = 0;
        for (const fb of list) {
            const cls = oneLine(fb && (fb['class'] || fb.cls));
            const spec = CLASS_CANDIDATES[cls];
            if (!spec) { unknown++; continue; }
            candidates.push({
                id: 'fix-' + cls,
                cls: cls,
                target: spec.target,
                kind: spec.kind,
                /* ★ 只给「面向 + 受范围约束的替身」，**不给值**：给值就是在替用户调参。 */
                substitute: { key: null, from: null, to: null, note: '具体键值在面板上由用户显式选定' },
                range: sc,
                measurable: (spec.measurable === true),
                needsMeasure: (spec.measurable === true) && !measurable,
                proof: proof,
                proofWhy: (cmpState === 'unmeasurable')
                    ? '对照重跑不可测（' + String((tr.compare && (tr.compare.reason || tr.compare.why)) || '未自述') + '）⇒ 不可测 ≠ 通过，不编原因'
                    : (cmpState === 'absent'
                        ? '无对照重跑读数（compare 缺席 / 未跑）⇒ 判不了，不编原因'
                        : (holdoutOk
                            ? '对照可测 + 留出集真跑且改善'
                            : (tr.holdout && tr.holdout.measured === true
                                ? '对照可测但留出集未改善（含退化）⇒ 只优化了当前样本'
                                : '对照可测但留出集未跑（measured 非 true）⇒ 同「未验」处置'))),
                /* ★ 改前 / 改后对照（O7 验收「显示修前/修后事实与预算差」）：
                 *   两侧**都是读数**，未跑完的一侧如实 null（不估、不填 0）。 */
                compare: {
                    before: { facts: (tr.before && Number.isFinite(Number(tr.before.facts))) ? Number(tr.before.facts) : null,
                              budget: (tr.before && Number.isFinite(Number(tr.before.budget))) ? Number(tr.before.budget) : null },
                    after: (proof === 'unproven') ? null
                        : { facts: (tr.after && Number.isFinite(Number(tr.after.facts))) ? Number(tr.after.facts) : null,
                            budget: (tr.after && Number.isFinite(Number(tr.after.budget))) ? Number(tr.after.budget) : null },
                    measured: measurable,
                    /* ★ 三态**各自不同形**（本仓纪律）：`measured:false` = 对照没跑；
                     *   `measured:true, countsMeasured:false` = 跑了但两/一侧没量到数；
                     *   两者都不是「差值为 0」。 */
                    countsMeasured: measurable
                        && Number.isFinite(Number(tr.before && tr.before.facts)) && Number.isFinite(Number(tr.after && tr.after.facts))
                        && Number.isFinite(Number(tr.before && tr.before.budget)) && Number.isFinite(Number(tr.after && tr.after.budget)),
                    /* 差值为 null 表示**没量过**，与「差值为 0」不同形。 */
                    delta: measurable ? {
                        facts: (Number.isFinite(Number(tr.after && tr.after.facts)) && Number.isFinite(Number(tr.before && tr.before.facts)))
                            ? Number(tr.after.facts) - Number(tr.before.facts) : null,
                        budget: (Number.isFinite(Number(tr.after && tr.after.budget)) && Number.isFinite(Number(tr.before && tr.before.budget)))
                            ? Number(tr.after.budget) - Number(tr.before.budget) : null
                    } : { facts: null, budget: null }
                },
                requiresUserChoice: true
            });
        }
        return {
            kind: CP_KIND + '@config', version: CP_VERSION, face: 'config',
            candidates: candidates, count: candidates.length,
            unknownClass: unknown,
            scope: sc,
            /* ★ 纪律⑥：**撤回两路分开** —— 两个凭证、两种 kind，绝不合成一个「撤销」。 */
            undo: {
                kinds: UNDO_KINDS.slice(),
                separate: true,
                configUndo: { kind: 'config-undo', token: 'undo:config:' + (o.now ? String(o.now) : 'latest'),
                    what: '把参数改回改前的值', touchesFacts: false },
                factUndo: { kind: 'fact-undo', token: 'undo:fact:' + (o.now ? String(o.now) : 'latest'),
                    what: '把这次重提取落下的条目撤回并保留换代链', touchesConfig: false },
                note: '撤配置不动事实，撤事实不动配置 —— 合成一个「撤销」会让人以为两件都回退了'
            },
            /* ★ 应用闸：**默认不自动改参数**（O7 验收④），且本面只出提案，落笔归 owner 侧。 */
            applied: false, defaultAuto: false, writes: 0, zeroWrite: true,
            decidable: (proof !== 'unproven'),
            proof: proof,
            /* 「对照缺席」/「对照判不了」/「对照可测」三态如实外露（不合成一档）。 */
            compareState: cmpState,
            /* `reason` 与无反馈早退面同键（恒定键面：缺席与在场逐字同键）。 */
            reason: '',
            why: '候选已给面向与受范围约束的替身；确认前不改参数、不落笔',
            malformedInput: false, degraded: false
        };
    }

    /**
     * 自检：**七条当场自证**（每条对应一条纪律）。
     */
    function selfCheck() {
        const oldFacts = [{ key: 'f1', value: '北京', floor: 3, sourceRef: 'floor:3' },
            { key: 'f2', value: '同事', floor: 4, sourceRef: 'floor:4' }];
        const newFacts = [{ key: 'f1', value: '上海', floor: 3, sourceRef: 'floor:3', stale: true },
            { key: 'f2', value: '同事', floor: 4, sourceRef: 'floor:4' },
            { key: 'f3', value: '新事', floor: 5, sourceRef: 'floor:5' },
            { key: 'f3', value: '新事', floor: 5, sourceRef: 'floor:5' }];
        const input = { range: { from: 3, to: 5 }, newFacts: newFacts, oldFacts: oldFacts };
        const snapshot = JSON.stringify(newFacts);
        const r1 = planReextract(input, {});
        const r2 = planReextract(input, {});
        const noWrite = (snapshot === JSON.stringify(newFacts));
        const scopedOnly = planReextract({ range: null, newFacts: newFacts, oldFacts: oldFacts }, {}).writes === 0
            && planReextract({ range: null, newFacts: newFacts, oldFacts: oldFacts }, {}).candidates === undefined;
        const unwritten = (r1.writes === 0 && r1.applied === false && r1.staged.proposed === r1.items.length);
        const idempotent = (r1.readings.considered === 4 && r1.items.filter((i) => i.key === 'f3').length === 1);
        const distinct = (r1.byOutcome.replaced === 1 && r1.byOutcome.kept === 1 && r1.byOutcome.added === 1
            && r1.byOutcome.conflicted === 0);
        const undoSeparate = (function () {
            const c = planConfigFix({ cls: 'missed' }, { compare: { measurable: true } }, {});
            return c.undo.separate === true && c.undo.kinds.length === 2 && c.defaultAuto === false && c.applied === false;
        })();
        /* ⑦ 对照三态**互不同形**：缺席（没跑）/ 不可测（跑了判不了）必须可区分，且都判不了。 */
        const cmpAbsent = planConfigFix({ cls: 'missed' }, {}, {});
        const cmpUnmeasurable = planConfigFix({ cls: 'missed' }, { compare: { measurable: false } }, {});
        const cmpOk = planConfigFix({ cls: 'missed' }, { compare: { measurable: true }, holdout: { measured: true, improved: true } }, {});
        const compareStates = (cmpAbsent.compareState === 'absent' && cmpUnmeasurable.compareState === 'unmeasurable'
            && cmpOk.compareState === 'measurable'
            && cmpAbsent.proof === 'unproven' && cmpUnmeasurable.proof === 'unproven'
            && cmpAbsent.decidable === false && cmpUnmeasurable.decidable === false && cmpOk.decidable === true
            && cmpAbsent.candidates[0].proofWhy !== cmpUnmeasurable.candidates[0].proofWhy);
        const deterministic = JSON.stringify(r1) === JSON.stringify(r2);
        let serializable = true;
        try { serializable = JSON.parse(JSON.stringify(r1)).kind === CP_KIND + '@reextract'; } catch (_e) { serializable = false; }
        return {
            ok: noWrite && scopedOnly && unwritten && idempotent && distinct && undoSeparate && compareStates
                && deterministic && serializable,
            noWrite: noWrite, scopedOnly: scopedOnly, unwritten: unwritten, idempotent: idempotent,
            outcomesDistinct: distinct, undoSeparate: undoSeparate, compareStates: compareStates,
            deterministic: deterministic, serializable: serializable
        };
    }

    /**
     * 读数一句话（诊断 / 自检行）。三态必须分开说。
     *   ★ **无读数与空候选严格不同形**：`planConfigFix` 产出的读数带 `kind`，
     *     面板还没读到时传进来的 `null` / 非对象 **没有** `kind` —— 前者说「尚无反馈」，
     *     后者必须说「还没读到」（把「没读到」说成「候选 0」就是替面板编了一个结论）。
     */
    function line(read) {
        const r = (read && typeof read === 'object') ? read : {};
        const isRead = (r.kind === CP_KIND + '@config' || r.kind === CP_KIND + '@reextract');
        if (!isRead) return '—（模块未产出读数）';
        if (r.degraded) return '纠错方案异常（已降级，不外抛）';
        if (r.reason === 'module-unavailable') return '模块未加载（correction-plan.js）';
        if (r.reason === 'no-feedback') return '尚无提取反馈（无候选可产）';
        if (r.face === 'data') {
            if (!r.scoped) return '重提取范围未圈定（不产提案）';
            const o = r.byOutcome || {};
            const parts = ['对照 新增 ' + (o.added || 0) + ' / 保留 ' + (o.kept || 0) + ' / 替换 ' + (o.replaced || 0)];
            if (o.conflicted) parts.push('**冲突 ' + o.conflicted + '**');
            parts.push('待确认 ' + ((r.staged && r.staged.proposed) || 0));
            if (r.untouched) parts.push('范围外未动 ' + r.untouched);
            if (r.retry && r.retry.pending) parts.push('可重试 ' + r.retry.pending);
            return parts.join(' · ');
        }
        const c = r.candidates || [];
        const parts = ['候选 ' + c.length, '背书 ' + (r.proof || 'unproven')];
        if (r.unknownClass) parts.push('**归类未定 ' + r.unknownClass + '**');
        if (r.scope && r.scope.scoped) parts.push('范围 ' + r.scope.from + '-' + r.scope.to);
        else parts.push('范围未圈定');
        parts.push('自动应用 ' + (r.defaultAuto === true ? '开' : '关'));
        return parts.join(' · ');
    }

    const api = {
        CP_VERSION: CP_VERSION,
        CP_KIND: CP_KIND,
        FACES: FACES,
        STAGES: STAGES,
        OUTCOMES: OUTCOMES,
        KINDS: KINDS,
        CLASS_CANDIDATES: CLASS_CANDIDATES,
        UNDO_KINDS: UNDO_KINDS,
        floorOrNull: floorOrNull,
        floorRange: floorRange,
        inScope: inScope,
        factKey: factKey,
        factValue: factValue,
        planReextract: planReextract,
        planConfigFix: planConfigFix,
        line: line,
        selfCheck: selfCheck
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaCorrectionPlan = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);