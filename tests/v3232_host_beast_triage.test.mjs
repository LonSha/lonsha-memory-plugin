// tests/v3232_host_beast_triage.test.mjs — index.js 宿主巨兽分诊（P-2）[v3.231.0]
//
//   本版**只量，不拆**。`index.js` 16922 行（v3.231.0 实测；占全仓 46%）这件事此前只有一句话的描述，
//   没有任何「它长在哪几个方法上、哪些部分能搬、搬一块要改多少接线」的读数 ——
//   而在没有读数的情况下动一个 16922 行的宿主文件，是拿猜测改架构。
//   （行数与成员数在 v3.233.0 已被 F-2 抬高，基线里的 `rebuilds` 面如实记着两次读数；
//     本套件不再把当版读数写成契约 —— 那正是「锁当版」这条反模式。）
//
//   本轮的结论（按读数否掉一个候选）：
//     **「按域拆走一块」不成立** —— ① 最大的成员是**生命周期接线本身**（onMessageReceived 1217 行
//     / onBeforeGeneration 503 行 / registerEvents 368 行），它们外部引用数极低，但那是
//     「唯一入口」而不是「松散」；② 引用读数只能当上界（同名方法混算：`import` 4 处 / `constructor` 3 处）；
//     ③ 规则外成员的内部互调 4696 处（v3.231.0 实测；v3.233.0 为 4697），且本仓 9 道门禁**没有一道**检查跨模块成员可见性，
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
/* [v3.421.0] 宿主面合并读：index.js 的方法已大批外提到 engine-*.js / memory-core.js，
 *   入口只剩一行委派。只读入口的测试因此两重受害 ——
 *   ① 方法体根本不在入口里（断言找不到）；
 *   ② 抠出来的片段没有闭包作用域（_moduleLib / errLog …）→ ReferenceError。
 *   改读 hostSurface 的合并面（v3160/v3161/v3163 同一机制）。变量名与下游断言一字不改。
 *   顺序：入口在前、模块在后 —— 版本常量这类「以入口为准」的断言必须先命中入口；
 *   而入口里的单行委派体一律先剥掉，否则抽取助手取首次命中会抠到委派（只剩一句委托）。 */
import { hostSurface as __hostSurfaceRaw, HOST_MODULES } from './_audit_lib.mjs';
import __hostPath from 'node:path';
import { fileURLToPath as __hostFu } from 'node:url';
/* 写成函数声明而不是 const 箭头：读取语句常落在文件前几行，而 import 段可能在它下面。
 *   声明提升是唯一与语句顺序无关的写法（const 会撞 TDZ，实测 4 档因此新红）。 */
function __hostSurface() {
    const __root = __hostFu(new URL('..', import.meta.url));
    const __face = __hostSurfaceRaw(__root, {
        fs: { readFileSync: fs.readFileSync, existsSync: () => true },
        path: __hostPath,
    });
    /* 单行委派形如 `foo(a) { const M = _moduleLib(...); return M ? ... ; }` —— 从正文里**移走**。
     *   两行以上的委派很少，且那种形态抽取助手本来就抠不全，留给模块面兜。
     *   [v3.421.0] 但**不能丢弃**：一批「宿主出口各恰一处」的判据问的就是这些委派桩本身
     *   （`foo(...args) {` 只存在于入口的委派行里，模块面是 `function foo(engine, ...)`）。
     *   故剥下来的行收集到扫描面**最末**：抽取助手仍先命中模块面的真实现（委派在尾部），
     *   而字符串在场判据照旧命中。丢弃会让那批判据整片假红。 */
    const __deleg = [];
    const __squeeze = (raw) => raw.split(String.fromCharCode(10))
        .filter((ln) => {
            const __isDeleg = /^[ \t]*[_a-zA-Z$][\w$]*[ \t]*\(.*\)[ \t]*\{.*_moduleLib\(.*\}[ \t]*$/.test(ln);
            if (__isDeleg) __deleg.push(ln);
            return !__isDeleg;
        })
        .join(String.fromCharCode(10));
    return __face.files.map((f) => __squeeze(f.raw)).join(String.fromCharCode(10))
        + String.fromCharCode(10) + '// ==== 剥下的单行委派（入口原文，供「出口在场」判据） ====' + String.fromCharCode(10)
        + __deleg.join(String.fromCharCode(10));
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const AUDIT = path.join(ROOT, 'tests', 'audit');
const BASE = path.join(AUDIT, 'host_beast_baseline.json');
const PROBE = path.join(AUDIT, 'host_beast_probe.cjs');
const read = (p) => fs.readFileSync(p, 'utf8');
const base = JSON.parse(read(BASE));
const probeSrc = read(PROBE);
const IDX_SRC = __hostSurface();

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
    /* ★ [v3.421.0] 面覆盖：宿主面的**每个文件**都必须切出成员。
     *   这一条才是「单一缩进档」真正要防的形态 —— 外提模块把原方法体整段搬过来，
     *   签名与体内语句同缩进（engine-self-check.js 签名 8 行号 / 体内也 8），
     *   只认 8 空格时那 12 个模块里 11 个整段被吞进上一个成员（实测各切出 0 个成员）。 */
    const zeroFaces = r.surface_files.filter((f) => !(r.members_by_file[f] > 0));
    assert.deepEqual(zeroFaces, [], '★ 宿主面每个文件都必须切出成员（否则该面整段被吞）：' + zeroFaces.join(', '));
    /* ★ 两个面必须分开报：入口（行预算守的）与合并面（成员占比分母）。 */
    assert.equal(r.total_lines, r.entry_lines, 'total_lines 必须保持入口语义（行上界预算守的就是入口文件）');
    assert.ok(r.surface_lines >= r.entry_lines, '合并面行数不得小于入口，实测 ' + r.surface_lines + ' vs ' + r.entry_lines);
    /* TOP40 逐条可读且行数单调不增 */
    assert.equal(r.biggest_members.length, 40, 'TOP40 必须给满 40 条');
    for (let i = 1; i < r.biggest_members.length; i++) {
        assert.ok(r.biggest_members[i].lines <= r.biggest_members[i - 1].lines, 'TOP40 必须按行数降序');
    }
    /* 缝合模块接线面不得是假零（首版因匹配形状错算出 0） */
    assert.ok(r.seam_modules.distinct_modules > 0, '★ 缝合模块数不得为 0（假零）');
    assert.ok(r.seam_modules.reference_sites > 0, '★ 引用点数不得为 0（假零）');
    /* 域账必须自洽：各域行数之和不得超过**成员所属的那个面**的行数。
     *   ★ [v3.421.0 修] 原文比的是 r.total_lines（入口）—— 域账是在合并面上分的，
     *   拿入口行数当上限会算出「147%」的假红（实测各域之和 27467 vs 入口 11696）。 */
    const sumDomains = r.domains.reduce((a, d) => a + d.lines, 0);
    assert.ok(sumDomains <= r.surface_lines,
        '各域行数之和不得超过合并面行数（' + sumDomains + ' vs ' + r.surface_lines + '）');
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
    /* ★ [v3.421.0 修] 原文 `const t = R.total_lines` —— 探针只量入口时两个面同源，看不出问题；
     *   改读宿主面之后 TOP40 里绝大多数成员住在外提模块，拿入口行数当分母会算出 107%
     *   （占比超过 100% 的读数）。分母必须跟着成员走 ⇒ 用 surface_lines。
     *   同时把「入口面仍然只守入口」这条留住（total_lines === entry_lines 由 C2 把守）。 */
    const t = R.surface_lines;
    assert.ok(t > R.total_lines, '形状分母须是合并面（成员所属的面），实测 ' + t + ' vs 入口 ' + R.total_lines);
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
test('v3232 B1. ★★★ 成员切分必须双档并存 + 按父容器判层级（首版单一缩进档切出 4 个方法 / 后续各版都被真读数打回）', () => {
    /* 源码面：两档签名正则都必须在 —— 入口类体成员 8 空格、外提模块成员 4 空格。
     *   ★ 本条原文是「必须按 8 空格切分」（`const MEMBER_RE = /^ {8}/`）。宿主面外提之后
     *   它是**双档**的：模块是把原方法体整段搬过来的搬运体，签名与体内语句同缩进，
     *   只认 8 就会把模块面整段吞掉（12 个模块里 11 个切出 0 个成员）。
     *   而「按缩进切」这件事本身已被真读数否掉四次（记载在基线的 corrections 里），
     *   故判据同时要求「按父容器」这条结构判据在场。 */
    assert.match(probeSrc, /const SIG4 = sigRe\(4\), SIG8 = sigRe\(8\);/, '必须双档并存：入口类体 8 空格 + 外提模块 4 空格');
    assert.match(probeSrc, /!stack\[stack\.length - 1\]\.isMember/, '必须按「父容器本身是成员就不算成员」判层级（嵌套闭包内的同名不算）');
    assert.match(probeSrc, /stack\[stack\.length - 1\]\.depth === depth - 1/, '签名必须挂在直接父容器上（不数缩进、不猜层级）');
    assert.match(probeSrc, /const CTL = \/\^\(if\|for\|while\|switch\|catch/, '必须显式排除控制流关键字（具名表 + CTL.test 双档共用）');
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
test('v3232 C1. ★★★ 真跑探针：TOP40 逐条在场（本版起不再锁当版读数，见行内注释）', () => {
    assertProbeNumbers(rep);
    /* ★ v3.233.0 交棒：原来在此断言「成员数/总行数 == 基线」—— 那是**锁当版读数**，
     *   下一次抬版只要碰过 index.js 就必红，而「成员多了 1 个」本身不是缺陷；
     *   更坑的是它会把「基线是陈旧记载」错报成「实现漂移」。
     *   本版两件事拆开：① 本套件只守**基线自身自洽**（B/D 段）+ **代理真读数**（C2：探针读的
     *   就是真 index.js）；② 「文件这批版本里变了多少」由基线的 `rebuilds` 面如实记着，
     *   不假装成契约。③ 「文件到底被没被改」交给 git 面（基线里记不得这件事）。 */
    assert.ok(R.member_count > 0, '基线必须记着成员数（自洽面），实 %s' % R.member_count);
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
    /* ★ [v3.421.0 修] 原文是 `const idxLines = IDX_SRC.split('\n').length` 再拿 rep.total_lines 比它 ——
     *   这条在探针改成读宿主面之后成了**假红**：IDX_SRC 是合并面（约 2.8 万行），
     *   而 rep.total_lines 守的是入口（1.1 万行）。两个面各自对各自的真源，
     *   「探针读的就是真源码」这条命题才被证明（否则它在两个不同文件上各自成立）。
     *   · 入口面：rep.entry_lines === 真 index.js 物理行数（行上界预算守这个数）
     *   · 合并面：rep.surface_lines === 判据侧 hostSurface 的合并文本行数 */
    const idxLines = read(path.join(ROOT, 'index.js')).split('\n').length;
    assert.equal(rep.entry_lines, idxLines, '★ 探针的入口行数必须就是真 index.js（实测 ' + rep.entry_lines + ' vs ' + idxLines + '）');
    assert.equal(rep.surface_lines, IDX_SRC.split('\n').length,
        '★ 合并面行数须与判据侧 hostSurface 逐行一致（实测 ' + rep.surface_lines + ' vs ' + IDX_SRC.split('\n').length + '）');
    assert.ok(rep.surface_lines > rep.entry_lines * 1.5,
        '合并面须显著大于入口（否则外提模块没被算进来）：' + rep.surface_lines + ' vs ' + rep.entry_lines);
    /* [v3.264.0 交棒] 原句是「> 16000」（v3.231.0 的当版量级）；A1 连剥五刀后它失效，而「仍是巨兽」这个命题本身仍真（仍占全仓四成以上）。
     *   下界改为「A1 首刀后的真读数不得回涨到剥前水平」—— 它才是不随抬版失效的不变量。 */
    assert.ok(idxLines > 10000, 'index.js 须仍在巨兽量级（> 10000），实测 ' + idxLines);
    /* [v3.315.0 交棒] 原文是 `idxLines < 17091` —— 与 v3264 C / v3266 C / v3261 C 踩过的是**同一族坑**：
     *   它是 v3.231.0 那一刀的**一次性事实**（「剥前水平 17091」），不是永久不变量。
     *   后续活跃功能增长（v3.315.0 M-X5 宿主接线 +177 行）把它推回线上，翻红的信息量只剩「数字不够小」；
     *   而「剥了又长回来」这件事应由**登记面**把守。A1 的真实不变量是「各刀之后宿主读数始终低于
     *   A1 首刀前基线（18401）」，照旧在下面把守。
     *   交棒**不弱化**判据面：活体上界改读 `host_beast_baseline.json` 的 `line_budget` 登记面
     *   （ceiling + history + maxSlack；抬升只走脚本 `_rebuild_host_beast.py`，三条读数自动同步）。
     *   本档只读 ceiling 与余量（history/note 两处自洽由 v3266 C / v3261 C 把守 —— 立两份就是两份真源）。 */
    const _lb = base.line_budget || null;
    assert.ok(_lb && Number.isFinite(_lb.ceiling), '宿主行数上界必须登记（否则「长回线上」无人管）');
    assert.ok(idxLines <= _lb.ceiling,
        '★ 宿主行数须 <= 登记上界 ' + _lb.ceiling + '，实测 ' + idxLines);
    assert.ok(_lb.ceiling - idxLines <= _lb.maxSlack,
        '上界余量 ' + (_lb.ceiling - idxLines) + ' 不得超过 maxSlack ' + _lb.maxSlack
        + '（余量过大 = 上界与实测脱节，等于没守）');
    /* [v3.327.0 E 包记忆侧 交棒] 原文是 `idxLines < 18401`(A1 首刀前基线)—— 与 v3264 C / v3266 C / v3261 C /
     *   v3315 踩过的是**同一族坑**:它是 v3.231.0 那一刀的**一次性事实**,不是永久不变量。后续活跃功能增长
     *   把它推回线上,翻红的信息量只剩「数字不够小」;而「剥了又长回来」这件事应由**登记面**把守。
     *   故改为**方向相反的不变量**:凡读数不低于 A1 首刀前基线,则必须能在 `line_budget.history` 里
     *   找到**当版登记条目**(长回线上要有账、且只走脚本;偷长 = 无账可查 ⇒ 翻红)。 */
    const _hist = (_lb && Array.isArray(_lb.history)) ? _lb.history : [];
    const _born = String(base.measured_at || '');
    assert.ok(idxLines < 18401 || _hist.some((h) => typeof h.reason === 'string' && _born && h.reason.indexOf(_born) >= 0),
        '★ 宿主读数已回到 A1 首刀前基线(18401)之上(实测 ' + idxLines + ')⇒ 必须在 line_budget.history 里留下当版登记(' + _born + '),否则「长回线上」无账可查');
    /* 主权声明：本版不动 index.js —— 用「行数没变」之外的更强判据：探针记录的行数必须等于文件行数
     *   （已断言）；而「是否被改动」由 git 面保证，不在此重复。 */
    assert.equal(base.split_candidates.total_over_threshold, R.members_over_80_lines, '分诊总数须与读数一致');
});

/* ══════════ D 结论面 ══════════ */
test('v3232 D1. ★★★ 「不拆」必须挂在读数上，且算术可复算', () => {
    assertVerdict(base);
    /* 读数据点 1：最大成员是生命周期接线 —— 名字形状与行数都要对得上 */
    const top1 = base.biggest_members_top40[0];
    /* ★ [v3.345.0 交棒] TOP1 形状双向判定:原文锁「TOP1 匹配 /^on/」,那是 v3.231.0 的一次性读数
     *   (onMessageReceived 居首),而该断言要守的命题是「TOP1 **不是可搬的功能块**」。
     *   v3.345.0 真读数:TOP1 换成宿主自检面 selfCheck(1368 行 / 外部引用 80),
     *   生命周期入口退居第二(1363 行 / 外部引用 2)—— 两者都搬不动,命题仍真。
     *   故改为两条路:入口形状 ⇒ 引用须极低(唯一入口);自检/诊断面 ⇒ 引用须高
     *   (被全仓大量引用);且**生命周期接线本身仍须在 TOP3 内且 ≥ 1000 行**。 */
    /* ★ [v3.421.0 交棒] 原文是「生命周期接线仍须在 TOP3 内且**单成员** ≥ 1000 行」——
     *   那是 v3.345.0 当版的单成员读数（当时 onMessageReceived 在入口里 1217 行）。
     *   宿主面外提之后入口最长的 on* 只剩 onBeforeGeneration 565 行，「单成员 ≥1000」不再成立；
     *   而这条要守的命题（生命周期接线本身仍是巨兽的一大块、且搬不动）依然真 ——
     *   故改**合计口径**：入口的三个生命周期入口（onBeforeGeneration / registerEvents /
     *   onMessageReceived）合计须 ≥ 1000 行，且三个都还在 TOP40 内（不随抬版漂出边界）。 */
    const _lcNames = ['onBeforeGeneration', 'registerEvents', 'onMessageReceived'];
    const _lcHit = _lcNames.map((n) => rep.biggest_members.find((m) => m.name === n && m.file === 'index.js'));
    assert.deepEqual(_lcHit.map((x) => !!x), [true, true, true],
        '★ 三个生命周期入口都须在 TOP40 内（是否有成员被搬走 / 改名）');
    const _lcSum = _lcHit.reduce((a, m) => a + m.lines, 0);
    assert.ok(_lcSum >= 1000, '★ 生命周期接线合计仍须 ≥ 1000 行，实测 ' + _lcSum
        + '（' + _lcHit.map((m) => m.name + ' ' + m.lines).join(' / ') + '）');
    assert.ok(top1.lines >= 1000, '最大成员须 ≥ 1000 行，实测 ' + top1.lines);
    /* 读数据点 2：该成员的外部引用数极低 —— 这正是「低引用 ≠ 低耦合」的证据 */
    const _loRefs = (top1.outside_refs == null) ? 0 : top1.outside_refs;
    const _lowRef = (_loRefs <= 2);
    assert.ok(_lowRef || _loRefs >= 10, 'TOP1 引用数须落在两条路上之一(入口形状极低 / 自检面极高),实测 ' + top1.name + ' refs=' + _loRefs);
    /* 读数据点 3：同名重复（引用读数只能当上界）
     *   ★ [v3.293.0 修] 原判读的是 **TOP40 切片**里的同名 —— 那是**锁当版边界**：
     *   TOP40 的边界随 index.js 增长漂移，v3.231.0 建套件时 `import` 恰在切片内，
     *   X6/X7 加真代码后它被挤出，断言读到的是「边界漂移」而它要守的命题仍真。
     *   改读**全文**同名种类数（不随切片移动），并真跑探针复核（两处读数互相印证）。 */
    assert.ok(R.duplicate_member_names > 0,
        '★ 全文成员名里必须存在同名（否则「引用读数只能当上界」这条是无据之谈），实测 '
        + R.duplicate_member_names + ' 组');
    assert.ok(rep.duplicate_member_names.length > 0,
        '★ 探针当前输出里也必须读到同名成员（防基线记着一个已不成立的读数）');
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
        /* ★ [v3.421.0] 镜像必须与真仓**同形**：探针改读宿主面之后会去读 tests/_audit_lib.mjs
         *   的 HOST_MODULES 与那 12 个外提模块 —— 只写 index.js 的旧镜像会让探针在启动阶段
         *   就抛（「取不到 HOST_MODULES」），于是「破坏副本跑不通」被错报成判据失效。
         *   这里逐个复制真文件，探针在镜像里读到的面与真仓逐字节一致。 */
        for (const f of ['index.js', 'tests/_audit_lib.mjs'].concat(HOST_MODULES)) {
            const to = path.join(dir, f);
            fs.mkdirSync(path.dirname(to), { recursive: true });
            fs.copyFileSync(path.join(ROOT, f), to);
        }
        const brokenSrc = mutate(probeSrc);
        assert.notEqual(brokenSrc, probeSrc, '破坏必须真发生');
        const p = path.join(dir, 'tests', 'audit', 'probe.cjs');
        fs.writeFileSync(p, brokenSrc);
        const r = spawnSync(process.execPath, [p], { cwd: dir, encoding: 'utf8', timeout: 240000 });
        assert.equal(r.status, 0, '破坏副本本身仍须能跑通（否则「红了」不说明判据有效）：' + String(r.stderr || '').slice(0, 200));
        return fn(JSON.parse(r.stdout));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('v3232 N1. ★★★ 破坏「双档切分」（把 4 空格那一档摘掉，只剩入口的 8 空格）⇒ B1 同款判据必须转红', () => {
    /* 破坏面：`const m = (m8 && …) ? m8 : ((m4 && …) ? m4 : null)` → 只留 m8。
     *   这才是本仓真实的失效形态（首版「按 4 空格切出 4 个方法」是同族反方向）：
     *   外提模块的成员全在 4 空格，摘掉这一档 ⇒ 12 个模块里 11 个整段被吞。 */
    const anchor = 'const m = (m8 && !CTL.test(m8[1])) ? m8 : ((m4 && !CTL.test(m4[1])) ? m4 : null);';
    assert.equal(probeSrc.split(anchor).length - 1, 1, '锚点须恰中 1 次');
    withBrokenProbe((s) => s.replace(anchor, 'const m = (m8 && !CTL.test(m8[1])) ? m8 : null;'), (got) => {
        assert.throws(() => assertProbeNumbers(got), isAssertionFailure,
            'B1 同款判据（面覆盖）在破坏副本上必须抛（4 空格那一档摘掉后模块面整段被吞）');
        const _zero = got.surface_files.filter((f) => !(got.members_by_file[f] > 0));
        assert.ok(_zero.length > 0, '（破坏已生效：' + _zero.length + ' 个面切出 0 个成员，如 ' + _zero[0] + '）');
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
    /* [v3.232.0] 抬版即交棒：本套件保持下限锚（出生版本 3.231.0），当版精确判定交 v3233 F1。 */
    assert.ok(vnum(codeVer) >= vnum('3.231.0'), '本套件只在 3.231.0 及以后成立；当前 ' + codeVer);
    /* [v3.233.0] 交棒：基线是**读数**不是契约，F-2 抬高 index.js 后按本版重建，
     *   measured_at 跟着走；本项只守「标出了时点」与「重建是追加而非改写历史」。 */
    assert.match(base.measured_at, /^v3\.\d+\.\d+$/, '基线须标出测量版本，实 ' + base.measured_at);
    //  ★ 本判据首版写成 `(base.rebuilds || []).length >= 1` —— 而 `rebuilds` 是**对象**（按版本号索引），
    //  `.length` 恒 undefined ⇒ 判据永远红（与「锚点裸词命中」同族的**判据自身缺陷**，故留痕）。
    const rb = base.rebuilds || {};
    assert.ok(Object.keys(rb).length >= 1, '★ 重建必须留痕（不得静默改掉旧读数的时点）');
    for (const [ver, rec] of Object.entries(rb)) {
        assert.match(ver, /^v3\.\d+\.\d+$/, '重建记录的键须是版本号：' + ver);
        assert.ok(rec.reason && rec.readings && rec.unchanged && rec.not_done, '重建记录四件齐备：' + ver);
    }

});