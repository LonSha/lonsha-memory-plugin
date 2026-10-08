#!/usr/bin/env python3
"""v3.296.0 · 交棒（第二批）：成员数当版硬锁 → 同一登记面的活体上界。

【为什么还有第二批】v3261 C 与 v3266 C 是**同族**：都把 A1 某一刀后的**一次性读数**
当永久不变量。行数那条已在 v3266 交棒；成员数这条在 v3261（`member_count < 549`，
文案「第一刀前基线 549」），被 X 系列八条活跃接线的 +16 位成员推回线上。

【交棒口径（与行数那条对齐，一个字面量都不丢）】
  · 549 不被删除，而是作为**里程碑成员上界**搬进 line_budget.history 首条（留痕、可机检）；
  · 当前成员读数改守同一登记面：<= member_ceiling，且该值必须能被最后一条 history 解释；
  · 余量与 maxSlack 同族约束（上界与实测脱节 = 等于没守）。

纪律：全部锚点先校验、通过后统一写盘。
"""
import io
import json
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
BASE = ROOT / 'tests/audit/host_beast_baseline.json'
T3261 = ROOT / 'tests/v3261_a1_memory_books.test.mjs'

M_MILESTONE = 549          # A1 第一刀前成员基线（v3261 原文口径）
M_SLACK = 30
M_REASON = ('v3.289.0–v3.296.0 X 系列八条活跃接线的真实宿主成员（+16 位：注入策略对照 / 手机事实准入 / '
            '知识轨迹 / 分支语义 / 分卷接续 / 召回解释 / 修复流程 / 结构化证据查询），非死代码回流：'
            '成员 552 → 568，抬到实测 568 + slack 30')

# ── ① 扩展 line_budget：补成员上界（行上界那条已由 v3266 守着，这里只加维度） ──
raw = io.open(BASE, encoding='utf-8').read()
base = json.loads(raw)
lb = base.get('line_budget')
if not lb or 'member_ceiling' in lb:
    print('[a1-member-budget] 前提不成立：line_budget 缺失或 member_ceiling 已存在 —— 拒绝重复抬升。')
    sys.exit(1)
measured = base['readings']['member_count']
lb['member_ceiling'] = measured + M_SLACK
lb['member_max_slack'] = M_SLACK
lb['_doc'] = ('宿主 index.js 的**行数与成员数**上界（A1 里程碑交棒后）。v3266 C 读行，v3261 C 读成员，'
              '两档都不再手锁当版字面量。')
for i, h in enumerate(lb['history']):
    if i == 0:
        h['member_ceiling'] = M_MILESTONE
        h['member_milestone_note'] = 'A1 第一刀前的宿主成员基线（v3261 原文口径：成员数须随 A1 刀口下降）'
    else:
        h['member_ceiling'] = lb['member_ceiling']
lb['member_note'] = M_REASON
io.open(BASE, 'w', encoding='utf-8').write(json.dumps(base, ensure_ascii=False, indent=1) + '\n')
print('[a1-member-budget] 基线扩展：member_ceiling %d（实测 %d + slack %d），历史两条同步'
      % (lb['member_ceiling'], measured, M_SLACK))

# ── ② v3261 C 交棒：成员数硬锁 → 登记面判据 ──
src = io.open(T3261, encoding='utf-8').read()
OLD = "    assert.ok(b.readings.member_count < 549, '成员数须已随 A1 刀口下降（第一刀前基线 549）');\n"
NEW = """    /* [v3.296.0 交棒] 原文是 `member_count < 549` ——【硬锁当版快照】（文案「第一刀前基线 549」），
     *   与 v3266 C 的行数硬锁同族（CHANGELOG v3.273.0 留痕的口径）：把某版的一次性读数当永久
     *   不变量，后续活跃功能增长（X 系列八条接线 +16 位成员）就把它推回线上，翻红的读数只剩
     *   「数字不够小」。交棒**不弱化**：549 搬进 `host_beast_baseline.json` 的
     *   `line_budget.history[0].member_ceiling`（里程碑留痕、可机检），当前读数改守同一登记面 ——
     *   登记值必须能被最后一条 history 解释（静默改数 ⇒ 红）。 */
    const _lb = b.line_budget || null;
    assert.ok(_lb && Number.isFinite(_lb.member_ceiling), '宿主成员数上界必须登记（否则「长回线上」无人管）');
    const _lbh = Array.isArray(_lb.history) ? _lb.history : [];
    assert.ok(_lbh.length >= 2, '成员上界历史须含「里程碑」与「本次抬升」两条，实测 ' + _lbh.length);
    assert.equal((_lbh[0] || {}).member_ceiling, 549, '首条历史必须是 A1 刀口前的成员基线 549');
    assert.equal(_lb.member_ceiling, (_lbh[_lbh.length - 1] || {}).member_ceiling,
        '当前成员上界必须等于最后一条历史的 member_ceiling（防静默改数）');
    assert.ok(b.readings.member_count <= _lb.member_ceiling,
        '★ 宿主成员数须 <= 登记上界 ' + _lb.member_ceiling + '，实测 ' + b.readings.member_count);
    assert.ok(_lb.member_ceiling - b.readings.member_count <= _lb.member_max_slack,
        '成员上界余量 ' + (_lb.member_ceiling - b.readings.member_count)
        + ' 不得超过 member_max_slack ' + _lb.member_max_slack + '（余量过大 = 上界与实测脱节）');
"""
n = src.count(OLD)
if n != 1:
    print('[a1-member-budget] v3261 锚点命中 %d 次（须恰 1 次）——请手工核对。' % n)
    sys.exit(1)
io.open(T3261, 'w', encoding='utf-8').write(src.replace(OLD, NEW, 1))
print('[a1-member-budget] v3261 C 段交棒已写盘。')