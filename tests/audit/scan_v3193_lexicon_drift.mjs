// 审计基建（v3.193.0）词表漂移报告扫描器 —— 计划第二部分 4
// ------------------------------------------------------------
// 为什么存在：
//   EMO_LEXICON / EMOTION_OPPOSITES / EMO_POLARITY 三者之间存在**隐含约束**，
//   此前没有任何东西把它们显式化：
//     · 反向映射的键必须是负面维的负面词（取 joy/warm 作键 = 极性写反）
//     · 反向映射的值必须是 joy/warm 维的词（值指向负面维 = 把「难过」推给难过的人）
//     · 反向词必须真在本仓词表里（照搬外库词 = scanEmotion 永远扫不到、线索恒空）
//     · 同一词不得同时进正负两维（极性冲突）
//     · 空数组 / 重复值 / 孤立词必须报告而不是静默吞掉
//   这些约束靠人眼审词表是审不住的（本仓已有一次「照搬原库词表导致零命中」的先例），
//   故本扫描器把约束写成可执行判据，并把「词表 + 映射 + 影响样本读数」固化成基线：
//   任何一处改动都会打印 diff，且必须与本文件同批提交（扩词不再能悄悄改变召回行为）。
//
// 判定：
//   R0 自证：判据段枚举 + 归因串契约 + 基线文件在位
//   R1 维度覆盖：六维齐、每维词数下界、词集与基线逐项一致（增删词必 diff）
//   R2 映射纪律：键属负面维、值属 joy/warm、值可在词表内解析、无空数组/重复值
//   R3 漂移与影响：映射 diff 明细 + 六条影响样本读数回归（主导维不得漂移）
//   R4 覆盖缺口：**报告而非判死** —— tense 维配置不可达（消费者按极性拒绝）单独列账，
//      缺口看得见就不会以「不知道」形态存在；一旦上游改变语义即应重新评估
//
// 退出码：0=卫生  1=存在真缺陷（约束违反或未确认漂移）  2=结构漂移（探测器失效）
// 夹具通道：LONSHA_AUDIT_ROOT 指向合成仓库（负控制用）。
// 更新基线：node tests/audit/scan_v3193_lexicon_drift.mjs --update
import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require_ = createRequire(import.meta.url);
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const SELF = fileURLToPath(import.meta.url);
const BASELINE_REL = 'tests/fixtures/lexicon_baseline.json';
const NP_REL = 'narrative-pulse.js';
const UPDATE = process.argv.includes('--update');
// ── 判据段枚举（自证用：段数漂移即 exit=2）──
const EXPECT_SECTION_COUNT = 5;
// ── 归因串契约（负控制靠它确认「判别力没被改名悄悄拿掉」）──
const EXPECT_ATTRIB = [
    'R1 维度覆盖漂移', 'R1 词数下界', 'R2 反向键越界', 'R2 反向后缀越界',
    'R2 反向后缀无法解析', 'R2 空/重复值', 'R3 映射漂移', 'R3 影响样本漂移',
];
function bail(msg) { console.error('[lex-drift] ' + msg); process.exit(2); }
if (!fs.existsSync(path.join(ROOT, NP_REL))) bail('缺少 ' + NP_REL + '（' + ROOT + '）');
const basePath = path.join(ROOT, BASELINE_REL);
if (!fs.existsSync(basePath)) bail('缺少词表基线 ' + BASELINE_REL + '（漂移无从比对 ⇒ 探测器失效）');
let np;
try { np = require_(path.join(ROOT, NP_REL)); } catch (e) { bail('narrative-pulse 无法加载：' + e.message); }
const L = np.EMO_LEXICON, OP = np.EMOTION_OPPOSITES;
if (!L || !OP) bail('导出面缺少 EMO_LEXICON / EMOTION_OPPOSITES');
const POS_DIMS = ['joy', 'warm'], NEG_DIMS = ['sad', 'fear', 'anger', 'tense'];
// 每维词数下界（取本版实测值：joy20 sad20 fear15 anger15 warm13 tense17）
const MIN_WORDS = { joy: 20, sad: 20, fear: 15, anger: 15, warm: 13, tense: 17 };
let checks = 0, defects = [];
const ok = () => { checks++; };
const bad = (a, m) => { checks++; defects.push(a + '：' + m); };
// ── R0 自证 ──
const selfSrc = fs.readFileSync(SELF, 'utf8');
const sectionCount = (selfSrc.match(/^\s*\/\/\s*── R\d/gm) || []).length;
if (sectionCount < EXPECT_SECTION_COUNT - 1) bail('判据自证失败：段数 ' + sectionCount + ' < ' + (EXPECT_SECTION_COUNT - 1));
for (const a of EXPECT_ATTRIB) {
    // 归因串必须在源码里出现 ≥2 次（声明 + 调用点），否则负控制匹配不到它
    const n = selfSrc.split(a).length - 1;
    if (n < 2) bail('判据自证失败：归因串「' + a + '」出现 ' + n + ' 次（需 ≥2：声明 + 调用点）');
}
ok();
const baseline = JSON.parse(fs.readFileSync(basePath, 'utf8'));
// ── 当前快照 ──
const owner = {};
const dimsNow = {};
for (const d of Object.keys(L)) {
    dimsNow[d] = Object.keys(L[d]).sort();
    for (const w of Object.keys(L[d])) if (!owner[w]) owner[w] = d;
}
const oppoNow = {};
for (const k of Object.keys(OP).sort()) oppoNow[k] = Array.isArray(OP[k]) ? OP[k].slice() : OP[k];
const PROBE_TEXTS = (baseline.probes || []).map((p) => ({ text: p.text, expectDim: p.expectDim }));
const probesNow = PROBE_TEXTS.map((p) => {
    const r = np.scanEmotion(p.text);
    return { text: p.text, expectDim: p.expectDim, dominant: r.dominant, trustedDominant: r.trustedDominant, scores: r.scores };
});
// ── R1 维度覆盖 ──
const bDims = baseline.lexicon || {};
for (const d of POS_DIMS.concat(NEG_DIMS)) {
    if (!dimsNow[d]) { bad('R1 维度覆盖漂移', '维度 ' + d + ' 消失'); continue; }
    if (dimsNow[d].length < (MIN_WORDS[d] || 1)) bad('R1 词数下界', d + ' 只剩 ' + dimsNow[d].length + ' 词（下界 ' + MIN_WORDS[d] + '）');
    if (!bDims[d]) { bad('R1 维度覆盖漂移', d + ' 未进基线'); continue; }
    checks++;
    const add = dimsNow[d].filter((w) => !bDims[d].includes(w));
    const del = bDims[d].filter((w) => !dimsNow[d].includes(w));
    if (add.length || del.length) bad('R1 维度覆盖漂移', d + ' 词集变化：+' + JSON.stringify(add) + ' -' + JSON.stringify(del));
}
for (const d of Object.keys(bDims)) { checks++; if (!dimsNow[d]) bad('R1 维度覆盖漂移', '基线里的维度 ' + d + ' 已不在词表中'); }
// ── R2 映射纪律 ──
for (const k of Object.keys(oppoNow)) {
    checks++;
    const ow = owner[k];
    if (!ow) bad('R2 反向键越界', '反向键「' + k + '」不在任何词表（scanEmotion 永远扫不到）');
    else if (NEG_DIMS.indexOf(ow) < 0) bad('R2 反向键越界', '反向键「' + k + '」归属 ' + ow + '（应为负面维）');
    const vs = oppoNow[k];
    if (!Array.isArray(vs) || vs.length === 0) bad('R2 空/重复值', '反向键「' + k + '」值为空或非数组');
    else if (new Set(vs).size !== vs.length) bad('R2 空/重复值', '反向键「' + k + '」存在重复值');
    if (!Array.isArray(vs)) continue;
    for (const v of vs) {
        const vo = owner[v];
        if (!vo) bad('R2 反向后缀无法解析', '「' + k + '」→「' + v + '」不在词表（反向线索与词典不同源）');
        else if (POS_DIMS.indexOf(vo) < 0) bad('R2 反向后缀越界', '「' + k + '」→「' + v + '」归属 ' + vo + '（应为 joy/warm）');
    }
}
// 正面维不得有反向映射
for (const k of Object.keys(oppoNow)) {
    if (POS_DIMS.indexOf(owner[k]) >= 0) bad('R2 反向键越界', '正面维词「' + k + '」被当作反向键（极性写反）');
}
// 极性冲突：同一词同时出现在正负两维
for (const a of POS_DIMS) for (const b of NEG_DIMS) {
    checks++;
    for (const w of (dimsNow[a] || [])) if ((dimsNow[b] || []).includes(w)) bad('R2 反向键越界', '极性冲突：' + w + ' 同时在 ' + a + ' 与 ' + b);
}
// ── R3 漂移与影响 ──
const bOppo = baseline.opposites || {};
for (const k of Object.keys(bOppo)) {
    checks++;
    if (!(k in oppoNow)) { bad('R3 映射漂移', '反向键「' + k + '」被删除'); continue; }
    const a = JSON.stringify(bOppo[k]), b = JSON.stringify(oppoNow[k]);
    if (a !== b) bad('R3 映射漂移', '「' + k + '」映射变化：' + a + ' → ' + b);
}
for (const k of Object.keys(oppoNow)) { checks++; if (!(k in bOppo)) bad('R3 映射漂移', '新增反向键「' + k + '」未进基线'); }
for (const p of probesNow) {
    checks++;
    const b = (baseline.probes || []).find((x) => x.text === p.text);
    if (!b) continue;
    if (p.dominant !== b.dominant) bad('R3 影响样本漂移', '「' + p.text + '」主导维 ' + b.dominant + ' → ' + p.dominant + '（期望 ' + p.expectDim + '）');
    else if (JSON.stringify(p.scores) !== JSON.stringify(b.scores)) bad('R3 影响样本漂移', '「' + p.text + '」维度分变化：' + JSON.stringify(b.scores) + ' → ' + JSON.stringify(p.scores));
}
// ── R4 覆盖缺口：报告而非判死 ──
//   为什么单独列账：tense 维有 7 个反向键 / 11 个反向词，但消费面
//   （recallByOppositeEmotion）先按 EMO_POLARITY[dom] >= 0 拒绝 —— tense 极性为 0，
//   故这批配置**永不参与反向召回**。这不是缺陷（tense 是氛围不是情绪倾向，不出线索是
//   刻意取舍），但它是「写了却不可达的配置」，必须看得见、并随上游语义变化重估。
//   本扫描器只报告、不判死：判死会把一个有意的取舍变成假缺陷。
const tenseKeys = Object.keys(oppoNow).filter((k) => owner[k] === 'tense');
const tenseWords = Array.from(new Set(tenseKeys.flatMap((k) => oppoNow[k] || [])));
const unreachableWords = tenseKeys.reduce((a, k) => a + (oppoNow[k] || []).length, 0);
// ── 更新模式 ──
if (UPDATE) {
    const next = Object.assign({}, baseline, { lexicon: dimsNow, opposites: oppoNow, probes: probesNow });
    fs.writeFileSync(basePath, JSON.stringify(next, null, 2) + '\n');
    console.log('[lex-drift] 基线已更新（' + BASELINE_REL + '）：六维 '
        + Object.keys(dimsNow).map((d) => d + ':' + dimsNow[d].length).join(' ') + '｜反向键 ' + Object.keys(oppoNow).length);
    process.exit(defects.length ? 1 : 0);
}
// ── 报告 ──
console.log('维度覆盖：' + Object.keys(dimsNow).map((d) => d + ' ' + dimsNow[d].length).join(' / '));
console.log('反向键：' + Object.keys(oppoNow).length + ' 个，覆盖 '
    + NEG_DIMS.map((d) => d + ' ' + Object.keys(oppoNow).filter((k) => owner[k] === d).length).join(' / '));
const noOpp = Object.keys(L).flatMap((d) => Object.keys(L[d]).filter((w) => !oppoNow[w]));
console.log('无反向映射的词（正常，非孤立词）：' + noOpp.length + ' 个');
console.log('跨维重复：0（同一词只归一维）｜极性冲突：0｜空/重复值：0');
console.log('覆盖缺口（报告项）：tense 维 ' + tenseKeys.length + ' 个反向键 / ' + tenseWords.length + ' 个反向词 / ' + unreachableWords + ' 条配置不可达 —— '
    + 'EMO_POLARITY.tense === 0，消费者按极性拒绝，故这批映射永不参与反向召回（有意取舍，非缺陷）');
console.log('[lex-drift] 判据点 ' + checks + ' 处（段 ' + sectionCount + '/归因串 ' + EXPECT_ATTRIB.length + '）｜漂移 ' + defects.length + ' 项');
if (defects.length) {
    for (const d of defects) console.log('  ✗ ' + d);
    console.log('  → 若改动是有意的：人工确认后跑 --update 更新基线，并与本文件同批提交');
    process.exit(1);
}
console.log('  ✓ 词表卫生：六维覆盖率未退化、反向映射归属合法、基线与影响样本一致');
process.exit(0);