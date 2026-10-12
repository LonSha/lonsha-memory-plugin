#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch_b_o6_fix1.py — [v3.321.0 · B 包 M3-O6 自伤修复 ①]

【缺陷】账条件里**全是登记表里没有的 id** 时，扫描面收窄会把九账全部跳过
  （only 集合与真实登记表交集为空），于是 counts.ok=0、total=0
  ⇒ memory-center 的 viewOfOf 第①条 `scan-surface-absent` 抢先命中，
  把「用户点错了一个账名」报成「九账全取不到」——两态处置相反（前者改条件、
  后者查装载），压成一态即缺陷。v3310 C1/K2 正是这么翻红的。

【修法（改接法，不改门禁）】only 集合与**真实登记表**求交：
  · 交集非空 ⇒ 只扫这些账（收窄生效，未知账名仍由 ④ unknown-ledger 报）；
  · 交集为空 ⇒ only 置 null **退回全扫**（口径与修前逐字一致）。
  为什么这是对的而不是「绕过判据」：收窄的目的是「别扫用户没要的账」，
  而当用户点的账**一本都不存在**时，「不扫任何账」不是用户要的语义 ——
  那时该走的是「点错了账名」这条既有判定，全扫正是修前的既有行为。
"""
import io
import sys

P = '/home/user/lonsha-memory-plugin/evidence-query.js'
src = io.open(P, encoding='utf-8').read()

A = """        const only = (o.onlyLedgers instanceof Set) ? o.onlyLedgers
            : (Array.isArray(o.onlyLedgers)
                ? new Set(o.onlyLedgers.map((x) => text(x, 40)))
                : null);"""
B = """        const onlyRaw = (o.onlyLedgers instanceof Set) ? o.onlyLedgers
            : (Array.isArray(o.onlyLedgers)
                ? new Set(o.onlyLedgers.map((x) => text(x, 40)))
                : null);
        /* [v3.321.0 · M3-O6 自伤修复 ①] 收窄面与**真实登记表**求交：交集为空 ⇒ 退回全扫。
         *   修前（本版首跑）：条件里全是登记表里没有的 id 时，九账会被全部跳过 ⇒
         *   `counts.ok=0 && total=0` ⇒ 上层把它读成「扫描面为空（九账全取不到）」，
         *   而用户其实只是**点错了一个账名** —— 两态处置相反（改条件 vs 查装载），
         *   压成一态即缺陷（v3310 C1/K2 实测翻红）。
         *   为什么退回全扫是对的：收窄的语义是「别扫用户没要的账」；
         *   当用户点的账一本都不存在时，「一本都不扫」不是他要的语义，
         *   而「点错了账名」自有既有判定（unknown-ledger）负责 —— 那需要扫描面在场。 */
        const _knownIds = new Set();
        for (const _sp of specs) _knownIds.add(text(_sp && _sp.id, 40));
        let _onlyHit = false;
        if (onlyRaw) for (const _id of onlyRaw) if (_knownIds.has(_id)) { _onlyHit = true; break; }
        const only = (onlyRaw && _onlyHit) ? onlyRaw : null;"""

if src.count(A) != 1:
    raise SystemExit('[o6-fix1] 锚点命中 %d 次（期望 1），未写盘' % src.count(A))
out = src.replace(A, B, 1)

if '--dry' in sys.argv:
    print('[o6-fix1] DRY：锚点唯一命中，未写盘')
    raise SystemExit(0)
io.open(P, 'w', encoding='utf-8', newline='\n').write(out)
print('[o6-fix1] wrote evidence-query.js')