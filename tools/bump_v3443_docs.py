#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.443.0 抬版第二步：CHANGELOG 新节 + PLAN 顶节/待验句/版本表。

★ 沿用 v3.442.0 已落地的「CHANGELOG 首行陷阱」正解：
  真源首行就是 `## v<ver>`（无任何前导换行），锚点式插入会把新节放到上一版块**之后**。
  故：`cl.startswith('## v')` ⇒ 直接前置（`SECTION + cl`）；否则才退化为
  「插在第一个 `\\n## v` 之前」。写盘后**重新读盘**断言顶节 == `## v<NEW>`。
"""
import sys

V_OLD = '3.442.0'
V_NEW = '3.443.0'
REPO = '/home/user/lonsha-memory-plugin/'


def read(p):
    with open(REPO + p, 'r', encoding='utf8') as f:
        return f.read()


def write(p, s):
    with open(REPO + p, 'w', encoding='utf8') as f:
        f.write(s)


def sub_exact(text, old, new, expect, label):
    n = text.count(old)
    if n != expect:
        sys.exit('[abort] %s: 期望 %d 处，实测 %d 处' % (label, expect, n))
    return text.replace(old, new)


SECTION = """## v3.443.0
**L13-X8 本轮生成的可撤销快照：把「这一轮到底新塞进了哪些条目」做成一个可对拍、可只撤新增的面**
- **起点是一条读码事实，不是偏好**：本仓能「撤」的只有一种 —— `row.revoke` 撤的是**证据裁决**（那条结论作废）；`snapshot-checkpoint` 做的是**整份载荷**级检查点（取个名字存下来、整份对照）。**中间那一层是空的**：一轮生成可能往图谱加 3 个节点、往锁定事实加 1 条、往摘要加 2 条，用户发现「这轮抽错了」时只能去各面对着手删，或者整份回滚（把同轮别的正确写入一起吞掉）。于是「这轮加错了」与「整份都废了」被压成同一种处置 —— 这正是 Problem 8。
- **新内核 `round-entry-snapshot.js`（360 行，零依赖、CJS/IIFE 双导出）**，五条边界逐条写进文件头：① **不复制正文**（摘要只记 `id` + 指纹，复制正文等于绕开各账 owner 另建一份真源，之后两边不再同步）；② **不新建存储**（快照挂 `engine._roundSnapshots`，随引擎存档走，不碰 localStorage、不建表）；③ **不回退「本轮修改」**（只标待复核 —— 回退修改会吞掉别的动作：同一格可能被后一轮合法改动，回退即覆盖别人的结果）；④ **不猜条目身份**（id 由调用方给的 `collect` 提供，取不到就不入摘要并计入 `skippedNoId`，不按索引对齐装成「按 id 对齐了」）；⑤ **无跨账强制清空**（`undoRound` 撤的是**一轮**，但仍逐账逐 id 走各账自己的删除口）。
- **指纹只出 `{len, head(24字), tail(24字), h(32位FNV-1a)}`**。长度单列的理由：`head/tail/h` 看得出「同长度不同内容」，而「长度变了」靠 `len` 立刻看得见。`fpEqual` **三态**：`true` / `false` / `'unknown-fingerprint'` —— 拿不到判据**既不算改过、也不算没改**（把没比过的读成「改过」会让待复核清单掺进假条目）。
- **`idOf` 只认白名单键** `id/uid/key/mid/factId/nodeId/summaryId`，值必须非空（空白串不等于有 id），数字 id 一律转字符串（同一 id 在两侧必须同一形）。
- **采集三态（absent ≠ empty）**：拿不到账 / `list` 抛异常 ⇒ `ok:false` + `reason`（`no-ledgers` / `ledger-unreadable:<key>` / `no-readable-ledger`，逐条点名是哪本账读不出）；真正的「空账」⇒ `ok:true` + `counts` 0。超 `MAX_ENTRIES_PER_LEDGER=400` 置 `truncatedOnto`（**截断自报**，静默截断会让「本轮新增」凭空少算）。
- **`recordSnapshot` 拒绝记假快照**：`summary.ok !== true` 时直接拒绝并把理由串上 —— 记了就等于宣布「本轮新增 0 条」这个编出来的结论。快照环 `MAX_ROUNDS=12`（更早的连 id 列表也不留：回滚太久以前的一轮没有意义）。
- **一对一号（本版自测抓到的一处真缺陷）**：首版按「上一条 seq + 1」编号，实测 `before=1 / after=2` —— 而面板与 `roundUndoState` 报的是 `after.seq`，用户会看到「第 2 轮」而实际只跑过一轮。修成「最后一条是 before ⇒ after 复用它那个 seq」，自测输出 `before seq 1 / after seq 1 / next before seq 2`。
- **`roundUndoState` 四态互不同形**：`no-round`（一对都没有）/ `half-round`（只有半对，`missing` 数组点名缺 `before` 还是 `after` —— 采集断在半路不许装成「没有」）/ `ok`（有可撤）/ `undone`（这一轮已撤过，带 `undoneAt`）。**`undone` 是自测抓到的第二处真缺陷补出来的**：首版 `undoRound` 会写 `undone:true` 但 `roundUndoState` 从不读它 —— 撤完再点一次，面板照样报「新增 3 条可撤」，然后拿三个已不存在的 id 去删，报三个 failed，用户看到「撤销失败」而事实是上次已撤成功（本仓反复治过的「写了不读」族）。
- **`lastRoundPair` 两段扫（判据 D3/F3 首跑抓到的第三处真缺陷）**：首版第二个 `if` 带 `after &&` 前置 —— 只有先找到 `after` 才去找 `before`，于是「记了 before、after 还没记」被判成 `missing=['before','after'] ⇒ no-round`。两者对用户意义相反（「你还没跑过一轮」vs「采集断在半路，得查」）。修成两段扫：先找最近一条 `after`，再**只在它之前**找 `before`（否则会跟下一轮刚记的 `before` 错配：`[B1,A1,B2]` 必须报 B1/A1 这一对）。
- **`undoRound` 撤销语义（唯一写入口）**：`confirm !== true` ⇒ `confirm-required` **硬门槛**（缺 / `false` / 字符串 `'true'` / 数字 `1` 全拒，且**连删除口都不调** —— 判据 E1 钉住 `touched === 0`）；**只删 `added`**：`removed` 不可撤（`why:'content-not-kept'` —— 正文没存，撤回来等于编造）、`modified` 恒 `undoable:false` + `pendingReview:true`（结构上就没有回退路径）；没有删除口的账 `skipped` 单列（`why:'no-remover'`），删不掉 ⇒ `failed` + `reason:'partial'` + `ok:false`（不静默算成功）；本轮没有新增 ⇒ `nothing-to-undo` + `writes:false`（与「撤成功」不同形）。**`removers` 由调用方给** —— 本模块不自己删账（各账删除口归各账 owner）。`nothing-to-undo` 分支的返回形状在本版补齐了 `counts`（其余每条返回路径都带它，缺一条就是「同一函数返回不同键」，调用方统一按 `r.counts` 读时会在这一条上拿到 `undefined`）。
- **宿主 `index.js` 五桩两清单（+60 行）**：取库口 `_roundSnapshotLib()` + libs 注入 + 五个转发桩（`roundSnapshotBefore` / `roundSnapshotAfter` / `roundUndoState` / `roundUndo` / `_roundUndoLine`）。`_roundLedgers()` 纳入**五本账**：`lockedFacts`（走 `summary.getLockedFacts()`）/ `graphNodes` / `graphEdges`（`Array.from(graph.nodes.values())`）/ `summaries` / `deltas`（`deltaBook.export().deltas`）。`_roundRemovers()` **只给三本**：`lockedFacts` 走 `summary.removeLockedFact(id)` 后**回读确认**（`!still` 才算成功）；`graphNodes` 走 `graph.nodes.delete(id)` 后**若删成功且节点有 name 就 `rebuildNameIndex()`**（否则「删了节点却还能按名字查到」）；`graphEdges` 走 `graph.edges.delete(id)`。**`summaries` 与 `deltas` 如实不给删除口**：删摘要会牵动卷/折叠账（属摘要面自己的处置），DeltaBook 是 append-only 账、没有单条删除口。**宿主不 `splice` 别人的数组**（那等于绕开 owner），判据 G2 有反向断言。
- **诊断层 `engine-diagnostic-lines.js`（+120 行）**：取库口 + 四出口 + 诊断行。`roundUndo` **先判 `confirm` 再读账**（连「要不要撤」都没确认时不去读账 —— 读也算一次动作，判据 G4 用调用点位置钉住这个次序）；成功后清 `engine._roundUndoRead`（不清的话面板会继续报旧的可撤销清单）。`_roundUndoLine` 四态措辞互不重叠：不可用 / 还没有一轮完整快照 / 只有半对（缺 X，采集断在半路）/ 新增 N 条可撤 · 删除 M 条不可撤（正文未留），另附「另有 K 条本轮被改过（只标待复核，不回退）」；`undone` 单独一态，说清**是哪一轮、什么时候撤的**。
- **面板 `settings-ui.js`（+82 行）**：`oplog` 视图顶部新增「↩️ 撤销本轮写入」块（四态各自措辞 + 可撤条目逐条点名「账/id」+ `data-round-undo` 按钮）+ 绑定（`window.confirm` 二次确认 → `s._roundRemovers()` 取删除口 → `s.roundUndo({confirm:true, removers})` → 成功 toast 报告撤了几条 → **审计链记一条** `s.opLog.log('rollback','undo-round','seq N · 撤 N 失败 M', floor, reason)` → `plugin._memPersist()` → 按同一视图重建）。**记账失败不回滚已完成的撤销**（`try/catch` 只吞记账异常）。二次确认是**两层**：面板问一次、内核再卡一次。
- **判据 `tests/v3443_l13_x8_round_snapshot.test.mjs` 25 条**（A 指纹与 id 3 / B 采集三态 3 / C 对拍三类 3 / D 记录与四态 4 / E 撤销 4 / F 负控制 3 / G 接线面+当版锚 5），含**三条真源码破坏各配原版对照**：① 把 `modified` 也塞进 `added`（撤销顺手回退修改）；② 指纹 `head` 退化成整段正文（疑似另建真源）；③ 删掉 `missing` 分支（半对当全对）。
- **首跑 11 红，逐条归因（3 产品侧真缺陷 + 1 形状不一致 + 6 判据侧夹具 + 1 抬版前预期内）**：
  1. **产品侧真缺陷** —— `lastRoundPair` 丢 `before`（半对判成 `no-round`），见上，已修。
  2. **产品侧真缺陷** —— `undone` 写了没人读（重放报一堆 failed），见上，已补第四态。
  3. **形状不一致** —— `nothing-to-undo` 分支缺 `counts`，见上，已补齐。
  4. **判据侧夹具（6 条集体假红）** —— 加载器用 `vm.runInNewContext`，那是**另一个 realm**，沙箱内 `Array.prototype` / `Object.prototype` 与主 realm 不同，而 `assert.deepEqual` 是含原型的严格深比 ⇒ `['f1','f2']` 被判成不等于 `['f1','f2']`。红在夹具上等于判据自己没被测到。改用 `new Function`（同 realm、仍是磁盘上那一份真源码，负控制传破坏副本时加载的就是破坏副本）。
  5. **判据侧写错（假绿，最隐蔽的一条）** —— F1 的破坏把循环上界改成 `st.added.concat(st.modified).length`：循环体里 `st.added[i]` 取到 `undefined` ⇒ `removers[row.ledger]` 抛异常 ⇒ 被内核 `safe()` 吞掉算 `failed` ⇒ **改过的条目其实没被删**（破坏没有真的改行为），判据只能读到「f1 还在、值也对」于是不翻红。换成在 diff 层把 `modified` 也塞进 `added` —— 这才是「撤销顺手回退修改」的真形态。
  6. **判据侧钉错位置** —— G4 的「先判 confirm 再读账」原先用 `ur.indexOf('RS.undoRound')`，先命中的是前面那句 `typeof RS.undoRound !== 'function'`（**取库**检查，本来就该早于 confirm）。改成盯调用点 `RS.undoRound(engine, p)`。
  7. **抬版前预期内** —— G5 当版锚（3.442.0 vs 3.443.0），抬版后转绿。
- **接线条数**：`manifest.extra_js` 247 → **248**（`round-entry-snapshot.js` 入册），`tests/audit/module_consumption_ledger.json` 重生成（248 模块 / 228 活跃 / 20 已登记留存 / **零未登记孤儿**）；`scan_ui_view_reach` 视图总数仍 27（本面挂在既有 `oplog` 视图内，不新开视图 —— 它回答的是「这一轮」而不是「所有轮」，与审计链同页才看得见上下文）。
- **诚实边界**：
  1. 计划验收里「**真跑一轮生成新增 3 条 → 撤销 → 恰好少这 3 条、已有的逐字不动**」这一条：本版用**夹具真跑**（内核自测与判据 E2 都是真记账、真删、真回读）证到了行为，但**没有在真实 SillyTavern 会话里跑过一次真生成**。如实登记为「夹具真跑 + 真机未跑」，不写成真机通过。
  2. 真机 SillyTavern 的触摸 / 窄屏 / 刷新后加载**未执行**（`realhost_readings.json` 本版仍 `environment-unavailable`）。
  3. 全量回归**未跑**：按用户指令「做完计划全部内容前别跑全量」，本版只跑单门 / 单套件；全量读数登记仍停在 v3.431.0，显式标待验。
  4. 快照只在**调用方记得记 before/after** 时才有内容：本版**没有**把 `roundSnapshotBefore/After` 挂进主生成链路（那是改动生成主路径，风险与本面的收益不成比例；先交付「可对拍 + 可只撤新增」这层能力，挂载点留待实测到具体调用位置后再接）。这一点写在这里，防止后来者以为「装了就有快照」。
  5. `summaries` / `deltas` 两本账**纳入摘要但不给删除口**：撤销它们时报 `skipped: no-remover`，面板逐条点名。这不是缺陷，是「各账删除口归各账 owner」的直接后果 —— 但用户确实会在 `skipped` 里看到没被撤掉的条目，故如实写明。
"""

cl = read('CHANGELOG.md')
if ('## v' + V_NEW) in cl:
    sys.exit('[abort] CHANGELOG 已含 `## v%s` —— 拒绝重复插入' % V_NEW)
if cl.startswith('## v'):
    cl = SECTION + cl
    how = '首行即 `## v` ⇒ 直接前置'
else:
    marker = '\n## v'
    pos = cl.index(marker)
    cl = cl[:pos + 1] + SECTION + cl[pos + 1:]
    how = '退化：插在首个 `\\n## v` 之前'
write('CHANGELOG.md', cl)
head = read('CHANGELOG.md').split('\n')[0]
if head != '## v' + V_NEW:
    sys.exit('[abort] 顶节断言失败：期望 `## v%s`，实为 %r' % (V_NEW, head))
print('CHANGELOG done: %s（顶节 = %s）' % (how, head))

# ---------- 2. PLAN 顶节 ----------
PLAN_STATUS = """> **当前执行状态（2026-11-02，v3.443.0）**：**L13-X8 本轮生成的可撤销快照已交付** —— 起点是一条读码事实：本仓能「撤」的只有 `row.revoke`（撤**证据裁决**）与 `snapshot-checkpoint`（**整份载荷**级检查点），**中间那一层是空的**（一轮生成往图谱加 3 节点 / 往锁定事实加 1 条，发现抽错只能各面对着手删、或整份回滚把同轮正确写入一起吞掉）⇒ 「这轮加错了」与「整份都废了」被压成同一种处置（Problem 8）。新内核 `round-entry-snapshot.js`（360 行，零依赖）五条边界：**不复制正文**（只记 `id` + 指纹 `{len, head24, tail24, h}` —— 复制正文等于绕开各账 owner 另建真源）/ **不新建存储**（挂 `engine._roundSnapshots`）/ **不回退修改**（只标 `pendingReview` —— 回退会吞掉别的动作）/ **不猜 id**（白名单键，取不到计入 `skippedNoId`）/ **无跨账强制清空**。三态纪律：`absent≠empty`（`ok:false+reason` vs `ok:true+counts 0`）、`modified≠added` 且**只有 added 可撤**、`unknown-fingerprint` 单列（拿不到判据既不算改过也不算没改）。`recordSnapshot` 在 `summary.ok!==true` 时**拒绝记假快照**（记了等于宣布「本轮新增 0 条」）。`roundUndoState` **四态**：`no-round` / `half-round`（`missing` 点名缺哪半）/ `ok` / `undone`（带 `undoneAt`，不重放）。`undoRound` 的 `confirm!==true` 是**硬门槛**（连删除口都不调），**只删 added**：`removed` 不可撤（`content-not-kept`）、`modified` 恒 `undoable:false`、无删除口的账 `skipped` 单列、删不掉 `partial`、无新增 `nothing-to-undo`（`writes:false`，与撤成功不同形）。宿主五桩两清单：账本纳入 `lockedFacts`/`graphNodes`/`graphEdges`/`summaries`/`deltas`，删除口**只给三本**（`summaries` 删了会牵动卷/折叠账、`deltas` 是 append-only —— 如实不给），删节点后 `rebuildNameIndex()`（否则「删了节点还能按名字查到」），**宿主不 splice 别人的数组**。面板 `oplog` 视图加「↩️ 撤销本轮写入」块 + `window.confirm` 二次确认（**两层**：面板问 + 内核卡）+ 撤销后审计链记一条 `rollback/undo-round`。★ 判据 `tests/v3443_l13_x8_round_snapshot.test.mjs` **25 条全绿**（A 3 / B 3 / C 3 / D 4 / E 4 / F 3 / G 5），含三条真源码破坏各配原版对照（`modified` 塞进 `added` / 指纹退化成整段正文 / 删掉 `missing` 分支）。★ **首跑 11 红逐条归因：3 产品侧真缺陷 + 1 形状不一致 + 6 判据侧夹具 + 1 抬版前预期内** —— ① `lastRoundPair` 第二个 `if` 带 `after &&` 前置 ⇒「记了 before、after 没记」被判成 `no-round`（应为 `half-round`，两者意义相反），修成两段扫且 `before` 只在 `after` **之前**找（否则与下一轮 `before` 错配）；② `undoRound` 写 `undone:true` 但 `roundUndoState` **从不读它** ⇒ 撤完再点一次拿已不存在的 id 去删、报三个 failed（「写了不读」族），补第四态 `undone`；③ `nothing-to-undo` 分支缺 `counts`（同一函数返回不同键）；④ 加载器用 `vm.runInNewContext` 是**另一个 realm**，`assert.deepEqual` 含原型严格深比 ⇒ `['f1','f2'] ≠ ['f1','f2']`，六条集体假红（红在夹具上等于判据没被测到），改 `new Function` 同 realm；⑤ F1 破坏写成 `st.added.concat(st.modified).length` 当上界 ⇒ 循环体取到 `undefined` 抛异常被 `safe()` 吞成 `failed` ⇒ 改过的条目其实没被删（**破坏没真的改行为**＝假绿），换成在 diff 层把 `modified` 塞进 `added`；⑥ G4 的次序判据原用 `indexOf('RS.undoRound')` 先命中 `typeof RS.undoRound !== 'function'` 那句**取库**检查（本来就该早于 confirm），改盯调用点；⑦ G5 抬版前预期内。**接线条数**：`extra_js` 247 → **248**（零未登记孤儿，228 活跃 / 20 已登记留存），视图总数仍 27（挂在既有 `oplog` 内 —— 它回答「这一轮」而非「所有轮」，与审计链同页才看得见上下文）。**边界保留**：计划验收「真跑一轮生成新增 3 条 → 撤销」用**夹具真跑**证到行为（真记账/真删/真回读），**真实 SillyTavern 会话里没跑过真生成**，登记为「夹具真跑 + 真机未跑」；★ 本版**没有**把 `roundSnapshotBefore/After` 挂进主生成链路（改生成主路径的风险与收益不成比例，先交付「可对拍 + 可只撤新增」这层能力），故「装了就有快照」不成立，须由调用方在生成前后各调一次；`summaries`/`deltas` 纳入摘要但**不给删除口**（撤销它们报 `skipped: no-remover` 并在面板逐条点名）；真机 ST 触摸/窄屏/刷新后加载**未执行**；全量回归**未跑**（读数登记仍停 v3.431.0、显式待验）。**L13 进度**：X1（沿革回放）/ X2（反事实推演）/ X3（视角投影）/ X7（习惯与成长证据）/ X4（证据缺口工作台）/ X6（静音清单）/ **X8（本轮可撤销快照）** 已交付；X9 / X5 待做（X 面交付序：只读面先做 —— X7、X4、X6 已落，X8 已落，其后 X9，最后 X5）。**上一版 v3.442.0**：L13-X6 静音清单面（先补「有地方存」再画面；两源分列永不合并；无「全部解除」）。**再前一版 v3.441.0**：L13-X4 证据缺口工作台（三档成因穷尽且互不同形，`null` 判不了绝不为凑一档写成「证据丢了」）。**再前一版 v3.440.0**：L13-X7 习惯与成长证据面（两块账分开存分报不互相充抵）。**再前一版 v3.439.0**：L13-X3 视角投影面（`blind` 与 `undecided` 永不同形）。**再前一版 v3.438.0**：L13-O6 注入面可复算。**再前一版 v3.437.0**：L13-O5 世界线口径对玩家的可读化。**再前一版 v3.436.0**：L13-O4 面板视图入口可达性。**再前一版 v3.435.0**：L13-O3 只读视图机器可读四态 + L13-O8 记忆软删闭环。**真宿主门**：v3.433.0 曾在真实 SillyTavern 1.19.0 隔离现场跑通过一次（29 条真实读数 / 0 缺陷 / exit 0）；此后盘面已多次变更，该读数按「历史跑通、当版待复跑」对待。
"""

pl = read('PLAN.md')
lines = pl.split('\n')
hit = [i for i, l in enumerate(lines) if l.startswith('> **当前执行状态（')]
if len(hit) != 1:
    sys.exit('[abort] PLAN 当前执行状态行：期望 1 处，实测 %d' % len(hit))
lines[hit[0]] = PLAN_STATUS.rstrip('\n')
pl = '\n'.join(lines)
pl = sub_exact(pl, '**当前 v%s **全量待验**' % V_OLD, '**当前 v%s **全量待验**' % V_NEW, 1, 'PLAN 全量待验句')
pl = sub_exact(pl, '| 版本 | **v%s**（index.js VERSION 真源） | index.js |' % V_OLD,
               '| 版本 | **v%s**（index.js VERSION 真源） | index.js |' % V_NEW, 1, 'PLAN 版本表')
write('PLAN.md', pl)
print('PLAN done: 顶节 / 待验句 / 版本表（%s -> %s）' % (V_OLD, V_NEW))