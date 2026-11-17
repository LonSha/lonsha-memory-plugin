/* ============================================================
 * tests/l23_o3_zero_consumption.test.mjs — v3.474.0 · L23-O3
 *   唯一一个零消费模块「接线或归档」，计数真归 0
 * ------------------------------------------------------------
 * 【立项原文】「唯一 1 个零消费模块接线或归档，计数归 0（负控制：注释掉消费点必须翻红）」。
 *
 * 【本项为什么走归档而不是接线（先例已定调）】
 *   L21-O1 已把 floor-fingerprint-self-healer.js 判为 declared_dormant，理由里明写本仓纪律
 *   「不造假消费点（do not add a consumer solely to satisfy the audit）」。O3 不能反过来
 *   为了让计数好看而给它接一个假消费者 —— 那是把账刷绿，不是把账对齐。
 *   剩下的唯一诚实选项是归档：撤出 manifest.extra_js，文件与两层理由留盘。
 *   不接线的实质理由（已核实）：reanchorEvidence 里 |编辑后长度 - 原长度| <= 50 单独就能
 *   返回 healed:true / confidence:0.98 —— 「判不了当判了」，与本仓三态纪律冲突；
 *   而楼层证据锚已有真源 floor-identity / evidence-source-locator。
 *
 * 【本档钉什么】
 *   A 计数面：module_consumption_ledger.zero_consumption_count === 0；
 *     seam 台账 orphan === 0（归档后它既不是零消费、也不是孤儿 —— 它不在装载面上）。
 *   B 归档面：不在 manifest.extra_js；文件仍在盘（未删、未改字节）；
 *     triage 有 archived 桶且理由够长、点名「判据不成立」与真源替代。
 *   C 负控制（5 组，全是纯函数喂假读数）：计数回 1 / 出现孤儿 / 偷塞回 manifest /
 *     理由变短 / 文件被删 —— 五种形态必须各自翻红，否则「归 0」是空转的。
 *
 * 【边界（不吹）】本档只证明「计数与装载面读数归 0，且归档决议可读」；
 *   不证明未来不会有人再接入一份同类能力 —— 那要靠 B 组的不变量在每次改 manifest 时响。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const ARCHIVED = 'floor-fingerprint-self-healer.js';
const MIN_WHY = 120;

const LED = JSON.parse(read('tests/audit/module_consumption_ledger.json'));
const SEAM = read('tests/audit/extra_js_seam_ledger.tsv');
const TRIAGE = JSON.parse(read('tests/audit/l21_o1_triage.json'));
const MF = JSON.parse(read('manifest.json'));
/* modules 在台账里是**字典**（按模块名索引），这里统一成行集，避免判据读错形状而假绿 */
const ROWS = Array.isArray(LED.modules) ? LED.modules : Object.values(LED.modules || {});

/* ---------------- 纯判定体：真读数与假读数走同一条码路 ---------------- */
function judge(input) {
    const { led, rows, seamOrphans, manifest, triage, fileOnDisk } = input;
    const bad = [];
    if (led.zero_consumption_count !== 0) bad.push('零消费计数为 ' + led.zero_consumption_count + '（O3 要求归 0）');
    for (const m of rows || []) {
        if (!m || !m.why) bad.push('台账有条目 why 为空：' + (m && m.module));
    }
    if (seamOrphans !== 0) bad.push('seam 台账 orphan=' + seamOrphans + '（归档后应为 0）');
    if ((manifest.extra_js || []).includes(ARCHIVED)) bad.push('归档模块仍在 manifest.extra_js（那就还是零消费）');
    if (!fileOnDisk) bad.push('归档模块的文件被删了（归档 ≠ 删除，理由要能对上原件）');
    const rec = triage && triage.verdicts && triage.verdicts.archived && triage.verdicts.archived.modules && triage.verdicts.archived.modules[ARCHIVED];
    if (!rec) bad.push('triage 缺 archived 决议（归档必须留终局判定）');
    else {
        const why = String(rec.reason || '');
        if (why.length < MIN_WHY) bad.push('归档理由过短（' + why.length + ' < ' + MIN_WHY + '）：必须写清为什么不接线');
        if (!/判据不成立|判不了当判了/.test(why)) bad.push('归档理由必须点名「自愈判据不成立」');
        if (!/floor-identity|evidence-source-locator/.test(why)) bad.push('归档理由必须点名真源替代（否则读者以为能力丢了）');
    }
    return bad;
}

const REAL = {
    led: LED,
    rows: ROWS,
    seamOrphans: LED.orphan_count != null ? LED.orphan_count : Number((/^orphan\t(\d+)/m.exec(SEAM) || [])[1] ?? 0),
    manifest: MF,
    triage: TRIAGE,
    fileOnDisk: fs.existsSync(path.join(R, ARCHIVED)),
};

/* 取 orphan 真读数（tsv 头里带汇总行，这里从台账正文数） */
function countOrphans() {
    const lines = SEAM.split('\n').filter((l) => l.trim() && !l.startsWith('#') && !/^module\t/.test(l));
    return lines.filter((l) => /\torphan\t/.test(l)).length;
}
REAL.seamOrphans = countOrphans();

/* ══════════════ A. 计数面 ══════════════ */
test('L23O3 A1. ★★★ 零消费计数真归 0；seam orphan 也归 0（归档后两边都不该再数到它）', () => {
    assert.equal(LED.zero_consumption_count, 0, 'zero_consumption_count 必须为 0');
    assert.equal(countOrphans(), 0, 'seam 台账 orphan 必须为 0');
    const zeroRows = ROWS.filter((m) => m && m.why === 'zero_consumption');
    assert.deepEqual(zeroRows.map((m) => m.module), [], '不得再有任何 why=zero_consumption 的行');
    console.log('  ok 零消费 0 / orphan 0 / extra_js ' + MF.extra_js.length);
});

test('L23O3 A2. ★★ 台账无空 why；11 个 load_surface_only 仍是另一件事（不得被本项顺手改掉）', () => {
    assert.equal(LED.load_surface_only_count, 11, 'load_surface_only 仍是 11（那是 L23-O2 的对象，不许被 O3 顺手抹平）');
    const empty = ROWS.filter((m) => m && !m.why).map((m) => m.module);
    assert.deepEqual(empty, [], 'why 为空的条目：' + empty.join(','));
    console.log('  ok load_surface_only 11（O2 的对象／未动）· why 无空值');
});

/* ══════════════ B. 归档面 ══════════════ */
test('L23O3 B1. ★★★ 归档三件齐：撤出装载面 / 文件留盘 / triage 有终局理由', () => {
    assert.deepEqual(judge(REAL), [], judge(REAL).join(';'));
    const rec = TRIAGE.verdicts.archived.modules[ARCHIVED];
    assert.equal(rec.business_call_sites, 0, '归档时它本来就是零业务消费（否则不该归档）');
    assert.ok(Array.isArray(rec.superseded_by) && rec.superseded_by.length >= 2, '必须点名至少两个真源替代');
    console.log('  ok 归档：不在 extra_js · 文件在盘 · 理由 ' + String(rec.reason).length + ' 字');
});

/* ══════════════ C. 负控制（5 组） ══════════════ */
const clone = (o) => JSON.parse(JSON.stringify(o));

test('L23O3 C1. ★★★★ 负控制：计数改回 1 ⇒ 判据必须翻红', () => {
    const led = clone(LED);
    led.zero_consumption_count = 1;
    assert.ok(judge({ ...REAL, led }).some((x) => /零消费计数/.test(x)), '计数回 1 必须被抓');
    console.log('  ok 计数回 1 被抓');
});

test('L23O3 C2. ★★★★ 负控制：seam 出现 orphan ⇒ 判据必须翻红', () => {
    assert.ok(judge({ ...REAL, seamOrphans: 1 }).some((x) => /orphan/.test(x)), '孤儿出现必须被抓');
    console.log('  ok orphan 被抓');
});

test('L23O3 C3. ★★★★ 负控制：偷偷塞回 manifest ⇒ 判据必须翻红（这是本项最容易回退的方式）', () => {
    const manifest = clone(MF);
    manifest.extra_js.push(ARCHIVED);
    assert.ok(judge({ ...REAL, manifest }).some((x) => /仍在 manifest/.test(x)), '塞回装载面必须被抓');
    console.log('  ok 塞回 manifest 被抓');
});

test('L23O3 C4. ★★★ 负控制：理由被改短 ⇒ 判据必须翻红（归档不许退化成一句标签）', () => {
    const triage = clone(TRIAGE);
    triage.verdicts.archived.modules[ARCHIVED].reason = '暂时不用了';
    const bad = judge({ ...REAL, triage });
    assert.ok(bad.some((x) => /理由过短/.test(x)), '短理由必须被抓');
    console.log('  ok 短理由被抓');
});

test('L23O3 C5. ★★★ 负控制：文件被删 ⇒ 判据必须翻红（归档 ≠ 删除）', () => {
    assert.ok(judge({ ...REAL, fileOnDisk: false }).some((x) => /被删/.test(x)), '删文件必须被抓');
    console.log('  ok 删文件被抓');
});
