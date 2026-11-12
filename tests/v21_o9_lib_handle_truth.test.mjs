/* ============================================================
 * tests/v21_o9_lib_handle_truth.test.mjs — v3.465.0
 * —— 第二十一期 L21-O9：取库口的「变量名 ↔ 目标模块 ↔ 注释声称」三者一致
 * ------------------------------------------------------------
 * 计划原文的三条验收（本文件逐条落成判据）：
 *   ① 当前全绿（若有不符则本项先修）；
 *   ② 负控制：造一个同名两份的 `_xxxLib` ⇒ 必须红；
 *   ③ 负控制：把某个 `_xxxLib` 指向另一个模块但注释不改 ⇒ 必须红。
 *
 * 【本文件治的是什么形态（先写清楚，免得判据变成摆设）】
 *   `index.js` 有 171 个 `_xxxLib()` 取库口，每个的真码只有一行
 *   `_moduleLib(() => window.Xxx, 'xxx.js')`，旁边却常有长注释介绍「本模块指向 xxx.js」。
 *   于是同一个事实有**两份可能漂移的声明**：真码与注释。
 *   v3.444.0 已经栽过一次：`_eraContinuationLib` 同名两份，JS 后者静默覆盖前者 ——
 *   自检拿到错误的库、静默失效，且**没有任何门能发现**（两份都语法正确、都能取到库）。
 *   本文件把那次缺陷变成**正面回归位**（A3/A5），并把「声明与真码对账」覆盖到全量 171 个。
 *
 * 【实勘推翻计划原文一处（如实记）】
 *   原文写「注释里声称的文件名」，隐含假设「每个取库口旁边都有一句『本模块=x.js』」。
 *   实测：171 个里**84 个没有任何注释**（它们是同批追加的，靠函数名自解释），
 *   还有 **1 个共享块**（`_institutionLib` 挨着一段讲「五件零消费内核」的分组注释，
 *   块里出现的 `index.js` / `engine-diagnostic-lines.js` 讲的是**别的事**），
 *   以及 **1 个显式区分**（`_gapBenchLib` 的注释特意写「与 `_archaeologyLib`
 *   （memory-archaeology.js）**不是同一件**」—— 提到别的文件名正是为了防误合并）。
 *   若把这三类都判成「注释说错」，判据会要求人去改 84 处空注释、删掉两条有用的区分说明
 *   —— 那是**判据虚报逼着人做坏事**。故三分处置：
 *     · 注释未声称任何文件名 → 单列 `commentAbsent`（不是缺口，但必须可见）；
 *     · 分组共享块（块里没有「本模块/本件」一类自指词）→ 单列 `commentShared`，不判红；
 *     · 显式区分语句（「不是同一件」/「别合并」/「同族」）→ 单列 `commentDisambiguated`；
 *     · 只有「自指 + 没说不区分 + 声称的文件名与真码不符」才判 `commentMismatch` 必红。
 *
 * 【判据清单（A 结构与正控 / B 读数分层 / C 措辞与边界 / Z 当版锚）】
 *   A1 判定体是纯函数：不 import fs / path，不读盘
 *   A2 真仓全绿：duplicate / missingFile / globalNotMounted / commentMismatch 四档全空
 *   A3 同名唯一：171 个声明 ↔ 171 个唯一变量名（v3.444.0 同名覆盖的正面回归位）
 *   A4 目标文件必须在盘（不许「声明了但文件没有」）
 *   A5 负控制：造同名两份 ⇒ duplicate 必须红
 *   A6 负控制：真码改指向、注释不改 ⇒ commentMismatch 必须红
 *   A7 切不出来不是通过：函数体不配平时必须显式报 slice-failed
 *   A8 豁免也双向：豁免表只允许登记取库原语，真取库口进了豁免必须红
 *   B1 三级注释读数必须单列（absent / shared / disambiguated 互不合并）
 *   B2 非 `_moduleLib` 形态必须与四档缺口分开报
 *   B3 真仓读数与实测一致（171 声明 / 0 同名 / 0 缺文件 / 0 挂载名不符）
 *   C1 措辞单源：问题描述在判定体里只有一份
 *   C2 诚实边界写进判定体导出（静态对账 ≠ 运行时取到对的库）
 *   Z1 当版锚：本文件标注当版且与三副本一致
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    judgeLibHandles, extractLibHandles, mountedNamesOf, claimedFiles,
    commentIsSelfScoped, commentHasDisambiguation,
    QUESTION, BOUNDARY,
} from './audit/_lib_handle_judge.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readModule = (f) => {
    const p = path.join(ROOT, f);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};
const INDEX = read('index.js');
const vnum = (s) => s.match(/v?(\d+)\.(\d+)\.(\d+)/);

/* 真仓读数只算一次，全文件复用 */
const REAL = judgeLibHandles(INDEX, readModule, { exemptHandles: { _moduleLib: '取库原语本身不是取库口' } });

/* ---------- A. 结构与正控 ---------- */
test('A1 判定体是纯函数：不 import fs / path、不读盘', () => {
    const src = read('tests/audit/_lib_handle_judge.mjs');
    assert.ok(!/^import\s/m.test(src), '判定体不得有任何 import（必须纯函数）');
    assert.ok(!/require\s*\(/.test(src), '判定体不得 require');
    assert.ok(!/readFileSync|existsSync/.test(src), '判定体不得读盘');
    /* 判定体必须接收 readModule 作为参数 —— 数据由调用方喂，判定不自己取 */
    assert.ok(/readModule/.test(src), '判定体必须以参数形式接收模块读取函数');
});

test('A2 真仓全绿：四档缺口（同名 / 缺文件 / 挂载名不符 / 注释说错）全空', () => {
    assert.equal(REAL.ok, true, '真仓应全绿，实际缺口：' + JSON.stringify({
        duplicate: REAL.duplicate, missingFile: REAL.missingFile,
        globalNotMounted: REAL.globalNotMounted, commentMismatch: REAL.commentMismatch,
    }));
    assert.deepEqual(REAL.duplicate, []);
    assert.deepEqual(REAL.missingFile, []);
    assert.deepEqual(REAL.globalNotMounted, []);
    assert.deepEqual(REAL.commentMismatch, []);
    assert.deepEqual(REAL.sliceFailed, []);
    assert.deepEqual(REAL.exemptViolations, []);
});

test('A3 同名唯一：声明总数 == 唯一变量名数（v3.444.0 同名覆盖的正面回归位）', () => {
    assert.equal(REAL.total, REAL.uniqueNames,
        '每个取库口变量名必须全文件恰声明一次（同名两份会让后者静默覆盖前者）');
    assert.ok(REAL.total >= 150, '取库口数量应在 150 以上，实际 ' + REAL.total + '（少于这个数说明抽取面漏了）');
});

test('A4 目标文件必须在盘：每个取库口的 fileName 都能读到', () => {
    const ex = extractLibHandles(INDEX);
    const targets = ex.rows.filter((r) => r.file && !r.primitive);
    assert.ok(targets.length >= 150, '应有 150 个以上带目标文件的取库口，实际 ' + targets.length);
    const missing = targets.filter((r) => readModule(r.file) === null);
    assert.deepEqual(missing.map((r) => r.name + '→' + r.file), [],
        '下列取库口的目标文件不在盘（声明了但文件没有）');
});

test('A5 负控制：造同名两份的 _xxxLib ⇒ duplicate 必须红', () => {
    const two = [
        "    function _demoLib() {",
        "        return _moduleLib(() => window.DemoA, 'a.js');",
        "    }",
        "    function _demoLib() {",
        "        return _moduleLib(() => window.DemoB, 'b.js');",
        "    }",
    ].join('\n');
    const r = judgeLibHandles(two, (f) => (f === 'a.js' || f === 'b.js' ? 'x.DemoA = api;\nx.DemoB = api;' : null),
        { exemptHandles: {} });
    assert.equal(r.ok, false, '同名两份必须判红');
    assert.equal(r.duplicate.length, 1, '必须点名恰好一组同名');
    assert.equal(r.duplicate[0].name, '_demoLib');
    assert.equal(r.duplicate[0].lines.length, 2, '必须报出两处行号');
});

test('A6 负控制：真码改指向、注释不改 ⇒ commentMismatch 必须红', () => {
    const src = [
        '    /* 本模块是演示用的取库口，指向 demo-old.js。',
        '     *   本件与别件不同，故单独一个取库口。',
        '     */',
        '    function _demoLib() {',
        "        return _moduleLib(() => window.DemoNew, 'demo-new.js');",
        '    }',
    ].join('\n');
    const mods = { 'demo-new.js': 'x.DemoNew = api;' };
    const r = judgeLibHandles(src, (f) => mods[f] ?? null, { exemptHandles: {} });
    assert.equal(r.ok, false, '注释声称 demo-old.js、真码指向 demo-new.js ⇒ 必须红');
    assert.equal(r.commentMismatch.length, 1, '必须点名一处注释与真码不符');
    assert.equal(r.commentMismatch[0].file, 'demo-new.js', '真码文件应被报出');
    assert.ok(r.commentMismatch[0].claimed.includes('demo-old.js'), '注释声称的文件名应被报出');
});

test('A7 切不出来不是通过：函数体不配平时必须显式报 slice-failed', () => {
    const broken = [
        '    function _brokenLib() {',
        "        return _moduleLib(() => window.Broken, 'broken.js');",
        '    /* 故意不闭合 */',
    ].join('\n');
    const r = judgeLibHandles(broken, () => null, { exemptHandles: {} });
    assert.equal(r.sliceFailed.length, 1, '配平切不出时必须报 slice-failed，不许静默当通过');
    assert.equal(r.sliceFailed[0].why, 'slice-failed');
    assert.equal(r.ok, false, 'slice-failed 时整体必须判红');
});

test('A8 豁免也双向：真取库口进了豁免表 ⇒ 必须红', () => {
    /* 夹具必须带**真的取库原语**：`_moduleLib` 的声明缺席时，任一豁免名都会命中
     *   「变量名在源码里不存在」——那是**另一条**违规理由，会让本判据看似通过而实际
     *   测的是别的东西（本文件第一次跑就在这上面红了一次，如实记）。故这里补上原语。 */
    const src = [
        '    function _moduleLib(getGlobal, fileName) {',
        '        return null;',
        '    }',
        '    function _realLib() {',
        "        return _moduleLib(() => window.Real, 'real.js');",
        '    }',
    ].join('\n');
    const mods = { 'real.js': 'x.Real = api;' };

    /* ① 真取库口进了豁免表：真码本身没问题，但豁免表替它挡了对账 ⇒ 红 */
    const r1 = judgeLibHandles(src, (f) => mods[f] ?? null, { exemptHandles: { _realLib: '我觉得可以跳过' } });
    assert.equal(r1.exemptViolations.length, 1, '真取库口进豁免必须被点名，实际 ' + JSON.stringify(r1.exemptViolations));
    assert.match(r1.exemptViolations[0].why, /只允许登记取库原语/);
    assert.equal(r1.ok, false, '豁免了真取库口时整体必须判红');

    /* ② 豁免理由为空 ⇒ 红 */
    const r2 = judgeLibHandles(src, (f) => mods[f] ?? null, { exemptHandles: { _moduleLib: '   ' } });
    assert.equal(r2.exemptViolations.length, 1, '空理由必须被点名，实际 ' + JSON.stringify(r2.exemptViolations));
    assert.match(r2.exemptViolations[0].why, /理由为空/);

    /* ③ 豁免表里的名字在源码里不存在（改名/删除后没清理）⇒ 红 */
    const r3 = judgeLibHandles(src, (f) => mods[f] ?? null, { exemptHandles: { _moduleLib: '取库原语不是取库口', _ghostLib: '不存在的名字' } });
    assert.equal(r3.exemptViolations.length, 1, '幽灵名必须被点名，实际 ' + JSON.stringify(r3.exemptViolations));
    assert.match(r3.exemptViolations[0].why, /不存在/);
    assert.equal(r3.exemptViolations[0].name, '_ghostLib');

    /* ④ 正控：只豁免原语、理由非空 ⇒ 不产生违例（否则豁免表根本没用了） */
    const r4 = judgeLibHandles(src, (f) => mods[f] ?? null, { exemptHandles: { _moduleLib: '取库原语本身不是取库口' } });
    assert.deepEqual(r4.exemptViolations, [], '只豁免原语属合法，不应产生违例');
});

/* ---------- B. 读数分层 ---------- */
test('B1 三级注释读数必须单列：absent / shared / disambiguated 互不合并', () => {
    /* 真仓实测：84 个无注释、1 个共享块、1 个显式区分 —— 三者若被合并成一个数，
     *   「没有注释」和「注释在讲别的事」就同形了，而两者处置完全不同
     *   （前者可能是漏写，后者是本判据必须容忍的正确写法）。 */
    assert.ok(Array.isArray(REAL.commentAbsent));
    assert.ok(Array.isArray(REAL.commentShared));
    assert.ok(Array.isArray(REAL.commentDisambiguated));
    const sum = REAL.commentAbsent.length + REAL.commentShared.length + REAL.commentDisambiguated.length;
    assert.ok(sum <= REAL.total, '三级之和不得超过取库口总数');
    /* 共享块与显式区分必须真的各有至少一处（否则本判据的这两条分支从未被真数据走过） */
    assert.ok(REAL.commentShared.length >= 1,
        '实测至少有一处共享块（_institutionLib 挨着讲「五件零消费内核」的分组注释）；读到 0 说明抽取面变了');
    assert.ok(REAL.commentDisambiguated.length >= 1,
        '实测至少有一处显式区分（_gapBenchLib 写「与 _archaeologyLib 不是同一件」）；读到 0 说明判据在瞎宽容');
    /* 两者不得互相吃掉：同一项不能被同时计入 shared 与 disambiguated */
    const sharedNames = new Set(REAL.commentShared.map((x) => x.name));
    for (const d of REAL.commentDisambiguated) {
        assert.ok(!sharedNames.has(d.name), d.name + ' 同时被计入 shared 与 disambiguated（分类互斥被破）');
    }
});

test('B2 非 _moduleLib 形态必须与四档缺口分开报（取库原语不算缺口）', () => {
    const ex = extractLibHandles(INDEX);
    const prim = ex.rows.filter((r) => r.primitive).map((r) => r.name);
    assert.deepEqual(prim, ['_moduleLib'], '取库原语应恰为 _moduleLib 一项，实际 ' + JSON.stringify(prim));
    /* 原语本身不带 fileName，但不得进 missingFile / duplicate */
    assert.ok(!REAL.missingFile.some((m) => m.name === '_moduleLib'), '取库原语不得被当成缺件');
    /* 非 _moduleLib 形态的其它项应为空（真仓现状）；非空时必须与本判定并列报出而非混进缺口 */
    assert.deepEqual(REAL.nonModuleLibOther.map((x) => x.name + ':' + x.why), [],
        '真仓应无「形态不是 _moduleLib」的取库口；若有，本档单列而不混入四档缺口');
});

test('B3 真仓读数与实测一致：171 声明 / 0 同名 / 0 缺文件 / 0 挂载名不符', () => {
    assert.equal(REAL.total, 171, '取库口声明总数应为 171，实际 ' + REAL.total);
    assert.equal(REAL.uniqueNames, 171);
    assert.equal(REAL.duplicate.length, 0);
    assert.equal(REAL.missingFile.length, 0);
    assert.equal(REAL.globalNotMounted.length, 0);
    assert.equal(REAL.commentMismatch.length, 0);
    assert.equal(REAL.commentAbsent.length, 84, '无注释的取库口应为 84，实际 ' + REAL.commentAbsent.length);
});

/* ---------- C. 措辞与边界 ---------- */
test('C1 措辞单源：问题描述在判定体里只有一份', () => {
    const src = read('tests/audit/_lib_handle_judge.mjs');
    const n = (src.match(/export const QUESTION/g) || []).length;
    assert.equal(n, 1, 'QUESTION 只允许定义一次，实际 ' + n);
    assert.ok(QUESTION.handles.includes('取库口'));
    assert.ok(QUESTION.handles.includes('注释'));
});

test('C2 诚实边界必须写进判定体导出', () => {
    assert.ok(BOUNDARY.includes('不能证明'), '边界必须写明做不到什么');
    assert.ok(BOUNDARY.includes('运行时'), '边界必须点明运行时不在射程内');
    assert.ok(BOUNDARY.includes('静态'), '边界必须说明绿的含义只是静态一致');
});

/* ---------- Z. 当版锚 ---------- */
test('Z1 当版锚：版本单源在 index.js，三副本 + package + manifest 必须全等于它，且不早于本档出生版', () => {
    /* ★ 为什么不再写死当下版本号：
     * 原先这里把 '3.465.0' 抄了 6 遍（文件头 + package + manifest + 三副本），
     * 于是**每抬一次版这条就红一次**，而红的原因跟本条要答的问题（版本是不是单源、
     * 有没有倒退）毫无关系——那是「判据滞后于产品」，不是产品缺陷。
     * 现在改为：真源取 index.js 的 VERSION，其余全部**与它对齐**；
     * 另加一条不倒退下界（本档出生版），防止有人把版本改小来骗这条。 */
    const self = read('tests/v21_o9_lib_handle_truth.test.mjs');
    const head = self.split('\n').slice(0, 3).join('\n');
    assert.ok(/v3\.\d+\.\d+/.test(head), '文件头必须标注版本号');

    const src = INDEX.match(/const\s+VERSION\s*=\s*['"]([\d.]+)['"]/);
    assert.ok(src, 'index.js 必须有 const VERSION 作为版本真源');
    const V = src[1];

    const pkg = JSON.parse(read('package.json'));
    const manifest = JSON.parse(read('manifest.json'));
    assert.equal(pkg.version, V, 'package.json 版本必须等于 index.js VERSION');
    assert.equal(manifest.version, V, 'manifest.json 版本必须等于 index.js VERSION');
    for (const f of ['memory-organs.js', 'memory-config.js', 'memory-core.js']) {
        const m = read(f).match(/let\s+VERSION\s*=\s*['"]([\d.]+)['"]/);
        assert.ok(m, f + ' 缺 let VERSION');
        assert.equal(m[1], V, f + ' 版本未同步（两份实现即第二真源）');
    }

    /* 不倒退下界：本档生于 v3.465.0，任何低于它的读数都是「改小版本骗判据」 */
    const BORN = [3, 465, 0];
    const cur = vnum(V);
    assert.ok(cur, 'VERSION 必须能被 vnum 恰好计数（V4）');
    const now = [Number(cur[1]), Number(cur[2]), Number(cur[3])];
    const cmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
    assert.ok(cmp(now, BORN) >= 0, '版本不得早于本档出生版 3.465.0，实测 ' + V);
});