#!/usr/bin/env node
/* ============================================================
 * tools/rebind_probe_baselines.mjs — 探针型冻结读数的重绑器
 * ------------------------------------------------------------
 * 【为什么需要这一件】
 *   本仓三份冻结读数（perf / snapshot / scale_archive）历来只能「跑一次探针、
 *   把数字抄进 JSON」。抄写就是手抄，而手抄必然与现场漂移 —— 本仓已为这类欠账
 *   付过代价（freshness 台账把 6 份读数判成 expired，原因正是「没人重跑、只改台账」）。
 *   这里把「跑探针 → 映射字段 → 盖章 → 写盘」固化成一次可复算的生成，
 *   判据只需比对数值本身，不再依赖人记得。
 *
 * 【口径纪律（不放松任何一条）】
 *   · `measured_at` 只在**真跑过探针**且版本与 package.json / index.js 同版时前移；
 *   · 旧读数不覆盖、不抹掉：逐条进 `rebinds` 历史（同 host_beast_baseline 的做法）；
 *   · 探针失败 / 数字非有限 / 版本不同源 一律 exit 2，绝不写盘；
 *   · 探针自述的「合成数据 / 非实机」口径原样保留，不因重绑而消失。
 *
 * 用法：
 *   node tools/rebind_probe_baselines.mjs            # 重绑三份（真跑探针）
 *   node tools/rebind_probe_baselines.mjs --check    # 只跑不写（打印差异）
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIT = path.join(ROOT, 'tests', 'audit');
const CHECK = process.argv.includes('--check');
const die = (m) => { console.error('[rebind] FAIL ' + m); process.exit(2); };
const idx = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const vm = /const VERSION = '([0-9]+\.[0-9]+\.[0-9]+)'/.exec(idx);
if (!vm) die('index.js 里读不到 const VERSION');
const VERSION = vm[1];
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (String(pkg.version) !== VERSION) die('package.json ' + pkg.version + ' ≠ index.js ' + VERSION);
const NODE = process.version;
const runProbe = (rel) => {
    let out;
    try {
        out = execFileSync(process.execPath, [path.join(ROOT, rel)], { cwd: ROOT, encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
    } catch (e) { die('探针失败：' + rel + ' —— ' + (e && e.message)); }
    return out;
};
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(AUDIT, rel), 'utf8'));
const writeJson = (rel, obj) => fs.writeFileSync(path.join(AUDIT, rel), JSON.stringify(obj, null, 2) + '\n', 'utf8');
const fin = (v, what) => { const n = Number(v); if (!Number.isFinite(n) || n < 0) die('读数非有限：' + what + ' = ' + v); return n; };
const hist = (obj, readings) => {
    const h = obj.rebinds = obj.rebinds || {};
    h['v' + VERSION] = { node_version: NODE, at: new Date().toISOString(), readings };
};
/* ---------- ① perf_baseline ---------- */
function rebindPerf() {
    const p = JSON.parse(runProbe('tests/audit/perf_probe.cjs'));
    const pick = (re) => { const r = (p.rows || []).find((x) => re.test(String(x.label))); if (!r) die('perf 探针缺档位 ' + re); return fin(r.per_op_ms, String(re)); };
    const readings = {
        scene_book_build_1000_floors_ms: fin(p.scene_book_build_1000_ms, 'scene_book_build'),
        scene_book_summary_1000_floors_ms: fin(p.summary_1000_floor_ms, 'scene_book_summary'),
        replay_shift_1000_floors_ms: pick(/replayShift\s+1000/),
        replay_drop_1000_floors_ms: pick(/replayDrop\s+1000/),
        coverage_1000_floors_ms: pick(/coverage\(\)\s+1000/),
        replay_shift_200_floors_ms: pick(/replayShift\s+200/),
        coverage_200_floors_ms: pick(/coverage\(\)\s+200/),
    };
    const base = readJson('perf_baseline.json');
    const before = base.readings;
    base.readings = readings;
    base.measured_at = 'v' + VERSION;
    base.node_version = NODE;
    hist(base, readings);
    return { rel: 'perf_baseline.json', base, before, readings };
}
/* ---------- ② snapshot_baseline ---------- */
function rebindSnapshot() {
    const p = JSON.parse(runProbe('tests/audit/snapshot_probe.cjs'));
    const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
    const byLabel = (map, re) => {
        const key = Object.keys(map || {}).find((k) => re.test(norm(k)));
        if (key === undefined) die('snapshot 探针缺档位 ' + re);
        return { key, value: map[key] };
    };
    const b = p.bytes || {};
    const r = {};
    for (const x of (p.rows || [])) r[norm(x.label)] = x.per_op_ms;
    const R = { ...(readJson('snapshot_baseline.json').readings) };
    const slots = [
        ['bytes_n100_l50_s50', 'ms_n100_l50_s50', /N=100 角色 \/ L=50 \/ S=50/],
        ['bytes_n400_l50_s50', 'ms_n400_l50_s50', /N=400 角色 \/ L=50 \/ S=50/],
        ['bytes_n1600_l50_s50', 'ms_n1600_l50_s50', /N=1600 角色 \/ L=50 \/ S=50/],
        ['bytes_n100_l200_s50', 'ms_n100_l200_s50', /N=100 角色 \/ L=200 \/ S=50/],
        ['bytes_n100_l800_s50', 'ms_n100_l800_s50', /N=100 角色 \/ L=800 \/ S=50/],
        ['bytes_n100_l50_s200', 'ms_n100_l50_s200', /N=100 角色 \/ L=50 \/ S=200/],
        ['bytes_n100_l50_s800', 'ms_n100_l50_s800', /N=100 角色 \/ L=50 \/ S=800/],
    ];
    for (const [bk, mk, re] of slots) {
        const hit = byLabel(b, re);
        R[bk] = fin(hit.value, bk);
        const label = Object.keys(r).find((k) => re.test(k));
        if (label === undefined) die('snapshot 探针缺耗时档位 ' + re);
        R[mk] = fin(r[label], mk);
    }
    { const hit = byLabel(b, /^空宿主$/); R.empty_host_bytes = fin(hit.value, 'empty_host_bytes'); }
    {
        const label = Object.keys(r).find((k) => /空宿主/.test(k));
        if (label === undefined) die('snapshot 探针缺空宿主耗时');
        R.ms_empty_host = fin(r[label], 'ms_empty_host');
    }
    const cs = p.costSplit || {};
    R.clone_ms_n400 = fin(cs.clone_ms, 'clone_ms_n400');
    R.stringify_ms_n400 = fin(cs.stringify_ms, 'stringify_ms_n400');
    R.e2e_ms_n400 = fin(cs.e2e_ms, 'e2e_ms_n400');
    const base = readJson('snapshot_baseline.json');
    const before = base.readings;
    base.readings = R;
    base.measured_at = 'v' + VERSION;
    base.node_version = NODE;
    /* 逐面字节账与成本拆解：探针给什么就写什么（判据 C1 要能对它复算）。 */
    if (p.faceBytes) {
        const fb = { note: (base.face_bytes && base.face_bytes.note) || 'N=400 角色档的逐面字节账。' };
        for (const [k, v] of Object.entries(p.faceBytes)) fb[k] = { bytes: fin(v.bytes, 'face ' + k), pct: v.pct };
        if (base.face_bytes && base.face_bytes.headline) fb.headline = base.face_bytes.headline;
        base.face_bytes = fb;
    }
    if (p.costSplit) {
        base.cost_split = { ...(base.cost_split || {}), note: (base.cost_split && base.cost_split.note) || '',
            clone_ms: fin(p.costSplit.clone_ms, 'cost clone'), stringify_ms: fin(p.costSplit.stringify_ms, 'cost stringify'),
            e2e_ms: fin(p.costSplit.e2e_ms, 'cost e2e'), payload_bytes: fin(p.costSplit.payload_bytes, 'cost payload') };
    }
    hist(base, R);
    return { rel: 'snapshot_baseline.json', base, before, readings: R };
}
/* ---------- ③ scale_archive_baseline（探针只打文本，按行解析） ---------- */
function rebindScale() {
    const out = runProbe('tests/audit/_m_o4_probe.mjs');
    const lines = out.split('\n');
    const want = ['snapshot', 'candidate', 'serialize', 'settings'];
    const readings = {};
    const shapes = {};
    for (const name of want) {
        const row = lines.find((l) => l.startsWith(name + '\t'));
        if (!row) die('scale 探针缺行：' + name);
        /* 探针一行里档位是空白分隔（不是制表）：按空白切，再逐格匹配 `N:BB/MMms`。 */
        const cells = row.split(/\s+/).slice(1).filter((c) => /^\d+:\d+B\/\d+ms$/.test(c));
        const rd = {};
        for (const c of cells) {
            const m = /^(\d+):(\d+)B\/(\d+)ms$/.exec(c.trim());
            if (!m) die('scale 档位格式不可解析：' + c);
            rd[m[1]] = m[2] + 'B/' + m[3] + 'ms';
        }
        readings[name] = rd;
        const sl = lines.find((l) => l.includes('slope=') && l.includes('shape=') && lines.indexOf(l) > lines.indexOf(row));
        if (!sl) die('scale 缺斜率行：' + name);
        const g = (re) => { const mm = re.exec(sl); return mm ? mm[1] : null; };
        const slope = (g(/slope=([0-9.,]+)/) || '').split(',').map(Number).filter((n) => Number.isFinite(n));
        shapes[name] = { slope, shape: g(/shape=([a-z]+)/), ratio_5000_to_10000: Number(g(/ratio=([0-9.]+)/)), superlinear: g(/superlinear=(true|false)/) === 'true' };
    }
    const base = readJson('scale_archive_baseline.json');
    const before = base.readings;
    base.readings = readings;
    base.shapes = { ...(base.shapes || {}), ...shapes };
    base.measured_at = 'v' + VERSION;
    base.node_version = NODE;
    hist(base, readings);
    return { rel: 'scale_archive_baseline.json', base, before, readings };
}
const jobs = [rebindPerf, rebindSnapshot, rebindScale];
for (const job of jobs) {
    const r = job();
    const changed = JSON.stringify(r.before) !== JSON.stringify(r.readings);
    console.log('[rebind] ' + r.rel + ' → v' + VERSION + '（' + (changed ? '读数已重测并更新' : '读数与旧值一致，仅前移测量时点') + '）');
    if (!CHECK) writeJson(r.rel, r.base);
}
console.log('[rebind] ' + (CHECK ? 'check 模式：未写盘' : '已写盘') + '（版本 v' + VERSION + ' / ' + NODE + '）');
