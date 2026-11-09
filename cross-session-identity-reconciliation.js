/* ============================================================
 * cross-session-identity-reconciliation.js — [v3.461.0 · 第十八期全新生产基座]
 * 跨话题多角色实体身份自动对齐与消歧中枢 (Cross-Session Identity Reconciliation)
 * ------------------------------------------------------------
 * 【核心机制与知识图谱对齐】
 * 解决切换话题、使用昵称、化名、易容时记忆实体分裂的痛点：
 *   构建全局实体标识池 (Canonical Entity Pool)。
 *   将 "阿强"、"林警官"、"幽灵 (代号)" 映射到唯一的 `entity_007` 底层标识符，
 *   在跨话题检索时自动聚合所有别名关联的历史记忆，杜绝信息孤岛。
 * ============================================================ */

class CrossSessionIdentityReconciliation {
    constructor(options = {}) {
        this.options = Object.assign({
            confidenceMergeThreshold: 0.8
        }, options);
        this.canonicalEntities = new Map(); // entityId -> { id, canonicalName, aliases: Set, attributes: {} }
        this.aliasIndex = new Map();        // aliasLower -> entityId
    }

    registerCanonicalEntity(entityId, canonicalName, initialAliases = []) {
        const id = entityId || ("ent_" + Date.now());
        const aliases = new Set([canonicalName.toLowerCase(), ...initialAliases.map(a => a.toLowerCase())]);
        
        const entity = {
            id,
            canonicalName,
            aliases,
            attributes: {}
        };

        this.canonicalEntities.set(id, entity);
        for (const a of aliases) {
            this.aliasIndex.set(a, id);
        }
        return entity;
    }

    addAlias(entityId, newAlias) {
        if (!this.canonicalEntities.has(entityId) || !newAlias) return false;
        const entity = this.canonicalEntities.get(entityId);
        const lower = newAlias.toLowerCase();
        entity.aliases.add(lower);
        this.aliasIndex.set(lower, entityId);
        return true;
    }

    /**
     * 根据输入文本中的任意指称，解析对齐到标准实体
     */
    resolveMention(mention = "") {
        if (!mention) return null;
        const lower = mention.toLowerCase().trim();
        const entityId = this.aliasIndex.get(lower);
        if (entityId && this.canonicalEntities.has(entityId)) {
            return this.canonicalEntities.get(entityId);
        }
        return null;
    }

    exportState() {
        const entities = [];
        for (const [id, e] of this.canonicalEntities.entries()) {
            entities.push([id, {
                id: e.id,
                canonicalName: e.canonicalName,
                aliases: Array.from(e.aliases),
                attributes: e.attributes
            }]);
        }
        return { entities };
    }

    hydrateState(state) {
        if (!state || !Array.isArray(state.entities)) return;
        this.canonicalEntities.clear();
        this.aliasIndex.clear();
        for (const [id, e] of state.entities) {
            const aliases = new Set(e.aliases || []);
            this.canonicalEntities.set(id, {
                id: e.id,
                canonicalName: e.canonicalName,
                aliases,
                attributes: e.attributes || {}
            });
            for (const a of aliases) {
                this.aliasIndex.set(a, id);
            }
        }
    }
}

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
                root.CrossSessionIdentityReconciliation = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    return CrossSessionIdentityReconciliation;
}));
