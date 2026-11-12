/* ============================================================
 * tests/v21_o4c_umd_reload_idempotent.test.mjs — v3.465.2
 * 第二十一期收账轮第三刀：UMD 包装模块的「重复加载必须幂等」
 * ------------------------------------------------------------
 * 【这一刀修的是什么】
 * v3.461.0 把 36 个 R18 内核从 ESM 改成 UMD。改的时候只换了**尾巴**，
 * 类体仍留在文件顶层：
 *     class Foo { ... }                 ← 顶层词法声明
 *     (function (root, factory) { ... }(globalThis, function () {
 *         'use strict'; return Foo;
 *     }));
 * 每一次加载都成功，`node --check` 也过 —— 语法合法。
 * 但 `class` 是 lexical binding，落在全局词法作用域里不可二次声明，
 * 同一经典脚本上下文再跑一遍同一份源码 ⇒
 *     SyntaxError: Identifier 'Foo' has already been declared
 *
 * 【怎么发现的（不是设想，是真跑出来的）】
 * v3.465.1 收账时跑 `v3159 [2d]`（健康树上每个审计脚本都必须 exit 0），
 * 它报 `scan_v3193_host_matrix.mjs` 失败；进去看，M3 段点名 36 个脚本
 * 「第二次加载抛异常」。两个判据、同一根因 —— 一条真缺陷两处现形。
 *
 * 【为什么不是「改 36 个文件就完了」】
 * 改完就完了，下一批新增内核会原样再犯 —— 因为**没有任何门盯形态**。
 * M3 只在 `scan_v3193_host_matrix` 里抽样观测（它靠真加载，只报「抛了」），
 * 而形态是可静态枚举的：本判据把 manifest 全量 365 个模块都过一遍。
 *
 * 【判据结构】
 *   A 判定体自身（纯函数 / 边界 / 不误伤 var）
 *   B 真仓全量形态（365 模块 + 点名 36 个已知修复点）
 *   C 真仓真加载（同一 context 跑两遍，不许抛）
 *   D 负控制（把类体搬回顶层 ⇒ 必须红；把 UMD 尾巴去掉 ⇒ 不误判为红）
 *   E 纯度（判定体不得 import fs；判定体与真源在真实文件上判定一致）
 *   F 自防护 + 当版锚
 * ============================================================ */
import fs from 'fs';
import path from 'path';
import vm from 'node:vm';
import { fileURLToPath } from 'url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { stripComments } from './_audit_lib.mjs';
import {
    QUESTION, BOUNDARY, stripCommentsLite, umdStartLine,
    topLevelLexicalDecls, judgeSource, judgeAll, issueLines,
} from './audit/_umd_reload_judge.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SELF = read('tests/v21_o4c_umd_reload_idempotent.test.mjs');
const BORN_V = '3.465.2';
const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
const idxVersion = () => (/const VERSION = '([0-9.]+)'/.exec(read('index.js')) || [])[1];

/* 本次修复的 36 个文件（硬枚举，防「修了 35 个也算过」）。
 * 这份名单**不是**判据的主依据 —— B1 看的是 manifest 全量形态；
 * 它只用来钉住「这一刀具体修了哪些」，改动即为口径变更，需人确认。 */
const FIXED_36 = [
    'active-reminiscence-epiphany-engine.js', 'adaptive-attention-budget-balancer.js',
    'async-indexing-pipeline-debouncer.js', 'biomimetic-hebbian-salience-curator.js',
    'cognitive-scatoma-denial-guard.js', 'confabulation-mandela-reconstruct-engine.js',
    'counterfactual-whatif-regret-matrix.js', 'cross-session-identity-reconciliation.js',
    'daydream-spontaneous-wandering-engine.js', 'dissociative-persona-mask-matrix.js',
    'dramatic-reveal-catharsis-hub.js', 'embodied-micro-mannerism-habits.js',
    'emotional-inertia-mood-residue-engine.js', 'engine-symphony-wave-scheduler.js',
    'epistemic-boundary-auditor.js', 'epistemic-four-bucket-guard.js',
    'hesitation-subtext-microflow-engine.js', 'hierarchical-compaction-ledger.js',
    'latent-social-debt-reciprocity-matrix.js', 'long-term-covenant-breach-resonator.js',
    'memory-conflict-healing-arbitrator.js', 'memory-salience-decay-curator.js',
    'metaphorical-dream-synthesizer.js', 'multi-agent-spatial-temporal-resolver.js',
    'multi-faction-game-conspiracy-coordinator.js', 'prompt-budget-dynamic-allocator.js',
    'proustian-synesthesia-recall-engine.js', 'realtime-conflict-graph-rollback.js',
    'rumor-entropy-gossip-diffusion.js', 'runtime-memory-reset-guard.js',
    'state-machine-chaos-monkey-resilience.js', 'temporal-flashbulb-dilation-engine.js',
    'tiered-storage-tiered-compaction-ledger.js', 'ui-telemetry-metrics-visualizer.js',
    'vector-semantic-sparse-hybrid-retrieval.js', 'zeigarnik-unresolved-gestalt-loop.js',
];

const MANIFEST = JSON.parse(read('manifest.json'));
const ALL_MODULES = (MANIFEST.extra_js || []).filter((f) => f.endsWith('.js'));
const modules = ALL_MODULES
    .filter((f) => fs.existsSync(path.join(ROOT, f)))
    .map((f) => ({ file: f, src: read(f) }));

/** 经典脚本沙箱：只给最小宿主面（与 v3461 的 classicSandbox 同口径但不复用 ——
 *  那一个是那个判据的夹具，两个夹具各自演进比强行共享更稳）。 */
function classicSandbox() {
    const noop = () => {};
    const el = () => ({
        style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
        appendChild: noop, setAttribute: noop, removeAttribute: noop,
        addEventListener: noop, removeEventListener: noop, querySelector: () => null,
        querySelectorAll: () => [], innerHTML: '', textContent: '', dataset: {},
    });
    const ctx = {
        console: { log: noop, warn: noop, error: noop, info: noop, debug: noop },
        setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
        requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        navigator: { userAgent: 'assert' }, location: { href: 'http://localhost/' },
        document: {
            createElement: el, querySelector: () => null, querySelectorAll: () => [],
            addEventListener: noop, head: el(), body: el(), documentElement: el(),
            readyState: 'complete',
        },
        performance: { now: () => 0 },
        fetch: () => Promise.resolve({ ok: false, json: async () => ({}) }),
        SillyTavern: { getContext: () => null, eventSource: { on: noop, off: noop, emit: noop }, libs: {} },
        addEventListener: noop, removeEventListener: noop,
    };
    ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
    return vm.createContext(ctx);
}

/* ══════════════ A 判定体自身 ══════════════ */
test('A1 判定体是纯函数：不 import fs / 不读盘 / 不碰网络', () => {
    const src = read('tests/audit/_umd_reload_judge.mjs');
    const code = stripComments(src);
    assert.ok(!/^\s*import\s/m.test(code), '判定体不得有任何 import（它要能在任意源码上当夹具跑）');
    assert.ok(!/\brequire\s*\(/.test(code), '判定体不得 require');
    assert.ok(!/\bfetch\s*\(/.test(code), '判定体不得发请求');
    assert.ok(typeof QUESTION === 'string' && QUESTION.length > 20, 'QUESTION 必须写成一句话问题');
    assert.ok(Array.isArray(BOUNDARY) && BOUNDARY.length >= 3, 'BOUNDARY 至少三条诚实边界');
    assert.ok(BOUNDARY.some((b) => /不证明真机/.test(b)), '必须写明「不证明真机行为」');
});

test('A2 剥注释不误伤字符串：模板串与引号里的 // 与 /* 必须原样保留', () => {
    const src = 'const a = "http://x/y";\nconst b = `/* not a comment */`;\n// real\nconst c = 1;\n';
    const out = stripCommentsLite(src);
    assert.ok(out.includes('http://x/y'), '字符串里的 // 被剥了（会把真代码剥掉）');
    assert.ok(out.includes('/* not a comment */'), '模板串里的 /* 被剥了');
    assert.ok(!out.includes('real'), '真注释没被剥');
    assert.equal(out.split('\n').length, src.split('\n').length, '剥注释必须保留行数（否则行号全错）');
});

test('A3 只认 UMD 尾巴：裸脚本（无 UMD 包装）不得被判红', () => {
    const bare = 'class Bare {}\nconst x = 1;\n';
    const r = judgeSource(bare);
    assert.equal(r.isUmd, false, '裸脚本不是 UMD，不该进入本判据的射程');
    assert.deepEqual(r.issues, [], '裸脚本不得报问题（它本来就不承诺可重载）');
});

test('A4 不误伤 var：var 不是 lexical binding，重复加载不抛，不得算进问题', () => {
    const src = 'var legacy = 1;\n(function (root, factory) {\n  module.exports = factory();\n}(globalThis, function () { return 1; }));\n';
    const r = judgeSource(src);
    assert.deepEqual(r.issues, [], 'var 被算进问题 = 判据过宽（会逼人改无书的代码）');
    assert.ok(umdStartLine(stripCommentsLite(src).split('\n')) === 1, 'UMD 起始行识别错');
});

test('A5 声明枚举正确：class/const/let/function 四种都要收到，且行号是 1 基', () => {
    const src = 'class A {}\nconst b = 1;\nlet c = 2;\nfunction d() {}\n';
    const decls = topLevelLexicalDecls(src.split('\n'), -1);
    assert.deepEqual(decls.map((d) => d.kind), ['class', 'const', 'let', 'function']);
    assert.deepEqual(decls.map((d) => d.line), [1, 2, 3, 4]);
});

/* ══════════════ B 真仓全量形态 ══════════════ */
test('B1 ★★★ 全量 365 模块形态干净：UMD 尾巴之外不得有任何顶层词法声明', () => {
    assert.ok(modules.length >= 300, '模块数过少，装载面可能塌陷：' + modules.length);
    const bad = judgeAll(modules);
    assert.deepEqual(issueLines(bad), [],
        '这些模块在第二次加载时会抛 SyntaxError（详见每行）：\n' + issueLines(bad).join('\n'));
});

test('B2 ★★ 本次修复的 36 个文件必须真在名单里且真已修好', () => {
    assert.equal(FIXED_36.length, 36, '名单长度被改了？改动即为口径变更，需人确认');
    const missing = FIXED_36.filter((f) => !ALL_MODULES.includes(f));
    assert.deepEqual(missing, [], '名单里的文件不在 manifest.extra_js 里：' + missing.join(', '));
    const still = FIXED_36.filter((f) => judgeSource(read(f)).issues.length > 0);
    assert.deepEqual(still, [], '这些文件仍是「类体在 UMD 外」的旧形态：' + still.join(', '));
});

test('B3 ★★ 修复不得丢掉 CJS 分支与全局挂载（只搬位置，不改语义）', () => {
    const bad = [];
    for (const f of FIXED_36) {
        const code = stripComments(read(f));
        if (!/module\.exports\s*=/.test(code)) bad.push(f + '（丢了 module.exports）');
        if (!/root\.[A-Za-z_$][\w$]*\s*=/.test(code)) bad.push(f + '（丢了全局挂载）');
        if (!/return\s+[A-Za-z_$][\w$]*\s*;/.test(code)) bad.push(f + '（factory 没有 return）');
    }
    assert.deepEqual(bad, [], '搬类体时改坏了 UMD 尾巴：' + bad.join(' | '));
});

/* ══════════════ C 真仓真加载 ══════════════ */
test('C1 ★★★★ 真加载两遍不抛：36 个文件在同一 context 里跑两次必须都成功', () => {
    const sandbox = classicSandbox();
    const bad = [];
    for (const f of FIXED_36) {
        const code = read(f);
        try {
            vm.runInContext(code, sandbox, { filename: f });
        } catch (e) {
            bad.push(f + ' 第一次就抛：' + e.message);
            continue;
        }
        try {
            vm.runInContext(code, sandbox, { filename: f });
        } catch (e) {
            bad.push(f + ' 第二次抛：' + e.message);
        }
    }
    assert.deepEqual(bad, [], '重复加载不幂等（本判据存在的唯一理由）：' + bad.join(' | '));
});

test('C2 ★★ 真加载后全局仍可取：挂载名不得因搬位置而消失', () => {
    const sandbox = classicSandbox();
    const bad = [];
    for (const f of FIXED_36) {
        const code = read(f);
        try { vm.runInContext(code, sandbox, { filename: f }); } catch { continue; }
        /* 从 UMD 尾巴里抠 `root.Xxx = api` 的那个名字 —— 只认这一种写法（本仓 36 个全是它）。 */
        const m = /root\.([A-Za-z_$][\w$]*)\s*=\s*api/.exec(code);
        if (!m) { bad.push(f + '（找不到 root.X = api 挂载）'); continue; }
        if (typeof sandbox[m[1]] === 'undefined') bad.push(f + ' → ' + m[1] + ' 未挂上');
    }
    assert.deepEqual(bad, [], '搬位置后全局取不到：' + bad.join(' | '));
});

/* ══════════════ D 负控制 ══════════════ */
test('D1 ★★★ 负控制：把类体搬回 UMD 外 ⇒ 判定体必须红，且真加载必须抛', () => {
    const f = 'hesitation-subtext-microflow-engine.js';
    const code = read(f);
    /* 把 factory 里的 class 行移到文件最前 —— 复刻当时的真实形态。 */
    const lines = code.split('\n');
    const clsIdx = lines.findIndex((l) => /^\s{4}class\s+HesitationSubtextMicroflowEngine/.test(l));
    assert.ok(clsIdx > 0, '找不到被搬进去的 class 行（夹具漂移）');
    const clsLine = lines[clsIdx].replace(/^\s{4}/, '');
    /* 连同类体一起搬：找配平结束。 */
    let depth = 0;
    let end = clsIdx;
    for (let i = clsIdx; i < lines.length; i++) {
        for (const ch of lines[i]) { if (ch === '{') depth++; else if (ch === '}') depth--; }
        if (depth === 0) { end = i; break; }
    }
    const body = lines.slice(clsIdx, end + 1).map((l) => (l.startsWith('    ') ? l.slice(4) : l));
    body[0] = clsLine;
    const broken = body.join('\n') + '\n' + lines.slice(0, clsIdx).join('\n')
        + '\n' + lines.slice(end + 1).join('\n');
    const r = judgeSource(broken);
    assert.ok(r.issues.length >= 1, '复刻旧形态后判定体没报问题 —— 负控制空转');
    assert.match(r.issues[0], /already been declared/, '成因文案必须点名 SyntaxError 形态');
    const sandbox = classicSandbox();
    vm.runInContext(broken, sandbox, { filename: 'broken.js' });
    assert.throws(() => vm.runInContext(broken, sandbox, { filename: 'broken.js' }),
        /already been declared/, '复刻旧形态后第二次加载必须真抛（否则判据与真实行为脱节）');
});

test('D2 ★★ 负控制：把 UMD 尾巴整个去掉 ⇒ 不得判红（裸脚本不在射程内）', () => {
    const f = 'hesitation-subtext-microflow-engine.js';
    const code = read(f);
    const lines = code.split('\n');
    const umd = umdStartLine(lines);
    assert.ok(umd > 0, '找不到 UMD 起始（夹具漂移）');
    const bare = lines.slice(0, umd).join('\n');
    assert.deepEqual(judgeSource(bare).issues, [], '裸脚本被判红 = 判据过宽');
});

test('D3 ★★★ 负控制：36 个里任意一个退回旧形态 ⇒ B1 同款全量判据必须红', () => {
    const f = 'zeigarnik-unresolved-gestalt-loop.js';
    const code = read(f);
    const lines = code.split('\n');
    const clsIdx = lines.findIndex((l) => /^\s{4}class\s+ZeigarnikUnresolvedGestaltLoop/.test(l));
    assert.ok(clsIdx > 0, '夹具漂移：找不到 class 行');
    let depth = 0;
    let end = clsIdx;
    for (let i = clsIdx; i < lines.length; i++) {
        for (const ch of lines[i]) { if (ch === '{') depth++; else if (ch === '}') depth--; }
        if (depth === 0) { end = i; break; }
    }
    const body = lines.slice(clsIdx, end + 1).map((l) => (l.startsWith('    ') ? l.slice(4) : l));
    const broken = body.join('\n') + '\n' + lines.slice(0, clsIdx).join('\n')
        + '\n' + lines.slice(end + 1).join('\n');
    const mutated = modules.map((m) => (m.file === f ? { file: m.file, src: broken } : m));
    const bad = judgeAll(mutated);
    assert.deepEqual(bad.map((b) => b.file), [f],
        '退回旧形态的那个文件必须被点名，且只有它：' + JSON.stringify(bad.map((b) => b.file)));
});

/* ══════════════ E 纯度 ══════════════ */
test('E1 ★★ 判据纯度：判定体必须真被 import，不得在判据里另写一份', () => {
    const code = stripComments(SELF);
    assert.ok(/from '\.\/audit\/_umd_reload_judge\.mjs'/.test(code), '必须从判定体 import');
    /* 判据里不得再出现「自己算顶层词法声明」的写法 —— 那是第二真源。 */
    assert.ok(!/class\|const\|let\|function/.test(code), '判据里不得另写一份声明识别正则');
});

test('E2 ★★ 判定体与真源在真实文件上判定一致（防剥注释器漂移）', () => {
    /* 本判定体自带一个最小剥注释器（理由写在它头部）。为防它与真源漂移，
     * 这里用**真源**剥一遍、再用本判定体剥一遍，在 36 个文件上比对「顶层声明」结论。 */
    const bad = [];
    for (const f of FIXED_36) {
        const code = read(f);
        const viaMine = topLevelLexicalDecls(stripCommentsLite(code).split('\n'), -1);
        const viaTrue = topLevelLexicalDecls(stripComments(code).split('\n'), -1);
        const a = viaMine.map((d) => d.kind + ':' + d.name).sort().join(',');
        const b = viaTrue.map((d) => d.kind + ':' + d.name).sort().join(',');
        if (a !== b) bad.push(f + ' | mine=' + a + ' | true=' + b);
    }
    assert.deepEqual(bad, [], '剥注释器与真源判定不一致：' + bad.join(' | '));
});

/* ══════════════ F 自防护 + 当版锚 ══════════════ */
test('F1 ★★ 自防护：本判据不得被掏空', () => {
    assert.ok(SELF.length > 8000, '本档不得被掏空');
    assert.ok(/assert\.deepEqual\(issueLines\(bad\), \[\]/.test(SELF), 'B1 的核心断言必须还在');
    assert.ok(FIXED_36.length === 36, '名单不得被删减');
});

test('F2 ★★ 当版锚：本档生于 ' + BORN_V + '，四源同源且版本不倒退', () => {
    const cur = idxVersion();
    assert.ok(vnum(cur) >= vnum(BORN_V), '当版 ' + cur + ' 不得早于本档出生版 ' + BORN_V);
    assert.equal(JSON.parse(read('package.json')).version, cur, 'package.json 与 index.js 不同源');
    assert.equal(JSON.parse(read('manifest.json')).version, cur, 'manifest.json 与 index.js 不同源');
    assert.ok(SELF.includes('BORN_V = ' + "'" + BORN_V + "'"), '自锚常量必须留在本档');
});
