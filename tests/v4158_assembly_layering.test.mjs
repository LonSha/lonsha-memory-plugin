// [v4.158.0 · R24-O3] 加载期性能：装配分层与冷启动预算
// 验收口径（原文）：装载耗时相对基线下降（给实测值）；惰性 vs 急加载返回值对拍零差异；
// 「只打开设置页」时引擎核心未被实例化（读数证明，不是字符串断言）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const A = require(join(ROOT, 'assembly-layering.js'));

test('O3-1 注册期不实例化：48 个依赖注册完，一个都没造出来', () => {
    const specs = A.makeSpecs(48);
    const reg = A.createRegistry();
    specs.forEach((s) => reg.__register(s.name, s.factory));
    const r = reg.__readings();
    assert.equal(r.registered, 48);
    assert.equal(r.materializedCount, 0, '注册不该造对象');
    assert.deepEqual(r.materialized, []);
});

test('O3-2 只打开设置页 ⇒ 只拉起 settings，引擎核心未被实例化（读数证明）', () => {
    const specs = A.makeSpecs(48);
    const r = A.coldStart(specs, { touch: ['settings'] });
    assert.equal(r.materializedCount, 1, JSON.stringify(r));
    assert.deepEqual(r.touched, ['settings']);
    assert.deepEqual(r.unusedInstantiated, [], '拉起了没用的模块');
    assert.ok(!r.touched.includes('memoryCore'));
});

test('O3-3 惰性 vs 急加载：返回值逐字段一致', () => {
    const p = A.parityCheck(A.makeSpecs(48));
    assert.equal(p.ok, true, p.bad.join(','));
    assert.equal(p.compared, 48);
});

test('O3-4 重复访问同一模块只实例化一次（缓存真的在）', () => {
    let built = 0;
    const reg = A.createRegistry();
    reg.__register('x', () => { built += 1; return { v: built }; });
    const a = reg.x;
    const b = reg.x;
    assert.equal(built, 1);
    assert.equal(a, b);
});

test('O3-5 老宿主（无 Proxy）路径等价：取值与急加载一致', () => {
    const specs = A.makeSpecs(20);
    const r = A.coldStart(specs, { touch: ['settings'], noProxy: true });
    assert.equal(r.path, 'defineProperty');
    assert.equal(r.materializedCount, 1);
    const reg = A.createRegistry({ noProxy: true });
    specs.forEach((s) => reg.__register(s.name, s.factory));
    reg.__seal();
    const eager = A.createEager(specs).api;
    specs.forEach((s) => {
        assert.equal(JSON.stringify(reg[s.name]), JSON.stringify(eager[s.name]), s.name);
    });
});

test('O3-6 冷启动三项读数齐：装载 / 实例化 / 首条可用', () => {
    const r = A.coldStart(A.makeSpecs(48), { touch: ['settings'] });
    assert.equal(typeof r.registerMs, 'number');
    assert.equal(typeof r.instantiateMs, 'number');
    assert.equal(typeof r.firstReadyMs, 'number');
    assert.ok(r.registerMs >= 0 && r.instantiateMs >= 0 && r.firstReadyMs >= 0);
});

test('O3-7 分层真的省：装载期耗时远小于全员急加载', () => {
    const specs = A.makeSpecs(48);
    const lazy = A.coldStart(specs, { touch: ['settings'] });
    const eager = A.createEager(specs);
    assert.ok(lazy.registerMs + lazy.instantiateMs < eager.ms, `lazy=${lazy.registerMs}+${lazy.instantiateMs} eager=${eager.ms}`);
});

test('O3-8 读不存在的模块名：返回 undefined，不许抛（老代码到处这么探路）', () => {
    const reg = A.createRegistry();
    reg.__register('x', () => ({ v: 1 }));
    assert.equal(reg.notThere, undefined);
});

test('O3-9 登记非法描述符必须拦（name / factory）', () => {
    const reg = A.createRegistry();
    assert.throws(() => reg.__register('', () => 1));
    assert.throws(() => reg.__register('y', null));
});

test('O3-10 接线：manifest.extra_js + registry + index.js 真消费点', () => {
    const mf = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok((mf.extra_js || []).includes('assembly-layering.js'));
    const rg = readFileSync(join(ROOT, 'optional-engine-registry.js'), 'utf8');
    assert.ok(rg.includes("'LonShaAssemblyLayering', 'assembly-layering.js'"));
    const idx = readFileSync(join(ROOT, 'index.js'), 'utf8');
    assert.ok(idx.includes('optEngines.LonShaAssemblyLayering'));
    assert.ok(idx.includes("typeof api.createRegistry === 'function'"));
});

test('O3-11 自检绿（模块自带读数）', () => {
    const s = A.assemblySelfCheck();
    assert.equal(s.ok, true, JSON.stringify(s.bad));
    assert.match(s.sample, /lazy=1\/48/);
});

test('O3-12 经典脚本形态：无 module 时挂 global.LonShaAssemblyLayering', () => {
    const src = readFileSync(join(ROOT, 'assembly-layering.js'), 'utf8');
    assert.ok(src.includes('root.LonShaAssemblyLayering = api;'));
    assert.ok(!/^export /m.test(src));
});
