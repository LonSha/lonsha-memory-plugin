#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.443.0 抬版第三步：只改 TODO.md 顶节（最近更新链）。

口径沿用 v3.441/v3.442（`> **最近更新：` 在本仓是**历史留痕链**，实测多处，
要求「恰 1 处」就是在健康树上 abort）：取 `hit[0]`，不要求唯一。
version-guard 的 V7 也是「正则取首次命中」—— 即「第一处即当版」才是真源形态。

顺读降级链（本仓实测形态）：
    第 2 行  `> **最近更新：v3.442.0** …`   → 整行换成新当版内容
    第 3 行  `> **上一版更新：v3.441.0** …`  → 换成「上一版更新：v3.442.0」+ 本版摘要
    随后插入 `> **再前一版：v3.441.0** + 原第 3 行正文`（原 v3.441.0 全文不丢）
"""
import re
import sys

V_OLD = '3.442.0'
V_NEW = '3.443.0'
REPO = '/home/user/lonsha-memory-plugin/'

with open(REPO + 'TODO.md', 'r', encoding='utf8') as f:
    td = f.read()

lines = td.split('\n')
hit = [i for i, l in enumerate(lines) if l.startswith('> **最近更新：')]
if not hit:
    sys.exit('[abort] TODO 里找不到 `> **最近更新：` 行 —— 形态已变，先核真源')
k = hit[0]
if ('v' + V_NEW) in lines[k]:
    sys.exit('[abort] TODO 第一处「最近更新」已是 v%s —— 拒绝重复插入' % V_NEW)
if ('v' + V_OLD) not in lines[k]:
    sys.exit('[abort] TODO 第一处「最近更新」不是 v%s —— 请先确认抬版起点' % V_OLD)

V442 = ('v3.442.0 L13-X6 静音清单面：把「我现在把什么静音了」做成常驻可解的面 —— 但**在画面之前'
        '先补了「有地方存」**。起点两条硬读数：① 全仓零常驻静音清单（`silenceExplainState` 只在'
        '「问为什么召不回」时才用）；② `seasonState` / `topicSeasons` 在 `index.js` / `memory-organs.js` / '
        '`memory-core.js` 里**一次都没出现**、也不在 `WorldProgress` 的**构造/导出/导入**三处枚举里'
        '（对照组 `institutionRules` / `symbolicEntities` / `eraTransitions` / `growthBundles` 三处都在）'
        '⇒ **静音存盘即丢、读档即空**。故 `memory-organs.js` 先补三处（构造显式落格 / 导出带类型守卫 / '
        '导入畸形回落空账），两格语义不同**不许合并**：`seasonState` 是**动作表**（`applySeasonAction` '
        '写 `mute|defer|embrace|probe`）、`topicSeasons` 是**主题本体表**；导入面**不逐字段校验**'
        '（合法性归内核）。内核三出口：`silenceListState`（只读、`writesNothing:true`）/ `silenceLift`'
        '（**只认一个 topicId，无批量入口**）/ `_silenceListLine`。**两源分列永不合并**：`ctx`（本轮）与 '
        '`season`（持久）各成一列，同 id 双源都保留，`ctx + season = total` 是**条数不是主题数**。'
        '三态不同形：缺席（`ok:false` + `module-unavailable`，面板明写「**不是「你没有静音任何东西」**」）'
        '/ 空账（`ok:true` + `total 0`）/ 有静音。`since` 只报 `sinceKind:\'last-season-action\'` 并自报'
        '这是哪一种，**绝不把全局时间冒充逐条起点**；`until` **恒 null**（无到期机制）。解除只逐条、走 '
        '`applySeasonAction(...,\'embrace\')`、**不删键**，五个原因码互不同形，失败路径**一个字不写账**。'
        '面板新增 `data-view="silence"`，视图 26 → **27**。★ 判据 14 条全绿，**首跑 4 红逐条归因：'
        '2 产品侧真缺陷（缺席态 `state` 写成字面量 `\'ok\'` 两态同形；`echo` 回写 '
        '`_silenceExplainCtx` 覆盖调用方判定输入，改用 `Object.create(engine)` 一次性代理）'
        '+ 1 判据侧假绿 + 1 抬版前预期内**。**边界**：「召回面验证被解除条目真能召回」**未执行**'
        '（只做到面板与账层）；真机 ST 未执行；全量回归未跑。')

NEW_HEAD = ('> **最近更新：v3.443.0**（**L13-X8 本轮生成的可撤销快照**：把「这一轮到底新塞进了哪些条目」'
            '做成可对拍、可只撤新增的面。起点是一条读码事实 —— 本仓能「撤」的只有 `row.revoke`'
            '（撤**证据裁决**）与 `snapshot-checkpoint`（**整份载荷**级检查点），**中间那一层是空的**：'
            '一轮生成往图谱加 3 节点 / 往锁定事实加 1 条，发现抽错只能各面对着手删或整份回滚（把同轮'
            '正确写入一起吞掉）⇒「这轮加错了」与「整份都废了」被压成同一种处置（Problem 8）。'
            '新内核 `round-entry-snapshot.js`（360 行，零依赖、CJS/IIFE 双导出）五条边界：'
            '**不复制正文**（只记 `id` + 指纹 `{len, head24, tail24, h}` —— 复制正文等于绕开各账 owner '
            '另建真源）/ **不新建存储**（挂 `engine._roundSnapshots`，随存档走）/ **不回退修改**'
            '（只标 `pendingReview` —— 回退会吞掉别的动作）/ **不猜 id**（白名单键，取不到计入 '
            '`skippedNoId`，不按索引对齐）/ **无跨账强制清空**（仍逐账逐 id 走各账删除口）。'
            '三态纪律：`absent≠empty`（`ok:false+reason` vs `ok:true+counts 0`，`list` 抛异常也归'
            '不可用并点名 `ledger-unreadable:<key>`）、`modified≠added` 且**只有 added 可撤**、'
            '`unknown-fingerprint` 单列（拿不到判据既不算改过也不算没改）。超 `MAX_ENTRIES_PER_LEDGER=400` '
            '置 `truncatedOnto`（截断自报）；`recordSnapshot` 在 `summary.ok!==true` 时**拒绝记假快照**'
            '（记了等于宣布「本轮新增 0 条」）；快照环 `MAX_ROUNDS=12`。`roundUndoState` **四态**：'
            '`no-round`（一对都没有）/ `half-round`（`missing` 点名缺哪半 —— 采集断在半路不许装成'
            '「没有」）/ `ok` / `undone`（带 `undoneAt`，不重放）。`undoRound`：`confirm!==true` 是'
            '**硬门槛**（缺/`false`/`\'true\'`/`1` 全拒，且**连删除口都不调**）；`removed` 不可撤'
            '（`content-not-kept` —— 正文没存，撤回来等于编造）、`modified` 恒 `undoable:false`'
            '（结构上没有回退路径）、无删除口的账 `skipped` 单列、删不掉 `partial`+`ok:false`、'
            '本轮无新增 `nothing-to-undo`+`writes:false`（与撤成功不同形）。宿主 `index.js` 五桩两清单'
            '（+60 行）：账本纳入 `lockedFacts`/`graphNodes`/`graphEdges`/`summaries`/`deltas`，'
            '删除口**只给三本**（删摘要牵动卷/折叠账、`deltas` 是 append-only —— 如实不给），'
            '删节点后 `rebuildNameIndex()`（否则「删了节点还能按名字查到」），**宿主不 splice 别人的'
            '数组**。诊断层 +120 行：`roundUndo` **先判 confirm 再读账**（读也算一次动作），成功后清 '
            '`_roundUndoRead`，`_roundUndoLine` 四态措辞互不重叠。面板 +82 行：`oplog` 视图加'
            '「↩️ 撤销本轮写入」块 + `window.confirm` 二次确认（**两层**：面板问 + 内核卡）+ 撤销后'
            '审计链记一条 `rollback/undo-round`（记账失败不回滚已完成的撤销）。★ 判据 '
            '`tests/v3443_l13_x8_round_snapshot.test.mjs` **25 条全绿**（A 3 / B 3 / C 3 / D 4 / E 4 / '
            'F 3 / G 5），含三条真源码破坏各配原版对照（`modified` 塞进 `added` / 指纹退化成整段正文 / '
            '删掉 `missing` 分支）。★ **首跑 11 红逐条归因：3 产品侧真缺陷 + 1 形状不一致 + 6 判据侧'
            '夹具 + 1 抬版前预期内** —— ① `lastRoundPair` 第二个 `if` 带 `after &&` 前置 ⇒「记了 before、'
            'after 没记」被判成 `no-round`（应为 `half-round`，两者意义相反），修成两段扫且 `before` '
            '只在 `after` **之前**找（否则与下一轮 `before` 错配）；② `undoRound` 写 `undone:true` 但 '
            '`roundUndoState` **从不读它** ⇒ 撤完再点一次拿已不存在的 id 去删、报三个 failed'
            '（「写了不读」族），补第四态；③ `nothing-to-undo` 分支缺 `counts`（同一函数返回不同键）；'
            '④ 加载器用 `vm.runInNewContext` 是**另一个 realm**，`assert.deepEqual` 含原型严格深比 ⇒ '
            '`[\'f1\',\'f2\'] ≠ [\'f1\',\'f2\']`，六条集体假红（红在夹具上＝判据没被测到），'
            '改 `new Function` 同 realm；⑤ F1 破坏写成 `st.added.concat(st.modified).length` 当上界 ⇒ '
            '循环体取到 `undefined` 抛异常被 `safe()` 吞成 `failed` ⇒ 改过的条目其实没被删'
            '（**破坏没真的改行为**＝假绿），换成在 diff 层把 `modified` 塞进 `added`；⑥ G4 的次序判据'
            '原用 `indexOf(\'RS.undoRound\')` 先命中 `typeof RS.undoRound !== \'function\'` 那句**取库**'
            '检查（本来就该早于 confirm），改盯调用点；⑦ G5 抬版前预期内。`extra_js` 247 → **248**'
            '（零未登记孤儿，228 活跃 / 20 已登记留存），视图总数仍 27（挂在既有 `oplog` 内 —— '
            '它回答「这一轮」而非「所有轮」）。**边界**：计划验收「真跑一轮生成新增 3 条 → 撤销」用'
            '**夹具真跑**证到行为（真记账/真删/真回读），**真实 SillyTavern 会话里没跑过真生成**；'
            '★ 本版**没有**把 `roundSnapshotBefore/After` 挂进主生成链路（改生成主路径的风险与收益'
            '不成比例），故「装了就有快照」不成立，须由调用方在生成前后各调一次；`summaries`/`deltas` '
            '纳入摘要但**不给删除口**（撤销它们报 `skipped: no-remover` 并在面板逐条点名）；真机 ST '
            '触摸/窄屏/刷新后加载**未执行**；全量回归**未跑**（读数登记仍停 v3.431.0、显式待验）。'
            '**L13 进度**：X1 / X2 / X3 / X7 / X4 / X6 / **X8** 已交付；X9 / X5 待做。')

lines[k] = NEW_HEAD
nxt = k + 1
if nxt < len(lines) and lines[nxt].startswith('> **上一版更新：'):
    old_prev = lines[nxt]
    m = re.match(r'> \*\*上一版更新：(v[0-9.]+)\*\*', old_prev)
    tag = m.group(1) if m else ''
    tail = old_prev[len('> **上一版更新：' + tag + '**'):] if tag else old_prev
    lines[nxt] = '> **上一版更新：v%s**（%s）' % (V_OLD, V442)
    if tag:
        lines.insert(nxt + 1, '> **再前一版：%s**%s' % (tag, tail))
else:
    lines.insert(k + 1, '> **上一版更新：v%s**（%s）' % (V_OLD, V442))

out = '\n'.join(lines)
with open(REPO + 'TODO.md', 'w', encoding='utf8') as f:
    f.write(out)

# 自证（写盘后重新读盘）：第一处「最近更新」必须是当版，且降级链首两处是 V_OLD
out2 = open(REPO + 'TODO.md', encoding='utf8').read().split('\n')
hit2 = [i for i, l in enumerate(out2) if l.startswith('> **最近更新：')]
if ('v' + V_NEW) not in out2[hit2[0]]:
    sys.exit('[abort] 自证失败：第一处「最近更新」不是 v%s' % V_NEW)
if ('v' + V_OLD) not in out2[hit2[0] + 1]:
    sys.exit('[abort] 自证失败：紧随其后的「上一版更新」不是 v%s' % V_OLD)
if not out2[hit2[0] + 2].startswith('> **再前一版：v3.441.0'):
    sys.exit('[abort] 自证失败：第三处降级行不是 v3.441.0（实 %r）' % out2[hit2[0] + 2][:40])
print('TODO done: 顶节已按 v%s 收口（第一处命中行 %d）' % (V_NEW, hit2[0] + 1))
print('  降级链: %s' % ' / '.join(l[3:22] for l in out2[hit2[0]:hit2[0] + 3]))