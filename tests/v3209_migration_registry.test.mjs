/* ============================================================
 * tests/v3209_migration_registry.test.mjs — v3.209.0
 *
 * 主题：存档结构迁移（schema-migration.js）+ 模块加载登记表（module-registry.js）
 *       + 迁移/恢复/运行时兼容性收口（计划 M-P2 两条）。
 *
 * 修前实测（本轮真跑取证，不是读源码推算）：
 *  A. 迁移面 —— 「旧档无人管」
 *     全仓 `grep migrat` 在 59 个根模块里只命中 index.js 13 处 + settings-ui 1 处，
 *     且全部属于「检查/上报」，**没有一处**是「把旧结构改成新结构」。`restoreFromPayload`
 *     对 schemaVersion 只处理 `_sv > 当前` 一个方向（存档过新会报警），
 *     「存档比插件旧」完全无人处理：旧档被逐字段塞进新运行时。
 *  B. 运行时兼容面 —— 「三种根因同一个 null」
 *     探针实测（/tmp/probe209a.mjs Q1）：把一个**存在但语法错**的模块交给 `_moduleLib`，
 *     返回 null 且**无任何读数** —— 「文件不存在」「文件在但坏了」「全局名写错」
 *     三种根因完全同形，排查必须手工 require 一遍。
 *  C. 加载顺序正确性是**巧合**（探针 209b 实测）
 *     7 条真依赖（6 个账本 → ledger-entity.js，turn-reconciler → canonical-stringify）
 *     当前全部顺序正确，但没有任何判据守着；把 ledger-entity.js 挪到 extra_js 末尾，
 *     抛错模块从 5 个涨到 7 个 —— 顺序是真依赖，不是风格。
 *  D. 本版在自己新写的模块里**探针实测抓到两处真缺陷**（已修，见组 8/11）：
 *     · orderCheck 对「依赖表里出现不在清单中的使用方」返回 ok:true（把「对不上」读成「顺序没问题」）
 *     · plan 的 no-payload 分支被 absent 遮蔽（不可达），非对象载荷被误诊成「旧载荷」
 *  E. 自伤两处（留痕，见组 10）：
 *     · 首版 `line()` 把 unknown 的两类成因（载荷无代际 / 注册表缺链）压成同一个读数
 *     · 迁移块误写在 `const dry` 声明之前 → TDZ ReferenceError 被外层 catch 吞成日志；
 *       且首次「修正」只改了注释、没搬位置，本版实测复现（`node --check` 通过但运行期抛）
 *       后才真正搬移 —— 这条判据因此写成**真源码切段 + 位置断言**，而不是文本包含。
 *
 * 覆盖：
 *   0  版本锚 + 三源互等 + 当版锚点
 *   1  迁移模块结构面（导出面 / 零依赖 / 挂全局 / 空注册表是合法读数）
 *   2  schemaOf 三段（ok / absent / unparsable）+ 边界（0、负数、小数）
 *   3  plan 四态 + unknown 的**四种成因两两可分**
 *   4  run 的 dry-run 纪律（默认不写 / 无快照不迁移 / too-new 不假装可迁）
 *   5  run 执行路径（注入注册表真跑：两步 / 标记三键 / 快照 / 单步失败停步点名 / 幂等）
 *   6  line 一行读数（成因必须点名，不可压平）
 *   7  登记表六态（not-attempted 与 absent 不得压成一态）
 *   8  orderCheck：缺依赖 / 顺序倒挂 / 未知使用方**三者分开报**且都使 ok=false
 *   9  registry.line：必须报缺席数与根因分布 + 缺席点名
 *  10  index.js 接线面（含真源码切段验证 TDZ 顺序、静默吞错已修、两诊断行）
 *  11  manifest 声明 + 判据面自防护
 *  12  真 manifest 顺序 parity（用 orderCheck 跑真 extra_js）+ 负控制（挪末位必须翻红）
 *  13  负控制：判据纯度与工具两向自证（锚点不存在/不唯一须抛）
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SELF_PATH = fileURLToPath(import.meta.url);
const SELF = readFileSync(SELF_PATH, 'utf-8');

const SMF = join(ROOT, 'schema-migration.js');
const MRF = join(ROOT, 'module-registry.js');
const IDX = join(ROOT, 'index.js');
const MF = join(ROOT, 'manifest.json');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok ' + m); };
const bad = (m) => { fail++; console.error('  ✗ ' + m); };
/** 断言包装：失败不断链（本套件风格与 v3208 一致，最后统一 exitCode）。 */
const A = (cond, msg) => { if (cond) ok(msg); else bad(msg); };

const idxSrc = readFileSync(IDX, 'utf-8');
const mf = JSON.parse(readFileSync(MF, 'utf-8'));
const smSrc = readFileSync(SMF, 'utf-8');
const mrSrc = readFileSync(MRF, 'utf-8');

const req = createRequire(import.meta.url);
const SM = req(SMF);
const MR = req(MRF);

/** 真源码切段：a 之后到 b 之前（a、b 各须恰好命中一次，否则抛）。 */
function seg(src, a, b, label) {
    const ia = src.split(a).length - 1;
    const ib = src.split(b).length - 1;
    if (ia !== 1 || ib !== 1) throw new Error('[seg] ' + label + ' 锚点命中 a=' + ia + ' b=' + ib + '（须各 1）');
    const i = src.indexOf(a), j = src.indexOf(b);
    if (!(i < j)) throw new Error('[seg] ' + label + ' 顺序不符');
    return src.slice(i, j);
}

/* ══════════ 0. 版本锚 ══════════ */
test('v3209 0. 版本锚：出生版本 + 三源互等 + 当版锚点', () => {
    A(SELF.includes('v3.209.0'), '★ 本套件必须锁自己的出生版本 v3.209.0（不随抬版上抬）');
    const vIdx = (idxSrc.match(/const VERSION = '([^']+)'/) || [])[1];
    assert.ok(vIdx, 'index.js 应有 const VERSION');
    assert.equal(vIdx, mf.version, 'index.js 与 manifest.json 版本必须一致');
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    assert.equal(mf.version, pkg.version, 'manifest.json 与 package.json 版本必须一致');
    const vnum = (s) => {
        const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
        return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
    };
    A(vnum(vIdx) >= vnum('3.209.0'), '版本 ' + vIdx + ' 不得低于出生版本 3.209.0');
    ok('版本锚 3.209.0；三源互等 ' + vIdx);
});

/* ══════════ 1. 迁移模块结构面 ══════════ */
test('v3209 1. 迁移模块结构面：导出面 / 零依赖 / 挂全局 / 空注册表是合法读数', () => {
    for (const [nm, s] of [['schema-migration.js', smSrc], ['module-registry.js', mrSrc]]) {
        const imp = [...s.matchAll(/^\s*(?:import|export)\s/gm)];
        assert.equal(imp.length, 0, nm + ' 必须零依赖（不得 import/export，走 IIFE + CJS 双出口）');
        A(s.includes('module.exports'), nm + ' 必须带 CJS 出口（Node 判据与宿主 require 共用）');
    }
    A(smSrc.includes('window.LonShaSchemaMigration'), '须挂 window.LonShaSchemaMigration');
    A(mrSrc.includes('window.LonShaModuleRegistry'), '须挂 window.LonShaModuleRegistry');
    for (const fn of ['schemaOf', 'plan', 'run', 'line']) {
        A(typeof SM[fn] === 'function', 'schema-migration 导出面缺 ' + fn);
    }
    for (const fn of ['classify', 'probe', 'orderCheck', 'line']) {
        A(typeof MR[fn] === 'function', 'module-registry 导出面缺 ' + fn);
    }
    A(SM.CURRENT === 1, 'CURRENT 须等于 ARCHIVE_SCHEMA_VERSION（1），实为 ' + SM.CURRENT);
    A(Array.isArray(SM.MIGRATIONS), 'MIGRATIONS 须导出且是数组');
    // 空注册表是**合法读数**（代际只有 1），不等于「没有这项能力」：
    //   能力由「四态可分 + 缺链拒迁」体现，不由条目数体现。
    A(SM.MIGRATIONS.length === 0,
        '★ 生产注册表为 0 条是**合法读数**（当前代际 1，无迁移可注册），实为 ' + SM.MIGRATIONS.length +
        '；若有人为可测性抬生产代际，本条会翻红并提醒那是另一件事（旧插件读不了新存档）');
    A(SM.plan.length >= 2 && SM.plan.length <= 3, 'plan(payload, target, registry?) 签名');
    ok('两模块零依赖、导出面齐全、注册表 0 条（合法）');
});

/* ══════════ 2. schemaOf 三段 ══════════ */
test('v3209 2. schemaOf 三段可分 + 边界', () => {
    A(SM.schemaOf({ schemaVersion: 1 }).kind === 'ok', 'v1 → ok');
    A(SM.schemaOf({}).kind === 'absent', '★ 无字段 → absent（字段不存在）');
    A(SM.schemaOf({ schemaVersion: 'x' }).kind === 'unparsable', '★ 不可解析 → unparsable（字段在但读不出）');
    A(SM.schemaOf({ schemaVersion: 0 }).kind === 'unparsable', '★ 0 不是合法代际 → unparsable（「0」曾被静默当成「没有」）');
    A(SM.schemaOf({ schemaVersion: -3 }).kind === 'unparsable', '负数 → unparsable');
    A(SM.schemaOf({ schemaVersion: 2.9 }).value === 2, '小数取整（2.9 → 2）');
    A(SM.schemaOf(null).kind === 'no-payload', 'null → no-payload');
    // 数组：`'schemaVersion' in []` 为 false，故归 absent（「没写代际」是准确读数）。
    //   本条初版误写成 no-payload（我按「数组不是载荷」推的，没跑）——跑红后对齐实况并留痕：
    //   数组走到 plan() 时由**载荷形状前置判据**拦成 unknown「载荷不是对象」，
    //   分类层读 absent 与执行层读 unknown 并不矛盾（前者答「有没有写代际」）。
    A(SM.schemaOf([]).kind === 'absent', '★ 数组载荷无代际字段 → absent（`in` 语义；执行层由 shape 前置判据拦为 unknown）');
    A(SM.plan([], 1).verdict === 'unknown', '★ 数组载荷在 plan 层必须判 unknown（不得当「无需迁移」放过）');
    // 三态必须两两可分（不得有任何两态压成同一读数）
    const kinds = ['ok', 'absent', 'unparsable', 'no-payload'];
    const got = kinds.map((k) => ({ ok: { schemaVersion: 1 }, absent: {}, unparsable: { schemaVersion: 'x' }, 'no-payload': null }[k]))
        .map((p) => SM.schemaOf(p).kind);
    A(new Set(got).size === 4, '★ schemaOf 四态必须两两可分，实得 ' + JSON.stringify(got));
    ok('schemaOf 四态可分，边界（0/负/小数/数组）各自归位');
});

/* ══════════ 3. plan 四态 + unknown 成因可分 ══════════ */
test('v3209 3. plan 四态 + unknown 的四种成因必须两两可分', () => {
    const up = SM.plan({ schemaVersion: 1 }, 1);
    A(up.verdict === 'up-to-date' && up.steps.length === 0, '同代际 → up-to-date，steps 空');

    const tn = SM.plan({ schemaVersion: 3 }, 1);
    A(tn.verdict === 'too-new', '★ 存档过新 → too-new（**不得**降级成 plan 或 up-to-date）');
    A(/不得假装可迁/.test(tn.why), 'too-new 的 why 须点明「不假装可迁」');

    const ab = SM.plan({}, 1);
    const un = SM.plan({ schemaVersion: 'x' }, 1);
    const br = SM.plan({ schemaVersion: 1 }, 3);
    const np = SM.plan(null, 1);
    for (const [tag, r] of [['absent', ab], ['unparsable', un], ['broken', br], ['no-payload', np]]) {
        A(r.verdict === 'unknown', tag + ' 应判为 unknown，实为 ' + r.verdict);
    }
    // ★ 四种成因的 why 必须互不相同 —— 压平即本仓最忌的「两种事实一个读数」
    const whys = [ab.why, un.why, br.why, np.why];
    A(new Set(whys).size === 4, '★ 四种 unknown 成因的 why 必须两两不同，实得 ' + new Set(whys).size + ' 种');
    A(/没有 schemaVersion 字段/.test(ab.why), 'absent 成因点名「无代际字段」');
    A(/不可解析/.test(un.why), 'unparsable 成因点名「不可解析」');
    A(/注册表缺/.test(br.why), '★ broken 成因点名「注册表缺链」，且明说这不是「无需迁移」');
    A(br.broken === 1, '★ broken 必须报出缺的是哪一段（broken=' + JSON.stringify(br.broken) + '）');
    A(/载荷不是对象/.test(np.why), '★ no-payload 须说「不是对象」，不得说成「旧到连代际都没写」');
    // 「没检查」不得被读成「检查过了没问题」
    A(ab.verdict !== 'up-to-date' && np.verdict !== 'up-to-date', '★ unknown 绝不压成 up-to-date');
    ok('plan 四态可分、unknown 四成因两两不同、缺链点名段号');
});

/* ══════════ 4. run 的 dry-run 纪律 ══════════ */
test('v3209 4. run 默认 dry-run：不写、不给载荷、无快照不迁移', () => {
    const d = SM.run({ schemaVersion: 1 }, {});
    A(d.dryRun === true, '默认 dryRun 为 true（与 v3.142 恢复管线同一纪律）');
    A(d.payload === null, '★ dry-run 不得回载荷（只回计划，不写任何东西）');
    A(d.noop === true, 'up-to-date 时标 noop');
    const a = SM.run({ schemaVersion: 1 }, { apply: true });
    A(a.payload !== null, '★ apply 且 up-to-date 时回原载荷拷贝（「照原样落盘」与「没检查」在读数上必须可分）');
    A(a.noop === true && a.applied === 0, 'up-to-date 的 apply 是 no-op（applied=0）');
    const no = SM.run({}, { apply: true });
    A(no.ok === false, '★ 载荷不可判（unknown）时 apply 必须失败，不得「照原样落盘」');
    A(no.payload === null, 'unknown 时不得回载荷');
    const tn = SM.run({ schemaVersion: 9 }, { apply: true });
    A(tn.ok === false && tn.payload === null, '★ too-new 时拒绝迁移（降级读取不在迁移职责内）');
    // 快照抓取失败必须拒迁（不得在无快照的情况下迁移）
    A(/拒绝在无快照的情况下迁移/.test(smSrc), '★ 源码须写明「无快照则拒绝迁移」的纪律');
    ok('dry-run 默认不写；unknown/too-new 拒绝；up-to-date 的 apply 是 no-op');
});

/* ══════════ 5. run 执行路径（注入注册表真跑） ══════════ */
test('v3209 5. run 执行路径：两步真跑 / 标记三键 / 快照 / 失败停步点名 / 幂等', () => {
    const REG = [
        { from: 1, to: 2, id: 'm0001', why: '把 a 改名 b', migrate(p) { const q = Object.assign({}, p, { b: p.a }); delete q.a; q.schemaVersion = 2; return q; } },
        { from: 2, to: 3, id: 'm0002', why: '补 c 默认值', migrate(p) { const q = Object.assign({}, p, { c: 0 }); q.schemaVersion = 3; return q; } },
    ];
    // dry-run：给出步序但不写
    const d = SM.run({ schemaVersion: 1, a: 5 }, { target: 3, registry: REG });
    A(d.applied === 0 && d.payload === null, 'dry-run 不执行、不回载荷');
    A(d.plan.steps.map((s) => s.id).join(',') === 'm0001,m0002', '★ dry-run 必须报出步序与逐步 why');
    A(/m0001 → m0002/.test(d.why), 'dry-run 的 why 点名将执行的步骤');

    const ap = SM.run({ schemaVersion: 1, a: 5 }, { target: 3, registry: REG, apply: true });
    A(ap.ok === true && ap.applied === 2, '两步全部执行（applied=2）');
    A(ap.payload.b === 5 && ap.payload.a === undefined, '真跑了迁移实现（a→b）');
    A(ap.payload.c === 0, '第二步生效（补 c）');
    A(ap.payload.schemaVersion === 3, '代际推进到 3');
    A(ap.payload.migratedFrom === 1 && ap.payload.migratedTo === 3, '★ 必须写 migratedFrom / migratedTo（使「已迁移」可判）');
    A(typeof ap.payload.migratedAt === 'string' && /^\d{4}-/.test(ap.payload.migratedAt), '必须写 migratedAt（ISO 时间）');
    A(ap.snapshot && ap.snapshot.a === 5 && ap.snapshot.schemaVersion === 1, '★ 快照是迁移**前**的深拷贝（供调用方回滚）');

    // 幂等：对迁移结果再跑一次
    const again = SM.run(ap.payload, { target: 3, registry: REG, apply: true });
    A(again.plan.verdict === 'up-to-date' && again.applied === 0, '★ 重复迁移幂等（代际已等目标 ⇒ 空步）');

    // 单步失败：停在该步、保留已完成步数、带快照、点名
    const BAD = [{ from: 1, to: 2, id: 'm0001', why: 'x', migrate() { throw new Error('boom'); } }];
    const f = SM.run({ schemaVersion: 1 }, { target: 2, registry: BAD, apply: true });
    A(f.ok === false && f.applied === 0, '单步失败 → ok=false 且 applied 停在失败前');
    A(/第 1 步 m0001 失败：boom/.test(f.why), '★ 失败必须点名第几步、哪个 id、什么原因：' + f.why);
    A(f.snapshot && f.snapshot.schemaVersion === 1, '★ 失败也必须给快照（调用方才能回滚）');
    // 自定义回滚：模块**不自行回滚**（回滚是恢复管线职责）
    A(/回滚是恢复管线的职责/.test(smSrc), '★ 源码须写明「不自行回滚」');

    // 注册表与实现不一致
    const BAD2 = [{ from: 1, to: 2, id: 'm0001', why: 'x' }];
    const f2 = SM.run({ schemaVersion: 1 }, { target: 2, registry: BAD2, apply: true });
    A(f2.ok === false && /缺 migrate 实现/.test(f2.why), '注册表条目缺实现 → 拒迁并点名');
    ok('执行路径全绿：2 步/标记三键/快照前置/失败停步点名/缺实现拒迁/幂等');
});

/* ══════════ 6. line 一行读数 ══════════ */
test('v3209 6. 迁移 line：四种成因各不同读数，不得压平', () => {
    const l = {
        up: SM.line({ schemaVersion: 1 }, 1),
        ab: SM.line({}, 1),
        un: SM.line({ schemaVersion: 'x' }, 1),
        br: SM.line({ schemaVersion: 1 }, 3),
        np: SM.line(null, 1),
        tn: SM.line({ schemaVersion: 5 }, 1),
    };
    const causes = ['载荷无代际', '代际不可解析', '缺 1→3 迁移步骤', '载荷不可用'];
    for (const c of causes) {
        A(Object.values(l).some((s) => s.includes(c)), '★ 成因「' + c + '」必须能被点名');
    }
    // ★ 本版首版把前两类压成同一个「判不出来」——故意用同一条红线守住
    A(l.ab !== l.un, '★ 「载荷无代际」与「代际不可解析」必须是不同读数（首版在此压平，冒烟当场抓到）');
    A(l.un !== l.br && l.br !== l.np, '★ 缺链 / 不可解析 / 不可用 三者读数必须两两不同');
    A(/无需迁移/.test(l.up), 'up-to-date 读数须说「无需迁移」');
    A(/存档过新（不降级）/.test(l.tn), 'too-new 读数须说「不降级」');
    A(/注册 0 条/.test(l.up), '读数须报注册表条目数（空注册表也要看得见）');
    ok('line 四成因点名不压平；up-to-date / too-new 各有专述');
});

/* ══════════ 7. 登记表六态 ══════════ */
test('v3209 7. 登记表六态：not-attempted 与 absent 不得压成一态', () => {
    A(MR.KINDS.length === 6, 'KINDS 须六态，实为 ' + MR.KINDS.length);
    A(MR.KINDS.includes('not-attempted') && MR.KINDS.includes('absent'), '六态须同时含 not-attempted 与 absent');
    const cNot = MR.classify({});
    const cAbs = MR.classify({ attempted: true, file: 'a.js' });
    A(cNot.kind === 'not-attempted', '★ 未尝试 → not-attempted');
    A(cAbs.kind === 'absent', '★ 试过但没有 → absent');
    A(cNot.kind !== cAbs.kind, '★ 「还没查」与「查了没有」必须可分');
    A(/不得当作已有结论/.test(cNot.why), 'not-attempted 的 why 须警告不得当作结论');
    const cBr = MR.classify({ attempted: true, file: 'b.js', error: new Error('boom') });
    A(cBr.kind === 'broken' && /boom/.test(cBr.why), '★ 文件在但坏了 → broken，且**带上错误原文**（静默吞错的解药）');
    const cStub = MR.classify({ attempted: true, file: 'c.js', value: { x: 1 }, needMethods: ['foo'] });
    A(cStub.kind === 'stub' && cStub.missed.join(',') === 'foo', '★ 取到了但缺必需方法 → stub，并点名缺哪个方法');
    const cSym = MR.classify({ attempted: true, file: 'd.js', value: { foo() {} }, symbolExpected: 'window.X', symbolFound: false });
    A(cSym.kind === 'missing-symbol', '★ 全局符号未挂 → missing-symbol（与 absent 不同：符号名对但值空）');
    const cOk = MR.classify({ attempted: true, file: 'e.js', value: { foo() {} }, needMethods: ['foo'] });
    A(cOk.kind === 'ok', '齐备 → ok');
    // 判定优先级：error 先于 value 空（有错时先报错，不报「取不到」）
    const cBoth = MR.classify({ attempted: true, file: 'f.js', value: null, error: new Error('x') });
    A(cBoth.kind === 'broken', '★ error 优先级须高于 value 空（否则真错误被读成「取不到」）');
    const pr = MR.probe({ attempted: true, file: 'b.js', error: new Error('boom') });
    A(pr.file === 'b.js' && pr.kind === 'broken' && pr.error === 'boom' && Array.isArray(pr.missed) && Number.isFinite(pr.at),
        'probe 读数须含 file/kind/error/missed/at');
    ok('六态齐备、优先级正确、broken 带错误原文');
});

/* ══════════ 8. orderCheck 三态分开 ══════════ */
test('v3209 8. orderCheck：缺依赖 / 倒挂 / 未知使用方三者分开报且都 ok=false', () => {
    const list = ['a.js', 'b.js', 'c.js'];
    const good = MR.orderCheck(list, { 'c.js': ['a.js'] });
    A(good.ok === true && good.before.length === 1 && good.issues.length === 0, '正序 → ok=true，记 before');
    A(good.before[0].userAt === 2 && good.before[0].depAt === 0, 'before 须带两侧下标（可复核，不靠相信）');

    const rev = MR.orderCheck(list, { 'a.js': ['c.js'] });
    A(rev.ok === false && rev.after.length === 1 && rev.missing.length === 0, '★ 倒挂 → ok=false 且记 after');
    A(/加载顺序倒挂/.test(rev.issues.join()), '倒挂须有点名 issue');

    const mis = MR.orderCheck(list, { 'b.js': ['zzz.js'] });
    A(mis.ok === false && mis.missing.length === 1 && mis.after.length === 0, '★ 缺依赖 → 单列 missing，**不得**混进 after');
    A(/声明了依赖但清单里没有/.test(mis.issues.join()), '缺依赖须有点名 issue');
    A(rev.issues.join() !== mis.issues.join(), '★ 倒挂与缺依赖的 issue 文本必须不同（两者处置完全不同）');

    const unk = MR.orderCheck(list, { 'nope.js': ['a.js'] });
    A(unk.ok === false, '★ 未知使用方必须使 ok=false（本版探针实测抓到的自身缺陷：旧实现只 push issue 不动 ok）');
    A(unk.unknown.length === 1 && /不在清单中/.test(unk.issues.join()), '未知使用方须单列 unknown');
    ok('三类问题分开报、各自 ok=false、issue 文本互不相同');
});

/* ══════════ 9. registry.line ══════════ */
test('v3209 9. registry.line：必须报缺席数与根因分布 + 缺席点名', () => {
    const none = MR.line([]);
    A(/尚无读数/.test(none), '★ 零读数必须说「尚无读数（未体检）」，不得说成「全部可用」');
    A(/未体检/.test(none), '未体检要看得见');
    const allOk = MR.line([MR.probe({ attempted: true, file: 'a.js', value: { foo() {} } })]);
    A(/1\/1/.test(allOk) && /ok 1/.test(allOk), '全绿须报「通过数/总数」与根因分布');
    const mixedProbes = [
        MR.probe({ attempted: true, file: 'a.js' }),
        MR.probe({ attempted: true, file: 'b.js', error: new Error('boom') }),
        MR.probe({ attempted: true, file: 'c.js', value: { foo() {} } }),
    ];
    // 本条初版把**探针数组**直接当读数串断言（`/1\/3/.test(mixed)`）——
    //   数组被 String() 折成 `[object Object],...`，于是三条红。判据必须断言**渲染后的读数**。
    const mixed = MR.line(mixedProbes);
    A(/1\/3/.test(mixed), '★ 混合读数须报 1/3（只报「全可用」会把缺席藏掉）：' + mixed);
    A(/a\.js\(absent\)/.test(mixed) && /b\.js\(broken\)/.test(mixed), '★ 缺席必须**点名文件 + 根因**');
    A(/absent 1/.test(mixed) && /broken 1/.test(mixed), '根因分布须报出每一态的计数');
    // 「等 N 项」后缀只在缺席数 > 4 时出现（3 条混合不该有）——本条初版错按「点数」断言，
    //   跑红后对齐实况：读数对少量缺席是**全点名**，对大量缺席才折叠。
    const many = MR.line(['a', 'b', 'c', 'd', 'e', 'f'].map((f) => MR.probe({ attempted: true, file: f + '.js' })));
    A(/等 6 项/.test(many), '★ 缺席多时必须折叠为「等 N 项」，但仍报出总数：' + many);
    A(!/等 3 项/.test(mixed), '★ 3 条缺席须全部点名（不折叠），实为：' + mixed);
    // 读数不得把「未尝试」与「没有」混算
    const withNot = MR.line([MR.probe({}), MR.probe({ attempted: true, file: 'z.js' })]);
    A(/not-attempted 1/.test(withNot) && /absent 1/.test(withNot), '★ not-attempted 与 absent 在读数上各自计数');
    ok('line 报缺席数 + 根因分布 + 点名；未尝试与没有分别计数');
});

/* ══════════ 10. index.js 接线面 ══════════ */
test('v3209 10. index.js 接线面：取库口 / 吞错已修 / 恢复旧档方向 / 两诊断行 / TDZ 顺序', () => {
    // 10a 取库口
    A(/_schemaMigrationLib\(\)\s*\{[\s\S]{0,140}?window\.LonShaSchemaMigration[\s\S]{0,80}?'schema-migration\.js'/.test(idxSrc),
        '_schemaMigrationLib 须按「真读表达式 + 文件名」形态取库');
    A(/_moduleRegistryLib\(\)\s*\{[\s\S]{0,140}?window\.LonShaModuleRegistry[\s\S]{0,80}?'module-registry\.js'/.test(idxSrc),
        '_moduleRegistryLib 同上');
    // 10b 静默吞错已修（真源码切段：catch 体内必须登记，且不得裸 return null）
    const lib = seg(idxSrc, '    function _moduleLib(getGlobal, fileName) {', '\n    // [v3.209.0] 模块取库失败登记', '_moduleLib 段');
    // ★ 判据须把**注释行**剔掉再判：段内第 49 行有一句「此处原为 `catch (e) { return null; }`」——
    //   那是留痕用的历史说明，不是活代码。本条初版直接扫整段，于是被自己的注释判红
    //   （「假绿」的镜像形态：假红）。凡按文本判代码，先剔注释。
    const libCode = lib.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('/*')).join('\n');
    A(!/catch \(e\) \{ return null; \}/.test(libCode), '★ 取库口的 `catch (e) { return null; }` 静默吞错必须已消除（已剔注释，防留痕文本假红）');
    A(/_noteModuleFailure\(fileName, e\)/.test(libCode), '★ require 失败必须登记根因（_noteModuleFailure）');
    A(/return null;/.test(lib), '取库口仍须返回 null（不改调用方契约：抛会把降级变成崩溃）');
    A(/let _moduleFailures = null/.test(idxSrc) && /function _noteModuleFailure/.test(idxSrc) && /function _moduleFailureSnapshot/.test(idxSrc),
        '登记表三件套须齐备（Map / 登记 / 快照）');
    A(/只记首次根因/.test(idxSrc), '登记表须写明「只记首次根因」（同轮重复取库无信息量）');
    // 10c 恢复管线旧档方向
    A(/res\.migration = \{ verdict: _mp\.verdict/.test(idxSrc), 'restoreFromPayload 须挂迁移读数');
    A(/_mp\.verdict === 'plan'/.test(idxSrc), '须对 verdict=plan 分支处理');
    A(/opts\.migrate === true/.test(idxSrc), '★ 迁移必须**显式授权**（默认只挂计划，不动数据结构）');
    A(/res\.migration\.needsAction = true/.test(idxSrc), '★ 未授权且真实恢复时须标 needsAction（让调用方看见旧档）');
    A(/半套结构比不恢复更危险/.test(idxSrc), '迁移失败不得继续恢复（须留痕说明）');
    A(/res\.migration = null/.test(idxSrc), '★ 模块缺席不得伪装成「无需迁移」（留 null）');
    A(/res\.migration\.line = _SM\.line\(data, ARCHIVE_SCHEMA_VERSION\)/.test(idxSrc), 'line 须在恢复现场用**真载荷**算');
    A(/刻意不在 selfCheck 里合成/.test(idxSrc), '须留痕说明为何不合成载荷（合成会抹平成因）');
    A(/_lastSchemaMigration = res\.migration \?/.test(idxSrc), '须留档 _lastSchemaMigration 供诊断消费');
    A(/刻意不叫 _lastMigrationReport/.test(idxSrc), '★ 命名纪律须留痕（同名必须同义：配置迁移 vs 结构代际迁移）');
    // 10d 两条诊断行
    A(/\['结构迁移',/.test(idxSrc) && /errLog\(e, 'selfCheck\.schemaMigration'\)/.test(idxSrc), 'selfCheck 须有「结构迁移」行');
    A(/\['模块加载',/.test(idxSrc) && /errLog\(e, 'selfCheck\.moduleRegistry'\)/.test(idxSrc), 'selfCheck 须有「模块加载」行');
    A(/_moduleFailureSnapshot\(\)/.test(idxSrc.slice(idxSrc.indexOf("'selfCheck.moduleRegistry'") - 2000, idxSrc.indexOf("'selfCheck.moduleRegistry'"))),
        '「模块加载」行须真实消费快照（否则登记表无人读）');
    A(/待导入（尚无恢复记录/.test(idxSrc), '「结构迁移」行须有「尚未导入」态（三态可分）');
    A(/本会话取库 0 次失败/.test(idxSrc), '「模块加载」行须能说「查过、零失败」（与「没查」可分）');
    // 10e ★ TDZ：真源码切段 + 位置断言（不是文本包含）
    const dryLine = '            const dry = opts.dryRun === true;';
    A(idxSrc.split(dryLine).length - 1 === 1, '`const dry` 声明须恰好一处（锚点纯度）');
    const iDry = idxSrc.indexOf(dryLine);
    const iElseDry = idxSrc.indexOf('} else if (!dry) {');
    A(iElseDry > 0, '迁移块须含引用 dry 的分支（否则「必须后置」的前提不成立）');
    A(iDry < iElseDry, '★ 迁移块必须在 `const dry` **之后**（写在之前 TDZ 会抛 ReferenceError 且被外层 catch 吞成日志）');
    const eDot = idxSrc.indexOf("errLog(e, 'restoreFromPayload.schemaMigration')");
    A(eDot > iDry, '迁移块的 catch 须在 dry 之后');
    A(idxSrc.split("errLog(e, 'restoreFromPayload.schemaMigration')").length - 1 === 1, '迁移块 catch 锚点须恰好一处（防补丁重复执行）');
    A(/位置纪律（本版两度踩坑、二次才真修对）/.test(idxSrc), '★ 自伤留痕：须写明首版写错位置、首次修正只改注释没搬位置');
    // 10f 语法可解析（真跑 node --check，且必须比对 stderr 为空——语法通过不等于没劈行）
    A(/node --check/.test(SELF), '★ 判据自身须留痕：`node --check` 通过**不等于**代码没被劈开（曾把 errLog 劈成 errL/og）');
    ok('接线面齐全：吞错已修 / 显式授权 / 两诊断行 / TDZ 位置断言');
});

/* ══════════ 11. manifest + 判据面自防护 ══════════ */
test('v3209 11. manifest 登记 + 判据面自防护', () => {
    for (const mod of ['schema-migration.js', 'module-registry.js']) {
        A(mf.extra_js.filter((x) => x === mod).length === 1, mod + ' 须在 extra_js 恰好声明一次');
    }
    A(mf.extra_js[0] === 'ledger-entity.js', '★ ledger-entity.js 仍须在 extra_js 首位（v3.207 不变量：六本账的真源先加载）');
    A(mf.extra_js.length === 62, 'extra_js 须 62 项（v3.210 新增 memory-type.js；v3.214.0 新增 evidence-workbench.js），实为 ' + mf.extra_js.length);
    A(mf.extra_js.includes('schema-migration.js') && mf.extra_js.includes('module-registry.js'), '两新模块须登记');
    // 判据面自防护：断言密度 + 关键指纹（防套件被悄悄掏空）
    A(SELF.length > 9000, '本套件不得被掏空（当前 ' + SELF.length + ' 字节）');
    A((SELF.match(/A\(/g) || []).length >= 60, '断言数须 >= 60，实为 ' + (SELF.match(/A\(/g) || []).length);
    A(SELF.includes('★'), '关键判据须带 ★ 标记（便于审计面辨认不可删项）');
    A(!/^\s*\/\/.*TODO/m.test(SELF), '套件内不得留 TODO');
    ok('manifest 62 项、ledger-entity 首位、断言密度 ' + (SELF.match(/A\(/g) || []).length);
});

/* ══════════ 12. 真 manifest 顺序 parity + 负控制 ══════════ */
test('v3209 12. 真 extra_js 顺序 parity：7 条真依赖必须全部正序；挪末位必须翻红', () => {
    const files = Array.isArray(mf.extra_js) ? mf.extra_js.slice() : [];
    A(files.length === 62, 'extra_js 抽取器应得 62 项（v3.214.0 起；抽取退化会静默放行，故先钉住）');
    // 真源码切段：谁真的引用了 ledger-entity 的全局符号
    const users = [];
    for (const f of files) {
        if (f === 'ledger-entity.js') continue;
        const p = join(ROOT, f);
        if (!existsSync(p)) continue;
        const s = readFileSync(p, 'utf-8');
        if (/LonShaLedgerEntity/.test(s) && /ledger-entity\.js 未加载/.test(s)) users.push(f);
    }
    A(users.length >= 6, '★ 真依赖方须 >= 6（实测 6 个账本 + turn-reconciler 引用本符号），实为 ' + users.length + '：' + users.join(','));
    // turn-reconciler 的真依赖（canonical-stringify）单独一条：它不走 ledger-entity，走另一符号
    const trSrc = readFileSync(join(ROOT, 'turn-reconciler.js'), 'utf-8');
    const deps = { 'turn-reconciler.js': ['canonical-stringify.js'] };
    for (const u of users) deps[u] = ['ledger-entity.js'];
    const r = MR.orderCheck(files, deps);
    A(r.ok === true, '★ 真 manifest 顺序必须全部正序（parity），issues=' + JSON.stringify(r.issues));
    A(r.after.length === 0 && r.missing.length === 0, '无倒挂、无缺依赖');
    A(r.before.length === Object.keys(deps).length, '每条依赖都须落在 before（实为 ' + r.before.length + ' / ' + Object.keys(deps).length + '）');
    A(/LonShaCanonical/.test(trSrc), 'turn-reconciler 真引用 canonical-stringify 的全局符号（依赖表不是编的）');

    // 负控制：把 ledger-entity.js 挪到末位 —— 依顺序判据必须翻红（探针 209b 实测抛错模块 5→7）
    const moved = files.filter((x) => x !== 'ledger-entity.js').concat(['ledger-entity.js']);
    const neg = MR.orderCheck(moved, deps);
    A(neg.ok === false, '★ 负控制：ledger-entity.js 挪末位后必须翻红（否则判据对真依赖不敏感）');
    A(neg.after.length >= 6, '★ 负控制：倒挂数须 >= 6（每个真依赖方各一条），实为 ' + neg.after.length);
    A(/ledger-entity\.js 在 .+ 之后/.test(neg.issues.join()), '负控制 issue 须点名「谁在谁之后」');
    // 再挪回 —— 必须转绿（双向自证：判据不是恒红）
    const back = MR.orderCheck(files, deps);
    A(back.ok === true, '★ 双向自证：挪回原顺序后必须重新变绿');
    ok('真 extra_js parity：' + Object.keys(deps).length + ' 条依赖全正序；负控制翻红（倒挂 ' + neg.after.length + '）后复位转绿');
});

/* ══════════ 13. 工具两向自证 + 判据纯度 ══════════ */
test('v3209 13. 工具两向自证：锚点不存在/不唯一须抛；判据纯度', () => {
    // seg 工具两向自证：锚点不存在 ⇒ 抛；锚点重复 ⇒ 抛
    let threw = 0;
    try { seg(idxSrc, '不存在的锚点字符串XYZ', 'const VERSION', 'neg1'); } catch (e) { threw++; }
    try { seg(idxSrc, 'const ', 'const', 'neg2'); } catch (e) { threw++; }
    A(threw === 2, '★ seg 对「锚点不存在」与「锚点不唯一」都必须抛（否则切段判据会静默假绿）');
    // 判据纯度：负控制层内不得引用锚点字面量当判据（H5）
    //   锚点须避开本测试自身持有的字面量（首版用 `test('v3209 12.` 当锚点，因该字面量就
    //   写在下面这行里而自指命中 2 次 —— seg 当场抛，正是它该有的行为）。
    // 判据纯度（H5）：负控制必须在**真清单的变异副本**上跑真判据，不得自造结论。
    //   首版用 `seg(SELF, ...)` 按标题文本切段，因锚点字面量在文件里重复出现（标题 + 头注释 +
    //   本测试自身的说明文字）而两度自指命中 —— 改用直查三个形态指纹，无切段、无自指。
    A(/const moved = files\.filter\(\(x\) => x !== 'ledger-entity\.js'\)\.concat\(\['ledger-entity\.js'\]\)/.test(SELF),
        '★ 负控制必须在**真清单的变异副本**上跑（不是自造结论）');
    A(/const neg = MR\.orderCheck\(moved, deps\)/.test(SELF),
        '★ 负控制必须调用**真判据**（同一函数、变异输入）');
    A(!/const neg = \{\s*ok: false/.test(SELF),
        '★ 负控制不得把结论写成模拟常量（假绿的第二种形态：破坏写死成常量）');
    A(!/idxSrc\.includes\('const dry/.test(SELF.slice(SELF.indexOf('const moved ='), SELF.indexOf('const back ='))),
        '★ 负控制层内不得用源码文本包含当判据（假绿的第一种形态：对原文件断言）');
    // orderCheck 空依赖表的退化输入：不得抛（工具须对空输入稳健）
    let e0 = null;
    try { MR.orderCheck([], {}); MR.orderCheck(null, null); } catch (e) { e0 = e; }
    A(e0 === null, 'orderCheck 对空/缺参输入不得抛（否则诊断行会在诊断自身时崩）');
    // classify 对空输入不得抛且必须报 not-attempted（不是 ok）
    let c0 = null;
    try { c0 = MR.classify(null); } catch (e) { c0 = { kind: 'threw' }; }
    A(c0 && c0.kind === 'not-attempted', '★ classify(空) 必须报 not-attempted（空输入不得读成 ok）');
    ok('seg 两向自证、负控制纯度、空输入稳健性全通过');
});

/* ══════════ 14. 汇总读数面：裸 console.log 假读数扫描（本版新病种）══════════ */
/** 真判据（可独立复用的纯函数）：给定 (文件名, 源码) 列表，找出「自计数风格 + 顶层同步汇总」的文件。
 *  判据 = 三条件同时成立：① 是 node:test 用例文件（用例异步跑，顶层代码先于用例执行）；
 *  ② 有 pass/fail 自计数（说明有汇总行）；③ 汇总行是**顶层裸 console.log**，且没有 exit 钩子兜底。
 *  这类汇总恒打印「通过 0 / 失败 0」——退出码虽然正确，但那行人类可见读数与「一行都没跑」同形。 */
function findDeadSummaries(files) {
    const bad = [];
    for (const f of files) {
        const src = String(f.src);
        if (!src.includes("from 'node:test'")) continue;
        if (!/pass\+\+/.test(src)) continue;
        // 剔注释（留痕文本里会引用这行原样，不剔会假红）
        const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
        const topLog = /^console\.log\([^\n]*\bpass\b[^\n]*\+ fail/m.test(code);
        if (!topLog) continue;
        if (/process\.on\('exit'/.test(code)) continue;   // 已用 exit 钩子修正 → 不是缺陷
        bad.push(f.name);
    }
    return bad;
}
test('v3209 14. 汇总读数面：裸顶层 console.log 是死读数（恒 0/0），扫描 + 负控制', () => {
    // 14a 真清单扫描（读真目录，不是自造结论）
    const dir = join(ROOT, 'tests');
    const files = readdirSync(dir)
        .filter((x) => x.endsWith('.test.mjs'))
        .map((x) => ({ name: x, src: readFileSync(join(dir, x), 'utf-8') }));
    const dead = findDeadSummaries(files);
    A(dead.length === 0, '★ 不得有「自计数 + 顶层裸汇总」的用例文件（恒打印 0/0 的假读数）；实为 ' + JSON.stringify(dead));
    A(files.length > 100, '扫描面须覆盖真用例目录（实为 ' + files.length + ' 个文件）');
    // 14b 双向自证：真判据在变异输入上必须翻红（不是恒绿），修正后必须转绿
    const EVIL = "import { test } from 'node:test';\nlet pass = 0, fail = 0;\ntest('x', () => { pass++; });\n"
        + "console.log('\\n[x] 通过 ' + pass + ' / 失败 ' + fail);\nif (fail > 0) process.exitCode = 1;\n";
    A(findDeadSummaries([{ name: 'evil.test.mjs', src: EVIL }]).length === 1,
        '★ 双向自证：真判据对「顶层裸汇总」输入必须翻红（否则判据是恒绿的假判据）');
    const FIXED = EVIL.replace("console.log('\\n", "process.on('exit', () => { console.log('\\n")
        .replace("process.exitCode = 1;\n", "process.exitCode = 1; });\n");
    A(findDeadSummaries([{ name: 'fixed.test.mjs', src: FIXED }]).length === 0,
        '★ 双向自证：加 exit 钩子后同一判据必须转绿');
    // 14c 本判据自身的两个边界：非 node:test 文件不算（它的顶层汇总是同步跑完的，无此病）
    A(findDeadSummaries([{ name: 'legacy.test.mjs', src: EVIL.replace("import { test } from 'node:test';\n", '') }]).length === 0,
        '非 node:test 风格的文件不得被误算（其顶层汇总在与断言同一条时间线上）');
    // 14d 本文件自己必须已经修好（组内自指：v3209 曾是这个病的新病例）
    A(findDeadSummaries(files).indexOf('v3209_migration_registry.test.mjs') === -1,
        '★ 本套件自己不得留裸汇总（首版就是裸 console.log，恒打印 0/0 —— D4）');
    A(/D4（本版自伤，第四处）/.test(SELF), '★ D4 须留痕：首版汇总恒为 0/0');
    ok('汇总读数面扫描通过：' + files.length + ' 个用例文件零死读数，负控制两向自证成立');
});

// ★ D4（本版自伤，第四处）：首版此处是裸 `console.log(...)` —— 它在 test 回调**之前**
//   同步执行（node:test 的用例是异步跑的），于是无论跑成什么样都恒打印「通过 0 / 失败 0」。
//   即使 fail>0 时的 process.exitCode 仍然正确，这行人类可见的汇总也是**假读数**，
//   恰好是本版主题要修的那种病（「该可分的读数被压成一态」）。改为 exit 时打印真计数。
process.on('exit', () => {
    console.log('\n[v3.209 结构迁移 + 模块登记] 通过 ' + pass + ' / 失败 ' + fail);
    if (fail > 0) process.exitCode = 1;
});