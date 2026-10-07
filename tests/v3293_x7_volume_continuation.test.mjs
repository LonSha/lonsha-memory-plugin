/* ============================================================
 * tests/v3293_x7_volume_continuation.test.mjs — [v3.293.0 · X7] 长篇剧情分卷与选择性接续
 *
 * 【本套件要证明的五件事（不是「函数返回了对象」）】
 *   ① **不选项目时完全隔离**：没给 projectId ⇒ 一律不产包（ok:false/no-project），
 *      且**不返回空包**（空包会被下游读成「这卷确实没内容」，与「你根本
 *      没选项目」不同形）；诊断读数走 `selected:false` 单列 ⇒「维持隔离」可读。
 *   ② **同名不同宇宙不合并**：身份一律 `id:<entityId>` 优先；只有名字的条目记
 *      `link:'by-name'`，进预览的 `nameOnly` 候选，**永不**自动进可导入集合；
 *      目标侧索引分两张表（id 表 / 名字表），跨表比对**不发生**（那正是「隐式
 *      串联同名角色」的实现方式）。
 *   ③ **接续重试不重复**：proposalId 由 packId+选中键**确定性**导出（同选择恒同 id）；
 *      借 X6 `confirmImport` 的 `seen` 表 ⇒ 二次调用 `duplicate:true` 且不重复落笔。
 *   ④ **撤销有来源范围**：没 scope ⇒ 拒绝（no-scope）；带 scope 只撤域内条，
 *      域外**一条不动**；多级 scope 取**与**（更窄）；重试不再计（alreadyRevoked）。
 *   ⑤ **不许伪装可跳转**：活源表**没给** ⇒ unknown 且不可跳转（判不了 ≠ 还在）；
 *      给了空表 ⇒ source-deleted；版本漂移 ⇒ live 但不可跳转（旧锚点已不在原位）。
 * 另加**真源码破坏的负控制**（判据 A/B/C/D 各配一份破坏副本，原版同判据作反向对照）：
 *   · 拆「缺面不提案」闸门 ⇒ 判据 A 翻红（C5）；
 *   · 拆「同名候选不合并」闸门 ⇒ 判据 B 翻红（H6）；
 *   · 拆「没范围就拒绝」⇒ 判据 C 翻红（E1）；
 *   · 拆「判不了须 unknown」⇒ 判据 D 翻红（D1）。
 *
 * 【当版锚点】形态按本仓 V4 惯例：**不写死版本号**，与三源同源比对（下限锚）。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { breakSource } from './_break_kit.mjs';
const R = process.cwd();
const require_ = createRequire(import.meta.url);
const VC_SRC = fs.readFileSync(path.join(R, 'volume-continuation.js'), 'utf8');
const ORG_SRC = fs.readFileSync(path.join(R, 'memory-organs.js'), 'utf8');
const IDX_SRC = fs.readFileSync(path.join(R, 'index.js'), 'utf8');
const VC = require_(path.join(R, 'volume-continuation.js'));
const BS = require_(path.join(R, 'branch-semantics.js'));
const ORG = require_(path.join(R, 'memory-organs.js'));
const pkgRaw = JSON.parse(fs.readFileSync(path.join(R, 'package.json'), 'utf8')).version;
const vnum = (v) => String(v).split('.').map(Number);
/** 加载被破坏的模块副本（用完必须还原全局）。 */
function loadBrokenVC(src, mutate) {
    const broken = mutate(src);
    assert.notStrictEqual(broken, src, '破坏必须真的发生');
    const saved = globalThis.LonShaVolumeContinuation;
    const tmp = path.join(R, '__negctl_x7.tmp.cjs');
    fs.writeFileSync(tmp, broken);
    let api;
    try {
        delete require_.cache[require_.resolve(tmp)];
        api = require_(tmp);
    } finally {
        try { fs.unlinkSync(tmp); } catch (_e) { /* 清理失败不影响判定 */ }
        if (saved) { try { globalThis.LonShaVolumeContinuation = saved; } catch (_e) { /* 冻结全局：忽略 */ } }
    }
    return api;
}
/* ──────────────────────────────────────────────────────────
 * 判据函数（正负两跑共用同一份；破坏副本上必须翻红）
 * ────────────────────────────────────────────────────────── */
/** 判据 A：目标侧缺面时**不得**在缺的那几面上产出 add 提案（不可比 ≠ 可以按现状合并）。 */
function jAbsentFaceNoAdd(mod) {
    const pack = mod.buildContinuationPack(ARGS_FULL()).pack;
    const tgt = { modules: { factVersion: true }, entries: [] };   // 其余四面缺席
    const r = mod.previewContinuation(pack, tgt, {});
    if (!r.missingFaces.length) return '缺面必须被点出，实 ' + r.missingFaces.length;
    /* ★ 只盯**缺的那几面**：目标在场的那一面（factVersion）本来就该出 add ——
     *   把「任何 add 都算违规」当作判据，原版上会恒翻红（实测：修前本判据在真源码
     *   上报「缺面的条目不得变成 add 提案」，而缺的那四面其实一条提案都没出）。
     *   判据写错与防线失效同形，都会被负控制测绿。 */
    const missing = new Set(r.missingFaces.map((x) => x.face));
    const bad = rpAddCount(mod, pack, tgt, missing);
    if (bad > 0) return '缺面的条目不得变成 add 提案，实 ' + bad;
    return '';
}
/** 辅助：数**指定面**上的 add 提案条数（缺面闸门的判据只应盯缺的那几面）。 */
function rpAddCount(mod, pack, tgt, faces) {
    const pr = mod.proposeHandoff(pack, tgt, {});
    return (pr.proposals || [])
        .filter((p) => p.action === 'add' && (!faces || faces.has(p.face)))
        .length;
}
/** 判据 B：只有名字的条目**不得**自动进入可落笔集合（同名不同宇宙不合并）。 */
function jNameOnlyNotMerged(mod) {
    const pack = mod.buildContinuationPack(ARGS_NAMEONLY()).pack;
    const tgt = { modules: { characterState: true }, entries: [{ name: '林砚', face: 'characterState', key: 'mood', value: '平静' }] };
    const pv = mod.previewContinuation(pack, tgt, {});
    if (!pv.nameOnly.length) return '同名候选必须被点出（不是静默跳过），实 ' + pv.nameOnly.length;
    const pr = mod.proposeHandoff(pack, tgt, {});
    const adds = (pr.proposals || []).filter((p) => p.action !== 'skip');
    if (adds.length > 0) return '同名条目不得自动进可落笔集合，实 ' + adds.length;
    return '';
}
/** 判据 C：撤销**必须有来源范围**（空范围也算没范围，不许当作全量回滚）。
 *   ★ 用空对象而不是「不传 scope」：不传时真源码的 sc 为 null，破坏副本继续往下走会在
 *   `sc.packId` 上抛 TypeError ——「判据翻红」与「判据自己炸了」同形，遮住真正的结论。
 *   空对象同样满足「没有可用范围」，破坏后走通全流程 ⇒ 判据以**返回值**翻红。 */
function jRevokeNeedsScope(mod) {
    const r = mod.revokeHandoff({ appliedEntries: [{ entityId: 'e1', face: 'unfinished', key: 'p1', packId: 'pk1' }], scope: {} });
    if (r.ok !== false || r.reason !== 'no-scope') return '没范围必须拒绝，实 ' + r.reason;
    if (r.revokedCount !== 0) return '没范围不得撤任何条，实 ' + r.revokedCount;
    return '';
}
/** 判据 D：源标识缺失（判不了）**不得**报可跳转。 */
function jUnknownNotNavigable(mod) {
    const r = mod.resolveSourceState({ session: 's1', branch: 'b1', version: '1.0.0' }, undefined);
    if (r.state !== 'unknown') return '无活源表须 unknown，实 ' + r.state;
    if (r.navigable !== false) return '判不了不得报可跳转';
    return '';
}
/* ──────────────────────────────────────────────────────────
 * 负控制锚点（**只在这里声明一次**；H5 判据纯度按本条表核对）
 * ──────────────────────────────────────────────────────────
 * 为什么集中：锚点字面量散落在各测试体里时，同一份锚点会被**无意写两遍**
 *   （实测：修前本文件在 C5 与 H5 各写了一遍同一串，H5 的计数检查当场翻红），
 *   多出来的那一份会让 breakSource 的「恰中 1 次」纪律与人工阅读同时失真。
 *   同时：**注释里也不得原样引用锚点串**（引用会把自己也算进计数），要提就改述。
 */
const NEG_ANCHORS = Object.freeze({
    /** 缺面闸门：目标侧没这一面 ⇒ 不提案（不可比 ≠ 可以按现状合并）。 */
    absentFaceGate: 'if (missingFaceSet.has(f)) continue;',
    /** 判不了 ⇒ unknown（不许并进「还在」）。 */
    unknownWhenNoLiveSources: "reason: 'unknown-liveness', state: SOURCE.UNKNOWN, navigable: false",
    /** 没范围 ⇒ 拒绝（撤销不是全量回滚）。 */
    revokeNeedsScope: 'if (!hasScope) {',
    /** 同名候选 ⇒ 不自动合并。 */
    nameOnlyGate: 'if (e.link === LINK.NAME && !allowNameLink) {',
});
/* ──────────────────────────────────────────────────────────
 * 载荷工厂
 * ────────────────────────────────────────────────────────── */
const PROJ = () => ({
    projectId: 'proj-long', title: '长篇宇宙',
    volumes: [
        { id: 'v1', title: '第一卷·启', floorStart: 0, floorEnd: 40, count: 12, summary: '起始卷', chapters: [{ id: 'c1', title: '初遇', floor: 3 }] },
        { id: 'v2', title: '第二卷·承', floorStart: 41, floorEnd: 90, count: 14, summary: '转折卷' },
    ],
});
const SRC = () => ({ session: 'sess-main', branch: 'main', version: '3.293.0' });
/** 全五面素材（供 A/C 判据用）。 */
function ARGS_FULL() {
    return {
        project: PROJ(), volumeRef: 1, sources: SRC(),
        faces: {
            factVersion: [{ entityId: 'e1', key: 'fact-a', value: '甲事实', from: 5, evidenceRef: 'ev-1' }],
            characterState: [{ entityId: 'e2', key: 'state-a', value: '平静', from: 6 }],
            unfinished: [{ entityId: 'e3', key: 'promise-a', value: '归还典籍', from: 12 }],
            money: [{ entityId: 'e4', key: 'money-a', value: 500, from: 7 }],
            storyTime: [{ entityId: 'e5', key: 'time-a', value: '春分', from: 8 }],
        },
    };
}
/** 只有名字的素材（供 B 判据用）。 */
function ARGS_NAMEONLY() {
    return {
        project: PROJ(), volumeRef: 1, sources: SRC(),
        faces: { characterState: [{ name: '林砚', key: 'mood', value: '焦躁', from: 9 }] },
    };
}
/* ══════════════════════════════════════════════════════════════
 * A. 归属与隔离：不选项目 ⇒ 什么都不产（且不产空包）
 * ══════════════════════════════════════════════════════════════ */
test('v3293 A1. 不选项目 ⇒ 不产包，且**不是**「空包」（两件事不同形）', () => {
    const r = VC.buildContinuationPack({ faces: ARGS_FULL().faces, sources: SRC() });
    assert.equal(r.ok, false, '★ 没选项目不得产包');
    assert.equal(r.reason, 'no-project', '归因须指向「没选项目」');
    assert.equal(r.pack, null, '★ 不得返回空包（空包会被读成「这卷确实没内容」）');
    const r2 = VC.buildContinuationPack({ project: { title: '有名字没 id' }, faces: {} });
    assert.equal(r2.ok, false, '★ 只有名字没有 projectId 的项目 = 没选（名字会重，id 不会）');
});
test('v3293 A2. 不选项目时读数**单列**「维持隔离」（不是「零条」）', () => {
    const s0 = VC.line(null);
    assert.equal(s0, '未选项目', '没给读数就是没选');
    const s1 = VC.line({ selected: false });
    assert.equal(s1, '未选项目（维持隔离）', '★ 默认隔离必须能被读出来');
    const s2 = VC.line({ selected: true, volumeCount: 2, entryCount: 0 });
    assert.notEqual(s1, s2, '★ 「维持隔离」与「选了但零条」不得同形');
});
test('v3293 A3. 选了项目 ⇒ 包只覆盖本卷（不跨卷隐式带）', () => {
    const r = VC.buildContinuationPack(ARGS_FULL());
    assert.equal(r.ok, true);
    assert.equal(r.pack.volumeId, 'v1', '默认取第 1 卷');
    assert.equal(r.pack.scopedToVolume, true, '★ 卷边界必须显式（跨卷要另建包或用户明说）');
    const r2 = VC.buildContinuationPack({ ...ARGS_FULL(), volumeRef: 2 });
    assert.equal(r2.pack.volumeId, 'v2', '按引用取卷必须换卷');
    assert.notEqual(r.pack.packId, r2.pack.packId, '不同卷必须不同包 id');
});
test('v3293 A4. 卷/章节导航可寻址（navKey 稳定，两次调用恒定）', () => {
    const c = PROJ();
    const a = VC.listVolumes(c);
    const b = VC.listVolumes(c);
    assert.equal(a.count, 2);
    assert.deepEqual(a.volumes.map(v => v.navKey), b.volumes.map(v => v.navKey), '★ 导航键必须稳定可寻址');
    assert.equal(a.volumes[0].navKey, 'vol:proj-long#1');
    assert.equal(a.volumes[0].chapters[0].navKey, 'ch:proj-long#1.1');
    assert.equal(VC.volumeAt(c, 'vol:proj-long#2').id, 'v2', '按 navKey 取卷必须命中');
    assert.equal(VC.volumeAt(c, 2).id, 'v2', '按序号取卷必须命中');
});
test('v3293 A5. 卷排序：floorStart 缺省**排后**（不拿 0 冒充首卷）', () => {
    const c = { projectId: 'px', volumes: [{ id: 'vn' }, { id: 'va', floorStart: 10 }] };
    const r = VC.listVolumes(c);
    assert.equal(r.volumes[0].id, 'va', '★ 有楼层信息的排在前面');
    assert.equal(r.volumes[1].floorStart, null, '缺省须记 null（不是 0）');
});
/* ══════════════════════════════════════════════════════════════
 * B. 同名不同宇宙不合并
 * ══════════════════════════════════════════════════════════════ */
test('v3293 B1. 只有名字的条目记 by-name 且**永不**自动进可落笔集合', () => {
    assert.equal(jNameOnlyNotMerged(VC), '', '★ 判据必须成立');
});
test('v3293 B2. 实体 id 优先：同名但 id 不同 ⇒ 各自独立（不串）', () => {
    const pack = VC.buildContinuationPack({
        project: PROJ(), volumeRef: 1, sources: SRC(),
        faces: { characterState: [{ entityId: 'e-lin', name: '林砚', key: 'mood', value: '焦躁', from: 9 }] },
    }).pack;
    assert.equal(pack.entries[0].ownerKey, 'id:e-lin', '★ 有 id 时必须用 id（同名异人靠它分开）');
    assert.equal(pack.entries[0].link, 'by-id');
    /* 目标侧有一条**同名但无 id** 的条目：分表索引 ⇒ 不比对 ⇒ 走 add（不是 replace）。 */
    const tgt = { modules: { characterState: true }, entries: [{ name: '林砚', face: 'characterState', key: 'mood', value: '平静' }] };
    const pv = VC.previewContinuation(pack, tgt, {});
    assert.equal(pv.nameOnly.length, 0, '包内条是按 id 的 ⇒ 不该进同名候选');
    assert.equal(pv.conflicts.length, 0, '★ 按 id 的条不得去撞按名字的条（那正是隐式串联）');
    assert.equal(pv.willAdd, 1, '分表比对 ⇒ 目标侧按名字那条不算命中，包内条走 add');
});
test('v3293 B3. 显式 allowNameLink 时才按名字接续（且读数留痕）', () => {
    const pack = VC.buildContinuationPack(ARGS_NAMEONLY()).pack;
    const tgt = { modules: { characterState: true }, entries: [{ name: '林砚', face: 'characterState', key: 'mood', value: '平静' }] };
    const off = VC.previewContinuation(pack, tgt, {});
    assert.equal(off.nameOnly.length, 1, '默认须进同名候选');
    const on = VC.previewContinuation(pack, tgt, { allowNameLink: true });
    assert.equal(on.nameOnly.length, 0, '显式放行后不再进候选（但仍走名字表比对）');
    assert.equal(on.conflicts.length, 1, '按名字比对时同名冲突必须现形（不是静默替换）');
    assert.equal(on.undecided, 1, '两侧值不同 ⇒ undecided（不猜谁对）');
});
test('v3293 B4. 知识范围：带 keeper 的秘密按 viewer 挡掉，且**计数可见**', () => {
    const pack = VC.buildContinuationPack({
        project: PROJ(), volumeRef: 1, sources: SRC(),
        viewer: { id: 'viewer-1', name: '乙' },
        faces: {
            factVersion: [
                { entityId: 'e-a', key: 'open', value: '公开事', from: 3 },
                { entityId: 'e-b', key: 'secret', value: '机密事', from: 4, keeperIds: ['keeper-9'] },
            ],
        },
    });
    assert.equal(pack.ok, true);
    assert.equal(pack.pack.entries.length, 1, '★ keeper 名单外的条不得进包');
    assert.equal(pack.hidden, 1, '★ 被挡条数必须计数可见（不静默少条）');
    assert.equal(pack.hiddenBy, 'by-id', '按 id 挡须记 by-id');
});
/* ══════════════════════════════════════════════════════════════
 * C. 缺面 ≠ 空面
 * ══════════════════════════════════════════════════════════════ */
test('v3293 C1. 源侧缺面（键缺席）与空面（空数组）**不同形**', () => {
    const r = VC.buildContinuationPack({
        project: PROJ(), volumeRef: 1, sources: SRC(),
        faces: { factVersion: [], money: [{ entityId: 'e4', key: 'm', value: 1, from: 2 }] },
    });
    assert.equal(r.ok, true);
    assert.equal(r.pack.faces.factVersion.present, true, '空数组 = 面在场');
    assert.equal(r.pack.faces.factVersion.count, 0, '空面 count 0（「比了，确实没有」）');
    assert.equal(r.pack.faces.characterState.present, false, '键缺席 = 缺面');
    assert.equal(r.pack.faces.characterState.reason, 'face-absent');
    const af = r.absentFaces.map(x => x.face).sort();
    assert.deepEqual(af, ['characterState', 'storyTime', 'unfinished'], '★ 只有真缺席的面进 absentFaces');
});
test('v3293 C2. 许可收窄 summary-only ⇒ 五面全部点名（不静默消失）', () => {
    const r = VC.buildContinuationPack({ ...ARGS_FULL(), license: 'summary-only' });
    assert.equal(r.ok, true);
    assert.equal(r.pack.entries.length, 0, 'summary-only 不带条目');
    assert.equal(r.absentFaces.length, 5, '★ 五面必须逐面点名（不能因为「没带」就消失）');
    assert.ok(r.absentFaces.every(x => x.reason === 'license-summary-only'), '归因须区分「许可收窄」与「缺面」');
});
test('v3293 C3. 许可 none ⇒ 连包都不出', () => {
    const r = VC.buildContinuationPack({ ...ARGS_FULL(), license: 'none' });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'license-none');
    assert.equal(r.pack, null);
});
test('v3293 C4. 目标侧缺面 ⇒ 不比对（不只是 skip，必须点名缺面）', () => {
    const r = VC.buildContinuationPack(ARGS_FULL()).pack;
    /* 目标侧只声明持有 characterState 一面；包内含五面条目。 */
    const tgt = { modules: { characterState: true }, entries: [] };
    const pv = VC.previewContinuation(r, tgt, {});
    const mf = pv.missingFaces.map(x => x.face).sort();
    assert.deepEqual(mf, ['factVersion', 'money', 'storyTime', 'unfinished'], '★ 目标缺的四面必须逐面点名');
    assert.equal(pv.verdict, 'warn', '缺面是警告级（不是 blocked：能做但要知情）');
});
test('v3293 C5. 缺面闸门保护（判据 A 的正反两跑）', () => {
    assert.equal(jAbsentFaceNoAdd(VC), '', '原版必须通过');
    const broken = loadBrokenVC(VC_SRC, (s) => breakSource(s, NEG_ANCHORS.absentFaceGate, 'if (false) continue;'));
    const why = jAbsentFaceNoAdd(broken);
    assert.notEqual(why, '', '★ 拆掉「缺面不提案」闸门后判据必须翻红');
});
/* ══════════════════════════════════════════════════════════════
 * D. 源引用状态：不许伪装可跳转
 * ══════════════════════════════════════════════════════════════ */
test('v3293 D1. 没给活源表 ⇒ unknown 且不可跳转（判不了 ≠ 还在）', () => {
    assert.equal(jUnknownNotNavigable(VC), '', '★ 判据必须成立');
    const broken = loadBrokenVC(VC_SRC, (s) => breakSource(s, NEG_ANCHORS.unknownWhenNoLiveSources, "reason: 'unknown-liveness', state: SOURCE.UNKNOWN, navigable: true"));
    const why = jUnknownNotNavigable(broken);
    assert.notEqual(why, '', '★ 拆掉「源标识缺失必须判成 unknown」后判据必须翻红');
});
test('v3293 D2. 旧源已删 ⇒ source-deleted 且不可跳转；预览直接 blocked', () => {
    const pack = VC.buildContinuationPack(ARGS_FULL()).pack;
    const st = VC.resolveSourceState(pack, []);
    assert.equal(st.state, 'source-deleted', '★ 给了空表 = 查了、没有');
    assert.equal(st.navigable, false, '旧源删了不得伪装可跳转');
    const pv = VC.previewContinuation(pack, { modules: { unfinished: true }, entries: [] }, { liveSources: [] });
    assert.equal(pv.verdict, 'blocked', '★ 源已删 ⇒ blocked（不基于说不清出处的源落笔）');
    const hs = await0(VC.handoffContinuation({ pack, target: { modules: { unfinished: true }, entries: [] }, liveSources: [] }));
});
/** 同步取 Promise 结果占位（避免 await 顶层限制：node --test 支持 TLA，但保持保守写法）。 */
function await0(p) { if (p && typeof p.catch === 'function') p.catch(() => {}); return p; }
test('v3293 D3. 版本漂移 ⇒ live 但**不可跳转**（旧锚点已不在原位）', () => {
    const pack = VC.buildContinuationPack(ARGS_FULL()).pack;
    const st = VC.resolveSourceState(pack, [{ session: 'sess-main', branch: 'main', version: '9.9.9' }]);
    assert.equal(st.state, 'live', '会话还在 ⇒ live');
    assert.equal(st.versionShifted, true, '★ 版本漂移必须留痕');
    assert.equal(st.navigable, false, '★ 漂移后旧锚点不可跳转（不伪装）');
});
test('v3293 D4. 源在场且版本一致 ⇒ 唯一可跳转的情形', () => {
    const pack = VC.buildContinuationPack(ARGS_FULL()).pack;
    const st = VC.resolveSourceState(pack, [{ session: 'sess-main', branch: 'main', version: '3.293.0' }]);
    assert.equal(st.state, 'live');
    assert.equal(st.navigable, true, '★ 只有这一种情形可跳转');
});
/* ══════════════════════════════════════════════════════════════
 * E. 撤销必须有来源范围
 * ══════════════════════════════════════════════════════════════ */
test('v3293 E1. 没 scope ⇒ 拒绝（不许当作全量回滚）', () => {
    assert.equal(jRevokeNeedsScope(VC), '', '★ 判据必须成立');
    /* 空范围也走「拒绝」分支；破坏后继续往下能用 packId 撤到条 ⇒ 判据以返回值翻红。 */
    const broken = loadBrokenVC(VC_SRC, (s) => breakSource(s, NEG_ANCHORS.revokeNeedsScope, 'if (false) {'));
    const why = jRevokeNeedsScope(broken);
    assert.notEqual(why, '', '★ 拆掉「没范围就拒绝」后判据必须翻红');
});
test('v3293 E2. 带 scope 只撤域内条，域外**一条不动**', () => {
    const applied = [
        { entityId: 'e1', face: 'unfinished', key: 'p1', packId: 'pkA', volumeId: 'v1', sourceRef: { session: 's1', branch: 'b1', version: '1.0.0' } },
        { entityId: 'e1', face: 'unfinished', key: 'p2', packId: 'pkB', volumeId: 'v1', sourceRef: { session: 's1', branch: 'b1', version: '1.0.0' } },
        { entityId: 'e2', face: 'unfinished', key: 'p3', packId: 'pkA', volumeId: 'v2', sourceRef: { session: 's1', branch: 'b1', version: '1.0.0' } },
    ];
    const r = VC.revokeHandoff({ appliedEntries: applied, scope: { packId: 'pkA' } });
    assert.equal(r.ok, true);
    assert.equal(r.revokedCount, 2, '★ pkA 的两条撤掉');
    assert.equal(r.keptCount, 1, '★ pkB 那条一条不动');
    assert.ok(r.kept[0].indexOf('p2') >= 0, '域外条必须原样留在 kept');
});
test('v3293 E3. 多级 scope 取**与**（更窄）：packId + volumeId 同时给 ⇒ 范围更小', () => {
    const applied = [
        { entityId: 'e1', face: 'unfinished', key: 'p1', packId: 'pkA', volumeId: 'v1' },
        { entityId: 'e2', face: 'unfinished', key: 'p2', packId: 'pkA', volumeId: 'v2' },
    ];
    const wide = VC.revokeHandoff({ appliedEntries: applied, scope: { packId: 'pkA' } });
    const narrow = VC.revokeHandoff({ appliedEntries: applied, scope: { packId: 'pkA', volumeId: 'v1' } });
    assert.equal(wide.revokedCount, 2, '单维 scope 覆盖两条');
    assert.equal(narrow.revokedCount, 1, '★ 加一维后范围更窄（与语义）');
    assert.equal(narrow.narrowed, true, '收窄必须留痕');
});
test('v3293 E4. 重试不重复：已撤条再撤不再计（且如实报 alreadyRevoked）', () => {
    const applied = [{ entityId: 'e1', face: 'unfinished', key: 'p1', packId: 'pkA' }];
    const first = VC.revokeHandoff({ appliedEntries: applied, scope: { packId: 'pkA' } });
    assert.equal(first.revokedCount, 1);
    /* 撤销结果回写后重试（真实链路：器官把 revoked 标记写回条目）。 */
    const after = [{ entityId: 'e1', face: 'unfinished', key: 'p1', packId: 'pkA', revoked: true }];
    const second = VC.revokeHandoff({ appliedEntries: after, scope: { packId: 'pkA' } });
    assert.equal(second.revokedCount, 0, '★ 重试不得重复撤');
    assert.equal(second.alreadyRevoked, 1, '须如实记「已撤过」');
    assert.equal(second.reason, 'nothing-in-scope', '归因须指向「范围内没有可撤的」');
});
test('v3293 E5. 撤销范围进读数（不能藏在对象里）', () => {
    const line = VC.handoffLine({ applied: 2, dropped: 0, readback: 'ok', persisted: true, revokeScope: { packId: 'pkA', volumeId: 'v1' } });
    assert.ok(line.indexOf('可撤范围') >= 0, '★ 撤销范围必须在读数里可见');
    assert.ok(line.indexOf('pkA') >= 0, '范围值必须现形');
    const none = VC.handoffLine({ applied: 2, readback: 'ok' });
    assert.ok(none.indexOf('无撤销范围') >= 0, '★ 没有范围的交接必须明说（不是静默省略）');
});
/* ══════════════════════════════════════════════════════════════
 * F. 接续交接：预览 → 提案 → 预检 → 确认（幂等）
 * ══════════════════════════════════════════════════════════════ */
test('v3293 F1. 预览：add / replace / skip 三态各归各因', () => {
    const pack = VC.buildContinuationPack({
        project: PROJ(), volumeRef: 1, sources: SRC(),
        faces: {
            unfinished: [
                { entityId: 'e1', key: 'new-one', value: '新约定', from: 12 },
                { entityId: 'e1', key: 'same-one', value: '同值', from: 13 },
                { entityId: 'e1', key: 'diff-one', value: '包里值', from: 14 },
            ],
        },
    }).pack;
    const tgt = {
        modules: { unfinished: true },
        entries: [
            { entityId: 'e1', face: 'unfinished', key: 'same-one', value: '同值' },
            { entityId: 'e1', face: 'unfinished', key: 'diff-one', value: '目标值' },
        ],
    };
    const pv = VC.previewContinuation(pack, tgt, {});
    assert.equal(pv.willAdd, 1, '目标没有的 ⇒ add');
    assert.equal(pv.willSkip, 2, '同值 + 未决各一 ⇒ skip');
    assert.equal(pv.undecided, 1, '★ 两侧值不同 ⇒ undecided（不猜谁对）');
    assert.equal(pv.willReplace, 0, '★ 未经用户同意不得 replace');
    const pv2 = VC.previewContinuation(pack, tgt, { allowReplace: true });
    assert.equal(pv2.willReplace, 1, '显式允许后才出 replace');
});
test('v3293 F2. proposalId 确定性：同一份选择重试恒同 id', () => {
    const pack = VC.buildContinuationPack(ARGS_FULL()).pack;
    const tgt = { modules: { unfinished: true, factVersion: true }, entries: [] };
    const a = VC.proposeHandoff(pack, tgt, {});
    const b = VC.proposeHandoff(pack, tgt, {});
    assert.equal(a.proposalId, b.proposalId, '★ 同选择必须同 id（幂等的地基）');
    const c = VC.proposeHandoff(pack, tgt, { allowReplace: true });
    assert.notEqual(a.proposalId, c.proposalId, '★ 选择变了 id 必须变（否则会把「用户改主意」当重试）');
});
test('v3293 F3. 交接：预检 ok ⇒ 真落笔 + 回执带**撤销范围**', async () => {
    const pack = VC.buildContinuationPack({
        project: PROJ(), volumeRef: 1, sources: SRC(),
        faces: { unfinished: [{ entityId: 'e1', key: 'p1', value: '归还典籍', from: 12 }] },
    }).pack;
    const tgt = { modules: { unfinished: true }, entries: [] };
    const wp = new ORG.WorldProgress();
    let saved = 0;
    const res = await VC.handoffContinuation({
        pack, target: tgt, bs: BS,
        applyFn: (p) => wp.applyVolumeContinuation(p),
        readback: async () => { saved++; return wp.volumeContinuationCount(); },
        persist: async () => { saved++; return true; },
        sourceRef: pack.sourceRef,
    });
    assert.equal(res.ok, true, '全绿才可 ok');
    assert.equal(res.receipt.applied, 1, '真落一条');
    assert.equal(wp.promises.length, 1, '★ 器官账本必须真增条');
    assert.equal(wp.promises[0].source, 'volume-continuation', '落笔标记必须与分支导入分列');
    assert.equal(res.receipt.readback, 'ok', '回读须 ok');
    assert.equal(res.receipt.persisted, true, '落盘证据须为真');
    assert.equal(res.receipt.via, 'branch-semantics', '★ 借到 X6 时必须留痕');
    assert.equal(res.revokeScope.packId, pack.packId, '★ 回执必须自带撤销范围');
});
test('v3293 F4. 交接幂等：同 proposalId 二次调用 duplicate 且不重复落笔', async () => {
    const pack = VC.buildContinuationPack({
        project: PROJ(), volumeRef: 1, sources: SRC(),
        faces: { unfinished: [{ entityId: 'e1', key: 'p1', value: '归还典籍', from: 12 }] },
    }).pack;
    const tgt = { modules: { unfinished: true }, entries: [] };
    const wp = new ORG.WorldProgress();
    const seen = {};
    const args = { pack, target: tgt, bs: BS, proposalId: 'hp-fixed-1', seen, applyFn: (p) => wp.applyVolumeContinuation(p) };
    const r1 = await VC.handoffContinuation(args);
    assert.equal(r1.receipt.applied, 1);
    seen['hp-fixed-1'] = { applied: 1 };
    const r2 = await VC.handoffContinuation(args);
    assert.equal(r2.receipt.duplicate, true, '★ 二次调用必须被判重复');
    assert.equal(wp.promises.length, 1, '★ 重试不得重复落笔');
});
test('v3293 F5. 交接：源已删 ⇒ 预览 blocked，连提案都不出', async () => {
    const pack = VC.buildContinuationPack(ARGS_FULL()).pack;
    const res = await VC.handoffContinuation({
        pack, target: { modules: { unfinished: true }, entries: [] }, liveSources: [], bs: BS,
        applyFn: () => ({ ok: true }),
    });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'preview-blocked', '★ 源说不清 ⇒ 不落笔');
    assert.equal(res.proposals.length, 0, '★ 连提案都不出（不基于说不清出处的源提案）');
});
test('v3293 F6. X6 缺席 ⇒ 走自持退路（降级，不是抛）', async () => {
    const pack = VC.buildContinuationPack({
        project: PROJ(), volumeRef: 1, sources: SRC(),
        faces: { unfinished: [{ entityId: 'e1', key: 'p1', value: '归还典籍', from: 12 }] },
    }).pack;
    const wp = new ORG.WorldProgress();
    const res = await VC.handoffContinuation({
        pack, target: { modules: { unfinished: true }, entries: [] }, bs: null,
        applyFn: (p) => wp.applyVolumeContinuation(p),
    });
    assert.equal(res.ok, true, '★ 没 X6 也必须能走完（降级 = 自己也能做完）');
    assert.equal(res.receipt.via, 'volume-continuation', '须如实标「走的是自持退路」');
    assert.equal(wp.promises.length, 1);
});
/* ══════════════════════════════════════════════════════════════
 * G. 宿主真实落笔闭环（真器官 + 真 storage + 真租约）
 * ══════════════════════════════════════════════════════════════ */
/** 从真源码抽方法体（按定义签名精确定位，避免命中调用点/退路桩）。 */
function extractMethod(source, marker) {
    const start = source.indexOf(marker);
    assert.ok(start > 0, '找不到方法定义 ' + marker);
    assert.equal(source.split(marker).length - 1, 1, '定义签名必须唯一：' + marker);
    const bodyStart = start + marker.length - 1;
    assert.equal(source[bodyStart], '{', 'marker 必须以 { 结尾：' + marker);
    let depth = 0, end = -1;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    assert.ok(end > 0, '方法花括号不闭合：' + marker);
    const lineStart = source.lastIndexOf('\n', start) + 1;
    return source.slice(lineStart, end + 1);
}
const LEASE_BAG = [extractMethod(IDX_SRC, '_leaseValid(lease) {'), extractMethod(IDX_SRC, '_leaseDrop(lease, task, floor) {')].join(',\n');
/** 真引擎夹具：真方法体 + 真器官 + 真 storage + 可控 epoch。 */
function makeHost(opts = {}) {
    const wp = opts.wp || new ORG.WorldProgress();
    const calls = { save: 0, saveOk: opts.saveOk !== false };
    const storage = opts.noStorage ? null : {
        async save(chatId, payload) { calls.save++; calls.lastPayload = payload; return calls.saveOk; },
    };
    const factory = new Function('window', 'errLog', '_moduleLib', 'PLUGIN_NAME', 'console', `
        return ({
            ${extractMethod(IDX_SRC, 'async handoffVolumeContinuation(opts = {}) {')},
            ${extractMethod(IDX_SRC, 'async revokeVolumeHandoff(opts = {}) {')},
            ${LEASE_BAG},
            getCurrentChatId() { return this._cid === undefined ? 'c1' : this._cid; },
            collectExport() { return this._exp; }
        });
    `);
    const win = {
        LonShaVolumeContinuation: opts.vc === undefined ? VC : opts.vc,
        LonShaBranchSemantics: opts.bs === undefined ? BS : opts.bs,
    };
    const pick = (name) => (opts.vc === undefined ? VC : opts.vc);
    const eng = factory(win, () => {}, (getGlobal) => { try { return getGlobal(); } catch (_e) { return null; } }, 'LonSha记忆引擎', { warn() {}, log() {}, error() {} });
    /* _moduleLib 的取库语义：按全局名返回（真宿主形态）。 */
    /* ★ `config.config` 必须在场：真实现的 `_leaseValid` 会读
     *   `this.config.config.sessionLeaseGuardEnabled`（闸门默认开启）。夹具缺这一格时，
     *   栅栏判据**抛错**并被出口的 catch 吞成 null —— 于是 G 段全部读到的不是「落笔失败」
     *   而是「夹具缺件」，而真源码里的隐患（落笔已成功却对外报 null）被这层噪音盖住。 */
    eng.config = { config: { sessionLeaseGuardEnabled: opts.leaseGuard !== false } };
    eng.worldProg = wp;
    eng.storage = storage;
    eng._mutationEpoch = opts.epoch === undefined ? 7 : opts.epoch;
    eng._cid = 'c1';
    eng._exp = {};
    return { eng, wp, calls, storage };
}
const PACK1 = () => VC.buildContinuationPack({
    project: PROJ(), volumeRef: 1, sources: SRC(),
    faces: { unfinished: [{ entityId: '林砚', key: 'p1', value: '归还典籍', from: 12 }] },
}).pack;
const TGT1 = () => ({ modules: { unfinished: true }, entries: [] });
test('v3293 G1. 宿主真落笔：promises 真增条 + 真落盘一次 + 回读 ok + 可撤范围在场', async () => {
    const { eng, wp, calls } = makeHost();
    const res = await eng.handoffVolumeContinuation({ pack: PACK1(), target: TGT1() });
    assert.ok(res, '交接不得返回 null（模块在场）');
    assert.equal(wp.promises.length, 1, '★ 真落笔：器官账本必须真的多一条');
    assert.equal(wp.promises[0].source, 'volume-continuation');
    assert.equal(wp.promises[0].packId, PACK1().packId, '★ 条上必须带 packId（撤销逐条寻址的素材）');
    assert.equal(res.receipt.applied, 1);
    assert.equal(res.receipt.readback, 'ok', '回读三态须为 ok');
    assert.equal(res.receipt.persisted, true, '落盘证据须为真');
    assert.equal(calls.save, 1, '★ storage.save 必须恰好被调用一次');
    assert.ok(res.receipt.revokeScope && res.receipt.revokeScope.packId, '★ 撤销范围必须在回执里');
});
test('v3293 G2. 宿主落笔：落盘被拒 ⇒ persisted:false 且 ok:false（内存落了≠已落地）', async () => {
    const { eng, wp } = makeHost({ saveOk: false });
    const res = await eng.handoffVolumeContinuation({ pack: PACK1(), target: TGT1() });
    assert.equal(wp.promises.length, 1, '内存里确实落了（如实记）');
    assert.equal(res.receipt.applied, 1, 'applied 保留真值');
    assert.equal(res.receipt.persisted, false, '★ 落盘被拒必须留证');
    assert.equal(res.receipt.ok, false, '★ 落盘被拒不得报 ok');
    assert.equal(res.receipt.reason, 'persist-failed', '归因须指向落盘失败');
});
test('v3293 G3. 宿主落笔：无 storage ⇒ 不假装落地（persisted 为 null，不是 true）', async () => {
    const { eng, wp } = makeHost({ noStorage: true });
    const res = await eng.handoffVolumeContinuation({ pack: PACK1(), target: TGT1() });
    assert.equal(wp.promises.length, 1, '内存照落');
    assert.equal(res.receipt.persisted, null, '★ 没尝试落盘 ⇒ null（不是「已落地」）');
});
test('v3293 G4. 宿主落笔：只有 unfinished 面落得下去，其余面如实回报', async () => {
    const { eng, wp } = makeHost();
    const pack = VC.buildContinuationPack({
        project: PROJ(), volumeRef: 1, sources: SRC(),
        faces: {
            unfinished: [{ entityId: 'e1', key: 'p1', value: '约定', from: 12 }],
            money: [{ entityId: 'e1', key: 'm1', value: 100, from: 5 }],
        },
    }).pack;
    const res = await eng.handoffVolumeContinuation({ pack, target: { modules: { unfinished: true, money: true }, entries: [] } });
    assert.equal(wp.promises.length, 1, '只有 unfinished 面落下去');
    assert.equal(res.receipt.applied, 1, '未持有的面不得计入 applied');
    assert.equal(res.receipt.dropped, 1, '未持有的面必须如实计入 dropped');
    assert.equal(res.receipt.ok, false, '★ 有 dropped ⇒ 不得报 ok（部分成功与全成功不同形）');
});
test('v3293 G5. 宿主落笔：代际栅栏（落笔期间 epoch 变 ⇒ 整批作废，applied 如实）', async () => {
    const wp = new ORG.WorldProgress();
    const { eng } = makeHost({ wp });
    /* 在 readback 期间抬 epoch（模拟用户回档）：本夹具的 readback 走真 storage.save，
     *   故改用 applyFn 侧抬 epoch 的方式更贴近真实（落笔中就回档）。 */
    const origApply = wp.applyVolumeContinuation.bind(wp);
    wp.applyVolumeContinuation = (p) => { const r = origApply(p); eng._mutationEpoch = 99; return r; };
    const res = await eng.handoffVolumeContinuation({ pack: PACK1(), target: TGT1() });
    assert.equal(res.receipt.ok, false, '★ 代际变过 ⇒ 不得报 ok');
    assert.equal(res.receipt.reason, 'epoch-changed');
    assert.equal(res.receipt.stale, true, 'stale 必须留痕');
    assert.equal(res.receipt.applied, 1, '★ 已落的如实计数（不假装「一条都没落」）');
});
test('v3293 G6. 宿主撤销：按范围撤并真落盘；无范围 ⇒ 拒绝不落盘', async () => {
    const { eng, wp, calls } = makeHost();
    await eng.handoffVolumeContinuation({ pack: PACK1(), target: TGT1() });
    assert.equal(calls.save, 1);
    const entries = wp.volumeContinuationEntries();
    assert.equal(entries.length, 1);
    const bad = await eng.revokeVolumeHandoff({ scope: null });
    assert.equal(bad.ok, false, '★ 没范围必须拒绝');
    assert.equal(bad.reason, 'no-scope');
    assert.equal(calls.save, 1, '★ 没范围不得落盘（不是「撤了个空」）');
    const ok = await eng.revokeVolumeHandoff({ receipt: { revokeScope: { packId: PACK1().packId } } });
    assert.equal(ok.ok, true, '带范围必须能撤');
    assert.equal(ok.revokedCount, 1, '★ 撤到 1 条');
    assert.equal(ok.persisted, true, '撤销也要真落地');
    assert.equal(calls.save, 2, '撤销后必须再落盘一次');
    assert.equal(wp.volumeContinuationEntries()[0].revoked, true, '账本上必须真的标记已撤');
});
test('v3293 G7. 宿主：模块缺席 ⇒ 交接降级 null 且不落条；撤销不受模块缺席影响（各自如实）', async () => {
    /* ★ 两个出口的**在场性依赖不同**，所以期望不能打包成一样：
     *   · `handoffVolumeContinuation` 必须经模块建包/提案 ⇒ 模块缺席只能降级 null；
     *   · `revokeVolumeHandoff` 的撤销动作由**器官**按范围做（模块只贡献读数），
     *     模块缺席时仍能安全完成 —— 强行一起返回 null 会把「用户撤不掉自己刚落的条」
     *     变成缺模块的连带后果（撤销是用户的自救项，不该被模块加载状态绑住）。 */
    const { eng, wp } = makeHost({ vc: null });
    const a = await eng.handoffVolumeContinuation({ pack: PACK1(), target: TGT1() });
    assert.equal(a, null, '★ 模块缺席必须降级 null（不是抛）');
    assert.equal(wp.promises.length, 0, '★ 模块缺席时一条都不许落（降级 ≠ 落一半）');
    const b = await eng.revokeVolumeHandoff({ scope: { packId: 'x' } });
    assert.ok(b && typeof b === 'object', '撤销出口不得抛（有回执）');
    assert.equal(b.reason, 'nothing-in-scope', '范围不在任何条上 ⇒ 如实报「范围内没有可撤的」');
    assert.equal(b.revokedCount, 0, '★ 范围外一条不动');
    /* 器官也缺席 ⇒ 撤销同样降级 null（降级链完整）。 */
    const { eng: eng2 } = makeHost({ wp: { promises: [] } });
    assert.equal(await eng2.revokeVolumeHandoff({ scope: { packId: 'x' } }), null, '★ 器官缺席 ⇒ 降级 null');
});
test('v3293 G8. 宿主栅栏真开：闸门开到「关」时宽松放行（配置真被读，不是恒真/恒假）', async () => {
    /* 反向对照：若 `_leaseValid` 的开头判据被写坏（永远 return true / 永远读不到配置），
     *   下面这组两跑会同形 —— 那正是「栅栏形同虚设」的形态。 */
    const on = makeHost({ epoch: 7 });
    const rOn = await on.eng.handoffVolumeContinuation({ pack: PACK1(), target: TGT1() });
    assert.equal(rOn.receipt.stale, undefined, '★ 栅栏开着且没变代 ⇒ 不得记作废');
    assert.equal(rOn.receipt.ok, true);
    const off = makeHost({ leaseGuard: false });
    const rOff = await off.eng.handoffVolumeContinuation({ pack: PACK1(), target: TGT1() });
    assert.equal(rOff.receipt.ok, true, '闸门关 ⇒ 宽松放行（可回退）');
});
test('v3293 G9. 落笔后异常不得静默：降级 null 时必须留下「落过几条」的作废读数', async () => {
    /* 真隐患回归：落笔（`applyFn` 真写器官账本）成功之后，出口里还有几步
     *   （回读、幂等登记、诊断读数刷新）；任何一步抛错都会被出口的 catch 吞成 `null`。
     *   上层把 `null` 读成「没成」并重试 ⇒ **重复落笔**（账本真增条、回执说没成）。
     *   修后：降级照旧（不把降级改成崩溃），但 `_lastVolumeHandoff` 必须留下
     *   「落过几条」的可查读数。这里用**真落笔后的真实抛错点**（诊断读数刷新）触发。 */
    const { eng, wp } = makeHost();
    wp.noteVolumeContinuation = () => { throw new Error('落笔后炸'); };
    const res = await eng.handoffVolumeContinuation({ pack: PACK1(), target: TGT1() });
    assert.equal(res, null, '出口契约不变：降级 null（不把降级改成崩溃）');
    assert.equal(wp.promises.length, 1, '★ 账本上确实落了一条（这正是必须留证的原因）');
    assert.ok(eng._lastVolumeHandoff, '★ 必须留下可查的作废读数（否则「落过但没回执」不可追）');
    assert.equal(eng._lastVolumeHandoff.why, 'threw');
    assert.equal(eng._lastVolumeHandoff.count, 1, '作废读数必须带上当前来源计数');
    /* 反向对照：留痕自身不得成为新的失败（器官连计数都不可用时仍须降级为 null）。 */
    const h2 = makeHost();
    h2.wp.noteVolumeContinuation = () => { throw new Error('又炸'); };
    h2.wp.volumeContinuationCount = () => { throw new Error('计数也炸'); };
    assert.equal(await h2.eng.handoffVolumeContinuation({ pack: PACK1(), target: TGT1() }), null, '留痕失败不得把降级变成崩溃');
});
test('v3293 G10. 读数：源侧缺面必须连面名一起留证（告警条件不得依赖调用点记得传格）', () => {
    const wp = new ORG.WorldProgress();
    wp.noteVolumeContinuation({ selected: true, absentFaceCount: 4, absentFaces: [{ face: 'money' }, { face: 'storyTime' }, { face: 'unfinished' }, { face: 'characterState' }] });
    assert.equal(wp._volumeContinuationRead.absentFaceCount, 4);
    assert.equal(wp._volumeContinuationRead.absentFaces.length, 4, '★ 面名必须留证（体检行据此点名）');
    /* 只给面名不给计数（少传一格）时，计数必须由面名现算 —— 不得退化成 0。 */
    wp.noteVolumeContinuation({ selected: true, absentFaces: [{ face: 'money' }] });
    assert.equal(wp._volumeContinuationRead.absentFaceCount, 1, '★ 少传计数必须由面名兜出来（不得恒 0）');
});
/* ══════════════════════════════════════════════════════════════
 * H. 接线与守卫（真源码字符串面）
 * ══════════════════════════════════════════════════════════════ */
test('v3293 H1. 宿主接线完整：退路四法 + 真实实现 + 诊断行 + 器官五法', () => {
    const need = ['_volumeContinuation() { return null; }', 'buildVolumePack() { return null; }',
        'handoffVolumeContinuation() { return null; }', 'revokeVolumeHandoff() { return null; }'];
    for (const n of need) assert.ok(IDX_SRC.indexOf(n) >= 0, '退路缺失：' + n);
    for (const n of ['async handoffVolumeContinuation(opts = {}) {', 'async revokeVolumeHandoff(opts = {}) {',
        'buildVolumePack(opts = {}) {', '_volumeContinuationLine() {']) {
        assert.ok(IDX_SRC.indexOf(n) >= 0, '真实实现缺失：' + n);
    }
    assert.ok(IDX_SRC.indexOf("['分卷接续'") >= 0, '诊断行缺失');
    for (const n of ['applyVolumeContinuation(proposal) {', 'volumeContinuationCount() {',
        'volumeContinuationEntries() {', 'revokeVolumeContinuation(scope) {', 'noteVolumeContinuation(read) {']) {
        assert.ok(ORG_SRC.indexOf(n) >= 0, '器官方法缺失：' + n);
    }
});
test('v3293 H2. manifest 注册 + 当版三源同源（下限锚，不写死版本号）', () => {
    const mf = JSON.parse(fs.readFileSync(path.join(R, 'manifest.json'), 'utf8'));
    const list = mf.extra_js || mf.extraJs;
    assert.ok(list.indexOf('volume-continuation.js') >= 0, '★ 模块必须注册进 manifest.extra_js');
    assert.ok(list.indexOf('volume-continuation.js') === list.indexOf('branch-semantics.js') + 1, '顺序紧随 X6（可读性）');
    const idxVer = IDX_SRC.match(/const VERSION = '([0-9.]+)'/)[1];
    assert.ok(vnum(idxVer) >= vnum('3.293.0'), 'index VERSION 不得低于出生版本');
    assert.equal(idxVer, pkgRaw, 'index 与 package 必须同源');
    const orgVer = ORG_SRC.match(/let VERSION = '([0-9.]+)'/)[1];
    assert.equal(orgVer, pkgRaw, '★ 器官副本必须与 package 同源（注入失败时它就是真实现）');
});
test('v3293 H3. 副本同源：模块自持常量与 X6 五面逐项一致（跨模块契约）', () => {
    assert.deepEqual(VC.FACES.slice().sort(), BS.FACES.slice().sort(), '★ 五面名必须与 X6 逐项一致');
    assert.equal(VC.ACTION.ADD, BS.ACTION.ADD, '动作取值同族');
    assert.equal(VC.ACTION.REPLACE, BS.ACTION.REPLACE);
    assert.equal(VC.ACTION.SKIP, BS.ACTION.SKIP);
});
test('v3293 H4. 本模块不引 X6 常量（自持一份，防跨模块漂移静默读旧值）', () => {
    assert.ok(VC_SRC.indexOf('require(') < 0, '★ 面模块必须零依赖');
    assert.ok(VC_SRC.indexOf('LonShaBranchSemantics') < 0, '★ 不得从 X6 取常量（那会把两处抬版变成一处静默读旧值）');
    assert.ok(VC.NAV && VC.SOURCE && VC.LICENSE, '自持枚举必须在场');
});
test('v3293 H5. 判据纯度：负控制层内锚点字面量只声明一次（且每条锚点在真源码上恰中一次）', () => {
    const src = fs.readFileSync(new URL(import.meta.url), 'utf8');
    /* ① 测试源码里：每条锚点字面量只准出现一次（即 NEG_ANCHORS 里那一处）。
     *   实测教训：修前本文件在 C5 与 H5 各写了一遍同一串，预期 1 次而翻红 —— 多出的副本
     *   会让「破坏恰中 1 次」这条纪律在测试里先失效，读者也从列表上看不出谁在用哪个锚点。 */
    for (const [name, anchor] of Object.entries(NEG_ANCHORS)) {
        const n = src.split(anchor).length - 1;
        assert.equal(n, 1, '★ 锚点字面量只准在 NEG_ANCHORS 里声明一次（多写会把「破坏没发生」也测绿）：' + name);
    }
    /* ② 被声明的锚点在真源码上必须**恰中 1 次**：只声明不核对，锚点打偏时负控制
     *   会以「breakSource 抛错」的形式翻红，那时读到的是工具报错而不是判据结论。 */
    for (const [name, anchor] of Object.entries(NEG_ANCHORS)) {
        const hits = VC_SRC.split(anchor).length - 1;
        assert.equal(hits, 1, '★ 锚点在真源码里必须恰中 1 次：' + name + '，实 ' + hits);
    }
});
test('v3293 H6. 工具两向自证：锚点缺失 / 不唯一须抛，破坏须可观测改行为', () => {
    assert.throws(() => breakSource(VC_SRC, '__NO_SUCH_ANCHOR__', 'x'), /拒绝破坏|锚点命中|命中 0 次|恰中 1 次|要求恰好 1 次|锚点应恰好命中 1 次|必须真的改变源码/, '锚点不存在必须拒绝');
    assert.throws(() => breakSource(VC_SRC, 'if', 'if'), /拒绝破坏|锚点命中|命中 0 次|恰中 1 次|要求恰好 1 次|锚点应恰好命中 1 次|必须真的改变源码/, '锚点不唯一必须拒绝');
    /* 破坏必须可观测改行为：拆「同名候选」闸门后，同名条会进可落笔集合。 */
    const broken = loadBrokenVC(VC_SRC, (s) => breakSource(s, NEG_ANCHORS.nameOnlyGate, 'if (false) {'));
    const why = jNameOnlyNotMerged(broken);
    assert.notEqual(why, '', '★ 拆掉同名候选闸门后 B 判据必须翻红');
    assert.equal(jNameOnlyNotMerged(VC), '', '原版上同判据必须通过（反向对照）');
});
test('v3293 H7. 宿主两处读数调用点都传「源侧缺面名」（接线不得只改一处）', () => {
    /* 体检行的告警条件依赖 `absentFaces` 面名；只改一个调用点会让另一条路径静默回到
     *   「只有计数」，而计数在少传时会被 noteVolumeContinuation 兜成 0 ⇒ 告警永假。 */
    const calls = IDX_SRC.match(/absentFaces: /g) || [];
    assert.ok(calls.length >= 2, '★ 两个读数调用点都必须传面名，实 ' + calls.length + ' 处');
    assert.ok(ORG_SRC.indexOf('absentFaces: absent') >= 0, '器官侧必须真的把面名存进读数');
});
test('v3293 H8. 落笔出口的异常分支必须留证（不得静默降级）', () => {
    assert.ok(IDX_SRC.indexOf('_lastVolumeHandoff = {') >= 0, '★ 作废读数必须存在');
    assert.ok(IDX_SRC.indexOf("why: 'threw'") >= 0, '归因须指向「抛了」');
    /* 留痕不得成为新的失败：登记块自身有 try 兜底（本仓纪律：登记的失败不得成为新的失败）。 */
    const seg = IDX_SRC.slice(IDX_SRC.indexOf('_lastVolumeHandoff = {') - 400, IDX_SRC.indexOf('_lastVolumeHandoff = {'));
    assert.ok(seg.indexOf('try {') >= 0, '留痕块必须自兜（try 包住）');
});
test('v3293 H9. 诊断行只读一个口径：告警条件与读数同源（不得一处算面名一处算计数）', () => {
    /* 取**体检块整体**：锚点 `selfCheck.volumeContinuation` 在 catch 分支里（块尾），
     *   所以窗口要向**前**取 —— 向后取会直接越出这个块，判据变成对无关代码断言（假绿）。 */
    const at = IDX_SRC.indexOf("selfCheck.volumeContinuation");
    assert.ok(at > 0, '诊断行必须在场');
    const head = IDX_SRC.lastIndexOf('[v3.293.0 · X7] 分卷接续体检面', at);
    assert.ok(head > 0, '体检块起点必须在场');
    const seg = IDX_SRC.slice(head, at);
    assert.ok(seg.indexOf('absentFaceCount') >= 0, '告警条件须读器官读数');
    assert.ok(seg.indexOf('_volumeContinuationRead') >= 0, '读的必须是器官那一份（唯一真源）');
    /* 面名也必须在告警口径里可见：只数计数时，读数被截断/少传就没人能追是哪一面。 */
    assert.ok(IDX_SRC.indexOf('absentFaces: r.absentFaces') >= 0 || IDX_SRC.indexOf('absentFaces: absent') >= 0, '面名入读数');
});
