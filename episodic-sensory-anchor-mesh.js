/* ============================================================
 * episodic-sensory-anchor-mesh.js — [L11-O4 · 第十一期认知架构优化]
 * 情境感官记忆与微观应激共振网 (Episodic Sensory Anchor & Resonance Mesh)
 * ------------------------------------------------------------
 * 【核心设计】
 *   打破传统记忆系统仅记录「干瘪概念/命题」的缺陷，捕获人类记忆最深处的【感官烙印】：
 *   1. 五感残差抽取（嗅觉/听觉/触觉/视觉质感/味觉）：
 *      雨水腥气、齿轮钟鸣、冰冷枪口、粗糙针织物、苦涩茶汤；
 *   2. 潜意识应激共振（Subconscious Sensory Resonance）：
 *      当当前场景描写中出现匹配的感官线索时，哪怕未命中任何角色/实体名字，
 *      也能瞬间唤起底层的情绪残影与生理反应（心悸、失神、颤抖、呼吸一窒）。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaSensoryMesh = factory();
        root.EpisodicSensoryAnchorMesh = root.LonShaSensoryMesh;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SENSORY_MODALITIES = Object.freeze({
        OLFACTORY: 'olfactory', // 嗅觉（硝烟、雨水、消毒水、铁锈）
        AUDITORY: 'auditory',   // 听觉（雷声、心跳、脚步声、特定钟摆）
        TACTILE: 'tactile',     // 触觉（冰冷、粗糙、灼烧、颤抖）
        VISUAL_DETAIL: 'visual_detail', // 视觉质感（逆光阴影、破碎反光）
        GUSTATORY: 'gustatory'  // 味觉（苦涩、甜腻、血腥气）
    });

    /**
     * 从情境文本或事件中提取感官锚点
     * @param {Object} event - 事件或情境输入
     * @returns {Array} 感官锚点列表
     */
    function extractSensoryAnchors(event = {}) {
        const text = String(event.content || event.text || '').trim();
        if (!text) return [];

        const anchors = [];

        // 嗅觉捕获模式
        const olfactoryMatch = text.match(/(硝烟|铁锈|消毒水|雨水|冷冽|潮湿|血腥味|焦糊|香水|烟草|草木)/g);
        if (olfactoryMatch) {
            anchors.push({
                modality: SENSORY_MODALITIES.OLFACTORY,
                cues: Array.from(new Set(olfactoryMatch)),
                weight: 0.8
            });
        }

        // 听觉捕获模式
        const auditoryMatch = text.match(/(雷鸣|脚步声|滴答|钟声|耳鸣|枪响|喘息|关门声|哭泣声)/g);
        if (auditoryMatch) {
            anchors.push({
                modality: SENSORY_MODALITIES.AUDITORY,
                cues: Array.from(new Set(auditoryMatch)),
                weight: 0.85
            });
        }

        // 触觉捕获模式
        const tactileMatch = text.match(/(冰冷|灼热|粗糙|颤抖|冷汗|滚烫|刺骨|窒息|发麻)/g);
        if (tactileMatch) {
            anchors.push({
                modality: SENSORY_MODALITIES.TACTILE,
                cues: Array.from(new Set(tactileMatch)),
                weight: 0.9
            });
        }

        return anchors;
    }

    /**
     * 场景氛围与感官记忆库进行潜意识共振计算
     * @param {string} sceneDescription - 当前场景的氛围/环境描写
     * @param {Array} sensoryMemoryBank - 已积累的感官锚点记忆条目
     * @returns {Object} 共振结果 { resonated, triggerCues, somaticResponsePrompt }
     */
    function resonateSensoryCues(sceneDescription = '', sensoryMemoryBank = []) {
        const desc = String(sceneDescription || '');
        if (!desc || !Array.isArray(sensoryMemoryBank) || sensoryMemoryBank.length === 0) {
            return {
                resonated: false,
                triggerCues: [],
                somaticResponsePrompt: ''
            };
        }

        const hits = [];

        for (const memory of sensoryMemoryBank) {
            const anchors = memory.sensoryAnchors || extractSensoryAnchors(memory);
            for (const a of anchors) {
                for (const cue of a.cues) {
                    if (desc.includes(cue)) {
                        hits.push({
                            cue,
                            modality: a.modality,
                            originMemory: memory
                        });
                    }
                }
            }
        }

        if (hits.length === 0) {
            return {
                resonated: false,
                triggerCues: [],
                somaticResponsePrompt: ''
            };
        }

        const uniqueCues = Array.from(new Set(hits.map(h => h.cue)));
        
        // 构造潜意识生理本能指导提示词
        const prompt = `【感官潜意识共振】：当前场景的感官线索 [${uniqueCues.join('、')}] 触发了角色深层的身体记忆。即便理智尚未反应过来，角色的身体本能已产生隐性微反应（例如指尖微蜷、心跳微滞或视线瞬间下意识回避）。`;

        return {
            resonated: true,
            triggerCues: uniqueCues,
            somaticResponsePrompt: prompt,
            hitDetails: hits
        };
    }

    return {
        SENSORY_MODALITIES,
        extractSensoryAnchors,
        resonateSensoryCues
    };
}));