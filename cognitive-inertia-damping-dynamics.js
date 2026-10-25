/* ============================================================
 * cognitive-inertia-damping-dynamics.js — [L11-O1 · 第十一期认知架构优化]
 * 认知惯性与心理阻尼动力学引擎 (Cognitive Inertia & Damping Dynamics)
 * ------------------------------------------------------------
 * 【核心设计】
 *   攻克长程对话中角色「极易因单句甜言蜜语瞬间丧失原则/原谅深仇大恨」的轻浮漂移缺陷。
 *   引入心理质量(m)、情绪动量(p = m*v)与心理阻尼势垒(Barrier Dynamics)：
 *   1. 计算角色针对特定对象/主题的心理固执度与创伤阻尼质量；
 *   2. 对外界刺激施加反向摩擦力与阻尼衰减，要求多轮阶梯式事件积累方能越过质变势垒；
 *   3. 产出抵抗回执与心理摩擦提示词约束，强行锁死模型的轻浮转变冲动。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaCognitiveInertia = factory();
        root.CognitiveInertiaDampingDynamics = root.LonShaCognitiveInertia;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const TRAUMA_WEIGHTS = Object.freeze({
        BETRAYAL: 0.9,     // 背叛：极高阻尼势垒
        ABANDONMENT: 0.85, // 遗弃：深度信任创伤
        HUMILIATION: 0.75, // 屈辱：尊严防卫壁垒
        SUSPICION: 0.6,    // 猜疑：持续警惕摩擦
        DISAPPOINTMENT: 0.4// 失望：轻度心理防线
    });

    /**
     * 计算角色心智质量与阻尼系数
     * @param {Object} actorProfile - 角色人设或性格参数
     * @param {Array} historyEvents - 历史关键经历/创伤事实
     * @returns {Object} 阻尼参数包 { mass, frictionCoeff, barrierThreshold }
     */
    function computePsychologicalMass(actorProfile = {}, historyEvents = []) {
        let baseStubbornness = Number(actorProfile.stubbornness || actorProfile.pride || 0.5);
        if (baseStubbornness < 0.1) baseStubbornness = 0.1;
        if (baseStubbornness > 1.0) baseStubbornness = 1.0;

        let traumaMass = 0;
        if (Array.isArray(historyEvents)) {
            for (const ev of historyEvents) {
                const kind = String(ev.kind || ev.type || '').toUpperCase();
                if (TRAUMA_WEIGHTS[kind]) {
                    traumaMass += TRAUMA_WEIGHTS[kind] * (Number(ev.severity || 1));
                } else if (ev.isTrauma || ev.negativeImpact) {
                    traumaMass += 0.3 * (Number(ev.severity || 1));
                }
            }
        }

        // 最终质量 = 基础固执度 + 创伤累积质量 (封顶 3.0)
        const mass = Number(Math.min(3.0, baseStubbornness + traumaMass).toFixed(3));
        const frictionCoeff = Number((mass * 0.45 + 0.1).toFixed(3));
        // 跨越势垒所需净冲量阈值
        const barrierThreshold = Number((mass * 2.2).toFixed(3));

        return {
            mass,
            frictionCoeff,
            barrierThreshold
        };
    }

    /**
     * 评估单轮外部刺激的有效冲量与态度阻尼演化
     * @param {Object} currentDynamics - 当前心理状态 { currentStance, cumulativeImpulse, historyRounds }
     * @param {Object} externalStimulus - 外部刺激 { valence: 态度倾向[-1..1], intensity: 强度[0..1], rationale: 理由 }
     * @param {Object} dampingParams - computePsychologicalMass 计算出的阻尼参数
     * @returns {Object} 演化后状态与指导约束
     */
    function applyDampingStep(currentDynamics = {}, externalStimulus = {}, dampingParams = {}) {
        const mass = Number(dampingParams.mass || 1.0);
        const friction = Number(dampingParams.frictionCoeff || 0.3);
        const barrier = Number(dampingParams.barrierThreshold || 2.0);

        const currentStance = Number(currentDynamics.currentStance || 0); // -1(极度敌视/封闭) ~ 1(完全信任/开放)
        const currentImpulse = Number(currentDynamics.cumulativeImpulse || 0);
        const rounds = Number(currentDynamics.historyRounds || 0);

        const targetValence = Number(externalStimulus.valence || 0); // 外界试图拉向的方向
        const rawIntensity = Math.max(0, Math.min(1.0, Number(externalStimulus.intensity || 0.5)));

        // 试图转变的方向差
        const deltaDirection = targetValence - currentStance;
        const isCounterStance = (deltaDirection * currentStance) < 0 || (currentStance < -0.2 && targetValence > 0.2);

        // 摩擦阻力计算：若试图扭转固有敌对/防备状态，阻力极大
        const effectiveResistance = isCounterStance ? (mass * friction * 1.5) : friction;
        const netForce = (deltaDirection * rawIntensity) / (1 + effectiveResistance);

        // 累积冲量
        const newCumulativeImpulse = Number((currentImpulse + netForce).toFixed(4));

        let barrierCrossed = false;
        let nextStance = currentStance;

        // 只有当净累积冲量突破势垒时，态度才允许实质性跨越
        if (Math.abs(newCumulativeImpulse) >= barrier) {
            barrierCrossed = true;
            // 允许步进 0.2 ~ 0.35
            const stepShift = (newCumulativeImpulse > 0 ? 1 : -1) * 0.25;
            nextStance = Math.max(-1.0, Math.min(1.0, currentStance + stepShift));
        } else {
            // 势垒未突破，仅发生微观表面浮动 (不超过 0.05)
            const microFluctuation = Number((netForce * 0.08).toFixed(4));
            nextStance = Math.max(-1.0, Math.min(1.0, currentStance + microFluctuation));
        }

        nextStance = Number(nextStance.toFixed(3));

        // 生成约束提示词片段
        let promptDirective = '';
        if (currentStance < -0.3 && !barrierCrossed) {
            promptDirective = `【心理阻尼防线】：角色内心防御壁垒坚厚(质量=${mass})，纵然对方言语示好，内心仍旧警惕猜疑，绝不可瞬间释怀或轻信。表面可客套或冷漠，内心阻尼未越过阈值。`;
        } else if (barrierCrossed) {
            promptDirective = `【心理势垒松动】：历经多轮持续积累，角色内心的坚冰终于出现明显裂纹，允许展现出防线动摇或深层复杂情绪。`;
        }

        return {
            prevStance: currentStance,
            nextStance,
            cumulativeImpulse: newCumulativeImpulse,
            barrierCrossed,
            resistanceFactor: effectiveResistance,
            historyRounds: rounds + 1,
            promptDirective
        };
    }

    return {
        TRAUMA_WEIGHTS,
        computePsychologicalMass,
        applyDampingStep
    };
}));
