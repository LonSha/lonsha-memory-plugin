// 审计基建 F（v3.162）：UI 绑定面卫生扫描
// ------------------------------------------------------------
// 为什么存在：
//   v3.161 把「配置可达性」做成了不变量（每个已声明键至少有一条可达路径），
//   但那只证明了「**存在**一个控件」，没有证明「**只有**一个控件」。
//   实测缺口：同一个配置键在面板的不同分组里各渲染了一份控件。
//   两处控件都会经 data-cfg* 收集写回同一个键，保存时后出现在 DOM 里的
//   那个赢（querySelectorAll 按文档顺序遍历，赋值即覆盖）；用户改 A 处，
//   以为生效了，实际值来自同样可见的 B 处。带 id 的那类（滑块数值标签）
//   还会产生重复 id —— getElementById 只取首个，第二处标签永不刷新。
//
// 判定策略：
//   A1 同一个配置键不得绑定多个渲染控件
//   A2 面板内不得出现重复的 ls-* DOM id
//   A3 每个被绑定的键都必须在默认配置块里声明（幽灵控件）
//   A4 控件类型必须与声明字面量类型一致
//   A5 保存路径里的 getElementById 目标必须真实存在于渲染面
//   A6 结构健康标记（防静默空跑）
//
// 关键实现细节（勿凭直觉改动）：
//   1. 「查询用属性选择器」与「渲染控件」长着同一副字符串，必须区分：
//        overlay.querySelector('[data-cfg-text="apiUrl"]')  ← 查询，不是控件
//        <input ... data-cfg-text="apiUrl">                 ← 渲染，是控件
//      判据是属性是否落在 querySelector / querySelectorAll / getElementById
//      的引号串里（向前 90 字符内出现未闭合的引号开括号）。
//   2. 只统计 `data-cfg` 系列的三种形态，外加 ck('KEY') 模板；
//      不把 `c.KEY` 直读算作绑定 —— 渲染一个值不等于能把值写回去。
//   3. 每一个判定面都必须有非零下限，否则「抽到 0 个控件」会以全绿通过。
//
// 退出码：0=卫生  1=存在真缺陷  2=结构漂移/探测器失效
// 夹具通道：LONSHA_AUDIT_FIXTURE=1 时放宽下限，供单测塞合成树。
import fs from 'fs';

const src = fs.readFileSync('index.js', 'utf8');
const ui = fs.readFileSync('settings-ui.js', 'utf8');

/* ---------- 0. 结构预检（fail-closed） ---------- */
const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';
const MIN_IDX_BYTES = FIXTURE_MODE ? 1 : 100000;
const MIN_UI_BYTES = FIXTURE_MODE ? 1 : 20000;
const MIN_UI_CTRLS = FIXTURE_MODE ? 1 : 30;
const MIN_DECLARED = FIXTURE_MODE ? 1 : 100;
const MIN_UI_IDS = FIXTURE_MODE ? 1 : 20;
if (src.length < MIN_IDX_BYTES || ui.length < MIN_UI_BYTES) {
    console.error('[ui-binding] 输入退化（index.js ' + src.length + ' 字节 / settings-ui.js ' + ui.length + ' 字节），审计脚本需同步结构变化');
    process.exit(2);
}

/* ---------- 1. 默认配置块与声明类型 ---------- */
function braceBlock(text, at) {
    const open = text.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) return { text: text.slice(open, i + 1), start: open, end: i }; }
    }
    return null;
}
const cfgAt = src.indexOf('this.config = {');
if (cfgAt < 0) {
    console.error('[ui-binding] 找不到默认配置块（`this.config = {`），探测器失效');
    process.exit(2);
}
const cfg = braceBlock(src, cfgAt);
const declared = new Map();
for (const m of cfg.text.matchAll(/\n\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^\n,]*)/g)) {
    const k = m[1], raw = m[2].trim();
    let t;
    if (/^(true|false)\b/.test(raw)) t = 'bool';
    else if (/^[`'"]/.test(raw)) t = 'str';
    else if (/^\[/.test(raw)) t = 'arr';
    else if (/^\{/.test(raw)) t = 'obj';
    else if (/^-?[0-9]/.test(raw)) t = 'num';
    else t = 'other';
    declared.set(k, t);
}
if (declared.size < MIN_DECLARED) {
    console.error('[ui-binding] 仅抽到 ' + declared.size + ' 个配置键（低于下限 ' + MIN_DECLARED + '），配置块抽取器已失效');
    process.exit(2);
}

/* ---------- 2. 渲染控件面（排除查询用选择器） ---------- */
const isLookup = (s, pos) => /(?:querySelector|querySelectorAll|getElementById|closest)\(\s*['"][^'"]*$/.test(s.slice(Math.max(0, pos - 90), pos));
const at = (s, pos) => s.slice(0, pos).split('\n').length;
const bind = new Map();          // key -> [{ kind, line }]
const add = (k, kind, line) => {
    if (!bind.has(k)) bind.set(k, []);
    bind.get(k).push({ kind, line });
};
for (const m of ui.matchAll(/data-cfg(?:-num|-text)?="([A-Za-z_][A-Za-z0-9_]*)"/g)) {
    if (isLookup(ui, m.index)) continue;
    const attr = m[0].slice(0, m[0].indexOf('='));
    const kind = attr === 'data-cfg' ? 'checkbox' : (attr === 'data-cfg-num' ? 'slider' : 'text');
    add(m[1], kind, at(ui, m.index));
}
for (const m of ui.matchAll(/\bck\('([A-Za-z_][A-Za-z0-9_]*)'/g)) {
    if (isLookup(ui, m.index)) continue;
    add(m[1], 'checkbox', at(ui, m.index));
}
const ctrlCount = [...bind.values()].reduce((n, v) => n + v.length, 0);
if (ctrlCount < MIN_UI_CTRLS) {
    console.error('[ui-binding] 仅抽到 ' + ctrlCount + ' 个渲染控件（低于下限 ' + MIN_UI_CTRLS + '），UI 抽取面已退化');
    process.exit(2);
}

/* ---------- 3. DOM id 面 ---------- */
// 两个来源缺一不可：模板里的 id="X"，以及运行时 createElement 后赋的 el.id = 'X'。
//   只认前者会把动态创建的浮层（FAB 菜单 / 快照菜单）误报成「查了一个不存在的 id」。
const ids = new Map();           // id -> [line]
const addId = (id, line) => {
    if (!ids.has(id)) ids.set(id, []);
    ids.get(id).push(line);
};
for (const m of ui.matchAll(/\bid="([A-Za-z][A-Za-z0-9_-]*)"/g)) addId(m[1], at(ui, m.index));
for (const m of ui.matchAll(/\.id\s*=\s*'([A-Za-z][A-Za-z0-9_-]*)'/g)) addId(m[1], at(ui, m.index));
if (ids.size < MIN_UI_IDS) {
    console.error('[ui-binding] 仅抽到 ' + ids.size + ' 个 DOM id（低于下限 ' + MIN_UI_IDS + '），id 抽取器已失效');
    process.exit(2);
}

/* ---------- 判定 ---------- */
const defects = [];

// A1 同一个键绑定多个渲染控件
for (const [k, list] of [...bind.entries()].sort()) {
    if (list.length > 1) {
        defects.push('A1 键 `' + k + '` 被绑定 ' + list.length + ' 次（行 ' + list.map(x => x.line).join(' / ')
            + '）：两处都写回同一个配置，保存时 DOM 中靠后的那个赢，用户改另一处会以为生效了');
    }
}
// A2 重复 DOM id
for (const [id, list] of [...ids.entries()].sort()) {
    if (list.length > 1) {
        defects.push('A2 id `' + id + '` 出现 ' + list.length + ' 次（行 ' + list.join(' / ')
            + '）：getElementById 只取首个，第二处标签永不刷新');
    }
}
// A3 幽灵控件（绑定了但未声明）
for (const k of [...bind.keys()].sort()) {
    if (!declared.has(k)) defects.push('A3 键 `' + k + '` 有控件但默认配置块里没有声明（控件写进一个引擎不读的字段）');
}
// A4 控件类型与声明类型不一致
for (const [k, list] of [...bind.entries()].sort()) {
    const t = declared.get(k);
    if (t === undefined) continue;
    for (const { kind, line } of list) {
        const ok = (t === 'bool' && kind === 'checkbox')
            || (t === 'num' && kind === 'slider')
            || (t === 'str' && kind === 'text')
            || ((t === 'arr' || t === 'obj') && kind === 'text');
        if (!ok) {
            defects.push('A4 键 `' + k + '` 在行 ' + line + ' 用 ' + kind + ' 控件绑定，但声明类型是 ' + t
                + '（保存路径会把值强转成另一种类型）');
        }
    }
}
// A5 保存路径查的 id 必须真实存在
for (const m of ui.matchAll(/getElementById\('([A-Za-z][A-Za-z0-9_-]*)'\)/g)) {
    const id = m[1];
    if (!ids.has(id)) {
        defects.push('A5 行 ' + at(ui, m.index) + " 查 getElementById('" + id + "')，但渲染面里没有这个 id（静默 null）");
    }
}

/* ---------- 报告 ---------- */
console.log('=== A 面 UI 绑定卫生 ===');
console.log('声明键 ' + declared.size + ' 个 | 渲染控件 ' + ctrlCount + ' 个（' + bind.size + ' 个键）| DOM id ' + ids.size + ' 个' + (FIXTURE_MODE ? ' [FIXTURE]' : ''));
console.log('A6 结构健康：' + (defects.length ? '发现 ' + defects.length + ' 项缺陷' : 'ok'));
if (defects.length) {
    console.error('');
    for (const d of defects) console.error('[ui-binding] ' + d);
    console.error('');
    console.error('[ui-binding] 失败：UI 绑定面存在 ' + defects.length + ' 项缺陷（每个键只应有一个控件，每个 id 只应出现一次）。');
    process.exit(1);
}
console.log('[ui-binding] 通过：每个配置键只有一个控件，无重复 id，无幽灵键，类型一致。');
process.exit(0);
