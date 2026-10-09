#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.299.0 抬版连带**第二批**：定向复验抓到的两处漏网（都是「抬版连带没扫干净」）。

★ 为什么要单独一批、且写清楚：这两处**都不是** bump3299 的锚点错了，而是
  **全仓还有别的档在锁 extra_js 总项数 / 现行版本号**，而 bump3299 的清单里没有它们。
  首轮跑 `node tests/run.mjs v3299 v3298 v3209 v3247 v3296 v3159` 才暴露：
    ① `tests/v3296_x1_evidence_query.test.mjs:492` 硬锁 `MF.extra_js.length === 86`
       ⇒ 本版 +1 模块后当场红。处置与 v3298 同款：**交棒给当版**（历史档只判「自己那一项在场」），
       不再锁总项数 —— 否则每加一个模块都要回头改每一份历史档（抬版仪式）。
    ② `PLAN.md:3` 的「当前执行状态（2026-10-09，v3.298.0）」是 `scan_plan_currency.mjs`
       巡逻的**现行口径行**，bump3299 只改了 PLAN 的「现状基线表」，漏了这一行。
   教训（写进本脚本头）：抬版连带**不能只按「上一版权脚本的锚点清单」抄** ——
   上一版没新增模块，所以它没暴露「还有别人锁总项数」这一面。新模块必须全仓扫一遍。
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
NEW = '3.299.0'
_log = []


class Doc:
    def __init__(self, rel):
        self.rel = rel
        self.p = ROOT / rel
        self.s = self.p.read_text(encoding='utf-8')
        self.dirty = False

    def sub(self, old, new, why):
        n = self.s.count(old)
        if n != 1:
            sys.exit('[patch3299b] %s 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点=%r'
                     % (self.rel, n, why, old[:200]))
        if old == new:
            sys.exit('[patch3299b] %s 同值替换等于没改：%s' % (self.rel, why))
        self.s = self.s.replace(old, new, 1)
        self.dirty = True
        _log.append((self.rel, why))

    def write(self):
        if self.dirty:
            self.p.write_text(self.s, encoding='utf-8')


# ── ① v3296：交棒掉总项数硬锁（保留「自己那一项在场」的判据）──
D = {rel: Doc(rel) for rel in ['tests/v3296_x1_evidence_query.test.mjs', 'PLAN.md']}
D['tests/v3296_x1_evidence_query.test.mjs'].sub(
    "    assert.equal(MF.extra_js.length, 86, 'extra_js 数量锁：v3.296.0 X1 新增 evidence-query.js ⇒ 85 项；'\n"
    "        + 'v3.298.0 M-O3 新增 injection-receipt.js ⇒ 86 项，实 ' + MF.extra_js.length);",
    "    /* [v3.299.0] 总项数锁**交棒给当版**：本档只判「自己登记的那一项在场且恰一次」，\n"
    "     *   不再锁总项数 —— 否则每加一个模块都要回头改历史档（本仓定性过的抬版仪式）。\n"
    "     *   项数锁本身仍由当版（v3299）与 v3209 两处共同把守，覆盖面不减。 */\n"
    "    assert.equal(MF.extra_js.filter((x) => x === 'evidence-query.js').length, 1,\n"
    "        'evidence-query.js 始终恰登记一次，实 ' + MF.extra_js.filter((x) => x === 'evidence-query.js').length);",
    'v3296 去掉总项数硬锁（交棒给当版）')

# ── ② PLAN 的「当前执行状态」行：现行口径必须跟版本 ──
D['PLAN.md'].sub(
    '> **当前执行状态（2026-10-09，v3.298.0）**：',
    '> **当前执行状态（2026-10-09，v3.299.0）**：',
    'PLAN 当前执行状态行的版本（scan_plan_currency 巡逻的现行口径行）')

for rel, d in D.items():
    d.write()
print('[patch3299b] 完成：%d 项替换' % len(_log))
for rel, why in _log:
    print('  · %-44s %s' % (rel, why))

# ── ③ 立即自证：两个巡逻器必须转绿（不实跑全量，只跑这两只）──
for script in ('tests/audit/scan_plan_currency.mjs', 'tests/audit/scan_version_guard.mjs'):
    r = subprocess.run(['node', script], cwd=ROOT, capture_output=True, text=True, timeout=180)
    print('\n[%s] exit=%d' % (script, r.returncode))
    print((r.stdout or '').strip()[-400:])
    if r.returncode != 0:
        sys.exit('[patch3299b] 自证失败：%s' % script)