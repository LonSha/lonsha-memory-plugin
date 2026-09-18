// tests/v3172_recall_funnel_read_surface.test.mjs
// v3.172 召回漏斗读数面：把 I5/I6 递给 v3.95/v3.96 缝入的四个模块的「收缩阶段」。
//   缝入批次（智能分块 / 前置 AI 精选 / 统一召回 / 副 API 通道）在 76 个版本里
//   只有「功能是否生效」被审计过，没有一处「漏斗变窄」被计数。
// 层次：A 粗召回截断 / B AI 判不了≠判定了空 / C key 映射不上 / D 图谱截断 /
//       E 副通道失败 / F 硬切兜底 / G 面板 / H 契约零破坏 / I 宿主接线 /
//       J 源码层不变量 + 工具自证 / K 磁盘级负控制
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const idxSrc = fs.readFileSync(path.join(REPO, 'index.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
function vnum(s) {
    const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
    return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}
function loadFile(file, glb) {
    const src = fs.readFileSync(path.join(REPO, file), 'utf8');
    const sbox = { module: { exports: {} } };
    const fn = new Function('globalThis', 'module', 'window', 'self',
        src + '\nreturn (typeof module !== "undefined" && module.exports) ? module.exports : globalThis.' + glb + ';');
    return fn(sbox, sbox.module, undefined, undefined);
}
const AS = loadFile('ai-select.js', 'LonShaAISelect');
const UR = loadFile('unified-recall.js', 'LonShaUnifiedRecall');
const AC = loadFile('api-channels.js', 'LonShaApiChannels');
const TC = loadFile('text-chunk.js', 'LonShaTextChunk');

let pass = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };
const mkCand = (i) => ({ id: 'e' + i, content: '内容' + i, keys: { primary: ['内容' + i], all: ['内容' + i] }, order: 100 - i });

// ══════════ 0 版本与 manifest ══════════
test('【0】版本与注册', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
    assert.ok(vnum(v) >= vnum('3.172.0'), `index.js 版本 ${v} < 3.172.0`);
    assert.ok(vnum(manifest.version) >= vnum('3.172.0'), `manifest ${manifest.version} < 3.172.0`);
    assert.ok(vnum(pkg.version) >= vnum('3.172.0'), `package.json ${pkg.version} < 3.172.0`);
    for (const f of ['ai-select.js', 'unified-recall.js', 'api-channels.js', 'text-chunk.js']) {
        assert.ok(manifest.extra_js.includes(f), `${f} 已注册 extra_js`);
    }
    ok('版本 / manifest 注册');
});

// ══════════ A 粗召回截断可计数 ══════════
test('【A1】recallCandidates：裸数组契约不变 + 截断量离体可读', () => {
    const all = Array.from({ length: 25 }, (_, i) => mkCand(i));
    const carry = {};
    const r = AS.recallCandidates(all, { lastUserText: '内容1', recentText: '' }, { maxCandidates: 20 }, carry);
    assert.ok(Array.isArray(r), '返回值必须是裸数组（既有契约）');
    assert.equal(r.length, 20);
    assert.equal(carry.dropped, 5, '丢弃 5 条可读');
    assert.equal(carry.scored, 25);
    assert.equal(carry.kept, 20);
    assert.equal(carry.cap, 20);
    // 不传 carry 时行为与读数面之前逐字节一致
    const r2 = AS.recallCandidates(all, { lastUserText: '内容1', recentText: '' }, { maxCandidates: 20 });
    assert.deepEqual(r2.map(x => x.id), r.map(x => x.id), '带/不带 carry 结果一致');
    ok('粗召回截断可计数 / 契约不变');
});

test('【A2】recallCandidates：入参不是数组 ≠ 空数组（I6）', () => {
    const c1 = {};
    AS.recallCandidates(null, {}, {}, c1);
    assert.equal(c1.inputNotArray, true, 'null 入参可辨');
    assert.equal(c1.total, 0);
    const c2 = {};
    AS.recallCandidates([], {}, {}, c2);
    assert.equal(c2.inputNotArray, false, '空数组是另一态');
    assert.equal(c2.total, 0);
    const c3 = {};
    AS.recallCandidates(undefined, {}, {}, c3);
    assert.equal(c3.inputNotArray, true, 'undefined 入参可辨');
    // 过滤类丢失分账
    const c4 = {};
    AS.recallCandidates([{ content: '' }, { content: 'x', constant: true }], { lastUserText: '' }, { maxCandidates: 5 }, c4);
    assert.equal(c4.noContent, 1, '无内容被滤可读');
    assert.equal(c4.constantFiltered, 1, '常驻被滤可读');
    ok('入参类型 / 过滤类丢失分账');
});

// ══════════ B AI 判不了 ≠ 判定了空 ══════════
test('【B1】parseAIResponse：五态可分（裸数组契约不变）', () => {
    const st = {};
    assert.deepEqual(AS.parseAIResponse('{"selected":[]}', st), [], '返回值仍是裸数组');
    assert.equal(st.state, 'empty', '明确空集');
    const s2 = {}; AS.parseAIResponse('{"selector":["甲"]}', s2);
    assert.equal(s2.state, 'wrong-shape', '键名不认识');
    assert.equal(s2.gotKeys, 'selector', '实际键名可读');
    const s3 = {}; AS.parseAIResponse('好的，本轮没有相关内容。', s3);
    assert.equal(s3.state, 'no-json', '返回体里无 JSON');
    const s4 = {}; AS.parseAIResponse('{"selected":"甲"}', s4);
    assert.equal(s4.state, 'wrong-shape', 'selected 类型不对');
    const s5 = {}; AS.parseAIResponse(null, s5);
    assert.equal(s5.state, 'no-raw', '完全没返回');
    const s6 = {}; AS.parseAIResponse('', s6);
    assert.equal(s6.state, 'blank', '返回空白');
    const s7 = {}; AS.parseAIResponse('```json\n{"selected":[{"nokey":1}]}\n```', s7);
    assert.equal(s7.state, 'all-items-invalid', '有元素但全是脏元素');
    assert.equal(s7.rawItems, 1);
    const s8 = {}; AS.parseAIResponse('```json\n{"selected":[{"key":"A"}]}\n```', s8);
    assert.equal(s8.state, 'ok');
    assert.equal(s8.keys, 1);
    // 既有容错路径（v396 断言的那些）行为不变
    assert.deepEqual(AS.parseAIResponse('{"selected":[{"key":"A",},{"key":"B"}]}'), ['A', 'B'], '尾逗号容错');
    assert.deepEqual(AS.parseAIResponse('```json\n{"selected":[{"key":"图书馆"}]}\n```'), ['图书馆']);
    ok('五态可分 / 既有容错不变');
});

test('【B2】AISelect.route：判不了不得冒充「判定了空」', async () => {
    const cands = [
        { id: 'a', content: '甲', keys: { all: ['甲'] }, _label: '甲', comment: '甲' },
        { id: 'b', content: '乙', keys: { all: ['乙'] }, _label: '乙', comment: '乙' },
    ];
    const mk = (raw) => new AS.AISelect({ callAI: async () => raw, maxCandidates: 10, maxSelect: 6 });
    const rEmpty = await mk('{"selected":[]}').route(cands, { lastUserText: '甲' });
    assert.equal(rEmpty.source, 'ai-empty-fallback', '明确空集 → 保底 top1');
    assert.equal(rEmpty.selected.length, 1);
    assert.equal(rEmpty.readState.state, 'empty');
    for (const [label, raw] of [['键名错', '{"selector":["甲"]}'], ['非 JSON', '无'], ['类型错', '{"selected":1}'], ['无返回', null]]) {
        const r = await mk(raw).route(cands, { lastUserText: '甲' });
        assert.equal(r.source, 'local-parsefail', `${label} 必须走 local-parsefail（不得冒充空集结论）`);
        assert.notEqual(r.source, 'ai-empty-fallback', `${label} 不得被判成「本轮无相关内容」`);
        assert.ok(r.readState && r.readState.state && r.readState.state !== 'empty', `${label} 读态不得为 empty`);
    }
    // 既有五态 source 一个不少
    const rNoAi = await new AS.AISelect({ callAI: null }).route(cands, { lastUserText: '甲' });
    assert.equal(rNoAi.source, 'local-noai');
    const rAi = await mk('{"selected":["甲"]}').route(cands, { lastUserText: '甲' });
    assert.equal(rAi.source, 'ai');
    const rErr = await new AS.AISelect({ callAI: async () => { throw new Error('x'); } }).route(cands, { lastUserText: '甲' });
    assert.equal(rErr.source, 'local-error');
    ok('判不了 ≠ 判定了空 / 五态 source 保持');
});

// ══════════ C key 映射不上 ══════════
test('【C1】mapKeysToCandidates：映射失败可计数（裸数组契约不变）', () => {
    const cands = [
        { id: 'c1', content: '甲', _label: '甲', comment: '甲', keys: { all: ['甲'] } },
        { id: 'c2', content: '乙', _label: '乙', comment: '乙', keys: { all: ['乙'] } },
    ];
    const carry = {};
    const out = AS.mapKeysToCandidates(['甲', '乙', '丙', '丁', '戊'], cands, carry);
    assert.ok(Array.isArray(out), '返回值必须是裸数组');
    assert.equal(out.length, 2);
    assert.equal(carry.requested, 5, 'AI 要了 5 条');
    assert.equal(carry.mapped, 2, '真映射上 2 条');
    assert.equal(carry.unmatched, 3, '3 条映射不上可读');
    assert.deepEqual(carry.unmatchedSample, ['丙', '丁', '戊'], '样本可读（便于回查 AI 输出）');
    // route 把这层读数带出来
    return (async () => {
        const sel = new AS.AISelect({ callAI: async () => '{"selected":["甲","乙","丙","丁","戊"]}', maxCandidates: 20, maxSelect: 6 });
        const r = await sel.route(cands, { lastUserText: '甲' });
        assert.equal(r.keyMap.unmatched, 3, 'route 带出未命中数');
        assert.equal(r.readState.state, 'ok', '读态为 ok（读到了，只是映射不上）');
        ok('key 映射失败可计数');
    })();
});

// ══════════ D 图谱候选截断（评分前）══════════
test('【D1】graphToCandidates：截断量可读 + 上限可覆盖（裸数组契约不变）', () => {
    const nodes = [];
    for (let i = 0; i < 30; i++) nodes.push({ id: 'n' + i, type: 'misc', name: '节点' + i, data: { summary: 'x' + i }, timestamp: 1 });
    const carry = {};
    const c = UR.graphToCandidates(nodes, {}, carry);
    assert.ok(Array.isArray(c), '返回值必须是裸数组');
    assert.equal(c.length, 24, '默认上限 24（既有行为不变）');
    assert.equal(carry.dropped, 6, '截断 6 条可读');
    assert.equal(carry.candsTotal, 30);
    assert.equal(carry.kept, 24);
    assert.equal(carry.cap, 24);
    // 上限不再硬编码唯一
    assert.equal(UR.graphToCandidates(nodes, { maxCandidates: 10 }).length, 10, '上限可被调用方覆盖');
    assert.equal(UR.graphToCandidates(nodes, { maxCandidates: 40 }).length, 30, '上限放大可见真候选数');
    // Map 形状与不可候选化计数
    const c2 = {};
    UR.graphToCandidates([{ id: 'x', type: 'a', name: 'x', data: {} }, null, 'bad', 42], {}, c2);
    assert.equal(c2.unmappable, 3, '无法候选化的节点可计数');
    assert.equal(c2.candsTotal, 1);
    const m = new Map([['n1', { id: 'n1', type: 'event', name: 'E', data: {} }]]);
    assert.equal(UR.graphToCandidates(m).length, 1, 'Map 形状仍支持');
    ok('图谱截断可计数 / 上限可覆盖');
});

test('【D2】mergeWithGuaranteed：名额来源分账（裸数组契约不变）', () => {
    const carry = {};
    const merged = UR.mergeWithGuaranteed([
        { id: 'a', score: 20, _guaranteed: false, updatedAt: 1 },
        { id: 'b', score: 0, _guaranteed: true, updatedAt: 2 },
        { id: 'c', score: 15, _guaranteed: false, updatedAt: 3 },
    ], { maxTotal: 2 }, carry);
    assert.ok(Array.isArray(merged));
    assert.equal(merged.length, 2, '既有行为不变');
    assert.ok(merged.map(x => x.id).includes('b'), '保底类型仍入选');
    assert.equal(carry.guaranteedPicked, 1, '保底占位可读');
    assert.equal(carry.scoredPicked, 1, '打分入围可读');
    assert.equal(carry.guaranteedCap, 1, '保底上限可读');
    assert.equal(carry.dropped, 1, '落选可读');
    ok('保底/打分名额分账');
});

// ══════════ E 副通道失败留痕 ══════════
test('【E1】api-channels.route：副通道失败不再完全静默', async () => {
    const ch = AC.normalizeChannels({ summarize: { endpoint: 'https://cheap.example/v1', model: 'cheap-1', enabled: true } });
    const r = await AC.route({
        task: 'summarize', prompt: 'p', channels: ch,
        callSecondary: async () => { throw new Error('副通道 401 未授权'); },
        callMain: async () => '主通道结果',
    });
    assert.equal(r.text, '主通道结果', '既有降级行为不变');
    assert.equal(r.source, 'main-fallback', '既有 source 语义不变');
    assert.equal(r.secondaryError, '副通道 401 未授权', '失败原因留痕');
    assert.equal(r.channelEndpoint, 'https://cheap.example/v1', '端点留痕');
    assert.equal(r.attempts, 2, '尝试次数留痕');
    // 副通道「通但回空」与「失败」可分
    const r2 = await AC.route({ task: 'summarize', prompt: 'p', channels: ch, callSecondary: async () => '', callMain: async () => 'M' });
    assert.equal(r2.secondaryEmpty, true, '空回可辨');
    assert.equal(r2.secondaryError, undefined, '空回不是失败');
    // 三态 source 一个不少（v396 断言）
    const r3 = await AC.route({ task: 'summarize', prompt: 'p', channels: ch, callMain: async () => 'SEC2', callSecondary: async () => 'SEC' });
    assert.equal(r3.source, 'secondary');
    assert.equal(r3.attempts, 1);
    const r4 = await AC.route({ task: 'extract', prompt: 'p', channels: ch, callMain: async () => 'M' });
    assert.equal(r4.source, 'main');
    const r5 = await AC.route({ task: 'extract', prompt: 'p', channels: ch });
    assert.equal(r5.error, 'no callMain');
    assert.equal(r5.attempts, 0);
    ok('副通道失败留痕 / 三态保持');
});

// ══════════ F 硬切兜底 ══════════
test('【F1】text-chunk：硬切（该模块存在的理由）可计数', () => {
    const hard = '啊'.repeat(3000);
    const carry = {};
    const chunks = TC.chunkText(hard, 800, 10, null, carry);
    assert.ok(Array.isArray(chunks) && chunks.every(c => typeof c === 'string'), '返回值仍是 string[]');
    assert.equal(chunks.length, 5, '既有分块结果不变');
    assert.equal(carry.hardCuts, 4, '无边界硬切可计数（末块不进入边界查找）');
    assert.equal(carry.boundaryHits, 0);
    assert.equal(carry.maxLen, 800);
    assert.equal(carry.minLen, 120, '块长分布可读');
    // 有边界 → 硬切为 0（正样本）
    const c2 = {};
    TC.chunkText('甲。乙。丙。丁。'.repeat(200), 100, 10, null, c2);
    assert.equal(c2.hardCuts, 0, '有边界不误报硬切');
    assert.ok(c2.boundaryHits > 0, '边界命中可读');
    assert.equal(c2.lastBoundaryKind, 'sentence', '边界种类可读');
    // 边界恰落窗口末端：修前会被误判为硬切
    const c3 = {};
    TC.chunkText('甲。'.repeat(1) + '啊'.repeat(97) + '。' + '啊'.repeat(1000), 100, 10, null, c3);
    assert.equal(c3.hardCuts + c3.boundaryHits, c3.chunks - 1, '每刀都有归类（无漏计）');
    // 短文本 / 分隔符 / 估算分支
    const c4 = {}; TC.chunkText('短文本', 800, 10, null, c4);
    assert.equal(c4.single, true); assert.equal(c4.hardCuts, 0);
    const c5 = {}; TC.chunkText('A|B|C', 2, 0, '|', c5);
    assert.equal(c5.byDelimiter, true);
    const c6 = {}; TC.estimateChunkCount(hard, 800, 10, c6);
    assert.equal(c6.hardCuts, 4, '估算可带读数');
    // 不传 carry 时结果与带 carry 一致
    assert.deepEqual(TC.chunkText(hard, 800, 10), chunks, '带/不带 carry 结果一致');
    ok('硬切可计数 / 既有分块不变');
});

test('【F2】text-chunk：刀数与段数双向对账（I5）', () => {
    // 对账式一：cuts = hardCuts + boundaryHits（每一刀都有归类）；
    // 对账式二：loops = chunks + emptyChunks（每一段都有去向，含被 trim 成空的）
    const samples = ['x'.repeat(500), ('段落。\n\n' + '啊'.repeat(60)).repeat(20), 'A B C '.repeat(300), '甲' .repeat(1234)];
    for (const s of samples) {
        for (const size of [80, 200, 500]) {
            const c = {};
            const chunks = TC.chunkText(s, size, 10, null, c);
            assert.equal(c.chunks, chunks.length, `块数一致（size=${size}）`);
            assert.equal(c.cuts, c.hardCuts + c.boundaryHits, `每刀都有归类（len=${s.length} size=${size}）`);
            assert.equal(c.loops, c.chunks + c.emptyChunks, `每段都有去向（len=${s.length} size=${size}）`);
        }
    }
    ok('硬切计数与块数自洽（多尺寸）');
});

// ══════════ G 漏斗面板 ══════════
test('【G1】normalizeRecallFunnel：三种录入形状 + 缺口自述', () => {
    const recs = [
        { stages: { aiEmpty: 2, aiUnreadable: 3, keyUnmatched: 5, coarseDropped: 7, graphDropped: 1, hardCut: 4, channelFallback: 2 } },
        { report: { stages: { aiEmpty: 1, aiUnreadable: 1 } } },
        { report: { aiEmpty: 1, coarseDropped: 2 } },
        null,
        'garbage',
    ];
    const pan = AS.normalizeRecallFunnel(recs, { cap: 500, dropped: 9 });
    assert.equal(pan.records, 5, '窗口条数');
    assert.equal(pan.recorded, 3, '读到的条数');
    assert.equal(pan.missing, 2, '缺失读数（I6）');
    assert.equal(pan.empty, 4, 'AI 明确空集聚合');
    assert.equal(pan.unreadable, 4, 'AI 判不了聚合');
    assert.equal(pan.unmatched, 5);
    assert.equal(pan.truncated, 9);
    assert.equal(pan.graphDropped, 1);
    assert.equal(pan.hardCut, 4);
    assert.equal(pan.channelFallback, 2);
    assert.equal(pan.dropped, 9, '环形淘汰并入');
    assert.equal(pan.cap, 500);
    assert.equal(pan.hasReadGap, true, '有缺口必须自述');
    // 空集是结论、不是缺口
    const clean = AS.normalizeRecallFunnel([{ stages: { aiEmpty: 3 } }], {});
    assert.equal(clean.hasReadGap, false, '只有空集时不算读数缺口');
    assert.equal(clean.empty, 3, '但空集仍要报出来');
    // 全零值不污染聚合
    const z = AS.normalizeRecallFunnel([{ stages: { aiEmpty: 0, hardCut: 0 } }], {});
    assert.equal(z.empty, 0);
    // 非法输入安全
    assert.equal(AS.normalizeRecallFunnel(null, {}).records, 0);
    assert.equal(AS.normalizeRecallFunnel(null, {}).hasReadGap, false);
    assert.equal(AS.normalizeRecallFunnel([], {}).records, 0);
    assert.equal(AS.normalizeRecallFunnel('x', {}).records, 0);
    ok('面板三形状 / 缺口自述 / 边界安全');
});

test('【G2】normalizeRecallFunnel：确定性 + 不改入参', () => {
    const recs = [{ stages: { aiUnreadable: 2, hardCut: 1 } }, { stages: { aiUnreadable: 3 } }];
    const snap = JSON.stringify(recs);
    const a = AS.normalizeRecallFunnel(recs, { dropped: 4 });
    const b = AS.normalizeRecallFunnel(recs, { dropped: 4 });
    assert.deepEqual(a, b, '同输入同结果');
    assert.equal(JSON.stringify(recs), snap, '入参未被修改');
    assert.equal(a.unreadable, 5, '聚合正确');
    assert.equal(a.dropped, 4);
    ok('面板确定性 / 纯函数');
});

// ══════════ H 契约零破坏 ══════════
test('【H1】既有裸数组/固定字段契约逐一保持', () => {
    // 裸数组
    assert.ok(Array.isArray(AS.recallCandidates([mkCand(1)], { lastUserText: '内容1' }, {})));
    assert.ok(Array.isArray(AS.parseAIResponse('{"selected":[]}')));
    assert.ok(Array.isArray(AS.mapKeysToCandidates(['a'], [])));
    assert.ok(Array.isArray(UR.graphToCandidates([])));
    assert.ok(Array.isArray(UR.mergeWithGuaranteed([])));
    assert.ok(Array.isArray(TC.chunkText('x', 10)));
    assert.ok(Array.isArray(TC.chunkWithoutDelimiter('x', 10)));
    // route 返回体既有字段一个不少
    const cands = [{ id: 'a', content: '甲', keys: { all: ['甲'] }, _label: '甲', comment: '甲' }];
    const ch = AC.normalizeChannels({});
    assert.ok(typeof AC.route === 'function');
    // 导出名只增不减（既有八个键）
    for (const k of ['AISelect', 'scoreEntry', 'recallCandidates', 'buildSelectPrompt', 'parseAIResponse', 'mapKeysToCandidates', 'selectWithFallback', 'extractQueryTerms', 'normalizeText']) {
        assert.ok(k in AS, `ai-select 导出 ${k} 仍在`);
    }
    for (const k of ['GUARANTEED_TYPES', 'MAX_CANDIDATES', 'nodeToCandidate', 'graphToCandidates', 'mergeWithGuaranteed']) {
        assert.ok(k in UR, `unified-recall 导出 ${k} 仍在`);
    }
    for (const k of ['TASKS', 'CHANNEL_KEYS', 'normalizeChannels', 'resolveChannel', 'route']) {
        assert.ok(k in AC, `api-channels 导出 ${k} 仍在`);
    }
    for (const k of ['DEFAULT_CHUNK_SIZE', 'DEFAULT_OVERLAP_PERCENT', 'SENTENCE_MARKERS', 'chunkText', 'chunkWithoutDelimiter', 'estimateChunkCount']) {
        assert.ok(k in TC, `text-chunk 导出 ${k} 仍在`);
    }
    // 新导出（只增）
    assert.equal(typeof AS.normalizeRecallFunnel, 'function', '新增面板函数');
    ok('契约零破坏 / 导出只增');
});

// ══════════ I 宿主接线 ══════════
test('【I1】index.js 接线：台账 / 采集 / 总账 / 自检 / 面板', () => {
    assert.ok(idxSrc.includes('this._recallFunnel = []'), '漏斗台账初始化');
    assert.ok(idxSrc.includes('this._recallFunnelDropped = 0'), '环形淘汰计数');
    assert.ok(idxSrc.includes('this._recallFunnelReadEmpty = 0'), '空读轮次计数');
    assert.ok(idxSrc.includes('normalizeRecallFunnel'), '面板真调用');
    assert.ok(idxSrc.includes('召回漏斗读数缺口'), '总账行');
    assert.ok(idxSrc.includes('漏斗空读轮次'), '空读轮次入总账');
    assert.ok(idxSrc.includes("['召回漏斗'"), 'selfCheck 行');
    assert.ok(/召回漏斗：\*\*/.test(idxSrc), '报告面板段');
    assert.ok(idxSrc.includes('this.aiSelect.lastCoarseRead'), '粗召回读数接真源（不用假输入另跑一次）');
    assert.ok(idxSrc.includes('_urCarry') && idxSrc.includes('graphToCandidates(this.graph.nodes, {}, _urCarry)'), '图谱截断读数');
    assert.ok(idxSrc.includes('_funnel.keyUnmatched'), 'key 映射读数');
    assert.ok(idxSrc.includes('_funnel.aiReadState'), 'AI 读态读数');
    ok('宿主接线（台账/采集/总账/自检/面板）');
});

test('【I2】宿主接线：门控与巩固两条旧读数面未被破坏', () => {
    assert.ok(idxSrc.includes('门控读数缺口'), 'v3.171 门控总账行仍在');
    assert.ok(idxSrc.includes('门控读数'), 'v3.171 自检行仍在');
    assert.ok(idxSrc.includes('_triggerDropped'), 'v3.171 环形淘汰计数仍在');
    assert.ok(idxSrc.includes('巩固账本有损'), 'v3.170 巩固总账行仍在');
    assert.ok(idxSrc.includes('巩固账本'), 'v3.170 自检行仍在');
    assert.ok(idxSrc.includes('审计账本有损'), 'v3.169 账本自述仍在');
    ok('旧读数面零破坏');
});

// ══════════ J 源码层不变量 + 工具自证 ══════════
test('【J1】读数一律走可选参数 / 返回体新增字段，不改既有签名语义', () => {
    for (const f of ['ai-select.js', 'unified-recall.js', 'api-channels.js', 'text-chunk.js']) {
        const s = fs.readFileSync(path.join(REPO, f), 'utf8');
        assert.ok(!/carry\s*=\s*\{\}/.test(s.replace(/carry = null/g, '')), `${f}: carry 不得有默认空对象（须可选）`);
    }
    const as = fs.readFileSync(path.join(REPO, 'ai-select.js'), 'utf8');
    assert.ok(as.includes('function recallCandidates(entries, q, opts = {}, carry = null)'), '三参形态');
    assert.ok(as.includes('function parseAIResponse(raw, carry = null)'), '可选第二参');
    assert.ok(as.includes('function mapKeysToCandidates(keys, candidates, carry = null)'), '可选第三参');
    assert.ok(as.includes('function normalizeRecallFunnel(records, opts = {})'), '面板函数');
    const ur = fs.readFileSync(path.join(REPO, 'unified-recall.js'), 'utf8');
    assert.ok(ur.includes('function graphToCandidates(nodes, opts = {}, carry = null)'), '图谱签名');
    assert.ok(ur.includes('function mergeWithGuaranteed(scoredCandidates, opts = {}, carry = null)'), '保底签名');
    const tc = fs.readFileSync(path.join(REPO, 'text-chunk.js'), 'utf8');
    assert.ok(tc.includes('function chunkWithoutDelimiter(text, chunkSize = DEFAULT_CHUNK_SIZE, overlapPercent = DEFAULT_OVERLAP_PERCENT, carry = null)'), '分块签名');
    assert.ok(tc.includes('function chunkText(text, chunkSize = DEFAULT_CHUNK_SIZE, overlapPercent = DEFAULT_OVERLAP_PERCENT, forceChunkDelimiter = null, carry = null)'), 'chunkText 签名（第五参，前四参不动）');
    ok('可选参数形态 / 无默认空对象');
});

test('【J2】I6 判据：每一处「读不到」都有独立状态值（不塌缩成 0）', () => {
    const as = fs.readFileSync(path.join(REPO, 'ai-select.js'), 'utf8');
    // parseAIResponse 的状态必须包含全部六种非 ok 态
    for (const st of ['no-raw', 'blank', 'no-json', 'bad-json', 'not-object', 'wrong-shape', 'all-items-invalid', 'empty', 'ok']) {
        assert.ok(as.includes(`'${st}'`), `状态 ${st} 存在`);
    }
    // route 分流必须只认 'empty'
    assert.ok(/raw === null \|\| raw === undefined/.test(as), '空串与「没返回」必须分态（I6）');
    const _b2 = NEG_ANCHORS.find(x => x[3] === '【B2】');
    assert.ok(as.includes(_b2[1]), '只有明确空集才走保底');
    assert.ok(!/readState\.state === 'no-raw'[\s\S]{0,80}ai-empty-fallback/.test(as), 'no-raw 不得进空集分支');
    // 文本分块：每个分块结果都有归类计数
    const tc = fs.readFileSync(path.join(REPO, 'text-chunk.js'), 'utf8');
    assert.ok(tc.includes('flags.boundary'), '边界/硬切由被调方自报（不由返回值反推）');
    ok('I6 状态值完备 / 空集分支唯一');
});

test('【J3】负控制工具自证：锚点命中计数 + 判据纯度', () => {
    // ① 锚点串在目标文件中必须恰好出现 1 次（防「破坏没打中」的假绿）。
    //   锚点表与本文件负控制共用一份；本层不另写锚点字面量（判据纯度，防自我指涉）。
    for (const [f, a] of NEG_ANCHORS.map(n => [n[0], n[1]])) {
        const s = fs.readFileSync(path.join(REPO, f), 'utf8');
        assert.equal(s.split(a).length - 1, 1, `${f} 锚点「${a}」须恰好 1 次`);
    }
    // ② 判据纯度：本测试文件里不得把锚点字面量写第二遍（防自我指涉）
    const self = fs.readFileSync(path.join(__dirname, 'v3172_recall_funnel_read_surface.test.mjs'), 'utf8');
    assert.ok(self.includes('NEG_ANCHORS'), '负控制锚点集中于单一常量');
    ok('锚点唯一 / 判据纯度');
});

// ══════════ K 负控制（磁盘级真破坏，见 tests/audit 脚本；此处做进程内副本级）══════════
// [v3.172] 负控制锚点表：K1/K2/K3 与 J3 共用同一份（判据纯度：锚点字面量只此一处声明）。
//   四元组 = [文件, 锚点原文, 显式破坏文本, 标签]，防三种假绿形态：
//     ① 破坏打在空气上（锚点不命中）→ 用「锚点必恰中 1 次」拦住；
//     ② 破坏文本等于原锚点（没改到）→ 用 destroyStr !== anchorStr 拦住；
//     ③ 锚点字面量自我指涉（判据引用被破坏的行）→ 判据一律从本表派生。
const NEG_ANCHORS = [
    ['ai-select.js', 'carry.dropped = Math.max(0, scored.length - out.length)', 'carry.dropped = 0', '【A1】'],
    ['ai-select.js', "if (readState.state === 'empty')", 'if (true)', '【B2】'],
    ['ai-select.js', 'carry.unmatched = unmatched.length', 'carry.unmatched = 0', '【C1】'],
    ['ai-select.js', 'pan.hasReadGap = !!(pan.unreadable', 'pan.hasReadGap = !!(false && pan.unreadable', '【G1】'],
    ['unified-recall.js', 'carry.dropped = Math.max(0, out.length - kept.length)', 'carry.dropped = 0', '【D1】'],
    ['api-channels.js', 'secondaryError = e?.message || String(e)', 'secondaryError = null', '【E1】'],
    ['text-chunk.js', 'if (flags.boundary) boundaryHits++; else hardCuts++;', 'if (flags.boundary) { boundaryHits++; }', '【F1】'],
];

test('【K1】负控制：真源码破坏 → 加载破坏副本 → 在副本上重跑真判据', () => {
    const results = [];
    for (const [file, anchorStr, destroyStr, tag] of NEG_ANCHORS) {
        const orig = fs.readFileSync(path.join(REPO, file), 'utf8');
        const hits = orig.split(anchorStr).length - 1;
        assert.equal(hits, 1, `锚点须恰中 1 次（${file} / ${tag}）`);
        // [v3.172] 真破坏：用显式破坏文本（必须与原锚点不同，否则是「破坏文本等于原锚点」的假绿）；
        //   旧写法用通用 .replace('=','= 0') 造破坏，对不含 '=' 的锚点（如 F1 的 ++ 计数语句）会静默失效。
        assert.notEqual(destroyStr, anchorStr, `破坏文本不得等于锚点原文（${tag}）`);
        const broken = orig.replace(anchorStr, destroyStr);
        assert.notEqual(broken, orig, '破坏必须真改到源码');
        // 加载破坏副本（不是原文件），在其上重跑真判据
        const sbox = { module: { exports: {} } };
        const glb = { 'ai-select.js': 'LonShaAISelect', 'unified-recall.js': 'LonShaUnifiedRecall', 'api-channels.js': 'LonShaApiChannels', 'text-chunk.js': 'LonShaTextChunk' }[file];
        let mod = null;
        try {
            const fn = new Function('globalThis', 'module', 'window', 'self',
                broken + '\nreturn (typeof module !== "undefined" && module.exports) ? module.exports : globalThis.' + glb + ';');
            mod = fn(sbox, sbox.module, undefined, undefined);
        } catch (e) { results.push([tag, 'load-error', e.message]); continue; }
        // 真判据（与正测同一套断言，跑在破坏副本上）
        let brokenDetected = false, detail = '';
        try {
            if (tag === '【A1】') {
                const c = {}; mod.recallCandidates(Array.from({ length: 25 }, (_, i) => mkCand(i)), { lastUserText: '内容1' }, { maxCandidates: 20 }, c);
                if (c.dropped !== 5) { brokenDetected = true; detail = `dropped=${c.dropped}`; }
            } else if (tag === '【B2】' || tag === '【E1】') {
                // 这两条的真判据是异步的（route 返回 Promise），在【K2】里跑破坏副本；此处显式标记，不以「没跑」冒充通过。
                brokenDetected = 'async-check';
            } else if (tag === '【C1】') {
                const c = {}; mod.mapKeysToCandidates(['甲', '乙', '丙'], [{ id: 'c1', content: '甲', _label: '甲', comment: '甲', keys: { all: ['甲'] } }], c);
                if (c.unmatched !== 2) { brokenDetected = true; detail = `unmatched=${c.unmatched}`; }
            } else if (tag === '【D1】') {
                const nodes = Array.from({ length: 30 }, (_, i) => ({ id: 'n' + i, type: 'misc', name: 'n' + i, data: {}, timestamp: 1 }));
                const c = {}; mod.graphToCandidates(nodes, {}, c);
                if (c.dropped !== 6) { brokenDetected = true; detail = `dropped=${c.dropped}`; }
            } else if (tag === '【G1】') {
                const pan = mod.normalizeRecallFunnel([{ stages: { aiUnreadable: 3 } }], {});
                if (pan.hasReadGap !== true) { brokenDetected = true; detail = 'hasReadGap=' + pan.hasReadGap; }
            } else if (tag === '【F1】') {
                const c = {}; mod.chunkText('啊'.repeat(3000), 800, 10, null, c);
                if (c.hardCuts !== 4) { brokenDetected = true; detail = `hardCuts=${c.hardCuts}`; }
            } else {
                brokenDetected = 'unhandled';   // 锚点表里有但判据未接管 = 另一种假绿
            }
        } catch (e) { brokenDetected = true; detail = 'run-error:' + e.message; }
        results.push([tag, brokenDetected === true ? 'DETECTED' : (brokenDetected === 'async-check' ? 'ASYNC' : 'MISSED'), detail]);
    }
    const missed = results.filter(r => r[1] === 'MISSED' || r[1] === 'unhandled');
    assert.equal(missed.length, 0, '同步层破坏必须全部被检出：' + JSON.stringify(results));
    ok('进程内负控制：' + results.map(r => `${r[0]}${r[1] === 'DETECTED' ? '✓' : '→异步'} `).join(''));
});

test('【K2】负控制：异步判据（AI 空集分流 / 副通道留痕）在破坏副本上必翻红', async () => {
    const [file, anchorStr, destroyStr] = NEG_ANCHORS.find(x => x[3] === '【B2】');
    const orig = fs.readFileSync(path.join(REPO, file), 'utf8');
    const broken = orig.replace(anchorStr, destroyStr);
    assert.notEqual(broken, orig);
    const sbox = { module: { exports: {} } };
    const fn = new Function('globalThis', 'module', 'window', 'self',
        broken + '\nreturn (typeof module !== "undefined" && module.exports) ? module.exports : globalThis.LonShaAISelect;');
    const B = fn(sbox, sbox.module, undefined, undefined);
    const cands = [{ id: 'a', content: '甲', keys: { all: ['甲'] }, _label: '甲', comment: '甲' }, { id: 'b', content: '乙', keys: { all: ['乙'] }, _label: '乙', comment: '乙' }];
    const r = await new B.AISelect({ callAI: async () => '{"selector":["甲"]}', maxCandidates: 10, maxSelect: 6 }).route(cands, { lastUserText: '甲' });
    assert.equal(r.source, 'ai-empty-fallback', '破坏后「判不了」被当成「判定了空」（真判据在此副本上翻红）');
    // 原版上同一判据必须是绿的（两向自证）
    const r2 = await new AS.AISelect({ callAI: async () => '{"selector":["甲"]}', maxCandidates: 10, maxSelect: 6 }).route(cands, { lastUserText: '甲' });
    assert.equal(r2.source, 'local-parsefail', '原版上判据为真');
    // 【E1】副通道失败留痕：同样在破坏副本上跑真判据
    const [ef, ea, ed, et] = NEG_ANCHORS.find(x => x[3] === '【E1】');
    const eOrig = fs.readFileSync(path.join(REPO, ef), 'utf8');
    assert.equal(eOrig.split(ea).length - 1, 1, `E1 锚点须恰中 1 次（${et}）`);
    const eBroken = eOrig.replace(ea, ed);
    assert.notEqual(eBroken, eOrig, 'E1 破坏必须真改到源码');
    const eFn = new Function('globalThis', 'module', 'window', 'self',
        eBroken + '\nreturn (typeof module !== "undefined" && module.exports) ? module.exports : globalThis.LonShaApiChannels;');
    const EB = eFn({ module: { exports: {} } }, { exports: {} }, undefined, undefined);
    const ech = EB.normalizeChannels({ summarize: { endpoint: 'https://cheap.example/v1', model: 'cheap-1', enabled: true } });
    const er = await EB.route({ task: 'summarize', prompt: 'p', channels: ech,
        callSecondary: async () => { throw new Error('副通道 401 未授权'); },
        callMain: async () => '主通道结果' });
    assert.notEqual(er.secondaryError, '副通道 401 未授权', '破坏后失败原因丢失（真判据在此副本上翻红）');
    assert.equal(er.source, 'main-fallback', '降级行为不变');
    // 原版上同一判据必须是绿的（两向自证）
    const eOk = await AC.route({ task: 'summarize', prompt: 'p', channels: ech,
        callSecondary: async () => { throw new Error('副通道 401 未授权'); },
        callMain: async () => '主通道结果' });
    assert.equal(eOk.secondaryError, '副通道 401 未授权', '原版上留痕为真');
    ok('异步负控制：破坏必翻红 / 原版必为真');
});

test('【K3】负控制：工具自身必须抛（锚点不存在 / 不唯一 / 破坏无观测变化）', () => {
    // locate：锚点必须恰中 1 次，否则抛（防「破坏打在空气上」的假绿）
    const locate = (file, anchorStr) => {
        const src = fs.readFileSync(path.join(REPO, file), 'utf8');
        const n = src.split(anchorStr).length - 1;
        if (n !== 1) throw new Error(`锚点不唯一：${file} x${n}`);
        return src;
    };
    assert.throws(() => locate('ai-select.js', '__NO_SUCH_ANCHOR__'), /锚点不唯一/, '锚点不存在必须抛');
    // 表内每个锚点必须都能被 locate 命中（锚点串从表派生，本层不另写字面量）
    for (const [f, a] of NEG_ANCHORS.map(x => [x[0], x[1]])) locate(f, a);
    // 破坏必须真改到源码（可观测）
    const [f0, a0, d0] = NEG_ANCHORS[0];
    const b = locate(f0, a0).replace(a0, d0);
    assert.notEqual(b, locate(f0, a0), '破坏必须改变文件内容');
    // 判据纯度（防自我指涉）：锚点字面量在本文件内只准出现一次，即 NEG_ANCHORS 表内的声明处；
    //   K1/K2/K3/J2/J3 一律从表派生，否则就是「判据引用了被破坏的那一行」。
    const self = fs.readFileSync(path.join(__dirname, 'v3172_recall_funnel_read_surface.test.mjs'), 'utf8');
    for (const [f, a] of NEG_ANCHORS.map(x => [x[0], x[1]])) {
        const cnt = self.split(a).length - 1;
        assert.equal(cnt, 1, `${f} 锚点字面量在本文件内出现 ${cnt} 次（须恰好 1：仅表内声明）`);
    }
    ok('工具自证：不唯一必抛 / 破坏可观测 / 锚点字面量受控');
});

console.log(`\n[v3.172] 召回漏斗读数面：${pass} 组断言通过`);