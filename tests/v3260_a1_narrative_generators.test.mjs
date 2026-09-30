// tests/v3260_a1_narrative_generators.test.mjs - v3.258.0
//
// 主题：A1 宿主巨兽第三刀 —— 三个生成侧派生系统（DiarySystem / ReflectionSystem /
//   OutlineDirector）抽为 narrative-generators.js 之后的**接线、行为与破坏面**。
//
//   【为什么本档存在】
//     A1 第一刀（v3.257.0）剥叶子账本类；第二刀（v3.258.0 memory-aux.js）剥工具类；
//     本刀按同一条读数轴剥**生成侧派生系统**。风险与前两刀同形，且多一种：
//       · 取库口写错全局名 ⇒ 三个系统一起静默退到常量空实现；
//       · 缺席退路没同形 ⇒ 调用方读到 undefined 塌成第三态；
//       · 构造点漏接一个 ⇒ 某个系统从此写不进也读不出；
//       · ★ **自动规划护栏被拆散**：OutlineDirector 的 flatTurns / exhausted / planNext 由
//         宿主调用点守卫（outlineAutoPlan 与 this.outline.exhausted 与 !this.outline._planning 三者相与）串起来，
//         搬走后若只搬了类而护栏留在旧文件里，会出现「类在、护栏不在」的静默失效。
//     故本档不问「文件里有没有这个类」，而问「接线是否逐点在场、退路是否同形、破坏之后
//     同一条判据会不会翻红」。
//
//   【判据与负控制跑同一份代码】
//     judgeSlice(idxSrc, modSrc) 是纯函数；A 段对磁盘真源码跑它，D 段对**真源码破坏后的副本**
//     跑同一个它。破坏一律走唯一真源 tests/_break_kit.mjs 的 breakSource（锚点须恰中 1 次）。
//
//   【本档与历史套件的关系】
//     DiarySystem / OutlineDirector 的历史套件（v3119 / v356）此前**从 index.js 抽类做真执行**；
//     本刀把那些抽取面改到 narrative-generators.js 上（语义一字不改、只换被读的文件），
//     而「宿主不得再内联声明」集中在本档 A 段判——一份口径一处实现。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { stripComments } from './_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const NL = String.fromCharCode(10);
const SQ = String.fromCharCode(39);
const MOD_REL = 'narrative-generators.js';
const IDX = read('index.js');
const MOD = read(MOD_REL);
const M = (await import('../narrative-generators.js')).default;
/** 本刀剥走的三个生成侧派生系统。 */
const GEN = ['DiarySystem', 'ReflectionSystem', 'OutlineDirector'];
/** 构造点对位：类名 -> 宿主实例字段（刻意不同名，故不能按类名推字段名）。 */
const FIELDS = { DiarySystem: 'diary', ReflectionSystem: 'reflection', OutlineDirector: 'outline' };
/** 类体切到配对右花括号。 */
function classEnd(src, at) {
    const open = src.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return i + 1; }
    }
    return src.length;
}
const CTRL = ['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'new'];
/* 方法名切分按**成员签名缩进**（类体 4 + 成员 8）——与 host_beast_probe.cjs 同一口径。 */
const MEMBER_RE = /^ {8}(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\(/gm;
const methodNames = (body) => [...body.matchAll(MEMBER_RE)].map((m) => m[1]).filter((n) => !CTRL.includes(n));
/** 真实现类体的方法名集合（含 static / get / async）。 */
function methodsOf(src, name) {
    const at = src.indexOf('class ' + name + ' {');
    if (at < 0) return null;
    return methodNames(src.slice(at, classEnd(src, at)));
}
const ok = (m) => console.log('  \u2713 ' + m);

/**
 * 真判据体（纯函数，无副作用）。返回问题列表，空数组 = 卫生。
 * A 段与 D 段跑的是**同一个它**。
 */
function judgeSlice(idxSrc, modSrc) {
    const problems = [];
    for (const name of GEN) {
        if (idxSrc.includes('    class ' + name + ' {')) problems.push('index.js 仍内联 ' + name);
        if (!modSrc.includes('class ' + name + ' {')) problems.push(MOD_REL + ' 缺 ' + name);
        const needle = '_newNarrativeGenerator(' + SQ + name + SQ;
        const n = idxSrc.split(needle).length - 1;
        if (n !== 1) problems.push('构造点 ' + needle + ' 命中 ' + n + ' 次（须恰 1）');
        else if (!idxSrc.includes('this.' + FIELDS[name] + ' = ' + needle)) problems.push(name + ' 的构造点未接到宿主字段 this.' + FIELDS[name]);
    }
    if (!idxSrc.includes('function _narrativeGeneratorsLib()')) problems.push('缺具名取库口 _narrativeGeneratorsLib()');
    if (!idxSrc.includes('_moduleLib(() => window.LonShaNarrativeGenerators, ' + SQ + MOD_REL + SQ + ')')) problems.push('取库口不是真读表达式 window.LonShaNarrativeGenerators');
    if (!idxSrc.includes(SQ + MOD_REL + SQ)) problems.push('取库口文件名不是 ' + MOD_REL);
    if (!/class NarrativeGeneratorFallback/.test(idxSrc)) problems.push('缺缺席退路 NarrativeGeneratorFallback');
    if (!idxSrc.includes('function _newNarrativeGenerator(name)')) problems.push('缺统一构造点 _newNarrativeGenerator(name)');
    problems.push(...fallbackParity(idxSrc, modSrc));
    const modCode = stripComments(modSrc);
    /* 第三刀与第二刀的**口径差异**：memory-aux.js 是零宿主依赖；本模块有一个受控接触面
       （三个类各自一处同形的可选链取上下文），故这里判「只准出现该形态」而不是「零依赖」。 */
    if (modCode.includes('window.SillyTavern') && !modCode.includes('window.SillyTavern?.getContext?.()')) {
        problems.push(MOD_REL + ' 出现受控面以外的宿主接触 window.SillyTavern');
    }
    for (const bad of ['require(', 'window.LonSha']) {
        if (modCode.includes(bad)) problems.push(MOD_REL + ' 出现宿主依赖 ' + bad);
    }
    if (!modSrc.includes('global.LonShaNarrativeGenerators = api')) problems.push(MOD_REL + ' 缺全局导出面');
    return problems;
}

/** 退路与真实现的方法面必须对得上（真实现有的，退路必须有同名空实现）。 */
function fallbackParity(idxSrc, modSrc) {
    const problems = [];
    const at = idxSrc.indexOf('class NarrativeGeneratorFallback');
    if (at < 0) return ['退路类体切不出来（判据自身失效）'];
    const fbNames = new Set(methodNames(idxSrc.slice(at, classEnd(idxSrc, at))));
    for (const name of GEN) {
        const real = methodsOf(modSrc, name);
        if (!real) { problems.push(MOD_REL + ' 里切不出 ' + name + '（判据自身失效）'); continue; }
        for (const m of real) {
            if (m === 'constructor') continue;
            if (!fbNames.has(m)) problems.push('退路缺方法 ' + name + '.' + m);
        }
    }
    return problems;
}

/* ========== A 接线逐点在场 ========== */
test('v3260 A. 接线逐点在场：宿主不内联 / 模块真声明 / 构造点唯一且对位 / 退路同形 / 模块零宿主依赖', () => {
    const problems = judgeSlice(IDX, MOD);
    assert.deepEqual(problems, [], '接线面缺陷：' + JSON.stringify(problems));
    ok('接线逐点在场（判据体与 D 段负控制同源）');
});

/* ========== B 模块真加载 + 行为 ========== */
test('v3260 B. 模块真加载：导出三项 + 三类真构造 + 逐类语义抽检', () => {
    assert.deepEqual(Object.keys(M).sort(), GEN.slice().sort(), '导出面须为三个类');
    for (const n of GEN) assert.equal(typeof M[n], 'function', n + ' 须可构造');
    const d = new M.DiarySystem();
    d.diaries = { '甲': [{ floor: 1, text: 'a' }, { floor: 3, text: 'b' }], '乙': [{ floor: 2, text: 'c' }] };
    assert.equal(d.getChangesSince(0, []).length, 3, '游标后的变化全读');
    assert.equal(d.getChangesSince(2, []).length, 1, '游标过滤生效');
    assert.equal(d.getChangesSince(0, ['乙']).length, 1, '角色白名单生效');
    assert.equal(d.search(['甲']).length, 2, 'search 按角色取尾部');
    assert.equal(d.removeByFloor(3), 1, '按楼层删除计数');
    assert.equal(d.removeByFloor(3), 0, '重复删除幂等');
    assert.deepEqual(Object.keys(d.export()).sort(), ['diaries', 'lastDiaryFloor'], '导出形状');
    const r = new M.ReflectionSystem();
    r.items = [{ importance: 1, insight: 'x' }, { importance: 9, insight: 'y' }, { importance: 5, insight: 'z' }];
    assert.equal(r.search(2).length, 2, 'Top-N 条数');
    assert.equal(r.search(1)[0].insight, 'y', 'Top-N 按重要度降序');
    r.import({ items: [{ importance: 2 }], lastReflectFloor: 7 });
    assert.equal(r._lastReflectFloor, 7, '导入对象形带游标');
    r.import([{ importance: 3 }]);
    assert.equal(r.items.length, 1, '导入数组形');
    const o = new M.OutlineDirector();
    assert.equal(o.exhausted, true, '无阶段即耗尽');
    assert.equal(o.toPrompt(), '', '无阶段不产注入块');
    const raw = '<stage_title>第一阶段</stage_title><node><node_title>n1</node_title><node_goal>g</node_goal><turn pacing=' + SQ + 'setup' + SQ + '>t1</turn></node>';
    const st = o.parseOutline(raw, 1);
    assert.ok(st && st.nodes.length === 1, '宽容解析出阶段与节点');
    assert.equal(o.flatTurns.length, 1, '扁平轮次展开');
    assert.equal(o.exhausted, false, '解析后不再耗尽');
    o.advanceTurn(2);
    assert.equal(o.exhausted, true, '推进到末轮后耗尽');
    o.rollbackFloor(2);
    assert.ok(o.history.length >= 0, '回滚面在场');
    assert.equal(o.parseOutline('nope', 3), null, '无 node 标签时解析器返回 null（不抛）');
    assert.ok(o.export() && o.export().stage, '导出形状含 stage');
    assert.ok(Array.isArray(M.OutlineDirector.TEMPOS), '静态节奏表在场');
    ok('导出三项；三类真构造且关键语义抽检通过');
});

/* ========== C 加载面与基线 ========== */
test('v3260 C. 加载面与基线：manifest 恰 1 项 + 基线读数随本刀同源重建', () => {
    const mf = JSON.parse(read('manifest.json'));
    assert.equal(mf.extra_js.filter((f) => f === MOD_REL).length, 1, MOD_REL + ' 须在 extra_js 恰好 1 次');
    const b = JSON.parse(read('tests/audit/host_beast_baseline.json'));
    assert.equal(b.readings.total_lines, IDX.split(NL).length, '基线行数须等于真 index.js 行数');
    const _cur = b.measured_at;
    assert.ok(b.rebuilds[_cur], '当版须在 rebuilds 面留读数（每次重建才可回溯）');
    assert.equal(b.rebuilds[_cur].readings.member_count, b.readings.member_count, 'rebuilds 与 readings 同读数');
    assert.ok(b.readings.member_count < 553, '成员数须已随本刀下降（剥走前的基线是 553）');
    assert.ok(b.readings.total_lines < 17776, '行数须已随本刀下降（剥走前 17776）');
    assert.ok(b.readings.total_lines <= 17500, '本刀须至少剥掉 270 行，实测 ' + b.readings.total_lines);
    ok('manifest 恰 1 项；基线行数/成员数与真文件同源且已下降');
});

/* ========== D 真源码破坏 -> 同一条判据必须翻红 ========== */
test('v3260 D. 真源码破坏 -> 同一条判据必须翻红（取库口 / 模块类名 / 构造点 / 退路方法 各一条）', () => {
    const b1 = breakSource(IDX, 'window.LonShaNarrativeGenerators, ' + SQ + MOD_REL + SQ,
        'window.LonShaNarrativeGeneratorsTYPO, ' + SQ + MOD_REL + SQ, 'A1-取库口');
    assert.ok(judgeSlice(b1, MOD).some((p) => p.includes('真读表达式')), '取库口读错全局名必须翻红');
    const b2 = breakSource(MOD, '    class ReflectionSystem {', '    class ReflectionSystemX {', 'A1-模块类名');
    assert.ok(judgeSlice(IDX, b2).some((p) => p.includes('缺 ReflectionSystem')), '模块缺类必须翻红');
    const b3 = breakSource(IDX, 'this.outline = _newNarrativeGenerator(' + SQ + 'OutlineDirector' + SQ + ');', 'this.outline = null;', 'A1-漏接构造点');
    assert.ok(judgeSlice(b3, MOD).some((p) => p.includes('_newNarrativeGenerator(')), '漏接构造点必须翻红');
    const b4 = breakSource(IDX, '        generateLiving() { return 0; }' + NL, '', 'A1-退路缺方法');
    assert.ok(judgeSlice(b4, MOD).some((p) => p.includes('退路缺方法 DiarySystem.generateLiving')), '退路少一个方法必须翻红');
    ok('四条真源码破坏各自被同一条判据抓到（破坏面不是抽样面）');
});

/* ========== E 出生版本下限锚 ========== */
const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
test('v3260 E. 出生版本下限锚（本档出生在 3.258.0）', () => {
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(vnum(codeVer) >= vnum('3.258.0'), '本套件只在 3.258.0 及以后成立；当前 ' + codeVer);
    ok('本档锚着 ' + codeVer);
});

/* ========== F 判据面自防护 ========== */
test('v3260 F. 判据面自防护：实现住在本档 + 走唯一破坏真源 + 清单不得缩水', () => {
    const SELF = read('tests/v3260_a1_narrative_generators.test.mjs');
    assert.ok(/function judgeSlice\(/.test(SELF), '判据体必须住在本档');
    assert.ok(/function fallbackParity\(/.test(SELF), '退路对账必须住在本档');
    assert.ok(SELF.includes('breakSource') && SELF.includes('./_break_kit.mjs'), '破坏必须走唯一真源');
    assert.equal(GEN.length, 3, '本刀剥走的类面为三项，不得缩水');
    assert.equal(Object.keys(FIELDS).length, 3, '构造点对位表为三项');
    assert.ok(SELF.length > 6000, '本档不得被掏空');
    assert.ok(SELF.includes('read(' + SQ + 'index.js' + SQ + ')') && SELF.includes('read(MOD_REL)'), '真源必须从磁盘读');
    ok('判据实现 / 破坏真源 / 清单规模三者自洽');
});

/* ========== G 扫描面不得退回只读入口（本刀真正咬人的地方） ========== */
function judgeScanFace(src) {
    const p = [];
    const DERIVE = 'Array.isArray(mf && mf.' + 'extra_js)';
    if (!src.includes(DERIVE)) p.push('面派生式必须真的从 manifest 读 extra_js');
    if (!src.includes('FACE_SOURCE')) p.push('扫描面须可自述来源');
    if (!/FACE\.length < 2/.test(src)) p.push('须有「面里只有入口即 exit 2」的守卫');
    if (!src.includes(String.fromCharCode(39) + 'index.js' + String.fromCharCode(39))) p.push('单文件退路须仍在（合成树夹具）');
    return p;
}
test('v3260 G. 扫描面归位：活性审计须扫「入口 + extra_js」，不得只读入口（含行为面与退化负控制）', async () => {
    const SCAN = 'tests/audit/scan_config_liveness.mjs';
    const scanSrc = read(SCAN);
    assert.deepEqual(judgeScanFace(scanSrc), [], '扫描面守卫逐条在场');
    /* 负控制：把派生面的真源破坏掉，同一条判据必须翻红。 */
    /* 锚点选在派生式上：'manifest.extra_js' 在本文件出现两次（一处读一处自述），不满足「恰中 1 次」。 */
    const REVERT = 'const list = [ENTRY].concat(' + 'Array.isArray(mf && mf.' + 'extra_js) ? mf.extra_js : []).filter(Boolean);';
    const broken = breakSource(scanSrc, REVERT, 'const list = [ENTRY];', 'G-扫描面回退成只读入口');
    assert.ok(judgeScanFace(broken).length > 0, '面派生被拆后判据必须翻红');
    /* 行为面：真跑审计，读数里必须出现多文件扫描面且零死配置。 */
    const r = spawnSync(process.execPath, [SCAN], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    const out = (r.stdout || '') + (r.stderr || '');
    assert.equal(r.status, 0, '健康树上审计须 exit 0：' + out.slice(-200));
    const m = /扫描面 (\d+) 个文件/.exec(out);
    assert.ok(m, '读数行须说出扫描面有多少个文件');
    assert.ok(Number(m[1]) >= 2, '扫描面必须含入口之外的模块，实得 ' + m[1]);
    assert.ok(out.includes('死配置 0'), '扩面后零死配置');
    /* 退化负控制：拆去外迁模块（manifest 声明了但磁盘上没有）须 exit 2，不得静默退回窄面。 */
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3260-face-'));
    try {
        fs.copyFileSync(path.join(ROOT, 'index.js'), path.join(dir, 'index.js'));
        fs.copyFileSync(path.join(ROOT, 'settings-ui.js'), path.join(dir, 'settings-ui.js'));
        fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ name: 'x', js: 'index.js', extra_js: ['index.js', 'nope-missing.js'], version: '0.0.0' }));
        const r2 = spawnSync(process.execPath, [path.join(ROOT, SCAN)], { cwd: dir, encoding: 'utf8', timeout: 180000 });
        assert.equal(r2.status, 2, '面缺模块必须 exit 2，实得 ' + r2.status + ' / ' + ((r2.stdout || '') + (r2.stderr || '')).slice(-200));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    ok('扫描面已扩到 extra_js；窄面/缺模块两种退化都被阻断');
});
