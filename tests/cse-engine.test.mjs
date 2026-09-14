// CSE 级人物状态引擎单测
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { CSEngine, LAYERS, VIS, CONFIDENCE_EXTRACT, CONFIDENCE_CONFIRMED } = require('../cse-engine.js');

test('set 新增状态，默认 situational + observable + 0.7 置信度', () => {
  const e = new CSEngine();
  const st = e.set({ character: '珞珈', field: '好感', value: '信任', toward: '主角', floor: 5 });
  assert.ok(st);
  assert.equal(st.layer, LAYERS.SITUATIONAL);
  assert.equal(st.visibility, VIS.OBSERVABLE);
  assert.equal(st.confidence, CONFIDENCE_EXTRACT);
  assert.equal(st.toward, '主角');
  assert.equal(st.evidence.length, 1);
  assert.equal(st.evidence[0].floor, 5);
});

test('core 层强制 toward 为 null（核心人设不绑定对象）', () => {
  const e = new CSEngine();
  const st = e.set({ character: '珞珈', layer: 'core', field: '性格', value: '冷静', toward: '主角', floor: 1 });
  assert.equal(st.layer, LAYERS.CORE);
  assert.equal(st.toward, null);
});

test('refine 需新证据：同 floor 同值不覆盖，仅累积证据', () => {
  const e = new CSEngine();
  e.set({ character: 'A', field: '情绪', value: '愤怒', floor: 3 });
  const st2 = e.set({ character: 'A', field: '情绪', value: '愤怒', floor: 3 });
  assert.equal(e.get('A').length, 1);
  assert.equal(st2.evidence.length, 1); // 同 floor 同 source 幂等
});

test('refine：新楼层值变化则更新并保留证据链', () => {
  const e = new CSEngine();
  e.set({ character: 'A', field: '好感', value: '陌生', toward: 'B', floor: 1 });
  e.set({ character: 'A', field: '好感', value: '信任', toward: 'B', floor: 8, source: '正文佐证' });
  const st = e.get('A')[0];
  assert.equal(st.value, '信任');
  assert.equal(st.floor, 8);
  assert.equal(st.evidence.length, 2);
});

test('层迁移：situational 固化为 adaptive', () => {
  const e = new CSEngine();
  e.set({ character: 'A', field: '习惯', value: '早起', floor: 2 });
  e.set({ character: 'A', layer: 'adaptive', field: '习惯', value: '坚持早起', floor: 10 });
  const st = e.get('A')[0];
  assert.equal(st.layer, LAYERS.ADAPTIVE);
});

test('toward 不镜像：A→B 不自动写 B→A', () => {
  const e = new CSEngine();
  e.set({ character: 'A', field: '好感', value: '爱慕', toward: 'B', floor: 1 });
  assert.equal(e.getToward('A', 'B').length, 1);
  assert.equal(e.get('B').length, 0); // B 无状态
});

test('confirm 校准置信度至 1.0', () => {
  const e = new CSEngine();
  e.set({ character: 'A', field: '秘密', value: '是卧底', floor: 4 });
  assert.equal(e.confirm('A', '秘密'), true);
  assert.equal(e.get('A')[0].confidence, CONFIDENCE_CONFIRMED);
  assert.equal(e.confirm('A', '不存在'), false);
});

test('visibility 三态与 private 过滤', () => {
  const e = new CSEngine();
  e.set({ character: 'A', field: '表面', value: '开朗', floor: 1 });
  e.set({ character: 'A', field: '真心', value: '孤独', visibility: 'private', floor: 1 });
  e.set({ character: 'A', field: '命运', value: '将死', visibility: 'authorial', floor: 1 });
  const all = e.toPrompt('A');
  assert.match(all, /真心/);
  const noPriv = e.toPrompt('A', { includePrivate: false });
  assert.doesNotMatch(noPriv, /真心/);
  assert.match(noPriv, /表面/);
});

test('toPrompt 分层排序 core→adaptive→situational，待证标注', () => {
  const e = new CSEngine();
  e.set({ character: 'A', layer: 'situational', field: '情绪', value: '紧张', floor: 1 });
  e.set({ character: 'A', layer: 'core', field: '本性', value: '善良', floor: 1 });
  const p = e.toPrompt('A');
  const coreIdx = p.indexOf('核心特质');
  const sitIdx = p.indexOf('当下状态');
  assert.ok(coreIdx > -1 && sitIdx > -1 && coreIdx < sitIdx, 'core 应排在 situational 前');
  assert.match(p, /待证70%/);
});

test('非法 layer/visibility 归一，空字段拒绝', () => {
  const e = new CSEngine();
  assert.equal(e.set({ character: 'A', field: '', value: 'x' }), null);
  assert.equal(e.set({ character: 'A', field: 'x', value: '' }), null);
  const st = e.set({ character: 'A', layer: 'bogus', field: 'f', value: 'v', visibility: 'weird', floor: 1 });
  assert.equal(st.layer, LAYERS.SITUATIONAL);
  assert.equal(st.visibility, VIS.OBSERVABLE);
});

test('shiftFloors 楼层指针前移（含证据）', () => {
  const e = new CSEngine();
  e.set({ character: 'A', field: 'f1', value: 'v', floor: 5 });
  e.set({ character: 'A', field: 'f2', value: 'v', floor: 9 });
  const n = e.shiftFloors(3);
  assert.equal(n, 2);
  const sts = e.get('A');
  assert.equal(sts.find(s => s.field === 'f1').floor, 4); // 5→4
  assert.equal(sts.find(s => s.field === 'f2').floor, 8); // 9→8
});

test('removeByFloor 回滚该楼新增状态', () => {
  const e = new CSEngine();
  e.set({ character: 'A', field: 'x', value: 'v', floor: 2 });
  e.set({ character: 'A', field: 'y', value: 'v', floor: 7 });
  const removed = e.removeByFloor(7);
  assert.equal(removed, 1);
  assert.equal(e.get('A').length, 1);
  assert.equal(e.get('A')[0].field, 'x');
});

test('addFromExtracted 批量登记', () => {
  const e = new CSEngine();
  const n = e.addFromExtracted([
    { character: 'A', field: '好感', value: '高', toward: 'B' },
    { character: 'C', layer: 'core', field: '身份', value: '剑士' }
  ], 12);
  assert.equal(n, 2);
  assert.equal(e.get('A')[0].floor, 12);
});

test('export/import 往返保真并清洗', () => {
  const e = new CSEngine();
  e.set({ character: 'A', layer: 'adaptive', field: '目标', value: '复仇', toward: 'C', visibility: 'private', floor: 6 });
  const dump = e.export();
  const e2 = new CSEngine();
  e2.import(dump);
  const st = e2.get('A')[0];
  assert.equal(st.layer, LAYERS.ADAPTIVE);
  assert.equal(st.visibility, VIS.PRIVATE);
  assert.equal(st.toward, 'C');
});

test('状态条数超限淘汰 situational 低置信最旧者', () => {
  const e = new CSEngine();
  for (let i = 0; i < 45; i++) e.set({ character: 'A', field: 'f' + i, value: 'v', floor: i });
  assert.ok(e.get('A').length <= 40);
});

test('removeChar 删除角色全部状态', () => {
  const e = new CSEngine();
  e.set({ character: 'A', field: 'f', value: 'v', floor: 1 });
  e.set({ character: 'B', field: 'f', value: 'v', floor: 1 });
  assert.equal(e.removeChar('A'), true);
  assert.equal(e.get('A').length, 0);
  assert.equal(e.get('B').length, 1);
  assert.equal(e.removeChar('A'), false);
});