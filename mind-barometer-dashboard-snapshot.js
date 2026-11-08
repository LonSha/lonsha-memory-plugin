(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaMindBarometerDashboard = factory();
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

    return {
        createState: createState,
        aggregateBarometer: aggregateBarometer,
        exportMindSnapshot: exportMindSnapshot
    };
}));