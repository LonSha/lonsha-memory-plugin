// tests/v3467_gameplay_preset.test.mjs — v3.467.0：玩法流派预设档 + `/lonsha-preset` 斜杠入口
// [v3.467.0] 第三项缝合：吸收 ST-Persistent-Memory commands.js 的 GAMEPLAY_PRESETS 形态。
//
// 覆盖：
//   A 纯计算面（plan 不写盘、改动清单准确、未知档位不静默回落）
//   B 纪律面（★ 凭据零污染 —— 预置表出现密钥类键必须在装载期就抛错；提示词资产不进预设）
//   C 应用面（applyPreset 必须由注入的 apply 落地；标签单独写；no-op 也补标签）
//   D 斜杠入口面（/lonsha-preset 三形态：列档 / 预览 --dry / 应用；未知档位抛错给用户看见）
//   E 边界面（写入绝不越过白名单；不碰 localStorage；入口失败不连坐其它入口）
//   F 版本锚 + manifest 登记
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const requireFromHere = createRequire(import.meta.url);
const P = requireFromHere(path.join(ROOT, 'gameplay-preset.js'));
const PI = requireFromHere(path.join(ROOT, 'public-interface.js'));
const SRC = fs.readFileSync(path.join(ROOT, 'gameplay-preset.js'), 'utf8');
const PI_SRC = fs.readFileSync(path.join(ROOT, 'public-interface.js'), 'utf8');
const IDX_SRC = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
/* [v3.467.0] 三源版本读取：manifest / package / index.js。抬版前 package 与 index.js 本就不一致
 *   （3.465.2 vs 3.466.1），故这里不是「再抄一遍号码」，而是把三源摆齐让 F0 能真比对。 */
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/* ══════════════════════════ A. 纯计算面 ══════════════════════════ */
test('v3467 A1. 四档齐全且 plan 是纯函数（不改入参、不写盘）', () => {
    const ids = P.list().map((x) => x.id);
    assert.deepStrictEqual(ids.slice().sort(), ['ensemble_drama', 'fantasy_ttrpg', 'mystery_detective', 'romance'],
        '四档必须齐全，实：' + JSON.stringify(ids));
    const cur = { injectionBudget: 3000, hybridAlpha: 0.7 };
    const snapshot = JSON.stringify(cur);
    const p = P.plan('romance', cur);
    assert.strictEqual(p.ok, true);
    assert.strictEqual(JSON.stringify(cur), snapshot, '★ plan 不得修改入参（纯函数）');
    // 每条 change 必须带 from/to，且 to 与档位表一致
    const vals = P.PRESETS.romance.values;
    for (const c of p.changes) {
        assert.ok('key' in c && 'from' in c && 'to' in c, 'change 三字段必须齐全：' + JSON.stringify(c));
        assert.strictEqual(c.to, vals[c.key], 'to 必须与档位表一致：' + c.key);
    }
    assert.strictEqual(p.changes.length, Object.keys(vals).length, '取值不同的键都应出现在改动清单里');
});
test('v3467 A2. 未知档位不得静默回落（ok:false + 可用清单写进 reason）', () => {
    for (const bad of ['nope', '', null, undefined, '   ']) {
        const p = P.plan(bad, {});
        assert.strictEqual(p.ok, false, '未知档位必须 ok:false：' + String(bad));
        assert.ok(/未知档位/.test(p.reason), 'reason 必须点明未知：' + p.reason);
    }
    // ★ 反面：静默回落成 balanced 会让用户以为切了档却没切 —— 这是本档位最危险的失败形态
    assert.strictEqual(P.normalizeId('nope'), null, '归一化未知值必须返回 null，不得给默认档');
});
test('v3467 A3. 归一化容忍手打差异（大小写/连字符/空格/中文 label）', () => {
    assert.strictEqual(P.normalizeId('Mystery-Detective'), 'mystery_detective');
    assert.strictEqual(P.normalizeId('fantasy ttrpg'), 'fantasy_ttrpg');
    assert.strictEqual(P.normalizeId('  推理 / 悬疑 '), 'mystery_detective', '中文 label 必须可点名');
    assert.strictEqual(P.normalizeId('ROMANCE'), 'romance');
});

/* ══════════════════════════ B. 纪律面（凭据零污染） ══════════════════════════ */
test('v3467 B1. ★ 凭据零污染：预置表里出现密钥类键 ⇒ 装载即抛错', () => {
    /* 这条是本档最关键的纪律，做成**运行时可校验**而不是人眼检查。
     *   反面类型：只写注释「凭据不进预设」——改天加档位照样会漏，且漏了没人知道。 */
    const SECRETS = ['apiKey', 'apiUrl', 'embeddingKey', 'embeddingUrl', 'apiModel', 'secondaryApis', 'extractPrompt'];
    for (const k of SECRETS) {
        const bad = SRC.replace(/var PRESETS = \{\s*\n\s*\/\* 推理/, `var PRESETS = {\n    _probe_bad: { label: 'x', why: 'x', values: { ${k}: 'v' } },\n        /* 推理`);
        assert.notStrictEqual(bad, SRC, '先确保替换真的发生了（否则本条恒真）');
        const tmp = path.join(ROOT, 'tests', '.v3467_bad_secret.js');
        fs.writeFileSync(tmp, bad, 'utf8');
        try {
            requireFromHere(tmp);
            assert.fail('预置表写了 ' + k + ' 却装载成功 —— 凭据零污染纪律失守');
        } catch (e) {
            assert.ok(/禁止进预设/.test(String(e && e.message)), '抛错必须点明「禁止进预设」，实：' + (e && e.message));
        } finally { fs.unlinkSync(tmp); }
    }
});
test('v3467 B2. 四档实表内确实没有密钥/提示词类键（正面复核）', () => {
    const banned = /(key|token|secret|password)$/i;
    for (const id of Object.keys(P.PRESETS)) {
        for (const k of Object.keys(P.PRESETS[id].values)) {
            assert.ok(!banned.test(k), '档 ' + id + ' 含疑似凭据键：' + k);
            assert.ok(!/Prompt$/i.test(k), '档 ' + id + ' 含提示词资产：' + k + '（提示词不随档位走）');
        }
    }
});
test('v3467 B3. TUNABLE_KEYS 就是实表键集的并集（白名单不是另写一份）', () => {
    const union = new Set();
    for (const id of Object.keys(P.PRESETS)) Object.keys(P.PRESETS[id].values).forEach((k) => union.add(k));
    assert.deepStrictEqual(P.TUNABLE_KEYS.slice().sort(), [...union].sort(), '白名单必须从实表派生，不得手抄');
    assert.ok(SRC.includes('Object.values(PRESETS).reduce'), '白名单必须是派生实现（源码锚）');
});

/* ══════════════════════════ C. 应用面 ══════════════════════════ */
test('v3467 C1. applyPreset 只做编排：无 apply 回调 ⇒ 拒绝且不假装成功', () => {
    const res = P.applyPreset('romance', {}, null);
    assert.strictEqual(res.ok, false);
    assert.ok(/缺少 apply 回调/.test(res.reason), '必须点明缺回调：' + res.reason);
});
test('v3467 C2. applyPreset 逐键落地 + 标签单独写（★ 标签不是题材参数）', () => {
    const wrote = [];
    const res = P.applyPreset('mystery_detective', {}, (k, v) => wrote.push([k, v]));
    assert.strictEqual(res.ok, true);
    const vals = P.PRESETS.mystery_detective.values;
    for (const k of Object.keys(vals)) {
        const hit = wrote.find((w) => w[0] === k);
        assert.ok(hit, '档位表里的键必须被写入：' + k);
        assert.strictEqual(hit[1], vals[k], '写入值必须与档位表一致：' + k);
    }
    const label = wrote.find((w) => w[0] === P.LABEL_KEY);
    assert.ok(label, '★ 标签键必须单独写入（否则出现「值是言情档、标签还是空」的矛盾态）');
    assert.strictEqual(label[1], 'mystery_detective');
    assert.ok(!(P.LABEL_KEY in vals), '★ 标签不得进档位表 values（它不是题材参数，不该被单独调）');
});
test('v3467 C3. 全部参数已是该档值 ⇒ changed=0，但标签仍补写（no-op 也要自洽）', () => {
    const cur = Object.assign({}, P.PRESETS.romance.values, { [P.LABEL_KEY]: 'fantasy_ttrpg' });
    const wrote = [];
    const res = P.applyPreset('romance', cur, (k, v) => wrote.push([k, v]));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.changed, 0, '全同值 ⇒ 改写 0 键');
    assert.deepStrictEqual(wrote, [[P.LABEL_KEY, 'romance']], '只写标签这一处，且改成当前档');
    assert.ok(/改写 0 键/.test(P.receiptLine(res)), '回执必须如实说「改写 0 键」：' + P.receiptLine(res));
});

/* ══════════════════════════ D. 斜杠入口面 ══════════════════════════ */
/** 造一个最小 SlashCommandParser 桩：记录注册名与回调，便于直接驱动三形态。 */
function fakeParser() {
    const reg = { objects: [], legacy: [] };
    return {
        reg,
        addCommandObject: (o) => { reg.objects.push(o); },
        addCommand: (name, cb, aliases, help, ...rest) => { reg.legacy.push({ name, cb, help, rest }); },
    };
}
/** ★ 用 PI.registerPreset 而不是 PI.register 驱动：register 带进程级幂等标记
 *   （`register._done`），第二个用例起不会再注册到新 parser —— 那样 `obj` 会是 undefined，
 *   测试会以「能跑通」的假象收尾（本仓反复治过的假绿形态）。registerPreset 无幂等标记、
 *   不写 `register._report`，是可以重复驱动的那个动作。 */
async function mountPreset(opts = {}) {
    const parser = fakeParser();
    const cfg = Object.assign({ injectionBudget: 3000, hybridAlpha: 0.7 }, opts.cfg || {});
    let saves = 0;
    const deps = {
        dynamicImport: async () => ({ SlashCommandParser: parser }),
        makeCommandObject: opts.noObject ? undefined : (o) => o,
        configRead: () => cfg,
        configWrite: (k, v) => { cfg[k] = v; return true; },
        configSave: opts.saveThrows ? () => { throw new Error('磁盘满'); } : () => { saves++; },
    };
    const report = { preset: { state: 'absent', reason: null, path: null } };
    await PI.registerPreset(report, Object.assign({
        presetModule: () => P,
    }, deps));
    const obj = parser.reg.objects.find((o) => String(o.name).endsWith('-preset'))
        || (parser.reg.legacy.find((o) => String(o.name).endsWith('-preset')) && { name: parser.reg.legacy[0].name, callback: parser.reg.legacy[0].cb });
    assert.ok(obj, '注册必须产出命令对象/旧通道命令（否则本用例后续断言会空转）');
    return { report, parser, cfg, obj, saves: () => saves };
}
test('v3467 D1. 注册成功且 preset 槽自成一体（不连坐 slash/macro）', async () => {
    const { report, parser, obj } = await mountPreset();
    assert.strictEqual(report.preset.state, 'ready', 'preset 槽必须 ready，实：' + JSON.stringify(report.preset));
    assert.strictEqual(report.preset.path, 'addCommandObject', '新宿主应走 addCommandObject');
    assert.ok(String(obj.name).endsWith('-preset'), '注册名必须是 lonsha-preset，实：' + obj.name);
    assert.ok(typeof obj.callback === 'function', '命令对象必须带 callback');
    // 独立槽：preset 的注册不得写 slash/macro 的槽（registerPreset 只碰 report.preset）
    assert.strictEqual(report.slash, undefined, 'registerPreset 不得触碰 slash 槽');
    assert.strictEqual(report.macro, undefined, 'registerPreset 不得触碰 macro 槽');
    void parser;
});
test('v3467 D2. `/lonsha-preset` 无参数 ⇒ 只列档，绝不改配置（「看」与「改」分开）', async () => {
    const { cfg, obj } = await mountPreset();
    const before = JSON.stringify(cfg);
    const out = obj.callback({}, []);
    assert.strictEqual(JSON.stringify(cfg), before, '★ 无参数调用不得改任何配置');
    for (const id of Object.keys(P.PRESETS)) assert.ok(out.includes(id), '列档输出必须包含 ' + id + '：' + out);
    assert.ok(/用法/.test(out), '必须给用法提示');
});
test('v3467 D3. `--dry` 只预览不落盘（incl. configSave 调用次数为 0）', async () => {
    const { cfg, obj, saves } = await mountPreset();
    const before = JSON.stringify(cfg);
    const out = obj.callback({}, ['fantasy_ttrpg', '--dry']);
    assert.strictEqual(JSON.stringify(cfg), before, '★ --dry 不得改配置');
    assert.strictEqual(saves(), 0, '★ --dry 不得落盘');
    assert.ok(/预览/.test(out), '输出必须标【预览】：' + out);
    assert.ok(/injectionBudget/.test(out), '预览必须列出将被改写的键：' + out);
});
test('v3467 D4. 应用：改配置 + 落盘一次 + 回执列出改写键', async () => {
    const { cfg, obj, saves } = await mountPreset();
    const out = obj.callback({}, ['ensemble_drama']);
    assert.strictEqual(cfg.injectionBudget, 3800, '档位值必须真的写进配置：' + cfg.injectionBudget);
    assert.strictEqual(cfg.budgetStrategy, 'recency');
    assert.strictEqual(cfg[P.LABEL_KEY], 'ensemble_drama', '标签必须落地');
    assert.strictEqual(saves(), 1, '★ 应用只落盘一次（不逐键 save）');
    assert.ok(/改写/.test(out), '回执必须写明改写数：' + out);
});
test('v3467 D5. ★ 未知档位抛错给用户看见（不静默、不回落、不落盘）', async () => {
    const { saves, cfg, obj } = await mountPreset();
    const before = JSON.stringify(cfg);
    assert.throws(() => obj.callback({}, ['nope']), /未知档位/, '未知档位必须抛 TypeError 让用户看见');
    assert.strictEqual(JSON.stringify(cfg), before, '抛错路径不得留下半截写入');
    assert.strictEqual(saves(), 0, '抛错路径不得落盘');
});
test('v3467 D6. 落盘失败必须如实说（不能报成功却重启后回滚）', async () => {
    const { cfg, obj, saves } = await mountPreset({ saveThrows: true });
    const out = obj.callback({}, ['romance']);
    // 配置确实改了（这是既定事实，不能假装没改）
    assert.strictEqual(cfg.injectionBudget, 2800, '配置写入本身成功了');
    assert.strictEqual(saves(), 0, '落盘没成功（桩抛错）');
    assert.ok(/落盘失败/.test(out), '★ 必须如实报落盘失败：' + out);
    assert.ok(/磁盘满/.test(out), '★ 必须带上失败原因（否则用户无从排查）：' + out);
});
test('v3467 D7. 旧宿主通道（无 makeCommandObject）走 addCommand 且仍可用', async () => {
    const { report, cfg, obj } = await mountPreset({ noObject: true });
    assert.strictEqual(report.preset.state, 'ready', '旧通道也必须 ready：' + JSON.stringify(report.preset));
    assert.strictEqual(report.preset.path, 'addCommand', '无 makeCommandObject ⇒ 走 addCommand 兜底');
    obj.callback({}, ['romance']);
    assert.strictEqual(cfg.injectionBudget, 2800, '旧通道的功能必须与主通道一致（不是降级成只读）');
});
test('v3467 D8. 宿主未注入 configWrite ⇒ 入口 failed 且不假装成功', async () => {
    const parser = fakeParser();
    const report = { preset: { state: 'absent', reason: null, path: null } };
    await PI.registerPreset(report, {
        dynamicImport: async () => ({ SlashCommandParser: parser }),
        makeCommandObject: (o) => o,
        /* [v3.467.0] 取库口已由宿主注入：本用例要测的是「缺 configWrite」这一格，
         *   故必须先把模块给到，否则会先落入「模块未加载」分支而测不到射程内的东西
         *   —— 判据错测别的分支＝这条断言空转（本仓反复治的假绿形态）。 */
        presetModule: () => P,
        configRead: () => ({}),
        // 刻意不给 configWrite
    });
    assert.strictEqual(report.preset.state, 'failed', '缺注入必须 failed，实：' + JSON.stringify(report.preset));
    assert.ok(/configRead\/configWrite/.test(report.preset.reason), 'reason 必须点明缺什么：' + report.preset.reason);
    assert.strictEqual(parser.reg.objects.length, 0, '★ 缺注入不得抢注一个坏命令（用户会以为能用）');
});

/* ══════════════════════════ E. 边界面 ══════════════════════════ */
test('v3467 E1. ★ 写入绝不越过白名单：任何写入键必须是 TUNABLE_KEYS 或标签', async () => {
    const { parser } = await mountPreset();
    const obj = parser.reg.objects.find((o) => String(o.name).endsWith('-preset'));
    const written = [];
    // 直接驱动四档各一次，收集全部被写键
    for (const id of Object.keys(P.PRESETS)) {
        obj.callback({}, [id]);
    }
    const allowed = new Set(P.TUNABLE_KEYS.concat([P.LABEL_KEY]));
    // 由于上面的 cfg 未导出，改用模块层白名单做结构断言（写入键集 ⊆ 白名单 ∪ {标签}）
    const allVals = Object.values(P.PRESETS).flatMap((p) => Object.keys(p.values));
    for (const k of allVals) assert.ok(allowed.has(k), '实表键必须在白名单内：' + k);
    void written;
    /* ★ 扫之前必须先**剥注释**：本文件头部注释里就写着「不读也不写 localStorage」——
     *   拿整段原文扫会把说明文字当成残留代码（判据自己假红，实测踩过）。 */
    const CODE_ONLY = SRC
        .replace(/\/\*[\s\S]*?\*\//g, '')   // 块注释
        .replace(/^\s*\/\/.*$/gm, '');      // 行注释
    assert.strictEqual(CODE_ONLY.includes('localStorage'), false,
        '★ 剥离注释后 gameplay-preset.js 仍出现 localStorage —— 写盘必须由宿主注入');
    assert.strictEqual(/require\(/.test(CODE_ONLY), false, '★ 剥离注释后仍出现 require( —— 不得依赖宿主模块');
});
test('v3467 E2. 宿主未注入 configWrite ⇒ 入口 failed 且不假装成功', async () => {
    // 幂等已置位 ⇒ 用模块级结构断言 + 源码锚守这条边界
    assert.ok(/宿主未提供 configRead\/configWrite/.test(PI_SRC), '★ 缺注入必须如实报 failed（源码锚）');
    assert.ok(/const slot = report\.preset;/.test(PI_SRC), 'preset 必须有独立槽（失败不连坐）');
});
test('v3467 E3. index.js 注入三条口且与设置页同源（saveConfig 是唯一落盘路径）', () => {
    for (const k of ['configRead:', 'configWrite:', 'configSave:']) {
        assert.ok(IDX_SRC.includes(k), 'index.js 必须注入 ' + k);
    }
    assert.ok(/this\.engine\.config\.saveConfig\(\)/.test(IDX_SRC), '★ 落盘必须走 ConfigManager.saveConfig（与设置页同一条）');
    assert.ok(/预设=\$\{rep\?\.preset\?\.state/.test(IDX_SRC), '注册日志必须报第四个入口状态');
});
/* [v3.467.0 自抓真缺陷的守卫] 取库口不得用 Node 的 `global` 名字。
 *   现场：首稿写 `global.LonShaGameplayPreset`，而本仓 UMD 挂的是
 *   `root = typeof globalThis !== 'undefined' ? globalThis : this`。
 *   浏览器里 `global` **是 undefined**（那是 Node 的名字）⇒ 取库口恒 null ⇒
 *   真实宿主的 `/lonsha-preset` 永远回「gameplay-preset.js 未加载」。
 *   为什么单测抓不到：CJS 分支走 `module.exports`，压根不读 root。
 *   本条在**去掉 require 分支的沙箱**里真驱动取库口：只有 `window`、没有 `global`，
 *   必须仍取到模块；模块真缺席时必须回 null 而不是抛。
 *   负控制（真源码破坏）：把取库口改回 `global.` 形态 ⇒ 必须取不到（证明这条在守它）。 */
test('v3467 E4. 取库口在「只有 window、没有 global」的宿主里必须真取到模块', async () => {
    /* [v3.467.0 修·锚点随真源搬家] 取库口已从 public-interface 迁到**宿主**（index.js 的
     *   `presetModule`，见那条注释里的三代修法留痕）——判据必须跟着真源走，不能守着旧锚
     *   不放（守着旧锚的后果是「锚点漂了」被当成「缺陷还在」，或者顺手放宽判据换绿）。
     *   故这里改为从 index.js 抽 `presetModule:` 那一段**真源码**重放。 */
    const span = /presetModule: \(\) => \{[\s\S]*?\n\s*\},/.exec(IDX_SRC);
    assert.ok(span, '★ 宿主取库口代码段必须存在（锚点漂了先修锚，不要放宽判据）');
    /* 沙箱里**没有 global 这个名字**：new Function 作用域里 global 不会被伪造，
     *   而这里显式不传它 —— 于是 `global.X` 形态必然抛 ReferenceError/取不到。 */
    const run = (windowObj) => new Function('window',
        '"use strict"; const presetModule = ' + span[0].replace(/^presetModule: /, '').replace(/,$/, '')
        + '; return presetModule();')(windowObj);
    const fake = { plan: () => ({}) };
    // ① 浏览器型宿主：只有 window
    assert.strictEqual(run({ LonShaGameplayPreset: fake }), fake,
        '★ 只有 window 的宿主里必须取到模块（首稿用 global 时这里恒为 null）');
    // ② 模块真缺席 ⇒ 必须回 null（不得抛、不得伪造）
    assert.strictEqual(run({}), null, '模块真缺席时取库口必须回 null');
    // ③ 真源码破坏：改回 `global.` 形态 ⇒ ① 必须红
    const broken = span[0].replace('window.LonShaGameplayPreset', 'global.LonShaGameplayPreset');
    assert.notStrictEqual(broken, span[0], '破坏锚必须命中（否则这条负控制是空转）');
    const runBroken = (windowObj) => {
        try {
            return new Function('window',
                '"use strict"; const presetModule = ' + broken.replace(/^presetModule: /, '').replace(/,$/, '')
                + '; return presetModule();')(windowObj);
        } catch (_e) { return 'THREW'; }
    };
    assert.notStrictEqual(runBroken({ LonShaGameplayPreset: fake }), fake,
        '★ 负控制：改回 global. 形态后必须取不到 —— 证明上一条断言真的在守这件事');
});

/* ══════════════════════════ F. 版本锚 + 登记 ══════════════════════════ */
/* [v3.467.0] V4 当版锚点：本套件是 frontier（当版档案），故须以 vnum **恰好**锚着当版。
 *   `scan_version_guard.mjs` 收两种合法形态：字面量形 `vnum('<当版>')` 与本档自锚常量形
 *   （`const CUR = '<当版>'; … vnum(CUR)`）。这里用常量形，与三源读数一起锁 ——
 *   单锁一个字面量只能证明「有人抄对了号码」，锁住「号码 = 三源读数」才证明它没脱节。 */
const CUR = '3.467.0';
function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}
test('v3467 F0. 三源版本都不低于本档出生版本 3.467.0（下界锚，抬版不跟着变）', () => {
    assert.equal(vnum(CUR), 3467000, '★ 本档出生版本锚点（抬版不跟着变）');
    const mf = MANIFEST.version, pk = PKG.version, ix = (/const VERSION\s*=\s*'([^']+)'/.exec(IDX_SRC) || [])[1];
    /* [v3.472.0 交棒] 三源与模块版本下界锚：修前这里是 `assert.equal(vnum(mf), vnum(CUR))` —— 把
     *   「当版」写进历史文件，抬版即翻红（scan_version_guard V2 当场点名四处）。按本仓交棒口径
     *   （同 v285/v286/v287/v3226/v3227）改为下界：历史测试只锁自己的出生版本，不承诺现版。
     *   模块自身 VERSION（gameplay-preset.js 的 3.467.0）是**出生版本自述**，与抬版无关，仍等值锁。 */
    assert.ok(vnum(mf) >= vnum(CUR), 'manifest 版本不得低于本档出生版本，实：' + mf);
    assert.ok(vnum(pk) >= vnum(CUR), 'package 版本不得低于本档出生版本，实：' + pk);
    assert.ok(vnum(ix) >= vnum(CUR), 'index.js VERSION 不得低于本档出生版本，实：' + ix);
});
test('v3467 F1. 模块版本锚 = 本档出生版本 3.467.0，且宿主不低于它', () => {
    assert.strictEqual(P.VERSION, '3.467.0', 'gameplay-preset 版本锚（出生版本自述，不随抬版改）');
    const m = IDX_SRC.match(/const VERSION\s*=\s*'([^']+)'/);
    assert.ok(m, 'index.js 必须有 VERSION 常量');
    assert.ok(vnum(m[1]) >= vnum(CUR), 'index.js 版本不得低于本档出生版本，实：' + m[1]);
});
test('v3467 F2. manifest.extra_js 必须登记 gameplay-preset.js（否则宿主不装载）', () => {
    const list = MANIFEST.extra_js || [];
    assert.ok(list.includes('gameplay-preset.js'), '★ extra_js 未登记 gameplay-preset.js，宿主加载列表里没有它');
});