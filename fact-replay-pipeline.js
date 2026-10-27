/**
 * fact-replay-pipeline.js - 单一事实千事重放管线 (Fact Replay Pipeline)
 * 
 * 机制借鉴与超越：
 * 吸收千千结 (ST-MyriadKnots v0.9.4) 千事后端的单一事实真源（Single Source of Truth）原则。
 * 决不单独维护第二份全局事实关系账本；每个楼层记忆仅保存自身原子的增量事件与关系片段，
 * 整体叙事因果图纯粹由当前有效/可达楼层流式重放生成。
 * 严格支持单事件标记删除过滤、人工整线状态覆盖与断链防御。
 */

/* 单次装载包装（[v3.421.0] 修）：本文件在宿主页是按 extra_js 逐个 eval 的经典脚本，
 *   顶层 `class`/`const` 落在同一个脚本作用域里；同一页重复加载一次就会 `Identifier ...
 *   has already been declared`。故与仓内既有模块同形，收进 IIFE。
 *   导出仍是双通道：IIFE 内 `module.exports` 供 tests 具名 import，`root.*` 供宿主消费。 */
(function (root) {
'use strict';
class FactReplayPipeline {
    constructor() {}

    /**
     * 流式重放一组楼层增量并构建整体事件因果拓扑
     * @param {Object} params
     * @param {Array} params.floorDeltas - 楼层增量数组 [{ floorId, events: [], relations: [], deletedEventIds: [] }]
     * @param {Object} params.manualOverrides - 人工覆盖配置 { manualMatterStatus: {}, manualEvents: {} }
     * @returns {Object} 重放生成的事件拓扑快照
     */
    replayGraph({ floorDeltas = [], manualOverrides = {} }) {
        const eventsMap = new Map();
        const relations = [];
        const deletedIds = new Set();
        const mattersMap = new Map();

        // 第一遍：收集所有被删除的事件 ID
        for (const delta of floorDeltas) {
            (delta.deletedEventIds || []).forEach(id => deletedIds.add(id));
        }

        // 第二遍：收集有效事件与事项
        for (const delta of floorDeltas) {
            for (const ev of (delta.events || [])) {
                if (deletedIds.has(ev.id)) {
                    continue; // 彻底剔除已删事件
                }

                // 合并人工事件级覆盖
                const manualEv = (manualOverrides.manualEvents || {})[ev.id] || {};
                const finalizedEvent = {
                    ...ev,
                    ...manualEv,
                    sourceFloorId: delta.floorId
                };

                eventsMap.set(ev.id, finalizedEvent);

                // 归集事项
                if (finalizedEvent.matterId) {
                    let matter = mattersMap.get(finalizedEvent.matterId);
                    if (!matter) {
                        matter = {
                            matterId: finalizedEvent.matterId,
                            title: finalizedEvent.title,
                            status: finalizedEvent.status || 'inProgress',
                            eventIds: [],
                            involvedPeople: new Set()
                        };
                        mattersMap.set(finalizedEvent.matterId, matter);
                    }
                    matter.eventIds.push(finalizedEvent.id);
                    (finalizedEvent.people || []).forEach(p => matter.involvedPeople.add(p));
                    // 推进事项状态
                    if (finalizedEvent.status) {
                        matter.status = finalizedEvent.status;
                    }
                }
            }
        }

        // 第三遍：收集两端均有效的关系
        for (const delta of floorDeltas) {
            for (const rel of (delta.relations || [])) {
                if (eventsMap.has(rel.fromEventId) && eventsMap.has(rel.toEventId)) {
                    relations.push(rel);
                }
            }
        }

        // 应用整线事项状态人工覆盖
        for (const [matterId, manualStatus] of Object.entries(manualOverrides.manualMatterStatus || {})) {
            if (mattersMap.has(matterId)) {
                mattersMap.get(matterId).status = manualStatus;
                mattersMap.get(matterId).isManuallyOverridden = true;
            }
        }

        return {
            totalValidEvents: eventsMap.size,
            totalRelations: relations.length,
            events: Array.from(eventsMap.values()),
            matters: Array.from(mattersMap.values()).map(m => ({
                ...m,
                involvedPeople: Array.from(m.involvedPeople)
            })),
            relations
        };
    }
}

root.LonShaFactReplayPipeline = { FactReplayPipeline };
if (typeof module !== 'undefined' && module.exports) module.exports = { FactReplayPipeline };
})(typeof globalThis !== 'undefined' ? globalThis : window);
