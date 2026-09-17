/* ============================================================
 * v3.157.0 - termLexiconMax live-config wiring (2nd dead config found)
 *              + config-liveness scan promoted to a permanent audit gate
 *              + probe self-test on synthetic fixtures
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const ROOT = '/home/user/lonsha-memory-plugin';
const src = readFileSync(path.join(ROOT, 'index.js'), 'utf-8');
const sui = readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf-8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8'));
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
const AUDIT = path.join(ROOT, 'tests/audit/scan_config_liveness.mjs');

function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}
function extractClass(source, marker) {
    const start = source.indexOf(marker);
    if (start < 0) return null;
    let depth = 0, started = false;
    for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') { depth--; if (started && depth === 0) return source.slice(start, i + 1); }
    }
    return null;
}
/* kernel copy used to instantiate the real class outside the plugin */
function numOr(v, fallback) {
    if (v === undefined || v === null || v === '' || typeof v === 'boolean') return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}
function occurrences(hay, needle) { return hay.split(needle).length - 1; }
/* Distinct term per index. NOTE: Chinese terms go through substring matching (no word boundary),
   so '术语1' would be swallowed by '术语10' — every term must be a unique CJK char. */
function T(i) { return '术' + String.fromCharCode(0x4e00 + i); }

// ================= 1. the dead config and its root cause =================
test('[1] termLexiconMax is presented in the UI (slider + whitelist)', () => {
    assert.ok(sui.includes('data-cfg-num="termLexiconMax"'), 'slider input exists');
    assert.ok(sui.includes('id="ls-v-lexmax"'), 'slider value label exists');
    assert.ok(src.includes("'termLexiconMax'"), 'card override whitelist entry exists');
    assert.ok(src.includes('termLexiconMax: 40'), 'default value exists');
});

test('[1b] the constructor actually receives the configured max (the old bug)', () => {
    assert.ok(src.includes('this.lexicon = new ('), 'lexicon is built behind a window fallback');
    assert.ok(src.includes('max: numOr(this.config.config.termLexiconMax, 40)'),
        'the configured value is passed into the constructor');
    const at = src.indexOf('this.lexicon = new (');
    const inst = src.slice(at, at + 700);
    assert.ok(inst.includes('})({'), 'invocation is not empty any more');
    assert.ok(!inst.includes('})();'), 'the empty invocation is gone');
});

test('[1c] a correct sibling (FloorLedger) shows passing options was always the pattern', () => {
    assert.ok(src.includes('this.ledger = new FloorLedger({'), 'FloorLedger gets its options passed');
});

test('[1d] the constructor itself is zero-value safe', () => {
    const body = extractClass(src, 'class EntityLexicon');
    assert.ok(body, 'class found');
    assert.ok(body.includes('Math.max(10, Math.round(numOr(opts?.max, 40)))'),
        'max is read through the zero-value safe kernel, keeping the floor');
    assert.ok(!body.includes('Number(opts?.max) || 40'), 'the falsy-eating read is gone');
});

test('[1e] termLexiconMax has a real member-read consumer outside the default block', () => {
    const reads = occurrences(src, '.termLexiconMax');
    assert.ok(reads >= 1, 'member-read form present (got ' + reads + ')');
    const first = src.indexOf('.termLexiconMax');
    assert.ok(first > src.indexOf('this.config = {') + 200, 'the read is not the bare default declaration');
});

// ================= 2. EntityLexicon really honours max (live execution) =================
test('[2] EntityLexicon: configured cap is really applied', () => {
    const Lex = new Function('numOr', 'return (' + extractClass(src, 'class EntityLexicon') + ');')(numOr);
    const lx = new Lex({ max: 12 });
    assert.strictEqual(lx.max, 12, 'cap taken from the option');
    for (let i = 0; i < 15; i++) lx.resolve(T(i), i + 1);
    assert.strictEqual(lx.items.length, 12, 'evicted down to the configured cap');
    const terms = lx.export().map(x => x.terms[0]);
    assert.strictEqual(terms.length, 12, 'twelve survivors');
    assert.strictEqual(terms.length, 12, 'twelve survivors');
    assert.ok(!terms.includes(T(0)), 'oldest term evicted first');
    assert.ok(terms.includes(T(14)), 'newest term survives');
});

test('[2b] the old hardcoded 40 is gone: 12 and 40 behave differently', () => {
    const Lex = new Function('numOr', 'return (' + extractClass(src, 'class EntityLexicon') + ');')(numOr);
    const small = new Lex({ max: 12 });
    const big = new Lex({ max: 40 });
    for (let i = 0; i < 30; i++) { small.resolve(T(i), i + 1); big.resolve(T(i), i + 1); }
    assert.strictEqual(small.items.length, 12, 'small cap keeps 12');
    assert.strictEqual(big.items.length, 30, 'big cap keeps all 30');
    assert.notStrictEqual(small.items.length, big.items.length, 'the two caps are no longer the same code path');
});

test('[2c] default / null / garbage fall back to 40; 0 floors at 10', () => {
    const Lex = new Function('numOr', 'return (' + extractClass(src, 'class EntityLexicon') + ');')(numOr);
    assert.strictEqual(new Lex().max, 40, 'no options');
    assert.strictEqual(new Lex({}).max, 40, 'empty options');
    assert.strictEqual(new Lex({ max: null }).max, 40, 'null');
    assert.strictEqual(new Lex({ max: 'abc' }).max, 40, 'non numeric');
    assert.strictEqual(new Lex({ max: '' }).max, 40, 'empty string');
    assert.strictEqual(new Lex({ max: 0 }).max, 10, '0 keeps the documented floor of 10');
    assert.strictEqual(new Lex({ max: -5 }).max, 10, 'negative floors at 10');
});

test('[2d] numeric strings from a card override are honoured', () => {
    const Lex = new Function('numOr', 'return (' + extractClass(src, 'class EntityLexicon') + ');')(numOr);
    assert.strictEqual(new Lex({ max: '60' }).max, 60, 'card override may arrive as a string');
    assert.strictEqual(new Lex({ max: 60.4 }).max, 60, 'rounded');
});

test('[2e] import() truncates to the configured cap, not to a constant', () => {
    const Lex = new Function('numOr', 'return (' + extractClass(src, 'class EntityLexicon') + ');')(numOr);
    const lx = new Lex({ max: 12 });
    const data = [];
    for (let i = 0; i < 30; i++) data.push({ canon: '\u672f\u8bed' + i, terms: ['\u672f\u8bed' + i], count: 1, firstFloor: i, lastFloor: i });
    lx.import(data);
    assert.strictEqual(lx.items.length, 12, 'import honours the configured cap');
    assert.strictEqual(lx.items[lx.items.length - 1].canon, '\u672f\u8bed29', 'keeps the tail');
});

// ================= 3. UI side: 0 must not be swallowed =================
test('[3] the slider renders 0 instead of falling back to 40', () => {
    assert.ok(sui.includes('${c.termLexiconMax ?? 40}'), 'nullish fallback, not falsy fallback');
    assert.strictEqual(occurrences(sui, 'termLexiconMax || 40'), 0, 'no falsy-based fallback left');
});

test('[3b] the lexicon panel line exists and reports the cap', () => {
    assert.ok(src.includes('**\u672f\u8bed\u8bcd\u5178\uff1a**'), 'panel row present');
    assert.ok(src.includes('${_lxMax} \u6761'), 'shows used / cap');
    assert.ok(src.includes('\u5df2\u8fbe\u4e0a\u9650\uff0c\u65b0\u672f\u8bed\u5c06\u6309 count/lastFloor \u6dd8\u6c70\u65e7\u6761\u76ee'), 'states the eviction rule at the cap');
    assert.ok(src.includes("errLog(e, 'exportMemoryReport.\u672f\u8bed\u8bcd\u5178')"), 'panel row is guarded');
});

// ================= 4. the liveness audit as a permanent gate =================
test('[4] the liveness audit script exists and is wired into the gate by directory', () => {
    const audit = readFileSync(AUDIT, 'utf-8');
    assert.ok(audit.includes('\u4e24\u8df3\u53ef\u8fbe\u6027'), 'two-hop reachability is documented');
    assert.ok(audit.includes('memberReads'), 'consumption is restricted to member reads');
    assert.ok(audit.includes('noCaller'), 'caller-less methods are the discriminator');
    assert.ok(audit.includes('process.exit(1)'), 'dead config blocks the gate');
    assert.ok(audit.includes('process.exit(2)'), 'structural drift is distinguished');
    const runner = readFileSync(path.join(ROOT, 'tests/run.mjs'), 'utf-8');
    assert.ok(runner.includes('readdirSync(AUDIT_DIR)'), 'audit scripts are discovered by directory');
    assert.ok(runner.includes("endsWith('.mjs')"), 'all .mjs in tests/audit are taken');
    assert.ok(pkg.scripts['test:audit'], 'audit gate is exposed through npm');
});

test('[4b] the liveness audit passes on the current tree with a clean baseline', () => {
    const r = spawnSync(process.execPath, [AUDIT], { cwd: ROOT, encoding: 'utf-8' });
    assert.strictEqual(r.status, 0, 'exit 0 on the current tree (stderr: ' + (r.stderr || '') + ')');
    assert.ok(r.stdout.includes('\u6b7b\u914d\u7f6e 0'), 'zero dead configs reported');
    assert.ok(/\u53ef\u5230\u8fbe [0-9]+/.test(r.stdout), 'reachable count reported (got: ' + r.stdout.split('\n')[0] + ')');
    assert.ok(r.stdout.includes('[config-liveness] \u901a\u8fc7'), 'pass banner printed');
});

// ================= 5. the probe is not a fake green: synthetic fixtures =================
const FIXTURE_BAD = [
    'function wrap() {',
    '    class Engine {',
    '        constructor() {',
    '            this.config = {',
    '                deadKey: 40,',
    '                liveKey: 5',
    '            };',
    '        }',
    '        _noCaller() {',
    '            return this.config.config.deadKey;',
    '        }',
    '        run() {',
    '            return this.config.config.liveKey;',
    '        }',
    '    }',
    '    const e = new Engine();',
    '    globalThis.__probeResult = e.run();',
    '}',
    'wrap();'
].join('\n');

const FIXTURE_GOOD = FIXTURE_BAD.replace('return this.config.config.liveKey;', 'return this.config.config.liveKey + this.config.config.deadKey;');

const UI_FIXTURE = [
    '<div><input type="range" min="0" max="120" data-cfg-num="deadKey"></div>',
    "<div>${ck('liveKey', 'label', 'hint')}</div>"
].join('\n');

function withFixture(indexJs, uiJs, fn) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'liveness-'));
    try {
        writeFileSync(path.join(dir, 'index.js'), indexJs);
        writeFileSync(path.join(dir, 'settings-ui.js'), uiJs);
        // [v3.159] 探针自测夹具是人工构造的极小字芈，会被新加的结构预检拦下；
        //   夹具通道需显式声明（仅开放下限，不影响正常门禁）。
        const env = { ...process.env, LONSHA_AUDIT_FIXTURE: '1' };
        return fn(dir, spawnSync(process.execPath, [AUDIT], { cwd: dir, encoding: 'utf-8', env }));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test('[5] probe self-test: a key consumed only by a caller-less method IS flagged', () => {
    const r = withFixture(FIXTURE_BAD, UI_FIXTURE, (dir, res) => res);
    assert.strictEqual(r.status, 1, 'fixture with a dead config must exit 1');
    assert.ok(r.stdout.includes('DEAD: deadKey'), 'dead key named in the report');
    assert.ok(r.stdout.includes('_noCaller'), 'the caller-less consumer is named');
    assert.ok(!r.stdout.includes('DEAD: liveKey'), 'the live key must not be flagged');
});

test('[5b] probe self-test: the same fixture with the read moved into a called method passes', () => {
    const r = withFixture(FIXTURE_GOOD, UI_FIXTURE, (dir, res) => res);
    assert.strictEqual(r.status, 0, 'fixture without a dead config must exit 0');
    assert.ok(r.stdout.includes('\u6b7b\u914d\u7f6e 0'), 'zero dead configs');
});

/* A bare string literal sitting OUTSIDE every method body — exactly the shape of
   CARD_CFG_KEYS in index.js. With a naive `key` match this position looks reachable,
   which is precisely how the first version of the probe missed hybridAlpha. */
const FIXTURE_TOP_LEVEL_LITERAL = [
    'function wrap() {',
    "    const WHITELIST = ['deadKey'];",
    '    class Engine {',
    '        constructor() {',
    '            this.config = {',
    '                deadKey: 40,',
    '                liveKey: 5',
    '            };',
    '        }',
    '        _noCaller() {',
    '            return this.config.config.deadKey;',
    '        }',
    '        run() {',
    '            return WHITELIST.length + this.config.config.liveKey;',
    '        }',
    '    }',
    '    const e = new Engine();',
    '    globalThis.__probeResult = e.run();',
    '}',
    'wrap();'
].join(String.fromCharCode(10));

/* The same literal, but inside a method that DOES have a caller. */
const FIXTURE_INLINE_LITERAL = [
    'function wrap() {',
    '    class Engine {',
    '        constructor() {',
    '            this.config = {',
    '                deadKey: 40,',
    '                liveKey: 5',
    '            };',
    '        }',
    '        _noCaller() {',
    '            return this.config.config.deadKey;',
    '        }',
    '        run() {',
    "            const list = ['deadKey'];",
    '            return list.length + this.config.config.liveKey;',
    '        }',
    '    }',
    '    const e = new Engine();',
    '    globalThis.__probeResult = e.run();',
    '}',
    'wrap();'
].join(String.fromCharCode(10));

test('[5c] probe self-test: a bare whitelist literal must not rescue a dead config', () => {
    const r = withFixture(FIXTURE_TOP_LEVEL_LITERAL, UI_FIXTURE, (dir, res) => res);
    assert.strictEqual(r.status, 1, 'the shape that fooled probe v1 must still be flagged');
    assert.ok(r.stdout.includes('DEAD: deadKey'), 'dead key named in the report');
    assert.ok(!r.stdout.includes('DEAD: liveKey'), 'the live key stays clean');
});

test('[5f] probe self-test: an inline literal inside a called method must not rescue it either', () => {
    const r = withFixture(FIXTURE_INLINE_LITERAL, UI_FIXTURE, (dir, res) => res);
    assert.strictEqual(r.status, 1, 'only member reads count as consumption');
    assert.ok(r.stdout.includes('DEAD: deadKey'), 'dead key named in the report');
});

test('[5d] probe self-test: a structural change is reported as exit 2, not as success', () => {
    const r = withFixture('const unrelated = 1;', UI_FIXTURE, (dir, res) => res);
    assert.strictEqual(r.status, 2, 'missing config block must not silently pass');
});

test('[5e] probe self-test: UI keys are collected from both data attributes and ck()', () => {
    const r = withFixture(FIXTURE_BAD, UI_FIXTURE, (dir, res) => res);
    assert.ok(/UI \u5448\u73b0\u952e 2 \//.test(r.stdout), 'both keys counted as UI-presented (got: ' + r.stdout.split('\n')[0] + ')');
});

// ================= 6. release hygiene =================
test('[6] version is synced across the four declaration sites', () => {
    // [v3.158] 当版独占的四处同步断言已交新版接管：改为「四处一致 + 版本下限」，
    //   意图不变（四处版本号必须互相一致且不低于本版），载体不再是硬编码字符串。
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    assert.strictEqual(v, manifest.version, 'manifest follows index.js');
    assert.strictEqual(v, pkg.version, 'package follows index.js');
    assert.ok(vnum(v) >= vnum('3.157.0'), 'index.js version ' + v + ' >= 3.157.0');
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    assert.ok(changelog.includes('## v3.157.0'), 'v3.157 section still present in CHANGELOG');
});

test('[6b] old anchors were taken over, not dropped', () => {
    // [v3.158] 旧锚点断言已交新版接管（本版不再独占）。
    //   保留一个不变量：它们确实还在断言版本号，只是不再指向本版。
    for (const f of ['tests/v3117_diagnostics.test.mjs', 'tests/v3130_control_plane.test.mjs', 'tests/v3147_cooldown_and_dual_hash.test.mjs']) {
        const t = readFileSync(path.join(ROOT, f), 'utf-8');
        assert.ok(/const VERSION = '3[.][0-9]+[.][0-9]+'/.test(t) || /'3[.][0-9]+[.][0-9]+'/.test(t), f + ' still checks a version string');
    }
});

test('[6c] v3156 gave up its own-release exclusivity (lower bound kept)', () => {
    const t156 = readFileSync(path.join(ROOT, 'tests/v3156_zero_value_semantics_and_live_configs.test.mjs'), 'utf-8');
    assert.ok(!t156.includes("startsWith('## v3.156.0')"), 'no longer asserts the changelog head');
    assert.ok(!t156.includes("src.includes(\"const VERSION = '3.156.0';\")"), 'no longer hardcodes its own version');
    assert.ok(t156.includes('\u5df2\u4ea4\u65b0\u7248\u63a5\u7ba1'), 'takeover documented in place');
    assert.ok(t156.includes("vnum('3.156.0')"), 'keeps its own lower bound');
    assert.ok(t156.includes("'## v3.156.0'"), 'keeps asserting its own section still exists');
});

test('[6d] the changelog section documents the shipped fixes', () => {
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const head = changelog.slice(changelog.indexOf('## v3.157.0'), changelog.indexOf('## v3.156.0'));
    assert.ok(head.includes('termLexiconMax'), 'the dead config is named');
    assert.ok(head.includes('numOr'), 'the kernel is referenced');
    assert.ok(head.includes('scan_config_liveness'), 'the new audit gate is documented');
    assert.ok(head.includes('144'), 'the new baseline is recorded');
    assert.ok(head.includes('\u4e24\u8df3\u53ef\u8fbe\u6027'), 'the two-hop criterion is documented');
});

// [v3.158] 已交新版接管：不再硬编码「下一个版本号」，改为版本无关的不变量
// —— 全仓最高的 CHANGELOG 节必须等于 index.js 的已发布版本（既能抱预置占位节，也不会再随每轮升版而失效）。
test('[6e] the changelog never declares a section ahead of the released version', () => {
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    const heads = changelog.split('\n').filter((l) => l.startsWith('## v'));
    assert.ok(heads.length > 0, 'the changelog has sections');
    const top = heads.map((l) => l.slice(4).trim()).sort((a, b) => vnum(b) - vnum(a))[0];
    assert.strictEqual(top, v, 'the highest section must be the released version');
    assert.ok(changelog.includes('## v' + v), 'the released version has a section');
});
