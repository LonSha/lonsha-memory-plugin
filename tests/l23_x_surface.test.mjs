// tests/l23_x_surface.test.mjs — v3.473.0 · L23-X1~X9 装配面/消费点判据
// 这是九个 X 项的**真实消费点**判据：走真 require 链（public-interface → memory-trace-surface → 九桥），
// 不做字符串断言——名字在源码里出现不等于跑得通。
import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'module';
import { REPO, readManifest } from './_iife_load.mjs';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const surface = require(path.join(REPO, 'memory-trace-surface.js'));
const pub = require(path.join(REPO, 'public-interface.js'));

test('【1】trace 资源已进公开接口清单，且真能取到面', () => {
    assert.ok(pub.RESOURCES.includes('trace'), 'RESOURCES 必须含 trace');
    const snap = { floor: 100, commitments: [{ id: 'a', dueFloor: 50 }] };
    const got = pub.queryResource(snap, 'trace');
    assert.ok(got && typeof got === 'object', 'queryResource(trace) 必须返回对象');
    assert.strictEqual(got.commitments.face, 'tracked');
    assert.match(pub.formatResult(got, 'json'), /"face"/);
});

test('【2】九面齐全，缺输入时各面自出三态（不整面抛）', () => {
    const s = surface.buildTraceSurface({});
    const facets = ['causal', 'bias', 'commitments', 'forgetting', 'conflicts', 'ranking', 'revisions', 'capacity', 'continuation'];
    for (const f of facets) assert.ok(s[f] && typeof s[f].face === 'string', `缺 ${f} 面`);
    assert.deepStrictEqual(s.absent, [], '九桥都已登记 extra_js，不应有缺席');
});

test('【3】满快照：各面各自落到自己的态（不塌成一个布尔）', () => {
    const s = surface.buildTraceSurface({
        floor: 100,
        causalChain: [{ fact: 'f', floor: 10, source: { floor: 2 } }],
        perspectiveA: { claims: [{ factId: 'x', text: 'a' }] },
        perspectiveB: { claims: [{ factId: 'x', text: 'b' }] },
        commitments: [{ id: 'k', dueFloor: 40, keptAtFloor: 10 }, { id: 'o', dueFloor: 10 }],
        forgetting: { hits: 4, gapFloors: 10 },
        conflict: { id: 'c', left: { fact: 'A' }, right: { fact: 'B' } },
        recallCandidates: [{ id: 'r1', scores: { vector: 2, recency: 0, significance: null, graph: 1 } }],
        revisions: [{ id: 'v1' }, { id: 'v2', parentId: 'v1' }]
    });
    assert.strictEqual(s.causal.face, 'traceable');
    assert.strictEqual(s.bias.face, 'divergent');
    assert.strictEqual(s.commitments.face, 'tracked');
    assert.strictEqual(s.commitments.counts.overdue, 1);
    assert.strictEqual(s.forgetting.face, 'explained');
    assert.strictEqual(s.conflicts.face, 'awaiting-human');
    assert.strictEqual(s.ranking.items[0].parts.significance, 'unknown');
    assert.strictEqual(s.revisions.face, 'chained');
    const faces = new Set([s.causal.face, s.bias.face, s.commitments.face, s.forgetting.face, s.conflicts.face, s.ranking.face, s.revisions.face]);
    assert.ok(faces.size >= 5, '不同能力必须能出不同态，否则面被压平了');
});

test('【4】装配面不许有裁决/执行副作用', () => {
    const s = surface.buildTraceSurface({ conflict: { id: 'c', left: { fact: 'A' }, right: { fact: 'B' } } });
    assert.strictEqual(s.conflicts.autoDecided, false);
    assert.strictEqual('chosen' in s.conflicts, false);
    assert.strictEqual('executed' in s.capacity, false, '无水位输入时不该伪造执行面');
});

test('【5】九个桥 + 装配面都在 manifest.extra_js（缺一即装载面缺失）', () => {
    const mf = readManifest();
    for (const f of ['memory-causal-chain-replay.js', 'memory-bias-surface.js', 'commitment-followthrough.js',
        'forgetting-explanation.js', 'memory-conflict-bench.js', 'recall-ranking-explain.js',
        'memory-revision-history.js', 'memory-capacity-watermark.js', 'cross-session-continuation.js',
        'memory-trace-surface.js']) {
        assert.ok(mf.extra_js.includes(f), `${f} 未登记 extra_js`);
    }
});

test('【6】自检', () => {
    assert.strictEqual(surface.selfCheck().ok, true, surface.selfCheck().bad.join('; '));
});
test('【7】版本三源一致 + 当版字面量锚', () => {
    const idx = fs.readFileSync(path.join(REPO, 'index.js'), 'utf8');
    const cur = /const VERSION = '([0-9.]+)'/.exec(idx)[1];
    const mf = readManifest();
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
    assert.strictEqual(cur, '3.473.0', '入口版本');
    assert.strictEqual(mf.version, cur, 'manifest 与入口同版');
    assert.strictEqual(pkg.version, cur, 'package.json 与入口同版');
    /* 本档自锚：当版号以**字面量**形式出现在当版套件里（写成变量会躲开字面量口径）。 */
    const vnum = (v) => { const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(v)); return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN; };
    assert.strictEqual(vnum('3.473.0'), 3473000, '本档锚点：当版号与 vnum 口径自洽');
    assert.ok(vnum(cur) >= 3473000, '当前版本低于本档出生版本，交棒方向反了');
});
