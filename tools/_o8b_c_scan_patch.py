#!/usr/bin/env python3
"""v3.286.0 O8 第二刀 C 步：给 scan_cost_truthfulness.mjs 补两条「读数真源在场」检查。

为什么必须补（本轮实测的真问题，不是设计洁癖）：
  tests/v3226_audit_sensitivity.test.mjs 的 J3 要求每个在役扫描器**对 G 或 T 至少一档敏感**
  （两档皆 0 ⇒ 恒绿探测器）。首版 scan_cost_truthfulness.mjs 实测：
    · G（镜像根目录 .js 全删）⇒ 它只读 tests/ 面，登记照旧可解析 ⇒ exit 0（不敏感）；
    · T（tests/ 下 .mjs 置为 `// gutted`）⇒ **文件名还在**，「磁盘测试档 265 个」照旧成立
      ⇒ exit 0（不敏感）。
  两档皆 0 ⇒ 恒绿探测器。而这恰是本仓反复记录的最坏形态：它永远通过，人以为有它守着。

修法（两条都指向本门**真实存在**的前提，不是为凑敏感度而加戏）：
  ① index.js 的 `const VERSION` —— 「登记版本 vs 当前版本」比对的唯一真源（C8 用它）；
  ② tests/run.mjs 的 `slowest` / `scope` 出口 —— 本门所核读数的**产出者**。
     若它不在场或被掏空（T 档形态），登记就是一份「无从产出的孤证」⇒ 结构漂移 exit 2。
  ⇒ G 档缺 index.js ⇒ exit 2；T 档掏空 run.mjs ⇒ exit 2。两档皆敏感，非恒绿探测器。

幂等性（首版踩坑留痕）：首版锚点原文出现在替换文本开头 ⇒ 重跑会**再插一遍**（141→218 行）。
  现改为哨兵前置检查：源码里已在 C7b 标记 ⇒ 直接跳过，绝不二次插入。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
SCAN = ROOT / 'tests' / 'audit' / 'scan_cost_truthfulness.mjs'
SENTINEL = 'C7b 读数真源在场'

A_ANCHOR = """if (!fs.existsSync(REG)) drift('缺少测试成本读数登记 tests/audit/test_cost_readings.json ⇒ 读数不存在，拒绝给结论');
"""
A_NEW = """if (!fs.existsSync(REG)) drift('缺少测试成本读数登记 tests/audit/test_cost_readings.json ⇒ 读数不存在，拒绝给结论');

/* ---------- C7b 读数真源在场（★ 本条让本门不是恒绿探测器）----------
 * 【为什么必须有这一条】本门只读 tests/ 面 ⇒ 对 G（根 .js 全删）与 T（tests/ 下 .mjs 掏空）
 *   两档都无反应，而 v3226 的 J3 判定「两档皆 0 = 恒绿探测器」（永远通过，人以为有它守着）。
 *   补的两条都不是为凑敏感度，而是本门**真实存在的前提**：
 *     ① index.js 的 `const VERSION`：C8「登记版本不得高于代码版本」的唯一真源；
 *     ② tests/run.mjs 的 slowest / scope 出口：本门所核读数的**产出者**。
 *        T 档把 tests/ 下的 .mjs 置为 `// gutted` ⇒ run.mjs 里这两个出口必然消失，
 *        此时登记是一份「无从产出的孤证」⇒ 如实报结构漂移（exit 2），不报通过。 */
const IDX = path.join(ROOT, 'index.js');
if (!fs.existsSync(IDX)) drift('缺少 index.js ⇒ 读不到 VERSION 真源，无法核对登记版本，结构漂移');
const idxSrc = fs.readFileSync(IDX, 'utf8');
const vMatch = /const VERSION = '([0-9]+[.][0-9]+[.][0-9]+)'/.exec(idxSrc);
if (!vMatch) drift('index.js 里读不到 const VERSION ⇒ 真源失效，结构漂移');
const VERSION = vMatch[1];

const RUNNER = path.join(TESTS, 'run.mjs');
if (!fs.existsSync(RUNNER)) drift('缺少 tests/run.mjs ⇒ 成本读数没有产出者，结构漂移');
const runSrc = fs.readFileSync(RUNNER, 'utf8');
for (const pair of [['slowest', '逐档耗时出口 tests.slowest'],
    ['scope', '覆盖范围自述出口 summary.scope']]) {
    if (!runSrc.includes(pair[0])) {
        drift('tests/run.mjs 里读不到 ' + pair[1] + ' ⇒ 本门核的读数无从产出，结构漂移');
    }
}
"""

B_ANCHOR = """const wall = Number(L.tests_wall_s);
if (!Number.isFinite(wall) || wall <= 0) bad('latest.tests_wall_s 不合法：' + L.tests_wall_s);
"""
B_NEW = """const wall = Number(L.tests_wall_s);
if (!Number.isFinite(wall) || wall <= 0) bad('latest.tests_wall_s 不合法：' + L.tests_wall_s);

// ---------- C8 版本不自相矛盾 ----------
// 登记声称「这是 vX.Y.Z 的一次实跑」—— 它**不可能**是比代码当前版本更新的版本跑出来的。
// 这条用上了 C7b 的 VERSION 真源（否则那项读出来只用于一条 exit 2，等于没判）。
const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
if (typeof L.version === 'string' && /^[0-9]+[.][0-9]+[.][0-9]+$/.test(L.version)) {
    if (vnum(L.version) > vnum(VERSION)) {
        bad('登记版本 ' + L.version + ' 高于代码当前版本 ' + VERSION
            + '（读数是未来的，不可能来自任何一次实跑）');
    }
} else {
    bad('latest.version 不是语义化版本：' + String(L.version));
}
"""

src = SCAN.read_text(encoding='utf-8')
if SENTINEL in src:
    print('[o8b-c] 哨兵已在场（%s）⇒ 已应用过，不重复插入（幂等）' % SENTINEL)
    sys.exit(0)

for name, anchor, new in [('A', A_ANCHOR, A_NEW), ('B', B_ANCHOR, B_NEW)]:
    n = src.count(anchor)
    if n != 1:
        print('[FATAL] 锚点 %s 命中 %d 次（必须恰 1 次），不写盘' % (name, n))
        sys.exit(1)
    src = src.replace(anchor, new, 1)

SCAN.write_text(src, encoding='utf-8')
print('[o8b-c] 已给 scan_cost_truthfulness.mjs 补 C7b（真源在场：index.js VERSION + run.mjs 出口）与 C8（版本不自相矛盾）')
print('[o8b-c] 新行数 = %d' % (src.count('\n') + 1))