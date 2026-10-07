#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v3.293.0 收尾：TODO 两处人读面同步

① 「本页契约声明」里的当前版本仍写 v3.292.0 —— 无门读它（V7 只核第一处「最近更新」，
   scan_doc_truthfulness 的 D9 显式不判 TODO），但它正是人接手时先看的那一行：
   滞后的人读面与滞后读数同类。改为 v3.293.0。
② 「最近更新：v3.293.0」那段尾部补本轮两项修复留痕（v3279 锁当版读数 + O7 四档登记滞后），
   与 CHANGELOG 顶节「判据面」段的 ⑥⑦ 对齐。
"""
import io

ROOT = '/home/user/lonsha-memory-plugin'
REL = 'TODO.md'

OLD = "> **本页契约声明**：**退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移**；本页读数均为**定向复验**，新增判据**绝不跑全量** —— **当前版本 v3.292.0 全量待验**。"
NEW = "> **本页契约声明**：**退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移**；本页读数均为**定向复验**，新增判据**绝不跑全量** —— **当前版本 v3.293.0 全量待验**。"

OLD2 = "★ 另修：判据 B 缺 `return ''` 收尾、H5 锚点在测试源码散落两处、H9 判定窗口向后取越出体检块。"
NEW2 = ("★ 另修：判据 B 缺 `return ''` 收尾、H5 锚点在测试源码散落两处、H9 判定窗口向后取越出体检块。"
        "★ 判据面（本轮另两处，均属「防线自己的读数过期」）：⑧ `v3279` 的声明级台账读数断言写死量级 "
        "`5[0-9][0-9]`（建档时 5xx，本版真值 603 / 591）⇒ 与本轮 ② 同族的**锁当版读数**，"
        "已改钉不变量「有真引用 + 仅测试·审计 = 声明总数」；"
        "⑨ O7 副本账本**登记滞后**（`tests/v3281` / `v3282` / `v3283` / `v3284` 四档）："
        "X6/X7 两新模块之间的五簇逐字副本（`numOf`/`keyOf`、`PRECHECK`↔`PREVIEW`、`FACES`/`ACTION`）"
        "未登记 ⇒ B1/D1 双向一致判据翻红。处置为**补登记 + 留痕理由**（`volume-continuation.js` 档头"
        "逐字声明过「自持一份、不引 X6 常量」以防跨模块静默读旧值），不是合并成一份；"
        "另两簇（两个 UI 门各自 DOM shim 里的 `matches`/`walk`，自 v3.287.0 起潜伏）同属此理。")


def main():
    path = ROOT + '/' + REL
    src = io.open(path, encoding='utf-8').read()
    for i, (old, new) in enumerate([(OLD, NEW), (OLD2, NEW2)]):
        n = src.count(old)
        if n != 1:
            raise SystemExit('锚点 #%d 命中 %d 次（须恰 1 次）' % (i, n))
        src = src.replace(old, new)
    io.open(path, 'w', encoding='utf-8').write(src)
    print('patched ' + REL)


if __name__ == '__main__':
    main()