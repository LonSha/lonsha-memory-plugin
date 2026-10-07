#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v3.293.0 收尾：O7 副本账本登记（v3281 / v3282 / v3283 / v3284）

【为什么是「登记」而不是「去重」】
  X6（branch-semantics.js）/ X7（volume-continuation.js）两个新模块之间出现了一批逐字副本：
    · numOf / keyOf                 —— 取整有限数 / 名字归一
    · PRECHECK / PREVIEW（同体别名）—— 预检三档常量表
    · FACES / ACTION                —— 五面清单 / 提案动作三值
  volume-continuation.js 档头**逐字声明**了这份副本是刻意的：
    「本模块自持一份，不引 X6 的常量：跨模块引用常量会把两处的抬版变成一处悄悄读旧值的
      静默错（v3.292 三份副本漂移那一族的同形风险）。两处必须一致这件事由 D 段判据钉住。」
  即：这是**声明过的双实现**（各有独立抬版理由），不是失手抄漏。
  本仓既有口径（v3281 档头边界① / v3282 边界①）正是「只保证登记在案的副本仍在、且新出现的
  必须登记；**不**判定某一族应当收拢到哪里 —— 收拢与否取决于契约，不是文本比对能得出的结论」。
  故正确处置是**补登记 + 留痕为什么留多份**，不是把它们合成一份。

  同理 v3284 新增的两簇（scan_ui_interaction.mjs ↔ scan_ui_runtime.mjs 的 matches / walk，
  自 v3.287.0 起潜伏）：两个 UI 门各自持一份**零依赖 DOM shim**里的小助手；
  让其中一个 import 另一个会引入「门 A 的 shim 改动影响门 B 的判定」—— 与被判对象同罪。

【口径纪律（本轮教训的直接应用）】
  登记值全部取自**磁盘实测**，且与判据**逐字同源**：由 tools/probe_o7_ledger.py 抽取各档判据体
  头部（stripComments 归一化 + blockFrom 配平 + 各枚举器）后转储，md5 与 node --test 报错值逐字一致。
  本脚本只做**机械替换**，每个锚点断言「恰中 1 次」，凡不符即抛。
"""
import io
import sys

ROOT = '/home/user/lonsha-memory-plugin'


def patch(rel, pairs):
    path = ROOT + '/' + rel
    src = io.open(path, encoding='utf-8').read()
    for i, (old, new) in enumerate(pairs):
        n = src.count(old)
        if n != 1:
            raise SystemExit('锚点 #%d 命中 %d 次（须恰 1 次）：%r' % (i, n, old[:90]))
        src = src.replace(old, new)
    io.open(path, 'w', encoding='utf-8').write(src)
    print('patched ' + rel + '（' + str(len(pairs)) + ' 处）')


# ───────────────────────── v3281 · 模块↔模块副本面 ─────────────────────────
patch('tests/v3281_o7_module_copy_ledger.test.mjs', [
    # 头部读数：15 簇 / 60 对 → 17 簇 / 62 对（X6/X7 两簇）
    ("//     实测 **15 个簇 / 60 对**逐字副本，清一色两个族：",
     "//     实测 **17 个簇 / 62 对**逐字副本（v3.293.0 口径；建档时 15 簇 / 60 对，\n"
     "//     X6/X7 两个新模块带来 numOf / keyOf 两簇），清一色两个族："),
    ("//     `.revision += 1`、本地 `function text(`）—— 上面 15 个簇一个都不在它的射程里。",
     "//     `.revision += 1`、本地 `function text(`）—— 上面这批簇一个都不在它的射程里。"),
    ("//     B  读盘实测：15 簇逐字相同；", "//     B  读盘实测：登记的各簇逐字相同；"),
    ("/** 模块面下限（实 79）：", "/** 模块面下限（实 83）："),
    ("/** 簇数下限（实 15）：", "/** 簇数下限（实 17）："),
    # 登记表：追加 X6/X7 两簇（成员集与体 md5 取自磁盘实测，非手抄）
    ("    ['remove', ['parallel-ledger.js', 'secret-ledger.js'], '92e9360b',\n"
     "        '按 ref 删除一条（normalize → find → splice → record 事件），两账各一份'],\n];",
     "    ['remove', ['parallel-ledger.js', 'secret-ledger.js'], '92e9360b',\n"
     "        '按 ref 删除一条（normalize → find → splice → record 事件），两账各一份'],\n"
     "    ['numOf', ['branch-semantics.js', 'volume-continuation.js'], 'e96e56ef',\n"
     "        '取整有限数（未给给 null，不拿 0 冒充「就是 0」）。X6/X7 各自持一份是**声明过的**：\\n'\n"
     "        + 'volume-continuation.js 档头逐字写明「本模块自持一份，不引 X6 的常量 —— 跨模块引用\\n'\n"
     "        + '常量会把两处的抬版变成一处悄悄读旧值的静默错（v3.292 三份副本漂移那一族的同形风险）」'],\n"
     "    ['keyOf', ['branch-semantics.js', 'volume-continuation.js'], 'cb4883eb',\n"
     "        '名字/键归一（去首尾空白；非串给空串）。同上：两模块刻意各持一份，收拢会引入跨模块静默读旧值'],\n];"),
    ("test('v3281 B1. ★★★ 15 簇逐字副本与登记表双向一致（少一个成员即漂移）', () => {",
     "test('v3281 B1. ★★★ 登记簇逐字副本与登记表双向一致（少一个成员即漂移）', () => {"),
])

# ───────────────────────── v3282 · 别名副本面 ─────────────────────────
patch('tests/v3282_o7_alias_copy_ledger.test.mjs', [
    ("//     3 种形态：function 声明 / 类方法 / 常量表与箭头常量，体长下限 30/20）⇒ **8 个簇**：",
     "//     3 种形态：function 声明 / 类方法 / 常量表与箭头常量，体长下限 30/20）⇒ **9 个簇**："),
    ("//       normOp / normRef / normStr    index.js · fuzzy-patch.js · changeset.js · relation-disclosure.js （34）",
     "//       normOp / normRef / normStr    index.js · fuzzy-patch.js · changeset.js · relation-disclosure.js （34）\n"
     "//       PRECHECK / PREVIEW            branch-semantics.js ↔ volume-continuation.js （42，常量表；v3.293.0 补）"),
    ("//     B  读盘实测：8 簇逐字相同；", "//     B  读盘实测：9 簇逐字相同；"),
    ("/** 全仓 items 下限（实 2004）：", "/** 全仓 items 下限（实 2153）："),
    ("/** 别名簇数下限（实 8）：", "/** 别名簇数下限（实 9）："),
    ("    ['fn', ['normOp', 'normRef', 'normStr'], ['changeset.js', 'fuzzy-patch.js', 'index.js', 'relation-disclosure.js'], 34, '311c820d'],\n];",
     "    ['fn', ['normOp', 'normRef', 'normStr'], ['changeset.js', 'fuzzy-patch.js', 'index.js', 'relation-disclosure.js'], 34, '311c820d'],\n"
     "    /* X6/X7：同一个「预检三档」体在两个新模块里挂了两个名字 —— 名字不同，故三层按名配对的\n"
     "     *   判据（v3280/v3281）整片看不见它，正落入本档射程。两模块刻意各持一份（见 v3281 同簇留痕）。 */\n"
     "    ['tab', ['PRECHECK', 'PREVIEW'], ['branch-semantics.js', 'volume-continuation.js'], 42, '9471dab4'],\n];"),
    ("test('v3282 B1. ★★★ 8 个别名簇逐字副本与登记表双向一致（少一个成员即漂移）', () => {",
     "test('v3282 B1. ★★★ 登记别名簇逐字副本与登记表双向一致（少一个成员即漂移）', () => {"),
])

# ───────────────────────── v3283 · 常量表值级副本面 ─────────────────────────
patch('tests/v3283_o7_const_table_copy_ledger.test.mjs', [
    ("//   【本档登记（3 对同名常量表，实测值逐字相同）】",
     "//   【本档登记（5 对同名常量表，实测值逐字相同；v3.293.0 口径，X6/X7 补 2 对）】"),
    ("//     STORAGE_FP_FIELDS        index.js ↔ memory-organs.js    65       md5 70a8fcd9",
     "//     STORAGE_FP_FIELDS        index.js ↔ memory-organs.js    65       md5 70a8fcd9\n"
     "//     FACES                    branch-semantics.js ↔ volume-continuation.js   67  md5 997c2e8b\n"
     "//     ACTION                   branch-semantics.js ↔ volume-continuation.js   44  md5 e7884be8"),
    ("//     三对都在 v3264 / v3266 的 `VERBATIM_CONSTS` 名单里被**按名**登记过（声明在场性），\n"
     "//     本档补的是那份名单缺的**值**这一维（两者互补，非重复）。",
     "//     前三对都在 v3264 / v3266 的 `VERBATIM_CONSTS` 名单里被**按名**登记过（声明在场性），\n"
     "//     本档补的是那份名单缺的**值**这一维（两者互补，非重复）。\n"
     "//     后两对（FACES / ACTION）是 X6/X7 两个新模块刻意各持一份的值级副本 ——\n"
     "//     volume-continuation.js 档头逐字声明「不引 X6 的常量」及其理由（跨模块引用会把两处抬版\n"
     "//     变成一处悄悄读旧值）。**两处必须一致**这件事正由本档 B1 钉住：改任一侧即红。"),
    ("/** 常量表体长下限（实 65 最短）：", "/** 常量表体长下限（实 44 最短）："),
    ("/** 根级 .js 下限（实 80）。 */", "/** 根级 .js 下限（实 84）。 */"),
    ("/** 同名跨文件对下限（实 3）。 */", "/** 同名跨文件对下限（实 5）。 */"),
    ("    ['STORAGE_FP_FIELDS', ['index.js', 'memory-organs.js'], 65, '70a8fcd9', '['],\n];",
     "    ['STORAGE_FP_FIELDS', ['index.js', 'memory-organs.js'], 65, '70a8fcd9', '['],\n"
     "    ['FACES', ['branch-semantics.js', 'volume-continuation.js'], 67, '997c2e8b', 'Object.freeze(['],\n"
     "    ['ACTION', ['branch-semantics.js', 'volume-continuation.js'], 44, 'e7884be8', 'Object.freeze({'],\n];"),
    ("test('v3283 B1. ★★★ 3 对同名常量副本的值逐字相等，且与登记表双向一致', () => {",
     "test('v3283 B1. ★★★ 登记的同名常量副本值逐字相等，且与登记表双向一致', () => {"),
    ("    ok('3 对常量副本值级双向一致；无新增未登记对，无漂移/形态变化');",
     "    ok('登记的同名常量副本值级双向一致；无新增未登记对，无漂移/形态变化');"),
])

# ───────────────────────── v3284 · 审计面副本面 ─────────────────────────
patch('tests/v3284_o7_audit_copy_ledger.test.mjs', [
    ("//   【本档登记（9 簇，实测逐字相同；体长 ≥ 40）】",
     "//   【本档登记（11 簇，实测逐字相同；体长 ≥ 40；v3.293.0 口径，补 2 簇）】"),
    ("//     distributionFace / …       2       218   7fd61df8",
     "//     distributionFace / …       2       218   7fd61df8\n"
     "//     matches                    2       144   e30125e0   ← v3.293.0 补（v3.287.0 起潜伏）\n"
     "//     walk                       2       109   72fd012b   ← v3.293.0 补（v3.287.0 起潜伏）"),
    ("/** audit 面 .mjs 文件数下限（实 58）。 */", "/** audit 面 .mjs 文件数下限（实 62）。 */"),
    ("/** function 体枚举下限（实 165）：", "/** function 体枚举下限（实 180）："),
    ("/** 跨文件簇下限（实 9）。 */", "/** 跨文件簇下限（实 11）。 */"),
    ("    [['read', 'readOrNull'], ['scan_cross_repo_binding.mjs', 'scan_ledger_contract.mjs'], 74, 'b7ad68f6'],\n];",
     "    [['read', 'readOrNull'], ['scan_cross_repo_binding.mjs', 'scan_ledger_contract.mjs'], 74, 'b7ad68f6'],\n"
     "    /* v3.287.0 的 UI 交互门与 v3.271.0 的 UI 运行时门各自持一份**零依赖 DOM shim**，\n"
     "     *   这两个小助手在两个 shim 里逐字相同。刻意各持一份：让其中一门 import 另一门，\n"
     "     *   会引入「门 A 的 shim 改动影响门 B 的判定」—— 与被判对象同罪的自我指涉。 */\n"
     "    ['matches', ['scan_ui_interaction.mjs', 'scan_ui_runtime.mjs'], 144, 'e30125e0'],\n"
     "    ['walk', ['scan_ui_interaction.mjs', 'scan_ui_runtime.mjs'], 109, '72fd012b'],\n];"),
    ("test('v3284 B1. ★★★ 9 簇审计面副本值逐字相等，且与登记表双向一致', () => {",
     "test('v3284 B1. ★★★ 登记的审计面副本值逐字相等，且与登记表双向一致', () => {"),
    ("    ok('9 簇双向一致；无新增未登记簇，无漂移/成员变化/名字变化');",
     "    ok('登记的簇双向一致；无新增未登记簇，无漂移/成员变化/名字变化');"),
])

print('全部四档补丁完成')
