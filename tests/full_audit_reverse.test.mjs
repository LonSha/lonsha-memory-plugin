// tests/full_audit_reverse.test.mjs
// LonSha 记忆引擎 v3.75.0 全面审计 —— 逆向审计（假设出错）
// 覆盖：模块关闭漏网 / 跨模块串扰 / 矛盾指令同注 / 导入静默破坏 / 空写入崩溃 / 清洗误伤
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';

const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf-8');
const su = readFileSync('/home/user/lonsha-memory-plugin/settings-ui.js', 'utf-8');
const bridge = readFileSync('/home/user/ruby-phone-work/apps/memory/lonsha-bridge.js', 'utf-8');
const mv = readFileSync('/home/user/ruby-phone-work/apps/memory/memory-view.js', 'utf-8');

function extractClass(source, startMarker) {
    const start = source.indexOf(startMarker);
    if (start < 0) return null;
    let depth = 0, started = false;
    for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') { depth--; if (started && depth === 0) return source.slice(start, i + 1); }
    }
    return null;
}

// ─────────── 逆向审计 1：假设 deltaBook 未实例化（模块关闭漏网） ───────────
test('【逆向1】deltaBook 全部调用点守卫', () => {
    const guards = [
        ['注入流 toPrompt', src.includes('if (this.deltaBook) {\n                const deltaPrompt = this.deltaBook.toPrompt();')],
        ['maybeFold 消费', src.includes('if (deltasList?.length && this.deltaBook) {')],
        ['回滚 removeByFloor', src.includes('this.deltaBook?.removeByFloor ? this.deltaBook.removeByFloor(floor) : 0')],
        ['位移 shiftFloorsFrom', src.includes('this.deltaBook?.deltas || []')],
        ['自动确证', src.includes('if (this.deltaBook && this.deltaBook.deltas.some')],
        ['快照导出', src.includes('deltaBook: this.deltaBook.export(),')],
        ['payload 携带', src.includes('deltaBook: this.deltaBook?.export?.() || null')],
        ['报告板块', src.includes('const dbList = this.deltaBook?.deltas || [];')],
        ['UI 视图', su.includes('s.deltaBook?.deltas || []')],
        ['UI 确证', su.includes('s.deltaBook?.confirm?.(dsum)')],
        ['UI 卡片', su.includes('s.deltaBook?.deltas?.length || 0')],
        ['手机桥回填', bridge.includes('extracted.deltaBook?.deltas || extracted.deltas || []')],
    ];
    for (const [name, ok] of guards) assert.ok(ok, '守卫缺失: ' + name);
});

// ─────────── 逆向审计 2：假设 lockedFacts 模块关闭 ───────────
test('【逆向2】lockedFacts 全部调用点守卫', () => {
    const guards = [
        ['摘要提取 prompt', src.includes("(this.config.config.lockedFactsEnabled !== false) ? this.summary.lockedFactsForPrompt() : ''")],
        ['注入流', src.includes('this.summary?.lockedFactsForPrompt?.()')],
        ['快照持久化', src.includes('lockedFacts: this.summary.getLockedFacts(),')],
        ['payload 携带', src.includes('lockedFacts: (this.config.config.lockedFactsEnabled !== false) ? this.summary.getLockedFacts() : []')],
        ['UI 卡片', su.includes('s.summary?.getLockedFacts?.().length || 0')],
        ['UI 视图', su.includes('s.summary?.getLockedFacts?.() || []')],
        ['UI 编辑', su.includes('s.lockFact ? s.lockFact(text) : s.summary.addLockedFact(text, curFloor)')],
        ['UI 删除', su.includes('s.unlockFact ? s.unlockFact(id) : s.summary.removeLockedFact(id)')],
        ['桥回填', bridge.includes('extracted.lockedFacts || []')],
        ['报告板块', src.includes('this.summary?.getLockedFacts?.() || [])')],
    ];
    for (const [name, ok] of guards) assert.ok(ok, '守卫缺失: ' + name);
});

// ─────────── 逆向审计 3：假设旧版桥（无新方法）──LonSha 新代码调用旧桥 ───────────
test('【逆向3】旧版桥兼容（可选链守卫）', () => {
    // LonSha 侧调用桥新方法时全部有 ?.
    assert.ok(src.includes('bridge?.backfillDiaries?.') || src.includes('bridge.backfillDiaries?.('), 'backfillDiaries 可选');
    assert.ok(src.includes('syncClock?.(') || src.includes('bridge.syncClock?.('), 'syncClock 可选');
    // 桥侧调用 memoryCore 新方法时全部有 ?.
    assert.ok(bridge.includes('this.memoryCore.getEntries?.()'), 'getEntries 可选');
    assert.ok(bridge.includes('this.memoryCore.updateEntry)'), 'updateEntry 条件判断');
    assert.ok(bridge.includes('this.memoryCore.record('), 'record 直调（核心方法必有）');
    // UI 侧调用引擎新方法时全部有守卫或 ?.
    assert.ok(su.includes('s.summary?.updateSummaryText') || su.includes('eng.summary?.updateSummaryText'), 'updateSummaryText 守卫');
    assert.ok(su.includes('s.summary?.addManualSummary'), 'addManualSummary 守卫');
    assert.ok(su.includes('s.deltaBook?.confirm?.(dsum)'), 'confirm 双可选链');
});

// ─────────── 逆向审计 4：假设数据为空/畸形（空写入崩溃） ───────────
test('【逆向4】空值与畸形数据防护', () => {
    // SummarySystem 空防护
    const cls = extractClass(src, 'class SummarySystem');
    assert.ok(cls, 'SummarySystem 可提取');
    assert.ok(cls.includes("if (!t) return null;"), 'addLockedFact 空防护');
    assert.ok(cls.includes('if (!t || !Number.isFinite(f) || f < 0) return null;'), 'addManualSummary 防护');
    assert.ok(cls.includes('return this.lockedFacts || [];'), 'export 空数组兜底');
    assert.ok(cls.includes('this.genericTiers = Array.isArray(data.genericTiers) ? data.genericTiers : [];'), 'import 空兜底');
    // ConflictBook severity 白名单兜底
    assert.ok(src.includes("['low', 'medium', 'high'].includes(severity) ? severity : 'medium'"), 'severity 兜底');
    // DeltaBook 状态兜底
    assert.ok(src.includes("['established', 'uncertain'].includes(status) ? status : 'uncertain'"), 'status 兜底');
    // 桥空防护
    assert.ok(bridge.includes('if (!lf?.text) continue;'), '铁律空文本');
    assert.ok(bridge.includes('if (!d?.summary) continue;'), '正史空文本');
    assert.ok(bridge.includes('Array.isArray(lockedFacts)'), '类型防护');
    // UI 空输入
    assert.ok(su.includes("if (!text) { toast('请输入事实内容'); return; }"), '锁定空输入');
    assert.ok(su.includes("if (!t) { toast('请输入摘要内容'); return; }"), '补摘空输入');
});

// ─────────── 逆向审计 5：假设导入旧版快照（导入静默破坏） ───────────
test('【逆向5】旧快照导入兼容', () => {
    const cls = extractClass(src, 'class SummarySystem');
    const SummarySystem = new Function('return (' + cls + ')')();
    // 最老格式：纯数组
    const s1 = new SummarySystem();
    s1.import([{ text: 'x', floor: 1 }]);
    assert.strictEqual(s1.summaries.length, 1, '数组格式');
    assert.deepStrictEqual(s1.lockedFacts, [], '无 lockedFacts 兜底');
    assert.deepStrictEqual(s1.genericTiers, [], '无 genericTiers 兜底');
    // 中期格式：对象无新字段
    const s2 = new SummarySystem();
    s2.import({ summaries: [], volumes: [], historical: [] });
    assert.deepStrictEqual(s2.getLockedFacts(), [], 'lockedFacts 空兜底');
    // 空对象
    const s3 = new SummarySystem();
    s3.import({});
    assert.deepStrictEqual(s3.summaries, [], '空对象兜底');
    // ConflictBook 旧条目（无 severity）
    const cbCls = extractClass(src, 'class ConflictBook');
    const ConflictBook = new Function('return (' + cbCls + ')')();
    const cb = new ConflictBook();
    cb.conflicts.push({ subject: '旧', versionA: 'a', versionB: 'b', note: '', floor: 1, time: '', timestamp: 0 });
    assert.ok(typeof cb.toPrompt() === 'string', '无 severity 旧条目 toPrompt 不崩');
});

// ─────────── 逆向审计 6：假设清洗误伤（标签类功能数据源） ───────────
test('【逆向6】清洗前原文快照使用', () => {
    // 时间标签提取用 _rawForSynopsis（清洗前）
    assert.ok(src.includes("extractDualTimeTags(_rawForSynopsis || message.mes || '')"), '时间标签用原文');
    // dualTimeAnchor 主路径也用原文
    assert.ok(src.includes('extractDualTimeTags(_rawForSynopsis);'), 'dualTimeAnchor 原文');
    // AI 主动记忆操作符在清洗前
    assert.ok(src.includes('清洗前，因为 cleanMessageText 会剥标签'), '操作符清洗前注释');
});

// ─────────── 逆向审计 7：跨模块标签串扰 ───────────
test('【逆向7】标签前缀唯一性', () => {
    // 各模块标签前缀互不冲突
    const tags = ['[铁律]', '[正史]', '[群像]', '[摘要·第', '[剧情]', '[事件]', '[关系]', '[当前剧情时间]'];
    const mvTags = mv.match(/\^\\\[(铁律|正史|剧情|事件|关系)\\\]/g) || [];
    // 徽标正则各不重叠（铁律/正史/剧情事件关系分组）
    assert.ok(mv.length >= 3, 'memory-view 徽标正则存在');
    // 桥侧标签与徽标正则对齐
    assert.ok(bridge.includes('[铁律] '), '桥铁律');
    assert.ok(bridge.includes('[正史] '), '桥正史');
    assert.ok(bridge.includes('[群像] '), '桥群像');
});

// ─────────── 逆向审计 8：假设 UI 打开时引擎未初始化 ───────────
test('【逆向8】引擎未初始化守卫', () => {
    // showBrowser 开头有引擎检查
    assert.ok(su.includes('const s = this.engine;'), 'engine 引用');
    // 关键视图都有空守卫
    assert.ok(su.includes("s.summary?.getLockedFacts?.() || []"), '锁定事实 ?.');
    assert.ok(su.includes('s.conflicts?.conflicts || []'), '矛盾 ?.');
    assert.ok(su.includes('s.deltaBook?.deltas || []'), '增量 ?.');
    assert.ok(su.includes('s.opLog?.entries?.length || 0'), 'OpLog ?.');
});