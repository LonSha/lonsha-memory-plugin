(function (global) {
    'use strict';
/**
 * floor-identity.js — [v3.261.0 缝合] 楼层身份匹配证明（一对一？还是「你以为的一对一」）
 *
 * 【来源】缝合 atonal519/ST-MyriadKnots（千织）`src/v3/floor-binding.js`
 *         + `src/v3/chat-branch-inheritance.js` 的 `inheritedPrefix`，按本插件工程规范
 *         重写为纯函数 IIFE 模块（零依赖、双导出），保留完整判解语义。
 *
 * 【为什么需要这一面】
 *   本插件有**两种楼层身份**并存，且两边从来只做「自己这边」的事：
 *     · 持久侧：summary / pov / vector / itemOps 里存的 `floor` 号 + `fp` 指纹（msgFpOf）；
 *     · 宿主侧：当前 `chat` 数组里第 N 楼**此刻**的正文与页码。
 *   于是「持久记录还属于当前聊天吗」这个问题，此前一律由调用方**各写一遍**：
 *   有的按 `floor` 号直接认领（改楼/删楼/插楼后静默错位），有的按指纹单条比对
 *   （同页不同代被当成同一楼），有的干脆不判（导入外部档时把别人的楼层当自己的）。
 *   本模块把这件事收成**一个证明过程**：不是「像不像」，而是「能不能证明是一对一」——
 *   判不了就不认领（`issue` 点名根因），绝不猜。
 *
 * 【四段判解（与源码逐段同构）】
 *   1. 显式标记预留：`messageAnchor.status === 'valid'` 的候选先按 `anchor.floorId`
 *      认领自己的楼。**必须先于内容兜底**——否则一个更早的无标记候选会把
 *      后面靠标记明确认领的楼吃掉（源码注释即为此纪律）。
 *   2. locator + 内容：无标记候选按 `sameLocator`（messageIndex/swipeId/selectedSwipeIndex
 *      三者全等）找到未占用楼，且 canonical 或 raw 指纹相等；命中多于一楼 ⇒ 判不了。
 *   3. 全局唯一指纹对：无 locator 可依时，要求 (raw, canonical) 二元组在**两侧都唯一**
 *      （楼侧唯一 + 竞争候选侧唯一）才认领；否则判不了。
 *   4. 连续前缀：`inheritedPrefix` 只承认「位置与顺序都对齐」的前缀段——
 *      第 k 个候选必须恰好对上第 k 条记录；任何超出前缀段的匹配 ⇒ 不是前缀，必须抛。
 *
 * 【与源码差异】
 *   - TS/ESM 多文件协作 → 本仓经典脚本 IIFE + CJS 双导出（单类测试可 require）；
 *   - 取消 `_ACU` 后缀与 TS 类型；错误用本仓 `code` 挂载形态（不引入新错误基类）；
 *   - `entries`/`candidates` 的字段名保持源码口径（locator / rawFingerprint /
 *     canonicalFingerprint / sanitizerFingerprint / messageAnchor），**不重命名**——
 *     指纹口径跨模块必须一致，改名会让调用方以为语义变了。
 *
 * 【约束】纯函数：不修改入参、不读全局、不抛网络/存储异常；
 *   仅 `inheritedPrefix` 与前缀判定按契约抛（这是它的返回值语义，不是副作用）。
 */
    const FLOOR_MATCH_ISSUE_CODES = Object.freeze([
        'markerRejected',            // 有标记但状态不是 valid（foreign/invalid 之类）
        'markerConflict',            // 标记指向的 floorId 不在记录侧
        'duplicateMarker',           // 两条候选标记到同一楼
        'duplicateBinding',          // 绑定冲突（候选或楼已被占）
        'ambiguousLocatorCanonical', // locator 命中多楼且内容指纹相等 —— 判不了
        'ambiguousFingerprint',      // 全局（raw, canonical）对在任一侧不唯一 —— 判不了
    ]);

    const PREFIX_ERROR_CODES = Object.freeze(['FLOOR_MATCH_INVALID', 'NOT_PREFIX']);

    function fail(code, message) {
        const e = new Error(message);
        e.code = code;
        return e;
    }

    /** locator 三键全等才叫同一个位置。缺键按 undefined 比，不比「看起来像」。 */
    function sameLocator(left, right) {
        return left?.messageIndex === right?.messageIndex
            && left?.swipeId === right?.swipeId
            && left?.selectedSwipeIndex === right?.selectedSwipeIndex;
    }

    /** 记录侧的内容区（源码 `floor.content ?? {}` 同款：缺内容 = 空对象，不抛）。 */
    function contentOf(entry) {
        return entry?.content ?? {};
    }

    /**
     * 证明「记录侧」与「候选侧」的一对一映射。
     * @param entries   持久侧记录（须有 id / hostLocator / content.*Fingerprint）
     * @param candidates 宿主侧候选（须有 hostLocator / *Fingerprint / messageAnchor）
     * @returns {matches, candidateMatches, entryMatches, unmatchedCandidateIndexes,
     *           unmatchedEntryIndexes, issue}
     *   issue 为 null = 全程可证明；非 null = 判不了（含根因码与现场序号）。
     */
    function matchFloorCandidates(entries = [], candidates = []) {
        const entryList = Array.isArray(entries) ? entries : [];
        const candidateList = Array.isArray(candidates) ? candidates : [];
        const entryById = new Map(entryList.map((entry, entryIndex) => [entry?.id, { entry, entryIndex }]));
        const entryMatches = new Map();
        const candidateMatches = new Map();
        let issue = null;

        const note = (code, candidateIndex, entryIndex = null) => {
            if (issue) return;
            const candidate = candidateList[candidateIndex] ?? null;
            const entry = entryIndex === null ? null : entryList[entryIndex] ?? null;
            issue = Object.freeze({
                code,
                candidateIndex,
                entryIndex,
                markerStatus: candidate?.messageAnchor?.status ?? 'invalid',
                assistantSeq: entry?.assistantSeq ?? candidate?.assistantSeq ?? null,
                messageIndex: candidate?.hostLocator?.messageIndex ?? entry?.hostLocator?.messageIndex ?? null,
            });
        };

        const bind = (candidateIndex, entryIndex, kind) => {
            if (candidateMatches.has(candidateIndex) || entryMatches.has(entryIndex)) {
                note('duplicateBinding', candidateIndex, entryIndex);
                return false;
            }
            const candidate = candidateList[candidateIndex];
            const entry = entryList[entryIndex];
            const match = Object.freeze({
                candidate,
                candidateIndex,
                entry,
                entryIndex,
                kind,
                markerStatus: candidate?.messageAnchor?.status ?? 'invalid',
                locatorMatches: sameLocator(entry?.hostLocator, candidate?.hostLocator),
                rawFingerprintMatches: contentOf(entry).rawFingerprint === candidate?.rawFingerprint,
                canonicalFingerprintMatches: contentOf(entry).canonicalFingerprint === candidate?.canonicalFingerprint,
                sanitizerFingerprintMatches: contentOf(entry).sanitizerFingerprint === candidate?.sanitizerFingerprint,
            });
            candidateMatches.set(candidateIndex, match);
            entryMatches.set(entryIndex, match);
            return true;
        };

        // 段 1：显式标记先行预留（防「更早的无标记候选吃掉后面靠标记认领的楼」）。
        for (const [candidateIndex, candidate] of candidateList.entries()) {
            const marker = candidate?.messageAnchor;
            if (marker?.status === 'none') continue;
            if (marker?.status !== 'valid') { note('markerRejected', candidateIndex); continue; }
            const target = entryById.get(marker.anchor?.entryId ?? marker.anchor?.floorId);
            if (!target) { note('markerConflict', candidateIndex); continue; }
            if (entryMatches.has(target.entryIndex)) { note('duplicateMarker', candidateIndex, target.entryIndex); continue; }
            bind(candidateIndex, target.entryIndex, 'marker');
        }

        // 段 2：locator + 内容指纹（canonical 或 raw 其一相等即可）。
        for (const [candidateIndex, candidate] of candidateList.entries()) {
            if (candidateMatches.has(candidateIndex) || candidate?.messageAnchor?.status !== 'none') continue;
            const matches = entryList
                .map((entry, entryIndex) => ({ entry, entryIndex }))
                .filter(({ entry, entryIndex }) => !entryMatches.has(entryIndex)
                    && sameLocator(entry?.hostLocator, candidate?.hostLocator)
                    && (contentOf(entry).canonicalFingerprint === candidate?.canonicalFingerprint
                        || contentOf(entry).rawFingerprint === candidate?.rawFingerprint));
            if (matches.length === 1) {
                const entry = matches[0].entry;
                bind(candidateIndex, matches[0].entryIndex,
                    contentOf(entry).canonicalFingerprint === candidate?.canonicalFingerprint ? 'locatorCanonical' : 'locatorRaw');
            } else if (matches.length > 1) note('ambiguousLocatorCanonical', candidateIndex);
        }

        // 段 3：全局唯一 (raw, canonical) 对 —— 两侧都必须唯一，否则判不了。
        for (const [candidateIndex, candidate] of candidateList.entries()) {
            if (candidateMatches.has(candidateIndex) || candidate?.messageAnchor?.status !== 'none') continue;
            const matches = entryList
                .map((entry, entryIndex) => ({ entry, entryIndex }))
                .filter(({ entry, entryIndex }) => !entryMatches.has(entryIndex)
                    && contentOf(entry).rawFingerprint === candidate?.rawFingerprint
                    && contentOf(entry).canonicalFingerprint === candidate?.canonicalFingerprint);
            const competingCandidates = matches.length ? candidateList.filter((value, index) => !candidateMatches.has(index)
                && value?.messageAnchor?.status === 'none'
                && value.rawFingerprint === candidate.rawFingerprint
                && value.canonicalFingerprint === candidate.canonicalFingerprint) : [];
            if (matches.length === 1 && competingCandidates.length === 1) bind(candidateIndex, matches[0].entryIndex, 'uniqueFingerprint');
            else if (matches.length > 0) note('ambiguousFingerprint', candidateIndex);
        }

        return Object.freeze({
            matches: Object.freeze([...candidateMatches.values()].sort((left, right) => left.candidateIndex - right.candidateIndex)),
            candidateMatches,
            entryMatches,
            unmatchedCandidateIndexes: Object.freeze(candidateList.map((_, index) => index).filter((index) => !candidateMatches.has(index))),
            unmatchedEntryIndexes: Object.freeze(entryList.map((_, index) => index).filter((index) => !entryMatches.has(index))),
            issue,
        });
    }

    /**
     * 只承认**连续前缀**：第 k 个候选必须恰好对上第 k 条记录，且不得有前缀段之外的匹配。
     * 为什么必须抛而不是「尽量多取」：把中间断掉之后的记录也认下来，
     * 等于把「用户的第 5 楼」贴上「记录第 7 条」的标签——错位是静默的，事后无法回滚。
     * @returns {count, candidates, entries}（冻结）
     */
    function inheritedPrefix(source, candidates) {
        const matched = matchFloorCandidates(source?.entries ?? [], candidates);
        if (matched.issue) {
            throw fail('FLOOR_MATCH_INVALID', '持久记录与当前楼层无法安全对应（' + matched.issue.code + ' @ 候选 ' + matched.issue.candidateIndex + '）。');
        }
        let count = 0;
        while (count < candidates.length) {
            const match = matched.candidateMatches.get(count);
            if (!match || match.entryIndex !== count) break;
            count += 1;
        }
        if (matched.matches.some((match) => match.candidateIndex >= count || match.entryIndex >= count)) {
            throw fail('NOT_PREFIX', '候选楼层不是持久记录的连续前缀（前缀外仍存在可证明的匹配）。');
        }
        return Object.freeze({
            count,
            candidates: Object.freeze(candidates.slice(0, count)),
            entries: Object.freeze((source?.entries ?? []).slice(0, count)),
        });
    }

    /** 一行读数（诊断面用）：把「判到什么程度」压成一句话，判不了必须点名根因。 */
    function line(result) {
        if (!result) return '未判';
        if (result.issue) return '判不了（' + result.issue.code + ' @ 候选 ' + result.issue.candidateIndex + '）';
        const n = result.matches.length;
        const kinds = {};
        for (const match of result.matches) kinds[match.kind] = (kinds[match.kind] || 0) + 1;
        const parts = Object.keys(kinds).sort().map((k) => k + ' ' + kinds[k]);
        return '已证 ' + n + ' 对' + (parts.length ? '（' + parts.join(' / ') + '）' : '')
            + ' · 未认领候选 ' + result.unmatchedCandidateIndexes.length
            + ' / 未认领记录 ' + result.unmatchedEntryIndexes.length;
    }

    const api = Object.freeze({
        FLOOR_MATCH_ISSUE_CODES,
        PREFIX_ERROR_CODES,
        sameLocator,
        contentOf,
        matchFloorCandidates,
        inheritedPrefix,
        line,
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaFloorIdentity = api;
})(typeof window !== 'undefined' ? window : globalThis);