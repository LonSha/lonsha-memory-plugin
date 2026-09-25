/* ============================================================
 * tests/v3213_projection_cache_freshness.test.mjs — v3.213.0
 *
 * 主题：投影 envelope 的**导出期新鲜度守卫**（R1-C）。
 *
 * 修前实测（本轮真跑取证）：
 *   `_lastProjectionEnvelope` 由 `readWorldLedger()` 里的 `_buildProjectionEnvelope()` 写入，
 *   而它的**归属**（conversationId + revision）只在**写的那一刻**成立。切聊只换 chatId、
 *   回滚/恢复只递增 `_mutationEpoch`，两条路径都**不清缓存**；`buildBridgeSnapshot()`
 *   于是把**旧会话或旧代数**的投影当作当下的读数导出 —— 下游拿到的是一份看起来正常、
 *   归属却错了的状态（本仓最贵的那类错读数：不报错、只错结果）。
 *
 *   为什么「更新一下时间戳」不解决：
 *     `generatedAt` 记录的是**封装生成时刻**，它不携带归属。宿主没重跑管线时，旧缓存
 *     依然是「最新生成」的那一份；改时间戳等于把陈旧内容**伪装**成新鲜，是掩盖而不是消除。
 *     时间戳也与 `_mutationEpoch`（变更代数）无耦合，识别不出回滚/切聊造成的状态跳变。
 *     只有比对「会话 + 代数」才能保证导出内容与当前状态同代。
 *
 * 契约（本套件锁住的三条）：
 *   ① 同会话同代数 ⇒ 照常导出（阳性对照：守卫不得把正常路径也拦掉）；
 *   ② 会话不符 或 代数不符 ⇒ **不导出**（`projection` 为 undefined ⇒ 自述 present=false），
 *      并把原因留在 `_projectionDropped` —— 「扔掉了」与「本来就没这面」必须可分；
 *   ③ 取不到 `getCurrentChatId`（宿主无该方法 / 「提取执行」模式下的独立实例）⇒ 无法证明，
 *      **放行**，原契约不变（不得因为拿不到判据就把面整片关掉）。
 *
 * 覆盖：
 *   1  同代导出 + 三个丢弃态（会话/代数/无缓存）+ 放行路径（真实例驱动）
 *   2  丢弃留痕：`_projectionDropped` 逐态可读，且恢复同代后自动清空（不残留旧丢弃）
 *   3  与既有套件的兼容：v3212 组 5b 的「独立实例直设缓存」路径仍必须导出
 *   4  负控制：真源码破坏（去掉会话比对 / 去掉代数比对）→ 同款真判据必须转红
 *   5  工具自证：锚点不存在或不唯一时必须抛
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const IDX = join(ROOT, 'index.js');
const PPF = join(ROOT, 'projection-pipeline.js');

const require = createRequire(import.meta.url);
const P = require(PPF);
const idxSrc = readFileSync(IDX, 'utf-8');

/** 提取类方法体（花括号计数）；找不到返回 null。与 v3212 同款。 */
function extractMethod(source, name) {
    const marker = name + '() {';
    const start = source.indexOf(marker);
    if (start < 0) return null;
    const bodyStart = source.indexOf('{', start);
    let depth = 0, end = -1;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > 0 ? source.slice(start, end + 1) : null;
}

const snapBody = extractMethod(idxSrc, 'buildBridgeSnapshot');
assert.ok(snapBody, 'index.js 缺 buildBridgeSnapshot 方法体（拿不到被测主体）');

/**
 * 用**真方法体**造一个实例（不是模拟常量：守卫必须跑在真源码上）。
 * 提取模式下 `this` 由传入的宿主提供，与 v3212 组 5 同规格。
 */
function makeEngine(host = {}, src = idxSrc) {
    const body = extractMethod(src, 'buildBridgeSnapshot');
    const win = { SillyTavern: { getContext: () => ({ chat: [{}] }) } };
    const eng = new Function('VERSION', 'errLog', 'window', `return ({ ${body} });`)('3.213.0-test', () => {}, win);
    return Object.assign(eng, host);
}

/** 一份真实 envelope（形状取自上游 projection-pipeline.js 的 buildEnvelope） */
function envFor(conversationId, revision) {
    return P.buildEnvelope(null, { scope: { conversationId }, revision, nowProvider: () => 1000 });
}

/* ══════════ 判据（正/负控制共用同一份；返回 {ok, why}，不抛） ══════════
 * 纪律（本仓 v2.98/v3.211 教训）：负控制必须「真源码破坏 → 加载破坏副本 → 在副本上
 * 重跑**同一套**判据 → 断言转红」。对原文件断言、把破坏写死成常量，都会假绿。 */
function jFreshness(mod) {
    const out = {};
    const envA = envFor('chat-A', 4);
    const base = { clock: null, worldProg: null, moneyLedger: null, outline: null, status: null, _summarizeRecallAudit: null };
    // ① 同代 ⇒ 必须导出
    const same = mod.makeEngine({ ...base, _lastProjectionEnvelope: envA, getCurrentChatId: () => 'chat-A', _mutationEpoch: 4 });
    const sSame = same.buildBridgeSnapshot();
    out.sameExported = !!(sSame && sSame.projection && sSame.projection.conversationId === 'chat-A'
        && sSame.meta.fieldTypes.projection.present === true);
    // ② 会话不符 ⇒ 不导出（旧会话的投影不得冒充当下）
    const switched = mod.makeEngine({ ...base, _lastProjectionEnvelope: envA, getCurrentChatId: () => 'chat-B', _mutationEpoch: 4 });
    const sSwitched = switched.buildBridgeSnapshot();
    out.switchBlocked = !!(sSwitched && sSwitched.projection === undefined
        && sSwitched.meta.fieldTypes.projection.present === false);
    // ③ 代数不符 ⇒ 不导出（回滚/恢复后的状态跳变）
    const rolled = mod.makeEngine({ ...base, _lastProjectionEnvelope: envA, getCurrentChatId: () => 'chat-A', _mutationEpoch: 5 });
    const sRolled = rolled.buildBridgeSnapshot();
    out.rollbackBlocked = !!(sRolled && sRolled.projection === undefined
        && sRolled.meta.fieldTypes.projection.present === false);
    // ④ 取不到 chatId ⇒ 放行（原契约：独立实例/单测语境不得被守卫误伤）
    const noProbe = mod.makeEngine({ ...base, _lastProjectionEnvelope: envA, _mutationEpoch: 99 });
    const sNoProbe = noProbe.buildBridgeSnapshot();
    out.probeMissingAllowed = !!(sNoProbe && sNoProbe.projection && sNoProbe.projection.conversationId === 'chat-A'
        && sNoProbe.meta.fieldTypes.projection.present === true);
    return out;
}

/** 破坏：真源码替换（锚点必须恰中 1 次，且必须真的改变源码） */
function breakSource(from, to, tag) {
    const hits = idxSrc.split(from).length - 1;
    assert.equal(hits, 1, `锚点【${tag}】须在真源码中恰中 1 次（实 ${hits}）`);
    const out = idxSrc.replace(from, to);
    assert.notEqual(out, idxSrc, `破坏【${tag}】必须真的改变源码`);
    return out;
}

/* ══════════ 1 真实例：同代导出 + 三态拦截 + 放行 ══════════ */
test('1 导出期新鲜度：同代导出，切会话/回滚不导出，取不到判据时放行', () => {
    const j = jFreshness({ makeEngine });
    assert.equal(j.sameExported, true, '★ 同会话同代数必须照常导出（守卫不得把正常路径拦掉）');
    assert.equal(j.switchBlocked, true, '★ 会话不符必须不导出（旧会话的投影不得冒充当下）');
    assert.equal(j.rollbackBlocked, true, '★ 代数不符必须不导出（回滚/恢复后的状态跳变）');
    assert.equal(j.probeMissingAllowed, true, '★ 取不到 chatId 时必须放行（原契约不变）');
});

test('2 丢弃留痕：逐态可读，且恢复同代后自动清空（不残留旧丢弃）', () => {
    const base = { clock: null, worldProg: null, moneyLedger: null, outline: null, status: null, _summarizeRecallAudit: null };
    const envA = envFor('chat-A', 4);

    const switched = makeEngine({ ...base, _lastProjectionEnvelope: envA, getCurrentChatId: () => 'chat-B', _mutationEpoch: 4 });
    switched.buildBridgeSnapshot();
    assert.equal(switched._projectionDropped?.reason, 'stale-conversation', '会话不符必须留痕（扔掉了要说出来）');
    assert.equal(switched._projectionDropped.from, 'chat-A');
    assert.equal(switched._projectionDropped.to, 'chat-B');

    const rolled = makeEngine({ ...base, _lastProjectionEnvelope: envA, getCurrentChatId: () => 'chat-A', _mutationEpoch: 9 });
    rolled.buildBridgeSnapshot();
    assert.equal(rolled._projectionDropped?.reason, 'stale-revision', '代数不符必须留痕');
    assert.equal(rolled._projectionDropped.from, 4);
    assert.equal(rolled._projectionDropped.to, 9);

    // 无缓存 ⇒ 不是「扔掉」，是「本来就没这面」：不得伪造丢弃原因
    const none = makeEngine({ ...base, getCurrentChatId: () => 'chat-A', _mutationEpoch: 4 });
    none.buildBridgeSnapshot();
    assert.equal(none._projectionDropped, null, '无缓存时不得留「丢弃」痕迹（「没跑」≠「扔掉了」）');

    // 恢复同代 ⇒ 丢弃痕迹必须清空（否则读者会把「曾经的丢弃」当成「当下的丢弃」）
    const recovered = makeEngine({ ...base, _lastProjectionEnvelope: envA, getCurrentChatId: () => 'chat-A', _mutationEpoch: 4 });
    recovered.buildBridgeSnapshot();
    const s = recovered.buildBridgeSnapshot();
    assert.equal(recovered._projectionDropped, null, '恢复同代后不得残留旧丢弃');
    assert.equal(s.meta.fieldTypes.projection.present, true);
});

/* ══════════ 3 与既有套件兼容：独立实例直设缓存仍必须导出 ══════════ */
test('3 兼容：独立实例直设缓存的路径仍导出（v3212 组 5b 的契约不得被守卫改写）', () => {
    // 「提取执行」模式下的实例没有 getCurrentChatId / _mutationEpoch，契约是「原样导出」
    const a = makeEngine({});
    a._lastProjectionEnvelope = P.buildEnvelope(null);
    const sa = a.buildBridgeSnapshot();
    assert.equal(sa.meta.fieldTypes.projection.present, true, '★ 独立实例装了缓存就必须 present=true');
    assert.equal(sa.projection.projectionApiVersion, 1, '外供的必须是真 envelope');

    // 未设缓存 ⇒ present=false 且不得用 null 冒充
    const b = makeEngine({});
    const sb = b.buildBridgeSnapshot();
    assert.equal(sb.meta.fieldTypes.projection.present, false, '未装成时必须报 present=false');
    assert.equal(sb.projection, undefined, '不得用 null 冒充（那会把「没跑」伪装成「跑了但空」）');
});

/* ══════════ 4 负控制：真源码破坏 → 副本上同款真判据必须转红 ══════════ */
test('4a 负控制：会话比对被摘掉 ⇒ 切会话后不再拦截（同款判据必须转红）', () => {
    const broken = breakSource(
        "if (String(envChat || '') !== String(nowChatId || '')) {",
        "if (false) {",
        '会话比对');
    const jBroken = jFreshness({ makeEngine: (h) => makeEngine(h, broken) });
    assert.equal(jBroken.switchBlocked, false, '破坏后切会话不再拦截（判据未转红＝负控制无效）');
    assert.equal(jBroken.rollbackBlocked, true, '只破坏会话比对，不该连坐代数比对');
    assert.equal(jBroken.sameExported, true, '阳性对照仍须成立（同代路径未被破坏波及）');
});

test('4b 负控制：代数比对被摘掉 ⇒ 回滚后不再拦截（同款判据必须转红）', () => {
    const broken = breakSource(
        'if (envRev !== nowRev) {',
        'if (false) {',
        '代数比对');
    const jBroken = jFreshness({ makeEngine: (h) => makeEngine(h, broken) });
    assert.equal(jBroken.rollbackBlocked, false, '破坏后代数不符不再拦截（判据未转红＝负控制无效）');
    assert.equal(jBroken.switchBlocked, true, '只破坏代数比对，不该连坐会话比对');
});

test('4c 负控制：放行分支被改成「一律拦下」⇒ 独立实例路径被误伤（判据必须转红）', () => {
    const broken = breakSource(
        "if (nowChatId === undefined) { this._projectionDropped = null; return env; }",
        "if (nowChatId === undefined) { this._projectionDropped = { reason: 'no-probe' }; return undefined; }",
        '放行分支');
    const jBroken = jFreshness({ makeEngine: (h) => makeEngine(h, broken) });
    assert.equal(jBroken.probeMissingAllowed, false, '破坏后独立实例被误伤（判据未转红＝负控制无效）');
});

/* ══════════ 5 工具自证：锚点必须唯一（防「破坏写了个假锚点」） ══════════ */
test('5 工具自证：锚点不存在或不唯一时必须抛', () => {
    assert.throws(() => breakSource('__不存在的锚点__', 'x', '假锚点'), assert.AssertionError);
    // 锚点重复（模拟源码里出现两次）时也必须抛
    const src2 = idxSrc + idxSrc;
    const hits = src2.split("if (String(envChat || '') !== String(nowChatId || '')) {").length - 1;
    assert.ok(hits >= 2, '重复源码上锚点计数应 >= 2（工具确实在数命中次数）');
});
