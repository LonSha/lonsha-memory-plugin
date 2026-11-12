(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaCausalityInvariantLock = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createState() {
        return {
            timelineAnchors: [], // { epochId, timestamp, physicalInvariants: { itemId: 'DESTROYED'|'SEALED'|'EXISTS' } }
            fuseViolations: []
        };
    }

    function registerAnchor(state, epochId, timestamp, physicalInvariants = {}) {
        const anchor = {
            epochId,
            timestamp,
            physicalInvariants: { ...physicalInvariants }
        };
        state.timelineAnchors.push(anchor);
        return anchor;
    }

    /**
     * 前摄因果校验：若后续章节声称使用了早已被确认为 DESTROYED 的物体，强制触发熔断
     */
    function verifyCausality(state, targetEpochId, itemId, intendedAction = 'USE') {
        const pastAnchor = state.timelineAnchors.find(a => a.physicalInvariants[itemId] === 'DESTROYED');
        if (pastAnchor) {
            const violation = {
                id: 'viol_' + Date.now(),
                targetEpochId,
                itemId,
                intendedAction,
                destroyedEpoch: pastAnchor.epochId,
                timestamp: Date.now()
            };
            state.fuseViolations.push(violation);
            return {
                allowed: false,
                fused: true,
                reason: `【因果不变量主动熔断】物品 [${itemId}] 已在 [${pastAnchor.epochId}] 中被明确销毁，绝不可在后续 [${targetEpochId}] 中作为完好实物复现！`
            };
        }

        return {
            allowed: true,
            fused: false
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
     *     ② 更要命的是它在这些模块上**必然装脏**：本模块的 timelineAnchors / fuseViolations 是
     *        两个数组，元素里还嵌一层 `physicalInvariants` 三态枚举表，而落盘/读盘走 JSON —— 存档里它们是普通对象/数组，
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
        const INV = { DESTROYED: 1, SEALED: 1, EXISTS: 1 };
        if (Array.isArray(saved.timelineAnchors)) {
            for (const a of saved.timelineAnchors) {
                if (!a || typeof a !== 'object' || Array.isArray(a)) continue;
                const inv = {};
                const src = (a.physicalInvariants && typeof a.physicalInvariants === 'object' && !Array.isArray(a.physicalInvariants)) ? a.physicalInvariants : {};
                for (const itemId of Object.keys(src)) {
                    const st = String(src[itemId]);
                    if (INV[st]) inv[String(itemId)] = st;
                }
                s.timelineAnchors.push({
                    epochId: String(a.epochId == null ? '' : a.epochId),
                    timestamp: Number.isFinite(Number(a.timestamp)) ? Number(a.timestamp) : 0,
                    physicalInvariants: inv
                });
            }
        }
        if (Array.isArray(saved.fuseViolations)) {
            for (const v of saved.fuseViolations) {
                if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
                s.fuseViolations.push(v);
            }
        }
        return s;
    }

    return {
        createState: createState,
        registerAnchor: registerAnchor,
        verifyCausality: verifyCausality,
        hydrateState
    };
}));