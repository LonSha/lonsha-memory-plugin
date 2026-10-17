#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.346.0 M4-X8 宿主接线:index.js 三处落点(**与 M4-X7 同规格:现场实测只有三处**)。

  1 取库口 `_materialPackLib()`(紧随 `_returnGateLib()` 之后,格式同族)
  2 宿主面三法(_materialInventory / materialPack / _materialPackLine)
     紧随 M4-X7 的 `_returnGateLine()` 收口之后
  3 自检行(紧随「控频闸」那一格之后)

★ 为什么**没有**「退路类补 method」与「导出面登记」两处(与 M4-X7 实测一致):
  X7 落盘时同样没动这两处 —— 本仓的 M4-X? 面走的是**类方法直接可达**(宿主实例),
  已有 testimonialBoard / narrativeLayer / returnGate / perspectiveCard 各面
  全仓检索均无独立退路声明、无面注册表登记项。凭「别处有」而在此新造两处,
  等于**凭空加约束**(会被「面注册表须与实际一致」类门禁打回)。
  故本补丁**按现场实测**只落三处,不凭先例生造。

每处锚点必须恰中 1 次;已含签名则整段跳过(幂等)。落盘前整份备份。
用法:python3 tools/patch3455_host.py [--check]
"""
import io
import os
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3455/'
TARGET = ROOT + 'index.js'
FRAG = ROOT + 'tools/frag3455/'
CHECKS = []


def frag(name):
    return io.open(FRAG + name, encoding='utf-8').read()


def patch(src, anchor, repl, label):
    if repl in src:
        print('   skip %s(已打过)' % label)
        return src
    n = src.count(anchor)
    if n != 1:
        CHECKS.append('FAIL %s:锚点命中 %d 次(应 1)' % (label, n))
        return src
    out = src.replace(anchor, repl, 1)
    if out == src:
        CHECKS.append('FAIL %s:替换未改变源码' % label)
        return src
    print('   ok %s' % label)
    return out


def main():
    src = io.open(TARGET, encoding='utf-8').read()
    orig = src

    # ── 1 取库口 ────────────────────────────────────────────────────────
    a1 = ("    function _returnGateLib() {\n"
          "        return _moduleLib(() => window.LonShaReturnGate, 'return-gate.js');\n"
          "    }\n")
    src = patch(src, a1, a1 + frag('host_lib.txt'), '1 取库口 _materialPackLib')

    # ── 2 宿主面三法(紧随 _returnGateLine 收口) ─────────────────────────
    a2 = ("        _returnGateLine() {\n"
          "            try {\n"
          "                const RG = _returnGateLib();\n"
          "                if (!RG || typeof RG.line !== 'function') return '模块未加载(return-gate.js)';\n"
          "                const got = this.returnGate({});\n"
          "                if (!got.ok) return '控频闸不可用(' + got.reason + ')';\n"
          "                return RG.line(got);\n"
          "            } catch (e) { errLog(e, 'engine._returnGateLine'); return '—(诊断异常)'; }\n"
          "        }\n")
    src = patch(src, a2, a2 + frag('host_block.txt'), '2 宿主面三法')

    # ── 3 自检行(紧随控频闸那一格) ─────────────────────────────────────
    a3 = ("                            return ['控频闸', tag + ' ' + RG.line(got) + (bad ? ' ⚠️' : '')];\n"
          "                        } catch (e) { errLog(e, 'selfCheck.returnGate'); return ['控频闸', '—(诊断异常)'];\n"
          "                        }\n"
          "                    })(),\n")
    src = patch(src, a3, a3 + frag('host_selfcheck.txt'), '3 自检行')

    if CHECKS:
        for c in CHECKS:
            sys.stderr.write(c + '\n')
        sys.exit(1)
    if src == orig:
        print('IN-SYNC index.js(三处落点已打过)')
        return
    if '--check' in sys.argv:
        sys.stderr.write('FAIL: 补丁未打(check 模式不写盘)\n')
        sys.exit(1)
    os.makedirs(BAK, exist_ok=True)
    io.open(BAK + 'index.js.pre3455host', 'w', encoding='utf-8').write(orig)
    io.open(TARGET, 'w', encoding='utf-8').write(src)
    print('PATCHED index.js: %d -> %d bytes' % (len(orig), len(src)))


if __name__ == '__main__':
    main()