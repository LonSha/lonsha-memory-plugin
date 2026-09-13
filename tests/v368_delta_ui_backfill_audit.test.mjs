// tests/v368_delta_ui_backfill_audit.test.mjs
// LonSha 记忆引擎 v3.68.0 DeltaBook UI + 手机回填 + 双向审计测试
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';

const su = readFileSync('/home/user/lonsha-memory-plugin/settings-ui.js', 'utf-8');
const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf-8');
const bridge = readFileSync('/home/user/ruby-phone-work/apps/memory/lonsha-bridge.js', 'utf-8');
const mv = readFileSync('/home/user/ruby-phone-work/apps/memory/memory-view.js', 'utf-8');
const css = readFileSync('/home/user/ruby-phone-work/apps/memory/memory.css', 'utf-8');

test('=== 1. 正向审计：UI 视图端到端链路 ===', () => {
    // 卡片 → 视图 → 交互 → 引擎调用 全链路存在
    assert.ok(su.includes('data-view="deltas"'), '状态总览卡片');
    assert.ok(su.includes("viewType === 'deltas'"), '视图分支');
    assert.ok(su.includes('📒 正史增量账本'), '视图标题');
    assert.ok(su.includes('stBadge'), '状态徽标函数');
    assert.ok(su.includes('✅已确证'), 'established 徽标');
    assert.ok(su.includes('⏳待定'), 'uncertain 徽标');
    assert.ok(su.includes('ls-delta-confirm'), '手动确证按钮');
    assert.ok(su.includes("s.deltaBook?.confirm?.(dsum)"), '确证调用');
    assert.ok(su.includes("plugin.showBrowser('deltas')"), '视图刷新');
    assert.ok(su.includes('esc(d.summary)'), 'XSS 转义');
});

test('=== 2. 正向审计：卡片位置与渲染序 ===', () => {
    const cfIdx = su.indexOf('data-view="conflicts"');
    const deltaIdx = su.indexOf('data-view="deltas"');
    const injIdx = su.indexOf('data-view="injection"');
    assert.ok(deltaIdx > cfIdx, '增量卡片在矛盾之后');
    assert.ok(deltaIdx < injIdx, '在注入预览之前');
    // 手机端渲染序：deltaTag 在 ironTag 之前（正史优先显示）
    assert.ok(mv.includes("' + deltaTag + ironTag + lonshaTag + tag +"), 'deltaTag 渲染序最前');
});

test('=== 3. 正向审计：手机回填链路 ===', () => {
    // 桥侧通道
    assert.ok(bridge.includes('[正史] '), '[正史] 前缀');
    assert.ok(bridge.includes("tags: ['delta']"), 'delta 标签');
    assert.ok(bridge.includes('pinned: true, importance: 7'), 'pinned importance 7');
    assert.ok(bridge.includes("filter(x => x.status === 'established')"), '仅 established 回填');
    assert.ok(bridge.includes('slice(-4)'), '节流 4 条');
    assert.ok(bridge.includes('this.stats.deltaIngested = (this.stats.deltaIngested || 0) + 1'), '统计累加');
    assert.ok(bridge.includes('deltaIngested: 0'), 'stats 初始字段');
    // LonSha payload
    assert.ok(src.includes('deltaBook: this.deltaBook?.export?.() || null'), 'payload 携带 deltaBook');
    // 手机徽标
    assert.ok(mv.includes('deltaTag'), 'deltaTag');
    assert.ok(mv.includes('📒正史'), '正史徽标文本');
    assert.ok(css.includes('.mem-delta'), 'CSS 样式');
    assert.ok(css.includes('#86efac'), '绿色渐变');
});

test('=== 4. 逆向审计：假设出错——模块关闭漏网检查 ===', () => {
    // 假设 deltaBook 未实例化：toPrompt/addFromList 调用点全部有守卫？
    const callSites = [
        ['this.deltaBook?.toPrompt', src.includes('const deltaPrompt = this.deltaBook.toPrompt();') ? src.includes('if (this.deltaBook) {') : false],
        ['addFromList 守卫', src.includes("if (deltasList?.length && this.deltaBook) {")],
        ['回滚守卫', src.includes('this.deltaBook?.removeByFloor ? this.deltaBook.removeByFloor(floor) : 0')],
        ['位移守卫', src.includes('this.deltaBook?.deltas || []')],
        ['自动确证守卫', src.includes('if (this.deltaBook && this.deltaBook.deltas.some')],
        ['payload 守卫', src.includes('this.deltaBook?.export?.() || null')],
    ];
    for (const [name, ok] of callSites) assert.ok(ok, '守卫缺失: ' + name);
});

test('=== 5. 逆向审计：桥空值与类型防护 ===', () => {
    // 假设 payload 无 deltaBook 字段（旧版 LonSha）：桥侧不崩
    assert.ok(bridge.includes('extracted.deltaBook?.deltas || extracted.deltas || []'), '可选链兜底');
    assert.ok(bridge.includes('Array.isArray(deltaList)'), '类型防护');
    assert.ok(bridge.includes('if (!d?.summary) continue;'), '空文本跳过');
    // 假设 deltaIngested 未初始化（旧 stats 恢复）：累加不崩
    assert.ok(bridge.includes('(this.stats.deltaIngested || 0)'), '累加兜底');
});

test('=== 6. 逆向审计：旧数据兼容 ===', () => {
    // 假设旧快照无 deltaBook：collectExport 保存 null 不崩
    assert.ok(src.includes('deltaBook: this.deltaBook?.export?.() || null'), 'null 兜底');
    // 假设旧 stats 无 deltaIngested：_load 合并兜底
    assert.ok(bridge.includes('if (d.stats) this.stats = { ...this.stats, ...d.stats };'), 'stats 合并兜底');
});

test('=== 7. 双端识别一致性 ===', () => {
    // 桥侧 [正史] 前缀与手机徽标正则对齐
    assert.ok(bridge.includes('`[正史] ${d.summary}'), '桥侧记录格式');
    assert.ok(mv.includes("/^\\[正史\\]/.test(m.content"), '手机徽标正则');
    // CSS 三色体系：铁律金色/正史绿色/LLM 紫色
    assert.ok(css.includes('.mem-iron') && css.includes('.mem-delta') && css.includes('.mem-lonsha'), '三徽标齐备');
});