#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.344.0 CHANGELOG:在顶节 `## v3.343.0` 之前插入 `## v3.344.0` 新节。

锚点纪律:全角标点一律 \\uXXXX 转义;命中须恰 1 次。
"""
import io, os, sys
P = '/home/user/lonsha-memory-plugin/CHANGELOG.md'
BAK = '/tmp/bak3440/'
orig = io.open(P, encoding='utf-8').read()
FW_L, FW_R, FW_C, FW_S = '\uff08', '\uff09', '\uff0c', '\uff1a'
HDR = '## v3.343.0'
if orig.count(HDR + '\n') != 1 or not orig.startswith(HDR):
    sys.stderr.write('FAIL: 顶节锚点 `## v3.343.0` 命中 %d 次或不在文首\n' % orig.count(HDR))
    sys.exit(41)

NEW = (
    '## v3.344.0\n'
    '**第四期拓展第六项 M4-X6' + FW_S + '梦境、假设、计划与现实的叙事层记忆' + FW_L + 'P2 / L' + FW_R
    + '**' + FW_L + '第四期产品拓展包第二包「正史与证词」' + FW_R + '。'
    '★ **修的是什么' + FW_L + '修前实测' + FW_C + '读码可复算' + FW_R + '**'
    + FW_S + '既有 `memory-type.js` 有 9 类事实与来源、`knowledge-trace.js` / `secret-ledger.js` 能表达误信、'
    '`narrative-pulse.js` 可排除不可信情绪,' + '但**「事实类型」与「叙事层'
    + FW_L + '梦 / 假设 / 计划 / 引述' + FW_R + '」不是同一轴** —— '
    '梦到角色死亡会被当成现实写进生成面;「如果搬走」读成「已经搬走」;'
    '「打算去」与「已经去过」分不开;引述他人说法与亲历同权;'
    '五层及嵌套例没有一条可机检形态' + FW_L + '定向查询也回答不了「梦里发生了什么」与「当初计划是什么」' + FW_R
    + '。★ **本刀' + FW_L + '两刀' + FW_S + '内核层轴 / 宿主接线面,不另建一套时间线、不新增持久化键' + FW_R + '**:\n'
    '1 **内核层轴** —— 新模块 `narrative-layer.js`' + FW_L + '`NL_VERSION 1`,`NL_KIND \'narrative_layer\'`,'
    '零依赖 IIFE 双导出' + FW_R + ';五层 `reality`/`dream`/`hypothesis`/`plan`/`quote` + `unspecified`'
    + FW_L + '与已知层**不同形**,不硬塞进五层' + FW_R + ';`modalityOf` 判定序'
    + FW_L + '显式字段 `modality`/`layer`/`narrativeLayer`/`narrative_layer`/`mode`/`worldLayer` '
    '> `frame.modality` > `unspecified`' + FW_R + '**不靠关键词一票判定**;'
    '`frameOf` **嵌套链**' + FW_L + '上限 `MAX_FRAMES 4`,不无限细分' + FW_R + ';'
    '`planStateOf` **计划闸**' + FW_L + '说 done 但**无事件关联** ⇒ 仍 `planned`,'
    'reason `done-without-event-ref`' + FW_R + ';'
    '`realityView` **现实面隔离**' + FW_L + "只取 `stated === true && modality === 'reality'`" + FW_R + ';'
    '`hintOf` 关键词**只作提示读数、不参与层判定**;`hasPercentKey` **不产置信百分比**;'
    '`build` 主流程 / `projectOf` 分层投影 / `line` 一行读数 / `selfCheck` 七项自证'
    + FW_L + '确定性 / 零写面 / 五层齐 / 现实面隔离 / 不产百分比 / 计划闸生效 / 可序列化' + FW_R
    + ';导出面 **22** 项。\n'
    '2 **宿主接线面** —— 取库口 `_narrativeLayerLib` + 三出口 `narrativeLayer(opts)` / '
    '`narrativeReality(opts)` / `narrativeProject(opts)` + 诊断行 `_narrativeLayerLine()`;'
    '自检面「叙事层」行。**零落盘**:无 `narrativeLayer:` 契约键、无 `data.narrativeLayer`,'
    '不混 `ARCHIVE`/`CARRYOVER`;取数缺省回落**事实账** `_factVersionState.facts`'
    + FW_L + '层标注就落在既有条目的 `modality` 字段上' + FW_R + ','
    '**不新增任何持久化键**' + FW_L + '不动 `ARCHIVE_TOP_LEVEL_KEYS` / `CARRYOVER_EXEMPT_KEYS` / '
    '`collectExport` / `restoreFromPayload` / `clearRuntimeMemory` 五面' + FW_R + '。\n'
    '★ **五条评判线索逐条落地' + FW_L + '全部真跑读数,读码可复算' + FW_R + '**:五类及嵌套例各一条'
    + FW_L + '现实 / 梦 / 假设 / 计划 / 引述 + 未标注独立' + FW_R + ';'
    '**现实面 6 条取 1 排除 5**' + FW_L + '梦 / 假设 / 计划 / 引述 / 未标注全挡在现实面外' + FW_R + ';'
    '计划在剧情落实后有明确事件关联、不因一句「决定了」自动完成'
    + FW_L + '`planAwaitingEvent 1` 仍 `planned`' + FW_R + ';'
    '嵌套 `depth 2` 且超 `MAX_FRAMES` 截断;有「梦」线索词仍落 `unspecified`'
    + FW_L + '不猜、不追溯改写无证据的旧记忆' + FW_R + '。'
    '★ **定向复验' + FW_L + '全部真跑' + FW_R + '**:`tests/v3440_m4x6_narrative_layer.test.mjs`'
    + FW_L + '**22 条**' + FW_C + '宿主侧从 `index.js` 真切片 + 真装载 `narrative-layer` 内核' + FW_R + ':'
    'A1/A2 结构面' + FW_L + '宿主四面 + 取库口 + 自检行 + `extra_js` 109 + 零落盘面 / '
    '内核版本 + 五层 + 未标注一格 + 十原语 + 七项自证' + FW_R + ' / '
    'B1~B5 真跑' + FW_L + '层轴 / 现实面隔离 / 计划闸 / 嵌套可见且有界 / 不猜' + FW_R + ' / '
    'C1~C6 宿主出口' + FW_L + '取真源 / 现实面接线 / 分层投影 / 缺模块三态降级 / 诊断行 / '
    '缺省取数且两路读数逐字一致' + FW_R + ' / '
    'D1~D6 **六条真源码破坏负控制**' + FW_L + '各带原版阳性对照' + FW_R + ' / '
    'F1 H5 判据纯度 + F2 H6 工具两向自证 / G1 版本锚。'
    '宿主基线重建至 v3.344.0:实测 21606 行 / 787 成员'
    + FW_L + 'ceiling 21914 → 22006 余量 400,成员 788 在线内不抬' + FW_R + ';'
    '`extra_js` **108 → 109**' + FW_L + '新增模块 `narrative-layer.js`' + FW_R + '。'
    '· 退出码三档' + FW_S + '0 卫生 / 1 真缺陷 / 2 结构漂移'
    + FW_L + '本仓扫描器契约;本节同款声明供 D9 核对' + FW_R + '。'
    '★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流与真实模型问答**未跑**'
    + FW_L + '宿主新面以真装载宿主切片验证调用口径' + FW_R + ';本面是**纯只读层判定**,'
    '层标注落在既有条目上,不新增持久化键;老数据**不猜测批量重标**;'
    '全量 `npm test` **读数未登记**' + FW_L + '快照按纪律仍停 v3.328.0,'
    '登记留到第四期计划收口点' + FW_R + ' ⇒ 本版**全量待验**。\n'
)

src = NEW + orig
os.makedirs(BAK, exist_ok=True)
io.open(BAK + 'CHANGELOG.pre3440.md', 'w', encoding='utf-8').write(orig)
io.open(P, 'w', encoding='utf-8').write(src)
print('PATCHED CHANGELOG.md(插入 ## v3.344.0)')