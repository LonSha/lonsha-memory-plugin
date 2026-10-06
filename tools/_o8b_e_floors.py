#!/usr/bin/env python3
"""v3.286.0 O8 第二刀 E 步：面下限改为 env 可覆盖（合成仓夹具用）。

为什么必须改（本仓既有口径，非新引入）：
  tests/audit/scan_doc_truthfulness.mjs 等既有扫描器一律写
  `const FLOOR_TESTS = numEnv('LONSHA_AUDIT_MIN_TESTS') || (FIXTURE_MODE ? 1 : 200);`
  —— 因为「配成对」的判据套件必须在**合成仓**上逐条验判据真能翻红，而合成仓只有几十个文件，
  固定下限 200 会让每条合成仓用例一律 exit 2（判据永远到不了），套件整片退化成摆设。
  本扫描器首版把 200/40 写死，故补上同一形式。

幂等：哨兵已在场则跳过。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
SCAN = ROOT / 'tests' / 'audit' / 'scan_cost_truthfulness.mjs'
SENTINEL = 'LONSHA_AUDIT_MIN_TESTS'

A_ANCHOR = """const bad = (m) => { problems.push(m); };
"""
A_NEW = """const bad = (m) => { problems.push(m); };
/** 面下限可由 env 覆盖（同 scan_doc_truthfulness 口径）：合成仓夹具需要把下限降下来，
 *  否则每条合成仓用例都会卡在「枚举塌陷 ⇒ exit 2」，判据本身永远到不了。 */
const numEnv = (k) => {
    const v = Number(process.env[k]);
    return Number.isFinite(v) && v >= 0 ? v : null;
};
const FLOOR_TESTS = numEnv('LONSHA_AUDIT_MIN_TESTS') || (FIXTURE_MODE ? 1 : 200);
const FLOOR_AUDIT = numEnv('LONSHA_AUDIT_MIN_AUDIT') || (FIXTURE_MODE ? 1 : 40);
"""

B_ANCHOR = """if (diskTests.length < 200) drift('磁盘测试档只有 ' + diskTests.length + ' 个（下限 200）⇒ 枚举塌陷，拒绝给结论');
if (diskAudit.length < 40) drift('审计面只有 ' + diskAudit.length + ' 个（下限 40）⇒ 枚举塌陷，拒绝给结论');
"""
B_NEW = """if (diskTests.length < FLOOR_TESTS) {
    drift('磁盘测试档只有 ' + diskTests.length + ' 个（下限 ' + FLOOR_TESTS + '）⇒ 枚举塌陷，拒绝给结论');
}
if (diskAudit.length < FLOOR_AUDIT) {
    drift('审计面只有 ' + diskAudit.length + ' 个（下限 ' + FLOOR_AUDIT + '）⇒ 枚举塌陷，拒绝给结论');
}
"""

src = SCAN.read_text(encoding='utf-8')
if SENTINEL in src:
    print('[o8b-e] 哨兵已在场（%s）⇒ 已应用过，跳过（幂等）' % SENTINEL)
    sys.exit(0)
for name, anchor, new in [('A', A_ANCHOR, A_NEW), ('B', B_ANCHOR, B_NEW)]:
    n = src.count(anchor)
    if n != 1:
        print('[FATAL] 锚点 %s 命中 %d 次（必须恰 1 次），不写盘' % (name, n))
        sys.exit(1)
    src = src.replace(anchor, new, 1)
SCAN.write_text(src, encoding='utf-8')
print('[o8b-e] 面下限已改为 env 可覆盖（FLOOR_TESTS / FLOOR_AUDIT）')
print('[o8b-e] 新行数 = %d' % (src.count('\n') + 1))