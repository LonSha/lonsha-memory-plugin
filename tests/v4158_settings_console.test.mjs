// [v4.158.0 · R24-O6] 设置面：从表单堆到可理解的控制台
// 验收口径：登记条数 = 控件数（差异逐条列出）；impact 同配置可复算；偏离可见；分组回默认。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const C = require(join(ROOT, 'settings-console.js'));

test('O6-1 五项分组齐，且每组都有项（用户任务分组）', () => {
    assert.deepEqual(C.GROUPS, ['memory', 'recall', 'inject', 'privacy', 'advanced']);
    C.GROUPS.forEach((g) => assert.ok(C.itemsOfGroup(g).length > 0, g));
    assert.ok(C.REGISTRY.length >= 10);
});

test('O6-2 每项四要素齐：id / group / label / default / effect / impact', () => {
    C.REGISTRY.forEach((it) => {
        assert.ok(it.id && it.group && it.label, JSON.stringify(it));
        assert.ok(it.effect && it.effect.length > 2, it.id);
        assert.equal(typeof it.impact, 'function', it.id);
        assert.ok(it.def !== undefined);
    });
});

test('O6-3 默认配置下：0 项偏离，且每项都给出读数文案', () => {
    const v = C.view(C.defaults());
    assert.equal(v.deviatedCount, 0);
    v.rows.forEach((r) => assert.ok(r.impact && r.impact.length > 2, r.id));
});

test('O6-4 改一项只标一项偏离（一眼看出改过什么）', () => {
    const v = C.view(Object.assign({}, C.defaults(), { 'recall.topK': 9 }));
    assert.equal(v.deviatedCount, 1);
    assert.equal(v.rows.find((r) => r.id === 'recall.topK').deviated, true);
});

test('O6-5 impact 是可复算读数：同配置两次同结果，改配置变读数', () => {
    const a = Object.assign({}, C.defaults(), { 'recall.topK': 9, 'inject.budget': 3 });
    const r1 = C.budgetReading(a);
    const r2 = C.budgetReading(Object.assign({}, a));
    assert.deepEqual(r1, r2);
    assert.equal(r1.injectPerTurn, 3, '取召回条数与预算的小者');
    assert.notEqual(C.budgetReading(C.defaults()).injectPerTurn, r1.injectPerTurn);
});

test('O6-6 分组回默认：只影响该组', () => {
    const v = Object.assign({}, C.defaults(), { 'recall.topK': 9, 'inject.budget': 2 });
    const r = C.resetGroup(v, 'recall');
    const view = C.view(r);
    assert.equal(view.rows.find((x) => x.id === 'recall.topK').deviated, false);
    assert.equal(view.rows.find((x) => x.id === 'inject.budget').deviated, true, '别的组不许被顺手重置');
});

test('O6-7 全局回默认：0 偏离', () => {
    const r = C.view(C.resetAll());
    assert.equal(r.deviatedCount, 0);
});

test('O6-8 审计：登记表 vs 控件，差异逐条列出', () => {
    const ids = C.REGISTRY.map((it) => it.id);
    const same = C.audit(ids);
    assert.equal(same.sameSet, true);
    assert.deepEqual(same.missing, []);
    const short = C.audit(ids.slice(1));
    assert.deepEqual(short.missing, []);
    assert.deepEqual(short.extra, [ids[0]], '少登记的项要被点名');
    const extra = C.audit(ids.concat(['ghost.control']));
    assert.deepEqual(extra.missing, ['ghost.control'], '控件没登记也是债');
});

test('O6-9 接线：manifest.extra_js + registry + index.js 真消费点', () => {
    const mf = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok((mf.extra_js || []).includes('settings-console.js'));
    const rg = readFileSync(join(ROOT, 'optional-engine-registry.js'), 'utf8');
    assert.ok(rg.includes("'LonShaSettingsConsole', 'settings-console.js'"));
    const idx = readFileSync(join(ROOT, 'index.js'), 'utf8');
    assert.ok(idx.includes('this.engine.settingsConsole'));
    assert.ok(idx.includes("typeof api.view === 'function'"));
});

test('O6-10 自检绿（模块自带读数）', () => {
    const s = C.settingsSelfCheck();
    assert.equal(s.ok, true, JSON.stringify(s.bad));
    assert.match(s.sample, /audit=same-set/);
});

test('O6-11 经典脚本形态：无 module 时挂 global.LonShaSettingsConsole', () => {
    const src = readFileSync(join(ROOT, 'settings-console.js'), 'utf8');
    assert.ok(src.includes('root.LonShaSettingsConsole = api;'));
    assert.ok(!/^export /m.test(src));
});
