/* ================================================================
 * project-registry.js — [v3.317.0 · M-X3] 项目 / 卷 / 章节管理面
 *
 * 【为什么需要这一面 / 修前缺口（不是「再建一份分卷账」）】
 *   `volume-continuation.js`（X7, v3.293.0）已经能把「上一卷说了什么、还剩什么、
 *   这一卷该接什么」落成可复算读数，也能产接续包 / 预览 / 提案 / 撤销。
 *   它缺的不是能力，是**用户层**：修前全仓 `normalizeProject` / `listVolumes` /
 *   `volumeAt` 在 `index.js` 里命中 **0 次** —— 内核在盘上，但**没有人能选项目**。
 *   后果逐条可指认：
 *     ① 「创建项目 / 给卷起名 / 把这一支挂到这个项目上」**没有落点**：
 *        项目只能靠调用方临时拼一个 `{ projectId, volumes }` 现喂，拼错了没人拦；
 *     ② 多个项目**并存时没有隔离读数**：两个项目各自的卷在读数上同形，
 *        「未选项目」与「选了但零条」也同形（X7 验収①要拦的正是这条）；
 *     ③ **同名角色跨宇宙**没有任何可判之处：X7 的 owner 键只有 id / name 两态，
 *        宇宙（universe）在全仓 `index.js` 命中 0 —— 于是「同一个名字在两个项目里
 *        是两个人」这件事在键上**不存在**，一旦靠名字对表就自然串了；
 *     ④ 导入幂等账与撤销来源边界散在调用方：包被导入两次没人知道，
 *        而「撤销」若没有来源范围就退化成「整批回滚」。
 *
 * 【与既有面的分工（互不重叠，逐条可指认）】
 *   volume-continuation.js  项目内体力：卷目录 / 接续包 / 预览 / 提案 / 撤销
 *   memory-package.js       跨设备迁移：代际三态 / 导入计划 / 悬空与边界
 *   branch-semantics.js     跨支边界：这条内容属哪一支
 *   本模块                   用户层：**项目在哪里、它包含什么、谁挂在它上面、
 *                            两个项目/两个身份能不能合并、这个包能不能进这个项目、
 *                            进来了能不能定向撤** —— 一律**只给读数与计划**，不落笔。
 *
 * 【四条验收逐条落点】
 *   ① 「未选项目时维持完全隔离」 —— `scopeOf()` 未选 ⇒ `selected:false` 且
 *      `verdict:'isolated'`；`planImport()` 在未选项目下**一律 blocked**。
 *      这是**结构上的**隔离，不是文案：两个项目之间的条目不经 `separateInquiry()`
 *      的显式读数就不可能撞上。
 *   ② 「同名角色、不同宇宙不合并」 —— `identityOf()` 的身份键**必须带 universe**
 *      （`u:<universe>|id:<owner>`），宇宙缺省取项目 id（**项目即宇宙**）；
 *      `mergable()` 对「同名不同宇宙」给出 `different-universe`，与「仅名字对得上」
 *      （`name-only`）**不同形** —— 两者处置相反（前者是两个世界，后者是同一世界里的候选）。
 *   ③ 「重复导入幂等；撤销有明确来源边界」 —— `importIdOf()` 由包身份件确定性派生，
 *      `planImport()` 重复导入报 `duplicate`（`ok:true`，是**正常读数**，
 *      不与被挡同形）；`revokeBoundaryOf()` 无来源件 ⇒ `unbounded` 且**一律拒撤**
 *      （无边界不能撤 —— 「撤销」不是「整批回滚」更不是「清库」）。
 *   ④ 「旧源删除后引用状态清楚，不伪装仍可跳转」 —— `relink()` **不重写判定**，
 *      把 `volume-continuation.resolveSourceState` 的读数如实镜像（单一真源）；
 *      内核缺席 ⇒ `indeterminate / liveness-unavailable`（不假装还在、不假装可跳）。
 *
 * 【三条纪律（与 knowledge-preview.js / extract-feedback.js 同规格）】
 *   ① **纯函数零写**：不改传入的 project / pack / seen（对象一律浅拷贝）；
 *   ② **不抛**：输入畸形一律降级为读数（malformed / indeterminate），绝不外抩；
 *   ③ **不猜**：判不开一律给 indeterminate（并带 decidable:false），不给冒充值。
 *
 * 【可移植性说明】
 *   机制动机来自「长篇项目需要一处能管住卷 / 章节 / 绑定与跨项目隔离的用户层」
 *   这一通用需求；实现按本仓规范重写，未复制任何外部代码。
 * ================================================================ */
(function (root) {
    'use strict';
    const PR_VERSION = 1;
    const PR_REGISTRY_VERSION = 1;
    const PR_KIND = 'project_registry';

    /** 项目三态：**归档（冻结）与解除绑定（清绑定）不是同一件事**。 */
    const PROJECT_STATES = Object.freeze(['active', 'archived', 'detached']);
    /** 绑定三类（会话 / 分支 / 角色）—— 一类不得压成「其他」。 */
    const BINDING_KINDS = Object.freeze(['session', 'branch', 'character']);
    /** 身份关联形态（与 X7 的 LINK 三态同族，但**本模块自持一份**：零依赖）。 */
    const LINK_MODES = Object.freeze(['by-id', 'by-name', 'none']);
    /** 作用域四态：未选项目 ⇒ isolated（**不是** same-project）。 */
    const SCOPE_VERDICTS = Object.freeze(['isolated', 'same-project', 'cross-project', 'indeterminate']);
    /** 合并判定五态：同名但不同宇宙 ⇒ 不合并，且理由与「仅名字对得上」不同形。 */
    const MERGE_VERDICTS = Object.freeze(['mergable', 'name-only', 'different-universe', 'different-owner', 'indeterminate']);
    /** 导入四态：重复导入是**正常读数**（幂等），不与被挡同形。 */
    const IMPORT_STATES = Object.freeze(['applied', 'duplicate', 'blocked', 'indeterminate']);
    /** 撤销来源边界三态：无边界 ⇒ 拒（无边界不能撤）。 */
    const BOUNDARY_STATES = Object.freeze(['bounded', 'unbounded', 'indeterminate']);
    /** 源引用状态镜像（与 X7 的 SOURCE 三态逐字同形，但**自持**：本模块不 require 它）。 */
    const SOURCE_STATES = Object.freeze(['live', 'source-deleted', 'unknown']);
    /** 绑定表上界（有界；满了如实报 binding-full，不静默丢）。 */
    const MAX_BINDINGS = 24;
    /** 唯一必需依赖：分卷接续内核是「源在不在」「撤销边界在哪」的**唯一**真源。 */
    const REQUIRED_DEPS = Object.freeze([
        { key: 'VOLUME_CONTINUATION', why: '分卷接续内核（volume-continuation.js::resolveSourceState）是「源还在不在」的唯一真源；缺席 ⇒ relink 一律 indeterminate（不假装还在、也不假装可跳转）' }
    ]);
    /** 可选依赖：**无**（本项目面在无头环境也必须自成一体）。 */
    const OPTIONAL_DEPS = Object.freeze([]);

    /* ── 基础工具（**自持一份，不引 X7 的 keyOf / numOf**：跨模块静默读旧值是本仓点过名的形态） ── */
    /** 取文本：未给一律空串，可选截断到 max。 */
    function _txt(v, max) {
        const s = (v === null || v === undefined) ? '' : String(v).trim();
        return (max && s.length > max) ? s.slice(0, max) : s;
    }
    /** 取整数：只认 number 与非空整数字串；其余如实 null（**不编 0**）。 */
    function _num(v) {
        if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : null;
        if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return Math.trunc(Number(v.trim()));
        return null;
    }
    function _isPlain(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
    /** djb2（与同族模块的哈希**形态不同**：这里只用于确定性键，不作校验和承诺）。 */
    function _hash(s) {
        const str = String(s);
        let h = 5381;
        for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
        return h.toString(36);
    }
    /** 绑定表归一：三类各自去重、有界；**不给的类别补空数组**（不是 null）。 */
    function _normBindings(raw) {
        const src = _isPlain(raw) ? raw : {};
        const out = { session: [], branch: [], character: [] };
        for (const k of BINDING_KINDS) {
            const v = src[k];
            const arr = Array.isArray(v) ? v : ((v === undefined || v === null || v === '') ? [] : [v]);
            const seen = {};   // ★ 每类**各自一份**（跳类共享会把「会话与角色同号」误去重）
            for (const x of arr) {
                const s = _txt(x, 80);
                if (!s || seen[s] === true) continue;
                seen[s] = true;
                if (out[k].length >= MAX_BINDINGS) break;
                out[k].push(s);
            }
        }
        return out;
    }
    function _withBindings(p, b) { return Object.assign({}, p, { bindings: b }); }
    function _pidOf(p) { return _isPlain(p) ? _txt(p.projectId !== undefined ? p.projectId : p.id, 80) : ''; }

    /* ──────────────────────────────────────────────────────────
     * ① 项目归一：id 非空是**唯一**的「这个项目被选中了」的证据
     * ────────────────────────────────────────────────────────── */
    /**
     * 归一项目描述，并把**绑定表**一并归一（会话 / 分支 / 角色三类）。
     *
     * ★ 为什么 id 是唯一证据：名字会重（两个项目都叫「长篇」），id 不会。
     *   一个名字漂亮但没有 id 的项目**一律当作没选** —— 把它当选中，
     *   就会以名字为轴去串条目，正是验收②（同名不同宇宙不合并）的反面。
     *
     * @param raw {projectId|id, title, universe, state, owner, bindings:{session,branch,character}, volumes}
     * @param opts { expectState }
     * @returns {{ok, reason, selected, project|null, volumeCount, chapterCount, bindings}}
     */
    function normalizeProject(raw, opts) {
        const o = _isPlain(opts) ? opts : {};
        const p = _isPlain(raw) ? raw : null;
        const empty = { ok: false, reason: 'no-project', selected: false, project: null,
            volumeCount: 0, chapterCount: 0, bindings: { session: [], branch: [], character: [] } };
        if (!p) return empty;
        const pid = _pidOf(p);
        if (!pid) return empty;
        const rawState = _txt(p.state, 40);
        /* ★ 表外状态**不落默认档**（静默当成 active 会把「归档了的项目」当活的使）。 */
        if (rawState && PROJECT_STATES.indexOf(rawState) < 0) {
            return Object.assign({}, empty, { reason: 'state-invalid', selected: true,
                project: null, badState: rawState });
        }
        const state = rawState || 'active';
        const volumes = Array.isArray(p.volumes) ? p.volumes.filter((v) => _isPlain(v)) : [];
        let chapters = 0;
        for (const v of volumes) if (Array.isArray(v.chapters)) chapters += v.chapters.filter((x) => _isPlain(x)).length;
        const bindings = _normBindings(p.bindings);
        const uni = _txt(p.universe, 80);
        const prj = {
            projectId: pid,
            title: _txt(p.title, 80) || pid,
            /* ★ 宇宙（universe）**缺省取项目 id**（项目即宇宙）——
             *   留着空会让下游拿「同一份空」去撞，等于取消了宇宙这一维。 */
            universe: uni || pid,
            universeExplicit: !!uni,
            state: state,
            owner: _txt(p.owner, 80) || null,
            bindings: bindings,
            volumes: volumes,
        };
        if (_txt(o.expectState, 40) && o.expectState !== state) {
            return { ok: false, reason: 'state-mismatch', selected: true, project: prj,
                volumeCount: volumes.length, chapterCount: chapters, bindings: bindings,
                actualState: state };
        }
        return { ok: true, reason: 'ok', selected: true, project: prj,
            volumeCount: volumes.length, chapterCount: chapters, bindings: bindings };
    }

    /* ──────────────────────────────────────────────────────────
     * ② 绑定：会话 / 分支 / 角色（三类不得压成「其他」）
     * ────────────────────────────────────────────────────────── */
    /**
     * 挂一个绑定（**纯函数**：返回新项目，不改入参）。
     * ★ 重复绑定是**正常读数**（`duplicate:true` / `ok:true`）——
     *   与「挂不上」（无效 kind / 值空 / 超上界）**不同形**。
     */
    function bindTo(project, kind, value, opts) {
        const o = _isPlain(opts) ? opts : {};
        const np = normalizeProject(project, o);   // 归一优先（id / state 两门都过）
        if (!np.ok) return { ok: false, reason: np.reason, project: null, kind: _txt(kind, 20),
            added: false, duplicate: false, count: 0 };
        const k = _txt(kind, 20);
        if (BINDING_KINDS.indexOf(k) < 0) {
            return { ok: false, reason: 'unknown-kind', project: np.project, kind: k,
                added: false, duplicate: false, count: 0, decidable: false,
                why: '绑定类别不在三类内（会话 / 分支 / 角色）—— 不落默认档（挂错表就撤不下来）' };
        }
        const v = _txt(value, 80);
        if (!v) return { ok: false, reason: 'empty-value', project: np.project, kind: k,
            added: false, duplicate: false, count: 0 };
        const b = _normBindings(np.project.bindings);
        const before = b[k].length;
        if (b[k].indexOf(v) >= 0) {
            return { ok: true, reason: 'duplicate', project: np.project, kind: k,
                added: false, duplicate: true, count: before,
                why: '已挂过（幂等：重复绑定不改动任何东西）' };
        }
        if (before >= MAX_BINDINGS) {
            return { ok: false, reason: 'binding-full', project: np.project, kind: k,
                added: false, duplicate: false, count: before, limit: MAX_BINDINGS };
        }
        b[k] = b[k].concat([v]);
        return { ok: true, reason: 'bound', project: _withBindings(np.project, b), kind: k,
            added: true, duplicate: false, count: b[k].length };
    }
    /**
     * 解除绑定。`kindOrAll` 给类别则解那一类，给 `'all'` / 不给则**全部解绑**。
     * ★ 解绑**不改项目状态** —— 这一点与「归档」（`state:'archived'`）**不同形**：
     *   解绑是「不挂在这个会话上了」（项目仍活），归档是「项目本身冻结了」。
     */
    function unbind(project, kindOrAll) {
        const np = normalizeProject(project, {});
        if (!np.ok) return { ok: false, reason: np.reason, project: null, removed: 0, byKind: {} };
        const b = _normBindings(np.project.bindings);
        const req = _txt(kindOrAll, 20);
        const all = !req || req === 'all';
        if (!all && BINDING_KINDS.indexOf(req) < 0) {
            return { ok: false, reason: 'unknown-kind', project: np.project, removed: 0, byKind: {},
                decidable: false };
        }
        const byKind = {};
        let removed = 0;
        for (const k of BINDING_KINDS) {
            if (all || k === req) { byKind[k] = b[k].length; removed += b[k].length; b[k] = []; }
            else byKind[k] = 0;
        }
        return { ok: true, reason: removed ? 'unbound' : 'nothing-bound',
            project: _withBindings(np.project, b), removed: removed, byKind: byKind };
    }
    /** 归档：冻结项目（**不**清绑定 —— 归档与解绑是两件事，不得互代）。 */
    function archiveProject(project, opts) {
        const o = _isPlain(opts) ? opts : {};
        const np = normalizeProject(project, {});
        if (!np.ok) return { ok: false, reason: np.reason, project: null, state: '', bindingsKept: 0 };
        const b = _normBindings(np.project.bindings);
        const kept = b.session.length + b.branch.length + b.character.length;
        const prj = Object.assign({}, np.project, { state: 'archived' });
        return { ok: true, reason: np.project.state === 'archived' ? 'already-archived' : 'archived',
            project: prj, state: 'archived', bindingsKept: kept,
            why: '归档只冻结 state；绑定照旧保留（归档与解绑是两件事）' };
    }
    /** 解除绑定（= unbind all 的语义化出口，带 `detached` 状态归一）。 */
    function detachProject(project) {
        const ub = unbind(project, 'all');
        if (!ub.ok) return { ok: false, reason: ub.reason, project: null, state: '', removed: 0 };
        const prj = Object.assign({}, ub.project, { state: 'detached' });
        return { ok: true, reason: ub.removed ? 'detached' : 'already-detached',
            project: prj, state: 'detached', removed: ub.removed,
            why: '解除绑定：清空三类绑定并置 state=detached（与归档不同形）' };
    }

    /* ──────────────────────────────────────────────────────────
     * ③ 卷 / 章节的**编辑**面（读取面走 X7 单一真源，不在本模块重写一份目录）
     * ────────────────────────────────────────────────────────── */
    /**
     * 读卷目录：**转发**给 X7 的 `listVolumes`（读取口径只有一份真源）。
     *   内核缺席 ⇒ `catalog-unavailable` + `decidable:false`（**不自己再列一遍** ——
     *   再列一遍就是第二份目录真源，两边一日不一致，导航键就会漂）。
     */
    function volumesOf(project, deps) {
        const d = _isPlain(deps) ? deps : {};
        const np = normalizeProject(project, {});
        if (!np.ok) return { ok: false, reason: np.reason, decidable: true, volumes: [], count: 0,
            chapterCount: 0, projectId: '', via: '' };
        const VC = _isPlain(d.VOLUME_CONTINUATION) ? d.VOLUME_CONTINUATION : null;
        if (!VC || typeof VC.listVolumes !== 'function') {
            return { ok: false, reason: 'catalog-unavailable', decidable: false,
                volumes: [], count: 0, chapterCount: 0, projectId: np.project.projectId, via: '',
                why: '分卷接续内核缺席 ⇒ 不自己再列一遍目录（本模块不留第二份导航真源）' };
        }
        try {
            const r = VC.listVolumes({
                projectId: np.project.projectId, title: np.project.title, volumes: np.project.volumes
            });
            return Object.assign({}, r, { via: 'volume-continuation', decidable: true });
        } catch (e) {
            return { ok: false, reason: 'catalog-thrown', decidable: false, volumes: [], count: 0,
                chapterCount: 0, projectId: np.project.projectId, via: 'volume-continuation' };
        }
    }
    /** 卷编号：没给 id 就用 `vol<n>`（与 X7 的 navKey 口径同形），编号以 1 起。 */
    function _volIdOf(v, index) { return _txt(v && v.id, 60) || ('vol' + index); }
    /**
     * 新增一卷（**纯函数**：返回新项目，不改入参）。
     * ★ 卷 id 重复 ⇒ 拒（`duplicate-volume`）：两个同 id 的卷会让导航键指向不倒。
     */
    function addVolume(project, vol, opts) {
        const o = _isPlain(opts) ? opts : {};
        const np = normalizeProject(project, {});
        if (!np.ok) return { ok: false, reason: np.reason, project: null, volumeId: '', count: 0 };
        const p = np.project;
        const list = Array.isArray(p.volumes) ? p.volumes.slice() : [];
        const v = _isPlain(vol) ? vol : {};
        const explicitId = _txt(v.id, 60);
        const index = list.length + 1;
        const vid = explicitId || ('vol' + index);
        if (explicitId && list.some((x) => _txt(x && x.id, 60) === explicitId)) {
            return { ok: false, reason: 'duplicate-volume', project: p, volumeId: explicitId, count: list.length };
        }
        const fs = _num(v.floorStart);
        const fe = _num(v.floorEnd);
        /* 起止颠倒 ⇒ 拒（把 20 当起点、 3 当终点的卷，后续排序与范围读数都不可信）。 */
        if (fs !== null && fe !== null && fs > fe) {
            return { ok: false, reason: 'range-inverted', project: p, volumeId: vid, count: list.length };
        }
        const rec = {
            id: vid,
            title: _txt(v.title, 80) || ('\u7b2c' + index + '\u5377'),
            floorStart: fs, floorEnd: fe,
            summary: _txt(v.summary !== undefined ? v.summary : v.text, 400),
            chapters: Array.isArray(v.chapters) ? v.chapters.filter((c) => _isPlain(c)).map((c, j) => ({
                id: _txt(c.id, 60) || ('ch' + (j + 1)),
                title: _txt(c.title, 80) || ('\u7b2c' + (j + 1) + '\u8282'),
                floor: _num(c.floor)
            })) : []
        };
        list.push(rec);
        return { ok: true, reason: 'volume-added', project: Object.assign({}, p, { volumes: list }),
            volumeId: vid, count: list.length, chapterCount: rec.chapters.length };
    }
    /** 按卷引用（序号 / id / navKey）定位；用 X7 口径（本模块只用序号与 id 两种轻引用）。 */
    function _volumeIndexAt(list, ref) {
        if (typeof ref === 'number' && Number.isFinite(ref)) return Math.trunc(ref) - 1;
        const s = _txt(ref, 80);
        if (!s) return -1;
        if (/^\d+$/.test(s)) return Number(s) - 1;
        return list.findIndex((v) => _txt(v && v.id, 60) === s);
    }
    /** 给某卷追加一节（**纯函数**）。卷找不到 ⇒ `no-volume`（不默认往第 1 卷塞）。 */
    function addChapter(project, volumeRef, ch, opts) {
        const np = normalizeProject(project, {});
        if (!np.ok) return { ok: false, reason: np.reason, project: null, volumeId: '', count: 0 };
        const p = np.project;
        const list = Array.isArray(p.volumes) ? p.volumes.slice() : [];
        const i = _volumeIndexAt(list, volumeRef);
        if (i < 0 || i >= list.length) return { ok: false, reason: 'no-volume', project: p, volumeId: '', count: 0 };
        const cur = list[i];
        const chs = Array.isArray(cur.chapters) ? cur.chapters.slice() : [];
        const c = _isPlain(ch) ? ch : {};
        const cid = _txt(c.id, 60) || ('ch' + (chs.length + 1));
        if (chs.some((x) => _txt(x && x.id, 60) === cid)) {
            return { ok: false, reason: 'duplicate-chapter', project: p, volumeId: _txt(cur.id, 60), count: chs.length };
        }
        chs.push({ id: cid, title: _txt(c.title, 80) || ('\u7b2c' + (chs.length + 1) + '\u8282'), floor: _num(c.floor) });
        list[i] = Object.assign({}, cur, { chapters: chs });
        return { ok: true, reason: 'chapter-added', project: Object.assign({}, p, { volumes: list }),
            volumeId: _txt(cur.id, 60), chapterId: cid, count: chs.length };
    }
    /** 重命名卷 / 章节（**纯函数**）；给空标题 ⇒ 拒（标题空着不如保留原名）。 */
    function renameVolume(project, volumeRef, title) {
        const np = normalizeProject(project, {});
        if (!np.ok) return { ok: false, reason: np.reason, project: null, volumeId: '' };
        const p = np.project;
        const list = Array.isArray(p.volumes) ? p.volumes.slice() : [];
        const i = _volumeIndexAt(list, volumeRef);
        if (i < 0 || i >= list.length) return { ok: false, reason: 'no-volume', project: p, volumeId: '' };
        const t = _txt(title, 80);
        if (!t) return { ok: false, reason: 'empty-title', project: p, volumeId: _txt(list[i].id, 60) };
        list[i] = Object.assign({}, list[i], { title: t });
        return { ok: true, reason: 'renamed', project: Object.assign({}, p, { volumes: list }),
            volumeId: _txt(list[i].id, 60), title: t };
    }

    /* ──────────────────────────────────────────────────────────
     * ④ 身份：**宇宙是身份键的一部分**（同名不同宇宙不得合并）
     * ────────────────────────────────────────────────────────── */
    /**
     * 取一个绑定对象 / 条目 owner 的身份键。
     *
     * ★ 身份键形态：`u:<universe>|id:<ownerId>` 或 `u:<universe>|name:<name>`。
     *   为什么把宇宙**放进键里**而不是另存一列：只要合并判定里漏传一次 universe，
     *   两个宇宙的同名角色就会在键上相等（隐式合并，无法被下游看见）。
     *   宇宙缺省取项目 id（项目即宇宙）；项目也没 id ⇒ `universe-unknown`（判不了）。
     *
     * @param owner {id|entityId|ownerId|name, universe} 或裸字符串（当作 id）
     * @param project 带 universe / projectId 的项目（作缺省宇宙）
     * @returns {{ok, reason, key, mode, id, name, universe, projectId, decidable}}
     */
    function identityOf(owner, project) {
        const np = normalizeProject(project, {});
        const baseUniverse = np.ok ? np.project.universe : '';
        const basePid = np.ok ? np.project.projectId : '';
        const o = _isPlain(owner) ? owner : { id: (owner === undefined || owner === null ? '' : owner) };
        const oid = _txt(o.entityId !== undefined ? o.entityId : (o.ownerId !== undefined ? o.ownerId : o.id), 80);
        const nm = _txt(o.name, 80);
        const uni = _txt(o.universe, 80) || baseUniverse;
        const pid = _txt(o.projectId, 80) || basePid;
        if (!uni) {
            return { ok: false, reason: 'universe-unknown', key: '', mode: 'none', id: oid, name: nm,
                universe: '', projectId: pid, decidable: false,
                why: '项目与实体都未给宇宙 ⇒ 判不了（不拿空宇宙当同一个世界）' };
        }
        if (!oid && !nm) {
            return { ok: false, reason: 'no-identity', key: '', mode: 'none', id: '', name: '',
                universe: uni, projectId: pid, decidable: false,
                why: '既无 id 也无名字 ⇒ 没有任何可比的轴（不拿空串当身份）' };
        }
        const mode = oid ? 'by-id' : 'by-name';
        /* ★ 键里**恒含宇宙**：宇宙不同 ⇒ 键必不同 ⇒ 同名不同宇宙在键上就分开了。 */
        const key = 'u:' + uni + '|' + (oid ? 'id:' + oid : 'name:' + nm);
        return { ok: true, reason: 'ok', key: key, mode: mode, id: oid, name: nm,
            universe: uni, projectId: pid, decidable: true };
    }

    /**
     * 作用域判定：两个身份 / 条目是不是在同一个项目里。
     * ★ 四态不得压格：
     *   `isolated`      —— **没选项目**（与「同一个项目」截然相反，不得同形）
     *   `same-project`  —— 同一个宇宙 + 同一个项目 id
     *   `cross-project` —— 宇宙不同 / 项目 id 不同（两个世界）
     *   `indeterminate` —— 宇宙未知（判不了）
     */
    function scopeOf(a, b, project) {
        /* ★ 项目门**在前**：未选项目 ⇒ 根本没有共享的项目域 ⇒ isolated。
         *   这一步**不受身份能不能判**影响（隔离是结构事实，不是身份推论）；
         *   否则会出现「没选项目」被读成「判不了」——而验收①点名的正是前者。 */
        const np = normalizeProject(project, {});
        const A0 = identityOf(a, project);
        const B0 = identityOf(b, project);
        if (!np.ok) {
            return { ok: true, reason: np.reason || 'no-project', verdict: 'isolated',
                decidable: true, isolated: true, aKey: A0.key, bKey: B0.key,
                why: '本会话未选项目 ⇒ 两个身份之间**不建立任何通道**（维持完全隔离）' };
        }
        const A = identityOf(a, project);
        const B = identityOf(b, project);
        if (!A.decidable || !B.decidable) {
            return { ok: false, reason: A.reason || B.reason, verdict: 'indeterminate',
                decidable: false, isolated: false, why: '身份判不了 ⇒ 不当作「同一个」也不当作「不同」' };
        }
        if (A.universe !== B.universe) {
            return { ok: true, reason: 'different-universe', verdict: 'cross-project', decidable: true,
                isolated: false, aKey: A.key, bKey: B.key, aUniverse: A.universe, bUniverse: B.universe };
        }
        if (A.projectId && B.projectId && A.projectId !== B.projectId) {
            return { ok: true, reason: 'different-project', verdict: 'cross-project', decidable: true,
                isolated: false, aKey: A.key, bKey: B.key, aProject: A.projectId, bProject: B.projectId };
        }
        return { ok: true, reason: 'ok', verdict: 'same-project', decidable: true, isolated: false,
            aKey: A.key, bKey: B.key, sameAxis: (A.mode === B.mode) ? A.mode : ('mixed:' + A.mode + '/' + B.mode) };
    }

    /**
     * 能不能合并（同名角色、不同宇宙的处理就在这里）。
     * ★ 五态各取不同处置：
     *   `mergable`           —— 同宇宙 + 同 id（真同一人，可以合）
     *   `name-only`          —— **仅名字对得上**（同宇宙）⇒ 候选，**永不自动合**
     *   `different-universe` —— 同名但两个宇宙 ⇒ **不是同一人**（永不合）
     *   `different-owner`    —— 同宇宙但两个不同的 id ⇒ 不同人
     *   `indeterminate`      —— 宇宙未知 ⇒ 判不了
     * ★ 把 `name-only` 与 `different-universe` 压成一态就会出现「同名即同一人」
     *   ——那正是验收②点名的失败形态。
     */
    function mergable(a, b, project, opts) {
        const o = _isPlain(opts) ? opts : {};
        const A = identityOf(a, project);
        const B = identityOf(b, project);
        if (!A.decidable || !B.decidable) {
            return { ok: false, reason: A.reason || B.reason, verdict: 'indeterminate',
                mayMerge: false, decidable: false, aKey: A.key, bKey: B.key,
                why: '身份判不了 ⇒ 不得合并（两个都不知道是什么的东西合起来更不知道）' };
        }
        if (A.universe !== B.universe) {
            return { ok: true, reason: 'different-universe', verdict: 'different-universe',
                mayMerge: false, decidable: true, aKey: A.key, bKey: B.key,
                aUniverse: A.universe, bUniverse: B.universe,
                why: '★ 同名不同宇宙 ⇒ **不是同一人**（合并就是把两个世界搯在一起）' };
        }
        if (A.id && B.id) {
            const same = (A.id === B.id);
            return { ok: true, reason: same ? 'same-id' : 'different-id', verdict: same ? 'mergable' : 'different-owner',
                mayMerge: same, decidable: true, aKey: A.key, bKey: B.key,
                why: same ? '同宇宙 + 同 id ⇒ 同一人' : '同宇宙但 id 不同 ⇒ 不同人（名字一样是重名）' };
        }
        /* 至少一侧只有名字。 */
        if (o.allowNameMerge === true && A.name && B.name && A.name === B.name) {
            return { ok: true, reason: 'name-merge-allowed', verdict: 'name-only', mayMerge: true,
                decidable: true, aKey: A.key, bKey: B.key, requiresConsent: true,
                why: '仅名字对得上，且调用方**显式**声明允许按名字合 —— 仍需用户认领' };
        }
        return { ok: true, reason: 'name-only', verdict: 'name-only', mayMerge: false, decidable: true,
            aKey: A.key, bKey: B.key, requiresConsent: true,
            why: '仅名字对得上 ⇒ 永不自动合（进候选表等人认领；默认 allowNameMerge=false）' };
    }

    /* ──────────────────────────────────────────────────────────
     * ⑤ 导入计划：幂等账由**调用方**持有（本模块不偷偷写第二份账）
     * ────────────────────────────────────────────────────────── */
    /**
     * 导入身份（确定性）：由包身份件拼出来 —— 同一份包 + 同一个项目 + 同一代
     *   ⇒ **恒同 id**。幂等地基就在这里（与本模块的 `seen` 无关）。
     *   `revision` 不给 ⇒ 以 `-` 占位（不编 0：0 是一个真实代际）。
     */
    function importIdOf(pack, project) {
        const p = _isPlain(pack) ? pack : {};
        const np = normalizeProject(project, {});
        const pid = np.ok ? np.project.projectId : '';
        const packId = _txt(p.packId, 80);
        const vol = _txt(p.volumeId, 80);
        const rev = (p.revision === undefined || p.revision === null || p.revision === '') ? '-' : _txt(p.revision, 40);
        const scope = _txt(p.scope !== undefined ? p.scope : p.license, 40) || 'faces';
        if (!packId && !vol) return { ok: false, reason: 'no-pack-identity', id: '', packId: '', volumeId: '', projectId: pid,
            why: '包没给 packId 也没给 volumeId ⇒ 无从判「是否导过」（不拿入参顺序当身份）' };
        return { ok: true, reason: 'ok', id: 'im_' + _hash(pid + '|' + packId + '|' + vol + '|' + rev + '|' + scope),
            packId: packId, volumeId: vol, revision: p.revision, projectId: pid, scope: scope };
    }

    /**
     * 导入计划（**零写**：只出计划，落笔归既有 owner 侧）。
     *
     * ★ 四条硬门（逐条对应 M-X3 验收）：
     *   ① 未选项目 ⇒ **一律 blocked**（`no-project`）—— 结构隔离的落点；
     *   ② 项目归档 / 已解绑 ⇒ blocked（`archived` / `detached`）；
     *   ③ 包已导过（`seen` 命中）⇒ `duplicate`（`ok:true`，**是正常读数**）；
     *   ④ 包来自其它宇宙 ⇒ **cross-universe** 阻。
     *
     * @param pack   接续包 / 包描述（取 packId / volumeId / scope / universe / entries）
     * @param project 目标项目
     * @param seen   已导过的 importId 列表（**调用方持有并回传**）
     * @param opts   { allowCrossUniverse }
     * @returns {{ok, reason, state, importId, projectId, volumeId, count, duplicate, entries:Array, decidable}}
     */
    function planImport(pack, project, seen, opts) {
        const o = _isPlain(opts) ? opts : {};
        const np = normalizeProject(project, {});
        const p = _isPlain(pack) ? pack : null;
        const base = { ok: false, reason: '', state: 'blocked', importId: '', projectId: '',
            volumeId: '', count: 0, duplicate: false, entries: [], decidable: true, zeroWrite: true };
        if (!np.ok) {
            return Object.assign({}, base, { reason: np.reason || 'no-project',
                why: '★ 未选项目 ⇒ 不产计划、也不产空计划（空计划会被读成「这卷确实没内容」）' });
        }
        const prj = np.project;
        if (prj.state === 'archived' || prj.state === 'detached') {
            return Object.assign({}, base, { reason: 'project-' + prj.state, projectId: prj.projectId,
                why: '项目已' + (prj.state === 'archived' ? '归档' : '解绑') + ' ⇒ 先激活再导（不静默写归档项）' });
        }
        if (!p) {
            return Object.assign({}, base, { reason: 'no-pack', projectId: prj.projectId });
        }
        const iid = importIdOf(p, prj);
        if (!iid.ok) {
            return Object.assign({}, base, { reason: iid.reason, projectId: prj.projectId,
                decidable: false, why: '包身份不足 ⇒ 判不了（不拿「这次没导过」冒充结论）' });
        }
        const seenArr = Array.isArray(seen) ? seen.map((x) => _txt(x, 120)).filter(Boolean) : [];
        if (seenArr.indexOf(iid.id) >= 0) {
            return Object.assign({}, base, { ok: true, reason: 'duplicate', state: 'duplicate',
                duplicate: true, importId: iid.id, projectId: prj.projectId, volumeId: iid.volumeId,
                why: '这份包已导过（幂等：重复导入是正常读数，不是失败）' });
        }
        /* ★ 宇宙不同 ⇒ 阻（不拿「包名与项目名对得上」当同一世界）。 */
        const packUni = _txt(p.universe, 80);
        if (packUni && packUni !== prj.universe) {
            if (o.allowCrossUniverse !== true) {
                return Object.assign({}, base, { reason: 'cross-universe', projectId: prj.projectId,
                    volumeId: iid.volumeId, importId: iid.id, packUniverse: packUni, projectUniverse: prj.universe,
                    why: '★ 包来自另一个宇宙 ⇒ 默认阻（允许时须显式 allowCrossUniverse 并留痕）' });
            }
        }
        const entries = Array.isArray(p.entries) ? p.entries.filter((e) => _isPlain(e)) : [];
        return {
            ok: true, reason: 'ok', state: 'applied', importId: iid.id,
            projectId: prj.projectId, volumeId: iid.volumeId,
            count: entries.length, duplicate: false, entries: entries,
            crossUniverse: !!(packUni && packUni !== prj.universe),
            decidable: true, zeroWrite: true,
            why: '计划不出笔（写法归 owner 侧）；调用方拿 importId 自行记 seen（本模块不偷偷写第二份导入账）'
        };
    }

    /* ──────────────────────────────────────────────────────────
     * ⑦ 撤销来源边界：**无边界不能撤**
     * ────────────────────────────────────────────────────────── */
    /**
     * 算撤销的来源边界。
     * ★ 为什么无边界一律拒：一个不知从哪导进来的撤销请求，能干的只有
     *   「把当前项目里的东西全删一遍」—— 那是清库，不是撤销（与 X7 的
     *   `revokeHandoff` 同一条纪律，但**边界形态更严**：这里还要求**项目维度**）。
     * @returns {{ok, reason, state, decidable, scope, axis, count}}
     */
    function revokeBoundaryOf(pack, project, opts) {
        const o = _isPlain(opts) ? opts : {};
        const np = normalizeProject(project, {});
        if (!np.ok) {
            return { ok: false, reason: np.reason || 'no-project', state: 'unbounded', decidable: true,
                scope: null, axis: [], count: 0,
                why: '未选项目 ⇒ 没有可撤的域（不是「没有要撤的」，是「不知道往哪儿撤」）' };
        }
        const p = _isPlain(pack) ? pack : {};
        const packId = _txt(p.packId, 80);
        const volumeId = _txt(p.volumeId, 80);
        const src = _isPlain(p.sourceRef) ? p.sourceRef : {};
        const session = _txt(src.session, 80);
        const branch = _txt(src.branch, 80);
        const version = _txt(src.version, 80);
        const axis = [];
        if (packId) axis.push('packId');
        if (volumeId) axis.push('volumeId');
        if (session) axis.push('sourceRef.session');
        if (branch) axis.push('sourceRef.branch');
        if (version) axis.push('sourceRef.version');
        if (!axis.length) {
            return { ok: false, reason: 'no-scope', state: 'unbounded', decidable: true, scope: null,
                axis: [], count: 0, narrowed: false,
                why: '★ 无来源件（包 id / 卷 id / 会话 / 分支 / 版本全缺）⇒ 一律拒撤：无边界不能撤' };
        }
        const scope = {
            projectId: np.project.projectId,
            packId: packId || null, volumeId: volumeId || null,
            sourceRef: (session || branch || version)
                ? { session: session || null, branch: branch || null, version: version || null } : null,
        };
        const narrowed = !!(packId || volumeId) || !!version;
        const entries = Array.isArray(o.appliedEntries) ? o.appliedEntries.filter((e) => _isPlain(e)) : null;
        let inScope = null;
        if (entries) {
            inScope = entries.filter((e) => {
                if (_txt(e.projectId, 80) && _txt(e.projectId, 80) !== np.project.projectId) return false;
                if (scope.packId && _txt(e.packId, 80) !== scope.packId) return false;
                if (scope.volumeId && _txt(e.volumeId, 80) !== scope.volumeId) return false;
                const er = _isPlain(e.sourceRef) ? e.sourceRef : {};
                if (session && _txt(er.session, 80) !== session) return false;
                if (branch && _txt(er.branch, 80) !== branch) return false;
                if (version && _txt(er.version, 80) !== version) return false;
                return true;
            });
        }
        return { ok: true, reason: 'bounded', state: 'bounded', decidable: true, scope: scope,
            axis: axis, narrowed: narrowed, count: inScope === null ? null : inScope.length,
            inScope: inScope === null ? null : inScope.map((e) => _txt(e.key, 60) || _txt(e.face, 40)),
            why: '有来源件 ⇒ 可撤；域外一条不动（给了 appliedEntries 则只圈出界内那些）' };
    }

    /* ──────────────────────────────────────────────────────────
     * ⑧ 源引用状态：**单一真源**在 X7，本模块只镜像
     * ────────────────────────────────────────────────────────── */
    /**
     * 源引用状态 —— 把 X7 `resolveSourceState` 的读数如实搬过来。
     * ★ **不重写判定**（重写就是第二份真源）；内核缺席 ⇒ `indeterminate /
     *   liveness-unavailable`（不假装还在、也不假装可跳转）。
     * ★ 三态与 X7 逐字同形（live / source-deleted / unknown），故下游只学一套词。
     */
    function relink(ref, liveSources, deps) {
        const d = _isPlain(deps) ? deps : {};
        const VC = _isPlain(d.VOLUME_CONTINUATION) ? d.VOLUME_CONTINUATION : null;
        if (!VC || typeof VC.resolveSourceState !== 'function') {
            return { ok: false, reason: 'liveness-unavailable', state: 'unknown', navigable: false,
                decidable: false, via: '',
                why: '分卷接续内核缺席 ⇒ 判不了（不假装还在、也不假装可跳；与代际迁移的 migration-unavailable 同纪律）' };
        }
        try {
            const r = VC.resolveSourceState(ref, liveSources);
            const st = SOURCE_STATES.indexOf(r.state) >= 0 ? r.state : 'unknown';
            return { ok: r.ok === true, reason: r.reason || '', state: st,
                navigable: r.navigable === true, versionShifted: r.versionShifted === true,
                sourceRef: r.sourceRef || null, decidable: true, via: 'volume-continuation',
                /* ★ 悬空与「判不了」不同形：unknown ⇒ 不可跳（不伪装）。 */
                why: (st === 'unknown') ? '活源表未给 ⇒ 判不了，不可跳转（不伪装）' : '' };
        } catch (e) {
            return { ok: false, reason: 'source-state-thrown', state: 'unknown', navigable: false,
                decidable: false, via: 'volume-continuation',
                why: '源状态判定抛错 ⇒ 降级为判不了（既不报可跳，也不报被删）' };
        }
    }

    /* ──────────────────────────────────────────────────────────
     * ⑨ 指派面：跟着卷走的条目该归哪个项目（同名不同宇宙不合并的落点）
     * ────────────────────────────────────────────────────────── */
    /**
     * 把一个条目指派到项目内的卷（用户层「把这段挂到这一卷上」）。
     * ★ 条目 owner 的身份键**必须**经 `identityOf` 算（带宇宙）——
     *   否则「同名不同宇宙」在这里就合并了。
     * 找不到卷 ⇒ `no-volume`；卷必填（不默认第 1 卷）。
     */
    function assignToVolume(project, volumeRef, owner, deps) {
        const np = normalizeProject(project, {});
        if (!np.ok) return { ok: false, reason: np.reason, decidable: true, volumeId: '', ownerKey: '' };
        const idn = identityOf(owner, np.project);
        if (!idn.ok) return { ok: false, reason: idn.reason, decidable: false, volumeId: '', ownerKey: '',
            why: idn.why };
        const vs = volumesOf(np.project, deps);
        if (!vs.ok) return { ok: false, reason: vs.reason, decidable: vs.decidable === true, volumeId: '',
            ownerKey: idn.key, why: vs.why || '' };
        const list = vs.volumes;
        const i = _volumeIndexAt(list, volumeRef);
        if (i < 0 || i >= list.length) {
            return { ok: false, reason: 'no-volume', decidable: true, volumeId: '', ownerKey: idn.key };
        }
        const v = list[i];
        return { ok: true, reason: 'assigned', decidable: true, volumeId: _txt(v.id, 60),
            navKey: _txt(v.navKey, 120), index: v.index, ownerKey: idn.key, mode: idn.mode,
            universe: idn.universe, projectId: np.project.projectId, via: 'volume-continuation',
            why: 'owner 键含宇宙 ⇒ 同名不同宇宙在指派面上也分开' };
    }

    /* ──────────────────────────────────────────────────────────
     * ⑩ 全体面读数：项目中立，不选任何项目
     * ────────────────────────────────────────────────────────── */
    /**
     * 两个项目之间的关系（在**没有选中任何项目**的前提下也能问）。
     * ★ 与 `scopeOf` 的区别：`scopeOf` 问「这两个身份在不在同一域」；
     *   本函数问「这两个项目本身是不是同一个（能不能合并）」—— 处置面不同。
     */
    function compareProjects(a, b) {
        const A = normalizeProject(a, {});
        const B = normalizeProject(b, {});
        if (!A.ok || !B.ok) {
            return { ok: false, reason: A.ok ? B.reason : A.reason, verdict: 'indeterminate',
                decidable: false, why: '任一侧项目 id 缺 ⇒ 判不了（不拿名字比项目）' };
        }
        const pa = A.project; const pb = B.project;
        if (pa.projectId === pb.projectId) {
            return { ok: true, reason: 'same-project', verdict: 'same', decidable: true,
                joinable: true, aUniverse: pa.universe, bUniverse: pb.universe };
        }
        if (pa.universe === pb.universe) {
            return { ok: true, reason: 'same-universe-different-project', verdict: 'siblings', decidable: true,
                joinable: false, aUniverse: pa.universe, bUniverse: pb.universe,
                why: '同一个宇宙里的两个项目 ⇒ 平行（**不自动合并**：同一世界的两条故事线）' };
        }
        return { ok: true, reason: 'different-universe', verdict: 'separate', decidable: true, joinable: false,
            aUniverse: pa.universe, bUniverse: pb.universe,
            why: '两个宇宙 ⇒ 永不合并（哪怕 id 同名）' };
    }

    /* ──────────────────────────────────────────────────────────
     * ⑪ 自述 · 自检 · 诊断行
     * ────────────────────────────────────────────────────────── */
    /** 自述面：四张常量表 + 口径自述 + 依赖在场读数（供诊断与下游消费）。 */
    function describe(deps) {
        const d = _isPlain(deps) ? deps : {};
        const missing = REQUIRED_DEPS.filter((r) => !d[r.key]).map((r) => r.key);
        const present = REQUIRED_DEPS.filter((r) => !!d[r.key]).map((r) => r.key);
        const optionalMissing = OPTIONAL_DEPS.filter((k) => !d[k]);
        return {
            version: PR_VERSION,
            registryVersion: PR_REGISTRY_VERSION,
            kind: PR_KIND,
            projectStates: PROJECT_STATES.slice(),
            bindingKinds: BINDING_KINDS.slice(),
            linkModes: LINK_MODES.slice(),
            scopeVerdicts: SCOPE_VERDICTS.slice(),
            mergeVerdicts: MERGE_VERDICTS.slice(),
            importStates: IMPORT_STATES.slice(),
            boundaryStates: BOUNDARY_STATES.slice(),
            sourceStates: SOURCE_STATES.slice(),
            maxBindings: MAX_BINDINGS,
            /* 四条不变量自述（面板与下游据此读口径）。 */
            universeInIdentityKey: true,
            archiveIsNotDetach: true,
            duplicateIsNormal: true,
            unboundedCannotRevoke: true,
            zeroWrite: true,
            offline: true,
            requiredDeps: REQUIRED_DEPS.map((r) => ({ key: r.key, why: r.why })),
            optionalDeps: OPTIONAL_DEPS.slice(),
            missingDeps: missing,
            presentDeps: present,
            optionalMissing: optionalMissing,
            /* 「判不了」与「没选」不得同形（本仓最贵的老账）。 */
            isolatedDistinctFromSame: SCOPE_VERDICTS.indexOf('isolated') >= 0
                && SCOPE_VERDICTS.indexOf('same-project') >= 0,
            indeterminateDistinct: SCOPE_VERDICTS.indexOf('indeterminate') >= 0,
        };
    }

    /**
     * 自检：**真跑**四条验收的承重分支（不只对常量自己断言）。
     * ★ 三条反向自证：
     *   · 未选项目 ⇒ 必定 isolated（且 planImport 必定 blocked）；
     *   · 同名不同宇宙 ⇒ 必定 different-universe（且 mayMerge false）；
     *   · 无来源件 ⇒ 必定 unbounded（且 ok false）。
     */
    function selfCheck(deps) {
        const out = { ok: true, problems: [], probes: {} };
        const probe = (name, fn) => {
            try { out.probes[name] = fn(); }
            catch (e) { out.ok = false; out.problems.push(name + ': ' + String((e && e.message) || e)); }
        };
        const d = _isPlain(deps) ? deps : {};
        const P1 = { projectId: 'p1', universe: 'u1', volumes: [{ id: 'v1', floorStart: 1 }] };
        const P2 = { projectId: 'p2', universe: 'u2' };
        /* 项目门：无 id ⇒ 未选（不落默认）。 */
        probe('noIdNotSelected', () => normalizeProject({ title: 'x' }).selected);
        probe('idSelected', () => normalizeProject(P1).selected);
        probe('badState', () => normalizeProject({ projectId: 'p', state: 'zzz' }).reason);
        /* 绑定三类各自可达 + 重复是正常读数。 */
        probe('bindSession', () => bindTo(P1, 'session', 's1').ok);
        probe('bindBranch', () => bindTo(P1, 'branch', 'b1').ok);
        probe('bindChar', () => bindTo(P1, 'character', 'c1').ok);
        probe('bindDup', () => bindTo(bindTo(P1, 'session', 's1').project, 'session', 's1').duplicate);
        probe('bindUnknownKind', () => bindTo(P1, 'zzz', 'x').reason);
        /* 归档与解绑不同形。 */
        probe('archive', () => archiveProject(bindTo(P1, 'session', 's1').project).state);
        probe('detach', () => detachProject(P1).state);
        /* ★ 验收①：未选项目 ⇒ isolated + planImport blocked。 */
        probe('isolated', () => scopeOf({ id: 'a' }, { id: 'b' }, null).verdict);
        probe('planBlocked', () => planImport({ packId: 'k', volumeId: 'v' }, null, []).state);
        /* ★ 验收②：同名不同宇宙 ⇒ different-universe（≠ name-only）。 */
        probe('diffUniverse', () => mergable({ name: '\u73a5', universe: 'u1' }, { name: '\u73a5', universe: 'u2' }, P1).verdict);
        probe('nameOnly', () => mergable({ name: '\u73a5', universe: 'u1' }, { name: '\u73a5', universe: 'u1' }, P1).verdict);
        /* ★ 验收③：重复导入是正常读数；无来源件拒撤。 */
        const iid = importIdOf({ packId: 'k1', volumeId: 'v1' }, P1).id;
        probe('dupImport', () => planImport({ packId: 'k1', volumeId: 'v1' }, P1, [iid]).state);
        probe('unbounded', () => revokeBoundaryOf({}, P1).state);
        /* ★ 验收④：内核缺席 ⇒ relink 判不了（不假装可跳）。 */
        probe('relinkAbsent', () => relink({ session: 's' }, ['x'], {}).state);
        probe('relinkLive', () => relink({ session: 's', branch: 'b', version: '1' },
            [{ session: 's', branch: 'b', version: '1' }], d).state);
        /* 身份键恒含宇宙。 */
        probe('keyHasUniverse', () => identityOf({ id: 'a' }, P1).key.indexOf('u:u1|') === 0);
        /* 两个宇宙的项目永不合并。 */
        probe('projectsSeparate', () => compareProjects(P1, P2).verdict);
        out.deps = { missing: describe(d).missingDeps, present: describe(d).presentDeps };
        out.version = PR_VERSION;
        return out;
    }

    /** 诊断一行 —— **六种坏法分开写**：模块没挂 / 依赖缺格 / 口径不自洽 / 未选项目 / 项目读数 / 空。 */
    function line(read, deps) {
        const r = _isPlain(read) ? read : {};
        if (r.moduleMissing) return '模块未加载（project-registry.js）';
        if (r.thrown) return '项目面读取异常（已降级，不外抩）';
        const d = describe(deps || r.deps);
        if (d.missingDeps.length) return '待用（面在位 · 依赖缺格：' + d.missingDeps.join('、') + ' ⇒ 目录与源状态一律判不了）';
        const np = normalizeProject(r.project, {});
        /* ★ 「未选项目（维持隔离）」必须与「选了但零条」**不同形**。 */
        if (!np.ok) return '未选项目（维持隔离）';
        const parts = ['项目「' + np.project.title + '」'];
        if (np.project.state !== 'active') parts.push('状态 ' + np.project.state);
        const b = np.bindings;
        const bc = b.session.length + b.branch.length + b.character.length;
        if (bc > 0) parts.push('绑定 ' + bc + '（会话 ' + b.session.length + '/分支 ' + b.branch.length + '/角色 ' + b.character.length + '）');
        parts.push('卷 ' + np.volumeCount);
        if (np.chapterCount > 0) parts.push('节 ' + np.chapterCount);
        const ic = _num(r.importCount);
        if (ic !== null && ic > 0) parts.push('已导 ' + ic + ' 次');
        if (r.duplicateCount > 0) parts.push('重复导入 ' + r.duplicateCount + '（幂等）');
        const st = _txt(r.sourceState, 40);
        if (st) parts.push('源 ' + st + (r.navigable === false ? '（不可跳转）' : ''));
        return parts.join(' · ');
    }

    /* ─────────── ⑫ 导出自洽（本档自检读数的指纹） ─────────── */
    /** 导出面指纹 —— 钉住「导出面被悄悄加宽 / 减项」这件事（只用导出名 + 值级形态）。 */
    function surfaceDigest(api) {
        const a = api || {};
        const names = Object.keys(a).sort();
        let h = 2166136261;
        const feed = (s) => {
            for (let i = 0; i < s.length; i++) {
                h ^= s.charCodeAt(i);
                h = Math.imul(h, 16777619);
            }
        };
        for (const n of names) {
            const v = a[n];
            const kind = Array.isArray(v) ? 'array:' + v.length
                : (v === null ? 'null' : typeof v);
            feed(n + '=' + kind + ';');
        }
        return { names: names, count: names.length, digest: ('0000000' + (h >>> 0).toString(16)).slice(-8) };
    }

    const api = Object.freeze({
        PR_VERSION, PR_REGISTRY_VERSION, PR_KIND,
        PROJECT_STATES, BINDING_KINDS, LINK_MODES, SCOPE_VERDICTS, MERGE_VERDICTS,
        IMPORT_STATES, BOUNDARY_STATES, SOURCE_STATES, MAX_BINDINGS,
        REQUIRED_DEPS, OPTIONAL_DEPS,
        normalizeProject, bindTo, unbind, archiveProject, detachProject,
        volumesOf, addVolume, addChapter, renameVolume,
        identityOf, scopeOf, mergable, compareProjects, assignToVolume,
        importIdOf, planImport, revokeBoundaryOf, relink,
        describe, selfCheck, line, surfaceDigest
    });
    /* ★ 显式挂浏览器全局（**不要**写成 `? window : this`：Node 下模块顶层 `this === module.exports`，
     *   全局会挂到 exports 上，宿主 `_moduleLib` 与无头套件两条取件路都读不到 —— v3.314.0 实测自伤）。 */
    if (root) {
        try { root.LonShaProjectRegistry = api; } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    return api;
})(typeof window !== 'undefined' ? window : globalThis);
