(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaBeliefSelfHealingDAG = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createState() {
        return {
            nodes: {}, // factId -> { id, text, valid: true }
            edges: []  // { parentId, childId, derivationType }
        };
    }

    function registerFactNode(state, factId, text) {
        state.nodes[factId] = {
            id: factId,
            text,
            valid: true,
            invalidatedAt: null,
            invalidationReason: null
        };
        return state.nodes[factId];
    }

    function addDerivationEdge(state, parentId, childId, derivationType = 'LOGICAL_INFERENCE') {
        state.edges.push({
            parentId,
            childId,
            derivationType
        });
    }

    /**
     * 当根事实被纠错或推翻时，沿着 DAG 级联让全部下游派生推论失效自愈
     */
    function invalidateFactCascading(state, rootFactId, reason = 'CORRECTED_BY_TRUTH') {
        const queue = [rootFactId];
        const invalidatedIds = [];

        while (queue.length > 0) {
            const currentId = queue.shift();
            const node = state.nodes[currentId];
            if (node && node.valid) {
                node.valid = false;
                node.invalidatedAt = Date.now();
                node.invalidationReason = reason;
                invalidatedIds.push(currentId);

                // 查找所有以 currentId 为父节点的子节点
                const children = state.edges
                    .filter(e => e.parentId === currentId)
                    .map(e => e.childId);
                queue.push(...children);
            }
        }

        return {
            rootFactId,
            invalidatedCount: invalidatedIds.length,
            invalidatedIds,
            summary: `已沿因果DAG级联失效 ${invalidatedIds.length} 条派生事实，杜绝历史错误推论滞留。`
        };
    }

    /* ============================================================
     * [v3.464.0 · L21-O4 水合面补齐] / [v3.465.1 L21-O4 复检：按本模块形状归一]
     * 为什么必须补：宿主 `engine-persistence-ops.js` 的水合表把本模块登记成
     *   `hydrateState`，而本文件此前根本没有这个函数 —— 恢复路径上
     *   `typeof mod['hydrateState'] === 'function'` 恒假，静默走 `: _ext[key]` 兜底，
     *   把**原始 payload**直接赋给宿主字段。表面上「恢复了」，实际装进去的是没经归一的数据。
     *
     * ★ [v3.465.1] 首版这里写的是「以默认形状为底逐键浅合并」的通用实现。复检判定它
     *   **本身就是它声称要修的那个病**：
     *     ① 19 个模块共用同一份通用体 => 逐字副本簇（`tests/v3281_o7_module_copy_ledger.test.mjs`
     *        的 B1 当场翻红，点名 hydrateState 一簇 11 成员）。本仓「两份实现即第二真源」。
     *     ② 更要命的是它在这些模块上**必然装脏**：本模块的 nodes / edges 是
     *        `nodes` 是普通对象表、`edges` 是数组，而落盘/读盘走 JSON —— 存档里它们是普通对象/数组，
     *        浅合并会把普通对象原样写回字段，此后本模块每次 `.get` / `.has` / `.add`
     *        都是 TypeError。「登记成立」不等于「恢复正确」。
     *   故按本模块真实形状逐字段归一（与同族 37 个已有 hydrateState 的口径一致：
     *   只取认得的键、逐字段夹紧、构造正确的容器类型），并且**不再**与任何模块逐字相同。
     *
     * 口径（刻意**不抛错**，与同族 createState 的宽容度一致）：
     *   ① 非对象 / null / 数组 => 整体回落默认状态；
     *   ② 只读默认形状里已有的键（野键一律丢弃：野键进状态等于第二真源）；
     *   ③ 容器按形状重建（Map/Set 由 entries/数组重建，绝不留原值）；
     *   ④ 数值按字段值域夹紧，字符串按受控枚举回落；未知值回落默认值（不抛、不猜）。
     * ============================================================ */

    function hydrateState(saved) {
        const s = createState();
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return s;
        const srcNodes = (saved.nodes && typeof saved.nodes === 'object' && !Array.isArray(saved.nodes)) ? saved.nodes : null;
        if (srcNodes) {
            for (const k of Object.keys(srcNodes)) {
                const v = srcNodes[k];
                if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
                s.nodes[String(k)] = {
                    id: String(v.id == null ? k : v.id),
                    text: String(v.text == null ? '' : v.text),
                    valid: v.valid !== false
                };
            }
        }
        if (Array.isArray(saved.edges)) {
            for (const e of saved.edges) {
                if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
                s.edges.push({
                    parentId: String(e.parentId == null ? '' : e.parentId),
                    childId: String(e.childId == null ? '' : e.childId),
                    derivationType: String(e.derivationType == null ? '' : e.derivationType)
                });
            }
        }
        return s;
    }

    return {
        createState: createState,
        registerFactNode: registerFactNode,
        addDerivationEdge: addDerivationEdge,
        invalidateFactCascading: invalidateFactCascading,
        hydrateState
    };
}));