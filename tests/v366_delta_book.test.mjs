// tests/v366_delta_book.test.mjs
// LonSha 记忆引擎 v3.66.0 deltas 双通道（正史增量账本）测试
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
    assert.ok(src.includes('class DeltaBook'), 'DeltaBook 类');
    assert.ok(src.includes("this.deltaBook = new DeltaBook();"), '实例化');
    assert.ok(src.includes('deltaBook: this.deltaBook.export()'), 'export 持久化');
    assert.ok(src.includes('this.deltaBook.import(pack.deltaBook)'), 'import 恢复');
    assert.ok(src.includes('this.deltaBook.toPrompt()'), '注入流');
    assert.ok(src.includes('this.deltaBook.addFromList(deltasList'), 'maybeFold 消费');
    // 三合一 prompt
    assert.ok(src.includes('deltas 只列本次新增的重要事实'), 'deltas 纪律');
    assert.ok(src.includes('不把未知情况当冲突'), 'conflicts 纪律');
    assert.ok(src.includes('established或uncertain'), '状态枚举');
});

test('=== 2. DeltaBook 功能测试 ===', () => {
    const cls = extractClass(src, 'class DeltaBook');
    assert.ok(cls, 'DeltaBook 可提取');
    const DeltaBook = new Function('return (' + cls + ')')();
    const db = new DeltaBook();
    // add：合法状态
    assert.strictEqual(db.add('林一获得解药', 'established', 42), true, 'established 登记');
    assert.strictEqual(db.deltas[0].status, 'established', '状态保存');
    // 非法状态兜底 uncertain
    assert.strictEqual(db.add('玉佩下落', 'maybe', 43), true, '非法状态兜底');
    assert.strictEqual(db.deltas[1].status, 'uncertain', '兜底为 uncertain');
    // 幂等：同 summary 同 floor 不重复
    assert.strictEqual(db.add('林一获得解药', 'established', 42), false, '重复拒绝');
    // 短文本拒绝
    assert.strictEqual(db.add('短', 'established', 44), false, '短文本拒绝');
    // addFromList
    const db2 = new DeltaBook();
    const n = db2.addFromList([
        { evidenceFloor: 10, summary: '事实AAA', status: 'established' },
        { evidenceFloor: 11, summary: '事实BBB', status: 'uncertain' },
        { evidenceFloor: 12, summary: '事实CCC' },
    ], 99);
    assert.strictEqual(n, 3, '3 条登记');
    assert.strictEqual(db2.deltas[2].status, 'uncertain', '缺省 uncertain');
    assert.strictEqual(db2.deltas[2].evidenceFloor, 12, 'evidenceFloor 透传');
});

test('=== 3. confirm 确证测试 ===', () => {
    const cls = extractClass(src, 'class DeltaBook');
    const DeltaBook = new Function('return (' + cls + ')')();
    const db = new DeltaBook();
    db.add('林一在聚贤庄留下解药', 'uncertain', 42);
    db.add('沈青梧的玉佩是信物', 'uncertain', 43);
    const n = db.confirm('聚贤庄');
    assert.strictEqual(n, 1, '确证 1 条');
    assert.strictEqual(db.deltas[0].status, 'established', '聚贤庄条已确证');
    assert.strictEqual(db.deltas[1].status, 'uncertain', '玉佩条仍待定');
});

test('=== 4. toPrompt 分状态展示测试 ===', () => {
    const cls = extractClass(src, 'class DeltaBook');
    const DeltaBook = new Function('return (' + cls + ')')();
    const db = new DeltaBook();
    db.add('已确证事实', 'established', 10);
    db.add('待定事实', 'uncertain', 11);
    const prompt = db.toPrompt();
    assert.ok(prompt.includes('[正史增量]'), '区块标题');
    assert.ok(prompt.includes('[已确证] 已确证事实'), 'established 标注');
    assert.ok(prompt.includes('[待定] 待定事实'), 'uncertain 标注');
    assert.ok(prompt.includes('可能佐证或推翻'), '待定说明');
    // 空账本返回空
    assert.strictEqual(new DeltaBook().toPrompt(), '', '空账本空串');
});

test('=== 5. removeByFloor 与 export/import 对称 ===', () => {
    const cls = extractClass(src, 'class DeltaBook');
    const DeltaBook = new Function('return (' + cls + ')')();
    const db = new DeltaBook();
    db.add('事实AAA', 'established', 10);
    db.add('事实BBB', 'uncertain', 11);
    assert.strictEqual(db.removeByFloor(10), 1, '按楼层移除');
    assert.strictEqual(db.deltas.length, 1, '剩 1 条');
    // export/import 对称
    const exported = db.export();
    assert.ok(Array.isArray(exported.deltas), 'export 结构');
    const db2 = new DeltaBook();
    db2.import(exported);
    assert.strictEqual(db2.deltas.length, 1, 'import 恢复');
    assert.strictEqual(db2.deltas[0].summary, '事实BBB', '内容一致');
    // 旧格式兼容
    const db3 = new DeltaBook();
    db3.import({});
    assert.deepStrictEqual(db3.deltas, [], '旧快照兼容');
});

test('=== 6. 三合一解析逻辑复刻测试 ===', () => {
    // 模拟 LLM 返回 JSON 三通道
    const raw = '{"text":"这是更新后的卷摘要内容，包含关键剧情走向与转折（第42楼）。","deltas":[{"evidenceFloor":42,"summary":"林一获得解药","status":"established"}],"conflicts":[]}';
    const parsed = JSON.parse(raw);
    assert.ok(parsed.text.length >= 20, 'text 有效');
    assert.strictEqual(parsed.deltas.length, 1, 'deltas 1 条');
    assert.strictEqual(parsed.conflicts.length, 0, 'conflicts 空');
    // 模拟降级：纯文本（无 JSON）
    const raw2 = '这是纯文本卷摘要，没有 JSON 包装，长度也超过二十个字符的最低要求。';
    const m = raw2.match(/\{[\s\S]*\}/);
    assert.strictEqual(m, null, '纯文本无 JSON 匹配');
    // 降级路径：clean 取原文
    let clean = '';
    const jsonMatch2 = raw2.match(/\{[\s\S]*\}/);
    if (jsonMatch2) { /* 不会走 */ } else { clean = raw2.trim(); }
    assert.ok(clean.length >= 20, '降级路径 clean 有效');
});

test('=== 7. 冲突通道消费测试（conflictBook.add 签名对齐） ===', () => {
    // maybeFold 的 conflicts 消费调用签名：add(claim, canon, note, floor, '', severity)
    const cls = extractClass(src, 'class ConflictBook');
    const ConflictBook = new Function('return (' + cls + ')')();
    const cb = new ConflictBook();
    // 模拟 maybeFold 中的调用形态
    const c = { claim: '灵石是甲给的', canon: '灵石是乙给的', severity: 'high' };
    cb.add(c?.claim, c?.canon, String(c?.claim || '').slice(0, 100), '摘要核对', 42, '', c?.severity);
    assert.strictEqual(cb.conflicts[0].subject, '灵石是甲给的', 'claim 为 subject');
    assert.strictEqual(cb.conflicts[0].versionA, '灵石是乙给的', 'canon 为 versionA');
    assert.strictEqual(cb.conflicts[0].severity, 'high', 'severity 透传');
});