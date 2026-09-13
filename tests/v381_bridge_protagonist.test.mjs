import { readFileSync } from 'fs';
import { test } from 'node:test';
import assert from 'node:assert';

const lp = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf-8');
const bridge = readFileSync('/home/user/ruby-phone-work/apps/memory/lonsha-bridge.js', 'utf-8');
const mv = readFileSync('/home/user/ruby-phone-work/apps/memory/memory-view.js', 'utf-8');

test('=== 1. A: payload 携带（LonSha 侧） ===', () => {
    assert.ok(lp.includes('protagonist: this.status?.getProtagonist?.() || null'), 'protagonist 携带');
    assert.ok(lp.includes("lifeDetails: (this.status?.lifeDetails || []).filter(d => d.tier !== 'archive')"), 'lifeDetails 携带（排除 archive）');
    assert.ok(lp.includes('[v3.81] A: 主角档案/生活小档案回填手机'), '标记');
    // 空值安全（getProtagonist 不存在时 null）
    assert.ok(lp.includes('this.status?.getProtagonist?.() || null'), '可选链守卫');
});

test('=== 2. A: 桥消费（回填逻辑） ===', () => {
    // 主角档案回填
    assert.ok(bridge.includes('[v3.81] A: 主角客观档案回填'), '主角回填标记');
    assert.ok(bridge.includes("'[主角] ' + parts.join(' | ')"), '主角记忆文本');
    assert.ok(bridge.includes("tags: ['protagonist']"), '主角 tags');
    // 生活小档案回填
    assert.ok(bridge.includes('[v3.81] A: 生活小档案回填'), '生活回填标记');
    assert.ok(bridge.includes("'[生活] ' + ld.text"), '生活记忆文本');
    // 逻辑复刻：主角六字段拼接
    const buildPro = (pro) => {
        const parts = [];
        if (pro.gender) parts.push('性别:' + pro.gender);
        if (pro.age) parts.push('年龄:' + pro.age);
        if (pro.identity) parts.push('身份:' + pro.identity);
        if (pro.appearance) parts.push('体貌:' + pro.appearance);
        if (pro.outfit) parts.push('着装:' + pro.outfit);
        if (pro.condition) parts.push('状况:' + pro.condition);
        return parts;
    };
    const p1 = buildPro({ gender: '男', identity: '剑客', outfit: '白衣' });
    assert.strictEqual(p1.length, 3, '三字段');
    assert.ok(p1.join(' | ').includes('身份:剑客'), '拼接正确');
    assert.strictEqual(buildPro({}).length, 0, '空对象无输出');
    assert.strictEqual(buildPro({ gender: '', age: null }).length, 0, '空值字段跳过');
});

test('=== 3. B: stats 计数 ===', () => {
    assert.ok(bridge.includes('protagonistIngested: 0'), 'stats 初始化');
    assert.ok(bridge.includes('lifeDetailIngested: 0'), 'stats 初始化 2');
    assert.ok(bridge.includes('this.stats.protagonistIngested = (this.stats.protagonistIngested || 0) + 1'), '主角计数累加');
    assert.ok(bridge.includes('this.stats.lifeDetailIngested = (this.stats.lifeDetailIngested || 0) + 1'), '生活计数累加');
});

test('=== 4. C: memory-view 展示 ===', () => {
    assert.ok(mv.includes('🧑主角 '), '主角显示');
    assert.ok(mv.includes('🧬生活 '), '生活显示');
    assert.ok(mv.includes("(bridgeStats.protagonistIngested || 0)"), '主角消费');
    assert.ok(mv.includes("(bridgeStats.lifeDetailIngested || 0)"), '生活消费');
});

test('=== 5. 回归防护 ===', () => {
    assert.ok(bridge.includes('[v3.81]'), '桥 v3.81 标记');
    assert.ok(mv.includes('[v3.81]') || mv.includes('🧑主角'), 'view v3.81 痕迹');
    // 旧通道保留
    assert.ok(bridge.includes('lockedFactsIngested'), 'v3.65 通道保留');
    assert.ok(bridge.includes('deltaIngested'), 'v3.68 通道保留');
    assert.ok(bridge.includes('summarySyncCount'), 'v3.75 通道保留');
    // 桥语法关键（BM25 增量标记）
    assert.ok(bridge.includes('_bm25Dirty = true'), 'BM25 脏标记保留');
});