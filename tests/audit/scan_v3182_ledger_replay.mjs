// 审计基建（v3.182）：账本回放面扫描（登记表存活 / 回放收口 / 报告可见性）
// ------------------------------------------------------------
// 为什么存在：
//   删楼与楼层前移此前是 index.js 里的两份手工清单（rollbackFloor ≈ 200 行、
//   shiftFloorsFrom ≈ 160 行）。新增一个带楼层归属的子系统必须同时改两处，
//   漏一处不报错：删楼后那部分记忆留在原地，却自称「已回滚」。
//   v3.182 把两份清单收成 ledger-replay.js 的一张声明式登记表 FLOOR_OWNERS，
//   并给出唯一回放入口 replayDrop / replayShift。本扫描守住这张表不被回退成手工清单。
//
// 判定：
//   R1 登记表结构健康：id 唯一、字段齐全、动作类型正确、条数不低于下限
//   R2 回放入口被宿主真消费（两段式，v3.198 从「形态判据」升级为「行为判据」）：
//      R2a 形态：index.js 必须出现 replayDrop( / replayShift( / _ledgerReplayLib( 调用形态
//                （剥注释后），用于快速定位「整个入口被删」。
//      R2b 行为（主判据）：真加载 ledger-replay.js + index.js 到 vm 沙箱 → 实例化插件 →
//                调 engine.rollbackFloor(floor) → 断言回放**真的跑过**（报告写入 + version===1
//                + items 非空 + 关账本时显式 skipped）。
//                为什么必须行为判据：形态判据实测漏检三种真退化 ——
//                A 调用挪进 if(false) 死分支、B 调用改传空宿主 {}、C 返回值被丢弃报告不落字段，
//                三者在剥注释文本上全绿（见 tests/audit/probe_v3198_r2.mjs）。
//   R3 回放报告必须留痕：最近一次回放报告被写入宿主字段，且 selfCheck 诊断行读取它
//   R4 模块缺席必须有同形退路：取不到库时回放到内置空报告，而不是抛掉整个删楼
//   R5 幂等：同一楼连续回放两次，第二次撤掉的条数为 0（重复执行不重复扣账）
//
// 退出码：0=卫生  1=存在真缺陷  2=结构漂移（探测器失效）
// 夹具通道：LONSHA_AUDIT_FIXTURE=1 放宽下限；LONSHA_AUDIT_ROOT 指向合成仓库。
import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { stripComments } from '../_audit_lib.mjs';
const require = createRequire(import.meta.url);
const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();

const lrPath = path.join(ROOT, 'ledger-replay.js');
const idxPath = path.join(ROOT, 'index.js');
if (!fs.existsSync(lrPath) || !fs.existsSync(idxPath)) {
    console.error('[ledger-replay] 找不到 ledger-replay.js 或 index.js（' + ROOT + '）');
    process.exit(2);
}
const idx = fs.readFileSync(idxPath, 'utf8');
const MIN_BYTES = FIXTURE_MODE ? 1 : 100000;
if (idx.length < MIN_BYTES) {
    console.error('[ledger-replay] index.js 退化（' + idx.length + ' 字节），审计需同步结构变化');
    process.exit(2);
}
let LR;
try { LR = require(lrPath); }
catch (e) { console.error('[ledger-replay] 模块加载失败：' + e.message); process.exit(2); }

const MIN_OWNERS = FIXTURE_MODE ? 1 : 20;
const defects = [];

// ── R2b 行为探针：真加载 → 真调用 → 验报告 ─────────────────────────
// 为什么不用 new Function 抽 rollbackFloor 单函数：它读 this.config / this.ledger /
// this._lastReplayReport，脱离实例抽不出来；且「调用是否被执行」本身就是判据的一部分，
// 必须走真实例化路径。
function fakeElement() {
    return {
        style: {}, dataset: {}, classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
        appendChild(c) { return c; }, removeChild(c) { return c; }, insertBefore(c) { return c; },
        setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
        addEventListener() {}, removeEventListener() {}, remove() {}, focus() {},
        querySelector() { return null; }, querySelectorAll() { return []; },
        insertAdjacentHTML() {}, click() {}, textContent: '', innerHTML: '', value: '',
        children: [], childNodes: [], parentNode: null,
    };
}
function makeSandbox() {
    const ctx = {};
    ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
    ctx.console = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
    ctx.performance = { now: () => 0 };
    ctx.navigator = { userAgent: 'ledger-replay-r2b' };
    ctx.location = { href: 'http://localhost/' };
    ctx.URL = URL;
    ctx.setTimeout = () => 0; ctx.clearTimeout = () => {};
    ctx.setInterval = () => 0; ctx.clearInterval = () => {};
    ctx.requestAnimationFrame = () => 0; ctx.cancelAnimationFrame = () => {};
    ctx.document = {
        readyState: 'complete', createElement: fakeElement, createTextNode: () => ({}),
        createDocumentFragment: fakeElement, getElementById: () => null,
        querySelector: () => null, querySelectorAll: () => [],
        addEventListener() {}, removeEventListener() {}, head: fakeElement(), body: fakeElement(),
        documentElement: fakeElement(),
    };
    ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {}, length: 0, key: () => null };
    ctx.SillyTavern = {
        getContext: () => ({
            eventSource: { on() {}, off() {}, emit() {}, once() {} },
            event_types: {
                MESSAGE_RECEIVED: 'message_received', MESSAGE_EDITED: 'message_edited',
                MESSAGE_DELETED: 'message_deleted', MESSAGE_SWIPED: 'message_swiped',
                GENERATION_STARTED: 'generation_started', GENERATION_ENDED: 'generation_ended',
                CHAT_CHANGED: 'chat_changed',
            },
            chatMetadata: {}, extensionSettings: {}, chat: [],
        }),
        chat: [], characters: {},
    };
    return vm.createContext(ctx);
}
// 真跑一次回放：load 两文件 → plugin.engine.rollbackFloor(floor) → 返回 {ok, report, engine, why}
function runReplayOnce(opts) {
    const o = Object.assign({ ledgerEnabled: true, floor: 3 }, opts || {});
    const sandbox = makeSandbox();
    const lrFile = path.join(ROOT, 'ledger-replay.js');
    if (!fs.existsSync(lrFile)) return { ok: false, why: 'ledger-replay.js 不在位' };
    try {
        vm.runInContext(fs.readFileSync(lrFile, 'utf8'), sandbox, { filename: 'ledger-replay.js' });
    } catch (e) { return { ok: false, why: 'ledger-replay.js 加载抛错：' + e.message }; }
    try {
        vm.runInContext(idx, sandbox, { filename: 'index.js' });
    } catch (e) { return { ok: false, why: 'index.js 加载抛错：' + e.message }; }
    const plugin = sandbox.window && sandbox.window.LonShaMemory;
    const engine = plugin && plugin.engine;
    if (!engine) return { ok: false, why: '沙箱里拿不到 plugin.engine（插件未实例化）' };
    if (typeof engine.rollbackFloor !== 'function') return { ok: false, why: 'engine.rollbackFloor 不是函数' };
    if (engine.config && engine.config.config) engine.config.config.floorLedgerEnabled = !!o.ledgerEnabled;
    let threw = null;
    try { engine.rollbackFloor(o.floor); } catch (e) { threw = e; }
    return { ok: true, report: engine._lastReplayReport, engine, threw };
}
function replayBehaviorProbe() {
    const out = { defects: [] };
    // ── 开账本：回放必须真的跑过 ──
    const on = runReplayOnce({ ledgerEnabled: true });
    if (!on.ok) { out.defects.push('回放行为探针无法运行：' + on.why); return out; }
    if (on.threw) out.defects.push('rollbackFloor 抛错（' + on.threw.message + '），回放未收口');
    const rep = on.report;
    if (!rep || typeof rep !== 'object') {
        out.defects.push('回放报告未被写入（_lastReplayReport 缺失）—— 回放入口未被真消费（声明了零调用 = 死声明）');
    } else {
        if (rep.side !== 'drop') out.defects.push('回放报告 side=' + rep.side + ' ≠ drop（删楼回放未走 drop 面）');
        if (Number(rep.version) !== 1) {
            out.defects.push('回放报告 version=' + rep.version + ' ≠ 1 —— 真模块没在跑（version 0 = 缺席退路，回放没扫登记表）');
        }
        const items = Array.isArray(rep.items) ? rep.items : [];
        if (items.length < MIN_OWNERS) {
            out.defects.push('回放报告 items 只有 ' + items.length + ' 项（下限 ' + MIN_OWNERS + '）—— 回放没真扫登记表');
        }
        // 至少一本账真的被读到（ok）。传对宿主才有此证据：
        //   宿主被传成空对象时，引擎仍给结构完整的报告（version 1 / items 33），
        //   只是全部 absent —— 只看数量抓不到「宿主传错了」。
        const okCount = items.filter((it) => it && it.state === 'ok').length;
        if (okCount < 1) {
            const absent = items.filter((it) => it && it.state === 'absent').length;
            out.defects.push('回放报告里没有一本账 state===ok（absent ' + absent + '/' + items.length + '）—— 宿主没被真正交给回放（传错宿主时全部 absent）');
        }
        // 报告必须带 threw/absent 分态字段（承认「有些账拿不到」而不是只看成功）
        if (!('threw' in rep) || !('absent' in rep)) out.defects.push('回放报告缺 threw/absent 分态字段（失败会被当成成功吞掉）');
    }
    // ── 关账本：必须显式 skipped，而不是与「跑了没账可撤」同形 ──
    const off = runReplayOnce({ ledgerEnabled: false });
    if (!off.ok) { out.defects.push('关账本场景无法运行：' + off.why); return out; }
    const repOff = off.report;
    if (!repOff || repOff.skipped !== 'floor-ledger-disabled') {
        out.defects.push('关账本时回放报告未显式 skipped=floor-ledger-disabled（关掉了与跑了没账可撤同形）');
    }
    return out;
}


// 剥注释（保留换行），形态判据一律在剥注释后的文本上下结论。
const idxStripped = stripComments(idx);

// ── R1 登记表结构健康 ──
const owners = Array.isArray(LR.FLOOR_OWNERS) ? LR.FLOOR_OWNERS : [];
if (owners.length < MIN_OWNERS) {
    console.error('[ledger-replay] 登记表只有 ' + owners.length + ' 项（下限 ' + MIN_OWNERS + '），抽取器或登记表已失效');
    process.exit(2);
}
const problems = LR.checkRegistry(owners);
for (const p of problems) defects.push('R1 登记表结构：' + p);

// ── R2a 回放入口形态（前置，快速定位「整个入口被删」）──
// 必须是调用形态 replayDrop( / replayShift(，注释里提到不算。
if (!/replayDrop\s*\(/.test(idxStripped)) defects.push('R2 index.js 没有调用 replayDrop（删楼回放未被收口，登记表是死声明）');
if (!/replayShift\s*\(/.test(idxStripped)) defects.push('R2 index.js 没有调用 replayShift（楼层前移未被收口，登记表是死声明）');
if (!/_ledgerReplayLib\s*\(/.test(idxStripped)) defects.push('R2 index.js 缺少 _ledgerReplayLib 取库口（模块没有按契约接入）');

// ── R2b 回放入口真被执行（行为判据，主判据）──
// 形态在 ≠ 会执行：调用可能在死分支里、可能传错宿主、返回值可能被丢弃。
// 这里真跑一遍：加载 ledger-replay.js + index.js → 实例化 → rollbackFloor → 验报告。
{
    const R2B = replayBehaviorProbe();
    for (const d of R2B.defects) defects.push('R2b ' + d);
}

// ── R3 回放报告留痕且诊断面读取 ──
if (!/this\._lastReplayReport\s*=/.test(idxStripped)) defects.push('R3 回放报告没有真实赋值点 this._lastReplayReport（回放发生了但没人看得见）');
if (!/diagnoseLine\s*\(/.test(idxStripped)) defects.push('R3 selfCheck 没有读取回放诊断行（坏了没人知道）');

// ── R4 模块缺席的同形退路 ──
// 取库失败时必须仍能给出报告对象，而不是让删楼整段抛掉。
// 判据：宿主在调用回放后读取了报告的 .threw / .absent 字段（即承认「分态」而不是只看成功）。
if (!/\.threw\b/.test(idxStripped) || !/\.absent\b/.test(idxStripped)) {
    defects.push('R4 宿主没有消费回放报告的 threw/absent 分态（失败被当成成功吞掉）');
}

// ── R5 幂等（行为判据，直接对真模块跑） ──
{
    const host = {
        diary: {
            diaries: { a: [{ floor: 2 }, { floor: 7 }, { floor: 7 }] },
            removeByFloor(f) {
                let n = 0;
                for (const k of Object.keys(this.diaries)) {
                    const b = this.diaries[k].length;
                    this.diaries[k] = this.diaries[k].filter(e => e.floor !== f);
                    n += b - this.diaries[k].length;
                }
                return n;
            }
        }
    };
    const first = LR.replayDrop(host, 7);
    const second = LR.replayDrop(host, 7);
    const diaryItem = second.items.find(it => it.id === 'diary');
    if (!diaryItem || diaryItem.state !== 'ok' || diaryItem.count !== 0) {
        defects.push('R5 幂等失败：同一楼第二次回放仍撤掉 ' + (diaryItem ? diaryItem.count : '（缺项）') + ' 条');
    }
    if (first.threw !== 0) defects.push('R5 首次回放出现 threw（' + first.threw + '），回放引擎自身不稳');
    // 缺席必须如实：这个宿主只有 diary，其余应为 absent 或 no-op，绝不能是 ok 且 count>0
    const lied = first.items.filter(it => it.id !== 'diary' && it.state === 'ok' && it.count > 0);
    if (lied.length) defects.push('R5 缺席作假：' + lied.map(it => it.id).join(',') + ' 在没有数据的宿主上报了撤账');
}

// ── R6 不变量校验器自身可用（防 checkReplayInvariants 变成恒真） ──
{
    const bad = LR.checkReplayInvariants({ diary: [1, 5] }, { diary: [1, 5] }, 5);
    if (bad.ok) defects.push('R6 checkReplayInvariants 对残留楼层返回 ok（校验器恒真）');
    const good = LR.checkReplayInvariants({ diary: [1, 5] }, { diary: [1] }, 5);
    if (!good.ok) defects.push('R6 checkReplayInvariants 对干净结果返回失败（校验器恒假）');
}

if (defects.length) {
    console.error('[ledger-replay] ' + defects.length + ' 个缺陷:');
    for (const d of defects) console.error('  - ' + d);
    process.exit(1);
}
console.log('[ledger-replay] 卫生：登记 ' + owners.length + ' 本账，回放收口/留痕/分态/幂等全部成立');
process.exit(0);
