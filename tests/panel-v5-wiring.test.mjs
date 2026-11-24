/* ============================================================
 * tests/panel-v5-wiring.test.mjs — v5 视觉层「真的接上了」判据
 *
 * 【要证明的四件事】
 *   a) 层序：css/style.css 里 lonsha-panel-v5.css 的 @import 必须在所有面板层之后
 *      —— 特异性打平后，唯一裁决者是导入顺序；顺序错了就整层输。
 *   b) 落点：v5 每条规则的「最后一个复合选择器」必须能落到 DOM 源码里真实存在的类名上，
 *      否则该规则属于「预留 API」并在 RESERVED 表里逐条登记。
 *      这一条是本判据存在的全部理由 —— 上一版 v5 有 63 条规则、37 个 .lsm5-* 类名，
 *      而 DOM 里一个都没有（命中 0），全仓测试却全绿、零报错。
 *   c) 特异性：v5 每条规则必须以根作用域开头（:is(.ls-dash[data-ui-rev="5"], .lsm5)
 *      或 .lonsha-sheet:has(…)）。单类名规则 = (0,1,0)，输给旧层 (0,3,0)，
 *      写了等于没写，且不报错 —— 靠人眼看不出来，只能靠判据。
 *   d) 纪律：零颜色字面量 / 零 !important / 零 <11px 字号 / 零 backdrop-filter
 *      （直接复用 tools/design-debt-check.mjs 的 measure()，口径与总门禁同一套）。
 * 不审「长相」—— 长相归真机，本仓没有浏览器层。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure as measureIsolated } from '../tools/design-debt-check.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const RD = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');

const CSS_REL = 'css/lonsha-panel-v5.css';
const ROOT = ':is(.ls-dash[data-ui-rev="5"], .lsm5)';
/* 窗口件（sheet / header / close / body / dirtybar）都在 .ls-dash 之外 ——
   DOM 是 overlay > sheet > body > .ls-dash，用「dash 后代」永远够不到它们，
   上一版就是因此只改了页面内部、窗口本身仍是旧样式。
   只能从 overlay 侧用 :has() 锚定：
     overlay(0,1,0) + :has(...)(0,2,0) + 后代(0,1,0) = (0,4,0)，
   比注入样式 .lonsha-overlay .lonsha-sheet .ls-btn 的 (0,3,0) 还高一级。
   曾预想写成 .lonsha-sheet:has(...)（(0,3,0)，一次只能锚一个元素），
   实测 overlay 侧一次覆盖整层窗口件更省规则，故取此形态。 */
const HAS_ROOT = '.lonsha-overlay:has(';

/* 预留 API：本仓当前没有任何 DOM 产出点，规则先立住，等真接线时零改动生效。
   登记进来的类名从此不再要求「DOM 能证实」，但也因此必须逐条写在这里 ——
   想偷偷加一条永不生效的规则，就得先在这张表上留下指纹。 */
const RESERVED = new Set([
    'lsm5-select', 'lsm5-table', 'lsm5-card-bd', 'lsm5-edit',
    'lsm5-field', 'lsm5-field-row', 'lsm5-row-acts', 'lsm5-dot',
]);

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

/* 顶层逗号切分：:is(a, b) 内部的逗号不算 */
function splitTop(sel) {
    const out = [];
    let depth = 0, cur = '';
    for (const ch of sel) {
        if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') depth--;
        if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
        cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out.map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

function parseRules(css) {
    const raw = stripComments(css);
    const rules = [];
    for (const m of raw.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = m[1].trim().replace(/\s+/g, ' ');
        const body = m[2];
        if (!selector) continue;
        /* 令牌块：只声明 --v5-*，不产生样式，不参与落点审查 */
        if (/^\s*--v5-[a-z]/.test(body)) continue;
        rules.push({ selector, body });
    }
    return rules;
}

/* DOM 源码池：顶层脚本 + ui/ 目录。类名只可能出现在这些文件的字符串里 */
function domSource() {
    const parts = [];
    for (const f of fs.readdirSync(R)) {
        if (f.endsWith('.js')) parts.push(fs.readFileSync(path.join(R, f), 'utf8'));
    }
    const uiDir = path.join(R, 'ui');
    if (fs.existsSync(uiDir)) {
        for (const f of fs.readdirSync(uiDir)) {
            if (f.endsWith('.js')) parts.push(fs.readFileSync(path.join(uiDir, f), 'utf8'));
        }
    }
    return parts.join('\n');
}
const DOM = domSource();
const hasClass = (name) => new RegExp('(?<![\\w-])' + name + '(?![\\w-])').test(DOM);
const classesOf = (sel) => [...sel.matchAll(/(?<![\w-])\.([a-z][\w-]*)/gi)].map((m) => m[1]);

const RULES = parseRules(RD(CSS_REL));

test('V5-1 层序：v5 的 @import 在所有面板层之后（平局靠顺序裁决）', () => {
    const css = RD('css/style.css');
    const imports = [...css.matchAll(/@import\s+(?:url\()?["']?\.?\/?([\w-]+\.css)/g)].map((m) => m[1]);
    assert.ok(imports.includes('lonsha-panel-v5.css'), 'style.css 未导入 v5 层');
    const mine = imports.indexOf('lonsha-panel-v5.css');
    for (const older of ['dashboard.css', 'dashboard-v2.css', 'dashboard-v3.css', 'lonsha-settings.css']) {
        const i = imports.indexOf(older);
        if (i >= 0) assert.ok(mine > i, `v5 必须晚于 ${older} 导入（实际 ${mine} vs ${i}）`);
    }
    assert.equal(mine, imports.length - 1, 'v5 必须是最后一个 @import，实际后面还有：' + imports.slice(mine + 1).join(', '));
});

test('V5-2 落点：每条规则要么 DOM 可证，要么在 RESERVED 登记', () => {
    const orphan = [];
    for (const { selector } of RULES) {
        const cls = classesOf(selector);
        const old = cls.filter((c) => !c.startsWith('lsm5-'));
        const mine5 = cls.filter((c) => c.startsWith('lsm5-'));
        const provable = old.filter((c) => hasClass(c));
        const reserved = mine5.filter((c) => RESERVED.has(c));
        if (provable.length === 0 && reserved.length === 0) {
            orphan.push(selector + '  →  lsm5:[' + mine5.join(',') + '] 旧类:[' + old.join(',') + ']');
        }
    }
    assert.deepEqual(orphan, [], '以下规则没有任何能在 DOM 里证实的落点，也不在 RESERVED 里：\n' + orphan.join('\n'));
    assert.ok(RULES.length >= 40, '规则数异常偏少：' + RULES.length);
});

test('V5-3 特异性：每条规则都以根作用域开头（否则输给旧层且不报错）', () => {
    const bad = [];
    for (const { selector } of RULES) {
        for (const part of splitTop(selector)) {
            if (part.startsWith(ROOT) || part.startsWith(HAS_ROOT)) continue;
            bad.push(part);
        }
    }
    assert.deepEqual(bad, [], '以下选择器缺少根作用域前缀，特异性 (0,1,0) 必然输给旧层：\n' + bad.join('\n'));
});

test('V5-4 纪律：零字面量 / 零 !important / 零 <11px / 零毛玻璃', () => {
    /* 与 tools/design-debt-check.mjs 同口径（那边是 ESM 导出，直接 import 省得抄两份） */
    const m = measureIsolated(RD(CSS_REL));
    assert.deepEqual(m, { colors: 0, important: 0, inline: 0, tinyFont: 0, blur: 0 },
        'v5 层出现设计债，详见 tools/design-debt-check.mjs');
});

test('V5-4b 纪律补强：连关键字色名也不许出现（总门禁只数 hex/rgb，漏 color:red）', () => {
    const NAMED = /(?<![\w-])(?:red|blue|green|white|black|gray|grey|orange|purple|pink|yellow|cyan|lime|navy|teal|silver|maroon|olive|aqua|fuchsia|magenta)(?![\w-])/g;
    const hits = [];
    for (const { selector, body } of RULES) {
        for (const decl of body.split(';')) {
            const i = decl.indexOf(':');
            if (i < 0) continue;
            /* 去掉 var(...) 之后再找色名 —— --lt-sys-white 里的 white 不算 */
            const val = decl.slice(i + 1).replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, '');
            for (const w of val.matchAll(NAMED)) hits.push(selector + '  →  ' + w[0] + '  在「' + decl.trim() + '」');
        }
    }
    assert.deepEqual(hits, [], 'v5 层出现关键字色名（换主题不会跟着变）：\n' + hits.join('\n'));
});

test('V5-5 开关：面板根真的会写 data-ui-rev="5"，且 v5 默认开', () => {
    const src = RD('dashboard-v2.js');
    assert.ok(/data-ui-rev/.test(src), 'dashboard-v2.js 没有任何地方写 data-ui-rev');
    assert.ok(/data-ui-rev["']?\s*[:=]\s*["']?5/.test(src) || /uiRevOf|v5On/.test(src),
        '找不到把 rev=5 写到根上的证据');
    assert.ok(/v5On/.test(src), '缺 v5On() 开关函数');
    assert.ok(/lonsha\.ui\.v5/.test(src), '缺 lonsha.ui.v5 存储键');
    assert.ok(/uiRevOf/.test(src), '缺 uiRevOf() 归一函数');
});