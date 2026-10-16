#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch3350_o6.py — [v3.335.0 · 第四期 M4-O6] 年鉴/正史/旧事/资料四面接真实数据。

锚点纪律：先校验命中次数（唯一），通过后统一写盘；本版**不新增运行时模块**
（改的是既有 index.js：加一层真实供数派生 + 四装配点改走派生）。

用法：python3 tools/patch3350_o6.py [--dry]
"""
import io
import sys

ROOT = '/home/user/lonsha-memory-plugin'
P = ROOT + '/index.js'
src = io.open(P, encoding='utf-8').read()
DRY = ('--dry' in sys.argv)


def check(s, cnt, tag):
    n = src.count(s)
    if n != cnt:
        raise SystemExit('[o6] 锚点 %s 期望 %d 次，实测 %d：%r' % (tag, cnt, n, s[:90]))


# ══════════ 一、派生层（插在 E 包注释块之前） ══════════
HEADER = '* [v3.327.0 · E 包 M3-X5] 设定资料与前史分层导入面'
check(HEADER, 1, 'E-pack-header')
_at = src.index(HEADER)
_prev_sep = src.rindex('\n        /* ', 0, _at)
INS = _prev_sep + 1

BLOCK = r'''        /* ────────────────────────────────────────────────────────────────────────
         * [v3.335.0 · M4-O6] 年鉴 / 正史 / 旧事 / 资料四面的**真实供数派生层**
         *
         * 【修的是什么（修前实测，读码口径）】E/F 包四个装配点（`_storyAnnualDeps` /
         *   `_branchCanonDeps` / `_fatedRecallDeps` / `_loreImportDeps`）此前**只读**六个
         *   私有槽（`_storyAnnualChapters` / `_storyAnnualSummary` / `_storyAnnualQuotes` /
         *   `_branchOutcomes` / `_pastDetails` / `_knownFacts` / `_loreConfirmedFacts`），
         *   而全仓**零写入点**（`grep -rn '_storyAnnualChapters\|_branchOutcomes\|_pastDetails'`
         *   只命中装配点自身）⇒ 正常玩过的会话里这四面长期停在「依赖未给 / 未判」，
         *   只有夹具自检能看见内容。模块自检可用夹具**不证明正常会话能产出内容**。
         *
         * 【本层只做一件事】把**既有真源**即时派生成本面的入参形状 ——
         *   不新增账本、不引入第二份事实库、不写任何 owner。
         *   私有槽仍然**优先**：调用方显式装配的入参不被派生层覆盖。
         *
         * 【四条不可让步口径】
         *   1 缺数据 ⇒ 返回 null（面如实报「未判」），**绝不用默认样例填槽**；
         *     真源在场而确实拿不到 ⇒ 也返回 null，不把「没记过」写成「没有」。
         *   2 每次装配**现算**，不缓存、不持久化 ⇒ 源变更 / 切分支后读数跟着变，
         *     重开不依赖上一实例的残留。
         *   3 受限正文一律不由本层产出：秘密按既有 `SECRET_BODY_KEYS` 在各自内核侧剥，
         *     本层不复制掩码实现（两份实现必然漂）。
         *   4 只读：对 owner 只调 `export()` / 读既有字段，一个字节都不写。
         *
         * 【与「分层摘要」那一面的分工】本层**不重算**摘要、不重切章界：卷章一律来自
         *   SummarySystem 的真卷记录（`floorStart`/`floorEnd`）；无卷记录 ⇒ 章面未判。
         */
        /** [v3.335.0 · M4-O6] 四面共用的**唯一取数口**（只读、零缓存、零写）。 */
        _o6RealOwners() {
            const out = { owners: [], missing: [] };
            const arm = (k, getter) => {
                let v = null;
                try { v = getter(); } catch (e) { errLog(e, 'm4o6.' + k); v = null; }
                out[k] = (v === undefined) ? null : v;
                if (out[k] === null) out.missing.push(k); else out.owners.push(k);
                return out[k];
            };
            arm('summary', () => (this.summary && typeof this.summary.export === 'function') ? this.summary.export() : null);
            arm('worldProg', () => (this.worldProg && typeof this.worldProg.export === 'function') ? this.worldProg.export() : null);
            arm('timeline', () => (this.timeline && Array.isArray(this.timeline.entries)) ? this.timeline.entries : null);
            arm('scene', () => (this.scene && typeof this.scene.export === 'function') ? this.scene.export() : null);
            arm('events', () => this._eventThreadState || null);
            arm('facts', () => this._factVersionState || null);
            arm('suspense', () => (this.suspense && Array.isArray(this.suspense.items)) ? this.suspense.items : null);
            arm('deltas', () => (this.deltaBook && Array.isArray(this.deltaBook.deltas)) ? this.deltaBook.deltas : null);
            arm('actors', () => { const a = this._qaKnownActors(0); return Array.isArray(a) ? a : null; });
            return out;
        }
        /** [v3.335.0 · M4-O6] 真源在场性与派生读数（**供诊断与判据观察**，不是账本、不落盘）。 */
        annualSources() {
            const O = this._o6RealOwners();
            const chapters = this._o6Chapters(O);
            const outcomes = this._o6Outcomes(O);
            const past = this._o6PastDetails(O);
            const known = this._o6KnownFacts(O);
            const confirmed = this._o6ConfirmedFacts(O);
            let entities = null;
            try { const a = this._o6KnownEntities(); entities = Array.isArray(a) ? a.length : null; } catch (_e) { entities = null; }
            return {
                kind: 'm4o6_sources', version: 1,
                owners: O.owners.slice(), missing: O.missing.slice(),
                chapters: (chapters && Array.isArray(chapters.chapters)) ? chapters.chapters.length : null,
                outcomes: Array.isArray(outcomes) ? outcomes.length : null,
                pastDetails: Array.isArray(past) ? past.length : null,
                knownActors: known ? Object.keys(known).length : null,
                confirmedFacts: confirmed ? Object.keys(confirmed).length : null,
                knownEntities: entities,
                epoch: (typeof this._mutationEpoch === 'number') ? this._mutationEpoch : null,
                writesNothing: true,
                note: '六个私有槽仍优先;本面只报派生层从真源取到了什么(null = 未判,不是空)'
            };
        }
        /** [v3.335.0 · M4-O6] 真实聊天读取口（拿不到 ⇒ null ⇒ 原话面报未判，不编）。 */
        _o6Chat() {
            try {
                const st = (typeof window !== 'undefined' && window.SillyTavern) ? window.SillyTavern : null;
                const ctx = (st && typeof st.getContext === 'function') ? st.getContext() : null;
                return (ctx && Array.isArray(ctx.chat)) ? ctx.chat : null;
            } catch (e) { errLog(e, 'm4o6.chat'); return null; }
        }
        /** [v3.335.0 · M4-O6] 原话选取器：只取**该楼正文**里的引号原句（不生成、不改写）。 */
        _o6Quotes(floor, opts) {
            const o = (opts && typeof opts === 'object') ? opts : {};
            const max = Math.max(1, Math.min(5, Number(o.max) || 3));
            const chat = this._o6Chat();
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
        _o6Chapters(O) {
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
                const q = this._o6Quotes(c.floorFrom, { max: 3 });
                if (q && q.length) c.quotes = q.slice(0, 3);
            }
            return { chapters: chapters, source: 'summary-volumes+historical' };
        }
        /** [v3.335.0 · M4-O6] 分层摘要读口：真读数快照（SummarySystem 的真实导出）。 */
        _o6Summary(O) {
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
        _o6Outcomes(O) {
            if (!O) return null;
            const WP = (O.worldProg && typeof O.worldProg === 'object') ? O.worldProg : null;
            const hasSus = Array.isArray(O.suspense);
            if (!WP && !hasSus) return null;
            const rows = [];
            const cmp = (this.worldProg && this.worldProg.branchComparison) ? this.worldProg.branchComparison : null;
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
        _o6PastDetails(O) {
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
        _o6KnownFacts(O) {
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
        _o6ConfirmedFacts(O) {
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
        _o6KnownEntities() {
            if (Array.isArray(this._loreKnownEntities) && this._loreKnownEntities.length) return this._loreKnownEntities;
            try {
                const a = this._qaKnownActors(0);
                return (Array.isArray(a) && a.length) ? a : null;
            } catch (e) { errLog(e, 'm4o6.knownEntities'); return null; }
        }
'''

# ══════════ 二、四个装配点改走派生层 ══════════
A_SA = """        _storyAnnualDeps() {
            return {
                CHAPTERS: (this._storyAnnualChapters && Array.isArray(this._storyAnnualChapters.chapters)) ? this._storyAnnualChapters : null,
                SUMMARY: (this._storyAnnualSummary && typeof this._storyAnnualSummary === 'object') ? this._storyAnnualSummary : null,
                QUOTES: (typeof this._storyAnnualQuotes === 'function') ? this._storyAnnualQuotes : null
"""
check(A_SA, 1, 'storyAnnual-deps')
C_SA = """        _storyAnnualDeps() {
            /* [v3.335.0 · M4-O6] 三件**逐件**取:显式私有槽优先,缺则走真实供数派生层。 */
            const O = this._o6RealOwners();
            const fromChapters = (this._storyAnnualChapters && Array.isArray(this._storyAnnualChapters.chapters)) ? this._storyAnnualChapters : this._o6Chapters(O);
            const fromSummary = (this._storyAnnualSummary && typeof this._storyAnnualSummary === 'object') ? this._storyAnnualSummary : this._o6Summary(O);
            const fromQuotes = (typeof this._storyAnnualQuotes === 'function') ? this._storyAnnualQuotes : (this._o6Chat() ? ((floor, opts) => this._o6Quotes(floor, opts)) : null);
            return {
                CHAPTERS: fromChapters,
                SUMMARY: fromSummary,
                QUOTES: fromQuotes
"""
A_BC = """        _branchCanonDeps() {
            const BS = _moduleLib(() => window.LonShaBranchSemantics, 'branch-semantics.js');
            return {
                BRANCH_OUTCOMES: (Array.isArray(this._branchOutcomes)) ? this._branchOutcomes : null,
                CONFIRMED_FACTS: (this._loreConfirmedFacts && typeof this._loreConfirmedFacts === 'object') ? this._loreConfirmedFacts : null,
"""
check(A_BC, 1, 'branchCanon-deps')
C_BC = """        _branchCanonDeps() {
            const BS = _moduleLib(() => window.LonShaBranchSemantics, 'branch-semantics.js');
            /* [v3.335.0 · M4-O6] 结局清单与已确认事实改走真实供数派生层(私有槽仍优先)。 */
            const O = this._o6RealOwners();
            return {
                BRANCH_OUTCOMES: Array.isArray(this._branchOutcomes) ? this._branchOutcomes : this._o6Outcomes(O),
                CONFIRMED_FACTS: (this._loreConfirmedFacts && typeof this._loreConfirmedFacts === 'object') ? this._loreConfirmedFacts : this._o6ConfirmedFacts(O),
"""
A_FR = """        _fatedRecallDeps() {
            const CFG = (this.config && this.config.config) ? this.config.config : {};
            const win = Number(CFG.recallCooldownDays);
            return {
                PAST_DETAILS: (Array.isArray(this._pastDetails)) ? this._pastDetails : null,
                KNOWN_FACTS: (this._knownFacts && typeof this._knownFacts === 'object') ? this._knownFacts : null,
"""
check(A_FR, 1, 'fatedRecall-deps')
C_FR = """        _fatedRecallDeps() {
            const CFG = (this.config && this.config.config) ? this.config.config : {};
            const win = Number(CFG.recallCooldownDays);
            /* [v3.335.0 · M4-O6] 旧事清单与角色知情名单改走真实供数派生层(私有槽仍优先)。 */
            const O = this._o6RealOwners();
            return {
                PAST_DETAILS: Array.isArray(this._pastDetails) ? this._pastDetails : this._o6PastDetails(O),
                KNOWN_FACTS: (this._knownFacts && typeof this._knownFacts === 'object') ? this._knownFacts : this._o6KnownFacts(O),
"""
A_LI = """            return {
                KNOWN_ENTITIES: (Array.isArray(this._loreKnownEntities) && this._loreKnownEntities.length) ? this._loreKnownEntities : null,
                CONFIRMED_FACTS: (this._loreConfirmedFacts && typeof this._loreConfirmedFacts === 'object') ? this._loreConfirmedFacts : null,
"""
check(A_LI, 1, 'loreImport-deps')
C_LI = """            /* [v3.335.0 · M4-O6] 已登记实体名改走既有唯一装配点;已确认事实改走真实供数派生层。 */
            const O = this._o6RealOwners();
            return {
                KNOWN_ENTITIES: this._o6KnownEntities(),
                CONFIRMED_FACTS: (this._loreConfirmedFacts && typeof this._loreConfirmedFacts === 'object') ? this._loreConfirmedFacts : this._o6ConfirmedFacts(O),
"""

out = src[:INS] + BLOCK + src[INS:]
for a, b in ((A_SA, C_SA), (A_BC, C_BC), (A_FR, C_FR), (A_LI, C_LI)):
    if out.count(a) != 1:
        raise SystemExit('[o6] 装配点锚点在插入后命中异常：%r -> %d' % (a[:60], out.count(a)))
    out = out.replace(a, b, 1)

if DRY:
    print('[o6] dry-run：插入 %d 字符，四处装配点已改；未写盘' % len(BLOCK))
    sys.exit(0)

io.open(P, 'w', encoding='utf-8').write(out)
t2 = io.open(P, encoding='utf-8').read()
assert t2.count('_o6RealOwners') >= 5, '派生层未落盘'
assert t2.count('annualSources()') >= 1, '出口未落盘'
print('[o6] 已写 index.js：+%d 字符；派生层 12 个成员；四装配点改走派生' % len(BLOCK))
print('[o6] 行数（wc -l）:', t2.count('\n'))