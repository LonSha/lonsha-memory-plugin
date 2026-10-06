#!/usr/bin/env python3
"""v3.286.0 O8 第二刀收尾二：
  ① CHANGELOG 顶节补第 5 条踩坑留痕（登记面是四处，不是三处）；
  ② 成本读数登记刷新为**新一轮定向采样**（含两个新档，口径同为 full=false）。

① 为什么值得写：本刀先后踩到四处登记面（audit_scan_probe_matrix / catalog_reference_consumers /
   plan_currency / v3247 接收方台账），前三处是计划里预见的，第四处是**跑关联套件才暴露**的。
   「新增一个测试档要登记几处」这句话此前在文档里没有答案 —— 留痕后下一个人不必再踩。

② 为什么刷：本刀建了成本读数，而两个新档进来后旧读数不覆盖它们；用定向采样（不跑全量）
   刷新一次，既让读数反映现状，又守住「定向采样不得冒充全量」（scope.full 仍为 false，
   measured_at 仍为 null）。
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
CL = ROOT / 'CHANGELOG.md'
SENTINEL = '本仓的测试档登记面一共**四处**'

NEW_BULLET = (
    '- ★ **登记面是「四处」而不是「三处」（本刀实测踩到第四处）**：新增一个测试档/扫描器，'
    '必须逐处核对 —— ① `tests/audit/audit_scan_probe_matrix.tsv`（在役扫描器灵敏度矩阵，'
    '`v3226` 双向齐全硬校验）；② `tests/audit/catalog_reference_consumers.tsv`（在役测试面名册，'
    '`scan_ledger_contract` R7 + 跨仓守卫）；③ `tests/audit/plan_currency.tsv`（排序型节名册，本刀新建）；'
    '④ `tests/v3247_break_kit_consolidation.test.mjs` 里的 `REGISTRY` 接收方台账（**跑关联套件才暴露**：'
    '「磁盘上新增了接收方却没登记」）。前三处是计划里预见的，第四处不是 —— '
    '「新增一个档要登记几处」此前在文档里没有答案，此处留痕。\n'
    '  另附抬版面的一条同族教训：本仓抬版脚本所谓「四源」实际是**五源** —— '
    'README 的「**当前版本**：`x.y.z`」行也被 `scan_doc_truthfulness` D1 硬校验，'
    '`_bump3286.py` 首版漏了它（文档门当场抓出）。\n'
    '\n')


def main():
    cl = CL.read_text(encoding='utf-8')
    if SENTINEL in cl:
        print('[o8b-tail] CHANGELOG 已含该条（幂等）')
    else:
        anchor = '- **本刀两个交付档的自述读数**'
        n = cl.count(anchor)
        if n != 1:
            sys.exit('[o8b-tail] 锚点命中 %d 次（要求恰 1 次）' % n)
        CL.write_text(cl.replace(anchor, NEW_BULLET + anchor, 1), encoding='utf-8')
        print('[o8b-tail] CHANGELOG 顶节已补第四处登记面留痕')

    print('[o8b-tail] 刷新成本读数（定向采样，含两个新档）：')
    s = ROOT / 'tests' / 'audit' / 'test_cost_readings.json'
    before = s.read_text(encoding='utf-8')
    r = subprocess.run(
        'TEST_SUMMARY_JSON=/tmp/lmp_cost_sample2.json node tests/run.mjs '
        'v3273 v3275 v3280 v3281 v3282 v3283 v3284 v3285 v3286 v3286_cost v3286_plan',
        shell=True, cwd=str(ROOT), capture_output=True, text=True)
    tail = (r.stdout or '').strip().split('\n')[-3:]
    print('  ' + '\n  '.join(tail))
    r2 = subprocess.run([sys.executable, str(ROOT / 'tools' / '_rebind_test_cost.py'),
                         '/tmp/lmp_cost_sample2.json'], cwd=str(ROOT), capture_output=True, text=True)
    print('  ' + (r2.stdout or '').strip())
    if r2.returncode != 0:
        print('  ' + (r2.stderr or '').strip())
        return r2.returncode
    after = s.read_text(encoding='utf-8')
    print('  登记已刷新：%s' % ('是' if after != before else '否（内容未变）'))
    return 0


if __name__ == '__main__':
    sys.exit(main())