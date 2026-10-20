/* ========================================================
 * condition-patch.js — [v3.349.0 · 缝入上游 conditionPatch] 伤情/伤病状况的**编号片段补丁**
 * (纯函数,零依赖)
 *
 * 【为什么需要这一面 / 修前缺口(不是「再加一个字段」)】
 *   主角档案六字段里,`condition`(生理/伤病状况)是**唯一一个「旧值必须活着」的字段**,
 *   而它在本仓是**整段覆盖型字符串**:
 *     · memory-core.js setProtagonist:逐字段 String(patch[key] ?? '').trim() **直接覆盖**;
 *     · memory-core.js getProtagonistPrompt:整串拼进「生理/伤病状况:...」;
 *     · memory-config.js 的提取约定只写「只填本轮明确变化或有新信息的字段」。
 *   于是上游实测的两个老问题在本仓**逐字成立**:
 *     ① **新伤挤掉旧伤**:模型只提「本轮新受的伤」,重写时把尚未解除的旧伤/活动限制挤掉
 *        —— 上一轮的「左臂夹板固定,暂不能提重物」在下一轮悄悄消失,而它并没有痊愈;
 *     ② **痊愈即清光**:「伤口好了」时模型填空字符串,一次清掉**所有**伤情
 *        (等于自动回血:腿上还流着血,只因为嘴上说「手好了」就全没了)。
 *   两条的共同根因是**同一个**:整体覆盖没有「哪一条」的概念 —— 模型想改一条,
 *   只能重写全部;重写全部就必然丢掉它没想起来的那几条。
 *
 * 【本模块只做一件事:把 condition 切成编号片段,只允许**按编号**改】
 *   · 切分:按中文/英文分号、句号、换行切;**逗号不切**
 *     (「手臂受伤,夹板固定,暂不能提重物」是一个片段 —— 拆开会把一条伤拆成三条互相矛盾的状态);
 *   · 渲染:切成 [c1] xxx；[c2] yyy 供提示词注入(编号**只在单次请求内**有效);
 *   · 施加:replace 按 cN 定位(text 空串 ⇒ 删该片段;有内容 ⇒ 覆盖该片段)、
 *     add 追加为尾部片段;**未列入的片段原样保留**(这就是①的解法);
 *   · 清空:全部片段被删干净时才归 undefined(空串=明确清空仍是**唯一**的清空途径,
 *     不是「模型没提」的副作用 —— 这是②的解法)。
 *
 * 【与上游实现的关系(可移植性说明)】
 *   机制动机来自上游仓库把「覆盖型伤情字段」改成「可增删的编号片段」这一通用失效形态;
 *   本模块**按本仓规范重写**(IIFE、零依赖、不抛、判据保守且可复算、读数齐备、零反斜杠构造),
 *   未复制任何外部代码。三条**刻意与上游不同**的地方,逐条写明理由:
 *     1 **不持久化补丁**:上游把 conditionPatch 随 delta 存进叶子并按楼层重放,于是长出
 *       「同叶子残留补丁二次施加」的病(重放先写新文本、再按旧编号施加一遍残留补丁,
 *       手动保存看着「没生效」且旧片段只增不减)。本仓**没有**主角 delta 重放面,
 *       故本模块**只在 setProtagonist 那一瞬施加**,结果直接落成一串文本 ——
 *       没有残留就没有二次施加,**不需要**上游那处 delete 式的补丁(少一个可漂移的字段面)。
 *     2 **同批给 condition 即作废补丁**:上游在合并处 delete 掉残留补丁以达同一目的;
 *       本仓没有合并处,等价的纪律落在**同一次 patch 内**:同时给出 condition 与
 *       conditionPatch 时,condition(含空串=清空)优先,补丁**整体丢弃**并具名记账。
 *       不这么做就会出现「先写文本、再按编号改一遍」的两条口径打架。
 *     3 **编号越界跳过而不是夹取**:越界 replace 一律 skip 并计数(不 clamp 到末位) ——
 *       clamp 会把「模型记错了编号」静默变成「改了最后一条」,那是最坏的一种「看着生效」。
 *
 * 【三条纪律(与 lore-crosscheck.js / material-pack.js / return-gate.js 同规格)】
 *   1 只读投影:本面不写库、不落盘、不新增任何持久化键 —— 施加结果由**调用方**写回,本面只算;
 *   2 不抛:输入畸形(非对象 / 缺字段 / 类型错)一律降级为读数(skipped / dropped 计数),绝不外抛;
 *   3 不猜:编号认不出、越界、文本为空,一律具名进 skipped,**不猜模型想改哪一条**。
 *
 * 【本模块不做什么(边界)】
 *   · 不解析伤情语义(不判断「这条到底好了没有」—— 那是剧情的判断,不是字符串的判断);
 *   · 不产百分比/置信度(读数里出现 percent / confidence / score 一类键即不合格);
 *   · 不联网、不调模型、不产正文;
 *   · 不替调用方决定「AI 该输出什么」(提示词约定归 memory-config.js,本面只认补丁形状)。
 * ======================================================== */(function (root) {
    'use strict';
    const CP_VERSION = 1;
    const CP_KIND = 'condition_patch';
    /* 反斜杠与换行一律**拼装**(本仓写入通道会污染反斜杠,故本文件零裸字面量)。 */
    const BS = String.fromCharCode(92);
    const LF = String.fromCharCode(10);
    /** 片段之间的显示/存储分隔符(与上游同形:全角分号)。 */
    const FRAGMENT_SEP = '；';
    /** 片段编号形状:仅本请求内有效(c1、c2...)。 */
    const FRAGMENT_ID_RE = new RegExp('^c(' + BS + 'd+)$', 'i');
    /** 切分符:中文/英文分号、句号、换行。**逗号不在其中**(见档头:逗号是片段内部的分隔)。 */
    const FRAGMENT_SPLIT_RE = new RegExp('[' + '；;。' + LF + ']+');
    /** 片段数上限(防模型把流水账塞成伤情表;超出部分进 overflow 读数,不静默丢)。 */
    const MAX_FRAGMENTS = 12;
    /** 单片段文本上限(超出截断并计数 —— 截断是读数,不是静默)。 */
    const MAX_TEXT = 120;
    /** 补丁 ops 上限。 */
    const MAX_OPS = 24;
    /** 百分比类键名(读数里出现即不合格:伤情没有「70% 好了」这种读数)。 */
    const PERCENT_KEYS = Object.freeze(['percent', 'percentage', 'confidence', 'score', 'probability', 'likelihood', 'ratio']);
    function strOf(v) {
        if (v === null || v === undefined) return '';
        try { return String(v); } catch (_e) { return ''; }
    }
    function arrOf(v) { return Array.isArray(v) ? v : []; }
    function numOr(v, d) {
        const n = Number(v);
        return Number.isFinite(n) ? n : d;
    }
    function clip(text, max) {
        const s = strOf(text);
        if (s.length <= max) return { text: s, truncated: false };
        return { text: s.slice(0, max), truncated: true };
    }
    /** 片段编号:c1 起(对外 1 基,对内 0 基)。 */
    function conditionFragmentId(index) {
        return 'c' + (numOr(index, 0) + 1);
    }
    /**
     * 把一段 condition 切成片段数组。
     *   逗号**不切**——「手臂受伤,夹板固定,暂不能提重物」是一个片段整体(拆开会变成三条
     *   互相矛盾的状态,且按编号替换时只能改其中一条,反而更容易写出半真半假的伤情)。
     */
    function splitConditionFragments(condition) {
        const text = strOf(condition).trim();
        if (!text) return [];
        return text.split(FRAGMENT_SPLIT_RE).map(function (s) { return s.trim(); }).filter(Boolean);
    }
    /** 渲染成带编号的片段列表(供提示词注入);空则空串。 */
    function fmtConditionFragments(condition) {
        return splitConditionFragments(condition)
            .map(function (frag, i) { return '[' + conditionFragmentId(i) + '] ' + frag; })
            .join(FRAGMENT_SEP);
    }
    /** 单条 op 的清洗结果。 */
    function cleanOp(raw, kind) {
        const o = (raw && typeof raw === 'object') ? raw : null;
        if (!o) return { drop: true, why: kind + '-not-object' };
        const id = strOf(o.id).trim();
        const t = clip(strOf(o.text).trim(), MAX_TEXT);
        return { drop: false, id: id, text: t.text, truncated: t.truncated };
    }
    /**
     * 清洗模型给的补丁:**只留认识的东西**,其余进 dropped 并具名。
     *   为什么要有这一步(而不是让 applyConditionPatch 直接吃原始输入):
     *   模型输出是**不可信输入**,原始对象直接进 apply 会让畸形值以各种方式参与判定;
     *   清洗把「不认识」与「认识但为空」分成两态 —— 两者都进读数,但处置不同。
     */
    function cleanConditionPatch(raw) {
        const read = { dropped: [], truncated: 0, opsIn: 0, opsKept: 0 };
        const p = (raw && typeof raw === 'object') ? raw : null;
        if (!p) {
            read.dropped.push((raw === null || raw === undefined) ? 'patch-absent' : 'patch-not-object');
            return { patch: null, read: read };
        }
        const replace = [];
        const add = [];
        const push = function (list, kind, rawOp) {
            read.opsIn += 1;
            if (read.opsIn > MAX_OPS * 2) { read.dropped.push(kind + '-over-ops-cap'); return; }
            const c = cleanOp(rawOp, kind);
            if (c.drop) { read.dropped.push(kind + ':' + c.why); return; }
            if (c.truncated) read.truncated += 1;
            list.push({ id: c.id, text: c.text });
        };
        for (const op of arrOf(p.replace).slice(0, MAX_OPS)) push(replace, 'replace', op);
        for (const op of arrOf(p.add).slice(0, MAX_OPS)) push(add, 'add', op);
        if (!Array.isArray(p.replace) && p.replace !== undefined && p.replace !== null) read.dropped.push('replace-not-array');
        if (!Array.isArray(p.add) && p.add !== undefined && p.add !== null) read.dropped.push('add-not-array');
        read.opsKept = replace.length + add.length;
        const patch = { replace: replace, add: add };
        if (!replace.length && !add.length) { read.dropped.push('patch-empty'); return { patch: null, read: read }; }
        return { patch: patch, read: read };
    }
    /** 补丁是否含实质内容:replace 至少一条(空串也算 —— 空串是「删除该片段」)或 add 有非空文本。 */
    function hasConditionPatchContent(raw) {
        const c = cleanConditionPatch(raw);
        if (!c.patch) return false;
        if (c.patch.replace.length > 0) return true;
        return c.patch.add.some(function (op) { return strOf(op && op.text).trim().length > 0; });
    }
    /**
     * 施加补丁,返回 {condition, read}。
     *   condition 为 **undefined 表示清空**(全部片段被删净)。
     *   · replace 按 cN 定位:文本空串 ⇒ 删该片段;有内容 ⇒ 覆盖该片段;
     *   · add 追加为尾部片段;
     *   · **未列入的片段原样保留**(这是「新伤挤掉旧伤」的解法);
     *   · 编号认不出 / 越界 / 同批重复 id / 空 add 一律 skip 并具名(**不猜**)。
     *   注意本面**不是**「没提就删」:模型没说到的片段一律活着 —— 清空只能靠显式空串。
     */
    function applyConditionPatchRead(condition, rawPatch) {
        const read = {
            applied: 0, replaced: 0, deleted: 0, added: 0, skipped: [],
            fragmentsBefore: 0, fragmentsAfter: 0, cleared: false,
            opsDropped: [], truncated: 0, normalized: false, rewrote: false, entries: []
        };
        const c = cleanConditionPatch(rawPatch);
        read.opsDropped = c.read.dropped.slice();
        read.truncated = c.read.truncated;
        const original = strOf(condition).trim();
        if (!c.patch) {
            /* 无有效补丁 ⇒ 一个字节都不动(不重排、不重渲染):免得「没补丁」也改变既有文本形态。 */
            read.fragmentsBefore = splitConditionFragments(original).length;
            read.fragmentsAfter = read.fragmentsBefore;
            return { condition: original ? original : undefined, read: read };
        }
        const frags = splitConditionFragments(original);
        read.fragmentsBefore = frags.length;
        read.normalized = true;
        const touched = {};
        for (const op of c.patch.replace) {
            const rawId = strOf(op.id).trim();
            const m = FRAGMENT_ID_RE.exec(rawId);
            if (!m) { read.skipped.push('replace:bad-id'); read.entries.push({ act: 'skip', id: rawId, why: 'bad-id' }); continue; }
            const idx = Number(m[1]) - 1;
            if (!(idx >= 0 && idx < frags.length)) { read.skipped.push('replace:out-of-range:' + rawId); read.entries.push({ act: 'skip', id: rawId, why: 'out-of-range' }); continue; }
            if (touched[idx] || frags[idx] === null) { read.skipped.push('replace:dup-id:' + rawId); read.entries.push({ act: 'skip', id: rawId, why: 'dup-id' }); continue; }
            touched[idx] = true;
            const text = strOf(op.text).trim();
            const before = frags[idx];
            if (!text) { frags[idx] = null; read.deleted += 1; read.applied += 1; read.entries.push({ act: 'delete', id: conditionFragmentId(idx), from: before }); continue; }
            frags[idx] = text;
            read.replaced += 1; read.applied += 1; read.entries.push({ act: 'replace', id: conditionFragmentId(idx), from: before, to: text });
        }
        for (const op of c.patch.add) {
            const text = strOf(op.text).trim();
            if (!text) { read.skipped.push('add:empty-text'); read.entries.push({ act: 'skip', id: 'add', why: 'empty-text' }); continue; }
            const keptNow = frags.filter(function (f) { return f !== null; }).length;
            if (keptNow >= MAX_FRAGMENTS) { read.skipped.push('add:over-fragments-cap'); read.entries.push({ act: 'skip', id: 'add', why: 'over-fragments-cap' }); continue; }
            frags.push(text);
            read.added += 1; read.applied += 1; read.entries.push({ act: 'add', from: '', to: text });
        }
        const kept = frags.filter(function (f) { return f !== null && f !== ''; });
        read.fragmentsAfter = kept.length;
        if (!read.applied) {
            /* 一条都没落地 ⇒ **原样返回**,连分隔符都不重排(保守不重写:免得坏编号/越界把文本形态改了)。 */
            return { condition: original ? original : undefined, read: read };
        }
        read.rewrote = true;
        if (!kept.length) { read.cleared = true; return { condition: undefined, read: read }; }
        return { condition: kept.join(FRAGMENT_SEP), read: read };
    }
    /** 只要新 condition 的便捷面(调用方写回用)。 */
    function applyConditionPatch(condition, rawPatch) {
        return applyConditionPatchRead(condition, rawPatch).condition;
    }
    /** 读数里是否混入百分比类键(自检用:伤情没有「70% 好了」这种读数)。 */
    function hasPercentKey(node, depth) {
        const d = numOr(depth, 0);
        if (d > 6 || !node || typeof node !== 'object') return false;
        if (Array.isArray(node)) {
            for (const item of node) { if (hasPercentKey(item, d + 1)) return true; }
            return false;
        }
        for (const k of Object.keys(node)) {
            if (PERCENT_KEYS.indexOf(String(k).toLowerCase()) >= 0) return true;
            if (hasPercentKey(node[k], d + 1)) return true;
        }
        return false;
    }
    /**
     * 验收自检:全部在**一池**里跑完。
     *   覆盖两条真实病(①新伤挤掉旧伤 ②痊愈即清光)+ 三条刻意差异(不持久化 / 越界不夹取 /
     *   畸形≠缺席)+ 只读面真判据(**不改入参**,与函数名无关)。
     */
    function selfCheck() {
        const TWO = '左臂受轻微剑伤包扎中；右腿旧伤未愈';
        /* 1 确定性:同输入同产物。 */
        const a1 = applyConditionPatchRead(TWO, { replace: [{ id: 'c1', text: '左臂已拆绷带' }] });
        const a2 = applyConditionPatchRead(TWO, { replace: [{ id: 'c1', text: '左臂已拆绷带' }] });
        const deterministic = JSON.stringify(a1) === JSON.stringify(a2);
        /* 2 **未列入片段原样保留**(①的解法:改一条不会挤掉另一条)。 */
        const keepsUnlisted = a1.condition === '左臂已拆绷带；右腿旧伤未愈'
            && a1.read.replaced === 1 && a1.read.fragmentsBefore === 2 && a1.read.fragmentsAfter === 2;
        /* 3 add 也不挤旧伤。 */
        const ad = applyConditionPatchRead('右腿旧伤未愈', { add: [{ text: '额角新添一道浅伤' }] });
        const addKeeps = ad.condition === '右腿旧伤未愈；额角新添一道浅伤' && ad.read.added === 1 && ad.read.fragmentsAfter === 2;
        /* 4 **空串只删那一条**;删净才算清空(②的解法:不会因为「手好了」把腿上还流的血一起抹了)。 */
        const one = applyConditionPatchRead(TWO, { replace: [{ id: 'c1', text: '' }] });
        const all = applyConditionPatchRead('左臂受轻微剑伤包扎中', { replace: [{ id: 'c1', text: '' }] });
        const deleteScoped = one.condition === '右腿旧伤未愈' && one.read.deleted === 1 && one.read.cleared === false
            && all.condition === undefined && all.read.cleared === true;
        /* 5 **越界跳过而不是夹取**,且文本一字不动。 */
        const oor = applyConditionPatchRead(TWO, { replace: [{ id: 'c9', text: '乱写' }] });
        const outOfRangeSkips = oor.condition === TWO && oor.read.skipped.indexOf('replace:out-of-range:c9') >= 0
            && oor.read.applied === 0 && oor.read.rewrote === false;
        /* 6 编号认不出 ⇒ skip(不猜模型想改哪一条)。 */
        const badId = applyConditionPatchRead(TWO, { replace: [{ id: 'x1', text: '乱写' }] });
        const badIdSkips = badId.condition === TWO && badId.read.skipped.indexOf('replace:bad-id') >= 0;
        /* 7 同批重复 id:第一条生效、第二条 skip(不静默改两次)。 */
        const dup = applyConditionPatchRead(TWO, { replace: [{ id: 'c1', text: '第一条' }, { id: 'c1', text: '第二条' }] });
        const dupSkips = dup.read.replaced === 1 && dup.read.skipped.indexOf('replace:dup-id:c1') >= 0
            && dup.condition === '第一条；右腿旧伤未愈';
        /* 8 **畸形 ≠ 缺席**(两态各自具名,不混为一个「空」)。 */
        const absent = cleanConditionPatch(null);
        const malformed = cleanConditionPatch('不是对象');
        const absentDistinct = absent.read.dropped.indexOf('patch-absent') >= 0
            && malformed.read.dropped.indexOf('patch-not-object') >= 0;
        /* 9 没补丁 ⇒ 一个字节都不动(连分隔符都不重排)。 */
        const noPatchNoTouch = applyConditionPatchRead(TWO + '。', null).condition === TWO + '。';
        /* 10 **不改入参**(只读面的真判据:与函数名无关,看的是有没有原地改)。 */
        const inputCond = TWO;
        const inputPatch = { replace: [{ id: 'c1', text: '改后' }] };
        const beforeCond = String(inputCond);
        const beforePatch = JSON.stringify(inputPatch);
        applyConditionPatchRead(inputCond, inputPatch);
        const noMutate = String(inputCond) === beforeCond && JSON.stringify(inputPatch) === beforePatch;
        /* 11 逗号不切(一条伤拆三条会互相矛盾)。 */
        const commaHeld = splitConditionFragments('手臂受伤,夹板固定,暂不能提重物').length === 1;
        /* 12 渲染带编号(编号只在单次请求内有效)。 */
        const fmtOk = fmtConditionFragments(TWO) === '[c1] 左臂受轻微剑伤包扎中；[c2] 右腿旧伤未愈';
        /* 13 不产百分比键(伤情没有「70% 好了」这种读数)。 */
        const pctFree = !hasPercentKey(a1.read);
        /* 14 可序列化 + 全空补丁视为没补丁。 */
        let serializable = true;
        try { serializable = JSON.parse(JSON.stringify(a1.read)).applied === 1; } catch (_e) { serializable = false; }
        const emptyPatch = cleanConditionPatch({ replace: [], add: [] });
        const emptyDropped = emptyPatch.patch === null && emptyPatch.read.dropped.indexOf('patch-empty') >= 0;
        /* 15 导出名里不得有写面动词(apply 不在其中:本仓 apply 是**纯计算**语义 —— 只算不写)。 */
        const mutating = ['set', 'put', 'write', 'save', 'update', 'delete', 'clear', 'remove', 'commit', 'persist', 'store', 'drop', 'erase', 'inject', 'push'];
        const writeFaces = Object.keys(api).filter(function (n) {
            return mutating.some(function (mm) { return n.toLowerCase().indexOf(mm) === 0; });
        }).length;
        return {
            ok: deterministic && keepsUnlisted && addKeeps && deleteScoped && outOfRangeSkips && badIdSkips
                && dupSkips && absentDistinct && noPatchNoTouch && noMutate && commaHeld && fmtOk
                && pctFree && serializable && emptyDropped && writeFaces === 0,
            deterministic: deterministic,
            keepsUnlisted: keepsUnlisted,
            addKeepsOld: addKeeps,
            deleteScoped: deleteScoped,
            outOfRangeSkips: outOfRangeSkips,
            badIdSkips: badIdSkips,
            dupSkips: dupSkips,
            absentDistinct: absentDistinct,
            noPatchNoTouch: noPatchNoTouch,
            noMutate: noMutate,
            commaHeld: commaHeld,
            fmtOk: fmtOk,
            percentFree: pctFree,
            serializable: serializable,
            emptyDropped: emptyDropped,
            writeFaces: writeFaces,
        };
    }
    /**
     * 一行读数(**分开说**:清空 / 改 / 删 / 添 / 片段数 / 跳过)。
     *   合并任意两项都会让人误判「这次到底动了什么」—— 所以分开写。
     */
    function line(read) {
        const r = read || {};
        if (r.degraded) return '伤情补丁异常(已降级,不外抛)';
        const parts = [];
        if (r.cleared) parts.push('**清空**');
        if (r.replaced) parts.push('改 ' + r.replaced);
        if (r.deleted) parts.push('删 ' + r.deleted);
        if (r.added) parts.push('添 ' + r.added);
        if (r.fragmentsBefore || r.fragmentsAfter) parts.push('片段 ' + r.fragmentsBefore + '→' + r.fragmentsAfter);
        if (r.skipped && r.skipped.length) parts.push('**跳过 ' + r.skipped.length + '**');
        if (r.opsDropped && r.opsDropped.length) parts.push('弃 ' + r.opsDropped.length);
        if (r.truncated) parts.push('截断 ' + r.truncated);
        if (!parts.length) return '伤情未变(没给可认的补丁)';
        if (!r.applied && !r.cleared && !r.rewrote) parts.push('(未变)');
        return parts.join(' · ');
    }
    /** 逐条清单(只说**动作与编号**,不产正文、不判伤情好坏)。 */
    function render(read, opts) {
        try {
            const r = read || {};
            const o = (opts && typeof opts === 'object') ? opts : {};
            const max = numOr(o.max, 40);
            const es = arrOf(r.entries);
            if (!es.length) return r.rewrote ? ('伤情已重写:' + r.fragmentsAfter + ' 条片段。') : '伤情未变。';
            const lines = ['伤情补丁:' + line(r)];
            for (let i = 0; i < es.length; i++) {
                if (lines.length > max) { lines.push('...(已截断)'); break; }
                const e = es[i];
                if (e.act === 'skip') lines.push('- 跳过 ' + e.id + '(' + e.why + ')');
                else if (e.act === 'delete') lines.push('- 删除 ' + e.id + '(' + clip(strOf(e.from), 30).text + ')');
                else if (e.act === 'add') lines.push('- 添 ' + clip(strOf(e.to), 30).text);
                else lines.push('- ' + e.id + ' ' + clip(strOf(e.from), 24).text + ' ⇒ ' + clip(strOf(e.to), 24).text);
            }
            return lines.join(LF);
        } catch (_e) { return ''; }
    }
    /** 能力自述(缺哪一格、为什么缺、缺了会怎样)。 */
    function describe(extra) {
        const sc = selfCheck();
        const o = (extra && typeof extra === 'object') ? extra : {};
        return Object.assign({
            kind: CP_KIND, version: CP_VERSION,
            fragmentSep: FRAGMENT_SEP, fragmentId: 'cN',
            maxFragments: MAX_FRAGMENTS, maxText: MAX_TEXT, maxOps: MAX_OPS,
            percentKeys: PERCENT_KEYS.slice(),
            acts: ['replace', 'delete', 'add', 'skip'],
            skipReasons: ['bad-id', 'out-of-range', 'dup-id', 'empty-text', 'over-fragments-cap'],
            dropReasons: ['patch-absent', 'patch-not-object', 'replace-not-array', 'add-not-array', 'patch-empty'],
            commaSplits: false, unlistedKept: true, clearNeedsExplicitEmpty: true,
            persistsNothing: true, writesNothing: true,
            readsFullText: true, copiesFullText: false,
            online: false, offline: true,
            devisesNothing: true, printsText: false, ledgerOnly: true,
            selfCheck: sc,
        }, o);
    }
    const api = {
        CP_VERSION: CP_VERSION,
        CP_KIND: CP_KIND,
        FRAGMENT_SEP: FRAGMENT_SEP,
        FRAGMENT_ID_RE: FRAGMENT_ID_RE,
        FRAGMENT_SPLIT_RE: FRAGMENT_SPLIT_RE,
        MAX_FRAGMENTS: MAX_FRAGMENTS,
        MAX_TEXT: MAX_TEXT,
        MAX_OPS: MAX_OPS,
        PERCENT_KEYS: PERCENT_KEYS,
        strOf: strOf,
        arrOf: arrOf,
        numOr: numOr,
        clip: clip,
        conditionFragmentId: conditionFragmentId,
        splitConditionFragments: splitConditionFragments,
        fmtConditionFragments: fmtConditionFragments,
        cleanOp: cleanOp,
        cleanConditionPatch: cleanConditionPatch,
        hasConditionPatchContent: hasConditionPatchContent,
        applyConditionPatch: applyConditionPatch,
        applyConditionPatchRead: applyConditionPatchRead,
        hasPercentKey: hasPercentKey,
        selfCheck: selfCheck,
        line: line,
        render: render,
        describe: describe,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaConditionPatch = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛,忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);
