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
//   R2 回放入口被宿主真消费：index.js 必须调用 replayDrop 与 replayShift（声明了零调用 = 死声明）
//   R3 回放报告必须留痕：最近一次回放报告被写入宿主字段，且 selfCheck 诊断行读取它
//   R4 模块缺席必须有同形退路：取不到库时回放到内置空报告，而不是抛掉整个删楼
//   R5 幂等：同一楼连续回放两次，第二次撤掉的条数为 0（重复执行不重复扣账）
//
// 退出码：0=卫生  1=存在真缺陷  2=结构漂移（探测器失效）
// 夹具通道：LONSHA_AUDIT_FIXTURE=1 放宽下限；LONSHA_AUDIT_ROOT 指向合成仓库。
import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';
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

// 剥注释（保留换行），形态判据一律在剥注释后的文本上下结论。
function stripComments(code) {
    const out = code.split('');
    let i = 0;
    while (i < code.length) {
        const c = code[i];
        if (c === '/' && code[i + 1] === '/') { while (i < code.length && code[i] !== '\n') { out[i] = ' '; i++; } continue; }
        if (c === '/' && code[i + 1] === '*') {
            out[i] = ' '; out[i + 1] = ' '; i += 2;
            while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) { if (code[i] !== '\n') out[i] = ' '; i++; }
            if (i < code.length) { out[i] = ' '; out[i + 1] = ' '; i += 2; }
            continue;
        }
        i++;
    }
    return out.join('');
}
const idxStripped = stripComments(idx);

// ── R1 登记表结构健康 ──
const owners = Array.isArray(LR.FLOOR_OWNERS) ? LR.FLOOR_OWNERS : [];
if (owners.length < MIN_OWNERS) {
    console.error('[ledger-replay] 登记表只有 ' + owners.length + ' 项（下限 ' + MIN_OWNERS + '），抽取器或登记表已失效');
    process.exit(2);
}
const problems = LR.checkRegistry(owners);
for (const p of problems) defects.push('R1 登记表结构：' + p);

// ── R2 回放入口被宿主真消费 ──
// 必须是调用形态 replayDrop( / replayShift(，注释里提到不算。
if (!/replayDrop\s*\(/.test(idxStripped)) defects.push('R2 index.js 没有调用 replayDrop（删楼回放未被收口，登记表是死声明）');
if (!/replayShift\s*\(/.test(idxStripped)) defects.push('R2 index.js 没有调用 replayShift（楼层前移未被收口，登记表是死声明）');
if (!/_ledgerReplayLib\s*\(/.test(idxStripped)) defects.push('R2 index.js 缺少 _ledgerReplayLib 取库口（模块没有按契约接入）');

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
