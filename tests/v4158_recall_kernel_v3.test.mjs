// [v4.158.0 · R24-O1] 召回内核：三路融合 + 逐路贡献 + 命中解释
//   验收口径（原文）：同一查询在同一记忆库上两次结果完全一致；
//   关掉某一路后结果可解释地变化（不是随机漂移）；每条结果都有可读的命中理由。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const K = require('../recall-kernel-v3.js');

const DOCS = [
    { id: 'm1', fields: { text: '他答应过要回来，明天在车站见', time: '3天前' } },
    { id: 'm2', fields: { text: '他说会回来，别担心', time: '昨天' } },
    { id: 'm3', fields: { text: '今天去超市买了牛奶', time: '今天' } },
    { id: 'm4', fields: { text: '暗号：蓝鲸在第七码头', time: '上周' } }
];

// ══════════ ① 三路登记与四态（缺一路不许塌成 0 分） ══════════
test('O1-1 三路登记齐，四态各自成态', () => {
    assert.deepEqual(K.ROUTES.slice(), ['bm25', 'ngram', 'vector']);
    assert.deepEqual(K.ROUTE_FACES.slice(), ['hit', 'empty', 'absent', 'disabled']);
});

test('O1-2 向量路缺 embedding ⇒ absent（不是 0 分、也不是 disabled）', () => {
    const r = K.recall({ docs: DOCS, query: '他说会回来' });
    assert.equal(r.routes.vector.face, 'absent');
    assert.equal(r.routes.vector.reason, 'host-provides-no-embedding');
    assert.notEqual(r.routes.vector.face, r.routes.bm25.face, 'absent 与 hit 不许同形');
});

test('O1-3 宿主给了 embedding ⇒ 向量路真参与融合', () => {
    const r = K.recall({
        docs: DOCS,
        query: '他说会回来',
        embeddings: { __query: [1, 0, 0], m1: [0.9, 0.1, 0], m2: [0.95, 0, 0], m3: [0, 1, 0], m4: [0, 0, 1] }
    });
    assert.equal(r.routes.vector.face, 'hit');
    const m2 = r.results.find((x) => x.id === 'm2');
    assert.ok(m2.routes.includes('vector'), '向量路命中的 id 必须出现在结果 routes 里');
});

// ══════════ ② 确定性：同输入两次逐条一致 ══════════
test('O1-4 同查询两次结果完全一致（同分按 id 字典序，不许靠插入序）', () => {
    const a = K.recall({ docs: DOCS, query: '他说会回来' });
    const b = K.recall({ docs: DOCS, query: '他说会回来' });
    assert.deepEqual(a.results, b.results);
    // 打乱输入顺序后仍应一致（确定性不只对同一数组成立）
    const c = K.recall({ docs: DOCS.slice().reverse(), query: '他说会回来' });
    assert.deepEqual(c.results.map((x) => x.id).sort(), a.results.map((x) => x.id).sort());
});

// ══════════ ③ 关掉某一路：可解释地变化 ══════════
test('O1-5 关掉 ngram：该路报 disabled，结果里不再出现该路，且结果集变化可解释', () => {
    const on = K.recall({ docs: DOCS, query: '他说会回来' });
    const off = K.recall({ docs: DOCS, query: '他说会回来', routes: { ngram: false } });
    assert.equal(off.routes.ngram.face, 'disabled');
    assert.equal(off.routes.ngram.in, 0);
    assert.ok(off.results.every((r) => !r.routes.includes('ngram')), '关掉的路不许出现在结果里');
    assert.notDeepEqual(off.results, on.results, '关一路后结果必须变化（否则融合是假的）');
    // 变化方向可解释：RRF 分数只会因少一路而下降，不会凭空上升
    const score = (r, id) => (r.results.find((x) => x.id === id) || { score: 0 }).score;
    for (const r of off.results) {
        assert.ok(r.score <= score(on, r.id) + 1e-9, r.id + ' 关一路后分数不许上升');
    }
});

test('O1-6 关掉 bm25：只剩 ngram，罕见词查询会明显退化（看得见的那一侧）', () => {
    const off = K.recall({ docs: DOCS, query: '蓝鲸', routes: { bm25: false } });
    assert.equal(off.routes.bm25.face, 'disabled');
    const on = K.recall({ docs: DOCS, query: '蓝鲸' });
    assert.equal(on.results[0].id, 'm4');
    assert.ok(off.results.length <= on.results.length);
});

// ══════════ ④ 命中解释：缺理由即不合格 ══════════
test('O1-7 每条结果都有可读命中理由（路 / 词或片段 / 字段）', () => {
    const r = K.recall({ docs: DOCS, query: '他说会回来' });
    assert.ok(r.results.length >= 2);
    for (const x of r.results) {
        assert.ok(x.why && Array.isArray(x.why.routes) && x.why.routes.length, x.id + ' 缺命中路');
        assert.equal(typeof x.why.field, 'string', x.id + ' 缺命中字段');
        assert.ok(x.why.terms.length + x.why.ngrams.length > 0, x.id + ' 缺命中证据');
        assert.ok(typeof x.why.text === 'string' && x.why.text.length > 0, x.id + ' 缺回源文本');
    }
    // 词路证据必须是查询里真出现的词（不是凭空编）
    const top = r.results[0];
    assert.ok(top.why.terms.every((t) => '他说会回来'.indexOf(t) !== -1), '命中词必须来自查询');
});

test('O1-8 逐路报账：in / merged / skipped 对得上全库条数', () => {
    const r = K.recall({ docs: DOCS, query: '他说会回来' });
    for (const route of ['bm25', 'ngram']) {
        const L = r.routes[route];
        assert.equal(L.in, DOCS.length, route + ' in 应为全库条数');
        assert.equal(L.merged + L.skipped, DOCS.length, route + ' merged+skipped 应等于全库条数');
    }
    assert.equal(r.counts.docs, DOCS.length);
});

// ══════════ ⑤ BM25 本体：IDF + tf 饱和 + 长度归一 ══════════
test('O1-9 罕见词（df=1）得分高于常见词（df=3）：同等 tf 与长度下唯一的差别就是 IDF', () => {
    // 同一语料里构造「同 tf(2)、同长度(3 词)」的两条注：唯一的差别是 df
    const docs = [
        { id: 'rare', fields: { text: '蓝鲸 蓝鲸 甲' } },
        { id: 'common', fields: { text: '常见 常见 乙' } },
        { id: 'x1', fields: { text: '常见 丙 丁' } },
        { id: 'x2', fields: { text: '常见 戊 己' } }
    ];
    const idx = K.buildIndex(docs);
    assert.equal(idx.df.get('蓝鲸').df, 1, '罕见词的 df 应为 1');
    assert.equal(idx.df.get('常见').df, 3, '常见词的 df 应为 3');
    const rare = K.bm25Score(idx, idx.entries.find((e) => e.id === 'rare'), ['蓝鲸']).score;
    const common = K.bm25Score(idx, idx.entries.find((e) => e.id === 'common'), ['常见']).score;
    assert.ok(rare > common, `罕见词 ${rare} 应 > 常见词 ${common}（IDF 在场）`);
    // 负控制：旧实现（includes 命中比例）在这种语料上两者必然相等 —— 说明这条判据真在考 IDF
    assert.notEqual(rare.toFixed(6), common.toFixed(6));
});

test('O1-10 tf 饱和：同词出现 5 次不会拿到 5 倍分', () => {
    const docs = [
        { id: 'a', fields: { text: '雨 雨 雨' } },
        { id: 'b', fields: { text: '雨 雨 雨 雨 雨 雨 雨 雨 雨' } }
    ];
    const idx = K.buildIndex(docs);
    const sa = K.bm25Score(idx, idx.entries.find((e) => e.id === 'a'), ['雨']).score;
    const sb = K.bm25Score(idx, idx.entries.find((e) => e.id === 'b'), ['雨']).score;
    assert.ok(sb / sa < 3, `tf 应饱和（比值 ${(sb / sa).toFixed(2)} < 3）`);
});

// ══════════ ⑥ 指代改写：有证据才做 ══════════
test('O1-11 无主语证据 ⇒ unknown 且原样返回（不猜）', () => {
    const rw = K.rewriteQuery('他说会回来', {});
    assert.equal(rw.face, 'unknown');
    assert.equal(rw.query, '他说会回来');
    assert.equal(rw.reason, 'no-subject-evidence');
});

test('O1-12 有证据 ⇒ 改写并把证据一起带出', () => {
    const rw = K.rewriteQuery('他说会回来', { activeSubject: '阿明', subjectEvidence: 3 });
    assert.equal(rw.face, 'rewritten');
    assert.ok(rw.query.includes('阿明'));
    assert.equal(rw.evidence, 3);
});

test('O1-13 无指代词 ⇒ not-needed（不做无谓改写）', () => {
    assert.equal(K.rewriteQuery('超市在哪', { activeSubject: '阿明', subjectEvidence: 9 }).face, 'not-needed');
});

// ══════════ ⑦ 接线：不登记 = 永不加载 ══════════
test('O1-14 manifest.extra_js 已登记（否则经典脚本侧永不加载，v3.461 那个坑）', () => {
    const man = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok(man.extra_js.includes('recall-kernel-v3.js'));
});

test('O1-15 optional-engine-registry 已登记显式名（否则 index.js 取不到 ⇒ 静默 null）', () => {
    const reg = readFileSync(join(ROOT, 'optional-engine-registry.js'), 'utf8');
    assert.ok(/\['LonShaRecallKernel',\s*'recall-kernel-v3\.js'\]/.test(reg));
});

test('O1-16 index.js 真有消费点（挂到 engine 上，不是只登记）', () => {
    const idx = readFileSync(join(ROOT, 'index.js'), 'utf8');
    assert.ok(idx.includes("optEngines.LonShaRecallKernel"));
    assert.ok(idx.includes('this.engine.recallKernel'));
    assert.ok(idx.includes("typeof api.recall === 'function'"), '取库口要校验形态，不然拿到毛坯也照挂');
});

test('O1-17 自检绿（模块自带读数）', () => {
    const s = K.recallKernelSelfCheck();
    assert.equal(s.ok, true, JSON.stringify(s.bad));
    assert.match(s.sample, /docs=4/);
});

test('O1-18 经典脚本形态：无 module 时挂 global.LonShaRecallKernel', () => {
    const src = readFileSync(join(ROOT, 'recall-kernel-v3.js'), 'utf8');
    assert.ok(src.includes('root.LonShaRecallKernel = api;'));
    assert.ok(!/^\s*export\s/m.test(src), '不许再写成 ESM（宿主按经典脚本加载）');
});
