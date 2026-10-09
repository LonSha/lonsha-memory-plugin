#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.298.0 补丁 C · 抬版连带的两处（凡申请者与门禁同源）。

① `tests/v3296_x1_evidence_query.test.mjs` 的 extra_js 数量锁 85 → 86（本版新增 injection-receipt.js）。
   形态与 `v3209` 同一类：**抬版时新增 extra_js 模块必须同步的锁**，首轮 bump3298 只改了 v3209 两处。
② 状态报告（M-O9 的生成臂产物 `tests/audit/state-report.json`）随盘面重生成 —— 本版动了
   版本 / extra_js / 测试文件数，报告必须与现场同源；生成后由 `v3297` 的对账判据把守。
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
_log = []


class Doc(object):
    def __init__(self, rel):
        self.rel = rel
        self.p = ROOT / rel
        self.s = self.p.read_text(encoding='utf-8')
        self.dirty = False

    def sub(self, old, new, why):
        n = self.s.count(old)
        if n != 1:
            sys.exit('[patch3298c] %s 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点=%r'
                     % (self.rel, n, why, old[:160]))
        if old == new:
            sys.exit('[patch3298c] %s 同值替换等于没改：%s' % (self.rel, why))
        self.s = self.s.replace(old, new, 1)
        self.dirty = True
        _log.append((self.rel, why))

    def write(self):
        if self.dirty:
            self.p.write_text(self.s, encoding='utf-8')


D = Doc('tests/v3296_x1_evidence_query.test.mjs')
D.sub("""    assert.equal(MF.extra_js.length, 85, 'extra_js 数量锁：v3.296.0 X1 新增 evidence-query.js ⇒ 85 项，实 ' + MF.extra_js.length);""",
      """    assert.equal(MF.extra_js.length, 86, 'extra_js 数量锁：v3.296.0 X1 新增 evidence-query.js ⇒ 85 项；'
        + 'v3.298.0 M-O3 新增 injection-receipt.js ⇒ 86 项，实 ' + MF.extra_js.length);""",
      'v3296 的数量锁随抬版上抬（85 → 86）')
D.write()

# ② 状态报告重生成（M-O9 生成臂）
r = subprocess.run(['node', 'tools/gen_state_report.mjs', '--write'],
                   cwd=str(ROOT), capture_output=True, text=True, timeout=600)
print('[patch3298c] gen_state_report --write rc=%d' % r.returncode)
if r.stdout.strip():
    print(r.stdout.strip()[:600])
if r.returncode != 0:
    print(r.stderr.strip()[:2000])
    sys.exit(1)

for rel, why in _log:
    print('[patch3298c] %-46s %s' % (rel, why))
print('[patch3298c] 完成。')