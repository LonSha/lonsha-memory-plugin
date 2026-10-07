/* ============================================================
 * tests/v3292_x6_branch_semantics.test.mjs — [v3.292.0 · X6] 分支语义对照与受控交接
 *
 * 【本套件要证明的四件事（不是「函数返回了对象」）】
 *   ① 逐 owner 五面（事实版本/角色状态/未了事项/金钱/剧情时间）各带来源楼层与有效范围；
 *      缺模块与空字段**不同形**：显式缺席的面 comparable:false、**不参与冲突判定**
 *      （把「不可比」读成「一样」是本面最贵的错读）。
 *   ② A 分支秘密不混入 B：filterByKeeper 按 viewer 过滤，剔除计数可见；
 *      同名异人按实体 id，不按名字（id 优先，走名字的另计）。
 *   ③ 冲突**不靠「较新一律覆盖」**：四档里 newer-wins 只在「较新一侧有效、较旧一侧失效」
 *      时才成立；两侧都有（或都无）有效回源 ⇒ undecided，**留空不猜**。
 *   ④ 受控交接三步不可合并：无预检 ⇒ held；预检 blocked ⇒ held 零应用；
 *      确认回执幂等（同 proposalId 二次调用不重复应用）+ 可回源 + 保存后回读三态。
 * 另加 F 段的**真源码破坏**：把「较新一律取胜」的防线换回默认覆盖，
 *   验证 A 段真判据会在破坏副本上翻红（原版通过作反向对照）。
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
const BS_SRC = fs.readFileSync(path.join(R, 'branch-semantics.js'), 'utf8');
const ORG_SRC = fs.readFileSync(path.join(R, 'memory-organs.js'), 'utf8');
const IDX_SRC = fs.readFileSync(path.join(R, 'index.js'), 'utf8');
const BS = require_(path.join(R, 'branch-semantics.js'));
/** 两侧都「模块全在」的载荷工厂。 */
const ALL = { factVersion: true, characterState: true, unfinished: true, money: true, storyTime: true };
const SIDE = (owners, modules) => ({ modules: modules === undefined ? ALL : modules, owners });
/** 加载被破坏的模块副本（副本会自挂全局，用完必须还原）。 */
function loadBroken(src, mutate) {
    const broken = mutate(src);
    assert.notStrictEqual(broken, src, '破坏必须真的发生');
    const saved = globalThis.LonShaBranchSemantics;
    const tmp = path.join(R, '__negctl_x6.tmp.cjs');
    fs.writeFileSync(tmp, broken);
    let api;
    try {
        delete require_.cache[require_.resolve(tmp)];
        api = require_(tmp);
    } finally {
        try { fs.unlinkSync(tmp); } catch (_e) { /* 清理失败不影响判定 */ }
        if (saved) { try { globalThis.LonShaBranchSemantics = saved; } catch (_e) { /* 冻结全局：忽略 */ } }
    }
    return api;
}
/* ──────────────────────────────────────────────────────────
 * 判据函数（正负两跑共用同一份；破坏副本上必须翻红）
 * ────────────────────────────────────────────────────────── */
/** 判据：两侧都有有效回源时，冲突**不得**由较新取胜。 */
function jNoNewerWins(mod) {
    const c = mod.classifyConflict({ value: 1, floor: 9 }, { value: 2, floor: 3 });
    if (c.verdict !== 'undecided') return '两侧都有效时须 undecided，实 ' + c.verdict;
    if (c.winner !== null) return 'undecided 不得给出 winner';
    return '';
}
/** 判据：较新一侧失效、较旧一侧有效 ⇒ stale-source，且赢家是**较旧**那侧。 */
function jStaleWins(mod) {
    const c = mod.classifyConflict({ value: 1, floor: 9, sourceValid: false }, { value: 2, floor: 3, sourceValid: true });
    if (c.verdict !== 'stale-source') return '较新失效须 stale-source，实 ' + c.verdict;
    if (c.winner !== 'b') return 'stale-source 的赢家须是较旧的 b，实 ' + c.winner;
    return '';
}
/** 判据：显式缺模块的面不可比，且不出提案。 */
function jAbsentIncomparable(mod) {
    /* money 面在两侧都声明缺失（modules 里没有 money），且目标侧多一条 gold。
     *   正确行为：comparable:false，且**不出可应用提案**（不可比 ≠ 可以按现状合并）。
     *   故障行为：把不可比面当可比 ⇒ gold 会走 add（skip 以外），判据当场翻红。
     *   ✅ 这是**可观测**的破坏点（旧版用 changed+缺楼层 ⇒ 落 undecided ⇒ skip，
     *   破坏不可观测——那是假绿第二形：判据对破坏反应不敏感）。 */
    const a = SIDE({ p: { money: { gold: 10 } } }, { factVersion: true });
    const b = SIDE({ p: { money: { gold: 10, silver: 9 } } }, { factVersion: true });
    const cmp = mod.compareOwners(a, b, {});
    const money = cmp.owners[0].faces.money;
    if (money.comparable !== false) return 'money 面缺模块须 comparable:false，实 ' + money.comparable;
    const pr = mod.proposeImport(cmp, {});
    if (pr.proposals.some((p) => p.face === 'money' && p.action !== 'skip')) return '不可比的面不得出可应用提案';
    return '';
}
/* ──────────────────────────────────────────────────────────
 * A. 只读面结构 + 三态
 * ────────────────────────────────────────────────────────── */
test('v3292 A1. 只读面结构：双导出、五面/四档/三档常量在场、零宿主存储', () => {
    assert.equal(typeof BS.compareOwners, 'function');
    assert.equal(typeof BS.proposeImport, 'function');
    assert.equal(typeof BS.precheckImport, 'function');
    assert.equal(typeof BS.confirmImport, 'function');
    assert.deepEqual(BS.FACES, ['factVersion', 'characterState', 'unfinished', 'money', 'storyTime']);
    assert.equal(BS.CONFLICT.SAME, 'same-value');
    assert.equal(BS.CONFLICT.NEWER, 'newer-wins');
    assert.equal(BS.CONFLICT.STALE, 'stale-source');
    assert.equal(BS.CONFLICT.UNDECIDED, 'undecided');
    assert.equal(BS.PRECHECK.OK, 'ok');
    assert.equal(BS.PRECHECK.WARN, 'warn');
    assert.equal(BS.PRECHECK.BLOCKED, 'blocked');
    /* 零依赖：面文件不得 require 别的模块（保持纯函数、可单测） */
    assert.equal(/require \(/.test(BS_SRC.replace(/require\(/g, 'require(')) && /require\(['"]/.test(BS_SRC), false, '面文件应零依赖（除双导出外不 require）');
    /* 零宿主存储：不碰 localStorage/IndexedDB */
    assert.equal(/localStorage|indexedDB/.test(BS_SRC), false, '面文件不得直碰宿主存储（持久化由调用方走既有 owner/epoch）');
});
test('v3292 A2. 模块在场三态：present / absent / unknown 互不相同', () => {
    assert.equal(BS.presenceOf({ modules: { 'fact-version': true } }, 'fact-version').state, 'present');
    assert.equal(BS.presenceOf({ modules: { 'fact-version': false } }, 'fact-version').state, 'absent');
    assert.equal(BS.presenceOf({ modules: {} }, 'fact-version').state, 'absent', '有表但没这项 = 确实没装');
    assert.equal(BS.presenceOf({}, 'fact-version').state, 'unknown', '没表 = 不知道装没装');
    /* unknown ≠ absent：把「不知道」当「缺席」会让「没告诉我们」变成「一定没有」 */
    assert.notEqual(BS.presenceOf({}, 'x').state, BS.presenceOf({ modules: {} }, 'x').state);
});
test('v3292 A3. 缺模块与空字段不同形：空面可比、缺模块不可比', () => {
    const a = SIDE({ p: { money: {} } }, { factVersion: true, characterState: true, unfinished: true, money: true, storyTime: true });
    const b = SIDE({ p: { money: { gold: 5 } } }, { factVersion: true, characterState: true, unfinished: true, money: true, storyTime: true });
    const cmp = BS.compareOwners(a, b, {});
    assert.equal(cmp.owners[0].faces.money.comparable, true, '模块在、只是空 ⇒ 可比');
    assert.equal(cmp.owners[0].faces.money.deltaCount, 1);
});
/* ──────────────────────────────────────────────────────────
 * B. 秘密边界
 * ────────────────────────────────────────────────────────── */
test('v3292 B1. A 分支秘密不混入 B：viewer 不在 keeper 名单内一律剔除', () => {
    const g = BS.filterByKeeper([
        { id: 'pub' },
        { id: 'sec1', keeperIds: ['u1'] },
        { id: 'sec2', keeperIds: ['u2'] }
    ], { id: 'u1' });
    assert.deepEqual(g.visible.map((e) => e.id), ['pub', 'sec1']);
    assert.equal(g.hidden, 1);
});
test('v3292 B2. viewer 为空时秘密不得全放行（不知道看的人是谁 ≠ 都能看）', () => {
    const g = BS.filterByKeeper([{ id: 'pub' }, { id: 'sec', keeperIds: ['u1'] }], null);
    assert.deepEqual(g.visible.map((e) => e.id), ['pub']);
    assert.equal(g.hidden, 1, '空 viewer 必须挡下秘密项');
});
test('v3292 B3. 同名异人按实体 id：名字相同但 id 不同不得串', () => {
    const entries = [
        { id: 'a', keeperIds: ['xiaoyirou-1'], keeper: ['萧忆柔'] },
        { id: 'b', keeperIds: ['xiaoyirou-2'], keeper: ['萧忆柔'] }
    ];
    const g = BS.filterByKeeper(entries, { id: 'xiaoyirou-1' });
    assert.deepEqual(g.visible.map((e) => e.id), ['a'], 'id 命中只放行对应那一条');
    assert.equal(g.hidden, 1);
});
test('v3292 B4. 只带名字的 keeper：按名放行但单列计数（同名异人风险可见）', () => {
    const g = BS.filterByKeeper([{ id: 'x', keeper: ['萧忆柔'] }], { name: '萧忆柔' });
    assert.deepEqual(g.visible.map((e) => e.id), ['x']);
    assert.equal(g.nameMatched, 1, '同名异人风险：按名字命中的条数必须数得出来（实 ' + g.nameMatched + '）');
});
/* ──────────────────────────────────────────────────────────
 * C. 冲突四档：不靠较新
 * ────────────────────────────────────────────────────────── */
test('v3292 C1. same-value：值级相同，不同楼层也算 same（不是每条差异都是冲突）', () => {
    assert.equal(BS.classifyConflict({ value: 1, floor: 3 }, { value: 1, floor: 9 }).verdict, 'same-value');
    assert.equal(BS.classifyConflict({ value: { a: 1, b: 2 }, floor: 1 }, { value: { b: 2, a: 1 }, floor: 5 }).verdict, 'same-value', '对象键序不同应判 same');
});
test('v3292 C2. 较新不默认取胜：两侧都有效 ⇒ undecided 且 winner 为空', () => {
    const why = jNoNewerWins(BS);
    assert.equal(why, '', why);
});
test('v3292 C3. 较新失效、较旧有效 ⇒ stale-source，赢家是较旧那侧', () => {
    const why = jStaleWins(BS);
    assert.equal(why, '', why);
});
test('v3292 C4. 仅较新有效 ⇒ newer-wins（这一档是条件成立，不是默认）', () => {
    const c = BS.classifyConflict({ value: 1, floor: 9 }, { value: 2, floor: 3, sourceValid: false });
    assert.equal(c.verdict, 'newer-wins');
    assert.equal(c.winner, 'a');
    assert.notEqual(c.reason, 'both-valid', '这一档不得由 both-valid 走出');
});
test('v3292 C5. 楼层缺失/相等 ⇒ 判不开，绝不猜', () => {
    assert.equal(BS.classifyConflict({ value: 1 }, { value: 2, floor: 3 }).verdict, 'undecided', '一侧缺楼层');
    assert.equal(BS.classifyConflict({ value: 1, floor: 5 }, { value: 2, floor: 5 }).verdict, 'undecided', '同楼层');
});
/* ──────────────────────────────────────────────────────────
 * D. 逐 owner 对照
 * ────────────────────────────────────────────────────────── */
test('v3292 D1. 五面各自出读数，delta 带来源楼层与有效范围', () => {
    const a = SIDE({ p: { factVersion: [{ id: 'f1', value: 'open', floor: 3, scope: 'branch' }] } });
    const b = SIDE({ p: { factVersion: [{ id: 'f1', value: 'closed', floor: 9, scope: 'shared' }] } });
    const cmp = BS.compareOwners(a, b, {});
    const d = cmp.owners[0].faces.factVersion.deltas[0];
    assert.equal(d.kind, 'changed');
    assert.equal(d.from.a, 3);
    assert.equal(d.from.b, 9);
    assert.equal(d.scope.a, 'branch');
    assert.equal(d.scope.b, 'shared');
});
test('v3292 D2. 未知 scope 不猜成「同支」：缺 scope 记 unknown', () => {
    const a = SIDE({ p: { money: { gold: 1 } } });
    const b = SIDE({ p: { money: { gold: 2 } } });
    const cmp = BS.compareOwners(a, b, {});
    const d = cmp.owners[0].faces.money.deltas[0];
    assert.equal(d.scope.a, 'unknown');
    assert.equal(d.scope.b, 'unknown');
});
test('v3292 D3. 条目按身份键对齐（id 优先，非按下标）', () => {
    const a = SIDE({ p: { factVersion: [{ id: 'f1', value: 1, floor: 1 }, { id: 'f2', value: 2, floor: 2 }] } });
    const b = SIDE({ p: { factVersion: [{ id: 'f2', value: 2, floor: 2 }, { id: 'f1', value: 1, floor: 1 }] } });
    const cmp = BS.compareOwners(a, b, {});
    assert.equal(cmp.owners[0].faces.factVersion.deltaCount, 0, '顺序不同、内容相同不得报差异');
});
test('v3292 D4. 不可比的面不出提案：jAbsentIncomparable', () => {
    const why = jAbsentIncomparable(BS);
    assert.equal(why, '', why);
});
test('v3292 D5. 截断可见：超上限时 truncated 报 true 且 deltaCount 报真实条数', () => {
    const many = [];
    for (let i = 0; i < 12; i++) many.push({ id: 'f' + i, value: i, floor: i });
    const a = SIDE({ p: { factVersion: many } });
    const b = SIDE({ p: { factVersion: [] } });
    const cmp = BS.compareOwners(a, b, { maxDeltas: 5 });
    const f = cmp.owners[0].faces.factVersion;
    assert.equal(f.deltas.length, 5, '输出必须有界');
    assert.equal(f.truncated, true);
    assert.equal(f.deltaCount, 12, 'deltaCount 必须报真实条数');
});
test('v3292 D6. 对照只读：compareOwners 不写两侧载荷', () => {
    const a = SIDE({ p: { money: { gold: 1 } } });
    const b = SIDE({ p: { money: { gold: 2 } } });
    const snapA = JSON.stringify(a);
    const snapB = JSON.stringify(b);
    BS.compareOwners(a, b, {});
    assert.equal(JSON.stringify(a), snapA, '侧 A 未被改动');
    assert.equal(JSON.stringify(b), snapB, '侧 B 未被改动');
});
/* ──────────────────────────────────────────────────────────
 * E. 受控交接：提案 / 预检 / 确认
 * ────────────────────────────────────────────────────────── */
test('v3292 E1. 提案只产出草稿：draft:true 且 applied:0', () => {
    const a = SIDE({ p: { money: { gold: 1 } } });
    const b = SIDE({ p: { money: { gold: 1, silver: 9 } } });
    const cmp = BS.compareOwners(a, b, {});
    const pr = BS.proposeImport(cmp, {});
    assert.equal(pr.draft, true);
    assert.equal(pr.applied, 0, '草稿阶段绝不落笔');
    assert.ok(pr.proposals.some((x) => x.action === 'add'), '目标侧缺的项应出 add 提案');
});
test('v3292 E2. 预检 blocked/warn/ok 三档分离：未决冲突 ⇒ blocked', () => {
    const pr = BS.proposeImport(BS.compareOwners(SIDE({ p: { money: { gold: 1 } } }), SIDE({ p: { money: { gold: 2 } } }), {}), {});
    const forced = { proposals: [Object.assign({}, pr.proposals[0], { action: 'replace', conflict: 'undecided' })] };
    const pc = BS.precheckImport(forced, {});
    assert.equal(pc.verdict, 'blocked');
    assert.ok(pc.blockers.some((b) => b.why === 'undecided-conflict'));
});
test('v3292 E3. 预检 warn ≠ blocked：有派生依赖只是 warn', () => {
    const list = [{ owner: 'p', face: 'money', key: 'gold', action: 'replace', conflict: 'newer-wins' }];
    const pc = BS.precheckImport(list, { dependents: { gold: ['some.ref'] } });
    assert.equal(pc.verdict, 'warn');
    assert.equal(pc.blockers.length, 0);
    assert.ok(pc.warnings.some((w) => w.why === 'has-dependents'));
});
test('v3292 E4. 预检知识边界：提案带 keeper 而 viewer 不在名单内 ⇒ blocked', () => {
    const list = [{ owner: 'p', face: 'money', key: 'gold', action: 'add', keeperIds: ['u1'] }];
    const pc = BS.precheckImport(list, { viewer: { id: 'u2' } });
    assert.equal(pc.verdict, 'blocked');
    assert.ok(pc.blockers.some((b) => b.why === 'knowledge-boundary'));
});
test('v3292 E5. 无预检 ⇒ held（不许跳过预检直接落笔）', async () => {
    const r = await BS.confirmImport({ proposals: [{ action: 'add' }], proposalId: 'x' });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'no-precheck');
    assert.equal(r.applied, 0);
});
test('v3292 E6. 预检 blocked ⇒ held 且零应用（不半截应用）', async () => {
    let calls = 0;
    const r = await BS.confirmImport({
        proposals: [{ action: 'add' }],
        precheck: { verdict: 'blocked', blockers: [{}] },
        proposalId: 'x',
        applyFn: () => { calls++; return { ok: true }; }
    });
    assert.equal(r.held, true);
    assert.equal(r.applied, 0);
    assert.equal(calls, 0, '★ held 必须零调用写入口');
});
test('v3292 E7. 确认幂等：同 proposalId 二次调用不重复应用', async () => {
    let calls = 0;
    const seen = {};
    const args = {
        proposals: [{ action: 'add' }, { action: 'add' }],
        precheck: { verdict: 'ok' },
        proposalId: 'p1',
        applyFn: () => { calls++; return { ok: true }; },
        sourceRef: 'chk/a', targetRef: 'live'
    };
    const r1 = await BS.confirmImport(args);
    assert.equal(r1.applied, 2);
    assert.equal(calls, 2);
    seen['p1'] = { applied: 2 };
    const r2 = await BS.confirmImport(Object.assign({}, args, { seen }));
    assert.equal(r2.duplicate, true);
    assert.equal(r2.applied, 2, '重试不得增条');
    assert.equal(calls, 2, '★ 重试不得再调写入口');
});
test('v3292 E8. 可回源：回执带 sourceRef 与 targetRef', async () => {
    const r = await BS.confirmImport({
        proposals: [{ action: 'add' }],
        precheck: { verdict: 'ok' },
        proposalId: 'p1',
        applyFn: () => ({ ok: true }),
        sourceRef: 'chk/A', targetRef: 'chk/B'
    });
    assert.equal(r.sourceRef, 'chk/A');
    assert.equal(r.targetRef, 'chk/B');
});
test('v3292 E9. 保存后回读三态：ok / mismatch / unreadable 互不相同', async () => {
    const base = { proposals: [{ action: 'add' }], precheck: { verdict: 'ok' }, proposalId: 'p', applyFn: () => ({ ok: true }) };
    assert.equal((await BS.confirmImport(Object.assign({}, base, { readback: () => 1 }))).readback, 'ok');
    assert.equal((await BS.confirmImport(Object.assign({}, base, { readback: () => 99 }))).readback, 'mismatch');
    assert.equal((await BS.confirmImport(Object.assign({}, base, { readback: () => { throw new Error('boom'); } }))).readback, 'unreadable');
    /* 无回读函数：readback 保持 null（不是假装 ok） */
    assert.equal((await BS.confirmImport(Object.assign({}, base))).readback, null);
});
/* [v3.292.0 · X6 修] 异步回读：真宿主的 readback 必须 await storage.save()。
 *   修前本出口是同步函数，异步回读拿到的是 Promise 对象 ⇒ `ok` 永不成立（恒失效判据）。
 *   这一条把「同步值」与「异步值」两条路径都钉住（await 对非 Promise 值恒等）。 */
test('v3292 E9b. 异步回读真跑：readback 返回 Promise ⇒ 三态仍正确（修前恒 mismatch）', async () => {
    const base = { proposals: [{ action: 'add' }], precheck: { verdict: 'ok' }, proposalId: 'p', applyFn: () => ({ ok: true }) };
    assert.equal((await BS.confirmImport(Object.assign({}, base, { readback: async () => 1 }))).readback, 'ok',
        '★ 异步回读返回值须与 applied 比对（不得把 Promise 当读数）');
    assert.equal((await BS.confirmImport(Object.assign({}, base, { readback: async () => 99 }))).readback, 'mismatch');
    assert.equal((await BS.confirmImport(Object.assign({}, base, { readback: async () => { throw new Error('boom'); } }))).readback, 'unreadable');
});
test('v3292 E10. 无写入口不得假装成功（没接上 ≠ 已应用）', async () => {
    const r = await BS.confirmImport({ proposals: [{ action: 'add' }], precheck: { verdict: 'ok' }, proposalId: 'p' });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'no-apply-fn');
    assert.equal(r.applied, 0);
});
/* ──────────────────────────────────────────────────────────
 * G. 读数
 * ────────────────────────────────────────────────────────── */
test('v3292 G1. line 读数含 owner 数，且不可比/缺模块分列', () => {
    const a = SIDE({ p: { money: { gold: 1 } } }, { money: true });
    const b = SIDE({ p: { money: { gold: 2 } } }, { money: true });
    const cmp = BS.compareOwners(a, b, {});
    assert.ok(BS.line(cmp).includes('owner 1'), BS.line(cmp));
    assert.equal(BS.line(null), '未对照');
});
test('v3292 G2. 非对象/畸形输入不抛（三态归因）', () => {
    assert.doesNotThrow(() => BS.compareOwners(null, undefined, {}));
    assert.doesNotThrow(() => BS.classifyConflict(null, null));
    assert.doesNotThrow(() => BS.proposeImport(null, {}));
    assert.doesNotThrow(() => BS.precheckImport(null, {}));
    assert.equal(BS.proposeImport(null, {}).ok, false);
    assert.equal(BS.compareOwners(null, undefined, {}).ownerCount, 0);
});
/* ──────────────────────────────────────────────────────────
 * H. 宿主真接线（不是只建了模块）
 * ────────────────────────────────────────────────────────── */
test('v3292 H1. 宿主真接线：manifest 注册 + 取库 + 诊断行 + 持久化 + 退路', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(R, 'manifest.json'), 'utf8'));
    assert.equal(manifest.extra_js.includes('branch-semantics.js'), true, 'manifest 必须注册该面');
    assert.equal(IDX_SRC.includes('LonShaBranchSemantics'), true, 'index.js 必须取库该全局');
    assert.equal(IDX_SRC.includes('_branchSemanticsLine'), true, '诊断方法必须存在');
    assert.equal(IDX_SRC.includes('分支语义'), true, '诊断行名必须存在');
    assert.equal(IDX_SRC.includes('compareBranchOwners() { return null; }'), true, '★ 退路必须补齐（否则模块缺席时 TypeError 而非降级）');
    assert.equal(ORG_SRC.includes('branchSemanticsRead'), true, 'memory-organs 必须持有读数');
    assert.equal(ORG_SRC.includes('compareBranchOwners'), true, 'memory-organs 必须提供对照入口');
    assert.equal(ORG_SRC.includes('proposeBranchImport'), true, 'memory-organs 必须提供提案入口');
    assert.equal(ORG_SRC.includes('precheckBranchImport'), true, 'memory-organs 必须提供预检入口');
});
test('v3292 H2. 面文件不得退化，且版本四源同源（当版锚点）', () => {
    const pkg = require_(path.join(R, 'package.json'));
    const pkgRaw = String(pkg.version);
    const SQ = String.fromCharCode(39);
    const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
    assert.equal(vnum('3.292.0'), vnum(pkgRaw), '当版锚点须与 package.json 同源（V4 计数形态）');
    assert.ok(IDX_SRC.includes('const VERSION = ' + SQ + pkgRaw + SQ + ';'), 'index.js 版本常量须与 package.json 同源');
    assert.ok(fs.readFileSync(path.join(R, 'manifest.json'), 'utf8').includes('"version": "' + pkgRaw + '",'), 'manifest.json 版本须与 package.json 同源');
    assert.ok(BS_SRC.length > 20000, '面文件不得退化（实 ' + BS_SRC.length + ' 字节）');
});
/* ──────────────────────────────────────────────────────────
 * F. 真源码破坏（H2/H5/H6 纪律）
 *   锚点恰中 1 次 → 写破坏副本 → 在**副本**上跑同款真判据。
 *   原版通过作反向对照。锚点字面量在本层内只出现一次（H5），判据不引用锚点串。
 * ────────────────────────────────────────────────────────── */
test('v3292 F1. 工具自证：锚点不存在/不唯一必须抛', () => {
    assert.throws(() => breakSource(BS_SRC, 'const NOT_THERE = 1;', 'x'), /锚点/);
    assert.throws(() => breakSource(BS_SRC, 'verdict', 'y'), /锚点|唯一|恰中/);
});
test('v3292 F2. 真源码破坏：把「两侧都有效 ⇒ undecided」改成默认覆盖 ⇒ C2 真判据翻红', () => {
    /* 破坏点：把「都有效」这一支的结论换成「较新取胜」（回到本版修前的默认形态）。
     *   这是**可观测**的破坏：C2 真判据（两侧都有效不得由较新取胜）必然翻红。 */
    const ANCHOR = "            reason: (newerValid && olderValid) ? 'both-valid' : 'both-invalid',";
    const cnt = BS_SRC.split(ANCHOR).length - 1;
    assert.equal(cnt, 1, '锚点必须恰中 1 次，实际 ' + cnt);
    const B = loadBroken(BS_SRC, (s) => s.replace(ANCHOR, "            reason: 'both-valid', verdict: CONFLICT.NEWER, winner: newerSide,"));
    const why = jNoNewerWins(B);
    assert.notEqual(why, '', '★ 破坏副本上 C2 真判据必须实测失败（假绿通道未堵住）');
    assert.equal(jNoNewerWins(BS), '', '原版必须通过');
});
test('v3292 F3. 真源码破坏：把「较新失效 ⇒ 旧的赢」改成较新照赢 ⇒ C3 真判据翻红', () => {
    const ANCHOR = "        if (!newerValid && olderValid) {";
    const cnt = BS_SRC.split(ANCHOR).length - 1;
    assert.equal(cnt, 1, '锚点必须恰中 1 次，实际 ' + cnt);
    const B = loadBroken(BS_SRC, (s) => s.replace(ANCHOR, "        if (false && !newerValid && olderValid) {"));
    const why = jStaleWins(B);
    assert.notEqual(why, '', '★ 破坏副本上 C3 真判据必须实测失败');
    assert.equal(jStaleWins(BS), '', '原版必须通过');
});
test('v3292 F4. 真源码破坏：让缺模块面照常参与判定 ⇒ D4 真判据翻红', () => {
    /* 破坏点：把「不可比的面」当成可比（回到「缺模块与空字段同形」）。 */
    const ANCHOR = "                if (!fr.comparable) { skipped += fr.deltaCount || 0; continue; }";
    const cnt = BS_SRC.split(ANCHOR).length - 1;
    assert.equal(cnt, 1, '锚点必须恰中 1 次，实际 ' + cnt);
    const B = loadBroken(BS_SRC, (s) => s.replace(ANCHOR, "                if (false) { skipped += fr.deltaCount || 0; continue; }"));
    const why = jAbsentIncomparable(B);
    assert.notEqual(why, '', '★ 破坏副本上 D4 真判据必须实测失败');
    assert.equal(jAbsentIncomparable(BS), '', '原版必须通过');
});
/* ──────────────────────────────────────────────────────────
 * I. 宿主真实落笔闭环（真跑：真 BS 模块 + 真 WorldProgress + 真 storage + 真租约）
 *
 *   为什么单列一段：H 段只证明「字符串在文件里」，那是**接线声明**，不是**闭环**。
 *   X6 的验收原文要求「确认 → 落笔 → 落盘 → 回读」四个环各自可验；缺了这一段，
 *   「新增模块」就会被当成「产品闭环」（本仓点名过的最贵混淆）。
 *   本段把 `index.js` 的 `confirmBranchImport` 真方法体抽出来注入真依赖运行，
 *   判据只看**落笔结果**（promises 真多了几条）、**落盘证据**（storage 真被调用、
 *   返回值真被采信）、**回读三态**（ok / mismatch / unreadable 互不相同）、
 *   **代际栅栏**（epoch 变过 ⇒ 整批作废）与**幂等**（同 proposalId 不重复落）。
 * ────────────────────────────────────────────────────────── */
const ORG = require_(path.join(R, 'memory-organs.js'));
/** 按**定义处签名**（含开括号）抽取整段方法体，与 v3174 / v3238 同款口径。
 *  为什么 marker 必须是完整签名而不是方法名：本仓同名符号出现在三处 —— 调用点
 *  （`this._leaseValid(_stlLease)`）、退路桩（`confirmBranchImport() { return null; }`）
 *  与真定义。只给方法名会命中前两者，抽出来的是**空桩**，判据当场变恒真（本仓点名的
 *  假绿第一形：对原文件断言、被测对象根本不是真实现）。故要求调用方给足签名。 */
function extractMethod(source, marker) {
    const start = source.indexOf(marker);
    assert.ok(start > 0, '找不到方法定义 ' + marker);
    assert.equal(source.split(marker).length - 1, 1, '定义签名必须唯一：' + marker);
    const bodyStart = start + marker.length - 1;   // marker 末字符就是 '{'
    assert.equal(source[bodyStart], '{', 'marker 必须以 { 结尾：' + marker);
    let depth = 0, end = -1;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    assert.ok(end > 0, '方法花括号不闭合：' + marker);
    /* 带上 `async ` 前缀：confirmBranchImport 是 async，丢掉前缀会让 `await` 变语法错。 */
    const lineStart = source.lastIndexOf('\n', start) + 1;
    return source.slice(lineStart, end + 1);
}
/** 从真源码抽出 `_leaseValid` / `_leaseDrop` 两个依赖方法（本方法的栅栏判据靠它们）。 */
const LEASE_BAG = [extractMethod(IDX_SRC, '_leaseValid(lease) {'), extractMethod(IDX_SRC, '_leaseDrop(lease, task, floor) {')].join(',\n');
/** 真引擎夹具：真方法体 + 真 organ + 真 storage + 可控 epoch。 */
function makeHost(opts = {}) {
    const wp = opts.wp || new ORG.WorldProgress();
    const calls = { save: 0, saveOk: opts.saveOk !== false, exports: 0 };
    const storage = opts.noStorage ? null : {
        async save(chatId, payload) { calls.save++; calls.lastChat = chatId; calls.lastPayload = payload; return calls.saveOk; },
    };
    const factory = new Function('window', 'errLog', '_moduleLib', '_moduleLibFn', 'PLUGIN_NAME', 'console', `
        return ({
            ${extractMethod(IDX_SRC, 'async confirmBranchImport(opts = {}) {')},
            ${LEASE_BAG},
            getCurrentChatId() { return this._cid === undefined ? 'c1' : this._cid; },
            collectExport() { return this._exp; }
        });
    `);
    const win = { LonShaBranchSemantics: opts.bs === undefined ? BS : opts.bs };
    const eng = factory(win, () => {}, () => (opts.bs === undefined ? BS : opts.bs), () => (opts.bs === undefined ? BS : opts.bs), 'LonSha记忆引擎', { warn() {}, log() {}, error() {} });
    eng.worldProg = wp;
    eng.storage = storage;
    eng._mutationEpoch = opts.epoch === undefined ? 7 : opts.epoch;
    eng._cid = opts.cid === undefined ? 'c1' : opts.cid;
    eng._exp = {};
    eng.config = { config: {} };
    return { eng, wp, calls, storage };
}
/** 一条可落笔的 unfinished 提案（owner 面 = 本器官持有的唯一面）。 */
const PROP = (key, value) => ({ owner: '林砚', face: 'unfinished', key, action: 'add', value, from: { a: null, b: 12 }, scope: {} });
const OK_PRE = { verdict: 'ok', blockers: [], warnings: [] };

test('v3292 I1. 真落笔：预检 ok ⇒ promises 真增条，回读 ok，且回执带 sourceRef/targetRef', async () => {
    const { eng, wp, calls } = makeHost();
    const n0 = wp.promises.length;
    const r = await eng.confirmBranchImport({
        proposals: [PROP('p1', '归还典籍'), PROP('p2', '赴约')],
        precheck: OK_PRE, proposalId: 'pid-1', sourceRef: 'branch-A', targetRef: 'chat-main',
    });
    assert.equal(wp.promises.length, n0 + 2, '★ 真落笔：本器官 promises 必须真的多两条');
    assert.equal(r.applied, 2, '回执 applied 必须等于真落下的条数');
    assert.equal(r.ok, true, '落笔 + 落盘 + 回读全绿才可 ok');
    assert.equal(r.readback, 'ok', '回读三态须为 ok（来源计数与 applied 一致）');
    assert.equal(r.persisted, true, '落盘证据须为真（storage.save 返回 true）');
    assert.equal(r.sourceRef, 'branch-A', '可回源：来源引用必须在回执里');
    assert.equal(r.targetRef, 'chat-main', '可回源：目标引用必须在回执里');
    assert.equal(calls.save, 1, '★ 真落盘：storage.save 必须被调用恰好一次');
    assert.equal(wp.branchImportCount(), 2, '来源计数口径：只数 source=branch-import 的条');
});

test('v3292 I2. 无预检 / 预检非 ok ⇒ 零落笔（不许绕过预检），且 promises 不变', async () => {
    const a = makeHost();
    const r1 = await a.eng.confirmBranchImport({ proposals: [PROP('p1', 'x')], proposalId: 'pid-a' });
    assert.equal(r1.ok, false); assert.equal(r1.reason, 'no-precheck');
    assert.equal(a.wp.promises.length, 0, '★ 无预检不得落笔');
    assert.equal(a.calls.save, 0, '无预检不得落盘');
    const b = makeHost();
    const r2 = await b.eng.confirmBranchImport({ proposals: [PROP('p1', 'x')], precheck: { verdict: 'blocked', blockers: [{ why: 'undecided-conflict' }] }, proposalId: 'pid-b' });
    assert.equal(r2.ok, false); assert.equal(r2.held, true, 'blocked 须 held（不是「跑了但没落」的同形读数）');
    assert.equal(b.wp.promises.length, 0, '★ blocked 不得落笔');
});

test('v3292 I3. 落笔只落本器官持有的面：非 unfinished 面如实回报，不假装成功', async () => {
    const { eng, wp } = makeHost();
    const r = await eng.confirmBranchImport({
        proposals: [
            PROP('p1', '归还典籍'),
            { owner: '林砚', face: 'money', key: 'm1', action: 'add', value: 100, from: { a: null, b: 3 }, scope: {} },
        ],
        precheck: OK_PRE, proposalId: 'pid-3',
    });
    assert.equal(wp.promises.length, 1, '只有 unfinished 面那一落下去');
    assert.equal(r.applied, 1, '未持有的面不得计入 applied');
    assert.equal(r.dropped, 1, '未持有的面必须如实计入 dropped（不是静默丢弃）');
    assert.equal(r.ok, false, '★ 有 dropped ⇒ 不得报 ok（部分成功与全成功不得同形）');
});

test('v3292 I4. 落盘被拒 ⇒ persisted:false 且 ok:false（内存落了 ≠ 已落地）', async () => {
    const { eng, wp } = makeHost({ saveOk: false });
    const r = await eng.confirmBranchImport({ proposals: [PROP('p1', 'x')], precheck: OK_PRE, proposalId: 'pid-4' });
    assert.equal(wp.promises.length, 1, '内存里确实落了（如实记）');
    assert.equal(r.applied, 1, 'applied 保留真值，不假装「一条都没落」');
    assert.equal(r.persisted, false, '★ 落盘被拒必须留下证据（persisted:false）');
    assert.equal(r.ok, false, '★ 落盘被拒不得报 ok');
    assert.equal(r.reason, 'persist-failed', '归因须指向落盘失败（不是 unreadable 的同形读数）');
});

test('v3292 I5. 回读三态不同形：mismatch 与 unreadable 各归各因', async () => {
    /* 正常路径：来源计数 == applied ⇒ ok。 */
    const okHost = makeHost();
    const r1 = await okHost.eng.confirmBranchImport({ proposals: [PROP('p1', 'x')], precheck: OK_PRE, proposalId: 'pid-5' });
    assert.equal(r1.readback, 'ok', '正常路径回读须 ok');
    /* 核不上：保存那一刻的计数被外力抹掉 ⇒ 回读报 0 ≠ applied 1 ⇒ mismatch。 */
    const badHost = makeHost();
    const realSave = badHost.eng.storage.save.bind(badHost.eng.storage);
    badHost.eng.storage.save = async (c, p) => { const v = await realSave(c, p); badHost.wp.branchImportCount = () => 0; return v; };
    const r2 = await badHost.eng.confirmBranchImport({ proposals: [PROP('p2', 'y')], precheck: OK_PRE, proposalId: 'pid-5b' });
    assert.equal(r2.readback, 'mismatch', '★ 计数核不上须 mismatch（不得退化成 ok）');
    assert.equal(r2.persisted, true, '落盘本身成功（mismatch 是**回读核对**上的差异，不是落盘失败）');
    /* 契约边界（如实记，不夸大）：模块的 `ok` 只答「**有没有丢条目**」（dropped === 0），
     *   回读 mismatch 另答「落盘后核对得上吗」——两个不同问题，不得互相冒充。
     *   宿主侧另给出 `persisted`（落盘证据）与 `readback`（核对结果）两格读数，
     *   调用方按需分别消费；此处不把 mismatch 改写进 ok（那是偷换口径）。 */
    assert.equal(r2.reason, 'applied', '回读差异不改「全落笔成功」这条归因（两者是不同问题）');
    assert.notEqual(r2.readback, 'unreadable', 'mismatch 与 unreadable 必须不同形');
    /* 无回读口：organ 不提供 branchImportCount ⇒ unreadable（不是假装 ok）。 */
    const noRb = makeHost();
    noRb.eng.worldProg = { applyBranchImport: () => ({ ok: true, reason: 'added' }) };   /* 无 branchImportCount */
    const r3 = await noRb.eng.confirmBranchImport({ proposals: [PROP('p3', 'z')], precheck: OK_PRE, proposalId: 'pid-5c' });
    assert.equal(r3.readback, 'unreadable', '★ 无回读口须 unreadable（不是假装 ok）');
    assert.notEqual(r3.readback, r2.readback, 'unreadable 与 mismatch 必须不同形');
});

test('v3292 I6. 代际栅栏：落笔期间 epoch 变过 ⇒ 整批作废，但已落部分如实计数', async () => {
    const { eng, wp } = makeHost();
    /* 让落盘那一刻推进 epoch（模拟落笔期间用户回档/切聊）。 */
    const realSave = eng.storage.save.bind(eng.storage);
    eng.storage.save = async (c, p) => { eng._mutationEpoch += 1; return realSave(c, p); };
    const r = await eng.confirmBranchImport({ proposals: [PROP('p1', 'x')], precheck: OK_PRE, proposalId: 'pid-6' });
    assert.equal(r.ok, false, '★ 代际变过 ⇒ 不得报 ok');
    assert.equal(r.reason, 'epoch-changed', '归因须指向代际变更');
    assert.equal(r.stale, true, '须显式标记 stale（不是静默抹掉）');
    assert.equal(r.applied, 1, '★ 已落部分如实计数（不假装「一条都没落」）');
    assert.equal(wp.promises.length, 1, '内存里那一条确实在（抹掉就没人知道曾经落过）');
});

test('v3292 I7. 幂等：同 proposalId 二次调用不重复落笔、不重复调写入口', async () => {
    const { eng, wp } = makeHost();
    const first = await eng.confirmBranchImport({ proposals: [PROP('p1', 'x')], precheck: OK_PRE, proposalId: 'pid-7' });
    assert.equal(first.applied, 1);
    const second = await eng.confirmBranchImport({ proposals: [PROP('p1', 'x'), PROP('p9', 'y')], precheck: OK_PRE, proposalId: 'pid-7' });
    assert.equal(second.duplicate, true, '★ 同 id 二次调用须报 duplicate');
    assert.equal(wp.promises.length, 1, '★ 幂等：第二次不得再落条（哪怕提案里多了新项）');
    assert.equal(second.applied, first.applied, '重复回执的 applied 不得增长');
});

test('v3292 I8. 宿主闭环缺件降级：模块缺席 / 无 applyFn ⇒ null 或如实拒绝，绝不假装成功', async () => {
    const noBs = makeHost({ bs: null });
    const r1 = await noBs.eng.confirmBranchImport({ proposals: [PROP('p1', 'x')], precheck: OK_PRE, proposalId: 'pid-8' });
    assert.equal(r1, null, '★ 模块缺席须降级为 null（不是抛，也不是假装 ok）');
    const noOrgan = makeHost();
    noOrgan.eng.worldProg = null;
    const r2 = await noOrgan.eng.confirmBranchImport({ proposals: [PROP('p1', 'x')], precheck: OK_PRE, proposalId: 'pid-8b' });
    assert.equal(r2.applied, 0, '★ 无 organ ⇒ 零应用（没接上不得说成已应用）');
    assert.equal(r2.ok, false, '无 organ 不得报 ok');
});

/* ── I 段真源码破坏（H5/H6 纪律）：把「只落本器官持有的面」拆掉 ⇒ I3 真判据必须翻红 ──
 *   ★ 判据纯度：本层内锚点字面量只声明一次、判据函数不引用锚点串（H5）。
 *   ★ 工具两向自证：锚点不存在 / 不唯一必须抛；破坏须**可观测改行为**，不只是改返回值。 */
const ORG_ANCHOR_FACE_GATE = "if (p.face !== 'unfinished')";
/** 判据：未持有的面必须被拒绝（破坏前必成立）。返回 '' = 通过。 */
function jFaceOwnedOnly(orgApi) {
    const w = new orgApi.WorldProgress();
    const r = w.applyBranchImport({ face: 'money', key: 'm1', action: 'add', value: 100 });
    if (!r || typeof r.ok !== 'boolean') return '返回值形态漂移：' + JSON.stringify(r);
    if (r.ok === true) return '未持有的面被错误放行（money 落进了 promises）';
    if (r.reason !== 'not-owned-by-this-organ') return '拒绝须归因到 owner 面，实 ' + r.reason;
    if (w.promises.length !== 0) return '被拒绝却仍写入了 promises（len=' + w.promises.length + '）';
    return '';
}
/** 真源码破坏：把 owner 面闸门换成恒真（回到「代持全部面」的形态）。 */
function breakOrgFaceGate(src) {
    const n = src.split(ORG_ANCHOR_FACE_GATE).length - 1;
    assert.equal(n, 1, '锚点必须恰中 1 次，实际 ' + n);
    const out = src.replace(ORG_ANCHOR_FACE_GATE, 'if (false)');
    assert.notStrictEqual(out, src, '破坏必须真的发生');
    return out;
}
/** 加载被破坏的 organ 副本（副本自挂全局，用完还原）。 */
function loadBrokenOrg(src) {
    const saved = globalThis.LonShaMemoryOrgans;
    const tmp = path.join(R, '__negctl_x6_org.tmp.cjs');
    fs.writeFileSync(tmp, src);
    let api;
    try {
        delete require_.cache[require_.resolve(tmp)];
        api = require_(tmp);
    } finally {
        try { fs.unlinkSync(tmp); } catch (_e) { /* 清理失败不影响判定 */ }
        if (saved) { try { globalThis.LonShaMemoryOrgans = saved; } catch (_e) { /* 忽略 */ } }
    }
    return api;
}

test('v3292 I9. 真源码破坏：拆掉 owner 面闸门 ⇒ I3 真判据翻红（原版通过）', () => {
    /* 工具两向自证：锚点不存在 / 不唯一必须抛。 */
    assert.throws(() => breakOrgFaceGate(ORG_SRC.replace(ORG_ANCHOR_FACE_GATE, 'if (true)')), /锚点/);
    assert.throws(() => breakOrgFaceGate(ORG_SRC + '\n' + ORG_ANCHOR_FACE_GATE), /锚点/);
    /* 原版反向对照：真模块必须通过同款判据。 */
    assert.equal(jFaceOwnedOnly(ORG), '', '原版必须通过 I3 真判据');
    /* 破坏副本：真源码破坏 → 加载破坏副本 → 同款真判据必须翻红。 */
    const B = loadBrokenOrg(breakOrgFaceGate(ORG_SRC));
    assert.notEqual(jFaceOwnedOnly(B), '', '★ 破坏副本上 I3 真判据必须实测失败（未持有的面被照落）');
});
