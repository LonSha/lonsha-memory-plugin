// tests/v360_graph_dedup.test.mjs
// v3.6 图谱膨胀修复测试：findCharacterByName / rebuildNameIndex / 10楼膨胀回归 / 图谱去重合并 / 回滚长寿命
// 运行: node tests/v360_graph_dedup.test.mjs
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
let pass = 0;
const ok = (msg) => { pass++; console.log('ok: ' + msg); };

/* ---------- 提取器 ---------- */
function braceEnd(s, open) {
    let depth = 0;
    for (let i = open; i < s.length; i++) {
        const ch = s[i];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return i; }
        else if (ch === "'" || ch === '"' || ch === '`') { const q = ch; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } }
        else if (ch === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; }
    }
    return -1;
}
function extractClass(name) {
    const start = src.indexOf(`    class ${name} {`);
    if (start < 0) throw new Error('missing class ' + name);
    const brace = src.indexOf('{', start);
    return src.slice(start, braceEnd(src, brace) + 1);
}

/* ---------- 装配 MemoryGraph（含 normalizeCharName 依赖） ---------- */
const gSrc = extractClass('MemoryGraph');
const mkGraph = () => new Function('normalizeCharName', 'errLog', `
    ${gSrc}
    return new MemoryGraph();
`)((n) => String(n || '').normalize('NFKC').replace(/\s+/g, '').trim().toLowerCase(), () => {});

/* ══════════ 1. findCharacterByName ══════════ */
{
    const g = mkGraph();
    assert.equal(g.findCharacterByName('林澈'), null);
    g.addNode({type: 'character', name: '林澈'});
    const hit = g.findCharacterByName('林澈');
    assert.ok(hit && hit.name === '林澈');
    assert.equal(g.findCharacterByName('不存在'), null);
    ok('查找1: findCharacterByName 命中/未命中');

    // 归一化命中：全角/空格变体
    const hit2 = g.findCharacterByName('  林 澈 ');
    assert.ok(hit2 && hit2.name === '林澈');
    ok('查找2: NFKC 归一化命中（空格变体）');

    // 类型过滤：event 类型不入角色查找
    g.addNode({type: 'event', name: '篝火夜谈'});
    assert.equal(g.findCharacterByName('篝火夜谈'), null);
    ok('查找3: 只命中 character 类型');
}

/* ══════════ 2. rebuildNameIndex ══════════ */
{
    const g = mkGraph();
    g.addNode({type: 'character', name: '苏晚'});
    g.nameIndex.clear();  // 模拟旧代码的"只清不建"
    assert.equal(g.findCharacterByName('苏晚'), null);
    g.rebuildNameIndex();
    assert.ok(g.findCharacterByName('苏晚'));
    ok('重建1: rebuildNameIndex 恢复索引（含归一化键）');
}

/* ══════════ 3. 10 楼膨胀回归（v3.6 核心验证） ══════════ */
{
    const g = mkGraph();
    // 模拟主管线 v3.6 后的写法：先查后建
    const upsertCharacter = (name) => {
        const exist = g.findCharacterByName(name);
        if (!exist) g.addNode({type: 'character', name});
    };
    for (let i = 0; i < 10; i++) upsertCharacter('绫地宁宁');
    assert.equal(g.nodes.size, 1, `10 楼后应只有 1 个节点（实际 ${g.nodes.size}）`);
    assert.equal(g.nameIndex.get('绫地宁宁').length, 1);
    ok('回归1: 10 楼提及同角色 → 1 个节点（原实现 10 个）');
}

/* ══════════ 4. 图谱去重合并（optimizeMemory 兜底逻辑） ══════════ */
{
    // 从 index.js 提取去重段（optimizeMemory 内的 4. 段）不能直接跑，此处重现同逻辑验证语义
    const g = mkGraph();
    // 制造膨胀：3 个重复角色 + 两条边指向不同副本
    const id1 = g.addNode({type: 'character', name: '林澈', timestamp: 1000});
    const id2 = g.addNode({type: 'character', name: '林澈'});
    g.nodes.get(id1).timestamp = 1000;
    const id3 = g.addNode({type: 'character', name: '林澈'});
    const evt = g.addNode({type: 'event', name: '战斗'});
    g.edges.set(`${id2}-${evt}-participated_in`, {from: id2, to: evt, label: 'participated_in', id: `${id2}-${evt}-participated_in`});
    g.edges.set(`${evt}-${id3}-related`, {from: evt, to: id3, label: 'related', id: `${evt}-${id3}-related`});

    // 重现去重段逻辑（与 index.js GD4 相同算法）
    const normalizeCharName = (n) => String(n || '').normalize('NFKC').replace(/\s+/g, '').trim().toLowerCase();
    const byName = new Map();
    const dupIds = [];
    for (const node of Array.from(g.nodes.values())) {
        if (node.type !== 'character' || !node.name) continue;
        const nk = normalizeCharName(node.name);
        const prev = byName.get(nk);
        if (!prev) { byName.set(nk, node); continue; }
        const [keep, drop] = (prev.timestamp || 0) <= (node.timestamp || 0) ? [prev, node] : [node, prev];
        byName.set(nk, keep);
        dupIds.push({ keepId: keep.id, dropId: drop.id });
    }
    for (const { keepId, dropId } of dupIds) {
        for (const [eid, e] of Array.from(g.edges)) {
            if (e.from === dropId || e.to === dropId) {
                g.edges.delete(eid);
                const newFrom = e.from === dropId ? keepId : e.from;
                const newTo = e.to === dropId ? keepId : e.to;
                if (newFrom !== newTo) g.edges.set(`${newFrom}-${newTo}-${e.label || 'related'}`, {...e, from: newFrom, to: newTo, id: `${newFrom}-${newTo}-${e.label || 'related'}`});
            }
        }
        g.nodes.delete(dropId);
    }
    if (dupIds.length) g.rebuildNameIndex();

    assert.equal([...g.nodes.values()].filter(n => n.type === 'character').length, 1, '重复角色合并为 1');
    const keepId = g.findCharacterByName('林澈').id;
    assert.equal(keepId, id1, '保留最早创建的（timestamp 最小）');
    // 边迁移：两条边都指向 keep
    const edgeList = [...g.edges.values()];
    assert.ok(edgeList.some(e => e.from === keepId && e.label === 'participated_in'), '边1 已迁移');
    assert.ok(edgeList.some(e => e.to === keepId && e.label === 'related'), '边2 已迁移');
    ok('去重1: 重复合并保留最早 + 边迁移到保留节点');
}

/* ══════════ 5. 回滚长寿命角色检查（静态+行为混合） ══════════ */
{
    // 静态断言：rollbackFloor 包含长寿命检查与 rebuildNameIndex
    assert.ok(src.includes('keepIds.add(id)'), '长寿命保留逻辑存在');
    assert.ok(src.includes('this.graph.rebuildNameIndex()'), '回滚后重建索引存在');
    const clearOnly = /this\.graph\.nameIndex\.clear\(\);\s*\n\s*}/.test(src);
    assert.ok(!clearOnly, '旧「只 clear 不重建」模式绝迹');
    ok('回滚1: 长寿命检查 + rebuildNameIndex 落位');

    // 行为：后续摘要提及 → 保留；未提及 → 删除
    const g = mkGraph();
    const keepNodeId = g.addNode({type: 'character', name: '保留角色'});
    const dropNodeId = g.addNode({type: 'character', name: '删除角色'});
    const fakeEngine = {
        graph: g,
        summary: { summaries: [{floor: 10, text: '保留角色后来再次出场了'}] },
        config: { config: { debugMode: false } },
    };
    // 重现 rollback 检查逻辑
    const floor = 5;
    const keepIds = new Set();
    for (const id of [keepNodeId, dropNodeId]) {
        const node = g.nodes.get(id);
        if (node.type === 'character') {
            const laterTexts = fakeEngine.summary.summaries.filter(s => (s.floor || 0) > floor).map(s => s.text || '').join('\n');
            if (node.name && laterTexts.includes(node.name)) { keepIds.add(id); continue; }
        }
        g.nodes.delete(id);
    }
    g.rebuildNameIndex();
    assert.ok(keepIds.has(keepNodeId), '后续提及 → 保留');
    assert.ok(!g.nodes.has(dropNodeId), '未提及 → 删除');
    assert.ok(g.findCharacterByName('保留角色'), '保留角色索引可用');
    ok('回滚2: 长寿命语义（后续提及保留/未提及删除）');
}

/* ══════════ 6. 主管线静态断言 ══════════ */
{
    assert.ok(src.includes('const existChar = this.graph.findCharacterByName(canonical);'), '主管线先查后建');
    // 旧直接 addNode 模式绝迹（主管线一处；backfill 一处也应该先查后建——但它已有 exist 检查）
    const badPattern = /const canonical = this\.resolveCharacterName\(char\);\s*\n\s*this\.graph\.addNode\(\{type: 'character'/;
    assert.ok(!badPattern.test(src), '旧「直接 addNode」绝迹');
    ok('静态1: 主管线先查后建，旧模式绝迹');
}

console.log(`\n✓ v3.6 图谱膨胀修复测试全过 (${pass} 项)`);