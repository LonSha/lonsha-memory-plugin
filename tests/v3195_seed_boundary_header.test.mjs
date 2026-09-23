import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const seed = require(join(root, 'seed-ledger.js'));
const router = require(join(root, 'injection-router.js'));
const scene = require(join(root, 'scene-book.js'));

test('伏笔可埋下、推进、回收，未回收禁止删除', () => {
  const planted = seed.plant(null, { hook: '抽屉里的旧信', layer: 'near', floor: 4, eventKey: 'p1' });
  assert.equal(planted.item.status, 'open');
  const locked = seed.remove(planted.state, { id: planted.item.id });
  assert.equal(locked.ok, false);
  assert.equal(locked.reason, 'open-locked');
  const advanced = seed.advance(planted.state, { id: planted.item.id, note: '她又看了一眼', floor: 6, eventKey: 'a1' });
  assert.equal(advanced.item.status, 'advancing');
  const recovered = seed.recover(advanced.state, { id: planted.item.id, note: '信是母亲留下的', floor: 8, eventKey: 'r1' });
  assert.equal(recovered.item.status, 'recovered');
  assert.equal(recovered.item.recoveredFloor, 8);
  const removed = seed.remove(recovered.state, { id: planted.item.id });
  assert.equal(removed.changed, true);
  assert.equal(removed.state.items.length, 0);
});

test('未回收上限 5 条，超额拒绝而不是丢掉旧的', () => {
  let state = null;
  for (let i = 0; i < 5; i++) {
    const out = seed.plant(state, { hook: '伏笔' + i, floor: i, eventKey: 'e' + i });
    assert.equal(out.ok, true);
    state = out.state;
  }
  const sixth = seed.plant(state, { hook: '第六条', eventKey: 'e6' });
  assert.equal(sixth.ok, false);
  assert.equal(sixth.reason, 'open-cap');
  assert.equal(sixth.state.items.length, 5);
});

test('已回收只在下一回合清除，本回合回收的留下', () => {
  const planted = seed.plant(null, { hook: '雨夜的伞', floor: 2, eventKey: 'p' });
  const recovered = seed.recover(planted.state, { id: planted.item.id, floor: 5, eventKey: 'r' });
  const same = seed.sweep(recovered.state, 5);
  assert.equal(same.swept, 0);
  assert.equal(same.state.items.length, 1);
  const next = seed.sweep(recovered.state, 6);
  assert.equal(next.swept, 1);
  assert.equal(next.state.items.length, 0);
});

test('终态后不能再推进，渲染只列未回收并标近场远场', () => {
  const near = seed.plant(null, { hook: '近处的钥匙', layer: 'near', eventKey: 'n' });
  const both = seed.plant(near.state, { hook: '远处的旧案', layer: 'far', eventKey: 'f' });
  const text = seed.render(both.state);
  assert.match(text, /近场/);
  assert.match(text, /远场/);
  const done = seed.recover(both.state, { id: near.item.id, floor: 3, eventKey: 'rr' });
  const late = seed.advance(done.state, { id: near.item.id, note: '太晚', eventKey: 'late' });
  assert.equal(late.changed, false);
  assert.equal(late.reason, 'terminal');
  assert.equal(seed.list(done.state, { status: 'unrecovered' }).length, 1);
});

test('召回只读：旧记录不覆盖新事实，没有维护指令就不写回', () => {
  const sealed = router.sealRecall(
    [{ key: '住址', text: '北京' }, { key: '职业', text: '教师' }],
    [{ key: '住址', text: '上海' }],
    {}
  );
  assert.equal(sealed.writable.length, 0);
  assert.equal(sealed.refusedWrite, true);
  assert.equal(sealed.shadowed, 1);
  assert.equal(sealed.sealed.every((item) => item.readonly && item.writable === false), true);
  const maintained = router.sealRecall(
    [{ key: '住址', text: '北京' }],
    [{ key: '住址', text: '上海' }],
    { maintain: true }
  );
  assert.equal(maintained.writable.length, 1);
  assert.equal(maintained.writable[0].text, '上海');
  assert.equal(maintained.refusedWrite, false);
});

test('场景头只记本楼，空头拒绝，导入导出往返', () => {
  const book = new scene.SceneBook();
  assert.equal(book.setHeader(3, {}), false);
  assert.equal(book.setHeader(3, { date: '霜月三日', period: '傍晚', weather: '小雨' }), true);
  assert.equal(book.headerLine(3), '【场景头】霜月三日 · 傍晚 · 小雨');
  assert.equal(book.headerAt(4), null);
  const dumped = book.export();
  const again = new scene.SceneBook(dumped);
  assert.equal(again.headerLine(3), '【场景头】霜月三日 · 傍晚 · 小雨');
  book.clear();
  assert.equal(book.headerAt(3), null);
});

test('manifest 登记了 seed-ledger，宿主写入口与注入口都在', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  assert.ok(manifest.extra_js.includes('seed-ledger.js'));
  const index = readFileSync(join(root, 'index.js'), 'utf8');
  assert.equal((index.match(/recordSeedFact/g) || []).length >= 1, true);
  assert.ok(index.includes('wp_seed_ledger'));
  assert.ok(index.includes('this.seedLedger = data.seedLedger || null'));
});
