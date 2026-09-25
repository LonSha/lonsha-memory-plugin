// ledger-replay.js — 账本回放（Ledger Replay），v3.184.0
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
    // [v3.202] 账本类子系统（六账 + v3.194 三面账）的楼层归属清理。
    //   为什么需要：v3.195~v3.197 新增的六账（伏笔/约定/平行事实/秘密/回扣/回声）与 v3.194 的
    //   三面账（事实版本/事件完整性/修复闭环）都带楼层字段（floor / updatedFloor / recoveredFloor /
    //   settledFloor / revealedFloor / echoFloor / history[].floor），却没有任何一个接进回滚面：
    //   删楼后条目仍持有被删楼层、前移后指针不动，而回放报告只对 world-prog 报「跑了没抛错」——
    //   缺陷完全静默。这与 v3.182「新增子系统忘了接回滚」同形。本 helper 即其统一收口。
    //   两处硬编码（history 只认 floor / segments 只认 floor）就是「嵌套容器不跟清单走」的形态：
    //   实测（v3.205.0 探针）fact-version 的 fact.from 会随前移跟到 8，而同一本账 history 事件的
    //   from/to 仍是 9 —— 账本内部自相矛盾，且删除面会留下指向被删楼层的区间端点。
    const LEDGER_ITEM_FLOOR_FIELDS = Object.freeze([
        'floor', 'updatedFloor', 'recoveredFloor', 'settledFloor', 'revealedFloor',
        'echoFloor', 'from', 'to'
    ]);
    // 容器内事件的楼层字段：与条目**同一份**清单（history 事件在 fact-version 里带 from/to
    //   区间端点，同时也带 floor；segments 带 floor）。由清单派生而非另写一份 —— 另写一份
    //   就是 T4 记的那个「新增忘了接线」。
    const LEDGER_CHILD_FLOOR_FIELDS = Object.freeze(LEDGER_ITEM_FLOOR_FIELDS);
    // 删楼侧专用：容器事件里除了身份位 floor 之外的字段集。floor===f 时整条摘除，
    //   所以「置 null」的循环不得再碰 floor（否则摘除失败或重复计数）。
    const LEDGER_CHILD_NON_IDENTITY_FIELDS = Object.freeze(LEDGER_ITEM_FLOOR_FIELDS.filter(k => k !== 'floor'));
    // 顶层指针字段（recall-echo 的 lastEchoFloor / echo-ledger 的 lastFloor）：删楼后若停在
    //   被删楼层，会触发 echo-per-floor 之类「同楼拒绝」判据把后续写入全部挡掉——必须一并复位。
    const LEDGER_STATE_POINTERS = Object.freeze(['lastEchoFloor', 'lastFloor']);
    // 删楼：该楼**登记**下来的条目（item.floor === f）整条摘除；该楼仅推进/回收/了结的
    //   （其余 floor 字段 === f）置 null（那件事随楼层一起不存在了）；history 里该楼的事件摘除。
    function dropLedgerItemFloors(state, f) {
        if (!state || typeof state !== 'object') return 0;
        let n = 0;
        const boxes = ['items', 'facts', 'events', 'repairs'];
        for (const box of boxes) {
            const arr = Array.isArray(state[box]) ? state[box] : null;
            if (!arr) continue;
            const kept = [];
            for (const it of arr) {
                if (!it || typeof it !== 'object') { kept.push(it); continue; }
                if (Number(it.floor) === f) { n++; continue; }
                let touched = false;
                for (const k of LEDGER_ITEM_FLOOR_FIELDS) {
                    if (k === 'floor') continue;
                    if (it[k] != null && Number(it[k]) === f) { it[k] = null; touched = true; }
                }
                // 容器内事件（fact-version 的 history 带 from/to 区间端点；event-completeness 的
                //   segments 带 floor）：与条目字段同规则处理，字段集由清单派生。
                for (const boxName of ['history', 'segments']) {
                    const kids = Array.isArray(it[boxName]) ? it[boxName] : null;
                    if (!kids) continue;
                    const keptKids = [];
                    for (const kid of kids) {
                        if (!kid || typeof kid !== 'object') { keptKids.push(kid); continue; }
                        if (Number(kid.floor) === f) { touched = true; continue; }
                        for (const k of LEDGER_CHILD_NON_IDENTITY_FIELDS) {
                            if (kid[k] != null && Number(kid[k]) === f) { kid[k] = null; touched = true; }
                        }
                        keptKids.push(kid);
                    }
                    it[boxName] = keptKids;
                }
                if (touched) n++;
                kept.push(it);
            }
            state[box] = kept;
        }
        for (const p of LEDGER_STATE_POINTERS) {
            if (state[p] != null && Number(state[p]) === f) { state[p] = null; n++; }
        }
        return n;
    }
    // 前移：所有 > d 的楼层字段（含 history/segments 内）减一。**不做终态判据豁免**——
    //   被删楼之后的条目只是位置前移，内容仍对应前移后的文本（与 v2.3 数据零丢失口径一致）。
    function shiftLedgerItemFloors(state, d) {
        if (!state || typeof state !== 'object') return 0;
        const del = Number(d);
        if (!Number.isFinite(del)) return 0;
        let n = 0;
        const dec = (o, k) => {
            if (o && typeof o[k] === 'number' && o[k] > del) { o[k] = o[k] - 1; n++; }
        };
        const walkItem = (it) => {
            if (!it || typeof it !== 'object') return;
            for (const k of LEDGER_ITEM_FLOOR_FIELDS) dec(it, k);
            // 容器内事件走**同一份**派生字段集（此前只认 floor：history 里的 from/to 区间端点
            //   会留在旧楼层，与条目自身的 from 对不上 —— 实测见 drop 侧注释）。
            for (const boxName of ['history', 'segments']) {
                if (!Array.isArray(it[boxName])) continue;
                for (const kid of it[boxName]) {
                    if (!kid || typeof kid !== 'object') continue;
                    for (const k of LEDGER_CHILD_FLOOR_FIELDS) dec(kid, k);
                }
            }
        };
        for (const box of ['items', 'facts', 'events', 'repairs']) {
            if (Array.isArray(state[box])) for (const it of state[box]) walkItem(it);
        }
        for (const p of LEDGER_STATE_POINTERS) dec(state, p);
        return n;
    }
    // 账本子系统的登记项工厂：统一从宿主取库、同族判据、同族写回。
    function ledgerOwner(id, label, getState) {
        return {
            id, label, holds: 'records',
            get: (h) => { try { const st = getState(h); return (st && typeof st === 'object') ? st : null; } catch (e) { return null; } },
            drop: (h, f) => { const st = getState(h); return st ? dropLedgerItemFloors(st, Number(f)) : 0; },
            shift: (h, d) => { const st = getState(h); return st ? shiftLedgerItemFloors(st, Number(d)) : 0; }
        };
    }
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
            // [v3.221.0] R3-D：**动作收进模块内**，登记项只声明「这一面参与回滚/前移」。
            //   修前形态是登记项自己手抄两段循环（track / opsLog），于是场所图景后来新增的
            //   带楼层归属的两面 —— v3.195 的场景头 `headers`、v3.181 的在场索引 `presence`
            //   —— **一格都不会跟**：删掉第 7 楼后 `headerAt(7)` 照样答得出「8月2日 · 暴雨」
            //   （读数指向一个已不存在的时刻），前移后「谁在何处」停在旧楼层号上。
            //   更糟的是同一段循环不认「被删楼自身的残留」：第 8 楼被前移成 7 楼后与残留撞成
            //   两条 7 楼（连做两次得 track=[3,7,7]）—— 本项自述的「drop/shift 必须幂等」
            //   在 shift 侧从未成立。
            //   现在 drop 走 rollbackFloorOnly（模块内按楼层清在场与场景头，**只清该楼**），
            //   shift 走 shiftFloorRefs（模块内先清被删楼残留、再平移 track/opsLog/headers/presence）。
            //   两处边界都不静默：drop 对「不认新方法的旧模块」保留 clearPresence 退路，
            //   shift 在缺 shiftFloorRefs 时如实返回 0（留痕在回放报告里，而不是假装搬过）。
            id: 'scene', label: '场所图景', holds: 'derived',
            get: (h) => h.scene || null,
            drop: (h, f) => {
                if (!(h.scene && typeof h.scene.rollbackFloorOnly === 'function')) return 0;
                h.scene.rollbackFloorOnly(f);
                // 旧模块（无按楼层清）才退到整表清；新模块已在 rollbackFloorOnly 内按楼层清过。
                if (typeof h.scene.clearHeader !== 'function' && typeof h.scene.clearPresence === 'function') h.scene.clearPresence();
                return 1;
            },
            shift: (h, d) => {
                if (!(h.scene && typeof h.scene.shiftFloorRefs === 'function')) return 0;
                return Number(h.scene.shiftFloorRefs(d)) || 0;
            }
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
        },
// [v3.190] 补齐四个「有楼层归属却不在登记表里」的面。
        //   此前它们只活在 index.js 的手工清单里：回放报告说「29 本账走完了回放」，
        //   而这四面根本没被回放过——读者会把不完整的清单当成完整的。
        {
            id: 'changeset', label: '行级变更集', holds: 'records',
            get: (h) => (typeof h._changeset === 'function') ? (h._changeset() || null) : null,
            drop: (h, f) => { const cs = (typeof h._changeset === 'function') ? h._changeset() : null; return (cs && typeof cs.removeByFloor === 'function') ? (cs.removeByFloor(f) || 0) : 0; },
            shift: (h, d) => { const cs = (typeof h._changeset === 'function') ? h._changeset() : null; const rows = cs && cs.rows; if (!rows || typeof rows.values !== 'function') return 0; let n = 0; for (const r of rows.values()) if (r && typeof r.floor === 'number' && r.floor > d) { r.floor--; n++; } return n; }
        },
        {
            id: 'archived', label: '归档隐藏集合', holds: 'records',
            get: (h) => (h && h._archivedFloorIds) ? h._archivedFloorIds : null,
            drop: (h, f) => { const ids = h._archivedFloorIds; if (!ids) return 0; const f0 = Number(f); if (!Number.isFinite(f0)) return 0; const before = []; for (const v of ids) { const n = Number(v); if (Number.isFinite(n)) before.push(n); } const _as = (typeof h._archiveShiftLib === 'function') ? h._archiveShiftLib() : null; let out = null; if (_as && typeof _as.pruneArchivedIds === 'function') { try { out = _as.pruneArchivedIds(before, f0); } catch (e) { out = null; } } if (!out) { out = new Set(); for (const n of before) if (n < f0) out.add(n); } h._archivedFloorIds = out; let n = 0; for (const v of before) if (!out.has(v)) n++; return n; },
            shift: (h, d) => { const ids = h._archivedFloorIds; if (!ids) return 0; const d0 = Number(d); if (!Number.isFinite(d0)) return 0; const before = new Set(); for (const v of ids) { const n = Number(v); if (Number.isFinite(n)) before.add(n); } const _as = (typeof h._archiveShiftLib === 'function') ? h._archiveShiftLib() : null; let out = null; if (_as && typeof _as.shiftArchivedIds === 'function') { try { out = _as.shiftArchivedIds(before, d0); } catch (e) { out = null; } } if (!out) { out = new Set(); for (const v of before) { if (v === d0) continue; out.add(v > d0 ? v - 1 : v); } } h._archivedFloorIds = out; let n = 0; for (const v of before) if (!out.has(v)) n++; for (const v of out) if (!before.has(v)) n++; return n; }
        },
        {
            // 变化驱动注入的读取游标。删楼侧此前有回退、前移侧完全没有——
            // 编辑中途删一楼，游标停在旧位置上，游标之上重生成的新日记/新时间线不再注入。
            id: 'inject-cursor', label: '注入游标', holds: 'pointer',
            get: (h) => (h && (h._diaryInjectFloor !== undefined || h._timelineInjectFloor !== undefined)) ? h : null,
            drop: (h, f) => { const f0 = Number(f); if (!Number.isFinite(f0)) return 0; let n = 0; if (h._timelineInjectFloor != null && Number.isFinite(Number(h._timelineInjectFloor)) && Number(h._timelineInjectFloor) >= f0) { h._timelineInjectFloor = Math.max(-1, f0 - 1); n++; } if (h._diaryInjectFloor != null && Number.isFinite(Number(h._diaryInjectFloor)) && Number(h._diaryInjectFloor) >= f0) { h._diaryInjectFloor = Math.max(-1, f0 - 1); n++; } return n; },
            shift: (h, d) => { const d0 = Number(d); if (!Number.isFinite(d0)) return 0; let n = 0; if (h._diaryInjectFloor != null && Number.isFinite(Number(h._diaryInjectFloor)) && Number(h._diaryInjectFloor) > d0) { h._diaryInjectFloor = Number(h._diaryInjectFloor) - 1; n++; } if (h._timelineInjectFloor != null && Number.isFinite(Number(h._timelineInjectFloor)) && Number(h._timelineInjectFloor) > d0) { h._timelineInjectFloor = Number(h._timelineInjectFloor) - 1; n++; } return n; }
        },
        {
            // 卷范围：起止同减，跨被删楼时收尾缩一（与手工清单同义，收编进来后才可被审计）。
            id: 'volumes', label: '卷范围', holds: 'records',
            get: (h) => h.summary || null,
            drop: () => 0,
            shift: (h, d) => { let n = 0; for (const v of (h.summary?.volumes || [])) { if (typeof v.floorStart === 'number' && v.floorStart > d) { v.floorStart--; n++; } if (typeof v.floorEnd === 'number' && v.floorEnd >= d) { const next = Math.max(v.floorStart, v.floorEnd - 1); if (next !== v.floorEnd) { v.floorEnd = next; n++; } } } return n; }
        }
        ,
        // [v3.202] 六账（挂 worldProg 下）+ v3.194 三面账（挂宿主导层属性）并入回滚/前移面。
        //   此前它们都有楼层字段却全在登记表之外——v3.182 治理过的「新增子系统忘了接回滚」
        //   在 v3.194~v3.197 四版里又新增了九个直系实例，且因回放报告不点名而完全静默。
        ledgerOwner('seed-ledger', '伏笔账本', (h) => (h.worldProg && h.worldProg.seedLedger) || null),
        ledgerOwner('commitment-ledger', '约定变更账本', (h) => (h.worldProg && h.worldProg.commitmentLedger) || null),
        ledgerOwner('parallel-ledger', '平行事实账本', (h) => (h.worldProg && h.worldProg.parallelLedger) || null),
        ledgerOwner('secret-ledger', '秘密账本', (h) => (h.worldProg && h.worldProg.secretLedger) || null),
        ledgerOwner('recall-echo', '前文回扣账本', (h) => (h.worldProg && h.worldProg.recallEcho) || null),
        ledgerOwner('echo-life', '回声账本', (h) => (h.worldProg && h.worldProg.echoLedger) || null),
        ledgerOwner('fact-version', '时间与事实版本', (h) => h._factVersionState || null),
        ledgerOwner('event-completeness', '事件完整性', (h) => h._eventThreadState || null),
        ledgerOwner('repair-loop', '修复闭环', (h) => h._repairState || null)
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
