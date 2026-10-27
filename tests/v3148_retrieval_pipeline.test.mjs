// tests/v3148_retrieval_pipeline.test.mjs
// [v3.148] 检索质量管线四件套：BM25 语料缓存 / rerank 分批 / INTENT 查询意图 / age 锚点
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
/* [v3.421.0] 宿主面合并读：index.js 的方法已大批外提到 engine-*.js / memory-core.js，
 *   入口只剩一行委派。只读入口的测试因此两重受害 ——
 *   ① 方法体根本不在入口里（断言找不到）；
 *   ② 抠出来的片段没有闭包作用域（_moduleLib / errLog …）→ ReferenceError。
 *   改读 hostSurface 的合并面（v3160/v3161/v3163 同一机制）。变量名与下游断言一字不改。
 *   顺序：入口在前、模块在后 —— 版本常量这类「以入口为准」的断言必须先命中入口；
 *   而入口里的单行委派体一律先剥掉，否则抽取助手取首次命中会抠到委派（只剩一句委托）。 */
import { hostSurface as __hostSurfaceRaw } from './_audit_lib.mjs';
import __hostPath from 'node:path';
import { fileURLToPath as __hostFu } from 'node:url';
/* 写成函数声明而不是 const 箭头：读取语句常落在文件前几行，而 import 段可能在它下面。
 *   声明提升是唯一与语句顺序无关的写法（const 会撞 TDZ，实测 4 档因此新红）。 */
function __hostSurface() {
    const __root = __hostFu(new URL('..', import.meta.url));
    const __face = __hostSurfaceRaw(__root, {
        fs: { readFileSync: readFileSync, existsSync: () => true },
        path: __hostPath,
    });
    /* 单行委派形如 `foo(a) { const M = _moduleLib(...); return M ? ... ; }` —— 从正文里**移走**。
     *   两行以上的委派很少，且那种形态抽取助手本来就抠不全，留给模块面兜。
     *   [v3.421.0] 但**不能丢弃**：一批「宿主出口各恰一处」的判据问的就是这些委派桩本身
     *   （`foo(...args) {` 只存在于入口的委派行里，模块面是 `function foo(engine, ...)`）。
     *   故剥下来的行收集到扫描面**最末**：抽取助手仍先命中模块面的真实现（委派在尾部），
     *   而字符串在场判据照旧命中。丢弃会让那批判据整片假红。 */
    const __deleg = [];
    const __squeeze = (raw) => raw.split(String.fromCharCode(10))
        .filter((ln) => {
            const __isDeleg = /^[ \t]*[_a-zA-Z$][\w$]*[ \t]*\(.*\)[ \t]*\{.*_moduleLib\(.*\}[ \t]*$/.test(ln);
            if (__isDeleg) __deleg.push(ln);
            return !__isDeleg;
        })
        .join(String.fromCharCode(10));
    return __face.files.map((f) => __squeeze(f.raw)).join(String.fromCharCode(10))
        + String.fromCharCode(10) + '// ==== 剥下的单行委派（入口原文，供「出口在场」判据） ====' + String.fromCharCode(10)
        + __deleg.join(String.fromCharCode(10));
}
const srcRaw = __hostSurface();
/* [v3.266.0 A1 第六刀] MemoryGraph / SummarySystem / GameClock / CharacterState 已外移
 *   memory-core.js：本文件的类抽取面与静态面改读「入口 + 该模块」合看（语义一字不改，
 *   只换被读的文件面；不放宽：每一条仍须在场）。 */
const src = srcRaw + String.fromCharCode(10) + readFileSync(new URL('../memory-core.js', import.meta.url), 'utf8');
/* [v3.264.0 A1 第五刀] LLMCaller（rerank / INTENT / _BATCH）与 VectorStore 已外移 memory-organs.js；
 *   抽取面须按「真源所在面」取值（本档多数判据仍是宿主级：BM25 缓存三处调用点、age 锚点在宿主）。 */
const orgSrc = readFileSync(new URL('../memory-organs.js', import.meta.url), 'utf8');
const pickSrc = (marker) => (src.includes(marker) ? src : orgSrc);

function braceEnd(str, openBraceIdx) {
    let depth = 0;
    for (let i = openBraceIdx; i < str.length; i++) {
        const ch = str[i];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return i; }
        else if (ch === "'" || ch === '"' || ch === '`') { const q = ch; i++; while (i < str.length && str[i] !== q) { if (str[i] === '\\') i++; i++; } }
        else if (ch === '/' && str[i + 1] === '/') { while (i < str.length && str[i] !== '\n') i++; }
    }
    return -1;
}
function extractFn(name) {
    let start = src.indexOf(`async function ${name}(`);
    if (start < 0) start = src.indexOf(`function ${name}(`);
    if (start < 0) throw new Error('missing fn ' + name);
    const brace = src.indexOf('{', src.indexOf(')', start));
    const end = braceEnd(src, brace);
    return src.slice(start, end + 1);
}

test('【1】结构断言：四件套接线齐备', () => {
    assert.ok(src.includes('_corpusFp'), 'BM25 语料缓存指纹存在');
    assert.ok(pickSrc('const _BATCH = 300').includes('const _BATCH = 300'), 'rerank 分批常量存在（[v3.264.0] 已随 LLMCaller 外移）');
    assert.ok(pickSrc('INTENT:').includes('INTENT:'), 'INTENT 提示词存在（[v3.264.0] 已随 LLMCaller 外移）');
    assert.ok(src.includes('getLastIntent'), 'INTENT getter 调用点存在（宿主消费侧）');
    assert.ok(src.includes('ageAnchorTime'), 'age 锚点字段存在');
    assert.ok(src.includes('getEffectiveAge'), 'getEffectiveAge 存在');
    // 三处 BM25 rebuild 调用点全部走缓存
    assert.strictEqual((src.match(/bm25\.rebuild\(_docs\)/g) || []).length, 3, '三处 rebuild 全部走缓存判定');
});

test('【2】行为：BM25 语料缓存——素材指纹一致跳过重建', () => {
    // 不变式：rebuild(_docs) 三处全部包裹在「指纹变了才重建」判定内（rebuild 次数 == 落指纹次数 == 3）
    assert.strictEqual((src.match(/this\.bm25\.rebuild\(_docs\)/g) || []).length, 3, 'rebuild(_docs) 恰好 3 处');
    assert.strictEqual((src.match(/this\.bm25\._corpusFp = _fp/g) || []).length, 3, '落指纹恰好 3 处（每次 rebuild 必落指纹）');
    assert.strictEqual((src.match(/_fp !== this\.bm25\._corpusFp/g) || []).length, 3, '指纹比对恰好 3 处');
    // 不存在绕过缓存的裸 rebuild
    assert.strictEqual((src.match(/this\.bm25\.rebuild\(this\.summary/g) || []).length, 0, '无绕过缓存的裸 rebuild 残留');
});

test('【3】行为：rerank 分批——超 300 条递归分批', () => {
    // LLMCaller.rerank 是类方法（非顶层 function），用直接源断言
    const _bs = pickSrc('const _BATCH = 300;');
    const idx = _bs.indexOf('const _BATCH = 300;');
    assert.ok(idx > 0, '分批入口存在');
    const batchBlock = _bs.slice(idx, idx + 500);
    assert.ok(batchBlock.includes('docs.slice(bi, bi + _BATCH)'), '按批切片');
    assert.ok(batchBlock.includes('await this.rerank(query, sub)'), '子批递归复用本方法');
    assert.ok(batchBlock.includes('orderParts.push(bi + si)'), '子批索引折算回全量索引');
});

test('【4】行为：INTENT 解析与 rerank 接线', () => {
    /* [v3.264.0] INTENT 行解析与上限钳制随 LLMCaller 外移 memory-organs.js（宿主只留消费点）。 */
    assert.ok(/INTENT[:：]/.test(orgSrc), 'INTENT 行解析正则存在（[v3.264.0] 已随 LLMCaller 外移）');
    /* [v3.421.0] 消费点随 rerank 外移 engine-recall.js：模块式写法用形参 engine 代替 this。 */
    assert.ok(/const _rq = \((this|engine)\.llm\.getLastIntent\?\.\(\) \|\| query\.text\)/.test(src), 'rerank 消费 INTENT 优先（宿主消费侧）');
    assert.ok(orgSrc.includes('lines.slice(0, 6)'), '检索 Q 上限 6 条（[v3.264.0] 已随 LLMCaller 外移）');
    assert.ok(orgSrc.includes('clean.length <= 220'), '检索 Q 长度上限 220（[v3.264.0] 已随 LLMCaller 外移）');
});

test('【5】行为：age 锚点机制', () => {
    // setProtagonist 盖锚点
    assert.ok(src.includes('this.protagonist.ageAnchorTime = String(storyDateStr)'), '提取侧盖锚点');
    // 数字年龄按「锚点年龄+年份差」推算
    assert.ok(src.includes('const eff = n + (now.year - anchor.year)'), '数字年龄年份差推算');
    // 日期年龄按 calcAge(生日, 当前) 推算
    assert.ok(src.includes('this.clock.calcAge?.(ageStr, currentStoryDateStr)'), '生日口径推算');
    // 注入侧传当前剧情日期
    assert.ok(src.includes('getProtagonistPrompt?.(this.clock?.date'), '注入侧接线当前剧情日期');
    // 提取侧 setProtagonist 传锚点日期
    assert.strictEqual((src.match(/setProtagonist\(extracted\.protagonist, (floor|idx), this\.clock\?\.date/g) || []).length, 2, '两处提取点均传锚点日期');
});