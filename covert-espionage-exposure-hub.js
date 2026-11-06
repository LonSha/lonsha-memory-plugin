/* ============================================================
 * covert-espionage-exposure-hub.js — [L20-7 · 第二十期史诗级双项目双计划]
 * 双重身份深度潜伏与卧底暴露风险动态博弈中枢 (Covert Espionage & Exposure Hub)
 * ------------------------------------------------------------
 * 【核心设计】
 *   针对谍战、潜伏伪装、双重面具与特工卧底等高压叙事场景：
 *   1. 双轨伪装/真实人设账本（Dual-Track Identity Ledger）：
 *      - 公共掩护身份（Public Cover Persona）：职业、公开阵营、习惯口吻、台面人际；
 *      - 潜伏绝密使命（Deep Cover Mission）：真实效忠组织、代号、核心情报目标、绝密信条；
 *   2. 破绽累积与暴露风险动态模型（Exposure Risk Index 0.0 ~ 1.0）：
 *      根据言语失误、物证被察觉、不在场证明破绽动态累加；
 *   3. 临界应急反应协议（Breach Contingency Protocol）：
 *      当暴露风险达到临界警戒线时，触发销毁证据、断尾求生或灭口反制高阶叙事指引。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaCovertEspionage = factory();
        root.CovertEspionageExposureHub = root.LonShaCovertEspionage;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * 创建潜伏博弈初始状态
     */
    function createInitialEspionageState() {
        return {
            agents: new Map(), // actorName -> agentDossier
            globalAlertLevel: 1, // 1: 平静, 2: 戒备, 3: 彻查, 4: 大搜捕
            updatedAt: Date.now()
        };
    }

    /**
     * 注册潜伏特工档案
     */
    function registerAgent(state, spec = {}) {
        if (!state || !state.agents) return null;
        const name = String(spec.actorName || spec.name || '').trim();
        if (!name) return null;

        const agent = {
            actorName: name,
            codename: String(spec.codename || '无名雀').trim(),
            coverPersona: {
                role: String(spec.coverRole || '平民').trim(),
                faction: String(spec.coverFaction || '中立').trim(),
                publicSpeechStyle: String(spec.coverSpeech || '谨小慎微').trim()
            },
            trueAllegiance: {
                realFaction: String(spec.realFaction || '抵抗组织').trim(),
                missionObjective: String(spec.missionObjective || '收集机密情报').trim()
            },
            exposureRisk: Math.max(0, Math.min(1.0, Number(spec.exposureRisk) || 0.05)),
            suspectedBy: Array.isArray(spec.suspectedBy) ? spec.suspectedBy.map(s => String(s).trim()).filter(Boolean) : [],
            leakedClues: [],
            updatedAt: Date.now()
        };

        state.agents.set(name.toLowerCase(), agent);
        state.updatedAt = Date.now();
        return agent;
    }

    /**
     * 记录破绽刺激并提升暴露风险
     */
    function recordBreachClue(state, actorName, clue = {}) {
        if (!state || !state.agents) return false;
        const agent = state.agents.get(String(actorName || '').toLowerCase());
        if (!agent) return false;

        const severity = Math.max(0.05, Math.min(1.0, Number(clue.severity) || 0.15));
        agent.exposureRisk = Math.min(1.0, agent.exposureRisk + severity);
        agent.leakedClues.push({
            clueText: String(clue.clueText || '言行微小矛盾').trim(),
            discoveredBy: String(clue.discoveredBy || '在场怀疑者').trim(),
            timestamp: Date.now()
        });
        if (clue.discoveredBy && !agent.suspectedBy.includes(clue.discoveredBy)) {
            agent.suspectedBy.push(clue.discoveredBy);
        }
        agent.updatedAt = Date.now();
        return true;
    }

    /**
     * 为当前角色推导潜伏与掩护指令
     */
    function resolveEspionageDirectives(state, currentActor = '', inSceneCharacters = []) {
        if (!state || !state.agents) return [];
        const agent = state.agents.get(String(currentActor || '').toLowerCase());
        if (!agent) return [];

        const directives = [];
        const riskPct = Math.round(agent.exposureRisk * 100);

        if (agent.exposureRisk < 0.3) {
            directives.push(`【特工潜伏·低危】${agent.actorName}（代号“${agent.codename}”）目前掩护完好（暴露风险 ${riskPct}%）。严格以“${agent.coverPersona.role}”口吻应对，暗中观察局势。`);
        } else if (agent.exposureRisk < 0.7) {
            const pursuers = agent.suspectedBy.filter(s => inSceneCharacters.some(c => c.toLowerCase() === s.toLowerCase()));
            const pursuerHint = pursuers.length > 0 ? `当前同场的[${pursuers.join('、')}]已对你产生怀疑，` : '';
            directives.push(`【特工潜伏·中危警报】${agent.actorName}暴露风险已升至 ${riskPct}%！${pursuerHint}对话中须极力圆谎掩饰破绽，坚决守住秘密使命“${agent.trueAllegiance.missionObjective}”。`);
        } else {
            directives.push(`【特工潜伏·极危破绽】${agent.actorName}掩护几乎被戳穿（暴露风险 ${riskPct}%）！处于随时可能被当场逮捕的危险边缘。须展现神经紧绷、随时准备销毁物证或孤注一掷绝地反击的极限张力。`);
        }

        return directives;
    }

    /**
     * 宽容水合
     */
    function hydrateEspionageState(raw = {}) {
        const state = createInitialEspionageState();
        if (!raw || typeof raw !== 'object') return state;

        state.globalAlertLevel = Number(raw.globalAlertLevel) || 1;
        if (Array.isArray(raw.agents)) {
            for (const a of raw.agents) {
                if (a && a.actorName) state.agents.set(String(a.actorName).toLowerCase(), a);
            }
        } else if (raw.agents && typeof raw.agents === 'object') {
            for (const [k, v] of Object.entries(raw.agents)) {
                if (v && typeof v === 'object') state.agents.set(k.toLowerCase(), v);
            }
        }

        state.updatedAt = Number(raw.updatedAt) || Date.now();
        return state;
    }

    /**
     * 序列化
     */
    function serializeEspionageState(state) {
        if (!state || !state.agents) return { agents: [], globalAlertLevel: 1, updatedAt: Date.now() };
        const agents = [];
        for (const a of state.agents.values()) agents.push(a);
        return {
            agents,
            globalAlertLevel: state.globalAlertLevel || 1,
            updatedAt: state.updatedAt || Date.now()
        };
    }

    return {
        createInitialEspionageState,
        registerAgent,
        recordBreachClue,
        resolveEspionageDirectives,
        hydrateEspionageState,
        serializeEspionageState
    };
}));