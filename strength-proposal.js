/* ============================================================
 * strength-proposal.js — 记忆强度治理·双钥匙提案面（纯函数内核）[v3.421.0 · 缝合 E2]
 * ------------------------------------------------------------
 * 【来源与许可】
 *   机制缝合自 ceniran/moraine-home `src/moraine/governance.py` 的
 *   `create_strength_proposal` / `review_strength_proposal` / `apply_strength_proposal` /
 *   `rollback_strength_change`（PolyForm Noncommercial 1.0.0 ⇒ 搬算法不搬代码，
 *     按宿主纯函数/双导出约定重写；sha256 前 16 位换成 FNV-1a 64 位 hex，用途同为
 *     「同输入同 id、不同输入不同 id」的稳定指纹，非加密用途）。
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   策略面（`strength-policy.js`）解决了「建议怎么算」，但没解决**谁说了算**。
 *   本仓的自动化路径全是单方写入：提取器算出 `importance` 就直接落库，
 *   没有任何一处要求「高风险变更必须第二个人点头」。实测后果是长线跑团里最贵的那类：
 *   一条 `identity`（角色身份本质）被某轮提取改掉之后，没有任何记录说明是谁改的、
 *   依据是什么、原来是多少 —— 想退回去只能靠用户自己回忆。
 *   本仓最像的反例是 `memory-supersede.js`：它有确认流、有证据链，但**同一个执行者能自己批自己**。
 *
 * 【双钥匙的判据（照搬源实现，不自行放宽）】
 *   高风险 = 任一成立：① 要上锁；② 目标强度落在 core（>= 80）；③ 与当前值差 >= 20。
 *   高风险 ⇒ `requires_second_key = true` + `status = 'pending_review'`，必须由**另一角色**
 *   会签；低风险 ⇒ `status = 'ready'`，提案者自己的签名足够。
 *   角色只有两个：`machine`（提取器/自动路径）与 `human`（用户）。**同角色不得会签自己**
 *   （抛 "the proposer cannot provide the second key"）—— 这是本模块存在的全部意义，
 *   放宽成「同一 id 也不行」会把「同一台机器换了个名字」放过去。
 *
 * 【四道闸（每道都单独可判、单独报错）】
 *   G1 目标一致性：`memory.id !== proposal.memory_id` ⇒ 拒绝（防把提案套到别的条目）。
 *   G2 版本乐观锁：`current_version !== proposal.expected_version` ⇒ 拒绝并要求重新评审
 *      —— 提案期间条目被别人改过，原判断依据已失效，静默覆盖是谎。
 *   G3 状态：非 `ready` 一律拒绝（`pending_review` / `returned` 都不许直接应用）。
 *   G4 钥匙成对：`requires_second_key` 时两侧签名都必须是 `approve`。
 *
 * 【回滚】
 *   `applyStrengthProposal` 在返回值里带**完整入参快照** `rollback_record`（`dict(memory)` 同义），
 *   `rollbackStrengthChange` 只认这份快照。刻意不做「反算」：从 to 反推 from 会丢掉同时被改的
 *   其它治理字段，而这里要的是**逐字还原**。
 *
 * 零依赖、纯函数（不持久化、不改入参）、CJS/IIFE 双导出。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaStrengthProposal = factory();
        root.StrengthProposal = root.LonShaStrengthProposal;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    /** 两个角色。顺序固定：签名集与哈希种子都按此序拼，避免顺序抖动改 id。 */
    const ROLES = Object.freeze(['machine', 'human']);
    const DECISIONS = Object.freeze(['approve', 'return']);
    /** 高风险判据里的差值门槛与 core 下沿（与策略面的 LOCK_FLOOR 同值，此处不跨文件引依赖）。 */
    const HIGH_DELTA = 20;
    const CORE_FLOOR = 80;
    const AUDIT_KEEP = 50;
    function ValueError(message) {
        const e = new Error(message);
        e.name = 'ValueError';
        e.code = 'PROPOSAL';
        return e;
    }
    /**
     * FNV-1a 64 位十六进制（16 位定长）。
     * 用途是**稳定指纹**不是加密：同输入必同输出、改一个字必变。
     * 用 BigInt 走真 64 位，避免 32 位版本在长种子上大面积碰撞（条目 id 常带 UUID，种子很长）。
     */
    function fnv64hex(str) {
        const s = String(str == null ? '' : str);
        let h = 0xcbf29ce484222325n;
        const prime = 0x100000001b3n;
        const mask = 0xffffffffffffffffn;
        for (let i = 0; i < s.length; i++) {
            h ^= BigInt(s.charCodeAt(i) & 0xff);
            h = (h * prime) & mask;
        }
        return h.toString(16).padStart(16, '0');
    }
    function clampStrength(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return 0;
        return Math.max(0, Math.min(100, Math.round(n)));
    }
    function strengthFromImportance(value, scale) {
        if (value === null || value === undefined || value === '') return null;
        const n = Number(value);
        if (!Number.isFinite(n)) return null;
        const sc = (Number.isFinite(Number(scale)) && Number(scale) > 0) ? Number(scale) : 5;
        return clampStrength((n / sc) * 100);
    }
    function importanceFromStrength(value, scale) {
        const sc = (Number.isFinite(Number(scale)) && Number(scale) > 0) ? Number(scale) : 5;
        return Number(((clampStrength(value) / 100) * sc).toFixed(2));
    }
    function governanceOf(memory) {
        const g = (memory && typeof memory === 'object') ? memory.governance : null;
        return (g && typeof g === 'object' && !Array.isArray(g)) ? g : {};
    }
    /** 三件套校验（同字号与策略面，但各自独立：两模块不互为依赖）。 */
    function requireFields(actor, role, reason, now, expectedVersion) {
        const a = String(actor == null ? '' : actor).trim();
        const r = String(role == null ? '' : role).trim();
        const why = String(reason == null ? '' : reason).trim();
        const n = String(now == null ? '' : now).trim();
        const v = String(expectedVersion == null ? '' : expectedVersion).trim();
        if (!a || ROLES.indexOf(r) < 0 || !why || !n || !v) {
            throw new ValueError('actor, valid actor_role, reason, now and expected_version are required');
        }
        return { actor: a, role: r, reason: why, now: n, version: v };
    }
    /**
     * 建提案。不改入参、不落库。
     *
     * @param {object} memory 目标条目
     * @param {number} strength 目标强度（0-100）
     * @param {{lock?: boolean, actor: string, actor_role: 'machine'|'human', reason: string,
     *          now: string, expected_version: string}} opts
     * @returns {object} 提案（含 proposal_id / high_impact / requires_second_key / signatures / status）
     */
    function createStrengthProposal(memory, strength, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const f = requireFields(o.actor, o.actor_role, o.reason, o.now, o.expected_version);
        const m = (memory && typeof memory === 'object') ? memory : {};
        const lock = o.lock === true;
        const selected = clampStrength(strength);
        if (lock && selected < CORE_FLOOR) {
            throw new ValueError('only core strength (' + CORE_FLOOR + '..100) may be locked');
        }
        const current = strengthFromImportance(m.importance, m.importance_scale);
        const diff = current === null ? null : selected - current;
        /* 高风险三判据：上锁 / 进 core / 变动幅度 >= 20。任一成立就必须过第二把钥匙。 */
        const highImpact = (lock === true || selected >= CORE_FLOOR || (diff !== null && Math.abs(diff) >= HIGH_DELTA));
        const seed = [
            String(m.id || ''), f.actor, f.now, f.version,
            String(current), String(selected), String(lock)
        ].join('|');
        const signatures = {};
        signatures[f.role] = { actor: f.actor, decision: 'approve', at: f.now };
        return {
            proposal_id: 'strength_' + fnv64hex(seed),
            memory_id: String(m.id || ''),
            expected_version: f.version,
            from_strength: current,
            to_strength: selected,
            lock: lock,
            reason: f.reason,
            proposed_by: { id: f.actor, role: f.role, at: f.now },
            high_impact: highImpact,
            requires_second_key: highImpact,
            signatures: signatures,
            /* 高风险一律 pending_review；低风险直通 ready（提案者自己的那把钥匙已经在 signatures 里）。 */
            status: highImpact ? 'pending_review' : 'ready',
            persisted: false
        };
    }
    /**
     * 会签。**提案者角色不得自我会签**。
     *
     * @returns {object} 新提案（不改入参）
     */
    function reviewStrengthProposal(proposal, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const actor = String(o.actor == null ? '' : o.actor).trim();
        const role = String(o.actor_role == null ? '' : o.actor_role).trim();
        const decision = String(o.decision == null ? '' : o.decision).trim();
        const now = String(o.now == null ? '' : o.now).trim();
        if (ROLES.indexOf(role) < 0 || DECISIONS.indexOf(decision) < 0 || !actor || !now) {
            throw new ValueError('valid reviewer, decision and now are required');
        }
        const p = (proposal && typeof proposal === 'object') ? proposal : {};
        const by = (p.proposed_by && typeof p.proposed_by === 'object') ? p.proposed_by : {};
        if (by.role === role) throw new ValueError('the proposer cannot provide the second key');
        const reviewed = Object.assign({}, p);
        const signatures = Object.assign({}, (p.signatures && typeof p.signatures === 'object') ? p.signatures : {});
        signatures[role] = { actor: actor, decision: decision, at: now };
        reviewed.signatures = signatures;
        reviewed.status = decision === 'return' ? 'returned' : 'ready';
        reviewed.persisted = false;
        return reviewed;
    }
    /**
     * 应用。四道闸全过才返回新 record。
     * 返回 `rollback_record` 是**入参快照**（逐字还原用），调用方须一并留存。
     *
     * @returns {{record: object, rollback_record: object, proposal_id: string,
     *            persisted: boolean, rollback_available: boolean}}
     */
    function applyStrengthProposal(memory, proposal, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const m = (memory && typeof memory === 'object') ? memory : {};
        const p = (proposal && typeof proposal === 'object') ? proposal : {};
        const now = String(o.now == null ? '' : o.now).trim();
        if (!now) throw new ValueError('now is required');
        /* G1 目标一致 */
        if (String(m.id || '') !== String(p.memory_id || '')) {
            throw new ValueError('proposal targets a different memory');
        }
        /* G2 版本乐观锁 */
        if (String(o.current_version == null ? '' : o.current_version).trim() !== String(p.expected_version == null ? '' : p.expected_version).trim()) {
            throw new ValueError('memory version changed; proposal must be reviewed again');
        }
        /* G3 状态 */
        if (p.status !== 'ready') throw new ValueError('proposal is not ready');
        /* G4 钥匙成对 */
        if (p.requires_second_key) {
            const sigs = (p.signatures && typeof p.signatures === 'object') ? p.signatures : {};
            for (let i = 0; i < ROLES.length; i++) {
                const s = sigs[ROLES[i]];
                if (!s || s.decision !== 'approve') throw new ValueError('both keys are required');
            }
        }
        const gov = governanceOf(m);
        const audit = Array.isArray(gov.audit) ? gov.audit.slice() : [];
        audit.push({
            action: 'strength_proposal_applied', proposal_id: p.proposal_id,
            at: now, from: p.from_strength, to: p.to_strength, lock: p.lock === true,
            reason: p.reason, signatures: Object.assign({}, p.signatures || {})
        });
        const record = Object.assign({}, m);
        record.importance = importanceFromStrength(p.to_strength, m.importance_scale);
        record.governance = Object.assign({}, gov, {
            strength_locked: p.lock === true,
            audit: audit.slice(-AUDIT_KEEP)
        });
        return {
            record: record,
            rollback_record: Object.assign({}, m),
            proposal_id: p.proposal_id,
            persisted: false,
            rollback_available: true
        };
    }
    /** 回滚到应用前的快照。快照缺失即抛（不允许「回滚成空」）。 */
    function rollbackStrengthChange(applied) {
        const a = (applied && typeof applied === 'object') ? applied : {};
        if (a.rollback_available !== true || !a.rollback_record || typeof a.rollback_record !== 'object') {
            throw new ValueError('rollback snapshot is unavailable');
        }
        return { record: Object.assign({}, a.rollback_record), persisted: false, restored: true };
    }
    /** 一行状态读数（诊断面用，不得代替 field 判断）。 */
    function describeProposal(proposal) {
        const p = (proposal && typeof proposal === 'object') ? proposal : {};
        const sigs = (p.signatures && typeof p.signatures === 'object') ? p.signatures : {};
        const have = ROLES.filter((r) => sigs[r] && sigs[r].decision === 'approve');
        return {
            proposal_id: p.proposal_id || '',
            status: p.status || 'unknown',
            high_impact: p.high_impact === true,
            keys_have: have,
            keys_need: p.requires_second_key ? ROLES.filter((r) => have.indexOf(r) < 0) : [],
            from_strength: p.from_strength === undefined ? null : p.from_strength,
            to_strength: p.to_strength === undefined ? null : p.to_strength
        };
    }
    /** 自证：常量形状不被改坏（策略面 BANDS 被改出缝时这里也要响一声）。 */
    function selfCheck() {
        const problems = [];
        if (ROLES.length !== 2 || ROLES[0] !== 'machine' || ROLES[1] !== 'human') problems.push('ROLES 形状漂移');
        if (DECISIONS.indexOf('approve') < 0 || DECISIONS.indexOf('return') < 0) problems.push('DECISIONS 形状漂移');
        if (!(HIGH_DELTA > 0)) problems.push('HIGH_DELTA 非正');
        if (fnv64hex('x').length !== 16) problems.push('fnv64hex 定长失效');
        if (fnv64hex('abc') !== fnv64hex('abc')) problems.push('fnv64hex 不稳定');
        return { ok: problems.length === 0, problems: problems };
    }
    return {
        ROLES: ROLES,
        DECISIONS: DECISIONS,
        HIGH_DELTA: HIGH_DELTA,
        CORE_FLOOR: CORE_FLOOR,
        fnv64hex: fnv64hex,
        createStrengthProposal: createStrengthProposal,
        reviewStrengthProposal: reviewStrengthProposal,
        applyStrengthProposal: applyStrengthProposal,
        rollbackStrengthChange: rollbackStrengthChange,
        describeProposal: describeProposal,
        selfCheck: selfCheck
    };
}));