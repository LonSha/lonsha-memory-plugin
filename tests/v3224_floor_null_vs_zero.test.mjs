/* ============================================================
 * tests/v3224_floor_null_vs_zero.test.mjs — [v3.223.0] Gate O-1
 *
 * 版本锚点（v3.223.0）：本套件恰好锚着它自己的出生版本，供版本守卫 V4 取基准。
 *
 * 主题：**场所面「没给」与「给了 0」的真判开**。
 *
 * 背景：R3-D（v3.221.0）在 CHANGELOG 里声称「`import()` 七格 + `headers` 键统一改走
 *   `numOrNull`，把「没给」与「给了 0」判开」。其中 `headers` 键那一半是真的
 *   （`null` / `''` 键被跳过），而 `import()` 七格那一半**是改名**：
 *     · 修前：`num(x) ?? 0` —— `num(null) === 0`（`Number(null) === 0` 且有限）⇒ `0`
 *     · 修后：`numOrNull(x) ?? 0` —— `numOrNull(null) === null` ⇒ `null ?? 0` ⇒ `0`
 *   两条路径**同值**，值一位没变。写侧三处更直接：
 *   `Number.isFinite(Number(floor)) ? Number(floor) : 0`。
 *   而 0 在本仓是**合法楼层**：宿主 `message.index` 是 0 基，`apply(ops, 0)` 的既有口径
 *   也把 0 当楼层 —— 与「没给」同形最贵。
 *
 * 还有一个更贵的形态：`tests/v3222` 的 A1 组测试名写着「八格「没给」**不得落成第 0 楼**」，
 *   六条断言却把 `0` **钉死**。即：判据不但没抓到缺陷，还承诺它必须继续存在 ——
 *   **判据在保护缺陷**（判据撒谎比实现撒谎更难发现：它会让后来者以为这一面已经治过了）。
 *
 * 本套件的立场：**这一面不给「例外」也不给「近似」**。
 *   判开是双向的：既要求「没给」⇒ `null` / 拒绝，也要求「给了 0」⇒ 保住 0
 *   （只做前一半就是把门关成「谁都不许写」，那是另一种错）。
 *
 * 层次：A 读侧（import 七格「没给」如实 null）
 *       B 写侧（三处取不到即拒绝）
 *       C 双向自证（「给了 0」必须保住 0，否则判据恒真）
 *       D 与既有面同口径（coverage / summary / 与 setHeader 一致）
 *       E 宿主与退路（宿主传值 / 退路同形）
 *       F 负控制前置（原版对照）
 *       G 版本锚
 *       N 负控制（真源码破坏 → 仓内镜像副本 → 同款真判据必须转红）
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';   // [v3.226.0] 镜像落 os.tmpdir()，不落仓根（落仓根会与整仓镜像类测试的 cpSync 互撞）
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { stripComments } from './_audit_lib.mjs';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const SB_PATH = path.join(REPO, 'scene-book.js');
const IDX_PATH = path.join(REPO, 'index.js');
const SB = require(SB_PATH);
const sbSrc = fs.readFileSync(SB_PATH, 'utf8');
const idxSrc = fs.readFileSync(IDX_PATH, 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));
function vnum(s) {
    const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
    return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}
/** 「没给」的全部形态（0 是合法楼层，故**不在此列**）。 */
const ABSENT = [null, undefined, '', [], {}, NaN, true, false, '怪', '  '];
/** 「给了 0」——必须与「没给」判开。 */
const ZERO = 0;

/** 缺字段的导入包（七格全「没给」）。 */
function absentPack() {
    return {
        nodes: [{ path: ['甲城'], desc: 'd' }],
        track: [{ pathKey: '甲城' }],
        opsLog: [{ ops: [{ action: 'add', path: ['甲城'] }] }],
        visits: [['甲城', { count: 1, floors: [3] }]],
        presence: [['林晚', { key: '甲城' }]],
        headers: [['', { date: 'x月x日' }]]
    };
}
/** 显式给 0 的导入包（七格全「给了 0」）。 */
function zeroPack() {
    return {
        nodes: [{ path: ['乙城'], desc: 'd', floor: 0, updatedAt: 0 }],
        track: [{ pathKey: '乙城', floor: 0 }],
        opsLog: [{ ops: [{ action: 'add', path: ['乙城'] }], floor: 0 }],
        visits: [['乙城', { count: 1, firstFloor: 0, lastFloor: 0, floors: [0] }]],
        presence: [['苏晴', { key: '乙城', atFloor: 0 }]]
    };
}
/** 镜像破坏副本：`os.tmpdir()` 下的临时目录 + 只搬根目录 .js（两个模块都是零依赖 IIFE）。
 *  [v3.226.0] 落点由仓根改为 tmpdir —— 落仓根会与「整仓镜像」类测试（v3206 / v3225 / v3159）的 cpSync 互撞。 */
function loadMirror(over, name) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3224-' + name + '_'));
    for (const f of fs.readdirSync(REPO)) {
        if (!f.endsWith('.js')) continue;
        fs.copyFileSync(path.join(REPO, f), path.join(dir, f));
    }
    for (const [rel, text] of Object.entries(over)) fs.writeFileSync(path.join(dir, rel), text);
    const p = path.join(dir, 'scene-book.js');
    delete require.cache[require.resolve(p)];
    return { SBx: require(p), dir };
}
/**
 * 破坏锚点表。每个字面量在本文件里只准出现一次（见 N0），
 *   且**替换串一律不含锚点**（否则「锚点唯一」这条自身会失效）。
 */
const ANCHORS = [
    'floor: numOrNull(n.floor), updatedAt: numOrNull(n.updatedAt)',
    '.map(t => ({ floor: numOrNull(t.floor), pathKey: t.pathKey }))',
    '.map(o => ({ floor: numOrNull(o.floor), ops: o.ops }))',
    '                    firstFloor: numOrNull(v.firstFloor),\n                    lastFloor: numOrNull(v.lastFloor),',
    'atFloor: numOrNull(v.atFloor), at: numOrNull(v.at) ?? 0 }',
    '        // [v3.223.0] O-1：楼层「没给」不得被读成第 0 楼（0 是合法楼层，与没给同形最贵）。\n        const f = numOrNull(floor);\n        if (f == null) return 0;',
    '        // [v3.223.0] O-1：同 apply —— 「没给」如实拒绝，不落成第 0 楼。\n        const f = numOrNull(floor);\n        if (f == null) return false;\n        const i = this.track.findIndex(t => t.floor === f);',
    "        // [v3.223.0] O-1：同 apply —— 「没给」如实拒绝，不落成第 0 楼。\n        const f = numOrNull(floor);\n        if (f == null) return false;\n        if (!this.presence.has(nm) && this.presence.size >= MAX_PRESENCE) {",
    // ★ 核心：门本体。把它退化成 `Number()` 门，这一族判据必须集体转红 ——
    //   否则「判据真的挂在门上」这件事从未被证明过（假绿三形之一：判据根本没碰到真判据）。
    '    if (typeof v === \'number\') return Number.isFinite(v) ? v : null;\n'
    + '    if (typeof v === \'string\') {\n'
    + '        if (v.trim() === \'\') return null;\n'
    + '        const n = Number(v);\n'
    + '        return Number.isFinite(n) ? n : null;\n'
    + '    }\n'
    + '    return null;',
    // 列号面：曾用 `Number(o.floor)` ⇒ 凭空多出第 0 楼
    '        const floors = [...new Set(this.opsLog.map(o => numOrNull(o && o.floor)).filter(f => f !== null))].sort((a, b) => a - b);',
    // 回滚面守卫
    '        const fl = numOrNull(floor);\n        if (fl == null) return 0;',
    // num 别名
    'const num = numOrNull;'
];
const AN = (n) => ANCHORS[n];

test('【N0】★ 负控制判据的纯度：锚点字面量全文只准出现在 ANCHORS 声明处', () => {
    const own = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').replace(/const ANCHORS = \[[\s\S]*?\n\];/, '');
    for (const a of ANCHORS) {
        assert.equal(own.split(a).length - 1, 0,
            '★ 锚点字面量不得在别处复现（判据引用锚点 = 破坏时判据自我指涉失效）：' + JSON.stringify(a.slice(0, 40)));
    }
    assert.equal(ANCHORS.length, 12, '锚点表 12 条');
});

// ══════════ A 读侧：import 七格「没给」如实 null ══════════
test('【A1】★★ import 七格「没给」一律如实 null（不是第 0 楼）', () => {
    const b = new SB.SceneBook();
    b.import(absentPack());
    assert.equal(b.nodes.get('甲城').floor, null, '★ nodes.floor');
    assert.equal(b.nodes.get('甲城').updatedAt, null, '★ nodes.updatedAt');
    assert.equal(b.track[0].floor, null, '★ track[].floor');
    assert.equal(b.opsLog[0].floor, null, '★ opsLog[].floor');
    assert.equal(b.visits.get('甲城').firstFloor, null, '★ visits.firstFloor');
    assert.equal(b.visits.get('甲城').lastFloor, null, '★ visits.lastFloor');
    assert.equal(b.presence.get('林晚').atFloor, null, '★ presence.atFloor');
    assert.deepEqual([...b.headers.keys()], [], '场景头空键被跳（R3-D 那一半是真的）');
});

test('【A2】★ import 的每个「没给」形态都算没给（含 "0" 之外的怪值）', () => {
    for (const v of ABSENT) {
        const b = new SB.SceneBook();
        const pack = absentPack();
        pack.nodes[0].floor = v;
        pack.track[0].floor = v;
        pack.presence[0][1].atFloor = v;
        b.import(pack);
        const tag = JSON.stringify(v === undefined ? '(undefined)' : v);
        assert.equal(b.nodes.get('甲城').floor, null, 'nodes.floor 对 ' + tag + ' 如实 null');
        assert.equal(b.track[0].floor, null, 'track.floor 对 ' + tag + ' 如实 null');
        assert.equal(b.presence.get('林晚').atFloor, null, 'atFloor 对 ' + tag + ' 如实 null');
    }
});

// ══════════ B 写侧：三处取不到即拒绝 ══════════
test('【B1】★★ 写侧三处「没给」一律拒绝（不落第 0 楼），且一格都没写进去', () => {
    for (const v of ABSENT) {
        const tag = JSON.stringify(v === undefined ? '(undefined)' : v);
        const a = new SB.SceneBook();
        assert.equal(a.setLocation(v, ['城', '店']), false, '★ setLocation(' + tag + ') 拒绝');
        assert.deepEqual(a.track, [], '★ 一格轨迹都没落进来');
        const b = new SB.SceneBook();
        assert.equal(b.setPresence('甲', ['城', '店'], v), false, '★ setPresence(..., ' + tag + ') 拒绝');
        assert.equal(b.presence.size, 0, '★ 在场一条都没落进来');
        const c = new SB.SceneBook();
        assert.equal(c.apply([{ action: 'add', path: ['丙城'] }], v), 0, '★ apply(..., ' + tag + ') 如实 0');
        assert.equal(c.nodes.size, 0, '★ 一格节点都没落进来');
    }
    // setPresence 缺第三参同样算「没给」（过去它会默认落成第 0 楼）
    const d = new SB.SceneBook();
    assert.equal(d.setPresence('乙', ['城', '店']), false, '★ setPresence 缺第三参拒绝');
    assert.equal(d.presence.size, 0, '★ 也没有偷偷建条目');
});

// ══════════ C 双向自证：「给了 0」必须保住 0 ══════════
test('【C1】★★ 反向：给了 0 就是 0（只做「拒绝」那一半 = 把门关成谁都不许写）', () => {
    const c = new SB.SceneBook();
    c.import(zeroPack());
    assert.equal(c.nodes.get('乙城').floor, 0, '★ import 里显式的 floor:0 保住');
    assert.equal(c.nodes.get('乙城').updatedAt, 0, '★ updatedAt:0 保住');
    assert.equal(c.track[0].floor, 0, '★ track 的 0 保住');
    assert.equal(c.opsLog[0].floor, 0, '★ opsLog 的 0 保住');
    assert.equal(c.visits.get('乙城').firstFloor, 0, '★ 到访 firstFloor:0 保住');
    assert.equal(c.visits.get('乙城').lastFloor, 0, '★ lastFloor:0 保住');
    assert.equal(c.presence.get('苏晴').atFloor, 0, '★ 在场地 0 保住');
    const d = new SB.SceneBook();
    assert.equal(d.apply([{ action: 'add', path: ['零楼'] }], ZERO), 1, '★ apply(0) 照常登记');
    assert.equal(d.nodes.get('零楼').floor, 0, '★ 登记的楼层就是 0');
    assert.equal(d.setLocation(ZERO, ['城', '零楼']), true, '★ setLocation(0) 照常落位');
    assert.equal(d.track[0].floor, 0, '★ 第 0 楼轨迹在册');
    assert.equal(d.setPresence('丙', ['城', '零楼'], ZERO), true, '★ setPresence(..., 0) 照常写入');
    assert.equal(d.presence.get('丙').atFloor, 0, '★ 在场地 0 在册');
    // 字符串 '0' 也是「给了 0」（数字字符串在 numOrNull 口径下算给了）
    const e = new SB.SceneBook();
    assert.equal(e.setLocation('0', ['城', '零楼']), true, "★ 字符串 '0' 同样算给了");
    assert.equal(e.track[0].floor, 0, "★ '0' 落成数字 0");
});

// ══════════ D 与既有面同口径 ══════════
test('【D1】★ 与 headers 面的既有口径一致（R3-D 在同一文件里已经这么做过了）', () => {
    const b = new SB.SceneBook();
    assert.equal(b.setHeader(null, { date: 'x' }), false, 'setHeader(null) 拒绝（R3-D 口径，作对照）');
    assert.equal(b.setHeader(0, { date: '零楼' }), true, '★ setHeader(0) 照常写得进（0 是合法楼层）');
    assert.equal(b.headerAt(null), null, 'headerAt(null) 如实 null');
    assert.equal(b.headerAt(0).date, '零楼', '★ headerAt(0) 读得出');
    // 本套件三处 setter 与 setHeader 同口径：取不到即拒绝、0 照常
    const c = new SB.SceneBook();
    assert.equal(c.setLocation(null, ['城', '店']), false, 'setLocation 同口径');
    assert.equal(c.setLocation(0, ['城', '店']), true, 'setLocation(0) 同口径');
});

test('【D2】★ 覆盖度不把「没给」当第 0 楼：列号里不得出现凭空多出来的 0', () => {
    const b = new SB.SceneBook();
    b.import(absentPack());
    const cov = b.coverage();
    assert.equal(cov.floors.includes(0), false, '★ 没有任何 ops 被编成第 0 楼');
    assert.equal(cov.trackFloors.includes(0), false, '★ 没有任何轨迹被编成第 0 楼');
    assert.equal(cov.headerCount, 0, '场景头一条都没有');
    // 反过来：给了 0 就必须列得出 0
    const c = new SB.SceneBook();
    c.import(zeroPack());
    const cov2 = c.coverage();
    assert.equal(cov2.trackFloors.includes(0), true, '★ 真给了 0 时必须列得出 0（不然是把读数删了）');
});

test('【D3】★ summary 外供面上「没给」如实 null（下游靠这一格分开「不知道在哪」与「在第 0 楼」）', () => {
    const b = new SB.SceneBook();
    b.import(absentPack());
    const sum = b.summary();
    const p = sum.presence.find((x) => x.name === '林晚');
    assert.ok(p, '在场外供条目在');
    assert.equal(p.atFloor, null, '★ 外供 atFloor 如实 null');
    const visits = sum.visits.find((v) => v.path.join('/') === '甲城');
    assert.ok(visits, '到访外供条目在');
    assert.equal(visits.firstFloor, null, '★ 外供 firstFloor 如实 null');
    assert.equal(visits.lastFloor, null, '★ 外供 lastFloor 如实 null');
    assert.equal(JSON.stringify(sum).includes('"atFloor":0'), false, '★ 外供 JSON 里不得出现凭空的地 0');
});

// ══════════ E 宿主与退路 ══════════
test('【E1】★ 宿主把「没给」传下来时的两个入口都守住了（apply / setLocation / setPresence）', () => {
    const code = stripComments(idxSrc);
    assert.ok(/this\.scene\.apply\(extracted\.scenes, message\.index \|\| 0\)/.test(code),
        '宿主 apply 仍传「本楼号或 0」（这里的 0 是**本楼就是第 0 楼**，语义是给了）');
    assert.ok(/this\.scene\.setPresence\(_nm, _path, _rec\.atFloor\)/.test(code),
        '★ 携带包路径把 atFloor **原样透传**（缺就是 undefined ⇒ 下游模块拒绝，而不是编成 0）');
    assert.ok(!/this\.scene\.setPresence\(_nm, _path, _rec\.atFloor \|\| 0\)/.test(code),
        '★ 宿主不得在透传前把它 `|| 0`（那正是把「没给」编成第 0 楼的地方）');
});

test('【E2】★ 退路同形：SceneBookFallback 的三个写侧空方法仍如实返回假值', () => {
    const code = stripComments(idxSrc);
    assert.ok(/setLocation\(\)\s*\{\s*return false;\s*\}/.test(code), '退路 setLocation 如实 false');
    assert.ok(/setPresence\(\)\s*\{\s*return false;\s*\}/.test(code), '退路 setPresence 如实 false');
});

// ══════════ F 负控制前置 ══════════
test('【F0】★ 原版对照：本套件的全部闭合判据在真源码上必须干净（否则「破坏翻红」不可归因）', () => {
    const b = new SB.SceneBook();
    b.import(absentPack());
    assert.equal(b.nodes.get('甲城').floor, null, 'A1 判据在真源码上成立');
    const c = new SB.SceneBook();
    c.import(zeroPack());
    assert.equal(c.presence.get('苏晴').atFloor, 0, 'C1 判据在真源码上成立');
});

// ══════════ G 版本锚 ══════════
test('【G1】★ 版本锚：本套件只在 3.223.0 及以后成立', () => {
    assert.ok(vnum(pkg.version) >= vnum('3.223.0'), '★ 当前版本 ' + pkg.version);
    assert.equal(manifest.version, pkg.version, '三源一致（index.js / manifest / package）');
    assert.equal(/const VERSION = '([0-9.]+)'/.exec(idxSrc)[1], pkg.version, 'index.js 与 package 同源');
});

// ══════════ N 负控制 ══════════
function mutate(srcText, anchor, repl, tag) {
    const hits = srcText.split(anchor).length - 1;
    assert.equal(hits, 1, tag + '：锚点须恰中 1 次（实 ' + hits + '）——锚点漂移即判据失效');
    return srcText.split(anchor).join(repl);
}
/** 怪值包：这些值经 `Number()` 会变成 0 / 1 / NaN —— 只有「先看类型」的门才能识破。 */
function weirdPack() {
    const p = absentPack();
    p.nodes[0].floor = [];
    p.nodes[0].updatedAt = true;
    p.track[0].floor = [];
    p.opsLog[0].floor = false;
    p.presence[0][1].atFloor = [];
    p.visits[0][1].firstFloor = [];
    p.visits[0][1].lastFloor = true;
    return p;
}
/** 同款真判据（到访史面）：**修前 N4 用错了判据**，故单独立一条。 */
function visitJudgeFails(SBx) {
    const b = new SBx.SceneBook();
    b.import(absentPack());
    const v = b.visits.get('甲城');
    return v.firstFloor === null && v.lastFloor === null;
}
/** 同款真判据（列号面）：覆盖度不得凭空多出第 0 楼，而真给了 0 必须列得出 0。 */
function coverageJudgeFails(SBx) {
    const w = new SBx.SceneBook();
    w.import(weirdPack());
    const c = w.coverage();
    const z = new SBx.SceneBook();
    z.import(zeroPack());
    const cz = z.coverage();
    return !c.floors.includes(0) && !c.trackFloors.includes(0) && !c.headerFloors.includes(0)
        && cz.floors.includes(0) && cz.trackFloors.includes(0);
}
/** 同款真判据（外供面）：tree / summary 的 JSON 里不得漏出凭空的地 0，而真 0 要读得出。 */
function outerJudgeFails(SBx) {
    const w = new SBx.SceneBook();
    w.import(weirdPack());
    const okTree = w.tree().every((it) => it.floor === null);
    const j = JSON.stringify(w.summary());
    const okJson = !j.includes('"floor":0') && !j.includes('"atFloor":0')
        && !j.includes('"firstFloor":0') && !j.includes('"lastFloor":0');
    const z = new SBx.SceneBook();
    z.import(zeroPack());
    const okZero = z.tree()[0].floor === 0 && z.summary().presence[0].atFloor === 0;
    return okTree && okJson && okZero;
}
/** 同款真判据（回滚面）：三处收到「没给」必须一格不动 —— 0 是合法楼层，真给 0 才该动。 */
function rollbackJudgeFails(SBx) {
    const a = new SBx.SceneBook();
    a.setLocation(0, ['甲城', '零楼商铺']);
    a.setPresence('丙', ['甲城', '零楼商铺'], 0);
    a.setHeader(0, { date: '零日' });
    const keep = () => a.track.length === 1 && a.presence.size === 1 && a.headers.size === 1;
    const k1 = a.rollbackFrom(null) === 0 && keep();
    a.rollbackFloorOnly(null);
    const k2 = keep();
    const k3 = a.shiftFloorRefs(null) === 0 && keep();
    // 反向：真给 0 时必须真的动（否则是「谁都不许写」那种错）
    const z = new SBx.SceneBook();
    z.setLocation(0, ['甲城', '零楼商铺']);
    z.rollbackFrom(0);
    return k1 && k2 && k3 && z.track.length === 0;
}
/** 同款真判据（怪值面）：`[]` / `true` 一律算「没给」，读侧写侧都不得被强转成 0 / 1。 */
function weirdJudgeFails(SBx) {
    const b = new SBx.SceneBook();
    b.import(weirdPack());
    const okRead = b.nodes.get('甲城').floor === null && b.nodes.get('甲城').updatedAt === null
        && b.track[0].floor === null && b.opsLog[0].floor === null
        && b.presence.get('林晚').atFloor === null && b.visits.get('甲城').firstFloor === null
        && b.visits.get('甲城').lastFloor === null;
    const a = new SBx.SceneBook();
    const okWrite = a.setLocation([], ['城', '店']) === false && a.track.length === 0
        && a.apply([{ action: 'add', path: ['丙城'] }], []) === 0 && a.nodes.size === 0;
    return okRead && okWrite;
}

/** 同款真判据（读侧七格）：在破坏副本上必须失败。 */
function readJudgeFails(SBx) {
    const b = new SBx.SceneBook();
    b.import(absentPack());
    return b.nodes.get('甲城').floor === null && b.track[0].floor === null
        && b.presence.get('林晚').atFloor === null;
}
/** 同款真判据（写侧三处）：在破坏副本上必须失败。 */
function writeJudgeFails(SBx) {
    const a = new SBx.SceneBook();
    const b = new SBx.SceneBook();
    const c = new SBx.SceneBook();
    return a.setLocation(null, ['城', '店']) === false
        && b.setPresence('甲', ['城', '店'], null) === false
        && c.apply([{ action: 'add', path: ['丙城'] }], null) === 0;
}

test('【N1】★ 负控制：nodes 那格改回 `?? 0` → 读侧判据必须转红', () => {
    const broken = mutate(sbSrc, AN(0), 'floor: numOrNull(n.floor) ?? 0, updatedAt: numOrNull(n.updatedAt)') + '\n';
    const { SBx, dir } = loadMirror({ 'scene-book.js': broken }, 'n1');
    try {
        assert.equal(readJudgeFails(SBx), false, '★ 同款判据在破坏副本上失败（floor 又落回 0）');
        const b = new SBx.SceneBook();
        b.import(absentPack());
        assert.equal(b.nodes.get('甲城').floor, 0, '破坏可观测：确实编成了第 0 楼');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N2】★ 负控制：track 那格改回 `?? 0` → 读侧判据必须转红', () => {
    const broken = mutate(sbSrc, AN(1), '.map(t => ({ floor: numOrNull(t.floor) ?? 0, pathKey: t.pathKey }))') + '\n';
    const { SBx, dir } = loadMirror({ 'scene-book.js': broken }, 'n2');
    try {
        assert.equal(readJudgeFails(SBx), false, '★ 同款判据在破坏副本上失败（track 又落回 0）');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N3】★ 负控制：opsLog 那格改回 `?? 0` → 覆盖度「不得凭空多出 0」判据必须转红', () => {
    const broken = mutate(sbSrc, AN(2), '.map(o => ({ floor: numOrNull(o.floor) ?? 0, ops: o.ops }))') + '\n';
    const { SBx, dir } = loadMirror({ 'scene-book.js': broken }, 'n3');
    try {
        const b = new SBx.SceneBook();
        b.import(absentPack());
        assert.equal(b.coverage().floors.includes(0), true, '★ 同款判据（列号里不得有凭空 0）失败');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N4】★ 负控制：visits 两格改回 `?? 0` → 到访读数判据必须转红', () => {
    const broken = mutate(sbSrc, AN(3), '                    firstFloor: numOrNull(v.firstFloor) ?? 0,\n                    lastFloor: numOrNull(v.lastFloor) ?? 0,') + '\n';
    const { SBx, dir } = loadMirror({ 'scene-book.js': broken }, 'n4');
    try {
        const b = new SBx.SceneBook();
        b.import(absentPack());
        assert.equal(b.visits.get('甲城').firstFloor, 0, '★ 同款判据（如实 null）失败：firstFloor 变成 0');
        // 修前这里调的是 readJudgeFails()（只查 nodes/track/presence，**不含 visits**）——
        //   判据与主题不匹配 ⇒ visits 坏了它照样成立，等于没测。改用对得上的那一条。
        assert.equal(visitJudgeFails(SBx), false, '★ 同款判据（到访史如实 null）失败');
        assert.equal(readJudgeFails(SBx), true, '★ 互不掩护：读侧判据与 visits 无关，必须仍成立');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N5】★ 负控制：presence.atFloor 改回 `?? 0` → 读侧与外供判据都转红', () => {
    const broken = mutate(sbSrc, AN(4), 'atFloor: numOrNull(v.atFloor) ?? 0, at: numOrNull(v.at) ?? 0 }') + '\n';
    const { SBx, dir } = loadMirror({ 'scene-book.js': broken }, 'n5');
    try {
        assert.equal(readJudgeFails(SBx), false, '★ 同款判据在破坏副本上失败（atFloor 又落回 0）');
        const b = new SBx.SceneBook();
        b.import(absentPack());
        assert.equal(JSON.stringify(b.summary()).includes('"atFloor":0'), true, '★ 外供面也漏出假地 0');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N6】★ 负控制：apply 的守卫撤掉 → 写侧判据必须转红', () => {
    const broken = mutate(sbSrc, AN(5),
        '        const f = Number.isFinite(Number(floor)) ? Number(floor) : 0;') + '\n';
    const { SBx, dir } = loadMirror({ 'scene-book.js': broken }, 'n6');
    try {
        assert.equal(writeJudgeFails(SBx), false, '★ 同款判据在破坏副本上失败（apply 又落成第 0 楼）');
        const c = new SBx.SceneBook();
        assert.equal(c.apply([{ action: 'add', path: ['丙城'] }], null), 1, '破坏可观测：null 被当真，登记了 1 条');
        assert.equal(c.nodes.get('丙城').floor, 0, '破坏可观测：楼层落成 0');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N7】★ 负控制：setLocation 的守卫撤掉 → 写侧判据必须转红', () => {
    const broken = mutate(sbSrc, AN(6),
        '        const f = Number.isFinite(Number(floor)) ? Number(floor) : 0;\n        const i = this.track.findIndex(t => t.floor === f);') + '\n';
    const { SBx, dir } = loadMirror({ 'scene-book.js': broken }, 'n7');
    try {
        assert.equal(writeJudgeFails(SBx), false, '★ 同款判据在破坏副本上失败（setLocation 又落成第 0 楼）');
        const a = new SBx.SceneBook();
        assert.equal(a.setLocation(null, ['城', '店']), true, '破坏可观测：null 被当成第 0 楼照常落位（末位键变了 ⇒ 返回 true）');
        assert.equal(a.track[0].floor, 0, '破坏可观测：轨迹落在第 0 楼');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N8】★ 负控制：setPresence 的守卫撤掉 → 写侧判据必须转红', () => {
    const broken = mutate(sbSrc, AN(7),
        '        const f = Number.isFinite(Number(floor)) ? Number(floor) : 0;\n        if (!this.presence.has(nm) && this.presence.size >= MAX_PRESENCE) {') + '\n';
    const { SBx, dir } = loadMirror({ 'scene-book.js': broken }, 'n8');
    try {
        assert.equal(writeJudgeFails(SBx), false, '★ 同款判据在破坏副本上失败（setPresence 又落成第 0 楼）');
        const b = new SBx.SceneBook();
        b.setPresence('甲', ['城', '店'], null);
        assert.equal(b.presence.get('甲').atFloor, 0, '破坏可观测：在场落在第 0 楼');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N9】★★ 负控制·反向：把门关成「谁都不许写 0」→ 坐实「给了 0 保住 0」判据必须转红', () => {
    // 这一组针对「只做前一半」的错：把 0 也当作「没给」一并丢掉。
    //   判据：`f == null` 改成 `f == null || f === 0`（apply）
    const broken = mutate(sbSrc, AN(5),
        '        const f = numOrNull(floor);\n        if (f == null || f === 0) return 0;') + '\n';
    const { SBx, dir } = loadMirror({ 'scene-book.js': broken }, 'n9');
    try {
        const c = new SBx.SceneBook();
        assert.notEqual(c.apply([{ action: 'add', path: ['零楼'] }], 0), 1, '★ 同款判据（apply(0) 照常登记）失败');
        assert.equal(c.nodes.size, 0, '破坏可观测：第 0 楼被一并拒了（那是另一种错）');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N10】★ 负控制·互不掩护：读侧与写侧的破坏各自只打掉自己那一面', () => {
    const readBroken = mutate(sbSrc, AN(0), 'floor: numOrNull(n.floor) ?? 0, updatedAt: numOrNull(n.updatedAt)') + '\n';
    {
        const { SBx, dir } = loadMirror({ 'scene-book.js': readBroken }, 'n10a');
        try {
            assert.equal(readJudgeFails(SBx), false, '读侧破坏后读侧判据转红');
            assert.equal(writeJudgeFails(SBx), true, '★ 写侧判据必须仍成立（否则一坏全坏，判据失去分辨力）');
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
    const writeBroken = mutate(sbSrc, AN(5),
        '        const f = Number.isFinite(Number(floor)) ? Number(floor) : 0;') + '\n';
    {
        const { SBx, dir } = loadMirror({ 'scene-book.js': writeBroken }, 'n10b');
        try {
            assert.equal(writeJudgeFails(SBx), false, '写侧破坏后写侧判据转红');
            assert.equal(readJudgeFails(SBx), true, '★ 读侧判据必须仍成立');
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
});
// ══════════ H 同族已收口面（第二批） ══════════
test('【H1】★★ visits[].floors 里的「没给」不得落成第 0 楼（R3-D 只改了 count，floors 那格漏了）', () => {
    const p = absentPack();
    p.visits[0][1].floors = [null, '', [], true, false, '怪', 3, '5'];
    const b = new SB.SceneBook();
    b.import(p);
    assert.deepEqual(b.visits.get('甲城').floors, [3, 5],
        '★ 「没给」与怪值一律剔除；数字与非空数字串如实保留（修前这里走 `num()`，`[]`→0 / `true`→1）');
    // 反向：真给了 0 必须留在册（否则是把读数删了，另一种错）
    const z = new SB.SceneBook();
    z.import(zeroPack());
    assert.deepEqual(z.visits.get('乙城').floors, [0], '★ 第 0 楼是真楼层，必须列得出');
});

test('【H2】★★ coverage 列号：刚导入的账本不得凭空多出第 0 楼，真给了 0 必须列得出', () => {
    const w = new SB.SceneBook();
    w.import(weirdPack());
    const c = w.coverage();
    assert.equal(c.floors.includes(0), false, '★ 有变更的楼层列号里没有凭空的地 0');
    assert.equal(c.trackFloors.includes(0), false, '★ 位置轨迹列号里没有凭空的地 0');
    assert.equal(c.headerFloors.includes(0), false, '★ 场景头列号里没有凭空的地 0');
    const z = new SB.SceneBook();
    z.import(zeroPack());
    const cz = z.coverage();
    assert.equal(cz.floors.includes(0), true, '★ 真给了 0 必须列得出 0');
    assert.equal(cz.trackFloors.includes(0), true, '★ 轨迹同样列得出 0');
});

test('【H3】★★ 外供面 tree / summary：JSON 里不得漏出凭空的地 0，而真 0 要读得出', () => {
    const w = new SB.SceneBook();
    w.import(weirdPack());
    assert.deepEqual(w.tree().map((it) => it.floor), [null], '★ 层级树里「没给」如实 null');
    const j = JSON.stringify(w.summary());
    for (const k of ['"floor":0', '"atFloor":0', '"firstFloor":0', '"lastFloor":0']) {
        assert.equal(j.includes(k), false, '★ 外供 JSON 里不得出现匿名的 ' + k);
    }
    const z = new SB.SceneBook();
    z.import(zeroPack());
    const sum = z.summary();
    assert.equal(z.tree()[0].floor, 0, '★ 真给 0 时层级树读得出 0');
    assert.equal(sum.presence[0].atFloor, 0, '★ 真给 0 时在场读得出 0');
    assert.equal(sum.currentChain.length > 0, true, '外供链非空');
});

test('【H4】★★ 回滚面三处：「没给」一格不动 —— 绝不误删合法的第 0 楼', () => {
    const a = new SB.SceneBook();
    assert.equal(a.setLocation(0, ['甲城', '零楼商铺']), true, '第 0 楼照常登记');
    assert.equal(a.setPresence('丙', ['甲城', '零楼商铺'], 0), true, '在场照常登记');
    assert.equal(a.setHeader(0, { date: '零日' }), true, '场景头照常登记');
    const keep = () => a.track.length === 1 && a.presence.size === 1 && a.headers.size === 1;
    assert.equal(a.rollbackFrom(null), 0, '★ rollbackFrom(null) 如实 0（修前 `Number(null)===0` ⇒ 删第 0 楼及以上，整本账清空还报正数）');
    assert.equal(keep(), true, '★ 一格没动');
    a.rollbackFloorOnly(null);
    assert.equal(keep(), true, '★ rollbackFloorOnly(null) 一格没动');
    assert.equal(a.shiftFloorRefs(null), 0, '★ shiftFloorRefs(null) 如实 0（修前整表楼层号减一）');
    assert.equal(keep(), true, '★ 一格没动');
});

test('【H5】★★ 反坐实：回滚面真给 0 必须**真的动**（只做「拒绝」那一半 = 把门关成谁都删不动）', () => {
    const z = new SB.SceneBook();
    z.setLocation(0, ['甲城', '零楼商铺']);
    assert.equal(z.rollbackFrom(0), 0, '第 0 楼及以上被删，节点数归 0');
    assert.equal(z.track.length, 0, '★ 真给 0 时轨迹被清');
    const c = new SB.SceneBook();
    c.apply([{ action: 'add', path: ['甲城', '商铺'] }], 0);
    c.setLocation(0, ['甲城', '商铺']);
    c.rollbackFloorOnly(0);
    assert.equal(c.track.length, 0, '★ 单楼回滚收到真 0 时同样真的动手');
    const s = new SB.SceneBook();
    s.setLocation(0, ['甲城', '零楼']);
    s.setLocation(3, ['甲城', '三楼']);
    // 收到真 0：被删楼（第 0 楼）自己的残留清掉 + 大于它的处数平移（3 → 2），共 2 处
    assert.equal(s.shiftFloorRefs(0), 2, '★ 前移收到真 0 时如实动手（清第 0 楼残留 1 + 平移 3→2 共 1）');
    assert.deepEqual(s.track.map((t) => t.floor), [2], '★ 原第 3 楼被前移成第 2 楼');
});

// ══════════ N 负控制（第二批） ══════════
test('【N11】★★★ 负控制·门本体：numOrNull 退化回 `Number()` 门 → 六面判据必须集体转红', () => {
    // 这条是整套件的**可信度地基**：判据若不是真的挂在门上，其余绿色全是假绿。
    const broken = mutate(sbSrc, AN(8),
        '    if (v === null || v === undefined || v === \'\') return null;\n'
        + '    const n = Number(v);\n'
        + '    return Number.isFinite(n) ? n : null;') + '\n';
    const { SBx, dir } = loadMirror({ 'scene-book.js': broken }, 'n11');
    try {
        const b = new SBx.SceneBook();
        b.import(weirdPack());
        assert.equal(b.nodes.get('甲城').floor, 0, '破坏可观测：`[]` 被强转成第 0 楼');
        assert.equal(b.nodes.get('甲城').updatedAt, 1, '破坏可观测：`true` 被强转成第 1 楼');
        assert.equal(weirdJudgeFails(SBx), false, '★ 怪值面判据转红');
        assert.equal(floorsJudgeFails(SBx), false, '★ visits.floors 判据转红');
        assert.equal(coverageJudgeFails(SBx), false, '★ 列号面判据转红');
        assert.equal(outerJudgeFails(SBx), false, '★ 外供面判据转红');
        // 互不掩护：常规形态（null / undefined / ''）在退化门下仍如实 null ⇒ 常规面判据必须仍成立
        assert.equal(readJudgeFails(SBx), true, '★ 常规读侧判据不受影响（否则一坏全坏，判据失去分辨力）');
        assert.equal(writeJudgeFails(SBx), true, '★ 常规写侧判据不受影响');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N12】★ 负控制：coverage 列号退回 `Number(o.floor)` → 列号判据必须转红', () => {
    const broken = mutate(sbSrc, AN(9),
        '        const floors = [...new Set(this.opsLog.map(o => Number(o.floor)).filter(Number.isFinite))].sort((a, b) => a - b);') + '\n';
    const { SBx, dir } = loadMirror({ 'scene-book.js': broken }, 'n12');
    try {
        const b = new SBx.SceneBook();
        b.import(weirdPack());
        assert.equal(b.coverage().floors.includes(0), true, '破坏可观测：列号里凭空多出第 0 楼');
        assert.equal(coverageJudgeFails(SBx), false, '★ 列号面判据转红');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N13】★ 负控制：rollbackFrom 的守卫退回 `Number(floor)` → 回滚判据必须转红', () => {
    const broken = mutate(sbSrc, AN(10),
        '        const fl = Number(floor);\n        if (!Number.isFinite(fl)) return 0;') + '\n';
    const { SBx, dir } = loadMirror({ 'scene-book.js': broken }, 'n13');
    try {
        const a = new SBx.SceneBook();
        a.setLocation(0, ['甲城', '零楼商铺']);
        assert.equal(a.rollbackFrom(null), 0, '破坏可观测：null 被读成「删第 0 楼及以上」');
        assert.equal(a.track.length, 0, '破坏可观测：合法的第 0 楼被误删');
        assert.equal(rollbackJudgeFails(SBx), false, '★ 回滚面判据转红');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N14】★ 负控制：num 别名退回旧实现 → visits.floors 判据必须转红', () => {
    const broken = mutate(sbSrc, AN(11),
        'const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);') + '\n';
    const { SBx, dir } = loadMirror({ 'scene-book.js': broken }, 'n14');
    try {
        const b = new SBx.SceneBook();
        const p = absentPack();
        p.visits[0][1].floors = [null, '', [], true, false, '怪', 3, '5'];
        b.import(p);
        assert.deepEqual(b.visits.get('甲城').floors, [0, 0, 0, 1, 0, 3, 5],
            '破坏可观测：null / \'\' / [] / false 全被强转成第 0 楼，`true` 甚至造出**第 1 楼**（凭空多一楼比塌成 0 更难发现）');
        assert.equal(floorsJudgeFails(SBx), false, '★ visits.floors 判据转红');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N15】★ 负控制·互不掩护：门退化只打掉怪值面，常规面与真 0 面必须仍成立', () => {
    const broken = mutate(sbSrc, AN(8),
        '    if (v === null || v === undefined || v === \'\') return null;\n'
        + '    const n = Number(v);\n'
        + '    return Number.isFinite(n) ? n : null;') + '\n';
    const { SBx, dir } = loadMirror({ 'scene-book.js': broken }, 'n15');
    try {
        // 常规形态仍如实 null；真给了 0 仍保住 0 —— 这两条在破坏副本上必须**照常成立**，
        //   否则说明判据是「一坏全坏」的粗判，无法定位是哪一面坏了。
        assert.equal(readJudgeFails(SBx), true, '常规读侧判据仍成立');
        const z = new SBx.SceneBook();
        z.import(zeroPack());
        assert.equal(z.nodes.get('乙城').floor, 0, '真 0 面仍成立');
        assert.equal(z.presence.get('苏晴').atFloor, 0, '真 0 在场仍成立');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 同款真判据（visits.floors 面）：怪值不得落成 0 / 1，而真 0 必须留在册。 */
function floorsJudgeFails(SBx) {
    const p = absentPack();
    p.visits[0][1].floors = [null, '', [], true, false, '怪', 3, '5'];
    const b = new SBx.SceneBook();
    b.import(p);
    const got = b.visits.get('甲城').floors;
    const z = new SBx.SceneBook();
    z.import(zeroPack());
    return JSON.stringify(got) === JSON.stringify([3, 5])
        && JSON.stringify(z.visits.get('乙城').floors) === JSON.stringify([0]);
}
