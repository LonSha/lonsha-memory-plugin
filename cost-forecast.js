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
        /* [v3.274.0] O4：**预测的留存判定改为消费裁剪回执**，不再用 `projected.includes(块)` 反推。
         *   修前实测的两个盲区（与 cost-ledger 同源、同一轮实测）：
         *     · **同文重复**：候选里两条完全相同的触发块、只装得下一条时，`includes` 对两条
         *       都为真 ⇒ 预测报「2 块全留」，而真裁剪回执说「留 1 丢 1」；
         *     · **互为子串 / 半段截断**：块 A 是块 B 的子串，或 recency 硬截断切在块内部，
         *       反推会把「切了半段」读成「整块被丢」。
         *   回执由裁剪发生的地点派生（injection-router::trimToBudget），按下标说话，
         *   两个盲区在构造上不可能发生。**预测与实测从此对同一条事实说话**。
         *
         *   三态（与 index.js 的 `_lastBudgetStats` 同规格）：
         *     · `no-trim`  未裁剪 ⇒ 整批都在载荷里，逐块状态是**真读数**（不是 null）；
         *     · `trace` / `trace-span` ⇒ 按下标 / 按 span 判定，精确；
         *     · `unknown`   回执缺席 / 内联回落 / 规模不符 ⇒ **块级数记 null 并自述原因**，
         *       不倒推成一个数（反推在那些场景恰好偏向「全部留下」，正是本版要断的谎报）。 */
        const _tr = {};
        try {
            willTrim = full.length > budget;
            if (willTrim) projected = String(trim(full, budget, blocks, base.strategy, { trace: _tr }) || '');
            /* 回执可用性两问（缺一不可，与 index.js 的 `_injectionBlocksOf` 同一口径）：
             *   ① 来源必须是**路由模块** —— 内联回落时裁剪真发生了但没有块级清单，
             *      拿它判「谁留下」就是拿一份不存在的清单判（修前 includes 反推的老路）；
             *   ② 规模必须与本批候选相符 —— 路由回执用 `residentKept + triggerTotal`
             *      自证规模（它把候选分成常驻/触发两组，两个数之和就是它见过的块总数）。
             *      ★ 这里**不能**要求回执带 `version` / `blockCount`：那两个字段是宿主
             *      （index.js 的回执草稿）填的，路由模块本身不填 —— 本仓第一版就是这么写的，
             *      结果**每一次**精确回执都被判成「未派发」而整组记 null（假不可测），
             *      与「把不可测写成数字」是同一族错，只是方向相反。 */
            const _fromRouter = (_tr.traceFrom === 'router');
            const _scaleOk = _fromRouter && (Number(_tr.residentKept) + Number(_tr.triggerTotal)) === blocks.length;
            const _idxOk = _scaleOk && Array.isArray(_tr.keptIdxInAll);
            const _hard = _scaleOk && (_tr.hardTruncated === true);
            let keptFrom, keptWhy;
            if (!willTrim) { keptFrom = 'no-trim'; keptWhy = ''; }
            else if (_idxOk) { keptFrom = 'trace'; keptWhy = ''; }
            else if (_hard) { keptFrom = 'trace-span'; keptWhy = '硬截断：块级清单不成立，按 span 判三态'; }
            else { keptFrom = 'unknown'; keptWhy = (!_fromRouter ? '裁剪未派发回执（模块缺席 / 内联回落）'
                : (!_scaleOk ? '回执规模与本批候选不符（拿别批回执判本批）'
                    : '回执形态既不成立块级清单也不是硬截断：' + String(_tr.traceFrom || 'unknown'))) + ' ⇒ 块级留存不可测，不倒推'; }
            const _idxSet = _idxOk ? new Set(_tr.keptIdxInAll) : null;
            const _spanAt = _hard ? Number(_tr.sliceAt) : NaN;
            const _spans = (_hard && Array.isArray(_tr.blockSpans)) ? _tr.blockSpans : null;
            const _st = blocks.map((b, i) => {
                if (!b.length) return { i, b, kept: false, partial: false, state: 'empty' };
                if (!willTrim) return { i, b, kept: true, partial: false, state: 'kept' };
                if (_idxSet) return { i, b, kept: _idxSet.has(i), partial: false, state: _idxSet.has(i) ? 'kept' : 'dropped' };
                if (_spans) {
                    const sp = Array.isArray(_spans[i]) ? _spans[i] : null;
                    if (!sp) return { i, b, kept: false, partial: false, state: 'unknown' };
                    const kept = sp[1] <= _spanAt;
                    const partial = (sp[0] < _spanAt && sp[1] > _spanAt);
                    return { i, b, kept, partial, state: partial ? 'partial' : (kept ? 'kept' : 'dropped') };
                }
                return { i, b, kept: null, partial: null, state: 'unknown' };
            });
            const _known = (keptFrom === 'no-trim' || keptFrom === 'trace' || keptFrom === 'trace-span');
            const _unknownN = _known ? 0 : _st.filter((x) => x.state === 'unknown').length;
            const _countedN = _st.filter((x) => x.state !== 'empty').length;
            const keptBlocks = _known ? _st.filter((x) => x.state === 'kept').map((x) => x.b) : null;
            /* 三态互斥且穷尽：保留 / 被丢 / 被切半 —— 空块既不属哪一边（它是候选里的占位，
             *   不占载荷字符），**被切半也不得混进「被丢」**（半段其实进了载荷）。 */
            const droppedBlocks = _known ? _st.filter((x) => x.state === 'dropped').map((x) => x.b) : null;
            const partialBlocks = _known ? _st.filter((x) => x.state === 'partial').map((x) => x.b) : null;
            /* 分区一律**按下标**，不按文本回查 —— 同文重复时 `blocks.indexOf(块)` 会把两条
             *   都指到第一条，正是本版要治的盲区在消费侧的重演（v3251 A2 同一教训）。 */
            const keptResident = _known ? _st.filter((x) => x.kept === true && isResident(x.b)).map((x) => x.b) : null;
            const keptTrigger = _known ? _st.filter((x) => x.kept === true && !isResident(x.b)).map((x) => x.b) : null;
            const _sumLen = (arr) => (arr || []).reduce((a, b) => a + b.length, 0);

            // 反向线索真进注入的预测：提权项按「注入里真会出现的片段」匹配**预测文本**。
            const snips = (o.promotedSnippets && typeof o.promotedSnippets === 'object') ? o.promotedSnippets : {};
            const snipKeys = Object.keys(snips);
            let oppInjected = null;
            if (snipKeys.length) {
                /* [v3.274.0] O4：有块级回执时按**保留块文本**匹配，不再对最终载荷反推 ——
                 *   片段来自被裁掉的块、却恰好也在别处出现时，反推会把它报成「真进了注入」。
                 *   无回执（不可测）时退回原口径（对载荷匹配），因为那是唯一可用的证据。 */
                const _hay = _known ? keptBlocks.join('\n') : projected;
                oppInjected = 0;
                for (const k of snipKeys) {
                    const s = String(snips[k] || '').trim();
                    if (s.length >= 4 && _hay.includes(s)) oppInjected++;
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
                /* [v3.274.0] O4：块级留存数一律从回执导出；不可测时**整组记 null**（不倒推成功）。
                 *   `keptFrom` / `keptWhy` 是**如实自述**：读的人当场知道这一组是真读数还是不可测。 */
                keptFrom,
                keptWhy,
                unknownBlocks: _unknownN,
                /* 参与三态判定的块数（排除空块占位）：与 kept/dropped/partial 三个数自洽 ——
                 *   三者之和必须等于它，可在判据里直接对账。不可测时为 null（不写 0）。 */
                countedBlocks: _known ? _countedN : null,
                kept: _known ? { blocks: keptBlocks.length, chars: _sumLen(keptBlocks) } : null,
                dropped: _known ? { blocks: droppedBlocks.length, chars: _sumLen(droppedBlocks) } : null,
                partial: _known ? { blocks: partialBlocks.length, chars: _sumLen(partialBlocks) } : null,
                keptResident: _known ? { blocks: keptResident.length, chars: _sumLen(keptResident) } : null,
                keptTrigger: _known ? { blocks: keptTrigger.length, chars: _sumLen(keptTrigger) } : null,
                // 裁剪过程回执的**归因面**（与 index.js 同一 trace 导出，不另算一份）
                residentOverflow: (_tr.residentOverflow && typeof _tr.residentOverflow === 'object') ? _tr.residentOverflow : null,
                hardTruncated: _hard === true,
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
            /* [v3.274.0] O4：块级留存不可测时**不得**写成「丢 0 块」（那是把「测不了」写成「没有」）。
             *   一行读数上如实标「块级留存不可测」并带归因，与 cost-ledger 的「留存判据=文本反推」同一纪律。 */
            const parts = [
                '预计预算 ' + p.budget,
                '注入 ' + p.injectedChars + ' 字符',
                !p.willTrim ? '不裁剪'
                    : (p.dropped ? ('裁剪丢 ' + p.dropped.blocks + ' 块/' + p.dropped.chars + ' 字符'
                        + (p.partial && p.partial.blocks ? '，另 ' + p.partial.blocks + ' 块被切半' : ''))
                        : ('块级留存不可测（' + String(p.keptFrom || 'unknown') + '）')),
            ];
            if (p.residentOverflow && Number(p.residentOverflow.over) > 0) parts.push('常驻溢出 ' + p.residentOverflow.over + ' 字符（关键事实保护）');
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