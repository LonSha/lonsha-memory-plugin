// [v3.88] 公开只读快照桥专项测试
import { readFileSync } from 'fs';
import assert from 'assert';

const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf8');
const sui = readFileSync('/home/user/lonsha-memory-plugin/settings-ui.js', 'utf8');
const man = JSON.parse(readFileSync('/home/user/lonsha-memory-plugin/manifest.json', 'utf8'));

// ---------- 静态接线检查 ----------
assert.ok(src.includes('buildBridgeSnapshot()'), '快照构建方法在位');
assert.ok(src.includes('window.lonsha_memory_bridge_v1'), 'bridge 全局挂载在位');
assert.ok(src.includes("bridgeEnabled: true,        // [v3.88] 公开只读快照桥"), 'config 默认值在位');
assert.ok(src.includes("window.lonsha_memory_bridge_v1?.refresh?.()"), '生成管线刷新在位');
assert.ok(sui.includes("ck('bridgeEnabled', '公开快照桥'"), '设置开关在位');
assert.strictEqual(man.version, '3.91.0', 'manifest 版本 3.90.0');
console.log('✓ 静态接线检查通过');

// ---------- 提取 buildBridgeSnapshot 方法（花括号计数） ----------
function extractMethod(source, name) {
  const marker = name + '() {';
  const start = source.indexOf(marker);
  assert.ok(start > 0, `找到方法 ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0, end = -1;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return source.slice(start, end + 1);
}

const methodSrc = extractMethod(src, 'buildBridgeSnapshot');

// 依赖注入：VERSION / errLog / window
const makeEngine = () => {
  const proto = new Function('VERSION', 'errLog', 'window', `return ({ ${methodSrc} });`)(
    '3.88.0-test',
    () => {},
    { SillyTavern: { getContext: () => ({ chat: [{}, {}] }) } }  // 2 楼 → floor=1
  );
  const state = {
    protagonist: { identity: '侦探', outfit: '风衣' },
    lifeDetails: [{ text: '不吃香菜', tier: 'active' }, { text: '旧档案', tier: 'archive' }],
    characters: { 珞珈: { fields: {} } },
    money: { money: { 主角: 500 } },
    outline: { stage: { title: '初章' } },
    world: { promises: [] },
    clock: { day: 7 }
  };
  const engine = {
    status: { getProtagonist: () => state.protagonist, lifeDetails: state.lifeDetails, characters: state.characters },
    moneyLedger: { export: () => state.money },
    outline: { export: () => state.outline },
    worldProg: { export: () => state.world },
    clock: { export: () => state.clock }
  };
  return { engine, state, proto };
};

// 测试 1: 快照字段齐全 + floor 计算
{
  const { engine, proto } = makeEngine();
  const snap = proto.buildBridgeSnapshot.call(engine);
  assert.strictEqual(snap.version, 1);
  assert.strictEqual(snap.bridge, 'lonsha_memory_bridge_v1');
  assert.strictEqual(snap.pluginVersion, '3.88.0-test');
  assert.strictEqual(snap.floor, 1);
  assert.deepStrictEqual(snap.protagonist, { identity: '侦探', outfit: '风衣' });
  assert.deepStrictEqual(snap.moneyLedger, { money: { 主角: 500 } });
  assert.deepStrictEqual(snap.outline, { stage: { title: '初章' } });
  assert.deepStrictEqual(snap.worldProg, { promises: [] });
  assert.deepStrictEqual(snap.clock, { day: 7 });
  assert.ok(Array.isArray(snap.lifeDetails) && snap.lifeDetails.length === 1, 'archive 生活细节已过滤');
  console.log('✓ 快照字段齐全 + floor 计算 + archive 过滤');
}

// 测试 2: 深拷贝只读性——外部改动不回灌引擎
{
  const { engine, state, proto } = makeEngine();
  const snap = proto.buildBridgeSnapshot.call(engine);
  snap.protagonist.identity = '被篡改';
  snap.characters.新角色 = '注入';
  snap.moneyLedger.money.主角 = 999999;
  assert.strictEqual(state.protagonist.identity, '侦探', '主角档案未被回灌');
  assert.ok(!('新角色' in state.characters), 'NPC 状态未被回灌');
  assert.strictEqual(state.money.money.主角, 500, '钱财账本未被回灌');
  console.log('✓ 深拷贝只读性验证通过');
}

// 测试 3: 容灾——子系统缺失时降级不炸
{
  const proto = new Function('VERSION', 'errLog', 'window', `return ({ ${methodSrc} });`)(
    '3.88.0-test', () => {}, { SillyTavern: { getContext: () => ({ chat: [] }) } }
  );
  const bare = {};
  const snap = proto.buildBridgeSnapshot.call(bare);
  assert.deepStrictEqual(snap.protagonist, {});
  assert.deepStrictEqual(snap.characters, {});
  assert.deepStrictEqual(snap.moneyLedger, {});
  assert.strictEqual(snap.clock, null);
  assert.strictEqual(snap.floor, 0);
  console.log('✓ 容灾降级验证通过');
}

// ---------- bridge 全局对象契约 ----------
// 从 index.js 提取 window.lonsha_memory_bridge_v1 = {...}; 块
{
  const start = src.indexOf('window.lonsha_memory_bridge_v1 = {');
  assert.ok(start > 0, '找到 bridge 挂载块');
  const bodyStart = src.indexOf('{', start);
  let depth = 0, end = -1;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const blockSrc = src.slice(start, end + 1).replace('window.lonsha_memory_bridge_v1 = ', '');
  let calls = 0;
  const fakePlugin = { engine: { buildBridgeSnapshot: () => { calls++; return { bridge: 'lonsha_memory_bridge_v1', floor: calls }; } } };
  const bridge = new Function('plugin', 'window', `return (${blockSrc});`)(fakePlugin, {});
  assert.strictEqual(bridge.version, 1);
  assert.strictEqual(bridge.snapshot, null, '初始快照为 null（未生成时不暴露旧数据）');
  const s1 = bridge.refresh();
  assert.strictEqual(calls, 1);
  assert.strictEqual(s1.floor, 1);
  assert.strictEqual(bridge.snapshot.floor, 1, 'refresh 后 snapshot 更新');
  bridge.refresh();
  assert.strictEqual(bridge.snapshot.floor, 2, '重复 refresh 拿到新快照');
  // 只读契约：bridge 对象上不得有写路径
  const keys = Object.keys(bridge);
  for (const k of keys) assert.ok(!/set|write|push|import|clear/i.test(k), `bridge 键 ${k} 无写语义`);
  console.log('✓ bridge 契约验证通过（初始 null / refresh / 只读键面）');
}

console.log('\n✓ v3.88 快照桥专项测试全部通过');