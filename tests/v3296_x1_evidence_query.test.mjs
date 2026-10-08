/* ============================================================
 * tests/v3296_x1_evidence_query.test.mjs — [v3.296.0 · X1] 结构化证据查询与完整度
 *
 * 【本套件要证明的八件事（不是「函数返回了对象」）】
 *   ① **超 200 条的旧证据仍能按需检索**（X1 验收原文第一条，本版存在的全部理由）：
 *      造一本 900 条的账，目标条目落在**最老那一条**（即工作台摘要面的 200 条之外）。
 *      同一台机器上**同时**证明两件事：`evidence-workbench.search()` 找不到它（摘要面
 *      确实只覆盖尾部 200 条），而 `evidence-query.query()` 找得到它（直读原账全量）。
 *      只证后者是「函数能跑」，两件一起证才是「缺口真被补上」。
 *   ② **楼层三态不压平**：`floor:0` 是真楼层，`floor:null`（未给）既不得被当成 0 楼命中，
 *      也不得被当成「不满足区间」静默丢 —— 被排除的无楼层行必须**单独计数并点名原因**。
 *   ③ **分页由匹配总数驱动，翻过头不回落**：`page > pages` 时 `rows` 为空且
 *      `pageOutOfRange:true`。回落第一页会让「你翻过头了」与「这就是全部」同形。
 *   ④ **区间反转按空集且必须给理由**：不自动交换（交换会查出另一个区间而不报错）。
 *   ⑤ **三态处置相反者不得同形**：`module-unavailable`（模块没挂）/ `state-missing`
 *      （宿主没这本账）/ `empty`（账在位且空）/ `ok` 四者各落各格，计数分列。
 *   ⑥ **查询重放一致，且保存的是条件不是结果**：同条件覆盖、异条件并存的按键去重；
 *      重放走**当前原账**（原账一改，重放读数跟着变 —— 这才叫「用当前数据重跑」）。
 *   ⑦ **未知条件名不静默忽略**：进 `droppedKeys` 并如实回报。
 *   ⑧ **宿主真接线**：取库口（真读表达式 + 文件名）/ 四个只读口 / 诊断行 / 加载面登记；
 *      且宿主**不得再抄一份账本登记表**（登记表的单一真源在 evidence-workbench.js）。
 *
 * 负控制一律：真源码破坏（锚点恰中 1 次）→ 在**破坏副本**上重跑**同款真判据** → 必须现形；
 *   并反向对照「原版同判据必须通过」。★ 三形假绿的统一修法：破坏打在真源码上、
 *   判据在副本上跑（不对原文件断言）、破坏不许把判据自己删掉。
 * 【当版锚点】形态按本仓 V4 惯例：**不写死版本号**，与四源同源比对（下限锚）。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { breakSource } from './_break_kit.mjs';

const R = process.cwd();
const require_ = createRequire(import.meta.url);
const Q_SRC = fs.readFileSync(path.join(R, 'evidence-query.js'), 'utf8');
const WB_SRC = fs.readFileSync(path.join(R, 'evidence-workbench.js'), 'utf8');
const IDX_SRC = fs.readFileSync(path.join(R, 'index.js'), 'utf8');
const MF = JSON.parse(fs.readFileSync(path.join(R, 'manifest.json'), 'utf8'));
const PKG = JSON.parse(fs.readFileSync(path.join(R, 'package.json'), 'utf8')).version;
const Q = require_(path.join(R, 'evidence-query.js'));
const W = require_(path.join(R, 'evidence-workbench.js'));
const LEDGERS = W.LEDGERS;
/** 账本 API 表：本套件只用来**判模块是否挂载**（取值全部走 LEDGERS 自己的函数）。 */
const APIS = {};
for (const s of LEDGERS) APIS[s.id] = {};
const ALL = { ledgers: LEDGERS, apis: APIS };

/**
 * 负控制锚点（**在判据层只声明一次**，见判据 6 的纯度检查 —— H5）。
 *   ★ 为什么收成一张表，而不是各处内联字面量：锚点若在「破坏调用」与「纯度断言」两处
 *     各写一份，改一处漏一处时纯度检查会**恒过**（它数的是自己那一份）。收成一处之后，
 *     文件中每个锚点的字面量出现次数必须是 1（这条断言才有内容）。
 *   ★ 为什么用 String.raw + 多行模板：锚点里既有真换行也有 `{}`，普通字面量要把换行
 *     写成 `\n`，而文件里存的是转义序列 —— 于是「按字面量数出现次数」数的是转义串、
 *     不是真源码，纯度检查会变成空转（本套件首版就是这么写的，实测四处恒 0）。
 */
const ANCHORS = Object.freeze({
    scanWindow: String.raw`            let kept = items;
            if (items.length > cap) { kept = items.slice(-cap); rec.truncated = true; }`,
    floorUnknown: String.raw`        if (!times.length) return 'no-floor';`,
    pageClamp: String.raw`        const outOfRange = total > 0 && page > pages;`,
    inverted: String.raw`        if (out.floorFrom !== null && out.floorTo !== null && out.floorFrom > out.floorTo) out.inverted.push('floor');`,
    dedupe: String.raw`            if (it.replayKey === key) { replaced = true; continue; }`,
});

const vnum = (v) => String(v).split('.').map(Number);
const cmpVer = (a, b) => {
    const x = vnum(a), y = vnum(b);
    for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
    return 0;
};

/* ───────────────── 夹具 ───────────────── */
/** 900 条约定账：`items[0]` 是最老那条（独特词 AZ900），摘要面看不到它。 */
function host900() {
    const items = [];
    for (let i = 0; i < 900; i++) {
        items.push({
            id: 'cm' + i,
            actor: '苏晴', counterpart: '林一',
            content: (i === 0 ? 'AZ900 ' : '') + '约定 ' + i,
            status: i % 2 ? 'open' : 'done',
            floor: i, updatedFloor: i, revision: 1
        });
    }
    return { worldProg: { commitmentLedger: { items: items } } };
}
/** 三态/三楼层混合：0 楼 / 无楼层 / 5 楼，配空账与缺席账。 */
function hostTiny() {
    return {
        worldProg: {
            seedLedger: {
                items: [
                    { id: 's0', hook: '零楼伏笔', source: 'seedLedger', status: 'open', floor: 0, updatedFloor: 0, revision: 1 },
                    { id: 's1', hook: '无楼层伏笔', source: 'seedLedger', status: 'open', floor: null, updatedFloor: null, revision: 1 },
                    { id: 's2', hook: '五楼伏笔', source: 'seedLedger', status: 'open', floor: 5, updatedFloor: 5, revision: 1 }
                ]
            },
            commitmentLedger: { items: [] },        // empty（在位且空）
            parallelLedger: { items: [{ id: 'p1', title: '平行事实一', who: ['苏晴'], status: 'open', floor: 2, revision: 2 }] },
            secretLedger: null,                     // state-missing（宿主没这本账）
            recallEcho: null, echoLedger: null,
        },
        _factVersionState: { facts: [{ id: 'f1', subject: '苏晴', predicate: '住', value: '老城', origin: 'dialog', status: 'active', floor: 1, revision: 3 }] },
        _eventThreadState: { events: [{ id: 'e1', title: '搬家', actors: ['苏晴'], segments: [{ floor: 3, source: 'extract', at: 3 }], abandoned: false, revision: 1 }] },
        _repairState: { repairs: [{ id: 'r1', action: 'revoke', subject: '苏晴', target: '苏晴', status: 'applied', floor: 4 }] },
    };
}

/* ───────────────── 判据本体（纯函数：负控制要在破坏副本上重跑它们） ───────────────── */
/** A：登记表逐字对齐 + 双导出 + 属性形态。 */
function judgeA(Qx) {
    if (typeof Qx !== 'function' && typeof Qx !== 'object') return '模块须可加载';
    if (!Qx || typeof Qx.facetsAligned !== 'function') return 'facetsAligned 必须在场';
    if (!Array.isArray(Qx.FACETS) || !Array.isArray(Qx.FILTERS) || !Array.isArray(Qx.SORTS)) return '三张登记表都必须是数组';
    const al = Qx.facetsAligned(LEDGERS);
    if (al.ok !== true) return 'FACETS 与真 LEDGERS 必须逐字对齐：缺 ' + JSON.stringify(al.missing) + ' 多 ' + JSON.stringify(al.extra);
    if (al.count !== LEDGERS.length) return '对齐项数应等于账本数，实 ' + al.count;
    if (Qx.DIRECTIONS.indexOf('asc') < 0 || Qx.DIRECTIONS.indexOf('desc') < 0) return 'DIRECTIONS 两向齐全';
    if (!(Qx.MAX_SCAN_PER_LEDGER >= 200)) return '扫描上限不得小于工作台摘要面（否则「补缺口」是假的），实 ' + Qx.MAX_SCAN_PER_LEDGER;
    return '';
}
/** B：900 条里最老那条，摘要面找不到、结构化面找得到。 */
function judgeB(Qx) {
    const host = host900();
    /* ① 摘要面（工作台）：只覆盖尾部 200 条 ⇒ 找不到目标 —— 这正是 X1 要治的那条。 */
    const face = W.buildWorkbench(host, { apis: APIS });
    const cm = face.ledgers.commitment;
    if (!cm) return '工作台必须有约定账读数';
    if (cm.count !== 900) return '工作台 count 应是全量 900（count 是原账长度），实 ' + cm.count;
    if (!cm.truncated) return '工作台必须自报 truncated（900 > 200），否则「正好 200 条」与「已裁 700 条」同形';
    if (cm.items.length !== 200) return '工作台摘要面应是 200 条，实 ' + cm.items.length;
    if (cm.items.some((x) => String(x.title).indexOf('AZ900') >= 0)) return '夹具前提不成立：目标条不该出现在摘要面里';
    const s = W.search(face, 'AZ900', {});
    if ((s.hits || []).length) return '夹具前提不成立：关键词面不该命中摘要面之外的目标条';
    /* ② 结构化面（本模块）：直读原账全量 ⇒ 找得到。 */
    const r = Qx.query(host, { text: 'AZ900' }, ALL);
    if (r.total !== 1) return '超 200 条的旧证据必须仍能按需检索：expect total=1，实 ' + r.total;
    if (r.rows.length !== 1) return '本页须给出行，实 ' + r.rows.length;
    if (r.rows[0].ref !== 'commitment:cm0') return 'ref 须由 owner 主键产生（commitment:cm0），实 ' + r.rows[0].ref;
    const cov = r.coverage || {};
    if (cov.summaryBypassed !== true) return '必须显式声明「绕过 200 条摘要、直读原账」（否则读者会以为与工作台同源）';
    const L = (cov.ledgers || {}).commitment || {};
    if (L.total !== 900 || L.kept !== 900) return '本账 total/kept 应都是 900（未触扫描上限），实 ' + L.total + '/' + L.kept;
    if (L.truncated === true) return '未触上限时不得自报截断（假截断与真截断同形）';
    if ((cov.truncated || []).length) return '未触上限时 coverage.truncated 应为空';
    return '';
}
/** C：楼层三态（0 / 未给 / 5）不得压平。 */
function judgeC(Qx) {
    const host = hostTiny();
    /* 真 0 楼：区间 [0,0] 只应收那一条 —— 若把「未给」当 0，这里会多出一条。 */
    const r0 = Qx.query(host, { ledgers: ['seed'], floorFrom: 0, floorTo: 0 }, ALL);
    if (r0.total !== 1) return '楼层 0 是真楼层：[0,0] 应恰收 1 条，实 ' + r0.total;
    if (r0.rows.length && r0.rows[0].ref !== 'seed:s0') return '0 楼那条的 ref 应是 seed:s0，实 ' + (r0.rows[0] && r0.rows[0].ref);
    /* 未给楼层的那条必须**单独计数并具名**，不得静默消失。 */
    if (!(r0.unmatched['floor-unknown'] >= 1)) return '无楼层行必须单列原因 floor-unknown，实 ' + JSON.stringify(r0.unmatched);
    if (!Array.isArray(r0.unmatchedUnknownFloor) || !r0.unmatchedUnknownFloor.length) return '无楼层行必须可枚举（unmatchedUnknownFloor），否则「被排除」与「不存在」同形';
    if (r0.unmatchedUnknownFloor[0].why !== 'no-floor-on-any-time-field') return '须点名原因，实 ' + r0.unmatchedUnknownFloor[0].why;
    /* 有楼层的（5 楼）落在区间外 ⇒ 归因必须是 miss，与「无楼层」分开。 */
    if (!(r0.unmatched['floor-range'] >= 1)) return '区间外的那条须记 floor-range，实 ' + JSON.stringify(r0.unmatched);
    /* hasFloor 三态：false 只收无楼层的；true 只收有楼层的。 */
    const rf = Qx.query(host, { ledgers: ['seed'], hasFloor: false }, ALL);
    if (rf.total !== 1) return 'hasFloor:false 应恰收无楼层那 1 条，实 ' + rf.total;
    if (rf.rows.length && rf.rows[0].ref !== 'seed:s1') return '无楼层那条的 ref 应是 seed:s1，实 ' + (rf.rows[0] && rf.rows[0].ref);
    const rt = Qx.query(host, { ledgers: ['seed'], hasFloor: true }, ALL);
    if (rt.total !== 2) return 'hasFloor:true 应收 2 条（0 与 5），实 ' + rt.total;
    return '';
}
/** D：分页由匹配总数驱动；翻过头不回落。 */
function judgeD(Qx) {
    const host = host900();
    const p1 = Qx.query(host, {}, { ledgers: LEDGERS, apis: APIS, pageSize: 30 });
    if (p1.total !== 900) return 'total 须是全量匹配数，实 ' + p1.total;
    if (p1.pages !== 30) return '页数应由 total/pageSize 得出（900/30=30），实 ' + p1.pages;
    if (p1.rows.length !== 30) return '本页应给 30 行，实 ' + p1.rows.length;
    const p30 = Qx.pageOf(host, {}, 30, 30, ALL);
    if (p30.rows.length !== 30) return '末页应满 30 行，实 ' + p30.rows.length;
    if (p30.pageOutOfRange) return '末页不是翻过头';
    const p31 = Qx.query(host, {}, { ledgers: LEDGERS, apis: APIS, page: 31, pageSize: 30 });
    if (p31.pageOutOfRange !== true) return '翻过头必须自报 pageOutOfRange，实 ' + p31.pageOutOfRange;
    if (p31.rows.length !== 0) return '翻过头**不得回落第一页**（rows 必须为空），实 ' + p31.rows.length;
    if (p31.total !== 900) return '翻过头时 total 仍须是全量匹配数（否则「没结果」与「没数据」同形）';
    const over = Qx.query(host, {}, { ledgers: LEDGERS, apis: APIS, pageSize: 99999 });
    if (over.pageSize !== Qx.PAGE_SIZE_MAX) return 'pageSize 须封顶到 PAGE_SIZE_MAX，实 ' + over.pageSize;
    return '';
}
/** E：区间反转按空集且给理由（不自动交换）。 */
function judgeE(Qx) {
    const host = hostTiny();
    const r = Qx.query(host, { ledgers: ['seed'], floorFrom: 5, floorTo: 0 }, ALL);
    if (r.state !== 'inverted-range') return '区间反转必须自报 inverted-range，实 ' + r.state;
    if (r.total !== 0) return '反转按空集处理，实 ' + r.total;
    if (!r.emptyReason || r.emptyReason.indexOf('反转') < 0) return '必须说出为什么（emptyReason 含「反转」），实 ' + JSON.stringify(r.emptyReason);
    if (r.emptyReason.indexOf('不自动交换') < 0) return '必须明说**不自动交换**（交换会查出另一个区间而不报错）';
    const k = Qx.replayKeyOf({ ledgers: ['seed'], floorFrom: 5, floorTo: 0 });
    if (!k) return '反转条件也要有稳定键';
    return '';
}
/** F：三态（module-unavailable / state-missing / empty / ok）不得同形。 */
function judgeF(Qx) {
    const host = hostTiny();
    /* ① 模块没挂：apis 全空 ⇒ 全部 module-unavailable。 */
    const noApi = Qx.query(host, {}, { ledgers: LEDGERS, apis: {} });
    const ids = LEDGERS.map((s) => s.id);
    const bad0 = ids.filter((id) => ((noApi.coverage.ledgers[id] || {}).reason !== 'module-unavailable'));
    if (bad0.length) return '模块没挂时九账都须报 module-unavailable，异常：' + JSON.stringify(bad0);
    if (noApi.coverage.counts.absent !== LEDGERS.length) return 'absent 计数应等于账本数';
    if (noApi.scanned !== 0) return '模块没挂时不该扫到任何行，实 ' + noApi.scanned;
    /* ② 宿主没这本账 ⇒ state-missing，且**不是** module-unavailable。 */
    const r = Qx.query(host, {}, ALL);
    const Ls = r.coverage.ledgers;
    if ((Ls.secret || {}).reason !== 'state-missing') return '未知状态的账须报 state-missing，实 ' + JSON.stringify((Ls.secret || {}).reason);
    if ((Ls.commitment || {}).state !== 'empty' || Ls.commitment.reason !== 'no-items') return '在位且空的账须报 empty（真读数，不是错误）';
    if ((Ls.parallel || {}).state !== 'ok') return '有条目的账须报 ok';
    /* hostTiny 的有账者：seed / parallel / fact-version / event-completeness / repair = 5；
     *   commitment 在位且空 = 1；secret / recall-echo / echo 三本状态为 null = 3。9 本账三态盖满。 */
    if (r.coverage.counts.ok !== 5) return 'ok 计数应为 5（seed/parallel/fact-version/event-completeness/repair），实 ' + r.coverage.counts.ok;
    if (r.coverage.counts.empty !== 1) return 'empty 计数应为 1（commitment 在位且空），实 ' + r.coverage.counts.empty;
    if (r.coverage.counts.absent !== 3) return 'absent 计数应为 3（secret/recall-echo/echo 状态为 null），实 ' + r.coverage.counts.absent;
    if (r.coverage.counts.ok + r.coverage.counts.empty + r.coverage.counts.absent !== LEDGERS.length) {
        return '三态计数必须恰好盖满登记表（漏算即账目崩）';
    }
    /* ③ 「没东西可查」与「查不到」必须分开说。 */
    const empty2 = Qx.query({}, { actors: ['不存在的人'] }, { ledgers: LEDGERS, apis: {} });
    if (empty2.state !== 'empty') return '全缺席时 state 应为 empty（结果空）';
    if (!empty2.emptyReason) return '全缺席必须给出 emptyReason（扫描面为空 ≠ 查不到）';
    if (empty2.emptyReason.indexOf('扫描面为空') < 0) return 'emptyReason 须点名「扫描面为空」，实 ' + empty2.emptyReason;
    return '';
}
/** G：保存查询只存条件 + 重放走当前原账 + 按键去重。 */
function judgeG(Qx) {
    const host = hostTiny();
    const spec = { ledgers: ['seed'], statuses: ['open'] };
    const k1 = Qx.replayKeyOf(spec);
    const k2 = Qx.replayKeyOf({ statuses: ['open'], ledgers: ['seed'] });
    if (k1 !== k2) return '键序不同但条件相同必须同键（否则重放对不上）';
    if (k1 === Qx.replayKeyOf({ ledgers: ['seed'] })) return '不同条件必须不同键';
    let list = [];
    const u1 = Qx.upsertSaved(list, { label: '甲的查询', spec: spec }, 1000);
    list = u1.list;
    if (!u1.saved || list.length !== 1) return '首次保存应落 1 条，实 ' + list.length;
    const u2 = Qx.upsertSaved(list, { label: '换个名字', spec: spec }, 2000);
    list = u2.list;
    if (list.length !== 1) return '同条件（不同名）必须覆盖：按条件判重不按名判重，实 ' + list.length;
    if (u2.replaced !== true) return '覆盖须如实自报 replaced';
    if (list[0].label !== '换个名字') return '覆盖后须留最新名字';
    const u3 = Qx.upsertSaved(list, { label: '乙的查询', spec: { ledgers: ['parallel'] } }, 3000);
    list = u3.list;
    if (list.length !== 2) return '异条件必须是两条，实 ' + list.length;
    /* 重放：**用当前原账重跑** —— 原账一改，读数必须跟着变。 */
    const entry = list.filter((x) => x.replayKey === k1)[0];
    if (!entry) return '按条件键必须能取回保存项（覆盖后仍按键可寻址，不靠名字）';
    const r1 = Qx.replaySaved(host, entry, ALL);
    if (!r1.ok || r1.keyMatched !== true) return '重放须自报 keyMatched（存下来的条件与跑出来的条件同一个）';
    if (r1.query.total !== 3) return '重放首跑应得 3 条，实 ' + r1.query.total;
    const host2 = hostTiny();
    host2.worldProg.seedLedger.items.push({ id: 's9', hook: '新伏笔', status: 'open', floor: 9, revision: 1 });
    const r2 = Qx.replaySaved(host2, entry, ALL);
    if (r2.query.total !== 4) return '重放必须走当前原账（原账变了读数就变），实 ' + r2.query.total;
    if (r2.query.replayKey !== entry.replayKey) return '重放键必须与保存键一致';
    /* 保存的是**条件**、不是结果：保存项里不得出现 rows / total / hits 之类结果快照。
     *   ★ 首版这条写成「重放结果里不得出现新加的条目」—— 那是把这条判据写反了：
     *     重放本来就该走当前原账，新加的条目**正是**它该看到的东西。真正要守的是
     *     「存的到底是不是结果」⇒ 查保存项自身的键面。 */
    const banned = ['rows', 'total', 'hits', 'hitsByLedger', 'items', 'scanned'];
    for (const it of list) {
        for (const k of banned) {
            if (Object.prototype.hasOwnProperty.call(it, k)) return '保存项里不得存结果字段 `' + k + '`（那是第二份证据库）';
        }
        if (!it.spec || typeof it.spec !== 'object') return '保存项必须带条件（spec）';
    }
    if (r2.query.total === 1 && entry.spec.text) return 'spec 必须逐字保留（重放条件即保存条件）';
    /* 有界：超上限如实报 dropped。 */
    let big = [];
    for (let i = 0; i < Qx.MAX_SAVED_QUERIES + 5; i++) big = Qx.upsertSaved(big, { label: 'q' + i, spec: { text: 'x' + i } }, i).list;
    if (big.length !== Qx.MAX_SAVED_QUERIES) return '保存查询须有界（' + Qx.MAX_SAVED_QUERIES + '），实 ' + big.length;
    const rm = Qx.removeSaved(big, big[0].replayKey);
    if (!rm.removed || rm.list.length !== big.length - 1) return '删除须真删';
    const rm2 = Qx.removeSaved(big, '__不存在__');
    if (rm2.removed || rm2.reason !== 'not-found') return '删不到须如实报 not-found（不得静默当删掉了）';
    return '';
}
/** H：未知条件名不静默忽略 + 常量字段不外泄。 */
function judgeH(Qx) {
    const n = Qx.normalizeSpec({ actors: ['苏晴'], bogus: 1, __proto__x: 2 });
    if (n.dropped.indexOf('bogus') < 0) return '未知条件名须进 droppedKeys，实 ' + JSON.stringify(n.dropped);
    if (n.spec.actors.indexOf('苏晴') < 0) return '已知条件须保留';
    const n2 = Qx.normalizeSpec({ actors: [] });
    if (n2.spec.actors !== null) return '空列表须归一成「无条件」（不是「匹配空集」）';
    const n3 = Qx.normalizeSpec({ hasFloor: 'true' });
    if (n3.spec.hasFloor !== true) return 'hasFloor 字符串形态须归一成布尔';
    const r = Qx.query({}, { text: 'x' }, { ledgers: LEDGERS, apis: APIS });
    if (!Array.isArray(r.droppedKeys)) return '回执须带 droppedKeys';
    /* 查询面不得有写副作用：宿主对象跑完逐字未动。 */
    const host = hostTiny();
    const before = JSON.stringify(host);
    Qx.query(host, { text: '伏笔' }, ALL);
    Qx.query(host, { actors: ['苏晴'], floorFrom: 0 }, ALL);
    Qx.pageOf(host, {}, 2, 5, ALL);
    if (JSON.stringify(host) !== before) return '查询面必须零写副作用（宿主状态跑完逐字未动）';
    return '';
}

/* ───────────────── 破坏副本加载器（模块） ───────────────── */
function loadBrokenQ(mutate) {
    const broken = mutate(Q_SRC);
    assert.notStrictEqual(broken, Q_SRC, '破坏必须真的发生');
    const tmp = path.join(R, '__negctl_x1.tmp.cjs');
    fs.writeFileSync(tmp, broken);
    try {
        delete require_.cache[require_.resolve(tmp)];
        return require_(tmp);
    } finally {
        try { fs.unlinkSync(tmp); } catch (_e) { /* 清理失败不影响判定 */ }
    }
}

/* ───────────────── 正向：全部判据在原版上必须全绿 ───────────────── */
test('v3296 0. 正向：全部判据在原版上必须全绿（负控制的前提）', () => {
    const bad = [
        ['A 登记表对齐', judgeA(Q)],
        ['B 超 200 条仍可查', judgeB(Q)],
        ['C 楼层三态', judgeC(Q)],
        ['D 分页不回落', judgeD(Q)],
        ['E 区间反转', judgeE(Q)],
        ['F 三态不同形', judgeF(Q)],
        ['G 保存与重放', judgeG(Q)],
        ['H 未知键与零副作用', judgeH(Q)],
    ].filter((x) => x[1] !== '');
    assert.deepEqual(bad, [], '原版上判据必须全绿：' + JSON.stringify(bad));
});

test('v3296 1. 模块结构：双导出 / 无裸 window / 零 storage / IIFE + CJS', () => {
    assert.ok(Q_SRC.includes('root.LonShaEvidenceQuery = api'), '须挂全局（宿主按名取库）');
    assert.ok(Q_SRC.includes('module.exports = api'), '须有 CJS 双导出（判据与负控制要走 require）');
    const body = Q_SRC.split('})(typeof window')[0];
    assert.ok(body.indexOf('window.') < 0, '模块内不得裸读 window（账 API 全部经 opts.apis 注入）');
    assert.ok(body.indexOf('localStorage') < 0, '模块不得摸 storage（持久化归宿主）');
    assert.ok(body.indexOf('readFileSync') < 0, '模块不得带 I/O');
    assert.equal(typeof Q.QUERY_VERSION, 'number', '版本常量在场');
    assert.equal(typeof Q.MAX_SAVED_QUERIES, 'number', '有界常量在场');
});

test('v3296 2. 验收原文两条：超 200 条可查 + 不默认判「全库没有」', () => {
    const host = host900();
    /* ① 老证据（落摘要面之外）可按需检索。 */
    const old = Q.query(host, { text: 'AZ900' }, ALL);
    assert.equal(old.total, 1, '超 200 条的旧证据必须能查到');
    assert.equal(old.rows[0].ref, 'commitment:cm0');
    /* ② 完整度读数把「扫了多少 / 共有多少」分开说出来。 */
    const cov = old.coverage;
    assert.equal(cov.ledgers.commitment.total, 900, '须报全量');
    assert.equal(cov.ledgers.commitment.kept, 900, '须报实扫');
    assert.equal(cov.summaryBypassed, true, '须声明绕过摘要面');
    /* ③ 反向对照：工作台摘要面确实覆盖不到 —— 两件一起才是「缺口真被补上」。 */
    const face = W.buildWorkbench(host, { apis: APIS });
    assert.equal(face.ledgers.commitment.truncated, true, '工作台应自报截断');
    assert.equal(W.search(face, 'AZ900', {}).hits.length, 0, '摘要面确实看不到目标（夹具前提）');
});

test('v3296 3. 来源身份按各账真字段：fact-version 是 origin、echo 是 char', () => {
    const host = hostTiny();
    const r = Q.query(host, { ledgers: ['fact-version'], sources: ['dialog'] }, ALL);
    assert.equal(r.total, 1, 'fact-version 的来源身份字段是 origin（不是 source）');
    const e = Q.query(host, { ledgers: ['echo'], sources: ['某某'] }, ALL);
    assert.equal(e.state, 'empty', 'echo 无条目时不该报错（真的 0 条）');
    /* 事件账的楼层与来源在 segments 段里（顶层没有 floor / source）。 */
    const ev = Q.query(host, { ledgers: ['event-completeness'], floorFrom: 3, floorTo: 3 }, ALL);
    assert.equal(ev.total, 1, '事件账须按**段**楼层命中（顶层没有 floor，照抄别账字段名会恒空）');
    const evs = Q.query(host, { ledgers: ['event-completeness'], sources: ['extract'] }, ALL);
    assert.equal(evs.total, 1, '事件账的来源须按段取');
});

test('v3296 4. 排序：取不到值的行一律排最后（升序降序都一样）', () => {
    const host = hostTiny();
    const asc = Q.query(host, { ledgers: ['seed'] }, { ledgers: LEDGERS, apis: APIS, sort: 'floor', dir: 'asc' });
    assert.equal(asc.rows[asc.rows.length - 1].floor, null, '升序里「没给」须排最后，不得当 0 冒充最小值');
    const desc = Q.query(host, { ledgers: ['seed'] }, { ledgers: LEDGERS, apis: APIS, sort: 'floor', dir: 'desc' });
    assert.equal(desc.rows[desc.rows.length - 1].floor, null, '降序里「没给」也须排最后，不得冒充最大值');
    const rv = Q.query(host, { ledgers: ['recall-echo'] }, { ledgers: LEDGERS, apis: APIS, sort: 'revision' });
    assert.equal(rv.state, 'empty', '无该账状态时不造假行');
    /* 无修订概念的账在 revision 区间条件里须报 revision-absent（不是「修订 0 被滤掉」）。 */
    const host2 = hostTiny();
    host2._repairState = { repairs: [{ id: 'r1', action: 'revoke', subject: '苏晴', target: '苏晴', status: 'applied', floor: 4 }] };
    const rr = Q.query(host2, { ledgers: ['repair'], revisionFrom: 1 }, ALL);
    assert.equal(rr.total, 0);
    assert.ok(rr.unmatched['revision-absent'] >= 1, '无修订号的账不参与该条件，须具名单列，实 ' + JSON.stringify(rr.unmatched));
});

test('v3296 5. 诊断行：空 / 查不到 / 没东西可查三者分开写', () => {
    const host = hostTiny();
    const empty = Q.query(host, { ledgers: ['seed'], text: '绝不存在' }, ALL);
    const l1 = Q.line(empty);
    assert.ok(l1.indexOf('证据查询') === 0, '诊断行须自报面名：' + l1);
    assert.ok(l1.indexOf('扫 ') >= 0, '须报扫描面读数：' + l1);
    const noData = Q.query({}, {}, { ledgers: LEDGERS, apis: {} });
    const l2 = Q.line(noData);
    assert.ok(l2.indexOf('扫描面为空') >= 0, '「没东西可查」须单独说：' + l2);
    assert.notEqual(l1, l2, '两种空必须不同形');
    assert.equal(Q.line(null), '—（查询面异常）', '畸形入参不抛');
});

/* ───────────────── 工具自证 ───────────────── */
test('v3296 6. 工具自证：锚点不存在 / 不唯一 / 同值替换必须抛', () => {
    assert.throws(() => breakSource(Q_SRC, '__NO_SUCH_ANCHOR__', 'x', 'ghost'), /恰中 1 次|锚点/, '锚点不存在必须抛');
    assert.throws(() => breakSource(Q_SRC, 'return ', 'return ', 'noop'), /必须真的改变源码|恰中 1 次|锚点/, '同值替换/不唯一必须抛');
    /* 判据纯度（H5）：ANCHORS 里每个锚点的**字面量**在判据层只出现一次。
     *   首版这里内联了锚点值（与破坏调用各写一份）并且把真换行写成 `\n` 转义，
     *   结果「数出现次数」数的是转义串、四处恒 0 —— 判据自己恒红，
     *   而真锚点纯度无人把守。现改成读 ANCHORS 真值（String.raw 原始形态）。 */
    const SELF = fs.readFileSync(new URL(import.meta.url), 'utf8');
    for (const [k, anchor] of Object.entries(ANCHORS)) {
        assert.equal(SELF.split(anchor).length - 1, 1, '锚点字面量在判据层只准声明一次：' + k);
        assert.equal(Q_SRC.split(anchor).length - 1, 1, '锚点在真源码须恰中 1 次（否则破坏会打偏）：' + k);
    }
});

/* ───────────────── 负控制：真源码破坏 ───────────────── */
test('v3296 N1. 拆「直读原账全量」⇒ 判据 B 翻红（900 条退化成尾部 200 条）', () => {
    const broken = loadBrokenQ((s) => breakSource(s, ANCHORS.scanWindow,
        String.raw`            let kept = items.slice(-200);
            if (items.length > 200) { rec.truncated = true; }`,
        'x1-scan-window'));
    assert.notEqual(judgeB(broken), '', '退回 200 条窗口后判据 B 必须现形（老证据查不到了）');
    assert.equal(judgeB(Q), '', '原版同判据必须通过（反向对照）');
});

test('v3296 N2. 拆「无楼层单列」⇒ 判据 C 翻红（归因被压成 miss）', () => {
    const broken = loadBrokenQ((s) => breakSource(s, ANCHORS.floorUnknown,
        String.raw`        if (!times.length) return 'miss';`,
        'x1-floor-unknown'));
    assert.notEqual(judgeC(broken), '', '「无楼层」并进「不满足区间」后判据 C 必须现形');
    assert.equal(judgeC(Q), '', '原版同判据必须通过');
});

test('v3296 N3. 拆「翻过头须标记」⇒ 判据 D 翻红（越界与「这就是全部」同形）', () => {
    /* ★ 首版破坏点选的是 `const rows = outOfRange ? [] : …`（把三元压平）
     *   —— 那是**不可观测的假绿**：`outOfRange` 变量仍在（`pageOutOfRange` 照报 true），
     *   于是判据 D 三条里两条不变，测试红的是别的地方。真破坏点应是**标记本身**。 */
    const broken = loadBrokenQ((s) => breakSource(s, ANCHORS.pageClamp,
        String.raw`        const outOfRange = false;`,
        'x1-page-clamp'));
    assert.notEqual(judgeD(broken), '', '去掉越界标记后判据 D 必须现形（翻过头与「这就是全部」同形）');
    assert.equal(judgeD(Q), '', '原版同判据必须通过');
});

test('v3296 N4. 拆「区间反转须自报」⇒ 判据 E 翻红（静默按反转区间查）', () => {
    const broken = loadBrokenQ((s) => breakSource(s, ANCHORS.inverted,
        String.raw`        /* 反转不报（破坏副本） */`,
        'x1-inverted-silent'));
    assert.notEqual(judgeE(broken), '', '不报反转后判据 E 必须现形');
    assert.equal(judgeE(Q), '', '原版同判据必须通过');
});

test('v3296 N5. 拆「保存查询按条件判重」⇒ 判据 G 翻红（同条件存两条）', () => {
    const broken = loadBrokenQ((s) => breakSource(s, ANCHORS.dedupe,
        String.raw`            if (false) { replaced = true; continue; }`,
        'x1-saved-dedupe'));
    assert.notEqual(judgeG(broken), '', '不按条件判重后判据 G 必须现形');
    assert.equal(judgeG(Q), '', '原版同判据必须通过');
});

/* ───────────────── 宿主接线 ───────────────── */
test('v3296 7. 宿主接线：取库口按名可读 + 复用工作台登记表 + 四口 + 诊断行', () => {
    assert.match(IDX_SRC, /function _evidenceQueryLib\(\) \{\s*\n\s*return _moduleLib\(\(\) => window\.LonShaEvidenceQuery, 'evidence-query\.js'\);/,
        '取库口必须是真读表达式 + 文件名（与其余模块同规格）');
    assert.match(IDX_SRC, /\?\s*\(W\.LEDGERS\)|Array\.isArray\(W\.LEDGERS\)/,
        '宿主须**复用**工作台的 LEDGERS（账本登记表单一真源），不得自抄一份');
    assert.equal((IDX_SRC.match(/apiGlobal:/g) || []).length, 0,
        '宿主不得出现 apiGlobal（那是登记表专有字段 —— 出现即第二份真源）');
    for (const m of ['searchEvidenceStructured(spec, opts) {', '_evidenceQueryEmpty(reason, spec, opts, ledgers) {',
        'evidenceQueryFacets() {', 'evidenceQueryLine() {', 'evidenceSavedQueries() {',
        'saveEvidenceQuery(label, spec) {', 'removeEvidenceQuery(replayKey) {', 'replayEvidenceQuery(replayKey, opts) {']) {
        assert.equal(IDX_SRC.split(m).length - 1, 1, '宿主口须恰好在场一次：' + m);
    }
    assert.ok(IDX_SRC.includes("['证据查询', body]"), '诊断行须接进 selfCheck 表');
    assert.ok(IDX_SRC.includes('_evidenceQueryLast'), '宿主须留最近一次读数（诊断行据此说「上次扫了多少」）');
    /* 不写账：宿主这条链路上不得出现 save/import/clear 之类写动作。 */
    const seg = IDX_SRC.slice(IDX_SRC.indexOf('searchEvidenceStructured(spec, opts) {'), IDX_SRC.indexOf('evidenceQueryFacets() {'));
    for (const banned of ['storage.save', '.import(', '.clear(']) {
        assert.ok(seg.indexOf(banned) < 0, '查询链路不得含写动作 `' + banned + '`');
    }
});

test('v3296 8. 加载面：模块登记进 extra_js 且磁盘在场', () => {
    assert.ok(MF.extra_js.includes('evidence-query.js'), 'evidence-query.js 必须在 manifest.extra_js（不登记 = 浏览器不加载 = 面永远缺席）');
    assert.ok(fs.existsSync(path.join(R, 'evidence-query.js')), '磁盘必须在场');
    assert.ok(MF.extra_js.includes('evidence-workbench.js'), '工作台仍须在（本模块复用它当登记表真源）');
    assert.equal(MF.extra_js.length, 85, 'extra_js 数量锁：v3.296.0 X1 新增 evidence-query.js ⇒ 85 项，实 ' + MF.extra_js.length);
});

test('v3296 9. 宿主行为面：真方法体在真模块上跑通（口径 / 复用 / 不抛）', () => {
    /* 用真宿主方法体 + 真模块接一遍：取库口走 `_moduleLib` 的全局分支。 */
    const lib = sliceFn(IDX_SRC, 'function _moduleLib(getGlobal, fileName) {');
    const qlib = sliceFn(IDX_SRC, 'function _evidenceQueryLib() {');
    const wblib = sliceFn(IDX_SRC, 'function _evidenceWorkbenchLib() {');
    const ledOf = sliceFn(IDX_SRC, 'function _evidenceQueryLedgersOf() {');
    /* `searchEvidenceStructured` 还要经 `_ledgerApis()` 注入账 API（宿主侧唯一取库口）
     *   —— 夹具里必须给**真** 那一份，连同它调用的三个助手。 */
    const apisFn = sliceFn(IDX_SRC, 'function _ledgerApis() {');
    const fv = sliceFn(IDX_SRC, 'function _factVersionLib() {');
    const ec = sliceFn(IDX_SRC, 'function _eventCompletenessLib() {');
    const rl = sliceFn(IDX_SRC, 'function _repairLoopLib() {');
    assert.ok(lib && qlib && wblib && ledOf, '四个模块级取库口都须可提取');
    assert.ok(apisFn && fv && ec && rl, '_ledgerApis 与它的三个助手都须可提取');
    const mEthods = ['searchEvidenceStructured(spec, opts) {', '_evidenceQueryEmpty(reason, spec, opts, ledgers) {',
        'evidenceQueryFacets() {', 'evidenceQueryLine() {', 'evidenceSavedQueries() {',
        'saveEvidenceQuery(label, spec) {', 'removeEvidenceQuery(replayKey) {', 'replayEvidenceQuery(replayKey, opts) {']
        .map((h) => sliceMethod(IDX_SRC, h));
    assert.ok(mEthods.every(Boolean), '八个宿主方法体都须可提取');
    const win = { LonShaEvidenceQuery: Q, LonShaEvidenceWorkbench: W, LonShaSeedLedger: {} };
    const LIBS = lib + '\n' + qlib + '\n' + wblib + '\n' + ledOf + '\n' + apisFn + '\n' + fv + '\n' + ec + '\n' + rl + '\n';
    const eng = new Function('errLog', 'window',
        LIBS + 'return ({ ' + mEthods.join(',\n') + ' });')(() => {}, win);
    /* 登记表复用：宿主拿到的就是真四件套（含函数，不是副本）。
     *   ★ 必须把 `_moduleLib` 一起带进去：漏了它 ⇒ `_evidenceWorkbenchLib()` 抛
     *   ReferenceError，被 `_evidenceQueryLedgersOf` 的 try/catch 吞成 `[]` ——
     *   现象是「宿主复用到的账本数 = 0」，看着像接线断了、其实是夹具没给取库口。 */
    const lg = new Function('window', lib + '\n' + wblib + '\n' + ledOf + '\nreturn _evidenceQueryLedgersOf();')(win);
    assert.equal(lg.length, LEDGERS.length, '宿主复用到的账本数须与工作台一致');
    assert.equal(typeof lg[0].state, 'function', '四件套必须是真函数（不是名字副本）');
    /* 四口行为：先对账面，再查一次，再看诊断行。 */
    const f0 = eng.evidenceQueryFacets.call(eng);
    assert.equal(f0.ok, true, '检索面须与真 LEDGERS 对齐，实 ' + JSON.stringify(f0));
    assert.equal(f0.ledgers, LEDGERS.length);
    assert.ok(f0.filterKeys.length >= 8, '筛选键须可枚举');
    const line0 = eng.evidenceQueryLine.call(eng);
    assert.ok(line0.indexOf('待用') >= 0, '未查过时须说「待用」（不是缺陷，也不是「没有」）：' + line0);
    const hostH = hostTiny();
    const res = eng.searchEvidenceStructured.call(Object.assign(hostH, eng, { _evidenceQueryLast: null }), { ledgers: ['seed'] }, {});
    assert.equal(res.total, 3, '真宿主口须跑通真模块（实 ' + res.total + '）');
    assert.equal(res.coverage.summaryBypassed, true);
    const line1 = eng.evidenceQueryLine.call(Object.assign({}, eng, { _evidenceQueryLast: { at: 1, total: 3, state: 'ok', scanned: 3, counts: { ok: 5, empty: 1, absent: 3 }, truncated: [] } }));
    assert.ok(line1.indexOf('上次 3 条') >= 0, '诊断行须报上次读数：' + line1);
    /* 保存/回放：只存条件、有界、删不到须点名。 */
    const st = Object.assign({}, eng, { _evidenceSavedQueries: [] });
    const s1 = eng.saveEvidenceQuery.call(st, '甲', { ledgers: ['seed'] });
    assert.equal(s1.saved, true);
    assert.equal(st._evidenceSavedQueries.length, 1);
    const rp = eng.replayEvidenceQuery.call(Object.assign(st, hostTiny()), st._evidenceSavedQueries[0].replayKey, {});
    assert.equal(rp.keyMatched, true, '回放键必须对上');
    assert.equal(rp.query.total, 3, '回放须走当前原账');
    const rm = eng.removeEvidenceQuery.call(st, '__无此键__');
    assert.equal(rm.reason, 'not-found', '删不到须如实报');
    /* 模块没挂时的降级：键面完整、不抛、如实归因。 */
    const eng2 = new Function('errLog', 'window',
        LIBS + 'return ({ ' + mEthods.join(',\n') + ' });')(() => {}, {});
    const empty = eng2.searchEvidenceStructured.call(Object.assign(hostTiny(), eng2), {}, {});
    assert.equal(empty.state, 'absent');
    assert.equal(empty.reason, 'module-unavailable');
    assert.equal(empty.coverage.scanned, 0);
    assert.ok(Array.isArray(empty.rows), '降级回执的键面必须完整（下游按键断言不必猜）');
    assert.equal(eng2.evidenceQueryFacets.call(eng2).reason, 'module-unavailable');
});

/** 取模块级函数（含头部，靠花括号配平）。 */
function sliceFn(src, header) {
    const at = src.indexOf(header);
    if (at < 0) return null;
    const open = src.indexOf('{', at + header.length - 1);
    if (open < 0) return null;
    let d = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') d++;
        else if (src[i] === '}') { d--; if (d === 0) return src.slice(at, i + 1); }
    }
    return null;
}
/** 取类方法体（从 `){` 那个大括号起 —— 头部里的默认值 `{}` 会骗过「第一个 {」）。 */
function sliceMethod(src, header) {
    let at = src.indexOf(header);
    if (at < 0) return null;
    if (at >= 6 && src.slice(at - 6, at) === 'async ') at -= 6;
    const close = src.indexOf(')', at);
    if (close < 0) return null;
    const open = src.indexOf('{', close);
    if (open < 0) return null;
    let d = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') d++;
        else if (src[i] === '}') { d--; if (d === 0) return src.slice(at, i + 1); }
    }
    return null;
}

/* ───────────────── 版本卫生 ───────────────── */
test('v3296 V. 四源同源且不低于 X1 出生版本（下限锚）', () => {
    const man = MF.version;
    const idx = (IDX_SRC.match(/const VERSION = '([0-9.]+)'/) || [])[1];
    assert.ok(idx, 'index.js 版本真值可取');
    assert.equal(man, idx, 'manifest 与 index 必须同源');
    assert.equal(PKG, idx, 'package.json 与 index 必须同源');
    const cfg = (fs.readFileSync(path.join(R, 'memory-config.js'), 'utf8').match(/let VERSION = '([0-9.]+)'/) || [])[1];
    assert.equal(cfg, idx, 'memory-config.js 与 index 必须同源');
    assert.ok(cmpVer(idx, '3.296.0') >= 0, '版本不得低于出生版本 3.296.0，实 ' + idx);
    /* ★ 当版锚（版本守卫 V4 只认 `vnum('<当版>')` 的数值形态）：本套件是 v3.296.0
     *   的交付套件，全仓恰此一处锚当版；抬版时由继任套件接管，本行随之降为历史下界。
     *   刻意不写成 assert.equal(...'3.296.0')：那是 V2 点名的「抬版仪式」形态。 */
    const BIRTH_ANCHOR = vnum('3.296.0');
    assert.ok(BIRTH_ANCHOR.join('.') === '3.296.0', '当版锚：vnum 解析器须给出三段数值');
    const top = (fs.readFileSync(path.join(R, 'CHANGELOG.md'), 'utf8').match(/^## (v[0-9.]+)/m) || [])[1];
    assert.equal(top, 'v' + idx, 'CHANGELOG 顶节应是当版（实 ' + top + '）');
});
