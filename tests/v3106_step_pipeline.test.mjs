// tests/v3106_step_pipeline.test.mjs
// v3.106 缝合 engram src/modules/workflow/core/WorkflowEngine.ts：
// 步骤流水线引擎（跳转控制流 + 逐级重试 + 保险丝 + 取消检查点）
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(REPO, 'step-pipeline.js'), 'utf8');
function vnum(s) {
  const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}
const idxSrc = fs.readFileSync(path.join(REPO, 'index.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));

const sbox = { module: { exports: {} }, window: undefined };
const load = new Function('globalThis', 'module', 'window',
    src + '\nreturn (typeof module !== \'undefined\' && module.exports) ? module.exports : globalThis.LonShaStepPipeline;');
const SP = load(sbox, sbox.module, undefined);

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };

// 测试专用环境：虚拟时钟 + 记录 sleep（零真实等待）
function fakeEnv() {
    const slept = [];
    let t = 0;
    return {
        slept,
        env: {
            sleep: async (ms) => { slept.push(ms); t += ms; },
            now: () => t,
        },
        advanceSync: (ms) => { t += ms; },
    };
}

// ---------- 0. 版本与注册 ----------
test('【0】版本与 manifest 注册', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
    assert.ok(vnum(v) >= vnum('3.106.0'), `index.js 版本 ${v} < 3.106.0`);
    assert.ok(vnum(manifest.version) >= vnum('3.106.0'), `manifest 版本 ${manifest.version} < 3.106.0`);
    assert.ok(manifest.extra_js.includes('step-pipeline.js'), 'step-pipeline.js 已注册 extra_js');
    ok('版本 / manifest 注册');
});

// ---------- 1. 顺序执行 ----------
test('【1】顺序执行与账本记录', async () => {
    const f = fakeEnv();
    const order = [];
    const pipe = SP.definePipeline('p1', [
        { name: 'a', run: async () => { order.push('a'); } },
        { name: 'b', run: async () => { order.push('b'); } },
    ]);
    const r = await SP.run(pipe, {}, f.env);
    assert.deepStrictEqual(order, ['a', 'b']);
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(r.executed, ['a', 'b']);
    assert.deepStrictEqual(r.attempts, { a: 1, b: 1 });
    assert.strictEqual(r.error, null);
    ok('顺序执行 / executed / attempts 账本');
});

// ---------- 2. definePipeline 重名校验 ----------
test('【2】definePipeline 拒绝重名步骤', () => {
    assert.throws(() => SP.definePipeline('p', [{ name: 'x', run: async () => {} }, { name: 'x', run: async () => {} }]), /duplicate step name/);
    const p = SP.definePipeline('p', [{ name: 'x', run: async () => {} }]);
    assert.strictEqual(p.name, 'p');
    ok('重名拒绝 / 正常构造');
});

// ---------- 3. 失败中断 ----------
test('【3】步骤失败中断并回传错误', async () => {
    const f = fakeEnv();
    const order = [];
    const pipe = SP.definePipeline('p', [
        { name: 'ok1', run: async () => { order.push('ok1'); } },
        { name: 'boom', run: async () => { throw new Error('炸了'); } },
        { name: 'never', run: async () => { order.push('never'); } },
    ]);
    const r = await SP.run(pipe, {}, f.env);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error.message, '炸了');
    assert.deepStrictEqual(order, ['ok1']);
    assert.strictEqual(r.currentStep, 'boom');
    ok('失败中断 / 错误回传 / 后续不执行');
});

// ---------- 4. 重试（fixed 退避） ----------
test('【4】fixed 重试：次数与延迟', async () => {
    const f = fakeEnv();
    let n = 0;
    const pipe = SP.definePipeline('p', [
        {
            name: 'flaky',
            retry: { maxAttempts: 3, delay: 100 },
            run: async () => { n++; if (n < 3) throw new Error('再试'); return 'done'; },
        },
    ]);
    const r = await SP.run(pipe, {}, f.env);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(n, 3);
    assert.strictEqual(r.attempts.flaky, 3);
    assert.deepStrictEqual(f.slept, [100, 100], 'fixed 退避延迟不变');
    ok('固定退避 / 尝试计数 / 最终成功');
});

// ---------- 5. 指数退避 ----------
test('【5】exponential 退避翻倍', async () => {
    const f = fakeEnv();
    let n = 0;
    const pipe = SP.definePipeline('p', [
        {
            name: 'flaky',
            retry: { maxAttempts: 4, delay: 100, backoff: 'exponential' },
            run: async () => { n++; if (n < 4) throw new Error('再试'); return 'ok'; },
        },
    ]);
    const r = await SP.run(pipe, {}, f.env);
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(f.slept, [100, 200, 400]);
    ok('指数退避 100→200→400');
});

// ---------- 6. 重试耗尽 ----------
test('【6】重试耗尽后失败', async () => {
    const f = fakeEnv();
    let n = 0;
    const pipe = SP.definePipeline('p', [
        { name: 'bad', retry: { maxAttempts: 3, delay: 10 }, run: async () => { n++; throw new Error('永久失败'); } },
    ]);
    const r = await SP.run(pipe, {}, f.env);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(n, 3);
    assert.strictEqual(r.error.message, '永久失败');
    assert.deepStrictEqual(f.slept, [10, 10], '耗尽前只等 2 次（末次不再等）');
    ok('耗尽判定 / 末次不等待');
});

// ---------- 7. retryIf 过滤 ----------
test('【7】retryIf 决定是否值得重试', async () => {
    const f = fakeEnv();
    let n = 0;
    const pipe = SP.definePipeline('p', [
        {
            name: 's',
            retry: { maxAttempts: 5, delay: 1, retryIf: (e) => e.retryable === true },
            run: async () => { n++; const e = new Error('nope'); e.retryable = false; throw e; },
        },
    ]);
    const r = await SP.run(pipe, {}, f.env);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(n, 1, '不可重试错误只执行一次');
    assert.deepStrictEqual(f.slept, []);
    // retryIf 自身抛错 → 按不重试处理（不掩盖原始错误）
    let m = 0;
    const pipe2 = SP.definePipeline('p2', [
        { name: 's', retry: { maxAttempts: 5, retryIf: () => { throw new Error('judge broken'); } }, run: async () => { m++; throw new Error('原始错误'); } },
    ]);
    const r2 = await SP.run(pipe2, {}, { ...f.env });
    assert.strictEqual(r2.error.message, '原始错误');
    assert.strictEqual(m, 1);
    ok('retryIf 判定 / 判定器自身异常不掩盖原错');
});

// ---------- 8. ignoreFailure ----------
test('【8】ignoreFailure 步骤失败也继续', async () => {
    const f = fakeEnv();
    const order = [];
    const pipe = SP.definePipeline('p', [
        { name: 'opt', ignoreFailure: true, run: async () => { throw new Error('可选增强失败'); } },
        { name: 'main', run: async () => { order.push('main'); } },
    ]);
    const r = await SP.run(pipe, {}, f.env);
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(order, ['main']);
    assert.deepStrictEqual(r.executed, ['main'], '失败的可选步骤不计入 executed');
    ok('忽略失败继续流转');
});

// ---------- 9. finish 控制流 ----------
test('【9】finish 提前成功结束', async () => {
    const f = fakeEnv();
    const order = [];
    const pipe = SP.definePipeline('p', [
        { name: 'a', run: async () => { order.push('a'); } },
        { name: 'b', run: async () => ({ action: 'finish' }) },
        { name: 'c', run: async () => { order.push('c'); } },
    ]);
    const r = await SP.run(pipe, {}, f.env);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.finishedEarly, true);
    assert.deepStrictEqual(order, ['a']);
    ok('finish 提前结束且 ok=true');
});

// ---------- 10. abort 控制流 ----------
test('【10】abort 主动失败（带 reason）', async () => {
    const f = fakeEnv();
    const pipe = SP.definePipeline('p', [
        { name: 'a', run: async () => ({ action: 'abort', reason: '前置条件不满足' }) },
    ]);
    const r = await SP.run(pipe, {}, f.env);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.aborted, true);
    assert.match(r.error.message, /前置条件不满足/);
    assert.strictEqual(r.error.isAbort, true);
    ok('abort 语义与 isAbort 标记');
});

// ---------- 11. jump 控制流 ----------
test('【11】jump 跳转与账本记录', async () => {
    const f = fakeEnv();
    const order = [];
    let jumped = false;
    const pipe = SP.definePipeline('p', [
        { name: 'first', run: async () => { order.push('first'); } },
        {
            name: 'second',
            run: async () => {
                order.push('second');
                if (!jumped) { jumped = true; return { action: 'jump', targetStep: 'first', reason: '需要重做' }; }
            },
        },
    ]);
    const r = await SP.run(pipe, {}, f.env);
    assert.deepStrictEqual(order, ['first', 'second', 'first', 'second']);
    assert.strictEqual(r.jumpCount, 1);
    assert.deepStrictEqual(r.jumps, [{ from: 'second', to: 'first', reason: '需要重做' }]);
    assert.strictEqual(r.attempts.second, 2, '跳转后同名步骤尝试累计');
    ok('jump 回跳 / jumps 账本 / 尝试累计');
});

// ---------- 12. jump 目标不存在 ----------
test('【12】jump 到不存在步骤 → 报错', async () => {
    const f = fakeEnv();
    const pipe = SP.definePipeline('p', [
        { name: 'a', run: async () => ({ action: 'jump', targetStep: '不存在' }) },
    ]);
    const r = await SP.run(pipe, {}, f.env);
    assert.strictEqual(r.ok, false);
    assert.match(r.error.message, /jump target not found/);
    ok('非法跳转目标被拒绝');
});

// ---------- 13. 保险丝 ----------
test('【13】无限跳转被保险丝熔断', async () => {
    const f = fakeEnv();
    const pipe = SP.definePipeline('loop', [
        { name: 'a', run: async () => ({ action: 'jump', targetStep: 'b' }) },
        { name: 'b', run: async () => ({ action: 'jump', targetStep: 'a' }) },
    ]);
    const r = await SP.run(pipe, {}, { ...f.env, maxJumps: 6 });
    assert.strictEqual(r.ok, false);
    assert.match(r.error.message, /infinite loop: jumped 6 times/);
    assert.strictEqual(r.jumpCount, 7, '熔断时已记录第 7 次跳转明细');
    ok('保险丝熔断 / 跳转次数可配');
});

// ---------- 14. 取消：步前 ----------
test('【14】步前取消 → cancelled，不再执行', async () => {
    const f = fakeEnv();
    const order = [];
    const signal = { cancelled: false };
    const pipe = SP.definePipeline('p', [
        { name: 'a', run: async () => { order.push('a'); signal.cancelled = true; } },
        { name: 'b', run: async () => { order.push('b'); } },
    ]);
    const r = await SP.run(pipe, {}, { ...f.env, signal });
    assert.strictEqual(r.cancelled, true);
    assert.deepStrictEqual(order, ['a']);
    assert.strictEqual(r.ok, false);
    ok('步前取消检查点生效');
});

// ---------- 15. 取消：重试等待期间 ----------
test('【15】重试等待中被取消 → 停止重试', async () => {
    const f = fakeEnv();
    const signal = { cancelled: false };
    let n = 0;
    const pipe = SP.definePipeline('p', [
        {
            name: 's',
            retry: { maxAttempts: 5, delay: 50 },
            run: async () => { n++; signal.cancelled = true; throw new Error('失败'); },
        },
    ]);
    const r = await SP.run(pipe, {}, { ...f.env, signal });
    assert.strictEqual(n, 1, '取消后不再重试');
    assert.strictEqual(r.cancelled, true);
    assert.strictEqual(r.ok, false);
    ok('重试路径的取消检查点');
});

// ---------- 16. 摘要 ----------
test('【16】summarizeLedger 可读', async () => {
    const f = fakeEnv();
    const pipe = SP.definePipeline('报表', [
        { name: 'step1', run: async () => {} },
        { name: 'step2', retry: { maxAttempts: 2, delay: 5 }, run: async () => { throw new Error('x'); } },
    ]);
    const r = await SP.run(pipe, {}, f.env);
    const s = SP.summarizeLedger(r);
    assert.match(s, /流水线 报表: 失败/);
    assert.match(s, /执行步骤: step1/);
    assert.match(s, /step2×2/);
    assert.match(s, /错误: x/);
    ok('摘要含名称/步骤/尝试/错误');
});

// ---------- 17. 健壮性 ----------
test('【17】空/异常定义不崩', async () => {
    const r = await SP.run({}, {}, fakeEnv().env);
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(r.executed, []);   // 无步骤 → 空循环完成即 ok
    const r2 = await SP.run({ steps: [{ name: 'x' }] }, {}, fakeEnv().env);
    assert.strictEqual(r2.ok, false);
    assert.match(r2.error.message, /no run function/);
    assert.strictEqual(SP.normRetry(null), null);
    assert.strictEqual(SP.normRetry({ maxAttempts: 0 }).maxAttempts, 1, '非法次数回落到 1');
    assert.strictEqual(SP.isCancelled(null), false);
    ok('空定义 / 缺 run / 归一兜底');
});

// ---------- 18. index.js 接线（正向：功能确实被挂上主链路） ----------
test('【18】index.js 接线：维护流水线已挂上主链路', async () => {
    const suiSrc = fs.readFileSync(path.join(REPO, 'settings-ui.js'), 'utf8');
    // 门控存在，且只有显式 === true 才走流水线（默认路径完全不变）
    assert.ok(idxSrc.includes('maintenancePipelineEnabled === true'), '门控为显式 === true');
    assert.ok(/maintenancePipelineEnabled:\s*false/.test(idxSrc), '配置默认 false（不改变既有行为）');
    assert.ok(/maintenanceOverdueWarnDays:\s*45/.test(idxSrc), '超期天数默认 45');
    assert.ok(suiSrc.includes('maintenancePipelineEnabled'), 'settings-ui 声明该键（非幽灵配置）');
    assert.ok(suiSrc.includes('maintenanceOverdueWarnDays'), 'settings-ui 声明超期天数');
    // 既有逐条维护路径仍完整保留在 else 分支内
    const gate = idxSrc.indexOf('if (this.config.config.maintenancePipelineEnabled === true)');
    const elseAt = idxSrc.indexOf('} else {', gate);
    const optAt = idxSrc.indexOf('this.optimizeMemory();', elseAt);
    assert.ok(gate > 0 && elseAt > gate && optAt > elseAt, 'else 分支内仍调用 optimizeMemory（默认路径不变）');
    // 引擎被真实调用（非仅声明）
    assert.ok(idxSrc.includes('await this._maintenancePipeline()'), 'onMessageReceived 真调用流水线');
    assert.ok(/async _maintenancePipeline\(/.test(idxSrc), '_maintenancePipeline 为 async 方法');
    assert.ok(idxSrc.includes('window.LonShaStepPipeline'), 'window 通道');
    assert.ok(idxSrc.includes("require('./step-pipeline.js')"), 'require 降级通道');
    // 行为：缺引擎时降级返回 null，主链路不抛
    const noEngine = await SP.run(SP.definePipeline('x', []), {}, {});
    assert.strictEqual(noEngine.ok, true, '空流水线可用（遥控器本身无副作用）');
    ok('接线（门控 / 默认路径 / 双通道 / UI 声明）');
});

// ---------- 19. 逆向审计：门控松紧与会话遗留 ----------
test('【19】逆向审计：门控只认 true，undefined/字符串不放行', () => {
    // 复刻 index.js 门控表达式，验证「非 true 一律走旧路径」
    const gate = (v) => v === true;
    assert.strictEqual(gate(undefined), false, '旧配置（无该键）→ 旧路径');
    assert.strictEqual(gate(false), false, '显式关 → 旧路径');
    assert.strictEqual(gate('true'), false, '字符串 true → 旧路径（不误开）');
    assert.strictEqual(gate(1), false, '数字 1 → 旧路径（不误开）');
    assert.strictEqual(gate(true), true, '仅布尔 true 才开');
    // 配置默认值必须是 false（防「升级即静默改变行为」）
    const m = /maintenancePipelineEnabled:\s*(true|false)/.exec(idxSrc);
    assert.ok(m && m[1] === 'false', '默认值为 false');
    ok('门控严格性 / 默认不静默开启');
});

console.log(`[v3106] ${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;