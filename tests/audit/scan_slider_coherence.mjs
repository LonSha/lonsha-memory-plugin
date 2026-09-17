// 审计基建 E（v3.158）：滑块声明自洽扫描
//
// 存在理由：v3.156 修掉了一批「min=0 但回退用 || 数字」的滑块（0 是合法值却被渲染成回退值），
//   但那只修了当时被发现的那几个。diaryEveryFloors 当时被漏了 —— 它的滑杆 min=0
//   （语义就是「0=每楼」，v3.156 刚把引擎侧改成真正可达），但 value 仍写 `${c.diaryEveryFloors || 3}`：
//   用户把 0 存进配置后回到面板，滑块显示的是 3。改动看起来在、存下去也对，就是面板在说假话。
//   本脚本把这类「声明层面就自相矛盾」的控件变成常驻检查。
//
// 检查项：
//   E1 min < max，且 step 整除区间（浮点容差 1e-9）
//   E2 min=0 的滑杆不得用 `|| 非零数字` 做回退（0 是合法值，`??` 才是正确算子）
//   E3 默认配置块里的默认值落在 [min,max] 且在 step 网格上
//   E4 每个滑杆键都在默认配置块里有定义
// 退出码：0 = 无问题 / 1 = 发现问题（阻断 CI）/ 2 = 结构变化导致脚本需同步
import fs from 'fs';

const idx = fs.readFileSync('index.js', 'utf8');
const ui = fs.readFileSync('settings-ui.js', 'utf8');

/* ---------- 1. 拆出所有 range 控件 ---------- */
function attr(tag, name) {
    const needle = name + '="';
    const at = tag.indexOf(needle);
    if (at < 0) return null;
    const from = at + needle.length;
    const to = tag.indexOf('"', from);
    if (to < 0) return null;
    return tag.slice(from, to);
}
const sliders = [];
{
    const marker = '<input type="range"';
    let at = ui.indexOf(marker);
    while (at >= 0) {
        const close = ui.indexOf('>', at);
        if (close < 0) break;
        const tag = ui.slice(at, close + 1);
        sliders.push({
            key: attr(tag, 'data-cfg-num'),
            min: attr(tag, 'min'),
            max: attr(tag, 'max'),
            step: attr(tag, 'step'),
            value: attr(tag, 'value') || '',
            line: ui.slice(0, at).split('\n').length
        });
        at = ui.indexOf(marker, close);
    }
}
if (sliders.length === 0) {
    console.error('[slider-coherence] settings-ui.js 里找不到任何 range 控件，审计脚本需同步结构变化');
    process.exit(2);
}

/* ---------- 2. 默认配置块 ---------- */
const cfgAt = idx.indexOf('this.config = {');
if (cfgAt < 0) {
    console.error('[slider-coherence] 未找到 this.config = { 默认配置块，审计脚本需同步结构变化');
    process.exit(2);
}
const cfgOpen = idx.indexOf('{', cfgAt);
let depth = 0, cfgClose = -1;
for (let i = cfgOpen; i < idx.length; i++) {
    if (idx[i] === '{') depth++;
    else if (idx[i] === '}') { depth--; if (depth === 0) { cfgClose = i; break; } }
}
if (cfgClose < 0) { console.error('[slider-coherence] 默认配置块括号不闭合'); process.exit(2); }
const cfg = idx.slice(cfgOpen, cfgClose);

function num(v) {
    if (v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
/* read a plain decimal literal starting at (or after) `from`; null when there is none */
function readNumber(text, from) {
    let i = from;
    while (i < text.length && text[i] === ' ') i++;
    let out = '';
    while (i < text.length && /[0-9.]/.test(text[i])) { out += text[i]; i++; }
    if (!out || out === '.') return null;
    const n = Number(out);
    return Number.isFinite(n) ? out : null;
}
function onGrid(a, base, step) {
    const q = (a - base) / step;
    return Math.abs(Math.round(q) * step - (a - base)) <= 1e-9;
}
function defaultOf(key) {
    if (!key) return null;
    const m = new RegExp('\\b' + key + '[ ]*:').exec(cfg);
    if (!m) return null;
    const from = m.index + m[0].length;
    let out = '';
    for (let i = from; i < cfg.length; i++) {
        const ch = cfg[i];
        if (ch === ',' && out.length) break;
        if (ch === '\n') break;
        out += ch;
        if (out.length > 40) break;
    }
    out = out.trim();
    if (out.startsWith('{') || out.startsWith('[')) return null;
    return out;
}

/* ---------- 3. 逐项检查 ---------- */
const problems = [];
for (const s of sliders) {
    const tag = s.key || ('<无键，行 ' + s.line + '>');
    const mn = num(s.min), mx = num(s.max), st = num(s.step);

    // E1
    if (mn === null || mx === null || st === null) {
        problems.push('E1 ' + tag + '：min/max/step 非数值（min=' + s.min + ' max=' + s.max + ' step=' + s.step + '）');
    } else {
        if (!(mn < mx)) problems.push('E1 ' + tag + '：min(' + mn + ') 不小于 max(' + mx + ')');
        if (!(st > 0)) problems.push('E1 ' + tag + '：step(' + st + ') 不是正数');
        else if (!onGrid(mx, mn, st)) problems.push('E1 ' + tag + '：step(' + st + ') 不整除区间 [' + mn + ',' + mx + ']');
    }

    // E2：min=0 时，任何展示该键的地方都不能用 `|| 非零`（0 是合法值）。
    //   两个位置都要查：滑杆自身的 value，以及配对的数值标签（ls-slider-val）。
    //   v3.157 只修了 value 而漏了标签，diaryEveryFloors 连 value 都漏了 —— 同一个错。
    //   实现故意不用正则：在 60 万字符的文件上反复建正则既不必要也容易踩回溯。
    if (s.min === '0' && s.key) {
        const shown = [];
        const vAt = s.value.indexOf('||');
        if (vAt >= 0) {
            const fb = readNumber(s.value, vAt + 2);
            if (fb) shown.push(['value', fb]);
        }
        const labelNeedle = 'ls-slider-val';
        const exprNeedle = '${c.' + s.key + ' ||';
        const exprNeedle2 = '${c.' + s.key + ' || ';
        let at = ui.indexOf(labelNeedle);
        while (at >= 0) {
            const gt = ui.indexOf('>', at);
            if (gt < 0) break;
            const close = ui.indexOf('}', gt);
            const seg = close < 0 ? ui.slice(gt) : ui.slice(gt, close);
            for (const nd of [exprNeedle, exprNeedle2]) {
                const k = seg.indexOf(nd);
                if (k >= 0) {
                    const fb = readNumber(seg, k + nd.length - 1);
                    if (fb) shown.push(['label', fb]);
                }
            }
            at = ui.indexOf(labelNeedle, gt);
        }
        for (const pair of shown) {
            if (Number(pair[1]) !== 0) {
                problems.push('E2 ' + tag + '：min=0 但 ' + pair[0] + ' 的回退写成 `|| ' + pair[1] + '` —— 0 是合法值，会被渲染成 ' + pair[1] + '（应用 `?? ' + pair[1] + '`）');
            }
        }
    }

    // E3
    const d = defaultOf(s.key);
    const dn = num(d);
    if (dn !== null && mn !== null && mx !== null && st !== null) {
        if (!(mn <= dn && dn <= mx)) problems.push('E3 ' + tag + '：默认值 ' + dn + ' 不在 [' + mn + ',' + mx + '] 内');
        else if (!onGrid(dn, mn, st)) problems.push('E3 ' + tag + '：默认值 ' + dn + ' 不在 step 网格上（min=' + mn + ' step=' + st + '）');
    }

    // E4
    if (s.key && defaultOf(s.key) === null) {
        problems.push('E4 ' + tag + '：UI 有控件但默认配置块里没有该键');
    }
}

console.log('=== E1-E4 滑块声明自洽：控件 ' + sliders.length + ' 个 / 问题 ' + problems.length + ' ===');
if (problems.length) {
    for (const p of problems) console.log('  x ' + p);
} else {
    console.log('  （无问题）');
}

if (problems.length) {
    console.error('');
    console.error('[slider-coherence] 发现 ' + problems.length + ' 处控件声明自相矛盾。');
    console.error('  修法：E1 调 min/max/step；E2 把 || 换成 ??；E3 让默认值落在区间与网格上；E4 补默认配置键。');
    process.exit(1);
}
console.log('');
console.log('[slider-coherence] 通过：每个滑块声明自洽，且 min=0 的控件不会被回退值吃掉 0。');
process.exit(0);
