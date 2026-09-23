// 审计基建（v3.183）：分支一致性面扫描（三模块存活 / 宿主真消费 / 召回过滤落地 / 两处纪律）
// ------------------------------------------------------------
// 为什么存在：
//   v3.183 缝入三个模块（summary-provenance / branch-guard / crosslink），它们最容易出的
//   不是「函数写错」而是**声明了却没接**：模块写得很完整，宿主一行没调用，
//   于是翻页照样污摘要、旧分支照样进注入，而所有单元测试仍然全绿
//   （单元测试只验模块自己，验不了「宿主到底用没用」）。
//   本扫描守的正是这条缝：模块必须在，而且必须被宿主真消费。
//
// 判定：
//   R1 三模块存活：可 require、版本常量与导出函数齐全、行数不低于下限（防被截断成空壳）
//   R2 宿主真消费：manifest 登记 + _moduleLib 取库表达式 + 六个关键调用点逐个在场
//   R3 召回过滤接进主路径：filterForRecall 真被调、结果真回写 results.summary
//   R4 过滤纪律：默认剔除集合恰为 [source_changed]，且行为上**不剔**缺源与旧档
//   R5 守卫纪律：判不了就放行（无签名 accept=true/judged=false；签名不符 accept=false/judged=true）
//   R6 隐形态有归因：三个诊断读数入口在场，**且真被 selfCheck 消费**——
//       诊断行要真进 selfCheck 的子系统列表（本仓 v3150/v3166/v3167 的现行约定）。
//       只验函数名在场是不合格的：本仓 v3.0~v3.11 的主线缺陷正是「写好了入口、零调用点」，
//       单元测试全绿而用户什么也读不到。
//
// 退出码：0=卫生  1=存在真缺陷  2=结构漂移（探测器失效）
// 夹具通道：LONSHA_AUDIT_ROOT 指向合成仓库（负控制用）。
import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';
import { stripComments } from '../_audit_lib.mjs';
const require = createRequire(import.meta.url);
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();

const FILES = {
    sp: 'summary-provenance.js',
    bg: 'branch-guard.js',
    xl: 'crosslink.js',
    idx: 'index.js',
};
for (const k of ['sp', 'bg', 'xl', 'idx']) {
    if (!fs.existsSync(path.join(ROOT, FILES[k]))) {
        console.error('[branch-consistency] 缺少 ' + FILES[k] + '（' + ROOT + '）');
        process.exit(2);
    }
}
const idx = fs.readFileSync(path.join(ROOT, FILES.idx), 'utf8');
// 形态判据一律在剥注释后的文本上下结论（注释里写「已过滤」不算过滤）。
const idxCode = stripComments(idx);
if (idx.length < 500000) {
    console.error('[branch-consistency] index.js 退化（' + idx.length + ' 字节），审计需同步结构变化');
    process.exit(2);
}
const defects = [];

// ── R1 三模块存活 ──
let SP, BG, XL;
try { SP = require(path.join(ROOT, FILES.sp)); } catch (e) { console.error('[branch-consistency] summary-provenance 加载失败：' + e.message); process.exit(2); }
try { BG = require(path.join(ROOT, FILES.bg)); } catch (e) { console.error('[branch-consistency] branch-guard 加载失败：' + e.message); process.exit(2); }
try { XL = require(path.join(ROOT, FILES.xl)); } catch (e) { console.error('[branch-consistency] crosslink 加载失败：' + e.message); process.exit(2); }
const need = [
    ['summary-provenance', SP, ['capture', 'verify', 'filterForRecall', 'audit', 'verifiedOnly', 'line'], 'PROV_VERSION'],
    ['branch-guard', BG, ['createGuard', 'signatureOf', 'hash32', 'floorOf'], 'BRANCH_GUARD_VERSION'],
    ['crosslink', XL, ['createIndex', 'buildAutomaton', 'scanText', 'fingerprintOf'], 'CROSSLINK_VERSION'],
];
for (const [name, mod, fns, verKey] of need) {
    for (const fn of fns) if (typeof mod[fn] !== 'function') defects.push('R1 ' + name + ' 缺导出函数 ' + fn);
    if (!Number.isFinite(Number(mod[verKey]))) defects.push('R1 ' + name + ' 缺版本常量 ' + verKey);
}
// 行数下限：防模块被截断成空壳仍然「导出齐全」。
const MIN_LINES = 150;
for (const k of ['sp', 'bg', 'xl']) {
    const n = fs.readFileSync(path.join(ROOT, FILES[k]), 'utf8').split('\n').length;
    if (n < MIN_LINES) defects.push('R1 ' + FILES[k] + ' 只有 ' + n + ' 行（下限 ' + MIN_LINES + '），疑似截断');
}

// ── R2 宿主真消费 ──
// manifest 登记（未登记则 _moduleLib 永远拿不到，模块等于不存在）
try {
    const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    const ex = Array.isArray(mf.extra_js) ? mf.extra_js : [];
    for (const k of ['sp', 'bg', 'xl']) {
        if (!ex.includes(FILES[k])) defects.push('R2 manifest.extra_js 未登记 ' + FILES[k] + '（取库必返回 module-unavailable）');
    }
} catch (e) { defects.push('R2 manifest.json 读取失败：' + e.message); }
// 取库表达式（真读 window.LonShaXxx，而不是构造期缓存一个可能为空的句柄）
const libs = [
    ['summary-provenance', /_moduleLib\(\(\) => window\.LonShaSummaryProvenance,\s*'summary-provenance\.js'\)/],
    ['branch-guard', /_moduleLib\(\(\) => window\.LonShaBranchGuard,\s*'branch-guard\.js'\)/],
    ['crosslink', /_moduleLib\(\(\) => window\.LonShaCrosslink,\s*'crosslink\.js'\)/],
];
for (const [name, re] of libs) if (!re.test(idxCode)) defects.push('R2 宿主未按契约取库：' + name);
// 六个关键调用点：少一个就有一条能力「只声明不生效」
const calls = [
    ['落笔留证 capture', /PV\.capture\(/],
    ['召回过滤 filterForRecall', /PV\.filterForRecall\(/],
    ['落笔守卫 guardApply', /\.guardApply\(/],
    ['落笔成功记签名', /setProcessedSignature\(/],
    ['翻页标记 prepareSwipe', /prepareSwipe\(/],
    ['关联索引 createIndex', /XL\.createIndex\(/],
];
for (const [name, re] of calls) if (!re.test(idxCode)) defects.push('R2 宿主未调用：' + name);

// ── R3 召回过滤接进主路径 ──
// 这是本版的可观测落点：过滤必须在**召回主路径**上真生效，而不是提供个没人用的便捷函数。
if (!/results\.summary\s*=\s*r\.kept/.test(idxCode)) {
    defects.push('R3 过滤结果没有回写 results.summary（过滤了但注入的还是原样）');
}

// ── R4 过滤纪律（行为判据，不看文本看行为） ──
{
    const drop = Array.isArray(SP.RECALL_DROP_STATUS) ? SP.RECALL_DROP_STATUS : null;
    if (!drop || drop.length !== 1 || drop[0] !== 'source_changed') {
        defects.push('R4 默认剔除集合必须恰为 [source_changed]，实为 ' + JSON.stringify(drop));
    }
    // 造真来源记录：用模块自己的 capture 写，再改 chat 触发各态。
    const m0 = { index: 0, swipe_id: 0, mes: '第零楼正文', send_date: 't1', is_user: false, extra: {} };
    const m1 = { index: 1, swipe_id: 0, mes: '第一楼正文', send_date: 't1', is_user: false, extra: {} };
    const chatBase = [m0, m1];
    const sOk = { floor: 0, text: '摘要0' }; SP.capture(sOk, m0);
    const sChanged = { floor: 1, text: '摘要1' }; SP.capture(sChanged, m1);
    const legacy = { floor: 0, text: '升级前的旧档摘要' };
    const chatFlipped = [m0, { ...m1, swipe_id: 1, mes: '第一楼另一次生成' }];
    const chatMissing = [m0, undefined];

    const rFlip = SP.filterForRecall([sChanged], chatFlipped);
    if (rFlip.counts.dropped !== 1 || rFlip.kept.length !== 0) {
        defects.push('R4 来源页被翻掉的摘要没有被剔（dropped=' + rFlip.counts.dropped + '，这正是要防的旧分支注入）');
    }
    const rMiss = SP.filterForRecall([sChanged], chatMissing);
    if (rMiss.counts.dropped !== 0 || rMiss.kept.length !== 1) {
        defects.push('R4 缺源摘要被剔了（删楼与楼层前移不可区分，剔了就是真丢记忆）');
    }
    const rLegacy = SP.filterForRecall([legacy], chatFlipped);
    if (rLegacy.counts.dropped !== 0 || rLegacy.kept.length !== 1) {
        defects.push('R4 旧档（无来源记录）被剔了（升级即清空存量）');
    }
    const rOk = SP.filterForRecall([sOk], chatBase);
    if (rOk.counts.dropped !== 0 || rOk.counts.ok !== 1) {
        defects.push('R4 来源有效的摘要被误伤（ok=' + rOk.counts.ok + '）');
    }
}

// ── R5 守卫纪律（行为判据） ──
{
    const g = BG.createGuard();
    const m = { index: 3, swipe_id: 0, mes: '某楼正文', send_date: 't1', is_user: false, extra: {} };
    // 判不了就放行：无期望签名（首次提取/旧对话/刚接入）必须 accept 且 judged=false
    const noSig = g.guardApply(m, '', 's1');
    if (noSig.accept !== true || noSig.judged !== false) {
        defects.push('R5 「判不了」没有放行（accept=' + noSig.accept + ', judged=' + noSig.judged + '）——一律拦等于把记忆功能关掉');
    }
    // 判得了且不符：必须拦，且标明判过
    const g2 = BG.createGuard();
    const wrong = g2.guardApply(m, 'totally-different-signature', 's1');
    if (wrong.accept !== false || wrong.judged !== true) {
        defects.push('R5 签名不符没有拦住（accept=' + wrong.accept + ', judged=' + wrong.judged + '）');
    }
}

// ── R6 隐形态有归因 ──
// 只验「函数名在场」是不够的：本仓的现行约定是**修完的缺陷必须能被看见**——
//   诊断行要真进 selfCheck 的子系统列表（v3150 / v3166 / v3167 都有硬断言），
//   否则「有入口」和「用户读得到」是两件事：写了入口但零调用点，等于坏了没人知道。
for (const [name, re] of [
    ['摘要来源读数', /_summaryProvenanceLine/],
    ['分支守护读数', /_branchGuardLine/],
    ['条目关联读数', /_crosslinkLine/],
]) if (!re.test(idxCode)) defects.push('R6 缺诊断入口：' + name + '（拦了/过滤了却念不出来）');
// 召回过滤的读数必须把「放行」也报出来，否则「过滤掉 N 条」与「什么都没判」同形。
if (!/_provRecallFilter/.test(idxCode)) defects.push('R6 召回过滤无读数落点（_provRecallFilter）');

// 入口必须**真被 selfCheck 消费**：零调用点的入口是隐形态失效（本仓 v3.0~v3.11 的主线缺陷）。
{
    const scStart = idxCode.indexOf('async selfCheck() {');
    if (scStart < 0) {
        defects.push('R6 找不到 selfCheck（结构漂移，审计需同步）');
    } else {
        let d = 0, scEnd = -1;
        for (let i = idxCode.indexOf('{', scStart); i >= 0 && i < idxCode.length; i++) {
            if (idxCode[i] === '{') d++;
            else if (idxCode[i] === '}') { d--; if (d === 0) { scEnd = i; break; } }
        }
        if (scEnd < 0) {
            defects.push('R6 selfCheck 方法体不闭合（结构漂移）');
        } else {
            const scBody = idxCode.slice(scStart, scEnd);
            // 定位 rows 列表字面量（子系统诊断行的唯一注入面）
            const rowsIdx = scBody.indexOf('const rows = [');
            let lit = '';
            if (rowsIdx < 0) {
                defects.push('R6 selfCheck 未构建子系统列表 rows');
            } else {
                const lb = scBody.indexOf('[', rowsIdx);
                let bd = 0, rb = -1;
                for (let i = lb; i < scBody.length; i++) {
                    if (scBody[i] === '[') bd++;
                    else if (scBody[i] === ']') { bd--; if (bd === 0) { rb = i; break; } }
                }
                if (rb < 0) defects.push('R6 selfCheck 的 rows 列表字面量不闭合');
                else lit = scBody.slice(lb, rb + 1);
            }
            const rowsKeys = [];
            for (const m of lit.matchAll(/\['([^']+)',/g)) rowsKeys.push(m[1]);
            for (const m of scBody.matchAll(/rows\.push\(\[\s*'([^']+)'/g)) rowsKeys.push(m[1]);
            for (const [key, entryFn] of [
                ['摘要来源', '_summaryProvenanceLine'],
                ['分支守护', '_branchGuardLine'],
                ['条目关联', '_crosslinkLine'],
            ]) {
                if (!rowsKeys.includes(key)) {
                    defects.push('R6 诊断行「' + key + '」未进入 selfCheck 子系统列表（用户读不到 = 坏了没人知道）');
                }
                // 真调用点：selfCheck 体内必须出现 this._xxxLine(
                if (!scBody.includes('this.' + entryFn + '(')) {
                    defects.push('R6 ' + entryFn + ' 在 selfCheck 内无调用点（只有定义、没人念）');
                }
            }
        }
    }
}

if (defects.length) {
    console.error('[branch-consistency] ' + defects.length + ' 个缺陷:');
    for (const d of defects) console.error('  - ' + d);
    process.exit(1);
}
console.log('[branch-consistency] 卫生：三模块存活 + 宿主六点真消费 + 召回过滤落地 + 过滤/守卫两条纪律成立');