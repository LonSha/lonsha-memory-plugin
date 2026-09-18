// tests/v3168_silent_degradation.test.mjs
// LonSha 记忆引擎 v3.168.0 主题：静默降级面 ——「不是报错，是悄悄换了一条更差的路」
//
// 覆盖三处已实证缺陷与两项常驻不变量，全部按**不变量**断言（不绑当时的代码形状）：
//   A 携带契约：I3 写侧产出 ⊇ 契约清单 · 读侧消费 ⊆ 写侧产出（死分支消除）·
//               对账必须跑在真实产出对象上（不是让校验方法在真源之外空跑）· 读侧对账记录
//   B 种子同源：生成侧产出 ⊇ 导入侧消费 · 九个子系统逐项独立 try
//   C 降级必有计数（I4）：嵌入四条降级路径各自计数（行为真执行）· GC 分路账本
//   D 睡眠校准仅读：不删、不标记、不抛
//   E 总账与诊断：聚合七类退化 · selfCheck 行非空壳 · 发布卫生（四处同步 + 交棒）
//
// 本版最要紧的一条纪律写在测试里：**判据自己也必须能被证伪**。
//   故每个判定都在 tests 末尾配一次负控制（故意改坏一份夹具，看判据是否真的响）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = '/home/user/lonsha-memory-plugin';
const idx = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const sui = readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');

function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}
const curV = /const VERSION = '([0-9.]+)'/.exec(idx)[1];
const cur = vnum(curV);

/** 抽出 `name(...) { ... }` 的完整方法体（附字符串/注释感知的括号配对） */
function methodSpan(src, marker) {
    const at = src.indexOf(marker);
    assert.ok(at > 0, '未找到方法：' + marker);
    // 从 marker 末尾之后找体花括号：形参里可能自带 {}（如 options = {}），
    //   直接用 indexOf('{', at) 会命中形参里的那个，导致深度配对错位。
    const open = src.indexOf('{', at + marker.length - 1);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        const ch = src[i];
        if (ch === "'" || ch === '"' || ch === '`') {
            const q = ch; i++;
            while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
        } else if (ch === '/' && src[i + 1] === '/') {
            while (i < src.length && src[i] !== '\n') i++;
        } else if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return { at, body: src.slice(open + 1, i) }; }
    }
    throw new Error('方法未闭合：' + marker);
}
/** 从 src[from..] 里的 `{ ... }` 对象字面量中，按指定缩进抽顶层键 */
function objectKeys(src, from, indent) {
    const open = src.indexOf('{', from);
    assert.ok(open > from, '对象字面量未找到');
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        const ch = src[i];
        if (ch === "'" || ch === '"' || ch === '`') {
            const q = ch; i++;
            while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
        } else if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    assert.ok(end > open, '对象字面量未闭合');
    const block = src.slice(open, end + 1);
    // 顶层键的两种写法：`key: value,` 与简写 `key,`（statusFlat 就是简写，
    //   只认冒号会把它漏掉——正是本轮缺陷的成因之一，判据自己不能再犯）。
    const re = new RegExp('^\\s{' + indent + '}([A-Za-z_][A-Za-z0-9_]*)\\s*[,:]', 'gm');
    return [...block.matchAll(re)].map(m => m[1]);
}
/** 判定：读侧消费了写侧从不产出的键（死分支） */
const deadBranches = (produced, read) => [...read].filter(k => !produced.includes(k)).sort();

/* ══════════════ A. 携带契约（I3） ══════════════ */
const contractAt = idx.indexOf('const CARRYOVER_CONTRACT_KEYS');
const contractKeys = [...idx.slice(contractAt, idx.indexOf(']);', contractAt)).matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)].map(m => m[1]);
const packSpan = methodSpan(idx, 'packCarryover()');
const producedKeys = objectKeys(packSpan.body, packSpan.body.indexOf('const _pack = {'), 20);
const applySpan = methodSpan(idx, 'applyCarryover(pack)');
const readKeys = new Set([...applySpan.body.matchAll(/pack\??[.]([A-Za-z_][A-Za-z0-9_]*)/g)].map(m => m[1]));
/** 修复前读侧有分支、写侧从不产出的十个键（缺陷指纹） */
const FORMER_DEAD = ['moneyLedger', 'cards', 'conflicts', 'deltaBook', 'cse', 'pulse', 'opLog', 'outline', 'pairMem', 'statusFlat'];

test('v3.168 A 契约清单非退化，且两侧共用同一份真源', () => {
    assert.ok(contractKeys.length >= 20, '契约清单异常（' + contractKeys.length + ' 键）');
    assert.ok(contractKeys.includes('statusFlat'), '契约必须含 statusFlat');
    const at = idx.indexOf('CARRYOVER_CONTRACT_KEYS.filter');
    assert.ok(at > 0, '契约清单必须被 filter 消费（两侧对账都用它，而非各写一份字面量）');
});

test('v3.168 A I3：写侧产出必须覆盖契约清单', () => {
    const missing = contractKeys.filter(k => !producedKeys.includes(k));
    assert.deepStrictEqual(missing, [], '写侧未产出契约键：' + missing.join('/'));
});

test('v3.168 A I3b：读侧消费的键必须全部有写侧产出（死分支消除）', () => {
    // 这条是缺陷的直接否定：修复前读侧 22 键、写侧 15 键，差集 10 个
    //   ——「导入分支写好、写侧从不产出」= 一次成功的失败声明。
    assert.deepStrictEqual(deadBranches(producedKeys, readKeys), [], '存在死分支');
});

test('v3.168 A 缺陷指纹：修复前十个死分支如今两侧都在', () => {
    for (const k of FORMER_DEAD) {
        assert.ok(producedKeys.includes(k), k + ' 未在写侧产出');
        assert.ok(readKeys.has(k), k + ' 未在读侧被消费');
    }
    assert.equal(FORMER_DEAD.length, 10, '缺陷指纹不得被缩水');
});

test('v3.168 A 对账必须跑在真实产出对象上（不是让校验方法在真源之外空跑）', () => {
    const callAt = packSpan.body.indexOf('verifyCarryoverPack(_pack)');
    const retAt = packSpan.body.indexOf('return _pack');
    assert.ok(callAt > 0, 'packCarryover 必须真的调用对账（否则 _lastCarryoverReport 永远为空）');
    assert.ok(retAt > callAt, '对账必须发生在 return 之前');
    assert.ok(!/catch \(e\) \{ return null; \}/.test(packSpan.body.slice(-200)), '打包失败也必须留痕（errLog）');
});

test('v3.168 A verifyCarryoverPack 行为：缺键必须报出，齐键必须放行', () => {
    const vs = methodSpan(idx, 'verifyCarryoverPack(pack)');
    const fn = new Function('CARRYOVER_CONTRACT_KEYS', 'PLUGIN_NAME', 'errLog', 'console',
        'return function (pack) {' + vs.body + '}')(
        Object.freeze(['a', 'b', 'c']), 'T', () => {}, { warn() {} });
    const miss = fn.call({}, { a: 1 });
    assert.equal(miss.ok, false, '缺键必须 ok=false');
    assert.deepStrictEqual(miss.missingWrite, ['b', 'c'], '须逐键列出缺了什么');
    const full = fn.call({}, { a: 1, b: 2, c: 3 });
    assert.equal(full.ok, true, '齐键必须 ok=true');
    assert.deepStrictEqual(full.missingWrite, []);
    const thrown = fn.call({}, null);   // 永不抛出
    assert.equal(thrown.ok, false);
});

test('v3.168 A 读侧对账：导入必须登记实收与缺键（旧包不得静默跳过）', () => {
    assert.ok(/this\._lastCarryoverImport = \{/.test(applySpan.body), '读侧须登记对账对象');
    assert.ok(applySpan.body.includes('missingRead'), '读侧须记录缺键清单');
    assert.ok(/carryoverContractStrict !== false/.test(applySpan.body), '严格模式须门控告警');
    const warnAt = applySpan.body.indexOf('console.warn');
    assert.ok(warnAt > 0, '缺键必须打告警（不能只在对象里留痕）');
});

test('v3.168 A 新配置的可达性（v3.160/v3.161 两条不变量在此重合）', () => {
    const cfgAt = idx.indexOf('this.config = {');
    const cfg = idx.slice(cfgAt, idx.indexOf('\n            };', cfgAt));
    assert.ok(/^\s+carryoverContractStrict: true,/m.test(cfg), '必须进 defaults 声明（读取而未声明 = 静默回退硬编码值）');
    assert.ok(idx.includes('this.config.config.carryoverContractStrict'), '必须被引擎真实读取');
    assert.ok(sui.includes("ck('carryoverContractStrict'"), '必须在面板有控件（无控件又无卡白名单 = 旋钮不存在）');
});

/* ══════════════ B. 种子路径同源 ══════════════ */
const seedSpan = methodSpan(idx, 'generateCarryoverSeed(options = {})');
const seedOut = objectKeys(seedSpan.body, seedSpan.body.indexOf('return {'), 20);
const seedImpSpan = methodSpan(idx, 'importCarryoverSeed(seed, options = {})');
const seedRead = new Set([...seedImpSpan.body.matchAll(/seed\??[.]([A-Za-z_][A-Za-z0-9_]*)/g)].map(m => m[1]));
const SUB_SYSTEMS = ['moneyLedger', 'cards', 'conflicts', 'deltaBook', 'cse', 'pulse', 'opLog', 'outline', 'pairMem'];

test('v3.168 B 种子产出必须覆盖导入侧消费（第二条承接通道同源）', () => {
    const missing = [...seedRead].filter(k => k !== 'type' && k !== 'version' && !seedOut.includes(k)).sort();
    assert.deepStrictEqual(missing, [], '导入侧消费但生成侧不产出：' + missing.join('/'));
});

test('v3.168 B 九个子系统在种子两侧都在，且逐项独立 try', () => {
    for (const k of SUB_SYSTEMS) {
        assert.ok(seedOut.includes(k), '生成侧未产出 ' + k);
        assert.ok(seedImpSpan.body.includes("'" + k + "'"), '导入侧未消费 ' + k);
    }
    assert.ok(/for \(const \[key, getter\] of _subSystems\)/.test(seedImpSpan.body), '须经统一循环消费');
    assert.ok(/catch \(e\) \{ errLog\(e, 'importCarryoverSeed\.' \+ key\); \}/.test(seedImpSpan.body),
        '每项独立 try：一个子系统接口不符不得撤销整个种子');
});

test('v3.168 B statusFlat 结构化还原（种子侧的「角色状态表」）', () => {
    assert.ok(seedOut.includes('statusFlat'), '种子须产出 statusFlat');
    assert.ok(seedSpan.body.includes('this.status?.characters'), '须从真源 status.characters 扁平化');
    assert.ok(seedImpSpan.body.includes('statusFlat'), '导入侧须应用 statusFlat');
});

test('v3.168 B 空种子必须有失败出口（v3.165 的判据不得被本版改坏）', () => {
    assert.ok(/if \(!_applied\.length\)/.test(seedImpSpan.body), '空种子须以失败结尾');
    // 判据按控制流位置断言：`if (!_applied.length) { … return false; }` 在成功日志
    //   与最终 return true 之前。只是比较两个 indexOf 会被「后面还有别的 return false」骗过。
    const guard = seedImpSpan.body.indexOf('if (!_applied.length)');
    const guardFalse = seedImpSpan.body.indexOf('return false', guard);
    const successLog = seedImpSpan.body.indexOf('✓ 跨会话 Carryover 种子导入成功');
    const finalTrue = seedImpSpan.body.lastIndexOf('return true');
    assert.ok(guardFalse > guard, '空种子分支须返回 false');
    assert.ok(successLog > guardFalse, '成功日志必须排在空种子出口之后');
    assert.ok(finalTrue > guardFalse, '有内容种子仍须报成功');
});

/* ══════════════ C. 降级必有计数（I4） ══════════════ */
const embedSpan = methodSpan(idx, 'getEmbedding(text)');
function embedRunner(cfg, fetchImpl, storeGet) {
    const self = {
        _embedDegrade: undefined,
        config: { config: cfg || {} },
        embedCache: new Map(),
        dimension: 8,
        simpleEmbedding: () => [0, 0, 0],
    };
    const fn = new Function('hash32', 'PLUGIN_NAME', 'fetchWithTimeoutRetry', 'localStorage', 'console',
        'return async function (text) {' + embedSpan.body + '}')(
        () => 12345, 'T', fetchImpl, { getItem: () => storeGet || '' }, { warn() {}, log() {}, error() {} });
    return { self, fn };
}

test('v3.168 C I4：嵌入四条降级路径各自计数（行为真执行）', async () => {
    // 路径 1：无密钥
    const a = embedRunner({}, async () => { throw new Error('不应被调用'); });
    await a.fn.call(a.self, '文本');
    assert.equal(a.self._embedDegrade.noKey, 1, '无密钥未计数');
    // 路径 2：API 返 error
    const b = embedRunner({ apiKey: 'k', embeddingModel: 'm' }, async () => ({ json: async () => ({ error: { message: 'bad' } }) }));
    await b.fn.call(b.self, '文本');
    assert.equal(b.self._embedDegrade.apiError, 1, 'API 报错未计数');
    // 路径 3：返回体缺 embedding
    const c = embedRunner({ apiKey: 'k', embeddingModel: 'm' }, async () => ({ json: async () => ({ data: [] }) }));
    await c.fn.call(c.self, '文本');
    assert.equal(c.self._embedDegrade.missingVector, 1, '缺向量未计数');
    // 路径 4：异常
    const d = embedRunner({ apiKey: 'k', embeddingModel: 'm' }, async () => { throw new Error('boom'); });
    await d.fn.call(d.self, '文本');
    assert.equal(d.self._embedDegrade.exception, 1, '异常未计数');
});

test('v3.168 C I4 负向：正常拿到真向量时不得计数（判据不得虚报）', async () => {
    const e = embedRunner({ apiKey: 'k', embeddingModel: 'm' },
        async () => ({ json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }) }));
    const v = await e.fn.call(e.self, '文本');
    assert.deepStrictEqual(v, [0.1, 0.2], '真向量须原样返回');
    assert.deepStrictEqual(e.self._embedDegrade, { noKey: 0, apiError: 0, missingVector: 0, exception: 0 }, '正常路径不得记账');
});

test('v3.168 C GC 分路账本：删除必须分路留数', () => {
    assert.ok(idx.includes('this._lastGcLedger = _gcLedger'), '须挂账本');
    for (const k of ['vecDup', 'vecCap', 'sumCap', 'orphanOps', 'graphDup']) {
        assert.ok(idx.includes('_gcLedger.' + k + ' ='), k + ' 无分路赋值（账本字段成了空壳）');
    }
    assert.ok(/if \(removed\) \{/.test(idx), '有删除才落账（零删除不留噪）');
});

test('v3.168 C 落账用 OpLog 的真实 API（本版初稿误用不存在的 push）', () => {
    assert.ok(!/this\.opLog\?*\.push\(/.test(idx), 'OpLog 没有 push()，只有 log()');
    assert.ok(/this\.opLog\?\.log\('gc', 'remove',/.test(idx), '回收账本须经 log(type, op, ref, floor, meta) 落账');
});

/* ══════════════ D. 睡眠校准仅读 ══════════════ */
const calSpan = methodSpan(idx, 'calibrateRetention(maxScan = 2000)');
function calRunner(summaries) {
    const self = { summary: { summaries }, _lastRetentionCalibration: null };
    const fn = new Function('errLog', 'return function (maxScan) {' + calSpan.body + '}')(
        () => { throw new Error('校准器不得抛错入账'); });
    return { self, fn };
}

test('v3.168 D 睡眠校准只清点：不删、不标记、不抛', () => {
    const day = 86400000;
    const summaries = [
        // 已睡但重要度中等：只计 dormant，不该落进 lowValueStale
        { floor: 1, text: '睡了', archivedForSleep: true, createdAt: Date.now() - 100 * day, importance: 5 },
        { floor: 2, text: '陈年高价值', createdAt: Date.now() - 40 * day, importance: 9 },
        { floor: 3, text: '陈年低价值', createdAt: Date.now() - 40 * day, importance: 1 },
        { floor: 4, text: '新鲜', createdAt: Date.now(), importance: 5 },
    ];
    const snapshot = JSON.parse(JSON.stringify(summaries));
    const { self, fn } = calRunner(summaries);
    const out = fn.call(self, 2000);
    assert.equal(out.total, 4, '清点总数');
    assert.equal(out.dormant, 1, '已睡条目');
    assert.equal(out.ancientHighValue, 1, '超 30 天且重要度 >= 8（不该被上限误杀的历史锚点）');
    assert.equal(out.lowValueStale, 1, '超 30 天且重要度 < 4（下次回收首选）');
    assert.deepStrictEqual(summaries, snapshot, '只读不写：不得删除、不得新增标记字段');
    assert.ok(self._lastRetentionCalibration && self._lastRetentionCalibration.total === 4, '须挂取用点供诊断读取');
});

test('v3.168 D 校准臂真的接在睡眠周期上', () => {
    // 用带花括号的标记取体，避免命中调用点 `this.sleepCycle();` 之后的无关花括号
    const sp = methodSpan(idx, 'sleepCycle() {');
    assert.ok(sp.body.includes('this.calibrateRetention()'), '睡眠周期须调用校准臂（否则积压永远无人看得见）');
    assert.ok(sp.body.includes('sleepCycle.calibrate'), '校准失败不得反噬睡眠主流程（须自带失败出口）');
});

/* ══════════════ E. 总账与诊断 ══════════════ */
const ledgerSpan = methodSpan(idx, 'getDegradationLedger()');

test('v3.168 E 静默降级总账：聚合各类退化，且全洁时 degraded=0', () => {
    const build = (self) => new Function('errLog', 'return function () {' + ledgerSpan.body + '}')(() => {});
    const clean = {
        vector: {}, config: { config: {} }, cse: {}, _ledgerViolationSummary: () => '—',
        _lastGcLedger: null, _lastRetentionCalibration: null, _lastCarryoverReport: null,
    };
    const r0 = build(clean).call(clean);
    // 常驻 6 行；台账写入违规行仅在真有违规摘要时才出现（零噪音原则）
    assert.ok(Array.isArray(r0.rows) && r0.rows.length >= 6, '须聚合 >= 6 类常驻（实际 ' + r0.rows.length + '）');
    assert.equal(r0.degraded, 0, '全洁时不得报退化');
    assert.equal(r0.ok, true);
    // 七类齐备：末一类是条件行，给它一个真摘要就必须出现
    const withViol = Object.assign({}, clean, { _ledgerViolationSummary: () => 'item_dropped: missing_name ×2' });
    const rv = build(withViol).call(withViol);
    assert.ok(rv.rows.length > r0.rows.length, '有违规摘要时须多出「台账写入违规」行');
    assert.equal(rv.degraded, 1, '违规须计入退化数');
    const dirty = Object.assign({}, clean, {
        vector: { _embedDegrade: { noKey: 2, apiError: 0, missingVector: 0, exception: 1 } },
        _lastGcLedger: { vecDup: 3, vecCap: 0, sumCap: 0, orphanOps: 0, graphDup: 0 },
        _lastCarryoverReport: { missingWrite: ['cards', 'pulse'] },
    });
    const r1 = build(dirty).call(dirty);
    assert.equal(r1.degraded, 3, '三类退化须被计到（嵌入/回收/契约缺键）');
    assert.equal(r1.ok, false, '有退化时 ok 必须为 false');
    const hot = r1.rows.filter(x => x.value > 0).map(x => x.name);
    assert.ok(hot.includes('嵌入降级') && hot.includes('记忆回收') && hot.includes('携带契约缺键'), '须逐类具名');
});

test('v3.168 E 总账永不抛出（诊断不得反噬主流程）', () => {
    const build = (self) => new Function('errLog', 'return function () {' + ledgerSpan.body + '}')(() => {});
    const hostile = {
        get vector() { throw new Error('hostile'); },
        config: null, cse: null, _ledgerViolationSummary: () => { throw new Error('x'); },
    };
    const r = build(hostile).call(hostile);
    assert.ok(r && Array.isArray(r.rows), '须降级返回对象而不是抛出');
    assert.equal(r.ok, false, '出错时不得声称健康（未走完不得以 undefined 结尾）');
    // 缺 config 的宿主：不得因访问 config._lastMigrationReport 而抛出
    const noCfg = build({});
    const r2 = new Function('errLog', 'return function () {' + ledgerSpan.body + '}')(() => {}).call({});
    assert.ok(r2 && Array.isArray(r2.rows), '缺 config/子系统的宿主也必须拿到报告');
    assert.equal(r2.ok, false);
});

test('v3.168 E selfCheck 的携带契约行不是空壳', () => {
    assert.ok(idx.includes("errLog(e, 'selfCheck.carryover')"), '须有专属异常出口');
    assert.ok(idx.includes("['携带契约',"), '须真的 return 一行（只在注释里提到不算可见性）');
    assert.ok(idx.includes('CARRYOVER_CONTRACT_KEYS.length'), '分母须来自契约真源，不得写死');
    assert.ok(idx.includes('this._lastCarryoverReport'), '须读对账报告');
    assert.ok(idx.includes('this.config.config.carryoverContractStrict !== false'), '严格模式须真的影响呈现');
});

/* ══════════════ F. 负控制（判据必须能被证伪） ══════════════ */
test('v3.168 F 负控制：把 moneyLedger 从写侧抹掉，I3b 必须响', () => {
    const broken = producedKeys.filter(k => k !== 'moneyLedger');
    const dead = deadBranches(broken, readKeys);
    assert.ok(dead.includes('moneyLedger'), '判据应当检出被抹掉的产出键');
    assert.ok(!deadBranches(producedKeys, readKeys).length, '原始源码上不得有死分支（否则判据恒真）');
});

test('v3.168 F 负控制：契约清单多一个键，I3 必须响', () => {
    const widened = contractKeys.concat(['noSuchSubSystem']);
    const missing = widened.filter(k => !producedKeys.includes(k));
    assert.deepStrictEqual(missing, ['noSuchSubSystem'], '判据应当检出未产出项');
});

test('v3.168 F 负控制：把 verify 调用删掉，A 的「真跑」断言必须响', () => {
    const broken = packSpan.body.replace('this.verifyCarryoverPack(_pack);', '');
    assert.ok(!broken.includes('verifyCarryoverPack(_pack)'), '夹具确实被改坏');
    assert.ok(packSpan.body.includes('this.verifyCarryoverPack(_pack);'), '原始源码必须真的调用（否则该断言无意义）');
});

test('v3.168 F 负控制：把嵌入计数删掉，I4 必须响', async () => {
    const noCount = embedSpan.body.replace(/this\._embedDegrade\.noKey\+\+;/g, '');
    assert.ok(!noCount.includes('this._embedDegrade.noKey++'), '夹具确实被改坏');
    const self = { config: { config: {} }, embedCache: new Map(), dimension: 8, simpleEmbedding: () => [0] };
    const fn = new Function('hash32', 'PLUGIN_NAME', 'fetchWithTimeoutRetry', 'localStorage', 'console',
        'return async function (text) {' + noCount + '}')(
        () => 1, 'T', async () => { throw new Error('x'); }, { getItem: () => '' }, { warn() {} });
    await fn.call(self, '文本');
    assert.notEqual(self._embedDegrade && self._embedDegrade.noKey, 1, '删掉计数后应当检不出——这正是该断言的价值');
});

/* ══════════════ G. 发布卫生 ══════════════ */
test('v3.168 G 版本四处同步 + 顶节是本版', () => {
    assert.equal(manifest.version, curV, 'manifest 同版');
    assert.equal(pkg.version, curV, 'package 同版');
    assert.ok(changelog.startsWith('## v' + curV), 'CHANGELOG 顶节须是本版');
    assert.ok(vnum(curV) >= vnum('3.170.0'), '本版不得低于 3.168.0');
});

test('v3.168 G CHANGELOG 须说清本版主线与承接关系', () => {
    assert.ok(changelog.includes('静默降级'), '须记录「静默降级面」主线');
    assert.ok(changelog.includes('携带契约'), '须点名携带契约缺陷');
    assert.ok(/v3[.]167/.test(changelog), '须说清与上一版的承接关系');
    assert.ok(changelog.includes('I3') && changelog.includes('I4'), '须写明本版两条不变量');
});

test('v3.168 G 旧锚点已交棒（不得停在上一版字符串上）', () => {
    for (const f of ['v3117_diagnostics', 'v3130_control_plane', 'v3147_cooldown_and_dual_hash']) {
        const t = readFileSync(path.join(ROOT, 'tests', f + '.test.mjs'), 'utf8');
        const hits = [...t.matchAll(/'(3[.][0-9]+[.][0-9]+)'/g)].map(m => m[1]);
        assert.ok(hits.length > 0, f + ' 仍应锚着版本字符串');
        assert.ok(hits.every(h => vnum(h) >= cur), f + ' 的锚点未交棒（' + hits.join(',') + '）');
    }
});

test('v3.168 G 当版独占交出：上一版文件的下界必须 >= 本版', () => {
    for (const f of ['v3160_config_declaration_gap', 'v3161_config_reachability', 'v3162_ui_binding_hygiene',
        'v3163_module_wiring', 'v3164_event_lifecycle', 'v3165_claim_truthfulness',
        'v3166_config_migration_write_ledger', 'v3167_cse_capacity_identity']) {
        const t = readFileSync(path.join(ROOT, 'tests', f + '.test.mjs'), 'utf8');
        const hits = [...t.matchAll(/vnum\('(\d+[.]\d+[.]\d+)'\)/g)].map(m => vnum(m[1]));
        assert.ok(hits.length > 0, f + ' 应有版本下界断言');
        assert.ok(hits.every(h => h >= cur), f + ' 的版本下界落后于现版 ' + curV);
    }
});

test('v3.168 G 本版审计面与非退化自证', () => {
    const self = readFileSync(new URL(import.meta.url), 'utf8');
    const nAssert = (self.match(/assert[.]/g) || []).length;
    assert.ok(nAssert >= 70, '断言数不得缩水（>= 70），实际 ' + nAssert);
    assert.ok(self.includes('FORMER_DEAD'), '缺陷指纹表必须留在文件里');
    assert.ok(self.includes('负控制'), '负控制段必须留在文件里（判据也要能被证伪）');
});
