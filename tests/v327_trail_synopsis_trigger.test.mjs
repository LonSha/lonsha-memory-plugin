// tests/v327_trail_synopsis_trigger.test.mjs
// v3.27.0 测试：命中监控 / <synopsis> 轻量提取 / 触发词按需注入（MemoryPilot + AnchorNote）
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf-8');
const ui = fs.readFileSync(path.join(__dirname, '../settings-ui.js'), 'utf-8');

// 版本断言（>= v3.27 容灾）
const vm = src.match(/const VERSION = '([^']+)'/);
if (!vm) { console.error('FAIL: VERSION 未找到'); process.exit(1); }
if (parseFloat(vm[1]) < 3.27) { console.error(`FAIL: 版本 ${vm[1]} < 3.27`); process.exit(1); }
console.log(`ok: 版本 ${vm[1]}`);

let pass = 0;
const fail = (m) => { console.error('FAIL: ' + m); process.exitCode = 1; };
const ok = (m) => { pass++; console.log('ok: ' + m); };

// T1: <synopsis> 轻量提取函数
{
    if (src.includes('SYNOPSIS_BLOCK_RE')) ok('T1: synopsis 正则存在');
    else fail('T1: SYNOPSIS_BLOCK_RE 缺失');
    if (src.includes('function extractSynopsisFast')) ok('T1: extractSynopsisFast 函数存在');
    else fail('T1: extractSynopsisFast 缺失');
    if (src.includes('synopsisFastPath')) ok('T1: synopsisFastPath 开关存在');
    else fail('T1: synopsisFastPath 缺失');
    if (src.includes('extractSynopsisFast(message.mes || message.content || \'\')')) ok('T1: 快速路径接入提取管线');
    else fail('T1: 快速路径未接入');
}

// T2: 命中轨迹记录
{
    if (src.includes('_lastRecallTrace')) ok('T2: 轨迹状态存在');
    else fail('T2: _lastRecallTrace 缺失');
    if (src.includes('trailMonitor: true')) ok('T2: trailMonitor 开关存在');
    else fail('T2: trailMonitor 缺失');
    if (src.includes('_traceStartTime = Date.now()')) ok('T2: 计时起点存在');
    else fail('T2: 计时起点缺失');
    if (src.includes('sources: srcMap')) ok('T2: 来源分布记录存在');
    else fail('T2: sources 记录缺失');
    // settings-ui 监控区块
    if (ui.includes('最近一次召回')) ok('T2: 状态面板命中监控区块存在');
    else fail('T2: 面板监控区块缺失');
    if (ui.includes('来源分布')) ok('T2: 面板来源分布展示存在');
    else fail('T2: 面板来源分布缺失');
}

// T3: 触发词按需注入
{
    if (src.includes('onDemandTriggerPhrase')) ok('T3: 触发词配置存在');
    else fail('T3: onDemandTriggerPhrase 缺失');
    if (src.includes('lastUser.includes(triggerPhrase)')) ok('T3: 触发词检测存在');
    else fail('T3: 触发词检测缺失');
    if (src.includes('triggerHit')) ok('T3: 触发命中标记存在');
    else fail('T3: triggerHit 缺失');
    if (src.includes('toInjection?.()')) ok('T3: 世界推进按需注入使用 toInjection');
    else fail('T3: 按需注入路径缺失');
}

// T4: v3.25/26 功能回归
{
    if (src.includes('_diffusionFatigue')) ok('T4: 扩散疲劳仍在');
    else fail('T4: 扩散疲劳丢失');
    if (src.includes('_archivedFloorIds')) ok('T4: 归档状态仍在');
    else fail('T4: 归档状态丢失');
    if (src.includes('RESIDENT_MARKERS')) ok('T4: 召回分级仍在');
    else fail('T4: 召回分级丢失');
    if (src.includes('resetRecallDedup')) ok('T4: dedup 清理仍在');
    else fail('T4: dedup 清理丢失');
}

console.log(`\n✓ v3.27 命中监控/synopsis/触发词测试全过 (${pass} 项)`);
if (process.exitCode) { console.log('✗ 存在失败项'); process.exit(process.exitCode); }