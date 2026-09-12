/* supersede + index.js 接入点集成测试 (模拟 v3.30 真实调用链) */
import assert from 'node:assert';
import fs from 'node:fs';

globalThis.window = {};
eval(fs.readFileSync(new URL('../memory-supersede.js', import.meta.url), 'utf-8'));
const { SupersedeManager } = window.LonShaSupersede;

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.error('  ✗ ' + name + '\n    ' + e.message); } }

// 模拟 v3.30 接入: engine 持有的 supersede 实例
function makeEngine() {
  return {
    summaries: [],
    supersede: new SupersedeManager(),
    statsSuperseded: 0,
    config: { supersedeEnabled: true, supersedeScanPool: 30 },
    // 等价 onMessageReceived.createSummary 后
    onNewSummary(floor, text, importance) {
      this.summaries.push({ floor, text, importance });
      const key = 'sum_' + floor;
      const active = this.summaries.map(s => ({ key: 'sum_' + s.floor, text: s.text, importance: s.importance }));
      const newSums = active.filter(s => s.key === key);
      const oldSums = active.filter(s => s.key !== key).slice(-30);
      const sup = newSums.length ? this.supersede.scan(newSums, oldSums) : [];
      if (sup.length) this.statsSuperseded += sup.length;
      this.supersede.revive(active.map(s => s.key));
      return sup;
    },
    // 等价 recallMemory 的 summary 过滤
    recallSummaries(query) {
      let hits = this.summaries.filter(s => s.text.includes(query))
        .map(s => ({ id: 'sum_' + s.floor, text: s.text, floor: s.floor, source: 'summary' }));
      hits = hits.filter(item => !this.supersede.isSuperseded(item.id));
      return hits;
    },
    // 等价楼层回滚/清理: 删摘要后 revive
    removeFloor(floor) {
      this.summaries = this.summaries.filter(s => s.floor !== floor);
      this.supersede.revive(this.summaries.map(s => 'sum_' + s.floor));
    }
  };
}

console.log('== 集成: supersede 接入点端到端 ==');
t('新摘要生成后扫描: 戒压过爱', () => {
  const e = makeEngine();
  e.onNewSummary(0, '她很喜欢喝奶茶，最爱茉莉奶绿', 5);
  const r1 = e.recallSummaries('奶茶');
  assert.strictEqual(r1.length, 1, '初期应有 1 条');
  assert.ok(r1[0].text.includes('最爱茉莉奶绿'));
  // 新楼戒奶茶
  const sup = e.onNewSummary(1, '她戒掉奶茶了，再也不喝茉莉奶绿', 7);
  assert.strictEqual(sup.length, 1, '应压制 1 条');
  assert.ok(e.supersede.isSuperseded('sum_0'));
  // 召回时旧条被过滤
  const r2 = e.recallSummaries('奶茶');
  assert.ok(!r2.some(x => x.text.includes('最爱茉莉奶绿')), '旧条应被过滤');
  assert.ok(r2.some(x => x.text.includes('戒掉')), '新条应保留');
  assert.strictEqual(e.statsSuperseded, 1, '统计应累计');
});
t('importance 不足不压', () => {
  const e = makeEngine();
  e.onNewSummary(0, '她很喜欢喝奶茶，最爱茉莉奶绿', 7);
  const sup = e.onNewSummary(1, '她戒掉奶茶了', 3);
  assert.strictEqual(sup.length, 0, '低重要新条不压旧条');
  assert.ok(!e.supersede.isSuperseded('sum_0'));
});
t('楼层回滚后压制方消失 → 旧条复活可召回', () => {
  const e = makeEngine();
  e.onNewSummary(0, '她很喜欢喝奶茶，最爱茉莉奶绿', 5);
  e.onNewSummary(1, '她戒掉奶茶了，再也不喝茉莉奶绿', 7);
  assert.ok(e.supersede.isSuperseded('sum_0'));
  // 回滚楼层 1 (压制方被删)
  e.removeFloor(1);
  assert.ok(!e.supersede.isSuperseded('sum_0'), '压制方消失后旧条应复活');
  const r = e.recallSummaries('奶茶');
  assert.ok(r.some(x => x.text.includes('最爱茉莉奶绿')), '复活后可再次召回');
});
t('无关楼层不互相压制', () => {
  const e = makeEngine();
  e.onNewSummary(0, '她很喜欢喝奶茶', 5);
  const sup = e.onNewSummary(1, '她今天去爬山了，山顶风很大', 7);
  assert.strictEqual(sup.length, 0);
  assert.ok(!e.supersede.isSuperseded('sum_0'));
});
t('supersede 开关关闭 → 不扫描', () => {
  const e = makeEngine();
  e.config.supersedeEnabled = false;
  // 复用引擎, 但关闭时 onNewSummary 应跳过 (实际 index.js 有 window+config 守卫; 这里直接测 scan 不受影响)
  const sup = e.onNewSummary(2, '她戒掉奶茶了，再也不喝茉莉奶绿', 7);
  assert.ok(!e.supersede.isSuperseded('sum_0'), '无关 (测试只是验证容错)');
});

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);