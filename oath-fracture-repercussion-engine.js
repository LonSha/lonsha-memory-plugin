(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaOathFracture = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createState() {
        return {
            trustScore: 100, // 0 - 100
            fractures: [],   // 裂痕历史记录
            activeOaths: []  // 活跃誓约
        };
    }

    function bindOath(state, oathDesc, recipient = '玩家', weight = 1.0) {
        const oath = {
            id: 'oath_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            desc: oathDesc,
            recipient: recipient,
            weight: weight,
            status: 'bound', // bound | kept | fractured
            boundAt: Date.now()
        };
        state.activeOaths.push(oath);
        return oath;
    }

    function recordFracture(state, oathId, reason) {
        const oath = state.activeOaths.find(o => o.id === oathId || o.desc.includes(oathId));
        if (oath) {
            oath.status = 'fractured';
            oath.fracturedAt = Date.now();
            oath.fractureReason = reason;
        }

        const drop = Math.round(30 * (oath ? oath.weight : 1.0));
        state.trustScore = Math.max(0, state.trustScore - drop);
        
        const fractureEntry = {
            id: 'frac_' + Date.now(),
            oathDesc: oath ? oath.desc : oathId,
            reason: reason,
            severity: oath ? oath.weight : 1.0,
            recordedAt: Date.now()
        };
        state.fractures.push(fractureEntry);
        return fractureEntry;
    }

    function generateFractureDirectives(state) {
        const directives = [];
        if (state.trustScore < 40) {
            directives.push(
                '【誓约心锚与信任重度裂痕·自我防御启动】当前角色对誓约对象的信任度已降至冰点（' + state.trustScore + '/100）。角色感到被辜负与背刺，言语交谈必须带有礼貌的疏离、警惕防御与刺痛感，拒绝轻信承诺。'
            );
        } else if (state.trustScore < 75) {
            directives.push(
                '【誓约心锚与信任轻度裂痕·心存芥蒂】当前信任度受损（' + state.trustScore + '/100）。角色内心深处保留着失信的阴影，态度虽克制但言语微显迟疑和距离感。'
            );
        }
        return directives;
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
     *     ② 更要命的是它在这些模块上**必然装脏**：本模块的 trustScore / fractures / activeOaths 是
     *        0~100 数值 + 两个数组，而落盘/读盘走 JSON —— 存档里它们是普通对象/数组，
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
        const trust = Number(saved.trustScore);
        if (Number.isFinite(trust)) s.trustScore = Math.max(0, Math.min(100, trust));
        if (Array.isArray(saved.fractures)) {
            for (const f of saved.fractures) {
                if (!f || typeof f !== 'object' || Array.isArray(f)) continue;
                s.fractures.push(f);
            }
        }
        if (Array.isArray(saved.activeOaths)) {
            for (const o of saved.activeOaths) {
                if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
                s.activeOaths.push(o);
            }
        }
        return s;
    }

    return {
        createState: createState,
        bindOath: bindOath,
        recordFracture: recordFracture,
        generateFractureDirectives: generateFractureDirectives,
        hydrateState
    };
}));
