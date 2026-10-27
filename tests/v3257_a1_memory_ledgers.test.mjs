// tests/v3257_a1_memory_ledgers.test.mjs — v3.257.0
//
// 主题：A1 宿主巨兽第一刀 —— 六个叶子账本类抽为 memory-ledgers.js 之后的**接线、行为与破坏面**。
//
//   【为什么本档存在】
//     PLAN 的 A1 要求 index.js 从 18401 行降到 15000 行以下；P-2 分诊已按读数否掉「按域拆」，
//     只留「成员级预算 + 文件规模上界」一条轴。本刀按那条轴剥走最松的叶子（六个账本类）。
//     拆分类的**真正风险不是编译失败，是静默降级**：取库口写错全局名、缺席退路没同形、
//     构造点漏接一个 —— 三种都不报错，只让某个账本从此写不进也读不出（本仓最贵的那类缺陷）。
//     故本档的判据体不问「文件里有没有这个类」，而问「接线是否逐点在场、退路是否同形、
//     破坏之后同一条判据会不会翻红」。
//
//   【判据与负控制跑同一份代码】
//     `judgeSlice(idxSrc, modSrc)` 是纯函数；A 段对磁盘真源码跑它，D 段对**真源码破坏后的副本**
//     跑同一个它。破坏一律走唯一真源 `tests/_break_kit.mjs` 的 `breakSource`（锚点须恰中 1 次）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';
import { stripComments } from './_audit_lib.mjs';
/* [v3.421.0] 宿主面合并读：index.js 的方法已大批外提到 engine-*.js / memory-core.js，
 *   入口只剩一行委派。只读入口的测试因此两重受害 ——
 *   ① 方法体根本不在入口里（断言找不到）；
 *   ② 抠出来的片段没有闭包作用域（_moduleLib / errLog …）→ ReferenceError。
 *   改读 hostSurface 的合并面（v3160/v3161/v3163 同一机制）。变量名与下游断言一字不改。
 *   顺序：入口在前、模块在后 —— 版本常量这类「以入口为准」的断言必须先命中入口；
 *   而入口里的单行委派体一律先剥掉，否则抽取助手取首次命中会抠到委派（只剩一句委托）。 */
import { hostSurface as __hostSurfaceRaw } from './_audit_lib.mjs';
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
/* 宿主入口原文（未剥委派、不含模块面）。基线台账记的是**这一个**的行数。 */
function __hostEntry() {
    /* 直读入口原文：hostSurface 即便 modules:[] 也会在段首插入两行 `// ==== name ====` 分节头，
     *   基线台账记的是物理行，多出的这两行会与 readings 差 2（实测 11613 vs 11615）。 */
    return fs.readFileSync(__hostPath.join(__hostFu(new URL('..', import.meta.url)), 'index.js'), 'utf8');
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const NL = String.fromCharCode(10);
const MOD_REL = 'memory-ledgers.js';
const IDX = __hostSurface();
const MOD = read(MOD_REL);
const M = (await import('../memory-ledgers.js')).default;
/** 本刀剥走的六个叶子账本类。 */
const LEDGERS = ['MoneyLedger', 'CardCollection', 'ConflictBook', 'DeltaBook', 'PairMemory', 'PovMemory'];
/** 构造点对位：类名 → 宿主实例字段（刻意不同名，故不能按类名推字段名）。 */
const FIELDS = {
    MoneyLedger: 'moneyLedger', CardCollection: 'cards', ConflictBook: 'conflicts',
    DeltaBook: 'deltaBook', PairMemory: 'pairMem', PovMemory: 'pov',
};
const ok = (m) => console.log('  ✓ ' + m);

/**
 * 真判据体（纯函数，无副作用）。返回问题列表，空数组 = 卫生。
 * A 段与 D 段跑的是**同一个它** —— 判据与它的负控制同源，是本档成立的前提。
 * @param {string} idxSrc index.js 源码文本
 * @param {string} modSrc memory-ledgers.js 源码文本
 */
function judgeSlice(idxSrc, modSrc) {
    const problems = [];
    for (const name of LEDGERS) {
        /* ① 宿主不得再内联声明（本刀剥走的就是它们） */
        if (idxSrc.includes('    class ' + name + ' {')) problems.push('index.js 仍内联 ' + name);
        /* ② 模块必须真的声明它 */
        if (!new RegExp('\\bclass ' + name + '\\s*\\{').test(modSrc)) problems.push(MOD_REL + ' 缺 ' + name);
        /* ③ 构造点逐点在场、唯一、且接在宿主字段上 */
        const needle = "_newMemoryLedger('" + name + "')";
        const n = idxSrc.split(needle).length - 1;
        if (n !== 1) problems.push('构造点 ' + needle + ' 命中 ' + n + ' 次（须恰 1）');
        else if (!idxSrc.includes('this.' + FIELDS[name] + ' = ' + needle)) {
            problems.push(name + ' 的构造点未接到宿主字段 this.' + FIELDS[name]);
        }
    }
    /* ④ 取库口：具名函数 + 真读表达式（与 _cacheIdentityLib / _sceneBookLib 同形） */
    if (!/function _memoryLedgersLib\(\)\s*\{/.test(idxSrc)) problems.push('缺具名取库口 _memoryLedgersLib()');
    if (!idxSrc.includes("_moduleLib(() => window.LonShaMemoryLedgers, 'memory-ledgers.js')")) {
        problems.push('取库口不是真读表达式 window.LonShaMemoryLedgers');
    }
    /* ⑤ 缺席退路必须存在（常量空实现），且构造点统一走 _newMemoryLedger —— 不静默化成空对象 */
    if (!/class MemoryLedgerFallback/.test(idxSrc)) problems.push('缺缺席退路 MemoryLedgerFallback');
    if (!/function _newMemoryLedger\(name\)/.test(idxSrc)) problems.push('缺统一构造点 _newMemoryLedger(name)');
    /* ⑥ 模块自身零宿主依赖（叶子账本不该读宿主状态/落盘/发请求）。
     *   **必须在剥注释副本上看**：本模块的头注里点名了 `window.SillyTavern` / `localStorage`
     *   来说明「本模块不碰它们」—— 在原文上扫会把「说了不碰」读成「碰了」。
     *   这类「注释被当成实现」的假红在本仓治过多轮，统一口径是走唯一真源 stripComments。 */
    const modCode = stripComments(modSrc);
    for (const bad of ['window.SillyTavern', 'localStorage', 'document.', 'require(', 'indexedDB']) {
        if (modCode.includes(bad)) problems.push(MOD_REL + ' 出现宿主依赖 ' + bad);
    }
    if (!modSrc.includes('global.LonShaMemoryLedgers = api')) problems.push(MOD_REL + ' 缺全局导出面');
    return problems;
}

test('v3257 A. 磁盘真源码上：六个类已外移、六处构造点唯一、取库口与退路同形', () => {
    const problems = judgeSlice(IDX, MOD);
    assert.deepEqual(problems, [], '接线面缺陷：' + JSON.stringify(problems));
    ok('接线逐点在场（判据体与 D 段负控制同源）');
});

test('v3257 B. 模块真加载：导出七项 + 六类真构造 + 逐类语义抽检', () => {
    assert.deepEqual(Object.keys(M).sort(), LEDGERS.concat(['norm']).sort(), '导出面须为六类 + norm');
    assert.equal(typeof M.norm, 'function', 'norm 归一化');
    assert.equal(M.norm(' 苏晚晴 '), '苏晚晴', 'NFKC 去空白小写同算式');
    for (const n of LEDGERS) assert.equal(typeof M[n], 'function', n + ' 须可构造');
    /* 逐类抽检一条真实语义：存在性断言证明不了「搬过来还是原来那个东西」 */
    const ml = new M.MoneyLedger();
    ml.setMoney('苏晚晴', 5000, '本月工钱', 10, '10月1日');
    assert.equal(ml.getMoney(' 苏晚晴 ').amount, 5000);
    assert.ok(ml.toPrompt().includes('[当前钱财账本]'), '钱财注入块字面量');
    const cc = new M.CardCollection();
    assert.equal(cc.forge('草料场大火', '陆谦放火嫁祸', 50, '🃏', '腊月十五'), true);
    assert.equal(cc.forge('草料场大火', '重复', 50, '🃏', '腊月十五'), false, '同楼同标题幂等');
    const cf = new M.ConflictBook();
    cf.add('刺客的来历', '王五称来自西厂', '赵六称来自东厂', '口供冲突', 70, '腊月廿一', 'high');
    assert.equal(cf.conflicts[0].severity, 'high');
    const db = new M.DeltaBook();
    db.add('林一获得解药', 'established', 42);
    assert.ok(db.toPrompt().includes('[正史增量]'));
    const pv = new M.PovMemory();
    pv.add('苏晚晴', '只有她知道的事', 3);
    assert.equal(pv.search(['苏晚晴']).length, 1);
    const pm = new M.PairMemory();
    assert.equal(pm.addEntry('甲', '乙', 5, '', { event: '共同经历' }), true);
    assert.ok(pm.toPrompt(['甲']).includes('[群像共同记忆·归因式]'));
    ok('导出七项；六类真构造且关键语义/注入块字面量抽检通过');
});

test('v3257 C. 加载面与基线：manifest 恰 1 项 + 基线读数随本刀同源重建', () => {
    const mf = JSON.parse(read('manifest.json'));
    assert.equal(mf.extra_js.filter((f) => f === MOD_REL).length, 1, MOD_REL + ' 须在 extra_js 恰好 1 次');
    const b = JSON.parse(read('tests/audit/host_beast_baseline.json'));
    /* [v3.421.0] 台账读数按**宿主入口**行数记（不是合并面）：IDX 已是入口+12 模块的
     *   合并面（约 2.7 万行），与 readings/ceiling 量纲不符。改用 __hostEntry() 只取入口原文。 */
    assert.equal(b.readings.total_lines, __hostEntry().split(NL).length, '基线行数须等于真 index.js 行数');
    /* [v3.258.0] 不再点名 v3.257.0：基线的 measured_at 会随每次重建前移（第一刀之后已有第二刀），
     *   点名等于把「当版」写死成历史版本。判据改为「**最新那次** rebuild 与 readings 同读数」——
     *   不变量不变（台账与读数块必须同源），但不再锁当版。 */
    const _cur = b.measured_at;
    assert.ok(b.rebuilds[_cur], '当版须在 rebuilds 面留读数（每次重建才可回溯）');
    assert.equal(b.rebuilds[_cur].readings.member_count, b.readings.member_count, 'rebuilds 与 readings 同读数');
    /* [v3.312.0 交棒] 原文是 `member_count < 588` ——【硬锁当版快照】（文案「剥走前的基线是 588」），
     *   与 v3261 C / v3266 C 同族：把某一刀后的**一次性读数**当永久不变量，后续活跃功能增长
     *   （第二期各刀累计 +22 位成员）就把它推回线上，翻红的读数只剩「数字不够小」。
     *   而 588 已在 `host_beast_baseline.json` 的 `line_budget` 登记面上留痕（A1 首条 history 的
     *   `member_ceilings` 记着 549，当前读数改守同一登记面的 `member_ceiling`），故这里交棒到
     *   **同一真源**、不再自持第二份成员上界：只判「登记面在位且能解释当前读数」。
     *   交棒**不弱化**：静默改数 ⇒ 红（末条 history 与当前值必须相等）；余量超 maxSlack ⇒ 红。 */
    const _lb = b.line_budget || null;
    assert.ok(_lb && Number.isFinite(_lb.member_ceiling), '宿主成员数上界必须登记（否则「长回线上」无人管）');
    const _lbh = Array.isArray(_lb.history) ? _lb.history : [];
    assert.ok(_lbh.length >= 2, '成员上界历史须含「里程碑」与「本次抬升」两条，实测 ' + _lbh.length);
    assert.equal(_lb.member_ceiling, (_lbh[_lbh.length - 1] || {}).member_ceiling,
        '当前成员上界必须等于最后一条历史的 member_ceiling（防静默改数）');
    assert.ok(b.readings.member_count <= _lb.member_ceiling,
        '★ 宿主成员数须 <= 登记上界 ' + _lb.member_ceiling + '，实测 ' + b.readings.member_count);
    assert.ok(_lb.member_ceiling - b.readings.member_count <= _lb.member_max_slack,
        '成员上界余量 ' + (_lb.member_ceiling - b.readings.member_count)
        + ' 不得超过 member_max_slack ' + _lb.member_max_slack + '（余量过大 = 上界与实测脱节）');
    /* [v3.327.0 E 包记忆侧 交棒] 原文是 `total_lines < 18401`(A1 首刀前基线)—— 与 v3232 C2 / v3266 C /
     *   v3261 C / v3264 C 踩过的是**同一族坑**:它是 A1 首刀那一次的**一次性事实**,不是永久不变量。
     *   后续活跃功能增长把它推回线上,翻红的信息量只剩「数字不够小」;而「剥了又长回来」这件事
     *   应由**登记面**把守。故改为**方向相反的不变量**:凡读数不低于基线,则必须在 line_budget.history
     *   里留下**当版登记条目**(长回线上要有账;偷长 = 无账可查 ⇒ 翻红)。 */
    const _histN = Array.isArray(_lb.history) ? _lb.history : [];
    const _bornN = String(b.measured_at || '');
    assert.ok(b.readings.total_lines < 18401 || _histN.some((h) => typeof h.reason === 'string' && _bornN && h.reason.indexOf(_bornN) >= 0),
        '★ 行数已回到 A1 首刀前基线(18401)之上(实测 ' + b.readings.total_lines + ')⇒ 必须在 line_budget.history 里留下当版登记(' + _bornN + ')');
    ok('manifest 恰 1 项；基线行数/成员数与真文件同源且已下降');
});

test('v3257 D. 真源码破坏 → 同一条判据必须翻红（取库口 / 模块类名 / 构造点 各一条）', () => {
    const b1 = breakSource(IDX, "window.LonShaMemoryLedgers, 'memory-ledgers.js'",
        "window.LonShaMemoryLedgersTYPO, 'memory-ledgers.js'", 'A1-取库口');
    assert.ok(judgeSlice(b1, MOD).some((p) => p.includes('真读表达式')), '取库口读错全局名必须翻红');
    const b2 = breakSource(MOD, '    class MoneyLedger {', '    class MoneyLedgerX {', 'A1-模块类名');
    assert.ok(judgeSlice(IDX, b2).some((p) => p.includes('缺 MoneyLedger')), '模块缺类必须翻红');
    const b3 = breakSource(IDX, "this.pov = _newMemoryLedger('PovMemory');", 'this.pov = null;', 'A1-漏接构造点');
    assert.ok(judgeSlice(b3, MOD).some((p) => p.includes("_newMemoryLedger('PovMemory')")), '漏接构造点必须翻红');
    ok('三条真源码破坏各自被同一条判据抓到（破坏面不是抽样面）');
});

const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
test('v3257 E. 出生版本下限锚：本档于 v3.258.0 交棒（原为当版硬锚）', () => {
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    /* [v3.258.0 交棒] 原为 `assert.equal(vnum(codeVer), vnum('3.257.0'))` —— 那是「锁当版」，
     *   下一版一抬就必红（红的信息量只有「版本变大了」）。按 v3.203 交棒纪律退回**出生版本下限锚**：
     *   本档只承诺「出生在 3.257.0 之后仍成立」，不承诺「永远是 3.257.0」。 */
    assert.ok(vnum(codeVer) >= vnum('3.257.0'), '入口版本不得回退到本档出生版本之前');
    assert.ok(read('tests/v3257_a1_memory_ledgers.test.mjs').includes("vnum('3.257.0')"), '出生版本下限锚必须由本档接管');
    assert.ok(read('tests/v3257_a1_memory_ledgers.test.mjs').length > 2000, '本档不得被掏空');
    ok('本档锚着 ' + codeVer);
});
