/* ============================================================
 * micro-atmosphere-residual-tracker.js — [L10-X1 · 第十期全量创新]
 * 情感微观氛围残差追踪器（Micro-Atmosphere Residual Tracker）
 * ------------------------------------------------------------
 * 【核心设计】
 *   打破传统记忆系统「仅记录干瘪客观事实」的局限：
 *   在记录关键事实/剧情转折时，提取并附着 40 字以内的【氛围残差（Atmospheric Residual）】，
 *   包含：眼神动态、语气轻重、身体停顿距离与微表情。
 *   当该事实被多路召回时，微观氛围残差会作为【质感联想载荷】一同注入提示词，
 *   使大模型在 300+ 轮后的长跑中，依然能重现当初互动时的微观情感张力与拉扯感。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaMicroAtmosphere = factory();
    root.MicroAtmosphereResidualTracker = root.LonShaMicroAtmosphere;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const TENSION_POLARITY = Object.freeze({
        AMBIGUOUS: 'ambiguous',       // 暧昧拉扯 / 欲言又止
        CONFRONTATIONAL: 'confrontational', // 隐忍对峙 / 剑拔弩张
        VULNERABLE: 'vulnerable',     // 脆弱袒露 / 寻求慰藉
        DEFENSIVE: 'defensive',       // 疏离防备 / 刻意客套
        WARM_INTIMATE: 'warm_intimate' // 默契温存 / 毫无防线
    });

    const MAX_RESIDUAL_CHARS = 48; // 严格限制残差字数，防占用记忆注入预算

    /**
     * 规范化并提取微观氛围残差
     * @param {Object} input - 包含 text, polarity, actors, intensity 等
     * @returns {Object} 氛围残差条目
     */
    function captureResidual(input = {}) {
        const rawText = String(input.text || input.residual || '').trim();
        // 自动裁剪到 MAX_RESIDUAL_CHARS 并保持语义完整
        const text = rawText.length > MAX_RESIDUAL_CHARS ? rawText.slice(0, MAX_RESIDUAL_CHARS) + '…' : rawText;
        const polarity = Object.values(TENSION_POLARITY).includes(input.polarity) 
            ? input.polarity 
            : TENSION_POLARITY.AMBIGUOUS;
        
        const intensity = Math.max(0.1, Math.min(1.0, Number(input.intensity) || 0.5));
        const actors = Array.isArray(input.actors) ? input.actors.filter(Boolean) : [];

        return {
            id: input.id || `res_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            factId: input.factId || null,
            text,
            polarity,
            intensity,
            actors,
            floor: Number.isFinite(input.floor) ? input.floor : null,
            recordedAt: Date.now()
        };
    }

    /**
     * 将微观氛围残差融入事实召回流
     * @param {Array} facts - 已召回的事实列表
     * @param {Array} residuals - 候选残差库
     * @param {Object} options - 过滤选项（如当前在场角色）
     * @returns {Array} 融合后的增强事实列表
     */
    function attachAtmosphereToRecall(facts = [], residuals = [], options = {}) {
        if (!Array.isArray(facts)) return [];
        if (!Array.isArray(residuals) || residuals.length === 0) return facts.slice();

        const activeActors = new Set(Array.isArray(options.actors) ? options.actors : []);
        // 构建 factId -> residual 映射
        const resMap = new Map();
        for (const res of residuals) {
            if (res && res.factId) {
                // 如果指定了当前在场角色，优先匹配包含该角色的残差
                if (activeActors.size > 0 && res.actors && res.actors.length > 0) {
                    const match = res.actors.some(a => activeActors.has(a));
                    if (!match) continue;
                }
                resMap.set(res.factId, res);
            }
        }

        return facts.map(fact => {
            const fid = fact.id || fact.factId;
            const res = fid ? resMap.get(fid) : null;
            if (!res) return { ...fact };

            return {
                ...fact,
                atmosphereResidual: {
                    polarity: res.polarity,
                    intensity: res.intensity,
                    sensoryCue: res.text
                },
                // 增加提示词微光引导文本
                promptCue: `（当时氛围：${res.text}）`
            };
        });
    }

    /**
     * 衰减与演化：随轮数推进，微观氛围强度平滑衰减，但张力极性保留
     * @param {Object} residual
     * @param {number} currentFloor
     * @returns {Object} 衰减后的残差
     */
    function decayResidual(residual, currentFloor) {
        if (!residual) return null;
        if (!Number.isFinite(residual.floor) || !Number.isFinite(currentFloor)) {
            return { ...residual };
        }
        const delta = Math.max(0, currentFloor - residual.floor);
        // 每过 50 楼衰减 15%，最低保留 0.25 基础情感烙印
        const decayFactor = Math.pow(0.85, delta / 50);
        const newIntensity = Math.max(0.25, Number((residual.intensity * decayFactor).toFixed(3)));

        return {
            ...residual,
            intensity: newIntensity,
            isFaded: newIntensity <= 0.3
        };
    }

    return Object.freeze({
        TENSION_POLARITY,
        MAX_RESIDUAL_CHARS,
        captureResidual,
        attachAtmosphereToRecall,
        decayResidual
    });
}));
