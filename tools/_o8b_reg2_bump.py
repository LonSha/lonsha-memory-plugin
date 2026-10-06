#!/usr/bin/env python3
"""v3.286.0 O8 第二刀收尾：三处登记面 + 抬版。

登记面（新增 2 个扫描器 + 2 个判据套件）：
  ① tests/audit/audit_scan_probe_matrix.tsv —— 补 scan_plan_currency.mjs 一行；
  ② tests/audit/catalog_reference_consumers.tsv —— 补 v3286_cost_truthfulness.test.mjs
     与 v3286_plan_currency.test.mjs 两行（cost 那行本轮已补，脚本按幂等判）。
  ③ tests/audit/plan_currency.tsv —— 本轮已建（PLAN 排序型节名册）。

抬版：调用 tools/_bump3286.py（四源 + 三模块副本 + CHANGELOG + TODO + README/PLAN 读数 + v3285 交棒）。

幂等：登记行按 key 检查；bump 脚本自身按锚点恰中 1 次判定，重复运行会报错退出（不写半份）。
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
AUD = ROOT / 'tests' / 'audit'
MATRIX = AUD / 'audit_scan_probe_matrix.tsv'
CATALOG = AUD / 'catalog_reference_consumers.tsv'

M_KEY = 'scan_plan_currency.mjs'
M_ROW = (
    'scan_plan_currency.mjs\t0\t2\t0\t'
    '读 PLAN.md / plan_currency.tsv / index.js 三个面；'
    'G 档删根 .js ⇒ 缺 index.js ⇒ 读不到 VERSION 真源 ⇒ exit 2；'
    'T 档对它无影响（本门量的是「计划 ↔ 代码版本」与「计划 ↔ 登记」，不读 tests/ 下的测试体），'
    '故如实记 0 —— G 列已非 0，非恒绿探测器。'
    '两档实测（tools/_o8b_gt_probe.py）H/G/T = 0/2/0\n'
)

C_ROWS = [
    ('v3286_cost_truthfulness.test.mjs',
     'O8 第二刀·测试成本读数真实性门的成对套件（12 个 test）：'
     'A 结构面 + B 合成仓 C1/C3/C4/C5/C6 逐条翻红 + C fail-closed（登记/真源失效 ⇒ exit 2）'
     '+ D 健康仓 exit 0 + E 判据纯度 H5（16 锚点声明序 + 单命中）'
     '+ F 六处真源码破坏（C6 / C5 盖章 / C3 在场 / C4 上限 / 面下限 / C7b 真源）'
     '+ G 重绑工具 fail-closed（七种不合用摘要各自 exit 1 且从不落盘）'
     '+ H 自防护与当版锚；扫描器登记进 audit_scan_probe_matrix.tsv（H/G/T = 0/2/2） [v3.286.0]'),
    ('v3286_plan_currency.test.mjs',
     'O8 第二刀·计划陈旧口径门的成对套件（13 个 test）：'
     'A 结构面 + B 合成仓 P1（0/2 个现行节）/P2（旧节无陈旧标记）/P3（执行状态版本错位）'
     '/P4（已交付 Op 复活，含「带状态即放行」防误红对照）/P5（未登记 / 退位项）/P6（契约声明）逐条翻红'
     '+ C fail-closed（PLAN/登记/版本真源失效、行数塌陷 ⇒ exit 2）+ D 健康仓 exit 0'
     '+ E 判据纯度 H5（13 锚点声明序 + 单命中）+ F 五处真源码破坏（P2 / P3 / P4 / P5 / 面下限）'
     '+ G 自防护与当版锚；扫描器登记进 audit_scan_probe_matrix.tsv（H/G/T = 0/2/0） [v3.286.0]'),
]


def append_row(path: Path, key: str, row: str) -> bool:
    src = path.read_text(encoding='utf-8')
    if key in src:
        print('  · %s：已登记 %s，跳过（幂等）' % (path.name, key))
        return False
    if not src.endswith('\n'):
        src += '\n'
    path.write_text(src + row, encoding='utf-8')
    print('  · %s：已追加 %s' % (path.name, key))
    return True


def main():
    for p in (MATRIX, CATALOG):
        if not p.exists():
            print('[FATAL] 登记表不在场：%s' % p)
            return 1
    print('[o8b-reg2] 登记面：')
    append_row(MATRIX, M_KEY, M_ROW)
    for key, desc in C_ROWS:
        append_row(CATALOG, key, key + '\t\t' + desc + '\n')

    print()
    print('[o8b-reg2] 抬版：')
    r = subprocess.run([sys.executable, str(ROOT / 'tools' / '_bump3286.py')],
                       cwd=str(ROOT), capture_output=True, text=True)
    print(r.stdout.strip())
    if r.returncode != 0:
        print(r.stderr.strip())
        return r.returncode
    return 0


if __name__ == '__main__':
    sys.exit(main())