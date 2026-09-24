/* ============================================================
 * v3.162.0 - UI binding hygiene: a reachable key must be reachable
 *              through exactly one control, and an id must be unique
 *
 * v3.161 证明了「每个已声明键**有**一个控件」。
 * 本版把后半句补上：「**只有**一个」，否则保存时靠后的那个赢，
 * 用户改另一处会以为生效了。
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, cpSync } from 'fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const ROOT = '/home/user/lonsha-memory-plugin';
const AUDIT_DIR = path.join(ROOT, 'tests', 'audit');
const src = readFileSync(path.join(ROOT, 'index.js'), 'utf-8');
const sui = readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf-8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8'));
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));

function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}
/** 与 scan_ui_binding.mjs 同一判据：排除「查询用选择器」，只留真渲染控件 */
const isLookup = (s, pos) => /(?:querySelector|querySelectorAll|getElementById|closest)\(\s*['"][^'"]*$/
    .test(s.slice(Math.max(0, pos - 90), pos));
const lineOf = (s, pos) => s.slice(0, pos).split('\n').length;

function renderControls() {
    const out = new Map();
    const add = (k, kind, line) => {
        if (!out.has(k)) out.set(k, []);
        out.get(k).push({ kind, line });
    };
    for (const m of sui.matchAll(/data-cfg(?:-num|-text)?="([A-Za-z_][A-Za-z0-9_]*)"/g)) {
        if (isLookup(sui, m.index)) continue;
        const attr = m[0].slice(0, m[0].indexOf('='));
        add(m[1], attr === 'data-cfg' ? 'checkbox' : (attr === 'data-cfg-num' ? 'slider' : 'text'), lineOf(sui, m.index));
    }
    for (const m of sui.matchAll(/\bck\('([A-Za-z_][A-Za-z0-9_]*)'/g)) {
        if (isLookup(sui, m.index)) continue;
        add(m[1], 'checkbox', lineOf(sui, m.index));
    }
    return out;
}
function domIds() {
    const out = new Map();
    const add = (id, line) => {
        if (!out.has(id)) out.set(id, []);
        out.get(id).push(line);
    };
    for (const m of sui.matchAll(/\bid="([A-Za-z][A-Za-z0-9_-]*)"/g)) add(m[1], lineOf(sui, m.index));
    for (const m of sui.matchAll(/\.id\s*=\s*'([A-Za-z][A-Za-z0-9_-]*)'/g)) add(m[1], lineOf(sui, m.index));
    return out;
}
function configBlock() {
    const at = src.indexOf('this.config = {');
    assert.ok(at > 0, 'the default config block exists');
    const open = src.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(open, i + 1); }
    }
    throw new Error('unbalanced config block');
}
const CFG = configBlock();
const declared = new Map();
for (const m of CFG.matchAll(/\n\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^\n,]*)/g)) {
    const raw = m[2].trim();
    declared.set(m[1], /^(true|false)\b/.test(raw) ? 'bool'
        : /^[`'"]/.test(raw) ? 'str'
        : /^\[/.test(raw) ? 'arr'
        : /^\{/.test(raw) ? 'obj'
        : /^-?[0-9]/.test(raw) ? 'num' : 'other');
}
const CTRLS = renderControls();
const IDS = domIds();

/** 在合成树上跑一个审计脚本；mutate(dir) 负责写夹具 */
function runAudit(mutate, scripts) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'v3162-'));
    try {
        const ad = path.join(dir, 'tests', 'audit');
        mkdirSync(ad, { recursive: true });
        cpSync(AUDIT_DIR, ad, { recursive: true });
        mutate(dir);
        const env = { ...process.env, LONSHA_AUDIT_FIXTURE: '1' };
        const out = {};
        for (const f of scripts) {
            const r = spawnSync(process.execPath, [path.join('tests', 'audit', f)], { cwd: dir, encoding: 'utf-8', env, timeout: 120000 });
            out[f] = { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
        }
        return out;
    } finally { rmSync(dir, { recursive: true, force: true }); }
}
const BIG = 'x'.repeat(120000);
const TINY_CFG = 'const c = this.config = {\n            alpha: 1,\n            beta: true,\n        };\n';
const writeFixture = (dir, ui) => {
    writeFileSync(path.join(dir, 'index.js'), BIG + '\n' + TINY_CFG);
    writeFileSync(path.join(dir, 'settings-ui.js'), ui);
};

// ============ 1. the invariant: exactly one control per key ============
test('[1] no config key is bound by more than one rendered control', () => {
    const dupes = [...CTRLS.entries()].filter(([, v]) => v.length > 1).sort();
    assert.deepStrictEqual(dupes.map(([k, v]) => k + '@' + v.map(x => x.line).join('/')), [],
        'two controls write back the same key; the later one in DOM order wins on save');
});
test('[1b] no DOM id appears twice in the panel', () => {
    const dupes = [...IDS.entries()].filter(([, v]) => v.length > 1).sort();
    assert.deepStrictEqual(dupes.map(([k, v]) => k + '@' + v.join('/')), [],
        'getElementById only ever returns the first match; the second label never refreshes');
});
test('[1c] every bound key is declared, and the control kind matches the declared type', () => {
    const bad = [];
    for (const [k, list] of [...CTRLS.entries()].sort()) {
        const t = declared.get(k);
        if (t === undefined) { bad.push(k + ' (undeclared)'); continue; }
        for (const { kind, line } of list) {
            const ok = (t === 'bool' && kind === 'checkbox')
                || (t === 'num' && kind === 'slider')
                || (t === 'str' && kind === 'text')
                || ((t === 'arr' || t === 'obj') && kind === 'text');
            if (!ok) bad.push(k + '@' + line + ' (' + kind + ' vs ' + t + ')');
        }
    }
    assert.deepStrictEqual(bad, []);
});
test('[1d] every getElementById target is actually rendered', () => {
    const missing = [];
    for (const m of sui.matchAll(/getElementById\('([A-Za-z][A-Za-z0-9_-]*)'\)/g)) {
        if (!IDS.has(m[1])) missing.push(m[1] + '@' + lineOf(sui, m.index));
    }
    assert.deepStrictEqual(missing, [], 'queried but never created: ' + missing.join(', '));
});
test('[1e] the panel is not degenerate (the extractors have real inputs)', () => {
    assert.ok(declared.size >= 100, 'declared keys = ' + declared.size);
    assert.ok(CTRLS.size >= 100, 'bound keys = ' + CTRLS.size);
    assert.ok(IDS.size >= 20, 'dom ids = ' + IDS.size);
});
test('[1f] a querySelector attribute selector is not counted as a second control', () => {
    // 首版扫描器把 `q.querySelector('[data-cfg-text="apiUrl"]')` 当成控件，误报 apiUrl/apiKey。
    //   这条是那层区分的回归：面板里确实存在这种查询，但它们不得进入绑定面。
    assert.ok(sui.includes("querySelector('[data-cfg-text=\"apiUrl\"]')"), 'the lookup really is in the panel');
    assert.strictEqual(CTRLS.get('apiUrl').length, 1, 'apiUrl is bound exactly once');
    assert.strictEqual(CTRLS.get('apiKey').length, 1, 'apiKey is bound exactly once');
});

// ============ 2. the audit script itself (synthetic fixtures) ============
test('[2] the scanner blocks on a duplicated key binding', () => {
    const r = runAudit((dir) => writeFixture(dir,
        '<input type="range" data-cfg-num="alpha"><div id="dup"></div>'
        + '<input type="range" data-cfg-num="alpha"><div id="dup"></div>'), ['scan_ui_binding.mjs']);
    assert.strictEqual(r['scan_ui_binding.mjs'].status, 1, r['scan_ui_binding.mjs'].out);
    assert.ok(/A1 键 `alpha`/.test(r['scan_ui_binding.mjs'].out), 'names A1');
    assert.ok(/A2 id `dup`/.test(r['scan_ui_binding.mjs'].out), 'names A2');
});
test('[2b] the scanner blocks on a ghost control', () => {
    const r = runAudit((dir) => writeFixture(dir,
        '<input type="range" data-cfg-num="alpha"><input data-cfg="ghostKey"><div id="only"></div>'),
        ['scan_ui_binding.mjs']);
    assert.strictEqual(r['scan_ui_binding.mjs'].status, 1, r['scan_ui_binding.mjs'].out);
    assert.ok(/A3 键 `ghostKey`/.test(r['scan_ui_binding.mjs'].out));
});
test('[2c] the scanner blocks on a control/declared type mismatch', () => {
    const r = runAudit((dir) => writeFixture(dir,
        '<input type="range" data-cfg-num="beta"><div id="only"></div>'), ['scan_ui_binding.mjs']);
    assert.strictEqual(r['scan_ui_binding.mjs'].status, 1, r['scan_ui_binding.mjs'].out);
    assert.ok(/A4 键 `beta`/.test(r['scan_ui_binding.mjs'].out), 'bool key bound as a slider');
});
test('[2d] the scanner blocks on a dangling getElementById', () => {
    const r = runAudit((dir) => writeFixture(dir,
        '<input type="range" data-cfg-num="alpha"><div id="only"></div>'
        + "document.getElementById('nope');\n"), ['scan_ui_binding.mjs']);
    assert.strictEqual(r['scan_ui_binding.mjs'].status, 1, r['scan_ui_binding.mjs'].out);
    assert.ok(/A5 .*getElementById\('nope'\)/.test(r['scan_ui_binding.mjs'].out));
});
test('[2e] the scanner accepts a healthy tree and a lookup-only duplicate', () => {
    const healthy = runAudit((dir) => writeFixture(dir,
        '<input type="range" data-cfg-num="alpha"><div id="only"></div>'), ['scan_ui_binding.mjs']);
    assert.strictEqual(healthy['scan_ui_binding.mjs'].status, 0, healthy['scan_ui_binding.mjs'].out);
    const lookup = runAudit((dir) => writeFixture(dir,
        '<input type="range" data-cfg-num="alpha"><div id="only"></div>'
        + "el = q.querySelector('[data-cfg-num=\"alpha\"]');\n"), ['scan_ui_binding.mjs']);
    assert.strictEqual(lookup['scan_ui_binding.mjs'].status, 0,
        'the selector must not count as a second control: ' + lookup['scan_ui_binding.mjs'].out);
});
test('[2f] the scanner fails closed (exit 2) on a degenerate tree', () => {
    const r = runAudit((dir) => {
        writeFileSync(path.join(dir, 'index.js'), '// gone\n');
        writeFileSync(path.join(dir, 'settings-ui.js'), '// gone\n');
    }, ['scan_ui_binding.mjs']);
    assert.strictEqual(r['scan_ui_binding.mjs'].status, 2, r['scan_ui_binding.mjs'].out);
});
test('[2g] the scanner passes on the real tree', () => {
    const r = spawnSync(process.execPath, ['tests/audit/scan_ui_binding.mjs'], { cwd: ROOT, encoding: 'utf-8', timeout: 120000 });
    assert.strictEqual(r.status, 0, (r.stdout || '') + (r.stderr || ''));
    assert.ok(/A6 结构健康：ok/.test(r.stdout || ''), 'the health marker is printed');
});

// ============ 3. the fixed defects must not come back ============
test('[3] the duplicated injectionDepth slider is gone from the reflection group', () => {
    assert.strictEqual((sui.match(/data-cfg-num="injectionDepth"/g) || []).length, 1,
        'exactly one injectionDepth slider');
    assert.strictEqual((sui.match(/id="ls-v-injdepth"/g) || []).length, 1, 'exactly one value label');
    const g0 = sui.indexOf('🪞 反思 + 物品台账 + 注入深度');
    const g1 = sui.indexOf('📢 回响池 + 日记 + 提取节流');
    assert.ok(g0 > 0 && g1 > g0, 'both groups are present');
    assert.ok(!sui.slice(g0, g1).includes('injectionDepth'), 'the reflection group no longer carries it');
});
test('[3b] the duplicated reflectionEnabled checkbox is gone from the echo group', () => {
    assert.strictEqual((sui.match(/\bck\('reflectionEnabled'/g) || []).length, 1,
        'exactly one reflectionEnabled checkbox');
    const g0 = sui.indexOf('📢 回响池 + 日记 + 提取节流');
    const g1 = sui.indexOf('🗺️ 场景树 + 在场分档');
    assert.ok(g0 > 0 && g1 > g0, 'both groups are present');
    assert.ok(!sui.slice(g0, g1).includes("ck('reflectionEnabled'"),
        'the echo group no longer carries the duplicate copy');
    // 被保留的是反思分组里那份「与日记独立节流」的说明。
    assert.ok(sui.includes("与日记独立节流"), 'the surviving copy is the reflection-group one');
});
test('[3c] the stale "reserved, not yet effective" hint is gone', () => {
    assert.strictEqual(sui.includes('预留位暂不生效'), false,
        'v2.6 的旧话术已经和引擎现状矛盾（v3.2 起 depth 真正生效）');
    assert.strictEqual(sui.includes('需 ST 核心级 hook'), false, 'the whole stale clause is gone');
    // 两处相关提示现在必须是同一句准确表述。
    const fresh = 'D1/D2=插到更早位置缓解近因偏误（经 setExtensionPrompt depth 参数生效）';
    assert.ok(sui.includes(fresh), 'the accurate wording is present');
    assert.ok(src.includes('setExtensionPrompt(String(key), String(content || \'\'), INJECT_POSITION_IN_CHAT'),
        'the engine really does pass depth through setExtensionPrompt');
});

// ============ 4. release hygiene ============
test('[4] version is synced across the declaration sites', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    assert.strictEqual(v, manifest.version, 'manifest follows index.js');
    assert.strictEqual(v, pkg.version, 'package follows index.js');
    // [v3.203.0] 交棒链拆除后，本文件锁自己的出生版本，不随抬版上抬。
    assert.ok(vnum(v) >= vnum('3.162.0'), 'index.js version ' + v + ' >= 3.162.0');
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
        // [v3.203.0] 同上：只守「不承诺高于现版」，不再要求锚点跟着当前版抬。
        const cur = vnum(/const VERSION = '([0-9.]+)'/.exec(src)[1]);
        assert.ok(hits.every((h) => vnum(h) <= cur), f + ' anchors must not promise a future version');
    }
});
test('[4c] v3159 no longer hardcodes its audit-script list', () => {
    // 硬编码清单会让新增的第 6 个审计脚本静默逃过「每个脚本都能阻断」这条负控制。
    const t = readFileSync(path.join(ROOT, 'tests/v3159_audit_failclosed_and_fallback_parity.test.mjs'), 'utf-8');
    assert.ok(/readdirSync\(AUDIT_DIR\)/.test(t), 'the list is discovered from the directory');
    // [v3.163] 原本写死 'scan_config_liveness 这条字面量：v3.163 在 v3159 里为动态清单
    //   补注释时提到该文件名，负控制会对着注释误报。判据改为「不出现任何字面量数组形式」。
    assert.ok(!/const auditScripts = \[\s*['"`]/.test(t), 'the literal list is gone');
    // 动态清单必须真的覆盖每个 .mjs，且包含本版新增的那一个。
    const onDisk = readFileSync(path.join(ROOT, 'tests', 'run.mjs'), 'utf-8');
    assert.ok(/readdirSync\(AUDIT_DIR\)\.filter\(f => f\.endsWith\('\.mjs'\) && !f\.startsWith\('_'\)\)/.test(onDisk),
        'run.mjs uses the same discovery rule');
});
test('[4d] v3160 and v3161 gave up their own-release exclusivity', () => {
    for (const f of ['v3160_config_declaration_gap', 'v3161_config_reachability']) {
        const t = readFileSync(path.join(ROOT, 'tests', f + '.test.mjs'), 'utf-8');
        // [v3.203.0] 交棒链拆除：历史文件的下界锁自己的出生版本，**不再**随抬版推进。
        //   （旧判据要求「下界必须已升到现版」——那正是每次发版要人工改 21 处的根因。）
        //   现在只守版本无关的不变量：仍有下界、且不承诺高于现版。
        const v = /const VERSION = '([0-9.]+)'/.exec(readFileSync(path.join(ROOT, 'index.js'), 'utf-8'))[1];
        const bounds = [...t.matchAll(/vnum\('(3[.][0-9]+[.][0-9]+)'\)/g)].map((m) => m[1]);
        assert.ok(bounds.length > 0, f + ' still anchors a lower bound');
        const ahead = bounds.filter((b) => vnum(b) > vnum(v));
        assert.deepStrictEqual(ahead, [], f + ' 的下界不得高于现版 ' + v + '：' + JSON.stringify(ahead));
    }
});
test('[4e] the changelog section documents this release', () => {
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const head = changelog.slice(changelog.indexOf('## v3.162.0'), changelog.indexOf('## v3.161.0'));
    assert.ok(head.length > 500, 'the section has substance');
    assert.ok(/injectionDepth/.test(head) && /reflectionEnabled/.test(head), 'both duplicated keys are named');
    assert.ok(/scan_ui_binding/.test(head), 'the new audit script is named');
    assert.ok(/预留位暂不生效|过时提示/.test(head), 'the stale hint is recorded');
});
test('[4f] no unreleased placeholder section is pre-declared', () => {
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    const ahead = changelog.split('\n').filter((l) => l.startsWith('## v'))
        .map((l) => l.slice(4).trim()).filter((h) => vnum(h) > vnum(v));
    assert.deepStrictEqual(ahead, [], 'no section for a version above the released one');
});