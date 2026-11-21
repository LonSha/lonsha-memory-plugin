/**
 * maintenance-schedule.js — [R27-A] 维护节奏：按 AI 回复条数计拍、暂缓最新一条
 *
 * 【来源】照 shrink1024/fish-memory 的 src/runtime/maintenance-policy.js（54 行）
 *         的**行为**重写。该仓无 LICENSE（README 明写「许可证尚未确定」），
 *         故一行代码未复制，只重写其可观测语义，并按其边界自测。
 *
 * 【要解决什么】
 *   维护（摘要 / 抽取）若「每楼都跑」，调用数随楼层线性涨；若「攒够 N 楼再跑」，
 *   则最新一条必须有明确归属 —— 否则玩家刚发的输入会先被记进记忆，而它的回复
 *   还没写出来，记忆里就留下「玩家说了话、没人回」这种半句事实。
 *
 * 【五条机制】
 *   ① 按 **AI 回复条数** 计拍（不是楼层、不是字数）：节奏锚在 assistant 上，
 *      玩家连续输入、系统消息都不占拍。
 *   ② 暂缓最新 keep 条回复（默认 1）：最后那条还在可能的 swipe / 重生成里，不动。
 *   ③ **连玩家的对应输入一起暂缓**：从暂缓起点往前退到最近的 assistant，
 *      把中间的 user 一并划进暂缓区 —— 「回复没准备好时，它的问题也不许先落账」。
 *   ④ **暂缓 ≠ 丢弃**：本模块只答「哪一段可以进维护」，不答「哪一段能被模型看见」。
 *      暂缓区原文照旧发给正文模型；消费方不得据此隐藏楼层（deferredKeys 只是读数）。
 *   ⑤ **已覆盖前缀不可退**：end 一律不低于 covered。否则一次暂缓会把处理过的楼层
 *      重新算回待处理，造成重复落账（本仓反复治过的「重放重复累加」形态）。
 *
 * 【四个触发态】（原实现三态；blocked 是新增的第四态，见「与源码差异」）
 *   interval —— 可处理区回复数已达 every，本轮该维护；
 *   waiting  —— 有未处理消息，但可处理区回复不够，等；
 *   blocked  —— 有未处理消息，但可处理区整段为空（全被暂缓）。**与 waiting 成因不同**：
 *               waiting 是「攒得不够」，blocked 是「一条都不许动」，压成一态会让
 *               面板显示「等攒够」而实际在「等回复稳定」，是两种相反的处置；
 *   none     —— 没有未处理消息。
 *
 * 【与源码差异（逐条可指认）】
 *   · keep 归一为 >=0 整数（源码若传负数会得出 NaN 的 end）；
 *   · messages 比 processed 短时安全前进（源码靠 `?.` 隐式兜底，这里显式判边界）；
 *   · 增 readings 面与 line()，供诊断/面板消费（源码只返回裸读数）；
 *   · 增 blocked 触发态；
 *   · 全程纯函数、零写、不抛（畸形输入降级为读数并在 `degraded` 里点名）。
 *
 * 【纪律】
 *   ① 纯函数零写：不改 messages、不改 processed、不写任何账；
 *   ② 不抛：输入畸形一律降级为读数；
 *   ③ 不丢楼：任何未处理消息必落在 eligible 或 deferred 之一，绝不 dropped；
 *   ④ 不拿「省了几次调用」当成绩：本模块只排期，不判价值。
 */
(function (root) {
    'use strict';

    /** 本面结构版本（形状一变必须抬这个数，防「旧下游配新面」静默错读）。 */
    const MS_VERSION = 1;
    /** 读数 kind（消费方可据此判「这是不是本面产出的读数」）。 */
    const MS_KIND = 'maintenance_schedule';
    /** 触发态闭集。 */
    const TRIGGERS = Object.freeze(['interval', 'waiting', 'blocked', 'none']);
    /** 默认节奏：每 2 条回复维护一次；暂缓最新 1 条。 */
    const DEFAULT_EVERY = 2;
    const DEFAULT_KEEP = 1;
    /** 节奏上限（防把 every 配成 1e9 后永远不动，与「关掉」同形却不可诊断）。 */
    const MAX_EVERY = 1000;
    /** 暂缓上限（一次性暂缓 999 条等于关掉维护）。 */
    const MAX_KEEP = 100;

    /** 归一化「每 N 条回复一次」（>=1 整数，非法回落默认并记读数）。 */
    function normEvery(value, carry) {
        if (value === undefined || value === null) return DEFAULT_EVERY;
        const n = Math.floor(Number(value));
        if (!Number.isFinite(n) || n < 1 || n > MAX_EVERY) {
            if (carry) carry.push('maintenanceEvery=' + String(value) + ' → ' + DEFAULT_EVERY);
            return DEFAULT_EVERY;
        }
        return n;
    }

    /** 归一化「暂缓最新 N 条」（>=0 整数；0 合法 = 不暂缓；非法回落默认）。 */
    function normKeep(value, carry) {
        if (value === undefined || value === null) return DEFAULT_KEEP;
        const n = Math.floor(Number(value));
        if (!Number.isFinite(n) || n < 0 || n > MAX_KEEP) {
            if (carry) carry.push('maintenanceKeepRecent=' + String(value) + ' → ' + DEFAULT_KEEP);
            return DEFAULT_KEEP;
        }
        return n;
    }

    /**
     * 是不是一条「有内容的 AI 回复」。
     * 空回复（失败、被中止、只有空白）不占拍 —— 否则一次 500 错误就白白吃掉一拍。
     * rawHasContent 是宿主给的原始判定（正文被清洗过时仍能判真假）。
     */
    function isReply(message) {
        if (!message || typeof message !== 'object') return false;
        if (message.role !== 'assistant') return false;
        if (message.rawHasContent !== undefined && message.rawHasContent !== null) {
            return message.rawHasContent === true;
        }
        return String(message.content ?? '').trim().length > 0;
    }

    /** 消息 key（缺 key 时用角色+序号合成，保证可对账且不与真 key 撞）。 */
    function keyOf(message, index) {
        const k = message && message.key;
        if (k !== undefined && k !== null && String(k).length) return String(k);
        return '#' + String(index) + ':' + String((message && message.role) || '?');
    }

    /**
     * 计算本轮维护排期。
     * @param {Array} messages 全量消息（按楼层序，index = 楼层）
     * @param {Array} processed 已处理消息的 key 序列（前缀对账用）
     * @param {{maintenanceEvery?:number, maintenanceKeepRecent?:number}} settings
     * @returns {object} 排期与读数（永不抛）
     */
    function computeSchedule(messages, processed, settings) {
        const degraded = [];
        const list = Array.isArray(messages) ? messages : [];
        if (!Array.isArray(messages) && messages !== undefined) degraded.push('messages 非数组');
        const done = Array.isArray(processed) ? processed : [];
        if (!Array.isArray(processed) && processed !== undefined) degraded.push('processed 非数组');
        const cfg = settings && typeof settings === 'object' ? settings : {};
        if (!settings) degraded.push('settings 缺失');
        const every = normEvery(cfg.maintenanceEvery, degraded);
        const keep = normKeep(cfg.maintenanceKeepRecent, degraded);

        // ② 已覆盖前缀：逐位对账，首个不相等处即处理边界。
        //    messages 比 processed 短时也要停下（那是「记录多于消息」的畸形态）。
        let covered = 0;
        while (covered < done.length && covered < list.length
            && keyOf(list[covered], covered) === String(done[covered])) {
            covered++;
        }
        if (covered < done.length && covered >= list.length) degraded.push('processed 长于 messages（已按 messages 截断）');

        // ① 只看 assistant 占拍。
        const replyIndexes = [];
        for (let i = 0; i < list.length; i++) if (isReply(list[i])) replyIndexes.push(i);

        // ② 暂缓最新 keep 条回复：end 落在「第 len-keep 条回复」的位置上。
        let end = list.length;
        let deferredByKeep = 0;
        if (keep > 0 && replyIndexes.length) {
            const anchor = Math.max(0, replyIndexes.length - keep);
            end = replyIndexes[anchor];
            deferredByKeep = list.length - end;
            // ③ 连玩家对应输入一起暂缓：从 end-1 往前走，遇 assistant 停，遇 user 收。
            for (let i = end - 1; i >= 0; i--) {
                const role = list[i] && list[i].role;
                if (role === 'assistant') break;
                if (role === 'user') end = i;
            }
        }

        // ⑤ 已覆盖前缀不可退。
        if (end < covered) {
            degraded.push('暂缓区起点早于已覆盖前缀，已抬到 covered（防重复落账）');
            end = covered;
        }
        if (end > list.length) end = list.length;

        const eligible = list.slice(covered, end);
        const deferred = list.slice(end);
        let pendingReplies = 0;
        for (let i = covered; i < list.length; i++) if (isReply(list[i])) pendingReplies++;
        let eligibleReplies = 0;
        for (let i = 0; i < eligible.length; i++) if (isReply(eligible[i])) eligibleReplies++;
        const retainedReplies = pendingReplies - eligibleReplies;

        const pendingCount = Math.max(0, list.length - covered);
        const eligibleCount = Math.max(0, end - covered);
        const deferredCount = Math.max(0, list.length - end);

        // ④ 不丢楼：eligible + deferred 必须覆盖全部未处理消息。
        if (eligibleCount + deferredCount !== pendingCount) {
            degraded.push('未处理消息未被 eligible/deferred 全覆盖（' + eligibleCount + '+' + deferredCount + '≠' + pendingCount + '）');
        }

        let trigger;
        if (pendingCount === 0) trigger = 'none';
        else if (eligibleReplies >= every) trigger = 'interval';
        else if (eligibleCount === 0) trigger = 'blocked';
        else trigger = 'waiting';

        const schedule = {
            kind: MS_KIND,
            version: MS_VERSION,
            every: every,
            keep: keep,
            covered: covered,
            eligibleEnd: end,
            eligibleStart: covered,
            eligibleCount: eligibleCount,
            deferredCount: deferredCount,
            pendingReplies: pendingReplies,
            eligibleReplies: eligibleReplies,
            retainedReplies: retainedReplies,
            eligiblePendingCount: eligibleCount,
            retainedPendingCount: deferredCount,
            deferredByKeep: deferredByKeep,
            waiting: pendingCount > 0 && eligibleReplies < every,
            trigger: trigger,
            degraded: degraded
        };
        schedule.line = planLine(schedule);
        return schedule;
    }

    /**
     * 暂缓区的消息 key 列表（**只是读数**：用于断言「这些楼层没进维护」）。
     * 严禁消费方拿它去隐藏楼层 —— 暂缓区原文照旧发给正文模型。
     */
    function deferredKeys(schedule, messages) {
        const end = schedule && Number.isFinite(schedule.eligibleEnd) ? schedule.eligibleEnd : 0;
        const list = Array.isArray(messages) ? messages : [];
        const out = [];
        for (let i = Math.max(0, end); i < list.length; i++) out.push(keyOf(list[i], i));
        return out;
    }

    /** 可处理区的消息 key 列表（本轮真正要进维护的那一段）。 */
    function eligibleKeys(schedule, messages) {
        const start = schedule && Number.isFinite(schedule.eligibleStart) ? schedule.eligibleStart : 0;
        const end = schedule && Number.isFinite(schedule.eligibleEnd) ? schedule.eligibleEnd : 0;
        const list = Array.isArray(messages) ? messages : [];
        const out = [];
        for (let i = Math.max(0, start); i < Math.max(start, end) && i < list.length; i++) out.push(keyOf(list[i], i));
        return out;
    }

    /** 诊断行（面板/报告同源，不另写一份）。 */
    function planLine(schedule) {
        const s = schedule && typeof schedule === 'object' ? schedule : {};
        const parts = [
            '节奏 每' + String(s.every ?? DEFAULT_EVERY) + '条回复',
            '暂缓最新' + String(s.keep ?? DEFAULT_KEEP) + '条',
            '已覆盖' + String(s.covered ?? 0) + '楼',
            '可处理' + String(s.eligibleCount ?? 0) + '楼(回复' + String(s.eligibleReplies ?? 0) + ')',
            '暂缓' + String(s.deferredCount ?? 0) + '楼',
            '本轮=' + String(s.trigger ?? 'none')
        ];
        return parts.join('｜');
    }

    /** 自检（供 engine-self-check 与测试共用；不依赖任何宿主状态）。 */
    function selfCheck() {
        const msgs = [
            { key: 'a', role: 'user', content: '问一' },
            { key: 'b', role: 'assistant', content: '答一' },
            { key: 'c', role: 'user', content: '问二' },
            { key: 'd', role: 'assistant', content: '答二' }
        ];
        const s1 = computeSchedule(msgs, [], { maintenanceEvery: 1, maintenanceKeepRecent: 1 });
        const s2 = computeSchedule(msgs, [], { maintenanceEvery: 2, maintenanceKeepRecent: 0 });
        const checks = [
            // 4 条消息：[a 问一][b 答一][c 问二][d 答二]，暂缓最新 1 条回复(d)
            // ⇒ 起点 d 的下标 3，再往前退把提问 c 一起暂缓 ⇒ eligibleEnd = 2。
            ['暂缓最新一条回复', s1.trigger === 'interval' && s1.eligibleEnd === 2],
            ['暂缓区连玩家输入 c 一起暂缓', s1.eligibleEnd === 2],
            ['不暂缓时可处理到末尾', s2.eligibleEnd === 4],
            ['不丢楼', s1.eligibleCount + s1.deferredCount === 4]
        ];
        return {
            ok: checks.every((x) => x[1]),
            checks: checks.map((x) => ({ name: x[0], ok: !!x[1] }))
        };
    }

    const api = {
        MS_VERSION: MS_VERSION,
        MS_KIND: MS_KIND,
        TRIGGERS: TRIGGERS,
        DEFAULT_EVERY: DEFAULT_EVERY,
        DEFAULT_KEEP: DEFAULT_KEEP,
        isReply: isReply,
        keyOf: keyOf,
        computeSchedule: computeSchedule,
        deferredKeys: deferredKeys,
        eligibleKeys: eligibleKeys,
        planLine: planLine,
        selfCheck: selfCheck
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaMaintenanceSchedule = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);
