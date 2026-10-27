/* ============================================================
 * strength-policy.js — 记忆强度治理·策略面（纯函数内核）[v3.421.0 · 缝合 E1]
 * ------------------------------------------------------------
 * 【来源与许可】
 *   机制缝合自 ceniran/moraine-home 的 `src/moraine/governance.py`
 *   （PolyForm Noncommercial 1.0.0 ⇒ **搬算法不搬代码**，本文件按宿主纯函数/双导出约定重写，
 *     非逐字翻译：Python 的 dataclass/Mapping 协议换成 Object.freeze 与普通对象，
 *     sha256 换成纯 JS 的 FNV-1a 64 位（浏览器无同步 crypto），0-100 强度与宿主 1-5 重要度分开记账）。
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   本仓 `importance` 是**一个裸数字**，全库有四处各自解释它：
 *     · index.js:1848 召回打分读 `m.importance ?? (m._isCore ? 1 : 0.5)`（0-1 语义）
 *     · index.js:1869 缺省填 `3`（1-5 语义）
 *     · index.js:5069 睡眠豁免 `s.importance >= 8`（0-10 语义）
 *     · memory-gc.js:115 淘汰打分 `(v.importance || 5) / 10`
 *   于是「3」到底是「中等」还是「很低」取决于读者读的是哪一行；更要命的是**没人能改得安全**：
 *   手工把一条记忆调到高价值，下一轮 `optimizeMemory` 照样按同一公式把它排到删除端，
 *   因为「人定过」这件事没有被记下来。
 *
 * 【本模块只做一件半事】
 *   ① `suggestStrength()` —— **只看元数据、不读正文**，给出带理由链的建议强度与五档 band；
 *   ② `manualStrengthChange()` / `unlockStrength()` —— 人工改值/解锁，**必须**带 actor+reason，
 *      全程写审计（只留尾部 50 条），并把 `strength_locked` 落成显式标记。
 *   它**不**持久化、**不**改入参（纯函数：返回新 record 交给调用方决定要不要写回），
 *   也**不**产出提案 —— 提案是有状态的生命周期，在 `strength-proposal.js`。
 *
 * 【三条口径纪律（均为本仓既有教训的同族）】
 *   ① **自动建议有天花板**（`automatic_ceiling = 79`）：79 及以下属「机器说了算」，
 *      80+ 属 core 档，只能由人给钥匙 —— 自动建议不得自己爬进 core 把人挤出去。
 *   ② **锁定 = 不再建议**：`strength_locked === true` 时建议值恒等于当前值、`difference` 如实 0、
 *      `requires_review` false —— 「锁了还在给建议」会让面板看起来可以一键覆盖，是谎。
 *   ③ **锁定只许在 core 档**（selected >= 80）：允许把一条 transient 锁死，等于让人一锤子
 *      把浮动条目焊在地上，日后衰减曲线全部失效。抛错而不是静默降档。
 *
 * 零依赖、CJS/IIFE 双导出（与全仓缝合模块同形）。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaStrengthPolicy = factory();
        root.StrengthPolicy = root.LonShaStrengthPolicy;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    /**
     * 记忆种类 → 基准强度。来源是 moraine 的 DEFAULT_BASE_STRENGTH 原表，
     * 按宿主既有事实/关系/物品分类补齐到本仓语汇（`unknown` 一律 30，不许缺席：
     * 缺席会让 `base_strength[kind]` 读出 undefined 再把整条建议算成 NaN）。
     */
    const DEFAULT_BASE_STRENGTH = Object.freeze({
        context: 15,      // 场景上下文：最容易过期
        status: 20,       // 角色当下的身体/情绪状态
        event: 30,        // 单次事件
        reflection: 35,   // 反思、心迹
        project: 40,      // 进行中的事
        preference: 45,   // 口味、偏好
        decision: 50,     // 明确决定
        relationship: 50, // 关系事实
        identity: 70,     // 身份、本质设定
        unknown: 30
    });
    /** 五档 band。闭区间，覆盖 0-100 全域（不得留缝：留缝会让某个强度落不进任何一档）。 */
    const BANDS = Object.freeze([
        Object.freeze([0, 19, 'transient']),
        Object.freeze([20, 39, 'ordinary']),
        Object.freeze([40, 59, 'stable']),
        Object.freeze([60, 79, 'important']),
        Object.freeze([80, 100, 'core'])
    ]);
    /** 宿主 `importance` 的通用尺度（1-5，与 index.js:1869 的缺省 3 同源）。 */
    const HOST_IMPORTANCE_SCALE = 5;
    /** 人工锁定只许在这档及以上（= core 下沿）。 */
    const LOCK_FLOOR = 80;
    /** 审计环容量：只留尾部这么多条（再多的历史进 opLog，不进条目本体）。 */
    const AUDIT_KEEP = 50;
    /**
     * 默认策略。调用方可以整份替换，但**必须**过 `normalizePolicy` —— 直接吃用户对象会让
     * 缺键、字符串数字、越界值漏进算分。
     */
    function defaultPolicy() {
        return {
            base_strength: Object.assign({}, DEFAULT_BASE_STRENGTH),
            protected_bonus: 15,
            confirmation_step: 2,
            confirmation_cap: 10,
            explicit_priority_weight: 0.25,
            explicit_identity_weight: 0.25,
            automatic_ceiling: 79
        };
    }
    /** 强度夹取：非有限数一律 0（不抛：算分路径上抛错会整条建议消失）。 */
    function clampStrength(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return 0;
        return Math.max(0, Math.min(100, Math.round(n)));
    }
    /**
     * 宿主 importance → 0-100 强度。
     * 「没给」与「给了 0」不同形：`null/undefined` 返回 null（调用方据此区分「无当前值」），
     * 而 0 是合法强度。`Number(null) === 0` 的老坑在此不适用，因为先判了 null。
     */
    function strengthFromImportance(value, scale) {
        if (value === null || value === undefined || value === '') return null;
        const n = Number(value);
        if (!Number.isFinite(n)) return null;
        const sc = (Number.isFinite(Number(scale)) && Number(scale) > 0) ? Number(scale) : HOST_IMPORTANCE_SCALE;
        return clampStrength((n / sc) * 100);
    }
    /** 0-100 强度 → 宿主 importance（默认 1-5 尺度，保留两位小数）。 */
    function importanceFromStrength(value, scale) {
        const sc = (Number.isFinite(Number(scale)) && Number(scale) > 0) ? Number(scale) : HOST_IMPORTANCE_SCALE;
        const v = Number((clampStrength(value) / 100) * sc);
        return Number(v.toFixed(2));
    }
    /** 强度 → band 名。全域覆盖，故 `next()` 永不失手；仍留 fallback 防 BANDS 被人改出缝。 */
    function bandFor(value) {
        const s = clampStrength(value);
        for (let i = 0; i < BANDS.length; i++) {
            if (s >= BANDS[i][0] && s <= BANDS[i][1]) return BANDS[i][2];
        }
        return 'transient';
    }
    /** 策略规整：逐键夹取/兜底，`base_strength.unknown` 强制在场。 */
    function normalizePolicy(raw) {
        const d = defaultPolicy();
        const p = (raw && typeof raw === 'object') ? raw : {};
        const out = defaultPolicy();
        const src = (p.base_strength && typeof p.base_strength === 'object') ? p.base_strength : null;
        if (src) {
            const map = {};
            for (const k of Object.keys(src)) map[String(k)] = clampStrength(src[k]);
            if (!('unknown' in map)) map.unknown = d.base_strength.unknown;
            out.base_strength = map;
        }
        const num = (v, fb) => (Number.isFinite(Number(v)) ? Number(v) : fb);
        out.protected_bonus = Math.max(0, Math.round(num(p.protected_bonus, d.protected_bonus)));
        out.confirmation_step = Math.max(0, Math.round(num(p.confirmation_step, d.confirmation_step)));
        out.confirmation_cap = Math.max(0, Math.round(num(p.confirmation_cap, d.confirmation_cap)));
        out.explicit_priority_weight = Math.max(0, Math.min(1, num(p.explicit_priority_weight, d.explicit_priority_weight)));
        out.explicit_identity_weight = Math.max(0, Math.min(1, num(p.explicit_identity_weight, d.explicit_identity_weight)));
        out.automatic_ceiling = clampStrength(num(p.automatic_ceiling, d.automatic_ceiling));
        return out;
    }
    /** 治理子对象取只读视图（非对象一律空对象，绝不返回 null 让调用方再判）。 */
    function governanceOf(memory) {
        const g = (memory && typeof memory === 'object') ? memory.governance : null;
        return (g && typeof g === 'object' && !Array.isArray(g)) ? g : {};
    }
    /**
     * 由**元数据**建议强度。正文不读、不回传。
     *
     * @param {object} memory 记忆条目（读 kind / importance / protected / 治理标记 / priority / identity_weight）
     * @param {object} [policy] 策略覆盖，走 normalizePolicy
     * @returns {object} 建议包（含 reasons 理由链；`difference` 在无当前值时为 null）
     */
    function suggestStrength(memory, policy) {
        const p = normalizePolicy(policy);
        const m = (memory && typeof memory === 'object') ? memory : {};
        const gov = governanceOf(m);
        const id = String(m.id || '');
        const kind = String(m.kind || 'unknown');
        const current = strengthFromImportance(m.importance, m.importance_scale);
        /* 口径②：锁定即不再建议。 */
        if (gov.strength_locked === true) {
            return {
                id: id, kind: kind, current_strength: current, suggested_strength: current,
                difference: 0, band: bandFor(current === null ? 0 : current), protected: true,
                reasons: [{ signal: 'manual_lock', points: 0 }],
                requires_review: false, method: 'metadata_strength_v1'
            };
        }
        const base = (kind in p.base_strength) ? p.base_strength[kind] : p.base_strength.unknown;
        let score = base;
        const reasons = [{ signal: 'kind_default', kind: kind, points: base }];
        /* 保护标记三处来源任一为真即算（显式 / 衰减策略 / 生命周期），与源实现同口径。 */
        const decay = (m.memory_decay && typeof m.memory_decay === 'object') ? m.memory_decay : {};
        const life = (m.memory_lifecycle && typeof m.memory_lifecycle === 'object') ? m.memory_lifecycle : {};
        const prot = (m.protected === true || decay.policy === 'protected' || life.protected === true);
        if (prot) {
            score += p.protected_bonus;
            reasons.push({ signal: 'explicit_protection', points: p.protected_bonus });
        }
        /* 确认次数走 log2 衰减加成：第 1 次确认最值钱，第 20 次几乎不值钱（防刷）。 */
        const confirmations = Math.max(0, Math.round(Number(decay.confirmation_count) || 0));
        const cPoints = Math.min(p.confirmation_cap, Math.round(Math.log2(confirmations + 1) * p.confirmation_step));
        if (cPoints) {
            score += cPoints;
            reasons.push({ signal: 'confirmed_use', count: confirmations, points: cPoints });
        }
        /* 显式 0-1 权重按「离基准多远」加权靠近，不直接当绝对值用。 */
        const weighted = [['priority', p.explicit_priority_weight], ['identity_weight', p.explicit_identity_weight]];
        for (let i = 0; i < weighted.length; i++) {
            const field = weighted[i][0], weight = weighted[i][1];
            if (m[field] === null || m[field] === undefined) continue;
            const nv = Number(m[field]);
            if (!Number.isFinite(nv)) continue;
            const norm = Math.max(0, Math.min(1, nv));
            const pts = Math.round((norm * 100 - base) * weight);
            score += pts;
            reasons.push({ signal: field, value: norm, points: pts });
        }
        /* 口径①：天花板。机器不得自己爬进 core。 */
        const suggested = Math.min(p.automatic_ceiling, clampStrength(score));
        return {
            id: id, kind: kind, current_strength: current, suggested_strength: suggested,
            difference: current === null ? null : suggested - current,
            band: bandFor(suggested), protected: prot, reasons: reasons,
            requires_review: prot || kind === 'identity' || kind === 'relationship',
            method: 'metadata_strength_v1'
        };
    }
    /** actor/reason/now 三件套的公共校验（缺一律抛，不静默用空串顶）。 */
    function requireActorReason(actor, reason, now) {
        const a = String(actor == null ? '' : actor).trim();
        const r = String(reason == null ? '' : reason).trim();
        const n = String(now == null ? '' : now).trim();
        if (!a || !r || !n) throw new ValueError('actor, reason and now are required');
        return { actor: a, reason: r, now: n };
    }
    /** 轻量错误类型：带 code 便于调用方分诊，message 与源实现同字面。 */
    function ValueError(message) {
        const e = new Error(message);
        e.name = 'ValueError';
        e.code = 'POLICY';
        return e;
    }
    /**
     * 人工改值（可选同时上锁）。不持久化、不改入参。
     *
     * @returns {{record: object, persisted: boolean, requires_review: boolean}}
     */
    function manualStrengthChange(memory, strength, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const { actor, reason, now } = requireActorReason(o.actor, o.reason, o.now);
        const m = (memory && typeof memory === 'object') ? memory : {};
        const gov = governanceOf(m);
        if (gov.strength_locked === true) throw new ValueError('strength is locked; unlock it before changing');
        const selected = clampStrength(strength);
        /* 口径③：只许锁 core。 */
        if (o.lock === true && selected < LOCK_FLOOR) {
            throw new ValueError('only manually assigned core strength (' + LOCK_FLOOR + '..100) may be locked');
        }
        const audit = Array.isArray(gov.audit) ? gov.audit.slice() : [];
        audit.push({
            action: o.lock === true ? 'manual_strength_locked' : 'manual_strength_changed',
            actor: actor, at: now, reason: reason,
            from: strengthFromImportance(m.importance, m.importance_scale), to: selected
        });
        const record = Object.assign({}, m);
        record.importance = importanceFromStrength(selected, m.importance_scale);
        record.governance = Object.assign({}, gov, {
            strength_locked: o.lock === true,
            locked_by: o.lock === true ? actor : null,
            locked_at: o.lock === true ? now : null,
            lock_reason: o.lock === true ? reason : null,
            audit: audit.slice(-AUDIT_KEEP)
        });
        return { record: record, persisted: false, requires_review: true };
    }
    /** 解锁。未锁时抛（与「锁着还改」区分：解锁是幂等错觉的重灾区，这里要求真实前置状态）。 */
    function unlockStrength(memory, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const { actor, reason, now } = requireActorReason(o.actor, o.reason, o.now);
        const m = (memory && typeof memory === 'object') ? memory : {};
        const gov = governanceOf(m);
        if (gov.strength_locked !== true) throw new ValueError('strength is not locked');
        const audit = Array.isArray(gov.audit) ? gov.audit.slice() : [];
        audit.push({
            action: 'manual_strength_unlocked', actor: actor, at: now, reason: reason,
            strength: strengthFromImportance(m.importance, m.importance_scale)
        });
        const record = Object.assign({}, m);
        record.governance = Object.assign({}, gov, {
            strength_locked: false,
            unlocked_by: actor, unlocked_at: now, unlock_reason: reason,
            audit: audit.slice(-AUDIT_KEEP)
        });
        return { record: record, persisted: false, requires_review: true };
    }
    /**
     * 只读批量推演：给面板「一键重估会变成什么样」用。不落盘、不改条目。
     * 分布用 band 直方图，**当前分布只统计有当前值的条目**（无值不硬塞进 transient，
     * 否则「从没标过重要度」会被读成「全是 transient」）。
     */
    function simulateStrengths(memories, policy) {
        const list = Array.isArray(memories) ? memories : [];
        const p = normalizePolicy(policy);
        const cur = {}, sug = {};
        for (let i = 0; i < BANDS.length; i++) { cur[BANDS[i][2]] = 0; sug[BANDS[i][2]] = 0; }
        const suggestions = [];
        for (let i = 0; i < list.length; i++) {
            const s = suggestStrength(list[i], p);
            suggestions.push(s);
            if (s.current_strength !== null) cur[bandFor(s.current_strength)] += 1;
            sug[s.band] += 1;
        }
        return {
            mode: 'read_only_simulation', method: 'metadata_strength_v1', count: suggestions.length,
            current_distribution: cur, suggested_distribution: sug, suggestions: suggestions
        };
    }
    /**
     * 自证：策略面的三条口径（天花板 < core 下沿 / 锁定下沿 = core 下沿 / band 全域覆盖）不被改坏。
     * `bandFor` 必须对 0..100 **每一个整数**都给得出档名 —— 留一个缝就等于某些强度没有档。
     */
    function selfCheck() {
        const problems = [];
        const p = defaultPolicy();
        if (!(p.automatic_ceiling < LOCK_FLOOR)) problems.push('自动天花板未低于锁定下沿（机器能爬进 core）');
        if (p.automatic_ceiling > 100) problems.push('自动天花板越界');
        for (let i = 0; i <= 100; i++) {
            if (BANDS.every((b) => i < b[0] || i > b[1])) { problems.push('band 在 ' + i + ' 处留缝'); break; }
        }
        if (BANDS[BANDS.length - 1][2] !== 'core' || BANDS[BANDS.length - 1][0] !== LOCK_FLOOR) {
            problems.push('core 档下沿与 LOCK_FLOOR 不一致');
        }
        if (strengthFromImportance(null) !== null) problems.push('null 被读成数值');
        if (AUDIT_KEEP < 1) problems.push('AUDIT_KEEP 非正');
        return { ok: problems.length === 0, problems: problems };
    }
    return {
        DEFAULT_BASE_STRENGTH: DEFAULT_BASE_STRENGTH,
        BANDS: BANDS,
        HOST_IMPORTANCE_SCALE: HOST_IMPORTANCE_SCALE,
        LOCK_FLOOR: LOCK_FLOOR,
        AUDIT_KEEP: AUDIT_KEEP,
        defaultPolicy: defaultPolicy,
        normalizePolicy: normalizePolicy,
        clampStrength: clampStrength,
        strengthFromImportance: strengthFromImportance,
        importanceFromStrength: importanceFromStrength,
        bandFor: bandFor,
        governanceOf: governanceOf,
        suggestStrength: suggestStrength,
        manualStrengthChange: manualStrengthChange,
        unlockStrength: unlockStrength,
        simulateStrengths: simulateStrengths,
        selfCheck: selfCheck
    };
}));
