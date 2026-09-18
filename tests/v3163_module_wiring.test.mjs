// tests/v3163_module_wiring.test.mjs
// LonSha 记忆引擎 v3.163.0 —— 模块接线面治理（加载时类冲突 / 符号供给 / 消费面）
//
// 覆盖：
//   0  版本与审计脚本注册
//   1  静态判据正确性（顶层声明必须按花括号深度判定，不能按「行首列 0」）
//   2  合成夹具真跑扫描器（正样本 + 5 类负样本 + 退化树）
//   3  本次修复的消失证据（冲突类、IIFE 包裹、缓存绕过、增强版特征、4 参签名）
//   4  发布卫生
//
// 为什么用「真跑扫描器」而不是复刻逻辑：
//   被守卫的缺陷本身就是「静态看起来没问题、真加载才炸」，所以本测试的判据必须是
//   子进程真加载，而不是在本文件里再写一遍正则。
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCANNER = path.join(HERE, 'audit', 'scan_module_wiring.mjs');

const idx = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const ga = readFileSync(path.join(ROOT, 'graph_algorithms.js'), 'utf8');
const mc = readFileSync(path.join(ROOT, 'modules_combined.js'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');

function vnum(s) {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

/* ---------- 与扫描器一致的顶层声明判据（按花括号深度，非行首列） ---------- */
function stripLiterals(code) {
    let out = '';
    for (let i = 0; i < code.length; i++) {
        const c = code[i], n = code[i + 1];
        if (c === '/' && n === '/') { while (i < code.length && code[i] !== '\n') i++; out += '\n'; continue; }
        if (c === '/' && n === '*') { i += 2; while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++; i++; out += ' '; continue; }
        if (c === '"' || c === "'" || c === '`') {
            i++;
            while (i < code.length && code[i] !== c) { if (code[i] === '\\') i++; i++; }
            out += '""';
            continue;
        }
        out += c;
    }
    return out;
}
function topLevelDecls(code) {
    const clean = stripLiterals(code);
    const depthAt = new Int32Array(clean.length + 1);
    let depth = 0;
    for (let i = 0; i < clean.length; i++) {
        const c = clean[i];
        if (c === '{') depth++;
        else if (c === '}') depth = Math.max(0, depth - 1);
        depthAt[i] = depth;
    }
    const found = [];
    for (const m of clean.matchAll(/\b(class|function|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
        if (depthAt[m.index] === 0) found.push({ kind: m[1], name: m[2] });
    }
    return found;
}

/* ---------- 夹具基建 ---------- */
function makeRepo(dir, files) {
    mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
        writeFileSync(path.join(dir, name), content, 'utf8');
    }
}
function runScanner(cwd, extraEnv = {}) {
    const r = spawnSync(process.execPath, [SCANNER], {
        cwd,
        env: { ...process.env, LONSHA_AUDIT_FIXTURE: '1', ...extraEnv },
        encoding: 'utf8',
    });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const FIXTURE_INDEX = 'window.LonShaAlpha = window.LonShaAlpha || {};\nconsole.log(:0);\n';
const CLEAN_INDEX = 'const x = window.LonShaAlpha;\nconsole.log(x);\n';
const CLEAN_MOD = '(function (g) {\n  g.LonShaAlpha = { hi: 1 };\n})(typeof window !== "undefined" ? window : globalThis);\n';
const MANIFEST = (js, extra) => JSON.stringify({ js, extra_js: extra }, null, 2) + '\n';

function withTmp(name, fn) {
    const dir = path.join(os.tmpdir(), 'lonsha-wiring-' + name + '-' + process.pid + '-' + Date.now());
    try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

/* ---------- 0 ---------- */
test('【0】版本与审计脚本注册', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(idx)[1];
    assert.ok(vnum(v) >= vnum('3.175.0'), `index.js 版本 ${v} < 3.165.0`);
    assert.ok(vnum(manifest.version) >= vnum('3.175.0'), `manifest ${manifest.version} < 3.165.0`);
    const audits = readdirSync(path.join(HERE, 'audit')).filter(f => f.endsWith('.mjs')).sort();
    assert.ok(audits.length >= 7, `审计脚本应 >= 7 个，实际 ${audits.length}`);
    assert.ok(audits.includes('scan_module_wiring.mjs'), 'scan_module_wiring.mjs 未注册进审计目录');
});

/* ---------- 1 ---------- */
test('【1】静态判据：顶层声明必须按花括号深度判定', () => {
    // modules_combined.js 顶层只剩 MemoryVisualizer（冲突的 GraphDiffusion 已移除）
    const mcTop = topLevelDecls(mc).map(d => d.name);
    assert.deepStrictEqual(mcTop, ['MemoryVisualizer'], `modules_combined 顶层声明应只剩 MemoryVisualizer，实际 ${JSON.stringify(mcTop)}`);

    // graph_algorithms.js 已 IIFE 包裹 → 顶层零声明
    assert.deepStrictEqual(topLevelDecls(ga).map(d => d.name), [], 'graph_algorithms.js 顶层必须零声明（已 IIFE 包裹）');

    // 关键反例：IIFE 模块内部代码常不缩进，`const api = {...}` 落在第 0 列，
    //   按「行首列 0」判定会误判成顶层。深度判定必须给出空集。
    const cse = readFileSync(path.join(ROOT, 'cse-engine.js'), 'utf8');
    assert.ok(/^const api = \{/m.test(stripLiterals(cse)) || cse.includes('\nconst api = {'), '前提：cse-engine.js 内部确有第 0 列的 const api');
    assert.deepStrictEqual(topLevelDecls(cse).map(d => d.name), [], 'IIFE 内部的第 0 列声明不得被判成顶层（否则会造出假冲突）');

    // 全量注册脚本：唯一允许的跨文件同名顶层声明为 0
    const loadOrder = [manifest.js, ...(manifest.extra_js || [])];
    const owner = new Map();
    for (const f of loadOrder) {
        for (const d of topLevelDecls(readFileSync(path.join(ROOT, f), 'utf8'))) {
            if (!owner.has(d.name)) owner.set(d.name, []);
            owner.get(d.name).push(f);
        }
    }
    const clashes = [...owner.entries()].filter(([, fs2]) => new Set(fs2).size > 1).map(([n]) => n);
    assert.deepStrictEqual(clashes, [], `注册脚本间仍存在同名顶层声明：${JSON.stringify(clashes)}`);
});

/* ---------- 2 ---------- */
test('【2】合成夹具真跑扫描器：正样本', () => {
    withTmp('clean', (dir) => {
        makeRepo(dir, {
            'manifest.json': MANIFEST('index.js', ['mod-alpha.js']),
            'index.js': CLEAN_INDEX,
            'mod-alpha.js': CLEAN_MOD,
        });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 0, `健康夹具应 exit 0，实际 ${r.code}\n${r.out}`);
        assert.ok(/B5 结构健康：ok/.test(r.out), '应报结构健康');
    });
});

test('【2】合成夹具真跑扫描器：重复顶层类 → B1 + B2', () => {
    withTmp('dup', (dir) => {
        makeRepo(dir, {
            'manifest.json': MANIFEST('index.js', ['mod-a.js', 'mod-b.js']),
            'index.js': CLEAN_INDEX,
            'mod-a.js': 'class Clash {}\n(function (g) { g.LonShaAlpha = {}; })(window);\n',
            'mod-b.js': 'class Clash {}\n',
        });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 1, `应 exit 1（真缺陷），实际 ${r.code}\n${r.out}`);
        assert.ok(/B1 `Clash` 被多个注册脚本在顶层声明/.test(r.out), '应报 B1 并指明冲突符号');
        assert.ok(/mod-a\.js:1/.test(r.out) && /mod-b\.js:1/.test(r.out), 'B1 应带文件:行归属');
        assert.ok(/B2 mod-b\.js 在共享上下文中加载失败/.test(r.out), '应报 B2 真加载失败');
    });
});

test('【2】合成夹具真跑扫描器：缺失符号供给 → B3', () => {
    withTmp('ghost', (dir) => {
        makeRepo(dir, {
            'manifest.json': MANIFEST('index.js', ['mod-alpha.js']),
            'index.js': 'const g = window.LonShaGhost;\nconsole.log(g);\n',
            'mod-alpha.js': CLEAN_MOD,
        });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 1, `应 exit 1，实际 ${r.code}\n${r.out}`);
        assert.ok(/B3 index\.js 引用了 window\.LonShaGhost/.test(r.out), '应报 B3 符号无供给');
    });
});

test('【2】合成夹具真跑扫描器：新未消费模块 → B4（账本外）', () => {
    withTmp('orphan', (dir) => {
        makeRepo(dir, {
            'manifest.json': MANIFEST('index.js', ['mod-new.js']),
            'index.js': 'console.log(1);\n',
            'mod-new.js': '(function (g) { g.LonShaBrandNew = {}; })(window);\n',
        });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 1, `应 exit 1，实际 ${r.code}\n${r.out}`);
        assert.ok(/B4 新出现「已挂载但零消费」的模块全局 LonShaBrandNew/.test(r.out), '应报 B4 未记账模块');
    });
});

// [v3.173] 账本清空后，本判据变成零容忍。
//   旧语义：在冻结账本里的模块（如 LonShaNpcTies）即使未消费也放行。
//   新语义：接线完成后账本为空，同一夹具必须报 B4。这是更强的保证：
//   从"先记账再慢慢接"收紧为"不接就报"。
//   旧断言（exit 0）会失效，这正是本测试要记录的契约变更。
test('【2】合成夹具真跑扫描器：账本已清空 → 未消费模块一律报错（零容忍）', () => {
    withTmp('ledgered', (dir) => {
        makeRepo(dir, {
            'manifest.json': MANIFEST('index.js', ['mod-old.js']),
            'index.js': 'console.log(1);\n',
            // 旧账本里的模块：现在没有免罪牌了
            'mod-old.js': '(function (g) { g.LonShaNpcTies = {}; })(window);\n',
        });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 1, `账本清空后应报 B4，实际 ${r.code}\n${r.out}`);
        assert.ok(/B4 新出现「已挂载但零消费」的模块全局 LonShaNpcTies/.test(r.out), '应报 B4 未消费');
    });
});

test('【2】合成夹具真跑扫描器：注册文件缺失 → exit 1', () => {
    withTmp('missing', (dir) => {
        makeRepo(dir, {
            'manifest.json': MANIFEST('index.js', ['mod-alpha.js', 'mod-absent.js']),
            'index.js': CLEAN_INDEX,
            'mod-alpha.js': CLEAN_MOD,
        });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 1, `应 exit 1，实际 ${r.code}\n${r.out}`);
        assert.ok(/manifest 注册了不存在的文件：mod-absent\.js/.test(r.out), '应指出缺失文件');
    });
});

// 两条下限必须**各自可独立验证**，否则下限失效时测试无法区分是哪条在挡。
// 这正是防假绿注入 M12 暴露的判据弱点：原先只用一个「有 index.js、零 extra_js」的树，
// 它命中的其实是**全局数**下限，而变异打的却是**脚本数**下限，于是注入全部漏网。
test('【2】合成夹具真跑扫描器：零脚本树 → exit 2（脚本数下限 fail-closed）', () => {
    withTmp('degraded-scripts', (dir) => {
        makeRepo(dir, {
            // 连入口都不注册：脚本抽取器若失效（manifest 字段改名/结构漂移）就是这个形状
            'manifest.json': JSON.stringify({ extra_js: [] }, null, 2) + '\n',
            'index.js': 'console.log(1);\n',
        });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 2, `零脚本树应 exit 2，实际 ${r.code}\n${r.out}`);
        assert.ok(/脚本数低于下限/.test(r.out), `应报脚本数下限失效，实际：${r.out}`);
    });
});

test('【2】合成夹具真跑扫描器：无全局脚本树 → exit 2（全局数下限 fail-closed）', () => {
    withTmp('degraded-globals', (dir) => {
        makeRepo(dir, {
            'manifest.json': MANIFEST('index.js', []),
            'index.js': 'console.log(1);\n',
        });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 2, `无全局脚本树应 exit 2，实际 ${r.code}\n${r.out}`);
        assert.ok(/个模块全局（低于下限/.test(r.out), `应报全局数下限失效，实际：${r.out}`);
    });
});

/* ---------- 3 ---------- */
test('【3】修复证据：冲突已消除且增强版成为唯一实现', () => {
    // 3a 冲突类已从 modules_combined.js 移除，且不再有裸引用
    assert.ok(!/^class GraphDiffusion/m.test(mc), 'modules_combined.js 不得再在顶层声明 GraphDiffusion');
    assert.ok(mc.includes('window.GraphDiffusion'), 'modules_combined.js 应改为经全局取用图算法');
    assert.ok(!/new GraphDiffusion\(/.test(mc), 'modules_combined.js 不得残留裸引用（IIFE/作用域内会解析失败）');

    // 3b graph_algorithms.js 已 IIFE 包裹（顶层零词法污染）
    const firstCode = ga.split('\n').find(l => l.trim() && !l.trim().startsWith('//'));
    assert.ok(/^\(function\s*\(\s*global\s*\)\s*\{/.test(firstCode), `graph_algorithms.js 首行代码应为 IIFE 包裹，实际 ${JSON.stringify(firstCode)}`);
    assert.ok(/\}\)\(typeof window !== 'undefined' \? window : globalThis\);\s*$/.test(ga.trim()), 'graph_algorithms.js 末尾应闭合 IIFE 并传入全局');

    // 3c 增强版特征必须保留（防「修复」时被朴素版顶替）。
    //   判据必须用**方法定义形状**而不是裸子串：`includes('getPerformanceStats')`
    //   对 `getPerformanceStatsRenamed()` 也成立，防假绿注入当场证明它过弱。
    for (const mark of ['getPerformanceStats', 'invalidateCache', '_calculateCacheHitRate']) {
        assert.ok(new RegExp('\\b' + mark + '\\s*\\(\\s*\\)\\s*\\{').test(ga),
            `graph_algorithms.js 必须保留增强版方法定义 ${mark}() {`);
    }
    assert.ok(/this\.perfStats\s*=\s*\{/.test(ga), 'graph_algorithms.js 必须保留 perfStats 埋点初始化');
    assert.ok(/\bperformance\.now\(\)/.test(ga), 'graph_algorithms.js 必须保留计时埋点');
    // 3d 4 参签名（pageRankDamping 的接线前提）
    assert.ok(/personalizedPageRank\(seedNodes, hops = 3, topK = 10, dampingFactor = 0\.85\)/.test(ga), '签名必须接受第 4 参');
    assert.ok(idx.includes('this.config.config.pageRankDamping'), 'index.js 调用点必须传入阻尼配置');
    // 3e 个性化 PageRank 必须绕过不含种子键的通用缓存
    assert.ok(/useCache:\s*false/.test(ga), 'personalizedPageRank 必须传 useCache:false（否则 60s 内跨轮返回陈旧种子结果）');
    // 3f manifest 加载顺序：增强版仍然后于朴素版所在文件（回归守卫）
    const order = manifest.extra_js || [];
    assert.ok(order.indexOf('modules_combined.js') < order.indexOf('graph_algorithms.js'),
        'graph_algorithms.js 应后于 modules_combined.js 加载');
    // 3g 真实审计（非夹具）必须通过
    const r = spawnSync(process.execPath, [SCANNER], { cwd: ROOT, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, `真实仓库审计应通过\n${r.stdout}\n${r.stderr}`);
    // [v3.175] 不绑死数字：扫描器报的数必须等于「入口 + 声明的 extra_js」，且无失败。
    const _declared = 1 + ((manifest.extra_js || []).length);
    const _m = /真加载成功 (\d+)\/(\d+)/.exec(r.stdout || '');
    assert.ok(_m && Number(_m[1]) === _declared && Number(_m[2]) === _declared,
      `应报告全部 ${_declared} 个脚本加载成功（实 ${_m ? _m[0] : '未报'}）\n${r.stdout}`);
    // [v3.173] 账本已清空：真仓库必须报 0 个未消费，且 7 个声明已接线的模块
    //   必须逐个真被引用（防「删引用 + 删账本」假绿）。
    assert.ok(/已挂载未消费 0 个（账本 0 个）/.test(r.stdout || ''), `账本应为空\n${r.stdout}`);
    assert.ok(/声明已接线 7 个，其中真被引用 7 个/.test(r.stdout || ''), `7 个模块应逐个真被引用\n${r.stdout}`);
});

/* ---------- 4 ---------- */
test('【4】发布卫生', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(idx)[1];
    assert.strictEqual(manifest.version, v, 'manifest 与 index.js 版本必须一致');
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.strictEqual(pkg.version, v, 'package.json 与 index.js 版本必须一致');
    const head = changelog.split('\n').slice(0, 60).join('\n');
    assert.ok(head.includes(v), `CHANGELOG 顶节应记录 ${v}`);
    // 冲突类不得在任何地方以「顶层」形式复活（用深度判定，避免把 IIFE 内部实现误判）
    for (const f of readdirSync(ROOT).filter(x => x.endsWith('.js'))) {
        const tops = topLevelDecls(readFileSync(path.join(ROOT, f), 'utf8')).map(d => d.name);
        assert.ok(!tops.includes('GraphDiffusion'), `${f} 在顶层声明了 GraphDiffusion`);
    }
    // 但增强版实现必须仍存在于 graph_algorithms.js 内（只是不再污染顶层词法作用域）
    assert.ok(ga.includes('class GraphDiffusion {'), 'graph_algorithms.js 必须仍持有 GraphDiffusion 实现');
});
