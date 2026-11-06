/* ========================================================
 * scene-taboo-reflector.js — [v3.449.0 · L15-X6] 场景地点禁忌记忆反射激活内核（纯函数）
 * --------------------------------------------------------
 * 【这一面解决什么】
 *   常识与设定多为静态检索，缺乏在进入特定禁忌地点（如神殿圣域、皇家禁地、凶案现场）
 *   时的条件反射式主动记忆唤醒。本模块接收场景地点并与禁忌规则库对拍，
 *   若地点命中禁忌空间，主动产出行为约束与警示记忆条目。
 * ======================================================== */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaSceneTabooReflector = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const TABOO_SEVERITY = Object.freeze({
        STRICT: 'strict',     // 绝不能触犯（如神殿熄火、皇陵止步）
        MODERATE: 'moderate', // 礼节禁忌（如低声说话、脱鞋）
        CUSTOM: 'custom'      // 地方民俗习惯
    });

    /**
     * 评估场景地点是否触发禁忌记忆条件反射
     * @param {string} location 当前场景地点
     * @param {Array} tabooRules 禁忌规则列表 [{ id, locationMatch, taboo, restriction, severity }]
     * @returns {{matched:boolean, location:string, taboos:Array, promptWarnings:string[]}}
     */
    function reflectLocationTaboos(location, tabooRules = []) {
        const loc = String(location || '').trim();
        if (!loc || !Array.isArray(tabooRules) || tabooRules.length === 0) {
            return {
                matched: false,
                location: loc,
                taboos: [],
                promptWarnings: []
            };
        }

        const matchedTaboos = [];
        const warnings = [];

        for (const rule of tabooRules) {
            if (!rule || !rule.locationMatch) continue;
            let hits = false;
            if (rule.locationMatch instanceof RegExp) {
                hits = rule.locationMatch.test(loc);
            } else {
                const kw = String(rule.locationMatch).trim();
                hits = kw && loc.includes(kw);
            }

            if (hits) {
                const tab = {
                    id: rule.id || ('taboo_' + Math.random().toString(36).slice(2, 6)),
                    location: loc,
                    matchedPattern: String(rule.locationMatch),
                    taboo: String(rule.taboo || '行为禁忌'),
                    restriction: String(rule.restriction || '严禁违规'),
                    severity: Object.values(TABOO_SEVERITY).includes(rule.severity) ? rule.severity : TABOO_SEVERITY.MODERATE
                };
                matchedTaboos.push(tab);
                warnings.push(`【地点禁忌反射 · ${tab.taboo}】在「${loc}」内：${tab.restriction}（严重度: ${tab.severity}）`);
            }
        }

        return {
            matched: matchedTaboos.length > 0,
            location: loc,
            taboos: matchedTaboos,
            promptWarnings: warnings
        };
    }

    return {
        TABOO_SEVERITY,
        reflectLocationTaboos
    };
}));