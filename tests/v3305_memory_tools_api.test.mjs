// tests/v3305_memory_tools_api.test.mjs — M-X9 统一记忆工具 API 与手机可消费投影（v3.305.0）
//
//   计划第二期 M-X9 点名五个 API（queryEvidence / getContinuityPack / previewFactAdmission /
//   explainRecall / getKnowledgeBoundary）。修前全仓实测：**只有 explainRecall 有实现**，
//   其余四个名零命中 —— 而它们的能力早在盘上（evidence-query / volume-continuation /
//   native-fact-admission / knowledge-trace），只是没有任何一处把「下游可以按名调用的统一面」
//   产出来。本档是那一面的成对判据。
//
//   判据面（12 条）：
//     A1 模块登记面（分发面恰一次 + 双导出 + 零兄弟依赖）
//     A2 导出面（五出口 + 三辅助 + 五态词表 + 版本常量）
//     A3 只读面（导出名零 mutating 前缀：真源码扫描 + 反向断言）
//     B1 三态在场判定（module-absent / symbol-absent / 在场 —— **三态互不同形**）
//     B2 queryEvidence 七路 / B3 previewFactAdmission 八路 / B4 getContinuityPack 七路 /
//     B5 explainRecall 五路 / B6 getKnowledgeBoundary 四路
//     C1~C3 信封恒定 14 键 + `data` 原样引用（同一性）+ 幂等 + 可序列化
//     D1~D2 宿主接线逐符号在场 + 外供登记表不漂移
//     E1~E3 三条**真源码破坏负控制**（各自必须让对应判据转红）
//     F1 判据纯度 + fail-closed
//
//   本仓老账（写进判据，防止再犯）：
//     ① 「缺席」与「空」不得同形：`unavailable`（能力不在场）与 `empty`（在场且真跑过、
//        明确没有）是两个 state，不是同一个词的不同说法 —— E2 用真源码破坏把这条钉住。
//     ② 「判不了」不得冒充「没有」：`unknown` 是独立一态（`notRecorded` ≠「他不知道」、
//        `blocked` ≠ `unproven`）。
//     ③ 判据不许自指伪证：负控制必须打在**真文件内容**上，并在**破坏副本**上重跑同款判据
//        （不得对原文件断言，也不得把破坏写死成模拟常量）。
//     ④ 「不许猜符号名」：五个能力登记的 `ver` 常量名一律写死（首版按 name 推导 ⇒ 恒 null
//        而 state 仍 ok，是本版抓到的自伤之一）。A2 逐字核这五个真名。
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { breakSource } from './_break_kit.mjs';
import { stripComments } from './_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const require_ = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const MOD = 'memory-tools-api.js';
const MOD_SRC = read(MOD);
const SELF = read(path.join('tests', 'v3305_memory_tools_api.test.mjs'));
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const IDX = read('index.js');

/* ── 被包装面（真上游模块，不是 mock） ── */
const Q = require_(path.join(R, 'evidence-query.js'));
const VC = require_(path.join(R, 'volume-continuation.js'));
const FA = require_(path.join(R, 'native-fact-admission.js'));
const RE = require_(path.join(R, 'recall-explain.js'));
const KT = require_(path.join(R, 'knowledge-trace.js'));
const WB = require_(path.join(R, 'evidence-workbench.js'));
const T = require_(path.join(R, MOD));
const S = {
    queryEvidence: Q, getContinuityPack: VC, previewFactAdmission: FA,
    explainRecall: RE, getKnowledgeBoundary: KT
};
/** 真上游模块表（同一性判据要包一层再核对，故需要拿到真函数）。 */
const UP = { Q: Q, VC: VC, FA: FA, RE: RE, KT: KT };

/**
 * 负控制锚点（**在判据层只声明一次**，见 F1 的纯度检查）。
 *   ★ 为什么收成一张表而不是各处内联：锚点若在「破坏调用」与「纯度断言」两处各写一份，
 *     改一处漏一处时纯度检查会**恒过**（它数的是自己那一份）。收成一处之后，
 *     每个锚点在文件里的出现次数必须是 1 —— 这条断言才有内容。
 *   ★ 为什么用 String.raw + 真换行/缩进：锚点是**磁盘现值**，多一个空格即打偏；
 *     而 `breakSource` 会在 0 命中时当场拒绝（本档不靠肉眼对齐）。
 */
const ANCHORS = Object.freeze({
    /* E1：五态词表被拆掉一态（词的完整性是契约：少一态意味着某类处境无处安放）。 */
    states: String.raw`    const STATES = Object.freeze(['ok', 'empty', 'unknown', 'unavailable', 'partial']);`,
    statesBroken: String.raw`    const STATES = Object.freeze(['ok', 'empty', 'unknown', 'unavailable']);`,
    /* E2：缺席分流被摘掉（把「能力不在场」改报成「在场且没有」——本仓最忌的同形）。 */
    absentBranch: String.raw`        return envelope(apiName, 'unavailable', {`,
    absentBranchBroken: String.raw`        return envelope(apiName, 'empty', {`,
    /* E3：`data` 从原样引用被换成深拷贝（口径③：投影不复制第二份事实库）。 */
    dataRef: String.raw`            data: (opts.data === undefined ? null : opts.data),`,
    dataRefBroken: String.raw`            data: (opts.data === undefined ? null : JSON.parse(JSON.stringify(opts.data))),`
});

/* ───────────────── 夹具（期望值全部来自真读数，不猜） ───────────────── */
const seedSpec = WB.LEDGERS.filter((l) => l.id === 'seed')[0];
const APIS = { seed: {} };
/** 真 seed 账一行 → queryEvidence 正例（上游 `state='ok'`）。 */
const hostSeed = () => ({
    worldProg: {
        seedLedger: {
            items: [{ id: 's1', hook: '被埋下的伏笔', source: 'seedLedger', status: 'open', floor: 2, revision: 1 }]
        }
    }
});
const qOpts = () => ({ ledgers: [seedSpec], apis: APIS });
/** 五面齐备的合成项目 → getContinuityPack 正例（上游 `ok=true` 且 `absentFaces=[]`）。 */
const projFull = () => ({
    project: { projectId: 'p1', volumes: [{ ref: 1, entries: [] }] },
    volumeRef: 1,
    faces: { factVersion: [], characterState: [], unfinished: [], money: [], storyTime: [] }
});
const projBare = () => ({ project: { projectId: 'p1', volumes: [{ ref: 1, entries: [] }] }, volumeRef: 1 });
const MK = (traces) => ({ version: 1, traces });
/** explainRecall 正例：无挡下 + 载荷 1 块 ⇒ 上游 stage='injected'。 */
const exOk = () => ({
    query: { text: 'x', floor: 5 },
    sources: [{ key: 'a', enabled: true, hits: 1 }],
    alias: { filtered: 0, mapSize: 1 }, validity: { filtered: 0 }, budget: { kept: 2 },
    injected: { count: 1 },
    audit: { presented: true, floor: 5, floorMatched: 'matched', idMatched: true, totalHits: 1, srcKeys: ['a'] }
});
/** explainRecall unproven 例：可选面（载荷）缺读数 ⇒ 上游 `unproven=true`、`blockingMissing=[]`。 */
const exUnproven = () => {
    const x = exOk();
    delete x.injected;
    return x;
};

/* ───────────────── 判据本体（纯函数：负控制要在破坏副本上重跑它们） ───────────────── */
/** A1：分发面恰一次 + 末位 + 双导出 + 零兄弟依赖。 */
function judgeA1(Tx, mf) {
    const hits = (mf.extra_js || []).filter((f) => f === MOD);
    if (hits.length !== 1) return 'extra_js 里 ' + MOD + ' 必须恰出现 1 次，实 ' + hits.length;
    /* ★ **不判末位**：`extra_js` 末位是**任一版都会变**的位置（后来的模块不断往后追加），
     *   把「本版是末位」写成永久断言 = 「把某版的一次性事实当永久不变量」——
     *   它会在**下一版**必然翻红，且红得与自身无关（本档实测就是这样）。
     *   改判「本模块与它追加时紧邻的那个模块都恰在场」：位置不入判据，在场仍在判据。 */
    if (mf.extra_js.indexOf(MOD) < 0 || mf.extra_js.indexOf('fact-state.js') < 0) {
        return '本模块与其追加时的邻居须都在 extra_js（位置不作判据）';
    }
    if (!Tx || typeof Tx !== 'object') return '模块须可加载（CJS 双导出）';
    if (typeof Tx.queryEvidence !== 'function') return 'queryEvidence 必须是函数';
    const code = stripComments(MOD_SRC);
    if (code.includes('require(')) return '模块**不得** require 兄弟模块（能力经 sources 参数注入，缺席才可表达）';
    return '';
}
/** A2：导出面逐字（含五个**写死**的版本常量名 —— 不许推导）。 */
function judgeA2(Tx) {
    const need = ['queryEvidence', 'getContinuityPack', 'previewFactAdmission', 'explainRecall',
        'getKnowledgeBoundary', 'describe', 'line', 'selfCheck'];
    for (const k of need) if (typeof Tx[k] !== 'function') return '导出面缺函数：' + k;
    if (Tx.KIND !== 'memory-tools-envelope') return 'KIND 必须逐字 memory-tools-envelope，实 ' + Tx.KIND;
    if (!(Tx.TOOLS_VERSION >= 1) || !(Tx.API_VERSION >= 1)) return '两个版本常量必须 >= 1';
    const want = ['ok', 'empty', 'unknown', 'unavailable', 'partial'];
    if (!Array.isArray(Tx.STATES) || Tx.STATES.length !== want.length) return '五态词表长度必须是 5';
    for (const s of want) if (Tx.STATES.indexOf(s) < 0) return '五态词表缺：' + s;
    for (const s of want) if (typeof Tx.STATE_LABEL[s] !== 'string' || !Tx.STATE_LABEL[s]) return 'STATE_LABEL 缺：' + s;
    if (!Array.isArray(Tx.CAPABILITIES) || Tx.CAPABILITIES.length !== 5) return 'CAPABILITIES 必须 5 条';
    /* ★ 「不许猜符号名」：五个 ver 常量名逐字写死（推导出来的名字全不存在 ⇒ 恒 null 而 state 仍 ok）。 */
    const VERS = ['QUERY_VERSION', 'VOLUME_CONTINUATION_VERSION', 'ADMIT_VERSION',
        'RECALL_EXPLAIN_VERSION', 'KT_VERSION'];
    for (const c of Tx.CAPABILITIES) {
        for (const k of ['name', 'module', 'sym', 'ver', 'label', 'arg']) {
            if (!c[k]) return 'CAPABILITIES 的 ' + c.name + ' 缺字段 ' + k;
        }
        if (VERS.indexOf(c.ver) < 0) return '未登记的版本常量名（不许推导）：' + c.ver;
    }
    return '';
}
/** A3：只读面 —— 导出名里零 mutating 前缀。 */
const MUTATING = ['set', 'put', 'write', 'save', 'update', 'delete', 'clear', 'remove', 'commit', 'apply'];
function countMutating(names) {
    return names.filter((n) => {
        const low = String(n).toLowerCase();
        return MUTATING.some((m) => low.indexOf(m) === 0);
    }).length;
}
function judgeA3(Tx) {
    if (countMutating(Object.keys(Tx)) !== 0) return '导出面出现 mutating 名（本面不开写口）';
    /* 真源码扫描：`const api = {` 块里的键名逐一过同一把尺（防「导出对象被包装」绕过键名检查）。 */
    const m = /const api = \{([\s\S]*?)\n    \};/.exec(stripComments(MOD_SRC));
    if (!m) return '源码里找不到 const api 字面量（扫描面失效，本判据会恒真）';
    const names = [...m[1].matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)].map((x) => x[1]);
    if (names.length < 14) return 'const api 块里的键名数异常（实 ' + names.length + '，应 >= 14）：扫描面不可信';
    if (countMutating(names) !== 0) return 'const api 块里出现 mutating 名：' + names.join(',');
    return '';
}
/** B1：三态在场判定（互不同形）。 */
function judgeB1(Tx, Sx) {
    const full = Tx.describe(Sx);
    if (full.counts.present !== 5 || full.counts.absent !== 0) return '五能力齐备时 present 应为 5';
    if (full.complete !== true) return '五能力齐备时 complete 应为 true';
    const none = Tx.describe({});
    if (none.counts.absent !== 5) return '全缺席时 absent 应为 5';
    if (none.complete !== false) return '全缺席时 complete 应为 false';
    if (!none.absentReasons.every((x) => x.reason === 'module-absent')) return '未注入 ⇒ module-absent';
    /* 注入了但缺符号：该格必须报 symbol-absent，**而其余四格仍缺席**（降级是逐出口的）。 */
    const half = Tx.describe({ queryEvidence: {} });
    const row = half.absentReasons.filter((x) => x.name === 'queryEvidence')[0];
    if (!row) return '注入了缺符号的模块 ⇒ 该格必须仍出现在 absentReasons 里';
    if (row.reason !== 'symbol-absent') return '注入了但缺符号 ⇒ symbol-absent，实 ' + row.reason;
    if (half.counts.absent !== 5 || half.counts.present !== 0) return '缺符号不是「在场」：五格都还没装配齐';
    if (half.absentReasons.length !== 5) return '其余四格必须逐格点名（只注入一格不影响其余四格的判定）';
    /* 三态互不同形：两个原因串必须不同（否则下游无法分列）。 */
    if (row.reason === none.absentReasons[0].reason) return 'symbol-absent 与 module-absent 不得同形';
    return '';
}
/** B2：queryEvidence 七路（每条同时断 state 与 reason）。 */
function judgeB2(Tx, Sx) {
    const ok = Tx.queryEvidence(Sx, hostSeed(), { id: 'seed' }, qOpts());
    if (ok.state !== 'ok' || ok.reason !== '') return '真读数应 ok/空 reason，实 ' + ok.state + '/' + ok.reason;
    if (!ok.data || ok.data.total !== 1) return 'ok 时 data 必须是上游真读数（total=1），实 ' + JSON.stringify(ok.data && ok.data.total);
    const em = Tx.queryEvidence(Sx, { worldProg: { seedLedger: { items: [] } } }, { id: 'seed' }, qOpts());
    if (em.state !== 'empty' || em.reason !== 'no-match') return '账在位且空应 empty/no-match，实 ' + em.state + '/' + em.reason;
    const inv = Tx.queryEvidence(Sx, hostSeed(), { id: 'seed', floorFrom: 9, floorTo: 2 }, qOpts());
    if (inv.state !== 'empty' || inv.reason !== 'inverted-range') return '区间反转应 empty/inverted-range，实 ' + inv.state + '/' + inv.reason;
    const scan = Tx.queryEvidence(Sx, {}, { id: 'seed' }, qOpts());
    if (scan.state !== 'unavailable' || scan.reason !== 'scan-surface-absent') {
        return '九账全取不到应 unavailable/scan-surface-absent（「没东西可查」≠「查不到」），实 ' + scan.state + '/' + scan.reason;
    }
    const ma = Tx.queryEvidence({}, hostSeed(), { id: 'seed' }, qOpts());
    if (ma.state !== 'unavailable' || ma.reason !== 'module-absent') return '模块缺席应 unavailable/module-absent，实 ' + ma.state + '/' + ma.reason;
    const sa = Tx.queryEvidence({ queryEvidence: {} }, hostSeed(), { id: 'seed' }, qOpts());
    if (sa.state !== 'unavailable' || sa.reason !== 'symbol-absent') return '符号缺席应 unavailable/symbol-absent，实 ' + sa.state + '/' + sa.reason;
    const th = Tx.queryEvidence({ queryEvidence: { query() { throw new Error('x'); } } }, hostSeed(), {}, {});
    if (th.state !== 'unknown' || th.reason !== 'thrown') return '上游抛错应 unknown/thrown，实 ' + th.state + '/' + th.reason;
    if (th.data !== null) return 'unknown 的 data 必须是 null（不得给空壳冒充读数）';
    /* 缺席 vs 空：data 形状必须不同（缺席 null / 空给真读数）。 */
    if (em.data === null) return 'empty 的 data 必须是上游真读数（非 null）—— 缺席与空不得同形';
    return '';
}
/** B3：previewFactAdmission 八路（值域**照抄上游**，不许自建第二份）。 */
function judgeB3(Tx, Sx) {
    const cases = [
        [{ eventId: 'e1', source: 'finance-confirmed', status: 'confirmed' }, 'ok', 'admitted'],
        [{ eventId: 'e2', source: 'calendar' }, 'partial', 'state-observed'],
        [{ eventId: 'e3', source: 'quote' }, 'partial', 'state-predicted'],
        [{ eventId: 'e4', source: 'usage' }, 'partial', 'state-draft'],
        [{ eventId: 'e5', source: 'forward' }, 'partial', 'state-quoted'],
        [{}, 'unknown', 'missing-identity'],
        [{ eventId: 'e6', source: 'zzz-unknown' }, 'unknown', 'unknown-source'],
        [{ eventId: 'e7', source: 'calendar', retracted: true }, 'empty', 'owner-retracted']
    ];
    for (const [fact, wantState, wantReason] of cases) {
        const env = Tx.previewFactAdmission(Sx, fact, {});
        if (env.state !== wantState || env.reason !== wantReason) {
            return 'fact=' + JSON.stringify(fact) + ' 应 ' + wantState + '/' + wantReason
                + '，实 ' + env.state + '/' + env.reason;
        }
    }
    /* ★ `data` 原样引用**不在本判据里判**：那是 C2（judgeIdentity）的职责，
     *   而 `data:` 那一行是五出口共用的 —— 两处各判一遍会让 E3 的归因断言失效
     *   （判据职责重叠时，「破坏只影响一条」就成了一句假话）。 */
    /* 反向：未登记的 decision 不许猜成「拒绝」或「通过」。 */
    const un = Tx.previewFactAdmission(
        { previewFactAdmission: { admitNativeFact: () => ({ decision: 'zzz', measurable: true, reason: '' }) } }, {}, {});
    if (un.state !== 'unknown') return '未登记 decision 必须落 unknown（不猜），实 ' + un.state;
    if (!un.reason.includes('zzz')) return '未登记 decision 的原值必须带进 reason，实 ' + un.reason;
    return '';
}
/** B4：getContinuityPack 七路（reason 与 state 不许自相矛盾）。 */
function judgeB4(Tx, Sx) {
    const ok = Tx.getContinuityPack(Sx, projFull());
    if (ok.state !== 'ok') return '五面齐备应 ok，实 ' + ok.state + '/' + ok.reason;
    if (ok.reason !== '') return 'ok 路的 reason 应是空串（本面不自编成因），实 ' + JSON.stringify(ok.reason);
    const pa = Tx.getContinuityPack(Sx, projBare());
    if (pa.state !== 'partial') return '缺面应 partial，实 ' + pa.state;
    /* ★ 成功路径的 reason 必须是空串、上游原值在 data 上 —— 本面不得自编 faces-absent 塞进 reason
     *   （那会让「一处说没问题、一处说收窄了」同时出现，读者无从判断该信哪一格）。 */
    if (pa.reason !== '') return '成功路径的 reason 不得自编成因（上游原值在 data.reason），实 ' + JSON.stringify(pa.reason);
    if (pa.data.reason !== 'ok') return '上游原值必须留在 data 上（实测字面量 ok），实 ' + JSON.stringify(pa.data.reason);
    if (!pa.scope || pa.scope.absentFaces !== 5) return '成因必须落在 scope.absentFaces，实 ' + JSON.stringify(pa.scope);
    if (!pa.scope.absentBy || pa.scope.absentBy['face-absent'] !== 5) return 'absentBy 必须按上游每项自带 reason 分类';
    const np = Tx.getContinuityPack(Sx, {});
    if (np.state !== 'unknown' || np.reason !== 'no-project') return '缺项目应 unknown/no-project（不得当 empty），实 ' + np.state + '/' + np.reason;
    const nv = Tx.getContinuityPack(Sx, { project: { projectId: 'p1', volumes: [{ ref: 1 }] }, volumeRef: 9 });
    if (nv.state !== 'empty' || nv.reason !== 'no-volume') return '项目在但该卷没有应 empty/no-volume，实 ' + nv.state + '/' + nv.reason;
    const ln = Tx.getContinuityPack(Sx, Object.assign(projBare(), { license: 'none' }));
    if (ln.state !== 'unavailable' || ln.reason !== 'license-none') return '许可不含此面应 unavailable/license-none，实 ' + ln.state + '/' + ln.reason;
    /* 缺席（license-none）与空（no-volume）不得同形 —— 分形靠 state + reason + data.reason，
     *   而不是靠 data 是否为 null（这一条本档首版写错过：license-none 走的是**上游有返回值**的
     *   分支，data 是上游那对象、不是 null；给 null 的是「能力压根不在场」那一支）。 */
    if (ln.state === nv.state) return '许可不含此面（unavailable）与项目在但该卷没有（empty）必须分态';
    if (ln.reason === nv.reason) return '两态的 reason 必须不同';
    if (!ln.data || !nv.data) return '这两支上游都有返回值 ⇒ data 不得为 null（本面不得吞掉上游读数）';
    if (ln.data.reason === nv.data.reason) return '上游原值也必须分形（license-none vs no-volume）';
    /* 「能力不在场」那一支才是 data=null（缺席不是空）。 */
    const absent = Tx.getContinuityPack({}, projFull());
    if (absent.state !== 'unavailable' || absent.reason !== 'module-absent') return '能力不在场应 unavailable/module-absent，实 ' + absent.state + '/' + absent.reason;
    if (absent.data !== null) return '能力不在场 ⇒ data=null（缺席不给假读数）';
    if (absent.data === ln.data) return '「许可不给」与「能力不在场」不得同形';
    return '';
}
/** B5：explainRecall 五路（blocked ≠ unproven）。 */
function judgeB5(Tx, Sx) {
    const ok = Tx.explainRecall(Sx, exOk(), {});
    if (ok.state !== 'ok') return '无挡下 + 载荷 1 块应 ok，实 ' + ok.state + '/' + ok.reason;
    if (ok.scope.verdictStage !== 'injected') return 'ok 时须带出上游档名，实 ' + JSON.stringify(ok.scope.verdictStage);
    const un = Tx.explainRecall(Sx, exUnproven(), {});
    if (un.state !== 'partial' || un.reason !== 'unproven') return '链走完但没定论应 partial/unproven，实 ' + un.state + '/' + un.reason;
    const bl = Tx.explainRecall(Sx, { query: { text: 'x', floor: 5 }, audit: exOk().audit }, {});
    if (bl.state !== 'unknown' || bl.reason !== 'blocked') return '必需面缺读数应 unknown/blocked（**不是** partial），实 ' + bl.state + '/' + bl.reason;
    if (!bl.scope.blockingMissing.includes('source-missing')) return 'blocked 时须带出具体阻断面，实 ' + JSON.stringify(bl.scope.blockingMissing);
    const up = Tx.explainRecall(Sx, { query: { text: 'x' } }, {});
    if (up.state !== 'unknown' || up.reason !== 'unpaired') return '未配对应 unknown/unpaired，实 ' + up.state + '/' + up.reason;
    const off = Tx.explainRecall({}, exOk(), {});
    if (off.state !== 'unavailable' || off.reason !== 'module-absent') return '模块缺席应 unavailable/module-absent，实 ' + off.state + '/' + off.reason;
    /* blocked 与 unproven 不得同形（一个是「判不了」，一个是「有读数、落点未定」）。 */
    if (bl.state === un.state) return 'blocked 与 unproven 压成同一 state 会让下游分不清该补观测面还是放宽结论';
    /* 本出口 empty 本版不可达 —— 如实登记（不凑态）。 */
    const all = [ok, un, bl, up, off].map((x) => x.state);
    if (all.indexOf('empty') >= 0) return '本出口的 empty 本版不可达，出现即为口径漂移（零命中不是空数据）';
    return '';
}
/** B6：getKnowledgeBoundary 四路（未记录 ≠ 他不知道）。 */
function judgeB6(Tx, Sx) {
    const ok = Tx.getKnowledgeBoundary(Sx, MK([{ id: 't1', character: 'P', fact: 'F', action: 'acquire', floor: 3 }]), 'P', 'F');
    if (ok.state !== 'ok') return 'acquire 链应 ok，实 ' + ok.state + '/' + ok.reason;
    if (ok.scope.state !== 'knows') return '上游 state 应带出（knows），实 ' + JSON.stringify(ok.scope.state);
    const br = Tx.getKnowledgeBoundary(Sx, MK([{ id: 't1', character: 'P', fact: 'F', action: 'correct', floor: 3, corrects: 'nope' }]), 'P', 'F');
    if (br.state !== 'partial' || br.reason !== 'broken-link') return '纠正链断裂应 partial/broken-link，实 ' + br.state + '/' + br.reason;
    const nr = Tx.getKnowledgeBoundary(Sx, MK([]), 'P', 'F');
    if (nr.state !== 'unknown' || nr.reason !== 'not-recorded') {
        return '空链应 unknown/not-recorded（**未记录 ≠ 他不知道**），实 ' + nr.state + '/' + nr.reason;
    }
    const ma = Tx.getKnowledgeBoundary({}, MK([]), 'P', 'F');
    if (ma.state !== 'unavailable' || ma.reason !== 'module-absent') return '模块缺席应 unavailable/module-absent，实 ' + ma.state + '/' + ma.reason;
    /* 实参顺序：第一参是 raw trace 账（错序会恒定返回 notRecorded —— 一个看起来正常的读数）。 */
    if (nr.data === null) return 'notRecorded 仍应带出上游真读数（不是缺席）';
    return '';
}
/**
 * C2 专判：五个出口的 `data` 都必须是对**被包装面返回值**的原样引用（同一性）。
 *   ★ 为什么必须包一层再核对：直接从真模块再取一次拿到的是 require 缓存里的**同一个对象**，
 *     `===` 恒真 —— 那不是判据在守，是缓存恒等（本档首版就踩了这个，破坏副本上照样绿）。
 *   ★ 为什么五个出口都要判：`data:` 那一行是 `envelope()` 里**五出口共用**的，
 *     改坏一处五个出口一起坏 —— 故「定位到具体一条」的正确形态是这条判据整体转红，
 *     而不是指望别的出口不受影响（本档首版第二条写错）。
 */
function judgeIdentity(Tx, Sx, Up) {
    const seen = {};
    const seenEnvs = [];
    const wrap = (key, fnName, real) => ({
        [fnName]: (...args) => { const r = real[fnName](...args); seen[key] = r; return r; }
    });
    const spySources = {
        queryEvidence: wrap('q', 'query', Up.Q),
        getContinuityPack: wrap('c', 'buildContinuationPack', Up.VC),
        previewFactAdmission: wrap('p', 'admitNativeFact', Up.FA),
        explainRecall: wrap('e', 'explainRecall', Up.RE),
        getKnowledgeBoundary: wrap('k', 'provenanceOf', Up.KT)
    };
    seenEnvs.push(['queryEvidence', Tx.queryEvidence(spySources, hostSeed(), { id: 'seed' }, qOpts()), 'q']);
    seenEnvs.push(['getContinuityPack', Tx.getContinuityPack(spySources, projFull()), 'c']);
    seenEnvs.push(['previewFactAdmission', Tx.previewFactAdmission(spySources, { eventId: 'e1', source: 'finance-confirmed', status: 'confirmed' }, {}), 'p']);
    seenEnvs.push(['explainRecall', Tx.explainRecall(spySources, exOk(), {}), 'e']);
    seenEnvs.push(['getKnowledgeBoundary', Tx.getKnowledgeBoundary(spySources, MK([{ id: 't1', character: 'P', fact: 'F', action: 'acquire', floor: 3 }]), 'P', 'F'), 'k']);
    for (const [name, env, key] of seenEnvs) {
        if (!seen[key] || typeof seen[key] !== 'object') return name + '：被包装面必须被真调用一次（否则同一性无从取证）';
        if (env.data !== seen[key]) return name + ' 的 data 必须是上游返回值的原样引用（同一性，不是深比较）';
    }
    return '';
}
/** C：信封恒定 14 键 + data 原样引用 + 幂等 + 可序列化。 */
function judgeC(Tx, Sx, Up) {
    const KEYS = ['kind', 'api', 'apiVersion', 'toolVersion', 'state', 'stateLabel', 'reason',
        'source', 'revision', 'revisionSource', 'scope', 'data', 'notes', 'writesNothing'];
    const env = Tx.queryEvidence(Sx, hostSeed(), { id: 'seed' }, qOpts());
    const got = Object.keys(env);
    if (got.length !== KEYS.length) return '信封键数应为 ' + KEYS.length + '，实 ' + got.length + '：' + got.join(',');
    for (const k of KEYS) if (got.indexOf(k) < 0) return '信封缺键：' + k;
    if (env.kind !== Tx.KIND) return 'kind 必须与导出常量一致';
    if (env.source.path !== 'not-given') return 'source.path 必须恒为字面量 not-given，实 ' + env.source.path;
    if (env.source.module !== 'evidence-query.js' || env.source.symbol !== 'query') return 'source 必须给文件名 + 符号名';
    if (env.writesNothing !== true) return 'writesNothing 必须是 true（只读面自述）';
    /* data 原样引用（五个出口逐条判同一性，不是深比较）。 */
    const idMsg = judgeIdentity(Tx, Sx, Up);
    if (idMsg) return idMsg;
    /* 幂等 + 可序列化（往返自证）。 */
    const a = Tx.describe(Sx), b = Tx.describe(Sx);
    if (JSON.stringify(a) !== JSON.stringify(b)) return '同入参两次 describe 必须逐字相同（本模块无模块级可变状态）';
    const sc = Tx.selfCheck(Sx);
    if (sc.ok !== true) return 'selfCheck 必须为真：' + JSON.stringify(sc);
    if (sc.writeFaces !== 0 || sc.statesComplete !== true || sc.deterministic !== true || sc.serializable !== true) {
        return 'selfCheck 四证逐条必须为真：' + JSON.stringify(sc);
    }
    const one = Tx.queryEvidence(Sx, hostSeed(), { id: 'seed' }, qOpts());
    if (JSON.parse(JSON.stringify(one)).state !== 'ok') return '信封必须是纯 JSON 面（无函数 / 无循环引用）';
    return '';
}

/* ══════════════════ A 模块与导出面 ══════════════════ */
test('v3305 A1. ★★★ 模块登记面：分发面恰一次 + 末位（零兄弟依赖）+ 双导出', () => {
    assert.ok(fs.existsSync(path.join(R, MOD)), MOD + ' 必须在场');
    assert.equal(judgeA1(T, MF), '', '登记面判据');
    /* 双导出：CJS（module.exports）与浏览器全局（root.LonShaX）都要在。
     *   `require_` 第二次拿到的是**同一份缓存**（=== 恒真，那不是判据在守），
     *   故真判据是「源码里两个出口都在」+「全局名真被挂上」。 */
    assert.equal(stripComments(MOD_SRC).includes('module.exports = api'), true, '必须保留 CJS 导出');
    assert.equal(/root\.LonSha[A-Za-z]* = Object\.freeze\(api\)/.test(stripComments(MOD_SRC)), true,
        '必须挂浏览器全局（宿主按全局名取件）');
    /* 本模块在 Node 下挂到 globalThis（IIFE 的 root = window || globalThis）。 */
    assert.equal(typeof globalThis.LonShaMemoryTools, 'object', 'root.LonShaMemoryTools 必须被挂上');
    assert.equal(globalThis.LonShaMemoryTools, T, '全局名必须指向同一个 api 对象');
    assert.equal(Object.isFrozen(globalThis.LonShaMemoryTools), true, '全局挂载须冻结（防宿主侧被改写）');
    /* 五态词表与 STATE_LABEL 是契约，不是装饰。 */
    assert.equal(T.KIND, 'memory-tools-envelope');
    assert.equal(T.STATES.length, 5);
});

test('v3305 A2. ★★★★ 导出面：五出口 + 三辅助 + 词表/版本常量，五个 ver 真名逐字', () => {
    assert.equal(judgeA2(T), '', '导出面判据');
    /* 「不许猜符号名」的落点：五个 ver 名字必须与上游模块的**真导出**对得上。 */
    const mods = { 'evidence-query.js': Q, 'volume-continuation.js': VC, 'native-fact-admission.js': FA, 'recall-explain.js': RE, 'knowledge-trace.js': KT };
    for (const c of T.CAPABILITIES) {
        const m = mods[c.module];
        assert.ok(m, '登记的上游模块必须真在场：' + c.module);
        assert.ok(m[c.ver] !== undefined, c.module + ' 必须真导出 ' + c.ver + '（推导出来的名字全不存在）');
        assert.equal(typeof m[c.sym], 'function', c.module + ' 必须真导出函数 ' + c.sym);
    }
    assert.equal(T.CAPABILITIES.filter((c) => c.name === 'queryEvidence')[0].sym, 'query');
    assert.equal(T.CAPABILITIES.filter((c) => c.name === 'getKnowledgeBoundary')[0].sym, 'provenanceOf');
});

test('v3305 A3. ★★★ 只读面：导出名零 mutating 前缀（真源码扫描 + 反向断言）', () => {
    assert.equal(judgeA3(T), '', '只读面判据');
    /* 反向断言：这把尺必须真的分得出（否则「零命中」是恒真，不是合格）。 */
    assert.equal(countMutating(['setX', 'putY', 'writeZ', 'deleteW', 'applyV']), 5, '判据必须能数出 mutating 名');
    assert.equal(countMutating(['queryEvidence', 'getContinuityPack', 'describe', 'line']), 0, '正常导出名不得被误判');
    for (const n of Object.keys(T)) assert.equal(/^(set|put|write|save|update|delete|clear|remove|commit|apply)/i.test(n), false, '导出名 ' + n + ' 命中 mutating 前缀');
});

/* ══════════════════ B 在场判定与五出口 ══════════════════ */
test('v3305 B1. ★★★★ 三态在场判定：module-absent / symbol-absent / 在场，互不同形', () => {
    assert.equal(judgeB1(T, S), '', '三态在场判据');
    const d = T.describe(S);
    assert.equal(d.kind, T.KIND + '-describe', 'describe 的 kind 必须是子面标识（下游据此判认不认得）');
    assert.equal(d.capabilities.length, 5, '逐能力读数必须五行');
    for (const c of d.capabilities) {
        assert.equal(c.present, true, c.name + ' 应 present');
        assert.equal(typeof c.version, 'number', c.name + ' 的版本读数必须是数字（在场且真读到）');
    }
    assert.ok(T.line(S).includes('五能力齐备'), '一行诊断：齐备');
    assert.ok(T.line({}).includes('0/5 在场'), '一行诊断：全缺时如实报 0/5');
});

test('v3305 B2. ★★★★★ queryEvidence 七路：ok / empty / 区间反转 / 扫描面缺 / 缺席 ×2 / 抛错', () => {
    assert.equal(judgeB2(T, S), '', 'queryEvidence 判据');
    /* 逐条再核 state 与 reason 的分工：ok 与 empty 的 reason 必须不同。 */
    const ok = T.queryEvidence(S, hostSeed(), { id: 'seed' }, qOpts());
    const em = T.queryEvidence(S, { worldProg: { seedLedger: { items: [] } } }, { id: 'seed' }, qOpts());
    assert.equal(ok.state, 'ok');
    assert.equal(em.state, 'empty');
    assert.notEqual(ok.reason, em.reason, 'ok 与 empty 的 reason 不得同形');
    assert.equal(ok.data === em.data, false, 'ok 与 empty 的 data 必须是两次真读数（不是同一个对象）');
});

test('v3305 B3. ★★★★★ previewFactAdmission 八路：值域照抄上游（七档 decision 逐条）', () => {
    assert.equal(judgeB3(T, S), '', 'previewFactAdmission 判据');
    /* 上游 decision 的**真值域**必须与映射表覆盖的键一致（多一档少一档都算漂移）。 */
    const raw = FA.admitNativeFact({ eventId: 'e1', source: 'finance-confirmed', status: 'confirmed' }, {});
    assert.ok(raw && typeof raw.decision === 'string');
    for (const [f, want] of [[{ eventId: 'a', source: 'calendar' }, 'observed'], [{ eventId: 'b', source: 'forward' }, 'quoted']]) {
        assert.equal(FA.admitNativeFact(f, {}).decision, want, '上游策略表是唯一真源');
    }
    /* observed/predicted/draft/quoted 四条真读数**不得**落兜底 unknown（本版抓到的自伤之一）。 */
    for (const [f, want] of [[{ eventId: 'c', source: 'calendar' }, 'partial'], [{ eventId: 'd', source: 'usage' }, 'partial']]) {
        assert.equal(T.previewFactAdmission(S, f, {}).state, want, '四档未定状态不得被压成 unknown 或 rejected');
    }
});

test('v3305 B4. ★★★★★ getContinuityPack 七路：成功路径 reason 保持上游原值，成因落 scope', () => {
    assert.equal(judgeB4(T, S), '', 'getContinuityPack 判据');
    const pa = T.getContinuityPack(S, projBare());
    assert.notEqual(pa.state, 'ok', '缺五面不得报 ok（范围被收窄）');
    assert.equal(pa.state, 'partial');
    assert.equal(pa.data.ok, true, 'data 仍是上游真读数（ok=true）');
    /* 许可收窄（summary-only）与普通缺面同态同因分列：absentBy 的键必须区分两者。 */
    const so = T.getContinuityPack(S, Object.assign(projBare(), { license: 'summary-only' }));
    assert.equal(so.state, 'partial');
    assert.equal(so.scope.absentBy['license-summary-only'], 5, '许可收窄必须按上游 reason 分列，不得与 face-absent 合并');
});

test('v3305 B5. ★★★★★ explainRecall 五路：blocked（判不了）≠ unproven（落点未定）', () => {
    assert.equal(judgeB5(T, S), '', 'explainRecall 判据');
    const un = T.explainRecall(S, exUnproven(), {});
    assert.equal(un.state, 'partial');
    assert.equal(un.scope.verdictUnproven, true, 'partial 的真判据是 verdict.unproven（不是 narrowed）');
    assert.deepEqual(un.scope.blockingMissing, [], 'unproven 例的阻断面必须为空（两者不同成因）');
    const bl = T.explainRecall(S, { query: { text: 'x', floor: 5 }, audit: exOk().audit }, {});
    assert.equal(bl.state, 'unknown');
    assert.notEqual(bl.state, un.state, '这两条必须能从 state 上分开');
    /* 上游三面原样带出、不合并（narrowed / blockingMissing / unreadDownstream）。 */
    assert.ok(Array.isArray(bl.scope.narrowed) && Array.isArray(bl.scope.unreadDownstream), '三面必须各自曝光');
});

test('v3305 B6. ★★★★ getKnowledgeBoundary 四路：实参顺序 + 未记录 ≠ 他不知道', () => {
    assert.equal(judgeB6(T, S), '', 'getKnowledgeBoundary 判据');
    /* 实参错序会恒定返回 notRecorded（本版抓到的自伤）—— 故正例必须真读到 knows。 */
    const ok = T.getKnowledgeBoundary(S, MK([{ id: 't1', character: 'P', fact: 'F', action: 'acquire', floor: 3 }]), 'P', 'F');
    assert.equal(ok.scope.state, 'knows', '第一参必须是 raw trace 账（错序 ⇒ 恒 notRecorded，一个看起来正常的读数）');
    assert.equal(ok.scope.chain, 1);
    /* 另一档不能读成「他知道没有」。 */
    const un = T.getKnowledgeBoundary(S, MK([{ id: 't1', character: 'P', fact: 'F', action: 'unaware', floor: 3 }]), 'P', 'F');
    assert.equal(un.state, 'ok', 'unaware 是**明确读数**（上游 state=unknown/unaware），不是判不了');
    assert.equal(un.scope.state, 'unknown');
    assert.equal(un.scope.brokenLink, 0);
});

/* ══════════════════ C 信封恒定 / 原样引用 / 幂等 ══════════════════ */
test('v3305 C1~C3. ★★★★ 信封恒定 14 键 + data 原样引用（五出口逐条同一性）+ 幂等可序列化', () => {
    assert.equal(judgeC(T, S, UP), '', '信封判据');
    /* 五个出口的键面必须**同一套**（下游按键断言即可，不必猜哪个出口少了哪一格）。 */
    const envs = [
        T.queryEvidence(S, hostSeed(), { id: 'seed' }, qOpts()),
        T.getContinuityPack(S, projFull()),
        T.previewFactAdmission(S, { eventId: 'e1', source: 'finance-confirmed', status: 'confirmed' }, {}),
        T.explainRecall(S, exOk(), {}),
        T.getKnowledgeBoundary(S, MK([{ id: 't1', character: 'P', fact: 'F', action: 'acquire', floor: 3 }]), 'P', 'F')
    ];
    const keys = envs.map((e) => Object.keys(e).join(','));
    assert.equal(new Set(keys).size, 1, '五个出口的信封键面必须逐字相同：' + JSON.stringify([...new Set(keys)]));
    for (const e of envs) assert.equal(e.source.path, 'not-given', '五个出口都必须不给内部路径');
    /* selfCheck 四条自证必须真跑过（不是写死的 true）。 */
    const sc = T.selfCheck(S);
    assert.equal(sc.capabilities.total, 5);
    assert.equal(sc.capabilities.present, 5);
    assert.equal(sc.writeFaces, 0);
});

/* ══════════════════ D 宿主接线与跨仓登记 ══════════════════ */
test('v3305 D1~D2. ★★★★ 宿主接线逐符号在场 + 外供登记表不漂移', () => {
    const symbols = ['_memoryToolsLib', 'memoryToolsSources', '_memoryToolsAbsent',
        'memoryToolsDescribe', 'memoryToolsLine', 'queryEvidence', 'getContinuityPack',
        'previewFactAdmission', 'explainRecall', 'getKnowledgeBoundary'];
    for (const s of symbols) {
        assert.ok(IDX.includes(s), 'index.js 缺宿主接线符号：' + s);
    }
    /* 唯一装配点：五个能力名必须逐字与内核 CAPABILITIES 对齐。 */
    const at = IDX.indexOf('memoryToolsSources()');
    assert.ok(at > 0, '必须存在唯一装配点 memoryToolsSources()');
    for (const c of T.CAPABILITIES) {
        assert.ok(IDX.includes(c.name), '装配点缺能力键：' + c.name);
        assert.ok(IDX.includes(c.module.replace(/\.js$/, '')), '装配点缺模块引用：' + c.module);
    }
    /* 本面刻意不进快照：快照构造里不得出现 memoryTools*（每轮付一遍九账扫描代价的那种设计）。 */
    const snapAt = IDX.indexOf('const snap = {');
    assert.ok(snapAt > 0, '快照构造点必须在场（否则本判据扫描面失效，会恒真）');
    const snapTail = IDX.slice(snapAt, snapAt + 6000);
    assert.equal(/memoryTools/.test(snapTail), false, '工具面不得进快照（按需查询口 ≠ 每轮状态投影）');
    /* D2：跨仓外供登记表 */
    const TSV = read(path.join('tests', 'audit', 'open_face_registry.tsv'));
    const rows = TSV.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
    const mine = rows.filter((l) => l.split('\t')[3] && l.split('\t')[3].startsWith(MOD + '::'));
    assert.equal(mine.length, 1, '外供登记表必须**恰有 1 行**指向本模块，实 ' + mine.length);
    const cols = mine[0].split('\t');
    assert.equal(cols.length, 9, '登记行必须九列');
    assert.equal(cols[0], 'memoryToolsEnvelope');
    assert.equal(cols[1], 'lonsha-memory-plugin');
    assert.equal(cols[2], 'v' + PKG.version, 'producer_version 必须与当前版本同步');
    const syms = cols[3].split('::')[1].split(',');
    const names = T.CAPABILITIES.map((c) => c.name);
    for (const n of names) assert.ok(syms.indexOf(n) >= 0, '登记行缺出口符号：' + n);
    /* [v3.97.0 · 跨仓对账] 下游 ruby-phone 已接入本面（R3-X2：config/memory-qa-contract.js
     *   的 readMemoryToolsEnvelope，产品侧消费点 ≥1）。故此处由 none@0 改为**真读数**：
     *   出口名 @ 下游产品侧消费点下限。判据仍是「如实写」——只是事实变了。
     *   反向纪律：若下游撤回接入，本行必须同步退回 none@0（`upstream-face-audit` 的 R11 会以
     *   「台账里登记了不存在的分歧」转红，逼这条同步）。 */
    assert.equal(cols[5], 'readMemoryToolsEnvelope@1', 'downstream 已接入 ⇒ 如实写出口名@下限（不假装还在等）');
    for (const w of ['缺席', '旧版', '不产出', '空数据']) assert.ok(cols[6].includes(w), '失效条件缺四态词：' + w);
    assert.ok(/[|｜/]/.test(cols[8]), '缺席与空必须分形列出');
    /* 模块必须在分发面（不然「建好了但没上线」与「没建」在用户侧同形）。 */
    assert.ok(MF.extra_js.indexOf(MOD) >= 0, '模块必须在 manifest.extra_js 上');
});

/* ══════════════════ G 版本锚 ══════════════════ */
/** 版本序数（本档自锚常量形，供 V4 与 V2 各取所需 —— 不写死当前版本用于下界比较）。 */
const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
/** 本档出生版本（V4 当版锚点：锚必须住在**当版档案**里，故写在这一档、不写进历史文件）。 */
const BORN = '3.305.0';

test('v3305 G1. ★★★ 版本锚：本档出生版本 + 三源同源（V4 当版锚点形态）', () => {
    assert.equal(vnum(BORN), 3305000, 'vnum 序数必须可数（当版锚点）');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(codeVer, '入口版本常量必须在场');
    assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立；当前 ' + codeVer);
    assert.equal(MF.version, codeVer, 'manifest 与入口同源');
    assert.equal(PKG.version, codeVer, 'package.json 与入口同源');
    /* 三份模块副本也须同源（注入失败时它就是真实现 —— 副本漏抬会报出上一版号而三源全绿）。 */
    for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const mv = (/let VERSION = '([^']+)'/.exec(read(m)) || [])[1];
        assert.equal(mv, codeVer, m + ' 副本须与入口同源（须是 let：bindDeps 可换，const 会 TypeError）');
    }
    /* 当版锚点必须住在**当版档案**里（写进历史文件会被 V2 抓）。 */
    assert.ok(SELF.includes("const BORN = '3.305.0'"), '当版锚点必须显式留在本档里');
    assert.equal(SELF.includes("vnum('3.305.0')") || SELF.includes('vnum(BORN)'), true, '锚形须可被守卫计数');
});
/** 把破坏副本写到临时文件并 require 回来（真源码 → 真装载，不走 mock）。 */
function loadBroken(tag, anchor, repl) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3305-' + tag + '-'));
    const p = path.join(dir, MOD);
    const broken = breakSource(MOD_SRC, anchor, repl, tag);
    fs.writeFileSync(p, broken);
    const chk = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
    assert.equal(chk.status, 0, '破坏副本必须语法可过（否则归因不成立）：' + chk.stderr.slice(-300));
    return require_(p);
}

test('v3305 E1~E3 + F1. ★★★★★ 三条真源码破坏负控制 + 判据纯度 + fail-closed', () => {
    /* 前提：未破坏时三条判据在原件上必须为真（否则后面的「转红」可能是判据自己坏了）。 */
    assert.equal(judgeA2(T), '', '原件上导出面判据必须为真');
    assert.equal(judgeB1(T, S), '', '原件上在场判定必须为真');
    assert.equal(judgeB2(T, S), '', '原件上 queryEvidence 判据必须为真');

    /* E1：拆掉五态里的一态 ⇒ selfCheck.statesComplete 必须转 false。 */
    const b1 = loadBroken('states', ANCHORS.states, ANCHORS.statesBroken);
    assert.equal(b1.STATES.length, 4, '破坏必须真的生效（词表少一态）');
    assert.equal(b1.selfCheck(S).statesComplete, false, '拆掉一态必须让 statesComplete 转 false');
    assert.equal(b1.selfCheck(S).ok, false, '拆掉一态必须让自检整体转 false');
    assert.equal(judgeA2(b1).includes('五态词表长度'), true, '同款判据必须在破坏副本上点名它：' + judgeA2(b1));

    /* E2：摘掉缺席分流 ⇒ 缺席被报成 empty（本仓最忌的同形）。 */
    const b2 = loadBroken('absent', ANCHORS.absentBranch, ANCHORS.absentBranchBroken);
    const naive = b2.queryEvidence({}, hostSeed(), { id: 'seed' }, qOpts());
    assert.equal(naive.state, 'empty', '破坏必须真的生效（缺席被改报成空）');
    assert.equal(judgeB2(b2, S).includes('module-absent'), true, '同款判据必须点名缺席分流被摘：' + judgeB2(b2, S));
    assert.equal(judgeB2(T, S), '', '对照：原件上仍为零问题');

    /* E3：把 data 换成深拷贝 ⇒ 同一性断（但深比较仍成立 —— 这正是该破坏的隐蔽处）。 */
    const b3 = loadBroken('data', ANCHORS.dataRef, ANCHORS.dataRefBroken);
    /* 同一性用**包一层**的上游取证：直接从真模块再取一次拿到的是同一个对象，
     *   `===` 会恒真（那不是判据在守，是 require 缓存）。 */
    const seen3 = [];
    const spy3 = { query: (h, sp, op) => { const r = Q.query(h, sp, op); seen3.push(r); return r; } };
    const e3 = b3.queryEvidence({ queryEvidence: spy3 }, hostSeed(), { id: 'seed' }, qOpts());
    assert.equal(seen3.length, 1, '前提：上游必须被真调用一次（否则同一性无从取证）');
    assert.notEqual(e3.data, seen3[0], '破坏必须真的生效（原样引用被换成深拷贝）');
    assert.deepEqual(e3.data, seen3[0], '深拷贝的隐蔽处：内容仍相等，只有同一性断 —— 故判据必须判同一性');
    /* 对照：原件上同一性成立。 */
    const seen3b = [];
    const spy3b = { query: (h, sp, op) => { const r = Q.query(h, sp, op); seen3b.push(r); return r; } };
    const e3b = T.queryEvidence({ queryEvidence: spy3b }, hostSeed(), { id: 'seed' }, qOpts());
    assert.equal(e3b.data, seen3b[0], '原件上 data 必须是原样引用');
    /* 归因要能定位到具体一条：`data:` 那一行是 envelope() 里**五出口共用**的，
     *   故正确形态是「C2 同一性判据整体转红」，而不是指望别的出口不受影响（首版这一条写错）。
     *   另两条判据（出口各自的状态映射）不碰 data 行 ⇒ 必须仍绿（说明破坏是定点的）。 */
    assert.equal(judgeB3(b3, S), '', '本破坏不影响 previewFactAdmission 的状态映射');
    assert.equal(judgeB5(b3, S), '', '本破坏不影响 explainRecall 的状态映射');
    const b3p = b3.previewFactAdmission(S, { eventId: 'e1', source: 'finance-confirmed', status: 'confirmed' }, {});
    assert.equal(b3p.state, 'ok', '别的出口仍需正常出读数（破坏是定点的）');
    /* C2 同一性判据在破坏副本上必须点名（这才是该破坏对应的那条判据）。 */
    assert.ok(judgeC(b3, S, UP).indexOf('原样引用') >= 0, '同款判据必须点名同一性断：' + judgeC(b3, S, UP));
    assert.equal(judgeC(T, S, UP), '', '对照：原件上仍为零问题');

    /* F1 判据纯度：本档每个锚点字面量只声明一次（否则「锚点唯一」的检查会数到自己那一份）。 */
    for (const [k, v] of Object.entries(ANCHORS)) {
        assert.equal(SELF.split(v).length - 1, 1, '锚点 ' + k + ' 在本档里必须恰出现 1 次（纯度检查才有内容）');
    }
    /* fail-closed：缺模块 / 缺登记行都必须抛（不静默跳过）。 */
    assert.throws(() => { if (!fs.existsSync(path.join(R, MOD))) throw new Error('模块缺失未 fail-closed'); fs.accessSync(path.join(R, 'no-such-file-' + MOD)); }, /ENOENT/);
    const TSV2 = read(path.join('tests', 'audit', 'open_face_registry.tsv'));
    assert.ok(TSV2.includes('memoryToolsEnvelope'), '登记行必须真在场（缺 ⇒ 本档 D2 会抛，不静默跳过）');
});
