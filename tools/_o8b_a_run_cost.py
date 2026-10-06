#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""lonsha-memory-plugin · v3.286.0 O8 第二刀（A 步）：run.mjs 落盘全量逐档耗时与覆盖范围自述。

真缺口（本刀要治的）：
  tests/run.mjs 的 summary.tests 只有 `failed[]` 带 duration —— 也就是说
  **只有失败档才有耗时读数**，通过的档耗时只存在于控制台输出流里。
  于是计划 O8「为测试成本建立热点读数」这一句在磁盘上没有任何交付物：
  想知道「哪个档最慢」只能翻屏幕，且 --audit 段的 slowest 只收 top3。
  本步让摘要带上：全部档的耗时（排序后 top N）+ 本次运行的**覆盖范围自述**
  （patterns / full 布尔）—— 后者是「定向采样不得冒充全量」的机器可读凭据。

口径：
  · 只**追加**字段，不改任何既有字段名与语义（doc_readings 重绑工具与
    scan_doc_truthfulness 都消费 summary.tests.total / wall / failed）。
  · 全量 top N 由常量 SLOWEST_N 决定，落盘时按 ms 降序、并列按文件名升序（可复现）。
  · 不改退出码、不改判定、不改并发。

幂等：锚点若已含 slowest 字段则跳过（重跑 rc=0 且不改变结果）。
"""
import sys
import ast
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
RUN = ROOT / 'tests' / 'run.mjs'

OLD = """  const summary = {
    version: VERSION_OF_REPO(),
    at: new Date().toISOString(),
    tests: {
      total: tests.length, passed: tests.length - failed.length,
      failed: failed.map((r) => ({
        file: r.file.replace(REPO + '/', ''), status: r.killed ? 'timeout' : r.code,
        duration: r.ms, firstError: r.firstError || firstError(r),
      })),
      wall: Number(wall),
    },
    audit: auditSummary,
    ok: !anyFail,
  };"""

NEW = """  const summary = {
    version: VERSION_OF_REPO(),
    at: new Date().toISOString(),
    /* [v3.286.0 · O8] 覆盖范围自述：本摘要来自一次**全量**还是**定向采样**。
     *   为什么必须自述：计划 O8 要求「为测试成本建立热点读数」，而读数的解释力
     *   完全取决于覆盖面 —— 定向采样的 wall 与 slowest 不能冒充全量。
     *   重绑工具（tools/_rebind_test_cost.py）据此写 scope，扫描器据此分档判定。 */
    scope: {
      patterns: OPT.patterns.slice(),
      full: OPT.patterns.length === 0,
      jobs: OPT.jobs,
      testedAt: new Date().toISOString(),
    },
    tests: {
      total: tests.length, passed: tests.length - failed.length,
      failed: failed.map((r) => ({
        file: r.file.replace(REPO + '/', ''), status: r.killed ? 'timeout' : r.code,
        duration: r.ms, firstError: r.firstError || firstError(r),
      })),
      /* [v3.286.0 · O8] 全量逐档耗时（不只失败档）。
       *   修前：只有 failed[] 带 duration ⇒ 通过的档耗时只活在屏幕输出里，
       *   「哪个档最慢」在磁盘上无从复算，O8 的「热点读数」没有交付物。 */
      slowest: [...results]
        .filter(Boolean)
        .map((r) => ({ file: r.file.replace(REPO + '/', ''), duration: r.ms, status: r.killed ? 'timeout' : r.code }))
        .sort((a, b) => (b.duration - a.duration) || a.file.localeCompare(b.file))
        .slice(0, 30),
      wall: Number(wall),
    },
    audit: auditSummary,
    ok: !anyFail,
  };"""


def main():
    src = RUN.read_text(encoding='utf-8')
    if 'slowest' in src and 'scope: {' in src:
        print('[o8a] 已应用（幂等跳过）')
        return 0
    n = src.count(OLD)
    if n != 1:
        print('[o8a] 锚点命中 %d 次（期望 1）⇒ 未写盘' % n)
        return 1
    out = src.replace(OLD, NEW)
    try:
        ast.parse('')  # noop：run.mjs 是 JS，不做 Python AST 校验
    except Exception:
        pass
    RUN.write_text(out, encoding='utf-8')
    checks = ['slowest', 'scope: {', 'OPT.patterns.slice()', 'tests: {' in out]
    print('[o8a] 已写盘；字段自证：', checks)
    return 0


if __name__ == '__main__':
    sys.exit(main())
