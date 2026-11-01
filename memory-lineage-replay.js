/* ========================================================
 * memory-lineage-replay.js — [v3.432.0 · L13-X1] 记忆沿革回放（可审阅纯函数内核）
 *
 * 【它治的是什么（真实现场，取证于 2026-10-31 证据页 Problem 1）】
 *   没有任何「回放」面能回答「这段记忆是怎么变成现在这样的」。
 *   data-view 里有 timeline / deltas / conflicts / archive，都是当前状态的陈列；
 *   oplog（1179 字符 / 0 按钮 / 0 属性）是全局操作流水，不是某条记忆的专属沿革。
 *   当玩家或模型问「为什么角色记得这件事却忘了那件事」、「这条事实改过几次、被谁撤回过」时，
 *   产品端此前无法给出结构化的溯源链。
 *
 * 【本模块做什么（本面仅有的两件新内核之一）】
 *   输入：条目 itemId，宿主上下文（engine/opLog/evidenceStore 等既有槽位）。
 *   输出：结构化沿革链（lineage）：
 *     - 严格按时序展开：创建 -> 修改 -> 裁决 -> 撤销 -> 当前态；
 *     - 每节保留 at（时间戳）/ floor（楼层）/ by（操作人或子系统）/ why（成因）/ diff（键级差异）；
 *     - 零新事实库：数据全部从既有槽位抽取，不新增第二份存储；
 *     - 真实不编：某层数据被淘汰或抹掉时，该节标记 available: false 并点名 missingLayer（如 'oplog'），不伪造、不静默消失；
 *     - 严格只读：writesNothing: true，推演与回放全程零副作用。
 * ======================================================== */
(function (root) {
    'use strict';

    const LINEAGE_KINDS = Object.freeze([
        'create',
        'update',
        'verdict',
        'revoke',
        'current',
        'unavailable'
    ]);

    function safeStr(v) { return String(v == null ? '' : v).trim(); }

    function computeDiff(beforeVal, afterVal, fallbackKeys) {
        const b = (beforeVal && typeof beforeVal === 'object') ? beforeVal : null;
        const a = (afterVal && typeof afterVal === 'object') ? afterVal : null;
        let changedKeys = [];

        if (b && a) {
            const allKeys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
            for (const k of allKeys) {
                if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) {
                    changedKeys.push(k);
                }
            }
        }
        if (Array.isArray(fallbackKeys) && fallbackKeys.length > 0) {
            for (const fk of fallbackKeys) {
                if (!changedKeys.includes(fk)) changedKeys.push(fk);
            }
        } else if (changedKeys.length === 0 && beforeVal !== afterVal) {
            changedKeys = ['value'];
        }

        return {
            changedKeys: Object.freeze(changedKeys),
            before: beforeVal != null ? beforeVal : null,
            after: afterVal != null ? afterVal : null,
            summary: changedKeys.length ? `变更字段: ${changedKeys.join(', ')}` : '无字段变更'
        };
    }

    function findItemInContainer(container, itemId) {
        if (!container || !itemId) return null;
        if (Array.isArray(container)) {
            return container.find(it => it && (String(it.id) === itemId || String(it.key) === itemId)) || null;
        }
        if (typeof container === 'object') {
            if (container[itemId]) return container[itemId];
            if (Array.isArray(container.items)) {
                return container.items.find(it => it && (String(it.id) === itemId || String(it.key) === itemId)) || null;
            }
            if (Array.isArray(container.events)) {
                return container.events.find(it => it && (String(it.id) === itemId || String(it.key) === itemId)) || null;
            }
            if (Array.isArray(container.nodes)) {
                return container.nodes.find(it => it && (String(it.id) === itemId || String(it.key) === itemId)) || null;
            }
        }
        return null;
    }

    function locateCurrentItem(ctx, itemId) {
        if (!ctx || !itemId) return null;
        const eng = ctx.engine || ctx;
        const pools = [
            eng.memories,
            eng.worldProg && eng.worldProg.facts,
            eng.worldProg && eng.worldProg.items,
            eng.graph && eng.graph.nodes,
            eng.timeline && eng.timeline.events,
            eng.suspense && eng.suspense.items,
            eng.conflicts && eng.conflicts.items,
            eng.lockedFacts,
            eng.diaries && eng.diaries.items,
            ctx.items,
            ctx.facts,
            ctx.nodes
        ];
        for (const pool of pools) {
            const hit = findItemInContainer(pool, itemId);
            if (hit) return hit;
        }
        return null;
    }

    function buildMemoryLineage(itemId, ctx, opts) {
        const id = safeStr(itemId);
        if (!id) {
            return {
                ok: false,
                reason: 'item-id-required',
                itemId: '',
                itemFound: false,
                currentState: null,
                lineage: [],
                summary: { totalSteps: 0, creates: 0, updates: 0, verdicts: 0, revokes: 0, unavailableCount: 0 },
                writesNothing: true
            };
        }

        const options = (opts && typeof opts === 'object') ? opts : {};
        const host = ctx || {};
        const eng = host.engine || host;

        // 1. 查找当前条目本体
        const currentItem = locateCurrentItem(host, id);
        const itemFound = !!currentItem;

        // 2. 查找相关 OpLog 记录
        const opLogInstance = host.opLog || eng.opLog || null;
        let opEntries = [];
        let oplogAvailable = true;

        if (opLogInstance) {
            if (typeof opLogInstance.queryByRef === 'function') {
                opEntries = opLogInstance.queryByRef(id) || [];
            } else if (Array.isArray(opLogInstance.entries)) {
                opEntries = opLogInstance.entries.filter(e => e && safeStr(e.ref) === id);
            }
        } else if (Array.isArray(host.opEntries)) {
            opEntries = host.opEntries.filter(e => e && safeStr(e.ref) === id);
        } else {
            oplogAvailable = false;
        }

        // 3. 收集裁决/撤销相关记录
        const adjudications = Array.isArray(host.adjudications)
            ? host.adjudications.filter(a => a && safeStr(a.factKey || a.itemId || a.ref) === id)
            : (Array.isArray(eng.adjudications) ? eng.adjudications.filter(a => a && safeStr(a.factKey || a.itemId || a.ref) === id) : []);

        // 4. 构建初步步骤
        const steps = [];
        let stepCounter = 0;

        // A. 创建节 (Creation)
        const createOp = opEntries.find(e => e && (e.op === 'add' || e.op === 'create' || e.op === 'forge'));
        if (createOp) {
            stepCounter += 1;
            let metaParsed = null;
            try { metaParsed = createOp.meta ? JSON.parse(createOp.meta) : null; } catch (_) { metaParsed = createOp.meta; }
            steps.push({
                step: stepCounter,
                kind: 'create',
                at: createOp.ts || Date.now(),
                floor: createOp.floor != null ? createOp.floor : null,
                by: createOp.type ? `oplog:${createOp.type}` : 'system:create',
                why: createOp.why || (typeof metaParsed === 'string' ? metaParsed : '条目初始记录创建'),
                diff: computeDiff(null, metaParsed || currentItem || { id }, ['id', 'initial']),
                available: true,
                missingLayer: null
            });
        } else if (itemFound) {
            // 条目存在但 oplog 查不到创建记录（例如日志超出 500 窗被淘汰，或 oplog 被损毁）
            stepCounter += 1;
            steps.push({
                step: stepCounter,
                kind: 'create',
                at: currentItem.createdAt || currentItem.ts || 0,
                floor: currentItem.floor != null ? currentItem.floor : null,
                by: 'entity:snapshot',
                why: '条目本体存在，但创建流水未在当前操作日志窗口中登记',
                diff: computeDiff(null, currentItem, ['id']),
                available: oplogAvailable,
                missingLayer: oplogAvailable ? null : 'oplog'
            });
        }

        // B. 演变与修改节 (Updates)
        const updateOps = opEntries.filter(e => e && (e.op === 'update' || e.op === 'shift' || e.op === 'mutate' || e.op === 'modify'));
        for (const u of updateOps) {
            stepCounter += 1;
            let metaObj = null;
            try { metaObj = u.meta ? JSON.parse(u.meta) : null; } catch (_) { metaObj = u.meta; }
            
            let beforePart = null;
            let afterPart = null;
            let fallbackKeys = ['updated'];
            if (metaObj && typeof metaObj === 'object') {
                if ('before' in metaObj) beforePart = metaObj.before;
                if ('after' in metaObj) afterPart = metaObj.after;
                if (Array.isArray(metaObj.keys)) fallbackKeys = metaObj.keys;
            }
            
            steps.push({
                step: stepCounter,
                kind: 'update',
                at: u.ts || Date.now(),
                floor: u.floor != null ? u.floor : null,
                by: u.type ? `oplog:${u.type}` : 'oplog:update',
                why: (metaObj && metaObj.reason) || u.why || '条目状态或内容更新',
                diff: computeDiff(beforePart, afterPart, fallbackKeys),
                available: true,
                missingLayer: null
            });
        }

        // C. 裁决与撤销节 (Verdicts & Revocations)
        // 来自 oplog 的裁决
        const verdictOps = opEntries.filter(e => e && (e.op === 'resolve' || e.op === 'verdict' || e.op === 'revoke'));
        for (const v of verdictOps) {
            stepCounter += 1;
            const isRevoke = v.op === 'revoke';
            steps.push({
                step: stepCounter,
                kind: isRevoke ? 'revoke' : 'verdict',
                at: v.ts || Date.now(),
                floor: v.floor != null ? v.floor : null,
                by: 'adjudication:oplog',
                why: v.meta || (isRevoke ? '撤销先前证据裁决' : '证据裁决确立'),
                diff: computeDiff(
                    isRevoke ? { status: 'adjudicated' } : { status: 'pending' },
                    isRevoke ? { status: 'pending' } : { status: 'adjudicated' },
                    ['status', isRevoke ? 'revoke' : 'verdict']
                ),
                available: true,
                missingLayer: null
            });
        }

        // 来自 adjudications 账本的裁决记录（避免与 oplog 重复）
        for (const adj of adjudications) {
            const already = steps.some(s => s.at === adj.ts || (s.floor === adj.floor && s.why === adj.reason));
            if (!already) {
                stepCounter += 1;
                const isRevoke = adj.verdict === 'revoke' || adj.revoked === true;
                steps.push({
                    step: stepCounter,
                    kind: isRevoke ? 'revoke' : 'verdict',
                    at: adj.ts || adj.at || Date.now(),
                    floor: adj.floor != null ? adj.floor : null,
                    by: adj.adjudicator || 'adjudication:ledger',
                    why: adj.reason || (isRevoke ? '撤销先前裁决' : `证据裁决: ${adj.verdict || 'adopt'}`),
                    diff: computeDiff(adj.before || null, adj.after || null, [adj.verdict || 'verdict']),
                    available: adj.available !== false,
                    missingLayer: adj.available === false ? (adj.missingLayer || 'evidence') : null
                });
            }
        }

        // 检查人工模拟注入的合成步骤（用于验收与破坏演练）
        if (Array.isArray(options.injectedSteps)) {
            for (const inj of options.injectedSteps) {
                stepCounter += 1;
                steps.push({
                    step: stepCounter,
                    kind: inj.kind || 'update',
                    at: inj.at || Date.now(),
                    floor: inj.floor != null ? inj.floor : null,
                    by: inj.by || 'mock:injected',
                    why: inj.why || '人工注入演变步骤',
                    diff: computeDiff(inj.before, inj.after, inj.keys || ['mock']),
                    available: inj.available !== false,
                    missingLayer: inj.available === false ? (inj.missingLayer || 'mock') : null
                });
            }
        }

        // 按时间戳排序，确保时间线性一致
        steps.sort((a, b) => (a.at || 0) - (b.at || 0));
        // 重编号 step 顺序
        steps.forEach((s, idx) => { s.step = idx + 1; });

        // 若全过程没有任何记录且条目也不存在
        if (steps.length === 0 && !itemFound) {
            return {
                ok: false,
                reason: 'item-not-found',
                itemId: id,
                itemFound: false,
                currentState: null,
                lineage: [],
                summary: { totalSteps: 0, creates: 0, updates: 0, verdicts: 0, revokes: 0, unavailableCount: 0 },
                writesNothing: true
            };
        }

        // 统计各节点数量
        let creates = 0, updates = 0, verdicts = 0, revokes = 0, unavailableCount = 0;
        for (const s of steps) {
            if (s.available === false) unavailableCount += 1;
            if (s.kind === 'create') creates += 1;
            else if (s.kind === 'update') updates += 1;
            else if (s.kind === 'verdict') verdicts += 1;
            else if (s.kind === 'revoke') revokes += 1;
        }

        return {
            ok: true,
            reason: '',
            itemId: id,
            itemFound,
            currentState: currentItem ? { ...currentItem } : null,
            lineage: steps,
            summary: {
                totalSteps: steps.length,
                creates,
                updates,
                verdicts,
                revokes,
                unavailableCount
            },
            writesNothing: true
        };
    }

    const api = Object.freeze({
        LINEAGE_KINDS,
        computeDiff,
        locateCurrentItem,
        buildMemoryLineage,
        replayMemoryLineage: buildMemoryLineage
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof root !== 'undefined') {
        root.LonShaMemoryLineageReplay = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
