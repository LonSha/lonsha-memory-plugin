/**
 * v4-panel-bridge.js — [V4] 六条机制的呈现层桥（面板 / 诊断共用唯一取数口径）
 *
 * 【为什么需要这一层】
 *   v4.0 缝入的六条（R27-A~F）各自只答一件事，谁都不认识「聊天」「设置」「面板」。
 *   如果让 UI 各自去 window 上摸模块、自己拼读数，会出现本仓反复治过的老病：
 *   同一个事实有两个真源 —— 面板说「维护已到第 12 楼」，诊断说「到第 9 楼」，
 *   而两边都不算错，只是各自拿的入参不同。所以六条的**唯一取数口径**放在这里：
 *   UI 调 `read(host)`，诊断调 `line(host)`，两边看到的是同一份对象。
 *
 * 【六条各自在这里的职责】
 *   maintenance  维护节奏    —— 哪一段楼层可以进维护、为什么还不能（四个触发态）
 *   window       窗口撤回    —— 本插件隐藏过哪些楼、覆盖前缀之外的不许撤
 *   rules        规则 DSL    —— 用户写的规则文本编译成 AST（失败给行号与原因）
 *   codec        存档编解码  —— 存档体积预估 / 导出 / 导入（本仓自有编码名）
 *   reuse        选文复用    —— 上一轮选文为什么被复用 / 为什么没有
 *   edits        句子级改写  —— 上一次摘要编辑是「句级修改」还是「整段重写」
 *
 * 【纪律】
 *   ① **只读**：本层不写任何持久账，不改 host 的任何状态（除 `_v4Read` 快照）。
 *   ② 六条任一缺席 ⇒ 那一格给 `ok:false, reason:'module-unavailable'`，其余五格照常
 *      —— 一条坏掉不许把整面板打成「全坏」（那会让「坏一条」与「全坏」同形）。
 *   ③ 绝不把「没做过」写成 0：未运行给 `reason:'not-run'`，真为 0 才给 0。
 *   ④ 永不抛：所有取数各自 try，异常落在该格的 `reason:'thrown'`。
 */
(function (root) {
    'use strict';

    /** 本面结构版本（形状一变必须抬）。 */
    const PB_VERSION = 1;
    /** 读数 kind。 */
    const PB_KIND = 'v4_panel_bridge';
    /** 六条键名闭集（顺序即面板展示顺序）。 */
    const SIX = Object.freeze(['maintenance', 'window', 'rules', 'codec', 'reuse', 'edits']);

    /** 依次尝试「宿主全局」与「CommonJS」，两条路都不通则 null。 */
    function pick(globalName, relPath) {
        try {
            if (root && root[globalName]) return root[globalName];
        } catch (_e) { /* 宿主代理全局，忽略 */ }
        try {
            if (typeof require !== 'undefined') return require(relPath);
        } catch (_e) { /* 非 Node 环境，忽略 */ }
        return null;
    }

    function mods() {
        return {
            ms: pick('LonShaMaintenanceSchedule', './maintenance-schedule.js'),
            wp: pick('LonShaWindowPlan', './window-plan.js'),
            se: pick('LonShaSentenceEdits', './sentence-edits.js'),
            sc: pick('LonShaStorageCodec', './storage-codec.js'),
            sr: pick('LonShaSelectionReuse', './selection-reuse.js'),
            rc: pick('LonShaRulesCompile', './rules-compile.js')
        };
    }

    function missingOf(m) {
        const out = [];
        if (!m.ms) out.push('maintenance-schedule');
        if (!m.wp) out.push('window-plan');
        if (!m.se) out.push('sentence-edits');
        if (!m.sc) out.push('storage-codec');
        if (!m.sr) out.push('selection-reuse');
        if (!m.rc) out.push('rules-compile');
        return out;
    }

    /** host 的聊天数组（宿主缺失时给空数组，不抛）。 */
    function chatOf(host) {
        try {
            const c = root && root.SillyTavern && typeof root.SillyTavern.getContext === 'function'
                ? root.SillyTavern.getContext() : null;
            return (c && Array.isArray(c.chat)) ? c.chat : [];
        } catch (_e) { return []; }
    }

    /** 维护节奏：读 host 上一次批量补齐时留下的排期（_maintScheduleRead）。 */
    function readMaintenance(host, m) {
        if (!m.ms) return { ok: false, reason: 'module-unavailable' };
        const r = host && host._maintScheduleRead;
        if (!r) return { ok: false, reason: 'not-run' };
        if (r.ok !== true) return { ok: false, reason: String(r.reason || 'unknown') };
        return {
            ok: true,
            trigger: String(r.trigger || ''),
            eligibleEnd: Number(r.eligibleEnd) || 0,
            covered: Number(r.covered) || 0,
            deferredCount: Number(r.deferredCount) || 0,
            cappedTo: Number(r.cappedTo),
            /* 面板要能显示「这次为什么被延后」：waiting=攒得不够，blocked=一条都不许动 */
            deferred: r.trigger === 'waiting' ? '可维护区回复数不足，等攒够'
                : (r.trigger === 'blocked' ? '可维护区整段为空（最新回复尚未稳定）'
                    : (r.trigger === 'none' ? '没有待维护消息' : '可维护'))
        };
    }

    /** 窗口撤回：现算。返回「该隐的没隐」「该撤的该撤」两笔意图 + 不认领外部隐藏的读数。 */
    function readWindow(host, m) {
        if (!m.wp || typeof m.wp.planWindow !== 'function') return { ok: false, reason: 'module-unavailable' };
        const chat = chatOf(host);
        if (!chat.length) return { ok: false, reason: 'no-chat' };
        const owner = 'lonsha-memory';
        const messages = chat.map((x, i) => ({
            key: String(i),
            role: (x && x.is_user === true) ? 'user' : ((x && x.is_system === true) ? 'system' : 'assistant'),
            content: String((x && x.mes) || ''),
            hidden: !!(x && x.extra && (x.extra.lonsha_hidden === true || x.extra.hidden === true)),
            hiddenBy: (x && x.extra && x.extra.hiddenBy) || null
        }));
        const covered = (host && host.summary && Array.isArray(host.summary.summaries))
            ? host.summary.summaries.length : 0;
        const plan = m.wp.planWindow(messages, [], {
            enabled: true, recentTurns: 12, owner: owner,
            canOmit: () => true
        });
        /* planWindow 返回 `{plan, readings, owner, boundary}`；意图条目用 `hidden:true/false` 表示
         *  hide/restore（**没有 op 字段**）。修前这里读 `plan.changes` 与 `c.op`，两处都是不存在的键 ——
         *  面板会一直显示「隐 0 / 撤 0」而看不出算错了（本仓点名的「读错键 = 恒空读数」）。 */
        const changes = Array.isArray(plan && plan.plan) ? plan.plan : [];
        const hide = changes.filter((c) => c && c.hidden === true).length;
        const restore = changes.filter((c) => c && c.hidden === false).length;
        const foreign = Number(plan && plan.readings && plan.readings.foreignHidden) || 0;
        return {
            ok: true, hide: hide, restore: restore, foreignHidden: foreign,
            boundary: Number(plan && plan.boundary) || 0, covered: covered,
            /* 零意图也要说清是「没有要动的」而不是「没算」 */
            reason: (hide || restore) ? 'has-intent' : 'no-intent'
        };
    }

    /** 规则 DSL：编译用户写的规则文本（设置项 lonshaRules；未配置 ⇒ not-configured）。 */
    function readRules(host, m) {
        if (!m.rc || typeof m.rc.compileRules !== 'function') return { ok: false, reason: 'module-unavailable' };
        let text = '';
        try { text = String((host && host.config && host.config.config && host.config.config.lonshaRules) || ''); } catch (_e) { text = ''; }
        if (!text.trim()) return { ok: false, reason: 'not-configured' };
        try {
            const r = m.rc.compileRules(text);
            /* compileRules 返回 `{format, version, statements, nodeCount}`；每条 statement 是
             *  `{condition, action, value}`，**action 是单个字符串**（不是 actions 数组）。
             *  修前这里读 `r.rules` 与 `rule.actions`，两处都不存在 ⇒ 面板恒显示「规则 0 条」，
             *  而作者明明写了规则（「读错键 = 恒空读数」，与窗口那处同型）。 */
            const stmts = (r && Array.isArray(r.statements)) ? r.statements : [];
            const byOp = {};
            for (const s of stmts) {
                const op = String((s && s.action) || '?');
                byOp[op] = (byOp[op] || 0) + 1;
            }
            return { ok: true, rules: stmts.length, byOp: byOp, chars: text.length, nodes: Number(r && r.nodeCount) || 0 };
        } catch (e) {
            return {
                ok: false, reason: 'compile-error',
                error: String((e && e.message) || e || 'unknown'),
                line: Number(e && e.line) || 0, column: Number(e && e.column) || 0
            };
        }
    }

    /** 存档编解码：给面板一个「现在存下来多大 / 编不编得出来」的实测值。 */
    function readCodec(host, m, probe) {
        if (!m.sc || typeof m.sc.encodeSave !== 'function') return { ok: false, reason: 'module-unavailable' };
        let value = probe;
        if (value === undefined) {
            /* `encodeSave` 吃的是**内存存档**（`schema === 2` 且带 id/chatId/bookName/revision 身份），
             *  返回的是**对象**（`{schema, encoding, pool, root, ...}`）而不是字符串。
             *  否则面板拿到 `[object Object]` 当体积（16 字），「存档多大」永远答错。 */
            try {
                const sm = host && host.summary;
                const rows = (sm && Array.isArray(sm.summaries)) ? sm.summaries : null;
                if (!rows) return { ok: false, reason: 'no-payload' };
                let chatId = 'panel';
                try { if (host && typeof host.getCurrentChatId === 'function') chatId = String(host.getCurrentChatId() || 'panel'); } catch (_e) { chatId = 'panel'; }
                value = { schema: 2, id: 'panel-probe', chatId: chatId, bookName: 'panel-probe', revision: 0, summaries: rows };
            } catch (_e) { value = null; }
        }
        if (value === null || value === undefined) return { ok: false, reason: 'no-payload' };
        try {
            const out = m.sc.encodeSave(value);
            const text = JSON.stringify(out);
            return {
                ok: true, chars: text.length,
                pool: Number(out && out.pool && out.pool.length) || 0,
                encoding: String((out && out.encoding) || ''),
                ratio: Math.round((text.length / Math.max(1, JSON.stringify(value).length)) * 1000) / 1000
            };
        } catch (e) {
            /* 容量超限是**真事件**（存档将要丢掉什么），不能与「模块坏了」同形。 */
            const kind = String((e && e.kind) || '');
            return {
                ok: false, reason: kind === 'capacity' ? 'capacity' : 'encode-failed',
                error: String((e && e.message) || e || 'unknown'),
                readings: (e && e.readings) || null
            };
        }
    }

    /** 选文复用：读 host 上一轮闸门的判定与原因。 */
    function readReuse(host, m) {
        if (!m.sr) return { ok: false, reason: 'module-unavailable' };
        const r = host && host._aiSelectReuseRead;
        if (!r) return { ok: false, reason: 'not-run' };
        return {
            ok: true, reused: r.reused === true,
            ids: Number(r.ids) || 0,
            reasons: Array.isArray(r.reasons) ? r.reasons.slice() : [],
            key: String(r.key || '')
        };
    }

    /** 句子级改写：读上一次摘要编辑的定性结论。 */
    function readEdits(host, m) {
        if (!m.se) return { ok: false, reason: 'module-unavailable' };
        const r = host && host.summary && host.summary._lastSummaryEditRead;
        if (!r) return { ok: false, reason: 'not-run' };
        return {
            ok: true,
            codes: Array.isArray(r.codes) ? r.codes.slice() : [],
            reason: String(r.reason || ''),
            spanChars: Number(r.spanChars),
            coverage: Number(r.coverage),
            rewritten: !!(r.codes && (r.codes.indexOf('patch-span-too-wide') >= 0 || r.codes.indexOf('patch-span-too-long') >= 0)),
            line: String(r.line || '')
        };
    }

    /**
     * 唯一取数口径：六条一起读。
     * @param {object} host 引擎实例（本仓 LonShaMemoryEngine）
     * @param {{probe?:any}} [opts] probe 给 codec 用的显式载荷（测试用）
     */
    function read(host, opts) {
        const m = mods();
        const o = opts && typeof opts === 'object' ? opts : {};
        const out = {
            kind: PB_KIND, version: PB_VERSION,
            missing: missingOf(m),
            maintenance: { ok: false, reason: 'not-run' },
            window: { ok: false, reason: 'not-run' },
            rules: { ok: false, reason: 'not-run' },
            codec: { ok: false, reason: 'not-run' },
            reuse: { ok: false, reason: 'not-run' },
            edits: { ok: false, reason: 'not-run' }
        };
        const step = (key, fn) => {
            try { out[key] = fn() || { ok: false, reason: 'empty' }; }
            catch (e) { out[key] = { ok: false, reason: 'thrown', error: String((e && e.message) || e) }; }
        };
        step('maintenance', () => readMaintenance(host, m));
        step('window', () => readWindow(host, m));
        step('rules', () => readRules(host, m));
        step('codec', () => readCodec(host, m, o.probe));
        step('reuse', () => readReuse(host, m));
        step('edits', () => readEdits(host, m));
        /* 活着几条：缺席一条也算，但要说清是哪条 */
        out.alive = SIX.filter((k) => out[k] && out[k].ok !== false).length;
        out.total = SIX.length;
        out.line = line(out);
        try { if (host && typeof host === 'object') host._v4Read = out; } catch (_e) { /* 只读宿主 */ }
        return out;
    }

    /** 诊断行：六条各一格，缺哪条点名。 */
    function line(readObj) {
        const r = readObj && typeof readObj === 'object' ? readObj : {};
        const cell = (key, ok, text) => (ok ? text : '×' + key + '(' + String((r[key] && r[key].reason) || '?') + ')');
        const parts = [];
        parts.push(cell('maintenance', !!(r.maintenance && r.maintenance.ok), '维护' + String(r.maintenance && r.maintenance.trigger || '-')));
        parts.push(cell('window', !!(r.window && r.window.ok),
            '窗口 隐' + String((r.window && r.window.hide) || 0) + '/撤' + String((r.window && r.window.restore) || 0)));
        parts.push(cell('rules', !!(r.rules && r.rules.ok), '规则' + String((r.rules && r.rules.rules) || 0) + '条'));
        parts.push(cell('codec', !!(r.codec && r.codec.ok), '存档' + String((r.codec && r.codec.chars) || 0) + '字'));
        parts.push(cell('reuse', !!(r.reuse && r.reuse.ok), '复用' + ((r.reuse && r.reuse.reused) ? '中' : '冷')));
        parts.push(cell('edits', !!(r.edits && r.edits.ok), '改写' + ((r.edits && r.edits.rewritten) ? '重写' : '句级')));
        return 'V4 六条 ' + String(r.alive ?? 0) + '/' + String(r.total ?? 6) + ' · ' + parts.join(' / ');
    }

    /**
     * 自检：**六条各自的自检 + 本层的三条纪律**。
     *   ① 六条 selfCheck 全绿；
     *   ② 空 host 不抛、不崩，六格都给出可读 reason（不是 undefined）；
     *   ③ 一条模块缺席不影响其余五格（用 missing 名单对账，不假装全好）。
     */
    function selfCheck() {
        const m = mods();
        const checks = [];
        const pairs = [
            ['维护排期', m.ms, 'maintenance-schedule'], ['窗口撤回', m.wp, 'window-plan'],
            ['句子改写', m.se, 'sentence-edits'], ['存档编码', m.sc, 'storage-codec'],
            ['选文复用', m.sr, 'selection-reuse'], ['规则编译', m.rc, 'rules-compile']
        ];
        for (const p of pairs) {
            let ok = false;
            try { ok = !!(p[1] && typeof p[1].selfCheck === 'function' && p[1].selfCheck().ok); } catch (_e) { ok = false; }
            checks.push(['六条自检·' + p[0], ok]);
        }
        let emptyOk = true;
        try {
            const r = read({}, { probe: { a: 1 } });
            for (const k of SIX) {
                const cell = r[k];
                if (!cell || typeof cell.reason !== 'string' || !cell.reason) emptyOk = false;
            }
        } catch (_e) { emptyOk = false; }
        checks.push(['空宿主六格皆有 reason', emptyOk]);
        let partialOk = true;
        try {
            const r = read({}, {});
            /* alive 必须等于「六格里 ok !== false 的条数」—— 不许把缺席算成好 */
            const expect = SIX.filter((k) => r[k] && r[k].ok !== false).length;
            partialOk = (r.alive === expect) && Array.isArray(r.missing);
        } catch (_e) { partialOk = false; }
        checks.push(['缺席逐条点名', partialOk]);
        return {
            ok: checks.every((x) => x[1]),
            checks: checks.map((x) => ({ name: x[0], ok: !!x[1] }))
        };
    }

    const api = {
        PB_VERSION: PB_VERSION,
        PB_KIND: PB_KIND,
        SIX: SIX,
        read: read,
        line: line,
        selfCheck: selfCheck
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaV4PanelBridge = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);
