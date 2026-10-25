/* ============================================================
 * life-epilogue-retrospective-synthesizer.js — [L11-X8 · 第十一期前沿拓展机制]
 * 终局回望与全景岁月史诗结晶器 (Life-Epilogue Retrospective Synthesizer)
 * ------------------------------------------------------------
 * 【核心设计】
 *   赋予长篇故事在达成结局或重大篇章收官时的【终局史诗回望与文学结晶】：
 *   1. 跨时代人生脉络提炼（Life Epoch Synthesis）：
 *      从数百轮的历史事件中，自动筛选出：起点、重大转折、至暗时刻、高光抉择与最终归宿；
 *   2. 史诗回望体裁渲染（Epilogue Belletristic Rendering）：
 *      支持「个人第一人称晚年回忆录」、「后世正史列传档案」与「墓碑叹咏铭文」三种文学规格；
 *   3. 永恒封卷回执：将全篇羁绊熔铸为不朽的文学句号。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaEpilogueSynthesizer = factory();
        root.LifeEpilogueRetrospectiveSynthesizer = root.LonShaEpilogueSynthesizer;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const EPILOGUE_GENRES = Object.freeze({
        MEMOIR: 'memoir',       // 晚年第一人称回忆录
        HISTORICAL: 'historical', // 后世史官列传
        EPITAPH: 'epitaph'      // 诗性铭文 / 墓碑挽歌
    });

    /**
     * 编排终局岁月史诗回望长卷
     * @param {Object} actorSummary - 角色终局信息 { name, title, finalStance }
     * @param {Array} lifeTurningPoints - 人生关键转折点列表
     * @param {string} genre - 文学体裁 (memoir / historical / epitaph)
     * @returns {Object} 史诗回望结晶包
     */
    function composeLifeEpilogue(actorSummary = {}, lifeTurningPoints = [], genre = EPILOGUE_GENRES.MEMOIR) {
        const name = actorSummary.name || '无名旅人';
        const title = actorSummary.title || '长夜守望者';

        const points = Array.isArray(lifeTurningPoints) ? lifeTurningPoints : [];
        const turningExcerpts = points.slice(0, 4).map(p => `· ${p.title || p.kind}：${p.summary || p.content || ''}`);

        let epilogueText = '';

        if (genre === EPILOGUE_GENRES.MEMOIR) {
            epilogueText = `【终局回忆录·晚年自白】\n我常常在炉火将熄的深夜，想起很久以前的那些人和事。\n从最初的懵懂，到历经风雨后的诀别与坚守：\n${turningExcerpts.join('\n')}\n这一路上有太多遗憾，但若重来一次，我大抵依然会做出同样的选择。`;
        } else if (genre === EPILOGUE_GENRES.HISTORICAL) {
            epilogueText = `【青史列传·卷末赞曰】\n《后世书·${name}传》记载：${name}，世称“${title}”。其生逢乱世，屡蹈险境：\n${turningExcerpts.join('\n')}\n史官论曰：成败利钝，皆付青史；其风骨卓然，千载犹存。`;
        } else {
            epilogueText = `【终章碑铭·永恒长眠】\n“这里长眠着 [${name}]。\n他曾经历长夜与烈火，也曾拥抱过最耀眼的星光。\n岁月剥落了他的名字，但大地永远铭记他的足迹。”`;
        }

        return {
            actorName: name,
            genre,
            turningPointsCount: points.length,
            epilogueText,
            composedAt: Date.now()
        };
    }

    return {
        EPILOGUE_GENRES,
        composeLifeEpilogue
    };
}));