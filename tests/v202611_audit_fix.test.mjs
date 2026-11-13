// [v2026.11 记忆摄取审计修] 判据：近重复合并 / 设定层守门 / 旁路思维链剥离
// 背景：实测两个楼层把「确认题材/文风/边界」的设定 echo 各记一条进剧情时间线（★5），
//   摄取管线三处真缺陷：① PlotTimeline.add 只做逐字判重；② 补提取/批量补齐旁路
//   只剥标签壳不剥思维链；③ 提取 prompt 无设定层/剧情层区分。本档逐条钉住。
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = new URL('..', import.meta.url).pathname;
const read = (f) => fs.readFileSync(ROOT + f, 'utf8');

/* ═══ A · PlotTimeline 近重复合并（行为真跑） ═══ */
const { PlotTimeline } = require(ROOT + 'memory-books.js');
test('A1 归一后同日近似文本合并为一条（修前会各存一条）', () => {
    const tl = new PlotTimeline();
    const a = tl.add('2010年7月28日', '确认故事题材：日式科幻悬疑，非NSFW场景。', 2, [], 5);
    const b = tl.add('2010年7月28日', '确认故事题材: 现代日式科幻悬疑，非NSFW场景', 4, [], 5);
    assert.equal(tl.entries.length, 1, '同日近似文本必须合并，实得 ' + tl.entries.length + ' 条');
    assert.equal(b, a, '第二次 add 必须返回首见条目（merge 而非新建）');
    assert.equal(a.repeatCount, 2, '重复次数必须累计');
    assert.equal(a.floor, 4, 'floor 更新为最新楼层');
});
test('A2 不同日期同文本不合并（时间线保事件演进）', () => {
    const tl = new PlotTimeline();
    tl.add('7月1日', '两人抵达车站准备出发', 1, [], 5);
    const e2 = tl.add('7月2日', '两人抵达车站准备出发', 2, [], 5);
    assert.equal(tl.entries.length, 2, '不同日期是两件事');
    assert.ok(e2 && e2.id !== tl.entries[0].id);
});
test('A3 短文本（<12归一字）不参与近似判重，防误并', () => {
    const tl = new PlotTimeline();
    tl.add('7月1日', '他走了', 1, [], 5);
    const e2 = tl.add('7月1日', '他走了啊', 2, [], 5);
    assert.equal(tl.entries.length, 2, '短文本不得被子串规则误并');
});
test('A4 不同事件即使同日也不许误并（子串包含才并）', () => {
    const tl = new PlotTimeline();
    tl.add('7月1日', '主角把怀表交给弯弯并叮嘱她收好', 1, [], 7);
    const e2 = tl.add('7月1日', '弯弯收下怀表后在站台独自等车离开', 2, [], 5);
    assert.equal(tl.entries.length, 2, '无包含关系的两条真事件必须都保留');
});
test('A5 merge 取较高重要度（首见低、后来高 ⇒ 提升）', () => {
    const tl = new PlotTimeline();
    const a = tl.add('7月1日', '主角与沈青梧在钟楼立下三年之约', 1, [], 4);
    tl.add('7月1日', '主角与沈青梧在钟楼立下了三年之约', 2, [], 8);
    assert.equal(a.importance, 8, 'merge 必须取较高重要度');
    assert.equal(tl.entries.length, 1);
});

/* ═══ B · 设定层守门（时间线入库前兜底） ═══ */
test('B1 engine-execution-pipeline 有设定层 echo 守门且 opLog 留痕', () => {
    const src = read('engine-execution-pipeline.js');
    assert.ok(src.includes('skip-meta-echo'), '守门必须有 opLog 留痕（不静默丢弃）');
    assert.ok(/故事题材[\s\S]*?语言风格/.test(src), '守门特征词表必须在场');
    assert.ok(src.includes('设定层 echo 不进时间线'), '守门必须有注释交代口径');
});
test('B2 提取 prompt 有「设定层/剧情层」前置排除规则（源头规则0）', () => {
    const cfg = read('memory-config.js');
    assert.ok(cfg.includes('【提取规则·前置排除（最高优先）】'), 'prompt 必须有前置排除段');
    assert.ok(cfg.includes('设定层元信息，不是剧情内发生的事'), '必须写明设定层/剧情层区分');
    assert.ok(cfg.includes('严禁出现在 summary、events、characters'), '排除面必须点名三个产出字段');
});

/* ═══ C · 旁路思维链剥离 ═══ */
test('C1 补提取旁路先剥思维链再剥标签（与主链路同语义）', () => {
    const src = read('index.js');
    assert.ok(src.includes('stripThinkingText'), '引擎必须暴露 stripThinkingText 对外出口');
    // 补提取路径：extractThinkingChain 在 cleanMessageText 之前
    const i = src.indexOf('const _tcBF = extractThinkingChain(msg.mes');
    assert.ok(i > 0, '补提取旁路必须先 extractThinkingChain');
    const after = src.slice(i, i + 400);
    assert.ok(after.includes('cleanMessageText'), '剥离后必须再走 cleanMessageText');
});
test('C2 批量补齐 chatLookup 不再原样回传 m.mes', () => {
    const ui = read('settings-ui.js');
    assert.ok(!ui.includes("completeMissingFloors(s.config.config, s.llm, (f) => String(chat?.[f]?.mes || '')"), '原样回传 m.mes 的旧路径必须已移除');
    assert.ok(ui.includes('_stripThink'), 'chatLookup 必须过思维链剥离');
});
test('C3 extractThinkingChain 行为自证：think 块剥离、正文保留', () => {
    // 从 index.js 抽函数真跑（replicate v332 的抠函数手法，这里用构造隔离环境）
    const src = read('index.js');
    const i = src.indexOf('function extractThinkingChain');
    const j = src.indexOf('function thinkingAnchorHeader');
    assert.ok(i > 0 && j > i, '函数定位');
    const fnSrc = src.slice(i, j);
    const fn = new Function(fnSrc + '\nreturn extractThinkingChain;')();
    const r = fn('旁白：雨停了。\n<think>用户想要日式科幻悬疑，先确认题材再写。严禁古风。</think>\n她推开门走进来。');
    assert.equal(r.content.includes('题材'), false, '思维链内容不得出现在正文');
    assert.equal(r.content.includes('她推开门走进来'), true, '正文必须保留');
    assert.ok(r.thinking.includes('日式科幻悬疑'), '思维链进 thinking 通道');
});
