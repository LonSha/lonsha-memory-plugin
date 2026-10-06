#!/usr/bin/env python3
# CHANGELOG v3.288.0 节补录本刀后半程内容：P4 形态 B、套件两处缺陷、读数同步、登记面。
import pathlib

CH = pathlib.Path('/home/user/lonsha-memory-plugin/CHANGELOG.md')
src = CH.read_text(encoding='utf-8')
lines = src.split('\n')
start = next(i for i, l in enumerate(lines) if l.startswith('## v3.288.0'))
end = next(i for i, l in enumerate(lines) if i > start and l.startswith('## '))

ADD = [
    '- **★ 后半程第二处真缺口（自查发现）**：改 PLAN 现状节把「六项已交付各自定向门」写成**行尾总结句**后，',
    '  P4 的段界切法（每段须**自带**状态词）使 `delivered.size` 只剩 1 ⇒ **判据静默跳过**（报「未呈现',
    '  O1–O7 已交付形态…P4 本档跳过」）。这是**判据与文档措辞耦合**的实例：判据本应适应人的自然写法，',
    '  不该逼文档改写成八股。修法：P4 增「形态 B —— 行尾总结句」读法（须含「N 项已交付」，且逐段复核',
    '  被显式标「部分交付/未收口/未执行」的编号仍排除）；实测恢复为 `已交付编号 1,3,4,5,6,7`（7 个编号',
    '  里正确排除 O2），P8 同门不受影响。',
    '- **判据套件自身两处缺陷（首版即红，已修并留痕）**：',
    '  ① **含反斜杠的锚点不能用普通引号串**：`A_P8_BULLET` 首版写成双引号串，JS 把 `\\s`/`\\d` 当转义',
    '     吃掉（值里只剩 `s`/`d`），常量值与真源代码行**不再相等** ⇒ 持有断言与破坏工具同时失配。',
    '     改为 `String.raw` 模板（保留字面反斜杠），实测 `EQUAL VALUES: true`。',
    '  ② **锚点纯度的判法**：`assert.ok(self.includes(a))`（文件含锚点值）对含反斜杠的锚点**恒假** ——',
    '     值经转义后不是源码文本的子串。改为「`const <名称> = <字面量>;` 以三种合法形态（双引号 / 单引号 /',
    '     `String.raw`）精确命中**恰 1 次**」。这两条与 H5 同族：**判据看错了层**（值 vs 源码文本）。',
    '  ③ **锚点命中数不是恒 1**：`bulletRe` 是 P4/P8 **同构复用**的判定形态，真源恰出现 **2 次**。',
    '     首版用 `assertSingleHit`（要求恰 1 次）⇒ 把**正确源码**判红。改为按 `EXPECT_HITS` 分档：',
    '     独有锚点走 `assertSingleHit`，复用锚点断言期望命中数并注明理由。',
    '- **读数同步（磁盘真值变化，D 门把守）**：新增本档使 `tests/` 由 268 → **269** 个测试文件；',
    '  README 四处（在役面读数 / 命令注释 / 目录树 / 在役面段）与 PLAN 现状基线表同步为 269；',
    '  README 与 PLAN 的「当前版本 v3.287.0 **全量待验**」改为 **v3.288.0 全量待验**。',
    '  实测 `scan_doc_truthfulness.mjs` 14 项读数全过（rc=0）。',
    '- **登记面**：本档已补进 `tests/audit/catalog_reference_consumers.tsv`（在役测试面全量）与',
    '  `tests/v3247_break_kit_consolidation.test.mjs` 的 REGISTRY（从唯一真源取 `breakSource` /',
    '  `assertSingleHit`，按台账纪律登记）。F 组破坏由手写 `s.replace` 改为唯一真源 `breakSource`，',
    '  E 组恢复 `assertSingleHit` 真调用 ⇒ 本档**无零调用导入**。',
    '- **当版锚交棒**：`tests/v3287_ui_interaction.test.mjs` 从硬锚退为下限锚（`vnum(pkg) >= vnum(\'3.287.0\')`，',
    '  注释 `[v3.288.0 交棒]`）；新档 `tests/v3288_plan_currency_xface.test.mjs`（**10 条**）以',
    '  `assert.equal(vnum(\'3.288.0\'), vnum(pkg))` 锚当版。版本守卫实测：当版 frontier 1 / 当版锚点 1 / 问题 0。',
    '- **门禁实测（本刀收口）**：审计门禁 **58/58 全绿**；触及的七档判据套件全绿（v3288 10 · v3286 计划 13 ·',
    '  v3286 成本 12 · v3287 17 · v3285 16 · v3247 17 · v3226 14）；负控制 `tools/_o2_negprobe.py`',
    '  破坏态 **rc=1**、还原**逐字节一致**（`restored byte-identical = True`）。',
]

insert_at = end
while insert_at - 1 > start and lines[insert_at - 1].strip() == '':
    insert_at -= 1
n_added = 0
for l in ADD:
    if l not in lines:
        lines.insert(insert_at, l)
        insert_at += 1
        n_added += 1

CH.write_text('\n'.join(lines), encoding='utf-8')
print('CHANGELOG v3.288.0: +%d 行，共 %d 行' % (n_added, len(lines)))