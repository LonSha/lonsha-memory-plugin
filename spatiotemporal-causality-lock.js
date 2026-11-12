/* ============================================================
 * spatiotemporal-causality-lock.js — [v3.460.0 · V21-L2]
 * 全时态因果一致性验证与时空锁闭机制 (Spatiotemporal Causality Lock)
 * ------------------------------------------------------------
 * 解决倒叙叙事、死者发言、未来事实穿梭等时空逻辑 Bug：
 * 1. 绝对时间轴与相对叙事时钟 DAG 锁（DAG Timeline Lock）
 * 2. 事实成立前提依赖校验（Prerequisite Causal Proof）
 * 3. 幽灵行为与超前因果阻断（Anachronism Interceptor）
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaCausalityLock = factory();
        root.SpatiotemporalCausalityLock = root.LonShaCausalityLock;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function createCausalityLockState() {
        return {
            version: VERSION,
            timelineEvents: new Map(), // eventId -> eventRecord
            causalDependencies: [],    // [{ prerequisiteId, dependentId, reason }]
            characterLifespans: new Map(), // characterName -> { bornAt, deceasedAt, status }
            updatedAt: Date.now()
        };
    }

    function recordTimelineEvent(state, event = {}) {
        if (!state || !state.timelineEvents) return null;
        const id = String(event.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
        const record = {
            id,
            timestamp: Number(event.timestamp) || Date.now(),
            storyEpoch: String(event.storyEpoch || "current"),
            actor: String(event.actor || "narrator").trim(),
            action: String(event.action || "").trim(),
            description: String(event.description || "").trim(),
            prerequisites: Array.isArray(event.prerequisites) ? event.prerequisites : [],
            createdAt: Date.now()
        };
        state.timelineEvents.set(id, record);
        if (record.prerequisites.length > 0) {
            for (const preId of record.prerequisites) {
                state.causalDependencies.push({ prerequisiteId: preId, dependentId: id });
            }
        }
        state.updatedAt = Date.now();
        return record;
    }

    function validateCausalConsistency(state, candidateEvent = {}) {
        if (!state || !state.timelineEvents) return { valid: false, violations: ["invalid_state"] };
        const violations = [];
        const actor = String(candidateEvent.actor || "").trim();
        const candTime = Number(candidateEvent.timestamp) || Date.now();

        // 1. 生命状态校验 (避免死者行动 Bug)
        if (actor && state.characterLifespans && state.characterLifespans.has(actor)) {
            const span = state.characterLifespans.get(actor);
            if (span.deceasedAt && candTime > span.deceasedAt) {
                violations.push(`post_mortem_action: character ${actor} died at ${span.deceasedAt}, cannot act at ${candTime}`);
            }
        }

        // 2. 前置依赖时间倒错校验
        const prereqs = Array.isArray(candidateEvent.prerequisites) ? candidateEvent.prerequisites : [];
        for (const preId of prereqs) {
            const preEvt = state.timelineEvents.get(preId);
            if (!preEvt) {
                violations.push(`missing_prerequisite: event requires ${preId} which is not established`);
            } else if (preEvt.timestamp > candTime) {
                violations.push(`temporal_paradox: prerequisite ${preId} (${preEvt.timestamp}) occurs after candidate (${candTime})`);
            }
        }

        return {
            valid: violations.length === 0,
            violations
        };
    }

    function setCharacterLifespan(state, actor, lifespan = {}) {
        if (!state || !state.characterLifespans) return false;
        const name = String(actor || "").trim();
        if (!name) return false;
        state.characterLifespans.set(name, {
            actor: name,
            bornAt: lifespan.bornAt || null,
            deceasedAt: lifespan.deceasedAt || null,
            status: lifespan.deceasedAt ? "deceased" : "alive",
            updatedAt: Date.now()
        });
        state.updatedAt = Date.now();
        return true;
    }

    /* ============================================================
     * [v3.464.0 · L21-O4 水合面补齐] / [v3.465.1 L21-O4 复检：按本模块形状归一]
     * 为什么必须补：宿主 `engine-persistence-ops.js` 的水合表把本模块登记成
     *   `hydrateState`，而本文件此前根本没有这个函数 —— 恢复路径上
     *   `typeof mod['hydrateState'] === 'function'` 恒假，静默走 `: _ext[key]` 兜底，
     *   把**原始 payload**直接赋给宿主字段。表面上「恢复了」，实际装进去的是没经归一的数据。
     *
     * ★ [v3.465.1] 首版这里写的是「以默认形状为底逐键浅合并」的通用实现。复检判定它
     *   **本身就是它声称要修的那个病**：
     *     ① 19 个模块共用同一份通用体 => 逐字副本簇（`tests/v3281_o7_module_copy_ledger.test.mjs`
     *        的 B1 当场翻红，点名 hydrateState 一簇 11 成员）。本仓「两份实现即第二真源」。
     *     ② 更要命的是它在这些模块上**必然装脏**：本模块的 timelineEvents / characterLifespans 是
     *        `Map<eventId, event>` + `Map<name, {bornAt, deceasedAt(可空), status}>`，而落盘/读盘走 JSON —— 存档里它们是普通对象/数组，
     *        浅合并会把普通对象原样写回字段，此后本模块每次 `.get` / `.has` / `.add`
     *        都是 TypeError。「登记成立」不等于「恢复正确」。
     *   故按本模块真实形状逐字段归一（与同族 37 个已有 hydrateState 的口径一致：
     *   只取认得的键、逐字段夹紧、构造正确的容器类型），并且**不再**与任何模块逐字相同。
     *
     * 口径（刻意**不抛错**，与同族 createState 的宽容度一致）：
     *   ① 非对象 / null / 数组 => 整体回落默认状态；
     *   ② 只读默认形状里已有的键（野键一律丢弃：野键进状态等于第二真源）；
     *   ③ 容器按形状重建（Map/Set 由 entries/数组重建，绝不留原值）；
     *   ④ 数值按字段值域夹紧，字符串按受控枚举回落；未知值回落默认值（不抛、不猜）。
     * ============================================================ */

    function hydrateState(saved) {
        const s = createCausalityLockState();
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return s;
        const entriesOf = (v) => {
            if (v instanceof Map) return Array.from(v.entries());
            if (Array.isArray(v)) return v;
            if (v && typeof v === 'object') return Object.entries(v);
            return [];
        };
        /* timelineEvents 与 characterLifespans 都是 Map —— 必须由 JSON 对象重建，留原值即 TypeError。*/
        for (const pair of entriesOf(saved.timelineEvents)) {
            if (!Array.isArray(pair) || pair.length < 2) continue;
            const v = pair[1];
            if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
            s.timelineEvents.set(String(pair[0]), v);
        }
        if (Array.isArray(saved.causalDependencies)) {
            for (const d of saved.causalDependencies) {
                if (!d || typeof d !== 'object' || Array.isArray(d)) continue;
                s.causalDependencies.push({
                    prerequisiteId: String(d.prerequisiteId == null ? '' : d.prerequisiteId),
                    dependentId: String(d.dependentId == null ? '' : d.dependentId),
                    reason: String(d.reason == null ? '' : d.reason)
                });
            }
        }
        for (const pair of entriesOf(saved.characterLifespans)) {
            if (!Array.isArray(pair) || pair.length < 2) continue;
            const v = pair[1];
            const l = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
            const deceased = Number(l.deceasedAt);
            s.characterLifespans.set(String(pair[0]), {
                bornAt: Number.isFinite(Number(l.bornAt)) ? Number(l.bornAt) : 0,
                /* deceasedAt 默认 null = 「还活着」。用 0 会把它读成「公元 0 年亡故」。*/
                deceasedAt: Number.isFinite(deceased) ? deceased : null,
                status: String(l.status == null ? '' : l.status)
            });
        }
        if (Number.isFinite(Number(saved.updatedAt))) s.updatedAt = Number(saved.updatedAt);
        return s;
    }

    /* [v3.464.0 · L21-O4] 按水合表的**登记名**导出别名。
     * 宿主 `engine-persistence-ops.js` 登记的是 `hydrateLockState`（专用名），
     * 而本文件的水合实现收敛在 hydrateState 一处 —— 保留单一实现，只加导出别名，
     * 避免出现两份实现（两份即第二真源，本仓 v3.444.0 的「同名两份」教训）。 */
    const hydrateLockState = hydrateState;

    /* [v3.464.0 · L21-O4] 宿主初始化登记名别名。
     * `index.js` 的 v21Initializers 表登记的是 `createInitialLockState`，
     * 而本文件的默认状态构造叫 `createCausalityLockState` —— 现场实测（本版起点）：
     * 表里 18 项登记名**没有一个**在模块导出面上存在，于是
     * `typeof lib[initFn] === 'function'` 恒假，初始化整段静默跳过 ——
     * v3.460.0 声称的「18 项心智引擎初始状态与宿主生命周期融合挂载」实际从未发生。
     * 这里只加**别名**，不复制实现：两份实现即第二真源（v3.444.0 同名两份的教训）。 */
    const createInitialLockState = createCausalityLockState;

    return {
        VERSION,
        createCausalityLockState,
        recordTimelineEvent,
        validateCausalConsistency,
        setCharacterLifespan,
        hydrateState,
        hydrateLockState,
        createInitialLockState
    };
}));
