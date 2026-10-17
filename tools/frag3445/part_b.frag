(function (root) {
    'use strict';
    const RG_VERSION = 1;
    const RG_KIND = 'return_gate';
    /* 转义一律用字符码拼:本仓写入通道处理反斜杠会污染源码(零反斜杠构造纪律)。 */
    const NL = String.fromCharCode(10);
    const TAB = String.fromCharCode(9);
    /** 动作生命周期三通道(**必须分列**:预览 / 展示 / 真用)。 */
    const CHANNELS = Object.freeze(['preview', 'shown', 'used']);
    const CHANNEL_LABEL = Object.freeze({
        preview: '预览',
        shown: '展示',
        used: '真用',
    });
    /** 只有**展示 / 真用**落冷却;**预览**一律不消耗(M4-X7 立身之本)。 */
    const COOLDOWN_CHANNELS = Object.freeze(['shown', 'used']);
    /** 控频强度档(**默认 hint-only**:显式 inject 才自动注入)。 */
    const POLICY = Object.freeze({ OFF: 'off', HINT: 'hint-only', INJECT: 'inject' });
    const POLICY_LABEL = Object.freeze({
        off: '关停',
        'hint-only': '只给提示',
        inject: '可自动注入',
    });
    /** 反馈 = **呈现偏好**(不改动、不删除历史事实;M4-X7 明写)。 */
    const PREFERENCE = Object.freeze({ NORMAL: 'normal', LESS: 'less', NEVER: 'never' });
    /** 候选闸态(**穷尽**:任何候选必须落入其中一格,不得现编态名)。 */
    const GATE = Object.freeze(['open', 'held', 'blocked']);
    const GATE_LABEL = Object.freeze({
        open: '可提',
        held: '本次押后',
        blocked: '不出',
    });
    /** 候选类别(**穷尽**,与 fated-recall 的触发四类同形但**不复用其常量**)。 */
    const KINDS = Object.freeze(['place', 'anniversary', 'item', 'person']);
    /** 单次最多带回几条(有界,防灌爆注入面)。 */
    const MAX_CANDIDATES = 12;
    /** 单条摘要最多几字。 */
    const SNIPPET_MAX = 72;
    /** 重复轰炸窗口(楼数):同 (触发键, 旧事键) 在窗口内已 shown/used ⇒ held。 */
    const REPEAT_WINDOW = 3;
    /** 深度扫描读数键:出现百分比 / 置信度名即不通过(与 M4-X5 / M4-X6 同口径)。 */
    const PERCENT_KEYS = Object.freeze(['percent', 'confidence', 'score', 'probability', 'prob']);
    /** 折行归一(读数里不得混进换行)。 */
    function oneLine(value) {
        return String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
    /** 裁剪(统一走 oneLine,免得读数里混进换行)。 */
    function clip(s, n) {
        const t = oneLine(s);
        return n && t.length > n ? t.slice(0, n) : t;
    }
    /** 键归一(去首尾空白;非串给空串)。 */
    function keyOf(v) {
        return oneLine(v == null ? '' : v);
    }
    /** 文本化(缺省空串)。 */
    function strOf(v) {
        return v == null ? '' : String(v);
    }
    /** 数组归一(非数组 ⇒ 空数组;不丢原元素,只做浅拷贝)。 */
    function arrOf(v) {
        return Array.isArray(v) ? v.slice() : [];
    }
    /** 数值归一(没给 ⇒ null;布尔 / 对象 / 函数 ⇒ null,不拿 0 冒充「就是 0」)。 */
    function numOr(v, dflt) {
        if (v === null || v === undefined || v === '') return (dflt === undefined ? null : dflt);
        if (typeof v === 'boolean' || typeof v === 'object' || typeof v === 'function') return (dflt === undefined ? null : dflt);
        const n = Number(v);
        return Number.isFinite(n) ? n : (dflt === undefined ? null : dflt);
    }
    /** 楼层:只认 number 与非空整数串;其余如实 null(**不编 0**:0 是「第 0 楼」)。 */
    function floorOf(v) {
        const n = numOr(v, null);
        if (n === null) return null;
        const f = Math.floor(n);
        return f < 0 ? null : f;
    }
    /** FNV-1a 32 位(与 X6 / X5 同口径,供键指纹用)。 */
    function hash32(str) {
        let h = 0x811c9dc5;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return ('0000000' + h.toString(16)).slice(-8);
    }
    /** 试算(绝不外抛:坏实现一律回落 fallback)。 */
    function safe(fn, fallback) {
        try {
            const r = fn();
            return (r === undefined) ? fallback : r;
        } catch (_e) { return fallback; }
    }
    /** 同值判定(原始值直接比;对象按稳定序列化比)。 */
    function sameValue(a, b) {
        if (a === b) return true;
        if (a == null || b == null) return false;
        try { return JSON.stringify(a) === JSON.stringify(b); } catch (_e) { return false; }
    }