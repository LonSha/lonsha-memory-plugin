#!/usr/bin/env python3
"""v3.287.0 · O2：文档同步（CHANGELOG 顶节新增 + README/TODO/PLAN 版本与在役面读数）。

为什么单独一个脚本而不是并进 _o2_bump.py：
  「版本号替换」与「正文改写」是两件事 —— 前者是机械的（五源 + 三模块副本，锚点必须恰 1 次），
  后者要写新节、要按磁盘真值改三处读数、要更新 PLAN 现行节进度。
  混在一个脚本里，一旦正文锚点漂移就会连带把版本号也卡住（v3.286.0 踩过）。

磁盘真值（本脚本运行前实测）：268 测试档 / 58 门禁 / 62 audit .mjs
"""
from pathlib import Path

REPO = Path('/home/user/lonsha-memory-plugin')
OLD = '3.286.0'
NEW = '3.287.0'
T = '268'          # tests/*.test.mjs
G = '58'           # tests/audit/scan_*.mjs
A = '62'           # tests/audit/*.mjs

CHANGELOG_HEAD = """## v3.287.0
**O2 真实用户操作层（可做切片）：交互逻辑门 —— 控件真操作 / 状态真改变 / 重开真保留 / 展开与窄屏**
- **真缺口（本轮实测）**：v3.271.0 交付的 `tests/audit/scan_ui_runtime.mjs`（U1~U5）只到**渲染层** ——
  它证明「入口不抛 + 面板落 DOM + 关键控件在册 + 没有属性吞并」，却**从来没有点过任何控件**。
  而「控件有 DOM」与「控件可用」之间没有蕴含关系：一个 `disabled` 的滑块、一个把值写进死变量的 handler、
  一个 `saveConfig` 没接存储的保存键，都**完全满足** U1~U5。计划 O2 的验收原文写的是
  「控件有 DOM、可见、**可操作**、**改变正确状态**且**重开保留**；测**展开、滑块、输入、焦点与窄屏**」
  —— 这一面此前没有任何判据。
- **本刀交付**：
  - `tests/audit/scan_ui_interaction.mjs`（零依赖，自带最小 DOM shim；V1~V10，退出码三档 0/1/2）：
    V1 控件真在场且**可操作**（不带 disabled）/ V2 复选框 click 后 DOM 真翻转、**点保存后**配置写回且与 DOM 一致、
    保存后面板须已关闭 / V3 同面板会话内改滑块值后保存 ⇒ 配置等于按 step 归一化的值 /
    V4 长文本改值后保存 ⇒ 配置等于 trim 后新值 / V5 点击 `#ls-save` 后 `config.saveConfig()` 必须真被调用 /
    V6 **重开真保留**（把保存后配置灌进**新环境**再渲染，控件 DOM 状态须反映保存值）/
    V7 展开（原生 `<details>` 点 `<summary>` 后可见性真翻转）/ V8 窄屏（两种 `matchMedia` 返回值渲染，差异须可归因）/
    V9 面自证非零下限 / V10 fail-closed。
  - `tests/v3287_ui_interaction.test.mjs`（17 条 test）：A 结构面 / **B1~B3 shim 忠实性**（本门存活的前提）/
    C1~C7 合成仓逐条翻红 / D fail-closed / E 健康仓 exit 0 / F 判据纯度 H5（17 锚点单命中）/
    G 真源码破坏三向（判据不是装饰）/ H1~H2 当版锚点与三处登记面。
- **实测（本刀抓到的五处假红，全部是「测量侧错」而非「源码缺陷」——逐条留痕，防后人重踩）**：
  ① **shim 未模拟 checkbox 原生 checked 翻转**：真实浏览器点击 checkbox 会**先翻转 checked 再派发 click**
     （handler 读 `e.target.checked` 拿到的是新值）；不模拟这条，真源那种写法会被误判成「点下去没用」。
  ② **折叠候选选错**：首版把 `.ls-group-title`（34 处，**纯分组标题样式**）当折叠头；真源的折叠是
     **原生 `<details id="ls-advanced">`**（全仓仅 1 处，第 1114 行），其展开/收起是浏览器内建行为。
  ③ **shim 的 `matchesOne` 不支持 `>` 子组合器** ⇒ `'details > summary'.split(/\\s+/)` 切成三段、
     `matchSimple(el, '>')` 恒 false ⇒ 候选**恒 0** ⇒ V7 报出「本仓设置面板未提供折叠头」这一
     **完全错误的结论**。这是「测量盲区冒充事实」的典型 —— 门不红、还给出看起来合理的说明，**比红着更坏**。
     修法（本仓纪律：shim 偏差修 shim）：显式支持 `A > B`（直接父）与 `A B`（祖先）。
  ④ **判据按「想象」写而非按真源写**：首版断言「`click()` 后配置立即反转」，而真源复选框由 `ck()` 渲染、
     **没有任何 change/input 监听**，写回统一走 `#ls-save` 的收集循环
     `querySelectorAll('[data-cfg]').forEach(el => config[el.dataset.cfg] = el.checked)`
     ⇒ 「点一下配置就变」在本仓**不是**正确期望。正确序列是两段：点下去 **DOM 翻转**，点保存后 **配置落地且等于 DOM**。
  ⑤ **把「改值」与「重开」的顺序弄反**：真源渲染是 `value="${c.vectorTopK ?? 5}"` —— 每次打开面板
     **从配置重新渲染初值**；若在改值之后再重开，新面板拿旧值渲染，改的值被覆盖回旧值，保存自然写回旧值
     （首轮读数 `vectorTopK 保存后 5，应为 7` 就是这么来的）。正确序列 = 重开拿干净面板 → **本面板上**改值 → **本面板上**保存。
  另有一处工具侧踩坑：合成仓用例首版全部报 `mut is not a function` —— `mkRepo` 只接受「改状态的函数」，
  而 B/C/E/G 组都传了「状态对象」⇒ 加形态归一（函数或对象皆可）。
- **收缩与边界（诚实登记，同 O2 验收原文「未执行不算通过」）**：
  - 本环境**无任何 headless 浏览器可用**（`chromium` / `chromium-browser` / `google-chrome` / `chrome` / `firefox`
    全部为「(无)」），**无 Playwright / Puppeteer**（全局 npm 包仅 `pi-coding-agent` / `corepack` / `npm` / `pnpm`）。
  - 故本门是**最小 DOM shim 上的交互逻辑门**，不是真浏览器：它拦的是**交互逻辑**缺陷
    （事件没接、值没写回、保存没落地、重开没回灌、展开判定写死）。
  - 它**不证明**宿主 CSS 生效、真实点击坐标命中、真实 localStorage 配额与跨会话行为，也不覆盖真实 SillyTavern 的
    生成 / 楼层重生成删除 / 切角色 / 两插件共装 —— 那些只有真浏览器 + 真宿主才能证，**如实登记未执行**。
  - 另如实报出两条**现有读数**（不判缺陷，无面可判 ≠ 判据失效）：V7 折叠目标 1/1（真源仅一处原生 details）；
    V8 宽窄屏控件数**同形**（160 / 160 —— 面板当前未做宽度分支）。
- **敏感度实测（反恒绿探测器，J3）**：三档 `H=0 / G=2 / T=0`（`tools/_o2_gt_probe.py`，最小镜像 + `LONSHA_AUDIT_ROOT`）。
  G 档非 0（G 删根 `.js` ⇒ 缺 `settings-ui.js` ⇒ 拒绝给结论）；T 档对它无影响（本门量的是交互逻辑，不读 `tests/` 下的测试体），
  与 `scan_ui_runtime.mjs` 同形 —— **G 列已非 0，非恒绿探测器**。
- **门禁与登记**：三处登记面已补（`tests/audit/audit_scan_probe_matrix.tsv` 三列期望码 `0 2 0`；
  `tests/audit/catalog_reference_consumers.tsv` 在役测试面名册；`tests/v3247_break_kit_consolidation.test.mjs` 的 `REGISTRY` 接收方台账）。
- **范围**：本刀只做 O2 的**可做切片**；真浏览器 / 真宿主面须在交付者具备浏览器的环境补跑后才算 O2 通过。
- **退出码三档**：0=卫生（交互逻辑全部测到） / 1=真缺陷（控件不可操作 / 状态没变 / 重开丢失） / 2=结构漂移（缺输入面）。
"""


def sub_once(s, old, new, label, path):
    n = s.count(old)
    if n != 1:
        raise SystemExit('[FATAL] %s / %s 锚点命中 %d 次（须恰 1 次），不写盘' % (path, label, n))
    return s.replace(old, new, 1)


# ─────────────────────────── CHANGELOG ───────────────────────────
def changelog():
    p = REPO / 'CHANGELOG.md'
    s = p.read_text(encoding='utf-8')
    if s.startswith('## v' + NEW):
        print('[1] CHANGELOG：已抬版，跳过')
        return
    anchor = '## v' + OLD + '\n'
    s = sub_once(s, anchor, CHANGELOG_HEAD + anchor, 'CHANGELOG 顶节', 'CHANGELOG.md')
    p.write_text(s, encoding='utf-8')
    print('[1] CHANGELOG：已插入 v%s 顶节' % NEW)


# ─────────────────────────── README ───────────────────────────
def readme():
    p = REPO / 'README.md'
    s = p.read_text(encoding='utf-8')
    if '`' + NEW + '`' in s:
        print('[2] README：已抬版，跳过')
        return
    # ① 当前版本行
    s = sub_once(s, '**当前版本**：`' + OLD + '`', '**当前版本**：`' + NEW + '`', 'README 当前版本行', 'README.md')
    # ② 在役面读数行（第 8 行）
    s = sub_once(s, '`npm test` 当前发现 **267 个测试文件**',
                 '`npm test` 当前发现 **' + T + ' 个测试文件**', 'README 测试文件读数', 'README.md')
    s = sub_once(s, '**58/58** 审计脚本（`tests/audit/` 磁盘 **61** 个',
                 '**' + G + '/' + G + '** 审计脚本（`tests/audit/` 磁盘 **' + A + '** 个', 'README 审计脚本读数', 'README.md')
    # ③ 全量待验版本
    s = sub_once(s, '当前版本 v' + OLD + ' **全量待验**', '当前版本 v' + NEW + ' **全量待验**', 'README 待验版本', 'README.md')
    # ④ npm test 注释行与目录树（缩进按磁盘实际：注释行前置 13 空格、目录树为 `├── tests/`）
    s = sub_once(s, '# 全部用例：267 个测试文件',
                 '# 全部用例：' + T + ' 个测试文件', 'README 用例注释行', 'README.md')
    s = sub_once(s, '├── tests/                # 在役面：267 个测试文件 + 58 个审计脚本（磁盘 61',
                 '├── tests/                # 在役面：' + T + ' 个测试文件 + ' + G + ' 个审计脚本（磁盘 ' + A, 'README 目录树', 'README.md')
    # ⑤ 末尾在役面小结行
    s = sub_once(s, '`tests/` 267 个测试文件（`*.test.mjs`，即 `npm test` 的扫描面）/ `tests/audit/` 58 个审计脚本（磁盘 61',
                 '`tests/` ' + T + ' 个测试文件（`*.test.mjs`，即 `npm test` 的扫描面）/ `tests/audit/` ' + G + ' 个审计脚本（磁盘 ' + A,
                 'README 末尾小结行', 'README.md')
    p.write_text(s, encoding='utf-8')
    print('[2] README：版本行 + 五处在役面读数已更新')


# ─────────────────────────── TODO ───────────────────────────
def todo():
    p = REPO / 'TODO.md'
    s = p.read_text(encoding='utf-8')
    if '**最近更新：v' + NEW + '**' in s:
        print('[3] TODO：已抬版，跳过')
        return
    anchor = '> **最近更新：v' + OLD + '**'
    new_head = (
        '> **最近更新：v' + NEW + '** —— O2 真实用户操作层（**可做切片**）：**交互逻辑门**。\n'
        '> 计划 O2 的验收原文是「控件有 DOM、可见、可操作、**改变正确状态**且**重开保留**；测展开、滑块、输入、焦点与窄屏」，\n'
        '> 而 v3.271.0 的 `scan_ui_runtime.mjs`（U1~U5）只到**渲染层**、**从未点过任何控件** ——\n'
        '> 「控件有 DOM」与「控件可用」之间没有蕴含关系（disabled 滑块 / 写进死变量的 handler / 没接存储的保存键都满足 U1~U5）。\n'
        '> 新增 `tests/audit/scan_ui_interaction.mjs`（V1~V10，自带最小 DOM shim）+ `tests/v3287_ui_interaction.test.mjs`（17 条 test）。\n'
        '> ★ 实测五处假红**全是测量侧错**：① shim 未模拟 checkbox 原生 checked 翻转；② 把 `.ls-group-title`（纯标题样式，34 处）\n'
        '> 当折叠头（真源是原生 `<details id="ls-advanced">`，仅 1 处）；③ **shim 的 `matchesOne` 不支持 `>` 子组合器** ⇒\n'
        '> `details > summary` 候选恒 0 ⇒ 报出「本仓无折叠头」的**假结论**（测量盲区冒充事实，比红着更坏）；\n'
        '> ④ 判据断言「click 后 config 立即反转」，而真源复选框无 change 监听、写回走 `#ls-save` 收集循环（判据按想象写）；\n'
        '> ⑤ 顺序弄反 —— 真源 `value="${c.vectorTopK ?? 5}"` 每次开面板从配置重渲染，改值后再重开会被旧值覆盖。\n'
        '> ★ 边界（同 O2 验收原文「未执行不算通过」）：本环境**无任何 headless 浏览器**（chromium/chrome/firefox 全无）、\n'
        '> **无 Playwright/Puppeteer** ⇒ 宿主 CSS / 真实点击坐标 / 真实 localStorage 配额与跨会话行为**未覆盖**，\n'
        '> 真 SillyTavern 侧（生成 / 楼层重生成删除 / 切角色 / 两插件共装）**如实登记未执行**。\n'
        '> ★ 敏感度三档实测 `H=0 / G=2 / T=0`（G 非 0 ⇒ 非恒绿探测器）；三处登记面已补。\n'
    )
    s = sub_once(s, anchor, new_head + anchor, 'TODO 最近更新行', 'TODO.md')
    p.write_text(s, encoding='utf-8')
    print('[3] TODO：已插入 v%s 最近更新段' % NEW)


# ─────────────────────────── PLAN ───────────────────────────
def plan():
    p = REPO / 'PLAN.md'
    s = p.read_text(encoding='utf-8')
    if 'v' + NEW + '）' in s:
        print('[4] PLAN：已抬版，跳过')
        return
    s = sub_once(s, '**当前执行状态（2026-10-06，v' + OLD + '）**',
                 '**当前执行状态（2026-10-06，v' + NEW + '）**', 'PLAN 执行状态版本', 'PLAN.md')
    s = sub_once(s, '| 版本 | **v' + OLD + '**（四源同源；本表原为 v3.266.0）',
                 '| 版本 | **v' + NEW + '**（四源同源；本表原为 v3.266.0）', 'PLAN 版本行', 'PLAN.md')
    s = sub_once(s, '在役面 **267 测试文件 / 58 个 audit 脚本**（磁盘 61）',
                 '在役面 **' + T + ' 测试文件 / ' + G + ' 个 audit 脚本**（磁盘 ' + A + '）', 'PLAN 在役面行', 'PLAN.md')
    s = sub_once(s, '当前 v' + OLD + ' **全量待验**', '当前 v' + NEW + ' **全量待验**', 'PLAN 待验版本', 'PLAN.md')
    # 现行节 O2 进度
    s = sub_once(s, 'O1（会话身份）/ O2（真实用户操作）',
                 'O1（会话身份）/ O2（真实用户操作，**已交付交互逻辑切片** v3.287.0：控件真操作 / 状态真改变 / 重开真保留 / 展开与窄屏，'
                 '判据 `scan_ui_interaction.mjs` + `v3287_ui_interaction.test.mjs`；'
                 '**真浏览器 + 真 SillyTavern 面因交付者环境无任何 headless 浏览器与真宿主，如实登记未执行**）',
                 'PLAN O2 进度', 'PLAN.md')
    p.write_text(s, encoding='utf-8')
    print('[4] PLAN：执行状态 / 版本行 / 在役面 / 待验版本 / O2 进度 已更新')


if __name__ == '__main__':
    changelog()
    readme()
    todo()
    plan()