// tests/v326_archive_reset.test.mjs
// v3.26.0 补丁测试：归档状态在事件变更时同步清理（v3.25 收编完整性）
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// [fix] 语义化版本比较：vnum('3.100.0') === 3.1 会破坏 >=3.2x 断言
function vnum(s) {
  const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf-8');

// 版本断言（>= v3.26 容灾）
const vm = src.match(/const VERSION = '([^']+)'/);
if (!vm) { console.error('FAIL: VERSION 未找到'); process.exit(1); }
if (vnum(vm[1]) < vnum('3.26')) { console.error(`FAIL: 版本 ${vm[1]} < 3.26`); process.exit(1); }
console.log(`ok: 版本 ${vm[1]}`);

let pass = 0;
const fail = (m) => { console.error('FAIL: ' + m); process.exitCode = 1; };
const ok = (m) => { pass++; console.log('ok: ' + m); };

// ST1: 四事件处理器接入 _archivedFloorIds.clear()
const checks = [
    ['CHAT_CHANGED', 'events.CHAT_CHANGED归档清空'],
    ['MESSAGE_EDITED', 'events.MESSAGE_EDITED归档清空'],
    ['MESSAGE_DELETED', 'events.MESSAGE_DELETED归档清空'],
];
for (const [name, tag] of checks) {
    if (src.includes(`errLog(e, '${tag}')`)) ok(`ST1-${name}: 归档状态清理已接入`);
    else fail(`ST1-${name}: 归档清理缺失（${tag}）`);
}
// rollbackFloor 清理点（[v3.115] 升级：原全清 .clear() → 精确剪枝，只丢弃被回滚楼层及之后的归档，
//                            保留更早的有效归档。断言改为检测新的精确清理标签 + 旧标签已移除）
if (src.includes("errLog(e, 'rollbackFloor.归档状态精确清理')")) ok('ST1-rollback: rollbackFloor 归档精确清理已接入');
else fail('ST1-rollback: rollbackFloor 归档清理缺失');
if (src.includes("errLog(e, 'rollbackFloor.归档状态清理')")) fail('ST1-rollback: 旧的全清标签仍残留（应已升级为精确清理）');
else ok('ST1-rollback: 旧全清标签已移除');

// ST2: v3.25 功能仍在（回归保障）
if (src.includes('_archivedFloorIds')) ok('ST2: 归档状态跟踪仍在');
else fail('ST2: _archivedFloorIds 丢失');
if (src.includes('archiveCoveredFloors(')) ok('ST2: archiveCoveredFloors 仍在');
else fail('ST2: archiveCoveredFloors 丢失');
if (src.includes('restoreArchivedFloors()')) ok('ST2: restoreArchivedFloors 仍在');
else fail('ST2: restoreArchivedFloors 丢失');

// ST3: v3.24 dedup 清理与 v3.23 功能仍在
if (src.includes('resetRecallDedup')) ok('ST3: resetRecallDedup 仍在');
else fail('ST3: resetRecallDedup 丢失');
if (src.includes('_diffusionFatigue')) ok('ST3: 扩散疲劳仍在');
else fail('ST3: _diffusionFatigue 丢失');
if (src.includes('RESIDENT_MARKERS')) ok('ST3: 召回分级仍在');
else fail('ST3: RESIDENT_MARKERS 丢失');
if (src.includes('memoryTokenBudget')) ok('ST3: token 预算仍在');
else fail('ST3: memoryTokenBudget 丢失');

console.log(`\n✓ v3.26 归档状态清理测试全过 (${pass} 项)`);
if (process.exitCode) { console.log('✗ 存在失败项'); process.exit(process.exitCode); }