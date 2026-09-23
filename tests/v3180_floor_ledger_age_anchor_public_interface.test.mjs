// tests/v3180_floor_ledger_age_anchor_public_interface.test.mjs
// v3.180 三面收口：账随楼层走（floor-ledger）/ 年龄算不出就不猜（age-anchor）/
//   对外开一个只读查账口（public-interface）。
//   背景：v3.176 把「读推演侧世界的五本账」接通之后，本插件**自身**这一侧还剩三个同族缺口——
//     ① 账本的**归属性**没有真源：写进 ST 消息的那一格账，说不出它属于哪一楼哪一页。
//        翻页/重生成/摘要替换之后，运行期无从判定「这格账是不是当前显示的这页的」。
//        只能整格信或整格不信，**没有中间态**——这正是本项目反复治理的缺陷形态（三态塌成两态）。
//     ② 年龄的**可观测性**没有纪律：算不出就顺手回退成一个数字，
//        「钟没走」「锚点丢了」「推算为负」三种现场在读数上同形。
//     ③ 对外的**可查性**只有一根写死的桥：用户想在聊天里查一眼主角档案做不到，
//        卡作者想在 prompt 里引用剧情时钟也做不到（全库 grep 斜杠/宏注册在产品代码里零命中）。
// 层次：A 落笔四态归因（★ 落笔成功与「模块缺席/被拒」必须分别为可分辨的读数）
//       B 归属三态（present / valid / why：★「没有这格账」不得与「有但不属于这页」同形）
//       C 合并语义（同页二次落笔互不覆盖；翻页落笔整格换新，旧页字段不得继承）
//       D 覆盖度（逐楼列号 + 归因分布；★ 缺口有数有名，「没落笔」与「落笔失效」分账）
//       E 原子对守恒（stampAge 三条 / carryAge 不冻龄 / checkInvariants 报孤儿锚点）
//       F 年龄三态（exact / estimated / anchor-only；★ estimated 必须在生产路径上真能达成）
//       G 时钟助手接线（★ 修前 this.clock 恒 undefined ⇒ estimated 永不达成，三态塌两态）
//       H 对外三入口（12 资源 / 单一实现 / 三入口各自成败 / 幂等 / 绝不抛 / 只读）
//       I 负控制（真源码破坏 → 破坏副本 → 同款真判据）+ 工具两向自证 + 判据纯度
//       J 发布卫生
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const FL = require(path.join(REPO, 'floor-ledger.js'));
const AA = require(path.join(REPO, 'age-anchor.js'));
const PI = require(path.join(REPO, 'public-interface.js'));
const flSrc = fs.readFileSync(path.join(REPO, 'floor-ledger.js'), 'utf8');
const aaSrc = fs.readFileSync(path.join(REPO, 'age-anchor.js'), 'utf8');
const piSrc = fs.readFileSync(path.join(REPO, 'public-interface.js'), 'utf8');
const idxSrc = fs.readFileSync(path.join(REPO, 'index.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const changelog = fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8');
function vnum(s) {
    const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
    return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}
// ── 夹具 ──
const mkMsg = (index, text, sw = 0, isUser = false) => ({
    index, is_user: isUser, mes: text, swipe_id: sw, send_date: '2026-03-0' + (index + 1)
});
// 剧情日期解析：与 index.js RelativeTimeHelper 同口径的最小实现（只覆盖本测试用具）
const parseStory = (s) => {
    const m = /^(\d{1,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/.exec(String(s || '').trim());
    if (m) return { type: 'standard', year: +m[1], month: +m[2], day: +m[3] };
    const m2 = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || '').trim());
    if (m2) return { type: 'standard', year: +m2[1], month: +m2[2], day: +m2[3] };
    return null;
};
const calcAge = (birth, now) => {
    const b = parseStory(birth), c = parseStory(now);
    if (!b || !c) return 0;
    let age = c.year - b.year;
    if (c.month < b.month || (c.month === b.month && c.day < b.day)) age--;
    return Math.max(0, age);
};
// ── 花括号配平抽取（class / 方法体）──
function extractClass(source, name) {
    const start = source.indexOf('class ' + name + ' {');
    assert.ok(start > 0, `找到 class ${name}`);
    let depth = 0, end = -1;
    for (let i = source.indexOf('{', start); i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    assert.ok(end > 0, `class ${name} 花括号闭合`);
    return source.slice(start, end);
}
/** 在同一作用域里装载若干类，返回指定类的构造器。
 *  ★ 关键：CharacterState 的隔离副本里 `_moduleLib` 与 `require` 都不可用，
 *    取库只认 `window.LonShaAgeAnchor` —— 与 h345_deep_bastion 的真实抽取现场一致，
 *    也正因如此这里必须**显式注入 window**（否则等于测了一个「模块不存在」的世界）。 */
function loadClasses(source, deps, want, win) {
    const body = deps.map(d => extractClass(source, d)).join('\n');
    return new Function('errLog', 'window', body + '\nreturn ' + want + ';')(() => {}, win || {});
}
const AA_WIN = () => ({ LonShaAgeAnchor: AA });
/** 抽类方法体（★ 先配平圆括号再找函数体：`f(a, b = {})` 的参数默认值会把裸找 `{` 的写法坑到）。
 *  行为级判据靠它把宿主方法搬进隔离作用域，注入依赖后直接驱动。 */
function extractMethod(source, name) {
    const start = source.indexOf('        ' + name + '(');
    assert.ok(start > 0, `找到方法 ${name}`);
    let i = source.indexOf('(', start), depth = 0, close = -1;
    for (; i < source.length; i++) {
        if (source[i] === '(') depth++;
        else if (source[i] === ')') { depth--; if (depth === 0) { close = i; break; } }
    }
    assert.ok(close > 0, `方法 ${name} 圆括号闭合`);
    const brace = source.indexOf('{', close);
    let d2 = 0, end = -1;
    for (let j = brace; j < source.length; j++) {
        if (source[j] === '{') d2++;
        else if (source[j] === '}') { d2--; if (d2 === 0) { end = j + 1; break; } }
    }
    assert.ok(end > 0, `方法 ${name} 花括号闭合`);
    return source.slice(start, end);
}
/** 破坏副本装载器（reader 走 IIFE 双导出；破坏副本也走这里 ⇒ 判据与破坏同源） */
function loadModuleFrom(src, fileName) {
    const mod = { exports: {} };
    new Function('module', 'window', 'globalThis', src)(mod, {}, {});
    return mod.exports;
}
/** 破坏副本装载：public-interface 需要能注入 window（global 入口探针） */
function loadPIFrom(src, win) {
    const mod = { exports: {} };
    new Function('module', 'window', 'globalThis', src)(mod, win, win);
    return mod.exports;
}

// ══════════ A 落笔四态归因 ══════════
test('【A1】★ 落笔成功与「模块缺席」必须分别为可分辨读数（缺席 ⇒ null，不是「落笔了」）', () => {
    assert.equal(typeof idxSrc, 'string');
    // 宿主侧四态字面量必须在位：ok / module-unavailable / rejected / thrown
    for (const st of ['ok', 'module-unavailable', 'rejected', 'thrown']) {
        assert.ok(idxSrc.includes(`status: '${st}'`), `_stampFloorLedger 缺状态 ${st}`);
    }
});
test('【A1b】★ 基线校准：实例字段声明区不得带函数调用（顶层形态调用会在实例化时外抛）', () => {
    // 本仓库惯例：`class Foo { stateProvider = null; constructor() {…} }` —— 实例字段声明区只放字面量。
    //   若在此处写函数调用（如 `this.status.clock = …`），每次 new Foo() 都会在外层 this 未绑定前执行 ⇒ 外抛。
    const gcStart = idxSrc.indexOf('class GameClock {');
    const meStart = idxSrc.indexOf('class MemoryEngine {');
    const fieldZone = idxSrc.slice(meStart, idxSrc.indexOf('constructor(config) {', meStart));
    assert.ok(/stateProvider = null/.test(fieldZone),
        '实例字段声明区只放字面量（MemoryEngine 的 stateProvider = null 为该惯例的在场证据）');
    assert.ok(!/\w+\(/.test(fieldZone), '实例字段声明区不得出现函数调用');
    assert.equal((fieldZone.match(/constructor\(/g) || []).length, 0, '字段区不含构造器（边界抽取正确）');
    // 接线点在 MemoryEngine 构造器内，且该类的构造器唯一
    const meBody = idxSrc.slice(meStart, idxSrc.indexOf('\n    class ', meStart + 10));
    assert.equal((meBody.match(/constructor\(config\) \{/g) || []).length, 1, 'MemoryEngine 构造器唯一（接线点不会重复）');
    assert.ok(meBody.indexOf('this.status.clock = this.clock') > meBody.indexOf('constructor(config) {'),
        '时钟注入落在构造器内（不在实例字段区）');
    assert.ok(gcStart > 0, 'GameClock 定位成功（夹具依赖）');
});
test('【A2】stamp 与 read 一致：落笔后读回 present+valid，且 why=ok（不是缺省空值）', () => {
    const m = mkMsg(3, '甲走进邮局');
    const pay = FL.stamp(m, { floor: 3, items: [{ name: '信' }] });
    assert.ok(pay && pay.v === FL.EXTRA_VERSION, '落笔返回结构版本');
    const r = FL.read(m);
    assert.equal(r.present, true);
    assert.equal(r.valid, true);
    assert.equal(r.why, 'ok');
    assert.equal(r.record.floor, 3);
});
test('【A3】模块缺席时宿主不得伪造成功：_stampFloorLedger 取不到库 ⇒ status=module-unavailable', () => {
    // 源码锚点：取库不成功必须**先**落归因再 return null（修前形态是静默 no-op）
    assert.ok(/_moduleLib\(\(\) => window\.LonShaFloorLedger, 'floor-ledger\.js'\)/.test(idxSrc),
        '宿主侧必须真读该全局符号（注册了却无人取 = 静默缺席）');
    assert.ok(/status: 'module-unavailable'[\s\S]{0,80}return null;/.test(idxSrc),
        '模块缺席必须留痕并返回 null');
});
test('【A4】落笔失败可归因：extra 不可写 / 指纹取不到 两类理由分别成态（不是一句「失败」）', () => {
    assert.ok(idxSrc.includes("reason: !ex ? 'extra-unwritable'"), '缺 extra-unwritable 归因');
    assert.ok(idxSrc.includes("'unreadable-floor'"), '缺 unreadable-floor 归因');
    // 行为侧：extra 不可写（冻结对象）⇒ 不写半格且返回 null
    const frozen = Object.freeze({ index: 1, mes: 'x', swipe_id: 0 });
    assert.equal(FL.stamp(frozen, { floor: 1, items: [] }), null, 'extra 不可写不得写半格');
    assert.equal(FL.read(frozen).present, false, '未写入 ⇒ 读回 absent（不是「有但无效」）');
    // 行为侧：畸形 message ⇒ 指纹取不到 ⇒ 不写
    assert.equal(FL.stamp(null, { floor: 1, items: [] }), null);
    assert.equal(FL.stamp(mkMsg(1, 'x'), null), null, 'record 不是对象 ⇒ 不写');
});
test('【A5】stale 拒笔读数在宿主侧成态（fresh 模式指纹不符 ⇒ rejected/stale，不是照写）', () => {
    assert.ok(idxSrc.includes("status: 'rejected', reason: 'stale'"), '缺 stale 拒笔归因');
    // ★ 调用点用第三参传 fresh，方法签名必须收得下（修前签名只有两参 ⇒ fresh 恒 undefined、
    //   陈旧拒笔这条纪律从未生效，且是**静默**失效）
    assert.ok(/_stampFloorLedger\(message, record, opts = \{\}\)/.test(idxSrc),
        '★ _stampFloorLedger 必须收第三参（否则调用点的 {fresh:true} 被静默丢弃）');
    assert.ok(/record\.fresh \|\| opts\.fresh/.test(idxSrc), '判据须同时认 record.fresh 与 opts.fresh');
    assert.ok(idxSrc.includes('}, { fresh: true });'), '摘要落笔调用点必须在位（否则判据无对象）');
});

test('【A6】★ 行为级：fresh 拒笔真的生效（修前第三实参被静默丢弃 ⇒ 陈旧账照写）', () => {
    const j = judgeFresh(idxSrc);
    assert.equal(j.freshRejects, true, '★ fresh 模式下陈旧落笔必须被拒（修前第三实参被丢弃 ⇒ 拒笔纪律从未生效）');
    assert.equal(j.okWhenSame, true, '指纹相符时必须正常落笔（闸门不是恒拒）');
    assert.equal(j.gatedByFlag, true, '不带 fresh ⇒ 不做陈旧校验（闸门是标志本身）');
    assert.equal(j.missingAttributed, true, '模块缺席必须可归因且带楼层号，不伪造成功');
    assert.equal(j.noThrow, true, '怪异输入不得外抛');
});
/** 行为级：把宿主方法搬进隔离作用域，注入库/spy，直接观察 fresh 闸门与归因。 */
function judgeFresh(source) {
    const build = (lib, hostFp) => {
        const eng = new Function('_moduleLib', 'msgFpOf', 'errLog',
            'return ({ ' + extractMethod(source, '_stampFloorLedger') + ' });'
        )(() => lib, () => hostFp, () => {});
        return eng;
    };
    const okLib = { stamp: () => ({ floor: 7 }), fpOf: () => 'MODULE-FP' };
    // ① fresh + 指纹不符 ⇒ 拒笔且不写
    const e1 = build(okLib, 'HOST-FP');
    const r1 = e1._stampFloorLedger({ index: 7 }, { floor: 7, items: [] }, { fresh: true });
    const freshRejects = r1 === null && e1._floorLedgerStamp.status === 'rejected' && e1._floorLedgerStamp.reason === 'stale';
    const statusWhenStale = e1._floorLedgerStamp.status;
    // ② 指纹相符 ⇒ ok
    const e2 = build({ stamp: () => ({ floor: 7 }), fpOf: () => 'SAME' }, 'SAME');
    const r2 = e2._stampFloorLedger({ index: 7 }, { floor: 7, items: [] }, { fresh: true });
    const okWhenSame = r2 !== null && e2._floorLedgerStamp.status === 'ok';
    const statusWhenSame = e2._floorLedgerStamp.status;
    // ③ 不带 fresh ⇒ 不校验（说明闸门非恒拒）
    const e3 = build(okLib, 'HOST-FP');
    const r3 = e3._stampFloorLedger({ index: 7 }, { floor: 7, items: [] });
    const gatedByFlag = r3 !== null && e3._floorLedgerStamp.status === 'ok';
    // ④ 模块缺席 ⇒ 可归因
    const e4 = build(null, 'X');
    e4._stampFloorLedger({ index: 3 }, {});
    const missingAttributed = e4._floorLedgerStamp.status === 'module-unavailable' && e4._floorLedgerStamp.floor === 3;
    // ⑤ 不抛
    let threw = false;
    try { build(okLib, 'X')._stampFloorLedger(null, null, { fresh: true }); } catch (_e) { threw = true; }
    return { freshRejects, okWhenSame, gatedByFlag, missingAttributed, noThrow: !threw, statusWhenStale, statusWhenSame };
}

// ══════════ B 归属三态 ══════════
test('【B1】★ 三态可分辨：「没有这格账」/「有但不属于这页」/「有且属于这页」', () => {
    const absent = FL.read(mkMsg(2, '无账'));
    const m = mkMsg(4, '原页正文', 0);
    FL.stamp(m, { floor: 4, items: [{ name: 'a' }] });
    const valid = FL.read(m);
    m.swipe_id = 1;
    const stale = FL.read(m);
    assert.equal(absent.present, false);
    assert.equal(absent.why, 'absent');
    assert.equal(valid.present, true);
    assert.equal(valid.valid, true);
    assert.equal(stale.present, true, '★ 有账但翻页后必须仍报「在场」');
    assert.equal(stale.valid, false, '★ 但不得算有效');
    assert.equal(stale.why, 'fingerprint-mismatch');
    // 「没有」与「有但无效」不得同形
    assert.notEqual(absent.present, stale.present);
});
test('【B2】why 枚举四态齐全且互不重复（absent / fingerprint-mismatch / version-mismatch / malformed）', () => {
    const v = mkMsg(5, '版本不符');
    FL.stamp(v, { floor: 5, items: [] });
    v.extra[FL.EXTRA_KEY].v = 99;
    const mf = mkMsg(6, '结构畸形');
    FL.stamp(mf, { floor: 6, items: [] });
    delete mf.extra[FL.EXTRA_KEY].fp;
    const whys = [FL.read(mkMsg(7, 'x')).why, FL.read(v).why, FL.read(mf).why, 'fingerprint-mismatch'];
    assert.deepEqual(new Set(whys).size, 4, 'why 必须四态两两可分');
    assert.equal(FL.read(v).present, true, 'version-mismatch 是「在场但不认」，不是「没有」');
    assert.equal(FL.read(mf).present, true, 'malformed 同理');
});
test('【B3】版本让路：旧结构附注判 invalid 而非被按新结构误读（附在用户楼上的数据无法回收）', () => {
    const m = mkMsg(8, '旧附注');
    FL.stamp(m, { floor: 8, items: [{ name: '旧' }] });
    m.extra[FL.EXTRA_KEY].v = FL.EXTRA_VERSION + 1;
    const r = FL.read(m);
    assert.equal(r.valid, false);
    assert.equal(r.record, null, '不得把旧结构当新结构交出去');
    assert.ok(r.raw, '但原始附注要留（供迁移/取证）');
    // 升级工况：不清、不删，只是不认
    assert.ok(m.extra[FL.EXTRA_KEY], '旧数据不得被顺手删掉');
});
test('【B4】代码块不可读（extra 为怪类型 / 属性访问抛错）一律降级为可归因读数，不抛', () => {
    assert.doesNotThrow(() => FL.read(null));
    assert.doesNotThrow(() => FL.read('str'));
    assert.equal(FL.read(undefined).present, false);
    assert.doesNotThrow(() => FL.stamp(undefined, {}));
    assert.doesNotThrow(() => FL.clear(null));
    // ① extra 整个取不到（getter 抛）：读数如实降级，不得外抛
    const evilGetter = { index: 1, mes: 'x', get extra() { throw new Error('boom'); } };
    assert.doesNotThrow(() => FL.read(evilGetter));
    assert.equal(FL.read(evilGetter).present, false);
    // ② extra 可读但其属性访问抛错：★ 必须成 'thrown'（「抛错」与「没这项」是两件事）
    const evilProxy = { index: 2, mes: 'y', extra: new Proxy({}, { get() { throw new Error('boom'); } }) };
    assert.doesNotThrow(() => FL.read(evilProxy));
    assert.equal(FL.read(evilProxy).why, 'thrown', '属性访问抛错必须成态，不得被吞成 absent');
    assert.notEqual(FL.read(evilProxy).why, FL.read(undefined).why, '★ 抛错与缺席不得同形');
});

// ══════════ C 合并语义 ══════════
test('【C1】★ 同页二次落笔互不覆盖（先物品后摘要 ⇒ 两样都在，不是后到者胜）', () => {
    const m = mkMsg(10, '同页两次落笔');
    FL.stamp(m, { floor: 10, items: [{ name: '信' }, { name: '钥匙' }] });
    FL.stamp(m, { floor: 10, summary: { floor: 10, text: '摘要甲' } });
    const r = FL.read(m);
    assert.equal(r.valid, true);
    assert.equal(r.record.items.length, 2, '先落的物品账不得被冲掉');
    assert.equal(r.record.summary.text, '摘要甲', '后落的摘要必须在');
});
test('【C2】★ 翻页后落笔 = 整格换新（旧页物品账不得继承到新页）', () => {
    const m = mkMsg(11, '旧页正文', 0);
    FL.stamp(m, { floor: 11, items: [{ name: '旧页物品' }] });
    FL.stamp(m, { floor: 11, summary: { floor: 11, text: '旧页摘要' } });
    m.swipe_id = 1;   // 翻页：正文已换
    const pay = FL.stamp(m, { floor: 11, items: [{ name: '新页物品' }] });
    assert.equal(pay.items.length, 1);
    assert.equal(pay.items[0].name, '新页物品');
    assert.equal(pay.summary, undefined, '★ 旧页摘要不得继承（继承 = 串账）');
    assert.equal(FL.read(m).valid, true);
});
test('【C3】合并判据走**完整指纹**：不得用 ignoreFp 认旧账（否则旧页物品被继承到新页）', () => {
    // 源码：合并基准必须来自不带 ignoreFp 的 read
    assert.ok(/const prev = read\(msg\);/.test(flSrc), '合并基准必须走完整指纹校验的 read(msg)');
    assert.ok(/const samePage = prev\.present && prev\.valid;/.test(flSrc), 'samePage 判据必须在位');
    // 行为：ignoreFp 只在**调用方显式要求**时放松；默认读取必须收紧
    const m = mkMsg(12, '页A', 0);
    FL.stamp(m, { floor: 12, items: [{ name: 'A' }] });
    m.swipe_id = 1;
    assert.equal(FL.read(m).valid, false, '默认读取必须收紧');
    assert.equal(FL.read(m, { ignoreFp: true }).valid, true, 'ignoreFp 是显式放松口（对账用）');
});
test('【C4】有界：items 与 summary 文本切片（附注挂在用户楼层上，不得无界膨胀）', () => {
    const m = mkMsg(13, '有界 + 入参校验');
    const items = [];
    for (let i = 0; i < 60; i++) items.push({ name: 'i' + i });
    const pay = FL.stamp(m, { floor: 13, items, summary: { floor: 13, text: 'x'.repeat(5000) } });
    assert.equal(pay.items.length, 20, 'items 切片 20');
    assert.ok(pay.summary.text.length <= 2000, '摘要文本切片 2000，实得 ' + pay.summary.text.length);
});
test('【C5】clear 只摘自己的键（不碰用户/他插件写在 extra 里的东西）', () => {
    const m = mkMsg(14, '清账');
    m.extra = { lonsha_omit: true, someoneElse: { keep: 1 } };
    FL.stamp(m, { floor: 14, items: [] });
    assert.equal(FL.clear(m), true);
    assert.equal(FL.read(m).present, false);
    assert.deepEqual(m.extra, { lonsha_omit: true, someoneElse: { keep: 1 } }, '他键必须原样保留');
    assert.equal(FL.clear(m), false, '同一格重复清 ⇒ false（清了个不存在的东西要如实报）');
});

// ══════════ D 覆盖度 ══════════
test('【D1】★ 缺口有数有名：逐楼列号 + 归因分布（不是一句「没有」）', () => {
    const chat = [mkMsg(0, 'a'), mkMsg(1, 'b'), mkMsg(2, '  '), { index: 3, is_user: true, mes: 'u' },
        { index: 4, is_user: false, mes: 'd', extra: { lonsha_omit: true } }, mkMsg(5, 'e')];
    FL.stamp(chat[1], { floor: 1, items: [] });
    // 档 A：只给 skipFunction（空楼不计），番外楼暂未纳入 → 缺口应含 4
    const covSkipOnly = FL.coverage(chat, { skipFunction: (m) => !m || typeof m.mes !== 'string' || !m.mes.trim() });
    assert.equal(covSkipOnly.complete, false);
    assert.equal(covSkipOnly.stamped, 1);
    // 档 B：**宿主侧口径**（只数 AI 楼 + 空楼与番外楼都不计）——这才是运行期真口径
    const cov = FL.coverage(chat, {
        assistantOnly: true,
        omitFunction: (m) => !!(m && m.extra && m.extra.lonsha_omit === true),
        skipFunction: (m) => !m || typeof m.mes !== 'string' || !m.mes.trim()
    });
    assert.equal(cov.complete, false);
    assert.equal(cov.stamped, 1);
    assert.deepEqual(cov.missing, [0, 5], '缺的楼必须**列号**，不只给个数');
    assert.equal(cov.byWhy.absent, 2, '归因分布必须在');
    // 空楼 / 用户楼 / 番外楼都不计入统计（口径与宿主侧一致）
    assert.ok(!cov.floors.includes(2), '空楼不计入统计');
    assert.ok(!cov.floors.includes(3), '用户楼不计入');
    assert.ok(!cov.floors.includes(4), '番外楼 lonsha_omit 不计入（omitFunction 生效）');
    assert.equal(cov.total, 3, '参与统计的只有 0/1/5 三楼');
});
test('【D2】★ 「没落笔」与「落笔失效」分开归因（absent ≠ fingerprint-mismatch）', () => {
    const m = mkMsg(20, '需要 host 侧 skip/omit 才能体现的口径');
    const chat = [mkMsg(20, 'p1'), mkMsg(21, 'p2')];
    FL.stamp(chat[0], { floor: 20, items: [] });
    chat[0].swipe_id = 1;   // 落笔失效：有账但不属于这页
    const cov = FL.coverage(chat);
    assert.equal(cov.byWhy['fingerprint-mismatch'], 1, '失效必须按 fingerprint-mismatch 计');
    assert.equal(cov.byWhy.absent, 1, '未落笔必须按 absent 计');
    assert.equal(cov.stamped, 0);
    assert.equal(cov.complete, false);
    assert.ok(m);
});
test('【D3】无缺口时 complete=true 且 missing 为空（安静态不得报警）', () => {
    const chat = [mkMsg(30, 'q1'), mkMsg(31, 'q2')];
    FL.stamp(chat[0], { floor: 30, items: [] });
    FL.stamp(chat[1], { floor: 31, items: [] });
    const cov = FL.coverage(chat);
    assert.equal(cov.complete, true);
    assert.deepEqual(cov.missing, []);
    assert.equal(cov.total, 2);
    assert.equal(cov.stamped, 2);
});
test('【D4】upTo 有界扫描；畸形 chat（非数组）退化为空读数不抛', () => {
    const chat = [mkMsg(40, 'r1'), mkMsg(41, 'r2'), mkMsg(42, 'r3')];
    assert.equal(FL.coverage(chat, { upTo: 1 }).total, 2, 'upTo 必须约束扫描范围（不是全量）');
    assert.doesNotThrow(() => FL.coverage(null));
    assert.doesNotThrow(() => FL.coverage('nope'));
    assert.equal(FL.coverage(null).total, 0);
    assert.equal(FL.coverage(null).complete, true, '空输入 ⇒ 无缺口（不是「不可知」）');
});
test('【D5】宿主侧覆盖度是**现算**读数（不入快照存盘：存了就成了历史）', () => {
    assert.ok(/_floorLedgerCoverage\(\)\s*\{/.test(idxSrc), '宿主侧覆盖度入口必须在位');
    assert.ok(/\[v3\.180\] 楼层账本覆盖度（\*\*现算\*\*读数，不入快照存盘）/.test(idxSrc),
        '必须显式声明「现算、不入快照」这条边界');
    assert.ok(!/coverage:\s*(this\._floorLedgerCoverage|deep\(.*coverage)/.test(idxSrc),
        '覆盖度不得被塞进快照（入了快照 = 缺口变成历史数据）');
});

// ══════════ E 原子对守恒 ══════════
test('【E1】stampAge 三条契约：有值写入盖锚点 / 显式置空成对清除 / 未提供不动', () => {
    const a = {};
    AA.stampAge(a, '38', '2024年3月15日');
    assert.equal(a.age, '38');
    assert.equal(a.ageAnchorTime, '2024年3月15日');
    const b = { age: '38', ageAnchorTime: '2024年3月15日' };
    const r = AA.stampAge(b, null, '');
    assert.equal(b.age, undefined, '显式置空 ⇒ 年龄清');
    assert.equal(b.ageAnchorTime, undefined, '★ 锚点必须成对清（留孤儿 = I2 致命形态）');
    assert.equal(r.changed, true, '确实改动了 ⇒ changed 如实报');
    const c = { age: '38', ageAnchorTime: '2024年3月15日' };
    AA.stampAge(c, undefined, '2030年');
    assert.equal(c.age, '38');
    assert.equal(c.ageAnchorTime, '2024年3月15日', '未提供 ≠ 置空：两字段都不动');
});
test('【E2】★ 取不到锚点时不写假的（宁可没有锚点，也不用假锚点把年龄钉死）', () => {
    const t = { age: '38', ageAnchorTime: '旧锚点' };
    AA.stampAge(t, '40', '');
    assert.equal(t.age, '40');
    assert.equal(t.ageAnchorTime, undefined, '无故事时间 ⇒ 不得留旧锚点（那会显示成「新年龄 + 旧锚点」）');
    const t2 = {};
    AA.stampAge(t2, '38', '');
    assert.equal(t2.age, '38');
    assert.ok(!('ageAnchorTime' in t2), '两处都取不到 ⇒ 干脆不写锚点字段');
});
test('【E3】★ carryAge 守恒：年龄没变就连旧锚点一起带走（否则重放 = 冻龄）', () => {
    const same = AA.carryAge({ age: '38' }, { age: '38', ageAnchorTime: '2024年3月15日' });
    assert.equal(same.isNewAge, false, '★ 同值必须不是「新年龄」');
    assert.equal(same.anchor, '2024年3月15日', '★ 旧锚点必须一起带走（这才是自动长岁的依据）');
    const absent = AA.carryAge({}, { age: '38', ageAnchorTime: '2024年3月15日' });
    assert.equal(absent.anchor, '2024年3月15日', '本轮没给 age ⇒ 同样带走旧锚点');
    const changed = AA.carryAge({ age: '40' }, { age: '38', ageAnchorTime: '2024年3月15日' });
    assert.equal(changed.isNewAge, true, '真改了年龄 ⇒ 交给调用方盖新锚点');
    assert.equal(changed.anchor, undefined);
});
test('【E4】checkInvariants 三档：孤儿锚点（致命）/ 缺锚点 / 锚点非字符串', () => {
    assert.deepEqual(AA.checkInvariants({ ageAnchorTime: '2024年3月15日' }), ['I2:orphan-anchor'],
        '★ 有锚点无年龄 = 清空年龄留下旧锚点，必须致命在案');
    assert.deepEqual(AA.checkInvariants({ age: '38' }), ['I1:missing-anchor']);
    assert.ok(AA.checkInvariants({ age: '38', ageAnchorTime: 123 }).includes('I3:anchor-not-string'));
    assert.deepEqual(AA.checkInvariants({ age: '38', ageAnchorTime: '2024年3月15日' }), [], '合规态不得报违规');
    assert.doesNotThrow(() => AA.checkInvariants(null));
});
test('【E5】宿主 applyChanges 对 age 字段走原子对（重放不留孤儿锚点、也不刷新锚点）', () => {
    const CS = loadClasses(idxSrc, ['RelativeTimeHelper', 'CharacterState'], 'CharacterState', AA_WIN());
    const cs = new CS();
    assert.ok(cs._ageAnchor(), '夹具前提：隔离副本里取库走 window.LonShaAgeAnchor');
    cs.applyChanges([{ character: '甲', field: 'age', value: '30' }], 3, false, '2024年3月15日');
    assert.equal(cs.characters['甲'].age, '30');
    assert.equal(cs.characters['甲'].ageAnchorTime, '2024年3月15日', '写值同时盖本轮故事时间锚点');
    // 重放（补提旧楼）不得刷新锚点
    cs.applyChanges([{ character: '甲', field: 'age', value: '41' }], 3, true, '2030年1月1日');
    assert.equal(cs.characters['甲'].ageAnchorTime, '2024年3月15日', '★ 重放不得把锚点刷成今天（冻龄）');
    // 但重放也必须能成对清除（不得留孤儿）
    cs.applyChanges([{ character: '甲', field: 'age', value: '' }], 3, true, '2030年1月1日');
    assert.equal(cs.characters['甲'].ageAnchorTime, undefined, '★ 重放里清空年龄 ⇒ 锚点一并清（不留孤儿）');
});

// ══════════ F 年龄三态 ══════════
test('【F1】三态字面量齐全且两两可分（exact / estimated / anchor-only）', () => {
    const exact = AA.ageDisplay('38', '', '');
    const est = AA.ageDisplay('38', '2024年3月15日', '2026年3月15日', { parseFn: parseStory });
    const only = AA.ageDisplay('38', '2024年3月15日', '天顺三年', { parseFn: parseStory });
    const states = [exact.state, est.state, only.state];
    assert.deepEqual(new Set(states).size, 3, '★ 三态必须两两可分，实得 ' + JSON.stringify(states));
    assert.equal(est.text, '约40岁(2024年3月时38岁)');
    assert.equal(only.text, '38(2024年3月时)');
});
test('【F2】★ 「算不出」不得回一个数字（把估计值当精确值，是本版要封的口）', () => {
    const only = AA.ageDisplay('38', '2024年3月15日', '天顺三年', { parseFn: parseStory });
    assert.equal(only.state, 'anchor-only');
    assert.equal(only.age, '38', 'anchor-only 交回的是**原值**，不是推算值');
    assert.ok(!/约/.test(only.text), '算不出就不猜：不得出现「约X岁」');
    // 时间倒流：不猜
    const back = AA.ageDisplay('38', '2026年3月15日', '2024年3月15日', { parseFn: parseStory });
    assert.equal(back.state, 'anchor-only', '★ 时间倒流必须走「不猜」，不得算出负数或回退成 exact');
    // 不足一年：原值即准（exact，不上「约」）
    const within = AA.ageDisplay('38', '2024年3月15日', '2024年5月15日', { parseFn: parseStory });
    assert.equal(within.state, 'exact');
    assert.equal(within.text, '38');
});
test('【F3】出生日期口径：能算才交数字，算不出退 anchor-only（不得拿年份当岁数）', () => {
    const ok = AA.ageDisplay('1986-03-02', '2024年3月15日', '2026年3月15日', { parseFn: parseStory, calcAge });
    assert.equal(ok.state, 'estimated');
    assert.equal(ok.text, '40');
    const no = AA.ageDisplay('1986-03-02', '2024年3月15日', '2026年3月15日', { parseFn: parseStory });
    assert.equal(no.state, 'anchor-only', '没给 calcAge ⇒ 算不出 ⇒ 不猜');
    assert.ok(/1986-03-02/.test(no.text), '原文必须如实带出');
});
test('【F4】days 读数与边界：365 天为界（不足一年不改，跨一年才「约」）', () => {
    const pay = AA.ageDisplay('30', '2024年3月15日', '2025年3月15日', { parseFn: parseStory });
    assert.equal(pay.days, 365, '恰好一年');
    assert.equal(pay.state, 'estimated');
    assert.equal(pay.text, '约31岁(2024年3月时30岁)');
    const before = AA.ageDisplay('30', '2024年3月15日', '2025年3月14日', { parseFn: parseStory });
    assert.equal(before.state, 'exact', '差一天不满一年 ⇒ 原值即准');
});
test('【F5】畸形输入一律不抛、且如实返回结构（调用方无需判空）', () => {
    assert.doesNotThrow(() => AA.ageDisplay(null, null, null));
    assert.equal(AA.ageDisplay(null, null, null).text, '');
    assert.doesNotThrow(() => AA.ageDisplay(undefined, undefined, undefined, {}));
    assert.doesNotThrow(() => AA.ageDisplay('38', 'x', 'y', { parseFn: () => { throw new Error('boom'); } }));
    assert.doesNotThrow(() => AA.stampAge(null, '1'));
    assert.doesNotThrow(() => AA.carryAge(null, null));
    // 锚点标注取不到可辨认部分 ⇒ 不标（不带一个空括号）
    assert.equal(AA.anchorLabel('架空历法'), '');
    assert.equal(AA.ageDisplay('38', '架空历法', '2026年3月15日', { parseFn: parseStory }).text, '38');
});

// ══════════ G 时钟助手接线 ══════════
test('【G1】★ GameClock 必须自己能解析剧情日期（修前 parseStoryDate 不在时钟上）', () => {
    const GC = loadClasses(idxSrc, ['RelativeTimeHelper', 'GameClock'], 'GameClock');
    const gc = new GC();
    assert.equal(typeof gc.parseStoryDate, 'function',
        '★ 时钟必须有 parseStoryDate（否则 this.clock?.parseStoryDate?.(s) 恒 undefined，估算态永不达成）');
    assert.equal(typeof gc.calcAge, 'function', '★ 同理 calcAge');
    const p = gc.parseStoryDate('2024年3月15日');
    assert.ok(p && p.year === 2024 && p.month === 3, '委托必须真的解析出结构，实得 ' + JSON.stringify(p));
    assert.equal(gc.calcAge('1986-03-02', '2024年3月15日'), 38, '委托必须真的算出岁数');
});
test('【G2】★ 生产路径上 estimated 必须真能达成（三态不能塌成两态）', () => {
    const CS = loadClasses(idxSrc, ['RelativeTimeHelper', 'CharacterState'], 'CharacterState', AA_WIN());
    const cs = new CS();
    cs.protagonist.age = '38';
    cs.protagonist.ageAnchorTime = '2024年3月15日';
    const txt = cs.ageReadingPrompt('2026年3月15日');
    assert.ok(/约40岁/.test(txt), '★ 时间跨一年必须长岁（实得「' + txt + '」）——修前恒为原值');
    assert.equal(cs.getEffectiveAge('2026年3月15日'), '40', '要数字的调用方也必须拿到推算值');
    // 反向：算不出时必须**不给数字**（getEffectiveAge 回空串，不是回退静态值）
    cs.protagonist.ageAnchorTime = '天顺三年春';
    assert.equal(cs.getEffectiveAge('2026年3月15日'), '', '★ 算不出 ⇒ 空串（修前一律回落静态值 = 假数字）');
    // 文本读数在「算不出」时给原文（不带「约」、不带假数字）
    assert.equal(cs.ageReadingPrompt('2026年3月15日'), '38', '算不出 ⇒ 原文即读数（不得伪造推算值）');
});
test('【G3】★ CharacterState 侧时钟引用必须真的接上（this.clock 修前在状态层恒 undefined）', () => {
    assert.ok(/this\.status\.clock = this\.clock/.test(idxSrc),
        '★ 引擎必须把时钟交给状态层（否则 this.clock 恒 undefined，助手静默缺席）');
    const CS = loadClasses(idxSrc, ['RelativeTimeHelper', 'CharacterState'], 'CharacterState');
    const cs = new CS();
    const h = cs._clockHelpers();
    assert.ok(h && typeof h.parseStoryDate === 'function' && typeof h.calcAge === 'function',
        '状态层必须取得到时钟助手（注入优先、缺失自建）');
});
test('【G4】隔离安全：单抽 CharacterState / GameClock 时助手缺席也必须降级，不抛', () => {
    const CSalone = loadClasses(idxSrc, ['CharacterState'], 'CharacterState');
    const cs = new CSalone();
    assert.equal(cs._clockHelpers(), null, '隔离副本里两个符号都不在作用域 ⇒ 如实返回 null');
    assert.doesNotThrow(() => cs.ageReadingPrompt('2026年3月15日'));
    cs.protagonist.age = '38';
    cs.protagonist.ageAnchorTime = '2024年3月15日';
    assert.doesNotThrow(() => cs.exportAgeAnchors());
    const GCalone = loadClasses(idxSrc, ['GameClock'], 'GameClock');
    const gc = new GCalone();
    assert.doesNotThrow(() => gc.parseStoryDate('2024年3月15日'), '★ 委托缺席时不得连坐（年龄读数不该炸整条管线）');
    assert.doesNotThrow(() => gc.calcAge('1986-03-02', '2024年3月15日'));
});
test('【G5】注入优先：调用方/引擎给了时钟就不再自建（既有注入行为不被改写）', () => {
    const CS = loadClasses(idxSrc, ['RelativeTimeHelper', 'CharacterState'], 'CharacterState');
    const cs = new CS();
    let used = 0;
    cs.clock = { parseStoryDate: (s) => { used++; return { type: 'standard', year: 2024, month: 3, day: 15 }; }, calcAge: () => 7 };
    cs._clockHelpers().parseStoryDate('任意');
    assert.equal(used, 1, '★ 注入了就走注入（不得被自建顶掉）');
    assert.equal(cs._clockHelpers().calcAge(), 7);
});

// ══════════ H 对外三入口 ══════════
test('【H1】13 项资源冻结 + 单一实现（斜杠/宏/全局共用 queryResource）', () => {
    assert.equal(PI.NS, 'lonsha');
    assert.equal(PI.API_VERSION, 1);
    // [v3.181] 场所图景扩到 13 项：新增 'scene'（当前位置链/在场名单/到访读数/覆盖度/不变量）。
    assert.equal(PI.RESOURCES.length, 13, '资源清单 13 项');
    assert.ok(Object.isFrozen(PI.RESOURCES), '清单必须冻结（运行期不得被追加）');
    for (const r of ['snapshot', 'protagonist', 'lifeDetails', 'characters', 'moneyLedger', 'outline',
        'worldProg', 'clock', 'recallAudit', 'worldLedgerRead', 'coverage', 'floor', 'scene']) {
        assert.ok(PI.RESOURCES.includes(r), '缺资源 ' + r);
    }
    // 大小写不敏感 + 未知名如实 undefined
    const snap = { clock: '天顺三年', floor: 0 };
    assert.equal(PI.queryResource(snap, 'CLOCK'), '天顺三年');
    assert.equal(PI.queryResource(snap, 'floor'), 0, '★ floor=0 必须交回 0（不是被当成缺项）');
    assert.equal(PI.queryResource(snap, 'nope'), undefined, '未知名 ⇒ undefined（不抛、不编造）');
    assert.equal(PI.queryResource(null, 'clock'), null, '无快照 ⇒ 如实交出 null（与「值为 undefined」分开）');
    assert.equal(PI.queryResource(undefined, 'clock'), undefined);
});
test('【H2】非法 format 必须浮到用户面前（TypeError，不是静默回退 json）', () => {
    assert.throws(() => PI.formatResult(1, 'yaml'), /format 只能是/);
    assert.equal(PI.formatResult(undefined, 'raw'), '', 'undefined 的 raw 是空串，不是 "undefined"');
    assert.equal(PI.formatResult({ a: 1 }, 'text'), '{"a":1}');
    assert.ok(/\n/.test(PI.formatResult({ a: 1 }, 'json')), 'json 走缩进');
});
test('【H3】★ 三入口各自成败：斜杠失败不得连坐宏（反之亦然），且成败如实回报', async () => {
    const win = {};
    const api = loadPIFrom(piSrc, win);
    // ① 全成功
    const added = [];
    const macros = [];
    const mods = {
        '/scripts/slash-commands/SlashCommandParser.js': { SlashCommandParser: { addCommandObject: (o) => added.push(o), addCommand: () => { throw new Error('不该走到旧路径'); } } },
        '/scripts/power-user.js': { power_user: { experimental_macro_engine: true } },
        '/scripts/macros/macro-system.js': { macros: { register: (n, o) => macros.push([n, !!o.parameters]) }, MacroCategory: { CHAT: 'chat' } }
    };
    win.lonsha_memory_bridge_v1 = {};
    const snap = { clock: '天顺三年', protagonist: { age: '38' }, floor: 7 };
    const rep = await api.register({
        snapshot: () => snap, coverage: () => ({ complete: true }),
        makeCommandObject: (p) => p,
        dynamicImport: (p) => Promise.resolve(mods[p] || {})
    });
    assert.equal(rep.slash.state, 'ready');
    assert.equal(rep.slash.path, 'addCommandObject', '★ 必须回报注册到**哪条路径**（决定能不能用命名参数）');
    assert.equal(rep.macro.state, 'ready');
    assert.equal(rep.macro.path, 'macro-system');
    assert.equal(rep.macro.parameterized, true, '参数化宏可用性必须如实标注');
    assert.equal(rep.global.state, 'ready');
    assert.equal(added.length, 1);
    assert.equal(added[0].name, 'lonsha-get');
    assert.equal(macros.length, 8, '7 个具名宏 + 1 个参数化');
    // ② 斜杠模块抛错 ⇒ 宏仍须 ready（互不连坐）
    const win2 = {};
    const api2 = loadPIFrom(piSrc, win2);
    const macros2 = [];
    const rep2 = await api2.register({
        dynamicImport: (p) => {
            if (p.includes('slash-commands')) return Promise.reject(new Error('no-slash'));
            if (p.includes('power-user')) return Promise.resolve({ power_user: { experimental_macro_engine: true } });
            if (p.includes('macro-system')) return Promise.resolve({ macros: { register: (n) => macros2.push(n) }, MacroCategory: { CHAT: 'chat' } });
            return Promise.resolve({});
        }
    });
    assert.equal(rep2.slash.state, 'failed');
    assert.ok(/no-slash/.test(rep2.slash.reason), '失败原因必须留下：' + rep2.slash.reason);
    assert.equal(rep2.macro.state, 'ready', '★ 斜杠失败不得连坐宏');
    assert.equal(rep2.global.state, 'absent', '未挂桥 ⇒ absent（不是 failed）');
});
test('【H4】旧路径兜底：addCommandObject 不可用 ⇒ 退 addCommand，且路径如实标注', async () => {
    const win = {};
    const api = loadPIFrom(piSrc, win);
    const calls = [];
    const rep = await api.register({
        snapshot: () => ({ clock: 'x' }), coverage: () => null,
        dynamicImport: (p) => {
            if (p.includes('slash-commands')) return Promise.resolve({ SlashCommandParser: { addCommand: (n, cb, a, d, e, f) => calls.push([n, d, e, f]) } });
            if (p.includes('power-user')) return Promise.resolve({ power_user: {} });
            if (p.includes('macros.js')) return Promise.resolve({ MacrosParser: { registerMacro: (n) => calls.push(['macro:' + n]) } });
            return Promise.resolve({});
        }
    });
    assert.equal(rep.slash.state, 'ready');
    assert.equal(rep.slash.path, 'addCommand', '★ 走了哪条路径必须如实标注（决定 /lonsha-get resource=x 成不成立）');
    assert.equal(rep.macro.path, 'macros');
    assert.equal(rep.macro.parameterized, false, '经典宏路径不得自称参数化可用');
    assert.ok(calls.some(c => c[0] === 'lonsha-get'));
});
test('【H5】★ register 幂等 + 绝不抛（宿主重复 init 不得二次注册，设施全缺也只是各态如实）', async () => {
    const win = {};
    const api = loadPIFrom(piSrc, win);
    const added = [];
    const deps = {
        snapshot: () => ({}), coverage: () => null, makeCommandObject: (p) => p,
        dynamicImport: (p) => (p.includes('slash-commands') ? Promise.resolve({ SlashCommandParser: { addCommandObject: (o) => added.push(o) } }) : Promise.resolve({}))
    };
    const r1 = await api.register(deps);
    const r2 = await api.register(deps);
    assert.equal(r2, r1, '重复注册必须返回同一份 report（幂等）');
    assert.equal(added.length, 1, '★ 第二个命令不得被注册（重复 init 会报「已声明」错）');
    assert.equal(api.lastReport(), r1, 'lastReport 必须交回最近一次真结果');
    // 设施全缺 + 导入抛错：不得外抛
    const win3 = {};
    const api3 = loadPIFrom(piSrc, win3);
    let threw = false;
    let rep3 = null;
    try { rep3 = await api3.register({ dynamicImport: () => { throw new Error('import-boom'); } }); } catch (_e) { threw = true; }
    assert.equal(threw, false, '★ register 绝不抛（失败只是该入口 state=failed）');
    assert.equal(rep3.slash.state, 'failed');
    assert.ok(/import-boom/.test(rep3.slash.reason));
    assert.equal(api3.lastReport(), rep3, '「试了失败」必须留痕（不是返回 null）');
});
test('【H6】斜杠回调用宿主快照取值：具名 / 无名 / 缺参抛错 / 未知名抛错 / coverage 走现算', async () => {
    const win = {};
    const api = loadPIFrom(piSrc, win);
    const added = [];
    let covCalls = 0;
    await api.register({
        snapshot: () => ({ clock: '天顺三年', protagonist: { age: '38' }, floor: 7 }),
        coverage: () => { covCalls++; return { complete: false, missing: [1] }; },
        makeCommandObject: (p) => p,
        dynamicImport: (p) => (p.includes('slash-commands') ? Promise.resolve({ SlashCommandParser: { addCommandObject: (o) => added.push(o) } }) : Promise.resolve({}))
    });
    const cb = added[0].callback;
    assert.equal(cb({ resource: 'clock' }, []), '"天顺三年"');
    assert.ok(/age/.test(cb({}, ['protagonist'])), '无名参数位必须也认（两个入口写法不同）');
    assert.throws(() => cb({}, []), /缺少 resource/, '缺参必须抛（错误要浮到用户面前）');
    assert.throws(() => cb({}, []), /可用：snapshot/);
    assert.throws(() => cb({ resource: '不存在的资源' }, []), /未知 resource/, '未知名必须抛，且带上是哪个名');
    assert.throws(() => cb({ resource: '不存在的资源' }, []), /不存在的资源/);
    assert.equal(cb({ resource: 'coverage' }, []), '{\n  "complete": false,\n  "missing": [\n    1\n  ]\n}');
    assert.ok(covCalls >= 1, 'coverage 必须走现算口（不是从快照里翻一个旧字段）');
    assert.equal(cb({ resource: 'floor', format: 'raw' }, []), '7');
});
test('【H7】宏取值失败返回空串（宏系统约定），不得炸掉整条 prompt', () => {
    const t = PI.macroTable({ snapshot: () => { throw new Error('boom'); }, coverage: () => { throw new Error('boom'); } });
    assert.equal(Object.keys(t).length, 7);
    for (const [name, fn] of Object.entries(t)) {
        assert.doesNotThrow(() => fn(), '宏 ' + name + ' 求值不得外抛');
        assert.equal(fn(), '', '宏 ' + name + ' 失败必须返回空串');
    }
});
test('【H8】宿主接线：延后一拍避开「桥未赋值」时序陷阱 + 失败只留痕', () => {
    assert.ok(/setTimeout\(\(\) => \{ run\(\); \}, 0\);/.test(idxSrc),
        '★ 注册必须延后一拍（桥在 plugin.init() 返回后才赋值，同步注册会让 global 入口恒报 absent）');
    assert.ok(/this\._publicInterfaceReport = rep;/.test(idxSrc), '注册结果必须留痕到可查位置');
    assert.ok(/\{ state: 'absent', reason: 'public-interface\.js 未加载' \}/.test(idxSrc),
        '模块未加载必须如实报（不得静默当「没这功能」）');
});
test('【H9】只读边界：三入口不得出现任何写侧入口', () => {
    for (const bad of ['publish(', 'invalidate(', 'setSettings(', 'addCommandDelete', 'writeFileSync']) {
        assert.ok(piSrc.indexOf(bad) < 0, '公开接口不得调用写侧入口 ' + bad);
    }
    assert.ok(!/\.(protagonist|characters|lifeDetails)\s*=\s*/.test(piSrc), '三入口不得写本插件账本');
});

// ══════════ I 负控制 ══════════
// 判据集中在 judgeFloor / judgeAge / judgePublic（只断言行为，不复述锚点字面量）；
//   锚点字面量只在 brokenCopies() 里各出现一次（判据纯度）。
function judgeFloor(api) {
    // 判据一：三态可分（没有 / 有但不属于这页 / 有且属于这页）
    const m = mkMsg(50, '判据用楼', 0);
    const absentBefore = api.read(m);
    api.stamp(m, { floor: 50, items: [{ name: 'a' }] });
    const here = api.read(m);
    m.swipe_id = 1;
    const there = api.read(m);
    const threeStates = absentBefore.present === false && absentBefore.why === 'absent'
        && here.present === true && here.valid === true
        && there.present === true && there.valid === false && there.why !== absentBefore.why;
    // 判据二：合并语义（同页二次落笔不覆盖 / 翻页落笔不继承）
    const m2 = mkMsg(51, '判据用楼二', 0);
    api.stamp(m2, { floor: 51, items: [{ name: 'x' }] });
    api.stamp(m2, { floor: 51, summary: { floor: 51, text: 's' } });
    const merged = api.read(m2).record;
    const mergeKept = !!(merged.items && merged.items.length === 1 && merged.summary && merged.summary.text === 's');
    m2.swipe_id = 1;
    const pay = api.stamp(m2, { floor: 51, items: [{ name: 'y' }] });
    const noInherit = pay.items.length === 1 && pay.items[0].name === 'y' && pay.summary === undefined;
    // 判据三：缺口有数有名（逐楼列号 + 归因分布）
    const chat = [mkMsg(60, 'c1'), mkMsg(61, 'c2')];
    api.stamp(chat[0], { floor: 60, items: [] });
    const cov = api.coverage(chat);
    const coverageHonest = cov.complete === false && cov.missing.length > 0 && cov.byWhy && cov.byWhy.absent > 0;
    // 判据四：有界（不无界写进用户楼层）
    const many = [];
    for (let i = 0; i < 50; i++) many.push({ name: 'b' + i });
    const big = api.stamp(mkMsg(62, '判据用楼三'), { floor: 62, items: many, summary: { floor: 62, text: 'z'.repeat(9000) } });
    const bounded = big.items.length < 50 && big.summary.text.length < 9000;
    // 判据五：★ 旧结构附注不得被当新结构交出（版本让路：present 但不 valid、record 为 null）
    const mv = mkMsg(64, '版本让路');
    api.stamp(mv, { floor: 64, items: [{ name: 'o' }] });
    mv.extra[api.EXTRA_KEY].v = api.EXTRA_VERSION + 1;
    const vres = api.read(mv);
    const versionHonest = vres.present === true && vres.valid === false && vres.record === null;
    // 判据六：任何怪异输入不得外抛
    let threw = false;
    try {
        api.read(null); api.read('x'); api.stamp(null, {}); api.stamp(mkMsg(63, 'x'), null);
        api.clear(null); api.coverage(null); api.coverage('nope');
    } catch (_e) { threw = true; }
    return { threeStates, mergeKept, noInherit, coverageHonest, bounded, versionHonest, noThrow: !threw };
}
function judgeAge(api) {
    // 判据一：三态两两可分，且「算不出」不回数字、不上「约」
    const exact = api.ageDisplay('38', '', '');
    const est = api.ageDisplay('38', '2024年3月15日', '2026年3月15日', { parseFn: parseStory });
    const only = api.ageDisplay('38', '2024年3月15日', '天顺三年', { parseFn: parseStory });
    const threeStates = new Set([exact.state, est.state, only.state]).size === 3;
    const estLongYears = /约40岁/.test(est.text);
    const noGuess = !/约/.test(only.text) && !/\d{2}岁/.test(only.text.replace('38', ''));
    // 判据一的补：不足一年不得也上「约」（365 天是分界，不是摆设）
    const noFakeEstimate = api.ageDisplay('30', '2024年3月15日', '2024年5月15日', { parseFn: parseStory }).state === 'exact';
    // 判据二：★ 取不到锚点时不写假的（新年龄不得配旧锚点）
    const c = { age: '38', ageAnchorTime: '旧锚点' };
    api.stampAge(c, '40', '');
    const noFakeAnchor = c.age === '40' && !c.ageAnchorTime;
    // 判据三：原子对（显式置空成对清；未提供不动）
    const a = { age: '38', ageAnchorTime: '2024年3月15日' };
    api.stampAge(a, null, '');
    const pairCleared = a.age === undefined && a.ageAnchorTime === undefined;
    const b = { age: '38', ageAnchorTime: '2024年3月15日' };
    api.stampAge(b, undefined, '2030年');
    const untouched = b.age === '38' && b.ageAnchorTime === '2024年3月15日';
    // 判据四：守恒（同值带走旧锚点 ⇒ 不冻龄）
    const carry = api.carryAge({ age: '38' }, { age: '38', ageAnchorTime: '2024年3月15日' });
    const conserved = carry.isNewAge === false && carry.anchor === '2024年3月15日';
    // 判据五：孤儿锚点致命在案
    const orphanCaught = api.checkInvariants({ ageAnchorTime: '2024年3月15日' }).indexOf('I2:orphan-anchor') >= 0;
    // 判据六：不抛
    let threw = false;
    try {
        api.ageDisplay(null, null, null); api.stampAge(null, '1'); api.carryAge(null, null);
        api.checkInvariants(null); api.ageDisplay('38', 'x', 'y', { parseFn: () => { throw new Error('b'); } });
    } catch (_e) { threw = true; }
    return { threeStates, estLongYears, noGuess, noFakeEstimate, noFakeAnchor, pairCleared, untouched, conserved, orphanCaught, noThrow: !threw };
}
function judgeClock(source) {
    // 判据一：时钟自己能解析（修前这两条能力不在时钟上）
    const GC = loadClasses(source, ['RelativeTimeHelper', 'GameClock'], 'GameClock');
    const gc = new GC();
    const clockParses = typeof gc.parseStoryDate === 'function' && gc.parseStoryDate('2024年3月15日') !== null
        && gc.calcAge('1986-03-02', '2024年3月15日') === 38;
    // 判据二：★ 生产路径上 estimated 真能达成 —— 用**引擎注入的时钟**（运行期真接线），
    //   而不是状态层自建的那一份：后者只证明「自建可用」，证明不了「接线可用」。
    const CS = loadClasses(source, ['RelativeTimeHelper', 'CharacterState'], 'CharacterState', AA_WIN());
    const cs = new CS();
    cs.clock = gc;
    cs.protagonist.age = '38';
    cs.protagonist.ageAnchorTime = '2024年3月15日';
    const liveLongYears = /约40岁/.test(cs.ageReadingPrompt('2026年3月15日'));
    // 判据三：算不出不给数字
    cs.protagonist.ageAnchorTime = '天顺三年春';
    const noFakeNumber = cs.getEffectiveAge('2026年3月15日') === '';
    // 判据四：引用真的接上（状态层取得到助手）
    const wired = !!(cs._clockHelpers && cs._clockHelpers());
    // 判据五：引擎构造里把时钟交给状态层
    const injected = /this\.status\.clock = this\.clock/.test(source);
    return { clockParses, liveLongYears, noFakeNumber, wired, injected };
}
async function judgePublic(src) {
    const win = {};
    const api = loadPIFrom(src, win);
    const added = [];
    const macros = [];
    win.lonsha_memory_bridge_v1 = {};
    const rep = await api.register({
        snapshot: () => ({ clock: '天顺三年', floor: 7 }),
        coverage: () => ({ complete: true }),
        makeCommandObject: (p) => p,
        dynamicImport: (p) => {
            if (p.includes('slash-commands')) return Promise.resolve({ SlashCommandParser: { addCommandObject: (o) => added.push(o) } });
            if (p.includes('power-user')) return Promise.resolve({ power_user: { experimental_macro_engine: true } });
            if (p.includes('macro-system')) return Promise.resolve({ macros: { register: (n, o) => macros.push([n, !!o.parameters]) }, MacroCategory: { CHAT: 'chat' } });
            return Promise.resolve({});
        }
    });
    const allReady = rep.slash.state === 'ready' && rep.macro.state === 'ready' && rep.global.state === 'ready';
    const pathsLabelled = rep.slash.path === 'addCommandObject' && rep.macro.path === 'macro-system';
    // 单一实现：斜杠回调与宏必须取到**同一个**值（入口间不得漂移）
    const cbVal = added.length ? added[0].callback({ resource: 'clock', format: 'raw' }, []) : null;
    const macroVal = (() => { try { return api.macroTable({ snapshot: () => ({ clock: '天顺三年' }), coverage: () => null })['lonshaClock'](); } catch (_e) { return null; } })();
    const singleImpl = cbVal === macroVal && cbVal === '天顺三年';
    // 幂等：第二次注册必须不新增命令
    await api.register({ snapshot: () => ({}), coverage: () => null, makeCommandObject: (p) => p, dynamicImport: () => Promise.resolve({ SlashCommandParser: { addCommandObject: (o) => added.push(o) } }) });
    const idempotent = added.length === 1;
    // 未知名必须抛（错误要浮到用户面前）
    let unknownThrows = false;
    try { added[0].callback({ resource: '不存在' }, []); } catch (_e) { unknownThrows = true; }
    // 绝不抛
    const win2 = {};
    const api2 = loadPIFrom(src, win2);
    let threw = false;
    try { const r2 = await api2.register({ dynamicImport: () => { throw new Error('b'); } }); threw = !(r2 && r2.slash.state === 'failed'); } catch (_e) { threw = true; }
    return { allReady, pathsLabelled, singleImpl, idempotent, unknownThrows, noThrow: !threw };
}
/** 真源码破坏 → 破坏副本（锚点必须恰中 1 次，否则这不是破坏） */
function brokenCopies() {
    const mk = (src, old, to, tag) => {
        const hits = src.split(old).length - 1;
        assert.equal(hits, 1, `锚点【${tag}】须恰中 1 次（实 ${hits}）`);
        const out = src.replace(old, to);
        assert.notEqual(out, src, `破坏【${tag}】必须真的改变源码`);
        return out;
    };
    return [
        {
            tag: 'F1-absent-as-present', what: '把「没有这格账」并进「有但不属于这页」',
            target: 'floor', src: mk(flSrc,
                "        if (!ex || !ex[EXTRA_KEY] || typeof ex[EXTRA_KEY] !== 'object') return { present: false, valid: false, record: null, why: 'absent' };",
                "        if (!ex || !ex[EXTRA_KEY] || typeof ex[EXTRA_KEY] !== 'object') return { present: true, valid: false, record: null, why: 'fingerprint-mismatch' };",
                'F1')
        },
        {
            tag: 'F2-ignorefp-in-merge', what: '合并基准用 ignoreFp 认旧账（旧页物品被继承到新页）',
            target: 'floor', src: mk(flSrc,
                'const prev = read(msg);',
                'const prev = read(msg, { ignoreFp: true });',
                'F2')
        },
        {
            tag: 'F3-fp-ignored', what: '默认读取不再校验指纹（翻页后旧账仍被认账）',
            target: 'floor', src: mk(flSrc,
                'if (opts.ignoreFp !== true && rec.fp !== fp)',
                'if (false)',
                'F3')
        },
        {
            tag: 'F4-complete-lies', what: '覆盖面把缺口报成完整（等 0 条缺）',
            target: 'floor', src: mk(flSrc,
                'out.complete = out.missing.length === 0;',
                'out.complete = true;',
                'F4')
        },
        {
            tag: 'F5-version-caving', what: '版本不符的旧附注被当新结构读',
            target: 'floor', src: mk(flSrc,
                'if (Number(rec.v) !== EXTRA_VERSION)',
                'if (false)',
                'F5')
        },
        {
            tag: 'E1-orphan-anchor', what: '显式置空只清年龄、留下孤儿锚点（I2 致命形态）',
            target: 'age', src: mk(aaSrc,
                '            delete target[ANCHOR_FIELD];\n            out.changed = !!had;',
                '            out.changed = !!had;',
                'E1')
        },
        {
            tag: 'E2-fake-anchor', what: '取不到锚点时留着旧锚点（新年龄 + 旧锚点 = 假锚点）',
            target: 'age', src: mk(aaSrc,
                '        else delete target[ANCHOR_FIELD];       // 取不到锚点：不写假的（也不留旧的）',
                '        else { /* 破坏：留着旧锚点 */ }',
                'E2')
        },
        {
            tag: 'E3-carry-broken', what: '守恒断掉（同值不再带走旧锚点 ⇒ 重放即冻龄）',
            target: 'age', src: mk(aaSrc,
                '        if ((!hasPatch || sameAsPrev) && v[ANCHOR_FIELD]) {',
                '        if (false) {',
                'E3')
        },
        {
            tag: 'G1-clock-no-delegate', what: '拆掉时钟的日期解析委托（估算态回到不可达）',
            target: 'index', src: mk(idxSrc,
                "            try { return new RelativeTimeHelper().parseStoryDate(dateStr); } catch (e) { errLog(e, 'GameClock.parseStoryDate'); return null; }",
                '            return null;',
                'G1')
        },
        {
            tag: 'H1-slash-path-lie', what: '斜杠走了旧路径却自称走了新路径（调用方按命名参数写会失败）',
            target: 'pi', src: mk(piSrc,
                "            report.slash.state = 'ready'; report.slash.path = 'addCommandObject';",
                "            report.slash.state = 'ready'; report.slash.path = 'addCommand';",
                'H1')
        },
        {
            tag: 'H2-no-idempotent', what: '拆掉幂等闸（重复 init 会二次注册）',
            target: 'pi', src: mk(piSrc,
                'if (register._done) {',
                'if (false) {',
                'H2')
        },
        {
            tag: 'H3-param-lie', what: '参数化宏宣称可用但其实没注册（调用方按 {{lonshaGet::x}} 写会取空）',
            target: 'pi', src: mk(piSrc,
                'report.macro.parameterized = true;',
                'report.macro.parameterized = false;',
                'H3')
        }
    ];
}
test('【I1】负控制·原版对照：全部判据在真源码上必须干净', () => {
    const f = judgeFloor(FL);
    assert.equal(f.threeStates, true, '原版：归属三态可分');
    assert.equal(f.mergeKept, true, '原版：同页二次落笔合并');
    assert.equal(f.noInherit, true, '原版：翻页落笔不继承');
    assert.equal(f.coverageHonest, true, '原版：覆盖度有数有名');
    assert.equal(f.bounded, true, '原版：附注有界');
    assert.equal(f.noThrow, true, '原版：怪异输入不外抛');
    const a = judgeAge(AA);
    assert.equal(a.threeStates, true, '原版：年龄三态可分');
    assert.equal(a.estLongYears, true, '原版：跨年推算可行');
    assert.equal(a.noGuess, true, '原版：算不出不猜');
    assert.equal(a.pairCleared, true, '原版：成对清除');
    assert.equal(a.untouched, true, '原版：未提供不动');
    assert.equal(a.noFakeAnchor, true, '原版：取不到锚点时不写假的');
    assert.equal(a.noFakeEstimate, true, '原版：不足一年不上「约」');
    assert.equal(a.conserved, true, '原版：锚点守恒');
    assert.equal(a.orphanCaught, true, '原版：孤儿锚点致命在案');
    assert.equal(a.noThrow, true, '原版：畸形输入不外抛');
    const c = judgeClock(idxSrc);
    assert.equal(c.clockParses, true, '原版：时钟自己能解析日期');
    assert.equal(c.liveLongYears, true, '原版：生产路径上 estimated 真能达成');
    assert.equal(c.noFakeNumber, true, '原版：算不出不给数字');
    assert.equal(c.wired, true, '原版：状态层取得到时钟助手');
    assert.equal(c.injected, true, '原版：引擎把时钟交给状态层');
});
test('【I2】★ 负控制·普通项：破坏逐项现形，且互不掩护', () => {
    const seen = {};
    for (const v of brokenCopies()) {
        if (v.target === 'floor') seen[v.tag] = judgeFloor(loadModuleFrom(v.src));
        else if (v.target === 'age') seen[v.tag] = judgeAge(loadModuleFrom(v.src));
    }
    assert.equal(seen['F1-absent-as-present'].threeStates, false, 'F1 破坏后：三态塌（无账被报成有账）');
    assert.equal(seen['F1-absent-as-present'].mergeKept, true, 'F1 不连坐合并语义');
    assert.equal(seen['F2-ignorefp-in-merge'].noInherit, false, '★ F2 破坏后：旧页字段被继承到新页（串账）');
    assert.equal(seen['F2-ignorefp-in-merge'].threeStates, true, 'F2 不连坐三态');
    assert.equal(seen['F3-fp-ignored'].threeStates, false, 'F3 破坏后：翻页后旧账仍被认账');
    assert.equal(seen['F3-fp-ignored'].noInherit, false, 'F3 连带串账（同一处判据的两个观测面）');
    assert.equal(seen['F4-complete-lies'].coverageHonest, false, 'F4 破坏后：缺口被报成完整');
    assert.equal(seen['F4-complete-lies'].threeStates, true, 'F4 不连坐三态');
    assert.equal(seen['F5-version-caving'].versionHonest, false, '★ F5 破坏后：版本让路失效（旧附注被当新结构交出）');
    assert.equal(seen['F5-version-caving'].threeStates, true, 'F5 不连坐归属三态（版本闸只管版本）');
    assert.equal(seen['F5-version-caving'].bounded, true, 'F5 不连坐有界性');
    assert.equal(seen['E1-orphan-anchor'].pairCleared, false, '★ E1 破坏后：置空只清年龄（孤儿锚点）');
    assert.equal(seen['E1-orphan-anchor'].noThrow, true, 'E1 不连坐不抛');
    assert.equal(seen['E2-fake-anchor'].noFakeAnchor, false, '★ E2 破坏后：新年龄配旧锚点（假锚点）');
    assert.equal(seen['E2-fake-anchor'].pairCleared, true, 'E2 不连坐成对清除');
    assert.equal(seen['E3-carry-broken'].conserved, false, '★ E3 破坏后：守恒断（重放即冻龄）');
    assert.equal(seen['E3-carry-broken'].pairCleared, true, 'E3 不连坐成对清除');
    // 原版判据不得恒真：F4 破坏点不影响归属三态（互不掩护的反向自证）
    assert.equal(seen['F4-complete-lies'].noInherit, true, 'F4 不连坐串账判据');
});
test('【I3】★ 负控制·接线项 + fresh 闸门：各自现形', async () => {
    const cases = brokenCopies();
    const g1 = cases.find(v => v.tag === 'G1-clock-no-delegate');
    const kReal = judgeClock(idxSrc);
    assert.equal(kReal.clockParses, true, '原版：时钟解析（此判据非恒真）');
    assert.equal(kReal.liveLongYears, true, '原版：估计态可达（此判据非恒真）');
    const kG1 = judgeClock(g1.src);
    assert.equal(kG1.clockParses, false, '★ G1 破坏后：时钟不再解析日期');
    assert.equal(kG1.liveLongYears, false, '★ G1 破坏后：生产路径上 estimated 不再达成（三态塌两态）');
    assert.equal(kG1.injected, true, 'G1 只动委托，不连坐接线');
    // ★ fresh 闸门：三处真破坏（判据不认 opts.fresh / fresh 标志被无视 / 拒笔后又照写）必须现形
    const jReal = judgeFresh(idxSrc);
    assert.equal(jReal.freshRejects, true, '原版：fresh 拒笔生效（此判据非恒真）');
    assert.equal(jReal.statusWhenStale, 'rejected', '原版：陈旧落笔的归因是 rejected');
    assert.equal(jReal.statusWhenSame, 'ok', '原版：相符时归因是 ok（与 rejected 不同形）');
    // ① 判据不认 opts.fresh（调用点写法失效）
    const f1 = judgeFresh(idxSrc.replace(
        '                if (record && (record.fresh || opts.fresh)) {',
        '                if (record && record.fresh) {'));
    assert.equal(f1.freshRejects, false, '★ 判据不认 opts.fresh 后：摘要落笔的 fresh 失去效力');
    assert.equal(f1.missingAttributed, true, '该破坏不连坐缺席归因');
    // ② fresh 标志被无视（连 record.fresh 也不认）
    const f2 = judgeFresh(idxSrc.replace(
        '                if (record && (record.fresh || opts.fresh)) {',
        '                if (false) {'));
    assert.equal(f2.freshRejects, false, '★ 陈旧校验被整段拆掉后：旧页账照写到新页上');
    assert.equal(f2.okWhenSame, true, '拆掉校验不连坐「正常落笔」（说明原判据测的是校验本身，不是恒真）');
    // ③ 拒笔归因与正常归因塌成一态（伪造「落笔成功」）
    const f3 = judgeFresh(idxSrc.replace(
        "                        this._floorLedgerStamp = { status: 'rejected', reason: 'stale', floor: _floor, at: Date.now() };",
        "                        this._floorLedgerStamp = { status: 'ok', floor: _floor, at: Date.now() };"));
    assert.equal(f3.statusWhenStale, 'ok', '★ 陈旧落笔被伪报成 ok——归因塌成一态');
    assert.equal(f3.statusWhenSame, 'ok', '该破坏下两态同形（正是本版要封的口）');
    const h1 = cases.find(v => v.tag === 'H1-slash-path-lie');
    const j1 = await judgePublic(h1.src);
    assert.equal(j1.pathsLabelled, false, '★ H1 破坏后：注册路径被虚报');
    assert.equal(j1.allReady, true, 'H1 只动 path 标注，不连坐成败');
    const h2 = cases.find(v => v.tag === 'H2-no-idempotent');
    const j2 = await judgePublic(h2.src);
    assert.equal(j2.idempotent, false, '★ H2 破坏后：重复注册会二次加命令');
    assert.equal(j2.singleImpl, true, 'H2 不连坐单一实现');
    const h3 = cases.find(v => v.tag === 'H3-param-lie');
    const j3 = await judgePublic(h3.src);
    assert.equal(j3.allReady, true, 'H3 只动 parameterized 标注');
});
test('【I4】工具两向自证：锚点不存在或不唯一必须抛；判据纯度（锚点字面量只在破坏表出现）', () => {
    // ① 假锚点必须命中 0（否则「破坏」是假的）
    assert.equal(flSrc.split('THIS_ANCHOR_DOES_NOT_EXIST').length - 1, 0);
    assert.equal(aaSrc.split('THIS_ANCHOR_DOES_NOT_EXIST').length - 1, 0);
    // ② 多命中必须抛（用真出现多次的串自证工具会拦下）
    assert.throws(() => {
        const h = flSrc.split('return null;').length - 1;
        if (h !== 1) throw new Error('锚点命中 ' + h + ' 次');
    }, /锚点命中 \d+ 次/, '多命中必须抛');
    // ③ 判据纯度：破坏表里的锚点字面量在判据函数中不得复述
    const self = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const judgePart = self.slice(self.indexOf('function judgeFloor'), self.indexOf('function brokenCopies'));
    for (const frag of [
        "why: 'absent' };",
        'const prev = read(msg);',
        'rec.fp !== fp',
        'out.complete = out.missing.length === 0;',
        'Number(rec.v) !== EXTRA_VERSION',
        'delete target[AGE_FIELD];',
        'delete target[ANCHOR_FIELD];',
        'sameAsPrev) && v[ANCHOR_FIELD]',
        "GameClock.parseStoryDate'); return null; }",
        "report.slash.path = 'addCommandObject';",
        'register._done'
    ]) {
        assert.ok(judgePart.indexOf(frag) < 0, '判据函数不得复述破坏锚点字面量：' + frag);
    }
    // ④ 破坏副本确实与原版不同（防「破坏打空」造成假绿）
    const ORIG = { floor: flSrc, age: aaSrc, index: idxSrc, pi: piSrc };
    const seenTags = new Set();
    for (const v of brokenCopies()) {
        assert.ok(!seenTags.has(v.tag), '破坏 tag 不得重复：' + v.tag);
        seenTags.add(v.tag);
        assert.notEqual(v.src, ORIG[v.target], v.tag + ' 必须真的改了源码');
        assert.ok(v.src.length > 0);
        assert.ok(/[^\s]/.test(v.what), v.tag + ' 必须说明破坏意图');
    }
    assert.equal(seenTags.size, 12, '破坏组数（12 组：floor 5 / age 3 / index 1 / pi 3）');
});

// ══════════ J 发布卫生 ══════════
test('【J1】版本三源一致且不低于 v3.186.0', () => {
    const v = (idxSrc.match(/const VERSION = '([^']+)'/) || [])[1];
    assert.ok(v, 'index.js VERSION 在场');
    assert.ok(vnum(v) >= vnum('3.193.0'), `index.js 版本 ${v} >= 3.186.0`);
    assert.equal(manifest.version, v, `manifest(${manifest.version}) 与 index.js(${v}) 漂移`);
    assert.equal(pkg.version, v, `package.json(${pkg.version}) 与 index.js(${v}) 漂移`);
});
test('【J2】三个新模块已注册且顺序满足依赖（年龄锚点先于楼层账、对外口最后）', () => {
    const js = manifest.extra_js || [];
    for (const f of ['floor-ledger.js', 'age-anchor.js', 'public-interface.js']) {
        assert.ok(js.includes(f), '新模块必须进 manifest.extra_js：' + f);
    }
    assert.ok(js.indexOf('public-interface.js') > js.indexOf('age-anchor.js'), '对外口排在锚点之后');
    // 三个全局符号都必须被运行时真取（注册了却无人取 ⇒ 静默缺席）
    assert.ok(/window\.LonShaFloorLedger/.test(idxSrc), 'index.js 须取 window.LonShaFloorLedger');
    assert.ok(/window\.LonShaAgeAnchor/.test(idxSrc), 'index.js 须取 window.LonShaAgeAnchor');
    assert.ok(/window\.LonShaPublicInterface/.test(idxSrc), 'index.js 须取 window.LonShaPublicInterface');
});
test('【J3】接线真落地：落笔 / 摘要落笔 / 覆盖度 / 诊断行 / 携带 / 对外注册（防「声明了却零消费」）', () => {
    assert.ok(/this\._stampFloorLedger\(message, \{ floor: floorNow, items: _lv\.items \}\)/.test(idxSrc), '物品落笔消费点');
    assert.ok(/\{ fresh: true \}\)/.test(idxSrc), '摘要落笔（fresh）消费点');
    assert.ok(/_floorLedgerCoverage\(\)\s*\{/.test(idxSrc), '覆盖度入口');
    assert.ok(/\['楼层落笔', line/.test(idxSrc), '诊断面楼层落笔行');
    assert.ok(/\['年龄锚点', /.test(idxSrc), '诊断面年龄锚点行');
    assert.ok(/type: 'anchor-only'/.test(idxSrc) || /' ⚠️ 算不出（只给原文与锚点）'/.test(idxSrc), 'anchor-only 是主动报警态');
    assert.ok(/ageAnchors: this\.status\?\.exportAgeAnchors\?\.\(\) \|\| \{\}/.test(idxSrc), '携带写侧产出 ageAnchors');
    assert.ok(/pack\.ageAnchors/.test(idxSrc), '携带读侧承接 ageAnchors');
    assert.ok(/'ageAnchors',/.test(idxSrc), 'CARRYOVER_CONTRACT_KEYS 含 ageAnchors');
    assert.ok(/this\._registerPublicInterface\(\);/.test(idxSrc), '对外注册调用点在位（否则三入口永不注册）');
    assert.ok(/age: this\.status\.ageReading\(r\.name, _ageOpts\)/.test(idxSrc), '召回条目年龄读数消费点');
});
test('【J4】只读边界：三个新模块不出现任何写侧入口', () => {
    for (const [name, src] of [['floor-ledger', flSrc], ['age-anchor', aaSrc], ['public-interface', piSrc]]) {
        for (const bad of ['publish(', 'invalidate(', 'setSettings(', 'fs.writeFileSync']) {
            assert.ok(src.indexOf(bad) < 0, name + ' 不得调用写侧入口 ' + bad);
        }
    }
    // 落笔模块只写**自己那一个键**（不碰 msg.mes / 不写全局账）
    assert.ok(!/\.(mes|swipes)\s*=[^=]/.test(flSrc), '楼层附注不得改正文');
    assert.ok(/ex\[EXTRA_KEY\] = payload;/.test(flSrc), '只写自己那一个键');
});
test('【J5】CHANGELOG 顶节为本版，且记录三面缺陷现场', () => {
    const top = (changelog.match(/^## (v[0-9.]+)/m) || [])[1];
    assert.ok(top, 'CHANGELOG 有版本段');
    assert.ok(vnum(top.replace('v', '')) >= vnum('3.193.0'), `顶节 ${top} 须 >= v3.186.0`);
    assert.ok(/归属性|归属/.test(changelog), '记录了「账落笔之后没有归属」这一现场');
    assert.ok(/算不出/.test(changelog), '记录了「年龄算不出就回退成一个数字」这一现场');
    assert.ok(/只读/.test(changelog), '记录了只读边界口径');
    assert.ok(/查账口/.test(changelog), '记录了「查账口可以多开，改账口不开」');
});
test('【J6】三个模块文件自身结构自洽（导出面 + 全局挂载 + 版本标记）', () => {
    for (const [name, src, sym] of [['floor-ledger.js', flSrc, 'LonShaFloorLedger'], ['age-anchor.js', aaSrc, 'LonShaAgeAnchor'], ['public-interface.js', piSrc, 'LonShaPublicInterface']]) {
        assert.ok(/module\.exports\s*=\s*api;/.test(src), name + ' 必须有 CJS 导出面');
        assert.ok(new RegExp('global\\.' + sym + ' = Object\\.freeze\\(api\\)').test(src), name + ' 必须挂全局符号');
        assert.ok(/^\/\* =+/.test(src), name + ' 必须有模块头（说明缺口与边界）');
    }
    assert.ok(/EXTRA_KEY = 'lonsha_ledger'/.test(flSrc), '附注键与宿主两端约定一致');
    assert.ok(/EXTRA_VERSION = 1/.test(flSrc), '附注结构版本在位（不兼容改结构必须升）');
    assert.ok(/AGE_FIELD = 'age'/.test(aaSrc) && /ANCHOR_FIELD = 'ageAnchorTime'/.test(aaSrc), '主角与角色共用同一对字段名');
    assert.ok(/DAYS_PER_YEAR = 365/.test(aaSrc), '一年 365 天的口径在位');
    assert.ok(/NS = 'lonsha'/.test(piSrc) && /API_VERSION = 1/.test(piSrc), '对外命名空间与接口版本在位');
});
