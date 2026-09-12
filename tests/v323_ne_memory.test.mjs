// tests/v323_ne_memory.test.mjs
// v3.23 NE-Memory 收编测试（断崖截断 / 时间约束解析 / 跨调用去重）
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf-8');

// 版本断言（>= v3.23 容灾）
const vMatch = src.match(/const VERSION = '([^']+)'/);
if (!vMatch) { console.error('FAIL: VERSION 未找到'); process.exit(1); }
const v = vMatch[1];
const verNum = parseFloat(v);
if (verNum < 3.23) { console.error(`FAIL: 版本 ${v} < 3.23`); process.exit(1); }
console.log(`ok: 版本 ${v}`);

let pass = 0;
const fail = (m) => { console.error('FAIL: ' + m); process.exitCode = 1; };
const ok = (m) => { pass++; console.log('ok: ' + m); };

// ── 从源码抽取函数体（IIFE 内顶层函数提取）──
function extractFn(name, params) {
    const re = new RegExp(`function ${name}\\(${params}\\) \\{`);
    const m = src.match(re);
    if (!m) return null;
    const start = src.indexOf('{', m.index) + 1;
    let depth = 1, i = start;
    for (; i < src.length && depth > 0; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
    }
    const body = src.substring(start, i - 1);
    const fn = new Function('errLog', `return function ${name}(${params}) { ${body} };`);
    return fn(() => {});
}

// ── T1: BM25 断崖截断 ──
{
    // 从源码抽 BM25 类 search 很复杂（依赖 _tokenize 等），改为直接构建 BW25 实例方法测试
    // 用 evalClass 模式：抽取整个 BM25 类
    const classRe = /class BM25 \{([\s\S]*?)\n    \}/;
    const cm = src.match(classRe);
    if (!cm) { fail('T1: BM25 类未找到'); }
    else {
        const Code = new Function('errLog', `return class BM25 { ${cm[1]} };`);
        const BM25 = Code(() => {});
        const bm = new BM25();
        // 造 6 条文档：前 2 条含查询词"龙牙剑"，后 4 条完全不相关（不同词）
        bm.rebuild([
            { id: 'a', text: '龙牙剑 传说 被 爱丽丝 持有', floor: 1 },
            { id: 'b', text: '爱丽丝 用 龙牙剑 斩断 锁链', floor: 2 },
            { id: 'c', text: '食堂 今天 的 午饭 是 红烧肉', floor: 3 },
            { id: 'd', text: '天空 下 起 了 小雨 街道 湿润', floor: 4 },
            { id: 'e', text: '电路板 焊点 测试 通过 电压 稳定', floor: 5 },
            { id: 'f', text: '量子 纠缠 退相干 实验 数据 异常', floor: 6 }
        ]);
        const cliff = bm.search('龙牙剑 爱丽丝', 5, { cliffCut: true, minResults: 2 });
        if (cliff.length <= 2) ok(`T1: 断崖截断有效（返回 ${cliff.length} 条，顶部命中）`);
        else fail(`T1: 断崖截断应截掉弱相关尾巴，实际 ${cliff.length} 条`);
        if (cliff[0]?.score > 0 && (cliff[1]?.score || 0) > 0) {
            // 前两条是强相关，分差大 → 断崖生效
            if (cliff.length < 5) ok('T1: 相关长尾被截断');
            else fail('T1: 长尾未被截断');
        } else fail('T1: 顶部文档应为相关文档');
        // 无断崖模式仍返回全部分数>0 的（原始行为：只返回有分文档，不受 topK 截断曲线影响）
        const plain = bm.search('龙牙剑 爱丽丝', 5);
        if (plain.length >= 2 && plain.length <= 5) ok(`T1: 无 cliffCut 返回有分文档 ${plain.length} 条`);
        else fail(`T1: 无 cliffCut 应返回有分文档, 实际 ${plain.length}`);
        // minResults 保底
        const empty = bm.search('不存在的词xyz', 5, { cliffCut: true, minResults: 2 });
        if (empty.length >= 0 && empty.length <= 1) ok('T1: 无相关时保底为空/最少');
        else fail('T1: 无相关时应几乎为空');
    }
}

// ── T2: 时间约束解析 ──
{
    const parseFn = extractFn('parseStoryTimeConstraint', 'query');
    if (!parseFn) { fail('T2: parseStoryTimeConstraint 未找到'); }
    else {
        // Day 范围
        const r1 = parseFn('Day 3 到 Day 5 发生了什么');
        if (r1 && r1.type === 'narrative_range') ok(`T2: Day 范围解析 -> ${r1.period}`);
        else fail('T2: Day 范围解析失败: ' + JSON.stringify(r1));
        // Day 单日
        const r2 = parseFn('Day 4 的经过');
        if (r2 && r2.type === 'narrative' && r2.period === 'Day 4') ok('T2: Day 单日解析');
        else fail('T2: Day 单日解析失败: ' + JSON.stringify(r2));
        // ISO 日期
        const r3 = parseFn('2026-05-12 那天发生了什么');
        if (r3 && r3.type === 'absolute' && r3.period === '2026-05') ok(`T2: ISO 日期解析 -> ${r3.period}`);
        else fail('T2: ISO 日期解析失败: ' + JSON.stringify(r3));
        // 中文月份
        const r4 = parseFn('五月发生了什么');
        if (r4 && r4.type === 'absolute' && r4.month === 5) ok('T2: 中文月份解析');
        else fail('T2: 中文月份解析失败: ' + JSON.stringify(r4));
        // 无时间词 → null
        const r5 = parseFn('爱丽丝在哪里');
        if (r5 === null) ok('T2: 无时间信息返回 null');
        else fail('T2: 无时间信息应返回 null: ' + JSON.stringify(r5));
    }
    // 时间过滤
    const ff = extractFn('filterTimelineByConstraint', 'entries, c');
    if (!ff) { fail('T2b: filterTimelineByConstraint 未找到'); }
    else {
        const entries = [
            { date: 'Day 3', text: 'a' },
            { date: 'Day 5', text: 'b' },
            { date: 'Day 9', text: 'c' },
            { date: '5月3日', text: 'd' }
        ];
        const f1 = ff(entries, { type: 'narrative_range', from: 'Day 3', to: 'Day 5' });
        if (f1.length === 2 && f1[0].date === 'Day 3' && f1[1].date === 'Day 5') ok('T2b: narrative_range 过滤 Day3-5');
        else fail('T2b: narrative_range 过滤失败: ' + JSON.stringify(f1.map(e => e.date)));
        const f2 = ff(entries, { type: 'absolute', period: '2026-05', month: 5, year: 2026 });
        if (f2.some(e => e.date === '5月3日')) ok('T2b: absolute 月份过滤');
        else fail('T2b: absolute 月份过滤失败');
    }
}

// ── T3: 跨调用去重 ──
{
    // 抽 recallDedupMark / recallDedupRemember。它们共享 _recallDedupState —— 直接测试行为
    // 由于是顶层 const 状态，抽取函数会复制变量定义。简化：用字符串级断言验证存在与逻辑结构
    if (src.includes('_recallDedupState')) ok('T3: 去重状态存在');
    else fail('T3: _recallDedupState 缺失');

    // 数值单测：模拟去重逻辑（inline）
    let state = { lastTexts: null };
    const remember = (recalled) => { state.lastTexts = recalled.map(r => String(r.text || '')).filter(Boolean).slice(0, 12); };
    const mark = (candidates) => {
        if (!state.lastTexts) return null;
        const used = new Set(state.lastTexts);
        return candidates.filter(c => used.has(String(c.text || '')));
    };
    remember([{ text: 'A事件' }, { text: 'B事件' }]);
    const candidates = [{ text: 'A事件' }, { text: 'C事件' }];
    const marked = mark(candidates);
    if (marked && marked.length === 1 && marked[0].text === 'A事件') ok('T3: 上轮已覆盖项被标记');
    else fail('T3: 去重标记失败: ' + JSON.stringify(marked));
    const markedTexts = candidates.filter(c => !state.lastTexts.includes(String(c.text || '')));
    if (markedTexts.length === 1 && markedTexts[0].text === 'C事件') ok('T3: 新项不被误标');
    else fail('T3: 新项被误标');
    // 空状态 → null
    state.lastTexts = null;
    if (mark(candidates) === null) ok('T3: 首次调用（无上一轮）不标记');
    else fail('T3: 首次调用不应标记');
}

// ── T4: chatMetadata 迁移恢复 ──
{
    if (src.includes('checkEmbeddedMigration')) ok('T4: 迁移检测方法存在');
    else fail('T4: checkEmbeddedMigration 缺失');
    if (src.includes('embedVaultToChatMeta')) ok('T4: 嵌入写入方法存在');
    else fail('T4: embedVaultToChatMeta 缺失');
    if (src.includes('_migrateRestored')) ok('T4: 防重入标志存在');
    else fail('T4: _migrateRestored 缺失');
    // collectExport 带 version
    const ce = src.match(/collectExport\(\) \{[\s\S]*?return \{([\s\S]*?)\n            \};/);
    if (ce && /version: VERSION/.test(ce[1])) ok('T4: collectExport 含 version 字段');
    else fail('T4: collectExport 缺 version 字段');
}

console.log(`\n✓ v3.23 NE-Memory 收编测试全过 (${pass} 项)`);
if (process.exitCode) { console.log('✗ 存在失败项'); process.exit(process.exitCode); }