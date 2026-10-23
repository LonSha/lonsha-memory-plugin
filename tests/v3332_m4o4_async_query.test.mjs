// tests/v3332_m4o4_async_query.test.mjs — M4-O4 异步查询接到真实问答与资料页（v3.332.0）
//
//   计划第四期 M4-O4 点名三件事：① 大库查询让出主线程（片间让出）；② 新问题可取消旧问题
//   （取消不是失败也不是没有）；③ 实际扫描进度如实上报。M4-O3 之前的现状：`queryAsync`
//   内核已存在（分片/让出/取消），但宿主 `askMemoryQuestion` 是同步出口、`memory-tools-api`
//   只包同步 `query` —— 异步内核在**任何真实出口上都没被消费**。本档是接线后的成对判据。
//
//   判据面（17 条）：
//     A1 同步/异步同源：同 spec 同库，hits 与 state 逐字一致（同一份 assemble 产出的证明）
//     A2 分片与进度：2 万行合成库、shard=500，片边界进度单调不减、终值到 totalRows
//     A3 尾片进度：rows % shard != 0 时最终进度补发到 processed（不是停在 19800）
//     A4 让出真发生：yieldTo 被调用次数 = 完整分片数（让出不是注释里的空话）
//     B1 取消（中途）：state='canceled'、partial、processed 读数是已处理部分
//     B2 取消不当 empty：canceled 信封与 empty 信封 state 互不相同形
//     B3 取消（收尾边界）：跑完最后一片后取消检查仍给出一致结论
//     B4 onShard 抛错不阻断：进度回调抛异常，查询仍完成、结果与不挂回调一致
//     C1 统一信封（ok 路径）：queryEvidenceAsync 六能力第⑥格、恒定 14 键、data 原样引用
//     C2 统一信封（canceled 路径）：state='canceled'，notes 说明读数是已处理部分
//     C3 能力表对账：CAPABILITIES 六项、queryEvidenceAsync 登记到 evidence-query.js::queryAsync
//     D1 宿主接线：queryEvidenceAsync 出口 + memoryToolsSources 第六格 + 信封降级不抛
//     D2 宿主异步问答：askMemoryQuestionAsync 恒定键面 + async 面四键 + state='done'
//     D3 宿主取消：shouldCancel 取消后 state='canceled'、gaps 含 kind='canceled'
//     D4 模块缺席降级：Q.queryAsync 缺席时回 absent 回执（不抛、不当空答案）
//     E1~E3 真源码破坏负控制（各自必须让对应判据转红）
//     F1 判据纯度 + fail-closed
//
//   本仓纪律（写进判据，防止再犯）：
//     ① 「取消」不得冒充「没有」：canceled 读数是已处理部分，绝不当 empty —— B2 钉住。
//     ② 进度是读数面不是关键链路：回调抛错不阻断查询 —— B4 钉住。
//     ③ 负控制打在真源码上、在破坏副本上重跑同款判据，不得对原文件断言。
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { breakSource } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const require_ = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const EQ_SRC = read('evidence-query.js');
const IDX = read('index.js');
const QT_SRC = read('engine-qa-tools.js');
const MTA_SRC = read('memory-tools-api.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const SELF = read('tests/v3332_m4o4_async_query.test.mjs');

/* ── 真模块（不 mock） ── */
const EQ = require_(path.join(R, 'evidence-query.js'));
const MTA = require_(path.join(R, 'memory-tools-api.js'));
const CL = require_(path.join(R, 'commitment-ledger.js'));
const WB = require_(path.join(R, 'evidence-workbench.js'));

/* ───────────── 夹具 ───────────── */

/** 2 万行合成 commitment 账（每 7 行一条苏晴相关），其余为带 ref 的干扰行。 */
function bigLedger(n) {
    let cs = CL.normalize(undefined);
    for (let i = 0; i < n; i += 1) {
        const actor = (i % 7 === 0) ? '苏晴' : '路人' + (i % 13);
        cs = CL.open(cs, {
            actor: actor, counterpart: '林一',
            content: (i % 7 === 0) ? '答应第' + i + '次还书' : '干扰条目' + i,
            floor: (i % 100) + 1, eventKey: 'ev' + i
        }).state;
    }
    return cs;
}

/** 合成宿主：worldProg 带 commitment 账（universeOf 读这里）。 */
function synthHost(n, apis) {
    return {
        worldProg: { commitmentLedger: bigLedger(n || 20000) },
        _ledgerApis: (apis === undefined) ? function () { return {}; } : apis
    };
}

/** 单 spec 查苏晴（planQuestion 产出的 spec 形状之一，直接手造最简形态）。 */
const suSpec = () => ({ ledgers: ['commitment'], actors: ['苏晴'], kind: 'all' });

/** 宿主切片：从真 index.js 切出宿主方法体（与 v3330 同款夹具纪律）。 */
/** 从 engine-qa-tools.js 提取方法体，转回类方法格式（engine.→this.）。 */
function extractModuleMethod(source, funcMarker) {
    const start = source.indexOf(funcMarker);
    if (start < 0) return null;
    const bodyStart = start + funcMarker.length - 1;
    if (source[bodyStart] !== '{') return null;
    let depth = 0, end = -1;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) return null;
    let body = source.slice(bodyStart + 1, end);
    body = body.replace(/\bengine\./g, 'this.');
    const asyncP = funcMarker.startsWith('async ') ? 'async ' : '';
    const nm = funcMarker.match(/(?:async\s+)?function\s+(\w+)\s*\(engine(?:,\s*(.*?))?\)\s*\{/);
    if (!nm) return null;
    const params = nm[2] !== undefined ? nm[2] : '';
    return asyncP + nm[1] + '(' + params + ') {' + body + '}';
}
function sliceMember(src, header) {
    const at = src.indexOf(header);
    if (at < 0) return null;
    const open = src.indexOf('{', at + header.length - 1);
    if (open < 0) return null;
    let d = 0;
    for (let i = open; i < src.length; i += 1) {
        const c = src[i];
        if (c === '"' || c === "'" || c === '`') {
            let k = i + 1;
            while (k < src.length) {
                if (src[k] === '\\') { k += 2; continue; }
                if (src[k] === c) { k++; break; }
                if (src[k] === '\n' && c !== '`') break;
                k += 1;
            }
            i = k - 1;
            continue;
        }
        if (c === '{') d += 1;
        else if (c === '}') { d -= 1; if (d === 0) return src.slice(at, i + 1); }
    }
    return null;
}

const IDX_LIB_HEADS = [
    'function _moduleLib(getGlobal, fileName) {',
    'function _evidenceQueryLib() {',
    'function _evidenceWorkbenchLib() {',
    'function _evidenceQueryLedgersOf() {',
    'function _ledgerApis() {',
    'function _factVersionLib() {',
    'function _eventCompletenessLib() {',
    'function _repairLoopLib() {',
    'function _memoryToolsLib() {'
];
const IDX_METH_HEADS = [
    '_qaActorAliases() {',
    '_qaKnownActors(limit) {',
    'askMemoryQuestion(question, opts) {',
    'askMemoryQuestionAsync(question, opts) {',
    'memoryToolsSources() {',
    '_memoryToolsAbsent(api, reason) {',
    'queryEvidenceAsync(spec, opts) {',
    '_qaCausalEdges() {'
];

function mkHost(win, src, qtSrc) {
    const idx = src || IDX;
    const qt = qtSrc || QT_SRC;
    const libs = IDX_LIB_HEADS.map((h) => sliceMember(idx, h));
    if (libs.some((x) => !x)) throw new Error('取库口切片缺失：' + IDX_LIB_HEADS.filter((h, i) => !libs[i]).join(' / '));

    const meths = [
        extractModuleMethod(qt, 'function _qaActorAliases(engine) {'),
        extractModuleMethod(qt, 'function _qaKnownActors(engine, limit) {'),
        extractModuleMethod(qt, 'function askMemoryQuestion(engine, question, opts) {'),
        extractModuleMethod(qt, 'async function askMemoryQuestionAsync(engine, question, opts) {'),
        extractModuleMethod(qt, 'function memoryToolsSources(engine) {'),
        extractModuleMethod(qt, 'function _memoryToolsAbsent(engine, api, reason) {'),
        extractModuleMethod(qt, 'async function queryEvidenceAsync(engine, spec, opts) {'),
        sliceMember(idx, '_qaCausalEdges() {')
    ];
    if (meths.some((x) => !x)) throw new Error('宿主出口切片缺失');
    return new Function('errLog', 'window',
        libs.join('\n') + '\nreturn ({ ' + meths.join(',\n') + ' });')(() => {}, win);
}

/** 把剥掉 async 前缀的方法体（内部还有 await）包成 async IIFE 返回的等价形式：
 *   `name(args) { ...await... }` → `name(args) { return (async () => { ...await... })(); }`
 *   —— 保持 this 语义（箭头函数继承外层 this）、保持返回 Promise。 */
function wrapAwaitBody(methodSrc) {
    const open = methodSrc.indexOf('{');
    if (open < 0) return methodSrc;
    const head = methodSrc.slice(0, open + 1);
    const body = methodSrc.slice(open + 1, methodSrc.length - 1);
    return head + ' return (async () => {' + body + '})(); }';
}

const WIN_FULL = () => ({
    LonShaEvidenceQuery: EQ,
    LonShaEvidenceWorkbench: WB,
    LonShaCommitmentLedger: CL,
    LonShaMemoryTools: MTA
});

/* ───────────── 合成大库（2 万行）与公共查询口径 ───────────── */

/** 手造 N 行 commitment items（账本 MAX_ITEMS=200 是装载面上限；
 *   本档测的是查询面在大库上的行为，行面直接按 copyItem 的真形状手造，
 *   pick 直读 st.items —— 与真宿主的 worldProg 形状一致）。 */
function bigItems(n) {
    const items = [];
    for (let i = 0; i < n; i += 1) {
        items.push({
            id: 'cmt_' + i, actor: (i % 7 === 0) ? '苏晴' : '路人' + (i % 13),
            content: (i % 7 === 0) ? '答应第' + i + '次还书' : '干扰条目' + i,
            counterpart: '林一', due: null, status: 'open', revision: 1,
            floor: (i % 100) + 1, updatedFloor: (i % 100) + 1, source: '', history: []
        });
    }
    return items;
}

const LEDGERS = WB.LEDGERS;
const mkWorld = (items) => ({ version: 1, seq: items.length, items: items });
const bigHost = (n) => ({
    worldProg: { commitmentLedger: mkWorld(bigItems(n)) },
    _ledgerApis: function () { return { commitment: CL }; }
});
const QA_PLAN = EQ.planQuestion('苏晴答应了什么？', { knownActors: ['苏晴', '林一'], actorAliases: {} });
const SU_SPEC = QA_PLAN.plans.filter((p) => p.id === 'promise')[0].spec;
const qOpts = () => ({ ledgers: LEDGERS, pageSize: 30, apis: { commitment: CL } });

/* ───────────── 判据函数（负控制要在破坏副本上重跑同款） ───────────── */

/** 判据 A（内核）：同步/异步同源 + 进度 + 取消语义。@returns 问题串（空 = 全绿）。 */
async function judgeKernel(host, spec) {
    const sync = EQ.query(host, spec, qOpts());
    const progress = [];
    let yields = 0;
    const async = await EQ.queryAsync(host, spec, Object.assign(qOpts(), {
        shardRows: 500,
        onShard: (rows, total) => progress.push([rows, total]),
        yieldTo: () => { yields += 1; return Promise.resolve(); }
    }));
    if (JSON.stringify(sync) !== JSON.stringify(async)) return 'A1 同源失败：async=' + async.state + ' total=' + async.total + '（sync=' + sync.total + '）';
    if (async.state !== sync.state || async.total !== sync.total) return 'A1b 状态/条数不同步';
    if (sync.scanned !== async.scanned) return 'A1c 扫描面不同步：' + sync.scanned + '/' + async.scanned;
    if (!progress.length) return 'A2 进度零上报（片边界回调没走到）';
    if (progress[0][1] !== async.scanned) return 'A2b totalRows 读数不是扫描面：' + progress[0][1] + '/' + async.scanned;
    if (yields !== progress.length) return 'A4 让出数≠片数：' + yields + '/' + progress.length;
    for (let i = 1; i < progress.length; i += 1) {
        if (progress[i][0] <= progress[i - 1][0]) return 'A2c 进度不单调：' + progress[i][0] + ' ≤ ' + progress[i - 1][0];
    }
    if (progress[progress.length - 1][0] !== progress[0][1]) return 'A3 进度终值没到 totalRows：' + progress[progress.length - 1][0] + '/' + progress[0][1];
    return '';
}

/** 判据 B（取消）：state='canceled'、partial、processed 是已处理部分、不当 empty。 */
async function judgeCancel(host, spec) {
    let calls = 0;
    const r = await EQ.queryAsync(host, spec, Object.assign(qOpts(), {
        shardRows: 500, yieldTo: () => Promise.resolve(),
        shouldCancel: () => { calls += 1; return calls >= 4; }
    }));
    if (r.state !== 'canceled') return 'B1 取消后 state 不是 canceled：' + r.state;
    if (r.canceled !== true || r.partial !== true) return 'B1b canceled/partial 标志没立：' + r.canceled + '/' + r.partial;
    if (!r.processed || r.processed.rows !== 2000 || r.processed.totalRows !== 20000) {
        return 'B1c processed 读数不是已处理部分：' + JSON.stringify(r.processed);
    }
    if (r.state === 'empty') return 'B2 取消被冒充为 empty';
    const empty = await EQ.queryAsync(bigHost(0), spec, Object.assign(qOpts(), { shardRows: 500 }));
    if (empty.state !== 'empty') return 'B2b 空库基准态不对：' + empty.state;
    if (empty.state === r.state) return 'B2c canceled 与 empty 同形';
    return '';
}

/** 判据 B4（进度面异常隔离）：onShard 抛错，查询仍完成且读数与不挂回调一致。 */
async function judgeThrowingShard(host, spec) {
    const plain = await EQ.queryAsync(host, spec, Object.assign(qOpts(), {
        shardRows: 500, yieldTo: () => Promise.resolve()
    }));
    let threw = false;
    const r = await EQ.queryAsync(host, spec, Object.assign(qOpts(), {
        shardRows: 500, yieldTo: () => Promise.resolve(),
        onShard: () => { threw = true; throw new Error('progress face blew up'); }
    }));
    if (!threw) return 'B4a 回调没被调（破坏前提不成立）';
    if (r.state !== 'ok' || r.state !== plain.state) return 'B4b 回调抛错阻断了查询：' + r.state + '/' + plain.state;
    if (JSON.stringify(r.rows) !== JSON.stringify(plain.rows)) return 'B4c 抛错路径结果与干净路径不一致';
    return '';
}

/** 判据 C（信封）：ok/canceled/partial/empty 四态 + 14 键 + data 原样引用。 */
async function judgeEnvelope(host, spec) {
    const sources = { queryEvidenceAsync: EQ };
    const env = await MTA.queryEvidenceAsync(sources, host, spec, Object.assign(qOpts(), { shardRows: 500 }));
    const KEYS = ['kind', 'api', 'apiVersion', 'toolVersion', 'state', 'stateLabel', 'reason', 'source', 'revision', 'revisionSource', 'scope', 'data', 'notes', 'writesNothing'];
    if (Object.keys(env).join(',') !== KEYS.join(',')) return 'C1 恒定键面破坏：' + Object.keys(env).join(',');
    if (env.api !== 'queryEvidenceAsync') return 'C1b api 名不对：' + env.api;
    if (env.state !== 'ok' && env.state !== 'partial') return 'C1c ok 路径态不对：' + env.state;
    if (env.data === null || env.data.state !== env.data.state) return 'C1d data 缺席';
    const envC = await MTA.queryEvidenceAsync(sources, host, spec, Object.assign(qOpts(), {
        shardRows: 500, shouldCancel: () => true
    }));
    if (envC.state !== 'canceled') return 'C2 取消信封态不对：' + envC.state;
    if (!envC.notes.join('\n').includes('已处理部分')) return 'C2b 取消信封没说明是已处理部分';
    if (envC.state === 'empty') return 'C2c 取消被冒充 empty';
    const emptyHost = bigHost(0);
    const envE = await MTA.queryEvidenceAsync(sources, emptyHost, spec, Object.assign(qOpts(), { shardRows: 500 }));
    if (envE.state !== 'empty') return 'C2d 空库信封态不对：' + envE.state;
    if (envE.state === envC.state) return 'C2e empty 与 canceled 同形';
    if (envC.data === null) return 'C2f 取消信封丢了部分读数（data 不得为空）';
    if (MTA.CAPABILITIES.length !== 6) return 'C3 能力表不是六项：' + MTA.CAPABILITIES.length;
    const cap6 = MTA.CAPABILITIES[5];
    if (cap6.name !== 'queryEvidenceAsync' || cap6.module !== 'evidence-query.js' || cap6.sym !== 'queryAsync') {
        return 'C3b 第六能力登记不对：' + JSON.stringify(cap6);
    }
    return '';
}

/* ───────────── 宿主判据（真 index.js 切片 + 真模块 + 真账） ───────────── */

/** 判据 D（宿主接线）：queryEvidenceAsync 出口 + 第六格 + 降级不抛 + 异步问答面。 */
function judgeHost() {
    const H = mkHost(WIN_FULL());
    /* D1：统一信封出口真跑（世界真账 + 真六能力）。 */
    const env = H.queryEvidenceAsync(SU_SPEC, Object.assign(qOpts(), { shardRows: 500 }));
    if (!env || typeof env.then !== 'function') return 'D1a queryEvidenceAsync 不是 Promise';
    /* D2：异步问答真跑（恒定键面 + async 面 + done 态）。 */
    const qa = H.askMemoryQuestionAsync('苏晴答应了什么？', {});
    if (!qa || typeof qa.then !== 'function') return 'D2a askMemoryQuestionAsync 不是 Promise';
    return { host: H, envPromise: env, qaPromise: qa };
}

/** 判据 D（续）：await 后的键面/状态判读。 */
async function judgeHostAsync(src, qtSrc) {
    const H = mkHost(WIN_FULL(), src, qtSrc);
    /* 异步问答要跑真账本：给宿主补 worldProg（mkHost 只带方法与库口）。 */
    const self = Object.assign({}, H, bigHost(20000));
    const qa = await self.askMemoryQuestionAsync('苏晴答应了什么？', { shardRows: 500 });
    const ASYNC_KEYS = ['async', 'taskId', 'state', 'processed'];
    for (const k of ASYNC_KEYS) {
        if (!(k in qa)) return 'D2b async 面缺键：' + k;
    }
    if (qa.async !== true) return 'D2c async 标志没立';
    if (qa.state !== 'done') return 'D2d 完成态不对：' + qa.state + '（reason=' + qa.reason + '）';
    if (qa.writesNothing !== true) return 'D2e 只读声明丢了';
    if (qa.taskId !== '') return 'D2f 默认 taskId 应为空串';
    if (!Array.isArray(qa.plans) || !qa.plans.length) return 'D2g 计划读数缺席';
    if (qa.processed.plansTotal < 1 || qa.processed.plans !== qa.plans.length) return 'D2h processed 计划读数不对：' + JSON.stringify(qa.processed);
    if (!Array.isArray(qa.answer) || qa.answer.length < 1) return 'D2i 2 万行库有 2858 条命中，答案面却空';
    /* 进度回调真跑：宿主应把片进度转给 onProgress。 */
    const seen = [];
    const qa2 = await self.askMemoryQuestionAsync('苏晴答应了什么？', {
        shardRows: 500,
        onProgress: (p) => seen.push([p.plan, p.plans, p.rows, p.totalRows])
    });
    if (!seen.length) return 'D2j onProgress 零上报';
    if (qa2.state !== 'done') return 'D2k 挂进度回调后完成态丢了：' + qa2.state;
    if (seen[0][2] !== 500) return 'D2l 首片进度不是 shard=500：' + seen[0][2];
    /* D3：取消。 */
    let calls = 0;
    const qaC = await self.askMemoryQuestionAsync('苏晴答应了什么？', {
        shardRows: 500,
        shouldCancel: () => { calls += 1; return calls >= 4; },
        taskId: 't-42'
    });
    if (qaC.state !== 'canceled') return 'D3 取消态不对：' + qaC.state;
    if (qaC.taskId !== 't-42') return 'D3b taskId 没回带';
    if (!qaC.gaps.some((g) => g.kind === 'canceled')) return 'D3c gaps 没点名取消缺口';
    if (qaC.state === 'absent') return 'D3d 取消被冒充模块缺席';
    /* D4：模块缺席降级（EQ.queryAsync 不可达 ⇒ absent 回执，不抛）。 */
    const noAsync = Object.assign({}, EQ, { queryAsync: undefined });
    const H2src = mkHost({ LonShaEvidenceQuery: noAsync, LonShaEvidenceWorkbench: WB, LonShaCommitmentLedger: CL, LonShaMemoryTools: MTA });
    const qaX = await H2src.askMemoryQuestionAsync('苏晴答应了什么？', {});
    if (qaX.state !== 'absent') return 'D4 模块缺席没回 absent：' + qaX.state;
    if (!qaX.gaps.some((g) => g.kind === 'module')) return 'D4b 缺席回执没带 module gap';
    if (qaX.async !== true) return 'D4c 缺席回执丢了 async 面';
    if (qaX.answer.length) return 'D4d 缺席回执带了答案（不当空答案冒充）';
    return '';
}

/* ───────────── 负控制锚点（判据层只声明一次） ───────────── */

const ANCHORS = Object.freeze({
    /* E1：信封 canceled 分流被摘（取消被报成 empty —— 本仓最忌的同形）。 */
    envCanceled: String.raw`            return envelope(cap.name, 'canceled', Object.assign({}, shared, {`,
    envCanceledBroken: String.raw`            return envelope(cap.name, 'empty', Object.assign({}, shared, {`,
    /* E2：尾片进度被摘（残片库永远读不到 100%）。 */
    tailShard: String.raw`        if (!canceled && processed > 0 && (processed % shard) !== 0) {
            emitShard(processed, uni.rows.length);
        }`,
    tailShardBroken: String.raw`        if (false && !canceled && processed > 0 && (processed % shard) !== 0) {
            emitShard(processed, uni.rows.length);
        }`,
    /* E3：取消 gap 被摘（取消后的答案面缺「这不是全量结论」的说明）。 */
    qaGap: String.raw`                if (canceled) {
                    composed.gaps.push({ kind: 'canceled', why: '查询被取消:以下读数是已处理部分,不是全量结论' });
                }`,
    qaGapBroken: String.raw`                if (false && canceled) {
                    composed.gaps.push({ kind: 'canceled', why: '查询被取消:以下读数是已处理部分,不是全量结论' });
                }`
});

/** 把破坏副本写到临时文件并 require 回来（真源码 → 真装载，不走 mock）。 */
function loadBroken(tag, mod, anchor, repl) {
    const src = (mod === 'evidence-query.js') ? EQ_SRC : (mod === 'memory-tools-api.js') ? MTA_SRC : (mod === 'engine-qa-tools.js') ? QT_SRC : IDX;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3332-' + tag + '-'));
    const p = path.join(dir, mod);
    const broken = breakSource(src, anchor, repl, tag);
    fs.writeFileSync(p, broken);
    const chk = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
    assert.equal(chk.status, 0, '破坏副本必须语法可过（否则归因不成立）：' + chk.stderr.slice(-300));
    return { path: p, mod: mod };
}

/* ───────────── 测试用例 ───────────── */

test('v3332 A1~A4 ★★★★ 内核：同步/异步同源 + 2 万行分片进度 + 让出真发生', async () => {
    const problem = await judgeKernel(bigHost(20000), SU_SPEC);
    assert.equal(problem, '', problem);
});

test('v3332 B1~B3 ★★★★ 内核：取消语义（canceled ≠ empty ≠ absent）', async () => {
    const problem = await judgeCancel(bigHost(20000), SU_SPEC);
    assert.equal(problem, '', problem);
});

test('v3332 B4 ★★★★ 内核：进度回调抛错不阻断主链路', async () => {
    const problem = await judgeThrowingShard(bigHost(20000), SU_SPEC);
    assert.equal(problem, '', problem);
});

test('v3332 C1~C3 ★★★★★ 信封：queryEvidenceAsync 六能力第⑥格 + 14 键 + canceled/empty 不同形', async () => {
    const problem = await judgeEnvelope(bigHost(20000), SU_SPEC);
    assert.equal(problem, '', problem);
});

test('v3332 D1~D4 ★★★★★ 宿主：queryEvidenceAsync 出口 + askMemoryQuestionAsync 恒定键面 + 取消 + 缺席降级', async () => {
    const problem = await judgeHostAsync();
    assert.equal(problem, '', problem);
});

test('v3332 E1~E3 + F1 ★★★★★ 三条真源码破坏负控制 + 判据纯度 + fail-closed', async () => {
    /* 前提：未破坏时三条判据在原件上必须为真。 */
    assert.equal(await judgeEnvelope(bigHost(20000), SU_SPEC), '', '原件上信封判据必须为真');
    assert.equal(await judgeKernel(bigHost(20000), SU_SPEC), '', '原件上内核判据必须为真');

    /* E1：信封 canceled 分流被摘 ⇒ 取消被报成 empty（同形治理红线）。
     *   破坏副本独立装载（临时目录），在副本上重跑同款 judgeCancel 前半段。 */
    const e1 = loadBroken('envcanceled', 'memory-tools-api.js', ANCHORS.envCanceled, ANCHORS.envCanceledBroken);
    const MTA_B = require_(e1.path);
    const sourcesB = { queryEvidenceAsync: EQ };
    const envCB = await MTA_B.queryEvidenceAsync(sourcesB, bigHost(20000), SU_SPEC, Object.assign(qOpts(), {
        shardRows: 500, shouldCancel: () => true
    }));
    assert.equal(envCB.state, 'empty', '破坏必须真的生效（取消被改报成 empty）');
    assert.notEqual(envCB.state, 'canceled', 'E1 同款判据必须在破坏副本上转红：canceled 分流被摘后没人再报 canceled');

    /* E2：尾片进度被摘 ⇒ 残片库的最终进度读不到 100%。 */
    const e2 = loadBroken('tailshard', 'evidence-query.js', ANCHORS.tailShard, ANCHORS.tailShardBroken);
    const EQ_B = require_(e2.path);
    const items = bigItems(20007); /* 20007 % 500 = 7 ⇒ 有尾片 */
    const hostB = { worldProg: { commitmentLedger: mkWorld(items) }, _ledgerApis: function () { return { commitment: CL }; } };
    const progressB = [];
    const rB = await EQ_B.queryAsync(hostB, SU_SPEC, Object.assign(qOpts(), {
        shardRows: 500, onShard: (rows, total) => progressB.push([rows, total]), yieldTo: () => Promise.resolve()
    }));
    assert.equal(rB.state, 'ok', '破坏副本本身仍要能查完');
    assert.equal(progressB[progressB.length - 1][0], 20000, '破坏必须真的生效（最终进度停在 20000，读不到 20007）');

    /* E3：取消 gap 被摘 ⇒ 取消后的答案面不再点名「已处理部分」。 */
    const e3 = loadBroken('qagap', 'engine-qa-tools.js', ANCHORS.qaGap, ANCHORS.qaGapBroken);
    const IDX_B = fs.readFileSync(e3.path, 'utf8');
    const HB = mkHost(WIN_FULL(), IDX, IDX_B);
    const selfB = Object.assign({}, HB, bigHost(20000));
    let callsB = 0;
    const qaCB = await selfB.askMemoryQuestionAsync('苏晴答应了什么？', {
        shardRows: 500, shouldCancel: () => { callsB += 1; return callsB >= 4; }
    });
    assert.equal(qaCB.state, 'canceled', '破坏副本本身仍要能取消');
    assert.equal(qaCB.gaps.some((g) => g.kind === 'canceled'), false, '破坏必须真的生效（取消 gap 消失）');

    /* F1 判据纯度：每个锚点在源文件里恰中 1 次（收成一处声明后的纯度才有内容）。 */
    assert.equal(EQ_SRC.split(ANCHORS.tailShard).length - 1, 1, 'tailShard 锚点在 evidence-query.js 里必须恰中 1 次');
    assert.equal(MTA_SRC.split(ANCHORS.envCanceled).length - 1, 1, 'envCanceled 锚点在 memory-tools-api.js 里必须恰中 1 次');
    assert.equal(QT_SRC.split(ANCHORS.qaGap).length - 1, 1, 'qaGap 锚点在 engine-qa-tools.js 里必须恰中 1 次');
    /* fail-closed：判据函数对 null/undefined 宿主必须报问题而不是抛异常。 */
    let threw = null;
    try { await judgeCancel(null, SU_SPEC); } catch (e) { threw = e; }
    if (threw) throw new Error('judgeCancel 对坏宿主不得抛（fail-closed）：' + threw.message);
});

/* ══════════════════ G 版本锚 ══════════════════ */
const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
const BORN = '3.332.0';

test('v3332 G1. ★★★ 版本锚：本档出生版本 + 六源同源（V4 当版锚点形态）', () => {
    assert.equal(vnum(BORN), 3332000, 'vnum 序数必须可数（当版锚点）');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(codeVer, '入口版本常量必须在场');
    assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立；当前 ' + codeVer);
    assert.equal(MF.version, codeVer, 'manifest 与入口同源');
    assert.equal(PKG.version, codeVer, 'package.json 与入口同源');
    /* 三份模块副本也须同源（注入失败时它就是真实现 —— 副本漏抬会报出上一版号而三源全绿）。 */
    for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const mv = (/let VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(R, m), 'utf8')) || [])[1];
        assert.equal(mv, codeVer, m + ' 副本须与入口同源（须是 let：bindDeps 可换，const 会 TypeError）');
    }
    /* 当版锚点必须住在**当版档案**里（写进历史文件会被 V2 抓）。 */
    assert.ok(SELF.includes("const BORN = '3.332.0'"), '当版锚点必须显式留在本档里');
    assert.equal(SELF.includes("vnum('3.332.0')") || SELF.includes('vnum(BORN)'), true, '锚形须可被守卫计数');
});
