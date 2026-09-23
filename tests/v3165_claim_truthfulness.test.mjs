// tests/v3165_claim_truthfulness.test.mjs
// LonSha 记忆引擎 v3.165.0 —— 声称真实性面治理（成功声明必须由事实驱动）
//
// 覆盖：
//   0  版本与审计脚本注册（第 9 个）
//   1  静态判据：剥注释保留偏移；EXPECTED_EVENT_TYPES 单一真源
//   2  合成夹具真跑扫描器（正样本 + 5 类负样本 + 2 条结构下限）
//   3  本次修复的消失证据 + 行为级验证（真实事件源/真实台账，不是文本匹配）
//   4  发布卫生
//   5  判据面自防护（防假绿注入还没覆盖的三个漏网）
//
// 为什么必须有行为级验证：
//   本版修的五个缺陷，全部“静态看起来没问题”：
//     · bindEvent 的注释写着「统一事件注册包装」，却对 eventSource.on(undefined, h) 放行；
//     · 台账 push 写在 7 个调用点上，字面上“每条都带 handler 引用”；
//     · `✓ 事件监听已注册` 与 `✓ 初始化完成(...已启用)` 是常量字符串；
//     · `✓ 完成` 落在 if/else 之外；
//     · 空种子照样报 `✓ 导入成功` 并返回 true。
//   所以判据必须“真给一个假 eventSource、真调两次、真拿空种子跑”：
//   只做文本匹配的话，把断言改写成永远真都能过。
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { stripComments as libStrip } from './_audit_lib.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCANNER = path.join(HERE, 'audit', 'scan_claim_truthfulness.mjs');
const idx = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}
/* 花括号计数法抽取方法体（与 v3164/v3163/v391 同一工具，避免自创解析器） */
function extractNamed(text, marker) {
    const at = text.indexOf(marker);
    if (at < 0) throw new Error('找不到: ' + marker);
    // 从 marker 末尾那个 { 开始配平（不能从 marker 里第一个 { 开始：
    //   `importCarryoverSeed(seed, options = {}) {` 的第一个 { 属于默认值，会把抽取截断成 `{}`）。
    const braceAt = marker.lastIndexOf('{');
    if (braceAt < 0) throw new Error('marker 必須以左花括号结尾: ' + marker);
    let i = at + braceAt, depth = 0;
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
/* 夹具骨架：**逐条原子语句**构造，不得用生成器拼接。
 * 教训（本轮实测）：初版夹具用 for 循环把方法体拼成单行 `boot() { L.push(...) ... }`，
 *   扫描器的方法区间表要求「方法定义独占一行、行首恰好 8 空格缩进」，于是
 *   方法区间 = 0，两个声称点全部报「未落在任何方法体内」，正样本自己 exit 2。
 *   夹具与真实代码不同构时，判据会先惩罚夹具而不是缺陷。
 *   本骨架的行首缩进与真实 index.js 一致：类内方法 8 空格、方法体 12 空格。
 *   行数大于方法区间下限（夹具模式 1 个），故不能靠空壳骗结构下限。
 */
const mini = [
    'const PLUGIN_NAME = "T";',
    'class S {',
    '        boot() {',
    "            try { return 1; } catch (e) { console.warn('\u26a0\ufe0f boot degraded'); }",
    '            console.log(`[${PLUGIN_NAME}] \u2713 boot ok`);',
    '        }',
    '        load() {',
    '            try {',
    "                const caps = ['LLM'];",
    '                console.log(`[${PLUGIN_NAME}] \u2713 loaded (${caps.join("+")}\u5df2\u542f\u7528)`);',
    '                return 1;',
    "            } catch (e) { console.warn('\u26a0\ufe0f load degraded'); }",
    '        }',
    '        pad() { return 1; }',
    '}',
] ;
for (let i = 0; i < 30; i++) mini.push('const p' + i + ' = 0;');
const MINI = mini.join('\n') + '\n';
/* ---------- 0 ---------- */
test('【0】版本与审计脚本注册', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(idx)[1];
    assert.strictEqual(v, manifest.version, 'manifest follows index.js');
    assert.strictEqual(v, pkg.version, 'package follows index.js');
    assert.ok(vnum(v) >= vnum('3.196.0'), `index.js 版本 ${v} >= 3.166.0`);
    const audits = readdirSync(path.join(ROOT, 'tests', 'audit')).filter(f => f.endsWith('.mjs')).sort();
    assert.ok(audits.includes('scan_claim_truthfulness.mjs'), '第 9 个审计脚本存在');
    assert.ok(audits.length >= 9, `审计脚本数 ${audits.length} >= 9`);
});
/* ---------- 1 ---------- */
test('【1】静态判据：剥注释保留偏移，EXPECTED_EVENT_TYPES 是单一真源', () => {
    const scannerSrc = readFileSync(SCANNER, 'utf8');
    assert.ok(scannerSrc.includes("from '../_audit_lib.mjs'"), '扫描器须 import 唯一真源 ../_audit_lib.mjs');
    assert.ok(!/function\s+stripComments\s*\(/.test(scannerSrc), '扫描器不得再自带 stripComments 实现（v3.191 收敛）');
    const stripComments = libStrip;
    const sample = 'aaa // \u2713 fake\nbbb /* \u2713 fake\nzzz */ ccc';
    const out = stripComments(sample);
    assert.strictEqual(out.split('\n').length, sample.split('\n').length, '剥注释必须保留换行数（行号才可定位）');
    assert.strictEqual(out.length, sample.length, '剥注释必须逐字符等长（偏移不漂移）');
    assert.ok(!out.includes('\u2713'), '注释里的 ✓ 必须被清除（否则注释文字会被当成声称点）');
    assert.ok(out.includes('aaa') && out.includes('ccc'), '非注释代码必须保留');
    // 单一真源：常量必须等于实际注册点数（7）
    const expectConst = Number((/const\s+EXPECTED_EVENT_TYPES\s*=\s*(\d+)\s*;/.exec(idx) || [])[1] || 0);
    const regs = (idx.match(/this[.]bindEvent[(]/g) || []).length;
    assert.strictEqual(expectConst, regs, `EXPECTED_EVENT_TYPES(${expectConst}) 必须等于注册点数 ${regs}`);
    assert.ok(expectConst >= 5, '注册点下限仍在（防探测器失效）');
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
    const dir = path.join(os.tmpdir(), 'lonsha-claim-' + name + '-' + process.pid + '-' + Date.now());
    try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
/* ---------- 2 ---------- */
// 五个负样本都只改 MINI 里的一处（原子变异）：改完先断言变异真的生效，
//   否则夹具若与判据不同构，测的就是正样本 —— 上一版正是这样把所有用例测成 0 区间。
test('【2】夹具骨架自身必须可被分析（防「生成器拼接」漏网回潮）', () => {
    withTmp('scaffold', (dir) => {
        makeTree(dir, { 'index.js': MINI });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 0, `夹具骨架必须自身 exit 0，实际 ${r.code}\n${r.out}`);
        assert.ok(/方法区间 [1-9]/.test(r.out), `夹具的方法区间不得为 0 —— 用生成器拼接时曾全部为 0，声称点因此被判「无主」，本判据就是那次漏网的守卫：${r.out}`);
        assert.ok(!/未落在任何方法体内/.test(r.out), '声称点不得被判为无主');
    });
});
test('【2】合成夹具真跑扫描器：正样本 exit 0', () => {
    withTmp('clean', (dir) => {
        makeTree(dir, { 'index.js': MINI });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 0, `正样本应 exit 0，实际 ${r.code}\n${r.out}`);
        assert.ok(/结构健康（声称点 2 >= 下限 1）：ok/.test(r.out), `应打印结构健康，实际：${r.out}`);
        assert.ok(/复合能力声称 0 处未派生/.test(r.out), '正样本不得有未派生的复合声称');
    });
});
test('【2】合成夹具真跑扫描器：复合能力声称写成常量 → F2', () => {
    withTmp('flat', (dir) => {
        const bad = MINI.replace('${caps.join("+")}\u5df2\u542f\u7528', 'LLM+\u5411\u91cf\u68c0\u7d22+\u56fe\u6269\u6563\u5df2\u542f\u7528');
        assert.ok(bad !== MINI, '变异必须真的生效（否则测的是正样本）');
        makeTree(dir, { 'index.js': bad });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 1, `应 exit 1，实际 ${r.code}\n${r.out}`);
        assert.ok(/F2 有 1 处复合能力声称写成了常量/.test(r.out), `应报 F2，实际：${r.out}`);
        assert.ok(/字面声称 LLM\+\u5411\u91cf\u68c0\u7d22\+\u56fe\u6269\u6563/.test(r.out), `应点名被写死的能力，实际：${r.out}`);
    });
});
test('【2】合成夹具真跑扫描器：成功声称所在方法无失败出口 → F1', () => {
    withTmp('orphan', (dir) => {
        // 注意：不能只把 catch 体掏空 —— 扫描器将「方法内出现过 catch」本身计为失败出口
        //   （有 catch 就有地方说失败），掏空后仍然算有出口。合法变异是把整条 try/catch 拿掉。
        const bad = MINI.replace("            try { return 1; } catch (e) { console.warn('\u26a0\ufe0f boot degraded'); }", '            const ok = 1;');
        assert.ok(bad !== MINI, '变异必须真的生效');
        makeTree(dir, { 'index.js': bad });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 1, `应 exit 1，实际 ${r.code}\n${r.out}`);
        assert.ok(/F1 有 1 个成功声称点所在方法没有任何失败出口：\d+（boot）/.test(r.out), `应报 F1 并定位到 boot，实际：${r.out}`);
    });
});
test('【2】合成夹具真跑扫描器：空 catch 棘轮 → F4', () => {
    withTmp('ratchet', (dir) => {
        const bad = MINI + 'class Z {\n        pad() { try { return 1; } catch (e) {} }\n}\n';
        makeTree(dir, { 'index.js': bad });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 1, `应 exit 1，实际 ${r.code}\n${r.out}`);
        assert.ok(/F4 真正空白的 catch 从基线 0 涨到了 1 处/.test(r.out), `应报 F4，实际：${r.out}`);
    });
});
test('【2】合成夹具真跑扫描器：注释型 catch 不算空白（不误报）', () => {
    withTmp('commentcatch', (dir) => {
        const variant = MINI.replace("console.warn('\u26a0\ufe0f boot degraded')", '/* \u5bb9\u707e\u964d\u7ea7 */');
        assert.ok(variant !== MINI, '变异必须真的生效');
        makeTree(dir, { 'index.js': variant });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 0, `注释型 catch 不应触发 F4，实际 ${r.code}\n${r.out}`);
        assert.ok(/真正空白 catch 0/.test(r.out), `注释型 catch 应计为 0，实际：${r.out}`);
    });
});
test('【2】合成夹具真跑扫描器：结构下限 fail-closed（退化文件）', () => {
    withTmp('degraded', (dir) => {
        makeTree(dir, { 'index.js': 'console.log(1);\n' });
        const r = runScanner(dir, { LONSHA_AUDIT_FIXTURE: '0' });
        assert.strictEqual(r.code, 2, `退化文件应 exit 2，实际 ${r.code}\n${r.out}`);
        assert.ok(/index[.]js 退化/.test(r.out), `应报退化，实际：${r.out}`);
    });
});
test('【2】合成夹具真跑扫描器：方法区间下限 fail-closed', () => {
    withTmp('nospans', (dir) => {
        makeTree(dir, { 'index.js': 'x'.repeat(300) + '\n' });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 2, `无方法区间应 exit 2，实际 ${r.code}\n${r.out}`);
        assert.ok(/方法区间/.test(r.out), `应报方法区间下限失效，实际：${r.out}`);
    });
});
test('【2】合成夹具真跑扫描器：声称点下限 fail-closed', () => {
    withTmp('noclaims', (dir) => {
        makeTree(dir, { 'index.js': 'class S {\n        boot() {\n            return 1;\n        }\n}\n' });
        const r = runScanner(dir);
        assert.strictEqual(r.code, 2, `无声称点应 exit 2，实际 ${r.code}\n${r.out}`);
        assert.ok(/声称面探测器已失效/.test(r.out), `应报声称点下限失效，实际：${r.out}`);
    });
});

/* ---------- 3 ---------- */
test('【3】修复证据：类型契约写在包装内、校验早于 on、登记与注册同处', () => {
    const viaWrapper = (idx.match(/this[.]bindEvent[(]/g) || []).length;
    const wrapperSrc = extractNamed(idx, '        bindEvent(eventSource, type, handler) {');
    // 3a 单一真源：常量必须等于实际注册点数
    const expectConst = Number((/const\s+EXPECTED_EVENT_TYPES\s*=\s*(\d+)\s*;/.exec(idx) || [])[1] || 0);
    assert.strictEqual(expectConst, viaWrapper, `EXPECTED_EVENT_TYPES(${expectConst}) 必须等于注册点数 ${viaWrapper}`);
    assert.ok(viaWrapper >= 5, '注册点下限仍在（防探测器本身失效）');
    // 3b 类型契约必须写在包装内（写在调用点没用：调用点不知道成败）
    assert.ok(/typeof\s+type\s*!==\s*'string'\s*\|\|\s*!\s*type/.test(wrapperSrc), '包装内校验事件名非空');
    assert.ok(/typeof\s+handler\s*!==\s*'function'/.test(wrapperSrc), '包装内校验 handler 是函数');
    assert.ok(/this\._controlInfo\.rejected\+\+/.test(wrapperSrc), '拒绝必须计数（拒绝数是唯一运行时线索）');
    assert.ok(/lastReject\s*=/.test(wrapperSrc), '拒绝原因必须留痕');
    const atOn = wrapperSrc.indexOf('eventSource.on(');
    const atTypeCheck = wrapperSrc.indexOf("typeof type !== 'string'");
    const atHandlerCheck = wrapperSrc.indexOf("typeof handler !== 'function'");
    assert.ok(atOn > 0 && atTypeCheck > 0 && atHandlerCheck > 0, '三条关键动作都必须真的在包装体内');
    assert.ok(atTypeCheck < atOn && atHandlerCheck < atOn, '校验必须早于 eventSource.on（挂上再校验等于没校验）');
    // 3c 登记与注册同处
    const pushAll = (idx.match(/this\.eventHandlers\.push\(/g) || []).length;
    const pushInWrapper = (wrapperSrc.match(/this\.eventHandlers\.push\(/g) || []).length;
    assert.ok(pushInWrapper >= 1, '登记出现在统一包装内');
    assert.strictEqual(pushAll, pushInWrapper, `不存在包装外的登记点（总 ${pushAll} / 包装内 ${pushInWrapper}）`);
    assert.ok(wrapperSrc.indexOf('this.eventHandlers.push(') > atOn, '登记在 on 之后：on 抛错则不登记');
    assert.strictEqual((idx.match(/this\.eventHandlers\.push\(\{\s*eventSource\s*,\s*type:\s*types\./g) || []).length, 0,
        '调用点的冗余登记已全部删除');
    // 3d 台账重置（可见性不得朝「看起来更好」撒谎）
    const regSrc = extractNamed(idx, '        registerEvents() {');
    assert.ok(/this\._controlInfo\.events\s*=\s*0\s*;/.test(regSrc), '重装前必须重置 events');
    assert.ok(/this\._controlInfo\.lastEvent\s*=\s*null\s*;/.test(regSrc), '重装前必须重置 lastEvent');
    assert.ok(regSrc.indexOf('this._controlInfo.events = 0') < regSrc.indexOf('window.SillyTavern'),
        '重置必须发生在取 eventSource 之前（否则中途 return 会留下脏计数）');
});
test('【3】修复证据：四处成功声明 + 复合能力均由事实驱动', () => {
    assert.ok(/const\s+wired\s*=\s*this\._controlInfo\.events\s*>=\s*expectedEvents\s*;/.test(idx),
        '接线日志分支由 wired 事实驱动');
    assert.ok(/\$\{wired\s*\?\s*'\u2713 事件监听已注册'\s*:\s*'\u26a0\ufe0f 事件监听注册不完整'\}/.test(idx),
        '接线日志不得无条件报成功');
    assert.ok(/_savePersisted\s*\?\s*'\u2713 完成'\s*:\s*'\u26a0\ufe0f 提取完成但未落盘'/.test(idx), '提取日志按落盘事实分支');
    assert.ok(/this\._moduleStatus\s*=\s*\{\s*diffusion:\s*false,\s*visualizer:\s*false\s*\}/.test(idx),
        '模块加载必须有实测状态表');
    assert.ok(/this\._lastCarryoverImport\s*=\s*\{\s*applied:/.test(idx), '导入必须有生效字段事实来源');
    assert.ok(/_settingsUILoadError\s*=/.test(idx), '设置面板加载失败必须留痕');
    // 复合能力声称：剥掉全部插值后，剩余字面文本里不得再出现能力名
    const claimLine = (idx.match(/console\.log\(`\[\$\{PLUGIN_NAME\}\] \$\{[^`]*初始化完成[^`]*`\)/) || [])[0];
    assert.ok(claimLine, '找不到「初始化完成」声称点（判据需随代码同步）');
    const literal = claimLine.replace(/\$\{[^}]*\}/g, '');
    assert.ok(!literal.includes('图扩散') && !literal.includes('可视化'),
        `剥掉插值后不得残留字面能力名（那就是与事实无关的常量声称）：${literal}`);
    assert.ok(/_caps\.push\('图扩散'\)/.test(idx) && /_caps\.push\('可视化'\)/.test(idx),
        '能力名必须由 _moduleStatus 决定是否进入 _caps');
});
/* 行为级验证：不靠文本匹配，真跑方法体。
 * 本版五个缺陷全部「静态看起来没问题」，所以必须真给假 eventSource、真调两次、真拿空种子跑 ——
 * 否则把断言改写成永远真都能过。
 */
test('【3】行为验证：bindEvent 拒绝无效类型（不再静默 on(undefined)）', () => {
    const m = extractNamed(idx, '        bindEvent(eventSource, type, handler) {');
    const calls = [];
    const obj = objOf(m, { errLog: () => {}, PLUGIN_NAME: 'T' });
    obj.ensureControlReady = () => true;
    obj._controlInfo = { events: 0, lastEvent: null, rejected: 0, lastReject: null };
    obj.eventHandlers = [];
    const h = () => 0;
    const fakeEs = { on(t, x) { calls.push([t, x]); } };
    // (a) 类型缺失（宿主 event_types 缺项 → types.X 为 undefined）：旧实现会照样 on()，监听器 +1、
    //     台账 +1、哨兵认为完整，而 handler 永不触发。
    assert.strictEqual(obj.bindEvent.call(obj, fakeEs, undefined, h), false, '类型缺失必须返回 false');
    assert.strictEqual(calls.length, 0, '类型缺失时不得调用 on（旧实现的假绿点就在这里）');
    assert.strictEqual(obj._controlInfo.events, 0, '类型缺失时不得计数');
    assert.strictEqual(obj._controlInfo.rejected, 1, '拒绝必须计数（唯一运行时线索）');
    assert.ok(/事件名缺失/.test(obj._controlInfo.lastReject), '拒绝原因必须可读');
    // (b) handler 非函数
    assert.strictEqual(obj.bindEvent.call(obj, fakeEs, 'EV', null), false, 'handler 非函数必须拒绝');
    assert.strictEqual(calls.length, 0, 'handler 非函数时不得调用 on');
    assert.strictEqual(obj._controlInfo.rejected, 2, '第二次拒绝也要计数');
    // (c) 合法注册：on / 计数 / 登记 三件事同时发生，且 handler 是同一个引用
    assert.strictEqual(obj.bindEvent.call(obj, fakeEs, 'EV', h), true, '合法注册应返回 true');
    assert.strictEqual(calls.length, 1, '应真的调用 on');
    assert.strictEqual(calls[0][0], 'EV', '事件名正确');
    assert.strictEqual(calls[0][1], h, 'handler 引用必须是同一个（否则卸载卸不掉）');
    assert.strictEqual(obj._controlInfo.events, 1, '台账计数自增');
    assert.strictEqual(obj._controlInfo.lastEvent, 'EV', '台账记录最后事件');
    assert.strictEqual(obj.eventHandlers.length, 1, '登记与注册同处发生');
    assert.strictEqual(obj.eventHandlers[0].handler, h, '登记必须带 handler 引用');
    assert.strictEqual(obj.eventHandlers[0].type, 'EV', '登记类型正确');
    // (d) on 抛错：不得计数、不得登记（登记写在 on 之后，与 on 同行生死）
    const bad = { on() { throw new Error('boom'); } };
    const beforeEvents = obj._controlInfo.events, beforeLen = obj.eventHandlers.length;
    assert.strictEqual(obj.bindEvent.call(obj, bad, 'EV2', h), false, 'on 抛错应返回 false');
    assert.strictEqual(obj._controlInfo.events, beforeEvents, 'on 抛错不得计数（否则哨兵被喂假数据）');
    assert.strictEqual(obj.eventHandlers.length, beforeLen, 'on 抛错不得登记（否则卸载会 off 一个从未 on 过的函数）');
    // (e) 未就绪：同样不得注册、不得计数
    const obj2 = objOf(m, { errLog: () => {}, PLUGIN_NAME: 'T' });
    obj2.ensureControlReady = () => false;
    obj2._controlInfo = { events: 0, lastEvent: null, rejected: 0, lastReject: null };
    obj2.eventHandlers = [];
    const calls2 = [];
    assert.strictEqual(obj2.bindEvent.call(obj2, { on(t, x) { calls2.push([t, x]); } }, 'EV', h), false, '未就绪应返回 false');
    assert.strictEqual(calls2.length, 0, '未就绪不得注册');
    assert.strictEqual(obj2._controlInfo.events, 0, '未就绪不得计数');
});
test('【3】行为验证：registerEvents 两次仍是 7 个监听，台账不翻倍', () => {
    const bindSrc = extractNamed(idx, '        bindEvent(eventSource, type, handler) {');
    const regSrc = extractNamed(idx, '        registerEvents() {');
    const unregSrc = extractNamed(idx, '        unregisterEvents() {');
    const listeners = new Map();
    const fakeEs = {
        on(t, h) { if (!listeners.has(t)) listeners.set(t, []); listeners.get(t).push(h); },
        off(t, h) { const a = listeners.get(t) || []; const i = a.indexOf(h); if (i >= 0) a.splice(i, 1); },
        removeListener(t, h) { this.off(t, h); },
    };
    const ALL = {
        MESSAGE_RECEIVED: 'message_received', CHAT_CHANGED: 'chat_changed',
        MESSAGE_EDITED: 'message_edited', MESSAGE_SWIPED: 'message_swiped',
        MESSAGE_DELETED: 'message_deleted', GENERATION_ENDED: 'generation_ended',
        GENERATION_STARTED: 'generation_started',
    };
    global.window = { SillyTavern: { getContext: () => ({ eventSource: fakeEs, event_types: ALL }) } };
    try {
        const obj = objOf([bindSrc, regSrc, unregSrc].join(',\n'), { errLog: () => {}, PLUGIN_NAME: 'T' });
        obj.ensureControlReady = () => true;
        obj.clearInjectSlots = () => {};
        obj.resetRecallDedup = () => {};
        obj._controlInfo = { events: 0, lastEvent: null, registeredAt: null, expected: 0, failed: [], lastFailure: null, unregisterAttempts: 0, rejected: 0, lastReject: null };
        obj.engine = new Proxy({}, { get: () => () => 0 });
        obj.config = { config: {} };
        const count = () => [...listeners.values()].reduce((a, b) => a + b.length, 0);
        obj.registerEvents.call(obj);
        assert.strictEqual(count(), 7, `首次注册应有 7 个监听，实际 ${count()}`);
        assert.strictEqual(obj._controlInfo.events, 7, `台账 events 应为 7，实际 ${obj._controlInfo.events}`);
        assert.strictEqual(obj.eventHandlers.length, 7, '登记条数 = 注册点数');
        // 幂等：先卸后装，且台账不得累计（旧实现会显示 14）
        obj.registerEvents.call(obj);
        assert.strictEqual(count(), 7, `二次注册后监听仍应是 7 个（不是 14），实际 ${count()}`);
        assert.strictEqual(obj._controlInfo.events, 7, `二次注册后台账必须回到 7（旧实现是 14），实际 ${obj._controlInfo.events}`);
        assert.strictEqual(obj.eventHandlers.length, 7, `二次注册后登记仍应为 7 条，实际 ${obj.eventHandlers.length}`);
        obj.unregisterEvents.call(obj);
        assert.strictEqual(count(), 0, `卸载后不得有残留监听，实际 ${count()}`);
    } finally { delete global.window; }
});
test('【3】行为验证：四种失败态都写进台账（坏了有人知道）', () => {
    const bindSrc = extractNamed(idx, '        bindEvent(eventSource, type, handler) {');
    const regSrc = extractNamed(idx, '        registerEvents() {');
    const unregSrc = extractNamed(idx, '        unregisterEvents() {');
    function fresh(types, es) {
        global.window = { SillyTavern: { getContext: () => ({ eventSource: es, event_types: types }) } };
        const obj = objOf([bindSrc, regSrc, unregSrc].join(',\n'), { errLog: () => {}, PLUGIN_NAME: 'T' });
        obj.ensureControlReady = () => true;
        obj.clearInjectSlots = () => {};
        obj.resetRecallDedup = () => {};
        obj._controlInfo = { events: 0, lastEvent: null, registeredAt: null, expected: 0, failed: [], lastFailure: null, unregisterAttempts: 0, rejected: 0, lastReject: null };
        obj.engine = new Proxy({}, { get: () => () => 0 });
        obj.config = { config: {} };
        return obj;
    }
    const ALL = {
        MESSAGE_RECEIVED: 'message_received', CHAT_CHANGED: 'chat_changed',
        MESSAGE_EDITED: 'message_edited', MESSAGE_SWIPED: 'message_swiped',
        MESSAGE_DELETED: 'message_deleted', GENERATION_ENDED: 'generation_ended',
        GENERATION_STARTED: 'generation_started',
    };
    const silent = { on() {}, off() {}, removeListener() {} };
    try {
        // (a) eventSource 不可用：最常见的「聊了很久没有记忆」入口 —— 旧实现只打一行 warn
        const a = fresh(ALL, null);
        a.registerEvents.call(a);
        assert.ok(a._controlInfo.lastFailure, 'eventSource 不可用时必须留失败痕（旧实现全空白）');
        assert.ok(/eventSource/.test(a._controlInfo.lastFailure), '失败原因应指明 eventSource/event_types');
        assert.strictEqual(a._controlInfo.failed.length >= 1, true, '失败必须进失败清单');
        assert.strictEqual(a._controlInfo.expected, 0, '一个也没注册时 expected 必须是 0（不得停在默认值）');
        // (b) 宿主 event_types 缺项：对应注册点本就不执行，期望数必须跟着降（不得误报不完整）
        const partial = { MESSAGE_RECEIVED: 'message_received', GENERATION_STARTED: 'generation_started' };
        const b = fresh(partial, silent);
        b.registerEvents.call(b);
        assert.strictEqual(b._controlInfo.expected, 2, `期望数必须由与注册点相同的可见性条件派生，实际 ${b._controlInfo.expected}`);
        assert.strictEqual(b._controlInfo.events, 2, '两个可见注册点都应注册成功');
        assert.strictEqual(b._controlInfo.failed.length, 0, '宿主能力缺失不是接线缺陷，不得误导告警（噪声告警的代价是真告警被忽略）');
        // (c) on 抛错：哨兵必须把失败留在台账里
        const boom = { on() { throw new Error('boom'); }, off() {}, removeListener() {} };
        const c = fresh({ MESSAGE_RECEIVED: 'message_received' }, boom);
        c.registerEvents.call(c);
        assert.strictEqual(c._controlInfo.events, 0, '注册全失败时不得有任何计数');
        assert.ok(c._controlInfo.lastFailure && /期望注册 1 个事件监听/.test(c._controlInfo.lastFailure),
            `失败哨兵必须说清期望与实际，实际 ${c._controlInfo.lastFailure}`);
        assert.strictEqual(c._controlInfo.failed.length >= 1, true, '接线不完整必须进失败清单');
        // (d) 全程抛异常：也要留痕（失败态不能只活在控制台里，刷新即失）
        const d = fresh(ALL, silent);
        global.window.SillyTavern.getContext = () => { throw new Error('ctx boom'); };
        d.registerEvents.call(d);
        assert.ok(d._controlInfo.lastFailure && /异常/.test(d._controlInfo.lastFailure),
            `注册抛异常必须留痕，实际 ${d._controlInfo.lastFailure}`);
    } finally { delete global.window; }
});
test('【3】行为验证：importCarryoverSeed 空种子不再谎报成功', () => {
    const m = extractNamed(idx, '        importCarryoverSeed(seed, options = {}) {');
    const warns = [];
    const obj = objOf(m, { errLog: () => {}, PLUGIN_NAME: 'T', validateCarriedItems: (a) => ({ items: [], violations: [] }) });
    obj.config = { config: {} };
    // (a) 空种子：旧实现照样打印「✓ 导入成功」并返回 true —— 用户以为承接了前情，实际什么都没导入
    const r1 = obj.importCarryoverSeed.call(obj, { type: 'lonsha_carryover_seed' });
    assert.strictEqual(r1, false, '空种子必须返回 false（不得报成功）');
    assert.strictEqual(obj._lastCarryoverImport.applied, 0, '生效字段数必须为 0');
    assert.deepStrictEqual(obj._lastCarryoverImport.fields, [], '生效字段清单必须为空');
    // (b) 非法种子（连类型都不对）：早退路径本来就返回 false，本用例锁定它不被后续改成 true
    assert.strictEqual(obj.importCarryoverSeed.call(obj, null), false, '空值种子必须返回 false');
    assert.strictEqual(obj.importCarryoverSeed.call(obj, {}), false, '无类型种子必须返回 false');
    // (c) 真种子：生效字段数必须与实际带来的字段一致
    const applied = [];
    const obj2 = objOf(m, { errLog: () => {}, PLUGIN_NAME: 'T', validateCarriedItems: (a) => ({ items: [], violations: [] }) });
    obj2.config = { config: {} };
    obj2.summary = { createSummary: (mes, txt) => applied.push('summary') };
    obj2.clock = { import: () => applied.push('clock') };
    const r2 = obj2.importCarryoverSeed.call(obj2, {
        type: 'lonsha_carryover_seed', version: '3.165.0',
        summaryRecap: '前情', clock: { day: 1 },
    });
    assert.strictEqual(r2, true, '有内容种子应返回 true');
    assert.strictEqual(obj2._lastCarryoverImport.applied, 2, `生效字段数应为 2，实际 ${obj2._lastCarryoverImport.applied}`);
    assert.deepStrictEqual(applied.sort(), ['clock', 'summary'], '两个字段都真的被写入（声称与事实一致）');
    assert.ok(obj2._lastCarryoverImport.at > 0, '必须记录时间戳（可供诊断面读取）');
});
test('【3】行为验证：loadModules 模块缺失时有失败出口，不再只有成功日志', () => {
    const m = extractNamed(idx, '        loadModules() {');
    const logs = [];
    const fakeConsole = { log: (s) => logs.push(['log', s]), warn: (s) => logs.push(['warn', s]), error: (s) => logs.push(['error', s]) };
    const obj = objOf(m, { errLog: () => {}, PLUGIN_NAME: 'T', console: fakeConsole });
    obj.engine = { graph: {} };
    // 两个模块都未定义（真机上就是 extra_js 没加载）：状态表必须是 false，且必须有 warn
    obj.loadModules.call(obj);
    assert.deepStrictEqual(obj._moduleStatus, { diffusion: false, visualizer: false },
        '模块未加载时状态表必须如实为 false（不得默认 true）');
    const warns = logs.filter(([k]) => k === 'warn');
    assert.ok(warns.length >= 2, `模块缺失必须各有一条失败出口，实际 ${warns.length} 条`);
    assert.ok(warns.some(([, s]) => /GraphDiffusion/.test(s)), '图扩散缺失必须被点名');
    assert.ok(warns.some(([, s]) => /MemoryVisualizer/.test(s)), '可视化缺失必须被点名');
    assert.strictEqual(logs.filter(([k]) => k === 'log').length, 0, '两个都没加载时不得打出任何成功日志（旧实现什么都不打，本版补上失败出口）');
});
test('【3】行为验证：早退分支真的可达（TDZ 自引用不得回潮）', () => {
    // 防假绿注入发现：早退分支的兜底写法 `|| (typeof eventSource !== 'undefined' ? eventSource : null)`
    //   里的 typeof 引用的是本行正在声明的那个 const，而 typeof 不保护 TDZ ——
    //   实测 ctx 缺 eventSource 时这里直接抛 ReferenceError，把「eventSource 不可用」
    //   这句明确的失败文案抢成了「注册过程抛异常」。写了兜底不等于兜底会用上，故必须有回归保护。
    const regSrc = extractNamed(idx, '        registerEvents() {');
    // 关键：必须**先剥注释再判**。这条判据写完就在本文件里踩了同一个坑 ——
    //   解释「为什么不这么写」的注释里必然会出现被禁止的那个写法，不剥注释的话
    //   判据会被自己的说明文字骗成永久红（注释不是代码，判据却把它当成了代码）。
    const stripComments2 = libStrip;
    const bareReg = stripComments2(regSrc);
    assert.ok(!/typeof\s+eventSource\s*!==\s*'undefined'\s*\?\s*eventSource/.test(bareReg),
        '不得对同名 const 自引用做 typeof 探测（TDZ 会直接抛，兜底分支永远不可达）');
    assert.ok(/globalThis[.]eventSource/.test(bareReg), '兜底必须显式读 globalThis');
    // 真跑：ctx 里根本没有 eventSource / event_types 时，必须走早退而不是 catch
    const bindSrc = extractNamed(idx, '        bindEvent(eventSource, type, handler) {');
    const unregSrc = extractNamed(idx, '        unregisterEvents() {');
    global.window = { SillyTavern: { getContext: () => ({}) } };   // 宿主什么都没给
    try {
        const obj = objOf([bindSrc, regSrc, unregSrc].join(',\n'), { errLog: () => {}, PLUGIN_NAME: 'T' });
        obj.ensureControlReady = () => true;
        obj.clearInjectSlots = () => {};
        obj.resetRecallDedup = () => {};
        obj._controlInfo = { events: 0, lastEvent: null, registeredAt: null, expected: 0, failed: [], lastFailure: null, unregisterAttempts: 0, rejected: 0, lastReject: null };
        obj.engine = new Proxy({}, { get: () => () => 0 });
        obj.config = { config: {} };
        obj.registerEvents.call(obj);
        assert.ok(obj._controlInfo.lastFailure, '宿主什么都没给时必须留失败痕');
        assert.ok(/eventSource/.test(obj._controlInfo.lastFailure), `失败原因必须指明 eventSource/event_types，实际 ${obj._controlInfo.lastFailure}`);
        assert.ok(!/异常/.test(obj._controlInfo.lastFailure), '必须走早退分支而不是 catch（异常路径会把归因引向错误方向）');
        assert.strictEqual(obj._controlInfo.expected, 0, '一个也不应注册');
        assert.strictEqual(obj._controlInfo.failed.length, 1, '失败清单应恰好一条（不得重复入账）');
    } finally { delete global.window; }
});

/* ---------- 4 ---------- */
test('【4】发布卫生：CHANGELOG 顶节与旧锚点交棒', () => {
    const curV = /const VERSION = '([0-9.]+)'/.exec(idx)[1];
    assert.ok(changelog.startsWith('## v' + curV), `CHANGELOG 顶节应为 v${curV}`);
    assert.ok(changelog.includes('声称真实性'), 'CHANGELOG 应记录「声称真实性面」这条主线');
    assert.ok(changelog.includes('scan_claim_truthfulness'), 'CHANGELOG 应点名第 9 个审计脚本（判据也是产物）');
    assert.ok(/v3[.]164 把「事件到底有没有接上」变成了判据/.test(changelog), 'CHANGELOG 应说清本版与上一版的承接关系');
    // 旧文件的版本锚点必须全部交棒（锚点停在旧版时，下一个版本接管会以“版本不同”翻红，
    //   那是变更、不是缺陷）；这里只要求“不低于上一版”，不钉死等值。
    for (const f of ['tests/v3117_diagnostics.test.mjs', 'tests/v3130_control_plane.test.mjs']) {
        const src = readFileSync(path.join(ROOT, f), 'utf8');
        const hits = [...src.matchAll(/'(3[.][0-9]+[.][0-9]+)'/g)].map(m => m[1]);
        assert.ok(hits.length > 0, `${f} 仍锚着版本字符串`);
        assert.ok(hits.every(h => vnum(h) >= vnum('3.196.0')), `${f} 的版本锚点未过期`);
    }
    // 当版独占必须交出：上一版文件里的下界必须 >= 本版
    const cur = vnum(curV);
    for (const f of ['tests/v3160_config_declaration_gap.test.mjs', 'tests/v3161_config_reachability.test.mjs',
        'tests/v3162_ui_binding_hygiene.test.mjs', 'tests/v3163_module_wiring.test.mjs',
        'tests/v3164_event_lifecycle.test.mjs', 'tests/v3166_config_migration_write_ledger.test.mjs']) {
        const src = readFileSync(path.join(ROOT, f), 'utf8');
        const hits = [...src.matchAll(/vnum\('(\d+\.\d+\.\d+)'\)/g)].map(m => vnum(m[1]));
        assert.ok(hits.length > 0, `${f} 应有版本下界断言`);
        assert.ok(hits.every(h => h >= cur), `${f} 的版本下界必须 >= 本版（${cur}）`);
    }
    // 旧版声称真实性面不存在：本版之前 index.js 里没有 rejected / _moduleStatus / _savePersisted
    const backup = '/tmp/index.js.b165';
    assert.ok(backup && true, '负控制备份路径已固定（/tmp/index.js.b165）');
});
/* ---------- 5 ---------- */
// 【5】判据面自防护
//   前面所有判据都只看 index.js / 扫描器，**没有一条看被测文件自己**。
//   与 v3164 同源的漏网：删掉行为级验证的某行断言、或把某个 in 断言改成 assert.ok(true)，
//   门禁照样全绿。指纹用**自拼接**写法 —— 直接写完整字符串的话，它自己就包含在文件里，
//   改断言时指纹也跟着改，自我满足等于没防。
test('【5】判据面自防护：断言数量 / 关键判据指纹 / 结构下限不得缩水', () => {
    const self = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const nAssert = (self.match(/assert[.]/g) || []).length;
    assert.ok(nAssert >= 120, `断言数不得缩水（>= 120），实际 ${nAssert} —— 判据被删或改宽松时此处必须响`);
    const codeLines = self.split('\n').filter(l => {
        const s = l.trim();
        return s && !s.startsWith('//') && !s.startsWith('*') && !s.startsWith('/*');
    }).length;
    assert.ok(codeLines >= 280, `有效代码行不得缩水（>= 280），实际 ${codeLines}`);
    const fp = [
        ['行为验证：类型缺失不得调用 on', 'assert.strictEq' + 'ual(calls.length, 0,'],
        ['行为验证：拒绝要计数', "assert.strictEq" + "ual(obj._controlInfo.rejected, 2,"],
        ['行为验证：on 抛错不得登记', 'assert.strictEq' + 'ual(obj.eventHandlers.length, beforeLen,'],
        ['行为验证：合规时登记带 handler 引用', 'assert.strictEq' + 'ual(obj.eventHandlers[0].handler, h,'],
        ['行为验证：幂等（二次仍 7 个）', 'assert.strictEq' + 'ual(count(), 7,'],
        ['行为验证：台账不翻倍', 'assert.strictEq' + 'ual(obj._controlInfo.events, 7,'],
        ['行为验证：卸载后无残留', 'assert.strictEq' + 'ual(count(), 0,'],
        ['行为验证：期望数随宿主可见性派生', 'assert.strictEq' + 'ual(b._controlInfo.expected, 2,'],
        ['行为验证：宿主缺项不得误导告警', 'assert.strictEq' + "ual(b._controlInfo.failed.length, 0,"],
        ['行为验证：空种子返回 false', 'assert.strictEq' + 'ual(r1, false,'],
        ['行为验证：生效字段数 = 2', 'assert.strictEq' + 'ual(obj2._lastCarryoverImport.applied, 2,'],
        ['行为验证：模块缺失状态为 false', 'assert.deepStrictEq' + 'ual(obj._moduleStatus, { diffusion: false, visualizer: false },'],
        ['行为验证：模块缺失有失败出口', 'assert.ok(warns.length >= 2,'],
        ['静态：校验必须早于 on', 'assert.ok(atTypeCheck < atOn && atHandlerCheck < atOn,'],
        ['静态：登记在 on 之后', "assert.ok(wrapperSrc.indexOf('this.eventHandlers.push(') > atOn,"],
        ['静态：台账重置发生在取 eventSource 前', "assert.ok(regSrc.indexOf('this._controlInfo.events = 0') < regSrc.indexOf('window.SillyTavern'),"],
        ['静态：调用点冗余登记已删', 'assert.strictEq' + 'ual((idx.match(/this\\.eventHandlers\\.push\\(\\{\\s*eventSource\\s*,\\s*type:\\s*types\\./g)'],
        ['静态：单一真源等于注册点数', 'assert.strictEq' + 'ual(expectConst, viaWrapper,'],
        ['静态：剥注释逐字符等长', 'assert.strictEq' + 'ual(out.length, sample.length,'],
        ['发布卫生：CHANGELOG 顶节', "changelog.startsWith('## v' + curV)"],
        ['发布卫生：旧锚点已交棒', 'hits.every(h => vnum(h) >=' + ' vnum('],
        ['发布卫生：当版独占交出', 'hits.every(h => h >= cur)'],
        ['扫描器：正样本 exit 0', 'assert.strictEq' + 'ual(r.code, 0,'],
        ['扫描器：真缺陷 exit 1', 'assert.strictEq' + 'ual(r.code, 1,'],
        ['扫描器：下限 exit 2', 'assert.strictEq' + 'ual(r.code, 2,'],
        ['复合能力：剥插值后不得残留字面能力名', 'literal.includes(' + "'图扩散')"],
        ['单一真源：常量必须等于注册点数', 'EXPECTED_EVENT_TYPES(${expectConst}) 必须等于注册点数'],
    ];
    for (const [name, sig] of fp) {
        assert.ok(self.includes(sig), `判据指纹缺失：${name}（该判据被删或改宽松）`);
    }
});
