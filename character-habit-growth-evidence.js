/* ============================================================
 * character-habit-growth-evidence.js — [L9-X6 · 第九期规划]
 * 经历驱动的角色习惯与能力成长证据束管理（纯函数内核）
 * ------------------------------------------------------------
 * 【核心设计】
 *   角色的做事方式与能力不是简单的数值分数，而是由经历构建的证据束：
 *     - 四阶段成长轨迹：
 *       'attempted' (尝试) -> 'effective_condition' (在特定条件下有效)
 *       -> 'failed_case' (遭遇失败) -> 'transferred_scenario' (迁移到新场景)
 *     - 当底层关联证据被撤回时，能力状态自动降级为 'needs_reverification' (待验证)，
 *       绝不静默归零，也绝不继续冒充已完全掌握。
 *
 * 【L13-X7 接产品时补的三样，均为读面所需、不改既有语义】
 *   (1) `habitKey`：本内核原先只认 `skillOrHabit`（一个自由串）。而产品侧的习惯本体
 *      （`character-agency-contract` 的 habitRepo）是按 **context + approach 二元组**
 *      认人的 —— 两处在「同一件事」上对不上，证据束就只能按名字猜对应关系。
 *      补一个可选 `habitKey`（由宿主侧按 context/approach 组装）**原样透传**；
 *      旧 bundle 没有该字段时一律回落 `skillOrHabit`（向后兼容，不迁移历史数据）。
 *   (2) `describeGrowth`：只读摘要。产品面板要「最近形成的习惯 + 走到哪一阶段 +
 *      证据被撤回后是否待验证」，这些能从 records 推出来，但不该让每个调用方各推一遍
 *      （各推一遍就有各推一遍的口径）。纯函数、不改入参、不抛。
 *   (3) `STAGE_LABELS` / `STAGE_ORDER`：四阶段的可读名与推进序。面板不许自己写一份
 *      中文（那样两份会漂）；序只用于回答「最远到过哪一步」，**不求和、不加权**
 *      —— 本仓纪律：不把成长做成数值条。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CharacterHabitGrowthEvidence = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const STAGES = Object.freeze({
        ATTEMPTED: 'attempted',
        EFFECTIVE: 'effective_condition',
        FAILED: 'failed_case',
        TRANSFERRED: 'transferred_scenario'
    });
    /* 四阶段的可读名（唯一一份；面板 / 诊断行都从这里取，不许各自写中文）。 */
    const STAGE_LABELS = Object.freeze({
        attempted: '尝试过',
        effective_condition: '在特定条件下有效',
        failed_case: '遭遇过失败',
        transferred_scenario: '迁移到新场景'
    });
    /* 推进序（0 最低）：只回答「最远到过哪一阶段」。
     *   ★ 不是分数、不是等级：不求和不加权，读面不得据此算「熟练度」。
     */
    const STAGE_ORDER = Object.freeze({
        attempted: 0,
        effective_condition: 1,
        failed_case: 2,
        transferred_scenario: 3
    });

    function recordGrowthEvidence(bundle = {}, record = {}) {
        const records = Array.isArray(bundle.records) ? bundle.records.slice() : [];
        const stage = Object.values(STAGES).includes(record.stage) ? record.stage : STAGES.ATTEMPTED;

        const newRec = {
            id: record.id || `grow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            stage,
            evidenceId: record.evidenceId || null,
            description: String(record.description || '').trim(),
            contextCondition: record.contextCondition || 'general',
            timestamp: Date.now()
        };

        records.push(newRec);

        return {
            actorId: bundle.actorId || record.actorId || 'unknown_actor',
            skillOrHabit: bundle.skillOrHabit || record.skillOrHabit || 'general',
            /* [L13-X7] habitKey 原样透传（缺省时由读面回落 skillOrHabit，见档头 (1)） */
            habitKey: bundle.habitKey || record.habitKey || '',
            records,
            status: 'active',
            updatedAt: Date.now()
        };
    }

    function evaluateCompetencyAfterRevocation(bundle = {}, revokedEvidenceIds = []) {
        const revokedSet = new Set(Array.isArray(revokedEvidenceIds) ? revokedEvidenceIds : []);
        const records = Array.isArray(bundle.records) ? bundle.records : [];
        
        let hasRevoked = false;
        const validRecords = [];
        for (const r of records) {
            if (r.evidenceId && revokedSet.has(r.evidenceId)) {
                hasRevoked = true;
            } else {
                validRecords.push(r);
            }
        }

        return {
            actorId: bundle.actorId,
            skillOrHabit: bundle.skillOrHabit,
            /* [L13-X7] 同 recordGrowthEvidence：key 必须跟着走 —— 否则撤回一次证据
             *   就把「这是哪条习惯」丢了，读面会把它归成一条无主证据束。 */
            habitKey: bundle.habitKey || '',
            status: hasRevoked ? 'needs_reverification' : 'active',
            /* [L13-X7] 撤回后的束必须**仍然可被读面描述**：records 收留下来的那些。
             *   原先只给 validRecords，而 describeGrowth 读的是 records —— 于是
             *   「撤回证据」这一步的产物进了读面就成了空束（`status:'empty'`），
             *   等于把本模块最核心的承诺（绝不静默归零）在链条上破了个口。
             *   validRecords 保留原名不动（既有调用方与判据按它断言）。 */
            records: validRecords,
            validRecords,
            revokedCount: records.length - validRecords.length,
            updatedAt: Date.now()
        };
    }

    /**
     * 只读摘要：一条证据束走到哪一阶段、最近一条是什么、涉及哪些证据 id。
     * 纯函数：不改入参、不写盘、不抛（畸形回落空摘要 + degraded 标记）。
     * @param {object} bundle
     * @returns {object}
     */
    function describeGrowth(bundle = {}) {
        const empty = { actorId: '', skillOrHabit: '', habitKey: '', status: 'empty', total: 0,
            counts: { attempted: 0, effective_condition: 0, failed_case: 0, transferred_scenario: 0 },
            reachedStage: '', reachedLabel: '', latest: null, evidenceIds: [], degraded: false };
        try {
            const b = (bundle && typeof bundle === 'object') ? bundle : {};
            const records = Array.isArray(b.records) ? b.records : [];
            if (!records.length) return empty;
            let degraded = false;
            const counts = { attempted: 0, effective_condition: 0, failed_case: 0, transferred_scenario: 0 };
            let reached = '';
            let reachedOrder = -1;
            let latest = null;
            const evidenceIds = [];
            for (const r of records) {
                const st = String((r && r.stage) || '');
                /* 认不出的阶段如实记 degraded，**不并进 attempted** ——
                 *   把它算成「尝试过」等于替一条坏数据编排剧情。 */
                if (!Object.prototype.hasOwnProperty.call(counts, st)) { degraded = true; continue; }
                counts[st] += 1;
                if (STAGE_ORDER[st] > reachedOrder) { reachedOrder = STAGE_ORDER[st]; reached = st; }
                if (!latest || Number(r.timestamp || 0) >= Number(latest.timestamp || 0)) latest = r;
                const eid = r && r.evidenceId ? String(r.evidenceId) : '';
                if (eid && evidenceIds.indexOf(eid) < 0) evidenceIds.push(eid);
            }
            return {
                actorId: String(b.actorId || ''),
                skillOrHabit: String(b.skillOrHabit || ''),
                habitKey: String(b.habitKey || ''),
                /* status 只透传（active / needs_reverification），不在这里判「算不算掌握」——
                 *   那是 evaluateCompetencyAfterRevocation 的职责，两处各判一次就会各说一套。 */
                status: String(b.status || 'active'),
                total: records.length,
                counts,
                reachedStage: reached,
                reachedLabel: STAGE_LABELS[reached] || '',
                latest: latest ? {
                    id: String(latest.id || ''),
                    stage: String(latest.stage || ''),
                    evidenceId: latest.evidenceId ? String(latest.evidenceId) : '',
                    description: String(latest.description || ''),
                    contextCondition: String(latest.contextCondition || ''),
                    timestamp: Number(latest.timestamp || 0)
                } : null,
                evidenceIds,
                degraded
            };
        } catch (_e) {
            return Object.assign({}, empty, { degraded: true });
        }
    }

    return {
        STAGES,
        STAGE_LABELS,
        STAGE_ORDER,
        recordGrowthEvidence,
        evaluateCompetencyAfterRevocation,
        describeGrowth
    };
}));