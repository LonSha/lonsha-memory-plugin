/**
 * step-pipeline.js — [v3.106 缝合] 步骤流水线引擎（跳转控制流 + 逐级重试 + 保险丝）
 *
 * 【来源】缝合 lc2panda/engram src/modules/workflow/core/WorkflowEngine.ts，
 *         按本插件工程规范重写为可测纯函数模块（零依赖、IIFE 双导出、
 *         sleep/now 全部可注入 → 单测无需真实等待）。
 *
 * 【机制】本插件已有 enqueueRetry/processRetryQueue（针对「摘要折叠」几种固定 job
 *   的退避重试），但缺少一个通用的「多步骤顺序执行 + 控制流」骨架：
 *     - 步骤可返回控制指令：finish（提前成功结束）/ abort（主动失败）/
 *       jump（跳到指定步骤，用于「重试上一阶段」「回退补做」等）
 *     - 每步可带独立重试策略（maxAttempts / delay / fixed|exponential / retryIf 判定）
 *     - jump 带保险丝（默认 50 次）—— 步骤间互相跳转极易写成死循环，
 *       源码的 jumpCount 熔断就是为这个设计的
 *     - 取消检查点：每步执行前 + 重试等待后各查一次 signal，用户中止能立刻停
 *     - 每步可 ignoreFailure 标记「失败也继续」（如可选的增强步骤）
 *   执行结果返回结构化账本（stepsExecuted / attempts / durations / jumps），
 *   而不是只回一个 boolean —— 出问题能定位到「哪一步、第几次尝试、耗时多少」。
 *
 * 【与源码差异】
 *   - 纯函数：sleep / now / signal 由调用方注入，测试零等待
 *   - retryIf 自身抛错按「不重试」处理（源码会连带抛出，可能掩盖原始错误）
 *   - 增加 attempts / durationsMs / jumps 明细回报
 *   - 取消区分两种：步前取消（正常 return，cancelled=true）与步中取消（抛
 *     带 isCancellation 标记的错误，交调用方识别）—— 与源码语义一致但显式化
 */

(function (global) {
    'use strict';

    const DEFAULT_MAX_JUMPS = 50;

    function normStep(step, index) {
        const s = step || {};
        const name = String(s.name || ('step' + index)).trim();
        return {
            name,
            run: typeof s.run === 'function' ? s.run : (typeof s.execute === 'function' ? s.execute : null),
            retry: s.retry && typeof s.retry === 'object' ? s.retry : null,
            ignoreFailure: s.ignoreFailure === true,
        };
    }

    function normRetry(retry) {
        if (!retry) return null;
        const max = Number(retry.maxAttempts);
        const maxAttempts = Number.isFinite(max) && max > 0 ? Math.floor(max) : 1;
        const delay = Number.isFinite(Number(retry.delay)) && Number(retry.delay) >= 0 ? Number(retry.delay) : 0;
        return {
            maxAttempts,
            delay,
            backoff: retry.backoff === 'exponential' ? 'exponential' : 'fixed',
            retryIf: typeof retry.retryIf === 'function' ? retry.retryIf : null,
        };
    }

    /** 取消错误（步中取消时抛出，供调用方识别而非当成普通失败） */
    function cancellationError(lastError) {
        const e = new Error('UserCancelled');
        e.isCancellation = true;
        if (lastError) e.cause = lastError;
        return e;
    }

    function isCancelled(signal) {
        return !!(signal && signal.cancelled);
    }

    /**
     * 执行单个步骤（含重试）。
     * @returns {{ status:'ok'|'failed'|'cancelled', result:*, error:Error|null, attempts:number, durationMs:number }}
     */
    async function executeStep(step, context, env) {
        const cfg = normRetry(step.retry);
        const t0 = env.now();
        if (!cfg || cfg.maxAttempts <= 1) {
            try {
                const result = await step.run(context);
                return { status: 'ok', result, error: null, attempts: 1, durationMs: env.now() - t0 };
            } catch (e) {
                return { status: 'failed', result: null, error: e, attempts: 1, durationMs: env.now() - t0 };
            }
        }

        let attempt = 1;
        let delay = cfg.delay;
        let lastError = null;
        for (;;) {
            try {
                const result = await step.run(context);
                return { status: 'ok', result, error: null, attempts: attempt, durationMs: env.now() - t0 };
            } catch (e) {
                lastError = e;
                if (isCancelled(context.signal)) {
                    return { status: 'cancelled', result: null, error: e, attempts: attempt, durationMs: env.now() - t0 };
                }
                let shouldRetry = true;
                if (cfg.retryIf) {
                    try { shouldRetry = !!cfg.retryIf(e); } catch (_) { shouldRetry = false; }
                }
                if (!shouldRetry || attempt >= cfg.maxAttempts) {
                    return { status: 'failed', result: null, error: lastError, attempts: attempt, durationMs: env.now() - t0 };
                }
                if (delay > 0) await env.sleep(delay);
                if (isCancelled(context.signal)) {
                    return { status: 'cancelled', result: null, error: lastError, attempts: attempt, durationMs: env.now() - t0 };
                }
                if (cfg.backoff === 'exponential') delay *= 2;
                attempt++;
            }
        }
    }

    /**
     * 运行流水线。
     *
     * @param {object} definition { name, steps:Array<{name, run, retry?, ignoreFailure?}> }
     * @param {object} [initialContext] 初始上下文（浅拷贝后作为 ctx 传入各步）
     * @param {object} [options] { sleep, now, signal, maxJumps }
     * @returns {Promise<{
     *   ok:boolean, cancelled:boolean, aborted:boolean, finishedEarly:boolean,
     *   name:string, executed:string[], attempts:Object, durationsMs:Object,
     *   jumps:Array<object>, jumpCount:number, currentStep:string|null,
     *   error:Error|null, durationMs:number, context:object
     * }>}
     */
    async function run(definition, initialContext, options) {
        const def = definition || {};
        const opts = options || {};
        const steps = (Array.isArray(def.steps) ? def.steps : []).map(normStep);
        const maxJumps = Number.isFinite(Number(opts.maxJumps)) && Number(opts.maxJumps) > 0
            ? Math.floor(Number(opts.maxJumps)) : DEFAULT_MAX_JUMPS;
        const env = {
            sleep: typeof opts.sleep === 'function' ? opts.sleep : (ms) => new Promise(r => setTimeout(r, ms)),
            now: typeof opts.now === 'function' ? opts.now : () => Date.now(),
        };
        const ctx = Object.assign({}, initialContext || {});
        if (opts.signal && !ctx.signal) ctx.signal = opts.signal;

        const indexOf = new Map();
        steps.forEach((s, i) => { if (!indexOf.has(s.name)) indexOf.set(s.name, i); });

        const ledger = {
            ok: false,
            cancelled: false,
            aborted: false,
            finishedEarly: false,
            name: String(def.name || 'pipeline'),
            executed: [],
            attempts: {},
            durationsMs: {},
            jumps: [],
            jumpCount: 0,
            currentStep: null,
            error: null,
            durationMs: 0,
            context: ctx,
        };
        const t0 = env.now();

        try {
            for (let i = 0; i < steps.length; i++) {
                // 步前取消检查点
                if (isCancelled(ctx.signal)) {
                    ledger.cancelled = true;
                    break;
                }
                const step = steps[i];
                if (!step.run) throw new Error('step has no run function: ' + step.name);
                ledger.currentStep = step.name;
                ledger.context = ctx;

                const out = await executeStep(step, ctx, env);
                ledger.attempts[step.name] = (ledger.attempts[step.name] || 0) + out.attempts;
                ledger.durationsMs[step.name] = (ledger.durationsMs[step.name] || 0) + out.durationMs;

                if (out.status === 'cancelled') {
                    ledger.cancelled = true;
                    ledger.error = out.error;
                    throw cancellationError(out.error);
                }
                if (out.status === 'failed') {
                    if (step.ignoreFailure) continue;   // 可选的增强步骤：失败也继续
                    ledger.error = out.error;
                    throw out.error;
                }
                ledger.executed.push(step.name);

                // ---- 控制流 ----
                const r = out.result;
                if (r && typeof r === 'object') {
                    if (r.action === 'finish') { ledger.finishedEarly = true; break; }
                    if (r.action === 'abort') {
                        ledger.aborted = true;
                        const err = new Error(String(r.reason || ('step requested abort: ' + step.name)));
                        err.isAbort = true;
                        ledger.error = err;
                        throw err;
                    }
                    if (r.action === 'jump') {
                        const target = String(r.targetStep || '').trim();
                        const targetIndex = indexOf.get(target);
                        if (targetIndex === undefined) throw new Error('jump target not found: ' + target);
                        ledger.jumpCount += 1;
                        ledger.jumps.push({ from: step.name, to: target, reason: String(r.reason || '') });
                        if (ledger.jumpCount > maxJumps) {
                            throw new Error('pipeline detected infinite loop: jumped ' + maxJumps + ' times (last ' + step.name + ' -> ' + target + ')');
                        }
                        i = targetIndex - 1;   // 循环自增后落到 target
                        continue;
                    }
                }
            }
            ledger.ok = !ledger.cancelled && ledger.error === null;
        } catch (e) {
            if (e && e.isCancellation) {
                ledger.cancelled = true;
                ledger.error = e;
            } else {
                ledger.error = e;
                ledger.ok = false;
            }
        } finally {
            ledger.durationMs = env.now() - t0;
        }
        return ledger;
    }

    /** 流水线定义构造（校验 + 名称去重） */
    function definePipeline(name, steps) {
        const list = (Array.isArray(steps) ? steps : []).map(normStep);
        const seen = new Set();
        for (const s of list) {
            if (seen.has(s.name)) throw new TypeError('duplicate step name: ' + s.name);
            seen.add(s.name);
        }
        return { name: String(name || 'pipeline'), steps: list };
    }

    /** 账本 → 单行摘要（日志/诊断） */
    function summarizeLedger(ledger) {
        const l = ledger || {};
        const attempts = Object.entries(l.attempts || {}).map(([k, v]) => `${k}×${v}`).join(', ') || '(无)';
        return [
            `流水线 ${l.name}: ${l.ok ? '成功' : (l.cancelled ? '已取消' : '失败')}`,
            `  执行步骤: ${(l.executed || []).join(' → ') || '(无)'}`,
            `  尝试次数: ${attempts}`,
            `  跳转: ${l.jumpCount || 0} 次` + (l.jumps && l.jumps.length ? ' (' + l.jumps.map(j => j.from + '→' + j.to).join(', ') + ')' : ''),
            `  耗时: ${l.durationMs || 0}ms`,
            l.error ? `  错误: ${l.error.message}` : '',
        ].filter(Boolean).join('\n');
    }

    const api = {
        DEFAULT_MAX_JUMPS,
        definePipeline,
        run,
        executeStep,
        summarizeLedger,
        cancellationError,
        isCancelled,
        normRetry,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaStepPipeline = api;
})(typeof window !== 'undefined' ? window : globalThis);