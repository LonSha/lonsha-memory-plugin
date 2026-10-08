#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.296.0 收口轮 · 全量暴露的四缺陷补丁（一次性）。

四处，逐一锚点校验，全部通过后统一写盘：
  A  v3281 LEDGER 补登 X1 带来的 text#fb00e488 模块↔模块簇（磁盘实测 18 簇 / 63 对）
  B  index.js:2978 召回解释的 audit.floor 旧判据 → 走 _numOrNull
  C  v3288 D 段事实面交棒：X 系列八条全交付后，「未交付显式在列」改为「八条编号全在列且带显式状态词」
  D  v3145 租约捕获点数量硬锁 → 分割窗口结构不变量（每处捕获点必须被 _leaseValid 消费）
"""
import io
import sys
import hashlib

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3296/'

PATCHES = []   # (相对路径, 锚点, 替换, 说明)


def add(rel, anchor, repl, note):
    PATCHES.append((rel, anchor, repl, note))


# ───────────────────────── A. v3281 副本台账补登 ─────────────────────────
A_REL = 'tests/v3281_o7_module_copy_ledger.test.mjs'
add(A_REL,
    "    ['keyOf', ['branch-semantics.js', 'volume-continuation.js'], 'cb4883eb',\n"
    "        '名字/键归一（去首尾空白；非串给空串）。同上：两模块刻意各持一份，收拢会引入跨模块静默读旧值'],\n"
    "];",
    "    ['keyOf', ['branch-semantics.js', 'volume-continuation.js'], 'cb4883eb',\n"
    "        '名字/键归一（去首尾空白；非串给空串）。同上：两模块刻意各持一份，收拢会引入跨模块静默读旧值'],\n"
    "    ['text', ['evidence-query.js', 'evidence-workbench.js'], 'fb00e488',\n"
    "        '空白归一 + 可选截断的文本原语（v3.296.0 X1 的结构化查询与 v3.214.0 工作台各持一份）。\\n'\n"
    "        + '**为什么留两份**：它是**通用文本原语**，不是账本条目结构的取值代码 —— evidence-query 档头\\n'\n"
    "        + '声明「条目结构不在这里再声明一遍」指的是**哪本账取哪个字段**（那部分走 opts.ledgers 复用\\n'\n"
    "        + '工作台的 LEDGERS 表），而 text() 只吃一个值、不认识任何账本字段。两模块的装载时机与\\n'\n"
    "        + '存活期互不包含（工作台可缺席而查询在），把查询面改成从工作台取这个原语，会把\\n'\n"
    "        + '「本模块自足」换成「依赖另一个模块先挂载」——那正是本仓反过的「跨模块静默读旧值」形态'],\n"
    "];",
    'A1 补登 text 簇')

add(A_REL,
    "//     实测 **17 个簇 / 62 对**逐字副本（v3.293.0 口径；建档时 15 簇 / 60 对，\n"
    "//     X6/X7 两个新模块带来 numOf / keyOf 两簇），清一色两个族：",
    "//     实测 **18 个簇 / 63 对**逐字副本（v3.296.0 口径；建档时 15 簇 / 60 对，\n"
    "//     X6/X7 两个新模块带来 numOf / keyOf 两簇，X1 的 evidence-query 带来 text 一簇），清一色两个族：",
    'A2 档头读数 17/62 → 18/63')

add(A_REL,
    "//     scan_ledger_contract.mjs 的 R3，而它只钉三个字面量（`revision: finite(`、\n"
    "//     `.revision += 1`、本地 `function text(`）—— 上面这批簇一个都不在它的射程里。\n"
    "//     于是这 60 对里任何一对漂移，本仓没有任何东西会响（与 v3.279.0「形态面漏一类」",
    "//     scan_ledger_contract.mjs 的 R3，而它只钉三个字面量（`revision: finite(`、\n"
    "//     `.revision += 1`、本地 `function text(`）—— 上面这批簇里**只有 text 在它的射程内**\n"
    "//     （R3 认出 text 正是「不该有两份」，但把「哪两份、是否已登记」留给本档，故本档须登记它）。\n"
    "//     于是这 63 对里任何一对漂移，本仓没有任何东西会响（与 v3.279.0「形态面漏一类」",
    'A3 档头射程表述对齐（text 其实在 R3 射程内）')

# ───────────────────────── B. index.js 旧判据收口 ─────────────────────────
B_REL = 'index.js'
add(B_REL,
    "                        floor: Number.isFinite(Number(_rec.floor)) ? Number(_rec.floor) : null,",
    "                        /* [v3.296.0 收口] 走真源口的「数或 null」：旧判据 `Number.isFinite(Number(x))`\n"
    "                         *   会把 null / '' / [] 一律读成 **0**（`Number(null) === 0`），于是「楼层未记」\n"
    "                         *   与「第 0 楼」塌成同形 —— 与本档 recall-explain.js 消费 audit.floor 的口径冲突。 */\n"
    "                        floor: this._numOrNull(_rec.floor),",
    'B1 audit.floor 走 _numOrNull')

# ───────────────────────── C. v3288 D 段事实面交棒 ─────────────────────────
C_REL = 'tests/v3288_plan_currency_xface.test.mjs'
add(C_REL,
    "    /* [v3.292.0 抬版交棒] 原断言写死「X2–X8 尚未实施」—— X3/X4/X5/X6 陆续交付后该形态必然翻红。\n"
    "     *   事实面断言应钉**结构**（未交付项必须显式在列 + 已交付项必须标已交付），\n"
    "     *   而不是钉某一版的编号集合（否则每交付一项就要回头改历史档 = T1 抬版仪式）。\n"
    "     *   本条仍能抓真缺陷：X2 被静默摘掉、或已交付项漏标状态，都会翻红。 */\n"
    "    assert.ok(/X2\\b/.test(xLine) && /尚未实施/.test(xLine), 'X2 未交付须在现状节显式在列（不得静默摘掉）');",
    "    /* [v3.292.0 抬版交棒] 原断言写死「X2–X8 尚未实施」—— X3/X4/X5/X6 陆续交付后该形态必然翻红。\n"
    "     *   事实面断言应钉**结构**（未交付项必须显式在列 + 已交付项必须标已交付），\n"
    "     *   而不是钉某一版的编号集合（否则每交付一项就要回头改历史档 = T1 抬版仪式）。\n"
    "     *   本条仍能抓真缺陷：X2 被静默摘掉、或已交付项漏标状态，都会翻红。\n"
    "     *\n"
    "     * [v3.296.0 二次交棒] X 系列八条**全部交付**后，「X2 未交付须在列」这条前提消失\n"
    "     *   （再要求某个编号标「尚未实施」就是要求文档说假话）。等价结构不变量重述为两条：\n"
    "     *   ① 八个编号**一个都不能被静默摘掉**（原文「不得静默摘掉」的不变量部分，与本轮\n"
    "     *      X1 补登台账同族：数量随交付增长的东西，判据要钉「在列」而不是钉「哪几个不在列」）；\n"
    "     *   ② 在列的每个编号**必须带显式状态词**（已交付 / 尚未实施），不得无状态裸列 ——\n"
    "     *      这条才是「已交付项漏标状态」的真拦网，也覆盖将来新开编号时的「漏标」形态。 */\n"
    "    for (const n of ['X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'X8']) {\n"
    "        assert.ok(new RegExp(n + '\\\\b').test(xLine), n + ' 须在现状节显式在列（不得静默摘掉）');\n"
    "    }\n"
    "    assert.ok(/X2\\b[^；;]*?(已交付|尚未实施)/.test(xLine),\n"
    "        'X2 须带显式状态词（已交付 / 尚未实施），不得无状态裸列');",
    'C1 D 段事实面交棒')

# ───────────────────────── D. v3145 捕获点结构不变量 ─────────────────────────
D_REL = 'tests/v3145_restore_lock.test.mjs'
add(D_REL,
    "    assert.equal((src.match(/epoch: this\\._mutationEpoch \\}/g) || []).length, 3, '三处租约捕获发起时栅栏（排除 _lastEpochBump 的记录字段）');",
    "    /* [v3.296.0 抬版交棒] 原写死「恰 3 处」—— 该形态是 v3.145.0 的一次性事实；\n"
    "     *   v3.292.0 起 X6（分支导入）/ X7（分卷接续）/ X2（修复计划）的宿主真实接线\n"
    "     *   各新增一个同形捕获点，实测已 6 处。锁当版字面量会把**活跃功能增长**判红\n"
    "     *   （本仓明令禁止：删断言 = 洗断言，锁当版 = 假绿，两者都不取）。\n"
    "     *   改钉**版本无关的结构不变量**：\n"
    "     *   ① 捕获点数 >= 3（原先那三处老路径不得消失）；\n"
    "     *   ② **每一处捕获点都必须在同一段内被 `_leaseValid` 消费** —— 只看数量不看消费，\n"
    "     *      「捕获了身份却从不核」这一真缺陷会整个漏网（那正是本条要防的）。\n"
    "     *      配对方式是**分割窗口**：每处捕获点到下一处捕获点（末处到文件尾）之间必须有校验。 */\n"
    "    const CAP_RE = /epoch: this\\._mutationEpoch \\}/g;\n"
    "    const caps = [...src.matchAll(CAP_RE)].map((m) => m.index);\n"
    "    assert.ok(caps.length >= 3, '租约捕获点不得少于 3 处（实 ' + caps.length + '）');\n"
    "    caps.forEach((at, i) => {\n"
    "        const to = (i + 1 < caps.length) ? caps[i + 1] : src.length;\n"
    "        const win = src.slice(at, to);\n"
    "        assert.ok(/this\\._leaseValid\\(/.test(win),\n"
    "            '第 ' + (src.slice(0, at).split('\\n').length) + ' 行的租约捕获点必须在同段内被 _leaseValid 消费');\n"
    "    });",
    'D1 捕获点数量硬锁 → 结构不变量')


def sha(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:12]


def main():
    # 一、逐条锚点校验（命中次数必须恰为 1）
    bad = 0
    for rel, anchor, repl, note in PATCHES:
        src = io.open(ROOT + rel, encoding='utf-8').read()
        n = src.count(anchor)
        print('%-8s %-46s 命中=%d' % (('OK' if n == 1 else 'BAD'), rel + ' :: ' + note, n))
        if n != 1:
            bad += 1
    if bad:
        print('锚点校验未通过（%d 处），未写盘。' % bad)
        sys.exit(2)

    # 二、统一写盘
    touched = {}
    for rel, anchor, repl, note in PATCHES:
        src = io.open(ROOT + rel, encoding='utf-8').read()
        touched.setdefault(rel, src)
        touched[rel] = touched[rel].replace(anchor, repl, 1)

    for rel, out in touched.items():
        old = io.open(ROOT + rel, encoding='utf-8').read()
        io.open(BAK + rel.replace('/', '__') + '.pre3296fix', 'w', encoding='utf-8').write(old)
        io.open(ROOT + rel, 'w', encoding='utf-8').write(out)
        print('write %-46s %d → %d 字节 (sha %s → %s)' % (
            rel, len(old.encode('utf-8')), len(out.encode('utf-8')), sha(old), sha(out)))
    print('DONE 写盘文件数 = %d' % len(touched))


if __name__ == '__main__':
    main()