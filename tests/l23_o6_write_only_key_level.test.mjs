// tests/l23_o6_write_only_key_level.test.mjs — L23-O6「写了不读」键级扫描 + 空清单自证 [v3.474.0]
//
// 这一刀修的是什么（机器读数，不是判断）：
//   旧扫描器把读取点写成 `/\\bengine|state\\s*(...)/` —— 顶层的 `|` 让前半支退化成
//   「出现 `engine` 这个词就算读到」。于是**任何**含 `engine` 字样的文件都把它里面的
//   每个字段判成「已读」⇒ 旧口径报「写无读 4 个字段」，实测同一盘面是 **73 个**。
//   本判据钉住三件事：① 键级（跨文件读算读）；② 分母（空清单必须自证扫了什么）；
//   ③ 台账每条理由都是**可复验的事实**（判据重新读盘复验，手改会烂）。
//
// 口径纪律：判据**不自己写读点正则**，一切经 `tools/scan_write_only_fields.mjs::scanRepoSelfProof`；
//   台账也不手写，经 `tools/gen_write_only_disposal.mjs::buildDisposal`（E1 逐字节对齐）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { scanRepoSelfProof } from '../tools/scan_write_only_fields.mjs';
import { buildDisposal } from '../tools/gen_write_only_disposal.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER_PATH = path.join(ROOT, 'tests', 'audit', 'write_only_ledger.json');

/* 全盘只扫一次（73 条 × 413 文件的复验很贵）：下面各条共用这份读数。 */
const SCAN = scanRepoSelfProof(ROOT);
const BUILD = buildDisposal(ROOT);
const LEDGER = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));

function scratch(files) {
    const t = fs.mkdtempSync(path.join(os.tmpdir(), 'wo-key-'));
    for (const [rel, src] of Object.entries(files)) {
        fs.mkdirSync(path.join(t, path.dirname(rel)), { recursive: true });
        fs.writeFileSync(path.join(t, rel), src);
    }
    return t;
}
const fields = (root) => scanRepoSelfProof(root).findings.map((f) => f.field).sort();

test('A1 键级：A 文件写、B 文件读 ⇒ 不算写无读；把 B 删掉 ⇒ 必须算（口径真的扩了面）', () => {
    const files = {
        'a.js': 'const state = {};\nfunction w() { state.crossField = 1; }\n',
        'b.js': 'const state = {};\nfunction r() { return state.crossField; }\n',
    };
    const t1 = scratch(files);
    try {
        assert.deepEqual(fields(t1), [],
            '跨文件读必须算读 —— 旧口径（只在同文件内比对）会把 crossField 误判成死写');
    } finally { fs.rmSync(t1, { recursive: true, force: true }); }
    const t2 = scratch({ 'a.js': files['a.js'] });
    try {
        assert.deepEqual(fields(t2), ['crossField'], '读点不在盘上时必须报，否则 A1 的正向半边是假绿');
    } finally { fs.rmSync(t2, { recursive: true, force: true }); }
});

test('A2 解构读算读，且 `{xx: yy}` 只算读了属性 xx（不许把本地别名当成读）', () => {
    const t = scratch({
        'w.js': 'const state = {};\nstate.alpha = 1;\nstate.beta = 1;\n',
        'r.js': 'const state = {};\nconst { alpha } = state;\nconst { xx: beta } = state;\n',
    });
    try {
        /* alpha 被 `{ alpha }` 读；beta 只作为本地别名出现（属性名是 xx）⇒ 仍算没读 */
        assert.deepEqual(fields(t), ['beta'],
            '`const { alpha } = state` 算读；`{ xx: beta }` 读的是属性 xx，不是 beta');
    } finally { fs.rmSync(t, { recursive: true, force: true }); }
});

test('A3 字符串键读与复合赋值都算读（读改写不是死写）', () => {
    const t = scratch({
        'w.js': 'const state = {};\nstate.strKey = 1;\nstate.plusKey = 1;\n',
        'r.js': 'const state = {};\nconst a = state["strKey"];\nstate.plusKey += 1;\n',
    });
    try {
        assert.deepEqual(fields(t), [], '字符串键读与 `+=` 都必须算读');
    } finally { fs.rmSync(t, { recursive: true, force: true }); }
});

test('B1 空清单必须自证：分母为 0 ⇒ proven=false + CLI exit 2（与「有欠账 exit 1」不同形）', () => {
    /* 两档都端到端跑 CLI：① 空目录（0 个文件）；② 有文件但 0 个写入点。
     * 两种「扫描面为空」都必须 exit 2 —— 不是 0（0 等于宣布「没问题」），也不是 1（1 是「有欠账」）。 */
    const runCli = (dir) => {
        try {
            const out = execFileSync('node', ['tools/scan_write_only_fields.mjs'], { cwd: dir, encoding: 'utf8' });
            return { code: 0, out, err: '' };
        } catch (e) {
            return { code: e.status, out: String(e.stdout || ''), err: String(e.stderr || '') };
        }
    };
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'wo-empty-'));
    try {
        fs.mkdirSync(path.join(empty, 'tools'));
        fs.copyFileSync(path.join(ROOT, 'tools', 'scan_write_only_fields.mjs'),
            path.join(empty, 'tools', 'scan_write_only_fields.mjs'));
        const { findings, scope } = scanRepoSelfProof(empty);
        assert.deepEqual(findings, [], '空树当然没有发现 —— 正因为如此，它不可被当作「没问题」');
        assert.equal(scope.proven, false, '分母为 0 时 proven 必须是 false（空清单不许当绿）');
        assert.match(scope.why, /0 个文件/, 'why 必须点名扫到了什么，实：' + scope.why);
        const r = runCli(empty);
        assert.equal(r.code, 2, '空目录必须 exit 2（fail-closed），实 rc=' + r.code);
        assert.match(r.err, /扫描面为空/, 'CLI 必须点名「扫描面为空」而不是静默通过');

        /* ② 有文件、有字节，但一个写入点都没有 —— 这条更阴险：文件数看着正常，问题数是 0 */
        const noWrites = fs.mkdtempSync(path.join(os.tmpdir(), 'wo-nowrite-'));
        try {
            fs.mkdirSync(path.join(noWrites, 'tools'));
            fs.copyFileSync(path.join(ROOT, 'tools', 'scan_write_only_fields.mjs'),
                path.join(noWrites, 'tools', 'scan_write_only_fields.mjs'));
            fs.writeFileSync(path.join(noWrites, 'plain.js'), 'const state = {};\nconst x = 1;\n');
            const s2 = scanRepoSelfProof(noWrites).scope;
            assert.equal(s2.proven, false, '有文件但 0 写入点也必须 proven=false');
            assert.match(s2.why, /0 个写入点/, 'why 必须点名「0 个写入点」，实：' + s2.why);
            const r2 = runCli(noWrites);
            assert.equal(r2.code, 2, '0 写入点必须 exit 2，实 rc=' + r2.code);
        } finally { fs.rmSync(noWrites, { recursive: true, force: true }); }
    } finally { fs.rmSync(empty, { recursive: true, force: true }); }
});

test('B2 真盘分母（空清单不可用的地方，必须先给出扫了什么）', () => {
    assert.equal(SCAN.scope.proven, true, '真盘扫描面必须自证成立');
    assert.ok(SCAN.scope.filesScanned >= 390, '扫描文件数偏低：' + SCAN.scope.filesScanned);
    assert.ok(SCAN.scope.writeSites >= 300, '写入点偏低：' + SCAN.scope.writeSites);
    assert.ok(SCAN.scope.distinctFields >= 200, '字段数偏低：' + SCAN.scope.distinctFields);
    assert.ok(SCAN.scope.readSites >= 1000, '读取点偏低：' + SCAN.scope.readSites);
    assert.ok(SCAN.scope.crossFileReads > 0, '跨文件读必须 > 0（否则「键级」这件事在本仓没被测到）');
});

test('B3 台账双向：清单每一条都有处置，处置里每一条都还在清单上', () => {
    const found = SCAN.findings.map((f) => f.field).sort();
    const ledgerFields = (LEDGER.entries || []).map((e) => e.field).sort();
    const missing = found.filter((f) => !ledgerFields.includes(f));
    const rotten = ledgerFields.filter((f) => !found.includes(f));
    assert.deepEqual(missing, [], '未处置的写无读字段：' + missing.join(', '));
    assert.deepEqual(rotten, [], '已修掉却还挂在台账里（豁免也双向）：' + rotten.join(', '));
});

test('B4 台账卫生：class 在词表内，理由有实质，且 class 与 evidence 自洽', () => {
    const VOCAB = new Set(['dead-write', 'test-only-read', 'mention-this-receiver', 'mention-other-receiver', 'mention-string-key', 'mention-same-name-local']);
    const GREY = /约定如此|历史遗留|待后续|暂不|以后再说|TODO/;
    assert.ok(Array.isArray(LEDGER.entries) && LEDGER.entries.length > 0, '台账不可为空壳');
    for (const e of LEDGER.entries) {
        assert.ok(VOCAB.has(e.class), e.field + ' 的 class 不在词表内：' + e.class);
        assert.ok(typeof e.reason === 'string' && e.reason.length >= 20, e.field + ' 的理由太短（无理由登记无效）');
        assert.ok(!GREY.test(e.reason), e.field + ' 的理由是灰标签：' + e.reason);
        assert.ok(typeof e.read === 'string' && e.read.length > 3, e.field + ' 必须写清读点在哪（哪怕是「全仓 0 处」）');
        const ev = e.evidence || {};
        assert.ok(ev.write_sites >= 1, e.field + ' 的写入站点数必须 ≥1');
        if (e.class === 'dead-write' || e.class === 'test-only-read') {
            assert.equal(ev.product_mentions, 0, e.field + ' 判成 ' + e.class + ' ⇒ 产品侧提及必须为 0');
        } else {
            assert.ok(ev.product_mentions > 0, e.field + ' 判成 ' + e.class + ' ⇒ 产品侧提及必须 > 0');
            assert.ok(Array.isArray(ev.product_mention_sites) && ev.product_mention_sites.length > 0,
                e.field + ' 必须给出可复验的提及站点');
        }
        if (e.class === 'test-only-read') assert.ok(ev.test_mentions > 0, e.field + ' 判成只被测试读 ⇒ 测试提及必须 > 0');
        if (e.class === 'dead-write') assert.equal(ev.test_mentions, 0, e.field + ' 判成真死写 ⇒ 测试提及也必须为 0');
    }
});

test('C1 证据可复验：mention-* 的站点仍在盘上、仍含该字段、且不是写入点', () => {
    const srcCache = new Map();
    const readSrc = (rel) => {
        if (!srcCache.has(rel)) srcCache.set(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n'));
        return srcCache.get(rel);
    };
    let checked = 0;
    for (const e of LEDGER.entries) {
        if (!e.class.startsWith('mention-')) continue;
        const writeSites = new Set(SCAN.findings.find((f) => f.field === e.field).writes);
        for (const site of e.evidence.product_mention_sites) {
            const i = site.lastIndexOf(':');
            const rel = site.slice(0, i);
            const line = Number(site.slice(i + 1));
            const text = (readSrc(rel)[line - 1] || '');
            assert.ok(text.includes(e.field), e.field + ' 的证据站点 ' + site + ' 已经不含该字段（台账腐烂）');
            assert.ok(!/^\s*(?:engine|state)\s*\.\s*/.test(text) || !text.includes(e.field + ' ='),
                e.field + ' 的证据站点 ' + site + ' 其实是写入点，不是读点');
            assert.ok(!writeSites.has(site), e.field + ' 的证据站点 ' + site + ' 在写入点清单里');
            checked += 1;
        }
    }
    assert.ok(checked > 0, '必须真的复验到站点（否则这条判据是空转）');
});

test('C2 证据可复验：dead-write / test-only-read 的产品侧提及必须真的是 0（重读盘）', () => {
    const productFiles = [];
    const walk = (dir) => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist' || ent.name === 'tests') continue;
            const p = path.join(dir, ent.name);
            const rel = path.relative(ROOT, p).split(path.sep).join('/');
            if (ent.isDirectory()) { if (rel !== 'tools') walk(p); continue; }
            if (ent.name.endsWith('.js')) productFiles.push({ rel, text: fs.readFileSync(p, 'utf8') });
        }
    };
    walk(ROOT);
    let checked = 0;
    for (const e of LEDGER.entries) {
        if (e.class !== 'dead-write' && e.class !== 'test-only-read') continue;
        const writeSites = new Set(SCAN.findings.find((f) => f.field === e.field).writes);
        const re = new RegExp('\\b' + e.field.replace(/\$/g, '\\$') + '\\b');
        for (const { rel, text } of productFiles) {
            const lines = text.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (!re.test(lines[i])) continue;
                assert.ok(writeSites.has(rel + ':' + (i + 1)),
                    e.field + ' 被判成 ' + e.class + '，但产品侧还有非写入提及：' + rel + ':' + (i + 1));
            }
        }
        checked += 1;
    }
    assert.ok(checked > 0, '必须真的复验到条目');
});

test('D1 负控制：塞一个真死写 ⇒ 必须点名它，且不牵连别的字段', () => {
    const t = scratch({
        'w.js': 'const engine = {};\nengine.deadZField = 1;\n',
        'r.js': 'const engine = {};\nconst alive = engine.aliveField;\nengine.aliveField = 2;\n',
    });
    try {
        assert.deepEqual(fields(t), ['deadZField'], '必须只点名真死写（不许多报 aliveField）');
    } finally { fs.rmSync(t, { recursive: true, force: true }); }
});

test('D2 负控制：给死写补一行读 ⇒ 必须从清单里消失（读点真的在起作用，不是名单放行）', () => {
    const t = scratch({
        'w.js': 'const engine = {};\nengine.deadZField = 1;\nfunction r() { return engine.deadZField; }\n',
    });
    try {
        assert.deepEqual(fields(t), [], '补了读点还报，说明判据靠名单而不是靠盘面');
    } finally { fs.rmSync(t, { recursive: true, force: true }); }
});

test('E1 单一真源：台账必须逐字节等于生成器输出（手改台账必红），且判据不另写读点正则', () => {
    const onDisk = fs.readFileSync(LEDGER_PATH, 'utf8');
    const expected = JSON.stringify(BUILD.ledger, null, 2) + '\n';
    assert.equal(onDisk, expected, '台账与生成器输出不一致 —— 手改过的理由会烂掉，重跑 node tools/gen_write_only_disposal.mjs');
    assert.match(LEDGER.generator || '', /gen_write_only_disposal/, '台账必须写明它由生成器写');
    const self = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
    assert.match(self, /from '\.\.\/tools\/scan_write_only_fields\.mjs'/, '判据必须 import 扫描器（不得自带一份读判定）');
    assert.match(self, /from '\.\.\/tools\/gen_write_only_disposal\.mjs'/, '判据必须 import 生成器（不得自带一份处置逻辑）');
    assert.equal(BUILD.ledger.entries.length, SCAN.findings.length, '处置条数必须等于清单条数');
});