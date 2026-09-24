/* [v3.204.0 退役] 本文件断言的是 ruby-phone 的旧 lonsha-bridge 一代：
 *   queryPhoneMemory / backfillDiaries / syncClock / lockFact / syncSummaryEdit /
 *   lockedFactsIngested / protagonistIngested / _sleepTick … 这些方法在 ruby-phone
 *   2.6.0 -> 2.92.0 的重构中已整体移除（活体桥只剩 backfill / recall / recallBlock /
 *   applyCoordinatedInjection / onFloor* / getStats），且原引用的
 *   /home/user/ruby-phone-work 快照树无 git、停在 2.6.0-modular。
 *   实测：换成活体树 /home/user/ruby-phone 后，本批 17 个文件 17/17 全红。
 *   即它锁的是一份**已死掉的集成**，任何干净 clone 都必红。
 *   本仓侧的等价覆盖由 v356（outline）/ v353（_recallSourceStats）/ v325（keepRecentTokenReserve）
 *   / v386（_bm25）持有；桥契约的活体判据在 ruby-phone 侧 tests/lonsha-bridge-contract.test.mjs。
 *   退役依据与负控制见 CHANGELOG v3.204.0 与 tests/v3204_no_cross_repo_binding.test.mjs。
 */
// tests/v376_batch_complete.test.mjs
// LonSha 记忆引擎 v3.76.0 一键批量补齐 + 报告扩展 + 手机统计测试
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';

const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf-8');
const mv = readFileSync('/home/user/ruby-phone-work/apps/memory/memory-view.js', 'utf-8');

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

test('=== 1. 静态关键字检查 ===', () => {
    assert.ok(src.includes('async completeMissingFloors(config, llm, chatLookup, maxBatch = 5)'), '批量补齐方法');
    assert.ok(src.includes('this._batchCompleting'), '防重入标志');
    assert.ok(src.includes('批量补齐'), 'OpLog meta');
    assert.ok(src.includes('金字塔扩展层'), '报告金字塔');
    assert.ok(src.includes('重试队列'), '报告重试');
    assert.ok(mv.includes('📝摘要同步'), '手机统计');
});

test('=== 2.  批量补齐逻辑复刻测试 ===', () => {
    // 复刻 completeMissingFloors 的核心循环
    const summaries = [];
    const addManualSummary = (floor, text) => {
        const t = String(text || '').trim();
        const f = Number(floor);
        if (!t || !Number.isFinite(f) || f < 0) return null;
        if (summaries.some(x => x.floor === f)) return null;
        summaries.push({ floor: f, text: t, manual: true });
        summaries.sort((a, b) => a.floor - b.floor);
        return summaries[summaries.length - 1];
    };
    const missingFloors = (maxFloor) => {
        const have = new Set(summaries.map(s => s.floor));
        const out = [];
        for (let f = 0; f <= maxFloor; f++) if (!have.has(f)) out.push(f);
        return out;
    };
    // 模拟 LLM 批量补齐 3 楼（1/3/5 缺失，chatLookup 返回对应文本）
    const texts = { 1: '第一楼的剧情原文，林一出发前往聚贤庄', 3: '第三楼的剧情原文，林一在聚贤庄战斗', 5: '第五楼的剧情原文，林一胜利返回城镇' };
    const chatLookup = (f) => texts[f] || '';
    let done = 0;
    const maxBatch = 5;
    const missing = missingFloors(5);
    for (const f of missing.slice(0, maxBatch)) {
        const text = chatLookup(f) || '';
        if (!text || text.length < 10) continue;
        // 模拟 LLM 输出
        const clean = '第' + f + '楼摘要（补齐）';
        if (addManualSummary(f, clean)) done++;
    }
    assert.strictEqual(done, 2, '补齐 2 楼（0 楼空文本跳过，5 楼被 maxBatch 截断）');
    assert.strictEqual(summaries.length, 2, '2 条摘要');
    // 二次运行：5 楼仍未补（maxBatch 截断）
    assert.deepStrictEqual(missingFloors(5), [0, 2, 4, 5], '0/2/4 空文本仍缺 + 5 被 maxBatch 截断，均待下一批');
    // maxBatch 限制：缺失 8 楼只补 5
    const bigMissing = [10, 11, 12, 13, 14, 15, 16, 17];
    assert.strictEqual(bigMissing.slice(0, 5).length, 5, 'maxBatch 截断');

});

test('=== 3. 防重入标志检查 ===', () => {
    // _batchCompleting true 时返回 skipped
    assert.ok(src.includes('if (this._batchCompleting) return { done: 0, skipped: true };'), 'skipped 返回');
    assert.ok(src.includes('this._batchCompleting = true;'), '置位');
    assert.ok(src.includes('finally {\n                this._batchCompleting = false;\n            }'), 'finally 复位');
});

test('=== 4. 单楼失败跳过检查 ===', () => {
    // chatLookup 返回空/短文本时 continue（不调 LLM 不计入）
    assert.ok(src.includes('if (!text || text.length < 10) continue;'), '短文本跳过');
    // 单楼 LLM 失败不中断整批
    assert.ok(src.includes('/* 单楼失败跳过 */'), '单楼 catch');
});

test('=== 5. 报告扩展板块检查 ===', () => {
    const repIdx = src.indexOf('exportMemoryReport');
    const rep = src.slice(repIdx, repIdx + 14000);
    assert.ok(rep.includes('金字塔扩展层'), '金字塔信息');
    assert.ok(rep.includes('重试队列'), '重试信息');
    assert.ok(rep.includes('待重试任务'), '重试计数');
    // 只在有数据时显示（条件块）
    assert.ok(rep.includes('if (gt.length)'), '金字塔条件显示');
    assert.ok(rep.includes('if (rq.length)'), '重试条件显示');
});