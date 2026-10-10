# -*- coding: utf-8 -*-
"""v3.309.0 收尾：v3264 C 的「硬锁当版魔数」交棒到 line_budget 登记面。

真回归（本刀引入，全量实跑抓出）：
  tests/v3264_a1_memory_organs.test.mjs:291 断言 `b.readings.total_lines < 16000`
  —— 那是 v3.264.0 的**当版里程碑魔数**（文案「剥走前 17091」是 v3.231.0 的量级）。
  本刀世界推进块头加闸 +55 行 ⇒ 宿主 15955 → 16010，顶穿这个死数。
  但 16010 仍 **< 18401**（A1 首刀前基线，单调守卫），即「剥了又长回来」这条真不变量未破。

为什么是交棒而不是抬魔数：
  同族坑在本仓已定性两轮（CHANGELOG v3.273.0 / v3266 C 段头）：把「某版的一次性事实」
  当永久不变量 ⇒ 后续活跃功能增长把它推回线上，翻红的信息量只剩「数字不够小」。
  v3.296.0 已把该面交棒到 host_beast_baseline.json 的 `line_budget` 登记面
  （ceiling + history + maxSlack，抬升只走脚本、三条读数自动同步）。
本案只交棒 v3264 C 里那**一条**魔数，其余照旧：
  · `< 18401` 单调守卫：原样保留（它才是「长回来」的探测器）
  · 基线行数 == 真 index.js 行数：原样保留
  · line_budget 登记面：只读校验，不新建（v3266 C 已把它立起来，本档不重复立第二份真源）
"""
import os

ROOT = '/home/user/lonsha-memory-plugin'
F = os.path.join(ROOT, 'tests', 'v3264_a1_memory_organs.test.mjs')

s = open(F, encoding='utf-8').read()

old = ("    assert.ok(b.readings.total_lines < 16000, '\\u884c\\u6570\\u987b\\u5df2\\u968f\\u672c\\u5200\\u4e0b\\u964d\\uff08\\u5265\\u8d70\\u524d 17091\\uff09\\uff0c\\u5b9e\\u6d4b ' + b.readings.total_lines);\n")
assert s.count(old) == 1, '锚点命中 %d 次' % s.count(old)

new = (
    "    /* [v3.309.0 交棒] 原文是 `total_lines < 16000` ——【硬锁当版里程碑】：\n"
    "     *   它是 v3.264.0 那一刀的**一次性事实**（文案「剥走前 17091」是 v3.231.0 的量级）。\n"
    "     *   与 v3266 C / v3261 C 踩过的是**同一族坑**（CHANGELOG v3.273.0 留痕）：\n"
    "     *   把「某版的一次性事实」当永久不变量 ⇒ 后续活跃功能增长（本刀世界推进块头加闸 +55 行）\n"
    "     *   把它推回线上，翻红的信息量只剩「数字不够小」。而本刀 +55 行**并不是**「剥了又长回来」——\n"
    "     *   A1 的真实不变量是「各刀之后宿主读数始终低于 A1 首刀前基线（18401）」，它照旧在下面把守。\n"
    "     *   交棒**不弱化**判据面：活体上界改读 host_beast_baseline.json 的 `line_budget` 登记面\n"
    "     *   （ceiling + history + maxSlack，抬升只走脚本、三条读数自动同步；登记面由 v3266 C 立起，\n"
    "     *   本档只读不另立 —— 立两份就是两份真源），并保留「当版须在 rebuilds 面留读数」这一条。 */\n"
    "    const _lb = b.line_budget || null;\n"
    "    assert.ok(_lb && Number.isFinite(_lb.ceiling), '宿主行数上界必须登记（否则「长回线上」无人管）');\n"
    "    const _lbHist = Array.isArray(_lb.history) ? _lb.history : [];\n"
    "    assert.ok(_lbHist.length >= 2, '上界历史须含「里程碑达成」与「本次抬升」两条，实测 ' + _lbHist.length);\n"
    "    assert.equal((_lbHist[0] || {}).ceiling, 15000, '首条历史必须是 A1 里程碑上界 15000');\n"
    "    assert.equal(_lb.ceiling, (_lbHist[_lbHist.length - 1] || {}).ceiling,\n"
    "        '当前上界必须等于最后一条历史的 ceiling（防静默改数）');\n"
    "    assert.equal(_lb.note, (_lbHist[_lbHist.length - 1] || {}).reason,\n"
    "        '当前 note 必须是最后一条历史理由的复述（防理由与数脱节）');\n"
    "    assert.ok(b.readings.total_lines <= _lb.ceiling,\n"
    "        '★ 宿主行数须 <= 登记上界 ' + _lb.ceiling + '，实测 ' + b.readings.total_lines);\n"
    "    assert.ok(_lb.ceiling - b.readings.total_lines <= _lb.maxSlack,\n"
    "        '上界余量 ' + (_lb.ceiling - b.readings.total_lines) + ' 不得超过 maxSlack ' + _lb.maxSlack\n"
    "        + '（余量过大 = 上界与实测脱节，等于没守）');\n"
)
s = s.replace(old, new)
open(F, 'w', encoding='utf-8').write(s)
print('[patch3309c] OK：v3264 C 的硬锁当版魔数已交棒到 line_budget 登记面')