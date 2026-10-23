// [v3.365.0] engine-story-annual.js: 从 index.js 剥离的故事年度编年史与世界书导入操作集群
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaEngineStoryAnnual = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    let _ml = null;
    let _errLog = (e, ctx) => { try { console.error('[LonShaStoryAnnual]', ctx, e); } catch (_) {} };
    let _libs = {};
    const PLUGIN_NAME = 'LonSha记忆引擎';

    function bindDeps(deps) {
        if (deps) {
            if (typeof deps.moduleLib === 'function') _ml = deps.moduleLib;
            if (typeof deps.errLog === 'function') _errLog = deps.errLog;
            if (deps.libs && typeof deps.libs === 'object') _libs = deps.libs;
        }
    }

    function _moduleLib(getGlobal, fileName) {
        if (typeof _ml === 'function') return _ml(getGlobal, fileName);
        try {
            if (typeof getGlobal === 'function') {
                const g = getGlobal();
                if (g) return g;
            }
        } catch (_) {}
        if (typeof window !== 'undefined') {
            if (fileName === 'lore-import.js' && window.LonShaLoreImport) return window.LonShaLoreImport;
            if (fileName === 'story-annual.js' && window.LonShaStoryAnnual) return window.LonShaStoryAnnual;
            if (fileName === 'fact-version.js' && window.LonShaFactVersion) return window.LonShaFactVersion;
        }
        return null;
    }

    function _loreImportLib() {
        if (_libs && _libs.loreImport) return _libs.loreImport;
        return _moduleLib(() => window.LonShaLoreImport, 'lore-import.js');
    }

    function _storyAnnualLib() {
        if (_libs && _libs.storyAnnual) return _libs.storyAnnual;
        return _moduleLib(() => window.LonShaStoryAnnual, 'story-annual.js');
    }

    function _factVersionLib() {
        if (_libs && _libs.factVersion) return _libs.factVersion;
        return _moduleLib(() => window.LonShaFactVersion, 'fact-version.js');
    }

    function errLog(e, ctx) {
        if (typeof _errLog === 'function') _errLog(e, ctx);
    }

    function _o6RealOwners(engine) {
        const out = { owners: [], missing: [] };
        const arm = (k, getter) => {
            let v = null;
            try { v = getter(); } catch (e) { errLog(e, 'm4o6.' + k); v = null; }
            out[k] = (v === undefined) ? null : v;
            if (out[k] === null) out.missing.push(k); else out.owners.push(k);
            return out[k];
        };
        arm('summary', () => (engine.summary && typeof engine.summary.export === 'function') ? engine.summary.export() : null);
        arm('worldProg', () => (engine.worldProg && typeof engine.worldProg.export === 'function') ? engine.worldProg.export() : null);
        arm('timeline', () => (engine.timeline && Array.isArray(engine.timeline.entries)) ? engine.timeline.entries : null);
        arm('scene', () => (engine.scene && typeof engine.scene.export === 'function') ? engine.scene.export() : null);
        arm('events', () => engine._eventThreadState || null);
        arm('facts', () => engine._factVersionState || null);
        arm('suspense', () => (engine.suspense && Array.isArray(engine.suspense.items)) ? engine.suspense.items : null);
        arm('deltas', () => (engine.deltaBook && Array.isArray(engine.deltaBook.deltas)) ? engine.deltaBook.deltas : null);
        arm('actors', () => { const a = engine._qaKnownActors(0); return Array.isArray(a) ? a : null; });
        return out;
    }
    /** [v3.335.0 · M4-O6] 真源在场性与派生读数（**供诊断与判据观察**，不是账本、不落盘）。 */

    function annualSources(engine) {
        const O = engine._o6RealOwners();
        const chapters = engine._o6Chapters(O);
        const outcomes = engine._o6Outcomes(O);
        const past = engine._o6PastDetails(O);
        const known = engine._o6KnownFacts(O);
        const confirmed = engine._o6ConfirmedFacts(O);
        let entities = null;
        try { const a = engine._o6KnownEntities(); entities = Array.isArray(a) ? a.length : null; } catch (_e) { entities = null; }
        return {
            kind: 'm4o6_sources', version: 1,
            owners: O.owners.slice(), missing: O.missing.slice(),
            chapters: (chapters && Array.isArray(chapters.chapters)) ? chapters.chapters.length : null,
            outcomes: Array.isArray(outcomes) ? outcomes.length : null,
            pastDetails: Array.isArray(past) ? past.length : null,
            knownActors: known ? Object.keys(known).length : null,
            confirmedFacts: confirmed ? Object.keys(confirmed).length : null,
            knownEntities: entities,
            epoch: (typeof engine._mutationEpoch === 'number') ? engine._mutationEpoch : null,
            writesNothing: true,
            note: '六个私有槽仍优先;本面只报派生层从真源取到了什么(null = 未判,不是空)'
        };
    }
    /** [v3.335.0 · M4-O6] 真实聊天读取口（拿不到 ⇒ null ⇒ 原话面报未判，不编）。 */

    function _o6Chat(engine) {
        try {
            const st = (typeof window !== 'undefined' && window.SillyTavern) ? window.SillyTavern : null;
            const ctx = (st && typeof st.getContext === 'function') ? st.getContext() : null;
            return (ctx && Array.isArray(ctx.chat)) ? ctx.chat : null;
        } catch (e) { errLog(e, 'm4o6.chat'); return null; }
    }
    /** [v3.335.0 · M4-O6] 原话选取器：只取**该楼正文**里的引号原句（不生成、不改写）。 */

    function _o6Quotes(engine, floor, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const max = Math.max(1, Math.min(5, Number(o.max) || 3));
        const chat = engine._o6Chat();
        if (!chat) return null;
        const f = Number(floor);
        if (!Number.isFinite(f) || f < 0 || f >= chat.length) return [];
        const m = chat[f];
        const raw = String((m && (m.mes || m.content)) || '');
        if (!raw) return [];
        const out = [];
        const re = /[「“"]([^」”"\n]{2,60})[」”"]/g;
        let hit = re.exec(raw);
        while (hit && out.length < max) {
            const t = String(hit[1]).trim();
            if (t) out.push({ floor: f, text: t, speaker: '' });
            hit = re.exec(raw);
        }
        return out;
    }
    /** [v3.335.0 · M4-O6] 卷章面：真章节来自真卷记录（无卷 ⇒ 未判，不猜章界）。 */

    function _o6Chapters(engine, O) {
        const S = (O && O.summary) ? O.summary : null;
        if (!S) return null;
        const vols = Array.isArray(S.volumes) ? S.volumes : [];
        const hist = Array.isArray(S.historical) ? S.historical : [];
        const chapters = [];
        const push = (id, title, from, to, text) => {
            const f = Number(from);
            if (!Number.isFinite(f)) return;
            const t = Number(to);
            const idx = chapters.length + 1;
            chapters.push({
                ref: { project: '', volume: String(id || ('vol' + idx)), chapter: String(idx) },
                title: title || ('第 ' + idx + ' 章'),
                floorFrom: f, floorTo: Number.isFinite(t) ? t : f,
                summary: String(text || ''),
                events: [], changes: [], open: [], quotes: []
            });
        };
        for (const v of vols) {
            if (!v || typeof v !== 'object') continue;
            const f = Number(v.floorStart), t = Number(v.floorEnd);
            push(v.id, '第 ' + (chapters.length + 1) + ' 章（第' + (Number.isFinite(f) ? f : 0) + '-' + (Number.isFinite(t) ? t : 0) + '楼）', f, t, v.text);
        }
        for (const h of hist) {
            if (!h || typeof h !== 'object') continue;
            push(h.id, null, h.floorStart, h.floorEnd, h.text);
        }
        if (!chapters.length) return null;
        const tl = Array.isArray(O.timeline) ? O.timeline : [];
        const ev = (O.events && Array.isArray(O.events.events)) ? O.events.events : [];
        const facts = (O.facts && Array.isArray(O.facts.facts)) ? O.facts.facts : [];
        const promises = (O.worldProg && Array.isArray(O.worldProg.promises)) ? O.worldProg.promises : [];
        const sus = Array.isArray(O.suspense) ? O.suspense : [];
        for (const c of chapters) {
            const inRange = (f) => Number.isFinite(f) && f >= c.floorFrom && f <= c.floorTo;
            for (const t of tl) {
                const f = Number(t && t.floor);
                if (!inRange(f)) continue;
                c.events.push({ floor: f, text: String(t.text || ''), chars: Array.isArray(t.characters) ? t.characters.slice(0, 6) : [] });
            }
            for (const e of ev) {
                const segs = Array.isArray(e && e.segments) ? e.segments : [];
                for (const s of segs) {
                    const f = Number(s && s.floor);
                    if (!inRange(f)) continue;
                    c.events.push({ floor: f, text: String((e.title || '') + '：' + (s.text || '')), chars: Array.isArray(e.actors) ? e.actors.slice(0, 6) : [] });
                }
            }
            for (const fa of facts) {
                const f = Number(fa && fa.floor);
                if (!inRange(f)) continue;
                const org = String(fa.origin || '');
                if (org !== 'confirmed' && org !== 'stated') continue;
                c.changes.push({ char: String(fa.subject || ''), to: String(fa.predicate || '') + '：' + String(fa.value || ''), floor: f });
            }
            for (const p of promises) {
                const f = Number(p && p.floor);
                if (!inRange(f)) continue;
                const st = String(p.status || '');
                if (st === 'fulfilled' || st === 'broken') continue;
                c.open.push({ key: 'promise:' + String(p.id || ''), text: String(p.character || '通用') + '：' + String(p.content || ''), floor: f });
            }
            for (const s of sus) {
                const f = Number(s && s.floor);
                if (!inRange(f)) continue;
                if (String(s.status || '') !== 'open') continue;
                c.open.push({ key: 'suspense:' + String(s.sid || s.id || ''), text: String(s.content || ''), floor: f });
            }
            const q = engine._o6Quotes(c.floorFrom, { max: 3 });
            if (q && q.length) c.quotes = q.slice(0, 3);
        }
        return { chapters: chapters, source: 'summary-volumes+historical' };
    }
    /** [v3.335.0 · M4-O6] 分层摘要读口：真读数快照（SummarySystem 的真实导出）。 */

    function _o6Summary(engine, O) {
        const S = (O && O.summary) ? O.summary : null;
        if (!S) return null;
        const vols = Array.isArray(S.volumes) ? S.volumes : [];
        const hist = Array.isArray(S.historical) ? S.historical : [];
        const locked = Array.isArray(S.lockedFacts) ? S.lockedFacts : [];
        const sums = Array.isArray(S.summaries) ? S.summaries : [];
        return {
            source: 'summary-system',
            summaries: sums.length, volumes: vols.length, historical: hist.length, lockedFacts: locked.length,
            activeVolumes: vols.filter((v) => v && v.archived !== true).length,
            entries: sums.map((s) => ({ floor: s && s.floor, text: String((s && s.text) || '') })),
            spans: vols.map((v) => ({ id: (v && v.id) || '', floorStart: v && v.floorStart, floorEnd: v && v.floorEnd, archived: !!(v && v.archived) })),
            chronicle: hist.map((h) => ({ id: (h && h.id) || '', floorStart: h && h.floorStart, floorEnd: h && h.floorEnd, text: String((h && h.text) || '') })),
            locked: locked.map((f) => ({ id: (f && f.id) || '', floor: f && f.floor, text: String((f && f.text) || '') }))
        };
    }
    /**
     * [v3.335.0 · M4-O6] 结局条目：来自**真源**两处 ——
     *   ① 真跑过的两分支只读对照（`branchComparison`）里 `kind:'changed'` 的逐面差异：
     *      同一个 collision 位上 A 侧与 B 侧取值不同 ⇒ 正是「两条支线结局不能同时成立」；
     *      该对照由 branch-semantics 产出（秘密已在那侧剥过），本层**不复制掩码实现**。
     *   ② 真终局项：承诺账本（fulfilled/broken）与悬项簿（resolved）——`terminal:true`。
     * ★ `terminal` 只在 ② 给 true；① 侧一律 null（对照不说「这是不是结局」，
     *   把「不知道」读成 false 是本仓治过多轮的错读数）。
     * ★ 真源在场而一条结局都没有 ⇒ 返回空表（**查过、没有**）；真源缺席 ⇒ null（未判）。
     */

    function _o6Outcomes(engine, O) {
        if (!O) return null;
        const WP = (O.worldProg && typeof O.worldProg === 'object') ? O.worldProg : null;
        const hasSus = Array.isArray(O.suspense);
        if (!WP && !hasSus) return null;
        const rows = [];
        const cmp = (engine.worldProg && engine.worldProg.branchComparison) ? engine.worldProg.branchComparison : null;
        if (cmp && Array.isArray(cmp.owners)) {
            for (const ow of cmp.owners) {
                const faces = (ow && ow.faces) ? ow.faces : {};
                for (const face of Object.keys(faces)) {
                    const fc = faces[face];
                    /* 不可比的面**不参与冲突判定**（与内核同口径）。 */
                    if (!fc || fc.comparable !== true) continue;
                    const list = Array.isArray(fc.deltas) ? fc.deltas : [];
                    for (const d of list) {
                        if (!d || String(d.kind) !== 'changed') continue;
                        const slot = String(face) + ':' + String(d.key);
                        const fa = (d.from && Number.isFinite(Number(d.from.a))) ? Number(d.from.a) : null;
                        const fb = (d.from && Number.isFinite(Number(d.from.b))) ? Number(d.from.b) : null;
                        rows.push({ collision: slot, branch: 'a', slot: slot, title: String(d.key || ''), floor: fa, value: d.a, terminal: null });
                        rows.push({ collision: slot, branch: 'b', slot: slot, title: String(d.key || ''), floor: fb, value: d.b, terminal: null });
                    }
                }
            }
        }
        const promises = Array.isArray(WP && WP.promises) ? WP.promises : [];
        for (const p of promises) {
            const st = String((p && p.status) || '');
            if (st !== 'fulfilled' && st !== 'broken') continue;
            const f = Number(p && p.floor);
            rows.push({
                collision: 'promise:' + String((p && p.id) || ''), branch: 'live',
                title: String((p && p.content) || ''), floor: Number.isFinite(f) ? f : null,
                value: st + ':' + String((p && p.character) || ''), terminal: true
            });
        }
        const sus = Array.isArray(O.suspense) ? O.suspense : [];
        for (const s of sus) {
            if (String((s && s.status) || '') !== 'resolved') continue;
            const f = Number(s && s.resolvedFloor);
            rows.push({
                collision: 'suspense:' + String((s && (s.sid || s.id)) || ''), branch: 'live',
                title: String((s && s.content) || ''), floor: Number.isFinite(f) ? f : null,
                value: String((s && s.outcome) || 'done'), terminal: true
            });
        }
        return rows;
    }
    /**
     * [v3.335.0 · M4-O6] 可唤回的旧事：来自**真源**三处 ——
     *   时间线（带真实楼层与剧情日期）、场所到访史（`visits`）、用户锁定事实。
     *   地基键（`keys`）只写真源里**确实有**的东西：`anniversary:<日期>` / `person:<角色>` /
     *   `place:<场所>`；凑不出地基的旧事不出候选（命中判据是交集，硬塞等于放大召回）。
     * ★ 一处旧事都没有 ⇒ null（未判）；**不报「没有旧事」**。
     */

    function _o6PastDetails(engine, O) {
        if (!O) return null;
        const rows = [];
        const tl = Array.isArray(O.timeline) ? O.timeline : [];
        for (const t of tl) {
            const floor = Number(t && t.floor);
            if (!Number.isFinite(floor)) continue;
            const chars = Array.isArray(t.characters) ? t.characters.filter(Boolean).slice(0, 6) : [];
            const keys = [];
            const date = String((t && t.date) || '').trim();
            if (date) keys.push('anniversary:' + date);
            for (const c of chars) keys.push('person:' + String(c));
            const text = String((t && t.text) || '');
            rows.push({
                key: 'tl:' + String((t && t.id) || floor), title: text.slice(0, 72),
                keys: keys, subjects: chars.slice(), floor: floor, day: null,
                weight: Math.max(1, Math.min(100, (Number(t && t.importance) || 5) * 10)),
                hint: text.slice(0, 120), text: text,
                source: { kind: 'floor', ref: 'tl:' + String((t && t.id) || floor), floor: floor }
            });
        }
        const visits = (O.scene && Array.isArray(O.scene.visits)) ? O.scene.visits : [];
        for (const pair of visits) {
            if (!Array.isArray(pair) || pair.length < 2) continue;
            const key = String(pair[0]);
            const v = (pair[1] && typeof pair[1] === 'object') ? pair[1] : {};
            const leaf = key.split('/').filter(Boolean).pop() || key;
            const f = Number.isFinite(Number(v.lastFloor)) ? Number(v.lastFloor) : Number(v.firstFloor);
            if (!Number.isFinite(f)) continue;
            const cnt = Number(v.count) || 1;
            rows.push({
                key: 'visit:' + key, title: '旧地：' + leaf, keys: ['place:' + leaf],
                subjects: [], floor: f, day: null,
                weight: Math.max(10, Math.min(90, 20 + cnt * 10)),
                hint: '这一处场所到访过 ' + cnt + ' 次', text: '',
                source: { kind: 'floor', ref: 'visit:' + key, floor: f }
            });
        }
        const locked = (O.summary && Array.isArray(O.summary.lockedFacts)) ? O.summary.lockedFacts : [];
        for (const f of locked) {
            if (!f) continue;
            const fl = Number.isFinite(Number(f.floor)) ? Number(f.floor) : null;
            const text = String((f && f.text) || '');
            rows.push({
                key: 'locked:' + String((f && f.id) || ''), title: text.slice(0, 72),
                keys: [], subjects: [], floor: fl, day: null, weight: 60,
                hint: text.slice(0, 120), text: text,
                source: { kind: 'floor', ref: 'locked:' + String((f && f.id) || ''), floor: fl }
            });
        }
        return rows.length ? rows : null;
    }
    /**
     * [v3.335.0 · M4-O6] 角色知情名单：`KNOWN_FACTS[actor] = [主体名...]`。
     *   主体名**只来自真源可溯的三处**：角色自己的名字（真实体名册）、
     *   该角色在事实账 / 知识轨迹里**确实关联到**的事实主体（按值/谓词同文匹配）、
     *   以及该角色在承诺账本里的对手方。
     * ★ 一个角色都没有 ⇒ null（**不建议**，与「角色确实不知道」不同形——
     *   本层不替角色把「没记过」写成「不知道」）。
     */

    function _o6KnownFacts(engine, O) {
        if (!O) return null;
        const WP = (O.worldProg && typeof O.worldProg === 'object') ? O.worldProg : null;
        const actors = Array.isArray(O.actors) ? O.actors : [];
        const facts = (O.facts && Array.isArray(O.facts.facts)) ? O.facts.facts : [];
        const traces = (WP && WP.knowledgeTraces && Array.isArray(WP.knowledgeTraces.traces)) ? WP.knowledgeTraces.traces : [];
        const promises = Array.isArray(WP && WP.promises) ? WP.promises : [];
        const knowledge = (WP && WP.knowledge && typeof WP.knowledge === 'object') ? WP.knowledge : {};
        const hits = (text, f) => {
            const t = String(text || '');
            if (!t) return false;
            const val = String((f && f.value) || '');
            const pre = String((f && f.predicate) || '');
            return (!!val && t.indexOf(val) >= 0) || (!!pre && t.indexOf(pre) >= 0);
        };
        const out = {};
        let n = 0;
        for (const a of actors) {
            const name = String(a || '').trim();
            if (!name) continue;
            const set = [name];
            const add = (x) => { const v = String(x || '').trim(); if (v && set.indexOf(v) < 0 && set.length < 40) set.push(v); };
            const k = knowledge[name];
            for (const t of ((k && Array.isArray(k.known)) ? k.known : [])) {
                for (const f of facts) if (hits(t, f)) add(f.subject);
            }
            for (const tr of traces) {
                if (String(tr && tr.character) !== name) continue;
                const act = String((tr && tr.action) || '');
                if (act !== 'acquire' && act !== 'correct') continue;
                for (const f of facts) if (hits(tr.fact, f)) add(f.subject);
            }
            for (const p of promises) {
                if (String(p && p.character) !== name) continue;
                add(p.counterpart);
            }
            out[name] = set;
            n += 1;
        }
        return n ? out : null;
    }
    /**
     * [v3.335.0 · M4-O6] 已确认事实键值（资料导入与正史选择共用的「不自动覆盖」判据源）。
     *   只收**真源里真是已确认**的两类：事实账里 `origin:'confirmed'` 的断言、
     *   以及用户**亲手锁定**的事实（`lockedFacts`）。
     * ★ 两个真源都在场而一条都没有 ⇒ {} = 「查过、没有」；两源都缺席 ⇒ null = 未判。
     */

    function _o6ConfirmedFacts(engine, O) {
        if (!O) return null;
        const factsOwner = (O.facts && Array.isArray(O.facts.facts)) ? O.facts.facts : null;
        const lockedOwner = (O.summary && Array.isArray(O.summary.lockedFacts)) ? O.summary.lockedFacts : null;
        if (factsOwner === null && lockedOwner === null) return null;
        const out = {};
        for (const f of (factsOwner || [])) {
            if (!f || String(f.origin) !== 'confirmed') continue;
            out['fact:' + String(f.subject || '') + '|' + String(f.predicate || '')] = String(f.value || '');
        }
        for (const f of (lockedOwner || [])) {
            if (!f) continue;
            out['locked:' + String(f.id || '')] = String(f.text || '');
        }
        return out;
    }
    /** [v3.335.0 · M4-O6] 已登记实体名：复用既有**唯一**装配点 `_qaKnownActors()`。 */

    function _o6KnownEntities(engine) {
        if (Array.isArray(engine._loreKnownEntities) && engine._loreKnownEntities.length) return engine._loreKnownEntities;
        try {
            const a = engine._qaKnownActors(0);
            return (Array.isArray(a) && a.length) ? a : null;
        } catch (e) { errLog(e, 'm4o6.knownEntities'); return null; }
    }
    /* ────────────────────────────────────────────────────────────────────────
     * [v3.327.0 · E 包 M3-X5] 设定资料与前史分层导入面
     *
     * 【宿主只做三件事,绝不自己算】
     *   1 **装配**:已登记实体名 / 已确认事实 / 受限正文键经 `_loreImportDeps()` 注入
     *      (唯一装配点,键名与 `lore-import.js` 的 `REQUIRED_DEPS[].key` 逐字一致
     *      —— 改名会静默变成「依赖缺席」,故判据套件按名对账);
     *   2 **转发**:出口把实参原样交给内核,**不改写返回值**;
     *   3 **留痕**:只留读数摘要(存整篇资料就是第二份证据库,且受限条目会随之外泄)。
     *
     * 【一个不可让步的口径】三件依赖**全为可选**:缺席即对应面降级并具名
     *   —— 「映射面未判」与「没有映射」**不同形**,「冲突面未判」与「无冲突」也不同形。
     *   把不知道写成没有,正是本仓治过多轮的错读数。
     */
    /** [v3.327.0 · M3-X5] 资料导入面的**唯一装配点**。 */

    function _loreImportDeps(engine) {
        const BS = _moduleLib(() => window.LonShaBranchSemantics, 'branch-semantics.js');
        /* [v3.335.0 · M4-O6] 已登记实体名改走既有唯一装配点;已确认事实改走真实供数派生层。 */
        const O = engine._o6RealOwners();
        return {
            KNOWN_ENTITIES: engine._o6KnownEntities(),
            CONFIRMED_FACTS: (engine._loreConfirmedFacts && typeof engine._loreConfirmedFacts === 'object') ? engine._loreConfirmedFacts : engine._o6ConfirmedFacts(O),
            SECRET_BODY_KEYS: (BS && Array.isArray(BS.SECRET_BODY_KEYS) && BS.SECRET_BODY_KEYS.length) ? BS.SECRET_BODY_KEYS : null
            /* ★ 只给**该给的**三件:`REQUIRED_DEPS` 之外的键一律不塞。 */
        };
    }
    /** [v3.327.0 · M3-X5] 内核不可达时的**同键降级**(面不可用 ≠ 这份资料没问题)。 */

    function _loreImportAbsent(engine, reason) {
        const r = (typeof reason === 'string' && reason) ? reason : 'module-absent';
        return { ok: false, source: null, sections: [], items: [], classes: {}, why: [r], reason: r, absent: true };
    }
    /** [v3.327.0 · M3-X5] 解析分层(**只读**;不抛、零写)。 */

    function loreImportParse(engine, raw, opts) {
        const LI = _loreImportLib();
        if (!LI || typeof LI.parseSource !== 'function') return engine._loreImportAbsent();
        try {
            const deps = engine._loreImportDeps();
            const merged = Object.assign({}, opts || {}, {
                secretBodyKeys: deps.SECRET_BODY_KEYS,
                carriers: (opts && opts.carriers) || null,
            });
            const res = LI.parseSource(raw, merged);
            engine._lastLoreImport = {
                at: Date.now(), sections: (res.sections || []).length, items: (res.items || []).length,
                classes: Object.assign({}, res.classes), truncated: res.truncated === true,
                secretKeysKnown: !!deps.SECRET_BODY_KEYS,
            };
            return res;
        } catch (e) { errLog(e, 'plugin.loreImportParse'); return engine._loreImportAbsent('thrown'); }
    }
    /** [v3.334.0 · M4-O5] 窗口解析(**只读**;长资料局部导入的正规入口)。
     *  截断源在 parseSource 已被拒(ok:false + source-truncated);
     *  本出口给「显式选范围逐段导入」一条真路径:窗口对齐段边界,
     *  完整度独立核算(readChars/totalChars/nextCursor),回源带全文件坐标。 */

    function loreImportParseWindow(engine, raw, opts) {
        const LI = _loreImportLib();
        if (!LI || typeof LI.parseSourceWindow !== 'function') {
            /* 同键降级 + 完整度 unknown(模块旧版无此面 ≠ 资料没读完)。 */
            const from = (opts && opts.range && typeof opts.range.from === 'number') ? opts.range.from : 0;
            return Object.assign(engine._loreImportAbsent('window-unsupported'), {
                completeness: { state: 'unknown', totalChars: null, readChars: from, truncated: null, nextCursor: null },
                window: null,
            });
        }
        try {
            const deps = engine._loreImportDeps();
            const merged = Object.assign({}, opts || {}, {
                secretBodyKeys: deps.SECRET_BODY_KEYS,
                carriers: (opts && opts.carriers) || null,
            });
            const res = LI.parseSourceWindow(raw, merged);
            engine._lastLoreImport = {
                at: Date.now(), sections: (res.sections || []).length, items: (res.items || []).length,
                classes: Object.assign({}, res.classes), truncated: false,
                window: (res.window ? { from: res.window.from, to: res.window.to, hasNext: res.window.hasNext } : null),
                completeness: (res.completeness ? res.completeness.state : 'unknown'),
                secretKeysKnown: !!deps.SECRET_BODY_KEYS,
            };
            return res;
        } catch (e) { errLog(e, 'plugin.loreImportParseWindow'); return Object.assign(engine._loreImportAbsent('thrown'), { completeness: { state: 'unknown', totalChars: null, readChars: 0, nextCursor: null }, window: null }); }
    }
    /** [v3.327.0 · M3-X5] 实体映射(**映射必须确认**;未给清单 ⇒ 未判,不报「无映射」)。 */

    function loreImportEntities(engine, parsed, opts) {
        const LI = _loreImportLib();
        if (!LI || typeof LI.entityCandidates !== 'function') return { checked: false, exact: 0, needsConfirm: 0, unresolved: 0, entries: [], why: ['module-absent'] };
        try {
            const deps = engine._loreImportDeps();
            const list = (opts && opts.knownEntities) || deps.KNOWN_ENTITIES;
            const res = LI.entityCandidates(parsed, list, opts || {});
            engine._lastLoreMapping = { at: Date.now(), checked: res.checked === true, exact: res.exact, needsConfirm: res.needsConfirm, unresolved: res.unresolved };
            return res;
        } catch (e) { errLog(e, 'plugin.loreImportEntities'); return { checked: false, exact: 0, needsConfirm: 0, unresolved: 0, entries: [], why: ['thrown'] }; }
    }
    /** [v3.327.0 · M3-X5] 逐条 diff(**冲突默认不替用户决定**)。 */

    function loreImportPreview(engine, parsed, target, opts) {
        const LI = _loreImportLib();
        if (!LI || typeof LI.diffPreview !== 'function') return { verdict: 'blocked', entries: [], add: 0, same: 0, conflict: 0, mapping: 0, dangling: 0, skipped: 0, total: 0, confirmedChecked: false, knownRefsChecked: false, why: ['module-absent'] };
        try { return LI.diffPreview(parsed, target, opts || {}); }
        catch (e) { errLog(e, 'plugin.loreImportPreview'); return { verdict: 'blocked', entries: [], add: 0, same: 0, conflict: 0, mapping: 0, dangling: 0, skipped: 0, total: 0, confirmedChecked: false, knownRefsChecked: false, why: ['thrown'] }; }
    }
    /** [v3.327.0 · M3-X5] 出导入计划(**只算不写**;幂等表由调用方持有并回传)。 */

    function loreImportPlan(engine, parsed, preview, opts) {
        const LI = _loreImportLib();
        if (!LI || typeof LI.planApply !== 'function') return { ok: false, importId: '', duplicate: false, applied: [], count: 0, total: 0, skipped: [], reason: 'module-absent', writesNothing: true };
        try { return LI.planApply(parsed, preview, opts || {}); }
        catch (e) { errLog(e, 'plugin.loreImportPlan'); return { ok: false, importId: '', duplicate: false, applied: [], count: 0, total: 0, skipped: [], reason: 'thrown', writesNothing: true }; }
    }
    /** [v3.327.0 · M3-X5] 变更段(**源更新只重审变更段**)。 */

    function loreImportChanged(engine, oldParsed, newParsed) {
        const LI = _loreImportLib();
        if (!LI || typeof LI.changedSections !== 'function') return { added: [], removed: [], changed: [], same: [], counts: { added: 0, removed: 0, changed: 0, same: 0 }, oldChecked: false, why: ['module-absent'] };
        try { return LI.changedSections(oldParsed, newParsed); }
        catch (e) { errLog(e, 'plugin.loreImportChanged'); return { added: [], removed: [], changed: [], same: [], counts: { added: 0, removed: 0, changed: 0, same: 0 }, oldChecked: false, why: ['thrown'] }; }
    }
    /** [v3.327.0 · M3-X5] 面自述(依赖缺哪一格、缺了会怎样)。 */

    function loreImportDescribe(engine) {
        const LI = _loreImportLib();
        if (!LI || typeof LI.describe !== 'function') {
            return { kind: 'lore_import', version: 0, classes: [], classLabels: [], origin: [], admit: [], preview: [], secretBodyKeys: [], secretMask: '', maxSourceChars: 0, present: 0, total: 0, missing: [], classesExhaustive: false, maskFixedLength: false, settingVsHappenedSplit: false, offline: true, writesNothing: true, note: '资料导入模块未加载(lore-import.js)', reason: 'module-unavailable' };
        }
        try {
            const d = LI.describe(engine._loreImportDeps());
            d.reason = (d.missing && d.missing.length) ? 'deps-missing' : '';
            return d;
        } catch (e) { errLog(e, 'plugin.loreImportDescribe'); return { kind: 'lore_import', version: 0, classes: [], classLabels: [], origin: [], admit: [], preview: [], secretBodyKeys: [], secretMask: '', maxSourceChars: 0, present: 0, total: 0, missing: [], classesExhaustive: false, maskFixedLength: false, settingVsHappenedSplit: false, offline: true, writesNothing: true, note: '自述抛错', reason: 'thrown' }; }
    }
    /** [v3.327.0 · M3-X5] 诊断一行。**四种坏法分开写**:模块没挂 / 受限键不识别
     *   (则无法剥正文 ⇒ 拒绝解读)/ 口径不自洽(类目不可穷尽)/ 面在位。 */

    function loreImportLine(engine) {
        try {
            const LI = _loreImportLib();
            if (!LI || typeof LI.line !== 'function') return '模块未加载(lore-import.js)';
            const d = engine.loreImportDescribe();
            if (d.reason === 'module-unavailable') return '模块未加载(lore-import.js)';
            if (d.reason === 'thrown') return '—(诊断异常)';
            if (d.classesExhaustive === false) return '⚠️ 四类分层不可穷尽(有类无处安放)';
            if (d.maskFixedLength === false) return '⚠️ 受限正文掩码不是定长(长度本身成了读数)';
            const last = engine._lastLoreImport || null;
            if (!last) return '待导入(面在位 · 四类分层 · 离线 · 依赖 ' + d.present + '/' + d.total + ')';
            return LI.line(Object.assign({ verdict: 'parsed' }, last, { conflict: (engine._lastLoreMapping || {}).needsConfirm || 0 }));
        } catch (e) { errLog(e, 'plugin.loreImportLine'); return '—(诊断异常)'; }
    }
    /* ────────────────────────────────────────────────────────────────────────
     * [v3.339.0 · M4-X1] 资料导入的**人工校订 + 落笔**面（导入旅程闭合）
     *
     * 【修的是什么（修前实测，读码口径）】v3.327.0 起宿主有八个 `loreImport*` 出口，
     *   但**全是只读**：`loreImportPlan` 的 `writesNothing` 恒 true，全仓零 `loreImportApply`
     *   —— 计划能出、没人能落 owner；`applyOverrides`/`reclassify`/`splitText` 在
     *   v3.339.0 已进内核，宿主侧仍无出口；`entityCandidates` 出 `needs-confirm`、
     *   `diffPreview` 吃 `mappingNeedsConfirm`，中间**没有面把确认结果接回**。
     *   于是「导入→改类→同名映射→选入→保存→重开可查→源更新→只复审变更」这条
     *   验收旅程断在「保存」这一跳。
     *
     * 【宿主只做四件事，绝不自己算】
     *   1 **装配**：落笔 owner（前情文本 = PrequelSystem 写面；已确认事实 = fact-version
     *      读面）经 `_loreImportOwners()` 注入；
     *   2 **转发**：人工校订 / 映射确认两面把实参原样交给内核，不改写返回值；
     *   3 **落笔**：`loreImportApply` 按四步顺序（出计划→只落 selected→owner 改数据并读
     *      真账核验→落盘回读）真写入 —— 与 `applyCorrectionPlan` 同款纪律，**不建第三套状态机**；
     *   4 **留痕**：只留读数摘要与幂等键（importId / 段键 / 人工决定），**不存整篇资料**
     *      （存整篇就是第二份证据库，且受限条目会随之外泄）。
     *
     * 【三条不可让步口径】
     *   1 **规则不冒充已发生**：setting-rule 段一律落**前情文本**（PrequelSystem 注入时
     *      自带「旧状态不代表现在仍持续」声明），**绝不写进事实账** —— 写进事实账就等于
     *      把世界观规则读成聊天里发生过的事（这正是本模块立项要治的错读数）。
     *   2 **未选段不写**：`selected` 未给的段具名 `not-selected`（内核已具名），一个字节不落。
     *   3 **同源重复导入幂等**：`importId` 已在 `_loreImportLedger.seen` ⇒ 不重复落。
     */
    /** [v3.339.0 · M4-X1] 落笔 owner 的**唯一装配点**（前情写面 + 事实读面 + 幂等面）。 */

    function _loreImportOwners(engine) {
        const self = this;
        const ledger = self._loreImportLedgerState();
        return {
            /* 前情写面：整篇文本一团的既有 owner（`memory-books.js::PrequelSystem`）。 */
            prequel: function (text) {
                if (!self.prequel || typeof self.prequel.importPrequel !== 'function') return { ok: false, reason: 'no-organ' };
                const r = self.prequel.importPrequel(text);
                if (!r || r.ok !== true) return { ok: false, reason: 'rejected' };
                return { ok: true, chars: r.chars, truncated: r.truncated === true };
            },
            /* 事实读面：已确认事实（对照用，**只读** —— 导入不写事实账）。 */
            confirmedFacts: function () {
                const O = self._o6RealOwners();
                return self._o6ConfirmedFacts(O);
            },
            /* 幂等面：importId 是否已落过（真源在调用方，本面只读）。 */
            seen: function () { return ledger.seen.slice(); },
        };
    }
    /** [v3.339.0 · M4-X1] 资料导入账的**懒初始化**（随聊天持久化；只存幂等键与人工决定）。 */

    function _loreImportLedgerState(engine) {
        if (!engine._loreImportLedger || typeof engine._loreImportLedger !== 'object') {
            engine._loreImportLedger = { version: 1, seen: [], importedText: '', decisions: {}, mappings: {}, lastApply: null };
        }
        const L = engine._loreImportLedger;
        if (!Array.isArray(L.seen)) L.seen = [];
        if (typeof L.importedText !== 'string') L.importedText = '';
        if (!L.decisions || typeof L.decisions !== 'object') L.decisions = {};
        if (!L.mappings || typeof L.mappings !== 'object') L.mappings = {};
        return L;
    }
    /** [v3.339.0 · M4-X1] 人工校订叠加（**零写**；转发内核 `applyOverrides`）。 */

    function loreImportOverride(engine, parsed, overrides, opts) {
        const LI = _loreImportLib();
        if (!LI || typeof LI.applyOverrides !== 'function') return { ok: false, items: [], applied: 0, rejected: [], counts: {}, why: ['module-absent'] };
        try {
            const res = LI.applyOverrides(parsed, overrides, Object.assign({}, opts || {}));
            engine._lastLoreOverride = {
                at: Date.now(), applied: res.applied, rejected: (res.rejected || []).length,
                manual: (res.items || []).filter(function (x) { return x.manual === true; }).length,
            };
            return res;
        } catch (e) { errLog(e, 'plugin.loreImportOverride'); return { ok: false, items: [], applied: 0, rejected: [], counts: {}, why: ['thrown'] }; }
    }
    /** [v3.339.0 · M4-X1] 同名映射确认回填（**零写**；把 needs-confirm 的裁决接回预览面）。
     *   输入 `mapping` 形态：`{ itemKey: ownerName }`（人工确认「这一段说的是谁」）。
     *   输出 `{ checked, needsConfirm, resolved, unresolved, mappingNeedsConfirm, why }` ——
     *   未确认的段进 `mappingNeedsConfirm`（交给 `diffPreview` 的 `opts.mappingNeedsConfirm`），
     *   **不得静默合并**（同名异人合并正是本仓治过多轮的错读数）。 */

    function loreImportConfirmMapping(engine, parsed, mapping, opts) {
        const LI = _loreImportLib();
        if (!LI || typeof LI.entityCandidates !== 'function') return { checked: false, needsConfirm: [], resolved: [], unresolved: 0, mappingNeedsConfirm: [], why: ['module-absent'] };
        try {
            const deps = engine._loreImportDeps();
            const o = opts || {};
            const cand = LI.entityCandidates(parsed, o.knownEntities || deps.KNOWN_ENTITIES, o);
            const pick = (mapping && typeof mapping === 'object') ? mapping : {};
            const needsConfirm = [], resolved = [];
            for (const e of (cand.entries || [])) {
                if (e.verdict !== 'needs-confirm') continue;
                const chosen = String(pick[e.itemKey] == null ? '' : pick[e.itemKey]).trim();
                if (chosen) resolved.push({ itemKey: e.itemKey, owner: chosen, hits: e.hits });
                else needsConfirm.push({ itemKey: e.itemKey, hits: e.hits, why: e.why });
            }
            engine._lastLoreMapping = { at: Date.now(), checked: cand.checked === true, exact: cand.exact, needsConfirm: needsConfirm.length, unresolved: cand.unresolved };
            return {
                checked: cand.checked === true, needsConfirm: needsConfirm, resolved: resolved,
                unresolved: cand.unresolved, mappingNeedsConfirm: needsConfirm.map(function (x) { return x.itemKey; }),
                why: (cand.why || []).slice(),
            };
        } catch (e) { errLog(e, 'plugin.loreImportConfirmMapping'); return { checked: false, needsConfirm: [], resolved: [], unresolved: 0, mappingNeedsConfirm: [], why: ['thrown'] }; }
    }
    /** [v3.339.0 · M4-X1] **资料导入落笔**（原生确认后的真写入）。
     *
     * 顺序**不可换**（与 `applyCorrectionPlan` 同款四步，理由逐条相同）：
     *   ① 人工校订先叠（改类 / 拆分）→ 出计划（未预览 ⇒ 拒；`selected` 未给的段由内核具名）；
     *   ② 只落 `selected` 的段（未选段一个字节不动）；
     *   ③ owner 改数据（前情文本 = PrequelSystem）→ 立刻读**本行真账**核验；
     *   ④ 落盘 + 回读（一次），再给回执与幂等读数。
     *
     * @param {object} parsed   `loreImportParse` 的产物
     * @param {object} preview  `loreImportPreview` 的产物（**必须先预览**）
     * @param {object} opts {
     *   selected: [itemKey],        —— 选入面（未给的段不写）
     *   overrides: [...],           —— 人工校订（改类 / 拆分），先叠再落
     *   append: boolean,            —— 追加到既有前情（默认 true）；false = 替换
     * }
     * @returns {Promise<object|null>} 回执；模块缺席 / 异常 ⇒ null（降级，不抛）
     */

    async function loreImportApply(engine, parsed, preview, opts = {}) {
        const o = opts || {};
        let applied = 0, persisted = null, readbackOk = null;
        const blank = (why) => ({
            ok: false, reason: why, importId: '', duplicate: false, selected: 0, applied: 0,
            verified: 0, persisted: null, readback: null, items: [], rejected: [],
            writes: 0, zeroWrite: true, idempotentByImportId: true, stale: false,
            undo: { separate: true, token: null, note: '撤前情不动事实，撤事实不动前情' },
        });
        try {
            const LI = _loreImportLib();
            if (!LI || typeof LI.planApply !== 'function') return blank('module-unavailable');
            const kOf = (x) => String(x == null ? '' : x).trim();
            const sOf = (x) => String(x == null ? '' : x);
            const ledger = engine._loreImportLedgerState();
            const owners = engine._loreImportOwners();
            const lease = { chatId: engine.getCurrentChatId(), epoch: engine._mutationEpoch };
            /* ① 人工校订先叠（改类 / 拆分）——叠加结果作为落笔的真源。 */
            let effParsed = parsed;
            let rejected = [];
            if (o.overrides && typeof LI.applyOverrides === 'function') {
                const ov = LI.applyOverrides(parsed, o.overrides, {});
                effParsed = Object.assign({}, parsed, { items: ov.items });
                rejected = (ov.rejected || []).slice();
            }
            /* 出计划（只算不写；selected 过滤在内核）。 */
            const planOpts = { seen: owners.seen() };
            if (Array.isArray(o.selected)) planOpts.selected = o.selected;
            const plan = LI.planApply(effParsed, preview, planOpts);
            if (plan.ok !== true) {
                const b = blank(plan.reason || 'plan-failed');
                b.importId = plan.importId || '';
                b.duplicate = plan.duplicate === true;
                b.rejected = rejected;
                return b;
            }
            if (plan.duplicate === true) {
                const b = blank('duplicate-import');
                b.ok = true; b.duplicate = true; b.importId = plan.importId;
                b.reason = 'duplicate-import';
                return b;
            }
            /* ② 只落选中的段：按原序拼文本 → 前情 owner（**不写事实账**）。 */
            const byKey = new Map();
            for (const it of (effParsed.items || [])) byKey.set(kOf(it.key), it);
            const chunks = [];
            for (const a of (plan.applied || [])) {
                const it = byKey.get(kOf(a.key));
                if (!it) continue;
                /* 受限正文一律不由本面落：敏感段跳过并具名（掩码不是正文）。 */
                if (it.sensitive === true) { rejected.push({ key: a.key, why: 'sensitive-body' }); continue; }
                chunks.push('【' + kOf(it.title) + '】\n' + sOf(it.text));
            }
            if (!chunks.length) {
                const b = blank('nothing-selected');
                b.importId = plan.importId || '';
                b.rejected = rejected;
                return b;
            }
            const incoming = chunks.join('\n\n');
            const merged = (o.append === false || !ledger.importedText)
                ? incoming
                : (ledger.importedText + '\n\n' + incoming);
            const r = owners.prequel(merged);
            if (!r || r.ok !== true) {
                const b = blank('owner-rejected');
                b.importId = plan.importId || '';
                b.rejected = rejected;
                return b;
            }
            applied = (plan.applied || []).length;
            /* ③ 读**本行真账**核验：前情文本真含本批各段标题（写进去了，不是「以为写了」）。 */
            let verified = 0;
            try {
                const ex = (engine.prequel && typeof engine.prequel.export === 'function') ? engine.prequel.export() : null;
                const body = (ex && typeof ex.text === 'string') ? ex.text : '';
                for (const a of (plan.applied || [])) {
                    const it = byKey.get(kOf(a.key));
                    if (it && body.indexOf(kOf(it.title)) >= 0) verified += 1;
                }
            } catch (e) { errLog(e, 'plugin.loreImportApply.verify'); }
            /* ④ 落盘 + 回读（一次，覆盖本批）。 */
            ledger.importedText = merged;
            ledger.seen.push(plan.importId);
            for (const a of (plan.applied || [])) {
                const it = byKey.get(kOf(a.key));
                if (it && it.manual === true) ledger.decisions[kOf(it.key)] = { cls: kOf(it.cls), decision: kOf(it.decision) || 'override' };
            }
            if (typeof engine.storage?.save === 'function' && typeof engine.storage?.load === 'function') {
                try { persisted = (await engine.storage.save(engine.getCurrentChatId(), engine.collectExport())) === true; }
                catch (e) { errLog(e, 'plugin.loreImportApply.save'); persisted = false; }
                try {
                    const back = await engine.storage.load(engine.getCurrentChatId(), { preserveRuntime: true });
                    const backOk = !!(back && back.loreImportLedger && Array.isArray(back.loreImportLedger.seen)
                        && back.loreImportLedger.seen.indexOf(plan.importId) >= 0);
                    readbackOk = (persisted === true && backOk);
                } catch (e) { errLog(e, 'plugin.loreImportApply.load'); readbackOk = false; }
            } else {
                /* 无落盘 / 无回读口 ⇒ **不判为真也不判为假**（「没尝试」与「试了失败」不同形）。 */
                persisted = null; readbackOk = null;
            }
            const stale = !engine._leaseValid(lease);
            if (stale) engine._leaseDrop(lease, 'loreImportApply', -1);
            const out = {
                ok: !stale && applied > 0,
                reason: stale ? 'epoch-changed' : 'ok',
                importId: plan.importId, duplicate: false,
                selected: applied, applied: applied, verified: verified,
                persisted: persisted, readback: readbackOk,
                items: (plan.applied || []).map(function (x) { return { key: x.key, cls: x.cls, action: x.action }; }),
                rejected: rejected,
                writes: applied, zeroWrite: applied === 0,
                idempotentByImportId: true, stale: stale,
                undo: { separate: true, token: 'undo:lore:' + Date.now(), note: '撤前情不动事实，撤事实不动前情' },
            };
            ledger.lastApply = { at: Date.now(), importId: plan.importId, applied: applied, verified: verified, readback: readbackOk };
            engine._lastLoreApply = ledger.lastApply;
            return out;
        } catch (e) {
            /* 降级返回 null，但**先留一条可查的作废读数**（异常可能发生在「已经落了 N 条」之后）。 */
            try { engine._lastLoreApply = { at: Date.now(), why: 'threw', applied: applied, persisted: persisted, readback: readbackOk, err: (e && e.message) || String(e) }; } catch (_e) { /* 留痕失败就作罢 */ }
            errLog(e, 'plugin.loreImportApply');
            return null;
        }
    }
    /** [v3.339.0 · M4-X1] 导入账读数（**重开可查**的落点；只读）。 */

    function loreImportLedger(engine) {
        try {
            const L = engine._loreImportLedgerState();
            const last = L.lastApply || engine._lastLoreApply || null;
            return {
                version: L.version, seen: L.seen.length, chars: L.importedText.length,
                decisions: Object.keys(L.decisions).length, mappings: Object.keys(L.mappings).length,
                lastApply: last ? { importId: last.importId || '', applied: last.applied || 0, verified: last.verified || 0, readback: last.readback } : null,
            };
        } catch (e) { errLog(e, 'plugin.loreImportLedger'); return { version: 0, seen: 0, chars: 0, decisions: 0, mappings: 0, lastApply: null }; }
    }

    /* ────────────────────────────────────────────────────────────────────────
     * [v3.327.0 · E 包 M3-X7] 章节回顾与可编辑故事年鉴面
     *
     * 【与「分层摘要」那一面的关系(两个问题)】
     *   分层摘要回答「这一窗口讲过什么」(给生成用);本面回答「玩家回看这一章该看什么」
     *   (四要素 / 两版 / 可编辑草稿)。故诊断面分开两行,不合成一行。
     *
     * 【宿主只做三件事】装配(卷章 / 摘要 / 原话经 `_storyAnnualDeps()`)→ 转发 → 留痕。
     *   ★ 装配面**没有就报没有**:章面未判不得被写成「没有章节」——
     *     本面宁可报「未判」也不猜章界。
     */
    /** [v3.327.0 · M3-X7] 年鉴面的**唯一装配点**。 */

    function _storyAnnualDeps(engine) {
        /* [v3.335.0 · M4-O6] 三件**逐件**取:显式私有槽优先,缺则走真实供数派生层。 */
        const O = engine._o6RealOwners();
        const fromChapters = (engine._storyAnnualChapters && Array.isArray(engine._storyAnnualChapters.chapters)) ? engine._storyAnnualChapters : engine._o6Chapters(O);
        const fromSummary = (engine._storyAnnualSummary && typeof engine._storyAnnualSummary === 'object') ? engine._storyAnnualSummary : engine._o6Summary(O);
        const fromQuotes = (typeof engine._storyAnnualQuotes === 'function') ? engine._storyAnnualQuotes : (engine._o6Chat() ? ((floor, opts) => engine._o6Quotes(floor, opts)) : null);
        return {
            CHAPTERS: fromChapters,
            SUMMARY: fromSummary,
            QUOTES: fromQuotes
            /* ★ 只给**该给的**三件。 */
        };
    }
    /* ────────────────────────────────────────────────────────────────────────
     * [v3.336.0 · M4-O9] 无剧透回顾的**事实可知性判决口**
     *
     * 【修的是什么（修前实测，读码口径）】`story-annual.js::twoVersions` 的无剧透版
     *   只看两件东西：`allowedChars`（本章在场角色白名单）与 `knownChars`（名册）。
     *   于是三处必然漏：
     *     ① **同一在场角色后来才揭露的秘密**也算「能看」—— 在场 ≠ 可知；
     *     ② **没有角色名的秘密**（`chars` 为空）按「不因缺字段被裁」**默认放行**；
     *     ③ 泄漏扫描只按名册**原名逐字**找 ⇒ 伪装期的旧名一个都扫不出来；
     *     ④ 未了事项一律清空 ⇒ 已公开的未结伏笔被一并抹掉（这不算「安全」）。
     *
     * 【本层只做一件事】把三件**既有真源**现算成一个判决口交给内核：
     *   · 秘密账本（`secret-ledger.js`）—— 该秘密在**这一楼**揭了没有；
     *   · 知识轨迹（`knowledge-trace.js`）—— 该事实在**这一楼**有没有人知道；
     *   · 事实版本账（`fact-version.js`）—— 该事实在**这一楼**是否成立、是否已闭合。
     *   **不新增账本、不复制掩码与判定实现**（权利人裁决一律回既有模块）。
     *
     * 【四条不可让步口径】
     *   1 **判不了 ⇒ withhold**（`basis:'no-verdict'` 单独计数），不按名单放行、
     *      也不假装已去剧透；「没记过」与「确实不知道」不同形。
     *   2 **零写、零缓存**：每次现算；源变更/截断/切分支后读数跟着变。
     *   3 **绝不用作者版兜底**：去剧透没成立就报 `ok:false`（见 `storyAnnualForPlayer`）。
     *   4 判决口只报**为什么**（`basis` 逐档），不把「遮挡了几条」写成「过滤成功」。
     */
    /** [v3.336.0 · M4-O9] 判决口的真源装配（只读；缺席逐件具名）。 */

    function _o9Owners(engine) {
        const out = { missing: [] };
        const arm = (k, getter) => {
            let v = null;
            try { v = getter(); } catch (e) { errLog(e, 'm4o9.' + k); v = null; }
            out[k] = (v === undefined) ? null : v;
            if (v === null || v === undefined) out.missing.push(k);
            return out[k];
        };
        arm('secret', () => {
            const SL = _moduleLib(() => window.LonShaSecretLedger, 'secret-ledger.js');
            return (SL && typeof SL.list === 'function') ? (engine.worldProg && engine.worldProg.secretLedger) || null : null;
        });
        arm('traces', () => {
            const WP = (engine.worldProg && typeof engine.worldProg.export === 'function') ? engine.worldProg.export() : null;
            const t = (WP && WP.knowledgeTraces && Array.isArray(WP.knowledgeTraces.traces)) ? WP.knowledgeTraces : null;
            return (t && t.traces.length) ? t : null;
        });
        arm('facts', () => (engine._factVersionState && Array.isArray(engine._factVersionState.facts)) ? engine._factVersionState : null);
        arm('atFloor', () => (typeof engine.currentStoryFloor === 'function') ? engine.currentStoryFloor() : null);
        return out;
    }
    /** [v3.336.0 · M4-O9] 别名索引（**只读**图谱既有 `data.aliases`，不建第二份映射表）。 */

    function _o9AliasIndex(engine) {
        const canon = (v) => String(v == null ? '' : v).normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
        const toAliases = new Map();
        try {
            for (const node of (engine.graph && engine.graph.nodes && engine.graph.nodes.values()) || []) {
                if (!node || node.type !== 'character' || !node.name) continue;
                const list = Array.isArray(node.data && node.data.aliases) ? node.data.aliases : [];
                const clean = [];
                for (const a of list) {
                    const v = String(a == null ? '' : a).trim();
                    if (v && v !== node.name && clean.indexOf(v) < 0) clean.push(v);
                }
                if (clean.length) toAliases.set(canon(node.name), { name: node.name, aliases: clean });
            }
        } catch (e) { errLog(e, 'm4o9.aliasIndex'); }
        return toAliases;
    }
    /** [v3.336.0 · M4-O9] 一条条目的**事实引用**（没有可引用的 ⇒ 空串，由判决口按判不了处置）。 */

    function _o9FactOf(engine, item) {
        const it = (item && typeof item === 'object') ? item : {};
        const direct = String((it.fact || it.key || '') ).trim();
        if (direct) return direct;
        const to = String(it.to == null ? '' : it.to);
        const i = to.indexOf('：');
        if (i > 0) return to.slice(0, i).trim();
        const j = to.indexOf(':');
        if (j > 0) return to.slice(0, j).trim();
        const t = String(it.text == null ? '' : it.text).trim();
        return t ? t.slice(0, 60) : '';
    }
    /** [v3.336.0 · M4-O9] 条目里**出现的实体名**（名册原名 + 图谱别名族，最长优先）。 */

    function _o9NamesIn(engine, item) {
        const it = (item && typeof item === 'object') ? item : {};
        const blob = [it.text, it.to, it.from, it.char, it.title, it.summary]
            .map((x) => String(x == null ? '' : x)).join(' ');
        const out = [];
        /* 口径与 _qaKnownActors / _qaActorAliases 一致：只要求非空（单字名照收）。 */
        const push = (v) => { const s = String(v == null ? '' : v).trim(); if (s && out.indexOf(s) < 0 && out.length < 24) out.push(s); };
        for (const c of (Array.isArray(it.chars) ? it.chars : [])) push(c);
        push(it.char); push(it.speaker); push(it.subject);
        let names = [];
        try { const a = engine._o6KnownEntities(); if (Array.isArray(a)) names = a; } catch (_e) { names = []; }
        const idx = engine._o9AliasIndex();
        for (const info of idx.values()) { for (const a of info.aliases) names = names.concat([a]); }
        const uniq = [];
        for (const n of names) { const s = String(n == null ? '' : n).trim(); if (s && uniq.indexOf(s) < 0) uniq.push(s); }
        uniq.sort((a, b) => b.length - a.length);
        for (const n of uniq) if (blob.indexOf(n) >= 0) push(n);
        return out;
    }
    /**
     * [v3.336.0 · M4-O9] **可知性判决口**（纯读、现算、零缓存）。
     *   判决逐档具名，调用方与诊断面读同一份读数。
     */

    function _o9Gate(engine) {
        const O = engine._o9Owners();
        /* null/undefined/空串 = 读不到，不得被 Number(null)=0 冒充成「当时=第 0 楼」。 */
        const atRaw = O.atFloor;
        const atFloor = (atRaw === null || atRaw === undefined || atRaw === '')
            ? null : (Number.isFinite(Number(atRaw)) ? Number(atRaw) : null);
        const self = this;
        const SL = _moduleLib(() => window.LonShaSecretLedger, 'secret-ledger.js');
        const KT = _moduleLib(() => window.LonShaKnowledgeTrace, 'knowledge-trace.js');
        const FV = (typeof _factVersionLib === 'function') ? _factVersionLib() : null;
        const idx = engine._o9AliasIndex();
        const read = { resolved: 0, allow: 0, withhold: 0, undecided: 0,
            secretSealed: 0, knownAtFloor: 0, factEstablished: 0, factFuture: 0,
            notKnown: 0, aliasGated: 0, noFactAnchor: 0 };
        const gate = {
            atFloor: atFloor, armed: (atFloor !== null), missing: O.missing.slice(), read: read,
            /* 别名族：泄漏扫描把名册原名展开成**全部旧名/伪装名**再扫（修前只扫原名）。 */
            aliasOf: function (name) {
                const key = String(name == null ? '' : name).normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
                const info = idx.get(key);
                return info ? info.aliases.slice() : [];
            },
            resolve: function (item, meta) {
                const it = (item && typeof item === 'object') ? item : {};
                const m = (meta && typeof meta === 'object') ? meta : {};
                const fact = self._o9FactOf(it);
                const names = self._o9NamesIn(it);
                read.resolved += 1;
                const say = (decision, basis, why) => {
                    if (decision === 'allow') read.allow += 1; else read.withhold += 1;
                    if (basis === 'no-verdict') read.undecided += 1;
                    return { decision: decision, basis: basis, fact: fact, why: why || basis, names: names };
                };
                /* ⓪ 时点读不到 ⇒ 判不了（不拿「现在」冒充「当时」）。 */
                if (atFloor === null) return say('withhold', 'no-verdict', 'no-at-floor');
                /* ① 没有事实引用也没有实体名 ⇒ 无从判断（修前这一格是**默认放行**）。 */
                if (!fact && !names.length) { read.noFactAnchor += 1; return say('withhold', 'no-verdict', 'no-fact-anchor'); }
                /* ② 秘密面：该秘密在**这一楼**还没揭 ⇒ 遮蔽（匿名秘密也走这一格）。 */
                if (O.secret && SL && typeof SL.list === 'function') {
                    let rows = [];
                    try { rows = SL.list(O.secret, { status: 'unrevealed' }); } catch (_e) { rows = []; }
                    const blob = [it.text, it.to, it.from, it.char].map((x) => String(x == null ? '' : x)).join(' ');
                    for (const row of rows) {
                        const sec = String((row && row.secret) || '');
                        if (!sec || blob.indexOf(sec) < 0) continue;
                        const rawRf = (row && row.revealedFloor);
                        /* 未揭 = revealedFloor 为空；Number(null)=0 会让它被误判成「第 0 楼已揭」。 */
                        const rf = (rawRf === null || rawRf === undefined || rawRf === '')
                            ? null : Number(rawRf);
                        if (rf !== null && Number.isFinite(rf) && rf <= atFloor) continue;   /* 这一楼已揭 ⇒ 不挡 */
                        read.secretSealed += 1;
                        return say('withhold', 'secret-sealed', 'secret:' + String((row && row.id) || ''));
                    }
                }
                /* Public open thread: promise:* / suspense:* come from the host
                 *   public ledger (extracted from visible text), so they are readable.
                 *   Sealed ones already returned above. Not a whitelist. */
                const _o9Key = String((it.key == null ? '' : it.key)).trim();
                if (_o9Key.indexOf('promise:') === 0 || _o9Key.indexOf('suspense:') === 0) {
                    return say('allow', 'open-public', 'open:' + _o9Key);
                }
                /* ③ 别名面：条目点名了一个**此刻还没成立**的称呼（揭穿前的旧名）⇒ 遮蔽。 */

                /* resolve 是普通函数，this === gate 而非引擎 —— 修前此处恒 undefined，别名面整个空转。 */
                const reg = self._entityRegistry;
                if (reg && typeof reg.candidatesFor === 'function' && names.length) {
                    for (const nm of names) {
                        let cs = [];
                        try { cs = reg.candidatesFor('person', nm, { at: atFloor }); } catch (_e) { cs = []; }
                        if (!cs.length) continue;
                        if (cs.every((c) => c && c.blockedBy)) { read.aliasGated += 1; return say('withhold', 'alias-gated', 'alias:' + nm); }
                    }
                }
                /* ④ 知识轨迹面：这一楼**有没有人**已经知道这条事实。 */
                if (KT && typeof KT.knewAt === 'function' && fact) {
                    const people = names.length ? names : [];
                    let yes = 0, no = 0, unclear = 0;
                    for (const who of people) {
                        let k = null;
                        try { k = KT.knewAt(O.traces, who, fact, atFloor); } catch (_e) { k = null; }
                        const v = (k && k.knowledge) || 'unclear';
                        if (v === 'yes') yes += 1; else if (v === 'no') no += 1; else unclear += 1;
                    }
                    if (yes > 0) { read.knownAtFloor += 1; return say('allow', 'known-at-floor', 'known:' + yes); }
                    if (people.length && !unclear && no > 0) { read.notKnown += 1; return say('withhold', 'not-known-at-floor', 'none:0/' + people.length); }
                }
                /* ⑤ 事实版本面：这一楼该事实**成立**（未闭合、未被撤销、信任够）⇒ 可读。 */
                if (FV && typeof FV.lookup === 'function' && fact) {
                    for (const who of (names.length ? names : [''])) {
                        let res = null;
                        try { res = FV.lookup(O.facts, { subject: who, predicate: fact, at: atFloor }); } catch (_e) { res = null; }
                        if (!res || res.ok !== true) continue;
                        if (res.reason === 'ok' || res.reason === 'multiple') { read.factEstablished += 1; return say('allow', 'fact-established', 'fv:' + res.reason); }
                        if (res.reason === 'none-current' && FV.timeline) {
                            let tl = null;
                            try { tl = FV.timeline(O.facts, { subject: who, predicate: fact }); } catch (_e) { tl = null; }
                            const future = (tl && Array.isArray(tl.versions)) ? tl.versions.some((v) => Number(v && v.from) > atFloor) : false;
                            if (future) { read.factFuture += 1; return say('withhold', 'fact-future', 'fv:from>' + atFloor); }
                        }
                    }
                }
                /* ⑥ 都判不了 ⇒ **遮蔽并计入判不了**（不按名单放行）。 */
                return say('withhold', 'no-verdict', 'no-verdict');
            }
        };
        return gate;
    }
    /** [v3.336.0 · M4-O9] 判决口读数（供诊断；**不是账本**、不落盘）。 */

    function o9Sources(engine) {
        const g = engine._o9Gate();
        return {
            kind: 'm4o9_gate', version: 1, atFloor: g.atFloor, armed: g.armed === true,
            missing: g.missing.slice(), read: Object.assign({}, g.read),
            aliasFamilies: g.aliasOf ? g.aliasOf.length || null : null,
            writesNothing: true,
            note: '判不了 ⇒ 遮蔽并单独计数;本面不是账本,不落盘'
        };
    }
    /** [v3.327.0 · M3-X7] 内核不可达时的**同键降级**。 */

    function _storyAnnualAbsent(engine, reason) {
        const r = (typeof reason === 'string' && reason) ? reason : 'module-absent';
        return { kind: 'story_annual', version: 0, ok: false, chapters: [], counts: {}, chaptersChecked: false, why: [r], reason: r, absent: true };
    }
    /** [v3.327.0 · M3-X7] 建章节册(**零写**);未给卷章 ⇒ 章面未判。 */

    function storyAnnualBuild(engine, payload, opts) {
        const SA = _storyAnnualLib();
        if (!SA || typeof SA.build !== 'function') return engine._storyAnnualAbsent();
        try {
            const deps = engine._storyAnnualDeps();
            const src = payload || deps.CHAPTERS;
            const res = SA.build(src, opts || {});
            engine._lastStoryAnnual = {
                at: Date.now(), chapters: (res.chapters || []).length, counts: Object.assign({}, res.counts),
                chaptersChecked: res.chaptersChecked === true, depsPresent: (deps.CHAPTERS ? 1 : 0) + (deps.SUMMARY ? 1 : 0) + (deps.QUOTES ? 1 : 0)
            };
            return res;
        } catch (e) { errLog(e, 'plugin.storyAnnualBuild'); return engine._storyAnnualAbsent('thrown'); }
    }
    /** [v3.327.0 · M3-X7] 单章回顾(**四要素;证据缺项单独计数**)。 */

    function storyAnnualReview(engine, chapterRef, payload, opts) {
        const SA = _storyAnnualLib();
        if (!SA || typeof SA.review !== 'function') return { ok: false, ref: {}, title: '', elements: { events: [], changes: [], unfinished: [], quotes: [] }, evidence: [], evidenceChecked: false, evidenceMissing: 0, evidenceBound: 0, why: ['module-absent'] };
        try { return SA.review(chapterRef, payload, (opts || {})); }
        catch (e) { errLog(e, 'plugin.storyAnnualReview'); return { ok: false, ref: {}, title: '', elements: { events: [], changes: [], unfinished: [], quotes: [] }, evidence: [], evidenceChecked: false, evidenceMissing: 0, evidenceBound: 0, why: ['thrown'] }; }
    }
    /** [v3.327.0 · M3-X7 · v3.336.0 · M4-O9] 两版可分。
     *   ★ 调用方没给可知性面时**自动装配**（`_o9Gate()`）—— 真实会话里无人手动装配，
     *     修前正是因此长期退回「按白名单裁」；显式传入的 `opts.gate` 仍**优先**。 */

    function storyAnnualTwoVersions(engine, rev, opts) {
        const SA = _storyAnnualLib();
        if (!SA || typeof SA.twoVersions !== 'function') return { spoilerFree: null, authorial: null, leakedChars: [], versionsDistinct: false, why: ['module-absent'] };
        try {
            const o = Object.assign({}, opts || {});
            if (!o.gate || typeof o.gate.resolve !== 'function') {
                try { o.gate = engine._o9Gate(); } catch (e) { errLog(e, 'plugin.storyAnnualTwoVersions.gate'); }
            }
            const res = SA.twoVersions(rev, o);
            engine._lastStoryAnnualVersions = {
                at: Date.now(), gated: res.gated === true, kept: res.kept || 0,
                withheld: res.withheld || 0, undecided: res.undecided || 0,
                overRedacted: res.overRedacted === true, leaked: (res.leakedChars || []).length
            };
            return res;
        }
        catch (e) { errLog(e, 'plugin.storyAnnualTwoVersions'); return { spoilerFree: null, authorial: null, leakedChars: [], versionsDistinct: false, why: ['thrown'] }; }
    }
    /**
     * [v3.336.0 · M4-O9] **给玩家 / 生成侧的那一版**（零写）。
     *   ★ 铁律：**绝不回退到作者版**。去剧透没成立 ⇒ `ok:false` + `reason`
     *     （`knowledge-face-absent` / `over-redacted` / `no-gate`），由调用方显示
     *     「这一章暂时不能给玩家看」—— 把作者面当兜底正是直接剧透。
     */

    function storyAnnualForPlayer(engine, rev, opts) {
        const SA = _storyAnnualLib();
        const absent = (why) => ({
            ok: false, version: null, reason: why, spoilerFree: null, authorial: null,
            gated: false, note: '不接作者版:去剧透未成立(' + why + ')', writesNothing: true,
        });
        if (!SA || typeof SA.forPlayer !== 'function') return absent('module-absent');
        try {
            const o = Object.assign({}, opts || {});
            if (!o.gate || typeof o.gate.resolve !== 'function') {
                try { o.gate = engine._o9Gate(); } catch (e) { errLog(e, 'plugin.storyAnnualForPlayer.gate'); }
            }
            const res = SA.forPlayer(rev, o);
            engine._lastStoryAnnualPlayer = {
                at: Date.now(), ok: res.ok === true, reason: res.reason || '',
                kept: res.kept || 0, withheld: res.withheld || 0
            };
            return res;
        } catch (e) { errLog(e, 'plugin.storyAnnualForPlayer'); return absent('thrown'); }
    }        /** [v3.327.0 · M3-X7] 文风编辑模拟(**只报读数,不改写一个字**)。 */

    function storyAnnualBelletristic(engine, text, opts) {
        const SA = _storyAnnualLib();
        if (!SA || typeof SA.belletristic !== 'function') return { chars: 0, smokeHits: 0, smokeWords: [], foulHits: 0, foulWords: [], smokeReasons: [], verdict: 'unavailable', writesNothing: true, note: '模块未加载' };
        try { return SA.belletristic(text, opts || {}); }
        catch (e) { errLog(e, 'plugin.storyAnnualBelletristic'); return { chars: 0, smokeHits: 0, smokeWords: [], foulHits: 0, foulWords: [], smokeReasons: [], verdict: 'thrown', writesNothing: true, note: '抛错' }; }
    }
    /** [v3.327.0 · M3-X7] 编辑草稿(**纯函数**;事实位一概拒 —— 编辑的不是事实)。 */

    function storyAnnualEdit(engine, state, patch) {
        const SA = _storyAnnualLib();
        if (!SA || typeof SA.edit !== 'function') return { ok: false, state: null, changed: [], rejected: [], reason: 'module-absent' };
        try {
            const res = SA.edit(state, patch);
            engine._lastStoryAnnualEdit = { at: Date.now(), changed: (res.changed || []).length, rejected: (res.rejected || []).length, reason: res.reason };
            return res;
        } catch (e) { errLog(e, 'plugin.storyAnnualEdit'); return { ok: false, state: null, changed: [], rejected: [], reason: 'thrown' }; }
    }
    /** [v3.327.0 · M3-X7] 过期判定:**原文改动 ⇒ 对应段过期**(过期不等于删除)。 */

    function storyAnnualStale(engine, oldChapters, newPayload) {
        const SA = _storyAnnualLib();
        if (!SA || typeof SA.staleRefs !== 'function') return { stale: 0, fresh: 0, missingChapters: 0, staleRefs: [], why: ['module-absent'], all: [] };
        try {
            const res = SA.staleRefs(oldChapters, newPayload);
            engine._lastStoryAnnualStale = { at: Date.now(), stale: res.stale, fresh: res.fresh, missingChapters: res.missingChapters };
            return res;
        } catch (e) { errLog(e, 'plugin.storyAnnualStale'); return { stale: 0, fresh: 0, missingChapters: 0, staleRefs: [], why: ['thrown'], all: [] }; }
    }
    /**
     * [v3.341.0 · M4-X2] **章节成稿**（零写）。吃 `storyAnnualReview` 的产物，出可读回顾。
     *   ★ 未给 `opts.polish`（真模型通道）⇒ 如实报结构成稿，**不报文风通过**
     *     —— 这正是验收原文「未调用真实模型只能报告结构成稿不报文风通过」那一格。
     */

    function storyAnnualCompose(engine, rev, opts) {
        const SA = _storyAnnualLib();
        const absent = (why) => ({
            kind: 'story_annual_draft', version: 0, ok: false, ref: {}, title: '', sections: [], text: '',
            paragraphCount: 0, chars: 0, source: 'structure-only', modelUsed: false, styleChecked: false,
            styleNote: '', evidenceBound: 0, evidenceMissing: 0, evidenceUndecided: 0, evidenceTotal: 0,
            memoryUntouched: true, writesNothing: true, why: [why],
        });
        if (!SA || typeof SA.compose !== 'function') return absent('module-absent');
        try {
            const res = SA.compose(rev, opts || {});
            engine._lastAnnualCompose = {
                at: Date.now(), ok: res.ok === true, sections: (res.sections || []).length,
                source: res.source, modelUsed: res.modelUsed === true, styleChecked: res.styleChecked === true,
                evidenceBound: res.evidenceBound || 0, evidenceMissing: res.evidenceMissing || 0,
                evidenceUndecided: res.evidenceUndecided || 0,
            };
            return res;
        } catch (e) { errLog(e, 'plugin.storyAnnualCompose'); return absent('thrown'); }
    }
    /**
     * [v3.341.0 · M4-X2] **玩家版成稿**（零写）。
     *   ★ 与 `storyAnnualForPlayer` 同铁律：**绝不回退作者版**。去剧透未成立 ⇒ `ok:false`，
     *     由调用方显示「这一章暂时不能给玩家看」；把作者面当兜底正是直接剧透。
     *   ★ 可知性面与 `storyAnnualForPlayer` **同一装配口**（`_o9Gate()`），不建第二份。
     */

    function storyAnnualComposeForPlayer(engine, rev, opts) {
        const SA = _storyAnnualLib();
        const absent = (why) => ({
            kind: 'story_annual_draft', version: 0, ok: false, playerVersion: null, reason: why, ref: {},
            title: '', sections: [], text: '', source: 'structure-only', styleChecked: false, leakedChars: [],
            futureFactsLeaked: 0, chaptersRead: 0, memoryUntouched: true, writesNothing: true,
            note: '不接作者版：去剧透未成立（' + why + '）',
        });
        if (!SA || typeof SA.composeForPlayer !== 'function') return absent('module-absent');
        try {
            const o = Object.assign({}, opts || {});
            if (!o.gate || typeof o.gate.resolve !== 'function') {
                try { o.gate = engine._o9Gate(); } catch (e) { errLog(e, 'plugin.storyAnnualComposeForPlayer.gate'); }
            }
            const res = SA.composeForPlayer(rev, o);
            engine._lastAnnualPlayerDraft = {
                at: Date.now(), ok: res.ok === true, reason: res.reason || '',
                leaked: (res.leakedChars || []).length, futureFactsLeaked: res.futureFactsLeaked || 0,
            };
            return res;
        } catch (e) { errLog(e, 'plugin.storyAnnualComposeForPlayer'); return absent('thrown'); }
    }
    /** [v3.341.0 · M4-X2] **按章重建**（零写）。草稿册缺省取本会话已存的（`_annualDrafts`）。 */

    function storyAnnualRebuild(engine, drafts, stale, opts) {
        const SA = _storyAnnualLib();
        const absent = (why) => ({
            kind: 'story_annual_rebuild', version: 0, ok: false, rebuilt: [], kept: [], gone: [],
            untouched: [], drafts: [], why: [why], staleCount: 0, missingChapters: 0,
            wholeBookRebuilt: false, writesNothing: true,
        });
        if (!SA || typeof SA.rebuildAffected !== 'function') return absent('module-absent');
        try {
            const src = drafts || engine._annualDrafts || [];
            const res = SA.rebuildAffected(src, stale, opts || {});
            engine._lastAnnualRebuild = {
                at: Date.now(), rebuilt: (res.rebuilt || []).length, kept: (res.kept || []).length,
                gone: (res.gone || []).length, untouched: (res.untouched || []).length,
            };
            return res;
        } catch (e) { errLog(e, 'plugin.storyAnnualRebuild'); return absent('thrown'); }
    }
    /** [v3.341.0 · M4-X2] 编辑成稿草稿（**纯函数**；事实位一概拒 —— 编辑的不是记忆）。 */

    function storyAnnualApplyEdits(engine, draft, patch) {
        const SA = _storyAnnualLib();
        const absent = (why) => ({
            ok: false, state: null, changed: [], rejected: [], reason: why,
            memoryUntouched: true, evidenceIntact: true, writesNothing: true,
        });
        if (!SA || typeof SA.applyEdits !== 'function') return absent('module-absent');
        try {
            const res = SA.applyEdits(draft, patch);
            engine._lastAnnualEdit = {
                at: Date.now(), changed: (res.changed || []).length, rejected: (res.rejected || []).length,
                evidenceIntact: res.evidenceIntact !== false, reason: res.reason,
            };
            return res;
        } catch (e) { errLog(e, 'plugin.storyAnnualApplyEdits'); return absent('thrown'); }
    }
    /**
     * [v3.341.0 · M4-X2] **草稿册**（唯一落笔口；形状由内核 `normalizeDrafts` 定，宿主不现编）。
     *   无参 ⇒ 读；给入参 ⇒ 归一化后落进 `_annualDrafts`（随聊天持久化，重开可查）。
     */

    function storyAnnualDrafts(engine, raw, opts) {
        const SA = _storyAnnualLib();
        const absent = (why) => ({ kind: 'story_annual_drafts', version: 0, ok: false, drafts: [], drops: 0, why: [why], writesNothing: true, persisted: false });
        if (!SA || typeof SA.normalizeDrafts !== 'function') return absent('module-absent');
        try {
            if (raw === undefined || raw === null) {
                const cur = Array.isArray(engine._annualDrafts) ? engine._annualDrafts : [];
                const r = SA.normalizeDrafts(cur);
                r.persisted = Array.isArray(engine._annualDrafts);
                return r;
            }
            const res = SA.normalizeDrafts(raw);
            engine._annualDrafts = res.ok ? res.drafts.slice() : [];
            res.persisted = true;
            return res;
        } catch (e) { errLog(e, 'plugin.storyAnnualDrafts'); return absent('thrown'); }
    }
    /** [v3.341.0 · M4-X2] 成稿面诊断一行（四态分开；没生成过与生成了零段不同形）。 */

    function storyAnnualComposeLine(engine) {
        try {
            const SA = _storyAnnualLib();
            if (!SA || typeof SA.composeLine !== 'function') return '成稿模块未加载(story-annual.js)';
            const lastEdit = engine._lastAnnualEdit || null;
            const body = SA.composeLine(engine._lastAnnualCompose || null);
            const parts = [body];
            const pv = engine._lastAnnualPlayerDraft || null;
            if (pv && pv.ok !== true) parts.push('⚠️ 玩家版被挡(' + (pv.reason || '未知') + ')');
            else if (pv && pv.leaked) parts.push('⚠️ 玩家版泄漏 ' + pv.leaked + ' 人');
            if (lastEdit && lastEdit.evidenceIntact === false) parts.push('⚠️ 段证据位被编辑掉');
            const rb = engine._lastAnnualRebuild || null;
            if (rb) parts.push('重建 受影响 ' + rb.rebuilt + ' / 未变 ' + rb.kept + ' / 整章过期 ' + rb.gone);
            const n = Array.isArray(engine._annualDrafts) ? engine._annualDrafts.length : null;
            if (n !== null) parts.push('草稿 ' + n + ' 章');
            return parts.join(' · ');
        } catch (e) { errLog(e, 'plugin.storyAnnualComposeLine'); return '—(成稿面异常)'; }
    }
    /** [v3.327.0 · M3-X7] 面自述。 */

    function storyAnnualDescribe(engine) {
        const SA = _storyAnnualLib();
        if (!SA || typeof SA.describe !== 'function') {
            return { kind: 'story_annual', version: 0, elements: [], elementLabels: [], versions: [], draftFields: [], factFields: [], smokeWords: [], foulWords: [], itemMax: 0, present: 0, total: 0, missing: [], versionsDistinct: false, draftOnlyEnforced: false, leakScanWorks: false, offline: true, writesNothing: true, note: '年鉴模块未加载(story-annual.js)', reason: 'module-unavailable' };
        }
        try {
            const d = SA.describe(engine._storyAnnualDeps());
            d.reason = (d.missing && d.missing.length) ? 'deps-missing' : '';
            return d;
        } catch (e) { errLog(e, 'plugin.storyAnnualDescribe'); return { kind: 'story_annual', version: 0, elements: [], elementLabels: [], versions: [], draftFields: [], factFields: [], smokeWords: [], foulWords: [], itemMax: 0, present: 0, total: 0, missing: [], versionsDistinct: false, draftOnlyEnforced: false, leakScanWorks: false, offline: true, writesNothing: true, note: '自述抛错', reason: 'thrown' }; }
    }
    /** [v3.327.0 · M3-X7] 诊断一行。**五种坏法分开写**:模块没挂 / 两版不可分
     *   (把作者面当玩家面 = 直接剧透)/ 草稿白名单未生效 / 泄漏扫描失效 / 面在位。 */

    function storyAnnualLine(engine) {
        try {
            const SA = _storyAnnualLib();
            if (!SA || typeof SA.line !== 'function') return '模块未加载(story-annual.js)';
            const d = engine.storyAnnualDescribe();
            if (d.reason === 'module-unavailable') return '模块未加载(story-annual.js)';
            if (d.reason === 'thrown') return '—(诊断异常)';
            if (d.draftOnlyEnforced === false) return '⚠️ 草稿白名单未生效(能改到事实位)';
            if (d.versionsDistinct === false) return '⚠️ 两版不可分(作者面会被当玩家面)';
            if (d.leakScanWorks === false) return '⚠️ 泄漏扫描失效(未过滤角色名不会报)';
            const last = engine._lastStoryAnnual || null;
            if (!last) return '待生成(面在位 · 四要素 · 依赖 ' + d.present + '/' + d.total + ')';
            const st = engine._lastStoryAnnualStale || null;
            const parts = ['年鉴 章 ' + (last.chapters || 0)];
            const cs = last.counts || {};
            if (cs.events) parts.push('事件 ' + cs.events);
            if (cs.unfinished) parts.push('未了 ' + cs.unfinished);
            if (st && st.stale) parts.push('⚠️ 过期段 ' + st.stale);
            if (st && st.missingChapters) parts.push('整章过期 ' + st.missingChapters);
            if (last.chaptersChecked === false) parts.push('章面未判');
            /* [v3.341.0 · M4-X2] 成稿面读数并入本行（同一问题的两种尺度：结构 vs 成稿）。 */
            const ce = engine._lastAnnualCompose || null;
            if (ce) parts.push('成稿 ' + (ce.modelUsed ? '已过模型' : '结构成稿') + ' ' + (ce.sections || 0) + ' 段');
            else parts.push('成稿未生成');
            return parts.join(' · ');
        } catch (e) { errLog(e, 'plugin.storyAnnualLine'); return '—(诊断异常)'; }
    }

    return {
        bindDeps: bindDeps,
        _o6RealOwners: _o6RealOwners,
        annualSources: annualSources,
        _o6Chat: _o6Chat,
        _o6Quotes: _o6Quotes,
        _o6Chapters: _o6Chapters,
        _o6Summary: _o6Summary,
        _o6Outcomes: _o6Outcomes,
        _o6PastDetails: _o6PastDetails,
        _o6KnownFacts: _o6KnownFacts,
        _o6ConfirmedFacts: _o6ConfirmedFacts,
        _o6KnownEntities: _o6KnownEntities,
        _loreImportDeps: _loreImportDeps,
        _loreImportAbsent: _loreImportAbsent,
        loreImportParse: loreImportParse,
        loreImportParseWindow: loreImportParseWindow,
        loreImportEntities: loreImportEntities,
        loreImportPreview: loreImportPreview,
        loreImportPlan: loreImportPlan,
        loreImportChanged: loreImportChanged,
        loreImportDescribe: loreImportDescribe,
        loreImportLine: loreImportLine,
        _loreImportOwners: _loreImportOwners,
        _loreImportLedgerState: _loreImportLedgerState,
        loreImportOverride: loreImportOverride,
        loreImportConfirmMapping: loreImportConfirmMapping,
        loreImportApply: loreImportApply,
        loreImportLedger: loreImportLedger,
        _storyAnnualDeps: _storyAnnualDeps,
        _o9Owners: _o9Owners,
        _o9AliasIndex: _o9AliasIndex,
        _o9FactOf: _o9FactOf,
        _o9NamesIn: _o9NamesIn,
        _o9Gate: _o9Gate,
        o9Sources: o9Sources,
        _storyAnnualAbsent: _storyAnnualAbsent,
        storyAnnualBuild: storyAnnualBuild,
        storyAnnualReview: storyAnnualReview,
        storyAnnualTwoVersions: storyAnnualTwoVersions,
        storyAnnualForPlayer: storyAnnualForPlayer,
        storyAnnualBelletristic: storyAnnualBelletristic,
        storyAnnualEdit: storyAnnualEdit,
        storyAnnualStale: storyAnnualStale,
        storyAnnualCompose: storyAnnualCompose,
        storyAnnualComposeForPlayer: storyAnnualComposeForPlayer,
        storyAnnualRebuild: storyAnnualRebuild,
        storyAnnualApplyEdits: storyAnnualApplyEdits,
        storyAnnualDrafts: storyAnnualDrafts,
        storyAnnualComposeLine: storyAnnualComposeLine,
        storyAnnualDescribe: storyAnnualDescribe,
        storyAnnualLine: storyAnnualLine,
    };
}));
