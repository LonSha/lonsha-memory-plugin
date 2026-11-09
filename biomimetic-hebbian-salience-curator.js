/* ============================================================
 * biomimetic-hebbian-salience-curator.js — 仿生Hebbian遗忘曲线与情感显著度自适应阻尼
 * [v3.461.0 · 神经突触可塑性与承诺心锚终身驻留]
 * ============================================================ */

class BiomimeticHebbianSalienceCurator {
    constructor(options = {}) {
        this.options = Object.assign({
            baseDecayRate: 0.04,
            hebbianBoostFactor: 1.25,
            maxSalienceCap: 3.0,
            minSalienceFloor: 0.02,
            covenantPermanentFloor: 0.85
        }, options);
        
        this.nodes = new Map(); // id -> { id, salience, accessCount, isCoreCovenant, lastAccessed, emotionalShockTag }
        this.synapticEdges = new Map(); // `${idA}-${idB}` -> weight
    }

    registerNode(id, initialSalience = 1.0, isCoreCovenant = false, emotionalShockTag = null) {
        if (!id) return false;
        this.nodes.set(id, {
            id,
            salience: Math.min(this.options.maxSalienceCap, Math.max(0.1, Number(initialSalience) || 1.0)),
            accessCount: 1,
            isCoreCovenant: Boolean(isCoreCovenant),
            emotionalShockTag: emotionalShockTag || null,
            lastAccessed: Date.now()
        });
        return true;
    }

    reinforceHebbianCoActivation(idA, idB) {
        const nodeA = this.nodes.get(idA);
        const nodeB = this.nodes.get(idB);
        if (!nodeA || !nodeB) return false;

        // 突触增强
        const edgeKey = idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
        const curEdge = this.synapticEdges.get(edgeKey) || 0.2;
        this.synapticEdges.set(edgeKey, Math.min(2.0, curEdge * 1.35));

        for (const node of [nodeA, nodeB]) {
            node.accessCount += 1;
            node.salience = Math.min(this.options.maxSalienceCap, node.salience * this.options.hebbianBoostFactor);
            node.lastAccessed = Date.now();
        }
        return true;
    }

    stepDecay(deltaHours = 1) {
        const hours = Math.max(0.1, Number(deltaHours) || 1);
        for (const [id, node] of this.nodes.entries()) {
            if (node.isCoreCovenant) {
                // 核心誓约免死金牌，终生保持高位
                node.salience = Math.max(this.options.covenantPermanentFloor, node.salience);
                continue;
            }
            
            // 访问越多，衰减阻尼越大（分母抗遗忘）
            const damping = Math.sqrt(node.accessCount);
            const decay = (this.options.baseDecayRate * hours) / damping;
            node.salience = Math.max(this.options.minSalienceFloor, Number((node.salience - decay).toFixed(3)));
        }
    }

    getActiveSalientNodes(threshold = 0.35) {
        const result = [];
        for (const [id, node] of this.nodes.entries()) {
            if (node.isCoreCovenant || node.salience >= threshold) {
                result.push({ ...node });
            }
        }
        return result.sort((a, b) => b.salience - a.salience);
    }

    exportState() {
        return {
            nodes: Array.from(this.nodes.entries()),
            synapticEdges: Array.from(this.synapticEdges.entries())
        };
    }

    hydrateState(state) {
        if (!state) return;
        if (Array.isArray(state.nodes)) this.nodes = new Map(state.nodes);
        if (Array.isArray(state.synapticEdges)) this.synapticEdges = new Map(state.synapticEdges);
    }
}
if (typeof globalThis !== "undefined") { globalThis.BiomimeticHebbianSalienceCurator = BiomimeticHebbianSalienceCurator; }
if (typeof window !== "undefined") { window.BiomimeticHebbianSalienceCurator = BiomimeticHebbianSalienceCurator; }
if (typeof module !== "undefined" && module.exports) { module.exports = BiomimeticHebbianSalienceCurator; }

/* ============================================================
 * [v3.461.0 接线修复] 本文件此前是 ESM 形态（export …），而宿主 extra_js、
 * 审计沙箱与 optional-engine-registry 的 require 全部按经典脚本加载 ——
 * `export` 在那里直接是语法错误，模块在真机上从未挂载成功。
 * 改回本仓统一的 UMD/IIFE 注册形态（同 ego-defense-mechanisms-engine.js）：
 * CJS 侧保留 module.exports 供测试与注册表的 require 使用，
 * 经典脚本侧把引擎类挂到全局，让取库口与编排器真的取得到。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
                root.BiomimeticHebbianSalienceCurator = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    return BiomimeticHebbianSalienceCurator;
}));
