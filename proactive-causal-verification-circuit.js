/* ============================================================
 * proactive-causal-verification-circuit.js — [L11-O3 · 第十一期认知架构优化]
 * 因果链前摄校验与幻觉硬约束熔断机 (Proactive Causal Verification & Circuit-Breaker)
 * ------------------------------------------------------------
 * 【核心设计】
 *   解决抽取管线中「模型胡说八道死者复生/已销毁信物突然重现」等灾难性幻觉污染知识库问题：
 *   1. 维护世界线不可逆硬契约库（Irreversible State Invariants）：
 *      死亡/消亡状态、物理毁灭/焚毁信物、不可逆相变关系；
 *   2. 前摄因果校验：在事实准入（Fact Admission）之前，进行硬不变量碰撞检测；
 *   3. 异常熔断与自愈隔离：一旦检测到违背不可逆因果律，立即跳闸熔断（Circuit-Break），
 *      将异常事实拦截入隔离区并产出纠偏指导回执。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaCausalCircuit = factory();
        root.ProactiveCausalVerificationCircuit = root.LonShaCausalCircuit;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const IRREVERSIBLE_KINDS = Object.freeze({
        DEATH: 'death',             // 角色死亡/消亡
        DESTROYED: 'destroyed',     // 物品焚毁/粉碎/不可复原
        REVEALED: 'revealed',       // 秘密彻底公之于众（不可再伪装不知）
        IRREVOCABLE_PROMISE: 'irrevocable_promise' // 誓言永固/契约成立
    });

    /**
     * 校验新事实是否违背既有的不可逆世界不变量
     * @param {Object} candidateFact - 拟入库的新事实 { content, subject, action, target }
     * @param {Array} existingInvariants - 已确立的不可逆不变量事实列表
     * @returns {Object} 校验结果 { allowed, anomaly, violationReason }
     */
    function verifyCausalInvariants(candidateFact = {}, existingInvariants = []) {
        if (!candidateFact || typeof candidateFact !== 'object') {
            return { allowed: false, anomaly: true, violationReason: '候选事实为空或无效' };
        }

        const content = String(candidateFact.content || candidateFact.text || '').trim();
        const subject = candidateFact.subject ? String(candidateFact.subject).trim() : '';
        const target = candidateFact.target ? String(candidateFact.target).trim() : '';

        for (const inv of existingInvariants) {
            const invKind = String(inv.kind || inv.type || '').toLowerCase();
            const invTarget = String(inv.target || inv.subject || '').trim();

            if (!invTarget) continue;

            // 1. 死者复生硬碰撞检测
            if (invKind === IRREVERSIBLE_KINDS.DEATH || invKind.includes('death') || invKind.includes('dead')) {
                // 如果既有事实是 X 已死，而新事实描述 X 正在主动做出说话、奔跑、微笑等生者动作
                if ((subject === invTarget || content.includes(invTarget)) && 
                    /(微笑|说话|大笑|奔跑|站起身|走过来|点头|喝茶|拍了拍|拥抱)/.test(content) &&
                    !/(回忆|幻觉|梦见|想起|遗像|墓碑|尸体|遗物)/.test(content)) {
                    return {
                        allowed: false,
                        anomaly: true,
                        violationReason: `违背不可逆因果约束：实体 [${invTarget}] 已确认消亡，但新描述出现主动生者行为`,
                        breachedInvariant: inv
                    };
                }
            }

            // 2. 已销毁信物突然完好无损重现检测
            if (invKind === IRREVERSIBLE_KINDS.DESTROYED || invKind.includes('destroy') || invKind.includes('burnt')) {
                if ((target === invTarget || subject === invTarget || content.includes(invTarget)) &&
                    /(拿出了|递过去|把玩着|佩戴在|完好无损|亮出|翻开)/.test(content) &&
                    !/(仿制品|赝品|回忆|残骸|灰烬|碎片)/.test(content)) {
                    return {
                        allowed: false,
                        anomaly: true,
                        violationReason: `违背不可逆因果约束：物品 [${invTarget}] 已彻底焚毁/粉碎，不可直接完好重现`,
                        breachedInvariant: inv
                    };
                }
            }
        }

        return {
            allowed: true,
            anomaly: false,
            violationReason: null
        };
    }

    /**
     * 熔断器过滤管道
     * @param {Array} factsToAdmit - 待入库事实列表
     * @param {Array} existingInvariants - 不变量库
     * @returns {Object} { admittedFacts, quarantinedFacts, circuitBreaksCount }
     */
    function runCircuitBreakerPipeline(factsToAdmit = [], existingInvariants = []) {
        const admittedFacts = [];
        const quarantinedFacts = [];

        for (const fact of factsToAdmit) {
            const check = verifyCausalInvariants(fact, existingInvariants);
            if (check.allowed) {
                admittedFacts.push(fact);
            } else {
                quarantinedFacts.push({
                    fact,
                    quarantineReason: check.violationReason,
                    breachedInvariant: check.breachedInvariant,
                    quarantinedAt: Date.now()
                });
            }
        }

        return {
            admittedFacts,
            quarantinedFacts,
            circuitBreaksCount: quarantinedFacts.length
        };
    }

    return {
        IRREVERSIBLE_KINDS,
        verifyCausalInvariants,
        runCircuitBreakerPipeline
    };
}));