/* ---------------------------------------------------------------
     * 材料归一(**只读:缺字段如实留空,不猜**)
     *
     *   面(facet)判定走**两步,且两步都可见**:
     *     1 显式 `facet` ∈ FACETS ⇒ 用它(调用方最清楚这条是什么);
     *     2 否则按 `kind` 查 KIND_TO_FACET(同一真源的另一张视图);
     *     3 两步都不中 ⇒ `facet: ''` ⇒ 计入 **unclassified**(**不硬塞**成
     *       setting / constraint)。为什么宁可不分类:硬塞会让「这条其实没
     *       归面」这件事消失,而它恰恰是调用方最该知道的一类输入错误。
     *
     *   闸(默认不进包的两类,如实计数):
     *     · `restricted`(受限:当前视角 / 知情面不该知道)⇒ 不进包;
     *     · `future`(未发生:计划 / 打算 / 尚未落实)⇒ 不进包。
     *     两者**不是**「错」,是「此刻不带」;读数里逐条具名。
     * --------------------------------------------------------------- */
    /** 类别 → 面(与 FACETS 同源的第二张视图;不中的一律返回 '')。 */
    const KIND_TO_FACET = Object.freeze({
        appointment: 'appointment', meeting: 'appointment', agreement: 'appointment', rendezvous: 'appointment',
        place: 'place', location: 'place', scene: 'place', geo: 'place',
        person: 'participants', character: 'participants', participant: 'participants', actor: 'participants', cast: 'participants',
        relation: 'relation', relationship: 'relation', 'relation-change': 'relation', edge: 'relation',
        past: 'sharedPast', history: 'sharedPast', shared: 'sharedPast', memory: 'sharedPast', 'shared-past': 'sharedPast',
        promise: 'promise', commitment: 'promise', oath: 'promise', vow: 'promise',
        pov: 'pov', perspective: 'pov', viewpoint: 'pov', viewpointOwner: 'pov',
        item: 'item', object: 'item', prop: 'item', token: 'item',
        constraint: 'constraint', hard: 'constraint', rule: 'constraint', limit: 'constraint',
        setting: 'setting', lore: 'setting', canon: 'setting', reference: 'setting',
    });
    /** 面判定(两步;都不中 ⇒ '')。 */
    function facetFor(raw) {
        const r = (raw && typeof raw === 'object') ? raw : {};
        const explicit = keyOf(r.facet);
        if (FACETS.indexOf(explicit) >= 0) return { facet: explicit, facetRaw: explicit, via: 'explicit' };
        const kind = keyOf(r.kind);
        const hint = (kind && Object.prototype.hasOwnProperty.call(KIND_TO_FACET, kind)) ? KIND_TO_FACET[kind] : '';
        if (hint) return { facet: hint, facetRaw: kind, via: 'kind' };
        return { facet: '', facetRaw: kind, via: 'none' };
    }
    /**
     * 单条材料归一。`usable` 是**唯一**的进包前提(其余都是读数)。
     *   为什么不用「分数」:分数会让「这条为什么在包里」变成不可解释的数字
     *   (M4-X8 验收要的是**材料差异可解释**)。这里只用**面 + 楼层 + 任务优先级**
     *   三样可复算的东西说话。
     */
    function materialOf(raw, idx) {
        const r = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
        const f = facetFor(r);
        const floor = floorOf(r.floor);
        const futureRaw = r.future;
        const future = (futureRaw === true) || (keyOf(futureRaw) === 'true') || (keyOf(r.status) === 'future') || (keyOf(r.state) === 'planned');
        const restrictedRaw = r.restricted;
        const restricted = (restrictedRaw === true) || (keyOf(restrictedRaw) === 'true') || (keyOf(r.knowing) === 'restricted') || (keyOf(r.visibility) === 'restricted');
        const id = keyOf(r.id) || ('m' + String(idx));
        const conflictGroup = keyOf(r.conflictGroup);
        return {
            index: idx,
            id: id,
            facet: f.facet,
            facetRaw: f.facetRaw,
            facetVia: f.via,
            title: clip(r.title || r.text || r.snippet || '', SNIPPET_MAX),
            snippet: clip(r.snippet || r.detail || '', SNIPPET_MAX),
            source: (SOURCES.indexOf(keyOf(r.source)) >= 0) ? keyOf(r.source) : (keyOf(r.source) || 'unknown'),
            sourceRaw: keyOf(r.source),
            floor: floor,
            subject: keyOf(r.subject) || keyOf(r.about),
            conflictGroup: conflictGroup,
            version: numOr(r.version, null),
            restricted: restricted,
            future: future,
            usable: (f.facet !== '') && !restricted && !future,
            why: restricted ? 'restricted' : (future ? 'future' : (f.facet === '' ? 'unclassified' : '')),
        };
    }
    /**
     * 池归一:**上限有界**,畸形条目**丢弃并计数**(不猜、不修)。
     *   超上限的**如实计入 truncatedIn**(不是静默丢弃)。
     */
    function normalize(list) {
        const src = Array.isArray(list) ? list : [];
        const materials = [];
        let dropped = 0;
        let truncatedIn = 0;
        const seenIds = {};
        for (let i = 0; i < src.length; i++) {
            const raw = src[i];
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { dropped++; continue; }
            if (materials.length >= INVENTORY_MAX) { truncatedIn++; continue; }
            const m = materialOf(raw, i);
            /* 键去重(**同 id 重复给 = 同一份材料的两次登记**,只留首条,如实计数):
             *   为什么不是「后覆盖前」:两条内容可能不同 —— 谁覆盖谁都是**猜**。 */
            if (Object.prototype.hasOwnProperty.call(seenIds, m.id)) { dropped++; continue; }
            seenIds[m.id] = true;
            materials.push(m);
        }
        return { materials: materials, dropped: dropped, truncatedIn: truncatedIn };
    }
    /** 面序(任务优先级里的位次;未列入 ⇒ 末尾)。 */
    function facetRankOf(facet, task) {
        const pr = TASK_PRIORITY[task] || TASK_PRIORITY.advance;
        const i = pr.indexOf(facet);
        return i < 0 ? pr.length : i;
    }
    /**
     * 排序(**任务轴真正起作用的地方**)。
     *   两级键,都可复算:
     *     1 面优先级(按 task 的 TASK_PRIORITY 位次);
     *     2 同面内**楼层近远**(楼层大者靠前;楼层未知者**排最后** —— 不编 0)。
     *   稳定键:原下标(同面同楼保持调用方给的相对次序,不因排序抖动)。
     */
    function rank(materials, task) {
        const t = (TASKS.indexOf(keyOf(task)) >= 0) ? keyOf(task) : 'advance';
        const out = arrOf(materials).slice();
        for (const m of out) m.facetRank = facetRankOf(m.facet, t);
        out.sort((a, b) => {
            if (a.facetRank !== b.facetRank) return a.facetRank - b.facetRank;
            const fa = (a.floor === null) ? -1 : a.floor;
            const fb = (b.floor === null) ? -1 : b.floor;
            if (fa !== fb) return fb - fa;
            return a.index - b.index;
        });
        for (let i = 0; i < out.length; i++) out[i].order = i + 1;
        return { task: t, materials: out };
    }
    /**
     * 矛盾当前值处置(**只留新的那一条,其余具名而非静默丢弃**)。
     *   · 分组键:同 `conflictGroup`(非空)且**都可用**;
     *   · 胜者:楼层最大的一条(楼层都是 null ⇒ 取原序最前 —— **不编楼层**);
     *   · 败者:state 'superseded',带 `supersededBy`(具名胜者 id),**不进包**;
     *   · 为什么不是「两条都给」:读者会看到「人在 A 又在 B」,把矛盾当成了
     *     同时为真;为什么不是「悄悄丢掉」:那样调用方查不出自己喂了两条当前值。
     */
    function resolveConflicts(materials) {
        const groups = {};
        const list = arrOf(materials);
        for (const m of list) {
            if (!m.usable || !m.conflictGroup) continue;
            const g = m.conflictGroup;
            if (!groups[g]) groups[g] = [];
            groups[g].push(m);
        }
        const winnerOf = {};
        const superseded = [];
        for (const g of Object.keys(groups)) {
            const arr = groups[g];
            if (arr.length < 2) continue;
            let win = arr[0];
            for (const m of arr) {
                const wf = (win.floor === null) ? -1 : win.floor;
                const mf = (m.floor === null) ? -1 : m.floor;
                if (mf > wf) win = m;
            }
            winnerOf[g] = win.id;
            for (const m of arr) {
                if (m.id === win.id) continue;
                m.usable = false;
                m.state = 'superseded';
                m.supersededBy = win.id;
                m.why = 'superseded';
                superseded.push({ id: m.id, conflictGroup: g, supersededBy: win.id, floor: m.floor, title: m.title, facet: m.facet, source: m.source });
            }
        }
        return { materials: list, superseded: superseded, winnerOf: winnerOf };
    }