#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.340.0 · M4-X4 宿主出口：追问三出口 + 自检行。"""
import io
import sys
ROOT = '/home/user/lonsha-memory-plugin/'

def patch(path, old, new, label):
    p = ROOT + path
    t = io.open(p, encoding='utf-8').read()
    if t.count(new) >= 1:
        print('SKIP %s (already patched)' % label)
        return
    n = t.count(old)
    if n != 1:
        sys.stderr.write('FAIL %s: anchor hits %d (need 1)\n' % (label, n))
        sys.exit(1)
    io.open(p, 'w', encoding='utf-8').write(t.replace(old, new, 1))
    print('OK %s' % label)

IDX = 'index.js'

METHODS = r'''        /** [v3.340.0 · M4-X4] 追问线程的**懒初始化**（随聊天持久化；只存约束不存答案）。 */
        _qaThreadState() {
            if (!this._qaThread || typeof this._qaThread !== 'object' || Array.isArray(this._qaThread)) {
                this._qaThread = {
                    version: 1, state: 'idle', chatKey: '', branchKey: '',
                    subjects: [], candidates: [], atFloor: null, atHint: '',
                    compareAxis: '', scope: {}, turn: 0, trace: []
                };
            }
            return this._qaThread;
        }
        /**
         * [v3.340.0 · M4-X4] 出口：追问一句（**只读**；把上一轮的查询约束继承进本轮规划）。
         *
         * 【与 askMemoryQuestion 的关系：同一份口径，只多一层条件继承】
         *   本出口**不另写查询** —— 先调内核 `planQuestion`（与 askMemoryQuestion 逐字同参），
         *   再调 qa-thread 内核 `advanceThread` 算「这一轮继承了什么 / 新设了什么」，
         *   把 thread 的主体 / 时点下界**并进**每条计划的 spec（只并既有 FILTERS 键），
         *   然后走**同一个** `Q.query` 与 `Q.composeAnswer`。
         *
         * 【消歧未决 ⇒ 不产确定结论】
         *   `awaiting === true` 时**不跑查询**（跑了就是把「指代不定」伪装成「查过了」），
         *   回执带 `awaiting/accepted/candidates`，answer 为空、gaps 具名。
         *
         * 【不跨会话暗中继承】thread 带 chatKey；宿主会话身份变了，内核作废重建
         *   （gaps 具名 `thread-identity-changed`）。
         */
        askMemoryQuestionFollowUp(question, opts) {
            const o = opts || {};
            const qText = String(question == null ? '' : question);
            const QT = _qaThreadLib();
            const Q = _evidenceQueryLib();
            const blank = (reason) => ({
                version: 0, question: qText, intents: [], actor: null, actors: [], topics: [],
                timeHints: [], relation: null, answer: [], gaps: [{ kind: 'module', why: reason }],
                refs: [], plans: [], masked: 0, truncated: false, resourced: 0, total: 0,
                readings: 0, covered: 0, dropped: 0, dedup: 0, events: [], keyPoints: 0, explain: null,
                knownActors: 0, reason: reason, writesNothing: true,
                followUp: true, turn: 0, threadState: 'idle', inherit: [], condition: [],
                awaiting: false, accepted: true, candidates: []
            });
            if (!Q || typeof Q.planQuestion !== 'function' || typeof Q.composeAnswer !== 'function') {
                return blank('模块未加载（evidence-query.js）');
            }
            if (!QT || typeof QT.advanceThread !== 'function') {
                return blank('模块未加载（qa-thread.js）');
            }
            try {
                const known = Array.isArray(o.knownActors) ? o.knownActors : this._qaKnownActors(o.maxActors);
                const chatKey = (typeof this.getCurrentChatId === 'function') ? String(this.getCurrentChatId() || '') : '';
                const plan = Q.planQuestion(qText, { knownActors: known, actorAliases: this._qaActorAliases() });
                const adv = QT.advanceThread(o.thread || this._qaThreadState(), plan, {
                    question: qText, chatKey: chatKey,
                    branchKey: (o.branchKey === undefined || o.branchKey === null) ? '' : String(o.branchKey),
                    scope: o.scope
                });
                const thread = adv.thread;
                const base = {
                    followUp: true, turn: thread.turn, threadState: thread.state,
                    inherit: adv.inherit, condition: adv.condition,
                    awaiting: adv.awaiting === true, accepted: adv.awaiting !== true,
                    candidates: Array.isArray(thread.candidates) ? thread.candidates.slice() : []
                };
                /* 消歧未决：**不跑查询**（跑了就是把「指代不定」伪装成「查过了」）。 */
                if (adv.awaiting === true) {
                    this._qaThread = thread;
                    this._memoryQaLast = {
                        at: Date.now(), intents: Array.isArray(plan.intents) ? plan.intents : [],
                        actor: null, plans: 0, total: 0, resourced: 0, masked: 0,
                        gaps: (adv.gaps || []).length, relation: '', relationCommon: 0,
                        causal: '', causalSource: '', readings: 0, events: 0,
                        threadState: thread.state, turn: thread.turn, awaiting: true,
                        threadInherit: adv.inherit, threadCondition: adv.condition
                    };
                    return Object.assign({
                        version: Q.QA_VERSION || 0, question: qText,
                        intents: Array.isArray(plan.intents) ? plan.intents : [], actor: null,
                        actors: Array.isArray(plan.actors) ? plan.actors.slice() : [],
                        topics: Array.isArray(plan.topics) ? plan.topics.slice() : [],
                        timeHints: Array.isArray(plan.timeHints) ? plan.timeHints : [], relation: null,
                        answer: [], gaps: (adv.gaps || []).slice(), refs: [], plans: [],
                        masked: 0, truncated: false, resourced: 0, total: 0,
                        readings: 0, covered: 0, dropped: 0, dedup: 0, events: [], keyPoints: 0, explain: null,
                        knownActors: known.length, reason: '', writesNothing: true
                    }, base);
                }
                /* 合并 spec：thread 的既有 FILTERS 键并进每条计划（不新增条件键）。 */
                const ts = QT.threadSpec(thread);
                const ledgers = _evidenceQueryLedgersOf();
                const payload = {
                    ledgers: ledgers,
                    apis: (typeof _ledgerApis === 'function') ? _ledgerApis() : {},
                    pageSize: (Number(o.pageSize) > 0 ? Math.floor(Number(o.pageSize)) : 30)
                };
                if (o.maxPerLedger !== undefined) payload.maxPerLedger = o.maxPerLedger;
                const results = [];
                const planReadings = [];
                for (const p of plan.plans) {
                    const spec = Object.assign({}, p.spec, ts.spec);
                    const r = Q.query(this, spec, payload);
                    results.push({ id: p.id, spec: spec, query: r });
                    planReadings.push({
                        id: p.id, why: p.why, spec: spec,
                        total: (r && typeof r.total === 'number') ? r.total : 0,
                        state: (r && r.state) || 'unknown',
                        scanned: (r && r.scanned) || 0,
                        replayKey: (r && r.replayKey) || ''
                    });
                }
                let causal = { edges: [], keyOf: null };
                try { if (typeof this._qaCausalEdges === 'function') causal = this._qaCausalEdges(); }
                catch (_e) { causal = { edges: [], keyOf: null }; }
                const composed = Q.composeAnswer(plan, results, {
                    maxSentences: o.maxSentences, causalEdges: causal.edges, causalKeyOf: causal.keyOf
                });
                /* 继承 / 新设 / 消歧缺口如实并进 gaps（不同形，不合成一格）。 */
                const gaps = (composed.gaps || []).concat(adv.gaps || []);
                this._qaThread = thread;
                this._memoryQaLast = {
                    at: Date.now(), intents: composed.intents, actor: plan.actor,
                    plans: planReadings.length, total: composed.total, resourced: composed.resourced,
                    masked: composed.masked, gaps: gaps.length,
                    relation: (composed.relation && composed.relation.state) ? composed.relation.state : '',
                    relationCommon: (composed.relation && composed.relation.common) || 0,
                    causal: (composed.explain && composed.explain.causal) ? composed.explain.causal : '',
                    causalSource: (composed.explain && composed.explain.causalSource) ? composed.explain.causalSource : '',
                    readings: composed.readings || 0, events: (composed.events || []).length,
                    threadState: thread.state, turn: thread.turn, awaiting: false,
                    threadInherit: adv.inherit, threadCondition: adv.condition
                };
                return Object.assign({
                    version: Q.QA_VERSION || 0, question: composed.question,
                    intents: composed.intents, actor: plan.actor,
                    actors: Array.isArray(plan.actors) ? plan.actors.slice() : [],
                    topics: Array.isArray(plan.topics) ? plan.topics.slice() : [],
                    timeHints: Array.isArray(plan.timeHints) ? plan.timeHints : [],
                    relation: composed.relation || null,
                    answer: composed.answer, gaps: gaps, refs: composed.refs,
                    plans: planReadings,
                    masked: composed.masked, truncated: composed.truncated,
                    resourced: composed.resourced, total: composed.total,
                    readings: composed.readings || 0, covered: composed.covered || 0,
                    dropped: composed.dropped || 0, dedup: composed.dedup || 0,
                    events: composed.events || [], keyPoints: composed.keyPoints || 0,
                    explain: composed.explain || null,
                    knownActors: known.length, reason: '', writesNothing: true
                }, base);
            } catch (e) {
                errLog(e, 'plugin.askMemoryQuestionFollowUp');
                return blank('thrown');
            }
        }
        /**
         * [v3.340.0 · M4-X4] 出口：消歧点选（**只读**；把用户的裁决接回 thread）。
         *   未选中 ⇒ 保持 awaiting，如实报 unresolved（不产确定结论）。
         */
        qaThreadResolve(picks, opts) {
            const o = opts || {};
            const QT = _qaThreadLib();
            if (!QT || typeof QT.resolveAmbiguity !== 'function') {
                return { ok: false, reason: 'module-unavailable', resolved: false, thread: null, chosen: [], unknown: [], writesNothing: true };
            }
            try {
                const res = QT.resolveAmbiguity(o.thread || this._qaThreadState(), picks);
                if (res.resolved === true) this._qaThread = res.thread;
                return Object.assign({ ok: res.resolved === true, reason: '' }, res);
            } catch (e) { errLog(e, 'plugin.qaThreadResolve'); return { ok: false, reason: 'thrown', resolved: false, thread: null, chosen: [], unknown: [], writesNothing: true }; }
        }
        /** [v3.340.0 · M4-X4] 出口：追问线程读数（**只读**；随聊天持久化，重开可查）。 */
        qaThread() {
            try {
                const QT = _qaThreadLib();
                const raw = this._qaThreadState();
                if (!QT || typeof QT.normalizeThread !== 'function') {
                    return { version: 0, state: 'idle', subjects: [], candidates: [], atFloor: null, atHint: '', compareAxis: '', branchKey: '', scope: {}, turn: 0, reason: 'module-unavailable', writesNothing: true };
                }
                const t = QT.normalizeThread(raw);
                return {
                    version: t.version, state: t.state, subjects: t.subjects.slice(),
                    candidates: t.candidates.slice(), atFloor: t.atFloor, atHint: t.atHint,
                    compareAxis: t.compareAxis, branchKey: t.branchKey, scope: Object.assign({}, t.scope),
                    turn: t.turn, reason: '', writesNothing: true
                };
            } catch (e) { errLog(e, 'plugin.qaThread'); return { version: 0, state: 'idle', subjects: [], candidates: [], atFloor: null, atHint: '', compareAxis: '', branchKey: '', scope: {}, turn: 0, reason: 'thrown', writesNothing: true }; }
        }
'''

ANCHOR_X9 = """        /* ────────────────────────────────────────────────────────────────
         * [v3.305.0 · X9] 统一记忆工具 API（宿主接线，五出口 + 自述 + 一行诊断）"""

patch(IDX, ANCHOR_X9, METHODS + ANCHOR_X9, 'followup methods')

# 自检行：记忆问答行之后补「追问线程」行（三态可分）。
ANCHOR_SC = """                            const body = this.memoryQaLine();
                            return ['记忆问答', body];
                        } catch (e) { errLog(e, 'selfCheck.memoryQa'); return ['记忆问答', '—（诊断异常）'];
                        }
                    })(),
"""
NEW_SC = ANCHOR_SC + """                    /* [v3.340.0 · M4-X4] 追问线程：回答「上一轮的主体/时点被继承进这一轮没有、
                     *   有没有因指代不定而待消歧」。与「记忆问答」行**分列**：那一行答
                     *   「最近一次问句答得怎样」，本行答「**追问语境**现在挂在哪一轮、在哪一轮卡住」。
                     *   三态可分：模块未加载 / 未开始追问 / 有 thread（含 awaiting 具名）。 */
                    (() => {
                        try {
                            const QT = _qaThreadLib();
                            if (!QT || typeof QT.threadLine !== 'function' || typeof this.qaThread !== 'function') {
                                return ['追问线程', '模块未加载（qa-thread.js）'];
                            }
                            const t = this.qaThread();
                            if (!t || !t.turn) return ['追问线程', '待用（面在位 · 未开始追问）'];
                            /* 继承 / 新设读数取自最近一次追问的留痕（_memoryQaLast），不另存一份。 */
                            const last = this._memoryQaLast || {};
                            return ['追问线程', QT.threadLine({ thread: t, inherit: last.threadInherit, condition: last.threadCondition })];
                        } catch (e) { errLog(e, 'selfCheck.qaThread'); return ['追问线程', '—（诊断异常）'];
                        }
                    })(),
"""
patch(IDX, ANCHOR_SC, NEW_SC, 'selfCheck row')

print('DONE part2')