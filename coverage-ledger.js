/**
 * coverage-ledger.js — [v3.112 缝合] 覆盖账本重算（归档隐藏的精确增删）
 *
 * 【来源】缝合 AnchorNote（锚点日记）的 refreshSummaryArchiveStateFromAnchors /
 *         anchorCoversSummary 机制，按本插件工程规范重写为可测纯函数模块
 *         （零依赖、IIFE 双导出、覆盖者/楼层/隐藏集合全部可注入）。
 *
 * 【机制】本插件已有「归档隐藏」（v3.25，Bakemono）：把已被卷摘要覆盖的旧楼层设为
 *   is_hidden，省上下文。但它的实现是**增量式**的：
 *     - 隐藏时只做加法（记进 _archivedFloorIds）；
 *     - 一旦发生编辑/删楼/换对话，就把整个集合清空——因为无法区分
 *       「哪些楼层是插件藏的」「哪些是用户手动藏的」，只好全清、全由下次重推。
 *   这带来两个真实问题：
 *     ① 覆盖者（卷摘要）失效后（比如折叠被撤销/卷被删），被它覆盖的楼层
 *        不会自动恢复——它们保持隐藏，剧情记忆出现断层，而且用户无从知道
 *        是插件藏的（不在集合里了）还是自己藏的；
 *     ② 每次结构变更后集合清零，下一次只能全量重推，永远无法做「精确恢复」。
 *
 *   AnchorNote 的答案是把归档状态**推导化**（derived）：不记「谁被藏了」，
 *   只记「谁覆盖谁」；任何时刻的隐藏状态 = f(当前有效覆盖者集合)。
 *   覆盖者消失 → 推导结果自动不含它覆盖的楼层 → 该恢复就恢复。
 *
 *   本模块把这些拆成纯函数：
 *     normalizeCoverer / isCovererUsable / covers   —— 覆盖者模型
 *     computeCoverage(coverers, floors)             —— 逐楼层推导覆盖归属
 *     planArchiveActions(...)                       —— 与当前隐藏集合求差：
 *         toHide（新覆盖且未藏）/ toRestore（曾藏但不再被覆盖）/ unchanged
 *     summarizeCoverage(...)                        —— 诊断（覆盖率 / 恢复数 / 孤儿覆盖者）
 *
 * 【与源码差异】
 *   - 源码把覆盖判定硬编码为「摘要楼层 <= 锚点覆盖楼层」（单轴：只按楼层序）；
 *     本实现支持任意 [fromFloor, toFloor] 区间覆盖者（卷摘要覆盖的是区间），
 *     因此「卷被删 → 区间内楼层全部恢复」这一场景也能覆盖。
 *   - 源码在同一个函数里直接改 store 并 return changed；本实现**纯函数**：
 *     输入不被修改，输出新集合 + 动作计划，由调用方执行副作用。
 *   - 增加孤儿覆盖者检测（覆盖者存在但不覆盖任何给定楼层）与覆盖率诊断。
 *   - 语义安全：restore 只针对「我们曾藏过」的楼层（hiddenIds 传入），
 *     绝不触碰用户手动隐藏的楼层；preserveFloor 之上（最近楼层）永不隐藏。
 */

(function (global) {
    'use strict';

    function normStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function normFloor(v) {
        const n = Math.floor(Number(v));
        return Number.isFinite(n) && n >= 0 ? n : null;
    }

    /**
     * 覆盖者模型：谁覆盖了哪些楼层。
     * @param {object} raw { id, kind, fromFloor, toFloor, version?, excluded?, hiddenReason? }
     */
    function normalizeCoverer(raw) {
        const s = raw || {};
        const from = normFloor(s.fromFloor);
        const to = normFloor(s.toFloor != null ? s.toFloor : s.fromFloor);
        const id = normStr(s.id);
        if (!id || from === null || to === null || to < from) return null;
        return {
            id,
            kind: normStr(s.kind) || 'coverage',
            fromFloor: from,
            toFloor: to,
            version: Number.isFinite(Number(s.version)) ? Math.floor(Number(s.version)) : 0,
            excluded: s.excluded === true,
            hiddenReason: normStr(s.hiddenReason) || null,
            label: normStr(s.label) || '',
        };
    }

    /** 覆盖者是否有效（被排除/被手动隐藏的覆盖者不参与归档推导——AnchorNote 同款语义） */
    function isCovererUsable(coverer) {
        if (!coverer) return false;
        if (coverer.excluded === true) return false;
        if (coverer.hiddenReason === 'manual') return false;
        return true;
    }

    /** 覆盖者是否覆盖某楼层 */
    function covers(coverer, floor) {
        const f = normFloor(floor);
        if (!coverer || f === null) return false;
        return f >= coverer.fromFloor && f <= coverer.toFloor;
    }

    /** 归一化覆盖者列表：剔除非法项 + 同 id 去重（先出现者胜，确定性） */
    function normalizeCoverers(coverers) {
        const out = [];
        const seen = new Set();
        for (const raw of (Array.isArray(coverers) ? coverers : [])) {
            const c = normalizeCoverer(raw);
            if (!c || seen.has(c.id)) continue;
            seen.add(c.id);
            out.push(c);
        }
        return out;
    }

    /**
     * 逐楼层推导覆盖归属（纯函数）。
     * 有效覆盖者中取「版本最高 → toFloor 最大 → id 字典序」为最佳（确定性）。
     * @returns {{ byFloor:object, covered:number[], uncovered:number[], ownerByFloor:object, orphans:string[] }}
     */
    function computeCoverage(coverers, floors) {
        const list = normalizeCoverers(coverers);
        const targets = [...new Set((Array.isArray(floors) ? floors : [])
            .map(normFloor).filter((f) => f !== null))].sort((a, b) => a - b);
        const usable = list.filter(isCovererUsable)
            .sort((l, r) => (r.version - l.version)
                || (r.toFloor - l.toFloor)
                || l.id.localeCompare(r.id, 'en'));

        const byFloor = {};
        const ownerByFloor = {};
        const covered = [];
        const uncovered = [];
        for (const floor of targets) {
            const owner = usable.find((c) => covers(c, floor)) || null;
            if (owner) {
                byFloor[floor] = true;
                ownerByFloor[floor] = owner.id;
                covered.push(floor);
            } else {
                byFloor[floor] = false;
                uncovered.push(floor);
            }
        }
        const usedIds = new Set(Object.values(ownerByFloor));
        const orphans = list.filter((c) => !usedIds.has(c.id)).map((c) => c.id);
        return { byFloor, covered, uncovered, ownerByFloor, orphans };
    }

    /**
     * 归档动作计划：当前隐藏集合与推导覆盖求差。
     * @param {object} input
     *   coverers  —— 覆盖者列表（卷摘要/折叠摘要等）
     *   floors    —— 全部候选楼层（AI 楼层下标）
     *   hiddenIds —— 「我们曾隐藏过」的楼层集合（绝不含用户手动隐藏的楼层）
     *   protectFloor —— 高于此楼层的楼层永不隐藏（最近正文保护；null=不保护）
     * @returns {{ toHide:number[], toRestore:number[], unchanged:number[], coverage:object, protectFloor:number|null }}
     */
    function planArchiveActions(input) {
        const s = input || {};
        const coverage = computeCoverage(s.coverers, s.floors);
        const hidden = new Set((Array.isArray(s.hiddenIds) ? s.hiddenIds : [])
            .map(normFloor).filter((f) => f !== null));
        const protect = normFloor(s.protectFloor);
        const protectFloor = protect === null ? null : protect;

        const toHide = [];
        const toRestore = [];
        let unchanged = 0;

        for (const floor of coverage.covered) {
            if (hidden.has(floor)) { unchanged += 1; continue; }
            if (protectFloor !== null && floor > protectFloor) continue;   // 最近楼层保护
            toHide.push(floor);
        }
        for (const floor of hidden) {
            if (coverage.byFloor[floor] === true) continue;   // 仍被覆盖：保持隐藏
            toRestore.push(floor);
        }
        toHide.sort((a, b) => a - b);
        toRestore.sort((a, b) => a - b);

        return {
            toHide,
            toRestore,
            unchanged,
            coverage,
            protectFloor,
        };
    }

    /** 应用计划后的新隐藏集合（纯函数，供持久化/断言用） */
    function applyPlan(hiddenIds, plan) {
        const hidden = new Set((Array.isArray(hiddenIds) ? hiddenIds : [])
            .map(normFloor).filter((f) => f !== null));
        for (const floor of ((plan && plan.toHide) || [])) hidden.add(floor);
        for (const floor of ((plan && plan.toRestore) || [])) hidden.delete(floor);
        return [...hidden].sort((a, b) => a - b);
    }

    /**
     * 诊断：覆盖率 / 恢复数 / 新增隐藏数 / 孤儿覆盖者
     * hiddenFloors 为「执行本计划后」的隐藏楼层数 = 仍被覆盖的既有隐藏（unchanged）+ 新增隐藏。
     * @returns {{ candidateFloors, coveredFloors, hiddenFloors, coverageRate, toHide, toRestore, unchanged, orphans }}
     */
    function summarizeCoverage(plan) {
        const p = plan || {};
        const cov = p.coverage || { covered: [], uncovered: [], orphans: [] };
        const candidates = cov.covered.length + cov.uncovered.length;
        const unchanged = Number(p.unchanged || 0);
        const toHide = (p.toHide || []).length;
        return {
            candidateFloors: candidates,
            coveredFloors: cov.covered.length,
            hiddenFloors: unchanged + toHide,
            coverageRate: candidates ? Number((cov.covered.length / candidates).toFixed(4)) : 0,
            toHide,
            toRestore: (p.toRestore || []).length,
            unchanged,
            orphans: (cov.orphans || []).slice(0, 16),
        };
    }

    const api = {
        normalizeCoverer,
        normalizeCoverers,
        isCovererUsable,
        covers,
        computeCoverage,
        planArchiveActions,
        applyPlan,
        summarizeCoverage,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaCoverageLedger = api;
})(typeof window !== 'undefined' ? window : globalThis);