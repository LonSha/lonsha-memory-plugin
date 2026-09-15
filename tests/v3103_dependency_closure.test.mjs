// tests/v3103_dependency_closure.test.mjs
// v3.103 缝合 bionic-memory（BME）domain/memory-branch.js forkMemoryLedger 依赖收敛：
// 依赖闭包级联裁剪引擎
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(REPO, 'dependency-closure.js'), 'utf8');
function vnum(s) {
  const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}
const idxSrc = fs.readFileSync(path.join(REPO, 'index.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));

const sbox = { module: { exports: {} }, window: undefined };
const load = new Function('globalThis', 'module', 'window',
    src + '\nreturn (typeof module !== \'undefined\' && module.exports) ? module.exports : globalThis.LonShaDependencyClosure;');
const DC = load(sbox, sbox.module, undefined);

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };

// ---------- 0. 版本与注册 ----------
test('【0】版本与 manifest 注册', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
    assert.ok(vnum(v) >= vnum('3.103.0'), `index.js 版本 ${v} < 3.103.0`);
    assert.ok(vnum(manifest.version) >= vnum('3.103.0'), `manifest 版本 ${manifest.version} < 3.103.0`);
    assert.ok(manifest.extra_js.includes('dependency-closure.js'), 'dependency-closure.js 已注册 extra_js');
    ok('版本 / manifest 注册');
});

// ---------- 1. 无根因 → 全保留 ----------
test('【1】依据齐全时全部保留', () => {
    const r = DC.computeCascade({
        items: [
            { id: 'm1', refs: ['f1'], deps: [] },
            { id: 'm2', refs: ['f2'], deps: ['m1'] },
        ],
        allowedRefs: ['f1', 'f2'],
    });
    assert.deepStrictEqual(r.keptIds.sort(), ['m1', 'm2']);
    assert.deepStrictEqual(r.droppedIds, []);
    assert.deepStrictEqual(r.droppedBy, {});
    assert.strictEqual(r.unrestricted, false);
    ok('全部保留 / 无丢弃归因');
});

// ---------- 2. 根因条目被丢弃 ----------
test('【2】外部依据缺失 → 根因条目丢弃', () => {
    const r = DC.computeCascade({
        items: [
            { id: 'm1', refs: ['f1'], deps: [] },
            { id: 'm2', refs: ['f999'], deps: [] },
        ],
        allowedRefs: ['f1'],
    });
    assert.deepStrictEqual(r.keptIds, ['m1']);
    assert.deepStrictEqual(r.droppedIds, ['m2']);
    assert.strictEqual(r.droppedBy['m2'], 'missing-ref:f999');
    ok('missing-ref 根因 + 归因字符串');
});

// ---------- 3. 级联传播（多跳） ----------
test('【3】依赖级联传播（链式丢弃）', () => {
    const r = DC.computeCascade({
        items: [
            { id: 'root', refs: ['gone'], deps: [] },
            { id: 'mid', refs: [], deps: ['root'] },
            { id: 'leaf', refs: [], deps: ['mid'] },
            { id: 'safe', refs: ['ok'], deps: [] },
        ],
        allowedRefs: ['ok'],
    });
    assert.deepStrictEqual(r.keptIds, ['safe']);
    assert.deepStrictEqual(r.droppedIds.sort(), ['leaf', 'mid', 'root']);
    assert.strictEqual(r.droppedBy['root'], 'missing-ref:gone');
    assert.strictEqual(r.droppedBy['mid'], 'dep-dropped:root');
    assert.strictEqual(r.droppedBy['leaf'], 'dep-dropped:mid');
    ok('三跳级联 + 逐级归因');
});

// ---------- 4. 悬空 dep ----------
test('【4】依赖不存在的条目 → missing-dep', () => {
    const r = DC.computeCascade({
        items: [{ id: 'a', refs: [], deps: ['nope'] }],
        allowedRefs: [],
    });
    assert.deepStrictEqual(r.droppedIds, ['a']);
    assert.strictEqual(r.droppedBy['a'], 'missing-dep:nope');
    ok('悬空依赖识别');
});

// ---------- 5. 不限制 refs ----------
test('【5】不传 allowedRefs → 不限制（等价全部依据可用）', () => {
    const r = DC.computeCascade({ items: [{ id: 'a', refs: ['任意'], deps: [] }] });
    assert.strictEqual(r.unrestricted, true);
    assert.deepStrictEqual(r.keptIds, ['a']);
    const r2 = DC.computeCascade({ items: [{ id: 'a', refs: ['x'], deps: [] }], allowedRefs: null });
    assert.strictEqual(r2.unrestricted, true);
    assert.deepStrictEqual(r2.keptIds, ['a']);
    ok('undefined / null 均视为不限制');
});

// ---------- 6. Set 与数组均接受 ----------
test('【6】allowedRefs 支持数组与 Set', () => {
    const items = [{ id: 'a', refs: ['f1'], deps: [] }, { id: 'b', refs: ['f2'], deps: [] }];
    const arr = DC.computeCascade({ items, allowedRefs: ['f1'] });
    const set = DC.computeCascade({ items, allowedRefs: new Set(['f1']) });
    assert.deepStrictEqual(arr.keptIds, set.keptIds);
    assert.deepStrictEqual(arr.keptIds, ['a']);
    ok('数组 / Set 等价');
});

// ---------- 7. 环检测 ----------
test('【7】依赖环：默认保留并回报', () => {
    const r = DC.computeCascade({
        items: [
            { id: 'x', refs: [], deps: ['y'] },
            { id: 'y', refs: [], deps: ['x'] },
        ],
        allowedRefs: [],
    });
    assert.strictEqual(r.cycles.length, 1, '环被检出');
    assert.deepStrictEqual([...r.cycles[0]].sort(), ['x', 'y']);
    assert.deepStrictEqual(r.keptIds.sort(), ['x', 'y'], '默认 keepCycles=true 整体保留');
    ok('环检出 + 默认保留（不静默吞掉）');
});

// ---------- 8. keepCycles=false ----------
test('【8】keepCycles=false → 环整体丢弃并带出级联', () => {
    const r = DC.computeCascade({
        items: [
            { id: 'x', refs: [], deps: ['y'] },
            { id: 'y', refs: [], deps: ['x'] },
            { id: 'down', refs: [], deps: ['x'] },
            { id: 'ok', refs: [], deps: [] },
        ],
        allowedRefs: [],
        keepCycles: false,
    });
    assert.deepStrictEqual(r.keptIds, ['ok']);
    assert.deepStrictEqual(r.droppedIds.sort(), ['down', 'x', 'y']);
    assert.match(r.droppedBy['x'], /^cycle:/);
    assert.strictEqual(r.droppedBy['down'], 'dep-dropped:x');
    ok('环丢弃 + 下游级联');
});

// ---------- 9. 拓扑序 ----------
test('【9】order 为上游先于下游的拓扑序', () => {
    const r = DC.computeCascade({
        items: [
            { id: 'leaf', refs: [], deps: ['mid'] },
            { id: 'mid', refs: [], deps: ['root'] },
            { id: 'root', refs: [], deps: [] },
        ],
        allowedRefs: [],
    });
    assert.deepStrictEqual(r.order, ['root', 'mid', 'leaf']);
    ok('order = root → mid → leaf（输入序无关）');
});

// ---------- 10. 非法条目 ----------
test('【10】缺 id / 非数组输入安全兜底', () => {
    const r = DC.computeCascade({ items: [{ id: 'a', refs: [], deps: [] }, { refs: [] }, null], allowedRefs: [] });
    assert.deepStrictEqual(r.keptIds, ['a']);
    assert.strictEqual(r.invalid.length, 2);
    const empty = DC.computeCascade({});
    assert.deepStrictEqual(empty.keptIds, []);
    assert.deepStrictEqual(empty.droppedIds, []);
    ok('非法条目隔离 / 空输入不崩');
});

// ---------- 11. 重复引用去重 ----------
test('【11】refs/deps 去重与空白归一', () => {
    const r = DC.computeCascade({
        items: [
            { id: 'a', refs: ['  f1 ', 'f1', ''], deps: [] },
            { id: 'b', refs: [], deps: ['a', 'a', ''] },
        ],
        allowedRefs: ['f1'],
    });
    assert.deepStrictEqual(r.keptIds.sort(), ['a', 'b']);
    ok('重复项去重 / 空白裁剪');
});

// ---------- 12. planCascade 摘要 ----------
test('【12】planCascade 摘要与归因可读', () => {
    const p = DC.planCascade(
        [
            { id: 'keep1', refs: ['ok'], deps: [] },
            { id: 'bad', refs: ['gone'], deps: [] },
            { id: 'orphan', refs: [], deps: ['bad'] },
        ],
        ['ok'],
    );
    assert.deepStrictEqual(p.keep, ['keep1']);
    assert.deepStrictEqual(p.drop.sort(), ['bad', 'orphan']);
    assert.match(p.summary, /保留 1 条 \/ 丢弃 2 条/);
    assert.match(p.summary, /bad: missing-ref:gone/);
    assert.match(p.summary, /orphan: dep-dropped:bad/);
    ok('摘要含数量与逐条归因');
});

// ---------- 13. 退化：自环 ----------
test('【13】自环条目处理', () => {
    const r = DC.computeCascade({
        items: [{ id: 'self', refs: [], deps: ['self'] }],
        allowedRefs: [],
    });
    assert.strictEqual(r.cycles.length, 1);
    assert.deepStrictEqual(r.cycles[0], ['self']);
    assert.deepStrictEqual(r.keptIds, ['self']);
    ok('自环检出且不崩溃');
});

console.log(`[v3103] ${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;