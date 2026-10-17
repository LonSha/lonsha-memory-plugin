/* ────────────────────────────────────────────────────────────
     * [v3.342.0 · M4-X3] **正史落卷面** —— 选择真正进入下一卷
     *
     * 【它补的是哪一格（M4-X3 验收原文逐条）】
     *   本模块修前有三面：逐冲突列举（conflicts）/ 逐冲突选择（setDecision）/
     *   交接预览（previewHandoff）。验收要的是「选择结局后**下一卷生成真正采用该结果**」。
     *   修前实测三处断链（不是「再加一个按钮」）：
     *     1 **包的形状接不上**（**病根在上游**）：`outcomeOf` 归一化条文时只留
     *       `key / title / floor / keeper / text` —— **面归属三格（face / 主 / 值）当场丢掉**。
     *       于是 `previewHandoff().pack.entries` 与 `volume-continuation` 要的
     *       **面归属形状**（face / ownerKey / link / value）之间**一处映射都没有**：
     *       下游拿这个包去接续，逐条被判「目标侧缺面」⇒ **一条也接不上**，
     *       而预览读数（ok / preview / packId）看着完全正常。本版两处一起修：
     *       上游 `outcomeOf` 原样带过面归属，本面再映射成接续形状。
     *     2 **确认没有凭据**：选择只活在宿主的计划容器里，没有「本次落卷叫什么」的稳定身份；
     *       重启之后无从判断「这次确认与上次是不是同一件事」⇒ 重复确认会重复落笔。
     *     3 **撤销没有保护面**：`revokeScopeOf` 只报「范围是 handoff-only」，
     *       不回答「这次撤销会动到哪些条目、哪些是原分支的、哪些是后来手工新增的」。
     *   ★ 与 previewHandoff 分工不同：previewHandoff 答「选了之后新卷带哪些**结局**」；
     *     planAdoption 答「这些结局**能不能变成下一卷接得上的条目**、缺什么格、叫什么名字」。
     *   ★ 本面**不落笔**：只出接续计划与凭据；真落笔仍走 volume-continuation / 器官的既有 owner。
     */
    /** 落卷三态（**穷尽且不同形**）。 */
    const ADOPT = Object.freeze({ READY: 'ready', BLOCKED: 'blocked', EMPTY: 'empty' });
    const ADOPT_LABEL = Object.freeze({ ready: '可接续', blocked: '未选尽', empty: '无可接条目' });
    /** 条目来源两态（**不得同形**）：来自选中结局还是并存结局。 */
    const ADOPT_SOURCES = Object.freeze(['chosen', 'coexisted']);
    const ADOPT_KIND = 'branch_canon_adoption';
    /**
     * 映射缺格三因。**三条分开报、不许压成一条「映射失败」**：
     *   把「没给面」与「没给主」压成同一个读数，下游就无从知道该补哪一格。
     */
    const UNMAPPED = Object.freeze({ NO_FACE: 'no-face', NO_OWNER: 'no-owner', NO_KEY: 'no-key' });
    /** 接续条目形状（与 volume-continuation 的 entries[] 同格；本面只**映射**、不落笔）。 */
    const ADOPT_ITEM_FIELDS = Object.freeze(['face', 'key', 'ownerKey', 'link', 'value', 'from', 'scope', 'evidenceRef']);
    /**
     * 一条结局条文 → 一条接续条目。★ 三条不可推断的格**具名**，绝不猜：
     *   · face  —— 未给 ⇒ no-face（猜面 = 把条目接到错误的账上）；
     *   · owner —— 未给 ⇒ no-owner（**拿 branch 当 owner 就是拿支线名冒充角色 id**）；
     *   · key   —— 未给 ⇒ no-key（与 volume-continuation 同口径：无键的条目不可寻址，
     *     进包就无从撤销）。
     *   吃两种形状：`outcomeOf` 归一化后的条文（面归属已拆成 face / entryKey / owner）
     *   与调用方直接给的**原形条文**（face / key / entityId / value）—— 两条都认，不另立第二套夹具。
     *   受限正文一律走本模块的**定长掩码**（与 filterByKeeper 同口径，不自建第二套权限算法）。
     */
    function adoptItemOf(raw, source, ctx) {
        const i = (raw && typeof raw === 'object') ? raw : {};
        const c = (ctx && typeof ctx === 'object') ? ctx : {};
        const ow = (i.owner && typeof i.owner === 'object') ? i.owner : null;
        const face = keyOf(i.face);
        if (!face) return { ok: false, why: UNMAPPED.NO_FACE };
        const id = keyOf(ow ? ow.id : (i.entityId !== undefined ? i.entityId : (i.ownerId !== undefined ? i.ownerId : '')));
        const nm = keyOf(ow ? ow.name : (i.name !== undefined ? i.name : ((typeof i.owner === 'string') ? i.owner : '')));
        if (!id && !nm) return { ok: false, why: UNMAPPED.NO_OWNER };
        /* ★ 归一化路径认 `faceKey`（**空即真无键**，不再 fallback —— `outcomeOf` 的
         *   `key` 字段带 'entry' 兜底值，拿它当键会把「无键条目」读成「有键叫 entry」，
         *   于是它混进包、撤销时无从定位）。原形路径才认 `key` / `field`。 */
        const hasFaceKeyField = Object.prototype.hasOwnProperty.call(i, 'faceKey');
        const rawKey = hasFaceKeyField ? i.faceKey : (i.key !== undefined ? i.key : i.field);
        const key = keyOf(rawKey);
        if (!key) return { ok: false, why: UNMAPPED.NO_KEY };
        const m = maskSecretBody(i, SECRET_BODY_KEYS);
        const v = m.value || i;
        /* ★ 值优先取条目自带的 value；没有则退回 text（outcomeOf 只保留 text 的裁剪本）。 */
        const val = (v.value !== undefined && v.value !== null) ? v.value
            : ((v.text !== undefined && v.text !== null && v.text !== '') ? v.text : null);
        return { ok: true, item: {
            face: face, key: key,
            ownerKey: id ? ('id:' + id) : ('name:' + nm),
            link: id ? 'by-id' : 'by-name',
            value: val,
            from: numOr(v.from !== undefined ? v.from : v.floor, null),
            scope: keyOf(v.scope) || null,
            evidenceRef: keyOf(v.evidenceRef) || null,
            title: clip(i.title || '', 60),
            source: (ADOPT_SOURCES.indexOf(keyOf(source)) >= 0) ? keyOf(source) : ADOPT_SOURCES[0],
            collision: keyOf(c.collision), branch: keyOf(c.branch),
            sensitive: m.masked > 0,
        } };
    }
    /**
     * 候选接续条目（**只读、零写**）：把选中 / 并存的结局条文映射成接续形状。
     *   五条读数**分开报**（少报一条就会把两种坏法读成一种）：
     *     · items        —— 映射成功、可进下一卷的条目；
     *     · unmapped     —— 被选中但**缺格**的条文（三种缺因具名）；
     *     · bareOutcomes —— 被选中却**一条条文都没有**的结局位（空条 ≠ 映射失败）；
     *     · skipped      —— 未被选中的结局：这是**正确**的跳过（验收2：仅选中者生效）；
     *     · pending      —— 未选尽的冲突位（有它在就不得接续）。
     */
    function adoptableItems(deps, rawPlan, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const plan = planCanon(deps, rawPlan, o);
        if (!plan.judged) {
            return { ok: false, judged: false, reason: 'no-deps', items: [], unmapped: [], bareOutcomes: [], skipped: [], pending: [], note: plan.note };
        }
        const lo = listOutcomes(deps);
        const pick = new Set();
        const chosenKeys = new Set();
        for (const c of plan.chosen) { pick.add(keyOf(c.key) + '#' + keyOf(c.branch)); chosenKeys.add(keyOf(c.key) + '#' + keyOf(c.branch)); }
        for (const c of plan.coexisted) pick.add(keyOf(c.key) + '#' + keyOf(c.branch));
        const items = [];
        const unmapped = [];
        const bareOutcomes = [];
        const skipped = [];
        const hit = new Set();
        for (const r of lo.rows) {
            if (!r.collision) {
                skipped.push({ key: '', branch: r.branch, title: r.title, why: 'unkeyed' });
                continue;
            }
            const kk = keyOf(r.collision) + '#' + keyOf(r.branch);
            if (!pick.has(kk)) {
                skipped.push({ key: r.collision, branch: r.branch, title: r.title, why: 'not-selected' });
                continue;
            }
            hit.add(kk);
            if (!r.items.length) {
                bareOutcomes.push({ key: r.collision, branch: r.branch, title: r.title, why: 'no-items' });
                continue;
            }
            const source = chosenKeys.has(kk) ? ADOPT_SOURCES[0] : ADOPT_SOURCES[1];
            for (const it of r.items) {
                const m = adoptItemOf(it, source, { collision: r.collision, branch: r.branch });
                if (m.ok) items.push(m.item);
                else unmapped.push({
                    key: r.collision, branch: r.branch, title: r.title,
                    item: clip(it.title || it.entryKey || it.key || '', 60), why: m.why,
                });
            }
        }
        /* ★ 计划里有、结局表里却找不到的选中项:同样不能静默消失(两处清单漂移的现场)。 */
        for (const c of plan.chosen.concat(plan.coexisted)) {
            const kk = keyOf(c.key) + '#' + keyOf(c.branch);
            if (hit.has(kk)) continue;
            bareOutcomes.push({ key: keyOf(c.key), branch: keyOf(c.branch), title: keyOf(c.title), why: 'outcome-absent' });
        }
        items.sort((a, b) => {
            const x = a.ownerKey + '|' + a.face + '|' + a.key;
            const y = b.ownerKey + '|' + b.face + '|' + b.key;
            return x < y ? -1 : (x > y ? 1 : 0);
        });
        return {
            ok: true, judged: true, reason: '',
            items: items, unmapped: unmapped, bareOutcomes: bareOutcomes,
            skipped: skipped, pending: plan.pending.slice(),
            itemCount: items.length, unmappedCount: unmapped.length,
            bareCount: bareOutcomes.length, skippedCount: skipped.length, pendingCount: plan.pending.length,
            note: '',
        };
    }