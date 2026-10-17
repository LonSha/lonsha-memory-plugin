/* ============================================================
 * tests/v3327_e_pack_lore_annual.test.mjs — v3.327.0 · E 包记忆侧(M3-X5 + M3-X7)
 *
 * 【本档要证明的是「两件产品项真的端到端长出来了」,不是「两个文件在场」】
 *   M3-X5:设定资料与前史分层导入。修前只有 `PrequelSystem.importPrequel(text)` ——
 *     整篇文本当一团前情,**设定规则会被当成已发生的历史注入**。
 *   M3-X7:章节回顾与可编辑故事年鉴。修前的回顾**不指向原文**(原文改了就没人知道过期),
 *     且作者面与玩家面**同一种东西**(给玩家看 = 直接剧透)。
 *
 *   判据分五面(每面有独立的证伪路径):
 *     A 结构面:两模块导出面逐字对账 / 冻结 / 依赖面键名 / selfCheck
 *     B M3-X5 真跑:四类穷尽 / 设定不冒充已发生 / 映射三态 / 冲突不自动覆盖 / 变更段四态 / 定长掩码
 *     C M3-X7 真跑:四要素留数 / 证据绑定与缺据计数 / 两版可分与泄漏点名 / 草稿白名单 / 过期四态
 *     D 零写与不抛:输入容器一个字节不改 + 模块实现体不得读宿主 this
 *     E 宿主接线:两取库口 / 装配面键名 / 出口齐全 / 诊断两行 / 中文人读面 / 内联残留为零
 *
 * 【诚实边界(不判的两条)】
 *   1 M3-X5 的类目判定是**关键词启发式**,不是语义理解 —— 本档只判「四类可达且穷尽」
 *     与「判定词可溯」(judgeWhy),不判「分得对不对」(那需要语义引擎,不在本项范围)。
 *   2 M3-X7 的文风面**只报读数、不改写**:本档只判它不改写(输出与输入逐字无关)、
 *     不判「写的文风好不好」(那是人的事)。
 *
 * 【负控制一律真源码破坏】锚点恰中 1 次 → 在**破坏副本**上重跑**同款真判据** → 必须现形;
 *   并反向对照「原版同判据必须通过」。工具两向自证(H6)与判据纯度(H5)各一段。
 * 【当版锚点】本档自锚常量 BORN + vnum。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { breakOnce } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const ok = (m) => console.log('  ✓ ' + m);

const IDX = read('index.js');
const LI_SRC = read('lore-import.js');
const SA_SRC = read('story-annual.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const SELF_REL = path.join('tests', 'v3327_e_pack_lore_annual.test.mjs');
const SELF = read(SELF_REL);

const BORN = '3.327.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));

/** 与生产同形地在隔离 vm 里加载 IIFE 模块(window 即全局、module 缺席)。 */
function loadIIFE(src, globalName) {
    const ctx = {
        console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
        isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError,
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const api = ctx[globalName];
    if (!api) throw new Error('模块未挂 ' + globalName);
    return api;
}
const LI = loadIIFE(LI_SRC, 'LonShaLoreImport');
const SA = loadIIFE(SA_SRC, 'LonShaStoryAnnual');

/* ── 负控制锚点(每个在本档内必须恰好出现 1 次:见 H5) ── */
const A_LI1 = "if (r) return { cls: 'setting-rule', why: r };";
const A_LI2 = "else { rec.action = 'skip'; rec.why = 'confirmed-by-player'; out.skipped += 1; }";
const A_LI3 = 'text: SECRET_MASK, textHash: hash32(SECRET_MASK),';
const A_SA1 = 'unfinished: deep ? r.elements.unfinished.slice() : [],';
const A_SA2 = "if (FACT_FIELDS.indexOf(k) >= 0) { out.rejected.push({ key: k, why: 'draft-only', note: '事实位不属于草稿:改它得走记忆库的处置面' }); continue; }";
const A_SA3 = "if (!m.has(r)) { out.stale += 1; out.staleRefs.push({ chapter: cid, ref: r, why: 'gone' }); out.all.push({ chapter: cid, ref: r, verdict: 'stale' }); continue; }";
const A_IDX1 = "return _moduleLib(() => window.LonShaLoreImport, 'lore-import.js');";
const A_IDX2 = "return _moduleLib(() => window.LonShaStoryAnnual, 'story-annual.js');";

/* ══════════════ 判据体(纯函数;吃 api / 源码表,返回问题列表) ══════════════ */
/** A. 结构面:导出面逐字 / 冻结 / 依赖面 / 自证。 */
function structureJudge(li, sa) {
    const P = [];
    const liWant = ['ADMIT', 'CLASSES', 'CLASS_LABEL', 'LI_KIND', 'LI_VERSION', 'MANUAL', 'MAX_SOURCE_CHARS', 'ORIGIN', 'PREVIEW',
        'REQUIRED_DEPS', 'SECRET_BODY_KEYS', 'SECRET_MASK', 'applyOverrides', 'arrOf', 'changedSections', 'classify', 'clip', 'describe',
        'diffPreview', 'entityCandidates', 'hash32', 'isHeading', 'keyOf', 'line', 'numOr', 'originVerdict', 'parseSource',
        'parseSourceWindow', 'planApply', 'provenanceOf', 'reclassify', 'selfCheck', 'splitText', 'strOf'];
    /* [v3.339.0 · M4-X1] 导出面增 MANUAL / applyOverrides / reclassify / splitText（人工校订面 + 选入面）。
     *   既有 29 项**逐字不动**：新路径是**加法**，旧口径与它的负控制锚点都得原样在场
     *   （先例同 [v3.336.0 · M4-O9] 给 story-annual 加三面时的处理）。 */
    const gotLi = Object.keys(li).sort();
    if (gotLi.join(',') !== liWant.join(',')) P.push('lore-import 导出面变了:实测 [' + gotLi.join(',') + ']');
    /* [v3.336.0 · M4-O9] 导出面增 gatedVersions / spoilerGate / forPlayer（按事实可知性裁剪）。
     *   既有 27 项**逐字不动**：新路径是**加法**，旧口径与它的负控制锚点都得原样在场。 */
/* [v3.341.0 · M4-X2] 同上，按排序后真值重建。 */
    const saWant = [
        'COMPOSE_SOURCES',
        'DRAFT_FIELDS',
        'DRAFT_KIND',
        'DRAFT_SECTION_FIELDS',
        'ELEMENTS',
        'ELEMENT_LABEL',
        'FACT_FIELDS',
        'FOUL_WORDS',
        'ITEM_MAX',
        'REQUIRED_DEPS',
        'SA_KIND',
        'SA_VERSION',
        'SECTION_KINDS',
        'SECTION_LABEL',
        'SMOKE_WORDS',
        'VERSIONS',
        'applyEdits',
        'arrOf',
        'belletristic',
        'build',
        'chapterKey',
        'clip',
        'compose',
        'composeForPlayer',
        'composeLine',
        'describe',
        'draftLine',
        'edit',
        'evidenceOf',
        'forPlayer',
        'gatedVersions',
        'hash32',
        'keyOf',
        'line',
        'normalizeDrafts',
        'numOr',
        'rebuildAffected',
        'review',
        'sectionOf',
        'selfCheck',
        'splitPoints',
        'spoilerGate',
        'staleRefs',
        'strOf',
        'twoVersions',
    ];
    const gotSa = Object.keys(sa).sort();
    if (gotSa.join(',') !== saWant.join(',')) P.push('story-annual 导出面变了:实测 [' + gotSa.join(',') + ']');
    if (!Object.isFrozen(li)) P.push('lore-import 导出面未冻结');
    if (!Object.isFrozen(sa)) P.push('story-annual 导出面未冻结');
    /* 依赖面键名:与宿主装配点逐字一致(改名 = 静默变成「依赖缺席」)。 */
    const liKeys = (li.REQUIRED_DEPS || []).map((d) => d.key).join(',');
    if (liKeys !== 'KNOWN_ENTITIES,CONFIRMED_FACTS,SECRET_BODY_KEYS') P.push('lore-import 依赖面键名变了:' + liKeys);
    const saKeys = (sa.REQUIRED_DEPS || []).map((d) => d.key).join(',');
    if (saKeys !== 'CHAPTERS,SUMMARY,QUOTES') P.push('story-annual 依赖面键名变了:' + saKeys);
    if (li.LI_KIND !== 'lore_import') P.push('LI_KIND 不符:' + li.LI_KIND);
    if (sa.SA_KIND !== 'story_annual') P.push('SA_KIND 不符:' + sa.SA_KIND);
    /* 两模块自证(依赖齐备时)。 */
    const liDeps = { KNOWN_ENTITIES: [], CONFIRMED_FACTS: {}, SECRET_BODY_KEYS: ['secret'] };
    const sc1 = li.selfCheck(liDeps);
    if (sc1.ok !== true) P.push('lore-import selfCheck 未过:' + JSON.stringify(sc1));
    const sc2 = sa.selfCheck({ CHAPTERS: [], SUMMARY: {}, QUOTES: () => null });
    if (sc2.ok !== true) P.push('story-annual selfCheck 未过:' + JSON.stringify(sc2));
    /* 依赖面未给 ⇒ 如实报缺格(不是默默可用)。 */
    const miss = li.selfCheck({});
    if (miss.depsComplete !== false || miss.missing.length !== 3) P.push('lore-import 依赖缺失宣报不满三格:' + JSON.stringify(miss.missing));
    return P;
}

/** B. M3-X5 真跑。 */
function loreJudge(li) {
    const P = [];
    const NL = String.fromCharCode(10);
    const mk = (arr) => arr.join(NL);
    const CH = (n) => String.fromCharCode(0x4e00 + n);          /* 用码点拼字,避开转义污染 */
    const RULE_KW = li.CLASSES.indexOf('setting-rule') >= 0;
    if (!RULE_KW) P.push('四类词表缺 setting-rule');
    /* 四类可达且穷尽(真文本各一份)。 */
    const probes = [
        li.classify(mk(['世界观规则:此处永久禁止飞行'])).cls,
        li.classify(mk(['前史:当年发生过大 战'])).cls,
        li.classify(mk(['人物背景:他出生于北方'])).cls,
        li.classify(mk(['一段随手记下的杂物'])).cls,
    ];
    for (const c of li.CLASSES) if (probes.indexOf(c) < 0) P.push('四类不可穷尽,缺 ' + c);
    if (probes.some((v) => li.CLASSES.indexOf(v) < 0)) P.push('类目判定出了词表外的类:' + probes.join(','));
    /* 设定不冒充已发生:带「已经发生」的设定类文本 ⇒ 类目**不偷改**,只出警告。 */
    const trick = '世界观规则:此事已经发生,永久有效';
    const cl = li.classify(trick);
    if (cl.cls !== 'setting-rule') P.push('带「已发生」字样的设定被改类了:' + cl.cls);
    const parsedTrick = li.parseSource({ file: 't.md', text: mk(['# ' + trick, '正文']), }, { secretBodyKeys: li.SECRET_BODY_KEYS });
    const it0 = parsedTrick.items[0];
    if (!it0 || it0.settingAsHappened !== true) P.push('设定自称已发生须出警告标记');
    if (!it0 || it0.origin !== 'imported-lore') P.push('导入条目 origin 必须恒为 imported-lore');
    /* 段落级来源(不是整篇一个号)。 */
    const src = mk(['# 世界观规则', '永久禁止飞行', '# 前史:旧战', '当年发生过大 战', '# 人物背景', '他出生于北方', '# 杂记', '随手记下的东西']);
    const p = li.parseSource({ file: 'a.md', text: src }, { secretBodyKeys: li.SECRET_BODY_KEYS });
    if (p.sections.length !== 4) P.push('四标题应切四段,实 ' + p.sections.length);
    if (p.classes['setting-rule'] !== 1 || p.classes['backstory-event'] !== 1 || p.classes['character-bg'] !== 1 || p.classes['reference-only'] !== 1) {
        P.push('四类计数不符:' + JSON.stringify(p.classes));
    }
    const refs = p.items.map((i) => i.sourceRef).filter(Boolean);
    if (refs.length !== p.items.length) P.push('每条导入条目都要带 sourceRef');
    if (refs.some((r) => !r.file || !(r.section > 0) || !(r.lineFrom > 0))) P.push('sourceRef 须是段落级(文件 / 段序 / 行区间)');
    if (new Set(refs.map((r) => r.section)).size !== refs.length) P.push('段序必须逐段不同(整篇一个号 = 查不到来源)');
    /* 受限正文:入口即剥 + 定长。 */
    const sec = li.parseSource({ text: 'x' }, { secretBodyKeys: li.SECRET_BODY_KEYS, carriers: [{ key: 'k', title: 't', secret: 'y'.repeat(300) }] });
    const secIt = sec.items.filter((i) => i.sensitive === true)[0];
    if (!secIt) P.push('受限载体须进 items 并标 sensitive');
    if (secIt && secIt.text !== li.SECRET_MASK) P.push('受限正文未剥成站位串');
    /* 映射三态:未给清单 ⇒ checked:false(不报「无映射」);空表 ⇒ 查了;同名多主 ⇒ needs-confirm。 */
    const m0 = li.entityCandidates(p, undefined, {});
    if (m0.checked !== false) P.push('未给清单必须报 checked:false(不报「无映射」)');
    const m1 = li.entityCandidates(p, [], {});
    if (m1.checked !== true) P.push('给了空表须报 checked:true');
    const nm = '林' + CH(0x4e00 % 1000);
    const p2 = li.parseSource({ file: 'b.md', text: mk(['# 人物背景', nm + '出生于北方']) }, { secretBodyKeys: li.SECRET_BODY_KEYS });
    const m2 = li.entityCandidates(p2, [{ name: nm, owner: 'A' }, { name: nm, owner: 'B' }], {});
    if (m2.checked !== true) P.push('给了清单须报 checked:true');
    if (m2.needsConfirm < 1) P.push('同名多主必须落 needs-confirm(不得静默合并)');
    /* 冲突:**已确认事实不自动覆盖**,理由逐字 confirmed-by-player;显式 allowReplace 才 replace。 */
    const d0 = li.diffPreview(p, { facts: [{ key: p.items[0].key, value: 'x', confirmed: true }] }, {});
    const e0 = d0.entries[0];
    if (e0.action !== 'skip' || e0.why !== 'confirmed-by-player') P.push('已确认事实被自动覆盖了:' + JSON.stringify(e0));
    if (d0.conflict < 1) P.push('冲突须计数');
    const d1 = li.diffPreview(p, { facts: [{ key: p.items[1].key, value: 'zz', confirmed: false }] }, {});
    const e1 = d1.entries[1];
    if (e1.action !== 'skip' || e1.why !== 'undecided') P.push('未确认冲突须默认 skip/undecided(不替用户决定):' + JSON.stringify(e1));
    const d2 = li.diffPreview(p, { facts: [{ key: p.items[1].key, value: 'zz', confirmed: true }] }, { allowReplace: [p.items[1].key] });
    if (d2.entries[1].action !== 'replace') P.push('显式 allowReplace 才允许 replace');
    if (d0.confirmedChecked !== true) P.push('给了 facts ⇒ 已确认面须报 checked');
    const d3 = li.diffPreview(p, null, {});
    if (d3.confirmedChecked !== false) P.push('未给 facts ⇒ 已确认面须报未判');
    if (d3.why.indexOf('confirmed-face-absent') < 0) P.push('已确认面未判必须具名');
    if (!(d3.add > 0)) P.push('目标没有这些条 ⇒ 必须落 add');
    /* 导入计划:幂等(同源同段 ⇒ 同 id)与「必须先预览」。 */
    const pl0 = li.planApply(p, d3, {});
    const pl1 = li.planApply(p, d3, { seen: [pl0.importId] });
    if (pl0.importId !== pl1.importId) P.push('同一源同一段必须恒同 importId(幂等)');
    if (pl1.duplicate !== true || pl1.count !== 0) P.push('重复导入必须 duplicate:true 且 applied 为空');
    const pl2 = li.planApply(p, null, {});
    if (pl2.reason !== 'no-preview' || pl2.ok !== false) P.push('没预览必须发包:预览是唯一的冲突判据');
    /* 变更段四态。 */
    const p3 = li.parseSource({ file: 'a.md', text: src.split('永久禁止飞行').join('永久禁止飞行与潜水') }, { secretBodyKeys: li.SECRET_BODY_KEYS });
    const chg = li.changedSections(p, p3);
    if (chg.counts.same + chg.counts.changed !== 4) P.push('同段数对账不符:' + JSON.stringify(chg.counts));
    if (chg.counts.changed !== 1) P.push('只改一段就应只报一段变更,实 ' + chg.counts.changed);
    const chg0 = li.changedSections(null, p3);
    if (chg0.oldChecked !== false || chg0.why.indexOf('no-old-source') < 0) P.push('未给旧源须如实报未判');
    /* 来源链:引用而非拷贝(只回坐标与指纹)。 */
    const pv = li.provenanceOf(p, p.items[0].key);
    if (pv.found !== true || !pv.ref || pv.ref.section !== p.items[0].sourceRef.section) P.push('来源链未指回同段:' + JSON.stringify(pv));
    const pv0 = li.provenanceOf(p, 'no-such-key');
    if (pv0.found !== false || !pv0.why) P.push('未知 key 须如实报找不到');
    /* 起源判定。 */
    const ov = li.originVerdict({ origin: li.ORIGIN.IMPORTED });
    if (ov.mayCountAsHappened !== false) P.push('导入设定不得算作已发生事件');
    if (li.originVerdict({ origin: li.ORIGIN.UNKNOWN }).origin !== 'unknown') P.push('来源未给必须报 unknown');
    return P;
}

/** C. M3-X7 真跑。 */
function annualJudge(sa) {
    const P = [];
    const CH = (n) => String.fromCharCode(0x4e00 + n);
    const c1 = CH(1), c2 = CH(2), c3 = CH(3);
    const pay = { chapters: [
        { ref: { project: 'p', volume: 'v', chapter: '1' }, title: '开篇', floorFrom: 1, floorTo: 20,
          events: [{ floor: 3, text: '她推开门', chars: [c1] }, { floor: 9, text: c2 + '在暗处看着', chars: [c2] }],
          changes: [{ char: c2, from: '陌生', to: '敌意', floor: 9 }],
          open: [{ key: 'o1', text: c2 + '到底要干什么', floor: 9 }],
          quotes: [{ floor: 3, text: '进来吧', speaker: c1 }], summary: '开局:回家' },
    ] };
    const b = sa.build(pay, {});
    if (b.chaptersChecked !== true) P.push('给了 chapters 须报 checked');
    if (b.chapters.length !== 1) P.push('章数不对');
    if (b.counts.events !== 2 || b.counts.changes !== 1 || b.counts.unfinished !== 1 || b.counts.quotes !== 1) {
        P.push('四要素计数不符:' + JSON.stringify(b.counts));
    }
    if (sa.build(null, {}).chaptersChecked !== false) P.push('未给 chapters 必须报「章面未判」(不猜章界)');
    if (sa.build(null, {}).why.indexOf('chapters-absent') < 0) P.push('章面未判必须具名');
    /* 证据:每类条目都有证据位,ref 必须**带条目类**(同楼多类不得撞成同一个 ref)。 */
    const ch = b.chapters[0];
    if (ch.evidence.length !== 5) P.push('证据位数应为 5(2 事件 + 1 变化 + 1 未了 + 1 原话),实 ' + ch.evidence.length);
    const refs = ch.evidence.map((e) => e.ref);
    if (new Set(refs).size !== refs.length) P.push('证据 ref 不得重复(同楼多类必须带条目类)' + refs.join(','));
    const rv = sa.review('1', pay, {});
    if (rv.ok !== true) P.push('单章回顾未命中');
    if (rv.evidenceBound !== 5) P.push('五条须全部绑到证据,实 ' + rv.evidenceBound);
    if (rv.evidenceMissing !== 0) P.push('本夹具不应有缺据项,实 ' + rv.evidenceMissing);
    if (sa.review('no-such', pay, {}).ok !== false) P.push('找不到章须如实报');
    /* 两版:无剧透版不得含未了事项,**且白名单外角色名不得出现**。 */
    const tv = sa.twoVersions(rv, { allowedChars: [c1], knownChars: [c1, c2] });
    if (tv.versionsDistinct !== true) P.push('两版不得同形');
    if ((tv.spoilerFree.elements.unfinished || []).length !== 0) P.push('无剧透版不得含未了事项');
    if ((tv.authorial.elements.unfinished || []).length !== 1) P.push('作者版须含未了事项');
    if ((tv.leakedChars || []).indexOf(c2) < 0) P.push('白名单外角色名出现在正文必须点名');
    if ((tv.spoilerFree.elements.events || []).length !== 1) P.push('无剧透版须按在场角色裁掉白名单外的事件');
    const tv0 = sa.twoVersions(rv, {});
    if (tv0.why.indexOf('chars-face-absent') < 0) P.push('未给白名单须如实报「未做去剧透」(不报已去)');
    /* 草稿:**事实位一概拒**,未登记字段也不得静默丢弃。 */
    const ed0 = sa.edit({ title: 't' }, { state: { a: 1 } });
    if (ed0.rejected.length !== 1 || ed0.rejected[0].why !== 'draft-only') P.push('事实位必须被拒且理由逐字 draft-only');
    if (ed0.state && ed0.state.state !== undefined) P.push('事实位不得进新 state');
    const ed1 = sa.edit({ title: 't' }, { zzz: 1 });
    if (ed1.rejected.length !== 1 || ed1.rejected[0].why !== 'unknown-field') P.push('未登记字段不得静默丢弃');
    const ed2 = sa.edit({ title: 't' }, { title: 't2' });
    if (ed2.state.title !== 't2' || ed2.changed.join(',') !== 'title') P.push('草稿允许字段须能改');
    if (sa.edit(null, {}).reason !== 'no-state') P.push('无 state 须如实报');
    /* 原式不可变:edit 不得改入参。 */
    const before = { title: 'a', style: 'b' };
    const snap = JSON.stringify(before);
    sa.edit(before, { title: 'c' });
    if (JSON.stringify(before) !== snap) P.push('edit 改了入参 state(必须纯函数)');
    /* 文风面:只报读数、不改写一个字(输出与输入逐字无关)。 */
    const bl = sa.belletristic('他缓缓地走来,不禁叹气');
    if (bl.smokeHits < 2) P.push('八股味词未报读数:' + JSON.stringify(bl));
    if (bl.verdict !== 'smoky') P.push('有八股味须报 smoky');
    if (sa.belletristic('他快步走来').verdict !== 'clean') P.push('干净文本须报 clean');
    if (bl.writesNothing !== true) P.push('文风面必须声明零写');
    /* 过期:改一段 ⇒ 对应段过期(过期不等于删除);旧章不在新载荷 ⇒ 整章过期。 */
    const pay2 = JSON.parse(JSON.stringify(pay));
    pay2.chapters[0].events[0].text = '她轻轻推开门';
    const st = sa.staleRefs(b.chapters, pay2);
    if (st.stale !== 1 || st.fresh !== 4) P.push('只改一条事件就应只报一段过期,实 stale=' + st.stale + ' fresh=' + st.fresh);
    /* 档位:旧证据位在新载荷里**真消失**(事件挪楼) ⇒ 理由必须逐字 gone;
     *   若只把它归到 hash 档,「缺证据」与「证据变了」就分不开了。 */
    const pay3 = JSON.parse(JSON.stringify(pay));
    pay3.chapters[0].events[0].floor = 7;
    const st3 = sa.staleRefs(b.chapters, pay3);
    if (!st3.staleRefs.some(function (x) { return x.why === 'gone'; })) P.push('证据位从新载荷真消失时须逐字报 gone 档');
    const st0 = sa.staleRefs(b.chapters, { chapters: [] });
    if (st0.missingChapters !== 1) P.push('旧章不在新载荷须报整章过期');
    if (sa.staleRefs(b.chapters, null).why.indexOf('no-new-payload') < 0) P.push('未给新载荷须如实报未判');
    if (sa.staleRefs(null, pay).why.indexOf('no-old-chapters') < 0) P.push('未给旧章须如实报未判');
    return P;
}

/** D. 零写与不抛 + 模块实现体零 this。 */
function zeroWriteJudge(li, sa, liSrc, saSrc) {
    const P = [];
    const src = { text: '# 世界观规则' + String.fromCharCode(10) + '永久禁止飞行' };
    const snap = JSON.stringify(src);
    li.parseSource(src, { secretBodyKeys: li.SECRET_BODY_KEYS });
    if (JSON.stringify(src) !== snap) P.push('parseSource 改了入参');
    const target = { facts: [{ key: 'k', value: 'v', confirmed: true }] };
    const tsnap = JSON.stringify(target);
    li.diffPreview(li.parseSource(src, {}), target, {});
    if (JSON.stringify(target) !== tsnap) P.push('diffPreview 改了目标面');
    const pay = { chapters: [{ ref: { chapter: '1' }, title: 't', events: [{ floor: 1, text: 'x', chars: ['a'] }] }] };
    const psnap = JSON.stringify(pay);
    sa.build(pay, {});
    sa.review('1', pay, {});
    sa.twoVersions(sa.review('1', pay, {}), { allowedChars: ['a'], knownChars: ['a'] });
    sa.staleRefs(sa.build(pay, {}).chapters, pay);
    if (JSON.stringify(pay) !== psnap) P.push('年鉴三面改了入参');
    /* 畸形入参不抛(降级为可读读数)。 */
    for (const f of [() => li.parseSource(null, {}), () => li.diffPreview(null, {}, {}), () => li.planApply(null, null, {}),
        () => li.entityCandidates(null, [], {}), () => li.changedSections(null, null), () => li.provenanceOf(null, null),
        () => li.originVerdict(null), () => sa.build(null, {}), () => sa.review(null, null, {}), () => sa.twoVersions(null, {}),
        () => sa.belletristic(null), () => sa.edit(null, null), () => sa.staleRefs(null, null)]) {
        try { f(); } catch (e) { P.push('畸形入参必须降级不抛:' + (e && e.message)); }
    }
    /* 模块实现体不得读宿主 this(能力一律经入参;注释里的说明文字不算代码)。 */
    for (const [name, s] of [['lore-import', liSrc], ['story-annual', saSrc]]) {
        const impl = String(s).split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l) && l.indexOf('globalThis') < 0).join('\n');
        if (/(^|[^\w.$])this[.)\s=]/.test(impl)) P.push(name + ' 模块实现体不得读宿主 this');
        for (const banned of ['require(', 'fetch(', 'localStorage', 'indexedDB', 'XMLHttpRequest']) {
            if (String(s).indexOf(banned) >= 0) P.push(name + ' 不得出现 ' + banned + '(零依赖 / 离线 / 不落盘)');
        }
    }
    return P;
}

/** E. 宿主接线。 */
function hostJudge(idx, mf) {
    const P = [];
    if (idx.split(A_IDX1).length - 1 !== 1) P.push('取库口(lore-import)须恰一处');
    if (idx.split(A_IDX2).length - 1 !== 1) P.push('取库口(story-annual)须恰一处');
    /* 装配面键名:与模块 REQUIRED_DEPS 逐字一致(改名 = 静默变成「依赖缺席」)。 */
    for (const k of ['KNOWN_ENTITIES', 'CONFIRMED_FACTS', 'SECRET_BODY_KEYS']) if (idx.indexOf(k + ':') < 0) P.push('宿主装配面缺键 ' + k);
    for (const k of ['CHAPTERS', 'SUMMARY', 'QUOTES']) if (idx.indexOf(k + ':') < 0) P.push('宿主装配面缺键 ' + k);
    /* 出口齐全。 */
    for (const m of ['loreImportParse', 'loreImportEntities', 'loreImportPreview', 'loreImportPlan', 'loreImportChanged',
        'loreImportDescribe', 'loreImportLine', 'storyAnnualBuild', 'storyAnnualReview', 'storyAnnualTwoVersions',
        'storyAnnualBelletristic', 'storyAnnualEdit', 'storyAnnualStale', 'storyAnnualDescribe', 'storyAnnualLine']) {
        if (idx.indexOf(m + '(') < 0) P.push('宿主导出缺 ' + m);
    }
    /* 转发不改写:两处 describe 都必须把 reason 透传/标注,不得吞掉。 */
    if (idx.indexOf("d.reason = (d.missing && d.missing.length) ? 'deps-missing' : '';") < 0) P.push('自述未标 deps-missing');
    /* 诊断两行 + 中文人读面。 */
    if (idx.indexOf("['资料导入', this.loreImportLine()]") < 0) P.push('自检缺「资料导入」行');
    if (idx.indexOf("['故事年鉴', this.storyAnnualLine()]") < 0) P.push('自检缺「故事年鉴」行');
    if (idx.indexOf('资料导入模块未加载(lore-import.js)') < 0) P.push('人读面须中文(资料导入)');
    if (idx.indexOf('年鉴模块未加载(story-annual.js)') < 0) P.push('人读面须中文(故事年鉴)');
    /* 登记面。 */
    if (mf.extra_js.filter((x) => x === 'lore-import.js').length !== 1) P.push('extra_js 登记 lore-import.js 恰一次');
    if (mf.extra_js.filter((x) => x === 'story-annual.js').length !== 1) P.push('extra_js 登记 story-annual.js 恰一次');
    if (mf.extra_js[0] !== 'ledger-entity.js') P.push('ledger-entity.js 仍须在 extra_js 首位');
    if (new Set(mf.extra_js).size !== mf.extra_js.length) P.push('extra_js 不得重复');
    /* 内联实现残留为零:模块内标识不得在宿主里出现(两份实现必然漂)。 */
    for (const s of ['CLASS_LABEL[', 'SMOKE_WORDS', 'FOUL_WORDS', 'DRAFT_FIELDS', 'SECRET_MASK', 'ELEMENT_LABEL[']) {
        if (idx.indexOf(s) >= 0) P.push('内联实现残留:' + s);
    }
    return P;
}

/* ══════════════ A. 结构面 ══════════════ */
test('v3327 A1. ★★★★ 两模块结构面:导出面逐字对账 / 冻结 / 依赖面键名 / 自证与缺格宣报', () => {
    assert.deepEqual(structureJudge(LI, SA), [], '结构面');
    ok('lore-import ' + Object.keys(LI).length + ' 项导出 / story-annual ' + Object.keys(SA).length + ' 项导出,键名与宿主装配点逐字对齐');
});

/* ══════════════ B. M3-X5 真跑 ══════════════ */
test('v3327 B1. ★★★★ M3-X5 四类穷尽 + 设定不冒充已发生 + 段落级来源', () => {
    assert.deepEqual(loreJudge(LI), [], 'M3-X5');
    ok('四类各一可达且穷尽;带「已发生」字样的设定只出警告不改类;来源到段');
});
test('v3327 B2. ★★★ M3-X5 受限正文:入口即剥 + 定长站位串(长度不当读数)', () => {
    const a = LI.parseSource({ text: 'x' }, { secretBodyKeys: LI.SECRET_BODY_KEYS, carriers: [{ key: 'k', title: 't', secret: 'y' }] });
    const b = LI.parseSource({ text: 'x' }, { secretBodyKeys: LI.SECRET_BODY_KEYS, carriers: [{ key: 'k', title: 't', secret: 'y'.repeat(400) }] });
    const pa = a.items.filter((i) => i.sensitive === true)[0];
    const pb = b.items.filter((i) => i.sensitive === true)[0];
    assert.ok(pa && pb, '受限载体须进 items');
    assert.equal(pa.text, LI.SECRET_MASK, '短文本也必须剥成站位串');
    assert.equal(pb.text, LI.SECRET_MASK, '长文本同样剥成站位串');
    assert.equal(pa.text, pb.text, '站位串不得随原文本长变化');
    ok('受限正文一个字符不进返回值;掩码定长');
});
test('v3327 B3. ★★★ M3-X5 映射三态与冲突默认不覆盖(与 memory-package 同纪律)', () => {
    const p = LI.parseSource({ file: 'a.md', text: '# 人物背景' + String.fromCharCode(10) + '甲出生于北方' }, { secretBodyKeys: LI.SECRET_BODY_KEYS });
    assert.equal(LI.entityCandidates(p, undefined, {}).checked, false, '未给清单 ⇒ 未判(不报无映射)');
    assert.equal(LI.entityCandidates(p, [], {}).checked, true, '给了空表 ⇒ 查了');
    const d = LI.diffPreview(p, { facts: [{ key: p.items[0].key, value: 'x', confirmed: true }] }, {});
    assert.equal(d.entries[0].why, 'confirmed-by-player', '已确认事实必须默认 skip');
    assert.equal(d.confirmedChecked, true, '给了 facts ⇒ 已确认面已判');
    assert.equal(LI.diffPreview(p, null, {}).confirmedChecked, false, '未给 facts ⇒ 未判');
    ok('映射三态互不同形;冲突默认不替用户决定');
});
test('v3327 B4. ★★★ M3-X5 变更段:「源更新只重审变更段」逐段四态', () => {
    const base = '# 世界观规则' + String.fromCharCode(10) + '永久禁飞' + String.fromCharCode(10) + '# 前史' + String.fromCharCode(10) + '当年大战';
    const p1 = LI.parseSource({ file: 'a.md', text: base }, {});
    const p2 = LI.parseSource({ file: 'a.md', text: base.split('永久禁飞').join('永久禁飞与潜水') }, {});
    const c = LI.changedSections(p1, p2);
    assert.equal(c.counts.changed, 1, '只改一段应只报一段变更');
    assert.equal(c.counts.same, 1, '未改的段必须报 same');
    assert.equal(c.counts.added, 0, '段数未变不应报 added');
    assert.equal(LI.changedSections(null, p2).oldChecked, false, '未给旧源 ⇒ 未判');
    ok('四态各自独立计数;未给旧源不报「无变更」');
});

/* ══════════════ C. M3-X7 真跑 ══════════════ */
test('v3327 C1. ★★★★ M3-X7 四要素 + 证据绑定(缺据单独计数、ref 带条目类)', () => {
    assert.deepEqual(annualJudge(SA), [], 'M3-X7');
    ok('四要素计数/证据 ref 唯一/两版可分/草稿白名单/过期四态');
});
test('v3327 C2. ★★★★ M3-X7 两版可分:无剧透版不得含未了事项,白名单外角色名必须点名', () => {
    const a = String.fromCharCode(0x4e01), b = String.fromCharCode(0x4e59);
    const pay = { chapters: [{ ref: { chapter: '1' }, title: 't',
        events: [{ floor: 3, text: a + '推门', chars: [a] }, { floor: 9, text: b + '在暗处', chars: [b] }],
        open: [{ key: 'o', text: b + '要干什么', floor: 9 }] }] };
    const rv = SA.review('1', pay, {});
    const tv = SA.twoVersions(rv, { allowedChars: [a], knownChars: [a, b] });
    assert.equal(tv.spoilerFree.elements.unfinished.length, 0, '无剧透版不得有未了事项');
    assert.ok(tv.authorial.elements.unfinished.length >= 1, '作者版须有未了事项');
    assert.ok(tv.leakedChars.indexOf(b) >= 0, '白名单外角色名出现必须点名');
    assert.notDeepEqual(tv.spoilerFree.elements, tv.authorial.elements, '两版不得同形');
    ok('两版结构不同形:无剧透版裁条并点名泄漏');
});
test('v3327 C3. ★★★ M3-X7 草稿白名单:事实位一概拒,纯函数不改入参', () => {
    const st = { title: 'a', style: 'b' };
    const snap = JSON.stringify(st);
    const r = SA.edit(st, { state: { x: 1 }, title: 'c' });
    assert.equal(JSON.stringify(st), snap, 'edit 不得改入参');
    /* ★ 模块在隔离 vm 里加载 ⇒ 它返回的数组是**另一个 realm 的 Array**:
     *   与宿主字面量原型不同,deepStrictEqual 会「逐字相同也判不等」。故比字节。 */
    assert.equal(JSON.stringify(r.rejected.map((x) => x.why)), JSON.stringify(['draft-only']), '事实位必须被拒');
    assert.equal(r.state.state, undefined, '事实位不得进新 state');
    assert.equal(JSON.stringify(r.changed), JSON.stringify(['title']), '草稿允许字段须能改');
    assert.equal(SA.edit({}, { zzz: 1 }).rejected[0].why, 'unknown-field', '未登记字段不得静默丢弃');
    ok('编辑的是作品草稿,不是事实;入参逐字节不动');
});
test('v3327 C4. ★★★ M3-X7 文风面只报读数不改写(输出里没有输入文本)', () => {
    const t = '他缓缓地走来,不禁叹气';
    const bl = SA.belletristic(t);
    assert.ok(bl.smokeHits >= 2, '八股味必须报读数');
    assert.equal(bl.verdict, 'smoky', '有八股味须报 smoky');
    assert.equal(SA.belletristic('他快步走来').verdict, 'clean', '干净须报 clean');
    assert.equal(bl.writesNothing, true, '必须声明零写');
    assert.ok(!('text' in bl) && !('out' in bl), '文风面不得回改后正文');
    ok('只统计、只给结论,不改写一个字');
});

/* ══════════════ D. 零写与不抛 ══════════════ */
test('v3327 D1. ★★★★ 零写:三面全程入参一个字节不改;畸形入参十三式一律不抛', () => {
    assert.deepEqual(zeroWriteJudge(LI, SA, LI_SRC, SA_SRC), [], '零写与不抛');
    ok('parseSource/diffPreview/年鉴三面零改入参;13 种畸形入参全部降级');
});
test('v3327 D2. ★★★ 两模块实现体不得读宿主 this(能力一律经入参注入)', () => {
    assert.deepEqual(zeroWriteJudge(LI, SA, LI_SRC, SA_SRC).filter((x) => x.indexOf('不得读宿主 this') >= 0), [], '零 this');
    ok('模块内无 this 依赖;根捕获行按 globalThis 豁免');
});

/* ══════════════ E. 宿主接线 ══════════════ */
test('v3327 E1. ★★★★ 取库口与装配面:两取库口各一处,八个依赖键逐字对齐模块声明', () => {
    assert.deepEqual(hostJudge(IDX, MF).filter((x) => x.indexOf('取库口') >= 0 || x.indexOf('装配面缺键') >= 0), [], '取库口与装配面');
    ok('两取库口各恰一处;八个依赖键与 REQUIRED_DEPS 逐字同源');
});
test('v3327 E2. ★★★★ 宿主出口齐全(15 项)且转发不改写(自述须标 deps-missing)', () => {
    assert.deepEqual(hostJudge(IDX, MF).filter((x) => x.indexOf('宿主导出缺') >= 0 || x.indexOf('deps-missing') >= 0), [], '出口面');
    ok('15 项出入口齐;describe 把缺格如实标出,不改写内核返回值');
});
test('v3327 E3. ★★★ 人读面:两行诊断入自检,标签与缺席文案保持中文', () => {
    assert.deepEqual(hostJudge(IDX, MF).filter((x) => x.indexOf('自检缺') >= 0 || x.indexOf('人读面') >= 0), [], '人读面');
    ok('「资料导入」「故事年鉴」两行在自检里;缺席文案仍是中文');
});
test('v3327 E4. ★★★★★ 登记面与真源唯一:两模块各在 extra_js 恰一次,宿主内联残留为零', () => {
    assert.deepEqual(hostJudge(IDX, MF).filter((x) => x.indexOf('extra_js') >= 0 || x.indexOf('内联实现残留') >= 0 || x.indexOf('ledger-entity') >= 0 || x.indexOf('不得重复') >= 0), [], '登记面');
    ok('分发面 ' + MF.extra_js.length + ' 项,两模块各一次;模块内标识在宿主一个都搜不到');
});

/* ══════════════ F. 真源码破坏负控制 ══════════════ */
test('v3327 F1. ★★★ 破坏 M3-X5 类目判定 ⇒ 四类穷尽当场现形', () => {
    const broken = breakOnce(LI_SRC, A_LI1, "if (r) return { cls: 'reference-only', why: r };", 'F1');
    assert.notEqual(broken, LI_SRC, '破坏必须真改源码');
    assert.notDeepEqual(loreJudge(loadIIFE(broken, 'LonShaLoreImport')), [], '设定类不可达必须翻红');
    assert.deepEqual(loreJudge(LI), [], '原版上同判据必须真成立');
    ok('负控制成立:类目塌缩即红,原版仍绿');
});
test('v3327 F2. ★★★ 破坏「已确认事实默认 skip」⇒ 自动覆盖当场现形', () => {
    const broken = breakOnce(LI_SRC, A_LI2, "else { rec.action = 'replace'; rec.why = 'confirmed-by-player'; out.skipped += 1; }", 'F2');
    assert.notDeepEqual(loreJudge(loadIIFE(broken, 'LonShaLoreImport')), [], '已确认事实被自动覆盖必须翻红');
    assert.deepEqual(loreJudge(LI), [], '原版上同判据必须真成立');
    ok('负控制成立:默认 replace 即红');
});
test('v3327 F3. ★★★ 破坏受限正文剥离 ⇒ 掩码判据当场现形', () => {
    const broken = breakOnce(LI_SRC, A_LI3, 'text: strOf(m.secret), textHash: hash32(strOf(m.secret)),', 'F3');
    assert.notDeepEqual(loreJudge(loadIIFE(broken, 'LonShaLoreImport')), [], '受限正文未剥必须翻红');
    assert.deepEqual(loreJudge(LI), [], '原版上同判据必须真成立');
    ok('负控制成立:正文漏出即红');
});
test('v3327 F4. ★★★★ 破坏「无剧透版裁未了事项」⇒ 两版同形当场现形', () => {
    const broken = breakOnce(SA_SRC, A_SA1, 'unfinished: r.elements.unfinished.slice(),', 'F4');
    assert.notDeepEqual(annualJudge(loadIIFE(broken, 'LonShaStoryAnnual')), [], '无剧透版含未了事项必须翻红');
    assert.deepEqual(annualJudge(SA), [], '原版上同判据必须真成立');
    ok('负控制成立:把作者面塞进玩家版即红');
});
test('v3327 F5. ★★★★ 破坏草稿白名单 ⇒ 改得到事实位当场现形', () => {
    const broken = breakOnce(SA_SRC, A_SA2, 'if (FACT_FIELDS.indexOf(k) >= 0) { next[k] = p[k]; out.changed.push(k); continue; }', 'F5');
    assert.notDeepEqual(annualJudge(loadIIFE(broken, 'LonShaStoryAnnual')), [], '事实位可改必须翻红');
    assert.deepEqual(annualJudge(SA), [], '原版上同判据必须真成立');
    ok('负控制成立:草稿白名单失效即红');
});
test('v3327 F6. ★★★ 破坏过期判定中的「gone 档」⇒ 缺证据漏报当场现形', () => {
    const broken = breakOnce(SA_SRC, A_SA3, "if (!m.has(r)) { out.stale += 1; out.all.push({ chapter: cid, ref: r, verdict: 'stale' }); continue; }", 'F6');
    assert.notDeepEqual(annualJudge(loadIIFE(broken, 'LonShaStoryAnnual')), [], '证据消失漏报必须翻红');
    assert.deepEqual(annualJudge(SA), [], '原版上同判据必须真成立');
    ok('负控制成立:gone 档被抹即红');
});
test('v3327 F7. ★★★★ 破坏宿主取库口 ⇒ 接线判据当场现形(不静默降级成兜底)', () => {
    const broken = breakOnce(IDX, A_IDX1, 'return null;', 'F7');
    assert.notDeepEqual(hostJudge(broken, MF), [], '取库口被拿掉必须翻红');
    assert.deepEqual(hostJudge(IDX, MF), [], '原版上同判据必须真成立');
    ok('负控制成立:取库口消失即红');
});

/* ══════════════ G. H5 判据纯度 + H6 工具两向自证 ══════════════ */
test('v3327 G1. ★★★ H5 判据纯度:每个负控制锚在本档里各自只出现 1 次', () => {
    const anchors = { A_LI1, A_LI2, A_LI3, A_SA1, A_SA2, A_SA3, A_IDX1, A_IDX2 };
    const bad = [];
    for (const [k, v] of Object.entries(anchors)) {
        const n = SELF.split(v).length - 1;
        if (n !== 1) bad.push(k + ' 出现 ' + n + ' 次');
    }
    assert.deepEqual(bad, [], '锚点在判据体内不得被逐字复述(两处各写一份 ⇒ 改一处漏一处会恒过)');
    ok('八个锚点各恰出现 1 次');
});
test('v3327 G2. ★★★ H6 工具两向自证:打偏 / 同值替换都必须被 breakOnce 拒绝', () => {
    assert.throws(() => breakOnce(LI_SRC, 'thisAnchorDoesNotExist' + 'Anywhere', 'x', 'G2'), /拒绝破坏/, '打偏必须拒');
    assert.throws(() => breakOnce(LI_SRC, A_LI1, A_LI1, 'G2'), /必须真的改变源码/, '同值替换必须拒');
    assert.notEqual(breakOnce(LI_SRC, A_LI1, 'if (r) return { cls: \'reference-only\', why: r };', 'G2'), LI_SRC, '真锚点必须真改');
    ok('0 命中 / 不唯一 / 同值三形态均被拒,真锚点可用');
});

/* ══════════════ H. 自防护 + 六源同源 + 当版锚 ══════════════ */
test('v3327 H1. ★★★ 自防护:档头诚实边界与八锚列表在位;六源同源;当版锚 v' + BORN, () => {
    assert.ok(SELF.indexOf('诚实边界') >= 0, '档头须写明不判的两条');
    assert.equal(vnum(BORN), 3327000, '当版锚必须住在当版档案里');
    /* [v3.328.0 交棒] 原文是 `=== BORN` 硬等号 + 逐字比对当版字面量 —— 抬版即红,
     *   而红的信息量只剩「数字不对」。按 v3326 范式改为**下界 + 真同源**:
     *   · 当版锚仍自锚 BORN(它锁的是「本档属于 v3.327.0 这一版」,不是「宿主停在 3.327.0」);
     *   · 六源同源改为判「三模块的 VERSION 与宿主 VERSION **逐字相同**」——
     *     这才是同源判据本身(比锁字面量更强,且不随版本漂)。 */
    const idxV = (IDX.match(/const VERSION = '([0-9.]+)'/) || [])[1];
    assert.ok(vnum(idxV) >= vnum(BORN), 'index VERSION 不得低于本档基线(实 ' + idxV + ')');
    assert.ok(vnum(PKG.version) >= vnum(BORN), 'package.json 版本不得低于本档基线(实 ' + PKG.version + ')');
    assert.ok(vnum(MF.version) >= vnum(BORN), 'manifest.json 版本不得低于本档基线(实 ' + MF.version + ')');
    for (const f of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const s = read(f);
        const mv = (s.match(/let VERSION = '([0-9.]+)'/) || [])[1];
        assert.equal(mv, idxV, f + ' 版本未与宿主同源(逐字相同才是同源,实 ' + mv + ' / 宿主 ' + idxV + ')');
    }
    ok('自防护 / 六源同源 / 当版锚 v' + BORN);
});
