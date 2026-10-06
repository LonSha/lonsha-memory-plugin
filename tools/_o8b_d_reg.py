#!/usr/bin/env python3
"""v3.286.0 O8 第二刀 C 步：两处登记面（新扫描器 + 新判据套件）。

① tests/audit/audit_scan_probe_matrix.tsv —— 补 scan_cost_truthfulness.mjs 一行。
   三档退出码是**实测**（tools/_o8b_gt_probe.py，形态定义逐字取自该表表头 9~11 行）：
     H = 0  健康树通过
     G = 2  根目录 .js 全删 ⇒ 缺 index.js ⇒ 读不到 VERSION 真源 ⇒ 结构漂移
     T = 2  tests/ 下 .mjs 掏空 ⇒ run.mjs 里 slowest/scope 出口消失 ⇒ 读数无从产出 ⇒ 结构漂移
   ★ 首版两档皆 0（恒绿探测器）—— 正是本条实测把它抓出来的，故两列都非 0 而不是照抄先例的 0/2/0。

② tests/audit/catalog_reference_consumers.tsv —— 补新判据套件一行（该表登记全部 tests/*.test.mjs）。
   实测：加新档后盘上 266 / 登记 265 ⇒ 双向差 1，不补即被守卫点名。

两处都是**表末追加**（矩阵表 J1 按排序比较不看顺序，catalog 表 R7 只查重号），最不易破坏既有行。
幂等：已登记则跳过。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
AUD = ROOT / 'tests' / 'audit'

MATRIX = AUD / 'audit_scan_probe_matrix.tsv'
M_KEY = 'scan_cost_truthfulness.mjs'
M_ROW = (
    'scan_cost_truthfulness.mjs\t0\t2\t2\t'
    '读数真源在场（★ 本行是「首版两档皆 0 ⇒ 恒绿探测器」的修复留痕）：'
    'G 档根 .js 全删 ⇒ 缺 index.js ⇒ 读不到 VERSION 真源 ⇒ exit 2；'
    'T 档 tests/ 下 .mjs 掏空 ⇒ run.mjs 里 slowest/scope 出口消失 ⇒ 「本门所核的读数无从产出」⇒ exit 2。'
    '两档实测（tools/_o8b_gt_probe.py，最小镜像 + LONSHA_AUDIT_ROOT）H/G/T = 0/2/2\n'
)

CATALOG = AUD / 'catalog_reference_consumers.tsv'
C_KEY = 'v3286_cost_truthfulness.test.mjs'
C_ROW = (
    'v3286_cost_truthfulness.test.mjs\t\t'
    'O8 第二刀·测试成本读数真实性门（登记 ↔ 磁盘 / 覆盖范围自述）：'
    'A 结构面 + B1 健康仓 exit 0 + B2~B8 各判据翻红 + C fail-closed（登记缺失/非法 JSON/关键段缺 ⇒ exit 2）'
    '+ D 判据纯度 H5（锚点声明序 + 坐标单命中）+ E 三处真源码破坏（版本说谎 / 热点指向已删档 / full=false 无 patterns）'
    '+ F 自防护 + G 三源同源，并登记进 audit_scan_probe_matrix.tsv（H/G/T = 0/2/2） [v3.286.0]\n'
)


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
    if not MATRIX.exists() or not CATALOG.exists():
        print('[FATAL] 登记表不在场')
        return 1
    print('[o8b-reg] 两处登记面：')
    append_row(MATRIX, M_KEY, M_ROW)
    append_row(CATALOG, C_KEY, C_ROW)
    return 0


if __name__ == '__main__':
    sys.exit(main())