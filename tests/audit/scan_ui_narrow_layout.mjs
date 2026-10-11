/* ============================================================
 * tests/audit/scan_ui_narrow_layout.mjs —— UI **窄屏布局容差**门（零依赖）[v3.318.0 M-O2]
 * ------------------------------------------------------------
 * 为什么存在（真浏览器取证实测，不是整洁性偏好）：
 *   M-O2 的真浏览器切片（tests/audit/_mo2_realbrowser_probe.mjs，真 Chromium +
 *   真 SillyTavern 1.19.0，CDP 直连）在 Emulation 320x640 下实测到**用户可见的真缺陷**：
 *     narrow.inViewOfControls = 160/161
 *     narrow.overflow = [{tag:INPUT, key:llmEventChainEnabled, left:449, right:493,
 *                         w:44, parentCls:ls-row}]
 *     .lonsha-sheet-body: scrollWidth 492 > clientWidth 307
 *   即：设置面板在手机宽度下**有一个开关被顶出屏幕**（right=493 > 视口 320）——
 *   用户看得到半行说明文字，看不到那个 checkbox。
 *
 *   根因两处，缺一不成（本门要判的是这个**形态**，不是那一行）：
 *     ① `.ls-hint`（说明文本）没有 `overflow-wrap` / `word-break`：文本里的**长不可断
 *        ASCII 串**（`SillyTavern.getContext().chat[N].extra.lonsha_omit = true`、
 *        `run_started→model_requested/assistant_message/run_failed`、
 *        `window.lonsha_memory_bridge_v1`、`extract/summarize/select/rerank/...`）
 *        按 CSS 默认（`overflow-wrap: normal`）**不换行**，把所在行撑到 277~474px；
 *     ② `.ls-row` 是 `display:flex`，而 flex 子项的自动最小尺寸是**内容最小尺寸**
 *        （`min-width: auto`）—— 即子项**不允许收缩到内容以下**；于是 ①撑宽的内容
 *        把右侧 44x44 的 checkbox 一路推到 left=449。
 *
 *   为什么既有四层 UI 门全绿却漏了它：
 *     · `scan_ui_binding.mjs`(A) 静态绑定卫生 / `scan_ui_runtime.mjs`(U) 入口实调 /
 *       `scan_ui_interaction.mjs`(V) 控件交互 / `scan_ui_panel_drive.mjs`(W) 条目驱动 ——
 *       四层都跑在**最小 DOM shim** 上，而 shim 里**没有布局**（没有视口宽度、没有
 *       flex 收缩、没有文本换行）⇒ 这一类**结构上就测不出来**。
 *     本门把「布局前提」这一面用**静态可判**的方式补上：让窄屏能容下的那些声明
 *     （断行 + flex 收缩）必须真在册，且必须**由真实内容驱动**（见 N4）。
 *
 * 判定策略（每条都带非零下限；抽到 0 也绿就等于没判）：
 *   N1 长文本载体断行在册：登记的长文本选择器（`.ls-hint` / `.ls-group-title` /
 *      `.ls-item-text` / `.ls-slider-label`）各自必须声明 `overflow-wrap` 或 `word-break`。
 *      （**不依赖继承**：载体可被放进任意容器，继承链会随 DOM 结构变化；载体自持最稳。）
 *   N2 flex 行容器的收缩许可：凡「flex 容器 + 其下有定宽控件」的形态，必须在容器或
 *      其标签子项（`S > div`）上声明 `min-width: 0` —— 这是 flex 项能收缩的**必要条件**。
 *   N2b 同一形态还须让文本真能断（容器或标签子项上有 `overflow-wrap` / `word-break`）：
 *      只加收缩不加断行 ⇒ 文本仍不换行（相邻刻度会重叠）；只加断行不加收缩 ⇒ 仍撑宽。
 *   N4 内容驱动（防「声明了但没人用」）：UI 说明文本里出现 >=24 字符的**不可断 ASCII 串**
 *      时（下限 >=2 处），断行声明必须真在册。本门不是「CSS 里有没有某条规则」，
 *      而是「有没有长串 + 那个长串的载体能不能断」。
 *   N5 面自证：CSS 块字节数 / 解析出的规则数 / 长文本载体数 / flex 容器数 全为非零下限。
 *
 * 实现约束（勿凭直觉改动）：
 *   · 零运行时依赖：自带**极简 CSS 解析器**（括号配对），不引入第三方。
 *   · CSS 取自 `settings-ui.js` 里 `style.textContent = \`...\`` 那段**注入样式**；
 *     解析前必须剥掉 `/* ... *\/` 注释 —— 否则注释会被并入**下一条规则的 prelude**，
 *     选择器精确匹配全部失效（本门首稿实测踩过）。
 *   · 退出码：0=卫生  1=存在真缺陷  2=结构漂移/探测器失效（没得判 != 通过）。
 *
 * 边界（诚实，必须与结论一起读）：
 *   · 本门判的是**布局前提是否在册**，**不**在浏览器里量像素 —— 真像素读数只能由真浏览器
 *     取证（`tests/audit/_mo2_realbrowser_probe.mjs`，依赖本地 ST clone 与 Chromium，
 *     **不进 npm test**）。本门的作用是把那份取证抓到的缺陷**钉住**：使「摘掉断行 /
 *     摘掉收缩」在**无浏览器环境**下也当场翻红。
 *   · 本门**不**取代 A/U/V/W 四层：那四层管「控件在不在、点了有没有反应」，本门只管
 *     「窄屏下控件还在不在视口里」。缺本门即留下 320px 那一格的盲区。
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { EXIT } from '../_exit_codes.mjs';

const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const FIXTURE = process.env.LONSHA_AUDIT_FIXTURE === '1';
const UI_PATH = path.join(ROOT, 'settings-ui.js');
const MIN_UI_BYTES = Number(process.env.LONSHA_AUDIT_MIN_UI_BYTES || (FIXTURE ? 1 : 20000));
const MIN_CSS_BYTES = FIXTURE ? 1 : 4000;
const MIN_RULES = FIXTURE ? 1 : 40;
const MIN_CARRIERS = FIXTURE ? 1 : 3;
const MIN_FLEX = FIXTURE ? 1 : 3;
const MIN_LONGTOK = FIXTURE ? 1 : 2;

const drift = (m) => {
    console.error('[ui-narrow] ' + m + '（结构漂移/探测器失效）');
    process.exit(EXIT.DRIFT);
};

let ui = '';
try { ui = fs.readFileSync(UI_PATH, 'utf8'); } catch (_e) { ui = ''; }
if (ui.length < MIN_UI_BYTES) {
    drift('settings-ui.js ' + ui.length + ' 字节（下限 ' + MIN_UI_BYTES + '）⇒ 输入退化，拒绝给结论');
}

/* ---------- 1. 取注入样式块 ---------- */
const CSS_ANCHOR = 'style.textContent = `';
const c0 = ui.indexOf(CSS_ANCHOR);
if (c0 < 0) drift('找不到注入样式块（' + CSS_ANCHOR.trim() + '）⇒ 本门的对象面缺席');
const c1 = ui.indexOf('`;', c0 + CSS_ANCHOR.length);
if (c1 < 0) drift('注入样式块未闭合 ⇒ 本门的对象面缺席');
let css = ui.slice(c0 + CSS_ANCHOR.length, c1);
if (css.length < MIN_CSS_BYTES) {
    drift('注入样式块 ' + css.length + ' 字节（下限 ' + MIN_CSS_BYTES + '）⇒ 样式面退化');
}
/* 注释必须先剥：否则注释文本会被并进**下一条规则**的 prelude（选择器精确匹配失效）。 */
const cssBare = css.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* ---------- 2. 极简 CSS 解析（括号配对；@media 里的规则也算数） ---------- */
function parseRules(text) {
    const out = [];
    const stack = [];
    let i = 0;
    let start = 0;
    while (i < text.length) {
        const ch = text[i];
        if (ch === '{') {
            stack.push(text.slice(start, i).trim());
            i += 1;
            start = i;
            continue;
        }
        if (ch === '}') {
            const prelude = stack[stack.length - 1] || '';
            const decls = text.slice(start, i).trim();
            if (prelude && !prelude.startsWith('@')) out.push({ sel: prelude, decls });
            stack.pop();
            i += 1;
            start = i;
            continue;
        }
        i += 1;
    }
    return out;
}
const rules = parseRules(cssBare);
if (rules.length < MIN_RULES) {
    drift('仅解析出 ' + rules.length + ' 条 CSS 规则（下限 ' + MIN_RULES + '）⇒ 解析器/样式面退化');
}
/* 同一选择器可能出现在 @media 里：按选择器合并声明，避免「基础规则没有、媒体查询里有」误报。 */
const bySel = new Map();
for (const r of rules) {
    if (bySel.has(r.sel)) bySel.get(r.sel).push(r.decls);
    else bySel.set(r.sel, [r.decls]);
}
const declsOf = (sel) => (bySel.get(sel) || []).join(' ; ');
const hasRule = (sel) => bySel.has(sel);
const norm = (s) => String(s).replace(/\s+/g, '');
const hasWrap = (sel) => /overflow-wrap:(anywhere|break-word)|word-break:(break-word|break-all|anywhere)/.test(norm(declsOf(sel)));
const hasShrink = (sel) => /min-width:0(?![.0-9])/.test(norm(declsOf(sel)));

const defects = [];

/* ---------- N1 长文本载体断行在册（不依赖继承） ---------- */
const CARRIERS = ['.ls-hint', '.ls-group-title', '.ls-item-text', '.ls-slider-label'];
const carriersFound = CARRIERS.filter(hasRule);
if (carriersFound.length < MIN_CARRIERS) {
    drift('仅找到 ' + carriersFound.length + ' 个登记的长文本载体（下限 ' + MIN_CARRIERS
        + '，实得 ' + JSON.stringify(carriersFound) + '）⇒ 载体名已漂移，本门的判定面不可信');
}
for (const sel of carriersFound) {
    if (!hasWrap(sel)) {
        defects.push('N1 长文本载体 ' + sel + ' 未声明 overflow-wrap / word-break'
            + '（默认 overflow-wrap:normal ⇒ 长不可断 ASCII 串会把整行撑宽，'
            + '实机 320px 下已把 44px 的 checkbox 顶出视口 left=449 > 320）');
    }
}

/* ---------- N2 / N2b flex 行容器的收缩许可与断行 ---------- */
const flexSels = [...bySel.keys()].filter((s) => /display:flex(?!-)/.test(norm(declsOf(s))));
if (flexSels.length < MIN_FLEX) {
    drift('仅找到 ' + flexSels.length + ' 个 flex 容器（下限 ' + MIN_FLEX + '）⇒ 布局面退化');
}
/** 定宽控件：容器 S 的后代规则里出现固定像素宽度（如 .ls-row input[type="checkbox"] { width: 44px }）。 */
const fixedRows = [];
for (const s of flexSels) {
    const fixed = rules.filter((r) => r.sel.startsWith(s + ' ')
        && /(?:^|;)\s*width:\s*\d+(?:\.\d+)?px/.test(r.decls));
    if (fixed.length) fixedRows.push({ s, fixed: fixed.map((r) => r.sel) });
}
if (!fixedRows.length) {
    drift('没有任何「flex 容器 + 定宽控件」形态被识别到 ⇒ 本门的主判定面为空（结构漂移）');
}
for (const { s, fixed } of fixedRows) {
    const child = s + ' > div';
    const shrink = hasShrink(s) || hasShrink(child);
    if (!shrink) {
        defects.push('N2 flex 行容器 ' + s + '（其下有定宽控件 ' + fixed.join(' / ') + '）'
            + '未在 ' + s + ' 或 ' + child + ' 上声明 min-width: 0 ⇒ flex 子项按 min-width:auto'
            + '不允许收缩到内容以下，长文本会把定宽控件顶出视口');
    }
    const wrap = hasWrap(s) || hasWrap(child);
    if (!wrap) {
        defects.push('N2b flex 行容器 ' + s + '（其下有定宽控件 ' + fixed.join(' / ') + '）'
            + '未在 ' + s + ' 或 ' + child + ' 上声明 overflow-wrap / word-break ⇒ 长不可断串'
            + '仍不换行（只收缩不断行会把文本溢出容器而不是折行）');
    }
}

/* ---------- N4 内容驱动：真出现长不可断 ASCII 串时，断行必须在册 ---------- */
const hintTexts = [];
for (const m of ui.matchAll(/class="ls-hint"[^>]*>([^<]{0,400})/g)) hintTexts.push(m[1]);
for (const m of ui.matchAll(/\bck\('[A-Za-z_][A-Za-z0-9_]*',\s*'[^']*',\s*'([^']*)'\)/g)) hintTexts.push(m[1]);
const TOKEN_RE = /[A-Za-z0-9_\-./:+\[\](){}@#=]{24,}/g;
const longToks = new Set();
for (const t of hintTexts) {
    for (const m of String(t).matchAll(TOKEN_RE)) longToks.add(m[0].slice(0, 60));
}
if (longToks.size < MIN_LONGTOK) {
    drift('UI 说明文本里只找到 ' + longToks.size + ' 处长不可断 ASCII 串（下限 ' + MIN_LONGTOK
        + '）⇒ 内容抽取面退化（N4 会静默空跑）');
}
const wrapAnywhere = carriersFound.some(hasWrap)
    || [...bySel.keys()].some((s) => hasWrap(s));
if (!wrapAnywhere) {
    defects.push('N4 UI 说明文本含 ' + longToks.size + ' 处 >=24 字符的不可断 ASCII 串（如 '
        + [...longToks].slice(0, 2).join(' / ') + '），而样式面里没有任何 overflow-wrap / word-break'
        + '声明 ⇒ 那些串在窄屏下不可能折行');
}

/* ---------- 读数 ---------- */
const flexNarrow = flexSels.length;
console.log('  CSS 面：注入样式 ' + css.length + ' 字节 / 规则 ' + rules.length + ' 条 / 选择器 '
    + bySel.size + ' 个；长文本载体 ' + carriersFound.length + ' 个；flex 容器 ' + flexNarrow
    + ' 个（其中定宽行 ' + fixedRows.length + ' 个）；长不可断串 ' + longToks.size + ' 处'
    + (FIXTURE ? ' [FIXTURE]' : ''));
console.log('  N5 面自证：' + (FIXTURE ? 'fixture 下限已降' : ('下限 ' + MIN_RULES + '/' + MIN_CARRIERS + '/' + MIN_FLEX + '/' + MIN_LONGTOK)));

if (defects.length) {
    console.error('');
    for (const d of defects) console.error('[ui-narrow] ' + d);
    console.error('');
    console.error('[ui-narrow] 失败：窄屏布局前提缺失 ' + defects.length + ' 项'
        + '（断行 + flex 收缩两处配套，缺一即留下 320px 视口外的控件）。');
    process.exit(EXIT.DEFECT);
}
console.log('[ui-narrow] 通过：长文本载体断行在册，flex 定宽行允许收缩且可断行，'
    + '内容驱动的长串检查通过（窄屏布局前提齐备）。');
process.exit(EXIT.CLEAN);
