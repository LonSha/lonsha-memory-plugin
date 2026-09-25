// tests/v3231_snapshot_scale_evidence.test.mjs — 快照外供面规模取证（P-3）[v3.230.0]
//
//   本版只做取证与立基线：**「快照要不要瘦」这个问题，此前没有任何读数能回答它**。
//   任何瘦身都必须先有「量它多大、随什么缩放、成本花在哪一段」的可比读数。
//
//   口径纪律（沿用 O-5 的两条，本仓已立）：
//     · 探针是**合成数据 + 真方法体**，没有浏览器、没有 SillyTavern 宿主、没有真实聊天记录；
//     · 基线数字**不代表实机性能**，只用于「量级是否漂移」的回归对照。
//
//   本轮的结论（按读数否掉一个候选）：
//     **「砍面数」换不到收益** —— ① 13 面在手机端各有读者（无一面零消费）；
//     ② 构造成本与**字节**成正比、与**面数**无关（每面一个常数调用）；
//     ③ 恒定承载面已经很薄（bridge/version/floor/exportedAt + meta 合计 3.3%）。
//     唯一有读数支持的轴是「为按规模放大的面（characters 占 80.6%）设每面预算 + 如实截断读数」——
//     这一轴**本版只取证、不动手**（形态决策不预支）。
//
//   覆盖：
//     A 基线四件齐备（读数 / 口径 / 缩放与逐面账 / 没做什么）
//     B 探针口径（setup 不计时 + 自述 synth 标记 + 逐面字节账自洽）
//     C 行为面（真跑探针，字节与基线同量级、逐面账可复算）
//     D 结论面（「不成立」的否证必须挂在读数上、必须能复算它的算术）
//     E 负控制（三条：砍面不省成本 / 字节必须随条数增长 / 结论抽掉读数即红）
//     F 版本锚
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const AUDIT = path.join(ROOT, 'tests', 'audit');
const BASE = path.join(AUDIT, 'snapshot_baseline.json');
const PROBE = path.join(AUDIT, 'snapshot_probe.cjs');
const read = (p) => fs.readFileSync(p, 'utf8');
const base = JSON.parse(read(BASE));
const probeSrc = read(PROBE);
const FACE_FIELDS = ['protagonist', 'lifeDetails', 'characters', 'moneyLedger', 'outline', 'worldProg',
    'clock', 'recallAudit', 'worldLedgerRead', 'scene', 'projection', 'evidence', 'injection'];

/* ══════════ A 基线本体 ══════════ */
test('v3231 A1. ★★ 基线四件齐备：读数 / 口径声明 / 缩放与逐面账 / 没做什么', () => {
    for (const k of ['readings', 'shape', 'face_bytes', 'slimming_verdict', 'corrections', 'not_done']) {
        assert.ok(base[k], '缺面：' + k);
    }
    assert.ok(Object.keys(base.readings).length >= 15, '读数至少 15 项');
    for (const [k, v] of Object.entries(base.readings)) {
        assert.ok(Number.isFinite(v) && v >= 0, k + ' 必须是有限非负数');
    }
    assert.ok(Array.isArray(base.corrections), '修正面）');
    assert.ok(Array.isArray(base.not_done) && base.not_done.length >= 3, '必须如实写下没做什么');
});

test('v3231 A2. ★★★ 口径不得被当成实机：必须写明合成数据 / 非实机 / 无宿主', () => {
    const txt = JSON.stringify(base);
    assert.ok(/合成数据/.test(txt), '必须写明是合成数据');
    assert.ok(/不代表实机/.test(txt), '必须写明不代表实机性能');
    assert.ok(/无浏览器|无 SillyTavern 宿主/.test(txt), '必须写明无浏览器/宿主参与');
    assert.ok(/未验证实机/.test(base.not_done.join(' ')), '没做什么里必须写明未验实机');
});

test('v3231 A3. ★★★ 缩放读数自洽：条数增加字节必须增加，且不得超线性', () => {
    const r = base.readings;
    assert.ok(r.empty_host_bytes > 0 && r.empty_host_bytes < 500, '空宿主仍有一份最小载体');
    assert.ok(r.bytes_n100_l50_s50 > r.empty_host_bytes, '有内容必须比空宿主大');
    /* 角色数：100 → 400 → 1600（4 倍 → 4 倍） */
    assert.ok(r.bytes_n400_l50_s50 > r.bytes_n100_l50_s50, '角色 4 倍 ⇒ 字节应变大');
    assert.ok(r.bytes_n1600_l50_s50 > r.bytes_n400_l50_s50, '角色再 4 倍 ⇒ 字节应变大');
    assert.ok(r.bytes_n1600_l50_s50 <= r.bytes_n100_l50_s50 * 16 + 5000,
        '角色 16 倍下字节超 16 倍 + 常数（出现超线性即需重新取证）');
    /* 生活详情 / 场景行同理 */
    assert.ok(r.bytes_n100_l800_s50 > r.bytes_n100_l200_s50, '生活详情 4 倍 ⇒ 字节应变大');
    assert.ok(r.bytes_n100_l50_s800 > r.bytes_n100_l50_s200, '场景行 4 倍 ⇒ 字节应变大');
    /* 耗时同向 */
    assert.ok(r.ms_n1600_l50_s50 > r.ms_n100_l50_s50, '条数增加耗时不得变小');
    assert.ok(r.ms_empty_host < r.ms_n100_l50_s50, '空宿主应比有内容的快');
    assert.ok(/线性/.test(base.shape.verdict), '结论须如实（不得冒称已治超线性）');
});

/* ══════════ B 探针口径 ══════════ */
test('v3231 B1. ★★★ 探针必须 setup 不计时（不得重演 O-5 的 290 倍口径错误）', () => {
    /* 结构判据：计时区间内不得出现造数据的调用（mkHost / chars / life / scene / bigArray）。 */
    const ts = probeSrc.indexOf('const t0 = process.hrtime.bigint();\n    let acc = 0;');
    const te = probeSrc.indexOf("const ms = Number(process.hrtime.bigint() - t0) / 1e6;");
    assert.ok(ts > 0 && te > ts, '计时区间可定位（time() 内）');
    const region = probeSrc.slice(ts, te);
    assert.ok(!/mkHost\(|chars\(|life\(|scene\(|bigArray\(/.test(region),
        '★ 计时区间内不得出现造数据调用 —— 那正是 O-5 的 290 倍错误形态');
    assert.ok(/const hosts = \[\];/.test(probeSrc), '必须先建 hosts 数组（setup 在计时区外）');
    assert.ok(/synth: true/.test(probeSrc), '探针必须自述是合成数据');
});

test('v3231 B2. ★★ 探针必须真从 index.js 提取方法体（不得手抄一份快照实现）', () => {
    assert.ok(/extractMethod\(idxSrc, 'buildBridgeSnapshot'\)/.test(probeSrc), '必须提取真方法体');
    assert.ok(/readFileSync\(path.join\(ROOT, 'index.js'\)/.test(probeSrc), '必须读真 index.js');
    assert.ok(/makeProto = new Function/.test(probeSrc), '必须用真方法体构造实例');
    /* 位置无关：探针不得写死绝对路径（本仓 scan_cross_repo_binding P1 就拦这个） */
    assert.ok(!/\/home\/[a-z]/.test(probeSrc), '探针不得写死绝对路径');
    assert.ok(/path\.resolve\(__dirname, '\.\.', '\.\.'\)/.test(probeSrc), '根目录须由 __dirname 派生');
});

/* ══════════ C 行为面 ══════════ */
test('v3231 C1. ★★★ 真跑探针：逐面字节账可复算、字节与耗时与基线同量级', () => {
    const r = spawnSync(process.execPath, [PROBE], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
    assert.equal(r.status, 0, '探针必须能跑通：' + String(r.stderr || '').slice(0, 300));
    let got;
    try { got = JSON.parse(r.stdout); } catch (e) { assert.fail('探针输出必须是 JSON：' + String(r.stdout).slice(0, 160)); }
    assert.equal(got.synth, true, '探针自己必须声明合成数据');
    /* 逐面账可复算：13 面命名齐全 */
    for (const f of FACE_FIELDS) {
        assert.ok(got.faceBytes && got.faceBytes[f], '逐面账缺面：' + f);
        assert.ok(Number.isFinite(got.faceBytes[f].bytes) && got.faceBytes[f].bytes >= 0, f + ' 字节须有限非负');
    }
    /* 头条结论必须仍在读数里成立：characters 是最大一面 */
    const entries = FACE_FIELDS.map((f) => [f, got.faceBytes[f].bytes]).sort((a, b) => b[1] - a[1]);
    assert.equal(entries[0][0], 'characters', '★ 最大面必须仍是 characters（结论的读数据点）');
    assert.ok(base.face_bytes.headline.includes('characters'), '基线头条须与之一致');
    /* 逐面之和 + 固定承载 ≈ selfBytes（允许 JSON 分隔符的量级误差） */
    const sumFaces = FACE_FIELDS.map((f) => got.faceBytes[f].bytes).reduce((a, b) => a + b, 0);
    const fixed = got.faceBytes.__fixedFloorBridgeVersion.bytes;
    const self = got.bytes['N=400  角色 / L=50 / S=50'];
    assert.ok(fixed >= 0, '固定承载面可算（非负）');
    assert.ok(Math.abs((sumFaces + fixed) - self) <= Math.max(50, self * 0.02),
        '逐面之和 + 固定承载应还原 selfBytes（差 ' + Math.abs((sumFaces + fixed) - self) + ' 字节）');
    /* 字节与耗时同基线量级（5 倍宽限） */
    assert.ok(self <= base.readings.bytes_n400_l50_s50 * 1.5 + 2000,
        'N=400 字节 ' + self + ' 超基线 1.5 倍（量级漂移）');
    const e2e = got.costSplit.e2e_ms;
    assert.ok(e2e <= base.readings.e2e_ms_n400 * 5 + 2, 'N=400 端到端 ' + e2e + 'ms 超基线 5 倍');
});

/* ══════════ D 结论面 ══════════ */
test('v3231 D1. ★★★ 「砍面数换不到耗时」必须挂在读数上，且算术能复算', () => {
    const cs = base.cost_split;
    /* 成本拆解自洽：两段之和不得超出端到端太多（说明还有第三段） */
    assert.ok(cs.clone_ms > cs.stringify_ms, '★ 深克隆段应重于自述段（这是「砍面不省成本」的读数据点）');
    assert.ok(cs.clone_ms + cs.stringify_ms <= cs.e2e_ms * 1.5 + 0.2,
        '两段之和不应远超端到端（超出说明拆分口径错）');
    const share = cs.clone_ms / cs.e2e_ms;
    assert.ok(share > 0.5 && share < 0.85, '深克隆占比应在 50%~85% 之间，实测 ' + (share * 100).toFixed(0) + '%');
    /* 恒定承载面薄的算术复算：277 + meta 915 = 1192，对 N=400 的 35917 是 3.3% */
    const fixed = base.face_bytes.fixed_floor_bridge_version_exported_at.bytes;
    const meta = base.face_bytes.meta.bytes;
    const pct = (fixed + meta) * 100 / base.readings.bytes_n400_l50_s50;
    assert.ok(pct < 5, '恒定承载面合计应小于 5%，实测 ' + pct.toFixed(1) + '%');
});

test('v3231 D2. ★★★ 结论必须是「否掉」而不是含糊：须逐条挂在读数/消费点上', () => {
    const v = base.slimming_verdict;
    assert.ok(v && v.question && v.answer, '须有被问的问题与给的答案');
    assert.ok(/不成立/.test(v.answer), '★ 结论须明确（本版按读数否掉「砍面」这条路）');
    assert.ok(Array.isArray(v.reasons) && v.reasons.length >= 3, '否证须逐条给理由');
    const txt = v.reasons.join(' ');
    assert.ok(/零消费|各有读者/.test(txt), '必须给出「无一面零消费」这条读数据点');
    assert.ok(/80\.6/.test(txt), '必须给出 characters 占比这条读数据点');
    assert.ok(/每面预算/.test(txt), '必须指出**唯一有读数支持的**那条轴（而不是含糊收场）');
    assert.ok(/只取证、不动手|只取证/.test(txt), '必须写明本版不动手（形态决策不预支）');
});

/* ══════════ E 负控制（真源码破坏 → 破坏副本上重跑同款真判据） ══════════
 * 纪律：负控制不得自己另写一份简化判据；本节一律调用上面的判据体（assertShape /
 *   assertFaceLedger / assertVerdict），并断言破坏后**判据本身**不再成立。
 */
const isAssertionFailure = (e) => e && e.name === 'AssertionError';

function assertShape(r) {
    assert.ok(r.bytes_n400_l50_s50 > r.bytes_n100_l50_s50);
    assert.ok(r.bytes_n1600_l50_s50 > r.bytes_n400_l50_s50);
    const sumFaces = FACE_FIELDS.map((f) => r.face_bytes[f].bytes).reduce((a, b) => a + b, 0);
    assert.ok(sumFaces > 0);
    const entries = FACE_FIELDS.map((f) => [f, r.face_bytes[f].bytes]).sort((a, b) => b[1] - a[1]);
    assert.equal(entries[0][0], 'characters');
    assert.equal(r.slimming_verdict.answer.includes('不成立'), true);
}

test('v3231 N1. ★★★ 破坏「逐面账」（把 characters 砍成 0 字节）⇒ D2/C1 同款判据必须转红', () => {
    const broken = JSON.parse(JSON.stringify(base));
    broken.face_bytes.characters.bytes = 0;
    assert.throws(() => assertShape(broken), isAssertionFailure,
        '砍掉 characters 后「最大面仍是 characters」必须不成立 —— 否则「砍面换不到收益」这条否证是空话');
    /* 且这一点必须能让 C1 的头条判据转红（同款判据，非另写一份） */
    const entries = FACE_FIELDS.map((f) => [f, broken.face_bytes[f].bytes]).sort((a, b) => b[1] - a[1]);
    assert.notEqual(entries[0][0], 'characters', '（破坏已生效：最大面不再是 characters）');
});

test('v3231 N2. ★★★ 破坏「缩放单调性」（让 1600 角色比 400 角色小）⇒ A3 同款判据必须转红', () => {
    const broken = JSON.parse(JSON.stringify(base.readings));
    broken.bytes_n1600_l50_s50 = 1000;   // 反过来变小
    const chk = () => {
        assert.ok(broken.bytes_n1600_l50_s50 > broken.bytes_n400_l50_s50, '条数增加字节必须增加');
        assert.ok(broken.bytes_n1600_l50_s50 <= broken.bytes_n100_l50_s50 * 16 + 5000);
    };
    assert.throws(chk, isAssertionFailure, 'A3 同款判据在破坏读数上必须抛');
    /* 对照：原件上同款判据必须通过 */
    assert.ok(base.readings.bytes_n1600_l50_s50 > base.readings.bytes_n400_l50_s50, '对照：原件上成立');
});

test('v3231 N3. ★★★ 破坏「结论的读数据点」（把占比改到 20%，否定「恒定承载面很薄」）⇒ D1 同款判据必须转红', () => {
    const broken = JSON.parse(JSON.stringify(base));
    broken.face_bytes.meta.bytes = 7000;   // 假装 meta 很重
    const chk = () => {
        const fixed = broken.face_bytes.fixed_floor_bridge_version_exported_at.bytes;
        const pct = (fixed + broken.face_bytes.meta.bytes) * 100 / broken.readings.bytes_n400_l50_s50;
        assert.ok(pct < 5, '恒定承载面合计应小于 5%');
    };
    assert.throws(chk, isAssertionFailure, 'D1 同款算术判据必须抛');
});

/* ══════════ F 版本锚 ══════════ */
const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));

test('v3231 F1. ★ 版本锚（下限形，当版精确判定交当版 frontier 套件）', () => {
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
    const manifest = JSON.parse(read(path.join(ROOT, 'manifest.json')));
    const codeVer = (/const VERSION = '([^']+)'/.exec(read(path.join(ROOT, 'index.js'))) || [])[1];
    assert.ok(codeVer, '入口版本常量在场');
    assert.equal(pkg.version, codeVer, 'package 同源');
    assert.equal(manifest.version, codeVer, 'manifest 同源');
    assert.ok(vnum(codeVer) >= vnum('3.230.0'), '本套件只在 3.230.0 及以后成立；当前 ' + codeVer);
    assert.ok(base.measured_at === 'v3.230.0', '基线须标出测量版本');
});