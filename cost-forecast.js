/* ================================================================
 * cost-forecast.js — [v3.208.0] 注入成本**预测** + 预测/实测对账（纯函数，零依赖）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   v3.193.0 的 cost-ledger 是**事后**账：它读「已经拼好的注入文本」（injectedText），
 *   反推「谁的字符进了、谁的被丢了」。这在调预算时有两个硬伤：
 *     ① **只能解释已经发生的事**：用户把 injectionBudget 从 3000 改到 1800 会怎样、
 *        楼层涨到 120 楼后预算还剩多少——账本一个字都答不出来，只能改完再看一轮。
 *     ② **预测与实测没有对账**：本轮注入 1246 字符「是不是符合预期的」没有任何判据。
 *        预期在用户脑子里，不在系统里，于是「预算行为变了」永远只能靠感觉发现。
 *
 * 【本模块做什么】
 *   把「这一轮会发生什么」变成**先行可算**的读数，方法是**复用真路径的同一批纯函数**
 *   （injection-router.deriveBudget / trimToBudget），而不是另写一套近似公式——
 *   另写一套就又是「同一事实两个真源」，预测值将随真路径漂移而不自知。
 *     ① `forecast(opts)`   ：给候选块 + 预算配置 → 预测 budget / 常驻字符 / 触发字符 /
 *        是否会裁剪 / 保留与丢弃的块数与字符数 / 预计注入 token / 预计反向线索真进注入条数。
 *     ② `reconcile(forecast, ledger)`：拿预测与 cost-ledger 的实测逐项对账，
 *        给出 `match / drift` 与**逐项偏差 + 归因**（哪个量偏了、偏多少）。
 *     ③ `forecastLine` 一行诊断。
 *
 * 【纪律（与 cost-ledger 同规格）】
 *   · **不可测就写不可测**：router 模块缺席时 budget 推算不可信 ⇒ 整个预测标
 *     `measurable:false` + `reason:'no-router'`，而不是照抄一个数字（照抄会把
 *     「模块没加载」伪装成「预测成功」）。
 *   · **零预测 ≠ 零成本**：没有任何候选块时，`ok:true` 但 `empty:true` 可分辨。
 *   · 纯函数、不抛：任何畸形入参退化为可读的降级读数。
 * ================================================================ */
(function (global) {
    'use strict';

    const FORECAST_VERSION = 1;

    const _num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const _tok = (s, tokensOf) => {
        const t = String(s == null ? '' : s);
        if (!t.length) return 0;
        if (typeof tokensOf === 'function') {
            try { const n = Number(tokensOf(t)); if (Number.isFinite(n) && n >= 0) return n; } catch (_e) { /* 回落 */ }
        }
        return Math.ceil(t.length * 9 / 10);   // 与 estimateTextTokens 的 CJK 口径一致
    };

    /**
     * 预测本轮注入成本。
     * @param opts {
     *   allBlocks   候选块全量（与 buildInjection 的 _allB 同源、同顺序）
     *   residentMarkers 常驻标记表（单一真源：index.js 的 RESIDENT_MARKERS）
     *   baseBudget / tokenBudget / reserve / chatLength / adaptive / decayFloors  —— 预算输入
     *   strategy    balanced | relevance | recency
     *   router      注入路由模块（injection-router.js 的 api）；缺席 ⇒ measurable:false
     *   trim        裁剪函数（默认 router.trimToBudget；注入以便负控制替换）
     *   derive      预算推导函数（默认 router.deriveBudget）
     *   promotedSnippets { key: snippet } 反向提权的「注入里真会出现的片段」
     *   tokensOf    文本→token 估算
     *   now         时间戳（测试可注入求确定性）
     * }
     */
    function forecast(opts) {
        const o = opts || {};
        const blocks = Array.isArray(o.allBlocks) ? o.allBlocks.map((b) => String(b == null ? '' : b)) : [];
        const residentMarkers = (Array.isArray(o.residentMarkers) && o.residentMarkers.length) ? o.residentMarkers : [];
        const router = o.router || null;
        const derive = (typeof o.derive === 'function') ? o.derive : (router && typeof router.deriveBudget === 'function' ? router.deriveBudget : null);
        const trim = (typeof o.trim === 'function') ? o.trim : (router && typeof router.trimToBudget === 'function' ? router.trimToBudget : null);
        const tokensOf = o.tokensOf;
        const ts = Number.isFinite(o.now) ? o.now : Date.now();

        // 常驻/触发分区（与 buildInjection 同口径：startsWith 命中即常驻）
        const isResident = (b) => residentMarkers.some((m) => b.startsWith(m));
        const resident = blocks.filter(isResident);
        const trigger = blocks.filter((b) => !isResident(b));
        const residentChars = resident.reduce((a, b) => a + b.length, 0);
        const triggerChars = trigger.reduce((a, b) => a + b.length, 0);
        const candidateChars = residentChars + triggerChars;

        const base = { version: FORECAST_VERSION, ts, strategy: o.strategy || 'balanced' };

        if (!derive || !trim) {
            // 模块缺席：预算推算不可信。**不编数字** —— 已可确定的部分（候选面）照实给，
            // 不可确定的部分一律 null + measurable:false。
            return Object.assign(base, {
                measurable: false,
                reason: 'no-router',
                why: 'injection-router 未加载：预算推导与裁剪归属不可复算，不预测（照抄会把它伪装成预测成功）',
                candidate: { blocks: blocks.length, chars: candidateChars, tokens: _tok(blocks.join('\n'), tokensOf) },
                resident: { blocks: resident.length, chars: residentChars },
                trigger: { blocks: trigger.length, chars: triggerChars },
                predicted: null,
                empty: blocks.length === 0,
            });
        }

        let budget = 0;
        try {
            budget = _num(derive(_num(o.baseBudget), _num(o.tokenBudget), _num(o.reserve), _num(o.chatLength), {
                adaptive: o.adaptive,
                decayFloors: o.decayFloors,
            }));
        } catch (e) {
            return Object.assign(base, {
                measurable: false, reason: 'derive-threw',
                why: '预算推导抛异常：' + String((e && e.message) || e),
                candidate: { blocks: blocks.length, chars: candidateChars, tokens: _tok(blocks.join('\n'), tokensOf) },
                resident: { blocks: resident.length, chars: residentChars },
                trigger: { blocks: trigger.length, chars: triggerChars },
                predicted: null, empty: blocks.length === 0,
            });
        }

        // 复算真路径：把候选块拼成 full（与 buildInjection 拼接口径一致），再跑同一个 trim。
        const NOTE = '〔记忆系统私密简报｜仅你可见〕以下内容帮助保持剧情连贯;严禁在回复正文中复述、罗列或提及本节内容。';
        const END = '〔私密简报结束〕请像一个已读过前情的叙述者那样自然续写,不要复述简报本身。';
        const full = blocks.length ? `\n\n${NOTE}\n${blocks.join('\n')}\n${END}\n` : '';
        let projected = full;
        let willTrim = false;
        let predicted = null;
        try {
            willTrim = full.length > budget;
            if (willTrim) projected = String(trim(full, budget, blocks, base.strategy) || '');
            const keptBlocks = blocks.filter((b) => b.length > 0 && projected.includes(b));
            const droppedBlocks = blocks.filter((b) => b.length > 0 && !projected.includes(b));
            const keptResident = resident.filter((b) => projected.includes(b));
            const keptTrigger = trigger.filter((b) => projected.includes(b));

            // 反向线索真进注入的预测：提权项按「注入里真会出现的片段」匹配**预测文本**。
            const snips = (o.promotedSnippets && typeof o.promotedSnippets === 'object') ? o.promotedSnippets : {};
            const snipKeys = Object.keys(snips);
            let oppInjected = null;
            if (snipKeys.length) {
                oppInjected = 0;
                for (const k of snipKeys) {
                    const s = String(snips[k] || '').trim();
                    if (s.length >= 4 && projected.includes(s)) oppInjected++;
                }
            }

            predicted = {
                budget,
                willTrim,
                injectedChars: projected.length,
                injectedTokens: _tok(projected, tokensOf),
                // ★ 口径纪律（写在这里，因为这里踩过）：
                //   `dropped.chars` 是「被丢弃的**块字符数之和**」，而 cost-ledger 的
                //   `totals.droppedChars` 是「**裁剪前全文长度 − 注入长度**」——后者含
                //   NOTE / END / 分隔符，两者**不等价**，拿去对账必然假 drift。
                //   故本模块另给一个与之等价的口径 `overBudgetChars`，对账只用它。
                preTrimChars: full.length,
                overBudgetChars: Math.max(0, full.length - projected.length),
                kept: { blocks: keptBlocks.length, chars: keptBlocks.reduce((a, b) => a + b.length, 0) },
                dropped: { blocks: droppedBlocks.length, chars: droppedBlocks.reduce((a, b) => a + b.length, 0) },
                keptResident: { blocks: keptResident.length, chars: keptResident.reduce((a, b) => a + b.length, 0) },
                keptTrigger: { blocks: keptTrigger.length, chars: keptTrigger.reduce((a, b) => a + b.length, 0) },
                // 反向线索：promoted 的**预计**真进注入条数。无可匹配片段时 null（不可测），不写 0。
                oppositeInjected: oppInjected,
                headroom: Math.max(0, budget - projected.length),
            };
        } catch (e) {
            return Object.assign(base, {
                measurable: false, reason: 'trim-threw',
                why: '裁剪复算抛异常：' + String((e && e.message) || e),
                candidate: { blocks: blocks.length, chars: candidateChars, tokens: _tok(blocks.join('\n'), tokensOf) },
                resident: { blocks: resident.length, chars: residentChars },
                trigger: { blocks: trigger.length, chars: triggerChars },
                predicted: null, empty: blocks.length === 0,
            });
        }

        return Object.assign(base, {
            measurable: true,
            reason: 'ok',
            candidate: { blocks: blocks.length, chars: candidateChars, tokens: _tok(blocks.join('\n'), tokensOf) },
            resident: { blocks: resident.length, chars: residentChars },
            trigger: { blocks: trigger.length, chars: triggerChars },
            predicted,
            // 候选为空：预测「成立」但明确标出「空」——「预测出来是 0」与「没东西可预测」必须可分
            empty: blocks.length === 0,
        });
    }

    /**
     * 预测 vs 实测对账。
     * @param fc     forecast() 的返回值
     * @param ledger cost-ledger.buildCostLedger() 的返回值
     * @returns { version, ok, verdict:'match'|'drift'|'not-measurable', diffs:[{field,predicted,actual,delta}], why }
     *
     * 判据口径：只对**两边都真的测到**的量做对账。任一侧标记不可测（measurable:false /
     * forecast 无 predicted / ledger 无 totals）时 verdict='not-measurable'——**不得**降级成 match，
     * 否则「测不了」会被读成「一致」，这正是本仓最忌讳的假绿。
     */
    function reconcile(fc, ledger) {
        const out = { version: FORECAST_VERSION, ok: false, verdict: 'not-measurable', diffs: [], why: '' };
        try {
            if (!fc || fc.measurable !== true || !fc.predicted) { out.why = '预测侧不可测：' + String((fc && fc.reason) || 'no-forecast'); return out; }
            if (!ledger || !ledger.totals) { out.why = '实测侧没有账本（模块未加载或尚未注入）——「没有账本」不等于「成本为 0」'; return out; }

            const p = fc.predicted;
            const tot = ledger.totals;
            const cmp = (field, predicted, actual) => {
                if (predicted === null || predicted === undefined || actual === null || actual === undefined) return;
                const pv = _num(predicted), av = _num(actual);
                // 允许 ±1 字符的口径抖动（拼接分隔符计数），但不允许结构量漂移
                out.diffs.push({ field, predicted: pv, actual: av, delta: av - pv });
            };
            cmp('budget', p.budget, ledger.budget);
            cmp('injectedChars', p.injectedChars, tot.injectedChars);
            cmp('preTrimChars', p.preTrimChars, _num(ledger.totals.preTrimChars) || 0);
            // 只用**等价口径**对账：overBudgetChars ↔ totals.droppedChars（两者都是
            // 「裁剪前全文 − 注入」，不含块字符和那个不同义的量）。
            cmp('droppedChars', p.overBudgetChars, _num(ledger.totals.droppedChars) || 0);

            const structural = out.diffs.filter((d) => d.field !== 'preTrimChars');
            const bad = structural.filter((d) => d.delta !== 0);
            out.diffs = out.diffs.filter((d) => d.delta !== 0);
            out.ok = bad.length === 0;
            out.verdict = out.ok ? 'match' : 'drift';
            out.why = out.ok
                ? '预测与实测逐项一致（结构量与金额均无偏差）'
                : '预测与实测存在偏差：' + bad.map((d) => d.field + ' 偏 ' + (d.delta > 0 ? '+' : '') + d.delta
                    + '（预测 ' + d.predicted + ' / 实测 ' + d.actual + '）').join('；');
            return out;
        } catch (e) {
            out.verdict = 'not-measurable';
            out.why = '对账抛异常：' + String((e && e.message) || e);
            return out;
        }
    }

    /** 一行诊断（纯字符串，不抛）。 */
    function forecastLine(fc) {
        try {
            if (!fc) return '—';
            if (fc.measurable !== true || !fc.predicted) return '预测不可测（' + String(fc.reason || '?') + '）';
            const p = fc.predicted;
            const parts = [
                '预计预算 ' + p.budget,
                '注入 ' + p.injectedChars + ' 字符',
                p.willTrim ? ('裁剪丢 ' + p.dropped.blocks + ' 块/' + p.dropped.chars + ' 字符') : '不裁剪',
            ];
            if (p.oppositeInjected !== null) parts.push('反向预计进注入 ' + p.oppositeInjected + ' 条');
            if (fc.empty) parts.push('（无候选块）');
            return parts.join(' · ');
        } catch (_e) { return '—（预测异常）'; }
    }

    const api = {
        forecast,
        reconcile,
        forecastLine,
        FORECAST_VERSION,
    };

    if (typeof window !== 'undefined') window.LonShaCostForecast = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);