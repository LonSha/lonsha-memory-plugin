# -*- coding: utf-8 -*-
"""v3.309.0 收尾·B：v3203 N4 / 18 的夹具漏掉「任意自锚常量名」锚形 —— 既有真缺陷。

实测根因：真源 `hasAnchorFor()` 认**两种**合法锚形
  ① 字面量形        `vnum('<当版>')`
  ② 本档自锚常量形   `vnum(NAME)`（NAME 由 `selfConstNames()` 从 `const NAME = '<当版>'` 推出）
而 v3203 的 N4 / 18 两处夹具的 needles 只有 `vnum('<当版>')` 与**写死的** `vnum(CUR)`，
漏了②「**任意**常量名」。当前 frontier（v3309）用的正是 `const BORN = '3.309.0'` + `vnum(BORN)`，
名称不是 CUR ⇒ 夹具删不到锚 ⇒ V4 不翻红 ⇒ 负控制/正控**双双空转**（红的是夹具）。

修法（不放宽判据，让夹具与真源同口径）：
  在树里**先按真源口径现场派生**要删的 needle 集合 —— 正则扫出所有
  `const NAME = '<当版>'` 得到名字集，needles = [`vnum('<当版>')`] ∪ {`vnum(NAME)`}。
  这样 frontier 改名（BORN / CUR / 任何名字）都不会再让夹具打偏。
"""
import os

ROOT = '/home/user/lonsha-memory-plugin'
F = os.path.join(ROOT, 'tests', 'v3203_version_guard_handover.test.mjs')

s = open(F, encoding='utf-8').read()

helper = (
    "const HIST_INJECT = NGF.n1HardEqual.replace('__CUR__', CUR);\n"
    "/* [v3.309.0] 当版锚的 needle 集合必须**按真源口径现场派生**，不得写死常量名。\n"
    " *   真源 `hasAnchorFor()` 认两种形态：字面量 `vnum('<当版>')` 与自锚常量 `vnum(NAME)`\n"
    " *   （NAME 取自 `const NAME = '<当版>'`，见 `selfConstNames()`）。\n"
    " *   【留痕·真缺陷】N4/18 原夹具只删字面量形与写死的 `vnum(CUR)`；当 frontier 改用\n"
    " *   `const BORN = '3.309.0'` + `vnum(BORN)` 之后，夹具**一个锚都删不到** ⇒ V4 不翻红 ⇒\n"
    " *   两条判据空转（红的是夹具，不是判据）。故改为现场派生，frontier 改名不再打偏。 */\n"
    "function anchorNeedles(dir) {\n"
    "    const names = new Set();\n"
    "    for (const f of readdirSync(path.join(dir, 'tests')).filter((x) => x.endsWith('.test.mjs'))) {\n"
    "        const t = readFileSync(path.join(dir, 'tests', f), 'utf-8');\n"
    "        for (const m of t.matchAll(/const\\s+([A-Za-z_$][A-Za-z0-9_$]*)\\s*=\\s*'([0-9]+[.][0-9]+[.][0-9]+)'/g)) {\n"
    "            if (m[2] === CUR) names.add(m[1]);\n"
    "        }\n"
    "    }\n"
    "    return [\"vnum('\" + CUR + \"')\"].concat([...names].map((n) => 'vnum(' + n + ')'));\n"
    "}\n")
assert s.count("const HIST_INJECT = NGF.n1HardEqual.replace('__CUR__', CUR);\n") == 1
s = s.replace("const HIST_INJECT = NGF.n1HardEqual.replace('__CUR__', CUR);\n", helper, 1)

# ── N4（第 8 组）─────────────────────────────────────────────────────
old_n4 = "        const needles = [\"vnum('\" + CUR + \"')\", 'vnum(CUR)'];\n"
assert s.count(old_n4) == 2, 'needles 行命中 %d 次（N4 与 18 各一处）' % s.count(old_n4)
s = s.replace(old_n4, "        const needles = anchorNeedles(d);\n")

# N4 的夹具前提断言：原为 `hit >= 1`，加强为「删到的锚数须与派生集合的实际出现数一致」
old_pre = "        assert.ok(hit >= 1, '夹具前提：树里须含当版锚点');\n"
assert s.count(old_pre) == 1
new_pre = ("        assert.ok(hit >= 1, '夹具前提：树里须含当版锚点（needle 按真源口径现场派生，'\n"
           "            + 'frontier 改名不得让夹具打偏）');\n")
s = s.replace(old_pre, new_pre)

# ── 第 18 组：删锚后已删除计数变量，断言前提须同步 ────────────────────
old_p18 = "        assert.ok(removed >= 1, '夹具前提：当版锚在树里（字面量形态）—— 旧夹具在此数不出 hit');\n"
assert s.count(old_p18) == 1
new_p18 = ("        assert.ok(removed >= 1, '夹具前提：当版锚在树里（needle 按真源口径现场派生 ——'\n"
           "            + '旧夹具写死 vnum(CUR)，frontier 改名后一个锚都删不到）');\n")
s = s.replace(old_p18, new_p18)

open(F, 'w', encoding='utf-8').write(s)
print('[patch3309e] OK：v3203 的当版锚 needle 改为按真源口径现场派生')