    /**
     * **接续包**（M4-X3 验收1：「选择→预览→确认→重启→新卷问答/生成」五步里，前两步的落点）。
     *
     * 【为什么必须由本模块出这个包】下游 owner（`volume-continuation::handoffContinuation`）
     *   只认**面归属形状**；本模块的选择面只产**结局条文**。修前两者之间没有映射，于是
     *   「选了正史」在下游表现为「目标侧缺面、一条也接不上」——读数却全绿。
     *
     * 三态**不同形**（这是本面的核心口径）：
     *   · `ready`   —— 未选尽的冲突位为 0 且至少有一条可接条目 ⇒ 可以交接；
     *   · `blocked` —— 还有未选尽的冲突位 ⇒ **不出包**（`pack:null`），不拿半份选择去接续；
     *   · `empty`   —— 冲突都选尽了，但**一条可接条目都没有**（结局没带条文 / 条文缺格）
     *                 ⇒ 与 `blocked` **不同形**：这里不是「还没选」，是「选了也没东西可接」。
     *   把 `empty` 压进 `blocked`，用户会一直以为「还没选完」而不是「这批结局压根没带条文」。
     *
     * @returns {{ok:boolean, verdict:string, pack:object|null, items:Array, unmapped:Array,
     *   bareOutcomes:Array, pending:Array, adoptionId:string, writeNothing:boolean}}
     */
    function buildContinuePack(deps, rawPlan, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const ad = adoptableItems(deps, rawPlan, o);
        const base = {
            ok: false, judged: ad.judged !== false, verdict: ADOPT.BLOCKED,
            pack: null, items: [], unmapped: [], bareOutcomes: [], skipped: [], pending: [],
            adoptionId: '', masked: 0, writeNothing: true, note: '',
        };
        if (!ad.judged) {
            return Object.assign({}, base, { reason: 'no-deps', note: ad.note });
        }
        const plan = planCanon(deps, rawPlan, o);
        const volumeId = keyOf(o.volumeId);
        const sourceRef = {
            session: keyOf(o.session) || null,
            branch: keyOf(o.branch) || null,
            version: keyOf(o.version) || null,
            /* ★ 与 previewHandoff 的 packId 分列：那是「结局面」的指纹，这是**落卷**的凭据。 */
            canon: 'adopt',
        };
        const idKeys = ad.items.map((x) => x.ownerKey + ':' + x.face + ':' + x.key).sort();
        const adoptionId = 'ca_' + hash32(
            'v1|' + volumeId + '|' + (o.allowReplace === true ? 'R' : 'r') + '|' + (o.allowNameLink === true ? 'N' : 'n')
            + '|' + plan.chosen.map((c) => keyOf(c.key) + ':' + keyOf(c.branch)).join(',')
            + '|' + plan.coexisted.map((c) => keyOf(c.key) + ':' + keyOf(c.branch)).join(',')
            + '|' + idKeys.join(','));
        const pending = ad.pending.slice();
        const reason = pending.length ? 'pending-unresolved' : (ad.items.length ? '' : 'no-adoptable-items');
        const verdict = pending.length ? ADOPT.BLOCKED : (ad.items.length ? ADOPT.READY : ADOPT.EMPTY);
        const out = Object.assign({}, base, {
            judged: true, verdict: verdict, adoptionId: adoptionId, reason: reason,
            items: ad.items.slice(), unmapped: ad.unmapped.slice(), bareOutcomes: ad.bareOutcomes.slice(),
            skipped: ad.skipped.slice(), pending: pending,
            itemCount: ad.items.length, unmappedCount: ad.unmappedCount,
            bareCount: ad.bareCount, skippedCount: ad.skippedCount, pendingCount: pending.length,
            masked: ad.items.filter((x) => x.sensitive === true).length,
        });
        if (verdict !== ADOPT.READY) {
            return Object.assign(out, {
                ok: false,
                note: pending.length
                    ? ('还有 ' + pending.length + ' 处冲突未选 ⇒ 不得接续（不出包）')
                    : '冲突已选尽，但选中结局未带可接条目（空条 / 缺格具名在 bareOutcomes / unmapped）',
            });
        }
        const packId = 'cp_' + hash32(volumeId + '|' + adoptionId + '|' + idKeys.join(','));
        const entries = ad.items.map((x) => ({
            face: x.face, key: x.key, ownerKey: x.ownerKey, link: x.link,
            value: x.value, from: x.from, scope: x.scope, evidenceRef: x.evidenceRef,
            packId: packId, volumeId: volumeId || null, sourceRef: sourceRef,
            /* ★ 逐条带上「它从哪条结局来」：撤销时要按来源范围筛，只在包级记一次就无从实现。 */
            canonRef: { collision: x.collision, branch: x.branch, source: x.source },
        }));
        return Object.assign(out, {
            ok: true, reason: '',
            pack: {
                packId: packId, volumeId: volumeId || null,
                projectId: keyOf(o.projectId) || null,
                sourceRef: sourceRef,
                viewer: (o.viewer && typeof o.viewer === 'object') ? o.viewer : null,
                entries: entries,
                entryCount: entries.length,
                /* 面清单 + 缺面：下游 owner 按「目标侧缺面」逐条比，缺面必须**具名**带走。 */
                faces: Array.from(new Set(entries.map((x) => x.face))).sort(),
                absentFaces: [],
                hidden: 0,
                adoptionId: adoptionId,
            },
            note: '',
        });
    }
    /**
     * **落卷凭据**（M4-X3 验收4：确认之后重启，仍能判断「这次与上次是不是同一件事」）。
     *   `adoptionId` 只由**选择本身**决定（选中键集合 + 卷 + 两个开关）⇒ 同一份选择重算恒同 id。
     *   这就是「重复确认不重复接续」的地基：把 `adoptionId` 交给既有 seen 机制做幂等键即可。
     */
    function adoptionBrief(deps, rawPlan, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const plan = planCanon(deps, rawPlan, o);
        const cp = buildContinuePack(deps, rawPlan, o);
        return Object.freeze({
            kind: ADOPT_KIND, version: BC_VERSION,
            judged: cp.judged !== false,
            adoptionId: cp.adoptionId || '',
            verdict: cp.verdict || ADOPT.BLOCKED,
            preview: plan.judged === false ? PREVIEW.BLOCKED : plan.preview,
            volumeId: keyOf(o.volumeId) || null,
            packId: cp.pack ? cp.pack.packId : null,
            itemCount: cp.itemCount || 0,
            unmappedCount: cp.unmappedCount || 0,
            bareCount: cp.bareCount || 0,
            pendingCount: cp.pendingCount || 0,
            /* ★ 撤销范围在**确认时**就定下来（重启后仍可判）：这就是「凭据」的另一半。 */
            revokeScope: {
                adoptionId: cp.adoptionId || '',
                packId: cp.pack ? cp.pack.packId : null,
                volumeId: keyOf(o.volumeId) || null,
            },
            writeNothing: true,
            note: cp.note || '',
        });
    }
    /**
     * **撤销保护面**（M4-X3 验收3：本次撤销不删原分支或后来手工新增的事实）。
     *
     * 【它补的是哪一格】修前 `revokeScopeOf` 只答「范围是 handoff-only、branchWrites 恒 0」——
     *   那是一条**承诺**，不是可机检的形态：真正落地时按什么筛、哪些条目**必须留着**，
     *   一个字都没有。于是「撤销」很容易做成「把这个键上的条目全删」，
     *   连带删掉用户后来手工补的事实，以及别的支线接进来的条目。
     *
     * 本函数把「该撤什么 / 必须留住什么」摊成四张具名表：
     *   · `revocable`  —— 属于**本次**接续的条目（packId 相符）；
     *   · `keptForeign`—— 别的接续批次落的（packId 不同）：撤销本次**一条不动**；
     *   · `keptManual` —— **用户自己的**条目（无 packId）：绝不因撤销而消失；
     *   · `keptLater`  —— 本次之后手工新增的（无 packId 且晚于本次凭据）：同上，留着。
     *   ★ `deletesManual` 恒 false；`branchWrites` 恒 0 —— 两条都写进读数，不靠注释承诺。
     */
    function revokeGuard(entries, brief, opts) {
        const b = (brief && typeof brief === 'object') ? brief : {};
        const scope = (b.revokeScope && typeof b.revokeScope === 'object') ? b.revokeScope : b;
        const o = (opts && typeof opts === 'object') ? opts : {};
        const at = numOr(o.at, null);
        const mine = keyOf(scope.packId);
        const rows = arrOf(entries).filter((e) => e && typeof e === 'object');
        const revocable = [];
        const keptForeign = [];
        const keptManual = [];
        const keptLater = [];
        for (const e of rows) {
            const pid = keyOf(e.packId);
            const at2 = numOr(e.importedAt, null);
            const name = { key: keyOf(e.key), face: keyOf(e.face), ownerKey: keyOf(e.ownerKey), packId: pid || null };
            if (!pid) {
                /* 无来源范围 ⇒ 是**用户自己的**（或老数据）；本次撤销一律不碰。 */
                const later = (at !== null && at2 !== null && at2 > at);
                if (later) keptLater.push(Object.assign({}, name, { why: 'added-after-adoption', importedAt: at2 }));
                else keptManual.push(Object.assign({}, name, { why: 'no-source-scope' }));
                continue;
            }
            if (!mine || pid !== mine) {
                keptForeign.push(Object.assign({}, name, { why: 'other-adoption-scope' }));
                continue;
            }
            if (e.revoked === true) continue;   /* 已撤的不再计（幂等）。 */
            revocable.push(Object.assign({}, name, { why: 'in-scope' }));
        }
        return Object.freeze({
            kind: ADOPT_KIND + '_revoke_guard', version: BC_VERSION,
            scope: { adoptionId: keyOf(scope.adoptionId), packId: mine || null, volumeId: keyOf(scope.volumeId) || null },
            revocable: revocable, keptForeign: keptForeign, keptManual: keptManual, keptLater: keptLater,
            revocableCount: revocable.length, foreignCount: keptForeign.length,
            manualCount: keptManual.length, laterCount: keptLater.length,
            /* ★ 两条不可让步的口径写成读数（判据据此核，不靠注释）。 */
            deletesManual: false, branchWrites: 0,
            judged: (mine !== '') || (keyOf(scope.adoptionId) !== ''),
            note: mine ? '' : '凭据里没有 packId ⇒ 范围未定（不可撤销，也不许「全删」兜底）',
        });
    }
    /** 落卷人读面（标签一律出自 ADOPT_LABEL，不就地拼字串）。 */
    function adoptionLine(read) {
        const r = (read && typeof read === 'object') ? read : {};
        if (r.judged === false) return '落卷:未判(' + keyOf(r.reason || 'no-deps') + ')';
        const v = keyOf(r.verdict) || ADOPT.BLOCKED;
        const parts = [ADOPT_LABEL[v] || v];
        if (numOr(r.itemCount, 0)) parts.push('可接 ' + r.itemCount);
        if (numOr(r.pendingCount, 0)) parts.push('待选 ' + r.pendingCount);
        if (numOr(r.unmappedCount, 0)) parts.push('缺格 ' + r.unmappedCount);
        if (numOr(r.bareCount, 0)) parts.push('空条 ' + r.bareCount);
        return '落卷:' + parts.join(' / ');
    }