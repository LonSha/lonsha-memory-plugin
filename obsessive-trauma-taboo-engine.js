/* ============================================================
 * obsessive-trauma-taboo-engine.js — [L20-8 · 第二十期史诗级双项目双计划]
 * 角色深层心理执念、创伤禁忌与应激失控阈值机 (Obsessive Trauma & Taboo Engine)
 * ------------------------------------------------------------
 * 【核心设计】
 *   赋予角色有血有肉的情感雷区与执念弱点，拒绝千篇一律的理智假人：
 *   1. 创伤禁忌雷区（Trauma Taboos）：
 *      记录导致角色创伤激惹的特定词汇、往事话题、物理接触或特定场景；
 *   2. 心理应激压力计（Emotional Stress Index 0 ~ 100）：
 *      当禁忌被触碰或执念受挫时，应激压力激增；
 *   3. 理智崩溃失控阈值（Breakdown Threshold & Directives）：
 *      突破阈值（>= 80）时强制触发冷酷失控、躯体化颤抖、惊恐发作或歇斯底里高阶指令。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaObsessiveTrauma = factory();
        root.ObsessiveTraumaTabooEngine = root.LonShaObsessiveTrauma;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * 创建创伤禁忌引擎初始状态
     */
    function createInitialTraumaState() {
        return {
            profiles: new Map(), // actorName -> traumaProfile
            updatedAt: Date.now()
        };
    }

    /**
     * 注册角色心理禁忌与执念画像
     */
    function registerTraumaProfile(state, spec = {}) {
        if (!state || !state.profiles) return null;
        const name = String(spec.actorName || spec.name || '').trim();
        if (!name) return null;

        const profile = {
            actorName: name,
            coreObsession: String(spec.coreObsession || '守护珍视之人').trim(),
            tabooTriggers: Array.isArray(spec.tabooTriggers) 
                ? spec.tabooTriggers.map(s => String(s).trim()).filter(Boolean)
                : ['背叛', '抛弃', '雨夜火灾'],
            stressLevel: Math.max(0, Math.min(100, Number(spec.stressLevel) || 10)),
            breakdownSymptom: String(spec.breakdownSymptom || '应激震颤与情绪失控攻击性').trim(),
            updatedAt: Date.now()
        };

        state.profiles.set(name.toLowerCase(), profile);
        state.updatedAt = Date.now();
        return profile;
    }

    /**
     * 扫描上下文并评估应激压力积累
     */
    function evaluateTraumaStress(state, actorName = '', contextText = '') {
        if (!state || !state.profiles) return null;
        const profile = state.profiles.get(String(actorName || '').toLowerCase());
        if (!profile) return null;

        const text = String(contextText || '').toLowerCase();
        let hitTaboo = null;

        for (const trigger of profile.tabooTriggers) {
            if (text.includes(trigger.toLowerCase())) {
                hitTaboo = trigger;
                profile.stressLevel = Math.min(100, profile.stressLevel + 35);
                break;
            }
        }

        // 自然缓慢平复
        if (!hitTaboo && profile.stressLevel > 10) {
            profile.stressLevel = Math.max(10, profile.stressLevel - 5);
        }

        profile.updatedAt = Date.now();
        state.updatedAt = Date.now();

        return {
            hitTaboo,
            stressLevel: profile.stressLevel,
            isBreakdown: profile.stressLevel >= 80
        };
    }

    /**
     * 推导当前角色心理失控与执念指令
     */
    function resolveTraumaDirectives(state, actorName = '', contextText = '') {
        const evalRes = evaluateTraumaStress(state, actorName, contextText);
        if (!evalRes) return [];

        const profile = state.profiles.get(String(actorName || '').toLowerCase());
        const directives = [];

        if (evalRes.isBreakdown) {
            directives.push(`【心理创伤失控·崩溃临界】因触及创伤禁忌（“${evalRes.hitTaboo || '核心阴影'}”），${profile.actorName}内心防线彻底击穿，应激压力达到极限（${evalRes.stressLevel}/100）！必须展现躯体化剧烈反应（如：${profile.breakdownSymptom}），理智处于崩溃失控边缘。`);
        } else if (evalRes.hitTaboo) {
            directives.push(`【心理禁忌激惹】${profile.actorName}被敏感词“${evalRes.hitTaboo}”激惹，内心执念（“${profile.coreObsession}”）剧烈翻涌，神色微变、呼吸加重，言语间带上极力掩饰的压抑不安。`);
        }

        return directives;
    }

    /**
     * 宽容水合
     */
    function hydrateTraumaState(raw = {}) {
        const state = createInitialTraumaState();
        if (!raw || typeof raw !== 'object') return state;

        if (Array.isArray(raw.profiles)) {
            for (const p of raw.profiles) {
                if (p && p.actorName) state.profiles.set(String(p.actorName).toLowerCase(), p);
            }
        } else if (raw.profiles && typeof raw.profiles === 'object') {
            for (const [k, v] of Object.entries(raw.profiles)) {
                if (v && typeof v === 'object') state.profiles.set(k.toLowerCase(), v);
            }
        }

        state.updatedAt = Number(raw.updatedAt) || Date.now();
        return state;
    }

    /**
     * 序列化
     */
    function serializeTraumaState(state) {
        if (!state || !state.profiles) return { profiles: [], updatedAt: Date.now() };
        const profiles = [];
        for (const p of state.profiles.values()) profiles.push(p);
        return {
            profiles,
            updatedAt: state.updatedAt || Date.now()
        };
    }

    return {
        createInitialTraumaState,
        registerTraumaProfile,
        evaluateTraumaStress,
        resolveTraumaDirectives,
        hydrateTraumaState,
        serializeTraumaState
    };
}));