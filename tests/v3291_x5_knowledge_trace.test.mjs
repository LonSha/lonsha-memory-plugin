/* ============================================================
 * tests/v3291_x5_knowledge_trace.test.mjs — [v3.291.0 · X5] 知识演变与传播证据
 *
 * 【本套件要证明的四件事（不是「函数返回了对象」）】
 *   ① 五态互不相同、各落各的格，且**「未记录」不得被读成「不知道」**
 *      （把两者并成一格会凭空造出一句无据断言：我们没记过 ⇒ 该角色确实不知道）。
 *   ② 「在获知之前不得引用秘密」有判据：knewAt 只看该楼及之前的轨迹，
 *      且 unclear（起疑/误信/判不开）**不得当 no 用**。
 *   ③ 同文转述不得算两条独立证据；回档撤销该楼轨迹且**纠正链断裂必须可见**。
 *   ④ 身份（明面/揭穿后）按格分开：「揭穿前按明面身份」靠 identity 过滤实现，
 *      混在一格里时 ambiguousIdentity 必须报出来。
 * 另加 F 段的**真源码破坏**：把「撤回晚于有效动作」的判据拆掉，
 *   验证 A 段真判据会在破坏副本上翻红（原版通过作反向对照）——
 *   防「对原文件断言」型假绿。这条**不是形式**：本版首跑就是靠它抓到真缺陷
 *   （修前 lastActive 把 retract 自己算进去 ⇒ 第①档永远进不去、撤销被读成 knows）。
 *
 * 【当版锚点】形态按本仓 V4 惯例：**不写死版本号**，与三源同源比对。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { breakSource } from './_break_kit.mjs';
const R = process.cwd();
const require_ = createRequire(import.meta.url);
const KT_SRC = fs.readFileSync(path.join(R, 'knowledge-trace.js'), 'utf8');
const ORG_SRC = fs.readFileSync(path.join(R, 'memory-organs.js'), 'utf8');
const IDX_SRC = fs.readFileSync(path.join(R, 'index.js'), 'utf8');
const KT = require_(path.join(R, 'knowledge-trace.js'));
/** 轨迹账本构造（只包一层 traces，与账本结构同形）。 */
const MK = (traces) => ({ version: 1, traces });
/** 加载被破坏的模块副本（副本会自挂全局，用完必须还原）。 */
function loadBroken(src, mutate) {
    const broken = mutate(src);
    assert.notStrictEqual(broken, src, '破坏必须真的发生');
    const saved = globalThis.LonShaKnowledgeTrace;
    const tmp = path.join(R, '__negctl_x5.tmp.cjs');
    fs.writeFileSync(tmp, broken);
    let api;
    try {
        delete require_.cache[require_.resolve(tmp)];
        api = require_(tmp);
    } finally {
        try { fs.unlinkSync(tmp); } catch (_e) { /* 清理失败不影响判定 */ }
        if (saved) { try { globalThis.LonShaKnowledgeTrace = saved; } catch (_e) { /* 冻结全局：忽略 */ } }
    }
    return api;
}
/* ──────────────────────────────────────────────────────────
 * 判据函数（正负两跑共用同一份；破坏副本上必须翻红）
 * ────────────────────────────────────────────────────────── */
/** 判据：五态各落各的格（同一输入，逐个断言）。 */
function jFiveStates(mod) {
    const acq = mod.stateOf(MK([{ traceId: 'a1', character: 'P', fact: 'F', action: 'acquire', floor: 3 }]), 'P', 'F');
    if (acq.state !== 'knows') return 'acquire 应为 knows，实 ' + acq.state;
    const dbt = mod.stateOf(MK([{ traceId: 'a1', character: 'P', fact: 'F', action: 'doubt', floor: 3 }]), 'P', 'F');
    if (dbt.state !== 'doubts') return 'doubt 应为 doubts，实 ' + dbt.state;
    const mis = mod.stateOf(MK([{ traceId: 'a1', character: 'P', fact: 'F', action: 'misbelieve', floor: 3 }]), 'P', 'F');
    if (mis.state !== 'misled') return '未纠正的 misbelieve 应为 misled，实 ' + mis.state;
    if (mis.correctedBy !== null) return '未纠正的误信 correctedBy 必须为 null，实 ' + mis.correctedBy;
    const cxd = mod.stateOf(MK([
        { traceId: 'a1', character: 'P', fact: 'F', action: 'misbelieve', floor: 3 },
        { traceId: 'a2', character: 'P', fact: 'F', action: 'correct', floor: 5, corrects: 'a1' }
    ]), 'P', 'F');
    if (cxd.state !== 'knows' || cxd.basis !== 'correct') return '被纠正后应为 knows/correct，实 ' + cxd.state + '/' + cxd.basis;
    if (cxd.correctedBy !== 'a2') return '被纠正后 correctedBy 应为纠正轨迹 id，实 ' + cxd.correctedBy;
    const unk = mod.stateOf(MK([{ traceId: 'a1', character: 'P', fact: 'F', action: 'unaware', floor: 2 }]), 'P', 'F');
    if (unk.state !== 'unknown' || unk.basis !== 'unaware') return 'unaware 应为 unknown/unaware，实 ' + unk.state + '/' + unk.basis;
    const non = mod.stateOf(MK([{ traceId: 'a1', character: 'P', fact: 'F', action: 'acquire', floor: 3 }]), 'P', '别的');
    if (non.state !== 'notRecorded') return '无轨迹应为 notRecorded，实 ' + non.state;
    if (non.basis !== 'none') return 'notRecorded 的 basis 必须为 none，实 ' + non.basis;
    if (non.state === unk.state) return '★ notRecorded 与 unknown 被压成了一格';
    return '';
}
/** 判据：撤回晚于有效动作 ⇒ unknown（这条是本版真缺陷的捕获点）。 */
function jRetract(mod) {
    const r = mod.stateOf(MK([
        { traceId: 'a1', character: 'P', fact: 'F', action: 'acquire', floor: 3 },
        { traceId: 'a2', character: 'P', fact: 'F', action: 'retract', floor: 9 }
    ]), 'P', 'F');
    if (r.state !== 'unknown') return '撤销后应为 unknown，实 ' + r.state;
    if (r.basis !== 'retract') return '撤销后 basis 应为 retract，实 ' + r.basis;
    /* 反向：撤回**早于**取得 ⇒ 仍应是 knows（撤销不得无条件覆盖） */
    const back = mod.stateOf(MK([
        { traceId: 'a1', character: 'P', fact: 'F', action: 'retract', floor: 1 },
        { traceId: 'a2', character: 'P', fact: 'F', action: 'acquire', floor: 9 }
    ]), 'P', 'F');
    if (back.state !== 'knows') return '撤回早于取得时仍应为 knows，实 ' + back.state;
    return '';
}
/* ──────────────────────────────────────────────────────────
 * A. 只读面结构 + 五态
 * ────────────────────────────────────────────────────────── */
test('v3291 A1. 只读面结构：面齐全、零依赖、无写入口', () => {
    for (const k of ['normalizeFact', 'evidenceKeyOf', 'normalize', 'propagationSet', 'stateOf', 'knewAt',
        'timelineOf', 'provenanceOf', 'dropByFloor', 'listOf', 'line']) {
        assert.equal(typeof KT[k], 'function', '缺函数 ' + k);
    }
    assert.equal(typeof KT.KT_VERSION, 'number');
    assert.equal(KT.KT_VERSION, 1, '契约版本');
    /* 只读面：不得出现宿主存储 */
    for (const bad of ['localStorage', 'indexedDB', 'sessionStorage']) {
        assert.equal(KT_SRC.includes(bad), false, '只读面不得出现 ' + bad);
    }
    /* 零依赖：不得 require 别的模块（本仓取数门口径不由本面重写） */
    assert.equal(/require\(\s*['"]\.\//.test(KT_SRC), false, '面必须零依赖');
    /* 不得自带写入口 */
    assert.equal(/exports\.(save|write|apply|mutate)/.test(KT_SRC), false, '只读面不得导出写口');
});
test('v3291 A2. 五态互不相同，且「未记录」不得被读成「不知道」（判据：jFiveStates）', () => {
    const why = jFiveStates(KT);
    assert.equal(why, '', why);
    /* 五态名必须两两不同 —— 压格会让读者去退不该退的那一格 */
    const names = ['knows', 'doubts', 'misled', 'unknown', 'notRecorded'];
    assert.equal(new Set(names).size, 5);
});
test('v3291 A3. 撤回晚于有效动作才撤销（判据：jRetract；本版真缺陷的捕获点）', () => {
    const why = jRetract(KT);
    assert.equal(why, '', why);
});
/* ──────────────────────────────────────────────────────────
 * B. 「在获知之前不得引用秘密」
 * ────────────────────────────────────────────────────────── */
test('v3291 B1. knewAt 三态：该楼之前无轨迹 ⇒ unclear（**不得当 no**）', () => {
    const tr = MK([{ traceId: 'a1', character: 'P', fact: 'F', action: 'acquire', floor: 5 }]);
    const before = KT.knewAt(tr, 'P', 'F', 4);
    assert.equal(before.knowledge, 'unclear', '楼 4 尚未取得，只能是 unclear（判不开）');
    assert.notEqual(before.knowledge, 'yes');
    assert.notEqual(before.knowledge, 'no', '★ 把 unclear 读成 no 就是让角色说出他不该不知道的话');
    assert.equal(before.reason, 'no-trace-before-floor');
    assert.equal(KT.knewAt(tr, 'P', 'F', 5).knowledge, 'yes', '同楼平局按 seq，本楼取得即已知');
    assert.equal(KT.knewAt(tr, 'P', 'F', 9).knowledge, 'yes');
});
test('v3291 B2. 起疑与误信不得当「已知」用（unclear 而非 yes）', () => {
    const d = MK([{ traceId: 'a1', character: 'P', fact: 'F', action: 'doubt', floor: 5 }]);
    assert.equal(KT.knewAt(d, 'P', 'F', 9).knowledge, 'unclear', '起疑 ≠ 已知');
    const m = MK([{ traceId: 'a1', character: 'P', fact: 'F', action: 'misbelieve', floor: 5 }]);
    assert.equal(KT.knewAt(m, 'P', 'F', 9).knowledge, 'unclear', '误信 ≠ 已知');
    const u = MK([{ traceId: 'a1', character: 'P', fact: 'F', action: 'unaware', floor: 5 }]);
    assert.equal(KT.knewAt(u, 'P', 'F', 9).knowledge, 'no', '显式登记不知道才是 no');
});
test('v3291 B3. 未来楼层的轨迹不得参与该楼判定（同一账本两种读法必须不同）', () => {
    const tr = MK([
        { traceId: 'a1', character: 'P', fact: 'F', action: 'acquire', floor: 20 }
    ]);
    assert.equal(KT.knewAt(tr, 'P', 'F', 5).knowledge, 'unclear');
    assert.equal(KT.knewAt(tr, 'P', 'F', 20).knowledge, 'yes');
    /* 楼层输入畸形 ⇒ 降级为读数，不猜 */
    const bad = KT.knewAt(tr, 'P', 'F', '');
    assert.equal(bad.degraded, true, '空楼层必须降级而不是当成 0');
    assert.equal(bad.knowledge, 'unclear');
});
test('v3291 B4. 撤销之后的知识在后续楼层读作未知（回档语义）', () => {
    const after = KT.dropByFloor(MK([
        { traceId: 'a1', character: 'P', fact: 'F', action: 'acquire', floor: 7 }
    ]), 7);
    assert.deepEqual(after.removed, ['a1']);
    assert.equal(KT.knewAt({ traces: after.trace.traces }, 'P', 'F', 9).knowledge, 'unclear',
        '该楼被撤销 ⇒ 后续楼层不得仍读作已知');
});
/* ──────────────────────────────────────────────────────────
 * C. 传播与转述
 * ────────────────────────────────────────────────────────── */
test('v3291 C1. 同文转述不得算两条独立证据（同证据+同角色+同动作 ⇒ 转述）', () => {
    const tr = MK([
        { traceId: 'e1', character: '甲', fact: '水晶被盗', action: 'acquire', evidenceKey: 'EV-1', floor: 3 },
        { traceId: 'e2', character: '甲', fact: '水晶被盗了', action: 'acquire', evidenceKey: 'EV-1', floor: 5, from: '乙' },
        { traceId: 'e3', character: '乙', fact: '水晶被盗', action: 'acquire', evidenceKey: 'EV-1', floor: 4 }
    ]);
    const ps = KT.propagationSet(KT.normalize(tr));
    assert.equal(ps.transmittalCount, 1, '甲的两条同证据同动作 ⇒ 只算一次转述');
    assert.equal(ps.independentCount, 2, '甲一条 + 乙一条（拿掉角色会把「乙也知道了」误吞）');
    assert.equal(ps.transmittals[0].traceId, 'e2');
    assert.equal(ps.transmittals[0].distinctFrom, 'e1');
});
test('v3291 C2. 同证据不同动作是两件事（先起疑后确认不得被吞）', () => {
    const tr = MK([
        { traceId: 'e1', character: '甲', fact: 'F', action: 'doubt', evidenceKey: 'EV-1', floor: 3 },
        { traceId: 'e2', character: '甲', fact: 'F', action: 'acquire', evidenceKey: 'EV-1', floor: 5 }
    ]);
    const ps = KT.propagationSet(KT.normalize(tr));
    assert.equal(ps.transmittalCount, 0, '不同动作不得被并成转述');
    assert.equal(ps.independentCount, 2);
});
test('v3291 C3. 缺 evidenceKey 时退回事实原文归一（无显式证据号也有键）', () => {
    const tr = KT.normalize(MK([{ traceId: 'e1', character: '甲', fact: '水晶被盗。', action: 'acquire', floor: 1 }]));
    assert.equal(KT.evidenceKeyOf(tr.traces[0]), KT.normalizeFact('水晶被盗'), '标点差异必须被归一掉');
    /* 形态宽容：非对象一律归空串，不抛 */
    assert.equal(KT.evidenceKeyOf(undefined), '');
    assert.equal(KT.evidenceKeyOf(null), '');
});
/* ──────────────────────────────────────────────────────────
 * D. 回档撤销与纠正链
 * ────────────────────────────────────────────────────────── */
test('v3291 D1. 回档撤销：该楼轨迹被撤、纠正链断裂必须可见（不静默删）', () => {
    const tr = MK([
        { traceId: 'a1', character: 'P', fact: 'F', action: 'misbelieve', floor: 3 },
        { traceId: 'a2', character: 'P', fact: 'F', action: 'correct', floor: 5, corrects: 'a1' }
    ]);
    const d = KT.dropByFloor(tr, 3);
    assert.equal(d.changed, true);
    assert.deepEqual(d.removed, ['a1'], '该楼产生的轨迹必须被撤');
    assert.equal(d.orphaned.length, 1, '★ 依赖被撤轨迹的纠正必须**列出来**，不得静默删掉');
    assert.equal(d.orphaned[0].traceId, 'a2');
    assert.equal(d.orphaned[0].corrects, 'a1');
    const left = d.trace.traces.find((t) => t.traceId === 'a2');
    assert.ok(left, '孤儿轨迹必须保留可见');
    assert.equal(left.revoked, true, '孤儿轨迹必须标 revoked');
    /* 撤销后该角色对该事实**再无有效轨迹** ⇒ 状态必须是 notRecorded（不是 unknown）：
     *   撤销 ≠ 「显式不知道」，混同会凭空造出一条「他确实不知道」。 */
    assert.equal(d.trace.traces.length, 1, '只有孤儿留下');
});
test('v3291 D2. 撤销 ≠ 显式不知道：状态回落 notRecorded 而非 unknown', () => {
    const tr = MK([{ traceId: 'a1', character: 'P', fact: 'F', action: 'acquire', floor: 7 }]);
    const d = KT.dropByFloor(tr, 7);
    const st = KT.stateOf({ traces: d.trace.traces }, 'P', 'F');
    assert.equal(st.state, 'notRecorded');
    assert.equal(st.basis, 'none');
    assert.notEqual(st.state, 'unknown');
});
test('v3291 D3. 撤销输入畸形降级（不抛、不半截）', () => {
    const d = KT.dropByFloor(MK([{ traceId: 'a1', character: 'P', fact: 'F', action: 'acquire', floor: 7 }]), 'x');
    assert.equal(d.degraded, true);
    assert.deepEqual(d.removed, []);
    assert.equal(d.changed, false);
    /* 撤销楼层不存在 ⇒ 不是错误，是「没有可撤的」，必须与「撤了 0 条」同形但可辨 */
    const none = KT.dropByFloor(MK([{ traceId: 'a1', character: 'P', fact: 'F', action: 'acquire', floor: 7 }]), 99);
    assert.equal(none.changed, false);
    assert.deepEqual(none.removed, []);
    assert.equal(none.degraded, false);
});
test('v3291 D4. 出处链有向无环：断链与自环各自可见、都不外抛', () => {
    const good = KT.provenanceOf(MK([
        { traceId: 'a1', character: 'P', fact: 'F', action: 'misbelieve', floor: 3 },
        { traceId: 'a2', character: 'P', fact: 'F', action: 'correct', floor: 5, corrects: 'a1' }
    ]), 'P', 'F');
    assert.deepEqual(good.chain.map((c) => c.traceId), ['a2', 'a1'], '链必须从当前态一路回溯');
    assert.equal(good.brokenLink, 0);
    assert.equal(good.cycle, 0);
    const broken = KT.provenanceOf(MK([{ traceId: 'a1', character: 'P', fact: 'F', action: 'correct', floor: 1, corrects: 'zz' }]), 'P', 'F');
    assert.equal(broken.brokenLink, 1, '指向不存在的轨迹必须计数可见');
    const self = KT.provenanceOf(MK([{ traceId: 'a1', character: 'P', fact: 'F', action: 'correct', floor: 1, corrects: 'a1' }]), 'P', 'F');
    assert.equal(self.cycle, 1, '自指必须计数可见');
    /* 互指成环：不得死循环 */
    const loop = KT.provenanceOf(MK([
        { traceId: 'a1', character: 'P', fact: 'F', action: 'correct', floor: 1, corrects: 'a2' },
        { traceId: 'a2', character: 'P', fact: 'F', action: 'correct', floor: 2, corrects: 'a1' }
    ]), 'P', 'F');
    assert.equal(loop.cycle, 1);
});
/* ──────────────────────────────────────────────────────────
 * E. 身份与同名异人
 * ────────────────────────────────────────────────────────── */
test('v3291 E1. 身份按格分开：揭穿前按明面身份，揭穿后可查变化来源', () => {
    const tr = MK([
        { traceId: 'a1', character: '珞珈', fact: 'F', action: 'acquire', floor: 2, identity: 'surface' },
        { traceId: 'a2', character: '珞珈', fact: 'F', action: 'acquire', floor: 8, identity: 'revealed' }
    ]);
    assert.equal(KT.stateOf(tr, '珞珈', 'F', { identity: 'surface' }).floor, 2, '明面身份只看明面那一格');
    assert.equal(KT.stateOf(tr, '珞珈', 'F', { identity: 'revealed' }).floor, 8, '揭穿后只看揭穿后那一格');
    assert.equal(KT.stateOf(tr, '珞珈', 'F').ambiguousIdentity, true,
        '★ 两格混在一处必须报出来（否则「揭穿前按明面身份」无从执行）');
});
test('v3291 E2. 同名异人按 suspect 分开取，未标记的不得被混入', () => {
    const tr = MK([
        { traceId: 'a1', character: '萧忆柔', fact: 'F1', action: 'acquire', floor: 1, suspect: '忆柔' },
        { traceId: 'a2', character: '萧忆柔', fact: 'F2', action: 'acquire', floor: 2, suspect: '萧太太' },
        { traceId: 'a3', character: '萧忆柔', fact: 'F3', action: 'acquire', floor: 3 }
    ]);
    assert.deepEqual(KT.listOf(tr, '萧忆柔', { suspect: '忆柔' }).rows.map((r) => r.traceId), ['a1']);
    assert.deepEqual(KT.listOf(tr, '萧忆柔', { suspect: '萧太太' }).rows.map((r) => r.traceId), ['a2']);
    assert.deepEqual(KT.listOf(tr, '萧忆柔', {}).rows.map((r) => r.traceId), ['a3'], '不传 suspect 只取未标记的');
});
/* ──────────────────────────────────────────────────────────
 * G. 时间线、截断与读数
 * ────────────────────────────────────────────────────────── */
test('v3291 G1. 时间线按楼层−序号排（同楼多条不得顺序随机）', () => {
    const tr = MK([
        { traceId: 'a3', character: 'P', fact: 'F', action: 'retract', floor: 5 },
        { traceId: 'a1', character: 'P', fact: 'F', action: 'acquire', floor: 5 },
        { traceId: 'a2', character: 'P', fact: 'F', action: 'doubt', floor: 5 }
    ]);
    const tl = KT.timelineOf(tr, 'P', 'F');
    /* 同楼定序的真源是**入参次序**（seq 即数组下标顺序）——
     *   不是 traceId 字典序。本例入参顺序是 a3/a1/a2，故排序结果必须与入参一致（稳定排序）。 */
    assert.deepEqual(tl.rows.map((r) => r.traceId), ['a3', 'a1', 'a2'], '同楼必须按 seq（入参次序）定序，不得随机');
    /* 不同楼则按楼层主序：楼层优先于入参次序 */
    const tl2 = KT.timelineOf(MK([
        { traceId: 'b3', character: 'P', fact: 'F', action: 'acquire', floor: 9 },
        { traceId: 'b1', character: 'P', fact: 'F', action: 'acquire', floor: 2 },
        { traceId: 'b2', character: 'P', fact: 'F', action: 'acquire', floor: 5 }
    ]), 'P', 'F');
    assert.deepEqual(tl2.rows.map((r) => r.traceId), ['b1', 'b2', 'b3'], '楼层必须是主序');
    assert.equal(tl.matched, 3);
});
test('v3291 G2. 截断必须可见（「只列了 N 条」≠「真的只有 N 条」）', () => {
    const many = [];
    for (let i = 0; i < KT.MAX_LIST + 6; i++) many.push({ traceId: 'a' + i, character: 'P', fact: 'F', action: 'acquire', floor: i });
    const tl = KT.timelineOf(MK(many), 'P', 'F');
    assert.equal(tl.rows.length, KT.MAX_LIST, '输出必须有界');
    assert.equal(tl.truncated, true);
    assert.equal(tl.dropped, 6);
    assert.equal(tl.matched, KT.MAX_LIST + 6, 'matched 必须报真实条数，不是被截断后的数');
});
test('v3291 G3. 读数字面量扫描：五态分开说、「未记录」必须带强调', () => {
    const line = KT.line({ knows: 1, doubts: 0, misled: 0, unknown: 2, notRecorded: 3, transmittals: 1, removed: 0 });
    assert.ok(line.includes('得知 1'), line);
    assert.ok(line.includes('怀疑 0'), line);
    assert.ok(line.includes('误信 0'), line);
    assert.ok(line.includes('未知 2'), line);
    assert.ok(line.includes('未记录 3'), line);
    /* 模块未加载不得伪装成全零读数 */
    assert.equal(KT.line({ moduleMissing: true }), '模块未加载（knowledge-trace.js）');
    assert.notEqual(KT.line({ moduleMissing: true }), KT.line({}));
});
/* ──────────────────────────────────────────────────────────
 * H. 宿主真接线（不是只建了模块）
 * ────────────────────────────────────────────────────────── */
test('v3291 H1. 宿主真接线：manifest 注册 + 取库 + 写入 + 诊断行 + 持久化', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(R, 'manifest.json'), 'utf8'));
    assert.equal(manifest.extra_js.includes('knowledge-trace.js'), true, 'manifest 必须注册该面');
    assert.equal(IDX_SRC.includes('LonShaKnowledgeTrace'), true, 'index.js 必须取库该全局');
    assert.equal(IDX_SRC.includes('_knowledgeTraceLine'), true, '诊断行必须存在');
    assert.equal(IDX_SRC.includes('知识轨迹'), true, '诊断行名必须存在');
    assert.equal(IDX_SRC.includes('recordKnowledgeTrace'), true, '宿主提取路径必须真写入轨迹');
    /* 持久化必须跟着世界推进走（否则重启就丢，轨迹比状态更不可容忍丢） */
    assert.equal(ORG_SRC.includes('knowledgeTraces'), true, 'memory-organs 必须持有轨迹账本');
    assert.equal(ORG_SRC.includes('recordKnowledgeTrace'), true, 'memory-organs 必须提供写入口');
    assert.equal(ORG_SRC.includes('refreshKnowledgeTraceRead'), true, 'memory-organs 必须提供读数刷新');
});
test('v3291 H2. 面文件不得退化，且版本四源同源（当版锚点）', () => {
    const pkg = require_(path.join(R, 'package.json'));
    const pkgRaw = String(pkg.version);
    const SQ = String.fromCharCode(39);
    const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
    assert.equal(vnum('3.291.0'), vnum(pkgRaw), '当版锚点须与 package.json 同源（V4 计数形态）');
    assert.ok(IDX_SRC.includes('const VERSION = ' + SQ + pkgRaw + SQ + ';'), 'index.js 版本常量须与 package.json 同源');
    assert.ok(fs.readFileSync(path.join(R, 'manifest.json'), 'utf8').includes('"version": "' + pkgRaw + '",'), 'manifest.json 版本须与 package.json 同源');
    assert.ok(KT_SRC.length > 14000, '面文件不得退化（实 ' + KT_SRC.length + ' 字节）');
});
/* ──────────────────────────────────────────────────────────
 * F. 真源码破坏（H2/H5/H6 纪律）
 *   不是在原文件上断言 —— 而是：锚点恰中 1 次 → 写破坏副本 → 在**副本**上跑
 *   同款真判据（A2 的五态 + A3 的撤销）。原版通过作反向对照。
 *   锚点字面量在本层内只出现一次（H5），且判据不引用锚点串。
 * ────────────────────────────────────────────────────────── */
test('v3291 F1. 工具自证：锚点不存在/不唯一必须抛', () => {
    assert.throws(() => breakSource(KT_SRC, 'const NOT_THERE = 1;', 'x'), /锚点/);
    /* 多处出现（'use strict' 唯一、这里用一个真出现两次的串） */
    assert.throws(() => breakSource(KT_SRC, 'traces', 'y'), /锚点|唯一|恰中/);
});
test('v3291 F2. 真源码破坏：拆掉「撤回晚于有效动作」⇒ A3 真判据实测失败', () => {
    /* 破坏点：把 retract 重新算进「有效动作」（回到本版修前那行）。
     *   这是**可观测**的破坏：撤销会被静默读成 knows（A3 真判据必然翻红）。 */
    const ANCHOR = "mine.filter((t) => t.action !== 'unaware' && t.action !== 'retract')";
    const cnt = KT_SRC.split(ANCHOR).length - 1;
    assert.equal(cnt, 1, '锚点必须恰中 1 次，实际 ' + cnt);
    const B = loadBroken(KT_SRC, (s) => s.replace(ANCHOR, "mine.filter((t) => t.action !== 'unaware')"));
    /* 同款真判据在破坏副本上必须失败 */
    const why = jRetract(B);
    assert.notEqual(why, '', '★ 破坏副本上 A3 真判据必须实测失败（假绿通道未堵住）');
    /* 反向对照：原版同款判据必须真通过 */
    assert.equal(jRetract(KT), '', '原版必须通过');
    /* 破坏必须可观测改行为：同输入判决真的变了 */
    const st = B.stateOf(MK([
        { traceId: 'a1', character: 'P', fact: 'F', action: 'acquire', floor: 3 },
        { traceId: 'a2', character: 'P', fact: 'F', action: 'retract', floor: 9 }
    ]), 'P', 'F');
    assert.notEqual(st.state, 'unknown', '破坏后判决真的变了（不再是 unknown）');
});
test('v3291 F3. 真源码破坏：把「未记录」并进「未知」⇒ A2 真判据实测失败', () => {
    /* 破坏点：无轨迹时直接返回 unknown（把两者压成一格）。 */
    const ANCHOR = "kind: KT_KIND, character: text(character, 40), state: 'notRecorded',";
    const cnt = KT_SRC.split(ANCHOR).length - 1;
    assert.equal(cnt, 1, '锚点必须恰中 1 次，实际 ' + cnt);
    const B = loadBroken(KT_SRC, (s) => s.replace(ANCHOR, "kind: KT_KIND, character: text(character, 40), state: 'unknown',"));
    const why = jFiveStates(B);
    assert.notEqual(why, '', '★ 压格破坏必须让 A2 真判据翻红');
    assert.equal(jFiveStates(KT), '', '原版必须通过');
});
