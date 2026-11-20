#!/usr/bin/env node
/* ============================================================
 * tools/gen-icon-css.mjs — 由 shared/icons.js 生成 css/ls-icons.css（零依赖，Node 18+）
 * ------------------------------------------------------------
 * 为什么需要它：settings-ui.js 里大量文字是用 innerHTML 拼出来的字符串，也有不少走 textContent
 *   （toast、按钮文字）。在这些位置内联整段 <svg> 太长，也会让源码难读。
 *   于是用一个极短的占位元素：<i class="ls-ico" data-i="check" aria-hidden="true"></i>
 *   由本文件生成的 CSS 用 mask-image 把对应图标画出来，颜色跟随 currentColor。
 *   图标几何与 shared/icons.js 完全同源（同一份 ICONS 表），所以和面板里的内联 SVG 一模一样。
 * 用法：
 *   node tools/gen-icon-css.mjs                         读 ./shared/icons.js（或 ./ui/lonsha-icons.js），写 ./css/ls-icons.css
 *   node tools/gen-icon-css.mjs --icons=ui/lonsha-icons.js --out=css/ls-icons.css
 *   node tools/gen-icon-css.mjs --check                 只比对，不一致时退出码 1（给 CI 用）
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// <core>
/** 把一枚图标的 SVG 字符串变成可放进 CSS url() 的 data URI（遮罩只看 alpha，所以颜色写死黑色即可） */
function iconDataUri(svg) {
    const clean = String(svg)
        .replace(/\sclass="[^"]*"/, '')
        .replace(/\sdata-icon="[^"]*"/, '')
        .replace(/\saria-hidden="[^"]*"/, '')
        .replace(/\sfocusable="[^"]*"/, '')
        .replace(/currentColor/g, '#000')
        .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    return 'data:image/svg+xml,' + clean
        .replace(/%/g, '%25').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, "'");
}

/** 生成整份 ls-icons.css。Icons = LonShaIcons（需要 names() 与 svg()） */
function buildIconCss(Icons) {
    const names = Icons.names().slice().sort();
    const head = [
        '/* ============================================================',
        '   LonSha · 图标遮罩（css/ls-icons.css）—— 由 tools/gen-icon-css.mjs 从 shared/icons.js ' + Icons.VERSION + ' 生成，请勿手改',
        '   ------------------------------------------------------------',
        '   用法：<i class="ls-ico" data-i="check" aria-hidden="true"></i>（颜色跟随 currentColor，尺寸 1em）',
        '   状态色：data-tone="success|warn|error|info|pending|muted"（只改颜色，不改形状）',
        '   本文件不随 lonsha.ui.v3 开关：去掉 emoji 之后，旧外观也要能显示这些图标。',
        '   零 !important；颜色只来自 --lt-* / --ls-* token。图标共 ' + names.length + ' 个。',
        '   ============================================================ */',
        '@layer ls.base, ls.components, ls.dashboard, ls.utilities, ls.devconsole;',
        '@layer ls.base {',
        '    .ls-ico {',
        '        display: inline-block; flex: none; width: 1em; height: 1em; vertical-align: -0.14em;',
        '        background-color: currentColor;',
        '        -webkit-mask: var(--ls-ico) center / contain no-repeat; mask: var(--ls-ico) center / contain no-repeat;',
        '        margin-inline-end: 0.32em;',
        '    }',
        '    .ls-ico:last-child { margin-inline-end: 0; }',
        '    .ls-ico.ls-ico-inline { margin-inline: 0.22em; vertical-align: -0.16em; width: 0.92em; height: 0.92em; opacity: 0.72; }',
        '    .ls-ico[data-tone="success"] { color: var(--lt-success, var(--ls-success)); }',
        '    .ls-ico[data-tone="warn"] { color: var(--lt-warn, var(--ls-warn)); }',
        '    .ls-ico[data-tone="error"] { color: var(--lt-danger, var(--ls-danger)); }',
        '    .ls-ico[data-tone="info"] { color: var(--lt-info, var(--ls-accent)); }',
        '    .ls-ico[data-tone="pending"], .ls-ico[data-tone="muted"] { color: var(--lt-text-3, var(--ls-text-3)); }',
        '    @media (forced-colors: active) { .ls-ico { background-color: CanvasText; } }',
    ];
    const rules = names.map((n) => '    .ls-ico[data-i="' + n + '"] { --ls-ico: url("' + iconDataUri(Icons.svg(n)) + '"); }');
    return head.concat(rules, ['}', '']).join('\n');
}
// </core>

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const iconsPath = opt('icons', fs.existsSync('shared/icons.js') ? 'shared/icons.js' : 'ui/lonsha-icons.js');
const outPath = opt('out', 'css/ls-icons.css');
const Icons = createRequire(import.meta.url)(path.resolve(iconsPath));
const css = buildIconCss(Icons);
if (args.includes('--check')) {
    const cur = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
    if (cur !== css) { console.error('[gen-icon-css] ' + outPath + ' 与 ' + iconsPath + ' 不一致，请重新生成'); process.exit(1); }
    console.log('[gen-icon-css] [OK] ' + outPath + ' 与图标表一致');
} else {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, css);
    console.log('[gen-icon-css] 写入 ' + outPath + '（' + Icons.names().length + ' 个图标，' + css.length + ' 字节）');
}
