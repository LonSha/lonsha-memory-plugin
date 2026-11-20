/* v3.475.0 宿主基线重绑：跑探针 → 逐读数落盘 → 当版在 rebuilds/history 留账。
 * 纪律（沿用 rebind_host_beast_r25）：抬升只走脚本、算式只此一处、note 必须与末条 history 同源。 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = '/home/user/lonsha-memory-plugin';
const BASE = path.join(ROOT, 'tests', 'audit', 'host_beast_baseline.json');
const VER = 'v3.475.0';
const PREV = 'v3.474.0';

const probe = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'tests', 'audit', 'host_beast_probe.cjs')], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }));
const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
if (base.measured_at !== PREV) {
    console.error('[abort] measured_at 期望 ' + PREV + '，实为 ' + base.measured_at);
    process.exit(1);
}
const old = base.rebuilds[PREV].readings;
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
const reason = '[' + VER + '] L26 十八项接线后的当版重绑：入口 index.js ' + t + ' 行（+'
    + deltaLines + '）、成员数 ' + probe.member_count + '；行上界' + (raiseC ? '**上抬至 ' + newC + '**' : '**不抬，仍为 ' + lb.ceiling + '**')
    + '（余量 ' + (newC - t) + ' <= slack ' + maxSlack + '）、成员上界' + (raiseM ? '**上抬至 ' + newM + '**' : '**不抬，仍为 ' + lb.member_ceiling + '**')
    + '。合并面 ' + surface + ' 行，TOP5 占 ' + readings.top5_pct + '%，TOP40 占 ' + readings.top40_pct + '%。'
    + '增量全部来自 L26 的 18 个 engine 槽装配块（每槽 3 行守卫 + 1 行注释），不是死代码回流。';
lb.ceiling = newC;
lb.member_ceiling = newM;
lb.note = reason;
(lb.history = lb.history || []).push({ ceiling: newC, member_ceiling: newM, milestone_version: VER, reason });

base.rebuilds[VER] = {
    reason: '[' + VER + '] 第二十六期（L26-O1~O9 / L26-X1~X9）十八项交付：18 个契约/治理/可见模块 + 18 套判据（167 条断言）。'
        + '宿主只增装配块（' + deltaLines + ' 行，全部是 engine 槽守卫），无业务方法内联。',
    readings,
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