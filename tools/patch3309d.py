# -*- coding: utf-8 -*-
"""v3.309.0 收尾·A：v3254/v3255 破坏锚失效（负控制空转）——既有真缺陷，一并修。

实测根因：破坏锚写的是裸串 `'revision: null,'`，v3.305.0 在 `_memoryToolsAbsent()`
（index.js:14243）引入了**第二处**同形字面量 ⇒ 锚点命中 2 次 ⇒ `breakOnce` 按口径 ①
拒绝破坏 ⇒ 负控制整组失去证明力（红的是夹具，不是判据）。
修法：锚改用**唯一上下文形态**（带下一行 `historyFingerprint:` 与缩进），
并把「锚在真源码里恰中 1 次」这条自证改为对**新锚**计数。
"""
import os

ROOT = '/home/user/lonsha-memory-plugin'
T = os.path.join(ROOT, 'tests')

# ── v3254 ─────────────────────────────────────────────────────────────
p4 = os.path.join(T, 'v3254_cache_identity_and_workload.test.mjs')
s = open(p4, encoding='utf-8').read()

old_d9 = (
    "    /* 破坏点取 `revision: null,`（该字面量在入口里恰一处，且不出现在注释里）；\n"
    "       替换串拆成拼接，以免本档字面量自命中「被禁来源针」（否则判据纯度自证会假红）。 */\n"
    "    const FORBIDDEN = 'this.storage.' + 'getRevision(';\n"
    "    const brokenSrc = breakSource(ENTRY_SRC,\n"
    "        'revision: null,',\n"
    "        'revision: ' + FORBIDDEN + '),', 'D9-identity-source');\n")
assert s.count(old_d9) == 1, 'D9 块命中 %d' % s.count(old_d9)
new_d9 = (
    "    /* 破坏点：**唯一上下文形态**。\n"
    "     *   【v3.309.0 修·留痕】原文锚是裸串 `'revision: null,'`，并注明「该字面量在入口里恰一处」——\n"
    "     *   那在 v3.305.0 之后**已不成立**：`_memoryToolsAbsent()`（index.js 的回执面）引进了第二处同形\n"
    "     *   字面量 ⇒ 锚命中 2 次 ⇒ 工具按口径 ①（须恰中 1 次）**拒绝破坏** ⇒ 本条负控制整组空转\n"
    "     *   （红的是夹具，不是判据）。修法是让锚重新唯一，不是放宽工具口径。\n"
    "     *   替换串拆成拼接，以免本档字面量自命中「被禁来源针」（否则判据纯度自证会假红）。 */\n"
    "    const FORBIDDEN = 'this.storage.' + 'getRevision(';\n"
    "    const brokenSrc = breakSource(ENTRY_SRC,\n"
    "        REV_ANCHOR,\n"
    "        'revision: ' + FORBIDDEN + '),' + NL + '                    historyFingerprint:', 'D9-identity-source');\n")
s = s.replace(old_d9, new_d9)

old_d12 = ("    assert.equal(ENTRY_SRC.split('revision: null,').length - 1, 1,\n"
           "        '破坏锚在真源码里精确只准出现 1 次（命中多次 breakSource 会拒绝破坏）');\n")
assert s.count(old_d12) == 1, 'D12 块命中 %d' % s.count(old_d12)
new_d12 = ("    assert.equal(ENTRY_SRC.split(REV_ANCHOR).length - 1, 1,\n"
           "        '破坏锚在真源码里精确只准出现 1 次（命中多次 breakSource 会拒绝破坏）；'\n"
           "        + '★ v3.309.0 起锚是**上下文形态**：裸串 `revision: null,` 已因第二处同形字面量失去唯一性');\n")
s = s.replace(old_d12, new_d12)

# 定义 REV_ANCHOR（放在 FORBIDDEN 之前那一行附近：用 attr 定义区插在最前，避免顺序问题）
anchor_def = ("/* [v3.309.0] 破坏锚的**唯一上下文形态**：`_cacheIdentityOf()` 里 revision 位 + 下一行同缩进的\n"
              " *   historyFingerprint。裸串 `revision: null,` 在入口里已出现 2 次（第二处在回执面），\n"
              " *   拿它当锚会被工具按「须恰中 1 次」拒绝破坏（负控制空转）。 */\n"
              "const REV_ANCHOR = 'revision: null,' + '\\n' + '                    historyFingerprint:';\n")
s = s.replace("const ENTRY_SRC = read(ENTRY);\n", "const ENTRY_SRC = read(ENTRY);\n" + anchor_def, 1)
assert s.count('REV_ANCHOR') >= 3, 'REV_ANCHOR 接线数 %d' % s.count('REV_ANCHOR')
assert 'const NL' in s or 'NL =' in s, '需 NL 常量'
open(p4, 'w', encoding='utf-8').write(s)

# ── v3255 ─────────────────────────────────────────────────────────────
p5 = os.path.join(T, 'v3255_cache_identity_source.test.mjs')
s5 = open(p5, encoding='utf-8').read()
old = ("    const broken = breakSource(ENTRY_SRC, 'revision: null,', 'revision: ' + FORBIDDEN + '),', 'v3255-C1');\n")
assert s5.count(old) == 1, 'v3255 C1 命中 %d' % s5.count(old)
new = ("    /* [v3.309.0 修] 锚由裸串 `revision: null,` 改为**唯一上下文形态**：v3.305.0 的回执面\n"
       "     *   引进了第二处同形字面量 ⇒ 裸串命中 2 次 ⇒ 工具拒绝破坏 ⇒ 本条负控制空转。 */\n"
       "    const broken = breakSource(ENTRY_SRC, REV_ANCHOR,\n"
       "        'revision: ' + FORBIDDEN + '),' + NL + '                    historyFingerprint:', 'v3255-C1');\n")
s5 = s5.replace(old, new)
def5 = ("/* [v3.309.0] 破坏锚的唯一上下文形态（理由同 v3254 D9 留痕）。 */\n"
        "const REV_ANCHOR = 'revision: null,' + '\\n' + '                    historyFingerprint:';\n")
s5 = s5.replace("const ENTRY_SRC = read('index.js');\n", "const ENTRY_SRC = read('index.js');\n" + def5, 1)
assert s5.count('REV_ANCHOR') == 2, 'v3255 REV_ANCHOR 数 %d' % s5.count('REV_ANCHOR')
open(p5, 'w', encoding='utf-8').write(s5)
print('[patch3309d] OK：v3254/v3255 破坏锚改用唯一上下文形态')