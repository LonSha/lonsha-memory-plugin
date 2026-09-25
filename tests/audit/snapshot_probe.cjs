/* 快照外供面缩放取证探针（P-3）—— 合成数据 + 真方法体，非实机。
 *
 * 为什么要有它：`buildBridgeSnapshot()` 是全仓**唯一**的对外读数出口，
 *   而它此前从没有过任何规模读数 —— 「快照随内容长多大、克隆要多久」
 *   全凭印象。本探针只回答两件事：
 *     ① 快照**负载字节**随各面条数的缩放（selfBytes）；
 *     ② 构造一次的耗时随条数的缩放（deep 克隆 + JSON.stringify 自述）。
 *   不问「该不该瘦身」——那是拿读数之后的决策，本版只取证。
 *
 * 口径纪律（两条，都是 O-5 换来的）：
 *   · setup 不计时：造数据（造 N 个角色 / 造 N 条生活详情）一律在计时区之外；
 *   · 每组独立实例：避免上一组的深拷贝结果被这一组复用。
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const idxSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');

/** 提取类方法体（花括号计数）——与 tests/v3212 同款，不手抄源码。 */
function extractMethod(source, name) {
    const marker = name + '() {';
    const start = source.indexOf(marker);
    if (start < 0) return null;
    const bodyStart = source.indexOf('{', start);
    let depth = 0, end = -1;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > 0 ? source.slice(start, end + 1) : null;
}

const snapBody = extractMethod(idxSrc, 'buildBridgeSnapshot');
if (!snapBody) { console.error('extract-failed: buildBridgeSnapshot'); process.exit(2); }

const win = { SillyTavern: { getContext: () => ({ chat: [{}, {}, {}] }) } };
const makeProto = new Function('VERSION', 'errLog', 'window', `return ({ ${snapBody} });`);

function chars(n) {
    const out = {};
    for (let i = 0; i < n; i++) {
        out['角色' + i] = { name: '角色' + i, affinity: i % 100, tags: ['a', 'b'], notes: '备注'.repeat(3) };
    }
    return out;
}
function life(n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push({ tier: 'normal', text: '事件' + i, at: i, kind: 'life' });
    return out;
}
function scene(n) {
    const rows = [];
    for (let i = 0; i < n; i++) rows.push({ floor: i, path: ['城A', '街' + i], present: ['角色' + (i % 7)] });
    return { summary: () => ({ presence: rows, coverage: { rows: n }, invariants: { ok: true } }) };
}
function bigArray(n, mk) { const a = []; for (let i = 0; i < n; i++) a.push(mk(i)); return a; }

/** 造宿主：N = 角色数；L = 生活详情数；S = 场景行数 */
function mkHost(N, L, S) {
    const proto = makeProto('probe-version', () => {}, win);
    const h = Object.assign({}, proto);
    h.status = {
        getProtagonist: () => ({ name: '主角', money: 1000, tags: ['x'] }),
        lifeDetails: life(L),
        characters: chars(N)
    };
    h.moneyLedger = { export: () => ({ entries: bigArray(20, (i) => ({ at: i, delta: i })) }) };
    h.outline = { export: () => ({ arcs: bigArray(10, (i) => ({ id: i, title: 'arc' + i })) }) };
    h.worldProg = { export: () => ({ nodes: bigArray(10, (i) => ({ id: i })) }) };
    h.clock = { export: () => ({ day: 3 }), _worldLedgerRead: { gaps: [], positions: [] } };
    h.scene = scene(S);
    h._summarizeRecallAudit = () => ({ top: bigArray(5, (i) => ({ k: 'k' + i })) });
    h.buildInjectionReadout = () => ({ round: 1, blocks: bigArray(10, (i) => ({ id: i, kept: true })) });
    h._evidenceWorkbench = () => ({ ledgers: bigArray(9, (i) => ({ id: 'L' + i, rows: bigArray(5, (i2) => i2) })) });
    return h;
}

/** setup 不计时：先造好 reps 个独立宿主，再只计时被测调用。 */
function time(label, setup, read, reps) {
    const hosts = [];
    for (let i = 0; i < reps; i++) hosts.push(setup());
    const t0 = process.hrtime.bigint();
    let acc = 0;
    for (let i = 0; i < reps; i++) acc += read(hosts[i]) || 0;
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    return { label, per_op_ms: +(ms / reps).toFixed(3), reps, acc };
}

const rows = [];
const BYTES = {};

function group(tag, N, L, S, reps) {
    const t = time(tag, () => mkHost(N, L, S), (h) => {
        const s = h.buildBridgeSnapshot();
        BYTES[tag] = s.meta.selfBytes;
        return s.meta.selfBytes;
    }, reps);
    rows.push(t);
}

/* ① 角色数缩放（只动 characters，其余固定） */
group('N=100  角色 / L=50 / S=50', 100, 50, 50, 8);
group('N=400  角色 / L=50 / S=50', 400, 50, 50, 5);
group('N=1600 角色 / L=50 / S=50', 1600, 50, 50, 3);
/* ② 生活详情数缩放 */
group('N=100  角色 / L=200 / S=50', 100, 200, 50, 8);
group('N=100  角色 / L=800 / S=50', 100, 800, 50, 5);
/* ③ 场景行数缩放 */
group('N=100  角色 / L=50 / S=200', 100, 50, 200, 5);
group('N=100  角色 / L=50 / S=800', 100, 50, 800, 3);
/* ④ 全空宿主（最省的一档：所有面 present=false） */
{
    const proto = makeProto('probe-version', () => {}, win);
    const hosts = []; for (let i = 0; i < 20; i++) hosts.push(Object.assign({}, proto));
    const t0 = process.hrtime.bigint();
    let bytes = 0;
    for (let i = 0; i < 20; i++) bytes = hosts[i].buildBridgeSnapshot().meta.selfBytes;
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    rows.push({ label: '空宿主（八面全部 present=false）', per_op_ms: +(ms / 20).toFixed(3), reps: 20, acc: bytes });
    BYTES['空宿主'] = bytes;
}

/* ⑤ 逐面字节账：谁最重（只回答「哪一面在占地方」，不回答「该不该砍」） */
const FACE_FIELDS = ['protagonist', 'lifeDetails', 'characters', 'moneyLedger', 'outline', 'worldProg',
    'clock', 'recallAudit', 'worldLedgerRead', 'scene', 'projection', 'evidence', 'injection'];
const faceBytes = {};
{
    const h = mkHost(400, 50, 50);
    const snap = h.buildBridgeSnapshot();
    const selfBytes = snap.meta.selfBytes;
    for (const f of FACE_FIELDS) {
        const v = snap[f];
        let n = 0;
        if (v !== undefined) { try { const s = JSON.stringify(v); n = typeof s === 'string' ? s.length : 0; } catch (_e) { n = -1; } }
        faceBytes[f] = { bytes: n, pct: selfBytes ? +(n * 100 / selfBytes).toFixed(1) : 0 };
    }
    faceBytes.__meta = { bytes: (() => { try { return JSON.stringify(snap.meta).length; } catch (_e) { return -1; } })(), pct: 0 };
    faceBytes.__fixedFloorBridgeVersion = {
        bytes: selfBytes - Object.entries(faceBytes).filter(([k]) => !k.startsWith('__')).reduce((a, [, v]) => a + Math.max(0, v.bytes), 0),
        pct: 0
    };
}

/* ⑥ 两段成本拆解：若真要优化，该动哪一段（克隆段 / 自述段） */
const costSplit = (() => {
    const proto = makeProto('probe-version', () => {}, win);
    // 克隆段：只做深克隆（与 deep() 同款：structuredClone 优先）
    const deep = (v) => {
        if (v === undefined) return undefined;
        try { return (typeof structuredClone === 'function') ? structuredClone(v) : JSON.parse(JSON.stringify(v)); }
        catch (e) { try { return JSON.parse(JSON.stringify(v)); } catch (e2) { return null; } }
    };
    const reps = 20;
    const hosts = []; for (let i = 0; i < reps; i++) hosts.push(mkHost(400, 50, 50));
    // 段一：13 面全量深克隆
    let t = process.hrtime.bigint();
    const clones = [];
    for (let i = 0; i < reps; i++) {
        const h = hosts[i];
        clones.push({
            p: deep(h.status.getProtagonist()), l: deep(h.status.lifeDetails), c: deep(h.status.characters),
            m: deep(h.moneyLedger.export()), o: deep(h.outline.export()), w: deep(h.worldProg.export()),
            k: deep(h.clock.export()), r: deep(h._summarizeRecallAudit()), wl: deep(h.clock._worldLedgerRead),
            s: deep(h.scene.summary()), i: deep(h.buildInjectionReadout()), e: deep(h._evidenceWorkbench())
        });
    }
    const cloneMs = +(Number(process.hrtime.bigint() - t) / 1e6 / reps).toFixed(3);
    // 段二：对已克隆负载做 JSON.stringify（＝快照自述段的成本，snap 主体）
    t = process.hrtime.bigint();
    let bytes = 0;
    for (let i = 0; i < reps; i++) bytes = JSON.stringify(clones[i]).length;
    const stringifyMs = +(Number(process.hrtime.bigint() - t) / 1e6 / reps).toFixed(3);
    // 端到端（对照）
    t = process.hrtime.bigint();
    for (let i = 0; i < reps; i++) hosts[i].buildBridgeSnapshot();
    const e2eMs = +(Number(process.hrtime.bigint() - t) / 1e6 / reps).toFixed(3);
    return { label: 'N=400 角色（同一档下的两段拆解）', clone_ms: cloneMs, stringify_ms: stringifyMs, e2e_ms: e2eMs, payload_bytes: bytes };
})();

console.log(JSON.stringify({
    synth: true,
    note: '合成数据 + 真方法体（非实机；无浏览器无宿主）',
    bytes: BYTES,
    rows,
    faceBytes,
    costSplit
}, null, 1));
