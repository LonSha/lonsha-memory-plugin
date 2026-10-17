(function (root) {
    'use strict';
    const NL_VERSION = 1;
    const NL_KIND = 'narrative_layer';
    /** 五层(计划原文点名)+ 一格未标注。**判定只认显式标注**,见 modalityOf。 */
    const MODALITIES = Object.freeze(['reality', 'dream', 'hypothesis', 'plan', 'quote']);
    /** 未标注:与「已知属于某层」**不同形**(不得当现实用)。 */
    const UNSPECIFIED = 'unspecified';
    /** 现实层:现实问答与生成的**唯一**合法输入。 */
    const REALITY = 'reality';
    /** 计划落实态(须事件关联才成案,见 planStateOf)。 */
    const PLAN_STATES = Object.freeze(['planned', 'done', 'lapsed']);
    /** 关键词提示表 —— **只作提示读数,不参与层判定**(M4-X6「不做」第一条)。 */
    const HINTS = Object.freeze([
        [/(^|[^a-z])(dream|dreamt|dreamed)([^a-z]|$)|梦|夢|做梦|噩梦/i, 'dream'],
        [/如果|假如|要是|倘若|万一|假设|hypothetical/i, 'hypothesis'],
        [/打算|准备|计划|将要|想去|想搬|决定要|plan|intend/i, 'plan'],
        [/他说|她说|听说|据说|据传|引述|转述|quote|said/i, 'quote']
    ]);
    /** 单层最多带回几条(有界,防灌爆注入面)。 */
    const MAX_ITEMS = 240;
    /** 单层分面最多列几条(有界)。 */
    const MAX_PER_LAYER = 48;
    /** 嵌套框架最多几层(不无限细分 —— M4-X6「不做」第二条)。 */
    const MAX_FRAMES = 4;
    /** 深度扫描读数键:出现百分比 / 置信度名即不通过(与 M4-X5 同口径)。 */
    const PERCENT_KEYS = Object.freeze(['percent', 'confidence', 'score', 'probability', 'prob']);
    /** 折行归一(读数里不得混进换行)。 */
    function oneLine(value) {
        return String(value == null ? '' : value).replace(/\s*[\r\n]+\s*/g, ' ').trim();
    }
    /** 裁剪(统一走 oneLine,免得读数里混进换行)。 */
    function clip(s, n) {
        const t = oneLine(s);
        return n && t.length > n ? t.slice(0, n) : t;
    }
    /** 楼层:只认 number 与非空整数串;其余如实 null(**不编 0**:0 是「第 0 楼」)。 */
    function floorOf(v) {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'boolean' || typeof v === 'object') return null;
        const n = Number(v);
        if (!Number.isFinite(n)) return null;
        const f = Math.floor(n);
        return f < 0 ? null : f;
    }