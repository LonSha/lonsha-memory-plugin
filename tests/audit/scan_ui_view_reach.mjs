#!/usr/bin/env node
/**
 * tests/audit/scan_ui_view_reach.mjs — L13-O4 面板视图入口可达性盘点。
 *
 * 为什么需要这一档：`scan_ui_binding` 判的是「声明键 ↔ 渲染控件」，它**不判**
 *   「这个视图玩家能不能点进去」。于是「视图写好了、零入口」这种形态在全绿下隐形 ——
 *   这正是 L13 优化面反复治的那一类（建好而碰不到）。
 *
 * 判定口径（全部来自源码真值，不猜）：
 *   · nav   导航可达：该视图名以字面量出现在一张 `ls-clickable` + `data-view` 卡片上，
 *           并且存在把卡片 `dataset.view` 转成 `showBrowser()` 的绑定（本仓在 showStats 尾部）。
 *           卡片是模板拼的（统计卡），所以**不能**只看「showBrowser('x') 字面量」——
 *           那会把能点开的视图误判成「碰不到」，与实况相反。
 *   · code  仅代码可达：没有卡片，但有以字面量出现的 `showBrowser('x')`（只能被某条流程跳进来）。
 *   · zero  零可达：有渲染分支，既没卡片也没任何 `showBrowser` 指向它。
 *
 * 退出码：0=卫生  1=存在真缺陷（zero > 0：留着「只有定义没有入口」的视图）  2=结构漂移（读不到 settings-ui.js / 视图盘面塌陷）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const UI = path.join(ROOT, 'settings-ui.js');
/* 结构漂移下限（fail-closed）：健康树上实测 26 个渲染分支。
 * 为什么要下限：本脚本的结论是「零可达 = 0」，一个否定式读数。
 * 文件被截断 / 改名 / 正则失配时盘面塌成个位数，「零可达 0」依旧成立 ⇒ 失效被声明成健康。
 * 这正是本仓反复治的那一类（审计失效 = 报告一切正常），故塌陷必须 exit 2。 */
const MIN_VIEWS = 20;

export function analyze(text) {
    const src = text == null ? fs.readFileSync(UI, 'utf8') : String(text);
    const lines = src.split('\n');

    /* 渲染分支真源：`viewType === 'x'`（只作口径记录，不参与可达判定）。 */
    const branches = new Set();
    let m;
    const brRe = /viewType\s*===\s*'([a-z0-9_]+)'/g;
    while ((m = brRe.exec(src))) branches.add(m[1]);

    /* 卡片真源：同一行里同时出现 ls-clickable 与 data-view="x"。 */
    const cards = {};
    for (let i = 0; i < lines.length; i++) {
        const L = lines[i];
        const litRe = /data-view="([a-z0-9_]+)"/g;
        let mm;
        while ((mm = litRe.exec(L))) {
            const v = mm[1];
            (cards[v] = cards[v] || []).push({ line: i + 1, clickable: /ls-clickable/.test(L) });
        }
    }

    /* 绑定真源：卡片点击 → showBrowser(dataset.view)。没有它，卡片只是装饰。 */
    const cardBinding = /showBrowser\(card\.dataset\.view\)/.test(src);

    /* 字面量入口：showBrowser('x')。 */
    const literal = {};
    for (let i = 0; i < lines.length; i++) {
        const sbRe = /showBrowser\(\s*'([a-z0-9_]+)'\s*\)/g;
        let mm;
        while ((mm = sbRe.exec(lines[i]))) (literal[mm[1]] = literal[mm[1]] || []).push(i + 1);
    }

    const all = new Set([...Object.keys(cards), ...Object.keys(literal), ...branches]);
    const rows = [...all].sort().map((v) => {
        const cl = (cards[v] || []).filter((c) => c.clickable);
        let kind;
        if (cl.length && cardBinding) kind = 'nav';
        else if ((literal[v] || []).length) kind = 'code';
        else kind = 'zero';
        return { view: v, kind, cards: cards[v] || [], entries: literal[v] || [], hasBranch: branches.has(v) };
    });

    const counts = { nav: 0, code: 0, zero: 0 };
    for (const r of rows) counts[r.kind]++;
    return { views: rows, counts, cardBinding, branches: branches.size };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    let r;
    try {
        r = analyze();
    } catch (e) {
        console.error('[ui-view-reach] 读不到面板源码（' + String((e && e.message) || e) + '）：视图入口面无从盘点 —— 结构漂移');
        process.exit(2);
    }
    if (r.views.length < MIN_VIEWS || r.branches < MIN_VIEWS) {
        console.error('[ui-view-reach] 视图盘面塌陷：视图 ' + r.views.length + ' 个 / 渲染分支 ' + r.branches + ' 个（下限 ' + MIN_VIEWS + '）—— 探测器失效，拒绝给「零可达 0」这种结论');
        process.exit(2);
    }
    console.log('[ui-view-reach] 视图总数 ' + r.views.length
        + ' | 导航可达 ' + r.counts.nav + ' / 仅代码可达 ' + r.counts.code + ' / 零可达 ' + r.counts.zero
        + ' | 卡片绑定=' + (r.cardBinding ? '有' : '缺'));
    for (const k of ['nav', 'code', 'zero']) {
        const list = r.views.filter((x) => x.kind === k);
        if (!list.length) continue;
        console.log('  [' + k + '] ' + list.map((x) => x.view).join(' · '));
    }
    if (r.counts.zero > 0) {
        console.log('[ui-view-reach] ✖ 零可达 > 0：这些视图只有定义没有入口（二选一：接入口或删掉）');
        process.exit(1);
    }
    console.log('[ui-view-reach] ✔ 无「只有定义没有入口」的视图');
}