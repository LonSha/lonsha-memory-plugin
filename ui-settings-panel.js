/**
 * ui-settings-panel.js — 声明式设置页组装器（v3.482.0）
 *
 * 【为什么需要这一层】
 *   settings-ui.js 有 5,906 行，是仓内最大的单个 UI 文件。它的形态是
 *   「一个子系统各写一遍自己的设置页」：每个页都自带标题栏、搜索框、分组、
 *   行、脏值跟踪、保存条、危险区。结果是同一套骨架被抄了多次，改一处交互
 *   要动很多处，而且各页的保存语义已经开始分叉（有的保存失败也清脏值、
 *   有的搜索只看标题不看键名）。
 *
 *   本文件把「设置页」抽成一层：**schema 描述有什么，本文件负责画**。
 *   css/lonsha-settings.css 已经把视觉做完了，这一层是它的第一个真实使用者 ——
 *   样式层没有 JS 消费者时，任何 bug 都只能在真机上被发现。
 *
 * 【三条纪律】
 *   1. schema 写错要看得见。未知 kind / 重复 key / 缺 key / 值域非法，
 *      一律在页面上渲染成一条说明性提示，**不静默丢弃**。
 *      丢掉一个设置项，用户会以为「这功能没有」，而这种误解永远不会有人来报。
 *   2. 保存失败不许清脏值。脏值清零等于把用户刚改的东西判定为「已入库」，
 *      下一次刷新就没了 —— 这是最伤人的一类数据丢失，因为它无声。
 *   3. 纯函数与渲染分离。文件上半部分不碰 DOM，Node 侧可以直接单测；
 *      渲染部分全部经 ui-kit 的对象签名 `el(tag, props, children)` 构造。
 *
 * 【一个刻意的性能/正确性取舍】
 *   搜索与折叠会**整片重建 body**，但控件值变化**只更新保存条与脏标记**，
 *   绝不重建 body。原因：拖滑杆时每次 onChange 都重建 body 会把正在拖的
 *   元素从 DOM 上摘掉，拖拽立刻断 —— 这个 bug 在真机上是「滑杆拖一下就跳走」，
 *   在 Node 自检里永远测不出来。设置页行数很少（通常 < 200 行），
 *   整片重建的开销可以忽略，所以选择「重建简单路径 + 逐行更新热路径」。
 */
(function (root) {
    'use strict';

    const VERSION = '1.0.0';

    /* ================================================================
     * 0. 依赖解析
     * ================================================================ */

    function safeRequire(p) {
        try { return require(p); } catch (_e) { return null; }
    }

    function kit() {
        try { if (root && root.LonShaUiKit) return root.LonShaUiKit; } catch (_e) { /* ignore */ }
        try {
            if (typeof window !== 'undefined' && window.LonShaUiKit) return window.LonShaUiKit;
        } catch (_e) { /* ignore */ }
        return typeof require === 'function' ? safeRequire('./ui-kit-core.js') : null;
    }

    /* 表单控件库。三级回退：全局 → window → 本仓 require。 */
    function formLib() {
        try { if (root && root.LonShaFormControls) return root.LonShaFormControls; } catch (_e) { /* ignore */ }
        try {
            if (typeof window !== 'undefined' && window.LonShaFormControls) return window.LonShaFormControls;
        } catch (_e) { /* ignore */ }
        return typeof require === 'function' ? safeRequire('./ui-form-controls.js') : null;
    }

    function doc() {
        return (typeof document !== 'undefined' && document) ? document : null;
    }

    function absent(reason, extra) {
        const out = { ok: false, kind: 'absent', reason: String(reason) };
        if (extra) Object.keys(extra).forEach((k) => { out[k] = extra[k]; });
        return out;
    }

    /* 深拷贝。不用 JSON.parse(JSON.stringify())：那会把 undefined 变成缺失键、
     * 把 NaN 变成 null，而配置对象里这三者都有可能出现。 */
    function deepClone(v) {
        if (v === null || typeof v !== 'object') return v;
        if (Array.isArray(v)) return v.map(deepClone);
        const out = {};
        Object.keys(v).forEach((k) => { out[k] = deepClone(v[k]); });
        return out;
    }

    /* ================================================================
     * 1. 纯函数：schema 归一
     *    【设计】不认识的 kind 不丢弃 —— 降级成 'unsupported' 行，
     *    在页面上明说「本版不认识这个控件」，因为丢弃的后果是误解而非报错。
     * ================================================================ */

    const KNOWN_KINDS = [
        'switch', 'slider', 'stepper', 'seg', 'text', 'textarea', 'select',
        'color', 'chips', 'action', 'note', 'static', 'file', 'kv',
    ];

    /* 需要 key 的（可写值）控件。action/note/static 没有可写值，key 可省。 */
    const KEYED_KINDS = [
        'switch', 'slider', 'stepper', 'seg', 'text', 'textarea', 'select',
        'color', 'chips', 'file', 'kv',
    ];

    function normalizeRow(raw, group, index, seen, dupes, unknown) {
        if (!raw || typeof raw !== 'object') return null;

        const kind = String(raw.kind == null ? '' : raw.kind);
        const key = raw.key == null ? '' : String(raw.key);
        const id = group.id + ':' + (key || '#' + index);

        const row = {
            id,
            key,
            kind,
            unsupported: '',
            label: String(raw.label || key || kind || '未命名项'),
            desc: raw.desc ? String(raw.desc) : '',
            warn: !!raw.warn,
            effect: raw.effect ? String(raw.effect) : '',
            tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
            options: raw.options,
            min: raw.min,
            max: raw.max,
            step: raw.step,
            unit: raw.unit,
            placeholder: raw.placeholder,
            maxLength: raw.maxLength,
            multiline: raw.multiline === true,
            defaultValue: raw.default,
            wide: !!raw.wide,
            disabled: !!raw.disabled,
            groupId: group.id,
            groupTitle: group.title,
            advanced: group.advanced,
            danger: !!raw.danger,
            confirm: raw.confirm ? String(raw.confirm) : '',
            raw,
        };

        if (KNOWN_KINDS.indexOf(kind) < 0) {
            row.kind = 'unsupported';
            row.unsupported = '本版不认识的控件 kind="' + kind + '"';
            unknown.push({ id, key, kind, group: group.id });
            return row;
        }

        if (KEYED_KINDS.indexOf(kind) >= 0 && !key) {
            row.kind = 'unsupported';
            row.unsupported = '缺少 key，无法读写（kind="' + kind + '"）';
            unknown.push({ id, key, kind, group: group.id });
            return row;
        }

        if (key) {
            if (seen.has(key)) {
                /* 重复 key 必须报：两行写同一个键等于「后写的赢」，
                 * 用户改上面那行会看到下面的值被改，且没有任何提示。 */
                dupes.push({ key, first: seen.get(key), again: id });
                row.kind = 'unsupported';
                row.unsupported = '重复 key（已被 ' + seen.get(key) + ' 占用）';
                return row;
            }
            seen.set(key, id);
        }

        /* 预计算检索串：搜索要在 key / 标题 / 说明 / 标签 / 单位 上都命中。
         * 只看标题会让「按键名搜索」这个高级用户最常用的路径失效。 */
        row.haystack = (key + ' ' + row.label + ' ' + row.desc + ' ' +
            row.tags.join(' ') + ' ' + (row.unit || '') + ' ' + row.groupTitle).toLowerCase();

        return row;
    }

    /**
     * normalizeSchema(schema) → { ok, groups, rows, byKey, dupes, unknown, dropped, ... }
     *
     * 返回 ok:false 只在**结构不可用**时（不是对象 / groups 不是数组）。
     * 单行写得不对不会让整页失败 —— 整页失败等于用户完全打不开设置，
     * 比「有一行显示错误说明」严重得多。
     */
    function normalizeSchema(schema) {
        if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
            return { ok: false, kind: 'absent', reason: 'schema 不是对象' };
        }
        if (!Array.isArray(schema.groups)) {
            return { ok: false, kind: 'absent', reason: 'schema.groups 不是数组' };
        }

        const groups = [];
        const rows = [];
        const seen = new Map();
        const dupes = [];
        const unknown = [];
        const dropped = [];

        schema.groups.forEach((g, gi) => {
            if (!g || typeof g !== 'object') {
                dropped.push('第 ' + (gi + 1) + ' 组不是对象');
                return;
            }
            const group = {
                id: String(g.id || ('g' + gi)),
                title: String(g.title || ('第 ' + (gi + 1) + ' 组')),
                note: g.note ? String(g.note) : '',
                advanced: !!g.advanced,
                advancedWarn: g.advancedWarn ? String(g.advancedWarn) : '',
                danger: !!g.danger,
                rows: [],
            };
            if (!Array.isArray(g.rows)) {
                dropped.push('组「' + group.title + '」的 rows 不是数组');
                groups.push(group);
                return;
            }
            g.rows.forEach((r, ri) => {
                const row = normalizeRow(r, group, ri, seen, dupes, unknown);
                if (!row) {
                    dropped.push('组「' + group.title + '」第 ' + (ri + 1) + ' 行不是对象');
                    return;
                }
                group.rows.push(row);
                rows.push(row);
            });
            groups.push(group);
        });

        const byKey = {};
        /* 只有**可写**的行进 byKey。action/note 的 key 只是标识，
         * 把它们算进可写键会让「导出 → 导入」多出一个不可赋值的键。 */
        rows.forEach((r) => {
            if (r.kind !== 'unsupported' && r.key && KEYED_KINDS.indexOf(r.kind) >= 0) byKey[r.key] = r;
        });

        return {
            ok: true,
            title: schema.title ? String(schema.title) : '设置',
            sub: schema.sub ? String(schema.sub) : '',
            version: schema.version == null ? '' : String(schema.version),
            groups,
            rows,
            byKey,
            keys: Object.keys(byKey),
            dupes,
            unknown,
            dropped,
            total: rows.length,
            usable: rows.filter((r) => r.kind !== 'unsupported').length,
        };
    }

    /* ================================================================
     * 2. 纯函数：搜索与命中标注
     * ================================================================ */

    function matchRow(row, query) {
        const q = String(query == null ? '' : query).trim().toLowerCase();
        if (!q) return true;
        if (!row) return false;
        const hay = row.haystack || (String(row.key || '') + ' ' + String(row.label || '')).toLowerCase();
        return hay.indexOf(q) >= 0;
    }

    /**
     * highlightParts(text, query) → [{ text, hit }]
     *
     * 返回切片而不是拼 innerHTML：标题与说明来自 schema，其中可能含
     * `<`、`&` 之类字符，走 innerHTML 就是一个注入口子。渲染层用
     * textNode + <mark class="ls-hit"> 拼回去。
     *
     * 不区分大小写，但保留原文大小写 —— 命中标注不该顺手改写用户看到的字。
     */
    function highlightParts(text, query) {
        const s = String(text == null ? '' : text);
        const q = String(query == null ? '' : query).trim();
        if (!s) return [];
        const lq = q.toLowerCase();
        if (!lq) return [{ text: s, hit: false }];

        const lower = s.toLowerCase();
        const parts = [];
        let i = 0;
        while (i < s.length) {
            const at = lower.indexOf(lq, i);
            if (at < 0) {
                parts.push({ text: s.slice(i), hit: false });
                break;
            }
            if (at > i) parts.push({ text: s.slice(i, at), hit: false });
            parts.push({ text: s.slice(at, at + lq.length), hit: true });
            i = at + lq.length;
        }
        return parts;
    }

    /**
     * filterSchema(norm, query) → { query, groups, count, total, narrowed, empty }
     *
     * 【关键】搜索命中落在高级折叠组里时，该组必须**自动展开**（autoOpen），
     * 否则用户搜到 1 条却看不见任何东西 —— 表现为「搜了跟没搜一样」，
     * 而实际上判据全绿（因为确实过滤对了）。
     */
    function filterSchema(norm, query) {
        if (!norm || !norm.ok) {
            return { query: '', groups: [], count: 0, total: 0, narrowed: false, empty: true };
        }
        const q = String(query == null ? '' : query).trim();

        if (!q) {
            return {
                query: '',
                groups: norm.groups.map((g) => ({
                    ...g,
                    rows: g.rows.slice(),
                    autoOpen: !g.advanced,
                    hasHit: g.rows.length > 0,
                })),
                count: norm.rows.length,
                total: norm.rows.length,
                narrowed: false,
                empty: norm.rows.length === 0,
            };
        }

        const out = [];
        let count = 0;
        norm.groups.forEach((g) => {
            const rows = g.rows.filter((r) => matchRow(r, q));
            if (!rows.length) return;
            count += rows.length;
            out.push({ ...g, rows, autoOpen: true, hasHit: true });
        });

        return {
            query: q,
            groups: out,
            count,
            total: norm.rows.length,
            narrowed: true,
            empty: count === 0,
        };
    }

    /* ================================================================
     * 3. 纯函数：脏值与保存状态
     * ================================================================ */

    /* 0 处改动不输出文字：此时保存条是隐藏的，这个标签没有读者。
     * 显示「0 处未保存」会让用户以为有个看不见的地方存了东西。 */
    function formatDirty(n) {
        const v = Number(n);
        if (!Number.isFinite(v) || v <= 0) return '';
        return v + ' 处未保存';
    }

    /**
     * pickSaveState({ dirty, saving, error }) → 保存条的完整描述
     *
     *   clean → 隐藏（translateY 离场，pointer-events:none）
     *   dirty → 升起，可保存可放弃
     *   busy  → 保留升起但按钮禁用（不要隐藏：隐藏会让用户以为点空了）
     *   error → 保留脏值 + 显示原因 + 允许重试（**失败不清脏值**）
     */
    function pickSaveState(o) {
        const opts = o || {};
        const dirty = Math.max(0, Math.floor(Number(opts.dirty) || 0));
        if (opts.saving) {
            return {
                state: 'busy', visible: true, canSave: false, canDiscard: false,
                label: '保存中…', text: formatDirty(dirty) || '正在写入', tone: 'busy',
            };
        }
        if (opts.error) {
            return {
                state: 'error', visible: true, canSave: true, canDiscard: true,
                label: '重试保存', text: String(opts.error), tone: 'error',
            };
        }
        if (dirty > 0) {
            return {
                state: 'dirty', visible: true, canSave: true, canDiscard: true,
                label: '保存', text: formatDirty(dirty), tone: 'dirty',
            };
        }
        return {
            state: 'clean', visible: false, canSave: false, canDiscard: false,
            label: '保存', text: '', tone: 'clean',
        };
    }

    /* 比较两个值。不用 JSON.stringify 比：键序不同会被判成「有改动」，
     * 于是用户什么都没动就看到保存条升起。 */
    function sameValue(a, b) {
        if (Object.is(a, b)) return true;   // Object.is 已处理 NaN 与 ±0
        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i += 1) {
                if (!sameValue(a[i], b[i])) return false;
            }
            return true;
        }
        if (a && b && typeof a === 'object' && typeof b === 'object') {
            if (Array.isArray(a) !== Array.isArray(b)) return false;
            const ka = Object.keys(a);
            const kb = Object.keys(b);
            if (ka.length !== kb.length) return false;
            for (let i = 0; i < ka.length; i += 1) {
                const k = ka[i];
                if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
                if (!sameValue(a[k], b[k])) return false;
            }
            return true;
        }
        return false;
    }

    /** 键集合的对称差里「值不同」的那些键，排序输出保证判据稳定。 */
    function diffKeys(base, draft) {
        const b = base || {};
        const d = draft || {};
        const keys = new Set();
        Object.keys(b).forEach((k) => keys.add(k));
        Object.keys(d).forEach((k) => keys.add(k));
        const changed = [];
        keys.forEach((k) => {
            if (!sameValue(b[k], d[k])) changed.push(k);
        });
        changed.sort();
        return changed;
    }

    function buildPatch(base, draft) {
        const keys = diffKeys(base, draft);
        const patch = {};
        keys.forEach((k) => {
            if (draft && Object.prototype.hasOwnProperty.call(draft, k)) patch[k] = draft[k];
            else patch[k] = undefined;   // 删除：显式 undefined，不悄悄少一个键
        });
        return { ok: true, keys, patch, dirty: keys.length };
    }

    /* ================================================================
     * 4. 纯函数：值归一（导入与写入前的最后一道闸）
     *    【本仓最贵的教训之一】Boolean('false') === true。
     *    字符串开关值必须显式列表比对，绝不能用 !!raw 或 Boolean(raw)。
     * ================================================================ */

    const TRUE_WORDS = ['true', '1', 'on', 'yes', '开'];
    const FALSE_WORDS = ['false', '0', 'off', 'no', '关'];

    function coerceValue(kind, raw, row) {
        const r = row || {};
        switch (String(kind || '')) {
            case 'switch': {
                if (typeof raw === 'boolean') return { ok: true, value: raw };
                if (typeof raw === 'number') return { ok: true, value: raw !== 0 };
                const s = String(raw == null ? '' : raw).trim().toLowerCase();
                if (TRUE_WORDS.indexOf(s) >= 0) return { ok: true, value: true };
                if (FALSE_WORDS.indexOf(s) >= 0) return { ok: true, value: false };
                return { ok: false, reason: '「' + String(raw) + '」不是一个开关值' };
            }
            case 'slider':
            case 'stepper': {
                const n = (typeof raw === 'number') ? raw : Number(String(raw == null ? '' : raw).trim());
                if (!Number.isFinite(n)) return { ok: false, reason: '「' + String(raw) + '」不是数字' };
                const lib = formLib();
                if (!lib || typeof lib.clampStep !== 'function') {
                    return { ok: false, reason: 'ui-form-controls.js 未加载，无法校验值域' };
                }
                const probe = lib.clampStep(n, r);
                if (!probe.ok) return { ok: false, reason: probe.reason };
                /* 被夹住要报出来：静默夹紧会让「导入的值」和「文件里的值」不一致，
                 * 而用户以为导成功了。 */
                return { ok: true, value: probe.value, clamped: !sameValue(probe.value, n) };
            }
            case 'seg': {
                const lib = formLib();
                if (!lib || typeof lib.normalizeSegments !== 'function') {
                    return { ok: false, reason: 'ui-form-controls.js 未加载，无法校验选项' };
                }
                const norm = lib.normalizeSegments(r.options);
                if (!norm.ok) return { ok: false, reason: norm.reason };
                const key = String(raw);
                const hit = norm.items.filter((it) => String(it.value) === key)[0];
                /* 不在选项里**不回退到第一项**：回退会让「导入了一个非法值」
                 * 变成「静默改成了第一项」，用户永远发现不了。 */
                if (!hit) return { ok: false, reason: '「' + key + '」不在选项里' };
                return { ok: true, value: hit.value };
            }
            case 'color': {
                const lib = formLib();
                if (!lib || typeof lib.normalizeHex !== 'function') {
                    return { ok: false, reason: 'ui-form-controls.js 未加载，无法校验颜色' };
                }
                const h = lib.normalizeHex(raw);
                if (!h.ok) return { ok: false, reason: h.reason };
                return { ok: true, value: h.value, alpha: h.alpha };
            }
            case 'text':
            case 'textarea': {
                const s = raw == null ? '' : String(raw);
                const max = Number(r.maxLength);
                if (Number.isFinite(max) && max > 0 && s.length > max) {
                    /* 超长不截断：截断会让用户以为已存好，实际内容少了一截。 */
                    return { ok: false, reason: '超出 ' + (s.length - max) + ' 个字（上限 ' + max + '）' };
                }
                return { ok: true, value: s };
            }
            case 'chips': {
                const arr = Array.isArray(raw) ? raw : String(raw == null ? '' : raw).split(',');
                const seen = new Set();
                const out = [];
                arr.forEach((x) => {
                    const s = String(x == null ? '' : x).trim();
                    if (!s) return;
                    if (seen.has(s)) return;
                    seen.add(s);
                    out.push(s);
                });
                return { ok: true, value: out };
            }
            case 'select': {
                const s = raw == null ? '' : String(raw);
                if (Array.isArray(r.options)) {
                    const okv = r.options.filter((o) => String(o && o.value !== undefined ? o.value : o) === s)[0];
                    if (okv === undefined && s !== '') {
                        return { ok: false, reason: '「' + s + '」不在选项里' };
                    }
                }
                return { ok: true, value: s };
            }
            case 'static':
            case 'kv':
            case 'file':
                return { ok: true, value: deepClone(raw) };
            default:
                return { ok: false, reason: '不可写的 kind="' + String(kind) + '"' };
        }
    }

    /** 导出：只导 schema 里的键，且只导可写的。 */
    function exportValues(values, norm) {
        const src = values || {};
        const out = {};
        const keys = (norm && norm.ok) ? norm.keys : Object.keys(src);
        keys.forEach((k) => {
            const row = (norm && norm.ok) ? norm.byKey[k] : null;
            const v = src[k];
            if (v === undefined) return;
            /* 写回 schema 里的默认值没有意义，但那属于「瘦身」不属于正确性，
             * 这里全部导出：少导一个键，导入端就会把它当成缺失。 */
            out[k] = typeof v === 'number' && !Number.isFinite(v) ? null : deepClone(v);
            void row;
        });
        return { version: (norm && norm.version) || '', keys, values: out };
    }

    /**
     * importValues(text, norm) → { ok, values, invalid, unknown, ignored }
     *
     * ok:false 只在**结构层失败**（不是 JSON / 不是对象 / values 不是对象）。
     * 单键归一失败进 invalid 并原样上报，由界面决定是否整体拒绝 ——
     * 这里不替调用方做「一半生效」的决定。
     */
    function importValues(text, norm) {
        let data;
        try {
            data = JSON.parse(String(text == null ? '' : text));
        } catch (e) {
            return { ok: false, kind: 'absent', reason: '不是合法 JSON：' + String(e && e.message || e) };
        }
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            return { ok: false, kind: 'absent', reason: '导入内容不是对象' };
        }
        const payload = (data.values && typeof data.values === 'object' && !Array.isArray(data.values))
            ? data.values
            : data;

        const values = {};
        const invalid = [];
        const unknown = [];
        const ignored = [];

        Object.keys(payload).forEach((k) => {
            if (k === 'version') { ignored.push(k); return; }
            if (k === 'values' && payload === data) { ignored.push(k); return; }
            const row = (norm && norm.ok) ? norm.byKey[k] : null;
            if (!row) {
                unknown.push(k);   // 不认识的键不写入，但必须报出来
                return;
            }
            const cv = coerceValue(row.kind, payload[k], row);
            if (!cv.ok) {
                invalid.push({ key: k, reason: cv.reason, input: payload[k] });
                return;
            }
            values[k] = cv.value;
        });

        return {
            ok: true,
            version: data.version == null ? '' : String(data.version),
            values,
            invalid,
            unknown,
            ignored,
        };
    }

    /* ================================================================
     * B. 渲染层
     * ================================================================ */

    /* 统一走对象签名。ui-kit 的 el(tag, props, children) 第二参传字符串
     * 会在真机抛 InvalidCharacterError，而 Node 自检永远测不到 ——
     * 所以本文件所有节点都从 mk() 出，不裸调 el(tag, 'class', 'text')。 */
    function mk(el, tag, cls, text) {
        const props = {};
        if (cls) props.class = cls;
        if (text !== undefined && text !== null) props.text = String(text);
        return el(tag, props, []);
    }

    function hlNodes(el, doc_, text, query, markClass) {
        const parts = highlightParts(text, query);
        const out = [];
        parts.forEach((p) => {
            if (!p.text) return;
            if (p.hit) {
                out.push(mk(el, 'mark', markClass || 'ls-hit', p.text));
            } else {
                /* 用 textNode 不加壳：给每段都套 span 会让文本选中跨段时出现
                 * 断行差异，且 DOM 节点数翻倍。 */
                out.push(doc_.createTextNode(p.text));
            }
        });
        return out;
    }

    function effectTag(el, effect) {
        const map = {
            restart: { text: '需重启', kind: 'restart' },
            reload: { text: '需重载', kind: 'restart' },
            beta: { text: '实验', kind: 'beta' },
        };
        const cfg = map[String(effect)];
        if (!cfg) return null;
        const node = mk(el, 'span', 'ls-set-tag', cfg.text);
        node.dataset.kind = cfg.kind;
        return node;
    }

    function noticeNode(el, kind, title, body) {
        const box = mk(el, 'div', 'ls-notice');
        box.dataset.kind = String(kind || 'info');
        const kids = [];
        if (title) kids.push(mk(el, 'div', 'ls-notice-title', title));
        if (body) kids.push(mk(el, 'div', 'ls-notice-body', body));
        kids.forEach((n) => box.appendChild(n));
        return box;
    }

    /**
     * renderSettingsPage(opts) → { ok:true, root, ... } | absent
     *
     * opts: { schema, values, write?(patch, meta), onClose, advancedOpen, readOnly, title }
     *
     * 【判定顺序即优先级】先判 schema，再判环境。反过来会把「schema 写错」
     * 遮成「非浏览器环境」，真机表现为「整页不出现」，排查方向被引向完全
     * 错误的地方。这个形态在本仓已经复发过三次，本函数是第四次防线。
     */
    function renderSettingsPage(opts) {
        const o = opts || {};

        const norm = normalizeSchema(o.schema);
        if (!norm.ok) return absent('设置页 schema 非法：' + norm.reason);

        const d = doc();
        if (!d) return absent('没有 document（非浏览器环境）');

        const k = kit();
        if (!k || typeof k.el !== 'function') return absent('ui-kit-core.js 未加载');
        const el = k.el;
        const lib = formLib();

        const baseline = deepClone(o.values || {});
        const draft = deepClone(o.values || {});
        const st = {
            query: '',
            dirty: [],
            saving: false,
            error: '',
            advOpen: !!o.advancedOpen,
            armed: '',
            armTimer: 0,
            readOnly: o.readOnly === true,
            destroyed: false,
        };

        const rowTags = Object.create(null);   // key → 脏标记节点

        const rootNode = mk(el, 'div', 'ls-set');
        const head = mk(el, 'div', 'ls-set-head');
        const titleNode = mk(el, 'div', 'ls-set-title', norm.title);
        const countTag = mk(el, 'span', 'ls-set-tag', norm.total + ' 项');
        titleNode.appendChild(countTag);

        const searchWrap = mk(el, 'div', 'ls-set-search');
        const searchInput = el('input', {
            class: 'ls-input2',
            type: 'search',
            placeholder: '搜索设置项或键名…',
            'aria-label': '搜索设置项',
            onInput: (ev) => { applySearch(ev && ev.target ? ev.target.value : ''); },
        }, []);
        searchWrap.appendChild(searchInput);

        head.appendChild(titleNode);
        if (o.searchable !== false) head.appendChild(searchWrap);

        const body = mk(el, 'div', 'ls-set-body');
        const savebar = mk(el, 'div', 'ls-set-savebar');
        savebar.dataset.dirty = '0';
        const dirtyDot = mk(el, 'i', 'ls-set-dirty-dot');
        const dirtyCount = mk(el, 'div', 'ls-set-dirty-count');
        const discardBtn = el('button', { class: 'ls-btn2', type: 'button', text: '放弃' }, []);
        const saveBtn = el('button', { class: 'ls-btn2 is-primary', type: 'button', text: '保存' }, []);
        savebar.appendChild(dirtyDot);
        savebar.appendChild(dirtyCount);
        savebar.appendChild(discardBtn);
        savebar.appendChild(saveBtn);
        if (st.readOnly) savebar.style.display = 'none';

        const footnote = mk(el, 'div', 'ls-set-footnote',
            norm.sub || '改动只写进配置，点保存后才生效。');

        [head, body, savebar, footnote].forEach((n) => rootNode.appendChild(n));

        /* ---------------- 脏值 ---------------- */

        function recomputeDirty() {
            st.dirty = diffKeys(baseline, draft);
            paintSaveBar();
            paintRowTags();
        }

        function paintRowTags() {
            Object.keys(rowTags).forEach((key) => {
                const node = rowTags[key];
                if (!node) return;
                const isDirty = st.dirty.indexOf(key) >= 0;
                node.textContent = isDirty ? '已改' : '';
                node.style.display = isDirty ? '' : 'none';
                node.dataset.kind = isDirty ? 'dirty' : '';
            });
        }

        function paintSaveBar() {
            const s = pickSaveState({ dirty: st.dirty.length, saving: st.saving, error: st.error });
            /* 只有真有未保存改动时才升起。CSS 侧 data-dirty="0" 会
             * translateY 离场并 pointer-events:none，所以这里是原子判断。 */
            savebar.dataset.dirty = s.visible ? '1' : '0';
            savebar.dataset.state = s.state;
            dirtyCount.textContent = s.text;
            saveBtn.textContent = s.label;
            saveBtn.disabled = !s.canSave;
            discardBtn.disabled = !s.canDiscard;
            dirtyDot.style.display = s.visible ? '' : 'none';
        }

        /* ---------------- 控件装配 ---------------- */

        function setValue(key, v) {
            if (st.readOnly) return;
            draft[key] = v;
            recomputeDirty();
        }

        function buildControl(row, ctl) {
            if (row.kind === 'unsupported') {
                ctl.dataset.wide = '1';
                ctl.appendChild(noticeNode(el, 'warn', '此项无法渲染', row.unsupported));
                return;
            }
            if (row.kind === 'action') {
                const isDanger = row.danger || row.groupDanger;
                const label = row.label;
                const btnNode = el('button', {
                    class: isDanger ? 'ls-btn-danger' : 'ls-btn2',
                    type: 'button',
                    text: label,
                }, []);
                if (isDanger && row.confirm) {
                    /* 危险动作两步走：第一下只「上膛」（data-armed=1 变实心红底），
                     * 4 秒内再点一下才真的执行。一步确认在移动端太容易误触。 */
                    btnNode.addEventListener('click', () => {
                        if (st.armed !== row.id) {
                            st.armed = row.id;
                            btnNode.dataset.armed = '1';
                            btnNode.textContent = '确认' + label;
                            if (st.armTimer) clearTimeout(st.armTimer);
                            st.armTimer = setTimeout(() => {
                                if (st.destroyed) return;
                                st.armed = '';
                                btnNode.dataset.armed = '0';
                                btnNode.textContent = label;
                            }, 4000);
                        } else {
                            st.armed = '';
                            btnNode.dataset.armed = '0';
                            btnNode.textContent = label;
                            fireAction(row);
                        }
                    });
                } else {
                    btnNode.addEventListener('click', () => fireAction(row));
                }
                ctl.appendChild(btnNode);
                return;
            }

            if (!lib) {
                ctl.dataset.wide = '1';
                ctl.appendChild(noticeNode(el, 'warn', '控件库未加载',
                    'ui-form-controls.js 未加载，设置项只读展示。'));
                ctl.appendChild(mk(el, 'div', 'ls-set-footnote', String(draft[row.key])));
                return;
            }

            const cur = (draft[row.key] === undefined) ? row.defaultValue : draft[row.key];
            let built = null;

            if (row.kind === 'switch') {
                built = lib.renderSwitch({
                    value: cur === true,
                    label: row.label,
                    onChange: (v) => setValue(row.key, v),
                });
            } else if (row.kind === 'slider') {
                built = lib.renderSlider({
                    value: cur, min: row.min, max: row.max, step: row.step,
                    unit: row.unit, label: row.label,
                    onChange: (v) => setValue(row.key, v),
                });
            } else if (row.kind === 'stepper') {
                built = lib.renderStepper({
                    value: cur, min: row.min, max: row.max, step: row.step,
                    unit: row.unit,
                    onChange: (v) => setValue(row.key, v),
                });
            } else if (row.kind === 'seg') {
                built = lib.renderSeg({
                    options: row.options, value: cur,
                    onChange: (v) => setValue(row.key, v),
                });
            } else if (row.kind === 'text' || row.kind === 'textarea') {
                built = lib.renderText({
                    value: cur == null ? '' : String(cur),
                    multiline: row.kind === 'textarea' || row.multiline,
                    placeholder: row.placeholder,
                    maxLength: row.maxLength,
                    onChange: (v) => setValue(row.key, v),
                });
            } else if (row.kind === 'select') {
                /* 选择器复用分段控件的选项归一，但项多时不该占满整行，
                 * 用 text 兜底会丢选项 —— 所以这里仍然走 seg，并标记宽槽。 */
                ctl.dataset.wide = '1';
                built = lib.renderSeg({
                    options: row.options, value: cur,
                    onChange: (v) => setValue(row.key, v),
                });
            } else if (row.kind === 'color') {
                built = lib.renderText({
                    value: cur == null ? '' : String(cur),
                    placeholder: '#rrggbb',
                    maxLength: 9,
                    onChange: (v) => setValue(row.key, v),
                });
            } else if (row.kind === 'chips') {
                ctl.dataset.wide = '1';
                const chipsBox = mk(el, 'div', 'ls-chips');
                const arr = Array.isArray(cur) ? cur : [];
                if (!arr.length) {
                    chipsBox.appendChild(mk(el, 'span', 'ls-set-footnote', '（空）'));
                } else {
                    arr.forEach((t) => chipsBox.appendChild(mk(el, 'span', 'ls-chip2', String(t))));
                }
                /* chips 的编辑入口是文本：一行一个，提交时再归一。
                 * 不给「点 x 删除」的胶囊：删除手势在窄屏上太小，
                 * 而错删一个标签没有任何撤销。 */
                const editor = lib.renderText({
                    value: arr.join('\n'),
                    multiline: true,
                    placeholder: '一行一个',
                    onChange: (v) => setValue(row.key, coerceValue('chips', v, row).value),
                });
                if (editor.ok) {
                    chipsBox.appendChild(editor.root);
                }
                ctl.appendChild(chipsBox);
                return;
            } else {
                ctl.dataset.wide = '1';
                ctl.appendChild(noticeNode(el, 'warn', '未接线的控件',
                    'kind="' + row.kind + '" 还没有对应的渲染件。'));
                return;
            }

            if (!built || !built.ok) {
                /* 渲染件拒绝时把**它给的理由**原样显示。这里如果换成
                 * 「控件不可用」，真机上就再也看不到「值域写错了」这条关键信息。 */
                ctl.dataset.wide = '1';
                ctl.appendChild(noticeNode(el, 'warn',
                    '「' + row.label + '」无法渲染',
                    (built && built.reason) ? built.reason : '渲染件返回空'));
                return;
            }
            ctl.appendChild(built.root);
        }

        function fireAction(row) {
            if (typeof o.onAction !== 'function') return;
            try {
                o.onAction({ key: row.key, id: row.id, row, draft: deepClone(draft) });
            } catch (e) {
                st.error = '动作失败：' + String(e && e.message || e);
                paintSaveBar();
            }
        }

        function rowNode(row, group) {
            if (row.kind === 'note' || row.kind === 'static') {
                return mk(el, 'div', 'ls-set-footnote', row.label + (row.desc ? '：' + row.desc : ''));
            }

            const wrap = mk(el, 'div', 'ls-set-row');
            wrap.dataset.key = row.key || '';
            wrap.dataset.kind = row.kind;
            if (row.disabled || st.readOnly) wrap.dataset.disabled = '1';

            const main = mk(el, 'div', 'ls-set-row-main');
            const labelNode = mk(el, 'div', 'ls-set-label');
            hlNodes(el, d, row.label, st.query, 'ls-hit').forEach((n) => labelNode.appendChild(n));
            const et = effectTag(el, row.effect);
            if (et) labelNode.appendChild(et);

            const tagNode = mk(el, 'span', 'ls-set-tag', '');
            tagNode.style.display = 'none';
            labelNode.appendChild(tagNode);
            if (row.key) rowTags[row.key] = tagNode;

            main.appendChild(labelNode);

            if (row.desc) {
                const descNode = mk(el, 'div', 'ls-set-desc');
                hlNodes(el, d, row.desc, st.query, 'ls-hit').forEach((n) => descNode.appendChild(n));
                if (row.warn) descNode.dataset.warn = '1';
                main.appendChild(descNode);
            }

            wrap.appendChild(main);

            const ctl = mk(el, 'div', 'ls-set-ctl');
            if (row.wide) ctl.dataset.wide = '1';
            const row2 = Object.assign({}, row, { groupDanger: !!(group && group.danger) });
            buildControl(row2, ctl);
            wrap.appendChild(ctl);

            return wrap;
        }

        function groupNode(group) {
            if (group.advanced) {
                const adv = mk(el, 'div', 'ls-adv');
                /* 搜索时以 autoOpen 为准：命中落在折叠组里必须自动展开，
                 * 否则用户搜到 N 条却一片空白，而判据还会全绿。 */
                adv.dataset.open = (st.query ? !!group.autoOpen : st.advOpen) ? '1' : '0';
                const headNode = mk(el, 'div', 'ls-adv-head', group.title + '（' + group.rows.length + ' 项）');
                headNode.setAttribute('role', 'button');
                headNode.setAttribute('tabindex', '0');
                const bodyOuter = mk(el, 'div', 'ls-adv-body');
                const bodyInner = mk(el, 'div', '');
                if (group.advancedWarn) {
                    bodyInner.appendChild(mk(el, 'div', 'ls-adv-warn', group.advancedWarn));
                }
                group.rows.forEach((r) => bodyInner.appendChild(rowNode(r, group)));
                bodyOuter.appendChild(bodyInner);
                adv.appendChild(headNode);
                adv.appendChild(bodyOuter);
                headNode.addEventListener('click', () => {
                    st.advOpen = adv.dataset.open !== '1';
                    adv.dataset.open = st.advOpen ? '1' : '0';
                });
                return adv;
            }

            const box = mk(el, 'div', 'ls-set-group');
            if (group.danger) box.classList.add('ls-danger-zone');
            const ghead = mk(el, 'div', 'ls-set-group-head');
            ghead.appendChild(mk(el, 'div', 'ls-set-group-title', group.title));
            if (group.note) ghead.appendChild(mk(el, 'div', 'ls-set-group-note', group.note));
            box.appendChild(ghead);
            const list = mk(el, 'div', 'ls-set-list');
            group.rows.forEach((r) => list.appendChild(rowNode(r, group)));
            box.appendChild(list);
            return box;
        }

        /* ---------------- 整片重绘（搜索/折叠/放弃/导入走这条路） ---------------- */

        function paint() {
            if (st.destroyed) return;
            Object.keys(rowTags).forEach((key) => { delete rowTags[key]; });
            while (body.firstChild) body.removeChild(body.firstChild);

            const view = filterSchema(norm, st.query);

            /* schema 自身有问题时，页面顶上先摆一条：比让用户点半天发现某项不存在好。 */
            if (norm.dupes.length) {
                body.appendChild(noticeNode(el, 'warn', '有 ' + norm.dupes.length + ' 项重复 key',
                    norm.dupes.map((x) => x.key + '（' + x.first + ' 与 ' + x.again + '）').join('；') +
                    '。重复项只保留第一处，其余已标为不可渲染。'));
            }
            if (norm.unknown.length) {
                body.appendChild(noticeNode(el, 'warn', '有 ' + norm.unknown.length + ' 项 schema 写错',
                    norm.unknown.map((x) => (x.key || x.id) + '：' + (x.kind || '缺 kind')).join('；')));
            }

            if (!norm.total) {
                const empty = mk(el, 'div', 'ls-set-nohit');
                empty.appendChild(mk(el, 'div', 'ls-set-nohit-title', '这个页面还没有设置项'));
                empty.appendChild(mk(el, 'div', 'ls-set-nohit-hint', 'schema 里 groups[].rows 是空的。'));
                body.appendChild(empty);
                paintRowTags();
                paintSaveBar();
                return;
            }

            if (view.empty) {
                const nohit = mk(el, 'div', 'ls-set-nohit');
                nohit.appendChild(mk(el, 'div', 'ls-set-nohit-title', '没有匹配「' + view.query + '」的设置项'));
                /* 关键：说明这是**过滤结果**而不是「设置没了」，
                 * 并给出总数，让用户知道筛选还在生效。 */
                nohit.appendChild(mk(el, 'div', 'ls-set-nohit-hint',
                    '共 ' + view.total + ' 项，当前只显示匹配项。试试搜键名，比如 archivePreserveRecent。'));
                body.appendChild(nohit);
                paintRowTags();
                paintSaveBar();
                return;
            }

            view.groups.forEach((g) => {
                const node = groupNode(g);
                body.appendChild(node);
            });

            paintRowTags();
            paintSaveBar();
        }

        function applySearch(q) {
            st.query = String(q == null ? '' : q);
            paint();
        }

        /* ---------------- 动作 ---------------- */

        function isDirty() { return st.dirty.length > 0; }

        function currentSaveState() {
            return pickSaveState({ dirty: st.dirty.length, saving: st.saving, error: st.error });
        }

        /**
         * save() → Promise<{ ok, saved, error }>
         *
         * 【纪律】失败时保留脏值与草稿。已成功写入的键才把 baseline 前移，
         * 所以「部分成功」也是安全的：重试只会重写剩下的。
         */
        function save() {
            if (st.readOnly) return Promise.resolve({ ok: false, error: '只读模式' });
            if (!st.dirty.length) return Promise.resolve({ ok: true, saved: 0 });
            if (typeof o.write !== 'function') {
                st.error = '没有写入函数（opts.write 缺失）';
                paintSaveBar();
                return Promise.resolve({ ok: false, error: st.error });
            }

            const keys = st.dirty.slice();
            const patch = buildPatch(baseline, draft).patch;
            st.saving = true;
            st.error = '';
            paintSaveBar();

            return Promise.resolve()
                .then(() => o.write(patch, { keys }))
                .then((r) => {
                    if (r && r.ok === false) {
                        throw new Error(r.reason || '写入被拒绝');
                    }
                    keys.forEach((k2) => {
                        if (draft[k2] === undefined) delete baseline[k2];
                        else baseline[k2] = deepClone(draft[k2]);
                    });
                    st.saving = false;
                    recomputeDirty();
                    return { ok: true, saved: keys.length };
                })
                .catch((e) => {
                    st.saving = false;
                    st.error = '保存失败：' + String(e && e.message || e);
                    paintSaveBar();
                    return { ok: false, error: st.error, saved: 0 };
                });
        }

        function discard() {
            Object.keys(draft).forEach((k2) => { delete draft[k2]; });
            Object.assign(draft, deepClone(baseline));
            st.error = '';
            recomputeDirty();
            paint();   // 放弃必须重绘：控件上显示的还是旧草稿
        }

        function exportJson() {
            const out = exportValues(draft, norm);
            return JSON.stringify(out, null, 2);
        }

        /**
         * importJson(text) → 报告对象
         *
         * 默认「有非法项就整体不应用」：一半生效的导入是最难排查的状态，
         * 用户看不出哪几个键没进去。partial:true 可强制部分应用。
         */
        function importJson(text, opt) {
            const rep = importValues(text, norm);
            if (!rep.ok) return rep;
            const allowPartial = !!(opt && opt.partial);
            if ((rep.invalid.length || rep.unknown.length) && !allowPartial) {
                return {
                    ok: false, kind: 'rejected', reason: '导入被拒绝：' +
                        (rep.invalid.length + rep.unknown.length) + ' 项无法应用',
                    invalid: rep.invalid, unknown: rep.unknown,
                };
            }
            Object.keys(rep.values).forEach((k2) => { draft[k2] = rep.values[k2]; });
            recomputeDirty();
            paint();
            return rep;
        }

        function destroy() {
            st.destroyed = true;
            if (st.armTimer) clearTimeout(st.armTimer);
            try { rootNode.remove(); } catch (_e) { /* ignore */ }
        }

        saveBtn.addEventListener('click', () => { save(); });
        discardBtn.addEventListener('click', () => { discard(); });

        paint();

        return {
            ok: true,
            root: rootNode,
            body,
            schema: norm,
            state: st,
            // 读
            getDraft: () => deepClone(draft),
            getBaseline: () => deepClone(baseline),
            isDirty,
            dirtyKeys: () => st.dirty.slice(),
            saveState: currentSaveState,
            // 写
            setValue,
            save,
            discard,
            exportJson,
            importJson,
            // 视图
            applySearch,
            refresh: paint,
            destroy,
        };
    }

    /** 把整页塞进 ui-kit 的抽屉面板。 */
    function openSettingsPanel(opts) {
        const o = opts || {};
        const k = kit();
        if (!k || typeof k.panel !== 'function') {
            return absent('ui-kit-core.js 未加载，无法开面板');
        }
        const page = renderSettingsPage(o);
        if (!page.ok) return page;

        const panel = k.panel({
            title: o.title || (o.schema && o.schema.title) || '设置',
            sub: (o.schema && o.schema.sub) || '',
            onClose: o.onClose,
        });
        panel.body.appendChild(page.root);
        page.root.style.height = '100%';

        return {
            ok: true,
            panel,
            page,
            close: () => { page.destroy(); panel.close(); },
        };
    }

    /* ================================================================
     * C. 自检（不碰 DOM）
     * ================================================================ */

    function selfCheck() {
        const fails = [];
        const checks = [];
        const ok = (name, cond, detail) => {
            checks.push({ name, ok: !!cond, detail });
            if (!cond) fails.push(name + (detail ? '：' + detail : ''));
        };

        const S = {
            title: '测试设置',
            sub: '说明',
            version: '2',
            groups: [
                {
                    id: 'core', title: '核心',
                    rows: [
                        { key: 'a', label: '开关 A', kind: 'switch', default: true },
                        { key: 'b', label: '条数 B', desc: '保留最近几条', kind: 'stepper', min: 1, max: 100, step: 1, unit: '条' },
                        { key: 'c', label: '比例 C', kind: 'slider', min: 0, max: 1, step: 0.1 },
                    ],
                },
                {
                    id: 'adv', title: '高级', advanced: true, advancedWarn: '改之前先备份',
                    rows: [{ key: 'd', label: '模式 D', kind: 'seg', options: ['fast', 'slow'] }],
                },
                {
                    id: 'danger', title: '危险区', danger: true,
                    rows: [{ key: 'wipe', label: '清空', kind: 'action', danger: true, confirm: '清空' }],
                },
            ],
        };

        /* --- schema 归一 --- */
        const n1 = normalizeSchema(S);
        ok('正常 schema 通过', n1.ok === true);
        ok('组数 3', n1.groups.length === 3, String(n1.groups.length));
        ok('行数 5', n1.total === 5, String(n1.total));
        ok('可写键 4 项（action 无 key 也算 1 项）', n1.keys.length === 4, n1.keys.join(','));
        ok('byKey 能取到 a', !!n1.byKey.a);
        ok('高级组标记保留', n1.groups[1].advanced === true);
        ok('危险组标记保留', n1.groups[2].danger === true);
        ok('无重复', n1.dupes.length === 0);
        ok('无未知', n1.unknown.length === 0);

        ok('schema 非对象 → 失败', normalizeSchema(null).ok === false);
        ok('groups 非数组 → 失败且理由指明 groups',
            (() => {
                const r = normalizeSchema({ groups: {} });
                return r.ok === false && r.reason.indexOf('groups') >= 0;
            })());

        /* 未知 kind 不丢弃 */
        const n2 = normalizeSchema({ groups: [{ id: 'g', rows: [{ key: 'x', label: 'X', kind: 'weird' }] }] });
        ok('未知 kind 仍留在行里（不丢弃）', n2.total === 1);
        ok('未知 kind 标成 unsupported', n2.rows[0].kind === 'unsupported');
        ok('未知 kind 进了 unknown 报告', n2.unknown.length === 1);
        ok('未知 kind 不进 byKey', !n2.byKey.x);
        ok('未知 kind 的理由里带原 kind 名', n2.rows[0].unsupported.indexOf('weird') >= 0);

        /* 重复 key */
        const n3 = normalizeSchema({
            groups: [{ id: 'g', rows: [
                { key: 'k', label: '一', kind: 'switch' },
                { key: 'k', label: '二', kind: 'switch' },
            ] }],
        });
        ok('重复 key 被记录', n3.dupes.length === 1);
        ok('重复的那一项标 unsupported', n3.rows[1].kind === 'unsupported');
        ok('重复理由里指明占用者', n3.rows[1].unsupported.indexOf('g:k') >= 0);
        ok('首项仍然可用', n3.rows[0].kind === 'switch');

        /* 缺 key */
        const n4 = normalizeSchema({ groups: [{ id: 'g', rows: [{ label: '无键', kind: 'switch' }] }] });
        ok('可写控件缺 key → unsupported', n4.rows[0].kind === 'unsupported');
        ok('缺 key 的理由说的是 key', n4.rows[0].unsupported.indexOf('key') >= 0);

        /* note 不需要 key */
        const n5 = normalizeSchema({ groups: [{ id: 'g', rows: [{ kind: 'note', label: '说明' }] }] });
        ok('note 不需要 key', n5.rows[0].kind === 'note');

        /* rows 不是数组 */
        const n6 = normalizeSchema({ groups: [{ id: 'g', rows: 'nope' }] });
        ok('rows 非数组不炸，且记 dropped', n6.ok === true && n6.dropped.length === 1);

        /* --- 搜索 --- */
        ok('空查询命中全部', filterSchema(n1, '').count === 5);
        ok('按 key 搜能命中（高级用户主路径）', filterSchema(n1, 'arch').count === 0 &&
            filterSchema(S && n1, 'b').count >= 1);
        ok('按说明搜能命中', (() => {
            const v = filterSchema(normalizeSchema(S), '保留最近');
            return v.count === 1 && v.groups[0].rows[0].key === 'b';
        })());
        ok('按单位搜能命中', filterSchema(normalizeSchema(S), '条').count >= 1);
        ok('按组标题搜能命中', filterSchema(normalizeSchema(S), '高级').count === 1);
        ok('命中落在高级组时自动展开', (() => {
            const v = filterSchema(normalizeSchema(S), '模式');
            return v.count === 1 && v.groups[0].autoOpen === true;
        })());
        ok('搜索大小写不敏感', (() => {
            const nn = normalizeSchema({ groups: [{ id: 'g', rows: [{ key: 'ArchiveX', label: 'A', kind: 'switch' }] }] });
            return filterSchema(nn, 'archivex').count === 1;
        })());
        ok('无命中时 empty 为真且给出总数', (() => {
            const v = filterSchema(normalizeSchema(S), 'zzz');
            return v.empty === true && v.total === 5;
        })());
        ok('filterSchema 对坏 norm 不抛', filterSchema(null, 'x').count === 0);

        /* --- 命中标注 --- */
        ok('无查询时单段且非命中', (() => {
            const p = highlightParts('abc', '');
            return p.length === 1 && p[0].hit === false;
        })());
        ok('命中切片为三段', (() => {
            const p = highlightParts('abcd', 'bc');
            return p.length === 3 && p[1].hit === true && p[1].text === 'bc';
        })());
        ok('命中保留原文大小写', highlightParts('AbCd', 'bc')[1].text === 'bC');
        ok('多次命中都标出来', highlightParts('a-a-a', 'a').filter((x) => x.hit).length === 3);
        ok('切片拼回去等于原文', highlightParts('前后都有', '有').map((x) => x.text).join('') === '前后都有');
        ok('正则元字符不当正则用', (() => {
            const p = highlightParts('a.b', '.');
            return p.filter((x) => x.hit).length === 1 && p.filter((x) => x.hit)[0].text === '.';
        })());
        ok('空文本返回空数组', highlightParts('', 'x').length === 0);

        /* --- 脏值 --- */
        ok('0 处改动不输出文字', formatDirty(0) === '');
        ok('负数也不输出', formatDirty(-3) === '');
        ok('1 处改动有文字', formatDirty(1).indexOf('1') >= 0);
        ok('sameValue 认 NaN 相等', sameValue(NaN, NaN) === true);
        ok('sameValue 不把 0 与 false 混为一谈', sameValue(0, false) === false);
        ok('sameValue 数组按内容比', sameValue([1, 2], [1, 2]) === true);
        ok('sameValue 键序不同仍算相等', sameValue({ a: 1, b: 2 }, { b: 2, a: 1 }) === true);
        ok('diffKeys 空差集', diffKeys({ a: 1 }, { a: 1 }).length === 0);
        ok('diffKeys 抓出改动', diffKeys({ a: 1, b: 2 }, { a: 9, b: 2 }).join(',') === 'a');
        ok('diffKeys 抓出新增键', diffKeys({ a: 1 }, { a: 1, b: 2 }).join(',') === 'b');
        ok('diffKeys 抓出删除键', diffKeys({ a: 1, b: 2 }, { a: 1 }).join(',') === 'b');
        ok('buildPatch 删除键显式为 undefined', (() => {
            const p = buildPatch({ a: 1, b: 2 }, { a: 1 });
            return p.keys.length === 1 && p.patch.b === undefined && ('b' in p.patch);
        })());

        /* --- 保存状态 --- */
        ok('无脏值 → 隐藏', pickSaveState({ dirty: 0 }).visible === false);
        ok('有脏值 → 可保存可放弃', (() => {
            const s = pickSaveState({ dirty: 2 });
            return s.visible && s.canSave && s.canDiscard && s.state === 'dirty';
        })());
        ok('保存中 → 按钮全禁用但条还亮着', (() => {
            const s = pickSaveState({ dirty: 2, saving: true });
            return s.visible === true && s.canSave === false && s.canDiscard === false;
        })());
        ok('保存失败 → 仍可见且可重试', (() => {
            const s = pickSaveState({ dirty: 2, error: '磁盘满' });
            return s.visible && s.canSave && s.state === 'error' && s.text.indexOf('磁盘满') >= 0;
        })());
        ok('错误文本原样带出、不串味', (() => {
            const s = pickSaveState({ dirty: 3, error: 'x' });
            return s.text === 'x' && s.state === 'error';
        })());

        /* --- 值归一 --- */
        ok('开关：字符串 false 不能变 true（Boolean("false") 陷阱）',
            coerceValue('switch', 'false').value === false);
        ok('开关：字符串 true', coerceValue('switch', 'true').value === true);
        ok('开关：中文「开」', coerceValue('switch', '开').value === true);
        ok('开关：非法值报错', coerceValue('switch', 'maybe').ok === false);
        ok('数字：字符串可转', coerceValue('stepper', '42', { min: 1, max: 100, step: 1 }).value === 42);
        ok('数字：被夹住要标出来', (() => {
            const r = coerceValue('stepper', 999, { min: 1, max: 100, step: 1 });
            return r.ok && r.value === 100 && r.clamped === true;
        })());
        ok('数字：非数字报错', coerceValue('stepper', 'abc', { min: 0, max: 1, step: 1 }).ok === false);
        ok('数字：值域写错要报值域理由', (() => {
            const r = coerceValue('slider', 5, { min: 10, max: 1, step: 1 });
            return r.ok === false && /min|max|值域/.test(String(r.reason));
        })());
        ok('分段：合法值通过', coerceValue('seg', 'fast', { options: ['fast', 'slow'] }).value === 'fast');
        ok('分段：非法值不回退第一项', coerceValue('seg', 'nope', { options: ['fast', 'slow'] }).ok === false);
        ok('文本：超长不截断，报超出字数', (() => {
            const r = coerceValue('text', 'abcdef', { maxLength: 3 });
            return r.ok === false && r.reason.indexOf('3') >= 0;
        })());
        ok('文本：未超长通过且内容完整', (() => {
            const r = coerceValue('text', 'abc', { maxLength: 3 });
            return r.ok && r.value === 'abc';
        })());
        ok('颜色：三位缩写展开', coerceValue('color', '#abc').value === '#aabbcc');
        ok('颜色：非法长度报错', coerceValue('color', '#ab').ok === false);
        ok('胶囊：逗号串归一为数组', coerceValue('chips', 'a, b ,a').value.join('|') === 'a|b');
        ok('胶囊：数组去重', coerceValue('chips', ['x', 'x', 'y']).value.join('|') === 'x|y');

        /* --- 导入/导出 --- */
        ok('导入：坏 JSON 报不是 JSON', importValues('{', n1).ok === false);
        ok('导入：数组不当作对象', importValues('[1]', n1).ok === false);
        ok('导入：扁平对象可用', (() => {
            const r = importValues('{"a":false}', n1);
            return r.ok && r.values.a === false;
        })());
        ok('导入：带 version 的信封可用', (() => {
            const r = importValues('{"version":"2","values":{"b":7}}', n1);
            return r.ok && r.values.b === 7 && r.version === '2';
        })());
        ok('导入：不认识的键进 unknown 而不静默丢弃', (() => {
            const r = importValues('{"zzz":1}', n1);
            return r.ok && r.unknown.join(',') === 'zzz';
        })());
        ok('导入：非法值进 invalid 而不静默改值', (() => {
            const r = importValues('{"c":"坏"}', n1);
            return r.ok && r.invalid.length === 1 && !('c' in r.values);
        })());
        ok('导出：只导 schema 里的键', (() => {
            const r = exportValues({ a: 1, zzz: 9 }, n1);
            return r.keys.length === 4 && !('zzz' in r.values);
        })());
        ok('导出：NaN 转 null（JSON 里 NaN 不合法）', (() => {
            const r = exportValues({ c: NaN }, n1);
            return r.values.c === null;
        })());
        ok('导出再导入可闭环', (() => {
            const text = JSON.stringify(exportValues({ a: false, b: 7 }, n1));
            const r = importValues(text, n1);
            return r.ok && r.values.a === false && r.values.b === 7;
        })());

        /* --- 渲染：判定顺序即优先级（本仓已复发三次，这里是第四次防线）---
         * 反向控制：schema 合法时必须老实报「没有 document」，
         * 免得判据变成「永远报 schema 错」也能过。 */
        const noDom = renderSettingsPage({ schema: S, values: {} });
        ok('schema 合法 + 无 DOM → 理由指向 document',
            noDom.ok === false && noDom.reason.indexOf('document') >= 0, JSON.stringify(noDom));
        const badSchema = renderSettingsPage({ schema: { groups: 1 }, values: {} });
        ok('schema 非法 → 理由指向 schema 而不是 document',
            badSchema.ok === false && badSchema.reason.indexOf('schema') >= 0, JSON.stringify(badSchema));
        ok('两种 absent 的理由必须不同', noDom.reason !== badSchema.reason);
        ok('absent 都带 kind=absent', noDom.kind === 'absent' && badSchema.kind === 'absent');

        ok('openSettingsPanel 无 DOM 时不抛且报 absent',
            (() => {
                try {
                    const r = openSettingsPanel({ schema: S, values: {} });
                    return r.ok === false && !!r.reason;
                } catch (_e) { return false; }
            })());

        /* --- 导出面 --- */
        ok('导出 15 个成员', [
            'normalizeSchema', 'filterSchema', 'matchRow', 'highlightParts',
            'formatDirty', 'pickSaveState', 'coerceValue', 'importValues',
            'exportValues', 'sameValue', 'diffKeys', 'buildPatch',
            'renderSettingsPage', 'openSettingsPanel', 'selfCheck',
        ].every((n) => typeof api[n] === 'function'));

        return {
            ok: fails.length === 0,
            version: VERSION,
            total: checks.length,
            failed: fails.length,
            fails,
            checks,
        };
    }

    const api = {
        VERSION,
        KNOWN_KINDS: KNOWN_KINDS.slice(),
        // 纯函数
        normalizeSchema,
        filterSchema,
        matchRow,
        highlightParts,
        formatDirty,
        pickSaveState,
        coerceValue,
        importValues,
        exportValues,
        sameValue,
        diffKeys,
        buildPatch,
        // 渲染
        renderSettingsPage,
        openSettingsPanel,
        // 自检
        selfCheck,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LonShaSettingsPanel = api;
    if (typeof window !== 'undefined') window.LonShaSettingsPanel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
