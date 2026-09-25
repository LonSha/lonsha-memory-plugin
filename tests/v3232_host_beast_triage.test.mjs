// tests/v3232_host_beast_triage.test.mjs — index.js 宿主巨兽分诊（P-2）[v3.231.0]
//
//   本版**只量，不拆**。`index.js` 16922 行（占全仓 46%）这件事此前只有一句话的描述，
//   没有任何「它长在哪几个方法上、哪些部分能搬、搬一块要改多少接线」的读数 ——
//   而在没有读数的情况下动一个 16922 行的宿主文件，是拿猜测改架构。
//
//   本轮的结论（按读数否掉一个候选）：
//     **「按域拆走一块」不成立** —— ① 最大的成员是**生命周期接线本身**（onMessageReceived 1217 行
//     / onBeforeGeneration 503 行 / registerEvents 368 行），它们外部引用数极低，但那是
//     「唯一入口」而不是「松散」；② 引用读数只能当上界（同名方法混算：`import` 4 处 / `constructor` 3 处）；
//     ③ 规则外成员的内部互调 4696 处，且本仓 9 道门禁**没有一道**检查跨模块成员可见性，
//     拆错的形态（运行期 this 丢失）只有实机看得见。
//     唯一有读数支持的第一刀是「**成员级预算 + 文件规模上界**」——本版只立判据、不动手。
//
//   覆盖：
//     A 基线四件齐备（读数 / 口径 / 形状与分诊 / 没做什么）
//     B 探针口径自证（缩进层级 / 假零 / 位置无关 / 读数可复算）
//     C 行为面（真跑探针，读数与基线一致、TOP40 逐条在场）
//     D 结论面（「不拆」必须挂在读数上，且有读数支持的轴必须指出）
//     E 负控制（三条：成员切分层级 / 假零 / 结论抽掉读数）
//     F 版本锚
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
const BASE = path.join(AUDIT, 'host_beast_baseline.json');
const PROBE = path.join(AUDIT, 'host_beast_probe.cjs');
const read = (p) => fs.readFileSync(p, 'utf8');
const base = JSON.parse(read(BASE));
const probeSrc = read(PROBE);
const IDX_SRC = read(path.join(ROOT, 'index.js'));

/** 真跑探针（每套件一次，多组判据复用同一份输出） */
function runProbe() {
    const r = spawnSync(process.execPath, [PROBE], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
    assert.equal(r.status, 0, '探针必须能跑通：' + String(r.stderr || '').slice(0, 300));
    try { return JSON.parse(r.stdout); } catch (e) { assert.fail('探针输出必须是 JSON：' + String(r.stdout).slice(0, 160)); }
}
const rep = runProbe();
const R = base.readings;

/* ══════════ 共用判据体（A/C/D 与 E 负控制跑的是**同一份**代码） ══════════ */
function assertBaselineShape(b) {
    for (const k of ['readings', 'caliber', 'shape', 'split_verdict', 'corrections', 'not_done']) {
        assert.ok(b[k], '缺面：' + k);
    }
    for (const [k, v] of Object.entries(b.readings)) {
        assert.ok(Number.isFinite(v) && v >= 0, k + ' 必须是有限非负数');
    }
    assert.ok(Array.isArray(b.caliber) && b.caliber.length >= 3, '口径必须逐条写明');
    assert.ok(Array.isArray(b.corrections), '修正面在场');
    assert.ok(Array.isArray(b.not_done) && b.not_done.length >= 3, '必须如实写下没做什么');
}

function assertProbeNumbers(r) {
    /* 成员切分必须落在合理量级（首版切出 4 个 —— 那是把 if / const 当成了方法） */
    assert.ok(r.member_count > 100 && r.member_count < 5000, '成员数须落在合理量级，实测 ' + r.member_count);
    assert.ok(r.total_lines > 10000, 'index.js 行数须 > 10000，实测 ' + r.total_lines);
    /* TOP40 逐条可读且行数单调不增 */
    assert.equal(r.biggest_members.length, 40, 'TOP40 必须给满 40 条');
    for (let i = 1; i < r.biggest_members.length; i++) {
        assert.ok(r.biggest_members[i].lines <= r.biggest_members[i - 1].lines, 'TOP40 必须按行数降序');
    }
    /* 缝合模块接线面不得是假零（首版因匹配形状错算出 0） */
    assert.ok(r.seam_modules.distinct_modules > 0, '★ 缝合模块数不得为 0（假零）');
    assert.ok(r.seam_modules.reference_sites > 0, '★ 引用点数不得为 0（假零）');
    /* 域账必须自洽：各域行数之和不得超过文件总行数 */
    const sumDomains = r.domains.reduce((a, d) => a + d.lines, 0);
    assert.ok(sumDomains <= r.total_lines, '各域行数之和不得超过总行数（' + sumDomains + ' vs ' + r.total_lines + '）');
}

function assertVerdict(b) {
    const v = b.split_verdict;
    assert.ok(v && v.question && v.answer, '须有被问的问题与给的答案');
    assert.ok(/不拆/.test(v.answer), '★ 结论须明确（本版按读数否掉「按域拆」）');
    /* 判据面必须把「结论 + 唯一有读数支持的轴」合起来看：轴是结论的一部分，
     *   它可能写在 reasons 里、也可能单列在 only_axis_with_evidence 里（本仓两种写法都出现过）。
     *   只扫 reasons 会把「轴写得很清楚、但位置在另一个字段」误判成「含糊收场」。 */
    const txt = v.reasons.join(' ') + ' ' + String(v.only_axis_with_evidence || '');
    assert.ok(/生命周期接线/.test(txt), '必须给出「最大成员是生命周期接线」这条读数据点');
    assert.ok(/上界/.test(txt), '必须写明引用读数只能当上界');
    assert.ok(/成员级预算|成员预算/.test(txt), '必须指出**唯一有读数支持的**那条轴');
    assert.ok(/只立判据不动手|本版只立判据|只立判据/.test(txt), '必须写明本版不动手');
}

/* ══════════ A 基线本体 ══════════ */
test('v3232 A1. ★★ 基线四件齐备：读数 / 口径 / 形状与分诊 / 没做什么', () => {
    assertBaselineShape(base);
    assert.ok(Object.keys(R).length >= 15, '读数至少 15 项');
    assert.ok(base.domains.length >= 8, '域账至少 8 条');
    assert.ok(base.split_candidates.threshold_lines > 0, '分诊阈值须写明');
});

test('v3232 A2. ★★★ 口径必须写明「只量不拆」与「读数零手抄」', () => {
    const txt = JSON.stringify(base);
    assert.ok(/只量，不拆/.test(txt), '必须写明只量不拆');
    assert.ok(/零手抄/.test(txt), '必须写明读数由脚本从探针输出直接落盘');
    assert.ok(/物理行/.test(txt), '必须写明行数是物理行');
    assert.ok(/8 空格/.test(txt), '必须写明成员切分的缩进口径');
    assert.ok(/上界/.test(txt), '必须写明引用读数只能当上界');
});

test('v3232 A3. ★★★ 形状读数自洽：TOP5 / TOP40 / 前缀覆盖率与明细一致', () => {
    const t = R.total_lines;
    assert.equal(R.top5_lines, base.biggest_members_top40.slice(0, 5).reduce((a, x) => a + x.lines, 0), 'TOP5 行数须与明细一致');
    assert.equal(R.top40_lines, base.biggest_members_top40.reduce((a, x) => a + x.lines, 0), 'TOP40 行数须与明细一致');
    const classified = base.domains.filter((d) => d.domain !== '（未归类）').reduce((a, d) => a + d.lines, 0);
    assert.equal(R.prefix_rule_coverage_lines, classified, '前缀覆盖率须与域账一致');
    assert.ok(Math.abs(R.top5_pct - R.top5_lines * 100 / t) < 0.15, 'TOP5 占比可复算');
    assert.ok(Math.abs(R.top40_pct - R.top40_lines * 100 / t) < 0.15, 'TOP40 占比可复算');
    assert.ok(Math.abs(R.prefix_rule_coverage_pct - classified * 100 / t) < 0.15, '覆盖率可复算');
    /* 头条结论的形状：少数超大成员 + 长尾（TOP5 占比须显著高于 10%） */
    assert.ok(R.top5_pct > 15, '「少数超大成员」这条读数据点须成立，实测 ' + R.top5_pct + '%');
});

/* ══════════ B 探针口径自证 ══════════ */
test('v3232 B1. ★★★ 成员切分必须按 8 空格并排除控制流关键字（首版按 4 空格切出 4 个方法）', () => {
    assert.match(probeSrc, /const MEMBER_RE = \/\^ \{8\}/, '必须按 8 空格切分');
    assert.match(probeSrc, /if \(\/\^\(if\|for\|while\|switch\|catch/, '必须显式排除控制流关键字');
    /* 行为面：切出来的成员名里不得混进控制流词 */
    const bad = rep.biggest_members.filter((m) => /^(if|for|while|switch|catch|return|typeof|function)$/.test(m.name));
    assert.deepEqual(bad, [], '成员名里不得混进控制流关键字');
    /* 并且切分结果要与基线声明的口径一致（成员数落在合理量级） */
    assert.ok(rep.member_count > 100, '成员数须 > 100（首版的 4 就是本条要防的形态）');
});

test('v3232 B2. ★★★ 假零防护：缝合模块接线面必须匹配完整调用形状', () => {
    /* 源码面：正则必须容忍第一参箭头函数（`_moduleLib(() => window.X, 'a.js')`） */
    assert.match(probeSrc, /_moduleLib\\\(\\s\*\\\(\\\)\\s\*=>\\s\*window\\\./, '必须匹配 `() => window.X` 形状');
    assert.match(probeSrc, /'\(\[\^'\]\+\\\.js\)'/, '必须显式要求文件名以 .js 结束');
    /* 骨架自证：源码里 _moduleLib( 的实际出现次数必须 ≥ 探针报出的引用点数 */
    const callSites = (IDX_SRC.match(/_moduleLib\(/g) || []).length;
    assert.ok(callSites >= rep.seam_modules.reference_sites, '骨架调用点必须 ≥ 匹配到的引用点');
    assert.equal(rep.seam_modules.call_shape_sites, callSites, '骨架计数须与源码一致');
});

test('v3232 B3. ★★ 位置无关：探针不得写死绝对路径', () => {
    assert.ok(!/\/home\/[a-z]/.test(probeSrc), '探针不得写死绝对路径（scan_cross_repo_binding P1 拦这个）');
    assert.match(probeSrc, /path\.resolve\(__dirname, '\.\.', '\.\.'\)/, '根目录须由 __dirname 派生');
});

/* ══════════ C 行为面 ══════════ */
test('v3232 C1. ★★★ 真跑探针：读数与基线一致（成员数 / 总行数 / TOP40 逐条在场）', () => {
    assertProbeNumbers(rep);
    assert.equal(rep.member_count, R.member_count, '成员数须与基线一致');
    assert.equal(rep.total_lines, R.total_lines, '总行数须与基线一致');
    /* TOP40 逐条在场：基线记的每个成员都必须在探针当前输出里、且行数相同。
     *   ★ 必须按「同名第 k 条」对位，不能按名查第一条 —— 首版就是这么写的，
     *   而 TOP40 里 `import` 有两条（206 / 179），两条都查到第一条 ⇒ 第二条假报漂移。
     *   「同名成员」这件事在本仓不是偶发：它就是 D1 断言里那条「引用读数只能当上界」的成因。 */
    const seen = new Map();
    for (const m of base.biggest_members_top40) {
        const k = (seen.get(m.name) || 0);
        seen.set(m.name, k + 1);
        const same = rep.biggest_members.filter((x) => x.name === m.name);
        assert.ok(same.length > k, '★ 基线成员必须仍以至少 ' + (k + 1) + ' 条同名身份在 TOP40 里：' + m.name);
        assert.equal(same[k].lines, m.lines,
            m.name + '（同名第 ' + (k + 1) + ' 条）行数漂移（基线 ' + m.lines + ' / 实测 ' + same[k].lines + '）');
    }
});

test('v3232 C2. ★★★ index.js 的真实规模必须被分诊（不许基线在一个不存在的文件上成立）', () => {
    const idxLines = IDX_SRC.split('\n').length;
    assert.equal(rep.total_lines, idxLines, '★ 探针读的必须就是真 index.js（实测 ' + rep.total_lines + ' vs ' + idxLines + '）');
    assert.ok(idxLines > 16000, 'index.js 规模须仍在同一量级，实测 ' + idxLines);
    /* 主权声明：本版不动 index.js —— 用「行数没变」之外的更强判据：探针记录的行数必须等于文件行数
     *   （已断言）；而「是否被改动」由 git 面保证，不在此重复。 */
    assert.equal(base.split_candidates.total_over_threshold, R.members_over_80_lines, '分诊总数须与读数一致');
});

/* ══════════ D 结论面 ══════════ */
test('v3232 D1. ★★★ 「不拆」必须挂在读数上，且算术可复算', () => {
    assertVerdict(base);
    /* 读数据点 1：最大成员是生命周期接线 —— 名字形状与行数都要对得上 */
    const top1 = base.biggest_members_top40[0];
    assert.match(top1.name, /^on/, '最大成员须是宿主回调形状（on*），实测 ' + top1.name);
    assert.ok(top1.lines >= 1000, '最大成员须 ≥ 1000 行，实测 ' + top1.lines);
    /* 读数据点 2：该成员的外部引用数极低 —— 这正是「低引用 ≠ 低耦合」的证据 */
    assert.ok(top1.outside_refs <= 2, '最大成员的外部引用数须极低，实测 ' + top1.outside_refs);
    /* 读数据点 3：同名重复（引用读数只能当上界） */
    const names = base.biggest_members_top40.map((m) => m.name);
    const dup = names.filter((n, i) => names.indexOf(n) !== i);
    assert.ok(dup.length > 0, '★ TOP40 里必须存在同名成员（否则「引用读数只能当上界」这条是无据之谈），实测 ' + JSON.stringify([...new Set(dup)]));
    /* 读数据点 4：分诊表把生命周期面单列 */
    assert.ok(base.split_candidates.high_coupling_examples.length > 0, '高耦合例须在场');
    assert.ok(base.split_candidates.low_coupling_examples.every((x) => x.is_host_lifecycle === false),
        '低耦合例里不得混入生命周期成员');
});

test('v3232 D2. ★★★ 结论须给出「唯一有读数支持的轴」而不是含糊收场', () => {
    assert.match(base.split_verdict.only_axis_with_evidence, /成员级预算/, '必须点名成员级预算这条轴');
    assert.match(base.split_verdict.only_axis_with_evidence, /只立判据不动手|本版只立判据|只立判据/,
        '必须写明本版只立判据不动手');
    /* 且「没做什么」里必须逐条写明未拆 / 未做 AST / 未排优先级 */
    const nd = base.not_done.join(' ');
    assert.ok(/未拆任何东西/.test(nd), '必须写明未拆任何东西');
    assert.ok(/AST/.test(nd), '必须写明未做 AST 级归属');
    assert.ok(/优先级/.test(nd), '必须写明未排优先级');
});

/* ══════════ E 负控制（真源码破坏 → **镜像仓**里重跑探针 → 同款真判据必须转红） ══════════
 * 镜像结构（必须与真仓同形，否则探针从 `__dirname` 上溯两级找不到 index.js）：
 *   <tmp>/index.js                  ← 真 index.js（供成员切分与外部引用扫描）
 *   <tmp>/tests/audit/<probe>.cjs   ← 破坏后的探针
 * 纪律：负控制不得自己另写一份简化判据 —— 一律调用上面的 `assertProbeNumbers`。
 */
const isAssertionFailure = (e) => e && e.name === 'AssertionError';
const clone = (o) => JSON.parse(JSON.stringify(o));

function withBrokenProbe(mutate, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3232-neg-'));
    try {
        fs.mkdirSync(path.join(dir, 'tests', 'audit'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.js'), IDX_SRC);
        const brokenSrc = mutate(probeSrc);
        assert.notEqual(brokenSrc, probeSrc, '破坏必须真发生');
        const p = path.join(dir, 'tests', 'audit', 'probe.cjs');
        fs.writeFileSync(p, brokenSrc);
        const r = spawnSync(process.execPath, [p], { cwd: dir, encoding: 'utf8', timeout: 240000 });
        assert.equal(r.status, 0, '破坏副本本身仍须能跑通（否则「红了」不说明判据有效）：' + String(r.stderr || '').slice(0, 200));
        return fn(JSON.parse(r.stdout));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('v3232 N1. ★★★ 破坏「成员切分层级」（把 8 空格改回 4 空格）⇒ B1 同款判据必须转红', () => {
    const anchor = 'const MEMBER_RE = /^ {8}';
    assert.equal(probeSrc.split(anchor).length - 1, 1, '锚点须恰中 1 次');
    withBrokenProbe((s) => s.replace(anchor, 'const MEMBER_RE = /^ {4}'), (got) => {
        assert.throws(() => assertProbeNumbers(got), isAssertionFailure,
            'B1 同款判据在破坏副本上必须抛（4 空格把 if / const 当成了方法）');
        assert.ok(got.member_count < 100, '（破坏已生效：切出 ' + got.member_count + ' 个成员）');
    });
});

test('v3232 N2. ★★★ 破坏「缝合模块匹配」（退回遇右括号即止）⇒ B2 同款判据必须转红', () => {
    const anchor = "const re = /_moduleLib\\(\\s*\\(\\)\\s*=>\\s*window\\.[A-Za-z_$][\\w$]*\\s*,\\s*'([^']+\\.js)'\\s*\\)/g;";
    assert.equal(probeSrc.split(anchor).length - 1, 1, '锚点须恰中 1 次');
    withBrokenProbe((s) => s.replace(anchor, "const re = /_moduleLib\\([^)]*?'([^']+\\.js)'\\)/g;"), (got) => {
        assert.throws(() => assertProbeNumbers(got), isAssertionFailure,
            'B2 同款判据（缝合模块不得为假零）在破坏副本上必须抛');
        assert.equal(got.seam_modules.distinct_modules, 0, '（破坏已生效：又变成假零）');
    });
});

test('v3232 N3. ★★★ 破坏「结论的读数据点」（把 TOP5 占比改成 3%）⇒ D1 同款判据必须转红', () => {
    const broken = clone(base);
    const t = broken.readings.total_lines;
    /* 造一个「巨兽很均匀」的假象：TOP5 只占 3% */
    let remain = Math.round(t * 0.03);
    for (let i = 0; i < 5; i++) {
        broken.biggest_members_top40[i].lines = Math.max(1, Math.floor(remain / (5 - i)));
        remain -= broken.biggest_members_top40[i].lines;
    }
    broken.readings.top5_lines = broken.biggest_members_top40.slice(0, 5).reduce((a, x) => a + x.lines, 0);
    broken.readings.top5_pct = Math.round(broken.readings.top5_lines * 1000 / t) / 10;
    const chk = () => {
        assert.equal(broken.readings.top5_lines, broken.biggest_members_top40.slice(0, 5).reduce((a, x) => a + x.lines, 0));
        assert.ok(broken.readings.top5_pct > 15, '「少数超大成员」这条读数据点须成立');
        assert.ok(broken.biggest_members_top40[0].lines >= 1000, '最大成员须 ≥ 1000 行');
    };
    assert.throws(chk, isAssertionFailure, 'D1 同款判据必须抛');
    /* 对照：原件上同款判据必须通过 */
    assert.ok(base.readings.top5_pct > 15 && base.biggest_members_top40[0].lines >= 1000, '对照：原件上成立');
});

/* ══════════ F 版本锚 ══════════ */
const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));

test('v3232 F1. ★ 版本锚（下限形）+ 三源同源 + 基线测量版本在场', () => {
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
    const mf = JSON.parse(read(path.join(ROOT, 'manifest.json')));
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX_SRC) || [])[1];
    assert.ok(codeVer, '入口版本常量在场');
    assert.equal(pkg.version, codeVer, 'package 同源');
    assert.equal(mf.version, codeVer, 'manifest 同源');
    assert.ok(vnum(codeVer) >= vnum('3.231.0'), '本套件只在 3.231.0 及以后成立；当前 ' + codeVer);
    assert.equal(base.measured_at, 'v3.231.0', '基线须标出测量版本');
});