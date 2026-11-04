/* ============================================================
 * generation-material-reconcile.js — [L14-O3]
 * 生成前材料计划与实际注入逐条对拍（纯函数、只读、不写owner）
 *
 * 边界：本模块不重新实现预算或权限算法，也不把文本 includes 当身份判据。
 * 计划由既有 generation-memory-plan 产生；实际块由真实注入回执提供。
 * 若两边没有稳定 materialId 映射，明确报告 unknown，而不是冒充一致。
 * ============================================================ */
(function (root) {
    'use strict';
    const VERSION = '3.449.0';
    const STATES = Object.freeze({
        INJECTED: 'injected',
        TEMPORARILY_EXCLUDED: 'temporarily-excluded',
        BUDGET_TRIMMED: 'budget-trimmed',
        PERMISSION_REJECTED: 'permission-rejected',
        PLAN_MISSING: 'plan-missing',
        OUTSIDE_PLAN: 'outside-plan',
        UNKNOWN: 'unknown'
    });
    const safeStr = (v) => String(v == null ? '' : v).trim();
    const finite = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
    const freeze = (v) => Object.freeze(v);

    function normalizeMaterial(raw, idx) {
        if (!raw || typeof raw !== 'object') return null;
        const id = safeStr(raw.id || raw.factKey || raw.materialId) || ('material_' + idx);
        const content = safeStr(raw.content || raw.text);
        const status = safeStr(raw.status || (raw.removed ? 'temporarily-excluded' : 'selected'));
        const exclusionReason = safeStr(raw.exclusionReason || raw.removeReason);
        const permission = safeStr(raw.permission || raw.access || raw.verdict);
        const selected = raw.selected !== false && raw.removed !== true && status !== 'temporarily-excluded';
        return freeze({
            id, title: safeStr(raw.title || raw.label) || id, content,
            tier: safeStr(raw.tier) || 'optional',
            selected, status, exclusionReason, permission,
            tokenCost: finite(raw.tokenCost),
            sourceRef: safeStr(raw.sourceRef || raw.ref) || null
        });
    }

    function normalizePlan(plan) {
        if (!plan || typeof plan !== 'object') return null;
        const raw = Array.isArray(plan.items) ? plan.items : [];
        const items = raw.map(normalizeMaterial).filter(Boolean);
        if (!items.length && !safeStr(plan.sceneGoal)) return null;
        return freeze({
            sceneGoal: safeStr(plan.sceneGoal),
            revision: safeStr(plan.revision || plan.planId) || null,
            items: freeze(items),
            budget: finite(plan.budget),
            budgetTrimmed: plan.budgetTrimmed === true,
            cancelled: plan.cancelled === true
        });
    }

    function materialIdMap(opts) {
        const o = opts || {};
        const map = new Map();
        if (o.materialIdsByInjectionOrder && typeof o.materialIdsByInjectionOrder === 'object') {
            if (Array.isArray(o.materialIdsByInjectionOrder)) {
                o.materialIdsByInjectionOrder.forEach((id, i) => { if (safeStr(id)) map.set(String(i), safeStr(id)); });
            } else {
                Object.keys(o.materialIdsByInjectionOrder).forEach((k) => {
                    const id = safeStr(o.materialIdsByInjectionOrder[k]);
                    if (id) map.set(String(k), id);
                });
            }
        }
        return map;
    }

    function actualMaterialRows(actual, opts) {
        const a = actual && typeof actual === 'object' ? actual : {};
        const blocks = Array.isArray(a.blocks) ? a.blocks : [];
        const ids = materialIdMap(opts);
        const explicit = (Array.isArray(a.materialIds) ? a.materialIds : null);
        return blocks.map((b, i) => {
            const row = b && typeof b === 'object' ? b : {};
            const id = safeStr(row.materialId || row.materialKey || row.planId)
                || safeStr(explicit && explicit[i])
                || safeStr(ids.get(String(row.id)) || ids.get(String(i)));
            return freeze({
                blockId: finite(row.id) === null ? String(row.id == null ? i : row.id) : finite(row.id),
                materialId: id || null,
                kept: row.kept === true,
                partial: row.partial === true,
                reason: safeStr(row.reason),
                via: safeStr(row.via) || 'unknown',
                chars: finite(row.chars) || 0,
                src: safeStr(row.src) || 'unattributed'
            });
        });
    }

    function buildSelectionPlan(plan, opts) {
        const normalized = normalizePlan(plan);
        const o = opts || {};
        if (!normalized) return freeze({ ok: false, state: STATES.PLAN_MISSING, writes: false, items: freeze([]), selectedIds: freeze([]), excludedIds: freeze([]) });
        if (o.cancelled === true || normalized.cancelled) {
            return freeze({ ok: true, state: 'cancelled', writes: false, cancelled: true, planRevision: normalized.revision, items: normalized.items, selectedIds: freeze([]), excludedIds: freeze(normalized.items.map(x => x.id)) });
        }
        const items = normalized.items.map((item) => {
            if (!item.selected || item.status === 'permission-rejected' || item.permission === 'blocked' || item.permission === 'denied') {
                return freeze({ ...item, selected: false, status: STATES.PERMISSION_REJECTED, state: STATES.PERMISSION_REJECTED });
            }
            if (o.excludeIds instanceof Set && o.excludeIds.has(item.id)) {
                return freeze({ ...item, selected: false, status: STATES.TEMPORARILY_EXCLUDED, state: STATES.TEMPORARILY_EXCLUDED, exclusionReason: 'one-round-exclusion' });
            }
            return freeze({ ...item, state: 'selected' });
        });
        return freeze({
            ok: true, writes: false, cancelled: false, planRevision: normalized.revision,
            items: freeze(items),
            selectedIds: freeze(items.filter(x => x.selected).map(x => x.id)),
            excludedIds: freeze(items.filter(x => !x.selected).map(x => x.id)),
            temporaryExcludedIds: freeze(items.filter(x => x.state === STATES.TEMPORARILY_EXCLUDED).map(x => x.id)),
            permissionRejectedIds: freeze(items.filter(x => x.state === STATES.PERMISSION_REJECTED).map(x => x.id))
        });
    }

    function reconcileGenerationConsumption(plan, actual, opts) {
        const o = opts || {};
        const selection = buildSelectionPlan(plan, o);
        const rows = actualMaterialRows(actual, o);
        const byId = new Map(selection.items.map(x => [x.id, x]));
        const seen = new Set();
        const entries = [];
        const unknownRows = [];
        for (const row of rows) {
            if (!row.materialId) {
                unknownRows.push(freeze({ ...row, state: STATES.UNKNOWN, why: '实际注入块没有稳定 materialId，禁止用文本猜身份' }));
                continue;
            }
            seen.add(row.materialId);
            const planned = byId.get(row.materialId);
            let state = STATES.OUTSIDE_PLAN;
            let why = '实际注入材料不在本次计划中';
            if (planned) {
                if (planned.state === STATES.PERMISSION_REJECTED || row.reason === 'permission-rejected') {
                    state = STATES.PERMISSION_REJECTED; why = '权限裁决阻止进入实际载荷';
                } else if (planned.state === STATES.TEMPORARILY_EXCLUDED) {
                    state = STATES.TEMPORARILY_EXCLUDED; why = row.kept || row.partial ? '本轮临时排除却出现在实际载荷，形成越权偏差' : '本轮临时排除，实际载荷不应使用';
                } else if (!row.kept || row.reason === 'dropped-budget' || row.reason === 'budget_exceeded') {
                    state = STATES.BUDGET_TRIMMED; why = '计划存在，但实际预算回执未保留';
                } else if (row.kept || row.partial) {
                    state = STATES.INJECTED; why = row.partial ? '实际载荷只包含块的一部分' : '计划材料进入实际载荷';
                }
            }
            entries.push(freeze({ materialId: row.materialId, state, why, kept: row.kept, partial: row.partial, chars: row.chars, blockId: row.blockId, via: row.via, src: row.src }));
        }
        for (const item of selection.items) {
            if (seen.has(item.id)) continue;
            let state = item.state === STATES.TEMPORARILY_EXCLUDED ? STATES.TEMPORARILY_EXCLUDED
                : item.state === STATES.PERMISSION_REJECTED ? STATES.PERMISSION_REJECTED
                    : (selection.selectedIds.includes(item.id) ? STATES.BUDGET_TRIMMED : STATES.UNKNOWN);
            entries.push(freeze({ materialId: item.id, state, why: state === STATES.BUDGET_TRIMMED ? '计划材料未在实际回执中保留，按预算裁剪处理' : '计划材料未产生可核对的实际块', kept: false, partial: false, chars: 0, blockId: null, via: 'plan-vs-receipt', src: item.sourceRef || 'unattributed' }));
        }
        const counts = {};
        for (const e of entries.concat(unknownRows)) counts[e.state] = (counts[e.state] || 0) + 1;
        const actualKnown = rows.filter(x => x.materialId).length;
        const mapped = actualKnown === rows.length;
        const status = selection.cancelled ? 'cancelled' : (!selection.ok ? 'plan-missing' : (!mapped ? 'partially-measurable' : (entries.some(x => x.state !== STATES.INJECTED) ? 'diverged' : 'matched')));
        return freeze({
            version: VERSION, writes: false, status,
            planRevision: selection.planRevision || null,
            sceneGoal: safeStr(plan && plan.sceneGoal),
            measurable: mapped,
            mapping: mapped ? 'material-id' : 'partial-or-missing-material-id',
            counts: freeze(counts),
            entries: freeze(entries),
            unknown: freeze(unknownRows),
            selectedIds: selection.selectedIds,
            temporaryExcludedIds: selection.temporaryExcludedIds || freeze([]),
            permissionRejectedIds: selection.permissionRejectedIds || freeze([]),
            actualBlockCount: rows.length,
            actualMappedBlockCount: actualKnown,
            note: mapped ? '' : '至少一个实际注入块缺少 materialId；不以文本包含关系推断计划一致性'
        });
    }

    function reconcileFromReceipt(plan, receipt, opts) {
        const r = receipt && typeof receipt === 'object' ? receipt : null;
        return reconcileGenerationConsumption(plan, { blocks: r && Array.isArray(r.blocks) ? r.blocks : [] }, opts);
    }

    function generationMaterialReconcileSelfCheck() {
        const problems = [];
        if (STATES.INJECTED !== 'injected') problems.push('INJECTED 状态契约损坏');
        if (STATES.UNKNOWN !== 'unknown') problems.push('UNKNOWN 状态契约损坏');
        const sample = reconcileGenerationConsumption({ sceneGoal: 'self-check', items: [{ id: 'a', content: 'A' }] }, { blocks: [{ id: 0, kept: true, chars: 1 }] });
        if (sample.status !== 'partially-measurable' || sample.writes !== false) problems.push('缺少 materialId 必须降级为不可完全测且零写入');
        return freeze({ problems: freeze(problems) });
    }

    function receiptFromInjectionReadout(readout) {
        const r = readout && typeof readout === 'object' ? readout : null;
        return r ? { blocks: Array.isArray(r.blocks) ? r.blocks : [], round: finite(r.round), origin: safeStr(r.origin) || null } : null;
    }

    const api = freeze({ VERSION, STATES, normalizeMaterial, normalizePlan, buildSelectionPlan, actualMaterialRows, reconcileGenerationConsumption, reconcileFromReceipt, receiptFromInjectionReadout, generationMaterialReconcileSelfCheck });
    root.LonShaGenerationMaterialReconcile = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
