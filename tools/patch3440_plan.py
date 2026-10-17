#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.344.0 PLAN 同步:进度行 / 状态行 / 勾选表 / 基线表 / 体量行 / 现行排序节。

锚点纪律(本会话三次踩坑的教训):
  本仓正文用**全角**括号 U+FF08/U+FF09 与全角逗号 U+FF0C,而字面写全角会被编辑器
  规范化成半角(锚点与源码即不符,命中 0 次)。故:
    1 全角标点一律用 \\uXXXX 转义写(转义是纯 ASCII,编辑器动不了);
    2 其余锚点尽量取**无标点**片段(编号 / 词串 / 版本号),降低依赖;
    3 每处替换前 count 必须恰 1,否则 abort(退出码 41)。
"""
import io, os, sys

P = '/home/user/lonsha-memory-plugin/PLAN.md'
BAK = '/tmp/bak3440/'
orig = io.open(P, encoding='utf-8').read()
lines = orig.split('\n')
FW_L = '\uff08'   # (
FW_R = '\uff09'   # )
FW_C = '\uff0c'   # ,
FW_T = '\uff5e'   # ~ (全角波浪号 U+FF5E,字面写会被编辑器规范成 ASCII 7E)

def sub(idx, old, new, label, expect=1):
    n = lines[idx - 1].count(old)
    if n != expect:
        sys.stderr.write('FAIL: %s 第 %d 行「%s」命中 %d 次(应 %d)\n' % (label, idx, old, n, expect))
        sys.exit(41)
    lines[idx - 1] = lines[idx - 1].replace(old, new)
    print('  ok %s 行 %d: %s -> %s' % (label, idx, old, new))

# ---------- 行 3 文首执行进度 ----------
sub(3, '**执行进度' + FW_L + '2026-10-16' + FW_R + '**',
    '**执行进度' + FW_L + '2026-10-17' + FW_R + '**', 'P-进度日期')
sub(3, '**M4-X1/X2/X3/X4/X5 已交付**', '**M4-X1/X2/X3/X4/X5/X6 已交付**', 'P-进度交付面')
sub(3, 'v3.343.0', 'v3.343.0 / v3.344.0', 'P-进度版本链')
sub(3, 'M4-X6' + FW_T + 'X9 尚未开工', 'M4-X7' + FW_T + 'X9 尚未开工', 'P-进度待做面')
sub(3, '下一刀 M4-X6。', '下一刀 M4-X7。', 'P-进度下一刀')

# ---------- 行 5 当前执行状态(整行替换)----------
NEW5 = (
    '> **当前执行状态\uff082026-10-17\uff0cv3.344.0\uff09**:规划基线 `main@c37c52c`。'
    '本版是第四期**拓展九项第六项 M4-X6**'
    '\uff08梦境、假设、计划与现实的叙事层记忆;P2 / L\uff09实施点:'
    '既有 `memory-type.js` 有 9 类事实与来源、`knowledge-trace.js` / `secret-ledger.js` 能表达误信、'
    '`narrative-pulse.js` 可排除不可信情绪,但**「事实类型」与「叙事层(梦 / 假设 / 计划 / 引述)」不是同一轴** —— '
    '梦到角色死亡会被当成现实写进生成面;「如果搬走」读成「已经搬走」;「打算去」与「已经去过」分不开;'
    '引述他人说法与亲历同权;五层及嵌套例没有一条可机检形态。本版两刀:'
    '**1 内核层轴**(新模块 `narrative-layer.js`:`NL_VERSION 1`,五层 `reality`/`dream`/`hypothesis`/`plan`/`quote` '
    '+ `unspecified`\uff08与已知层**不同形**,不硬塞进五层\uff09;`modalityOf` 判定序'
    '\uff08显式字段 `modality`/`layer`/`narrativeLayer`/`narrative_layer`/`mode`/`worldLayer` > `frame.modality` '
    '> `unspecified`\uff09**不靠关键词**;`frameOf` **嵌套链**\uff08上限 `MAX_FRAMES 4`,不无限细分\uff09;'
    '`planStateOf` **计划闸**\uff08说 done 但**无事件关联** ⇒ 仍 `planned`、reason `done-without-event-ref`,'
    '不因一句「决定了」自动完成\uff09;`realityView` **现实面隔离**'
    '\uff08只取 `stated === true && modality === \'reality\'`\uff09;'
    '`hintOf` 关键词**只作提示读数、不参与层判定**;`hasPercentKey` **不产置信百分比**;'
    '`build` / `projectOf` / `line` / `selfCheck` 七项自证'
    '\uff08确定性 / 零写面 / 五层齐 / 现实面隔离 / 不产百分比 / 计划闸生效 / 可序列化\uff09;'
    '导出面 **22** 项,零依赖 IIFE 双导出);**2 宿主接线面**\uff08取库口 `_narrativeLayerLib` + '
    '三出口 `narrativeLayer` / `narrativeReality` / `narrativeProject` + 诊断行 `_narrativeLayerLine` + '
    '自检面「叙事层」行\uff09。**五条评判线索落地**:五类及嵌套例各一条;**现实面 6 条取 1 排除 5**;'
    '计划说落实却无事件关联仍 `planned`;嵌套 `depth 2` 且超 `MAX_FRAMES` 截断;'
    '有「梦」线索词仍落 `unspecified`\uff08不猜\uff09。专项套件 v3440 **22 条全绿**'
    '\uff08A 结构面 / B 真跑五条 / C 宿主六出口 / D1~D6 六条真源码破坏负控制 / '
    'F1 判据纯度 + F2 工具两向自证 / G1 版本锚\uff09。宿主基线 21606/787\uff08ceiling 22006 余量 400\uff09;'
    '`extra_js` **108 → 109**\uff08新模块 narrative-layer.js\uff09。'
    '上一项 M4-X5\uff08v3.343.0,同一事件的多方证词与争议档案\uff09。本版是**只读层判定**:'
    '层标注落在既有条目上\uff08缺省回落事实账 `_factVersionState.facts`\uff09,**不新增任何持久化键**。'
    '本版全量**读数未登记**\uff08快照按纪律仍停 v3.328.0,登记留到第四期计划收口点\uff09,'
    '故当前 v3.344.0 **全量待验**。'
)
lines[4] = NEW5
print('  ok P-状态行 行 5(整行替换)')

# ---------- 行 9 勾选表表头 ----------
sub(9, 'M4-X1/X2/X3/X4/X5 已交付 / M4-X6' + FW_T + 'X9 待实施',
    'M4-X1/X2/X3/X4/X5/X6 已交付 / M4-X7' + FW_T + 'X9 待实施', 'P-表头')

# ---------- 行 16 勾选 ----------
sub(16, '| ⬜ M4-X6 |', '| ✅ M4-X6 |', 'P-X6勾选')

# ---------- 行 56 基线版本 ----------
sub(56, '**v3.343.0**', '**v3.344.0**', 'P-基线版本')

# ---------- 行 57 门禁在役面 ----------
sub(57, '**323 测试文件', '**324 测试文件', 'P-门禁在役面')

# ---------- 行 59 体量行 ----------
sub(59, 'v3.343.0 M4-X5 证词面后为 21514 / 783;+ extra_js **108** 项',
    'v3.343.0 M4-X5 证词面后为 21514 / 783,v3.344.0 M4-X6 叙事层记忆后为 21606 / 787;+ extra_js **109** 项',
    'P-体量行')

# ---------- 行 65 现行排序节 ----------
sub(65, '**执行进度' + FW_L + '2026-10-16' + FW_R + '**',
    '**执行进度' + FW_L + '2026-10-17' + FW_R + '**', 'P-排序节日期')
sub(65, '**M4-X2/X3/X5 已交付**', '**M4-X2/X3/X5/X6 已交付**', 'P-排序节交付面')
sub(65, 'v3.342.0', 'v3.342.0 / v3.344.0', 'P-排序节版本链')
sub(65, '**M4-X6/X7/X8/X9** **尚未开工**', '**M4-X7/X8/X9** **尚未开工**', 'P-排序节待做面')
sub(65, '**下一刀 = M4-X6**', '**下一刀 = M4-X7**', 'P-排序节下一刀')
sub(65, '同一事件的多方证词与争议档案', '旧事重现进入真实生成且由玩家控频', 'P-排序节下一刀描述')
sub(65, 'P2 / L', 'P1 / L', 'P-排序节优先级')

src = '\n'.join(lines)
if src == orig:
    print('NO-OP')
    sys.exit(0)
os.makedirs(BAK, exist_ok=True)
io.open(BAK + 'PLAN.pre3440.md', 'w', encoding='utf-8').write(orig)
io.open(P, 'w', encoding='utf-8').write(src)
print('PATCHED PLAN.md')