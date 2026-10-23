/* ============================================================
 * tests/v3366_engine_story_annual_split.test.mjs — v3.366.0
 * 架构重构：故事年度编年史与世界书导入集群（50个方法）剥离至 engine-story-annual.js
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function vnum(s) {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
    if (!m) return 0;
    return parseInt(m[1], 10) * 1000000 + parseInt(m[2], 10) * 1000 + parseInt(m[3], 10);
}

test('v3366 A1. engine-story-annual.js 独立存在且在 manifest 登记', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'engine-story-annual.js')), 'engine-story-annual.js 必须存在');
    const mf = JSON.parse(read('manifest.json'));
    assert.ok(Array.isArray(mf.extra_js), 'manifest.extra_js 必须是数组');
    assert.ok(mf.extra_js.includes('engine-story-annual.js'), 'manifest.extra_js 必须登记 engine-story-annual.js');
    assert.ok(mf.extra_js.length >= 139, 'extra_js 当前总项数应为 139');
});

test('v3366 A2. 编年史与世界书导入委托桩在 index.js 中存在且保持契约', () => {
    const idx = read('index.js');
    const stubs = [
        '_o6RealOwners() {', 'annualSources() {', '_o6Chat() {', '_o6Quotes(floor, opts) {',
        '_o6Chapters(O) {', '_o6Summary(O) {', '_o6Outcomes(O) {', '_o6PastDetails(O) {',
        '_o6KnownFacts(O) {', '_o6ConfirmedFacts(O) {', '_o6KnownEntities() {',
        '_loreImportDeps() {', '_loreImportAbsent(reason) {', 'loreImportParse(raw, opts) {',
        'loreImportParseWindow(raw, opts) {', 'loreImportEntities(parsed, opts) {',
        'loreImportPreview(parsed, target, opts) {', 'loreImportPlan(parsed, preview, opts) {',
        'loreImportChanged(oldParsed, newParsed) {', 'loreImportDescribe() {',
        'loreImportLine() {', '_loreImportOwners() {', '_loreImportLedgerState() {',
        'loreImportOverride(parsed, overrides, opts) {', 'loreImportConfirmMapping(parsed, mapping, opts) {',
        'async loreImportApply(parsed, preview, opts = {}) {', 'loreImportLedger() {',
        '_storyAnnualDeps() {', '_o9Owners() {', '_o9AliasIndex() {', '_o9FactOf(item) {',
        '_o9NamesIn(item) {', '_o9Gate() {', 'o9Sources() {', '_storyAnnualAbsent(reason) {',
        'storyAnnualBuild(payload, opts) {', 'storyAnnualReview(chapterRef, payload, opts) {',
        'storyAnnualTwoVersions(rev, opts) {', 'storyAnnualForPlayer(rev, opts) {',
        'storyAnnualBelletristic(text, opts) {', 'storyAnnualEdit(state, patch) {',
        'storyAnnualStale(oldChapters, newPayload) {', 'storyAnnualCompose(rev, opts) {',
        'storyAnnualComposeForPlayer(rev, opts) {', 'storyAnnualRebuild(drafts, stale, opts) {',
        'storyAnnualApplyEdits(draft, patch) {', 'storyAnnualDrafts(raw, opts) {',
        'storyAnnualComposeLine() {', 'storyAnnualDescribe() {', 'storyAnnualLine() {'
    ];
    for (const s of stubs) {
        assert.ok(idx.includes(s), '委托桩签名必须在场: ' + s);
    }
    assert.ok(idx.includes('engine-story-annual.js'), '委托桩必须引用 engine-story-annual.js');
    assert.ok(idx.includes('LonShaEngineStoryAnnual'), '委托桩必须引用 window.LonShaEngineStoryAnnual');
});

test('v3366 A3. engine-story-annual.js 导出健全且支持 bindDeps', () => {
    const src = read('engine-story-annual.js');
    assert.ok(src.includes('bindDeps: bindDeps'), '导出 bindDeps');
    assert.ok(src.includes('loreImportApply: loreImportApply'), '导出 loreImportApply');
    assert.ok(src.includes('storyAnnualBuild: storyAnnualBuild'), '导出 storyAnnualBuild');
    assert.ok(src.includes('storyAnnualCompose: storyAnnualCompose'), '导出 storyAnnualCompose');
    assert.ok(src.includes('_o6RealOwners: _o6RealOwners'), '导出 _o6RealOwners');
    assert.ok(src.includes('_o9Gate: _o9Gate'), '导出 _o9Gate');
});

test('v3366 A4. 宿主装配接线：_assembleComponents 中注入 SA.bindDeps', () => {
    const idx = read('index.js');
    assert.ok(idx.includes('LonShaEngineStoryAnnual'), '装配中获取 LonShaEngineStoryAnnual');
    assert.ok(idx.includes('SA.bindDeps({'), '装配中必须调用 SA.bindDeps');
});

test('v3366 A5. 六源同源版本锚', () => {
    const BORN_V = '3.366.0';
    assert.equal(vnum(BORN_V), 3366000, '当版数值锚');
});

test('v3366 B1. 模块在 Node 环境下真加载并具备导出形态', () => {
    const mod = require_(path.join(ROOT, 'engine-story-annual.js'));
    assert.ok(mod, '模块可加载');
    assert.equal(typeof mod.bindDeps, 'function', 'bindDeps 必须是函数');
    assert.equal(typeof mod.loreImportApply, 'function', 'loreImportApply 必须是函数');
    assert.equal(typeof mod.loreImportParseWindow, 'function', 'loreImportParseWindow 必须是函数');
    assert.equal(typeof mod.storyAnnualBuild, 'function', 'storyAnnualBuild 必须是函数');
    assert.equal(typeof mod.storyAnnualCompose, 'function', 'storyAnnualCompose 必须是函数');
    assert.equal(typeof mod.storyAnnualForPlayer, 'function', 'storyAnnualForPlayer 必须是函数');
    assert.equal(typeof mod._o6RealOwners, 'function', '_o6RealOwners 必须是函数');
    assert.equal(typeof mod._o9Gate, 'function', '_o9Gate 必须是函数');
    assert.equal(Object.keys(mod).length, 51, '应导出 50 个业务方法 + 1 个 bindDeps');
});

test('v3366 B2. 降级安全回执契约：_loreImportAbsent 与 _storyAnnualAbsent', () => {
    const mod = require_(path.join(ROOT, 'engine-story-annual.js'));
    const dummyEngine = {};
    const la = mod._loreImportAbsent(dummyEngine, 'test-lore-absent');
    assert.equal(la.ok, false);
    assert.equal(la.absent, true);
    assert.equal(la.reason, 'test-lore-absent');

    const sa = mod._storyAnnualAbsent(dummyEngine, 'test-annual-absent');
    assert.equal(sa.ok, false);
    assert.equal(sa.why[0], 'test-annual-absent');
});

test('v3366 B3. 窗口解析缺席降级契约：loreImportParseWindow 在无 LI 时回退', () => {
    const mod = require_(path.join(ROOT, 'engine-story-annual.js'));
    const fakeHost = {
        _loreImportAbsent: (reason) => ({ ok: false, absent: true, reason: reason }),
    };
    const out = mod.loreImportParseWindow(fakeHost, { text: 'abc' }, { range: { from: 10 } });
    assert.equal(out.ok, false);
    assert.equal(out.absent, true);
    assert.equal(out.reason, 'window-unsupported');
    assert.equal(out.completeness.state, 'unknown');
    assert.equal(out.completeness.readChars, 10);
});
