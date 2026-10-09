#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.300.0 · M-O2 第一刀：发布面收口（CHANGELOG 顶节 + TODO 当前行/历史留痕）。

纪律：每处替换恰中 1 次；哨兵挡重复执行；全部锚点先校验、通过后统一写盘。
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
            sys.exit('[close3300] %s 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点=%r'
                     % (self.rel, n, why, old[:200]))
        if old == new:
            sys.exit('[close3300] %s 同值替换等于没改：%s' % (self.rel, why))
        self.s = self.s.replace(old, new, 1)
        _log.append((self.rel, why))

    def write(self):
        self.p.write_text(self.s, encoding='utf-8')


CHANGELOG_NEW = """## v3.300.0
**M-O2（第一刀）真宿主装载面修复 —— `manifest.extra_js` 的自装载（宿主从不读这个字段）**
- **缺口（M-O2 原文）**：「真实浏览器与真宿主控件交互回归」长期登记为**未执行**，原因一直是
  「交付者环境无任何可访问的 SillyTavern 实例」。本轮实测**推翻**该边界：环境可用
  （SillyTavern 1.19.0 本地 clone + Playwright Chromium），7 轮探针把「真宿主面」从声明变成读数。
- **★ 修前实测的真缺陷（真宿主取证，不是读源码推算）**：页面里指向本插件的 `<script src>`
  **只有 2 个**（`settings-ui.js` + `index.js`），而 `manifest.extra_js` 声明 **87 项** ——
  宿主全仓零消费该字段（`grep -rn 'extra_js' public/scripts/extensions.js` 返回**空**；
  `addExtensionScript` 只注入 `manifest.js` 一个脚本）。后果是本仓最贵的那类形态（**不报错、只错结果**）：
  · 真浏览器全局里本仓模块 **0 个**（`window` 上只有 `LonShaMemory` / `lonsha_memory_bridge_v1` /
    `lonsha_memory_interceptor` 三个，全是入口自己挂的）；
  · `_moduleLib` 的 require 回落把 88 个模块各当 CJS 求值一次，而各模块的全局挂载行
    （`root.LonShaXxx = api`）在 `typeof window !== 'undefined'` 下**不成立** ⇒「模块在场」
    的判据通过了、api 却是空壳；
  · **近几版新接的机制在真宿主上恒不生效**（`fact-state` / `memory-type` / `unified-recall` …），
    而文档一直读成「装载面 88 模块」。
- **交付**：`ensureExtraJsOnce()` + `plugin.ensureExtraJs()` —— 由插件**自己**把 `extra_js` 挂上去。
  · **走浏览器原生解析器**（`<script type="module">`，与宿主加载入口同形态）。为什么不 eval 内容：
    清单是**行为契约**（模块会挂全局、会读邻居全局），自带解析器求值等于在宿主侧再造一套模块系统
    （解析器漂移、与未来 import 语义分歧）；
  · **base 目录不写死仓库名/用户名**：候选来自宿主**实际注入的 script 标签**，逐个用
    `manifest.json` **反证**（`display_name` 必须匹配本插件）。取不到即如实 `unavailable`，
    **不猜路径、不退任何 CDN**；
  · **清单项必须是裸文件名**（`/^[A-Za-z0-9._-]+\\.js$/`）：挡掉 `../`、绝对 URL、查询串、子目录。
    不用 URL 拼接来做这件事的理由是「要的是**拒绝**，不是解析出一个能用的地址」——
    `new URL('../x', base)` 会悄悄跳出插件目录；
  · **三态互斥 + 幂等**：`ok`（全成）/ `partial`（部分）/ `unavailable`（一个没成），
    另加 `disabled`（按配置关闭）。把 partial 读成 ok 就是「一次成功的失败声明」。
    清单只读一次、同一 URL 只注入一次（已在 `document.scripts` 里的记 `already`，
    ⇒ 宿主未来若自己开始读 extra_js，两向都安全）。
- **★ 修复后真宿主实测（读数，非自述）**：`moduleGlobalCount` **1 → 85**；
  `_extraJsLoad = { status:'ok', okCount:87, triedCount:87, fail:[] }`；
  `factStateGlobal` / `memoryTypeGlobal` / `unifiedRecallGlobal` 三个都是 `object`；
  `moduleStatus = { diffusion:true, visualizer:true }`；**pageErrors = 0、失败请求 = 0**。
- **★ 端到端真跑（走引擎真实入口，不是自造字段）**：`_absorbFactVersions()` 喂提取 schema 的
  **原生形状**（`location` / `status_changes` / `relationships` / `items` / `cse_states` /
  `facts[].type`），两层楼共写 **8 条**事实；`auto` 策略**真换代**（好感 62→74、北京→上海，
  旧条 `to=5` + `supersededBy` 指向新条）；
  `fact-state.readState` 在真宿主**首次真执行**：`有效 6 · 已换代 2 · 旧口径会放行 2：fct_2、fct_6`，
  `selfCheck` 四项（ok / noWriteBack / idempotent / exhaustive）**全真**；
  `typedFactsBlocks()` 真产出两段：stable `〔人物状态〕林昭好感：74（第5楼起）` 取**换代后新值**，
  volatile `〔地点状态〕User所在：上海（第5楼起）`。
- **★ 真控件交互（M-O2 原文那一条）**：`#lonsha-memory-fab` → `#lonsha-fab-menu` **7 项**
  （stats/timeline/viz/settings/diag/ckpt/update）→「⚙️ 设置」→ `#lonsha-settings-overlay` 可见、
  **190 个控件**；点 `#ls-save` 得到 toast「✅ 设置已保存」；点 `#ls-export` 真落盘
  （`URL.createObjectURL` 收到 **9551 字节** blob、`<a download>` 收到
  `lonsha-memory-1791527939356.json`）。四个锚点键（ls-save/ls-clear/ls-export/ls-import）全部在场。
- **★ 归因取证（不做假设）**：桥快照里 `projection` 缺席**不是**缺陷 —— 实测
  `_lastProjectionEnvelope === null` 且 `_projectionDropped === null`，即「宿主尚未跑投影管线」
  （本代内没有这面），与「有面但归属不同代被扔掉」是**两件不同的事**，后者的原因码写在
  `_projectionDropped` 与 `snap.meta.projectionFreshness`。本轮据实登记，未按缺陷处理。
- **配置面**：新增 `preferModuleFiles`（默认 `true`）。置 `false` ⇒ 读数落**第四态 `disabled`**
  且**不再调用装载器**（「真关」与「关了但还跑」必须不同形），控制台同时给出「本仓模块全部走 CJS 回落、
  机制不生效」的明确告警 —— 用户可据此退回旧行为，但不许「静默降级」。
- **判据**：`tests/v3300_mo2_host_loader.test.mjs`（12 条）—— A 面结构 / B ★ base 反证 /
  C ★★ 裸文件名准入（路径穿越**整份拒绝**且合法项也不注入）/ D ★★ 三态互斥（含幂等与 already）/
  E ★ 开关真关 / F 接线序（`ensureExtraJs` 必须先于 `loadModules`·`rebindModuleDeps`·`createUI`，
  且只留痕不阻断 init）/ G0~G4 **四条真源码破坏负控制**（base 不再认领 / 正则放宽 / partial 读成 ok /
  开关失效，各配「原版同款判据真成立」的阳性对照 + 判据纯度）/ H 版本当版锚（字面量形 + 自锚常量形）。
- **本版自伤与收敛（留痕）**：① 判据首跑夹具把 `extraJsLoadReport` 写成 `this.xxx`，
  真实现里它是**闭包直接引 `_extraJsLoad`** ⇒ 直接调用时读到 undefined（B/C/D/E 四组红，
  症状像产品坏了、实为夹具缺件），改为同一闭包变量；② `new Function` 造方法体时漏注入
  `PLUGIN_NAME` ⇒ 非 ok 分支抛 ReferenceError；③ 「候选为空」这个处境首跑**根本没造出来**
  （只清 document、忘了 `_LOADED_SRC` 是**第一候选**），补成两条互斥判据
  （「有候选」与「没候选」必须可分）；④ **收敛**：v3299 引出的「历史档硬锁 extra_js 总项数」
  本轮按纪律交棒（历史档只判「自己那一项在场恰一次」），此后新增模块不再需要回头改历史档 ——
  与 README 的总项数**职责不同**（后者是人读面且被 `scan_doc_truthfulness` D3 核回磁盘），勿混。
- **抬版连带**：版本六处 / 测试文件 280 → 281 / v3209 数量锁（项数仍 87，补版本出处）/
  REGISTRY（v3247）/ 参考基准 tsv / README·PLAN 人读读数 / 本 CHANGELOG + TODO 当前行。
  **extra_js 仍 87 项、根级 .js 仍 88**（本版不新增模块，只加一个测试档）。
- **★ 边界（诚实，不虚报覆盖）**：本版收口的是 **M-O2 的第一刀 = 真宿主装载面**。
  M-O2 原文的其余验收项（展开 / 滑块 / 输入 / 焦点 / 窄屏 / 重开保留）本轮**只跑了保存与导出两条**
  （那是探针⑨实际点到的），**尚未逐项执行**；M-O1（真实宿主写入闭环）仍未收口。真宿主探针依赖
  本地 Chromium 与 SillyTavern clone，**不进 `npm test`**（判据只锁装载契约与准入纪律，不冒充浏览器验证）。
"""

TODO_CUR = """> **最近更新：v3.300.0** —— **M-O2（第一刀）真宿主装载面修复**（第二期优化计划第四条开工）。★ **推翻边界声明**：长期登记的「交付者环境无任何可访问的 SillyTavern 实例」**实测不成立** —— SillyTavern 1.19.0 本地 clone + Playwright Chromium 可用，7 轮探针（probe1~probe7）把真宿主面从声明变成读数。★ **修前实测的真缺陷**：宿主**从不加载 `manifest.extra_js`**（`addExtensionScript` 只注入 `manifest.js`；`grep -rn 'extra_js' public/scripts/extensions.js` 返回**空**）⇒ 真浏览器全局里本仓模块 **0 个**，`_moduleLib` 的 require 回落求值出**空 api**（各模块的 `root.LonShaXxx = api` 在 `typeof window !== 'undefined'` 下不成立），**近几版新接的机制在真宿主上恒不生效**（fact-state / memory-type / unified-recall …），而文档一直读成「装载面 88 模块」。★ **交付**：`ensureExtraJsOnce()` + `plugin.ensureExtraJs()` —— 插件**自己**把 extra_js 挂上去：浏览器原生 `<script type="module">` 注入（**不 eval 内容**：清单是行为契约，自带解析器等于在宿主侧再造一套模块系统）/ **base 目录不写死**（候选来自宿主实际注入的 script 标签，逐个用 `manifest.json` **反证** `display_name`，取不到即 `unavailable`，**不猜路径、不退 CDN**）/ **清单项必须裸文件名**（挡 `../`、绝对 URL、查询串、子目录；要的是**拒绝**而不是解析出一个能用的地址）/ **三态互斥** ok·partial·unavailable 另加 disabled（把 partial 读成 ok 就是「一次成功的失败声明」）/ **幂等**（清单只读一次、同一 URL 只注入一次，已在 `document.scripts` 里的记 already ⇒ 宿主未来自己开始读 extra_js 时两向都安全）。★ **修复后真宿主读数**：`moduleGlobalCount` **1 → 85**、`_extraJsLoad = {status:'ok', okCount:87, triedCount:87, fail:[]}`、三关键模块全局皆 `object`、**pageErrors = 0**。★ **端到端真跑（走引擎真实入口 `_absorbFactVersions`，不是自造字段）**：提取 schema 原生形状写 8 条事实、`auto` 策略**真换代**（好感 62→74、北京→上海）、`fact-state.readState` 在真宿主**首次真执行**（`有效 6 · 已换代 2 · 旧口径会放行 2：fct_2、fct_6`）、`selfCheck` 四项全真、`typedFactsBlocks()` 真产出 stable（取换代后 74）/ volatile（上海）。★ **真控件交互**：FAB → 菜单 **7 项** →「⚙️ 设置」→ overlay 可见 **190 控件** → `#ls-save` toast「✅ 设置已保存」→ `#ls-export` 真落盘（blob **9551 字节** / `lonsha-memory-1791527939356.json`）。★ **归因取证**：桥快照 `projection` 缺席**不是缺陷**（`_lastProjectionEnvelope === null` 且 `_projectionDropped === null` = 本代尚无这面），与「有面但归属不同代被扔掉」是两件事，据实登记未按缺陷处理。★ 新增配置键 `preferModuleFiles`（默认 true）：置 false ⇒ 第四态 `disabled` 且**不调用装载器**，同时明确告警「本仓模块全部走 CJS 回落、机制不生效」。判据 `tests/v3300_mo2_host_loader.test.mjs`（12 条）+ 四条真源码破坏负控制（base 不再认领 / 正则放宽 / partial 读成 ok / 开关失效）+ 抬版连带（版本六处 / 测试文件 280→281 / v3209 数量锁补版本出处 / REGISTRY / tsv / README-PLAN 读数）。★ 本版自伤三处（附修法）：判据夹具把闭包出口写成 `this.xxx`（真实现是闭包直接引 `_extraJsLoad`）；`new Function` 漏注入 `PLUGIN_NAME`；「候选为空」首跑没造出来（忘 `_LOADED_SRC` 是第一候选）⇒ 已补成两条互斥判据。★ **收敛**：v3299 引出的「历史档硬锁 extra_js 总项数」本轮按纪律**交棒**（历史档只判「自己那一项在场恰一次」），与 README 总项数职责不同（后者是人读面、被 D3 核回磁盘），勿混。★ **边界（诚实）**：本刀只收**装载面**；M-O2 其余验收项（展开/滑块/输入/焦点/窄屏/重开保留）只跑了保存与导出两条；M-O1 仍未收口。真宿主探针依赖本地 Chromium 与 ST clone，**不进 `npm test`**。
"""

D = {rel: Doc(rel) for rel in ['CHANGELOG.md', 'TODO.md']}

# CHANGELOG：顶节前插新节（哨兵挡重复）
if '## v3.300.0' in D['CHANGELOG.md'].s:
    sys.exit('[close3300] CHANGELOG 已含 v3.300.0 节（重复执行）')
D['CHANGELOG.md'].sub('## v3.299.0', CHANGELOG_NEW + '\n## v3.299.0', 'CHANGELOG 顶节新增 v3.300.0')

# TODO：当前行换新，旧当前行降级为历史留痕
T = D['TODO.md']
old_cur = '> **最近更新：v3.299.0**'
T.sub(old_cur, '> **历史留痕：v3.299.0**（原当前行）', 'TODO 旧当前行降级为历史留痕')
T.sub('> **历史留痕：v3.294.0**（X 系列第六条落地，原当前行）',
      TODO_CUR + '> **历史留痕：v3.294.0**（X 系列第六条落地）',
      'TODO 插入 v3.300.0 当前行')

for rel, d in D.items():
    d.write()
print('[close3300] 完成：%d 项替换' % len(_log))
for rel, why in _log:
    print('  · %-14s %s' % (rel, why))