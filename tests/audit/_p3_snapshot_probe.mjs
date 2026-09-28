#!/usr/bin/env node
// tests/audit/_p3_snapshot_probe.mjs — P-3 快照外供面瘦身：字节曲线只读探针（v3.251.0 实测版）
//
// 只读：不改任何生产文件、不写盘（除 stdout）、不跑门禁。
// 口径与 tests/audit/p3_snapshot_probe.md 一致：
//   bytes_empty = buildBridgeSnapshot() 在空宿主上的 meta.selfBytes
//   bytes(N)    = 人造 status.characters + lifeDetails 各 N 条时的 meta.selfBytes
//   superlinear = 边际字节 (bytes(N)-bytes_empty)/N 是否随 N 明显上升
// 纪律：抽不出方法体 / 构造失败 / 读数非有限数 ⇒ measured=false 且 exit 2，绝不编 0。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SIZES = [0, 10, 50, 200];

function fail(msg) { console.error('[p3-probe] ' + msg); process.exit(2); }

// 花括号配平抽方法体；抽不出即 null（调用方 fail-closed，不猜）。
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

const idxSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const body = methodBody(idxSrc, 'buildBridgeSnapshot');
if (!body) fail('抽不出 buildBridgeSnapshot 方法体（源码结构漂移，读数不可信）');

let snapshotFn = null;
try {
    const host = { SillyTavern: { getContext: () => ({ chat: [null] }) } };
    snapshotFn = new Function('window', 'VERSION', 'errLog',
        'return ({ ' + body + ' }).buildBridgeSnapshot;')(host, 'probe', () => {});
} catch (e) {
    fail('方法体构造失败：' + (e && e.message));
}
if (typeof snapshotFn !== 'function') fail('构造结果不是函数');

// 人造宿主：只塞可 JSON 的浅对象，不引入真实账本（避免现跑管线）。
function mkHost(n) {
    const characters = {};
    for (let k = 0; k < n; k++) characters['c' + k] = { name: 'n' + k, affinity: k % 100, note: 'x'.repeat(20) };
    const lifeDetails = [];
    for (let k = 0; k < n; k++) lifeDetails.push({ tier: (k % 2) ? 'normal' : 'major', text: 't' + k, at: k });
    return { status: { getProtagonist: () => ({ name: 'p' }), lifeDetails, characters }, _mutationEpoch: 1 };
}

const rows = [];
for (const n of SIZES) {
    let snap = null, t0 = 0n, t1 = 0n;
    try {
        const host = mkHost(n);
        t0 = process.hrtime.bigint();
        snap = snapshotFn.call(host);
        t1 = process.hrtime.bigint();
    } catch (e) { fail('N=' + n + ' 上调用抛错：' + (e && e.message)); }
    const bytes = (snap && snap.meta && Number.isFinite(snap.meta.selfBytes)) ? snap.meta.selfBytes : null;
    if (bytes === null) fail('N=' + n + ' 上取不到有限 meta.selfBytes（结构漂移）');
    rows.push({ n, bytes, ms: Number((Number(t1 - t0) / 1e6).toFixed(3)), strict: !!(snap.meta && snap.meta.strictJsonOk) });
}

const empty = rows[0];
const slopes = rows.slice(1).map((r) => (r.bytes - empty.bytes) / r.n);
const maxSlope = Math.max.apply(null, slopes);
const minSlope = Math.min.apply(null, slopes);
// 线性判据：边际字节比值 <= 1.5 视为线性；样本少，故只做粗判并如实标注读数本身。
const superlinear = (minSlope > 0) && (maxSlope / minSlope > 1.5);

console.log('=== P-3 快照字节曲线（只读实测） ===');
console.log('index.js 字节 ' + idxSrc.length + ' / 方法体 ' + body.length + ' 字符 / node ' + process.version);
console.log('N\tbytes\tbytes/N\tms\tstrictJsonOk');
for (const r of rows) {
    console.log(r.n + '\t' + r.bytes + '\t' + (r.n ? (r.bytes / r.n).toFixed(2) : '-') + '\t' + r.ms + '\t' + r.strict);
}
console.log('--- 判定 ---');
console.log('bytes_empty=' + empty.bytes);
console.log('slope_per_item=' + slopes.map((s) => Number(s.toFixed(2))).join('/') + '（N=10/50/200）');
console.log('ratio_200_50=' + Number((rows[3].bytes / rows[2].bytes).toFixed(3)) + '（线性 ≈ 4）');
console.log('superlinear=' + superlinear);
console.log('recommendation=' + (superlinear ? 'open_incremental_snapshot_gate' : 'not_done_until_superlinear'));
console.log('measured=true');
