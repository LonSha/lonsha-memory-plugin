/* ============================================================
 * v3.160.0 - every config key the engine reads must be declared,
 *              every declared key must be reachable from somewhere
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = '/home/user/lonsha-memory-plugin';
const src = readFileSync(path.join(ROOT, 'index.js'), 'utf-8');
const sui = readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf-8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8'));
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));

function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}

/** the default config block, plus its character offsets in index.js */
function configBlock() {
    const at = src.indexOf('this.config = {');
    assert.ok(at > 0, 'the default config block exists');
    const open = src.indexOf('{', at);
    let depth = 0, close = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { close = i; break; } }
    }
    assert.ok(close > open, 'the default config block is balanced');
    return { text: src.slice(open, close + 1), open, close };
}
const CFG = configBlock();
const declaredKeys = new Set([...CFG.text.matchAll(/\n\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map((m) => m[1]));

/** UI-visible config keys: data-cfg* attributes and ck('key') templates */
function uiKeys() {
    const out = new Set();
    for (const m of sui.matchAll(/data-cfg(?:-num|-text)?="([A-Za-z_][A-Za-z0-9_]*)"/g)) out.add(m[1]);
    for (const m of sui.matchAll(/\bck\('([A-Za-z_][A-Za-z0-9_]*)'/g)) out.add(m[1]);
    return out;
}
/** the character-card override whitelist */
function whitelist() {
    const m = /const CARD_CFG_KEYS = \[(.*?)\];/s.exec(src);
    assert.ok(m, 'the card whitelist exists');
    return { raw: m[1], keys: new Set([...m[1].matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)].map((x) => x[1])) };
}

// ================= 1. declaration / reachability invariants =================
test('[1] no config key is read by the engine without being declared', () => {
    const read = new Set([...src.matchAll(/config\.config\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));
    const undeclared = [...read].filter((k) => !declaredKeys.has(k)).sort();
    assert.deepStrictEqual(undeclared, [],
        'these keys are read via config.config.KEY but never declared — the engine falls back to a '
        + 'hardcoded value and nobody can set them: ' + undeclared.join(', '));
});
test('[1b] no declared key is unreachable (zero member reads outside the block)', () => {
    const dead = [];
    for (const k of [...declaredKeys].sort()) {
        const hits = [...src.matchAll(new RegExp('[.]' + k + '(?![A-Za-z0-9_$])', 'g'))].map((m) => m.index);
        if (!hits.some((p) => p < CFG.open || p > CFG.close)) dead.push(k);
    }
    assert.deepStrictEqual(dead, [], 'declared but never consumed: ' + dead.join(', '));
});
test('[1c] the newly declared feature toggles are genuine tri-state opt-outs', () => {
    // 「声明 true + 读取点写 `!== false`」这一对是本仓库表达「默认开、可关」的既定写法。
    //   只声明不写守卫，或只写守卫不声明，都会让开关失真。
    // 可达边界（据实记录）：这是**存在性**检查——它能证明守卫仍在源码里，不能证明守卫的求值结果
    //   仍然为真（例如把 `!== false` 改成 `!== false && false`，文本形态不变而无测试可能捕获）。
    //   要闭合这一段需要把 engine 送进无 DOM 的仿真环境求值，超出本仓库当前的测试基建，
    //   故此处不作过度声明。
    const toggles = ['diaryBridgeEnabled', 'clockSyncEnabled', 'pairMemoryEnabled', 'conflictBookEnabled',
        'cardCollectionEnabled', 'ethicsConflictEnabled', 'adaptiveBudget'];
    for (const k of toggles) {
        assert.ok(new RegExp('\\n\\s*' + k + ':\\s*true\\s*,').test(CFG.text), k + ' is declared as true');
        assert.ok(new RegExp('config[.]' + k + '\\s*!==\\s*false').test(src), k + ' read as !== false');
    }
});
test('[1d] the newly declared numeric knobs agree with their engine fallbacks', () => {
    // v3159 的 [1b] 已在全仓范围验证这条；此处只针对本版新增的三个键给出可读的证据。
    //   两个回退形态都要吃下：`|| N`（读点自带兜底）与 `?? N`（只兜 null/undefined）。
    const nums = { adaptiveBudgetDecayFloors: 80, sleepEveryN: 10, snapshotEveryFloors: 50 };
    for (const [k, n] of Object.entries(nums)) {
        assert.ok(new RegExp('\\n\\s*' + k + ':\\s*' + n + '\\s*,').test(CFG.text), k + ' declared as ' + n);
        const sites = [...src.matchAll(new RegExp('config[.]' + k + '[)]?\\s*(?:[|]{2}|[?]{2})\\s*([0-9]+)', 'g'))]
            .map((m) => Number(m[1]));
        assert.ok(sites.length > 0, k + ' has a fallback site');
        assert.deepStrictEqual(sites, sites.map(() => n), k + ' fallbacks all equal the declared default');
    }
});

// ================= 2. reachability through the shipped UI =================
test('[2] every key this release declared is settable from the settings panel', () => {
    const ui = uiKeys();
    const newly = ['diaryBridgeEnabled', 'clockSyncEnabled', 'pairMemoryEnabled', 'conflictBookEnabled',
        'cardCollectionEnabled', 'ethicsConflictEnabled', 'adaptiveBudget',
        'adaptiveBudgetDecayFloors', 'sleepEveryN', 'snapshotEveryFloors'];
    const unreachable = newly.filter((k) => !ui.has(k));
    assert.deepStrictEqual(unreachable, [], 'declared but no control: ' + unreachable.join(', '));
});
test('[2b] the settings panel really renders those controls (behavioural)', () => {
    const group = sui.slice(sui.indexOf('🧩 记忆域开关'), sui.indexOf('🏛️ 工业级体系化增强'));
    assert.ok(group.length > 0, 'the new group is present');
    for (const k of ['diaryBridgeEnabled', 'clockSyncEnabled', 'pairMemoryEnabled', 'conflictBookEnabled',
        'cardCollectionEnabled', 'ethicsConflictEnabled', 'adaptiveBudget']) {
        assert.ok(group.includes("ck('" + k + "'"), 'checkbox rendered: ' + k);
    }
    for (const k of ['adaptiveBudgetDecayFloors', 'sleepEveryN', 'snapshotEveryFloors']) {
        assert.ok(group.includes('data-cfg-num="' + k + '"'), 'slider rendered: ' + k);
        assert.ok(group.includes('value="${c.' + k + ' ?? '), 'slider carries a ?? fallback: ' + k);
    }
});
test('[2c] the liveness audit accepts the widened key set', () => {
    const r = spawnSync('node', ['tests/audit/scan_config_liveness.mjs'], { cwd: ROOT, encoding: 'utf-8', timeout: 120000 });
    assert.strictEqual(r.status, 0, 'liveness must still pass: ' + (r.stdout || '') + (r.stderr || ''));
    const m = /UI 呈现键 (\d+) \/ 可到达 (\d+) \/ 死配置 (\d+)/.exec(r.stdout || '');
    assert.ok(m, 'the D1 report is printed');
    assert.strictEqual(Number(m[3]), 0, 'no dead configs');
    assert.strictEqual(m[1], m[2], 'every UI key is reachable');
    assert.ok(Number(m[1]) >= 150, 'the key set did not collapse, got ' + m[1]);
});

// ================= 3. the card whitelist stays honest =================
test('[3] the card override whitelist has no ghost entries', () => {
    const wl = whitelist();
    const ghosts = [...wl.keys].filter((k) => !declaredKeys.has(k)).sort();
    assert.deepStrictEqual(ghosts, [],
        'whitelisted but not declared (the list claims to expose a knob the engine does not have): '
        + ghosts.join(', '));
});
test('[3b] the whitelist has no duplicate entries', () => {
    const wl = whitelist();
    const dupes = [...wl.keys].filter((k) => (wl.raw.match(new RegExp("'" + k + "'", 'g')) || []).length > 1);
    assert.deepStrictEqual(dupes, [], 'duplicated: ' + dupes.join(', '));
});
test('[3c] the archive-cadence knobs are now reachable from a card', () => {
    const wl = whitelist();
    for (const k of ['sleepEveryN', 'snapshotEveryFloors', 'adaptiveBudgetDecayFloors']) {
        assert.ok(wl.keys.has(k), k + ' is whitelisted');
    }
});

// ================= 4. release hygiene =================
test('[4] version is synced across the declaration sites', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    assert.strictEqual(v, manifest.version, 'manifest follows index.js');
    assert.strictEqual(v, pkg.version, 'package follows index.js');
    assert.ok(vnum(v) >= vnum('3.188.0'), 'index.js version ' + v + ' >= 3.160.0');
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const top = changelog.split('\n').filter((l) => l.startsWith('## v'))
        .map((l) => l.slice(4).trim()).sort((a, b) => vnum(b) - vnum(a))[0];
    assert.strictEqual(top, v, 'the highest changelog section is the released version');
});
test('[4b] old anchors were taken over, not dropped', () => {
    for (const f of ['v3117_diagnostics', 'v3130_control_plane', 'v3147_cooldown_and_dual_hash']) {
        const t = readFileSync(path.join(ROOT, 'tests', f + '.test.mjs'), 'utf-8');
        const hits = [...t.matchAll(/'(3[.][0-9]+[.][0-9]+)'/g)].map((m) => m[1]);
        assert.ok(hits.length > 0, f + ' still anchors a version string');
        assert.ok(hits.every((h) => vnum(h) >= vnum('3.188.0')), f + ' anchors are not stale');
        assert.ok(!t.includes("'3.159.0'"), f + ' dropped its pre-takeover anchor');
    }
});
test('[4c] v3159 gave up its own-release exclusivity', () => {
    const t = readFileSync(path.join(ROOT, 'tests/v3159_audit_failclosed_and_fallback_parity.test.mjs'), 'utf-8');
    // 交出的是「三处旧锚点恰好等于本版字符串」这条硬断言，代之以版本无关的下界。
    assert.ok(!t.includes("assert.ok(t117.includes(\"'3."), 'the pinned per-file anchor block is gone');
    assert.ok(t.includes('已交新版接管'), 'the handover is documented in place');
    assert.ok(/vnum\(h\) >=\s*vnum\('3\.159\.0'\)/.test(t), 'replaced by a version-agnostic lower bound');
});
test('[4d] the changelog section documents this release', () => {
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const head = changelog.slice(changelog.indexOf('## v3.160.0'), changelog.indexOf('## v3.159.0'));
    assert.ok(head.includes('extractionCadence'), 'the ghost whitelist entry is named');
    assert.ok(/声明/.test(head), 'the declaration gap is described');
    assert.ok(/记忆域开关|设置面板/.test(head), 'the new UI group is described');
});
test('[4e] no unreleased placeholder section is pre-declared', () => {
    // 刻意不写死「下一版号」——那正是 v3159 [3e] 在接过 v3.160 时踩到的坑。
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    const ahead = changelog.split('\n').filter((l) => l.startsWith('## v'))
        .map((l) => l.slice(4).trim()).filter((h) => vnum(h) > vnum(v));
    assert.deepStrictEqual(ahead, [], 'no section for a version above the released one');
});