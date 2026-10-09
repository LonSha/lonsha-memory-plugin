#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.301.0 · M-O2（第二刀）发布面收口：CHANGELOG 顶节 + TODO 当前行/历史留痕。

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
            sys.exit('[close3301] %s 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点=%r'
                     % (self.rel, n, why, old[:200]))
        if old == new:
            sys.exit('[close3301] %s 同值替换等于没改：%s' % (self.rel, why))
        self.s = self.s.replace(old, new, 1)
        _log.append((self.rel, why))

    def write(self):
        self.p.write_text(self.s, encoding='utf-8')


CHANGELOG_NEW = """## v3.301.0
**M-O2（第二刀）装配外提 + 装载后重建 —— 修「模块明明在场，整台机器却按缺席来跑」**
- **★ 修前实测的真缺陷（真宿主 + vm 两路取证，不是读源码推算）**：入口 `index.js` 在**加载期**
  就构造 `new LonShaMemoryPlugin()`（`const plugin = ...`，模块顶层），而 `manifest.extra_js`
  要到 `init()` 里才由 v3.300.0 的 `ensureExtraJs()` 挂上 —— **构造必然早于装载**。
  于是构造期每个 `_new*` 工厂的取库口都读到 null，一律落到 `*Fallback` 空退路；装载之后
  `init()` 只重跑 `rebindModuleDeps()`（把宿主符号注入**模块**），**没有任何人重建实例**。
  真宿主读数（probe14）：engine **32 个**成员 + plugin **2 个**成员 `_absent === true`；
  `configMgr` 是 `ConfigManagerFallback` 且持 **0 键**（同期 `new window.LonShaMemoryConfig.ConfigManager()`
  持 **181 键**）；`saveConfig()` 是 `saveConfig() { return undefined; }` ⇒ 设置面板 toast
  「✅ 设置已保存」而 `localStorage` **一字未写**（probe12/13 实测 len=0，重开后设置全丢）。
  形态定性：这是「模块缺席不冒充空账」的**更坏版本** —— 不是把缺席读成在场，而是**模块在场
  却把整台机器当成缺席来跑**，且 UI 照常报成功。
- **交付**（`index.js`）：
  · **装配段整段外提**为 `_assembleComponents(config)`（唯一装配点）：构造期调一次
    （模块未装载时的如实降级），装载 + 注入之后由 `rebuildComponents()` 再调一次（真实现）；
  · **重建前冻用户数据面、重建后回灌**：`_captureComponentState()` 取 24 个器官的 `export()`，
    `_restoreComponentState()` 重建后 `import()` 回去（否则重建 = 清空存档，**比不修更坏**），
    并重挂 `status.clock` 这个跨实例引用；
  · `window.LonShaX?.Y` 七个直取点改为 `this._winModule('LonShaX','Y')`（惰性读取）——
    构造期读不到、重建期读得到，必须**不同形**；
  · 重建读数落 `engine._assembleRead`（before/after 各自 real/absent 可对账）；
  · `init()` 接线序：`ensureExtraJs → loadModules → rebindModuleDeps → 新配置实例 →
    rebuildComponents → emergency 重建 → registerEvents`（先注入模块、再造实例，反序则实例闭包
    停在未注入那份）；emergency 与 configMgr 同为构造期产物，**先判 `_absent` 再换**（无条件覆盖
    会把真实现也换掉）；两处失败**只留痕不抛穿**（抛穿会中断整个插件初始化）。
  · **幂等分支也要装传入的新配置实例**（`configSwapped` 留痕）：`init()` 每次都新造一份传进来，
    若因「已全真」丢掉它，`plugin.configMgr` 与 `engine.config` 就各持一份（面板读一个、保存写
    另一个）—— 与本刀要治的「保存了但读不回」同族，故一并堵死。
- **真宿主验证（Playwright Chromium + SillyTavern 1.19.0，三轮 probe 全绿）**：
  `_assembleRead = { rebuilt:true, frozen:24, restored:22, before:{total:32,real:1,absent:31},
  after:{total:32,real:32,absent:0} }`；`configMgr` 变 `ConfigManager` 且 **181 键**；
  `##ls-save` 后 localStorage **真落盘**（12338 字节 / 181 键，`floorLedgerRetention:300`），
  **重开后 UI 读回同值**；滑块真点击 400→1700（ArrowLeft 1700→1650）、文本输入真键盘写入、
  焦点走位 `apiUrl → apiKey → ls-model-input → Shift+Tab → apiKey`、窄屏 320px 面板无溢出、
  **`pageErrors = []`**。
- **判据**：`tests/v3301_mo2_component_rebuild.test.mjs`（12 条）——A 装配外提结构面 /
  B 重建接线序 / C 真装载两段对照（vm 里按 manifest 顺序真装载、真调 `rebuildComponents`）/
  D 重建不得清空用户数据 / E 幂等 + 换配置留痕 / F 失败只留痕 / G0 工具两向自证 + 判据纯度 /
  G1~G4 四条真源码破坏负控制 + 一条「不得误伤」阴性对照 / H 版本当版锚与登记面。
  ★ 边界（诚实）：本档证明「装配可重建、数据不丢、幂等、失败不抛穿」，**不**证明浏览器
  `<script>` 真解析（那是 v3300 与真宿主 probe 的活）。
- **交付过程留痕（自伤三处，全部记在补丁脚本头部）**：① `_winModule` 是**类方法**却在装配段按
  裸名调用 ⇒ 首跑真宿主 `pageError: _winModule is not defined`（patch3301b 修 7 处为 `this.`）；
  ② 重建初版插在 `loadModules()` 与 `rebindModuleDeps()` 之间，把 rebind 挤出 v3277 判据的 6 行
  窗口（patch3301c 改回 rebind 之后）；③ 判据首版把「函数体里的运行时 `window.LonShaAISelect?.scoreEntry`
  直取」误判为残留直取（那是调用时刻才读的惰性形态），改判为只禁**装配点内**的直取。
- **退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移**（本档沿用全仓口径；`node --test` 单套件为 0/1）。
- **本档绝不跑全量**：按用户纪律「做完计划全部内容前别跑全量」，此处只跑本档定向门与相关单套件。
- 版本六处同步（`index.js` / `manifest.json` / `package.json` + `memory-config.js` /
  `memory-core.js` / `memory-organs.js` 副本）已抬至 **3.301.0**；`extra_js` **仍 87 项**
  （本版不新增模块）；测试文件 281 → **282**；当版锚由本档自带 `const CUR = '3.301.0'` 自锚常量形
  承担（`vnum(CUR) == 3301000`），无需回头改历史档。

"""


def main():
    C = Doc('CHANGELOG.md')
    if CHANGELOG_NEW.split('\n')[0] in C.s:
        sys.exit('[close3301] CHANGELOG 顶部已含 v3.301.0 节（重复执行）')
    C.sub('## v3.300.0\n', '## v3.300.0（历史留痕）\n', 'v3.300.0 降为历史留痕')
    C.s = CHANGELOG_NEW + C.s
    _log.append(('CHANGELOG.md', '顶部插入 v3.301.0 节'))
    C.write()

    T = Doc('TODO.md')
    T.sub('> **最近更新：v3.300.0** —— **M-O2（第一刀）真宿主装载面修复**',
          '> **历史留痕：v3.300.0**（原当前行） —— **M-O2（第一刀）真宿主装载面修复**',
          'v3.300.0 行降为历史留痕')
    TODO_NEW = (
        '> **最近更新：v3.301.0** —— **M-O2（第二刀）装配外提 + 装载后重建**（第二期优化计划第四条续）。'
        '★ **本刀修的是比第一刀更坏的一类形态**：v3.300.0 把 `extra_js` 挂上了（模块真在场），'
        '但引擎/插件是**加载期**构造的、模块是 `init()` 期挂的 —— 于是构造期 34 个成员全落空退路，'
        '装载后 `init()` 只重跑 `rebindModuleDeps()`（注入**模块**），**没人重建实例**。'
        '真宿主读数：engine 32 + plugin 2 个成员 `_absent=true`、`ConfigManagerFallback` 持 **0 键**'
        '（真实现 181 键）、`saveConfig()` 是 `return undefined` ⇒ 面板报「✅ 设置已保存」而 '
        'localStorage 一字未写。修法：装配段外提为 `_assembleComponents()`（唯一装配点）、'
        '装载后 `rebuildComponents()` 重装配并**冻结/回灌用户数据面**（否则重建=清空存档）、'
        '七个 `window.LonShaX?.Y` 直取改 `this._winModule()` 惰性读取、`init()` 接线序改为 '
        '`rebind → 新配置 → rebuild → emergency → registerEvents`（失败只留痕）；'
        '另堵一处窄缺陷：**幂等分支也要装传入的新配置实例**（`configSwapped` 留痕），'
        '否则 `plugin.configMgr` 与 `engine.config` 各持一份。真宿主三轮 probe 全绿：'
        '`_assembleRead.before{32,real:1,absent:31} → after{32,real:32,absent:0}`、'
        '保存真落盘 12338 字节/181 键、重开读回同值、滑块/文本输入/焦点/窄屏全通、`pageErrors=[]`。'
        '判据 `tests/v3301_mo2_component_rebuild.test.mjs`（12 条，含四条真源码破坏负控制）。\n')
    T.sub('> **历史留痕：v3.294.0**', TODO_NEW + '> **历史留痕：v3.294.0**', 'TODO 插入 v3.301.0 当前行')
    T.write()
    print('[close3301] 完成：')
    for rel, why in _log:
        print('  · %-16s %s' % (rel, why))


if __name__ == '__main__':
    main()