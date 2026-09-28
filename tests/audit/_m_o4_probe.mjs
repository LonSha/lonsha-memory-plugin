#!/usr/bin/env node
// tests/audit/_m_o4_probe.mjs — M-O4 长线规模与缓存负载：四条消费路径只读量测探针 [v3.254.0]
//
// 只读：不改任何生产文件、不写盘（除 stdout）、不跑门禁、**永不 exit 1**。
//
// 为什么文件名以下划线开头：本文件是**探针**（量的工具），不是扫描器（判的门）。
//   tests/v3226 把「审计目录下不以 `_` 开头且不含 negctl 的 .mjs」当作**在役扫描器**，
//   要求它登记进 tests/audit/audit_scan_probe_matrix.tsv 并给出 H/G/T 三列退出码。
//   探针不判缺陷（没有「缺陷输入」，恒 exit 0），登记成扫描器会让那三列失去意义。
//   先例：`tests/audit/_p3_snapshot_probe.mjs`（v3.251.0，同规格只读探针）。
//
// 四条路径（与 cache-workload.js 的 PATHS 同序、同名）：
//   snapshot   快照         —— 真引擎方法 `buildBridgeSnapshot`（v3.251 P-3 量过，但档位只到 200）
//   candidate  候选化       —— 真模块 unified-recall.js::graphToCandidates（图谱节点 → 候选）
//   serialize  序列化       —— 真引擎方法 `buildBridgeSnapshotJson`（快照 + JSON.stringify）
//   settings   设置界面消费 —— 真引擎方法 `_summarizeRecallAudit`（状态总览面板「召回自检」行读它）
//
// 口径纪律（与 `_p3_snapshot_probe.mjs` 逐条对齐）：
//   ① **绝不编 0**：抽不出方法体 / 构造失败 / 读数非有限数 ⇒ 该路径 measured:false 并如实报原因，
//      且整体 exit 2（探针自己不可信时不留一个看起来正常的读数）。
//   ② **计时只包围被测操作**：建数据（`build`）不计时 —— v1 性能探针把 `mkHost(1000)` 算进被测调用，
//      报出 98ms/次，而那 ~99ms 全是夹具成本。
//   ③ **合成数据 + 真模块，非实机**：读数一律 synth:true，不得被读成真机性能。
//   ④ **未证收益不改产品**：是否 `open-hotspot-candidate` 由 `cache-workload.js` 判，
//      本探针只负责给读数，不夹带结论。
//
// 用法：
//   node tests/audit/_m_o4_probe.mjs                      # 默认档位（cache-workload.js::SIZES）
//   node tests/audit/_m_o4_probe.mjs --sizes=0,200,1000   # 自定义档位
//   node tests/audit/_m_o4_probe.mjs --json               # 额外打一行机器可读 JSON
// 退出码：0 = 读数成立；2 = 探针自身失效（抽不出方法体 / 构造失败 / 全部路径测不出）。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const require_ = createRequire(import.meta.url);

const ARGV = process.argv.slice(2);
function argOf(name, dflt) {
    const hit = ARGV.find((a) => a.startsWith('--' + name + '='));
    return hit ? hit.slice(('--' + name + '=').length) : dflt;
}
const WANT_JSON = ARGV.includes('--json');

function fail(msg) {
    console.error('[m-o4-probe] ' + msg);
    process.exit(2);
}

/* ---------- 1. 抽方法体（花括号配平）；抽不出即 null，调用方 fail-closed ---------- */
const idxSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
function methodBody(src, name) {
    const at = src.indexOf(name + '() {');
    if (at < 0) return null;
    const start = src.indexOf('{', at);
    if (start < 0) return null;
    let depth = 0;
    for (let i = start; i < src.length; i++) {
        const ch = src[i];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
    }
    return null;
}
/** 把抽出的方法体构造成真函数（`this` 由调用方以宿主对象给出）。 */
function buildMethod(name) {
    const body = methodBody(idxSrc, name);
    if (!body) return { fn: null, body: null, why: 'method-body-not-found:' + name };
    try {
        const fn = new Function('window', 'VERSION', 'errLog', 'return ({ ' + body + ' }).' + name)({}, 'probe', () => {});
        if (typeof fn !== 'function') return { fn: null, body, why: 'constructed-not-a-function:' + name };
        return { fn, body, why: null };
    } catch (e) {
        return { fn: null, body, why: 'construct-failed:' + name + ':' + String((e && e.message) || e) };
    }
}

/* ---------- 2. 装载真模块（只读 require，不写盘） ---------- */
function loadModule(file) {
    try { return require_(path.join(ROOT, file)); }
    catch (e) { fail('装载 ' + file + ' 失败：' + String((e && e.message) || e)); }
}
const WL = loadModule('cache-workload.js');
const UR = loadModule('unified-recall.js');
if (!WL || typeof WL.curve !== 'function') fail('cache-workload.js 未导出 curve()');
if (!WL || typeof WL.survey !== 'function') fail('cache-workload.js 未导出 survey()');
if (!UR || typeof UR.graphToCandidates !== 'function') fail('unified-recall.js 未导出 graphToCandidates()');

const M_SNAPSHOT = buildMethod('buildBridgeSnapshot');
const M_SERIALIZE = buildMethod('buildBridgeSnapshotJson');
const M_SETTINGS = buildMethod('_summarizeRecallAudit');
for (const [tag, m] of [['snapshot', M_SNAPSHOT], ['serialize', M_SERIALIZE], ['settings', M_SETTINGS]]) {
    if (!m.fn) console.error('[m-o4-probe] ⚠ 路径 ' + tag + ' 的方法不可构造（' + m.why + '）——该路径将如实报「测不出」，不编 0');
}

/* ---------- 3. 合成夹具（真模块 + 合成数据；建数据不计时） ---------- */
function mkAudit(n) {
    const ra = [];
    for (let k = 0; k < n; k++) {
        const fh = {};
        for (let j = 0; j < 3; j++) fh[String((k + j * 11) % Math.max(1, n))] = (k + j) % 5;
        ra.push({ empty: (k % 10) === 0, totalHits: k % 7, floorHits: fh, queryText: 'q' + k, ts: 1700000000000 + k * 1000 });
    }
    return ra;
}
function mkSnapshotHost(n) {
    const characters = {};
    for (let k = 0; k < n; k++) {
        characters['人物' + k] = {
            name: 'n' + k, affinity: k % 100, note: 'x'.repeat(20),
            status: { hp: k, mood: 'ok' }, relations: { ['r' + (k % 7)]: k },
        };
    }
    const lifeDetails = [];
    for (let k = 0; k < n; k++) lifeDetails.push({ tier: (k % 2) ? 'normal' : 'major', text: 't' + k, at: k, tags: ['a', 'b'] });
    const sceneNodes = new Map();
    for (let k = 0; k < n; k++) sceneNodes.set('sc' + k, { id: 'sc' + k, name: '场景' + k });
    return {
        status: { chars: characters, getProtagonist: () => ({ name: 'p' }), lifeDetails, characters },
        _mutationEpoch: 3,
        _recallAudit: mkAudit(Math.min(n, 200)),
        _projectionDropped: 0,
        _lastProjectionEnvelope: null,
        getCurrentChatId: () => 'chat-probe',
        clock: { export: () => ({ date: '2026-09-28', label: 'probe' }) },
        moneyLedger: { export: () => ({ total: n }) },
        outline: { export: () => ({ arcs: [] }) },
        scene: { nodes: sceneNodes },
        worldProg: { export: () => ({}) },
        buildInjectionReadout: () => ({ round: 1, total: 20, kept: 18, chars: 4000, tokens: 900, outcome: 'completed' }),
        _eventPlatformsFace: () => ({ ok: true, countedEvents: n }),
        _evidenceWorkbench: () => ({ ok: true, ledgers: 9 }),
        _historyFingerprint: () => 'h'.repeat(8),
    };
}
function mkGraphNodes(n) {
    const nodes = new Map();
    for (let k = 0; k < n; k++) {
        nodes.set('g' + k, {
            id: 'g' + k, name: '节点' + k, type: (k % 3) ? 'character' : 'event',
            updatedAt: n - k, order: k,
            data: { summary: 'x'.repeat(40), path: ['a', 'b', 'c'], note: 'y'.repeat(20) },
        });
    }
    return nodes;
}

const probes = {
    /* 快照：真方法 + 真宿主形状；字节口径取方法自报的 meta.selfBytes（与 P-3 同口径）。 */
    snapshot: M_SNAPSHOT.fn ? {
        build: (n) => mkSnapshotHost(n),
        read: (host) => M_SNAPSHOT.fn.call(host),
        bytes: (snap) => (snap && snap.meta && Number.isFinite(snap.meta.selfBytes)) ? snap.meta.selfBytes : null,
    } : null,
    /* 候选化：真模块 unified-recall；includeDeferred 取全量（默认 cap=24 会把规模效应挡在门外）。 */
    candidate: {
        build: (n) => mkGraphNodes(n),
        read: (nodes) => UR.graphToCandidates(nodes, { includeDeferred: true }),
        count: (out) => (out && Number.isFinite(out.total)) ? out.total : (Array.isArray(out) ? out.length : null),
    },
    /* 序列化：真方法 buildBridgeSnapshotJson（快照 + JSON.stringify 一次）。
       它内部调 `this.buildBridgeSnapshot()` —— 宿主必须**同时**给出两者，
       否则 read 抛 `no-snapshot` 而 `bytes` 取到 0（**把失败读成 0 字节**，正是本模块
       头注①禁的形态）。故这里按顺序双向补位：谁缺就补谁，两个都缺才让该路径报「测不出」。 */
    serialize: M_SERIALIZE.fn ? {
        build: (n) => {
            const host = mkSnapshotHost(n);
            if (M_SNAPSHOT.fn) host.buildBridgeSnapshot = function () { return M_SNAPSHOT.fn.call(this); };
            return host;
        },
        read: (host) => M_SERIALIZE.fn.call(host),
        bytes: (r) => (r && Number.isFinite(r.bytes)) ? r.bytes : null,
    } : null,
    /* 设置界面消费：状态总览面板的「召回自检」行读它（账本规模即面板一行要折叠的输入规模）。 */
    settings: M_SETTINGS.fn ? {
        build: (n) => ({ _recallAudit: mkAudit(n) }),
        read: (host) => M_SETTINGS.fn.call(host),
    } : null,
};

/* ---------- 4. 跑曲线 + 冗余度 ---------- */
/* 档位：默认取模块自己的 SIZES（0/10/50/200/1000/5000/10000，计划点名的三档在内）；
   `--sizes=` 可覆盖。解析失败即 fail-closed —— 静默退回默认档会让「我指定了 5000」变成谎话。 */
const rawSizes = argOf('sizes', '');
let SIZES = Array.isArray(WL.SIZES) ? WL.SIZES.slice() : [];
if (rawSizes) {
    SIZES = rawSizes.split(',').map((s) => Number(String(s).trim())).filter((n) => Number.isFinite(n) && n >= 0);
    if (!SIZES.length) fail('--sizes 解析后为空（示例 --sizes=0,200,1000）');
}
if (!SIZES.length) fail('cache-workload.js 未导出可用的 SIZES');
const survey = WL.survey(probes, { sizes: SIZES });
const probeSizes = SIZES;
const bigN = probeSizes[probeSizes.length - 1];
const repeats = [
    probes.snapshot ? WL.repeatCost(probes.snapshot, { n: bigN, repeat: 5 }) : null,
    WL.repeatCost(probes.candidate, { n: bigN, repeat: 5 }),
    probes.settings ? WL.repeatCost(probes.settings, { n: bigN, repeat: 5 }) : null,
].filter(Boolean);

console.log('=== M-O4 四条消费路径只读量测（合成数据 + 真模块，非实机） ===');
console.log('index.js ' + idxSrc.length + ' 字节 · node ' + process.version + ' · 档位 ' + probeSizes.join('/'));
console.log('方法体：snapshot=' + (M_SNAPSHOT.body ? M_SNAPSHOT.body.length : '—')
    + ' serialize=' + (M_SERIALIZE.body ? M_SERIALIZE.body.length : '—')
    + ' settings=' + (M_SETTINGS.body ? M_SETTINGS.body.length : '—') + ' 字符');
console.log('');
console.log(WL.report(survey, repeats));
console.log('');
console.log('--- 逐档明细 ---');
for (const c of survey.curves) {
    const pts = c.rows.map((r) => r.n + ':' + (r.measured ? (r.bytes + 'B/' + r.ms + 'ms' + (r.items != null ? '/n=' + r.items : '')) : ('✗' + r.reason))).join('  ');
    console.log(c.path + '\t' + pts);
}
if (WANT_JSON) {
    console.log('');
    console.log('--- json ---');
    console.log(JSON.stringify({ synth: true, sizes: probeSizes, survey, repeats }));
}

/* ---------- 5. 自我可信性：全路径测不出即 exit 2（探针自己失效时不留下正常读数） ---------- */
const measured = survey.curves.filter((c) => c.measured).length;
if (measured === 0) fail('四条路径全部测不出（探针自身失效，读数不可信）');
console.log('');
console.log('measured_paths=' + measured + '/' + survey.curves.length
    + ' hotspans=' + (survey.hotspots.length ? survey.hotspots.join(',') : '无')
    + ' ⇒ ' + survey.recommendation + '（本探针不下结论；是否改产品按计划原文「只有证明有收益的热点进入产品修改」）');
process.exit(0);
