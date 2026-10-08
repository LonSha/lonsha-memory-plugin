#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.296.0 收口轮 · CHANGELOG / TODO 的收口留痕（README / PLAN 已由前一脚本重绑）。

三处，全部锚点先校验后统一写盘：
  C1 CHANGELOG v3.296.0 顶节的边界句：原写「未实跑全量 ⇒ 文档如实标全量待验」——
     本轮**已跑全量**（277/2986/59-59），该句已不实，如实改写。
  C2 CHANGELOG v3.296.0 顶节追加「收口轮」小节：四个全量缺陷 + 两处判据自身缺陷的
     修复留痕（首次踩坑 → 实际报错 → 根因 → 修法），并记全量读数与门禁复跑结果。
  C3 TODO.md 页契约行：版本停在 v3.293.0 且标「全量待验」⇒ 更新为当版 + 已实跑读数。
"""
import io
import sys
import hashlib

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3296/'
PATCHES = []


def add(rel, old, new, note):
    PATCHES.append((rel, old, new, note))


# ── C1 CHANGELOG 边界句改写 ──
add('CHANGELOG.md',
    '- 边界（诚实）：本模块只做**只读**检索与**条件**保存，不写任何账、不摸 storage、不拉长取数窗口；\n'
    '  未实跑全量（用户纪律：计划全部内容完成前不跑全量）⇒ 文档如实标「**全量待验**」。',
    '- 边界（诚实）：本模块只做**只读**检索与**条件**保存，不写任何账、不摸 storage、不拉长取数窗口。\n'
    '  **本版即「计划收口点」**（X 系列八条全部交付 ⇒ 按纪律在此跑一次全量）：\n'
    '  全量 `npm test` **277/277 文件 · 2986 断言 · 0 失败**；`npm test -- --audit` **审计 59/59**；\n'
    '  登记 `tests/audit/doc_readings.json`（零手抄重绑），README / PLAN 快照行同批对齐。',
    'C1 CHANGELOG 边界句改写')

# ── C2 CHANGELOG 追加收口轮小节（插在顶节末行「退出码三档…」之后） ──
ANCHOR_C2 = ('- **退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移**；本版读数均为**定向复验**，'
             '新增判据**绝不跑全量**。')
NEW_C2 = (ANCHOR_C2 + '\n'
          '### 收口轮（同版内补记，全部实测）\n'
          '- **为什么跑全量**：X 系列八条全部交付 ⇒ 计划收口，按仓内纪律把全量集中到此处跑一次。\n'
          '  首跑 **273/277**（4 档真红），逐个定位修复后复跑 **277/277 · 2986 断言 · 0 失败**；\n'
          '  62 个 `tests/audit/scan_*.mjs` 零红；A1 系列九档 + 两套负控制（`_negctl3296_a1b.py` /\n'
          '  `_negctl3296_member.py`）全 PASS。\n'
          '- ★ **四个全量缺陷（各自的根因，不是「改大小写」这种事）**\n'
          '  ① `v3145_restore_lock`：`epoch: this._mutationEpoch }` 捕获点**硬锁恰 3 处**。\n'
          '     该数字是 v3.145.0 的一次性事实；v3.292.0 起 X6（分支导入）/ X7（分卷接续）/ X2（修复计划）\n'
          '     的宿主真实接线各新增一个同形捕获点，实测 6 处。锁当版字面量会把**活跃功能增长**判红。\n'
          '     交棒为版本无关的**结构不变量**：捕获点 `>= 3`，且**每一处都必须被 `_leaseValid` 消费**\n'
          '     （分割窗口配对：逐捕获点到下一捕获点之间必须有校验）——「捕获了身份却从不核」这个真缺陷\n'
          '     才会被这条抓住，只看数量是抓不住的。\n'
          '  ② `v3281_o7_module_copy_ledger` B1 + D1：X1 的 `evidence-query.js` 与工作台\n'
          '     `evidence-workbench.js` 各有逐字相同的 `text()`（体 md5 `fb00e488`），而它是**未登记**的新簇\n'
          '     （磁盘实测 18 簇 / 63 对，档头原写 17 / 62）。处置是**补登记 + 写清留两份的理由**\n'
          '     （通用文本原语，不是账本字段取值代码；两模块装载时机互不包含，收拢会把「本模块自足」\n'
          '     换成「依赖另一模块先挂载」＝本仓反过的跨模块静默读旧值），不是合并。\n'
          '  ③ `v3239_null_is_not_zero` E1：`explainRecallHost` 的 `audit.floor` 仍走旧判据\n'
          '     `Number.isFinite(Number(_rec.floor)) ? … : null` —— 它把 `null` / `''` / `[]` 一律读成 **0**\n'
          '     （`Number(null) === 0`），于是「楼层未记」与「第 0 楼」塌成同形，而下游 `recall-explain.js`\n'
          '     正是按 `audit.floor` 与查询楼层做身份核对。改走真源口 `this._numOrNull(_rec.floor)`。\n'
          '  ④ `v3288_plan_currency_xface` D：原断言「X2 未交付须在现状节显式在列」在**八条全交付**后\n'
          '     前提消失（再要求某编号标「尚未实施」＝要求文档说假话）。二次交棒为等价结构不变量：\n'
          '     ① 八个编号**一个都不能被静默摘掉**；② 在列的每个编号**必须带显式状态词**\n'
          '     （后者才是「已交付项漏标状态」的真拦网）。\n'
          '- ★★ **两处「判据自身缺陷」被同一次修复连带暴露（比上面四条更值得记）**\n'
          '  ⑤ `v3239` / `v3238` / `v3252` 三档的 `extractMethod` 都用 `source.indexOf(name + \'(\')`\n'
          '     取「方法体」—— 那命中**首次出现**，包括**调用点**。③ 修完让宿主里出现一处早于定义的\n'
          '     `this._numOrNull(...)`（index.js:2981 vs 定义 12375），于是抽出来的是以\n'
          '     `_numOrNull(_rec.floor),` 起头的**非法片段**，`new Function` 解析期直接 `SyntaxError`。\n'
          '     现象是 A2/A3/C1/D1 四档齐报「实现有问题」，**而实现完全正确** —— 「锚点漂了」被误报成\n'
          '     「实现缺陷」（本仓 E6 形态，与 v3.296.0 主线那批「假绿」同族：都是**判据的读数不真**）。\n'
          '     修法：改锚**声明形态**（行首缩进 + 可选 `async`/`function` 前缀 + 名字 + 参数表 + `{`，\n'
          '     从该 `{` 起配平取体）—— 带接收者的调用点天然不匹配。★ 收口轮内自己又栽一次：\n'
          '     首版漏了可选前缀，`v3252` 从模块抽 `function diffPayloads(a, b) {` 时匹配失败，\n'
          '     报「找不到方法 diffPayloads」；补前缀后三档齐绿（**同一个坑在半小时内踩了两次**）。\n'
          '  ⑥ 8 档（`v3232` / `v3257` / `v3259`~`v3264` / `v3266`）翻红的其实是**基线陈旧**，\n'
          '     不是缺陷：③ 在 `explainRecallHost` 内加了 4 行理由注释 ⇒ 宿主 15326→15329、\n'
          '     该成员 121→124。处置按仓内纪律「读数零手抄」走探针 + `tools/_rebuild_host_beast.py` 重建，\n'
          '     并把 `line_budget.note` 与 history 末条 reason **同批**同步到新读数\n'
          '     （两处必须逐字相同，由 v3266 C 的「note 必须是最后一条历史理由的复述」把守）。\n'
          '- **交付的收口脚本（全部落盘可复跑）**：\n'
          '  `tools/bump3296_ledger.py`（X 系列台账补 X1 行 + 双项目边界行 + 收口读数）、\n'
          '  `tools/bump3296_plan_p8.py`（现行排序节第 3 条标题面去编号）、\n'
          '  `tools/bump3296_a1_line_budget.py` / `bump3296_member_budget.py` / `bump3296_member_budget3.py`\n'
          '  （A1 行数/成员上界登记面交棒）、`tools/fix3296_fulltest4.py`（全量四缺陷）、\n'
          '  `tools/fix3296_v3239_extract.py` / `fix3296_v3238_v3252_extract.py` / `fix3296_extract_regex2.py`\n'
          '  （判据自身缺陷）、`tools/bump3296_host_beast_rebind.py`（基线按真读数重绑）、\n'
          '  `tools/bump3296_docs_rebind.py`（README/PLAN 快照与体量行）。\n'
          '  ★ 补丁一律「**全部锚点先校验（须各恰中 1 次）→ 通过后统一写盘**」：收口轮实测该纪律抓到\n'
          '  一次「半改造」（A3 锚点因首版改动而与真源差一个词 ⇒ 命中 0 ⇒ 整个脚本拒绝写盘、\n'
          '  前四项补丁未静默落地），与 v3.294.0 留痕里那次半改造是同一族。\n'
          '- **本版最终读数**：全量 `npm test` 277/277 文件 · 2986 断言 · 0 失败；\n'
          '  `npm test -- --audit` 审计 59/59；`index.js` 15329 行（物理行）/ 探针 15329 行 · 568 成员；\n'
          '  `line_budget` 上界 15726（余量 397 ≤ maxSlack 400）。')


def sha(t):
    return hashlib.sha256(t.encode('utf-8')).hexdigest()[:12]


def main():
    add('CHANGELOG.md', ANCHOR_C2, NEW_C2, 'C2 CHANGELOG 收口轮小节')
    # ── C3 TODO 页契约行 ──
    add('TODO.md',
        '> **本页契约声明**：**退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移**；本页读数均为**定向复验**，'
        '新增判据**绝不跑全量** —— **当前版本 v3.293.0 全量待验**。',
        '> **本页契约声明**：**退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移**；本页读数均为**定向复验**，'
        '新增判据**绝不跑全量**（**例外：计划收口点**）。**当前版本 v3.296.0 已跑全量**'
        '（277/277 文件 · 2986 断言 · 0 失败 · 审计 59/59，登记 `tests/audit/doc_readings.json`）—— '
        'X 系列八条全部交付即该收口点；此后动盘面仍须回到「未实跑即标待验」的旧口径。',
        'C3 TODO 页契约行')

    bad = 0
    for rel, old, new, note in PATCHES:
        src = io.open(ROOT + rel, encoding='utf-8').read()
        n = src.count(old)
        print('%-6s %-46s 命中=%d' % (('OK' if n == 1 else 'BAD'), rel + ' :: ' + note, n))
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
        io.open(BAK + rel + '.pre3296clog', 'w', encoding='utf-8').write(old)
        io.open(ROOT + rel, 'w', encoding='utf-8').write(out)
        print('write %-12s %d → %d 字节 (sha %s → %s)' % (
            rel, len(old.encode('utf-8')), len(out.encode('utf-8')), sha(old), sha(out)))
    print('DONE 写盘文件数 = %d' % len(touched))


if __name__ == '__main__':
    main()