    /**
     * **章节成稿**（纯函数、零写）。[v3.341.0 · M4-X2]
     *   吃 review() 的产物（或任何同形回顾），出一篇**可读的章节回顾**：
     *     · sections[] 逐段带 kind 与 evidenceRef —— **逐段可跳回原文**；
     *     · text 是同一批段落的可读编排（**不是**把结构再抄一遍）；
     *     · source 两态：structure-only（离线结构成稿）/ polished（调用方给了真模型通道）；
     *       ★ **未调用真实模型只能报结构成稿，不报文风通过**（styleChecked 保持 false，
     *         且 styleNote 逐字写明）—— 这条正是验收原文点名要治的那一格。
     */
    function compose(rev, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const out = {
            kind: 'story_annual_draft', version: SA_VERSION, ok: false, ref: {}, title: '',
            sections: [], text: '', paragraphCount: 0, chars: 0,
            source: 'structure-only', modelUsed: false, styleChecked: false, styleNote: '',
            evidenceBound: 0, evidenceMissing: 0, evidenceUndecided: 0, evidenceTotal: 0,
            memoryUntouched: true, writesNothing: true, why: [],
        };
        const r = (rev && typeof rev === 'object') ? rev : null;
        if (!r || r.ok !== true) { out.why.push('no-review'); return out; }
        out.ref = Object.assign({}, r.ref);
        out.title = keyOf(r.title);
        const maxPer = Math.max(1, numOr(o.maxPerSection, 8));
        const secMax = numOr(o.sectionMax, 400);
        const push = function (kind, text, ref, floor, chars) {
            const s = sectionOf(kind, text, ref, floor, chars, secMax);
            if (s) out.sections.push(s);
        };
        push('title', keyOf(r.title), '', 0, []);
        push('summary', strOf(r.summary), '', 0, []);
        const els = (r.elements && typeof r.elements === 'object') ? r.elements : {};
        for (const it of arrOf(els.events).slice(0, maxPer)) {
            push('event', strOf(it && it.text), keyOf(it && it.evidenceRef), it && it.floor, it && it.chars);
        }
        for (const it of arrOf(els.changes).slice(0, maxPer)) {
            const c = keyOf(it && it.char);
            const from = keyOf(it && it.from);
            const to = keyOf(it && it.to);
            push('change', c + (from || to ? '：' + (from || '？') + ' → ' + (to || '？') : ''),
                keyOf(it && it.evidenceRef), it && it.floor, c ? [c] : []);
        }
        for (const it of arrOf(els.unfinished).slice(0, maxPer)) {
            push('unfinished', strOf(it && it.text), keyOf(it && it.evidenceRef), it && it.floor, []);
        }
        for (const it of arrOf(els.quotes).slice(0, maxPer)) {
            const sp = keyOf(it && it.speaker);
            push('quote', (sp ? sp + '：' : '') + strOf(it && it.text), keyOf(it && it.evidenceRef), it && it.floor, sp ? [sp] : []);
        }
        /* 逐段对账证据位：**有号且能在回顾的证据面上找到**才算「可跳回原文」。
         *   ★ 三条读数分开：bound（真对上）/ missing（段没号或对不上）/ undecided（证据面本身未判）。
         *     把三者压成一条会让「没证据」与「没看证据面」同形（本仓治过多轮的错读数）。 */
        const have = new Set(arrOf(r.evidence).map(function (e) { return keyOf(e && e.ref); }));
        for (const s of out.sections) {
            if (s.kind === 'title' || s.kind === 'summary') continue;   /* 章题 / 章述不是条目，无条目级证据位 */
            out.evidenceTotal += 1;
            if (!s.evidenceRef) { out.evidenceMissing += 1; continue; }
            if (!have.size) { out.evidenceUndecided += 1; continue; }
            if (have.has(s.evidenceRef)) out.evidenceBound += 1; else out.evidenceMissing += 1;
        }
        /* 可读编排：分节标题 + 逐段一行（**同一批段落**，不另造文本）。 */
        const lines = [];
        if (out.title) lines.push('# ' + out.title);
        const sum = out.sections.filter(function (s) { return s.kind === 'summary'; });
        for (const s of sum) lines.push(s.text);
        for (const kind of ['event', 'change', 'unfinished', 'quote']) {
            const list = out.sections.filter(function (s) { return s.kind === kind; });
            if (!list.length) continue;
            lines.push('## ' + (SECTION_LABEL[kind] || kind));
            for (const s of list) lines.push('- ' + s.text);
        }
        out.text = lines.join(NL + NL);
        out.paragraphCount = out.sections.length;
        out.chars = out.text.length;
        /* ★ 真实模型通道：**调用方给 polish（真模型）才算过模型**。
         *   给不出来 ⇒ 如实说「结构成稿」（styleChecked 保持 false，不报文风通过）。 */
        if (typeof o.polish === 'function') {
            let polished = null;
            try { polished = o.polish({ ref: out.ref, title: out.title, text: out.text, sections: out.sections.slice() }); }
            catch (_e) { polished = null; }
            const obj = (polished && typeof polished === 'object') ? polished : null;
            const pt = obj ? strOf(obj.text) : strOf(polished);
            if (pt && pt !== out.text) {
                out.text = pt;
                out.chars = pt.length;
                out.source = 'polished';
                out.modelUsed = true;
                out.styleChecked = (obj && obj.styleOk === true);
            } else {
                out.why.push('polish-no-change');
            }
        }
        out.styleNote = out.modelUsed
            ? (out.styleChecked ? '已过真实模型（调用方回报文风通过）' : '已过真实模型（调用方**未**回报文风结论 ⇒ 不报通过）')
            : '结构成稿：未调用真实模型 ⇒ **不报文风通过**';
        out.ok = out.sections.length > 0;
        if (!out.ok) out.why.push('no-sections');
        return out;
    }
