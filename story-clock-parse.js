/* ========================================================
 * story-clock-parse.js — 剧情时钟时间戳解析器
 * Vendor 化自 ST-MyriadKnots（千千结）src/story-clock.js（作者 atonal519）
 *   https://github.com/atonal519/ST-MyriadKnots
 *
 * 吸收说明：
 *   我们的 GameClock 有 RelativeTimeHelper.parseStoryDate（从文本推断剧情日期）
 *   与 v3.72 时间标签注入，但缺少「从正文 HTML 注释回读结构化时间戳」的鲁棒
 *   解析器。本模块移植 MyriadKnots 的解析核心：
 *     - parseClockFields       解析 date/weekday/time 三字段，校验完整性
 *     - parseSharedStoryClock  从正文扫描 <!-- NS-start -->…<!-- NS-end --> 注释对，
 *                              支持多命名空间（SDC/QQJ/myknots/LONSHA），去重/排序校验
 *     - storyClockSignature    时钟指纹（跨楼层去重）
 *     - decideStoryClockInjection  多记忆插件并存时裁决谁注入剧情时钟（peer 协商）
 *   已去除 MyriadKnots 特定的 setExtensionPrompt/panel 投影逻辑（属其宿主集成，
 *   与本插件无关），仅保留可独立测试的纯函数。
 *
 * 挂 window.LonShaStoryClock，供 index.js GameClock / 注入协调使用。
 * ======================================================== */
'use strict';
(function() {

const text = value => typeof value === 'string' ? value : '';
// 解析 date=/weekday=/time= 字段，兼容中文分隔符与全角等号
const field = (raw, name) => new RegExp(`(?:^|[|｜,，;；\\n])\\s*(?:${name})\\s*[=＝:]\\s*([^|｜,，;；\\n]+)`, 'iu').exec(raw)?.[1]?.trim() || null;

/**
 * 解析一段 start/end 注释内容为结构化字段。
 * complete=true 表示 date+weekday(合法)+time 三字段齐全。
 */
function parseClockFields(raw) {
    const value = text(raw).trim();
    const date = field(value, 'date');
    const weekday = field(value, 'weekday|星期');
    const time = field(value, 'time');
    const weekdayValid = /^(?:周|週|星期|礼拜|禮拜)[一二三四五六日天]$/u.test(weekday ?? '');
    return Object.freeze({ raw: value, date, weekday, time, complete: Boolean(date && weekdayValid && time) });
}

function namespaceCandidate(source, namespace) {
    const startRe = new RegExp(`<!--\\s*${namespace}-start\\s+([\\s\\S]*?)\\s*-->`, 'igu');
    const endRe = new RegExp(`<!--\\s*${namespace}-end\\s+([\\s\\S]*?)\\s*-->`, 'igu');
    const starts = [...source.matchAll(startRe)], ends = [...source.matchAll(endRe)];
    if (!starts.length && !ends.length) return null;
    const start = starts[0] ?? null, end = ends[0] ?? null;
    const duplicate = starts.length !== 1 || ends.length !== 1;
    const ordered = Boolean(start && end && end.index >= start.index + start[0].length);
    const startMeta = start ? parseClockFields(start[1]) : null;
    const endMeta = end ? parseClockFields(end[1]) : null;
    return Object.freeze({
        namespace,
        start: startMeta?.raw ?? null,
        end: endMeta?.raw ?? null,
        startMeta,
        endMeta,
        duplicate,
        complete: !duplicate && ordered && startMeta?.complete === true && endMeta?.complete === true,
        sourceIndex: Math.min(start?.index ?? Infinity, end?.index ?? Infinity),
    });
}

/**
 * 从正文扫描剧情时钟注释对，多命名空间候选取「完整优先 + 位置靠前」。
 * 命名空间含 LONSHA（本插件）与 SDC/QQJ/myknots（识别其它记忆插件已注入的时钟）。
 */
function parseSharedStoryClock(value, extraNamespaces = []) {
    const source = text(value);
    const namespaces = ['LONSHA', 'SDC', 'QQJ', 'myknots', ...extraNamespaces];
    const candidates = namespaces.map(ns => namespaceCandidate(source, ns)).filter(Boolean);
    if (!candidates.length) return null;
    return candidates.sort((left, right) => Number(right.complete) - Number(left.complete) || left.sourceIndex - right.sourceIndex)[0];
}

/** 时钟指纹：跨楼层去重用。 */
function storyClockSignature(clock) {
    if (!clock) return '';
    return JSON.stringify([clock.namespace.toLocaleLowerCase(), clock.start ?? null, clock.end ?? null]);
}

/**
 * 多记忆插件并存时裁决本插件是否注入剧情时钟（避免重复注入/冲突）。
 * @param {object} o
 * @param {boolean} o.ownActive   本插件时钟开关开
 * @param {boolean} o.ownCustom   本插件用了自定义时钟提示词（优先保留）
 * @param {boolean} o.peerActive  其它记忆插件时钟已激活
 * @param {boolean} o.peerCustom  其它插件用了自定义时钟提示词
 * @returns {{inject:boolean, status:string}}
 */
function decideStoryClockInjection({ ownActive, ownCustom, peerActive, peerCustom } = {}) {
    if (!ownActive) return Object.freeze({ inject: false, status: 'closed' });
    if (ownCustom) return Object.freeze({ inject: true, status: 'custom' });
    if (peerActive && peerCustom) return Object.freeze({ inject: false, status: 'adapted-peer-custom' });
    if (peerActive) return Object.freeze({ inject: false, status: 'adapted-peer' });
    return Object.freeze({ inject: true, status: 'standalone-default' });
}

window.LonShaStoryClock = Object.freeze({
    parseClockFields,
    parseSharedStoryClock,
    storyClockSignature,
    decideStoryClockInjection,
});
})();