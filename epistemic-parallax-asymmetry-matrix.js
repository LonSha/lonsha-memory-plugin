/* ============================================================
 * epistemic-parallax-asymmetry-matrix.js — [L20-4 · 第二十期史诗级双项目双计划]
 * 多视角视差对比矩阵与非对称情报博弈网络 (Epistemic Parallax & Asymmetry Matrix)
 * ------------------------------------------------------------
 * 【核心设计】
 *   针对酒馆通用群聊与多角色网状交互，彻底终结“全员全知上帝视角”的戏剧平庸化：
 *   1. 认知视差四元态（Cognitive Quadrant）：
 *      - `VERIFIED`（知晓真相）
 *      - `MISINFORMED`（持有合理假象/先入为主的偏见）
 *      - `SUSPECTING`（心生怀疑但无实据，暗中试探）
 *      - `DECEIVED`（被伪装面具欺瞒，深信表层假象）
 *   2. 网状博弈拓扑（Asymmetric Belief Network）：
 *      以 [Actor -> TargetEntity/Secret] 为网格单元，精确度量每一位角色对机密事实的认知边界；
 *   3. 角色视角提示分流裁决（Perspective Split Adjudicator）：
 *      在进入大模型注入前，为当前说话角色动态定制「知情守秘」、「蒙在鼓里试探」或「战战兢兢伪装」的高阶戏剧指令。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaEpistemicMatrix = factory();
        root.EpistemicParallaxAsymmetryMatrix = root.LonShaEpistemicMatrix;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const COGNITIVE_STANCE = Object.freeze({
        VERIFIED: 'verified',         // 掌握客观事实
        MISINFORMED: 'misinformed',   // 受到假情报或合理误会蒙蔽
        SUSPECTING: 'suspecting',     // 觉察异样，处于试探怀疑态
        DECEIVED: 'deceived'          // 彻底落入伪装面具陷阱
    });

    /**
     * 创建非对称视差认知矩阵初始状态
     */
    function createInitialParallaxMatrixState() {
        return {
            dossiers: new Map(), // secretId -> { secretId, groundTruth, stances: Map<actorName, stanceEntry> }
            updatedAt: Date.now()
        };
    }

    /**
     * 注册或更新某一机密/事实在多角色间的认知分布
     * @param {Object} state - 矩阵状态
     * @param {Object} dossierSpec - { id, groundTruth, stances: { [actorName]: { stance, beliefDetails } } }
     */
    function registerSecretDossier(state, dossierSpec = {}) {
        if (!state || !state.dossiers) return null;
        const secretId = String(dossierSpec.id || `sec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
        const groundTruth = String(dossierSpec.groundTruth || '').trim();
        
        const stanceMap = new Map();
        if (dossierSpec.stances && typeof dossierSpec.stances === 'object') {
            for (const [actor, info] of Object.entries(dossierSpec.stances)) {
                if (!actor) continue;
                const stanceType = Object.values(COGNITIVE_STANCE).includes(info?.stance) 
                    ? info.stance 
                    : COGNITIVE_STANCE.MISINFORMED;
                stanceMap.set(actor.trim().toLowerCase(), {
                    actorName: actor.trim(),
                    stance: stanceType,
                    beliefDetails: String(info?.beliefDetails || '').trim()
                });
            }
        }

        const entry = {
            id: secretId,
            groundTruth,
            stances: stanceMap,
            updatedAt: Date.now()
        };

        state.dossiers.set(secretId, entry);
        state.updatedAt = Date.now();
        return entry;
    }

    /**
     * 为当前轮次发话角色推导非对称视差张力指令
     * @param {Object} state - 矩阵状态
     * @param {string} currentActor - 当前正在生成回复的角色名
     * @param {Array<string>} coPresentActors - 同场出场的其他角色名列表
     * @returns {Array<string>} 戏剧视差高阶指引
     */
    function resolvePerspectiveDirectives(state, currentActor = '', coPresentActors = []) {
        if (!state || !state.dossiers || state.dossiers.size === 0) return [];
        const actor = String(currentActor || '').trim().toLowerCase();
        if (!actor) return [];

        const otherActors = Array.isArray(coPresentActors)
            ? coPresentActors.map(a => String(a).trim().toLowerCase()).filter(a => a && a !== actor)
            : [];

        const directives = [];

        for (const dossier of state.dossiers.values()) {
            const myStance = dossier.stances.get(actor);
            if (!myStance) continue; // 当前角色与该秘密无认知绑定

            // 寻找同场其他角色的认知反差，制造戏剧张力
            const gaps = [];
            for (const other of otherActors) {
                const theirStance = dossier.stances.get(other);
                if (theirStance && theirStance.stance !== myStance.stance) {
                    gaps.push({ otherName: theirStance.actorName, theirStance: theirStance.stance, details: theirStance.beliefDetails });
                }
            }

            if (myStance.stance === COGNITIVE_STANCE.VERIFIED) {
                if (gaps.length > 0) {
                    const deceivedNames = gaps.filter(g => g.theirStance === COGNITIVE_STANCE.DECEIVED || g.theirStance === COGNITIVE_STANCE.MISINFORMED).map(g => g.otherName);
                    if (deceivedNames.length > 0) {
                        directives.push(`【信息差守秘·视差张力】${myStance.actorName}知晓真相（“${dossier.groundTruth}”），但同场的[${deceivedNames.join('、')}]仍被蒙在鼓里。严禁在言谈中直接戳穿，保持试探或审慎隐瞒。`);
                    }
                }
            } else if (myStance.stance === COGNITIVE_STANCE.DECEIVED || myStance.stance === COGNITIVE_STANCE.MISINFORMED) {
                directives.push(`【认知局限·主观假象】${myStance.actorName}并不知晓真实底细，深信假象：“${myStance.beliefDetails || '现状一切正常'}”。请完全基于此局限信念做出符合常理的误判或反应，切勿展现未卜先知的上帝视角。`);
            } else if (myStance.stance === COGNITIVE_STANCE.SUSPECTING) {
                directives.push(`【心生疑窦·暗中刺探】${myStance.actorName}已察觉到关于“${dossier.groundTruth}”的蛛丝马迹，心中存疑（“${myStance.beliefDetails || '事有蹊跷'}”）。言语间可带有隐蔽旁敲侧击，但切忌鲁莽定论。`);
            }
        }

        return directives;
    }

    /**
     * 宽容水合认知矩阵状态
     */
    function hydrateParallaxMatrixState(raw = {}) {
        const state = createInitialParallaxMatrixState();
        if (!raw || typeof raw !== 'object') return state;

        if (Array.isArray(raw.dossiers)) {
            for (const d of raw.dossiers) {
                if (d && d.id) {
                    const stanceMap = new Map();
                    if (Array.isArray(d.stances)) {
                        for (const s of d.stances) {
                            if (s && s.actorName) stanceMap.set(String(s.actorName).toLowerCase(), s);
                        }
                    } else if (d.stances && typeof d.stances === 'object') {
                        for (const [k, v] of Object.entries(d.stances)) {
                            if (v) stanceMap.set(k.toLowerCase(), v);
                        }
                    }
                    state.dossiers.set(d.id, {
                        id: d.id,
                        groundTruth: String(d.groundTruth || ''),
                        stances: stanceMap,
                        updatedAt: Number(d.updatedAt) || Date.now()
                    });
                }
            }
        }

        state.updatedAt = Number(raw.updatedAt) || Date.now();
        return state;
    }

    /**
     * 序列化认知矩阵状态
     */
    function serializeParallaxMatrixState(state) {
        if (!state || !state.dossiers) return { dossiers: [], updatedAt: Date.now() };
        const dossiers = [];
        for (const d of state.dossiers.values()) {
            const stances = [];
            for (const s of d.stances.values()) {
                stances.push(s);
            }
            dossiers.push({
                id: d.id,
                groundTruth: d.groundTruth,
                stances,
                updatedAt: d.updatedAt
            });
        }
        return {
            dossiers,
            updatedAt: state.updatedAt || Date.now()
        };
    }

    return {
        COGNITIVE_STANCE,
        createInitialParallaxMatrixState,
        registerSecretDossier,
        resolvePerspectiveDirectives,
        hydrateParallaxMatrixState,
        serializeParallaxMatrixState
    };
}));