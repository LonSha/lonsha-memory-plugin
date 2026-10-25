/* ============================================================
 * attention-priming-verification-anchor.js — [L10-X2 · 第十期全量创新]
 * 注意力预热与前置对账插桩（Attention Priming & Verification Anchor）
 * ------------------------------------------------------------
 * 【核心设计】
 *   解决长上下文注入后大模型「注入了但当没看见」的遵从性疲劳（Lost-in-the-Middle）：
 *   1. 前置注意力预热：在记忆注入区顶部提取 1~3 个关键焦点事实，构建微光注意力锚点；
 *   2. 隐式对账契约：为模型提供思考与表达的对齐指引；
 *   3. 生成后遵从度复核：检测 AI 生成的文本是否真实体现或呼应了预热锚点。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaAttentionPriming = factory();
    root.AttentionPrimingVerificationAnchor = root.LonShaAttentionPriming;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * 构建前置注意力预热锚点集合
     * @param {Array} facts - 已召回的事实列表
     * @param {Object} options - 配置（如最多预热项数、聚焦角色）
     * @returns {Object} 预热锚点数据
     */
    function buildPrimingAnchors(facts = [], options = {}) {
        if (!Array.isArray(facts) || facts.length === 0) {
            return { anchors: [], promptBlock: '' };
        }

        const maxAnchors = Math.max(1, Math.min(3, Number(options.maxAnchors) || 2));
        const focusActor = options.focusActor ? String(options.focusActor).trim() : null;

        // 筛选优先级：高权重 > 关联焦点角色 > 承诺/冲突账本
        const sorted = facts.slice().sort((a, b) => {
            let scoreA = Number(a.weight || a.score || 0.5);
            let scoreB = Number(b.weight || b.score || 0.5);
            if (focusActor) {
                if (Array.isArray(a.actors) && a.actors.includes(focusActor)) scoreA += 0.3;
                if (Array.isArray(b.actors) && b.actors.includes(focusActor)) scoreB += 0.3;
            }
            if (a.kind === 'commitment' || a.kind === 'conflict') scoreA += 0.2;
            if (b.kind === 'commitment' || b.kind === 'conflict') scoreB += 0.2;
            return scoreB - scoreA;
        });

        const selected = sorted.slice(0, maxAnchors);
        const anchors = selected.map((f, idx) => {
            const rawContent = String(f.content || f.text || '').trim();
            // 提取关键核实短语
            const corePhrase = rawContent.length > 30 ? rawContent.slice(0, 30) + '…' : rawContent;
            return {
                id: f.id || `anchor_${idx}`,
                corePhrase,
                keywords: Array.isArray(f.keywords) ? f.keywords : extractKeywords(rawContent),
                kind: f.kind || 'fact',
                priority: idx + 1
            };
        });

        const promptBlock = formatPrimingPrompt(anchors);

        return {
            anchors,
            promptBlock
        };
    }

    /**
     * 提取简单分词/关键词作为命中判定
     */
    function extractKeywords(text = '') {
        const clean = text.replace(/[，。！？、“”《》：；\s]/g, ' ');
        const parts = clean.split(' ').filter(w => w.length >= 2);
        return Array.from(new Set(parts)).slice(0, 5);
    }

    /**
     * 将预热锚点格式化为自然语言注意力引导
     */
    function formatPrimingPrompt(anchors = []) {
        if (!anchors.length) return '';
        const lines = anchors.map((a, i) => `  ${i + 1}. 【${a.corePhrase}】`);
        return `[叙事潜意识与焦点对账]\n当前言谈请自然隐喻或切实顾及以下前情，勿产生记忆脱节：\n${lines.join('\n')}`;
    }

    /**
     * 校验 AI 生成文本对预热锚点的遵从度
     * @param {string} responseText - AI 生成的文本
     * @param {Array} anchors - 预热锚点
     * @returns {Object} 遵从度评估报告
     */
    function verifyAttentionCompliance(responseText = '', anchors = []) {
        if (!responseText || !Array.isArray(anchors) || anchors.length === 0) {
            return {
                compliant: true,
                score: 1.0,
                matchedCount: 0,
                totalAnchors: 0,
                missedAnchors: []
            };
        }

        const text = String(responseText);
        const matched = [];
        const missed = [];

        for (const anchor of anchors) {
            let hit = false;
            // 1. 直接命中核心短语的前半部分
            const probe = anchor.corePhrase.replace(/…$/, '');
            if (probe.length >= 4 && text.includes(probe.slice(0, Math.min(10, probe.length)))) {
                hit = true;
            } else if (anchor.keywords && anchor.keywords.length > 0) {
                // 2. 至少命中 1 个关键词
                hit = anchor.keywords.some(kw => text.includes(kw));
            }

            if (hit) {
                matched.push(anchor);
            } else {
                missed.push(anchor);
            }
        }

        const score = Number((matched.length / anchors.length).toFixed(2));
        return {
            compliant: score >= 0.5,
            score,
            matchedCount: matched.length,
            totalAnchors: anchors.length,
            missedAnchors: missed
        };
    }

    return Object.freeze({
        buildPrimingAnchors,
        formatPrimingPrompt,
        verifyAttentionCompliance
    });
}));