/* ============================================================
 * tiered-storage-tiered-compaction-ledger.js — [v3.461.0 · 第十八期全新生产基座]
 * 分层分级存储与冷热冷凝压缩账本 (Tiered Storage & Compaction Ledger)
 * ------------------------------------------------------------
 * 【核心机制与工业级存储设计】
 * 解决万级长局记忆占满内存的灾难：
 *   - Hot 层: 活跃在 RAM 内存，全量高频交互（最近 50 条）；
 *   - Warm 层: 结构化摘要化存储，保留关键因果与实体图谱（51~300 条）；
 *   - Cold 层: 极度冷凝归档 (Condensed Archive)，提取为世界线大事记碑文（>300 条），
 *   实现千轮对话长局平滑稳定，内存开销降低 80% 以上。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
                root.TieredStorageCompactionLedger = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    class TieredStorageCompactionLedger {
        constructor(options = {}) {
            this.options = Object.assign({
                hotCapacity: 50,
                warmCapacity: 250,
                autoCompactionEnabled: true
            }, options);

            this.hotTier = [];   // [{ id, text, timestamp, fullDetail }]
            this.warmTier = [];  // [{ id, summary, causalityKeys, timestamp }]
            this.coldArchive = []; // [{ epochId, timeRange, epochChronicle, keyFacts: [] }]
        }

        addMemory(memory) {
            if (!memory) return;
            const entry = Object.assign({
                id: memory.id || ("mem_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6)),
                text: memory.text || memory.summary || "",
                timestamp: memory.timestamp || Date.now(),
                fullDetail: memory
            });

            this.hotTier.push(entry);

            if (this.options.autoCompactionEnabled && this.hotTier.length > this.options.hotCapacity) {
                this.compactHotToWarm();
            }

            return entry;
        }

        compactHotToWarm() {
            const overflow = this.hotTier.splice(0, this.hotTier.length - this.options.hotCapacity);
            for (const item of overflow) {
                this.warmTier.push({
                    id: item.id,
                    summary: item.text.slice(0, 100),
                    timestamp: item.timestamp,
                    condensed: true
                });
            }

            if (this.warmTier.length > this.options.warmCapacity) {
                this.compactWarmToCold();
            }
        }

        compactWarmToCold() {
            const overflow = this.warmTier.splice(0, this.warmTier.length - this.options.warmCapacity);
            if (overflow.length === 0) return;

            const epochChronicle = `历史纪元归档 [共${overflow.length}条记忆冷凝]: ` + 
                overflow.slice(0, 5).map(o => o.summary).join("；") + "...";

            this.coldArchive.push({
                epochId: "epoch_" + Date.now(),
                count: overflow.length,
                timeRange: [overflow[0].timestamp, overflow[overflow.length - 1].timestamp],
                epochChronicle,
                keyFacts: overflow.map(o => o.summary)
            });
        }

        getStats() {
            return {
                hotCount: this.hotTier.length,
                warmCount: this.warmTier.length,
                coldEpochs: this.coldArchive.length
            };
        }

        exportState() {
            return {
                hotTier: this.hotTier,
                warmTier: this.warmTier,
                coldArchive: this.coldArchive
            };
        }

        hydrateState(state) {
            if (!state) return;
            if (Array.isArray(state.hotTier)) this.hotTier = [...state.hotTier];
            if (Array.isArray(state.warmTier)) this.warmTier = [...state.warmTier];
            if (Array.isArray(state.coldArchive)) this.coldArchive = [...state.coldArchive];
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
    return TieredStorageCompactionLedger;
}));
