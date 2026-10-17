#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.342.0 M4-X3 宿主刀修正 2（生成脚本侧）。

【修的是哪一处真缺口（C2 实测暴露，不是判据放宽）】
  持久凭据 `_canonAdoption` 修前只记 `{adoptionId, verdict, packId, volumeId, revokeScope, at}`。
  于是**重启后**重复确认虽然认得出来（duplicate:true），**回执里的 `applied` 恒为 0** ——
  「上次这一次落了几条」这条读数活得不过分界。C2 的判据正是「重启后回执不是 duplicate
  且带原 applied ⇒ 红」，实测红：`{"applied":0,"reason":"duplicate"}`。
  修法：凭据把 `applied` 一起带走；回执的取值链补上「凭据里的条数」这一环
  （内存 seen 命中时用 seen，否则退回凭据，两者都没有才 0）。

  这不是把判据放松，而是「幂等回执要如实报原读数」这条本身该成立：
  回执报 0 条会让调用方以为上次什么都没落。
"""
import io
import sys
P = '/home/user/lonsha-memory-plugin/tools/patch3420_host.py'
s = io.open(P, encoding='utf-8').read()
if 'applied: (this._canonAdoption && this._canonAdoption.applied) || 0,' in s:
    sys.stderr.write('FAIL: patch3420_host.py 已修过（拒绝重跑）\n')
    sys.exit(1)
def sub1(text, a, b, label):
    n = text.count(a)
    assert n == 1, '%s 锚点命中 %d 次（须 1）：%r' % (label, n, a[:90])
    return text.replace(a, b, 1)

# ── 修 A：回执取值链补「凭据里的条数」这一环（重启后才报得出原 applied） ──
s = sub1(s,
  """                    const got = seen[adoptionId] || { applied: 0, at: (this._canonAdoption && this._canonAdoption.at) || null };""",
  """                    /* \u2605 取值链：内存 seen \u2192 持久凭据 \u2192 0。少了中间那一环，**重启后**回执的
                     *   `applied` 恒为 0（认得出来是重复，却报\u300c上次落了 0 条\u300d）。 */
                    const got = seen[adoptionId] || {
                        applied: (this._canonAdoption && this._canonAdoption.applied) || 0,
                        at: (this._canonAdoption && this._canonAdoption.at) || null,
                    };""",
  '修 A：回执取值链')

# ── 修 B：真落笔时凭据把 applied 一起带走 ──
s = sub1(s,
  """                    this._canonAdoption = {
                        adoptionId: adoptionId, verdict: plan.verdict || '', packId: plan.pack.packId,
                        volumeId: plan.pack.volumeId || null, revokeScope: brief.revokeScope || null, at: Date.now(),
                    };""",
  """                    this._canonAdoption = {
                        adoptionId: adoptionId, verdict: plan.verdict || '', packId: plan.pack.packId,
                        volumeId: plan.pack.volumeId || null, revokeScope: brief.revokeScope || null,
                        /* \u2605 条数随凭据落盘：「上次落了几条」须活得过分界（重启后回执如实报原读数）。 */
                        applied: Number(receipt.applied) || 0, at: Date.now(),
                    };""",
  '修 B：凭据带 applied')
io.open(P, 'w', encoding='utf-8').write(s)
print('patch3420_host.py 已修 2：%d 行' % (s.count('\n') + 1))