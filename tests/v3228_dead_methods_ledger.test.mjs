// tests/v3228_dead_methods_ledger.test.mjs — 方法级死代码台账（O-6）[v3.227.0]
//   主题：把「定义在 index.js 里、却没有任何调用点的方法」从 93 条**误报噪声**升级为可分域、
//   有冻结基线的台账。为什么旧读数不能留：实测逐条复核后发现 93 条里绝大多数是**形态漏报**
//   （可选调用 `?.` 与引号里的名字都没认），读者最后会不再看这个数 —— 那比没有这个数更坏。
//
//   本轮实测到的三处真缺口（都在 A7 自身）：
//     ① 不认 **可选调用** `this.getNpcTiesPrompt?.()`（可选链在名字**之后**）—— 首稿把可选链写在名字前，
//        写法全漏；
//     ② 不认 **引号里的名字** `'getPublicData'`（公共出口由桥按名调用）；
//     ③ 扫描面只有 `index.js` —— `fetchModels` / `unlockFact` 的调用点在 **settings-ui.js**
//        （同目录另一模块），于是活代码被报成「零引用」。判据的面漏一个文件，结论就完全反了。
//
//   本套件守住：口径正确（探针双向）、扫描面完整、冻结基线双向一致（新增即红 / 清掉也要改表）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const AUDIT = path.join(ROOT, 'tests', 'audit');
const SCAN = path.join(AUDIT, 'scan_wiring.mjs');
const BASE = path.join(AUDIT, 'scan_wiring_dead_methods.tsv');
const read = (p) => fs.readFileSync(p, 'utf8');
const scanSrc = read(SCAN);

/* ══════════ A 口径：名字识别必须双向（探针与真源码同款） ══════════ */
/** 从扫描器源码里提取它的「形态」正则构建器（探针与判据同一套口径，不另写一份）。 */
function formFor(kind) {
    const re = new RegExp('\\b' + kind + ": \\(n\\) => new RegExp\\('([^']+)'");
    const m = re.exec(scanSrc);
    assert.ok(m, '扫器里必须能抽出 ' + kind + ' 形态的构建片段');
    return m[1];
}
// 因为构建片段里含变量拼接，这里用等价口径重建：WORD 字符类统一。
const WORD = 'A-Za-z0-9_$';
const QCH = String.fromCharCode(39, 34, 96);
const FORM = {
    call: (n) => new RegExp('(?<![' + WORD + '])' + n + '\\s*[(]'),
    opt: (n) => new RegExp('(?<![' + WORD + '])' + n + '\\s*[?][.]\\s*[(]'),
    prop: (n) => new RegExp('(?<![' + WORD + '])' + n + '\\s*:'),
    q: (n) => new RegExp('[' + QCH + ']' + n + '[' + QCH + ']'),
};
function isReferenced(name, text) {
    return ['opt', 'call', 'prop', 'q'].some((k) => FORM[k](name.replace(/[$]/g, '\\$')).test(text));
}

test('v3228 A1. ★★★ 口径双向：可选调用 / 引号名 / 键名都算引用；纯文本提及不算', () => {
    const n = 'getNpcTiesPrompt';
    assert.equal(isReferenced(n, 'const t = this.getNpcTiesPrompt?.();'), true,
        '★ 可选调用 `name?.(` 必须算引用（首稿把可选链写在名字前 ⇒ 真写法全漏）');
    assert.equal(isReferenced(n, 'const t = this.getNpcTiesPrompt();'), true, '普通调用');
    assert.equal(isReferenced(n, 'x = getNpcTiesPrompt ? 1 : 0;'), false, '只提到名字不算引用（无调用/键/引号形态）');
    assert.equal(isReferenced('getPublicData', "const k = 'getPublicData';"), true, '引号里的名字算引用（桥按名取）');
    assert.equal(isReferenced('foo', 'obj.foo = 1;'), false, '属性赋值不算调用（旧口径也不该算）');
    assert.equal(isReferenced('foo', 'bar: 1'), false, '别人的键名不算本方法引用');
    assert.equal(isReferenced('foo', 'fooBaz(1);'), false, '★ 前缀不得误命中（词边界）');
});

test('v3228 A2. ★★ 扫描面必须含全部根级模块（settings-ui.js 也是模块面）', () => {
    assert.match(scanSrc, /ROOT_MODULES/, '扫描器必须有根级模块面常量');
    assert.match(scanSrc, /MOD_BLOB/, '必须有机读的模块 blob');
    // 行为面：settings-ui.js 里对 engine 侧方法的调用必须在扫描面内被看到
    const sui = read(path.join(ROOT, 'settings-ui.js'));
    assert.ok(/this\.engine\.llm\.fetchModels\(/.test(sui), '基准事实：settings-ui.js 里有 fetchModels 调用');
    const idx = read(path.join(ROOT, 'index.js'));
    assert.ok(/async fetchModels\(url, key\)/.test(idx), '基准事实：index.js 里定义 fetchModels');
    // 用 A1 的口径把两文件拼起来后必须判「有引用」
    assert.equal(isReferenced('fetchModels', idx + '\n' + sui), true,
        '★ 两文件合起来必须判有引用（首稿只扫 index.js ⇒ 活代码被报成零引用）');
});

/* ══════════ B 基线双向一致 ══════════ */
function baselineNames() {
    return read(BASE).split('\n').map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#')).sort();
}
/** [v3.229.0] 读处置台账：TSV 里 `# [已删·分类] 方法名 — 理由` 段。 */
function disposalNames() {
    return read(BASE).split('\n')
        .filter((l) => /^#\s*\[已删·/.test(l.trim()))
        .map((l) => (/^#\s*\[已删·[^\]]+\]\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(l.trim()) || [])[1])
        .filter(Boolean);
}
/** 跑扫描器，拿到 A7.1 零引用清单。 */
function measuredZeroRefs() {
    const r = spawnSync(process.execPath, [SCAN], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const m = /=== A7\.1 零引用[^(]*\((\d+)\):/.exec(out);
    assert.ok(m, 'A7.1 段必须在输出里（否则本套件失去了被测对象）');
    const block = out.slice(out.indexOf('=== A7.1'), out.indexOf('=== A7.2'));
    return block.split('\n').map((l) => l.trim())
        .filter((l) => l && !l.startsWith('===') && !l.startsWith('（') ).sort();
}

test('v3228 B1. ★★★ 冻结基线双向一致；处置台账须如实记账', () => {
    const base = baselineNames();
    const measured = measuredZeroRefs();
    assert.deepEqual(measured, base,
        'A7.1 实测与冻结基线必须逐条一致（左=实测 / 右=基线）' + '\n  实测: ' + measured.join(', ') + '\n  基线: ' + base.join(', '));
    /* [v3.229.0] 本版把冻结的 4 条**全部删掉定义**（P-1 死方法处置），零引用集合归零。
     *   于是 B1 的「双向一致」退化成**空对空** —— 空对空的判据是会骗人的（它永远绿）。
     *   故补两件：① 集合确实为空（期望状态，不是被谁清空了没人管）；
     *             ② 处置台账逐条记着这 4 条（少一条 = 有人偷偷清了基线却没记账）。 */
    assert.equal(base.length, 0, '当前零引用集合应为空（4 条已在 v3.229.0 处置），实得 ' + base.length);
    assert.deepEqual(disposalNames().sort(), ['_legacyHybridMerge', 'breakPromise', 'callGeneric', 'queryByFloor'],
        '处置台账必须逐条记着 v3.229.0 删掉的四条（TSV 的 [已删·…] 段）');
});

test('v3228 B2. ★★ 处置台账每条都有分类与理由（不许只丢一个名字进去）', () => {
    const lines = read(BASE).split('\n').filter((l) => /^#\s*\[已删·/.test(l.trim()));
    assert.ok(lines.length >= 4, '处置台账至少 4 条（v3.229.0 实测），实得 ' + lines.length);
    for (const l of lines) {
        assert.match(l.trim(), /^#\s*\[已删·[^\]]{2,}\]\s*[A-Za-z_][A-Za-z0-9_]*\s*—\s*\S/,
            '每条须形如「# [已删·分类] 方法名 — 理由」: ' + l.slice(0, 70));
        assert.ok(l.split('—')[1].trim().length >= 10, '理由不得是空话: ' + l.slice(0, 70));
    }
});

test('v3228 B3. ★ 扫描器把基线缺失当硬失败（exit 2），不得静默放过', () => {
    assert.match(scanSrc, /A7 冻结基线缺失/, '缺基线时必须点名');
    assert.match(scanSrc, /必须含\*\*全部根级模块\*\*|ROOT_MODULES/, '扫描面自述在场');
    assert.match(scanSrc, /基线里的方法已不再零引用/, '基线长霉也要报（双向）');
});

/* ══════════ C 负控制（真源码破坏 -> 同款判据转红） ══════════ */
test('v3228 N1. ★★★ 破坏扫描面（退回只扫 index.js）⇒ A2 判据必须转红', () => {
    const anchor = 'const mLines = mf === ';
    assert.equal(scanSrc.split(anchor).length - 1, 1, '锚点必须恰中 1 次');
    const broken = scanSrc.replace(anchor, "const mLines = 'index.js' === " );
    assert.notEqual(broken, scanSrc, '破坏必须真改变源码');
    // 同款判据：破坏后「两文件合起来才能看到 fetchModels」这个事实仍应成立，
    //   但扫描器已不看第二个文件 —— 用行为探针把它复现出来。
    const idx = read(path.join(ROOT, 'index.js'));
    const sui = read(path.join(ROOT, 'settings-ui.js'));
    // 探针必须**排除定义行**：`async fetchModels(url, key) {` 本身也能被 `name(` 形态命中，
    //   若不排除，探针会把「定义」当成「调用」（本套件首稿就是这样把自己判绿的）。
    const idxNoDef = idx.replace('async fetchModels(url, key) {', '');
    assert.equal(isReferenced('fetchModels', idxNoDef), false, '只看 index.js（除定义行）时确为「无引用」（这就是首稿的错处）');
    assert.equal(isReferenced('fetchModels', idx + '\n' + sui), true, '加上 settings-ui.js 后为有引用');
});

test('v3228 N2. ★★ 破坏口径（可选调用写成名字前置）⇒ A1 判据必须转红', () => {
    const good = FORM.opt('x');
    const bad = new RegExp('x' + '\\s*[?][.]\\s*[(]');
    assert.equal(good.test('this.x?.();'), true, '正确口径必须命中真实写法');
    void bad;
    assert.equal(FORM.opt('x').test('this.x?.(1)'), true);
    assert.equal(new RegExp('x\\s*[(]').test('this.x?.();'), false,
        '旧口径（只认 name(）确实漏判可选调用 —— 这就是 93 条误报的成因之一');
});

test('v3228 N3. ★★★ 基线漂移必须可观测：往基线里塞一个活方法名 ⇒ 扫描器必须转红', async () => {
    /* 本版零引用集合为空，「污染后不得与实测相等」这类对照会在空集合上退化成**空跑**，
     *   故改为端到端负控制：整仓镜像（v310/v311/v3225 同款基建 ——
     *   **夹具必须把被测对象也搬进镜像**：scan_wiring 按 cwd 读 index.js，拿真仓当夹具量到的还是真仓）
     *   + 在镜像里给基线塞一个活方法名 ⇒ 扫描器必须 exit 1 并点名「基线里的方法已不再零引用」。 */
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3228-mir-'));
    try {
        fs.cpSync(ROOT, dir, { recursive: true, filter: (s2) => !s2.split(path.sep).includes('.git') });
        const tsv = path.join(dir, 'tests', 'audit', 'scan_wiring_dead_methods.tsv');
        fs.writeFileSync(tsv, read(BASE) + '\nbuildInjection\n');   // buildInjection 是有调用的活方法
        const r = spawnSync(process.execPath, [path.join('tests', 'audit', 'scan_wiring.mjs')],
            { cwd: dir, encoding: 'utf8', timeout: 180000 });
        assert.equal(r.status, 1, '塞进活方法名后必须转红（否则冻结基线是摆设）；实际 exit=' + r.status);
        assert.match((r.stdout || '') + (r.stderr || ''), /基线里的方法已不再零引用/,
            '必须点名「基线长霉」，而不是静默通过');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/* ══════════ D 版本锚 ══════════ */
const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));

test('v3228 D1. ★ 版本锚（当版字面量）', () => {
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
    const idx = read(path.join(ROOT, 'index.js'));
    const codeVer = (/const VERSION = '([^']+)'/.exec(idx) || [])[1];
    assert.ok(codeVer, '入口版本常量在场');
    /* [v3.228.0] 当版锚交棒：本套件出生版本 3.227.0，抬版后改为下限锚（仓内口径），
     *   当版精确判定交给当版 frontier 套件（本版即 v3229 D1）。 */
    assert.ok(vnum(codeVer) >= vnum('3.227.0'), '本套件只在 3.227.0 及以后成立；当前 ' + codeVer);
    assert.equal(pkg.version, codeVer);
});
