#!/usr/bin/env python3
"""把「需要一次全量实跑才可信」的读数重绑进 tests/audit/doc_readings.json。

为什么存在（O8，v3.284.0）：
  README / PLAN 里的**断言数**只有在一次 `npm test -- --audit` 之后才有真值。
  用一个手抄的数字写进文档 = 经典「文档说 2727、磁盘说别的」漂移源。
  本工具消费 `tests/run.mjs` 的结构化摘要（`TEST_SUMMARY_JSON=<path>` 落盘的 summary），
  把 tests / audit 的真实读数**零手抄**写进登记文件；`scan_doc_truthfulness.mjs`
  再核对「文档 ↔ 登记」，两边都不手抄。

用法：
  TEST_SUMMARY_JSON=/tmp/summary.json node tests/run.mjs --audit
  python3 tools/_rebind_doc_readings.py /tmp/summary.json

退出码：0 写入成功；1 摘要缺失/不合用（fail-closed，不猜）。
  「不合用」= 非真跑 / 非全量 / 版本错位，列举（每一条都是「写了就等于手抄」的形态）：
    · 不是合法 JSON、tests.total 缺失或 <= 0；
    · summary.ok 为 false（失败摘要：把它写进登记等于把「有失败」登记成「0 失败」）；
    · tests.passed + failed != tests.total，或 failed 非空；
    · summary.audit 缺失或结构不对（`--audit` 未跑：审计读数无从谈起）；
    · audit.passed != audit.total（有审计失败）；
    · summary.version 与 index.js 的 VERSION 不一致（拿旧版摘要签当版登记）。
"""
import io
import json
import os
import re
import sys

ROOT = os.environ.get('LONSHA_AUDIT_ROOT') or os.getcwd()
REG = os.path.join(ROOT, 'tests', 'audit', 'doc_readings.json')
IDX = os.path.join(ROOT, 'index.js')


def die(msg):
    sys.stderr.write('[rebind-doc-readings] ' + msg + '\n')
    sys.exit(1)


if len(sys.argv) < 2:
    die('用法：python3 tools/_rebind_doc_readings.py <summary.json>')
src = sys.argv[1]
if not os.path.exists(src):
    die('摘要文件不存在：' + src)
try:
    summary = json.load(io.open(src, encoding='utf-8'))
except Exception as e:
    die('摘要不是合法 JSON：' + str(e))

tests = summary.get('tests') or {}
audit = summary.get('audit') or {}
t_total = tests.get('total')
if not isinstance(t_total, int) or t_total <= 0:
    die('摘要缺 tests.total（不是一次真跑：' + json.dumps(summary)[:200] + '）')

# ── fail-closed ①：失败摘要不得被登记成「0 失败」 ──
if summary.get('ok') is not True:
    die('摘要 ok != true（这是一次**失败或未完成**的实跑）：' + json.dumps(
        {'ok': summary.get('ok'), 'failed': len(tests.get('failed') or [])})[:200])
if tests.get('failed'):
    die('摘要里仍有失败文件 %d 个，拒绝登记为「0 失败」：%s' % (
        len(tests['failed']), json.dumps(tests['failed'][0])[:160]))
t_passed = tests.get('passed')
if not isinstance(t_passed, int) or t_passed != t_total:
    die('摘要通过数不完整（passed=%s / total=%d）—— 只有整片通过才能登记' % (t_passed, t_total))

# ── fail-closed ②：没有审计段就没有审计读数（`--audit` 未跑） ──
if not isinstance(audit, dict) or 'passed' not in audit or 'total' not in audit:
    die('摘要缺 audit 段（未带 `--audit` 跑？）：' + json.dumps(audit)[:200])
if audit['passed'] != audit['total']:
    die('审计段有失败（%s/%s），拒绝登记' % (audit['passed'], audit['total']))

# 断言数：summary 里没有逐文件断言数，故从测试段输出行读取（这是唯一权威来源）。
assertions = None
if isinstance(summary.get('assertions'), int):
    assertions = summary['assertions']
if assertions is None:
    # run.mjs 的 stdout 不在 summary 里；改从同目录的 .log 找（约定：<summary>.log）。
    log = src + '.log'
    if os.path.exists(log):
        text = io.open(log, encoding='utf-8').read()
        m = re.search(r'通过断言 (\d+)', text)
        if m:
            assertions = int(m.group(1))
if assertions is None:
    die('拿不到断言数：请按 `TEST_SUMMARY_JSON=%s node tests/run.mjs --audit > %s.log 2>&1` 跑一次' % (src, src))

idx = io.open(IDX, encoding='utf-8').read()
vm = re.search(r"const VERSION = '([0-9]+[.][0-9]+[.][0-9]+)'", idx)
if not vm:
    die('index.js 里读不到 const VERSION')
version = vm.group(1)

# ── fail-closed ③：摘要版本必须就是当前版本（否则是用旧版摘要签当版） ──
sv = summary.get('version')
if sv != version:
    die('摘要版本 %s ≠ index.js 当前版本 %s（旧摘要不得签当版；请在本版重跑全量）' % (sv, version))

audit_passed = audit.get('passed')
audit_total = audit.get('total')

prev = {}
if os.path.exists(REG):
    try:
        prev = json.load(io.open(REG, encoding='utf-8'))
    except Exception:
        prev = {}

hub = dict(prev)
hub.update({
    'file': 'tests/audit/doc_readings.json',
    'note': ('README / PLAN 里「需要一次全量实跑才可信」的读数登记。**读数零手抄**：由 '
             'tools/_rebind_doc_readings.py 消费 TEST_SUMMARY_JSON=<path> node tests/run.mjs --audit '
             '的摘要写入。scan_doc_truthfulness.mjs 只核对「文档 ↔ 本文件」，自己不跑全量（审计段跑全量会自指）。'),
    'measured_at': 'v' + version,
    'version': version,
    'tests_total': t_total,
    'assertions': assertions,
    'audit_passed': audit_passed,
    'audit_total': audit_total,
    'source': 'node tests/run.mjs --audit（TEST_SUMMARY_JSON 落盘的结构化摘要）',
})
# 历史留痕（与 host_beast_baseline 同口径：不覆盖，追加）
h = hub.setdefault('rebinds', {})
h['v' + version] = {'tests_total': t_total, 'assertions': assertions, 'audit': '%s/%s' % (audit_passed, audit_total)}

io.open(REG, 'w', encoding='utf-8', newline='\n').write(json.dumps(hub, ensure_ascii=False, indent=1) + '\n')
print('[rebind-doc-readings] 已写入 v%s：测试 %d / 断言 %d / 审计 %s/%s'
      % (version, t_total, assertions, audit_passed, audit_total))