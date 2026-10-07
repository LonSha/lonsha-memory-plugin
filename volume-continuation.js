/**
 * volume-continuation.js — [v3.294.0 · X7] 长篇剧情分卷与选择性接续
 *
 * 【为什么需要这一面】
 *   本仓已有：卷摘要（memory-core 的三级金字塔 summaries → volumes → historical）、
 *   档案体检（archive-audit）、休眠唤醒（sleep-awaken）、增量书签与跨会话隔离。
 *   但「跨会话评测通过」**不等于**「自动共享所有记忆」——把评测环境里跑通的
 *   「全卷可读」当成产品默认，等于**悄悄取消了默认隔离**。X7 要的那一面是：
 *   用户**显式选**一个长篇项目与卷 → 拿到一份**带出处的接续包** → 在**新会话里先看
 *   冲突与缺面** → 再自己勾选要接续的事实。
 *   所以本模块的第一个出口不是「导出」，而是**归属**：没选项目 ⇒ 什么都产不出来。
 *
 * 【五个不可让步的口径（对着 X7 验收原文逐条）】
 *   ① 不选项目时**维持完全隔离**：`normalizeProject` 拿不到非空 projectId ⇒
 *      `buildContinuationPack` 一律 `ok:false / reason:'no-project'`，**不产包**。
 *      这里刻意**不**返回「空包 + ok:true」：空包会被下游读成「这卷确实没有可接续的
 *      事实」，而真相是「你根本没选项目」——两件事必须不同形。
 *   ② 同名不同宇宙**不合并**：条目身份一律 `id:<entityId>` 优先；只有名字的条目记
 *      `link:'by-name'`，在预览里进 `nameOnly` 候选，**永不**自动进入可导入集合。
 *      真要按名字接，必须调用方显式 `allowNameLink:true`，且读数上留痕。
 *   ③ 接续**重试不重复**：proposalId 由 `stableId(packId + 选中键)` 决定（确定性），
 *      同一份选择重试得到同一个 id；落笔走 X6 `confirmImport` 的 `seen` 幂等表，
 *      第二次调用回 `duplicate:true` 且 applied 不变。
 *   ④ **撤销有来源范围**：`revokeHandoff` 必须拿到 scope（sourceRef 或 packId /
 *      volumeId）。没 scope ⇒ 拒绝（`reason:'no-scope'`）——「撤销」不是「推倒重来」。
 *      带 scope 只撤来源在 scope 内的条目，范围外的**一条不动**；给多级 scope 时
 *      各维度取**与**（更窄），已撤条重复调用不再计（幂等）。
 *   ⑤ 秘密带**知识范围**：包内条目按 keeper 过滤（与 X6 同口径：实体 id 优先），
 *      挡掉的条数**必须计数可见**（`hidden` / `hiddenBy`），绝不静默少条。
 *
 * 【两条「不许伪装」的规矩】
 *   · 旧源删除后引用状态清楚：`resolveSourceState` 三态 live / source-deleted /
 *     unknown；只有 live（且版本未漂移）才 `navigable:true`。
 *     没给我们活源表 ⇒ **unknown**（判不了），不是 live——「不知道还在不在」与
 *     「还在」是两件事，前者不得可跳转。给了空表 ⇒ source-deleted（查了，没有）。
 *     版本漂移 ⇒ 仍是 live，但**旧锚点不可跳转**（`versionShifted:true`）。
 *   · 缺面与空面不同形：该面源侧没有 / 未许可 ⇒ 进 `absentFaces`；有面但零条 ⇒
 *     面在场、`count:0`。前者读作「没比」，后者读作「比了，确实没有」。
 *
 * 【边界（显式声明不做）】
 *   · 不自建持久化、不建外部数据库、不做云同步：包由调用方持有，落盘复用宿主既有
 *     存档路径（本仓治理：楼层归属单一真源在 ledger-replay）；
 *   · 不替用户合并、不猜「谁是对的」：目标已有不同值 ⇒ `undecided`，默认 skip；
 *     只有用户显式 `allowReplace:true` 才出 replace 提案；
 *   · 不切分支、不写分支：全部出口只读，落笔由调用方注入 applyFn 走既有 owner/epoch。
 *
 * 【与 X6 的关系】本模块**不重实现**受控交接三步：`handoffContinuation` 在拿到
 *   branch-semantics.js 时逐字复用它引出的 propose 结果做 precheck / confirm
 *   （跨模块契约由 D 段判据钉住）；X6 缺席时走本模块自持的同形退路——降级为
 *   「自己也能走完」，而不是「没它就抛」。
 *
 * 纪律：纯函数、零依赖、IIFE + CJS 双导出；三态归因 ok / absent / threw；绝不外抛。
 */
(function (root) {
    'use strict';
    const VOLUME_CONTINUATION_VERSION = 1;

    /** 导航可达性（诊断面单列，不与「有没有条目」混说）。 */
    const NAV = Object.freeze({ JUMPABLE: 'jumpable', NOT_NAVIGABLE: 'not-navigable' });
    /** 源引用状态三态。unknown 与 source-deleted 是两件事（没查 vs 查了没有）。 */
    const SOURCE = Object.freeze({ LIVE: 'live', DELETED: 'source-deleted', UNKNOWN: 'unknown' });
    /** 许可范围：接续包能带出哪些面。none 连包都不出。 */
    const LICENSE = Object.freeze({ FACES: 'faces', SUMMARY_ONLY: 'summary-only', NONE: 'none' });
    /**
     * 五面。**本模块自持一份，不引 X6 的常量**：跨模块引用常量会把两处的抬版变成
     *   一处悄悄读旧值的静默错（v3.292 三份副本漂移那一族的同形风险）。两处必须
     *   一致这件事由 D 段判据钉住（读 X6 导出真值逐项比对 + 破坏时翻红）。
     */
    const FACES = Object.freeze(['factVersion', 'characterState', 'unfinished', 'money', 'storyTime']);
    /** 连接模式：by-id 是唯一的「等价」；by-name 只作候选，绝不自动串。 */
    const LINK = Object.freeze({ ID: 'by-id', NAME: 'by-name', NONE: 'none' });
    /** 提案动作（与 X6 同三值，便于把提案交给 X6 的预检/确认）。 */
    const ACTION = Object.freeze({ ADD: 'add', REPLACE: 'replace', SKIP: 'skip' });
    /** 预览三档。 */
    const PREVIEW = Object.freeze({ OK: 'ok', WARN: 'warn', BLOCKED: 'blocked' });

    /** 名字/键归一（去首尾空白；非串给空串）。 */
    function keyOf(v) {
        return (typeof v === 'string') ? v.trim() : (v === null || v === undefined ? '' : String(v).trim());
    }
    /** 有限数（未给给 null，**不拿 0 冒充「就是 0」**）。 */
    function numOf(v) {
        if (v === null || v === undefined || v === '' || typeof v === 'boolean' || Array.isArray(v)) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    /** 文本化（缺省空串）。 */
    function strOf(v) { return (typeof v === 'string') ? v : (v === null || v === undefined ? '' : String(v)); }
    /** 稳定短 id（FNV-1a → base36）。同输入恒同输出 ⇒ 幂等的地基。 */
    function stableId(s) {
        const str = strOf(s);
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return h.toString(36);
    }
    /** 值等价（稳定串比较；循环引用 ⇒ false，不抛）。 */
    function sameValue(a, b) {
        try {
            return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
        } catch (_e) { return false; }
    }
    /** 安全执行（绝不外抛）。 */
    function safe(fn, fallback) {
        try { return fn(); } catch (_e) { return fallback; }
    }
    /**
     * 条目身份键。**实体 id 优先**：有 id 就是 `id:<id>`（同名异人靠它分开）；
     *   只有名字才退到 `name:<名>`，且**如实回报 link:'by-name'**——「按名字匹配」
     *   这件事本身有同名风险，必须能在读数上被看见。
     */
    function ownerKeyOf(e) {
        if (!e || typeof e !== 'object') return { key: '', link: LINK.NONE, name: '' };
        const id = keyOf(e.entityId !== undefined ? e.entityId : (e.ownerId !== undefined ? e.ownerId : e.id));
        if (id) return { key: 'id:' + id, link: LINK.ID, name: keyOf(e.name) };
        const nm = keyOf(e.name !== undefined ? e.name : e.owner);
        if (nm) return { key: 'name:' + nm, link: LINK.NAME, name: nm };
        return { key: '', link: LINK.NONE, name: '' };
    }
    /** 面内键（不含 owner）。 */
    function entryKeyOf(e) {
        if (!e || typeof e !== 'object') return '';
        return keyOf(e.face) + '|' + keyOf(e.key !== undefined ? e.key : e.field);
    }
    /** 全键（owner + 面 + 键）：导入/撤销/选择的寻址单位。 */
    function fullEntryKey(e) {
        if (!e || typeof e !== 'object') return '';
        const ok = keyOf(e.ownerKey) || ownerKeyOf(e).key;
        return ok + '|' + keyOf(e.face) + '|' + keyOf(e.key !== undefined ? e.key : e.field);
    }
    /**
     * 知识范围过滤（秘密带知识范围）。与 X6 `filterByKeeper` **同口径**：
     *   条目带 `keeperIds`（实体 id）/ `keeper`（名字）且观察者不在名单内 ⇒ 剔除。
     *   两侧都空 ⇒ 公开条，放行。剔除**计数可见**（hidden）——静默少条会把
     *   「被挡住」读成「本来就没有」，那正是泄密判定的反向错读。
     * 走名字命中的条数单列（byName）：**看不见的匹配风险比看得见的排除更危险**。
     * @returns {{visible:Array, hidden:number, hiddenBy:string, total:number, byName:number}}
     */
    function filterByKeeper(entries, viewer) {
        const list = Array.isArray(entries) ? entries : [];
        const vw = (viewer && typeof viewer === 'object') ? viewer : { id: keyOf(viewer) };
        const vId = keyOf(vw.id);
        const vName = keyOf(vw.name || vw.id);
        const visible = [];
        let hidden = 0;
        let byName = 0;
        let nameMatched = 0;
        for (const e of list) {
            if (!e || typeof e !== 'object') { visible.push(e); continue; }
            const ids = Array.isArray(e.keeperIds) ? e.keeperIds.map(keyOf).filter(Boolean) : [];
            const names = Array.isArray(e.keeper) ? e.keeper.map(keyOf).filter(Boolean)
                : (e.keeper === null || e.keeper === undefined ? [] : [keyOf(e.keeper)]);
            const isPublic = ids.length === 0 && names.length === 0;
            if (isPublic) { visible.push(e); continue; }
            let hit = false;
            if (vId && ids.indexOf(vId) >= 0) hit = true;
            if (!hit && names.length) {
                for (const n of names) {
                    if (n && n === vName) { nameMatched++; if (!vId || ids.indexOf(vId) < 0) byName++; hit = true; break; }
                }
            }
            if (hit) visible.push(e); else hidden++;
        }
        return { visible, hidden, hiddenBy: byName > 0 ? LINK.NAME : LINK.ID, total: list.length, byName, nameMatched };
    }

    /* ──────────────────────────────────────────────────────────
     * ① 归属：用户选择的长篇项目（没选 ⇒ 完全隔离）
     * ────────────────────────────────────────────────────────── */
    /**
     * 归一项目描述。projectId 非空是**唯一**的「这个项目被选中了」的证据 ——
     *   名字漂亮但没有 id 的项目一律当作「没选」（名字会重，id 不会）。
     * @returns {{ok:boolean, reason:string, selected:boolean, project:object|null, volumeCount:number, chapterCount:number}}
     */
    function normalizeProject(raw) {
        const p = (raw && typeof raw === 'object') ? raw : null;
        if (!p) return { ok: false, reason: 'no-project', selected: false, project: null, volumeCount: 0, chapterCount: 0 };
        const pid = keyOf(p.projectId !== undefined ? p.projectId : p.id);
        if (!pid) return { ok: false, reason: 'no-project', selected: false, project: null, volumeCount: 0, chapterCount: 0 };
        const vols = Array.isArray(p.volumes) ? p.volumes.filter(v => v && typeof v === 'object') : [];
        let chapters = 0;
        for (const v of vols) { if (Array.isArray(v.chapters)) chapters += v.chapters.filter(x => x && typeof x === 'object').length; }
        return {
            ok: true, reason: 'ok', selected: true,
            project: { projectId: pid, title: keyOf(p.title) || pid, owner: keyOf(p.owner) || null, volumes: vols },
            volumeCount: vols.length,
            chapterCount: chapters,
        };
    }
    /**
     * 卷/章节导航。排序口径：floorStart 升序（**没给的排在后面**，不拿 0 冒充首卷），
     *   同起始按 id 定序 ⇒ 同一份目录两次调用得到同一个 navKey（导航键必须可寻址且稳定）。
     * navKey 形态：`vol:<projectId>#<index>` / `ch:<projectId>#<卷号>.<节号>`。
     * @returns {{ok:boolean, reason:string, projectId?:string, volumes:Array, count:number, chapterCount:number}}
     */
    function listVolumes(catalog) {
        const c = (catalog && typeof catalog === 'object') ? catalog : null;
        if (!c) return { ok: false, reason: 'not-a-catalog', volumes: [], count: 0, chapterCount: 0 };
        const pid = keyOf(c.projectId !== undefined ? c.projectId : c.id);
        if (!pid) return { ok: false, reason: 'no-project', volumes: [], count: 0, chapterCount: 0 };
        const raw = Array.isArray(c.volumes) ? c.volumes.filter(v => v && typeof v === 'object') : [];
        if (!raw.length) return { ok: true, reason: 'no-volumes', projectId: pid, title: keyOf(c.title) || pid, volumes: [], count: 0, chapterCount: 0 };
        const sorted = raw.slice().sort((a, b) => {
            const fa = numOf(a.floorStart); const fb = numOf(b.floorStart);
            if (fa !== null && fb !== null && fa !== fb) return fa - fb;
            if (fa === null && fb !== null) return 1;
            if (fa !== null && fb === null) return -1;
            return keyOf(a.id).localeCompare(keyOf(b.id));
        });
        let chapterTotal = 0;
        const volumes = sorted.map((v, i) => {
            const index = i + 1;
            const vid = keyOf(v.id) || ('vol' + index);
            const chs = Array.isArray(v.chapters) ? v.chapters.filter(x => x && typeof x === 'object').map((ch, j) => ({
                index: j + 1,
                id: keyOf(ch.id) || ('ch' + (j + 1)),
                title: keyOf(ch.title) || ('第' + (j + 1) + '节'),
                floor: numOf(ch.floor),
                navKey: 'ch:' + pid + '#' + index + '.' + (j + 1),
            })) : [];
            chapterTotal += chs.length;
            return {
                index, id: vid,
                navKey: 'vol:' + pid + '#' + index,
                title: keyOf(v.title) || ('第' + index + '卷'),
                floorStart: numOf(v.floorStart), floorEnd: numOf(v.floorEnd),
                count: numOf(v.count),
                summary: strOf(v.summary !== undefined ? v.summary : v.text).slice(0, 400),
                nav: NAV.JUMPABLE,
                chapters: chs,
            };
        });
        return { ok: true, reason: 'ok', projectId: pid, title: keyOf(c.title) || pid, volumes, count: volumes.length, chapterCount: chapterTotal };
    }
    /** 按引用取卷：数字 / 纯数字串 = 1 起的序号；串 = navKey 或卷 id。取不到给 null。 */
    function volumeAt(catalog, ref) {
        const list = listVolumes(catalog);
        if (!list.ok) return null;
        const r = ref;
        if (typeof r === 'number' || (typeof r === 'string' && /^[0-9]+$/.test(r.trim()))) {
            const i = Math.round(Number(r));
            return list.volumes.find(v => v.index === i) || null;
        }
        const s = keyOf(r);
        if (!s) return null;
        return list.volumes.find(v => v.navKey === s || v.id === s) || null;
    }

    /* ──────────────────────────────────────────────────────────
     * ② 接续包：带源会话/分支/版本、许可范围与证据 ref
     * ────────────────────────────────────────────────────────── */
    /**
     * 构建接续包（**只读**，不落笔）。
     * @param {object} args
     *   · project    —— 用户选中的项目（无 id ⇒ 不产包）
     *   · volumeRef  —— 卷引用（默认第 1 卷）
     *   · faces      —— 五面素材：{ factVersion: [条目...], ... }；**键缺席 = 缺面**
     *   · license    —— 许可范围（默认 faces；none ⇒ 拒；summary-only ⇒ 只带卷摘要）
     *   · viewer     —— 观察者（用于知识范围过滤）
     *   · sources    —— { session, branch, version }（源标识，缺省记 null 不假装有）
     * @returns {{ok:boolean, reason:string, pack:object|null, absentFaces:Array, hidden:number, hiddenBy:string}}
     */
    function buildContinuationPack(args) {
        const a = (args && typeof args === 'object') ? args : {};
        const none = { ok: false, reason: '', pack: null, absentFaces: [], hidden: 0, hiddenBy: LINK.NONE };
        const np = normalizeProject(a.project);
        if (!np.ok) return Object.assign({}, none, { reason: np.reason });
        const proj = np.project;
        const lic = keyOf(a.license) || LICENSE.FACES;
        if (lic === LICENSE.NONE) return Object.assign({}, none, { reason: 'license-none' });
        const catalog = { projectId: proj.projectId, title: proj.title, volumes: proj.volumes };
        const vol = volumeAt(catalog, a.volumeRef === undefined || a.volumeRef === null ? 1 : a.volumeRef);
        if (!vol) return Object.assign({}, none, { reason: 'no-volume' });
        const src = (a.sources && typeof a.sources === 'object') ? a.sources : {};
        const sourceRef = {
            session: keyOf(src.session) || null,
            branch: keyOf(src.branch) || null,
            version: keyOf(src.version) || null,
        };
        const viewerRaw = (a.viewer && typeof a.viewer === 'object') ? a.viewer : null;
        const viewer = viewerRaw ? { id: keyOf(viewerRaw.id), name: keyOf(viewerRaw.name || viewerRaw.id) } : null;
        const faceSrc = (a.faces && typeof a.faces === 'object') ? a.faces : {};

        const absentFaces = [];
        const faceInfo = {};
        const entries = [];
        const evidence = [];
        let hidden = 0;
        let byName = 0;
        const narrowed = (lic === LICENSE.SUMMARY_ONLY);

        for (const f of FACES) {
            if (narrowed) {
                // 许可被收窄：**每一面都要点名**，不能因为「没带」就静默消失。
                faceInfo[f] = { present: false, reason: 'license-summary-only', count: 0, hidden: 0 };
                absentFaces.push({ face: f, reason: 'license-summary-only' });
                continue;
            }
            const raw = faceSrc[f];
            if (!Array.isArray(raw)) {
                // 缺面 ≠ 空面：源侧压根没给这一面（可能没装模块、可能没导出）。
                faceInfo[f] = { present: false, reason: 'face-absent', count: 0, hidden: 0 };
                absentFaces.push({ face: f, reason: 'face-absent' });
                continue;
            }
            const flt = filterByKeeper(raw, viewer);
            hidden += flt.hidden;
            if (flt.hiddenBy === LINK.NAME) byName++;
            let n = 0;
            for (const e of flt.visible) {
                if (!e || typeof e !== 'object') continue;
                const ok0 = ownerKeyOf(e);
                const key = keyOf(e.key !== undefined ? e.key : e.field);
                if (!key) continue;   // 无键的条目**不可寻址**，不进包（进包就会在撤销时无从定位）
                const rec = {
                    face: f,
                    key: key,
                    ownerKey: ok0.key,
                    link: ok0.link,
                    value: (e.value === undefined ? null : e.value),
                    from: numOf(e.from !== undefined ? e.from : e.floor),
                    scope: keyOf(e.scope) || null,
                    evidenceRef: keyOf(e.evidenceRef) || null,
                    packId: null,
                    volumeId: vol.id,
                    sourceRef: sourceRef,
                };
                entries.push(rec);
                if (rec.evidenceRef) evidence.push(rec.evidenceRef);
                n++;
            }
            faceInfo[f] = { present: true, reason: 'ok', count: n, hidden: flt.hidden };
        }

        const sig = proj.projectId + '#' + vol.id + '#' + lic + '#' +
            entries.map(e => e.ownerKey + ':' + e.face + ':' + e.key).sort().join(',');
        const packId = 'pk_' + stableId(sig);
        for (const e of entries) e.packId = packId;
        const evidenceRefs = Array.from(new Set(evidence)).sort();
        const pack = {
            packId: packId,
            projectId: proj.projectId,
            projectTitle: proj.title,
            volumeId: vol.id,
            volumeIndex: vol.index,
            navKey: vol.navKey,
            volumeTitle: vol.title,
            floorStart: vol.floorStart,
            floorEnd: vol.floorEnd,
            sourceRef: sourceRef,
            license: lic,
            viewer: viewer,
            faces: faceInfo,
            entries: entries,
            hidden: hidden,
            hiddenBy: byName > 0 ? LINK.NAME : LINK.ID,
            absentFaces: absentFaces,
            evidenceRefs: evidenceRefs,
            /* 卷边界：包只含本卷，**不跨卷隐式带**（跨卷接续要么再建一个包，要么用户明说）。 */
            scopedToVolume: true,
        };
        return { ok: true, reason: 'ok', pack: pack, absentFaces: absentFaces, hidden: hidden, hiddenBy: pack.hiddenBy };
    }
    /** 用户勾选：从包里挑出要被接续的条目。未给 select ⇒ 全选（**但同名候选仍由预览挡**）。 */
    function selectEntries(pack, select) {
        const p = (pack && typeof pack === 'object' && Array.isArray(pack.entries)) ? pack : null;
        if (!p) return { ok: false, reason: 'no-pack', selected: [], missing: [], count: 0 };
        const all = p.entries;
        if (select === undefined || select === null) return { ok: true, reason: 'all', selected: all.slice(), missing: [], count: all.length };
        const want = Array.isArray(select) ? select.map(keyOf).filter(Boolean)
            : (typeof select === 'function' ? null : [keyOf(select)].filter(Boolean));
        const picked = [];
        const missing = [];
        if (typeof select === 'function') {
            for (const e of all) {
                let hit = false;
                try { hit = select(e) === true; } catch (_e) { hit = false; }
                if (hit) picked.push(e);
            }
            return { ok: true, reason: 'filtered', selected: picked, missing: [], count: picked.length };
        }
        const pool = new Map();
        for (const e of all) pool.set(fullEntryKey(e), e);
        for (const w of want) {
            // 允许只给 `面|键`（不带 owner）——但那只在包内唯一时才成立，否则**如实报歧义**。
            if (pool.has(w)) { picked.push(pool.get(w)); continue; }
            const loose = all.filter(e => entryKeyOf(e) === w);
            if (loose.length === 1) { picked.push(loose[0]); continue; }
            missing.push(loose.length > 1 ? { key: w, reason: 'ambiguous-multi-owner', count: loose.length } : { key: w, reason: 'not-in-pack' });
        }
        return { ok: true, reason: missing.length ? 'partial' : 'ok', selected: picked, missing: missing, count: picked.length };
    }

    /* ──────────────────────────────────────────────────────────
     * ③ 源引用状态（旧源删除后引用状态必须清楚，不伪装可跳转）
     * ────────────────────────────────────────────────────────── */
    /**
     * @param {object} ref        —— 接续包（取其 sourceRef）或直接给 {session, branch, version}
     * @param {Array|null} liveSources —— 活源表；**null/undefined = 没给我们 ⇒ unknown**；
     *                                    [] = 查了、没有 ⇒ source-deleted。
     * @returns {{ok:boolean, reason:string, state:string, navigable:boolean, versionShifted?:boolean, sourceRef?:object}}
     */
    function resolveSourceState(ref, liveSources) {
        const r = (ref && typeof ref === 'object') ? (ref.sourceRef && typeof ref.sourceRef === 'object' ? ref.sourceRef : ref) : null;
        if (!r) return { ok: false, reason: 'no-source-ref', state: SOURCE.UNKNOWN, navigable: false };
        const session = keyOf(r.session); const branch = keyOf(r.branch); const version = keyOf(r.version);
        const out = { session: session || null, branch: branch || null, version: version || null };
        if (!session && !branch) return { ok: false, reason: 'no-source-ref', state: SOURCE.UNKNOWN, navigable: false, sourceRef: out };
        if (!Array.isArray(liveSources)) {
            // 判不了 ≠ 还在：unknown 一律**不可跳转**。
            return { ok: true, reason: 'unknown-liveness', state: SOURCE.UNKNOWN, navigable: false, sourceRef: out };
        }
        let matched = null;
        let versionShifted = false;
        for (const ls of liveSources) {
            if (!ls || typeof ls !== 'object') continue;
            if (keyOf(ls.session) !== session) continue;
            if (keyOf(ls.branch) !== branch) continue;
            const lv = keyOf(ls.version);
            if (version && lv && version !== lv) { matched = ls; versionShifted = true; continue; }
            matched = ls; versionShifted = false; break;
        }
        if (!matched) {
            return { ok: true, reason: 'source-deleted', state: SOURCE.DELETED, navigable: false, sourceRef: out };
        }
        return {
            ok: true,
            reason: versionShifted ? 'version-shifted' : 'live',
            state: SOURCE.LIVE,
            /* 版本漂移：会话还在，但**旧锚点已不在原位** ⇒ 不可跳转（不伪装）。 */
            navigable: !versionShifted,
            versionShifted: versionShifted,
            sourceRef: out,
        };
    }

    /* ──────────────────────────────────────────────────────────
     * ④ 预览：新会话先看冲突与缺面（再导入选中事实）
     * ────────────────────────────────────────────────────────── */
    /**
     * @param {object} pack  接续包
     * @param {object} target 目标侧 { modules: {面:true}, entries: [ {entityId|name, face, key, value} ] }
     * @param {object} opts  { allowNameLink, allowReplace, liveSources }
     * @returns {{ok:boolean, reason:string, verdict:string, conflicts:Array, nameOnly:Array,
     *            missingFaces:Array, blocked:Array, warnings:Array,
     *            willAdd:number, willReplace:number, willSkip:number, undecided:number,
     *            sourceState:object, navigable:boolean, absentFaces:Array}}
     */
    function previewContinuation(pack, target, opts) {
        const p = (pack && typeof pack === 'object' && Array.isArray(pack.entries)) ? pack : null;
        if (!p) return { ok: false, reason: 'no-pack', verdict: PREVIEW.BLOCKED, conflicts: [], nameOnly: [], missingFaces: [], blocked: [], warnings: [], willAdd: 0, willReplace: 0, willSkip: 0, undecided: 0, navigable: false, absentFaces: [], sourceState: { state: SOURCE.UNKNOWN, navigable: false } };
        const o = (opts && typeof opts === 'object') ? opts : {};
        const tgt = (target && typeof target === 'object') ? target : null;
        const modules = (tgt && tgt.modules && typeof tgt.modules === 'object') ? tgt.modules : null;
        const existing = (tgt && Array.isArray(tgt.entries)) ? tgt.entries : [];

        /* 目标索引**分两张表**：按 id 的、按名字的。比对只在同表内发生 ——
         *   跨表匹配（拿 id 去撞同名）就是「隐式串联同名角色」的实现方式。 */
        const byId = new Map();
        const byName = new Map();
        for (const e of existing) {
            if (!e || typeof e !== 'object') continue;
            const ok0 = ownerKeyOf(e);
            const f = keyOf(e.face); const k = keyOf(e.key !== undefined ? e.key : e.field);
            if (!ok0.key || !f || !k) continue;
            const map = (ok0.link === LINK.ID) ? byId : byName;
            map.set(ok0.key + '|' + f + '|' + k, (e.value === undefined ? null : e.value));
        }

        const allowNameLink = o.allowNameLink === true;
        const allowReplace = o.allowReplace === true;
        const conflicts = [];
        const nameOnly = [];
        const missingFaces = [];
        const warnings = [];
        const blocked = [];
        let willAdd = 0, willReplace = 0, willSkip = 0, undecided = 0;

        const state = resolveSourceState(p, o.liveSources);
        if (state.state === SOURCE.DELETED) {
            blocked.push({ why: 'source-deleted', sourceRef: p.sourceRef });
        }
        const absentFaces = Array.isArray(p.absentFaces) ? p.absentFaces.slice() : [];

        for (const e of p.entries) {
            const f = e.face;
            if (modules && modules[f] !== true) {
                // 目标侧缺这一面 ⇒ **不比对**（不可比 ≠ 相等），单列缺面。
                if (!missingFaces.some(x => x.face === f)) missingFaces.push({ face: f, reason: 'target-face-absent' });
                willSkip++; continue;
            }
            if (e.link === LINK.NAME && !allowNameLink) {
                // 同名候选：**永不自动串**，进候选表等人认领。
                nameOnly.push({ ownerKey: e.ownerKey, face: f, key: e.key, name: keyOf(e.ownerKey).replace(/^name:/, '') });
                willSkip++; continue;
            }
            const map = (e.link === LINK.ID) ? byId : byName;
            const kk = e.ownerKey + '|' + f + '|' + e.key;
            if (!map.has(kk)) { willAdd++; continue; }
            const cur = map.get(kk);
            if (sameValue(cur, e.value)) {
                conflicts.push({ ownerKey: e.ownerKey, face: f, key: e.key, packValue: e.value, targetValue: cur, verdict: 'same-value', action: ACTION.SKIP });
                willSkip++; continue;
            }
            /* 两侧都有值且不同 ⇒ **判不开**（本模块不猜谁对）。默认 skip，
             *   只有用户显式 allowReplace 才出 replace —— 「用户选择后才导入」的落点。 */
            conflicts.push({ ownerKey: e.ownerKey, face: f, key: e.key, packValue: e.value, targetValue: cur, verdict: 'undecided', action: allowReplace ? ACTION.REPLACE : ACTION.SKIP });
            if (allowReplace) willReplace++; else { undecided++; willSkip++; }
        }

        if (nameOnly.length) warnings.push({ why: 'name-only-candidate', count: nameOnly.length });
        if (undecided) warnings.push({ why: 'undecided-conflicts', count: undecided });
        if (missingFaces.length) warnings.push({ why: 'target-face-absent', count: missingFaces.length });
        if (absentFaces.length) warnings.push({ why: 'source-face-absent', count: absentFaces.length });
        let verdict = PREVIEW.OK;
        if (blocked.length) verdict = PREVIEW.BLOCKED;
        else if (warnings.length) verdict = PREVIEW.WARN;
        return {
            ok: true, reason: 'ok', verdict: verdict,
            conflicts: conflicts, nameOnly: nameOnly, missingFaces: missingFaces,
            blocked: blocked, warnings: warnings,
            willAdd: willAdd, willReplace: willReplace, willSkip: willSkip, undecided: undecided,
            sourceState: state, navigable: state.navigable === true,
            absentFaces: absentFaces,
        };
    }

    /* ──────────────────────────────────────────────────────────
     * ⑤ 提案 / 预检 / 确认（接续的落笔三步；能借 X6 就借）
     * ────────────────────────────────────────────────────────── */
    /**
     * 逐项提案。**提案不落笔**，且提案集合受预览的三条闸门约束：
     *   目标缺面 ⇒ 不提案；同名候选（未 allowNameLink）⇒ 不提案；已有不同值且未
     *   allowReplace ⇒ 提案成 skip（进表但不落），让「跳过」与「没这条」不同形。
     * proposalId 由 packId 与选中键决定 ⇒ **同一份选择重试恒同 id**（幂等的地基）。
     * @returns {{ok:boolean, reason:string, proposals:Array, proposalId:string|null, draft:boolean, skipped:number, undecided:number}}
     */
    function proposeHandoff(pack, target, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const pv = previewContinuation(pack, target, o);
        if (!pv.ok) return { ok: false, reason: pv.reason, proposals: [], proposalId: null, draft: true, skipped: 0, undecided: 0 };
        const p = pack;
        const sel = selectEntries(p, o.select);
        const missingFaceSet = new Set(pv.missingFaces.map(x => x.face));
        const conflicts = new Map();
        for (const c of pv.conflicts) conflicts.set(c.ownerKey + '|' + c.face + '|' + c.key, c);
        const proposals = [];
        for (const e of sel.selected) {
            const f = e.face;
            if (missingFaceSet.has(f)) continue;
            if (e.link === LINK.NAME && o.allowNameLink !== true) continue;
            const c = conflicts.get(e.ownerKey + '|' + f + '|' + e.key);
            let action;
            let reason;
            if (!c) { action = ACTION.ADD; reason = 'target-side-absent'; }
            else if (c.verdict === 'same-value') { action = ACTION.SKIP; reason = 'same-value'; }
            else if (o.allowReplace === true) { action = ACTION.REPLACE; reason = 'user-chose-replace'; }
            else { action = ACTION.SKIP; reason = 'undecided-hold'; }
            proposals.push({
                owner: e.ownerKey, face: f, key: e.key,
                action: action, reason: reason,
                value: e.value, from: e.from,
                sourceRef: p.sourceRef, evidenceRef: e.evidenceRef,
                packId: p.packId, volumeId: p.volumeId,
            });
        }
        const keys = proposals.filter(x => x.action !== ACTION.SKIP).map(x => x.owner + ':' + x.face + ':' + x.key).sort();
        const pid = 'hp_' + stableId(p.packId + '|' + (o.allowReplace === true ? 'R' : 'r') + '|' + (o.allowNameLink === true ? 'N' : 'n') + '|' + keys.join(','));
        return {
            ok: true, reason: 'ok', draft: true,
            proposals: proposals,
            proposalId: pid,
            skipped: proposals.filter(x => x.action === ACTION.SKIP).length,
            undecided: pv.undecided,
        };
    }
    /** 本模块自持的预检退路（X6 在场时**不**走这里）。三档口径与 X6 一致。 */
    function precheckHandoff(proposals, ctx) {
        const c = (ctx && typeof ctx === 'object') ? ctx : {};
        const list = Array.isArray(proposals) ? proposals : ((proposals && Array.isArray(proposals.proposals)) ? proposals.proposals : []);
        const blockers = [];
        const warnings = [];
        if (c.sourceState && c.sourceState.state === SOURCE.DELETED) {
            blockers.push({ why: 'source-deleted', sourceRef: c.sourceState.sourceRef || null });
        }
        for (const p of list) {
            if (!p || typeof p !== 'object') continue;
            if (p.action === ACTION.SKIP) continue;
            if (p.action === ACTION.REPLACE && c.allowReplace !== true) {
                // 不经用户同意就替换 ⇒ 拦（「自动合并」的形态之一）。
                blockers.push({ why: 'replace-without-consent', owner: p.owner, face: p.face, key: p.key });
            }
            if (p.action === ACTION.ADD && c.targetFacePresent && c.targetFacePresent[p.face] === false) {
                blockers.push({ why: 'target-face-absent', owner: p.owner, face: p.face, key: p.key });
            }
            const dependents = (c.dependents && typeof c.dependents === 'object') ? c.dependents : null;
            if (dependents && dependents[p.owner + '|' + p.face + '|' + p.key]) {
                warnings.push({ why: 'has-dependents', owner: p.owner, face: p.face, key: p.key });
            }
        }
        let verdict = PREVIEW.OK;
        if (blockers.length) verdict = PREVIEW.BLOCKED;
        else if (warnings.length) verdict = PREVIEW.WARN;
        return { ok: true, reason: 'ok', verdict: verdict, blockers: blockers, warnings: warnings,
                 checked: list.filter(x => x && x.action !== ACTION.SKIP).length };
    }
    /**
     * 本模块自持的确认退路（X6 缺席时才用）。与 X6 同五条口径，外加 X7 自己的
     *   `revokeScope`：**回执必须自带来源范围**，否则下一次撤销根本无从界定范围。
     *   `persisted` 三态（null 未回读 / true 已落地 / false 落盘被拒）——内存落了
     *   **不等于**已落地。
     */
    async function confirmHandoff(args) {
        const a = (args && typeof args === 'object') ? args : {};
        const pid = keyOf(a.proposalId);
        const pre = (a.precheck && typeof a.precheck === 'object') ? a.precheck : null;
        const list = Array.isArray(a.proposals) ? a.proposals : ((a.proposals && Array.isArray(a.proposals.proposals)) ? a.proposals.proposals : []);
        const toApply = list.filter(p => p && p.action !== ACTION.SKIP);
        const scope = {
            packId: keyOf(a.packId) || null,
            volumeId: keyOf(a.volumeId) || null,
            sourceRef: (a.sourceRef && typeof a.sourceRef === 'object') ? {
                session: keyOf(a.sourceRef.session) || null,
                branch: keyOf(a.sourceRef.branch) || null,
                version: keyOf(a.sourceRef.version) || null,
            } : null,
        };
        const base = {
            proposalId: pid,
            packId: scope.packId,
            volumeId: scope.volumeId,
            sourceRef: scope.sourceRef,
            revokeScope: scope,
            applied: 0, dropped: 0, duplicate: false, held: false,
            readback: null, persisted: null,
        };
        if (!pre) return Object.assign({}, base, { ok: false, reason: 'no-precheck' });
        if (pre.verdict !== PREVIEW.OK) {
            return Object.assign({}, base, {
                ok: false, reason: 'precheck-' + String(pre.verdict), held: true,
                blockers: Array.isArray(pre.blockers) ? pre.blockers.length : 0,
            });
        }
        const seen = (a.seen && typeof a.seen === 'object') ? a.seen : null;
        if (pid && seen && seen[pid]) {
            return Object.assign({}, base, { ok: true, reason: 'duplicate', duplicate: true, applied: Number(seen[pid].applied) || 0 });
        }
        const applyFn = (typeof a.applyFn === 'function') ? a.applyFn : null;
        if (!applyFn) return Object.assign({}, base, { ok: false, reason: 'no-apply-fn', applied: 0 });
        let applied = 0;
        let dropped = 0;
        for (const p of toApply) {
            let r;
            try { r = applyFn(p); } catch (_e) { r = { ok: false, reason: 'threw' }; }
            if (r === true || (r && r.ok === true)) applied++; else dropped++;
        }
        let rb = null;
        if (typeof a.readback === 'function') {
            let got;
            try { got = await a.readback(); } catch (_e) { got = undefined; }
            if (got === undefined || got === null) rb = 'unreadable';
            else if (got === applied || (got && got.applied === applied)) rb = 'ok';
            else rb = 'mismatch';
        }
        let persisted = null;
        if (typeof a.persist === 'function') {
            let okSave = false;
            try { okSave = await a.persist(); } catch (_e) { okSave = false; }
            persisted = okSave === true;
            if (persisted === false) {
                // 落盘被拒：内存落了 ≠ 已落地 ⇒ 回执不得说成功。
                return Object.assign({}, base, {
                    ok: false, reason: 'persist-failed', applied: applied, dropped: dropped,
                    readback: rb, persisted: false,
                });
            }
        }
        return Object.assign({}, base, {
            ok: dropped === 0,
            reason: dropped === 0 ? 'applied' : 'partial',
            applied: applied, dropped: dropped, readback: rb, persisted: persisted,
        });
    }
    /**
     * 接续交接（X7 主出口）：提案 → 预检 → 确认，三步**不可合并**。
     *   拿到 X6（`args.bs`）时逐字借用它的 precheck / confirm ⇒ 两处的受控交接
     *   只有**一份**语义；没拿到就走本模块同形退路（降级，不是抛）。
     * @returns {Promise<object>} {ok, reason, proposalId, proposals, preview, receipt, revokeScope}
     */
    async function handoffContinuation(args) {
        const a = (args && typeof args === 'object') ? args : {};
        const pv = previewContinuation(a.pack, a.target, a);
        if (!pv.ok) return { ok: false, reason: pv.reason, receipt: null, preview: pv, proposals: [], proposalId: null };
        if (pv.verdict === PREVIEW.BLOCKED) {
            // 源已删之类：**连提案都不出**（不基于说不清出处的源落笔）。
            return { ok: false, reason: 'preview-blocked', receipt: null, preview: pv, proposals: [], proposalId: null };
        }
        const pr = proposeHandoff(a.pack, a.target, a);
        if (!pr.ok) return { ok: false, reason: pr.reason, receipt: null, preview: pv, proposals: [], proposalId: null };
        const p = a.pack;
        const bs = (a.bs && typeof a.bs === 'object' && typeof a.bs.confirmImport === 'function') ? a.bs : null;
        const pid = keyOf(a.proposalId) || pr.proposalId;
        const packId = (p && p.packId) || null;
        const volumeId = (p && p.volumeId) || null;
        const sourceRef = (p && p.sourceRef) || null;

        let pre;
        if (bs && typeof bs.precheckImport === 'function') {
            pre = bs.precheckImport(pr.proposals, {
                viewer: (p && p.viewer) || null,
                dependents: a.dependents || null,
                absentModules: pv.missingFaces.map(x => x.face),
            });
        } else {
            pre = precheckHandoff(pr.proposals, {
                sourceState: pv.sourceState,
                allowReplace: a.allowReplace === true,
                dependents: a.dependents || null,
            });
        }

        let receipt;
        if (bs && typeof bs.confirmImport === 'function') {
            receipt = await bs.confirmImport({
                proposals: pr.proposals,
                precheck: pre,
                proposalId: pid,
                applyFn: a.applyFn,
                readback: a.readback,
                sourceRef: 'pack:' + String(packId),
                targetRef: keyOf(a.targetRef) || null,
                seen: a.seen,
            });
            // X6 的回执不带 X7 的来源范围：**接续必须补上**，否则撤销定义不出来。
            receipt = Object.assign({}, receipt || {}, {
                packId: packId, volumeId: volumeId,
                sourceRef: sourceRef,
                revokeScope: { packId: packId, volumeId: volumeId, sourceRef: sourceRef },
                via: 'branch-semantics',
            });
            if (typeof a.persist === 'function') {
                /* X6 的 confirm 不管落盘（它只做「先预检、再幂等、后回读」三件）。
                 *   X7 的验收要的是「真实落地」，故这里补一次落盘并把结论写进回执。 */
                let okSave = false;
                try { okSave = await a.persist(); } catch (_e) { okSave = false; }
                receipt.persisted = okSave === true;
                if (okSave !== true && receipt.ok) receipt = Object.assign({}, receipt, { ok: false, reason: 'persist-failed' });
            }
        } else {
            const preShape = (pre && pre.verdict === PREVIEW.BLOCKED)
                ? { verdict: PREVIEW.BLOCKED, blockers: pre.blockers || [] }
                : ((pre && pre.verdict === PREVIEW.WARN) ? { verdict: PREVIEW.WARN, warnings: pre.warnings || [] } : { verdict: PREVIEW.OK });
            receipt = await confirmHandoff({
                proposals: pr.proposals,
                precheck: preShape,
                proposalId: pid,
                applyFn: a.applyFn,
                readback: a.readback,
                persist: a.persist,
                packId: packId, volumeId: volumeId, sourceRef: sourceRef,
                seen: a.seen,
            });
            receipt = Object.assign({}, receipt, { via: 'volume-continuation' });
        }
        return {
            ok: receipt.ok === true,
            reason: receipt.reason,
            proposalId: pid,
            proposals: pr.proposals,
            preview: pv,
            receipt: receipt,
            revokeScope: receipt.revokeScope || null,
        };
    }

    /* ──────────────────────────────────────────────────────────
     * ⑥ 撤销：有来源范围才撤，范围外一条不动
     * ────────────────────────────────────────────────────────── */
    /** 条目在不在 scope 内：给了几维就比几维（**与**语义 ⇒ scope 越全越窄）。 */
    function inRevokeScope(e, sc) {
        if (!e || typeof e !== 'object' || !sc) return false;
        if (sc.packId && keyOf(e.packId) !== sc.packId) return false;
        if (sc.volumeId && keyOf(e.volumeId) !== sc.volumeId) return false;
        const sr = sc.sourceRef;
        if (sr && (sr.session || sr.branch || sr.version)) {
            const er = (e.sourceRef && typeof e.sourceRef === 'object') ? e.sourceRef : {};
            if (sr.session && keyOf(er.session) !== sr.session) return false;
            if (sr.branch && keyOf(er.branch) !== sr.branch) return false;
            if (sr.version && keyOf(er.version) !== sr.version) return false;
        }
        return true;
    }
    /**
     * 撤销接续导入。**必须有来源范围**：没 scope ⇒ 拒绝（`no-scope`）。
     *   范围外的条目**一条不动**（「撤销」不是「整批回滚」，更不是「清库」）；
     *   已撤条（`revoked:true`）重复调用不再计入（幂等，记 `alreadyRevoked`）。
     * @returns {{ok:boolean, reason:string, revoked:Array, kept:Array, revokedCount:number,
     *            keptCount:number, alreadyRevoked:number, narrowed:boolean, scope:object|null}}
     */
    function revokeHandoff(args) {
        const a = (args && typeof args === 'object') ? args : {};
        const scopeRaw = (a.scope && typeof a.scope === 'object') ? a.scope : null;
        const list = Array.isArray(a.appliedEntries) ? a.appliedEntries
            : (Array.isArray(a.applied) ? a.applied : []);
        const sc = scopeRaw ? {
            packId: keyOf(scopeRaw.packId),
            volumeId: keyOf(scopeRaw.volumeId),
            sourceRef: (scopeRaw.sourceRef && typeof scopeRaw.sourceRef === 'object') ? {
                session: keyOf(scopeRaw.sourceRef.session),
                branch: keyOf(scopeRaw.sourceRef.branch),
                version: keyOf(scopeRaw.sourceRef.version),
            } : null,
        } : null;
        const hasScope = !!(sc && (sc.packId || sc.volumeId || (sc.sourceRef && (sc.sourceRef.session || sc.sourceRef.branch || sc.sourceRef.version))));
        if (!hasScope) {
            return { ok: false, reason: 'no-scope', revoked: [], kept: list.map(e => fullEntryKey(e)), revokedCount: 0, keptCount: list.length, alreadyRevoked: 0, narrowed: false, scope: null };
        }
        const revoked = [];
        const kept = [];
        let already = 0;
        for (const e of list) {
            const k = fullEntryKey(e);
            if (!e || typeof e !== 'object') { kept.push(k); continue; }
            if (e.revoked === true) { kept.push(k); already++; continue; }
            if (inRevokeScope(e, sc)) revoked.push(k); else kept.push(k);
        }
        const narrowed = !!(sc.packId || sc.volumeId) || !!(sc.sourceRef && sc.sourceRef.version);
        return {
            ok: true,
            reason: revoked.length ? 'revoked' : 'nothing-in-scope',
            revoked: revoked, kept: kept,
            revokedCount: revoked.length, keptCount: kept.length,
            alreadyRevoked: already, narrowed: narrowed,
            scope: {
                packId: sc.packId || null, volumeId: sc.volumeId || null,
                sourceRef: (sc.sourceRef && (sc.sourceRef.session || sc.sourceRef.branch || sc.sourceRef.version))
                    ? { session: sc.sourceRef.session || null, branch: sc.sourceRef.branch || null, version: sc.sourceRef.version || null }
                    : null,
            },
        };
    }

    /* ──────────────────────────────────────────────────────────
     * ⑦ 读数（诊断面；与「分支语义」「知识轨迹」分列）
     * ────────────────────────────────────────────────────────── */
    /** 分卷导航 + 接续包一句话读数。 */
    function line(read) {
        try {
            const r = (read && typeof read === 'object') ? read : null;
            if (!r) return '未选项目';
            if (r.selected === false) return '未选项目（维持隔离）';
            const parts = [];
            const vc = numOf(r.volumeCount);
            if (vc !== null) parts.push('卷 ' + vc);
            const cc = numOf(r.chapterCount);
            if (cc !== null && cc > 0) parts.push('节 ' + cc);
            const vref = keyOf(r.volumeTitle);
            if (vref) parts.push('接续自「' + vref + '」');
            const ec = numOf(r.entryCount);
            if (ec !== null) parts.push('可接续 ' + ec + ' 条');
            const af = numOf(r.absentFaceCount);
            if (af !== null && af > 0) parts.push('缺面 ' + af);
            const nc = numOf(r.nameOnlyCount);
            if (nc !== null && nc > 0) parts.push('同名候选 ' + nc);
            const hd = numOf(r.hidden);
            if (hd !== null && hd > 0) parts.push('知识范围挡 ' + hd + ' 条');
            const st = keyOf(r.sourceState);
            if (st) parts.push('源 ' + st + (r.navigable === false ? '（不可跳转）' : ''));
            if (!parts.length) return '已选项目';
            return parts.join(' · ');
        } catch (_e) { return '—（分卷接续异常）'; }
    }
    /** 交接回执一句话读数（撤销范围必须在读数里，不能藏在对象里）。 */
    function handoffLine(receipt) {
        try {
            const r = (receipt && typeof receipt === 'object') ? receipt : null;
            if (!r) return '未交接';
            const parts = [];
            parts.push('落笔 ' + (numOf(r.applied) || 0));
            if (numOf(r.dropped)) parts.push('丢弃 ' + r.dropped);
            if (r.duplicate) parts.push('重复（幂等）');
            if (r.held) parts.push('已拦');
            if (keyOf(r.readback)) parts.push('回读 ' + keyOf(r.readback));
            if (r.persisted === false) parts.push('落盘被拒');
            else if (r.persisted === true) parts.push('已落地');
            const sc = (r.revokeScope && typeof r.revokeScope === 'object') ? r.revokeScope : null;
            if (sc && (sc.packId || sc.volumeId)) parts.push('可撤范围 ' + keyOf(sc.packId || sc.volumeId));
            else parts.push('无撤销范围');
            return parts.join(' · ');
        } catch (_e) { return '—（交接读数异常）'; }
    }

    const api = Object.freeze({
        VOLUME_CONTINUATION_VERSION,
        NAV, SOURCE, LICENSE, FACES, LINK, ACTION, PREVIEW,
        keyOf, numOf, strOf, stableId, sameValue, safe,
        ownerKeyOf, entryKeyOf, fullEntryKey, filterByKeeper,
        normalizeProject, listVolumes, volumeAt,
        buildContinuationPack, selectEntries,
        resolveSourceState, previewContinuation,
        proposeHandoff, precheckHandoff, confirmHandoff, handoffContinuation,
        revokeHandoff, inRevokeScope,
        line, handoffLine,
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    const g = (typeof globalThis !== 'undefined') ? globalThis : root;
    try { g.LonShaVolumeContinuation = Object.freeze(api); } catch (_e) { /* 宿主冻结全局时忽略 */ }
})(typeof window !== 'undefined' ? window : globalThis);