#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bump_3323_docs.py - [v3.323.0 · C 包] 人读面与台账补完
（CHANGELOG 顶节 / TODO 最近更新 / catalog 台账 / 破坏套件台账 / 外供登记表三新行）

纪律：
  · CHANGELOG 顶节必须**新增**一节（不是改旧节），并带「退出码三档」与「绝不跑全量」两句
    （scan_doc_truthfulness 的 D9 会把它们核回扫描器实现）；
  · TODO 的「最近更新」行前移，旧当前行降为「历史留痕」；
  · 新增的跨仓面**如实写 `none@0`**（下游尚未接入，不假装已在消费）——
    下游接线（R3-O3/X3/X5）是 C 包剩余部分，成功后由下游门禁反向逼本表更新。
"""
import io
import sys

CHANGELOG_HEAD = """## v3.323.0
**C 包（群像与关系体验）记忆侧三项：M3-X2 关系变化史 / M3-X3 因果链导航 / M3-X4 视角记忆卡**
- 本版是第三期产品主线**第三个执行包**的记忆侧部分（手机侧 R3-O3/X3/X5 在其后）。
  **新增三个运行时模块**：`relation-history.js` / `causal-chain.js` / `perspective-card.js`；
  `manifest.extra_js` **96 → 99**（追加在末尾 —— 加载序上它们是**消费方**，
  读既有的图边 / 三本账 / 知识轨迹）；在役测试面 303 → **304**。
- **M3-X2 人物关系变化史与转折解释**（计划：关系随时间变化的轨迹 + 关联触发事件、各自认知、
  尚未解决的矛盾；支持指定时点比较；**不把两人的看法平均成一个值**）
  - 本仓已有三个关系面各答一件事：`relation-disclosure`（这条此刻该不该给模型看）、
    `relation-mutual`（对侧在不在）、`npc-ties`（关系网怎么渲染）。三者都答**当下这一轮**；
    修前**没有任何一处**回答「这对人怎么走到今天的」 —— 图边带时态（`validFrom`/`validTo`/`active`），
    而 `buildInjection` 只列**当下生效**的那几条，于是「曾经信任 → 后来怀疑」在读数上**根本不存在**
    （读者只看到最后一条，读成「一直如此」）。
  - `pairOf` 用**字典序固化的无序键**（与 `relation-mutual` 的有序方向键刻意不同：
    那边判方向性，这边判「同一对人」）；两侧看法逐侧保留在 `sides`，
    **本模块没有任何「好感度」出口**（合成一个数是立项时要治的错读数，明确不做）。
  - 三类未解决**各自可达**：`divergent-attitude`（两侧看法相反）/ `side-missing`（对侧未登记）/
    `closed-without-successor`（结束了且同侧无后继）。**压成一类等于把三种处置混为一谈**。
  - **出处不明恒排末尾**：楼层读不到的转折 `floor=null`，`byFloorAsc` 让它恒排末尾且单列计数
    ——「不知道第几楼」不得混进时间序；诊断行必须点名「出处不明 N」。
  - 自指边（`from === to`）单列进 `counts.self` 而**不成「一对人」**；
    只按名字对上的对带 `byName`（同名异人会被合并，必须可见）；人物对截断如实计 `truncated`。
  - `asOf(edges, floor)` 语义是**「截至该楼层已经发生的」**：起始楼层 > floor 的一律不计入；
    楼层读不到的边**不进任何时点**（凭一个不知道楼号的边去替那一刻作证，是本仓点名的假信号）；
    时点读不到 ⇒ `floor=null` + 空 + `floorKnown=false`（**不猜 0 楼**）。
- **M3-X3 伏笔与因果链导航**（计划：前因 → 触发条件 → 后果 → 未解问题；候选关系由用户或证据确认，
  推测边始终单列）
  - 修前实测缺口：三本账各自成条（伏笔「埋了什么/回收没有」、约定「答应了什么/履没履」、
    事件线「起因—行动—结果—后续齐没齐」），**没有一处能回答「这个结果是从哪一段铺垫长出来的」**
    ⇒ 长期未解伏笔找不回、违约与取消同形，只能靠人记。
  - **四类来源各自成节点**，判空只看**前缀之后还有没有内容**（`prefix` 显式登记）。
    ★ 首跑自伤（已修，见下）：首稿用 kind 全名比长度 ⇒ `'cmt:c1'.length = 6` 恒小于
    `'commitment'.length + 1 = 11`，**约定与事件两类节点整类被丢**而面板照样显示正常。
  - **收口四分互不同形**：`resolved` / `cancelled`（明确作废）/ `broken`（违约 —— 既成事实，
    不是完成也不是取消）/ `unresolved`；诊断行四者分开说。
  - **推测边与已确认边结构上分两个数组**（同数组即等于把「猜的」当「有据的」）；
    传入 `edges` 里若自称 `speculative` 一样搬进推测数组（**依据决定归处，与谁传进来无关**）；
    `traceBack` **只走已确认边**，回环被截断并计入 `cycles`；
    图外 id（`not-in-graph`）与「追到了头」**不同形**。
  - 畸形边三态各自计数（`self` / `dangling` / `malformed`），绝不猜。
  - **候选提议可达（本版修真缺陷）**：首稿要求两条节点的 `actor` **字段相等**，
    而伏笔条目**根本没有这个字段** ⇒ 提议**恒为空数组** —— 「出口导出了、有判据、
    在真数据上一次都不触发」的功能级失效。修法（最小面）：主体名从**约定节点**取、
    到伏笔**文本**里找；单字主体不收（一个字会在任何正文里误命中）；
    弱关联恒为 `speculative` + 带 `reason` 与 `gap`。并补 `selfCheck` 第⑤条
    `proposalsReachable`（喂最小真数据自证可达）—— 同类形态下一轮还会复发。
- **M3-X4 视角记忆卡**（计划：选角色+时点生成「亲历/听说/误信/未知」短卡；作者可对照两人信息差；
  请求使用角色许可面，作者观察**不偷渡**进角色上下文）
  - 四格判据：`misbelieve` → `misled`、`unaware` → `unknown`、取得类按 `via` 分「听说/亲历」。
    **via 空 ⇒ 仍算取得，但标 `viaUnknown`** —— 绝不会因为「不知道从哪知道的」就写成「自己在场」。
  - ★ **立身之本**：判不开的动作（起疑 / 改正 / 撤回）**不落任何一格**，而计入 `unrecorded`
    且**处处可见** —— 把「我们没记过」显示成「该角色确实不知道」，是本仓最贵的那类无据断言。
  - 时点：`floor > at` 计 `offTime`；楼层读不到的轨迹**不进任何时点**（计 `noFloor`）；
    未给时点如实报 `atKnown:false` 并给全量。
  - `contrast` 输出 `onlyLeft` / `onlyRight` / `shared` / `misledSide` 四类差异清单
    —— **刻意的「不合成」**（不给「信息差分数」）；误信侧单列（那一格最需要被看见）；
    缺一侧（`known:false` + `rightPresent:false`）与「给了但内容少」**不同形**。
- ★ **本版真缺陷一处（由当版套件 D1 首跑抓住，不是推演）**：三个新出口在**模块缺席**时给的降级面
  与在场路径**键面不同**（缺 `version`/`degraded`，多 `ok`/`reason`）—— 而 C 包的产品前提是
  「下游按键断言不必猜」：缺席与在场必须**逐字同键**（「模块没加载」与「一个都没有」处置相反）。
  与 v3.322.0 修掉的 `memoryQaAnswer` 缺 `knownActors` 是**同一族形态**，同一轮又在三个新面上复发。
  修法（`tools/patch_3323_face.py`，最小面）：缺席面按**在场产出的键序**重排并在尾部补 `ok`/`reason`；
  `version: 0`（= 这一面不在场，与「第 N 版的面」可分）；`relationHistoryAt` 补
  `floor:null` + `floorKnown:false`（缺席时**不猜楼号**）。
- ★ **本档自伤四处（判据侧与补丁侧，分开记）**：① 破坏串里带着判据自己的错误消息原文 ⇒
  H5 判据纯度要求锚点在**本档源码**里恰中 1 次，首跑当场红（改为从锚点**派生**替换串）；
  ② E1 首版破坏写成「视为相等」，稳定排序原样保留顺序 ⇒ **假破坏**（改为排到最前）；
  ③ E6 首版「删掉锚点末尾一字符」把花括号切断 ⇒ 加载期 SyntaxError（测的是语法错）；
  ④ E6 第二版 `continue;` → `break;` 对「只有这一条」的夹具而言**效果与正确行为相同** ⇒
  假绿第二形（最终用「去掉 ` continue;`」让那条真的落进 push）。
- 成对套件 `tests/v3323_c_pack_group_relation.test.mjs`（**32 条**，含 **7 条真源码破坏负控制**
  + 逐条「原版同判据必须过」反向对照 + H5 判据纯度 + H6 工具两向自证 + 当版版本锚）。
  判据的期望值全部由探针 `tools/v3323_probe.py` 的**真跑读数**写成，不是从实现注释里抄的。
- 跨仓面：`open_face_registry.tsv` 新增 **3 面**（`relationHistory` / `causalChain` /
  `perspectiveCard`，consumer 一律如实写 `none@0` —— 下游尚未接入，不假装已在消费）。
- 抬版连带：`manifest.extra_js` 96 → 99（含数量锁 v3209 两处与 README/PLAN 读数）、
  `host_beast_baseline` 按探针重建（读数零手抄）+ 成员上界随活跃接线抬升、
  `dead_code_budget` 走 `--bump`（实测 +slack）、`state-report.json` 重生成。
  两处**出生版读数锚**（v3321 / v3322 的 `extra_js.length === 96`）按 v3296 先例交棒当版：
  历史档改守下界 + 留痕，当版项数锁由 v3323 F3 接管。
- 定向复验（本版实跑）：当版档 32/32；`v3321` / `v3322`（交棒后）与语法 / 门禁各面另跑。
- ★ 边界（诚实）：本版**未跑全量回归**（按实施期铁律，计划收口时才跑一次）。
  C 包手机侧 R3-O3/X3/X5 在其后 —— 三个新面目前**只在本仓产出**，下游消费尚未接入
  （故登记表如实写 `none@0`，不提前写成已在消费）。
- 退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移（本仓审计脚本同约；文档真实性扫描器只核
  「文档 ↔ 登记」，**绝不跑全量** —— 审计段跑全量会自指）。
"""

TODO_LINE = ("> **最近更新：v3.323.0** —— **C 包（群像与关系体验）记忆侧三项：M3-X2 关系变化史 / "
             "M3-X3 因果链导航 / M3-X4 视角记忆卡**（第三期产品主线第三包，**新增三模块**："
             "`relation-history.js` / `causal-chain.js` / `perspective-card.js`；"
             "`manifest.extra_js` 96 → **99**）。"
             "★ **M3-X2**：`pairOf` 用**字典序固化的无序键**、两侧看法逐侧保留（**明确不做好感度**）、"
             "三类未解决各自可达、**出处不明恒排末尾且单列**、自指单列、`byName` 可见、"
             "`asOf` 语义是「**截至该楼层已经发生**」（无楼号的边**不进任何时点**，时点读不到不猜 0 楼）。"
             "★ **M3-X3**：判空只看**前缀之后有没有内容**（首跑自伤：按 kind 全名比长度会把约定与事件"
             "**整类丢掉**而面板照样正常）、收口四分互不同形、**推测边与已确认边结构分离**、"
             "`traceBack` 只走已确认边、畸形边三态各自计数；**修真缺陷**：候选出口要求 `actor` 字段相等"
             "而伏笔**没有这个字段** ⇒ 提议**恒空**（导出了、有判据、真数据上一次都不触发），"
             "改为「主体名从约定取、到伏笔文本里找，单字不收」，并补 `selfCheck` 第⑤条 `proposalsReachable`。"
             "★ **M3-X4**：四格判据 + **判不开的动作不落任何一格**（进 `unrecorded` 且处处可见 —— "
             "把「我们没记过」写成「确实不知道」是本仓最贵的无据断言）、via 空 ⇒ 亲历但标 `viaUnknown`、"
             "无楼层不进任何时点、`contrast` 四类差异（**刻意不合成**，误信侧单列）。"
             "★ **本版真缺陷一处**（当版套件 D1 首跑抓住）：三个出口**缺席面的键面与在场不同**"
             "（缺 `version`/`degraded`，多 `ok`/`reason`）—— 与 v3.322.0 的 `memoryQaAnswer` 缺 "
             "`knownActors` **同族**；修法＝按在场键序重排 + `version: 0` + 时点面补 `floor:null`/`floorKnown:false`。"
             "★ **本档自伤四处**（判据/补丁侧，分开记）：锚点串含判据消息原文破纯度、"
             "「视为相等」的假破坏、切断花括号的 SyntaxError 破坏、`break` 版假绿。"
             "★ 成对套件 `tests/v3323_c_pack_group_relation.test.mjs`（32 条，含 7 条真源码破坏负控制），"
             "期望值全由探针真跑读数写成。★ 跨仓面 +3（`none@0` 如实写——下游未接入）；"
             "两处出生版读数锚（v3321 / v3322 的 96）按 v3296 先例交棒当版。"
             "★ 边界：**未跑全量回归**；手机侧 R3-O3/X3/X5 在其后。\n")

CATALOG_ROW = (
    "v3323_c_pack_group_relation.test.mjs\t\t"
    "C 包（群像与关系体验）记忆侧三项的成对套件（32 条 test：含 7 条真源码破坏负控制）："
    "M3-X2 关系变化史（两侧**逐侧保留**、无合成好感值出口；三类未解决各自可达；"
    "无楼号转折**恒排末尾**且单列「出处不明」；自指单列 / byName 标记 / 截断可见；"
    "`asOf` 是「截至该楼层已发生」，无楼号的边不进任何时点，时点读不到不猜 0 楼）· "
    "M3-X3 因果链（四类来源各自成节点 —— 判空只看前缀后有无内容；收口四分互不同形；"
    "推测边与已确认边**结构分离**、traceBack 只走已确认边、回环计入 cycles；"
    "畸形边三态各自计数；**候选出口可达**（首跑恒空的功能级失效）+ 单字/不含名/超 gap 三条负判据）· "
    "M3-X4 视角卡（四格判据；**判不开不落格**且 unrecorded 可见；via 空 ⇒ 亲历 + viaUnknown；"
    "时点过滤 offTime/noFloor；contrast 四类差异 + 误信侧单列 + 缺一侧与空卡不同形）· "
    "D 宿主面（三出口**恒定键面**（缺席与在场逐字同键）+ 真跑通 + buildInjection 真每轮调用点）· "
    "E 七条真源码破坏各现形 + 逐条「原版同判据必须过」反向对照 · "
    "F H5 判据纯度 + H6 工具自证 + 分发面 96→99 + 版本锚 3.323.0 + 六源同源。\n")

BREAKKIT_ENTRY = (
    "    /* [v3.323.0 C 包记忆侧] 本档从 tests/_break_kit.mjs 取 breakOnce（真源码破坏），\n"
    "     *   按 B1 台账纪律（接入面 == 磁盘事实）在此登记。 */\n"
    "    'v3323_c_pack_group_relation.test.mjs',\n")

FACE_ROWS = [
    ("relationHistory\tlonsha-memory-plugin\tv3.323.0\t"
     "relation-history.js::build,asOf,line,selfCheck\t"
     "恒定键面 kind|version|pairs[]|counts|truncated|turnsTruncated|byName|malformedInput|writesNothing|degraded"
     "（+ 宿主外壳 ok|reason）；每对带 sides{a-to-b,b-to-a} **逐侧**读数（attitude 读不到给 null，"
     "**不写 neutral 冒充**）+ 合并时间轴 turns + unresolved[]（三类具名）\t"
     "none@0\t"
     "缺席(模块未加载 ⇒ 宿主给同键降级面 version=0 + reason=module-unavailable，"
     "**不是**「没有关系变化」)/旧版(装了但无该出口 ⇒ 调用方按面缺席处置，等上游升级)/"
     "不产出(出口抛错 ⇒ reason=thrown，本机读不出；输入畸形 ⇒ malformedInput 标记而非静默空)/"
     "空数据(真跑过、图里确实没有边 ⇒ pairs 为空数组，**与「模块没加载」不同形**)\t"
     "单装上游：面在场但要宿主喂图边（无图 ⇒ 空读数，不是错误）；单装下游：本面缺席 ⇒ "
     "降级面同键，下游按 version=0 判「这一面不在场」逐格降级\t"
     "缺席｜模块未加载：ok:false + version=0 + reason=module-unavailable（**不是**空 pairs）｜"
     "空｜真跑过零边：ok:true + pairs []（**不是**「没这功能」）｜"
     "判不了｜时点读不到：floor=null + floorKnown=false + 空（**不猜 0 楼**）｜"
     "出处不明｜floor 读不到的转折单列 noFloor 且恒排末尾，不得混进时间序"),
    ("causalChain\tlonsha-memory-plugin\tv3.323.0\t"
     "causal-chain.js::build,proposeCandidates,traceBack,todos,line,selfCheck\t"
     "恒定键面 kind|version|nodes[]|edges[]|speculative[]|unresolved[]|resolved[]|cancelled[]|broken[]|"
     "counts|truncated|edgesTruncated|malformedInput|writesNothing|degraded（+ 宿主外壳 ok|reason）；"
     "**推测边与已确认边是两个数组**（结构上不可混读）；节点 closure 四态 "
     "resolved|cancelled|broken|unresolved\t"
     "none@0\t"
     "缺席(模块未加载 ⇒ 宿主给同键降级面 version=0 + reason=module-unavailable，"
     "**不是**「没有因果链」)/旧版(装了但无该出口 ⇒ 调用方按面缺席处置，等上游升级)/"
     "不产出(出口抛错 ⇒ reason=thrown；三账任一缺席 ⇒ 照常出图但对应 kind 计数为 0，"
     "「这一类本来就是空的」与「根本没读进来」由 caller 的 sources 判)/"
     "空数据(真跑过、三账全空 ⇒ nodes 为空数组 + counts.nodes=0)\t"
     "单装上游：面在场但需宿主喂三账；单装下游：本面缺席 ⇒ 降级面同键，下游按 version=0 逐格降级\t"
     "缺席｜模块未加载：ok:false + version=0（**不是**空 nodes）｜空｜真跑过三账全空：ok:true + "
     "nodes [] ｜判不了｜图外 id 追链：known=false + reason=not-in-graph（**不是**「追到了头」）｜"
     "推测边｜恒单列在 speculative（traceBack 不采信），并入 edges 即等于把「猜的」当「有据的」"),
    ("perspectiveCard\tlonsha-memory-plugin\tv3.323.0\t"
     "perspective-card.js::build,contrast,line,selfCheck\t"
     "恒定键面 kind|version|at|atKnown|cards[]|counts|truncated|malformedInput|writesNothing|degraded"
     "（+ 宿主外壳 ok|reason）；每卡四格 lived|heard|misled|unknown + unrecorded / viaUnknown / "
     "ambiguousIdentity；contrast 输出 onlyLeft|onlyRight|shared|misledSide\t"
     "none@0\t"
     "缺席(模块未加载 ⇒ 宿主给同键降级面 version=0 + reason=module-unavailable，"
     "**不是**「这个角色什么都不知道」)/旧版(装了但无该出口 ⇒ 调用方按面缺席处置，等上游升级)/"
     "不产出(出口抛错 ⇒ reason=thrown；输入畸形 ⇒ malformedInput 标记而非静默空)/"
     "空数据(真跑过、该角色无轨迹 ⇒ cards 为空数组，**与「我们没记过」不同形**)\t"
     "单装上游：面在场但需宿主喂知识轨迹；单装下游：本面缺席 ⇒ 降级面同键，"
     "下游按 version=0 逐格降级（**不得**把降级读成「确实不知道」）\t"
     "缺席｜模块未加载：ok:false + version=0 + cards []（**不是**四个空格）｜"
     "空｜真跑过无轨迹：cards []；有轨迹但判不开 ⇒ 落 unrecorded 且在读数里可见｜"
     "判不了｜未给时点：atKnown=false + 给全量（**不猜 0 楼**）｜"
     "无楼层｜floor 读不到的轨迹不进任何时点（计 noFloor），凭它替某一刻作证是假信号"),
]


def patch(path, old, new, must=1):
    src = io.open(path, encoding='utf-8').read()
    n = src.count(old)
    if n != must:
        sys.exit('[docs3323] %s 锚点命中 %d 次（期望 %d）：%r' % (path, n, must, old[:60]))
    io.open(path, 'w', encoding='utf-8').write(src.replace(old, new, 1))
    print('[docs3323] ok %s' % path)


# ① CHANGELOG：顶节前插入新节
src = io.open('CHANGELOG.md', encoding='utf-8').read()
if not src.startswith('## v3.322.0'):
    sys.exit('[docs3323] CHANGELOG 顶节不是 v3.322.0（抬版前置不满足）')
io.open('CHANGELOG.md', 'w', encoding='utf-8').write(CHANGELOG_HEAD + src)
print('[docs3323] ok CHANGELOG.md（新增顶节 v3.323.0）')

# ② TODO：旧当前行降为历史留痕，新行插在其前
patch('TODO.md', '> **最近更新：v3.322.0**', '> **历史留痕：v3.322.0**', 1)
patch('TODO.md', '> **历史留痕：v3.322.0**', TODO_LINE + '> **历史留痕：v3.322.0**', 1)

# ③ catalog 台账：追加一行
src = io.open('tests/audit/catalog_reference_consumers.tsv', encoding='utf-8').read()
if not src.endswith('\n'):
    src += '\n'
io.open('tests/audit/catalog_reference_consumers.tsv', 'w', encoding='utf-8').write(src + CATALOG_ROW)
print('[docs3323] ok catalog_reference_consumers.tsv（+1 行）')

# ④ 破坏套件台账：登记 v3323
patch('tests/v3247_break_kit_consolidation.test.mjs',
      "    'v3322_qa_host_exit.test.mjs',\n];",
      "    'v3322_qa_host_exit.test.mjs',\n" + BREAKKIT_ENTRY + "];", 1)

# ⑤ 外供登记表：三新行追加到文件末尾
src = io.open('tests/audit/open_face_registry.tsv', encoding='utf-8').read()
if not src.endswith('\n'):
    src += '\n'
io.open('tests/audit/open_face_registry.tsv', 'w', encoding='utf-8').write(src + '\n'.join(FACE_ROWS) + '\n')
print('[docs3323] ok open_face_registry.tsv（+3 行：relationHistory / causalChain / perspectiveCard）')
print('[docs3323] 完成：CHANGELOG 顶节 / TODO 最近更新 / catalog +1 / 破坏套件台账 +1 / 外供表 +3')