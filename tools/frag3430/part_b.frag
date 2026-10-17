(function (root) {
    'use strict';
    /** 本面结构版本(形状一变必须抬这个数,防「旧下游配新面」静默错读)。 */
    const TB_VERSION = 1;
    /** 读数 kind(消费方可据此判「这是不是本面产出的读数」)。 */
    const TB_KIND = 'testimony_board';
    /** 事件争议状态四态(**不得压格**:有据 / 对立未决 / 判不开 / 已撤回)。 */
    const TB_STATES = Object.freeze(['supported', 'contested', 'undecided', 'withdrawn']);
    /** 单条说法的取证状态(**与 knowledge-trace 的动作面同源**,不另立同义名)。 */
    const TB_CLAIM_STATES = Object.freeze(['witnessed', 'relayed', 'rebutted', 'undecided']);
    /** 未裁决三档(**必须分列**:混成一格就分不出「为什么暂不能下结论」)。 */
    const UNRESOLVED = Object.freeze(['ambiguous', 'below-threshold', 'transmittal-only']);
    /** 说法立场三态(**只认显式声明**,不抽语义)。 */
    const TB_SIDES = Object.freeze(['affirm', 'deny', 'neutral']);
    /** 证据强度**档位**(不是百分比 —— M4-X5「不加虚构置信百分比」)。 */
    const TB_STRENGTH = Object.freeze(['strong', 'medium', 'weak', 'none']);
    /** 一手取证 via(亲历那一档的判据来源)。 */
    const FIRSTHAND_VIA = Object.freeze(['witnessed', 'document']);
    /** 转述类 via(听说那一档)。 */
    const HEARD_VIA = Object.freeze(['told', 'rumor', 'report', 'overheard', 'letter', 'message']);
    /** 强度档切点(只用于**分档**,不向外报数)。 */
    const STRENGTH_CUT = Object.freeze({ strong: 0.8, medium: 0.5 });
    /** 读数里**不得出现**的键名(百分比 / 置信度一族,M4-X5「不做」第二条)。 */
    const PERCENT_KEYS = Object.freeze(['percent', 'percentage', 'confidence', 'score', 'probability']);
    /** 单事件最多带回几条说法(有界,防灌爆注入面);截断必须可见。 */
    const MAX_TESTIMONIES = 24;
    /** 单角色最多几条(有界)。 */
    const MAX_PER_SIDE = 12;
    /** 低于此档的说法不足以定案(**逐字同源于 fact-version 的 DEFAULT_MIN_TRUST**)。 */
    const TB_MIN_TRUST = 0.5;
    /** 值级强度表(与 fact-version 的 ORIGIN_TRUST 同形同值;此处只用于分档,不外报)。 */
    const ORIGIN_TRUST = Object.freeze({ confirmed: 1, stated: 0.8, reported: 0.5, inferred: 0.3, system: 0 });
    /** via 级强度表(origin 缺席时的回落)。 */
    const VIA_TRUST = Object.freeze({ witnessed: 1, document: 0.8, told: 0.5, rumor: 0.3, report: 0.5, inferred: 0.3, deduced: 0.3 });
    /** 单行化(换行折叠为空格)。 */
    function oneLine(value) {
        return String(value == null ? '' : value).replace(/\s*[\r\n]+\s*/g, ' ').trim();
    }
    /** 裁剪(统一走 oneLine,免得读数里混进换行)。 */
    function clip(s, n) {
        const t = oneLine(s);
        return n && t.length > n ? t.slice(0, n) : t;
    }
    /** 有限非负整数,否则 null(**不写 0**:0 是「第 0 楼」)。 */
    function floorOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'boolean' || typeof v === 'object') return null;
        const n = Number(v);
        if (!Number.isFinite(n)) return null;
        const f = Math.floor(n);
        return f < 0 ? null : f;
    }
