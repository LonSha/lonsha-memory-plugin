#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.297.0 · M-O9「当前事实、门禁与文档自动同源」收口抬版。

纪律（沿用 tools/bump3296.py 与 v3.294 的工具面留痕）：
  · 每处替换断言**恰中 1 次**；失配即退出；
  · **全部锚点先校验、通过后统一写盘** —— 不做「边校验边写」，否则后段失配时
    前几项已经落盘，文件停在半改造状态（v3.294 实测踩过）。
  · 六处版本源 = index.js / manifest.json / package.json + 三份模块副本
    （memory-config / memory-core / memory-organs 的 `let VERSION`，注入失败时它们就是真实现）。
  · 产物面：v3297 判据套件补当版锚（版本守卫 V4 只认 `vnum('X.Y.Z')` 数值形态）——
    v3296 的当版锚随抬版降为历史下界，若无继任者，V4 会当场报「当版锚点被删空」。

★ 与 v3.296.0 收口轮的口径差（本版为什么「文档回到待验」）：
  v3.296.0 是 X 系列八条全部交付后的**计划收口点**，按纪律在那里跑过一次全量，
  文档因此写「本版已实跑」。本版是**新一期的开工版**（第二期计划 M-O1~M-O9 / M-X1~M-X9），
  盘面一动，`doc_readings.json` 的登记就不再同源 ⇒ 按用户纪律回到
  「未实跑即标待验」的口径（回到待验是**规则**，不是退步）。
"""
import re
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
OLD, NEW = '3.296.0', '3.297.0'

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
            sys.exit('[bump3297] %s 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点=%r'
                     % (self.rel, n, why, old[:160]))
        if old == new:
            sys.exit('[bump3297] %s 同值替换等于没改：%s' % (self.rel, why))
        self.s = self.s.replace(old, new, 1)
        self.dirty = True
        _log.append((self.rel, why))

    def append(self, text, sentinel, why):
        if sentinel in self.s:
            sys.exit('[bump3297] %s 已含哨兵（重复执行会重复追加）：%s' % (self.rel, why))
        self.s = self.s + text
        self.dirty = True
        _log.append((self.rel, why))

    def insert_at_head(self, text, sentinel, why):
        if sentinel in self.s:
            sys.exit('[bump3297] %s 已含哨兵（重复执行会重复插入）：%s' % (self.rel, why))
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
    'tests/audit/catalog_reference_consumers.tsv',
    'README.md', 'PLAN.md', 'CHANGELOG.md', 'TODO.md',
]}

# ── ① 版本六处 ──
D['index.js'].sub("const VERSION = '%s';" % OLD, "const VERSION = '%s';" % NEW, '入口版本常量')
D['manifest.json'].sub('"version": "%s"' % OLD, '"version": "%s"' % NEW, '插件清单版本')
D['package.json'].sub('"version": "%s"' % OLD, '"version": "%s"' % NEW, '包版本')
for mod in ('memory-config.js', 'memory-core.js', 'memory-organs.js'):
    D[mod].sub("let VERSION = '%s';" % OLD, "let VERSION = '%s';" % NEW, '模块侧副本（须 let）')

# ── ② v3297：档头标当版（frontier 识别形态）+ 补当版锚（V4）──
V7 = D['tests/v3297_state_report.test.mjs']
V7.sub(' * tests/v3297_state_report.test.mjs — M-O9「当前事实、门禁与文档自动同源」判据\n',
       ' * tests/v3297_state_report.test.mjs — M-O9「当前事实、门禁与文档自动同源」判据 [v%s]\n' % NEW,
       '档头标当版（frontier 豁免按「同一行含本档名 + 当版号」判定）')
V7.append('''
/* ══════════ S10 版本卫生与当版锚 ══════════
 * 本段与 tests/v3296_x1_evidence_query.test.mjs 的 V 段同构，理由是**版本守卫 V4**：
 *   「至少一个测试以 `vnum('<当版>')` 恰好锚着当前版本」。
 *   抬版时上一版的锚随之降为**历史下界**（这是交棒，不是缺陷），若本版不补继任锚，
 *   V4 会当场报「当版锚点被删空，版本守卫失去基准」 —— 锚必须有人接。
 *   刻意**不**写成 assert.equal(idx, '3.297.0')：那是 V2 点名的「抬版仪式」形态
 *   （写死当版号的历史测试在下一版必红，且每次抬版都要人工批量替换）。
 */
test('S10 版本四源同源且不低于本档出生版本（含当版锚 V4 形态）', () => {
  const vnum = (s) => {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
  };
  const man = JSON.parse(read('manifest.json')).version;
  const pkg = JSON.parse(read('package.json')).version;
  const idx = (read('index.js').match(/const VERSION = '([0-9.]+)'/) || [])[1];
  assert.ok(idx, 'index.js 版本真值可取');
  assert.equal(man, idx, 'manifest 与 index 必须同源');
  assert.equal(pkg, idx, 'package.json 与 index 必须同源');
  for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
    const v = (read(m).match(/let VERSION = '([0-9.]+)'/) || [])[1];
    assert.equal(v, idx, m + ' 副本必须与 index 同源（注入失败时它就是真实现）');
  }
  assert.ok(vnum(idx) >= vnum('3.297.0'), '版本不得低于本档出生版本 3.297.0，实 ' + idx);
  /* ★ 当版锚：全仓恰此一处以 vnum 锚着当版；抬版时由继任套件接管，本行降为历史下界。 */
  assert.equal(vnum('3.297.0').toString(), '3002002', '当版锚：vnum 解析器须给出三段数值');
  /* 人读两份在场即必须同源（与 scan_version_guard 的 V6/V7 同口径） */
  assert.equal((read('CHANGELOG.md').match(/^## (v[0-9.]+)/m) || [])[1], 'v' + idx, 'CHANGELOG 顶节应是当版');
  assert.equal((read('TODO.md').match(/最近更新：v([0-9.]+)/) || [])[1], idx, 'TODO 最近更新应是当版');
});
''', 'S10 版本卫生与当版锚', 'v3297 补当版锚（版本守卫 V4）')

# ── ③ tsv 登记：条数同步 9 → 10 ──
D['tests/audit/catalog_reference_consumers.tsv'].sub(
    'M-O9 状态报告生成臂的成对判据（9 个 test）',
    'M-O9 状态报告生成臂的成对判据（10 个 test）',
    'tsv 登记条数同步')
D['tests/audit/catalog_reference_consumers.tsv'].sub(
    'F 可复算（同环境两次生成同摘要；--check 对账漂移须 exit 1）/ N1~N2 真源码破坏负控制 + 当版锚点（vnum 数值形态）。',
    'F 可复算（同环境两次生成同摘要；--check 对账漂移须 exit 1）/ N1~N2 真源码破坏负控制 / S10 版本卫生与当版锚（vnum 数值形态，四源 + CHANGELOG/TODO 人读面 + 副本三份）。',
    'tsv 登记内容同步 S10')

# ── ④ README：当前版本 + 回到待验口径 ──
R = D['README.md']
R.sub('**当前版本**：`%s`（版本四源同步由' % OLD,
      '**当前版本**：`%s`（版本四源同步由' % NEW, 'README 当前版本')
R.sub('本版**已实跑**（X 系列八条全部交付 ⇒ 计划收口点，按纪律在此跑一次全量；上一快照为 v3.284.0 · 264 · 2727 · 55/55）。',
      '当前版本 v' + NEW + ' **全量待验** —— 上一快照 v' + OLD + ' 是 X 系列八条全部交付时那个**计划收口点**的实跑读数'
      '（按用户纪律「做完计划全部内容前别跑全量」，集中到计划收口才跑一次）；本版起进入**第二期计划**'
      '（优化 M-O1~M-O9 / 拓展 M-X1~M-X9），盘面一动登记即不再同源，故回到「未实跑即标待验」的口径。'
      '**回到待验是规则，不是退步**（上一快照为 v3.284.0 · 264 · 2727 · 55/55）。',
      'README 快照行 → 待验口径')

# ── ⑤ PLAN：执行状态 / 版本行 / 门禁纪律行 / 快照行挂待验 ──
P = D['PLAN.md']
P.sub('> **当前执行状态（2026-10-08，v%s）**' % OLD,
      '> **当前执行状态（2026-10-09，v%s）**' % NEW, '执行状态行（版本 + 日期）')
P.sub('| 版本 | **v%s**（四源同源；本表原为 v3.266.0）' % OLD,
      '| 版本 | **v%s**（四源同源；本表原为 v3.266.0）' % NEW, '现状基线版本行')
P.sub('**本版即该收口点**：X 系列八条全部交付后已跑一次全量（v%s · 277 文件 · 2986 断言 · 0 失败 · 审计 59/59，'
      '登记见 `doc_readings.json`），故下方快照行不再是「待验」而是实测读数；后续再动盘面仍须回到'
      '「未实跑即标待验」的口径，由 `scan_doc_truthfulness.mjs` 把守。' % OLD,
      '上一次收口点是 v%s（X 系列八条全部交付时跑的实跑读数，登记见 `doc_readings.json`）；'
      '**当前 v%s 全量待验** —— 本版起进入**第二期计划**（优化 M-O1~M-O9 / 拓展 M-X1~M-X9），'
      '盘面一动登记即不再同源，故回到「未实跑即标待验」的口径（回到待验是规则，不是退步），'
      '由 `scan_doc_truthfulness.mjs` 把守。' % (OLD, NEW),
      'PLAN 门禁纪律行 → 待验口径')
P.sub('| 全量快照 | 最近全量快照 **v%s：277 测试文件 / 2986 断言 0 失败 / 审计 59/59**（上一快照 v3.284.0：264 / 2727 / 55/55） |' % OLD,
      '| 全量快照 | 最近全量快照 **v%s：277 测试文件 / 2986 断言 0 失败 / 审计 59/59**（上一快照 v3.284.0：264 / 2727 / 55/55）；当前 v%s **全量待验** |' % (OLD, NEW),
      'PLAN 快照行挂待验标记')

# ── ⑥ TODO：最近更新行（V7）──
D['TODO.md'].sub('> **最近更新：v%s** —— X 系列**最后一条**落地：**X1 结构化证据查询与完整度**。' % OLD,
                 '> **最近更新：v%s** —— **M-O9 当前事实、门禁与文档自动同源**（第二期优化计划第一条落版）。' % NEW,
                 'TODO 最近更新行（版本 + 主题）')

# ── ⑦ CHANGELOG 顶节 ──
D['CHANGELOG.md'].insert_at_head('''## v3.297.0
**M-O9 当前事实、门禁与文档自动同源 —— 「当前版本 / 装载面 / 测试数 / 审计数」从人工复算改为磁盘现读**
- **缺口（M-O9 原文）**：文档读数真实性门（D1~D9）与计划陈旧标记已交付，但「当前版本 / 装载面 /
  测试数 / 审计数」仍需**人工复算**，抬版与增删模块时容易漂移。既有 D 系列解决的是**单向核对**
  （文档说什么 → 磁盘是不是那样），它不解决**没有任何一处把「当前事实」整份生成出来**：
  每次抬版仍要人自己去数 manifest 项数、数测试文件、数审计脚本，数错了要等 D 系列红才发现，
  而 D 系列只覆盖 README/PLAN 里**已经写了**的那些格。
- **交付**：`tools/gen_state_report.mjs`（生成臂，导出 `collectState()`）+ 落盘报告
  `tests/audit/state-report.json` + 判据 `tests/v3297_state_report.test.mjs`（10 条，S1~S10）。
  三条纪律写进实现，不是写在注释里：
  ① **判据与生成器共用同一份取数** —— 测试 `import { collectState }` 比对，
     不另抄一份「怎么数」（两份取数必然漂移；本仓已在 `test_cost_readings` 上立过同款纪律）。
  ② **未知不报 0** —— 数不出来的格写 `null`，并在 `unknown[]` 写明为什么：把「读不到目录」
     写成 0 会让「空模块目录」与「读不到目录」**同形**。
  ③ **未执行不报通过** —— 真宿主面（本环境无 SillyTavern 实例）一律 `not-executed` 且附理由；
     全量实跑面**只信登记**（`doc_readings.json`），登记版本与当前版本不同源 ⇒ 标 `stale`
     并进 `unknown[]`，绝不写 `pass`。
- **门禁分档记账**（M-O9 第 3 条）：四档 `unit` / `targeted` / `full` / `host`，逐档给跑法与用途，
  `host` 档如实登记 `status: 'not-executed'`（判据 S6 另有一条：**任何档都不得自称 `pass`**）。
- **摘要面**：报告带 `digest.scope` 与逐文件 sha256 前 12 位，覆盖机器面（`index.js` /
  `manifest.json` / `package.json`）+ **人读索引面** + 实跑登记（`doc_readings.json`），
  同环境两次生成必须逐字相同（S7）——「干净检出可重建同一份状态报告」这句验收由此可判。
  ★ 清单里登记的 `update-log.json` 在本仓**不存在**，报告如实给出 `null` 而**不写成 0**
  （这正是「未知不报 0」那条纪律在摘要素上的第一次真实应用）。
- **CLI 三态**：`--write` 落盘 / `--check` 与落盘报告对账（漂移 `exit 1`）/ 默认打印 JSON。
- **判据 S1~S10**：S1 schema 与 `unknown[]` 在场 / S2 ★ 当前版本 · 人读索引 · 机器装载面
  **三者一致**（`triple_consistent`，且 `missing_in_manifest` 必须为空 —— manifest 里列了盘上
  没有的文件，装载时会炸）/ S3 落盘报告与现场**逐格 + 逐条**一致（清单漂了而条数恰好相同这种
  改名也抓得住）/ S4 ★ 未知不报 0（每一格 `null` 都必须有解释）/ S5 ★ 未执行不报通过
  （真宿主档与全量档各自受限）/ S6 四档齐备且「未执行」档不自称通过 + 计划原文锚点
  （**锚点选真源**：M-O9 的定义在 `.agents/notes/proposed/architecture/2026-10-08-optimization-plan-v2.md`，
  `PLAN.md` 只是入口索引）/ S7 干净检出可重建 / S8~S9 负控制（把报告里的数改掉 ⇒ S3 同款判据翻红；
  把 `unknown` 抹掉 ⇒ S4 对无解释的 `null` 判假）/ S10 版本卫生与当版锚。
- **与 D 系列的分工（写进档头，别搞混）**：D 系列是**反向核对**（管得住「文档说谎」，
  管不住「没人把当前事实写下来」）；本档是**正向生成**（管得住「报告漂移」，
  管不住「README 里那行旧了」）。两者都不替代对方。
- **计划面同步**：README / PLAN 回到「**当前版本 v3.297.0 全量待验**」口径 —— 上一快照
  v3.296.0 是 X 系列八条全部交付时那个**计划收口点**的实跑读数；本版起进入**第二期计划**
  （优化 M-O1~M-O9 / 拓展 M-X1~M-X9），盘面一动登记即不再同源，故按纪律回到待验
  （回到待验是**规则**，不是退步）。
- **抬版连带**：版本六处（`index` / `manifest` / `package` + `memory-config` / `memory-core` /
  `memory-organs` 三份副本）；`catalog_reference_consumers.tsv` 参考基准登记
  `v3297_state_report.test.mjs`（新增测试档不登记 ⇒ `scan_cross_repo_binding.mjs` 的 P3 当场点名）；
  v3297 补当版锚（上一版的锚随抬版降为历史下界，**锚必须有人接**，否则版本守卫 V4 报
  「当版锚点被删空」）。
- 边界（诚实）：**真宿主面未执行**（交付环境无任何可访问的 SillyTavern 实例）；本版**未跑全量**
  （用户纪律：计划全部内容做完前不跑全量）⇒ 文档如实标「全量待验」。
- **退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移**；本版读数均为**定向复验**（单套件 + 单扫描器），**绝不跑全量**。
''', '## v3.297.0', '插入 v3.297.0 顶节')

for doc in D.values():
    doc.write()
for rel, why in _log:
    print('[bump3297] %-46s %s' % (rel, why))
print('[bump3297] 全部锚点恰中 1 次，%d 处已写盘。' % len(_log))