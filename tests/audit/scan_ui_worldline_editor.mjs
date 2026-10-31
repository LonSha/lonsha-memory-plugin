/* ============================================================
 * tests/audit/scan_ui_worldline_editor.mjs —— 世界线跳跃表编辑器 + 实时读数门（零依赖）[v3.429.0 · L12-O8]
 * ------------------------------------------------------------
 * 为什么存在（L12-O8 的真实现场，读码可复算）：
 *   v3.425.0 把内核主键从「变动率」换成「纪元 = 层标记@切换楼层」，v3.426.0 补上「当前纪元
 *   自动推进」——两版都把**口径**改对了。但卡作者要落地仍得读 CHANGELOG 才知道有五个键，
 *   `worldlineJumps` 只有一个裸 textarea：写错一行，闸会**静默丢掉那一行**（`_worldlineState`
 *   只给结果，从不告诉人哪一行没生效）。于是「口径对了」与「作者摸得到」之间差一整块产品面。
 *
 * 本门判什么（每条都要有非零下限，否则抽到 0 会以全绿通过）：
 *   X1 面自证：设置面板真落 DOM，编辑器五个挂点（容器/行区/读数/坏行区/加行键）全部在场；
 *   X2 **解析单源**：面板拿到的坏行清单与闸消费的行必须出自同一段解析 ——
 *      面板说「这行没问题」而闸把它丢掉，就是本仓治过的「两套真源」；
 *   X3 结构化编辑真操作：加一行 ⇒ 当场标红并点名成因；把格子填满 ⇒ 转好；✕ 真删行；
 *   X4 **实时读数与内核一致**：造三次跳线（含一次回跳）⇒ 读数里的纪元 === 内核 `epochAt` 的纪元
 *      （逐字比对，不比文案）；
 *   X5 **前史三态不同形**：没登记 / 登记了但前史判不了 / 已覆盖 三句不同的话，
 *      且「判不了」**不许**被说成「安全」（这是 L12-O4 同一条纪律的下一次应用）；
 *   X6 保存闭环 + **预览不写配置**：改格子后不点保存 ⇒ 配置一字不动（预览 ≠ 已生效）；
 *      点 `#ls-save` ⇒ 配置等于编辑器序列化结果（一个键仍只有一个控件，通用收集器仍在用）；
 *   X7 fail-closed：`settings-ui.js` 缺失 / 掏空 ⇒ exit 2（没得判 ≠ 通过）。
 *
 * 关键实现细节（勿凭直觉改动）：
 *   ① DOM shim **不复制**：本门从同族门 `scan_ui_interaction.mjs` 切出 shim 段复用，
 *      并要求切点在场（切点漂移 ⇒ exit 2）。复制一份 400 行 shim 等于又造一个「同一个东西两份实现」，
 *      而 shim 与真浏览器的每一处偏差都已经在那份 shim 里被实测修过（checked 翻转 / details 展开 /
 *      `>` 组合器）。本门只借它的**行为**，不重写。
 *   ② `<textarea>` 在 shim 里不把元素内容反射成 value ⇒ settings-ui 必须显式写 `value`。
 *      这是**两条路径都要对**的形态（真浏览器里是同值 no-op），故它不是 shim 缺陷。
 *   ③ 判据一律读**机器可读属性**（`data-wl-readout` / `data-wl-epoch` / `data-wl-why` /
 *      `data-wl-rejects`），不靠文本包含 —— 措辞会变，纪元值与成因码不会。
 *
 * 退出码：0=卫生  1=真缺陷（读数与内核不一致 / 坏行静默 / 预览写配置）  2=结构漂移
 * 边界（与结论一起读）：本门跑在最小 DOM shim 上，拦的是**编辑器逻辑**缺陷；
 *   它不证明宿主 CSS 排版、真机触摸命中、真实 localStorage 跨会话行为 —— 那些只有真浏览器能证。
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';

const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const SHIM_OWNER = path.join(ROOT, 'tests', 'audit', 'scan_ui_interaction.mjs');
const UI = path.join(ROOT, 'settings-ui.js');
const defects = [];
const notes = [];
/* ★ [v3.429.0 自纠] drift 必须先把**已发现**的缺陷吐出来再退出 2。
 *   修前实测（C1 负控制）：破坏解析单源后 X2 已记下「闸消费了 0 条」，
 *   但流程走到 X4 时因为「内核给不出纪元」先 drift 退出 —— 缺陷清单随进程一起丢了，
 *   读门输出的人只看到「结构漂移」，看不到**真正**坏在哪。
 *   那正是本仓最贵的形态：门红了，红的原因不是它在守的那条。 */
const drift = (m) => {
    if (defects.length) {
        console.error('[ui-worldline] 退出前已检出 ' + defects.length + ' 处缺陷：');
        defects.forEach((d) => console.error('  ✗ ' + d));
    }
    console.error('[ui-worldline] ' + m + '（结构漂移）');
    process.exit(2);
};

/* ---------- shim 借用（切点漂移即 fail-closed） ---------- */
if (!fs.existsSync(SHIM_OWNER)) drift('缺少同族门 scan_ui_interaction.mjs ⇒ 借不到 DOM shim，拒绝给结论');
if (!fs.existsSync(UI)) drift('缺少 settings-ui.js ⇒ 没有可操作的面，拒绝给结论');

const shimSrc = fs.readFileSync(SHIM_OWNER, 'utf8');
const CUT = 'const DEFECTS = [];';
const cutAt = shimSrc.indexOf(CUT);
if (cutAt < 0) drift('同族门里找不到 shim 段切点（`' + CUT + '`）⇒ shim 契约变了，本门须同步');
/* 剥掉 ESM import 语句（本门按 CJS/函数体形式装载那一段）；其余内容逐字保留。 */
const head = shimSrc.slice(0, cutAt).split('\n').filter((l) => !/^\s*import\s/.test(l)).join('\n');
let shim = null;
try {
    shim = new Function('fs', 'path', 'vm', 'process', head + '\nreturn { makeEnv, makeEngine, El, isVisible };')(fs, path, vm, process);
} catch (e) {
    drift('shim 段装载失败：' + (e && e.message));
}
const { makeEnv, makeEngine } = shim;

/* ---------- 内核绑定 ---------- */
const require_ = createRequire(import.meta.url);
let DL = null;
let WM = null;
try {
    DL = require_(path.join(ROOT, 'engine-diagnostic-lines.js'));
    WM = require_(path.join(ROOT, 'worldline-memory.js'));
} catch (_e) { /* 下面统一判 */ }
if (!DL || !WM) drift('缺 engine-diagnostic-lines.js / worldline-memory.js ⇒ 没有编辑器取数口可判');
globalThis.window = globalThis;
globalThis.LonShaWorldlineMemory = WM;
DL.bindDeps({
    moduleLib: (getGlobal, fileName) => {
        try { const g = getGlobal(); if (g) return g; } catch (_e) { /* fallthrough */ }
        try { return require_(path.join(ROOT, fileName)); } catch (_e) { return null; }
    },
    errLog: () => {},
    libs: { _worldlineMemoryLib: () => WM },
});

const HOST = {
    _worldlineState(...a) { return DL._worldlineState(this, ...a); },
    _worldlineRead(...a) { return DL._worldlineRead(this, ...a); },
    worldlineGate(...a) { return DL.worldlineGate(this, ...a); },
    worldlineConvergence(...a) { return DL.worldlineConvergence(this, ...a); },
    worldlineSwitchPlan(...a) { return DL.worldlineSwitchPlan(this, ...a); },
    worldlineDiff(...a) { return DL.worldlineDiff(this, ...a); },
    _worldlineLine(...a) { return DL._worldlineLine(this, ...a); },
    worldlineJumpDraft(...a) { return DL.worldlineJumpDraft(this, ...a); },
};

const uiSrc = fs.readFileSync(UI, 'utf8');
const FLOOR_UI = FIXTURE_MODE ? 1 : 20000;
if (uiSrc.length < FLOOR_UI) drift('settings-ui.js 只有 ' + uiSrc.length + ' 字节（下限 ' + FLOOR_UI + '）⇒ 输入退化');

/** 起一个装了 UI 的环境；`cfg` 是要灌进引擎的配置。 */
function boot(cfg, floor) {
    const env = makeEnv({});
    const engine = makeEngine(cfg);
    for (const k of Object.keys(HOST)) engine[k] = HOST[k];
    if (floor !== undefined && floor !== null) engine._currentFloor = floor;
    env.window.LonShaMemory = {
        VERSION: '0.0.0-audit', engine, config: { config: {} },
        reportError() {}, _auditStack: [],
    };
    const sandbox = vm.createContext(env.window);
    let loadError = null;
    try { vm.runInContext(uiSrc, sandbox, { filename: 'settings-ui.js' }); } catch (e) { loadError = e; }
    return { ...env, engine, plugin: env.window.LonShaMemory, loadError };
}

const BASE_CFG = {
    worldlineMemoryEnabled: true,
    worldlineId: 'α线',
    worldlineStartFloor: '',
    worldlineJumps: '',
    worldlineLayerAlias: '',
    worldlineBands: '',
    worldlineReaders: '',
    worldlineConvergences: '',
    worldlineReaderPolicy: 'none',
    worldlineAdjacentPolicy: 'hold',
    worldlineDivergence: 1.048596,
    extractionPrompt: '',
    secondaryApis: {},
    pyramidTiers: ['日记', '周记', '史记'],
};

/** 打开设置面板；打不开记缺陷并返回 null。 */
function open(ctx) {
    try { ctx.plugin.showSettingsPanel.call(ctx.plugin); }
    catch (e) { defects.push('X1 showSettingsPanel 抛错：' + (e && e.message)); return null; }
    return ctx.document.getElementById('lonsha-settings-overlay');
}
const attr = (el, k) => (el && typeof el.getAttribute === 'function') ? el.getAttribute(k) : null;
const txt = (el) => (el ? String(el.textContent || '') : '');

/* 编辑器序列化口径（与 settings-ui 的 serialize 同口径；本门只用来做**独立**比对）。 */
function canonJumps(text) {
    const out = [];
    for (const raw of String(text || '').split(/\r?\n/)) {
        const s = raw.trim();
        if (!s || s.charAt(0) === '#') continue;
        const at = s.indexOf(':') >= 0 ? s.indexOf(':') : s.indexOf('=');
        if (at <= 0) continue;
        const f = Number(s.slice(0, at).trim());
        const rest = s.slice(at + 1).trim();
        if (!Number.isFinite(f) || f < 0 || !rest) continue;
        const parts = rest.split(/[:：=]/);
        const lid = String(parts[0] || '').trim();
        if (!lid) continue;
        const dv = parts.length > 1 ? Number(parts[1]) : NaN;
        out.push({ floor: Math.floor(f), lineId: lid, divergence: Number.isFinite(dv) ? dv : null });
    }
    return out.sort((a, b) => a.floor - b.floor);
}

/* ══════════ X1 面自证（非零下限：没有这一面就不许发合格证） ══════════ */
const ctx0 = boot(BASE_CFG, 50);
if (ctx0.loadError) drift('settings-ui.js 装载即抛：' + ctx0.loadError.message);
const ov0 = open(ctx0);
if (!ov0) drift('设置面板未落 DOM ⇒ 没有可驱动的一面');
const spot = {
    host: ov0.querySelector('#ls-wl-jumps'),
    rows: ov0.querySelector('#ls-wl-rows'),
    read: ov0.querySelector('#ls-wl-readout'),
    rej: ov0.querySelector('#ls-wl-rejects'),
    add: ov0.querySelector('#ls-wl-add'),
    fix: ov0.querySelector('#ls-wl-fixfirst'),
    raw: ov0.querySelector('#ls-wl-jumps-raw'),
};
const missing = Object.keys(spot).filter((k) => !spot[k]);
if (missing.length) {
    drift('编辑器挂点缺 ' + missing.length + ' 个（' + missing.join('/') + '）⇒ 面塌陷，拒绝给结论');
}
/* 原生 textarea 仍绑同一个键：一个键一个控件（A1 不破），且通用收集器仍在用。 */
const rawBind = ov0.querySelectorAll('[data-cfg-text="worldlineJumps"]');
if (rawBind.length !== 1) {
    defects.push('X1 `worldlineJumps` 的渲染控件数为 ' + rawBind.length + '（应恰 1 个：编辑器只做结构化视图，不另立一个写回口）');
}
notes.push('X1 面：编辑器挂点 7/7 在场，`worldlineJumps` 控件 1 个');

/* ══════════ X2 解析单源（面板的坏行清单必须与闸吃的是同一段解析） ══════════ */
{
    /* 混合文本：3 条好行 + 4 种坏行（缺分隔符 / 楼层非数 / 缺层标记 / 空层标记） + 1 行注释。
     * 若面板另写一套正则，这四种坏行里必然有对不上的（口径漂移正是本判据要抓的）。 */
    const text = [
        '# 纪元登记',
        '1:α线',
        '40:β线',
        '47:α线',
        '坏的没分隔符',
        'x:α线',
        '50:',
        '55:   ',
    ].join('\n');
    const draft = ctx0.engine.worldlineJumpDraft(text);
    if (!draft || draft.kind !== 'worldline_jump_draft') drift('worldlineJumpDraft 未返回约定形状 ⇒ 取数口不可判');
    if (!Array.isArray(draft.rejects) || !Array.isArray(draft.rows) || !Array.isArray(draft.entries)) {
        drift('worldlineJumpDraft 缺 rejects/rows/entries 三桶 ⇒ 面板无从标红');
    }
    if (draft.rows.length !== 3) {
        defects.push('X2 解析只认了 ' + draft.rows.length + ' 条好行（应 3 条）—— 好行被吞或坏行被当成好行');
    }
    if (draft.rejects.length !== 4) {
        defects.push('X2 坏行只点了 ' + draft.rejects.length + ' 条（应 4 条）—— 坏行被静默吞掉，作者看不出少了纪元');
    }
    for (const r of draft.rejects) {
        if (!Number.isFinite(r.line) || r.line < 1) defects.push('X2 坏行缺行号（面板无法指到具体那一行）');
        if (!r.why) defects.push('X2 坏行缺成因（第 ' + r.line + ' 行）—— 只说「坏了」等于没说');
    }
    /* 闸侧：坏行必须真被跳过（而不是进了 rows 又被别的分支丢掉），且注释行不算坏行。 */
    const st = ctx0.engine._worldlineState({ worldlineJumps: text });
    if (st.jumps.length !== 3) defects.push('X2 闸消费了 ' + st.jumps.length + ' 条（应 3 条）—— 面板与闸用的不是同一段解析');
    if (JSON.stringify(st.jumps) !== JSON.stringify(canonJumps(text))) {
        defects.push('X2 闸的解析结果与编辑器口径不一致：' + JSON.stringify(st.jumps));
    }
    notes.push('X2 单源：好行 3 / 坏行 4 且逐条带行号与成因；闸与面板解析逐字一致；注释行不算坏行');
}

/* ══════════ X3 结构化编辑真操作（加行 ⇒ 标红；填满 ⇒ 转好；✕ 真删行） ══════════ */
{
    const ctx = boot(Object.assign({}, BASE_CFG, { worldlineJumps: '1:α线\n40:β线\n47:α线' }), 50);
    const ov = open(ctx);
    if (!ov) drift('设置面板未落 DOM（X3 无从驱动）');
    const rowsEl = ov.querySelector('#ls-wl-rows');
    const rawEl = ov.querySelector('#ls-wl-jumps-raw');
    const readEl = ov.querySelector('#ls-wl-readout');
    const addBtn = ov.querySelector('#ls-wl-add');
    const rejEl = ov.querySelector('#ls-wl-rejects');

    const shown = rowsEl.querySelectorAll('input[data-wl-i]').length;
    if (shown < 9) defects.push('X3 三条跳线只渲染出 ' + shown + ' 个格子（应 ≥9，每条三格）—— 结构化视图没长出来');
    if (attr(readEl, 'data-wl-rejects') !== '0') defects.push('X3 好行被误报为坏行（data-wl-rejects=' + attr(readEl, 'data-wl-rejects') + '）');

    /* 加一行：层标记留空 ⇒ 必须**当场**标红并点名「缺层标记」。 */
    addBtn.click();
    if (attr(readEl, 'data-wl-rejects') !== '1') {
        defects.push('X3 新增空行未被标红（data-wl-rejects=' + attr(readEl, 'data-wl-rejects') + '）—— 坏行静默，作者以为加上了');
    }
    if (!/缺层标记/.test(txt(rejEl))) {
        defects.push('X3 坏行区没点名成因（应含「缺层标记」）：' + txt(rejEl).slice(0, 80));
    }
    if (rowsEl.querySelectorAll('.ls-wl-row-bad').length < 1) {
        defects.push('X3 坏行没有视觉标记（.ls-wl-row-bad 0 个）—— 只有一段文字，用户扫不到是哪一行');
    }

    /* 填满三格 ⇒ 转好，且 textarea 真的多了这一行。 */
    const ins = rowsEl.querySelectorAll('input[data-wl-i]');
    const fl = ins[ins.length - 3];
    const ln = ins[ins.length - 2];
    fl.value = '60';
    fl.dispatchEvent({ type: 'input' });
    ln.value = '梦境一层';
    ln.dispatchEvent({ type: 'input' });
    if (attr(readEl, 'data-wl-rejects') !== '0') {
        defects.push('X3 填满三格后仍被判坏（data-wl-rejects=' + attr(readEl, 'data-wl-rejects') + '）');
    }
    if (!/60:梦境一层/.test(String(rawEl.value))) {
        defects.push('X3 编辑结果没写回 textarea（值=' + JSON.stringify(rawEl.value) + '）—— 保存器读的是它，没写就等于没改');
    }

    /* ✕ 真删行 */
    const before = canonJumps(rawEl.value).length;
    const del = rowsEl.querySelectorAll('[data-wl-del]');
    if (!del.length) {
        defects.push('X3 没有删除入口（[data-wl-del] 0 个）—— 「增」有了「删」没有');
    } else {
        del[0].click();
        const after = canonJumps(rawEl.value).length;
        if (after !== before - 1) {
            defects.push('X3 删除键点了但行数没变（' + before + ' → ' + after + '）—— 点得动但没用');
        }
    }
    notes.push('X3 真操作：3 条跳线渲染 9 格 / 加行当场标红并点名「缺层标记」/ 填满转好并写回 textarea / ✕ 真删 1 行');
}

/* ══════════ X4 读数与内核 epochAt 一致（三次跳线含一次回跳） ══════════ */
{
    const text = '1:α线\n40:β线\n47:α线';
    const ctx = boot(Object.assign({}, BASE_CFG, { worldlineJumps: text }), 50);
    const ov = open(ctx);
    if (!ov) drift('设置面板未落 DOM（X4 无从读数）');
    const readEl = ov.querySelector('#ls-wl-readout');
    const st = ctx.engine._worldlineState({});
    const at = WM.epochAt(50, st.jumps, { layerAlias: st.layerAlias });
    const shownEpoch = attr(readEl, 'data-wl-epoch');
    if (!at || !at.epoch) drift('内核 epochAt 在第 50 楼给不出纪元 ⇒ 判据无从比对');
    if (shownEpoch !== at.epoch) {
        defects.push('X4 面板读数（' + shownEpoch + '）与内核 epochAt（' + at.epoch + '）不一致 —— 两套真源');
    }
    if (attr(readEl, 'data-wl-why') !== String(at.why)) {
        defects.push('X4 面板成因（' + attr(readEl, 'data-wl-why') + '）与内核 why（' + at.why + '）不一致');
    }
    if (attr(readEl, 'data-wl-floor') !== '50') {
        defects.push('X4 面板没报当前楼层（data-wl-floor=' + attr(readEl, 'data-wl-floor') + '，应为 50）');
    }
    if (attr(readEl, 'data-wl-readout') !== 'ok') {
        defects.push('X4 前史已覆盖（首跳第 1 楼）时读数态应为 ok，实为 ' + attr(readEl, 'data-wl-readout'));
    }
    /* 回跳必须真的回到 α线：第 50 楼在 47 的回跳之后 */
    if (at.lineId !== 'α线') defects.push('X4 回跳没生效：第 50 楼应回到 α线，实为 ' + at.lineId);
    notes.push('X4 读数一致：第 50 楼 ' + at.epoch + '（why=' + at.why + '）与内核逐字相同');
}

/* ══════════ X5 前史三态不同形（判不了 ≠ 安全） ══════════ */
{
    const cases = [
        { name: '无跳线', jumps: '', want: 'none' },
        { name: '首跳在第 40 楼', jumps: '40:β线\n47:α线', want: 'gap' },
        { name: '首跳在第 1 楼', jumps: '1:α线\n40:β线\n47:α线', want: 'ok' },
    ];
    const marks = new Set();
    for (const c of cases) {
        const ctx = boot(Object.assign({}, BASE_CFG, { worldlineJumps: c.jumps }), 50);
        const ov = open(ctx);
        if (!ov) drift('设置面板未落 DOM（X5 无从读数）');
        const readEl = ov.querySelector('#ls-wl-readout');
        const got = attr(readEl, 'data-wl-readout');
        marks.add(got);
        if (got !== c.want) {
            defects.push('X5「' + c.name + '」态应为 ' + c.want + '，实为 ' + got);
        }
        const body = txt(readEl);
        if (c.want === 'gap') {
            if (!/判不了/.test(body)) defects.push('X5 前史缺口没说「判不了」：' + body.slice(0, 90));
            if (/(^|[^不])安全/.test(body.replace(/不是「安全」/g, ''))) {
                defects.push('X5 前史缺口被说成「安全」：' + body.slice(0, 90));
            }
            if (!/把首跳登记在第 1 楼/.test(body)) {
                defects.push('X5 前史缺口没给可执行出路（「把首跳登记在第 1 楼」）：' + body.slice(0, 90));
            }
        }
        if (c.want === 'none' && !/不是「都安全」/.test(body)) {
            defects.push('X5「无跳线」没说清「这一格整场不会触发」：' + body.slice(0, 90));
        }
    }
    if (marks.size !== 3) {
        defects.push('X5 三态不同形被破坏：三档读数只有 ' + marks.size + ' 种（' + [...marks].join('/') + '）');
    }
    /* 出路可点：首跳在第 40 楼时「首跳移到第 1 楼」必须可点，且点完读数转 ok。 */
    const ctx = boot(Object.assign({}, BASE_CFG, { worldlineJumps: '40:β线\n47:α线' }), 50);
    const ov = open(ctx);
    if (ov) {
        const fix = ov.querySelector('#ls-wl-fixfirst');
        if (!fix || fix.disabled) {
            defects.push('X5 前史有缺口时「首跳移到第 1 楼」不可用 —— 出路只在文档里');
        } else {
            fix.click();
            const readEl = ov.querySelector('#ls-wl-readout');
            if (attr(readEl, 'data-wl-readout') !== 'ok') {
                defects.push('X5 点了「首跳移到第 1 楼」后读数仍是 ' + attr(readEl, 'data-wl-readout') + '（出路点了没用）');
            }
        }
    }
    notes.push('X5 三态：none / gap / ok 三句不同形，且 gap 给了「判不了 + 出路」而非「安全」');
}

/* ══════════ X6 保存闭环 + 预览不写配置 ══════════ */
{
    const ctx = boot(Object.assign({}, BASE_CFG, { worldlineJumps: '1:α线\n40:β线' }), 50);
    const ov = open(ctx);
    if (!ov) drift('设置面板未落 DOM（X6 无从保存）');
    const rowsEl = ov.querySelector('#ls-wl-rows');
    const cfg = ctx.engine.config.config;

    /* 改格子但**不**点保存 ⇒ 配置一字不动（预览 ≠ 已生效）。 */
    const before = String(cfg.worldlineJumps);
    const ins = rowsEl.querySelectorAll('input[data-wl-i]');
    if (ins.length < 3) drift('编辑器行内没有可编辑格子（X6 无从驱动）');
    ins[1].value = 'γ线';
    ins[1].dispatchEvent({ type: 'input' });
    if (String(cfg.worldlineJumps) !== before) {
        defects.push('X6 只改格子（未点保存）配置就变了（' + before + ' → ' + cfg.worldlineJumps + '）—— 预览写进了生效面');
    }
    /* 点保存 ⇒ 配置等于编辑器序列化结果。 */
    const rawEl = ov.querySelector('#ls-wl-jumps-raw');
    const want = canonJumps(rawEl.value);
    const save = ov.querySelector('#ls-save');
    if (!save) drift('设置面板无 #ls-save ⇒ 一跳线也存不下去');
    save.click();
    const got = canonJumps(cfg.worldlineJumps);
    if (JSON.stringify(got) !== JSON.stringify(want)) {
        defects.push('X6 保存后配置为 ' + JSON.stringify(got) + '，应等于编辑器序列化结果 ' + JSON.stringify(want));
    }
    if (!want.some((r) => r.lineId === 'γ线')) {
        defects.push('X6 编辑的「γ线」没进保存结果 —— 编辑器与保存路径断了');
    }
    notes.push('X6 保存闭环：未点保存配置零变化；点保存后配置=' + JSON.stringify(got));
}

/* ══════════ 汇总 ══════════ */
notes.forEach((n) => console.log('  · ' + n));
if (defects.length) {
    console.error('[ui-worldline] 检出 ' + defects.length + ' 处缺陷：');
    defects.forEach((d) => console.error('  ✗ ' + d));
    console.error('  边界：本门跑在最小 DOM shim 上，拦的是编辑器逻辑；宿主 CSS / 真机触摸 / localStorage 未覆盖。');
    process.exit(1);
}
console.log('[ui-worldline] 通过：解析单源、结构化编辑真操作、读数与内核 epochAt 逐字一致、前史三态不同形、保存闭环。');
console.log('  ★ 边界（与结论一起读）：shim 上的交互逻辑门，不证明真实浏览器观感与跨会话存储。');
process.exit(0);
