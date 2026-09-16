// tests/v3149_volume_integrity.test.mjs
// LonSha 记忆引擎 v3.149.0 卷摘要 intact 判定（柏宝书 #13 缝入）测试
// 覆盖：写入侧指纹快照+volumeId / 校验侧降级+源摘要回活跃池 / 健全卷查询三消费点收口 / 开关门控
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf-8');
function extractClass(source, startMarker) {
    const start = source.indexOf(startMarker);
    if (start < 0) return null;
    let depth = 0, started = false;
    for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') { depth--; if (started && depth === 0) return source.slice(start, i + 1); }
    }
    return null;
}
// 提取顶层闭包 helper sanitizeJson（与 SummarySystem 同作用域，类方法内直接引用）
function extractFunc(source, name) {
    const marker = 'function ' + name;
    const start = source.indexOf(marker);
    if (start < 0) return null;
    // 深度计数提取：跳过字符串/模板串/行注释/块注释，精确配对花括号
    let depth = 0, i = source.indexOf('{', start), str = null, esc = false;
    while (i < source.length) {
        const ch = source[i], nx = source[i + 1];
        if (str) {
            if (esc) esc = false;
            else if (ch === '\\') esc = true;
            else if (ch === str) str = null;
        } else if (ch === '"' || ch === "'" || ch === '`') str = ch;
        else if (ch === '/' && nx === '/') { const e = source.indexOf('\n', i); i = (e < 0 ? source.length : e); continue; }
        else if (ch === '/' && nx === '*') { const e = source.indexOf('*/', i + 2); i = (e < 0 ? source.length : e + 2); continue; }
        else if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
        i++;
    }
    return null;
}
function loadSummarySystem() {
    const cls = extractClass(src, 'class SummarySystem');
    assert.ok(cls, 'SummarySystem 可提取');
    const san = extractFunc(src, 'sanitizeJson');
    assert.ok(san, 'sanitizeJson 可提取');
    // 类内闭包依赖 sanitizeJson：连同它一起注入作用域
    return new Function(san + '\nreturn (' + cls + ');')();
}

test('=== 1. 结构断言（写入侧快照 + 校验方法存在） ===', () => {
    assert.ok(src.includes('volumeIntegrityGuard'), '配置开关');
    assert.ok(src.includes('verifyVolumesIntact'), '校验方法');
    assert.ok(src.includes('getIntactVolumes'), '健全卷查询');
    assert.ok(src.includes('srcFps'), '指纹快照字段');
    assert.ok(src.includes('s.volumeId = _volId'), '源摘要打 volumeId');
    assert.ok(src.includes('degraded: false'), '新卷初始健全');
    const recallIdx = src.indexOf('async recallMemory(query)');
    const verifyIdx = src.indexOf('verifyVolumesIntact(this.config.config)', recallIdx);
    assert.ok(recallIdx > 0 && verifyIdx > recallIdx, 'recallMemory 先对账后召回');
    assert.ok(src.includes('getActiveVolumes() { return this.getIntactVolumes()'), 'getActiveVolumes 经 getIntactVolumes');
    assert.ok(src.includes('searchVolumes(limit = 2) { return this.getIntactVolumes()'), 'searchVolumes 经 getIntactVolumes');
    assert.ok(src.includes('maybeFoldHistorical(config, llm)'), '史记折叠存在');
});

test('=== 2. 降级语义：源指纹失效 → 整卷降级 + 源摘要回活跃池 ===', async () => {
    const SummarySystem = loadSummarySystem();
    const s = new SummarySystem();
    // 自实现指纹：文本变 → 指纹变（模拟 swipe/编辑），不依赖引擎 hash32
    s.fpOf = (m) => (m && typeof m.t === 'string') ? 'fp_' + m.t : '';
    // 构造 30 条摘要（越过默认阈值 30）
    for (let i = 1; i <= 30; i++) {
        s.createSummary({ index: i, mes: '第' + i + '楼剧情内容。' }, '第' + i + '楼摘要。');
    }
    assert.strictEqual(s.summaries.length, 30, '30 条摘要入池');
    // 搭建 window.SillyTavern 运行环境（chat 稀疏数组：floor i → { t: 文本 }）
    const chatArr = [];
    for (let i = 1; i <= 30; i++) chatArr[i] = { t: '第' + i + '楼剧情内容。' };
    globalThis.window = { SillyTavern: { getContext: () => ({ chat: chatArr }) } };
    const fakeLlm = { callAPI: async () => '{"text":"卷摘要：第1到30楼的整体剧情概括，包含关键人物地点因果与转折。","deltas":[],"conflicts":[]}' };
    const vol = await s.maybeFold({ summaryFoldEnabled: true, summaryFoldThreshold: 30, summaryFoldBatchSize: 20 }, fakeLlm);
    assert.ok(vol, '折叠产出卷');
    assert.ok(Array.isArray(vol.srcFps) && vol.srcFps.length === 20, '卷带 20 条源指纹快照');
    assert.strictEqual(vol.degraded, false, '新卷初始未降级');
    const foldedSums = s.summaries.filter(x => x.folded && x.volumeId === vol.id);
    assert.strictEqual(foldedSums.length, 20, '20 条源摘要归入该卷');
    // 全部 intact
    assert.strictEqual(s.getIntactVolumes().length, 1, '1 个健全卷');
    assert.strictEqual(s.getActiveVolumes().length, 1, '1 个活跃卷');
    assert.strictEqual(s.searchVolumes(2).length, 1, 'searchVolumes 召回该卷');
    // === 模拟 swipe：改动 floor 3 的消息文本 → 指纹变化 ===
    chatArr[3] = { t: '第3楼被 swipe 成完全不同的新内容。' };
    const n = s.verifyVolumesIntact({});
    assert.strictEqual(n, 1, '检出 1 个失效卷');
    assert.strictEqual(vol.degraded, true, '卷降级');
    const revived = s.summaries.filter(x => !x.folded && x.volumeId === undefined && x.floor >= 1 && x.floor <= 20);
    assert.strictEqual(revived.length, 20, '20 条源摘要回活跃池');
    // 降级卷不再被任何查询消费
    assert.strictEqual(s.getIntactVolumes().length, 0, '无健全卷');
    assert.strictEqual(s.getActiveVolumes().length, 0, '无活跃卷');
    assert.strictEqual(s.searchVolumes(2).length, 0, 'searchVolumes 不召回降级卷');
    // 幂等：再次对账不重复降级
    assert.strictEqual(s.verifyVolumesIntact({}), 0, '幂等：已降级卷跳过');
    delete globalThis.window;
});

test('=== 3. 引擎闭包接线：指纹函数注入 + recallMemory 对账 ===', () => {
    const wireIdx = src.indexOf('this.summary = new SummarySystem();');
    const fpIdx = src.indexOf('this.summary.fpOf = (m) =>', wireIdx);
    assert.ok(wireIdx > 0 && fpIdx > wireIdx && fpIdx < wireIdx + 200, 'fpOf 紧随 SummarySystem 构造注入');
    const rmIdx = src.indexOf('async recallMemory(query)');
    const guardIdx = src.indexOf('volumeIntegrityGuard !== false', rmIdx);
    assert.ok(rmIdx > 0 && guardIdx > rmIdx && guardIdx < rmIdx + 500, '对账受开关门控');
});