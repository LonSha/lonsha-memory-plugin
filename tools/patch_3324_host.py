#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch_3324_host.py — [v3.324.0 · D 包记忆侧第一刀] 宿主接线（C 包范式：取库口 + 真每轮调用点 + 出口 + 诊断行 + 体检面 + 配置旋钮）

接六样（缺一即整体退出，不留半成品）：
  ① 取库口 `_extractionDriverLib()` / `_correctionPlanLib()`（放 `_perspectiveCardLib` 之后）；
  ② **真每轮调用点**：`onMessageReceived` 的事件性门控段之后 —— 本轮窗口 + 档位 → 节奏安排，
     落 `this._extractionDriverRead`。**不改任何既有判定**（门控 / 锁 / 摘要路径一条不动），
     不新增第二套调度器；算不出来如实记 `ok:false/reason`，绝不让「读不到」看起来像「没什么要抽」。
  ③ 出口 `extractionPlan(opts)`（恒定键面：缺席与在场**逐字同键**）；
  ④ 出口 `correctionPlanReextract(input, opts)` / `correctionPlanConfig(feedback, trace, opts)`（同上，两面各自恒定键面）；
  ⑤ 诊断行 `_extractionDriverLine()` / `_correctionPlanLine()`（缓存优先、兜底真算 ⇒ 出口有真实调用者）；
  ⑥ selfCheck 体检面两行（「抽取节奏」「纠错方案」，与「门控读数」「提取反馈」分列）；
  ⑦ 配置旋钮 `extractionProfile`：memory-config.js 默认块 + settings-ui.js 控件 + index.js 真消费
     （过 `tests/audit/scan_config_liveness.mjs` 的两跳可达性：键 → 提及方法 → 该方法有调用者）。
"""
import io
import sys

EDITS = []


def rep(path, old, new, must=1):
    EDITS.append((path, old, new, must))


# ══════════ ① 配置旋钮：默认块 + UI 控件 ══════════
rep('memory-config.js',
    "            smartTriggerPatterns: '',      // 自定义触发规则（换行/逗号分隔的正则；命中即加权）\n",
    "            smartTriggerPatterns: '',      // 自定义触发规则（换行/逗号分隔的正则；命中即加权）\n"
    "            // [v3.324.0 · M3-O5] 抽取节奏档位（quality / balanced / low-cost）：决定**寒暄楼**\n"
    "            //   攒批的周期与一次吃下的条数。★ 结构性信号（身份/承诺/物品/关系/事件）**任何档位都即时** ——\n"
    "            //   档位只影响「平淡楼花不花 LLM」，永不影响「关键事件会不会被漏掉」。\n"
    "            //   未知值回落 balanced 并在诊断行如实标「档位未知已回落」（不静默当默认）。\n"
    "            extractionProfile: 'balanced',\n")

rep('settings-ui.js',
    "                    <textarea class=\"ls-textarea\" data-cfg-text=\"smartTriggerPatterns\" placeholder=\"自定义触发规则（每行一条正则，命中即加权 2 分）\">${c.smartTriggerPatterns || ''}</textarea>\n",
    "                    <textarea class=\"ls-textarea\" data-cfg-text=\"smartTriggerPatterns\" placeholder=\"自定义触发规则（每行一条正则，命中即加权 2 分）\">${c.smartTriggerPatterns || ''}</textarea>\n"
    "                    <div class=\"ls-slider-label\" style=\"margin-top:8px;\"><span>抽取节奏档位</span><span class=\"ls-slider-val\">${c.extractionProfile || 'balanced'}</span></div>\n"
    "                    <select class=\"ls-input\" data-cfg-text=\"extractionProfile\">\n"
    "                        <option value=\"quality\" ${(c.extractionProfile || 'balanced') === 'quality' ? 'selected' : ''}>quality（每楼都抽，最贵）</option>\n"
    "                        <option value=\"balanced\" ${(c.extractionProfile || 'balanced') === 'balanced' ? 'selected' : ''}>balanced（每 3 楼攒批一次，默认）</option>\n"
    "                        <option value=\"low-cost\" ${(c.extractionProfile || 'balanced') === 'low-cost' ? 'selected' : ''}>low-cost（每 5 楼攒批，且只抽核心类型）</option>\n"
    "                    </select>\n"
    "                    <div class=\"ls-hint\" style=\"padding:0 8px;\">档位只决定**平淡楼**攒批的周期与条数；身份/承诺/物品/关系/事件这五类结构性信号**任何档位都当场抽**（关键事件不因省调用被推到周期楼外）。诊断面「抽取节奏」一行会如实报即时/攒批/错过的楼。</div>\n")

# ══════════ ② 取库口 ══════════
rep('index.js',
    "    function _perspectiveCardLib() {\n"
    "    return _moduleLib(() => window.LonShaPerspectiveCard, 'perspective-card.js');\n"
    "    }\n",
    "    function _perspectiveCardLib() {\n"
    "    return _moduleLib(() => window.LonShaPerspectiveCard, 'perspective-card.js');\n"
    "    }\n"
    "    // [v3.324.0 · M3-O5] 抽取节奏安排（extraction-driver.js）。为什么需要：\n"
    "    //   既有「事件性门控」只答**这一楼**值不值得花一次 LLM，答不了 M3-O5 点名的三问 ——\n"
    "    //   ① 关键事件落在非周期楼时会不会被漏掉（修前全靠「每楼都抽」或靠人记）；\n"
    "    //   ② 连续寒暄为什么不每次全类型请求；③ 错过的楼/重生成段从哪儿补回来。\n"
    "    //   本模块只产**可复算的安排**（何时抽 / 哪些楼没处理 / 重生成补哪段），\n"
    "    //   **纯函数零写**、不改图、不改账、不替门控做决定。\n"
    "    function _extractionDriverLib() {\n"
    "    return _moduleLib(() => window.LonShaExtractionDriver, 'extraction-driver.js');\n"
    "    }\n"
    "    // [v3.324.0 · M3-O7 + M3-X9] 纠错方案（correction-plan.js）。为什么需要：\n"
    "    //   既有「提取反馈」答的是**错在哪一类**、建议有没有据；它答不了打补丁时真正的两问 ——\n"
    "    //   ① 改哪（配置面）/ 补哪一段（数据面），两者**不是一件事**（合成一个「纠错」会让人\n"
    "    //      以为改配置顺便重写了历史事实）；② 重提取之后**跟原文逐条对上了没有**\n"
    "    //      （新增 / 保留 / 替换 / 冲突四态各自可达，冲突不得被吞进「替换」）。\n"
    "    //   本模块只产**待确认的提案**（`writes` 恒 0）：确认前一个字节都不落盘。\n"
    "    function _correctionPlanLib() {\n"
    "    return _moduleLib(() => window.LonShaCorrectionPlan, 'correction-plan.js');\n"
    "    }\n")

# ══════════ ③ 出口 + 诊断行 + 窗口取数（插在 _perspectiveCardLine 之后） ══════════
rep('index.js',
    "        } catch (e) { errLog(e, 'engine._perspectiveCardLine'); return '—（诊断异常）'; }\n"
    "        }\n",
    "        } catch (e) { errLog(e, 'engine._perspectiveCardLine'); return '—（诊断异常）'; }\n"
    "        }\n"
    "        /** [v3.324.0 · M3-O5] 本轮的抽取窗口（最近若干楼）。番外楼不进窗口但**如实计数**：\n"
    "         *   「跳过番外」与「窗口里本来就没这几楼」在读数上必须不同形（I6）。 */\n"
    "        _extractionWindowFloors(message) {\n"
    "        try {\n"
    "        const chat = (typeof window !== 'undefined' && window.SillyTavern && typeof window.SillyTavern.getContext === 'function')\n"
    "        ? (((window.SillyTavern.getContext() || {}).chat) || []) : [];\n"
    "        const end = Number(message && message.index);\n"
    "        if (!Number.isFinite(end) || end < 0) return { entries: [], omitted: 0, noFloor: 0, from: 0, to: null };\n"
    "        const from = Math.max(0, end - 4);\n"
    "        const entries = [];\n"
    "        let omitted = 0;\n"
    "        let noFloor = 0;\n"
    "        for (let i = from; i <= end; i++) {\n"
    "        const m = chat[i];\n"
    "        if (!m) { noFloor++; continue; }\n"
    "        if (typeof this.isOmittedFloor === 'function' && this.isOmittedFloor(m)) { omitted++; continue; }\n"
    "        entries.push({ floor: i, text: m.mes || m.content || '' });\n"
    "        }\n"
    "        return { entries: entries, omitted: omitted, noFloor: noFloor, from: from, to: end };\n"
    "        } catch (e) { errLog(e, 'engine._extractionWindowFloors'); return { entries: [], omitted: 0, noFloor: 0, from: 0, to: null }; }\n"
    "        }\n"
    "        /**\n"
    "         * [v3.324.0 · M3-O5] **真出口**：抽取节奏安排（何时抽 / 哪些楼还没处理 / 重生成补哪段）。\n"
    "         *   与「门控读数」**分列**：门控行答「这一楼值不值得抽」，本出口答「按剧情变化该怎么排」。\n"
    "         *   纯算不写；模块缺席给**具名** reason（缺席不是「这一轮没什么可抽」）。\n"
    "         */\n"
    "        extractionPlan(opts) {\n"
    "        /* [v3.324.0 · D 包] **恒定键面**：缺席面必须与在场产出**逐字同键**（C 包同款纪律），\n"
    "         *   否则下游按 `readings.unreadable` 断言会在模块缺席时读到 undefined —— 那与 0 处置相反。\n"
    "         *   键序按内核 `ED.plan()` 的产出序，尾部补 ok/reason。 */\n"
    "        const absent = (why) => ({ kind: 'extraction_driver', version: 0, floor: null, profile: '', profileKnown: false, rules: {}, due: [], batched: [], batchThisRound: [], deferredTypes: [], nextBatchFloor: null, unreadable: [], noFloor: [], missed: { floors: [], count: 0, noFloor: 0, neverDropped: true, why: '' }, regen: { scoped: false, floors: [], types: [], untouched: 0, why: '' }, readings: {}, zeroWrite: true, malformedInput: false, degraded: false, ok: false, reason: why });\n"
    "        try {\n"
    "        const ED = _extractionDriverLib();\n"
    "        if (!ED || typeof ED.plan !== 'function') return absent('module-unavailable');\n"
    "        const o = opts || {};\n"
    "        const out = ED.plan({\n"
    "        floor: o.floor,\n"
    "        profile: (o.profile !== undefined ? o.profile : this.config.config.extractionProfile),\n"
    "        entries: Array.isArray(o.entries) ? o.entries : [],\n"
    "        cadenceActive: o.cadenceActive,\n"
    "        missedFloors: Array.isArray(o.missedFloors) ? o.missedFloors : [],\n"
    "        regenFloors: Array.isArray(o.regenFloors) ? o.regenFloors : []\n"
    "        }, { markers: o.markers });\n"
    "        const r = Object.assign({}, out, { ok: true, reason: out.degraded ? 'degraded' : '' });\n"
    "        this._extractionDriverRead = r;\n"
    "        return r;\n"
    "        } catch (e) { errLog(e, 'engine.extractionPlan'); return absent('thrown'); }\n"
    "        }\n"
    "        /** [v3.324.0 · M3-O5] 诊断一行。即时 / 攒批 / 未读到 / 补回错过 分开说。 */\n"
    "        _extractionDriverLine() {\n"
    "        try {\n"
    "        const ED = _extractionDriverLib();\n"
    "        if (!ED || typeof ED.line !== 'function') return '模块未加载（extraction-driver.js）';\n"
    "        const cached = this._extractionDriverRead;\n"
    "        if (cached && cached.kind) return ED.line(cached);\n"
    "        const got = this.extractionPlan({});\n"
    "        if (!got.ok) return '抽取节奏不可用（' + got.reason + '）';\n"
    "        return ED.line(got);\n"
    "        } catch (e) { errLog(e, 'engine._extractionDriverLine'); return '—（诊断异常）'; }\n"
    "        }\n"
    "        /**\n"
    "         * [v3.324.0 · M3-O7 + M3-X9] **真出口（数据面）**：局部重提取提案 —— 与原文逐条对照。\n"
    "         *   四态**各自可达**（新增 / 保留 / 替换 / 冲突）；未圈范围 ⇒ 不产全量提案（`scoped:false`）。\n"
    "         *   确认前不写（`writes` 恒 0）：这是提案面，不是执行面。\n"
    "         */\n"
    "        correctionPlanReextract(input, opts) {\n"
    "        /* [v3.324.0 · D 包] **恒定键面**：键序按内核 `CP.planReextract()` 的产出序，尾部补 ok/reason。 */\n"
    "        const absent = (why) => ({ kind: 'correction_plan@reextract', version: 0, face: 'data', scope: {}, items: [], byOutcome: { added: 0, kept: 0, replaced: 0, conflicted: 0 }, staged: { proposed: 0, selected: 0, rejected: 0 }, untouched: 0, rewritten: { floors: [], noFloor: 0, declared: false, why: '' }, retry: { pending: 0, keys: [], idempotentByFactKey: true, duplicatesPrevented: 0, nothingLostOnFailure: true }, readings: {}, writes: 0, applied: false, zeroWrite: true, scoped: false, decidable: false, why: '', malformedInput: false, degraded: false, ok: false, reason: why });\n"
    "        try {\n"
    "        const CP = _correctionPlanLib();\n"
    "        if (!CP || typeof CP.planReextract !== 'function') return absent('module-unavailable');\n"
    "        const out = CP.planReextract(input, opts || {});\n"
    "        const r = Object.assign({}, out, { ok: true, reason: out.degraded ? 'degraded' : '' });\n"
    "        this._correctionPlanRead = r;\n"
    "        return r;\n"
    "        } catch (e) { errLog(e, 'engine.correctionPlanReextract'); return absent('thrown'); }\n"
    "        }\n"
    "        /**\n"
    "         * [v3.324.0 · M3-O7 + M3-X9] **真出口（配置面）**：改哪儿 + 撤的是什么。\n"
    "         *   ★ 对照三态**互不同形**：absent（还没跑过）/ unmeasurable（跑了判不了）/ measurable；\n"
    "         *     撤配置与撤事实**分成两个 token**（合成一个「撤销」会让人以为两件都回退了）。\n"
    "         */\n"
    "        correctionPlanConfig(feedback, trace, opts) {\n"
    "        /* [v3.324.0 · D 包] **恒定键面**：键序按内核 `CP.planConfigFix()` 的产出序（含 reason/why 两格），\n"
    "         *   尾部补 ok。缺席时 `reason` 承载缺席归因（在场时它承载内核自述，通常为空串）。 */\n"
    "        const absent = (why) => ({ kind: 'correction_plan@config', version: 0, face: 'config', candidates: [], count: 0, unknownClass: 0, scope: null, undo: { kinds: [], separate: true, configUndo: {}, factUndo: {}, note: '' }, applied: false, defaultAuto: false, writes: 0, zeroWrite: true, decidable: false, proof: 'unproven', compareState: 'absent', reason: why, why: '', malformedInput: false, degraded: false, ok: false });\n"
    "        try {\n"
    "        const CP = _correctionPlanLib();\n"
    "        if (!CP || typeof CP.planConfigFix !== 'function') return absent('module-unavailable');\n"
    "        const out = CP.planConfigFix(Array.isArray(feedback) ? feedback : [], trace || null, opts || {});\n"
    "        const r = Object.assign({}, out, { ok: true });\n"
    "        this._correctionPlanRead = r;\n"
    "        return r;\n"
    "        } catch (e) { errLog(e, 'engine.correctionPlanConfig'); return absent('thrown'); }\n"
    "        }\n"
    "        /** [v3.324.0 · M3-O7 + M3-X9] 诊断一行。两面分开说（配置面报候选与背书，数据面报四态对照）。 */\n"
    "        _correctionPlanLine() {\n"
    "        try {\n"
    "        const CP = _correctionPlanLib();\n"
    "        if (!CP || typeof CP.line !== 'function') return '模块未加载（correction-plan.js）';\n"
    "        const cached = this._correctionPlanRead;\n"
    "        if (cached && cached.kind) return CP.line(cached);\n"
    "        const got = this.correctionPlanConfig([], null, {});\n"
    "        if (!got.ok) return '纠错方案不可用（' + got.reason + '）';\n"
    "        return CP.line(got);\n"
    "        } catch (e) { errLog(e, 'engine._correctionPlanLine'); return '—（诊断异常）'; }\n"
    "        }\n")

# ══════════ ④ 真每轮调用点（事件性门控段之后） ══════════
rep('index.js',
    "                    } catch (e) { errLog(e, 'onMessageReceived.事件性门控'); }\n"
    "                }\n"
    "                if (!extracted) {\n",
    "                    } catch (e) { errLog(e, 'onMessageReceived.事件性门控'); }\n"
    "                }\n"
    "                /* [v3.324.0 · M3-O5] **真每轮调用点**：本轮窗口 + 档位 → 抽取节奏安排。\n"
    "                 *   为什么落在这里而不是只等诊断面来问：节奏安排是「这一楼的关键事件会不会\n"
    "                 *   落在周期楼外」的上游判据，等诊断面按需算，等于用户问的时候才算得动。\n"
    "                 *   ★ 本段**只算不写**：门控判定的结果、提取锁、摘要降级路径一条都不动 ——\n"
    "                 *     它是**读数**，不是第二套调度器（本仓「导出即摆设」的老坑）。\n"
    "                 *   ★ 算不出来如实记 `ok:false/reason`：缺席与「这一轮没什么可抽」不同形。 */\n"
    "                try {\n"
    "                    const _ED = _extractionDriverLib();\n"
    "                    if (_ED && typeof _ED.plan === 'function') {\n"
    "                        const _win = this._extractionWindowFloors(message);\n"
    "                        const _edOut = _ED.plan({\n"
    "                            floor: message.index || 0,\n"
    "                            profile: this.config.config.extractionProfile,\n"
    "                            entries: _win.entries,\n"
    "                            missedFloors: Array.from(this._lockDegradePending || []),\n"
    "                            regenFloors: Array.isArray(this._regenFloors) ? this._regenFloors : []\n"
    "                        }, {});\n"
    "                        this._extractionDriverRead = Object.assign({}, _edOut, { ok: true, reason: _edOut.degraded ? 'degraded' : '' });\n"
    "                        this._extractionWindowRead = { omitted: _win.omitted, noFloor: _win.noFloor, from: _win.from, to: _win.to };\n"
    "                        if (this.config.config.debugMode) {\n"
    "                            console.log(`[${PLUGIN_NAME}] [v3.324.0] 抽取节奏 ${_edOut.profile}: 即时 ${_edOut.readings.structuralDue} / 攒批 ${_edOut.readings.batched} / 未读到 ${_edOut.readings.unreadable}`);\n"
    "                        }\n"
    "                    } else {\n"
    "                        this._extractionDriverRead = { ok: false, reason: 'module-unavailable' };\n"
    "                    }\n"
    "                } catch (e) { errLog(e, 'onMessageReceived.抽取节奏'); this._extractionDriverRead = { ok: false, reason: 'thrown' }; }\n"
    "                if (!extracted) {\n")

# ══════════ ⑤ selfCheck 体检面两行（视角卡之后） ══════════
rep('index.js',
    "                        return ['视角卡', line + (bad ? ' ⚠️' : '')];\n"
    "                        } catch (e) { errLog(e, 'selfCheck.perspectiveCard'); return ['视角卡', '—（诊断异常）']; }\n"
    "                        })(),\n",
    "                        return ['视角卡', line + (bad ? ' ⚠️' : '')];\n"
    "                        } catch (e) { errLog(e, 'selfCheck.perspectiveCard'); return ['视角卡', '—（诊断异常）']; }\n"
    "                        })(),\n"
    "                        // [v3.324.0 · M3-O5] 抽取节奏体检面：与「门控读数」**分列**。\n"
    "                        //   门控行答「这一楼值不值得花 LLM」，本行答「按剧情变化该怎么排」——\n"
    "                        //   合成一行会让「这一楼平淡」与「关键事件被推到周期楼外」共用一个提示位。\n"
    "                        //   报警只认两条真损失：未读到（内容都没读到 ⇒ 不是「没什么可抽」）\n"
    "                        //   与「错过但无楼号」（补不回来 ≠ 补得回来）。\n"
    "                        (() => {\n"
    "                        try {\n"
    "                        const line = (typeof this._extractionDriverLine === 'function') ? this._extractionDriverLine() : '—';\n"
    "                        const r = this._extractionDriverRead;\n"
    "                        const bad = !!(r && r.ok && ((Number(r.readings && r.readings.unreadable) || 0) > 0\n"
    "                        || (Number(r.missed && r.missed.noFloor) || 0) > 0));\n"
    "                        return ['抽取节奏', line + (bad ? ' ⚠️' : '')];\n"
    "                        } catch (e) { errLog(e, 'selfCheck.extractionDriver'); return ['抽取节奏', '—（诊断异常）']; }\n"
    "                        })(),\n"
    "                        // [v3.324.0 · M3-O7 + M3-X9] 纠错方案体检面：与「提取反馈」**分列**。\n"
    "                        //   反馈行答「提取错在哪一类、建议有没有据」，本行答「改哪 / 补哪段 /\n"
    "                        //   撤的是配置还是事实」并报与原文的对照四态。\n"
    "                        //   报警只认两条真损失：归类未定（收了反馈但归不出面）与冲突对照\n"
    "                        //   （同一事实两个值 —— 混进「替换」就等于把「改了口径」当「更新了一版」）。\n"
    "                        (() => {\n"
    "                        try {\n"
    "                        const line = (typeof this._correctionPlanLine === 'function') ? this._correctionPlanLine() : '—';\n"
    "                        const r = this._correctionPlanRead;\n"
    "                        const bad = !!(r && r.ok && ((Number(r.unknownClass) || 0) > 0\n"
    "                        || (Number(r.byOutcome && r.byOutcome.conflicted) || 0) > 0));\n"
    "                        return ['纠错方案', line + (bad ? ' ⚠️' : '')];\n"
    "                        } catch (e) { errLog(e, 'selfCheck.correctionPlan'); return ['纠错方案', '—（诊断异常）']; }\n"
    "                        })(),\n")

for path, old, new, must in EDITS:
    src = io.open(path, encoding='utf-8').read()
    n = src.count(old)
    if n != must:
        sys.exit('[patch3324] %s 锚点命中 %d 次（期望 %d）：%r' % (path, n, must, old[:90]))
    io.open(path, 'w', encoding='utf-8').write(src.replace(old, new))
    print('[patch3324] ok %s (+%d 字符)' % (path, len(new) - len(old)))
print('[patch3324] 完成：取库口 + 真每轮调用点 + 三出口 + 两诊断行 + 两体检面 + 配置旋钮')
