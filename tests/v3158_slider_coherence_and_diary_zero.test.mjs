/* ============================================================
 * v3.158.0 - slider declaration coherence (diaryEveryFloors was the last one)
 *              + scan_slider_coherence promoted to a permanent audit gate
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import path from 'node:path';

const ROOT = '/home/user/lonsha-memory-plugin';
const src = readFileSync(path.join(ROOT, 'index.js'), 'utf-8');
const sui = readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf-8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8'));
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
const AUDIT = path.join(ROOT, 'tests/audit/scan_slider_coherence.mjs');

function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}
function occurrences(hay, needle) { return hay.split(needle).length - 1; }
function sliders() {
    const out = [];
    const marker = '<input type="range"';
    let at = sui.indexOf(marker);
    while (at >= 0) {
        const close = sui.indexOf('>', at);
        if (close < 0) break;
        const tag = sui.slice(at, close + 1);
        const attr = (n) => {
            const k = tag.indexOf(n + '=\"');
            if (k < 0) return null;
            const f = k + n.length + 2;
            return tag.slice(f, tag.indexOf('\"', f));
        };
        out.push({ key: attr('data-cfg-num'), min: attr('min'), max: attr('max'), step: attr('step'), value: attr('value') || '' });
        at = sui.indexOf(marker, close);
    }
    return out;
}

// ================= 1. the leftover defect =================
test('[1] diaryEveryFloors: min=0 must not fall back with || on the slider', () => {
    const s = sliders().find(x => x.key === 'diaryEveryFloors');
    assert.ok(s, 'slider exists');
    assert.strictEqual(s.min, '0', 'min is 0 (0 means every floor)');
    assert.ok(s.value.includes('?? 3'), 'value uses the nullish fallback (got: ' + s.value + ')');
    assert.ok(!s.value.includes('|| 3'), 'no falsy-based fallback on the slider');
});

test('[1b] the paired value label must agree with the slider', () => {
    const label = sui.slice(sui.indexOf('id="ls-v-df"'));
    const seg = label.slice(0, label.indexOf('</span>'));
    assert.ok(seg.includes('?? 3'), 'label uses the nullish fallback (got: ' + seg + ')');
    assert.ok(!seg.includes('|| 3'), 'label does not swallow a configured 0');
});

test('[1c] the engine side really treats 0 as "every floor"', () => {
    assert.ok(src.includes('numOr(this.config.config.diaryEveryFloors, 3)'), 'engine reads through the zero-value kernel');
    assert.ok(src.includes('0=\u6bcf\u697c'), 'UI states that 0 means every floor');
});

test('[1d] no min=0 slider anywhere still uses ``|| 非零`` for its value', () => {
    const bad = sliders().filter(s => s.min === '0' && /\|\|[ ]*[0-9]/.test(s.value) && !/\|\|[ ]*0/.test(s.value));
    assert.deepStrictEqual(bad.map(x => x.key), [], 'every min=0 slider is clean');
});

test('[1e] no min=0 key uses ``|| 非零`` in its paired label either', () => {
    // `|| 0` is fine (0 fallback is the same as ?? 0 for rendering); `|| 3` is not.
    function readNumber(text, from) {
        let i = from;
        while (i < text.length && text[i] === ' ') i++;
        let out = '';
        while (i < text.length && /[0-9.]/.test(text[i])) { out += text[i]; i++; }
        const n = Number(out);
        return Number.isFinite(n) ? n : null;
    }
    const zeroKeys = sliders().filter(s => s.min === '0' && s.key).map(s => s.key);
    const bad = [];
    for (const k of zeroKeys) {
        const needle = 'ls-slider-val';
        const expr = '${c.' + k + ' ||';
        let at = sui.indexOf(needle);
        while (at >= 0) {
            const gt = sui.indexOf('>', at);
            if (gt < 0) break;
            const end = sui.indexOf('</span>', gt);
            const seg = end < 0 ? sui.slice(gt) : sui.slice(gt, end);
            const pos = seg.indexOf(expr);
            if (pos >= 0) {
                const fb = readNumber(seg, pos + expr.length);
                if (fb !== null && fb !== 0) bad.push(k + ' -> ' + fb);
            }
            at = sui.indexOf(needle, gt);
        }
    }
    assert.deepStrictEqual(bad, [], 'no label swallows 0 for a min=0 key');
});

// ================= 2. the audit gate itself =================
test('[2] the coherence audit exists and is discovered by the gate', () => {
    const audit = readFileSync(AUDIT, 'utf-8');
    for (const [needle, why] of [
        ['E1', 'range/step sanity'],
        ['E2', 'min=0 must not be swallowed by ||'],
        ['E3', 'default value inside the range'],
        ['E4', 'every slider key has a default'],
        ['process.exit(1)', 'problems block the gate'],
        ['process.exit(2)', 'structural drift is distinguished'],
        ['readNumber', 'literal reading stays regex-free on a 600k-char file']
    ]) {
        assert.ok(audit.includes(needle), why);
    }
    const runner = readFileSync(path.join(ROOT, 'tests/run.mjs'), 'utf-8');
    assert.ok(runner.includes('readdirSync(AUDIT_DIR)'), 'audits are discovered by directory');
});

test('[2b] the coherence audit passes on the current tree', () => {
    const r = spawnSync(process.execPath, [AUDIT], { cwd: ROOT, encoding: 'utf-8' });
    assert.strictEqual(r.status, 0, 'exit 0 (stderr: ' + (r.stderr || '') + ')');
    assert.ok(r.stdout.includes('\u95ee\u9898 0'), 'zero problems');
    assert.ok(r.stdout.includes('[slider-coherence] \u901a\u8fc7'), 'pass banner');
});

/* A fixture reproducing the exact shape that was broken: min=0 together with a
   falsy fallback on BOTH the slider value and the paired label. */
const UI_FIXTURE_BAD = [
    '<div class="ls-slider-label"><span>k</span><span class="ls-slider-val" id="ls-v-k">${c.deadKey || 3}</span></div>',
    '<input type="range" class="ls-slider" min="0" max="10" step="1" value="${c.deadKey || 3}" data-cfg-num="deadKey">'
].join(String.fromCharCode(10));

const UI_FIXTURE_GOOD = UI_FIXTURE_BAD.split('|| 3').join('?? 3');

const IDX_FIXTURE = [
    'function wrap() {',
    '    class Engine {',
    '        constructor() {',
    '            this.config = {',
    '                deadKey: 3',
    '            };',
    '        }',
    '    }',
    '    const e = new Engine();',
    '    globalThis.__x = e;',
    '}',
    'wrap();'
].join(String.fromCharCode(10));

function withFixture(uiJs, indexJs) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'coherence-'));
    try {
        writeFileSync(path.join(dir, 'settings-ui.js'), uiJs);
        writeFileSync(path.join(dir, 'index.js'), indexJs);
        return spawnSync(process.execPath, [AUDIT], { cwd: dir, encoding: 'utf-8' });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test('[2c] probe self-test: the broken shape is caught on both sites', () => {
    const r = withFixture(UI_FIXTURE_BAD, IDX_FIXTURE);
    assert.strictEqual(r.status, 1, 'broken fixture must exit 1');
    assert.ok(r.stdout.includes('value'), 'slider value site reported');
    assert.ok(r.stdout.includes('label'), 'label site reported');
    assert.ok(r.stdout.includes('deadKey'), 'the key is named');
});

test('[2d] probe self-test: the fixed shape passes', () => {
    const r = withFixture(UI_FIXTURE_GOOD, IDX_FIXTURE);
    assert.strictEqual(r.status, 0, 'fixed fixture must exit 0 (stdout: ' + r.stdout.split(String.fromCharCode(10))[0] + ')');
});

test('[2e] probe self-test: a structural change exits 2 instead of silently passing', () => {
    const r = withFixture('<div>no sliders here</div>', IDX_FIXTURE);
    assert.strictEqual(r.status, 2, 'missing range controls must not pass');
});

// ================= 3. release hygiene =================
test('[3] version is synced across the four declaration sites', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    assert.strictEqual(v, manifest.version, 'manifest follows index.js');
    assert.strictEqual(v, pkg.version, 'package follows index.js');
    assert.ok(vnum(v) >= vnum('3.158.0'), 'index.js version ' + v + ' >= 3.158.0');
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    assert.ok(changelog.trimStart().startsWith('## v3.158.0'), 'newest release heads the changelog');
});

test('[3b] old anchors were taken over, not dropped', () => {
    const t117 = readFileSync(path.join(ROOT, 'tests/v3117_diagnostics.test.mjs'), 'utf-8');
    const t130 = readFileSync(path.join(ROOT, 'tests/v3130_control_plane.test.mjs'), 'utf-8');
    const t147 = readFileSync(path.join(ROOT, 'tests/v3147_cooldown_and_dual_hash.test.mjs'), 'utf-8');
    assert.ok(t117.includes("'3.158.0'") && !t117.includes("'3.157.0'"), 'v3117 re-anchored');
    assert.ok(t130.includes("'3.158.0'") && !t130.includes("'3.157.0'"), 'v3130 re-anchored');
    assert.ok(t147.includes("const VERSION = '3.158.0';") && !t147.includes("'3.157.0'"), 'v3147 re-anchored');
});

test('[3c] v3157 gave up its own-release exclusivity', () => {
    const t157 = readFileSync(path.join(ROOT, 'tests/v3157_live_lexicon_config_and_audit_liveness.test.mjs'), 'utf-8');
    assert.ok(!t157.includes("startsWith('## v3.157.0')"), 'no longer asserts the changelog head');
    assert.ok(t157.includes('\u5df2\u4ea4\u65b0\u7248\u63a5\u7ba1'), 'takeover documented in place');
    assert.ok(t157.includes("vnum('3.157.0')"), 'keeps its own lower bound');
    assert.ok(t157.includes("'## v3.157.0'"), 'keeps asserting its own section still exists');
});

test('[3d] the changelog section documents the shipped fix', () => {
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const head = changelog.slice(changelog.indexOf('## v3.158.0'), changelog.indexOf('## v3.157.0'));
    assert.ok(head.includes('diaryEveryFloors'), 'the leaked key is named');
    assert.ok(head.includes('scan_slider_coherence'), 'the new audit gate is documented');
    assert.ok(head.includes('\u4e24\u4e2a\u4f4d\u7f6e') || head.includes('label'), 'both sites are documented');
});

test('[3e] no unreleased placeholder section is pre-declared', () => {
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    const heads = changelog.split('\n').filter((l) => l.startsWith('## v'));
    assert.ok(heads.length > 0, 'the changelog has sections');
    // 版本无关不变量：最高节 == 已发布版本（预置下一版占位节会被捕）
    const top = heads.map((l) => l.slice(4).trim()).sort((a, b) => vnum(b) - vnum(a))[0];
    assert.strictEqual(top, v, 'the highest section must be the released version');
});
