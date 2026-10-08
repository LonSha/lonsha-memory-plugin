#!/usr/bin/env python3
"""v3.296.0 · X1：X 系列台账收口（docs/planning/X_SERIES_LEDGER.md）。

台账是**工作记录**（验收原文仍以 .agents/notes/proposed 那份为唯一真源，本文件不复制）。
纪律同前：全部锚点先校验、通过后统一写盘。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
p = ROOT / 'docs/planning/X_SERIES_LEDGER.md'
_src = p.read_text(encoding='utf-8')
s = _src
_log = []


def sub(old, new, why):
    global s
    n = s.count(old)
    if n != 1:
        sys.exit('[ledger3296] 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点=%r' % (n, why, old[:160]))
    if old == new:
        sys.exit('[ledger3296] 同值替换：%s' % why)
    s = s.replace(old, new, 1)
    _log.append(why)


# ① 实施顺序表尾补 X1 行（本批交付的那条；注明与旧 X1 同名不同物）
sub('## 双项目边界',
    '| 8 | **X1** 结构化证据查询与完整度（拓展计划原文里的 X1） | —（对既有九账的深化，不阻塞他项） | ✅ | '
    '✅ **v3.296.0 已交付**（`evidence-query.js` 636 行 + 宿主六口与降级回执 + 诊断行「证据查询」；'
    '判据 `tests/v3296_x1_evidence_query.test.mjs` 16 条：A 登记表逐字对齐 / B **900 条账里找得到最老那条**'
    '（同一台机器上同时证工作台 `search()` 找不到它、`query()` 找得到 —— 只证后者是「函数能跑」，'
    '两件一起证才是「缺口真被补上」）/ C 楼层三态不压平 / D 分页不回落 / E 区间反转按空集且给理由 / '
    'F 四态不同形 / G 只存条件且重放走当前原账 / H 未知条件名不静默忽略且零写副作用'
    ' + N1–N5 真源码破坏负控制 + 7~9 宿主接线与加载面 + V 四源同源与当版锚）。'
    '★ 与序 1 注明的**旧 X1**（v3.270.0 `projection-pipeline.js` 注入容量预演）**同名不同物**，'
    '两条各自独立、登记与判据不得互认 |\n'
    '## 双项目边界',
    '实施顺序表补 X1 行（注明与旧 X1 同名不同物）')

# ② 双项目边界行：本仓 X 系列全部交付
sub('- **lonsha-memory-plugin**（本仓，v3.295.0 → ）：X3–X8 主战场；X3/X4/X5/X6/X7/X8/**X2** 均已交付。',
    '- **lonsha-memory-plugin**（本仓，v3.296.0 → ）：**拓展计划的 X1–X8 八条全部交付**'
    '（X3 v3.289.0 / X4 v3.290.0 / X5 v3.291.0 / X6 v3.292.0 / X7 v3.293.0 / X8 v3.294.0 / '
    'X2 v3.295.0 / **X1 结构化证据查询与完整度 v3.296.0**）。'
    '★ 注意**同名不同物**：本仓另有两条历史 X1 —— v3.270.0 的注入容量预演（`projection-pipeline.js`）'
    '与 v3.272.0 前的一批早期编号，与拓展计划原文里的 X1（结构化证据查询）编号相同、内容不同，'
    '登记与判据**不得互认**。',
    '双项目边界行（本仓交付面）')

# ③ 台账抬头：补一行「本批收口」注记
sub('# X 系列推进台账（v3.289.0 起）',
    '# X 系列推进台账（v3.289.0 起 · v3.296.0 收口）\n'
    '> **收口读数（v3.296.0）**：拓展计划原文的 **X1–X8 八条全部落地**，'
    '各条判据套件在磁盘上齐备：`v3289`(X3) / `v3290`(X4) / `v3291`(X5) / `v3292`(X6) / '
    '`v3293`(X7) / `v3294`(X8) / `v3295`(X2) / `v3296`(X1)。'
    '★ 收口 ≠ 每条都收口：**X2 的依赖 O2 只交付了交互逻辑切片**（真浏览器 + 真 SillyTavern 面未执行，'
    '如实登记）；本台账不把「未执行」读成「已通过」（同 O2 验收原文）。',
    '台账抬头补收口读数')

p.write_text(s, encoding='utf-8')
for why in _log:
    print('[ledger3296] %s' % why)
print('[ledger3296] 全部锚点恰中 1 次，已写盘。')