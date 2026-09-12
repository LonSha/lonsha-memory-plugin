// tests/v329_audit_fixes.test.mjs
// v3.29.0 测试：收编完整性审计修复（史记折叠空转 + synopsis 清洗冲突）
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf-8');

// 版本断言（>= v3.29 容灾）
const vm = src.match(/const VERSION = '([^']+)'/);
if (!vm) { console.error('FAIL: VERSION 未找到'); process.exit(1); }
if (parseFloat(vm[1]) < 3.29) { console.error(`FAIL: 版本 ${vm[1]} < 3.29`); process.exit(1); }
console.log(`ok: 版本 ${vm[1]}`);

let pass = 0;
const fail = (m) => { console.error('FAIL: ' + m); process.exitCode = 1; };
const ok = (m) => { pass++; console.log('ok: ' + m); };

// PD-1: 史记折叠空转修复
{
    if (src.includes('foldingHistorical')) ok('PD1: 独立 foldingHistorical 标志存在');
    else fail('PD1: foldingHistorical 缺失');
    if (src.includes('if (this.foldingHistorical) return null;')) ok('PD1: 史记用独立防重入');
    else fail('PD1: 史记防重入未独立');
    // 不再用 this.folding 作为史记防重入
    const mh = src.match(/async maybeFoldHistorical[\s\S]{0,200}/);
    if (mh && !mh[0].includes('if (this.folding) return null')) ok('PD1: 史记不再被 this.folding 阻塞');
    else fail('PD1: 史记仍被 this.folding 阻塞');
    // 阈值对齐（>= threshold 才折叠）
    if (src.includes('if (vols.length < threshold) return null;')) ok('PD1: 阈值判断对齐');
    else fail('PD1: 阈值判断未对齐');
    if (src.includes('finally { this.foldingHistorical = false; }')) ok('PD1: finally 复位独立标志');
    else fail('PD1: finally 复位缺失');
}

// PD-2: synopsis 清洗冲突修复
{
    if (src.includes('_rawForSynopsis')) ok('PD2: 原始文本快照存在');
    else fail('PD2: _rawForSynopsis 缺失');
    if (src.includes('const _rawForSynopsis = String(_tc.content')) ok('PD2: 快照在清洗前创建');
    else fail('PD2: 快照位置错误');
    if (src.includes('extractSynopsisFast(_rawForSynopsis || message.mes')) ok('PD2: synopsis 检测用原始文本');
    else fail('PD2: synopsis 检测未用原始文本');
}

// 回归：v3.23-28 功能仍在
{
    ['_diffusionFatigue', '_archivedFloorIds', 'RESIDENT_MARKERS', 'extractSynopsisFast', '_lastRecallTrace', 'historical', 'memoryTree'].forEach(k => {
        if (src.includes(k)) ok(`回归: ${k} 仍在`);
        else fail(`回归: ${k} 丢失`);
    });
}

console.log(`\n✓ v3.29 审计修复测试全过 (${pass} 项)`);
if (process.exitCode) { console.log('✗ 存在失败项'); process.exit(process.exitCode); }