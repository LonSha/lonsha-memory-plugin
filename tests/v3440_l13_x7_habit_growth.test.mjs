/* ============================================================
 * tests/v3440_l13_x7_habit_growth.test.mjs — v3.440.0
 * ------------------------------------------------------------
 * L13-X7 · 习惯与成长证据面 —— 把 `character-habit-growth-evidence.js` 接进产品。
 *
 * 【真实现场（接产品之前）】该内核 `prod_call_sites=0`：登记在册、真被加载、单测全绿，
 *   而产品端一次都没调用。面板 `protagonist` 视图只有「档案 / 生活小档案」两块，
 *   「他有这个习惯」这件事在两处都对不上：`habitRepos` 只记成形次数，四阶段证迹没有读面。
 *
 * 【本档钉住的六件事】
 *   A  内核读面：`describeGrowth` 四阶段计数 / 最远阶段 / 证据 id 去重 / 畸形不并进 attempted
 *   B  两块账分离：证据束（growthBundles）与习惯本体（habitRepos）**分开存、分开报**；
 *      成形但零证据 ⇒ `unproven` 单列；有证据无本体 ⇒ `orphan` 单列；两者不互相充抵
 *   C  写入同源：`agencyContractAct('practice')` **顺带**写证迹；证迹失败不回滚本体但如实报出
 *   D  只读面：没有任何 act 入口（第二处写入口 = 第二套习惯账）
 *   E  面板三态：有据 / 真的没有（empty）/ 面不可用（absent）**不同形**；无数值条
 *   F  真源码破坏三条（原版对照 + 破坏副本必红）
 *
 * 【为什么 A 档要盯「畸形不并进 attempted」】把认不出的阶段算成「尝试过」，
 *   等于替一条坏数据编排剧情。这是本仓「判不了 ≠ 没有」在阶段上的具体形态。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';
import { stripComments } from './_audit_lib.mjs';
import os from 'node:os';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const KERNEL = path.join(ROOT, 'character-habit-growth-evidence.js');
const DIAG = path.join(ROOT, 'engine-diagnostic-lines.js');
const HOST = path.join(ROOT, 'index.js');
const UI = path.join(ROOT, 'settings-ui.js');
const ORGANS = path.join(ROOT, 'memory-organs.js');

const K = require(KERNEL);
const diagSrc = fs.readFileSync(DIAG, 'utf8');
const hostSrc = fs.readFileSync(HOST, 'utf8');
const uiSrc = fs.readFileSync(UI, 'utf8');
const organsSrc = fs.readFileSync(ORGANS, 'utf8');

/* ── 锚点（各只声明一次；判据函数不引用这些串） ── */
const A_UI_TITLE = '🌱 习惯与成长证据';
/* 分区起点：窗口必须从**取数点**起算，不是从标题起算。
 *   实测教训：标题在 `hgBlock` 拼装处，而 `hg.groups` / `counts.unproven` 这些
 *   读数点在前 3589 字符 —— 用标题当窗口起点，判据看的是「拼装段」而不是「整块」，
 *   于是它对「面板其实没按分组渲染」这种真缺陷**什么都不说**（假绿）。 */
const A_UI_SECTION = '[v3.440.0 · L13-X7]';
const A_UI_END = 'hgBlock;';
/* E / F 共用的窗口函数：取「分区注释头 → `hgBlock;`」整块并**剥掉注释**。
 *   剥注释是必须的：本块注释里写着「不做『经验值 / 等级』类展示」这句口径声明，
 *   对原文判就成了禁止声明自己不做什么（判据反咬自己）。
 *   ★ 起点必须回退到**该注释块的开始标记**：分区标记本身落在块注释内部，
 *     从标记处起切会把注释剖成两半 —— stripComments 认不出这半段是注释，
 *     整块声明会被当成代码文本（实测：剥完长度不减、口径句仍命中）。 */
function winOf(src) {
    let a = src.indexOf(A_UI_SECTION);
    if (a < 0) return '';
    const open = src.lastIndexOf('/*', a);
    const close = open >= 0 ? src.indexOf('*/', open) : -1;
    if (open >= 0 && close > a) a = open;
    const b = src.indexOf(A_UI_END, a);
    return stripComments(src.slice(a, b < 0 ? src.length : b + A_UI_END.length));
}

test('X7-A 内核四阶段摘要：计数 / 最远阶段 / 证据 id 去重 / 畸形不冒充 attempted', () => {
    let b = { actorId: '甲', skillOrHabit: '敲门', habitKey: '门厅|先敲三下', records: [] };
    b = K.recordGrowthEvidence(b, { stage: K.STAGES.ATTEMPTED, evidenceId: 'e1', description: '第一次' });
    b = K.recordGrowthEvidence(b, { stage: K.STAGES.EFFECTIVE, evidenceId: 'e2', contextCondition: 'with_elder' });
    b = K.recordGrowthEvidence(b, { stage: K.STAGES.EFFECTIVE, evidenceId: 'e2' }); // 同 id 再来一次
    const d = K.describeGrowth(b);
    assert.equal(d.total, 3, '三条证迹都要计');
    assert.equal(d.counts.attempted, 1);
    assert.equal(d.counts.effective_condition, 2);
    assert.equal(d.reachedStage, 'effective_condition', '最远到过「在特定条件下有效」');
    assert.equal(d.reachedLabel, K.STAGE_LABELS.effective_condition, '可读名必须取自内核标签表');
    assert.deepEqual(d.evidenceIds, ['e1', 'e2'], '证据 id 去重且保序');
    assert.equal(d.habitKey, '门厅|先敲三下', 'habitKey 必须原样跟着走');
    assert.equal(d.degraded, false);

    /* 畸形阶段：**不并进 attempted**，只置 degraded —— 判不了不得写成「尝试过」 */
    const bad = { actorId: '甲', skillOrHabit: 'x', records: [{ stage: 'unknown_stage', timestamp: 1 }] };
    const db = K.describeGrowth(bad);
    assert.equal(db.degraded, true, '认不出的阶段必须如实 degraded');
    assert.equal(db.counts.attempted, 0, '畸形阶段不得被算成「尝试过」');
    assert.equal(db.total, 1, '但它确实在记录里 —— 计数按 records 长度，不按认得出的条数');

    /* 空 / 非对象：空摘要，不抛 */
    assert.equal(K.describeGrowth(null).total, 0);
    assert.equal(K.describeGrowth({}).status, 'empty');

    /* 撤回证据后 status 转 needs_reverification，且 habitKey 不丢 */
    const rev = K.evaluateCompetencyAfterRevocation(b, ['e2']);
    assert.equal(rev.status, 'needs_reverification');
    assert.equal(rev.habitKey, '门厅|先敲三下', '撤回证据不得把「这是哪条习惯」弄丢');
    assert.equal(K.describeGrowth(rev).status, 'needs_reverification');
});

/* 造一个最小引擎：只需要 worldProg 与两个诊断方法能从真源里取到。 */
function makeEngine(seed) {
    const DL = require(DIAG);
    const engine = {
        worldProg: Object.assign({ facts: [], beliefs: [], habitRepos: [], absenceExpectations: [], growthBundles: [] }, seed || {}),
        _moduleLib: (getter) => {
            /* 真宿主用 _moduleLib(() => window.X, 'x.js') 取库；这里按参数还原成 require。
             *   ★ 不伪造内核 —— 取到的是磁盘上那一份（破坏它，判据必红）。 */
            const m = String(getter).match(/'([^']+\.js)'/);
            if (!m) return null;
            try { return require(path.join(ROOT, m[1])); } catch (_e) { return null; }
        },
    };
    const libs = {
        _habitGrowthLib: () => require(KERNEL),
        _agencyContractLib: () => require(path.join(ROOT, 'character-agency-contract.js')),
    };
    DL.bindDeps({
        moduleLib: engine._moduleLib,
        errLog: () => {},
        _changeset: () => null,
        libs,
    });
    return { DL, engine };
}

test('X7-B 两块账分离：unproven / orphan 各自单列，绝不互相充抵', () => {
    const { DL, engine } = makeEngine({
        habitRepos: [
            { actor: '甲', practices: [], habits: [{ habitId: 'h1', context: '门厅', approach: '先敲三下', status: 'active', formedAtPractices: 3 }] },
        ],
        /* 只给「有证据但无本体」那一条，让两类差额同时出现 */
        growthBundles: [
            { actorId: '甲', skillOrHabit: '先敲三下', habitKey: '门厅|先敲三下', records: [{ stage: 'effective_condition', evidenceId: 'p1', timestamp: 5 }], status: 'active' },
            { actorId: '乙', skillOrHabit: '递茶', habitKey: '茶桌|先递茶', records: [{ stage: 'attempted', evidenceId: 'q1', timestamp: 6 }], status: 'active' },
        ],
    });
    const r = DL.habitGrowthState(engine, {});
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.bundles, 2, '两条有证迹的束');
    assert.equal(r.habits, 1, '本体只有 1 条（甲的「门厅|先敲三下」）');
    assert.equal(r.counts.unproven, 0, '甲那条本体**有**对应证据 ⇒ 不算成形待证');
    assert.equal(r.counts.orphan, 1, '乙那条证据找不到本体 ⇒ 无主束 1 条，且**不得**被并进甲');
    assert.equal(r.orphan[0].actorId, '乙');
    assert.equal(r.items.filter((x) => x.actorId === '甲' && x.key === '门厅|先敲三下').length, 1, '对应关系按 actor+key 精确匹配，不按习惯名猜');
    assert.equal(r.groups.length, 2, '按角色分组（不同角色同名不同事，不按习惯名聚合）');

    /* 反向：本体在、证据缺 ⇒ unproven 单列，且**不进**证据列表 */
    const r2 = DL.habitGrowthState(makeEngine({
        habitRepos: [{ actor: '丙', habits: [{ habitId: 'h9', context: '门厅', approach: '先敲三下', status: 'active', formedAtPractices: 3 }] }],
        growthBundles: [],
    }).engine, {});
    assert.equal(r2.bundles, 0, '零证据 ⇒ 证据列表为空');
    assert.equal(r2.reason, 'empty', '零证据必须是 empty 态，不是 degraded 或 ok');
    assert.equal(r2.counts.unproven, 1, '成形但零证据 ⇒ unproven 1 条如实报出');
    assert.ok(!r2.items.some((x) => x.key === '门厅|先敲三下'), '成形待证的习惯**不得**出现在证据列表里');

    /* 第三条：束在、但**一条证迹都没有** ⇒ 也不算「有据」。
     *   实测教训：早先的负控制想破坏「成形待证不进证据列表」，可那时 growthBundles 是空的，
     *   破坏点根本不被执行（`provenKeys` 从空 items 算，守卫永假）—— 破坏「写了」但没生效，
     *   属于本仓记过的负控制假绿第二形。要让它可破坏，这一档必须真有一条零证迹的束。 */
    const r3 = DL.habitGrowthState(makeEngine({
        habitRepos: [{ actor: '甲', habits: [{ habitId: 'h1', context: '门厅', approach: '先敲三下', status: 'active', formedAtPractices: 3 }] }],
        growthBundles: [{ actorId: '甲', skillOrHabit: '先敲三下', habitKey: '门厅|先敲三下', records: [], status: 'active' }],
    }).engine, {});
    assert.equal(r3.bundles, 0, '零证迹的束不得算「有据」');
    assert.ok(!r3.items.some((x) => x.total === 0), '空束不得进证据列表（只显示有证据的）');
    assert.equal(r3.counts.unproven, 1, '零证迹 ⇒ 该习惯仍属成形待证，不许拿空束充抵');
    assert.equal(r3.reason, 'empty', '零有效证迹仍是 empty，不是 ok');
});

test('X7-C 写入同源：practice 顺带留证迹；证迹失败不回滚本体但如实报出', () => {
    const { DL, engine } = makeEngine();
    const p = DL.agencyContractAct(engine, 'practice', { charKey: '甲', context: '门厅', approach: '先敲三下', outcome: 'success' });
    assert.equal(p.ok, true, p.reason);
    assert.equal(p.evidence, 'recorded', '证迹必须与本体由同一次动作产出（实 ' + p.evidence + '）');
    assert.equal(engine.worldProg.growthBundles.length, 1, '证迹束应建 1 条');
    const bun = engine.worldProg.growthBundles[0];
    assert.equal(bun.actorId, '甲');
    assert.equal(bun.habitKey, '门厅|先敲三下', '寻址键必须是 context|approach（与 habitRepos 同一套二元组）');
    assert.equal(bun.records.length, 1);
    assert.equal(bun.records[0].stage, K.STAGES.EFFECTIVE, '成功默认 effective_condition');
    assert.ok(bun.records[0].evidenceId, '证迹必须带证据 id（缺省取练习 id）');

    /* 第二次成功 ⇒ 同一束累加，不新开一束 */
    const p2 = DL.agencyContractAct(engine, 'practice', { charKey: '甲', context: '门厅', approach: '先敲三下', outcome: 'success' });
    assert.equal(p2.ok, true, p2.reason);
    assert.equal(engine.worldProg.growthBundles.length, 1, '同一 actor+key 必须累加进同一束');
    assert.equal(engine.worldProg.growthBundles[0].records.length, 2);

    /* 失败 ⇒ 阶段落 failed_case（不由调用方随口定） */
    const p3 = DL.agencyContractAct(engine, 'practice', { charKey: '甲', context: '门厅', approach: '先敲三下', outcome: 'failure' });
    assert.equal(p3.ok, true, p3.reason);
    assert.equal(engine.worldProg.growthBundles[0].records[2].stage, K.STAGES.FAILED);

    /* 证迹通道不可用：本体照旧写入，但返回值如实报 skipped（静默漏记比漏记更坏） */
    const made = makeEngine();
    made.DL.bindDeps({ moduleLib: made.engine._moduleLib, errLog: () => {}, _changeset: () => null,
        libs: { _habitGrowthLib: () => null, _agencyContractLib: () => require(path.join(ROOT, 'character-agency-contract.js')) } });
    const p4 = made.DL.agencyContractAct(made.engine, 'practice', { charKey: '丁', context: 'x', approach: 'y' });
    assert.equal(p4.ok, true, '证迹缺席不得让练习本身失败');
    assert.equal(p4.evidence, 'skipped:module-unavailable', '证迹缺席必须如实报出（实 ' + p4.evidence + '）');
    assert.equal(made.engine.worldProg.habitRepos.length, 1, '本体照旧写入 —— 不回滚');
    assert.equal((made.engine.worldProg.growthBundles || []).length, 0);
});

test('X7-D 只读面：宿主与诊断层都不得有 habitGrowth 的写入口', () => {
    /* 出口面：`state` / `line` 两个（一读一诊断行）；出现 Act/append/record 一类同名出口 = 第二套习惯账。
     *   ★ 注意 `_` 前缀：`_habitGrowthLine` 是内部诊断行（本仓既有形 `_xxxLine`），
     *     它也是**读**面的一员（只返回一行读数），故一并收进期望集。 */
    const hostExports = [...hostSrc.matchAll(/^\s*(_?habitGrowth\w*)\s*\(\.\.\.args\)/gm)].map((m) => m[1]);
    assert.deepEqual(hostExports.sort(), ['_habitGrowthLine', 'habitGrowthState'].sort(),
        '宿主出口必须恰为 state + line，实为 ' + hostExports.join('/'));
    assert.ok(!/habitGrowthAct/.test(diagSrc), '诊断层不得有 habitGrowthAct（第二处写入口）');
    assert.ok(!/habitGrowthAppend|habitGrowthRecord/.test(diagSrc), '诊断层不得有证据写入专用出口');
    /* 写入只能走既有的 practice 分支 */
    assert.ok(/act === 'practice'/.test(diagSrc), 'practice 分支仍在（证迹由它顺带产出）');
    assert.ok(/_habitGrowthLib\(\)/.test(diagSrc.slice(diagSrc.indexOf("act === 'practice'"), diagSrc.indexOf("act === 'practice'") + 4000)),
        'practice 分支内必须真取内核写证迹（不许只是注释里写着）');
});

test('X7-E 面板三态不同形：有据 / empty / absent；无数值条', () => {
    assert.ok(uiSrc.includes(A_UI_TITLE), '面板必须有习惯分区块');
    /* 三态标记互不相同 */
    assert.ok(uiSrc.includes("data-habit-status="), '逐条必须带机器可判标记');
    assert.ok(/faceHTML\('LLM 提取到「他反复这么做并成了习惯」/.test(uiSrc), 'empty 态要带「怎么开始」一句话');
    assert.ok(/data-ls-face="absent"/.test(uiSrc), 'absent 态必须复用全局缺席标记');
    /* 不许数值条 / 等级：窗口 = 从分区注释头到 `hgBlock;` 收尾（整块）。
     *   ★ 必须先剥注释再判：本块注释里明写着「不做『经验值 / 等级』类展示 ——
     *     不把成长做成数值条」，那是**口径声明**，不是展示。对未剥帧的原文判，
     *     等于禁止在代码里写清自己不做数值条（判据反咬自己）。
     *   （`winOf` 定义在文件顶部：F 档的负控制要用**同一个窗口**重跑同一条判据。） */
    const seg = winOf(uiSrc);
    assert.ok(uiSrc.indexOf(A_UI_SECTION) > 0, '分区注释头必须在（它是本块的唯一起点标记）');
    assert.ok(uiSrc.indexOf(A_UI_END, uiSrc.indexOf(A_UI_SECTION)) > uiSrc.indexOf(A_UI_SECTION),
        '分区必须以 `hgBlock;` 收尾（缺了就是没接进 protagonist 视图）');
    assert.ok(seg.length > 1500 && seg.length < 12000, '分区窗口长度异常（实 ' + seg.length + '）—— 窗口错了判据就在看别处');
    assert.ok(!/等级|经验值|熟练度|Lv\.|level/i.test(seg), '习惯面不得出现等级/经验值类展示（本仓纪律：不把成长做成数值条）');
    /* 「只显示有证据的」：证据列表来自 groups[].items，而 items 只收 total>0 的束 */
    assert.ok(/hg\.groups/.test(seg), '面板读的是分组（按角色），不是自己聚合');
    assert.ok(/counts\.unproven/.test(seg) && /counts\.orphan/.test(seg), '两块账差额必须同时在面板上可见');
    /* 存储格与持久化两向 */
    assert.ok(/this\.growthBundles = \[\];/.test(organsSrc), '证据束必须有显式存储格（undefined 与「没有」同形）');
    assert.ok(/growthBundles: this\.growthBundles \|\| \[\]/.test(organsSrc), '导出面必须带证据束');
    assert.ok(/this\.growthBundles = Array\.isArray\(data\.growthBundles\)/.test(organsSrc), '导入面必须回落空账');
});

test('X7-F 真源码破坏：三条各自在原版对照下必红', () => {
    /* ── N1 内核把畸形阶段并进 attempted ⇒ 「判不了」被写成「尝试过」 ──
     *   ★ 破坏要**真的改行为**：早先一版把守卫改成 `st = "attempted"`，而 `st` 是 const，
     *   副本一进来就抛 TypeError、被 describeGrowth 自己的 catch 兜成 degraded 空摘要 ——
     *   断言确实翻红了，但红的原因是「破坏把自己弄崩了」，不是「畸形被并进 attempted」。
     *   改成直接往 counts.attempted 记账：行为真变了，且仍是同一条判据在判。 */
    const kSrc = fs.readFileSync(KERNEL, 'utf8');
    const n1 = breakSource(kSrc, 'if (!Object.prototype.hasOwnProperty.call(counts, st)) { degraded = true; continue; }',
        'if (!Object.prototype.hasOwnProperty.call(counts, st)) { counts.attempted += 1; continue; }', 'x7_n1');
    const tmp1 = path.join(os.tmpdir(), 'lonsha_x7_n1_' + process.pid + '.cjs');
    fs.writeFileSync(tmp1, n1);
    try {
        delete require.cache[require.resolve(tmp1)];
        const K1 = require(tmp1);
        const d1 = K1.describeGrowth({ records: [{ stage: 'weird', timestamp: 1 }] });
        assert.equal(d1.degraded, false, '=> A 档的 degraded 断言在破坏副本上必然翻红');
        assert.equal(d1.counts.attempted, 1, '=> A 档「畸形不得算成 attempted」在破坏副本上必然翻红');
        /* 原版仍真（防「破坏把判据自己改了」的自指假绿） */
        assert.equal(K.describeGrowth({ records: [{ stage: 'weird', timestamp: 1 }] }).counts.attempted, 0);
    } finally { fs.rmSync(tmp1, { force: true }); }

    /* ── N2 诊断层把零证迹的束也并进证据列表 ⇒ 「没留证据」冒充「有据可查」 ──
     *   ★ 破坏点选在 `if (!d.total) continue;` —— 这一处**必然被执行**（只要有一束），
     *   而早先想拿 `provenKeys.has(...)  continue` 做破坏点：那处只在「有本体而无 items」
     *   时才走到，夹具里只要 items 非空就永假，破坏等于没写（负控制假绿第二形）。
     *   改成「空束照样进 items」，B 档「空束不得进证据列表」当场翻红。 */
    const n2 = breakSource(diagSrc, 'if (!d.total) continue;', 'if (!d.total && false) continue;', 'x7_n2');
    const tmp2 = path.join(os.tmpdir(), 'lonsha_x7_n2_' + process.pid + '.cjs');
    fs.writeFileSync(tmp2, n2);
    try {
        delete require.cache[require.resolve(tmp2)];
        const D2 = require(tmp2);
        D2.bindDeps({ moduleLib: () => null, errLog: () => {}, _changeset: () => null,
            libs: { _habitGrowthLib: () => K, _agencyContractLib: () => null } });
        const e2 = { worldProg: {
            habitRepos: [{ actor: '丙', habits: [{ context: 'a', approach: 'b', status: 'active' }] }],
            /* 一条**零证迹**的束：破坏点 `if (!d.total) continue;` 只有存在束时才被执行 */
            growthBundles: [{ actorId: '丙', skillOrHabit: 'b', habitKey: 'a|b', records: [], status: 'active' }],
        } };
        const r2 = D2.habitGrowthState(e2, {});
        assert.ok(r2.items.some((x) => x.total === 0), '=> B 档「空束不得进证据列表」在破坏副本上必然翻红');
        /* 原版仍真（同一夹具、同一断言） */
        const made = makeEngine({
            habitRepos: [{ actor: '丙', habits: [{ context: 'a', approach: 'b', status: 'active' }] }],
            growthBundles: [{ actorId: '丙', skillOrHabit: 'b', habitKey: 'a|b', records: [], status: 'active' }],
        });
        assert.equal(made.DL.habitGrowthState(made.engine, {}).items.length, 0, '原版：零证迹束不得进 items');
    } finally { fs.rmSync(tmp2, { force: true }); }

    /* ── N3 面板出现数值条 ⇒ 成长被做成数值 ── */
    const n3 = breakSource(uiSrc, A_UI_TITLE, '🌱 习惯与成长证据 · 熟练度 Lv.3', 'x7_n3');
    /* 与 E 档**同一条判据、同一个窗口**（顶部 winOf）：破坏了哪段，就在哪段上重跑 */
    assert.ok(/熟练度|Lv\./i.test(winOf(n3)), '=> E 档「不得出现等级/经验值」在破坏副本上必然翻红');
    /* 原版仍真 */
    assert.ok(!/等级|经验值|熟练度|Lv\.|level/i.test(winOf(uiSrc)), '原版：习惯分区内不得出现数值条措辞');
});

/* ══════════ G 当版锚（版本守卫 V4 要的那一处；vnum 形，可机检） ══════════ */
test('X7-G 出生版本下界锚点：三源互等且不承诺未来', () => {
    /* [v3.441.0] 历史文件锁回**自己的出生版本**（交棒链拆除口径，见 tests/v3203 第 12 条）。
     *   改前形态（v3.440.0 首版）是 `const CUR = '3.440.0'` + 三处 assert.equal(live, CUR)，
     *   抬到 3.441.0 当天就红 —— 这不是产品缺陷，是历史档案把「当版」写死成「永恒当版」的欠账。
     *   现状：下界 = 出生版本 3.440.0（本档不得低于它），上界 = 「不承诺高于现版」。
     *   当版锚的职责已交棒给当版档案 tests/v3441_l13_x4_evidence_gap.test.mjs 的 F1。 */
    const BORN_V = '3.440.0';
    const vnum = (v) => {
        const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(v || '').trim());
        return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
    };
    assert.equal(vnum(BORN_V), 3440000, '出生版本锚（vnum 形）：3.440.0 ⇒ 3440000');
    /* 三源互等：index.js VERSION / manifest / package（守卫 V1 的四源在 scan 里全查，
     *   本档只钉「这三处不许互相打架」这一段，避免与守卫重复两套口径）。 */
    const live = (/const VERSION = '([0-9]+[.][0-9]+[.][0-9]+)'/.exec(hostSrc) || [])[1];
    const mfV = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version;
    const pkV = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
    assert.equal(live, mfV, 'index.js VERSION 与 manifest 必须互等（实 ' + live + ' / ' + mfV + '）');
    assert.equal(mfV, pkV, 'manifest 与 package 必须互等（实 ' + mfV + ' / ' + pkV + '）');
    /* 上界：不承诺未来（现版可以更高，但不得低于本档出生版本） */
    assert.ok(vnum(live) >= vnum(BORN_V), '当版不得低于本档出生版本 ' + BORN_V + '（实 ' + live + '）');
    /* 内核档头必须带本版号（防「测了旧版」） */
    assert.ok(fs.readFileSync(KERNEL, 'utf8').includes('L13-X7'), '内核档头必须留 L13-X7 标记');
});
