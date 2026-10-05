(function (global) {
    'use strict';
/**
 * memory-books.js — 记忆书册与时间工具类集（计划 A1 第四刀）
 *
 * 【为什么需要这一面 / 修前实测】
 *   第一刀 memory-ledgers.js 剥叶子账本；第二刀 memory-aux.js 剥工具类；
 *   第三刀 narrative-generators.js 剥生成侧派生系统。本刀按同一条读数轴
 *   （成员级预算 + 文件规模上界）剥「书册 + 时间」这一簇。
 *   选它们的读数依据（逐条实测，不是感觉）：
 *     · 七个类彼此只有**两条真依赖边**，且都指向同刀内的另一个类 ——
 *         PrequelSystem.selectInjection 内 `new BM25()`（选段打分）；
 *         SuspenseBook.getOpenPrompts 内 `new RelativeTimeHelper()`（期限倒计时）。
 *       正因为这两条边跨越「书册 ↔ 时间」，本刀必须**同刀搬**：拆成两个模块就得
 *       多出两份前言/边界段、两条 manifest 登记与两处取库口，还要为跨模块通信
 *       再造一条注入链。
 *     · 对主人模块级符号的依赖只有两族，且都已收口：
 *         ① 非致命诊断记账 6 处（IncrementBookmark 2 / EchoPool 1 / RelativeTimeHelper 3）
 *            改走构造注入 `errLog`（含默认空实现）——**不静默丢诊断**；
 *         ② PlotTimeline.getChangesSince 的日期松解析 2 处，改为本模块内的**逐字副本**
 *            （见下方 parseStoryDateLoose）。
 *     · 对外只被 MemoryEngine 在构造期 `new` 一次，之后按**方法名**调用。
 *   七个类合计 751 行（含前后空行与前置注释块）。
 *
 * 【为什么不是「一个类一个模块」（PLAN 要求给出理由）】
 *   七个类里最大的相对时间工具 217 行、最小的增量书签 41 行；拆成七个文件的固定开销
 *   （七份前言 + 七条登记 + 七处取库口）比它们省下的耦合更多，而真依赖的两条边
 *   （PrequelSystem→BM25 / SuspenseBook→RelativeTimeHelper）在同一个文件里就是
 *   同一个作用域里的两个类声明 —— **类体一字不改**，也不需要构造注入或取库口转发。
 *
 * 【本模块的职责】
 *   · IncrementBookmark   增量书签（chatMetadata 下的阅读进度记录 + 删楼重同步）
 *   · EchoPool            回响池（被召回条目的多轮存活 + 逐轮衰减；容量 0 = 关闭）
 *   · SuspenseBook        悬念簿（未了结悬项 / 到期倒计时 / 唯一命中才结 / 超限沉降）
 *   · PrequelSystem       前情系统（边界加权切片 + BM25 分支选段 + 预算内注入）
 *   · RelativeTimeHelper  相对时间工具（双界时间锚点 / 架空日历 / 年龄与相识天数）
 *   · PlotTimeline        剧情时间线（按剧情日期相近度召回 + 变化驱动读取）
 *   · BM25                稀疏检索（汉-bigram 分词 + 词典归一 + 分支加权 + 断崖截断）
 *   七个类的公开面（方法名 / 返回形状 / 字段名 / 中文注入块字面量）与抽取前**逐字一致**；
 *   唯一的形式变化是三个类多了**可选的**末位/首位构造参数 `errLog`（见下）。
 *
 * 【本模块不做什么（边界）】
 *   · 不新增第二实现：模块内不重写主人任何函数；
 *   · 不持有宿主状态：只读自己的字段；宿主上下文（书签的 chatMetadata）只经可选链取；
 *   · **不静默丢诊断**：三处非致命错误记账改走构造参数 `errLog`（缺席时是空实现，
 *     丢的是诊断而不是记账本身）；
 *   · 不读宿主全局配置：EchoPool 的生命/容量仍由构造注入的 `cfgGetter` 惰性读取
 *     （与抽走前同形，运行时改配置即时生效）。
 *
 * 【口径纪律】
 *   ① 方法在字段缺失 / 环境不可用时返回空值（0 / false / [] / null / ''），**绝不抛**；
 *      构造签名新增的参数一律带默认值，`new Xxx()` 的既有调用点行为不变；
 *   ② 模块缺席时宿主退到 `MemoryBooksFallback`（常量空实现），如实回报「没有」；
 *   ③ `export()` 返回**超集形状**（每个类自己的那一份，不合并：合并会掩掉「这个类没导出」）。
 *
 * 【parseStoryDateLoose 为什么在模块内又有一份】
 *   类搬走后若继续引用宿主符号，抽离副本（单测/审计把类抠进 new Function）会当场
 *   ReferenceError，故本模块内保留一份**逐字副本**。关键是**抄哪一份**：
 *   index.js 里同名函数有两份（IIFE 顶层那份返回 `{type, year, month, day}`、
 *   内层闭包那份返回 `{y, mo, d}`），而 PlotTimeline 声明在 IIFE 顶层、读的是前者的形状。
 *   本副本取**前者**（首版取错份 ⇒ 带锚点日期时 getChangesSince 恒空，见函数上方留痕）。
 *   纪律：宿主那份改了，本副本必须同步 —— 由 tests/v3261_a1_memory_books.test.mjs 对账。
 */

    /** `PlotTimeline.getChangesSince` 真正消费的那份日期松解析的**逐字副本**。
     *
     *  【取哪一份 —— 本刀修过一次，留痕】index.js 里这个函数名出现两次：
     *    · 第一份在 v3.71 段、**IIFE 顶层**，返回 `{ type: standard|fantasy, year, month, day, monthId }`；
     *    · 第二份在 v2.2 段、**内层闭包**里，返回 `{ y, mo, d }`（只服务它自己那层的 storyDayDiff/relativePrefix）。
     *  类搬走前 `PlotTimeline` 声明在 IIFE 顶层，无限定名解析到的是**第一份**，
     *  而 getChangesSince 读的正是 `.type/.year/.month/.day/.monthId`。
     *  首次抽取按「函数声明提升后生效的是后者」的理由抄了**第二份** —— 那句理由是**错的**：
     *  提升只在**同一作用域**内替换同名声明，第二份在内层闭包里，对 IIFE 顶层的类不可见。
     *  后果是**静默功能性回归**：带锚点日期时 `anchor.type` 恒 undefined ⇒ 所有事件被过滤掉、
     *  getChangesSince 恒返回空数组（无锚点那条路径不受影响，故症状极不显眼，
     *  被 tests/v3261 的「带锚点真行为」断言当场抓住）。
     *  修法：改抄**第一份**；判据对「宿主里同形状的那一份」逐行对账 + 一条带锚点真行为断言。 */
    function parseStoryDateLoose(dateStr) {
        const s = String(dateStr || '').trim();
        if (!s) return null;
        let m = s.match(/(\d{3,4})[年/.](\d{1,2})[月/.](\d{1,2})/);
        if (m) return { type: 'standard', year: +m[1], month: +m[2], day: +m[3] };
        m = s.match(/(\d{1,2})月(\d{1,2})日?/);
        if (m) return { type: 'standard', year: null, month: +m[1], day: +m[2] };
        const monthId = (s.match(/([^\s\d]+月)/) || [])[1] || null;
        const dayM = s.match(/(\d+)\s*[日号]/) || s.match(/第\s*(\d+)/) || s.match(/(\d+)/);
        if (monthId && dayM) return { type: 'fantasy', monthId, day: +dayM[1], year: null, month: null };
        return null;
    }

    const _noop = () => {};
    /* [v3.279.0 O7] 可移除副本收紧：原此处另有一个辅助小函数，形如 `(fn) => (typeof fn === 'function' ? fn : _noop)`。
     *   实测全仓零引用（唯一命中就是它自己的声明行）：它是「选函数或回落到 _noop」的第三种写法，
     *   而本书册真正的默认诊断注入走下面 bindErrLog（Object.assign 口径，把 errLog 交给三个类）。
     *   即：它既没被用，也不承载任何契约 —— 是与模块并行的第二份实现里最纯的一类，故删除。
     *   删除不改语义：_noop 仍被 bindErrLog 使用，保留。 */
    /** 宿主取用的默认诊断注入：把 index.js 的 errLog 交给本书册里的三个类。
     *  抽离副本（测试把某个类单独抠进 new Function）拿不到这个函数，
     *  但那些副本的运行环境里 errLog 通常是注入的形参 —— 类内已按两级兜底。 */
    function bindErrLog(opts) {
        return Object.assign({ errLog: _noop }, opts || {});
    }

class IncrementBookmark {
    constructor(engine, errLog = null) { this.engine = engine; this.NS = 'LonShaMemory'; this._err = (typeof errLog === 'function') ? errLog : function () {}; }
    _store() {
        try {
            const ctx = window.SillyTavern?.getContext?.();
            const meta = ctx?.chatMetadata;
            if (!meta) return null;
            meta.extensions ??= {};
            meta.extensions[this.NS] ??= {};
            meta.extensions[this.NS].bookmarks ??= {};
            return meta.extensions[this.NS].bookmarks;
        } catch (e) { return null; }
    }
    get(key) { const s = this._store(); if (!s) return 0; const v = Number(s[key]); return Number.isFinite(v) && v > 0 ? v : 0; }
    save(key, ordinal) {
        const s = this._store();
        if (!s || !Number.isFinite(ordinal) || ordinal <= 0) return;
        s[key] = ordinal;
        try { window.SillyTavern?.getContext?.()?.saveMetadataDebounced?.(); } catch (e) { const _dh = (this && this._err) || (typeof errLog === 'function' ? errLog : null); if (_dh) { try { _dh(e, 'nonfatal'); } catch (_) {} } }
    }
    reset(key) { const s = this._store(); if (s) delete s[key]; }
    all() { const s = this._store(); return s ? { ...s } : {}; }
    // [v3.19] 删楼后书签重同步（ruby resyncBookmarksAfterDeletion）:
    // 删除使后续楼层序数前移，书签减去位于其前的被删楼层数；越界重置
    resyncAfterDeletion(deletedOldOrdinals, currentAiCount) {
        const s = this._store();
        if (!s || !deletedOldOrdinals?.length) return [];
        const changed = [];
        for (const [k, raw] of Object.entries(s)) {
            const b = Number(raw);
            if (!Number.isFinite(b) || b <= 0) continue;
            let next = b - deletedOldOrdinals.filter(d => d <= b).length;
            if (next > currentAiCount) next = 0;
            if (next !== b) { s[k] = next; changed.push(`${k} ${b}→${next}`); }
        }
        if (changed.length && window.SillyTavern?.getContext?.()?.saveMetadataDebounced) {
            try { window.SillyTavern?.getContext?.().saveMetadataDebounced?.(); } catch (e) { const _dh = (this && this._err) || (typeof errLog === 'function' ? errLog : null); if (_dh) { try { _dh(e, 'nonfatal'); } catch (_) {} } }
        }
        return changed;
    }
}


// [v2.5] RF: 回响池（抄 anima echoConfig——召回过的记忆停留N轮，防同一记忆"闪现又消失"）
class EchoPool {
    // [v3.91] 审计修复：baseLife/maxCount 原为硬编码 2/30，绕过 config.echoBaseLife(2)/echoMaxCount(10)，
    //         配置项与 UI 滑块调整均无实际效果，且容量行为与声明不符。改为构造注入（cfgGetter 惰性读取，支持运行时改配置）。
    constructor(cfgGetter = null, errLog = null) {
        this.items = [];   // [{key, text, source, life}]
        this._cfg = typeof cfgGetter === 'function' ? cfgGetter : null;
        this._err = (typeof errLog === 'function') ? errLog : function () {};
    }
    _baseLife() {
        const v = Number(this._cfg?.()?.echoBaseLife);
        return Number.isFinite(v) && v >= 1 ? Math.round(v) : 2;
    }
    _maxCount() {
        // [v3.156] 0 = 关闭回响池（UI min=0 的合法意图）；仅 NaN/负数回落默认 10
        const v = Number(this._cfg?.()?.echoMaxCount);
        return Number.isFinite(v) && v >= 0 ? Math.round(v) : 10;
    }
    onRecalled(recalled) {
        try {
            const now = Date.now();
            const baseLife = this._baseLife();
            for (const item of (recalled || []).slice(0, 20)) {
                const key = item.id || item.text || JSON.stringify(item).slice(0, 60);
                const exist = this.items.find(x => x.key === key);
                if (exist) { exist.life = Math.max(exist.life, baseLife); exist.lastSeen = now; }   // 重要度更高的条目粘更久
                else this.items.push({ key, text: item.text || item.content || item.summary || '', source: item.source, life: baseLife, lastSeen: now });
            }
            const cap = this._maxCount();
            // [v3.156] cap=0 时 `slice(-0)` === `slice(0)` === 原数组（不会清空），
            //   必须显式清空才符合「关闭回响池」语义；负数已在 _maxCount 回退。
            if (cap <= 0) this.items = [];
            else if (this.items.length > cap) this.items = this.items.slice(-cap);
        } catch (e) { const _dh = (this && this._err) || (typeof errLog === 'function' ? errLog : null); if (_dh) { try { _dh(e, 'EchoPool.onRecalled'); } catch (_) {} } }
    }
    /** 每轮衰减；返回仍存活的（life>0） */
    tick() {
        this.items = this.items.filter(x => { x.life -= 1; return x.life > 0; });
        return this.items;
    }
    export() { return this.items; }
    import(data) { const cap = this._maxCount(); this.items = Array.isArray(data) ? (cap <= 0 ? [] : data.slice(-cap)) : []; }   // [v3.156] 关闭态不导入存量
}

// [v2.2] RC: 悬念簿（抄 baibai MemPlan：约定/伏笔/未解之谜 + done/cancelled/failed 三态了结）
class SuspenseBook {
    constructor() { this.items = []; this._seq = 0; }
    /** 添加新悬项。kind: 'plan'|'suspense' */
    add(kind, content, floor, createdTime, due) {
        const c = String(content || '').trim();
        if (c.length < 4) return null;
        const id = 'sus_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        this._seq = (this._seq || 0) + 1;
        this.items.push({
            id, sid: 's' + this._seq, kind: (kind === 'suspense' ? 'suspense' : 'plan'), content: c.slice(0, 120),
            status: 'open', floor: floor ?? null, createdTime: createdTime || null, due: due || null,
            outcome: null, resolvedReason: null, resolvedFloor: null, createdAt: Date.now()
        });
        return id;
    }
    /** [v3.46] 吸收 Bakemono: 悬念倒计时与剧情时钟联动计算 */
    getOpenPrompts(clockDate) {
        const rth = new RelativeTimeHelper();
        return this.openItems().map(it => {
            let note = `${it.sid} [${it.kind === 'plan' ? '计划' : '悬念'}] ${it.content}`;
            if (it.due) {
                const dueStr = String(it.due).trim();
                if (clockDate && rth) {
                    try {
                        const pClock = rth.parseStoryDate(clockDate);
                        const pDue = rth.parseStoryDate(dueStr);
                        if (pClock && pDue && pClock.type === 'standard' && pDue.type === 'standard') {
                            const d1 = new Date(Date.UTC(pClock.year || 2026, (pClock.month || 1) - 1, pClock.day || 1));
                            const d2 = new Date(Date.UTC(pDue.year || 2026, (pDue.month || 1) - 1, pDue.day || 1));
                            const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
                            if (diffDays < 0) note += ` [已逾期${Math.abs(diffDays)}天!]`;
                            else if (diffDays === 0) note += ' [今日到期!]';
                            else note += ` [距期限还剩${diffDays}天]`;
                        } else {
                            note += ` [期限:${dueStr}]`;
                        }
                    } catch (e) { note += ` [期限:${dueStr}]`; }
                } else {
                    note += ` [期限:${dueStr}]`;
                }
            }
            return note;
        });
    }
    /** 了结悬项。outcome: 'done'|'cancelled'|'failed' */
    resolve(idOrContent, outcome, reason, floor) {
        let it = this.items.find(x => x.id === idOrContent && x.status === 'open');
        if (!it) it = this.items.find(x => x.sid === idOrContent && x.status === 'open');
        if (!it) {
            const key = String(idOrContent || '').trim();
            // [v3.179] 唯一命中才结：多条并存一律不动（与承诺账本 resolvePromise 的同族纪律对齐）。
            //   旧实现是 find 取【首个】模糊命中：AI 回引里写了半句/泛词（如「约定」「出去」）时，
            //   会把一条不相干的悬项当成目标结掉，且全程无痕——悬念簿自报「了结」，正文其实没发生。
            //   宁可漏结（保持 open，下一轮可再次精确引用），不可错结。
            const cands = key ? this.items.filter(x => x.status === 'open' && (x.content.includes(key) || key.includes(x.content))) : [];
            if (cands.length === 1) it = cands[0];
        }
        if (!it) return null;
        it.status = 'resolved';
        it.outcome = ['done', 'cancelled', 'failed'].includes(outcome) ? outcome : 'done';
        it.resolvedReason = String(reason || '').slice(0, 80) || null;
        it.resolvedFloor = floor ?? null;
        return it;
    }
    openItems() { return this.items.filter(x => x.status === 'open'); }
    /** 近期了结（注入"已了结"分区，防主模型把办完的事再拿出来说） */
    recentlyResolved(limit = 3) {
        return this.items.filter(x => x.status === 'resolved').slice(-limit).reverse();
    }
    /** [v3.45] 近期已了结/已作废事项防复读注入 (baibai 理念) */
    getRecentlyResolvedPrompt(limit = 3) {
        const recents = this.recentlyResolved(limit);
        if (!recents.length) return [];
        return recents.map(x => {
            const outcomeMap = { done: '已达成', cancelled: '已作废', failed: '已失败' };
            const outLabel = outcomeMap[x.outcome] || '已了结';
            const reason = x.resolvedReason ? `（原因：${x.resolvedReason}）` : '';
            return `- [${outLabel}] ${x.content}${reason}`;
        });
    }
    /** 上限控制：超出的最旧 open 沉降（不再注入，但保留记录） */
    prune(maxOpen) {
        const open = this.openItems();
        if (open.length <= (maxOpen || 20)) return 0;
        const toClose = open.slice(0, open.length - (maxOpen || 20));
        for (const it of toClose) { it.status = 'resolved'; it.outcome = 'cancelled'; it.resolvedReason = '（长期未了结，自动沉降）'; }
        return toClose.length;
    }
    /** 给提取 prompt 的悬念清单（带稳定短编号 s1/s2… 供 LLM 引用了结） */
    briefForPrompt() {
        const open = this.openItems();
        if (!open.length) return '（暂无未了结的悬念）';
        return open.slice(0, 12).map(x => `${x.sid || '?'}: ${x.kind === 'suspense' ? '[谜团]' : '[约定]'} ${x.content}`).join('\n');
    }
    export() { return this.items; }
    import(data) {
        this.items = Array.isArray(data) ? data : [];
        // 恢复序号器: 取历史最大 sid 编号, 防新条目 sid 撞号
        let mx = 0;
        for (const x of this.items) {
            const m = String(x.sid || '').match(/^s(\d+)$/);
            if (m) mx = Math.max(mx, Number(m[1]));
        }
        this._seq = mx;
    }
}


// [v3.87] 吸收 MyriadKnots recall-prequel：用户导入的过去经历资料（前情导入）
// 边界加权切片（换行3/句叹分号2/空白1）+ BM25 分支归一化选段 + 预算内注入
class PrequelSystem {
    constructor() {
        this.text = '';          // 前情原文（随聊天持久化）
        this.importedAt = 0;
        this._fragCache = { src: null, maxChars: 0, fragments: [] };
    }
    FRAGMENT_CHARS = 560;      // 千千结 DEFAULT_FRAGMENT_CHARACTERS
    BUDGET_SHARE = 0.3;        // 千千结 PREQUEL_BUDGET_SHARE
    MAX_TOKENS = 1200;         // 千千结 MAX_PREQUEL_TOKENS
    INSTRUCTION = '以下内容为用户导入的过去经历资料，仅用于理解前情。旧状态不代表现在仍持续；若新聊天已明确发生变化，以新聊天为准。';
    MAX_SOURCE_CHARS = 400000; // 硬上限防恶意输入

    importPrequel(text) {
        const s = String(text ?? '').replace(/\r\n/g, '\n').trim();
        if (!s) return { ok: false, chars: 0 };
        const truncated = s.length > this.MAX_SOURCE_CHARS;
        this.text = truncated ? s.slice(0, this.MAX_SOURCE_CHARS) : s;
        this.importedAt = Date.now();
        this._fragCache = { src: null, maxChars: 0, fragments: [] };
        return { ok: true, chars: this.text.length, truncated };
    }
    clearPrequel() { this.text = ''; this.importedAt = 0; this._fragCache = { src: null, maxChars: 0, fragments: [] }; }
    export() { return { text: this.text, importedAt: this.importedAt }; }
    import(data) {
        if (!data || typeof data !== 'object') return;
        this.text = String(data.text || '');
        this.importedAt = Number(data.importedAt) || 0;
        this._fragCache = { src: null, maxChars: 0, fragments: [] };
    }
    // 边界权重（千千结 boundaryWeight）：换行3 / 句叹分号2 / 空白1
    _boundaryWeight(ch) {
        if (/[\n\r]/.test(ch)) return 3;
        if (/[。！？!?；;]/u.test(ch)) return 2;
        if (/\s/u.test(ch)) return 1;
        return 0;
    }
    // 边界加权切片（忠实移植 splitPrequelText）
    splitFragments(source, maxChars = 560) {
        const s = String(source ?? '');
        if (!s) return [];
        const chars = [...s];
        const maximum = Math.max(32, Math.floor(Number(maxChars) || 560));
        const fragments = [];
        for (let start = 0; start < chars.length;) {
            const endLimit = Math.min(chars.length, start + maximum);
            let end = endLimit;
            if (endLimit < chars.length) {
                const minimum = Math.min(endLimit, start + Math.max(16, Math.floor(maximum * 0.55)));
                let bestWeight = 0;
                for (let index = endLimit - 1; index >= minimum; index -= 1) {
                    const weight = this._boundaryWeight(chars[index]);
                    if (weight > bestWeight) { end = index + 1; bestWeight = weight; }
                    if (weight === 3) break;
                }
            }
            fragments.push({ index: fragments.length + 1, text: chars.slice(start, end).join('') });
            start = end;
        }
        return fragments;
    }
    _frags(maxChars) {
        if (this._fragCache.src === this.text && this._fragCache.maxChars === maxChars) return this._fragCache.fragments;
        const fragments = this.splitFragments(this.text, maxChars);
        this._fragCache = { src: this.text, maxChars, fragments };
        return fragments;
    }
    _format(selected) {
        if (!selected || !selected.length) return '';
        return '【用户导入的过去经历资料】\n' + this.INSTRUCTION + '\n\n'
            + selected.map(f => '【前情片段 ' + f.index + '】\n' + f.text).join('\n\n');
    }
    _estimateTokens(text) { return Math.ceil((text || '').length / 4); }   // ~0.25 token/字符（与注入预算口径一致）
    _tailFallback(fragments) { return fragments.slice(-2); }   // 千千结 fallbackToTail：无命中取尾部两段
    // 选段：预算内全量；超限时用 BM25 分支归一化按当前对话相关性挑片段
    selectInjection(fragments, branchList, mainText, charBudget, tokenBudget, aliasMap) {
        const within = (sel) => {
            const t = this._format(sel);
            return t.length <= charBudget && this._estimateTokens(t) <= tokenBudget;
        };
        const complete = this._format(fragments);
        if (complete.length <= charBudget && this._estimateTokens(complete) <= tokenBudget) {
            return fragments.slice();
        }
        const bm = new BM25();
        bm.rebuild(fragments.map(f => ({ id: f.index, text: f.text, floor: f.index, source: 'prequel' })));
        const branchSet = (branchList || [])
            .filter(b => b && b.text && Number(b.weight) > 0)
            .map(b => ({ key: b.key, text: b.text, weight: Number(b.weight) }));
        branchSet.push({ key: 'main', text: String(mainText || ''), weight: 0.3 });   // 主查询 0.3 锚点（与召回管线同基调）
        let ranked = [];
        try { ranked = bm.searchBranches(branchSet, fragments.length, { cliffCut: false, aliasMap: aliasMap || null }); } catch (e) { ranked = []; }
        const byIndex = new Map(fragments.map(f => [f.index, f]));
        const matches = ranked.filter(r => (r.score || 0) > 0).sort((a, b) => (b.score - a.score) || (b.id - a.id));
        const candidates = matches.length ? matches.map(m => byIndex.get(m.id)).filter(Boolean) : this._tailFallback(fragments);
        let selected = [];
        for (const frag of candidates) {
            const attempt = [...selected, frag].sort((a, b) => a.index - b.index);
            if (within(attempt)) selected = attempt;
        }
        return selected;
    }
    buildInjection(query = {}, opts = {}) {
        if (opts.enabled === false) return '';
        if (!String(this.text || '').trim()) return '';
        const baseChars = Math.max(600, Number(opts.baseChars) || 3000);
        const tokenBase = Math.max(200, Number(opts.tokenBase) || 2700);   // [v3.135] 随默认重校准
        // 前情预算占比 30%（千千结 PREQUEL_BUDGET_SHARE），字符/token 双口径取严
        const charBudget = Math.max(200, Math.floor(baseChars * this.BUDGET_SHARE));
        const tokenBudget = Math.min(this.MAX_TOKENS, Math.max(150, Math.floor(tokenBase * this.BUDGET_SHARE)));
        const effCharBudget = Math.min(charBudget, tokenBudget * 10 / 9);   // [v3.135] CJK 口径统一（v3.133 同族）
        const fragMax = Math.max(32, Math.min(this.FRAGMENT_CHARS, effCharBudget - 120));
        const fragments = this._frags(fragMax);
        if (!fragments.length) return '';
        const branchList = (query?.branches || []).map(b => ({ key: b.key, text: b.text, weight: Number(b.weight) }));
        const selected = this.selectInjection(fragments, branchList, String(query?.text || ''), effCharBudget, tokenBudget, query?.aliases || null);
        const injectionText = this._format(selected);
        return injectionText;
    }
}


class RelativeTimeHelper {
    // [v3.43] 吸收 baibai: 双界时间锚点提取 (起止时间与经过时长)
    extractDualTimeTags(text) {
        const s = String(text || '');
        const startM = /<bbs_start>([\s\S]*?)<\/bbs_start>/i.exec(s);
        const endM = /<bbs_end>([\s\S]*?)<\/bbs_end>/i.exec(s);
        // [v3.130] 解析诊断：标签在场但日期部分无法解析时带 parseError 返回（喂给时间校准的降级决策与诊断面板）
        const parseErr = (raw) => {
            const d = String(raw || '').trim().split(/\s+/)[0];
            if (!d) return 'empty';
            if (/[\d年月/.]/.test(d)) return null;
            return `unparseable:${d.slice(0, 12)}`;
        };
        if (startM && endM) {
            const start = startM[1].trim();
            const end = endM[1].trim();
            let durationMinutes = 0;
            try {
                const t1 = new Date(start).getTime();
                const t2 = new Date(end).getTime();
                if (!isNaN(t1) && !isNaN(t2)) {
                    durationMinutes = Math.max(0, Math.round((t2 - t1) / 60000));
                }
            } catch (e) { const _dh = (this && this._err) || (typeof errLog === 'function' ? errLog : null); if (_dh) { try { _dh(e, 'nonfatal'); } catch (_) {} } }
            const parseError = parseErr(start) || parseErr(end) || null;
            return { hasDual: true, start, end, durationMinutes, parseError };
        }
        // 标签不齐（只有一半或都缺）时记录缺哪半，供协议健康度统计
        if (startM || endM) return { hasDual: false, start: startM?.[1]?.trim() || null, end: endM?.[1]?.trim() || null, durationMinutes: 0, parseError: 'half-pair' };
        return { hasDual: false, start: null, end: null, durationMinutes: 0, parseError: null };
    }

    // [v3.73] D: 时间段压缩（柏宝书 compactPair 理念）——"2023/9/10 06:45 - 2023/9/10 06:55" → "2023/9/10 06:45 - 06:55"
    // 通用做法：取首尾最长公共前缀，回退到最近的分隔边界（含），零误伤无需判断能否解析
    compactTimeRange(a, b) {
        const s1 = String(a || '').trim(), s2 = String(b || '').trim();
        if (!s1 || !s2) return s2;
        let p = 0;
        const minLen = Math.min(s1.length, s2.length);
        while (p < minLen && s1[p] === s2[p]) p++;
        // 回退到最近的分隔边界（含）——故意不含 : 与时/点，避免切碎时分
        while (p > 0 && !/[\s/／\-－年月日]/.test(s2[p - 1])) p--;
        return p > 0 ? s2.slice(p) : s2;
    }
    // [v3.73] D2: 时间标签格式化（起止压缩展示 +  原始保留双模式）
    formatTimeRange(start, end) {
        if (!start) return '';
        if (!end) return String(start).trim();
        return String(start).trim() + ' - ' + this.compactTimeRange(start, end);
    }
    // [v3.43] 吸收 baibai: 年龄精准推算时钟 (基于出生日期与当前剧情日期的数学差)
    calcAge(birthDateStr, currentStoryDateStr) {
        try {
            const b = this.parseStoryDate(birthDateStr);
            const c = this.parseStoryDate(currentStoryDateStr);
            if (b && c && b.year && c.year) {
                let age = c.year - b.year;
                if (c.month != null && b.month != null) {
                    if (c.month < b.month || (c.month === b.month && (c.day || 0) < (b.day || 0))) {
                        age--;
                    }
                }
                return Math.max(0, age);
            }
        } catch (e) { const _dh = (this && this._err) || (typeof errLog === 'function' ? errLog : null); if (_dh) { try { _dh(e, 'nonfatal'); } catch (_) {} } }
        return 0;
    }

    // [v3.43] 吸收 baibai: 相识天数数学推算
    calcDaysTogether(firstMetDateStr, currentStoryDateStr) {
        try {
            const d1 = new Date(this.normalizeNumericDateSeparators(firstMetDateStr)).getTime();
            const d2 = new Date(this.normalizeNumericDateSeparators(currentStoryDateStr)).getTime();
            if (!isNaN(d1) && !isNaN(d2)) {
                return Math.max(0, Math.floor((d2 - d1) / this.DAY_MS));
            }
        } catch (e) { const _dh = (this && this._err) || (typeof errLog === 'function' ? errLog : null); if (_dh) { try { _dh(e, 'nonfatal'); } catch (_) {} } }
        return 0;
    }
    constructor(errLog = null) {
        this._err = (typeof errLog === 'function') ? errLog : function () {};
        this.DAY_MS = 24 * 60 * 60 * 1000;
        this.WEEK_MS = 7 * this.DAY_MS;
        // 带「年月日」单位的日期字段之间允许出现的装饰分隔符
        this.DATE_FIELD_SEPARATOR = '[\\s·・•‧∙⋅.．。﹒/／,，、_\\-—–－]*';
    }

    /** 把全角/中文句点等日期分隔符规范成 / */
    normalizeNumericDateSeparators(dateStr) {
        if (!dateStr) return dateStr;
        return dateStr
            // 长格式(4 位年起):日数后只要不再跟数字/点即认,容忍后接逗号、中文、括号等
            .replace(/^(\d{4,})[.．。﹒](\d{1,2})[.．。﹒](\d{1,2})(?![\d.．。﹒])/, '$1/$2/$3')
            // 短格式(M.D):歧义大,仍要求后接空白或结尾,保守
            .replace(/^(\d{1,2})[.．。﹒](\d{1,2})(?=$|\s)/, '$1/$2');
    }

    /** 看起来是结构化数字日期(用于排除「霜月3日」误判为架空) */
    looksLikeStructuredNumericDate(dateStr) {
        if (!dateStr) return false;
        return (
            /^(?:\d{4,}[/.\-．。﹒]\d{1,2}[/.\-．。﹒]\d{1,2}|\d{1,2}[/.\-．。﹒]\d{1,2})(?=$|\s)/.test(dateStr) ||
            new RegExp(`^\\d+\\s*年${this.DATE_FIELD_SEPARATOR}\\d{1,2}\\s*月${this.DATE_FIELD_SEPARATOR}\\d{1,2}\\s*日?(?=$|\\s)`).test(dateStr) ||
            new RegExp(`^\\d{1,2}\\s*月${this.DATE_FIELD_SEPARATOR}\\d{1,2}\\s*日?(?=$|\\s)`).test(dateStr)
        );
    }

    /** 从架空日期串里抽「日数」(阿拉伯优先,无则取首个数字) */
    extractDayNumber(dateStr) {
        if (!dateStr) return null;
        const m = dateStr.match(/(\d+)\s*[日号]/) || dateStr.match(/第\s*(\d+)/);
        if (m) return parseInt(m[1], 10);
        const any = dateStr.match(/(\d+)/);
        if (any) return parseInt(any[1], 10);
        return null;
    }

    /** 从架空日期串里抽「月标识」(如「霜月」) */
    extractMonthIdentifier(dateStr) {
        if (!dateStr) return null;
        const m = dateStr.match(/([^\s\d]+月)/);
        if (m) return m[1];
        const num = dateStr.match(/(?:\d{4}[/\-])?(\d{1,2})[/\-]\d{1,2}/);
        if (num) return `M${num[1]}`;
        return null;
    }

    /** 解析故事日期字符串 → {type: 'standard'|'fantasy', year?, month?, day?, monthId?, calendarPrefix?} */
    parseStoryDate(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return null;
        const trimmed = dateStr.trim();
        if (!trimmed) return null;

        const normalized = this.normalizeNumericDateSeparators(trimmed);

        // 1. 尝试结构化数字日期
        if (this.looksLikeStructuredNumericDate(normalized)) {
            // 长格式：YYYY/M/D 或 YYYY-M-D
            let m = normalized.match(/^(\d{4,})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
            if (m) return {type: 'standard', year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10)};

            // 短格式：M/D 或 M-D
            m = normalized.match(/^(\d{1,2})[\/\-](\d{1,2})(?=$|\s)/);
            if (m) return {type: 'standard', month: parseInt(m[1], 10), day: parseInt(m[2], 10)};

            // 中文格式：X年Y月Z日
            const reYear = new RegExp(`^(\\d+)\\s*年${this.DATE_FIELD_SEPARATOR}(\\d{1,2})\\s*月${this.DATE_FIELD_SEPARATOR}(\\d{1,2})\\s*日?`);
            m = trimmed.match(reYear);
            if (m) return {type: 'standard', year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10)};

            // 中文格式：X月Y日
            const reMonth = new RegExp(`^(\\d{1,2})\\s*月${this.DATE_FIELD_SEPARATOR}(\\d{1,2})\\s*日?`);
            m = trimmed.match(reMonth);
            if (m) return {type: 'standard', month: parseInt(m[1], 10), day: parseInt(m[2], 10)};
        }

        // 2. 尝试架空日历（如「霜月3日」）
        const monthId = this.extractMonthIdentifier(trimmed);
        const day = this.extractDayNumber(trimmed);
        if (monthId && day) return {type: 'fantasy', monthId, day};

        return null;
    }

    /** 算天数差（standard 日期精确算，fantasy 日期仅同月可算） */
    calcDaysDiff(date1, date2) {
        if (!date1 || !date2) return null;
        if (date1.type !== date2.type) return null;

        if (date1.type === 'standard') {
            // 补齐缺失的年/月（按当前真实时间补）
            const now = new Date();
            const y1 = date1.year ?? now.getFullYear();
            const m1 = date1.month ?? (now.getMonth() + 1);
            const d1 = date1.day ?? 1;
            const y2 = date2.year ?? now.getFullYear();
            const m2 = date2.month ?? (now.getMonth() + 1);
            const d2 = date2.day ?? 1;

            const t1 = new Date(y1, m1 - 1, d1).getTime();
            const t2 = new Date(y2, m2 - 1, d2).getTime();
            return Math.round((t2 - t1) / this.DAY_MS);
        }

        if (date1.type === 'fantasy') {
            // 架空日历：只有同月才能算天数差
            if (date1.monthId !== date2.monthId) return null;
            return (date2.day ?? 0) - (date1.day ?? 0);
        }

        return null;
    }

    /** 生成相对时间前缀（「昨天」「3天前」「上周」等） */
    relativeTimePrefix(storyDate, nowDate) {
        const parsed1 = this.parseStoryDate(storyDate);
        const parsed2 = this.parseStoryDate(nowDate);
        const daysDiff = this.calcDaysDiff(parsed1, parsed2);

        if (daysDiff === null || daysDiff === undefined) return '';
        if (daysDiff === 0) return '今天';
        if (daysDiff === 1) return '昨天';
        if (daysDiff === 2) return '前天';
        if (daysDiff === -1) return '明天';
        if (daysDiff === -2) return '后天';
        if (daysDiff > 0 && daysDiff <= 7) return `${daysDiff}天前`;
        if (daysDiff < 0 && daysDiff >= -7) return `${-daysDiff}天后`;
        if (daysDiff > 7 && daysDiff < 14) return '上周';
        if (daysDiff < -7 && daysDiff > -14) return '下周';
        if (daysDiff >= 14 && daysDiff < 30) return `${Math.floor(daysDiff / 7)}周前`;
        if (daysDiff <= -14 && daysDiff > -30) return `${Math.floor(-daysDiff / 7)}周后`;
        if (daysDiff >= 30 && daysDiff < 365) return `${Math.floor(daysDiff / 30)}个月前`;
        if (daysDiff <= -30 && daysDiff > -365) return `${Math.floor(-daysDiff / 30)}个月后`;
        if (daysDiff >= 365) return `${Math.floor(daysDiff / 365)}年前`;
        if (daysDiff <= -365) return `${Math.floor(-daysDiff / 365)}年后`;
        return '';
    }
}

class PlotTimeline {
    constructor() { this.entries = []; }
    add(date, text, floor, characters = [], importance = 5) {
        if (!date || !text) return null;
        const source = arguments.length > 5 ? arguments[5] : null;
        const sourceKey = source && source.id ? String(source.kind || '') + ':' + String(source.id) + ':' + String(source.action || '') : '';
        if (sourceKey) {
            const same = this.entries.find(e => e.sourceKey === sourceKey);
            if (same) return same;
        }
        const exist = this.entries.find(e => e.date === date && e.text === text);
        if (exist) { exist.floor = floor; exist.timestamp = Date.now(); if (importance > (exist.importance || 5)) exist.importance = importance; return exist; }
        const e = {id: 'tl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), date, text, floor, characters, importance: (importance >= 1 && importance <= 10) ? importance : 5, timestamp: Date.now()};
        if (sourceKey) { e.sourceKey = sourceKey; e.source = { kind: String(source.kind || ''), id: String(source.id), action: String(source.action || '') }; }
        this.entries.push(e);
        if (this.entries.length > 500) this.entries.shift();
        return e;
    }
    // 按剧情日期相近度召回（同日最优先，前缀相近次之，最后兜底最新）
    searchNear(date, windowDays = 3, limit = 5) {
        if (!date) return this.entries.slice(-limit).reverse();
        const key = this._norm(date);
        const scored = this.entries.map(e => {
            const ek = this._norm(e.date);
            let dist = 999;
            if (ek === key) dist = 0;
            else if (ek.slice(0, 6) === key.slice(0, 6)) dist = 1;
            else if (ek.slice(0, 4) === key.slice(0, 4)) dist = 2;
            return {e, dist, t: e.timestamp};
        });
        scored.sort((a, b) => a.dist - b.dist || b.t - a.t);
        return scored.slice(0, limit).map(s => s.e);
    }
    _norm(d) { return String(d || '').replace(/\s+/g, '').replace(/[年月日]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''); }
    // [v3.121] 变化驱动读取：按楼层游标读取与当前时间锚点相近的事件，返回副本。
    getChangesSince(floor = -1, anchorDate = '', limit = 5, windowDays = 3, characters = []) {
        const cursor = Number.isFinite(Number(floor)) ? Number(floor) : -1;
        const cap = Math.min(20, Math.max(0, Number(limit) || 0));
        const anchor = parseStoryDateLoose(anchorDate);
        const allowed = new Set((characters || []).map(x => String(x || '').trim()).filter(Boolean));
        const rows = this.entries.filter(e => {
            if (Number(e?.floor) <= cursor) return false;
            // 有角色筛选时，允许事件声明的角色与当前登场角色相交；无声明角色的事件保留。
            const ecs = Array.isArray(e?.characters) ? e.characters.map(x => String(x || '').trim()) : [];
            if (allowed.size && ecs.length && !ecs.some(x => allowed.has(x))) return false;
            if (!anchor || !e?.date) return true;
            const ev = parseStoryDateLoose(e.date);
            if (!ev || ev.type !== anchor.type) return false;
            if (ev.type === 'fantasy') return ev.monthId === anchor.monthId && Math.abs((ev.day || 0) - (anchor.day || 0)) <= Math.max(0, Number(windowDays) || 0);
            if (ev.year == null || anchor.year == null) return false;
            const a = Date.UTC(anchor.year, (anchor.month || 1) - 1, anchor.day || 1);
            const b = Date.UTC(ev.year, (ev.month || 1) - 1, ev.day || 1);
            return Math.abs(Math.round((b - a) / 86400000)) <= Math.max(0, Number(windowDays) || 0);
        });
        return rows.sort((a, b) => Number(a.floor) - Number(b.floor) || Number(a.timestamp || 0) - Number(b.timestamp || 0)).slice(-cap).map(e => ({ ...e, characters: Array.isArray(e.characters) ? [...e.characters] : e.characters }));
    }
    export() { return this.entries; }
    import(data) { this.entries = Array.isArray(data) ? data : []; }
}


// [v1.9] P1: BM25 稀疏检索（抄 anima bm25：词频×逆文档频率×长度归一化）
class BM25 {
    constructor() { this.docs = []; this.docTerms = []; this.df = new Map(); this.N = 0; this.avgLen = 0; }
    // [v3.86] 吸收 MyriadKnots Han-bigram 分词：NFKC 归一化 + Unicode Script 属性
    // （覆盖扩展区汉字/全角字符；拉丁与数字整词保留，汉字重叠二元组）
    _tokenize(text) {
        const tokens = [];
        const s = String(text ?? '').normalize('NFKC').toLocaleLowerCase('zh-CN');
        for (const m of s.matchAll(/[\p{Script=Latin}\p{N}]+/gu)) tokens.push(m[0]);
        for (const m of s.matchAll(/\p{Script=Han}+/gu)) {
            const ch = [...m[0]];
            if (ch.length === 1) { tokens.push(ch[0]); continue; }
            for (let i = 0; i + 1 < ch.length; i++) tokens.push(ch[i] + ch[i + 1]);
        }
        return tokens;
    }
    // [v3.152] A2 词典归一单真源：文档端统一别名表面→规范名；查询端附加规范名+释义。
    // 数据源优先 rebuild 注入的引擎词典（_lexRef），回落 window.LonShaMemory.engine.lexicon；
    // 两处都不可用（Node 单测/无词典）时原样返回，行为与 v3.151 完全一致。
    _lexExpand(text, lxOverride, withDesc) {
        try {
            const lx = lxOverride || this._lexRef
                || (typeof window !== 'undefined' && window.LonShaMemory?.engine?.lexicon) || null;
            if (!lx || !lx.items?.length) return String(text ?? '');
            const hits = lx.match(text);
            if (!hits.length) return String(text ?? '');
            let out = String(text ?? '');
            for (const h of hits) {
                const canon = h.item.terms[0];
                for (const s of h.terms) if (s !== canon) out += ' ' + canon;
                if (withDesc && h.item.desc) out += ' ' + String(h.item.desc).slice(0, 60);
            }
            return out;
        } catch (e) { return String(text ?? ''); }
    }
    /** 文档端归一（rebuild 的 docTerms 构建内调用） */
    _lexNormalize(text) { return this._lexExpand(text, null, false); }
    /** 查询端归一（searchBranches 的分支构建处调用）：附加规范名 + 释义短语 */
    normalizeQueryByLexicon(text, lx) { return this._lexExpand(text, lx, true); }
    rebuild(docs, lexicon = null) {
        this.docs = docs || [];
        this.N = this.docs.length;
        // [v3.152] 词典引用与归一指纹（诊断用；词典变更后引擎经 _invalidateBm25Corpus 置空 _corpusFp 触发重建）
        this._lexRef = lexicon || this._lexRef || null;
        try {
            this._lexFp = (this._lexRef?.items || []).map(x => x.canon + ':' + x.count + ':' + (x.terms || []).length + ':' + (x.desc ? 1 : 0)).join('|');
        } catch (e) { this._lexFp = ''; }
        this.docTerms = this.docs.map(d => {
            const terms = this._tokenize(this._lexNormalize(d.text));
            const map = new Map();
            terms.forEach(t => map.set(t, (map.get(t) || 0) + 1));
            return map;
        });
        this.df = new Map();
        for (const tm of this.docTerms) for (const t of tm.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
        this.avgLen = this.N ? this.docTerms.reduce((a, m) => a + m.size, 0) / this.N : 0;
    }
    // [v3.23] 断崖截断（NE-Memory retrieval-filter 分数断崖）: 相邻分 3x 且低于首项 15% → 自然截断
    // 弱相关长尾截掉，minResults 保底防空洞
    _cliffCut(scored, topK, opts = {}) {
        scored.sort((a, b) => b.score - a.score);
        if (!opts.cliffCut) return scored.slice(0, topK);
        const minResults = opts.minResults || 2;
        let resultCount = Math.min(topK, scored.length);
        const topScore = scored[0]?.score || 0;
        if (resultCount >= minResults && scored.length > minResults && topScore > 0) {
            for (let i = 0; i < resultCount - 1; i++) {
                const cur = scored[i].score;
                const next = Math.max(scored[i + 1].score, 1e-8);
                const pctOfTop = next / Math.max(topScore, 1e-8);
                if (cur / next > 3.0 && pctOfTop < 0.15 && (i + 1) >= minResults) {
                    resultCount = i + 1;
                    break;
                }
            }
        }
        // 保底: 至少返回 minResults 条非零分结果
        let pos = 0;
        while (pos < scored.length && scored[pos].score > 0) pos++;
        if (resultCount < minResults) resultCount = Math.min(Math.max(minResults, 1), Math.max(pos, 1), scored.length);
        return scored.slice(0, resultCount);
    }
    search(query, topK = 5, opts = {}) {
        // [v3.86] 单查询等价为主分支（weight=1），统一走 searchBranches 管线
        return this.searchBranches([{ key: 'main', text: query, weight: 1 }], topK, opts);
    }
    // [v3.90] 吸收 MyriadKnots entity-identity：查询侧别名扩展。命中别名→附加主名原文，
    // 注意扩展在分词前的文本层做（中文二元切分下 3 字以上别名整串永远不是 token）
    _expandAliases(text, aliasMap) {
        if (!(aliasMap instanceof Map) || !aliasMap.size) return String(text ?? '');
        let out = String(text ?? '');
        const norm = out.normalize('NFKC').toLocaleLowerCase('zh-CN');   // 归一化副本上检测（全角/大小写别名也能命中）
        for (const [key, main] of aliasMap) {
            if (norm.includes(key)) out += ' ' + String(main ?? '').trim();
        }
        return out;
    }
    // [v3.86] 吸收 MyriadKnots recall-ranking：多路查询分支各自按分支内最高分归一化后加权合成。
    // 解决痛点：长背景文本（recentAssistant）的 BM25 绝对分高，会淹没用户最新短输入（latestUser）。
    // 分支独立归一化后，短查询在自己分支内也能拿满 1.0，锚定最新诉求。
    searchBranches(branches, topK = 5, opts = {}) {
        if (!this.N) return [];
        // [v3.152] A2 查询端词典归一：查询命中术语时附加规范名 + 释义短语（与文档端同一词典）
        const _lxOn = (typeof window !== 'undefined' && window.LonShaMemory?.engine?.config?.config?.bm25LexiconNormalizeEnabled !== false);
        const _lx = _lxOn ? (this._lexRef || (typeof window !== 'undefined' && window.LonShaMemory?.engine?.lexicon) || null) : null;
        const active = (Array.isArray(branches) ? branches : [])
.map((b, i) => {
                let _t = (opts.aliasMap ? this._expandAliases(b?.text, opts.aliasMap) : b?.text);
                if (_lx && _lx.items?.length) _t = this.normalizeQueryByLexicon(_t, _lx);
                return { key: String(b?.key ?? i), weight: Number(b?.weight) || 0, terms: [...new Set(this._tokenize(_t))] };
            })
            .filter(b => b.weight > 0 && b.terms.length);
        if (!active.length) return [];
        const weightTotal = active.reduce((s, b) => s + b.weight, 0);
        if (weightTotal <= 0) return [];
        const k1 = 1.2, bParam = 0.75;
        const normByBranch = [];
        for (const q of active) {
            const raw = new Array(this.N).fill(0);
            for (let i = 0; i < this.N; i++) {
                const tm = this.docTerms[i];
                const len = tm.size || 1;
                let score = 0;
                for (const qt of q.terms) {
                    const tf = tm.get(qt) || 0;
                    if (!tf) continue;
                    const df = this.df.get(qt) || 0;
                    const idf = Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
                    score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - bParam + bParam * len / (this.avgLen || 1)));
                }
                raw[i] = score;
            }
            // 分支内按最高分归一化；分支全零时保持全零（不放大全语料级低 IDF 重叠）
            const max = Math.max(0, ...raw);
            normByBranch.push(raw.map(s => max > 0 ? s / max : 0));
        }
        const scored = [];
        for (let i = 0; i < this.N; i++) {
            let score = 0;
            const branchScores = {};
            for (let j = 0; j < active.length; j++) {
                const norm = normByBranch[j][i];
                branchScores[active[j].key] = norm;
                score += norm * (active[j].weight / weightTotal);
            }
            if (score > 0) scored.push({ ...this.docs[i], score, branchScores });
        }
        return this._cliffCut(scored, topK, opts);
    }
}


    const api = Object.freeze({ IncrementBookmark, EchoPool, SuspenseBook, PrequelSystem, RelativeTimeHelper, PlotTimeline, BM25, bindErrLog });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaMemoryBooks = api;
})(typeof window !== 'undefined' ? window : globalThis);
