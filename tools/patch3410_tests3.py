#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.341.0 补丁三：v3360 A1 的 want 词表整体重建为**排序后真值**。

病根：补丁二只替换了 want 数组的后两行，`const want = [` 那一行（含前 7 项）
原样留下 ⇒ 预期串里同一批键出现两次。本脚本按**行区间**整块重写。
"""
import io

ROOT = '/home/user/lonsha-memory-plugin/'
SA = io.open(ROOT + 'story-annual.js', encoding='utf-8').read()
api_at = SA.index('    const api = Object.freeze({')
api_end = SA.index('});', api_at)
names = []
for line in SA[api_at:api_end].split('\n')[1:]:
    for x in line.split('//')[0].replace('{', '').replace('}', '').split(','):
        x = x.strip()
        if x and ':' not in x and x != 'Object.freeze(':
            names.append(x)
names = sorted(set(names))
print('真源导出 %d 项' % len(names))

BLOCK = ("/* [v3.341.0 · M4-X2] 词表按**排序后真值**逐字对账"
         "（既有 31 项在场，新增成稿面 14 项）。 */\n"
         "    const want = [\n"
         + '\n'.join("        '%s'," % n for n in names) + "\n    ];")


def rebuild(rel, start_lit, end_lit, decl):
    p = ROOT + rel
    t = io.open(p, encoding='utf-8').read()
    i = t.index(start_lit)
    j = t.index(end_lit, i) + len(end_lit)
    t = t[:i] + decl + t[j:]
    io.open(p, 'w', encoding='utf-8').write(t)
    print('OK', rel)


# v3360：want 声明从 `    const want = [` 起到闭合 `];` 止整块换掉
rebuild('tests/v3360_m4o9_knowledge_gate.test.mjs',
        '    const want = [', '];',
        BLOCK)

# v3327：saWant 声明从 `    const saWant = [` 起到闭合 `];` 止整块换掉
BLOCK2 = ("/* [v3.341.0 · M4-X2] 同上，按排序后真值重建。 */\n"
          "    const saWant = [\n"
          + '\n'.join("        '%s'," % n for n in names) + "\n    ];")
rebuild('tests/v3327_e_pack_lore_annual.test.mjs',
        '    const saWant = [', '];',
        BLOCK2)
print('DONE')