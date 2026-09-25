/* ============================================================
 * tests/v3221_scene_face_migration.test.mjs — [v3.220.0] Gate R3-A
 *
 * 版本锚点（v3.220.0）：本套件恰好锚着它自己的出生版本，供版本守卫 V4 取基准。
 *
 * 主题：**场所三面外供**（R3-A）—— 层级树 / 到访史 / 本楼场景头。
 *
 * 背景：v3.181 把「地点」做成了可查询面并外供快照，但外供的只是 summary() 的
 *   current（末级键字符串）+ 规模四数。账本内部早就有 tree / visitsList / headerAt，
 *   却从没出过仓 ⇒ 手机端只能说「当前位置 + N 处场所」，答不出「这店在城里哪一区」
 *   「去过哪些、去过几次」「那天什么天气」。本版把这三样接进同一个快照面。
 *
 * 层次：A 三面真能回答（★ 行为驱动）
 *       B 「没给」与「给了空的」分面（三面各自的缺席态不得与空态同形）
 *       C 同修订自洽（三面与 current 同一实例同一次读取）
 *       D 有界性（MAX_TREE_ROWS 真被消费）
 *       E 只读（三面不写任何状态，取完后账本逐字节不变）
 *       F 负控制（真源码破坏 → 破坏副本 → 同款真判据）
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
const SB = require(SB_PATH);
const sbSrc = fs.readFileSync(SB_PATH, 'utf8');
const idxSrc = fs.readFileSync(path.join(REPO, 'index.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));
function vnum(s) {
    const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
    return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

/** 夹具：一棵四层树 + 两条到访 + 一楼场景头。 */
function fixture() {
    const b = new SB.SceneBook();
    // 真签名：apply(ops, floor)；op = { action:'add'|'update', path:[...], desc }
    b.apply([{ action: 'add', path: ['梧桐市', '老城区', '钟楼', '顶层'], desc: '塔顶' }], 3);
    b.apply([{ action: 'add', path: ['梧桐市', '老城区', '钟楼'], desc: '爬满藤蔓' }], 3);
    b.apply([{ action: 'add', path: ['梧桐市', '江畔区', '旧仓库'] }], 7);
    // 到访由 setLocation 记（apply 只登记场所，不记到访）
    b.setLocation(3, ['梧桐市', '老城区', '钟楼', '顶层']);
    b.setLocation(5, ['梧桐市', '老城区', '钟楼']);
    // 同一处再去一次（**另一个楼层**）——count 口径 = 去过的不同楼层数
    b.setLocation(6, ['梧桐市', '老城区', '钟楼'], );
    b.setLocation(7, ['梧桐市', '江畔区', '旧仓库']);
    b.setHeader(7, { date: '7月28日', period: '傍晚', weather: '小雨' });
    return b;
}

// ══════════ A 三面真能回答 ══════════
test('【A1】★ 层级树：一次读出四级，且每级带 depth / 出处楼层', () => {
    const s = fixture().summary();
    assert.ok(Array.isArray(s.tree), 'tree 是数组');
    const keys = s.tree.map((n) => n.path.join('/'));
    assert.ok(keys.includes('梧桐市/老城区/钟楼/顶层'), '★ 四级路径在树里：' + keys.join(' | '));
    const top = s.tree.find((n) => n.path.join('/') === '梧桐市');
    assert.equal(top.depth, 1, '根 depth=1');
    const leaf = s.tree.find((n) => n.path.join('/') === '梧桐市/老城区/钟楼/顶层');
    assert.equal(leaf.depth, 4, '★ 最深层 depth=4');
    assert.equal(leaf.name, '顶层', '★ 末级名可直接渲染');
    assert.equal(top.floor, 3, '出处楼层如实带出');
});

test('【A2】★ 到访史：去过几次现在**能答**（不再只有条目数）', () => {
    const s = fixture().summary();
    const vis = s.visits.find((v) => v.path.join('/') === '梧桐市/老城区/钟楼');
    assert.ok(vis, '钟楼有到访记录');
    assert.equal(vis.count, 2, '★ 同一地方去过两次（两个不同楼层）');
    assert.equal(vis.revisit, true, '重访标记');
    assert.equal(vis.registered, true, '★ 树里有这个节点（不是「到访过但没登记」）');
});

test('【A3】★ 场景头：日期 / 时段 / 天气分字段给（下游要按字段渲染）', () => {
    const s = fixture().summary();
    assert.ok(s.header, '有场景头');
    assert.equal(s.header.date, '7月28日');
    assert.equal(s.header.period, '傍晚');
    assert.equal(s.header.weather, '小雨');
    assert.equal(s.header.floor, 7, '★ 头上带楼层（对得上哪一楼）');
});

test('【A4】★ 当前链也升级成结构化（带 desc/floor，不再只是一串名字）', () => {
    const b = fixture();
    b.apply([{ action: 'add', path: ['梧桐市', '江畔区', '旧仓库'], desc: '堆着木箱' }], 9);
    b.setLocation(9, ['梧桐市', '江畔区', '旧仓库']);
    const s = b.summary();
    assert.ok(Array.isArray(s.currentChain) && s.currentChain.length === 3, '链上有三级');
    const last = s.currentChain[s.currentChain.length - 1];
    assert.equal(last.name, '旧仓库');
    assert.equal(last.floor, 9);
    assert.ok(s.currentChain.every((n) => typeof n.key === 'string' && n.key.length), '每级都有键');
});

// ══════════ B 「没给」与「给了空的」分面 ══════════
test('【B1】★ 三个新面在空书上**照样在场**（不因没数据就缺字段）', () => {
    const s = new SB.SceneBook().summary();
    assert.ok(Array.isArray(s.tree), 'tree 恒为数组');
    assert.ok(Array.isArray(s.visits), 'visits 恒为数组');
    assert.ok(Object.prototype.hasOwnProperty.call(s, 'header'), 'header 恒在场');
    assert.equal(s.header, null, '★ 空书上 header 是 null（不是空对象三连）');
    assert.deepEqual(s.tree, [], '空树如实空数组');
});

test('【B2】★ 「没登记头部」与「头是空的」分开：没登记就是 null', () => {
    const b = fixture();
    assert.equal(b.headerFace(1), null, '★ 没登记过的楼层如实 null');
    assert.equal(b.setHeader(1, { date: '', period: '', weather: '' }), false, '三空拒绝写入');
    assert.equal(b.headerFace(1), null, '★ 拒绝之后仍然 null（没有半截对象）');
});

test('【B3】★ 到访与登记分离：到访过但树里没这节点，registered=false', () => {
    const b = new SB.SceneBook();
    b.apply([{ action: 'add', path: ['甲城', '乙街'] }], 3);
    b.setLocation(3, ['甲城', '乙街']);
    const s0 = b.summary();
    assert.ok(s0.visits.every((v) => v.registered === true), '正常情况全登记');
    // 直接构造「到访键不在 nodes 里」的态（模拟外部改过）
    b.visits.set('甲城/丙巷', { count: 1, firstFloor: 4, lastFloor: 4, floors: [4] });
    const s1 = b.summary();
    const orphan = s1.visits.find((v) => v.key === '甲城/丙巷');
    assert.ok(orphan, '孤儿到访仍在列表里（不静默吞掉）');
    assert.equal(orphan.registered, false, '★ 如实标未登记');
});

// ══════════ C 同修订自洽 ══════════
test('【C1】★ 三面与 current 同一次读取：current 就是树里那条链', () => {
    const s = fixture().summary();
    const currentKey = s.current;
    assert.ok(currentKey, '有当前位置');
    const chainInTree = s.tree.filter((n) => currentKey === n.path.join('/') || currentKey.startsWith(n.path.join('/') + '/'))
        .map((n) => n.path.join('/'));
    assert.ok(chainInTree.includes(currentKey), '★ 当前地就在树里（同一次读数，不自洽就是缺陷）');
});

// ══════════ D 有界性 ══════════
test('【D1】★ 上限常量真被消费：超量树被裁到 MAX_TREE_ROWS 以内', () => {
    assert.ok(SB.MAX_TREE_ROWS >= 1, '导出上限常量');
    const b = new SB.SceneBook();
    for (let i = 0; i < SB.MAX_TREE_ROWS + 60; i++) {
        b.apply([{ action: 'add', path: ['城' + i, '地' + i] }], i + 1);
    }
    const s = b.summary();
    assert.ok(s.tree.length <= SB.MAX_TREE_ROWS, '★ 实际行数 ' + s.tree.length + ' 不得超过 ' + SB.MAX_TREE_ROWS);
    assert.ok(b.tree(2).length <= 2, '可显式收窄');
});

// ══════════ E 只读 ══════════
test('【E1】★ 三面全只读：取完账本逐字节不变', () => {
    const b = fixture();
    const before = JSON.stringify(b.export());
    b.summary(); b.tree(); b.visitHistory(); b.headerFace(7);
    const after = JSON.stringify(b.export());
    assert.equal(after, before, '★ 读侧不得改账本（含 updatedAt/at 之类的隐写）');
});

test('【E2】★ 畸形输入不抛：summary 在坏账本上照常返回结构', () => {
    const b = new SB.SceneBook();
    b.visits.set('野/路', { count: '怪', firstFloor: null, lastFloor: undefined, floors: null });
    assert.doesNotThrow(() => b.summary(), '不抛');
    const s = b.summary();
    assert.ok(Array.isArray(s.visits), '仍返回数组');
});

// ══════════ F 负控制（真源码破坏 → 破坏副本 → 同款判据） ══════════
test('【N1】★ 负控制：把 tree 从 summary 摘掉，判据必须翻红', () => {
    const anchor = '            tree: this.tree(),';
    assert.equal(sbSrc.split(anchor).length - 1, 1, '★ 锚点恰中 1 次');
    const broken = sbSrc.replace(anchor, '            tree: [],');
    const dir = fs.mkdtempSync(path.join(REPO, '.tmp_v3221_n1_'));
    const f = path.join(dir, 'scene-book.broken.js');
    fs.writeFileSync(f, broken);
    try {
        delete require.cache[require.resolve(f)];
        const BB = require(f);
        const s = new BB.SceneBook();
        s.apply([{ action: 'add', path: ['甲城', '乙街'] }], 1);
        const sum = s.summary();
        assert.equal(sum.tree.length, 0, '★ 破坏副本上 tree 真是空的');
        assert.ok(!(sum.tree.length > 0), '★ 同款判据（树有行）在破坏副本上失败');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('【N2】★ 负控制：到访史摘掉 count，判据必须翻红', () => {
    const anchor = '                count: numOrNull(v.count),';
    assert.equal(sbSrc.split(anchor).length - 1, 1, '★ 锚点恰中 1 次');
    const broken = sbSrc.replace(anchor, '                count: null,');
    const dir = fs.mkdtempSync(path.join(REPO, '.tmp_v3221_n2_'));
    const f = path.join(dir, 'scene-book.broken.js');
    fs.writeFileSync(f, broken);
    try {
        delete require.cache[require.resolve(f)];
        const BB = require(f);
        const b = new BB.SceneBook();
        b.apply([{ action: 'add', path: ['甲城', '乙街'] }], 3);
        b.setLocation(3, ['甲城', '乙街']);
        b.setLocation(5, ['甲城', '乙街']);
        const vis = b.summary().visits.find((v) => v.path.join('/') === '甲城/乙街');
        assert.ok(vis, '条目仍在');
        assert.equal(vis.count, null, '★ 破坏副本上 count 真丢了');
        assert.notEqual(vis.count, 2, '★ 同款判据（去过两次）在破坏副本上失败');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('【N3】★ 负控制：上限被摘掉后，超量树不再被裁', () => {
    const anchor = '        const cap = Math.max(1, Math.min(Number(limit) || MAX_TREE_ROWS, MAX_TREE_ROWS));';
    assert.equal(sbSrc.split(anchor).length - 1, 1, '★ 锚点恰中 1 次');
    const broken = sbSrc.replace(anchor, '        const cap = 100000;');
    const dir = fs.mkdtempSync(path.join(REPO, '.tmp_v3221_n3_'));
    const f = path.join(dir, 'scene-book.broken.js');
    fs.writeFileSync(f, broken);
    try {
        delete require.cache[require.resolve(f)];
        const BB = require(f);
        const b = new BB.SceneBook();
        const n = BB.MAX_TREE_ROWS + 20;
        for (let i = 0; i < n; i++) b.apply([{ action: 'add', path: ['城' + i, '地' + i] }], i + 1);
        const rows = b.summary().tree.length;
        assert.ok(rows > BB.MAX_TREE_ROWS, '★ 破坏副本上真的超了上限（' + rows + ' > ' + BB.MAX_TREE_ROWS + '）');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

// ══════════ G 接线与版本锚 ══════════
test('【G1】★ 宿主快照仍走 summary()（三面不另开通道）', () => {
    assert.ok(/const rawScene = \(this\.scene && typeof this\.scene\.summary === 'function'\)/.test(idxSrc),
        '★ 快照取数点仍是 summary()（新增面自动进快照，不开第二通道）');
    assert.ok(/scene: deep\(rawScene\)/.test(idxSrc), 'scene 仍落进快照');
});

test('【G2】★ 缺口退路同形：fallback 也必须有这三个方法', () => {
    for (const m of ['tree', 'visitHistory', 'headerFace']) {
        assert.ok(new RegExp('\\b' + m + '\\([^)]*\\)\\s*\\{').test(idxSrc), '★ 退路缺同形方法：' + m);
    }
});

test('【G3】★ 版本锚：本测试只在 3.220.0 及以后成立', () => {
    assert.ok(vnum(pkg.version) >= vnum('3.220.0'), '★ 当前版本 ' + pkg.version);
    assert.ok(manifest.version === pkg.version, '四源一致');
});
