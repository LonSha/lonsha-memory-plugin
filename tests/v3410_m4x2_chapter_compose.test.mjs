/* ============================================================
 * tests/v3410_m4x2_chapter_compose.test.mjs — v3.341.0 · M4-X2
 * 面向读者的章节回顾与年鉴成稿（成稿 / 按章重建 / 改正文不篡改记忆）
 *
 * 【本档要证明的四件事（不是「函数返回了对象」）】
 *   a) **真有成稿**：compose 吃 review() 的产物，出**可读**回顾，且**逐段带证据位**
 *      —— 每一段都能跳回原文；bound / missing / undecided 三条读数**分开报**
 *      （把「没证据」与「没看证据面」压成一条是本仓治过多次的错读数）；
 *   b) **未调用真实模型只能报结构成稿、不报文风通过**：只有调用方给出真模型通道
 *      （opts.polish）且文本真的变了才转 polished；**即使过了模型**，调用方没回报
 *      styleOk:true 也**不报通过**（styleChecked 保持 false，styleNote 逐字写明）；
 *   c) **按章重建而非整本重写**：受影响 / 未变 / 整章过期 / 未判四格分开，
 *      wholeBookRebuilt 恒 false；判不了的（只报条数不具名 / 无过期读数）如实具名；
 *   d) **改正文不篡改记忆**有可机检形态：applyEdits 对草稿与补丁**双向**过滤事实位，
 *      且段证据位被编辑掉时逐条具名 evidence-dropped、置 evidenceIntact:false
 *      —— 不是一句承诺。
 *
 * 【负控制一律真源码破坏】锚点恰中 1 次 → 在**破坏副本**上重跑**同款真判据** → 必须现形；
 *   并反向对照「原版同判据必须通过」。判据纯度（H5）与工具两向自证（H6）单独一段。
 * 【当版锚点】本档自锚常量 BORN_V + vnum（锚住在当版档案里，供版本守卫 V4 计数）。
 * 【诚实边界（本档不判的两条）】
 *   1 真实 SillyTavern 宿主的 UI 点击流与真实模型问答**未跑**：本档的「过了模型」一条用
 *     **注入的真函数**取证 —— 它验的是「判据认不认真模型通道」，不是「模型写得好不好」；
 *   2 成稿文本的**文学质量**不判（那是人的事）：本档只判「结构化 + 逐段回源 + 读数如实」。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as KIT from './_break_kit.mjs';
const NL = String.fromCharCode(10);
const BSL = String.fromCharCode(92);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const IDX = read('index.js');
const ORG = read('memory-organs.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const SA_SRC = read('story-annual.js');
const SA_OPS_SRC = read('engine-story-annual.js');
const SELF = read(path.join('tests', 'v3410_m4x2_chapter_compose.test.mjs'));
const BORN_V = '3.341.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));
/** 在隔离 vm 里加载 IIFE 模块（与生产同形：window 即全局，module 缺席）。 */
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
const SA = loadIIFE(SA_SRC, 'LonShaStoryAnnual');
/* ══════════════ 负控制锚点（在判据层只声明一次 —— H5 判据纯度） ══════════════ */
const ANCHORS = Object.freeze({
    /* 内核·真模型通道闸：置假 ⇒ 给了真模型也不转 polished（实测红：未调模型与过了模型同形）。 */
    kPolishGate: String.raw`if (typeof o.polish === 'function') {`,
    /* 内核·证据面未判：置假 ⇒ 「没看证据面」被读成「缺证据」（实测红：三态压成两态）。 */
    kEvidenceUndecided: String.raw`if (!have.size) { out.evidenceUndecided += 1; continue; }`,
    /* 内核·玩家版闸：置假 ⇒ 去剧透未成立时**回退作者版**（实测红：不可知的一章照样发给玩家）。 */
    kPlayerGate: String.raw`if (tv.gated !== true) return bad('knowledge-face-absent');`,
    /* 内核·整章过期：置假 ⇒ 不在新载荷里的章被读成「未判」（实测红：过期 != 删除 被压成没读过）。 */
    kGone: String.raw`if (gone.has(cid)) {`,
    /* 内核·入参草稿自带事实位：摘掉登记 ⇒ 记忆保护在 draft 侧只是一句话（实测红：state 原样流传）。 */
    kDraftFact: String.raw`out.rejected.push({ key: k, why: 'draft-only', note: '入参草稿夹带的事实位不随编辑流传（事实不属于草稿）' });`,
    /* 内核·段证据位不得被抹：置假 ⇒ 抹掉回源凭证却不报（实测红：改正文篡改记忆的凭证被静默吞）。 */
    kEvidenceKept: String.raw`if (after.indexOf(r) < 0) {`,
    /* 宿主·存档契约面：换成常量 ⇒ 草稿册不再随聊天持久化（实测红：跨对话的草稿册读数丢失）。 */
    hDraftContract: String.raw`annualDrafts: this._annualDrafts || null,`,
    /* 宿主·落笔即持久化：置空 ⇒ 写进去读不回来（实测红：重开对话后草稿册空掉）。 */
    hDraftPersist: String.raw`engine._annualDrafts = res.ok ? res.drafts.slice() : [];`,
    /* 宿主·可知性自动装配：抹掉 ⇒ 真实会话里无人手动装配，玩家版永远判不了（实测红：结构面照出）。 */
    hGateAuto: String.raw`try { o.gate = engine._o9Gate(); } catch (e) { errLog(e, 'plugin.storyAnnualComposeForPlayer.gate'); }`,
});
/* ══════════════ A. 结构面 ══════════════ */
const HOST_METHODS = [
    'storyAnnualCompose(rev, opts) {',
    'storyAnnualComposeForPlayer(rev, opts) {',
    'storyAnnualRebuild(drafts, stale, opts) {',
    'storyAnnualApplyEdits(draft, patch) {',
    'storyAnnualDrafts(raw, opts) {',
    'storyAnnualComposeLine() {',
];
const CONTRACT_KEYS = ["'annualDrafts',", "_imp('annualDrafts'", "A('direct', 'annualDrafts'"];
function judgeStruct(idx, org, mf, saOpsSrc = SA_OPS_SRC) {
    const bad = [];
    const FULL = idx + '\n' + saOpsSrc;
    for (const h of HOST_METHODS) {
        const n = idx.split(h).length - 1;
        if (n !== 1) bad.push(h + ' 命中 ' + n + ' 次（应恰 1）');
    }
    if (idx.indexOf('function _storyAnnualLib() {') < 0) bad.push('缺取库口 _storyAnnualLib');
    for (const k of CONTRACT_KEYS) if (idx.split(k).length - 1 < 1) bad.push('持久化 / 契约面缺 ' + k);
    if (idx.split(ANCHORS.hDraftContract).length - 1 !== 1) bad.push('collectExport 的 annualDrafts 面应恰 1 处');
    /* 可知性装配口：真实会话里无人手动装配，缺这一行则玩家版永远判不了。 */
    if (FULL.split(ANCHORS.hGateAuto).length - 1 !== 1) bad.push('玩家版出口缺可知性自动装配口（真实会话里无人手动装配）');
    /* 成稿读数并入**既有**「故事年鉴」自检行（不新增行：新行会让既有判据读不到）。 */
    if (idx.split("['故事年鉴', this.storyAnnualLine()]").length - 1 !== 1) bad.push('自检面「故事年鉴」行不恰一处');
    if (FULL.split('const ce = this._lastAnnualCompose || null;').length - 1 !== 1 && FULL.split('const ce = engine._lastAnnualCompose || null;').length - 1 !== 1) bad.push('成稿读数未并入既有自检行');
    /* 逐字副本：存档键白名单在 organs 侧有一份，两边不同步 = 跨对话把上一部的回顾接进新故事。 */
    if (org.split(CONTRACT_KEYS[0]).length - 1 !== 1) bad.push('memory-organs 的存档键副本未同源');
    if (!Array.isArray(mf.extra_js) || mf.extra_js.indexOf('story-annual.js') < 0) bad.push('manifest.extra_js 缺 story-annual.js');
    return bad;
}
/** 抛出版（负控制要在副本上重跑**同款真判据**，故判据必须自带出口）。 */
function judgeHostContract(src, saOpsSrc = SA_OPS_SRC) {
    const bad = judgeStruct(src, ORG, MF, saOpsSrc);
    if (bad.length) throw new Error('宿主契约面不符：' + bad.join('；'));
    /* [v3.343.0 交棒] `!== 107` 是本档出生那一版的一次性事实,不是永久不变量;
     *   抬版即红而红的信息量只剩「数字不对」。改按下界口径(与 v3400 / v3264 / v3266 / v3296 / v3298 同族交棒);
     *   「当版总项数恰一处」由当版 frontier 套件把守(v3209 数量锁)。 */
    if (MF.extra_js.length < 107) throw new Error('extra_js 不得低于本档出生值 107,实 ' + MF.extra_js.length);
}
test('v3410 A1. **** 宿主六出口各恰一处 + 取库口 + 四处契约面 + organs 逐字副本 + extra_js 登记', () => {
    judgeHostContract(IDX);
    assert.deepEqual(judgeStruct(IDX, ORG, MF), [], judgeStruct(IDX, ORG, MF).join('；'));
    console.log('  ok 六出口各恰 1 次 / 取库口 / 契约与清空面 / organs 副本同源 / extra_js ≥ 107');
});
const KEEP_FACES = ['build', 'review', 'twoVersions', 'gatedVersions', 'spoilerGate', 'forPlayer', 'belletristic', 'edit', 'staleRefs'];
function judgeKernelFace(sa) {
    const bad = [];
    if (sa.SA_VERSION !== 3) bad.push('SA_VERSION 应 3，实 ' + sa.SA_VERSION);
    if (sa.SA_KIND !== 'story_annual') bad.push('SA_KIND 不符');
    if (sa.SECTION_KINDS.join(',') !== 'title,summary,event,change,unfinished,quote') bad.push('SECTION_KINDS 不符：' + sa.SECTION_KINDS.join(','));
    if (sa.SECTION_LABEL.event !== '关键事件' || sa.SECTION_LABEL.quote !== '精选原话') bad.push('SECTION_LABEL 不符');
    if (sa.COMPOSE_SOURCES.join(',') !== 'structure-only,polished') bad.push('COMPOSE_SOURCES 不符');
    if (sa.DRAFT_KIND !== 'story_annual_drafts') bad.push('DRAFT_KIND 不符');
    if (sa.DRAFT_SECTION_FIELDS.join(',') !== 'sections') bad.push('DRAFT_SECTION_FIELDS 不符');
    for (const f of ['compose', 'composeForPlayer', 'rebuildAffected', 'applyEdits', 'composeLine', 'normalizeDrafts', 'draftLine', 'sectionOf', 'chapterKey']) {
        if (typeof sa[f] !== 'function') bad.push('缺内核面 ' + f);
    }
    for (const f of KEEP_FACES) if (typeof sa[f] !== 'function') bad.push('既有面被动了：' + f);
    if (!Object.isFrozen(sa)) bad.push('导出面未冻结');
    return bad;
}
test('v3410 A2. **** 内核面：版本 3 + 三张常量面 + 九个新原语 + 既有面一字不动 + 冻结', () => {
    assert.deepEqual(judgeKernelFace(SA), [], judgeKernelFace(SA).join('；'));
    assert.equal(Object.keys(SA).length, 45, '导出面应 45 项（本刀为加法：31 → 45）');
    console.log('  ok SA_VERSION 3 / 常量面 / 新增 9 原语 / 既有 9 面在位 / 45 项冻结');
});
/** 内核纯度：零依赖 / 离线 / 不落盘；实现体不得读宿主 this（模块与服务端各持一份口径）。 */
test('v3410 A3. *** 内核纯度：实现体不读宿主 this；零 require / fetch / 落盘；重名标识不在宿主里复制', () => {
    /* 剥注释后判（注释里逐字写着这些词，不剥会把说明文字判成缺陷）。 */
    const impl = SA_SRC.split(NL).filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l) && l.indexOf('globalThis') < 0).join(NL);
    assert.ok(!/(^|[^\w.$])this[.)\s=]/.test(impl), '内核实现体不得读宿主 this');
    for (const banned of ['require(', 'fetch(', 'localStorage', 'indexedDB', 'XMLHttpRequest']) {
        assert.ok(SA_SRC.indexOf(banned) < 0, '内核不得出现 ' + banned + '（零依赖 / 离线 / 不落盘）');
    }
    /* 模块内标识不得在宿主里另写一份（两份实现 = 改一处漏一处）。 */
    for (const k of ['FACT_FIELDS', 'DRAFT_FIELDS', 'SECTION_LABEL[', 'COMPOSE_SOURCES', 'SECTION_KINDS', 'DRAFT_SECTION_FIELDS', 'chapterKey', 'sectionOf']) {
        assert.equal(IDX.split(k).length - 1, 0, '宿主里重复出现了模块内标识 ' + k);
    }
    console.log('  ok 不读宿主 this / 零依赖零写 / 八个内核标识未在宿主里复制');
});
/* ══════════════ B. 真跑（内核，纯函数） ══════════════ */
const REF = { project: 'p', volume: 'v', chapter: '1' };
const PAYLOAD = {
    chapters: [{
        ref: REF, title: '开篇', floorFrom: 1, floorTo: 9, summary: '甲推门进来。',
        events: [{ floor: 3, text: '她推开门', chars: ['甲'] }, { floor: 9, text: '乙在暗处看着', chars: ['乙'] }],
        changes: [{ char: '乙', from: '陌生', to: '敌意', floor: 9 }],
        open: [{ key: 'o1', text: '乙到底要干什么', floor: 9 }],
        quotes: [{ floor: 3, text: '进来吧', speaker: '甲' }],
    }],
};
const revOf = (sa) => sa.review('1', PAYLOAD, { evidences: {} });
function judgeCompose(sa) {
    /* 原语：段 = 可读文本 + **一个**证据位；章身份串只有一处拼法。 */
    const so = sa.sectionOf('event', '  甲推门 ', 'r1', 3, ['甲'], 400);
    if (!so || so.text !== '甲推门' || so.evidenceRef !== 'r1' || so.floor !== 3) throw new Error('段原语不符：' + JSON.stringify(so));
    if (so.label !== '关键事件' || so.chars.join(',') !== '甲') throw new Error('段标签 / 在场角色不符');
    if (sa.sectionOf('event', '   ', '', 0, [], 400) !== null) throw new Error('空文本不得造出空段');
    if (sa.chapterKey({ project: 'p', volume: 'v', chapter: 'c' }) !== 'p/v/c') throw new Error('章身份串拼法不符');
    if (sa.chapterKey({}) !== '//') throw new Error('空 ref 的章身份串不符');
    const d = sa.compose(revOf(sa));
    if (d.ok !== true) throw new Error('成稿未成立：' + JSON.stringify(d.why));
    if (d.sections.length !== 7) throw new Error('段数应 7（题 / 述 / 2 事件 / 变化 / 未了 / 原话），实 ' + d.sections.length);
    const kinds = d.sections.map((s) => s.kind).join(',');
    if (kinds !== 'title,summary,event,event,change,unfinished,quote') throw new Error('段落类序不符：' + kinds);
    const refs = d.sections.map((s) => s.evidenceRef).join('|');
    if (refs !== '||ch1#event@3|ch1#event@9|ch1#change@9|ch1#unfinished@9|ch1#quote@3') {
        throw new Error('证据位不符（这是逐段回源的凭证）：' + refs);
    }
    if (d.paragraphCount !== 7 || d.chars !== d.text.length || !d.chars) throw new Error('段数 / 字数未与正文对齐');
    /* 成稿是**可读编排**（分节标题 + 逐段一行），不是把结构再抄一遍。 */
    for (const need of ['# 开篇', '甲推门进来。', '## 关键事件', '- 她推开门', '- 乙在暗处看着',
        '## 人物变化', '- 乙：陌生 → 敌意', '## 未了事项', '- 乙到底要干什么', '## 精选原话', '- 甲：进来吧']) {
        if (d.text.indexOf(need) < 0) throw new Error('成稿正文缺「' + need + '」：' + JSON.stringify(d.text));
    }
    if (d.evidenceBound !== 5 || d.evidenceTotal !== 5) throw new Error('回源读数应 5/5，实 ' + d.evidenceBound + '/' + d.evidenceTotal);
    if (d.evidenceMissing !== 0 || d.evidenceUndecided !== 0) throw new Error('不该有缺证 / 未判读数');
    if (d.memoryUntouched !== true || d.writesNothing !== true) throw new Error('成稿面必须声明零写');
    if (!d.ref || d.ref.chapter !== '1') throw new Error('成稿未回填章身份');
}
test('v3410 B1. ** 真成稿：7 段逐段带证据位 + 可读编排 + 回源读数 5/5 + 原语与章身份串', () => {
    judgeCompose(SA);
    console.log('  ok 7 段 / 5 段带号 / 回源 5 / 正文含分节标题与逐段一行 / 零写声明');
});
function judgeStyle(sa) {
    const rev = revOf(sa);
    if (sa.COMPOSE_SOURCES.join(',') !== 'structure-only,polished') throw new Error('来源两态词表不符');
    /* ① 未给真模型通道 ⇒ structure-only，且**不报文风通过**（验收原文点名那一格）。 */
    const base = sa.compose(rev);
    if (base.source !== 'structure-only' || base.modelUsed !== false || base.styleChecked !== false) {
        throw new Error('未调模型却报了通过：' + [base.source, base.modelUsed, base.styleChecked].join('/'));
    }
    if (base.styleNote.indexOf('未调用真实模型') < 0 || base.styleNote.indexOf('不报文风通过') < 0) {
        throw new Error('未调模型时 styleNote 未逐字写明：' + base.styleNote);
    }
    /* ② 真模型通道 + 调用方回报文风通过 ⇒ polished + styleChecked。 */
    const ok = sa.compose(rev, { polish: () => ({ text: 'X改后', styleOk: true }) });
    if (ok.source !== 'polished' || ok.modelUsed !== true || ok.styleChecked !== true) throw new Error('过了模型却未报通过');
    if (ok.styleNote.indexOf('已过真实模型') < 0 || ok.styleNote.indexOf('文风通过') < 0) throw new Error('styleNote 不符：' + ok.styleNote);
    if (ok.text !== 'X改后' || ok.chars !== 3) throw new Error('成稿正文未换成模型产物');
    /* ③ ★ 过了模型但**未回报**结论 ⇒ 仍不报通过。 */
    const noVerdict = sa.compose(rev, { polish: () => ({ text: 'Y改后' }) });
    if (noVerdict.modelUsed !== true || noVerdict.styleChecked !== false) throw new Error('未回报结论却报了文风通过');
    if (noVerdict.styleNote.indexOf('不报通过') < 0) throw new Error('未回报结论时 styleNote 未写明不报通过：' + noVerdict.styleNote);
    /* ④ 文本无变化 / 抛错 ⇒ 退回 structure-only 并具名（不冒认「过了模型」）。 */
    for (const pair of [['同值', (x) => x.text], ['空串', () => ''], ['抛错', () => { throw new Error('x'); }]]) {
        const r = sa.compose(rev, { polish: pair[1] });
        if (r.source !== 'structure-only' || r.modelUsed !== false) throw new Error(pair[0] + '：文本未变 / 抛错却报过了模型');
        if (r.why.indexOf('polish-no-change') < 0) throw new Error(pair[0] + '：未具名 polish-no-change：' + JSON.stringify(r.why));
    }
}
test('v3410 B2. **** 未调用真实模型只报结构成稿：四态实测（含「过了模型未回报也不报通过」）', () => {
    judgeStyle(SA);
    console.log('  ok 未给通道 ⇒ 结构成稿 / 给了+真变 ⇒ polished / 未回报 ⇒ styleChecked false / 无变化与抛错 ⇒ 退回并具名');
});
function judgeThreeStates(sa) {
    const mk = (els, ev) => ({ ok: true, ref: REF, title: 't', summary: '', elements: els, evidence: ev });
    const evEls = (r) => ({ events: [{ floor: 3, text: 'e', chars: ['A'], evidenceRef: r }], changes: [], unfinished: [], quotes: [] });
    /* 证据面**缺席** ⇒ 未判（不是缺证）：三条读数不许压成一条。 */
    const und = sa.compose(mk(evEls('ch1#event@3'), []));
    if (und.evidenceUndecided !== 1 || und.evidenceMissing !== 0 || und.evidenceBound !== 0 || und.evidenceTotal !== 1) {
        throw new Error('证据面缺席应报「未判 1」而不是「缺证」：' + JSON.stringify([und.evidenceBound, und.evidenceMissing, und.evidenceUndecided, und.evidenceTotal]));
    }
    /* 段有号、证据面里对不上 ⇒ 缺证。 */
    const miss = sa.compose(mk(evEls('ch1#event@3'), [{ ref: 'other' }]));
    if (miss.evidenceMissing !== 1 || miss.evidenceUndecided !== 0 || miss.evidenceBound !== 0) throw new Error('对不上应报缺证');
    /* 对得上 ⇒ 回源。 */
    const bound = sa.compose(mk(evEls('ch1#event@3'), [{ ref: 'ch1#event@3' }]));
    if (bound.evidenceBound !== 1 || bound.evidenceTotal !== 1) throw new Error('对得上应报回源');
    if (bound.text.indexOf('- e') < 0) throw new Error('单事件章的可读编排不符');
    /* 无回顾 / 零段各不相同形。 */
    const nonr = sa.compose(null);
    if (nonr.ok !== false || nonr.why.indexOf('no-review') < 0) throw new Error('无回顾应如实报 no-review');
    const empty = sa.compose({ ok: true, ref: {}, title: '', summary: '', elements: {}, evidence: [] });
    if (empty.ok !== false || empty.why.indexOf('no-sections') < 0) throw new Error('零段应报 no-sections 而不是交一篇空成稿');
}
test('v3410 B3. *** 证据三态分开（回源 / 缺证 / 未判）+ 无回顾与零段各自具名', () => {
    judgeThreeStates(SA);
    console.log('  ok 未判 1 / 缺证 1 / 回源 1 三态不同形 / no-review 与 no-sections 分开');
});
function judgePlayer(sa) {
    const rev = revOf(sa);
    const allow = { resolve: () => ({ decision: 'allow', basis: 'known' }) };
    const p = sa.composeForPlayer(rev, { gate: allow });
    if (p.ok !== true || p.playerVersion !== 'spoiler-free') throw new Error('玩家版未成立：' + JSON.stringify(p.reason || p.why));
    if (p.sections.length !== 7) throw new Error('玩家版段数应 7，实 ' + p.sections.length);
    if (p.futureFactsLeaked !== 0 || p.chaptersRead !== 1) throw new Error('后续事实泄漏读数未如实外供：' + [p.futureFactsLeaked, p.chaptersRead].join('/'));
    if (p.leakedChars.length !== 0) throw new Error('名册未给时不该报泄漏：' + JSON.stringify(p.leakedChars));
    if (p.note.indexOf('保留 7 / 遮蔽 0') < 0) throw new Error('玩家版说明未报裁剪读数：' + p.note);
    /* 去剧透未成立 ⇒ 不接作者版（三态各自具名、playerVersion 恒 null）。 */
    const noGate = sa.composeForPlayer(rev, {});
    if (noGate.ok !== false || noGate.reason !== 'knowledge-face-absent') throw new Error('未给可知性面应报 knowledge-face-absent，实 ' + noGate.reason);
    const over = sa.composeForPlayer(rev, { gate: { resolve: () => ({ decision: 'withhold', basis: 'unknown' }) } });
    if (over.ok !== false || over.reason !== 'over-redacted' || over.sections.length !== 0) throw new Error('整篇裁空应报 over-redacted 且零段');
    for (const bad of [noGate, over]) {
        if (bad.playerVersion !== null) throw new Error('不成立时 playerVersion 必须为 null（不得回退作者版）');
        if (bad.note.indexOf('不接作者版') < 0) throw new Error('不成立时未声明不接作者版：' + bad.note);
    }
    /* 泄漏扫描：玩家版正文里出现名册里**未放行**的角色名 ⇒ 逐条具名。 */
    const leakRev = sa.review('1', { chapters: [{ ref: REF, title: 't', floorFrom: 1, floorTo: 3, events: [{ floor: 1, text: '甲看见乙走过', chars: ['甲'] }] }] }, { evidences: {} });
    const leaked = sa.composeForPlayer(leakRev, { gate: allow, knownChars: ['乙'] });
    if (leaked.leakedChars.join(',') !== '乙' || leaked.why.indexOf('leaked-chars') < 0) throw new Error('泄漏未逐条具名：' + JSON.stringify(leaked.leakedChars));
    const clean = sa.composeForPlayer(leakRev, { gate: allow, knownChars: ['丙'] });
    if (clean.leakedChars.length !== 0) throw new Error('名册不含该名时不得报泄漏');
}
test('v3410 B4. *** 玩家版成稿：不接作者版 + 后续事实零泄漏 + 泄漏逐条具名', () => {
    judgePlayer(SA);
    console.log('  ok 保留 7 / 未给面 ⇒ knowledge-face-absent / 裁空 ⇒ over-redacted / 泄漏具名 乙');
});
function judgeRebuild(sa) {
    const drafts = [1, 2, 3, 9].map((c) => ({ ref: { project: 'p', volume: 'v', chapter: String(c) } }));
    const stale = {
        stale: 1, missingChapters: 0,
        staleRefs: [{ chapter: 'p/v/1', ref: 'ch1#event@3', why: 'hash-changed' }],
        all: [{ chapter: 'p/v/2', verdict: 'fresh' }, { chapter: 'p/v/3', verdict: 'missing' }],
    };
    const rb = sa.rebuildAffected(drafts, stale);
    if (rb.ok !== true) throw new Error('重建未成立：' + JSON.stringify(rb.why));
    if (rb.rebuilt.map((x) => x.chapter).join(',') !== 'p/v/1') throw new Error('受影响章未具名');
    if (rb.kept.map((x) => x.chapter).join(',') !== 'p/v/2') throw new Error('已判 fresh 的章未进「未变」');
    if (rb.gone.map((x) => x.chapter).join(',') !== 'p/v/3') throw new Error('不在新载荷里的章未进「整章过期」');
    if (rb.untouched.map((x) => x.chapter).join(',') !== 'p/v/9') throw new Error('过期读数没提到的章应进「未判」而不是假装 fresh');
    if (rb.wholeBookRebuilt !== false) throw new Error('本面实现的是按章重建，wholeBookRebuilt 必须恒 false');
    if (rb.rebuilt[0].refs.length !== 1 || rb.rebuilt[0].refs[0].ref !== 'ch1#event@3') throw new Error('受影响章未逐条报出过期段');
    if (rb.note.indexOf('不做整本重写') < 0) throw new Error('诊断未声明不做整本重写：' + rb.note);
    if (rb.drafts.length !== 4) throw new Error('草稿应按原序原样外供（本面不改草稿）');
    /* 判不了的必须具名，不猜。 */
    const un = sa.rebuildAffected([{ ref: REF }], { stale: 2, missingChapters: 2, staleRefs: [], all: [] });
    if (un.why.indexOf('missing-chapter-unnamed') < 0) throw new Error('只报条数不具名时应如实具名');
    if (sa.rebuildAffected([], null).why.indexOf('no-stale-read') < 0) throw new Error('无过期读数应报 no-stale-read');
    if (sa.rebuildAffected(null, {}).why.indexOf('no-drafts') < 0) throw new Error('无草稿应报 no-drafts');
    if (sa.rebuildAffected([], { stale: 1 }).why.indexOf('stale-face-absent') < 0) throw new Error('过期面缺席应报 stale-face-absent');
    if (sa.rebuildAffected([{ title: 'x' }], { stale: 0, missingChapters: 0, staleRefs: [], all: [] }).why.indexOf('draft-without-ref') < 0) {
        throw new Error('无章身份的草稿应如实报 draft-without-ref');
    }
    const empty = sa.rebuildAffected([], { stale: 0, missingChapters: 0, staleRefs: [], all: [] });
    if (empty.ok !== true || empty.why.length !== 0) throw new Error('空册 + 空过期读数应成立且无 why');
}
test('v3410 B5. **** 按章重建：四格分开 + 不做整本重写 + 判不了的如实具名', () => {
    judgeRebuild(SA);
    console.log('  ok 受影响 1 / 未变 1 / 整章过期 1 / 未判 1 / wholeBookRebuilt false / 五种判不了各自具名');
});
function judgeEdits(sa) {
    /* ① 段证据位不得被编辑掉 —— 「改正文不篡改记忆」的**凭证**。 */
    const a = sa.applyEdits({ title: 'a', sections: [{ evidenceRef: 'r1' }, { evidenceRef: 'r2' }] }, { sections: [{ evidenceRef: 'r1' }] });
    if (a.evidenceIntact !== false) throw new Error('抹掉证据位却报完好');
    const dropped = a.rejected.filter((x) => x.why === 'evidence-dropped');
    if (dropped.length !== 1 || dropped[0].ref !== 'r2') throw new Error('未逐条具名被抹掉的那一条：' + JSON.stringify(a.rejected));
    if (a.memoryUntouched !== true || a.writesNothing !== true) throw new Error('编辑面必须声明零写');
    if (a.reason !== 'edited') throw new Error('编辑结果读数不符：' + a.reason);
    /* ② 只改正文（补丁只动 title）⇒ 证据位一条不少。 */
    const keep = sa.applyEdits({ title: 'a', sections: [{ evidenceRef: 'r1' }, { evidenceRef: 'r2' }] }, { title: 'b' });
    if (keep.evidenceIntact !== true || keep.changed.join(',') !== 'title') throw new Error('正常改标题不该动证据位');
    /* ③ 事实位**双向**过滤：入参草稿自己夹带的那一份也不得流传。 */
    const d = sa.applyEdits({ title: 'a', state: { x: 1 }, sections: [] }, { title: 'b' });
    const rej = d.rejected.filter((x) => x.why === 'draft-only');
    if (rej.length !== 1 || rej[0].key !== 'state') throw new Error('入参草稿夹带的事实位未登记：' + JSON.stringify(d.rejected));
    if (d.state.state !== undefined) throw new Error('夹带的事实位原样流传进了新草稿（记忆保护在 draft 侧只是一句话）');
    if (d.changed.join(',') !== 'title') throw new Error('编辑未生效');
    /* 补丁侧：事实位拒 + 未登记字段拒（不静默丢弃）。 */
    const p = sa.applyEdits({ title: 'a' }, { facts: [1], nope: 1 });
    const whys = p.rejected.map((x) => x.key + ':' + x.why).join(',');
    if (whys !== 'facts:draft-only,nope:unknown-field') throw new Error('补丁侧处置不符：' + whys);
    if (p.reason !== 'rejected-only') throw new Error('全是拒绝时的读数不符：' + p.reason);
    /* ④ 白名单与草稿册口径必须一致（两处不同 = 「编辑得了的存不下来」）。 */
    const allowed = sa.DRAFT_FIELDS.concat(sa.DRAFT_SECTION_FIELDS);
    if (allowed.indexOf('sections') < 0) throw new Error('DRAFT_SECTION_FIELDS 未把 sections 纳入白名单');
    if (!sa.FACT_FIELDS.every((f) => allowed.indexOf(f) < 0)) throw new Error('事实位混进了草稿白名单');
    if (sa.FACT_FIELDS.indexOf('evidenceRef') < 0 || sa.FACT_FIELDS.indexOf('state') < 0) throw new Error('FACT_FIELDS 面被动了');
}
test('v3410 B6. **** 改正文不篡改记忆的可机检形态：双向过滤事实位 + 证据位被抹逐条具名', () => {
    judgeEdits(SA);
    console.log('  ok 证据位掉落具名 r2 / 补丁与草稿两侧事实位皆拒 / 未登记字段拒 / 白名单一致');
});
function judgeDraftBook(sa) {
    const nd = sa.normalizeDrafts([{
        ref: { chapter: '1' }, title: 'x', state: { a: 1 }, parts: ['丢'],
        sections: [{ kind: 'event', text: 't', evidenceRef: 'r1', floor: 9 }],
    }]);
    if (nd.ok !== true || nd.drafts.length !== 1) throw new Error('归一化未成立');
    const row = nd.drafts[0];
    const keys = Object.keys(row);
    if (keys.indexOf('state') >= 0 || keys.indexOf('parts') >= 0) throw new Error('事实位 / 未登记字段混进了草稿册：' + keys.join(','));
    if (keys.indexOf('chapter') < 0 || keys.indexOf('ref') < 0) throw new Error('草稿册未回填章身份：' + keys.join(','));
    const sk = Object.keys(row.sections[0]).sort().join(',');
    if (sk !== 'evidenceRef,kind,text') throw new Error('段落三键不符（floor 等不该进草稿册）：' + sk);
    /* 如实报丢弃数（静默截断会让「没存下来」与「本来就没有」同形）。 */
    const drop = sa.normalizeDrafts([{ ref: { chapter: '1' } }, null]);
    if (drop.drops !== 1 || drop.drafts.length !== 1) throw new Error('丢弃数未如实报：' + JSON.stringify([drop.drops, drop.drafts.length]));
    if (sa.normalizeDrafts({}).why.indexOf('no-drafts') < 0) throw new Error('无册应报 no-drafts');
    const empty = sa.normalizeDrafts([]);
    if (empty.ok !== false || empty.why.indexOf('no-usable-drafts') < 0) throw new Error('空册不算已保存');
    /* 诊断行：四态 / 三态各自不同形。 */
    const cl0 = sa.composeLine(null);
    if (cl0 !== '尚未生成过（成稿面 · 逐段回源 · 未调模型只报结构成稿）') throw new Error('未生成过与生成了零段不同形：' + cl0);
    if (sa.composeLine({ blocked: true, reason: 'over-redacted' }).indexOf('玩家版被挡') < 0) throw new Error('被挡态未具名');
    const line = sa.composeLine({ modelUsed: false, paragraphCount: 6, evidenceBound: 5, evidenceUndecided: 2 });
    if (line.indexOf('结构成稿(未过模型)') < 0 || line.indexOf('段 6') < 0 || line.indexOf('回源 5') < 0 || line.indexOf('证据面未判 2') < 0) {
        throw new Error('结构成稿诊断行不符：' + line);
    }
    if (sa.composeLine({ modelUsed: true, styleChecked: true, paragraphCount: 3 }).indexOf('文风通过') < 0) throw new Error('过了模型的诊断行未报通过');
    if (sa.draftLine(null) !== '尚未保存过草稿册（成稿可编辑 · 事实位一律不收）') throw new Error('未存过与存了零条不同形');
    if (sa.draftLine(sa.normalizeDrafts([])).indexOf('空册不算已保存') < 0) throw new Error('空册诊断行未标注');
    if (sa.draftLine(sa.normalizeDrafts([{ ref: { chapter: '1' } }, null])).indexOf('丢弃 1 条') < 0) throw new Error('丢弃数未进诊断行');
}
test('v3410 B7. ** 草稿册：只收白名单 + 丢弃数如实 + 诊断行四态 / 三态不同形', () => {
    judgeDraftBook(SA);
    console.log('  ok 段落三键 / 事实位与未登记字段不入册 / 丢弃 1 条 / 成稿行四态与草稿行三态');
});
/* ══════════════ C. 宿主出口（真方法体 + 真内核） ══════════════ */
function extractModuleMethod(source, funcMarker) {
    const start = source.indexOf(funcMarker);
    if (start < 0) return null;
    const bodyStart = start + funcMarker.length - 1;
    if (source[bodyStart] !== '{') return null;
    let depth = 0, end = -1;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) return null;
    let body = source.slice(bodyStart + 1, end);
    body = body.replace(/\bengine\./g, 'this.');
    const asyncP = funcMarker.startsWith('async ') ? 'async ' : '';
    const nm = funcMarker.match(/(?:async\s+)?function\s+(\w+)\s*\(engine(?:,\s*(.*?))?\)\s*\{/);
    if (!nm) return null;
    const params = nm[2] !== undefined ? nm[2] : '';
    return asyncP + nm[1] + '(' + params + ') {' + body + '}';
}

function sliceMember(src, header) {
    const at = src.indexOf(header);
    if (at < 0) return null;
    const open = src.indexOf('{', at + header.length - 1);
    if (open < 0) return null;
    let d = 0;
    for (let i = open; i < src.length; i++) {
        const c = src[i];
        if (c === '"' || c === "'" || c === '`') {
            let k = i + 1;
            while (k < src.length) {
                if (src[k] === BSL) { k += 2; continue; }
                if (src[k] === c) { k++; break; }
                if (src[k] === NL && c !== '`') break;
                k++;
            }
            i = k - 1;
            continue;
        }
        if (c === '{') d++;
        else if (c === '}') { d--; if (d === 0) return src.slice(at, i + 1); }
    }
    return null;
}
const LIB_FNS = ['function _moduleLib(getGlobal, fileName) {', 'function _storyAnnualLib() {'];
const METH_FNS = HOST_METHODS;
const ALLOW_GATE = () => ({ resolve: () => ({ decision: 'allow', basis: 'known' }) });
function mkHost(src, gateFn, saOpsSrc = SA_OPS_SRC, win = { LonShaStoryAnnual: SA }) {
    const idx = src || IDX;
    const libs = LIB_FNS.map((h) => sliceMember(idx, h));
    const meths = METH_FNS.map((h) => {
        const fnName = h.split('(')[0];
        const m = saOpsSrc.match(new RegExp('(?:async\\s+)?function\\s+' + fnName + '\\s*\\(engine(?:,\\s*(.*?))?\\)\\s*\\{'));
        if (m) {
            return extractModuleMethod(saOpsSrc, m[0]);
        }
        return sliceMember(idx, h);
    });
    const absentFn = extractModuleMethod(saOpsSrc, 'function _storyAnnualAbsent(engine, why) {');
    if (absentFn) meths.push(absentFn);
    const miss = LIB_FNS.filter((h, i) => !libs[i]).concat(METH_FNS.filter((h, i) => !meths[i]));
    if (miss.length) throw new Error('切片缺失：' + miss.join(' / '));
    const code = libs.join(NL) + NL + 'return ({ ' + meths.join(',' + NL) + ' });';
    const eng = new Function('errLog', 'window', code)(() => {}, win);
    return Object.assign(eng, { _o9Gate: gateFn || ALLOW_GATE, _annualDrafts: null });
}
function judgeHostCompose(src, saOpsSrc = SA_OPS_SRC) {
    const h = mkHost(src, null, saOpsSrc);
    const r = h.storyAnnualCompose(revOf(SA));
    if (r.ok !== true || r.source !== 'structure-only' || r.sections.length !== 7) throw new Error('宿主成稿出口不符');
    if (r.evidenceBound !== 5) throw new Error('宿主成稿未外供回源读数');
    if (h.storyAnnualComposeLine().indexOf('结构成稿(未过模型)') < 0) throw new Error('诊断行未反映成稿读数');
    const p = h.storyAnnualComposeForPlayer(revOf(SA));
    if (p.ok !== true || p.playerVersion !== 'spoiler-free' || p.futureFactsLeaked !== 0 || p.chaptersRead !== 1) {
        throw new Error('宿主玩家版出口不符：' + JSON.stringify(p.reason || p.why));
    }
}
test('v3410 C1. *** 宿主成稿出口：真方法体 + 真内核（成稿 / 玩家版 / 诊断行同源）', () => {
    judgeHostCompose(IDX);
    console.log('  ok 结构成稿 7 段 / 回源 5 / 玩家版 spoiler-free / 诊断行同源');
});
function judgeHostDrafts(src, saOpsSrc = SA_OPS_SRC) {
    const h = mkHost(src, null, saOpsSrc);
    const w = h.storyAnnualDrafts([{
        ref: { project: 'p', volume: 'v', chapter: '1' }, title: 'x',
        sections: [{ kind: 'event', text: 't', evidenceRef: 'r1' }],
    }]);
    if (w.ok !== true || w.drafts.length !== 1 || w.persisted !== true) throw new Error('落笔口未持久化');
    if (w.drafts.map((d) => d.chapter).join(',') !== 'p/v/1') throw new Error('草稿章身份不符');
    const back = h.storyAnnualDrafts();
    if (back.ok !== true || back.drafts.length !== 1 || back.persisted !== true) throw new Error('读回未成立（重开对话读不回来）');
    const rb = h.storyAnnualRebuild(null, {
        stale: 1, missingChapters: 0,
        staleRefs: [{ chapter: 'p/v/1', ref: 'ch1#event@3', why: 'hash-changed' }], all: [],
    });
    if (rb.ok !== true || rb.rebuilt.map((x) => x.chapter).join(',') !== 'p/v/1') throw new Error('重建未缺省取本会话已存草稿');
    if (rb.wholeBookRebuilt !== false) throw new Error('宿主重建出口未守「不做整本重写」');
    if (h.storyAnnualComposeLine().indexOf('草稿 1 章') < 0) throw new Error('诊断行未报草稿数');
}
test('v3410 C2. *** 宿主草稿册：落笔即持久化 + 读回 + 重建缺省取已存 + 诊断行报章数', () => {
    judgeHostDrafts(IDX);
    console.log('  ok persisted true / 读回 1 章 / 重建取已存 / 诊断行报草稿 1 章');
});
function judgeHostEdits(src, saOpsSrc = SA_OPS_SRC) {
    const h = mkHost(src, null, saOpsSrc);
    const e = h.storyAnnualApplyEdits({ title: 'a', sections: [{ evidenceRef: 'r1' }, { evidenceRef: 'r2' }] }, { sections: [{ evidenceRef: 'r1' }] });
    if (e.evidenceIntact !== false || e.rejected.filter((x) => x.ref === 'r2').length !== 1) throw new Error('宿主编辑出口未报证据位被抹');
    if (h.storyAnnualComposeLine().indexOf('段证据位被编辑掉') < 0) throw new Error('诊断行未报证据位被编辑掉');
}
test('v3410 C3. ** 宿主编辑出口：证据位被抹必须进诊断行（可机检形态落到人读面）', () => {
    judgeHostEdits(IDX);
    console.log('  ok 证据位掉落 / 诊断行报「段证据位被编辑掉」');
});
function judgeHostPlayerGate(src, saOpsSrc = SA_OPS_SRC) {
    /* 未给 opts.gate ⇒ 自动装配 _o9Gate（与 storyAnnualForPlayer 同一判决口，不建第二份）。 */
    const over = mkHost(src, () => ({ resolve: () => ({ decision: 'withhold', basis: 'unknown' }) }), saOpsSrc).storyAnnualComposeForPlayer(revOf(SA));
    if (over.ok !== false || over.reason !== 'over-redacted') throw new Error('装配口未把可知性面接上');
    const h2 = mkHost(src, () => { throw new Error('absent'); });
    const none = h2.storyAnnualComposeForPlayer(revOf(SA));
    if (none.ok !== false || none.reason !== 'knowledge-face-absent') throw new Error('装配失败应如实报 knowledge-face-absent');
    if (h2.storyAnnualComposeLine().indexOf('玩家版被挡(over-redacted)') < 0 && h2.storyAnnualComposeLine().indexOf('玩家版被挡(knowledge-face-absent)') < 0) {
        throw new Error('诊断行未报被挡理由：' + h2.storyAnnualComposeLine());
    }
    /* 显式给 gate ⇒ 不覆盖调用方的判决面。 */
    const h3 = mkHost(src, () => { throw new Error('不该被调用'); });
    const ok = h3.storyAnnualComposeForPlayer(revOf(SA), { gate: ALLOW_GATE() });
    if (ok.ok !== true) throw new Error('调用方给的 gate 被覆盖');
}
test('v3410 C4. *** 宿主玩家版闸：自动装配同一判决口 + 失败如实 + 不覆盖调用方面', () => {
    judgeHostPlayerGate(IDX);
    console.log('  ok 装配 withhold ⇒ over-redacted / 装配抛错 ⇒ knowledge-face-absent / 显式 gate 不被覆盖');
});
/** 模块缺席 ⇒ 同键降级（不是抛、不是 undefined）：宿主不能因为库没加载就把出口变成崩溃。 */
function judgeAbsentDegrade(src, saOpsSrc = SA_OPS_SRC) {
    const idx = src || IDX;
    if (typeof mkHost(idx).storyAnnualCompose !== 'function') throw new Error('切片未取到出口');
    /* 换一个「库缺席」的宿主：window 上不挂 LonShaStoryAnnual。 */
    const abs = mkHost(idx, ALLOW_GATE, saOpsSrc, {});
    const d = abs.storyAnnualCompose(revOf(SA));
    if (d.ok !== false || d.why.indexOf('module-absent') < 0) throw new Error('内核缺席未同键降级（why=' + JSON.stringify(d.why) + '）');
    const w = abs.storyAnnualDrafts([{ ref: { chapter: '1' } }]);
    if (w.persisted !== false || w.why.indexOf('module-absent') < 0) throw new Error('草稿册缺席降级未标 persisted:false');
    const rb = abs.storyAnnualRebuild(null, { stale: 1 });
    if (rb.ok !== false || rb.why.indexOf('module-absent') < 0) throw new Error('重建缺席未同键降级');
    const ae = abs.storyAnnualApplyEdits({ title: 'a' }, { title: 'b' });
    if (ae.ok !== false || ae.reason !== 'module-absent') throw new Error('编辑缺席未同键降级');
    const p = abs.storyAnnualComposeForPlayer(revOf(SA));
    if (p.ok !== false || p.reason !== 'module-absent') throw new Error('玩家版缺席未同键降级');
    if (abs.storyAnnualComposeLine().indexOf('成稿模块未加载') < 0) throw new Error('诊断行缺席态未具名');
}
test('v3410 C5. ** 内核缺席 ⇒ 五个出口同键降级（不抛 / 不 undefined）+ 诊断行具名', () => {
    judgeAbsentDegrade(IDX);
    console.log('  ok 五出口 module-absent 同键降级 / 诊断行报「成稿模块未加载」');
});
/* ══════════════ D. 负控制（真源码破坏 → 副本重跑同款判据 → 必须现形） ══════════════ */
function expectRed(fn, label) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    if (!threw) throw new Error(label + '：破坏后判据未转红（负控制空转）');
}
test('v3410 D1. ★★ 破坏「真模型通道闸」⇒ 风格面判据 B2 必须转红', () => {
    const bad = loadIIFE(KIT.breakOnce(SA_SRC, ANCHORS.kPolishGate, String.raw`if (false) {`, 'kPolishGate'), 'LonShaStoryAnnual');
    expectRed(() => judgeStyle(bad), 'kPolishGate');
    judgeStyle(SA);
    console.log('  ok 通道闸被摘 ⇒ 过了模型与没过同形被照出；原版阳性通过');
});
test('v3410 D2. ★★ 破坏「证据面未判」⇒ 三态判据 B3 必须转红', () => {
    const bad = loadIIFE(KIT.breakOnce(SA_SRC, ANCHORS.kEvidenceUndecided, String.raw`if (false) {}`, 'kEvidenceUndecided'), 'LonShaStoryAnnual');
    expectRed(() => judgeThreeStates(bad), 'kEvidenceUndecided');
    judgeThreeStates(SA);
    console.log('  ok 未判被压成缺证 ⇒ 转红；原版阳性通过');
});
test('v3410 D3. ★★ 破坏「玩家版闸」⇒ 不接作者版判据 B4 必须转红', () => {
    const bad = loadIIFE(KIT.breakOnce(SA_SRC, ANCHORS.kPlayerGate, String.raw`if (false) return bad('knowledge-face-absent');`, 'kPlayerGate'), 'LonShaStoryAnnual');
    expectRed(() => judgePlayer(bad), 'kPlayerGate');
    judgePlayer(SA);
    console.log('  ok 去剧透未成立时回退作者版被照出；原版阳性通过');
});
test('v3410 D4. ★★ 破坏「整章过期」⇒ 按章重建判据 B5 必须转红', () => {
    const bad = loadIIFE(KIT.breakOnce(SA_SRC, ANCHORS.kGone, String.raw`if (false) {`, 'kGone'), 'LonShaStoryAnnual');
    expectRed(() => judgeRebuild(bad), 'kGone');
    judgeRebuild(SA);
    console.log('  ok 过期被读成未判 ⇒ 转红；原版阳性通过');
});
test('v3410 D5. ★★ 破坏「入参草稿事实位登记」⇒ 双向过滤判据 B6 必须转红', () => {
    const bad = loadIIFE(KIT.breakOnce(SA_SRC, ANCHORS.kDraftFact, String.raw`void 0;`, 'kDraftFact'), 'LonShaStoryAnnual');
    expectRed(() => judgeEdits(bad), 'kDraftFact');
    judgeEdits(SA);
    console.log('  ok 夹带的事实位不被登记被照出；原版阳性通过');
});
test('v3410 D6. ★★ 破坏「段证据位不得被抹」⇒ 凭证判据 B6 必须转红', () => {
    const bad = loadIIFE(KIT.breakOnce(SA_SRC, ANCHORS.kEvidenceKept, String.raw`if (false) {`, 'kEvidenceKept'), 'LonShaStoryAnnual');
    expectRed(() => judgeEdits(bad), 'kEvidenceKept');
    judgeEdits(SA);
    console.log('  ok 抹掉回源凭证却不报被照出；原版阳性通过');
});
test('v3410 D7. ★★ 破坏「宿主存档契约面」⇒ 宿主契约判据 A1 必须转红', () => {
    const badIdx = KIT.breakOnce(IDX, ANCHORS.hDraftContract, String.raw`annualDrafts: null,`, 'hDraftContract');
    expectRed(() => judgeHostContract(badIdx), 'hDraftContract');
    judgeHostContract(IDX);
    console.log('  ok 存档契约面被换成常量 ⇒ 契约面转红；原版阳性通过');
});
test('v3410 D8. ★★ 破坏「落笔即持久化」⇒ 宿主草稿册判据 C2 必须转红', () => {
    const badSrc = KIT.breakOnce(SA_OPS_SRC, ANCHORS.hDraftPersist, String.raw`void 0;`, 'hDraftPersist');
    expectRed(() => judgeHostDrafts(IDX, badSrc), 'hDraftPersist');
    judgeHostDrafts(IDX);
    console.log('  ok 写了不落地 ⇒ 重开对话读不回来被照出；原版阳性通过');
});
test('v3410 D9. ★★ 破坏「可知性自动装配」⇒ 宿主契约判据 A1 必须转红', () => {
    const badSrc = KIT.breakOnce(SA_OPS_SRC, ANCHORS.hGateAuto, String.raw`void 0;`, 'hGateAuto');
    expectRed(() => judgeHostContract(IDX, badSrc), 'hGateAuto');
    judgeHostContract(IDX);
    console.log('  ok 装配口被抹 ⇒ 结构面照出（真实会话里无人手动装配）；原版阳性通过');
});
/* ══════════════ F. 锚点自证 ══════════════ */
test('v3410 F1. ** H5 判据纯度：破坏锚点在**本档源码**里各恰中 1 次', () => {
    for (const k of Object.keys(ANCHORS)) {
        const n = SELF.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '锚点 ' + k + ' 在本档出现 ' + n + ' 次（应恰 1 —— 多处声明会让改一处漏一处时纯度检查恒过）');
    }
    /* 真源上各恰中 1 次（H6 两向自证之一：不唯一即应拒绝破坏）。 */
    for (const k of ['kPolishGate', 'kEvidenceUndecided', 'kPlayerGate', 'kGone', 'kDraftFact', 'kEvidenceKept']) {
        const n = SA_SRC.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '内核锚 ' + k + ' 在 story-annual.js 命中 ' + n + ' 次（应恰 1）');
    }
    assert.equal(IDX.split(ANCHORS.hDraftContract).length - 1, 1, '宿主锚 hDraftContract 在 index.js 命中 1 次');
    assert.equal(SA_OPS_SRC.split(ANCHORS.hDraftPersist).length - 1, 1, '宿主锚 hDraftPersist 在 engine-story-annual.js 命中 1 次');
    assert.equal(SA_OPS_SRC.split(ANCHORS.hGateAuto).length - 1, 1, '宿主锚 hGateAuto 在 engine-story-annual.js 命中 1 次');
    console.log('  ok 九个锚点在本档各 1 次、在真源各 1 次');
});
test('v3410 F2. ** H6 两向自证：锚点不存在 / 不唯一 / 同值替换时破坏必须被拒', () => {
    const W = KIT.BREAK_MSG;
    assert.throws(() => KIT.breakOnce('abc', 'zzz', 'x'), new RegExp(W.hits + '|' + W.refuse));
    assert.throws(() => KIT.breakOnce('aaa', 'a', 'b'), new RegExp(W.hits + '|' + W.refuse));
    assert.throws(() => KIT.breakOnce('abc', 'abc', 'abc'), new RegExp(W.mustChange));
    console.log('  ok 0 次 / 多次 锚点与同值替换均被唯一真源拒绝');
});
/* ══════════════ G. 版本锚 ══════════════ */
test('v3410 G1. ★★ 版本面：六源同源 + 本档出生锚 BORN_V（下界，不锁当版）', () => {
    /* 本档出生那一版的版本号是一次性事实，不是永久不变量（v3264/v3266/C1 一族踩过）：
     *   故只守「六源**逐字同源**」与「不低于本档出生版本」；「当版锚点恰一处」由当版 frontier 本档把守
     *   （V4 口径：锚必须住在当版档案里；历史文件锁当版反而会被 V2 抓）。 */
    const idxV = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(vnum(idxV) >= vnum(BORN_V), '宿主版本不得低于本档出生版本（实 ' + idxV + '）');
    assert.equal(MF.version, idxV, 'manifest.json 未与宿主同源');
    assert.equal(PKG.version, idxV, 'package.json 未与宿主同源');
    for (const rel of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        assert.match(read(rel), new RegExp("let VERSION = '" + idxV + "'"), rel + ' 未同源');
    }
    assert.ok(vnum(BORN_V) > vnum('3.340.0'), '版本序须前进');
    console.log('  ok 六源逐字同源（' + idxV + '）/ 出生锚 v' + BORN_V + ' / 版本序前进');
});
