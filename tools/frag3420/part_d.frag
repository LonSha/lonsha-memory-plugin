/* ── [v3.342.0 · M4-X3] 落卷面六个真探针（全部吃真夹具、跑真函数） ── */
            /* ★ 1 形状可接：修前本面出的包 `entries[].face` 全 undefined ⇒ 下游一条也接不上。
             *   这里断言「映射出来的每条都带 face / ownerKey / key 三格」——形状断链的现场。 */
            adoptShapeOk: (function () {
                const cp = buildContinuePack(adoptProbeDeps(), adoptProbePlan(), { volumeId: 'v1' });
                const es = (cp.pack && cp.pack.entries) || [];
                return es.length > 0 && es.every((e) => keyOf(e.face) !== '' && keyOf(e.ownerKey) !== '' && keyOf(e.key) !== '');
            })(),
            /* ★ 2 三态不同形：ready / empty / blocked 各一个真现场，三者**互不相等**。
             *   把 empty 压进 blocked（或 ready 与 blocked 同形）是本面的核心坏法。 */
            adoptThreeStates: (function () {
                const deps = adoptProbeDeps();
                const ready = buildContinuePack(deps, adoptProbePlan(), { volumeId: 'v1' });
                /* 只选 k1，k2/k3 留着 ⇒ 未选尽 ⇒ blocked。 */
                const half = setDecision(null, { key: 'k1', decision: DECISION.CANON, branch: 'b1' }).plan;
                const blocked = buildContinuePack(deps, half, { volumeId: 'v1' });
                /* k9 的结局**一条条文都不带** ⇒ 选尽了也无可接条目 ⇒ empty。 */
                const bare = { BRANCH_OUTCOMES: [{ branch: 'b1', collision: 'k9', terminal: true, value: 'X' }], CONFIRMED_FACTS: {}, SECRET_BODY_KEYS: ['secret'] };
                const plan9 = setDecision(null, { key: 'k9', decision: DECISION.CANON, branch: 'b1' }).plan;
                const empty = buildContinuePack(bare, plan9, { volumeId: 'v1' });
                const vs = [ready.verdict, blocked.verdict, empty.verdict];
                return ready.verdict === ADOPT.READY && blocked.verdict === ADOPT.BLOCKED && empty.verdict === ADOPT.EMPTY
                    && new Set(vs).size === 3 && blocked.pack === null && empty.pack === null;
            })(),
            /* ★ 3 未选尽不出包：blocked 时 pack 必须为 null（不许拿半份选择去接续）。 */
            adoptBlockedNoPack: (function () {
                const half = setDecision(null, { key: 'k1', decision: DECISION.CANON, branch: 'b1' }).plan;
                const cp = buildContinuePack(adoptProbeDeps(), half, {});
                return cp.verdict === ADOPT.BLOCKED && cp.pack === null && cp.pendingCount > 0;
            })(),
            /* ★ 4 幂等键稳定：同一份选择重算恒同 adoptionId（重复确认不重复接续的地基）；
             *   换了卷必须换 id（否则「换一卷重确认」会被误判成重复）。 */
            adoptIdStable: (function () {
                const a = buildContinuePack(adoptProbeDeps(), adoptProbePlan(), { volumeId: 'v1' }).adoptionId;
                const b = buildContinuePack(adoptProbeDeps(), adoptProbePlan(), { volumeId: 'v1' }).adoptionId;
                const c = buildContinuePack(adoptProbeDeps(), adoptProbePlan(), { volumeId: 'v2' }).adoptionId;
                return a !== '' && a === b && a !== c;
            })(),
            /* ★ 5 缺格具名：三种缺因各出现且**分列**（不许压成一条「映射失败」）。
             *   注意 kC 那条**真的没有键**：修前 `outcomeOf` 给它兜底成 'entry'，
             *   于是「无键条目」混进可接集、撤销时无从定位 —— 本探针就是钉这个的。 */
            adoptUnmappedNamed: (function () {
                const deps = { BRANCH_OUTCOMES: [
                    { branch: 'b1', collision: 'kA', terminal: true, value: 'A', items: [{ key: 'x1', entityId: 'c1', value: '1' }] },
                    { branch: 'b2', collision: 'kB', terminal: true, value: 'B', items: [{ key: 'x2', face: 'unfinished', value: '2' }] },
                    { branch: 'b3', collision: 'kC', terminal: true, value: 'C', items: [{ face: 'unfinished', entityId: 'c3', value: '3' }] },
                ], CONFIRMED_FACTS: {}, SECRET_BODY_KEYS: ['secret'] };
                let p = setDecision(null, { key: 'kA', decision: DECISION.CANON, branch: 'b1' }).plan;
                p = setDecision(p, { key: 'kB', decision: DECISION.COEXIST, branch: '' }).plan;
                p = setDecision(p, { key: 'kC', decision: DECISION.COEXIST, branch: '' }).plan;
                const ad = adoptableItems(deps, p, {});
                const whys = new Set(ad.unmapped.map((u) => u.why));
                return whys.has(UNMAPPED.NO_FACE) && whys.has(UNMAPPED.NO_OWNER) && whys.has(UNMAPPED.NO_KEY) && ad.items.length === 0;
            })(),
            /* ★ 6 撤销保护面：手工条目与别批条目**一条不进可撤集**，且两条口径写成读数。 */
            adoptRevokeGuards: (function () {
                const g = revokeGuard([
                    { key: 'q1', face: 'unfinished', ownerKey: 'id:c1', packId: 'cp_1' },
                    { key: 'q2', face: 'unfinished', ownerKey: 'id:c2', packId: 'cp_9' },
                    { key: 'm1', face: 'unfinished', ownerKey: 'id:c3' },
                ], { revokeScope: { adoptionId: 'ca_1', packId: 'cp_1', volumeId: 'v1' } }, {});
                return g.revocableCount === 1 && g.foreignCount === 1 && g.manualCount === 1
                    && g.deletesManual === false && g.branchWrites === 0;
            })(),
            /* ★ 7 受限正文不进包：选**带 secret 的那条结局**（k1→b2），
             *   逐条序列化里不得出现受限正文（映射只取九格，`secret` 不被带过）。
             *   首版判据拿整个 pack 的 JSON 查 `hidden` —— 而 `hidden` 是本仓接续包的
             *   **合法读数键**，那是判据自己写错了（已改）。 */
            adoptMaskFixed: (function () {
                const deps = adoptProbeDeps();
                let p = setDecision(null, { key: 'k1', decision: DECISION.CANON, branch: 'b2' }).plan;
                p = setDecision(p, { key: 'k2', decision: DECISION.EXCLUDE, branch: '' }).plan;
                p = setDecision(p, { key: 'k3', decision: DECISION.EXCLUDE, branch: '' }).plan;
                const cp = buildContinuePack(deps, p, { volumeId: 'v1' });
                const es = (cp.pack && cp.pack.entries) || [];
                if (!es.length) return false;
                /* 该条**确实**来自带受限正文的那条结局（b2）——否则这条判据是空转。 */
                if (!es.some((e) => String((e.canonRef || {}).branch) === 'b2')) return false;
                return es.every((e) => JSON.stringify(e).indexOf('hidden') < 0);
            })(),