/**
 * tests/v3201_summary_reltime_and_diag_ledger.test.mjs — v3.201.0
 *
 * 主题：三方向并行收口（D1/D2/D3）——均为「接了但没接完」的消费面收口。
 *
 *   D1 诊断面消费成本账本（v3.200 的片段匹配读数）：
 *      「提权」与「真进注入」是两件事。旧诊断行只报「提权 N 条」，
 *      提了但被预算挤掉时它照样读得像「机制生效了」。本版让诊断行消费
 *      _lastCostLedger.opposite 三态：待账本 / 不可测 / X/Y 条。
 *   D2 时间感知最小切片 + 摘要注入相对前缀：
 *      createSummary 落 storyTime（新楼 + 替换路径），buildInjection 摘要行
 *      加相对时间前缀（与 timeline 同规格：宁可不标，绝不标错）。
 *      调用侧独立提取（不引用块外 sd——v3.185 queryText 同类坑，本轮实测踩到并修正）。
 *   D3 queryText 残留复核：v3.185 已修，本版零改动；钉子复验（坏字面量零出现）。
 *
 * 判据原则（本仓惯例）：
 *   · 行为优先：D1/D2 用「从源码提取真实方法体/块 + 注入假依赖 + 真跑」的 harness，
 *     不测复刻逻辑；负控制用「真源码破坏 → 同判据转红」。
 *   · 宁可不标：空值 / 不可测 / 跨月一律不加前缀、不编假读数。
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { braceMatch } from './_audit_lib.mjs';
const ROOT = new URL('..', import.meta.url).pathname;
const require_ = createRequire(import.meta.url);
const raw = readFileSync(ROOT + 'index.js', 'utf-8');
const mf = JSON.parse(readFileSync(ROOT + 'manifest.json', 'utf-8'));
const pkg = JSON.parse(readFileSync(ROOT + 'package.json', 'utf-8'));
const changelog = readFileSync(ROOT + 'CHANGELOG.md', 'utf-8');
const NP = require_(ROOT + 'narrative-pulse.js');
const vnum = (v) => Number(String(v).split('.').map((x) => x.padStart(3, '0')).join(''));
const SELF = readFileSync(fileURLToPath(import.meta.url), 'utf-8');

/** 提取方法定义（needle 需含方法体开括号 {；用花括号配平，不被内部块/默认值 {} 误导）。 */
function extractMethod(src, needle) {
    const at = src.indexOf(needle);
    if (at < 0) return null;
    const brace = at + needle.length - 1;
    if (src[brace] !== '{') return null;
    const body = braceMatch(src, brace);
    return body ? src.slice(at, brace + body.length) : null;
}

/* ══════════════ 1. D1 诊断面消费账本读数 ══════════════ */
// harness：从 index.js 提取真实方法体，注入假 engine/依赖，真跑。
//   「假读数防不住」的形态是运行期行为，只有真跑才验得了三态。
const d1 = (() => {
    const method = extractMethod(raw, '_emotionOppositeLine() {');
    assert.ok(method, '必须定位到 _emotionOppositeLine 方法体（结构漂移）');
    const make = (np, broken) => {
        const factory = new Function('NP', 'errLog',
            'const _emotionOppositeLib = () => NP;\nconst obj = { ' + (broken || method) + ' };\nreturn obj._emotionOppositeLine;');
        return factory(np, () => {});
    };
    return { method, make };
})();
const d1Engine = (over) => Object.assign({
    config: { config: { emotionOppositeRecall: true } },
    _emoOppositeRead: { reason: 'ok', dominant: 'sad', hits: 2, scanned: 5, expanded: 0, credibleWords: 3 },
    _emoOppositeRounds: 2, _emoOppositeBoosted: 2,
    _lastCostLedger: null,
}, over || {});

test('v3201 1. D1 三态：账本缺席 → 待账本（不是编 0）', () => {
    const s = d1.make(NP).call(d1Engine({ _lastCostLedger: null }));
    assert.ok(s.includes('真进注入 待账本'), '账本未生成时必须报「待账本」：' + s);
    assert.ok(!/真进注入 0\//.test(s), '不得把「账本缺席」写成 0/N：' + s);
});
test('v3201 2. D1 三态：measurable=false → 不可测（不写 0/N）', () => {
    const s = d1.make(NP).call(d1Engine({ _lastCostLedger: { opposite: { measurable: false, injectedEstimate: null, promotedCount: 2 } } }));
    assert.ok(s.includes('真进注入 不可测'), '不可测的读数必须写「不可测」：' + s);
    assert.ok(!s.includes('0/2'), '不得把不可测写成 0/2：' + s);
});
test('v3201 3. D1 三态：可测 → X/Y 真读数', () => {
    const s = d1.make(NP).call(d1Engine({ _lastCostLedger: { opposite: { measurable: true, injectedEstimate: 1, promotedCount: 2 } } }));
    assert.ok(s.includes('真进注入 1/2 条'), '可测时必须报真读数：' + s);
});
test('v3201 4. D1 既有读数不缩水：主导维/提数/轮数/提权/扫描数仍在场', () => {
    const s = d1.make(NP).call(d1Engine({ _lastCostLedger: { opposite: { measurable: true, injectedEstimate: 2, promotedCount: 2 } } }));
    for (const [label, needle] of [
        ['主导维', '悲主导 → 本轮提 2 条'],
        ['生效轮数', '生效 2 轮'],
        ['提权条数', '提权 2 条'],
        ['扫描条数', '已扫 5 条'],
    ]) assert.ok(s.includes(needle), '缺「' + label + '」：' + s);
});
test('v3201 5. D1 五态守门：未启用 / 模块未加载 / 无反向线索 仍可分辨', () => {
    const off = d1.make(NP).call(d1Engine({ config: { config: { emotionOppositeRecall: false } } }));
    assert.equal(off, '未启用（默认关）', '未启用态');
    const noMod = d1.make(null).call(d1Engine());
    assert.ok(noMod.includes('模块未加载'), '模块缺席态：' + noMod);
    const noLead = d1.make(NP).call(d1Engine({ _emoOppositeRead: { reason: 'no-emotion', dominant: '—' } }));
    assert.ok(noLead.includes('无反向线索') && noLead.includes('无情绪词'), '无线索态须带成因：' + noLead);
    const empty = d1.make(NP).call(d1Engine({ _emoOppositeRead: { reason: 'empty', dominant: null } }));
    assert.ok(empty.includes('无查询文本或无候选'), 'empty 与 no-emotion 不得同形：' + empty);
});
test('v3201 6. D1 负控制：抽掉 measurable 分支 → 「不可测」判据转红', () => {
    const anchor = '_iop.measurable === false';
    const hits = d1.method.split(anchor).length - 1;
    assert.equal(hits, 1, '锚点恰中 1 次');
    const broken = d1.method.replace(anchor, 'false');
    const s = d1.make(NP, broken).call(d1Engine({ _lastCostLedger: { opposite: { measurable: false, injectedEstimate: null, promotedCount: 2 } } }));
    assert.ok(!s.includes('不可测'), '破坏后必须不再报「不可测」（判据转红）：' + s);
    assert.ok(s.includes('0/2'), '破坏后暴露为假 0——这正是本版要防的形态：' + s);
});
test('v3201 6b. D1 静态：诊断行真消费账本对象（非另算一遍）', () => {
    assert.ok(d1.method.includes('this._lastCostLedger && this._lastCostLedger.opposite'), '必须读账本对象');
    assert.ok(d1.method.includes("'待账本'"), '三态之一在场');
    assert.ok(d1.method.includes("'不可测'"), '三态之二在场');
    assert.ok(d1.method.includes('Number(_iop.injectedEstimate) || 0}'), '三态之三在场（X/Y 条）');
});

/* ══════════════ 2. D2 摘要注入相对前缀（真跑源码块） ══════════════ */
function extractFunction(src, marker) {
    const at = src.indexOf(marker);
    if (at < 0) return null;
    let depth = 0, started = false;
    for (let i = at; i < src.length; i++) {
        const ch = src[i];
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(at, i + 1); }
    }
    return null;
}
const d2render = (() => {
    const at = raw.indexOf('if (summaries.length) {');
    assert.ok(at > 0, '摘要渲染块必须在场');
    const brace = raw.indexOf('{', at);
    const body = braceMatch(raw, brace);
    assert.ok(body, '摘要渲染块必须可配平');
    const block = raw.slice(at, brace + body.length);
    const pFn = extractFunction(raw, 'function parseStoryDateLoose');
    const rFn = extractFunction(raw, 'function relativeTimeLabel');
    assert.ok(pFn && rFn, '时间函数可提取');
    const mk = (blk) => (list, eng) => {
        const fn = new Function('list', 'blocks', pFn + '\n' + rFn + '\nconst summaries = list;\n' + blk + '\nreturn blocks;');
        return fn.call(eng, list, []);
    };
    return { block, mk };
})();
const d2Eng = (relTime, date, latest) => ({
    config: { config: { relativeTime: relTime !== false } },
    clock: { date: date === undefined ? '2026/9/10' : date },
    getLatestStoryDate: () => latest === undefined ? '2026/9/10' : latest,
});

test('v3201 7. D2 前缀：摘要带 storyTime 时注入行加相对后缀（真跑源码块）', () => {
    const out = d2render.mk(d2render.block)([{ text: '她搬来的那个晚上', storyTime: '2026/9/8' }], d2Eng(true));
    assert.ok(out.some((x) => x === '- 她搬来的那个晚上（前天）'), '须带相对前缀：' + JSON.stringify(out));
});
test('v3201 8. D2 宁可不标：无 storyTime / 空锚点 / 开关关 / 跨月架空历 → 一律不加', () => {
    const mk = d2render.mk(d2render.block);
    const a = mk([{ text: '无时间条' }], d2Eng(true));
    assert.ok(a.includes('- 无时间条') && !a.some((x) => x.includes('无时间条（')), '无 storyTime 不得加');
    const b = mk([{ text: '无锚点', storyTime: '2026/9/8' }], d2Eng(true, '', ''));
    assert.ok(!b.some((x) => x.includes('无锚点（')), '锚点为空不得加');
    const c = mk([{ text: '开关关', storyTime: '2026/9/8' }], d2Eng(false));
    assert.ok(!c.some((x) => x.includes('开关关（')), 'relativeTime=false 不得加');
    const d = mk([{ text: '跨月', storyTime: '霜月3日' }], d2Eng(true, '雪月5日'));
    assert.ok(!d.some((x) => x.includes('跨月（')), '架空历跨月不得加（宁可不标）');
});
test('v3201 9. D2 架空历同日历可标：霜月3日 → 霜月5日 标「2天前」', () => {
    const out = d2render.mk(d2render.block)([{ text: '灯会那晚', storyTime: '霜月3日' }], d2Eng(true, '霜月5日'));
    assert.ok(out.some((x) => x === '- 灯会那晚（2天前）'), JSON.stringify(out));
});
test('v3201 10. D2 负控制：移除前缀拼装 → 同一判据转红', () => {
    const part = "${_rel ? '（' + _rel + '）' : ''}";
    const hits = d2render.block.split(part).length - 1;
    assert.equal(hits, 1, '锚点恰中 1 次');
    const broken = d2render.block.replace(part, '');
    const out = d2render.mk(broken)([{ text: '她搬来的那个晚上', storyTime: '2026/9/8' }], d2Eng(true));
    assert.ok(!out.some((x) => x.includes('（前天）')), '破坏后前缀消失（判据转红）');
});

/* ══════════════ 3. D2 storyTime 落账（createSummary 真跑） ══════════════ */
const csObj = (() => {
    const method = extractMethod(raw, 'async createSummary(message, llmSummary, opts = {}) {');
    assert.ok(method, '必须定位到 createSummary 方法体');
    return new Function('return { ' + method + ' };')();
})();
const csFake = () => ({ summaries: [], smartTruncate: (t, n) => String(t || '').slice(0, n || 200), _reportError: () => {} });

test('v3201 11. D2 新楼落 storyTime（注入侧消费的前提）', async () => {
    const f = csFake();
    const s = await csObj.createSummary.call(f, { index: 7, mes: '' }, '摘要正文', { storyTime: '2026/9/10' });
    assert.equal(s.storyTime, '2026/9/10');
    assert.equal(f.summaries.length, 1);
    assert.equal(f.summaries[0].storyTime, '2026/9/10', '落进存储的条目也须带');
});
test('v3201 12. D2 替换路径落 storyTime（同楼重提取）', async () => {
    const f = csFake();
    f.summaries.push({ floor: 7, text: '旧文本', timestamp: 1 });
    const s = await csObj.createSummary.call(f, { index: 7, mes: '' }, '新文本', { storyTime: '2026/9/10' });
    assert.equal(s.storyTime, '2026/9/10');
    assert.equal(f.summaries[0].text, '新文本');
    assert.equal(f.summaries[0].storyTime, '2026/9/10');
});
test('v3201 13. D2 空值不写字段；同文本替换不被动补写（既有去重语义不被动摇）', async () => {
    const f1 = csFake();
    const s1 = await csObj.createSummary.call(f1, { index: 8, mes: '' }, '文本X', { storyTime: '   ' });
    assert.ok(!('storyTime' in s1), '空白 storyTime 不得写字段：' + JSON.stringify(s1));
    const f2 = csFake();
    f2.summaries.push({ floor: 9, text: '同文本', timestamp: 2 });
    const s2 = await csObj.createSummary.call(f2, { index: 9, mes: '' }, '同文本', { storyTime: '2026/9/10' });
    assert.ok(!('storyTime' in s2), '文本未变化的替换路径不得补写（本版不动既有语义）');
});
test('v3201 14. D2 调用侧独立提取：不引用块外 sd（跨块 ReferenceError 坑）', () => {
    assert.ok(raw.includes("let _summaryStoryTime = '';"), '独立声明必须在场');
    assert.ok(raw.includes('storyTime: _summaryStoryTime'), '值必须传给 createSummary');
    assert.equal(raw.split('storyTime: sd').length - 1, 0, '不得引用块外 sd（v3.185 queryText 同类坑）');
    assert.ok(raw.includes("errLog(e, 'createSummary.storyTime')"), '提取异常不得冒泡（catch 留痕）');
});
test('v3201 15. D2 双口径提取在场：正文标签 end 优先', () => {
    assert.ok(raw.includes("_summaryStoryTime = String(this.extractStoryDate(message.mes || '', extracted?.story_date) || '').trim();"));
    assert.ok(raw.includes('const _endDate2 = String(_dta2.end).split(/\\s+/)[0];'), '双时间标签 end 提取');
    assert.ok(raw.includes('if (_endDate2 && /[\\d年月/.]/.test(_endDate2)) _summaryStoryTime = _endDate2;'), '仅当 end 形态像日期才采用');
});

/* ══════════════ 4. D3 queryText 残留复核 ══════════════ */
test('v3201 16. D3 queryText 残留复核：坏字面量零出现、好调用恰一次', () => {
    assert.equal(raw.split('intentRerank(merged, queryText);').length - 1, 0, '坏形态零出现（本版零改动，复核无回归）');
    assert.equal(raw.split('this.intentRerank(merged, query.text);').length - 1, 1, '好形态恰好一次');
});

/* ══════════════ 5. 发布卫生 ══════════════ */
test('v3201 17. 版本三源同源且为 3.201.0', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(raw)[1];
    assert.equal(v, '3.202.0', 'index.js 版本');
    assert.equal(mf.version, v, 'manifest 跟随');
    assert.equal(pkg.version, v, 'package 跟随');
});
test('v3201 18. CHANGELOG 顶节不低于本版，且记录本版三方向', () => {
    // 口径与 v3186 测试 22 一致：只要求「顶节 >= 本版」——
    //   下一版接管时把新节加在顶上，本版记录仍须在文件中可查。
    const top = (changelog.match(/^## (v[0-9.]+)/m) || [])[1];
    assert.ok(top, 'CHANGELOG 必须有序节');
    assert.ok(vnum(top.replace('v', '')) >= vnum('3.202.0'), '顶节 ' + top + ' 须不低于本版');
    assert.ok(changelog.includes('真进注入'), 'D1 须记录');
    assert.ok(changelog.includes('storyTime') || changelog.includes('相对时间'), 'D2 须记录');
    assert.ok(changelog.includes('queryText'), 'D3 复核须记录');
});
test('v3201 19. 本文件已入 tests/ 且锚着本版（下一版接管时抬它）', () => {
    const selfHits = [...SELF.matchAll(/vnum\('([0-9.]+)'\)/g)].map((m) => vnum(m[1]));
    assert.ok(selfHits.length > 0, '本文件须有版本下界断言');
    assert.ok(selfHits.some((h) => h === vnum('3.202.0')), 'frontier 交棒：下界须含本版');
    assert.ok(selfHits.every((h) => h <= vnum('3.202.0')), '不得越界承诺未来');
});
test('v3201 20. 判据面自防护：断言数 / 代码行 / 关键指纹不得缩水', () => {
    const nAssert = (SELF.match(/assert[.]/g) || []).length;
    assert.ok(nAssert >= 55, '断言数不得缩水（>= 55），实际 ' + nAssert + ' —— 判据被删或改宽松时此处必须响');
    const nlCodeLines = SELF.split('\n').filter((l) => { const s = l.trim(); return s && !s.startsWith('//') && !s.startsWith('*') && !s.startsWith('/*'); }).length;
    assert.ok(nlCodeLines >= 140, '代码行不得缩水（>= 140），实际 ' + nlCodeLines);
    for (const [label, need] of [
        ['D1 三态读数', '真进注入 ' + '待账本'],
        ['D1 不可测', '不可' + '测'],
        ['D2 前缀拼装指纹', "${_rel ? '（'"],
        ['D2 独立提取', "let _summaryStoryTime = '';"],
        ['坏串零出现判据', "split('intentRerank(merged, queryText);')"],
    ]) {
        assert.ok(SELF.includes(need), '关键指纹缺失：' + label);
    }
});
