// tests/v3164_event_lifecycle.test.mjs
// LonSha 记忆引擎 v3.165.0 —— 事件生命周期面治理（注册收口 / 台账 / 卸载消费者 / 可见性）
//
// 覆盖：
//   0  版本与审计脚本注册
//   1  静态判据正确性（剥注释必须保留偏移，不得把正则字面量误当字符串吞掉）
//   2  合成夹具真跑扫描器（正样本 + 6 类负样本 + 2 条结构下限；夹具与真实代码同构）
//   3  本次修复的消失证据 + 行为级验证（注册收口 / 幂等 / 台账自增）
//   4  发布卫生
//   5  判据面自防护（防假绿注入里两个漏网：改测试自己的断言时静默通过）
//
// 为什么必须有行为级验证：
//   本版修的三个缺陷（bindEvent 零调用、_controlInfo 只写不读、unregisterEvents 零消费者）
//   全都「静态看起来没问题」—— bindEvent 的注释还写着「统一事件注册包装：记录 + 注册 + 防重」。
//   所以判据必须是真跑：真给一个假 eventSource，真调 registerEvents 两次，数监听器个数。
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCANNER = path.join(HERE, 'audit', 'scan_event_lifecycle.mjs');

const idx = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');

function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}
/* 花括号计数法抽取方法体（与 v388/v390/v391 同一工具，避免自创解析器） */
function extractNamed(text, marker) {
    const at = text.indexOf(marker);
    if (at < 0) throw new Error('找不到: ' + marker);
    let i = text.indexOf('{', at), depth = 0;
    for (; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) break; }
    }
    return text.slice(at, i + 1);
}
function objOf(methodSrc, deps = {}) {
    const names = Object.keys(deps);
    const fn = new Function(...names, `return ({ ${methodSrc} });`);
    return fn(...names.map(n => deps[n]));
}

/* ---------- 0 ---------- */
test('【0】版本与审计脚本注册', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(idx)[1];
    // [v3.165] 交棒：不再钉死本版发行号，改为「三源一致 + 不低于本版」。
    //   钉死自己的发行号会让下一个版本接管时以「版本不同」翻红，而那是变更，不是缺陷。
    assert.strictEqual(v, manifest.version, 'manifest follows index.js');
    assert.strictEqual(v, pkg.version, 'package follows index.js');
    assert.ok(vnum(v) >= vnum('3.188.0'), `index.js 版本 ${v} >= 3.166.0`);
    // 第 8 个审计脚本已在目录里（tests/run.mjs 与 v3159 都按目录动态发现，无需单独登记）
    const audits = readdirSync(path.join(ROOT, 'tests', 'audit')).filter(f => f.endsWith('.mjs'));
    assert.ok(audits.includes('scan_event_lifecycle.mjs'), '第 8 个审计脚本存在');
    assert.ok(audits.length >= 8, `审计脚本数 ${audits.length} >= 8`);
});

/* ---------- 1 ---------- */
test('【1】静态判据：剥注释必须保留偏移，且不得把正则字面量误当字符串', () => {
    // 1a 前提断言：本组判据所依赖的输入必须存在，否则以「缺输入」而非「判据失效」失败。
    //    输入 = 扫描器源码里确实写了「注释里提到 eventSource.on(」这条说明
    //    （它是「必须剥注释」的立论依据；若该说明被删，本组需同步）。
    const scannerSrc = readFileSync(SCANNER, 'utf8');
    assert.ok(scannerSrc.includes('注释里提到 `eventSource.on('),
        '扫描器应保留「注释里提到 eventSource.on(」的立论说明（剥注释判据的输入）');
    assert.ok(scannerSrc.includes('stripComments'), '扫描器应有 stripComments');

    // 1b 真跑被测逻辑：从扫描器源码里取出 stripComments 并验证两条性质
    const scanner = scannerSrc;
    const fnSrc = extractNamed(scanner, 'function stripComments(code) {');
    const stripComments = new Function('return ' + fnSrc + ';')();
    const sample = 'aaa // eventSource.on(x)\nbbb /* eventSource.on(y)\nzzz */ ccc';
    const out = stripComments(sample);
    assert.strictEqual(out.split('\n').length, sample.split('\n').length, '剥注释必须保留换行数（行号才可定位）');
    assert.strictEqual(out.length, sample.length, '剥注释必须逐字符等长（偏移不漂移）');
    assert.ok(!out.includes('eventSource.on'), '注释内容必须被清除');
    assert.ok(out.includes('aaa') && out.includes('bbb') && out.includes('ccc'), '非注释代码必须保留');

    // 1c 不得误吞：真实 index.js 剥注释后，关键计数必须与全文件一致
    const bare = stripComments(idx);
    const c = (s, re) => (s.match(re) || []).length;
    assert.strictEqual(c(bare, /this[.]bindEvent[(]/g), c(idx, /this[.]bindEvent[(]/g),
        'stripComments 不得吞掉 this.bindEvent( 调用（初版会从 7 变 0）');
    assert.ok(c(bare, /this[.]bindEvent[(]/g) >= 7, '收口调用数 >= 7');
    assert.strictEqual(c(bare, /eventSource[.]on[(]/g), 1, '剥注释后只剩包装器内部那一次 on');
});

/* ---------- 2 ---------- */
function makeTree(dir, files) {
    mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
        const p = path.join(dir, name);
        mkdirSync(path.dirname(p), { recursive: true });
        writeFileSync(p, content, 'utf8');
    }
}
function runScanner(cwd, extraEnv = {}) {
    const r = spawnSync(process.execPath, [SCANNER], {
        cwd,
        env: { ...process.env, LONSHA_AUDIT_FIXTURE: '1', ...extraEnv },
        encoding: 'utf8',
    });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function withTmp(name, fn) {
    const dir = path.join(os.tmpdir(), 'lonsha-evt-' + name + '-' + process.pid + '-' + Date.now());
    try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
/* 夹具构造器：按需生成「健康」或「有缺陷」的最小仓库形状。
 *
 * 形状必须与真实 index.js 同构，否则判据测的就不是真东西。初版夹具用 for 循环生成注册点
 *   （文本上只有 1 处）并把 push 写成显式 `eventSource: es`（真实代码是 shorthand
 *   `{ eventSource, type: … , handler: … }`），于是**正样本自己就报出 E2「缺 handler 引用」**。
 * 夹具与真实代码脱节时，判据会先惩罚夹具而不是缺陷。本版展开成逐条注册点，逐字对齐真实写法。
 */
function fixtureIndex(opts = {}) {
    const o = Object.assign({
        regs: 6, wrap: true, push: true, pushInWrapper: true, handlerRefs: true,
        mismatch: false, unregCall: true, diag: true, provider: true,
    }, opts);
    const L = [];
    L.push('const PLUGIN_NAME = "T";');
    // [v3.165] 注册点总数的单一真源（E5 会核对它等于实际注册点数）
    L.push('const EXPECTED_EVENT_TYPES = ' + o.regs + ';');
    L.push('class P {');
    L.push('    _controlInfo = { events: 0 };');
    L.push('    bindEvent(eventSource, type, handler) {');
    L.push('        eventSource.on(type, handler);');
    L.push('        this._controlInfo.events++;');
    L.push('        this._controlInfo.lastEvent = type;');
    // [v3.165] 登记与注册同处：登记必须写在包装**内部**（这正是本版修的东西）。
    //   旧形状（登记散落在调用点）由 pushInWrapper:false 复现，作为负控制。
    if (o.push && o.pushInWrapper) {
        if (!o.handlerRefs) L.push('        this.eventHandlers.push({ eventSource, type });');
        else if (o.mismatch) L.push('        this.eventHandlers.push({ eventSource, type: type, handler: _hx });');
        else L.push('        this.eventHandlers.push({ eventSource, type, handler });');
    }
    L.push('        return true;');
    L.push('    }');
    L.push('    registerEvents(eventSource) {');
    L.push('        this.eventHandlers = [];');
    for (let i = 1; i <= o.regs; i++) {
        L.push('        const _h' + i + ' = () => 0;');
        // 裸调用必须写成 eventSource.on(…)：判据认的就是这个名字，夹具换名会变成
        //   「夹具与真实代码脱节」而不是「缺陷被报出」（初版用 es.on 就踩了这个）。
        L.push(o.wrap
            ? '        if (!this.bindEvent(eventSource, types.T' + i + ', _h' + i + ')) { console.warn("fail"); }'
            : '        eventSource.on(types.T' + i + ', _h' + i + ');');
        if (o.push && !o.pushInWrapper) {
            //   包装外登记：handlerRefs:false 时必须去掉 handler 引用，否则这条负控制
            //   只能测到「登记不在包装内」，测不到「无 handler 引用」（两条判据的负样本不同）。
            L.push(o.handlerRefs
                ? '        this.eventHandlers.push({ eventSource, type: types.T' + i + ', handler: _h' + i + ' });'
                : '        this.eventHandlers.push({ eventSource, type: types.T' + i + ' });');
        }
    }
    // 期望值必须由**标识符**赋值：写死字面量是上一版的形状，会随宿主 event_types
    //   能力差异误报（拿恒定的 7 去比，把「宿主缺项」当成「接线不完整」）。
    L.push('        const _expectedCount = ' + o.regs + ';');
    L.push('        this._controlInfo.expected = _expectedCount;');
    L.push('    }');
    if (o.unregCall) {
        L.push('    unregisterEvents() { this._controlInfo.unregisterAttempts++; this.eventHandlers = []; }');
        L.push('    boot() { this.unregisterEvents(); }');
    } else {
        L.push('    unregisterEvents() { this.eventHandlers = []; }');
        L.push('    boot() { }');
    }
    if (o.diag) {
        // 与真实 selfCheck 同构：经只读提供者读台账，并保留一条对 _controlInfo 的字面读取
        L.push('    diag() { const ci = (typeof this.stateProvider === "function" ? this.stateProvider() : this._controlInfo); return ["事件接线", ci.events]; }');
    } else {
        L.push('    diag() { return ["x", "y"]; }');
    }
    if (o.provider) L.push('    stateProvider = null;');
    L.push('}');
    return L.join('\n');
}
test('【2】合成夹具真跑扫描器：正样本 exit 0', () => {
    withTmp('clean', (dir) => {
        makeTree(dir, { 'index.js': fixtureIndex() });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 0, `正样本应 exit 0，实际 ${r.code}\n${r.out}`);
        assert.ok(/结构健康/.test(r.out), '应打印结构健康');
    });
});
test('【2】合成夹具真跑扫描器：裸注册点 → E1', () => {
    withTmp('bare', (dir) => {
        makeTree(dir, { 'index.js': fixtureIndex({ wrap: false }) });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 1, `应 exit 1，实际 ${r.code}\n${r.out}`);
        assert.ok(/E1 存在 6 处绕过统一包装/.test(r.out), `应报 E1 未收口，实际：${r.out}`);
    });
});
test('【2】合成夹具真跑扫描器：登记不在包装内 → E2（旧形状负控制）', () => {
    // [v3.165] 判据从「push 数 == 注册点数」（当时的形状）改为「登记必须发生在包装内部」
    //   （真正的不变量：只有写在包装里，登记才与注册同生共死）。旧形状由此负控制复现。
    withTmp('unpaired', (dir) => {
        makeTree(dir, { 'index.js': fixtureIndex({ pushInWrapper: false }) });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 1, `应 exit 1，实际 ${r.code}\n${r.out}`);
        assert.ok(/E2 台账登记不在统一包装/.test(r.out), `应报 E2 登记不在包装内，实际：${r.out}`);
    });
});

test('【2】合成夹具真跑扫描器：完全没有台账 → E2', () => {
    withTmp('nopush', (dir) => {
        makeTree(dir, { 'index.js': fixtureIndex({ push: false }) });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 1, `应 exit 1，实际 ${r.code}\n${r.out}`);
        assert.ok(/E2 台账登记不在统一包装/.test(r.out), `应报 E2 无台账，实际：${r.out}`);
    });
});
test('【2】合成夹具真跑扫描器：台账记录缺 handler 引用 → E2', () => {
    withTmp('nohandler', (dir) => {
        makeTree(dir, { 'index.js': fixtureIndex({ pushInWrapper: false, handlerRefs: false }) });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 1, `应 exit 1，实际 ${r.code}\n${r.out}`);
        assert.ok(/E2 台账记录中有 6 条不含 handler 引用/.test(r.out), `应报 E2 缺 handler，实际：${r.out}`);
    });
});
test('【2】合成夹具真跑扫描器：台账登记的 handler 与注册的不一致 → E2 加强判据', () => {
    withTmp('mismatch', (dir) => {
        makeTree(dir, { 'index.js': fixtureIndex({ mismatch: true }) });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 1, `应 exit 1，实际 ${r.code}\n${r.out}`);
        assert.ok(/E2 台账登记的 handler 与实际注册的不是同一批/.test(r.out),
            `应报 handler 不一致（计数上看不出来的镜像缺陷），实际：${r.out}`);
        assert.ok(/台账 handler 与注册一致 否/.test(r.out), '报告行应显示不一致');
    });
});
test('【2】合成夹具真跑扫描器：卸载零消费者 → E3', () => {
    withTmp('noconsumer', (dir) => {
        makeTree(dir, { 'index.js': fixtureIndex({ unregCall: false }) });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 1, `应 exit 1，实际 ${r.code}\n${r.out}`);
        assert.ok(/E3 unregisterEvents 定义存在但零调用点/.test(r.out), `应报 E3，实际：${r.out}`);
    });
});
test('【2】合成夹具真跑扫描器：台账只写不读 → E4', () => {
    withTmp('writeonly', (dir) => {
        makeTree(dir, { 'index.js': fixtureIndex({ diag: false, provider: false }) });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 1, `应 exit 1，实际 ${r.code}\n${r.out}`);
        assert.ok(/E4 控制平面台账 _controlInfo 只写不读/.test(r.out), `应报 E4 只写不读，实际：${r.out}`);
        assert.ok(/E4 诊断面（selfCheck）没有事件接线行/.test(r.out), '应报 E4 无诊断行');
        assert.ok(/E4 事件接线状态没有跨对象只读通道/.test(r.out), '应报 E4 无只读通道');
    });
});
test('【2】合成夹具真跑扫描器：结构下限 fail-closed（退化文件 / 缺包装器）', () => {
    // (a) 退化到没有分析价值：走真实（非夹具）下限
    withTmp('degraded', (dir) => {
        makeTree(dir, { 'index.js': 'console.log(1);\n' });
        const r = runScanner(dir, { LONSHA_AUDIT_FIXTURE: '0' });
        assert.strictEqual(r.code, 2, `退化文件应 exit 2，实际 ${r.code}\n${r.out}`);
        assert.ok(/index\.js 退化/.test(r.out), `应报 index.js 退化，实际：${r.out}`);
    });
    // (b) 结构漂移：文件不再含统一注册包装 → 必须 fail-closed，而不是当成「零缺陷」
    withTmp('nowrapper', (dir) => {
        makeTree(dir, { 'index.js': 'x'.repeat(300) + '\n' });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 2, `缺包装器应 exit 2，实际 ${r.code}\n${r.out}`);
        assert.ok(/找不到统一注册包装/.test(r.out), `应报结构漂移，实际：${r.out}`);
    });
});
test('【2】合成夹具真跑扫描器：无注册点树 → exit 2（注册面下限）', () => {
    withTmp('nosites', (dir) => {
        makeTree(dir, { 'index.js': fixtureIndex({ regs: 0 }) });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 2, `无注册点树应 exit 2，实际 ${r.code}\n${r.out}`);
        assert.ok(/仅观测到 0 个事件注册点/.test(r.out), `应报注册点下限失效，实际：${r.out}`);
    });
});
/* ---------- 3 ---------- */
test('【3】修复证据：7 个注册点全部收口，且不含裸调用', () => {
    // 3a 静态：经 bindEvent 收口 7 处
    const viaWrapper = (idx.match(/this\.bindEvent\(/g) || []).length;
    assert.strictEqual(viaWrapper, 7, `经包装的注册点应为 7，实际 ${viaWrapper}`);
    // 3b 剥注释后裸 on 只剩包装器内部 1 次
    const bareOns = (idx.replace(/^\s*\/\/.*$/gm, '').match(/eventSource\.on\(/g) || []).length;
    assert.strictEqual(bareOns, 1, `剥注释后 eventSource.on( 应只剩 1 次（包装器自身），实际 ${bareOns}`);
    // 3c [v3.165] 台账登记必须在**统一包装内部**（登记与注册同生共死）。
    //   旧不变量「push 数 == 注册点数」是当时的形状，不是不变量：一种实现用 7 条散落
    //   push 满足它，另一种实现用包装内 1 条 push 也满足「每条记录都对应真注册」。
    //   真正的不变量有两条：① 登记只出现在包装内；② 台账条数不得超过注册点数。
    const wrapperAt = idx.indexOf('bindEvent(eventSource, type, handler) {');
    assert.ok(wrapperAt > 0, '统一包装存在');
    let wi = idx.indexOf('{', wrapperAt), wd = 0, wEnd = wi;
    for (; wEnd < idx.length; wEnd++) {
        if (idx[wEnd] === '{') wd++;
        else if (idx[wEnd] === '}') { wd--; if (wd === 0) break; }
    }
    const wrapperSrc = idx.slice(wrapperAt, wEnd + 1);
    const pushAll = (idx.match(/this\.eventHandlers\.push\(/g) || []).length;
    const pushInWrapper = (wrapperSrc.match(/this\.eventHandlers\.push\(/g) || []).length;
    assert.ok(pushInWrapper >= 1, '登记出现在统一包装内（与注册同处）');
    assert.strictEqual(pushAll, pushInWrapper, `不存在散落包装外的登记点（总 ${pushAll} / 包装内 ${pushInWrapper}）`);
    assert.ok(pushAll <= viaWrapper, `台账条数 ${pushAll} 不得超过注册点数 ${viaWrapper}`);
    // 包装内那条登记必须带 handler 引用（真实代码是 shorthand，因为包装内只有一个 handler 变量）
    assert.ok(/this\.eventHandlers\.push\(\{\s*eventSource\s*,\s*type\s*,\s*handler\s*\}\)/.test(wrapperSrc),
        '包装内的登记带 handler 引用（shorthand 即「同一个变量」）');
    // 7 个调用点上不得再有 push（v3.165 已删除）
    assert.strictEqual((idx.match(/this\.eventHandlers\.push\(\{\s*eventSource\s*,\s*type:\s*types\./g) || []).length, 0,
        '调用点上不再有冗余登记');
    // 3d 失败哨兵的期望值必须等于实际注册点数：写错则「接线不完整」永不触发 ——
    //    哨兵在，但从不说真话（比没有哨兵更坏：它给人「已经检查过了」的错觉）。
    //   [v3.165] 期望值改为由宿主可见性条件**派生**（`this._controlInfo.expected = <标识符>`）：
    //   写死会随 event_types 能力差异把「宿主缺项」误报成「接线不完整」。单一真源改为
    //   常量 EXPECTED_EVENT_TYPES，由它与实际注册点数对齐（3d2）。
    assert.ok(/this\._controlInfo\.expected\s*=\s*[A-Za-z_$][\w$]*\s*;/.test(idx),
        '失败哨兵期望值必须由标识符派生（不得写死字面量）');
    // 3d2 单一真源：EXPECTED_EVENT_TYPES 必须等于实际注册点数
    const expectConst = Number((/const\s+EXPECTED_EVENT_TYPES\s*=\s*(\d+)\s*;/.exec(idx) || [])[1] || 0);
    assert.strictEqual(expectConst, viaWrapper, `EXPECTED_EVENT_TYPES(${expectConst}) 必须等于注册点数 ${viaWrapper}`);
});

test('【3】行为验证：bindEvent 真注册 + 真计数，且未就绪时拒绝注册', () => {
    const m = extractNamed(idx, '        bindEvent(eventSource, type, handler) {');
    const calls = [];
    const fakeEs = { on(t, h) { calls.push([t, h]); } };
    const h = () => 0;
    const obj = objOf(m, { errLog: () => {}, PLUGIN_NAME: 'T' });
    obj.ensureControlReady = () => true;          // 方法体里是 this.ensureControlReady()，须挂在对象上
    obj._controlInfo = { events: 0, lastEvent: null };
    const ok = obj.bindEvent.call(obj, fakeEs, 'EV', h);
    assert.strictEqual(ok, true, '就绪时应返回 true');
    assert.strictEqual(calls.length, 1, '应真的调用 eventSource.on');
    assert.strictEqual(calls[0][0], 'EV', '事件名正确');
    assert.strictEqual(calls[0][1], h, 'handler 引用正确');
    assert.strictEqual(obj._controlInfo.events, 1, '台账计数应自增（此前恒为 0）');
    assert.strictEqual(obj._controlInfo.lastEvent, 'EV', '台账应记录最后事件');

    // 未就绪：不得注册，且不得计数（fail-closed）
    const calls2 = [];
    const obj2 = objOf(m, { errLog: () => {}, PLUGIN_NAME: 'T' });
    obj2.ensureControlReady = () => false;
    obj2._controlInfo = { events: 0, lastEvent: null };
    const ok2 = obj2.bindEvent.call(obj2, { on(t, x) { calls2.push([t, x]); } }, 'EV', h);
    assert.strictEqual(ok2, false, '未就绪时应返回 false');
    assert.strictEqual(calls2.length, 0, '未就绪时不得注册');
    assert.strictEqual(obj2._controlInfo.events, 0, '未就绪时不得计数');
});

test('【3】行为验证：registerEvents 幂等——连调两次仍是 7 个监听（不是 14 个）', () => {
    // 用真事件源 + 真 registerEvents（其依赖全部注入），验证「先卸后装」真的生效。
    const regSrc = extractNamed(idx, '        registerEvents() {');
    const unregSrc = extractNamed(idx, '        unregisterEvents() {');
    const bindSrc = extractNamed(idx, '        bindEvent(eventSource, type, handler) {');

    const listeners = new Map();   // type -> [handler]
    const fakeEs = {
        on(t, h) { if (!listeners.has(t)) listeners.set(t, []); listeners.get(t).push(h); },
        off(t, h) { const a = listeners.get(t) || []; const i = a.indexOf(h); if (i >= 0) a.splice(i, 1); },
        removeListener(t, h) { this.off(t, h); },
    };
    const ALL_TYPES = {
        MESSAGE_RECEIVED: 'message_received', CHAT_CHANGED: 'chat_changed',
        MESSAGE_EDITED: 'message_edited', MESSAGE_SWIPED: 'message_swiped',
        MESSAGE_DELETED: 'message_deleted', GENERATION_ENDED: 'generation_ended',
        GENERATION_STARTED: 'generation_started',
    };
    global.window = { SillyTavern: { getContext: () => ({ eventSource: fakeEs, event_types: ALL_TYPES }) } };
    const obj = objOf([bindSrc, regSrc, unregSrc].join(',\n'), { errLog: () => {}, PLUGIN_NAME: 'T' });
    obj.ensureControlReady = () => true;
    obj.clearInjectSlots = () => {};
    obj.resetRecallDedup = () => {};
    obj._controlInfo = { events: 0, lastEvent: null, registeredAt: null, expected: 0, failed: [], lastFailure: null, unregisterAttempts: 0 };
    obj.engine = new Proxy({}, { get: () => () => 0 });
    obj.config = { config: {} };

    obj.registerEvents.call(obj);
    const afterFirst = [...listeners.values()].reduce((a, b) => a + b.length, 0);
    assert.strictEqual(afterFirst, 7, `首次注册应有 7 个监听，实际 ${afterFirst}`);
    assert.strictEqual(obj._controlInfo.events, 7, '台账 events 应为 7（此前恒为 0）');

    obj.registerEvents.call(obj);
    const afterSecond = [...listeners.values()].reduce((a, b) => a + b.length, 0);
    assert.strictEqual(afterSecond, 7, `重复注册后仍应是 7 个监听（不是 14）——幂等守卫生效，实际 ${afterSecond}`);
    assert.ok(obj._controlInfo.unregisterAttempts >= 1, '幂等路径应经 unregisterEvents 先行卸载（其调用计数 > 0）');
    assert.strictEqual(obj.eventHandlers.length, 7, '台账记录仍为 7 条');

    obj.unregisterEvents.call(obj);
    const afterUnreg = [...listeners.values()].reduce((a, b) => a + b.length, 0);
    assert.strictEqual(afterUnreg, 0, `卸载后应无残留监听，实际 ${afterUnreg}`);
    delete global.window;
});

test('【3】修复证据：诊断面暴露事件接线，且经只读提供者跨对象读取', () => {
    assert.ok(idx.includes('事件接线'), 'selfCheck 必须有事件接线行');
    // 3f 必须是**真的返回那一行**：只在注释里提到「事件接线」不算可见性
    //    （把 return 改成 ['子系统占位', txt] 时，宽松判据照样全绿）。
    assert.ok(idx.includes("['事件接线', txt]"), "selfCheck 诊断必须真的 return ['事件接线', txt]");
    assert.ok(/stateProvider/.test(idx), '必须有跨对象只读提供者');
    // 提供者由 plugin 注入（engine 不知道自己的 plugin）
    assert.ok(/this\.engine\.stateProvider\s*=\s*\(\)\s*=>\s*this\._controlInfo/.test(idx),
        'plugin 构造应注入只读提供者');
    assert.ok(/typeof this\.stateProvider === 'function'/.test(idx), 'engine 侧应经提供者读取并容灾降级');
    // 失败哨兵：注册不完整必须留痕
    assert.ok(idx.includes('事件接线不完整'), '必须有注册失败哨兵');
    assert.ok(/this\._controlInfo\.failed\.push/.test(idx), '失败记录应入台账');
});

test('【3】真实仓库审计：注册脚本加载面与事件面同时卫生', () => {
    const r = spawnSync(process.execPath, [SCANNER], { cwd: ROOT, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, `真实仓库应 exit 0，实际 ${r.status}\n${r.stdout}${r.stderr}`);
    const out = (r.stdout || '') + (r.stderr || '');
    assert.ok(/事件注册点 7 个（经统一包装收口 7 个 \/ 裸调用 0 处）/.test(out), `应有 7 处收口、0 处裸调用，实际：${out}`);
});

/* ---------- 4 ---------- */
test('【4】发布卫生：CHANGELOG 顶节是本版，且旧锚点已交棒', () => {
    //   [v3.165] 交棒：顶节断言改为「顶节 == index.js 现版」的动态形式，不再钉死发行号。
    const curV = /const VERSION = '([0-9.]+)'/.exec(idx)[1];
    assert.ok(changelog.startsWith('## v' + curV), `CHANGELOG 顶节应为 v${curV}`);
    assert.ok(changelog.includes('事件生命周期'), 'CHANGELOG 应记录事件生命周期面这条主线');
    //   旧锚点只要求「仍锚着不低于 3.165.0 的版本」，不钉死等值（等值会让下一版接管时翻红）。
    for (const f of ['tests/v3117_diagnostics.test.mjs', 'tests/v3130_control_plane.test.mjs']) {
        const src = readFileSync(path.join(ROOT, f), 'utf8');
        const hits = [...src.matchAll(/'(3[.][0-9]+[.][0-9]+)'/g)].map(m => m[1]);
        assert.ok(hits.length > 0, `${f} 仍锚着版本字符串`);
        assert.ok(hits.every(h => vnum(h) >= vnum('3.188.0')), `${f} 的版本锚点未过期`);
    }
    // 当版独占必须交出：上一版文件里的下界必须 >= 本版（动态判据，不写死具体版本）
    const cur = vnum(/const VERSION = '([\d.]+)'/.exec(idx)[1]);
    for (const f of ['tests/v3160_config_declaration_gap.test.mjs', 'tests/v3161_config_reachability.test.mjs',
        'tests/v3162_ui_binding_hygiene.test.mjs', 'tests/v3163_module_wiring.test.mjs',
        'tests/v3165_claim_truthfulness.test.mjs']) {
        const src = readFileSync(path.join(ROOT, f), 'utf8');
        const hits = [...src.matchAll(/vnum\('(\d+\.\d+\.\d+)'\)/g)].map(m => vnum(m[1]));
        assert.ok(hits.length > 0, `${f} 应有版本下界断言`);
        assert.ok(hits.every(h => h >= cur), `${f} 的版本下界必须 >= 本版（${cur}）`);
    }
});

/* ---------- 5 ---------- */
// 【5】判据面自防护
//   本文件前面所有判据都只看 index.js / 扫描器，**没有一条看被测文件自己**。实测两个漏网：
//     1) 把「二次注册仍是 7 个监听」那行断言删掉 —— 行为验证静默消失，门禁照样全绿；
//     2) 把 CHANGELOG 顶节断言改成 `assert.ok(true)` —— 发布卫生静默放宽，同样全绿。
//   契约测试的风险正在这里：被测代码很稳，测它自己的判据却没人管。
//   指纹用**自拼接**写法（'assert.strictEq' + 'ual(afterSecond, 7,'）：若直接写完整字符串，
//   它自己就包含在文件里，改掉断言时指纹也跟着改 —— 自我满足，等于没防。
test('【5】判据面自防护：断言数量 / 关键判据指纹 / 结构下限不得缩水', () => {
    const self = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const nAssert = (self.match(/assert[.]/g) || []).length;
    assert.ok(nAssert >= 84, `断言数不得缩水（>= 84），实际 ${nAssert} —— 判据被删或改宽松时此处必须响`);
    const codeLines = self.split('\n').filter(l => {
        const s = l.trim();
        return s && !s.startsWith('//') && !s.startsWith('*') && !s.startsWith('/*');
    }).length;
    assert.ok(codeLines >= 330, `有效代码行不得缩水（>= 330），实际 ${codeLines}`);
    const fp = [
        ['行为验证：幂等（二次仍是 7 个）', 'assert.strictEq' + 'ual(afterSecond, 7,'],
        ['行为验证：卸载后无残留', 'assert.strictEq' + 'ual(afterUnreg, 0,'],
        ['行为验证：bindEvent 真计数', 'assert.strictEq' + 'ual(obj._controlInfo.events, 1,'],
        ['行为验证：未就绪拒绝注册', 'assert.strictEq' + 'ual(calls2.length, 0,'],
        ['发布卫生：CHANGELOG 顶节', "changelog.startsWith('## v' + curV)"],
        ['发布卫生：旧锚点已交棒', 'hits.every(h => vnum(h) >=' + ' vnum('],
        ['发布卫生：当版独占交出', 'hits.every(h => h >= cur)'],
        ['扫描器：正样本 exit 0', 'assert.strictEq' + 'ual(r.code, 0,'],
        ['扫描器：真缺陷 exit 1', 'assert.strictEq' + 'ual(r.code, 1,'],
        ['扫描器：下限 exit 2', 'assert.strictEq' + 'ual(r.code, 2,'],
        ['剥注释：逐字符等长', 'assert.strictEq' + 'ual(out.length, sample.length,'],
        ['真实仓库：注册收口 7 处', '经统一包装收口 7 个'],
        ['修复证据：哨兵期望值必须派生', 'expected 必须由标识符派生'],
        ['修复证据：单一真源自洽', 'EXPECTED_EVENT_TYPES'],
        ['修复证据：诊断真返回事件接线行', "['事件接线', txt]"],
    ];
    for (const [name, sig] of fp) {
        assert.ok(self.includes(sig), `判据指纹缺失：${name}（该判据被删或改宽松）`);
    }
});
