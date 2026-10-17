#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.344.0 TODO 同步:文首待办行 + 插入「最近更新:v3.344.0」并把旧行降为历史留痕。

锚点纪律:全角标点一律 \\uXXXX 转义;每处 count 须恰 1。
"""
import io, os, sys

P = '/home/user/lonsha-memory-plugin/TODO.md'
BAK = '/tmp/bak3440/'
orig = io.open(P, encoding='utf-8').read()
lines = orig.split('\n')
FW_L, FW_R, FW_C, FW_T, FW_S = '\uff08', '\uff09', '\uff0c', '\uff5e', '\uff1a'

def sub(idx, old, new, label, expect=1):
    n = lines[idx - 1].count(old)
    if n != expect:
        sys.stderr.write('FAIL: %s 第 %d 行「%s」命中 %d 次(应 %d)\n' % (label, idx, old, n, expect))
        sys.exit(41)
    lines[idx - 1] = lines[idx - 1].replace(old, new)
    print('  ok %s 行 %d' % (label, idx))

# ---------- 行 3 文首现行产品待办 ----------
sub(3, '**现行产品待办' + FW_L + '2026-10-16' + FW_R + '**',
    '**现行产品待办' + FW_L + '2026-10-17' + FW_R + '**', 'T-待办日期')
sub(3, 'M4-X1/X2/X3/X4 已交付**', 'M4-X1/X2/X3/X4/X5/X6 已交付**', 'T-待办交付面')
sub(3, 'v3.342.0' + FW_R + FW_C + '**M4-X5' + FW_T + 'X9 尚未开工**',
    'v3.342.0 / v3.343.0 / v3.344.0' + FW_R + FW_C + '**M4-X7' + FW_T + 'X9 尚未开工**',
    'T-待办版本链+待做面')
sub(3, '**下一刀 M4-X5**' + FW_L + '同一事件的多方证词与争议档案',
    '**下一刀 M4-X7**' + FW_L + '旧事重现进入真实生成且由玩家控频', 'T-待办下一刀')

# ---------- 行 19:降为历史留痕 + 前插 v3.344.0 新行 ----------
sub(19, '> **最近更新' + FW_S + 'v3.343.0 ——',
    '> **历史留痕' + FW_S + 'v3.343.0 ——', 'T-降旧行为历史')

NEW19 = (
    '> **最近更新' + FW_S + 'v3.344.0 —— 第四期拓展第六项 M4-X6:梦境、假设、计划与现实的叙事层记忆'
    '\uff08P2 / L\uff09**\uff08第四期产品拓展包第二包「正史与证词」\uff09。'
    '★ **修的是什么\uff08修前实测,读码可复算\uff09**:既有 `memory-type.js` 有 9 类事实与来源、'
    '`knowledge-trace.js` / `secret-ledger.js` 能表达误信、`narrative-pulse.js` 可排除不可信情绪,'
    '但**「事实类型」与「叙事层\uff08梦 / 假设 / 计划 / 引述\uff09」不是同一轴** —— '
    '梦到角色死亡会被当成现实写进生成面;「如果搬走」读成「已经搬走」;'
    '「打算去」与「已经去过」分不开;引述他人说法与亲历同权;五层及嵌套例没有一条可机检形态。'
    '★ **本刀\uff08两刀:内核层轴 / 宿主接线面,不另建一套时间线、不新增持久化键\uff09**:'
    '1 **内核层轴** —— 新模块 `narrative-layer.js`\uff08`NL_VERSION 1`,`NL_KIND \'narrative_layer\'`,'
    '零依赖 IIFE 双导出\uff09;五层 `reality`/`dream`/`hypothesis`/`plan`/`quote` + `unspecified`'
    '\uff08与已知层**不同形**,不硬塞进五层\uff09;`modalityOf` 判定序\uff08显式字段 > `frame.modality` '
    '> `unspecified`\uff09**不靠关键词**;`frameOf` **嵌套链**\uff08上限 `MAX_FRAMES 4`\uff09;'
    '`planStateOf` **计划闸**\uff08说 done 但**无事件关联** ⇒ 仍 `planned`\uff09;'
    '`realityView` **现实面隔离**;`hintOf` 关键词**只作提示读数、不参与层判定**;'
    '`hasPercentKey` **不产置信百分比**;`build` / `projectOf` / `line` / `selfCheck` 七项自证;导出面 **22** 项。'
    '2 **宿主接线面** —— 取库口 `_narrativeLayerLib` + 三出口 `narrativeLayer` / `narrativeReality` / '
    '`narrativeProject` + 诊断行 `_narrativeLayerLine` + 自检面「叙事层」行;'
    '取数缺省回落**事实账** `_factVersionState.facts`\uff08层标注就落在既有条目上\uff09,'
    '**不新增任何持久化键**\uff08不动 `ARCHIVE_TOP_LEVEL_KEYS` / `CARRYOVER_EXEMPT_KEYS` / '
    '`collectExport` / `restoreFromPayload` / `clearRuntimeMemory` 五面\uff09。'
    '★ **五条评判线索逐条落地\uff08全部真跑读数,读码可复算\uff09**:五类及嵌套例各一条;'
    '**现实面 6 条取 1 排除 5**\uff08梦 / 假设 / 计划 / 引述 / 未标注全挡在现实面外\uff09;'
    '计划说落实却无事件关联仍 `planned`\uff08`planAwaitingEvent 1`\uff09;'
    '嵌套 `depth 2` 且超 `MAX_FRAMES` 截断;有「梦」线索词仍落 `unspecified`\uff08不猜\uff09。'
    '★ **定向复验\uff08全部真跑\uff09**:`tests/v3440_m4x6_narrative_layer.test.mjs`\uff08**22 条**,'
    '宿主侧从 `index.js` 真切片 + 真装载 `narrative-layer` 内核\uff09:'
    'A 结构面\uff08宿主四面 + 取库口 + 自检行 + `extra_js` 109 + 零落盘面 / 内核版本 + 五层 + 十原语 + 七项自证\uff09 / '
    'B 真跑五条\uff08层轴 / 现实面隔离 / 计划闸 / 嵌套可见且有界 / 不猜\uff09 / '
    'C 宿主六出口\uff08取真源 / 现实面接线 / 分层投影 / 缺模块三态降级 / 诊断行 / 缺省取数且两路读数逐字一致\uff09 / '
    'D1~D6 **六条真源码破坏负控制**\uff08各带原版阳性对照\uff09 / F1 H5 判据纯度 + F2 H6 工具两向自证 / G1 版本锚。'
    '宿主基线重建至 v3.344.0:实测 21606 行 / 787 成员\uff08ceiling 21914 → 22006 余量 400,成员 788 在线内不抬\uff09;'
    '`extra_js` **108 → 109**\uff08新增模块 `narrative-layer.js`\uff09。'
    '· 退出码三档:0 卫生 / 1 真缺陷 / 2 结构漂移\uff08本仓扫描器契约\uff09。'
    '★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流与真实模型问答**未跑**'
    '\uff08宿主新面以真装载宿主切片验证调用口径\uff09;本面是**纯只读层判定**,'
    '层标注落在既有条目上,**不新增持久化键**;全量 `npm test` **读数未登记**'
    '\uff08快照按纪律仍停 v3.328.0,登记留到第四期计划收口点\uff09 ⇒ 本版**全量待验**。'
)
lines.insert(18, NEW19)
print('  ok T-新最近更新行插在行 19')

src = '\n'.join(lines)
if src == orig:
    print('NO-OP')
    sys.exit(0)
os.makedirs(BAK, exist_ok=True)
io.open(BAK + 'TODO.pre3440.md', 'w', encoding='utf-8').write(orig)
io.open(P, 'w', encoding='utf-8').write(src)
print('PATCHED TODO.md')