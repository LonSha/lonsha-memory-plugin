#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.298.0 · M-O3「预算、裁剪与注入回执统一为单一真源」收口抬版。

纪律（沿用 tools/bump3297.py / bump3296.py 与 v3.294 的工具面留痕）：
  · 每处替换断言**恰中 1 次**；失配即退出；
  · **全部锚点先校验、通过后统一写盘** —— 不做「边校验边写」，否则后段失配时
    前几项已经落盘，文件停在半改造状态（v3.294 实测踩过）。
  · 六处版本源 = index.js / manifest.json / package.json + 三份模块副本
    （memory-config / memory-core / memory-organs 的 `let VERSION`，注入失败时它们就是真实现）。
  · 当版锚交接（版本守卫 V4）：v3297 的 `vnum('3.297.0')` 锚随抬版降为历史下界，
    由本版新增的 v3298 接管当版锚（`vnum('3.298.0') === '3298000'`）。
  · 盘面连带（本版与 v3.297.0 的差别在**多了一个模块**）：
    extra_js 85 → 86、根级 .js 86 → 87、测试文件 278 → 279、index.js 物理行 15329 → 15393；
    数量锁（v3209 两处）、REGISTRY（v3247）、参考基准 tsv、人读面 README/PLAN
    与发布面 CHANGELOG/TODO 全部同步。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
OLD, NEW = '3.297.0', '3.298.0'
V_OLD_NUM, V_NEW_NUM = '3297000', '3298000'

_log = []


class Doc:
    """一个待改文件：所有替换先在内存里做，最后统一写盘。"""

    def __init__(self, rel):
        self.rel = rel
        self.p = ROOT / rel
        self.s = self.p.read_text(encoding='utf-8')
        self.dirty = False

    def sub(self, old, new, why):
        n = self.s.count(old)
        if n != 1:
            sys.exit('[bump3298] %s 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点=%r'
                     % (self.rel, n, why, old[:200]))
        if old == new:
            sys.exit('[bump3298] %s 同值替换等于没改：%s' % (self.rel, why))
        self.s = self.s.replace(old, new, 1)
        self.dirty = True
        _log.append((self.rel, why))

    def append(self, text, sentinel, why):
        if sentinel in self.s:
            sys.exit('[bump3298] %s 已含哨兵（重复执行会重复追加）：%s' % (self.rel, why))
        self.s = self.s + text
        self.dirty = True
        _log.append((self.rel, why))

    def prepend(self, text, sentinel, why):
        if sentinel in self.s:
            sys.exit('[bump3298] %s 已含哨兵（重复执行会重复插入）：%s' % (self.rel, why))
        self.s = text + self.s
        self.dirty = True
        _log.append((self.rel, why))

    def write(self):
        if self.dirty:
            self.p.write_text(self.s, encoding='utf-8')


D = {rel: Doc(rel) for rel in [
    'index.js', 'manifest.json', 'package.json',
    'memory-config.js', 'memory-core.js', 'memory-organs.js',
    'tests/v3297_state_report.test.mjs',
    'tests/v3247_break_kit_consolidation.test.mjs',
    'tests/v3209_migration_registry.test.mjs',
    'tests/audit/catalog_reference_consumers.tsv',
    'README.md', 'PLAN.md', 'CHANGELOG.md', 'TODO.md',
]}

# ── ① 版本六处 ──
D['index.js'].sub("const VERSION = '%s';" % OLD, "const VERSION = '%s';" % NEW, '入口版本常量')
D['manifest.json'].sub('"version": "%s"' % OLD, '"version": "%s"' % NEW, '插件清单版本')
D['package.json'].sub('"version": "%s"' % OLD, '"version": "%s"' % NEW, '包版本')
for mod in ('memory-config.js', 'memory-core.js', 'memory-organs.js'):
    D[mod].sub("let VERSION = '%s';" % OLD, "let VERSION = '%s';" % NEW, '模块侧副本（须 let）')

# ── ② v3297 当版锚交接（V4）＋ 下界随抬版 ──
V7 = D['tests/v3297_state_report.test.mjs']
V7.sub("assert.ok(vnum(idx) >= vnum('%s'), '版本不得低于本档出生版本 %s，实 ' + idx);" % (OLD, OLD),
       "assert.ok(vnum(idx) >= vnum('%s'), '版本不得低于本档出生版本 %s，实 ' + idx);" % (NEW, NEW),
       'v3297 版本下界随抬版（下界语义 = 交棒口径，与 V2/V3 一致）')
V7.sub("assert.equal(vnum('%s').toString(), '%s', '当版锚：vnum 解析器须给出三段数值（3*1e6 + 297*1e3 + 0）');" % (OLD, V_OLD_NUM),
       "assert.equal(vnum('%s').toString(), '%s', '当版锚：vnum 解析器须给出三段数值（3*1e6 + 298*1e3 + 0）');" % (NEW, V_NEW_NUM),
       'v3297 当版锚移交给 v3.298.0（旧锚降为历史下界，新锚由 v3298 接管）')

# ── ③ 数量锁：extra_js 85 → 86（v3209 两处）──
V9 = D['tests/v3209_migration_registry.test.mjs']
V9.sub("A(mf.extra_js.length === 85, 'extra_js 须 85 项（v3.296.0 X1 新增 evidence-query.js；",
       "A(mf.extra_js.length === 86, 'extra_js 须 86 项（v3.298.0 M-O3 新增 injection-receipt.js；v3.296.0 X1 新增 evidence-query.js；",
       'v3209 数量锁 ①（真 manifest 项数）')
V9.sub("A(files.length === 85, 'extra_js 抽取器应得 85 项（v3.296.0 X1 evidence-query.js；",
       "A(files.length === 86, 'extra_js 抽取器应得 86 项（v3.298.0 M-O3 injection-receipt.js；v3.296.0 X1 evidence-query.js；",
       'v3209 数量锁 ②（抽取器退化守卫）')

# ── ④ REGISTRY：新档从 _break_kit 取 breakSource（B1 台账纪律）──
D['tests/v3247_break_kit_consolidation.test.mjs'].sub(
    "    'v3296_x1_evidence_query.test.mjs',\n];",
    "    'v3296_x1_evidence_query.test.mjs',\n"
    "    /* [v3.298.0 M-O3] 本档从 tests/_break_kit.mjs 取 breakSource（四条真源码破坏：\n"
    "     *   回执谎报全留 / 未知写成 0 / 常驻归因缺席 / 量纲偏 1）；按 B1 台账纪律在此登记。 */\n"
    "    'v3298_mo3_receipt_single_source.test.mjs',\n];",
    'v3247 REGISTRY 登记新档')

# ── ⑤ 参考基准 tsv：追加本版新档（不登记 ⇒ scan_cross_repo_binding 的 P3 当场点名）──
D['tests/audit/catalog_reference_consumers.tsv'].append(
    'v3298_mo3_receipt_single_source.test.mjs\t\t'
    'M-O3 预算/裁剪/注入回执单一真源的成对判据（24 个 test）：'
    'A1 六类量键齐备且各自独立（候选/载荷/被丢块/裁剪减少/预算溢出/未知）/ '
    'A2 ★「裁剪减少」与「被丢块字符」是两个量（前者 = 后者 + 被丢块各带走的一个块间分隔符，'
    '实测 124 vs 122；载荷精确闭合到「块字符 + 封装」）/ '
    'A3 未裁剪 ⇒ 六类量全是真读数（unknownChars 是**测到的 0**，且不得进未知清单）/ '
    'A4 溢出量与「载荷 − 预算」逐项一致 / '
    'B1 ★ 回执量纲与生产旧键逐项一致（候选/载荷/溢出/保留/被丢/被切半/来源四态/块字符）/ '
    'B2 ★ 五处消费点对同一条 trace 一致（生产 / 回执 / 账本 / 预测 / 对账）/ '
    'B3 结构面（取库口是唯一入口、读数面显式初始化）/ '
    'C1 ★ 内联回落 ⇒ 块级量整组 null 且未知字符 = 全部候选字符（不倒推）/ '
    'C2 规模不符 ⇒ 不可测且归因可分辨 / C3 ★ 两种等价规模自证都收（宿主 blockCount / '
    '路由 residentKept+triggerTotal；来源门必须挡住「内联回落却谎报清单」）/ '
    'C4 ★ 删 trace 的负控制（未知可见、绝不塌陷成「全部留下」；诊断行须写「不可测」并报未知量）/ '
    'C5 硬截断 span 定位不到 ⇒ 该块记 unknown（**不退回 includes** 降级）/ '
    'C6 unknown 清单机器可判（每格 null 点名 + 带原因）/ '
    'D1 ★ 常驻超量 ⇒ 原因 / 选择 / 溢出量三者同时在场（边界须真造出常驻溢出场景）/ '
    'D2 常驻未超 ⇒ 不凭空登记溢出但**选择恒在场** / '
    'D3 容量口径（首尾说明 52/39 + 分隔符 1 + token 口径）与载荷内非块字符精确核对 / '
    'D4 半段场景（入载荷部分可精确算；修前这一格整组不可测）/ '
    'E0 工具两向自证（锚点 0 次 / 不唯一 / 同值替换均抛；原版同判据必须真成立）/ '
    'E1~E4 四条**真源码破坏负控制**（回执谎报全留 ⇒ 同文重复判据转红 / 未知写成 0 ⇒ 不可测判据转红 / '
    '删常驻归因 ⇒ 常驻显式报告判据转红 / 量纲偏 1 ⇒ 一致性判据转红，各配阳性对照）/ '
    'E5 版本锚（当版形 vnum 数值 + 六源同源）/ E6 登记面（extra_js 恰一次、加载序在 cost-forecast 之后、'
    '文件在磁盘、项数锁 86）。★ 边界：本套件证明「量纲有唯一真源、六类量可分、不可测不倒推」，'
    '**不**证明 injection-router 那条 trace 自身的正确性（v3251/v3273 的地盘）。'
    '★ 本版留痕：首轮 8 红中 2 红是产品真 bug（`_numOrNull(null)` 被 `Number(null)=0` 吞成 0 ⇒ '
    '「载荷未知」被读成「载荷 0 字符」并连带判成 no-trim）、2 红是夹具未造出场景'
    '（常驻溢出 / 负控制的库口未接线）。 [v3.298.0]\n',
    'v3298_mo3_receipt_single_source.test.mjs', '参考基准 tsv 登记新档')

# ── ⑥ README：当前版本 / 在役面 / 装载面 / 运行时模块 / extra_js / 待验标记 ──
R = D['README.md']
R.sub('**当前版本**：`%s`（版本四源同步由 `tests/audit/scan_version_guard.mjs` 把守）' % OLD,
      '**当前版本**：`%s`（版本四源同步由 `tests/audit/scan_version_guard.mjs` 把守）' % NEW,
      'README 当前版本')
R.sub('`npm test` 当前发现 **278 个测试文件**；', '`npm test` 当前发现 **279 个测试文件**；',
      'README 在役面测试文件数（本版新增 v3298 一档）')
R.sub('当前版本 v%s **全量待验**' % OLD, '当前版本 v%s **全量待验**' % NEW, 'README 待验标记随抬版')
R.sub('由 `manifest.json` 的 `extra_js`（85 项）按**文件名**加载', '由 `manifest.json` 的 `extra_js`（86 项）按**文件名**加载',
      'README extra_js 项数（D3 全文只准一个值）')
R.sub('├── manifest.json             # 插件清单（js / css / extra_js 85 / extra_css 2）',
      '├── manifest.json             # 插件清单（js / css / extra_js 86 / extra_css 2）',
      'README 目录树 extra_js 项数')
R.sub('**运行时模块**：86 个（根目录 `.js`，含入口 `index.js`）',
      '**运行时模块**：87 个（根目录 `.js`，含入口 `index.js`）', 'README 运行时模块数（D4）')
R.sub('**载入面**：`index.js` + `extra_js` 85 项 + CSS 3 项',
      '**载入面**：`index.js` + `extra_js` 86 项 + CSS 3 项', 'README 载入面 extra_js 项数')

# ── ⑦ PLAN：执行状态 / 版本行 / 门禁行 / 快照行 / 体量行 / 门禁纪律行 ──
P = D['PLAN.md']
P.sub('> **当前执行状态（2026-10-09，v%s）**' % OLD,
      '> **当前执行状态（2026-10-09，v%s）**' % NEW, 'PLAN 执行状态行（版本）')
P.sub('| 版本 | **v%s**（四源同源；本表原为 v3.266.0）' % OLD,
      '| 版本 | **v%s**（四源同源；本表原为 v3.266.0）' % NEW, 'PLAN 现状基线版本行')
P.sub('| 门禁 | 在役面 **278 测试文件 / 59 个 audit 脚本**（磁盘 62）',
      '| 门禁 | 在役面 **279 测试文件 / 59 个 audit 脚本**（磁盘 62）', 'PLAN 门禁行在役面测试数')
P.sub('；当前 v%s **全量待验** |' % OLD, '；当前 v%s **全量待验** |' % NEW, 'PLAN 快照行待验标记随抬版')
P.sub('+ extra_js **85** 项', '+ extra_js **86** 项', 'PLAN 体量行 extra_js 项数')
P.sub('**当前 v%s 全量待验**' % OLD, '**当前 v%s 全量待验**' % NEW, 'PLAN 门禁纪律行待验标记')

# ── ⑧ TODO：最近更新行（V7）──
D['TODO.md'].sub('> **最近更新：v%s** —— **M-O9 当前事实、门禁与文档自动同源**（第二期优化计划第一条落版）。' % OLD,
                 '> **最近更新：v%s** —— **M-O3 预算、裁剪与注入回执统一为单一真源**（第二期优化计划第二条落版）。' % NEW,
                 'TODO 最近更新行（版本 + 主题）')

# ── ⑨ CHANGELOG 顶节 ──
D['CHANGELOG.md'].prepend('''## v3.298.0
**M-O3 预算、裁剪与注入回执统一为单一真源 —— 六类量拆开命名、判据不可测一律不倒推**
- **缺口（M-O3 原文）**：v3.251.0 把「谁被留下」从文本反推换成裁剪回执，v3.274.0 把三处消费点
  （生产聚合数 / 预测 / 面板）统一到同一份回执。但**量纲**这一面仍是三处各算一遍，且缺两类量：
  ① `_lastBudgetStats.candidateChars` 自己 `_allB.reduce(长度)`、cost-ledger 自己累 `tagged`、
  cost-forecast 自己累 resident+trigger —— **同一事实三份实现**（本仓点名的头号缺陷形态），
  任一处漏掉空块 / 封装口径就漂移，且没有任何判据看着；
  ② 「裁剪减少的字符」（裁剪前全文 − 载荷，**含**首尾说明与块间分隔符）与「被丢块的字符之和」
  （**不含**封装）被混着叫 `droppedChars` —— 实测三触发块场景 **124 vs 122**（差的两个字符
  正是块间分隔符）；把两者当同一个量对账必然假 drift；
  ③ 判据不可用时（回执缺席 / 内联回落 / 规模不符）**没有任何一格回答**
  「这批候选里有多少字符是不可归因的」—— 修前整组退回 `includes` 反推，
  而反推在未裁剪场景恰好偏向「全部留下」，正是本计划要断的谎报形态。
- **交付**：新增模块 `injection-receipt.js`（386 行，纯函数、零依赖、双导出）——
  在**同一条 trace** 上把**六类量**拆开各自命名，口径写死在一处：
  `candidateChars`（Σ 候选块文本，不含封装）/ `payloadChars`（最终载荷，含封装）/
  `droppedBlockChars`（Σ 整块被丢，不含封装）/ `trimReductionChars`（裁剪前 − 载荷）/
  `budgetOverflowChars`（载荷 − 预算，软预算下常驻保护时可 > 0）/ `unknownChars`（不可归因字符）。
  ★ 前两者的差就是块间分隔符 —— 这条关系现在是**可断言的等式**，不是一个名字下的两个口径。
- **单一真源（可读、可判）**：`traceUsable`（回执可用性两问：规模自证 + 来源必须是路由模块）
  / `classifyBlocks`（逐块**四态**：kept / dropped / partial / unknown + empty 占位）/
  `deriveReceipt`（六类量 + 派生量 + identity + resident + capacity + unknown 清单）/
  `receiptLine`（一行诊断）。宿主侧新增取库口 `_injectionReceiptLib()`、读数面
  `_lastReceipt` 与 `_lastBudgetStats.receipt` / `.receiptLine`；旧键（`droppedChars` /
  `candidateChars` / `overBudgetChars` …）**一字不动**，本格是**新增**的真源面。
- **★ 两种等价规模自证都收**：宿主口径 `blockCount`（index.js / cost-ledger 用）与路由口径
  `residentKept + triggerTotal`（cost-forecast 用，因为它调路由时拿不到宿主填的字段）。
  修前两处各认一种，于是同一份回执在一处「可用」、在另一处「不可用」——
  cost-forecast 首版正是因此把**每一次**精确回执都判成「未派发」而整组记 null（假不可测）。
  同理**不得要求回执带 `version`**（那是宿主填的字段，路由模块不填）。
- **★ 不可测一律不倒推**：回执缺席 / 内联回落 / 规模不符 / 硬截断 span 定位不到 ⇒
  块级量整组 `null` + 来源，**绝不退回 `includes`**；不可归因的字符量单列 `unknownChars`
  （可测且无未知块 ⇒ **测到的 0**；整批不可测 ⇒ 全部候选字符）。`unknown[]` 清单逐格点名并给原因。
- **★ 常驻超量显式报告**：`resident.reason`（常驻封装 N 字符 > 预算 M）+ `resident.decision`
  （常驻块按设计全保留，关键事实保护）+ `resident.overflow`（chars / over）三者同时在场，
  不静默裁断关键事实、也不只给一个光秃秃的数字。
- **★ 容量口径逐项披露**：预算含首尾说明（HEAD 52 / TAIL 39）与块间分隔符（1 字符）＋
  token 口径（`host-*` 真 tokenizer / `estimate` 估算 ≈1.11 字符/token，估算值不得当精确值）；
  另给 `frameCheck`：载荷内非块字符 **必须**精确等于「首尾说明 + 分隔符 × 留在载荷里的块数」。
- **判据 `tests/v3298_mo3_receipt_single_source.test.mjs`（24 条，A~E 五段）**：
  A 六类量分列（含「两量不等」与「载荷精确闭合」两条等式）/ B 单一真源（回执 = 生产旧键；
  生产/回执/账本/预测四处对同一条 trace 一致）/ C 未知不倒推（内联回落 / 规模不符 / 删 trace /
  span 定位不到；两种规模自证都收）/ D 常驻显式报告 + 容量口径 + 半段入载荷部分可精确算 /
  E 四条**真源码破坏负控制**（回执谎报全留 / 未知写成 0 / 删常驻归因 / 量纲偏 1，各配阳性对照）
  + 版本锚（当版形 vnum：`vnum('3.298.0') === '3298000'`，同时承接 v3297 移交的当版锚）
  + 登记面（extra_js 恰一次、加载序在 cost-forecast 之后、项数锁 86）。
- **本版留痕（首轮 8 红，逐条归因，全部实测）**：
  ① **产品真 bug**：`_numOrNull(v)` 直接 `Number(v)` ⇒ `Number(null) === 0`，
  「载荷**未知**」被静默读成「载荷 **0 字符**」，连带把判据判成 `no-trim`（谎报整批都在）——
  正是本模块要断的那类错，落在自己的实现里。已改为 null / undefined / '' 先挡再转数。
  ② **夹具未造出场景**：常驻溢出用「注入预算调小」触发，而场景里混着宿主块，实际是触发侧先被裁
  ⇒ 判据以「常驻溢出未登记」红。这是**夹具缺件**不是产品缺陷，已单造常驻超长块场景
  （`residentOverEngine`）。同族的还有负控制未接线回执库口（`unknownJudge` / `residentJudge`
  拿了参数却没用上，破坏副本根本没被跑）—— **负控制自己的夹具也要自证**。
  ③ 容量口径判据首版把「分隔符个数」按 `countedBlocks - 1` 算（把被丢的块也算进分隔符），
  自招一红；改为按**真留在载荷里的块数**（保留 + 被切半）。
- **抬版连带**：版本六处（`index` / `manifest` / `package` + `memory-config` / `memory-core` /
  `memory-organs` 三份副本）；`manifest.extra_js` 85 → 86（新增 `injection-receipt.js`，
  排在它所消费的 `cost-forecast.js` 之后）；数量锁 `v3209` 两处、`v3247` REGISTRY、
  `catalog_reference_consumers.tsv` 参考基准、README/PLAN 人读读数、`host_beast_baseline`
  同源重建、`dead_code_budget` 上界随活跃行数上抬；v3297 的当版锚**移交**给 v3298（V4）。
- 边界（诚实）：**真宿主面未执行**（交付环境无任何可访问的 SillyTavern 实例）；
  本版**未跑全量**（用户纪律：计划全部内容做完前不跑全量）⇒ 文档如实标「全量待验」。
- **退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移**；本版读数均为**定向复验**（单套件 + 单扫描器），**绝不跑全量**。
''', '## v3.298.0', '插入 v3.298.0 顶节')

for doc in D.values():
    doc.write()
for rel, why in _log:
    print('[bump3298] %-46s %s' % (rel, why))
print('[bump3298] 全部锚点恰中 1 次，%d 处已写盘。' % len(_log))