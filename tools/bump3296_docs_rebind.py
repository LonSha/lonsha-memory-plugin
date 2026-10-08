#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.296.0 收口轮 · 文档读数重绑（README / PLAN 的「全量待验」→ 实测快照）。

前置：tests/audit/doc_readings.json 已由 tools/_rebind_doc_readings.py 重绑为
      v3.296.0 / 277 测试文件 / 2986 断言 / 审计 59-59（真跑摘要）。
本脚本只把两份文档的**文字**对齐登记值（读数仍来自登记，不手抄）：

  R1 README「最近一次全量实跑快照」四元组 → v3.296.0 · 277 · 2986 · 59/59，
     并撤掉「当前版本 v3.296.0 **全量待验**」——登记已对齐当前版本，
     再留待验标记会被 D6 的反向判据判红（「把已实跑说成没跑」）。
  P1 PLAN 同一四元组 + 撤待验标记。
  P2 PLAN 体量行：index.js 15325 → 15329 行、探针读数 15326/568 → 15329/568。
"""
import io
import sys
import hashlib

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3296/'
PATCHES = []


def add(rel, old, new, note):
    PATCHES.append((rel, old, new, note))


# ── R1 README 完整快照行（含待验标记，整行替换） ──
add('README.md',
    '**最近一次全量实跑快照**（`tests/audit/doc_readings.json`，由 `tools/_rebind_doc_readings.py` 消费 `TEST_SUMMARY_JSON` 零手抄写入）：v3.284.0 · 264 个测试文件 · 2727 断言 · 0 失败 · 审计 55/55。当前版本 v3.296.0 **全量待验** —— 新增文件进入在役面，但不得冒充已通过（按用户纪律：计划全部内容完成前不跑全量）。两处读数**刻意分开**：合成一条就会把「盘上多了几个文件」写成「整片已通过」。',
    '**最近一次全量实跑快照**（`tests/audit/doc_readings.json`，由 `tools/_rebind_doc_readings.py` 消费 `TEST_SUMMARY_JSON` 零手抄写入）：v3.296.0 · 277 个测试文件 · 2986 断言 · 0 失败 · 审计 59/59。本版**已实跑**（X 系列八条全部交付 ⇒ 计划收口点，按纪律在此跑一次全量；上一快照为 v3.284.0 · 264 · 2727 · 55/55）。两处读数**刻意分开**：合成一条就会把「盘上多了几个文件」写成「整片已通过」。',
    'R1 README 快照四元组 + 撤待验')

# ── P1 PLAN 优化计划行的「全量待验」表述（在门禁纪律行） ──
add('PLAN.md',
    '> · **门禁纪律**：用户指令「做完计划全部内容前别跑全量」仍然有效 —— 只跑单门 / 单套件；全量 `npm test`、`npm test -- --audit` 与依赖其产物的断言重绑，集中到计划收口后跑一次。文档如实标「**全量待验**」，由 `scan_doc_truthfulness.mjs` 把守。',
    '> · **门禁纪律**：用户指令「做完计划全部内容前别跑全量」仍然有效 —— 只跑单门 / 单套件；全量 `npm test`、`npm test -- --audit` 与依赖其产物的断言重绑，集中到计划收口后跑一次。**本版即该收口点**：X 系列八条全部交付后已跑一次全量（v3.296.0 · 277 文件 · 2986 断言 · 0 失败 · 审计 59/59，登记见 `doc_readings.json`），故下方快照行不再是「待验」而是实测读数；后续再动盘面仍须回到「未实跑即标待验」的口径，由 `scan_doc_truthfulness.mjs` 把守。',
    'P1 PLAN 门禁纪律行如实改写')

# ── P2 PLAN 快照行 + 体量行 ──
add('PLAN.md',
    '| 全量快照 | 最近全量快照 **v3.284.0：264 测试文件 / 2727 断言 0 失败 / 审计 55/55**；当前 v3.296.0 **全量待验** | `tests/audit/doc_readings.json` |',
    '| 全量快照 | 最近全量快照 **v3.296.0：277 测试文件 / 2986 断言 0 失败 / 审计 59/59**（上一快照 v3.284.0：264 / 2727 / 55/55） | `tests/audit/doc_readings.json` |',
    'P2 PLAN 快照行')

add('PLAN.md',
    '| 体量 | `index.js` **15325 行**（物理行；探针读数 15326 行 / **568** 成员 —— 原 A1 六刀后为 13883 / 521）+ extra_js **85** 项 | `wc -l` / `manifest.json` / `host_beast_baseline.json` |',
    '| 体量 | `index.js` **15329 行**（物理行；探针读数 15329 行 / **568** 成员 —— 原 A1 六刀后为 13883 / 521）+ extra_js **85** 项 | `wc -l` / `manifest.json` / `host_beast_baseline.json` |',
    'P3 PLAN 体量行')


def sha(t):
    return hashlib.sha256(t.encode('utf-8')).hexdigest()[:12]


def main():
    bad = 0
    for rel, old, new, note in PATCHES:
        src = io.open(ROOT + rel, encoding='utf-8').read()
        n = src.count(old)
        print('%-6s %-52s 命中=%d' % (('OK' if n == 1 else 'BAD'), rel + ' :: ' + note, n))
        if n != 1:
            bad += 1
    if bad:
        print('锚点校验未通过（%d 处），未写盘。' % bad)
        sys.exit(2)
    touched = {}
    for rel, old, new, note in PATCHES:
        touched[rel] = touched.get(rel, io.open(ROOT + rel, encoding='utf-8').read()).replace(old, new, 1)
    for rel, out in touched.items():
        old = io.open(ROOT + rel, encoding='utf-8').read()
        io.open(BAK + rel + '.pre3296doc', 'w', encoding='utf-8').write(old)
        io.open(ROOT + rel, 'w', encoding='utf-8').write(out)
        print('write %-12s %d → %d 字节 (sha %s → %s)' % (rel, len(old.encode('utf-8')), len(out.encode('utf-8')), sha(old), sha(out)))
    print('DONE 写盘文件数 = %d' % len(touched))


if __name__ == '__main__':
    main()