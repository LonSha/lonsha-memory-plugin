/* ============================================================
 * tests/v3295_x2_repair_flow.test.mjs — [v3.295.0 · X2] 证据到真实修复的操作流程
 *
 * 【本套件要证明的六件事（不是「函数返回了对象」）】
 *   ① **两态依赖判据可分**：`ref`（确切引用）与 `needle`（文本候选）不是同一强度。
 *      池项自报引用里含被修复对象的稳定 id ⇒ `basis:'ref'` / `why:'by-ref'`；
 *      只是正文里出现了名字 ⇒ `basis:'needle'`。同一件东西被两条路同时命中时，
 *      只留**更强**的那条（ref 胜），不去重成两条。
 *      ★ 并且 ref 通路必须**真能到达**：调用方给的 `refId` 经宿主装配口到池上，
 *      宿主 `facts` 池透出 `supersededBy`。否则 `basis` 恒 needle ——
 *      「按确切引用找影响」在**生产上不可达**（一条只在夹具里成立的判据）。
 *   ② **未覆盖范围必须报出来**：池缺席 ⇒ 该 kind 进 `absent`（判不了 ≠ 扫过了没有）；
 *      截断 ⇒ `note` 里点名 `kind(截断 扫到/总数)`；两者 ⇒ `coverage.state:'partial'`。
 *      宿主 `info` 与模块读键必须**同口径**（单数 kind）—— 写复数会让 `meta` 恒 null、
 *      截断读数永不触发，而「总共 900 条只看了 200 条」与「真的只有 200 条」同形。
 *   ③ **`dangling` 真报且与受影响分列**：与本次修复无关、却自报引用点不到的项进
 *      `dangling`，**不得**混进 `items`；`knownRefs` 里声明过的引用不算悬空。
 *   ④ **`evidenceOf` 三态且不膨胀 `applied`**：原数据 + 持久化回读均真 ⇒ `confirmed`；
 *      只其一 ⇒ `partial`；都不给 ⇒ `unconfirmed`（**不判为假也不判为真**）。
 *      记录级 `status` 口径逐字保持旧语义（全 done ⇒ `applied`），证据落在独立两字段上。
 *   ⑤ **`plan` 只读且逐项给出「谁改 / 能不能撤 / 拿什么证明」**：`wrote:false` 恒真、
 *      不碰台账（调完账逐字未动）；无逆操作面的类 ⇒ `revocable:false`；
 *      `needle` 项要求人先确认（`requires:['confirm-by-human']`）。
 *   ⑥ **落笔四步顺序不可换、候选默认不动、栅栏作废留痕**：
 *      `applyRepairPlan` 先改数据 → 再核原数据 → 后落盘回读 → 最后带证据 settle；
 *      `needle` 项默认落 `failed` + `candidate-unconfirmed`（不猜不改）；
 *      栅栏失效 ⇒ `stale:true` 且已落条数**如实计数**；
 *      异常分支**先留 `_lastRepairApply` 作废读数再返回 null**（防重试重复落笔）。
 *
 * 负控制一律：真源码破坏（锚点恰中 1 次）→ 重跑同款判据 → 必须现形。
 * 【当版锚点】形态按本仓 V4 惯例：**不写死版本号**，与三源同源比对（下限锚）。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { breakSource } from './_break_kit.mjs';
const R = process.cwd();
const require_ = createRequire(import.meta.url);
const IDX_SRC = fs.readFileSync(path.join(R, 'index.js'), 'utf8');
const RL_SRC = fs.readFileSync(path.join(R, 'repair-loop.js'), 'utf8');
const RL = require_(path.join(R, 'repair-loop.js'));
const PKG = JSON.parse(fs.readFileSync(path.join(R, 'package.json'), 'utf8')).version;
const vnum = (v) => String(v).split('.').map(Number);
const cmpVer = (a, b) => {
    const x = vnum(a), y = vnum(b);
    for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
    return 0;
};

/* ───────────────── 源码提取（靠花括号配平，不做文本猜测） ───────────────── */
function braceBlock(text, startIdx) {
    let depth = 0, end = -1;
    for (let i = startIdx; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > 0 ? text.slice(startIdx, end + 1) : null;
}
function blockOf(src, header) {
    const at = src.indexOf(header);
    if (at < 0) return null;
    const open = src.indexOf('{', at);
    if (open < 0) return null;
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > 0 ? src.slice(at, end + 1) : null;
}
function bridgeLiteralOf(src) {
    const marker = 'window.lonsha_memory_bridge_v1 = {';
    const at = src.indexOf(marker);
    if (at < 0) return null;
    return braceBlock(src, src.indexOf('{', at));
}
/**
 * 取方法体（**从 `){` 那个大括号开始**，不是从 header 里任意第一个 `{`）。
 * ★ 必须这样取的原因（本套件自己踩过的坑）：`async applyRepairPlan(opts = {}) {`
 *   的 header 里含 `{}`（默认参数），若从「第一个 `{`」起配平，配到的是那个默认值
 *   的右括号 —— 取出来的是半截签名，后面所有「取到方法体」断言都会以
 *   「取不到」的形式翻红，而根因在取法不在被测代码。
 */
function methodBody(src, header) {
    let at = src.indexOf(header);
    if (at < 0) return null;
    /* ★ 源码里该 header 紧跟 `async ` 就自动补上 —— 名单漏写 `async` 时，
     *   方法体里的 `await` 会被当标识符解析，报 `Unexpected token 'this'`，
     *   而报错点落在 `new Function` 上、现象指向「链路上游坏了」。
     *   取法自己把这件事做对，比指望每处名单都写全更可靠。 */
    if (at >= 6 && src.slice(at - 6, at) === 'async ') at -= 6;
    const close = src.indexOf(')', at);
    if (close < 0) return null;
    const open = src.indexOf('{', close);
    if (open < 0) return null;
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    /* 与 `blockOf` **同语义：含头部**（简写方法必须带 `name(args) {` 这一段，
     *   否则拼出来的对象字面量是裸块 ⇒ `new Function` 报 `Unexpected token '{'`）。 */
    return end > 0 ? src.slice(at, end + 1) : null;
}
/* 宿主方法名单：落笔链路要整条（含装配口与核验口）。缺一个 ⇒ 静默失败。 */
const HOST_METHODS = [
    '_repairPoolFor(input) {', '_repairPool() {', 'requestRepair(input) {', 'previewRepair(input) {',
    'settleRepair(input) {', 'abandonRepair(input) {', 'repairRevision() {',
    /* ★ `async` 必须原样带上（名单里也要写）：`applyRepairPlan` 的方法体里有
     *   `await this.storage.save(...)`，丢 `async` 后 `await` 被当标识符，
     *   紧接的 `this` 报 `Unexpected token 'this'`；而且这个错落在
     *   engineFrom 的 `new Function` 上，现象像「链路上游坏了」，其实只是名单漏字。 */
    '_repairOwners() {', 'async applyRepairPlan(opts = {}) {', '_verifyRepairItem(kind, key, note) {',
    '_leaseValid(lease) {', '_leaseDrop(lease, task, floor) {'
];
/**
 * 模块级取库口名单（**不是** class 方法：它们定义在 IIFE 顶层）。
 * ★ 为什么必须显式提取：宿主方法体内的 `_repairLoopLib()` / `_factVersionLib()` /
 *   `_eventCompletenessLib()` 都是**自由变量**。若只把方法体抠出来塞进 `new Function`，
 *   这些名字在哪里都不存在 ⇒ `ReferenceError: _repairLoopLib is not defined`，
 *   被方法自己的 try/catch 吞成 `{ok:false, reason:'thrown'}` ——
 *   现象是「登记必须成功」这类与判据毫无关系的红（本套件实测踩到）。
 * ★ 也不能靠给 `new Function` 传一个同名 lambda 参数：源码里的 `function _moduleLib(...)`
 *   **声明会遮蔽参数**，于是那个 lambda 一次都不会被调用，看起来一切正常、实则取库口是死的。
 *   故这里提取真函数、走它自己的「先读 window.<符号>」分支（与真宿主同一条路）。
 */
const LIB_FNS = [
    'function _moduleLib(getGlobal, fileName) {', 'function _repairLoopLib() {',
    'function _eventCompletenessLib() {', 'function _factVersionLib() {'
];
/** 真取库口的「全局面」：`_moduleLib` 先读 `window.<符号>`，故把真模块挂上去。 */
function makeLibWindow(rl, EC, CL, FV) {
    return {
        LonShaRepairLoop: rl || null,
        LonShaEventCompleteness: EC || null,
        LonShaFactVersion: FV || null,
        LonShaCommitmentLedger: CL || null,
    };
}
const CLASS_HEAD = 'class MemoryEngine {';

/** 造引擎：真宿主方法 + 真取库口（取库口注入真模块，不走 require 回落）。 */
function engineFrom(src, rl, EC, CL, FV) {
    const body = HOST_METHODS.map(h => {
        /* 用 methodBody 而非 blockOf：`applyRepairPlan(opts = {})` 的签名里就有 `{}`，
         *   从「第一个 `{`」起配平取到的是那个默认值 —— 拼出来的函数体是半截签名，
         *   报错形式是 `SyntaxError: Unexpected token '('`，
         *   而根因在提取器不在被测代码（本套件自己踩过）。 */
        const s = methodBody(src, h);
        assert.ok(s, '宿主方法在位：' + h);
        return s;
    }).join(',\n');
    const libs = LIB_FNS.map(h => {
        const s = methodBody(src, h);
        assert.ok(s, '模块级取库口在位：' + h);
        return s;
    }).join('\n');
    const eng = new Function(
        'errLog', 'PLUGIN_NAME', 'window',
        `${libs}\nreturn ({ ${body} });`
    )(() => {}, 'v3295', makeLibWindow(rl, EC, CL, FV));
    return Object.assign(eng, makeHost());
}
function bridgeFrom(src, plugin) {
    const lit = bridgeLiteralOf(src);
    const receipt = methodBody(src, 'function repairReceipt(extra) {');
    const revOf = methodBody(src, 'function repairRevisionOf() {');
    assert.ok(lit, '桥对象字面量可提取');
    assert.ok(receipt, '回执构造点在位');
    assert.ok(revOf, '修订取值口在位');
    /* 桥方法体内同样引用模块级取库口（`plan` / `applyPlan` 都调 `_repairLoopLib()`）：
     *   缺它们 ⇒ 桥一律回 `reason:'thrown'`，与「桥没接好」同形。 */
    const libs = LIB_FNS.map(h => {
        const s = methodBody(src, h);
        assert.ok(s, '模块级取库口在位：' + h);
        return s;
    }).join('\n');
    const body = `${libs}\n${receipt}\n${revOf}\nreturn (${lit});`;
    return new Function('plugin', 'window', body)(plugin, makeLibWindow(RL, EC, CL, FV));
}

/* ───────────────── 真模块（判据与落笔共用同一份库） ───────────────── */
const EC = require_(path.join(R, 'event-completeness.js'));
const CL = require_(path.join(R, 'commitment-ledger.js'));
const FV = require_(path.join(R, 'fact-version.js'));

/** 六池宿主：每条都能被「苏晴」命中；另备 ref/needle 两态与悬空用的条目。 */
function makeHost(extra) {
    const h = {
        config: { config: { debugMode: false } },
        _repairState: null,
        _mutationEpoch: 0,
        _eventThreadState: { events: [{ id: 'ev1', title: '苏晴 搬家的争执', segments: [], abandoned: false }] },
        graph: {
            edges: new Map(), rebuildNameIndex() {},
        },
        worldProg: { commitmentLedger: { items: [{ id: 'cm1', actor: '苏晴', content: '苏晴 答应搬家', status: 'open', history: [] }] } },
        _factVersionState: { facts: [{ id: 'f1', subject: '苏晴', predicate: '住', value: '老城', supersededBy: 'f2', history: [] }, { id: 'f2', subject: '苏晴', predicate: '住', value: '新城', history: [] }] },
        timeline: { entries: [{ id: 'tl1', text: '苏晴 搬走' }] },
        getCurrentChatId() { return 'chat-A'; },
        /* ★ 必须读 `this._repairState`：本例经 `Object.assign(eng, makeHost())` 造引擎，
         *   `h._repairState` 与 `eng._repairState` 是**两个对象**（复制而非共享）。
         *   闭包读 `h` 时，引擎写进去的状态永远到不了导出里 —— 落盘内容里
         *   `repairLog` 恒为 null，于是 `readback` 在夹具里恒假。真宿主的
         *   `collectExport()` 正是读 `this.*`。 */
        collectExport() { return { version: PKG, repairLog: this._repairState }; },
        __saved: [],
        __disk: null,
        /* ★ 真建模成**一对**（与 `StorageManager` 同语义）：
         *   `save` 把 payload 落到「盘」上（真实现写 `ctx.chatMetadata.extensions.lonsha_memory.data`），
         *   `load` 再从盘上读回同一份。若让 `load()` 回**运行时当前**状态，
         *   那么「落盘」这一步在夹具里等于没发生 —— 被证的东西与真宿主不是同一件
         *   （本套件实测踩到：readback 判定过一个在夹具里恒真的条件）。 */
        storage: {
            async save(chatId, payload) {
                h.__saved.push('s');
                h.__disk = JSON.parse(JSON.stringify(payload || null));
                return true;
            },
            async load() {
                return { repairLog: (h.__disk && h.__disk.repairLog) ? h.__disk.repairLog : null };
            },
        },
    };
    Object.assign(h, {
        summary: {
            getActiveSummaries: () => [{ floor: 3, text: '苏晴 搬家', sourceRefs: ['f1'] }],
            updateSummaryText(floor, t) {
                const s = this.getActiveSummaries().find(x => Number(x.floor) === Number(floor));
                if (!s) return false;
                s.text = t; return true;
            },
        },
    });
    if (extra) Object.assign(h, extra);
    return h;
}
/**
 * 造一整套宿主 + 桥。
 * @param rl       模块（默认真模块）
 * @param hostSrc  宿主源码（默认 INDEX_SRC）。**负控制必须传破坏副本** ——
 *                 否则被判的其实是原版，判据「没现形」与「没跑过」同形。
 */
function ctx(rl, hostSrc) {
    const src = hostSrc || IDX_SRC;
    const host = engineFrom(src, rl || RL, EC, CL, FV);
    const bridge = bridgeFrom(src, { engine: host });
    return { host, bridge };
}

/* ──────────────────────────────────────────────────────────
 * 判据（原版必须全绿；破坏副本上必须翻红）
 * ────────────────────────────────────────────────────────── */
/** 判据 A：ref / needle 两态可分，且同项被两条路命中时只留更强的那条。 */
function judgeABasis(RLx) {
    const pool = {
        summaries: [{ key: 'sum_3', text: '苏晴 搬家' }],
        facts: [
            { key: 'fx', text: '无关正文', supersededBy: 'TGT' },      // ref：自报引用 == 被修复对象 id
            { key: 'fy', text: '苏晴 住老城', supersededBy: 'OTHER' }, // needle：正文撞名
        ],
        knownRefs: ['TGT'],
    };
    const r = RLx.affectedBy('revoke', '苏晴', '苏晴', Object.assign({ refId: 'TGT' }, pool));
    if (!r || !Array.isArray(r.items)) return '新契约必须返回 { items, coverage, dangling }';
    const fx = r.items.find(i => i.key === 'fx');
    const fy = r.items.find(i => i.key === 'fy');
    if (fx && fx.basis !== 'ref') return '自报引用含 refId ⇒ basis 必须是 ref，实 ' + (fx && fx.basis);
    if (fx && fx.why !== 'by-ref') return 'ref 命中的 why 是 by-ref，实 ' + (fx && fx.why);
    if (fy && fy.basis !== 'needle') return '仅正文撞名 ⇒ basis 必须是 needle，实 ' + (fy && fy.basis);
    /* 同项两条路都命中：只留一条，且是更强的那条。 */
    const both = RLx.affectedBy('revoke', '苏晴', '苏晴', {
        refId: 'TGT',
        facts: [{ key: 'fz', text: '苏晴', supersededBy: 'TGT' }],
    });
    const hits = both.items.filter(i => i.key === 'fz');
    if (hits.length !== 1) return '同 kind+key 只准留一条（ref 胜 needle），实 ' + hits.length;
    if (hits[0].basis !== 'ref') return '两条路都命中时须留更强的 ref';
    return '';
}
/** 判据 B：未覆盖范围必须报出来（池缺席 / 截断），且 note 可读。 */
function judgeBCoverage(RLx) {
    const all = { state: 'partial', scanned: {}, absent: [], truncated: {}, note: '' };
    /* ① 池缺席：没给 info 且数组为空 ⇒ 判不了（不是「扫过了没有」）。 */
    const r0 = RLx.affectedBy('revoke', '苏晴', '苏晴', { facts: [{ key: 'f1', text: '苏晴' }] });
    if (!r0.coverage) return 'coverage 必须在场';
    if (r0.coverage.absent.indexOf('summary') < 0) return '空且无读数 ⇒ 该池进 absent（判不了）';
    if (r0.coverage.state !== 'partial') return '有池缺席 ⇒ state 是 partial';
    /* ② 给了 info 且 total=0 ⇒ 是真的空池（已覆盖），**不算缺席**。 */
    const r1 = RLx.affectedBy('revoke', '苏晴', '苏晴', { info: { summary: { scanned: 0, total: 0 } }, summaries: [] });
    if (r1.coverage.absent.indexOf('summary') >= 0) return '给了读数且 total=0 ⇒ 是真空池，不得算缺席';
    /* ③ 截断：扫到的比总数少 ⇒ note 点名「谁、截了多少」。 */
    const r2 = RLx.affectedBy('revoke', '苏晴', '苏晴', {
        relations: [{ key: 'A->B', text: '苏晴' }],
        info: { relation: { scanned: 200, total: 900 } },
    });
    if (!r2.coverage.truncated || !r2.coverage.truncated.relation) return '截断必须被记下（relation）';
    /* note 里的名字是 **kind（单数）**（逐条按 kind 报，不按池键）；
     *   写成复数的话这条断言在原版上**恒假** —— 一条永不成立的判据（本仓同族病）。 */
    if (!/relation\(截断 200\/900\)/.test(String(r2.coverage.note))) return 'note 须点名截断范围，实 ' + r2.coverage.note;
    if (r2.coverage.state !== 'partial') return '有截断 ⇒ state 是 partial';
    /* ④ info 键口径：模块按 kind（单数）读；写复数也应被容忍，不得静默当作没截断。 */
    const r3 = RLx.affectedBy('revoke', '苏晴', '苏晴', {
        facts: [{ key: 'f1', text: '苏晴' }],
        info: { facts: { scanned: 5, total: 50 } },
    });
    if (!r3.coverage.truncated || !r3.coverage.truncated.fact) return 'info 写复数键时也必须被认到（静默取不到 = 判不了被当成没截断）';
    return '';
}
/** 判据 C：dangling 真报，且与受影响**分列**；knownRefs 声明过的不算悬空。 */
function judgeCDangling(RLx) {
    const r = RLx.affectedBy('revoke', '苏晴', '苏晴', {
        facts: [{ key: 'f1', text: '无关内容', supersededBy: 'MISSING_ID' }],
    });
    if (!(r.items.length === 0)) return '与本次修复无关的项不得进 items，实 ' + r.items.length;
    if (!r.dangling.length) return '自报引用点不到 ⇒ 必须进 dangling';
    if (String(r.dangling[0].ref) !== 'MISSING_ID') return 'dangling 须带那条点不到的引用，实 ' + r.dangling[0].ref;
    if (String(r.dangling[0].kind) !== 'fact') return 'dangling 须带 kind';
    /* 声明过 ⇒ 不算悬空（同一份世界，两个出口各自回答一件事）。 */
    const r2 = RLx.affectedBy('revoke', '苏晴', '苏晴', {
        knownRefs: ['MISSING_ID'],
        facts: [{ key: 'f1', text: '无关内容', supersededBy: 'MISSING_ID' }],
    });
    if (r2.dangling.length !== 0) return 'knownRefs 里声明过的引用不得再报悬空';
    return '';
}
/** 判据 D：证据三态，且**不膨胀** applied（记录级 status 保持旧语义）。 */
function judgeDEvidence(RLx) {
    const e = RLx.evidenceOf;
    if (typeof e !== 'function') return 'evidenceOf 必须在场';
    if (e({ originData: true, persistedReadback: true }) !== 'confirmed') return '两条都真 ⇒ confirmed';
    if (e({ originData: true }) !== 'partial') return '只其一 ⇒ partial';
    if (e({ persistedReadback: true }) !== 'partial') return '只其一 ⇒ partial';
    if (e({}) !== 'unconfirmed') return '都不给 ⇒ unconfirmed（不判为假也不判为真）';
    if (e({ originData: false }) !== 'unconfirmed') return '显式 false 不是 true ⇒ unconfirmed';
    /* 全 done（无据）⇒ 记录级 status 仍是 applied（旧语义），但证据必须另立一维。 */
    let st = { version: RLx.RL_VERSION, seq: 0, repairs: [] };
    st = RLx.request(st, { action: 'revoke', subject: '苏晴', target: '苏晴', pool: { facts: [{ key: 'f1', text: '苏晴' }] } }).state;
    const id = st.repairs[0].id;
    st = RLx.settle(st, { id, key: 'f1', kind: 'fact', status: 'done' }).state;
    const rec = st.repairs.find(r => r.id === id);
    if (rec.status !== 'applied') return '全 done ⇒ status 必须是 applied（旧语义逐字保持），实 ' + rec.status;
    if (rec.evidence === 'confirmed') return '无据的 done **不得**记成 confirmed';
    if (!(rec.unproven > 0)) return '无据的 done 必须被计进 unproven';
    /* 补上证据再报一次：幂等判据必须带上证据，否则这次重放会把证据丢掉。 */
    const before = JSON.stringify(st.repairs[0]);
    st = RLx.settle(st, { id, key: 'f1', kind: 'fact', status: 'done', originData: true, persistedReadback: true }).state;
    const rec2 = st.repairs.find(r => r.id === id);
    if (rec2.affected[0].evidence !== 'confirmed') return '补证据的第二次落定必须被采纳（幂等须比证据，不只比 status）';
    if (JSON.stringify(st.repairs.find(r => r.id === id)) === before) return '证据必须真的落到记录上';
    return '';
}
/** 判据 E：plan 只读、逐项给出谁改 / 能不能撤 / 拿什么证明。 */
function judgeEPlan(RLx) {
    const pool = {
        facts: [{ key: 'f1', text: '苏晴', supersededBy: 'TGT' }],
        summaries: [{ key: 'sum_3', text: '苏晴 搬家' }],
        knownRefs: ['TGT'],
    };
    const p = RLx.plan({ action: 'revoke', subject: '苏晴', target: '苏晴', refId: 'TGT', pool });
    if (!p.ok) return '合法输入必须给方案，实 reason=' + p.reason;
    if (p.wrote !== false) return 'plan 必须恒自报 wrote:false（只读面）';
    if (!p.steps.length) return '方案必须有项';
    const ref = p.steps.find(s => s.basis === 'ref');
    const ndl = p.steps.find(s => s.basis === 'needle');
    if (ref && ref.requires.indexOf('same-ref') < 0) return '确切引用项可直接按引用改（requires: same-ref）';
    if (ndl && ndl.requires.indexOf('confirm-by-human') < 0) return '文本候选项必须先由人确认';
    for (const s of p.steps) {
        if (!('inverse' in s) || !('revocable' in s)) return '每项必须带 inverse / revocable';
        if (!Array.isArray(s.evidence) || s.evidence.length !== 2) return '每项必须给出两条证据口径';
        if (!s.owner) return '每项必须点出 owner（谁改）';
    }
    /* 无逆操作面的类：revocable 必须为 false（不得假装有）。 */
    const p2 = RLx.plan({ action: 'revoke', subject: '苏晴', target: '苏晴', pool: { summary: [{ key: 'sum_3', text: '苏晴' }] } });
    const bad = p2.steps.some(s => s.kind === 'summary' && s.inverse !== 'restore-text');
    if (bad) return '语义逆操作名必须来自 INVERSE 单真源';
    if (!RLx.INVERSE || RLx.INVERSE.summary !== 'restore-text') return 'INVERSE 必须在场且是唯一真源';
    if (String(p.byRef) !== 'undefined' && p.byRef + p.byNeedle !== p.total) return 'byRef/byNeedle 必须分列且合起来等于 total';
    return '';
}
/**
 * 判据 F：落笔链路（真宿主）—— 顺序 / 候选默认不动 / 回读 / 证据。
 * @param hostSrc 宿主源码（负控制传破坏副本；默认原版）。
 */
async function judgeFApply(hostSrc) {
    const c = ctx(undefined, hostSrc);
    const req = c.host.requestRepair({ action: 'revoke', subject: '苏晴', target: '苏晴', refId: 'f2', dedupeKey: 'k1' });
    if (!req.ok) return '登记必须成功';
    const id = req.repair.id;
    /* needle 项默认不动。 */
    const r = await c.host.applyRepairPlan({ id });
    if (!r) return '落笔必须给回执（模块在场时）';
    const ndl = (r.items || []).filter(x => x.basis === 'needle');
    if (!ndl.length) return '宿主池里应有 needle 候选（供本条验「默认不动」）';
    if (ndl.some(x => x.status === 'done')) return 'needle 候选默认不得被动过（不猜不改）';
    if (ndl.some(x => x.reason !== 'candidate-unconfirmed')) return 'needle 候选的落定原因须是 candidate-unconfirmed';
    /* ref 项必须真改了数据、真核了原数据、真落了盘。 */
    const ref = (r.items || []).filter(x => x.basis === 'ref');
    if (!ref.length) return '宿主池里应有 ref 项';
    if (!ref.every(x => x.status === 'done')) return 'ref 项必须落 done，实 ' + JSON.stringify(ref.map(x => x.status));
    if (!ref.every(x => x.originData === true)) return 'ref 项必须核到原数据（originData）';
    if (r.readback !== true) return '落盘回读必须是真（readback）';
    if (!c.host.__saved.length) return '必须真的调用过保存';
    /* 事实真被撤销了（数据层面）：**被撤的是 ref 项 f1**，不是 refId 指向的 f2。
     *   `refId:'f2'` 的语义是「f2 是**被修复的对象**」，受影响的是自报引用了它的派生件
     *   （f1 的 supersededBy === 'f2'）；f2 自己只是文本命中（needle ⇒ 默认不动）。
     *   本条判据曾断言 f2.revoked —— 它**恒假**（与代码无关的一条永不成立的判据）。 */
    const f1 = c.host._factVersionState.facts.find(x => x.id === 'f1');
    if (!f1 || f1.revoked !== true) return 'owner 面必须真把数据改掉（ref 项 f1.revoked）';
    const f2 = c.host._factVersionState.facts.find(x => x.id === 'f2');
    if (f2 && f2.revoked === true) return 'needle 候选（f2）不得被自动撤销';
    /* 记录级：ref 已证、needle 未落定 ⇒ 不是全落定。 */
    const rec = c.host._repairState.repairs.find(x => x.id === id);
    if (!rec) return '账上必须有这条记录';
    if (rec.affected.filter(x => x.basis === 'needle' && x.status !== 'failed').length) return 'needle 项不得留 pending 之外的态';
    return '';
}

/* ───────────────── 正向：全部判据在原版上必须全绿 ───────────────── */
test('v3295 0. 正向：全部判据在原版上必须全绿（负控制的前提）', async () => {
    const bad = [
        ['A 两态判据', judgeABasis(RL)],
        ['B 未覆盖范围', judgeBCoverage(RL)],
        ['C 悬空依赖', judgeCDangling(RL)],
        ['D 证据三态', judgeDEvidence(RL)],
        ['E 只读方案', judgeEPlan(RL)],
        ['F 落笔链路', await judgeFApply()],
    ].filter(x => x[1] !== '');
    assert.deepEqual(bad, [], '原版上判据必须全绿：' + JSON.stringify(bad));
});

test('v3295 1. 模块导出契约：四个新常量 + 新出口都在，且 BASES 两态齐全', () => {
    assert.ok(RL.BASES && RL.BASES.indexOf('ref') >= 0 && RL.BASES.indexOf('needle') >= 0, 'BASES 两态');
    assert.deepEqual(RL.EVIDENCE.slice().sort(), ['confirmed', 'partial', 'unconfirmed'], '证据三态');
    assert.deepEqual(RL.COVERAGE_STATE.slice().sort(), ['full', 'partial'], '覆盖度两态');
    assert.deepEqual(Object.keys(RL.INVERSE).sort(), RL.KINDS.slice().sort(), '六类都要有语义逆操作名（缺一类 = 那类不可撤却不说）');
    assert.equal(typeof RL.plan, 'function', 'plan 导出');
    assert.equal(typeof RL.evidenceOf, 'function', 'evidenceOf 导出');
    /* 语义名是**语义**不是方法名：方法名归宿主，模块持有第二份就是第二份真源。 */
    for (const k of RL.KINDS) assert.ok(!/\(/.test(RL.INVERSE[k]), '逆操作名必须是语义名：' + k);
});

test('v3295 2. affectedBy 新契约：返回 { items, coverage, dangling }（不再是裸数组）', () => {
    const r = RL.affectedBy('revoke', '苏晴', '苏晴', { facts: [{ key: 'f1', text: '苏晴' }] });
    assert.ok(!Array.isArray(r), '不得再返回裸数组（裸数组带不动未覆盖范围与悬空）');
    assert.ok(Array.isArray(r.items) && r.coverage && Array.isArray(r.dangling), '三键齐备');
});

test('v3295 3. 宿主侧口径对齐：refId 装配口 + info 按 kind 写 + supersededBy 透出', () => {
    /* ① 池的装配口必须在场，且三个判定入口都走它（否则「预览是候选、登记是引用」）。 */
    assert.ok(IDX_SRC.indexOf('_repairPoolFor(input) {') > 0, '池装配口在场');
    const uses = IDX_SRC.match(/_repairPoolFor\(input\)/g) || [];
    assert.ok(uses.length >= 3, '三个入口都要走装配口（request/preview/plan），实 ' + uses.length);
    assert.ok(IDX_SRC.indexOf('_repairPoolFor(input)') < IDX_SRC.indexOf('_repairPool() {'), '装配口必须在池本体之前（可读性：先看契约后看实现）');
    /* ② info 的键必须按 kind（单数）——写复数会让模块侧 meta 恒 null。 */
    for (const k of ['summary', 'event', 'relation', 'promise', 'fact', 'timeline']) {
        assert.ok(IDX_SRC.indexOf('info.' + k + ' = {') > 0, 'info 键必须是 kind（单数）：' + k);
    }
    assert.ok(IDX_SRC.indexOf('info.summaries = {') < 0, '不得再写复数的 info 键（静默取不到 = 截断永不触发）');
    /* ③ supersededBy 必须透出（ref 通路的真实来源）。 */
    assert.ok(/facts = all\.map\([^)]*supersededBy/.test(IDX_SRC), 'facts 池必须透出 supersededBy');
    /* ④ 模块侧 refsOf 必须读真字段。 */
    assert.ok(/push\(it\.eventKey\)/.test(RL_SRC) && /push\(it\.supersededBy\)/.test(RL_SRC),
        'refsOf 必须读本仓真实存在的跨条引用（eventKey / supersededBy）');
    assert.ok(RL_SRC.indexOf('sourceRefs') > 0, '旧字段保留（老调用点仍可自报）');
});

test('v3295 4. 落笔链路四步顺序不可换：改数据 → 核原数据 → 落盘回读 → 带证据 settle', () => {
    const at = IDX_SRC.indexOf('async applyRepairPlan(opts = {}) {');
    assert.ok(at > 0, 'applyRepairPlan 在场');
    const body = methodBody(IDX_SRC, 'async applyRepairPlan(opts = {}) {');
    assert.ok(body && body.length > 500, '取到方法体');
    const iOwner = body.indexOf('fn({ kind: step.kind');
    const iVerify = body.indexOf('this._verifyRepairItem(step.kind');
    const iSave = body.indexOf('this.storage.save(');
    /* ★ 与「带证据那一次 settle」比，而不是与**首次** settle 比：
     *   失败项（候选未确认 / 无逆操作面）的 settle 就在 owner 循环里，本来就在保存之前 ——
     *   它们根本不该等落盘（等落盘才拒绝，等于把「不动」说成「落盘之后才知道要拒绝」）。
     *   本判据要锁的是：**证明**（原数据 + 回读）必须先于**带证据的落定**。 */
    const iEvidenceLoop = body.indexOf('for (const res of results)');
    const iEvidenceSettle = body.indexOf('RL.settle(st, {', iEvidenceLoop);
    assert.ok(iOwner > 0 && iVerify > 0 && iSave > 0 && iEvidenceSettle > 0, '四步都在');
    assert.ok(iOwner < iVerify, '必须先改数据再核原数据（顺序反了就是「先声明后动手」）');
    assert.ok(iVerify < iSave, '必须先核原数据再落盘（合成一步会把「落盘成功」当成「改对了」）');
    assert.ok(iSave < iEvidenceSettle, '必须落盘回读后才带证据 settle');
    /* 回读只做一次（N 项 N 次就是 N 次全量序列化）。 */
    assert.equal((body.match(/this\.storage\.load\(/g) || []).length, 1, '回读只准一次（覆盖本次全部已改项）');
    /* 候选默认不动。 */
    assert.ok(body.indexOf('allowCandidates') > 0, '候选闸门必须在场');
    assert.ok(body.indexOf('candidate-unconfirmed') > 0, '候选未确认须落可读原因');
    /* 无逆操作面如实拒绝。 */
    assert.ok(body.indexOf("'no-inverse'") > 0, '无逆操作面须如实落 no-inverse');
});

test('v3295 5. 落笔异常分支必须留证（不得静默降级成「没成」）', () => {
    const at = IDX_SRC.indexOf('async applyRepairPlan(opts = {}) {');
    const body = methodBody(IDX_SRC, 'async applyRepairPlan(opts = {}) {');
    assert.ok(body.indexOf('this._lastRepairApply = {') > 0, '作废读数必须在场');
    assert.ok(/why: 'threw'/.test(body), '异常归因须指向「抛了」');
    /* catch 分支必须在 return null 之前留痕（先后顺序：留痕然后在手前）。 */
    const iCatch = body.lastIndexOf('catch (e) {');
    const iNote = body.indexOf("why: 'threw'");
    const iNull = body.lastIndexOf('return null;');
    assert.ok(iCatch > 0 && iNote > iCatch && iNull > iNote, '留痕必须在 return null 之前（先留证再降级）');
    /* 留痕自身自兜：登记的失败不得成为新的失败。 */
    const seg = body.slice(iNote - 300, iNote);
    assert.ok(seg.indexOf('try {') >= 0, '留痕块必须自兜（try 包住）');
});

test('v3295 6. 栅栏失效如实计数：stale 时已落的条数不得被抹成 0', () => {
    const at = IDX_SRC.indexOf('async applyRepairPlan(opts = {}) {');
    const body = methodBody(IDX_SRC, 'async applyRepairPlan(opts = {}) {');
    assert.ok(body.indexOf('_leaseValid(lease)') > 0, '代际栅栏复核必须在场');
    assert.ok(/stale: stale/.test(body), 'stale 必须如实透出');
    assert.ok(/applied: applied/.test(body), '已落条数必须如实计数（作废不等于没落）');
    assert.ok(body.indexOf("_leaseDrop(lease, 'repairPlan'") > 0, '作废必须留痕（谁在什么时候被丢掉）');
    assert.ok(/reason: stale \? 'epoch-changed'/.test(body), '作废须有可读归因');
});

test('v3295 7. 回执 13 键恒定（含落笔四项读数；失败分支与成功分支同形）', () => {
    const receipt = blockOf(IDX_SRC, 'function repairReceipt(extra) {');
    assert.ok(receipt, '回执构造点在位');
    for (const k of ['applied', 'verified', 'readback', 'items']) {
        assert.ok(receipt.indexOf(k + ':') > 0, '回执必须带落笔读数：' + k);
    }
    /* readback 三态：没尝试（null）不得与试了失败（false）同形。 */
    assert.ok(/readback: \(e\.readback === true\) \? true : \(e\.readback === false \? false : null\)/.test(receipt),
        'readback 必须三态 true/false/null');
    const T = fs.readFileSync(path.join(R, 'tests/v3215_repair_write_channel.test.mjs'), 'utf8');
    assert.ok(/const RECEIPT_KEYS = \[[^\]]*'applied'[^\]]*'items'[^\]]*\];/.test(T), 'v3215 的键集常量必须同批扩到 13 键');
    assert.ok(T.indexOf('13 键恒定') > 0, 'v3215 的形状判据文案必须同批更新（否则测的是旧口径）');
});

test('v3295 8. 桥面 plan / applyPlan：读不需要对表，写与 apply 同规格两道门', async () => {
    const c = ctx();
    const plan = c.bridge.repair.plan({ action: 'revoke', subject: '苏晴', target: '苏晴' });
    assert.equal(plan.ok, true, '桥 plan 必须成功（只读）');
    assert.ok(Array.isArray(plan.affected), 'plan 的 affected 来自 steps');
    assert.equal(c.host._repairState, null, 'plan 不得碰台账');
    /* `applyPlan` 是 async（它要落盘 + 回读）：不 await 拿到的是 Promise，
     *   `reason` 为 undefined —— 那是「判据没测到东西」，不是「门没生效」。 */
    const gate1 = await c.bridge.repair.applyPlan({ action: 'revoke' });
    assert.equal(gate1.reason, 'missing-idempotency-key', 'applyPlan 门①与 apply 同规格');
    const gate2 = await c.bridge.repair.applyPlan({ idempotencyKey: 'k', expectRevision: 99 });
    assert.equal(gate2.reason, 'revision-mismatch', 'applyPlan 门②与 apply 同规格');
    /* 两个写动作的门必须复用**逐字相同**的守卫（一半严一半松，调用方会把重试放去松的那边）。 */
    assert.equal((IDX_SRC.match(/i\.idempotencyKey == null \? '' : i\.idempotencyKey/g) || []).length, 2,
        '两个写动作复用同一道门①');
});

test('v3295 9. 工具自证：锚点不存在 / 不唯一 / 同值替换必须抛', () => {
    assert.throws(() => breakSource(RL_SRC, '__NO_SUCH_ANCHOR__', 'x', 'ghost'), /恰中 1 次|锚点/, '锚点不存在必须抛');
    assert.throws(() => breakSource(RL_SRC, 'return ', 'return ', 'noop'), /必须真的改变源码|恰中 1 次|锚点/, '同值替换/不唯一必须抛');
});

/* ───────────────── 负控制：真源码破坏（同一套判据必须翻红） ───────────────── */
function loadBrokenRL(src, mutate) {
    const broken = mutate(src);
    assert.notStrictEqual(broken, src, '破坏必须真的发生');
    const saved = globalThis.LonShaRepairLoop;
    const tmp = path.join(R, '__negctl_x2.tmp.cjs');
    fs.writeFileSync(tmp, broken);
    let api;
    try {
        delete require_.cache[require_.resolve(tmp)];
        api = require_(tmp);
    } finally {
        try { fs.unlinkSync(tmp); } catch (_e) { /* 清理失败不影响判定 */ }
        if (saved) { try { globalThis.LonShaRepairLoop = saved; } catch (_e) { /* 冻结全局：忽略 */ } }
    }
    return api;
}

test('v3295 N1. 负控制：拆「两态可分」⇒ 判据 A 翻红（只要 needle 一态）', () => {
    const broken = loadBrokenRL(RL_SRC, (s) => breakSource(s,
        "        const basis = hitRef ? 'ref' : 'needle';",
        "        const basis = 'needle';",
        'x2-basis-collapse'));
    assert.notEqual(judgeABasis(broken), '', '两态坍缩后判据 A 必须现形');
    assert.equal(judgeABasis(RL), '', '原版同判据必须通过（反向对照）');
});

test('v3295 N2. 负控制：拆「未覆盖须报」⇒ 判据 B 翻红（coverage 恒 full）', () => {
    const broken = loadBrokenRL(RL_SRC, (s) => breakSource(s,
        "    if (absent.length || Object.keys(truncated).length) {",
        "    if (false) {",
        'x2-coverage-full'));
    assert.notEqual(judgeBCoverage(broken), '', 'coverage 恒 full 后判据 B 必须现形');
    assert.equal(judgeBCoverage(RL), '', '原版同判据必须通过');
});

test('v3295 N3. 负控制：拆「悬空与受影响分列」⇒ 判据 C 翻红', () => {
    const broken = loadBrokenRL(RL_SRC, (s) => breakSource(s,
        "          for (const r of refs) if (!known.has(r)) dangling.push({ kind: kind, key: key || body.slice(0, 40), ref: r });",
        "          for (const r of refs) if (!known.has(r)) { dangling.push({ kind: kind, key: key || body.slice(0, 40), ref: r }); items.push({ kind: kind, key: (key || body.slice(0, 40)) + '#dangling', why: 'by-ref', basis: 'ref', status: 'pending', note: '', evidence: 'unconfirmed' }); }",
        'x2-dangling-merged'));
    assert.notEqual(judgeCDangling(broken), '', '悬空混进 affected 后判据 C 必须现形');
    assert.equal(judgeCDangling(RL), '', '原版同判据必须通过');
});

test('v3295 N4. 负控制：拆「无据不算 confirmed」⇒ 判据 D 翻红', () => {
    const broken = loadBrokenRL(RL_SRC, (s) => breakSource(s,
        "    const ev = evidenceOf(i);",
        "    const ev = 'confirmed';",
        'x2-evidence-always'));
    assert.notEqual(judgeDEvidence(broken), '', '证据恒 confirmed 后判据 D 必须现形');
    assert.equal(judgeDEvidence(RL), '', '原版同判据必须通过');
});

test('v3295 N5. 负控制：拆「候选须人确认」⇒ 判据 E 翻红', () => {
    const broken = loadBrokenRL(RL_SRC, (s) => breakSource(s,
        "        requires: it.basis === 'ref' ? ['same-ref'] : ['confirm-by-human'],",
        "        requires: ['same-ref'],",
        'x2-candidate-requires'));
    assert.notEqual(judgeEPlan(broken), '', '候选不再要求人确认后判据 E 必须现形');
    assert.equal(judgeEPlan(RL), '', '原版同判据必须通过');
});

test('v3295 N6. 负控制：拆宿主「候选默认不动」⇒ 判据 F 翻红', async () => {
    /* 宿主破坏：把候选闸门短路（候选会被当 ref 一样落笔）。 */
    const brokenSrc = breakSource(IDX_SRC,
        "                    if (step.basis === 'needle' && !allowCandidates) {",
        "                    if (false) {",
        'x2-host-candidate-gate');
    const host = engineFrom(brokenSrc, RL, EC, CL, FV);
    const bridge = bridgeFrom(brokenSrc, { engine: host });
    const c = { host, bridge };
    const req = c.host.requestRepair({ action: 'revoke', subject: '苏晴', target: '苏晴', refId: 'f2', dedupeKey: 'k1' });
    assert.equal(req.ok, true, '登记成功');
    const r = await c.host.applyRepairPlan({ id: req.repair.id });
    assert.ok(r, '落笔必须给回执');
    const ndl = (r.items || []).filter(x => x.basis === 'needle');
    assert.ok(ndl.some(x => x.status === 'done'), '拆掉候选闸门后候选确实被落笔了（行为已改变）');
    /* ★ 同一判据必须在**破坏副本**上跑（传 brokenSrc）。修前这里写的是无参调用
     *   ⇒ `judgeFApply` 内部用原版源码造引擎，跑的是原版，「判据没现形」于是
     *   与「判据根本没在副本上跑过」完全同形（负控制的典型假红）。 */
    assert.notEqual(await judgeFApply(brokenSrc), '', '同一判据必须在破坏副本上现形（候选被动过）');
    assert.equal(await judgeFApply(), '', '原版同判据必须通过（反向对照）');
});

/* ───────────────── 版本卫生 ───────────────── */
test('v3295 V. 三源同源且不低于 X2 出生版本（下限锚）', () => {
    const man = JSON.parse(fs.readFileSync(path.join(R, 'manifest.json'), 'utf8')).version;
    const idx = (IDX_SRC.match(/const VERSION = '([0-9.]+)'/) || [])[1];
    assert.ok(idx, 'index.js 版本真值可取');
    assert.equal(man, idx, 'manifest 与 index 必须同源');
    assert.equal(PKG, idx, 'package.json 与 index 必须同源');
    assert.ok(cmpVer(idx, '3.295.0') >= 0, '版本不得低于出生版本 3.295.0，实 ' + idx);
    const top = (fs.readFileSync(path.join(R, 'CHANGELOG.md'), 'utf8').match(/^## (v[0-9.]+)/m) || [])[1];
    assert.equal(top, 'v' + idx, 'CHANGELOG 顶节应是当版（实 ' + top + '）');
});