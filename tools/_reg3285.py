#!/usr/bin/env python3
"""v3.285.0 登记面同步：新档 tests/v3285_o7_doc_truthfulness.test.mjs 必须在两处台账登记。

为什么用脚本而不是手改：
  这两处登记面都是「追加式单行」，手改容易在长文件里插错位置；
  脚本对每个替换断言「恰中 1 次」，失配即退出、不写盘（v3.279+ 惯例）。

两处：
  R1 tests/audit/catalog_reference_consumers.tsv —— 在役测试面登记表（v3204 P3 判据读它）
  R2 tests/v3247_break_kit_consolidation.test.mjs 的 REGISTRY —— 接收方台账（B1 台账纪律）
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')

R1_ANCHOR = "v3284_o7_audit_copy_ledger.test.mjs"
R1_LINE = (
    "v3285_o7_doc_truthfulness.test.mjs\t\t"
    "O8 第一刀·文档读数真实性门（README/PLAN 的人读读数核回磁盘真源）：把「当前在役面」与"
    "「最近一次全量实跑快照」拆成两条读数 —— 新增测试文件只动在役面行，不逼人提前跑全量；"
    "未实跑时文档必须标「全量待验」，且反向也判（已对齐却仍标待验同样翻红）。"
    "A 结构面 / B1 健康仓 exit 0 / B2~B6 各判据翻红 / B2b README 全体现值口径"
    "（非现值数字须自带时点前缀，24 字符前置窗口，防同行快照版本号把整行豁免）/ C fail-closed"
    "（文档或登记缺失 ⇒ exit 2）/ D 历史口径豁免 / E 判据纯度 H5（11 个锚点声明序）"
    "/ F 六处真源码破坏（摘 D1 比较 / 摘 D3 自相矛盾 / 摘 D6 滞后整支 / 摘 D6 反向判据"
    " / 摘 D2b 时点豁免 / 拔面下限）/ G 自防护 / H 三源同源当版锚"
    " / J 重绑工具 fail-closed（七种不合用摘要各自 exit 1 且从不落盘）。"
    "★ 本刀最重的设计决定：把「登记版本 != 当前版本」与「文档说谎」分开 —— 前者是新增文件的正常状态，"
    "后者才是缺陷；混在一处会让「加个测试」与「文档骗人」同形，逼人用全量去区分。 [v3.285.0]"
)

R2_ANCHOR = "    'v3284_o7_audit_copy_ledger.test.mjs',\n"
R2_LINE = (
    "    /* [v3.285.0 O8 第一刀] 本档从 tests/_break_kit.mjs 取 breakSource / assertSingleHit\n"
    "     *   （六处真源码破坏：摘 D1 比较 / 摘 D3 自相矛盾 / 摘 D6 快照滞后整支 / 摘 D6 反向判据 /\n"
    "     *   摘 D2b 时点豁免 / 拔面下限，锚点取自 tests/audit/scan_doc_truthfulness.mjs）；按 B1 台账纪律在此登记。 */\n"
    "    'v3285_o7_doc_truthfulness.test.mjs',\n"
)

EDITS = [
    ('R1 catalog_reference_consumers.tsv 追加在役测试登记行',
     ROOT / 'tests/audit/catalog_reference_consumers.tsv',
     R1_ANCHOR, R1_ANCHOR + '\n' + R1_LINE),
    ('R2 v3247 REGISTRY 追加接收方登记行',
     ROOT / 'tests/v3247_break_kit_consolidation.test.mjs',
     R2_ANCHOR, R2_ANCHOR + R2_LINE),
]

done = []
for label, path, old, new in EDITS:
    src = path.read_text(encoding='utf-8')
    n = src.count(old)
    if n != 1:
        print('[FATAL] %s：锚点在 %s 命中 %d 次（必须恰 1 次），不写盘' % (label, path.name, n))
        sys.exit(1)
    path.write_text(src.replace(old, new, 1), encoding='utf-8')
    done.append(label)

print('[reg3285] 完成 %d 处登记：' % len(done))
for d in done:
    print('  - ' + d)