// tests/v3240_ledger_null_is_not_zero.test.mjs — 账本 floor 一族：「没给」不是「给了 0」（v3.240.0）
//
//   主题：把 R4-E（v3.239.0）**已声明收窄**的那一半做完 —— 账本实体契约 `finite`。
//
//   修前实测（本版逐条坐实，不是推演）：
//     `ledger-entity.js:finite` 写的是 `Number.isFinite(Number(v)) ? Math.floor(Number(v)) : null`。
//     这条判据在 `v === null` / `''` / `[]` / `false` 时**恒真**（`Number(null) === 0` 等等，
//     且都是有限数），而 `v === undefined` 走 NaN 归 null。于是同一个语义「楼层未知」
//     有两个形态：undefined ⇒ null，null / '' ⇒ **0** —— 而 **0 在本插件是合法楼层**。
//
//     本仓同一根因已修过三次：O-1（v3.223.0）、R3-D（v3.221.0）都只修单点；
//     R4-E（v3.239.0）修到 `snapshot-checkpoint.js` 与 `index.js` 两侧分界口，
//     并在套件 E1 里**显式声明**范围收窄：「本仓其余模块（memory-entropy / evidence 等）
//     的历史判据不在本版口径内」。本套件治的就是那批「其余模块」里最上游的一处：
//     九本账的**共享契约** —— floor 一族读写的根全在这里。
//
//   修前后果（逐条有判据，见 D / E 组）：
//     ① 四本账（seed / secret / parallel / recall-echo）的写入守卫
//        `const f = finite(floor); if (f == null) return reject(state, 'missing-floor')`
//        —— 不传 floor 时不再拒绝，反而拿「floor 0」去比较已回收条目 ⇒ **静默横扫**；
//     ② 九本账 `copyItem` 的 `floor: finite(item.floor)` 把「楼层未知」写成 0
//        （`evidence-workbench.js` 的注释早就如实记下这一条，并写明属上游单独一版的事）；
//     ③ `fact-version` 的 `copyEvent.at` 同形（时间戳 null 被写成 0 = 1970）。
//
//   本版落三件事：
//     ① `finite` 本体改为「先分『没给』」：null / undefined / 空串 / 空白串 / 布尔 / 数组 ⇒ null；
//        有限数（含 0、负数、数字串 '0'）⇒ 该数；其余（NaN / 对象 / 非数字串 / ±Infinity）⇒ null；
//     ② 新增 `finiteFloor` / `numOrNull`（**同判据别名**，一行转发，不做第二份实现），
//        九本账的 floor 一族全部改走它 —— 字段同名不同域（承诺账的 floor ≠ 秘密账的 floor）
//        时，名字相同才不必再比对「这里的 finite 是不是那个」；
//     ③ 三本未收编的账（recall-echo / echo-ledger / repair-loop）收进契约：
//        它们此前各自自带一份 `text` + `finite` 拷贝（那份 `finite` 正是本形态）。
//
//   【本套件首跑：7 项红，逐条归因**全部为判据自身缺陷**（留痕，防下次再写同样的话）】
//     ① A1：`-0` 走到 `assert.equal` 被 `Object.is(-0, 0) === false` 判红（数字字面量改用 `===`）；
//     ② A1/B2：把 `0.5` 放进「真给了数」样本 —— 契约是**楼层口径**（向下取整），样本自身取错；
//     ③ D2：`seed.sweep` 是**两参**签名，首跑只传了 state ⇒ 恒 `missing-floor`（写判据前没读签名）；
//     ④ E1：宿主形状写成 `_seedState`（F-2 以前的老形状），实际是 `h.worldProg.seedLedger`
//        ⇒ 账本 `state: 'absent'`，下方 floor 断言直接 TypeError；
//     ⑤ G1：负控制的正则把门禁的 NEEDS 表切出 `SyntaxError` —— 破坏必须留一份**可运行**的脚本；
//     ⑥ H1：版本尚未抬升（3.239.0 < 3.240.0）—— 这条是**预期**的，抬版后自动转绿。
//   注：本套件刻意不数 `finite` 的**调用点总数**（那是现场另一条全仓普查的活）。
//
//   ★ 本仓纪律（写进判据）：
//     · **「没给」与「给了 0」必须不同形** —— 但不得「一刀切把 0 也吞了」（真 0 是合法楼层）；
//     · **判据在保护已被设计淘汰的状态** —— v3207 第 2/5 组与 v3234 E1 曾把旧口径当不变量钉住
//       （「现行为忠实保留」「这是它自己的口径，本版不动它」），本版逐条交棒；
//     · **负控制须打在真源码上** —— 破坏落真文件文本，判据在破坏副本上重跑（本仓三种假绿：
//       对原文件断言 / 破坏写死成常量 / 破坏把判据自己废掉）；
//     · **门禁同样要能吃自己的药** —— A 组与 B 组必须自证「扫描面真在扫」（防空对空）。
//
//   覆盖：
//     A 分界口本体（真源真跑，四类输入逐条可证；0 与 null 不同形）
//     B 同判据别名（finiteFloor / numOrNull 与 finite 逐输入等价；与 snapshot-checkpoint 侧同判据）
//     C 九本账收编面（无本地 finite/text 拷贝；floor 一族按名点名）
//     D 四类错读数逐条钉住（floor / updatedFloor / 守卫 / 段与事件 at）
//     E 消费面：证据工作台从「不传 floor 的账」读到 null 而非 0
//     F 负控制（真源码破坏 → 破坏副本 → 同款判据必须转红）
//     G 门禁：账本契约扫描器真跑（含九账委派与 finiteFloor 面）
//     H 版本锚（三源同源）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ledgerLevelConsumers, RUNTIME_DEPS } from './_fixture_sync.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const req = createRequire(import.meta.url);
const LE = req(path.join(ROOT, 'ledger-entity.js'));
const CP = req(path.join(ROOT, 'snapshot-checkpoint.js'));
const EC = req(path.join(ROOT, 'event-completeness.js'));

const LE_SRC = read('ledger-entity.js');
const SCAN_SRC = read('tests/audit/scan_ledger_contract.mjs');

/** 九本账 —— [v3.246.0] 与 `scan_ledger_contract.mjs` / `v3207` **同源**：从唯一真源
 *   `tests/_fixture_sync.mjs` 在磁盘面上派生（判据 = 取库块在不在），不再手抄。
 *   本套件按 fileName: module 逐本真调，故这里要的是「仓根哪些 .js 真在跑契约」。 */
const BOOK_FILES = ledgerLevelConsumers(ROOT, fs.readdirSync(ROOT).filter((f) => f.endsWith('.js')));

/* ══════════ A 分界口本体 ══════════ */

/** 三态表（与 R4-E 的 v3239 同口径，便于两侧交叉核对）。 */
const NOT_GIVEN = [null, undefined, '', '   ', true, false];
const IS_A_NUMBER = [[0, 0], [1, 1], [-3, -3], ['0', 0], ['12', 12], ['  4 ', 4]];
/* 契约 `finite` 是**楼层口径**（向下取整）：0.5 / 0.9 这类小数属于「模块侧不取整、
 *   契约侧取整」的**刻意差异**，不能当「两处同判据」的样本（见 B2 的钉法）。
 *   [v3.240.0] 首跑时 0.5 就放在本表里 ⇒ A1 直接红：那是判据自身的缺陷，不是实现的。 */
const NOT_A_NUMBER = [NaN, {}, [], [1], ['0'], 'abc', '第 3 楼', Infinity, -Infinity, () => 1];
/* 别名（finiteFloor / numOrNull）在契约里是**一行转发**，故与 finite 逐字等价（含小数与 -0）。 */
const IS_A_NUMBER_ALIAS = IS_A_NUMBER.concat([[0.5, 0], [0.9, 0], [-0, 0]]);

test('A1. ★★★★ 契约分界口 finite：「没给」与「给了 0」必须不同形', () => {
    assert.equal(typeof LE.finite, 'function', '契约必须导出 finite');
    for (const v of NOT_GIVEN) {
        assert.equal(LE.finite(v), null, '「没给」必须是 null：' + JSON.stringify(v));
    }
    for (const [v, want] of IS_A_NUMBER) {
        assert.equal(LE.finite(v), want, '真给了数就必须留数（楼层口径向下取整）：' + JSON.stringify(v));
    }
    /* `-0` 与「全是空白的串」单独钉：前者 `-0 === 0` 为真而 `Object.is(-0, 0)` 为假
     *   （数字字面量走 strict 的 assert.equal 会被判红，首跑踩到）；后者是对本表里 `'   '`
     *   的同类补强 —— 制表符串同样算「没给」。 */
    assert.ok(LE.finite(-0) === 0, '-0 仍是 0（第 0 楼）');
    assert.equal(LE.finite('\t'), null, '制表符串也是「没给」');
    for (const v of NOT_A_NUMBER) {
        assert.equal(LE.finite(v), null, '给了但不是数 ⇒ null（不抛、不猜）：' + String(v));
    }
    /* 本版要修的病就在这一行：0 与 null 必须是两个不同的东西。 */
    assert.notEqual(LE.finite(0), LE.finite(null), '★ 0（第 0 楼）与 null（楼层未知）不得同形');
    /* 修前形态的反例逐条列出，防「改回去也看不出来」： */
    assert.equal(Number(null), 0, '（根因在现场：Number(null) === 0 —— 这是旧判据恒真的原因）');
    assert.equal(Number(''), 0, '（同上：Number(\'\') === 0）');
    assert.equal(Number([]), 0, '（同上：Number([]) === 0）');
});

test('A2. ★★★ 判据面自证：真源源码里不再有「先 Number() 再判有限」的裸形态', () => {
    /* 防「空对空」：不是去数一个不存在的形态，而是先在**修前的真实文本**上确认这个形态
     *   真的出现过 —— 反过来证明本条扫描面有效（修前命中、修后归零）。 */
    /* 【v3.242.0 修订 · 同一个坑第二次】本条此前写成「数**上一版实现的那一行**字面量恰好 1 次」
     *   （`return Number.isFinite(n) ? Math.floor(n) : null;`）—— 这是把判据钉在**实现的文本指纹**上。
     *   v3.242.0 为 `-0` 归一重写了这一行（`return f === 0 ? 0 : f;`），本判据当场上红：
     *   红的不是缺陷，是**判据钉错了面**（首版缺陷是 `includes` 恒真，第二次是文本指纹脆弱）。
     *   修法：改钉**行为** —— 检测器两向自证（缺陷样本必须命中、真源码必须不命中），
     *   从此不引用任何一行实现的字面文本。 */
    const NAKED = [
        'function finite(value) {',
        '    const n = Number(value);',
        '    return Number.isFinite(n) ? Math.floor(n) : null;',
        '}',
    ].join('\n');
    const NAKED_RE = /function\s+finite\s*\([^)]*\)\s*\{\s*const\s+n\s*=\s*Number\(/;
    assert.equal(NAKED_RE.test(NAKED), true,
        '扫描面自证：裸形态样本必须被本正则命中（不命中 ⇒ 这一条是空对空）');
    assert.equal(NAKED_RE.test(LE_SRC), false,
        '★ finite 不得再直接 Number(v) 起步（必须先挡「没给」与「非数值」）');
    assert.match(LE_SRC, /if \(value === null \|\| value === undefined\) return null;/, '「没给」前置门在场');
    assert.match(LE_SRC, /if \(t === 'boolean' \|\| t === 'object' \|\| t === 'function'\) return null;/, '非数值一类前置门在场');
});

test('A3. ★★ 真给了 0 必须留 0（不得为了修这条把真楼层也吞掉）', () => {
    assert.ok(LE.finite(0) === 0, '数字 0');
    assert.ok(LE.finite('0') === 0, '数字串 0');
    assert.ok(LE.finite(-0) === 0, '-0 仍是 0（`-0 === 0` 为真；走 strict equal 会被 Object.is 判红）');
    assert.equal(LE.finite(0.9), 0, '向下取整（楼层口径：0.9 ⇒ 第 0 楼）');
});

/* ══════════ B 同判据别名 ══════════ */

test('B1. ★★★ 两个别名与各自族的原语逐输入等价（不是第二份实现）', () => {
    assert.equal(typeof LE.finiteFloor, 'function', '契约导出 finiteFloor');
    assert.equal(typeof LE.numOrNull, 'function', '契约导出 numOrNull');
    const all = NOT_GIVEN.concat(IS_A_NUMBER_ALIAS.map((p) => p[0])).concat(NOT_A_NUMBER);
    for (const v of all) {
        assert.equal(LE.finiteFloor(v), LE.finite(v), 'finiteFloor 等价（**楼层**族：小数与 -0 都取整）：' + String(v));
        /* 【v3.243.0 修订 · 本条原文是错的】原句写 `LE.numOrNull(v) === LE.finite(v)`，
         *   等价于断言「numOrNull 与 finite 同判据」。那正是 v3.240.0 的错：
         *   numOrNull 管的是时间戳 / 字节 / 计数 / 版本号，**取整是丢信息**。
         *   v3.243.0 把它归位「原样数」族（对齐新增的 finiteNum，与全仓七处既有
         *   `Number.isFinite(n) ? n : null` 判据逐输入等价）。故本行改为对齐 finiteNum。 */
        assert.equal(LE.numOrNull(v), LE.finiteNum(v), 'numOrNull 等价（**原样数**族：不取整）：' + String(v));
    }
    /* 两族的分野必须**可观测** —— 否则「分开」只是一句说法（本组首跑就是被这条逼出来的）。 */
    assert.equal(LE.finite(0.5), 0, '楼层族：0.5 ⇒ 第 0 楼');
    assert.equal(LE.finiteNum(0.5), 0.5, '原样族：0.5 ⇒ 0.5（不取整）');
    assert.notEqual(LE.finite(0.5), LE.finiteNum(0.5), '两族对小数必须给出不同答案');
    /* 三个名字不得各自为政：源码面钉住它们是**转发**，不是三份判据。 */
    const body = (name, target) => {
        const m = new RegExp('function\\s+' + name + '\\s*\\(value\\)\\s*\\{\\s*return\\s+' + target
            + '\\(value\\);\\s*\\}').exec(LE_SRC);
        return !!m;
    };
    assert.ok(body('finiteFloor', 'finite'), 'finiteFloor 必须一行转发 finite（不得复制判据）');
    assert.ok(body('numOrNull', 'finiteNum'), 'numOrNull 必须一行转发 finiteNum（v3.243.0：归位原样数族）');
});

test('B2. ★★★ 与 R4-E 的模块侧分界口逐输入同判据（两处不是两套口径）', () => {
    assert.equal(typeof CP.numOrNull, 'function', 'snapshot-checkpoint 的 numOrNull 在场');
    /* [v3.240.0] 首跑在 0.5 上红 —— **判据自身的样本取错**，不是实现分歧：
     *   契约 `finite` 是楼层口径（`Math.floor`），而模块侧 `numOrNull` 刻意**不取整**
     *   （它同时用来判 `schemaVersion` / 时间戳这类非楼层数）。故「两处同判据」只在
     *   **整数样本**上成立；小数处的差异是刻意留下的，本判据把这一点也钉住。 */
    const ints = NOT_GIVEN.concat(IS_A_NUMBER.map((p) => p[0])).concat(NOT_A_NUMBER);
    for (const v of ints) {
        assert.equal(CP.numOrNull(v), LE.finite(v), '两处同判据（整数样本逐输入）：' + String(v));
    }
    assert.equal(CP.numOrNull(0.5), 0.5, '模块侧不取整（它还判 schemaVersion / 时间戳这类非楼层数）');
    assert.equal(LE.finite(0.5), 0, '契约侧取整（它是楼层口径）');
    assert.notEqual(CP.numOrNull(0.5), LE.finite(0.5), '★ 这处差异是**刻意**的：两域不同，不得强行抹平');
});

test('B3. ★★ 契约与 R4-E 的 mvp 形态一致：两处都拒绝布尔（true 与 1 不是一回事）', () => {
    assert.equal(LE.finite(true), null, 'true 不是 1');
    assert.equal(LE.finite(false), null, 'false 不是 0');
    assert.equal(CP.numOrNull(true), null, '模块侧同判据');
    assert.equal(CP.numOrNull(false), null, '模块侧同判据');
});

/* ══════════ C 九本账收编面 ══════════ */

test('C1. ★★★★ 九本账不得再有本地 finite / text 拷贝（单一真源）', () => {
    const bad = [];
    for (const f of BOOK_FILES) {
        const src = read(f);
        if (/function\s+finite\s*\(/.test(src)) bad.push(f + ' 本地 function finite(');
        if (/function\s+text\s*\(/.test(src)) bad.push(f + ' 本地 function text(');
        if (!src.includes("const LE = (typeof window !== 'undefined' && window.LonShaLedgerEntity)")) {
            bad.push(f + ' 缺取库块（未接契约真源）');
        }
    }
    assert.deepEqual(bad, [], '九本账必须全部委派契约：\n' + bad.join('\n'));
    /* 自证扫描面真在扫（防空对空）：这九本都必须真的在场。 */
    assert.equal(BOOK_FILES.length, 9, '清单是九本（派生自真源，非手抄）');
    assert.ok(read('tests/_fixture_sync.mjs').includes('export function ledgerLevelConsumers'),
        '名册须由唯一真源派生（不得退回手抄）');
    for (const f of BOOK_FILES) assert.equal(fs.existsSync(path.join(ROOT, f)), true, '账本在场：' + f);
});

test('C2. ★★★★ 九本账的 floor 一族必须走按名点名的 finiteFloor', () => {
    const bad = [];
    for (const f of BOOK_FILES) {
        const src = read(f);
        const m = src.match(/\b\w*[Ff]loor\b\s*:\s*(?!finiteFloor\b)finite\(/g) || [];
        if (m.length) bad.push(f + ' → ' + m.join(' / '));
        /* 分页读数（finite(limit) 之类）是合法用法，不得被误伤 —— 自证这一点。 */
    }
    assert.deepEqual(bad, [], 'floor 一族必须走 finiteFloor：\n' + bad.join('\n'));
    /* 反向自证：九本账里确实**存在** finiteFloor 使用（否则本判据是空集合上的判据）。 */
    let used = 0;
    for (const f of BOOK_FILES) used += (read(f).match(/finiteFloor\(/g) || []).length;
    assert.ok(used >= 20, 'finiteFloor 使用点必须 >= 20（实测 ' + used + '）—— 太少说明扫描面掉了');
    /* 合法用法仍在（本条证明判据不是「凡 finite( 皆罪」）。 */
    assert.ok(/finite\(limit\)/.test(read('seed-ledger.js')), '分页读数的 finite(limit) 是合法用法，仍在');
});

test('C3. ★★ 契约新增面已登记进门禁（R5）与门禁账本清单（BOBS/MIN_BOOKS）', () => {
    /* 尾巴上跟 `,` 而不是 `]`：白名单会长（v3.242.0 追加了 `FINITE_DOMAINS`），
     *   判据钉在「三个新名在场」，不该随白名单增长而误伤。 */
    assert.match(SCAN_SRC, /'finite', 'finiteFloor', 'numOrNull',/, 'R5 导出面已含三个新名');
    for (const f of BOOK_FILES) assert.ok(SCAN_SRC.includes("'" + f + "'"), '门禁清单含 ' + f);
    assert.match(SCAN_SRC, /const MIN_BOOKS = FIXTURE_MODE \? 1 : 9;/, '下限同步为 9');
});

/* ══════════ D 四类错读数逐条钉住 ══════════ */

test('D1. ★★★★ 伏笔账：不传 floor ⇒ floor / updatedFloor 必须是 null（修前是 0）', () => {
    const seed = req(path.join(ROOT, 'seed-ledger.js'));
    const st = seed.plant(null, { hook: '没给楼层的伏笔', eventKey: 'p-null' }).state;
    assert.equal(st.items[0].floor, null, '★ 没给楼层 ⇒ floor 是 null（修前 0）');
    assert.equal(st.items[0].updatedFloor, null, '★ 没给楼层 ⇒ updatedFloor 是 null（修前 0）');
    /* 真给了 0 仍按第 0 楼算（两态不得同形）。 */
    const st0 = seed.plant(null, { hook: '第 0 楼的伏笔', floor: 0, eventKey: 'p0' }).state;
    assert.equal(st0.items[0].floor, 0, '★ 真第 0 楼 ⇒ 0');
    assert.notEqual(st0.items[0].floor, st.items[0].floor, '两态不得同形');
});

test('D2. ★★★★ 四本账的写入守卫：不传 floor 必须**拒绝**（修前被静默放行并暗扫）', () => {
    const seed = req(path.join(ROOT, 'seed-ledger.js'));
    const secret = req(path.join(ROOT, 'secret-ledger.js'));
    const parallel = req(path.join(ROOT, 'parallel-ledger.js'));
    const recall = req(path.join(ROOT, 'recall-echo.js'));
    /* 修前实测：finite(null) === 0 ⇒ `f == null` 恒假 ⇒ 守卫形同虚设。 */
    /* `sweep(rawState, floor)` 是**两参**签名 —— 首跑只传了 state ⇒ 恒 `missing-floor`
     *   （判据自身的缺陷；顺手也给了一课：写判据前先读实现签名）。 */
    const naked = seed.plant(null, { hook: 'x', floor: 3, eventKey: 'a' }).state;
    assert.notEqual(seed.sweep(naked, 5).reason, 'missing-floor', '给了楼层 ⇒ 正常返回（不得被拒）');
    assert.equal(seed.sweep(naked, undefined).reason, 'missing-floor', '★ 不传楼层必须拒（修前静默横扫）');
    assert.equal(seed.sweep(naked, null).reason, 'missing-floor', '★ null 与「没给」同义，必须拒');
    assert.equal(seed.sweep(naked, '').reason, 'missing-floor', '★ 空串与「没给」同义，必须拒');
    assert.equal(secret.sweep(secret.seal(null, { secret: 's', keeper: '甲' }).state, null).reason, 'missing-floor',
        '秘密账同判据');
    assert.equal(parallel.sweep(parallel.note(null, { title: 't', fact: 'f' }).state, null).reason, 'missing-floor',
        '平行事实账同判据');
    assert.equal(recall.sweep(recall.mark(null, { detail: 'd', floor: 1 }).state, null).reason, 'missing-floor',
        '回扣账同判据');
    /* 反向自证：真给了楼层时这些面**不会**被拒（否则就是把门开过头）。 */
    assert.notEqual(seed.sweep(naked, 5).reason, 'missing-floor', '真给楼层不得被拒');
});

test('D3. ★★★ 事实版本账：事件的时间戳「没给」不得写成 0（1970）', () => {
    const FV = req(path.join(ROOT, 'fact-version.js'));
    let st = FV.normalize(null);
    st = FV.assertFact(st, { subject: '她', predicate: '居住', value: '北京', from: 1, floor: 1 }).state;
    const ev = st.facts[0].history[0];
    assert.equal(typeof ev, 'object', '事实账带变更历史');
    assert.equal(ev.at, null, '★ 没给时间戳 ⇒ null（修前 0 = 1970-01-01）');
    assert.notEqual(ev.at, 0, '0 是「1970」这个真实读数，不得拿它冒充「没给」');
});

test('D4. ★★★★ 事件线账：段楼层幂等（本版修的是根因，不是调用点绕过）', () => {
    let st = EC.addSegment({ version: EC.EC_VERSION, seq: 0, events: [] },
        { title: '无线索', role: 'action', text: 'z', source: 'extract' }).state;
    assert.equal(st.events[0].segments[0].floor, null, '★ 没给楼层 ⇒ null');
    /* 幂等：反复归一化读数不变（F-2 的绕过写法改成直读之后仍必须成立）。 */
    let cur = st;
    for (let i = 0; i < 5; i++) cur = EC.normalize(cur);
    assert.equal(cur.events[0].segments[0].floor, null, '★ 归一化 5 次仍是 null');
    /* 真第 0 楼仍按第 0 楼算。 */
    const r0 = EC.addSegment({ version: EC.EC_VERSION, seq: 0, events: [] },
        { title: '开场', role: 'action', text: 'w', floor: 0, source: 'extract' });
    assert.equal(r0.segment.floor, 0, '★ 真给了第 0 楼就按第 0 楼算');
    /* 源码面：本处已是直读（不再需要先排 null 的绕过写法）。 */
    const ecSrc = read('event-completeness.js');
    assert.match(ecSrc, /floor: finiteFloor\(s\.floor\)/, '段楼层走 finiteFloor 直读');
    assert.equal(/s\.floor == null \? null : finite\(s\.floor\)/.test(ecSrc), false, '绕过写法已撤');
});

/* ══════════ E 消费面（证据工作台） ══════════ */

test('E1. ★★★★ 证据工作台从「不传 floor 的账」读到 null 而非 0（上游塌陷已闭环）', () => {
    const WB = req(path.join(ROOT, 'evidence-workbench.js'));
    const seed = req(path.join(ROOT, 'seed-ledger.js'));
    const st = seed.plant(null, { hook: '没给楼层的伏笔', eventKey: 'wb-1' }).state;
    /* 宿主形状必须与 index.js 一致（`state: (h) => h.worldProg.seedLedger`）——
     *   首跑写的是 `_seedState`，那是 F-2 以前的老形状，于是读到 `state: 'absent'`。 */
    const face = WB.buildWorkbench({ worldProg: { seedLedger: st } }, { apis: { seed: seed } });
    const book = face.ledgers['seed'] || null;
    assert.ok(book, '证据面必须含伏笔账：' + Object.keys(face.ledgers).join(','));
    assert.equal(book.state, 'ok', '账本读数必须真取到（首跑 state 恒 absent ⇒ 下方 floor 断言踩 TypeError）');
    assert.equal(book.items[0].floor, null, '★ 从中读到 null（修前读到 0 —— 信息在上游出口前就丢了）');
    /* 真第 0 楼下仍读到 0。 */
    const st0 = seed.plant(null, { hook: '第 0 楼', floor: 0, eventKey: 'wb-0' }).state;
    const face0 = WB.buildWorkbench({ worldProg: { seedLedger: st0 } }, { apis: { seed: seed } });
    const book0 = face0.ledgers['seed'];
    assert.equal(book0.items[0].floor, 0, '★ 真第 0 楼 ⇒ 0（两态不同形）');
});

test('E2. ★★ 证据面上游注释已从「待办」改为「已闭环」（文档不得说谎）', () => {
    const wbSrc = read('evidence-workbench.js');
    assert.match(wbSrc, /上游那一半已由 v3\.240\.0 收口/, '注释须写明收口版本');
    assert.equal(/属\*\*上游单独一版\*\*的事/.test(wbSrc), false, '旧的「待上游」表述已撤');
});

/* ══════════ F 负控制（真源码破坏 → 破坏副本 → 同款判据必须转红） ══════════ */

const isAssertionFailure = (e) => e && e.name === 'AssertionError';

/** 造一棵最小镜像树：契约（可破坏）+ 挑一本消费者账。 */
function mirror(mutate) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3240-'));
    const broken = mutate(LE_SRC);
    assert.notEqual(broken, LE_SRC, '破坏必须真发生');
    fs.writeFileSync(path.join(dir, 'ledger-entity.js'), broken);
    for (const f of ['seed-ledger.js', 'snapshot-checkpoint.js']) {
        fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
    }
    return dir;
}

test('F1. ★★★★ 把 finite 改回「Number(v) 起步」⇒ A1/D1 同款判据必须转红', () => {
    /* 【v3.242.0 修订】锚点改为**从真源码就地切出来**的整段（`function finite` 起、
     *   到 `const n = Number(value);` 止），不再手抄实现里的几行文本 ——
     *   v3.242.0 收窄了字符串判定（`value.trim() === ''` → `INVISIBLE_OR_WS_ALL.test`），
     *   手抄的 5 行锚点当场上红：红的不是「破坏没生效」，是**锚点过期**。
     *   切段还顺手加了形状断言：切出来的东西必须真的含「没给」前置门，
     *   否则破坏掉的东西根本不是本判据要守的那个面。 */
    const fAt = LE_SRC.indexOf('  function finite(value) {');
    assert.ok(fAt > 0, '须能定位 `function finite(value) {`（否则本组是空跑）');
    const nAt = LE_SRC.indexOf('    const n = Number(value);', fAt);
    assert.ok(nAt > fAt, '须能定位 `const n = Number(value);`');
    const anchor = LE_SRC.slice(fAt, nAt + '    const n = Number(value);'.length);
    assert.ok(anchor.includes('if (value === null || value === undefined) return null;'),
        '切出的锚点须含「没给」前置门（否则破坏的不是本判据要守的那个面）');
    assert.equal(LE_SRC.split(anchor).length - 1, 1, '锚点须恰中 1 次');
    const dir = mirror((s) => s.replace(anchor, '  function finite(value) {\n    const n = Number(value);'));
    try {
        const M = req(path.join(dir, 'ledger-entity.js'));
        /* A1 同款判据：null 必须是 null。 */
        assert.throws(() => assert.equal(M.finite(null), null, '「没给」必须是 null'),
            isAssertionFailure, 'A1 同款判据在破坏副本上必须抛');
        assert.equal(M.finite(null), 0, '（破坏已生效：Number(null) === 0 —— 就是修前那条缺陷本身）');
        assert.equal(LE.finite(null), null, '对照：真源码下仍是 null');
        /* D1 同款判据：不传 floor 落到账上必须是 null。 */
        const seed = req(path.join(dir, 'seed-ledger.js'));
        const st = seed.plant(null, { hook: 'h', eventKey: 'k' }).state;
        assert.throws(() => assert.equal(st.items[0].floor, null, '没给楼层必须是 null'),
            isAssertionFailure, 'D1 同款判据必须抛');
        assert.equal(st.items[0].floor, 0, '（破坏已生效：账上被塔成第 0 楼）');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('F2. ★★★★ 破坏 finiteFloor 的转发（改成复制判据并写坏）⇒ C2/B1 同款判据必须转红', () => {
    const anchor = '  function finiteFloor(value) {\n    return finite(value);\n  }';
    assert.equal(LE_SRC.split(anchor).length - 1, 1, '锚点须恰中 1 次');
    const dir = mirror((s) => s.replace(anchor,
        '  function finiteFloor(value) {\n    const n = Number(value);\n    return Number.isFinite(n) ? Math.floor(n) : null;\n  }'));
    try {
        const M = req(path.join(dir, 'ledger-entity.js'));
        assert.throws(() => assert.equal(M.finiteFloor(null), null, 'finiteFloor 必须与 finite 同判据'),
            isAssertionFailure, 'B1 同款判据在破坏副本上必须抛');
        assert.equal(M.finiteFloor(null), 0, '（破坏已生效：finiteFloor 脱离契约自成一套 ⇒ null 被塔成 0）');
        /* 顺带证明 floor 一族的守卫会跟着失效（这就是「一份判据」的价值）。 */
        const seed = req(path.join(dir, 'seed-ledger.js'));
        const naked = seed.plant(null, { hook: 'x', floor: 3, eventKey: 'a' }).state;
        assert.equal(seed.sweep(naked, null).reason, undefined, '（破坏已生效：守卫对「没给」不再拒绝）');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/* ══════════ G 门禁真跑 ══════════ */

test('G1. ★★★ 账本实体契约门禁真跑通过（九账委派 + finiteFloor 面 + 无重复回潮）', async () => {
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tests', 'audit', 'scan_ledger_contract.mjs')],
        { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
    assert.equal(r.status, 0, '门禁必须通过：' + String(r.stderr || r.stdout || '').slice(0, 400));
    assert.match(r.stdout, /9 本账全部委派/, '读数行须报出九本（口径不得静默变更）');
    assert.match(r.stdout, /floor 一族走 finiteFloor/, '读数行须含 finiteFloor 面');
    /* 自证门禁真在扫（防「门禁写了但不生效」）：临时去掉三本登记 ⇒ 必须 exit 1。 */
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3240g-'));
    try {
        fs.mkdirSync(path.join(dir, 'tests', 'audit'), { recursive: true });
        fs.copyFileSync(path.join(ROOT, 'manifest.json'), path.join(dir, 'manifest.json'));
        /* [v3.246.0] 门禁的**运行时依赖**必须一并搬进夹具：本版给它加了
         *   `await import('../_fixture_sync.mjs')`（相对脚本自身解析），而这里是**逐文件**
         *   选择性镜像（不是整树 cpSync）⇒ 少了真源，门禁在夹具里走 fail-closed 分支
         *   **exit 2**，而那个 2 会被读成「判据红了」——归因错。实测本组首跑即栽在此。
         *   清单从真源导出（RUNTIME_DEPS），不在这里手抄第二个名字。 */
        for (const dep of RUNTIME_DEPS) {
            fs.mkdirSync(path.dirname(path.join(dir, dep)), { recursive: true });
            fs.copyFileSync(path.join(ROOT, dep), path.join(dir, dep));
        }
        for (const f of ['ledger-entity.js', 'index.js'].concat(BOOK_FILES)) {
            fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
        }
        /* 首跑用的 `/    'recall-echo\.js'[\s\S]*?\]\],\n/` 把 NEEDS 表切出语法错误
         *   （门禁根本没跑起来，报的是 SyntaxError 而不是「不在委派表里」）——
         *   负控制的破坏必须留下一份**可运行**的脚本，只删登记行、保留 R2 的兜底分支。 */
        const brokenScan = SCAN_SRC
            .replace("    'recall-echo.js': [['const text = LE.text', '文本归一'], ['const finite = LE.finite', '数值归一'], ['const finiteFloor = LE.finiteFloor', '楼层取值口']],\n", '')
            .replace("    'echo-ledger.js': [['const text = LE.text', '文本归一'], ['const finite = LE.finite', '数值归一'], ['const finiteFloor = LE.finiteFloor', '楼层取值口']],\n", '');
        assert.notEqual(brokenScan, SCAN_SRC, '破坏必须真发生');
        assert.equal(brokenScan.length < SCAN_SRC.length, true, '破坏必须是删除（长度变短）');
        fs.writeFileSync(path.join(dir, 'tests', 'audit', 'scan_ledger_contract.mjs'), brokenScan);
        const r2 = spawnSync(process.execPath, [path.join(dir, 'tests', 'audit', 'scan_ledger_contract.mjs')],
            { cwd: dir, encoding: 'utf8', timeout: 120000 });
        assert.equal(r2.status, 1, '去掉一本委派登记后门禁必须转红（实测 ' + r2.status + '）');
        assert.match(r2.stdout + r2.stderr, /不在委派表里/, '并须点名');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/* ══════════ H 版本锚 ══════════ */

const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));

test('H1. ★ 版本锚（本套件只在 3.240.0 及以后成立；三源同源）', () => {
    const pkg = JSON.parse(read('package.json'));
    const mf = JSON.parse(read('manifest.json'));
    const codeVer = (/const VERSION = '([^']+)'/.exec(read('index.js')) || [])[1];
    assert.ok(codeVer, '入口版本常量在场');
    assert.ok(vnum(codeVer) >= vnum('3.240.0'), '本套件只在 3.240.0 及以后成立；当前 ' + codeVer);
    assert.equal(pkg.version, codeVer, 'package.json 与 index.js 同源');
    assert.equal(mf.version, codeVer, 'manifest.json 与 index.js 同源');
});
