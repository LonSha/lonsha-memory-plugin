    /** 成稿**段落面**的草稿白名单（正文可编辑 = 验收原文「可编辑的章节回顾」）。
     *   与 `DRAFT_FIELDS`（作品元数据：题/述/选段/风格）分列，既有口径一字不动。 */
    const DRAFT_SECTION_FIELDS = Object.freeze(['sections']);
    /**
     * **编辑成稿草稿**（纯函数、返回新草稿；不改入参、不写账）。[v3.341.0 · M4-X2]
     *   · 事实位字段出现即 rejected 并逐字 draft-only（编辑的不是记忆）；
     *   · 未登记字段同样拒（不静默丢弃）；
     *   · ★ **段证据位不得被编辑掉**：改了正文而把 evidenceRef 抹掉 ⇒ 逐条报
     *     evidence-dropped 且 evidenceIntact:false —— 这就是「改正文不篡改记忆」
     *     的可机检形态（不是一句承诺）。
     *   · ★ **入参草稿自己夹带的事实位也不流传下去**：只对 patch 设防的写法，
     *     会让「记忆不被篡改」在 draft 这一侧只是句话（实测过：state 原样进 next）。
     */
    function applyEdits(draft, patch) {
        const out = {
            ok: false, state: null, changed: [], rejected: [], reason: '',
            memoryUntouched: true, evidenceIntact: true, writesNothing: true,
        };
        const d = (draft && typeof draft === 'object' && !Array.isArray(draft)) ? draft : null;
        const p = (patch && typeof patch === 'object' && !Array.isArray(patch)) ? patch : null;
        if (!d) return Object.assign(out, { reason: 'no-draft' });
        if (!p) return Object.assign(out, { reason: 'no-patch' });
        const allowed = DRAFT_FIELDS.concat(DRAFT_SECTION_FIELDS);
        const next = {};
        for (const k of Object.keys(d)) {
            if (FACT_FIELDS.indexOf(k) >= 0) {
                out.rejected.push({ key: k, why: 'draft-only', note: '入参草稿夹带的事实位不随编辑流传（事实不属于草稿）' });
                continue;
            }
            next[k] = d[k];
        }
        for (const k of Object.keys(p)) {
            if (FACT_FIELDS.indexOf(k) >= 0) {
                out.rejected.push({ key: k, why: 'draft-only', note: '事实位不属于草稿：改它得走记忆库的处置面' });
                continue;
            }
            if (allowed.indexOf(k) < 0) {
                out.rejected.push({ key: k, why: 'unknown-field', note: '未登记字段不得静默丢弃' });
                continue;
            }
            if (JSON.stringify(next[k]) !== JSON.stringify(p[k])) { next[k] = p[k]; out.changed.push(k); }
        }
        /* ★ 编辑前的段证据位必须**一条不少**地留在编辑后（正文可改，回源凭证不可抹）。
         *   逐条具名 ref ⇒「抹掉了哪一条」可查，不是只报一个 false。 */
        const before = arrOf(d.sections).map(function (s) { return keyOf(s && s.evidenceRef); }).filter(Boolean);
        const after = arrOf(next.sections).map(function (s) { return keyOf(s && s.evidenceRef); }).filter(Boolean);
        for (const r of before) {
            if (after.indexOf(r) < 0) {
                out.evidenceIntact = false;
                out.rejected.push({ key: 'sections', why: 'evidence-dropped', ref: r, note: '段证据位不得被编辑掉（改正文不篡改记忆的凭证）' });
            }
        }
        out.state = next;
        out.ok = out.changed.length > 0 || out.rejected.length > 0;
        out.reason = out.changed.length ? 'edited' : (out.rejected.length ? 'rejected-only' : 'no-change');
        return out;
    }
    /** 成稿面诊断一行（**四态分开**：没生成过 / 结构成稿 / 过了模型 / 玩家版被挡）。 */
    function composeLine(read) {
        try {
            if (!read || typeof read !== 'object') return '尚未生成过（成稿面 · 逐段回源 · 未调模型只报结构成稿）';
            if (read.blocked) return '玩家版被挡（去剧透未成立：' + keyOf(read.reason || '未知') + '）';
            const parts = ['成稿 ' + (read.modelUsed
                ? ('已过模型' + (read.styleChecked ? '(文风通过)' : '(文风未结论)'))
                : '结构成稿(未过模型)')];
            if (numOr(read.paragraphCount, null) !== null) parts.push('段 ' + numOr(read.paragraphCount, 0));
            if (numOr(read.evidenceBound, 0)) parts.push('回源 ' + numOr(read.evidenceBound, 0));
            if (numOr(read.evidenceMissing, 0)) parts.push('缺证 ' + numOr(read.evidenceMissing, 0));
            if (numOr(read.evidenceUndecided, 0)) parts.push('证据面未判 ' + numOr(read.evidenceUndecided, 0));
            if (numOr(read.rebuilt, 0)) parts.push('待重建章 ' + numOr(read.rebuilt, 0));
            if (numOr(read.gone, 0)) parts.push('整章过期 ' + numOr(read.gone, 0));
            if (arrOf(read.leakedChars).length) parts.push('泄露 ' + arrOf(read.leakedChars).length + ' 人');
            return parts.join(' · ');
        } catch (_e) { return '—(成稿面异常)'; }
    }
    /* ────────────────────────────────────────────────────────────
     * 草稿册的**持久化形态**（唯一真源）。
     *   「草稿按既有创作持久化方式保存」—— 但**形状不许由宿主现编**：
     *   宿主只负责把它塞进存档键，形状（字段白名单 / 版本 / 逐条章身份）只在本处声明。
     *   ★ 归一化**如实报丢弃数**（`drops`）：静默截断会让「草稿没存下来」与
     *     「草稿本来就没有」同形（本仓治过多次的错读数）。
     *   ★ 收的是**成稿形状**（title/summary/sections/style/note）：`applyEdits` 的白名单
     *     写什么，这里就收什么 —— 两处口径不同会让「编辑得了的存不下来」，
     *     而且这件事只在重开对话后才现形。
     * ──────────────────────────────────────────────────────────── */
    function normalizeDrafts(raw) {
        const out = { kind: DRAFT_KIND, version: SA_VERSION, drafts: [], drops: 0, why: [], writesNothing: true };
        const list = Array.isArray(raw) ? raw : ((raw && typeof raw === 'object' && Array.isArray(raw.drafts)) ? raw.drafts : null);
        if (!list) { out.why.push('no-drafts'); return out; }
        for (const d of list) {
            if (!d || typeof d !== 'object' || Array.isArray(d)) { out.drops += 1; continue; }
            const cid = chapterKey(d.ref);
            if (!cid || cid === '//') { out.drops += 1; continue; }
            const row = { chapter: cid, ref: Object.assign({}, d.ref) };
            /* 只收**草稿白名单字段**：事实位一概不收（与 applyEdits 同一口径）。 */
            for (const k of DRAFT_FIELDS.concat(DRAFT_SECTION_FIELDS)) if (d[k] !== undefined) row[k] = d[k];
            if (Array.isArray(row.sections)) row.sections = row.sections.map(function (s) {
                return { kind: keyOf(s && s.kind), text: strOf(s && s.text), evidenceRef: keyOf(s && s.evidenceRef) };
            });
            out.drafts.push(row);
        }
        out.ok = out.drafts.length > 0;
        if (!out.ok) out.why.push('no-usable-drafts');
        return out;
    }
    /** 草稿册诊断一行（**没存过 / 存了零条 / 存了若干**三态不同形）。 */
    function draftLine(read) {
        try {
            if (!read || typeof read !== 'object') return '尚未保存过草稿册（成稿可编辑 · 事实位一律不收）';
            const n = arrOf(read.drafts).length;
            const parts = ['草稿册 ' + n + ' 章'];
            if (numOr(read.drops, 0)) parts.push('⚠️ 丢弃 ' + numOr(read.drops, 0) + ' 条');
            if (!n) parts.push('(空册不算已保存)');
            return parts.join(' · ');
        } catch (_e) { return '—(草稿册异常)'; }
    }