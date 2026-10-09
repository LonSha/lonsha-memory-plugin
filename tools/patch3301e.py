#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch3301e.py — 让「模块接线面」扫描器认识本刀新增的**惰性取库形态**。

【为什么必须改（真缺陷，不是整洁性偏好）】
  本刀把七个 `window.LonShaX?.Y` 直取点改成 `this._winModule('LonShaX','Y')` 之后，
  `tests/audit/scan_module_wiring.mjs` 的消费面**只认 `window.LonShaXxx` 文本**，
  于是 B4 当场把三个真接线报成「已挂载但零消费」：
      LonShaStmLtm / LonShaUnifiedRecall / LonShaApiChannels
  这正是该扫描器自己文档里点名的**假红**形态（「消费面只认入口一个文件 ⇒ 每一刀都会把
  真接线误报成零消费」/「判据量错了对象」）。取库形态变了，消费面必须跟着认第二种形态。

【修法（最小面）】
  在 referenced 抽取里**补一条形态**：`_winModule('LonShaX'`（含 `('LonShaX', 'Y'` 两参形式）。
  与既有 `window.LonShaX` 抽取并列、同一集合 —— 两条形态都算真消费，不是放宽判定。

【替换锚点（各恰中 1 次；先校验后统一写盘）】
"""
import io
import sys

PATH = 'tests/audit/scan_module_wiring.mjs'

OLD = """const referenced = new Set();
for (const m of consumptionCode.matchAll(/\\bwindow\\s*\\.\\s*(LonSha[A-Za-z0-9_]*)/g)) referenced.add(m[1]);"""

NEW = """const referenced = new Set();
for (const m of consumptionCode.matchAll(/\\bwindow\\s*\\.\\s*(LonSha[A-Za-z0-9_]*)/g)) referenced.add(m[1]);
/* [v3.301.0 M-O2 第二刀] 消费面必须认**第二种取库形态**：`this._winModule('LonShaX','Y')`。
 *   本刀把七个「构造期直取 window」的点改为惰性取库（构造期读不到、重建期读得到），
 *   若消费面只认 `window.LonShaX` 文本，这三个**真接线**会被 B4 当场误报成「已挂载但零消费」
 *   —— 正是本文件开头点名的假红（「判据量错了对象」）。两条形态都算真消费，非放宽判定。 */
for (const m of consumptionCode.matchAll(/\\b_winModule\\(\\s*['"](LonSha[A-Za-z0-9_]*)['"]/g)) referenced.add(m[1]);"""


def main():
    src = io.open(PATH, encoding='utf-8').read()
    n = src.count(OLD)
    if n != 1:
        print('[FAIL] 锚点命中 %d 次（要求恰好 1 次）' % n)
        return 2
    src = src.replace(OLD, NEW)
    io.open(PATH, 'w', encoding='utf-8').write(src)
    print('[OK] scan_module_wiring：消费面补认 _winModule 惰性取库形态')
    return 0


if __name__ == '__main__':
    sys.exit(main())