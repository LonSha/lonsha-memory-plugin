/* ============================================================
 * everyday-shared-routine-rhythm-engine.js — [v3.460.0 · 第十六期心智引擎]
 * 日常生活习惯共生与节律共鸣引擎 (Everyday Shared Routine & Rhythm Engine)
 * ------------------------------------------------------------
 * 【核心设计与痛点解决】
 * 角色与玩家长期生活在同一世界中，存在真实的日常起居与作息节律：
 *   - 清晨的一杯温水、午后的哈欠、深夜的互道晚安，构成了生活感的基石；
 *   - 本引擎以小时为时钟切片感知角色的日常作息状态与精力节奏，
 *     在合适的时间点自发展开生活化的自然互动。
 *
 * 【体验纪律】
 * 严禁技术黑话，面向玩家只输出生活化提示词：
 *   如 [正是犯困的午后]、[清晨微风中的惬意]、[深夜的静谧]
 *
 * 挂载：LonShaRoutineRhythm / CJS / AMD
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaRoutineRhythm = factory();
        root.RoutineRhythmEngine = root.LonShaRoutineRhythm;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VERSION = '3.460.0';

    function getRhythmByHour(hour) {
        const h = Number(hour) % 24;
        if (h >= 5 && h < 9) {
            return { slot: '清晨', mood: '刚从梦中醒来，带着微微的困意与晨间的清爽', habit: '想伸个懒腰或喝杯水' };
        } else if (h >= 9 && h < 12) {
            return { slot: '上午', mood: '精力充沛，神思清明，专注于手头的事情', habit: '步履从容' };
        } else if (h >= 12 && h < 14) {
            return { slot: '正午', mood: '饱餐之后的慵懒与短暂休整', habit: '想找个舒服的地方小憩片刻' };
        } else if (h >= 14 && h < 18) {
            return { slot: '午后', mood: '阳光西斜，心情舒展，适合随性闲聊', habit: '微风拂面' };
        } else if (h >= 18 && h < 22) {
            return { slot: '傍晚入夜', mood: '卸下一天的防备与疲惫，渴望温馨与放松', habit: '神情温和' };
        } else {
            return { slot: '深夜', mood: '夜色已深，周围一片安静，声音不由自主放轻', habit: '略带倦意但格外交心' };
        }
    }

    function generateRoutineDirectives(currentHour = new Date().getHours()) {
        const rhythm = getRhythmByHour(currentHour);
        return `[此时生活状态：${rhythm.slot}] 现实中正值${rhythm.slot}时分。角色状态：${rhythm.mood}，可以自然带出${rhythm.habit}的生活化细节。`;
    }

    return {
        VERSION,
        getRhythmByHour,
        generateRoutineDirectives
    };
}));