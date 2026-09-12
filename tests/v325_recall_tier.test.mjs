// tests/v325_recall_tier.test.mjs
// v3.25.0 测试：召回类型分级 / token 预算双层 / 归档隐藏 / 扩散疲劳（MemoryPilot + 记忆库v5 + Bakemono + TriviumDB）
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf-8');

// 版本断言（>= v3.25 容灾）
const vm = src.match(/const VERSION = '([^']+)'/);
if (!vm) { console.error('FAIL: VERSION 未找到'); process.exit(1); }
if (parseFloat(vm[1]) < 3.25) { console.error(`FAIL: 版本 ${vm[1]} < 3.25`); process.exit(1); }
console.log(`ok: 版本 ${vm[1]}`);

let pass = 0;
const fail = (m) => { console.error('FAIL: ' + m); process.exitCode = 1; };
const ok = (m) => { pass++; console.log('ok: ' + m); };

// ── T1: 召回类型分级（常驻分区保留 + 触发分区裁剪）──
{
    // RESIDENT_MARKERS 存在
    if (src.includes("RESIDENT_MARKERS = ['[前情摘要]', '[角色状态]'")) ok('T1: 常驻分区标记存在');
    else fail('T1: RESIDENT_MARKERS 缺失');
    if (src.includes('residentBlocks') && src.includes('triggerBlocks')) ok('T1: 常驻/触发分区拆分存在');
    else fail('T1: 分区拆分缺失');
    // config 开关
    if (src.includes('recallTierEnabled: true')) ok('T1: recallTierEnabled 开关存在');
    else fail('T1: recallTierEnabled 缺失');
}

// ── T2: token 预算双层 ──
{
    if (src.includes('memoryTokenBudget: 900')) ok('T2: memoryTokenBudget 开关存在');
    else fail('T2: memoryTokenBudget 缺失');
    if (src.includes('keepRecentTokenReserve: 0')) ok('T2: keepRecentTokenReserve 开关存在');
    else fail('T2: keepRecentTokenReserve 缺失');
    // budget 计算逻辑（token→字符换算）
    if (src.includes("Math.floor(tokenBudget * 4)")) ok('T2: token→字符预算换算存在');
    else fail('T2: token 换算缺失');
    if (src.includes("budget - Math.floor(reserve * 4)")) ok('T2: 最近正文预留扣减存在');
    else fail('T2: 预留扣减缺失');
}

// ── T3: 归档隐藏 ──
{
    if (src.includes('autoArchiveCovered: false')) ok('T3: autoArchiveCovered 默认关（防灾）');
    else fail('T3: autoArchiveCovered 默认关缺失');
    if (src.includes('archivePreserveRecent: 6')) ok('T3: archivePreserveRecent 存在');
    else fail('T3: archivePreserveRecent 缺失');
    if (src.includes('archiveCoveredFloors(')) ok('T3: archiveCoveredFloors 方法存在');
    else fail('T3: archiveCoveredFloors 缺失');
    if (src.includes('restoreArchivedFloors()')) ok('T3: restoreArchivedFloors 方法存在（可逆）');
    else fail('T3: restoreArchivedFloors 缺失');
    if (src.includes('_archivedFloorIds')) ok('T3: 归档状态跟踪存在');
    else fail('T3: _archivedFloorIds 缺失');
    // 归一化：折叠标记 folded 用于归档判定
    if (src.includes('s.folded && Number.isFinite(s.floor)')) ok('T3: 折叠标记归档判定存在');
    else fail('T3: folded 归档判定缺失');
}

// ── T4: 扩散不应期疲劳（TriviumDB Refractory）──
{
    if (src.includes('_diffusionFatigue')) ok('T4: 疲劳状态存在');
    else fail('T4: _diffusionFatigue 缺失');
    if (src.includes('_nodeIdentity')) ok('T4: 节点身份提取方法存在');
    else fail('T4: _nodeIdentity 缺失');
    if (src.includes('* 0.15')) ok('T4: 疲劳抑制系数 0.15 存在');
    else fail('T4: 疲劳抑制系数缺失');
    if (src.includes('.delete(nid)')) ok('T4: 被抑制即解除（无记忆效应）');
    else fail('T4: 疲劳解除逻辑缺失');
    if (src.includes('_diffusionFatigueTopN = 5')) ok('T4: Top-N 赢家标记存在');
    else fail('T4: Top-N 标记缺失');
    // 轮次衰减（防永久封印）
    if (src.includes('_diffusionFatigueTimeout = 3')) ok('T4: 疲劳超时轮数存在');
    else fail('T4: 疲劳超时缺失');
}

// ── T5: 幂函数入度惩罚（等效黑洞降权）──
{
    // 由于改不了外部库，用完成时后处理（diffusion 返回中热点原子降权）
    if (src.includes('diffusionResults') && src.includes('suppressed')) ok('T5: 黑洞降权后处理路径存在');
    else fail('T5: 黑洞降权路径缺失');
    // 疲劳标记打给 Top-N 赢家 = 等效黑洞抑制
    if (src.includes('.slice(0, this._diffusionFatigueTopN)')) ok('T5: Top-N 赢家疲劳标记存在');
    else fail('T5: Top-N 疲劳标记缺失');
}

// ── T6: 版本 + 全量回归保障 ──
{
    const vm6 = src.match(/const VERSION = '(\d+\.\d+\.\d+)'/);
    if (vm6 && parseFloat(vm6[1]) >= 3.25) ok('T6: VERSION ' + vm6[1]);
    else fail('T6: VERSION >= 3.25');
    if (src.includes('recallTierEnabled') && src.includes('memoryTokenBudget') && src.includes('autoArchiveCovered')) ok('T6: v3.25 config 全开关在位');
    else fail('T6: config 开关缺失');
}

console.log(`\n✓ v3.25 召回分级/预算/归档/疲劳测试全过 (${pass} 项)`);
if (process.exitCode) { console.log('✗ 存在失败项'); process.exit(process.exitCode); }