// tests/v361_report.test.mjs
// LonSha 记忆引擎 v3.61.0 记忆全景报告测试套件
// 涵盖：P24 exportMemoryReport（11 板块 Markdown）、面板导出按钮

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');
const suSrc = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf-8');

test('=== 1. exportMemoryReport 方法验证 ===', () => {
    assert.ok(src.includes('exportMemoryReport() {'), '方法定义');
    // 11 板块
    for (const sec of ['📊 概览', '🧍 主角档案', '🕸️ 角色羁绊网', '📚 章节卷摘要', '🏛️ 纪元史记',
                       '👥 群像共同记忆', '🧩 未结悬念', '📔 角色日记', '🎒 物品台账', '🎬 当前大纲', '🔍 审计统计']) {
        assert.ok(src.includes(`'## ${sec}'`), `板块缺失: ${sec}`);
    }
    // helper 在 IIFE 内部
    assert.ok(src.includes('function opLogStatsCompat(engine) {'), 'helper 函数');
    console.log('✓ exportMemoryReport 方法验证通过');
});

test('=== 2. settings-ui 导出按钮验证 ===', () => {
    assert.ok(suSrc.includes('data-view="report"'), 'report 入口卡片');
    assert.ok(suSrc.includes('全景报告 ⬇'), '卡片标签');
    assert.ok(suSrc.includes('this.engine.exportMemoryReport()'), '调用导出方法');
    assert.ok(suSrc.includes("a.download = `lonsha-memory-report-${Date.now()}.md`"), 'Blob 下载');
    assert.ok(suSrc.includes('esc(md.substring(0, 1500))'), '预览转义');
    console.log('✓ settings-ui 导出按钮验证通过');
});

test('=== 3. 版本断言宽域回归验证 ===', () => {
    // v344/345/346/347 的版本正则已统一为 3\.\d{2,}\.\d+ 宽域
    for (const vf of ['v344_ultimate_bastion', 'v345_deep_bastion', 'v346_fortress_pyramid', 'v347_hc_mechanics']) {
        const t = readFileSync(new URL(`../tests/${vf}.test.mjs`, import.meta.url), 'utf-8');
        assert.ok(t.includes("3\\.\\d{2,}\\.\\d+") || t.includes('3\\.\\d{2,}'), `${vf} 版本正则宽域`);
        assert.ok(t.includes('4[4-9]') === false || !t.includes("3\\.(?:4"), `${vf} 旧窄域正则绝迹`);
    }
    console.log('✓ 版本断言宽域回归验证通过');
});