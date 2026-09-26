// tests/v3235_sleep_awaken.test.mjs — 睡眠语义唤醒：archivedForSleep 单向门的回程 [v3.234.0]
//
// 立项依据（全部为实测读数）：
//   `archivedForSleep` 全仓 9 处引用、**归零点 0 处** —— 睡眠周期只标记不回收，
//   源码注释却写着「不物理删除…需要时可唤醒」，而 `archivedMemories` 池在全仓
//   只存在于那一行注释里。既有测试（v347_hc_mechanics / v3168_silent_degradation）
//   只钉了归档侧公式与召回过滤，**没有任何判据钉过唤醒面**。
//
// 本套件钉四件事：
//   ① 模块面：plan 只算不写 / apply 只翻标记（不删、不重排、幂等）/ 五态分形 /
//      中文分词真生效 / 不抛。
//   ② 语义面与字面面分开：有向量走余弦（mode=semantic），无向量退字面共现
//      （mode=literal，阈值下调且 result 里回显用得是哪一个）——降级必须留名。
//   ③ 宿主接线：配置键、UI 控件、取库口、index.js 真引用、manifest 注册。
//   ④ 两条通道互不顶替：`awakenByEntities` 仍只认 `dormant`（实体名逐字命中），
//      新块只认 `archivedForSleep`（语义相似）——两者各自上报。
//
// 负控制（真源码破坏 → 独立树 → 跑**同一份判据**，必须转红）：
//   N1 摘掉 apply 的翻标记 → 「apply 真翻标记」判据必红
//   N2 把中文区间从分词字符类里摘掉 → 「中文分词真生效」判据必红
//   N3 把 describe 的「候选 0 条」分支短路 → 「四态不同形」判据必红
//   形态要求：破坏锚点必须恰好命中 1 次（多于 1 次说明锚点在别处也成立，判据会被稀释）。
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, mkdtempSync, cpSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const req = createRequire(import.meta.url);

const MOD_NAME = 'sleep-awaken.js';
const MOD = path.join(ROOT, MOD_NAME);
const modSrc = readFileSync(MOD, 'utf8');
const idxSrc = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const uiSrc = readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const A = req(MOD);

const BS = String.fromCharCode(92);   // 反斜杠：判据不得写死转义层数，一律拼出来

function vnum(s) {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}
function freshPool() {
    return [
        { id: 'sum_1', floor: 10, archivedForSleep: true, text: '主角在雨夜的旧城区埋下一枚怀表作为情绪信物' },
        { id: 'sum_2', floor: 20, archivedForSleep: true, text: '两人在便利店讨论明天的行程安排' },
        { id: 'sum_3', floor: 30, archivedForSleep: false, text: '主角在雨夜埋下怀表' },
        { id: 'sum_4', floor: 40, archivedForSleep: true, text: '雨夜旧城区怀表信物被重新提起', awakened: true },
    ];
}
const QUERY = '旧城区的雨夜，怀表这个信物';

/* ══════════ 判据本体（正负控制共用同一份，不许各写一套） ══════════ */
function critTokensZh(M) {
    const tk = M.tokens('机器学习模型', 2);
    assert.ok(tk.includes('机器'), '中文双字滑窗生效（真实命中「机器」）：' + JSON.stringify(tk.slice(0, 6)));
    assert.ok(tk.length >= 5, '中文长串切出多个片段：' + tk.length);
}
function critApplyFlips(M) {
    const pool = freshPool();
    const before = pool.length;
    const plan = M.plan({ summaries: pool, queryText: QUERY });
    assert.strictEqual(plan.ok, true, 'plan 应成功');
    assert.strictEqual(plan.awakened.length, 1, '只应命中「雨夜旧城区怀表」那一条，落 ' + plan.awakened.length);
    const r = M.apply(plan, pool, 1700000000000);
    assert.strictEqual(r.applied, 1, 'apply 必须真翻一条标记，实际 ' + r.applied);
    const w = pool.find((s) => s.id === 'sum_1');
    assert.strictEqual(w.archivedForSleep, false, '被唤醒条目 archivedForSleep 必须翻成 false');
    assert.strictEqual(pool.length, before, '不删条目（长度不变）');
    assert.strictEqual(pool[0].id, 'sum_1', '不重排（首位仍是原顺序那一条）');
}
function critDescribeFours(M) {
    const a = M.describe(null);
    const b = M.describe(M.plan({}));
    const c = M.describe(M.plan({ summaries: [] }));
    const d = M.describe(M.plan({ summaries: [{ id: 'z', floor: 1, archivedForSleep: true, text: '完全无关的内容' }], queryText: '量子色动力学' }));
    const four = [a, b, c, d];
    assert.strictEqual(new Set(four).size, 4, '四态必须彼此不同形：' + JSON.stringify(four));
}

/* ══════════ 1. 分词与计分（纯函数） ══════════ */
test('v3235 1. tokens：中文按字滑窗、西文按词、minLen 生效', () => {
    critTokensZh(A);
    const en = A.tokens('Memory Engine v2', 2);
    assert.ok(en.includes('memory') && en.includes('engine'), '西文按词：' + JSON.stringify(en));
    assert.ok(!en.includes('v'), 'minLen=2 过滤单字：' + JSON.stringify(en));
    assert.deepStrictEqual(A.tokens('', 2), [], '空串零片段');
    assert.deepStrictEqual(A.tokens(null, 2), [], 'null 零片段（不抛）');
});

test('v3235 2. literalScore / cosine：有界、对称、退化不炸', () => {
    const q = A.tokens('雨夜 怀表', 2);
    const t = A.tokens('雨夜旧城区怀表', 2);
    const s = A.literalScore(q, t);
    assert.ok(s > 0 && s <= 1, '字面共现分在 (0,1]：' + s);
    assert.strictEqual(A.literalScore(q, A.tokens('完全无关的其它内容', 2)), 0, '无共现 = 0');
    assert.strictEqual(A.literalScore([], t), 0, '空查询 = 0');
    assert.strictEqual(A.cosine([1, 2, 3], [1, 2, 3]).toFixed(4), '1.0000', '同向量余弦 1');
    assert.strictEqual(A.cosine([1], [1, 2]), 0, '长度不等 = 0（判不了不猜）');
    assert.ok(Number.isFinite(A.cosine([0, 0], [0, 0])), '零向量不产生 NaN/Infinity');
    assert.strictEqual(A.cosine(null, null), 0, '缺参 = 0（不抛）');
});

test('v3235 3. poolOf：只收「已睡且未醒」的候选；非数组返回 null（与空池分形）', () => {
    assert.strictEqual(A.poolOf('nope'), null, '非数组 ⇒ null（判不了）');
    assert.strictEqual(A.poolOf(null), null, 'null ⇒ null');
    assert.deepStrictEqual(A.poolOf([]), [], '空数组 ⇒ 空（给了但 0 条 —— 与 null 不同形）');
    const got = A.poolOf(freshPool()).map((s) => s.id);
    assert.deepStrictEqual(got, ['sum_1', 'sum_2'], '排除未归档(sum_3)与已唤醒(sum_4)：' + got.join(','));
});

/* ══════════ 4. plan：只算不写 ══════════ */
test('v3235 4. plan 只算不写：池子零改动、无新字段、按分排序、maxAwaken 截断', () => {
    const pool = freshPool();
    const snap = JSON.stringify(pool);
    const r = A.plan({ summaries: pool, queryText: QUERY });
    assert.strictEqual(JSON.stringify(pool), snap, 'plan 绝不能写回（含不得新增字段）');
    assert.strictEqual(r.ok, true, 'plan ok');
    assert.strictEqual(r.pool, 2, '候选池 2 条（已归档未唤醒）');
    assert.strictEqual(r.mode, 'literal', '无向量输入 ⇒ 字面面（降级必须留名）');
    assert.ok(typeof r.degrade === 'string' && r.degrade.length > 0, '字面面必须在结果里留下降级名（不得冒充语义命中）：' + r.degrade);
    assert.ok(r.threshold < r.requestedThreshold, '字面面阈值下调且两者都回显：' + r.threshold + ' < ' + r.requestedThreshold);
    assert.strictEqual(r.awakened[0].id, 'sum_1', '命中的是情景相近那条');
    assert.strictEqual(r.awakened[0].by, 'literal', '计分来源可解释');
    assert.ok(r.awakened[0].score > 0, '带分值');
    assert.ok(typeof r.awakened[0].reason === 'string' && r.awakened[0].reason.length > 0, '带理由');
    const two = A.plan({ summaries: pool, queryText: QUERY, maxAwaken: 1 });
    assert.ok(two.awakened.length <= 1, 'maxAwaken 截断生效');
    const hi = A.plan({ summaries: pool, queryText: QUERY, threshold: 0.99 });
    assert.strictEqual(hi.awakened.length, 0, '阈值不可达 ⇒ 零命中（阈值真被消费）');
});

test('v3235 5. plan 四态分形：ok / no-pool / no-query / malformed 各不相同', () => {
    const p = freshPool();
    const mal = A.plan({ summaries: 'not-array' });
    const malNull = A.plan(null);
    const nopool = A.plan({ summaries: [] });
    const noq = A.plan({ summaries: p });
    const ok = A.plan({ summaries: p, queryText: QUERY });
    assert.strictEqual(mal.reason, malNull.reason, '两种畸形同属 malformed（同一态，不是两态）');
    const four = [mal.reason, nopool.reason, noq.reason, ok.reason];
    assert.strictEqual(new Set(four).size, 4, '四态理由必须互相可分：' + JSON.stringify(four));
    for (const r of [mal, malNull, nopool, noq]) assert.strictEqual(r.ok, false, '非 ok 态一律 ok=false');
    assert.deepStrictEqual(mal.awakened, [], '拒绝态不带命中');
    assert.strictEqual(nopool.pool, 0, 'no-pool 念出池子为空');
    assert.strictEqual(noq.pool, p.filter((s) => s.archivedForSleep && !s.awakened).length, 'no-query 仍念出候选数（区分「没给线索」与「没池子」）');
});

/* ══════════ 6. apply：唯一写点 ══════════ */
test('v3235 6. apply 只翻标记：不删、不重排、幂等、找不到落 skipped', () => {
    critApplyFlips(A);
    const pool = freshPool();
    const plan = A.plan({ summaries: pool, queryText: QUERY });
    M_applyAll(A, plan, pool, 1700000000000);
    function M_applyAll(M, pl, pl2, at) {
        const first = M.apply(pl, pl2, at);
        assert.strictEqual(first.applied, 1, '首次应用 1 条');
        const w = pl2.find((s) => s.id === 'sum_1');
        assert.strictEqual(w.awakened, true, '置 awakened');
        assert.strictEqual(typeof w.awakenReason, 'string', '记 awakenReason');
        assert.ok(Number.isFinite(w.awakenScore), '记 awakenScore');
        assert.strictEqual(w.awakenedAt, at, '记 awakenedAt（注入的时间戳，便于复算）');
        const second = M.apply(pl, pl2, at + 1);
        assert.strictEqual(second.applied, 0, '幂等：已醒条目不再被二次写');
        assert.ok(second.skipped.includes('sum_1'), '二次落 skipped 且点名 id');
        // 找不到 id ⇒ skipped（不得静默吞）
        const ghost = { ok: true, awakened: [{ id: '不存在', score: 1 }] };
        const g = M.apply(ghost, pl2, at);
        assert.strictEqual(g.applied, 0, 'id 不存在 ⇒ 不写');
        assert.deepStrictEqual(g.skipped, ['不存在'], '且点名落 skipped');
        // 拒绝态 / 畸形容器一律不写（不抛）
        assert.strictEqual(M.apply(null, pl2, at).applied, 0, 'planResult 缺失 ⇒ 不写');
        assert.strictEqual(M.apply({ ok: false, reason: 'x' }, pl2, at).applied, 0, '拒绝态 ⇒ 不写');
        assert.strictEqual(M.apply(pl, 'not-array', at).applied, 0, '池子畸形 ⇒ 不写');
        // apply 前 plan 仍然只算不写
        const p3 = freshPool();
        const snap = JSON.stringify(p3);
        A.plan({ summaries: p3, queryText: QUERY });
        assert.strictEqual(JSON.stringify(p3), snap, 'plan 之后池子逐字节未变（apply 才是唯一写点）');
    }
});

/* ══════════ 7. 语义面（有向量） ══════════ */
test('v3235 7. 有向量走余弦（mode=semantic），长度不匹配即退回字面面', () => {
    const pool = [{ id: 'v1', floor: 1, archivedForSleep: true, text: '无关文本', embedding: [1, 0, 0] }];
    const r = A.plan({ summaries: pool, queryEmbedding: [0.98, 0.02, 0] });
    assert.strictEqual(r.mode, 'semantic', '有向量 ⇒ 语义面');
    assert.strictEqual(r.awakened.length, 1, '余弦达标即命中');
    assert.strictEqual(r.awakened[0].by, 'cosine', '计分来源为余弦');
    const noMatch = A.plan({ summaries: pool, queryEmbedding: [0, 1, 0] });
    assert.strictEqual(noMatch.awakened.length, 0, '正交向量 ⇒ 零命中（阈值真被消费）');
    const mismatch = A.plan({ summaries: pool, queryEmbedding: [1, 0] });
    assert.strictEqual(mismatch.mode, 'literal', '维度不匹配 ⇒ 退回字面面（不静默按 0 分算语义）');
});

/* ══════════ 8. describe 四态 + 不抛 ══════════ */
test('v3235 8. describe 四态不同形（未跑过 / 读不到 / 候选 0 条 / 命中几条）', () => {
    critDescribeFours(A);
    assert.match(A.describe(null), /未跑过/, '未跑过要能认出来');
    const hit = A.describe(A.plan({ summaries: freshPool(), queryText: QUERY }));
    assert.match(hit, /命中 1\//, '命中态念出 x/y：' + hit);
});

test('v3235 9. 不抛：所有导出的畸形入参一律落拒绝态或中性值', () => {
    let threw = null;
    try {
        A.plan(null); A.plan(undefined); A.plan({}); A.plan({ summaries: 1 });
        A.apply(null, null); A.apply({ ok: true }, null); A.apply({ ok: true, awakened: 'x' }, []);
        A.tokens(null, null); A.tokens(undefined, undefined);
        A.literalScore(null, null); A.cosine(null, null); A.cosine(undefined, []);
        A.poolOf(3); A.describe(3); A.describe(undefined);
    } catch (e) { threw = e; }
    assert.strictEqual(threw, null, '任何畸形都不得外抛：' + (threw && threw.message));
});

/* ══════════ 10. 宿主接线（真消费点，防「导出但零调用」） ══════════ */
test('v3235 10. 宿主接线：配置键 / UI 控件 / 取库口 / index.js 真引用 / manifest 注册', () => {
    assert.match(idxSrc, /^\s{16}sleepAwakenEnabled: (true|false),/m, 'index.js config 默认值块有 sleepAwakenEnabled');
    assert.ok(/_sleepAwakenLib\s*\(\)/.test(idxSrc), '取库口函数存在');
    assert.ok(/window\.LonShaSleepAwaken/.test(idxSrc), 'index.js 真引用 window.LonShaSleepAwaken（B4 判据的消费凭据）');
    assert.ok(/return _moduleLib\(\(\) => window\.LonShaSleepAwaken, 'sleep-awaken\.js'\)/.test(idxSrc), '取库口按本仓契约写（真读表达式 + 文件名）');
    assert.ok(/ck\('sleepAwakenEnabled'/.test(uiSrc), 'settings-ui 有对应开关控件（v3113 配置覆盖度）');
    assert.ok((manifest.extra_js || []).includes(MOD_NAME), 'manifest.extra_js 已注册 ' + MOD_NAME);
    assert.ok(Number(vnum(manifest.version)) >= Number(vnum('3.234.0')), 'manifest 版本不低于本版');
});

test('v3235 11. 接线纪律：默认关零行为 + 降级留名 + 不阻断主链路', () => {
    // 开关判定必须写成「严格 true 才开」，这样缺字段的旧档 = 与既有行为完全一致
    assert.match(idxSrc, /if \(this\.config\.config\.sleepAwakenEnabled === true\)/, '严格 true 才开（旧档默认零行为）');
    // 模块缺席要留名（降级必须可辨，不得静默）
    assert.ok(idxSrc.includes('模块缺席（降级放行）'), '取库失败留名');
    assert.match(idxSrc, /catch \(e\) \{ errLog\(e, 'recallMemory\.语义唤醒'\); \}/, '整块包 try/catch，不阻断召回主链路');
    // 唤醒结果要有诊断落点（读得出来「这次有没有跑、跑出什么」）
    assert.ok(idxSrc.includes('this._sleepAwakenSt'), '唤醒状态有落点供诊断面直转');
});

test('v3235 12. 两条唤醒通道互不顶替：实体名唤醒仍只认 dormant，新块只认 archivedForSleep', () => {
    const entAt = idxSrc.indexOf('awakenByEntities(entities) {');
    assert.ok(entAt > 0, '实体名唤醒仍在场（未被新块取代）');
    const entBody = idxSrc.slice(entAt, idxSrc.indexOf('maybeFold(config, llm)', entAt));
    assert.ok(/if \(s\.dormant\)/.test(entBody), '实体名唤醒的判据仍是 dormant 标记');
    assert.ok(!/archivedForSleep/.test(entBody), '实体名唤醒**不得**被改成管 archivedForSleep（那是新块的职责）');
    const newAt = idxSrc.indexOf('sleepAwakenEnabled === true');
    assert.ok(newAt > 0, '新块在场');
    assert.ok(idxSrc.indexOf('SA.plan({ summaries: _pool') > 0, '新块用 plan 只算');
    assert.ok(idxSrc.indexOf('SA.apply(_r, _pool)') > 0, '新块用 apply 才写');
    // 归档侧本体没有被本版动过：单向门的「去程」仍在原处，本版只补回程
    assert.ok(/s\.archivedForSleep = true;/.test(idxSrc), '归档去程仍在');
    assert.ok(/filter\(i => !\(i\?\.source === 'summary' && i\?\.archivedForSleep\)\)/.test(idxSrc), '召回过滤仍在（唤醒后自然不再被过滤）');
});

/* ══════════ 负控制：真源码破坏 → 独立树 → 同一份判据必须转红 ══════════ */
function breakText(src, anchor, repl) {
    const n = src.split(anchor).length - 1;
    if (n !== 1) throw new Error('拒绝破坏：锚点命中 ' + n + ' 次（要求恰好 1 次）');
    return src.split(anchor).join(repl);
}
function mirror(breakFn) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'v3235-sa-'));
    const broken = breakFn(modSrc);
    assert.notStrictEqual(broken, modSrc, '破坏必须真的改变源码');
    writeFileSync(path.join(dir, MOD_NAME), broken);
    delete req.cache[path.join(dir, MOD_NAME)];
    return req(path.join(dir, MOD_NAME));
}
function expectRed(dir, crit, why) {
    let red = false;
    try { crit(dir); } catch (e) { red = true; }
    assert.ok(red, why);
}

test('v3235 N1. 负控制：摘掉 apply 的翻标记 ⇒ 「apply 真翻标记」判据必红', () => {
    const broken = mirror((s) => breakText(s, 's.archivedForSleep = false;', '/* 破坏：不再翻标记 */'));
    expectRed(broken, critApplyFlips, '破坏后同款判据必须转红（否则判据挂在了别的东西上）');
    // 原版上同款判据必须真（双向自证）
    critApplyFlips(A);
});

test('v3235 N2. 负控制：把中文区间从分词字符类摘掉 ⇒ 「中文分词真生效」判据必红', () => {
    const anchor = 'split(/[^0-9a-z' + BS + 'u4e00-' + BS + 'u9fff]+/g)';
    assert.strictEqual(modSrc.split(anchor).length - 1, 1, '分词正则锚点必须恰好 1 次（源文本形态自证）');
    const broken = mirror((s) => breakText(s, anchor, 'split(/[^0-9a-z]+/g)'));
    expectRed(broken, critTokensZh, '破坏后中文分词判据必须转红');
    critTokensZh(A);
});

test('v3235 N3. 负控制：把「读不到」分支改写成报「没有可审的摘要池」⇒ 两态压成一态 ⇒ 四态判据必红', () => {
    const broken = mirror((s) => breakText(s, "if (r.ok !== true) return '启动面：' + _text(r.reason || REASONS.malformed);",
        "if (r.ok !== true) return '启动面：' + REASONS['no-pool'];"));
    expectRed(broken, critDescribeFours, '破坏后四态判据必须转红（两态压成一态）');
    critDescribeFours(A);
});

test('v3235 N4. 负控制元判据：锚点不唯一时必须拒绝破坏（防判据被稀释）', () => {
    assert.throws(() => breakText(modSrc, 'function ', 'x'), /锚点命中/, '多命中锚点必须拒绝');
    assert.throws(() => breakText(modSrc, '根本不存在的字符串', 'x'), /锚点命中/, '零命中锚点必须拒绝');
});

/* ══════════ 13. 版本锚（当版 frontier 自证） ══════════ */
test('v3235 13. 版本：本套件只在 3.234.0 及以后成立（当版锚点）', () => {
    const m = /const VERSION = '([0-9.]+)'/.exec(idxSrc);
    assert.ok(m, 'index.js 必须声明 VERSION');
    assert.ok(vnum(m[1]) >= vnum('3.234.0'), '本套件出生版本 3.234.0；当前 ' + m[1]);
    assert.strictEqual(manifest.version, m[1], 'manifest 须跟随 index.js');
    assert.strictEqual(JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version, m[1], 'package.json 须跟随 index.js');
});
