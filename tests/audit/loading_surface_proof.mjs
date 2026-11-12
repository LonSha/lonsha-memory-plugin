#!/usr/bin/env node
/* ============================================================
 * tests/audit/loading_surface_proof.mjs
 * —— L21-O3 装载面五段替代证据链的**探针**（读真仓、落读数）
 * ------------------------------------------------------------
 * 判定逻辑**全部**在 `_loading_surface_judge.mjs`（纯函数）。
 * 本文件只做三件事：读仓库 → 交给判定体 → 落 `loading_surface_proof.json`。
 *
 * 【为什么下划线规则不适用（说明清楚免得被当违规）】
 * 本文件不以下划线开头，是因为它要进 `tests/audit/` 的扫描循环被跑，
 * 而**它不依赖真机**：`_` 前缀在本仓的语义是「要真宿主/真浏览器才能跑」。
 * 本证明的价值恰恰是「没有真机时也有读数」，加下划线就等于把它排除在门外。
 *
 * 退出码：0 = 五段全成立（卫生）｜1 = 读数成立但发现真缺陷（某段有 defects）｜2 = 段自身跑不起来（结构缺失 / 段抛错 / 落盘失败）⇒ 不给结论。
 * 三档含义互斥，与真机套件同形（0 卫生 / 1 真缺陷 / 2 结构漂移），好用同一套纪律读。
 *
 * 用法：node tests/audit/loading_surface_proof.mjs [--json] [--root=DIR]
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeProof, SEGMENTS } from './_loading_surface_judge.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARGV = process.argv.slice(2);
const WANT_JSON = ARGV.includes('--json');
const ROOT_ARG = (ARGV.find((a) => a.startsWith('--root=')) || '').split('=')[1] || '';
const ROOT = ROOT_ARG || process.env.LONSHA_AUDIT_ROOT || path.resolve(HERE, '..', '..');
const OUT = path.join(HERE, 'loading_surface_proof.json');
const FIXTURE = process.env.LONSHA_AUDIT_FIXTURE === '1' || Boolean(ROOT_ARG);

function bail(msg) {
    console.error('[loading-surface] 结构失效（不给结论）：' + msg);
    process.exit(2);
}

const manifestPath = path.join(ROOT, 'manifest.json');
if (!fs.existsSync(manifestPath)) bail('manifest.json 缺失：' + manifestPath);
let manifest;
try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
catch (e) { bail('manifest.json 解析失败：' + String((e && e.message) || e)); }
if (!Array.isArray(manifest.extra_js) || manifest.extra_js.length === 0) bail('manifest.extra_js 为空或不是数组');

/* 扫描面塌陷守卫：模块数过低 ⇒ 面塌了，五段「全绿」毫无意义（账本残留形态）。 */
const MIN_MODULES = FIXTURE ? 1 : 200;
if (manifest.extra_js.length < MIN_MODULES) {
    bail('extra_js 模块数过低（' + manifest.extra_js.length + ' < ' + MIN_MODULES + '）⇒ 装载面塌陷');
}

const ledgerPath = path.join(ROOT, 'tests/audit/module_consumption_ledger.json');
let ledger = null;
if (fs.existsSync(ledgerPath)) {
    try { ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); }
    catch (e) { bail('台账解析失败：' + String((e && e.message) || e)); }
} else {
    bail('module_consumption_ledger.json 缺失（S5 无从对账）');
}

/* declared_dormant 名单从 L21-O1 的 triage 表取（唯一真源，不在这里再抄一份）。 */
const triagePath = path.join(ROOT, 'tests/audit/l21_o1_triage.json');
let dormant = [];
if (fs.existsSync(triagePath)) {
    try {
        const tri = JSON.parse(fs.readFileSync(triagePath, 'utf8'));
        /* 表结构是 `verdicts.declared_dormant.modules`（对象，键为模块名）。
         * 这里**容忍三种形状**（数组 / 对象 / 一层包裹）而只认「模块名」这一件事，
         * 免得 triage 表将来加了一层元信息就把本段静默判绿（那才是最坏的形态：
         * dormantExcluded 变成 0 而 S5 报 11 条「装载面洗白」，看起来像产品缺陷）。 */
        const node = (tri && tri.verdicts && tri.verdicts.declared_dormant) || tri.declared_dormant || null;
        const mods = node && (node.modules || node);
        if (Array.isArray(mods)) dormant = mods.map((x) => (typeof x === 'string' ? x : x && x.module)).filter(Boolean);
        else if (mods && typeof mods === 'object') dormant = Object.keys(mods);
        if (dormant.length === 0) {
            console.error('[loading-surface] 警告：triage 表里没读到 declared_dormant 模块名 ⇒ S5 会把休眠项当缺陷报');
        }
    } catch (e) {
        console.error('[loading-surface] 警告：triage 表解析失败，dormant 名单按空处理：' + String((e && e.message) || e));
    }
}

const cache = new Map();
const world = {
    manifest,
    exists: (rel) => fs.existsSync(path.join(ROOT, rel)),
    readFile: (rel) => {
        if (!cache.has(rel)) cache.set(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'));
        return cache.get(rel);
    },
    ledger,
    dormant,
};

const proof = judgeProof(world);
const out = {
    schema: proof.schema,
    generatedAt: new Date().toISOString(),
    version: manifest.version || null,
    root: path.relative(path.resolve(HERE, '..', '..'), ROOT) || '.',
    moduleCount: manifest.extra_js.length,
    ok: proof.ok,
    failedSegments: proof.failedSegments,
    boundary: proof.boundary,
    equivRealhost: proof.equivRealhost,
    segments: proof.segments,
};

if (!FIXTURE) {
    try { fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8'); }
    catch (e) {
        /* 落盘失败必须如实报 exit 2：一份「跑了但没留下证据」的读数比没跑更容易被当成跑过。 */
        bail('读数落盘失败（' + OUT + '）：' + String((e && e.message) || e));
    }
}

if (WANT_JSON) {
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
} else {
    console.log('[loading-surface] 装载面五段替代证据链（不等价于真机）：模块 ' + out.moduleCount + ' 个');
    for (const name of SEGMENTS) {
        const s = out.segments[name];
        const extra = [
            s.evaluated !== undefined ? 'evaluated=' + s.evaluated : '',
            s.mountedTotal !== undefined ? 'mounted=' + s.mountedTotal : '',
            s.dormantExcluded !== undefined ? 'dormantExcluded=' + s.dormantExcluded : '',
        ].filter(Boolean).join(' ');
        console.log('  [' + (s.ok ? '✓' : '✗') + '] S' + (SEGMENTS.indexOf(name) + 1) + ' ' + name
            + ' (checked=' + s.checked + (extra ? ' ' + extra : '') + ')');
        for (const d of s.defects.slice(0, 8)) console.log('        · ' + d);
        if (s.defects.length > 8) console.log('        … 另 ' + (s.defects.length - 8) + ' 条');
    }
    console.log('[loading-surface] 边界：' + out.boundary);
}

process.exit(proof.ok ? 0 : 1);