(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaCircadianRoutine = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const VERSION = 'v17.0.0-L17-X6';

    /**
     * 日常生活节律共鸣与习惯沉淀共生器:
     * 1. 24小时时区时钟共振 (Circadian Clock Sync: 晨起/午间/傍晚/深夜/凌晨)；
     * 2. 共同生活起居习惯习惯沉淀 (Shared Habit Anchorage: 如固定说早安/午休/提醒喝水/熬夜关切)；
     * 3. 习惯连续度 (Continuity Streak) 与默契加深。
     */
    function createState(initial = {}) {
        return {
            habits: Array.isArray(initial.habits) ? initial.habits : [
                {
                    id: 'habit_morning_greeting',
                    name: '晨起互道早安',
                    targetSlot: 'morning', // 06:00 ~ 09:00
                    streakDays: 3,
                    lastFulfilledDate: ''
                },
                {
                    id: 'habit_late_night_care',
                    name: '深夜熬夜关怀',
                    targetSlot: 'late_night', // 23:00 ~ 04:00
                    streakDays: 2,
                    lastFulfilledDate: ''
                }
            ],
            currentSlot: initial.currentSlot || 'daytime'
        };
    }

    function hydrateState(state) {
        if (!state) return createState();
        return {
            habits: Array.isArray(state.habits) ? state.habits : [],
            currentSlot: state.currentSlot || 'daytime'
        };
    }

    function detectTimeSlot(hour) {
        const h = typeof hour === 'number' ? hour : new Date().getHours();
        if (h >= 5 && h < 9) return 'morning';
        if (h >= 9 && h < 12) return 'forenoon';
        if (h >= 12 && h < 14) return 'noon';
        if (h >= 14 && h < 18) return 'afternoon';
        if (h >= 18 && h < 22) return 'evening';
        return 'late_night'; // 22:00 ~ 05:00
    }

    function generateRoutineDirectives(state, hour) {
        const slot = detectTimeSlot(hour);
        if (state) state.currentSlot = slot;

        const directives = [];
        if (slot === 'morning') {
            directives.push('【生活节律·晨光破晓】：现实世界已是清晨，角色精神初醒，对话中自然带有清晨打哈欠、问候早安或准备早餐的生活气息。');
        } else if (slot === 'noon') {
            directives.push('【生活节律·午后小憩】：正值正午时分，角色言语慵懒温和，下意识提醒对方按时吃午餐或趴在桌上稍作休息。');
        } else if (slot === 'late_night') {
            directives.push('【生活节律·深夜共守】：现实已至更深露重的深夜，角色语气放轻变柔，自然关切对方为何还不入睡，甚至端来一杯温热饮品。');
        }

        return directives;
    }

    return {
        VERSION,
        createState,
        hydrateState,
        detectTimeSlot,
        generateRoutineDirectives
    };
}));