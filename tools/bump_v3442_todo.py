#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.442.0 抬版第三步：只改 TODO.md 顶节（最近更新链）。

口径沿用 v3.441.0（`> **最近更新：` 在本仓是**历史留痕链**，实测 22 处，
要求「恰 1 处」就是在健康树上 abort）：取 `hit[0]`，不要求唯一。
version-guard 的 V7 也是 `正则取首次命中` —— 即「第一处即当版」才是真源形态。

顺读降级链（本仓实测形态，第 2/3/4/5 行）：
    第 2 行  `> **最近更新：v3.441.0** …`   → 整行换成新当版内容
    第 3 行  `> **上一版更新：v3.440.0** …` → 换成「上一版更新：v3.441.0」+ 本版摘要
    随后插入 `> **再前一版：v3.440.0** + 原第 3 行正文`（原 v3.440.0 全文不丢）
"""
import re
import sys

V_OLD = '3.441.0'
V_NEW = '3.442.0'
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

V441 = ('v3.441.0 L13-X4 证据缺口工作台：把 `memory-archaeology-gap-bench.js` 从「登记在册但产品端'
        '零调用」接成可审阅的面。三档成因**穷尽且互不同形** —— `no-source`（从没证据）/ '
        '`source-lost`（账上写着证据引用、但当前正文里已找不到）/ `contradicted`（同主语在未决矛盾账里'
        '有多版本），面板四格分列、三档说明逐档不同文，**绝不合成一个「缺证据」**。「判不了」不是第四种'
        '成因，而是两个布尔 `sourceChecked` / `conflictChecked`（内核 `resolveSource` 严格三态，'
        '**`null` 判不了**，绝不为凑一档把「没核验」写成「证据丢了」；诊断层再套 `< 6` 字长度门槛）。'
        '双表并存：`counts` 按主因、`hitCounts` 按命中。动作面只有两个且**没有一键补全**'
        '（`去补证` 只是跳 `lockedfacts` 让人手打；`降级为推测` 逐条走既有 '
        '`fact-version.setOrigin` 与 `DeltaBook.add` 两 owner，②失败不回滚①但如实报 '
        '`skipped:<why>`）。只读面**不落任何缓存**；已撤销条目单列 `skippedRevoked` 不静默跳过。'
        '面板 `archive` 视图改造成「🧾 证据缺口 · 存档体检」。判据 18 条全绿，首跑 4 红全归因为'
        '判据侧写错。★ 修 CHANGELOG 首行陷阱（新节被插到 v3.440.0 块之后，V6 判红，整块搬到文件最前）。')

NEW_HEAD = ('> **最近更新：v3.442.0**（**L13-X6 静音清单面**：把「我现在把什么静音了」做成常驻可解的面 —— '
            '但**在画面之前先补了「有地方存」**。起点两条硬读数：① 全仓零常驻静音清单'
            '（`silenceExplainState` 只在「问为什么召不回」时才用）；② `seasonState` / `topicSeasons` 在 '
            '`index.js` / `memory-organs.js` / `memory-core.js` 里**一次都没出现**、也不在 `WorldProgress` '
            '的**构造/导出/导入**三处枚举里（对照组 `institutionRules` / `symbolicEntities` / '
            '`eraTransitions` / `growthBundles` 三处都在）⇒ **静音存盘即丢、读档即空**。'
            '故 `memory-organs.js` 先补三处（构造显式落格 / 导出带类型守卫 / 导入畸形回落空账），'
            '两格语义不同**不许合并**：`seasonState` 是**动作表**（`applySeasonAction` 写 '
            '`mute|defer|embrace|probe`）、`topicSeasons` 是**主题本体表**；导入面**不逐字段校验**'
            '（合法性归内核，再校一遍即第二套判据）。内核三出口：`silenceListState`（只读、'
            '`writesNothing:true`）/ `silenceLift`（**只认一个 topicId，无批量入口**）/ '
            '`_silenceListLine`。**两源分列永不合并**：`ctx`（本轮）与 `season`（持久）各成一列，'
            '同 id 双源都保留（「持久静音 + 本轮又静了一次」是两条信息），`ctx + season = total` 是'
            '**条数不是主题数**（现场 4 条去重后 3 个主题），面板逐字自述「不相加成主题数」。'
            '三态不同形：缺席（`ok:false` + `module-unavailable` + `state:\'unavailable\'`，面板明写'
            '「**不是「你没有静音任何东西」**，是这个面没装上」）/ 空账（`ok:true` + `total 0` + '
            '怎么才会有）/ 有静音；`listable.season === false` 表示「**没有这份账**」而非「账是空的」。'
            '`since` 口径：内核只写动作词不记时间 ⇒ 持久源只能报 `sinceKind:\'last-season-action\'`'
            '（取全局 `updatedAt`）并自报这是哪一种，本轮源 `this-run` + `since:null`，'
            '**绝不把全局时间冒充逐条起点**；`until` **恒 null**（无到期机制，写时间=凭空承诺）。'
            '解除只逐条、走 `applySeasonAction(...,\'embrace\')`、**不删键**（删键抹掉「曾经静音过」'
            '的历史），五个原因码互不同形（`topic-id-required` / `not-muted`（defer 也算这类）/ '
            '`ctx-only-muted`（本面改不动调用方 ctx，如实报而不假装解除）/ `module-unavailable` / '
            '`no-world-progress`），失败路径**一个字不写账**。面板新增 `data-view="silence"`'
            '（入口卡读数 `ok!==true` 时显示 `—` 不是 0；渲染 +65 行带 `data-silence-src`/`-id`/`-lift`；'
            '绑定 +36 行逐条解除后按同一视图重建），视图 26 → **27**，`scan_ui_view_reach` '
            '**27 视图全导航可达 / 零可达 0**。★ 判据 `tests/v3442_l13_x6_silence_list.test.mjs` '
            '**14 条全绿**（A 3 / B 2 / C 1 / D 3 / E 3 / F 2），含三条真源码破坏各配原版对照'
            '（两源合并 / 摘掉 ctx-only 短路 / 解除时整表重建）。★ **首跑 4 红逐条归因：'
            '2 产品侧真缺陷 + 1 判据侧假绿 + 1 抬版前预期内** —— ① 缺席态 `state` 写成字面量 `\'ok\'`'
            '（与 `noKernel` 无关，两态同形）修成 `noKernel ? \'unavailable\' : \'ok\'`；② `echo` 直接调 '
            '`silenceExplainState(engine,...)` 会回写 `engine._silenceExplainCtx` ⇒ 列一次清单就覆盖'
            '调用方的判定输入（只读自证抓到），改用 `Object.create(engine)` 一次性代理（读走原型链、'
            '写只落代理；不用平面对象是为了不丢 `_worldlineRecallFilter`）；③ E3 判据只认 '
            '`userActions = {}` 独立赋值（真源 count=0），破坏注入 `seasonState = { userActions: {} }` '
            '后判据仍绿 ⇒ 扩成两种写法 + 补「不得整对象重写 seasonState」；④ F2 抬版前预期内。'
            '**边界**：计划验收里「**召回面验证被解除条目真能召回**」**未执行**（只做到面板与账层，'
            '没真跑召回，不写成通过）；真机 ST 触摸 / 窄屏 / 刷新后加载**未执行**；全量回归**未跑**'
            '（按指令做完计划前不跑全量，读数登记仍停 v3.431.0、显式待验）；`ctx` 源静音本面改不动，'
            '面板只显示「不可解 + 原因」，不提供点了没反应的按钮。**L13 进度**：X1 / X2 / X3 / X7 / '
            'X4 / **X6** 已交付；X5 / X8 / X9 待做（X 面交付序：只读面先做 —— X7、X4、X6 已落，'
            '其后 X8 / X9，最后 X5）。')

lines[k] = NEW_HEAD
# 顺读降级链：第 k+1 行（实测是「上一版更新：v3.440.0」）换成「上一版更新：v3.441.0」，
# 并把原 v3.440.0 那行整段正文降成「再前一版：v3.440.0」（历史留痕不丢）。
nxt = k + 1
if nxt < len(lines) and lines[nxt].startswith('> **上一版更新：'):
    old_prev = lines[nxt]
    m = re.match(r'> \*\*上一版更新：(v[0-9.]+)\*\*', old_prev)
    tag = m.group(1) if m else ''
    tail = old_prev[len('> **上一版更新：' + tag + '**'):] if tag else old_prev
    lines[nxt] = '> **上一版更新：v%s**（%s）' % (V_OLD, V441)
    if tag:
        lines.insert(nxt + 1, '> **再前一版：%s**%s' % (tag, tail))
else:
    lines.insert(k + 1, '> **上一版更新：v%s**（%s）' % (V_OLD, V441))

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
if not out2[hit2[0] + 2].startswith('> **再前一版：v3.440.0'):
    sys.exit('[abort] 自证失败：第三处降级行不是 v3.440.0（实 %r）' % out2[hit2[0] + 2][:40])
print('TODO done: 顶节已按 v%s 收口（第一处命中行 %d）' % (V_NEW, hit2[0] + 1))
print('  降级链: %s' % ' / '.join(l[3:22] for l in out2[hit2[0]:hit2[0] + 3]))