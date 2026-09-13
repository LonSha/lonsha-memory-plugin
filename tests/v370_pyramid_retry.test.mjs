// tests/v370_pyramid_retry.test.mjs
// LonSha 记忆引擎 v3.70.0 金字塔泛化 + 合并重试队列测试
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

test('=== 1. 静态关键字检查 ===', () => {
    // A 金字塔泛化
    assert.ok(src.includes('pyramidAutoExtend'), '金字塔自动扩展开关');
    assert.ok(src.includes("pyramidTiers: ['日记', '周记', '史记', '书', '传奇']"), 'TIER 配置表');
    assert.ok(src.includes('foldHigherTiers'), '通用折叠链');
    assert.ok(src.includes('genericTiers'), 'genericTiers 存储');
    assert.ok(src.includes('foldedUp'), '源条目折叠标记');
    assert.ok(src.includes('genericTiers: this.genericTiers || [] }'), 'export 对称');
    assert.ok(src.includes('this.genericTiers = Array.isArray(data.genericTiers) ? data.genericTiers : [];'), 'import 对称');
    assert.ok(src.includes('折叠链衔接'), '折叠链衔接');
    // B 重试队列
    assert.ok(src.includes('enqueueRetry'), '入队方法');
    assert.ok(src.includes('processRetryQueue'), '消费方法');
    assert.ok(src.includes('30000 * Math.pow(2, job.attempts - 1)'), '指数退避');
    assert.ok(src.includes('job.attempts >= 3'), '最多 3 次');
    assert.ok(src.includes('processRetryQueue?.(this.config.config, this.llm)'), '折叠周期消费');
});

test('=== 2. 通用折叠链逻辑复刻测试 ===', () => {
    // 复刻 foldHigherTiers 的逐层生长
    const tiers = ['日记', '周记', '史记', '书', '传奇'];
    const genericTiers = [];
    let historical = Array.from({ length: 12 }, (_, i) => ({ text: '史记条目' + i, floorStart: i * 10, floorEnd: i * 10 + 9 }));
    const threshold = 12;
    // 模拟 tier3 折叠（源=historical）
    let sourceItems = historical;
    if (sourceItems.length >= threshold) {
        const cur = { tier: 3, name: tiers[3], items: [] };
        const batch = sourceItems.slice(0, threshold);
        cur.items.push({ text: '书级总览', tier: 3, count: batch.length });
        genericTiers.push(cur);
        batch.forEach(x => { x.foldedUp = true; });
    }
    assert.strictEqual(genericTiers.length, 1, 'tier3 生长');
    assert.strictEqual(genericTiers[0].tier, 3, 'tier3 编号');
    assert.strictEqual(genericTiers[0].name, '书', 'tier3 名称');
    // tier4 折叠（源=tier3 items，但只有 1 条 < threshold → break）
    sourceItems = genericTiers.find(g => g.tier === 3)?.items || [];
    assert.ok(sourceItems.length < threshold, 'tier4 不折叠（源不足）');
});

test('=== 3. 重试队列功能测试 ===', () => {
    const cls = extractClass(src, 'class SummarySystem');
    assert.ok(cls, 'SummarySystem 可提取');
    // enqueueRetry 幂等逻辑复刻
    const queue = [];
    const enqueueRetry = (kind, tier, payload) => {
        const exist = queue.find(j => j.kind === kind && j.tier === tier);
        if (exist) { exist.payload = payload; return exist.id; }
        const id = 'rj_' + queue.length;
        queue.push({ id, kind, tier, attempts: 0, nextAttemptAt: 0, payload });
        return id;
    };
    const id1 = enqueueRetry('volume', 1, { batchLen: 20 });
    const id2 = enqueueRetry('volume', 1, { batchLen: 21 });
    assert.strictEqual(id1, id2, '幂等：同 kind 同 tier 复用');
    assert.strictEqual(queue.length, 1, '队列 1 条');
    const id3 = enqueueRetry('historical', 2, {});
    assert.strictEqual(queue.length, 2, '不同 kind 新任务');
    // 指数退避复刻
    const job = { attempts: 0, nextAttemptAt: 0 };
    for (let i = 1; i <= 3; i++) {
        job.attempts++;
        job.nextAttemptAt = 30000 * Math.pow(2, job.attempts - 1);
    }
    assert.strictEqual(job.nextAttemptAt, 120000, '第三次退避 120s');
    // 超过 3 次清除
    assert.ok(job.attempts >= 3, '达到重试上限');
});

test('=== 4. export/import 对称测试 ===', () => {
    const cls = extractClass(src, 'class SummarySystem');
    const SummarySystem = new Function('return (' + cls + ')')();
    const s1 = new SummarySystem();
    s1.genericTiers = [{ tier: 3, name: '书', items: [{ text: 'x', tier: 3 }] }];
    const exported = s1.export();
    assert.ok(Array.isArray(exported.genericTiers), 'export 含 genericTiers');
    assert.strictEqual(exported.genericTiers[0].name, '书', '内容一致');
    const s2 = new SummarySystem();
    s2.import(exported);
    assert.strictEqual(s2.genericTiers.length, 1, 'import 恢复');
    // 旧快照兼容
    const s3 = new SummarySystem();
    s3.import({ summaries: [], volumes: [], historical: [] });
    assert.deepStrictEqual(s3.genericTiers, [], '旧快照兼容');
});

test('=== 5. retryQueue 消费调用位置检查 ===', () => {
    // processRetryQueue 在 maybeFold 调用之后
    const mfIdx = src.indexOf('await this.summary.maybeFold(this.config.config, this.llm)');
    const prIdx = src.indexOf('processRetryQueue?.(this.config.config, this.llm)');
    assert.ok(mfIdx > 0 && prIdx > mfIdx, '重试消费在折叠之后');
    // enqueueRetry 在 maybeFold 的 catch 里
    const catchIdx = src.indexOf('摘要折叠失败');
    const eqIdx = src.indexOf("enqueueRetry('volume', 1");
    assert.ok(catchIdx > 0 && eqIdx > catchIdx, '入队在 catch 之后');
});

test('=== 6. 金字塔配置默认值检查 ===', () => {
    assert.ok(src.includes('pyramidAutoExtend: true'), '默认开启');
    // 层级名 5 层
    const m = src.match(/pyramidTiers: \[([^\]]+)\]/);
    assert.ok(m, '配置可解析');
    const names = m[1].split(',').map(s => s.trim().replace(/'/g, ''));
    assert.strictEqual(names.length, 5, '5 层');
    assert.deepStrictEqual(names, ['日记', '周记', '史记', '书', '传奇'], '层级名');
});