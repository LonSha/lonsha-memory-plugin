// 审计基建（v3.193.0）负控制：真实宿主加载矩阵扫描器的归因自证
// ------------------------------------------------------------
// 为什么必须有它：
//   一个「什么都不查、永远 exit 0」的加载矩阵同样会跑绿。本文件对每条判据造一次
//   **真源码破坏**，确认扫描器按本组声称的归因翻红（只验退出码会放过「因别的缺陷翻红」）。
//   特别地，本版修掉的两个真缺陷在这里各有一条**回归性破坏**：
//     N-M3a 把 modules_combined.js 的幂等守卫去掉 → M3 必须重新翻红（守卫不可回退）
//     N-M7a 拆掉 registerEvents 的卸载-重装 → M7 必须翻红（活监听翻倍可察）
//   这两条就是本版「矩阵不是装饰」的证据：如果哪天有人把守卫删了，门禁会当场抓住。
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
const SRC = process.cwd();
const SCAN = path.join(SRC, 'tests/audit/scan_v3193_host_matrix.mjs');
const MF = path.join(SRC, 'manifest.json');
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok ' + m); };
const bad = (m) => { fail++; console.error('  ✗ ' + m); };
for (const [p, label] of [[SCAN, '被测扫描器'], [MF, 'manifest.json']]) {
    if (!fs.existsSync(p)) { console.error('[v3.193 host 负控制] 缺少' + label + ' ⇒ 无法自证，结构漂移'); process.exit(2); }
}
const mf = JSON.parse(fs.readFileSync(MF, 'utf8'));
const FILES = [mf.js].concat(mf.extra_js || []);
function snapshot() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha-hostneg-'));
    fs.mkdirSync(path.join(dir, 'tests', 'audit'), { recursive: true });
    fs.copyFileSync(MF, path.join(dir, 'manifest.json'));
    for (const f of FILES) {
        const src = path.join(SRC, f);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, f));
    }
    fs.copyFileSync(SCAN, path.join(dir, 'tests', 'audit', 'scanner_copy.mjs'));
    return dir;
}
function runAt(scanPath, dir) {
    try {
        const out = execFileSync('node', [scanPath], { env: { ...process.env, LONSHA_AUDIT_ROOT: dir }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return { code: 0, text: out };
    } catch (e) { return { code: e.status == null ? -1 : e.status, text: String(e.stdout || '') + String(e.stderr || '') }; }
}
const runScan = (dir) => runAt(path.join(dir, 'tests', 'audit', 'scanner_copy.mjs'), dir);
function mutate(file, anchor, repl, label, expectAttr) {
    const dir = snapshot();
    const p = path.join(dir, file);
    const t = fs.readFileSync(p, 'utf8');
    const n0 = t.split(anchor).length - 1;
    if (n0 !== 1) { bad(label + '：锚点须恰中 1 次，实为 ' + n0 + ' ⇒ 破坏不可复现'); fs.rmSync(dir, { recursive: true, force: true }); return; }
    fs.writeFileSync(p, t.replace(anchor, repl));
    const r = runScan(dir);
    if (r.code !== 1) bad(label + '：应 exit=1，实为 ' + r.code + '：' + r.text.slice(-300));
    else if (!r.text.includes(expectAttr)) bad(label + '：翻红但归因不对（期望含「' + expectAttr + '」）：' + r.text.slice(-300));
    else ok(label + ' → exit=1 且归因命中「' + expectAttr + '」');
    fs.rmSync(dir, { recursive: true, force: true });
}
// ── 锚点两向自证 ──
const ANCHORS = [
    ['modules_combined.js', "    if (global && global.__LonShaVisualizerLoaded) return;   // 幂等：二次加载直接返回"],
    ['graph_algorithms.js', '    if (global && global.__LonShaGraphDiffusionLoaded) return;'],
    ['index.js', "                try { this.unregisterEvents(); } catch (e) { errLog(e, 'events.registerEvents防重入'); }"],
];
{
    const dir = snapshot();
    let allUnique = true;
    for (const [f, a] of ANCHORS) {
        const p = path.join(dir, f);
        if (!fs.existsSync(p)) { allUnique = false; bad('锚点自证：' + f + ' 不在夹具里'); continue; }
        const n = fs.readFileSync(p, 'utf8').split(a).length - 1;
        if (n !== 1) { allUnique = false; bad('锚点自证：' + f + ' 里命中 ' + n + ' 次（需恰 1）：' + JSON.stringify(a.slice(0, 40))); }
    }
    if (allUnique) ok('锚点两向自证：' + ANCHORS.length + ' 个锚点各恰中 1 次（可破坏）');
    fs.rmSync(dir, { recursive: true, force: true });
}
// ── 回归性破坏 1：把 modules_combined.js 退回「顶层类声明」形态 ⇒ M3 必须重新翻红 ──
//   为什么必须连 IIFE 一起拆：光删守卫不够 —— IIFE 的函数体作用域本身就让「二次加载抛
//   Identifier already declared」不再发生（旧的最小复现因此静默通过，是本轮踩到的坑）。
//   真回归形态是「有人为了让浏览器直读这个文件，又把类搬回顶层」。
{
    const dir = snapshot();
    const p = path.join(dir, 'modules_combined.js');
    const t = fs.readFileSync(p, 'utf8');
    const a1 = '(function (global) {\n    \'use strict\';\n    if (global && global.__LonShaVisualizerLoaded) return;   // 幂等：二次加载直接返回\n    if (global) global.__LonShaVisualizerLoaded = true;\n';
    const a2 = '})(typeof window !== \'undefined\' ? window : globalThis);';
    const n1 = t.split(a1).length - 1, n2 = t.split(a2).length - 1;
    if (n1 !== 1 || n2 !== 1) bad('N-M3a：锚点须各恰中 1 次，实为 ' + n1 + '/' + n2 + ' ⇒ 破坏不可复现');
    else {
        fs.writeFileSync(p, t.replace(a1, '').replace(a2, ''));
        const r = runScan(dir);
        if (r.code !== 1) bad('N-M3a 退回顶层类应 exit=1，实为 ' + r.code + '：' + r.text.slice(-300));
        else if (!r.text.includes('M3 重复加载不幂等')) bad('N-M3a 翻红但归因不对：' + r.text.slice(-300));
        else ok('N-M3a 退回顶层类声明（IIFE 拆掉）→ exit=1 且归因命中「M3 重复加载不幂等」');
    }
    fs.rmSync(dir, { recursive: true, force: true });
}
// ── 回归性破坏 2：拆掉 registerEvents 的卸载-重装 ⇒ M7 活监听翻倍 ──
mutate('index.js', "                try { this.unregisterEvents(); } catch (e) { errLog(e, 'events.registerEvents防重入'); }",
    '                void 0;',
    'N-M7a 拆掉卸载-重装（重载即翻倍）', 'M7 重载监听器翻倍');
// ── 结构漂移：注册脚本缺失 / extra_js 抽取退化 ⇒ 必须 exit=2 ──
{
    const dir = snapshot();
    const f = (mf.extra_js || [])[10];
    fs.rmSync(path.join(dir, f));
    const r = runScan(dir);
    if (r.code !== 2) bad('N-M0a 注册脚本缺失应 exit=2，实为 ' + r.code + '：' + r.text.slice(-200));
    else if (!r.text.includes('注册脚本不存在')) bad('N-M0a 翻红但归因不对：' + r.text.slice(-200));
    else ok('N-M0a extra_js 里的脚本缺失 → exit=2（拒绝在残缺树上跑矩阵）');
    fs.rmSync(dir, { recursive: true, force: true });
}
{
    const dir = snapshot();
    const m2 = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    m2.extra_js = m2.extra_js.slice(0, 5);
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m2, null, 2));
    const r = runScan(dir);
    if (r.code !== 2) bad('N-M0b extra_js 只剩 5 个应 exit=2，实为 ' + r.code + '：' + r.text.slice(-200));
    else if (!r.text.includes('抽取器已失效')) bad('N-M0b 翻红但归因不对：' + r.text.slice(-200));
    else ok('N-M0b extra_js 抽取退化 → exit=2（抽取器失效可察）');
    fs.rmSync(dir, { recursive: true, force: true });
}
// ── R0 自证：段数漂移 / 归因串调用点改名 ⇒ exit=2 ──
{
    const dir = snapshot();
    const sp = path.join(dir, 'tests', 'audit', 'scanner_copy.mjs');
    const s0 = fs.readFileSync(sp, 'utf8');
    const anchor = 'const EXPECT_SECTION_COUNT = 8;';
    if (s0.split(anchor).length - 1 !== 1) bad('N-M0c：段数锚点须恰中 1 次');
    else {
        fs.writeFileSync(sp, s0.replace(anchor, 'const EXPECT_SECTION_COUNT = 3;'));
        const r = runAt(sp, dir);
        if (r.code !== 2) bad('N-M0c 段数漂移应 exit=2，实为 ' + r.code + '：' + r.text.slice(-200));
        else if (!r.text.includes('判据自证失败')) bad('N-M0c 翻红但归因不对：' + r.text.slice(-200));
        else ok('N-M0c 判据段数漂移 → exit=2 且归因命中「判据自证失败」');
    }
    fs.rmSync(dir, { recursive: true, force: true });
}
{
    const dir = snapshot();
    const sp = path.join(dir, 'tests', 'audit', 'scanner_copy.mjs');
    const s0 = fs.readFileSync(sp, 'utf8');
    const callAnchor = "bad('M4 隔离性缺失'";
    const n0 = s0.split(callAnchor).length - 1;
    if (n0 < 1) bad('N-M0d：调用点锚点命中 ' + n0 + ' 次');
    else {
        fs.writeFileSync(sp, s0.split(callAnchor).join("bad('M4_ATTR_RENAMED'"));
        const r = runAt(sp, dir);
        if (r.code !== 2) bad('N-M0d 归因串改名应 exit=2，实为 ' + r.code + '：' + r.text.slice(-200));
        else if (!r.text.includes('判据自证失败')) bad('N-M0d 翻红但归因不对：' + r.text.slice(-200));
        else ok('N-M0d 归因串调用点被改名（声明未同步）→ exit=2 且归因命中「判据自证失败」');
    }
    fs.rmSync(dir, { recursive: true, force: true });
}
// ── 还原自证 ──
{
    const m = fs.readFileSync(path.join(SRC, 'modules_combined.js'), 'utf8');
    const g = fs.readFileSync(path.join(SRC, 'graph_algorithms.js'), 'utf8');
    const i = fs.readFileSync(path.join(SRC, 'index.js'), 'utf8');
    if (!m.includes('__LonShaVisualizerLoaded')) bad('原版 modules_combined.js 被污染（幂等守卫不见了）');
    else if (!g.includes('__LonShaGraphDiffusionLoaded')) bad('原版 graph_algorithms.js 被污染');
    else if (!i.includes("events.registerEvents防重入")) bad('原版 index.js 被污染（卸载-重装被拆）');
    else ok('原版工作区未被触碰（两处幂等守卫与注册防重入都完好）');
}
console.log('\n[v3.193 host 负控制] ' + pass + ' 组成立 / ' + fail + ' 组失败');
process.exit(fail ? 1 : 0);