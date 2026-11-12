/* tests/v3461_r18_wiring_truth.test.mjs — v3.461.0 第十八期接线真源判据 */
import fs from 'fs';
import path from 'path';
import vm from 'node:vm';
import { fileURLToPath } from 'url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}

/* ============================================================
 * 本套件的存在理由（这一版修的是什么，判据就要盯什么）
 * ------------------------------------------------------------
 * v3.461.0 的接线修复不是「补几行代码」，而是修一类**假绿与假红同源**的账错：
 *   A. 36 个 R18 引擎曾是 `export class` 形态，而宿主 extra_js、审计沙箱、
 *      可选引擎注册表的 require 全按**经典脚本**加载 —— `export` 在那里是语法错误，
 *      于是这些模块在真机上**从未挂载成功过**（单测全绿，因为 import 能读 ESM）。
 *   B. 于是 13 个取库口写的是「文件实际没有挂的那个名字」，14 个消费方又按错名去取。
 *   C. 持久化水合表第 3 列登记的是「**期望**的全局名」——名字写错时它正是缺陷本身。
 *      把它当消费计入，会让「取错名」自证为绿（实测：B4 降 3，B3 当场冒出 12 个）。
 * 判据因此分三层：
 *   ① 形态：R18 引擎必须是经典脚本可加载的 UMD，且**真在沙箱里挂上全局**；
 *   ② 同源：水合表登记的全局名必须**逐一等于**该文件真实挂载名（错名只能报红）；
 *   ③ 出口：状态位不得由控制流无条件宣布（必须按实际就绪数派生）。
 * 这三层任一层放松，都会回到「全绿但真机取不到」的旧形态。
 * ============================================================ */

const R18_FILES = [
    'temporal-flashbulb-dilation-engine.js', 'dissociative-persona-mask-matrix.js',
    'confabulation-mandela-reconstruct-engine.js', 'proustian-synesthesia-recall-engine.js',
    'zeigarnik-unresolved-gestalt-loop.js', 'counterfactual-whatif-regret-matrix.js',
    'rumor-entropy-gossip-diffusion.js', 'cognitive-scatoma-denial-guard.js',
    'daydream-spontaneous-wandering-engine.js', 'tiered-storage-tiered-compaction-ledger.js',
    'realtime-conflict-graph-rollback.js', 'cross-session-identity-reconciliation.js',
    'floor-fingerprint-self-healer.js', 'causality-invariant-fuse-lock.js',
    'latent-social-bond-reciprocity-engine.js', 'unspoken-hesitation-subtext-engine.js',
    'engine-orchestration-ripple-bus.js',
];

/* 剥注释：本仓的教训注释里会**引用**被修掉的原文（如 `= true;` / `export class`），
 *   不剥注释会把教训本身当成缺陷 —— 这是「自证陷阱」的反向形态，实测踩到过。
 *
 * [v3.465.1] 这里原本本地重写了一份（只做两条正则替换）。v3.465.0 收 O9 时，
 *   `scan_audit_lib_consolidation` 的 N5 负控制被它拖红：N5 把整个 tests/ 镜像到临时
 *   目录再跑扫描器，扫描器在镜像里先报出「本文件仍在本地重写 stripComments」并以
 *   exit 1 提前退出，**兜底检查「漏接出口的 drift」根本没跑到** —— 即一份第二实现
 *   同时让「唯一真源」和「兜底自证」两项失去意义。
 *   真源版本严格更强（认字符串/模板串/正则字面量，且等长占位保证偏移不变），
 *   本文件的三处用法（查顶层 export / 查状态位门控 / 查成功日志门控）都只需要
 *   「注释不参与匹配」，故不存在「语义不同」的情形 —— 直接走真源，不登记 EXEMPT。
 */
import { stripComments } from './_audit_lib.mjs';

function classicSandbox() {
    const noop = () => {};
    const el = () => ({ style: {}, classList: { add: noop, remove: noop, toggle: noop }, appendChild: noop, setAttribute: noop, addEventListener: noop });
    const ctx = {
        console: { log: noop, warn: noop, error: noop, info: noop, debug: noop },
        setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
        requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        navigator: { userAgent: 'assert' }, location: { href: 'http://localhost/' },
        document: { createElement: el, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, head: el(), body: el(), documentElement: el() },
        performance: { now: () => 0 }, fetch: () => Promise.resolve({ ok: false, json: async () => ({}) }),
        SillyTavern: { getContext: () => null, eventSource: { on: noop, off: noop, emit: noop }, libs: {} },
        addEventListener: noop, removeEventListener: noop,
    };
    ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
    return vm.createContext(ctx);
}

/* 从文件里抽「这个文件会挂到全局的名字」——只认 UMD 尾巴与显式挂载，不做模糊猜测。
 * ★ 必须识**局部别名**：本仓大量内核写成
 *     `const g = (typeof globalThis !== 'undefined') ? globalThis : global;` … `g.LonShaX = api`
 *   （branch-canon.js / ledger-replay.js / volume-continuation.js 等 7 个都是这个形态）。
 *   只认字面量 `window.` 会把它们全漏掉 → 「真挂载」被判成「无人供给」（假红，实测 7 项）。 */
function mountedNames(code) {
    const names = new Set();
    const roots = ['window', 'global', 'globalThis', 'self', 'root'];
    /* ① 先收局部别名：`const g = (typeof globalThis !== 'undefined') ? globalThis : global;`
     *   本仓 7 个内核用 `g.LonShaX = api` 挂载，只认字面量 window 会把它们全判成「无人供给」。 */
    for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*[^;\n]*(?:globalThis|global|window|self)[^;\n]*;/g)) {
        if (!roots.includes(m[1])) roots.push(m[1]);
    }
    /* ② 一处挂载：`<root>.Name = ...`（只认已知根名，避免把任意 obj.X 算成全局） */
    for (const m of code.matchAll(/([A-Za-z_$][A-Za-z0-9_$]*)\s*\.\s*(LonSha[A-Za-z0-9_]*|[A-Z][A-Za-z0-9_]*)\s*=(?!=)/g)) {
        if (roots.includes(m[1])) names.add(m[2]);
    }
    /* ③ 批量挂载：`Object.assign(<root>, { A, B, ... })` */
    for (const m of code.matchAll(/Object\s*\.\s*assign\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*,\s*\{([\s\S]{0,1500}?)\}\s*\)/g)) {
        if (!roots.includes(m[1])) continue;
        for (const n of m[2].matchAll(/([A-Za-z_$][A-Za-z0-9_$]*)\s*[:,]/g)) names.add(n[1]);
    }
    return names;
}

test('A1 形态：R18 引擎不得有顶层 export（经典脚本会整文件抛错）', () => {
    const bad = [];
    for (const f of R18_FILES) {
        const code = read(f);
        assert.ok(code.length > 0, f + ' 必须存在');
        if (/^\s*export\s+(default|class|const|function|\{)/m.test(stripComments(code))) bad.push(f);
    }
    assert.deepStrictEqual(bad, [],
        '这些文件仍是 ESM 形态，宿主 extra_js 与审计沙箱按经典脚本加载时整文件不执行：' + bad.join(', '));
});

test('A2 真挂载：每个 R18 引擎在经典脚本沙箱里真的挂上了全局', () => {
    const missing = [];
    for (const f of R18_FILES) {
        const code = read(f);
        const expect = mountedNames(code);
        assert.ok(expect.size > 0, f + ' 必须至少挂一个全局名（否则取库口永远取不到）');
        const sandbox = classicSandbox();
        try {
            vm.runInContext(code, sandbox, { filename: f });
        } catch (e) {
            missing.push(f + '（加载抛错：' + e.message + '）');
            continue;
        }
        for (const n of expect) {
            if (typeof sandbox[n] === 'undefined') missing.push(f + ' → ' + n);
        }
    }
    assert.deepStrictEqual(missing, [], '这些引擎挂着「真加载成功」的名义但沙箱里取不到全局：' + missing.join(', '));
});

test('A3 形态：UMD 尾巴必须保留 CJS 导出（测试与注册表靠 require 取它）', () => {
    const bad = R18_FILES.filter((f) => !/module\.exports\s*=/.test(read(f)));
    assert.deepStrictEqual(bad, [], '转成 UMD 时丢了 CJS 分支，测试与可选引擎注册表会 require 到空：' + bad.join(', '));
});

test('B1 同源：持久化水合表第 3 列必须等于该文件真实挂载名', () => {
    const src = read('engine-persistence-ops.js');
    const rows = [];
    for (const line of src.split('\n')) {
        const m = /\[\s*'(lonsha[A-Za-z0-9]*State)'\s*,\s*'(_[A-Za-z0-9]+State)'\s*,\s*'([A-Za-z_$][A-Za-z0-9_$]*)'\s*,\s*'([^']+\.js)'\s*,\s*'([A-Za-z0-9_]+)'\s*\]/.exec(line);
        if (m) rows.push({ ext: m[1], prop: m[2], glob: m[3], file: m[4], hydrator: m[5] });
    }
    assert.ok(rows.length >= 40, '水合表行数不得塌陷，实际 ' + rows.length);
    const bad = [];
    for (const r of rows) {
        const p = path.join(ROOT, r.file);
        assert.ok(fs.existsSync(p), '水合表登记了不存在的文件：' + r.file);
        const real = mountedNames(read(r.file));
        if (!real.has(r.glob)) {
            bad.push(r.file + ' 登记 ' + r.glob + '，真实挂载 ' + ([...real].join('/') || '（无）'));
        }
    }
    assert.deepStrictEqual(bad, [],
        '登记名与真实挂载名不一致 —— 恢复存档时按登记名取库会静默降级成 undefined（浏览器无 require 兜底）：\n  '
        + bad.join('\n  '));
});

test('B2 同源：取库口与消费方不得引用「文件里不存在的挂载名」', () => {
    /* index.js 里 `window.LonShaX` / `typeof LonShaX` 引用的每个 LonSha* 名，
     *   要么是某文件真的挂的全局，要么是 index.js 自己 defineProperty/赋值出来的。
     *   这一条正是本轮 13 + 14 处错名的回归位（写错名时两边都对不上）。 */
    const allFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith('.js'));
    const provided = new Set();
    for (const f of allFiles) for (const n of mountedNames(read(f))) provided.add(n);
    const index = read('index.js');
    for (const m of index.matchAll(/defineProperty\(\s*window\s*,\s*'([A-Za-z0-9_]+)'/g)) provided.add(m[1]);
    for (const m of index.matchAll(/window\s*\.\s*([A-Za-z0-9_]+)\s*=/g)) provided.add(m[1]);

    const referenced = new Set();
    for (const m of index.matchAll(/window\s*\.\s*(LonSha[A-Za-z0-9_]*)/g)) referenced.add(m[1]);
    for (const m of index.matchAll(/typeof\s+(LonSha[A-Za-z0-9_]*)\s*!==\s*'undefined'/g)) referenced.add(m[1]);
    const dangling = [...referenced].filter((n) => !provided.has(n)).sort();
    assert.deepStrictEqual(dangling, [], 'index.js 按这些名字取库，但全仓没有任何文件挂它们：' + dangling.join(', '));
});

test('C1 出口：模块状态位不得被控制流无条件宣布为 true', () => {
    /* 这一类缺陷本轮抓到两次（evolution36Engines / v18Engines）：状态位落在 try 里
     *   **无条件**写 true，Cls 全为 null 时照样报「全量就绪」，紧接着还打成功日志。
     *   ★ 判据口径必须区分「有门控」与「无门控」：
     *     本仓 22 个引擎状态位写在 `if (lib && typeof lib[initFn] === 'function')` 里 ——
     *     那是**如实**的（取到了才置 true），把它一并报红等于把正确实现判成缺陷
     *     （首跑实测正是这样误报 26 项）。故口径 = 赋值前 400 字内没有任何 if 门控。 */
    const codeOnly = stripComments(read('index.js'));
    const offenders = [];
    for (const m of codeOnly.matchAll(/this\._moduleStatus\.([A-Za-z0-9_]+) = true;/g)) {
        const before = codeOnly.slice(Math.max(0, m.index - 400), m.index);
        if (!/if\s*\(/.test(before)) offenders.push(m[1]);
    }
    assert.deepStrictEqual(offenders, [],
        '这些状态位在没有门控的情况下被写成 true（应由实际就绪数派生）：' + offenders.join(', '));
    /* 三态派生必须真的在：v18 组要有可读读数面，且状态由计数派生。 */
    assert.ok(/_v18EnginesRead\s*=/.test(codeOnly), 'v18 组必须有可读的三态读数面 _v18EnginesRead');
    assert.ok(/status: v18Status/.test(codeOnly), 'v18 读数面必须带三态 status');
    assert.ok(/_evolution36Read\s*=/.test(codeOnly), 'evolution36 组必须保留三态读数面');
});

test('C2 出口：装载失败必须有警告出口（不得只有成功日志）', () => {
    const codeOnly = stripComments(read('index.js'));
    const okAnchor = '第十八期18项灵魂深潜主观认知失真引擎全量就绪并挂载';
    const at = codeOnly.indexOf(okAnchor);
    assert.ok(at > 0, 'v18 成功日志必须存在（否则出口被删）');
    /* 成功日志必须被 if 门控包住：向上 300 字内必须有 `if (v18Status === 'ok')`。 */
    const before = codeOnly.slice(Math.max(0, at - 300), at);
    assert.ok(/if \(v18Status === 'ok'\)/.test(before), '成功日志必须挂在三态判定的 ok 分支上');
    /* 失败出口必须在同一段：向后 800 字内出现 warn。 */
    const after = codeOnly.slice(at, at + 800);
    assert.ok(/console\.warn/.test(after), 'partial / unavailable 时必须走 warn（成功日志不能独占）');
});

test('D1 审计一致性：模块接线扫描器在本树上真通过（rc=0）', () => {
    const r = spawnSync('node', ['tests/audit/scan_module_wiring.mjs'], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
    assert.strictEqual(r.status, 0, '模块接线面仍有缺陷：\n' + (r.stdout || '') + (r.stderr || ''));
    assert.ok(/真加载成功 (\d+)\/\1/.test(r.stdout || ''), '必须报告「真加载成功 N/N」（挂了就是判据失效）');
});

test('D2 审计一致性：版本守卫在本树上真通过（rc=0）', () => {
    const r = spawnSync('node', ['tests/audit/scan_version_guard.mjs'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
    assert.strictEqual(r.status, 0, '版本面仍有缺陷：\n' + (r.stdout || '') + (r.stderr || ''));
    const cur = /const VERSION = '([0-9.]+)'/.exec(read('index.js'))[1];
    /* 本档自锚：当版号以**字面量**在此出现（V4 只数字面量形与自锚常量形，
     *   写成 vnum(cur) 会躲开字面量口径 → 判据失效，故显式锚字面量）。 */
    assert.equal(vnum('3.461.0'), 3461000, '本档锚点：当版号与 vnum 口径自洽');
    assert.ok(vnum(cur) >= 3461000, '当前版本低于本档出生版本，交棒方向反了');
});

test('D3 卫生：三个内核 VERSION 副本必须与入口同版', () => {
    /* V1b：抬版漏抬副本时，注入失败回落到副本本身 —— 那就是真实现，
     *   于是「版本读数是 3.461.0」只在注入成功时成立（假绿通道）。 */
    const cur = /const VERSION = '([0-9.]+)'/.exec(read('index.js'))[1];
    const copies = [];
    for (const f of ['memory-organs.js', 'memory-config.js', 'memory-core.js']) {
        const m = /let VERSION = '([0-9.]+)'/.exec(read(f));
        assert.ok(m, f + ' 必须有 VERSION 副本（注入回退路径靠它）');
        copies.push([f, m[1]]);
    }
    const stale = copies.filter(([, v]) => v !== cur);
    assert.deepStrictEqual(stale, [], '副本落后于入口（抬版漏抬副本）：' + stale.map(([f, v]) => f + '=' + v).join(', ') + '，入口=' + cur);
});