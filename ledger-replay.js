// ledger-replay.js — 账本回放（Ledger Replay），v3.183.0
// ------------------------------------------------------------
// 为什么存在：
//   删一楼 / 楼层前移这两件事，此前由 index.js 里两段手工清单承担：
//     rollbackFloor()   ≈ 200 行，40 余处 try/catch，每处一个子系统
//     shiftFloorsFrom() ≈ 160 行，30 余处直接改字段
//   两份清单各自为政：新增一个带楼层归属的子系统，必须同时记得改两处，
//   漏一处不报错——删楼后那部分记忆留在原地，自称「已回滚」。
//   这正是 Fable 审计（v2.5.0 代差分析）点名的根因：
//   「11 个子系统各自为政，回滚靠手工逆向操作，易漏」。
//
// 本模块把「谁有楼层归属、删楼时怎么撤、前移时怎么跟」收成一张声明式登记表，
// 并给出唯一的回放入口。登记表是意图，回放引擎是机制；两者被钉在一起之后，
// 「新增子系统忘了接回滚」从静默缺陷变成可机检的红灯
// （见 tests/audit/scan_v3182_ledger_replay.mjs）。
//
// 三条硬纪律（与本仓库一致）：
//   1. 只读不写上游：回放只调用登记项自己声明的动作，不发明新的数据形状。
//   2. 不抛：单项动作失败降级为一条报告，绝不阻断其余子系统的回放。
//   3. 不猜：取不到就如实分态（absent / threw / no-op），不把「没接上」说成「已回滚」。
//
// 回放报告的每一项都带三态：
//   ok     动作执行并返回计数
//   absent 目标对象不存在（模块未挂载）——如实，不是错误
//   threw  动作抛错——记入报告，回放继续
//   no-op  动作声明为 null（该面本就不参与这一侧）
(function (root) {
    'use strict';

    const LEDGER_REPLAY_VERSION = 1;

    // 楼层归属登记表。每一项：
    //   id        稳定标识（审计与报告都用它，改名即契约变化）
    //   label     诊断面用的中文名
    //   holds     持有楼层归属的方式：'records' 逐条记录带 floor | 'pointer' 单一指针 | 'derived' 由真源派生
    //   get(host) 取目标对象；返回 null/undefined 即判 absent
    //   drop(host, floor)    删楼时撤掉该楼的归属，返回撤掉的条数
    //   shift(host, deleted) 楼层前移时跟随，返回跟随的条数；null = 该面不参与前移
    // drop/shift 必须幂等：编辑重放、补提取都会再次触发，重复执行的结果必须与执行一次相同。
    const FLOOR_OWNERS = Object.freeze([
        {
            id: 'diary', label: '日记', holds: 'records',
            get: (h) => h.diary || null,
            drop: (h, f) => (h.diary && typeof h.diary.removeByFloor === 'function') ? h.diary.removeByFloor(f) : 0,
            shift: (h, d) => { let n = 0; for (const name of Object.keys(h.diary?.diaries || {})) for (const e of h.diary.diaries[name]) if (typeof e.floor === 'number' && e.floor > d) { e.floor--; n++; } return n; }
        },
        {
            id: 'money', label: '钱财流水', holds: 'records',
            get: (h) => h.moneyLedger || null,
            drop: (h, f) => (h.moneyLedger && typeof h.moneyLedger.removeByFloor === 'function') ? h.moneyLedger.removeByFloor(f) : 0,
            shift: (h, d) => { let n = 0; for (const l of (h.moneyLedger?.moneyLog || [])) if (typeof l.floor === 'number' && l.floor > d) { l.floor--; n++; } return n; }
        },
        {
            id: 'cards', label: '剧情卡牌', holds: 'records',
            get: (h) => h.cards || null,
            drop: (h, f) => (h.cards && typeof h.cards.removeByFloor === 'function') ? h.cards.removeByFloor(f) : 0,
            shift: (h, d) => { let n = 0; for (const c of (h.cards?.cards || [])) if (typeof c.floor === 'number' && c.floor > d) { c.floor--; n++; } return n; }
        },
        {
            id: 'conflicts', label: '矛盾账本', holds: 'records',
            get: (h) => h.conflicts || null,
            drop: (h, f) => (h.conflicts && typeof h.conflicts.removeByFloor === 'function') ? h.conflicts.removeByFloor(f) : 0,
            shift: (h, d) => { let n = 0; for (const c of (h.conflicts?.conflicts || [])) if (typeof c.floor === 'number' && c.floor > d) { c.floor--; n++; } return n; }
        },
        {
            id: 'delta', label: '正史增量', holds: 'records',
            get: (h) => h.deltaBook || null,
            drop: (h, f) => (h.deltaBook && typeof h.deltaBook.removeByFloor === 'function') ? h.deltaBook.removeByFloor(f) : 0,
            shift: (h, d) => { let n = 0; for (const e of (h.deltaBook?.deltas || [])) if (typeof e.evidenceFloor === 'number' && e.evidenceFloor > d) { e.evidenceFloor--; n++; } return n; }
        },
        {
            id: 'life-detail', label: '生活小档案', holds: 'records',
            get: (h) => h.status || null,
            drop: (h, f) => (h.status && typeof h.status.removeLifeDetailByFloor === 'function') ? h.status.removeLifeDetailByFloor(f) : 0,
            shift: (h, d) => (h.status && typeof h.status.shiftLifeDetailFloors === 'function') ? (h.status.shiftLifeDetailFloors(d) || 0) : 0
        },
        {
            id: 'protagonist', label: '主角档案指针', holds: 'pointer',
            get: (h) => h.status || null,
            drop: (h, f) => (h.status && typeof h.status.removeProtagonistByFloor === 'function') ? h.status.removeProtagonistByFloor(f) : 0,
            shift: (h, d) => (h.status && typeof h.status.shiftProtagonistFloor === 'function') ? (h.status.shiftProtagonistFloor(d) || 0) : 0
        },
        {
            id: 'drift', label: '人设偏移', holds: 'records',
            get: (h) => h.status || null,
            drop: (h, f) => (h.status && typeof h.status.removeDriftByFloor === 'function') ? h.status.removeDriftByFloor(f) : 0,
            shift: (h, d) => (h.status && typeof h.status.shiftDriftFloors === 'function') ? (h.status.shiftDriftFloors(d) || 0) : 0
        },
        {
            id: 'baseline', label: '人设基线', holds: 'pointer',
            get: (h) => h.status || null,
            drop: () => 0,
            shift: (h, d) => (h.status && typeof h.status.shiftBaselineFloors === 'function') ? (h.status.shiftBaselineFloors(d) || 0) : 0
        },
        {
            id: 'geo', label: '地理上下文', holds: 'pointer',
            get: (h) => h.status || null,
            drop: () => 0,
            shift: (h, d) => (h.status && typeof h.status.shiftGeoFloor === 'function') ? (h.status.shiftGeoFloor(d) || 0) : 0
        },
        {
            id: 'cse', label: '人物状态', holds: 'records',
            get: (h) => h.cse || null,
            drop: (h, f) => (h.cse && typeof h.cse.removeByFloor === 'function') ? h.cse.removeByFloor(f) : 0,
            shift: (h, d) => (h.cse && typeof h.cse.shiftFloors === 'function') ? (h.cse.shiftFloors(d) || 0) : 0
        },
        {
            id: 'pulse', label: '叙事心电图', holds: 'records',
            get: (h) => h.pulse || null,
            drop: (h, f) => (h.pulse && typeof h.pulse.removeByFloor === 'function') ? h.pulse.removeByFloor(f) : 0,
            shift: (h, d) => (h.pulse && typeof h.pulse.shiftFloors === 'function') ? (h.pulse.shiftFloors(d) || 0) : 0
        },
        {
            id: 'pair', label: '群像记忆', holds: 'records',
            get: (h) => h.pairMem || null,
            drop: (h, f) => (h.pairMem && typeof h.pairMem.removeByFloor === 'function') ? h.pairMem.removeByFloor(f) : 0,
            shift: (h, d) => { let n = 0; for (const p of (h.pairMem?.pairs || [])) for (const e of (p.entries || [])) if (typeof e.floor === 'number' && e.floor > d) { e.floor--; n++; } return n; }
        },
        {
            id: 'vector', label: '向量记忆', holds: 'records',
            get: (h) => h.vector || null,
            drop: (h, f) => (h.vector && typeof h.vector.removeByFloor === 'function') ? h.vector.removeByFloor(f) : 0,
            shift: (h, d) => { let n = 0; for (const v of (h.vector?.vectors || [])) if (v.metadata && typeof v.metadata.floor === 'number' && v.metadata.floor > d) { v.metadata.floor--; n++; } return n; }
        },
        {
            id: 'reflection', label: '反思', holds: 'records',
            get: (h) => h.reflection || null,
            drop: (h, f) => { const items = h.reflection?.items; if (!Array.isArray(items)) return 0; const before = items.length; h.reflection.items = items.filter(r => r.floor !== f); return before - h.reflection.items.length; },
            shift: (h, d) => { let n = 0; for (const r of (h.reflection?.items || [])) if (typeof r.floor === 'number' && r.floor > d) { r.floor--; n++; } return n; }
        },
        {
            id: 'suspense', label: '悬念簿', holds: 'records',
            get: (h) => h.suspense || null,
            drop: (h, f) => { const items = h.suspense?.items; if (!Array.isArray(items)) return 0; const before = items.length; h.suspense.items = items.filter(x => x.floor !== f && x.resolvedFloor !== f); return before - h.suspense.items.length; },
            shift: (h, d) => { let n = 0; for (const x of (h.suspense?.items || [])) { if (typeof x.floor === 'number' && x.floor > d) { x.floor--; n++; } if (typeof x.resolvedFloor === 'number' && x.resolvedFloor > d) { x.resolvedFloor--; n++; } } return n; }
        },
        {
            id: 'pov', label: 'POV', holds: 'records',
            get: (h) => h.pov || null,
            drop: (h, f) => { const povs = h.pov?.povs; if (!Array.isArray(povs)) return 0; const before = povs.length; h.pov.povs = povs.filter(p => p.floor !== f); return before - h.pov.povs.length; },
            shift: (h, d) => { let n = 0; for (const p of (h.pov?.povs || [])) if (typeof p.floor === 'number' && p.floor > d) { p.floor--; n++; } return n; }
        },
        {
            id: 'timeline', label: '时间线', holds: 'records',
            get: (h) => h.timeline || null,
            drop: (h, f) => { const entries = h.timeline?.entries; if (!Array.isArray(entries)) return 0; const before = entries.length; h.timeline.entries = entries.filter(t => t.floor !== f); return before - h.timeline.entries.length; },
            shift: (h, d) => { let n = 0; for (const e of (h.timeline?.entries || [])) if (typeof e.floor === 'number' && e.floor > d) { e.floor--; n++; } return n; }
        },
        {
            id: 'summary', label: '摘要', holds: 'records',
            get: (h) => h.summary || null,
            drop: (h, f) => { const sums = h.summary?.summaries; if (!Array.isArray(sums)) return 0; const before = sums.length; h.summary.summaries = sums.filter(s => s.floor !== f); return before - h.summary.summaries.length; },
            shift: (h, d) => { let n = 0; for (const s of (h.summary?.summaries || [])) if (typeof s.floor === 'number' && s.floor > d) { s.floor--; n++; } return n; }
        },
        {
            id: 'char-mem', label: '角色记忆银行', holds: 'records',
            get: (h) => h.charMem || null,
            drop: (h, f) => (h.charMem && typeof h.charMem.removeByFloor === 'function') ? h.charMem.removeByFloor(f) : 0,
            shift: (h, d) => (h.charMem && typeof h.charMem.shiftFloorRefs === 'function') ? (h.charMem.shiftFloorRefs(d) || 0) : 0
        },
        {
            id: 'world-prog', label: '世界推进', holds: 'records',
            get: (h) => h.worldProg || null,
            drop: (h, f) => (h.worldProg && typeof h.worldProg.removeByFloor === 'function') ? h.worldProg.removeByFloor(f) : 0,
            shift: (h, d) => (h.worldProg && typeof h.worldProg.shiftFloorRefs === 'function') ? (h.worldProg.shiftFloorRefs(d) || 0) : 0
        },
        {
            id: 'outline', label: '大纲导演', holds: 'records',
            get: (h) => h.outline || null,
            drop: (h, f) => (h.outline && typeof h.outline.rollbackFloor === 'function') ? (h.outline.rollbackFloor(f) || 0) : 0,
            shift: (h, d) => (h.outline && typeof h.outline.shiftFloorRefs === 'function') ? (h.outline.shiftFloorRefs(d) || 0) : 0
        },
        {
            id: 'stm-ltm', label: '短期长期记忆', holds: 'records',
            get: (h) => h.stmLtm || null,
            drop: (h, f) => { if (!(h.stmLtm && h._stmLtmState && typeof h.stmLtm.removeByFloors === 'function')) return 0; h._stmLtmState = h.stmLtm.removeByFloors(h._stmLtmState, [f]); return 1; },
            shift: null
        },
        {
            id: 'scene', label: '场所图景', holds: 'derived',
            get: (h) => h.scene || null,
            drop: (h, f) => { if (!(h.scene && typeof h.scene.rollbackFloorOnly === 'function')) return 0; h.scene.rollbackFloorOnly(f); if (typeof h.scene.clearPresence === 'function') h.scene.clearPresence(); return 1; },
            shift: (h, d) => { let n = 0; for (const t of (h.scene?.track || [])) if (typeof t.floor === 'number' && t.floor > d) { t.floor--; n++; } for (const o of (h.scene?.opsLog || [])) if (typeof o.floor === 'number' && o.floor > d) { o.floor--; n++; } if (h.scene && typeof h.scene.rebuildFromOps === 'function' && (h.scene.opsLog || []).length) h.scene.rebuildFromOps(); return n; }
        },
        {
            id: 'items', label: '物品台账', holds: 'derived',
            get: (h) => (Array.isArray(h.itemOps) || h.items) ? (h.items || h) : null,
            drop: (h, f) => (typeof h.rollbackItemsFrom === 'function') ? (h.rollbackItemsFrom(f) || 0) : 0,
            shift: (h, d) => { let n = 0; for (const o of (h.itemOps || [])) if (typeof o.floor === 'number' && o.floor > d) { o.floor--; n++; } if (typeof h.rebuildItems === 'function') h.rebuildItems(); return n; }
        },
        {
            id: 'status-ops', label: '角色状态流水', holds: 'derived',
            get: (h) => h.status || null,
            drop: (h, f) => { const ops = h.status?.ops; if (!Array.isArray(ops)) return 0; const before = ops.length; h.status.ops = ops.filter(o => o.floor !== f); const removed = before - h.status.ops.length; if (removed && typeof h.status.rebuildFromOps === 'function') h.status.rebuildFromOps(); return removed; },
            shift: (h, d) => { let n = 0; for (const op of (h.status?.ops || [])) { if (typeof op.floor === 'number' && op.floor > d) { op.floor--; n++; } for (const t of (op.todos || [])) if (typeof t.floor === 'number' && t.floor > d) { t.floor--; n++; } } for (const name of Object.keys(h.status?.characters || {})) for (const t of (h.status.characters[name]?.todos || [])) if (typeof t.floor === 'number' && t.floor > d) { t.floor--; n++; } return n; }
        },
        {
            id: 'graph', label: '知识图谱', holds: 'records',
            get: (h) => h.graph || null,
            drop: (h, f) => { if (!h.graph) return 0; if (typeof h.graph.rollbackGraphFrom === 'function') { h.graph.rollbackGraphFrom(f); return 1; } if (typeof h.graph.truncateGraphFrom === 'function') { h.graph.truncateGraphFrom(f); return 1; } return 0; },
            shift: (h, d) => { let n = 0; const dec = (o, k) => { if (o && typeof o[k] === 'number' && o[k] > d) { o[k]--; n++; } }; if (h.graph?.edges) for (const edge of h.graph.edges.values()) { dec(edge, 'validFrom'); dec(edge, 'validTo'); dec(edge, 'floor'); } if (Array.isArray(h.graph?._snapshots)) for (const snap of h.graph._snapshots) dec(snap, 'floor'); if (Array.isArray(h.graph?.graphOps)) { const before = h.graph.graphOps.length; h.graph.graphOps = h.graph.graphOps.filter(op => op.floor !== d); n += before - h.graph.graphOps.length; for (const op of h.graph.graphOps) { dec(op, 'floor'); if (op.edge) { dec(op.edge, 'validFrom'); dec(op.edge, 'validTo'); dec(op.edge, 'floor'); } } } return n; }
        },
        {
            id: 'oplog', label: '操作日志', holds: 'records',
            get: (h) => h.opLog || null,
            drop: () => 0,
            shift: (h, d) => { let n = 0; for (const e of (h.opLog?.entries || [])) if (typeof e.floor === 'number' && e.floor > d) { e.floor--; n++; } return n; }
        },
        {
            id: 'floor-ledger', label: '楼层账本', holds: 'records',
            get: (h) => h.ledger || null,
            drop: (h, f) => { if (h.ledger && typeof h.ledger.remove === 'function') { h.ledger.remove(f); return 1; } return 0; },
            shift: (h, d) => { const fl = h.ledger?.floors; if (!fl || typeof fl !== 'object') return 0; const entries = Object.entries(fl).map(([k, v]) => [Number(k), v]).sort((a, b) => a[0] - b[0]); const next = {}; let n = 0; for (const [f, v] of entries) { if (f === d) { n++; continue; } const nf = f > d ? f - 1 : f; if (v && typeof v === 'object') v.floor = nf; next[nf] = v; if (nf !== f) n++; } h.ledger.floors = next; return n; }
        }
    ]);

    // 登记表的结构校验：id 唯一、必填字段齐全、动作是函数。失败返回原因数组（空 = 健康）。
    function checkRegistry(registry) {
        const problems = [];
        const seen = new Set();
        const list = Array.isArray(registry) ? registry : [];
        for (const o of list) {
            if (!o || typeof o.id !== 'string' || !o.id) { problems.push('登记项缺少 id'); continue; }
            if (seen.has(o.id)) problems.push('登记项 id 重复: ' + o.id);
            seen.add(o.id);
            if (typeof o.label !== 'string') problems.push(o.id + ' 缺少 label');
            if (typeof o.get !== 'function') problems.push(o.id + ' 缺少 get');
            if (typeof o.drop !== 'function') problems.push(o.id + ' 缺少 drop');
            if (!(o.shift === null || typeof o.shift === 'function')) problems.push(o.id + ' 的 shift 既不是函数也不是 null');
            if (!['records', 'pointer', 'derived'].includes(o.holds)) problems.push(o.id + ' 的 holds 非法: ' + o.holds);
        }
        return problems;
    }

    // 回放一侧（drop 或 shift）。
    // 返回 { version, side, floor, items: [{id,label,state,count,error}], dropped, shifted, threw, absent }
    // state 取值 ok | absent | threw | no-op
    function replaySide(host, floor, side, registry) {
        const list = Array.isArray(registry) ? registry : FLOOR_OWNERS;
        const items = [];
        let dropped = 0, shifted = 0, threw = 0, absent = 0;
        for (const owner of list) {
            const action = side === 'drop' ? owner.drop : owner.shift;
            if (action === null) { items.push({ id: owner.id, label: owner.label, state: 'no-op', count: 0, error: '' }); continue; }
            let target = null;
            try { target = owner.get(host); } catch (e) { target = null; }
            if (target == null) { absent++; items.push({ id: owner.id, label: owner.label, state: 'absent', count: 0, error: '' }); continue; }
            try {
                const count = Number(action(host, floor)) || 0;
                if (side === 'drop') dropped += count; else shifted += count;
                items.push({ id: owner.id, label: owner.label, state: 'ok', count, error: '' });
            } catch (e) {
                threw++;
                items.push({ id: owner.id, label: owner.label, state: 'threw', count: 0, error: (e && e.message) ? e.message : String(e) });
            }
        }
        return { version: LEDGER_REPLAY_VERSION, side, floor: Number(floor), items, dropped, shifted, threw, absent };
    }

    // 删楼回放：撤掉该楼在所有登记子系统里的归属。
    function replayDrop(host, floor, registry) { return replaySide(host, floor, 'drop', registry); }

    // 楼层前移回放：所有登记子系统里 floor > deleted 的归属减一。
    function replayShift(host, deleted, registry) { return replaySide(host, deleted, 'shift', registry); }

    // 覆盖度：报告每个登记项此刻是在位 / 缺席 / 取数即抛。
    // 诊断面用它回答「这张登记表里，有几本账此刻其实没挂上」。
    function coverage(host, registry) {
        const list = Array.isArray(registry) ? registry : FLOOR_OWNERS;
        const rows = [];
        for (const owner of list) {
            let state = 'present';
            try { if (owner.get(host) == null) state = 'absent'; }
            catch (e) { state = 'threw'; }
            rows.push({ id: owner.id, label: owner.label, holds: owner.holds, state, shifts: owner.shift !== null });
        }
        return {
            version: LEDGER_REPLAY_VERSION,
            total: rows.length,
            present: rows.filter(r => r.state === 'present').length,
            absent: rows.filter(r => r.state === 'absent').length,
            threw: rows.filter(r => r.state === 'threw').length,
            rows
        };
    }

    // 回放不变量。给定同一宿主在回放前后的楼层快照，校验：
    //   I1 被删楼不再被任何登记项持有（ghost-floor）
    //   I2 不出现负楼层（negative-floor）
    // 本函数不执行回放，只校验。before/after 形如 { [ownerId]: number[] }。
    function checkReplayInvariants(before, after, deletedFloor) {
        const problems = [];
        const ids = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
        for (const id of ids) {
            const a = Array.isArray(after?.[id]) ? after[id] : [];
            if (a.includes(deletedFloor)) problems.push({ id, kind: 'ghost-floor', detail: id + ' 在回放后仍持有楼层 ' + deletedFloor });
            for (const f of a) if (typeof f === 'number' && f < 0) problems.push({ id, kind: 'negative-floor', detail: id + ' 出现负楼层 ' + f });
        }
        return { ok: problems.length === 0, problems };
    }

    // 诊断行文本：给 selfCheck 用的一行人话。
    function diagnoseLine(report) {
        if (!report) return '—（未回放）';
        const head = report.side === 'drop' ? '删楼回放' : '前移回放';
        let txt = head + ' 楼' + report.floor + '：' + report.items.length + ' 本账';
        txt += report.side === 'drop' ? ('，撤 ' + report.dropped + ' 条') : ('，移 ' + report.shifted + ' 条');
        if (report.absent) txt += '，' + report.absent + ' 本缺席';
        if (report.threw) txt += ' ⚠️' + report.threw + ' 本失败';
        return txt;
    }

    const api = {
        LEDGER_REPLAY_VERSION,
        FLOOR_OWNERS,
        checkRegistry,
        replayDrop,
        replayShift,
        coverage,
        checkReplayInvariants,
        diagnoseLine
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    const g = (typeof globalThis !== 'undefined') ? globalThis : root;
    try { g.LonShaLedgerReplay = Object.freeze(api); } catch (e) { /* 宿主冻结全局时忽略 */ }
})(typeof window !== 'undefined' ? window : globalThis);
