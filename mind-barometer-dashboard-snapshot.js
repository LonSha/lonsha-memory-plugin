(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        /* [v3.461.0 · 全局名双挂] 编排器历史上有两处检查过不同的名字：
         *   一处写的是 LonShaMindBarometerDashboard（本文件真实名），
         *   另一处写的是 LonShaMindBarometerSnapshot（只存在于旧注释里）。
         *   两个名字挂同一份对象，避免任何一方取不到而在真宿主里静默失效。 */
        root.LonShaMindBarometerDashboard = factory();
        root.LonShaMindBarometerSnapshot = root.LonShaMindBarometerDashboard;
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createState() {
        return {
            moodWeather: 'SUNNY', // SUNNY | GLOOMY | THUNDERSTORM | DRIZZLE | RAINBOW
            flowMomentum: 85,    // 0 - 100
            intimacyScore: 78,   // 0 - 100
            traumaDefenseActive: false,
            egoProtectionStatus: 'RELAXED',
            lastSnapshotAt: Date.now()
        };
    }

    /**
     * 聚合各心智引擎的状态，提纯为玩家端极简通俗的“角色心流晴雨表”
     */
    function aggregateBarometer(egoState, traumaState, intimacyState) {
        let mood = 'SUNNY';
        let traumaActive = false;
        let egoStatus = 'RELAXED';

        if (traumaState && traumaState.taboos && traumaState.taboos.some(t => t.currentPressure >= 0.8)) {
            mood = 'THUNDERSTORM';
            traumaActive = true;
        } else if (egoState && egoState.defenseLevel >= 0.5) {
            mood = 'GLOOMY';
            egoStatus = 'GUARDED';
        } else if (intimacyState && intimacyState.intimacyLevel > 70) {
            mood = 'RAINBOW';
        }

        return {
            moodWeather: mood,
            moodLabel: mood === 'RAINBOW' ? '心花怒放·深层默契' : mood === 'THUNDERSTORM' ? '暴风骤雨·触及旧伤' : mood === 'GLOOMY' ? '阴沉戒备·心存芥蒂' : '晴朗明媚·轻松陪伴',
            flowScore: 88,
            egoProtection: egoStatus,
            traumaDefense: traumaActive,
            renderedDashboardHtml: `<div class="lonsha-mind-barometer">
                <span class="weather-icon">${mood === 'RAINBOW' ? '🌈' : mood === 'THUNDERSTORM' ? '⚡' : mood === 'GLOOMY' ? '☁️' : '☀️'}</span>
                <span class="status-text">${mood === 'RAINBOW' ? '心意相通' : mood === 'THUNDERSTORM' ? '戒备应激' : mood === 'GLOOMY' ? '自我防御' : '舒适自然'}</span>
            </div>`
        };
    }

    /**
     * 导出全量心智无损持久化快照
     */
    function exportMindSnapshot(fullEngineState) {
        return {
            snapshotVersion: '17.0.0',
            savedAt: Date.now(),
            checksum: 'mind_' + Math.random().toString(36).slice(2, 8),
            state: { ...fullEngineState }
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
     *     ② 更要命的是它在这些模块上**必然装脏**：本模块的 moodWeather / egoProtectionStatus 是
     *        两个受控枚举字符串；`flowMomentum` / `intimacyScore` 为 0~100，而落盘/读盘走 JSON —— 存档里它们是普通对象/数组，
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
        const MOODS = ['SUNNY', 'GLOOMY', 'THUNDERSTORM', 'DRIZZLE', 'RAINBOW'];
        const EGO = ['RELAXED', 'GUARDED', 'FORTIFIED'];
        const clamp100 = (v, dft) => {
            const n = Number(v);
            return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : dft;
        };
        /* 两个枚举字段只接受受控词表内的值：词表外的字符串回落默认，不原样进状态。 */
        const mood = String(saved.moodWeather);
        if (MOODS.indexOf(mood) >= 0) s.moodWeather = mood;
        s.flowMomentum = clamp100(saved.flowMomentum, s.flowMomentum);
        s.intimacyScore = clamp100(saved.intimacyScore, s.intimacyScore);
        s.traumaDefenseActive = saved.traumaDefenseActive === true;
        const ego = String(saved.egoProtectionStatus);
        if (EGO.indexOf(ego) >= 0) s.egoProtectionStatus = ego;
        if (Number.isFinite(Number(saved.lastSnapshotAt))) s.lastSnapshotAt = Number(saved.lastSnapshotAt);
        return s;
    }

    return {
        createState: createState,
        aggregateBarometer: aggregateBarometer,
        exportMindSnapshot: exportMindSnapshot,
        hydrateState
    };
}));