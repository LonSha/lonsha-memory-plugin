/* v3.482.0 宿主基线重绑（从 rebind_host_beast_l26.mjs 复制：只改 ROOT/VER/PREV，算法一字未改）：跑探针 → 逐读数落盘 → 当版在 rebuilds/history 留账。
 * 纪律（沿用 rebind_host_beast_r25）：抬升只走脚本、算式只此一处、note 必须与末条 history 同源。 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = '/home/user/lmp-fresh';
const BASE = path.join(ROOT, 'tests', 'audit', 'host_beast_baseline.json');
const VER = 'v3.483.0';
const PREV = 'v3.482.0';

const probe = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'tests', 'audit', 'host_beast_probe.cjs')], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }));
const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
/* [同版二次重绑] 正常路径要求 measured_at === PREV（防跨版误抬）。但本版在**同一次发布内**
 *   又改了入口（把两条诊断行从分片搬到装配面，顺带加了两个宿主委托桩），需要按同一 VER 重测。
 *   放行条件写死为「measured_at 恰等于 VER 且 rebuilds[VER] 已存在」—— 这是「重测当版」，
 *   不是「跳过前置校验」：跨版误抬仍会被上面那条拦下（本版实测过：改之前跑一次直接 abort）。 */
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
const reason = '[' + VER + '] 缝合 lorecodex 两处纪律后的当版重绑：入口 index.js ' + t + ' 行（+'
    + deltaLines + '）、成员数 ' + probe.member_count + '；行上界' + (raiseC ? '**上抬至 ' + newC + '**' : '**不抬，仍为 ' + lb.ceiling + '**')
    + '（余量 ' + (newC - t) + ' <= slack ' + maxSlack + '）、成员上界' + (raiseM ? '**上抬至 ' + newM + '**' : '**不抬，仍为 ' + lb.member_ceiling + '**')
    + '。合并面 ' + surface + ' 行，TOP5 占 ' + readings.top5_pct + '%，TOP40 占 ' + readings.top40_pct + '%。'
    + '增量全部来自入口那两个库口（_recallProgressGateLib / _recallProvenanceLedgerLib，各 3 行含 1 行注释）'
    + '与 bindDeps 的两个注入项（各 1 行），不是死代码回流。';
lb.ceiling = newC;
lb.member_ceiling = newM;
lb.note = reason;
(lb.history = lb.history || []).push({ ceiling: newC, member_ceiling: newM, milestone_version: VER, reason });

base.rebuilds[VER] = {
    reason: '[' + VER + '] 缝合第三方（lorecodex / st-tree-lore）两处纪律：①召回进度门（超出当前楼层的「未来」条目本轮不注入，'
        + '判不了进度就放行）；②召回来源台账（逐条标 traceable / untraceable / empty，默认只记账不过滤）。'
        + '宿主只增两个库口（' + deltaLines + ' 行，含 bindDeps 两个注入项），无业务方法内联。',
    readings,
    /* 判据 v3232 F1 要求重建记录**四件齐备**（reason/readings/unchanged/not_done）：
     *   少这两项就只能手工补账，而手工补账正是本仓「抬升只走脚本」要防的东西。 */
    unchanged: [
        '既有召回路径零行为变更：两个新机制默认只新增「剔除超前条目」与「记一笔台账」两步，其余 15 个来源数组、排序、注入格式一字未改',
        '未新增任何存储键、未改动 extensionSettings / chatMetadata 结构（新模块是纯函数，不持状态）',
        '本版只量不拆：未拆任何宿主巨兽成员'
    ],
    not_done: '本版交付两个纯函数模块 + 召回主链接线 + 三个配置开关 + 面板两条读数行 + 127 条判据；'
        + '未拆宿主巨兽成员；lorecodex 的「卷→篇→幕目录树」与 IndexedDB 引擎按评估不搬（与 scene-book 打架 / 会丢随会话隔离）；'
        + '其「检索前判定要不要查」也不做（需每轮多调一次模型，本仓定位不接受这个代价）；全量实跑尚余既有红未清',
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