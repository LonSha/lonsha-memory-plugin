/* ============================================================
 * retinal-attention-steering-arranger.js — [L11-O2 · 第十一期认知架构优化]
 * 动态视网膜对焦与抗迷失注意力排布器 (Retinal Attention Steering Arranger)
 * ------------------------------------------------------------
 * 【核心设计】
 *   解决长文本注入中模型「注入了但处于中段而产生注意力盲区（Lost-in-the-Middle）」问题：
 *   1. 模拟视觉中央凹机制（Foveal Focus vs Peripheral Vision）：
 *      将记忆材料划分为中央凹高光区（高张力、强冲突、强契约）与周边视野区（背景事实、日常琐事）；
 *   2. 尾部回响插桩（Sandwich Recapitulation）：在提示词注入末尾对核心事实进行极简二道加强；
 *   3. 动态抗稀释排布：对同质化背景事实进行聚类压缩，确保注意力能量聚焦在戏剧风暴眼。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaRetinalAttention = factory();
        root.RetinalAttentionSteeringArranger = root.LonShaRetinalAttention;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const ZONE_TYPES = Object.freeze({
        FOVEAL: 'foveal',         // 中央凹焦点区（高注意力、强引导）
        PARAFOVEAL: 'parafoveal', // 旁中央凹过渡区（中等张力）
        PERIPHERAL: 'peripheral'  // 周边背景区（低张力日常）
    });

    /**
     * 计算单条事实的注意力显著性得分（Saliency Score）
     * @param {Object} fact - 记忆事实条目
     * @param {Object} context - 当前轮次焦点（包含当前对白角色、剧烈矛盾关键词等）
     * @returns {number} 显著性分数 [0..1]
     */
    function computeSaliencyScore(fact = {}, context = {}) {
        let score = Number(fact.weight || fact.salience || 0.4);

        const kind = String(fact.kind || fact.type || '').toLowerCase();
        // 关键矛盾/承诺/阻尼/秘密天然具备高显著性
        if (kind.includes('conflict') || kind.includes('trauma') || kind.includes('secret')) {
            score += 0.35;
        } else if (kind.includes('commitment') || kind.includes('pledge') || kind.includes('boundary')) {
            score += 0.25;
        }

        // 当前互动角色亲和性加权
        const currentActor = context.currentActor ? String(context.currentActor).trim() : null;
        if (currentActor && Array.isArray(fact.actors) && fact.actors.includes(currentActor)) {
            score += 0.2;
        }

        // 情绪张力/反常度加权
        if (fact.tensionPolarity === 'confrontational' || fact.tensionPolarity === 'vulnerable') {
            score += 0.15;
        }

        return Number(Math.min(1.0, Math.max(0.0, score)).toFixed(3));
    }

    /**
     * 对已召回事实阵列进行视网膜分区与三明治排布
     * @param {Array} facts - 已召回记忆列表
     * @param {Object} context - 上下文特征
     * @param {Object} options - 配置选项（如中央凹容量上限）
     * @returns {Object} 结构化排布包 { fovealItems, peripheralItems, sandwichRecap, arrangedFacts }
     */
    function arrangeRetinalAttention(facts = [], context = {}, options = {}) {
        if (!Array.isArray(facts) || facts.length === 0) {
            return {
                fovealItems: [],
                peripheralItems: [],
                sandwichRecap: '',
                arrangedFacts: []
            };
        }

        const maxFoveal = Math.max(1, Math.min(5, Number(options.maxFoveal) || 2));
        
        // 1. 评分并划分视区
        const scoredFacts = facts.map(f => {
            const saliency = computeSaliencyScore(f, context);
            return {
                raw: f,
                saliency,
                zone: saliency >= 0.75 ? ZONE_TYPES.FOVEAL 
                    : saliency >= 0.5 ? ZONE_TYPES.PARAFOVEAL 
                    : ZONE_TYPES.PERIPHERAL
            };
        });

        // 2. 按显著性降序
        scoredFacts.sort((a, b) => b.saliency - a.saliency);

        const foveal = scoredFacts.slice(0, maxFoveal);
        const remaining = scoredFacts.slice(maxFoveal);

        // 3. 构造三明治尾部极简回响插桩（Sandwich Recapitulation）
        let recapText = '';
        if (foveal.length > 0) {
            const bulletPoints = foveal.map(item => {
                const text = String(item.raw.content || item.raw.text || '').trim();
                const shortCore = text.length > 28 ? text.slice(0, 28) + '…' : text;
                return `· [焦点聚焦] ${shortCore}`;
            }).join('\n');
            recapText = `【当前注意力最高优先级回响】：\n${bulletPoints}`;
        }

        // 4. 重排组合：将中央凹放置在顶部与核心位置，周边放置在中间
        const arrangedFacts = [
            ...foveal.map(item => ({ ...item.raw, _retinalZone: ZONE_TYPES.FOVEAL, _saliency: item.saliency })),
            ...remaining.map(item => ({ ...item.raw, _retinalZone: item.zone, _saliency: item.saliency }))
        ];

        return {
            fovealItems: foveal.map(x => x.raw),
            peripheralItems: remaining.map(x => x.raw),
            sandwichRecap: recapText,
            arrangedFacts
        };
    }

    return {
        ZONE_TYPES,
        computeSaliencyScore,
        arrangeRetinalAttention
    };
}));