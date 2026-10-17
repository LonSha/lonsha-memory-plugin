#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.345.0 · M4-X7:登记面连带补登(专项套件 + 新模块 return-gate.js)。

覆盖七处落点:
  1 tests/audit/catalog_reference_consumers.tsv   追加 v3445 套件行
  2 tests/v3247_break_kit_consolidation.test.mjs  REGISTRY 追加 v3445 项(用 breakOnce)
  3 tests/v3281_o7_module_copy_ledger.test.mjs    clip / hasPercentKey 两簇成员集 +return-gate.js
  4 tests/v3282_o7_alias_copy_ledger.test.mjs     新簇 KINDS/TRIGGERS(fated-recall ↔ return-gate)
  5 tests/v3283_o7_const_table_copy_ledger.test.mjs  mutating 簇成员集 +return-gate.js
  6 tests/v3283                                  新簇 POLICY(fated-recall ↔ return-gate)
  7 tests/v3283                                  新簇 PERCENT_KEYS(narrative-layer ↔ return-gate)

纪律:每处锚点必须恰中 1 次;**真值取自 /tmp/probe3445_ledger.mjs 在真磁盘上的复算**
(判据体逐字抽自三档真源),不手抄口径;落盘前整份备份;幂等(已含则跳过)。
"""
import io
import os
import sys

ROOT = '/home/user/lonsha-memory-plugin'
BAK = '/tmp/bak3445_reg/'
os.makedirs(BAK, exist_ok=True)


def rd(rel):
    with io.open(os.path.join(ROOT, rel), 'r', encoding='utf-8') as f:
        return f.read()


def wr(rel, s):
    with io.open(os.path.join(ROOT, rel), 'w', encoding='utf-8') as f:
        f.write(s)


def repl_once(s, old, new, label, expect=1):
    n = s.count(old)
    if n != expect:
        sys.stderr.write('!! ABORT %s 命中 %d 次(期望 %d)\n' % (label, n, expect))
        sys.exit(1)
    print('   ok %s(命中 %d)' % (label, expect))
    return s.replace(old, new)


def assert_new(s, probe, label):
    """自证:替换后该飘移点必须已消失(防「替换字面量没覆盖真正被比对的那一处」)。"""
    if probe not in s:
        sys.stderr.write('!! ABORT %s:替换后探针串仍不在(说明改错了地方)\n' % label)
        sys.exit(2)
    print('   self-test %s 探针在场' % label)


def insert_before_ledger_close(s, marker, rows, label):
    """在 `const <marker> = [` 之后最近的第一个 `\\n];` 之前插入 rows。"""
    i = s.find('const %s = [' % marker)
    if i < 0:
        sys.stderr.write('!! ABORT %s:找不到 const %s = [\n' % (label, marker))
        sys.exit(1)
    j = s.find('\n];', i)
    if j < 0:
        sys.stderr.write('!! ABORT %s:找不到登记表收口\n' % label)
        sys.exit(1)
    print('   ok %s(登记表收口 @%d)' % (label, j))
    return s[:j + 1] + rows + s[j + 1:]


def backup(rel):
    p = os.path.join(ROOT, rel)
    b = BAK + rel.replace('/', '__') + '.pre3445reg'
    if not os.path.exists(b):
        with io.open(p, 'r', encoding='utf-8') as f:
            io.open(b, 'w', encoding='utf-8').write(f.read())


# ═══════════ 1. catalog_reference_consumers.tsv ═══════════
TSV = 'tests/audit/catalog_reference_consumers.tsv'
backup(TSV)
tsv = rd(TSV)
if 'v3445_m4x7_return_gate.test.mjs' in tsv:
    print('1 tsv 已含 v3445 行(跳过)')
else:
    if not tsv.endswith('\n'):
        tsv += '\n'
    tsv += (
        'v3445_m4x7_return_gate.test.mjs\t\t'
        '第四期 M4-X7(旧事重现进入真实生成且由玩家控频)的成对套件(**26 条 test**:含 8 条真源码破坏负控制):'
        'A1 宿主五出口各恰一处 + 取库口 `_returnGateLib` + 自检行「控频闸」 + extra_js 110 + **零顶层落盘面** + '
        'worldProg 子键持久化三面齐(constructor/export/import)/ '
        'A2 内核面(RG_VERSION 1 / 三通道 preview·shown·used **分列** / 冷却只认 shown·used / '
        '三策略 off·hint-only·inject / 三闸态 open·held·blocked / 十七原语 / 自证八项)/ '
        'A3 持久化面(跨会话携带 + 删楼摘除 + 楼层前移)/ '
        'B 真跑六条(预览不消耗冷却 + 展示/真用落冷却 + 三通道可分 + 幂等 + 非法通道拒绝;B2 控频强度档三态**不同形**;'
        'B3 重复轰炸闸 + 预览过不算;B4 反馈只是呈现偏好、不删历史标记;B5 不猜冷却 / 不编第 0 楼 / 不产百分比 / 情绪只读;'
        'B6 入参三态不同形)/ '
        'C 宿主出口六条(取真源 / 缺省取数 no-fated 不编候选 / 移交不算已用 / 登记落 worldProg.returnGate + 交界自证 / '
        '缺模块四态降级具名 / 诊断行四方分开说)/ '
        'D1~D8 八条真源码破坏负控制(各带原版阳性对照;D8 破坏的是 memory-organs.js 的 export 面)/ '
        'F1 H5 判据纯度(八锚点在本档各恰 1 次、真源各恰中 1 次)+ F2 H6 工具两向自证 + '
        'G1 版本锚 v3.345.0(下界口径,不锁当版)。\n'
    )
    wr(TSV, tsv)
    print('1 catalog_reference_consumers.tsv 追加 v3445 行')

# ═══════════ 2. v3247 REGISTRY ═══════════
P2 = 'tests/v3247_break_kit_consolidation.test.mjs'
backup(P2)
s2 = rd(P2)
if "'v3445_m4x7_return_gate.test.mjs'," in s2:
    print('2 v3247 已含 v3445 项(跳过)')
else:
    old2 = "    'v3440_m4x6_narrative_layer.test.mjs',\n];"
    new2 = (
        "    'v3440_m4x6_narrative_layer.test.mjs',\n"
        "    /* [v3.345.0 · M4-X7] 本档从 tests/_break_kit.mjs 取 breakOnce\n"
        "     *   (八条真源码破坏:内核五处 —— 冷却只认 shown·used / 默认策略 hint-only /\n"
        "     *   重复轰炸闸 / pref-never 闸 / 注入面闸;宿主三处 —— 候选装配三态不塌 /\n"
        "     *   移交落 worldProg.returnGate / 持久化 export 面);按 B1 台账纪律在此登记。 */\n"
        "    'v3445_m4x7_return_gate.test.mjs',\n];"
    )
    s2 = repl_once(s2, old2, new2, '2 v3247 REGISTRY 追加')
    wr(P2, s2)

# ═══════════ 3. v3281 clip / hasPercentKey 成员集 ═══════════
P3 = 'tests/v3281_o7_module_copy_ledger.test.mjs'
backup(P3)
s3 = rd(P3)
if "'return-gate.js'" in s3:
    print('3 v3281 已含 return-gate(跳过)')
else:
    s3 = repl_once(s3,
        "    ['clip', ['causal-chain.js', 'narrative-layer.js', 'perspective-card.js', 'testimony-board.js'], '3a8dfbfa',",
        "    ['clip', ['causal-chain.js', 'narrative-layer.js', 'perspective-card.js', 'return-gate.js', 'testimony-board.js'], '3a8dfbfa',",
        '3 v3281 clip 成员集 +return-gate')
    assert_new(s3, "perspective-card.js', 'return-gate.js', 'testimony-board.js'], '3a8dfbfa'", '3 clip')
    s3 = repl_once(s3,
        "    ['hasPercentKey', ['narrative-layer.js', 'testimony-board.js'], '680c21ac',",
        "    ['hasPercentKey', ['narrative-layer.js', 'return-gate.js', 'testimony-board.js'], '680c21ac',",
        '3 v3281 hasPercentKey 成员集 +return-gate')
    assert_new(s3, "['hasPercentKey', ['narrative-layer.js', 'return-gate.js', 'testimony-board.js'], '680c21ac'", '3 hasPercentKey')
    wr(P3, s3)

# ═══════════ 4. v3282 新簇 KINDS/TRIGGERS ═══════════
P4 = 'tests/v3282_o7_alias_copy_ledger.test.mjs'
backup(P4)
s4 = rd(P4)
if 'TRIGGERS' in s4:
    print('4 v3282 已含 TRIGGERS 簇(跳过)')
else:
    rows4 = (
        "    /* [v3.345.0 · M4-X7] 内核 `return-gate.js` 自持一份与 `fated-recall.js` **逐字同源**的触发键种类\n"
        "     *   词表(D 包侧叫 `KINDS`、本刀侧叫 `TRIGGERS`,体长 40 —— 名字不同,故按**名**配对的\n"
        "     *   三层判据(v3280 / v3281)整片看不见它,正落入本档射程)。\n"
        "     *   **为什么留两份**:与 PRECHECK/PREVIEW、keyOf/strOf 同族 —— 它是**通用词表原语**;\n"
        "     *   本面是**零依赖 IIFE**(档头声明能力一律经 deps 注入、不引兄弟模块的常量),\n"
        "     *   收拢会把「本模块自足」换成「依赖另一个模块先挂载」(本仓反过的跨模块静默读旧值)。\n"
        "     *   ★ 本行是**当版自报**(与簇同批落盘、同批登记):体长/md5 由判据体在真磁盘上复算得出,\n"
        "     *   非手抄。 */\n"
        "    ['tab', ['KINDS', 'TRIGGERS'], ['fated-recall.js', 'return-gate.js'], 40, '0247fd11'],\n"
    )
    s4 = insert_before_ledger_close(s4, 'ALIAS_LEDGER', rows4, '4 v3282 新簇 KINDS/TRIGGERS')
    assert_new(s4, "['tab', ['KINDS', 'TRIGGERS'], ['fated-recall.js', 'return-gate.js'], 40, '0247fd11'],", '4')
    wr(P4, s4)

# ═══════════ 5~7. v3283 ═══════════
P5 = 'tests/v3283_o7_const_table_copy_ledger.test.mjs'
backup(P5)
s5 = rd(P5)
if 'PERCENT_KEYS' in s5 and 'return-gate.js' in s5:
    print('5~7 v3283 已含当版三条(跳过)')
else:
    s5 = repl_once(s5,
        "    ['mutating', ['narrative-layer.js', 'testimony-board.js'], 107, 'e213741d', '['],",
        "    ['mutating', ['narrative-layer.js', 'return-gate.js', 'testimony-board.js'], 107, 'e213741d', '['],",
        '5 v3283 mutating 成员集 +return-gate')
    assert_new(s5, "['mutating', ['narrative-layer.js', 'return-gate.js', 'testimony-board.js'], 107, 'e213741d', '['],", '5 mutating')
    rows5 = (
        "    /* [v3.345.0 · M4-X7] 内核 `return-gate.js` 自持一份与 `fated-recall.js` **同名同值**的策略表\n"
        "     *   `POLICY`(off / hint-only / inject 三态)。**为什么留两份**:本面是**零依赖 IIFE**,\n"
        "     *   按仓内先例自持一份(不引兄弟模块:跨模块引用常量会把两处抬版变成一处悄悄读旧值);\n"
        "     *   且两模块装载时机互不包含(旧事重现面可缺席而召回建议面在,反之亦然)。\n"
        "     *   ★ 本行是**当版自报**(与字典同批落盘、同批登记),len/md5/decl 与磁盘同源。 */\n"
        "    ['POLICY', ['fated-recall.js', 'return-gate.js'], 47, '0f365575', 'Object.freeze({'],\n"
        "    /* [v3.345.0 · M4-X7] 内核 `return-gate.js` 自持一份与 `narrative-layer.js` **同名同值**的\n"
        "     *   「不许当置信百分比」键名表 `PERCENT_KEYS`。它是**自检原语** —— 每个模块对自己的导出面\n"
        "     *   各算一遍「有没有百分比读数」,收拢成一份等于让两个模块的自证变成一次共用判断;\n"
        "     *   两模块装载时机互不包含。\n"
        "     *   ★ 本行是**当版自报**(与字典同批落盘、同批登记),len/md5/decl 与磁盘同源。 */\n"
        "    ['PERCENT_KEYS', ['narrative-layer.js', 'return-gate.js'], 55, '89619d30', 'Object.freeze(['],\n"
    )
    s5 = insert_before_ledger_close(s5, 'CONST_LEDGER', rows5, '6~7 v3283 新簇 POLICY / PERCENT_KEYS')
    assert_new(s5, "['POLICY', ['fated-recall.js', 'return-gate.js'], 47, '0f365575', 'Object.freeze({'],", '6 POLICY')
    assert_new(s5, "['PERCENT_KEYS', ['narrative-layer.js', 'return-gate.js'], 55, '89619d30', 'Object.freeze(['],", '7 PERCENT_KEYS')
    wr(P5, s5)

print('DONE')