(function (root) {
    'use strict';
    const MP_VERSION = 1;
    const MP_KIND = 'material_pack';
    /* 转义一律用字符码拼:本仓写入通道处理反斜杠会污染源码(零反斜杠构造纪律)。 */
    const NL = String.fromCharCode(10);
    const SP = String.fromCharCode(32);
    /** 下一幕任务四类(**穷尽**:任何目标必须落入其中一格,不得现编态名)。 */
    const TASKS = Object.freeze(['meet', 'reunion', 'advance', 'resolve']);
    const TASK_LABEL = Object.freeze({ meet: '赴约', reunion: '重逢', advance: '推进', resolve: '收束' });
    /** 材料面(**穷尽**:每条材料必须归属一格;不归属 ⇒ 计入 unclassified,不硬塞)。 */
    const FACETS = Object.freeze(['appointment', 'place', 'participants', 'relation', 'sharedPast', 'promise', 'pov', 'item', 'constraint', 'setting']);
    const FACET_LABEL = Object.freeze({
        appointment: '约定', place: '地点', participants: '参与者',
        relation: '关系变化', sharedPast: '共同往事', promise: '未闭承诺',
        pov: '视角约束', item: '物品', constraint: '硬约束', setting: '资料设定',
    });
    /**
     * **本模块的立身之本**:任务 → 面优先级。
     *   为什么必须是四份**不同**的表:赴约场要「约定 + 地点 + 谁在场」,
     *   重逢场要「关系变化 + 共同往事」;同预算下若四类共用一张表,
     *   四种任务的产物会**同形**(M4-X8 验收要求「材料差异可解释」)。
     *   四份表是**同一真源**(FACETS)的四种排法,不另造词表。
     */
    const TASK_PRIORITY = Object.freeze({
        meet: Object.freeze(['appointment', 'place', 'participants', 'constraint', 'promise', 'relation', 'sharedPast', 'item', 'pov', 'setting']),
        reunion: Object.freeze(['relation', 'sharedPast', 'participants', 'promise', 'place', 'constraint', 'appointment', 'item', 'pov', 'setting']),
        advance: Object.freeze(['promise', 'constraint', 'relation', 'participants', 'place', 'appointment', 'item', 'sharedPast', 'pov', 'setting']),
        resolve: Object.freeze(['promise', 'sharedPast', 'relation', 'participants', 'constraint', 'place', 'appointment', 'item', 'pov', 'setting']),
    });
    /** 材料来源(**只说取自哪个 owner**:来源是**出处**,不是「已验真」的印章)。 */
    const SOURCES = Object.freeze(['continuity', 'recall', 'scene-book', 'relation', 'promise', 'pov', 'fated-recall', 'lore', 'note', 'caller', 'unknown']);
    /** 单次材料池上限(有界,防灌爆)。 */
    const INVENTORY_MAX = 60;
    /** 材料包硬顶(与预算无关的兜底上限,防调用方不设预算时无限带)。 */
    const PACK_MAX = 14;
    /** 缺省预算(条数):调用方给预算就用**给的**(本模块不替它改)。 */
    const BUDGET_DEFAULT = 9;
    /** 单条摘要最多几字。 */
    const SNIPPET_MAX = 80;
    /** 深度扫描读数键:出现百分比 / 置信度名即不通过(与 M4-X5 / X6 / X7 同口径)。 */
    const PERCENT_KEYS = Object.freeze(['percent', 'confidence', 'score', 'probability', 'prob']);
    /** 折行归一(**零正则、零反斜杠**:逐字符把 CR / LF / TAB 换成空格再收空白)。 */
    function oneLine(value) {
        const s = String(value == null ? '' : value);
        let buf = '';
        for (let i = 0; i < s.length; i++) {
            const c = s.charCodeAt(i);
            buf += (c === 10 || c === 13 || c === 9) ? SP : s.charAt(i);
        }
        const parts = buf.split(SP);
        const keep = [];
        for (let i = 0; i < parts.length; i++) if (parts[i] !== '') keep.push(parts[i]);
        return keep.join(SP);
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
    /** FNV-1a 32 位(与 X5 / X6 / X7 同口径,供键指纹用)。 */
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