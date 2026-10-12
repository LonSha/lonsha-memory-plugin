#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch_b_x1_host2.py - [v3.321.0 · M3-X1] 宿主出口接线（问答面）+ 外供登记行

为什么必须接：M3-X1 的内核（evidence-query.js::planQuestion / composeAnswer）
在盘上，但**全仓只有测试档调用它** —— 正是本仓治理过多轮的「功能级失效」
（导出了 API 但零生产调用点）：能力在，用户永远调不到。

本脚本做三件事（宿主只做这三件，绝不自己算）：
  ① 装配：`_qaKnownActors()` 是「已知人名」的唯一装配点
     （实体登记表 + 图谱角色节点两来源，各自独立 try，互不阻断）；
  ② 转发：`askMemoryQuestion()` 把问句交给内核规划 → 逐条计划跑既有查询 →
     把**已许可的结果行**交给内核合成；**不改写内核返回值**；
  ③ 降级：内核整个不可达时给**同键形状**回执（不是投影真源）。

三条边界（与计划逐条对齐，写死在代码里）：
  · **不扩权**：出口只回合成句 + 每条计划的**读数**（total/state/why），
    **不回 rows** —— 回 rows 就是把查询面整个再外供一次（含被遮蔽行的行对象）；
  · **不重写口径**：条件生成、判定、合成全在内核；宿主不另解一份「哪条算命中」；
  · **诊断行三种坏法分开写**（模块没挂 / 面在位未用 / 上次读数），
    不把「没问过」与「问了没答出」压成一态（本仓最贵的老账）。

EDITS 一律 (path, old, new, must)：显式给文件，不靠猜。
"""
import io
import sys

EDITS = []


def rep(path, old, new, must=1):
    EDITS.append((path, old, new, must))


IDX = 'index.js'
TSV = 'tests/audit/open_face_registry.tsv'

# ── ① 出口段：插在 evidenceQueryLine 之后、X9 段头之前 ──
ANCHOR_EXIT = (
    "            } catch (e) { errLog(e, 'plugin.evidenceQueryLine'); return '—（诊断异常）'; }\n"
    "        }\n"
    "        /* ────────────────────────────────────────────────────────────────\n"
    "         * [v3.305.0 · X9] 统一记忆工具 API（宿主接线，五出口 + 自述 + 一行诊断）"
)

NEW_EXIT = (
    "            } catch (e) { errLog(e, 'plugin.evidenceQueryLine'); return '—（诊断异常）'; }\n"
    "        }\n"
    "        /* ────────────────────────────────────────────────────────────────\n"
    "         * [v3.321.0 · M3-X1] 带证据的自然语言记忆问答（宿主接线，一出口 + 一装配点 + 一行诊断）\n"
    "         *\n"
    "         * 【为什么宿主只做三件事、绝不自己算】（与 X9 / M-X1 两处同规格）\n"
    "         *   ① **装配**：`_qaKnownActors()` 是「已知人名」的唯一装配点；\n"
    "         *   ② **转发**：问句交给内核 `planQuestion` 规划、逐条计划跑**既有**查询、\n"
    "         *      已许可的结果行交给内核 `composeAnswer` 合成；宿主不改写内核返回值；\n"
    "         *   ③ **降级**：内核整个不可达时给**同键形状**回执（不是投影真源）。\n"
    "         *   凡「哪条算命中 / 什么算未结 / 认不出人名怎么办」——口径全在内核；\n"
    "         *   宿主再写一遍就是第二份真源（本仓治理过多轮的形态）。\n"
    "         *\n"
    "         * 【不扩权（M3-X1 验收原文「导出/手机显示不扩权」）】\n"
    "         *   出口只回**合成句 + 逐条计划的读数**（total / state / why / refs），\n"
    "         *   **不回 rows** —— 回 rows 等于把查询面整个再外供一次，\n"
    "         *   而遮蔽行的正文正是 M-O8 第二刀花了一整刀从外供结构里摘掉的东西。\n"
    "         *\n"
    "         * 【不进快照】\n"
    "         *   与 X9 / M-X1 同因：本面**按需调用**（一次回答要扫九账全量），\n"
    "         *   塞进每轮快照 = 每轮付一遍扫描代价，且会把「这一轮没问」伪装成\n"
    "         *   「问了没答出」——两者在快照里同形。下游要面自述时走 `memoryQaLine()`。\n"
    "         * ──────────────────────────────────────────────────────────────── */\n"
    "        /**\n"
    "         * [v3.321.0 · M3-X1] 已知人名表（问答规划的**唯一装配点**）。\n"
    "         *   为什么必须由宿主给：规划器**只认这里给的名字** —— 它自己不猜别名、\n"
    "         *   不做模糊匹配（见 `planQuestion` 的人名纪律）。取不到即空数组：\n"
    "         *   「宿主没给名字」（入参事实）与「这人不存在」在规划器里是**两句话**，\n"
    "         *   故此处**不编任何名字**。\n"
    "         *   两个来源各自独立 try：图谱没建不该让登记表那一份也拿不到。\n"
    "         * @returns {string[]} 原名（不含别名；别名解析归实体层）\n"
    "         */\n"
    "        _qaKnownActors(limit) {\n"
    "            const out = [];\n"
    "            const cap = Math.max(1, Math.min(500, Number(limit) > 0 ? Math.floor(Number(limit)) : 200));\n"
    "            const push = (n) => {\n"
    "                const t = String(n == null ? '' : n).trim();\n"
    "                if (t && out.indexOf(t) < 0 && out.length < cap) out.push(t);\n"
    "            };\n"
    "            try {\n"
    "                if (this._entityIdByName && typeof this._entityIdByName.keys === 'function') {\n"
    "                    for (const k of this._entityIdByName.keys()) push(k);\n"
    "                }\n"
    "            } catch (_e) { /* 单来源失败不阻断另一来源 */ }\n"
    "            try {\n"
    "                const nodes = (this.graph && this.graph.nodes && typeof this.graph.nodes.values === 'function')\n"
    "                    ? this.graph.nodes.values() : null;\n"
    "                if (nodes) for (const n of nodes) { if (n && n.type === 'character') push(n.name); }\n"
    "            } catch (_e) { /* 同上 */ }\n"
    "            return out;\n"
    "        }\n"
    "        /**\n"
    "         * [v3.321.0 · M3-X1] 出口：回答一个记忆问句（**只读、不抛**）。\n"
    "         *\n"
    "         * @param {string} question 用户问句\n"
    "         * @param {object} [opts] { knownActors?:string[], maxActors?:number,\n"
    "         *                          maxSentences?:number, pageSize?:number, maxPerLedger?:number }\n"
    "         * @returns {object} 恒定键面（取不到内核也全键在场，下游按键断言即可）\n"
    "         */\n"
    "        askMemoryQuestion(question, opts) {\n"
    "            const o = opts || {};\n"
    "            const qText = String(question == null ? '' : question);\n"
    "            const absent = (reason) => ({\n"
    "                version: 0, question: qText, intents: [], actor: null,\n"
    "                answer: [], gaps: [{ kind: 'module', why: reason }], refs: [], plans: [],\n"
    "                masked: 0, truncated: false, resourced: 0, total: 0,\n"
    "                reason: reason, writesNothing: true\n"
    "            });\n"
    "            const Q = _evidenceQueryLib();\n"
    "            if (!Q || typeof Q.planQuestion !== 'function' || typeof Q.composeAnswer !== 'function') {\n"
    "                return absent('模块未加载（evidence-query.js）');\n"
    "            }\n"
    "            try {\n"
    "                const known = Array.isArray(o.knownActors) ? o.knownActors : this._qaKnownActors(o.maxActors);\n"
    "                const plan = Q.planQuestion(qText, { knownActors: known });\n"
    "                const ledgers = _evidenceQueryLedgersOf();\n"
    "                const payload = {\n"
    "                    ledgers: ledgers,\n"
    "                    apis: (typeof _ledgerApis === 'function') ? _ledgerApis() : {},\n"
    "                    pageSize: (Number(o.pageSize) > 0 ? Math.floor(Number(o.pageSize)) : 30)\n"
    "                };\n"
    "                if (o.maxPerLedger !== undefined) payload.maxPerLedger = o.maxPerLedger;\n"
    "                /* 逐条计划跑**既有** query（同一份 matchRow / 同一份 assemble）——\n"
    "                 *   不另写一条「问答专用查询」。计划条数由规划器定（未知意图兜底一条）。 */\n"
    "                const results = [];\n"
    "                const planReadings = [];\n"
    "                for (const p of plan.plans) {\n"
    "                    const r = Q.query(this, p.spec, payload);\n"
    "                    results.push({ id: p.id, spec: p.spec, query: r });\n"
    "                    /* 只留读数，不留 rows（见档头「不扩权」）。 */\n"
    "                    planReadings.push({\n"
    "                        id: p.id, why: p.why, spec: p.spec,\n"
    "                        total: (r && typeof r.total === 'number') ? r.total : 0,\n"
    "                        state: (r && r.state) || 'unknown',\n"
    "                        scanned: (r && r.scanned) || 0,\n"
    "                        replayKey: (r && r.replayKey) || ''\n"
    "                    });\n"
    "                }\n"
    "                const composed = Q.composeAnswer(plan, results, { maxSentences: o.maxSentences });\n"
    "                /* 最近一次读数：诊断行据此说「上次问了几句、几处缺口」。\n"
    "                 *   只留读数（计划数 / 句数 / 缺口数），不留问句正文也不留答案 ——\n"
    "                 *   诊断面是面自述，不是第二个答案库。 */\n"
    "                this._memoryQaLast = {\n"
    "                    at: Date.now(),\n"
    "                    intents: composed.intents, actor: plan.actor,\n"
    "                    plans: planReadings.length,\n"
    "                    total: composed.total, resourced: composed.resourced,\n"
    "                    masked: composed.masked, gaps: composed.gaps.length\n"
    "                };\n"
    "                return {\n"
    "                    version: Q.QA_VERSION || 0,\n"
    "                    question: composed.question, intents: composed.intents, actor: plan.actor,\n"
    "                    answer: composed.answer, gaps: composed.gaps, refs: composed.refs,\n"
    "                    plans: planReadings,\n"
    "                    masked: composed.masked, truncated: composed.truncated,\n"
    "                    resourced: composed.resourced, total: composed.total,\n"
    "                    knownActors: known.length,\n"
    "                    reason: '', writesNothing: true\n"
    "                };\n"
    "            } catch (e) {\n"
    "                errLog(e, 'plugin.askMemoryQuestion');\n"
    "                return absent('thrown');\n"
    "            }\n"
    "        }\n"
    "        /**\n"
    "         * [v3.321.0 · M3-X1] 诊断一行。**三种坏法分开写**：\n"
    "         *   模块没挂 / 面在位但本会话没问过（「待用」不是缺陷）/ 上次读数（含缺口数）。\n"
    "         * 不在诊断行里跑真问答：答一次要扫九账全量，诊断面不许有这种副作用。\n"
    "         */\n"
    "        memoryQaLine() {\n"
    "            try {\n"
    "                const Q = _evidenceQueryLib();\n"
    "                if (!Q || typeof Q.planQuestion !== 'function' || typeof Q.composeAnswer !== 'function') {\n"
    "                    return '模块未加载（evidence-query.js）';\n"
    "                }\n"
    "                const names = this._qaKnownActors(0);\n"
    "                const last = this._memoryQaLast || null;\n"
    "                if (!last) return '待用（面在位 · 可认人名 ' + names.length + ' 个 · 未问过）';\n"
    "                const bits = ['上次 ' + last.plans + ' 条计划 / ' + last.total + ' 句'];\n"
    "                if (last.resourced) bits.push('可回源 ' + last.resourced);\n"
    "                if (last.masked) bits.push('遮蔽 ' + last.masked);\n"
    "                if (last.gaps) bits.push('缺口 ' + last.gaps);\n"
    "                if (last.actor) bits.push('按人 ' + last.actor);\n"
    "                else bits.push('未按人筛');\n"
    "                return bits.join(' · ');\n"
    "            } catch (e) { errLog(e, 'plugin.memoryQaLine'); return '—（诊断异常）'; }\n"
    "        }\n"
    "        /* ────────────────────────────────────────────────────────────────\n"
    "         * [v3.305.0 · X9] 统一记忆工具 API（宿主接线，五出口 + 自述 + 一行诊断）"
)

rep(IDX, ANCHOR_EXIT, NEW_EXIT, 1)

# ── ② selfCheck 行：插在「证据查询」行之后 ──
ANCHOR_ROW = (
    "                        } catch (e) { errLog(e, 'selfCheck.evidenceQuery'); return ['证据查询', '—（诊断异常）'];\n"
    "                        }\n"
    "                    })(),"
)

NEW_ROW = (
    "                        } catch (e) { errLog(e, 'selfCheck.evidenceQuery'); return ['证据查询', '—（诊断异常）'];\n"
    "                        }\n"
    "                    })(),\n"
    "                    /* [v3.321.0 · M3-X1] 带证据问答：回答「问句能拆成哪几条受控查询、答案每句\n"
    "                     *   回不回得到源、有几处是具名缺口」。与上面「证据查询」行**分列**：\n"
    "                     *   那一行答「能按什么查、查的时候能看到多少」，本行答「问出来的答案\n"
    "                     *   有没有出处、哪几句答不出」——压成一行会让「没查过」与「问了没答出」\n"
    "                     *   同形（正是 X1/X9 那一族要治的）。\n"
    "                     *   三态可分：模块未加载 / 面在位未问过 / 上次读数（含缺口数）。 */\n"
    "                    (() => {\n"
    "                        try {\n"
    "                            const Q = _evidenceQueryLib();\n"
    "                            if (!Q || typeof Q.planQuestion !== 'function' || typeof this.memoryQaLine !== 'function') {\n"
    "                                return ['记忆问答', '模块未加载（evidence-query.js）'];\n"
    "                            }\n"
    "                            const body = this.memoryQaLine();\n"
    "                            return ['记忆问答', body];\n"
    "                        } catch (e) { errLog(e, 'selfCheck.memoryQa'); return ['记忆问答', '—（诊断异常）'];\n"
    "                        }\n"
    "                    })(),"
)

rep(IDX, ANCHOR_ROW, NEW_ROW, 1)

# ── ③ 跨仓外供登记表：问答面是新外供面，必须补一行（T5 四态 / T6 分形 / T4 consumer 语法）──
ANCHOR_TSV = "memoryToolsEnvelope\tlonsha-memory-plugin\tv3.321.0\t"

NEW_TSV = (
    "memoryQaAnswer\tlonsha-memory-plugin\tv3.321.0\t"
    "index.js::askMemoryQuestion,_qaKnownActors,memoryQaLine\t"
    "返回恒定键面 version|question|intents|actor|answer[]|gaps[]|refs[]|plans[]|masked|truncated|resourced|total|knownActors|reason|writesNothing"
    "（answer 每句带 kind/planId/text/ref/floor/ledger；gaps 带 kind/why；plans 只带读数**不带 rows**）"
    "\tnone@0"
    "\t缺席(内核未加载=module-unavailable：version=0 且 gaps 里给 module 类具名缺口)"
    "/旧版(kind 或 version 不匹配 ⇒ 下游不予采信)"
    "/不产出(规划抛出=thrown；问句无受控问题型 ⇒ 走正文宽查并在 gaps 里明说这是宽查不是理解)"
    "/空数据(跑了、扫了、确实没有命中 ⇒ answer 空 + gaps 具名 no-rows 并给出扫了多少行)"
    "\t宿主在内核缺席时给**同键**降级回执（version=0 + reason + gaps，答不出时下游也读不到 undefined）；"
    "不跑真查询 ⇒ 诊断行如实写「待用」，不把「没问过」写成「没有答案」"
    "\t缺席｜模块未加载：version=0 且 gaps[0].kind=module（**不是**空答案）｜空｜跑了且明确没命中："
    "answer 为空 + gaps 具名 no-rows｜判不了｜认不出人名：不按人名筛且 gaps 明说「问句里没认出在场人名」，"
    "与「这人确实没答应过」不同形\n"
    "memoryToolsEnvelope\tlonsha-memory-plugin\tv3.321.0\t"
)

rep(TSV, ANCHOR_TSV, NEW_TSV, 1)

# ── 落盘（先全量校验锚点唯一命中，再统一写）──
staged = {}
for path, old, new, must in EDITS:
    src = staged.get(path)
    if src is None:
        src = io.open(path, encoding='utf-8').read()
    n = src.count(old)
    if n != must:
        sys.exit('[patch_b_x1_host] %s 锚点命中 %d 次（期望 %d）：%r' % (path, n, must, old[:80]))
    staged[path] = src.replace(old, new)
    print('[patch_b_x1_host] 锚点校验 ok %s' % path)

for path, body in staged.items():
    io.open(path, 'w', encoding='utf-8').write(body)
    print('[patch_b_x1_host] 写盘 ok %s' % path)