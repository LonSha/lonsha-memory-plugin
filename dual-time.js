/**
 * dual-time.js — [v3.355.0 · M6-O5] 双时间经历：分清何时发生、何时被得知
 *   纯函数 IIFE，零依赖、零联网、零写回。
 *
 * 【为什么需要这一面 / 现状边界】
 *   本仓已有三样时间设施，各自都对，但**互不代替**：
 *     · fact-version.js   —— 事实的楼层有效区间（from/to/floor）与修订史；
 *     · story-clock-parse.js —— 从正文注释回读剧情时钟（date/weekday/time 三字段）；
 *     · knowledge-trace.js —— 谁知道哪条事实（lived/heard/misled/unknown）。
 *   缺的是把它们**联起来**的那一层语义。用户会问两件不同的事：
 *     「那天到底发生了什么？」        ← 事件有效时间（occurred）
 *     「当时这个人知道什么？」        ← 角色获知时间（learned）
 *   而一件旧事常常是**迟到披露**的：第 100 楼才揭露「第 10 楼以前搬过家」。
 *   此时正确读数是：发生在 10 楼前，文本在 100 楼披露，人物在第 100 楼才知道。
 *   把这三个时间压成一个「时间」，就会出现本仓最伤的一类假读数 ——
 *   第 20 楼的人物视角里出现他当时根本不可能知道的事（**时间旅行式注入**）。
 *
 * 【本模块的职责（建坐标，不建第二套时间数据库）】
 *   给每个「经历时间坐标」三个**可连接但不互相代替**的轴：
 *     occurred —— 何时发生（事件有效时间）
 *     disclosed —— 何时在文本里被说出来（披露时间）
 *     learned  —— 何时被某个角色得知（获知时间，按角色分账）
 *   并支持：部分日期（只知道年/月）、相对先后（早于/晚于另一条）、
 *   闪回（occurred 远早于 disclosed）、不确定区间（lo/hi 而非单点）。
 *
 * 【五条硬纪律（每条都对应一次真会出错的读数）】
 *   1. **未知就是 unknown，绝不猜**：解析不出就返回 unknown 轴，
 *      不许拿楼层顺序伪装剧情日期（计划原文：「不用楼层顺序伪装剧情日期」）。
 *   2. **三轴不许互相赋值**：occurred 永远不从 disclosed 推、learned 永远不从 occurred 推。
 *      唯一允许的推导是 `learned >= disclosed`（人不可能在文本披露前得知）——
 *      违反即标 inconsistent，**不静默修正**（修正会把矛盾藏起来）。
 *   3. **当时视角用 learned 裁**：`visibleAt(axis, floor)` 只看该角色在那一楼是否已知，
 *      绝不因为「现在知道」就允许历史视角也看见（验收①的核心）。
 *   4. **冲突版本并存**：同一角色先后获知两个互相矛盾的版本时，
 *      两个版本都留在账上并标 conflict，历史视角取**当时那一个**（验收②）。
 *   5. **区间优于点**：日期不全返回 lo/hi 区间或 unknown，不硬凑一个点。
 *
 * 【本模块不做什么（边界）】
 *   · 不引入另一套时间数据库：一切坐标挂在既有 factId / floor 上，本模块只做投影。
 *   · 不解析自然语言长句（那是提取的事）：只吃结构化字段与已解析的剧情钟。
 *   · 不修改 fact-version 的契约字段（计划明示「先兼容旧档『未知坐标』」）。
 *
 * 挂 window.LonShaDualTime，供 index.js 查询 / 年鉴 / 场景材料 / 视角卡使用。
 */
(function () {
    'use strict';

    const DT_VERSION = 1;
    const DT_KIND = 'dual_time';

    /** 三轴（★ 刻意分开命名：任何一处写 `time` 都会被判据按住）。 */
    const TIME_AXES = Object.freeze({
        OCCURRED: 'occurred',
        DISCLOSED: 'disclosed',
        LEARNED: 'learned',
    });
    /** 单轴读数四态：点 / 区间 / 未知 / 不一致。 */
    const AXIS_STATES = Object.freeze({
        POINT: 'point',
        RANGE: 'range',
        UNKNOWN: 'unknown',
        INCONSISTENT: 'inconsistent',
    });
    /** 获知来源（沿用 knowledge-trace 的四态词，不新造第二套）。 */
    const LEARN_SOURCES = Object.freeze({
        LIVED: 'lived',
        HEARD: 'heard',
        MISLED: 'misled',
        UNKNOWN: 'unknown',
    });
    const DT_REASONS = Object.freeze({
        OK: 'ok',
        NOT_OBJECT: 'not-object',
        NO_SUBJECT: 'no-subject',
        NO_AXIS: 'no-axis',
        BAD_SHAPE: 'bad-shape',
        NOT_FOUND: 'not-found',
        LEARNED_BEFORE_DISCLOSED: 'learned-before-disclosed',
        CONFLICT: 'conflict',
    });
    const DT_LIMITS = Object.freeze({
        coords: 400,
        versionsPerSubject: 6,
        conflicts: 8,
        note: 160,
    });

    /* ---------- 基础归一 ---------- */
    function str(v) { return String(v == null ? '' : v).trim(); }
    function capStr(v, n) {
        const s = str(v);
        return s.length > n ? s.slice(0, n) : s;
    }
    function numOrNull(v) {
        if (v == null || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    function strList(v, cap) {
        const out = [];
        if (!Array.isArray(v)) return out;
        for (const item of v) {
            const s = str(item);
            if (s && out.indexOf(s) < 0) out.push(s);
            if (out.length >= cap) break;
        }
        return out;
    }

    /**
     * 归一一个时间轴读数。
     * 输入接受三种形态：
     *   · 数字点      → { state:'point', at:n }
     *   · {lo, hi}    → { state:'range', lo, hi }
     *   · 缺 / 非法   → { state:'unknown' }   ★ 绝不回落成「现在」
     * ★ 为什么点也要包成对象：调用方若拿到裸 null 就很容易写 `x || now`，
     *   包成对象后「未知」是一个**有名字的状态**，兜底就必须显式写出来。
     */
    function normalizeAxis(raw) {
        if (raw == null || raw === '') return { state: AXIS_STATES.UNKNOWN, at: null, lo: null, hi: null };
        if (typeof raw === 'number' || (typeof raw === 'string' && /^-?\d+(\.\d+)?$/.test(raw.trim()))) {
            const n = numOrNull(raw);
            if (n == null) return { state: AXIS_STATES.UNKNOWN, at: null, lo: null, hi: null };
            return { state: AXIS_STATES.POINT, at: n, lo: n, hi: n };
        }
        if (typeof raw === 'object' && !Array.isArray(raw)) {
            const lo = numOrNull(raw.lo), hi = numOrNull(raw.hi);
            if (lo == null && hi == null) return { state: AXIS_STATES.UNKNOWN, at: null, lo: null, hi: null };
            if (lo != null && hi != null) {
                /* ★ 区间端点颠倒时不静默交换：交换会把一个矛盾读数变成「正常区间」。 */
                if (lo > hi) return { state: AXIS_STATES.INCONSISTENT, at: null, lo: lo, hi: hi };
                if (lo === hi) return { state: AXIS_STATES.POINT, at: lo, lo: lo, hi: hi };
                return { state: AXIS_STATES.RANGE, at: null, lo: lo, hi: hi };
            }
            /* 只有一端：半开区间，如实记，不补另一端。 */
            return { state: AXIS_STATES.RANGE, at: null, lo: lo, hi: hi };
        }
        return { state: AXIS_STATES.UNKNOWN, at: null, lo: null, hi: null };
    }
    /** 两个轴读数是否可比（都已知且都有端点）。 */
    function comparable(a, b) {
        return a && b && a.state !== AXIS_STATES.UNKNOWN && b.state !== AXIS_STATES.UNKNOWN
            && a.lo != null && b.lo != null;
    }
    /**
     * 三轴是否自洽：唯一允许的关系是 `learned` 不早于 `disclosed`。
     * ★ 违反**只标不一致，不修正**：修正等于把「文本在第 100 楼才披露、
     *   人物却在第 10 楼就知道」这种真矛盾藏起来，而那正是要修的数据。
     */
    /* ★ 内部实现吃**已归一的 base**，绝不再回头调 normalizeCoord：
     *   首版写成 axisConsistency 里调 normalizeCoord，而 normalizeCoord 又要算
     *   consistency —— 两者互调，构造期直接 RangeError: Maximum call stack size exceeded
     *   （本版自检当场抓到）。归一层与判定层必须单向依赖。 */
    function axisCheck(base) {
        const problems = [];
        const dis = base.disclosed, lea = base.learned;
        if (comparable(dis, lea) && lea.lo < dis.lo) problems.push(DT_REASONS.LEARNED_BEFORE_DISCLOSED);
        /* occurred 可以晚于 disclosed（预告）也可以早很多（闪回）——故不判。
         * ★ 这里刻意**不**加「occurred 必须早于 disclosed」：闪回是合法叙事。 */
        return { ok: problems.length === 0, why: problems.length ? problems[0] : DT_REASONS.OK, problems: problems };
    }
    /** 对外入口（容错：吃裸对象或已归一对象都行，只归一一次）。 */
    function axisConsistency(coord) {
        const c = normalizeCoord(coord);
        if (!c) return { ok: false, why: DT_REASONS.NOT_OBJECT, problems: [] };
        return c.consistency;
    }

    /**
     * 归一一个经历时间坐标。
     * ★ 身份是 `subject`（事实 id / 经历 id）+ `actor`（角色名，可空=叙述层）。
     *   同一 subject 不同 actor 是**不同的获知账**，不许合成一条。
     */
    function normalizeCoord(raw) {
        const o = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : null;
        if (!o) return null;
        const subject = capStr(o.subject, 80);
        if (!subject) return null;
        const base = {
            subject: subject,
            actor: capStr(o.actor, 40),
            occurred: normalizeAxis(o.occurred),
            disclosed: normalizeAxis(o.disclosed),
            learned: normalizeAxis(o.learned),
            source: (Object.values(LEARN_SOURCES).indexOf(str(o.source)) >= 0) ? str(o.source) : LEARN_SOURCES.UNKNOWN,
            /** 获知时读到的那个版本（版本冲突时历史视角取它）。 */
            version: capStr(o.version, 80),
            /** 版本轨迹：逐条 {version, learnedAt}（历史视角取当时版本的载体）。
             *   旧档的裸字符串不丢：归一时补成 {version, learnedAt:null}。 */
            versionTrail: (Array.isArray(o.versionTrail) ? o.versionTrail : []).map(function (x) {
                if (x && typeof x === 'object') return { version: capStr(x.version, 80), learnedAt: numOrNull(x.learnedAt) };
                return { version: capStr(x, 80), learnedAt: null };
            }).filter(function (x) { return !!x.version; }).slice(-DT_LIMITS.versionsPerSubject),
            note: capStr(o.note, DT_LIMITS.note),
            /** 闪回标记：occurred 远早于 disclosed 时由调用方显式标注，本模块不自动判。 */
            flashback: o.flashback === true,
        };
        base.consistency = axisCheck(base);
        return base;
    }
    function normalizeCoords(raw) {
        const out = [];
        if (!Array.isArray(raw)) return out;
        for (const item of raw.slice(0, DT_LIMITS.coords)) {
            const c = normalizeCoord(item);
            if (c) out.push(c);
        }
        return out;
    }

    /* ---------- 建账与查询 ---------- */
    /**
     * 登记一个坐标（幂等：同 subject + actor 视为**同一账的一次更新**，
     * 旧值进 versions 保留 —— 这正是「同一人物先后获知两个冲突版本」的载体）。
     */
    function upsertCoord(list, raw) {
        const arr = Array.isArray(list) ? list : [];
        const c = normalizeCoord(raw);
        if (!c) return { ok: false, why: DT_REASONS.NO_SUBJECT, coord: null, list: arr };
        const idx = arr.findIndex(function (x) {
            const n = normalizeCoord(x);
            return n && n.subject === c.subject && n.actor === c.actor;
        });
        if (idx < 0) return { ok: true, why: DT_REASONS.OK, coord: c, list: arr.concat([c]) };
        const prev = normalizeCoord(arr[idx]);
        /* ★ 版本带获知点存档（本版判据抓到的真缺陷）：旧写法只存版本**字符串**，
         *   于是「第 110 楼当时读到的是哪个版本」这个问题**根本没有答案**：
         *   字符串不带楼层，而历史视角要正是「那一楼那一刻的那个版本」。
         *   改为逐条存 {version, learnedAt}（本体叫 versionTrail）；旧档的裸字符串不丢，
         *   归一时补成 {version, learnedAt:null}（learnedAt 未知就是 null，不猜）。 */
        const trailIn = Array.isArray(prev.versionTrail) ? prev.versionTrail : [];
        const trail = trailIn.map(function (x) {
            if (x && typeof x === 'object') return { version: capStr(x.version, 80), learnedAt: numOrNull(x.learnedAt) };
            return { version: capStr(x, 80), learnedAt: null };
        }).filter(function (x) { return !!x.version; });
        if (prev.version && !trail.some(function (x) { return x.version === prev.version; })) {
            trail.push({ version: prev.version, learnedAt: numOrNull(prev.learned && prev.learned.lo) });
        }
        trail.push({ version: c.version, learnedAt: numOrNull(c.learned && c.learned.lo) });
        const seen = {};
        const versionTrail = [];
        for (let i = trail.length - 1; i >= 0; i -= 1) {
            const it = trail[i];
            if (seen[it.version]) continue;
            seen[it.version] = 1;
            versionTrail.unshift(it);
        }
        const versions = strList(versionTrail.map(function (x) { return x.version; }), DT_LIMITS.versionsPerSubject);
        const conflicts = strList((Array.isArray(prev.conflicts) ? prev.conflicts : []).concat(
            (prev.version && c.version && prev.version !== c.version) ? [c.version] : []
        ), DT_LIMITS.conflicts);
        const updated = Object.assign({}, c, {
            versions: versions,
            versionTrail: versionTrail.slice(-DT_LIMITS.versionsPerSubject),
            conflicts: conflicts,
        });
        const next = arr.slice();
        next[idx] = updated;
        return { ok: true, why: conflicts.length ? DT_REASONS.CONFLICT : DT_REASONS.OK, coord: updated, list: next };
    }
    /**
     * 某一楼当时读到的版本（历史视角取「当时那一个」的唯一出口）。
     *   ★ 三种回答分开：有版本（返回字符串）/ 该楼还没获知（'not-yet'）/ 版本时间未知（'unknown'）。
     *   后两者不得合并：「他那时还不知道」与「不知道他那时知不知道」是两件事。
     */
    function versionAt(coord, floor) {
        const c = normalizeCoord(coord);
        const f = numOrNull(floor);
        if (!c) return { ok: false, version: null, why: DT_REASONS.NOT_OBJECT };
        if (f == null) return { ok: false, version: null, why: DT_REASONS.BAD_SHAPE };
        const vis = visibleAt(c, f);
        if (vis.known === 'no') return { ok: true, version: 'not-yet', why: DT_REASONS.OK };
        if (vis.known === 'unknown') return { ok: true, version: 'unknown', why: vis.why };
        const trail = Array.isArray(c.versionTrail) ? c.versionTrail : [];
        let best = null;
        for (const it of trail) {
            if (!it || !it.version) continue;
            if (it.learnedAt == null) continue;
            if (it.learnedAt <= f && (!best || it.learnedAt >= best.learnedAt)) best = it;
        }
        if (!best) {
            /* 轨迹里没有带楼层的版本：如果只有一个版本可以回答，多个就是本模块说不出结论。 */
            const known = trail.filter(function (x) { return x && x.version; });
            if (known.length === 1) return { ok: true, version: known[0].version, why: DT_REASONS.OK };
            return { ok: true, version: 'unknown', why: DT_REASONS.NO_AXIS };
        }
        return { ok: true, version: best.version, why: DT_REASONS.OK, learnedAt: best.learnedAt };
    }
    function findCoord(list, subject, actor) {
        const wantS = str(subject), wantA = str(actor);
        const arr = normalizeCoords(list);
        for (const c of arr) {
            if (c.subject === wantS && c.actor === wantA) return c;
        }
        return null;
    }
    /**
     * 某角色在某一楼**是否已知**这条经历（验收①的核心判据）。
     * ★ 只看 learned 轴：`learned` 未知 ⇒ 返回 unknown，**不默认已知也不默认未知**。
     *   默认已知会让历史视角看见未来；默认未知会让「他明明在场」被抹掉。
     *   两者都是假读数，故 third state 是唯一诚实的答案。
     */
    function visibleAt(coord, floor) {
        const c = normalizeCoord(coord);
        const f = numOrNull(floor);
        if (!c) return { known: 'unknown', why: DT_REASONS.NOT_OBJECT };
        if (f == null) return { known: 'unknown', why: DT_REASONS.BAD_SHAPE };
        const lea = c.learned;
        if (lea.state === AXIS_STATES.INCONSISTENT) return { known: 'unknown', why: DT_REASONS.BAD_SHAPE };
        /* ★ 「他从哪一楼开始知道」不能只看 learned 轴当前值（本版判据抓到的第二层缺陷）：
         *   upsertCoord 同一账再更新时会把 learned 推到新获知点，若看它，
         *   第 110 楼就会被判成「还不知道」—— 而事实上他在第 100 楼就已经知道旧版本。
         *   故首次获知点取轨迹里**最早**的那个 learnedAt；轨迹没带楼层才退回 learned 轴。
         *   两者都不可用时仍回第三态 unknown（不默认已知也不默认未知）。 */
        const trail = Array.isArray(c.versionTrail) ? c.versionTrail : [];
        let firstLearned = null;
        for (const it of trail) {
            if (!it || it.learnedAt == null) continue;
            if (firstLearned == null || it.learnedAt < firstLearned) firstLearned = it.learnedAt;
        }
        if (firstLearned == null && lea.state !== AXIS_STATES.UNKNOWN && lea.lo != null) firstLearned = lea.lo;
        if (firstLearned == null) return { known: 'unknown', why: DT_REASONS.NO_AXIS };
        if (f < firstLearned) return { known: 'no', why: DT_REASONS.OK, learnedAt: firstLearned };
        return { known: 'yes', why: DT_REASONS.OK, learnedAt: firstLearned };
    }
    /**
     * 场景材料的时间投影：按当前楼裁剪「此刻可知」的经历。
     * ★ 这是查询 / 年鉴 / 场景材料共用的**同一处**投影（计划原文要求同一投影），
     *   三处各写一份就会漂成三套口径。
     */
    function projectAt(list, floor, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const wantActor = str(o.actor);
        const coords = normalizeCoords(list);
        const visible = [], hidden = [], unknown = [];
        for (const c of coords) {
            if (wantActor && c.actor !== wantActor) continue;
            const v = visibleAt(c, floor);
            if (v.known === 'yes') visible.push(c);
            else if (v.known === 'no') hidden.push(c);
            else unknown.push(c);
        }
        return { visible: visible, hidden: hidden, unknown: unknown };
    }
    /**
     * 相对先后：只支持「早于 / 晚于 / 同时 / 不可比」四答。
     * ★ 「不可比」必须是一个**有名字的答案**：任一轴 unknown 时不许猜一个顺序。
     */
    function orderOf(a, b) {
        const ca = normalizeCoord(a), cb = normalizeCoord(b);
        if (!ca || !cb) return 'incomparable';
        const x = ca.occurred, y = cb.occurred;
        if (x.state === AXIS_STATES.UNKNOWN || y.state === AXIS_STATES.UNKNOWN) return 'incomparable';
        if (x.hi != null && y.lo != null && x.hi < y.lo) return 'before';
        if (y.hi != null && x.lo != null && y.hi < x.lo) return 'after';
        /* 区间重叠：只报 overlap，不硬判先后。 */
        return 'overlap';
    }
    /** 从剧情钟（story-clock-parse 的产物）建 disclosed 轴：只认能解析出的字段。 */
    function disclosedFromClock(clock) {
        if (!clock || typeof clock !== 'object') return normalizeAxis(null);
        const d = str(clock.date);
        if (!d) return normalizeAxis(null);
        /* ★ 只把「date 字段存在」当作可解析信号，**不**把 time 缺失当失败：
         *   剧情钟常有日期无时刻，那是部分已知，不是未知。 */
        const m = /(\d{1,4})\s*[年\-\/]\s*(\d{1,2})\s*[月\-\/]\s*(\d{1,2})/.exec(d);
        if (!m) return normalizeAxis(null);
        const y = Number(m[1]), mo = Number(m[2]), day = Number(m[3]);
        if (!(mo >= 1 && mo <= 12) || !(day >= 1 && day <= 31)) return normalizeAxis(null);
        /* 返回**可比较的数字键**（年月日压成 y*10000+m*100+d），不是 Date：
         *   本模块要的是「先后」而不是真实时间戳，用 Date 会引入时区与闰秒这类无关变量。 */
        return normalizeAxis(y * 10000 + mo * 100 + day);
    }
    /** 一行读数（诊断面）。 */
    function line(rawList) {
        try {
            const coords = normalizeCoords(rawList);
            if (!coords.length) return '暂无时间坐标';
            let point = 0, range = 0, unknown = 0, bad = 0, conflicts = 0;
            for (const c of coords) {
                for (const axis of [c.occurred, c.disclosed, c.learned]) {
                    if (axis.state === AXIS_STATES.POINT) point++;
                    else if (axis.state === AXIS_STATES.RANGE) range++;
                    else if (axis.state === AXIS_STATES.UNKNOWN) unknown++;
                    else bad++;
                }
                if (Array.isArray(c.conflicts) && c.conflicts.length) conflicts++;
            }
            const parts = ['坐标 ' + coords.length, '点 ' + point, '区间 ' + range];
            if (unknown) parts.push('未知 ' + unknown);
            if (bad) parts.push('不一致 ' + bad + ' ⚠️');
            if (conflicts) parts.push('版本冲突 ' + conflicts);
            return parts.join(' · ');
        } catch (e) { return '—（时间坐标账异常）'; }
    }
    /** 自检（结构恒定，供诊断面与判据调用）。 */
    function selfCheck() {
        const problems = [];
        /* ① 未知必须保持未知，绝不回落成 0/现在 */
        const u = normalizeAxis(null);
        if (u.state !== AXIS_STATES.UNKNOWN) problems.push('空轴必须判 unknown');
        const u2 = normalizeAxis('不是数字');
        if (u2.state !== AXIS_STATES.UNKNOWN) problems.push('非法轴必须判 unknown');
        /* ② 区间端点颠倒不静默交换 */
        const bad = normalizeAxis({ lo: 9, hi: 3 });
        if (bad.state !== AXIS_STATES.INCONSISTENT) problems.push('区间颠倒必须判 inconsistent（不许交换）');
        /* ③ learned 早于 disclosed 必须标不一致且不修正 */
        const c = normalizeCoord({ subject: 's1', actor: '甲', occurred: 5, disclosed: 100, learned: 10 });
        if (c.consistency.ok) problems.push('learned 早于 disclosed 必须标不一致');
        if (c.learned.lo !== 10) problems.push('不一致时不许修正原值');
        /* ④ 历史视角只看 learned */
        const ok = normalizeCoord({ subject: 's2', actor: '乙', occurred: 10, disclosed: 100, learned: 100 });
        if (visibleAt(ok, 20).known !== 'no') problems.push('第20楼不得知道第100楼才披露的事');
        if (visibleAt(ok, 120).known !== 'yes') problems.push('第120楼应已知');
        /* ⑤ 三轴不许互相赋值：occurred 未知时不得由 disclosed 推出 */
        const partial = normalizeCoord({ subject: 's3', disclosed: 50 });
        if (partial.occurred.state !== AXIS_STATES.UNKNOWN) problems.push('occurred 不许由 disclosed 推出');
        return { ok: problems.length === 0, version: DT_VERSION, problems: problems };
    }

    const api = Object.freeze({
        normalizeAxis, normalizeCoord, normalizeCoords,
        axisConsistency, upsertCoord, findCoord,
        visibleAt, projectAt, orderOf, disclosedFromClock, versionAt,
        line, selfCheck,
        TIME_AXES, AXIS_STATES, LEARN_SOURCES, DT_REASONS, DT_LIMITS,
        DT_VERSION, DT_KIND,
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof global !== 'undefined' && global) {
        try { global.LonShaDualTime = api; } catch (_e) { /* ignore */ }
    }
    if (typeof window !== 'undefined') {
        try { window.LonShaDualTime = api; } catch (_e) { /* ignore */ }
    }
})();