/* ============================================================
 * epochal-heritage-cultural-drift.js — [L10-X9 · 第十期全量创新]
 * 时代演进与文化印记沉淀（Epochal Heritage & Cultural Drift）
 * ------------------------------------------------------------
 * 【核心设计】
 *   解决超长线跨卷、跨年代互动中世界观质感单薄的问题：
 *   当故事跨入新纪元或发生历史大转折时，旧事实不再仅作为散乱个人记忆，
 *   而是凝练结晶为「时代常识、旧俗禁忌与文化回响」：
 *   1. 时代跃迁封卷（Epoch Crystalization）：
 *      将过往纪元的微观琐事提炼为文化沉淀（Cultural Relics / Folklores）；
 *   2. 时代禁忌与习俗漂移（Taboo & Custom Drift）：
 *      曾经习以为常的举动在时代变迁后演化为新一代的禁忌或崇拜对象；
 *   3. 时代底色注入（Epochal Background Injection）：
 *      向模型提示词提供宏大世界观沉淀背景。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaEpochalHeritage = factory();
    root.EpochalHeritageCulturalDrift = root.LonShaEpochalHeritage;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * 创建一个时代纪元定义
     */
    function defineEpoch(epoch = {}) {
        return {
            id: epoch.id || `epoch_${Date.now()}`,
            name: String(epoch.name || '旧纪元').trim(),
            startFloor: Number.isFinite(epoch.startFloor) ? epoch.startFloor : 0,
            endFloor: Number.isFinite(epoch.endFloor) ? epoch.endFloor : 500,
            coreEthos: String(epoch.coreEthos || '').trim(), // 时代精神
            status: 'active', // active | archived
            crystallizedRelics: [], // 结晶出的文化常识
            taboos: [] // 时代禁忌
        };
    }

    /**
     * 时代封卷与文化结晶：将一批旧时代事实提炼为时代文化印记
     * @param {Object} epoch - 时代定义
     * @param {Array} pastFacts - 旧时代的代表性事实
     * @param {Object} options - 提炼参数
     * @returns {Object} 封卷后的时代对象
     */
    function crystallizeEpochHeritage(epoch = {}, pastFacts = [], options = {}) {
        const facts = Array.isArray(pastFacts) ? pastFacts : [];
        const relics = facts.map((f, idx) => {
            const content = String(f.content || f.text || '');
            return {
                id: `relic_${epoch.id}_${idx}`,
                title: f.title || `前朝旧事·其${idx + 1}`,
                crystallizedLore: `【${epoch.name}遗风】：在那个${epoch.coreEthos || '动荡的时代'}，世人曾亲历“${content}”，后世已将其视作古老传说。`,
                historicalFactId: f.id || null
            };
        });

        const taboos = Array.isArray(options.newTaboos) ? options.newTaboos.map(t => String(t).trim()) : [];

        return {
            ...epoch,
            status: 'archived',
            crystallizedRelics: relics,
            taboos,
            archivedAt: Date.now()
        };
    }

    /**
     * 生成当前时代的世界观文化底色提示词
     * @param {Object} currentEpoch - 当前所处的新时代
     * @param {Array} historicalEpochs - 过去沉淀的旧时代列表
     * @returns {string} 注入提示词块
     */
    function buildEpochalContextPrompt(currentEpoch = {}, historicalEpochs = []) {
        const sections = [];
        sections.push(`[时代背景与世界常识]`);
        sections.push(`当前纪元：【${currentEpoch.name || '现世'}】（主流风尚：${currentEpoch.coreEthos || '秩序与繁荣'}）`);

        if (Array.isArray(historicalEpochs) && historicalEpochs.length > 0) {
            sections.push(`历史沉淀与旧俗禁忌：`);
            for (const ep of historicalEpochs) {
                if (ep.taboos && ep.taboos.length > 0) {
                    sections.push(`  · 来自【${ep.name}】的禁忌警示：${ep.taboos.join('；')}`);
                }
                if (ep.crystallizedRelics && ep.crystallizedRelics.length > 0) {
                    const sample = ep.crystallizedRelics.slice(0, 2).map(r => r.crystallizedLore).join('\n  ');
                    sections.push(`  ${sample}`);
                }
            }
        }

        return sections.join('\n');
    }

    return Object.freeze({
        defineEpoch,
        crystallizeEpochHeritage,
        buildEpochalContextPrompt
    });
}));