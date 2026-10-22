/**
 * scene-orchestrator.js — [v3.356.0 · M6-O6] 场景上下文编排：让记忆服务当前互动，而非塞一包资料
 *   纯函数 IIFE，零依赖、零联网、零写回。
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   本仓已有材料包面，但材料包是**一次性静态选材**：
 *     · material-pack.js —— 按四种任务（meet / reunion / advance / resolve）
 *       从库存里挑材料，产出 pack；
 *     · perspective-card.js —— 算某人此刻知道什么；
 *     · commitment-ledger.js —— 记着哪些约定未结。
 *   三者都答不了「**这一幕演到第三轮了**，材料该变了」：
 *     · 材料包是**一次性快照**——同一幕里五轮互动，选出的材料始终一样；
 *     · 视角卡是**单人**的——两个角色各拿各的，但没有「叙述者材料不许共享给角色」这条边界；
 *     · 约定账是**全局**的——它记着所有未结约定，不分「这一幕相关的那几条」。
 *   后果三件都不报错：注入面照样有材料，只是**越往后越不相关** ——
 *   「旧约束不凭空消失」这条要求全靠运气，不靠机制。
 *
 * 【本模块的职责（只做场景状态与按需改编，不替模型写整场故事）】
 *   把「这一幕」组织成一份**可更新的场景状态**：
 *     · 参与者 + 各自可知（引用 perspective-card 的读数，不重算）；
 *     · 本幕目标、硬约束、可调用旧事、未解决问题；
 *     · **幕次推进**（prepare → negotiate → turn → resolve），
 *       推进时**改编**材料：新增消息会改变下一轮的材料，但**旧约束不消失**。
 *
 * 【四条硬纪律（每条都对应一次真会出事的假读数）】
 *   1. **约束只增不减**：硬约束一旦写入本幕，**除非显式解除**否则一直有效。
 *      推进时若约束消失了，读数会显示「这幕没有约束」，而实际约束还在 ——
 *      这是「旧约束不凭空消失」的机制落点。
 *   2. **视角分面不共享**：叙述者（narrator）拿到的材料**不自动**给角色；
 *      角色拿到的材料**不自动**给叙述者。每个视角一份，边界由本模块守。
 *   3. **取消即清场**：本幕取消后**不残留任何任务**（材料、约束、未决项全部作废）。
 *      残留会让下一幕开局就背着上一幕的债。
 *   4. **材料改编可追因**：每轮改编必须报出「为什么换」（added / retired / kept），
 *      否则用户看到材料变了却不知道为什么变。
 *
 * 【本模块不做什么（边界）】
 *   · 不产正文、不写场景（那是生成侧的事）。
 *   · 不重算可知性（perspective-card 的读数由调用方注入，本模块只分面）。
 *   · 不建多智能体自治（计划原文明写不做）。
 *   · 不读宿主 `this`、不碰 storage、不联网。
 *
 * 挂 window.LonShaSceneOrchestrator，供 index.js 材料面 / 诊断面使用。
 */
(function (root) {
    'use strict';

    const SO_VERSION = 1;
    const SO_KIND = 'scene_orchestrator';

    /** 幕次四段（★ 与 material-pack 的四种任务**不是一回事**：那是任务类型，这是幕次进程）。 */
    const STAGES = Object.freeze(['prepare', 'negotiate', 'turn', 'resolve']);
    /** 视角面（★ narrator 与 actor 严格分列，绝不自动共享）。 */
    const VIEWPOINTS = Object.freeze(['narrator', 'actor']);
    /** 场景状态三态（★ active / cancelled / closed 分列）。 */
    const SCENE_STATES = Object.freeze({
        ACTIVE: 'active',
        CANCELLED: 'cancelled',
        CLOSED: 'closed',
    });
    /** 归因（每条可读，不许用 'error' 一锅装）。 */
    const SO_REASONS = Object.freeze({
        OK: 'ok',
        NOT_OBJECT: 'not-object',
        NO_ID: 'no-id',
        NOT_FOUND: 'not-found',
        BAD_SHAPE: 'bad-shape',
        DUPLICATE: 'duplicate',
        NO_STAGE: 'no-stage',
        OVER_LIMIT: 'over-limit',
        CANCELLED: 'cancelled',
        NO_MATERIAL: 'no-material',
    });

    const SCENE_LIMITS = Object.freeze({
        /** 单幕参与者上限。 */
        actors: 8,
        /** 单幕约束上限。 */
        constraints: 12,
        /** 单幕可调用旧事上限。 */
        recallables: 12,
        /** 单幕未解决问题上限。 */
        openQuestions: 10,
        /** 单份材料上限。 */
        materials: 20,
        /** id 长度。 */
        id: 80,
        /** 单条文本长度。 */
        text: 160,
    });

    /* ---------- 基础归一 ---------- */
    function str(v) { return String(v == null ? '' : v).trim(); }
    function capStr(v, n) {
        const s = str(v);
        return s.length > n ? s.slice(0, n) : s;
    }
    function strList(v, cap) {
        const out = [];
        if (!Array.isArray(v)) return out;
        for (const x of v) {
            const s = str(x);
            if (s && out.indexOf(s) < 0) out.push(s);
            if (out.length >= cap) break;
        }
        return out;
    }
    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'boolean' || typeof v === 'object') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    /**
     * 归一一条材料。
     * ★ 材料必须带来源键（source + refId）：无出处的材料会让「引用了旧事」变成无法核对的断言。
     *   没有 source 时**不丢弃**，但标 `originless:true` —— 丢掉会掩盖「有材料却没出处」这个真缺口。
     */
    function normalizeMaterial(raw) {
        const o = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : null;
        if (!o) return null;
        const source = capStr(o.source, 60);
        const refId = capStr(o.refId, 80);
        return {
            id: capStr(o.id, SCENE_LIMITS.id) || (source + ':' + refId),
            source: source,
            refId: refId,
            title: capStr(o.title || o.text, SCENE_LIMITS.text),
            /** 归属视角（narrator / actor）；缺省 narrator。 */
            viewpoint: VIEWPOINTS.indexOf(str(o.viewpoint)) >= 0 ? str(o.viewpoint) : 'narrator',
            /** 归属角色（viewpoint=actor 时有效）。 */
            actor: capStr(o.actor, 40),
            originless: !(source && refId),
        };
    }
    function normalizeMaterials(raw) {
        const out = [];
        if (!Array.isArray(raw)) return out;
        for (const m of raw.slice(0, SCENE_LIMITS.materials)) {
            const n = normalizeMaterial(m);
            if (n) out.push(n);
        }
        return out;
    }

    /**
     * 归一一个场景状态。
     * ★ 约束、目标、旧事、未决项**各自独立归一**，互不吞并 ——
     *   「硬约束」与「可调用旧事」压成一栏时，约束会在下一轮被当旧事悄悄丢掉。
     */
    function normalizeScene(raw) {
        const o = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : null;
        if (!o) return null;
        const id = capStr(o.id, SCENE_LIMITS.id);
        if (!id) return null;
        const stage = str(o.stage);
        const stateRaw = str(o.state);
        const state = (stateRaw === SCENE_STATES.CANCELLED || stateRaw === SCENE_STATES.CLOSED)
            ? stateRaw : SCENE_STATES.ACTIVE;
        const constraints = [];
        const seenC = {};
        for (const c of (Array.isArray(o.constraints) ? o.constraints : []).slice(0, SCENE_LIMITS.constraints)) {
            const text = capStr(typeof c === 'string' ? c : (c && c.text), SCENE_LIMITS.text);
            if (!text) continue;
            const key = text;
            if (seenC[key]) continue;
            seenC[key] = 1;
            /* ★ 条目自带 released 标记时**必须保留**：
             *   首版一律重写成 false，于是 releaseConstraint 写回的 {text, released:true}
             *   在下一次归一时被抹掉 —— 「已解除」读成「仍生效」，
             *   而 releasedConstraints 侧只在调用方另传时才生效。
             *   归一必须幂等：读进去什么，读出来还是什么。 */
            const rel = (c && typeof c === 'object' && c.released === true) ? true : false;
            constraints.push({ text: text, released: rel });
        }
        const released = {};
        for (const c of (Array.isArray(o.releasedConstraints) ? o.releasedConstraints : [])) {
            const text = capStr(typeof c === 'string' ? c : (c && c.text), SCENE_LIMITS.text);
            if (text) released[text] = true;
        }
        for (const c of constraints) if (released[c.text]) c.released = true;
        const recallables = [];
        for (const r of (Array.isArray(o.recallables) ? o.recallables : []).slice(0, SCENE_LIMITS.recallables)) {
            const text = capStr(typeof r === 'string' ? r : (r && r.text), SCENE_LIMITS.text);
            if (!text) continue;
            recallables.push({ text: text, actor: capStr(r && r.actor, 40) });
        }
        const openQuestions = [];
        for (const q of (Array.isArray(o.openQuestions) ? o.openQuestions : []).slice(0, SCENE_LIMITS.openQuestions)) {
            const text = capStr(typeof q === 'string' ? q : (q && q.text), SCENE_LIMITS.text);
            if (!text) continue;
            openQuestions.push({ text: text, resolved: false });
        }
        const resolvedQ = {};
        for (const q of (Array.isArray(o.resolvedQuestions) ? o.resolvedQuestions : [])) {
            const text = capStr(typeof q === 'string' ? q : (q && q.text), SCENE_LIMITS.text);
            if (text) resolvedQ[text] = true;
        }
        for (const q of openQuestions) if (resolvedQ[q.text]) q.resolved = true;
        return {
            id: id,
            title: capStr(o.title, SCENE_LIMITS.text),
            stage: STAGES.indexOf(stage) >= 0 ? stage : STAGES[0],
            state: state,
            actors: strList(o.actors, SCENE_LIMITS.actors),
            goal: capStr(o.goal, SCENE_LIMITS.text),
            constraints: constraints,
            recallables: recallables,
            openQuestions: openQuestions,
            materials: normalizeMaterials(o.materials),
            /** 推进计数（用于读数与「材料是否真的随轮次变化」的核查）。 */
            turn: numOrNull(o.turn) || 0,
        };
    }
    function normalizeScenes(raw) {
        const out = [];
        if (!Array.isArray(raw)) return out;
        for (const s of raw) {
            const n = normalizeScene(s);
            if (n) out.push(n);
        }
        return out;
    }
    function findScene(list, id) {
        const want = str(id);
        for (const s of normalizeScenes(list)) if (s.id === want) return s;
        return null;
    }

    /* ---------- 幕次推进与材料改编 ---------- */
    /**
     * 推进一幕，并把新消息/新情况改编进材料。
     *
     * @param {Array} rawList 场景列表
     * @param {string} id 场景 id
     * @param {object} patch { message, addedMaterials:[], retiredMaterialIds:[], nextStage, actor }
     * @returns {object} { ok, scene, changed:{added,retired,kept,why}, reason }
     */
    function advance(rawList, id, patch) {
        const arr = Array.isArray(rawList) ? rawList.slice() : [];
        const idx = arr.findIndex(function (x) { return x && typeof x === 'object' && str(x.id) === str(id); });
        if (idx < 0) return { ok: false, reason: SO_REASONS.NOT_FOUND, scene: null, changed: null, list: arr };
        const cur = normalizeScene(arr[idx]);
        if (!cur) return { ok: false, reason: SO_REASONS.BAD_SHAPE, scene: null, changed: null, list: arr };
        if (cur.state === SCENE_STATES.CANCELLED) {
            return { ok: false, reason: SO_REASONS.CANCELLED, scene: cur, changed: null, list: arr };
        }
        const p = (patch && typeof patch === 'object') ? patch : {};
        const nextStage = str(p.nextStage);
        const stage = STAGES.indexOf(nextStage) >= 0 ? nextStage : nextStageOf(cur.stage);

        /* 材料改编：新增 + 退役；**保留其余**（旧材料不凭空消失）。
         * ★ 退役是显式的：调用方点名 retiredMaterialIds，模块不自己判断「过时了」。 */
        const added = normalizeMaterials(p.addedMaterials);
        const retiredIds = strList(p.retiredMaterialIds, SCENE_LIMITS.materials);
        const retired = [];
        const kept = [];
        const materials = [];
        for (const m of cur.materials) {
            if (retiredIds.indexOf(m.id) >= 0) { retired.push(m.id); continue; }
            kept.push(m.id);
            materials.push(m);
        }
        for (const m of added) {
            if (materials.some(function (x) { return x.id === m.id; })) continue;
            materials.push(m);
        }
        const why = [];
        if (added.length) why.push('added:' + added.length);
        if (retired.length) why.push('retired:' + retired.length);
        if (p.message) why.push('message');
        if (p.nextStage) why.push('stage:' + stage);
        if (!why.length) why.push('no-change');

        const next = Object.assign({}, cur, {
            stage: stage,
            turn: cur.turn + 1,
            materials: materials.slice(0, SCENE_LIMITS.materials),
            constraints: cur.constraints,     /* ★ 约束原样带过 —— 只增不减的纪律在归一层就落实。 */
        });
        const list = arr.slice();
        list[idx] = next;
        return {
            ok: true, reason: SO_REASONS.OK, scene: normalizeScene(next),
            changed: { added: added.map(function (m) { return m.id; }), retired: retired, kept: kept, why: why },
            list: list,
        };
    }
    function nextStageOf(stage) {
        const i = STAGES.indexOf(stage);
        if (i < 0 || i >= STAGES.length - 1) return STAGES[STAGES.length - 1];
        return STAGES[i + 1];
    }

    /**
     * 取消一幕（★ 清场：不留任何任务）。
     *   取消后 constraints / recallables / openQuestions / materials 全部作废。
     */
    function cancel(rawList, id) {
        const arr = Array.isArray(rawList) ? rawList.slice() : [];
        const idx = arr.findIndex(function (x) { return x && typeof x === 'object' && str(x.id) === str(id); });
        if (idx < 0) return { ok: false, reason: SO_REASONS.NOT_FOUND, scene: null, list: arr };
        const cur = normalizeScene(arr[idx]);
        if (!cur) return { ok: false, reason: SO_REASONS.BAD_SHAPE, scene: null, list: arr };
        const next = Object.assign({}, cur, {
            state: SCENE_STATES.CANCELLED,
            constraints: [], recallables: [], openQuestions: [], materials: [],
        });
        const list = arr.slice();
        list[idx] = next;
        return { ok: true, reason: SO_REASONS.OK, scene: normalizeScene(next), list: list };
    }

    /**
     * 解除一条约束（★ 显式解除才生效 —— 约束不是「看起来不需要了」就自动没的）。
     */
    function releaseConstraint(rawList, id, text) {
        const arr = Array.isArray(rawList) ? rawList.slice() : [];
        const idx = arr.findIndex(function (x) { return x && typeof x === 'object' && str(x.id) === str(id); });
        if (idx < 0) return { ok: false, reason: SO_REASONS.NOT_FOUND, scene: null, list: arr };
        const cur = normalizeScene(arr[idx]);
        if (!cur) return { ok: false, reason: SO_REASONS.BAD_SHAPE, scene: null, list: arr };
        const want = str(text);
        if (!want) return { ok: false, reason: SO_REASONS.BAD_SHAPE, scene: null, list: arr };
        const constraints = cur.constraints.map(function (c) {
            return c.text === want ? { text: c.text, released: true } : c;
        });
        const next = Object.assign({}, cur, { constraints: constraints });
        const list = arr.slice();
        list[idx] = next;
        return { ok: true, reason: SO_REASONS.OK, scene: normalizeScene(next), list: list };
    }

    /* ---------- 视角分面（★ 叙述者材料不自动共享给角色） ---------- */
    /**
     * 取某视角的材料。
     * @param {object} scene 已归一场景
     * @param {string} viewpoint 'narrator' | 'actor'
     * @param {string} [actor] viewpoint=actor 时的角色名
     */
    function materialsFor(scene, viewpoint, actor) {
        const s = normalizeScene(scene);
        if (!s) return { ok: false, materials: [], reason: SO_REASONS.BAD_SHAPE };
        const vp = VIEWPOINTS.indexOf(str(viewpoint)) >= 0 ? str(viewpoint) : 'narrator';
        const who = str(actor);
        const out = [];
        for (const m of s.materials) {
            /* ★ 严格分面：narrator 的材料不给 actor；actor 的材料不给 narrator；
             *   actor 的材料只给该角色本人。 */
            if (m.viewpoint !== vp) continue;
            if (vp === 'actor' && who && m.actor && m.actor !== who) continue;
            out.push(m);
        }
        return { ok: true, materials: out, reason: SO_REASONS.OK };
    }

    /**
     * 本幕材料包（按视角分面 + 约束 + 未决项组装）。
     * ★ 约束**始终**在包内（即使已 released 也带 released:true 标出）——
     *   静默丢掉被解除的约束会让读数以为「这幕从没约束过」。
     */
    function scenePack(scene, viewpoint, actor) {
        const s = normalizeScene(scene);
        if (!s) return { ok: false, reason: SO_REASONS.BAD_SHAPE, pack: null };
        if (s.state === SCENE_STATES.CANCELLED) {
            return { ok: false, reason: SO_REASONS.CANCELLED, pack: null };
        }
        const mv = materialsFor(s, viewpoint, actor);
        const active = s.constraints.filter(function (c) { return !c.released; });
        const released = s.constraints.filter(function (c) { return c.released; });
        const open = s.openQuestions.filter(function (q) { return !q.resolved; });
        return {
            ok: true,
            reason: SO_REASONS.OK,
            pack: {
                sceneId: s.id,
                stage: s.stage,
                state: s.state,
                goal: s.goal,
                actors: s.actors.slice(),
                viewpoint: VIEWPOINTS.indexOf(str(viewpoint)) >= 0 ? str(viewpoint) : 'narrator',
                actor: str(actor),
                materials: mv.materials,
                constraints: active,
                releasedConstraints: released,
                recallables: s.recallables.slice(),
                openQuestions: open,
                turn: s.turn,
            },
        };
    }

    /* ---------- 读数 ---------- */
    /** 一行读数（诊断面）。 */
    function sceneLine(rawList) {
        try {
            const scenes = normalizeScenes(rawList);
            if (!scenes.length) return '暂无场景';
            let active = 0, cancelled = 0, closed = 0, constraints = 0, open = 0;
            for (const s of scenes) {
                if (s.state === SCENE_STATES.ACTIVE) active += 1;
                else if (s.state === SCENE_STATES.CANCELLED) cancelled += 1;
                else closed += 1;
                constraints += s.constraints.filter(function (c) { return !c.released; }).length;
                open += s.openQuestions.filter(function (q) { return !q.resolved; }).length;
            }
            const parts = ['场景 ' + scenes.length, '进行 ' + active];
            if (cancelled) parts.push('已取消 ' + cancelled);
            if (closed) parts.push('已收 ' + closed);
            parts.push('约束 ' + constraints);
            if (open) parts.push('未决 ' + open);
            return parts.join(' · ');
        } catch (e) { return '—（场景账异常）'; }
    }
    /** 自检（供宿主诊断面与判据调用；返回结构恒定）。 */
    function selfCheck() {
        const problems = [];
        let list = [{
            id: 'sc1',
            title: '重逢',
            stage: 'prepare',
            actors: ['甲', '乙'],
            goal: '说清当年的事',
            constraints: ['不能提她'],
            recallables: ['旧事一'],
            openQuestions: ['谁先开口'],
            materials: [
                { id: 'm1', source: 'summary', refId: 's1', title: '旧账', viewpoint: 'narrator' },
                { id: 'm2', source: 'diary', refId: 'd1', title: '他的想法', viewpoint: 'actor', actor: '甲' },
            ],
        }];
        const s = normalizeScene(list[0]);
        if (!s) problems.push('场景归一失败');
        /* 视角分面：叙述者材料不给角色 */
        const actorPack = materialsFor(s, 'actor', '甲');
        if (actorPack.materials.length !== 1) problems.push('角色视角材料数不对');
        if (actorPack.materials[0].id !== 'm2') problems.push('角色视角拿到了叙述者材料');
        const nar = materialsFor(s, 'narrator');
        if (nar.materials.length !== 1 || nar.materials[0].id !== 'm1') problems.push('叙述者视角材料不对');
        /* 另一个角色拿不到甲的材料 */
        const other = materialsFor(s, 'actor', '乙');
        if (other.materials.length !== 0) problems.push('乙不该拿到甲的材料');
        /* 推进：新增消息后材料变化，但约束仍在 */
        const adv = advance(list, 'sc1', { message: '乙先开口了', addedMaterials: [{ id: 'm3', source: 'floor', refId: 'f9', title: '开场', viewpoint: 'narrator' }] });
        if (!adv.ok) problems.push('推进失败');
        if (adv.changed.added.indexOf('m3') < 0) problems.push('推进未记录新增材料');
        if (adv.scene.constraints.length !== 1) problems.push('推进后约束不得消失');
        if (adv.scene.stage === 'prepare') problems.push('推进后幕次应前进');
        /* ★ 约束只增不减 */
        const more = advance(adv.list, 'sc1', { message: '继续' });
        if (more.scene.constraints.length !== 1) problems.push('二次推进后约束仍须在');
        /* 显式解除 */
        const rel = releaseConstraint(more.list, 'sc1', '不能提她');
        if (!rel.ok) problems.push('解除约束失败');
        if (rel.scene.constraints[0].released !== true) problems.push('解除后必须标 released');
        /* 取消即清场 */
        const can = cancel(rel.list, 'sc1');
        if (!can.ok) problems.push('取消失败');
        if (can.scene.constraints.length || can.scene.materials.length || can.scene.openQuestions.length) {
            problems.push('取消后不得残留任何任务');
        }
        if (can.scene.state !== SCENE_STATES.CANCELLED) problems.push('取消后状态不对');
        /* 取消后推进被拒 */
        const after = advance(can.list, 'sc1', { message: 'x' });
        if (after.ok) problems.push('已取消的场景不得再推进');
        return { ok: problems.length === 0, version: SO_VERSION, problems: problems };
    }

    const api = Object.freeze({
        normalizeMaterial, normalizeMaterials, normalizeScene, normalizeScenes, findScene,
        advance, cancel, releaseConstraint, materialsFor, scenePack,
        sceneLine, selfCheck,
        STAGES, VIEWPOINTS, SCENE_STATES, SO_REASONS, SCENE_LIMITS,
        SO_VERSION, SO_KIND,
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaSceneOrchestrator = api; } catch (_e) { /* ignore */ }
    }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null));