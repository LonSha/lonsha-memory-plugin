/**
 * event-chain.js — [v3.108 缝合] 事件链不变量校验（智能体运行日志的可验证性）
 *
 * 【来源】缝合 m61-oss/st-bionic-memory（BME）domain/memory-contract.js 的
 *         AGENT_EVENT_TYPE + AGENT_EVENT_TRANSITIONS + isAgentEventTransitionAllowed，
 *         按本插件工程规范重写为可测纯函数模块（零依赖、IIFE 双导出、不持有状态）。
 *
 * 【机制】本插件的 OpLog（v3.54 事件溯源日志）记录「什么发生过」，但没有记录
 *   「发生顺序是否可能」——一个 run 的生命周期是：
 *     run_started → model_requested → assistant_message → tool_started →
 *     tool_finished / tool_interrupted → （循环）→ run_completed
 *   其中 run_failed / run_cancelled / run_suspended 是**终态**：出现之后同一条链上
 *   再出现任何事件都是不可能的——这通常意味着真实的故障（例如请求已失败却又收到
 *   assistant_message、用户已取消却仍写入 tool_finished、流式输出被截断后补发事件）。
 *   本模块把这套不变量做成可校验纯函数：
 *     - EVENT_TYPES / TERMINAL_TYPES / ALLOWED_TRANSITIONS 常量表（与源码一致）
 *     - isTerminal(type)：终态判定（源码 isTerminalAgentEventType）
 *     - canFollow(previous, next)：单步迁移合法性（含源码的「任意终态事件可随时
 *       直接结束」与「RUN_COMPLETED 必须由 ASSISTANT_MESSAGE 转入」两条特殊规则）
 *     - append(chain, event)：向链尾追加（非法则返回 ok:false + reason，**不抛错**，
 *       便于调用方记录审计问题而不是中断主链路）
 *     - validateChain(chain)：整链校验，给出首个违规位置与原因
 *     - summarizeChain(chain)：事件类型计数 / 是否终态 / 末事件（诊断用）
 *
 * 【与源码差异】
 *   - 源码把迁移表绑在 Map<Set> 上并只暴露一个布尔；本实现额外回报
 *     { ok, reason, expected }，能直接进审计报告。
 *   - 增加 validateChain（整链历史校验，源码只有单步判定），用于「事后审计旧日志」。
 *   - 增加 append 的非抛错语义（日志写入绝不能因为校验失败而中断主链路）。
 *   - 终态后「同类型重复上报」视为违规（源码同样拒绝，此处显式回报 reason）。
 */

(function (global) {
    'use strict';

    const EVENT_TYPES = Object.freeze({
        RUN_STARTED: 'run_started',
        MODEL_REQUESTED: 'model_requested',
        ASSISTANT_MESSAGE: 'assistant_message',
        TOOL_STARTED: 'tool_started',
        TOOL_FINISHED: 'tool_finished',
        TOOL_INTERRUPTED: 'tool_interrupted',
        CONTEXT_SUMMARY_CREATED: 'context_summary_created',
        CONTEXT_COMPACTED: 'context_compacted',
        RUN_COMPLETED: 'run_completed',
        RUN_SUSPENDED: 'run_suspended',
        RUN_FAILED: 'run_failed',
        RUN_CANCELLED: 'run_cancelled',
    });

    const TERMINAL_TYPES = Object.freeze([
        EVENT_TYPES.RUN_COMPLETED,
        EVENT_TYPES.RUN_SUSPENDED,
        EVENT_TYPES.RUN_FAILED,
        EVENT_TYPES.RUN_CANCELLED,
    ]);

    // 与源码 AGENT_EVENT_TRANSITIONS 等价（Map<Set> 以普通对象表达）
    const ALLOWED_TRANSITIONS = Object.freeze({
        run_started: Object.freeze(['model_requested']),
        model_requested: Object.freeze(['assistant_message', 'context_summary_created']),
        context_summary_created: Object.freeze(['model_requested', 'context_compacted']),
        context_compacted: Object.freeze(['model_requested']),
        assistant_message: Object.freeze(['tool_started', 'run_completed']),
        tool_started: Object.freeze(['tool_finished', 'tool_interrupted']),
        tool_finished: Object.freeze(['tool_started', 'model_requested']),
        tool_interrupted: Object.freeze([]),
        run_completed: Object.freeze([]),
        run_suspended: Object.freeze([]),
        run_failed: Object.freeze([]),
        run_cancelled: Object.freeze([]),
    });

    const TYPE_SET = new Set(Object.values(EVENT_TYPES));
    const TERMINAL_SET = new Set(TERMINAL_TYPES);

    function isEventType(v) {
        return TYPE_SET.has(String(v == null ? '' : v));
    }

    function isTerminal(v) {
        return TERMINAL_SET.has(String(v == null ? '' : v));
    }

    /**
     * 单步迁移判定（与源码 isAgentEventTransitionAllowed 语义一致）。
     * 规则：① 非法类型为假；② 终态之后一律为假；
     *      ③ 目标为非 RUN_COMPLETED 的终态事件时可随时直接结束（失败/取消/挂起）；
     *      ④ 其余走迁移表（RUN_COMPLETED 只能由 ASSISTANT_MESSAGE 转入）。
     */
    function canFollow(previous, next) {
        const p = String(previous == null ? '' : previous);
        const n = String(next == null ? '' : next);
        if (!isEventType(p) || !isEventType(n)) return false;
        if (isTerminal(p)) return false;
        if (isTerminal(n) && n !== EVENT_TYPES.RUN_COMPLETED) return true;
        return (ALLOWED_TRANSITIONS[p] || []).includes(n);
    }

    function lastType(chain) {
        const list = Array.isArray(chain) ? chain : [];
        for (let i = list.length - 1; i >= 0; i--) {
            const t = list[i] && (list[i].type != null ? list[i].type : list[i]);
            if (t != null) return String(t);
        }
        return null;
    }

    /**
     * 向链尾追加事件（非抛错语义）。
     * @returns {{ ok:boolean, chain:Array, reason:string, expected:string[] }}
     */
    function append(chain, event) {
        const list = Array.isArray(chain) ? chain.slice() : [];
        const raw = event && typeof event === 'object' ? event : { type: event };
        const type = String(raw.type == null ? '' : raw.type);
        if (!isEventType(type)) {
            return { ok: false, chain: list, reason: 'unknown event type: ' + type, expected: [] };
        }
        const prev = lastType(list);
        if (prev !== null && !canFollow(prev, type)) {
            return {
                ok: false,
                chain: list,
                reason: 'event chain violation: ' + prev + ' -> ' + type,
                expected: isTerminal(prev) ? [] : (ALLOWED_TRANSITIONS[prev] || []).slice(),
            };
        }
        list.push(Object.assign({}, raw, { type }));
        return { ok: true, chain: list, reason: '', expected: [] };
    }

    /** 整链校验（事后审计旧日志）：返回首个违规位置与原因 */
    function validateChain(chain) {
        const list = Array.isArray(chain) ? chain : [];
        const issues = [];
        let prev = null;
        for (let i = 0; i < list.length; i++) {
            const raw = list[i];
            const type = String((raw && (raw.type != null ? raw.type : raw)) || '');
            if (!isEventType(type)) {
                issues.push({ index: i, type, reason: 'unknown event type: ' + type });
                return { valid: false, issues, stoppedAt: i, lastType: prev };
            }
            if (prev !== null && !canFollow(prev, type)) {
                issues.push({ index: i, type, previous: prev, reason: 'event chain violation: ' + prev + ' -> ' + type });
                return { valid: false, issues, stoppedAt: i, lastType: prev };
            }
            prev = type;
        }
        return { valid: true, issues, stoppedAt: -1, lastType: prev };
    }

    /** 链摘要：类型计数 / 是否终态 / 末事件 / 工具调用轮次 */
    function summarizeChain(chain) {
        const list = Array.isArray(chain) ? chain : [];
        const counts = {};
        let toolRounds = 0;
        for (const raw of list) {
            const type = String((raw && (raw.type != null ? raw.type : raw)) || '');
            if (!type) continue;
            counts[type] = (counts[type] || 0) + 1;
            if (type === EVENT_TYPES.TOOL_STARTED) toolRounds += 1;
        }
        const last = lastType(list);
        return {
            length: list.length,
            counts,
            toolRounds,
            lastType: last,
            terminal: last !== null && isTerminal(last),
            started: Object.prototype.hasOwnProperty.call(counts, EVENT_TYPES.RUN_STARTED),
        };
    }

    const api = {
        EVENT_TYPES,
        TERMINAL_TYPES,
        ALLOWED_TRANSITIONS,
        isEventType,
        isTerminal,
        canFollow,
        append,
        validateChain,
        summarizeChain,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaEventChain = api;
})(typeof window !== 'undefined' ? window : globalThis);