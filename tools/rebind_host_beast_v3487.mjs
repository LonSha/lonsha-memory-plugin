/* v3.487.0 宿主基线重绑（从 rebind_host_beast_v3485.mjs 复制：只改 ROOT/VER/PREV/说明文案，算法一字未改）：
 * 跑探针 → 逐读数落盘 → 当版在 rebuilds/history 留账。
 * 纪律（沿用 rebind_host_beast_r25）：抬升只走脚本、算式只此一处、note 必须与末条 history 同源。 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = '/home/user/lmp-fresh';
const BASE = path.join(ROOT, 'tests', 'audit', 'host_beast_baseline.json');
const VER = 'v3.487.0';
const PREV = 'v3.485.0';

const probe = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'tests', 'audit', 'host_beast_probe.cjs')], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }));
const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
/* [同版二次重绑] 正常路径要求 measured_at === PREV（防跨版误抬）。本版在**同一次发布内**
 *   改了两处引擎文件（存档来源闸 + 后置条件验收），若发布前还要再动就得按同一 VER 重测。
 *   放行条件写死为「measured_at 恰等于 VER 且 rebuilds[VER] 已存在」—— 这是「重测当版」，
 *   不是「跳过前置校验」：跨版误抬仍会被上面那条拦下。v3.486.0 未重绑（入口零变化），故 PREV 仍是 v3.485.0。 */
const sameVersionRerun = (base.measured_at === VER) && !!(base.rebuilds && base.rebuilds[VER]);
if (base.measured_at !== PREV && !sameVersionRerun) {
    console.error('[abort] measured_at 期望 ' + PREV + '，实为 ' + base.measured_at);
    process.exit(1);
}
const old = base.rebuilds[PREV] ? base.rebuilds[PREV].readings : base.rebuilds[VER].readings;
const t = probe.entry_lines;
const surface = probe.surface_lines;
const top40 = probe.biggest_members.slice(0, 40);
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const top5 = sum(top40.slice(0, 5), (m) => m.lines);
const top40l = sum(top40, (m) => m.lines);
const cls = sum(probe.domains.filter((d) => d.domain !== '（未归类）'), (d) => d.lines);
const unc = sum(probe.domains.filter((d) => d.domain === '（未归类）'), (d) => d.lines);

const readings = {
    total_lines: t,
    surface_lines: surface,
    member_count: probe.member_count,
    duplicate_member_names: probe.duplicate_member_names.length,
    top5_lines: top5,
    top5_pct: Math.round(top5 * 1000 / surface) / 10,
    top40_lines: top40l,
    top40_pct: Math.round(top40l * 1000 / surface) / 10,
    prefix_rule_coverage_lines: cls,
    prefix_rule_coverage_pct: Math.round(cls * 1000 / surface) / 10,
    unclassified_lines: unc,
    seam_distinct_modules: probe.seam_modules.distinct_modules,
    seam_reference_sites: probe.seam_modules.reference_sites,
    seam_call_shape_sites: probe.seam_modules.call_shape_sites,
    members_over_80_lines: probe.split_candidates.total_over_threshold,
    low_coupling_members: probe.split_candidates.low_coupling_non_lifecycle,
    high_coupling_members: probe.split_candidates.high_coupling_non_lifecycle,
    entry_lines: t
};
for (const k of Object.keys(probe)) if (k in base) base[k] = probe[k];
base.readings = readings;
base.biggest_members_top40 = top40;
base.total_lines = t;
base.member_count = probe.member_count;

const lb = base.line_budget;
const maxSlack = lb.maxSlack || 400;
const mSlack = lb.member_max_slack || 30;
const raiseC = (t > lb.ceiling) || ((lb.ceiling - t) > maxSlack);
const raiseM = (probe.member_count > lb.member_ceiling) || ((lb.member_ceiling - probe.member_count) > mSlack);
const newC = raiseC ? t + maxSlack : lb.ceiling;
const newM = raiseM ? probe.member_count + mSlack : lb.member_ceiling;
const deltaLines = t - old.total_lines;
const reason = '[' + VER + '] 缝合更新版用户脚本两条写入侧纪律后的当版重绑：入口 index.js ' + t + ' 行（'
    + (deltaLines >= 0 ? '+' : '') + deltaLines + '）、成员数 ' + probe.member_count + '；行上界'
    + (raiseC ? '**上抬至 ' + newC + '**' : '**不抬，仍为 ' + lb.ceiling + '**')
    + '（余量 ' + (newC - t) + ' <= slack ' + maxSlack + '）、成员上界'
    + (raiseM ? '**上抬至 ' + newM + '**' : '**不抬，仍为 ' + lb.member_ceiling + '**')
    + '。合并面 ' + surface + ' 行，TOP5 占 ' + readings.top5_pct + '%，TOP40 占 ' + readings.top40_pct + '%。'
    + '入口零变化（只有版本串），增量全部来自引擎侧两处写入端：'
    + 'engine-persistence-ops.js 的存档来源身份闸（打戳/取戳/判定三个纯函数 + 导出末位盖戳 + 恢复侧闸门与剥戳）'
    + '与 memory-organs.js 的按 id 写入后置条件（两个方法各持一份就地计数），不是死代码回流。';
lb.ceiling = newC;
lb.member_ceiling = newM;
lb.note = reason;
(lb.history = lb.history || []).push({ ceiling: newC, member_ceiling: newM, milestone_version: VER, reason });

base.rebuilds[VER] = {
    reason: '[' + VER + '] 缝合更新版用户脚本（瑟瑟台账 V1.170 / 瑟瑟小手机 V1.308 / 色色灵感状态栏 V4.027）里'
        + '两条**写入侧**纪律（十二条候选逐条对账后只剩这两条是真缺口，其余九条本仓已存在或更强、两条不适用）：'
        + '① 存档来源身份（串档闸）—— 账本快照随当前聊天走，复制/串档要能被识别；改形为按来源五态分档，'
        + '`blocked` 只落 file-import（授权后可放行），闸门落在任何副作用之前，拒绝时带 src/dst 事实；'
        + '确立「来源戳是随存档走的事实、不是运行时状态」（导出侧末位盖戳、恢复侧主动剥戳）。'
        + '② 按 id 写入的后置条件 —— 删除后零命中、恢复后恰好一份；顺带修掉 `deleteMemory` 只清 core 那份、'
        + 'recent 同 id 副本残留的真缺陷（调用方拿 true 回查却还在，且与同文件 purgeTombstone 语义相反）。'
        + '引擎侧 +' + (surface - old.surface_lines) + ' 行，宿主零业务内联。',
    readings,
    /* 判据 v3232 F1 要求重建记录**四件齐备**（reason/readings/unchanged/not_done）。 */
    unchanged: [
        '正常路径行为不变：同档恢复照旧（`same` 直接过）、无戳旧档照旧（`absent` 只标不拦）、取不到当前身份时如实说没比对（`unknown-dest`）',
        '未新增任何存储键：来源戳写在存档 extensions 里随存档走，不吸进 chatMetadata / extensionSettings 的持久命名空间',
        '导出面契约零变更：三份存档类型（full / ledger / vault）字段集不变，只在 extensions 里多一个戳',
        '本版只量不拆：未拆任何宿主巨兽成员（restoreFromPayload 的 +21 行是闸门与剥戳，不是内联业务）'
    ],
    not_done: '本版交付两个写入侧闸门 + 11 条判据 + 两条诊断行（住装配面并登记 core_functions）+ 面板一条授权重试通路；'
        + '未拆宿主巨兽成员；台账的「快照文件与聊天身份不一致即直接拒」按本仓语境改形（复制对话是正当用法），'
        + '故 `blocked` 只落 file-import，其余入口走 `adopted` 放行并等下次导出重新打戳 —— 这是刻意的取舍；'
        + '全量实跑尚余既有红未清（与 HEAD 干净快照同红同名，属存量欠账）',
    delta_from: PREV,
    delta: {
        total_lines: deltaLines,
        surface_lines: surface - old.surface_lines,
        member_count: probe.member_count - old.member_count,
        top40_lines: top40l - old.top40_lines,
        top5_pct: Math.round((readings.top5_pct - old.top5_pct) * 10) / 10,
        top40_pct: Math.round((readings.top40_pct - old.top40_pct) * 10) / 10
    }
};
base.measured_at = VER;

if (readings.top40_pct !== Math.round(top40l * 1000 / surface) / 10) throw new Error('占比不可复算');
if (lb.note !== lb.history[lb.history.length - 1].reason) throw new Error('note 不同源');
fs.writeFileSync(BASE, JSON.stringify(base, null, 2) + '\n');
console.log('rebind ' + VER + ': entry=' + t + ' surface=' + surface + ' members=' + probe.member_count + ' top40=' + top40l + ' (' + readings.top40_pct + '%)');
console.log('ceiling ' + (raiseC ? 'raised' : 'kept') + ' → ' + newC + ', member ' + (raiseM ? 'raised' : 'kept') + ' → ' + newM);
console.log('delta total ' + deltaLines + ' surface ' + (surface - old.surface_lines) + ' members ' + (probe.member_count - old.member_count));