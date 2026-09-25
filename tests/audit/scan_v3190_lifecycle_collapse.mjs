// 审计基建（v3.190）：声明式生命周期收口扫描
// ------------------------------------------------------------
// 为什么存在：
//   v3.182 建了登记表 FLOOR_OWNERS 并把回放接到删楼/前移两条路径上，但 index.js 里的
//   两份手工清单**一条都没删**。后果不是「重复」这么轻：shiftFloorsFrom 先执行手抄位移，
//   函数尾再执行登记表回放，同一批楼层号被减两次——删掉第 15 楼后原本的第 16 楼会变成
//   第 14 楼，且不报错、不告警，读数只会安静地指向错楼层。
//   ledger-replay.js 自己的注释还在说「此前由 index.js 里两段手工清单承担」，即意图是收口，
//   落地的只有追加。v3.190 把位移收成「恰好一次」。本扫描守住这条边界。
//
// 判定：
//   P1 位移只发生一次：shiftFloorsFrom 体内不得再出现手抄位移形态（dec( / x.floor = / x.floor--）
//   P2 门控不得旁路回放：rollbackFloor 体内 replayDrop 必须存在，且不得出现在任何 return 之后
//   P3 四面归队：changeset / archived / inject-cursor / volumes 必须在登记表内且带 shift
//   P4 留痕点位（报告用）：_lastReplayReport 赋值点数不得低于 3（初始化 / 删楼 / 前移）
//
// 与 scan_v3182_ledger_replay.mjs 的分工：后者守登记表结构、幂等、分态；本扫描守
//   「调用是否真的可达」——v3.182 的缺陷能存活至今，正因为 R2 只问「有没有调用形态」，
//   而无法发现那段调用躺在某个早退分支之后。
//
// 退出码：0=卫生  1=存在真缺陷  2=结构漂移（探测器失效）
// 夹具通道：LONSHA_AUDIT_FIXTURE=1（放宽下限）/ LONSHA_AUDIT_ROOT（合成仓库）
import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';
import { stripComments } from '../_audit_lib.mjs';
import { bodyOf } from '../_audit_lib.mjs';
const require = createRequire(import.meta.url);
const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const lrPath = path.join(ROOT, 'ledger-replay.js');
const idxPath = path.join(ROOT, 'index.js');
if (!fs.existsSync(lrPath) || !fs.existsSync(idxPath)) {
    console.error('[lifecycle-collapse] 找不到 ledger-replay.js 或 index.js（' + ROOT + '）');
    process.exit(2);
}
const idx = fs.readFileSync(idxPath, 'utf8');
const MIN_BYTES = FIXTURE_MODE ? 1 : 100000;
if (idx.length < MIN_BYTES) {
    console.error('[lifecycle-collapse] index.js 退化（' + idx.length + ' 字节），审计需同步结构变化');
    process.exit(2);
}
let LR;
try { LR = require(lrPath); }
catch (e) { console.error('[lifecycle-collapse] 模块加载失败：' + e.message); process.exit(2); }
const MIN_OWNERS = FIXTURE_MODE ? 1 : 20;
const owners = Array.isArray(LR.FLOOR_OWNERS) ? LR.FLOOR_OWNERS : [];
if (owners.length < MIN_OWNERS) {
    console.error('[lifecycle-collapse] 登记表只有 ' + owners.length + ' 项（下限 ' + MIN_OWNERS + '），探测器已失效');
    process.exit(2);
}
const defects = [];
// 剥注释（保留换行），形态判据一律在剥注释后的文本上下结论。
const idxStripped = stripComments(idx);
// 取方法体：从 marker 后的第一个 { 起做花括号配对。
// [v3.191] bodyOf 已收敛到唯一真源 tests/_audit_lib.mjs（两份旧签名合一，语义等价）

// ── P1 位移只发生一次 ──
const shiftBody = bodyOf(idxStripped, 'shiftFloorsFrom(deleted) {');
if (!shiftBody) {
    console.error('[lifecycle-collapse] 找不到 shiftFloorsFrom(deleted) 方法体（结构漂移）');
    process.exit(2);
}
if (/\bdec\s*\(/.test(shiftBody)) {
    defects.push('P1 shiftFloorsFrom 体内仍有手抄位移 helper（dec(）——与登记表回放叠加即双重位移');
}
if (/[\w\].)]\.floor\s*=[^=]/.test(shiftBody)) {
    defects.push('P1 shiftFloorsFrom 体内仍有手抄 .floor = 位移语句——与登记表回放叠加即双重位移');
}
if (/\.floor--/.test(shiftBody)) {
    defects.push('P1 shiftFloorsFrom 体内仍有手抄 .floor-- 位移语句——与登记表回放叠加即双重位移');
}
if (!/replayShift\s*\(/.test(shiftBody)) {
    defects.push('P1 shiftFloorsFrom 体内没有 replayShift 调用（位移失去了唯一真源）');
}
// ── P2 门控不得旁路回放 ──
const rbBody = bodyOf(idxStripped, 'rollbackFloor(floor) {');
if (!rbBody) {
    console.error('[lifecycle-collapse] 找不到 rollbackFloor(floor) 方法体（结构漂移）');
    process.exit(2);
}
if (!/replayDrop\s*\(/.test(rbBody)) {
    defects.push('P2 rollbackFloor 体内没有 replayDrop 调用（删楼回放未被收口）');
} else {
    // 「账本记录缺失」（该楼从未提取 / 记录已被上限淘汰）是真正的旁路点：
    //   它 return 0 时不撤任何东西，若回放排在它之后，登记表恰在最需要它的路径上成为死声明。
    //   而「关掉账本就不回滚」是设计意图，不算旁路。故断言：回放必须早于该早退点。
    const getIdx = rbBody.indexOf('this.ledger.get(floor)');
    if (getIdx < 0) {
        console.error('[lifecycle-collapse] rollbackFloor 体内找不到 this.ledger.get(floor)（结构漂移）');
        process.exit(2);
    }
    const rpIdx = rbBody.search(/replayDrop\s*\(/);
    if (rpIdx > getIdx) {
        defects.push('P2 rollbackFloor 的回放调用排在「账本记录缺失」早退点之后——该分支下登记表沦为死声明（回放报告仍会说「走完了」）');
    }
    // 关掉账本的一态必须留痕，否则「关掉了」与「跑了没账可撤」同形。
    if (!/skipped\s*:/.test(rbBody)) {
        defects.push('P2 rollbackFloor 关闭账本的一态没有留痕（skipped 分态缺失，诊断面会以为回滚执行过）');
    }
}
// ── P3 四面归队 ──
const ids = owners.map(o => o.id);
const REQUIRED = ['changeset', 'archived', 'inject-cursor', 'volumes'];
for (const id of REQUIRED) {
    const o = owners.find(x => x.id === id);
    if (!o) defects.push('P3 登记表缺少「' + id + '」面（有楼层归属却不在表内 = 回放报告说的「走完了」不算数）');
    else if (typeof o.shift !== 'function') defects.push('P3 登记项「' + id + '」的 shift 不是函数（该面在删楼前移时不会跟随）');
}
// [v3.222.0] R3-E：**白名单撤销**。此前此处把 stm-ltm 列为「无单点位移语义」的正当例外 ——
//   实测（探针）该理由不成立：它的 `unconsolidated_stm[].floor` 就是单点楼层号，
//   `stm_entries[].floors` 与 `ltm_entries[].span` 同样是楼层引用，删楼侧早已级联清理，
//   前移侧却写死 null，且宿主 index.js 的 SHIFT_FACE_LABELS 声称它会前移（自述冲突）。
//   现在它真参与前移，例外一并撤销：**不应有任何一个面拒绝前移**。
for (const o of owners) {
    if (o.shift === null) {
        defects.push('P3 登记项「' + o.id + '」不参与前移（有楼层归属的面必须能跟随前移）');
    }
}
// ── P1b 行为判据：位移恰好一次（直接对真模块跑） ──
//   v3.182 的双重位移在这里会显形：一旦手工清单复活，或登记表被同一次调用内重复消费，
//   6 楼会被减两次变成 4。判据盯的是「差值」而不是「调用次数」，因为调用次数骗得过人。
{
    const host = {
        summary: { summaries: [{ floor: 3 }, { floor: 6 }], volumes: [{ floorStart: 1, floorEnd: 9 }] },
        moneyLedger: { moneyLog: [{ floor: 6 }] },
        pairMem: { pairs: [{ entries: [{ floor: 5 }, { floor: 2 }] }] }
    };
    const r1 = LR.replayShift(host, 4);
    const got = host.summary.summaries[1].floor;
    if (got !== 5) {
        defects.push('P1b 位移不是恰好一次：6 楼前移后变成 ' + got + '（应为 5；变 4 即双重位移）');
    }
    const gotMoney = host.moneyLedger.moneyLog[0].floor;
    if (gotMoney !== 5) {
        defects.push('P1b 位移不是恰好一次：钱财 6 楼前移后变成 ' + gotMoney + '（应为 5；变 4 即双重位移）');
    }
    if (host.summary.summaries[0].floor !== 3) {
        defects.push('P1b 位移越界：3 楼（<= 被删楼）不应变动，实得 ' + host.summary.summaries[0].floor);
    }
    if (host.pairMem.pairs[0].entries[0].floor !== 4 || host.pairMem.pairs[0].entries[1].floor !== 2) {
        defects.push('P1b 群像面位移失准（entries 应各自按 > deleted 判据前移，实得 ' +
            host.pairMem.pairs[0].entries[0].floor + '/' + host.pairMem.pairs[0].entries[1].floor + '）');
    }
    if (host.summary.volumes[0].floorEnd !== 8) {
        defects.push('P1b 卷范围收尾未跟随前移（应为 8，实得 ' + host.summary.volumes[0].floorEnd + '）');
    }
    if (r1.threw !== 0) defects.push('P1b 位移回放出现 threw（' + r1.threw + '），回放引擎自身不稳');
    // 注：前移是「平移」，同一楼重复前移会再平移一次——这是语义而非缺陷，故此处不断言 shift 幂等；
    //   幂等契约只在 drop 侧成立（由 scan_v3182_ledger_replay.mjs R5 守）。
}
// ── P4 留痕点位（报告用，不断言具体数字） ──
const traceHits = (idxStripped.match(/_lastReplayReport\s*=/g) || []).length;
if (traceHits < 3) {
    defects.push('P4 回放留痕点位只有 ' + traceHits + ' 处（初始化 / 删楼 / 前移至少 3 处）——回放发生了却没人看得见');
}
if (defects.length) {
    console.error('[lifecycle-collapse] ' + defects.length + ' 个缺陷:');
    for (const d of defects) console.error('  - ' + d);
    process.exit(1);
}
console.log('[lifecycle-collapse] 卫生：位移恰好一次（' + owners.length + ' 本账走登记表）、门控不旁路、四面归队、留痕 ' + traceHits + ' 处');
process.exit(0);
