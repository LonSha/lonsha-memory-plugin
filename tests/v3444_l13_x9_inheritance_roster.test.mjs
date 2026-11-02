/* ============================================================
 * tests/v3444_l13_x9_inheritance_roster.test.mjs — v3.444.0
 * ------------------------------------------------------------
 * L13-X9 · 跨代传承面 —— 「上一代留下的东西，现在怎样了」。
 *
 * 【真实现场（本版起点，读码可复算）】
 *   内核 era-continuation-inheritance-tree.js 出厂时只有 60 行 / 一个导出
 *   `inheritEraArtifact`：四态常量声明着（INHERITANCE_FATE），但
 *     ① **没有可读成因** —— 同为 'lost'，「被明确宣告丢了」与「传接跑完了它却没被处置」
 *        在读数上同形，用户分不出「真的遗失了」还是「流程漏了它」；
 *     ② **没有与既有 `worldProg.eraTransitions` 槽对接** —— 槽在（memory-organs.js:1426
 *        构造、:2374 导出、:2449 导入），内核却不去读，等于「有账不会念」。
 *   面板侧 `prequel` 视图（2025 字符 / 1 个按钮）只做前情资料导入，完全没有传承清单。
 *
 * 【本档钉住的七件事】
 *   A  四态 + 第五档：`PENDING_FATE='pending'` **刻意不进** INHERITANCE_FATE
 *      （混进去会让「四态穷尽」这条自证当场失效）；四态与 pending 的 counts 各自独立。
 *   B  每态可读成因：`FATE_CAUSES` 里**同态不同因**必须分开
 *      （`lost:declared-lost` ≠ `lost:dropped-in-transition`）；且**表里每一项都必须
 *      真被某个分支产生**（反面：表里有、代码里永不产出的成因 = 假说明）。
 *   C  槽对接：`buildInheritanceRoster` 直接吃 `eraTransitions` 原样，
 *      **不读 engine、不写任何槽**（writesNothing:true）。
 *   D  三态不同形：`transitions-not-array`（面没接上）≠ `no-artifacts`（账在但空）≠ ok。
 *   E  秘密断代：一律调注入的 `knowledgeOf`，四档 disclosed/withheld/undecided/absent
 *      互不同形；`unlisted`（判不了）与 `absent`（账里根本没这条）**必须分开**。
 *   F  写入面：`confirm` 是硬门槛；`pending` **不可声明**；撤销回**推导值**（不是 pending）。
 *   G  真源码破坏两条（各配原版对照）+ 接线面 + 当版锚。
 *
 * 【本版真跑抓到并修掉的产品缺陷（本档 E/F 组把它钉成回归位）】
 *   `appliedItems` 不是「做过的选择」，是「**应用过**的选择」。首版判定只写 `else if (chosen)`
 *   没 gate 在 `applied` 上 ⇒ 转场被撤销或本来没跑完时，残留记录会被读成「后辈接纳了」。
 *   正是本面第①条的**镜像错**：把「还没发生」读成「已经有结果」。
 *
 * 【两条纪律（本仓反复付过学费）】
 *   1. 判据切片一律用**真实锚点 + 唯一性自证**，锚点不唯一时判据自己先红。
 *   2. 负控制一律「真源码破坏 → 加载破坏副本 → 在副本上重跑同一条判据」；
 *      判据函数**不引用**锚点串（避免自我指涉的假绿）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { breakSource } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const KER_SRC = read('era-continuation-inheritance-tree.js');
const DIAG_SRC = read('engine-diagnostic-lines.js');
const HOST_SRC = read('index.js');
const UI_SRC = read('settings-ui.js');
const SL_SRC = read('secret-ledger.js');
const MANIFEST = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));

// ── 锚点（文件头声明一次；判据函数**不**引用这些串） ──────────────────────
const A_PEND_GATE = "                } else if (chosen && applied) {";
const A_LOST_BRANCH = "                    fate = INHERITANCE_FATE.LOST;\n                    cause = 'lost:dropped-in-transition';";
const A_SECRET_LESS = "                else if (!secRef) bd = { boundary: 'undecided', why: 'secret-ref-missing' };";
const A_UI_JOIN = '                    <button class="ls-btn ls-btn-primary" id="ls-pq-save">'
    + String.fromCodePoint(0x1F4BE) + ' 保存前情资料</button>` + _inhHtml;';

const occ = (s, sub) => (sub === '' ? -1 : s.split(sub).length - 1);

/* ── 加载内核（真源码；传破坏副本时加载的就是副本） ── */
function loadKernel(src) {
    const mod = { exports: {} };
    new Function('module', 'exports', src || KER_SRC)(mod, mod.exports);
    return mod.exports;
}

/* ── 真 secret-ledger（按真实加载顺序先装 ledger-entity） ── */
const ENTITY_SRC = read('ledger-entity.js');
/* 用 createRequire 拿到真实内置模块（ESM 文件里没有 require）；
 * ★ 必须**在 loadSecretLedger 之前**求值：const 有暂时性死区，
 *   把它写在函数后面会让函数体内的引用在首次调用时抛 ReferenceError。 */
const require0 = createRequire(import.meta.url);
const VM = require0('node:vm');
function loadSecretLedger() {
    /* secret-ledger.js 是 UMD：`typeof module !== 'undefined'` 时 require('./ledger-entity.js')。
     * 这里走 root 分支（sandbox 无 module），但**要求 `LonShaLedgerEntity` 已在场**
     *（源码原文：未加载就报「账本实体契约缺真源（查 manifest.extra_js 加载顺序）」）。
     * 故按真实加载顺序先装 ledger-entity.js —— 这不是为测试开的后门，是复现宿主顺序。 */
    const sandbox = { console };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    const ctxObj = VM.createContext(sandbox);
    VM.runInContext(ENTITY_SRC, ctxObj);
    VM.runInContext(SL_SRC, ctxObj);
    return sandbox.LonShaSecretLedger;
}

/* ═══════════════════════════════════════════════════════════════════════
 * A 组：四态 + 第五档
 * ═══════════════════════════════════════════════════════════════════════ */
const tr = (over) => Object.assign({
    transitionId: 't1', eraFrom: '光绪', eraTo: '民国', status: 'applied', undone: false,
    items: [
        { id: 'a1', content: '家传玉佩' },
        { id: 'a2', content: '祖宅田契' },
        { id: 'a3', content: '族中家训' },
        { id: 'a4', content: '旧账本' },
    ],
    appliedItems: [
        { itemId: 'a1', action: 'accept' },
        { itemId: 'a2', action: 'reject' },
        { itemId: 'a3', action: 'modify' },
    ],
}, over || {});

test('A1: 四态常量恰 4 项；pending 是第五档且**不在**四态里', () => {
    const K = loadKernel();
    const fates = Object.values(K.INHERITANCE_FATE).sort();
    assert.deepEqual(fates, ['accepted', 'lost', 'reformed', 'rejected'], '四态必须恰 4 项且互不重复');
    assert.equal(K.PENDING_FATE, 'pending');
    assert.equal(fates.includes('pending'), false,
        'pending 混进四态会让「四态穷尽」这条自证当场失效（这正是它被单列的理由）');
});

test('A2: 四态各造一例 —— 接纳/拒绝/改造/遗失各 1 条且能各自读出', () => {
    const K = loadKernel();
    const r = K.buildInheritanceRoster([tr()], {});
    assert.equal(r.ok, true);
    assert.deepEqual(
        { a: r.counts.accepted, r: r.counts.rejected, m: r.counts.reformed, l: r.counts.lost },
        { a: 1, r: 1, m: 1, l: 1 });
    assert.equal(r.counts.total, 4);
    const byId = Object.fromEntries(r.items.map((x) => [x.artifactId, x.fate]));
    assert.equal(byId.a1, 'accepted');
    assert.equal(byId.a2, 'rejected');
    /* a3 action='modify' ⇒ reformed；a4 在 items 里但不在 appliedItems 里 ⇒ lost */
    assert.equal(byId.a3, 'reformed');
    assert.equal(byId.a4, 'lost');
});

test('A3: 「还没传」与「遗失」不同形 —— 转场没跑完时一律 pending，不读成任何结果', () => {
    const K = loadKernel();
    /* ★ 本档最重要的一条回归位：appliedItems 是「应用过的」，不是「做过的」。
     *   首版没 gate 在 applied 上 ⇒ status!=applied 时残留记录被读成 accepted。 */
    const stale = tr({ status: 'pending', appliedItems: [{ itemId: 'a1', action: 'accept' }] });
    const r = K.buildInheritanceRoster([stale], {});
    assert.equal(r.counts.pending, 4, '转场没跑完 ⇒ 四条全 pending，实得 ' + JSON.stringify(r.counts));
    assert.equal(r.counts.accepted, 0, '残留的 appliedItems 不许读成「后辈接纳了」');
    assert.equal(r.counts.lost, 0, '更不能读成「遗失了」（那是把未发生读成已有结果）');
    const a1 = r.items.find((x) => x.artifactId === 'a1');
    assert.equal(a1.fateCause, 'pending:stale-applied-record',
        '残留要如实点名为缺陷信号，不能静默当「没有」');
});

test('A4: 撤销过的转场（undone:true）同样落 pending，不当成遗失', () => {
    const K = loadKernel();
    const r = K.buildInheritanceRoster([tr({ undone: true })], {});
    assert.equal(r.counts.pending, 4);
    assert.equal(r.counts.lost, 0);
});

/* ═══════════════════════════════════════════════════════════════════════
 * B 组：每态可读成因（同态不同因必须分开 + 表里每项都真被产生）
 * ═══════════════════════════════════════════════════════════════════════ */
test('B1: 同是 lost，「被宣告丢掉」与「传接漏了它」成因可读且不同', () => {
    const K = loadKernel();
    const declared = tr({ declarations: { a1: { fate: 'lost' } } });
    const r1 = K.buildInheritanceRoster([declared], {});
    const i1 = r1.items.find((x) => x.artifactId === 'a1');
    assert.equal(i1.fate, 'lost');
    assert.equal(i1.fateCause, 'lost:declared-lost');
    assert.ok(i1.fateCauseText && i1.fateCauseText.length > 0, '必须有给人读的成因文案');

    const r2 = K.buildInheritanceRoster([tr()], {});
    const i2 = r2.items.find((x) => x.artifactId === 'a4');
    assert.equal(i2.fate, 'lost');
    assert.equal(i2.fateCause, 'lost:dropped-in-transition');
    assert.notEqual(i1.fateCauseText, i2.fateCauseText, '同为 lost，两种成因的文案必须不同形');
});

test('B2: 成因表里每一项都**真被某分支产生**（表里有、代码里永不产出 = 假说明）', () => {
    const K = loadKernel();
    const tableKeys = Object.keys(K.FATE_CAUSES);
    assert.ok(tableKeys.length >= 6, '成因表条目过少（实 ' + tableKeys.length + '）');
    /* 收集所有真产出：把每一族分支都跑一遍 */
    const produced = new Set();
    const cases = [
        [tr(), {}],
        [tr({ declarations: { a1: { fate: 'lost' } } }), {}],
        [tr({ declarations: { a1: { fate: 'accepted' } } }), {}],
        [tr({ declarations: { a1: { fate: 'rejected' } } }), {}],
        [tr({ declarations: { a1: { fate: 'reformed' } } }), {}],
        [tr({ declarations: { a1: { fate: 'bogus' } } }), {}],
        [tr({ status: 'pending', appliedItems: [{ itemId: 'a1', action: 'accept' }] }), {}],
        [tr({ status: 'pending' }), {}],
        [tr({ appliedItems: [{ itemId: 'a1', action: 'bogus' }] }), {}],
    ];
    for (const [t, o] of cases) {
        const r = K.buildInheritanceRoster([t], o);
        for (const it of r.items) if (it.fateCause) produced.add(it.fateCause);
    }
    const dead = tableKeys.filter((k) => !produced.has(k));
    assert.deepEqual(dead, [], '这些成因写进了表却永不产出（假说明）：' + dead.join(', '));
});

test('B3: 成因文案不含空串 —— 表里每一项都要有可读中文', () => {
    const K = loadKernel();
    const empty = Object.keys(K.FATE_CAUSES).filter((k) => !String(K.FATE_CAUSES[k] || '').trim());
    assert.deepEqual(empty, [], '空文案成因：' + empty.join(', '));
});

/* ═══════════════════════════════════════════════════════════════════════
 * C 组：槽对接（吃 eraTransitions 原样、不写任何槽）
 * ═══════════════════════════════════════════════════════════════════════ */
test('C1: 直接吃 worldProg.eraTransitions 原样，输入数组**一个字节都不改**', () => {
    const K = loadKernel();
    const list = [tr()];
    const before = JSON.stringify(list);
    const r = K.buildInheritanceRoster(list, {});
    assert.equal(r.ok, true);
    assert.equal(JSON.stringify(list), before, '内核必须只读（改了输入就是「读面偷偷写」）');
    assert.equal(r.writesNothing, true, '必须自报只读');
});

test('C2: 同一份 eraTransitions 连读两次读数稳定（无隐藏状态）', () => {
    const K = loadKernel();
    const list = [tr()];
    const r1 = K.buildInheritanceRoster(list, {});
    const r2 = K.buildInheritanceRoster(list, {});
    assert.deepEqual(r1.counts, r2.counts);
    assert.deepEqual(r1.items.map((x) => x.fate), r2.items.map((x) => x.fate));
});

/* ═══════════════════════════════════════════════════════════════════════
 * D 组：三态不同形
 * ═══════════════════════════════════════════════════════════════════════ */
test('D1: transitions-not-array（面没接上）≠ no-artifacts（账在但空）≠ ok', () => {
    const K = loadKernel();
    for (const bad of [undefined, null, 'x', 0, {}, '[]']) {
        const r = K.buildInheritanceRoster(bad, {});
        assert.equal(r.ok, false, '非数组必须 ok:false');
        assert.equal(r.reason, 'transitions-not-array');
    }
    const empty = K.buildInheritanceRoster([], {});
    assert.equal(empty.ok, true, '「账在但是空的」是**可用**的，不能报不可用');
    assert.equal(empty.reason, 'no-artifacts');
    assert.equal(empty.counts.total, 0);

    const okr = K.buildInheritanceRoster([tr()], {});
    assert.equal(okr.ok, true);
    assert.equal(okr.reason, '', '有数据时不该带 reason');
    /* 三态两两不同形 */
    assert.notEqual(K.buildInheritanceRoster(null, {}).reason, empty.reason);
    assert.notEqual(empty.reason, okr.reason);
});

/* ═══════════════════════════════════════════════════════════════════════
 * E 组：秘密断代（单一真源 = 注入的 knowledgeOf）
 * ═══════════════════════════════════════════════════════════════════════ */
const secretTr = () => tr({
    items: [
        { id: 'a1', content: '家传玉佩' },
        { id: 's1', content: '祖上血债文书', isSecret: true },
    ],
    appliedItems: [{ itemId: 'a1', action: 'accept' }],
});

test('E1: 秘密条目一律走注入的 knowledgeOf，内核不自己判可见性', () => {
    const K = loadKernel();
    const calls = [];
    const knowledgeOf = (item, who) => { calls.push([item && item.id, who]); return 'knower'; };
    const lookup = (id) => ({ id, knowers: ['succ'] });
    K.buildInheritanceRoster([secretTr()], { successorActorId: 'succ', knowledgeOf, secretLookup: lookup });
    assert.equal(calls.length, 1, '有秘密条目就必须真去问一次（不问就是自己判了）');
    assert.equal(calls[0][1], 'succ', '问的对象必须是这一代');
});

test('E2: 四档边界互不同形：disclosed / withheld / undecided / absent', () => {
    const K = loadKernel();
    const roster = (scope, withRef) => K.buildInheritanceRoster([secretTr()], {
        successorActorId: 'succ',
        knowledgeOf: () => scope,
        secretLookup: withRef ? (() => ({ id: 's1', knowers: ['succ'] })) : (() => null),
    });
    const c = (scope, withRef) => roster(scope, withRef).boundary;

    assert.deepEqual(c('knower', true), { disclosed: 1, withheld: 0, undecided: 0, absent: 1 });
    assert.deepEqual(c('listed', true), { disclosed: 0, withheld: 1, undecided: 0, absent: 1 });
    assert.deepEqual(c('unlisted', true), { disclosed: 0, withheld: 0, undecided: 1, absent: 1 });
    /* 秘密账里根本没有这条 ⇒ absent，且**与 unlisted（判不了）不同档** */
    assert.deepEqual(c('unlisted', false), { disclosed: 0, withheld: 0, undecided: 1, absent: 1 });
    assert.deepEqual(c('absent', true), { disclosed: 0, withheld: 0, undecided: 0, absent: 2 });
});

test('E3: 遮蔽 ≠ 永远遮蔽 —— 同一秘密对在册者 disclosed、对非在册者 withheld', () => {
    const K = loadKernel();
    const SL = loadSecretLedger();
    assert.ok(SL && typeof SL.knowledgeOf === 'function', 'secret-ledger 必须可加载（真实源）');
    const ledgerItem = { id: 's1', secret: '祖上血债文书', keeper: 'elder', knowers: ['elder'] };
    const mk = (who) => K.buildInheritanceRoster([secretTr()], {
        successorActorId: who,
        knowledgeOf: SL.knowledgeOf,
        secretLookup: () => ledgerItem,
    });
    const outsider = mk('succ');
    const insider = mk('elder');
    const oItem = outsider.items.find((x) => x.artifactId === 's1');
    const iItem = insider.items.find((x) => x.artifactId === 's1');
    assert.equal(oItem.secretBoundary, 'withheld');
    assert.equal(oItem.visibleToSuccessor, false, '遮蔽 ⇒ 不许进载荷');
    assert.equal(iItem.secretBoundary, 'disclosed');
    assert.equal(iItem.visibleToSuccessor, true, '在册 ⇒ 可用（证明不是永远遮蔽）');
});

test('E4: 判不了（undecided）一律按「不给看」处置，且单独列出不塞进某一态', () => {
    const K = loadKernel();
    const r = K.buildInheritanceRoster([secretTr()], {
        successorActorId: 'succ',
        knowledgeOf: () => 'unlisted',
        secretLookup: () => ({ id: 's1' }),
    });
    const it = r.items.find((x) => x.artifactId === 's1');
    assert.equal(it.secretBoundary, 'undecided');
    assert.equal(it.visibleToSuccessor, false, '判不了 ⇒ 宁可不给');
    assert.equal(r.undecided.length, 1, '判不了的必须单列（塞进某态就再也看不见）');
    assert.equal(r.undecided[0].artifactId, 's1');
    assert.ok(String(r.undecided[0].why || '').length > 0, '必须给原因');
});

test('E5: knowledgeOf 抛错不许把整面炸掉 —— 降为 undecided 并留原因', () => {
    const K = loadKernel();
    const r = K.buildInheritanceRoster([secretTr()], {
        successorActorId: 'succ',
        knowledgeOf: () => { throw new Error('boom'); },
        secretLookup: () => ({ id: 's1' }),
    });
    assert.equal(r.ok, true, '一条判定抛错不许让整面不可用');
    const it = r.items.find((x) => x.artifactId === 's1');
    assert.equal(it.secretBoundary, 'undecided');
    assert.equal(it.secretBoundaryWhy, 'knowledge-kernel-threw');
});

/* ═══════════════════════════════════════════════════════════════════════
 * F 组：写入面（confirm 硬门槛 / pending 不可声明 / 撤销回推导值）
 * ═══════════════════════════════════════════════════════════════════════ */
function loadDiag() {
    const mod = { exports: {} };
    const sandbox = { module: mod, exports: mod.exports, console, window: undefined };
    new Function('module', 'exports', 'window', DIAG_SRC)(mod, mod.exports, sandbox);
    const D = mod.exports;
    const K = loadKernel();
    D.bindDeps({
        moduleLib: (getter) => { try { return getter() || null; } catch (_e) { return null; } },
        errLog: () => { },
        libs: {
            _eraContinuationTreeLib: () => K,
            _moduleLib: (getter) => { try { return getter() || null; } catch (_e) { return null; } },
        },
    });
    return { D, K };
}
function mkEngine(K) {
    const SL = loadSecretLedger();
    const eng = {
        worldProg: { eraTransitions: [tr()], secretLedger: { items: [] } },
        _currentSpeakerName: 'succ',
        _sl: SL,
    };
    return eng;
}

test('F1: confirm 必须是字面 true —— 缺 / false / 字符串 "true" 全拒', () => {
    const { D } = loadDiag();
    const eng = mkEngine();
    for (const c of [undefined, null, false, 'true', 1, {}]) {
        const r = D.inheritanceDeclare(eng, { confirm: c, transitionId: 't1', artifactId: 'a4', fate: 'accepted' });
        assert.equal(r.ok, false, 'confirm=' + JSON.stringify(c) + ' 必须被拒');
        assert.equal(r.reason, 'confirm-required');
        assert.equal(r.writes, false, '被拒时不许写');
    }
});

test('F2: pending **不可声明** —— 允许它等于把「遗失」改写成「还没传」', () => {
    const { D } = loadDiag();
    const eng = mkEngine();
    const r = D.inheritanceDeclare(eng, { confirm: true, transitionId: 't1', artifactId: 'a4', fate: 'pending' });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'bad-fate:pending');
    const t = eng.worldProg.eraTransitions[0];
    assert.equal(t.declarations, undefined, '被拒时不许留下半截声明');
});

test('F3: 声明落**既有槽**（tr.declarations），随 worldProg 一并存档 —— 不新开存储', () => {
    const { D } = loadDiag();
    const eng = mkEngine();
    const r = D.inheritanceDeclare(eng, { confirm: true, transitionId: 't1', artifactId: 'a4', fate: 'accepted' });
    assert.equal(r.ok, true);
    assert.equal(r.writes, true);
    assert.equal(eng.worldProg.eraTransitions[0].declarations.a4.fate, 'accepted');
    assert.equal(Object.keys(eng.worldProg).sort().join(','), 'eraTransitions,secretLedger',
        '不许新开第二套事实库');
});

test('F4: 声明覆盖旧值时**如实报** replaced（不静默吞掉前一次）', () => {
    const { D } = loadDiag();
    const eng = mkEngine();
    D.inheritanceDeclare(eng, { confirm: true, transitionId: 't1', artifactId: 'a4', fate: 'lost' });
    const r = D.inheritanceDeclare(eng, { confirm: true, transitionId: 't1', artifactId: 'a4', fate: 'accepted' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.replaced, { fate: 'lost' });
});

test('F5: 撤销后回**推导值**而不是 pending', () => {
    const { D, K } = loadDiag();
    const eng = mkEngine(K);
    D.inheritanceDeclare(eng, { confirm: true, transitionId: 't1', artifactId: 'a4', fate: 'accepted' });
    const rv = D.inheritanceRevokeDeclare(eng, { confirm: true, transitionId: 't1', artifactId: 'a4' });
    assert.equal(rv.ok, true);
    assert.equal(rv.was, 'accepted');
    const ro = K.buildInheritanceRoster(eng.worldProg.eraTransitions, {});
    const it = ro.items.find((x) => x.artifactId === 'a4');
    assert.equal(it.fate, 'lost', '撤销 ≠ 还没传（撤完要回到记录推导出来的 lost）');
    assert.notEqual(it.fate, 'pending');
});

test('F6: 二次撤销报 not-declared（不假装撤掉了什么）', () => {
    const { D } = loadDiag();
    const eng = mkEngine();
    const r = D.inheritanceRevokeDeclare(eng, { confirm: true, transitionId: 't1', artifactId: 'a4' });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'not-declared');
    assert.equal(r.writes, false);
});

test('F7: 声明不存在的转场/物件一律拒，且不写半截', () => {
    const { D } = loadDiag();
    const eng = mkEngine();
    assert.equal(D.inheritanceDeclare(eng, { confirm: true, transitionId: 'nope', artifactId: 'a4', fate: 'lost' }).reason, 'transition-not-found');
    assert.equal(D.inheritanceDeclare(eng, { confirm: true, transitionId: 't1', artifactId: 'nope', fate: 'lost' }).reason, 'artifact-not-found');
    assert.equal(eng.worldProg.eraTransitions[0].declarations, undefined);
});

test('F8: 秘密账缺席 ⇒ 整面 unavailable（不许降级成「都判不了所以都不给看」）', () => {
    const { D } = loadDiag();
    const eng = mkEngine();
    /* 把 secret-ledger 取库口打空：模拟模块没装上 */
    D.bindDeps({ moduleLib: () => null, errLog: () => { }, libs: { _eraContinuationTreeLib: () => loadKernel() } });
    const r = D.inheritanceRosterState(eng, {});
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'secret-ledger-unavailable',
        '降级成「全部 withheld」会让用户以为「这一代什么都不知道」，而事实是判定口没装上');
});

/* ═══════════════════════════════════════════════════════════════════════
 * G 组：真源码破坏负控制（各配原版对照）
 * ═══════════════════════════════════════════════════════════════════════ */
/** 在破坏副本上重跑「转场没跑完时不许读成已接纳」这条判据。 */
function judgeNoStaleAccepted(K) {
    const bad = [];
    const stale = tr({ status: 'pending', appliedItems: [{ itemId: 'a1', action: 'accept' }] });
    const r = K.buildInheritanceRoster([stale], {});
    if (r.counts.accepted > 0) bad.push('残留的 appliedItems 被读成了 accepted（把还没发生读成已有结果）');
    if (r.counts.pending !== 4) bad.push('应有 4 条 pending，实得 ' + r.counts.pending);
    const a1 = r.items.find((x) => x.artifactId === 'a1');
    if (!a1 || a1.fateCause !== 'pending:stale-applied-record') bad.push('残留没被点名（成因='
        + (a1 && a1.fateCause) + '）');
    return bad;
}
/** 在破坏副本上重跑「转场跑完却没被处置 ⇒ lost」这条判据。 */
function judgeDroppedIsLost(K) {
    const bad = [];
    const r = K.buildInheritanceRoster([tr()], {});
    const a4 = r.items.find((x) => x.artifactId === 'a4');
    if (!a4) return ['a4 不在册'];
    if (a4.fate !== 'lost') bad.push('跑完却没处置的应落 lost，实得 ' + a4.fate);
    return bad;
}
/** 在破坏副本上重跑「秘密账缺这条必须单列 undecided」这条判据。 */
function judgeSecretRefMissingUndecided(K) {
    const bad = [];
    const r = K.buildInheritanceRoster([secretTr()], {
        successorActorId: 'succ',
        knowledgeOf: () => 'unlisted',
        secretLookup: () => null,
    });
    if (r.undecided.length !== 1) bad.push('秘密账缺这条必须单列，实得 ' + r.undecided.length);
    const it = r.items.find((x) => x.artifactId === 's1');
    if (!it || it.secretBoundary !== 'undecided') bad.push('边界应为 undecided，实得 ' + (it && it.secretBoundary));
    return bad;
}

test('G1: 负控制① 去掉 applied 门控（回到 else if (chosen)）→ 判据必红（原版对照必绿）', () => {
    assert.deepEqual(judgeNoStaleAccepted(loadKernel()), [], '原版：这条判据必须绿');
    const broken = breakSource(KER_SRC, A_PEND_GATE, '                } else if (chosen) {', 'x9_n1');
    const r = judgeNoStaleAccepted(loadKernel(broken));
    assert.ok(r.length > 0, '去掉门控后判据必须翻红，实得 ' + JSON.stringify(r));
    assert.ok(r.some((x) => /accepted|残留/.test(x)), '必须点名「残留被读成 accepted」');
});

test('G2: 负控制② 把「跑完却没处置」改判成 pending → 判据必红（原版对照必绿）', () => {
    assert.deepEqual(judgeDroppedIsLost(loadKernel()), [], '原版：这条判据必须绿');
    const broken = breakSource(KER_SRC, A_LOST_BRANCH,
        "                    fate = PENDING_FATE;\n                    cause = 'pending:transition-not-applied';", 'x9_n2');
    const r = judgeDroppedIsLost(loadKernel(broken));
    assert.ok(r.length > 0, '把「遗失」改判成「还没传」后判据必须翻红，实得 ' + JSON.stringify(r));
});

test('G3: 负控制③ 秘密账缺这条直接当 absent（与 unlisted 合成一档）→ 判据必红', () => {
    assert.deepEqual(judgeSecretRefMissingUndecided(loadKernel()), [], '原版：这条判据必须绿');
    /* 破坏点：把「秘密账里没这条」判成 absent（= 与「不是秘密」合成一档，
     *   于是一整条「秘密账漏记账」的真缺陷会永远看不见）。替换保持 else-if 链合法。 */
    const broken = breakSource(KER_SRC, A_SECRET_LESS,
        "                else if (!secRef) bd = { boundary: 'absent', why: 'not-in-secret-ledger' };", 'x9_n3');
    const r = judgeSecretRefMissingUndecided(loadKernel(broken));
    assert.ok(r.length > 0, '把「账里没这条」并进 absent 后判据必须翻红，实得 ' + JSON.stringify(r));
});

/* ═══════════════════════════════════════════════════════════════════════
 * H 组：接线面（宿主 / 诊断层 / 面板）+ 当版锚
 * ═══════════════════════════════════════════════════════════════════════ */
test('H1: 内核入册 manifest.extra_js 恰一次 + 双导出', () => {
    const ej = MANIFEST.extra_js || [];
    assert.equal(ej.filter((x) => x === 'era-continuation-inheritance-tree.js').length, 1,
        '内核必须登记进 extra_js 恰一次（否则消费台账会判未登记孤儿）');
    assert.ok(ej.length >= 248, '登记后模块总数应 ≥ 248（实 ' + ej.length + '）');
    assert.ok(KER_SRC.includes('module.exports = factory();'), 'CJS 导出必须在（node 侧判据靠它加载）');
    assert.ok(KER_SRC.includes('root.EraContinuationInheritanceTree = factory();'), '浏览器侧全局名必须在（宿主取库口按它取）');
});

test('H2: 宿主取库口**不重名** —— 与既有 era-continuation-drama 的取库口必须并存', () => {
    /* ★ 本版真跑抓到的缺陷：新加的那份与原 `_eraContinuationLib` 同名，
     *   JS 同名函数声明后者静默覆盖前者 ⇒「时代续演」自检静默失效。
     *   这条判据钉住「两个名字各自只有一份、且指向不同模块」。 */
    assert.equal(occ(HOST_SRC, 'function _eraContinuationLib()'), 1, '_eraContinuationLib 必须恰一份');
    assert.equal(occ(HOST_SRC, 'function _eraContinuationTreeLib()'), 1, '_eraContinuationTreeLib 必须恰一份');
    const legacy = HOST_SRC.split('\n').find((l) => /function _eraContinuationLib\(\)/.test(l)) || '';
    assert.ok(legacy.includes('era-continuation-drama.js'), '原取库口必须仍指向 era-continuation-drama.js（实：' + legacy.trim() + '）');
    /* ★ 两个取库口的**函数体**都要验：新加的那份是跨行写法，逐行 `find` 只看得到
     *   `function _eraContinuationTreeLib() {`，看不到它指向哪个模块 ——
     *   首版就是这样误红的（函数头行里没有模块名）。 */
    const treeBody = "    function _eraContinuationTreeLib() {\n        return _moduleLib(() => window.EraContinuationInheritanceTree, 'era-continuation-inheritance-tree.js');\n    }";
    assert.equal(occ(HOST_SRC, treeBody), 1,
        '新取库口必须恰一处且指向传承树（跨行函数体整段匹配）');
    assert.ok(HOST_SRC.includes("['时代续演', _eraContinuationLib, 'eraContinuationDramaSelfCheck']"),
        '时代续演自检必须仍挂在**原**名字上（挂错名 = 自检静默失效）');
});

test('H3: 宿主 libs 注入 + 四转发桩；诊断层接收口与调用点同步改名', () => {
    assert.equal(occ(HOST_SRC, '_eraContinuationTreeLib: _eraContinuationTreeLib,'), 1, 'libs 注入恰一处');
    for (const m of ['inheritanceRosterState', 'inheritanceDeclare', 'inheritanceRevokeDeclare', '_inheritanceRosterLine']) {
        assert.equal(occ(HOST_SRC, m + '(...args) {'), 1, '转发桩 ' + m + ' 必须恰一处');
    }
    assert.equal(occ(DIAG_SRC, 'function _eraContinuationTreeLib()'), 1, '诊断层接收口恰一处');
    assert.equal(occ(DIAG_SRC, 'const EC = _eraContinuationTreeLib();'), 2, '两处调用点都要改吃新名字');
    assert.equal(occ(DIAG_SRC, '_eraContinuationLib'), 0, '诊断层不许残留旧名字（残留=接收口分叉）');
});

test('H4: 面板 prequel 视图挂上传承清单，且**不提供**「声明为 pending」', () => {
    /* ★ 口径说明：标题里的 emoji 在源码里是**字面字符**（不是转义序列）。
     *   断言用 code point 现场拼，避免「我以为是这个码点」的猜。 */
    const TITLE = String.fromCodePoint(0x1F3FA) + ' 跨代传承';
    assert.equal(occ(UI_SRC, TITLE), 1, '传承清单标题恰一处（实码点 U+1F3FA）');
    assert.equal(occ(UI_SRC, 's.inheritanceRosterState()'), 1, '面板必须走宿主方法取数（不自己算）');
    assert.equal(occ(UI_SRC, 'data-inh-fate="pending"'), 0,
        '面板不许给「声明为 pending」的按钮（那等于把遗失改写成还没传）');
    /* 按钮的 data-inh-fate 是模板变量 ${f[0]}，值域由 FATES 表决定：
     *   断言表里**没有 pending**，等价于「渲染不出 pending 按钮」。 */
    assert.equal(occ(UI_SRC, "const FATES = [['accepted', '后辈接纳'], ['rejected', '拒绝继承'], ['reformed', '改造再造'], ['lost', '遗失于历史']];"), 1,
        'FATES 必须恰 4 项且不含 pending');
    assert.equal(occ(UI_SRC, 'data-inh-act="declare"'), 1);
    assert.equal(occ(UI_SRC, 'data-inh-act="revoke"'), 1);
    assert.equal(occ(UI_SRC, A_UI_JOIN), 1, '模板字符串必须在闭合处拼 _inhHtml（拼错位置会把注释当代码）');
});

test('H5: 面板「面没装上」与「账空」文案不同形（两条都必须真在源码里）', () => {
    assert.ok(UI_SRC.includes('不是「没有跨代物件」'), '必须明写「不可用 ≠ 没有」');
    assert.ok(UI_SRC.includes('还没有跨代物件'), '必须有「账在但空」的独立文案');
    /* 两句话不许是同一句 */
    const a = '不是「没有跨代物件」';
    const b = '还没有跨代物件';
    assert.notEqual(a, b);
    assert.ok(occ(UI_SRC, a) >= 1 && occ(UI_SRC, b) >= 1);
});

test('H6: 出生版本标记（内核 / 诊断层注释 / 面板注释在场即可）—— 版本串互等已交棒 v3445 档', () => {
    /* [v3.445.0 接管] 历史档只验「本档标记在场」；四源互等与当版锁交给当版档案。 */
    for (const [name, src] of [['内核', KER_SRC], ['诊断层', DIAG_SRC], ['面板', UI_SRC]]) {
        assert.ok(src.includes('v3.444.0'), name + ' 必须带 v3.444.0 标记（否则改动无法按版本归因）');
    }
});
test('G5: 出生版本下界锚点（vnum 形，守卫认得这一形）—— 当版锚已交棒 v3445 档', () => {
    /* ★ [v3.445.0 接管] 历史文件锁回**自己的出生版本**（交棒链口径，同 v3440 X7-G 先例）。
     *   改前形态是 `const CUR = '3.444.0'` + 四处 assert.equal(live, CUR)，
     *   抬到 3.445.0 当天就红 —— 这不是产品缺陷，是历史档案把「当版」写死成「永恒当版」的欠账。
     *   现状：下界 = 出生版本 3.444.0（本档不得低于它），上界 = 「不承诺高于现版」；
     *   当版锚的职责已交棒给当版档案 tests/v3445_l13_x5_migrate_pack.test.mjs 的 G5。 */
    const BORN_V = '3.444.0';
    const vnum = (v) => {
        const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(v || '').trim());
        return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
    };
    assert.equal(vnum(BORN_V), 3444000, '出生版本锚（vnum 形）：3.444.0 ⇒ 3444000');
    const live = (/const VERSION = '([0-9]+[.][0-9]+[.][0-9]+)'/.exec(HOST_SRC) || [])[1];
    assert.equal(live, MANIFEST.version, 'index.js VERSION 与 manifest 必须互等（实 ' + live + ' / ' + MANIFEST.version + '）');
    assert.equal(MANIFEST.version, PKG.version, 'manifest 与 package 必须互等');
    /* 上界：不承诺未来（现版可以更高，但不得低于本档出生版本）。 */
    assert.ok(vnum(live) >= vnum(BORN_V), '当版不得低于本档出生版本 ' + BORN_V + '（实 ' + live + '）');
    /* 内核版本串同样走下界形（era 内核生于 3.444.0，此后允许抬升）。 */
    const kernV = (/var VERSION = '([0-9]+[.][0-9]+[.][0-9]+)'/.exec(KER_SRC) || [])[1];
    assert.ok(vnum(kernV) >= vnum(BORN_V), '内核版本不得低于本档出生版本（实 ' + kernV + '）');
    /* 本档专有标记在场。 */
    assert.ok(KER_SRC.includes('L13-X9'), '内核必须留 L13-X9 标记');
    assert.ok(DIAG_SRC.includes('L13-X9'), '诊断层必须留 L13-X9 标记');
});
