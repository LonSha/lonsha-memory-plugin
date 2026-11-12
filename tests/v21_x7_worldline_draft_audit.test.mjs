// tests/v21_x7_worldline_draft_audit.test.mjs — L21-X7 世界线草稿保存前语义自检 [v3.465.9]
// 九条判定 + 负控制（五档合一 ⇒ 红）+ 接线真消费。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const _mod = await import('../worldline-draft-audit.js');
const lib = (_mod.default ?? _mod);

function rep(audit, name) {
    const r = audit.reports.find(x => x.check === name);
    assert.ok(r, '档 ' + name + ' 必须存在');
    return r;
}

test('T1 五档全部独立输出，无总布尔', () => {
    const a = lib.auditDraft([]);
    assert.equal(a.reports.length, 5);
    for (const r of a.reports) {
        assert.ok(typeof r.ok === 'boolean' && Array.isArray(r.findings), '每档独立 ok/findings');
    }
    assert.ok(!('ok' in a) && !('hasError' in a), '顶层不得合成总布尔');
});

test('T2 楼层回退：第3跳 40 < 第2跳 47 ⇒ 精确指出', () => {
    const a = lib.auditDraft([
        { floor: 10, lineId: 'A', why: '起跳' },
        { floor: 47, lineId: 'A', why: '上行' },
        { floor: 40, lineId: 'A', why: '回跳' }
    ]);
    const r = rep(a, 'floorOrder');
    assert.equal(r.ok, false);
    assert.equal(r.findings.length, 1);
    assert.ok(r.findings[0].message.includes('第 3 跳楼层 40 < 第 2 跳 47'), '验收旅程原文：' + r.findings[0].message);
    assert.equal(r.findings[0].line, 3, '可点跳到该行');
});

test('T3 纪元编号冲突：同编号被两条线占用', () => {
    const a = lib.auditDraft([
        { floor: 10, lineId: 'A', divergence: 5, why: 'x' },
        { floor: 20, lineId: 'B', divergence: 5, why: 'x' }
    ]);
    const r = rep(a, 'epochConflict');
    assert.equal(r.ok, false);
    assert.ok(r.findings[0].message.includes('5') && r.findings[0].message.includes('A') && r.findings[0].message.includes('B'));
});

test('T4 前史缺口：首跳楼层 > 1 ⇒ 报缺口范围', () => {
    const a = lib.auditDraft([{ floor: 8, lineId: 'A', why: 'x' }]);
    const r = rep(a, 'prehistoryGap');
    assert.equal(r.ok, false);
    assert.ok(r.findings[0].message.includes('7 层无任何锚'));
    // 首跳在第 1 层则无缺口
    const b = lib.auditDraft([{ floor: 1, lineId: 'A', why: 'x' }]);
    assert.equal(rep(b, 'prehistoryGap').ok, true);
});

test('T5 why 为空：逐跳报', () => {
    const a = lib.auditDraft([
        { floor: 5, lineId: 'A', why: '' },
        { floor: 9, lineId: 'A', why: '回头拿伞' }
    ]);
    const r = rep(a, 'whyEmpty');
    assert.equal(r.ok, false);
    assert.equal(r.findings.length, 1);
    assert.ok(r.findings[0].message.includes('第 1 跳'));
});

test('T6 楼层重复：同层两跳 ⇒ 报', () => {
    const a = lib.auditDraft([
        { floor: 12, lineId: 'A', why: 'x' },
        { floor: 12, lineId: 'A', why: 'y' }
    ]);
    const r = rep(a, 'duplicateFloor');
    assert.equal(r.ok, false);
    assert.ok(r.findings[0].message.includes('重复'));
});

test('T7 干净草稿：五档全绿', () => {
    const a = lib.auditDraft([
        { floor: 1, lineId: 'A', why: '起跳' },
        { floor: 3, lineId: 'A', divergence: 2, why: '推进' }
    ]);
    for (const r of a.reports) assert.equal(r.ok, true, r.check + ' 应绿');
    assert.equal(a.findingsFlat.length, 0);
});

test('T8 负控制：五档合一 ⇒ 红（结构级：拆掉任一档或合成总布尔都翻红）', () => {
    const src = readFileSync(new URL('../worldline-draft-audit.js', import.meta.url), 'utf8');
    // ① 五档名必须逐一独立出现（合成一个 check 名即翻红）
    for (const name of ['floorOrder', 'epochConflict', 'prehistoryGap', 'whyEmpty', 'duplicateFloor']) {
        assert.ok(src.includes("check: '" + name + "'"), '档 ' + name + ' 必须独立成档');
    }
    // ② 顶层不得导出 hasError/allOk/ok 之类总布尔
    assert.ok(!/return\s*{[^}]*\b(hasError|allOk|passed)\b/.test(src), '不得合成总布尔导出');
});

test('T9 接线真消费：worldlineJumpDraft 真调 auditDraft 且不合成总布尔', () => {
    const src = readFileSync(new URL('../engine-diagnostic-lines.js', import.meta.url), 'utf8');
    const iFn = src.indexOf('function worldlineJumpDraft');
    const iEnd = src.indexOf('function _worldlineState');
    assert.ok(iFn > 0 && iEnd > iFn);
    const seg = src.slice(iFn, iEnd);
    assert.ok(seg.includes('auditDraft'), '必须真调用 auditDraft');
    assert.ok(seg.includes('audit: audit'), '判定必须挂 audit 读面字段');
    assert.ok(!seg.includes('ok: parsed.rejects.length === 0 && audit'), '不得把审计并进旧 ok 总布尔');
});

test('T10 面板读面：每档一行、红了带行号', () => {
    const a = lib.auditDraft([
        { floor: 30, lineId: 'A', why: 'x' },
        { floor: 20, lineId: 'A', why: 'y' }
    ]);
    const panel = lib.formatPanel(a);
    assert.ok(panel.includes('✔ 保存前自检'));
    assert.ok(panel.includes('❌ floorOrder（第 2 行）'));
    assert.ok(panel.includes('✅ epochConflict'));
});