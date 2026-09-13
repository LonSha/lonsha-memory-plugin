import { readFileSync } from 'fs';
import { test } from 'node:test';
import assert from 'node:assert';

const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf-8');

test('=== 1. A: backfillFloors 番外楼防护 ===', () => {
    // 循环内防护
    assert.ok(src.includes('[v3.80] A: 番外楼防护'), '防护标记');
    assert.ok(src.includes('if (this.isOmittedFloor(m)) { done.skipped++; continue; }'), '防护逻辑');
    // 防护在提取之前（结构验证：skip 位置早于 extractMemoryWithLLM）
    const bIdx = src.indexOf('async backfillFloors');
    const seg = src.slice(bIdx, bIdx + 4000);
    const omitIdx = seg.indexOf('isOmittedFloor(m)');
    const extractIdx = seg.indexOf('await this.extractMemoryWithLLM(msg)');
    assert.ok(omitIdx > 0 && extractIdx > 0 && omitIdx < extractIdx, '防护在提取之前');
});

test('=== 2. B: backfillFloors 补 protagonist/lifeDetails（与主管线对齐） ===', () => {
    assert.ok(src.includes("errLog(e, 'BF.backfill.主角档案')"), '补提取主角档案');
    // 结构：在 backfillFloors 段内
    const bIdx = src.indexOf('async backfillFloors');
    const seg = src.slice(bIdx, bIdx + 5000);
    assert.ok(seg.includes('this.status.setProtagonist(extracted.protagonist, idx)'), 'setProtagonist 补提取');
    assert.ok(seg.includes('this.status.addLifeDetail(ld, idx)'), 'addLifeDetail 补提取');
    // 与主管线的字段守卫一致
    assert.ok(seg.includes('const hasAny = keys.some(k =>'), 'hasAny 守卫');
});

test('=== 3. C: addManualSummary storyTime 衔接 ===', () => {
    // 签名升级
    assert.ok(src.includes("addManualSummary(floor, text, storyTime = '')"), '签名带 storyTime');
    // storyTime 写入
    assert.ok(src.includes("if (st) s.storyTime = st;"), 'storyTime 写入');
    // completeMissingFloors 提取时间标签
    assert.ok(src.includes('[v3.80] C: 从该楼原文提取时间标签'), '提取标记');
    assert.ok(src.includes('extractDualTimeTags(text)'), '双界标签提取');
    // 逻辑复刻：结束时间优先、start 兜底
    const pickTime = (dta) => {
        let stTag = '';
        if (dta?.hasDual && dta.end) stTag = String(dta.end).split(/\s+/)[0];
        else if (dta?.start) stTag = String(dta.start).split(/\s+/)[0];
        return stTag;
    };
    assert.strictEqual(pickTime({ hasDual: true, start: '2026年3月12日 09:00', end: '2026年3月12日 18:00' }), '2026年3月12日', '双界取 end 日期部分');
    assert.strictEqual(pickTime({ hasDual: false, start: '2026年3月12日 09:00', end: '' }), '2026年3月12日', '单界取 start');
    assert.strictEqual(pickTime(null), '', '空输入安全');
    assert.strictEqual(pickTime({ hasDual: true, start: '', end: '' }), '', '空标签安全');
});

test('=== 4. C: addManualSummary 逻辑复刻（storyTime 可选） ===', () => {
    const mk = (floor, text, storyTime = '') => {
        const t = String(text || '').trim();
        const f = Number(floor);
        if (!t || !Number.isFinite(f) || f < 0) return null;
        const s = { floor: f, text: t, manual: true, importance: 5 };
        const st = String(storyTime || '').trim();
        if (st) s.storyTime = st;
        return s;
    };
    const r1 = mk(3, '剧情摘要', '2026年3月12日');
    assert.strictEqual(r1.storyTime, '2026年3月12日', 'storyTime 写入');
    const r2 = mk(3, '剧情摘要');
    assert.ok(!('storyTime' in r2), '无时间不写字段（向后兼容）');
    const r3 = mk(3, '剧情摘要', '  ');
    assert.ok(!('storyTime' in r3), '空白时间不写字段');
});

test('=== 5. 回归防护 ===', () => {
    assert.ok(src.includes('[v3.80]'), 'v3.80 标记');
    // 旧调用兼容（UI 的 addManualSummary(f, t) 两参调用仍可用——在 settings-ui.js）
    const su = readFileSync('/home/user/lonsha-memory-plugin/settings-ui.js', 'utf-8');
    assert.ok(su.includes('addManualSummary(f, t)'), '旧两参调用保留');
    // completeMissingFloors 签名保留
    assert.ok(src.includes('async completeMissingFloors(config, llm, chatLookup, maxBatch = 5)'), '管线签名保留');
});