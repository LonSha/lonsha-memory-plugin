// [v4.158.0 · R24-O8] 压缩与真删除：三级语义 + 级联四处 + 删后逐面自证
//   验收口径（原文）：purge 后四处（本体/索引/摘要引用/回执）全部查不到；
//   mask 后仍可审计但零注入；purge_all 后不可恢复（重启后仍查不到）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const F = require('../memory-forget-cascade.js');

function base() {
    return F.createStore({
        memories: [
            { id: 'm1', text: '他答应过要回来', storyAt: 100 },
            { id: 'm2', text: '今天买了牛奶', storyAt: 200 }
        ],
        index: { '回来': ['m1'], '牛奶': ['m2'], '他': ['m1'] },
        summaries: [{ id: 's1', text: '这三天发生了两件事', refs: ['m1', 'm2'] }],
        receipts: [{ id: 'r1', snapshot: { ids: ['m1', 'm2'] } }],
        tombstones: []
    });
}

test('O8-1 三级语义各自成态（不塌成一个 delete）', () => {
    assert.deepEqual(Object.keys(F.LEVELS), ['mask', 'purge', 'purge_all']);
    assert.deepEqual(F.SURFACES.slice(), ['body', 'index', 'summary', 'receipt']);
    assert.equal(F.forget(base(), 'm1', 'nuke').ok, false, '未知级别必须拒判');
});

test('O8-2 mask：零注入零召回，但正文仍留（可审计）', () => {
    const r = F.forget(base(), 'm1', 'mask', { at: '2026-11-18' });
    assert.equal(r.ok, true);
    const v = F.verifyAbsent(r.store, 'm1');
    assert.equal(v.ok, true, '召回/证据/时间线三面都应查不到');
    assert.equal(v.injectable, false, 'body 面应不可注入');
    const m1 = r.store.memories.find((m) => m.id === 'm1');
    assert.equal(m1.text, '他答应过要回来', 'mask 不许删正文');
    assert.equal(m1.masked, true);
    assert.ok(r.store.tombstones.some((t) => t.id === 'm1' && t.level === 'mask'));
});

test('O8-3 purge：正文物理删除 + 留墓碑；四处全查不到', () => {
    const r = F.forget(base(), 'm1', 'purge', { at: '2026-11-18' });
    const m1 = r.store.memories.find((m) => m.id === 'm1');
    assert.equal(m1.text, null, 'purge 必须把正文置空');
    assert.equal(m1.purged, true);
    assert.ok(r.store.tombstones.find((t) => t.id === 'm1' && t.level === 'purge'), 'purge 应留墓碑');
    const v = F.verifyAbsent(r.store, 'm1');
    assert.equal(v.recall, true);
    assert.equal(v.evidence, true);
    assert.equal(v.timeline, true);
    assert.equal(v.ok, true);
    assert.deepEqual(F.searchByTerm(r.store, '回来'), [], '索引面不许还查得到');
});

test('O8-4 purge_all：连墓碑一起删，不可恢复', () => {
    const r = F.forget(base(), 'm1', 'purge_all', { at: '2026-11-18' });
    assert.equal(r.store.tombstones.some((t) => t.id === 'm1'), false, '墓碑也不许留');
    assert.equal(r.store.memories.some((m) => m.id === 'm1'), false, '本体不该还在');
    const v = F.verifyAbsent(r.store, 'm1');
    assert.equal(v.tombstoned, false);
    assert.equal(v.ok, true);
    // 「重启后仍查不到」= 序列化再读回，结论不变（不留内存里的影子）
    const rebooted = F.createStore(JSON.parse(JSON.stringify(r.store)));
    assert.equal(F.verifyAbsent(rebooted, 'm1').ok, true);
});

test('O8-5 级联四处逐面记账（删了几条说得清）', () => {
    const r = F.forget(base(), 'm1', 'purge');
    assert.equal(r.cascaded.index, 2, 'm1 占两个索引词');
    assert.equal(r.cascaded.summary, 1);
    assert.equal(r.cascaded.receipt, 1);
    assert.deepEqual(Object.keys(r.cascaded).sort(), ['body', 'index', 'receipt', 'summary']);
});

test('O8-6 纯函数：不许改入参库（否则"删了"和"没删"分不清）', () => {
    const b = base();
    const before = JSON.stringify(b);
    F.forget(b, 'm1', 'purge');
    assert.equal(JSON.stringify(b), before);
    assert.deepEqual(b.index['回来'], ['m1'], '原库索引不该被清');
});

test('O8-7 压缩双留：原文一条不少 + 摘要带全部出处', () => {
    const cmp = F.compactPreservingSource(base(), ['m1', 'm2'], '这三天发生了两件事', { id: 's2', at: '2026-11-18' });
    assert.equal(cmp.ok, true);
    assert.equal(cmp.keptSource, 2);
    assert.equal(cmp.store.memories.length, 2, '压缩不销毁原文');
    const s2 = cmp.store.summaries.find((s) => s.id === 's2');
    assert.deepEqual(s2.refs, ['m1', 'm2']);
});

test('O8-8 负控制：源已被 purge 时，压缩必须拒（不许给"摘要里有、原文没了"的假账）', () => {
    const purged = F.forget(base(), 'm1', 'purge').store;
    const cmp = F.compactPreservingSource(purged, ['m1'], '摘要');
    assert.equal(cmp.ok, false);
    assert.deepEqual(cmp.bad, ['source-purged']);
    assert.equal(F.compactPreservingSource(base(), ['zzz'], '摘要').bad[0], 'no-source');
});

test('O8-9 接线：manifest.extra_js + optional-engine-registry + index.js 真消费点', () => {
    const man = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok(man.extra_js.includes('memory-forget-cascade.js'), 'extra_js 未登记 ⇒ 经典脚本侧永不加载');
    const reg = readFileSync(join(ROOT, 'optional-engine-registry.js'), 'utf8');
    assert.ok(/\['LonShaForgetCascade',\s*'memory-forget-cascade\.js'\]/.test(reg));
    const idx = readFileSync(join(ROOT, 'index.js'), 'utf8');
    assert.ok(idx.includes('optEngines.LonShaForgetCascade'));
    assert.ok(idx.includes('this.engine.forgetCascade'));
});

test('O8-10 自检绿（模块自带读数）', () => {
    const s = F.forgetCascadeSelfCheck();
    assert.equal(s.ok, true, JSON.stringify(s.bad));
    assert.match(s.sample, /levels=3/);
});

test('O8-11 经典脚本形态：无 module 时挂 global.LonShaForgetCascade', () => {
    const src = readFileSync(join(ROOT, 'memory-forget-cascade.js'), 'utf8');
    assert.ok(src.includes('root.LonShaForgetCascade = api;'));
    assert.ok(src.includes('module.exports = factory()'));
});