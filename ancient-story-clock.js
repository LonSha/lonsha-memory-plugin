/**
 * ancient-story-clock.js - 古法历法与不连续时辰投影 (Ancient Story Clock)
 * 
 * 机制借鉴与超越：
 * 吸收千千结 (ST-MyriadKnots v0.9.4) 的五格时间体系与十二时辰/初正刻度规范。
 * 针对历史、古典或仙侠角色扮演，支持“天干地支、帝王年号、十二时辰（初正/刻度）”
 * 以及“翌日破晓、暮色苍茫”等相对模糊时间。
 * 允许不可比时间并存，杜绝将模糊叙事时间机械硬转为虚假 ISO 时间。
 */

/* 单次装载包装（[v3.421.0] 修）：本文件在宿主页是按 extra_js 逐个 eval 的经典脚本，
 *   顶层 `class`/`const` 落在同一个脚本作用域里；同一页重复加载一次就会 `Identifier ...
 *   has already been declared`。故与仓内既有模块同形，收进 IIFE。
 *   导出仍是双通道：IIFE 内 `module.exports` 供 tests 具名 import，`root.*` 供宿主消费。 */
(function (root) {
'use strict';
const SHICHEN_MAP = {
    '子': { modernHour: 23, span: '23:00~01:00' },
    '丑': { modernHour: 1, span: '01:00~03:00' },
    '寅': { modernHour: 3, span: '03:00~05:00' },
    '卯': { modernHour: 5, span: '05:00~07:00' },
    '辰': { modernHour: 7, span: '07:00~09:00' },
    '巳': { modernHour: 9, span: '09:00~11:00' },
    '午': { modernHour: 11, span: '11:00~13:00' },
    '未': { modernHour: 13, span: '13:00~15:00' },
    '申': { modernHour: 15, span: '15:00~17:00' },
    '酉': { modernHour: 17, span: '17:00~19:00' },
    '戌': { modernHour: 19, span: '19:00~21:00' },
    '亥': { modernHour: 21, span: '21:00~23:00' }
};

class AncientStoryClock {
    constructor() {}

    /**
     * 解析时间文本（支持现代时间与古法时辰五格）
     * @param {string} rawTimeText - 如 "庆历四年·春·卯正二刻" 或 "2026-10-24 14:30" 或 "次日黄昏"
     * @returns {Object} 结构化时间标记
     */
    parseStoryTime(rawTimeText = '') {
        const text = rawTimeText.trim();
        if (!text) {
            return {
                type: 'unknown',
                rawText: '',
                isComparable: false,
                sortKey: '9999-99-99'
            };
        }

        // 尝试匹配古法时辰: [子丑寅卯辰巳午未申酉戌亥][初正]?(?:[一二三]刻)?
        const shichenMatch = text.match(/([子丑寅卯辰巳午未申酉戌亥])([初正])?(?:([一二三])刻)?/);
        if (shichenMatch) {
            const zhi = shichenMatch[1];
            const phase = shichenMatch[2] || '正'; // 默认正
            const quarter = shichenMatch[3] || '初'; // 一刻/二刻/三刻
            const info = SHICHEN_MAP[zhi];

            let minuteOffset = phase === '初' ? 0 : 60;
            if (quarter === '一') minuteOffset += 15;
            else if (quarter === '二') minuteOffset += 30;
            else if (quarter === '三') minuteOffset += 45;

            return {
                type: 'ancient_shichen',
                rawText: text,
                shichen: zhi + '时',
                phase,
                quarter: quarter ? quarter + '刻' : '正刻',
                approxModernSpan: info.span,
                isComparable: true,
                sortKey: `ANCIENT_${String(info.modernHour).padStart(2, '0')}:${String(minuteOffset).padStart(2, '0')}`
            };
        }

        // 尝试匹配公历标准时间
        const isoMatch = text.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})?/);
        if (isoMatch) {
            const year = isoMatch[1];
            const month = String(isoMatch[2]).padStart(2, '0');
            const day = String(isoMatch[3] || '01').padStart(2, '0');
            return {
                type: 'gregorian',
                rawText: text,
                year: parseInt(year),
                month: parseInt(month),
                day: parseInt(day),
                isComparable: true,
                sortKey: `${year}-${month}-${day}`
            };
        }

        // 相对模糊文学时间（如“翌日午后”、“夜色渐深”）
        return {
            type: 'fuzzy_literary',
            rawText: text,
            isComparable: false,
            sortKey: `FUZZY_${text}`
        };
    }

    /**
     * 对一批事件按故事时钟进行非强加式排序与分段
     * @param {Array} events - [{ id, title, storyTime }]
     * @returns {Object} { chronologicalSegments, fuzzyEvents }
     */
    orderEventsByClock(events = []) {
        const comparable = [];
        const fuzzy = [];

        for (const ev of events) {
            const parsed = this.parseStoryTime(ev.storyTime || '');
            if (parsed.isComparable) {
                comparable.push({ event: ev, time: parsed });
            } else {
                fuzzy.push({ event: ev, time: parsed });
            }
        }

        comparable.sort((a, b) => a.time.sortKey.localeCompare(b.time.sortKey));

        return {
            chronological: comparable.map(c => ({
                id: c.event.id,
                title: c.event.title,
                storyTimeText: c.time.rawText,
                clockType: c.time.type,
                sortKey: c.time.sortKey
            })),
            fuzzy: fuzzy.map(f => ({
                id: f.event.id,
                title: f.event.title,
                storyTimeText: f.time.rawText,
                clockType: f.time.type
            }))
        };
    }
}

root.LonShaAncientStoryClock = { AncientStoryClock };
if (typeof module !== 'undefined' && module.exports) module.exports = { AncientStoryClock };
})(typeof globalThis !== 'undefined' ? globalThis : window);
