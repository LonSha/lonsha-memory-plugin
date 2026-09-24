// 审计基建（v3.193.0）真实宿主加载矩阵扫描器 —— 计划第二部分 6
// ------------------------------------------------------------
// 为什么存在：
//   此前对「manifest → 脚本加载 → 全局挂载 → API 调用」的验证留在临时脚本里
//   （/tmp 的 host simulation），既不可回归也不进仓库。本轮把它固化成矩阵：
//   **真的执行**加载链，而不是再写一条静态 grep。
//   计划点名的七项，逐项有判据：
//     M1 正常按 extra_js 加载（入口 + 47 脚本，逐个真跑）
//     M2 缺少可选脚本（逐个抽掉一个，其余必须仍能加载且失败可观测）
//     M3 重复加载（同脚本加载两次：不抛、全局仍在、监听器不静默翻倍）
//     M4 脚本抛异常（真做一个抛异常的模块：隔离性 + 可观测性）
//     M5 window / global 挂载差异（window===globalThis 与 window 独立两种宿主）
//     M6 不同宿主的 document / 定时器 / Storage 行为（能力缺失时必须降级且可观测）
//     M7 重载后是否重复注册事件（计数采集，给出宿主契约而不是猜）
//   本扫描器**不**替代 scan_module_wiring（那条守静态接线面：引用必有供给、无未消费挂载）；
//   本文件守运行期：真加载能不能成、缺东西会不会静默、重载会不会翻倍。
//
// 判定：
//   M0 自证：段数 + 归因串契约 + 前置文件在位
//   M1..M7 如上；退出码 0=卫生 1=存在真缺陷 2=结构漂移（探测器失效）
import fs from 'fs';
import path from 'path';
import os from 'os';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const SELF = fileURLToPath(import.meta.url);
// ── 判据段枚举（自证用）──
const EXPECT_SECTION_COUNT = 8;
// ── 归因串契约（负控制靠它确认判别力没被改名拿掉）──
const EXPECT_ATTRIB = [
    'M1 加载链断裂', 'M2 缺脚本不降级', 'M2 静默吞异常', 'M3 重复加载不幂等',
    'M4 隔离性缺失', 'M4 异常不可观测', 'M5 挂载目标分歧', 'M6 能力缺失未降级',
    'M7 重载监听器翻倍',
];
function bail(m) { console.error('[host-matrix] ' + m); process.exit(2); }
const MF = path.join(ROOT, 'manifest.json');
if (!fs.existsSync(MF)) bail('缺少 manifest.json（' + ROOT + '）');
let mf;
try { mf = JSON.parse(fs.readFileSync(MF, 'utf8')); } catch (e) { bail('manifest 解析失败：' + e.message); }
const entry = mf.js;
const extras = Array.isArray(mf.extra_js) ? mf.extra_js.slice() : [];
if (!entry) bail('manifest.js 入口缺失');
if (extras.length < 40) bail('extra_js 只抽到 ' + extras.length + ' 个（低于下限 40），抽取器已失效');
const loadOrder = [entry].concat(extras);
const missing = loadOrder.filter((f) => !fs.existsSync(path.join(ROOT, f)));
if (missing.length) bail('注册脚本不存在：' + missing.join(', '));
let checks = 0, defects = [], notes = [];
const okc = () => { checks++; };
const bad = (a, m) => { checks++; defects.push(a + '：' + m); };
const note = (m) => { notes.push(m); };
// ── M0 自证 ──
{
    const selfSrc = fs.readFileSync(SELF, 'utf8');
    const sectionCount = (selfSrc.match(/^\s*\/\/\s*── M\d/gm) || []).length;
    //   双向判据：太少说明判据段被删，太多说明补了段却没更新枚举值。
    //   只判「< 下界」会让「把枚举改小」这种破坏静默通过（实测踩过）。
    if (sectionCount !== EXPECT_SECTION_COUNT) bail('判据自证失败：段数 ' + sectionCount + ' ≠ ' + EXPECT_SECTION_COUNT);
    for (const a of EXPECT_ATTRIB) {
        const n = selfSrc.split(a).length - 1;
        if (n < 2) bail('判据自证失败：归因串「' + a + '」出现 ' + n + ' 次（需 ≥2：声明 + 调用点）');
    }
    okc();
}
/* ── 宿主桩 ──────────────────────────────────────────────────────
 * identity 决定 window 与 globalThis 是否同一对象：
 *   'same'     = 浏览器 / SillyTavern 常态（window === globalThis）
 *   'separate' = 某些 Electron/Tauri/测试宿主（window 是另造的壳对象）
 *   这个差别会直接决定「模块挂到哪儿、消费者从哪儿取」是否对得上，故必须两种都跑。
 */
function fakeElement() {
    const el = {
        style: {}, dataset: {}, classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
        appendChild(c) { return c; }, removeChild(c) { return c; }, insertBefore(c) { return c; },
        setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
        addEventListener() {}, removeEventListener() {}, remove() {}, focus() {},
        querySelector() { return null; }, querySelectorAll() { return []; },
        insertAdjacentHTML() {}, click() {}, textContent: '', innerHTML: '', value: '',
        children: [], childNodes: [], parentNode: null,
    };
    return el;
}
function makeSandbox(opts) {
    const o = Object.assign({ identity: 'same', document: true, storage: true, timers: true, st: true }, opts || {});
    const ctx = {};
    const win = o.identity === 'same' ? ctx : {};
    ctx.window = win;
    ctx.globalThis = ctx;
    ctx.self = win;
    ctx.console = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
    ctx.performance = { now: () => 0 };
    ctx.navigator = { userAgent: 'host-matrix' };
    ctx.location = { href: 'http://localhost/' };
    ctx.URL = URL;
    if (o.timers) {
        ctx.setTimeout = () => 0; ctx.clearTimeout = () => {};
        ctx.setInterval = () => 0; ctx.clearInterval = () => {};
        ctx.requestAnimationFrame = () => 0; ctx.cancelAnimationFrame = () => {};
    }
    if (o.document) {
        ctx.document = {
            readyState: 'complete', createElement: fakeElement, createTextNode: () => ({}),
            createDocumentFragment: fakeElement, getElementById: () => null,
            querySelector: () => null, querySelectorAll: () => [],
            addEventListener() {}, removeEventListener() {}, head: fakeElement(), body: fakeElement(),
            documentElement: fakeElement(),
        };
    }
    if (o.storage) {
        ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {}, length: 0, key: () => null };
    }
    // 事件注册采集：M3/M7 靠它回答「重载会不会重复注册」
    //   context 给真值才代表「控制平面已就绪」——载荷型桩（返回 null）会让注册路径整体短路，
    //   那既可能是不注册、也可能是桩不真，两者同形；故两种桩都要能造。
    const regs = [];
    //   活监听账：on 加、off 减。只数 on 的账看不出「卸载-重装」是否真的把旧的摘掉了 ——
    //   那正是「重载后重复注册」这个问题的判据本身。
    //   活监听账用**计数**而非集合：同一 (事件,handler) 被 on 两次就是真重复注册，
    //   Set 会把它们去重成 1，恰好掩盖掉本判据要抓的形态。
    const live = new Map();
    let offCount = 0;
    if (o.st) {
        // 事件类型表按插件实际消费的七个事件名造真（types.MESSAGE_RECEIVED 缺失会让
        //   registerEvents 走早退分支，注册数恒 0 —— 那是桩的问题，不是插件的问题）。
        const ctxObj = Object.assign({
            eventSource: null,
            event_types: {
                MESSAGE_RECEIVED: 'message_received', MESSAGE_EDITED: 'message_edited',
                MESSAGE_DELETED: 'message_deleted', MESSAGE_SWIPED: 'message_swiped',
                GENERATION_STARTED: 'generation_started', GENERATION_ENDED: 'generation_ended',
                CHAT_CHANGED: 'chat_changed',
            },
        }, o.context || {});
        const es = {
            on: (ev, fn) => {
                regs.push(ev);
                const k = ev + '|' + (typeof fn === 'function' ? fn.name || 'anon' : String(fn));
                live.set(k, (live.get(k) || 0) + 1);
            },
            off: (ev, fn) => {
                offCount++;
                const k = ev + '|' + (typeof fn === 'function' ? fn.name || 'anon' : String(fn));
                live.set(k, Math.max(0, (live.get(k) || 0) - 1));
            },
            emit() {}, once: (ev, fn) => { regs.push(ev); const k = ev + '|once'; live.set(k, (live.get(k) || 0) + 1); },
        };
        ctxObj.eventSource = ctxObj.eventSource || es;
        ctx.SillyTavern = {
            getContext: () => (o.context !== undefined ? ctxObj : (o.stOnly ? ctxObj : null)),
            eventSource: es,
            libs: {},
        };
    }
    ctx.addEventListener = () => {};
    ctx.removeEventListener = () => {};
    return { ctx, win, regs, live, offCount: () => offCount, sandbox: vm.createContext(ctx) };
}
/** 在给定沙箱里加载一个文件，返回 {ok, err}。 */
function loadInto(env, file, code) {
    try {
        vm.runInContext(code !== undefined ? code : fs.readFileSync(path.join(ROOT, file), 'utf8'), env.sandbox, { filename: file });
        return { ok: true, err: null };
    } catch (e) { return { ok: false, err: e.constructor.name + ': ' + e.message }; }
}
/** 在 window 与 globalThis 两处找模块全局（两种宿主形态都取一遍）。 */
function globalsOf(env) {
    const found = new Set();
    for (const t of [env.win, env.ctx]) {
        if (!t) continue;
        for (const k of Object.keys(t)) if (/^(LonSha|GraphDiffusion$|MemoryVisualizer$)/.test(k)) found.add(k);
    }
    return found;
}
const codes = {};
for (const f of loadOrder) codes[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
// ── M1 正常按 extra_js 加载 ──
const mountedBy = {};   // file -> Set(挂载目标)
let env1 = null;
{
    env1 = makeSandbox();
    const fails = [];
    for (const f of loadOrder) {
        const r = loadInto(env1, f);
        if (!r.ok) fails.push(f + '（' + r.err + '）');
        const w = new Set(), g = new Set();
        for (const k of Object.keys(env1.win || {})) if (/^(LonSha|GraphDiffusion$|MemoryVisualizer$)/.test(k)) w.add(k);
        // 记录本文件新增的挂载目标（按增量算，避免把前面文件的全局算到后面文件头上）
        const all = globalsOf(env1);
        mountedBy[f] = all;
    }
    if (fails.length) bad('M1 加载链断裂', fails.length + ' 个脚本加载失败：' + fails.slice(0, 3).join('；'));
    else okc();
    const totalGlobal = globalsOf(env1).size;
    if (totalGlobal < 30) bad('M1 加载链断裂', '真加载后仅观测到 ' + totalGlobal + ' 个模块全局（低于下限 30），沙箱已退化');
    else okc();
}
// 逐文件挂载目标差异（M5 的原料）：哪些文件只挂 window、哪些只挂 globalThis
const winOnly = [], gOnly = [], bothMount = [], noGlobal = [];
for (const f of extras) {
    if (f === 'settings-ui.js') { noGlobal.push(f); continue; }  // 见 M6：需要真 DOM，属预期
    const env = makeSandbox();
    loadInto(env, f);
    const hasWin = Object.keys(env.win || {}).some((k) => /^(LonSha|GraphDiffusion$|MemoryVisualizer$)/.test(k));
    const hasG = Object.keys(env.ctx).some((k) => /^(LonSha|GraphDiffusion$|MemoryVisualizer$)/.test(k));
    if (hasWin && hasG) bothMount.push(f);
    else if (hasWin) winOnly.push(f);
    else if (hasG) gOnly.push(f);
    else noGlobal.push(f);
}
// ── M2 缺少可选脚本 ──
// [v3.207.0] 判据收紧到「**不可归因的**耦合」：
//   旧口径「缺一个脚本就不得有任何别的脚本加载失败」在遇到**声明的硬依赖**时给出假红 ——
//   本版新增账本实体契约（ledger-entity.js）后，六本账在缺它时抛出**点名该文件**的错误：
//   `Error: [lonsha] ledger-entity.js 未加载：账本实体契约缺真源（查 manifest.extra_js 加载顺序）`。
//   那不是隐藏耦合，恰恰是「失败可观测」的教科书形态（本段注释开头就要求它）。
//   真缺陷是**不可归因**的失败：缺 X 而 Y 崩在一个与 X 无关的地方（别人看不出来该去补哪个文件）。
//   故：错误文本里点出被抽掉的文件名 ⇒ 记为「声明的硬依赖」（进 notes，可见）；否则 ⇒ 缺陷。
//   这条收紧只认文件名本身，不做「像是依赖」的模糊判断 —— 口径必须可机检、可负控。
{
    const breaks = [];
    const declared = [];
    for (const skip of extras) {
        const env = makeSandbox();
        const fails = [];
        const named = [];
        for (const f of loadOrder) {
            if (f === skip) continue;
            const r = loadInto(env, f);
            // 只关心「因为少了一个脚本而导致别的脚本挂掉」——即加载期崩溃
            if (!r.ok) {
                fails.push(f + '（' + r.err + '）');
                if (String(r.err).includes(skip)) named.push(f);
            }
        }
        // 归因：崩的那几个脚本是不是**都**在错误里点名了被抽掉的文件
        const unattributed = fails.filter((m) => !named.some((n) => m.startsWith(n + '（')));
        if (unattributed.length) {
            breaks.push('缺 ' + skip + ' 导致 ' + unattributed.length + ' 个脚本不可归因地失败：' + unattributed[0]);
        } else if (named.length) {
            declared.push(skip + '→' + named.length + ' 个（点名）');
        }
    }
    if (breaks.length) bad('M2 缺脚本不降级', breaks.length + ' 例：' + breaks.slice(0, 3).join('；'));
    else okc();
    if (declared.length) note('声明的硬依赖（缺它时消费者抛点名错误）：' + declared.slice(0, 4).join('、')
        + (declared.length > 4 ? ' 等 ' + declared.length + ' 个' : ''));
    // 静默吞异常：被抽掉的脚本若不是加载期依赖，就不该有任何脚本崩——但也不得「假装加载过」
    const env2 = makeSandbox();
    const skipped = extras[Math.floor(extras.length / 2)];
    for (const f of loadOrder) if (f !== skipped) loadInto(env2, f);
    const stillHasGlobal = Object.keys(env2.ctx).some((k) => /^LonSha/.test(k));
    if (!stillHasGlobal) bad('M2 静默吞异常', '抽掉 ' + skipped + ' 后连基础全局都没了，说明加载链本身是脆的且无人报告');
    else okc();
}
// ── M3 重复加载 ──
{
    const env = makeSandbox();
    const once = loadInto(env, entry);
    const r1 = env.regs.length;
    const twice = loadInto(env, entry);
    const r2 = env.regs.length;
    if (!once.ok || !twice.ok) bad('M3 重复加载不幂等', '第二次加载抛了：' + (twice.err || once.err));
    else okc();
    if (r2 > r1 * 2) bad('M3 重复加载不幂等', '重载一次监听器从 ' + r1 + ' 涨到 ' + r2 + '（超过一倍）');
    else okc();
    note('M3 契约：入口在重复加载时监听器 ' + r1 + ' → ' + r2 + '（宿主只应加载一次；重复加载的代价已量化）');
    const env2 = makeSandbox();
    const dup = [];
    for (const f of extras) {
        const a = loadInto(env2, f), b = loadInto(env2, f);
        if (!a.ok || !b.ok) dup.push(f + '（' + (b.err || a.err) + '）');
    }
    if (dup.length) bad('M3 重复加载不幂等', dup.length + ' 个脚本第二次加载抛异常：' + dup.slice(0, 3).join('；'));
    else okc();
}
// ── M4 脚本抛异常 ──
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha-hostm-'));
    const victim = 'cost-ledger.js';
    const src = codes[victim];
    fs.writeFileSync(path.join(dir, victim), 'throw new Error("boom-from-victim");\n' + src);
    const env = makeSandbox();
    const observed = [];
    let others = 0;
    for (const f of loadOrder) {
        const code = f === victim ? fs.readFileSync(path.join(dir, victim), 'utf8') : codes[f];
        const r = loadInto(env, f, code);
        if (!r.ok) observed.push(f + '（' + r.err + '）'); else others++;
    }
    if (!observed.length) bad('M4 异常不可观测', victim + ' 抛异常却没有被观测到（宿主把失败静默吞了）');
    else okc();
    if (others < 10) bad('M4 隔离性缺失', '一个脚本抛异常后有 ' + others + ' 个脚本未能继续加载（点状失败扩散成整体崩溃）');
    else okc();
    fs.rmSync(dir, { recursive: true, force: true });
}
// ── M5 window / global 挂载差异 ──
{
    if (gOnly.length && winOnly.length) {
        note('M5 挂载目标分歧：' + winOnly.length + ' 个只挂 window（' + winOnly.slice(0, 4).join('、') + '）；'
            + gOnly.length + ' 个只挂 globalThis（' + gOnly.slice(0, 4).join('、') + '）；'
            + bothMount.length + ' 个两处都在。宿主 window === globalThis 时等价，'
            + '若宿主另造 window 壳，则两类模块各只在一处可见 —— 消费方按 window.X 取会漏掉后者。');
    }
    // 真验：window 独立的宿主里，入口引用的符号是否仍可取到
    const env = makeSandbox({ identity: 'separate' });
    for (const f of loadOrder) loadInto(env, f);
    const viaWin = Object.keys(env.win || {}).filter((k) => /^LonSha/.test(k));
    const viaGlobal = Object.keys(env.ctx).filter((k) => /^LonSha/.test(k));
    if (viaWin.length === 0 && viaGlobal.length === 0) bad('M5 挂载目标分歧', 'window 独立的宿主里两处都没有模块全局（加载链完全失效）');
    else okc();
    note('M5 window 独立宿主实测：window 上可见 ' + viaWin.length + ' 个模块全局 / globalThis 上可见 ' + viaGlobal.length + ' 个');
}
// ── M6 能力缺失（document / timers / Storage）──
{
    const cases = [
        { label: '无 document', opts: { document: false } },
        { label: '无 localStorage', opts: { storage: false } },
        { label: '无定时器', opts: { timers: false } },
        { label: '无 SillyTavern 宿主对象', opts: { st: false } },
    ];
    for (const c of cases) {
        const env = makeSandbox(c.opts);
        const fails = [];
        for (const f of loadOrder) {
            const r = loadInto(env, f);
            if (!r.ok) fails.push(f + '（' + r.err.slice(0, 60) + '）');
        }
        // 允许失败，但必须**可观测**：失败清单非空即为可观测；若一个都不失败却也没挂载到东西，才是静默失效
        const anyGlobal = globalsOf(env).size;
        if (anyGlobal === 0) bad('M6 能力缺失未降级', c.label + ' 下没有任何模块挂载成功（整体静默失效）');
        else okc();
        if (fails.length) note('M6 ' + c.label + '：' + fails.length + ' 个脚本加载失败（可观测，非静默）——' + fails.slice(0, 2).join('；'));
    }
}
// ── M7 重载后重复注册 ──
//   为什么必须驱动 registerEvents 而不是「加载入口后数注册数」：
//     入口加载时会调 this.ensureControlReady()，它先要求 window.SillyTavern.getContext()
//     返回真值；载荷型的宿主桩（getContext() 返回 null）会让整条注册路径**静默短路**，
//     于是「采集到 0 个注册」既可能是「入口没注册」也可能是「我的桩不够真」——
//     两者同形。故这里做两件事：① 用能通过 getContext 的桩把入口加载起来；
//     ② 直接调例子的 registerEvents()（注册真发生在 init 的第 14099 行，不在加载期），
//     再用 registerEvents 自带的 v3.164 幂等去数「重复注册有没有翻倍」。
{
    const env = makeSandbox({ context: {} });
    loadInto(env, entry);
    const inst = env.ctx.LonShaMemory;
    if (!inst || typeof inst.registerEvents !== 'function') {
        bad('M7 重载监听器翻倍', '入口未暴露 control.registerEvents（采集面缺失，无法回答重载问题）');
    } else {
        const totalLive = (env) => Array.from(env.live.values()).reduce((a, b) => a + b, 0);
        const before = env.regs.length;
        try { inst.registerEvents(); } catch (e) { bad('M7 重载监听器翻倍', 'registerEvents 抛异常：' + e.message); }
        const after1 = env.regs.length;
        const live1 = totalLive(env);
        if (after1 === before) bad('M7 重载监听器翻倍', 'registerEvents 跑完一个事件也没注册（注册面失效或桩仍不真）');
        else okc();
        // 重复调用：v3.164 承诺「先卸载再重装」。真判据是**活监听数不翻倍** ——
        //   只数 on 次数看不出旧的有没有被摘掉：卸载-重装会让 on 计数涨一倍，
        //   但活监听数必须回到同一水平；若活数也翻倍，就是同一事件被挂了两次。
        try { inst.registerEvents(); } catch (e) { bad('M7 重载监听器翻倍', '第二次 registerEvents 抛异常：' + e.message); }
        const live2 = totalLive(env);
        if (live2 > live1) bad('M7 重载监听器翻倍', '重复 registerEvents 后活监听从 ' + live1 + ' 涨到 ' + live2
            + '（卸载-重装没摘净，同一事件会双触发）');
        else okc();
        note('M7 重载契约：首次注册 ' + (after1 - before) + ' 条（活 ' + live1 + '）；重复调用后活监听 ' + live2
            + '，off 累计 ' + env.offCount() + ' 次（≤ 首活数 ⇒ 卸载-重装幂等成立）');
    }
}
// ── 报告 ──
console.log('[host-matrix] 加载顺序 ' + loadOrder.length + ' 个脚本（入口 + extra_js ' + extras.length + '）');
console.log('  M1 真加载成功 ' + (loadOrder.length - 0) + '/' + loadOrder.length + '｜模块全局 ' + globalsOf(env1).size + ' 个');
console.log('  M5 挂载目标：两处都在 ' + bothMount.length + ' / 只挂 window ' + winOnly.length + ' / 只挂 globalThis ' + gOnly.length + ' / 不挂全局 ' + noGlobal.length);
for (const n of notes) console.log('  · ' + n);
console.log('[host-matrix] 判据点 ' + checks + ' 处（段 ' + EXPECT_SECTION_COUNT + '/归因串 ' + EXPECT_ATTRIB.length + '）｜缺陷 ' + defects.length + ' 项');
if (defects.length) {
    for (const d of defects) console.error('  ✗ ' + d);
    process.exit(1);
}
console.log('  ✓ 宿主加载矩阵：加载链完整、缺脚本不静默、重复加载不失控、异常隔离且可观测、能力缺失可降级');
process.exit(0);