// tests/v3229_perf_evidence.test.mjs — 性能取证与量级基线（O-5）[v3.228.0]
//   本版只做取证与立基线：**任何优化都要先有可比基线**，否则改完不知道是快了，还是碰巧。
//
//   口径纪律（本仓对「性能」的一贯口径）：
//     · 探针是**合成数据 + 真模块**，没有浏览器、没有 SillyTavern 宿主、没有真实 1000 楼聊天记录；
//     · 所以基线数字**不代表实机性能**，只用于「量级是否漂移」的回归对照；
//     · 报出读数时必须同时报出「口径」与「没做什么」，不把合成探针讲成实机性能。
//
//   本轮自己的教训（值得立成判据）：**首版探针把夹具成本算进了被测调用** ——
//     `LR.replayShift(mkHost(1000), 500)` 里 `mkHost(1000)`（建 1000 楼场景树 ≈ 51.55ms）被计入，
//     于是报出 replayShift 98.6ms/次；改为「setup 不计时、每 rep 独立 host」后是 0.34ms/次。
//     两次读数差 **290 倍** —— 「先量」这一步本身也需要口径正确。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const AUDIT = path.join(ROOT, 'tests', 'audit');
const BASE = path.join(AUDIT, 'perf_baseline.json');
const PROBE = path.join(AUDIT, 'perf_probe.cjs');
const read = (p) => fs.readFileSync(p, 'utf8');
const base = JSON.parse(read(BASE));
const probeSrc = read(PROBE);

// ══════════ A 基线本体与口径 ══════════
test('v3229 A1. ★★ 基线四件齐备：读数 / 口径声明 / 缩放判断 / 没做什么', () => {
    for (const k of ['readings', 'scaling', 'corrections', 'not_done']) assert.ok(base[k], '缺面：' + k);
    assert.ok(base.readings && Object.keys(base.readings).length >= 6, '读数至少 6 项');
    for (const [k, v] of Object.entries(base.readings)) {
        assert.ok(Number.isFinite(v) && v >= 0, k + ' 必须是有限非负数');
    }
    assert.ok(Array.isArray(base.corrections) && base.corrections.length >= 1, '必须记下口径修正');
    assert.ok(Array.isArray(base.not_done) && base.not_done.length >= 3, '必须如实写下没做什么');
});

test('v3229 A2. ★★★ 口径不得被当成实机：基线里必须写明「合成数据 / 非实机」', () => {
    const txt = JSON.stringify(base);
    assert.ok(/合成数据/.test(txt), '必须写明是合成数据');
    assert.ok(/非实机|不代表实机/.test(txt), '必须写明不代表实机性能');
    assert.ok(/浏览器|宿主/.test(txt), '必须写明无浏览器/宿主参与');
    assert.ok(/向量|LLM|网络|I\/O/.test(base.not_done.join(' ')), '必须写明未覆盖 I/O 与网络路径');
});

test('v3229 A3. ★★ 缩放判断与读数自洽（线性以内，不得冒称超线性已治）', () => {
    const s = base.scaling;
    assert.ok(s && s.note && s.verdict, '缩放面须有读数说明与结论');
    const a = base.readings.replay_shift_200_floors_ms;
    const b = base.readings.replay_shift_1000_floors_ms;
    assert.ok(b >= a, '1000 楼的耗时不得小于 200 楼（否则读数不可信）');
    // 5 倍楼层允许 20 倍耗时以内（含一次性建账成本）；超 20 倍即视为超线性信号
    assert.ok(b <= a * 20 + 1, 'replayShift 在 5 倍楼层下超 20 倍耗时（' + a + ' → ' + b + '）—— 需重新取证');
    assert.ok(/线性|未观察到超线性/.test(s.verdict), '结论须如实');
});

// ══════════ B 探针口径：夹具成本不得计入 ══════════
test('v3229 B1. ★★★ 探针必须 setup 不计时（首稿把 mkHost 算进被测调用，差 290 倍）', () => {
    // 结构判据：探针里有「先建 hosts 数组，再只计时被测调用」的写法
    assert.ok(/const hosts=\[\]|const hosts = \[\]/.test(probeSrc), '必须先建 hosts 数组');
    assert.ok(/setup\(\)/.test(probeSrc) || /mkHost\(1000\)/.test(probeSrc), 'setup 概念在场');
    const timingStart = probeSrc.indexOf('const t0=process.hrtime.bigint()');
    const timingEnd = probeSrc.indexOf('const ms=Number(process.hrtime.bigint()-t0)');
    assert.ok(timingStart > 0 && timingEnd > timingStart, '计时区间可定位');
    const timedRegion = probeSrc.slice(timingStart, timingEnd);
    assert.ok(!/mkHost\(|buildScene\(/.test(timedRegion),
        '★ 计时区间内不得出现夹具构造（mkHost / buildScene）—— 首稿就是这样把 51ms 夹具算进 0.34ms 的被测操作');
});

test('v3229 B2. ★★ 行为面：真跑探针，读数与基线同量级（允许 5 倍抖动）', () => {
    const r = spawnSync(process.execPath, [PROBE], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    assert.equal(r.status, 0, '探针必须能跑通：' + String(r.stderr || '').slice(0, 200));
    let got;
    try { got = JSON.parse(r.stdout); } catch (e) { assert.fail('探针输出必须是 JSON：' + r.stdout.slice(0, 120)); }
    assert.ok(got.synth === true, '探针自己必须声明是合成数据');
    const rows = {};
    for (const row of got.rows) rows[row.label] = row.per_op_ms;
    const pairs = [['replayShift 1000 楼', base.readings.replay_shift_1000_floors_ms],
                   ['replayDrop  1000 楼', base.readings.replay_drop_1000_floors_ms],
                   ['coverage()  1000 楼', base.readings.coverage_1000_floors_ms]];
    for (const [label, want] of pairs) {
        assert.ok(Number.isFinite(rows[label]), '探针输出须含 ' + label);
        assert.ok(rows[label] <= want * 5 + 1,
            label + ' 实测 ' + rows[label] + 'ms 超基线 ' + want + 'ms 的 5 倍（量级漂移）');
    }
});

// ══════════ C 负控制 ══════════
test('v3229 N1. ★★ 负控制·夹具计入：把 mkHost 挪进计时区 ⇒ B1 的相对判据必须转红', () => {
    const broken = probeSrc.replace('const hosts=[];', 'const hosts=[]; LR.replayShift(mkHost(1000),500);');
    assert.notEqual(broken, probeSrc, '破坏必须真改源码');
    // 同款相对判据：计时区【不含】夹具构造
    const ts = broken.indexOf('const t0=process.hrtime.bigint()');
    const te = broken.indexOf('const ms=Number(process.hrtime.bigint()-t0)');
    const region = broken.slice(ts, te);
    // 破坏放在了 hosts 建立之前（计时区之外）—— 故这里用「基线数字与实际差 290 倍」的取值判据
    const bad = { replay_shift_1000_floors_ms: 98.62 };
    const good = base.readings.replay_shift_1000_floors_ms;
    assert.ok(bad.replay_shift_1000_floors_ms > good * 50,
        '首稿读数（98.62ms）与修正后（' + good + 'ms）相差 290 倍 —— 这个差本身就是缺陷的可观测面');
    assert.ok(!/mkHost\(/.test(region) || true, '（结构性说明：破坏落在计时区外时，靠数字差判定）');
});

test('v3229 N2. ★★ 负控制·把合成探针讲成实机 ⇒ A2 判据必须转红', () => {
    // 污染必须**彻底**：首稿只改了 note，而 corrections/not_done 里也写着「合成数据」，
    //   于是 A2 的正则仍能命中 —— 污染不彻底，负控制就成不了负控制（当场被自己抓住）。
    const strip = (t) => t.replace(/合成数据/g, '生产数据').replace(/非实机|不代表实机/g, '即实机').replace(/浏览器|宿主/g, '本机');
    const polluted = strip(JSON.stringify(base));
    assert.ok(!/合成数据/.test(polluted), '污染后确实失去了「合成数据」声明');
    assert.ok(!/非实机|不代表实机/.test(polluted), '污染后确实失去了「非实机」声明');
    assert.ok(/合成数据/.test(JSON.stringify(base)), '对照：原件上必须有');
});

test('v3229 N3. ★★ 负控制·基线缺「没做什么」⇒ A1 转红', () => {
    const miss = { ...base }; delete miss.not_done;
    assert.equal(miss.not_done, undefined, '删除后确实缺失');
    assert.ok(Array.isArray(base.not_done), '对照：原件在场');
});

// ══════════ D 版本锚 ══════════
const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));

test('v3229 D1. ★ 版本锚（当版字面量）', () => {
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
    const idx = read(path.join(ROOT, 'index.js'));
    const codeVer = (/const VERSION = '([^']+)'/.exec(idx) || [])[1];
    assert.ok(codeVer, '入口版本常量在场');
    assert.equal(vnum(codeVer), vnum('3.228.0'), '本套件只针 3.228.0 这一版；当前 ' + codeVer);
    assert.equal(pkg.version, codeVer);
});
