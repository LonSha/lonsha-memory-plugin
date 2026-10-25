/* ============================================================
 * irony-pretense-immune-filter.js — [L10-X3 · 第十期全量创新]
 * 反讽、调侃与假象免疫过滤器（Irony & Pretense Immune Filter）
 * ------------------------------------------------------------
 * 【核心设计】
 *   解决记忆源头垃圾输入问题（GIGO：Garbage In, Garbage Out）：
 *   防止大模型将玩家的调侃反话、戏谑口嗨或角色的虚假掩饰直入客观事实库。
 *   1. 语义反转与修辞张力评估：识别“明夸暗讽”、“极端夸大修辞”与“戏谑标志词”；
 *   2. 可信度分级（Credibility Grade）：CONFIRMED (确凿) / HYPOTHETICAL (推测) / QUARANTINED (隔离)；
 *   3. 自动分流机制：低可信度事实被强制隔离到暂定区，推测事实进入假说区，禁止直入不可逆账本。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaIronyImmuneFilter = factory();
    root.IronyPretenseImmuneFilter = root.LonShaIronyImmuneFilter;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const CREDIBILITY_LEVEL = Object.freeze({
        CONFIRMED: 'confirmed',       // 高确凿度：直接进入事实账
        HYPOTHETICAL: 'hypothetical', // 假设/推论：需多重交叉验证
        QUARANTINED: 'quarantined'    // 疑似反讽/调侃/谎言：隔离暂存，禁止直接入账
    });

    // 典型的戏谑、反讽与夸大修辞标记
    const IRONY_CUES = [
        '可真行', '真是太棒了', '全天下最', '世界第一', '大善人',
        '呵呵', '开玩笑', '怎么可能', '下辈子', '随便说说',
        '算我输', '天塌下来', '才怪', '用脚指头想'
    ];

    // 典型的传闻、猜测与不确定性标记
    const HYPOTHESIS_CUES = [
        '可能', '据说', '传闻', '传言', '或许', '似乎', '大概', '推测'
    ];

    /**
     * 评估候选事实的可信度与反讽倾向
     * @param {Object} candidate - 包含 content, speaker, contextTone, isDirectAction 等
     * @returns {Object} 评估结果
     */
    function evaluateFactCredibility(candidate = {}) {
        const text = String(candidate.content || candidate.text || '').trim();
        if (!text) {
            return {
                credibility: CREDIBILITY_LEVEL.QUARANTINED,
                score: 0.0,
                cuesDetected: [],
                quarantineReason: 'empty_content'
            };
        }

        const cuesDetected = [];
        for (const cue of IRONY_CUES) {
            if (text.includes(cue)) {
                cuesDetected.push(cue);
            }
        }

        const hypoDetected = [];
        for (const cue of HYPOTHESIS_CUES) {
            if (text.includes(cue)) {
                hypoDetected.push(cue);
            }
        }

        // 基础可信度评分
        let score = 0.85;

        // 如果检测到反讽/口嗨修辞标记
        if (cuesDetected.length > 0) {
            score -= cuesDetected.length * 0.35;
        }

        // 如果检测到传闻/猜测标记
        if (hypoDetected.length > 0) {
            score -= hypoDetected.length * 0.20;
        }

        // 结合上下文语调
        const tone = String(candidate.contextTone || '').toLowerCase();
        if (tone === 'sarcastic' || tone === 'playful' || tone === 'joke') {
            score -= 0.4;
        } else if (tone === 'solemn' || tone === 'sworn' || tone === 'formal') {
            score += 0.15;
        }

        // 物理直接行为（如递交、伤害、签字）比纯口头表态更具确凿度
        if (candidate.isDirectAction) {
            score += 0.25;
        }

        score = Math.max(0.0, Math.min(1.0, Number(score.toFixed(2))));

        let credibility = CREDIBILITY_LEVEL.CONFIRMED;
        let quarantineReason = null;

        if (score < 0.45) {
            credibility = CREDIBILITY_LEVEL.QUARANTINED;
            quarantineReason = cuesDetected.length > 0 
                ? `检测到反讽/戏谑线索: [${cuesDetected.join(', ')}]` 
                : '整体上下文确凿度过低';
        } else if (score < 0.75) {
            credibility = CREDIBILITY_LEVEL.HYPOTHETICAL;
        }

        return {
            content: text,
            credibility,
            score,
            cuesDetected,
            hypoDetected,
            quarantineReason,
            evaluatedAt: Date.now()
        };
    }

    /**
     * 分流候选批次
     * @param {Array} candidateList
     * @returns {Object} { confirmed: [], hypothetical: [], quarantined: [] }
     */
    function triageFactBatch(candidateList = []) {
        const confirmed = [];
        const hypothetical = [];
        const quarantined = [];

        for (const item of candidateList) {
            const result = evaluateFactCredibility(item);
            const enriched = { ...item, verification: result };
            if (result.credibility === CREDIBILITY_LEVEL.CONFIRMED) {
                confirmed.push(enriched);
            } else if (result.credibility === CREDIBILITY_LEVEL.HYPOTHETICAL) {
                hypothetical.push(enriched);
            } else {
                quarantined.push(enriched);
            }
        }

        return { confirmed, hypothetical, quarantined };
    }

    return Object.freeze({
        CREDIBILITY_LEVEL,
        IRONY_CUES,
        HYPOTHESIS_CUES,
        evaluateFactCredibility,
        triageFactBatch
    });
}));