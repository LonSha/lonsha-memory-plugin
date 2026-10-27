#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""lonsha-memory-plugin · v3.286.0 O8 第二刀（B 步）：测试成本读数「零手抄」重绑工具。

消费 `TEST_SUMMARY_JSON=<path> node tests/run.mjs ...` 落盘的结构化摘要，
写入 `tests/audit/test_cost_readings.json`。

与 `_rebind_doc_readings.py` 同一口径（本仓纪律「同一件事不写两份」）：
  · 只读摘要、不做任何测量；读数的**权威来源**始终是 run.mjs 的摘要；
  · 不覆盖、只**追加**（`rebinds[]` 历史留痕，同 host_beast_baseline 口径）；
  · **覆盖范围自述**：`scope.full` 来自摘要，必须原样透传 —— 本仓明令
    「定向采样不得冒充全量」，故不实跑就不写全量读数；
  · fail-closed：摘要不合用（缺字段 / 非全量却试图写全量读数）⇒ exit 1，**从不落盘**。

用法：
  TEST_SUMMARY_JSON=/tmp/s.json node tests/run.mjs --audit
  python3 tools/_rebind_test_cost.py /tmp/s.json

退出码：0 已写 / 1 摘要不合用（拒绝落盘）/ 2 结构漂移（路径不存在等）
"""
import json
import os
import sys
from pathlib import Path

# 根可改（同姊妹工具 _rebind_doc_readings.py 口径）：判据套件靠它在不碰真仓的前提下
# 验本工具的 fail-closed —— 否则「拒绝落盘」这件事本身就无从安全测试。
ROOT = Path(os.environ.get('LONSHA_AUDIT_ROOT') or '/home/user/lonsha-memory-plugin')
OUT = ROOT / 'tests' / 'audit' / 'test_cost_readings.json'


def die2(msg):
    print('[rebind-cost] ' + msg)
    sys.exit(2)


def fail1(msg):
    print('[rebind-cost] ' + msg + ' ⇒ 拒绝落盘')
    sys.exit(1)


def main():
    if len(sys.argv) < 2:
        die2('用法：python3 tools/_rebind_test_cost.py <summary.json>')
    p = Path(sys.argv[1])
    if not p.exists():
        die2('摘要文件不存在：' + str(p))
    try:
        d = json.loads(p.read_text(encoding='utf-8'))
    except Exception as e:
        fail1('摘要非法 JSON：' + str(e))

    # ---- 结构校验（fail-closed：不合用就拒绝，不写半份）----
    if not isinstance(d, dict):
        fail1('摘要顶层不是对象')
    ver = d.get('version')
    scope = d.get('scope')
    tests = d.get('tests')
    if not isinstance(ver, str) or not ver:
        fail1('摘要缺 version')
    if not isinstance(scope, dict) or 'full' not in scope:
        fail1('摘要缺 scope.full（本刀新增的覆盖范围自述；旧 run.mjs 未落此字段）')
    if not isinstance(tests, dict) or 'total' not in tests or 'wall' not in tests:
        fail1('摘要缺 tests.total / tests.wall')
    if 'slowest' not in tests:
        fail1('摘要缺 tests.slowest（本刀新增：全量逐档耗时）')
    if not isinstance(tests['slowest'], list):
        fail1('tests.slowest 不是数组')

    audit = d.get('audit')
    audit_passed = None
    audit_total = None
    if isinstance(audit, dict):
        audit_passed = audit.get('passed')
        audit_total = audit.get('total')
        if audit.get('failed'):
            fail1('本次运行审计段有失败档（%d 个）—— 读数不采信失败的运行' % len(audit['failed']))
    if d.get('ok') is not True:
        fail1('本次运行 ok != true（读数不采信失败的运行）')

    full = bool(scope.get('full'))
    prev = {}
    if OUT.exists():
        try:
            prev = json.loads(OUT.read_text(encoding='utf-8'))
        except Exception:
            prev = {}
    rebinds = list(prev.get('rebinds') or [])

    entry = {
        'version': ver,
        'scope': {
            'full': full,
            'patterns': scope.get('patterns') or [],
            'jobs': scope.get('jobs'),
        },
        'tests_total': tests['total'],
        'tests_wall_s': tests['wall'],
        'slowest_top': tests['slowest'][:15],
        'audit_passed': audit_passed,
        'audit_total': audit_total,
        'source': 'node tests/run.mjs ' + ('--audit' if audit_total else '')
                  + (' ' + ' '.join(scope.get('patterns') or []) if not full else ''),
        'rebound_at': d.get('at'),
    }

    doc = {
        'file': 'tests/audit/test_cost_readings.json',
        'note': ('测试成本读数登记。**读数零手抄**：由 tools/_rebind_test_cost.py 消费 '
                 'TEST_SUMMARY_JSON=<path> node tests/run.mjs 的结构化摘要后写入'
                 '（summary.tests.slowest / wall / total 与 summary.scope 即真源）。'
                 'scan_cost_truthfulness.mjs 只核对「文档 ↔ 本文件」，自己不跑全量。'
                 '**覆盖范围必须自述**：scope.full=true 才代表一次全量实跑；'
                 '定向采样（full=false）不得作为全量读数使用。'),
        'measured_at': prev.get('measured_at'),
        'latest': entry,
        'rebinds': (rebinds + [entry])[-12:],
    }
    # 只有全量实跑才推进 measured_at（定向采样不得冒充全量）
    if full:
        doc['measured_at'] = ver

    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print('[rebind-cost] 已写 %s（version=%s scope.full=%s tests=%s wall=%ss）'
          % (OUT.relative_to(ROOT), ver, full, tests['total'], tests['wall']))
    return 0


if __name__ == '__main__':
    sys.exit(main())