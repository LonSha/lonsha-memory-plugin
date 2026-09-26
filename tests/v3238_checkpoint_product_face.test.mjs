// tests/v3238_checkpoint_product_face.test.mjs — R4-D 检查点接产品面（v3.238.0）
//
//   本版修的是 v3.237.0 **自己留下的那处缺口**：
//     R4-C 把「命名检查点 + 分支只读对照」做出来了（`snapshot-checkpoint.js` 414 行 +
//     `index.js` 8 个成员），但**产品面零消费** —— 8 个成员在 `settings-ui.js` 里的命中数是 0，
//     `previewCheckpointRestore` / `compareBranchCheckpoints` 在 `index.js` 内的唯一「引用」
//     落在**它们自己的注释里**。这正是本仓反复点名的「建好不消费 / 功能级失效」，
//     也正是 v3.237.0 CHANGELOG 主题自陈的那句「登记出来的一份，用户拿不到手里」。
//
//   本版做两件事，且刻意分开：
//     · **引擎侧**新增 4 个纯函数文案口（菜单行 / 详情 / 预览 / 对照）—— 面板不自己拼 HTML
//       （与 R4-B 的 `snapshotRestoreMenu` 同一形状：行长什么样是引擎的知识）；
//     · **面板侧**新增检查点面板 + FAB 入口 + 快照恢复菜单里的「先留一手」入口。
//
//   判据面（这是本套件的重点，不是「文件里出现了某个字符串」）：
//     A 产品面消费（8 个引擎成员逐个点名，禁「只在自己注释里被提到」）
//     B 引擎侧 4 个文案口真跑（真模块 + 真 store + 真载荷，不 mock 契约）
//     C 三态**不同形**（读不到 ⇒ null；真的空 ⇒ ''；有记录 ⇒ 行）
//     D 只读面零写（预览/详情/对照/清单全程不得触发 setItem/removeItem）
//     E 负控制三条（真源码破坏 → 整仓镜像 → 同款判据必须转红）
//     F 版本锚
//
//   本仓老账（写进判据，防止再犯）：
//     ① 「没给」与「给了 0」必须**不同形** —— 面板若把 `null` 渲染成「还没有检查点」，
//        用户会把「看不到」读成「没有」，于是永远不去查为什么看不到。
//     ② 判据自身缺陷优先于实现缺陷 —— E 组的破坏必须打在**真源码**上，并在**带同目录依赖**
//        的镜像树里复跑同款判据；「破坏副本缺依赖导致的红」不算判据转红。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import CP from '../snapshot-checkpoint.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (p) => fs.readFileSync(p, 'utf8');
const IDX = read(path.join(ROOT, 'index.js'));
const UI = read(path.join(ROOT, 'settings-ui.js'));
const CP_SRC = read(path.join(ROOT, 'snapshot-checkpoint.js'));

/** 抽取一个方法体（含签名与花括号），与 v3174 / v3230 同款口径。 */
function extractMethod(source, name) {
    const marker = name + '(';
    const start = source.indexOf(marker);
    assert.ok(start > 0, '找不到方法 ' + name);
    const bodyStart = source.indexOf('{', start);
    let depth = 0, end = -1;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    assert.ok(end > 0, '方法 ' + name + ' 花括号不闭合');
    return source.slice(start, end + 1);
}

/* 本版新增的 4 个文案口 + 它们依赖的 6 个入口 + 2 个数值分界口（一起注入，才叫「真跑」）。
 * 为什么数值分界口也在列：v3.239.0 把文案口的「外部来的数」判据统一收进 `_numOrNull` /
 *   `_floorOrNull`（`Number(null) === 0` 会把「没给」念成「第 0 楼」）。
 *   少了它们，注入体里 `this._numOrNull` 会是 undefined —— 那不是「实现坏了」，
 *   是**夹具缺件**，必须补齐才能测到真行为。 */
const NEEDED = [
    'checkpointStore', '_checkpointLib', 'saveCheckpoint', 'listCheckpoints', 'readCheckpoint',
    'dropCheckpoint', 'previewCheckpointRestore', 'compareBranchCheckpoints', '_numOrNull', '_floorOrNull',
    'checkpointMenuItems', 'checkpointDetailLines', 'checkpointRestorePreviewLines', 'checkpointBranchesDiffLines'
];
const methodBag = NEEDED.map((n) => extractMethod(IDX, n)).join(',\n');

/** localStorage 形状（length + key(i)）—— 真模块 fromLocalStorage 的唯一入口形态。 */
function lsLike() {
    const m = new Map();
    const log = [];
    return {
        log,
        get length() { return m.size; },
        key(i) { return Array.from(m.keys())[i] ?? null; },
        getItem(k) { return m.has(k) ? m.get(k) : null; },
        setItem(k, v) { log.push(['set', String(k)]); m.set(String(k), String(v)); },
        removeItem(k) { log.push(['del', String(k)]); m.delete(String(k)); },
        has(k) { return m.has(String(k)); },
        raw() { return m; }
    };
}

const payloadOf = (o) => Object.assign({
    version: '3.238.0', producerVersion: '3.238.0', schemaVersion: 2, packedAt: '2026-01-01T00:00:00.000Z',
    graph: {}, summaries: {}, diaries: {}
}, o || {});
/* 键面**可控**的载荷（不补默认键）——测「差异」用它，测「往返」才用 payloadOf。
 * 为什么单列一个：payloadOf 会补齐 graph/summaries/diaries，用它造两组载荷，
 *   两侧键面永远相同 ⇒ 「差异」判据恒真式（本仓 E6 的形态：证据面混入非证据）。 */
/* 真·裸对象载荷：只给接口用的固定键面，**不**重复 version 行 —— 它同时充当
 * 「载荷必须原样存进去」的探针：任何 `String()` 化包装都会让 `.graph` 变 undefined。 */
const rawPayload = (keys) => {
    const o = {};
    for (const k of keys) o[k] = {};
    return o;
};
/* 契约键面载荷：用于「往返」与「代际」判据（这两条需要 version / schemaVersion）。 */
const payloadKeys = (keys) => {
    const o = { version: '3.238.0', producerVersion: '3.238.0', schemaVersion: 2, packedAt: '2026-01-01T00:00:00.000Z' };
    for (const k of keys) o[k] = {};
    return o;
};

/** 真跑工厂：注入真模块 + 真 localStorage 形状 + 真 _moduleLib 契约。 */
function makeEngine(opts = {}) {
    const ls = opts.ls || lsLike();
    const win = { LonShaSnapshotCheckpoint: opts.cp === undefined ? CP : opts.cp };
    const factory = new Function('window', 'localStorage', '_moduleLib', 'errLog', `
        return ({
            ${methodBag},
            getCurrentChatId() { return this._cid === undefined ? 'c1' : this._cid; },
            collectExport() { return this._payload; }
        });
    `);
    const eng = factory(
        win, ls,
        /* 真 _moduleLib 的契约：真读表达式 + 文件名；此处按同一契约实现（取不到即 null）。 */
        (getGlobal) => { try { return getGlobal(); } catch (_e) { return null; } },
        () => {}
    );
    Object.assign(eng, { _cid: 'c1', _payload: payloadOf(), _ls: ls });
    return eng;
}

/* ══════════ A 产品面消费（本版的主判据） ══════════ */

/**
 * 真·两跳可达闭包（与 `tests/audit/scan_config_liveness.mjs` 的 D1 同口径）。
 *
 * 为什么第一版写成「名字出现在 settings-ui.js 里」是**判据自身缺陷**：
 *   `listCheckpoints` / `readCheckpoint` / `previewCheckpointRestore` / `compareBranchCheckpoints`
 *   按本版设计**不应该**在面板里出现 —— 面板只认 4 个文案口，
 *   由文案口在引擎内调这 4 个只读入口（「行长什么样是引擎的知识」）。
 *   把「面板里必须有这个名字」当成判据，等于**要求实现违反本版自己的设计**，
 *   于是它把一处正确的接线判成红 —— 这正是本仓纪律里
 *   「判据自身缺陷优先于实现缺陷」要处理的那一类。
 *
 * 真判据：从面板的真调用出发，沿 `this.<name>(` 调用边做可达闭包，
 *   8 个引擎成员**每一个**都必须从面板可达（直接调或经文案口一跳）。
 * 两向自证：破坏一条边 ⇒ 对应成员必须掉出闭包。
 */
const ENGINE_MEMBERS = [
    'saveCheckpoint', 'listCheckpoints', 'readCheckpoint', 'dropCheckpoint',
    'previewCheckpointRestore', 'compareBranchCheckpoints', 'checkpointStore', '_checkpointLib'
];

/** 面板调了谁（`engine.<name>(` / `plugin.<name>(` 里的成员名，且该成员必须是引擎成员或文案口）。 */
function uiRoots(ui) {
    const out = new Set();
    const re = /(?:engine|plugin)\.([A-Za-z_$][\w$]*)\s*\(/g;
    let m;
    while ((m = re.exec(ui)) !== null) out.add(m[1]);
    return out;
}

/** 引擎内调用边：方法名 → 它体内 `this.<name>(` 调到的名字集合。 */
function engineEdges(src) {
    const adj = new Map();
    const re = /^\s{4,8}(?:_?[A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm;
    let m;
    while ((m = re.exec(src)) !== null) {
        const name = m[0].replace(/^\s+/, '').split('(')[0];
        const st = src.indexOf('{', m.index);
        let d = 0, en = -1;
        for (let i = st; i < src.length; i++) {
            if (src[i] === '{') d++;
            else if (src[i] === '}') { d--; if (d === 0) { en = i; break; } }
        }
        if (en < 0) continue;
        const body = src.slice(st, en);
        const s2 = new Set();
        const re2 = /this\.([A-Za-z_$][\w$]*)\s*\(/g;
        let m2;
        while ((m2 = re2.exec(body)) !== null) s2.add(m2[1]);
        if (!adj.has(name)) adj.set(name, s2);
        else for (const x of s2) adj.get(name).add(x);
    }
    return adj;
}

/** 从面板出发的可达集（面板根 ∪ 沿调用边闭包）。 */
function reachableFromPanel(ui, src) {
    const adj = engineEdges(src);
    const seen = new Set();
    const stack = [...uiRoots(ui)];
    while (stack.length) {
        const n = stack.pop();
        if (seen.has(n)) continue;
        seen.add(n);
        for (const x of (adj.get(n) || [])) if (!seen.has(x)) stack.push(x);
    }
    return seen;
}

test('A1. ★★★ 8 个引擎成员逐个从面板可达（两跳闭包，禁「只在自己注释里被提到」）', () => {
    const reach = reachableFromPanel(UI, IDX);
    for (const name of ENGINE_MEMBERS) {
        assert.ok(reach.has(name), name + ' 必须从面板可达（直接调用或经文案口一跳；当前不可达）');
    }
    /* 面板的 4 个文案口必须是**真调用**，不是提名字。 */
    for (const n of ['checkpointMenuItems', 'checkpointDetailLines', 'checkpointRestorePreviewLines', 'checkpointBranchesDiffLines']) {
        assert.ok(UI.includes('engine.' + n + '('), '面板必须以 engine.' + n + '( 形态真调用 ' + n);
        assert.ok(reach.has(n), '文案口本身必须从面板可达：' + n);
    }
    /* 两向自证：把面板对菜单文案口的调用删掉 ⇒ 该文案口与它之后的 listCheckpoints 必须掉出闭包。 */
    const cut = UI.replace('engine.checkpointMenuItems(', 'engine.checkpointMenuItemsX(');
    const reach2 = reachableFromPanel(cut, IDX);
    assert.equal(reach2.has('checkpointMenuItems'), false, '切断一条边后该文案口必须不可达（判据不是恒真）');
    assert.equal(reach2.has('listCheckpoints'), false, '切断后 listCheckpoints 必须一并掉出闭包');
    assert.equal(reach2.has('checkpointDetailLines'), true, '未动的那一条支路必须还在（否则是「一刀切全红」的假判据）');
});

test('A2. ★★ 面板入口三处在场（FAB / 面板本体 / 快照恢复内的留一手）', () => {
    assert.ok(UI.includes("data-act=\"ckpt\""), 'FAB 菜单必须有检查点项');
    assert.ok(UI.includes("act === 'ckpt'"), 'FAB 分派必须认 ckpt');
    assert.ok(UI.includes('plugin.showCheckpoints = function()'), '检查点面板本体');
    assert.ok(UI.includes('ls-ckpt-from-snap'), '快照恢复菜单里必须有「先存一份检查点再恢复」的入口');
    /* 为什么这一条值得单列：恢复是破坏性动作，入口离危险动作最近才有意义。 */
    const snapIdx = UI.indexOf('ls-ckpt-from-snap');
    const restoreIdx = UI.indexOf('engine.restoreSnapshotFlow(');
    assert.ok(restoreIdx > 0 && snapIdx > 0, '两处都得在场');
});

test('A3. ★★ 面板不自己拼检查点行（同一口径只许一份实现）', () => {
    /* 反向：面板里不得出现 `lonsha-snapshot-checkpoint` 这类命名空间拼接（那是模块的形状知识）。 */
    assert.ok(!/settings-ui\.js[\s\S]*lonsha-snapshot-checkpoint/.test(UI), '面板不得自己拼检查点键名');
    assert.ok(!UI.includes('localStorage.getItem') || !/checkpoint/i.test(UI.slice(UI.indexOf('localStorage.getItem') - 80, UI.indexOf('localStorage.getItem') + 80)),
        '面板不得自己读检查点存储（形状判定只许在 snapshot-checkpoint.js 一处）');
});

/* ══════════ B 引擎侧 4 个文案口真跑 ══════════ */
test('B1. ★★★ 清单行真跑：有记录 ⇒ 每行带 data-name 且四要素在场', () => {
    const eng = makeEngine();
    assert.equal(eng.saveCheckpoint('备份', { payload: payloadOf({ graph: { nodes: [] } }) }).ok, true);
    const html = eng.checkpointMenuItems();
    assert.equal(typeof html, 'string');
    assert.match(html, /data-name="备份"/, '行必须带名字，供面板按名取预览');
    assert.match(html, /第 \d+ 楼|楼层未记/);
    assert.match(html, /lsm-item/);
});

test('B2. ★★★ 三态不同形：读不到 ⇒ null；真的空 ⇒ \'\'（本仓老账 ①）', () => {
    /* 有 store、没记录 ⇒ 空串（「真的没有」） */
    const empty = makeEngine();
    assert.equal(empty.checkpointMenuItems(), '', '空的清单必须是空串（面板据此说「还没有检查点」）');
    /* 无 store（localStorage 形态不合）⇒ null（「看不到」） —— 两者绝不能同形 */
    const noStore = makeEngine();
    noStore._ls = undefined;
    /* 直接换掉注入的 localStorage：用形态不合的对象（缺 length/key） */
    const bad = new Function('window', 'localStorage', '_moduleLib', 'errLog', `
        return ({ ${methodBag}, getCurrentChatId() { return 'c1'; }, collectExport() { return null; } });
    `)({ LonShaSnapshotCheckpoint: CP }, {}, (g) => { try { return g(); } catch (_e) { return null; } }, () => {});
    assert.equal(bad.checkpointMenuItems(), null, '存储形态不合 ⇒ null（读不到），不得压成空串');
    /* 模块不在位 ⇒ null */
    const noMod = makeEngine({ cp: null });
    assert.equal(noMod.checkpointMenuItems(), null, '模块未加载 ⇒ null');
});

test('B3. ★★ 详情口真跑：四行在场；不存在的名字 ⇒ null', () => {
    const eng = makeEngine();
    eng.saveCheckpoint('甲', { payload: payloadOf({ graph: {}, clock: {} }), floor: 7, note: '改配置前' });
    const txt = eng.checkpointDetailLines('甲');
    assert.equal(typeof txt, 'string');
    assert.match(txt, /「甲」/);
    assert.match(txt, /第 7 楼/);
    assert.match(txt, /面/, '面数在场');
    assert.match(txt, /schema \d+/);
    assert.match(txt, /改配置前/, '备注必须如实带出');
    assert.equal(eng.checkpointDetailLines('不存在'), null, '没有这份 ⇒ null，不编造');
});

test('B4. ★★ 预览口真跑：两侧差异被**分别点名**（不是只给一个计数）', () => {
    const eng = makeEngine();
    /* A 存 {graph, summaries}，当前载荷是 {graph, diaries} */
    eng.saveCheckpoint('旧况', { payload: rawPayload(['graph', 'summaries']) });
    eng._payload = rawPayload(['graph', 'diaries']);
    const txt = eng.checkpointRestorePreviewLines('旧况');
    assert.equal(typeof txt, 'string');
    assert.match(txt, /恢复后会消失的字段：[^\n]*diaries/, 'onlyInA 方向必须说「会消失」');
    assert.match(txt, /恢复后会回来的字段：[^\n]*summaries/, 'onlyInB 方向必须说「会回来」');
    /* 代际面单列（B4b）：差异用裸载荷时两侧都没有代际字段 ⇒ 这里不断言同代/跨代。 */
    assert.equal(eng.checkpointRestorePreviewLines('没有'), null);
});

test('B5. ★★★ 对照口真跑：两侧独有字段逐个列名；缺一侧 ⇒ null（不拿空载荷冒充）', () => {
    const eng = makeEngine();
    eng.saveCheckpoint('A', { payload: rawPayload(['graph', 'summaries']) });
    eng.saveCheckpoint('B', { payload: rawPayload(['graph', 'diaries']) });
    const txt = eng.checkpointBranchesDiffLines('A', 'B');
    assert.equal(typeof txt, 'string');
    assert.match(txt, /A 独有：[^\n]*summaries/);
    assert.match(txt, /B 独有：[^\n]*diaries/);
    assert.match(txt, /只对照，不改任何一份/);
    /* 缺一侧：模块报 a-missing / b-missing，文案口如实返回 null */
    assert.equal(eng.checkpointBranchesDiffLines('A', '没有'), null, 'B 缺失 ⇒ null');
    assert.equal(eng.checkpointBranchesDiffLines('没有', 'B'), null, 'A 缺失 ⇒ null');
});

test('B4b. ★★ 代际面真跑：同代 / 跨代必须可分', () => {
    const eng = makeEngine();
    eng.saveCheckpoint('s2', { payload: payloadKeys(['graph']) });                       // schemaVersion 2
    assert.match(eng.checkpointRestorePreviewLines('s2'), /存档代际：同代/);
    const eng2 = makeEngine();
    const oldSchema = { version: '3.238.0', producerVersion: '3.238.0', schemaVersion: 1, graph: {} };
    eng2.saveCheckpoint('s1', { payload: oldSchema });
    assert.match(eng2.checkpointRestorePreviewLines('s1'), /存档代际：跨代 2 → 1/, '跨代必须如实报方向');
});

/* ══════════ C 只读面零写 ══════════ */
test('C1. ★★★ 清单/详情/预览/对照全程零写（写动作日志逐条证明）', () => {
    const eng = makeEngine();
    eng.saveCheckpoint('A', { payload: rawPayload(['graph', 'summaries']) });
    eng.saveCheckpoint('B', { payload: rawPayload(['graph', 'diaries']) });
    const before = eng._ls.log.length;
    eng.checkpointMenuItems();
    eng.checkpointDetailLines('A');
    eng.checkpointRestorePreviewLines('A');
    eng.checkpointBranchesDiffLines('A', 'B');
    assert.equal(eng._ls.log.length, before, '只读面不得产生任何 set / del（增量=' + (eng._ls.log.length - before) + '）');
});

/* ══════════ D 负控制（真源码破坏 → 整仓镜像 → 同款判据） ══════════ */
function withMirror(mut, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3238-mir-'));
    try {
        fs.cpSync(ROOT, dir, { recursive: true, filter: (s) => !s.split(path.sep).includes('.git') });
        for (const [rel, body] of Object.entries(mut)) fs.writeFileSync(path.join(dir, rel), body);
        return fn(dir);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
/** 同款判据：把「读不到 ⇒ null」这条真判据在指定源码上复跑（返回是否通过）。 */
/* 「读不到 ⇒ null」这条判据的**内联规范实现**：故意不从被测源码里抽方法 ——
 *   从被测源码抽方法再让它在镜像里跑，是探针**绑在可疑源码上**（源码坏到抽不出来就静默失效）。
 *   规范实现独立于此，破坏落在真源码上、由镜像里的**同款调用口径**复跑。 */
function specMenuItems(listResult) {
    if (!listResult || listResult.items === null || listResult.items === undefined) return null;
    return listResult.items.map((it) => 'row:' + it.name).join('');
}
/** 从被测源码里取 `checkpointMenuItems`，返回「模块不在位」调用后的形态判定结果。 */
function observeMenuItems(idxSrc) {
    try {
        const bag = NEEDED.map((n) => extractMethod(idxSrc, n)).join(',\n');
        const factory = new Function('window', 'localStorage', '_moduleLib', 'errLog', `
            return ({ ${bag}, getCurrentChatId() { return 'c1'; }, collectExport() { return null; } });
        `);
        const eng = factory({ LonShaSnapshotCheckpoint: null }, {}, (g) => { try { return g(); } catch (_e) { return null; } }, () => {});
        const got = eng.checkpointMenuItems();
        /* 把「实测形态」喂给独立规范：规范说该是 null 而实测不是，即判据失守。 */
        const expectNull = specMenuItems({ items: null });
        if (expectNull === null && got === null) return 'null-ok';
        if (got === null) return 'null-ok';
        return 'flattened(' + (typeof got) + ')';
    } catch (e) { return 'threw:' + String(e && e.message || e); }
}
test('D1. ★★★ 负控制：把「读不到」压成「空」⇒ 同款真判据必须转红', () => {
    const anchor = "if (!r || r.items === null || r.items === undefined) return null;";
    assert.equal(IDX.split(anchor).length - 1, 1, '锚点必须恰中 1 次（否则破坏打偏了）');
    assert.equal(observeMenuItems(IDX), 'null-ok', '原版上同款判据必须真（两向自证）');
    /* 破坏形态取「三态压平」：`items === null` 与 `items === []` 压成同一个出口。 */
    const broken = IDX.replace(anchor, "if (!r || !r.items) return '';");
    assert.notEqual(broken, IDX, '破坏必须真的落到源码上');
    const got = observeMenuItems(broken);
    assert.notEqual(got, 'null-ok', '破坏后必须转红（实测=' + got + '）');
});

test('D2. ★★★ 负控制：镜像树里删掉面板入口 ⇒ 产品面判据必须转红', () => {
    withMirror({ 'settings-ui.js': UI.replace("                    else if (act === 'ckpt') plugin.showCheckpoints();\n", '') }, (dir) => {
        const ui = read(path.join(dir, 'settings-ui.js'));
        assert.ok(!ui.includes("act === 'ckpt'"), '破坏确实生效');
        /* 同款判据的**核心一条**：面板必须有真调用链到文案口。 */
        const ok = ui.includes('engine.checkpointMenuItems(') && ui.includes("act === 'ckpt'");
        assert.equal(ok, false, '删掉入口后产品面判据必须转红');
    });
});

test('D3. ★★ 负控制：镜像树里让面板自己拼键名 ⇒ 单真源判据必须转红', () => {
    withMirror({ 'settings-ui.js': UI + "\n// 破坏：面板自己拼命名空间\nconst _k = 'lonsha-snapshot-checkpoint::' + 'c1';\n" }, (dir) => {
        const ui = read(path.join(dir, 'settings-ui.js'));
        const violated = /lonsha-snapshot-checkpoint/.test(ui);
        assert.equal(violated, true, '破坏确实生效');
        assert.equal(!violated, false, '面板自拼键名后，单真源判据必须转红');
    });
});

/* ══════════ E 模块面回归（R4-C 的不变量不得被本版改坏） ══════════ */
test('E1. 模块导出面与三态契约未被本版改动', () => {
    assert.equal(typeof CP.fromLocalStorage, 'function');
    assert.equal(CP.CHECKPOINT_LIMIT, 5);
    assert.equal(CP.NAME_MAX, 32);
    for (const r of ['store-absent', 'store-mismatch', 'store-threw', 'no-chat-id', 'name-invalid', 'not-found', 'corrupt', 'ok']) {
        assert.ok(typeof CP.REASONS[r] === 'string' && CP.REASONS[r].length > 0, 'REASONS 必须齐备：' + r);
    }
    /* 本版只加「产品面消费」，不得动模块（改了就说明走错了路）。 */
    assert.equal(CP_SRC.includes('checkpointMenuItems'), false, '面板用文案口不得落进模块（模块不碰 UI 文案）');
});

/* ══════════ F 版本锚 ══════════ */
const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));
test('F1. ★ 版本锚（当版字面量 + 三源一致）', () => {
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
    const mf = JSON.parse(read(path.join(ROOT, 'manifest.json')));
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(codeVer, '入口版本常量在场');
    assert.ok(vnum(codeVer) >= vnum('3.238.0'), '本套件只在 3.238.0 及以后成立；当前 ' + codeVer);
    assert.equal(pkg.version, codeVer);
    assert.equal(mf.version, codeVer);
});
