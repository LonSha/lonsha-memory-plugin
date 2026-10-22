/* ========================================================
 * character-agency-contract.js — [M6-X1 / M6-X2 / M6-X7 · v3.357.0] 人物行动与心智扩展契约
 * 纯函数/纯契约，零依赖，零写回。
 * --------------------------------------------------------
 * 解决问题：
 *   M6-X1 信念演化：人物可以有理由地误解，也能有过程地改观；
 *   M6-X2 经验与习惯：记住怎么做、何时例外，而不只记住做过；
 *   M6-X7 缺席与期待：记住该发生却尚未发生的事，区分观察窗口与失约。
 * ======================================================== */
'use strict';

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaCharacterAgencyContract = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    const VERSION = '3.357.0';

    function _str(v) { return (v != null) ? String(v).trim() : ''; }
    function _num(v, def = null) {
        const n = Number(v);
        return Number.isFinite(n) ? n : def;
    }

    function createBelief(raw) {
        const r = (raw && typeof raw === 'object') ? raw : {};
        return {
            id: _str(r.id || 'belief_' + Math.random().toString(36).slice(2, 8)),
            actor: _str(r.actor),
            subject: _str(r.subject),
            interpretation: _str(r.interpretation),
            confidence: _num(r.confidence, 0.8),
            knownEvidenceRefs: Array.isArray(r.knownEvidenceRefs) ? r.knownEvidenceRefs.map(_str) : [],
            evolutionHistory: Array.isArray(r.evolutionHistory) ? r.evolutionHistory.slice(0, 20) : [],
            updatedAt: _num(r.updatedAt, Date.now())
        };
    }

    function evolveBelief(belief, evidence, observerActor) {
        const b = createBelief(belief);
        const obs = _str(observerActor);

        if (b.actor !== obs) {
            return { ok: false, unchanged: true, reason: 'observer_mismatch' };
        }

        const evGrade = _str(evidence.grade || 'primary');
        const evContent = _str(evidence.content);
        const isCounterEvidence = !!evidence.isCounterEvidence;

        if (evGrade === 'rumor' || evGrade === 'hearsay') {
            b.evolutionHistory.push({
                evidence: evContent,
                grade: evGrade,
                impact: 'discounted_as_unreliable',
                floor: _num(evidence.floor, 0)
            });
            return { ok: true, belief: b, changed: false, reason: 'hearsay_discounted' };
        }

        if (isCounterEvidence && (evGrade === 'primary' || evGrade === 'witness')) {
            const oldInterpretation = b.interpretation;
            b.interpretation = _str(evidence.newInterpretation || ('对[' + b.subject + ']改观：因' + evContent));
            b.confidence = _num(evidence.newConfidence, 0.7);
            b.knownEvidenceRefs.push(_str(evidence.refId || 'ref_' + Date.now()));
            b.evolutionHistory.push({
                previous: oldInterpretation,
                newInterpretation: b.interpretation,
                evidence: evContent,
                floor: _num(evidence.floor, 0)
            });
            b.updatedAt = Date.now();
            return { ok: true, belief: b, changed: true };
        }

        return { ok: true, belief: b, changed: false };
    }

    function createHabitRepo(raw) {
        const r = (raw && typeof raw === 'object') ? raw : {};
        return {
            actor: _str(r.actor),
            practices: Array.isArray(r.practices) ? r.practices.slice(0, 100) : [],
            habits: Array.isArray(r.habits) ? r.habits.slice(0, 20) : []
        };
    }

    function recordPractice(repo, practicePayload) {
        const r = createHabitRepo(repo);
        const p = {
            id: 'prac_' + Math.random().toString(36).slice(2, 8),
            context: _str(practicePayload.context),
            approach: _str(practicePayload.approach),
            outcome: _str(practicePayload.outcome || 'success'),
            floor: _num(practicePayload.floor, 0)
        };
        r.practices.push(p);

        const matchedSuccesses = r.practices.filter(x => x.context === p.context && x.approach === p.approach && x.outcome === 'success');
        let formedHabit = null;

        if (matchedSuccesses.length >= 3) {
            const existing = r.habits.find(h => h.context === p.context && h.approach === p.approach);
            if (!existing) {
                formedHabit = {
                    habitId: 'h_' + Math.random().toString(36).slice(2, 8),
                    context: p.context,
                    approach: p.approach,
                    exceptionCondition: _str(practicePayload.exceptionCondition || ''),
                    exceptionApproach: _str(practicePayload.exceptionApproach || ''),
                    status: 'active',
                    formedAtPractices: matchedSuccesses.length
                };
                r.habits.push(formedHabit);
            }
        }

        if (p.outcome === 'failure') {
            const target = r.habits.find(h => h.context === p.context && h.approach === p.approach);
            if (target) {
                target.status = 'under_review';
            }
        }

        return { ok: true, repo: r, practice: p, formedHabit };
    }

    function resolveHabitBehavior(habit, currentContext = {}) {
        if (!habit || habit.status !== 'active') return null;
        if (habit.exceptionCondition && currentContext[habit.exceptionCondition]) {
            return {
                isException: true,
                approach: habit.exceptionApproach || 'pause_or_alternative',
                reason: '触发例外条件 [' + habit.exceptionCondition + ']'
            };
        }
        return {
            isException: false,
            approach: habit.approach,
            reason: '遵循常规习惯 [' + habit.context + ']'
        };
    }

    function createAbsenceExpectation(raw) {
        const r = (raw && typeof raw === 'object') ? raw : {};
        return {
            id: _str(r.id || 'exp_' + Math.random().toString(36).slice(2, 8)),
            holder: _str(r.holder),
            targetActor: _str(r.targetActor),
            expectedAction: _str(r.expectedAction),
            deadlineStoryClock: _num(r.deadlineStoryClock, 0),
            observationWindowPassed: false,
            status: ['waiting', 'unconfirmed_delay', 'confirmed_absence', 'delayed_received'].includes(r.status)
                ? r.status
                : 'waiting',
            waitingHistory: Array.isArray(r.waitingHistory) ? r.waitingHistory.slice(0, 10) : []
        };
    }

    function evaluateExpectation(exp, currentStoryClock, observerContext = {}) {
        const e = createAbsenceExpectation(exp);
        const clock = _num(currentStoryClock, 0);

        if (e.status === 'delayed_received') {
            return { expectation: e, status: 'delayed_received' };
        }

        if (clock < e.deadlineStoryClock) {
            e.status = 'waiting';
            return { expectation: e, status: 'waiting', reason: 'story_clock_not_reached' };
        }

        e.observationWindowPassed = true;

        if (observerContext.receivedDelayedMessage) {
            e.status = 'delayed_received';
            e.waitingHistory.push({
                clock,
                note: '收到延迟回应：' + _str(observerContext.delayedMessage)
            });
            return { expectation: e, status: 'delayed_received', reason: 'delayed_response_arrived' };
        }

        if (!observerContext.knowsCounterpartSchedule) {
            e.status = 'unconfirmed_delay';
            e.waitingHistory.push({
                clock,
                note: '超过预定时间未收到音信，尚不知对方情境'
            });
            return { expectation: e, status: 'unconfirmed_delay', reason: 'counterpart_schedule_unknown' };
        }

        e.status = 'confirmed_absence';
        e.waitingHistory.push({
            clock,
            note: '已确认对方在预定窗口缺席'
        });
        return { expectation: e, status: 'confirmed_absence', reason: 'confirmed_absence_without_excuse' };
    }

    const api = {
        VERSION,
        createBelief,
        evolveBelief,
        createHabitRepo,
        recordPractice,
        resolveHabitBehavior,
        createAbsenceExpectation,
        evaluateExpectation
    };
    return api;
});
