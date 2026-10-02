(function (global) {
    'use strict';
/**
 * archive-audit.js — [v3.261.0 缝合] 存档体检三分判定（活 / 可清理 / 保留）
 *
 * 【来源】缝合 atonal519/ST-MyriadKnots（千织）`src/storage-management.js` 的
 *         `classifyStorageRecords` + `reachableRecordIds` + `safeFoundationEnvelope`，
 *         抽掉千织的 v3 foundation 记录类型，改按**本插件存档顶层键**分类。
 *
 * 【为什么需要这一面】
 *   本插件的存档是**一个并集**：本插件自己写的键、用户手动导入过的外部档留下的键、
 *   旧版本曾经写过而当前版本已不认的键，全部躺在同一份 payload 里。
 *   `restoreFromPayload` 现在的处置是——认得的键回填运行时，**不认得的键原样收进
 *   `_archiveExtensions` 备份袋**（v3.142 的宽容解析，正确），但没有任何一面回答：
 *     · 这份档里到底有多少键是**当前真源**（活）；
 *     · 有多少键是「结构完好、但当前版本已不消费」的（可清理候选）；
 *     · 有多少键**根本判不了**（畸形 JSON / 结构不符，既不能认领也不能删）。
 *   三者的处置完全不同：活键要保、可清理要问用户、判不了的必须**留在原地不动**——
 *   「说不清是谁的」就把别人的数据删掉，是本仓最不能出的那类事故。
 *
 * 【三分判定的判据（不是感觉）】
 *   ① 活（active）：该键在存档契约的启用集合里，且值是合法 JSON 值（对象/数组/数字/字符串/布尔）；
 *   ② 可清理（cleanup）：键不在启用集合里，但值**结构完好**（能序列化、非 undefined、
 *      非函数），且能归到某一类已知分组（账本 / 状态 / 配置 / 其他）；
 *   ③ 保留（retained）：其余一切——值为 undefined/函数/循环引用、键名不可读、
 *      或分类器不认识。**畸形容错与「不是我们的」都不进清理候选**。
 *
 *   ★ 源码纪律照搬：`classifyStorageRecords` 里那句「Unreachable is not proof of ownership;
 *     malformed or foreign records stay out of cleanup candidates」——不可达**不等于**
 *     可以删。本模块把同一条纪律落在顶层键上：判不了 ⇒ retained，且必须能被点名。
 *
 * 【与源码差异】
 *   - 千织按 `v3-*` recordId 前缀分类并逐条跑 schema 校验器；本插件存档是**扁平的顶层键**，
 *     没有 envelope/revision，故分类器改为「契约键集合 + 值结构」两段判定，不做 schema 校验；
 *   - 去掉了 `setTimeout` 批让渡（那是为了不卡 UI 的长循环；本模块是同步纯函数，
 *     调用方自行决定是否分片）；
 *   - 字节数用本仓口径（JSON.stringify 后按 UTF-8 计），与源码 `textBytes` 同义。
 *
 * 【约束】纯函数：不修改入参、不读全局、不抛（畸形输入一律降级成 retained）。
 */
    const ARCHIVE_AUDIT_VERSION = 1;

    /** 存档契约的顶层键（活键集合由调用方注入；这里只给分类顺序，不给具体契约）。 */
    const AUDIT_GROUPS = Object.freeze(['ledger', 'state', 'config', 'other']);

    const VALUE_KINDS = Object.freeze(['object', 'array', 'number', 'string', 'boolean', 'null', 'unreadable']);

    /** 值的可读形态：判不了就是 'unreadable'（不是抛，也不是猜）。 */
    function kindOf(value) {
        try {
            if (value === null) return 'null';
            if (Array.isArray(value)) return 'array';
            const t = typeof value;
            if (t === 'object' || t === 'number' || t === 'string' || t === 'boolean') return t;
            return 'unreadable';   // undefined / function / symbol / bigint
        } catch (e) { return 'unreadable'; }
    }

    /** 该值能否被序列化（循环引用 ⇒ 判不了）。 */
    function serializable(value) {
        try { JSON.stringify(value); return true; }
        catch (e) { return false; }
    }

    /** 字节读数：序列化后按 UTF-8 计；判不了记 0（不编造体积）。 */
    function bytesOf(value) {
        try {
            const s = JSON.stringify(value);
            if (typeof s !== 'string') return 0;
            if (typeof TextEncoder === 'function') return new TextEncoder().encode(s).byteLength;
            return unescape(encodeURIComponent(s)).length;
        } catch (e) { return 0; }
    }

    function emptyBreakdown() {
        const out = {};
        for (const g of AUDIT_GROUPS) out[g] = { count: 0, bytes: 0 };
        return out;
    }

    /**
     * 契约诊断（**先于分类**，与源码同序）：区分「无契约」「契约不可读」「契约完好但空」。
     *   null       = 调用方没给契约（`activeKeys` 缺席）——≠「契约是空的」；
     *   'unreadable' = 给了但不是可枚举形态（字符串/数字）；
     *   对象       = { activeKeys: N, groups: [...], unusable: [...] }
     */
    function inspectArchiveContract(activeKeys) {
        if (activeKeys == null) return null;
        if (typeof activeKeys === 'string') {
            // 字符串按分隔符切（支持 'a,b,c' 与 'a\nb' 两种写法）
            const list = activeKeys.split(/[\s,]+/).filter(Boolean);
            return Object.freeze({ activeKeys: list.length, groups: [], unusable: [] });
        }
        if (typeof activeKeys !== 'object' || Array.isArray(activeKeys)) return 'unreadable';
        const keys = Object.keys(activeKeys);
        const groups = [];
        const unusable = [];
        for (const k of keys) {
            const g = activeKeys[k];
            if (typeof g === 'string' && AUDIT_GROUPS.includes(g)) groups.push(k);
            else unusable.push(k);
        }
        return Object.freeze({ activeKeys: keys.length, groups, unusable });
    }

    /**
     * 三分判定入口。
     * @param payload   存档载荷（object；其它形态 ⇒ ok=false，不硬判）
     * @param activeKeys 契约：数组 = 活键名列表（全部归 'ledger' 组）；
     *                   对象 = { key: group }（group 须在 AUDIT_GROUPS 内）；
     *                   字符串 = 分隔符切分；null/undefined = 无契约（全部键都判不了 ⇒ retained）
     * @returns {ok, verdict, stats, entries, contract, reason}
     *   verdict: 'classified' | 'invalid-payload'
     *   entries: 逐键三元组（冻结），供调用方按名点名
     */
    function classifyArchive(payload, activeKeys) {
        const contract = inspectArchiveContract(activeKeys);
        const base = { total: { count: 0, bytes: 0 }, active: { count: 0, bytes: 0 }, cleanup: { count: 0, bytes: 0 }, retained: { count: 0, bytes: 0 } };
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return Object.freeze({
                ok: false, verdict: 'invalid-payload', reason: '载荷不是可分类的对象',
                contract, stats: Object.freeze({ ...base, breakdown: { active: emptyBreakdown(), cleanup: emptyBreakdown(), retained: emptyBreakdown() } }),
                entries: Object.freeze([]),
            });
        }
        const activeSet = new Set();
        const groupOfKey = new Map();
        // ★ 契约可用性先于一切：「无契约」与「契约在但某键不在册」是两件事。
        //   无契约/契约不可读时，**不允许产出任何可清理候选**——那时「不在册」无从谈起，
        //   把「说不清」当成「可以删」正是本条要防的事故（与源码 malformed/foreign 同一条纪律）。
        const contractUsable = Array.isArray(activeKeys) || (typeof activeKeys === 'string')
            || (contract !== null && contract !== 'unreadable' && typeof activeKeys === 'object');
        if (Array.isArray(activeKeys)) for (const k of activeKeys) { activeSet.add(String(k)); groupOfKey.set(String(k), 'ledger'); }
        else if (contract && contract !== 'unreadable' && typeof activeKeys === 'object') {
            for (const k of Object.keys(activeKeys)) { activeSet.add(k); groupOfKey.set(k, activeKeys[k]); }
        } else if (typeof activeKeys === 'string') {
            for (const k of activeKeys.split(/[\s,]+/).filter(Boolean)) { activeSet.add(k); groupOfKey.set(k, 'ledger'); }
        }

        const breakdown = { active: emptyBreakdown(), cleanup: emptyBreakdown(), retained: emptyBreakdown() };
        const entries = [];
        const total = { count: 0, bytes: 0 };
        const active = { count: 0, bytes: 0 };
        const cleanup = { count: 0, bytes: 0 };
        const retained = { count: 0, bytes: 0 };

        for (const key of Object.keys(payload)) {
            const value = payload[key];
            const bytes = bytesOf(value);
            const kind = kindOf(value);
            total.count += 1; total.bytes += bytes;
            const isAlive = activeSet.has(key) && kind !== 'unreadable' && specOk(value, kind);
            if (isAlive) {
                const group = groupOfKey.get(key) || 'state';
                active.count += 1; active.bytes += bytes;
                breakdown.active[group].count += 1; breakdown.active[group].bytes += bytes;
                entries.push(Object.freeze({ key, verdict: 'active', group, kind, bytes }));
                continue;
            }
            const canCleanup = contractUsable && !activeSet.has(key) && kind !== 'unreadable' && serializable(value);
            if (canCleanup) {
                cleanup.count += 1; cleanup.bytes += bytes;
                const group = classifyGroup(key, value);
                breakdown.cleanup[group].count += 1; breakdown.cleanup[group].bytes += bytes;
                entries.push(Object.freeze({ key, verdict: 'cleanup', group, kind, bytes }));
                continue;
            }
            // 活键但值形态不合（undefined/函数/循环引用）也落这里：**认领不了 ≠ 可以删**。
            retained.count += 1; retained.bytes += bytes;
            const group = classifyGroup(key, value);
            breakdown.retained[group].count += 1; breakdown.retained[group].bytes += bytes;
            entries.push(Object.freeze({
                key, verdict: 'retained', group, kind, bytes,
                reason: kind === 'unreadable' ? 'value-unreadable' : (!serializable(value) ? 'value-cyclic' : 'contract-mismatch'),
            }));
        }

        return Object.freeze({
            ok: true,
            verdict: 'classified',
            contract,
            stats: Object.freeze({ ...base, total: Object.freeze(total), active: Object.freeze(active), cleanup: Object.freeze(cleanup), retained: Object.freeze(retained), breakdown }),
            entries: Object.freeze(entries),
        });
    }

    /** 活键的值形态要求：容器或标量都行，但 null/undefined 不算「活」（没有内容的键不算活着）。 */
    function specOk(value, kind) {
        if (kind === 'unreadable' || kind === 'null') return false;
        try { return serializable(value); } catch (e) { return false; }
    }

    /** 分组启发式：按命名前缀归组；认不出来归 'other'（**不猜**）。 */
    function classifyGroup(key, value) {
        const k = String(key || '');
        if (/ledger|book|counter|chronicle|pool/i.test(k)) return 'ledger';
        if (/config|setting|option|prefs/i.test(k)) return 'config';
        if (Array.isArray(value) || (value && typeof value === 'object')) return 'state';
        return 'other';
    }

    /** 一行读数（诊断面用）：三个数必须都在，判不了不许被压成 0。 */
    function line(result) {
        if (!result) return '未体检';
        if (!result.ok) return '体检失败（' + result.reason + '）';
        const s = result.stats;
        return '活 ' + s.active.count + ' 键/' + s.active.bytes + 'B'
            + ' · 可清理 ' + s.cleanup.count + ' 键/' + s.cleanup.bytes + 'B'
            + ' · 保留 ' + s.retained.count + ' 键/' + s.retained.bytes + 'B'
            + '（共 ' + s.total.count + ' 键/' + s.total.bytes + 'B）';
    }

    const api = Object.freeze({
        ARCHIVE_AUDIT_VERSION,
        AUDIT_GROUPS,
        VALUE_KINDS,
        kindOf,
        serializable,
        bytesOf,
        inspectArchiveContract,
        classifyArchive,
        classifyGroup,
        line,
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaArchiveAudit = api;
})(typeof window !== 'undefined' ? window : globalThis);