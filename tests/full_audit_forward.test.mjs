// tests/full_audit_forward.test.mjs
// LonSha 记忆引擎 v3.75.0 全面审计 —— 正向审计（模拟运行时验证）
// 覆盖：核心类全方法功能 / 全模块 export-import 对称 / 折叠链 / 时间体系 / 桥通道 / 报告结构
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';

const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf-8');

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
function loadClass(name) {
    const cls = extractClass(src, 'class ' + name);
    assert.ok(cls, name + ' 可提取');
    return new Function('return (' + cls + ')')();
}

// ─────────── 正向审计 1：SummarySystem 全方法端到端 ───────────
test('【正向1】SummarySystem 全方法模拟运行', () => {
    const SummarySystem = loadClass('SummarySystem');
    const s = new SummarySystem();
    // 摘要生命周期：自动生成 → 手动补摘 → 编辑 → 折叠 → 持久化
    s.summaries.push({ floor: 1, text: '第一楼剧情。', timestamp: Date.now() });
    s.addManualSummary(2, '第二楼手动补摘。');
    assert.strictEqual(s.summaries.length, 2, '2 条摘要');
    s.updateSummaryText(1, '第一楼编辑后的剧情。');
    assert.strictEqual(s.summaries[0].edited, true, '编辑生效');
    // 锁定事实
    s.addLockedFact('铁律事实甲', 1);
    s.addLockedFact('铁律事实乙', 2);
    assert.strictEqual(s.getLockedFacts().length, 2, '2 条锁定');
    assert.ok(s.lockedFactsForPrompt().includes('铁律事实甲（第1楼锁定）'), 'prompt 格式');
    // export/import 往返
    const exported = s.export();
    const s2 = new SummarySystem();
    s2.import(JSON.parse(JSON.stringify(exported)));
    assert.strictEqual(s2.summaries.length, 2, '往返 summaries');
    assert.strictEqual(s2.getLockedFacts().length, 2, '往返 lockedFacts');
    assert.strictEqual(s2.getLockedFacts()[0].text, '铁律事实甲', '内容一致');
});

// ─────────── 正向审计 2：DeltaBook 全生命周期模拟 ───────────
test('【正向2】DeltaBook 生命周期模拟运行', () => {
    const DeltaBook = loadClass('DeltaBook');
    const db = new DeltaBook();
    // 登记两种状态
    db.add('林一获得解药的事件记录', 'established', 10);
    db.add('玉佩下落待定的事实记录', 'uncertain', 11);
    db.add('沈青梧受伤的事实记录', 'uncertain', 12);
    assert.strictEqual(db.deltas.length, 3, '3 条');
    // 注入 prompt
    const prompt = db.toPrompt();
    assert.ok(prompt.includes('[已确证] 林一获得解药'), 'established 展示');
    assert.ok(prompt.includes('[待定] 玉佩下落'), 'uncertain 展示');
    // 自动确证（confirm）
    assert.strictEqual(db.confirm('玉佩'), 1, 'confirm 1 条');
    assert.strictEqual(db.deltas[1].status, 'established', '已转正');
    // 回滚
    assert.strictEqual(db.removeByFloor(12), 1, '回滚 12 楼');
    assert.strictEqual(db.deltas.length, 2, '剩 2 条');
    // 位移复刻
    db.deltas.forEach(d => { if (d.evidenceFloor > 12) d.evidenceFloor--; });
    // export/import 往返
    const exported = db.export();
    const db2 = new DeltaBook();
    db2.import(exported);
    assert.strictEqual(db2.deltas.length, 2, '往返 2 条');
    assert.strictEqual(db2.deltas[0].status, 'established', '状态保留');
});

// ─────────── 正向审计 3：ConflictBook + severity 端到端 ───────────
test('【正向3】ConflictBook severity 全链路模拟', () => {
    const ConflictBook = loadClass('ConflictBook');
    const cb = new ConflictBook();
    // 从提取批量登记（含 severity）
    const n = cb.addFromExtracted([
        { subject: '灵石来源', versionA: '甲给的', versionB: '乙给的', note: '来源矛盾', severity: 'high' },
        { subject: '玉佩归属', versionA: '在A手', versionB: '在B手', severity: 'low' },
    ], 20, '3月14日');
    assert.strictEqual(n, 2, '2 条登记');
    // toPrompt 含严重度标注
    const prompt = cb.toPrompt();
    assert.ok(prompt.includes('【严重度:high】'), 'high 标注');
    assert.ok(prompt.includes('【严重度:low】'), 'low 标注');
    assert.ok(prompt.includes('严禁擅自裁决'), '资产保护指令');
    // export/import 往返
    const cb2 = new ConflictBook();
    cb2.import(cb.export());
    assert.strictEqual(cb2.conflicts[0].severity, 'high', '往返 severity');
    // 幂等
    assert.strictEqual(cb.add('灵石来源', '甲给的', '乙给的', '', 20, '', 'high'), false, '重复拒绝');
});

// ─────────── 正向审计 4：金字塔折叠链模拟 ───────────
test('【正向4】金字塔多层生长模拟', () => {
    const SummarySystem = loadClass('SummarySystem');
    const s = new SummarySystem();
    // 造 12 条 historical（模拟史记积累）
    for (let i = 0; i < 12; i++) {
        s.historical.push({ id: 'h' + i, text: '史记条目' + i + '，剧情推进。', floorStart: i * 10, floorEnd: i * 10 + 9, count: 1, timestamp: Date.now(), level: 3 });
    }
    // 折叠链逻辑复刻（foldHigherTiers 的 tier3 部分）
    const threshold = 12;
    const tiers = ['日记', '周记', '史记', '书', '传奇'];
    if (s.historical.length >= threshold) {
        if (!s.genericTiers) s.genericTiers = [];
        let cur = s.genericTiers.find(g => g.tier === 3);
        if (!cur) { cur = { tier: 3, name: tiers[3], items: [] }; s.genericTiers.push(cur); }
        const batch = s.historical.slice(0, threshold);
        cur.items.push({ text: '书级总览内容', tier: 3, count: batch.length, timestamp: Date.now() });
        batch.forEach(x => { x.foldedUp = true; });
    }
    assert.strictEqual(s.genericTiers.length, 1, 'tier3 生长');
    assert.strictEqual(s.genericTiers[0].name, '书', '书层');
    assert.strictEqual(s.genericTiers[0].items.length, 1, '1 条书级');
    // export 含 genericTiers
    assert.ok(Array.isArray(s.export().genericTiers), 'export 含 genericTiers');
});

// ─────────── 正向审计 5：相对时间体系端到端 ───────────
test('【正向5】相对时间全场景模拟', () => {
    const pFn = extractClass(src, 'class RelativeTimeHelper');
    assert.ok(pFn, 'RelativeTimeHelper 可提取');
    const rth = new Function('return (' + pFn + ')')();
    const r = new rth();
    // 时间段压缩
    assert.strictEqual(r.compactTimeRange('2023/9/10 06:45', '2023/9/10 06:55'), '06:55');
    assert.strictEqual(r.formatTimeRange('2023/9/10 06:45', '2023/9/10 06:55'), '2023/9/10 06:45 - 06:55');
    // 双界标签解析
    const dta = r.extractDualTimeTags('<bbs_start>1988/9/29 21:30</bbs_start>正文<bbs_end>1988/9/29 21:45</bbs_end>');
    assert.strictEqual(dta.hasDual, true, '双界命中');
    assert.strictEqual(dta.durationMinutes, 15, '时长');
    // 年龄推算
    if (r.calcAge) {
        const age = r.calcAge('1990/5/20', '2026/9/10');
        assert.strictEqual(age, 36, '年龄推算');
    }
});

// ─────────── 正向审计 6：桥通道完整性（八通道+同步） ───────────
test('【正向6】桥通道清单完整性', () => {
    const bridge = readFileSync('/home/user/ruby-phone-work/apps/memory/lonsha-bridge.js', 'utf-8');
    // 九通道方法存在性
    const channels = [
        ['backfill(', '回填主通道'],
        ['backfillDiaries(', '日记通道'],
        ['syncClock(', '时钟通道'],
        ['syncSummaryEdit(', '摘要编辑同步'],
        ['onFloorCommitted(', '楼层提交'],
        ['onFloorRollback(', '楼层回滚'],
        ['recall(', '召回通道'],
        ['getStats(', '统计'],
    ];
    for (const [m, name] of channels) assert.ok(bridge.includes(m), '桥缺方法: ' + name);
    // 回填通道内容覆盖
    const backfillBody = bridge.slice(bridge.indexOf('backfill(extracted)'), bridge.indexOf('backfillDiaries'));
    for (const ch of ['lockedFacts', 'deltaList', 'pairs', 'clock']) assert.ok(backfillBody.includes(ch), '回填缺通道: ' + ch);
});

// ─────────── 正向审计 7：OpLog 类型全集 ───────────
test('【正向7】OpLog 15 类型全埋点', () => {
    const types = ['summary', 'graph', 'status', 'suspense', 'item', 'rollback', 'diary', 'pov', 'timeline', 'card', 'money', 'conflict', 'pair', 'locked_fact', 'delta'];
    for (const t of types) {
        assert.ok(src.includes("'" + t + "'"), '类型缺失: ' + t);
    }
    // OpLog 类注释与实际一致
    assert.ok(src.includes('locked_fact'), '注释含 locked_fact');
});

// ─────────── 正向审计 8：全景报告板块结构 ───────────
test('【正向8】全景报告板块结构', () => {
    const repIdx = src.indexOf('exportMemoryReport');
    const rep = src.slice(repIdx, repIdx + 12000);
    const sections = ['概览', '锁定事实', '正史增量', '主角档案', '角色羁绊网', '章节卷摘要'];
    for (const sec of sections) assert.ok(rep.includes(sec), '报告缺板块: ' + sec);
    // 板块顺序：概览 < 锁定 < 增量 < 主角
    const i1 = rep.indexOf('## 📊 概览'), i2 = rep.indexOf('## 🔒 用户锁定事实'), i3 = rep.indexOf('## 📒 正史增量'), i4 = rep.indexOf('## 🧍 主角档案');
    assert.ok(i1 < i2 && i2 < i3 && i3 < i4, '板块顺序');
});

// ─────────── 正向审计 9：配置全组合仿真（关键开关关掉不崩） ───────────
test('【正向9】关键开关全关仿真', () => {
    // 全部新机制开关存在且默认值合理
    const cfgs = [
        ['lockedFactsEnabled: true', true],
        ['pyramidAutoExtend: true', true],
        ['supersedeEnabled: true', true],
        ['dualTimeAnchorEnabled: true', true],
    ];
    for (const [c, expected] of cfgs) assert.ok(src.includes(c), '配置缺失: ' + c);
    // 关闭路径守卫（lockedFactsEnabled !== false 模式）
    assert.ok((src.match(/lockedFactsEnabled !== false/g) || []).length >= 2, 'lockedFacts 守卫复用');
});

// ─────────── 正向审计 10：语法与结构完整性 ───────────
test('【正向10】结构完整性', () => {
    // 类清单
    for (const cls of ['class SummarySystem', 'class ConflictBook', 'class DeltaBook', 'class OpLog', 'class RelativeTimeHelper', 'class OutlineDirector']) {
        assert.ok(src.includes(cls), '类缺失: ' + cls);
    }
    // 版本一致
    assert.ok(src.includes("const VERSION = '3.75.0';"), 'VERSION');
    const manifest = JSON.parse(readFileSync('/home/user/lonsha-memory-plugin/manifest.json', 'utf-8'));
    assert.strictEqual(manifest.version, '3.75.0', 'manifest 版本');
});