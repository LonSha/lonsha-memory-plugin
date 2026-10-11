/* ============================================================
 * memory-package.js — [v3.313.0 · M-X8] 版本化记忆包与跨设备迁移
 * ------------------------------------------------------------
 * 【它补的是哪一格（第二期拓展计划 M-X8 验收原文逐条）】
 *   长期使用后，用户需要把项目 / 角色 / 事实与知识边界**安全带走**，而不是只能依赖
 *   当前宿主存档。修前实测（逐点核对，非抽样）：这条面上**一格都没有** ——
 *     · `volume-continuation.js`（X7）能建「卷接续包」，但那是**会话内**的接续件：
 *       按卷切、按 keeper 过滤、带 sourceRef —— **没有包格式代际、没有导入预览、
 *       没有冲突检测、没有幂等账、没有撤销**。把它当迁移包用，等于把「卷内接续」
 *       说成「跨设备迁移」。
 *     · `snapshot-checkpoint.js`（R4-C）能存命名检查点，但它绑在**同一宿主的
 *       localStorage**：换设备即无 —— 正是本条目要治的那件事。
 *     · `schema-migration.js`（v3.209.0）有**结构代际迁移注册表**与 `plan()/run()`，
 *       但它是**存档载荷**的迁移；没人把「用户从别的设备带回来的 .json 包」接到那条
 *       路上。于是旧包要么被逐字段硬塞进新运行时（缺字段静默缺失），要么整包被拒
 *       （字段全丢）——两种都不叫「明确迁移或明确拒绝」。
 *   本模块把这三件收成一处：**造包（代际 / 来源 / 知识范围 / 敏感标记）→ 判包（能收 /
 *   要迁 / 明确拒）→ 预览（冲突 / 悬空 / 越界）→ 部分导入（幂等）→ 撤销（有来源边界）**。
 *
 * 【五条不可让步口径（每条对应一条验收原文）】
 *   ① **代际要么迁、要么明确拒，绝不静默丢字段**（验收①）。
 *      `admitPackage()` 三态 `current / migrate / reject`；`reject` 必须**点名**理由
 *      （`REJECT_REASONS[]` 里的字），且包顶层出现本模块不认识的键时**逐条列进
 *      `unknownKeys`** —— 默认拒绝，只有调用方显式 `keepUnknown:true` 才放行
 *      （与 M-X4 的「显式才放行」同纪律）。迁移路径**不问本模块**，一律问
 *      `deps.SCHEMA_MIGRATION.plan()`（结构代际的单一真源）；它是模块而缺席时
 *      降级为 `reject / migration-unavailable` —— **不假装已是当前代际**。
 *   ② **同一包重复导入幂等**（验收②）。
 *      `importId = 'im_' + stableId(packageId + '#' + scopeKey + '#' + revision)`：
 *      同包同目标恒同 id（确定性）；上一次返回的 `seen` 数组传给下一次，命中即
 *      `duplicate:true` 且 `applied` 为空。幂等表由**调用方持有**：本模块零持久状态，
 *      不偷偷写第二份导入账。
 *   ③ **过期来源显示悬空，不伪装可跳转**（验收③）。
 *      `sourceStateOf()` 三态 `live / source-deleted / unknown`：**没给活源表 ⇒ unknown**
 *      （判不了 ≠ 还在），给了空表 ⇒ source-deleted（查了，没有）。`navigable` 只在
 *      live 且版本未漂移时为 true；版本漂移仍是 live 但 `versionShifted:true`，
 *      **旧锚点不可跳转**。
 *   ④ **秘密与受限知识不因导出而放宽权限**（验收④）。
 *      `buildPackage()` 入口即剥正文：受限条目一律 `SECRET_MASK` 站位串（与 X6/X7
 *      同形同值的 `SECRET_BODY_KEYS`），且**站位串不随原文本长度变化**（否则长度
 *      本身就是读数）；条目只带 `sensitive:true` 标记 + 归属，不带一个字正文。
 *      导出**不改变**知识范围判定：keeper 过滤照走，挡掉的条数必须计数可见。
 *   ⑤ **会话与分支边界不能被导入打穿**（验收⑤）。
 *      `boundaryCheck()` 逐条比对 `sourceRef.session / branch` 与目标；不一致 ⇒
 *      `boundary-cross` 进 `blocked`，**永不进可导入集合**。未选项目 / 角色 ⇒
 *      完全隔离：`buildPackage()` 一律 `ok:false / reason:'no-scope'`，**不产包**
 *      （空包会被读成「确实没有可带走的」，真相是「你根本没选」）。
 *
 * 【本模块不做什么（边界）】
 *   · **不联网**：不发起任何网络请求，不建云同步，不新增外部数据库（`offline:true`
 *     明写进包与自述）；文件由调用方持有与落盘。
 *   · **不写任何账**：纯函数面。导入落笔走既有 owner（`restoreFromPayload` / 各账
 *     `record`），本模块只产出**包 / 准入判定 / 预览 / 计划 / 撤销清单**。
 *   · **不另立代际词表**：`SCHEMA_MIGRATION` 从 deps 注入（单一真源）。
 *   · **不另抄存档键清单**：`ARCHIVE_KEYS` 从 deps 注入；它缺席时键面**如实报未判**
 *     （`keysChecked:false`），**不报「无未知键」**。
 *   · 不抛：畸形入参一律退化为可读的降级读数。
 * 挂 window.LonShaMemoryPackage，供 index.js 迁移面 / 诊断面使用。
 * ============================================================ */
(function (root) {
    'use strict';
    const MP_VERSION = 1;

    /** 导出粒度三档（验收·功能①：项目级 / 角色级 / 会话级）。 */
    const GRANULARITY = Object.freeze(['project', 'character', 'session']);

    /** 准入三态。**三态必须可分**：把 `reject` 压进 `migrate` 就会「假装能迁」。 */
    const ADMIT = Object.freeze({ CURRENT: 'current', MIGRATE: 'migrate', REJECT: 'reject' });

    /** 预览三档（与 X7 同词表）。 */
    const PREVIEW = Object.freeze({ OK: 'ok', WARN: 'warn', BLOCKED: 'blocked' });

    /** 来源状态三态（与 X7 `resolveSourceState` 同口径，不合并）。 */
    const SOURCE = Object.freeze({ LIVE: 'live', DELETED: 'source-deleted', UNKNOWN: 'unknown' });

    /**
     * 拒绝理由词表（**穷尽**：任何 reject 必须取自这里，不得现编字符串）。
     * ★ 每一条都对应一种「不能悄悄放过去」的处境。
     */
    const REJECT_REASONS = Object.freeze([
        'no-package',            // 没有包（不是「空包」）
        'not-object',            // 包不是对象 / 是数组
        'no-schema',             // 连 schemaVersion 都没写（旧到无法判）
        'schema-unparsable',     // schemaVersion 写了但不可解析
        'too-new',               // 包比本插件新：降级读取不在职责内，不假装能迁
        'no-migration-path',     // 注册表缺链（升代际未登记 ⇒ 判不出来，不是「无需迁移」）
        'migration-unavailable', // 迁移模块缺席（**不假装已是当前代际**）
        'unknown-keys',          // 包顶层有本模块不认识的键（未显式承担 ⇒ 不静默丢）
        'no-scope',              // 未选项目 / 角色 / 会话 ⇒ 完全隔离
    ]);

    /** 包顶层契约键（本模块**是**包格式的定义者，故这份清单自持）。 */
    const PACKAGE_KEYS = Object.freeze([
        'kind', 'packageId', 'schemaVersion', 'producerVersion', 'granularity', 'scope', 'createdAt',
        'revision', 'license', 'sourceRefs', 'faces', 'entries', 'knowledge', 'migrationNote',
        'sensitiveCount', 'offline',
    ]);

    /** 受限正文字段键（与 X6/X7 的 `SECRET_BODY_KEYS` **同形同值**，E 段判据钉住三处一致）。 */
    const SECRET_BODY_KEYS = Object.freeze(['secret', 'secretText', 'secretBody']);

    /** 受限正文站位串。★ **定长**：不随原文本长变化（否则长度就是读数）。 */
    const SECRET_MASK = '⟨受限正文已隐去⟩';

    /** 包内单条正文的截断上限（非受限条目才截；受限一律站位串）。 */
    const BODY_MAX = 80;

    /** 五面（与 X6/X7 同词表；本模块自持一份，一致性由判据对账）。 */
    const FACES = Object.freeze(['factVersion', 'characterState', 'unfinished', 'money', 'storyTime']);

    /** 许可范围（与 X7 同三值）：none 连包都不出。 */
    const LICENSE = Object.freeze({ FACES: 'faces', SUMMARY_ONLY: 'summary-only', NONE: 'none' });

    /**
     * 依赖声明面。**只声明不执行**；每件缺席时的后果逐条写明 ——
     *   判据按 `key` 逐字对账（改名会静默变成「依赖缺席」）。
     */
    const REQUIRED_DEPS = Object.freeze([
        { key: 'SCHEMA_MIGRATION', why: '结构代际迁移注册表（旧包是否能迁的唯一真源；缺席 ⇒ 迁移档降级为明确拒绝，不假装已是当前代际）' },
        { key: 'ARCHIVE_KEYS', why: '存档顶层键契约（判包内待导入键是否被本仓认识；缺席 ⇒ 键面如实报未判，不报「无未知键」）' },
        { key: 'SECRET_BODY_KEYS', why: '受限正文字段键（导出掩码口径的唯一真源，与 X6/X7 同形）' },
    ]);

    /* ── 原语（与 X6/X7 同口径；本模块自持，不引兄弟模块） ── */
    /** 名字 / 键归一（去首尾空白；非串给空串）。 */
    function keyOf(v) {
        return (typeof v === 'string') ? v.trim() : (v === null || v === undefined ? '' : String(v).trim());
    }
    /** 文本化（缺省空串）。 */
    function strOf(v) { return (typeof v === 'string') ? v : (v === null || v === undefined ? '' : String(v)); }
    /** 折叠空白 + 截断（**非受限**条目才走这里）。 */
    function text(v, max) {
        const s = strOf(v).replace(/\s+/g, ' ').trim();
        return max ? (s.length > max ? s.slice(0, max) + '\u2026' : s) : s;
    }
    /** 有限数（未给给 null，**不拿 0 冒充「就是 0」**）。 */
    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'boolean' || typeof v === 'object') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    /** 稳定短 id（FNV-1a → base36）。同输入恒同输出 ⇒ 幂等的地基。 */
    function stableId(s) {
        const str = strOf(s);
        let h = 2166136261 >>> 0;
        for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
        return h.toString(36);
    }
    /** 安全执行（绝不外抛）。 */
    function safe(fn, fallback) {
        try { return fn(); } catch (_e) { return fallback; }
    }
    /** 值等价（稳定串比较；循环引用 ⇒ false，不抛）。 */
    function sameValue(a, b) {
        return safe(() => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b), false);
    }
    /** 单值 / 数组归一：空与缺省都收成空数组。 */
    function arrOf(v) { return Array.isArray(v) ? v : (v === null || v === undefined || v === '' ? [] : [v]); }

    /* ──────────────────────────────────────────────────────────
     * ① 归属：粒度 + 作用域（没选 ⇒ 完全隔离，不产包）
     * ────────────────────────────────────────────────────────── */
    /**
     * 归一作用域。**三个粒度各自的身份键**：
     *   project → `projectId` / character → `characterId` / session → `chatId`。
     *   任一为空 ⇒ `ok:false / reason:'no-scope'`。
     * ★ 刻意**不**退回名字：名字会重，id 不会（与 X7 `normalizeProject` 同纪律）。
     */
    function normalizeScope(raw) {
        const r = (raw && typeof raw === 'object') ? raw : null;
        const none = { ok: false, reason: 'no-scope', scope: null, scopeKey: '', granularity: '' };
        if (!r) return none;
        const g = keyOf(r.granularity);
        if (GRANULARITY.indexOf(g) < 0) return none;
        const id = g === 'project' ? keyOf(r.projectId !== undefined ? r.projectId : r.id)
            : g === 'character' ? keyOf(r.characterId !== undefined ? r.characterId : r.id)
                : keyOf(r.chatId !== undefined ? r.chatId : r.id);
        if (!id) return none;
        const sc = { granularity: g, id: id, branch: keyOf(r.branch) || null, session: keyOf(r.session) || null,
            title: keyOf(r.title) || id, owner: keyOf(r.owner) || null };
        return { ok: true, reason: 'ok', scope: sc, scopeKey: g + ':' + id, granularity: g };
    }

    /* ──────────────────────────────────────────────────────────
     * ② 造包：代际 / 来源 / 知识范围 / 敏感标记（验收·功能②）
     * ────────────────────────────────────────────────────────── */
    /** 这条条目是不是受限（按 SECRET_BODY_KEYS 逐键看**有没有实值**）。 */
    function isSecret(e, keys) {
        if (!e || typeof e !== 'object') return false;
        if (e.secret === true || e.sensitive === true) return true;
        for (const k of keys) {
            if (!Object.prototype.hasOwnProperty.call(e, k)) continue;
            const v = e[k];
            if (v !== null && v !== undefined && strOf(v).trim() !== '') return true;
        }
        return false;
    }
    /**
     * 剥正文（**入口就剥**，与 X7 M-O8 第三刀同纪律）。
     * ★ 只剥正文（`value` 与受限键），**保留边界与推进度**：`keeper` / `knowers` /
     *   `status` / `floor` / `scope` 随条目走才对 —— 过滤要按它判、进度要继续，
     *   读者知道有这条、知道边界，但拿不到一个字。
     */
    function maskEntry(e, keys) {
        if (!e || typeof e !== 'object') return { out: e, masked: 0 };
        const secret = isSecret(e, keys);
        const out = Object.assign({}, e);
        let masked = 0;
        for (const k of keys) {
            if (!Object.prototype.hasOwnProperty.call(out, k)) continue;
            if (strOf(out[k]).trim() !== '') masked = 1;
            out[k] = null;                     // ★ 受限键**整键清空**，不留半个字数提示
        }
        if (secret) {
            if (out.value !== null && out.value !== undefined && strOf(out.value) !== '') masked = 1;
            out.value = SECRET_MASK;           // ★ 定长站位串（长度不是读数）
            out.sensitive = true;
        } else if (typeof out.value === 'string') {
            /* ★ 只对**字符串**折空白 + 截断：数字 / 布尔 / 对象原样保留。
             *   把数字转成字符串会在导入时**改类型**（跨设备迁移尤其不能改）——
             *   而 `sameValue` 是稳定串比较，'120' ≠ 120 会让「同值」被读成冲突。 */
            out.value = text(out.value, BODY_MAX);
        }
        return { out: out, masked: masked };
    }
    /**
     * keeper 过滤（与 X6/X7 同口径：实体 id 优先，只有名字才退到 by-name 并如实回报）。
     * ★ 导出**不改变**知识范围：挡掉的条数必须计数可见，绝不静默少条。
     */
    function filterByKeeper(entries, viewer) {
        const list = Array.isArray(entries) ? entries : [];
        const vw = (viewer && typeof viewer === 'object') ? viewer : { id: keyOf(viewer) };
        const vId = keyOf(vw.id);
        const vName = keyOf(vw.name || vw.id);
        const visible = [];
        let hidden = 0; let byName = 0; let nameMatched = 0; let knowerOnly = 0;
        for (const e of list) {
            if (!e || typeof e !== 'object') { visible.push(e); continue; }
            const ids = Array.isArray(e.keeperIds) ? e.keeperIds.map(keyOf).filter(Boolean) : [];
            const names = Array.isArray(e.keeper) ? e.keeper.map(keyOf).filter(Boolean)
                : (e.keeper === null || e.keeper === undefined ? [] : [keyOf(e.keeper)]);
            const knowers = Array.isArray(e.knowers) ? e.knowers.map(keyOf).filter(Boolean) : [];
            if (knowers.length) {
                knowerOnly++;
                if (!vName) { hidden++; continue; }
                for (const n of knowers) { if (n === vName) { nameMatched++; break; } }
                if (knowers.indexOf(vName) >= 0) { visible.push(e); continue; }
                hidden++;
                continue;
            }
            if (ids.length === 0 && names.length === 0) { visible.push(e); continue; }
            let hit = false;
            if (vId && ids.indexOf(vId) >= 0) hit = true;
            if (!hit && names.length) {
                for (const n of names) {
                    if (n && n === vName) { nameMatched++; if (!vId || ids.indexOf(vId) < 0) byName++; hit = true; break; }
                }
            }
            if (hit) visible.push(e); else hidden++;
        }
        return { visible, hidden, hiddenBy: byName > 0 ? 'by-name' : 'by-id', total: list.length, byName, nameMatched, knowerOnly };
    }
    /** 来源引用归一（三键；缺省 null，**不拿空串冒充「给了个空 session」**）。 */
    function sourceRefOf(raw) {
        const r = (raw && typeof raw === 'object') ? raw : {};
        return {
            session: keyOf(r.session) || null,
            branch: keyOf(r.branch) || null,
            version: keyOf(r.version) || null,
        };
    }

    /**
     * 造包（验收·功能①②；粒度 / schema 版本 / sourceRefs / revision / 知识范围 /
     *   迁移说明 / 敏感字段标记**七件齐**）。
     * ★ 返回 `ok:false / reason:'no-scope'` 时**不产包**：空包会被下游读成
     *   「这个项目确实没有可带走的」，真相是「你根本没选」——两件事必须不同形。
     * @returns {{ok, reason, offline:boolean, package, hidden, hiddenBy, sensitiveCount, absentFaces}}
     */
    function buildPackage(args, deps) {
        const a = (args && typeof args === 'object') ? args : {};
        const d = (deps && typeof deps === 'object') ? deps : {};
        const keys = (Array.isArray(d.SECRET_BODY_KEYS) && d.SECRET_BODY_KEYS.length) ? d.SECRET_BODY_KEYS : SECRET_BODY_KEYS;
        const none = { ok: false, reason: '', offline: true, package: null, hidden: 0, hiddenBy: 'by-id', sensitiveCount: 0, absentFaces: [] };
        const ns = normalizeScope(a.scope);
        if (!ns.ok) return Object.assign({}, none, { reason: ns.reason });
        const lic = keyOf(a.license) || LICENSE.FACES;
        if (lic === LICENSE.NONE) return Object.assign({}, none, { reason: 'license-none' });
        const facesSrc = (a.faces && typeof a.faces === 'object') ? a.faces : {};
        const narrowed = (lic === LICENSE.SUMMARY_ONLY);
        const entries = [];
        const absentFaces = [];
        const faceInfo = {};
        let hidden = 0; let byName = 0; let sensitiveCount = 0; let shadowed = 0;
        for (const f of FACES) {
            if (narrowed) {
                faceInfo[f] = { present: false, reason: 'license-summary-only', count: 0, hidden: 0, sensitive: 0 };
                absentFaces.push({ face: f, reason: 'license-summary-only' });
                continue;
            }
            const raw = facesSrc[f];
            if (!Array.isArray(raw)) {
                faceInfo[f] = { present: false, reason: 'face-absent', count: 0, hidden: 0, sensitive: 0 };
                absentFaces.push({ face: f, reason: 'face-absent' });
                continue;
            }
            const flt = filterByKeeper(raw, a.viewer);
            hidden += flt.hidden;
            if (flt.hiddenBy === 'by-name') byName++;
            let n = 0; let sens = 0;
            for (const e of flt.visible) {
                if (!e || typeof e !== 'object') continue;
                const key = keyOf(e.key !== undefined ? e.key : e.field);
                if (!key) continue;                 // 无键条目**不可寻址**，不进包
                const m = maskEntry(e, keys);
                if (m.masked) shadowed++;
                const eid = keyOf(e.entityId !== undefined ? e.entityId : (e.ownerId !== undefined ? e.ownerId : e.id));
                const ownerName = keyOf(e.name !== undefined ? e.name : e.owner);
                const rec = {
                    face: f, key: key,
                    ownerKey: eid ? ('id:' + eid) : (ownerName ? ('name:' + ownerName) : ''),
                    link: eid ? 'by-id' : (ownerName ? 'by-name' : 'none'),
                    value: m.out.value,
                    sensitive: m.out.sensitive === true,
                    from: numOrNull(e.from !== undefined ? e.from : e.floor),
                    to: numOrNull(e.to),
                    scope: keyOf(e.scope) || null,
                    evidenceRef: keyOf(e.evidenceRef) || null,
                    refId: keyOf(e.refId !== undefined ? e.refId : e.id) || null,
                };
                /* ★ 受限**键名也整键清空**：`maskEntry` 已把值换成站位串，这里不再把
                 *   键名搬进条目 —— 留着 `secret:null` 会让「有这条」与「条上有个受限格」
                 *   同形，且键名本身在逐字反查里就是一处残留。 */
                if (rec.sensitive) sens++;
                entries.push(rec);
                n++;
            }
            faceInfo[f] = { present: true, reason: 'ok', count: n, hidden: flt.hidden, sensitive: sens };
            sensitiveCount += sens;
        }
        const sourceRefs = arrOf(a.sourceRefs).map(sourceRefOf);
        const rev = numOrNull(a.revision);
        const sig = ns.scopeKey + '#' + lic + '#' + strOf(rev) + '#' + entries.map((e) => e.ownerKey + ':' + e.face + ':' + e.key).sort().join(',');
        const pkg = {
            kind: 'lonsha-memory-package',
            packageId: 'mp_' + stableId(sig),
            schemaVersion: numOrNull(a.schemaVersion) === null ? 1 : numOrNull(a.schemaVersion),
            producerVersion: keyOf(a.producerVersion) || null,
            granularity: ns.granularity,
            scope: ns.scope,
            createdAt: Number.isFinite(Number(a.now)) ? Number(a.now) : Date.now(),
            revision: rev,
            license: lic,
            sourceRefs: sourceRefs,
            faces: faceInfo,
            entries: entries,
            knowledge: { keeperScoped: true, hidden: hidden, hiddenBy: byName > 0 ? 'by-name' : 'by-id', shadowed: shadowed },
            migrationNote: keyOf(a.migrationNote) || null,
            sensitiveCount: sensitiveCount,
            offline: true,
        };
        return { ok: true, reason: 'ok', offline: true, package: pkg, hidden: hidden,
            hiddenBy: pkg.knowledge.hiddenBy, sensitiveCount: sensitiveCount, absentFaces: absentFaces };
    }

    /* ──────────────────────────────────────────────────────────
     * ③ 判包：能收 / 要迁 / 明确拒（验收①：不得静默丢字段）
     * ────────────────────────────────────────────────────────── */
    /**
     * 包的代际读数。四态：ok（可解析）/ absent（没写）/ unparsable（写了不可读）/
     *   not-object（根本不是包）。★ 与 `schema-migration.schemaOf` 同口径，但**不引它**：
     *   那是存档载荷的读法，本模块要的是「包顶层键面 + 代际」两件一起出。
     */
    function schemaOf(pkg) {
        if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) return { kind: 'not-object', value: null };
        if (!Object.prototype.hasOwnProperty.call(pkg, 'schemaVersion')) return { kind: 'absent', value: null };
        const n = numOrNull(pkg.schemaVersion);
        if (n === null || n <= 0 || Math.floor(n) !== n) return { kind: 'unparsable', value: null };
        return { kind: 'ok', value: n };
    }
    /**
     * 准入（**本模块最核心的一格**）。
     * ★ 迁移路径**不问本模块**：一律问 `deps.SCHEMA_MIGRATION.plan()`（结构代际单一真源）。
     *   它是模块而缺席时降级为 `reject / migration-unavailable` —— **不假装已是当前代际**。
     * ★ 未知顶层键**默认拒**（`unknown-keys` + 逐条 `unknownKeys`）：静默丢字段正是
     *   验收①点名要治的那件事；只有调用方显式 `keepUnknown:true` 才放行并**留痕**。
     */
    function admitPackage(pkg, opts, deps) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const d = (deps && typeof deps === 'object') ? deps : {};
        const out = { verdict: ADMIT.REJECT, reason: '', from: null, to: null, steps: [], unknownKeys: [],
            keysChecked: false, keepUnknown: o.keepUnknown === true, migratable: false };
        if (pkg === null || pkg === undefined) return Object.assign(out, { reason: 'no-package' });
        if (typeof pkg !== 'object' || Array.isArray(pkg)) return Object.assign(out, { reason: 'not-object' });
        /* ① 键面：不认识的顶层键一律列出。ARCHIVE_KEYS 缺席 ⇒ 键面**未判**（不报「无未知键」）。 */
        const ak = Array.isArray(d.ARCHIVE_KEYS) ? d.ARCHIVE_KEYS : null;
        const known = new Set(PACKAGE_KEYS);
        if (ak) { out.keysChecked = true; for (const k of ak) known.add(k); }
        const unknownKeys = Object.keys(pkg).filter((k) => !known.has(k));
        out.unknownKeys = unknownKeys;
        if (unknownKeys.length && o.keepUnknown !== true) {
            return Object.assign(out, { reason: 'unknown-keys', why: '包顶层含本仓不认识的键 ' + unknownKeys.join('、') + '：默认拒不静默丢字段（要放行请显式 keepUnknown:true）' });
        }
        /* ② 代际：三态各自点名。 */
        const sc = schemaOf(pkg);
        out.from = sc.value;
        if (sc.kind === 'absent') return Object.assign(out, { reason: 'no-schema', why: '包没有 schemaVersion 字段（旧到连代际都没写），须人工确认结构后再导入' });
        if (sc.kind === 'unparsable') return Object.assign(out, { reason: 'schema-unparsable', why: 'schemaVersion 不可解析为正整数（值=' + JSON.stringify(pkg.schemaVersion) + '）' });
        const SM = d.SCHEMA_MIGRATION;
        if (!SM || typeof SM.plan !== 'function') {
            return Object.assign(out, { reason: 'migration-unavailable', why: '结构迁移模块缺席 ⇒ 无法判定本包的代际路径（**不假装已是当前代际**）' });
        }
        const target = numOrNull(o.target);
        const pl = safe(() => SM.plan(pkg, target === null ? SM.CURRENT : target), { verdict: 'unknown', why: '迁移面异常', steps: [] });
        const verdict = keyOf(pl && pl.verdict);
        out.to = numOrNull(pl && pl.to);
        out.steps = Array.isArray(pl && pl.steps) ? pl.steps.map((s) => ({ id: keyOf(s.id), from: numOrNull(s.from), to: numOrNull(s.to), why: keyOf(s.why) })) : [];
        if (verdict === 'too-new') return Object.assign(out, { reason: 'too-new', why: '包结构 v' + sc.value + ' 新于本插件 v' + out.to + '：降级读取不在迁移职责内，不得假装可导' });
        if (verdict === 'up-to-date') return Object.assign(out, { verdict: ADMIT.CURRENT, reason: 'ok', migratable: true, why: '已是最新结构代际 v' + out.to });
        if (verdict === 'plan') return Object.assign(out, { verdict: ADMIT.MIGRATE, reason: 'ok', migratable: true, why: '需迁移 ' + out.steps.length + ' 步：' + out.steps.map((s) => s.id).join(' → ') });
        /* unknown：**升代际未登记**与「包不可用」必须分开点名（压平即本仓最忌）。 */
        const why = keyOf(pl && pl.why);
        const reason = (pl && pl.broken !== undefined) ? 'no-migration-path' : 'no-schema';
        return Object.assign(out, { reason: reason, why: why || '迁移面判不出路径（不得读作「无需迁移」）' });
    }

    /* ──────────────────────────────────────────────────────────
     * ④ 来源状态：悬空可见，不伪装可跳转（验收③）
     * ────────────────────────────────────────────────────────── */
    /**
     * 来源状态三态。**没给活源表 ⇒ unknown**（判不了 ≠ 还在）；给了空表 ⇒
     *   source-deleted（查了，没有）。只有 live 且版本未漂移才 `navigable:true`。
     */
    function sourceStateOf(ref, liveSources) {
        const r = (ref && typeof ref === 'object') ? ref : null;
        const out = { ok: false, state: SOURCE.UNKNOWN, navigable: false, reason: '', versionShifted: false, sourceRef: sourceRefOf(r) };
        if (!r) return Object.assign(out, { reason: 'no-source-ref' });
        const session = keyOf(r.session); const branch = keyOf(r.branch); const version = keyOf(r.version);
        if (!session && !branch) return Object.assign(out, { reason: 'no-source-ref' });
        if (liveSources === null || liveSources === undefined || !Array.isArray(liveSources)) {
            return Object.assign(out, { reason: 'unknown-liveness' });
        }
        if (!liveSources.length) return Object.assign(out, { state: SOURCE.DELETED, reason: 'no-live-sources' });
        const hit = liveSources.find((s) => {
            const ss = (s && typeof s === 'object') ? s : {};
            return keyOf(ss.session) === session && (!branch || keyOf(ss.branch) === branch);
        });
        if (!hit) return Object.assign(out, { state: SOURCE.DELETED, reason: 'source-deleted' });
        const hv = keyOf(hit.version);
        const shifted = !!(version && hv && hv !== version);
        return Object.assign(out, { ok: true, state: SOURCE.LIVE, navigable: !shifted, reason: shifted ? 'version-shifted' : 'live', versionShifted: shifted });
    }

    /* ──────────────────────────────────────────────────────────
     * ⑤ 边界：会话 / 分支不得被打穿（验收⑤）
     * ────────────────────────────────────────────────────────── */
    /**
     * 边界比对。逐条比包内 `sourceRef.session / branch` 与目标作用域：
     *   不一致 ⇒ `boundary-cross` **进 blocked**，永不进可导入集合。
     * ★ 包 `sourceRefs` 与目标**同会话同分支**时不算越界（这是「原地再导一次」）。
     */
    function boundaryCheck(pkg, target, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const p = (pkg && typeof pkg === 'object') ? pkg : null;
        const t = sourceRefOf(target);
        const out = { ok: true, crosses: [], blocked: 0, checked: 0, allowCrossBranch: o.allowCrossBranch === true, why: [] };
        if (!p) return Object.assign(out, { ok: false, why: ['no-package'] });
        const refs = Array.isArray(p.sourceRefs) ? p.sourceRefs : [];
        out.checked = refs.length;
        for (const r of refs) {
            const sr = sourceRefOf(r);
            const sameSession = !sr.session || !t.session || sr.session === t.session;
            const sameBranch = !sr.branch || !t.branch || sr.branch === t.branch;
            if (!sameSession || !sameBranch) {
                out.crosses.push({ sourceRef: sr, target: t, why: !sameSession ? 'session-cross' : 'branch-cross' });
            }
        }
        if (out.crosses.length && o.allowCrossBranch !== true) {
            out.ok = false;
            out.blocked = out.crosses.length;
            out.why = out.crosses.map((c) => 'boundary-cross:' + c.why);
        }
        return out;
    }

    /* ──────────────────────────────────────────────────────────
     * ⑥ 预览：冲突 / 悬空 / 越界（验收·功能③ + ④）
     * ────────────────────────────────────────────────────────── */
    /** 条目身份键（**实体 id 优先**；只有名字才退到 name 并如实回报）。 */
    function entryKeyOf(e) {
        if (!e || typeof e !== 'object') return '';
        /* ★ 包内条目带的是 `ownerKey`（形如 `id:xxx` / `name:xxx`），目标面条目带的是
         *   `entityId` / `ownerId` / `id` —— 两者必须能对上，否则「同一条」会被读成 `add`，
         *   冲突检测整格失效（这正是本档自伤第一处）。故先归一 ownerKey，再退回实体字段。 */
        const ok0 = keyOf(e.ownerKey);
        if (ok0) return ok0 + '|' + keyOf(e.face) + ':' + keyOf(e.key);
        const eid = keyOf(e.entityId !== undefined ? e.entityId : (e.ownerId !== undefined ? e.ownerId : e.id));
        if (eid) return 'id:' + eid + '|' + keyOf(e.face) + ':' + keyOf(e.key);
        const nm = keyOf(e.name !== undefined ? e.name : e.owner);
        if (nm) return 'name:' + nm + '|' + keyOf(e.face) + ':' + keyOf(e.key);
        return keyOf(e.face) + ':' + keyOf(e.key);
    }
    /**
     * 导入预览（**零写**）。逐条与目标现值比对，出四类读数：
     *   · `add`      目标没有这条 ⇒ 直接可加
     *   · `same`     目标已有**同值** ⇒ 幂等跳过（**不当作冲突**）
     *   · `conflict` 目标已有**不同值** ⇒ 默认 skip（`undecided`），只有显式 `allowReplace` 才出 replace
     *   · `dangling` 条目自报的 `evidenceRef` / `refId` 在目标里找不到源 ⇒ 显示悬空，**不伪装可跳转**
     * ★ 冲突默认**不替用户决定**：与 X7 `previewContinuation` 同纪律（不猜「谁是对的」）。
     */
    function previewImport(pkg, target, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const out = { verdict: PREVIEW.OK, entries: [], add: 0, same: 0, conflict: 0, dangling: 0,
            blocked: [], duplicates: 0, skipped: 0, targetChecked: false, why: [] };
        const p = (pkg && typeof pkg === 'object') ? pkg : null;
        if (!p) return Object.assign(out, { verdict: PREVIEW.BLOCKED, why: ['no-package'] });
        const list = Array.isArray(p.entries) ? p.entries : [];
        const tgt = (target && typeof target === 'object') ? target : null;
        /* 目标现值索引（实体 id 优先；同键多值时如实报 ambiguous，不猜）。 */
        const index = new Map();
        if (tgt) {
            const tfaces = (tgt.faces && typeof tgt.faces === 'object') ? tgt.faces : {};
            for (const f of FACES) {
                const arr = Array.isArray(tfaces[f]) ? tfaces[f] : [];
                for (const e of arr) {
                    if (!e || typeof e !== 'object') continue;
                    const k = entryKeyOf(Object.assign({ face: f }, e));
                    if (!k) continue;
                    if (!index.has(k)) index.set(k, []);
                    index.get(k).push(e);
                }
            }
            out.targetChecked = true;
        }
        const knownRefs = new Set(arrOf(o.knownRefs).map(keyOf).filter(Boolean));
        const refsChecked = (o.knownRefs !== undefined && o.knownRefs !== null);
        const steps = [];
        for (const e of list) {
            if (!e || typeof e !== 'object') continue;
            const k = entryKeyOf(e);
            const rec = { key: k, face: keyOf(e.face), field: keyOf(e.key), action: 'add', why: 'target-absent', sensitive: e.sensitive === true };
            if (tgt && index.has(k)) {
                const cur = index.get(k);
                const hitSame = cur.some((x) => sameValue(x.value, e.value));
                if (cur.length > 1) { rec.action = 'conflict'; rec.why = 'target-ambiguous'; out.conflict++; }
                else if (hitSame) { rec.action = 'skip'; rec.why = 'already-same'; out.same++; out.skipped++; }
                else if (o.allowReplace === true) { rec.action = 'replace'; rec.why = 'explicit-replace'; out.conflict++; }
                else { rec.action = 'skip'; rec.why = 'undecided'; out.conflict++; out.skipped++; }
            } else { out.add++; }
            /* 悬空来源：条目自报 ref 在目标里找不到 ⇒ 显示悬空（不伪装可跳转）。
             *   `knownRefs` 未给 ⇒ **未判**（不报「无悬空」）—— 两件事不同形。 */
            const needRef = keyOf(e.refId || e.evidenceRef);
            if (refsChecked && needRef && !knownRefs.has(needRef)) { rec.action = (rec.action === 'skip' ? 'skip' : 'dangling'); rec.why = 'dangling-source'; out.dangling++; }
            steps.push(rec);
        }
        const bc = boundaryCheck(p, o.targetRef || (tgt && tgt.sourceRef), o);
        if (!bc.ok) { out.verdict = PREVIEW.BLOCKED; out.blocked = bc.why.slice(); out.why = out.why.concat(bc.why); }
        else if (out.conflict || out.dangling) out.verdict = PREVIEW.WARN;
        out.entries = steps;
        return out;
    }

    /* ──────────────────────────────────────────────────────────
     * ⑦ 部分导入：幂等账在调用方手里（验收②）
     * ────────────────────────────────────────────────────────── */
    /**
     * 出导入计划（**纯函数零写**）。
     * ★ `importId = 'im_' + stableId(packageId + '#' + scopeKey + '#' + revision)` ——
     *   同包同目标恒同 id；`seen` 数组由**调用方**持有并回传，命中即 `duplicate:true`
     *   且 `applied` 为空。本模块不偷偷写第二份导入账。
     * ★ 被挡（`blocked` 非空）；`applied` 显式 `0`。
     */
    function planImport(pkg, preview, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const p = (pkg && typeof pkg === 'object') ? pkg : null;
        const pv = (preview && typeof preview === 'object') ? preview : null;
        const out = { ok: false, importId: '', duplicate: false, applied: [], count: 0, total: 0,
            skipped: [], blocked: [], writesNothing: true, reason: '' };
        if (!p) return Object.assign(out, { reason: 'no-package' });
        if (!pv) return Object.assign(out, { reason: 'no-preview', why: '必须先预览再导入（预览是唯一的冲突判据）' });
        if (pv.verdict === PREVIEW.BLOCKED || (pv.blocked && pv.blocked.length)) {
            return Object.assign(out, { reason: 'boundary-blocked', blocked: (pv.blocked || []).slice() });
        }
        const ns = normalizeScope(p.scope);
        const importId = 'im_' + stableId(keyOf(p.packageId) + '#' + ns.scopeKey + '#' + strOf(p.revision));
        out.importId = importId;
        const seen = arrOf(o.seen).map(keyOf).filter(Boolean);
        if (seen.indexOf(importId) >= 0) {
            return Object.assign(out, { ok: true, duplicate: true, reason: 'duplicate-import', count: 0 });
        }
        const steps = Array.isArray(pv.entries) ? pv.entries : [];
        out.total = steps.length;
        for (const s of steps) {
            if (!s || typeof s !== 'object') continue;
            if (s.action === 'skip') { out.skipped.push({ key: s.key, why: s.why }); continue; }
            out.applied.push({ key: s.key, face: s.face, field: s.field, action: s.action, sensitive: s.sensitive === true });
        }
        out.count = out.applied.length;
        out.ok = true;
        out.reason = out.count ? 'ok' : 'nothing-to-apply';
        return out;
    }

    /* ──────────────────────────────────────────────────────────
     * ⑧ 撤销：有来源边界（验收⑤ + 功能④）
     * ────────────────────────────────────────────────────────── */
    /**
     * 撤销清单：只撤**来源在 scope 内的**条目，范围外的**一条不动**。
     * ★ 没给 scope ⇒ 拒绝：撤销不是推倒重来（与 X7 `revokeHandoff` 同纪律）。
     * ★ 已撤条重复调用**不再计**（幂等）。
     */
    function revokeImport(args) {
        const a = (args && typeof args === 'object') ? args : {};
        const out = { ok: false, reason: '', revoked: [], count: 0, untouched: 0, total: 0, already: 0, scope: null };
        const sc = (a.scope && typeof a.scope === 'object') ? a.scope : null;
        if (!sc || (!keyOf(sc.packageId) && !keyOf(sc.importId) && !keyOf(sc.scopeKey))) {
            return Object.assign(out, { reason: 'no-scope', why: '撤销必须带来源范围（packageId / importId / scopeKey）：不带范围就是推倒重来' });
        }
        out.scope = { packageId: keyOf(sc.packageId), importId: keyOf(sc.importId), scopeKey: keyOf(sc.scopeKey) };
        const applied = arrOf(a.applied);
        out.total = applied.length;
        const already = arrOf(a.alreadyRevoked).map(keyOf).filter(Boolean);
        for (const e of applied) {
            if (!e || typeof e !== 'object') continue;
            const k = keyOf(e.key);
            if (sc.scopeKey && keyOf(e.scopeKey) && keyOf(e.scopeKey) !== keyOf(sc.scopeKey)) { out.untouched++; continue; }
            if (already.indexOf(k) >= 0) { out.already++; continue; }
            out.revoked.push({ key: k, face: keyOf(e.face), field: keyOf(e.field) });
        }
        out.count = out.revoked.length;
        out.ok = true;
        out.reason = out.count ? 'ok' : (out.untouched ? 'out-of-scope' : 'nothing-to-revoke');
        return out;
    }

    /* ──────────────────────────────────────────────────────────
     * ⑨ 自述 / 自检 / 诊断一行
     * ────────────────────────────────────────────────────────── */
    /** 自述：缺哪一格、缺了会怎样（只读、不抛）。 */
    function describe(deps) {
        const d = (deps && typeof deps === 'object') ? deps : {};
        const missing = [];
        for (const need of REQUIRED_DEPS) if (d[need.key] === undefined || d[need.key] === null) missing.push({ key: need.key, why: need.why });
        return {
            kind: 'memory-package-describe', version: MP_VERSION,
            granularity: GRANULARITY.slice(), admit: Object.keys(ADMIT).map((k) => ADMIT[k]),
            preview: Object.keys(PREVIEW).map((k) => PREVIEW[k]), sources: Object.keys(SOURCE).map((k) => SOURCE[k]),
            rejectReasons: REJECT_REASONS.slice(), faces: FACES.slice(),
            secretBodyKeys: SECRET_BODY_KEYS.slice(), bodyMax: BODY_MAX, packageKeys: PACKAGE_KEYS.slice(),
            present: REQUIRED_DEPS.length - missing.length, total: REQUIRED_DEPS.length, missing: missing,
            offline: true, writesNothing: true,
            /* ★ 面级自述：**三态各自可达**（不是对常量自己断言 —— 那是对词表自己断言，
             *   本仓定性过的自我指涉判据）。拿真包过一遍 `admitPackage`，要求产出的态
             *   集合**恰好等于**词表：少一个 ⇒ 那类处境无处安放；多一个 ⇒ 词表里有骗人的字。
             *   `migrate` 档在本仓当前代际（注册表为空）下没有现成载荷，故用一个
             *   **显式声明的探针注册表包装**（借真 `plan` 的其余分支，只把 target=2 那一路
             *   喂一条步骤）—— 这是探针，不是生产路径，故写明来源。 */
            admitExhaustive: (function () {
                const SM = d.SCHEMA_MIGRATION;
                if (!SM || typeof SM.plan !== 'function') return false;
                const probeSM = Object.assign({}, SM, {
                    plan: function (p, t) {
                        if (t === 2) return { verdict: 'plan', to: 2, from: 1, steps: [{ id: 'probe-0to1', from: 1, to: 2, why: '探针：只为覆盖 migrate 档' }] };
                        return SM.plan(p, typeof t === 'number' ? t : SM.CURRENT);
                    }
                });
                const dProbe = Object.assign({}, d, { SCHEMA_MIGRATION: probeSM });
                const got = [
                    admitPackage({ schemaVersion: 1 }, {}, d).verdict,
                    admitPackage({ schemaVersion: 1 }, { target: 2 }, dProbe).verdict,
                    admitPackage({ schemaVersion: 9 }, {}, d).verdict,
                    admitPackage(null, {}, d).verdict,
                ];
                const want = [ADMIT.CURRENT, ADMIT.MIGRATE, ADMIT.REJECT];
                for (const w of want) if (got.indexOf(w) < 0) return false;
                return got.every((v) => want.indexOf(v) >= 0);
            })(),
            /* ★ 定长掩码：站位串**不随原文本长变化**（否则长度本身就是读数）。 */
            maskFixedLength: (function () {
                const a = maskEntry({ key: 'k', secret: 'x' }, SECRET_BODY_KEYS).out.value;
                const b = maskEntry({ key: 'k', secret: 'x'.repeat(200) }, SECRET_BODY_KEYS).out.value;
                return a === b && a === SECRET_MASK;
            })(),
            note: missing.length ? '依赖缺 ' + missing.length + ' 格（' + missing.map((m) => m.key).join('、') + '）' : '依赖齐备'
        };
    }
    /** 自检（判据套件咬这里；四项各自独立，不合成一个布尔）。 */
    function selfCheck(deps) {
        const d = (deps && typeof deps === 'object') ? deps : {};
        const missing = REQUIRED_DEPS.filter((n) => d[n.key] === undefined || d[n.key] === null).map((n) => n.key);
        const dsc = describe(d);
        return {
            ok: missing.length === 0 && dsc.admitExhaustive === true,
            version: MP_VERSION,
            depsComplete: missing.length === 0, missing: missing,
            admitExhaustive: dsc.admitExhaustive === true,
            maskFixedLength: dsc.maskFixedLength === true,
            reasonsDistinct: new Set(REJECT_REASONS).size === REJECT_REASONS.length,
            offline: true, writesNothing: true
        };
    }
    /** 诊断一行（四态分开报；没有记录时「还没导入过」与「一条都没进」不同形）。 */
    function line(read) {
        try {
            if (!read || typeof read !== 'object') return '尚未导入过（无记录 · 粒度 ' + GRANULARITY.length + ' 档 · 拒绝理由 ' + REJECT_REASONS.length + ' 条）';
            const parts = ['导入 ' + keyOf(read.verdict || '—')];
            const c = numOrNull(read.count);
            if (c !== null) parts.push('进 ' + c);
            if (numOrNull(read.duplicate) === 1 || read.duplicate === true) parts.push('重复');
            if (numOrNull(read.dangling)) parts.push('悬空 ' + numOrNull(read.dangling));
            if (numOrNull(read.blocked)) parts.push('⚠️ 越界挡 ' + numOrNull(read.blocked));
            if (read.reason) parts.push('理由 ' + keyOf(read.reason));
            return parts.join(' · ');
        } catch (_e) { return '—（包面异常）'; }
    }

    const api = Object.freeze({
        MP_VERSION, GRANULARITY, ADMIT, PREVIEW, SOURCE, REJECT_REASONS, PACKAGE_KEYS,
        SECRET_BODY_KEYS, SECRET_MASK, BODY_MAX, FACES, LICENSE, REQUIRED_DEPS,
        normalizeScope, isSecret, maskEntry, filterByKeeper, sourceRefOf, schemaOf,
        buildPackage, admitPackage, sourceStateOf, boundaryCheck, entryKeyOf,
        previewImport, planImport, revokeImport,
        describe, selfCheck, line
    });
    root.LonShaMemoryPackage = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
