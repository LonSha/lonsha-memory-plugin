#!/usr/bin/env python3
"""v3.287.0 · O2：补三处登记面（探针矩阵 / 在役测试面名册 / v3247 接收方台账）。

为什么用脚本落盘而不是终端 heredoc：本仓留痕已记「heredoc 传 Python 会破坏缩进与转义」
（本轮实测 `\t` 被写成字面反斜杠+t）—— 复杂脚本一律先落盘再执行。
幂等：已登记则跳过；每步都打印结果便于核对。
"""
from pathlib import Path

REPO = Path('/home/user/lonsha-memory-plugin')
TAB = chr(9)
NL = chr(10)

SCAN = 'scan_ui_interaction.mjs'
SUITE = 'v3287_ui_interaction.test.mjs'


def step1_matrix():
    p = REPO / 'tests/audit/audit_scan_probe_matrix.tsv'
    s = p.read_text(encoding='utf-8')
    if SCAN in s:
        print('[1] 探针矩阵：已登记，跳过')
        return
    desc = (
        '读 settings-ui.js 面（该文件不在场/被掏空即阻断）；'
        'T 档对它无影响（本门量的是「控件 ↔ 配置 ↔ 保存路径」的交互逻辑，不读 tests/ 下的测试体），'
        '故如实记 0 —— G 列已非 0，非恒绿探测器。'
        '两档实测（tools/_o2_gt_probe.py，最小镜像 + LONSHA_AUDIT_ROOT）H/G/T = 0/2/0；'
        '★ 本门是 O2 剩余面的**可做切片**：真浏览器 / 真 SillyTavern 面交付者环境无浏览器可选，如实登记**未执行**。'
    )
    if not s.endswith(NL):
        s += NL
    s += TAB.join([SCAN, '0', '2', '0', desc]) + NL
    p.write_text(s, encoding='utf-8')
    print('[1] 探针矩阵：已补 ' + SCAN)


def step2_roster():
    p = REPO / 'tests/audit/catalog_reference_consumers.tsv'
    s = p.read_text(encoding='utf-8')
    if SUITE in s:
        print('[2] 在役测试面名册：已登记，跳过')
        return
    desc = (
        'O2 真实用户操作面·可做切片（14 个 test）：v3.271.0 交付的 scan_ui_runtime.mjs 只到**渲染层**'
        '（入口不抛 / 面板落 DOM / 控件在册 / 无属性吞并），**从未点过任何控件** —— '
        '而「控件有 DOM」与「控件可用」之间没有蕴含关系：一个 disabled 的滑块、一个把值写进死变量的 handler、'
        '一个 saveConfig 没接存储的保存键，都完全满足 U1~U5。本档补**交互层**：'
        'V1 控件真在场且可操作（不带 disabled）/ V2 复选框 click 后 DOM 真翻转、**点保存后**配置写回且与 DOM 一致、'
        '保存后面板须已关闭（closeOverlay 是真 remove）/ V3 同面板会话内改滑块值后保存 ⇒ 配置等于按 step 归一化的值 / '
        'V4 长文本改值后保存 ⇒ 配置等于 trim 后新值 / V5 点击 #ls-save 后 config.saveConfig() 必须真被调用 / '
        'V6 重开真保留（把保存后配置灌进**新环境**再渲染，控件 DOM 状态须反映保存值）/ '
        'V7 展开（原生 details 点 summary 后可见性真翻转，判据用 isVisible 的 details 语义）/ '
        'V8 窄屏（两种 matchMedia 返回值渲染，读数差异须可归因）/ V9 面自证非零下限 / V10 fail-closed。'
        '★ 本轮实测**五处假红**全记在扫描器档头与 CHANGELOG：'
        '① shim 未模拟 checkbox 原生 checked 翻转（真源读 e.target.checked 的写法被误判「点不动」）；'
        '② 折叠候选把 .ls-group-title（34 处，纯分组标题样式）当成折叠头，而真源折叠是原生 <details id="ls-advanced">（全仓仅 1 处）；'
        '③ shim 的 matchesOne 不支持 `>` 子组合器（`details > summary` 被切成三段，matchSimple(el,\'>\') 恒 false）'
        '⇒ 候选恒 0 ⇒ V7 报出「本仓设置面板未提供折叠头」这一**完全错误的结论**（测量盲区冒充事实，比红着更坏）；'
        '④ 判据断言「click 后 config 立即反转」，而真源复选框**没有任何 change/input 监听**、写回统一走 #ls-save 收集循环 ⇒ 判据按想象写而非按真源写；'
        '⑤ 把「改值」与「重开」顺序弄反（真源渲染 value="${c.vectorTopK ?? 5}" 每次开面板从配置重新渲染初值，'
        '改值后再重开会被旧值覆盖）⇒ 真序列是「重开拿干净面板 → 本面板上改值 → 本面板上保存」。'
        '边界（诚实登记，同 O2 验收原文「未执行不算通过」）：本门跑在**最小 DOM shim** 上（本仓零运行时依赖，审计脚本也不得 require 第三方），'
        '拦的是**交互逻辑**缺陷；它**不证明**宿主 CSS 生效、真实点击坐标命中、真实 localStorage 配额与跨会话行为 —— '
        '那些只有真浏览器 + 真 SillyTavern 才能证，本环境无任何 headless 浏览器可用（chromium/chrome/firefox 全无）、无 Playwright/Puppeteer，'
        '故真宿主面**如实登记未执行**；本档只证明「交互逻辑门本身可信」（判据能翻红、shim 忠实、fail-closed）。'
    )
    if not s.endswith(NL):
        s += NL
    s += TAB.join([SUITE, '', desc]) + NL
    p.write_text(s, encoding='utf-8')
    print('[2] 在役测试面名册：已补 ' + SUITE)


def step3_v3247():
    p = REPO / 'tests/v3247_break_kit_consolidation.test.mjs'
    s = p.read_text(encoding='utf-8')
    if SUITE in s:
        print('[3] v3247 接收方台账：已登记，跳过')
        return
    anchor = "    'v3286_plan_currency.test.mjs'," + NL + '];'
    if s.count(anchor) != 1:
        print('[3] [FATAL] v3247 锚点命中 %d 次（须恰 1 次），不写盘' % s.count(anchor))
        raise SystemExit(1)
    add = ("    'v3286_plan_currency.test.mjs'," + NL
           + '    /* [v3.287.0 O2] 新套件同样从唯一真源取 breakSource / assertSingleHit，' + NL
           + '     *   按台账纪律（接入面 == 磁盘事实）在此登记。 */' + NL
           + "    '" + SUITE + "'," + NL + '];')
    s = s.replace(anchor, add, 1)
    p.write_text(s, encoding='utf-8')
    print('[3] v3247 接收方台账：已补 ' + SUITE)


if __name__ == '__main__':
    step1_matrix()
    step2_roster()
    step3_v3247()
