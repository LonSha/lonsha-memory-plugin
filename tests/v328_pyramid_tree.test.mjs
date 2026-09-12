// tests/v328_pyramid_tree.test.mjs
// v3.28.0 测试：三级金字塔摘要 + 记忆树路由召回（st-memory-wizzard 本地轻量版）
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf-8');

// 版本断言（>= v3.28 容灾）
const vm = src.match(/const VERSION = '([^']+)'/);
if (!vm) { console.error('FAIL: VERSION 未找到'); process.exit(1); }
if (parseFloat(vm[1]) < 3.28) { console.error(`FAIL: 版本 ${vm[1]} < 3.28`); process.exit(1); }
console.log(`ok: 版本 ${vm[1]}`);

let pass = 0;
const fail = (m) => { console.error('FAIL: ' + m); process.exitCode = 1; };
const ok = (m) => { pass++; console.log('ok: ' + m); };

// T1: 三级金字塔结构
{
    if (src.includes('this.historical = []')) ok('T1: historical 数组存在');
    else fail('T1: historical 缺失');
    if (src.includes('historicalFoldThreshold: 12')) ok('T1: historicalFoldThreshold 配置存在');
    else fail('T1: historicalFoldThreshold 缺失');
    if (src.includes('maybeFoldHistorical')) ok('T1: maybeFoldHistorical 方法存在');
    else fail('T1: maybeFoldHistorical 缺失');
    if (src.includes('level: 2')) ok('T1: 卷摘要标记为周记层(level2)');
    else fail('T1: 周记层标记缺失');
    if (src.includes('level: 3')) ok('T1: 史记标记 level3');
    else fail('T1: 史记层标记缺失');
    // 导入对称
    if (src.includes('historical = Array.isArray(data.historical)')) ok('T1: historical 导入对称');
    else fail('T1: historical 导入缺失');
    // 注入: 史记+周记
    if (src.includes('【史记·跨阶段总览】')) ok('T1: 史记注入块存在');
    else fail('T1: 史记注入块缺失');
    if (src.includes('【周记·阶段概括】')) ok('T1: 周记注入块存在');
    else fail('T1: 周记注入块缺失');
    if (src.includes('getActiveVolumes()')) ok('T1: 活跃周记过滤存在');
    else fail('T1: 活跃周记过滤缺失');
}

// T2: 三级金字塔折叠逻辑
{
    if (src.includes('this.volumes.length >= (config.historicalFoldThreshold || 12)')) ok('T2: 史记折叠触发条件存在');
    else fail('T2: 史记折叠触发缺失');
    if (src.includes('v.archived = true')) ok('T2: 入史记的周记标记归档');
    else fail('T2: 周记归档标记缺失');
    if (src.includes('你是历史学家')) ok('T2: 史记折叠 prompt 存在');
    else fail('T2: 史记 prompt 缺失');
}

// T3: 记忆树路由召回（本地轻量版）
{
    if (src.includes('memoryTreeEnabled: false')) ok('T3: memoryTreeEnabled 开关存在（默认关）');
    else fail('T3: memoryTreeEnabled 缺失');
    if (src.includes('memoryTree')) ok('T3: memoryTree source 存在');
    else fail('T3: memoryTree source 缺失');
    if (src.includes('treePaths.push')) ok('T3: 记忆树路径构建存在');
    else fail('T3: treePaths 缺失');
    if (src.includes('neighborNames')) ok('T3: 邻接节点提取存在');
    else fail('T3: neighborNames 缺失');
    // buildInjection 独立分区
    if (src.includes("item.source === 'memoryTree') treeNotes.push")) ok('T3: 记忆树独立分区');
    else fail('T3: memoryTree 分区缺失');
    if (src.includes('[记忆树·角色关联]')) ok('T3: 记忆树渲染块存在');
    else fail('T3: 记忆树渲染块缺失');
}

// T4: v3.23-27 功能回归
{
    if (src.includes('_diffusionFatigue')) ok('T4: 扩散疲劳仍在');
    else fail('T4: 扩散疲劳丢失');
    if (src.includes('_archivedFloorIds')) ok('T4: 归档状态仍在');
    else fail('T4: 归档状态丢失');
    if (src.includes('RESIDENT_MARKERS')) ok('T4: 召回分级仍在');
    else fail('T4: 召回分级丢失');
    if (src.includes('extractSynopsisFast')) ok('T4: synopsis 提取仍在');
    else fail('T4: synopsis 提取丢失');
    if (src.includes('_lastRecallTrace')) ok('T4: 命中轨迹仍在');
    else fail('T4: 命中轨迹丢失');
}

console.log(`\n✓ v3.28 三级金字塔/记忆树测试全过 (${pass} 项)`);
if (process.exitCode) { console.log('✗ 存在失败项'); process.exit(process.exitCode); }