#!/usr/bin/env python3
"""v3.296.0 · 交棒（第三批）：v3259 / v3260 的成员数硬锁 → 同一登记面判据。

【同族定论】三档成员硬锁（v3259 `member_count < 561` / v3260 `< 553` / v3261 `< 549`）
   是同一族「把某刀的一次性读数当永久不变量」，被 X 系列八条活跃接线（+16 位成员）推回线上。
   v3261 已在第二批交棒到 `line_budget.member_ceiling`（含里程碑留痕 549）；本批把
   **另两处**对齐到**同一登记面**——一个上界服务三档，而不是每档各写一个数字
   （否则下一版功能增长要改三处，正是「一份契约 N 份拷贝」）。

【交棒口径】561 / 553 不被删除：作为**里程碑读数**搬进 line_budget.history[0] 的
   `member_milestones` 表（键＝剥走前的基线，值＝那一刀的档名，可机检、留痕）；
   三档当前读数统一守 `member_ceiling`（静默改数 ⇒ 红）。

纪律：全部锚点先校验、通过后统一写盘。
"""
import io
import json
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
BASE = ROOT / 'tests/audit/host_beast_baseline.json'

PATCHES = [
    (ROOT / 'tests/v3259_a1_memory_aux.test.mjs', 561, 'A1 第二刀 memory-aux.js'),
    (ROOT / 'tests/v3260_a1_narrative_generators.test.mjs', 553, 'A1 第三刀 narrative-generators.js'),
]

CHECK_JS = """    /* [v3.296.0 交棒] 原文是 `member_count < %(num)d` ——【硬锁当版快照】（文案「剥走前的基线是 %(num)d」），
     *   与 v3259/v3260/v3261 三档同族：把某刀的一次性读数当永久不变量 ⇒ 后续活跃功能增长
     *   （X 系列八条接线 +16 位成员）就把它推回线上。交棒**不弱化**：%(num)d 作为里程碑读数搬进
     *   `host_beast_baseline.json` 的 `line_budget.history[0].member_milestones`（可机检、留痕），
     *   本档改守**全仓唯一的成员上界** `member_ceiling` —— 三档共用一个登记面，
     *   免得下一版增长要改三处数字（「一份契约 N 份拷贝」）。 */
    const _lb = b.line_budget || null;
    assert.ok(_lb && Number.isFinite(_lb.member_ceiling), '宿主成员数上界必须登记');
    const _ms = ((Array.isArray(_lb.history) ? _lb.history[0] : {}) || {}).member_milestones || {};
    assert.ok(_ms['%(num)d'], '里程碑读数 %(num)d 必须留在登记面（勿删）：%(tag)s');
    assert.ok(b.readings.member_count <= _lb.member_ceiling,
        '★ 宿主成员数须 <= 登记上界 ' + _lb.member_ceiling + '，实测 ' + b.readings.member_count);
    assert.ok(_lb.member_ceiling - b.readings.member_count <= _lb.member_max_slack,
        '成员上界余量 ' + (_lb.member_ceiling - b.readings.member_count)
        + ' 不得超过 member_max_slack ' + _lb.member_max_slack);
"""

# ── ① 登记面补里程碑表（键＝剥走前基线，值＝档名） ──
base = json.loads(io.open(BASE, encoding='utf-8').read())
lb = base.get('line_budget')
if not lb:
    print('[member-budget-3] line_budget 缺失——拒绝继续。')
    sys.exit(1)
h0 = lb['history'][0]
if 'member_milestones' in h0:
    print('[member-budget-3] member_milestones 已存在——拒绝重复写。')
    sys.exit(1)
h0['member_milestones'] = {
    '561': 'A1 第二刀（memory-aux.js）剥走前的宿主成员基线',
    '553': 'A1 第三刀（narrative-generators.js）剥走前的宿主成员基线',
    '549': 'A1 第一刀（memory-books.js 口径）剥走前的宿主成员基线',
}
io.open(BASE, 'w', encoding='utf-8').write(json.dumps(base, ensure_ascii=False, indent=1) + '\n')
print('[member-budget-3] 登记面补 member_milestones：561 / 553 / 549')

# ── ② 两档判据交棒 ──
done = 0
for path, num, tag in PATCHES:
    src = io.open(path, encoding='utf-8').read()
    old = "    assert.ok(b.readings.member_count < %d, '成员数须已随本刀下降（剥走前的基线是 %d）');\n" % (num, num)
    if src.count(old) != 1:
        print('[member-budget-3] %s 锚点命中 %d 次（须恰 1 次）——跳过。' % (path.name, src.count(old)))
        sys.exit(1)
    io.open(path, 'w', encoding='utf-8').write(src.replace(old, CHECK_JS % {'num': num, 'tag': tag}, 1))
    print('[member-budget-3] %s 交棒已写盘（< %d → 登记面判据）' % (path.name, num))
    done += 1
print('[member-budget-3] 合计 %d 档交棒完成。' % done)