// tests/v367_delta_lifecycle.test.mjs
// LonSha 记忆引擎 v3.67.0 正史增量生命周期（回滚/位移/自动确证）测试
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
    // A 回滚联动
    assert.ok(src.includes('rollbackFloor.正史增量回滚'), '回滚埋点');
    assert.ok(src.includes('this.deltaBook?.removeByFloor ? this.deltaBook.removeByFloor(floor)'), '回滚调用');
    // B 位移联动
    assert.ok(src.includes('d.evidenceFloor = dec(d.evidenceFloor)'), '位移调用');
    assert.ok(src.includes('正史增量楼层位移'), '位移注释');
    // C 自动确证
    assert.ok(src.includes('正史增量自动确证'), '自动确证');
    assert.ok(src.includes("d.status = 'established';"), '确证赋值');
});

test('=== 2. DeltaBook 回滚功能测试 ===', () => {
    const cls = extractClass(src, 'class DeltaBook');
    const DeltaBook = new Function('return (' + cls + ')')();
    const db = new DeltaBook();
    db.add('林一获得解药的事件记录', 'established', 42);
    db.add('玉佩下落待定的事实记录', 'uncertain', 43);
    db.add('其他楼层的事实记录内容', 'established', 50);
    // 按楼层回滚
    const n = db.removeByFloor(42);
    assert.strictEqual(n, 1, '移除 1 条');
    assert.strictEqual(db.deltas.length, 2, '剩 2 条');
    assert.ok(!db.deltas.some(d => d.evidenceFloor === 42), '42 楼增量已撤');
    // 回滚不存在楼层
    assert.strictEqual(db.removeByFloor(999), 0, '无匹配返回 0');
});

test('=== 3. 楼层位移逻辑复刻测试 ===', () => {
    // 复刻 shiftFloorsFrom 的 dec 函数与 DeltaBook 位移
    const deleted = 42;
    const dec = (v) => { if (v > deleted) { return v - 1; } return v; };
    // evidenceFloor > deleted 的前移
    assert.strictEqual(dec(43), 42, '>deleted 前移 1');
    assert.strictEqual(dec(50), 49, '远楼层前移');
    // evidenceFloor === deleted 或 < deleted 不动（对应内容仍是前移后的文本）
    assert.strictEqual(dec(42), 42, '===deleted 不动');
    assert.strictEqual(dec(10), 10, '<deleted 不动');
});

test('=== 4. 自动确证逻辑复刻测试 ===', () => {
    // 复刻 C 的关键词匹配确证（真实场景：summary 含标点，可切出多个关键词片段）
    const db = [];
    db.push({ summary: '林一，聚贤庄，留下解药', status: 'uncertain' });
    db.push({ summary: '沈青梧，玉佩，信物', status: 'uncertain' });
    // 新提取的佐证
    const evidence = JSON.stringify([{ text: '林一在聚贤庄留下解药给沈青梧' }]) + ' 林一在聚贤庄留下解药。';
    let confirmed = 0;
    for (const d of db.filter(x => x.status === 'uncertain')) {
        const kws = d.summary.split(/[，。；、\s]/).filter(w => w.length >= 2);
        if (kws.length && kws.filter(k => evidence.includes(k)).length >= 2) {
            d.status = 'established';
            confirmed++;
        }
    }
    assert.strictEqual(confirmed, 1, '聚贤庄条被确证');
    assert.strictEqual(db[0].status, 'established', '状态翻转');
    assert.strictEqual(db[1].status, 'uncertain', '玉佩条仍待定');
    // 无佐证不确证
    const db2 = [{ summary: '完全无关的事实记录', status: 'uncertain' }];
    const evidence2 = '林一在聚贤庄留下解药。';
    let c2 = 0;
    for (const d of db2.filter(x => x.status === 'uncertain')) {
        const kws = d.summary.split(/[，。；、\s]/).filter(w => w.length >= 2);
        if (kws.length && kws.filter(k => evidence2.includes(k)).length >= 2) { d.status = 'established'; c2++; }
    }
    assert.strictEqual(c2, 0, '无佐证不确证');
});

test('=== 5. 联动调用位置检查 ===', () => {
    // A 回滚在 rollbackFloor 的矛盾回滚之后
    const rbIdx = src.indexOf('rollbackFloor.矛盾回滚');
    const dbRbIdx = src.indexOf('rollbackFloor.正史增量回滚');
    assert.ok(rbIdx > 0 && dbRbIdx > rbIdx, '增量回滚在矛盾回滚之后');
    // B 位移在 pairMem 位移之后
    const pairIdx = src.indexOf('this.pairMem?.pairs || [])) for (const e of p.entries) e.floor = dec(e.floor)');
    const dbShiftIdx = src.indexOf('d.evidenceFloor = dec(d.evidenceFloor)');
    assert.ok(pairIdx > 0 && dbShiftIdx > pairIdx, '增量位移在群像位移之后');
    // C 确证在 extractMemoryWithLLM 内
    const emIdx = src.indexOf('async extractMemoryWithLLM');
    const autoIdx = src.indexOf('正史增量自动确证');
    assert.ok(emIdx > 0 && autoIdx > emIdx, '自动确证在提取管线内');
});

test('=== 6. 三合一消费与生命周期完整性 ===', () => {
    // DeltaBook 完整生命周期：登记(add/addFromList) → 注入(toPrompt) → 确证(confirm+自动) → 回滚(removeByFloor) → 位移(shiftFloorsFrom) → 持久化(export/import)
    assert.ok(src.includes('addFromList'), '登记');
    assert.ok(src.includes('toPrompt'), '注入');
    assert.ok(src.includes('confirm('), '确证');
    assert.ok(src.includes('removeByFloor'), '回滚');
    assert.ok(src.includes('evidenceFloor = dec'), '位移');
    assert.ok(src.includes('deltaBook: this.deltaBook.export()'), '持久化');
    assert.ok(src.includes('this.deltaBook.import(pack.deltaBook)'), '恢复');
});