/**
 * experience-rebuild.js — [v3.355.0 · M6-O1] 连续经历重建：把散落往事召回成一件完整的事
 *   纯函数 IIFE，零依赖、零联网、零写回。
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   本仓已有三样东西，各自都对，但都不回答用户那句话：
 *     · event-completeness.js —— 一个事件内部四段（cause/action/result/followup）齐不齐；
 *     · causal-chain.js      —— 两个事件之间是有据还是推测的因果边；
 *     · unified-recall.js    —— 多源候选的融合排序。
 *   用户说的是「上次筹展那件事到底怎么回事」。而在存储里，一件「事」不是一条记录：
 *   起因在第 12 楼、行动在第 26 与 40 楼、转折在第 33 楼、结果在第 44 楼，
 *   第 52 楼又补一句「那次其实没办成」。三样既有模块各自只看自己那一格，
 *   于是召回只能给出一把带关键词的碎片，拼接工作丢给用户。
 *
 * 【本模块的职责（只做归属 + 演变 + 可展开，不复制别人的边）】
 *   把同一件事的散落**引用**组织成一个可修订的「经历单元」：
 *     · 只持引用（source + refId + floor + phase + quote），**不持正文** ——
 *       正文永远在原 owner（摘要/事实/事件账）里；复制一份就是第二真源。
 *     · 段角色沿用 event-completeness 的词并补两格：
 *         cause 起因 / action 行动 / turn 转折 / result 结果 / pending 未结束的部分
 *       ★ 转折（turn）是计划原文点名的一格，既有四段里没有它。
 *     · 合并只出**候选**，永不自动合：计划原文「聚类错误比漏聚危险」，
 *       故自动结果先作为可解释候选，合与拆都是人的动作。
 *
 * 【四条硬纪律（每条都对应一次真会出事的假读数）】
 *   1. **逐段有出处**：每段必须带 source+refId 双键（能回查）。
 *      只有 source 没有 refId 的段等于挂了个假引用 ——「这段有出处」变成无法核对的断言。
 *   2. **时间接近不是因果**：同楼、相邻楼、同一天都**不**构成合并依据。
 *      合并候选必须至少有**一条强信号**（同人物 / 同场所 / 同约定 / 同名专名），
 *      楼层接近只记作弱信号，**单独永不出候选**。
 *   3. **删源要降级**：删掉 result 段的来源后，这段经历不许再说「已完成」。
 *      计划验收原文：「删除结果来源后，保留起因而不再断言事情已完成」。
 *      做法是按**现存引用**重算完整性，绝不缓存上次结论。
 *   4. **缺口与空值可分**：某段「没来」记 absent，「来了但读不出」记 unreadable，
 *      两者处置相反（前者该等该问，后者该修存储），不许压平成一个「没有」。
 *
 * 【本模块不做什么（边界）】
 *   · 不判断正文里的事是否真发生（那是提取与人的事）；只组织已确认的引用。
 *   · 不自动补段、不按 summary 猜一个结果。
 *   · 不复制 causal-chain 的边：因果仍归 causal-chain，本模块只标「这段属于这件事」。
 *   · 不承诺单靠关键词理解全部经历（计划原文同款声明）。
 *
 * 挂 window.LonShaExperienceRebuild，供 index.js 召回组织 / 续写材料 / 诊断面使用。
 */
(function (root) {
    'use strict';

    const ER_VERSION = 1;
    const ER_KIND = 'experience_rebuild';

    /** 段角色（★ turn 是既有四段里没有、计划原文点名的一格）。 */
    const EXP_PHASES = Object.freeze({
        CAUSE: 'cause',
        ACTION: 'action',
        TURN: 'turn',
        RESULT: 'result',
        PENDING: 'pending',
    });
    /** 可回查的源类别（其余一律拒收：不许挂假引用）。 */
    const EXP_SOURCES = Object.freeze({
        SUMMARY: 'summary',
        FACT: 'fact',
        EVENT: 'event',
        DIARY: 'diary',
        FLOOR: 'floor',
        RELATION: 'relation',
    });
    /** 单元状态。★ candidate 永不自动升为 confirmed（只有人能确认）。 */
    const EXP_STATES = Object.freeze({
        CANDIDATE: 'candidate',
        CONFIRMED: 'confirmed',
        SPLIT: 'split',
    });
    /** 段面四态（present/absent/unreadable/retracted，绝不压平）。 */
    const PHASE_STATES = Object.freeze({
        PRESENT: 'present',
        ABSENT: 'absent',
        UNREADABLE: 'unreadable',
        RETRACTED: 'retracted',
    });
    /** 完整性形状（不是布尔值，是一份缺什么）。 */
    const EXP_SHAPES = Object.freeze({
        COMPLETE: 'complete',
        OPEN: 'open',
        DANGLING: 'dangling',
        RETRACTED: 'retracted',
    });
    /** 归因（每条可读，不许用 'error' 一锅装）。 */
    const ER_REASONS = Object.freeze({
        OK: 'ok',
        NOT_OBJECT: 'not-object',
        NO_TITLE: 'no-title',
        NO_SOURCE: 'no-source',
        BAD_SOURCE_KIND: 'bad-source-kind',
        BAD_PHASE: 'bad-phase',
        NOT_FOUND: 'not-found',
        ALREADY_SPLIT: 'already-split',
        DUP_SOURCE: 'dup-source',
        WEAK_ONLY: 'weak-signal-only',
        SELF_MERGE: 'self-merge',
        OVER_LIMIT: 'over-limit',
        BAD_SHAPE: 'bad-shape',
    });
    const EXP_LIMITS = Object.freeze({
        experiences: 30,
        refsPerPhase: 12,
        participants: 8,
        title: 60,
        quote: 200,
        /** 合并候选上限（防候选爆炸淹掉界面）。 */
        candidates: 8,
        /** 弱信号窗口（楼层差 ≤ 该值只算「接近」，永远单独不出候选）。 */
        floorWindow: 6,
    });

    /* ---------- 基础归一（纯空白不算值；与 open-ref / affair / comm 同口径） ---------- */
    function str(v) { return String(v == null ? '' : v).trim(); }
    function capStr(v, n) {
        const s = str(v);
        return s.length > n ? s.slice(0, n) : s;
    }
    function numOrNull(v) {
        if (v == null || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    function strList(v, cap) {
        const out = [];
        if (!Array.isArray(v)) return out;
        for (const item of v) {
            const s = str(item);
            if (s && out.indexOf(s) < 0) out.push(s);
            if (out.length >= cap) break;
        }
        return out;
    }
    function hasPhase(p) { return Object.values(EXP_PHASES).indexOf(str(p)) >= 0; }
    function hasSourceKind(k) { return Object.values(EXP_SOURCES).indexOf(str(k)) >= 0; }

    /**
     * 归一一条来源引用。
     * ★ 缺源口径：source + refId **双键齐备**才算有源（能回查）。
     * ★ 畸形输入不抛、不补，产出 readable:false 的空壳，由上层计数上报。
     * ★ 判定看 *Raw 原始值（不看兜底后的值）：否则归一不幂等 ——
     *   首次归一已把不认识的 source 兜底成 floor，二次归一就会拿 floor 去判「认识」，
     *   把 readable:false 洗成 true，「有但读不出来」读两遍就变成「好好的一段」。
     */
    function normalizeRef(raw) {
        const r = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
        const source = str(r.source);
        const sourceRaw = str(r.sourceRaw) || source;
        const refId = str(r.refId);
        const phase = str(r.phase);
        const phaseRaw = str(r.phaseRaw) || phase;
        const readable = hasSourceKind(sourceRaw) && hasPhase(phaseRaw) && !!refId;
        return {
            id: str(r.id) || (sourceRaw && refId ? sourceRaw + ':' + refId : ''),
            source: hasSourceKind(sourceRaw) ? sourceRaw : EXP_SOURCES.FLOOR,
            sourceRaw: sourceRaw,
            refId: refId,
            phase: hasPhase(phaseRaw) ? phaseRaw : EXP_PHASES.ACTION,
            phaseRaw: phaseRaw,
            floor: numOrNull(r.floor),
            /** 引文（短摘，用于展开时定位原话；正文仍归原 owner）。 */
            quote: capStr(r.quote, EXP_LIMITS.quote),
            /** 已删源：保留引用行以便追溯，但不再参与完整性判定。 */
            retracted: r.retracted === true,
            readable: readable,
        };
    }
    /**
     * 归一一个经历单元。
     * ★ 有 id 或 title 的一律保留（哪怕形态坏），只标 readable:false；
     *   连身份都没有的条目才丢（界面上无从显示，留着只占位置）。
     */
    function normalizeExperience(raw) {
        const e = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
        const id = str(e.id);
        const title = capStr(e.title, EXP_LIMITS.title);
        const refsIn = Array.isArray(e.refs) ? e.refs : [];
        const refs = [];
        for (const item of refsIn.slice(0, EXP_LIMITS.refsPerPhase * 5)) refs.push(normalizeRef(item));
        const base = {
            id: id,
            title: title,
            participants: strList(e.participants, EXP_LIMITS.participants),
            place: capStr(e.place, EXP_LIMITS.title),
            contract: capStr(e.contract, EXP_LIMITS.title),
            refs: refs,
            state: (Object.values(EXP_STATES).indexOf(str(e.state)) >= 0) ? str(e.state) : EXP_STATES.CANDIDATE,
            openedAt: numOrNull(e.openedAt),
            closedAt: numOrNull(e.closedAt),
            note: capStr(e.note, EXP_LIMITS.title),
            mergedFrom: strList(e.mergedFrom, 8),
            splitInto: strList(e.splitInto, 8),
            readable: true,
            droppedRefs: 0,
        };
        if (!id && !title) return null;
        if (!Array.isArray(e.refs)) base.readable = false;
        else if (refs.length < refsIn.length) base.readable = false;
        base.droppedRefs = refs.filter(function (r) { return r.readable === false; }).length;
        if (base.droppedRefs > 0) base.readable = false;
        /* ★ 不可读要粘住（幂等）：归一产物再被归一一次，结论必须还是不可读。 */
        if (e.readable === false) base.readable = false;
        return base;
    }
    function normalizeExperiences(raw) {
        const out = [];
        if (!Array.isArray(raw)) return out;
        for (const item of raw.slice(0, EXP_LIMITS.experiences)) {
            const e = normalizeExperience(item);
            if (e) out.push(e);
        }
        return out;
    }

    /* ---------- 定位层（读侧写侧共用同一份真数组） ----------
     * ★ 跨仓通用教训（RubyPhone v4.49.0 判据抓到的那一族）：
     *   若从 normalizeExperiences() 里取，返回的是**归一副本**；而写回路径用
     *   arr.indexOf(t) 按**引用**比较，副本在真数组里找不到 ⇒ -1 ⇒ next[-1] = updated：
     *   数组被挂到 -1 号属性上、原位置纹丝不动 ⇒ **写入静默丢失（不报错、只丢数据）**。
     *   故本模块读侧写侧一律锚在同一份真数组上：raw 保身份、cur 保形态、idx 是唯一落点。
     */
    function findExperience(list, id) {
        const want = str(id);
        if (!want) return null;
        const arr = Array.isArray(list) ? list : [];
        for (const e of arr) {
            if (e && typeof e === 'object' && !Array.isArray(e) && str(e.id) === want) return e;
        }
        return null;
    }
    function indexOfExperience(list, id) {
        const want = str(id);
        if (!want) return -1;
        const arr = Array.isArray(list) ? list : [];
        for (let i = 0; i < arr.length; i += 1) {
            const e = arr[i];
            if (e && typeof e === 'object' && !Array.isArray(e) && str(e.id) === want) return i;
        }
        return -1;
    }
    function locate(list, id) {
        const raw = findExperience(list, id);
        if (!raw) return null;
        return { raw: raw, cur: normalizeExperience(raw), idx: indexOfExperience(list, id) };
    }

    /* ---------- 写层（每步统一返回 {ok, why, exp, list}） ---------- */
    function nextId(now) {
        const at = numOrNull(now);
        return 'exp' + String(at == null ? 0 : at) + '_' + Math.random().toString(36).slice(2, 8);
    }
    /** 开一个经历单元（只认标题；id 由 now + 随机片生成）。 */
    function openExperience(list, title, seed, now) {
        const t = capStr(title, EXP_LIMITS.title);
        const arr = Array.isArray(list) ? list : [];
        if (!t) return { ok: false, why: ER_REASONS.NO_TITLE, exp: null, list: arr };
        if (arr.length >= EXP_LIMITS.experiences) {
            return { ok: false, why: ER_REASONS.OVER_LIMIT, exp: null, list: arr };
        }
        const s = (seed && typeof seed === 'object') ? seed : {};
        const exp = normalizeExperience({
            id: nextId(now),
            title: t,
            participants: s.participants,
            place: s.place,
            contract: s.contract,
            refs: [],
            state: EXP_STATES.CANDIDATE,
            openedAt: numOrNull(now),
            note: s.note,
        });
        return { ok: true, why: ER_REASONS.OK, exp: exp, list: arr.concat([exp]) };
    }
    /**
     * 挂一条来源引用。
     * 判定顺序（**改序即改结论**）：缺单元 → 缺源 → 坏形态 → 已拆开 → 重复源 → 上限。
     * ★ 「已拆开」排在重复源之前：拆开是人做的决定，之后任何引用都该归到拆出的那一半，
     *   不该被下一条自动引用悄悄缝回原单元（与 comm-thread「收束优先于间隔」同族）。
     */
    function addRef(list, expId, ref) {
        const arr = Array.isArray(list) ? list : [];
        const loc = locate(arr, expId);
        if (!loc || loc.idx < 0 || !loc.cur) {
            return { ok: false, why: ER_REASONS.NOT_FOUND, exp: null, list: arr };
        }
        const e = loc.cur;
        const r = normalizeRef(ref);
        if (!r.refId || !r.id) return { ok: false, why: ER_REASONS.NO_SOURCE, exp: e, list: arr };
        if (!r.readable) {
            const why = !hasSourceKind(r.sourceRaw) ? ER_REASONS.BAD_SOURCE_KIND
                : (!hasPhase(r.phaseRaw) ? ER_REASONS.BAD_PHASE : ER_REASONS.BAD_SHAPE);
            return { ok: false, why: why, exp: e, list: arr };
        }
        if (e.state === EXP_STATES.SPLIT) {
            return { ok: false, why: ER_REASONS.ALREADY_SPLIT, exp: e, list: arr };
        }
        const dup = e.refs.some(function (x) { return x.source === r.source && x.refId === r.refId; });
        if (dup) return { ok: false, why: ER_REASONS.DUP_SOURCE, exp: e, list: arr };
        const phaseCount = e.refs.filter(function (x) { return x.phase === r.phase; }).length;
        if (phaseCount >= EXP_LIMITS.refsPerPhase) {
            return { ok: false, why: ER_REASONS.OVER_LIMIT, exp: e, list: arr };
        }
        const updated = Object.assign({}, loc.raw, { refs: e.refs.concat([r]), readable: true });
        const next = arr.slice();
        next[loc.idx] = updated;
        return { ok: true, why: ER_REASONS.OK, exp: normalizeExperience(updated), list: next };
    }
    /**
     * 删一条来源引用（**不删引用行**，只标 retracted）。
     * ★ 为什么不物理删：删掉行就再也无法回答「这条曾从哪来过」，
     *   而验收③正需要知道「有过一个结果，只是它不作数了」。
     */
    function retractRef(list, expId, refId, source) {
        const arr = Array.isArray(list) ? list : [];
        const loc = locate(arr, expId);
        if (!loc || loc.idx < 0 || !loc.cur) {
            return { ok: false, why: ER_REASONS.NOT_FOUND, exp: null, list: arr };
        }
        const wantId = str(refId);
        const wantSrc = str(source);
        let hit = false;
        const refs = loc.cur.refs.map(function (r) {
            if (r.refId !== wantId) return r;
            if (wantSrc && r.source !== wantSrc) return r;
            hit = true;
            return Object.assign({}, r, { retracted: true });
        });
        if (!hit) return { ok: false, why: ER_REASONS.NOT_FOUND, exp: loc.cur, list: arr };
        const updated = Object.assign({}, loc.raw, { refs: refs });
        const next = arr.slice();
        next[loc.idx] = updated;
        return { ok: true, why: ER_REASONS.OK, exp: normalizeExperience(updated), list: next };
    }
    /** 显式确认一个候选（★ 只有人能确认：本模块没有「自动确认」路径）。 */
    function confirmExperience(list, expId, now) {
        const arr = Array.isArray(list) ? list : [];
        const loc = locate(arr, expId);
        if (!loc || loc.idx < 0 || !loc.cur) {
            return { ok: false, why: ER_REASONS.NOT_FOUND, exp: null, list: arr };
        }
        const updated = Object.assign({}, loc.raw, {
            state: EXP_STATES.CONFIRMED,
            closedAt: numOrNull(now),
        });
        const next = arr.slice();
        next[loc.idx] = updated;
        return { ok: true, why: ER_REASONS.OK, exp: normalizeExperience(updated), list: next };
    }

    /* ---------- 合并候选层（只出候选，永不自动合） ---------- */
    function overlapCount(a, b) {
        let n = 0;
        for (const x of a) if (b.indexOf(x) >= 0) n += 1;
        return n;
    }
    function floorRangeOf(exp) {
        let lo = null, hi = null;
        for (const r of exp.refs) {
            if (r.retracted || r.floor == null) continue;
            if (lo == null || r.floor < lo) lo = r.floor;
            if (hi == null || r.floor > hi) hi = r.floor;
        }
        return { lo: lo, hi: hi };
    }
    /**
     * 评估两个单元是否构成合并候选。
     * ★ 强信号（任一即可与另一条组成候选）：same-participants / same-place /
     *   same-contract / same-title（同名专名）。
     * ★ 弱信号：floor-close（楼层差 ≤ floorWindow）—— **单独永不构成候选**。
     *   理由：时间接近不是因果。把两层楼相近的两件事合成一件，整段读数被污染；
     *   漏合只是少一段，用户自己再挂一次即可。
     */
    function mergeSignals(a, b) {
        const ea = normalizeExperience(a), eb = normalizeExperience(b);
        if (!ea || !eb) return { ok: false, why: ER_REASONS.NOT_OBJECT, strong: [], weak: [] };
        const strong = [];
        const weak = [];
        if (overlapCount(ea.participants, eb.participants) > 0) strong.push('same-participants');
        if (ea.place && eb.place && ea.place === eb.place) strong.push('same-place');
        if (ea.contract && eb.contract && ea.contract === eb.contract) strong.push('same-contract');
        if (ea.title && eb.title && ea.title === eb.title) strong.push('same-title');
        const ra = floorRangeOf(ea), rb = floorRangeOf(eb);
        if (ra.lo != null && rb.lo != null) {
            const gap = Math.max(ra.lo, rb.lo) - Math.min(ra.hi, rb.hi);
            if (gap <= 0) weak.push('floor-overlap');
            else if (gap <= EXP_LIMITS.floorWindow) weak.push('floor-close');
        }
        return { ok: true, why: ER_REASONS.OK, strong: strong, weak: weak };
    }
    /**
     * 提出合并候选（**只读**：不改 list、不建单元）。
     * 每条都带 why 与 signals，供界面显示「为什么建议合」；
     * 人接受才走 applyMerge，人拆开走 splitExperience。
     */
    function mergeCandidates(list) {
        const arr = normalizeExperiences(list);
        const out = [];
        for (let i = 0; i < arr.length; i += 1) {
            for (let j = i + 1; j < arr.length; j += 1) {
                const s = mergeSignals(arr[i], arr[j]);
                if (!s.strong.length) continue; /* ★ 弱信号单独不出候选 */
                out.push({
                    aId: arr[i].id,
                    bId: arr[j].id,
                    strong: s.strong.slice(),
                    weak: s.weak.slice(),
                    why: '共享 ' + s.strong.join(' / ')
                        + (s.weak.length ? '（另有弱信号 ' + s.weak.join(' / ') + '，不单独作依据）' : ''),
                });
                if (out.length >= EXP_LIMITS.candidates) return out;
            }
        }
        return out;
    }
    /** 接受合并：把 b 的引用并入 a，b 标 split（不物理删除，便于撤销追溯）。 */
    function applyMerge(list, aId, bId) {
        const arr = Array.isArray(list) ? list : [];
        if (str(aId) === str(bId)) return { ok: false, why: ER_REASONS.SELF_MERGE, exp: null, list: arr };
        const la = locate(arr, aId), lb = locate(arr, bId);
        if (!la || !lb || la.idx < 0 || lb.idx < 0 || !la.cur || !lb.cur) {
            return { ok: false, why: ER_REASONS.NOT_FOUND, exp: null, list: arr };
        }
        const refs = la.cur.refs.slice();
        for (const r of lb.cur.refs) {
            const dup = refs.some(function (x) { return x.source === r.source && x.refId === r.refId; });
            if (!dup) refs.push(r);
        }
        const participants = strList(la.cur.participants.concat(lb.cur.participants), EXP_LIMITS.participants);
        const updatedA = Object.assign({}, la.raw, {
            refs: refs,
            participants: participants,
            mergedFrom: strList(la.cur.mergedFrom.concat([lb.cur.id]), 8),
        });
        const updatedB = Object.assign({}, lb.raw, { state: EXP_STATES.SPLIT, splitInto: [la.cur.id] });
        const next = arr.slice();
        next[la.idx] = updatedA;
        next[lb.idx] = updatedB;
        return { ok: true, why: ER_REASONS.OK, exp: normalizeExperience(updatedA), list: next };
    }
    /**
     * 拆开一个（被误并的）经历单元 —— 保留人的拆分权。
     * 拆开后原单元只留 keepRefIds 里的引用，其余组成**新单元**（标题加「（拆出）」），
     * 原单元标 split。这不是删除：两半都还在，重开后问答与续写跟着新边界走。
     */
    function splitExperience(list, expId, keepRefIds, now) {
        const arr = Array.isArray(list) ? list : [];
        const loc = locate(arr, expId);
        if (!loc || loc.idx < 0 || !loc.cur) {
            return { ok: false, why: ER_REASONS.NOT_FOUND, exp: null, list: arr };
        }
        const keep = strList(keepRefIds, EXP_LIMITS.refsPerPhase * 5);
        if (!keep.length) return { ok: false, why: ER_REASONS.BAD_SHAPE, exp: loc.cur, list: arr };
        const kept = [], moved = [];
        for (const r of loc.cur.refs) {
            if (keep.indexOf(r.refId) >= 0) kept.push(r);
            else moved.push(r);
        }
        if (!moved.length) return { ok: false, why: ER_REASONS.BAD_SHAPE, exp: loc.cur, list: arr };
        const newExp = normalizeExperience({
            id: nextId(now),
            title: capStr(loc.cur.title + '（拆出）', EXP_LIMITS.title),
            participants: loc.cur.participants,
            place: loc.cur.place,
            contract: loc.cur.contract,
            refs: moved,
            state: EXP_STATES.CANDIDATE,
            openedAt: numOrNull(now),
            mergedFrom: [loc.cur.id],
        });
        const updated = Object.assign({}, loc.raw, {
            refs: kept,
            state: EXP_STATES.SPLIT,
            splitInto: strList(loc.cur.splitInto.concat([newExp.id]), 8),
        });
        const next = arr.slice();
        next[loc.idx] = updated;
        return { ok: true, why: ER_REASONS.OK, exp: newExp, list: next.concat([newExp]) };
    }

    /* ---------- 重建层（完整性按**现存引用**重算，绝不缓存上次结论） ---------- */
    /** 某段面四态：present / absent / unreadable / retracted，绝不压平。 */
    function phaseState(exp, phase) {
        const e = normalizeExperience(exp);
        if (!e) return PHASE_STATES.ABSENT;
        const all = e.refs.filter(function (r) { return r.phase === phase; });
        if (!all.length) return PHASE_STATES.ABSENT;
        const live = all.filter(function (r) { return r.retracted !== true; });
        if (!live.length) return PHASE_STATES.RETRACTED;
        const readable = live.filter(function (r) { return r.readable !== false; });
        if (!readable.length) return PHASE_STATES.UNREADABLE;
        return PHASE_STATES.PRESENT;
    }
    /**
     * 重建一个经历单元：逐段状态 + 缺口 + 逐段出处。
     * ★ 「已完成」只在 result 段 present 且**未被撤源**时成立 ——
     *   这正是验收③：删除结果来源后，保留起因而不再断言事情已完成。
     */
    function rebuildOf(list, expId) {
        const e = normalizeExperience(findExperience(list, expId) || null);
        if (!e) return { ok: false, why: ER_REASONS.NOT_FOUND, shape: null, phases: [], gaps: [] };
        const order = [EXP_PHASES.CAUSE, EXP_PHASES.ACTION, EXP_PHASES.TURN, EXP_PHASES.RESULT, EXP_PHASES.PENDING];
        const phases = [];
        const gaps = [];
        for (const phase of order) {
            const st = phaseState(e, phase);
            const refs = e.refs.filter(function (r) { return r.phase === phase; });
            phases.push({
                phase: phase,
                state: st,
                refs: refs.map(function (r) {
                    return {
                        source: r.source, refId: r.refId, floor: r.floor,
                        quote: r.quote, retracted: r.retracted === true,
                    };
                }),
            });
            /* ★ turn 与 pending 缺了不算缺口：不是每件事都有转折，也不是每件事都未完。 */
            if (st !== PHASE_STATES.PRESENT && phase !== EXP_PHASES.TURN && phase !== EXP_PHASES.PENDING) {
                gaps.push(phase + ':' + st);
            }
        }
        const hasCause = phaseState(e, EXP_PHASES.CAUSE) === PHASE_STATES.PRESENT;
        const hasAction = phaseState(e, EXP_PHASES.ACTION) === PHASE_STATES.PRESENT;
        const resultState = phaseState(e, EXP_PHASES.RESULT);
        const pendingState = phaseState(e, EXP_PHASES.PENDING);
        let shape = EXP_SHAPES.DANGLING;
        if (resultState === PHASE_STATES.RETRACTED) shape = EXP_SHAPES.RETRACTED;
        else if (resultState === PHASE_STATES.PRESENT && pendingState !== PHASE_STATES.PRESENT) shape = EXP_SHAPES.COMPLETE;
        else if (hasAction || pendingState === PHASE_STATES.PRESENT) shape = EXP_SHAPES.OPEN;
        else if (!hasCause) shape = EXP_SHAPES.DANGLING;
        return {
            ok: true,
            why: ER_REASONS.OK,
            shape: shape,
            /** ★ 断言纪律：只有 shape=complete 才允许说「已完成」。 */
            completed: shape === EXP_SHAPES.COMPLETE,
            phases: phases,
            gaps: gaps,
            exp: e,
        };
    }
    /** 未完后续：pending 或 result 段还活着的引用（这就是「尚未结束的部分」）。 */
    function unresolvedOf(list, expId) {
        const r = rebuildOf(list, expId);
        if (!r.ok) return [];
        const out = [];
        for (const seg of r.phases) {
            if (seg.phase !== EXP_PHASES.PENDING && seg.phase !== EXP_PHASES.RESULT) continue;
            for (const ref of seg.refs) {
                if (ref.retracted) continue;
                out.push(Object.assign({ phase: seg.phase }, ref));
            }
        }
        return out;
    }
    /**
     * 先定位经历，再按问题展开（计划原文的检索顺序）。
     * ★ 打分只用**可解释的**信号：标题命中 / 参与者命中 / 楼层落在范围内。
     *   不承诺单靠关键词理解全部经历（同款声明写在档头）。
     */
    function locateExperiences(list, query) {
        const q = (query && typeof query === 'object') ? query : {};
        const text = str(q.text);
        const who = strList(q.participants, EXP_LIMITS.participants);
        const floor = numOrNull(q.floor);
        const hits = [];
        for (const e of normalizeExperiences(list)) {
            const why = [];
            let score = 0;
            if (text && e.title && (e.title.indexOf(text) >= 0 || text.indexOf(e.title) >= 0)) {
                score += 3; why.push('title');
            }
            const ov = overlapCount(who, e.participants);
            if (ov > 0) { score += 2 * ov; why.push('participants'); }
            if (floor != null) {
                const rr = floorRangeOf(e);
                if (rr.lo != null && floor >= rr.lo && floor <= rr.hi) { score += 1; why.push('floor-in-range'); }
            }
            if (score > 0) hits.push({ exp: e, score: score, why: why });
        }
        hits.sort(function (a, b) { return b.score - a.score; });
        return hits;
    }
    /**
     * 展开一个经历（供续写材料用）：逐段给引用 + 缺口 + 未完后续。
     * ★ 只给引用与短引文，不给正文：正文由调用方按 source+refId 回原 owner 取。
     */
    function expandExperience(list, expId) {
        const r = rebuildOf(list, expId);
        if (!r.ok) return { ok: false, why: r.why, phases: [], gaps: [], pending: [] };
        return {
            ok: true,
            why: ER_REASONS.OK,
            title: r.exp.title,
            shape: r.shape,
            completed: r.completed,
            phases: r.phases,
            gaps: r.gaps,
            pending: unresolvedOf(list, expId),
        };
    }
    /** 一行读数（诊断面）：必须报出候选/确认/缺口数与「已完成」的严格口径。 */
    function experienceLine(rawList) {
        try {
            const list = normalizeExperiences(rawList);
            if (!list.length) return '暂无经历单元';
            let cand = 0, conf = 0, split = 0, complete = 0, open = 0, dangling = 0, retracted = 0, gaps = 0;
            for (const e of list) {
                if (e.state === EXP_STATES.CANDIDATE) cand++;
                else if (e.state === EXP_STATES.CONFIRMED) conf++;
                else split++;
                const r = rebuildOf([e], e.id);
                if (r.shape === EXP_SHAPES.COMPLETE) complete++;
                else if (r.shape === EXP_SHAPES.OPEN) open++;
                else if (r.shape === EXP_SHAPES.RETRACTED) retracted++;
                else dangling++;
                gaps += r.gaps.length;
            }
            const parts = ['经历 ' + list.length, '候选 ' + cand, '确认 ' + conf];
            if (split) parts.push('已拆 ' + split);
            parts.push('完整 ' + complete, '未完 ' + open);
            if (dangling) parts.push('仅零散 ' + dangling);
            if (retracted) parts.push('已撤源 ' + retracted);
            if (gaps) parts.push('缺口 ' + gaps);
            return parts.join(' · ');
        } catch (e) { return '—（经历账异常）'; }
    }
    /** 自检（供宿主诊断面与判据调用；返回结构恒定）。 */
    function selfCheck() {
        const problems = [];
        const probe = openExperience([], '自检', { participants: ['甲'] }, 1);
        if (!probe.ok) problems.push('开经历单元失败');
        let list = probe.list;
        const id = probe.exp.id;
        const a = addRef(list, id, { source: 'summary', refId: 's1', phase: 'cause', floor: 10 }, 1);
        if (!a.ok) problems.push('挂来源引用失败');
        list = a.list;
        if (!findExperience(list, id)) problems.push('按 id 找不到单元');
        const b = addRef(list, id, { source: 'summary', refId: 's2', phase: 'result', floor: 20 }, 1);
        list = b.list;
        if (rebuildOf(list, id).shape !== EXP_SHAPES.COMPLETE) problems.push('起因+结果齐备应判 complete');
        const c = retractRef(list, id, 's2', 'summary');
        if (!c.ok) problems.push('撤源失败');
        if (rebuildOf(c.list, id).completed) problems.push('撤掉结果来源后不许仍判已完成');
        if (phaseState(c.list[0], 'cause') !== PHASE_STATES.PRESENT) problems.push('撤结果来源不得牵连起因');
        if (normalizeRef({ source: 'nope', refId: 'x', phase: 'cause' }).readable !== false) {
            problems.push('不认识的 source 必须判 readable:false');
        }
        if (normalizeRef({ source: 'summary', phase: 'cause' }).readable !== false) {
            problems.push('没有 refId 的引用必须判 readable:false');
        }
        /* ★ 弱信号单独不许出候选 */
        const w1 = normalizeExperience({ id: 'w1', title: 'A', refs: [{ source: 'summary', refId: 'x', phase: 'cause', floor: 10 }] });
        const w2 = normalizeExperience({ id: 'w2', title: 'B', refs: [{ source: 'summary', refId: 'y', phase: 'cause', floor: 11 }] });
        if (mergeCandidates([w1, w2]).length !== 0) problems.push('楼层接近单独不许出合并候选');
        return { ok: problems.length === 0, version: ER_VERSION, problems: problems };
    }

    const api = Object.freeze({
        normalizeRef, normalizeExperience, normalizeExperiences,
        findExperience, indexOfExperience, locate,
        openExperience, addRef, retractRef, confirmExperience,
        mergeSignals, mergeCandidates, applyMerge, splitExperience,
        phaseState, rebuildOf, unresolvedOf, locateExperiences, expandExperience,
        experienceLine, selfCheck,
        EXP_PHASES, EXP_SOURCES, EXP_STATES, PHASE_STATES, EXP_SHAPES, ER_REASONS, EXP_LIMITS,
        ER_VERSION, ER_KIND,
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaExperienceRebuild = api; } catch (_e) { /* ignore */ }
    }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null));