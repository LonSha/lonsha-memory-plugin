    /**
     * **无剧透成稿**（纯函数、零写）。[v3.341.0 · M4-X2]
     *   ★ 铁律与 forPlayer 同源：**绝不回退作者版**。去剧透未成立（未给可知性面 /
     *     没回顾 / 整篇裁空）⇒ ok:false + reason，由调用方显示「这一章暂时不能给玩家看」。
     *   ★ 且**不漏后续事实**：成稿只吃**本章放行后的面**，从不读载荷里的其他章
     *     （futureFactsLeaked 因此恒 0，并作为读数如实外供 —— 不是「相信它没读」）。
     */
    function composeForPlayer(rev, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const bad = function (why) {
            return {
                kind: 'story_annual_draft', version: SA_VERSION, ok: false, playerVersion: null, reason: why,
                ref: {}, title: '', sections: [], text: '', source: 'structure-only', styleChecked: false,
                leakedChars: [], futureFactsLeaked: 0, chaptersRead: 1, memoryUntouched: true, writesNothing: true,
                note: '不接作者版：去剧透未成立（' + why + '）',
            };
        };
        const fp = forPlayer(rev, o);
        if (!fp || fp.ok !== true) return bad((fp && fp.reason) || 'no-review');
        const fv = fp.version;
        if (!fv || typeof fv !== 'object') return bad('no-player-version');
        /* 用**放行后的面**当回顾：不再回作者面取一行料。 */
        const els = (fv.elements && typeof fv.elements === 'object') ? fv.elements : {};
        const free = {
            ok: true, ref: Object.assign({}, fv.ref), title: keyOf(fv.title), summary: strOf(fv.summary),
            elements: {
                events: arrOf(els.events).slice(), changes: arrOf(els.changes).slice(),
                unfinished: arrOf(els.unfinished).slice(), quotes: arrOf(els.quotes).slice(),
            },
            evidence: arrOf(fv.evidence).slice(),
        };
        const d = compose(free, o);
        if (d.ok !== true) return bad('no-sections');
        d.playerVersion = 'spoiler-free';
        d.note = '按事实可知性裁剪后的玩家版成稿（保留 ' + numOr(fp.kept, 0) + ' / 遮蔽 ' + numOr(fp.withheld, 0) + '）';
        /* ★ 读数如实外供（不是「相信它没读」）：成稿只吃**本章放行后的面**,
         *   从不读载荷里的其他章 ⇒ futureFactsLeaked 恒 0,并作为读数写出来。 */
        d.futureFactsLeaked = 0;
        d.chaptersRead = 1;
        /* 泄漏扫描：玩家版成稿正文里出现**名册里未放行的角色名** ⇒ 逐条具名（与两版面同一口径）。 */
        const known = arrOf(o.knownChars).map(keyOf).filter(Boolean);
        const body = d.text;
        const leaked = [];
        for (const nm of known) {
            let allowed = false;
            const decide = (typeof o.isAllowed === 'function') ? o.isAllowed : null;
            if (decide) { try { allowed = decide(nm) === true; } catch (_e) { allowed = false; } }
            else {
                const names = [];
                const collect = function (list, pick) { for (const it of arrOf(list)) for (const x of arrOf(pick(it))) names.push(keyOf(x)); };
                collect(els.events, function (x) { return x && x.chars; });
                collect(els.changes, function (x) { return (x && x.char) ? [x.char] : []; });
                collect(els.quotes, function (x) { return (x && x.speaker) ? [x.speaker] : []; });
                allowed = names.indexOf(nm) >= 0;
            }
            if (!allowed && nm && body.indexOf(nm) >= 0) leaked.push(nm);
        }
        d.leakedChars = leaked;
        if (leaked.length) d.why.push('leaked-chars');
        return d;
    }
    /**
     * **按章重建**（纯函数、零写）。[v3.341.0 · M4-X2]
     *   吃「草稿册 + 过期读数（staleRefs 的输出）」，把每章分到四格里：
     *     · rebuilt   —— 该章有证据段变了 ⇒ **需要重建**（逐条具名 ref 与理由）；
     *     · kept      —— 该章在过期读数里被判过 fresh ⇒ **原样保留**（不重写）；
     *     · gone      —— 该章不在新载荷里 ⇒ 整章过期，但**过期不等于删除**：草稿原样留着；
     *     · untouched —— 过期读数没提到它（判不了 ⇒ 不动它，也不假装它是 fresh）。
     *   ★ wholeBookRebuilt 恒 false：本函数**实现的就是**按章重建 —— 整本重写不在本面，
     *     把它读成 true 会把「改一章」错报成「整本重来」（验收原文点名要治的那一格）。
     */
    function rebuildAffected(drafts, stale, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const out = {
            kind: 'story_annual_rebuild', version: SA_VERSION, ok: false,
            rebuilt: [], kept: [], gone: [], untouched: [], drafts: [], why: [],
            staleCount: 0, missingChapters: 0, wholeBookRebuilt: false, writesNothing: true,
        };
        const list = Array.isArray(drafts) ? drafts : null;
        if (!list) { out.why.push('no-drafts'); return out; }
        const st = (stale && typeof stale === 'object') ? stale : null;
        if (!st) { out.why.push('no-stale-read'); return out; }
        if (!Array.isArray(st.staleRefs) && !Array.isArray(st.all)) { out.why.push('stale-face-absent'); return out; }
        out.staleCount = numOr(st.stale, 0);
        out.missingChapters = numOr(st.missingChapters, 0);
        const dirty = new Map();     /* chapterId -> [{ref, why}] */
        for (const s of arrOf(st.staleRefs)) {
            const cid = keyOf(s && s.chapter);
            if (!cid) continue;
            if (!dirty.has(cid)) dirty.set(cid, []);
            dirty.get(cid).push({ ref: keyOf(s && s.ref), why: keyOf(s && s.why) || 'hash-changed' });
        }
        const gone = new Set();
        for (const a of arrOf(st.all)) {
            if (keyOf(a && a.verdict) === 'missing') gone.add(keyOf(a && a.chapter));
        }
        /* 只报了「整章缺失」的条数、却没给具名章 ⇒ 判不了是哪一个 ⇒ 如实具名，不猜。 */
        if (!gone.size && out.missingChapters > 0) out.why.push('missing-chapter-unnamed');
        for (const d of list) {
            const cid = chapterKey(d && d.ref);
            if (!cid || cid === '//') { out.why.push('draft-without-ref'); continue; }
            if (gone.has(cid)) {
                out.gone.push({ chapter: cid, why: 'chapter-gone', note: '整章不在新载荷里：草稿原样保留（过期 != 删除）' });
                continue;
            }
            if (dirty.has(cid)) {
                const refs = dirty.get(cid);
                out.rebuilt.push({ chapter: cid, staleRefs: refs.length, why: refs[0] ? refs[0].why : 'hash-changed', refs: refs.slice(0, 12) });
                continue;
            }
            /* 该章在过期读数里有 fresh 记录 ⇒ 真判过「没变」，才进 kept。 */
            const judged = arrOf(st.all).some(function (a) {
                return keyOf(a && a.chapter) === cid && keyOf(a && a.verdict) === 'fresh';
            });
            if (judged) out.kept.push({ chapter: cid, why: 'no-stale-ref' });
            else out.untouched.push({ chapter: cid, why: 'not-in-stale-read' });
        }
        /* 草稿按原序原样外供（本面**不改草稿** —— 重建由调用方拿 rebuilt 名单去重跑 compose）。 */
        out.drafts = list.map(function (d) {
            const n = {};
            const src = (d && typeof d === 'object') ? d : {};
            for (const k of Object.keys(src)) n[k] = src[k];
            n.chapter = chapterKey(n.ref);
            return n;
        });
        out.ok = true;
        out.note = '按章重建：受影响 ' + out.rebuilt.length + ' / 未变 ' + out.kept.length
            + ' / 整章过期 ' + out.gone.length + ' / 未判 ' + out.untouched.length
            + '（**不做整本重写**：wholeBookRebuilt 恒 false）';
        return out;
    }
