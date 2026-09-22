/* ============================================================
 * v3.152.0 — ANIMA 词典线闭环（术语词典 + BM25 双端归一 + 持久化契约 + 感知配额）
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import path from 'node:path';
const ROOT = '/home/user/lonsha-memory-plugin';
const src = readFileSync(path.join(ROOT, 'index.js'), 'utf-8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8'));
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));

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
/* [v3.157] extract the zero-value kernel from the source so the class under test
   gets the real implementation, not a stale local copy. */
function extractKernel(source) {
    const at = source.indexOf('function numOr(');
    if (at < 0) throw new Error('numOr kernel not found in index.js');
    let depth = 0, started = false;
    for (let i = at; i < source.length; i++) {
        const ch = source[i];
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') { depth--; if (started && depth === 0) return source.slice(at, i + 1); }
    }
    throw new Error('numOr kernel is not brace balanced');
}
const numOrFromSource = new Function('return (' + extractKernel(src) + ')')();

function vnum(s) {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

// ================= 1. 结构接线 =================
test('【1】结构接线：词典类/双端归一/持久化/感知配额', () => {
    assert.ok(src.includes('window.LonShaEntityLexicon'), 'A1 词典库挂载点');
    assert.ok(src.includes('class EntityLexicon'), 'A1 词典类在 index.js（内联，零加载依赖）');
    assert.ok(src.includes('this._lexNormalize('), 'A2 BM25 文档端归一');
    assert.ok(src.includes('normalizeQueryByLexicon('), 'A2 查询端归一');
    assert.ok(src.includes('termLexiconEnabled'), 'A1 开关');
    assert.ok(src.includes('bm25LexiconNormalizeEnabled'), 'A2 开关');
    assert.ok(src.includes('statusAwareQuotaEnabled'), 'B1 开关');
    assert.ok(src.includes('computeRecallQuota()'), 'B1 配额计算器');
    assert.ok(src.includes("lexicon: this.lexicon.export(),"), 'P1 collectExport');
    assert.ok(src.includes("_imp('lexicon'"), 'P2 restoreFromPayload');
});

// ================= 2. EntityLexicon 纯类行为 =================
test('【2】EntityLexicon：resolve 匹配/词边界/NFKC/条数上限/超限淘汰', () => {
    // [v3.157] EntityLexicon 构造器取值已走零值安全内核 numOr（实体类不再自包含取值逻辑）。
    //   载体随源迁移：内核从源码里提取后注入，而不是本地复制一份（防语义漂移）。
    const Lex = new Function('numOr', 'return (' + extractClass(src, 'class EntityLexicon') + ')')(numOrFromSource);
    const lx = new Lex();
    // 构造期不依赖宿主
    assert.ok(lx && typeof lx.resolve === 'function', '构造零依赖');
    assert.deepStrictEqual(lx.export(), [], '空导出');

    const r1 = lx.resolve('默默', 12);
    assert.ok(r1 && r1.terms.includes('默默'), 'resolve 登记首见术语');
    assert.strictEqual(lx.export().length, 1, '登记后 1 条');
    // 同对话同一 surface 重复命中 → 次数累积，floor 取更大
    lx.resolve('默默', 20);
    let e = lx.export()[0];
    assert.strictEqual(e.count, 2, 'count 累积');
    assert.strictEqual(e.lastFloor, 20, 'lastFloor 前进');

    // NFKC 等价：全角拉丁归一
    lx.resolve('ＢＬＡＤＥ', 30);   // 全角
    lx.resolve('BLADE', 31);       // 半角
    e = lx.export().find(x => x.canon === 'blade');
    assert.ok(e, 'NFKC 归一合并');
    assert.strictEqual(e.count, 2, '归一后同条累积');

    // 词边界：拉丁 3+ 字表面不 substring 命中（BLADE 不命中 BLADEWORKS 内部）
    const lx2 = new Lex();
    lx2.resolve('BLADE', 1);
    assert.strictEqual(lx2.match('BLADEWORKS').length, 0, '拉丁 3+ 字不子串命中');
    assert.strictEqual(lx2.match('the BLADE is sharp').length, 1, '独立词可命中');
    // 单字拒绝（bigram 已天然覆盖，无需入典）
    assert.strictEqual(lx2.resolve('盾', 40), null, '单字不入典');
    assert.strictEqual(lx2.resolve('12', 41), null, '纯数字不入典');

    // 上限与超限淘汰：MAX 40，测试里只灌同一条递增
    const lx3 = new Lex();
    lx3.resolve('测试术语甲', 1);
    for (let i = 2; i <= 60; i++) lx3.resolve(`第${i}号条目`, i);
    const list = lx3.export();
    assert.ok(list.length <= 40, '条数上限 40');
    assert.ok(!list.some(x => x.canon === '测试术语甲'), '低频旧条目被淘汰');
    assert.ok(list.some(x => x.canon === '第60号条目'), '新条目存活');
    // 导入对称
    const lx4 = new Lex();
    lx4.import(list);
    assert.strictEqual(lx4.export().length, list.length, '导入对称');
});

// ================= 3. 词典持久化契约 =================
test('【3】词典随存档持久化（collectExport/restore 对称 + 契约登记）', () => {
    // ARCHIVE_TOP_LEVEL_KEYS 登记在 collectExport 之前
    const keysDecl = src.indexOf('const ARCHIVE_TOP_LEVEL_KEYS = Object.freeze([');
    const lexKey = src.indexOf("'lexicon',", keysDecl);
    assert.ok(lexKey > 0, "契约清单含 'lexicon'");
    // collectExport 在契约清单之后且含 lexicon 导出
    const ce = src.indexOf('collectExport() {');
    assert.ok(ce > keysDecl, 'collectExport 在契约声明之后');
    assert.ok(src.slice(ce, ce + 6000).includes('lexicon: this.lexicon.export(),'), 'collectExport 导出 lexicon');
    // restore 分派
    const rf = src.indexOf('restoreFromPayload(data) {');
    assert.ok(rf > 0, 'restoreFromPayload 存在');
    const lexImp = src.indexOf("_imp('lexicon'", rf);
    assert.ok(lexImp > rf, "restore 分派 _imp('lexicon')");
    // 契约清单内的 'lexicon' 必须是独立一行（不被前缀串味）
    assert.ok(/\n\s*'lexicon',\n/.test(src.slice(keysDecl, src.indexOf(']);', keysDecl))), '契约清单 lexicon 独立成行');
});

// ================= 4. BM25 双端归一接线 =================
test('【4】BM25 词典归一（文档端 + 查询端 + 归一指纹参与语料重建）', () => {
    // 文档端：BM25 内联方法，接在 rebuild 的 docTerms 构建内（开关门控）
    const rb = src.indexOf('rebuild(docs, lexicon = null) {');
    const docNorm = src.indexOf('_lexNormalize(d.text)', rb);
    assert.ok(rb > 0 && docNorm > rb && docNorm < rb + 2000, '文档端归一在 rebuild 内（_lexNormalize）');
    assert.ok(src.includes('normalizeQueryByLexicon(text, lx) { return this._lexExpand(text, lx, true); }'), 'BM25.normalizeQueryByLexicon 方法存在');
    // 查询端：searchBranches 的 active 分支构建处经 _expandAliases 链
    const sb = src.indexOf('searchBranches(branches, topK = 5, opts = {}) {');
    const qNorm = src.indexOf('this._expandAliases(', sb);
    const qLex = src.indexOf('normalizeQueryByLexicon(', sb);
    assert.ok(sb > 0 && qNorm > sb && qNorm < sb + 1200, '查询端 _expandAliases 在 searchBranches 内');
    assert.ok(qLex > 0 && qLex < sb + 1200, '查询端词典归一在 searchBranches 内');
    // 归一指纹独立于 _corpusFp（v3148 硬约束：词典状态不入 _corpusFp，走失效-重建通路）
    assert.ok(src.includes('this._lexFp ='), '归一指纹字段 _lexFp');
    const rbfp = src.indexOf('this._lexFp =', rb);
    assert.ok(rbfp > rb && rbfp < rb + 900, 'rebuild 内计算 _lexFp');
    assert.ok(src.includes("if (this.bm25) this.bm25._corpusFp = '';"), '_invalidateBm25Corpus 走置空通路');
});

// ================= 5. 感知配额 =================
test('【5】感知配额：computeRecallQuota 接线与数据源', () => {
    const q = src.indexOf('computeRecallQuota() {');
    assert.ok(q > 0, 'computeRecallQuota 方法存在');
    // 数据源引用（outline stage tempo / 冲突账本 / 悬念簿）
    const seg = src.slice(q, q + 2400);
    assert.ok(seg.includes('outline?.stage?.tempo'), 'tempo 臂');
    assert.ok(seg.includes('conflicts?.conflicts'), '冲突臂');
    assert.ok(seg.includes('suspense?.openItems'), '悬念臂');
    // 消费端：bm25 检索 topK 与 vector 检索 topK 均经配额
    const bm = src.indexOf("const bmTopK = Math.round((this.config.config.bm25TopK || 5) * this.computeRecallQuota());");
    assert.ok(bm > 0, 'bm25 topK 经配额行存在');
    assert.ok(src.slice(bm, bm + 400).includes('computeRecallQuota()'), 'bm25 topK 经配额');
    const vs = src.indexOf('await this.vector.search(query.text,');
    assert.ok(vs > 0, 'vector 检索行');
    assert.ok(src.slice(vs - 700, vs + 300).includes('computeRecallQuota()'), 'vector topK 经配额');
});

// ================= 6. 提取管线登记到词典（查询端数据来源） =================
test('【6】提取产物登记词典（surface 化，查询端单真源）', () => {
    const ex = src.indexOf('async extractMemoryWithLLM(message) {');
    assert.ok(ex > 0, '提取方法存在');
    // [v3.184] 窗口由 6400 提到 8000：提示词填充改走 fuzzy-patch（patchTokens）后方法体变长，
    //   原窗口恰好切在条款边界内（下方 patchTokens 断言因此曾取不到）。
    const seg = src.slice(ex, ex + 8000);
    assert.ok(seg.includes('this.lexicon.resolve('), '提取产物 resolve 登记');
    // 别名通道同步喂图（省一轮 LLM）
    assert.ok(seg.includes('const node = [...this.graph.nodes.values()].find'), '别名喂图按节点查找');
    assert.ok(seg.includes("(node.data?.aliases || [])"), '图节点别名集合');
    // [v3.184] 占位符填充改走 fuzzy-patch：{{LORE}}/{{ROLE_COUNT}} 必须经 patchTokens 落
    //   （字面 replace 在占位符被写成全角/带空格形态时零命中，且无日志）。
    assert.ok(seg.includes('patchTokens'), '占位符经宽容匹配填充');
});

// ================= 7. 开关登记 settings-ui + 配置白名单消解 =================
test('【7】settings-ui 登记 + v3113 白名单消解', () => {
    const sui = readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf-8');
    for (const k of ['termLexiconEnabled', 'bm25LexiconNormalizeEnabled', 'statusAwareQuotaEnabled']) {
        assert.ok(sui.includes(`ck('${k}'`), `ck() 登记: ${k}`);
    }
    assert.ok(sui.includes('termLexiconMax'), '数值键 UI 可编辑');
    // v3113【6】白名单（tests/v3113_config_coverage.test.mjs）登记新键豁免
    const t3113 = readFileSync(path.join(ROOT, 'tests/v3113_config_coverage.test.mjs'), 'utf-8');
    const wl = t3113.indexOf("const allowed = new Set([");
    assert.ok(wl > 0, 'v3113 白名单存在');
    const wlSeg = t3113.slice(wl, wl + 1200);
    assert.ok(wlSeg.includes('termLexiconEnabled'), '白名单豁免 termLexiconEnabled');
    assert.ok(wlSeg.includes('bm25LexiconNormalizeEnabled'), '白名单豁免 bm25LexiconNormalizeEnabled（随主开关，无独立 UI）');
});

// ================= 8. 版本下限（当版独占的 CHANGELOG/旧锚点断言交后续版本测试接管）=================
test('【8】版本下限 >= 3.152.0', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    assert.ok(vnum(v) >= vnum('3.152.0'), `index.js 版本 ${v} >= 3.152.0`);
    assert.ok(vnum(manifest.version) >= vnum('3.152.0'), 'manifest 版本');
    assert.ok(vnum(pkg.version) >= vnum('3.152.0'), 'package 版本');
});

// ================= 9. 语法护栏（词典类花括号配平） =================
test('【9】词典类块配平（防提取错类）', () => {
    const cls = extractClass(src, 'class EntityLexicon');
    assert.ok(cls && cls.length > 1000, '类完整提取');
    assert.ok(cls.includes('export()'), '含 export 方法');
    assert.ok(cls.includes('import('), '含 import 方法');
    assert.ok(cls.includes('resolve('), '含 resolve 方法');
    assert.ok(cls.includes('normalizeText('), '含 normalizeText');
    assert.ok(cls.includes('promptRules()'), '含 promptRules');
    assert.ok(cls.includes('match('), '含 match 方法');
    assert.ok(cls.includes('_lexExpand') === false, '词典类不包含 BM25 归一方（职责分离）');
});
