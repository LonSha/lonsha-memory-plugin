#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.318.0 收口补刀 D：v3288 D 段的 O2 断言从「钉死旧形态」抬为本版**交棒**。"""
import io, sys
S = '/home/user/lonsha-memory-plugin/tests/v3288_plan_currency_xface.test.mjs'
NL = chr(10)
BSN = chr(39) + chr(92) + 'n' + chr(39)   # 源码里的两个字符：反斜杠 + n（不是真换行）
s = io.open(S, encoding='utf-8').read()

OLD = ("    const oLine = plan.split(" + BSN + ").find((l) => l.includes('优化计划 O1\u2013O8')) || '';" + NL
 + "    assert.ok(oLine.includes('未收口'), 'O2 \u7684\u90e8\u5206\u4ea4\u4ed8/\u672a\u6536\u53e3\u987b\u663e\u5f0f\u5728\u5217');" + NL
 + "    ok('\u4e8b\u5b9e\u9762\uff1aX1 \u5df2\u4ea4\u4ed8 / X2\u2013X8 \u672a\u5b9e\u65bd / O2 \u672a\u6536\u53e3');")

NEW = ("    const oLine = plan.split(" + BSN + ").find((l) => l.includes('优化计划 O1\u2013O8')) || '';" + NL
 + "    /* [v3.318.0 \u62ac\u7248\u4ea4\u68d2] \u539f\u65ad\u8a00\u5199\u6b7b\u300cO2 \u672a\u6536\u53e3\u987b\u663e\u5f0f\u5728\u5217\u300d\u2014\u2014\u90a3\u662f**\u672c\u6863\u51fa\u751f\u7248**\u7684\u4ea4\u4ed8\u4e8b\u5b9e\u3002" + NL
 + "     *   v3.318.0\uff08M-O2 \u771f\u6d4f\u89c8\u5668\u5207\u7247\uff09\u6536\u53e3 O2 \u540e\uff0cPLAN \u5982\u5b9e\u6539\u5199\u5373\u5f53\u573a\u8f6c\u7ea2\uff1b\u800c\u628a\u5b83\u5220\u6389\u53c8\u4f1a\u8ba9" + NL
 + "     *   \u300c\u5df2\u6536\u53e3\u9879\u88ab\u5199\u56de\u5f85\u529e\u300d\u8fd9\u79cd\u771f\u56de\u9000\u65e0\u4eba\u628a\u5b88\u3002\u4e8b\u5b9e\u9762\u65ad\u8a00\u5e94\u9489**\u7ed3\u6784**\u3001\u4e0d\u9489\u67d0\u4e00\u7248\u7684\u72b6\u6001\u53d6\u503c" + NL
 + "     *   \uff08\u540c\u672c\u6863 v3.292.0 / v3.296.0 \u4e24\u6b21\u4ea4\u68d2\u7684\u53e3\u5f84\uff09\u3002\u91cd\u8ff0\u4e3a\u4e09\u6761\u7ed3\u6784\u4e0d\u53d8\u91cf\uff1a" + NL
 + "     *   \u2460 O2 \u4ecd\u987b\u663e\u5f0f\u5728\u5217\uff1b\u2461 \u5e26\u72b6\u6001\u8bcd\u5373\u53ef\uff08\u5df2\u6536\u53e3 / \u5df2\u4ea4\u4ed8 \u4e24\u5f62\u6001\u90fd\u8ba4\uff09\uff1b" + NL
 + "     *   \u2462 \u53cd\u5411\uff1a\u4e0d\u5f97\u628a\u5b83\u5217\u4e3a\u300c\u5c1a\u672a\u505a / \u5c1a\u672a\u4ea4\u4ed8 / \u672a\u505a / \u5f85\u505a\u300d\u3002 */" + NL
 + "    assert.ok(/O2" + chr(92) + "b/.test(oLine), 'O2 \u987b\u5728\u73b0\u72b6\u8282\u663e\u5f0f\u5728\u5217\uff08\u4e0d\u5f97\u9759\u9ed8\u6458\u6389\uff09');" + NL
 + "    assert.ok(/O2" + chr(92) + "b[^\uff1b;]*?(\u5df2\u4ea4\u4ed8|\u5df2\u6536\u53e3)/.test(oLine)," + NL
 + "        'O2 \u7684\u4ea4\u4ed8\u72b6\u6001\u987b\u663e\u5f0f\u5728\u5217\uff08\u5df2\u6536\u53e3 / \u5df2\u4ea4\u4ed8 \u4e24\u79cd\u5f62\u6001\u5747\u5408\u6cd5\uff09');" + NL
 + "    assert.equal(/O2" + chr(92) + "b[^\uff1b;]*?(\u5c1a\u672a\u505a|\u5c1a\u672a\u4ea4\u4ed8|\u672a\u505a|\u5f85\u505a)/.test(oLine), false," + NL
 + "        '\u65e2\u5df2\u4ea4\u4ed8\uff0c\u4e0d\u5f97\u53c8\u628a O2 \u5217\u4e3a\u5c1a\u672a\u505a\uff08\u5df2\u4ea4\u4ed8\u6761\u76ee\u88ab\u5199\u56de\u5f85\u529e\uff09');" + NL
 + "    ok('\u4e8b\u5b9e\u9762\uff1aX1\u2013X8 \u5168\u4ea4\u4ed8\u5728\u5217 / O2 \u72b6\u6001\u663e\u5f0f\u4e14\u975e\u5f85\u505a');")

n = s.count(OLD)
print('anchor hits', n)
if n != 1:
    print('[patch3318d] \u5931\u914d \u21d2 \u4e0d\u5199\u76d8'); sys.exit(1)
s = s.replace(OLD, NEW, 1)
io.open(S, 'w', encoding='utf-8').write(s)
print('[patch3318d] \u5199\u76d8\u5b8c\u6210')
