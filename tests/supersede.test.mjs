/* memory-supersede 回归测试 (IIFE 模拟浏览器加载) */
import assert from 'node:assert';
import fs from 'node:fs';

globalThis.window = {};
// eslint-disable-next-line no-eval
eval(fs.readFileSync(new URL('../memory-supersede.js', import.meta.url), 'utf-8'));
const { SupersedeManager } = window.LonShaSupersede;

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.error('  ✗ ' + name + '\n    ' + e.message); } }

console.log('== SupersedeManager 单元测试 ==');
t('相似度: 同话题高、无关低', () => {
  const s = new SupersedeManager();
  assert.ok(s.similarity('她很喜欢喝奶茶', '她决定戒奶茶') > 0.2);
  assert.ok(s.similarity('她喜欢喝奶茶', '她今天去爬山了') < 0.15);
});
t('冲突: 奶茶旧爱新戒 → conflict', () => {
  const s = new SupersedeManager();
  assert.ok(s.isHighConfidenceConflict('她很喜欢喝奶茶，最爱茉莉奶绿', '她决定戒奶茶了，再也不喝茉莉奶绿'));
});
t('冲突: 无关 → 不 conflict', () => {
  const s = new SupersedeManager();
  assert.ok(!s.isHighConfidenceConflict('她喜欢喝奶茶', '她今天去爬山了，山顶风很大'));
});
t('scan: 新条压制旧条', () => {
  const s = new SupersedeManager();
  const r = s.scan(
    [{ key: 'sum_1', text: '她戒掉奶茶了，再也不喝茉莉奶绿', importance: 7 }],
    [{ key: 'sum_0', text: '她很喜欢喝奶茶，最爱茉莉奶绿', importance: 5 }]
  );
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].key, 'sum_0');
  assert.ok(s.isSuperseded('sum_0'));
  assert.ok(!s.isSuperseded('sum_1'));
});
t('scan: 重要性不足不压', () => {
  const s = new SupersedeManager();
  const r = s.scan(
    [{ key: 'sum_1', text: '她戒掉奶茶了', importance: 3 }],
    [{ key: 'sum_0', text: '她很喜欢喝奶茶，最爱茉莉奶绿', importance: 7 }]
  );
  assert.strictEqual(r.length, 0);
});
t('scan: 无关不压', () => {
  const s = new SupersedeManager();
  const r = s.scan(
    [{ key: 'sum_1', text: '她今天爬山了，山顶风很大', importance: 7 }],
    [{ key: 'sum_0', text: '她很喜欢喝奶茶', importance: 5 }]
  );
  assert.strictEqual(r.length, 0);
});
t('revive: 压制方消失 → 复活', () => {
  const s = new SupersedeManager();
  s.supersededMap['sum_0'] = { byKey: 'sum_1', at: Date.now() };
  const n = s.revive(['sum_2']);
  assert.strictEqual(n, 1);
  assert.ok(!s.isSuperseded('sum_0'));
});
t('revive: 压制方还在 → 保持', () => {
  const s = new SupersedeManager();
  s.supersededMap['sum_0'] = { byKey: 'sum_1', at: Date.now() };
  const n = s.revive(['sum_1']);
  assert.strictEqual(n, 0);
  assert.ok(s.isSuperseded('sum_0'));
});
t('export/import 往返', () => {
  const s = new SupersedeManager();
  s.scan(
    [{ key: 'sum_1', text: '她戒掉奶茶了', importance: 7 }],
    [{ key: 'sum_0', text: '她喜欢喝奶茶', importance: 5 }]
  );
  const s2 = new SupersedeManager();
  s2.import(s.export());
  assert.ok(s2.isSuperseded('sum_0'));
});

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);