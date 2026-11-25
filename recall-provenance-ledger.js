/* ========================================================
 * recall-provenance-ledger.js — [v3.483.0] 召回来源台账（注入可追）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   本插件已有 `summary-provenance` 解决**摘要**那一层的来源（摘要 ↔ 来源楼），
 *   有 `source-missing / no-hit / alias-filtered / validity-filtered /
 *   budget-trimmed / injected / unknown` 七个解释面（recall-explain 的 LADDER），
 *   但**没有一面回答「这一轮注进去的每一条，能不能指出它来自哪儿」**。
 *   实测：recall-explain 的 ids 只到上面七个，无 provenance 档。
 *   后果不是「少一条信息」，而是**模型可以凭摘要编**：注入块里一句 150 字的
 *   摘要，读的人无从判断它背后有没有原文、原文在几楼，于是把摘要当原始事实
 *   接着往下演——错误一旦进入正文，后续所有摘要都会继承它。
 *
 *   借鉴对象 lorecodex（st-tree-lore）：它规定「注入的场景**必须是检索模型
 *   真正读过原文的**」，未读过的场景不进注入（state.readScenes 白名单）。
 *   本仓不引入检索模型往返（那要额外调用与额外花费，此仓定位不需要），
 *   改为**等价可达的一半**：不要求「读过」，但要求「指得出」——
 *   每条注入都带上 `{floor, source, traceable}`，可追与不可追分列。
 *
 * 【为什么不直接做「未读过就不注入」】
 *   lorecodex 之所以能那样做，是因为它自己跑检索模型、有 read_scene 工具
 *   往返。本仓的召回是**纯本地算分**，没有「读取」这个动作可作凭证；
 *   硬造一个「读过」状态等于自己骗自己。做到「指得出」是可验证的真事：
 *   条目上有 floor / id / source 字段就能对上，没有就是没有。
 *
 * 【三态判定（三态而非两态：旧档不该被当成「编造」）】
 *   'traceable'     —— 有楼层或有稳定 id，能指回库里的某一条
 *   'untraceable'   —— 两者都没有 ⇒ **这才是可能被当摘要编的那类**
 *   'empty'         —— 空文本 / 非对象，本就不该注入（另一类问题，不混同）
 *
 * 【本模块只做三件事】
 *   ① 账：build 给每条注入条目标出 traceable / untraceable；
 *   ② 报：summary 给出「本轮注入 N 条、可追 M 条、不可追 K 条」与**逐条明细**；
 *   ③ 闸：`requireTraceable` 提供**可选**的严格模式（默认关），
 *      关闭时一律放行——不偷偷把用户的记忆挡在门外。
 *
 * 【不做什么（边界）】
 *   · 不删条目、不改条目字段（只读，返回新数组）；
 *   · 不新增存储键（无状态）；
 *   · 不读 window / DOM / 时钟：纯函数；
 *   · 不在无证据时判「编造」：untraceable 只说「指不出来」，不说「是假的」。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaRecallProvenanceLedger = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var STATES = {
        TRACEABLE: 'traceable',
        UNTRACEABLE: 'untraceable',
        EMPTY: 'empty'
    };

    function isObj(x) {
        return !!x && typeof x === 'object';
    }

    /** 有楼层（数或数字串）即视为可追：楼层是本仓最硬的地址。 */
    function floorOf(item) {
        if (!isObj(item)) return null;
        var cands = [item.floor];
        if (isObj(item.metadata)) cands.push(item.metadata.floor);
        for (var i = 0; i < cands.length; i += 1) {
            var n = cands[i];
            if (typeof n === 'number' && isFinite(n)) return n;
            if (typeof n === 'string' && n.trim() !== '' && isFinite(Number(n))) return Number(n);
        }
        return null;
    }

    /** 稳定 id（无楼层时的第二判据）：召回各源 id 形如 sum_120 / bm25 命中 id / hol_7。 */
    function idOf(item) {
        if (!isObj(item)) return '';
        var v = item.id;
        if (typeof v === 'string' && v.trim() !== '') return v.trim();
        if (typeof v === 'number' && isFinite(v)) return String(v);
        return '';
    }

    function textOf(item) {
        if (!isObj(item)) return '';
        if (typeof item.text === 'string') return item.text;
        if (typeof item.summary === 'string') return item.summary;
        return '';
    }

    /**
     * 单条判定。
     * 注意顺序：**先判 empty**。空文本条目即使带 floor 也不该算可追——
     * 它本身没有内容，说「可追」会掩盖「注入了空条目」这个更该报的问题。
     */
    function classify(item) {
        var text = textOf(item);
        if (!isObj(item) || !String(text).trim()) {
            return { status: STATES.EMPTY, floor: null, id: '', source: '' };
        }
        var floor = floorOf(item);
        var id = idOf(item);
        var source = (typeof item.source === 'string') ? item.source : '';
        if (floor !== null || id) {
            return { status: STATES.TRACEABLE, floor: floor, id: id, source: source };
        }
        return { status: STATES.UNTRACEABLE, floor: null, id: '', source: source };
    }

    /**
     * 给一批注入条目建账。
     * @returns {{entries:Array, counts:object, untraceable:Array}}
     *   entries 是**新对象**（浅拷贝 + prov 字段），不改入参条目。
     */
    function build(list) {
        var arr = Array.isArray(list) ? list : [];
        var entries = [];
        var untraceable = [];
        var counts = { checked: 0, traceable: 0, untraceable: 0, empty: 0 };
        for (var i = 0; i < arr.length; i += 1) {
            var it = arr[i];
            var c = classify(it);
            counts.checked += 1;
            counts[c.status] += 1;
            var row = {
                index: i,
                status: c.status,
                floor: c.floor,
                id: c.id,
                source: c.source,
                text: String(textOf(it)).slice(0, 80)
            };
            entries.push(row);
            if (c.status === STATES.UNTRACEABLE) untraceable.push(row);
        }
        return { entries: entries, counts: counts, untraceable: untraceable };
    }

    /**
     * 可选严格模式：只放行 traceable（empty 与 untraceable 都拦）。
     * **默认不启用**：启用前要先看 build() 的 untraceable 明细，
     * 确认这批条目确实都是问题条目，而不是本仓某来源本来就不带地址。
     */
    function requireTraceable(list) {
        var arr = Array.isArray(list) ? list : [];
        var kept = [];
        var dropped = [];
        for (var i = 0; i < arr.length; i += 1) {
            var c = classify(arr[i]);
            if (c.status === STATES.TRACEABLE) kept.push(arr[i]);
            else dropped.push({ index: i, status: c.status, item: arr[i] });
        }
        return { kept: kept, dropped: dropped };
    }

    /** 一行话读数，给 debug 面板与 recall-explain 的新档直接用。 */
    function summary(account) {
        var c = (account && account.counts) ? account.counts : { checked: 0, traceable: 0, untraceable: 0, empty: 0 };
        var parts = ['注入 ' + c.checked + ' 条', '可追 ' + c.traceable + ' 条'];
        if (c.untraceable) parts.push('**指不出来源 ' + c.untraceable + ' 条**');
        if (c.empty) parts.push('空条目 ' + c.empty + ' 条');
        return parts.join(' · ');
    }

    return {
        STATES: STATES,
        floorOf: floorOf,
        idOf: idOf,
        classify: classify,
        build: build,
        requireTraceable: requireTraceable,
        summary: summary
    };
}));