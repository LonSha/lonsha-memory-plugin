/**
 * tests/ui-workbench-adapter.test.mjs — v3.482.0 stage-2 · LoreCodex 工作台数据面适配器
 *
 * 【为什么用 vm 加载，而不 import】
 *   ui/mem-workbench-api.js 必须是 **ESM**（它要被 index.html 的 importmap 当成
 *   `./js/api.js` 的替身，上游 main.js 写的是 `import { fetchHealth } from './api.js'`）。
 *   而本仓 package.json 没有 "type":"module" ⇒ 仓内 .js 一律按 CJS 解析，`import` 它只会拿到
 *   一个空 default。给产品文件加 CJS 双导出可以骗过测试，但那是**测试倒过来改产品形态**，
 *   而且双导出之后浏览器里仍是 ESM —— 两个形态必然漂移。所以这里把源码读进 vm，
 *   只把 `export ` 前缀摘掉，**跑的就是盘上那份源码**（一字节不差）。
 *
 * 【本套守什么】
 *   A 契约面：21 个导出齐、名字与上游 api.js 逐个对得上（上游加导出而本仓漏实现 ⇒ 红）
 *   B 映射面：节点 → 卷/篇/幕 的三级映射；order 就是楼层；stats 的数当场数得出来
 *   C 楼层锁：maxOrder 真的拦（拦与「没有」必须分开报，不许同形）
 *   D 检索面：grep 是 AND 语义；runTreeSearch 的 traversal 与 scenes 对齐，且不假装是 LLM
 *   E 只读面：导入/删除/导出必须抛，不许静默成功
 *   F 接线面：index.html 的 importmap 指向的文件真在场；vendor 漂移闸绿
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const API_REL = 'ui/mem-workbench-api.js';
const VENDOR_REL = 'ui/vendor/lorecodex';
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const NAMES = (() => {
  const src = read(API_REL);
  return [...src.matchAll(/^export async function ([A-Za-z0-9_]+)/gm)].map((m) => m[1]);
})();

/** 构造一个假宿主：只提供引擎真正会读的东西（graph.nodes 的 Map） */
function loadAdapter(nodes) {
  const src = read(API_REL);
  const code = src.replace(/^export\s+async\s+function/gm, 'async function');
  const bag = new Map();
  for (const n of nodes) bag.set(n.id, n);
  const fakeWindow = {
    parent: null,
    top: null,
    LonShaMemory: { VERSION: 'test-version', engine: { graph: { nodes: bag }, config: { config: { enabled: true } } } },
  };
  fakeWindow.parent = fakeWindow;
  fakeWindow.top = fakeWindow;
  const store = new Map();
  const sandbox = {
    window: fakeWindow,
    console: { warn() {}, log() {}, error() {} },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
    performance: { now: () => Date.now() },
  };
  vm.createContext(sandbox);
  const tail = ';globalThis.__WB = {' + NAMES.map((n) => n + ': ' + n).join(', ') + '};';
  vm.runInContext(code + tail, sandbox);
  return sandbox.__WB;
}

function mkNode(id, type, name, floor, desc) {
  return { id, type, name, data: { floor, description: desc || '' }, timestamp: 1700000000000 };
}

const NODES = [
  mkNode('node_a1', 'character', '绫地宁宁', 3, '主角的同学，嘴硬心软。'),
  mkNode('node_a2', 'event', '雨夜告白', 12, '宁宁在雨夜承认了心事，与「绫地宁宁」有关。'),
  mkNode('node_b1', 'event', '第二幕冲突', 240, '两人在钟楼争执，关键词：雨夜。'),
];

// ---------------- A 契约面 ----------------

test('A1 21 个导出齐，且与上游 api.js 的导出名逐个对得上', () => {
  const up = [...read(VENDOR_REL + '/js/api.js').matchAll(/^export (?:async )?function ([A-Za-z0-9_]+)/gm)].map((m) => m[1]);
  assert.ok(up.length >= 21, '上游导出数异常：' + up.length);
  const missing = up.filter((n) => !NAMES.includes(n));
  assert.deepEqual(missing, [], '上游有、本仓没实现：' + missing.join(','));
  const extra = NAMES.filter((n) => !up.includes(n));
  assert.deepEqual(extra, [], '本仓多出来的导出（importmap 替身不该多出口）：' + extra.join(','));
});

test('A2 每个导出都是可调用函数（写错成常量/漏 async 都会在这里现形）', () => {
  const api = loadAdapter([]);
  const bad = NAMES.filter((n) => typeof api[n] !== 'function');
  assert.deepEqual(bad, []);
});

// ---------------- B 映射面 ----------------

test('B1 空库不抛：health 说得出「为什么空」', async () => {
  const api = loadAdapter([]);
  const h = await api.fetchHealth();
  assert.equal(h.ok, true);
  assert.equal(h.treeLoaded, false);
  assert.equal(h.treeScenes, 0);
  assert.ok(Array.isArray(h.corpora) && h.corpora.length === 1, 'corpora 必须是单库形态');
  const c = await api.fetchCorpora();
  assert.equal(c.corpora[0].stats.scenes, 0);
});

test('B2 三级映射：类型⇒卷、楼层段⇒篇、节点⇒幕，order 就是楼层', async () => {
  const api = loadAdapter(NODES);
  const idx = await api.fetchTreeIndex('mem-current', 0);
  assert.ok(idx.arcs.length >= 2, 'arcs=' + idx.arcs.length);
  const scenes = idx.arcs.flatMap((a) => a.scenes);
  assert.equal(scenes.length, 3);
  const byTitle = new Map(scenes.map((s) => [s.title, s]));
  assert.equal(byTitle.get('雨夜告白').order, 12, 'order 必须等于 data.floor');
  assert.equal(byTitle.get('第二幕冲突').order, 240);
  /* 楼层段：3 与 12 都在第 1–100 楼，240 在第 201–300 楼。
   * 篇是「类型 × 楼层段」的二维格（卷已经是类型了），所以验：同段篇名一致、
   * 同段不同类必须不同篇、跨段必不同篇。 */
  const arcOf = (t) => idx.arcs.find((a) => a.scenes.some((s) => s.title === t));
  assert.equal(arcOf('雨夜告白').title, '第 1–100 楼', '篇名只写楼层段，不重复类型');
  assert.equal(arcOf('绫地宁宁').title, arcOf('雨夜告白').title, '同段篇名必须一致');
  assert.notEqual(arcOf('绫地宁宁').arc_id, arcOf('雨夜告白').arc_id, '同段不同类必须是不同篇');
  assert.notEqual(arcOf('雨夜告白').arc_id, arcOf('第二幕冲突').arc_id, '跨段必须不同篇');
  /* 卷 = 类型 */
  assert.equal(arcOf('雨夜告白').category, '事件');
  assert.equal(arcOf('绫地宁宁').category, '人物');
});

test('B3 stats 的数是当场数出来的（不许写死、不许和列表对不上）', async () => {
  const api = loadAdapter(NODES);
  const idx = await api.fetchTreeIndex('mem-current', 0);
  const scenes = idx.arcs.flatMap((a) => a.scenes);
  assert.equal(idx.stats.scenes, scenes.length);
  assert.equal(idx.stats.arcs, idx.arcs.length);
  assert.equal(idx.stats.max_order, 240);
  const sum = idx.arcs.reduce((acc, a) => acc + a.total_chars, 0);
  assert.equal(idx.stats.total_chars, sum, 'total_chars 必须等于各篇之和');
  assert.ok(sum > 0, 'total_chars 不该是 0（正文被漏掉了）');
  for (const a of idx.arcs) for (const s of a.scenes) assert.ok(a.total_chars >= s.chars);
});

test('B4 短 id 稳定：同一节点两次取树拿到同一个 node_id', async () => {
  const api = loadAdapter(NODES);
  const a = await api.fetchTreeIndex('mem-current', 0);
  const b = await api.fetchTreeIndex('mem-current', 0);
  const ids = (x) => x.arcs.flatMap((q) => q.scenes).map((s) => s.node_id).sort().join(',');
  assert.equal(ids(a), ids(b));
});

// ---------------- C 楼层锁 ----------------

test('C1 maxOrder 真的拦：240 楼那条在全开时在，在 100 楼上限时不在', async () => {
  const api = loadAdapter(NODES);
  const all = await api.fetchTreeIndex('mem-current', 0);
  const locked = await api.fetchTreeIndex('mem-current', 100);
  const has = (x) => x.arcs.flatMap((a) => a.scenes).some((s) => s.title === '第二幕冲突');
  assert.equal(has(all), true);
  assert.equal(has(locked), false);
  assert.equal(locked.stats.hidden_by_order, 1, '被挡下的必须计数（与「本来就没有」分开）');
  assert.equal(all.stats.hidden_by_order, 0);
});

test('C2 楼层锁与「没有这条」不同形：一个抛 blocked，一个抛 not found', async () => {
  const api = loadAdapter(NODES);
  const idx = await api.fetchTreeIndex('mem-current', 0);
  const lockedTarget = idx.arcs.flatMap((a) => a.scenes).find((s) => s.title === '第二幕冲突');
  await assert.rejects(() => api.fetchSceneText('mem-current', lockedTarget.node_id, 100), /spoiler gate/);
  const ok = await api.fetchSceneText('mem-current', lockedTarget.node_id, 0);
  assert.equal(ok.order, 240);
  assert.ok(ok.text.includes('钟楼'), '正文必须真的是节点内容');
  await assert.rejects(() => api.fetchSceneText('mem-current', 'm-nonexist', 0), /scene not found/);
});

// ---------------- D 检索面 ----------------

test('D1 grep 是 AND 语义：两个词必须都命中', async () => {
  const api = loadAdapter(NODES);
  const one = await api.fetchGrep('mem-current', { q: '雨夜', limit: 40 });
  const two = await api.fetchGrep('mem-current', { q: '雨夜 钟楼', limit: 40 });
  assert.ok(one.total >= 2, '单词应命中 ≥2 条，实际 ' + one.total);
  assert.equal(two.total, 1, '两词 AND 应只剩 1 条，实际 ' + two.total);
  assert.equal(two.hits[0].title, '第二幕冲突');
  assert.ok(two.hits[0].snippet.length > 0);
  assert.ok(two.hits[0].match_count >= 2);
});

test('D2 runTreeSearch：traversal 与 scenes 对齐，且明说不是 LLM 轨迹', async () => {
  const api = loadAdapter(NODES);
  const out = await api.runTreeSearch({ corpus: 'mem-current', query: '雨夜 告白', maxScenes: 2, maxOrder: 0 });
  assert.equal(out.turns, 1);
  assert.ok(Array.isArray(out.scenes) && out.scenes.length >= 1);
  const sel = out.traversal.selected_nodes;
  assert.deepEqual(sel, out.scenes.map((s) => s.node_id), 'selected_nodes 必须与 scenes 同序同员');
  assert.ok(out.traversal.read_scenes.length >= out.traversal.selected_nodes.length);
  assert.ok(Array.isArray(out.steps) && out.steps.length === 1);
  assert.equal(out.steps[0].calls[0].name, 'local_scan');
  assert.ok(/不是/.test(out.guide) || /本地/.test(out.guide), 'guide 必须自报「本地检索」');
  assert.ok(/不调用 LLM|未调用 LLM/.test(out.prompts.system), 'prompts.system 必须明说没有 LLM');
  assert.ok(out.run_id, '必须发 run_id（轨迹台要能选中这一发）');
});

test('D3 检索记录进轨迹台，且标注「不是引擎召回回执」', async () => {
  const api = loadAdapter(NODES);
  const out = await api.runTreeSearch({ corpus: 'mem-current', query: '雨夜', maxScenes: 3, maxOrder: 0 });
  const runs = await api.fetchRuns();
  assert.ok(runs.runs.length >= 1);
  assert.equal(runs.runs[0].id, out.run_id);
  assert.ok(/不是引擎/.test(runs.note), 'note 必须写死「不是引擎回执」');
  assert.equal(runs.runs[0].output.traversal.selected_nodes.length, out.traversal.selected_nodes.length);
});

// ---------------- E 只读面 ----------------

test('E1 导入/删除/导出/写配置必须抛，不许静默成功', async () => {
  const api = loadAdapter(NODES);
  for (const n of ['importCorpus', 'upgradeCorpus', 'deleteCorpus', 'exportCorpusLorepack',
    'previewLocalImportFile', 'saveCorpusConfig', 'saveConfig']) {
    await assert.rejects(() => api[n](), /只读|本工作台为只读视图|请在插件设置面板/, n + ' 必须明确拒绝');
  }
});

// ---------------- F 接线面 ----------------

test('F1 index.html 的 importmap 指向的适配器文件真在场', () => {
  const html = read(VENDOR_REL + '/index.html');
  const m = html.match(/"\.\/js\/api\.js"\s*:\s*"([^"]+)"/);
  assert.ok(m, 'importmap 里没有 ./js/api.js 的重定向 —— stage-2 接线断了');
  const target = path.resolve(path.join(ROOT, VENDOR_REL), m[1]);
  assert.ok(fs.existsSync(target), 'importmap 指向的文件不存在：' + target);
  assert.equal(path.relative(ROOT, target).split(path.sep).join('/'), API_REL, 'importmap 应指向 ' + API_REL);
});

test('F2 vendor 漂移闸仍是绿的（fork 已登记，字节没被就地改）', async () => {
  const { verifyVendor } = await import('../tools/verify_lorecodex_vendor.mjs');
  const r = verifyVendor();
  assert.equal(r.ok, true, '漂移：' + JSON.stringify(r.problems));
  assert.ok(r.checked >= 10, '核对文件数异常：' + r.checked);
});
