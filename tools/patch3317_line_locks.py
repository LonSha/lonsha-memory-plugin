#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch3317_line_locks.py - v3.317.0：三档「硬锁当版行数魔数」交棒到 line_budget 登记面。

【为什么翻红（本仓已两轮定性的同族坑）】
  v3259 C / v3260 C / v3261 C 各自留着**当版**行数绝对下界：
    v3259  `< 18124` + `<= 17800`（文案「剥走前 18124」/「本刀须至少剥掉 300 行」）
    v3260  `< 17776` + `<= 17500`
    v3261  `< 17444`
  它们是各刀**一次性事实**（剥走前的真读数），与 v3264 C / v3266 C 踩过的完全同族
  （CHANGELOG v3.273.0 留痕）：后续活跃功能增长（第二期 M-X 各刀真实宿主接线）把它们推回线上，
  翻红的信息量只剩「数字不够小」——而 A1 的真实不变量是「各刀之后宿主读数始终低于 A1 首刀前
  基线（18401）」，那条照旧把守。

【交棒口径（不弱化判据面）】
  与本仓先例一致（tools/patch3309c.py 交棒 v3264 C、tools/bump3296_a1_line_budget.py 交棒 v3266 C）：
  活体上界改读 `host_beast_baseline.json` 的 `line_budget.ceiling`（ceiling + history + maxSlack，
  抬升只走脚本、三条读数自动同步），并保留单调守卫 18401。
  ★ 不新建第二份真源：line_budget 由 v3266 C 立起，本脚本只让另三档改**读**它。

纪律：全部锚点先校验、通过后统一写盘。
"""
import io
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
HANDOVER = (
    "    /* [v3.317.0 交棒] 原文是 %(orig)s ——【硬锁当版快照】。\n"
    "     *   与 v3264 C / v3266 C 踩过的是**同一族坑**（CHANGELOG v3.273.0 留痕）：把某刀的一次性读数\n"
    "     *   当永久不变量 ⇒ 后续活跃功能增长（第二期 M-X 各刀真实宿主接线）把它推回线上，翻红的\n"
    "     *   信息量只剩「数字不够小」。而 A1 的真实不变量是「各刀之后宿主读数始终低于 A1 首刀前\n"
    "     *   基线（18401）」，那条照旧在下面把守。\n"
    "     *   交棒**不弱化**：本档改守全仓唯一的活体上界 `line_budget.ceiling`（由 v3266 C 立起，\n"
    "     *   本档只读不另立 —— 立两份就是两份真源）。 */\n"
    "    const _lbL = b.line_budget || null;\n"
    "    assert.ok(_lbL && Number.isFinite(_lbL.ceiling), '宿主行数上界必须登记（否则「长回线上」无人管）');\n"
    "    assert.ok(b.readings.total_lines <= _lbL.ceiling,\n"
    "        '★ 宿主行数须 <= 登记上界 ' + _lbL.ceiling + '，实测 ' + b.readings.total_lines);\n"
    "    assert.ok(_lbL.ceiling - b.readings.total_lines <= _lbL.maxSlack,\n"
    "        '上界余量 ' + (_lbL.ceiling - b.readings.total_lines) + ' 不得超过 maxSlack ' + _lbL.maxSlack\n"
    "        + '（余量过大 = 上界与实测脱节，等于没守）');\n"
    "    assert.ok(b.readings.total_lines < 18401,\n"
    "        '★ A1 之后宿主读数须始终低于 A1 首刀前基线（18401）：剥了又长回来必须响，实测 '\n"
    "        + b.readings.total_lines);\n"
)

PATCHES = [
    ('tests/v3259_a1_memory_aux.test.mjs', 1,
     "    assert.ok(b.readings.total_lines < 18124, '行数须已随本刀下降（剥走前 18124）');\n"
     "    /* 追加：本刀抽的是六个类 —— 用「减幅」把「基线刷新时少刷一点」钉住。 */\n"
     "    assert.ok(b.readings.total_lines <= 17800, '本刀须至少剥掉 300 行，实测 ' + b.readings.total_lines);\n",
     '`< 18124` + `<= 17800`'),
    ('tests/v3260_a1_narrative_generators.test.mjs', 1,
     "    assert.ok(b.readings.total_lines < 17776, '行数须已随本刀下降（剥走前 17776）');\n"
     "    assert.ok(b.readings.total_lines <= 17500, '本刀须至少剥掉 270 行，实测 ' + b.readings.total_lines);\n",
     '`< 17776` + `<= 17500`'),
    ('tests/v3261_a1_memory_books.test.mjs', 1,
     "    assert.ok(b.readings.total_lines < 17444, '行数须已随本刀下降（剥走前 17444）');\n",
     '`< 17444`'),
]

bad = 0
STAGE = []
for rel, want, old, orig in PATCHES:
    p = ROOT + rel
    s = io.open(p, encoding='utf-8').read()
    n = s.count(old)
    if n != want:
        print('[patch3317-line-locks] MISS %s 锚点命中 %d 次（要求 %d）' % (rel, n, want))
        bad += 1
        continue
    s = s.replace(old, HANDOVER % {'orig': orig})
    STAGE.append((p, s, rel))

if bad:
    raise SystemExit('[patch3317-line-locks] 有 %d 处未通过校验，未写盘' % bad)

for p, s, rel in STAGE:
    io.open(p, 'w', encoding='utf-8').write(s)
    print('[patch3317-line-locks] wrote', rel)
print('[patch3317-line-locks] 完成：三档硬锁当版行数魔数已交棒到 line_budget 登记面')
