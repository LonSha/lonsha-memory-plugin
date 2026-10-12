#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch_b_o1_fix1.py — [v3.321.0 · B 包 M3-O1 自伤修复 ①]

【缺陷】接线时给 fuseCandidates 传了 `budget: vectorTopK * 2`（默认 10）。
  `fuseCandidates` 里 budget 会**真截断** `finalMerged` —— 而 M3-O1 的增量是
  「名次更贴合当前剧情」，不是「注入更少内容」。截断会让召回条目**真的消失**
  （下游 `_finalize` 的审计、精排段读的都是同一个数组），
  这是「用少给内容换排序好看」，方向反了。

【修法】接线不传 budget（不截断）。`fuseCandidates` 保留 budget 能力
  （显式给了才生效、且被截必计数），但宿主不启用它。
  理由：注入预算的 owner 是既有注入面（它有自己的截断与账），
  召回侧再截一次就是**第二个预算真源**，两处迟早不一致。
"""
import io
import sys

P = '/home/user/lonsha-memory-plugin/index.js'
src = io.open(P, encoding='utf-8').read()

A = """                    const _fused = this.unifiedRecall.fuseCandidates(finalMerged, {
                        queryText: query.text,
                        budget: Math.max(1, (Number(this.config.config.vectorTopK) || 5) * 2)
                    }, this._fusionCarry);"""
B = """                    /* 刻意**不传 budget**：注入预算的 owner 是既有注入面（它有自己的截断与账），
                     *   召回侧再截一次就是第二个预算真源。本面只改名次、不改条目数。 */
                    const _fused = this.unifiedRecall.fuseCandidates(finalMerged, {
                        queryText: query.text
                    }, this._fusionCarry);"""

if src.count(A) != 1:
    raise SystemExit('[o1-fix1] 锚点命中 %d 次（期望 1），未写盘' % src.count(A))
out = src.replace(A, B, 1)

if '--dry' in sys.argv:
    print('[o1-fix1] DRY：锚点唯一命中，未写盘')
    raise SystemExit(0)
io.open(P, 'w', encoding='utf-8', newline='\n').write(out)
print('[o1-fix1] wrote index.js')