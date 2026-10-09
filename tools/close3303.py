#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.303.0 · M-O2（第三刀：面板逐条驱动门）发布面收口：CHANGELOG 顶节 + TODO 当前行。
纪律：每处替换恰中 1 次；哨兵挡重复执行。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
_log = []


class Doc:
    def __init__(self, rel):
        self.rel = rel
        self.p = ROOT / rel
        self.s = self.p.read_text(encoding='utf-8')

    def sub(self, old, new, why):
        n = self.s.count(old)
        if n != 1:
            sys.exit('[close3303] %s 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点=%r'
                     % (self.rel, n, why, old[:200]))
        if old == new:
            sys.exit('[close3303] %s 同值替换等于没改：%s' % (self.rel, why))
        self.s = self.s.replace(old, new, 1)
        _log.append((self.rel, why))

    def write(self):
        self.p.write_text(self.s, encoding='utf-8')


CHANGELOG_NEW = """## v3.303.0
**M-O2（第三刀）面板逐条驱动门 —— 修「控件在那里，真点下去什么都不发生，界面还说能用」**
- **它补的是哪一格**：v3.287.0 的交互切片只搬了**一片**控件（状态真改变 / 重开真保留），
  真浏览器 + 真宿主那一格一直是「如实登记未执行」。本刀把面板**逐条**驱动起来：在真 Chromium
  里把设置面板每一条都点一遍，看它是不是真的弹出操作面板 —— 而不是只在源码里「看起来有 onclick」。
- **★ 修前实测的真缺陷（四处，都在 `settings-ui.js`，全部由本刀新门禁当场点名）**：
  ① `showDiagnose` 拼数据进 HTML 却没定义 `esc` ⇒ **带数据调用当场抛错**（诊断面板整块打不开）；
  ② 条目摘要与 `_memOps` 的 key 用 `===` 直接比 ⇒ `key` 是数字型字符串时陷入**静默无反应**
    （条目可点、无报错、什么都不发生）；
  ③ `opHint` 无条件挂载 ⇒ 对**不可用**的条目也宣称「可用」（把不可用说成可用，比不显示更坏）；
  ④ `showBrowser` 的 9+2 处属性值直接用 `esc` ⇒ 属性值往返失真（含双引号的物品名寻不回来）。
  四条形态不同、根因同一个：**只在源码里看「有没有」，不在真 DOM 里看「是不是真的这样」**。
- **交付**：`settings-ui.js` 四处修（`showDiagnose` 补 `esc` 定义；`_memOps` 加 key 归一化并改比对
  表达式；`opHint` 改条件挂载；`showBrowser` 新增 `escAttr` 并改 11 处属性值）。
- **新门禁** `tests/audit/scan_ui_panel_drive.mjs`（六条判据，零依赖最小 DOM 仿真）：
  W1 诊断面板带数据驱动（拼数据不得抛错）/ W2 条目真点（逐条驱动）/ W3 静默无反应数为 0 /
  W4 寻址口在册（`data-opid` 可读非空）+ W4b 属性值**往返双基准**（DOM 直读与序列化标记两条路径
  都要按原名寻回）/ W5 提示诚实（不可用不得说成可用）/ W6 面自证（四个面下限常量）。
- **成对套件** `tests/v3303_ui_panel_drive_gate.test.mjs`（10 条，全绿）：A1 结构 / B1 真仓 exit 0 /
  C1~C4 四条**真源码破坏负控制**（与门头四处缺陷一一对应，每条配原版对照）/ D1 fail-closed /
  E1 面下限非装饰 / F1 判据纯度 / G1 当版下界锚 + 三处登记面。
- **连带修的两处（都不是新写功能）**：
  · **探针子进程回收缺陷**（由 `scan_process_reaping.mjs` 当场点名）：`tests/audit/_mo1_realhost_probe.mjs`
    用裸 `spawn` 且收尾只 `chrome.kill` ⇒ 孙进程会被孤儿化。修法：`detached: true` + 进程组收割，
    形态与 `tests/run.mjs` 的 `killGroup` 一致。**实测承重**（两形态对照）：机制级（长命孙进程）
    裸 spawn + 单杀 ⇒ **2 个孙进程孤儿化存活**；detached + 组杀 ⇒ **0 个**。Chromium 同款则两种
    模式残留都是 0（浏览器自带进程管理收掉短命渲染子进程）⇒ 该缺陷在浏览器场景**行为面观测不到**，
    这正是该门禁判**结构**而非行为的理由。修复后真宿主探针复跑 **23 条读数仍全成立**。
  · **两处台账补登记**（新门禁引入的连带）：v3284 审计副本台账新增 3 个副本簇 + `walk` 簇成员 2 → 3；
    v3226 探针灵敏度矩阵补登本门一行（实测 H/G/T = 0/2/0）。
- **退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移**（本档沿用全仓口径；`node --test` 单套件为 0/1）。
- **本档绝不跑全量**：按用户纪律「做完计划全部内容前别跑全量」，此处只跑本档定向门与相关单套件。
- 版本六处同步（`index.js` / `manifest.json` / `package.json` + `memory-config.js` /
  `memory-core.js` / `memory-organs.js` 副本）已抬至 **3.303.0**；`extra_js` **仍 87 项**
  （本版不新增模块）；测试文件 283 → **284**；审计脚本 59 → **60**（磁盘 63 → **64**）。
  当版锚由本档自带 `vnum('3.303.0')` 字面量形承担。
***
"""


def main():
    C = Doc('CHANGELOG.md')
    if CHANGELOG_NEW.split('\n')[0] in C.s:
        sys.exit('[close3303] CHANGELOG 顶部已含 v3.303.0 节（重复执行）')
    C.sub('## v3.302.0\n', '## v3.302.0（历史留痕）\n', 'v3.302.0 降为历史留痕')
    C.s = CHANGELOG_NEW + C.s
    _log.append(('CHANGELOG.md', '顶部插入 v3.303.0 节'))
    C.write()

    T = Doc('TODO.md')
    T.sub('> **最近更新：v3.302.0**', '> **历史留痕：v3.302.0**（原当前行）', 'v3.302.0 行降为历史留痕')
    TODO_NEW = (
        '> **最近更新：v3.303.0** —— **M-O2（第三刀）面板逐条驱动门**（第二期优化计划第四条第三刀）。'
        '★ 修前实测四处真缺陷（全在 `settings-ui.js`，全部在新门禁的真 Chromium/最小 DOM 驱动下当场暴露）：'
        '① `showDiagnose` 拼数据却没有 `esc` 定义 ⇒ 带数据调用抛错、诊断面板整块打不开；'
        '② 条目摘要与 `_memOps` 的 key 直接 `===` 比 ⇒ 数字型字符串 key 陷入**静默无反应**；'
        '③ `opHint` 无条件挂 ⇒ 把**不可用**说成可用；'
        '④ `showBrowser` 属性值直接用 `esc` ⇒ 含双引号的物品名属性值往返失真、寻不回来。'
        '新门禁 `tests/audit/scan_ui_panel_drive.mjs` 六条判据：W1 诊断面板带数据驱动 / W2 条目真点 / '
        'W3 静默无反应数为 0 / W4 寻址口在册 + W4b 属性值往返双基准 / W5 提示诚实 / W6 面自证；'
        '成对套件 `tests/v3303_ui_panel_drive_gate.test.mjs`（10 条全绿，含四条真源码破坏负控制）。'
        '★ **连带修两处**（都不是新写功能）：' + chr(40) + '1' + chr(41) + ' 探针 `tests/audit/_mo1_realhost_probe.mjs` '
        '的子进程回收缺陷（由 `scan_process_reaping.mjs` 当场点名）—— 裸 `spawn` + 收尾只 `chrome.kill` '
        '⇒ 孙进程孤儿化；修成 `detached: true` + 进程组收割（与 `tests/run.mjs` 的 `killGroup` 同形）。'
        '**实测承重**：机制级（长命孙进程）裸 spawn + 单杀 ⇒ 2 个孙进程孤儿化存活，detached + 组杀 ⇒ 0 个；'
        'Chromium 同款两模式残留都是 0（行为面观测不到）⇒ 这正是该门判**结构**的理由；修后真宿主探针复跑 23 条仍全成立。'
        + chr(40) + '2' + chr(41) + ' 两处台账补登（新门禁引入的连带）：v3284 审计副本台账 +3 簇 / `walk` 簇成员 2 → 3；'
        'v3226 探针灵敏度矩阵补登本门一行（实测 H/G/T = 0/2/0）。'
        '★ 本版自伤一处：F1 判据纯度首版用**运行时字面量** `includes()` 判文件是否持有常量，'
        '而含 `' + chr(92)*2 + 's` 的锚点在源码文件里写作双反斜杠 ⇒ 恒假（已改为双形态检查）。\n')
    T.sub('> **历史留痕：v3.299.0**', TODO_NEW + '> **历史留痕：v3.299.0**', 'TODO 插入 v3.303.0 当前行')
    T.write()
    print('[close3303] 完成：')
    for rel, why in _log:
        print('  · %-16s %s' % (rel, why))


if __name__ == '__main__':
    main()
