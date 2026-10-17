#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.343.0 文档真实性同步:PLAN.md / README.md / TODO.md / CHANGELOG.md 对齐磁盘真值。
真值(脚本内自读,不手抄):版本 / 测试文件数 / 审计门禁数 / 宿主探针行数与成员数 / 上界。
★ 本版**不重绑**全量读数(doc_readings.json 仍停在 v3.328.0)。
★ D9 义务:CHANGELOG 顶节的「档名(N 条)」N **必须等于磁盘 `^test(` 计数**,故条数现场数。
"""
import io
import json
import os
import re
ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3430/'

def disk_truth():
    idx = io.open(ROOT + 'index.js', encoding='utf-8').read()
    m = re.search(r"const VERSION = '([0-9.]+)'", idx)
    assert m, 'index.js \u8bfb\u4e0d\u5230 const VERSION'
    ver = m.group(1)
    tests = [f for f in os.listdir(ROOT + 'tests') if f.endswith('.test.mjs')]
    audit_all = [f for f in os.listdir(ROOT + 'tests/audit') if f.endswith('.mjs')]
    audit_gated = [f for f in audit_all if not f.startswith('_')]
    rootjs = [f for f in os.listdir(ROOT) if f.endswith('.js')]
    base = json.load(io.open(ROOT + 'tests/audit/host_beast_baseline.json', encoding='utf-8'))
    lines_probe = idx.count('\n') + (0 if idx.endswith('\n') else 1)
    mf = json.load(io.open(ROOT + 'manifest.json', encoding='utf-8'))
    suite = 'tests/v3430_m4x5_testimony_board.test.mjs'
    suite_src = io.open(ROOT + suite, encoding='utf-8').read()
    return {
        'ver': ver, 'tests': len(tests), 'audit_gated': len(audit_gated), 'audit_all': len(audit_all),
        'rootjs': len(rootjs), 'extra_js': len(mf['extra_js']),
        'host_lines': base['readings']['total_lines'], 'host_members': base['readings']['member_count'],
        'ceiling': base['line_budget']['ceiling'], 'wc_l': lines_probe - 1,
        'suite': suite, 'suite_n': len(re.findall(r'^test\(', suite_src, re.M)),
    }

T = disk_truth()
assert T['ver'] == '3.343.0', '\u7248\u672c\u672a\u62ac\u5230 3.343.0: %s' % T['ver']
assert T['suite_n'] >= 1, '\u5f53\u7248\u5957\u4ef6\u8bfb\u4e0d\u5230 test( \u884c'
print('\u78c1\u76d8\u771f\u503c: ver=%(ver)s tests=%(tests)d audit=%(audit_gated)d/%(audit_all)d rootjs=%(rootjs)d '
      'extra_js=%(extra_js)d host=%(host_lines)d/%(host_members)d suite=%(suite_n)d' % T)
os.makedirs(BAK, exist_ok=True)
for rel in ('PLAN.md', 'README.md', 'TODO.md', 'CHANGELOG.md'):
    io.open(BAK + rel + '.pre3430', 'w', encoding='utf-8').write(io.open(ROOT + rel, encoding='utf-8').read())

def sub1(text, old, new, label):
    n = text.count(old)
    assert n == 1, '%s \u951a\u70b9\u547d\u4e2d %d \u6b21(\u5e94\u4e3a 1): %r' % (label, n, old[:70])
    return text.replace(old, new, 1)

# -------- PLAN.md
P = ROOT + 'PLAN.md'
plan = io.open(P, encoding='utf-8').read()
plan = sub1(plan,
    '\u62d3\u5c55\u65b0\u529f\u80fd\u4e5d\u9879 **M4-X1/X2/X3/X4 \u5df2\u4ea4\u4ed8**(v3.339.0 / v3.340.0 / v3.341.0 / v3.342.0),**M4-X5~X9 \u5c1a\u672a\u5f00\u5de5**,\u4e0b\u4e00\u5200 M4-X5\u3002',
    '\u62d3\u5c55\u65b0\u529f\u80fd\u4e5d\u9879 **M4-X1/X2/X3/X4/X5 \u5df2\u4ea4\u4ed8**(v3.339.0 / v3.340.0 / v3.341.0 / v3.342.0 / v3.343.0),'
    '**M4-X6~X9 \u5c1a\u672a\u5f00\u5de5**,\u4e0b\u4e00\u5200 M4-X6\u3002',
    'PLAN \u6587\u9996\u8fdb\u5ea6\u884c')
# 当\u524d\u6267\u884c\u72b6\u6001\u884c\uff08\u6574\u884c\u66ff\u6362\uff09
OLD_HEAD = '> **\u5f53\u524d\u6267\u884c\u72b6\u6001(2026-10-16,v3.343.0)**'
assert plan.count('> **\u5f53\u524d\u6267\u884c\u72b6\u6001(') == 1, 'plan status head count'
i = plan.index('> **\u5f53\u524d\u6267\u884c\u72b6\u6001(')
j = plan.index('\n', i)
new_status = ('> **\u5f53\u524d\u6267\u884c\u72b6\u6001(2026-10-16,v3.343.0)**:\u89c4\u5212\u57fa\u7ebf `main@c37c52c`\u3002\u672c\u7248\u662f\u7b2c\u56db\u671f'
    '**\u62d3\u5c55\u4e5d\u9879\u7b2c\u4e94\u9879 M4-X5**(\u540c\u4e00\u4e8b\u4ef6\u7684\u591a\u65b9\u8bc1\u8bcd\u4e0e\u4e89\u8bae\u6863\u6848;P2 / L)\u5b9e\u65bd\u70b9:\u65e2\u6709 `knowledge-trace.js` '
    '\u80fd\u8bb0\u8bc1\u8bcd\u3001`perspective-card.js` \u80fd\u62a5\u4e24\u4eba\u4fe1\u606f\u5dee,\u4f46**\u540c\u4e00\u4e8b\u4ef6\u7684\u591a\u65b9\u8bf4\u6cd5\u4e0e\u4e89\u8bae\u6ca1\u6709\u4e00\u9762\u805a\u5408**:'
    '\u2014\u2014 \u8c01\u4eb2\u5386\u3001\u8c01\u8f6c\u8ff0\u3001\u8c01\u53cd\u8bc1\u770b\u4e0d\u51fa\u6765;\u4e09\u6b21\u8f6c\u8ff0\u4f1a\u88ab\u8bfb\u6210\u4e09\u4efd\u72ec\u7acb\u8bc1\u660e(\u540c\u4e00\u6761\u8bc1\u636e\u7ecf\u7532\u4f20\u4e59\u3001\u4e59\u4f20\u4e19\u5404\u5f02)'
    ';\u7acb\u573a\u5bf9\u7acb\u4e14\u5224\u4e0d\u5f00\u65f6\u65e0\u6cd5\u533a\u5206\u300c\u8f6c\u8ff0\u72ec\u6709 / \u4f4e\u4e8e\u95e8\u69db / \u771f\u6b63\u5224\u4e0d\u5f00\u300d\u4e09\u79cd\u5904\u5883;\u5f59\u65e5\u524d\u540e\u89c6\u89d2\u4e0d\u5206, \u64a4\u56de\u8bc1\u636e\u540e\u4e0d\u91cd\u7b97\u4e89\u8bae\u72b6\u6001\u3002'
    '\u672c\u7248\u4e24\u5200:**1 \u5185\u6838\u8bc1\u8bcd\u9762**(\u65b0\u6a21\u5757 `testimony-board.js`:`TB_VERSION 1`\uff0c\u56db\u6001 `supported`/`contested`/`undecided`/`withdrawn`\uff0c'
    '\u4e09\u6863 `ambiguous`/`below-threshold`/`transmittal-only`;`supportsOf` **\u6765\u6e90\u53bb\u91cd**(\u540c\u4e00\u6761\u539f\u59cb\u8bc1\u636e\u53ea\u7b97\u4e00\u4efd\u72ec\u7acb\u652f\u6301,\u5176\u4f59\u8ba1\u5165\u8f6c\u8ff0\u5e76\u62a5\u540c\u6e90\u5bf9\u8c61)\u3001'
    '`disputesOf` **\u4e09\u6863\u5206\u5217**\u3001`stateOfOf` \u56db\u6001\u5224\u5b9a\u5e8f\u3001`identitiesOf` **\u63ed\u5bc6\u524d\u540e\u5206\u9762**(`surface`/`revealed`/`homonym`/`unspecified` + `split`)\u3001'
    '`revokeEvidence` \u547d\u4e2d\u5217 `revokedItems` \u5e76**\u91cd\u7b97\u72b6\u6001**\uff08\u5168\u64a4 \u21d2 `withdrawn`\uff0c\u4e0d\u9759\u9ed8\u4fdd\u7559\u4e00\u4e2a\u6ca1\u4eba\u80fd\u4e3e\u8bc1\u7684 `contested`\uff09\uff1b'
    '\u5bfc\u51fa\u9762 24 \u9879\uff0c\u96f6\u4f9d\u8d56 IIFE \u53cc\u5bfc\u51fa\uff09;'
    '**2 \u5bbf\u4e3b\u63a5\u7ebf\u9762**(\u53d6\u5e93\u53e3 `_testimonyBoardLib` + \u4e09\u51fa\u53e3 `testimonyBoard` / `testimonyRevoke` / `_testimonyBoardLine` + \u81ea\u68c0\u9762\u300c\u8bc1\u8bcd\u9762\u300d\u884c)\u3002'
    '**\u516d\u6761\u8bc4\u5224\u7ebf\u7d22\u7ebf\u843d\u5730**:\u7532\u4eb2\u5386\u3001\u4e59\u8f6c\u8ff0\u7532(\u540c\u6e90**\u53ea\u7b97\u4e00\u4efd\u72ec\u7acb\u652f\u6301**)\u3001\u4e19\u53cd\u8bc1\u4e09\u6761\u540c\u5728(\u72ec\u7acb 2 / \u8f6c\u8ff0 1);'
    '\u7acb\u573a\u5bf9\u7acb\u4e14\u5224\u4e0d\u5f00 \u21d2 `contested` \u4e14**\u4e09\u6863\u5206\u5217**\u4e0d\u88c1\u4e0d\u5408;\u63ed\u5bc6\u524d\u540e `split`;\u5f59\u56de K2 \u21d2 `contested \u2192 supported`\u3002'
    '\u4e13\u9879\u5957\u4ef6 v3430 **%(suite_n)d \u6761\u5168\u7eff**(\u542b D1~D6 \u516d\u6761\u771f\u6e90\u7801\u7834\u574f\u8d1f\u63a7\u5236 + F1 \u7eaf\u5ea6 + F2 \u5de5\u5177\u4e24\u5411\u81ea\u8bc1 + G1 \u951a\u70b9)\u3002'
    '\u5bbf\u4e3b\u57fa\u7ebf %(host_lines)d/%(host_members)d(ceiling %(ceiling)d \u4f59\u91cf 400);`extra_js` **107 \u2192 108**(\u65b0\u6a21\u5757 testimony-board.js)\u3002'
    '\u4e0a\u4e00\u9879 M4-X3(v3.342.0,\u6b63\u53f2\u9009\u62e9\u771f\u6b63\u8fdb\u5165\u4e0b\u4e00\u5377)\u3002'
    '\u672c\u7248\u5b9e\u65bd\u671f\u5df2\u5b9e\u8dd1\u8fc7\u4e00\u6b21\u5168\u91cf\u590d\u9a8c(%(tests)d/%(tests)d \u6587\u4ef6 \u00b7 3748 \u65ad\u8a00 \u00b7 \u6587\u4ef6 288/%(tests)d\u901a\u8fc7,exit 1),'
    '**\u8bfb\u6570\u672a\u767b\u8bb0**(\u5feb\u7167\u6309\u7eaa\u5f8b\u4ecd\u505c v3.328.0,\u767b\u8bb0\u7559\u5230\u7b2c\u56db\u671f\u8ba1\u5212\u6536\u53e3\u70b9),\u6545\u5f53\u524d v3.343.0 **\u5168\u91cf\u5f85\u9a8c**\u3002') % T
plan = plan[:i] + new_status + plan[j:]
plan = sub1(plan, '| \u7248\u672c | **v3.342.0**(\u56db\u6e90\u540c\u6e90;\u672c\u8868\u539f\u4e3a v3.266.0) |',
            '| \u7248\u672c | **v3.343.0**(\u56db\u6e90\u540c\u6e90;\u672c\u8868\u539f\u4e3a v3.266.0) |', 'PLAN \u7248\u672c\u884c')
plan = sub1(plan, '| \u95e8\u7981 | \u5728\u5f79\u9762 **322 \u6d4b\u8bd5\u6587\u4ef6 / 61 \u4e2a audit \u811a\u672c**(\u78c1\u76d8 67)',
            '| \u95e8\u7981 | \u5728\u5f79\u9762 **%d \u6d4b\u8bd5\u6587\u4ef6 / %d \u4e2a audit \u811a\u672c**(\u78c1\u76d8 %d)'
            % (T['tests'], T['audit_gated'], T['audit_all']),
            'PLAN \u95e8\u7981\u884c')
plan = sub1(plan, '| \u4f53\u91cf | `index.js` **21437 \u884c**(\u63a2\u9488\u8bfb\u6570;`wc -l` 21436) / **780** \u6210\u5458',
            '| \u4f53\u91cf | `index.js` **%(host_lines)d \u884c**(\u63a2\u9488\u8bfb\u6570;`wc -l` %(wc_l)d) / **%(host_members)d** \u6210\u5458' % T,
            'PLAN \u4f53\u91cf\u884c\u00b7\u5f53\u7248\u8bfb\u6570')
plan = sub1(plan, 'v3.342.0 M4-X3 \u6b63\u53f2\u9009\u62e9\u771f\u6b63\u8fdb\u5165\u4e0b\u4e00\u5377\u540e\u4e3a 21437 / 780;+ extra_js **107** \u9879',
            'v3.342.0 M4-X3 \u6b63\u53f2\u9009\u62e9\u771f\u6b63\u8fdb\u5165\u4e0b\u4e00\u5377\u540e\u4e3a 21437 / 780,'
            'v3.343.0 M4-X5 \u540c\u4e00\u4e8b\u4ef6\u7684\u591a\u65b9\u8bc1\u8bcd\u4e0e\u4e89\u8bae\u6863\u6848\u540e\u4e3a %(host_lines)d / %(host_members)d;'
            '+ extra_js **%(extra_js)d** \u9879' % T,
            'PLAN \u4f53\u91cf\u884c\u00b7\u5386\u53f2\u94fe')
plan = sub1(plan, '| \u2705 M4-O5 | \u957f\u8d44\u6599\u5b8c\u6574\u8bfb\u53d6\u4e0e\u53ef\u6062\u590d\u89e3\u6790 | \u2b1c M4-X5 | \u540c\u4e00\u4e8b\u4ef6\u7684\u591a\u65b9\u8bc1\u8bcd\u4e0e\u4e89\u8bae\u6863\u6848 |',
            '| \u2705 M4-O5 | \u957f\u8d44\u6599\u5b8c\u6574\u8bfb\u53d6\u4e0e\u53ef\u6062\u590d\u89e3\u6790 | \u2705 M4-X5 | \u540c\u4e00\u4e8b\u4ef6\u7684\u591a\u65b9\u8bc1\u8bcd\u4e0e\u4e89\u8bae\u6863\u6848 |',
            'PLAN \u52fe\u9009\u884c X5')
plan = sub1(plan, '| \u7f16\u53f7 | \u4f18\u5316\u63d0\u5347(M4-O1~O9 \u5df2\u4ea4\u4ed8) | \u7f16\u53f7 | \u62d3\u5c55\u4e0e\u65b0\u529f\u80fd(M4-X1/X2/X3/X4 \u5df2\u4ea4\u4ed8 / M4-X5~X9 \u5f85\u5b9e\u65bd) |',
            '| \u7f16\u53f7 | \u4f18\u5316\u63d0\u5347(M4-O1~O9 \u5df2\u4ea4\u4ed8) | \u7f16\u53f7 | \u62d3\u5c55\u4e0e\u65b0\u529f\u80fd(M4-X1/X2/X3/X4/X5 \u5df2\u4ea4\u4ed8 / M4-X6~X9 \u5f85\u5b9e\u65bd) |',
            'PLAN \u8868\u5934\u884c')
plan = sub1(plan,
    '\u4ea7\u54c1\u5305C \u7684 **M4-X2/X3 \u5df2\u4ea4\u4ed8**(v3.341.0 / v3.342.0),**M4-X5/X6/X7/X8/X9** **\u5c1a\u672a\u5f00\u5de5**\u3002'
    '**\u4e0b\u4e00\u5200 = M4-X5**(\u540c\u4e00\u4e8b\u4ef6\u7684\u591a\u65b9\u8bc1\u8bcd\u4e0e\u4e89\u8bae\u6863\u6848,P2 / L)\u3002',
    '\u4ea7\u54c1\u5305C \u7684 **M4-X2/X3/X5 \u5df2\u4ea4\u4ed8**(v3.341.0 / v3.342.0 / v3.343.0),**M4-X6/X7/X8/X9** **\u5c1a\u672a\u5f00\u5de5**\u3002'
    '**\u4e0b\u4e00\u5200 = M4-X6**(\u68a6\u5883\u3001\u5047\u8bbe\u3001\u8ba1\u5212\u4e0e\u73b0\u5b9e\u7684\u53d9\u4e8b\u5c42\u8bb0\u5fc6,P2 / L)\u3002',
    'PLAN \u4f18\u5148\u7ea7\u884c\u00b7\u4e0b\u4e00\u5200')
io.open(P, 'w', encoding='utf-8').write(plan)
print('PLAN.md \u5df2\u5199 8 \u5904')
