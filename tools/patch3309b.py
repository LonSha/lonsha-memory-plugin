# -*- coding: utf-8 -*-
"""v3.309.0 M-O8 第四刀 · 收尾补丁：v3309 破坏工具收编唯一真源 + v3247 台账留痕。

背景（实测）：
  * tests/v3309_wp_branch_gate.test.mjs 首版自带 `function sabotage(src, anchor, replacement)`，
    语义与 tests/_break_kit.mjs 的 `breakOnce` 等价（恰中 1 次才动手 / 同值替换拒绝）——
    只是**名字**不在 B2(scan_break_kit C1) 与 v3247 DEFINE_RE 的出口名集里，故静默逃过「不得本地重写」。
  * 同时它被抬版脚本登记进了 v3247 的「接收方」REGISTRY，而它并不 import 真源
    ⇒ B1 双向差集非空（台账有、磁盘无）+ D2 负控制连带转红。

本补丁（治根，不是压红）：
  ① v3309 改为 `import { breakOnce } from './_break_kit.mjs'`，删除本地重写实现（9 处调用改名接线）；
  ② 补强 D2/D5 的破坏锚点自证（打偏会让删空/同值替换 ⇒ 假绿第一形态）；
  ③ v3247 REGISTRY 该行补收编留痕注释。
"""
import os
import re
import sys

ROOT = '/home/user/lonsha-memory-plugin'
V = os.path.join(ROOT, 'tests', 'v3309_wp_branch_gate.test.mjs')
R = os.path.join(ROOT, 'tests', 'v3247_break_kit_consolidation.test.mjs')


def once(text, anchor, new, label):
    n = text.count(anchor)
    if n != 1:
        raise SystemExit('[FATAL] %s 锚点命中 %d 次（期望 1）: %r' % (label, n, anchor[:90]))
    if anchor == new:
        raise SystemExit('[FATAL] %s 同值替换（视为没改）' % label)
    return text.replace(anchor, new)


s = open(V, encoding='utf-8').read()

# ── ① 头注释：纪律段追加「破坏工具走唯一真源」的留痕 ──────────────────────
a = '//   · 破坏一律作用在**真源码**副本上，再对副本跑**同一套判据**'
s = once(s, a, a + '\n'
         '//   · 破坏工具走**唯一真源** `tests/_break_kit.mjs`（`breakOnce`）——\n'
         '//     首版自带 `sabotage` 内联重写，是「换名重写」形态（逃过 B2/C1 的**出口名集**），\n'
         '//     被 v3247 B1 双向差集与 D2 当场点名；已收编（名集的已知边界见本版 CHANGELOG）。',
         '头注释纪律段')

# ── ② import 唯一真源 ──────────────────────────────────────────────────
a = "import { fileURLToPath } from 'node:url';"
s = once(s, a, a + "\nimport { breakOnce } from './_break_kit.mjs';   // 破坏形态唯一真源（v3247 B1 台账已登记）",
         'import 真源')

# ── ③ 删本地重写实现（正则整块，避开破折号个数这种脆锚点）────────────────
pat = re.compile(
    r'// ── 真源码破坏工具：锚点恰中 1 次才动手，否则抛（工具两向自证）─+\n'
    r'function sabotage\(src, anchor, replacement\) \{\n'
    r'(?:.*\n)*?'
    r'    return src\.replace\(anchor, replacement\);\n'
    r'\}\n')
hits = pat.findall(s)
if len(hits) != 1:
    raise SystemExit('[FATAL] 本地重写块命中 %d 次（期望 1）' % len(hits))
new_block = (
    '// ── 真源码破坏工具：**收编唯一真源**（口径 ①②③④ 与消息面全在 tests/_break_kit.mjs）──\n'
    '//   本档曾自带 `sabotage`（三行等价实现，名字不在 B2/C1 的出口名集里 ⇒ 静默逃逸）。\n'
    '//   「换名重写」是名字集检测的**已知边界**：名集只能追已有名字，追不到下一次改名。\n'
    '//   故本档按「唯一真源」纪律接线，不再留本地实现。\n')
s = pat.sub(lambda m: new_block, s, count=1)

# ── ④ 调用点接线（此刻定义已删，只剩真实调用点）──────────────────────
n_call = s.count('sabotage(')
if n_call != 8:
    raise SystemExit('[FATAL] 剩余 sabotage( 调用点 %d 处（期望 8）' % n_call)
s = s.replace('sabotage(', 'breakOnce(')
import re as _re
# 残留检查只判**代码面**（剥注释）——本档头/说明里主动写的「sabotage（已收编）」是留痕，不算残留。
_code = _re.sub(r'/\*[\s\S]*?\*/', '', s)
_code = _re.sub(r'(?m)^[ \t]*//.*$', '', _code)
if 'sabotage' in _code or 'function breakOnce' in _code:
    raise SystemExit('[FATAL] 代码面仍残留本地破坏实现：%r' % _code[_code.index('sabotage') - 60:_code.index('sabotage') + 60] if 'sabotage' in _code else 'breakOnce 被本地定义')

# ── ⑤ D2 破坏锚点自证：打偏 ⇒ 段为空 ⇒ 同值替换 ⇒ 假绿 ────────────────
a = ("        const seg = src.slice(src.indexOf(ANCHOR.decl), src.indexOf(ANCHOR.wpBlock));\n"
     "        broke = src.replace(seg, '');")
s = once(s, a,
         "        const iDecl = src.indexOf(ANCHOR.decl);\n"
         "        const iWp = src.indexOf(ANCHOR.wpBlock);\n"
         "        assert.ok(iDecl > 0 && iWp > iDecl, '前移段两端点须都在场且顺序正确（打偏 ⇒ 段为空 ⇒ 假绿）');\n"
         "        const seg = src.slice(iDecl, iWp);\n"
         "        assert.ok(seg.length > 0, '前移段不得为空（空段替换 = 同值，负控制会退化成对原文件断言）');\n"
         "        broke = src.replace(seg, '');",
         'D2 锚点自证')

# ── ⑥ D5 第二遍判定的插入点自证 ────────────────────────────────────────
a = "        broke = src.replace('if (!_branchOk) {', ANCHOR.guardCall + '); if (!_branchOk) {');"
s = once(s, a,
         "        assert.equal(src.split(\"if (!_branchOk) {\").length - 1, 1, '第二遍判定的插入点须恰中 1 次');\n"
         + a,
         'D5 插入点自证')

open(V, 'w', encoding='utf-8').write(s)

# ── ⑦ v3247 REGISTRY：该行补收编留痕 ──────────────────────────────────
r = open(R, encoding='utf-8').read()
a = "    'v3309_wp_branch_gate.test.mjs',\n"
r = once(r, a,
         "    /* [v3.309.0 M-O8 第四刀] 本档从 tests/_break_kit.mjs 静态取 breakOnce\n"
         "     *   （五条真源码破坏负控制：拆块头闸 / 拆前移段 / 判定对象丢 judged /\n"
         "     *   摘掉读取点 / 判定被加算第二遍）；按 B1 台账纪律在此登记。\n"
         "     *   ★ 收编留痕：首版自带 `sabotage` 内联重写（**换名**逃过 B2/C1 的出口名集），\n"
         "     *   被 B1 双向差集（台账有、磁盘无）与 D2 当场点名 ⇒ 已收编真源。\n"
         "     *   名集只能追已有名字、追不到下一次改名，这是检测面的已知边界（见本版 CHANGELOG）。 */\n"
         + a,
         'v3247 REGISTRY 留痕')
open(R, 'w', encoding='utf-8').write(r)

# ── 落盘后自校验 ─────────────────────────────────────────────────────
import ast
ast.parse(open(os.path.join(ROOT, 'tools', 'patch3309b.py'), encoding='utf-8').read())
print('[patch3309b] OK：v3309 破坏工具已收编唯一真源；v3247 台账留痕已写；'
      'D2/D5 锚点自证已补强（剩余 breakOnce 调用点 %d 处）'
      % open(V, encoding='utf-8').read().count('breakOnce('))
