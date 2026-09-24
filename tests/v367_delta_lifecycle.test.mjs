// tests/v367_delta_lifecycle.test.mjs
// LonSha 记忆引擎 v3.67.0 正史增量生命周期（回滚/位移/自动确证）测试
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';

import { fileURLToPath } from 'node:url';
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = readFileSync(`${REPO_ROOT}/index.js`, 'utf-8');
import { createRequire as __mkReq } from 'node:module';

/* [v3.204.0] 路径去绝对化：原「本机绝对路径」字面量只在开发机上成立，
 *   任何其他 checkout 位置都必红。「仓库根」按本文件位置推导（tests/ 的上一级）。 */
const __require = __mkReq(import.meta.url);
const __fsReq = __require('fs');   // require 函数本身不带 readFileSync，先取 fs 模块
const __LR = __require('../ledger-replay.js');
const __ownerShift = (id) => { const o = (__LR.FLOOR_OWNERS || []).find(x => x.id === id); return (o && typeof o.shift === 'function') ? o.shift : null; };
const __ownerDrop = (id) => { const o = (__LR.FLOOR_OWNERS || []).find(x => x.id === id); return (o && typeof o.drop === 'function') ? o.drop : null; };
const __libSrc = (() => { try { return __fsReq.readFileSync(new URL('../ledger-replay.js', import.meta.url), 'utf8'); } catch (e) { return ''; } })();


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
    // B 位移联动——[v3.190] 收进登记表（id: delta，动作触及 evidenceFloor）
    assert.ok(__ownerShift('delta') && String(__ownerShift('delta')).includes('evidenceFloor'), '位移调用（登记表 delta 面）');
    assert.ok(__libSrc.includes('正史增量'), '位移面在登记表里有中文名（诊断面按名可查）');
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
    // B 位移顺序——[v3.190] 收进登记表后，「先群像、后增量」由登记表内的排列顺序表达：
    //   回放按表序执行，表序即语义（同一次回放内先后关系不再是散落语句的相对位置）。
    // 旧手工清单按引入时间堆叠（群像 v3.49 在前、正史增量 v3.66 在后），那是偶然顺序而非语义：
    //   各登记面互不依赖，回放先后不影响结果。收口后不再钉相对位置，
    //   改钉「两面都在表内，且各自真位移到自己的字段」。
    assert.ok(String(__ownerShift('pair')).includes('entries'), '群像位移（登记表 pair 面触及 entries）');
    assert.ok(String(__ownerShift('delta')).includes('evidenceFloor'), '增量位移（登记表 delta 面触及 evidenceFloor）');
    // 逐面失败标签仍留名，诊断面按名检索不受影响
    assert.ok(__libSrc.includes('正史增量'), '登记表中该面带中文名');
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
    assert.ok(String(__ownerShift('delta')).includes('evidenceFloor'), '位移（登记表 delta 面触及 evidenceFloor）');
    assert.ok(src.includes('deltaBook: this.deltaBook.export()'), '持久化');
    assert.ok(src.includes('this.deltaBook.import(pack.deltaBook)'), '恢复');
});