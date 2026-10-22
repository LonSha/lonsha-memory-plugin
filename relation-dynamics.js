/* ========================================================
 * relation-dynamics.js — [M6-O7 · v3.357.0] 关系动力记忆契约
 * 纯函数/纯契约，零依赖，零写回。
 * --------------------------------------------------------
 * 解决问题：
 *   从仅记录单次转折与好感增减，到理解“关系为何保持、缓和或恶化”的动力模型。
 * 核心机制：
 *   1. 期待与付出（Expectations & Contributions）：双向记录，保留多轨依据，严禁平均成单一好感值；
 *   2. 单侧修复阻断早熟和解（Unilateral Repair Guard）：
 *      A 道歉但 B 尚未收到/得知时，判为单侧修复进行中，绝不判定已和解；
 *   3. 释然与脱敏（Relieved Matters）：
 *      旧约定/过节释然之后，不再施加活跃压力，但转折痕迹历史可查；
 *   4. 场景材料导出：为 M6-O6 关系材料分区提供“仍在意什么、哪些已释然、哪方尚不知道”。
 * ======================================================== */
'use strict';

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaRelationDynamics = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    const VERSION = '3.357.0';
    const MAX_ITEMS = 60;

    function _str(v) { return (v != null) ? String(v).trim() : ''; }
    function _num(v, def = null) {
        const n = Number(v);
        return Number.isFinite(n) ? n : def;
    }

    function createRelationDynamics(raw) {
        const r = (raw && typeof raw === 'object') ? raw : {};
        const charA = _str(r.charA || r.from);
        const charB = _str(r.charB || r.to);

        const expectations = Array.isArray(r.expectations) ? r.expectations.map(normExp).filter(Boolean) : [];
        const contributions = Array.isArray(r.contributions) ? r.contributions.map(normContrib).filter(Boolean) : [];
        const repairAttempts = Array.isArray(r.repairAttempts) ? r.repairAttempts.map(normRepair).filter(Boolean) : [];
        const breaches = Array.isArray(r.breaches) ? r.breaches.map(normBreach).filter(Boolean) : [];
        const relievedItems = Array.isArray(r.relievedItems) ? r.relievedItems.map(normRelieved).filter(Boolean) : [];

        return {
            version: 1,
            charA,
            charB,
            expectations: expectations.slice(0, MAX_ITEMS),
            contributions: contributions.slice(0, MAX_ITEMS),
            repairAttempts: repairAttempts.slice(0, MAX_ITEMS),
            breaches: breaches.slice(0, MAX_ITEMS),
            relievedItems: relievedItems.slice(0, MAX_ITEMS),
            updatedAt: _num(r.updatedAt, Date.now())
        };
    }

    function normExp(x) {
        if (!x || typeof x !== 'object') return null;
        const id = _str(x.id);
        if (!id) return null;
        return {
            id: id.slice(0, 60),
            holder: _str(x.holder).slice(0, 40),
            target: _str(x.target).slice(0, 40),
            content: _str(x.content).slice(0, 200),
            dueFloor: _num(x.dueFloor, null),
            disclosedToCounterpart: !!x.disclosedToCounterpart,
            status: ['pending', 'fulfilled', 'broken', 'relieved'].includes(x.status) ? x.status : 'pending'
        };
    }

    function normContrib(x) {
        if (!x || typeof x !== 'object') return null;
        const id = _str(x.id);
        if (!id) return null;
        return {
            id: id.slice(0, 60),
            actor: _str(x.actor).slice(0, 40),
            recipient: _str(x.recipient).slice(0, 40),
            action: _str(x.action).slice(0, 200),
            sacrifice: _str(x.sacrifice || '').slice(0, 100),
            floor: _num(x.floor, 0),
            acknowledgedByCounterpart: !!x.acknowledgedByCounterpart
        };
    }

    function normRepair(x) {
        if (!x || typeof x !== 'object') return null;
        const id = _str(x.id);
        if (!id) return null;
        return {
            id: id.slice(0, 60),
            initiator: _str(x.initiator).slice(0, 40),
            target: _str(x.target).slice(0, 40),
            gesture: _str(x.gesture).slice(0, 200),
            receivedByCounterpart: !!x.receivedByCounterpart,
            acceptedByCounterpart: !!x.acceptedByCounterpart,
            floor: _num(x.floor, 0)
        };
    }

    function normBreach(x) {
        if (!x || typeof x !== 'object') return null;
        const id = _str(x.id);
        if (!id) return null;
        return {
            id: id.slice(0, 60),
            defaulter: _str(x.defaulter).slice(0, 40),
            victim: _str(x.victim).slice(0, 40),
            incident: _str(x.incident).slice(0, 200),
            floor: _num(x.floor, 0),
            isRelieved: !!x.isRelieved
        };
    }

    function normRelieved(x) {
        if (!x || typeof x !== 'object') return null;
        const id = _str(x.id);
        if (!id) return null;
        return {
            id: id.slice(0, 60),
            itemType: _str(x.itemType || 'breach').slice(0, 40),
            reason: _str(x.reason).slice(0, 200),
            floor: _num(x.floor, 0)
        };
    }

    function recordExpectation(dyn, raw) {
        const item = normExp(raw);
        if (!item) return { ok: false, reason: 'invalid_expectation_payload' };
        const clone = createRelationDynamics(dyn);
        const idx = clone.expectations.findIndex(x => x.id === item.id);
        if (idx >= 0) clone.expectations[idx] = item;
        else clone.expectations.push(item);
        clone.updatedAt = Date.now();
        return { ok: true, dynamics: clone, expectation: item };
    }

    function recordContribution(dyn, raw) {
        const item = normContrib(raw);
        if (!item) return { ok: false, reason: 'invalid_contribution_payload' };
        const clone = createRelationDynamics(dyn);
        const idx = clone.contributions.findIndex(x => x.id === item.id);
        if (idx >= 0) clone.contributions[idx] = item;
        else clone.contributions.push(item);
        clone.updatedAt = Date.now();
        return { ok: true, dynamics: clone, contribution: item };
    }

    function recordRepairAttempt(dyn, raw) {
        const item = normRepair(raw);
        if (!item) return { ok: false, reason: 'invalid_repair_payload' };
        const clone = createRelationDynamics(dyn);
        const idx = clone.repairAttempts.findIndex(x => x.id === item.id);
        if (idx >= 0) clone.repairAttempts[idx] = item;
        else clone.repairAttempts.push(item);
        clone.updatedAt = Date.now();
        return { ok: true, dynamics: clone, repair: item };
    }

    function recordRelief(dyn, itemType, itemId, reason, floor = 0) {
        const tid = _str(itemId);
        if (!tid) return { ok: false, reason: 'missing_item_id' };
        const clone = createRelationDynamics(dyn);

        if (itemType === 'expectation') {
            const exp = clone.expectations.find(x => x.id === tid);
            if (exp) exp.status = 'relieved';
        } else if (itemType === 'breach') {
            const b = clone.breaches.find(x => x.id === tid);
            if (b) b.isRelieved = true;
        }

        const relievedObj = normRelieved({
            id: 'rel_' + tid,
            itemType,
            reason: reason || '自然释怀或沟通化解',
            floor
        });
        clone.relievedItems.push(relievedObj);
        clone.updatedAt = Date.now();
        return { ok: true, dynamics: clone, relieved: relievedObj };
    }

    function deriveRelationDynamics(dyn, options = {}) {
        const d = createRelationDynamics(dyn);
        const activeBreaches = d.breaches.filter(b => !b.isRelieved);
        const relievedBreaches = d.breaches.filter(b => b.isRelieved);
        const activeExps = d.expectations.filter(e => e.status === 'pending');

        const recentRepair = d.repairAttempts.length > 0
            ? d.repairAttempts[d.repairAttempts.length - 1]
            : null;

        let reconciliationStatus = 'none';
        let isReconciled = false;
        let unilateralPending = false;

        if (recentRepair) {
            if (!recentRepair.receivedByCounterpart) {
                reconciliationStatus = 'unilateral_repair_in_transit';
                unilateralPending = true;
                isReconciled = false;
            } else if (recentRepair.receivedByCounterpart && !recentRepair.acceptedByCounterpart) {
                reconciliationStatus = 'repair_deliberating';
                isReconciled = false;
            } else if (recentRepair.receivedByCounterpart && recentRepair.acceptedByCounterpart) {
                reconciliationStatus = 'reconciled';
                isReconciled = true;
            }
        }

        const multiTrackEvidence = {
            positiveContributionsCount: d.contributions.length,
            contributions: d.contributions.map(c => '[' + c.actor + '付出] ' + c.action + (c.sacrifice ? '(代价:' + c.sacrifice + ')' : '')),
            activeBreachesCount: activeBreaches.length,
            activeBreaches: activeBreaches.map(b => '[' + b.defaulter + '失约/冲突] ' + b.incident),
            relievedCount: relievedBreaches.length + d.relievedItems.length
        };

        let dynamicAtmosphere = 'stable';
        if (activeBreaches.length > 0 && !isReconciled) {
            dynamicAtmosphere = unilateralPending ? 'repair_in_transit_guarded' : 'strained_with_unresolved_breach';
        } else if (d.contributions.length > 0 && activeBreaches.length === 0) {
            dynamicAtmosphere = 'cooperative_and_supportive';
        } else if (relievedBreaches.length > 0 && activeBreaches.length === 0) {
            dynamicAtmosphere = 'relieved_and_settled';
        }

        return {
            charA: d.charA,
            charB: d.charB,
            dynamicAtmosphere,
            isReconciled,
            reconciliationStatus,
            unilateralPending,
            activeBreachesCount: activeBreaches.length,
            activeExpectationsCount: activeExps.length,
            relievedItemsCount: d.relievedItems.length,
            multiTrackEvidence
        };
    }

    function formatForSceneContext(dyn, viewpointChar) {
        const vp = _str(viewpointChar);
        const derived = deriveRelationDynamics(dyn);
        const d = createRelationDynamics(dyn);

        const isA = vp === d.charA;
        const counterpart = isA ? d.charB : d.charA;

        const myActiveBreaches = d.breaches.filter(b => b.victim === vp && !b.isRelieved);
        const myPendingExps = d.expectations.filter(e => e.holder === vp && e.status === 'pending');
        const myRelieved = d.relievedItems.map(r => r.reason);

        const unacknowledgedContribs = d.contributions.filter(c => c.actor === vp && !c.acknowledgedByCounterpart);
        const pendingRepairs = d.repairAttempts.filter(r => r.initiator === vp && !r.receivedByCounterpart);

        let asymmetryNote = '';
        if (pendingRepairs.length > 0) {
            asymmetryNote = '[知情不对称] 你已向' + counterpart + '致歉/示好，但对方尚未得知。';
        } else if (unacknowledgedContribs.length > 0) {
            asymmetryNote = '[知情不对称] 你为' + counterpart + '所做的事情对方仍未察觉。';
        }

        return {
            viewpointChar: vp,
            counterpart,
            reconciliationStatus: derived.reconciliationStatus,
            stillCaresAbout: [
                ...myActiveBreaches.map(b => b.incident),
                ...myPendingExps.map(e => e.content)
            ],
            relievedPoints: myRelieved,
            asymmetryNote,
            multiTrackSummary: '付出记载' + derived.multiTrackEvidence.positiveContributionsCount + '条，未和解争议' + derived.multiTrackEvidence.activeBreachesCount + '条'
        };
    }

    const api = {
        VERSION,
        createRelationDynamics,
        recordExpectation,
        recordContribution,
        recordRepairAttempt,
        recordRelief,
        deriveRelationDynamics,
        formatForSceneContext
    };
    return api;
});
