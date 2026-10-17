#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.345.0 M4-X7 收口补丁二:宿主候选装配面保住**三态不塌**。

为什么必须补(与 M4-X6 C6「缺省取数」同族的功能级失效):
  `_returnGateCandidates(opts)` 原文是
      `if (Array.isArray(o.candidates)) return { candidates: o.candidates, source: 'given' };`
  —— 于是「显式给了候选但**给错**(如字符串)」落到下一行去问 fated-recall,
  再落成 `{ candidates: [], source: 'no-fated' }`:畸形输入与「根本没给」**完全同形**。
  内核明明把这两态分得很清(malformedInput / judged:false),却在**宿主这一层被抹平**:
  下游读到的都是「这一次没有候选」,查不出「调用方把候选喂错了」。
  修法:显式给了(哪怕给错)⇒ **原样透传**,让内核按自己的判据报畸形(不越权替内核裁定)。

幂等:锚点须恰中 1 次;已含签名则整段跳过。
用法:python3 tools/patch3445_hostsource.py [--check]
"""
import io
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
TARGET = ROOT + 'index.js'

ANCHOR = "            if (Array.isArray(o.candidates)) return { candidates: o.candidates, source: 'given' };\n"
SIG = "            if (o.candidates !== undefined && o.candidates !== null) return { candidates: o.candidates, source: 'given' };\n"
REPL = (
    "            /* ★ [v3.345.0 · M4-X7] 三态不可塌:显式给了(哪怕给错)⇒ **原样透传**给内核判畸形,\n"
    "             *   绝不回落 fated-recall —— 否则「给了畸形候选」与「没给候选」在宿主这一层同形,\n"
    "             *   下游一律读到「这一次没有候选」,查不出「调用方把候选喂错了」。\n"
    "             *   内核已有 malformedInput / judged:false 两态判据,宿主不该替它裁定。 */\n"
    + SIG
)


def main():
    src = io.open(TARGET, encoding='utf-8').read()
    if SIG in src:
        print('IN-SYNC index.js(宿主候选装配面已修,零改写)')
        return
    n = src.count(ANCHOR)
    if n != 1:
        sys.stderr.write('FAIL: 锚点命中 %d 次(应 1)\n' % n)
        sys.exit(1)
    out = src.replace(ANCHOR, REPL, 1)
    if out == src:
        sys.stderr.write('FAIL: 替换未改变源码\n')
        sys.exit(1)
    if '--check' in sys.argv:
        sys.stderr.write('FAIL: 补丁未打(check 模式不写盘)\n')
        sys.exit(1)
    io.open(TARGET, 'w', encoding='utf-8').write(out)
    print('PATCHED index.js: %d -> %d bytes' % (len(src), len(out)))


if __name__ == '__main__':
    main()