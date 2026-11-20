#!/usr/bin/env node
/* ============================================================
 * tools/strip-emoji.mjs — 去 emoji / 字符图标的可复现改写器（codemod，零依赖，Node 18+）
 * ------------------------------------------------------------
 * 目标：把界面文字里的 emoji 与「当图标用的符号」换成 shared/icons.js 的 SVG 图标（经 css/ls-icons.css
 *       的遮罩占位 <i class="ls-ico" data-i="…">）或纯文字；每次上游发新版都能重新跑一遍得到同样的结果。
 *
 * 用法（在 lonsha-memory-plugin 仓库根目录执行）：
 *   node tools/strip-emoji.mjs                    只报告（不写文件），默认范围 = UI 层文件（见 UI_FILES）
 *   node tools/strip-emoji.mjs --write            原地改写
 *   node tools/strip-emoji.mjs --out=DIR          改写结果写到 DIR（保持相对路径），原文件不动
 *   node tools/strip-emoji.mjs --scope=all        范围扩大到全部根目录运行时 .js（引擎文件只去 emoji，不动注释与流程箭头）
 *   node tools/strip-emoji.mjs --comments         注释也清理（默认只清 settings-ui.js 的注释；其它文件的注释可能被测试当锚点）
 *   node tools/strip-emoji.mjs --arrows           非 UI 层文件（--scope=all 时）也把流程箭头（U+2192 / U+21D2 / U+2194 / U+2190 等）改成图标 / ASCII
 *   node tools/strip-emoji.mjs --tests            额外扫描 tests/：列出会因字符串变化而失败的断言（文件:行）
 *   node tools/strip-emoji.mjs --fix-tests        在 --tests 基础上，把能确定新写法的断言字面量一并改写
 *   node tools/strip-emoji.mjs --json=report.json 写出完整 JSON 报告
 *   node tools/strip-emoji.mjs --scan-only        只统计全仓（.js .mjs .cjs .css .html .md .json）每个文件的码点数，不改写
 *
 * 改写规则（按字面量所处位置决定，判定在词法层做，不靠正则猜）：
 *   1. HTML 字面量（字面量本身含标签，或位于 HTML 模板的 ${…} 里、且没有被 esc() 之类函数包住）：
 *        emoji -> <i class="ls-ico" data-i="图标名" aria-hidden="true"></i>（状态类附 data-tone）；
 *        流程箭头 -> 行内小图标（带 role="img" 与中文 aria-label）；在标签属性里、<option>/<textarea> 里一律按文字处理。
 *   2. 文字字面量（toast / confirm / textContent / title / esc() 参数 / 对象标签表 / 其他未知去向）：
 *        前导 emoji 连同后面的空格删除；中间的 emoji 删除；流程箭头 -> ASCII（-> => <- <->）。
 *   3. toast(…) 调用：前导状态 emoji 转成第二个参数 kind（'success' | 'warn' | 'error' | 'info' | 'pending'
 *        或图标名），由改写后的 toast() 渲染成前导 SVG 图标；三元表达式按分支生成 kind 表达式（条件须是简单标识符链）。
 *   4. 功能性字面量（.replace / .includes / .startsWith / .indexOf / .split / 正则 / === 比较的操作数）：
 *        **不改运行时值**，只把码点改写成 \u 转义 —— 源码零 emoji，而与其它文件（上游生产方）的匹配关系不变。
 *   5. 注释（仅 FULL_FILES，即 settings-ui.js）：emoji 删除，箭头 -> ASCII，星号 U+2605 -> *，对勾 U+2713 -> OK，叉 U+2717 -> x，警告 U+26A0 -> !。
 *   6. 锚点改写（SPECIAL_REWRITES）：toast() / _memToast() 的定义升级为「前导图标 + 文字」；锚点必须恰好命中 1 次，
 *        上游改了这段代码时会在报告里写 anchor-miss，不会静默跳过。
 * 行数不变：所有改写都在行内完成（测试里有按行定位的判据）。
 * 本文件自身不含任何被检码点：所有字符一律用 \u 转义书写。
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';

// <core>
/* ---------------- 码点分类 ---------------- */
const EMOJI_SRC = '[\\u{1F000}-\\u{1FAFF}\\u{E0020}-\\u{E007F}\\u{2B50}\\u{2B55}\\u{231A}\\u{231B}\\u{23E9}-\\u{23F3}\\u{23F8}-\\u{23FA}\\u{25FD}\\u{25FE}\\u{2614}\\u{2615}\\u{2648}-\\u{2653}\\u{267F}\\u{2693}\\u{26A1}\\u{26AA}\\u{26AB}\\u{26BD}\\u{26BE}\\u{26C4}\\u{26C5}\\u{26CE}\\u{26D4}\\u{26EA}\\u{26F2}-\\u{26F5}\\u{26FA}\\u{26FD}\\u{2705}\\u{270A}\\u{270B}\\u{2728}\\u{274C}\\u{274E}\\u{2753}-\\u{2755}\\u{2757}\\u{2795}-\\u{2797}\\u{27B0}\\u{27BF}]';
const GLYPH_SRC = '[\\u{2190}-\\u{21FF}\\u{2300}-\\u{23FF}\\u{25A0}-\\u{25FF}\\u{2600}-\\u{27BF}\\u{2900}-\\u{297F}\\u{2B00}-\\u{2BFF}\\u{3030}\\u{303D}\\u{3297}\\u{3299}\\u{2122}\\u{2139}\\u{24C2}]';
const MOD_SRC = '[\\u{FE0E}\\u{FE0F}\\u{1F3FB}-\\u{1F3FF}\\u{20E3}]';
/* 一个「簇」= 基字符 + 可选变体选择符 / 肤色 / 键帽 + 可选 ZWJ 连接的后续字符 */
const CLUSTER_SRC = '(?:' + EMOJI_SRC + '|' + GLYPH_SRC + ')' + MOD_SRC + '*(?:\\u{200D}(?:' + EMOJI_SRC + '|' + GLYPH_SRC + ')' + MOD_SRC + '*)*|' + MOD_SRC + '|\\u{200D}';
const reCluster = () => new RegExp(CLUSTER_SRC, 'gu');
const EMOJI_RE = new RegExp(EMOJI_SRC + '|[\\u{FE0F}\\u{200D}\\u{20E3}]', 'gu');
const GLYPH_RE = new RegExp(GLYPH_SRC, 'gu');
const cp = (s) => s.codePointAt(0);
const hex = (n) => n.toString(16).toUpperCase().padStart(4, '0');

/* 流程箭头：在 HTML 里换成行内小图标，在文字里换成 ASCII */
const FLOW = {
    0x2192: { a: '->', i: 'arrow-right', label: '\u81F3' },      // 至
    0x27F6: { a: '->', i: 'arrow-right', label: '\u81F3' },
    0x21D2: { a: '=>', i: 'arrow-right', label: '\u56E0\u6B64' }, // 因此
    0x2190: { a: '<-', i: 'chevron-left', label: '\u8FD4\u56DE' }, // 返回
    0x21D0: { a: '<=', i: 'chevron-left', label: '\u7531' },
    0x2194: { a: '<->', i: 'swap', label: '\u4E0E' },             // 与
    0x21C4: { a: '<->', i: 'swap', label: '\u4E92\u6362' },
    0x21D4: { a: '<=>', i: 'swap', label: '\u7B49\u4EF7' },
};
/* 图标映射：码点 -> [图标名, 状态色调, 注释里的 ASCII] —— 图标名全部来自 shared/icons.js v3.1 */
const M = (i, tone, c) => ({ i, tone: tone || '', c: c || '' });
const MAP = {
    0x2705: M('check-circle', 'success', 'OK'), 0x2713: M('check', 'success', 'OK'), 0x2714: M('check', 'success', 'OK'), 0x2611: M('check', 'success', 'OK'),
    0x274C: M('x-circle', 'error', 'x'), 0x2717: M('xmark', 'error', 'x'), 0x2718: M('xmark', 'error', 'x'), 0x2715: M('xmark', '', 'x'), 0x2716: M('xmark', 'error', 'x'), 0x274E: M('x-circle', 'error', 'x'),
    0x26A0: M('warning', 'warn', '!'), 0x26D4: M('nosign', 'error', ''), 0x1F6AB: M('nosign', 'error', ''), 0x1F6A7: M('warning', 'warn', '!'),
    0x2139: M('info', 'info', 'i'), 0x1F4A1: M('lightbulb', 'info', ''), 0x2753: M('question', 'warn', '?'), 0x2754: M('question', '', '?'), 0x2757: M('exclaim-double', 'warn', '!'),
    0x23F3: M('hourglass', 'pending', ''), 0x231B: M('hourglass', 'pending', ''), 0x23F1: M('timer', '', ''), 0x1F550: M('clock', '', ''), 0x1F570: M('clock', '', ''), 0x25F7: M('clock', '', ''), 0x23F0: M('alarm', '', ''),
    0x1F504: M('refresh', 'pending', ''), 0x21BB: M('refresh', '', ''), 0x267B: M('refresh', '', ''), 0x1F500: M('swap', '', ''), 0x1F300: M('sparkles', '', ''),
    0x21A9: M('undo', '', ''), 0x21BA: M('undo', '', ''), 0x21A5: M('arrow-up', '', ''), 0x2191: M('arrow-up', '', ''), 0x2193: M('arrow-down', '', ''),
    0x2197: M('trend-up', '', ''), 0x2198: M('trend-down', '', ''), 0x1F4C8: M('trend-up', '', ''), 0x1F4C9: M('trend-down', '', ''),
    0x1F5D1: M('trash', '', ''), 0x1F9F9: M('trash', '', ''), 0x1F4DC: M('doc', '', ''), 0x1F4C4: M('doc', '', ''), 0x1F9FE: M('doc', '', ''), 0x1F4D1: M('doc', '', ''),
    0x1F9E0: M('brain', '', ''), 0x1F50D: M('search', '', ''), 0x1F50E: M('search', '', ''),
    0x1F512: M('lock', '', ''), 0x1F513: M('unlock', '', ''), 0x1F4CC: M('pin', '', ''), 0x1F4CD: M('pin', '', ''),
    0x1F4E6: M('box', '', ''), 0x1F69A: M('box', '', ''), 0x1F9EA: M('flask', '', ''), 0x2699: M('gear', '', ''), 0x1F4BE: M('save', '', ''),
    0x1F4D6: M('book', '', ''), 0x1F4DA: M('book', '', ''), 0x1F4D4: M('book-closed', '', ''), 0x1F4D2: M('book-closed', '', ''), 0x1F4D3: M('book-closed', '', ''),
    0x1F4DD: M('compose', '', ''), 0x270F: M('pencil', '', ''), 0x270E: M('pencil', '', ''), 0x270D: M('pencil', '', ''),
    0x1F527: M('wrench', '', ''), 0x1FA79: M('wrench', '', ''), 0x1F441: M('eye', '', ''), 0x1F4C5: M('calendar', '', ''),
    0x1F9EC: M('flow', '', ''), 0x1F9F6: M('flow', '', ''), 0x1F517: M('link', '', ''), 0x1F9F2: M('link', '', ''),
    0x1F392: M('bag', '', ''), 0x1F507: M('bell-slash', '', ''), 0x1F6E1: M('shield', '', ''),
    0x1F3AC: M('film', '', ''), 0x1F4CA: M('chart', '', ''), 0x1F91D: M('people', '', ''), 0x1F465: M('people', '', ''),
    0x1F464: M('person', '', ''), 0x1F9CD: M('person', '', ''), 0x1F575: M('person', '', ''), 0x1F3AD: M('person-circle', '', ''),
    0x1F9E9: M('puzzle', '', ''), 0x1FAA6: M('archive', '', ''), 0x1F3DB: M('archive', '', ''), 0x1F3FA: M('archive', '', ''), 0x1F5C4: M('archive', '', ''),
    0x2316: M('scope', '', ''), 0x1F3AF: M('scope', '', ''), 0x1F578: M('graph', '', ''),
    0x1F4E5: M('download', '', ''), 0x1F4E4: M('upload', '', ''), 0x1F4EB: M('mail', '', ''),
    0x2B50: M('star', '', ''), 0x2605: M('star', '', ''), 0x2606: M('star', '', ''),
    0x1F539: M('chevron-right-small', '', '-'), 0x25B8: M('chevron-right-small', '', '>'), 0x25B6: M('chevron-right-small', '', '>'), 0x25BE: M('chevron-down', '', 'v'), 0x25BC: M('chevron-down', '', 'v'),
    0x1F5FA: M('map', '', ''), 0x1F516: M('bookmark', '', ''), 0x1F3F7: M('tag', '', ''),
    0x1F4E1: M('antenna', '', ''), 0x1F5E3: M('chat', '', ''), 0x1F4AC: M('message', '', ''),
    0x25C8: M('info', '', '*'), 0x2B21: M('stack', '', ''), 0x1F9F1: M('stack', '', ''), 0x2694: M('bolt', '', ''), 0x26A1: M('bolt', '', ''),
    0x23F8: M('pause', '', ''), 0x1F56F: M('sparkles', '', ''), 0x1F4B0: M('wallet', '', ''),
    0x1F494: M('heart', '', ''), 0x1F493: M('heart-pulse', '', ''), 0x1F497: M('heart', '', ''), 0x1F49E: M('heart', '', ''), 0x2764: M('heart', '', ''),
    0x1F195: M('sparkles', 'info', 'NEW'), 0x1F30C: M('globe', '', ''), 0x1F30D: M('globe', '', ''), 0x2696: M('gauge', '', ''), 0x1F321: M('gauge', '', ''),
    0x1F3AE: M('gamecontroller', '', ''), 0x265F: M('gamecontroller', '', ''), 0x1F54A: M('feather', '', ''), 0x1F9ED: M('compass', '', ''),
    0x1F331: M('flower', '', ''), 0x1F332: M('flower', '', ''), 0x1F0CF: M('cards', '', ''),
    0x1F534: M('dot', 'error', ''), 0x1F7E1: M('dot', 'warn', ''), 0x1F7E2: M('dot', 'success', ''), 0x1F535: M('dot', 'info', ''),
    0x1FA9E: M('copy', '', ''), 0x1F680: M('play', '', ''), 0x1FA7A: M('heart-pulse', '', ''), 0x1F4F1: M('phone', '', ''),
    0x1F3BC: M('music', '', ''), 0x1F489: M('inbox', '', ''), 0x1F6A9: M('flag', '', ''), 0x2691: M('flag', '', ''),
    0x1F451: M('trophy', '', ''), 0x1F634: M('moon', '', ''), 0x2702: M('scissors', '', ''), 0x25D0: M('circle-half', 'warn', ''), 0x1F9EE: M('table', '', ''),
    0x1F308: M('sparkles', '', ''), 0x2728: M('sparkles', '', ''), 0x1F525: M('bolt', '', ''),
};
const FALLBACK = M('dot', '', '');
const TONE_KIND = { success: 'success', warn: 'warn', error: 'error', info: 'info', pending: 'pending' };
const specOf = (cluster) => {
    const c = cp(cluster);
    if (FLOW[c]) return { flow: FLOW[c] };
    if (MAP[c]) return MAP[c];
    if (c === 0xFE0F || c === 0xFE0E || c === 0x200D || c === 0x20E3 || (c >= 0x1F3FB && c <= 0x1F3FF)) return { strip: true };
    return Object.assign({ unmapped: true }, FALLBACK);
};
/* 码点 -> JS 转义（功能性字面量用：值不变，源码零 emoji） */
const escCluster = (s) => {
    let out = '';
    for (const ch of s) {
        const c = cp(ch);
        if (c > 0xFFFF) { const h = Math.floor((c - 0x10000) / 0x400) + 0xD800, l = ((c - 0x10000) % 0x400) + 0xDC00; out += '\\u' + hex(h) + '\\u' + hex(l); }
        else out += '\\u' + hex(c);
    }
    return out;
};

/* ---------------- 词法（够用的 JS 词法器：注释 / 字符串 / 模板（含嵌套 ${}）/ 正则 / 其他） ---------------- */
const KW_BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
function lex(src) {
    const toks = []; const n = src.length; let i = 0; const stack = []; let depth = 0; let last = null; let gid = 0;
    const isId = (ch) => /[A-Za-z0-9_$]/.test(ch) || ch.charCodeAt(0) > 127;
    const scanTpl = (start, g) => {
        let j = start + 1;
        while (j < n) {
            const ch = src[j];
            if (ch === '\\') { j += 2; continue; }
            if (ch === '`') { toks.push({ k: 'tpl', s: start, e: j + 1, g, open: false }); last = { k: 'str' }; return j + 1; }
            if (ch === '$' && src[j + 1] === '{') { toks.push({ k: 'tpl', s: start, e: j + 2, g, open: true }); stack.push({ depth, g }); depth = 0; last = { k: 'p', t: '{' }; return j + 2; }
            j++;
        }
        toks.push({ k: 'tpl', s: start, e: n, g, open: false }); return n;
    };
    while (i < n) {
        const ch = src[i];
        if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') { i++; continue; }
        if (ch === '/' && src[i + 1] === '/') { let j = src.indexOf('\n', i); if (j < 0) j = n; toks.push({ k: 'com', s: i, e: j }); i = j; continue; }
        if (ch === '/' && src[i + 1] === '*') { let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; toks.push({ k: 'com', s: i, e: j }); i = j; continue; }
        if (ch === '\'' || ch === '"') {
            let j = i + 1;
            while (j < n && src[j] !== ch) { if (src[j] === '\\') j += 2; else if (src[j] === '\n') break; else j++; }
            toks.push({ k: 'str', s: i, e: j + 1, q: ch }); i = j + 1; last = { k: 'str' }; continue;
        }
        if (ch === '`') { i = scanTpl(i, ++gid); continue; }
        if (ch === '}' && stack.length && depth === 0) { const top = stack.pop(); depth = top.depth; i = scanTpl(i, top.g); continue; }
        if (ch === '/') {
            const ok = !last || (last.k === 'p' && !')]}'.includes(last.t)) || (last.k === 'id' && KW_BEFORE_REGEX.has(last.t));
            if (ok) {
                let j = i + 1; let cls = false;
                while (j < n) { const c = src[j]; if (c === '\\') { j += 2; continue; } if (c === '\n') break; if (c === '[') cls = true; else if (c === ']') cls = false; else if (c === '/' && !cls) break; j++; }
                j++; while (j < n && /[a-z]/i.test(src[j])) j++;
                toks.push({ k: 're', s: i, e: j }); i = j; last = { k: 'str' }; continue;
            }
        }
        if (isId(ch)) { let j = i; while (j < n && isId(src[j]) && src[j] !== '\u00A0' && src[j] !== '\u3000') j++; if (j === i) j = i + 1; toks.push({ k: 'id', s: i, e: j }); last = { k: 'id', t: src.slice(i, j) }; i = j; continue; }
        if (ch === '{') depth++; else if (ch === '}') depth--;
        /* 多字符运算符合并成一个 punc，=== 之类的比较判定要用 */
        const three = src.substr(i, 3), two = src.substr(i, 2);
        const op = (three === '===' || three === '!==') ? three : ((['==', '!=', '=>', '&&', '||', '??', '+=', '?.'].includes(two)) ? two : ch);
        toks.push({ k: 'p', s: i, e: i + op.length, t: op }); last = { k: 'p', t: op }; i += op.length;
    }
    return toks;
}

/* ---------------- 上下文判定 ---------------- */
const FUNCTIONAL_CALLS = new Set(['replace', 'replaceAll', 'includes', 'startsWith', 'endsWith', 'indexOf', 'lastIndexOf', 'split', 'match', 'matchAll', 'test', 'search', 'has', 'get', 'delete']);
const TEXT_CALLS = new Set(['toast', 'lsToast', '_memToast', 'confirm', 'prompt', 'alert', 'esc', 'esc2', 'escAttr', 'escapeHtml', 'String', 'join', 'setAttribute', 'createTextNode', 'log', 'warn', 'error', 'info', 'debug', 'reportError', 'reportUiError']);
/* 参数会被原样拼进 innerHTML 的本仓辅助函数（settings-ui.js 的 face / faceX 标题、xbtn 按钮文字） */
const HTML_CALLS = new Set(['face', 'faceX', 'xbtn']);
const HTML_TAG = /<\/?[a-zA-Z][\w-]*[\s>/]|<br\s*\/?>/;
function analyze(src, toks) {
    const T = (k) => toks[k] ? src.slice(toks[k].s, toks[k].e) : '';
    const groups = new Map();   // 模板组 id -> 是否含标签
    const gStart = new Map(), gEnd = new Map();   // 模板组 id -> 首 / 末分片的 token 下标
    toks.forEach((t, i) => { if (t.k === 'tpl') { if (!gStart.has(t.g)) gStart.set(t.g, i); gEnd.set(t.g, i); } });
    toks.forEach((t) => { if (t.k === 'tpl') groups.set(t.g, (groups.get(t.g) || false) || HTML_TAG.test(src.slice(t.s, t.e))); });
    const prevSig = (k) => { let j = k - 1; while (j >= 0 && toks[j].k === 'com') j--; return j; };
    const nextSig = (k) => { let j = k + 1; while (j < toks.length && toks[j].k === 'com') j++; return j; };
    /** 由内向外找最近的未闭合括号 / 模板占位，返回 { kind, name, at } */
    function enclosing(k) {
        let depth = 0;
        for (let j = k - 1; j >= 0 && k - j < 4000; j--) {
            const t = toks[j];
            if (t.k === 'tpl') {
                if (gEnd.get(t.g) > k) { if (t.open && depth === 0) return { kind: 'tpl', g: t.g, at: j }; continue; }
                j = gStart.get(t.g); continue;                   // 整个模板在 k 之前：当作一个原子跳过
            }
            if (t.k !== 'p') continue;
            const x = t.t;
            if (x === ')' || x === ']' || x === '}') depth++;
            else if (x === '(' || x === '[' || x === '{') {
                if (depth > 0) { depth--; continue; }
                if (x === '(') {
                    const p = prevSig(j);
                    if (p >= 0 && toks[p].k === 'id') { const nm = T(p); if (['if', 'while', 'for', 'switch', 'return', 'typeof'].includes(nm)) return { kind: 'group', at: j }; return { kind: 'call', name: nm, at: j }; }
                    return { kind: 'group', at: j };
                }
                return { kind: x === '{' ? 'obj' : 'arr', at: j };
            } else if (depth === 0 && (x === ';')) return { kind: 'stmt', at: j };
        }
        return { kind: 'top', at: -1 };
    }
    /** 同一表达式（同层，逗号 / 分号 / 括号为界）里有没有带标签的字面量 */
    function siblingHtml(k) {
        const isB = (t) => t.k === 'p' && (t.t === ';' || t.t === ',');
        let depth = 0, a = k - 1;
        for (; a >= 0; a--) {
            const t = toks[a];
            if (t.k === 'tpl') { if (gEnd.get(t.g) > k) break; a = gStart.get(t.g); continue; }
            if (t.k !== 'p') continue;
            if (')]}'.includes(t.t)) depth++; else if ('([{'.includes(t.t)) { if (depth === 0) break; depth--; } else if (depth === 0 && isB(t)) break;
        }
        depth = 0; let b = k + 1;
        for (; b < toks.length; b++) {
            const t = toks[b];
            if (t.k === 'tpl') { if (gStart.get(t.g) < k) break; b = gEnd.get(t.g); continue; }
            if (t.k !== 'p') continue;
            if ('([{'.includes(t.t)) depth++; else if (')]}'.includes(t.t)) { if (depth === 0) break; depth--; } else if (depth === 0 && isB(t)) break;
        }
        for (let j = Math.max(0, a + 1); j < b; j++) { const t = toks[j]; if ((t.k === 'str' || t.k === 'tpl') && HTML_TAG.test(src.slice(t.s, t.e))) return true; }
        return false;
    }
    /** 一个字面量的改写模式：'html' | 'text' | 'functional' */
    function modeOf(k) {
        const t = toks[k];
        if (t.k === 're') return { mode: 'functional', why: 'regex' };
        const p = prevSig(k), q = nextSig(k);
        const pt = p >= 0 && toks[p].k === 'p' ? toks[p].t : '', qt = q < toks.length && toks[q].k === 'p' ? toks[q].t : '';
        if (['===', '!==', '==', '!='].includes(pt) || ['===', '!==', '==', '!='].includes(qt)) return { mode: 'functional', why: 'compare' };
        if (p >= 0 && toks[p].k === 'id' && T(p) === 'case') return { mode: 'functional', why: 'case' };
        let enc = enclosing(k);
        let hops = 0;
        while (enc.kind === 'group' && hops++ < 12) {           // 纯分组括号：继续向外
            if (siblingHtml(k)) return { mode: 'html', why: 'sibling-html' };
            enc = enclosing(enc.at);
        }
        if (enc.kind === 'call') {
            if (FUNCTIONAL_CALLS.has(enc.name)) {
                /* 只有「第一个参数」是匹配串：.replace(a, '替换成的文字') 的第二参数按文字处理 */
                let depth = 0, first = true;
                for (let j = enc.at + 1; j < k; j++) { const x = toks[j]; if (x.k !== 'p') continue; if ('([{'.includes(x.t)) depth++; else if (')]}'.includes(x.t)) depth--; else if (x.t === ',' && depth === 0) first = false; }
                if (first) return { mode: 'functional', why: '.' + enc.name + '()' };
                return { mode: 'text', why: '.' + enc.name + '() 替换值' };
            }
            if (TEXT_CALLS.has(enc.name)) return { mode: 'text', why: enc.name + '()', call: enc };
            if (HTML_CALLS.has(enc.name)) return { mode: 'html', why: enc.name + '() 标题 / 文字参数' };
        }
        /* textContent / title / placeholder 赋值 */
        if (pt === '=' || pt === '+=') { const pp = prevSig(p); const nm = pp >= 0 ? T(pp) : ''; if (/^(textContent|innerText|title|placeholder|value|nodeValue|ariaLabel)$/.test(nm)) return { mode: 'text', why: nm + '=' }; }
        if (HTML_TAG.test(src.slice(t.s, t.e)) || (t.k === 'tpl' && groups.get(t.g))) return { mode: 'html', why: 'markup' };
        if (enc.kind === 'tpl' && groups.get(enc.g)) return { mode: 'html', why: 'html-template-slot' };
        if (siblingHtml(k)) return { mode: 'html', why: 'sibling-html' };
        return { mode: 'text', why: enc.kind === 'call' ? enc.name + '()' : enc.kind };
    }
    return { modeOf, enclosing, prevSig, nextSig, T };
}

/* ---------------- 字面量改写 ---------------- */
function icoTag(spec, q, extraCls) {
    const a = q === '"' ? '\'' : '"';
    return '<i class=' + a + 'ls-ico' + (extraCls ? ' ' + extraCls : '') + a + ' data-i=' + a + spec.i + a + (spec.tone ? ' data-tone=' + a + spec.tone + a : '') + ' aria-hidden=' + a + 'true' + a + '></i>';
}
function flowTag(f, q) {
    const a = q === '"' ? '\'' : '"';
    return '<i class=' + a + 'ls-ico ls-ico-inline' + a + ' data-i=' + a + f.i + a + ' role=' + a + 'img' + a + ' aria-label=' + a + f.label + a + '></i>';
}
/* 页签按钮的文字保持纯文字：图标由导航组件按 data-tab 统一加（dashboard-shell / dev-console），
 * 也保住 tests 里 data-tab="x">标签< 这类结构判据 */
const TAB_LABEL = /(?:role=["']tab["']|ls-tab-btn|data-tab=["'][\w-]+["'])[^<>]*>\s*$/;
/** 位置 pos 是否在标签内部 / <option> / <textarea> / <title> 里（这些地方不能放元素） */
function textOnlyAt(s, pos) {
    const lt = s.lastIndexOf('<', pos), gt = s.lastIndexOf('>', pos);
    if (lt > gt) return true;
    const low = s.slice(0, pos).toLowerCase();
    for (const tag of ['option', 'textarea', 'title']) { if (low.lastIndexOf('<' + tag) > low.lastIndexOf('</' + tag)) return true; }
    return false;
}
/**
 * 改写一段文本。opts: { mode, q, arrows, ctxText }
 *   ctxText：HTML 模式下判断「是否在标签里」用的前文（模板前面的分片）
 * 返回 { out, lead, n, unmapped[] }；lead = 前导簇的映射（toast 用来生成 kind）
 */
function rewrite(text, opts) {
    const o = opts || {};
    const re = reCluster();
    let out = '', last = 0, n = 0, lead = null; const unmapped = [];
    let m;
    while ((m = re.exec(text))) {
        const cl = m[0], at = m.index;
        const spec = specOf(cl);
        if (spec.flow && !o.arrows) continue;                           // 不处理箭头时原样保留
        n++;
        let rep = '';
        let eatAfter = false, eatBefore = false;
        const isLead = !o.noLead && text.slice(o.delim || 0, at).replace(reCluster(), '').trim() === '';
        if (spec.unmapped) unmapped.push('U+' + hex(cp(cl)));
        if (o.mode === 'functional') rep = escCluster(cl);
        else if (o.mode === 'comment') {
            if (spec.flow) rep = spec.flow.a;
            else if (spec.strip) rep = '';
            else { rep = spec.c || ''; if (!rep) eatAfter = true; }
        } else if (spec.strip) rep = '';
        else if (o.mode === 'html' && !textOnlyAt((o.ctxText || '') + text, (o.ctxText || '').length + at) && !TAB_LABEL.test(((o.ctxText || '') + text.slice(0, at)).slice(-300))) {
            /* 紧跟在开始标签后面的箭头是「图标位」（如返回按钮）：用普通图标，不用行内小箭头 */
            if (spec.flow && /<[a-zA-Z][^<>]*>\s*$/.test(((o.ctxText || '') + text.slice(0, at)).slice(-200))) { rep = icoTag({ i: spec.flow.i, tone: '' }, o.q); eatAfter = true; }
            else if (spec.flow) { rep = flowTag(spec.flow, o.q); eatAfter = true; eatBefore = true; }
            else { rep = icoTag(spec, o.q); eatAfter = true; }
        } else {                                                         // 文字模式
            if (spec.flow && isLead) { rep = ''; eatAfter = true; }      // 前导箭头（「<- 返回」）直接去掉
            else if (spec.flow) rep = spec.flow.a;
            else { rep = ''; eatAfter = true; }
        }
        if (isLead && lead === null && !spec.flow && !spec.strip) lead = spec;
        let seg = text.slice(last, at);
        if (eatBefore && / $/.test(seg)) seg = seg.slice(0, -1);
        out += seg + rep;
        last = at + cl.length;
        if (eatAfter) {
            /* 吃掉簇后紧跟的一个空格（全角空格也算）；行首图标后紧跟变体选择符已由簇吞掉 */
            if (text[last] === ' ' || text[last] === '\u3000') last++;
            else if (rep === '' && out.endsWith(' ') && /^[\s)\]}>，。、：；]/.test(text.slice(last))) out = out.slice(0, -1);
        }
    }
    out += text.slice(last);
    return { out, lead, n, unmapped };
}

/* ---------------- 锚点改写：toast() / _memToast() 定义升级 ---------------- */
const SPECIAL_REWRITES = [
    {
        file: 'settings-ui.js', id: 'toast-def',
        find: [
            '        const toast = (msg) => {',
            '            const t = document.createElement(\'div\');',
            '            t.className = \'ls-toast\';',
            '            t.textContent = msg;',
        ].join('\n'),
        replace: [
            '        const toast = (msg, kind) => {   /* v3.1：第二参 kind = success | warn | error | info | pending 或任一图标名（css/ls-icons.css），前导状态图标不再用 emoji */',
            '            const t = document.createElement(\'div\'); const _ti = kind ? ({ success: \'check-circle\', warn: \'warning\', error: \'x-circle\', info: \'info\', pending: \'hourglass\' }[kind] || String(kind)) : \'\';',
            '            t.className = \'ls-toast\';',
            '            if (_ti) { t.setAttribute(\'data-kind\', String(kind)); t.innerHTML = \'<i class="ls-ico" data-i="\' + _ti.replace(/[^a-z0-9-]/g, \'\') + \'" aria-hidden="true"></i>\' + String(msg).replace(/&/g, \'&amp;\').replace(/</g, \'&lt;\'); } else t.textContent = msg;',
        ].join('\n'),
        after: { find: '            setTimeout(() => t.remove(), 1800);\n        };\n\n        // ========== 状态总览 ==========', replace: '            setTimeout(() => t.remove(), 1800);\n        }; const lsToast = (kind, msg) => toast(msg, kind); plugin.lsToast = lsToast;   /* lsToast(kind, msg)：与 toast(msg, kind) 等价的具名入口 */\n\n        // ========== 状态总览 ==========' },
    },
    {
        file: 'settings-ui.js', id: 'memtoast-def',
        find: '            t.style.background = ok ? "var(--ls-success,#3fb950)" : "var(--ls-danger,#f85149)";\n            t.textContent = msg;',
        replace: '            t.style.background = ok ? "var(--ls-success,#3fb950)" : "var(--ls-danger,#f85149)";\n            t.setAttribute("data-kind", ok ? "success" : "error"); t.innerHTML = \'<i class="ls-ico" data-i="\' + (ok ? "check-circle" : "warning") + \'" aria-hidden="true"></i>\' + String(msg).replace(/&/g, "&amp;").replace(/</g, "&lt;");   /* v3.1：前导图标随 ok 走，消息里不再带 emoji */',
    },
    {
        /* 挂载日志：原文用两个 emoji 指路（记忆按钮 -> 设置），删掉后只剩「点击-> 设置」，这里改成能读懂的文字 */
        file: 'settings-ui.js', id: 'mount-log',
        find: '        console.log(\'[LonSha记忆引擎] \u2713 设置面板模块已挂载 (点击\u{1F9E0} \u2192 \u2699\uFE0F设置)\');',
        replace: "        console.log('[LonSha记忆引擎] 设置面板模块已挂载（点悬浮记忆按钮，再选「设置」）');",
    },
];
function applySpecial(file, src, report) {
    let out = src;
    for (const r of SPECIAL_REWRITES) {
        if (r.file !== file) continue;
        const hits = out.split(r.find).length - 1;
        if (hits !== 1) { report.anchors.push({ id: r.id, status: 'anchor-miss', hits }); continue; }
        out = out.replace(r.find, () => r.replace);
        if (r.after) {
            const h2 = out.split(r.after.find).length - 1;
            if (h2 === 1) out = out.replace(r.after.find, () => r.after.replace);
            else report.anchors.push({ id: r.id + '.after', status: 'anchor-miss', hits: h2 });
        }
        report.anchors.push({ id: r.id, status: 'ok' });
    }
    return out;
}

/* ---------------- toast kind 表达式 ---------------- */
const SIMPLE_COND = /^!?\s*\(?\s*[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*|\[\d+\])*(?:\s*(?:&&|\|\|)\s*!?[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*)*\s*\)?$/;
function kindExpr(src, toks, a, b, leadOf) {
    /* [a, b) 为 token 下标区间；找顶层 ? : */
    let depth = 0, qAt = -1, cAt = -1, nested = 0;
    for (let j = a; j < b; j++) {
        const t = toks[j]; if (t.k === 'tpl') { depth += (t.open ? 1 : 0) - (src[t.s] === '}' ? 1 : 0); continue; }
        if (t.k !== 'p') continue;
        if ('([{'.includes(t.t)) depth++; else if (')]}'.includes(t.t)) depth--;
        else if (depth === 0 && t.t === '?') { if (qAt < 0) qAt = j; else nested++; }
        else if (depth === 0 && t.t === ':' && qAt >= 0) { if (nested > 0) nested--; else { cAt = j; break; } }
    }
    if (qAt >= 0 && cAt > qAt) {
        const cond = src.slice(toks[a].s, toks[qAt - 1].e).trim();
        if (!SIMPLE_COND.test(cond)) return { expr: null, why: 'complex-condition' };
        const A = kindExpr(src, toks, qAt + 1, cAt, leadOf), B = kindExpr(src, toks, cAt + 1, b, leadOf);
        if (A.expr === null || B.expr === null) return { expr: null, why: A.why || B.why };
        if (A.expr === B.expr) return A;
        return { expr: '(' + cond + ' ? ' + A.expr + ' : ' + B.expr + ')', leaves: (A.leaves || []).concat(B.leaves || []) };
    }
    /* 整段被括号包住：拆一层 */
    if (toks[a] && toks[a].k === 'p' && toks[a].t === '(' && toks[b - 1] && toks[b - 1].k === 'p' && toks[b - 1].t === ')') {
        let d = 0, whole = true; for (let j = a; j < b; j++) { const t = toks[j]; if (t.k !== 'p') continue; if (t.t === '(') d++; else if (t.t === ')') { d--; if (d === 0 && j < b - 1) { whole = false; break; } } }
        if (whole) return kindExpr(src, toks, a + 1, b - 1, leadOf);
    }
    const first = toks[a];
    const sp = first && (first.k === 'str' || first.k === 'tpl') ? leadOf.get(a) : null;
    const kind = sp ? (TONE_KIND[sp.tone] || sp.i) : '';
    return { expr: '\'' + kind + '\'', leaves: [kind] };
}

/* ---------------- 单文件改写 ---------------- */
const UI_FILES = ['settings-ui.js', 'memory-center.js', 'memory-views.js', 'memory-checkup-page.js', 'memory-health-board.js', 'memory-visual-panel.js',
    'injection-panel.js', 'modules_combined.js', 'ui-telemetry-metrics-visualizer.js', 'css/style.css', 'css/visualizer.css', 'css/lonsha-design.css'];
const FULL_FILES = new Set(['settings-ui.js']);   // 注释也清
/* 字符串里的流程箭头也换掉的文件（UI 层全部）；其余文件只在 --arrows 时处理 */
const ARROW_FILES = new Set(UI_FILES);
const TOAST_CALLS = new Set(['toast', 'lsToast']);
function countGlyphs(s) {
    const e = (s.match(EMOJI_RE) || []).length;
    const g = (s.match(GLYPH_RE) || []).filter((ch) => !new RegExp(EMOJI_SRC, 'u').test(ch)).length;
    return { emoji: e, glyph: g, total: e + g };
}
function transformFile(file, src, options) {
    const opt = options || {};
    const full = FULL_FILES.has(file) || !!opt.comments;
    const arrows = full || ARROW_FILES.has(file) || !!opt.arrows;
    const report = { file, before: countGlyphs(src), after: null, edits: 0, byMode: {}, toast: [], toastSkipped: [], functional: [], unmapped: {}, anchors: [], samples: [] };
    if (/\.css$/.test(file)) {
        /* CSS：只有注释与 content: 字符串里可能出现，统一按注释规则处理 */
        let out = src.replace(reCluster(), (cl) => { const sp = specOf(cl); report.edits++; return sp.flow ? sp.flow.a : (sp.c || ''); });
        report.after = countGlyphs(out); report.byMode.css = report.edits; return { out, report };
    }
    const base = applySpecial(file, src, report);
    const toks = lex(base);
    const A = analyze(base, toks);
    const edits = [];                       // { s, e, text }
    const leadOf = new Map();               // token 下标 -> 前导簇映射
    const tplCtx = new Map();               // 模板组 -> 已拼接的前文（判断是否在标签内）
    toks.forEach((t, k) => {
        const raw = base.slice(t.s, t.e);
        if (t.k === 'tpl') { const prev = tplCtx.get(t.g) || ''; tplCtx.set(t.g, prev + raw); }
        if (!reCluster().test(raw)) return;
        if (t.k === 'com') {
            if (!full) return;
            const r = rewrite(raw, { mode: 'comment', arrows: true });
            if (r.n) { edits.push({ s: t.s, e: t.e, text: r.out }); report.byMode.comment = (report.byMode.comment || 0) + r.n; }
            return;
        }
        if (t.k === 'id' || t.k === 'p') return;
        const md = A.modeOf(k);
        const q = t.k === 'str' ? t.q : '`';
        const ctxText = t.k === 'tpl' ? (tplCtx.get(t.g) || '').slice(0, -raw.length) : '';
        const r = rewrite(raw, { mode: md.mode, q, arrows, ctxText, delim: 1, noLead: t.k === 'tpl' && raw[0] === '}' });
        if (!r.n) return;
        r.unmapped.forEach((u) => { report.unmapped[u] = (report.unmapped[u] || 0) + 1; });
        if (r.lead) leadOf.set(k, r.lead);
        /* 前导 emoji 删掉后只剩空串、且紧跟 + ：连同 + 一起去掉（'<警告符> ' + human -> human），避免留下 '' + x 这种噪音 */
        const nq = A.nextSig(k), pq = A.prevSig(k);
        if (t.k === 'str' && r.out === q + q && nq < toks.length && toks[nq].k === 'p' && toks[nq].t === '+' && pq >= 0 && toks[pq].k === 'p' && ['(', ',', '?', ':', '='].includes(toks[pq].t)) {
            let e2 = toks[nq].e; while (base[e2] === ' ') e2++;
            edits.push({ s: t.s, e: e2, text: '' });
        } else edits.push({ s: t.s, e: t.e, text: r.out });
        report.byMode[md.mode] = (report.byMode[md.mode] || 0) + r.n;
        if (md.mode === 'functional') report.functional.push({ line: base.slice(0, t.s).split('\n').length, why: md.why, before: raw.slice(0, 80) });
        if (report.samples.length < 400) report.samples.push({ line: base.slice(0, t.s).split('\n').length, mode: md.mode, why: md.why, before: raw.slice(0, 120), after: r.out.slice(0, 200) });
    });
    /* toast(...)：根据前导簇生成 kind 参数 */
    const doneCalls = new Set();
    leadOf.forEach((spec, k) => {
        const enc = (function find() { let e = A.enclosing(k); let hops = 0; while (e.kind === 'group' && hops++ < 12) e = A.enclosing(e.at); return e; })();
        if (enc.kind !== 'call' || !TOAST_CALLS.has(enc.name) || doneCalls.has(enc.at)) return;
        doneCalls.add(enc.at);
        /* 实参区间与顶层逗号 */
        let depth = 0, close = -1, commas = 0;
        for (let j = enc.at; j < toks.length; j++) { const t = toks[j]; if (t.k === 'tpl') { depth += (t.open ? 1 : 0) - (base[t.s] === '}' ? 1 : 0); continue; } if (t.k !== 'p') continue; if ('([{'.includes(t.t)) depth++; else if (')]}'.includes(t.t)) { depth--; if (depth === 0) { close = j; break; } } else if (t.t === ',' && depth === 1) commas++; }
        const line = base.slice(0, toks[enc.at].s).split('\n').length;
        if (close < 0 || commas > 0) { report.toastSkipped.push({ line, why: commas ? 'already-has-kind-or-multi-arg' : 'unbalanced' }); return; }
        const ke = kindExpr(base, toks, enc.at + 1, close, leadOf);
        if (ke.expr === null) { report.toastSkipped.push({ line, why: ke.why }); return; }
        if ((ke.leaves || []).every((x) => x === '')) return;
        edits.push({ s: toks[close].s, e: toks[close].s, text: ', ' + ke.expr });
        report.toast.push({ line, kind: ke.expr });
    });
    edits.sort((x, y) => y.s - x.s || y.e - x.e);
    let out = base;
    for (const ed of edits) out = out.slice(0, ed.s) + ed.text + out.slice(ed.e);
    report.edits = edits.length;
    report.after = countGlyphs(out);
    if (out.split('\n').length !== src.split('\n').length) report.lineDelta = out.split('\n').length - src.split('\n').length;
    return { out, report };
}

/* ---------------- 测试影响：哪些断言字面量会因改写而失配 ---------------- */
function testImpact(testFiles, changed, options) {
    /* testFiles: [{ path, text }]; changed: Map(file -> { before, after }) */
    const fix = !!(options && options.fix);
    const res = []; const fixedFiles = new Map();
    const unesc = (s) => s.replace(/\\(['"`\\])/g, '$1');
    for (const tf of testFiles) {
        const isJs = /\.(m?js|cjs)$/.test(tf.path);
        let text = tf.text; const edits = [];
        const lits = [];
        if (isJs) {
            const tk = lex(text);
            tk.forEach((t) => {
                if (t.k === 'str') lits.push({ s: t.s + 1, e: t.e - 1, kind: 'str', q: t.q });
                else if (t.k === 'tpl') { const a = t.s + 1, b = t.open ? t.e - 2 : t.e - 1; if (b - a >= 6) lits.push({ s: a, e: b, kind: 'tpl', q: '`' }); }
                else if (t.k === 're') lits.push({ s: t.s, e: t.e, kind: 're' });
            });
        } else {
            let at = 0; for (const ln of text.split('\n')) { const m = /"((?:[^"\\]|\\.){6,})"/g; let x; while ((x = m.exec(ln))) lits.push({ s: at + x.index + 1, e: at + x.index + 1 + x[1].length, kind: 'json' }); at += ln.length + 1; }
        }
        for (const L of lits) {
            const raw = text.slice(L.s, L.e);
            if (L.kind === 're') {
                const mm = /^\/((?:\\.|\[(?:\\.|[^\]])*\]|[^/\\\n])+)\/([a-z]*)$/.exec(raw); if (!mm) continue;
                let re; try { re = new RegExp(mm[1], mm[2].replace('g', '')); } catch (_e) { continue; }
                for (const [file, v] of changed) {
                    if (re.test(v.before) && !re.test(v.after)) {
                        let fixed = null;
                        if (fix && reCluster().test(mm[1])) { const r = rewrite(mm[1], { mode: 'text', arrows: true }); try { const re2 = new RegExp(r.out, mm[2].replace('g', '')); if (re2.test(v.after)) fixed = '/' + r.out + '/' + mm[2]; } catch (_e) { /* 改写后不是合法正则 */ } }
                        res.push({ test: tf.path, line: text.slice(0, L.s).split('\n').length, target: file, kind: 'regex', literal: raw.slice(0, 160), fix: fixed ? 'auto' : 'manual', fixed });
                        if (fixed) edits.push({ s: L.s, e: L.e, text: fixed });
                    }
                }
                continue;
            }
            const val = L.kind === 'str' ? unesc(raw) : raw;
            if (val.length < 6) {
                /* 短字面量（如 '\u2705'）：只在含被检码点时报「待人工确认」，并给出 includes 的接收者，便于判断它查的是不是本次改写的文件 */
                if (val.length >= 1 && reCluster().test(val)) {
                    for (const [file, v] of changed) {
                        if (!v.before.includes(val) || v.after.includes(val)) continue;
                        const pre = text.slice(Math.max(0, L.s - 40), L.s - 1);
                        const mm = /([A-Za-z_$][\w$.]*)\s*\.\s*(includes|indexOf|startsWith|endsWith|split)\s*\(\s*$/.exec(pre);
                        if (!mm) continue;
                        res.push({ test: tf.path, line: text.slice(0, L.s).split('\n').length, target: file, kind: 'short', literal: val, receiver: mm[1], fix: 'review', fixed: null });
                    }
                }
                continue;
            }
            /* 模板字面量只取静态最长段 */
            const probe = L.kind === 'tpl' ? val.split(/\$\{[^}]*\}/).sort((a, b) => b.length - a.length)[0] : val;
            if (!probe || probe.length < 6) continue;
            for (const [file, v] of changed) {
                if (!v.before.includes(probe) || v.after.includes(probe)) continue;
                /* 同一串也出现在**没改写**的运行时文件里（比如上游生产方）：断言查的可能是那边，不自动改 */
                if (options && options.others && options.others.includes(probe)) {
                    res.push({ test: tf.path, line: text.slice(0, L.s).split('\n').length, target: file, kind: L.kind, literal: probe.slice(0, 160), fix: 'review', fixed: null, note: 'also-in-unchanged-runtime' });
                    break;
                }
                let fixed = null;
                if (fix && L.kind === 'str' && reCluster().test(val)) {
                    for (const mode of ['text', 'html']) {
                        const r = rewrite(val, { mode, q: L.q, arrows: true });
                        if (r.out !== val && v.after.includes(r.out)) { fixed = r.out; break; }
                    }
                }
                res.push({ test: tf.path, line: text.slice(0, L.s).split('\n').length, target: file, kind: L.kind, literal: probe.slice(0, 160), fix: fixed !== null ? 'auto' : 'manual', fixed: fixed !== null ? fixed.slice(0, 200) : null });
                if (fixed !== null) edits.push({ s: L.s, e: L.e, text: fixed.replace(new RegExp('\\\\?' + (L.q === '"' ? '"' : '\''), 'g'), (m0) => (m0.length === 1 ? '\\' + m0 : m0)) });
                break;
            }
        }
        if (fix && edits.length) { edits.sort((a, b) => b.s - a.s); for (const ed of edits) text = text.slice(0, ed.s) + ed.text + text.slice(ed.e); fixedFiles.set(tf.path, text); }
    }
    return { impacted: res, fixedFiles };
}
// </core>

/* ---------------- CLI ---------------- */
const SCAN_EXT = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.htm', '.md', '.json']);
const SKIP = new Set(['node_modules', '.git']);
function* walk(dir, base) {
    for (const name of fs.readdirSync(dir)) {
        if (SKIP.has(name)) continue;
        const p = path.join(dir, name); const st = fs.statSync(p);
        if (st.isDirectory()) yield* walk(p, base);
        else yield path.relative(base, p).split(path.sep).join('/');
    }
}
function main(argv) {
    const args = argv.slice(2);
    const has = (f) => args.includes(f);
    const val = (k) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
    const root = args.find((a) => !a.startsWith('--')) || '.';
    const all = [...walk(root, root)];
    if (has('--scan-only')) {
        const rows = all.filter((f) => SCAN_EXT.has(path.extname(f))).map((f) => ({ file: f, ...countGlyphs(fs.readFileSync(path.join(root, f), 'utf8')) })).filter((r) => r.total);
        rows.sort((a, b) => b.total - a.total);
        for (const r of rows) console.log(String(r.total).padStart(6) + '  emoji ' + String(r.emoji).padStart(4) + '  glyph ' + String(r.glyph).padStart(4) + '  ' + r.file);
        if (val('json')) fs.writeFileSync(val('json'), JSON.stringify(rows, null, 2));
        return 0;
    }
    let targets = UI_FILES.filter((f) => fs.existsSync(path.join(root, f)));
    if (val('scope') === 'all') targets = [...new Set(targets.concat(all.filter((f) => /^[^/]+\.js$/.test(f))))];
    const changed = new Map(); const reports = [];
    for (const f of targets) {
        const src = fs.readFileSync(path.join(root, f), 'utf8');
        const { out, report } = transformFile(f, src, { arrows: has('--arrows'), comments: has('--comments') });
        reports.push(report);
        if (out !== src) {
            changed.set(f, { before: src, after: out });
            if (has('--write')) fs.writeFileSync(path.join(root, f), out);
            else if (val('out')) { const p = path.join(val('out'), f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, out); }
        }
        console.log(f.padEnd(40) + ' ' + String(report.before.total).padStart(5) + ' -> ' + String(report.after.total).padStart(5) + '   toast kind ' + report.toast.length + '   functional ' + report.functional.length + (report.anchors.some((a) => a.status !== 'ok') ? '   [anchor-miss]' : '') + (report.lineDelta ? '   [line-delta ' + report.lineDelta + ']' : ''));
    }
    let impact = null;
    if (has('--tests') || has('--fix-tests')) {
        const tfs = all.filter((f) => f.startsWith('tests/') && /\.(m?js|cjs|json|tsv)$/.test(f)).map((f) => ({ path: f, text: fs.readFileSync(path.join(root, f), 'utf8') }));
        const others = all.filter((f) => /^[^/]+\.js$/.test(f) && !changed.has(f)).map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
        impact = testImpact(tfs, changed, { fix: has('--fix-tests'), others });
        console.log('tests: ' + impact.impacted.length + ' 处断言字面量会失配（自动可改 ' + impact.impacted.filter((x) => x.fix === 'auto').length + '）');
        for (const x of impact.impacted.slice(0, 300)) console.log('  ' + x.test + ':' + x.line + '  [' + x.fix + '] ' + x.literal);
        if (has('--fix-tests') && (has('--write') || val('out'))) for (const [p, t] of impact.fixedFiles) { const dst = has('--write') ? path.join(root, p) : path.join(val('out'), p); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, t); }
    }
    if (val('json')) fs.writeFileSync(val('json'), JSON.stringify({ reports, impact: impact && impact.impacted }, null, 2));
    return 0;
}
process.exit(main(process.argv));
