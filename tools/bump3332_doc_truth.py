#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.332.0 README/PLAN/CHANGELOG 文档读数对齐（doc-truthfulness 全绿）。

依据 scan_doc_truthfulness.mjs 实测 11 处 RED（2026-10-15）与四档定向实测 74/74：
  D1  README 当前版本 3.331.0 → 3.332.0
  D2  README 在役面 312 → 313（1 处）
  D2b README 312 个测试文件 → 313（4 处：行 8/47/113/124）
  D5  PLAN 版本 3.331.0 → 3.332.0；在役面 312 → 313
  D6  README 待验标记 v3.331.0 → v3.332.0
  D9  CHANGELOG v3332「14 条」→「7 条」（磁盘 ^test( 实测 7）；
      「v3330(28)/v3331(26) 合计 68/68」→「v3305(13)/v3330(28)/v3331(26) 合计 74/74」
      （四档 node --test 实测 ℹ tests 74 / pass 74；首版 68/68 是 v3332 误记 14 条时代口径）；
      补「退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移」声明
"""
import io

ROOT = '/home/user/lonsha-memory-plugin/'


def sub(p, pairs):
    t = io.open(p, encoding='utf-8').read()
    for old, new, cnt in pairs:
        n = t.count(old)
        if n != cnt:
            if n == 0 and t.count(new) >= 1:
                print('SKIP(已应用)', p.split('/')[-1], repr(old[:40]))
                continue
            raise SystemExit('FAIL %s: %r 命中 %d 次(期望 %d)' % (p, old[:60], n, cnt))
        t = t.replace(old, new)
    io.open(p, 'w', encoding='utf-8').write(t)
    print('OK', p.split('/')[-1], '(%d 对)' % len(pairs))


# ---- README：D1 + D2 + D2b + D6 ----
sub(ROOT + 'README.md', [
    ('**当前版本**：`3.331.0`', '**当前版本**：`3.332.0`', 1),
    ('312 个测试文件', '313 个测试文件', 4),
    ('当前版本 v3.331.0 **全量待验**', '当前版本 v3.332.0 **全量待验**', 1),
    # 行10 还有裸「v3.331.0 **全量待验**」形态外的残留检查在 must 阶段做
])

# ---- PLAN：D5 ----
sub(ROOT + 'PLAN.md', [
    ('| 版本 | **v3.331.0**', '| 版本 | **v3.332.0**', 1),
    ('在役面 **312 测试文件', '在役面 **313 测试文件', 1),
])

# ---- CHANGELOG：D9（v3.332.0 当前节）----
sub(ROOT + 'CHANGELOG.md', [
    ('`tests/v3332_m4o4_async_query.test.mjs`(**14 条**)',
     '`tests/v3332_m4o4_async_query.test.mjs`(**7 条**)', 1),
    ('与 v3330(28)/v3331(26) 合计定向 **68/68** 全绿',
     '与 v3305(13)/v3330(28)/v3331(26) 合计定向 **74/74** 全绿(node --test 四档实跑)', 1),
    ('仅改异步版行文恢复锚点唯一性。★ **诚实边界**:',
     '仅改异步版行文恢复锚点唯一性。· 退出码三档:0 卫生 / 1 真缺陷 / 2 结构漂移(本仓扫描器契约:exit 1 = 文档/读数与磁盘不一致,exit 2 = 探测器找不到锚点或结构塌陷)。★ **诚实边界**:', 1),
])

print('DONE 文档读数对齐')