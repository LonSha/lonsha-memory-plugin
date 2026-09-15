/**
 * stale-guard.js — [v3.104 缝合] 陈旧写入防护（读集 + 状态指纹 + 幂等重放）
 *
 * 【来源】缝合 m61-oss/st-bionic-memory（BME）domain/memory-changeset.js +
 *         memory-ledger.js 的变更集校验与幂等提交语义，按本插件工程规范
 *         重写为可测纯函数模块（零依赖、IIFE 双导出）。
 *
 * 【机制】本插件已有单调修订号 `_revision`（拒绝「请求 rev 落后于当前 rev」），
 *   但那只覆盖「写入顺序」一种陈旧来源。真实会丢数据的场景还有两类：
 *     ① 读集陈旧：AI（或异步任务）基于某批记录做了推理，期间其中一条被删/被换，
 *        此时再按旧结论写回，就是往已不存在的依据上盖新事实；
 *     ② 状态指纹陈旧：base 修订号相同但内容被就地改过（导入/回档/外部写入），
 *        修订号看不出差异，只有指纹能发现「你读到的已经不是现在这份」。
 *
 *   本模块提供三层防护：
 *     - baseRevision 顺序校验（与现有 _revision 一致的下界检查）
 *     - readIds 读集校验（任一被读记录已不存在 → stale）
 *     - readStateFingerprint 指纹校验（仅当 base 落后时才要求，避免同修订正常写被误杀）
 *   并把 `missing-ref`（外部依据不存在）归入 invalid 而非 stale —— 两类问题
 *   需要不同的处理路径：stale 应重读后重试，invalid 应直接拒绝本次变更。
 *
 *   幂等：同一 idempotencyKey 重放时，比对 payload 指纹；一致则判定为「重放」
 *   （不重复落库），不一致则判定为「键复用冲突」（必须报错，否则会静默覆盖）。
 *
 * 【与源码差异】
 *   - 源码为 ESM 多文件协作（依赖 ledger 索引/领域 ID 生成）；本实现自包含纯函数
 *   - 增加 CHANGESET_ISSUE 常量与 classifyIssues()，把「陈旧」与「非法」显式分级
 *   - 增加 fingerprintDiff()：并列两份状态指纹差异（诊断「哪里变了」）
 */

(function (global) {
    'use strict';

    /** 问题类型常量 */
    const CHANGESET_ISSUE = Object.freeze({
        ANOTHER_CHAT: 'another-chat',
        BASE_AHEAD: 'base-ahead',
        MISSING_READ: 'missing-read',
        STATE_CHANGED: 'state-changed',
        NO_FINGERPRINT: 'no-fingerprint',
        MISSING_REF: 'missing-ref',
        DUPLICATE_OPERATION: 'duplicate-operation',
        EMPTY_OPERATIONS: 'empty-operations',
    });

    /** 陈旧类（重读后可重试） */
    const STALE_ISSUES = new Set([
        CHANGESET_ISSUE.BASE_AHEAD,
        CHANGESET_ISSUE.MISSING_READ,
        CHANGESET_ISSUE.STATE_CHANGED,
        CHANGESET_ISSUE.NO_FINGERPRINT,
    ]);

    // ---------- 稳定序列化 / 指纹 ----------

    /** 对象键每层字典序排序的稳定序列化（同语义 → 同字节） */
    function stableStringify(value) {
        if (value === null || typeof value !== 'object') {
            if (typeof value === 'bigint') return JSON.stringify(String(value));
            const s = JSON.stringify(value);
            return s === undefined ? 'null' : s;
        }
        if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
        const keys = Object.keys(value).sort().filter(k => value[k] !== undefined);
        return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
    }

    /** FNV-1a 32bit → 8 位十六进制 */
    function fnv1a(str) {
        let h = 0x811c9dc5;
        const s = String(str);
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return ('0000000' + h.toString(16)).slice(-8);
    }

    /** 载荷指纹（幂等比对用） */
    function payloadFingerprint(payload) {
        return fnv1a(stableStringify(payload === undefined ? null : payload));
    }

    /**
     * 状态指纹：对给定状态做稳定序列化后取哈希。
     * 可选 pick：只对关心的字段取指纹（避免不相关字段（如 updatedAt）敏感）。
     */
    function computeStateFingerprint(state, pick) {
        let target = state;
        if (Array.isArray(pick) && pick.length) {
            target = {};
            for (const k of pick) target[k] = state ? state[k] : undefined;
        }
        return payloadFingerprint(target);
    }

    /** 并列两份指纹便于诊断（同值返回相同字符串） */
    function fingerprintDiff(a, b) {
        const fa = String(a || ''), fb = String(b || '');
        return fa === fb ? `${fa} (=)` : `${fa} ≠ ${fb}`;
    }

    // ---------- 变更集 ----------

    function toSet(values) {
        const out = new Set();
        for (const v of (Array.isArray(values) ? values : [])) {
            const s = String(v ?? '').trim();
            if (s) out.add(s);
        }
        return out;
    }

    /**
     * 构造变更集。
     * @param {object} input
     * @param {string} input.chatId
     * @param {number} input.baseRevision 读取时看到的修订号（非负整数）
     * @param {Array} input.operations 变更操作（不可为空）
     * @param {Array<string>} [input.readIds] 生成结论时读过的记录 id
     * @param {Array<string>} [input.sourceRefs] 依赖的外部依据 id
     * @param {string} [input.readStateFingerprint] 读取时的状态指纹
     */
    function createChangeSet(input) {
        const o = input || {};
        const chatId = String(o.chatId || '').trim();
        if (!chatId) throw new TypeError('changeSet.chatId is required');
        const baseRevision = Number(o.baseRevision);
        if (!Number.isInteger(baseRevision) || baseRevision < 0) {
            throw new TypeError('changeSet.baseRevision must be a non-negative integer');
        }
        if (!Array.isArray(o.operations) || o.operations.length === 0) {
            throw new TypeError('changeSet.operations is required');
        }
        const operations = o.operations.slice();
        const readIds = [...toSet(o.readIds)];
        const sourceRefs = [...toSet(o.sourceRefs)];
        const seed = {
            chatId,
            baseRevision,
            taskId: String(o.taskId || '').trim(),
            operations,
            readIds,
            sourceRefs,
        };
        const id = String(o.id || '').trim() || ('cs_' + payloadFingerprint(seed));
        return {
            id,
            chatId,
            baseRevision,
            taskId: String(o.taskId || '').trim(),
            idempotencyKey: String(o.idempotencyKey || '').trim() || ('change-set:' + id),
            readIds,
            sourceRefs,
            readStateFingerprint: String(o.readStateFingerprint || '').trim(),
            payloadFingerprint: payloadFingerprint(seed),
            operations,
            reason: String(o.reason || 'memory-change-set'),
            createdAt: Number.isFinite(Number(o.createdAt)) ? Number(o.createdAt) : Date.now(),
        };
    }

    /**
     * 校验变更集。
     * @param {object} changeSet createChangeSet 产物
     * @param {object} current { chatId, revision, availableIds, stateFingerprint }
     * @returns {{ valid:boolean, stale:boolean, issues:string[], kind:'ok'|'stale'|'invalid' }}
     */
    function validateChangeSet(changeSet, current) {
        const cs = changeSet || {};
        const cur = current || {};
        const issues = [];

        if (String(cs.chatId || '') !== String(cur.chatId || '')) {
            issues.push(CHANGESET_ISSUE.ANOTHER_CHAT);
        }
        const revisions = Array.isArray(cs.operations) ? cs.operations : [];
        if (revisions.length === 0) issues.push(CHANGESET_ISSUE.EMPTY_OPERATIONS);

        const baseRevision = Number(cs.baseRevision);
        const curRevision = Number(cur.revision);
        if (Number.isFinite(curRevision) && baseRevision > curRevision) {
            issues.push(CHANGESET_ISSUE.BASE_AHEAD);
        }

        const available = cur.availableIds instanceof Set ? cur.availableIds : toSet(cur.availableIds);
        const hasAvailable = cur.availableIds !== undefined && cur.availableIds !== null;
        if (hasAvailable) {
            for (const id of (cs.readIds || [])) {
                if (!available.has(String(id))) {
                    issues.push(`${CHANGESET_ISSUE.MISSING_READ}:${id}`);
                }
            }
            for (const ref of (cs.sourceRefs || [])) {
                if (!available.has(String(ref))) {
                    issues.push(`${CHANGESET_ISSUE.MISSING_REF}:${ref}`);
                }
            }
        }

        // 指纹仅在 base 落后（存在并发窗口）时才强制要求
        const behind = Number.isFinite(curRevision) && baseRevision < curRevision;
        if (behind) {
            if (!cs.readStateFingerprint) {
                issues.push(CHANGESET_ISSUE.NO_FINGERPRINT);
            } else if (cur.stateFingerprint && cs.readStateFingerprint !== String(cur.stateFingerprint)) {
                issues.push(CHANGESET_ISSUE.STATE_CHANGED);
            }
        }

        // 同一目标（op.target）在一次变更集中被重复修改 → 语义歧义
        const seen = new Set();
        for (const op of revisions) {
            const target = op && op.target != null ? String(op.target).trim() : '';
            if (!target) continue;
            if (seen.has(target)) issues.push(`${CHANGESET_ISSUE.DUPLICATE_OPERATION}:${target}`);
            seen.add(target);
        }

        const stale = issues.some(i => STALE_ISSUES.has(i.split(':')[0]));
        return {
            valid: issues.length === 0,
            stale,
            issues,
            kind: issues.length === 0 ? 'ok' : (stale ? 'stale' : 'invalid'),
        };
    }

    /** issues 分级（不重新校验，仅归类既有 issues） */
    function classifyIssues(issues) {
        const list = Array.isArray(issues) ? issues : [];
        const stale = list.filter(i => STALE_ISSUES.has(String(i).split(':')[0]));
        const invalid = list.filter(i => !STALE_ISSUES.has(String(i).split(':')[0]));
        return {
            stale,
            invalid,
            kind: list.length === 0 ? 'ok' : (stale.length ? 'stale' : 'invalid'),
        };
    }

    // ---------- 幂等与提交规划 ----------

    /**
     * 幂等检查。
     * @param {string} idempotencyKey
     * @param {string} fingerprint 本次载荷指纹
     * @param {object|null} existingCommit 同 key 的历史提交 { idempotencyKey, payloadFingerprint, revision }
     * @returns {{ replayed:boolean, conflict:boolean, existingCommit:object|null }}
     */
    function checkIdempotency(idempotencyKey, fingerprint, existingCommit) {
        if (!existingCommit) return { replayed: false, conflict: false, existingCommit: null };
        const same = String(existingCommit.payloadFingerprint || '') === String(fingerprint || '');
        return { replayed: same, conflict: !same, existingCommit };
    }

    /**
     * 提交规划：把校验 + 幂等合成一个决策。
     * @returns {{
     *   action:'replay'|'commit'|'rebase'|'reject',
     *   kind:'ok'|'stale'|'invalid'|'conflict',
     *   rebased:boolean, rebasedFrom:number|null,
     *   validation:object, summary:string
     * }}
     */
    function planCommit(changeSet, current, options) {
        const opts = options || {};
        const cs = changeSet || {};
        const cur = current || {};

        const idem = checkIdempotency(cs.idempotencyKey, cs.payloadFingerprint, opts.existingCommit || null);
        if (idem.conflict) {
            return {
                action: 'reject',
                kind: 'conflict',
                rebased: false,
                rebasedFrom: null,
                validation: { valid: false, stale: false, issues: ['idempotency-payload-mismatch'], kind: 'invalid' },
                summary: `幂等键复用但载荷不同（key=${cs.idempotencyKey}），拒绝写入以免覆盖`,
            };
        }
        if (idem.replayed) {
            return {
                action: 'replay',
                kind: 'ok',
                rebased: false,
                rebasedFrom: null,
                validation: { valid: true, stale: false, issues: [], kind: 'ok' },
                summary: `重放已存在的提交 ${idem.existingCommit.id || ''}（不重复落库）`,
            };
        }

        const validation = validateChangeSet(cs, cur);
        if (validation.kind === 'invalid') {
            return {
                action: 'reject',
                kind: 'invalid',
                rebased: false,
                rebasedFrom: null,
                validation,
                summary: `变更集非法（${validation.issues.join(', ')}），拒绝写入`,
            };
        }
        if (validation.kind === 'stale') {
            return {
                action: 'reject',
                kind: 'stale',
                rebased: false,
                rebasedFrom: null,
                validation,
                summary: `变更集陈旧（${validation.issues.join(', ')}），应重读后重试`,
            };
        }

        const curRevision = Number(cur.revision);
        const rebase = Number.isFinite(curRevision) && Number(cs.baseRevision) < curRevision;
        return {
            action: rebase ? 'rebase' : 'commit',
            kind: 'ok',
            rebased: rebase,
            rebasedFrom: rebase ? Number(cs.baseRevision) : null,
            validation,
            summary: rebase
                ? `指纹校验通过，允许自 rev ${cs.baseRevision} 变基到 rev ${curRevision} 后提交`
                : `校验通过，按 rev ${cs.baseRevision} 提交`,
        };
    }

    /** 摘要（人类可读，用于日志/诊断） */
    function summarize(changeSet, current) {
        const cs = changeSet || {};
        return [
            `变更集 ${cs.id || '<无 id>'}`,
            `  chat: ${cs.chatId}`,
            `  baseRevision: ${cs.baseRevision}（当前 ${current ? current.revision : '?'}）`,
            `  操作: ${(cs.operations || []).length} 项`,
            `  读集: ${(cs.readIds || []).length} 项 / 依据: ${(cs.sourceRefs || []).length} 项`,
            `  指纹: ${cs.readStateFingerprint || '(未记录)'}`,
        ].join('\n');
    }

    const api = {
        CHANGESET_ISSUE,
        STALE_ISSUES,
        stableStringify,
        fnv1a,
        payloadFingerprint,
        computeStateFingerprint,
        fingerprintDiff,
        createChangeSet,
        validateChangeSet,
        classifyIssues,
        checkIdempotency,
        planCommit,
        summarize,
        toSet,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaStaleGuard = api;
})(typeof window !== 'undefined' ? window : globalThis);