/* ============================================================
 * tests/v3212_projection_contract.test.mjs — v3.212.0
 *
 * 主题：L-F5 跨仓投影契约的**出口**这一半（投影 envelope + 契约裁定）。
 *
 * 修前实测（本轮真跑取证）：
 *   本仓 `_runProjections()` 产出的管线读数只服务**内部对读** —— 它随
 *   `readWorldLedger()` 的 opts.projection 下传一次，随后退化成 `this._lastProjection`
 *   而**没有任何外供出口**（索引器实测：`LonShaProjectionPipeline` 在产品代码里
 *   只有模块挂载点自己 1 命中；快照字面量 15 字段里无投影；桥对象只有
 *   {version, bridge, snapshot, sourceState, lastError, refresh}）。
 *   后果：用户计划书要求的「RubyPhone 只消费投影、不依赖账本内部字段」在事实上
 *   不可能 —— 下游要么读不到，要么只能去解析账本内部结构（而那是契约明令禁止的）。
 *
 * 覆盖：
 *   0  版本锚 + 三源互等
 *   1  envelope 必填字段完整（单一真源 ENVELOPE_FIELDS）
 *   2  三态 → items/visibility（absent 才 withheld，且原因必须带出）
 *   3  管线缺席**不得**伪装成「投影都是空」（available=false + reason）
 *   4  contractOf 五态可分（ok / missing / malformed / ahead / behind）
 *   5  index.js 接线：envelope 构建（真方法体驱动）+ 快照字段 + 三态自述自动覆盖
 *   6  负控制：真源码破坏 + 同款真判据重跑（三条）
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PPF = join(ROOT, 'projection-pipeline.js');
const IDX = join(ROOT, 'index.js');
const MF = join(ROOT, 'manifest.json');
const PKG = join(ROOT, 'package.json');

const req = createRequire(import.meta.url);
const P = req(PPF);
const idxSrc = readFileSync(IDX, 'utf-8');
const ppSrc = readFileSync(PPF, 'utf-8');

/** 提取类方法体（花括号计数）；找不到返回 null。 */
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

/* ══════════ 0 版本锚 + 三源互等 ══════════ */
test('0 版本锚：本套件锁自己的出生版本 v3.212.0（不随抬版上抬）', () => {
    const self = readFileSync(fileURLToPath(import.meta.url), 'utf-8');
    assert.ok(self.includes('v3.212.0'), '★ 本套件必须锁自己的出生版本 v3.212.0');
    const vSrc = (idxSrc.match(/const VERSION = '([^']+)'/) || [])[1];
    assert.ok(vSrc, 'index.js 未找到 VERSION 常量');
    const vMan = JSON.parse(readFileSync(MF, 'utf-8')).version;
    const vPkg = JSON.parse(readFileSync(PKG, 'utf-8')).version;
    assert.strictEqual(vMan, vSrc, `manifest(${vMan}) 与 index.js VERSION(${vSrc}) 漂移`);
    assert.strictEqual(vPkg, vSrc, `package(${vPkg}) 与 index.js VERSION(${vSrc}) 漂移`);
    const vnum = (s) => {
        const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s).trim());
        return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
    };
    // 形态与守卫一致（vnum 字面量下界）：本套件在交棒后即为**当版锚点**，
    //   版本守卫 V4 靠它拿基准，故不许写成自造的比较函数（那会让 V4 静默失去基准）。
    assert.ok(vnum(vSrc) >= vnum('3.212.0'), '版本不得低于出生版本 3.212.0');
});

/* ══════════ 1 envelope 必填字段完整 ══════════ */
test('1 envelope 必填字段：单一真源 11 项，构建结果逐项在场', () => {
    assert.strictEqual(P.PROJECTION_API_VERSION, 1, 'envelope 结构版必须是 1');
    assert.deepStrictEqual([...P.ENVELOPE_FIELDS], [
        'projectionApiVersion', 'projectionVersion', 'generatedAt',
        'conversationId', 'sceneId', 'worldId',
        'items', 'visibility', 'sourceLedger', 'revision', 'expiresAt',
    ], '契约字段清单漂移（改这里必须同时抬 PROJECTION_API_VERSION）');
    const env = P.buildEnvelope(null);
    for (const k of P.ENVELOPE_FIELDS) {
        assert.ok(Object.prototype.hasOwnProperty.call(env, k), '构建结果缺必填字段 ' + k);
    }
    // 两个版本必须分开：管线版跟投影增删走，结构版跟字段增删走
    assert.strictEqual(
        Object.prototype.hasOwnProperty.call(P, 'PROJECTION_VERSION'), true,
        '管线语义版必须仍导出（与结构版分开）');
});

/* ══════════ 2 三态 → items/visibility ══════════ */
test('2 三态映射：有值/源空算 given，缺席才 withheld 且必须带原因', () => {
    const env = P.envelopeOf({
        peopleLocations: () => ({ 珞珈: '钟楼' }),
        factKeys: () => [],                          // 源明确说「没有」⇒ empty ⇒ given
        characterNames: () => ['珞珈'],
        clockDay: () => 12,                          // 标量 0/非 0 都是 value
        promiseKeys: () => { throw new Error('boom'); },   // 抛错 ⇒ absent
        // knowledgeOwners 不给提供器 ⇒ absent
    }, { scope: { conversationId: 'c1' }, revision: 3, nowProvider: () => 1000 });
    assert.strictEqual(env.sourceLedger.available, true, '跑过的管线必须报 available');
    assert.strictEqual(env.visibility.peopleLocations, 'given');
    assert.strictEqual(env.visibility.factKeys, 'given', '源空是「明确的空」，不是扣下');
    assert.strictEqual(env.visibility.promiseKeys, 'withheld');
    assert.strictEqual(env.visibility.knowledgeOwners, 'withheld');
    assert.deepStrictEqual(env.items.peopleLocations, { 珞珈: '钟楼' });
    assert.deepStrictEqual(env.items.factKeys, [], '源空的项必须仍给值（空数组），不得省略');
    // 缺席原因必须可归因（不是只告诉下游「少了一项」）
    const absent = Object.fromEntries(env.sourceLedger.absent.map((a) => [a.id, a.reason]));
    assert.match(absent.promiseKeys, /thrown: boom/, '抛错的缺席必须带出原因');
    assert.strictEqual(absent.knowledgeOwners, 'no-provider', '未注册提供器与「源为空」必须可分');
    // 账目自洽必须随 envelope 带出（下游能判读数是否漏算）
    assert.strictEqual(env.sourceLedger.identity.ok, true);
    assert.strictEqual(env.sourceLedger.identity.counted, env.sourceLedger.identity.declared);
    assert.strictEqual(env.items.clockDay, 12, '标量投影必须是值本体');
    assert.strictEqual(env.revision, 3);
    assert.strictEqual(env.generatedAt, 1000);
    assert.ok(env.expiresAt > env.generatedAt, '必须给出有效期，下游据此判是否重取');
});

/* ══════════ 3 管线缺席不得伪装 ══════════ */
test('3 管线缺席：报 available=false + reason，绝不伪装成「投影都是空」', () => {
    const env = P.buildEnvelope(null, { nowProvider: () => 5 });
    assert.strictEqual(env.sourceLedger.available, false);
    assert.strictEqual(env.sourceLedger.reason, 'pipeline-absent');
    assert.deepStrictEqual(env.items, {}, '缺席时不得编造空项');
    assert.deepStrictEqual(env.visibility, {});
    // 畸形入参也必须给出结构完整的 envelope（下游不该拿到半份结构）
    for (const bad of [undefined, 42, 'x', [], { projections: 'no' }]) {
        const e = P.buildEnvelope(bad);
        for (const k of P.ENVELOPE_FIELDS) {
            assert.ok(Object.prototype.hasOwnProperty.call(e, k), '畸形入参仍须结构完整，缺 ' + k);
        }
        assert.strictEqual(e.sourceLedger.available, false);
    }
});

/* ══════════ 4 contractOf 五态可分 ══════════ */
test('4 契约裁定五态：ok / missing / malformed / ahead / behind 必须可分', () => {
    const env = P.buildEnvelope(null);
    assert.strictEqual(P.contractOf(env).reason, 'ok');
    const okEnv = P.envelopeOf({ clockDay: () => 1 }, {});
    assert.strictEqual(P.contractOf(okEnv).reason, 'ok');
    assert.strictEqual(P.contractOf(null).reason, 'malformed');
    assert.strictEqual(P.contractOf('x').reason, 'malformed');
    const missRes = P.contractOf({});
    assert.strictEqual(missRes.reason, 'missing');
    assert.strictEqual(missRes.missing.length, P.ENVELOPE_FIELDS.length, '缺字段必须逐项点名');
    assert.strictEqual(P.contractOf({ ...env, projectionApiVersion: 99 }).reason, 'ahead');
    assert.strictEqual(P.contractOf({ ...env, projectionApiVersion: 99 }).versionAhead, true);
    assert.strictEqual(P.contractOf({ ...env, projectionApiVersion: 0 }).reason, 'behind');
    // 版本对了但结构坏了也得报 malformed（不许只看版本号就放行）
    assert.strictEqual(P.contractOf({ ...env, items: 'no' }).reason, 'malformed');
    assert.strictEqual(P.contractOf({ ...env, visibility: 7 }).reason, 'malformed');
    assert.strictEqual(P.contractOf({ ...env, sourceLedger: null }).reason, 'malformed');
});

/* ══════════ 5 index.js 接线 ══════════ */
test('5 index.js 接线：真方法体驱动 envelope 构建（身份取真源、缺即 null、不抛）', () => {
    const mBody = extractMethod(idxSrc, '_buildProjectionEnvelope');
    assert.ok(mBody, 'index.js 缺 _buildProjectionEnvelope 方法（契约没有出口）');
    const mk = new Function('_projectionLib', 'errLog', `return ({ ${mBody} });`);
    const proto = mk(() => P, () => {});

    // 5a 身份三键全部来自真实来源
    const host = {
        _lastProjection: P.runPipeline({ peopleLocations: () => ({ A: 'X' }) }, { nowProvider: () => 7 }),
        _mutationEpoch: 7,
        getCurrentChatId: () => 'chat-42',
        scene: { currentKey: () => '老城/钟楼' },
        clock: { readWorldLedger: () => null },
        _buildProjectionEnvelope: proto._buildProjectionEnvelope,
    };
    const e = host._buildProjectionEnvelope();
    assert.strictEqual(e.conversationId, 'chat-42', '会话身份必须取宿主真源');
    assert.strictEqual(e.sceneId, '老城/钟楼', '场景身份必须取场景树当前位置');
    assert.strictEqual(e.worldId, 'world-ledger');
    assert.strictEqual(e.revision, 7, 'revision 必须落在既有的变更栅栏号上');
    assert.strictEqual(host._lastProjectionEnvelope, e, '必须写回缓存（快照从这里取）');
    assert.strictEqual(P.contractOf(e).reason, 'ok');

    // 5b 身份源缺失时如实 null，绝不抛、绝不编身份
    const bare = { _lastProjection: null, getCurrentChatId: () => { throw new Error('no chat'); }, scene: null, clock: null, _buildProjectionEnvelope: proto._buildProjectionEnvelope };
    const e2 = bare._buildProjectionEnvelope();
    assert.ok(e2, '缺身份源仍必须给出结构完整的 envelope');
    assert.strictEqual(e2.conversationId, null);
    assert.strictEqual(e2.sceneId, null);
    assert.strictEqual(e2.worldId, null);
    assert.strictEqual(e2.sourceLedger.available, false, '没有管线读数时必须如实报不可用');

    // 5c 模块缺席（投影模块未加载）时如实返回 null，不得伪造成「投影全空」
    const noLib = mk(() => null, () => {});
    const host3 = { _lastProjection: null, getCurrentChatId: () => 'c', scene: null, clock: null, _buildProjectionEnvelope: noLib._buildProjectionEnvelope };
    assert.strictEqual(host3._buildProjectionEnvelope(), null, '模块缺席必须返回 null（＝没跑）');
});

test('5b 快照带出投影：顶层字段 + 三态自述自动覆盖（无需另开自述通道）', () => {
    const snapBody = extractMethod(idxSrc, 'buildBridgeSnapshot');
    assert.ok(snapBody, '缺 buildBridgeSnapshot');
    const mk = new Function('VERSION', 'errLog', 'window', `return ({ ${snapBody} });`);
    const win = { SillyTavern: { getContext: () => ({ chat: [{}, {}] }) } };

    const a = mk('3.212.0-test', () => {}, win);
    a._lastProjectionEnvelope = P.buildEnvelope(null);
    const sa = a.buildBridgeSnapshot();
    assert.ok(sa.meta && sa.meta.fieldTypes && sa.meta.fieldTypes.projection, '投影必须进三态自述');
    assert.strictEqual(sa.meta.fieldTypes.projection.present, true, '装了投影时 present 必须为真');
    assert.strictEqual(sa.projection.projectionApiVersion, 1, '外供的必须是真 envelope');

    // 未跑过管线 ⇒ present=false（「本版没这面」与「跑过但空」必须可分）
    const b = mk('3.212.0-test', () => {}, win);
    const sb = b.buildBridgeSnapshot();
    assert.strictEqual(sb.meta.fieldTypes.projection.present, false, '未装成时必须报 present=false');
    assert.strictEqual(sb.projection, undefined, '不得用 null 冒充（那会把「没跑」伪装成「跑了但空」）');

    // 自述必须覆盖全部数据字段（漏字段 ⇒ 读者会以为「没有这项」）
    //   注：fieldTypes 在 `snap.meta = {...}` 赋值**之前**求值，故自述里不含 meta 自身
    //   （自指会漂移：填进去后长度又变）。这不是缺陷，是刻意的自述边界。
    const dataKeys = Object.keys(sa).filter((k) => k !== 'meta');
    for (const k of dataKeys) {
        assert.ok(k in sa.meta.fieldTypes, '顶层字段 ' + k + ' 未进类型自述');
    }
});

/* ══════════ 6 负控制：真源码破坏 + 同款真判据重跑 ══════════
 * 纪律（本仓 v2.98/v3.211 教训）：负控制必须是「真源码破坏 → 加载破坏副本 → 在副本上
 * 重跑**同一套**判据 → 断言转红」。对原文件断言、或把破坏写死成模拟常量，都会假绿。 */
function withBrokenPipeline(mutate, fn) {
    const dir = mkdtempSync(join(tmpdir(), 'lf5-neg-'));
    try {
        const broken = mutate(ppSrc);
        assert.notStrictEqual(broken, ppSrc, '破坏必须真的发生（锚点未命中）');
        const p = join(dir, 'projection-pipeline.js');
        writeFileSync(p, broken, 'utf-8');
        const mod = createRequire(import.meta.url)(p);
        return fn(mod);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test('6a 负控制：把缺席判定拆掉 ⇒ 缺席项被当成「已给出」（同款判据必须转红）', () => {
    const ANCHOR = "if (e.kind === 'absent') {";
    assert.strictEqual(ppSrc.split(ANCHOR).length - 1, 1, '锚点必须恰中 1 次');
    withBrokenPipeline((s) => s.replace(ANCHOR, 'if (false) {'), (M) => {
        const env = M.envelopeOf({
            peopleLocations: () => ({ A: 'X' }),
            promiseKeys: () => { throw new Error('boom'); },
        }, {});
        // 真判据：缺席必须 withheld + 带原因
        assert.notStrictEqual(env.visibility.promiseKeys, 'withheld',
            '破坏后缺席判定应失效（判据未转红＝负控制无效）');
        assert.strictEqual(env.sourceLedger.absent.length, 0, '缺席清单应被清空（证明判据真在读它）');
    });
});

test('6b 负控制：缺席守卫被拆 ⇒ 不再给出诚实降级（抛错或误报都算转红）', () => {
    // 为什么判据不是「available 变成 true」：把初值翻成 true 后，缺席（null）在返回值那行
    //   `(available && isPlainObject(pipeline.projections))` 不再安全短路 ⇒ 观测形态是**抛 TypeError**
    //   （即「不再诚实降级」），而不是安静地误报可用。判据因此锚在**诚实性**上：
    //   破坏后**必须**无法再得到 available=false 这一诚实读数 —— 抛错与误报都算转红。
    const ANCHOR = 'let available = false;';
    assert.strictEqual(ppSrc.split(ANCHOR).length - 1, 1, '锚点必须恰中 1 次');
    withBrokenPipeline((s) => s.replace(ANCHOR, 'let available = true;'), (M) => {
        let dishonest = false;
        try {
            const env = M.buildEnvelope(null, {});
            dishonest = !env || !env.sourceLedger || env.sourceLedger.available !== false;
        } catch (e) {
            dishonest = e instanceof TypeError; // 破坏已改变行为：不再安全降级
        }
        assert.ok(dishonest, '破坏后仍诚实报告缺席（判据未转红＝负控制无效）');
    });
});

test('6c 负控制：契约的缺字段检查被摘 ⇒ 缺字段不再被点名（判据必须转红）', () => {
    const ANCHOR = "const missing = ENVELOPE_FIELDS.filter((k) => !Object.prototype.hasOwnProperty.call(env, k));";
    assert.strictEqual(ppSrc.split(ANCHOR).length - 1, 1, '锚点必须恰中 1 次');
    withBrokenPipeline((s) => s.replace(ANCHOR, 'const missing = [];'), (M) => {
        // 缺 7 个必填字段、但版本号与三个容器都在的对象
        const partial = { projectionApiVersion: 1, items: {}, visibility: {}, sourceLedger: {} };
        // 同款真判据：缺字段必须报 missing
        assert.notStrictEqual(M.contractOf(partial).reason, 'missing',
            '破坏后缺字段被放行（判据未转红＝负控制无效）');
        assert.strictEqual(M.contractOf(partial).reason, 'ok', '破坏后应误判为可用');
    });
});