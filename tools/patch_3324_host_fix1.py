#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch_3324_host_fix1.py — [v3.324.0 · D 包记忆侧第一刀] 诊断行对齐 C 包范式

为什么改（当场发现的真缺陷，不是风格问题）：
  · 首版诊断行写了「缓存优先、无缓存才真跑」—— 后果有两层：
    ① 与 C 包逐字同范式（`_relationHistoryLine` 直接 `this.relationHistory({})` 真跑）不一致，
       本仓「同一件事两种写法」本身就是下一任读代码的人踩的坑；
    ② **出口 `correctionPlanReextract` 全库零调用点** —— 扫描面 D2 里点名了它。
       「导出了 API 但没有任何真实调用者」正是本仓定性的功能级失效形态：
       导出即摆设 ⇒ 数据面（M3-X9 的核心：局部重提取与原文逐条对照）在真实运行中
       永远不会被算出来，只在测试里活着。
  · 修法：两处诊断行都**真跑出口**（出口内部自会写缓存），且纠错方案行**两面都报**
    （配置面「改哪儿」与数据面「补哪段 / 对不对得上」不是一件事 —— 只报一面会让
    另一面在诊断台上不存在）。
  · 体检面 bad 判据改为**用两面真跑的返回值**：只用 `this._correctionPlanRead`
    会被「最后一次写入者」决定（两面共写一格），冲突对照因此可能漏报。
"""
import io
import sys

EDITS = []


def rep(path, old, new, must=1):
    EDITS.append((path, old, new, must))


# ---- ① 抽取节奏诊断行：去「缓存优先」，对齐 C 包真跑范式 ----
rep('index.js',
    "        /** [v3.324.0 · M3-O5] 诊断一行。即时 / 攒批 / 未读到 / 补回错过 分开说。 */\n"
    "        _extractionDriverLine() {\n"
    "        try {\n"
    "        const ED = _extractionDriverLib();\n"
    "        if (!ED || typeof ED.line !== 'function') return '模块未加载（extraction-driver.js）';\n"
    "        const cached = this._extractionDriverRead;\n"
    "        if (cached && cached.kind) return ED.line(cached);\n"
    "        const got = this.extractionPlan({});\n"
    "        if (!got.ok) return '抽取节奏不可用（' + got.reason + '）';\n"
    "        return ED.line(got);\n",
    "        /** [v3.324.0 · M3-O5] 诊断一行。即时 / 攒批 / 未读到 / 补回错过 分开说。\n"
    "         *   ★ **真跑出口**（与 C 包 `_relationHistoryLine` 逐字同范式）：出口必须有真实调用者，\n"
    "         *     「导出了但只等别人来问」= 本仓定性的功能级失效（导出即摆设）。 */\n"
    "        _extractionDriverLine() {\n"
    "        try {\n"
    "        const ED = _extractionDriverLib();\n"
    "        if (!ED || typeof ED.line !== 'function') return '模块未加载（extraction-driver.js）';\n"
    "        const got = this.extractionPlan({});\n"
    "        if (!got.ok) return '抽取节奏不可用（' + got.reason + '）';\n"
    "        return ED.line(got);\n")

# ---- ② 纠错方案诊断行：两面都真跑（否则数据面出口零调用点） ----
rep('index.js',
    "        /** [v3.324.0 · M3-O7 + M3-X9] 诊断一行。两面分开说（配置面报候选与背书，数据面报四态对照）。 */\n"
    "        _correctionPlanLine() {\n"
    "        try {\n"
    "        const CP = _correctionPlanLib();\n"
    "        if (!CP || typeof CP.line !== 'function') return '模块未加载（correction-plan.js）';\n"
    "        const cached = this._correctionPlanRead;\n"
    "        if (cached && cached.kind) return CP.line(cached);\n"
    "        const got = this.correctionPlanConfig([], null, {});\n"
    "        if (!got.ok) return '纠错方案不可用（' + got.reason + '）';\n"
    "        return CP.line(got);\n",
    "        /** [v3.324.0 · M3-O7 + M3-X9] 诊断一行。**两面都真跑、都报**：\n"
    "         *   配置面答「改哪儿、撤的是配置还是事实」，数据面答「补哪段、跟原文逐条对上了没有」——\n"
    "         *   只报一面会让另一面在诊断台上根本不存在（用户在面板上看不见 = 这个能力不存在）。\n"
    "         *   ★ **真跑出口**（与 C 包同范式）：两个出口因此各自有真实调用者。 */\n"
    "        _correctionPlanLine() {\n"
    "        try {\n"
    "        const CP = _correctionPlanLib();\n"
    "        if (!CP || typeof CP.line !== 'function') return '模块未加载（correction-plan.js）';\n"
    "        const data = this.correctionPlanReextract({}, {});\n"
    "        const cfg = this.correctionPlanConfig([], null, {});\n"
    "        if (!data.ok && !cfg.ok) return '纠错方案不可用（' + data.reason + '）';\n"
    "        return CP.line(data) + ' · ' + CP.line(cfg);\n")

# ---- ③ 体检面 bad 判据改为两面真跑返回值 ----
rep('index.js',
    "                        const line = (typeof this._correctionPlanLine === 'function') ? this._correctionPlanLine() : '—';\n"
    "                        const r = this._correctionPlanRead;\n"
    "                        const bad = !!(r && r.ok && ((Number(r.unknownClass) || 0) > 0\n"
    "                        || (Number(r.byOutcome && r.byOutcome.conflicted) || 0) > 0));\n",
    "                        const line = (typeof this._correctionPlanLine === 'function') ? this._correctionPlanLine() : '—';\n"
    "                        /* ★ 判据取**两面真跑的返回值**而不是共用的缓存格：\n"
    "                         *   两个出口共写 `_correctionPlanRead`，只看缓存会让 bad 由「最后一次写入者」决定\n"
    "                         *   —— 数据面报过的冲突对照会因为随后一次配置面调用而被抹掉。 */\n"
    "                        const _rx = (typeof this.correctionPlanReextract === 'function') ? this.correctionPlanReextract({}, {}) : null;\n"
    "                        const _cf = (typeof this.correctionPlanConfig === 'function') ? this.correctionPlanConfig([], null, {}) : null;\n"
    "                        const bad = !!((_rx && _rx.ok && (Number(_rx.byOutcome && _rx.byOutcome.conflicted) || 0) > 0)\n"
    "                        || (_cf && _cf.ok && (Number(_cf.unknownClass) || 0) > 0));\n")

for path, old, new, must in EDITS:
    src = io.open(path, encoding='utf-8').read()
    n = src.count(old)
    if n != must:
        sys.exit('[fix1_3324] %s 锚点命中 %d 次（期望 %d）：%r' % (path, n, must, old[:90]))
    io.open(path, 'w', encoding='utf-8').write(src.replace(old, new))
    print('[fix1_3324] ok %s (+%d 字符)' % (path, len(new) - len(old)))
print('[fix1_3324] 完成：两诊断行真跑出口（数据面出口不再是零调用点）+ 体检面两面判据')