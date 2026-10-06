/* ================================================================
 * v3290_x4_fact_admission.test.mjs — [v3.290.0 · X4] 手机事实受控准入判据
 *
 * 【本套件要证明的三件事（不是「函数返回了对象」）】
 *   ① 预测不得变成已发生事实（报价 / 分摊 / 建议转账 / 未来日程）。
 *   ② 身份不带的现象被堵住：错会话 / 旧代 / 重复 eventId 各自可归因。
 *   ③ 作者面不得进角色面：usage-tracker 这类玩家使用行为不进生成面。
 * 另加 F 段的**真源码破坏**：把面里「预测不升档」的判据拆掉，验证 A 段
 * 真判据会在破坏副本上翻红（原版通过作反向对照）—— 防「对原文件断言」型假绿。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const MOD = path.join(ROOT, 'native-fact-admission.js');
const SRC = readFileSync(MOD, 'utf8');

function load(modPath) {
    for (const k of Object.keys(require.cache)) delete require.cache[k];
    return require(modPath);
}
const api = () => load(MOD);
const CTX = { chatId: 'chat-A', revision: 7 };

test('v3290 A. 只读面结构：面齐全、版本分列、无写面', () => {
    const A = api();
    for (const k of ['admitNativeFact', 'admitBatch', 'filterRecallForCharacter', 'probeCounterpart', 'admissionLine', 'policyOf', 'visibilityOf', 'stateOf', 'normalizeSource']) {
        assert.equal(typeof A[k], 'function', '缺函数 ' + k);
    }
    assert.equal(typeof A.CONTRACT_VERSION, 'number');
    assert.equal(typeof A.ADMIT_VERSION, 'number');
    assert.equal(A.CONTRACT_VERSION, 1, '契约版本');
    assert.equal(A.ADMIT_VERSION, 1, '裁决口径版本');
    /* 只读面：源码里不得出现 storage / localStorage / graph 私有字段写入。 */
    for (const bad of ['localStorage', 'indexedDB', 'sessionStorage']) {
        assert.equal(SRC.includes(bad), false, '只读面不得出现 ' + bad);
    }
    /* 也不得 require 别的模块（零依赖） */
    assert.equal(/require\(\s*['"]\.\//.test(SRC), false, '面必须零依赖');
})

test('v3290 B1. 预测不得变成已发生事实（报价 / 分摊 / 建议转账 / 未来日程）', () => {
    const A = api();
    for (const src of ['quote', 'simulated-quote', 'traveldesk', 'travel-desk', 'forecast']) {
        const r = A.admitNativeFact({ eventId: 'e-' + src, source: src }, CTX);
        assert.equal(r.decision, 'predicted', src + ' 应判 predicted');
        assert.equal(r.isFact, false, src + ' 不得当已发生事实（isFact 必须 false）');
    }
})

test('v3290 B2. 自述越权被堵：predicted 来源自述 confirmed 不升档，除非 userConfirmed', () => {
    const A = api();
    const sneaky = A.admitNativeFact({ eventId: 'e1', source: 'quote', status: 'confirmed' }, CTX);
    assert.equal(sneaky.decision, 'predicted', '无 userConfirmed 的自述不得升档');
    assert.equal(sneaky.state, 'predicted');
    assert.ok(sneaky.notes.some((n) => n.includes('不升档')), '须在 notes 留痕');
    const ok = A.admitNativeFact({ eventId: 'e2', source: 'quote', status: 'confirmed', userConfirmed: true }, CTX);
    assert.equal(ok.state, 'confirmed', '用户真点过确认才允许升档');
    assert.equal(ok.decision, 'draft', '但来源本身 isFact:false ⇒ 仍不当已发生事实');
})

test('v3290 C1. 身份三拒各自可归因（错会话 / 旧代 / 重复事件）', () => {
    const A = api();
    const cross = A.admitNativeFact({ eventId: 'e1', source: 'calendar', chatId: 'chat-B' }, { chatId: 'chat-A', revision: 7 });
    assert.equal(cross.decision, 'rejected');
    assert.equal(cross.reason, 'session-mismatch', '错会话可归因');
    const stale = A.admitNativeFact({ eventId: 'e2', source: 'calendar', revision: 3 }, { chatId: 'chat-A', revision: 9 });
    assert.equal(stale.reason, 'stale-generation', '旧代可归因（旧异步写入被拒）');
    const dup = A.admitNativeFact({ eventId: 'e3', source: 'calendar' }, { chatId: 'chat-A', seenEventIds: ['e3'] });
    assert.equal(dup.reason, 'duplicate-event');
    assert.equal(dup.dedupe, 'event-id');
    /* 三种拒绝的 reason **不同形** —— 压成一态就再也分不出来 */
    assert.equal(new Set([cross.reason, stale.reason, dup.reason]).size, 3);
})

test('v3290 C2. 分支不符也是会话不符（branchId 是会话身份一部分）', () => {
    const A = api();
    const r = A.admitNativeFact({ eventId: 'e1', source: 'calendar', chatId: 'chat-A', branchId: 'br-2' }, { chatId: 'chat-A', branchId: 'br-1' });
    assert.equal(r.reason, 'session-mismatch');
    assert.ok(r.notes.some((n) => n.includes('分支不符')));
})

test('v3290 C3. 同源去重：转述 / 转发按 rootEventId 只进一次，不当独立证据', () => {
    const A = api();
    const r = A.admitNativeFact({ eventId: 'e2', rootEventId: 'R1', source: 'repost' }, { chatId: 'chat-A', seenRootEventIds: ['R1'] });
    assert.equal(r.decision, 'rejected');
    assert.equal(r.reason, 'duplicate-event');
    assert.equal(r.dedupe, 'root-event-id', '按同源去重，非按 eventId');
    assert.equal(r.replayOf, 'R1');
})

test('v3290 D1. 未知来源拒收：查不出来 ≠ 按已发生处理', () => {
    const A = api();
    const r = A.admitNativeFact({ eventId: 'e1', source: 'some-new-app' }, CTX);
    assert.equal(r.decision, 'rejected');
    assert.equal(r.reason, 'unknown-source');
    assert.equal(A.policyOf('some-new-app').known, false);
    /* 空来源同样拒收（不得落到默认档） */
    assert.equal(A.admitNativeFact({ eventId: 'e2' }, CTX).reason, 'unknown-source');
})

test('v3290 D2. 台账每一行都有确定裁决（加来源 = 加一行，防清单漏项）', () => {
    const A = api();
    const names = Object.keys(A.SOURCE_POLICY);
    assert.ok(names.length >= 14, '来源表不得退化');
    for (const n of names) {
        const p = A.SOURCE_POLICY[n];
        assert.ok(A.FACT_STATES.includes(p.state), n + ' 状态必须在五态内');
        assert.ok(A.VISIBILITIES.includes(p.visibility), n + ' 可见性必须在三档内');
        assert.equal(typeof p.isFact, 'boolean', n + ' isFact 必须是布尔');
        /* 每一行都必须能判出确定裁决（不是抛错 / 不是 undefined） */
        const r = A.admitNativeFact({ eventId: 'e-' + n, source: n }, CTX);
        assert.equal(r.measurable, true, n);
        assert.ok(['admitted', 'observed', 'predicted', 'quoted', 'draft', 'rejected'].includes(r.decision), n + ' 裁决须在六档内');
    }
})

test('v3290 D3. 状态自述拼错不静默变已确认', () => {
    const A = api();
    const r = A.admitNativeFact({ eventId: 'e1', source: 'quote', status: 'confirm' }, CTX);
    assert.equal(r.state, 'predicted', '拼错自述回落来源默认');
    assert.ok(r.notes.some((n) => n.includes('不识别')), '须留痕');
})

test('v3290 E1. 召回侧可见性过滤：作者面不进角色面，两栏都可见', () => {
    const A = api();
    const r = A.filterRecallForCharacter([
        { content: '玩家点开了微信', source: 'usage-tracker' },
        { content: '今天与林约了晚饭', source: 'calendar' },
        { content: '她说过讨厌雨天', layer: 'lonsha' }
    ]);
    assert.equal(r.keptCount, 1, '只有非 player-only 放行');
    assert.equal(r.droppedCount, 2, 'usage-tracker 与未知来源均被挡');
    assert.equal(r.kept[0].source, 'calendar');
})

test('v3290 E2. 空与全挡不同形（本仓反复踩过的塔态）', () => {
    const A = api();
    const none = A.filterRecallForCharacter([]);
    assert.equal(none.empty, true);
    assert.equal(none.allBlocked, false);
    assert.equal(none.reason, 'no-hits');
    const all = A.filterRecallForCharacter([{ content: 'x', source: 'usage' }]);
    assert.equal(all.empty, false);
    assert.equal(all.allBlocked, true);
    assert.equal(all.reason, 'all-player-only');
    assert.notEqual(none.reason, all.reason, '两种处境必须不同形');
})

test('v3290 E3. 批量准入 + 归并：同源只计一次，拒绝分栏可归因', () => {
    const A = api();
    const b = A.admitBatch([
        { eventId: 'a', rootEventId: 'R', source: 'calendar' },
        { eventId: 'b', rootEventId: 'R', source: 'repost' },
        { eventId: 'c', source: 'quote', chatId: 'other' }
    ], { chatId: 'chat-A', revision: 7 });
    assert.equal(b.byDecision.observed, 1);
    assert.equal(b.byDecision.rejected, 2, '两条各自被拒（同源重试 + 错会话）');
    assert.equal(b.merged, 1, '同源归并恰一次');
    assert.equal(b.byReason['duplicate-event'], 1, '同源重试归因到 duplicate-event');
    assert.equal(b.byReason['session-mismatch'], 1, '错会话归因到 session-mismatch（两档不同形）');
    assert.equal(Object.keys(b.byReason).length, 2, '两条拒绝必须归因到两条不同原因');
    assert.equal(b.accepted + b.rejected, 3, '不增不减');
})

test('v3290 E4. 成对边界三态可分辨（手机单装 / 旧版 / 有能力）', () => {
    const A = api();
    assert.equal(A.probeCounterpart(null).state, 'absent');
    assert.equal(A.probeCounterpart(undefined).state, 'absent');
    assert.equal(A.probeCounterpart({}).state, 'legacy');
    assert.equal(A.probeCounterpart({ recall() {} }).state, 'legacy');
    assert.equal(A.probeCounterpart({ admitFacts() {} }).state, 'capable');
    /* 三态不同形 */
    const s = new Set([A.probeCounterpart(null).state, A.probeCounterpart({}).state, A.probeCounterpart({ admitFacts() {} }).state]);
    assert.equal(s.size, 3);
})

test('v3290 E5. 缺身份不可测如实报（不拿 false 冒充通过）', () => {
    const A = api();
    const r = A.admitNativeFact({ source: 'calendar' }, CTX);
    assert.equal(r.measurable, false, '无 eventId 必须 measurable:false');
    assert.equal(r.reason, 'missing-identity');
    assert.ok(r.notes.some((n) => n.includes('无法去重')));
})

/* ----------------------------------------------------------------
 * F. 真源码破坏（H2/H5/H6 纪律）
 *   不是在原文件上断言 —— 而是：锚点恰中 1 次 → 写破坏副本 → 在**副本**上跑
 *   同款真判据（B1 的「预测不得变已发生」）。原版通过作反向对照。
 *   锚点字面量在本层内只出现一次（H5），且判据不引用锚点串。
 * ---------------------------------------------------------------- */
test('v3290 F. 真源码破坏：拆掉「预测不升档」⇒ B1 真判据实测失败', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    /* 破坏点选「来源台账的默认状态」这一步：把台账里 predicted 读成 confirmed，
     *   predicted 来源就会被洗成已发生事实（B1 真判据必然翻红）。
     *   首版破坏点选的是「自述升档防线」—— 实测不可观测：quote 未自述时走
     *   来源默认路径，拆掉防线它照样 predicted（本仓反复踩过的不可观测型假绿）。 */
    const ANCHOR = "'traveldesk': { state: 'predicted', visibility: 'private', isFact: false },";
    const cnt = SRC.split(ANCHOR).length - 1;
    assert.equal(cnt, 1, '锚点必须恰中 1 次，实际 ' + cnt);
    /* 破坏：把升档防线整段拆掉（预测会被洗成已发生） */
    const broken = SRC.replace(ANCHOR, "'traveldesk': { state: 'confirmed', visibility: 'private', isFact: true },");
    assert.notEqual(broken, SRC, '破坏必须真发生');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3290-'));
    const p = path.join(dir, 'native-fact-admission.js');
    fs.writeFileSync(p, broken, 'utf8');
    const B = load(p);
    /* 同款真判据在破坏副本上必须失败 */
    let failed = false;
    try {
        for (const src of ['quote', 'traveldesk']) {
            const r = B.admitNativeFact({ eventId: 'e-' + src, source: src }, CTX);
            assert.equal(r.decision, 'predicted', '破坏副本应在此翻红');
            assert.equal(r.isFact, false);
        }
    } catch (_e) { failed = true; }
    assert.equal(failed, true, '破坏副本上 B1 真判据必须实测失败');
    /* 反向对照：原版同款判据必须真通过 */
    const G = api();
    assert.equal(G.admitNativeFact({ eventId: 'e-quote', source: 'quote' }, CTX).decision, 'predicted');
    /* 破坏必须可观测改行为（不是换了个写法）：被破坏的正是 traveldesk 那一行，
     *   对照也用它 —— 拿未被破坏的 quote 去当「变了」的证据就是假对照。 */
    assert.notEqual(B.admitNativeFact({ eventId: 'e-td', source: 'traveldesk' }, CTX).decision, 'predicted',
        '破坏后判决真的变了（不再是 predicted）');
    fs.rmSync(dir, { recursive: true, force: true });
})

test('v3290 G. 自防护 + 出生版本下限锚', () => {
    /* [v3.291.0 交棒] 当版锚点已由 tests/v3291_x5_knowledge_trace.test.mjs 接管。
     *   本档退回**出生版本下限锚**（与 v3264 同款交棒形态）：
     *   一抬版就必红的硬等号锚点，红的信息量只有「版本变大了」。 */
    const pkg = require(path.join(ROOT, 'package.json'));
    const pkgRaw = String(pkg.version);
    const SQ = String.fromCharCode(39);
    const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
    assert.ok(vnum(pkgRaw) >= vnum('3.290.0'), '版本不得回退到本档出生版本之前，当前 ' + pkgRaw);
    assert.ok(readFileSync(path.join(ROOT, 'index.js'), 'utf8').includes('const VERSION = ' + SQ + pkgRaw + SQ + ';'),
        'index.js 版本常量须与 package.json 同源');
    assert.ok(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8').includes('"version": "' + pkgRaw + '",'),
        'manifest.json 版本须与 package.json 同源');
    /* 面必须已进仓且不是空文件 */
    assert.ok(SRC.length > 6000, '面文件不得退化');
    /* 宿主消费点必须真接上（不是只建了模块） */
    const idx = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    assert.equal(idx.includes('LonShaNativeFactAdmission'), true, '宿主必须取库该全局');
    assert.equal(idx.includes('filterRecallForCharacter'), true, '宿主必须消费召回侧过滤');
    assert.equal(idx.includes('mobile—') || idx.includes('手机准入'), true, '诊断行必须存在');
    /* 面本身不得自带写入口（只读纪律） */
    assert.equal(/exports\.(save|write|apply|mutate)/.test(SRC), false, '只读面不得导出写口');
    assert.equal(SRC.includes('applied: true'), false, '只读面不得写 applied:true');
})
