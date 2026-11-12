(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaSpatialWhisperGuard = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createState() {
        return {
            partitions: {}, // partitionId -> { name, isolationFactor } (0.0: 完全通透, 1.0: 彻底隔音)
            eavesdropEvents: []
        };
    }

    function definePartition(state, partitionId, name, isolationFactor = 0.7) {
        state.partitions[partitionId] = {
            id: partitionId,
            name: name,
            isolationFactor: Math.max(0, Math.min(1.0, isolationFactor))
        };
        return state.partitions[partitionId];
    }

    function filterUtteranceForListener(state, partitionId, utterance, listenerRole = '偷听者') {
        const partition = state.partitions[partitionId] || { isolationFactor: 0.7, name: '门扉阻隔' };
        let fragmentedUtterance = utterance;

        if (partition.isolationFactor >= 0.9) {
            fragmentedUtterance = '【厚重门墙彻底隔音，外人只能隐约感受到室内有微弱低沉的动静，无法辨识任何词句】';
        } else if (partition.isolationFactor >= 0.5) {
            // 剥离细节，只保留模糊碎片
            const words = utterance.split(/([，。！？,.!?\s]+)/).filter(Boolean);
            const blurred = words.map((w, idx) => {
                if (idx % 2 === 0 && w.length > 1) {
                    return '……' + w.slice(-1) + '……';
                }
                return '……';
            }).join('');
            fragmentedUtterance = '【隔着' + partition.name + '，声音断续模糊】「' + blurred + '」';
        }

        const evt = {
            id: 'eavesdrop_' + Date.now(),
            partitionId: partitionId,
            listenerRole: listenerRole,
            fragmentedUtterance: fragmentedUtterance,
            originalLength: utterance.length,
            timestamp: Date.now()
        };
        state.eavesdropEvents.push(evt);
        return evt;
    }

    function generateEavesdroppingDirectives(eavesdropEvt) {
        return [
            '【空间声学隔断·偷听有限感知】角色当前处于隔断外观察/偷听状态。角色仅捕捉到了断续的声音碎片：' + eavesdropEvt.fragmentedUtterance + '。严格禁止展现全知视角！严禁说出室内具体的密谋细节或精确名词，只能基于所听到的模糊音调与破碎词汇产生疑虑、猜测或警惕。'
        ];
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
     *     ② 更要命的是它在这些模块上**必然装脏**：本模块的 partitions / eavesdropEvents 是
     *        普通对象表（`isolationFactor` 0~1）+ 数组，而落盘/读盘走 JSON —— 存档里它们是普通对象/数组，
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
        const src = (saved.partitions && typeof saved.partitions === 'object' && !Array.isArray(saved.partitions)) ? saved.partitions : null;
        if (src) {
            for (const pid of Object.keys(src)) {
                const v = src[pid];
                if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
                const iso = Number(v.isolationFactor);
                s.partitions[String(pid)] = {
                    name: String(v.name == null ? '' : v.name),
                    isolationFactor: Number.isFinite(iso) ? Math.max(0, Math.min(1, iso)) : 0
                };
            }
        }
        if (Array.isArray(saved.eavesdropEvents)) {
            for (const e of saved.eavesdropEvents) {
                if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
                s.eavesdropEvents.push(e);
            }
        }
        return s;
    }

    return {
        createState: createState,
        definePartition: definePartition,
        filterUtteranceForListener: filterUtteranceForListener,
        generateEavesdroppingDirectives: generateEavesdroppingDirectives,
        hydrateState
    };
}));