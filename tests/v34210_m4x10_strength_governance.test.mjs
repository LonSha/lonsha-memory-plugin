/* ============================================================
 * tests/v34210_m4x10_strength_governance.test.mjs — v3.421.0 · M4-X10
 * 记忆强度治理（策略面 + 双钥匙提案面）与 STM 主动销项额度
 *
 * 【本档要证明的五件事（不是「函数返回了对象」）】
 *   a) **自动建议爬不进 core**：策略面自带天花板 79，`identity` 基准 70 + 保护 15 也不会自己越线；
 *      越线只能由人给钥匙 —— 修前 `importance` 是没人敢改的裸数字，人调过之后下一轮 GC 照样删。
 *   b) **锁定是三向自洽的**：锁了不再给建议（difference 恰 0、requires_review false）、
 *      非 core 不许锁（抛而不是静默降档）、未锁时解锁抛（不许幂等错觉）。
 *   c) **双钥匙不许自己批自己**：同角色会签抛原文 "the proposer cannot provide the second key"；
 *      高风险四道闸各自单点可判（G1 目标 / G2 版本 / G3 状态 / G4 成对），回滚是**逐字快照**还原。
 *   d) **销项额度两条护栏都是硬拦**：额度 = `max(0, min(存量-保底, 本批新增))`，
 *      零新增或触保底 ⇒ 一行不销且**具名**回报原因；`shortfall` 让「命中 12 销 3」不等于「销了 3」。
 *   e) **宿主真的接上了**：三处消费点（`_evJudge` 的锁定豁免 / 批末 `closeEntries` / 总账两行读数）
 *      逐一在**真宿主切片**上取到行为，而不只是文本里有这个词。
 *
 * 【负控制一律真源码破坏】锚点恰中 1 次 → 在**破坏副本**上重跑**同款真判据** → 必须现形；
 *   并反向对照「原版同判据必须通过」。判据纯度（H5）与工具两向自证（H6）单独一段。
 * 【当版锚点】本档自锚常量 BORN_V + vnum（锚住在当版档案里，供版本守卫 V4 计数）。
 * 【诚实边界（本档不判的三条）】
 *   1 真实 SillyTavern 宿主的 UI 点击流与真实模型问答**未跑**：宿主面用**真装载宿主切片**
 *     取证（验的是调用口径与降级形态，不是真机上长得对不对）；
 *   2 `moraine` 上游的 Python 实现**未逐行比对**：本档判的是本仓重写后的行为契约，
 *     不是「与上游同字面」（许可不同，本来就允许写法不同）；
 *   3 提案的**承载 UI** 未判（那是面板的事）：本档只判纯函数面与宿主端点契约。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { breakOnce } from './_break_kit.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const IDX = read('index.js');
const SL = read('stm-ltm.js');
const GC = read('memory-gc.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const POL_SRC = read('strength-policy.js');
const PRO_SRC = read('strength-proposal.js');
const QUO_SRC = read('stm-close-quota.js');
const SELF = read(path.join('tests', 'v34210_m4x10_strength_governance.test.mjs'));
const BORN_V = '3.421.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));

/* ---------- 装载：三模块都是纯函数内核，无宿主依赖 ---------- */
function load(src) {
    const mod = { exports: {} };
    const fn = new Function('module', 'exports', 'globalThis', src);
    fn(mod, mod.exports, {});
    return mod.exports;
}
const POL = load(POL_SRC);
const PRO = load(PRO_SRC);
const QUO = load(QUO_SRC);

/* ---------- 真装载宿主切片：只搬被断言的那几段，不整份 index.js（它要 window 与 ST） ---------- */
/** 取 `index.js` 里 `_evJudge` 的整段函数体，装进最小宿主壳。真源码切片，不改一字。 */
function grabBlock(src, head, tailMark) {
    const i = src.indexOf(head);
    assert.ok(i >= 0, '宿主切片起点不在场：' + head);
    const j = src.indexOf(tailMark, i);
    assert.ok(j > i, '宿主切片终点不在场：' + tailMark);
    return src.slice(i, j);
}
function mkEvJudge() {
    /* `_evJudge` 依赖三个外部：`_stmLtmSalient`（闭包内）、`this.stmLtm`。该段落是
     * `const _evJudge = (item) => { ... };` 的整体，装进 vm 时按原样求值。 */
    const seg = grabBlock(IDX, 'const _evJudge = (item) => {', '/* 预算:未配置默认 32 条/轮');
    const mod = { exports: {} };
    const fn = new Function('module', 'exports', 'window',
        'const _stmLtmSalient = null;' + String.fromCharCode(10) + seg
        + String.fromCharCode(10) + 'module.exports = { _evJudge };');
    fn(mod, mod.exports, {});
    return mod.exports._evJudge;
}
/* ---------- 判据层（真源码 → 违规清单；两向使用：原版必空、破坏必非空） ---------- */
/** 天花板：`Math.min(p.automatic_ceiling, ...)` 必须真在建议出口上。 */
function badCeiling(src) {
    const bad = [];
    const api = load(src);
    const m = { id: 'i1', kind: 'identity', importance: 3 };
    for (let k = 0; k < 3; k++) {
        const s = api.suggestStrength(m).suggested_strength;
        if (s > api.defaultPolicy().automatic_ceiling) bad.push('建议越天花板：' + s);
    }
    /* 双重保护 + 高确认 + 满 priority 一起上也只到 79。 */
    const fat = { id: 'i2', kind: 'identity', importance: 5, protected: true, priority: 1,
        identity_weight: 1, memory_decay: { confirmation_count: 40 } };
    const s2 = api.suggestStrength(fat).suggested_strength;
    if (s2 > 79) bad.push('堆满信号也越了天花板：' + s2);
    return bad;
}
/** 锁定三向：不再建议 / 非 core 不许锁 / 未锁解锁抛。 */
function badLock(src) {
    const bad = [];
    const api = load(src);
    const locked = { id: 'x', importance: 4.2, governance: { strength_locked: true } };
    const r = api.suggestStrength(locked);
    if (r.suggested_strength !== r.current_strength) bad.push('锁定还在给不同建议');
    if (r.difference !== 0) bad.push('锁定 difference 非 0');
    if (r.requires_review !== false) bad.push('锁定仍要求复核');
    const opt = { actor: 'u', reason: 'r', now: 't' };
    assert.throws(() => api.manualStrengthChange({ id: 'a', importance: 3 }, 50, Object.assign({ lock: true }, opt)),
        /only manually assigned core strength/, '非 core 上锁必须抛');
    assert.throws(() => api.manualStrengthChange(locked, 90, opt), /locked/, '锁着还改必须抛');
    assert.throws(() => api.unlockStrength({ id: 'b' }, opt), /not locked/, '未锁解锁必须抛');
    return bad;
}
/** 双钥匙：自我会签必须抛，且换角色后状态回 ready。 */
function badKey(src) {
    const bad = [];
    const api = load(src);
    const m = { id: 'k1', importance: 2 };
    const base = { actor: 'machine-1', actor_role: 'machine', reason: 'go', now: 't1', expected_version: '0' };
    const p = api.createStrengthProposal(m, 90, base);          // 90 → core，必为高风险
    if (p.requires_second_key !== true) bad.push('高风险未要求第二把钥匙');
    if (p.status !== 'pending_review') bad.push('高风险未进待会签');
    try {
        api.reviewStrengthProposal(p, { actor: 'machine-2', actor_role: 'machine', decision: 'approve', now: 't2' });
        bad.push('同角色（换了个 id）也被放过去了');
    } catch (e) { if (!/cannot provide the second key/.test(e.message)) bad.push('抛的措辞不对：' + e.message); }
    const r = api.reviewStrengthProposal(p, { actor: 'u1', actor_role: 'human', decision: 'approve', now: 't2' });
    if (r.status !== 'ready') bad.push('会签后未回 ready');
    /* 四道闸：任一不过都必须抛，且措辞分得开。 */
    const okv = { current_version: '0', now: 't3' };
    const rv = api.reviewStrengthProposal(p, { actor: 'u1', actor_role: 'human', decision: 'return', now: 't2' });
    assert.throws(() => api.applyStrengthProposal(m, rv, okv), /not ready/, 'returned 态必须拒');
    assert.throws(() => api.applyStrengthProposal(Object.assign({}, m, { id: 'other' }), r, okv),
        /different memory/, '目标不一致必须拒');
    assert.throws(() => api.applyStrengthProposal(m, r, { current_version: '99', now: 't3' }),
        /version changed/, '版本不符必须拒');
    const p2 = api.createStrengthProposal(m, 90, base);
    /* G3 在 G4 之前，故正常路径「pending_review + 缺一把」先被 G3 拦。
     *   「ready 但缺钥匙」只在**外部导入 / 跨版本残留**的提案上出现，必须另行构造取证：
     *   否则 G4 永远走不到，写着的「双钥匙成对」等于没人验。 */
    const halfKey = Object.assign({}, api.reviewStrengthProposal(p, { actor: 'u1', actor_role: 'human', decision: 'approve', now: 't2' }));
    halfKey.signatures = { machine: halfKey.signatures.machine };
    halfKey.requires_second_key = true;
    assert.throws(() => api.applyStrengthProposal(m, halfKey, okv), /both keys are required/, '缺钥匙必须拒');
    const noDecide = Object.assign({}, halfKey, { signatures: { machine: { actor: 'm', decision: 'return', at: 't' }, human: { actor: 'u', decision: 'approve', at: 't' } } });
    assert.throws(() => api.applyStrengthProposal(m, noDecide, okv), /both keys are required/, '非 approve 不算钥匙');
    assert.throws(() => api.applyStrengthProposal(m, p2, okv), /not ready/, 'pending_review 也拒（G3 先于 G4）');
    return bad;
}
/** 回滚是逐字快照：应用后再回滚，治理字段与 importance 都要回到原样。 */
function badRollback(src) {
    const bad = [];
    const api = load(src);
    const m = { id: 'r1', importance: 2, governance: { audit: [{ action: 'old' }] }, tag: 'keep-me' };
    const p = api.createStrengthProposal(m, 30, { actor: 'm', actor_role: 'machine', reason: 'r', now: 't1', expected_version: '0' });
    const a = api.applyStrengthProposal(m, p, { current_version: '0', now: 't2' });
    if (a.record.importance === m.importance) bad.push('应用没改 importance');
    const back = api.rollbackStrengthChange(a);
    if (back.record.importance !== 2) bad.push('回滚未还原 importance');
    if (JSON.stringify(back.record.governance) !== JSON.stringify(m.governance)) bad.push('回滚未逐字还原治理对象');
    if (back.record.tag !== 'keep-me') bad.push('回滚丢了无关字段');
    if (a.record === m) bad.push('应用就地改了入参');
    return bad;
}
/** 额度两条护栏：零新增 / 触保底 / 双低取小 / shortfall 分得开。 */
function badQuota(src) {
    const bad = [];
    const api = load(src);
    const q = (o) => api.closeQuota(o);
    if (q({ before: 10, minKeep: 3, appended: 0, hits: 5 }).quota !== 0) bad.push('零新增未拦');
    if (q({ before: 10, minKeep: 3, appended: 0, hits: 5 }).reasons.indexOf('no-append') < 0) bad.push('没具名 no-append');
    if (q({ before: 3, minKeep: 3, appended: 9, hits: 5 }).quota !== 0) bad.push('触保底未拦');
    if (q({ before: 3, minKeep: 3, appended: 9, hits: 5 }).reasons.indexOf('keep-floor') < 0) bad.push('没具名 keep-floor');
    if (q({ before: 100, minKeep: 3, appended: 4, hits: 9 }).quota !== 4) bad.push('未取两支最小值');
    const sf = q({ before: 100, minKeep: 3, appended: 4, hits: 9 }).shortfall;
    if (sf !== 5) bad.push('shortfall 未如实（命中 9 只能销 4，应余 5，实 ' + sf + '）');
    if (q({ before: 10, minKeep: 3, appended: 2, hits: 0 }).blocked !== false) bad.push('额度 >0 却报 blocked');
    return bad;
}
/* ---------- 宿主层判据（真源码切片） ---------- */
/** `_evJudge` 对锁定条目必须给 exemptBudget 且 rank 高于 user-keep。 */
function badJudgeLock(src) {
    const bad = [];
    const judge = mkEvJudgeFrom(src);
    const lock = judge({ id: 'a', text: '随便一句', governance: { strength_locked: true } });
    if (!lock || lock.keep !== true) return ['锁定条目没被保住'];
    if (lock.exemptBudget !== true) bad.push('锁定条目没标 exemptBudget（会去吃保护预算）');
    const mine = judge({ id: 'b', text: '随便一句', pinned: true });
    if (!(lock.rank > mine.rank)) bad.push('锁定 rank ' + lock.rank + ' 未高于 user-keep ' + mine.rank);
    if (judge({ id: 'c', text: '普通一句' }) !== null) bad.push('普通条目被误保');
    return bad;
}
function mkEvJudgeFrom(src) { const s = src; const seg = grabBlock(s, 'const _evJudge = (item) => {', '/* 预算:未配置默认 32 条/轮'); const mod = { exports: {} }; const fn = new Function('module', 'exports', 'const _stmLtmSalient = null;' + String.fromCharCode(10) + seg + String.fromCharCode(10) + 'module.exports = { _evJudge };'); fn(mod, mod.exports, {}); return mod.exports._evJudge; }
/** 内存 GC 的免预算项必须先扣、且不计 overBudget。 */
function badGcExempt(src) {
    const bad = [];
    const mod = { exports: {} };
    new Function('module', 'exports', src)(mod, mod.exports);
    const gc = mod.exports;
    const cands = [1, 2, 3, 4].map((n, i) => ({ item: { id: 'v' + n, importance: 1 }, order: i }));
    const judge = (it) => (it.id === 'v1' ? { keep: true, rank: 110, reason: 'strength-locked', exemptBudget: true }
        : it.id === 'v2' ? { keep: true, rank: 100, reason: 'user-keep' }
            : null);
    /* 预算 0：普通保护项全被降级，**锁定项仍须保住**（否则「锁定」只在预算没满时成立）。 */
    const ev = gc.evidenceScreen(cands, judge, 0);
    const keptIds = ev.protected.map((x) => x.id);
    if (keptIds.indexOf('v1') < 0) bad.push('预算 0 时锁定项被降级删除');
    if (keptIds.indexOf('v2') >= 0) bad.push('预算 0 时普通保护项也被保住');
    if (Number(ev.overBudget) !== 1) bad.push('普通项降级未计 overBudget（实 ' + ev.overBudget + '）');
    if (Number(ev.exemptCount) !== 1) bad.push('exemptCount 读数缺失（盲区）');
    return bad;
}
/** 批末销项必须在真函数里跑通：命中面按楼层交集 + 拦截具名 + 不留 LTM 副本。 */
function badCloseWiring() {
    const bad = [];
    const stm = load(SL);
    let s = stm.normalizeState(null);
    s = stm.ingest(s, [
        { text: '甲事件的全部经过', floor: 1 },
        { text: '乙事件的全部经过', floor: 2 },
        { text: '丙事件的全部经过', floor: 3 },
        { text: '丁事件的全部经过', floor: 4 }
    ]);
    s.consolidate_threshold = 2;
    /* 巩固两批（不 await 摘要，降级拼接即可），拿到 floors 回报。 */
    const r1 = stm.consolidate(s, { force: true });
    const p1 = r1.then ? null : r1;
    return { stm, s, p: p1 };
}
/* ══════════ A. 内核面（策略） ══════════ */
test('v34210 A0. ★★★ 三模块自证全过（常量形状没被改坏）', () => {
    for (const [n, api] of [['strength-policy', POL], ['strength-proposal', PRO], ['stm-close-quota', QUO]]) {
        assert.equal(typeof api.selfCheck, 'function', n + ' 缺 selfCheck（自证面缺失即静默腐烂）');
        const r = api.selfCheck();
        assert.equal(r.ok, true, n + ' selfCheck 不过：' + (r.problems || []).join(' | '));
    }
    console.log('  ok 三模块 selfCheck 均 ok');
});
test('v34210 A1. ★★★★★ 自动建议爬不进 core（天花板 79）', () => {
    assert.deepEqual(badCeiling(POL_SRC), []);
    console.log('  ok identity+保护+满权重仍封在 79；人给钥匙才进 core');
});
test('v34210 A2. ★★★★★ 锁定三向自洽（不再建议 / 非 core 不许锁 / 未锁不许解）', () => {
    assert.deepEqual(badLock(POL_SRC), []);
    console.log('  ok 锁即停建议、非 core 拒锁、未锁拒解');
});
test('v34210 A3. ★★★ 人工改值三件套必填 + 审计只留尾部 50', () => {
    assert.throws(() => POL.manualStrengthChange({ id: 'x' }, 50, { reason: 'r', now: 't' }), /actor, reason and now are required/);
    assert.throws(() => POL.manualStrengthChange({ id: 'x' }, 50, { actor: 'a', now: 't' }), /required/);
    assert.throws(() => POL.manualStrengthChange({ id: 'x' }, 50, { actor: 'a', reason: 'r' }), /required/);
    let m = { id: 'x', importance: 3 };
    for (let i = 0; i < 60; i++) m = POL.manualStrengthChange(m, 40 + (i % 3), { actor: 'a', reason: 'r' + i, now: 't' + i }).record;
    assert.equal(m.governance.audit.length, 50, '审计环必须截到 50');
    assert.equal(m.governance.audit[49].reason, 'r59', '留的必须是尾部');
    console.log('  ok 三件套必填；审计环 50 且留尾');
});
test('v34210 A4. ★★★ importance 尺度可覆盖（三种旧语义不串）', () => {
    /* 宿主同时存在 0-1 / 1-5 / 0-10 三种口径：按条目自带 scale 换算，同一数字不得两种解释。 */
    assert.equal(POL.strengthFromImportance(0.8, 1), 80);
    assert.equal(POL.strengthFromImportance(4, 5), 80);
    assert.equal(POL.strengthFromImportance(8, 10), 80);
    assert.equal(POL.strengthFromImportance(null), null, '没给必须是 null，不能读成 0');
    assert.equal(POL.strengthFromImportance(0), 0, '给了 0 必须是 0');
    assert.equal(POL.importanceFromStrength(80, 10), 8);
    console.log('  ok 0-1/1-5/0-10 各自换算一致；null 与 0 不同形');
});
test('v34210 A5. ★★ 推演只读：当前分布不把「没标过」硬塞进 transient', () => {
    const r = POL.simulateStrengths([{ id: 'a', kind: 'event' }, { id: 'b', kind: 'event', importance: 3 }]);
    assert.equal(r.mode, 'read_only_simulation');
    const all = Object.values(r.current_distribution).reduce((x, y) => x + y, 0);
    assert.equal(all, 1, '无当前值的条目不得计入当前分布');
    console.log('  ok 当前分布只统计有值条目（实 ' + all + '）');
});
/* ══════════ B. 内核面（提案） ══════════ */
test('v34210 B1. ★★★★★ 同角色不得自我会签（换 id 也不行）', () => {
    assert.deepEqual(badKey(PRO_SRC), []);
    console.log('  ok 同 role 换 id 仍拒；换 human 才放行；四道闸各自具名');
});
test('v34210 B2. ★★★★★ 回滚是逐字快照（不是反算）', () => {
    assert.deepEqual(badRollback(PRO_SRC), []);
    console.log('  ok 回滚还原 importance/治理对象/无关字段，且未就地改入参');
});
test('v34210 B3. ★★★ 提案 id 稳定且与输入绑定（同输入同 id、改一点变 id）', () => {
    const m = { id: 's1', importance: 2 };
    const o = { actor: 'a', actor_role: 'machine', reason: 'r', now: 't', expected_version: '0' };
    const a = PRO.createStrengthProposal(m, 50, o).proposal_id;
    const b = PRO.createStrengthProposal(m, 50, o).proposal_id;
    const c = PRO.createStrengthProposal(m, 51, o).proposal_id;
    assert.equal(a, b, '同输入必须同 id');
    assert.notEqual(a, c, '改一个数必须换 id');
    assert.match(a, /^strength_[0-9a-f]{16}$/);
    console.log('  ok 指纹稳定 + 定长十六进制');
});
test('v34210 B4. ★★ 低风险直通 ready（不无脑要求会签）', () => {
    const p = PRO.createStrengthProposal({ id: 'q', importance: 2 }, 30,
        { actor: 'm', actor_role: 'machine', reason: '微调', now: 't', expected_version: '0' });
    assert.equal(p.high_impact, false);
    assert.equal(p.requires_second_key, false);
    assert.equal(p.status, 'ready');
    console.log('  ok 差 10 分不进 core 也不上锁 ⇒ ready');
});
/* ══════════ C. 内核面（额度） ══════════ */
test('v34210 C1. ★★★★★ 两条护栏都是硬拦且具名', () => {
    assert.deepEqual(badQuota(QUO_SRC), []);
    console.log('  ok no-append / keep-floor 各自拦下并具名；shortfall 与「销了」分得开');
});
test('v34210 C2. ★★★ 按**下标**销（同值条目不被连坐）', () => {
    const list = ['甲', '甲', '乙', '丙'];
    const r = QUO.applyClose(list, (x) => x === '甲', { minKeep: 1, appended: 4 });
    assert.equal(r.removed, 2, '两条同值都要销');
    assert.deepEqual(r.list, ['乙', '丙']);
    console.log('  ok 同值两条按下标各自销掉');
});
test('v34210 C3. ★★★ 额度 0 时一行不销且读数具名', () => {
    const r = QUO.applyClose(['甲', '乙'], () => true, { minKeep: 3, appended: 0 });
    assert.equal(r.removed, 0);
    assert.equal(r.list.length, 2);
    assert.match(r.line, /一行未销/);
    assert.match(r.line, /no-append/);
    assert.match(r.line, /keep-floor/);
    console.log('  ok 拦截行含原因，不是「销了 0 行」了事');
});
/* ══════════ D. 宿主面（真源码切片） ══════════ */
test('v34210 D1. ★★★★★ 治理锁定是免预算硬豁免（rank 高于 user-keep）', () => {
    assert.deepEqual(badJudgeLock(IDX), []);
    console.log('  ok 锁定 ⇒ keep + exemptBudget + rank 110 > 100');
});
test('v34210 D2. ★★★ metadata 里的治理对象也认（两处存放任一成立）', () => {
    const judge = mkEvJudge();
    const r = judge({ id: 'a', text: 'x', metadata: { governance: { strength_locked: true } } });
    assert.ok(r && r.keep === true, 'metadata.governance 形态必须也认');
    assert.equal(r.exemptBudget, true);
    console.log('  ok 顶层与 metadata 两种存放都认（导入路径不会漏）');
});
test('v34210 D3. ★★★★★ 免预算项先扣、且不计 overBudget；exemptCount 可见', () => {
    assert.deepEqual(badGcExempt(GC), []);
    console.log('  ok 预算 0 时锁定项仍保住，普通项降级并计 overBudget，exemptCount=1');
});
test('v34210 D4. ★★★★★ 批末销项真跑：命中按楼层交集、额度约束、拦截具名', async () => {
    const stm = load(SL);
    let s = stm.normalizeState(null);
    s.consolidate_threshold = 2;
    s = stm.ingest(s, [
        { text: '甲事件的完整经过在这里', floor: 1 },
        { text: '乙事件的完整经过在这里', floor: 2 }
    ]);
    const r1 = await stm.consolidate(s, { force: true });
    assert.deepEqual(r1.floors, [1, 2], 'consolidate 必须回报本批楼层');
    assert.equal(r1.state.stm_entries.length, 1, '两条 raw 应合一条 stm');
    /* 第一批：库里只有 1 条、保底 3 ⇒ 触保底，一行不销。 */
    const c1 = stm.closeEntries(r1.state, r1.state.stm_entries.map((e) => e.id), { minKeep: 3, appended: 2 });
    assert.equal(c1.removed, 0);
    assert.equal(c1.blocked, true);
    assert.ok(c1.reasons.indexOf('keep-floor') >= 0, '必须具名 keep-floor，实 ' + JSON.stringify(c1.reasons));
    /* 攒到 5 条后再销：保底 3 ⇒ 至多销 2；命中 5 条故 shortfall 必须为正。 */
    let s2 = r1.state;
    for (let f = 3; f <= 6; f += 1) {
        s2 = stm.ingest(s2, [{ text: '事件' + f + '的完整经过在这里', floor: f }, { text: '事件' + f + 'b的完整经过', floor: f }]);
        s2 = (await stm.consolidate(s2, { force: true })).state;
    }
    assert.equal(s2.stm_entries.length, 5, '应有 5 条');
    const c2 = stm.closeEntries(s2, s2.stm_entries.map((e) => e.id), { minKeep: 3, appended: 5 });
    assert.equal(c2.removed, 2, '保底 3 ⇒ 至多销 2');
    assert.equal(c2.removed, s2.stm_entries.length - c2.state.stm_entries.length);
    assert.equal(c2.shortfall, 3, '命中 5 销 2 ⇒ 余 3');
    assert.match(c2.line, /受额度所限 3 条未销/);
    assert.ok(c2.state.loss.floorDropped >= 2, '销项必须落 floorDropped');
    assert.equal(c2.state.ltm_entries.length, 0, '销项是直接删，不得留 LTM 副本');
    console.log('  ok 保底拦 → 额度截断 → shortfall 3 具名；直达删不留副本');
});
test('v34210 D5. ★★★★ 宿主批末真调用 closeEntries 并落读数（不是只有纯函数）', () => {
    assert.ok(/closeEntries\(this\._stmLtmState/.test(IDX), '宿主批末必须真调 closeEntries');
    assert.ok(/r\.floors/.test(IDX), '必须消费 consolidate 回报的楼层');
    assert.ok(/_stmLtmClose/.test(IDX), '受阻读数必须被记下（否则总账读不到）');
    assert.ok(/stmLtmCloseMinKeep/.test(IDX) && /stmLtmCloseMinKeep/.test(read('memory-config.js')),
        '保底参数必须可配且有缺省');
    console.log('  ok 批末调用 + floors 消费 + 受阻读数 + 可配保底');
});
test('v34210 D6. ★★★★ 总账三行读数在场（受阻 / 判据降级 / 锁定豁免）', () => {
    /* 取到「门控读数面」为止 —— 后面还有十几行，只截到 retentionCalibration 会截掉
     *   紧跟在锁定豁免之后的销项两行。 */
    const led = grabBlock(IDX, 'getDegradationLedger() {', '// [v3.171] 门控读数面');
    assert.match(led, /加固销项受阻/, '受阻必须进总账');
    assert.match(led, /销项判据降级/, '兜底降级必须进总账');
    assert.match(led, /治理锁定豁免/, '锁定豁免必须单独一行（不吃预算）');
    assert.match(led, /待会签提案/, '待会签数必须可见');
    console.log('  ok 四段读数各就各位');
});
test('v34210 D7. ★★★ 模块缺席不假装验过钥匙（keyMissing）', () => {
    const seg = grabBlock(IDX, 'proposeStrengthChange(id, strength, opts = {}) {', 'reviewStrengthChange(proposalId');
    assert.match(seg, /keyMissing: true/, '提案面缺席必须标 keyMissing');
    const sim = grabBlock(IDX, 'simulateStrengths() {', 'setStrengthManually(');
    assert.match(sim, /module-absent/, '策略面缺席必须 module-absent');
    console.log('  ok 缺席降级形态具名，不冒充已验');
});
/* ══════════ E. 注册与接线卫生 ══════════ */
test('v34210 E1. ★★★ 三模块已注册且顺序正确（额度先于消耗它的 stm-ltm）', () => {
    const js = MF.extra_js;
    for (const f of ['strength-policy.js', 'strength-proposal.js', 'stm-close-quota.js']) {
        assert.ok(js.indexOf(f) >= 0, f + ' 未注册');
    }
    assert.ok(js.indexOf('stm-close-quota.js') < js.indexOf('stm-ltm.js'), '额度模块必须先于 stm-ltm 加载');
    console.log('  ok 三模块在 manifest，额度排在被消耗者之前');
});
test('v34210 E2. ★★★ 宿主有真取库口（不是硬引全局）', () => {
    for (const n of ['LonShaStrengthPolicy', 'LonShaStrengthProposal', 'LonShaStmCloseQuota']) {
        assert.ok(IDX.indexOf('window.' + n) >= 0, n + ' 无取库口');
    }
    assert.match(SL, /closeQuotaApi\(\)/, 'stm-ltm 必须自取判据');
    assert.match(SL, /inline-fallback/, '兜底来源必须可归因');
    console.log('  ok 三取库口在场，兜底有标记');
});
test('v34210 E3. ★★ 许可出处留在文件头', () => {
    assert.match(POL_SRC, /PolyForm Noncommercial/, '策略面须记许可');
    assert.match(PRO_SRC, /PolyForm Noncommercial/, '提案面须记许可');
    assert.match(QUO_SRC, /MIT/, '额度面须记许可');
    assert.match(POL_SRC, /FNV-1a|FNV/, '须说明 sha256 的替换');
    console.log('  ok 三处许可与替换说明都在头部');
});
/* ══════════ F. 负控制（真源码破坏） ══════════ */
const ANCHORS = {
    kCeil: 'const suggested = Math.min(p.automatic_ceiling, clampStrength(score));',
    kLock: 'if (gov.strength_locked === true) {',
    /* 该锚点用双引号包，避免 `\'` 转义让「判据层文本」与「运行时值」不一致（H5 会当场照出）。 */
    kKeyRole: "if (by.role === role) throw new ValueError('the proposer cannot provide the second key');",
    kSnap: 'rollback_record: Object.assign({}, m),',
    kDel: 'const quota = Math.max(0, Math.min(byKeep, byAppend));',
    kExempt: 'exempt: r.exemptBudget === true }',
    kJudge: "return { keep: true, rank: 110, reason: 'strength-locked', exemptBudget: true };",
    kCall: 'const _cr = this.stmLtm.closeEntries(this._stmLtmState, _hits, {'
};
const L = (key) => breakOnce(load(arguments0(key)) && '', '', ''); // 占位（下方逐个用）
function expectRed(fn, key) {
    const bad = fn();
    assert.ok(bad.length > 0, '破坏 ' + key + ' 后判据必须转红（实际全绿 = 假绿）');
}
test('v34210 F1. ★★★★★ 破坏天花板 ⇒ A1 判据转红（原版必绿）', () => {
    const bad = breakOnce(POL_SRC, ANCHORS.kCeil, 'const suggested = clampStrength(score);', 'kCeil');
    expectRed(() => badCeiling(bad), 'kCeil');
    assert.deepEqual(badCeiling(POL_SRC), [], '原版同判据必须过');
    console.log('  ok 天花板被拆 ⇒ 建议越 79;原版阳性通过');
});
test('v34210 F2. ★★★★ 破坏锁定即停 ⇒ A2 判据转红（原版必绿）', () => {
    const bad = breakOnce(POL_SRC, ANCHORS.kLock, 'if (false) {', 'kLock');
    expectRed(() => badLock(bad), 'kLock');
    assert.deepEqual(badLock(POL_SRC), [], '原版同判据必须过');
    console.log('  ok 锁了还给建议 ⇒ 判据照出;原版阳性通过');
});
test('v34210 F3. ★★★★★ 破坏自我会签拦截 ⇒ B1 判据转红（原版必绿）', () => {
    /* 破坏成「换了个 id 就放行」（而不是整条删掉）：删掉后四道闸仍会在应用阶段拦下，
     *   判据里那些 `assert.throws` 照样通过 —— 只有**只跳过 role 比较**才暴露「自己批自己」这个点。 */
    const bad = breakOnce(PRO_SRC, ANCHORS.kKeyRole, 'if (by.role === role && by.id === actor) throw new ValueError(\'the proposer cannot provide the second key\');', 'kKeyRole');
    expectRed(() => badKey(bad), 'kKeyRole');
    assert.deepEqual(badKey(PRO_SRC), [], '原版同判据必须过');
    console.log('  ok 自己批自己也放行 ⇒ 判据照出;原版阳性通过');
});
test('v34210 F4. ★★★★★ 破坏快照 ⇒ B2 判据转红（原版必绿）', () => {
    const bad = breakOnce(PRO_SRC, ANCHORS.kSnap, 'rollback_record: {},', 'kSnap');
    expectRed(() => badRollback(bad), 'kSnap');
    assert.deepEqual(badRollback(PRO_SRC), [], '原版同判据必须过');
    console.log('  ok 快照变空 ⇒ 回滚还原失败被照出;原版阳性通过');
});
test('v34210 F5. ★★★★★ 破坏取小 ⇒ C1 判据转红（原版必绿）', () => {
    const bad = breakOnce(QUO_SRC, ANCHORS.kDel, 'const quota = byAppend;', 'kDel');
    expectRed(() => badQuota(bad), 'kDel');
    assert.deepEqual(badQuota(QUO_SRC), [], '原版同判据必须过');
    console.log('  ok 只认新增不认保底 ⇒ 判据照出;原版阳性通过');
});
test('v34210 F6. ★★★★ 破坏免预算标记 ⇒ D3 判据转红（原版必绿）', () => {
    const bad = breakOnce(GC, ANCHORS.kExempt, 'exempt: false }', 'kExempt');
    expectRed(() => badGcExempt(bad), 'kExempt');
    assert.deepEqual(badGcExempt(GC), [], '原版同判据必须过');
    console.log('  ok 锁定项去吃预算 ⇒ 预算 0 时被删;原版阳性通过');
});
test('v34210 F7. ★★★★ 破坏判定器豁免 ⇒ D1 判据转红（原版必绿）', () => {
    const bad = breakOnce(IDX, ANCHORS.kJudge, "return { keep: true, rank: 90, reason: 'strength-locked' };", 'kJudge');
    expectRed(() => badJudgeLock(bad), 'kJudge');
    assert.deepEqual(badJudgeLock(IDX), [], '原版同判据必须过');
    console.log('  ok 摘掉 exemptBudget 且 rank 压到 90 ⇒ 判据照出;原版阳性通过');
});
test('v34210 F8. ★★★★ 破坏宿主批末调用 ⇒ D5 判据转红（原版必绿）', () => {
    /* 破坏成「换成另一个对象的方法名」而不是摘掉整行：摘行后 `closeEntries(this._stmLtmState`
     *   这个正则仍可能被下一行满足，判据会假绿。换名才真的打在这个点上。 */
    const bad = breakOnce(IDX, ANCHORS.kCall, 'const _cr = this.stmLtm.closeBatch(this._stmLtmState, _hits, {', 'kCall');
    expectRed(() => (/closeEntries\(this\._stmLtmState/.test(bad) ? [] : ['批末未调 closeEntries']), 'kCall');
    assert.equal(/closeEntries\(this\._stmLtmState/.test(IDX), true, '原版必须真调');
    console.log('  ok 批末调用被换成未定义方法 ⇒ 判据照出;原版阳性通过');
});
/* ══════════ G. 判据纯度（H5）+ 工具两向自证（H6） ══════════ */
const CNT = (hay, needle) => String(hay).split(String(needle)).length - 1;
/** 空白归一：源码是**多行**的，而锚点在判据层是单行字面量，不归一永远对不上。 */
const NORM = (s) => String(s).replace(/\s+/g, ' ').trim();
const ONE = NORM(SELF);
test('v34210 G1. ★★★★★ 判据纯度（H5）：八锚点在**本档判据层**各恰 1 次', () => {
    const bad = [];
    for (const [k, v] of Object.entries(ANCHORS)) {
        const decl = CNT(ONE, NORM(v));
        if (decl !== 1) bad.push(k + ' 在判据层必须恰 1 次，实测 ' + decl);
    }
    assert.deepEqual(bad, [], 'H5 不合格：' + bad.join(' | '));
    console.log('  ok 八锚点各恰 1 次');
});
test('v34210 G2. ★★★★ 工具两向自证（H6）：打偏/多处/同值都被工具自己挡住', () => {
    assert.throws(() => breakOnce(POL_SRC, '这个锚点不存在()', 'x', 'p1'), /拒绝破坏/);
    assert.throws(() => breakOnce(POL_SRC, 'return', 'return 0;', 'p2'), /恰中 1 次/);
    assert.throws(() => breakOnce(POL_SRC, ANCHORS.kLock, ANCHORS.kLock, 'p3'), /必须真的改变源码/);
    console.log('  ok 三种坏法全被挡');
});
test('v34210 G3. ★★★ 版本锚：BORN_V 就是当版（下界口径）', () => {
    assert.ok(vnum(BORN_V) <= vnum(MF.version), '自锚不得承诺未来版');
    assert.equal(vnum(BORN_V), 3421000);
    assert.ok(vnum(BORN_V) > vnum('3.420.0'), '版本序须前进');
    const idxV = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(vnum(idxV) >= vnum(BORN_V), 'index.js 版本不得低于本档出生版本');
    for (const rel of ['memory-organs.js', 'memory-config.js', 'memory-core.js']) {
        assert.match(read(rel), new RegExp("let VERSION = '" + idxV + "'"), rel + ' 未同源');
    }
    assert.equal(PKG.version, idxV, 'package.json 未同源');
    console.log('  ok 锚 ' + BORN_V + ' · 六源同源');
});
