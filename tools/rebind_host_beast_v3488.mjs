/* v3.488.0 宿主基线重绑（照 rebind_host_beast_v3487.mjs 的算法逐行搬，只改 VER/PREV 与说明文案）：
 *   跑探针 → 逐读数落盘 → 当版在 rebuilds/history 留账。
 *   纪律（沿用 r25 起）：抬升只走脚本、算式只此一处、note 必须与末条 history 同源。 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = '/home/user/lmp-fresh';
const BASE = path.join(ROOT, 'tests', 'audit', 'host_beast_baseline.json');
const VER = 'v3.488.0';
const PREV = 'v3.487.0';

const probe = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'tests', 'audit', 'host_beast_probe.cjs')], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }));
const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
/* 同版二次重绑的放行条件写死为「measured_at 恰等于 VER 且 rebuilds[VER] 已存在」——
 *   跨版误抬仍会被下面那条拦下。 */
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
const reason = '[' + VER + '] 缝合「光域·镜忆」五条增量后的当版重绑：入口 index.js ' + t + ' 行（'
    + (deltaLines >= 0 ? '+' : '') + deltaLines + '）、成员数 ' + probe.member_count + '；行上界'
    + (raiseC ? '**上抬至 ' + newC + '**' : '**不抬，仍为 ' + lb.ceiling + '**')
    + '（余量 ' + (newC - t) + ' <= slack ' + maxSlack + '）、成员上界'
    + (raiseM ? '**上抬至 ' + newM + '**' : '**不抬，仍为 ' + lb.member_ceiling + '**')
    + '。合并面 ' + surface + ' 行，TOP5 占 ' + readings.top5_pct + '%，TOP40 占 ' + readings.top40_pct + '%。'
    + '入口增量全部是**接线**（四个库口 + 四处 bindDeps 注入 + 四个只读读数方法），没有一行业务内联：'
    + '判定与算法都住在新模块（failure-class-cooldown / recall-final-score / frozen-archive-blocks / '
    + 'vector-backend-ladder）；另把 fetchWithTimeoutRetry 的失败分档冷却三段同时补进宿主副本，'
    + '与 memory-organs.js 的副本保持逐字同源（v3264 A 当场抓过漂移）。';
lb.ceiling = newC;
lb.member_ceiling = newM;
lb.note = reason;
(lb.history = lb.history || []).push({ ceiling: newC, member_ceiling: newM, milestone_version: VER, reason });

base.rebuilds[VER] = {
    reason: '[' + VER + '] 缝合「光域·镜忆」五条增量：五条里两条（grain 双粒度 / 90-10 前缀分段）'
        + 'v3.484.0 已缝过，真缺口三条 + 一条改形 —— ① 失败分档冷却（修前 fetchWithTimeoutRetry 只在 401/403 落表，'
        + '超时与传输异常重试耗尽后一字节不记，用户每条记忆都要把 30s×3 走满且每次降级在读数上同形）；'
        + '② 终分合成（base × 时间 × 重要性 × 邻楼，只装配因子不定义衰减，时间口径楼层优先于天）；'
        + '③ 冻结档按楼层分块（绝对楼层桶号，窗口推进不重算 blockId、rewrites 才有分辨力）；'
        + '⑤ 五档向量后端降级链改形为「只判定与读数，不探活不发请求」，宿主没有的两档如实报缺席而不是写进 order 谎报优先级。'
        + '自己抓到六处缺陷（冻结分块静默丢内容 / importance:1 口径重叠点把最不重要的判成最高加成 / 时间基数误用天 / '
        + '冻结桶号相对化 / composed 用间接证据判定导致空转被冒充成生效 / order 空数组静默回落）。引擎侧 +'
        + (surface - old.surface_lines) + ' 行，宿主零业务内联。',
    readings,
    /* 判据 v3232 F1 要求重建记录**四件齐备**（reason/readings/unchanged/not_done）。 */
    unchanged: [
        '其余 23 处 fetchWithTimeoutRetry 调用方零影响：失败分档冷却只在调用方显式传 `opts.failureLedger`（Map）时启用，不传与修前逐字一致',
        '未新增任何配置键：四个新模块的阈值全部是入参（缺省取 DEFAULTS），面板不读新键、宿主不注入新开关',
        '真嵌入优先的语义不动：观测不到真向量时照旧落到本地 ngram，再落到 legacy，只是现在这条链在面板上有形状',
        '本版只量不拆：未拆任何宿主巨兽成员（入口 +' + deltaLines + ' 行全是库口 / 注入 / 只读读数方法）'
    ],
    not_done: '本版交付四个纯函数模块 + 三处真路径接线（engine-recall 终分 / memory-organs 冷却 / 诊断行）+ 34 条判据；'
        + '未实现 st_local 与 browser_onnx 两档（本宿主没有对应运行时，如实报缺席而不是假装有）；'
        + '未做探活（探针结果由调用方给，模块只判定与回预算）；未拆宿主巨兽成员。',
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