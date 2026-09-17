/* ============================================================
 * v3.159.0 - audit scripts must fail CLOSED, and engine fallbacks
 *              must agree with the declared defaults
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const ROOT = '/home/user/lonsha-memory-plugin';
const AUDIT_DIR = path.join(ROOT, 'tests/audit');
const src = readFileSync(path.join(ROOT, 'index.js'), 'utf-8');
const sui = readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf-8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8'));
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));

function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}
const auditScripts = [
    'scan_config_liveness.mjs',
    'scan_resilience.mjs',
    'scan_slider_coherence.mjs',
    'scan_syntax.mjs',
    'scan_wiring.mjs',
];
const readAudit = (f) => readFileSync(path.join(AUDIT_DIR, f), 'utf-8');

/** run one audit script inside a scratch tree shaped by `mutate` */
function runInScratch(mutate) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'v3159-'));
    try {
        writeFileSync(path.join(dir, 'index.js'), src);
        writeFileSync(path.join(dir, 'settings-ui.js'), sui);
        const ad = path.join(dir, 'tests', 'audit');
        mkdirSync(ad, { recursive: true });
        for (const f of auditScripts) writeFileSync(path.join(ad, f), readAudit(f));
        const which = mutate(dir);
        const results = {};
        for (const f of (which || auditScripts)) {
            const r = spawnSync('node', [path.join('tests', 'audit', f)], { cwd: dir, encoding: 'utf-8', timeout: 120000 });
            results[f] = { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
        }
        return results;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

// ================= 1. the shipped defect =================
test('[1] engine fallback for archivePreserveRecent matches the declared default', () => {
    const dflt = /archivePreserveRecent:\s*([0-9]+)/.exec(src);
    assert.ok(dflt, 'the key has a declared default in the config block');
    const declared = Number(dflt[1]);
    assert.strictEqual(declared, 6, 'declared default is the documented one');
    // the only read site must fall back to the same number
    const reads = [...src.matchAll(/numOr\([^)]*archivePreserveRecent\s*,\s*([0-9]+)\s*\)/g)].map((m) => Number(m[1]));
    assert.strictEqual(reads.length, 1, 'exactly one read site');
    assert.strictEqual(reads[0], declared, 'fallback agrees with the default (was 0)');
});
test('[1b] no other config key silently disagrees with its declared default', () => {
    // extract the default config block
    const at = src.indexOf('this.config = {');
    assert.ok(at > 0, 'config block found');
    let i = src.indexOf('{', at), depth = 0, j = i;
    for (; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) break; }
    }
    const blk = src.slice(i, j + 1);
    const lo = src.slice(0, i).split('\n').length;
    const hi = src.slice(0, j).split('\n').length;
    const lines = src.split('\n');
    const NUMOR = /numOr\(\s*[A-Za-z0-9_$.\[\]\(\)\?\s'":!=<>-]*?\.([A-Za-z0-9_$]+)\s*,\s*(-?[0-9.]+)\s*\)/;
    const OPFB = /\.([A-Za-z0-9_$]+)\s*(?:\|\||\?\?)\s*(-?[0-9.]+)\b/;
    const bad = [];
    for (let n = 1; n <= lines.length; n++) {
        if (n >= lo && n <= hi) continue;
        const line = lines[n - 1];
        for (const m of [NUMOR.exec(line), OPFB.exec(line)]) {
            if (!m) continue;
            const key = m[1], fb = Number(m[2]);
            if (!key || !Number.isFinite(fb)) continue;
            const dm = new RegExp('\\b' + key + '\\s*:\\s*(-?[0-9.]+)').exec(blk);
            if (!dm) continue;
            if (Number(dm[1]) !== fb) bad.push(key + ': default ' + dm[1] + ' vs fallback ' + fb + ' @L' + n);
        }
    }
    assert.deepStrictEqual(bad, [], 'every numeric fallback agrees with its declared default');
});
// ================= 2. audit scripts must fail closed =================
test('[2] every audit script can block (exit 2), and defect-scanners can fail hard (exit 1)', () => {
    // 不要求显式写 process.exit(0)：隐式到底同样是通过，要验的是「失败时能不能阻断」。
    //   exit 2（结构漂移 / 探测器失效）是每个脚本都必须具备的底线。
    for (const f of auditScripts) {
        const t = readAudit(f);
        assert.ok(/process\.exit\s*\(\s*[12]\s*\)/.test(t), f + ' can block (nonzero exit)');
        assert.ok(/process\.exit\s*\(\s*2\s*\)/.test(t), f + ' blocks on structural drift (exit 2)');
    }
    // 已知会判定「真缺陷」的四个脚本必须有 exit 1。
    //   scan_resilience 只报参考指标（静默 catch 不一律是缺陷），故只需 exit 2。
    for (const f of ['scan_config_liveness.mjs', 'scan_slider_coherence.mjs', 'scan_syntax.mjs', 'scan_wiring.mjs']) {
        assert.ok(/process\.exit\s*\(\s*1\s*\)/.test(readAudit(f)), f + ' fails hard on a real defect (exit 1)');
    }
});
test('[2b] the two formerly exit-less scanners now block on a degenerate tree', () => {
    const r = runInScratch((dir) => {
        writeFileSync(path.join(dir, 'index.js'), '// gone\n');
        writeFileSync(path.join(dir, 'settings-ui.js'), '// gone\n');
        return ['scan_resilience.mjs', 'scan_wiring.mjs', 'scan_config_liveness.mjs'];
    });
    for (const [f, r2] of Object.entries(r)) {
        assert.strictEqual(r2.status, 2, f + ' must exit 2 on an empty tree, got ' + r2.status + ' / ' + r2.out.slice(0, 160));
    }
});
test('[2c] a truncated UI file is caught even though its size is over the floor', () => {
    const r = runInScratch((dir) => {
        writeFileSync(path.join(dir, 'settings-ui.js'), sui.split('\n').slice(0, 200).join('\n'));
        return ['scan_wiring.mjs'];
    });
    assert.strictEqual(r['scan_wiring.mjs'].status, 2, 'wiring must notice the vanished controls');
});
test('[2d] a healthy tree still passes every audit script', () => {
    const r = runInScratch(() => auditScripts);
    for (const [f, r2] of Object.entries(r)) {
        assert.strictEqual(r2.status, 0, f + ' must pass on a healthy tree, got ' + r2.status + ' / ' + r2.out.slice(-200));
    }
});
test('[2e] the liveness probe refuses to certify "0 dead configs" from a collapsed key set', () => {
    const t = readAudit('scan_config_liveness.mjs');
    assert.ok(/MIN_UI_KEYS/.test(t), 'the floor exists');
    assert.ok(/uiKeys\.size\s*<\s*MIN_UI_KEYS/.test(t), 'the floor is actually enforced');
    assert.ok(/process\.exit\(2\)[\s\S]{0,400}=== D1/.test(t), 'the guard sits before the report');

    // 行为化：一份「越过字节下限、却只携带寥寥几个键」的 UI 必须被判为「不具证明力」（exit 2），
    //   而不是被静默认证成「死配置 0」。这是「审计失效 = 报告一切正常」的直接反例。
    const thinUi = '<!-- thin ui: over the byte floor, but only three distinct keys -->\n'
        + Array.from({ length: 600 }, (_, i) => '<div class="row" data-cfg="orphanKey' + (i % 3) + '"></div>').join('\n');
    assert.ok(thinUi.length >= 20000, 'the fixture does clear the byte floor');
    const r = runInScratch((dir) => {
        writeFileSync(path.join(dir, 'settings-ui.js'), thinUi);
        return ['scan_config_liveness.mjs'];
    });
    assert.strictEqual(r['scan_config_liveness.mjs'].status, 2,
        'a collapsed key set must exit 2 rather than certify zero dead configs, got '
        + r['scan_config_liveness.mjs'].status + ' / ' + r['scan_config_liveness.mjs'].out.slice(-200));
});
// ================= 3. release hygiene =================
test('[3] version is synced across the four declaration sites', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    assert.strictEqual(v, manifest.version, 'manifest follows index.js');
    assert.strictEqual(v, pkg.version, 'package follows index.js');
    assert.ok(vnum(v) >= vnum('3.159.0'), 'index.js version ' + v + ' >= 3.159.0');
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const heads = changelog.split('\n').filter((l) => l.startsWith('## v'));
    const top = heads.map((l) => l.slice(4).trim()).sort((a, b) => vnum(b) - vnum(a))[0];
    assert.strictEqual(top, v, 'the highest changelog section is the released version');
});
test('[3b] old anchors were taken over, not dropped', () => {
    const t117 = readFileSync(path.join(ROOT, 'tests/v3117_diagnostics.test.mjs'), 'utf-8');
    const t130 = readFileSync(path.join(ROOT, 'tests/v3130_control_plane.test.mjs'), 'utf-8');
    const t147 = readFileSync(path.join(ROOT, 'tests/v3147_cooldown_and_dual_hash.test.mjs'), 'utf-8');
    // [v3.160] 已交新版接管：不再锁定到本版字符串，改为版本无关不变量——
    //   「旧锚点仍在、且都指向同一个 >= 3.159.0 的版本」。
    const anchorOf = (t) => {
        const hits = [...t.matchAll(/'(3[.][0-9]+[.][0-9]+)'/g)].map((m) => m[1]);
        return hits;
    };
    for (const [tag, t] of [['v3117', t117], ['v3130', t130], ['v3147', t147]]) {
        const hits = anchorOf(t);
        assert.ok(hits.length > 0, tag + ' still anchors a version string');
        assert.ok(hits.every((h) => vnum(h) >= vnum('3.159.0')), tag + ' anchors are not stale');
        assert.ok(!t.includes("'3.158.0'"), tag + ' dropped its pre-takeover anchor');
    }
    assert.ok(t147.includes("const VERSION = '"), 'v3147 still pins the const form');
});
test('[3c] v3158 gave up its own-release exclusivity', () => {
    const t = readFileSync(path.join(ROOT, 'tests/v3158_slider_coherence_and_diary_zero.test.mjs'), 'utf-8');
    assert.ok(!t.includes("startsWith('## v3.158.0')"), 'no longer asserts the changelog head');
    assert.ok(!/changelog\.trimStart\(\).startsWith\('## v3\.158\.0'\)/.test(t), 'nor any equivalent head assertion');
    assert.ok(/vnum\('3\.158\.0'\)/.test(t), 'keeps its own lower bound');
});
test('[3d] the changelog section documents the shipped fix', () => {
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const head = changelog.slice(changelog.indexOf('## v3.159.0'), changelog.indexOf('## v3.158.0'));
    assert.ok(head.includes('archivePreserveRecent'), 'the mismatched fallback is named');
    assert.ok(head.includes('fail') || head.includes('closed'), 'the fail-closed theme is documented');
    assert.ok(/scan_(wiring|resilience|config_liveness)/.test(head), 'the hardened probes are named');
});
test('[3e] no unreleased placeholder section is pre-declared', () => {
    // [v3.160] 已交新版接管：不写死「下一版号」，改为版本无关不变量——
    //   CHANGELOG 里不得存在任何**高于**已发布版本的节（那才是「预置占位节」）。
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    const ahead = changelog.split('\n').filter((l) => l.startsWith('## v'))
        .map((l) => l.slice(4).trim()).filter((h) => vnum(h) > vnum(v));
    assert.deepStrictEqual(ahead, [], 'no section for a version above the released one');
});
