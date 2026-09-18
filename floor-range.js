/**
 * floor-range.js — [v3.97 缝合] 楼层范围增量追踪引擎
 *
 * 【来源】缝合 Amily2/CharacterWorldBook（cwb_core.js）的楼层范围增量更新机制，
 *         按记忆插件工程规范重写为可测纯函数 IIFE 模块。剥离其对酒馆 lorebook
 *         全局 API 的耦合，提取「楼层区间标记 + 覆盖追踪 + 增量计算」自包含核心。
 *
 * 【机制】
 *   长篇 RP 中角色档案/摘要需随剧情增量更新。若每次全量重算，token 开销巨大。
 *   Amily2 的做法：给每个档案条目打上楼层区间标记（如 key "10-25" 表示该条目
 *   覆盖第 10~25 楼的剧情），追踪「已处理到第几楼」，下次只补处理新增区间。
 *   本引擎提供该机制的纯函数实现：
 *   - parseFloorRangeKey：解析 "N-M" 区间标记（如 "10-25" → {start:10,end:25}）
 *   - mergeRanges：把一组区间合并为最小不相交区间集（排序+重叠/相邻合并）
 *   - maxCoveredFloor：已覆盖的最大楼层
 *   - computePendingRange：给定已覆盖区间与当前最新楼层，算出待处理的新增区间
 *   - rangeContains / rangesOverlap：区间包含/重叠判定
 *   - subtractRange：从已覆盖中扣除失效区间（删楼后重算）
 *
 * 【与源码差异】
 *   - 源码把区间嵌在 lorebook entry.keys 中（与酒馆世界书耦合）；
 *     本实现自包含 FloorTracker，区间数据由调用方持久化，不依赖 lorebook
 *   - 源码仅追踪 maxEndFloor（单点水位）；本实现支持多区间（可处理删楼空洞）
 *   - 增加 mergeRanges/subtractRange 等源码没有的集合运算，支撑删楼重算
 */

(function (global) {
    'use strict';

    /** 区间标记正则：N-M（允许空格） */
    const RANGE_KEY_RE = /^(\d+)\s*-\s*(\d+)$/;

    /**
     * 解析楼层区间标记 "N-M"
     * @param {string} key
     * @returns {{start:number,end:number}|null} 非法返回 null；自动纠正 start>end
     */
    function parseFloorRangeKey(key) {
        const m = String(key ?? '').trim().match(RANGE_KEY_RE);
        if (!m) return null;
        let start = parseInt(m[1], 10);
        let end = parseInt(m[2], 10);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
        if (start > end) [start, end] = [end, start];
        return { start, end };
    }

    /** 规范化区间对象（纠正 start>end，过滤非有限数） */
    function normRange(r) {
        const start = Number(r?.start);
        const end = Number(r?.end);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
        return start <= end ? { start, end } : { start: end, end: start };
    }

    /**
     * 合并区间为最小不相交集（按 start 排序，重叠或相邻（gap<=1）合并）
     * @param {Array<{start:number,end:number}>} ranges
     * @returns {Array<{start:number,end:number}>}
     */
    function mergeRanges(ranges, carry = null) {
        const _raw = ranges || [];
        const valid = _raw.map(normRange).filter(Boolean);
        // [v3.173] 接线：本模块缝合后 72 个版本无人调用（v3.163 账本零消费）。
        //   楼层区间合并会把「非法区间」与「被并入邻段」两类消失一起吃掉：
        //   前者是数据脏（丢掉后水位就少算了），后者是正常压缩。两者必须分账。
        if (carry && typeof carry === 'object') {
            carry.rangeMerge = {
                input: _raw.length, valid: valid.length, dropped: _raw.length - valid.length,
                merged: 0, collapsed: 0, span: 0,
            };
        }
        if (valid.length === 0) return [];
        valid.sort((a, b) => a.start - b.start || a.end - b.end);
        const merged = [{ ...valid[0] }];
        for (let i = 1; i < valid.length; i++) {
            const cur = valid[i];
            const last = merged[merged.length - 1];
            // 重叠或相邻（cur.start <= last.end + 1）则合并
            if (cur.start <= last.end + 1) {
                if (last.end === cur.end) { if (carry && carry.rangeMerge) carry.rangeMerge.collapsed++; }
                last.end = Math.max(last.end, cur.end);
            } else {
                merged.push({ ...cur });
            }
        }
        if (carry && carry.rangeMerge) {
            carry.rangeMerge.merged = merged.length;
            carry.rangeMerge.collapsed += valid.length - merged.length;
            carry.rangeMerge.span = merged.reduce((n, r) => n + (r.end - r.start + 1), 0);
        }
        return merged;
    }

    /** 已覆盖的最大楼层（无覆盖返回 0） */
    function maxCoveredFloor(ranges) {
        const merged = mergeRanges(ranges);
        return merged.length ? merged[merged.length - 1].end : 0;
    }

    /** 区间 a 是否完全包含区间 b */
    function rangeContains(a, b) {
        return a.start <= b.start && a.end >= b.end;
    }

    /** 两区间是否重叠（含相邻端点相接视为不重叠，仅真重叠） */
    function rangesOverlap(a, b) {
        return a.start <= b.end && b.start <= a.end;
    }

    /**
     * 计算待处理的新增区间
     * 给定已覆盖区间与当前最新楼层，返回 [processedUpTo+1, latestFloor] 中
     * 尚未被覆盖的部分（已合并）。
     * @param {Array<{start:number,end:number}>} covered 已覆盖区间
     * @param {number} latestFloor 当前最新楼层（1 起）
     * @returns {Array<{start:number,end:number}>} 待处理区间（可能为空）
     */
    function computePendingRange(covered, latestFloor, carry = null) {
        const latest = Math.floor(Number(latestFloor));
        // [v3.173] 读数：本函数决定「这一轮还要不要折叠」。三类失效在旧实现里都长成
        //   「没有待处理」这一个形状：latestFloor 本身非法（早期 return []）、
        //   已覆盖区间有空洞（删楼后水位与段之间断开）、以及真的一楼不漏。
        //   第四类更隐蔽：最新楼层比已覆盖水位还低（回滚后重新折叠的入口）。
        const _read = { latest, validLatest: Number.isFinite(latest) && latest >= 1,
            coveredIn: (covered || []).length, holes: 0, pending: 0, coveredTo: 0,
            behind: false, upToDate: false };
        if (carry && typeof carry === 'object') carry.pendingRange = _read;
        if (!Number.isFinite(latest) || latest < 1) return [];
        const merged = mergeRanges(covered);
        _read.coveredTo = merged.length ? merged[merged.length - 1].end : 0;
        _read.behind = _read.coveredTo > latest;
        const pending = [];
        let cursor = 1;
        for (const seg of merged) {
            if (seg.end < cursor) continue;          // 段在水位之前
            if (seg.start > latest) break;            // 段超出最新楼层
            if (seg.start > cursor) {
                // 水位与该段之间的空洞 = 待处理
                _read.holes++;
                pending.push({ start: cursor, end: Math.min(seg.start - 1, latest) });
            }
            cursor = Math.max(cursor, seg.end + 1);
            if (cursor > latest) break;
        }
        if (cursor <= latest) {
            pending.push({ start: cursor, end: latest });
        }
        const _out = pending.filter(r => r.start <= r.end);
        _read.pending = _out.length;
        _read.upToDate = _out.length === 0;
        return _out;
    }

    /**
     * 从已覆盖区间中扣除失效区间（删楼后重算）
     * @param {Array<{start:number,end:number}>} covered
     * @param {{start:number,end:number}} removed 被删除的区间
     * @returns {Array<{start:number,end:number}>} 扣除后的覆盖区间（已合并）
     */
    function subtractRange(covered, removed) {
        const rem = normRange(removed);
        if (!rem) return mergeRanges(covered);
        const merged = mergeRanges(covered);
        const out = [];
        for (const seg of merged) {
            if (!rangesOverlap(seg, rem)) { out.push(seg); continue; }
            // 左半部分
            if (seg.start < rem.start) out.push({ start: seg.start, end: rem.start - 1 });
            // 右半部分
            if (seg.end > rem.end) out.push({ start: rem.end + 1, end: seg.end });
        }
        return out.filter(r => r.start <= r.end);
    }

    /**
     * 创建楼层追踪器（封装一组覆盖区间，提供增量工作流）
     * @param {Array<{start:number,end:number}>} [initial=[]] 初始已覆盖区间
     */
    function createTracker(initial = [], carry = null) {
        let covered = mergeRanges(initial);
        // [v3.173] 接线：把「创建/标记/回退」的每一次区间变动记进台账，
        //   否则 tracker 的覆盖变化只能在 exportRanges 时才看得出结果、看不出过程。
        const _t = { created: covered.length, marks: 0, drops: 0, resets: 0, dropsOverlap: 0,
            lastMark: null, lastDrop: null };
        if (carry && typeof carry === 'object') carry.floorTracker = _t;

        return {
            /** 标记一段区间已处理 */
            markProcessed(start, end) {
                const r = normRange({ start, end });
                if (r) {
                    _t.marks++;
                    _t.lastMark = { start: r.start, end: r.end };
                    covered = mergeRanges([...covered, r]);
                }
                return r;
            },
            /** 当前已覆盖的最大楼层 */
            maxFloor() { return maxCoveredFloor(covered); },
            /** 计算到 latestFloor 的待处理区间 */
            pending(latestFloor) { return computePendingRange(covered, latestFloor); },
            /** 扣除失效区间（删楼） */
            remove(start, end) {
                const _before = covered.length;
                const _r = normRange({ start, end });
                if (_r && !covered.some(s => rangesOverlap(s, _r))) _t.dropsOverlap++;   // 删的区间本来就没覆盖：空洞制造者
                covered = subtractRange(covered, { start, end });
                _t.drops++;
                _t.lastDrop = _r ? { start: _r.start, end: _r.end } : null;
                void _before;
            },
            /** 是否完全无需处理（已覆盖到 latestFloor） */
            isUpToDate(latestFloor) { return computePendingRange(covered, latestFloor).length === 0; },
            /** 导出可持久化状态 */
            exportRanges() { return covered.map(r => ({ ...r })); },
            /** 重置 */
            reset() { covered = []; _t.resets++; },
            /** [v3.173] 台账快照（只读） */
            read() { return Object.assign({}, _t, { current: covered.map(r => ({ ...r })) }); },
        };
    }

    const api = {
        parseFloorRangeKey,
        mergeRanges,
        maxCoveredFloor,
        rangeContains,
        rangesOverlap,
        computePendingRange,
        subtractRange,
        createTracker,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaFloorRange = api;
})(typeof window !== 'undefined' ? window : globalThis);