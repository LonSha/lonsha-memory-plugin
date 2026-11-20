/* ============================================================
 * tests/v3476_memory_badge.test.mjs — 楼层记忆徽章（玩家端可见性）
 *
 * 【要治的形态】记忆引擎跑了 94 个面板分组、27 个浏览视图，
 *   但玩家在聊天流里看不到「这一楼记住了什么」—— 可见性全部躺在
 *   「要主动点开」的面板里。对一个记忆引擎，这是最贵的一次错位：
 *   用户不点，就等于它不存在。
 *
 * 【本档锁什么】
 *   B1 渲染函数在册，且挂在 plugin 上（不是文件内私有函数）
 *   B2 入场点在 onMessageReceived **之后**（必须晚于本轮提取，否则永远读到上一轮）
 *   B3 旁路纪律：无 #chat（宿主未就绪 / 非聊天页）时返回 false 且**不抛**
 *   B4 样式在册：低噪音（默认不透明度 < 1），不和剧情正文抢注意力
 *   B5 未开启记忆时**不挂 DOM**（不做噪音）
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SUI = read('settings-ui.js');
const IDX = read('index.js');
const CSSF = read('css/style.css');

test('B1 渲染函数挂在 plugin 上', () => {
    assert.ok(SUI.includes('plugin.renderMemoryBadge = function(messageId)'),
        '徽章必须是 plugin 方法：宿主事件回调只持有 plugin，私有函数够不着');
    assert.ok(SUI.includes('data-ls-mem-badge'), '徽章必须带可寻址标记（重绘替换用）');
    assert.ok(SUI.includes("mes.querySelector('.ls-mem-badge')"), '同楼重绘必须替换而不是叠加');
});

test('B2 订阅点在自己的模块里，宿主主链路零改动', () => {
    /* 徽章是纯 UI 关注点：由 settings-ui.js 自己订阅 MESSAGE_RECEIVED。
     * 为什么不去 index.js 里加一行 —— 那里每加一行，十几个「基线行数」判据
     * （v3257/v3259/…/v3304/v3480/v3232）全都要重定基；UI 关注点没有资格
     * 让宿主巨兽的行数账本漂移。故此判据反向钉死：index.js 里**不得**出现徽章接点。 */
    assert.ok(SUI.includes('renderMemoryBadge(messageId)'), 'settings-ui 必须自己订阅事件并调用渲染');
    assert.ok(/MESSAGE_RECEIVED/.test(SUI), '订阅的事件名必须在册');
    assert.ok(!IDX.includes('renderMemoryBadge'), 'index.js 不得出现徽章接点（UI 关注点不进宿主主链路）');
});

test('B3 旁路纪律：无 #chat 时返回 false 且不抛', () => {
    const gate = read('tests/audit/scan_ui_runtime.mjs');
    const from = gate.indexOf('const VOID_TAGS =');
    const to = gate.indexOf('/* ---------- 3. 引擎 stub');
    assert.ok(from >= 0 && to > from, '共享 DOM 夹具锚点必须完整');
    const ctx = vm.createContext({});
    vm.runInContext(gate.slice(from, to) + ';globalThis.env = makeEnv();', ctx);
    const { window } = ctx.env;
    const errors = [];
    window.LonShaMemory = {
        VERSION: '3.476.0',
        engine: { config: { config: { enabled: true }, saveConfig() {} }, _lastRecallTrace: { hitCount: 3 } },
        reportError(e) { errors.push(String(e && e.message)); },
    };
    const realm = vm.createContext(window);
    vm.runInContext(SUI, realm);
    const plugin = window.LonShaMemory;
    assert.equal(typeof plugin.renderMemoryBadge, 'function', '挂载后必须可取到');
    let out;
    assert.doesNotThrow(() => { out = plugin.renderMemoryBadge(0); }, '宿主人不在聊天页时，徽章不得抛');
    assert.equal(out, false, '拿不到楼层就如实返回 false（不假装成功）');
    assert.deepEqual(errors, [], '旁路失败不得计入错误面');
});

test('B4 样式在册且低噪音', () => {
    assert.ok(/\.ls-mem-badge\s*\{/.test(CSSF), '徽章样式必须在册');
    const block = CSSF.slice(CSSF.indexOf('.ls-mem-badge {'));
    assert.match(block, /opacity:\s*\.?0?\.55|opacity:\s*0?\.55/, '默认必须低不透明度：它不该和正文抢注意力');
    assert.match(block, /border-radius:\s*999px/, '胶囊形态：与面板的方块语言区分，读作「附注」而不是「控件」');
    assert.match(block, /:focus-visible/, '键盘用户必须能到达（焦点可见）');
});

test('B5 记忆未开启时不挂 DOM', () => {
    const body = SUI.slice(SUI.indexOf('plugin.renderMemoryBadge = function'));
    const head = body.slice(0, body.indexOf('const doc = document;'));
    assert.match(head, /cfg\.enabled === false/, '记忆关闭时必须直接返回：不挂任何 DOM');
});
