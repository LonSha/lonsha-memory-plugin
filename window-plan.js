/**
 * window-plan.js — [R27-B] 出窗撤回：只撤自己隐藏的、只撤已覆盖前缀
 *
 * 【来源】照 shrink1024/fish-memory 的 src/core/window.js（18 行）行为重写。
 *         该仓无 LICENSE，未复制任何代码；重写其三条不变量并按同一套边界自测。
 *
 * 【要解决什么】
 *   「最近 N 轮保留原文、更早的楼层用摘要顶替」这件事，若实现成「我算好了就隐藏」，
 *   会踩两个坑：
 *     ① 把**别人**隐藏的楼层也当自己的撤了（用户手动隐藏、其它插件的 is_system）；
 *     ② 撤回撤到**还没处理过**的楼层上（摘要还没生成就先把原文藏了 = 剧情凭空消失）。
 *
 * 【三条纪律】
 *   ① **不认领外部隐藏**：只有 hiddenBy === owner 的楼层才可能被本模块改动。
 *      别人的隐藏一律返回 null（不是「恢复」，是「不归我管」）。
 *   ② **只撤已覆盖前缀**：covered = messages 与 processedKeys 逐位相等的最长前缀。
 *      比它更早才有「已摘要」的凭据。
 *   ③ **边界取小**：boundary = min(最近 N 轮的起点, covered)，两个约束谁更紧听谁的。
 *
 * 【单向性】
 *   本模块只产出「变更意图」（hide / restore），不写账、不改入参。
 *   同一个输入算两次必得同一结果（纯函数），供上层做幂等落盘。
 *
 * 【与源码差异（逐条可指认）】
 *   · recentTurns / canOmit / owner 非法时降级为读数（源码直接 invariant 抛错）；
 *   · 增 readings 面：本次将隐藏几层、恢复几层、跳过几层外部隐藏；
 *   · 增 line() 诊断行与 selfCheck()；
 *   · 返回面附带 `owner` 与 `boundary`，供落盘方二次校验「这确实是自己的账」。
 */
(function (root) {
    'use strict';

    /** 本面结构版本（形状一变必须抬这个数）。 */
    const WP_VERSION = 1;
    /** 读数 kind。 */
    const WP_KIND = 'window_plan';
    /** 默认保留轮数（与源码默认一致）。 */
    const DEFAULT_RECENT_TURNS = 12;
    /** 轮数上限（1–1000，源码同）。 */
    const MIN_TURNS = 1;
    const MAX_TURNS = 1000;

    /** 归一化保留轮数（1–1000 整数，非法回落默认并记读数）。 */
    function normTurns(value, carry) {
        if (value === undefined || value === null) return DEFAULT_RECENT_TURNS;
        const n = Math.floor(Number(value));
        if (!Number.isFinite(n) || n < MIN_TURNS || n > MAX_TURNS) {
            if (carry) carry.push('recentTurns=' + String(value) + ' → ' + DEFAULT_RECENT_TURNS);
            return DEFAULT_RECENT_TURNS;
        }
        return n;
    }

    /** 消息 key（缺 key 时合成，保证对账稳定）。 */
    function keyOf(message, index) {
        const k = message && message.key;
        if (k !== undefined && k !== null && String(k).length) return String(k);
        return '#' + String(index) + ':' + String((message && message.role) || '?');
    }

    /**
     * 计算本次应发生的隐藏 / 恢复意图。
     * @param {Array} messages 全量消息（含 hidden / hiddenBy 现状）
     * @param {Array} processedKeys 已处理消息的 key 序列
     * @param {{enabled?:boolean, recentTurns?:number, owner?:string, canOmit?:Function}} options
     * @returns {{plan:Array, readings:object, owner:string, boundary:number, line:string}}
     */
    function planWindow(messages, processedKeys, options) {
        const degraded = [];
        const list = Array.isArray(messages) ? messages : [];
        if (!Array.isArray(messages) && messages !== undefined) degraded.push('messages 非数组');
        const done = Array.isArray(processedKeys) ? processedKeys : [];
        if (!Array.isArray(processedKeys) && processedKeys !== undefined) degraded.push('processedKeys 非数组');
        const opt = options && typeof options === 'object' ? options : {};
        if (!options) degraded.push('options 缺失');

        const enabled = opt.enabled !== false;
        const owner = typeof opt.owner === 'string' && opt.owner.length ? opt.owner : 'lonsha-window';
        const recentTurns = normTurns(opt.recentTurns, degraded);
        const canOmit = typeof opt.canOmit === 'function' ? opt.canOmit : null;
        if (opt.canOmit !== undefined && opt.canOmit !== null && !canOmit) degraded.push('canOmit 非函数（按全部可撤处理）');

        // 最近 N 轮的起点：只数「玩家开口」且不是外部隐藏的位置。
        const userStarts = [];
        for (let i = 0; i < list.length; i++) {
            const m = list[i];
            if (!m || m.role !== 'user') continue;
            const hidden = m.hidden === true;
            const mine = m.hiddenBy === owner;
            if (!hidden || mine) userStarts.push(i);
        }
        const start = userStarts.length > recentTurns ? userStarts[userStarts.length - recentTurns] : 0;

        // 已覆盖前缀：逐位对账。
        let covered = 0;
        while (covered < done.length && covered < list.length
            && keyOf(list[covered], covered) === String(done[covered])) {
            covered++;
        }

        const boundary = enabled ? Math.min(start, covered) : 0;

        const plan = [];
        const readings = {
            kind: WP_KIND,
            version: WP_VERSION,
            total: list.length,
            enabled: enabled,
            recentTurns: recentTurns,
            start: start,
            covered: covered,
            boundary: boundary,
            willHide: 0,
            willRestore: 0,
            foreignHidden: 0,
            kept: 0,
            skippedByCanOmit: 0,
            degraded: degraded
        };

        for (let index = 0; index < list.length; index++) {
            const m = list[index];
            if (!m || typeof m !== 'object') continue;
            const mine = m.hiddenBy === owner;
            const hidden = m.hidden === true;
            if (hidden && !mine) readings.foreignHidden++;

            const inside = enabled && index < boundary;
            const omit = inside ? (canOmit ? canOmit(m, index) !== false : true) : false;
            const shouldHide = inside && omit;

            if (shouldHide && !hidden) {
                plan.push({ key: keyOf(m, index), index: index, hidden: true, hiddenBy: owner });
                readings.willHide++;
                continue;
            }
            if (!shouldHide && mine && hidden) {
                // 只撤自己的：mine 为真才走到这里。
                plan.push({ key: keyOf(m, index), index: index, hidden: false, hiddenBy: null });
                readings.willRestore++;
                continue;
            }
            if (inside && !omit && !hidden) readings.skippedByCanOmit++;
            readings.kept++;
        }

        readings.planCount = plan.length;
        readings.line = planLine(readings);
        return { plan: plan, readings: readings, owner: owner, boundary: boundary, line: readings.line };
    }

    /** 诊断行（面板/报告同源）。 */
    function planLine(readings) {
        const r = readings && typeof readings === 'object' ? readings : {};
        return [
            '保留最近' + String(r.recentTurns ?? DEFAULT_RECENT_TURNS) + '轮',
            '已覆盖' + String(r.covered ?? 0) + '楼',
            '撤回边界' + String(r.boundary ?? 0),
            '隐藏' + String(r.willHide ?? 0),
            '恢复' + String(r.willRestore ?? 0),
            '外部隐藏' + String(r.foreignHidden ?? 0) + '不认领'
        ].join('｜');
    }

    /**
     * 自检：三条纪律各一条反例。
     * 返回 {ok, checks:[{name, ok}]}，供 engine-self-check 与测试共用。
     */
    function selfCheck() {
        const owner = 'me';
        const msgs = [
            { key: 'm0', role: 'user', content: '早', hidden: true, hiddenBy: 'other' },
            { key: 'm1', role: 'assistant', content: '早答' },
            { key: 'm2', role: 'user', content: '中' },
            { key: 'm3', role: 'assistant', content: '中答' },
            { key: 'm4', role: 'user', content: '近' },
            { key: 'm5', role: 'assistant', content: '近答' },
            { key: 'm6', role: 'user', content: '最近' }
        ];
        // 已覆盖到 m2（含），最近 1 轮起点 = m6 的下标 6 → boundary = min(6, 3) = 3
        const r = planWindow(msgs, ['m0', 'm1', 'm2'], { enabled: true, recentTurns: 1, owner: owner });
        const hides = r.plan.filter((p) => p.hidden === true).map((p) => p.key);
        const checks = [
            ['不认领外部隐藏 m0', hides.indexOf('m0') === -1],
            ['只撤已覆盖前缀（m1 可撤，m3 不可）', hides.indexOf('m1') >= 0 && hides.indexOf('m3') === -1],
            ['边界取小', r.boundary === 3],
            ['纯函数不改入参', msgs[0].hidden === true && msgs[0].hiddenBy === 'other']
        ];
        return {
            ok: checks.every((x) => x[1]),
            checks: checks.map((x) => ({ name: x[0], ok: !!x[1] }))
        };
    }

    const api = {
        WP_VERSION: WP_VERSION,
        WP_KIND: WP_KIND,
        DEFAULT_RECENT_TURNS: DEFAULT_RECENT_TURNS,
        keyOf: keyOf,
        planWindow: planWindow,
        planLine: planLine,
        selfCheck: selfCheck
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaWindowPlan = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);
