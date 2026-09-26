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

    // [v3.224.0] O-2：报告**只增不改**（新增 `skipped` 面）—— 故 `LEDGER_REPLAY_VERSION` 保持 1。
    // [v3.235.0] R4-A：同上口径 —— 新增预览面不构成报告格式变更，版本仍为 1。
    //   抬它会让两条历史套件的「真模块在跑」冒烟断言（锁 == 1）连带翻红，而那是**纯增量面**：
    //   为了一个 additive 字段去改历史测试的常量值，正是本仓在 v3.203.0 拆掉的抬版仪式。
    // [v3.235.0] R4-A：本版新增的是**独立导出面**（previewDrop / previewShift /
    //   previewLine / DROP_NOTHING），对既有**回放报告**是「只增不改」——
    //   `replaySide` 的 items 形状一字未动，no-op 的判定口径细化也属「增」。
    //   故引擎版本**保持 1**：既有 R2b 判据（scan_v3182）用它区分「真模块跑了」
    //   与「缺席退路」，那是报告格式信号，不是我新增导出面的信号 —— 两者不是一回事。
    //   （首稿曾抬到 2，随即被 scan_v3182 的 R2b 当场指为「真模块没在跑」，判得对：
    //   版本号是**报告**的契约，不该被我借来表达「本模块多了几个导出」。）
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
        // [v3.224.0] O-2：修前 `const del = Number(d); if (!Number.isFinite(del)) return 0;` ——
        //   `Number('') === 0`、`Number([]) === 0`、`Number(true) === 1` 全部通关，
        //   于是「没给」被读成第 0 楼并把**整本账**减一。
        const del = floorOrNull(d);
        if (del === null) return 0;
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
    /* [v3.235.0] R4-A：**「这一面不参与删除」要有具名身份**。
     *   修前形态：四个面把 drop 写成字面量 `() => 0`。它与「这一面此刻恰好没有该楼的记录」
     *   返回的 0 **完全同形**，于是回放/预览报告里两种含义相反的读数都落成 `count: 0`：
     *     · 真的检查过、真的撤了 0 条（无事发生 —— 健康）
     *     · 这一面从来不参与删除（drop 只是占位实现 —— 从未被检查过）
     *   本仓纪律：「没给」与「给了 0」必须不同形（同族先例：poolOf 的 `''` vs `[]`）。
     *   故给占位实现一个**具名函数身份**，让报告能把它单独列成一组而不是混进「干净」。 */
    function DROP_NOTHING() { return 0; }

    // 账本子系统的登记项工厂：统一从宿主取库、同族判据、同族写回。
    function ledgerOwner(id, label, getState) {
        return {
            id, label, holds: 'records',
            get: (h) => { try { const st = getState(h); return (st && typeof st === 'object') ? st : null; } catch (e) { return null; } },
            drop: (h, f) => { const st = getState(h); return st ? dropLedgerItemFloors(st, floorOrNull(f)) : 0; },
            shift: (h, d) => { const st = getState(h); return st ? shiftLedgerItemFloors(st, floorOrNull(d)) : 0; }
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
            drop: DROP_NOTHING,
            shift: (h, d) => (h.status && typeof h.status.shiftBaselineFloors === 'function') ? (h.status.shiftBaselineFloors(d) || 0) : 0
        },
        {
            id: 'geo', label: '地理上下文', holds: 'pointer',
            get: (h) => h.status || null,
            drop: DROP_NOTHING,
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
            // [v3.222.0] R3-E：**shift 由 null 改为真调用**。
            //   修前形态：删楼侧有真清理（removeByFloors），前移侧写死 null —— 于是删掉第 5 楼
            //   再前移，`stm_entries[].floors` 里的 8 仍是 8（应为 7）、`ltm_entries[].span`、
            //   `unconsolidated_stm[].floor` 一格不动，回放报告报 no-op 且**不留痕**。
            //   更坏的是自述冲突：宿主 `index.js` 的 SHIFT_FACE_LABELS 里明写着
            //   `'stm-ltm': 'shiftFloorsFrom.短期长期记忆位移'` —— 诊断面的标签表声称它参与前移，
            //   而登记表说它不参与；两处都在源码里，读者会各信一份。
            //   本仓 v3.170 在**同一个模块**上治过同族形态（注释声称摘 span、实现从未碰 span），
            //   那是「自述与实现不一致」这一类，本条是它的**登记表版本**。
            //   注意语义差别：removeByFloors **返回新 state**（要 filter 数组本身）而
            //   shiftFloorRefs **原地改元素字段、返回计数** —— 故此处只取计数、不回写。
            //   边界如实：旧模块（无 shiftFloorRefs）退到返回 0，留痕在回放报告里，不假装搬过。
            id: 'stm-ltm', label: '短期长期记忆', holds: 'records',
            get: (h) => h.stmLtm || null,
            drop: (h, f) => { if (!(h.stmLtm && h._stmLtmState && typeof h.stmLtm.removeByFloors === 'function')) return 0; h._stmLtmState = h.stmLtm.removeByFloors(h._stmLtmState, [f]); return 1; },
            shift: (h, d) => (h.stmLtm && h._stmLtmState && typeof h.stmLtm.shiftFloorRefs === 'function')
                ? (Number(h.stmLtm.shiftFloorRefs(h._stmLtmState, d)) || 0)
                : 0
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
            drop: DROP_NOTHING,
            shift: (h, d) => { let n = 0; for (const e of (h.opLog?.entries || [])) if (typeof e.floor === 'number' && e.floor > d) { e.floor--; n++; } return n; }
        },
        {
            id: 'floor-ledger', label: '楼层账本', holds: 'records',
            // [v3.224.0] O-2：**本账参与回放**（首稿曾主张它该退场，理由是「宿主的
            //   `ledger.remove(f)` 已经做过一遍」—— 与 v3190 第 8/9 条同款越界判断，一并撤回）。
            //   本轮只收两处取值门：drop 的入参、shift 的入参（修前 `if (f === d)` / `f > d`
            //   拿原参数比，一个 `''` 或 `[]` 会让每个楼层键退化成 `f > 0` ⇒ 整本账减一）。
            get: (h) => h.ledger || null,
            drop: (h, f) => { if (h.ledger && typeof h.ledger.remove === 'function') { const f0 = floorOrNull(f); if (f0 === null) return 0; h.ledger.remove(f0); return 1; } return 0; },
            // [v3.224.0] O-2：修前 `if (f === d)` / `f > d` 拿**原参数**比 —— 一个 `''` 或 `[]`
            //   会让每个楼层键 `f > d` 退化成 `f > 0`（整本账减一）。入参走同一门，键侧本就已过 Number()。
            shift: (h, d) => { const fl = h.ledger?.floors; if (!fl || typeof fl !== 'object') return 0; const d0 = floorOrNull(d); if (d0 === null) return 0; const entries = Object.entries(fl).map(([k, v]) => [Number(k), v]).sort((a, b) => a[0] - b[0]); const next = {}; let n = 0; for (const [f, v] of entries) { if (f === d0) { n++; continue; } const nf = f > d0 ? f - 1 : f; if (v && typeof v === 'object') v.floor = nf; next[nf] = v; if (nf !== f) n++; } h.ledger.floors = next; return n; }
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
            // [v3.224.0] O-2：**本面参与前移**（既有判据 v3190 第 8 条明写「删除楼起失去依据、
            //   其后前移、其前保留」）。本轮只把入参从 `Number(f)` 换成 `floorOrNull(f)`：
            //   修前 `replayShift(host, null)` 会因 `Number(null) === 0` 把它整集合搬掉一格。
            //   （首稿曾把它标成 participates:false，被 v3190 第 8 条当场判死，已撤回。）
            get: (h) => (h && h._archivedFloorIds) ? h._archivedFloorIds : null,
            drop: (h, f) => { const ids = h._archivedFloorIds; if (!ids) return 0; const f0 = floorOrNull(f); if (f0 === null) return 0; const before = []; for (const v of ids) { const n = Number(v); if (Number.isFinite(n)) before.push(n); } const _as = (typeof h._archiveShiftLib === 'function') ? h._archiveShiftLib() : null; let out = null; if (_as && typeof _as.pruneArchivedIds === 'function') { try { out = _as.pruneArchivedIds(before, f0); } catch (e) { out = null; } } if (!out) { out = new Set(); for (const n of before) if (n < f0) out.add(n); } h._archivedFloorIds = out; let n = 0; for (const v of before) if (!out.has(v)) n++; return n; },
            shift: (h, d) => { const ids = h._archivedFloorIds; if (!ids) return 0; const d0 = floorOrNull(d); if (d0 === null) return 0; const before = new Set(); for (const v of ids) { const n = Number(v); if (Number.isFinite(n)) before.add(n); } const _as = (typeof h._archiveShiftLib === 'function') ? h._archiveShiftLib() : null; let out = null; if (_as && typeof _as.shiftArchivedIds === 'function') { try { out = _as.shiftArchivedIds(before, d0); } catch (e) { out = null; } } if (!out) { out = new Set(); for (const v of before) { if (v === d0) continue; out.add(v > d0 ? v - 1 : v); } } h._archivedFloorIds = out; let n = 0; for (const v of before) if (!out.has(v)) n++; for (const v of out) if (!before.has(v)) n++; return n; }
        },
        {
            // 变化驱动注入的读取游标。删楼侧此前有回退、前移侧完全没有——
            // 编辑中途删一楼，游标停在旧位置上，游标之上重生成的新日记/新时间线不再注入。
            id: 'inject-cursor', label: '注入游标', holds: 'pointer',
            // [v3.224.0] O-2：**本面参与前移**（既有判据 v3190 第 9 条明写「删楼回退到被删楼前
            //   一楼、前移跟随」）。本轮只把入参从 `Number(f)` 换成 `floorOrNull(f)`：修前
            //   `replayShift(host, null)` 把两个游标各减一（`Number(null) === 0` ⇒ 读成「删了第 0 楼」）。
            //   （首稿曾把它标成 participates:false，被 v3190 第 9 条当场判死，已撤回。）
            get: (h) => (h && (h._diaryInjectFloor !== undefined || h._timelineInjectFloor !== undefined)) ? h : null,
            drop: (h, f) => { const f0 = floorOrNull(f); if (f0 === null) return 0; let n = 0; if (h._timelineInjectFloor != null && Number.isFinite(Number(h._timelineInjectFloor)) && Number(h._timelineInjectFloor) >= f0) { h._timelineInjectFloor = Math.max(-1, f0 - 1); n++; } if (h._diaryInjectFloor != null && Number.isFinite(Number(h._diaryInjectFloor)) && Number(h._diaryInjectFloor) >= f0) { h._diaryInjectFloor = Math.max(-1, f0 - 1); n++; } return n; },
            shift: (h, d) => { const d0 = floorOrNull(d); if (d0 === null) return 0; let n = 0; if (h._diaryInjectFloor != null && Number.isFinite(Number(h._diaryInjectFloor)) && Number(h._diaryInjectFloor) > d0) { h._diaryInjectFloor = Number(h._diaryInjectFloor) - 1; n++; } if (h._timelineInjectFloor != null && Number.isFinite(Number(h._timelineInjectFloor)) && Number(h._timelineInjectFloor) > d0) { h._timelineInjectFloor = Number(h._timelineInjectFloor) - 1; n++; } return n; }
        },
        {
            // 卷范围：起止同减，跨被删楼时收尾缩一（与手工清单同义，收编进来后才可被审计）。
            id: 'volumes', label: '卷范围', holds: 'records',
            get: (h) => h.summary || null,
            drop: DROP_NOTHING,
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

    /* [v3.224.0] O-2：本模块的**唯一取值门**。
     *   存在理由（与 scene-book.js v3.223.0 同一条根因，本轮在**回放/前移这条路径上**实测到）：
     *     `Number(null) === Number('') === Number([]) === 0`、`Number(true) === 1`，
     *     而 **0 在本仓是合法楼层**（宿主 `message.index` 是 0 基）。凡以 `Number()` 结果当门的
     *     取值点，「没给」与「就在第 0 楼」必然塌成同形。
     *   修前实测（真模块，不是推演）：`replayShift(host, null)` 把 volumes 的 1..9 整段减到 0..8、
     *     归档集合 `[0,1,2,5]` 变成 `[0,1,4]`、两个注入游标各减一 —— **整树前移一格**，
     *     而且返回 9（看着像「搬了 9 条」）。R3-E（v3.222.0）新写的 `const d0 = Number(d);
     *     if (!Number.isFinite(d0)) return 0;` 只挡住了 `undefined`/NaN，对 `''` / `'  '` / `[]` / `true`
     *     一律放行 —— 「半收口」比没收口更难发现：读者会以为这里有门。
     *   口径与仓内先例逐字同族：`scene-book.js` 的 `numOrNull`（v3.223.0）、`stm-ltm.js`
     *     的 `shiftFloorRefs`（v3.222.0）、`evidence-workbench.js` 的 `finiteNumStrict`（v3.214.0）。
     *   只认**数字**与**非空数字字符串**；其余一律 null（「没给」）。给 0 照常是 0。 */
    function floorOrNull(v) {
        if (typeof v === 'number') return Number.isFinite(v) ? v : null;
        if (typeof v === 'string') {
            const t = v.trim();
            if (!t) return null;
            const n = Number(t);
            return Number.isFinite(n) ? n : null;
        }
        return null;
    }

    // 回放一侧（drop 或 shift）。
    // 返回 { version, side, floor, items: [{id,label,state,count,error}], dropped, shifted, threw, absent, skipped }
    // state 取值 ok | absent | threw | no-op
    // [v3.224.0] O-2：入参「没给」⇒ 一格子都不动，报告写 skipped（**与真回放不同形**：
    //   修前它会照常走完全表并把整树搬掉一格，报告说 shifted>0 —— 读数反过来为缺陷作证）。
    function replaySide(host, floor, side, registry) {
        const list = Array.isArray(registry) ? registry : FLOOR_OWNERS;
        const target = floorOrNull(floor);
        if (target === null) {
            return {
                version: LEDGER_REPLAY_VERSION, side, floor: null, items: [],
                dropped: 0, shifted: 0, threw: 0, absent: 0, skipped: 'floor-not-given'
            };
        }
        const items = [];
        let participated = 0;
        let dropped = 0, shifted = 0, threw = 0, absent = 0;
        for (const owner of list) {
            const action = side === 'drop' ? owner.drop : owner.shift;
            // [v3.224.0] O-2：声明「本账不参与这一侧」的项**不得**报 ok。
            //   修前只要 owner.drop/shift 是函数就报 ok —— 而那函数对没给楼层的入口是
            //   `Number(f) || 0` ⇒ 读成第 0 楼、照常动手，报告上还是一条 ok。
            if (action === null || owner.participates === false) {
                items.push({ id: owner.id, label: owner.label, state: 'no-op', count: 0, error: '' }); continue;
            }
            participated++;
            // [v3.224.0] O-2 自纠：循环变量**不得**叫 target —— 它会遮蔽上面门后的楼层值，
            //   把 `action(host, target)` 的第二参偷偷换成宿主状态对象（owner.shift 再走一次
            //   floorOrNull ⇒ null ⇒ 均匀 return 0）。形态是「门开过头」：没给面全绿、真回放全废。
            let cur = null;
            try { cur = owner.get(host); } catch (e) { cur = null; }
            if (cur == null) { absent++; items.push({ id: owner.id, label: owner.label, state: 'absent', count: 0, error: '' }); continue; }
            try {
                // [v3.224.0] O-2：交给 owner 的是**门后的值**（target），不是原参数。
                //   这样**回放这条路径上**「门」只有一道、位置固定；未来新增登记项即使用
                //   `Number(f) || 0` 也收不到怪值。
                //   [自纠] 首稿这里写的是「门只有一道」，与事实不符：`FLOOR_OWNERS` 是导出面，
                //   owner 也会被**直接调用**（各 face 内部因此各有取值门）—— 两道门，各挡一条路径。
                //   注释说得比实现更满，就是下一轮读注释的人被耽误的原因。
                const count = Number(action(host, target)) || 0;
                if (side === 'drop') dropped += count; else shifted += count;
                items.push({ id: owner.id, label: owner.label, state: 'ok', count, error: '' });
            } catch (e) {
                threw++;
                items.push({ id: owner.id, label: owner.label, state: 'threw', count: 0, error: (e && e.message) ? e.message : String(e) });
            }
        }
        if (!participated) {
            return {
                version: LEDGER_REPLAY_VERSION, side, floor: target, items,
                dropped: 0, shifted: 0, threw: 0, absent, skipped: 'no-participant'
            };
        }
        return { version: LEDGER_REPLAY_VERSION, side, floor: target, items, dropped, shifted, threw, absent, skipped: null };
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

    /* ================= [v3.235.0] R4-A：回滚预览（dry-run） =================
     * 存在理由（本仓到 v3.234.0 的实测形态）：
     *   ① `rollbackFloor` 是**破坏性入口**，宿主有 3 个真调用点（MESSAGE_EDITED /
     *      MESSAGE_SWIPED / 删楼），全部先删后报：`_lastReplayReport` 是**事后**报告，
     *      用户在按下删除时看不到「这一下会撤掉什么」。
     *   ② v3.9 废除级联销毁后，删楼变成**两段式**：先撤该楼、再把其后所有楼层前移。
     *      用户能预知的只有「回滚可能不完整」的告警（批量删除 > 5 时才响），
     *      「撤几条 / 移几条」无处可问。
     *   ③ 登记表里 `drop`/`shift` **都是写动作**（会真删真改），不能借它来预览 ——
     *      预览必须有一条**只读**路径，而不是「调一次看看」。
     *
     * 本面**不做什么**（边界）：
     *   · 不调任何 owner.drop / owner.shift —— 那两个有副作用，调了就不是预览；
     *   · 不猜量级：形状扫不出来就如实 `measurable: false` 并点名，**绝不拿 0 冒充**；
     *   · 不新增第二份真源：面清单仍只有 FLOOR_OWNERS 一张表。
     *
     * [自纠] 首稿另有一份「容器名白名单」当门，被本版冒烟判死（见 scanShape 内注释），
     *   已删除 —— 保留一份「名字已知、却不再当门」的表，只会让下一个读者以为它还在管用。
     *
     * 口径（`count` 的两档）：
     *   · `measurable: true`  —— 形状扫描认得这一面，`count` 是「持有该楼的条目数」（量级）；
     *   · `measurable: false` —— 这一面的状态形状扫不出来，`count` 保持 0 但**不被计入总数**
     *     （读者看 `projected` 与 `unmeasurable` 两栏，而不是看一个假装精确的 0）。
     *   `projected` 一个面都量不出来时为 `null`（「没给」），不为 0。
     *   drop 侧 `count` 的定义是**量级**不是**精确条数**：容器里被置 null 的字段
     *   （drop 侧的真实语义，见 dropLedgerItemFloors）不计入 —— 预览回答的是
     *   「这一下会牵动多少」，不是「会改几个字段」。 */
    const SHAPE_FLOOR_FIELDS = Object.freeze([
        'floor', 'evidenceFloor', 'resolvedFloor', 'floorStart', 'floorEnd',
        'updatedFloor', 'revealedFloor', 'settledFloor', 'lastFloor', 'lastEchoFloor',
        'validFrom', 'validTo'
    ]);

    /** 单条对象是否「与 floor 相关」：身份字段或容器内事件端点命中即真。
     *  `x != null` 这道门必须留着 —— `Number(null) === 0`，而 0 是本仓合法楼层，
     *  少了它第 0 楼的预览会把所有空字段都数进来（本仓 nativenumOrNull 治过的同款）。 */
    function shapeHit(o, floor) {
        if (o == null || typeof o !== 'object') return false;
        for (const k of SHAPE_FLOOR_FIELDS) { const x = o[k]; if (x != null && Number(x) === floor) return true; }
        for (const box of ['history', 'segments']) {
            if (!Array.isArray(o[box])) continue;
            for (const kid of o[box]) {
                if (kid == null || typeof kid !== 'object') continue;
                for (const k of SHAPE_FLOOR_FIELDS) { const x = kid[k]; if (x != null && Number(x) === floor) return true; }
            }
        }
        return false;
    }

    /** 只读形状扫描。返回 { hits, recognized }。
     *  recognized=false 表示「这一面的形状本面不认识」⇒ 调用方必须报 measurable:false，
     *  **不得**把「没认出来」读成「没有该楼的记录」。 */
    function scanShape(v, floor, depth) {
        if (depth > 3 || v == null || typeof v !== 'object') return { hits: 0, recognized: false };
        let hits = 0, recognized = false;
        if (Array.isArray(v)) {
            for (const it of v) if (shapeHit(it, floor)) hits++;
            return { hits, recognized: true };
        }
        if (v instanceof Set) {
            for (const x of v) if (x != null && Number(x) === floor) hits++;
            return { hits, recognized: true };
        }
        if (v instanceof Map) {
            for (const x of v.values()) {
                if (shapeHit(x, floor)) hits++;
                else if (Array.isArray(x)) for (const y of x) if (shapeHit(y, floor)) hits++;
            }
            return { hits, recognized: true };
        }
        if (shapeHit(v, floor)) { hits++; recognized = true; }
        // [v3.235.0 R4-A 自纠] 首稿在这里遍历的是一份容器名白名单，于是
        //   `diary.diaries`（{名字: [...]} 两层结构）、`graph.edges`（Map）、
        //   `ledger.floors` 这些「容器名不在白名单里」的面一律被判 recognized:false
        //   ⇒ 报告 unmeasurable。本版功能冒烟实测：42 面里 5 面扫不出，其中 3 面是
        //   白名单**漏项**造成的假 unmeasurable —— 「扫不出」与「没扫」必须不同形，
        //   这条对本面自身同样适用（诊断面自己撒谎，比不报更坏）。
        //   现改为遍历全部可枚举对象值（深度受限）：宁多勿少 —— 预览多报一个
        //   「可能被牵动」的面，好过静默漏掉一个真持有该楼的面。
        //   深度上限保证不因宿主的自引用对象无限递归（本面零抛出是硬纪律）。
        for (const k of Object.keys(v)) {
            const child = v[k];
            if (child == null || typeof child !== 'object') continue;
            const r = scanShape(child, floor, depth + 1);
            if (r.recognized) recognized = true;
            hits += r.hits;
        }
        return { hits, recognized };
    }

    /** 单面只读取数：与 replaySide 同 get / 同一道门 / 同一份 items 形状，**唯一差别是不调 action**。 */
    function countOwner(owner, host, floor, side) {
        const out = { id: owner.id, label: owner.label, holds: owner.holds, state: 'ok', count: 0, measurable: false };
        const action = side === 'drop' ? owner.drop : owner.shift;
        if (action === null || owner.participates === false) { out.state = 'no-op'; return out; }
        let cur = null;
        try { cur = owner.get(host); } catch (e) { out.state = 'threw'; return out; }
        if (cur == null) { out.state = 'absent'; return out; }
        if (side === 'shift') {
            // 前移的量级无法在「不改一个字段」的前提下量出来（要真减一才知道减几条），
            // 故前移侧只声明「参与」，不报条数 —— 这一栏回答的是「其后哪些面会跟着重定位」，
            // 不是「会移几条」。想量条数就只能调用 shift，而那已经是写动作了。
            out.state = 'declared';
            return out;
        }
        if (action === DROP_NOTHING) { out.state = 'no-op'; return out; }
        try {
            const r = scanShape(cur, floor, 0);
            if (r.recognized) { out.count = r.hits; out.measurable = true; }
        } catch (e) { out.state = 'threw'; }
        return out;
    }

    function previewSide(host, floor, side, registry) {
        const list = Array.isArray(registry) ? registry : FLOOR_OWNERS;
        const target = floorOrNull(floor);
        const head = { version: LEDGER_REPLAY_VERSION, side: side === 'drop' ? 'drop-preview' : 'shift-preview', floor: target };
        if (target === null) {
            return Object.assign(head, {
                items: [], projected: null, holders: [], unmeasurable: [], notParticipating: [],
                noOp: [], absent: [], threw: [], basis: 'shape-scan', skipped: 'floor-not-given'
            });
        }
        const items = [];
        const holders = [], unmeasurable = [], notParticipating = [], noOp = [], absent = [], threw = [];
        let projected = 0, measured = 0;
        for (const owner of list) {
            const row = countOwner(owner, host, target, side);
            items.push(row);
            if (row.state === 'no-op') {
                if (side === 'drop' && owner.drop === DROP_NOTHING) notParticipating.push(owner.id);
                else noOp.push(owner.id);
                continue;
            }
            if (row.state === 'absent') { absent.push(owner.id); continue; }
            if (row.state === 'threw') { threw.push(owner.id); continue; }
            if (side === 'shift') continue;
            if (row.measurable) { measured++; projected += row.count; if (row.count > 0) holders.push(owner.id); }
            else unmeasurable.push(owner.id);
        }
        return Object.assign(head, {
            items, projected: measured ? projected : null, holders,
            unmeasurable, notParticipating, noOp, absent, threw,
            basis: 'shape-scan', skipped: null
        });
    }

    /** 删楼预览：**只读**。回答「按下删除会撤掉什么」（哪些面持有该楼 / 量级多少 /
     *  哪些面扫不出来 / 哪些面本来就不参与删除）。 */
    function previewDrop(host, floor, registry) { return previewSide(host, floor, 'drop', registry); }

    /** 前移预览：**只读**。回答「其后哪些面会跟着重定位」（删楼是两段式，这一半此前完全不可预知）。 */
    function previewShift(host, floor, registry) { return previewSide(host, floor, 'shift', registry); }

    /** 预览报告的一行人话（与 diagnoseLine 同规格，供 selfCheck 念出来）。
     *  [v3.235.0 R4-A 自纠] 首稿只接受「包装对象」（`{floor, drop, shift}`），于是
     *   `previewLine(previewDrop(h, 7))` —— 把**单侧报告**直接递进来的那种自然写法 ——
     *   会被 `!report.drop` 静默读成「—（无预览）」。两种形态在调用点都自然，
     *   读错其一就是本仓最忌讳的形态混淆（本版冒烟当场抓到：四个调用样例全返同一句）。
     *   现在两种形态都认；**认不出的形态不静默**，返回带原因的说明。 */
    function previewLine(report, shiftReport) {
        let d = null, s = shiftReport || null;
        if (report && typeof report === 'object') {
            if (report.side === 'drop-preview') d = report;
            else { d = report.drop || null; if (!s) s = report.shift || null; }
        }
        if (!d) return (report == null) ? '—（无预览）' : '—（预览形态不可识：既不是包装对象，也不是 drop-preview 报告）';
        if (d.skipped === 'floor-not-given') return '—（未给楼层）';
        let txt = '楼' + d.floor + '：' + ((d.holders || []).length) + ' 面持有';
        txt += (d.projected === null) ? '，量级不可得' : ('，约 ' + d.projected + ' 条');
        if ((d.unmeasurable || []).length) txt += '，' + d.unmeasurable.length + ' 面扫不出';
        if ((d.notParticipating || []).length) txt += '，' + d.notParticipating.length + ' 面不参与删';
        if ((d.absent || []).length) txt += '，' + d.absent.length + ' 面缺席';
        if ((d.threw || []).length) txt += ' ⚠️' + d.threw.length + ' 面取数失败';
        if (s && s.skipped !== 'floor-not-given') {
            txt += ' · 其后 ' + (s.items || []).filter((r) => r.state === 'declared').length + ' 面随之重定位';
        }
        return txt;
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
        diagnoseLine,
        previewDrop,
        previewShift,
        previewLine,
        DROP_NOTHING
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    const g = (typeof globalThis !== 'undefined') ? globalThis : root;
    try { g.LonShaLedgerReplay = Object.freeze(api); } catch (e) { /* 宿主冻结全局时忽略 */ }
})(typeof window !== 'undefined' ? window : globalThis);
