/* ========================================================
 * relationship-repair-theater.js — [M7-X5 · 第七期规划] 关系修复剧场（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   两名角色因往日误解、失约或利益冲突而疏远时，传统系统往往以一句“对不起”或好感度数值
 *   强行把关系直接扳回“和好如初”，抹平了真实人际关系中道歉、解释、设界与拒绝的痛苦张力。
 *   关系修复剧场建立“多路径探索、知情不对称保护与可撤销演练”机制：
 *     ① 四条探索路径(REPAIR_PATH)：
 *        - 解释并求和(explain_and_reconcile)：坦诚原委，重建信任；
 *        - 明确设立边界(set_boundaries)：接受过往，但划定距离，止步于普通交往；
 *        - 拒绝和解(decline_reconciliation)：明确表达无法原谅，关系降温或断联；
 *        - 暂缓对话(postpone_dialogue)：情绪尚未平复，约定日后适时再谈；
 *     ② 知情不对称防伪造：若被道歉方对关键隐情完全不知情，绝不展示虚假“全盘谅解”；
 *     ③ 留存未决张力(unresolvedTensions)：和解不等于失忆，历史伤痕作为警示性记忆保留；
 *     ④ 错误采纳可撤回(revertRepairOutcome)：剧场允许模拟推演，未最终确认或采纳有误可一键还原。
 * ======================================================== */
(function (root) {
    'use strict';

    /** 修复路径 */
    const REPAIR_PATH = Object.freeze({
        EXPLAIN_AND_RECONCILE: 'explain_and_reconcile',   // 坦诚解释并逐步重建信任
        SET_BOUNDARIES: 'set_boundaries',                 // 设立清晰界限，保持安全社交距离
        DECLINE_RECONCILIATION: 'decline_reconciliation', // 明确拒绝和解，关系保持冷淡/隔阂
        POSTPONE_DIALOGUE: 'postpone_dialogue'            // 暂缓沟通，各自保留时间沉淀
    });

    /** 剧场推演状态 */
    const THEATER_STAGE = Object.freeze({
        INITIATED: 'initiated',       // 入口已开启，陈述双方立场
        IN_DIALOGUE: 'in_dialogue',   // 对话推演中，交换细节
        RESOLVED: 'resolved',         // 形成明确阶段性结局
        REVERTED: 'reverted'          // 撤销推演结果回到原点
    });

    function safeStr(val, fallback = '') {
        return (typeof val === 'string' && val.trim().length > 0) ? val.trim() : fallback;
    }

    function safeArr(val) {
        return Array.isArray(val) ? val : [];
    }

    /**
     * 创建关系修复剧场入口
     */
    function createRepairEncounter(raw = {}) {
        return {
            encounterId: safeStr(raw.encounterId, `repair_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
            initiatorId: safeStr(raw.initiatorId, 'char_initiator'),
            initiatorName: safeStr(raw.initiatorName, '主动发起方'),
            recipientId: safeStr(raw.recipientId, 'char_recipient'),
            recipientName: safeStr(raw.recipientName, '回应方'),
            conflictCore: safeStr(raw.conflictCore, '未言明的隔阂事件'),
            // 主动方掌握的事实细节
            initiatorKnowledge: safeArr(raw.initiatorKnowledge).map(safeStr).filter(Boolean),
            // 回应方掌握的事实细节（若两边不对称，必须保护）
            recipientKnowledge: safeArr(raw.recipientKnowledge).map(safeStr).filter(Boolean),
            chosenPath: null,
            outcomeSummary: '',
            unresolvedTensions: [],
            stage: THEATER_STAGE.INITIATED,
            isAdopted: false,
            createdAt: safeStr(raw.createdAt, new Date().toISOString()),
            historySnapshots: []
        };
    }

    /**
     * 执行修复路径决策
     */
    function executeRepairPath(encounter = {}, pathType = REPAIR_PATH.EXPLAIN_AND_RECONCILE, payload = {}) {
        const enc = {
            ...encounter,
            initiatorKnowledge: safeArr(encounter.initiatorKnowledge),
            recipientKnowledge: safeArr(encounter.recipientKnowledge),
            unresolvedTensions: safeArr(encounter.unresolvedTensions),
            historySnapshots: safeArr(encounter.historySnapshots)
        };

        // 保存推演前快照支持撤销
        const snapshot = {
            stage: enc.stage,
            chosenPath: enc.chosenPath,
            outcomeSummary: enc.outcomeSummary,
            isAdopted: enc.isAdopted,
            timestamp: new Date().toISOString()
        };
        enc.historySnapshots.push(snapshot);

        const pathValues = Object.values(REPAIR_PATH);
        const resolvedPath = pathValues.includes(pathType) ? pathType : REPAIR_PATH.EXPLAIN_AND_RECONCILE;
        enc.chosenPath = resolvedPath;
        enc.stage = THEATER_STAGE.RESOLVED;

        // 检查知情不对称性
        const secretRevealed = Boolean(payload.revealHiddenTruth);
        const hasUnsharedKnowledge = enc.initiatorKnowledge.some(k => !enc.recipientKnowledge.includes(k));

        if (resolvedPath === REPAIR_PATH.EXPLAIN_AND_RECONCILE) {
            if (hasUnsharedKnowledge && !secretRevealed) {
                // 若关键事实尚未全盘告知，不可形成彻底谅解，而是带有隐忧的缓和
                enc.outcomeSummary = safeStr(payload.summary, '双方表面达成和解，但关键隐情仍未坦白，信任基础依然脆弱。');
                enc.unresolvedTensions.push('尚未坦白的关键隐情');
            } else {
                enc.outcomeSummary = safeStr(payload.summary, '双方坦诚交心，澄清了当年的误会，关系逐步恢复正常交往。');
            }
        } else if (resolvedPath === REPAIR_PATH.SET_BOUNDARIES) {
            enc.outcomeSummary = safeStr(payload.summary, '双方承认过往情分，但一致同意划分清晰相处边界，不再过问彼此私事。');
            enc.unresolvedTensions.push('客气而明确的社交距离');
        } else if (resolvedPath === REPAIR_PATH.DECLINE_RECONCILIATION) {
            enc.outcomeSummary = safeStr(payload.summary, '回应方明确表示伤害已经造成，拒绝接受道歉，彼此退回陌生人状态。');
            enc.unresolvedTensions.push('未能弥合的决裂隔阂');
        } else if (resolvedPath === REPAIR_PATH.POSTPONE_DIALOGUE) {
            enc.outcomeSummary = safeStr(payload.summary, '双方情绪仍未平复，决定给彼此留出空间，择日再行沟通。');
            enc.unresolvedTensions.push('悬而未决的对话');
        }

        enc.isAdopted = Boolean(payload.adoptOutcome);
        return enc;
    }

    /**
     * 撤销推演结果回到此前状态
     */
    function revertRepairOutcome(encounter = {}) {
        const enc = {
            ...encounter,
            historySnapshots: safeArr(encounter.historySnapshots)
        };

        if (enc.historySnapshots.length === 0) return enc;
        const lastSnapshot = enc.historySnapshots.pop();

        return {
            ...enc,
            stage: THEATER_STAGE.REVERTED,
            chosenPath: lastSnapshot.chosenPath,
            outcomeSummary: lastSnapshot.outcomeSummary,
            isAdopted: false,
            unresolvedTensions: []
        };
    }

    /**
     * 模块自检函数
     */
    function relationshipRepairTheaterSelfCheck() {
        const problems = [];
        try {
            let enc = createRepairEncounter({
                initiatorId: 'char_luojia',
                initiatorName: '珞珈',
                recipientId: 'char_shuyun',
                recipientName: '舒芸',
                conflictCore: '三年前失约未去省城音乐会',
                initiatorKnowledge: ['因家中有急事缺席', '私下托人转交了门票退款'],
                recipientKnowledge: ['只收到空荡荡的退票通知，不知家中变故']
            });

            // 1. 测试知情不对称下的求和路径（未揭示全部真相时不能宣称完全和解）
            enc = executeRepairPath(enc, REPAIR_PATH.EXPLAIN_AND_RECONCILE, {
                revealHiddenTruth: false,
                adoptOutcome: false
            });
            if (!enc.unresolvedTensions.includes('尚未坦白的关键隐情')) {
                problems.push('知情不对称情况下未正确保留隐忧张力');
            }

            // 2. 撤销测试
            enc = revertRepairOutcome(enc);
            if (enc.stage !== THEATER_STAGE.REVERTED || enc.isAdopted) {
                problems.push('推演撤销还原机制异常');
            }

            // 3. 拒绝路线测试
            enc = executeRepairPath(enc, REPAIR_PATH.DECLINE_RECONCILIATION, {
                summary: '舒芸表示无法释怀那次失信，拒绝重拾旧谊。',
                adoptOutcome: true
            });
            if (enc.chosenPath !== REPAIR_PATH.DECLINE_RECONCILIATION || !enc.isAdopted) {
                problems.push('拒绝和解路线状态流转异常');
            }
            if (!enc.unresolvedTensions.includes('未能弥合的决裂隔阂')) {
                problems.push('拒绝和解路线未正确保留决裂张力');
            }
        } catch (err) {
            problems.push(`自检运行异常: ${err && err.message ? err.message : String(err)}`);
        }
        return { problems };
    }

    const RelationshipRepairTheater = Object.freeze({
        REPAIR_PATH,
        THEATER_STAGE,
        createRepairEncounter,
        executeRepairPath,
        revertRepairOutcome,
        relationshipRepairTheaterSelfCheck
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = RelationshipRepairTheater;
    }
    root.RelationshipRepairTheater = RelationshipRepairTheater;
    root.LonShaRelationshipRepairTheater = RelationshipRepairTheater;
})(typeof globalThis !== 'undefined' ? globalThis : window);