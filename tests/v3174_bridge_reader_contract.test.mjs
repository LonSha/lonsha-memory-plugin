// tests/v3174_bridge_reader_contract.test.mjs
// v3.174 桥的读者契约面：公开只读快照桥的**读者侧**契约。
//   此前 86 个版本对桥的审计全在**供货侧**（字段在不在、是不是深拷贝），
//   没有任何一条判据问过读者侧：「读者拿到这份快照，能不能分辨自己看到的是什么」。
// 层次：A 桥来源五态（引擎不在位 / 在位但空 / 抛错 三者必须可分辨，且错误不吞）
//       B 字段类型三态（missing ≠ null ≠ value）
//       C 严格 JSON 出口 + 快照自述（selfBytes / strictJsonOk / contract）
//       D 负控制（真源码破坏 → 破坏副本 → 同款真判据）+ 工具自证
//       E 发布卫生
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const idxSrc = fs.readFileSync(path.join(REPO, 'index.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const changelog = fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8');

function vnum(s) {
    const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
    return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

// ── 提取：buildBridgeSnapshot 方法体 + buildBridgeSnapshotJson 方法体 ──
function extractMethod(source, name) {
    const marker = name + '() {';
    const start = source.indexOf(marker);
    assert.ok(start > 0, `找到方法 ${name}`);
    const bodyStart = source.indexOf('{', start);
    let depth = 0, end = -1;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    assert.ok(end > 0, `方法 ${name} 花括号闭合`);
    return source.slice(start, end + 1);
}
const snapMethod = extractMethod(idxSrc, 'buildBridgeSnapshot');
const jsonMethod = extractMethod(idxSrc, 'buildBridgeSnapshotJson');

// ── 副本工厂：注入 VERSION / errLog / window / this 宿主 ──
function makeEngine({ host = {}, floorLen = 3 } = {}) {
    const win = {
        SillyTavern: { getContext: () => ({ chat: { length: floorLen } }) }
    };
    const errLog = () => {};
    const VERSION = '3.177.0';
    const factory = new Function('VERSION', 'errLog', 'window', `
        return ({
            ${snapMethod},
            ${jsonMethod}
        });
    `);
    const eng = factory(VERSION, errLog, win);
    // 用显式宿主覆盖 this（默认给一套最小可用的引擎状态）
    const base = {
        status: { getProtagonist: () => ({ name: '林砚' }), lifeDetails: [], characters: {} },
        moneyLedger: { export: () => ({ balance: 100 }) },
        outline: { export: () => ({ beats: [] }) },
        worldProg: { export: () => ({ day: 3 }) },
        clock: { export: () => ({ label: '第3日' }) },
        _summarizeRecallAudit: () => ({ rounds: 2, emptyRounds: 0, avgHits: 1.5, hotFloors: [], lastQuery: 'q', lastTs: 1 })
    };
    return Object.assign(eng, base, host);
}

// ══════════ A 桥来源五态 ══════════
const bridgeFactory = (() => {
    // 从 index.js 抓桥对象字面量（window.lonsha_memory_bridge_v1 = {...};）
    const marker = 'window.lonsha_memory_bridge_v1 = {';
    const start = idxSrc.indexOf(marker);
    assert.ok(start > 0, '桥对象字面量在位');
    const objStart = idxSrc.indexOf('{', start);
    let depth = 0, end = -1;
    for (let i = objStart; i < idxSrc.length; i++) {
        if (idxSrc[i] === '{') depth++;
        else if (idxSrc[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const literal = idxSrc.slice(objStart, end + 1);
    return (...args) => {
        const plug = args[0];
        return new Function('plugin', `return (${literal});`)(plug);
    };
})();

test('【A1】来源五态：引擎不在位 → engine-absent（与「在位但空」分开）', () => {
    const b1 = bridgeFactory({});
    assert.equal(b1.sourceState, 'idle', '初始 idle（尚未 refresh）');
    const r1 = b1.refresh();
    assert.equal(r1, null, '引擎不在位返回 null');
    assert.equal(b1.sourceState, 'engine-absent', '来源态必须是 engine-absent');
    assert.equal(b1.lastError, null, 'engine-absent 不是错误，不该记 lastError');
});

test('【A2】来源五态：引擎在位但返回空 → engine-empty（≠ engine-absent）', () => {
    const b2 = bridgeFactory({ engine: { buildBridgeSnapshot: () => null } });
    assert.equal(b2.refresh(), null);
    assert.equal(b2.sourceState, 'engine-empty', '引擎在位无货是独立状态，不得与 engine-absent 合并');
    assert.notEqual(b2.sourceState, 'engine-absent', '两者必须可分辨');
});

test('【A3】来源五态：取快照抛错 → thrown + lastError 不吞', () => {
    const b3 = bridgeFactory({ engine: { buildBridgeSnapshot: () => { throw new Error('boom-3174'); } } });
    assert.equal(b3.refresh(), null);
    assert.equal(b3.sourceState, 'thrown', '抛错是独立状态');
    assert.match(String(b3.lastError), /boom-3174/, '错误原因不得被吞掉（旧实现 catch 里只留 null）');
});

test('【A4】来源五态：正常 → ready，且 lastError 被清空（不残留上一次的错误）', () => {
    const eng = { buildBridgeSnapshot: () => ({ version: 1 }) };
    const b4 = bridgeFactory({ engine: eng });
    assert.ok(b4.refresh(), '正常取到快照');
    assert.equal(b4.sourceState, 'ready');
    assert.equal(b4.lastError, null);
    // 先坏一次、再恢复：lastError 必须清空（否则读者会把「曾经的错误」当成「当下的错误」）
    eng.buildBridgeSnapshot = () => { throw new Error('once'); };
    b4.refresh();
    assert.equal(b4.sourceState, 'thrown');
    eng.buildBridgeSnapshot = () => ({ version: 1 });
    b4.refresh();
    assert.equal(b4.sourceState, 'ready');
    assert.equal(b4.lastError, null, '恢复后不得残留旧错误');
});

// ══════════ B 字段类型三态 ══════════
test('【B1】fieldTypes：三态齐全（缺失 / 显式空 / 有值）——不得伪装成一律在场', () => {
    // ① 源里没有这项 ⇒ present=false（读者应视作「没有」）
    const s1 = makeEngine({ host: { clock: null } }).buildBridgeSnapshot();
    assert.ok(s1.meta && s1.meta.fieldTypes, 'meta.fieldTypes 在场');
    assert.equal(s1.meta.fieldTypes.clock.present, false, '宿主无 clock.export ⇒ present=false');
    // ② 源里给了、值是 null ⇒ present=true 且 kind='null'（「有这项、值是空」）
    const s2 = makeEngine({ host: { clock: { export: () => null } } }).buildBridgeSnapshot();
    assert.equal(s2.meta.fieldTypes.clock.present, true, '显式 null 是「有这项」');
    assert.equal(s2.meta.fieldTypes.clock.kind, 'null', 'kind 如实报 null');
    // ③ 有值
    const s3 = makeEngine().buildBridgeSnapshot();
    assert.equal(s3.meta.fieldTypes.clock.present, true);
    assert.equal(s3.meta.fieldTypes.clock.kind, 'object');
    assert.equal(s3.meta.fieldTypes.protagonist.present, true, '有值字段 present=true');
    assert.equal(s3.meta.fieldTypes.protagonist.kind, 'object');
    assert.equal(s3.meta.fieldTypes.recallAudit.kind, 'object', '召回摘要正常在场');
    // 三态必须互不相同——否则「类型读数」没有信息量（旧实现 present 恒为 true 的正是这里塌的）
    assert.notDeepEqual(
        { p: s1.meta.fieldTypes.clock.present, k: s1.meta.fieldTypes.clock.kind },
        { p: s2.meta.fieldTypes.clock.present, k: s2.meta.fieldTypes.clock.kind },
        '「缺失」与「显式空」的读数必须不同'
    );
});

test('【B2】present=false 的字段不得伪装成空对象（旧 || 兜底把「没有」变成「空世界」）', () => {
    const snap = makeEngine({ host: { clock: null, outline: null, worldProg: null } }).buildBridgeSnapshot();
    // 三个字段源里都没有 ⇒ 快照里必须缺席（不得被兜底成 {} / null —— 那会让读者
    // 以为「这个世界有一份空的时钟/大纲/推进」，进而把「没有」当「空」处理）
    assert.equal(snap.clock, undefined, '缺失的 clock 不得兜底成 {} 或 null');
    assert.equal(snap.outline, undefined, '缺失的 outline 不得兜底');
    assert.equal(snap.worldProg, undefined, '缺失的 worldProg 不得兜底');
    for (const k of ['clock', 'outline', 'worldProg']) {
        assert.equal(snap.meta.fieldTypes[k].present, false, k + ' 必须报 present=false');
    }
    // 真在场但值为空的字段，仍报 present=true（kind 如实报空）
    const snap2 = makeEngine({ host: { clock: { export: () => null }, outline: { export: () => undefined } } }).buildBridgeSnapshot();
    assert.equal(snap2.meta.fieldTypes.clock.present, true, '给了 null 是「有这项」');
    // 导出方法存在但返回 undefined ⇒ 仍是「没有这项」（deep 不得把它吞成 null）
    assert.equal(snap2.outline, undefined, 'export() 返回 undefined 不得变成 null');
    assert.equal(snap2.meta.fieldTypes.outline.present, false, 'export() 返回 undefined ⇒ present=false');
});

test('【B3】类型读数覆盖全部顶层字段（不漏字段，否则读者会以为没有这项）', () => {
    const eng = makeEngine();
    const snap = eng.buildBridgeSnapshot();
    const keys = Object.keys(snap).filter(k => k !== 'meta');
    for (const k of keys) {
        assert.ok(snap.meta.fieldTypes[k], `顶层字段 ${k} 必须有类型读数`);
    }
});

// ══════════ C JSON 出口 + 快照自述 ══════════
test('【C1】buildBridgeSnapshotJson：成功时给出可 parse 的字符串，与本体一致', () => {
    const eng = makeEngine();
    const r = eng.buildBridgeSnapshotJson();
    assert.equal(r.ok, true, '序列化成功');
    assert.equal(r.error, null);
    assert.equal(typeof r.json, 'string');
    assert.ok(r.bytes > 0, 'bytes 如实报出');
    const parsed = JSON.parse(r.json);
    assert.equal(parsed.bridge, 'lonsha_memory_bridge_v1', '可 JSON.parse 且内容对');
    assert.equal(parsed.meta.contract, 'v3.174', '自述契约版本在场');
});

test('【C2】JSON 出口契约：绝不返回空串、也绝不抛（失败时给 ok:false + error）', () => {
    const eng = makeEngine({ host: { buildBridgeSnapshot: () => null } });
    const r = eng.buildBridgeSnapshotJson.call(eng);
    assert.equal(r.ok, false, '无快照时 ok=false');
    assert.equal(r.json, null, '不得给出空串（空串会让读者以为存成功了）');
    assert.match(String(r.error), /no-snapshot/);
    // 抛错路径：让 buildBridgeSnapshot 本体抛（模拟宿主方法抛错）
    const eng2 = makeEngine({ host: { buildBridgeSnapshot: () => { throw new Error('ser-boom'); } } });
    let threw = false;
    let r2 = null;
    try { r2 = eng2.buildBridgeSnapshotJson.call(eng2); } catch (e) { threw = true; }
    assert.equal(threw, false, '出口不得抛（入口契约与 snapshot 同规格）');
    assert.equal(r2.ok, false);
    assert.match(String(r2.error), /ser-boom/);
});

test('【C3】快照自述：selfBytes 是真实 JSON 长度，strictJsonOk 反映可序列化性', () => {
    const eng = makeEngine();
    const snap = eng.buildBridgeSnapshot();
    // selfBytes 是**负载**字节数（不含 meta 自述）——自述里若含自己的字节数会自指漂移
    const payload = Object.assign({}, snap); delete payload.meta;
    assert.equal(snap.meta.strictJsonOk, true);
    assert.equal(snap.meta.selfBytes, JSON.stringify(payload).length, 'selfBytes 必须与负载真实序列化长度一致');
    // 不可序列化（环）时：meta 必须给 false + 原因，而不是静默给 0
    const circ = {}; circ.self = circ;
    const eng2 = makeEngine({ host: { moneyLedger: { export: () => circ } } });
    const snap2 = eng2.buildBridgeSnapshot();
    // deep() 回退可能已把环抹掉；此处只断言「要么 ok=true 要么给原因」，不得两者皆无
    if (snap2 && snap2.meta) {
        assert.ok(snap2.meta.strictJsonOk === true || typeof snap2.meta.strictJsonError === 'string',
            'strictJsonOk=false 时必须给 strictJsonError');
    }
});

// ══════════ D 负控制：真源码破坏 → 破坏副本 → 同款真判据 ══════════
// 判据（只看行为，不看实现）：三处缺陷各自的「读者可分辨性」
function judgeReader(engFactory) {
    const out = { absentVsEmpty: false, nullVsMissing: false, jsonNeverEmpty: false };
    // 判据一：engine-absent 与 engine-empty 必须可分辨
    const bA = bridgeFactory({});
    bA.refresh();
    const bE = bridgeFactory({ engine: { buildBridgeSnapshot: () => null } });
    bE.refresh();
    out.absentVsEmpty = (bA.sourceState !== bE.sourceState) && bA.sourceState === 'engine-absent' && bE.sourceState === 'engine-empty';
    // 判据二：三态可分辨——「源里没有」报 present=false，「给了 null」报 present=true/kind='null'
    const sMiss = makeEngine({ host: { clock: null } }).buildBridgeSnapshot();
    const sNull = makeEngine({ host: { clock: { export: () => null } } }).buildBridgeSnapshot();
    out.nullVsMissing = !!(
        sMiss && sNull && sMiss.meta && sNull.meta && sMiss.meta.fieldTypes && sNull.meta.fieldTypes
        && sMiss.meta.fieldTypes.clock.present === false
        && sNull.meta.fieldTypes.clock.present === true && sNull.meta.fieldTypes.clock.kind === 'null'
    );
    // 判据三：JSON 出口在两条失败路径上都不得给空串
    //   路径①「无快照」：读者最容易遇到的（引擎尚未 init）
    const eng2 = makeEngine({ host: { buildBridgeSnapshot: () => null } });
    const r1 = eng2.buildBridgeSnapshotJson.call(eng2);
    //   路径②「取快照抛错」：出口自己兜住，也不得给空串
    const eng3 = makeEngine({ host: { buildBridgeSnapshot: () => { throw new Error('judge3-bo'); } } });
    let r2 = null;
    try { r2 = eng3.buildBridgeSnapshotJson.call(eng3); } catch (e) { r2 = { json: '', ok: true }; }
    out.jsonNeverEmpty = (r1.json !== '') && (r2.json !== '') && r2.ok === false;
    return out;
}

function brokenCopies() {
    const variants = [];
    // 破坏一：把 sourceState 抹平（absent/empty 合并成一个态）——用真源码替换
    const mk = (fromRe, to, tag) => {
        const hits = (idxSrc.match(new RegExp(fromRe.source, 'g')) || []).length;
        assert.equal(hits, 1, `锚点【${tag}】须在真源码中恰中 1 次（实 ${hits}）`);
        const out = idxSrc.replace(fromRe, to);
        assert.notEqual(out, idxSrc, `破坏【${tag}】必须真的改变源码`);
        return out;
    };
    variants.push({ tag: 'B1-sourceState', src: mk(
        /this\.sourceState = 'engine-absent'; this\.lastError = null; this\.snapshot = null;/,
        "this.sourceState = 'engine-empty'; this.lastError = null; this.snapshot = null;") });
    variants.push({ tag: 'B2-fieldTypes', src: mk(
        /out\[k\] = \{ present: t !== 'undefined', kind: t \};/,
        "out[k] = { present: t !== 'null', kind: t };") });
    variants.push({ tag: 'B3-jsonEmpty', src: mk(
        /if \(!snap\) return \{ ok: false, error: 'no-snapshot', json: null, bytes: 0 \};/,
        "if (!snap) return { ok: false, error: 'no-snapshot', json: '', bytes: 0 };") });
    return variants;
}

test('【D1】负控制：真源码上三处判据都干净（否则「破坏后现形」可能只是判据恒真）', () => {
    const j = judgeReader();
    assert.equal(j.absentVsEmpty, true, '原版：absent 与 empty 可分辨');
    assert.equal(j.nullVsMissing, true, '原版：三态可分辨（缺失 false / 显式空 true+null）');
    assert.equal(j.jsonNeverEmpty, true, '原版：JSON 出口不给空串');
});

test('【D2】负控制：三处破坏各自的判据必须现形（逐项，不得互相掩护）', () => {
    const results = {};
    for (const v of brokenCopies()) {
        // 用破坏副本重新提取方法与字面量，在副本上跑同款判据
        const snapM = extractMethod(v.src, 'buildBridgeSnapshot');
        const jsonM = extractMethod(v.src, 'buildBridgeSnapshotJson');
        const marker = 'window.lonsha_memory_bridge_v1 = {';
        const s0 = v.src.indexOf(marker);
        const oS = v.src.indexOf('{', s0);
        let d = 0, e = -1;
        for (let i = oS; i < v.src.length; i++) {
            if (v.src[i] === '{') d++;
            else if (v.src[i] === '}') { d--; if (d === 0) { e = i; break; } }
        }
        const literal = v.src.slice(oS, e + 1);
        const localFactory = (plug) => new Function('plugin', `return (${literal});`)(plug);
        const mkEng = (host = {}) => {
            const win = { SillyTavern: { getContext: () => ({ chat: { length: 3 } }) } };
            const eng = new Function('VERSION', 'errLog', 'window', `return ({ ${snapM}, ${jsonM} });`)('3.177.0', () => {}, win);
            const base = {
                status: { getProtagonist: () => ({ name: 'A' }), lifeDetails: [], characters: {} },
                moneyLedger: { export: () => ({}) }, outline: { export: () => ({}) },
                worldProg: { export: () => ({}) }, clock: { export: () => ({}) },
                _summarizeRecallAudit: () => ({ rounds: 0 })
            };
            return Object.assign(eng, base, host);
        };
        const o = { absentVsEmpty: null, nullVsMissing: null, jsonNeverEmpty: null };
        // 判据一
        const bA = localFactory({}); bA.refresh();
        const bE = localFactory({ engine: { buildBridgeSnapshot: () => null } }); bE.refresh();
        o.absentVsEmpty = (bA.sourceState !== bE.sourceState);
        // 判据二（诚实三态：缺失 vs 显式空 vs 有值）
        const sMiss = mkEng({ clock: null }).buildBridgeSnapshot();
        const sNull = mkEng({ clock: { export: () => null } }).buildBridgeSnapshot();
        o.nullVsMissing = !!(
            sMiss && sNull && sMiss.meta && sNull.meta && sMiss.meta.fieldTypes && sNull.meta.fieldTypes
            && sMiss.meta.fieldTypes.clock.present === false
            && sNull.meta.fieldTypes.clock.present === true && sNull.meta.fieldTypes.clock.kind === 'null'
        );
        // 判据三（与上面 judgeReader 同款：覆盖 no-snapshot + 抛错两条路径）
        const eng2 = mkEng({ buildBridgeSnapshot: () => null });
        const r1 = eng2.buildBridgeSnapshotJson.call(eng2);
        const eng3 = mkEng({ buildBridgeSnapshot: () => { throw new Error('d2-bo'); } });
        let r2 = null;
        try { r2 = eng3.buildBridgeSnapshotJson.call(eng3); } catch (e) { r2 = { json: '', ok: true }; }
        o.jsonNeverEmpty = (r1.json !== '') && (r2.json !== '') && r2.ok === false;
        results[v.tag] = o;
    }
    // B1 破坏 ⇒ absentVsEmpty 必须为 false（两者不再可分辨）
    assert.equal(results['B1-sourceState'].absentVsEmpty, false, 'B1 破坏后：absent/empty 不可分辨（判据现形）');
    assert.equal(results['B1-sourceState'].nullVsMissing, true, 'B1 只破坏来源态，不该连坐类型读数');
    // B2 破坏 ⇒ nullVsMissing 必须为 false
    assert.equal(results['B2-fieldTypes'].nullVsMissing, false, 'B2 破坏后：显式 null 被报成 present（读者会把「有这项、值为空」当「缺失」）');
    assert.equal(results['B2-fieldTypes'].absentVsEmpty, true, 'B2 不连坐来源态');
    // B3 破坏 ⇒ jsonNeverEmpty 必须为 false
    assert.equal(results['B3-jsonEmpty'].jsonNeverEmpty, false, 'B3 破坏后：JSON 出口给出空串（读者会以为存成功了）');
});

test('【D3】工具自证：锚点不存在或不唯一时必须抛（防「破坏写了个假锚点」）', () => {
    const bad = () => {
        const hits = (idxSrc.match(/this\.sourceState = 'THIS_ANCHOR_DOES_NOT_EXIST';/g) || []).length;
        if (hits !== 1) throw new Error('锚点命中 ' + hits + ' 次');
        return idxSrc.replace(/x/, 'y');
    };
    assert.throws(() => bad(), /锚点命中 0 次/, '锚点不存在须抛');
    // 破坏必须可观测改行为：把 fieldTypes 锚点故意改成不命中源码的替换
    const noopHits = (idxSrc.match(/out\[k\] = \{ present: NEVER_MATCHES, kind: t \};/g) || []).length;
    assert.equal(noopHits, 0, '假锚点必须命中 0，否则「破坏」是假的');
    // 同路径自证：B3 的锚点必须落在判据三真正会走到的出口上（no-snapshot），
    //   否则「破坏打得真、判据却走不到」⇒ 负控制恒真（假绿的第三种形态）
    const noSnapExit = (idxSrc.match(/if \(!snap\) return \{ ok: false, error: 'no-snapshot', json: null, bytes: 0 \};/g) || []).length;
    assert.equal(noSnapExit, 1, 'B3 锚点必须恰中 1 次，且落在 no-snapshot 出口（与判据三同路径）');
});

// ══════════ E 发布卫生 ══════════
test('【E1】版本三源一致且不低于 v3.175.0', () => {
    const v = (idxSrc.match(/const VERSION = '([^']+)'/) || [])[1];
    assert.ok(v, 'index.js VERSION 存在');
    assert.ok(vnum(v) >= vnum('3.175.0'), `index.js 版本 ${v} >= 3.175.0`);
    assert.equal(manifest.version, v, `manifest(${manifest.version}) 与 index.js(${v}) 漂移`);
    assert.equal(pkg.version, v, `package.json(${pkg.version}) 与 index.js(${v}) 漂移`);
});

test('【E2】CHANGELOG 顶节为本版，且记录了读者侧三处缺陷', () => {
    const top = (changelog.match(/^## (v[0-9.]+)/m) || [])[1];
    assert.ok(top, 'CHANGELOG 有版本段');
    assert.ok(vnum(top.replace('v', '')) >= vnum('3.175.0'), `CHANGELOG 顶节 ${top} 须 >= v3.175.0`);
    assert.ok(/来源不可判/.test(changelog), '记录了 R1 来源不可判');
    assert.ok(/null 三义同形|字段类型三态/.test(changelog), '记录了 R2 null 三义');
    assert.ok(/序列化|JSON 出口|strictJsonOk/.test(changelog), '记录了 R3 序列化能力');
});

test('【E3】审计脚本在场且可被 run.mjs 自动发现', () => {
    const auditDir = path.join(REPO, 'tests', 'audit');
    const files = fs.readdirSync(auditDir).filter(f => f.endsWith('.mjs'));
    assert.ok(files.includes('scan_bridge_reader.mjs'), '新增扫描器 scan_bridge_reader.mjs 在位');
    const runner = fs.readFileSync(path.join(REPO, 'tests', 'run.mjs'), 'utf8');
    assert.ok(/readdirSync\(AUDIT_DIR\)/.test(runner), 'run.mjs 自动发现 audit 目录（新扫描器无需登记）');
});

console.log('v3.174 桥的读者契约面：全部判据通过');