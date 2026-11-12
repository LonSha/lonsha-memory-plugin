// tests/v21_x8_operation_echo.test.mjs — L21-X8 一次操作的完整回声四档 [v3.466.0]
// 八条判定 + 负控制（把「判不了」并进「未受影响」⇒ 红）+ 接线真消费。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const _mod = await import('../operation-echo-report.js');
const lib = (_mod.default ?? _mod);

test('T1 四档三态：规则外 ⇒ unaffected', () => {
    const e = { seq: 1, type: 'diary', op: 'add', ref: 'd1', floor: 3, meta: '' };
    const echo = lib.echoForEntry(e, {});
    assert.equal(echo.flat.length, 4);
    for (const f of echo.flat) assert.equal(f.state, 'unaffected', f.facet + ' 应不受影响');
});

test('T2 规则内 + ctx 有读数 ⇒ affected 带 detail', () => {
    const e = { seq: 2, type: 'locked_fact', op: 'update', ref: 'lf1', floor: 5, meta: '' };
    const echo = lib.echoForEntry(e, { graph: '2 节点受影响', summary: '3 条待重建', injection: '下次生成会变' });
    const g = echo.facets.graph;
    assert.equal(g.state, 'affected');
    assert.ok(g.detail.includes('图谱') && g.detail.includes('2 节点'), g.detail);
    assert.equal(echo.facets.summary.state, 'affected');
    assert.equal(echo.facets.injection.state, 'affected');
    assert.equal(echo.facets.timeline.state, 'unaffected');
});

test('T3 负控制核心：规则内 + ctx 缺 ⇒ unknown，绝不并进 unaffected', () => {
    const e = { seq: 3, type: 'locked_fact', op: 'remove', ref: 'lf2', floor: 6, meta: '' };
    const echo = lib.echoForEntry(e, {}); // 无任何读数
    assert.equal(echo.facets.graph.state, 'unknown');
    assert.equal(echo.facets.summary.state, 'unknown');
    assert.equal(echo.facets.injection.state, 'unknown');
    assert.ok(echo.facets.graph.detail.includes('判不了'), 'unknown 必须自述「判不了」');
    // 「unknown」与「unaffected」是两个不同字符串 —— 不同形
    assert.notEqual(lib.STATE.UNKNOWN, lib.STATE.UNAFFECTED);
});

test('T4 ctx 读数抛错 ⇒ unknown（不许把异常吞成 unaffected）', () => {
    const e = { seq: 4, type: 'summary', op: 'update', ref: 's1', floor: 7, meta: '' };
    const echo = lib.echoForEntry(e, { summary: () => { throw new Error('boom'); } });
    assert.equal(echo.facets.summary.state, 'unknown');
});

test('T5 验收旅程：改锁定事实 → 图谱/注入/摘要三面齐读', () => {
    const e = { seq: 5, type: 'locked_fact', op: 'update', ref: '答应过帮小明修收音机', floor: 9, meta: '玩家改写' };
    const echo = lib.echoForEntry(e, {
        graph: '2 节点受影响',
        injection: '下次生成会变',
        summary: '待重建'
    });
    const line = lib.formatLine(echo);
    assert.ok(line.includes('↩️ 这次改动牵动了什么'));
    assert.ok(line.includes('✅ graph'), line);
    assert.ok(line.includes('✅ injection'), line);
    assert.ok(line.includes('✅ summary'), line);
    assert.ok(line.includes('⚪ timeline'), line);
});

test('T6 面板记号不同形：三态三种记号', () => {
    const e = { seq: 6, type: 'locked_fact', op: 'update', ref: 'x', floor: 1, meta: '' };
    const echo = lib.echoForEntry(e, { graph: '有', injection: '有' });
    const line = lib.formatLine(echo);
    assert.ok(line.includes('⚠️ summary'), 'unknown 记号 ⚠️ 必须出现');
    assert.ok(line.includes('⚪'), 'unaffected 记号 ⚪ 必须出现');
    assert.ok(line.includes('✅'), 'affected 记号 ✅ 必须出现');
});

test('T7 负控制（结构级）：unknown 与 unaffected 在源码里不得同值/同串', () => {
    const src = readFileSync(new URL('../operation-echo-report.js', import.meta.url), 'utf8');
    assert.ok(src.includes("UNKNOWN: 'unknown'"));
    assert.ok(src.includes("UNAFFECTED: 'unaffected'"));
    // 不许出现把 unknown 直接赋成 unaffected 的合并
    assert.ok(!/UNKNOWN\s*[:=]\s*UNAFFECTED/.test(src), '不得把 unknown 并进 unaffected');
    // unknown 必须有自己的自述文案
    assert.ok(src.includes('判不了'), 'unknown 档必须带「判不了」自述');
});

test('T8 接线真消费：oplog 面板每行真调 echoForEntry + formatLine', () => {
    const src = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');
    const iView = src.indexOf("viewType === 'oplog'");
    const iNext = src.indexOf("viewType === ", iView + 10);
    const seg = src.slice(iView, iNext > 0 ? iNext : iView + 20000);
    assert.ok(seg.includes('echoForEntry'), 'oplog 面板必须真调用 echoForEntry');
    assert.ok(seg.includes('formatLine'), 'oplog 面板必须真调用 formatLine');
    assert.ok(seg.includes('这次改动牵动了什么'), '展开读面必须存在');
});

test('T9 批量回声：echoAll 逐条独立', () => {
    const entries = [
        { seq: 1, type: 'diary', op: 'add', ref: 'd', floor: 1, meta: '' },
        { seq: 2, type: 'graph', op: 'add', ref: 'g', floor: 1, meta: '' }
    ];
    const all = lib.echoAll(entries, { graph: '3 节点' });
    assert.equal(all.length, 2);
    assert.equal(all[0].facets.graph.state, 'unaffected');
    assert.equal(all[1].facets.graph.state, 'affected');
});