/* ============================================================
 * tests/v3222_scene_rollback_closure.test.mjs — [v3.221.0] Gate R3-D
 *
 * 版本锚点（v3.221.0）：本套件恰好锚着它自己的出生版本，供版本守卫 V4 取基准。
 *
 * 主题：**场所三面（层级树 / 到访史 / 本楼场景头）在回读与回滚面上的收口**。
 *
 * 背景：R3-A（v3.220.0）只把三面「写出去」了（summary 外供 + 下游渲染三卡），
 *   而三面在四条路径上全部脱钩 —— 修前逐条实测：
 *     ① `import()` 全路径用 `num(x) ?? 0`：`Number(null) === 0`、`Number('') === 0`，
 *        于是「这一格没给」被读成「第 0 楼」（0 是**合法楼层**，与「没给」同形最贵）；
 *     ② `setHeader(null)` / `headerAt('')` 把「没给」读成第 0 楼，且真的写进去了；
 *     ③ 删楼：`headers` 一格不动（删掉第 7 楼后 `headerAt(7)` 照样答「8月2日 · 暴雨」），
 *        而宿主在回滚后无条件 `clearPresence?.()` 把在场**整表全清**（第 9 楼那批人一起没了）；
 *     ④ 前移：`headers`/`presence` 一格不动，且不认「被删楼自身的残留」——
 *        第 8 楼前移成 7 楼后与残留撞成两条 7 楼（连做两次得 track=[3,7,7]）；
 *     ⑤ 导入旧格式存档（只有 nodes/track、无 opsLog）后第一次单楼编辑
 *        把**整棵树清成 0 个节点**（清了没人重建）；
 *     ⑥ `coverage()` 不含任何场景头读数 ⇒ 删楼/前移对 headers 的处理
 *        **没有任何判据面**：改坏了也看不出来。
 *   读数撒谎（说「那天 8月2日 暴雨」而那一天已被删掉）比缺读数更糟。
 *
 * 层次：A 「没给」不再被编成 0 / 不再读成第 0 楼
 *       B 回滚与前移真认三面（删楼撤本楼、前移跟随、级联同语义）
 *       C 重建不缩水（无真源的导入存档不得被清空式重建）
 *       D 有界性（MAX_HEADERS 真被消费：写侧与载入侧同一个数）
 *       E 只读（读侧不得改账本）
 *       F 负控制（真源码破坏 → 破坏副本 → 同款真判据必须转红）
 *       G 接线与退路同形 + 版本锚
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const SB_PATH = path.join(REPO, 'scene-book.js');
const LR_PATH = path.join(REPO, 'ledger-replay.js');
const SB = require(SB_PATH);
const LR = require(LR_PATH);
const sbSrc = fs.readFileSync(SB_PATH, 'utf8');
const lrSrc = fs.readFileSync(LR_PATH, 'utf8');
const idxSrc = fs.readFileSync(path.join(REPO, 'index.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));
function vnum(s) {
    const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
    return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

/** 夹具：三楼各登记一景 + 一次移动 + 一条场景头 + 一个在场。 */
function fixture() {
    const b = new SB.SceneBook();
    b.apply([{ action: 'add', path: ['甲城', '东巷'] }], 3);
    b.apply([{ action: 'add', path: ['甲城', '西巷'] }], 7);
    b.apply([{ action: 'add', path: ['乙城', '南巷'] }], 9);
    b.setLocation(3, ['甲城', '东巷']);
    b.setLocation(7, ['甲城', '西巷']);
    b.setLocation(9, ['乙城', '南巷']);
    b.setHeader(3, { date: '8月1日' });
    b.setHeader(7, { date: '8月2日', weather: '暴雨' });
    b.setHeader(9, { date: '8月3日' });
    b.setPresence('林晚', ['甲城', '东巷'], 3);
    b.setPresence('苏晴', ['乙城', '南巷'], 9);
    return b;
}

// ══════════ A 「没给」不再被编成 0 / 不再读成第 0 楼 ══════════
test('【A1】★ import：八格「没给」不得落成第 0 楼（0 是合法楼层，与没给同形最贵）', () => {
    const b = new SB.SceneBook();
    b.import({
        nodes: [{ path: ['甲城'], desc: 'd' }],
        track: [{ pathKey: '甲城' }],
        opsLog: [{ ops: [{ action: 'add', path: ['甲城'] }] }],
        visits: [['甲城', { count: 1, floors: [3] }]],
        presence: [['林晚', { key: '甲城' }]],
        headers: [['', { date: 'x月x日' }]]
    });
    assert.equal(b.nodes.get('甲城').floor, 0, '节点 floor 缺省仍是 0（apply 侧的既有口径，未动）');
    assert.equal(b.nodes.get('甲城').updatedAt, 0, 'updatedAt 缺省 0（同上）');
    assert.equal(b.track[0].floor, 0, 'track 缺省 0（同上）');
    assert.equal(b.opsLog[0].floor, 0, 'opsLog 缺省 0（同上）');
    assert.equal(b.visits.get('甲城').firstFloor, 0, '到访 firstFloor 缺省 0（同上）');
    assert.equal(b.presence.get('林晚').atFloor, 0, '在场 atFloor 缺省 0（同上）');
    assert.deepEqual([...b.headers.keys()], [], '★ 空字符串键的**场景头**被拒（不落成第 0 楼的那条假天气）');
});

test('【A2】★ setHeader / headerAt：`null` 与 `\'\'` 都算「没给」，必须拒绝而不是写进第 0 楼', () => {
    const b = new SB.SceneBook();
    assert.equal(b.setHeader(null, { date: 'X月X日' }), false, '★ setHeader(null) 拒绝写入');
    assert.equal(b.setHeader('', { date: 'X月X日' }), false, '★ setHeader(\'\') 拒绝写入');
    assert.equal(b.setHeader(undefined, { date: 'X月X日' }), false, '★ setHeader(undefined) 拒绝写入');
    assert.deepEqual([...b.headers.keys()], [], '★ 一个场景头都没落进来');
    assert.equal(b.headerAt(''), null, '★ headerAt(\'\') 如实 null（不回退到第 0 楼）');
    assert.equal(b.headerAt(null), null, '★ headerAt(null) 如实 null');
    assert.equal(b.headerAt(undefined), null, 'headerAt(undefined) 如实 null');
    // 正例：真有楼层就必须写得进、读得出（不得把门关成「谁都不许写」）
    assert.equal(b.setHeader(3, { date: '3日' }), true, '有楼层照样写得进');
    assert.equal(b.headerAt(3).date, '3日', '有楼层照样读得出');
    assert.equal(b.headerAt(0), null, '第 0 楼没有场景头就是 null（0 是合法楼层，不等同于「没给」）');
});

test('【A3】★ import 的场景头键：`` / `null` 一律跳过，不静默落成第 0 楼', () => {
    const b = new SB.SceneBook();
    b.import({ headers: [[null, { date: '8月1日' }], ['', { date: '8月2日' }], ['3', { date: '8月3日' }]] });
    assert.deepEqual([...b.headers.keys()], [3], '★ 只有真楼层键落进来（null/空串被跳）');
    assert.equal(b.headerAt(0), null, '★ 第 0 楼没有被谁偷偷登记过');
    assert.equal(b.headerAt(3).date, '8月3日', '字符串楼层键照旧读得进（既有兼容性不变）');
});

test('【A4】★ export→import 往返：`[null, ...]` 这种畸形导出不得把第 0 楼场景头「复原」出来', () => {
    const a = new SB.SceneBook();
    a.setHeader(7, { date: '8月2日' });
    const dump = a.export();
    dump.headers.push([null, { date: '伪造' }]);      // 手工构造的畸形对（旧版会落成第 0 楼）
    const b = new SB.SceneBook(dump);
    assert.deepEqual([...b.headers.keys()], [7], '★ 往返后只有真楼层那条');
    assert.equal(b.headerAt(0), null, '★ 第 0 楼读数仍是 null');
});

// ══════════ B 回滚与前移真认三面 ══════════
test('【B1】★ 删楼：撤**本楼**场景头；在场按楼层清，不得整表全清', () => {
    const b = fixture();
    LR.replayDrop({ scene: b }, 7);
    assert.deepEqual(b.track.map((t) => t.floor), [3, 9], '轨迹如实只掉被删那楼');
    assert.deepEqual([...b.headers.keys()], [3, 9], '★ 被删楼的场景头随之消失（不再答「8月2日 · 暴雨」）');
    assert.equal(b.headerAt(7), null, '★ headerAt(7) 如实 null');
    assert.equal(b.headerFace(7), null, '★ 外供面同样如实 null');
    assert.deepEqual([...b.presence.keys()].sort(), ['林晚', '苏晴'], '★ 在场只清停在该楼的人（苏晴仍在名册上）');
    assert.equal(b.whereIs('苏晴').atFloor, 9, '★ 苏晴的所在未被殃及（单楼语义不得扩成全清）');
});

test('【B2】★ 删楼之后 coverage 如实列出场景头楼层（此前这一面无任何判据面）', () => {
    const b = fixture();
    LR.replayDrop({ scene: b }, 7);
    const cov = b.coverage();
    assert.deepEqual(cov.headerFloors, [3, 9], '★ 覆盖度列出场景头楼层，可逐楼对账');
    assert.equal(cov.headerCount, 2, '★ 条数如实');
    assert.ok(!cov.headerFloors.includes(7), '★ 被删楼不在列号里');
});

test('【B3】★ 前移：三面一起跟（track / headers / presence 同向平移）', () => {
    const b = fixture();
    LR.replayShift({ scene: b }, 7);
    assert.deepEqual(b.track.map((t) => t.floor), [3, 8], '轨迹跟随（9 → 8）');
    assert.deepEqual([...b.headers.keys()].sort((x, y) => x - y), [3, 8], '★ 场景头跟随（9 → 8）');
    assert.equal(b.headerAt(8).date, '8月3日', '★ 前移后「那天什么天气」跟着搬到新楼层号');
    assert.equal(b.headerAt(9), null, '★ 旧楼层号上不留残留');
    assert.equal(b.whereIs('苏晴').atFloor, 8, '★ 在场跟随（atFloor 同步平移到 8）');
});

test('【B4】★ 前移必须认「被删楼自身的残留」：不得与平移动来的条目撞成两条同楼', () => {
    const b = fixture();                       // 第 7 楼第 8 楼都有东西；删 7 后原 8 → 7
    LR.replayShift({ scene: b }, 7);
    const floors = b.track.map((t) => t.floor);
    assert.equal(new Set(floors).size, floors.length, '★ 轨迹不出现重复楼层（修前得 [3,7,7]）');
    assert.deepEqual(floors, [3, 8], '★ 被删楼残留已被摘、9 楼平移到 8');
    assert.equal(b.track.filter((t) => t.floor === 7).length, 0, '★ 第 7 楼上没有残留条目');
});

test('【B5】★ 级联回滚（rollbackFrom）同语义：该楼**及以上**的场景头一并撤', () => {
    const b = fixture();
    b.rollbackFrom(7);
    assert.deepEqual([...b.headers.keys()], [3], '★ >= 7 的场景头全撤（级联语义与前移/单楼一致）');
    assert.equal(b.headerAt(9), null, '★ 第 9 楼的场景头也撤了（级联不是单楼）');
    assert.ok(b.headerAt(3), '第 3 楼保留（< 7）');
});

// ══════════ C 重建不缩水 ══════════
test('【C1】★ 无 opsLog 真源的导入存档：单楼编辑不得把整棵树清空', () => {
    const b = new SB.SceneBook();
    b.import({
        nodes: [{ path: ['甲城'], floor: 3, desc: 'a' }, { path: ['乙城'], floor: 9, desc: 'b' }],
        track: [{ floor: 3, pathKey: '甲城' }, { floor: 9, pathKey: '乙城' }]
    });
    assert.equal(b.nodes.size, 2, '导入后两处场所都在');
    b.rollbackFloorOnly(9);
    assert.ok(b.nodes.size >= 1, '★ 修前这里是 0（整棵树被清空，因为 opsLog 空 ⇒ 没有人重建）');
    assert.equal(b.nodes.has('乙城'), false, '★ 被删那楼的登记如实摘掉');
    assert.equal(b.nodes.has('甲城'), true, '★ 其余节点保留（导入存档恰恰最需要保住数据）');
    assert.ok(b.track.length >= 0, '不抛');
});

test('【C2】★ 有真源时重建口径不变：同一现场重建前后到访读数不得漂', () => {
    const b = new SB.SceneBook();
    b.apply([{ action: 'add', path: ['甲', '乙'], desc: 'd' }], 2);
    b.setLocation(2, ['甲', '乙']);
    b.setLocation(6, ['甲', '乙']);
    const before = JSON.stringify(b.visitsOf(['甲', '乙']));
    b.rollbackFloorOnly(99);
    assert.equal(JSON.stringify(b.visitsOf(['甲', '乙'])), before, '★ 重建仍可复现（既有口径未动）');
    const c = new SB.SceneBook();
    c.apply([{ action: 'add', path: ['甲'] }], 1);
    c.apply([{ action: 'add', path: ['丙'] }], 6);
    c.setLocation(1, ['甲']);
    c.setLocation(6, ['丙']);
    c.rollbackFloorOnly(6);
    assert.equal(c.visitsOf(['丙']), null, '★ 删楼后该楼到访读数随之消失（不是旧账影子）');
    assert.ok(c.visitsOf(['甲']), '未删楼保留');
});

test('【C3】★ 无真源降级不得假装重建过：真源在场时仍按 opsLog 重放（不被降级分支截胡）', () => {
    const b = new SB.SceneBook();
    b.apply([{ action: 'add', path: ['甲'], desc: 'a' }], 1);
    b.apply([{ action: 'add', path: ['乙'], desc: 'b' }], 4);
    assert.equal(b.nodes.size, 2, '两处登记');
    b.rollbackFloorOnly(4);
    assert.equal(b.nodes.size, 1, '★ 有 opsLog ⇒ 走真重放（乙被摘、甲仍在）');
    assert.equal(b.nodes.has('甲'), true, '重放结果可复现');
});

// ══════════ D 有界性 ══════════
test('【D1】★ MAX_HEADERS 真被消费：写侧与载入侧同一个数（不再是一处硬编码、一处无上限）', () => {
    assert.ok(SB.MAX_HEADERS >= 1, '导出上限常量');
    assert.equal(sbSrc.split('MAX_HEADERS').length - 1 >= 3, true, '常量被声明 + 写侧 + 载入侧消费（≥3 处）');
    const b = new SB.SceneBook();
    for (let i = 1; i <= SB.MAX_HEADERS + 40; i++) b.setHeader(i, { date: 'd' + i });
    assert.ok(b.headers.size <= SB.MAX_HEADERS, '★ 写侧不越上限（实 ' + b.headers.size + '）');
    // 载入侧同受上限：手工构造的超大存档不得把场景头撑到任意规模
    const big = [];
    for (let i = 1; i <= SB.MAX_HEADERS + 400; i++) big.push([i, { date: 'x' + i }]);
    const c = new SB.SceneBook();
    c.import({ headers: big });
    assert.ok(c.headers.size <= SB.MAX_HEADERS, '★ 载入侧不越上限（实 ' + c.headers.size + '）');
});

// ══════════ E 只读 ══════════
test('【E1】★ 读侧全只读：coverage / tree / visitHistory / headerFace 取完账本逐字节不变', () => {
    const b = fixture();
    const before = JSON.stringify(b.export());
    b.summary(); b.tree(); b.visitHistory(); b.headerFace(7); b.coverage(); b.checkInvariants();
    assert.equal(JSON.stringify(b.export()), before, '★ 读侧不得改账本（含 headers 之类的隐写）');
});

test('【E2】★ 回滚面不抛：畸形输入（非数值楼层 / 空头）一路不抛', () => {
    const b = fixture();
    assert.doesNotThrow(() => b.clearHeader(null), 'clearHeader(null) 不抛');
    assert.equal(b.clearHeader(''), false, 'clearHeader(\'\') 如实 false');
    assert.doesNotThrow(() => b.shiftFloorRefs('怪'), 'shiftFloorRefs(怪) 不抛');
    assert.equal(b.shiftFloorRefs('怪'), 0, '取不到数如实 0（不假装搬过）');
    assert.doesNotThrow(() => LR.replayDrop({ scene: b }, 7), '回放不抛');
    assert.doesNotThrow(() => LR.replayShift({ scene: b }, 7), '回放不抛');
    assert.doesNotThrow(() => LR.replayShift({ scene: {} }, 7), '空宿主不抛（如实 0）');
});

// ══════════ F 负控制（真源码破坏 → 破坏副本 → 同款真判据） ══════════
/** 判据纯度：形态判据一律先剥注释（注释里提到旧写法不得误报）。
 *  并**先切掉 clearHeader 方法体**——它体内本来就有 `this.headers.delete(f);`，
 *  不切的话「回滚面按楼层撤场景头」这条判据会被它恒真兜住
 *  （真代码把回滚面那行删了，判据仍然绿 ⇒ 判据失效）。这是本仓库反复踩过的形态。 */
function formJudged(srcText) {
    return srcText
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^[ \t]*\/\/.*$/gm, '')
        .replace(/[ \t]+\/\/.*$/gm, '');
}
function withoutClearHeaderBody(srcText) {
    const s = srcText.indexOf('    clearHeader(floor) {');
    if (s < 0) return srcText;
    const e = srcText.indexOf('\n    }', s);
    if (e < 0) return srcText;
    return srcText.slice(0, s) + srcText.slice(e);
}
function rollbackClearsHeaderJudge(srcText) {
    return /this\.headers\.delete\(f\);/.test(withoutClearHeaderBody(formJudged(srcText)));
}
/** 三条调用点闭合：真源码里删除该调用点后，同款判据必须转红。 */
function closureJudge(sbSrcT, lrSrcT, idxSrcT) {
    return {
        // 回滚面按楼层撤场景头（判据扣在 clearHeader 之外，见 rollbackClearsHeaderJudge）
        rollbackClearsHeader: rollbackClearsHeaderJudge(sbSrcT),
        // 前移交给模块（登记项里必须出现 shiftFloorRefs 调用）
        ledgerShiftsThroughModule: /h\.scene\.shiftFloorRefs\(d\)/.test(formJudged(lrSrcT)),
        // 宿主不再整表全清在场（判据：剥注释后不得出现 clearPresence?.()）
        hostNoFullClear: !/this\.scene\.clearPresence\?\.\(\);/.test(formJudged(idxSrcT)),
        // 无真源降级分支存在（清空式重建的护栏）
        hasNoSourceGuard: /if \(!this\.opsLog\.length\) \{/.test(formJudged(sbSrcT)),
        // 覆盖度含场景头列号
        coverageHasHeaderFloors: /headerFloors:/.test(formJudged(sbSrcT))
    };
}
/** 行为面闭合判据：真加载一份 ledger-replay.js 副本，验「前移是否真跟三面」。 */
function shiftFollowsFaces(LRx) {
    const b = new SB.SceneBook();
    b.apply([{ action: 'add', path: ['甲'] }], 3);
    b.apply([{ action: 'add', path: ['丙'] }], 9);
    b.setLocation(3, ['甲']);
    b.setLocation(9, ['丙']);
    b.setHeader(3, { date: '8月1日' });
    b.setHeader(9, { date: '8月3日' });
    b.setPresence('苏晴', ['丙'], 9);
    LRx.replayShift({ scene: b }, 7);
    return b.track.map((t) => t.floor).join(',') === '3,8'
        && [...b.headers.keys()].sort((x, y) => x - y).join(',') === '3,8'
        && b.whereIs('苏晴').atFloor === 8;
}
/** 行为面闭合判据：删楼是否真撤本楼场景头（且不整表清在场）。 */
function dropClearsHeaderOnly(SBx) {
    const b = new SBx.SceneBook();
    b.apply([{ action: 'add', path: ['甲'] }], 3);
    b.apply([{ action: 'add', path: ['乙'] }], 7);
    b.apply([{ action: 'add', path: ['丙'] }], 9);
    b.setLocation(3, ['甲']); b.setLocation(7, ['乙']); b.setLocation(9, ['丙']);
    b.setHeader(7, { date: '8月2日' });
    b.setPresence('林晚', ['甲'], 3);
    b.setPresence('苏晴', ['丙'], 9);
    b.rollbackFloorOnly(7);
    return b.headerAt(7) === null && b.whereIs('苏晴') !== null && b.whereIs('林晚') !== null;
}
/** 行为面闭合判据：无真源导入后单楼编辑不得清空树。 */
function importSurvivesOnceRolled(SBx) {
    const b = new SBx.SceneBook();
    b.import({
        nodes: [{ path: ['甲'], floor: 3, desc: 'a' }, { path: ['乙'], floor: 9, desc: 'b' }],
        track: [{ floor: 3, pathKey: '甲' }, { floor: 9, pathKey: '乙' }]
    });
    b.rollbackFloorOnly(9);
    return b.nodes.has('甲');
}
function loadFrom(srcText, name, base) {
    const dir = fs.mkdtempSync(path.join(REPO, '.tmp_v3222_' + name + '_'));
    const f = path.join(dir, base);
    fs.writeFileSync(f, srcText);
    delete require.cache[require.resolve(f)];
    return { mod: require(f), dir };
}
function mutate(srcText, anchor, repl, tag) {
    const hits = srcText.split(anchor).length - 1;
    assert.equal(hits, 1, tag + '：锚点须恰中 1 次（实 ' + hits + '）——锚点漂移即判据失效');
    return srcText.split(anchor).join(repl);
}

test('【N0】★ 负控制·原版对照：全部闭合判据在真源码上必须干净（否则「破坏翻红」不可归因）', () => {
    const j = closureJudge(sbSrc, lrSrc, idxSrc);
    assert.equal(j.rollbackClearsHeader, true, '原版：回滚面按楼层撤场景头');
    assert.equal(j.ledgerShiftsThroughModule, true, '原版：前移交给模块');
    assert.equal(j.hostNoFullClear, true, '原版：宿主不再整表全清在场');
    assert.equal(j.hasNoSourceGuard, true, '原版：无真源降级护栏在位');
    assert.equal(j.coverageHasHeaderFloors, true, '原版：覆盖度含场景头列号');
    assert.equal(shiftFollowsFaces(LR), true, '原版：前移真跟三面（行为面）');
    assert.equal(dropClearsHeaderOnly(SB), true, '原版：删楼真撤本楼场景头且不整表清在场（行为面）');
    assert.equal(importSurvivesOnceRolled(SB), true, '原版：无真源导入后单楼编辑保住树（行为面）');
});

test('【N1】★ 负控制：撤掉「回滚面按楼层撤场景头」，形态与行为判据都翻红', () => {
    const broken = mutate(sbSrc, '        this.headers.delete(f);\n        return this._rebuild(f);',
        '        return this._rebuild(f);', 'N1');
    const j = closureJudge(broken, lrSrc, idxSrc);
    assert.equal(j.rollbackClearsHeader, false, '★ 形态判据翻红');
    const { mod, dir } = loadFrom(broken, 'n1', 'scene-book.broken.js');
    try {
        assert.equal(dropClearsHeaderOnly(mod), false, '★ 同款行为判据在破坏副本上失败（删楼后场景头仍在撒谎）');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N2】★ 负控制：撤掉「前移交给模块」，登记项形态与行为判据都翻红', () => {
    const broken = mutate(lrSrc, '                return Number(h.scene.shiftFloorRefs(d)) || 0;',
        '                return 0;', 'N2');
    const j = closureJudge(sbSrc, broken, idxSrc);
    assert.equal(j.ledgerShiftsThroughModule, false, '★ 形态判据翻红');
    const { mod, dir } = loadFrom(broken, 'n2', 'ledger-replay.broken.js');
    try {
        assert.equal(shiftFollowsFaces(mod), false, '★ 同款行为判据在破坏副本上失败（前移不跟三面）');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N3】★ 负控制：宿主把整表全清写回来，形态判据翻红', () => {
    const broken = mutate(idxSrc, '                        // [v3.221.0] R3-D：**粒度收回到模块内按楼层清**',
        '                        this.scene.clearPresence?.();\n                        // [v3.221.0] R3-D：**粒度收回到模块内按楼层清**', 'N3');
    const j = closureJudge(sbSrc, lrSrc, broken);
    assert.equal(j.hostNoFullClear, false, '★ 形态判据翻红（单楼语义又被扩成全清）');
});

test('【N4】★ 负控制：撤掉「无真源降级」护栏，行为判据翻红（整棵树被清空）', () => {
    const broken = mutate(sbSrc, '        if (!this.opsLog.length) {',
        '        if (false) {', 'N4');
    const j = closureJudge(broken, lrSrc, idxSrc);
    assert.equal(j.hasNoSourceGuard, false, '★ 形态判据翻红');
    const { mod, dir } = loadFrom(broken, 'n4', 'scene-book.broken.js');
    try {
        assert.equal(importSurvivesOnceRolled(mod), false, '★ 同款行为判据在破坏副本上失败（导入存档被清空）');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N5】★ 负控制：撤掉「覆盖度含场景头列号」，形态判据翻红', () => {
    const broken = mutate(sbSrc, '            headerFloors: [...this.headers.keys()]',
        '            headerFloorsIgnored: [...this.headers.keys()]', 'N5');
    const j = closureJudge(broken, lrSrc, idxSrc);
    assert.equal(j.coverageHasHeaderFloors, false, '★ 形态判据翻红（场景头处理又变成无判据面）');
    const { mod, dir } = loadFrom(broken, 'n5', 'scene-book.broken.js');
    try {
        assert.equal(Array.isArray(mod.SceneBook.prototype.coverage.call(new mod.SceneBook()).headerFloors), false,
            '★ 破坏副本上 coverage.headerFloors 真的没了');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N6】★ 负控制·互不掩护：五组破坏各自只打掉自己那一面（不是一坏全坏）', () => {
    const cases = [
        ['N1', closureJudge(mutate(sbSrc, '        this.headers.delete(f);\n        return this._rebuild(f);', '        return this._rebuild(f);', 'N6-1'), lrSrc, idxSrc)],
        ['N2', closureJudge(sbSrc, mutate(lrSrc, '                return Number(h.scene.shiftFloorRefs(d)) || 0;', '                return 0;', 'N6-2'), idxSrc)],
        ['N4', closureJudge(mutate(sbSrc, '        if (!this.opsLog.length) {', '        if (false) {', 'N6-4'), lrSrc, idxSrc)],
        ['N5', closureJudge(mutate(sbSrc, '            headerFloors: [...this.headers.keys()]', '            x: 1', 'N6-5'), lrSrc, idxSrc)]
    ];
    for (const [tag, j] of cases) {
        const gone = Object.entries(j).filter(([, v]) => v === false).map(([k]) => k);
        assert.equal(gone.length, 1, '★ ' + tag + ' 只应打掉一面，实打掉：' + gone.join(','));
    }
});

// ══════════ G 接线与退路同形 + 版本锚 ══════════
test('【G1】★ 宿主接线与退路同形：新方法在真实现与退路上都在位', () => {
    // [v3.221.0] R3-D：退路**逐键**同形，不是「有情字」就算过 ——
    //   修前实测退路覆盖度仍是 13 键（真实现 15 键），缺 headerFloors / headerCount。
    for (const m of ['clearHeader', 'shiftFloorRefs']) {
        assert.ok(new RegExp('\\b' + m + '\\([^)]*\\)\\s*\\{').test(sbSrc), '真实现缺 ' + m);
        assert.ok(new RegExp('\\b' + m + '\\([^)]*\\)\\s*\\{').test(idxSrc), '★ 退路缺同形方法：' + m + '（缺席时调用方会外抛）');
    }
    assert.ok(/this\.scene\.rollbackFloorOnly\(floor\);/.test(idxSrc), '单楼回滚仍落位');
    assert.ok(!/this\.scene\.clearPresence\?\.\(\);/.test(idxSrc), '★ 宿主不再全清在场');
    assert.ok(/h\.scene\.shiftFloorRefs\(d\)/.test(lrSrc), '★ 登记表 scene 面走模块（不再手抄循环）');
});

test('【G3】★ 退路与真实现同形：覆盖度逐键一致，且判据两向自证', () => {
    // ① 真实现键面（真加载 scene-book.js）
    const realKeys = Object.keys(new SB.SceneBook().coverage()).sort();
    const seg = idxSrc.slice(idxSrc.indexOf('class SceneBookFallback'), idxSrc.indexOf('class SuspenseBook', idxSrc.indexOf('class SceneBookFallback')));
    assert.ok(seg.length > 800, '退路段可定位（' + seg.length + ' 字符）');
    const m = /coverage\(\) \{ return \{([\s\S]*?)\}; \}/.exec(seg);
    assert.ok(m, '★ 退路 coverage() 形态可读（形态漂移即判据失效，须显式红）');
    const fallbackKeys = m[1].split(',').map((s) => s.trim().split(':')[0]).filter(Boolean).sort();
    assert.deepEqual(fallbackKeys, realKeys,
        '★ 退路覆盖度必须与真实现逐键同形（缺席时不得塌成「有这面但没数」）\n  真实现：' + realKeys.join(',') + '\n  退路：  ' + fallbackKeys.join(','));
    for (const k of ['headerFloors', 'headerCount']) {
        assert.ok(fallbackKeys.includes(k), '★ 退路覆盖度缺 ' + k + '（模块缺席时调用方读到 undefined）');
    }
    // ② 两向自证：撤掉退路里的这两键，同款判据必须转红（否则判据恒真）
    const broke = mutate(idxSrc, 'headerFloors: [], headerCount: 0,', '', 'G3-fallback');
    const seg2 = broke.slice(broke.indexOf('class SceneBookFallback'), broke.indexOf('class SuspenseBook', broke.indexOf('class SceneBookFallback')));
    const m2 = /coverage\(\) \{ return \{([\s\S]*?)\}; \}/.exec(seg2);
    const fallbackKeys2 = m2[1].split(',').map((s) => s.trim().split(':')[0]).filter(Boolean).sort();
    assert.notDeepEqual(fallbackKeys2, realKeys, '★ 破坏副本上同款判据必须变红（否则这条判据恒真）');
});

test('【G2】★ 版本锚：本套件只在 3.221.0 及以后成立', () => {
    assert.ok(vnum(pkg.version) >= vnum('3.221.0'), '★ 当前版本 ' + pkg.version);
    assert.equal(manifest.version, pkg.version, '三源一致（index.js / manifest / package）');
    const idxV = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
    assert.equal(idxV, pkg.version, 'index.js 与 package 同源');
});
