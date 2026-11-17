/* ============================================================
 * tests/l23_o2_load_surface_zero.test.mjs — v3.474.0 · L23-O2
 *   11 个 load_surface_only 逐个定性，计数归 0
 * ------------------------------------------------------------
 * 【立项原文】「11 个 load_surface_only 逐个定性为 wired 或 declared_dormant，计数归 0，理由禁止『待后续』」。
 *
 * 【定性结果：11 个全部走"被替代"而不是"接线"】
 *   逐条查证（tests/audit/module_disposition_ledger.json）：每一个的 reason_kind 都是
 *   superseded_by_active_duplicate，即它已被 **≥2 个在役模块**覆盖（例：meaning-evolution-map 被
 *   symbolic-evolution + meaning-map 覆盖）。给被替代品接线，等于把同一能力做成两份实现 ——
 *   本仓为此栽过（_moduleLib 同名两份静默覆盖），也是 config-effect-registry 明令禁止的
 *   「为满足审计而造假消费点」。故定性为**归档**：撤出 extra_js，理由与替代方逐条留盘。
 *
 * 【本档钉什么】
 *   A 计数面：load_surface_only_count === 0 且台账里无一行仍标 true；active === total；
 *     seam orphan === 0。
 *   B 归档面：归档集恰 11 个；逐个不在 manifest、文件仍在盘、理由 ≥80 字且非标签；
 *     superseded_by 非空且**全部在役**（business_call_sites > 0）—— 否则「被替代」是假理由。
 *   C 负控制（四组纯函数喂假读数）：计数回 11 / 偷塞回 manifest / 替代方熄火 / 删归档条目。
 *
 * 【边界（不吹）】本档不重新评估那 11 个模块的代码质量；只证明「它们不在装载面、替代方在役、
 *   理由可读」三件可机读的事。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const MIN_WHY = 80;
const GREY = ['load_surface_only', 'zero_consumption', 'dormant', 'unused', 'todo', 'tbd', 'wip', 'pending', 'n/a'];

const LED = JSON.parse(read('tests/audit/module_consumption_ledger.json'));
const DIS = JSON.parse(read('tests/audit/module_disposition_ledger.json'));
const MF = JSON.parse(read('manifest.json'));
const SEAM = read('tests/audit/extra_js_seam_ledger.tsv');
const ROWS = Object.values(LED.modules || {});
const ARCHIVED = Object.keys(DIS.entries || {}).filter((k) => DIS.entries[k].disposition === 'archived');

const isGrey = (w) => { const n = String(w || '').trim().toLowerCase().replace(/[.\s_\-:;]+$/g, ''); return !n || GREY.includes(n); };
const countOrphans = () => SEAM.split('\n').filter((l) => l.trim() && /\torphan\t/.test(l)).length;

function judge(input) {
    const { led, rows, manifest, dis, fileOnDisk, activeOf } = input;
    const bad = [];
    if (led.load_surface_only_count !== 0) bad.push('load_surface_only_count=' + led.load_surface_only_count + '（O2 要求归 0）');
    const still = (rows || []).filter((m) => m && m.load_surface_only === true).map((m) => m.module);
    if (still.length) bad.push('台账仍有 load_surface_only=true 的行：' + still.join(','));
    if (led.active_count !== led.total_modules) bad.push('active ' + led.active_count + ' != total ' + led.total_modules + '（有模块只在装载面、没业务消费）');
    for (const k of ARCHIVED) {
        if ((manifest.extra_js || []).includes(k)) bad.push('归档模块仍在 extra_js：' + k);
        if (!fileOnDisk(k)) bad.push('归档模块文件缺失：' + k);
        const e = dis.entries[k] || {};
        const why = String(e.why || '');
        if ([...why.trim()].length < MIN_WHY || isGrey(why)) bad.push('归档理由过短或是标签：' + k);
        const sup = e.superseded_by || [];
        if (!sup.length) bad.push('归档未点名替代方：' + k);
        else {
            const dead = sup.filter((x) => !(activeOf(x) > 0));
            if (dead.length) bad.push('替代方不在役：' + k + ' → ' + dead.join(','));
        }
    }
    return bad;
}

const activeOf = (name) => ((LED.modules || {})[name] || {}).business_call_sites || 0;
const REAL = {
    led: LED, rows: ROWS, manifest: MF, dis: DIS, activeOf,
    fileOnDisk: (k) => fs.existsSync(path.join(R, k)),
};

/* ══════════════ A. 计数面 ══════════════ */
test('L23O2 A1. ★★★ load_surface_only 计数真归 0；active === total；seam orphan 0', () => {
    assert.equal(LED.load_surface_only_count, 0, 'load_surface_only_count 必须为 0');
    assert.equal(LED.zero_consumption_count, 0, '零消费也必须为 0（O3 已归档）');
    assert.equal(LED.active_count, LED.total_modules, '装载面每个模块都得有真实业务消费（否则就该归档）');
    assert.equal(countOrphans(), 0, 'seam orphan 必须为 0');
    console.log('  ok load_surface_only 0 · active ' + LED.active_count + '/' + LED.total_modules + ' · extra_js ' + MF.extra_js.length);
});

/* ══════════════ B. 归档面 ══════════════ */
test('L23O2 B1. ★★★★ 11 个逐个归档：不在 extra_js / 文件在盘 / 理由实质 / 替代方全在役', () => {
    assert.equal(ARCHIVED.length, 11, '归档集必须恰为 11 个（少一个就是静默消失）');
    assert.deepEqual(judge(REAL), [], judge(REAL).join(';'));
    assert.ok(DIS.disposition_vocabulary.includes('archived'), '词表必须含 archived（否则归档是一种黑话）');
    console.log('  ok 11 个归档·替代方在役·理由均 ≥' + MIN_WHY + ' 字');
});

test('L23O2 B2. ★★★ 归档不是「删文件」：11 个原件仍在盘且可 require（能力面没被销毁）', () => {
    const req = createRequire(import.meta.url);
    for (const k of ARCHIVED) {
        assert.ok(fs.existsSync(path.join(R, k)), k + ' 文件缺失');
        const api = req(path.join(R, k));
        assert.ok(api && typeof api === 'object', k + ' require 不进（归档≠坏掉）');
    }
    console.log('  ok 11 个原件仍可 require');
});

/* ══════════════ C. 负控制 ══════════════ */
const clone = (o) => JSON.parse(JSON.stringify(o));

test('L23O2 C1. ★★★★ 负控制：计数写回 11 且有一行仍标 true ⇒ 必须翻红', () => {
    const led = clone(LED);
    led.load_surface_only_count = 11;
    const rows = clone(ROWS);
    rows[0].load_surface_only = true;
    const bad = judge({ ...REAL, led, rows });
    assert.ok(bad.some((x) => /load_surface_only_count/.test(x)) && bad.some((x) => /仍有 load_surface_only/.test(x)), '计数与行必须都被抓');
    console.log('  ok 计数回 11 被抓');
});

test('L23O2 C2. ★★★★ 负控制：把归档模块偷塞回 manifest ⇒ 必须翻红', () => {
    const manifest = clone(MF);
    manifest.extra_js.push(ARCHIVED[0]);
    assert.ok(judge({ ...REAL, manifest }).some((x) => /仍在 extra_js/.test(x)), '塞回必须被抓');
    console.log('  ok 塞回 manifest 被抓');
});

test('L23O2 C3. ★★★★ 负控制：替代方熄火（business_call_sites=0）⇒ 必须翻红', () => {
    assert.ok(judge({ ...REAL, activeOf: () => 0 }).some((x) => /替代方不在役/.test(x)), '替代方熄火必须被抓');
    console.log('  ok 替代方熄火被抓');
});

test('L23O2 C4. ★★★ 负控制：删掉一条归档理由 ⇒ 必须翻红', () => {
    const dis = clone(DIS);
    dis.entries[ARCHIVED[0]].why = '待后续';
    const bad = judge({ ...REAL, dis });
    assert.ok(bad.some((x) => /理由过短或是标签/.test(x)), '灰理由必须被抓');
    console.log('  ok 灰理由被抓');
});
