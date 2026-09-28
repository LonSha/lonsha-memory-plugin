// tests/v3254_cache_identity_and_workload.test.mjs — 派生缓存身份统一 + 长线规模与缓存负载量测（v3.254.0）
//
//   计划原文两条：
//     ① 「派生缓存身份包含会话、剧情代际和数据修订号，编辑、删楼、重生成、导入、恢复必须失效」；
//     ② 「以 1000/5000/10000 楼及不同角色/九账规模测快照、候选化、序列化和设置界面消费」
//        「只有证明有收益的热点进入产品修改」。
//   本版交付的两样东西都**极易静默失效**（不报错、只错结果），故判据必须钉在契约面上：
//     · cache-identity.js 没注册 ⇒ 浏览器不加载 ⇒ 消费点「退回既有判据」，功能等于没上；
//     · 身份位少一位 ⇒ 换对话/回滚后仍命中旧注入；
//     · 量测台「读不出也报 measured:true」⇒ 把测不出读成很便宜；
//     · 判定把方向丢了（max/min 比值）⇒ 递减曲线假报超线性热点、给出「改产品」的建议。
//   §本版实测（探针真跑，见 G1）：四条曲线里 settings 是**亚线性**（每个档位的读数都在 340B 上下
//   徘徊，而耗时随档位单调上升 ⇒ 「贵在读、不在数据」），首稿却给出 open-hotspot-candidate。
//
//   判据面（实现全住在守卫 tests/audit/scan_v3254_cache_identity.mjs，本档只**调**它）：
//     A 契约面：注册 / 身份四位 / 六词词表 / 导出面
//     B 接线面：全局符号与五个宿主口 / 两个消费点 / selfCheck 三态行
//     C 判定方向：形状分型 + open 旗标方向性 + 重复读取两态不同形
//     D 负控制：四条工具两向自证 + 至少三条真源码破坏（改真文件内容 → 重跑**同一条**真判据必须转红）
//     D8-D11：身份来源（C9，v3.255.0 修掉的静默禁用缓存）——真源码零问题、破坏必红、锚点消失必红、
//        工具（方法体抽取）两向自证。
//     E 版本锚
//     F 判据面自防护（判据只许一处实现；注释/字符串不得字面引用锚点——v3216 假红的根因）
//     G 工具形态与证据：探针是真只读探针、且在本仓真跑得出四条路径的读数
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';
import {
    MODS, EXPECTED_KEYS, EXPECTED_CAUSES, HOST_ENTRIES, HOST_LIBS, PROBE_RE,
    judgeRegistration, judgeIdentityKeys, judgeVocabularies, judgeExports,
    judgeHostWiring, makeDefJudge, judgeShape, judgeOpenFlag, judgeRepeatReasons,
    judgeIdentitySource, methodBody, IDENTITY_ANCHOR_RE,
    stripCommentsKeepLength, normForMatch, REV_SOURCE_NEEDLE,
    judgeProbeShape, loadModule,
} from './audit/scan_v3254_cache_identity.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ok = (m) => console.log('  ✓ ' + m);

const MANIFEST = JSON.parse(read('manifest.json'));
const ENTRY = MANIFEST.js || 'index.js';
const ENTRY_SRC = read(ENTRY);
const EXTRA = Array.isArray(MANIFEST.extra_js) ? MANIFEST.extra_js : [];
const UID_SRC = 'cache-' + 'identity.js';      // 锚点字面量拼接（防注释自指假红）
const WL_SRC = 'cache-' + 'workload.js';
const GUARD_REL = path.join('tests', 'audit', 'scan_v3254_cache_identity.mjs');
const CI = await loadModule(ROOT, UID_SRC);
const WL = await loadModule(ROOT, WL_SRC);

/* ══════════ A 契约面 ══════════ */
test('v3254 A1. ★★ 两个模块都在磁盘上且都注册进 manifest.extra_js（漏注册=浏览器不加载，不报错）', () => {
    const problems = judgeRegistration(EXTRA, (rel) => fs.existsSync(path.join(ROOT, rel)));
    assert.deepEqual(problems, [], '注册面必须零问题');
    assert.equal(MODS.length, 2, '模块面常量被改动');
    ok('注册面：' + MODS.map((m) => m.file).join(' + '));
});

test('v3254 A2. ★★★ 身份恰四位且**顺序即契约**（少一位=换对话后仍命中旧注入）', () => {
    assert.deepEqual(judgeIdentityKeys(CI), [], '身份位表零漂移');
    assert.deepEqual(CI.IDENTITY_KEYS, EXPECTED_KEYS, '顺序即 key 拼装契约');
    /* 行为面：key 形态里 revision 缺位写 '-'，**不是** 0（0 是「确实是第 0 代」这个真读数）。 */
    const k = CI.identityKey({ chatId: 'c1', epoch: 3, revision: null, historyFingerprint: 'h1' });
    assert.equal(k, 'c1|e3|r-|h1', 'revision 缺位必须写 - 而不是 0：' + k);
    const k0 = CI.identityKey({ chatId: 'c1', epoch: 3, revision: 0, historyFingerprint: 'h1' });
    assert.equal(k0, 'c1|e3|r0|h1', 'revision=0 是合法真读数，必须与缺位可分：' + k0);
    assert.notEqual(k, k0, '「缺位」与「第 0 代」必须不同形');
    ok('四位顺序固定，缺位与 0 可分');
});

test('v3254 A3. ★★★ 失效原因恰为计划点名的六词，且拿不到判据≠判为失效', () => {
    assert.deepEqual(judgeVocabularies(CI), [], '词表零漂移');
    assert.deepEqual(CI.INVALIDATION_CAUSES, EXPECTED_CAUSES,
        '「编辑、删楼、重生成、导入、恢复」+ 换会话 = 六词，调用方不得自创同义字');
    /* 纪律①的行为面：当下身份读不出 ⇒ no-current 放行（证伪不了不等于失效）。 */
    const noCur = CI.invalidate({ chatId: 'c1', epoch: 1, historyFingerprint: 'h' }, {});
    assert.equal(noCur.stale, false, '判不了不得当失效（会静默禁用缓存）');
    assert.equal(noCur.reason, 'no-current');
    assert.equal(noCur.unjudgeable, true, '「判不了」必须如实带出来');
    /* 纪律②：旧格式项（没带身份）默认放行，收紧须显式传入。 */
    assert.equal(CI.invalidate({}, { chatId: 'c1', epoch: 1, historyFingerprint: 'h' }).stale, false);
    assert.equal(CI.invalidate({}, { chatId: 'c1', epoch: 1, historyFingerprint: 'h' }, { noIdIsStale: true }).stale, true);
    /* 真失效四类各自具名。 */
    const cur = { chatId: 'c1', epoch: 3, revision: 7, historyFingerprint: 'h2' };
    const prev = { chatId: 'c1', epoch: 3, revision: 7, historyFingerprint: 'h1' };
    assert.equal(CI.invalidate(prev, cur).reason, 'history-changed', '上游楼被改即失效');
    assert.equal(CI.invalidate({ ...prev, chatId: 'c2' }, cur).reason, 'conversation-changed');
    assert.equal(CI.invalidate({ ...prev, epoch: 2 }, cur).reason, 'epoch-changed');
    assert.equal(CI.invalidate({ ...prev, revision: 6 }, cur).reason, 'revision-changed');
    /* 变更动作 → 六词：宿主事件名也认（修前只认 op ⇒ 真实接线全落 unknown）。 */
    assert.equal(CI.causeOf({ event: 'CHAT_CHANGED' }), 'switch');
    assert.equal(CI.causeOf({ event: 'MESSAGE_EDITED' }), 'edit');
    assert.equal(CI.causeOf({ event: 'MESSAGE_DELETED' }), 'delete');
    assert.equal(CI.causeOf({ event: 'MESSAGE_SWIPED' }), 'regen');
    assert.equal(CI.causeOf({ op: 'import-carryover' }), 'import');
    assert.equal(CI.causeOf({ op: 'restoreFromPayload' }), 'restore');
    ok('六词齐备；no-current/no-id 放行；四类失效各自具名');
});

test('v3254 A4. ★★ 两个模块的导出面齐备（缺导出=调用方静默降级）', () => {
    assert.deepEqual(judgeExports(CI, WL), [], '导出面零问题');
    assert.ok(WL.SIZES.includes(1000) && WL.SIZES.includes(5000) && WL.SIZES.includes(10000),
        '计划点名的三档必须在（现状 ' + JSON.stringify(WL.SIZES) + '）');
    assert.deepEqual(WL.PATHS, ['snapshot', 'candidate', 'serialize', 'settings'],
        '计划点名的四条消费路径，顺序即报表顺序');
    ok('导出面齐备；档位 1000/5000/10000 与四条路径在场');
});

/* ══════════ B 接线面 ══════════ */
test('v3254 B1. ★★★ 入口真引用两个全局符号，且五个宿主口各有**定义形态**', () => {
    const problems = judgeHostWiring(ENTRY, ENTRY_SRC, makeDefJudge(ENTRY_SRC));
    assert.deepEqual(problems, [], '接线面零问题：' + JSON.stringify(problems));
    /* 定义形态判据必须认两种写法 —— 首稿只认类方法简写，在真仓库上误报两条「缺取库口」。 */
    const def = makeDefJudge(ENTRY_SRC);
    for (const n of HOST_ENTRIES.concat(HOST_LIBS)) assert.equal(def(n), true, '宿主口必须在场：' + n);
    assert.equal(def('__no_such_host_entry__'), false, '不存在的名字必须判否（否则判据恒真）');
    /* 只看定义形态、不看注释：把名字塞进注释里不得满足判据。 */
    assert.equal(makeDefJudge('// function _dataRevision() { 只是注释\n')('_dataRevision'), false,
        '注释里的定义形态不算数（v3216 假红的老账）');
    ok('两个全局引用 + 五个宿主口（' + HOST_ENTRIES.length + ' 方法 + ' + HOST_LIBS.length + ' 取库口）');
});

test('v3254 B2. ★★★ 两个消费点真接上（命中侧前置判定 + 写入侧落身份位）', () => {
    /* 命中侧：身份判定必须在位置位判据**之前**求值，并参与条件（否则接了等于没接）。 */
    assert.ok(ENTRY_SRC.includes('const _idv = this._cacheIdentityStale(this._recallCache);'),
        '命中侧必须真调唯一判定入口');
    assert.ok(ENTRY_SRC.includes('const _identOk = !(_idv && _idv.stale);'),
        '模块不在场（返回 null）必须判 ok ⇒ 退回既有判据');
    assert.ok(ENTRY_SRC.includes('if (_identOk && this._recallCache.floor === curFloor'),
        '身份判定必须进命中条件（只算不判 = 摆设）');
    /* 写入侧：身份位必须与缓存对象同一轮落盘。 */
    assert.ok(ENTRY_SRC.includes('this._recallCache.identity = this._cacheIdentityOf() || null;'),
        '写入侧必须落身份位（取不到如实写 null，而不是当失效）');
    /* 两处必须同源：都走宿主口，不在调用点自拼四元组。 */
    const idConsts = ENTRY_SRC.split('_cacheIdentityOf()').length - 1;
    assert.ok(idConsts >= 2, '宿主身份组装口须被两处消费（读侧 selfCheck + 写侧）');
    ok('命中侧前置判定 + 写入侧身份位，两处同源');
});

test('v3254 B3. ★★ selfCheck 的「缓存身份」行三态**不同形**（没读数/模块缺席/有读数）', () => {
    assert.ok(ENTRY_SRC.includes("rows.push(['缓存身份'"), '诊断行必须在 selfCheck 里');
    assert.ok(ENTRY_SRC.includes('模块缺席（cache-identity.js 未加载）'), '态一：模块缺席');
    assert.ok(ENTRY_SRC.includes('当下身份读不出（会话/代际/历史任一位缺失）'), '态二：当下身份读不出');
    /* 态三必须带真读数（身份键），否则三态里有两个是同形空话。 */
    assert.ok(ENTRY_SRC.includes('_ci.identityKey(_cur)'), '态三必须打出当下身份键');
    assert.ok(ENTRY_SRC.includes("errLog(e, 'selfCheck.cacheIdentity')"), '诊断行须有专属失败出口');
    ok('三态各自具名，且带真读数');
});

/* ══════════ C 判定方向（本版修掉的最大缺陷） ══════════ */
test('v3254 C1. ★★ 形状分型四型正确，且钝钟下不得报 measured:true', () => {
    assert.deepEqual(judgeShape(WL), [], '形状分型零问题');
    const r = WL.curve('probe', { build: (n) => n, read: (n) => n, bytes: (o) => o }, { sizes: [0, 10, 20] });
    assert.equal(r.measured, true, '可控路径必须真测得出（否则下面的「测不出」判据是假绿）');
    ok('四型分型正确；钝钟归 clock-nonfinite');
});

test('v3254 C2. ★★★ open 旗标的方向性：**形状不变**的驱动也要拦得住假热点', () => {
    assert.deepEqual(judgeOpenFlag(WL), [], 'open 旗标方向性零问题');
    /* 反证「判别集真的在驱动缺陷」：这三型在**首稿算法**下全部会被判成超线性（真跑读数）。 */
    const legacyOpens = [];
    const shapes = [
        { tag: 'sublinear', fn: (n) => Math.sqrt(n) * 100 },
        { tag: 'v-shaped', fn: (n) => (n <= 100 ? n * 5 : (n <= 200 ? 500 + (n - 100) : (n <= 400 ? 600 + (n - 200) / 2 : 700 + 8.25 * (n - 400)))) },
        { tag: 'dip-then-surge', fn: (n) => (n <= 100 ? n * 10 : (n <= 200 ? 1000 + (n - 100) / 2 : (n <= 400 ? 1100 + (n - 200) / 4 : 1200 + 47 * (n - 400)))) },
    ];
    for (const s of shapes) {
        const r = WL.curve('probe', { build: (n) => n, read: (n) => s.fn(n), bytes: (o) => o }, { sizes: [0, 100, 200, 400, 800] });
        const mx = Math.max(...r.slope), mn = Math.min(...r.slope);
        if (mn > 0 && mx / mn > WL.SUPERLINEAR_RATIO) legacyOpens.push(s.tag);
        assert.notEqual(r.recommendation, 'open-hotspot-candidate', s.tag + ' 不得拿 open-*（证据不支持）');
    }
    assert.equal(legacyOpens.length, 3, '三型都必须落在首稿的假热点集合里（否则这条判据没在驱动缺陷）：' + legacyOpens.join(','));
    /* 真超线性仍须 open（不得为了压假阳而漏报热点）。 */
    const q = WL.curve('probe', { build: (n) => n, read: (n) => n * n, bytes: (o) => o }, { sizes: [0, 100, 200, 400, 800] });
    assert.equal(q.recommendation, 'open-hotspot-candidate', '真超线性必须 open');
    ok('三型假热点全拦（首稿都会 open）、真超线性不漏报');
});

test('v3254 C3. ★★ 重复读取：坏钟与钝钟必须**不同形**，可控钟必须真给出比值', () => {
    assert.deepEqual(judgeRepeatReasons(WL), [], '重复读取读数零问题');
    const p = { build: (n) => n, read: (n) => n };
    assert.equal(WL.repeatCost(p, { n: 10, repeat: 3, clock: { now: () => NaN } }).reason, 'clock-nonfinite');
    assert.equal(WL.repeatCost(p, { n: 10, repeat: 3, clock: { now: () => 0 } }).reason, 'clock-resolution-too-coarse');
    ok('坏钟 / 钝钟 / 可控钟三态可分');
});

/* ══════════ D 负控制 ══════════ */
test('v3254 D1. ★★ 锚点不存在 ⇒ 拒绝破坏', () => {
    assert.throws(() => breakSource(ENTRY_SRC, '__no_such_anchor_xyz__', 'x', 'D1'), /拒绝破坏/);
});
test('v3254 D2. ★★ 锚点命中多次 ⇒ 拒绝破坏', () => {
    assert.throws(() => breakSource(ENTRY_SRC, 'this._recallCache = ', 'X', 'D2'), /拒绝破坏/);
});
test('v3254 D3. ★★ 同值替换 ⇒ 拒绝破坏（否则「破坏副本」等于原件）', () => {
    assert.throws(() => breakSource(ENTRY_SRC, 'cache-identity.js', 'cache-identity.js', 'D3'), /拒绝破坏/);
});
test('v3254 D4. ★★ 空锚点 ⇒ 拒绝破坏', () => {
    assert.throws(() => breakSource(ENTRY_SRC, '', 'x', 'D4'), /拒绝破坏/);
});

/** 把被破坏的模块写到临时目录并真装载（IIFE 无依赖，可直接 require）。 */
async function loadBroken(rel, from, to, label) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3254-neg-'));
    try {
        fs.writeFileSync(path.join(dir, rel), breakSource(read(rel), from, to, label));
        return await loadModule(dir, rel);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('v3254 D5. ★★★ 负控制·接线缺失：抽掉宿主口定义 ⇒ 同一条真判据转红（原件上仍为真）', () => {
    const brokenSrc = breakSource(ENTRY_SRC,
        '_cacheIdentityStale(entry, opts) {', '_cacheIdentityStaleRemoved(entry, opts) {', 'D5-wiring');
    assert.ok(judgeHostWiring(ENTRY, brokenSrc, makeDefJudge(brokenSrc)).some((p) => p.includes('_cacheIdentityStale')),
        '宿主口被抽掉必须转红');
    assert.deepEqual(judgeHostWiring(ENTRY, ENTRY_SRC, makeDefJudge(ENTRY_SRC)), [], '对照：原件上零问题');
    /* 反向：注释里出现名字不得让判据变绿 */
    assert.equal(makeDefJudge('/* _cacheIdentityStale() 在此注释里 */\n')('_cacheIdentityStale'), false);
    ok('抽掉宿主口 ⇒ 真判据转红；注释不算数');
});

test('v3254 D6. ★★★ 负控制·方向丢失：删掉「逐段非降」那道闸 ⇒ 同一条真判据转红', async () => {
    /* 破坏点：`superlinear` 判定里的 ascending 闸（真源码，不是模拟常量）。
       去掉它之后，判据退化成「首尾比」——`dip-then-surge`（末/首 = 2.5）立刻被误判成超线性。 */
    const broken = await loadBroken(WL_SRC, '\n            && ascending\n', '\n', 'D6-direction');
    assert.equal(broken.__loadError, undefined, '破坏副本必须真装载：' + broken.__loadError);
    assert.ok(judgeOpenFlag(broken).length > 0, '丢掉方向闸之后必须转红');
    assert.deepEqual(judgeOpenFlag(WL), [], '对照：原件上零问题');
    /* 形状面不得因此误红（证明破坏的是方向闸、不是整个分型）。 */
    assert.deepEqual(judgeShape(broken), [], '形状分型不受该闸影响（这是「只坏了一处」的证据）');
    ok('抽掉方向闸 ⇒ open 判据转红，形状分型仍绿（破坏定点）');
});

test('v3254 D7. ★★★ 负控制·身份位少一位 ⇒ 同一条真判据转红', async () => {
    const broken = await loadBroken(UID_SRC,
        "'chatId', 'epoch', 'revision', 'historyFingerprint'", "'chatId', 'epoch', 'historyFingerprint'", 'D7-drop-revision');
    assert.ok(judgeIdentityKeys(broken).length > 0, '身份位表少一位必须转红（换对话后仍命中旧注入）');
    assert.deepEqual(judgeIdentityKeys(CI), [], '对照：原件上零问题');
    ok('少一位 ⇒ 身份判据转红');
});

/* ══════════ C9 身份来源（v3.255.0 修掉的第二处真缺陷） ══════════
 * 修前实测：`_cacheIdentityOf()` 首稿把 revision 位填成 `this.storage.getRevision()`，
 * 而 `StorageManager.save()` 是**无条件** `this._revision += 1` —— 数的是落盘**次数**。
 * 于是同一楼每编辑 / swipe / 删楼一次（三条路径都会立即落盘），命中检查就读到不同的
 * revision 位（r0 → r1），会话 / 代际 / 历史指纹**三位逐字未变**却被判 `revision-changed`
 * ⇒ 缓存永不命中。形态：**静默禁用缓存**（不报错、只是白花钱）。
 * 下面四条把这一位钉住：正向（真源码零问题）、负向（改回 getRevision 必红）、
 * 锚点消失必红、以及抽方法体的工具两向自证。
 */
const NL = String.fromCharCode(10);

test('v3254 D8. ★★★ 身份来源：真源码的 revision 位不读 storage.getRevision()（正向零问题）', () => {
    assert.deepEqual(judgeIdentitySource(CI, ENTRY_SRC), [], '真源码上这一位必须零问题');
    const hit = IDENTITY_ANCHOR_RE.exec(ENTRY_SRC);
    assert.ok(hit, '`_cacheIdentityOf()` 定义形态必须在场（锚点消失则下面的自证无意义）');
    const blk = methodBody(ENTRY_SRC, hit[0]);
    assert.equal(blk.error, undefined, '方法体必须能花括号配平抽出：' + blk.error);
    assert.ok(blk.body.length > 100, '抽出的方法体不得退化成空壳（现状 ' + blk.body.length + ' 字节）');
    ok('身份来源：revision 位不自行填（key 里是 r-）');
});

test('v3254 D9. ★★★ 负控制·身份来源：把 revision 位改回 storage.getRevision() ⇒ 同一条真判据转红', () => {
    /* 破坏点取 `revision: null,`（该字面量在入口里恰一处，且不出现在注释里）；
       替换串拆成拼接，以免本档字面量自命中「被禁来源针」（否则判据纯度自证会假红）。 */
    const FORBIDDEN = 'this.storage.' + 'getRevision(';
    const brokenSrc = breakSource(ENTRY_SRC,
        'revision: null,',
        'revision: ' + FORBIDDEN + '),', 'D9-identity-source');
    const probs = judgeIdentitySource(CI, brokenSrc);
    assert.ok(probs.length > 0, '改回无条件自增的落盘计数器必须转红');
    assert.ok(probs.some((p) => p.includes('getRevision')), '转红原因须点名 getRevision：' + JSON.stringify(probs));
    assert.ok(probs.some((p) => p.includes('正向失败') || p.includes('revision-changed')),
        '行为面也必须红（同一楼落盘一次不得让缓存失效）：' + JSON.stringify(probs));
    assert.deepEqual(judgeIdentitySource(CI, ENTRY_SRC), [], '对照：原件上零问题');
    ok('revision 位改回落盘计数器 ⇒ 静态面与行为面同时转红');
});

test('v3254 D10. ★★★ 负控制·锚点消失 ⇒ 转红（不得静默放行）', () => {
    const hit = IDENTITY_ANCHOR_RE.exec(ENTRY_SRC);
    assert.ok(hit, '原件上锚点必须能找到');
    const gone = ENTRY_SRC.replace(hit[0], hit[0].replace('_cacheIdentityOf', '_cacheIdentityOfRenamed'));
    assert.notEqual(gone, ENTRY_SRC, '锚点必须真被改写（否则这条负控制是假绿）');
    const probs = judgeIdentitySource(CI, gone);
    assert.ok(probs.some((p) => p.includes('找不到')), '锚点消失必须转红：' + JSON.stringify(probs));
    assert.ok(judgeIdentitySource(CI, '').length > 0, '空入口源码不得判绿');
    assert.ok(judgeIdentitySource(CI, null).length > 0, 'null 入口源码不得判绿');
    ok('锚点消失 / 入参退化 ⇒ 一律转红（证据拿不到不是「没问题」）');
});

test('v3254 D11. ★★ 工具两向自证：methodBody 不存在的锚点 / 重名锚点 / 形态不符都必须报错', () => {
    assert.match(methodBody(ENTRY_SRC, NL + '        _noSuchMethod() {').error, /锚点不存在/);
    const dupSrc = ENTRY_SRC + NL + '        _cacheIdentityOf() {' + NL + '            return null;' + NL + '        }' + NL;
    assert.match(methodBody(dupSrc, IDENTITY_ANCHOR_RE.exec(dupSrc)[0]).error, /锚点不唯一/);
    assert.match(methodBody(ENTRY_SRC, 'bad-anchor').error, /花括号|锚点/);
    const hit = IDENTITY_ANCHOR_RE.exec(ENTRY_SRC);
    const blk = methodBody(ENTRY_SRC, hit[0]);
    assert.equal(blk.text.trim().startsWith('_cacheIdentityOf()'), true, '抽出的段必须从方法头开始：' + blk.text.slice(0, 40));
    assert.equal(blk.text.trim().endsWith('}'), true, '抽出的段必须在方法右括号结束');
    ok('方法体抽取两向自证：不存在 / 不唯一 / 形态不符须报错');
});


test('v3254 D12. ★★判据纯度（H5/W9 同纪律）：注释里的旧写法不得误红，真代码里的必须红', () => {
    /* ① 工具两向自证：剥注释必须**保长**（索引对齐），且注释内的针必须被清零。 */
    const src = 'ab/*' + REV_SOURCE_NEEDLE + ') */cd//' + REV_SOURCE_NEEDLE + '\nef';
    const masked = stripCommentsKeepLength(src);
    assert.equal(masked.length, src.length, '剥注释必须保长（否则配平与索引均失准）');
    assert.equal(masked.indexOf(REV_SOURCE_NEEDLE), -1, '注释内的被禁来源必须被清零');
    assert.equal(masked.indexOf('ab'), 0, '非注释部分不得被动（过度掩砍会假绿）');
    assert.equal(normForMatch('this . storage\n. get').indexOf(' '), -1, 'normForMatch 必须去掉空白/换行');
    /* ② 本档（负控制层）不得出现被禁来源的完整字面量，且破坏锚只准声明 1 次。 */
    const ownSrc = read(path.join('tests', 'v3254_cache_identity_and_workload.test.mjs'));
    const ownMasked = stripCommentsKeepLength(ownSrc);
    assert.equal(ownMasked.indexOf(REV_SOURCE_NEEDLE), -1,
        '负控制不得引用被禁来源针的完整字面量（自我指涉假绿）');
    /* 破坏锚的唯一性对象是**真源码**（index.js），不是本档：对本档数会把「断言自己」也算进去（A2 的合法身份对象里也有同名字段）。 */
    assert.equal(ENTRY_SRC.split('revision: null,').length - 1, 1,
        '破坏锚在真源码里精确只准出现 1 次（命中多次 breakSource 会拒绝破坏）');
    /* ③ 行为面两向：注释里放针 ⇒ 不红；真代码里放针 ⇒ 红。 */
    const hit = IDENTITY_ANCHOR_RE.exec(ENTRY_SRC);
    const polluted = ENTRY_SRC.replace(hit[0], hit[0] + NL + '            /* ' + REV_SOURCE_NEEDLE + ') 旧写法在注释里 */');
    assert.notEqual(polluted, ENTRY_SRC, '污染必须真发生');
    assert.deepEqual(judgeIdentitySource(CI, polluted), [], '注释里的旧写法不得误红（W9 老账）');
    ok('判据纯度：剥注释保长且清零；注释写法不误红、真代码必红');
});

/* ══════════ E 版本锚 ══════════ */
const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));

test('v3254 E1. ★ 版本锚（当版 frontier，四源同源）', () => {
    const pkg = JSON.parse(read('package.json'));
    const codeVer = (/const VERSION = '([^']+)'/.exec(ENTRY_SRC) || [])[1];
    assert.ok(codeVer, '入口版本常量在场');
    assert.ok(vnum(codeVer) >= vnum('3.254.0'), '本套件只在 3.254.0 及以后成立；当前 ' + codeVer);
    assert.equal(pkg.version, codeVer, 'package.json 必须与入口同版');
    assert.equal(MANIFEST.version, codeVer, 'manifest.json 必须与入口同版');
    ok('版本锚：' + codeVer);
});

/* ══════════ F 判据面自防护 ══════════ */
test('v3254 F1. ★★ 判据只许一处实现：本档只调用，不重写', () => {
    const own = read(path.join('tests', 'v3254_cache_identity_and_workload.test.mjs'));
    const LIT = 'function ' + 'judge';   // 拼接：断言字符串不得自命中（v3216 假红根因）
    for (const n of ['Registration', 'IdentityKeys', 'OpenFlag', 'RepeatReasons']) {
        assert.equal(own.includes(LIT + n), false, '判据实现必须住在守卫里：judge' + n);
    }
    for (const n of ['judgeRegistration(', 'judgeOpenFlag(', 'judgeHostWiring(', 'judgeRepeatReasons(']) {
        assert.ok(own.includes(n), '本档必须真调用判据：' + n);
    }
    assert.ok(fs.existsSync(path.join(ROOT, GUARD_REL)), '守卫必须在场');
    const guard = read(GUARD_REL);
    for (const fn of ['judgeRegistration', 'judgeIdentityKeys', 'judgeVocabularies', 'judgeExports',
        'judgeHostWiring', 'judgeShape', 'judgeOpenFlag', 'judgeRepeatReasons', 'judgeProbeShape', 'makeDefJudge']) {
        assert.ok(guard.includes('export function ' + fn), '守卫必须导出 ' + fn);
    }
    assert.ok(guard.includes('isMain'), '守卫必须只在直接执行时跑主入口（否则 import 会 exit）');
    ok('判据一处实现、本档只调用；守卫 isMain 分离在场');
});

/* ══════════ G 工具形态与证据 ══════════ */
test('v3254 G1. ★★ 只读探针是真探针：在真仓库上真跑得出四条路径，且不下「改产品」的结论', async () => {
    const { spawnSync } = await import('node:child_process');
    const probeRel = 'tests/audit/_m_o4_probe.mjs';
    const r = spawnSync(process.execPath, [probeRel], { cwd: ROOT, encoding: 'utf8', timeout: 300000, maxBuffer: 1e8 });
    assert.equal(r.status, 0, '探针必须跑通（exit ' + r.status + '）：' + String(r.stderr).slice(0, 200));
    const out = String(r.stdout);
    /* 四条路径都得有读数 —— 否则「全测不出」会被读成「很便宜」。 */
    assert.match(out, /measured_paths=4\/4/, '四条路径都必须真测得出：' + (out.match(/measured_paths=\S+/) || [''])[0]);
    /* 未证收益不得改产品：本仓现状的结论必须是 not-done-until-evidence。 */
    assert.match(out, /not-done-until-evidence/, '结论必须是「未证收益不改产品」');
    /* 每一条路径的最大档位都必须**真读到非 0 字节** —— 「序列化失败读成 0B」正是本版修掉的
       第三个真缺陷（夹具缺方法 ⇒ 四条曲线齐刷刷 0B/0ms，看起来像「序列化免费」）。 */
    const detail = out.split('--- 逐档明细 ---')[1] || '';
    const rows = detail.split('\n').map((l) => l.trim()).filter((l) => /^[a-z]+\t/.test(l));
    assert.equal(rows.length, 4, '逐档明细必须四条路径各一行，实得 ' + rows.length);
    for (const line of rows) {
        const name = line.split('\t')[0];
        const last = (line.match(/(\d+):(\d+)B/g) || []).pop();
        assert.ok(last, name + ' 必须给出字节读数');
        assert.ok(Number(last.split(':')[1].replace('B', '')) > 0, name + ' 的最大档位读数不得为 0B（那是失败被读成 0）');
    }
    ok('探针真跑：4/4 路径有非 0 字节读数，结论 not-done-until-evidence');
});

test('v3254 G2. ★★ 探针不入灵敏度矩阵；本扫描器必须登记（双向）', () => {
    const AUDIT = path.join(ROOT, 'tests', 'audit');
    const probes = fs.readdirSync(AUDIT).filter((f) => PROBE_RE.test(f));
    assert.ok(probes.length >= 1, '审计目录下必须有只读探针');
    const matrixPath = path.join(AUDIT, 'audit_scan_probe_matrix.tsv');
    const matrix = fs.readFileSync(matrixPath, 'utf8');
    assert.deepEqual(judgeProbeShape(probes, matrix, (rel) => fs.existsSync(path.join(ROOT, rel))), [],
        '探针不得登记进矩阵；矩阵不得有退位项');
    assert.ok(matrix.split('\n').some((l) => l.startsWith('scan_v3254_cache_identity.mjs\t')),
        '本扫描器必须登记进灵敏度矩阵（v3226 双向齐全）');
    /* 登记行须与实测一致（H=0 正常树不得误红；G 档敏感）。 */
    const row = matrix.split('\n').find((l) => l.startsWith('scan_v3254_cache_identity.mjs\t')).split('\t');
    assert.equal(row[1], '0', 'H 列必须为 0');
    assert.ok(row[2] !== '0' || row[3] !== '0', 'G/T 至少一列非 0（否则是恒绿探测器）');
    ok('扫描器已登记（H/G/T = ' + row[1] + '/' + row[2] + '/' + row[3] + '），探针未入表');
});
