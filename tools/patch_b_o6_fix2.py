#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch_b_o6_fix2.py - [v3.321.0 · B 包 M3-O6 自伤修复 ②]

自伤现象（成对套件 v3321 C3 首跑抓到）：宿主传一个空缓存对象 `{}` 时，
  `coverage.projectionCache.enabled` 恒为 **false**、缓存永远不写入 ——
  也就是说「宿主还没建缓存」这一态**永远进不去缓存路径**，M3-O6 的
  「按 revision 缓存可复用投影」在真实宿主首跑时等于没接。

根因：判定写成
    `o.projectionCache && typeof … === 'object' && Number(o.projectionCache.version) === PROJECTION_CACHE_VERSION`
  —— `version` 缺失（宿主刚 new 的空对象）与 `version` 不匹配（旧格式）**落进同一个 false**，
  于是「还没建」与「格式已作废」**同形**。两者处置相反：
    前者应当**当场建立并开始用**；后者应当**作废并明说旧缓存被丢弃**。
  （本仓点名的形态：两个含义相反的态压成一个读数。）

修法：拆成三态并各自可归因 ——
    · 未给缓存（null / 非对象）        ⇒ cache=null, state='off'
    · 给了、无 version 或 version 相同 ⇒ cache=该对象（当场可用）
    · 给了、version 存在且不同         ⇒ cache=null, state='stale'（**作废必须说出来**）
  读数 `coverage.projectionCache` 增 `state` 与 `stale` 两列（旧列一个不动）。
"""
import io
import sys

P = 'evidence-query.js'
src = io.open(P, encoding='utf-8').read()
lines = src.split('\n')


def only(pred, label):
    hits = [i for i, l in enumerate(lines) if pred(l, i)]
    if len(hits) != 1:
        sys.exit('[o6fix2] anchor %s hit %d (expect 1)' % (label, len(hits)))
    return hits[0]


def eqline(sub):
    return lambda l, i: l.strip() == sub


def has(sub):
    return lambda l, i: sub in l


i_a = only(eqline("const cache = (o.projectionCache && typeof o.projectionCache === 'object'"), 'cache-l1')
if "Number(o.projectionCache.version) === PROJECTION_CACHE_VERSION) ? o.projectionCache : null;" not in lines[i_a + 1]:
    sys.exit('[o6fix2] cache 判定第二行不匹配：%r' % lines[i_a + 1])
i_ret = only(has('cache: { version: PROJECTION_CACHE_VERSION, enabled: !!cache, hits: cacheHits, misses: cacheMisses }'), 'cache-readout')
i_fb = only(has('projectionCache: uni.cache || { version: PROJECTION_CACHE_VERSION, enabled: false, hits: 0, misses: 0 }'), 'cache-fallback')

NEW_CACHE = [
    '        /* 缓存三态（**含义相反的态不得压成一个读数**）：',
    '         *   · 未给          ⇒ cache=null / state=''off''',
    '         *   · 给了、无 version 或 version 相同 ⇒ 当场可用（宿主刚 new 的空对象走这条）',
    '         *   · 给了、version 存在且不同       ⇒ **作废**（旧格式缓存必须明说被丢，不能静默当没有）',
    '         *   修前三条压成「enabled:false」一个读数：宿主首跑的空对象与旧格式同形，',
    '         *   于是「还没建缓存」永远进不去缓存路径（M3-O6 的复用等于没接）。 */',
    '        const _pcRaw = (o.projectionCache && typeof o.projectionCache === \'object\') ? o.projectionCache : null;',
    '        const _pcVer = _pcRaw ? Number(_pcRaw.version) : null;',
    '        const _pcStale = !!_pcRaw && _pcVer !== null && Number.isFinite(_pcVer)',
    '            && _pcVer !== PROJECTION_CACHE_VERSION;',
    '        const cache = (_pcRaw && !_pcStale) ? _pcRaw : null;',
]
NEW_READOUT = [
    '            cache: {',
    '                version: PROJECTION_CACHE_VERSION, enabled: !!cache, hits: cacheHits, misses: cacheMisses,',
    '                state: !_pcRaw ? \'off\' : (_pcStale ? \'stale\' : \'on\'),',
    '                stale: _pcStale',
    '            }',
]
NEW_FB = [
    '                projectionCache: uni.cache || { version: PROJECTION_CACHE_VERSION, enabled: false, hits: 0, misses: 0, state: \'off\', stale: false }',
]

ops = [
    (i_a, i_a + 2, NEW_CACHE),
    (i_ret, i_ret + 1, NEW_READOUT),
    (i_fb, i_fb + 1, NEW_FB),
]
ops.sort(key=lambda x: x[0])
for a, b in zip(ops, ops[1:]):
    if a[1] > b[0]:
        sys.exit('[o6fix2] ops overlap %r %r' % (a, b))
for start, end, new in sorted(ops, key=lambda x: -x[0]):
    lines[start:end] = new

out = '\n'.join(lines)
if not out.endswith('\n'):
    out += '\n'
for mark in ['_pcStale', "_pcRaw ? 'off'", 'stale: _pcStale']:
    if mark not in out:
        sys.exit('[o6fix2] self-check missing: %s' % mark)
if out.count('const cache = (o.projectionCache && typeof o.projectionCache') != 0:
    sys.exit('[o6fix2] 旧判定仍残留')
io.open(P, 'w', encoding='utf-8').write(out)
print('[o6fix2] wrote %s lines %d -> %d' % (P, len(src.split('\n')), len(out.split('\n'))))