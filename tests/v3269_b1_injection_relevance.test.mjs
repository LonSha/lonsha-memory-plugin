/* ============================================================
 * tests/v3269_b1_injection_relevance.test.mjs — [v3.268.0 · B1 注入质量：真实 → 相关]
 *
 * 主题：把「词表扩表真的让召回更相关了吗」变成**可解释 + 可双向证明**的判据。
 *
 * 修前实测（本轮真跑取证，不是读源码推算）：
 *   ① 计划字面写「5 项 known-gap」，磁盘实测是 **4 条**（eval-corpus 三条 +
 *      story-eval 的 gp2，后者是 kind=gap 的紧凑行）。少的那一条不是漏项，是口径差。
 *   ② 探针实验（/tmp 探针，本轮真跑）：**只扩 EMO_LEXICON** ⇒ 11 个样本读数
 *      一字未变。根因：反向线索不直读词表，而是 opposedWordsFor(dim) 经
 *      EMOTION_OPPOSITES 汇出 —— 只加词、不加映射 ⇒ 该词对反向召回**零影响**。
 *      这就是本档的存在理由：一个「扩了但没生效」的改动，此前全仓没有任何读数会响
 *      （词表漂移门禁会因基线更新而放行，缺口台账会因样本转正而变空 —— 两者都不看
 *      「这个新词到底有没有被消费面用到」）。
 *   ③ 扩表 + 映射后：三条缺口 want/hit 全齐，gap-aggregate-emotion 的可信主导维
 *      由误判的 fear（被「发抖」抢走）修正为 anger（「气得」权重 3）。修的是词表覆盖，
 *      **不是放宽判据** —— 期望集一个字没动。
 *
 * 覆盖：
 *   A 机制串联（词表 → 映射 → 可信主导维 → 极性 → 反对词面 → 命中）逐样本可解释
 *   B 扩表可达（新词必须真被消费面用到：作反向键或作反向值）
 *   C ★双向证明（真源码降级副本上重跑同一份评测 ⇒ 缺口必须真的回来；原件上必须齐）
 *   D 缺口归零与反坐实（与 v3193 / v3250 同口径交叉复验）
 *   E 工具两向自证 + 两张台账 + 版本锚
 *
 * 口径纪律：本档一律锁**结构面与归因链**，不锁耗时/时刻值（值断言必 flaky）。
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ok = (m) => console.log('  ✓ ' + m);
const req = createRequire(import.meta.url);
const NP = req(path.join(ROOT, 'narrative-pulse.js'));
const EC = req(path.join(ROOT, 'tests', 'fixtures', 'eval-corpus.js'));
const NP_SRC = read('narrative-pulse.js');

const DIMS = ['joy', 'sad', 'fear', 'anger', 'warm', 'tense'];
/* 极性表**未导出**：从真源正则抽取（与 scan_v3193_lexicon_drift 同口径）。
 *   抽不到即抛 —— 「读取面漂移」必须 fail-closed，不能静默当成「极性没问题」。 */
const POL = (function () {
    const m = /const EMO_POLARITY = \{([^}]*)\}/.exec(NP_SRC);
    if (!m) throw new Error('narrative-pulse.js 里找不到 EMO_POLARITY（读取面漂移）');
    const out = {};
    for (const p of m[1].split(',')) {
        const kv = p.split(':');
        if (kv.length === 2 && kv[0].trim()) out[kv[0].trim()] = Number(kv[1]);
    }
    return out;
})();
const MAIN = EC.CORPUS.filter((c) => !c.gap);
const detailOf = (r) => {
    const by = {};
    for (const x of r.metrics.oppositeHitDetail) by[x.cls] = x;
    return by;
};

/* ══════════ A 机制串联：链上每一环都必须在场且可解释 ══════════ */

test('A1. 机制面齐备：六维词表 + 反向映射 + 六维极性 + 反对词面入口', () => {
    for (const d of DIMS) assert.ok(NP.EMO_LEXICON[d] && Object.keys(NP.EMO_LEXICON[d]).length > 0, '词表维缺失：' + d);
    assert.ok(Object.keys(NP.EMOTION_OPPOSITES).length >= 30, '反向映射过少：' + Object.keys(NP.EMOTION_OPPOSITES).length);
    assert.equal(typeof NP.opposedWordsFor, 'function', 'opposedWordsFor 必须导出（反向词面的唯一入口）');
    assert.deepEqual(Object.keys(POL).sort(), DIMS.slice().sort(), '极性六维必须齐 —— 缺一维，该维永不参与反向召回');
    assert.ok(POL.sad < 0 && POL.fear < 0 && POL.anger < 0, '三个负面维极性必须 < 0');
    assert.equal(POL.tense, 0, 'tense 极性 0（氛围不是情绪倾向）—— 有意取舍，A4 据此判「可见」而不是「不许有」');
    ok('六维词表 + 映射 ' + Object.keys(NP.EMOTION_OPPOSITES).length + ' 键 + 极性六维齐');
});

test('A2. ★★★ 逐样本可解释：每条期望 key 的正文都必须落在「反对词面」上（不是碰巧命中）', () => {
    let explained = 0, total = 0;
    for (const s of MAIN) {
        if (!s.expect || !s.expect.length) continue;
        const emo = NP.scanEmotion(s.queryText);
        const dom = emo.trustedDominant;
        assert.ok(dom && POL[dom] < 0,
            s.cls + ' 期望出线索，可信主导维却是 ' + dom + '（极性 ' + POL[dom] + '）—— 该响时没响');
        const face = NP.opposedWordsFor(dom);
        assert.ok(face.length > 0, s.cls + ' 的主导维 ' + dom + ' 反对词面为空');
        for (const k of s.expect) {
            total++;
            const d = (s.docs || []).find((x) => x.key === k);
            assert.ok(d, s.cls + ' 的期望 key ' + k + ' 不在候选集里（样本自身不自洽）');
            const onFace = face.some((w) => String(d.text).includes(w));
            assert.ok(onFace, s.cls + '/' + k + ' 未被反对词面解释（' + dom + ' → '
                + face.slice(0, 5).join('/') + '…）—— 若「命中」是靠别的通道来的，本档不认：'
                + String(d.text).slice(0, 36));
            explained++;
        }
    }
    assert.equal(explained, total, '可解释条目必须等于期望条目总数（' + explained + '/' + total + '）');
    assert.ok(total >= 14, '期望条目总数过少（' + total + '），样本面疑似退化');
    ok('逐样本可解释：' + explained + ' / ' + total + ' 条期望全部落在反对词面上');
});

test('A3. 真跑评测：命中 / 无关 / 误提权 / 主导维四条读数同时达标', () => {
    const r = EC.runEval({ api: NP });
    assert.equal(r.ok, true, '评测必须能跑出指标');
    const m = r.metrics;
    assert.equal(m.oppositeHitRate, 1, '期望命中率必须 1.0');
    assert.equal(m.irrelevantRate, 0, '无关召回必须 0（噪声不得被带出）');
    assert.equal(m.misboostRate, 0, '期望空命中的样本必须真不出线索');
    assert.equal(m.dimOkRate, 1, '可信主导维符合率必须 1.0（含修正后的 aggregate-emotion）');
    assert.equal(m.reasonOkRate, 1, 'reason 符合率必须 1.0');
    /* 不接 cost-ledger 时写「不可测」而不是编 0 —— 这条口径本身也是判据。 */
    assert.equal(m.tokenDeltaMeasured, false, '本档不接 cost-ledger，必须如实标记不可测');
    assert.equal(m.tokenDelta, null, '不可测的量必须为 null，不得编 0');
    ok('四条读数齐：命中 ' + m.oppositeHitRate + ' / 无关 ' + m.irrelevantRate + ' / 误提权 ' + m.misboostRate + ' / 主导维 ' + m.dimOkRate);
});

test('A4. 反极性面对账：负面三维非空；tense 的映射存在但按极性拒绝（取舍必须可见）', () => {
    for (const d of ['sad', 'fear', 'anger']) {
        assert.ok(NP.opposedWordsFor(d).length > 0, d + ' 反对词面为空 ⇒ 该维永远 no-opposites（配置缺失）');
    }
    /* tense 维的映射是**写了但不可达**的配置：这是有意取舍（氛围不出线索），
     *   故本档判「它还在、且原因写清了」，不判「不许有」—— 判死会把取舍变成假缺陷。 */
    const tenseKeys = Object.keys(NP.EMOTION_OPPOSITES).filter((k) => Object.prototype.hasOwnProperty.call(NP.EMO_LEXICON.tense, k));
    assert.ok(tenseKeys.length > 0, 'tense 映射被整体删掉了 —— 那要改口径注释，不能默默消失');
    assert.equal(POL.tense, 0, 'tense 极性若变了，本档结论必须重估');
    ok('负面三维面非空；tense ' + tenseKeys.length + ' 键在场但按极性 0 拒绝（有意取舍，非缺陷）');
});

/* ══════════ B 扩表可达：新词必须真被消费面用到 ══════════ */

const NEW_WORDS = { warm: { 陪在: 2, 别怕: 2, 披在: 2, 手帕: 2, 擦眼泪: 2 }, anger: { 气得: 3 } };
const NEW_KEY = '气得';

test('B1. 本轮扩表逐词在场，权重与留痕一致', () => {
    for (const dim of Object.keys(NEW_WORDS)) {
        for (const w of Object.keys(NEW_WORDS[dim])) {
            assert.equal(NP.EMO_LEXICON[dim][w], NEW_WORDS[dim][w],
                '新词「' + w + '」必须在 ' + dim + ' 维且权重 ' + NEW_WORDS[dim][w] + '，实测 ' + NP.EMO_LEXICON[dim][w]);
        }
    }
    ok('扩表在场：warm +5 词 / anger +1 词');
});

test('B2. ★★★★ 扩表可达：每个新词必须真被消费面用到（作反向键 或 作反向值）', () => {
    const asValueOf = (w) => Object.keys(NP.EMOTION_OPPOSITES).filter((k) => (NP.EMOTION_OPPOSITES[k] || []).includes(w));
    const lines = [];
    for (const dim of Object.keys(NEW_WORDS)) {
        for (const w of Object.keys(NEW_WORDS[dim])) {
            const asKey = Array.isArray(NP.EMOTION_OPPOSITES[w]) && NP.EMOTION_OPPOSITES[w].length > 0;
            const vals = asValueOf(w);
            assert.ok(asKey || vals.length > 0,
                '新词「' + w + '」只在词表里、没进任何反向映射 ⇒ 对反向召回零影响 —— '
                + '这正是本轮实测过的「扩了但没生效」形态（词表漂移门禁会因基线更新而放行）');
            lines.push(w + (asKey ? '(键)' : '(' + vals.join('/') + ')'));
        }
    }
    ok('扩表全部可达：' + lines.join(' '));
});

test('B3. 新反向键的值必须全在本仓词表且属正面维（消费面复验）', () => {
    const owner = {};
    for (const d of DIMS) for (const w of Object.keys(NP.EMO_LEXICON[d])) if (!owner[w]) owner[w] = d;
    const vals = NP.EMOTION_OPPOSITES[NEW_KEY];
    assert.ok(Array.isArray(vals) && vals.length > 0, '新键「' + NEW_KEY + '」的值必须非空');
    for (const v of vals) {
        assert.ok(owner[v], '「' + NEW_KEY + '」→「' + v + '」不在词表（反向线索与词典不同源 ⇒ 永远扫不到）');
        assert.ok(owner[v] === 'joy' || owner[v] === 'warm', '「' + NEW_KEY + '」→「' + v + '」归属 ' + owner[v] + '（应为 joy/warm）');
    }
    ok('新键「' + NEW_KEY + '」→ ' + vals.join('/') + '（全在词表且属正面维）');
});

/* ══════════ C ★双向证明：真源码降级副本上缺口必须回来 ══════════ */

/* 降级 = 把本轮扩表项撤回（词表 6 处 + 映射 4 处），构造**改动前**的真源码。
 *   走 breakSource：锚点必须恰中 1 次、替换必须真改变源码 —— 否则抛「拒绝破坏」，
 *   不允许出现「以为撤回了、其实没撤」的假副本（那是负控制第一形假绿）。 */
function downgraded() {
    let src = NP_SRC;
    src = breakSource(src, '陪在:2, 别怕:2, 披在:2, 手帕:2, 擦眼泪:2, ', '', 'B1-drop-lex-warm');
    src = breakSource(src, '气得:3, ', '', 'B1-drop-lex-anger');
    src = breakSource(src, "  气得: ['温柔', '安心', '陪伴', '笑'],\n", '', 'B1-drop-map-key');
    src = breakSource(src, ", '陪在', '别怕']", ']', 'B1-drop-map-nanguo');
    src = breakSource(src, ", '珍惜', '温暖', '披在', '手帕', '擦眼泪']", ", '珍惜', '温暖']", 'B1-drop-map-xintong');
    src = breakSource(src, ", '归处', '温暖', '披在', '手帕']", ", '归处', '温暖']", 'B1-drop-map-gudu');
    src = breakSource(src, ", '珍惜', '心安', '擦眼泪']", ", '珍惜', '心安']", 'B1-drop-map-xinsui');
    return src;
}
/** 把源码写成真模块并加载（临时目录路径唯一 ⇒ require 缓存不冲突）。 */
function loadTmp(src) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha-b1-'));
    const p = path.join(dir, 'narrative-pulse.js');
    fs.writeFileSync(p, src);
    const mod = req(p);
    fs.rmSync(dir, { recursive: true, force: true });
    return mod;
}
const GAP3 = ['natural-wording', 'action-comfort', 'aggregate-emotion'];

test('C1. ★★★★ 双向证明：撤回本轮扩表项 ⇒ 三条原缺口按各自成因复现', () => {
    const old = loadTmp(downgraded());
    const rOld = EC.runEval({ api: old });
    const by = detailOf(rOld);
    const seen = [];
    /* 三条缺口的成因**不是同一种**（本轮实测，不是推测）：
     *   · natural-wording / action-comfort —— 复现形态是**命中面退化**（hit < want）；
     *   · aggregate-emotion —— 复现形态是**语义面退化**：撤回「气得」后主导维退回 fear，
     *     而 fear 的反对词面里也有「温柔」（经「梦魇 → 温柔/安心/…」键汇入）
     *     ⇒ 该条**照样命中**（hit 仍 1/1）。
     *   ⇒ 拿「hit 少没少」当这条缺口的判据会读成「没退化」（假绿），它只有 dim 面量得出来。
     *     这正是原 gap 注释那句「这类缺口看 dimOk，不看 hit」的实测依据 ——
     *     也是本档首版写错、被自己这条判据当场抓住的地方。 */
    for (const cls of ['natural-wording', 'action-comfort']) {
        const x = by[cls];
        assert.ok(x, '降级副本里找不到样本 ' + cls);
        assert.ok(x.hit < x.want,
            cls + ' 在降级副本上仍然齐命中（' + x.hit + '/' + x.want + '）⇒ 本轮扩表不是该缺口的成因，本档归因错了');
        seen.push(cls + ' ' + x.hit + '/' + x.want);
    }
    const domBy = {};
    for (const x of rOld.samples) domBy[x.cls] = x.trustedDominant;
    assert.equal(domBy['aggregate-emotion'], 'fear',
        'aggregate-emotion 的成因在语义面：降级后可信主导维必须是 fear，实测 ' + domBy['aggregate-emotion']);
    const failDim = rOld.samples.filter((x) => x.cls === 'aggregate-emotion' && !x.dimOk).length;
    assert.equal(failDim, 1, '降级副本上该样本的 dimOk 必须为 false（语义错了）');
    assert.equal(NP.scanEmotion('他气得发抖，拳头攥得发白。').trustedDominant, 'anger',
        '阳性对照：原件必须是 anger');
    seen.push('aggregate-emotion fear→anger(语义)');
    ok('撤回扩表 ⇒ 三条缺口按各自成因复现（' + seen.join('，') + '）');
});

test('C2. ★★★ 降级副本上 aggregate-emotion 的可信主导维退回 fear（语义误判复现）', () => {
    const Q = '他气得发抖，拳头攥得发白。';
    const old = loadTmp(downgraded());
    assert.equal(old.scanEmotion(Q).trustedDominant, 'fear',
        '撤回后应退回 fear（主体是愤怒，却被「发抖」抢走主导）');
    assert.equal(NP.scanEmotion(Q).trustedDominant, 'anger', '阳性对照：原件必须是 anger');
    ok('撤回后主导维 anger → fear（误判复现）；原件 anger（修正生效）');
});

test('C3. 阳性对照：同一份评测在原件上三条必须齐（否则 C1 的「退化」证明不了任何事）', () => {
    const by = detailOf(EC.runEval({ api: NP }));
    for (const cls of GAP3) {
        assert.equal(by[cls].hit, by[cls].want, cls + ' 在原件上必须齐命中，实测 ' + by[cls].hit + '/' + by[cls].want);
    }
    ok('原件三条齐命中（与 C1 构成两向）');
});

test('C4. 降级副本是**真源码替换**：撤回后源码不含新词，原件含', () => {
    const down = downgraded();
    for (const w of Object.keys(NEW_WORDS.warm).concat([NEW_KEY])) {
        assert.ok(!down.includes(w), '降级副本里仍含新词「' + w + '」⇒ 撤回没发生（假副本）');
        assert.ok(NP_SRC.includes(w), '原件里应含新词「' + w + '」');
    }
    assert.ok(down.length < NP_SRC.length, '降级副本应更短（真删了东西）');
    ok('降级副本纯净：新词全撤（' + NP_SRC.length + ' → ' + down.length + ' 字节）');
});

/* ══════════ D 缺口归零与反坐实（与 v3193 / v3250 交叉复验） ══════════ */

test('D1. 缺口台账归零，且「空集合」是被量出来的（喂自造 gap 必须复现）', () => {
    const r = EC.runEval({ api: NP });
    assert.deepEqual(r.metrics.knownGaps, [], 'B1 验收：knownGap 必须为空');
    assert.ok(Array.isArray(r.metrics.knownGaps), '台账字段必须在场（字段没了也会读成空）');
    assert.equal(r.metrics.samples, MAIN.length, '主样本数 = 非 gap 样本数');
    assert.equal(r.metrics.samples + r.metrics.gapSamples, EC.CORPUS.length, '主 + gap = 全量');
    const injected = {
        cls: 'self-made-gap', note: '反坐实', gap: '自造缺口：台账机制必须仍能把它记下来',
        queryText: '她一个人坐在窗边，眼泪止不住地流。', docs: [{ key: 'z1', text: '桌上的杯子晃了一下' }],
        expect: ['z1'], expectDim: 'sad', expectReason: 'ok',
    };
    const r2 = EC.runEval({ api: NP, corpus: EC.CORPUS.concat([injected]) });
    assert.equal(r2.metrics.knownGaps.length, 1, '喂一条 gap ⇒ 台账必须重新出现（否则归零是机制失效）');
    assert.equal(r2.metrics.knownGaps[0].cls, 'self-made-gap', '台账必须点名到那一条');
    ok('台账为空且是被量出来的（反坐实复现 self-made-gap）');
});

test('D2. 版本面交叉：两份语料各自升版（EVAL 3 / STORY_EVAL 2）', () => {
    assert.equal(EC.EVAL_VERSION, 3, 'eval-corpus 版本未升（缺口转正必须升版，否则后人读不出答案换过）');
    const SE = req(path.join(ROOT, 'tests', 'fixtures', 'story-eval-corpus.js'));
    assert.equal(SE.STORY_EVAL_VERSION, 2, 'story-eval 版本未升');
    const cov = SE.coverageCheck();
    assert.equal(cov.gaps, 0, 'story-eval 缺口必须为 0，实测 ' + cov.gaps);
    assert.ok(cov.total >= 55, 'story-eval 样本数必须 ≥ 55（12 类边缘扩样），实测 ' + cov.total);
    ok('版本面交叉：EVAL ' + EC.EVAL_VERSION + ' / STORY_EVAL ' + SE.STORY_EVAL_VERSION + '（' + cov.total + ' 样本 / 缺口 ' + cov.gaps + '）');
});

/* ══════════ E 工具自证 + 台账 + 版本锚 ══════════ */

test('E1. 工具两向自证：锚点不存在 / 不唯一 / 同值替换必须抛（拒绝破坏）', () => {
    assert.throws(() => breakSource(NP_SRC, 'THIS_ANCHOR_DOES_NOT_EXIST_AT_ALL', 'x', 'E1a'), /拒绝破坏/, '锚点不存在必须抛');
    assert.throws(() => breakSource(NP_SRC, 'warm', 'x', 'E1b'), /拒绝破坏/, '锚点不唯一必须抛（多命中＝不是定点）');
    assert.throws(() => breakSource(NP_SRC, '气得:3, ', '气得:3, ', 'E1c'), /拒绝破坏/, '同值替换必须抛（等于没破坏）');
    ok('工具两向自证通过（三形态都拒绝）');
});

test('E2. 本档已登记进两张台账（参考基准 + 破坏工具接收方）', () => {
    const SELF = 'v3269_b1_injection_relevance.test.mjs';
    const catalog = read(path.join('tests', 'audit', 'catalog_reference_consumers.tsv'));
    assert.ok(catalog.split('\n').some((l) => l.startsWith(SELF + '\t')), '必须登记进参考基准（跨仓守卫 P3 否则报未登记）');
    const registry = read(path.join('tests', 'v3247_break_kit_consolidation.test.mjs'));
    assert.ok(registry.includes("'" + SELF + "'"), '必须登记进破坏工具接收方台账');
    ok('两张台账均已覆盖');
});

test('E3. 版本锚（出生下界 3.268.0；三源同源）', () => {
    const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));
    const codeVer = (/const VERSION = '([^']+)'/.exec(read('index.js')) || [])[1];
    const pkg = JSON.parse(read('package.json'));
    const mf = JSON.parse(read('manifest.json'));
    assert.ok(vnum(codeVer) >= vnum('3.268.0'), '本档只在 3.268.0 及以后成立；当前 ' + codeVer);
    assert.equal(pkg.version, codeVer, 'package.json 必须与入口同版');
    assert.equal(mf.version, codeVer, 'manifest.json 必须与入口同版');
    ok('版本锚：' + codeVer);
});
