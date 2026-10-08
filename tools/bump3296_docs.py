#!/usr/bin/env python3
"""v3.296.0 · X1：人读面读数同步（README / PLAN / CHANGELOG / TODO）。

与 tools/bump3296.py 同纪律：**全部锚点先校验、通过后统一写盘**；每处恰中 1 次。
磁盘真值（本版实测）：版本 3.296.0 / 测试 277 / 审计门禁 59（磁盘 62）/ 根级 .js 86 / extra_js 85。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
OLD, NEW = '3.293.0', '3.296.0'
_log = []


class Doc:
    def __init__(self, rel):
        self.rel = rel
        self.p = ROOT / rel
        self.s = self.p.read_text(encoding='utf-8')
        self.dirty = False

    def sub(self, old, new, why):
        n = self.s.count(old)
        if n != 1:
            sys.exit('[bump3296-docs] %s 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点=%r'
                     % (self.rel, n, why, old[:160]))
        if old == new:
            sys.exit('[bump3296-docs] %s 同值替换等于没写：%s' % (self.rel, why))
        self.s = self.s.replace(old, new, 1)
        self.dirty = True
        _log.append((self.rel, why))

    def insert_at_head(self, text, sentinel, why):
        if sentinel in self.s:
            sys.exit('[bump3296-docs] %s 已含哨兵：%s' % (self.rel, why))
        self.s = text + self.s
        self.dirty = True
        _log.append((self.rel, why))

    def write(self):
        if self.dirty:
            self.p.write_text(self.s, encoding='utf-8')


R = Doc('README.md')
P = Doc('PLAN.md')
C = Doc('CHANGELOG.md')
T = Doc('TODO.md')

# ══════════ README ══════════
R.sub('**当前版本**：`%s`' % OLD, '**当前版本**：`%s`' % NEW, '当前版本')
R.sub('`npm test` 当前发现 **274 个测试文件**', '`npm test` 当前发现 **277 个测试文件**', '在役面读数（测试）')
R.sub('当前版本 v%s **全量待验**' % OLD, '当前版本 v%s **全量待验**' % NEW, '全量待验标记（版本）')
# 历史口径行里的旧版本注记（「（v3.293.0 现行为 274，见上）」共三处，逐处替换）
R.sub('npm test             # 全部用例：（v3.293.0 现行为 274，见上）274 个测试文件',
      'npm test             # 全部用例：（v3.296.0 现行为 277，见上）277 个测试文件', '用例说明行')
R.sub('├── tests/                # 在役面：（v3.293.0 现行为 274，见上）274 个测试文件',
      '├── tests/                # 在役面：（v3.296.0 现行为 277，见上）277 个测试文件', '目录树在役面')
R.sub('**在役面**（磁盘枚举，不代表已实跑）：`tests/` （v3.293.0 现行为 274，见上）274 个测试文件',
      '**在役面**（磁盘枚举，不代表已实跑）：`tests/` （v3.296.0 现行为 277，见上）277 个测试文件', '在役面小结')
# extra_js 83 → 85（三处：分支行 / 目录树 / 载入面）
R.sub('由 `manifest.json` 的 `extra_js`（83 项）按**文件名**加载',
      '由 `manifest.json` 的 `extra_js`（85 项）按**文件名**加载', 'extra_js 分支行')
R.sub('├── manifest.json             # 插件清单（js / css / extra_js 83 / extra_css 2）',
      '├── manifest.json             # 插件清单（js / css / extra_js 85 / extra_css 2）', 'extra_js 目录树')
R.sub('**载入面**：`index.js` + `extra_js` 83 项 + CSS 3 项',
      '**载入面**：`index.js` + `extra_js` 85 项 + CSS 3 项', 'extra_js 载入面')
# 运行时模块 84 → 86
R.sub('**运行时模块**：84 个（根目录 `.js`，含入口 `index.js`）',
      '**运行时模块**：86 个（根目录 `.js`，含入口 `index.js`）', '运行时模块数')

# ══════════ PLAN ══════════
P.sub('> **当前执行状态（2026-10-07，v%s）**' % OLD, '> **当前执行状态（2026-10-08，v%s）**' % NEW, '执行状态行')
P.sub('| 版本 | **v%s**（四源同源；本表原为 v3.266.0）' % OLD,
      '| 版本 | **v%s**（四源同源；本表原为 v3.266.0）' % NEW, '现状基线版本行')
P.sub('| 门禁 | 在役面 **274 测试文件 / 59 个 audit 脚本**（磁盘 62）',
      '| 门禁 | 在役面 **277 测试文件 / 59 个 audit 脚本**（磁盘 62）', '现状基线门禁行')
P.sub('当前 v%s **全量待验**' % OLD, '当前 v%s **全量待验**' % NEW, '现状基线待验标记')
P.sub('| 体量 | `index.js` **14374 行**（物理行；探针读数 14375 行 / **552** 成员 —— 原 A1 六刀后为 13883 / 521）+ extra_js **83** 项',
      '| 体量 | `index.js` **15325 行**（物理行；探针读数 15326 行 / **568** 成员 —— 原 A1 六刀后为 13883 / 521）+ extra_js **85** 项',
      '现状基线体量行')
# 现存口径：X1/X2/X8 状态；本批 X1 交付
P.sub('**X7 已交付**（v3.293.0），**X2/X8 尚未实施**（X2 依赖 O1/O2/O4',
      '**X7 已交付**（v3.293.0）、**X8 已交付**（v3.294.0）、**X2 已交付**（v3.295.0）、'
      '**X1 已交付**（v3.296.0，结构化证据查询与完整度 —— ★ 与 v3.270.0 那条旧 X1'
      '（注入容量预演）**同名不同物**，这一条才是拓展计划原文里的 X1）（X2 依赖 O1/O2/O4',
      '现状节 X 系列状态')
# 现行排序节第 3 条：已交付项不得复活为待办
P.sub('3. **X 系列第三批（X2 证据到真实修复的操作流程 / X8 召回问题解释与有证据的策略建议）** —— X1 已于 v3.270.0 交付、**X3 已于 v3.289.0 交付**、**X4 已于 v3.290.0 交付**、**X5 已于 v3.291.0 交付**、**X6 已于 v3.292.0 交付**、**X7 已于 v3.293.0 交付**（六者均勿再列入待办）',
      '3. **X 系列收口核查（X1–X8 全部已交付）** —— X1 已于 v3.270.0 交付（注入容量预演那条旧 X1）、'
      '**X3 已于 v3.289.0 交付**、**X4 已于 v3.290.0 交付**、**X5 已于 v3.291.0 交付**、'
      '**X6 已于 v3.292.0 交付**、**X7 已于 v3.293.0 交付**、**X8 已于 v3.294.0 交付**、'
      '**X2 已于 v3.295.0 交付**、**X1（结构化证据查询与完整度）已于 v3.296.0 交付**（各条均勿再列入待办）；'
      '本条的剩余动作是在 X 系列全部交付后做一次**收口核查**（验收原文逐条对表 + 下游消费点决策）',
      '现行排序节第 3 条')

# ══════════ CHANGELOG 顶节 ══════════
C.insert_at_head('''## v3.296.0
**X 系列最后一条：X1 结构化证据查询与完整度 —— 「200 条摘要里找不到」不再等于「全库没有」**
- **缺口（修前实测，两条都写在 `evidence-workbench.js` 自己的实现里）**：
  ① **只有关键词检索**：`search(face, query, opts)` 只收 `{ limit, ledgers }`，命不命中由
  `scoreOf(title, detail, q)` 的关键子串打分决定 —— 「按角色找」「按楼层区间找」「按状态找」
  「按来源身份找」「按修订号找」全**无处可查**；而 actor / keeper / about / who / actors
  这些**结构化参与者**在各账里都真实存在，只是各自被折进 detail 文本里靠眼睛认。
  ② **只看得到最后 200 条**：`readLedger` 是 `items.slice(-MAX_ITEMS_PER_LEDGER)`（=200）**先切后投影**
  ⇒ 「这本账有 900 条」与「这本账有 200 条」在面上**完全同形**。而 X1 验收原文写着
  「**超过 200 条的旧证据仍能按需检索**」「**不默认在 200 条摘要中找不到就判全库没有**」。
- **交付**：`evidence-query.js`（636 行，纯函数、零依赖、IIFE + CJS 双导出，版本常量
  `QUERY_VERSION = 1`）。三条补法，**都不改既有面**：
  ① `query(spec, opts)` 在**原账状态**上做组合筛选（账本 / 参与者 / 楼层区间 / 状态 /
     来源身份 / 修订号区间 / 正文子串，逐条件**与**语义，条件全空即全收）；
  ② 分页与排序由**匹配总数**驱动（不是由摘要长度驱动），`sort` 走登记表；
  ③ **完整度读数**：扫描范围逐账报 `total / kept / truncated`，取不到的账单列 `absent`
     （带 `module-missing` / `module-unavailable` / `state-missing` 三因）、空账单列 `empty`，
     并**显式**报出「本面绕过 200 条摘要、直读原账全量」（`coverage.summaryBypassed = true`）。
- ★ **单一真源：账本登记表仍只有一份**。本模块经 `opts.ledgers`（= 工作台 `LEDGERS`）
  复用它的 `state / pick / project / keyOf`，**绝不另抄一份「哪本账取哪个字段」的取值代码** ——
  本仓在 v3.233.0 的 event-completeness 上踩过「照抄别账字段名 ⇒ 恒空」这一族缺陷
  （该账顶层**没有** floor/source，只有 segments 段，故 `timeFloorsOf` 单独为它取楼层）。
  本模块自己的 `FACETS` 表只声明**检索面**（哪几个字段算参与者 / 算时间 / 算来源），
  并以 `facetsAligned()` 与 `LEDGERS` 的 id 集合**逐字对账**（少一个 id 即报红）。
- ★ **口径分列（两处刻意不合并）**：`MAX_SCAN_PER_LEDGER = 20000` 是**扫描上限**，
  不是取数窗口 —— 工作台的 `MAX_ITEMS_PER_LEDGER = 200` 是另一件东西；
  `searchEvidence`（关键词打分）与 `searchEvidenceStructured`（结构化组合筛选）**两者都留**，
  不合成一口：合成会让回执里的 `total` 到底是「命中数」还是「打分过线数」无从分辨。
- **四态不压平**：`ok` / `empty` / `absent` / `inverted-range` 各自成态；
  楼层**三态**（`floor:0` 是真楼层、`floor:null` 未给、未来楼层）—— 无楼层行既不得被当成 0 楼命中、
  也**不得**静默丢，被排除的必须**单独计数并点名原因**（`matchRow` 返回具名原因：
  `ledger` / `status` / `source` / `actor` / `has-floor` / `floor-unknown` / `floor-range` /
  `revision-absent` / `revision-range` / `text`）。区间反转按**空集**且给理由（**不自动交换** ——
  交换会查出另一个区间而不报错）。翻过头如实报 `pageOutOfRange` 且 `rows` 为空（**不回落第一页** ——
  回落会让「你翻过头了」与「这就是全部」同形）。
- **保存的是条件，不是第二份证据库**：`upsertSaved` / `removeSaved` / `replaySaved` 为纯函数，
  保存项**只存条件**（键面里没有 `rows` / `total` / `hits` / `items` / `scanned`），
  重放走**当前原账**重跑并自报 `keyMatched`；同条件同键（`replayKeyOf`），有条数上界。
- **宿主真接线**：`manifest.extra_js` 注册（84→85，紧随 `evidence-workbench.js` —— 本模块复用它当登记表真源）
  + `index.js` 取库口 `_evidenceQueryLib`、登记表复用口 `_evidenceQueryLedgersOf`、
  四个只读口（`searchEvidenceStructured` / `evidenceQueryFacets` / `saveEvidenceQuery` /
  `removeEvidenceQuery` / `replayEvidenceQuery` / `evidenceSavedQueries`）与**同键面降级回执**
  `_evidenceQueryEmpty`（模块没挂时下游按键断言不必猜）+ 诊断行「证据查询」
  （**空 / 查不到 / 没东西可查三者分开写**；诊断行里**不跑真查询**，免得为一行字面扫九账全量）
  + `selfCheck` 表「证据查询」行。宿主侧**不得出现 `apiGlobal`**（那是登记表专有字段，出现即第二份真源）。
- **保存查询刻意不落盘**：写进 `ARCHIVE_TOP_LEVEL_KEYS` 要连带改携带契约，而书签跨对话无意义 ——
  故本次会话内有效，理由写进实现注释。
- 判据 `tests/v3296_x1_evidence_query.test.mjs`（16 条，新建）：A 登记表逐字对齐 / B **900 条账里找得到最老那条**
  （同一台机器上同时证 `evidence-workbench.search()` 找不到它、`evidence-query.query()` 找得到 ——
  只证后者是「函数能跑」，两件一起证才是「缺口真被补上」）/ C 楼层三态不压平 / D 分页不回落 /
  E 区间反转按空集且给理由 / F 四态不同形 / G 保存查询只存条件且重放走当前原账 / H 未知条件名不静默忽略
  且零写副作用 + N1–N5 真源码破坏负控制 + 7~9 宿主接线与加载面 + V 四源同源与当版锚。
- ★ **本版修复留痕（全部实测，判据套件调试期）**：
  ① **N3 首版破坏不可观测（假绿）**：破坏点选的是 `const rows = outOfRange ? [] : ...` 这个三元式，
     而 `pageOutOfRange` 仍报 `true` ⇒ 判据看不到差别，「破坏后翻红」是假的；改破坏**越界标记本身**
     （`const outOfRange = ...` → `const outOfRange = false;`）才是可观测破坏。
  ② **G 段首版把判据写反了**：原写「重放结果里不得出现新加的条目」—— 而重放**本就该**看到当前原账的新条目，
     那是「走当前原账」的**证据**；改为检查**保存项自身键面**不得含结果字段。
  ③ F 段三态计数首版写错（hostTiny 应为 ok=5 / empty=1 / absent=3）；锚点纯度检查首版把锚点内联成
     普通字符串、真换行写成 `\\n` 转义 ⇒ 锚点值不再等于真源码行，四处恒 0（改 `ANCHORS` 表 + `String.raw`）；
     G 段回放项按 `replayKey` 取回而非按名字。
  ④ **夹具比被测物更容易骗人**：`searchEvidenceStructured` 经 `_ledgerApis()` 注入账 API，
     夹具里必须**一并给** `_moduleLib` / `_workbench` 取库口与三个助手（`_factVersionLib` /
     `_eventCompletenessLib` / `_repairLoopLib`）—— 首版漏了 `_moduleLib` ⇒ `_evidenceWorkbenchLib()` 抛
     ReferenceError、被 `_evidenceQueryLedgersOf` 的 try/catch 吞成 `[]`，现象是「复用到的账本数 = 0」，
     看着像**接线断了**、其实是夹具缺件（与 v3.293.0 夹具缺 `config.config` 同族）。
- **抬版连带（本版实测：v3.294.0 / v3.295.0 两版留下的登记与抬版仪式此前全部滞后）**：
  `v3209` 的 `extra_js` 数量锁两处 84→85；`v3247` 的 REGISTRY 补登 `v3294` / `v3295` / `v3296`；
  `catalog_reference_consumers.tsv` 参考基准补登同三档；`host_beast_baseline.json` 重建
  （探针读数 **15326 行 / 568 成员**，重建是追加不是改写）；
  `dead_code_budget.json` 上界 49546 → 52238（三版均为活跃功能增长，非死代码回流，理由落 `note`）；
  README / PLAN 的版本与在役读数与磁盘对齐（测试 277 / 审计门禁 59（磁盘 62）/ 根级 .js 86 / extra_js 85）。
- 边界（诚实）：本模块只做**只读**检索与**条件**保存，不写任何账、不摸 storage、不拉长取数窗口；
  未实跑全量（用户纪律：计划全部内容完成前不跑全量）⇒ 文档如实标「**全量待验**」。
- **退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移**；本版读数均为**定向复验**，新增判据**绝不跑全量**。
''', '## v3.296.0', '插入 v3.296.0 顶节')

# ══════════ TODO 最近更新 ══════════
T.sub('> **最近更新：v3.294.0** —— X 系列第六条落地：**召回解释（X8）**。',
      '> **最近更新：v3.296.0** —— X 系列**最后一条**落地：**X1 结构化证据查询与完整度**。'
      '`evidence-query.js`（纯函数、零依赖、双导出、636 行）把「九账只能关键词检索 + 只看得到最后 200 条」'
      '这两个结构性限制补上：在原账状态上做组合筛选（账本 / 参与者 / 楼层区间 / 状态 / 来源身份 / '
      '修订号区间 / 正文子串），分页与排序由**匹配总数**驱动（不是由摘要长度驱动），'
      '完整度读数逐账报 `total / kept / truncated` 与 `absent`（三因）/ `empty`，'
      '并显式报出「绕过 200 条摘要、直读原账全量」。★ 单一真源：账本登记表仍只有 `evidence-workbench.js` 的 '
      '`LEDGERS`，本模块经 `opts.ledgers` 复用它的取值函数、绝不另抄一份，'
      '`facetsAligned()` 与九项 id **逐字对账**（本仓 v3.233.0 在 event-completeness 上踩过'
      '「照抄别账字段名 ⇒ 恒空」）。★ 两处口径刻意分列：`MAX_SCAN_PER_LEDGER=20000` 是**扫描上限**'
      '不是取数窗口；`searchEvidence`（关键词）与 `searchEvidenceStructured`（结构化）**两者都留**，'
      '不合成一口（合成后 `total` 语义无从分辨）。★ 四态不压平：楼层 `0` / `null` / 未来三态分开，'
      '无楼层行**单独计数并点名原因**；区间反转按空集**不自动交换**；翻过头报 `pageOutOfRange` **不回落第一页**。'
      '★ 保存的是**条件**不是第二份证据库（键面里没有 `rows`/`total`/`hits`）。'
      '判据 `tests/v3296_x1_evidence_query.test.mjs`（16 条）+ N1–N5 真源码破坏负控制 + 7~9 宿主接线 + V 版本卫生。'
      '★ 本版留痕五处（全部实测）：① N3 破坏点选三元式属**不可观测**（`pageOutOfRange` 仍报 true）⇒ 改破坏越界标记本身；'
      '② G 段首版**把判据写反**（「重放不得出现新条目」—— 重放本就该看到当前原账的新条目）⇒ 改查保存项键面；'
      '③ F 段三态计数写错；锚点纯度首版内联字面量 + `\\n` 转义致四处恒 0（改 `String.raw`）；'
      '④ **夹具漏 `_moduleLib` ⇒ 取库异常被 try/catch 吞成 0 账**，看着像接线断、其实是夹具缺件；'
      '⑤ 抬版连带：`v3209` 两处数量锁 84→85、`v3247` REGISTRY +3、tsv 基准 +3、`host_beast_baseline` 重建、'
      '`dead_code_budget` 上界 49546→52238、README/PLAN 读数对齐（277 / 59（磁盘 62）/ 86 / 85）。\n'
      '> **历史留痕：v3.294.0**（X 系列第六条落地，原当前行） —— **召回解释（X8）**。',
      '最近更新行（v3.296.0 + v3.294.0 降为历史留痕）')

for d in (R, P, C, T):
    d.write()
for rel, why in _log:
    print('[bump3296-docs] %-28s %s' % (rel, why))
print('[bump3296-docs] 全部锚点恰中 1 次，%d 处已写盘。' % len(_log))