// tests/v3467_local_vector_fallback.test.mjs — 本地确定性向量与来源分档阈值 [v3.467.0]
// 规格：ST-Persistent-Memory 增量缝合（.agents/notes/implemented/feature/2026-11-14-st-persistent-memory-stitch.md）
//
// 为什么要有这份判据：
//   `memory-organs.js` 的 `getEmbedding()` 有四条降级路径（无密钥 / API 报错 / 缺 embedding / 异常），
//   修前四条全部退回 `simpleEmbedding`（按字符码位摊到固定下标）。实测：**完全无关**的两句
//   相似度 0.9467，而**部分重叠**的只有 0.8634 —— 无关比相关还高，即它连区分都做不到。
//   本判据守三件事：① 新出口真的把区分度建立起来；② 阈值随来源换（否则等于没换）；
//   ③ 来源查不到阈值时**拒绝按语义唤醒**，而不是拿默认值硬套。
//
// 负控制纪律：每条正向断言旁边都放一条「把机制改坏就会红」的反向断言，
// 并含一条真源码破坏负控制（把阈值的来源分档抹成同一个数 ⇒ 当场红）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const V = (await import('../local-ngram-vectorizer.js')).default
    ?? (await import('../local-ngram-vectorizer.js'));
const S = (await import('../sleep-awaken.js')).default
    ?? (await import('../sleep-awaken.js'));

const DIM = 1536;
const cos = (a, b) => {
    let d = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return d / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};
const vec = (t) => V.vectorize(t, DIM).vector;

/* ---------------- A. 向量器本体 ---------------- */

test('v3467 A1. 维度必须由调用方给：缺/非法一律 ok:false，不自定维度', () => {
    for (const bad of [undefined, null, 0, 7, 3.5, 'abc', NaN]) {
        const r = V.vectorize('暴雨造成山洪', bad);
        assert.equal(r.ok, false, '非法维度必须拒绝：' + String(bad));
        assert.equal(r.vector, null);
        assert.ok(r.reason.includes('维度'), '理由必须点名维度，不能只说失败');
    }
    // 正向：给定维度必须**逐字**体现在结果上（不是「差不多」）
    assert.equal(V.vectorize('暴雨造成山洪', 64).vector.length, 64);
    assert.equal(V.vectorize('暴雨造成山洪', 1536).vector.length, 1536);
});

test('v3467 A2. 确定性：同输入恒同输出（可复算），换维度则落桶必变', () => {
    const a1 = V.vectorize('阿绣在城东的茶馆里等了三日', DIM);
    const a2 = V.vectorize('阿绣在城东的茶馆里等了三日', DIM);
    assert.deepEqual(a1.vector, a2.vector, '同文必须逐位相等');
    // 负控制：若实现里掺了随机/时间，这一条会红
    const b = V.vectorize('阿绣在城东的茶馆里等了三日', 256);
    /* 判据写法修正（首跑自己抓的）：首个版本比的是「前 10 位是否相同」，
     *   而哈希投射向量是**稀疏**的 —— 15 字文本只落十几个非零桶，前 10 位两边都是 0，
     *   于是这条断言在「换维度必须变」上**恒假于不变**（比了个全零前缀）。
     *   改成比**非零位置集合**：维数变了，取模后的落桶必然整体重排，这是该验的东西。 */
    const nz = (v) => v.map((x, i) => (x === 0 ? -1 : i)).filter((i) => i >= 0);
    assert.notDeepEqual(nz(a1.vector), nz(b.vector), '换维度后落桶必须重排（否则就是没按维度取模）');
    assert.equal(nz(b.vector).length > 0, true, '256 维下必须仍有非零桶（不是全零退化成空）');
});

test('v3467 A3. 区分度：相关 > 无关，且旧 simpleEmbedding 做不到（本条的对照组）', () => {
    const related = cos(vec('暴雨造成山洪冲垮了粮仓'), vec('山洪把粮仓冲垮了'));
    const unrelated = cos(vec('暴雨造成山洪冲垮了粮仓'), vec('今天天气不错我们去逛街'));
    assert.ok(related > unrelated * 5, `相关(${related.toFixed(4)}) 必须远高于无关(${unrelated.toFixed(4)})`);
    assert.ok(related > 0.2, '部分重叠应落在可判定区间');
    assert.ok(unrelated < 0.1, '无关应贴近 0');

    // 旧实现（同公式写在判据里，作为对照，不依赖源码是否还留着它）
    const old = (t) => {
        const v = new Array(DIM).fill(0);
        for (let i = 0; i < t.length && i < DIM; i++) v[i % DIM] += t.charCodeAt(i) / 10000;
        const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
        return v.map(x => x / (n || 1));
    };
    const oRelated = cos(old('暴雨造成山洪冲垮了粮仓'), old('山洪把粮仓冲垮了'));
    const oUnrelated = cos(old('暴雨造成山洪冲垮了粮仓'), old('今天天气不错我们去逛街'));
    assert.ok(oUnrelated > oRelated,
        `旧实现必须被记录为「无关分高于相关分」，实际 无关=${oUnrelated.toFixed(4)} 相关=${oRelated.toFixed(4)}`);
});

test('v3467 A4. 能力边界如实：纯同义改写（零字面重叠）认不出来 —— 不许吹成同义召回', () => {
    const v1 = cos(vec('暴雨造成山洪冲垮了粮仓'), vec('漫山遍野的泥浆浊流呼啸而下'));
    const v2 = cos(vec('暴雨造成山洪冲垮了粮仓'), vec('今天天气不错我们去逛街'));
    // 两者同档（都极低）：这就是本方案的**真实**边界，注释与文档不得写成能同义召回
    assert.ok(v1 < 0.1 && v2 < 0.1, '同义改写与无关同档，如实登记');
    assert.equal(V.vectorize('暴雨造成山洪', DIM).semanticParity, false,
        'semanticParity 必须为 false：它是确定性近似，不是 API 嵌入的等价物');
});

test('v3467 A5. 空文本/全停用词：ok:false 且不回退成零向量（零向量不构成方向）', () => {
    for (const t of ['', '   ', '\n\t', '，。！？', '的了吧是']) {
        const r = V.vectorize(t, 128);
        assert.equal(r.ok, false, '应拒绝：' + JSON.stringify(t));
        assert.equal(r.vector, null, '不得返回一个「看起来正常」的零向量');
        assert.ok(r.reason.length > 0, '拒绝必须带理由');
    }
});

test('v3467 A6. 归一化：单位球面（模长 1），长文本不因长度天然更「近」', () => {
    const short = vec('山洪');
    const long = vec('山洪冲垮了粮仓又淹了下游的三个村子最后惊动了府衙');
    for (const v of [short, long]) {
        const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
        assert.ok(Math.abs(norm - 1) < 1e-9, '模长必须为 1，实测 ' + norm);
    }
});

/* ---------------- B. 阈值随来源换 ---------------- */

test('v3467 B1. 阈值按来源分档：真嵌入与本地向量必须不同档', () => {
    assert.equal(V.thresholdFor('api'), 0.62);
    assert.equal(V.thresholdFor('local-ngram'), 0.22);
    assert.ok(V.thresholdFor('local-ngram') < V.thresholdFor('api'),
        '本地向量的相关档实测 0.27~0.39，套真嵌入的 0.62 会一条都唤不醒');
});

test('v3467 B2. 来源查不到阈值（legacy-simple / unknown）⇒ 返回 null，不许编一个数', () => {
    assert.equal(V.thresholdFor('legacy-simple'), null);
    assert.equal(V.thresholdFor('unknown'), null);
    assert.equal(V.thresholdFor(undefined), null);
    // 负控制：真源码破坏 —— 若有人把表抹成「一律 0.62」，这条与 B1 同时红
    const src = readFileSync(new URL('../local-ngram-vectorizer.js', import.meta.url), 'utf8');
    assert.ok(/THRESHOLD_BY_SOURCE/.test(src), '阈值表必须存在且具名');
    assert.ok(/'legacy-simple'\s*:\s*null/.test(src), 'legacy-simple 必须显式 null（不提供阈值）');
});

test('v3467 B3. 端到端：local-ngram 池子按 0.22 判，真能唤醒（换阈值前会漏）', () => {
    const q = '山洪把粮仓冲垮了';
    const qv = vec(q);
    const text = '暴雨造成山洪冲垮了粮仓';
    const pool = [{ id: 's1', text, embedding: vec(text), embedSource: 'local-ngram', archivedForSleep: true }];

    const r = S.plan({ summaries: pool, queryText: q, queryEmbedding: qv });
    assert.equal(r.ok, true);
    assert.equal(r.mode, 'semantic');
    assert.equal(r.threshold, 0.22, '门槛必须是来源档，不是默认 0.62');
    assert.equal(r.thresholdFrom, 'source:local-ngram');
    assert.equal(r.degrade, null);
    assert.equal(r.awakened.length, 1, '相关条目必须被唤醒');

    // 负控制：同一份分数若按真嵌入的 0.62 判 ⇒ 一条都唤不醒（正是「换了向量器没换阈值」的现场）
    const r62 = S.plan({ summaries: pool, queryText: q, queryEmbedding: qv, threshold: 0.62 });
    assert.equal(r62.awakened.length, 0, '0.62 门槛下必须空手而归 —— 这就是不换阈值的后果');
    assert.equal(r62.thresholdFrom, 'caller', '调用方显式给的阈值必须被标识为 caller');
});

test('v3467 B4. 语义面被判不可用时：拒发通行证、退回字面，且原因可读', () => {
    const q = '山洪把粮仓冲垮了';
    const qv = vec(q);
    const text = '暴雨造成山洪冲垮了粮仓';
    const pool = [{ id: 's1', text, embedding: vec(text), embedSource: 'legacy-simple', archivedForSleep: true }];
    const r = S.plan({ summaries: pool, queryText: q, queryEmbedding: qv });
    assert.equal(r.mode, 'literal', '来源无阈值 ⇒ 不接受语义面');
    assert.equal(r.degrade, 'semantic-threshold-unavailable',
        '必须与「没有向量」(no-vector) 分开记，两者是不同断点');
    assert.equal(r.thresholdSource, null);
    // 负控制：把来源标对了之后必须能进语义面（证明上面不是恒 literal）
    const pool2 = [{ id: 's1', text, embedding: vec(text), embedSource: 'local-ngram', archivedForSleep: true }];
    assert.equal(S.plan({ summaries: pool2, queryText: q, queryEmbedding: qv }).mode, 'semantic');
});

test('v3467 B5. 混合来源取最保守（最小）可用阈值，且如实标 mixed', () => {
    const q = '山洪把粮仓冲垮了';
    const qv = vec(q);
    const t1 = '暴雨造成山洪冲垮了粮仓';
    const pool = [
        { id: 'a', text: t1, embedding: vec(t1), embedSource: 'local-ngram', archivedForSleep: true },
        { id: 'b', text: t1, embedding: vec(t1), embedSource: 'api', archivedForSleep: true }
    ];
    const r = S.plan({ summaries: pool, queryText: q, queryEmbedding: qv });
    assert.equal(r.thresholdFrom, 'source:mixed(min)');
    assert.equal(r.threshold, 0.22, '混合时取最小（更保守），不能取最大放过噪声');
});

/* ---------------- C. 真源码破坏负控制 ---------------- */

test('v3467 C1. 负控制：四条降级路径确实换了出口（源码面锚点）', () => {
    const src = readFileSync(new URL('../memory-organs.js', import.meta.url), 'utf8');
    // 四个降级因必须都走 _fallback（不是各自散着调 simpleEmbedding）
    for (const reason of ['noKey', 'apiError', 'missingVector', 'exception']) {
        assert.ok(new RegExp(`_fallback\\(str, docHash, '${reason}'\\)`).test(src),
            `降级因 ${reason} 必须经统一出口`);
    }
    // 负控制本体：simpleEmbedding 只允许出现在**最后一档兜底**里。
    /* [v3.467.0 修] 出口已内联进 `_fallback`（它调的是 `this.simpleEmbedding(...)`，仍在方法体内），
     *   故这里改为：全仓 `this.simpleEmbedding(` 的调用点必须恰好 1 处，且该处必须在降级出口附近。
     *   另加一条更硬的：`_localVector` 不得作为独立方法存在 —— 两份实现＝第二个真源
     *   （v3273 C2 刚咬过同一形态）。 */
    const callSites = src.split('\n').filter((l) => /this\.simpleEmbedding\(/.test(l)
        && !/^\s*simpleEmbedding\(text\)/.test(l));
    assert.equal(callSites.length, 1,
        `simpleEmbedding 的调用点必须恰好 1 处（最后一档兜底），实测 ${callSites.length} 处：\n` + callSites.join('\n'));
    assert.ok(!/^\s*_localVector\s*\(/m.test(src),
        '★ 不得再保留独立的 _localVector() 方法：出口唯一实现在 _fallback 内（两份实现＝第二真源）');
    // 向量来源账必须存在，否则「降级向量 vs 真向量」在召回表上仍同形
    assert.ok(/embedSourceByDoc/.test(src), '逐条来源账必须存在');
    assert.ok(/embedSource:\s*this\.embedSourceByDoc/.test(src), '来源必须随条目落盘');
});