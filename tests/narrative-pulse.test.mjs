// 叙事心电图 Narrative Pulse 单测
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { NarrativePulse, scanEmotion, ARC_PHASES } = require('../narrative-pulse.js');

test('scanEmotion 识别喜悦正向极性', () => {
  const r = scanEmotion('她开心地笑了，眼里满是幸福与温柔，心里暖暖的。');
  assert.ok(r.polarity > 0, `极性应为正，实得 ${r.polarity}`);
  assert.equal(r.dominant, 'joy');
});

test('scanEmotion 识别恐惧/危机负向高张力', () => {
  const r = scanEmotion('杀意逼近，她恐惧地颤抖，这是绝境，背后藏着阴谋与背叛。');
  assert.ok(r.tension > 0.4, `张力应高，实得 ${r.tension}`);
  assert.ok(r.polarity < 0, `极性应偏负，实得 ${r.polarity}`);
});

test('scanEmotion 空文本安全返回', () => {
  const r = scanEmotion('');
  assert.equal(r.polarity, 0);
  assert.equal(r.tension, 0);
  assert.equal(r.dominant, null);
});

test('beat 记录一拍并合成张力（事件重要度+悬念加成）', () => {
  const p = new NarrativePulse();
  const b = p.beat(5, {
    mesText: '危机四伏，杀意毕露。',
    events: [{ importance: 9 }],
    suspenseCount: 6,
    characters: ['珞珈']
  });
  assert.equal(b.floor, 5);
  assert.ok(b.tension > 0.5, `高重要度+高悬念应推升张力，实得 ${b.tension}`);
  assert.equal(p.beats.length, 1);
});

test('beat 同楼幂等覆盖', () => {
  const p = new NarrativePulse();
  p.beat(3, { mesText: '笑' });
  p.beat(3, { mesText: '笑 开心 幸福' });
  assert.equal(p.beats.length, 1);
  assert.equal(p.beats[0].floor, 3);
});

test('beat 维护角色弧光轨迹', () => {
  const p = new NarrativePulse();
  p.beat(1, { mesText: '开心 笑', characters: ['A'] });
  p.beat(2, { mesText: '温暖 守护', characters: ['A'] });
  p.beat(3, { mesText: '幸福 甜蜜', characters: ['A'] });
  const arc = p.getArc('A');
  assert.ok(arc);
  assert.equal(arc.polarityTrail.length, 3);
  assert.ok(ARC_PHASES.includes(arc.phase));
});

test('diagnose 连续高压给出呼吸拍建议', () => {
  const p = new NarrativePulse();
  // 连续 5 楼高张力
  for (let i = 1; i <= 5; i++) {
    p.beat(i, { mesText: '杀意 绝境 危机 恐惧 阴谋 背叛 死斗', events: [{ importance: 10 }], suspenseCount: 8 });
  }
  const d = p.diagnose(6);
  assert.equal(d.status, 'breath');
  assert.ok(d.streakHigh >= 4);
  assert.match(d.advice, /呼吸拍/);
});

test('diagnose 连续平淡建议掀波澜', () => {
  const p = new NarrativePulse();
  for (let i = 1; i <= 6; i++) {
    p.beat(i, { mesText: '今天天气不错。' });
  }
  const d = p.diagnose(6);
  assert.equal(d.status, 'surge');
  assert.ok(d.streakLow >= 5);
  assert.match(d.advice, /推力|波澜|变量/);
});

test('diagnose 节奏正常返回 flow', () => {
  const p = new NarrativePulse();
  p.beat(1, { mesText: '开心 笑' });
  p.beat(2, { mesText: '危机 冲突' });
  p.beat(3, { mesText: '平静的一天' });
  const d = p.diagnose(6);
  assert.equal(d.status, 'flow');
  assert.equal(d.advice, '');
});

test('toPrompt 仅非 flow 时输出节奏提示', () => {
  const p = new NarrativePulse();
  p.beat(1, { mesText: '平常' });
  const flowOut = p.toPrompt();
  assert.equal(flowOut, ''); // flow 且无弧光 → 空
});

test('toPrompt 含弧光阶段', () => {
  const p = new NarrativePulse();
  for (let i = 1; i <= 4; i++) p.beat(i, { mesText: '开心 笑 幸福', characters: ['珞珈'] });
  const out = p.toPrompt({ characters: ['珞珈'], force: true });
  assert.match(out, /角色弧光/);
  assert.match(out, /珞珈/);
  assert.match(out, /叙事节奏/);
});

test('弧光阶段拟合：V 形反转识别为蜕变', () => {
  const p = new NarrativePulse();
  // 前段负面、近期回升
  p.beat(1, { mesText: '绝望 心碎 泪', characters: ['A'] });
  p.beat(2, { mesText: '悲伤 痛苦 孤独', characters: ['A'] });
  p.beat(3, { mesText: '绝望 黑暗', characters: ['A'] });
  p.beat(4, { mesText: '开心 笑 希望', characters: ['A'] });
  p.beat(5, { mesText: '幸福 温暖 光明', characters: ['A'] });
  const arc = p.getArc('A');
  assert.ok(['蜕变', '归真'].includes(arc.phase), `V形应为蜕变/归真，实得 ${arc.phase}`);
});

test('shiftFloors 楼层指针前移', () => {
  const p = new NarrativePulse();
  p.beat(5, { mesText: '笑' });
  p.beat(9, { mesText: '哭' });
  const n = p.shiftFloors(3);
  assert.equal(n, 2);
  assert.equal(p.beats[0].floor, 4);
  assert.equal(p.beats[1].floor, 8);
});

test('removeByFloor 回滚该楼', () => {
  const p = new NarrativePulse();
  p.beat(2, { mesText: '笑', characters: ['A'] });
  p.beat(7, { mesText: '哭', characters: ['A'] });
  const removed = p.removeByFloor(7);
  assert.equal(removed, 1);
  assert.equal(p.beats.length, 1);
  assert.equal(p.getArc('A').polarityTrail.length, 1);
});

test('removeByFloor 清空轨迹则删除弧光', () => {
  const p = new NarrativePulse();
  p.beat(7, { mesText: '笑', characters: ['B'] });
  p.removeByFloor(7);
  assert.equal(p.getArc('B'), null);
});

test('export/import 往返保真', () => {
  const p = new NarrativePulse();
  p.beat(3, { mesText: '开心 笑', characters: ['A'] });
  const dump = p.export();
  const p2 = new NarrativePulse();
  p2.import(dump);
  assert.equal(p2.beats.length, 1);
  assert.ok(p2.getArc('A'));
});

test('节拍数超限淘汰最旧', () => {
  const p = new NarrativePulse();
  for (let i = 1; i <= 130; i++) p.beat(i, { mesText: 'x' });
  assert.ok(p.beats.length <= 120);
});