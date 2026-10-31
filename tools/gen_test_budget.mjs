import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..');

const costReadingsPath = path.join(ROOT, 'tests/audit/test_cost_readings.json');
const budgetPath = path.join(ROOT, 'tests/audit/test_budget.json');

const costData = JSON.parse(fs.readFileSync(costReadingsPath, 'utf8'));
const slowestTop = (costData.latest && costData.latest.slowest_top) ? costData.latest.slowest_top : [];

const SLACK = 1.1;
const suitesBudget = {};

for (const item of slowestTop) {
  const file = item.file;
  const ms = item.duration;
  const limitMs = Math.round(ms * SLACK);
  suitesBudget[file] = {
    ms,
    limit_ms: limitMs,
    why: '历史全量回归实测热点采样 (余量 10%)',
  };
}

const top20 = slowestTop.slice(0, 20).map(item => ({
  file: item.file,
  ms: item.duration,
  limit_ms: Math.round(item.duration * SLACK),
}));

const output = {
  schema: 'test-budget@1',
  version: costData.latest?.version || '3.426.0',
  policy: {
    slack_ratio: SLACK,
    enforcement: 'fail-open-warn-only',
    note: '超预算只输出警告不改变退出码；测试面与审计面分开计；预算缺项只报耗时并说明原因',
  },
  tests_total: costData.latest?.tests_total || 420,
  tests_wall_s: costData.latest?.tests_wall_s || 263.9,
  top_20_slowest: top20,
  suites: suitesBudget,
};

fs.writeFileSync(budgetPath, JSON.stringify(output, null, 2) + '\n', 'utf8');

console.log(`[gen_test_budget] 生成 ${budgetPath} 完成：`);
console.log(`  收录预算套件数: ${Object.keys(suitesBudget).length}`);
console.log(`  Top20 最慢档已登记`);