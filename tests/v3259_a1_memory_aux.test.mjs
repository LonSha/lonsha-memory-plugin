// tests/v3259_a1_memory_aux.test.mjs — v3.258.0
//
// 主题：A1 宿主巨兽第二刀 —— 六个工具类（HolidayAware / Mutex / OpLog / FloorLedger /
//   SnapshotManager / EmergencyBackup）抽为 memory-aux.js 之后的**接线、行为与破坏面**。
//
//   【为什么本档存在】
//     A1 第一刀（v3.257.0）剥的是叶子**账本**类；第二刀按同一条读数轴（成员级预算 + 文件规模上界）
//     剥**零/低依赖的工具类**。两刀的风险同形，而且这一刀多一种：
//       · 取库口写错全局名 ⇒ 六个类一起静默退到常量空实现；
//       · 缺席退路没同形 ⇒ 调用方读到 undefined 塌成第三态；
//       · 构造点漏接一个 ⇒ 某个类从此写不进也读不出（本仓最贵的那类缺陷）；
//       · ★ **诊断函数被静默吞掉**：EmergencyBackup 的一处非致命错误记账原先直接引主人函数，
//         抽取后若不在构造期显式注入 errLog，那条诊断会变成「没有也不报」——
//         本仓在取库口上治过同形的病（v3.209.0 取库失败静默吞错）。
//     故本档不问「文件里有没有这个类」，而问「接线是否逐点在场、退路是否同形、破坏之后
//     同一条判据会不会翻红」。
//
//   【判据与负控制跑同一份代码】
//     judgeSlice(idxSrc, auxSrc) 是纯函数；A 段对磁盘真源码跑它，D 段对**真源码破坏后的副本**
//     跑同一个它。破坏一律走唯一真源 tests/_break_kit.mjs 的 breakSource（锚点须恰中 1 次）。
//
//   【本档与历史套件的关系】
//     六个类各自的历史套件（v3145 / v3150 / v3155 / v3169 / v340 / v355 / v3157）此前**从 index.js
//     抽类做真执行**；本刀把那些抽取面改到 memory-aux.js 上（语义一字不改、只换被读的文件），
//     而「宿主不得再内联声明」这件事集中在本档 A 段判——一份口径一处实现。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';
import { stripComments } from './_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const NL = String.fromCharCode(10);
const Q = String.fromCharCode(39);
const MOD_REL = 'memory-aux.js';
const IDX = read('index.js');
const MOD = read(MOD_REL);
const M = (await import('../memory-aux.js')).default;
/** 本刀剥走的六个工具类。 */
const AUX = ['HolidayAware', 'Mutex', 'OpLog', 'FloorLedger', 'SnapshotManager', 'EmergencyBackup'];
/** 构造点对位：类名 → 宿主实例字段（刻意不同名，故不能按类名推字段名）。 */
const FIELDS = {
    HolidayAware: 'holiday', Mutex: 'mutex', OpLog: 'opLog',
    FloorLedger: 'ledger', SnapshotManager: 'snapshots', EmergencyBackup: 'emergency',
};
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
/* 方法名切分按**成员签名缩进**（类体 4 + 成员 8）——与 host_beast_probe.cjs 同一口径。
 *   用宽松的「花括号后跟名字(」会把 `new Promise((resolve) => …)` 里的 resolve 之类误收进来（首跑实测）。 */
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
 * @param {string} idxSrc index.js 源码文本
 * @param {string} auxSrc memory-aux.js 源码文本
 */
function judgeSlice(idxSrc, auxSrc) {
    const problems = [];
    for (const name of AUX) {
        /* ① 宿主不得再内联声明（本刀剥走的就是它们） */
        if (idxSrc.includes('    class ' + name + ' {')) problems.push('index.js 仍内联 ' + name);
        /* ② 模块必须真的声明它 */
        if (!new RegExp('class ' + name + '\\s*\\{').test(auxSrc)) problems.push(MOD_REL + ' 缺 ' + name);
        /* ③ 构造点逐点在场、唯一、且接在宿主字段上 */
        const needle = '_newMemoryAux(' + Q + name + Q;
        const n = idxSrc.split(needle).length - 1;
        if (n !== 1) problems.push('构造点 ' + needle + ' 命中 ' + n + ' 次（须恰 1）');
        else if (!idxSrc.includes('this.' + FIELDS[name] + ' = ' + needle)) {
            problems.push(name + ' 的构造点未接到宿主字段 this.' + FIELDS[name]);
        }
    }
    /* ④ 取库口：具名函数 + 真读表达式 */
    if (!/function _memoryAuxLib\(\)\s*\{/.test(idxSrc)) problems.push('缺具名取库口 _memoryAuxLib()');
    if (!idxSrc.includes("_moduleLib(() => window.LonShaMemoryAux, 'memory-aux.js')")) {
        problems.push('取库口不是真读表达式 window.LonShaMemoryAux');
    }
    /* ⑤ 缺席退路必须存在（常量空实现），且构造点统一走 _newMemoryAux */
    if (!/class MemoryAuxFallback/.test(idxSrc)) problems.push('缺缺席退路 MemoryAuxFallback');
    if (!/function _newMemoryAux\(name, opts\)/.test(idxSrc)) problems.push('缺统一构造点 _newMemoryAux(name, opts)');
    /* ⑥ 退路与真实现按方法名对账（本刀特有：方法名多，靠肉眼看不住） */
    problems.push(...fallbackParity(idxSrc, auxSrc));
    /* ⑦ 模块自身零宿主依赖。必须在**剥注释副本**上看：头注里点名这些词是为了说明「不碰它们」。 */
    const modCode = stripComments(auxSrc);
    for (const bad of ['window.SillyTavern', 'require(', 'window.LonSha']) {
        if (modCode.includes(bad)) problems.push(MOD_REL + ' 出现宿主依赖 ' + bad);
    }
    if (!auxSrc.includes('global.LonShaMemoryAux = api')) problems.push(MOD_REL + ' 缺全局导出面');
    return problems;
}

/** 退路与真实现的方法面必须对得上（真实现有的，退路必须有同名空实现）。 */
function fallbackParity(idxSrc, auxSrc) {
    const problems = [];
    const at = idxSrc.indexOf('class MemoryAuxFallback');
    if (at < 0) return ['退路类体切不出来（判据自身失效）'];
    const fbNames = new Set(methodNames(idxSrc.slice(at, classEnd(idxSrc, at))));
    for (const name of AUX) {
        const real = methodsOf(auxSrc, name);
        if (!real) { problems.push('模块缺类 ' + name); continue; }
        for (const mn of real) {
            if (!fbNames.has(mn)) problems.push('退路缺方法 ' + name + '.' + mn);
        }
    }
    return problems;
}

test('v3259 A. 磁盘真源码上：六个类已外移、六处构造点唯一、取库口与退路同形', () => {
    const problems = judgeSlice(IDX, MOD);
    assert.deepEqual(problems, [], '接线面缺陷：' + JSON.stringify(problems));
    ok('接线逐点在场（判据体与 D 段负控制同源）');
});

test('v3259 B. 模块真加载：导出六项 + 六类真构造 + 逐类语义抽检', async () => {
    assert.deepEqual(Object.keys(M).sort(), AUX.slice().sort(), '导出面须为六个类');
    for (const n of AUX) assert.equal(typeof M[n], 'function', n + ' 须可构造');
    /* 逐类抽检一条真实语义：存在性断言证明不了「搬过来还是原来那个东西」 */
    const h = new M.HolidayAware();
    assert.equal(h.current('2024年12月24日').name, '圣诞节', '节日窗口内命中');
    assert.ok(h.keywords('圣诞节').includes('平安夜'), '节日关键词面');
    const mu = new M.Mutex();
    const cred = await mu.acquire('t');
    assert.ok(cred && typeof cred.id === 'number', 'Mutex.acquire 返回签发凭证');
    assert.equal(mu.release(cred), true, '持有者释放生效');
    const op = new M.OpLog();
    op.log('summary', 'add', 'ref-1', 3, 'x');
    assert.equal(op.queryByType('summary').length, 1, 'OpLog 检索面');
    const fl = new M.FloorLedger({ maxFloors: 200 });
    assert.equal(fl.MAX_FLOORS, 200, 'FloorLedger 上限可配');
    fl.beginFloor(1, {});
    fl.record(1, { recallIds: ['a'], recallHits: 2 });
    assert.equal(fl.get(1).recallHits, 2, 'FloorLedger 召回记账');
    assert.equal(typeof new M.SnapshotManager().save, 'function', 'SnapshotManager 面在场');
    const eb = new M.EmergencyBackup({ errLog: () => {} });
    assert.equal(eb.LS_KEY, 'lonsha_emergency_backup', 'EmergencyBackup 兜底键');
    ok('导出六项；六类真构造且关键语义抽检通过');
});

test('v3259 C. 加载面与基线：manifest 恰 1 项 + 基线读数随本刀同源重建', () => {
    const mf = JSON.parse(read('manifest.json'));
    assert.equal(mf.extra_js.filter((f) => f === MOD_REL).length, 1, MOD_REL + ' 须在 extra_js 恰好 1 次');
    const b = JSON.parse(read('tests/audit/host_beast_baseline.json'));
    assert.equal(b.readings.total_lines, IDX.split(NL).length, '基线行数须等于真 index.js 行数');
    assert.ok(b.rebuilds[b.measured_at], '本刀须在 rebuilds 面留读数（抬版后仍可回溯）');
    assert.equal(b.rebuilds[b.measured_at].readings.member_count, b.readings.member_count, 'rebuilds 与 readings 同读数');
    /* [v3.296.0 交棒] 原文是 `member_count < 561` ——【硬锁当版快照】（文案「剥走前的基线是 561」），
     *   与 v3259/v3260/v3261 三档同族：把某刀的一次性读数当永久不变量 ⇒ 后续活跃功能增长
     *   （X 系列八条接线 +16 位成员）就把它推回线上。交棒**不弱化**：561 作为里程碑读数搬进
     *   `host_beast_baseline.json` 的 `line_budget.history[0].member_milestones`（可机检、留痕），
     *   本档改守**全仓唯一的成员上界** `member_ceiling` —— 三档共用一个登记面，
     *   免得下一版增长要改三处数字（「一份契约 N 份拷贝」）。 */
    const _lb = b.line_budget || null;
    assert.ok(_lb && Number.isFinite(_lb.member_ceiling), '宿主成员数上界必须登记');
    const _ms = ((Array.isArray(_lb.history) ? _lb.history[0] : {}) || {}).member_milestones || {};
    assert.ok(_ms['561'], '里程碑读数 561 必须留在登记面（勿删）：A1 第二刀 memory-aux.js');
    assert.ok(b.readings.member_count <= _lb.member_ceiling,
        '★ 宿主成员数须 <= 登记上界 ' + _lb.member_ceiling + '，实测 ' + b.readings.member_count);
    assert.ok(_lb.member_ceiling - b.readings.member_count <= _lb.member_max_slack,
        '成员上界余量 ' + (_lb.member_ceiling - b.readings.member_count)
        + ' 不得超过 member_max_slack ' + _lb.member_max_slack);
    assert.ok(b.readings.total_lines < 18124, '行数须已随本刀下降（剥走前 18124）');
    /* 追加：本刀抽的是六个类 —— 用「减幅」把「基线刷新时少刷一点」钉住。 */
    assert.ok(b.readings.total_lines <= 17800, '本刀须至少剥掉 300 行，实测 ' + b.readings.total_lines);
    ok('manifest 恰 1 项；基线行数/成员数与真文件同源且已下降');
});

test('v3259 D. 真源码破坏 → 同一条判据必须翻红（取库口 / 模块类名 / 构造点 / 退路方法 各一条）', () => {
    const b1 = breakSource(IDX, "window.LonShaMemoryAux, 'memory-aux.js'",
        "window.LonShaMemoryAuxTYPO, 'memory-aux.js'", 'A1-取库口');
    assert.ok(judgeSlice(b1, MOD).some((p) => p.includes('真读表达式')), '取库口读错全局名必须翻红');
    const b2 = breakSource(MOD, '    class OpLog {', '    class OpLogX {', 'A1-模块类名');
    assert.ok(judgeSlice(IDX, b2).some((p) => p.includes('缺 OpLog')), '模块缺类必须翻红');
    const b3 = breakSource(IDX, "this.holiday = _newMemoryAux('HolidayAware');", 'this.holiday = null;', 'A1-漏接构造点');
    assert.ok(judgeSlice(b3, MOD).some((p) => p.includes("_newMemoryAux('HolidayAware'")), '漏接构造点必须翻红');
    const b4 = breakSource(IDX, '        stats() { return null; }' + NL, '', 'A1-退路缺方法');
    assert.ok(judgeSlice(b4, MOD).some((p) => p.includes('退路缺方法 OpLog.stats')), '退路少一个方法必须翻红');
    ok('四条真源码破坏各自被同一条判据抓到（破坏面不是抽样面）');
});

const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
test('v3259 E. 出生版本下限锚（本档出生在 3.258.0）', () => {
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(vnum(codeVer) >= vnum('3.258.0'), '本套件只在 3.258.0 及以后成立；当前 ' + codeVer);
    ok('本档锚着 ' + codeVer);
});

test('v3259 F. 判据面自防护：实现住在本档 + 走唯一破坏真源 + 清单不得缩水', () => {
    const SELF = read('tests/v3259_a1_memory_aux.test.mjs');
    assert.ok(/function judgeSlice\(/.test(SELF), '判据体必须住在本档');
    assert.ok(/function fallbackParity\(/.test(SELF), '退路对账必须住在本档');
    assert.ok(/import \{ breakSource \} from '\.\/_break_kit\.mjs'/.test(SELF), '破坏必须走唯一真源');
    assert.equal(AUX.length, 6, '本刀剥走的类面为六项，不得缩水');
    assert.equal(Object.keys(FIELDS).length, 6, '构造点对位表为六项');
    assert.ok(SELF.length > 6000, '本档不得被掏空');
    /* 本档不得自带索引副本：它读的必须是真文件（否则破坏面在另一个世界上）。 */
    assert.ok(SELF.includes("read('index.js')") && SELF.includes("read(MOD_REL)"), '真源必须从磁盘读');
    ok('判据实现 / 破坏真源 / 清单规模三者自洽');
});
