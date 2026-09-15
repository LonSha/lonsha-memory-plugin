/**
 * smart-trigger.js — [v3.110 缝合] 事件性门控（平淡楼层跳过昂贵提取）
 *
 * 【来源】缝合 m61-oss/st-bionic-memory（BME）maintenance/smart-trigger.js 的
 *         getSmartTriggerDecision，按本插件工程规范重写为可测纯函数模块
 *         （零依赖、IIFE 双导出、规则/权重/阈值全部可注入）。
 *
 * 【机制】本插件现有提取链路是「每楼必抽」——extractionEnabled 打开后，每条 AI 回复
 *   都会跑一次完整 LLM 提取（含摘要/角色/事件/关系）。长篇 RP 里大量楼层是日常过渡、
 *   寒暄、场景描写，抽出来的东西边际价值极低，却照样烧一次 API 调用。
 *
 *   bionic 的 smart-trigger 给的答案是「先判断这段剧情有没有事件性，再决定要不要花这次钱」：
 *     1) 关键词命中（突然/没想到/背叛/告白/暴露/秘密/契约/死亡/失忆……）
 *     2) 用户自定义触发正则
 *     3) 多轮往返互动（角色切换次数多 = 真有对话交锋）
 *     4) 情绪/冲突波动（感叹号/问号密度）
 *     5) 疑似新实体/新地点（「XX先生」「XX学院」「XX城」等实体化后缀）
 *   五项加权求和，达到阈值才判为「值得抽取」。
 *
 * 【与源码差异】
 *   - 源码把关键词表与权重写死；本实现全部可注入（keywords / weights / threshold /
 *     punctuationMin / roleSwitchMin / entityPattern / maxKeywordScore），并保留
 *     DEFAULT_TRIGGER_KEYWORDS 作为缺省。
 *   - 源码直接吃宿主 chat 数组并自带 system-message 过滤；本实现把「取待判定消息」
 *     拆成独立纯函数 normalizePending（is_user/mes、omitted 标记、lastProcessed 起点、
 *     endFloor 终点都可控），便于测试与复用。
 *   - 增加 summarizeTriggers：门控决策台账诊断（评估数 / 命中率 / 省下的调用数 /
 *     高频理由），供设置面板与审计报告展示——源码无此能力。
 *   - 语义取向：本模块只回答「值不值得抽」，从不丢弃楼层；调用方判 false 时应降级为
 *     本地廉价摘要（fail-open，宁可抽得糙，不可留记忆空洞）。
 */

(function (global) {
    'use strict';

    /** 缺省触发关键词表（移植 bionic DEFAULT_TRIGGER_KEYWORDS，顺序即优先级候选） */
    const DEFAULT_TRIGGER_KEYWORDS = [
        '突然', '没想到', '原来', '其实', '发现', '背叛', '死亡', '复活',
        '恢复记忆', '失忆', '告白', '暴露', '秘密', '计划', '规则',
        '契约', '位置', '地点', '离开', '来到',
    ];

    /** 缺省阈值：与源码一致（>=2 分才触发） */
    const DEFAULT_THRESHOLD = 2;

    /** 缺省权重表 */
    const DEFAULT_WEIGHTS = {
        keywordPerHit: 1,      // 每个关键词 1 分
        keywordCap: 2,         // 关键词最多贡献 2 分
        customPattern: 2,      // 命中任一自定义正则 2 分
        roleSwitch: 1,         // 多轮往返 1 分
        punctuation: 1,        // 情绪波动 1 分
        entity: 1,             // 疑似新实体 1 分
    };

    /** 疑似实体的后缀（源码同款启发式） */
    const DEFAULT_ENTITY_SUFFIXES = [
        '先生', '小姐', '王国', '城', '镇', '村', '学院', '组织', '公司', '小队', '军团',
    ];
    const DEFAULT_ENTITY_PATTERN = new RegExp(
        '[A-Z][a-z]{2,}|[\\u4e00-\\u9fff]{2,6}(' + DEFAULT_ENTITY_SUFFIXES.join('|') + ')',
        'g',
    );

    // ---------- 基础归一 ----------

    function normStr(value) {
        return String(value == null ? '' : value).replace(/\r\n/g, '\n').trim();
    }

    function normInt(value, fallback, min) {
        const n = Math.floor(Number(value));
        if (!Number.isFinite(n)) return fallback;
        return min != null ? Math.max(min, n) : n;
    }

    function normWeights(raw) {
        const src = (raw && typeof raw === 'object') ? raw : {};
        const out = {};
        for (const key of Object.keys(DEFAULT_WEIGHTS)) {
            const v = Number(src[key]);
            out[key] = Number.isFinite(v) && v >= 0 ? v : DEFAULT_WEIGHTS[key];
        }
        return out;
    }

    /** 自定义触发规则：字符串（按换行/逗号切）或数组；非法正则静默忽略 */
    function normalizePatterns(raw) {
        if (Array.isArray(raw)) {
            return raw.map(normStr).filter(Boolean);
        }
        return String(raw == null ? '' : raw)
            .split(/\r?\n|,/)
            .map((s) => s.trim())
            .filter(Boolean);
    }

    /**
     * 取待判定消息（纯函数）：
     *   chat 可为宿主原始消息数组（含 is_user / mes / swipe_id）或已归一对象。
     *   options: { lastProcessed, endFloor, isOmitted, maxMessages, clean }
     * @returns {Array<{role:'user'|'assistant', content:string, index:number}>}
     */
    function normalizePending(chat, options) {
        const o = options || {};
        const list = Array.isArray(chat) ? chat : [];
        const start = Math.max(0, normInt(o.lastProcessed, -1) + 1);
        const rawEnd = (o.endFloor == null || o.endFloor === '')
            ? list.length - 1
            : normInt(o.endFloor, list.length - 1);
        const end = Math.min(list.length - 1, Math.max(start - 1, rawEnd));
        const isOmitted = typeof o.isOmitted === 'function' ? o.isOmitted : () => false;
        const maxMessages = normInt(o.maxMessages, 0);
        const out = [];
        for (let i = start; i <= end && i < list.length; i += 1) {
            const msg = list[i];
            let skip = false;
            try { skip = isOmitted(msg, i) === true; } catch (e) { skip = false; }
            if (skip) continue;
            const role = (msg && (msg.is_user === true || msg.role === 'user')) ? 'user' : 'assistant';
            const content = normStr(msg && (msg.mes != null ? msg.mes : msg.content));
            if (!content) continue;
            out.push({ role, content, index: i });
        }
        if (maxMessages > 0 && out.length > maxMessages) return out.slice(-maxMessages);
        return out;
    }

    // ---------- 评分 ----------

    function countRoleSwitches(messages) {
        let n = 0;
        for (let i = 1; i < messages.length; i += 1) {
            if (messages[i].role !== messages[i - 1].role) n += 1;
        }
        return n;
    }

    function countMatches(text, pattern) {
        if (!pattern) return 0;
        try {
            const re = pattern instanceof RegExp ? new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g') : new RegExp(pattern, 'g');
            const m = String(text).match(re);
            return m ? m.length : 0;
        } catch (e) { return 0; }
    }

    /**
     * 事件性判定（纯函数，不修改入参）
     * @param {Array} messages normalizePending 输出（也接受原始对象数组）
     * @param {object} options { keywords, patterns, threshold, weights, punctuationMin, roleSwitchMin, entityPattern, maxKeywordScore }
     * @returns {{triggered:boolean, score:number, threshold:number, reasons:string[], stats:object}}
     */
    function evaluateTrigger(messages, options) {
        const o = options || {};
        const list = (Array.isArray(messages) ? messages : [])
            .map((m, i) => ({
                role: (m && (m.is_user === true || m.role === 'user')) ? 'user' : 'assistant',
                content: normStr(m && (m.mes != null ? m.mes : m.content)),
                index: Number.isFinite(Number(m && m.index)) ? Number(m.index) : i,
            }))
            .filter((m) => m.content.length > 0);

        const weights = normWeights(o.weights);
        const keywords = Array.isArray(o.keywords) && o.keywords.length
            ? o.keywords.map(normStr).filter(Boolean)
            : DEFAULT_TRIGGER_KEYWORDS;
        const threshold = Math.max(1, normInt(o.threshold, DEFAULT_THRESHOLD));
        const punctuationMin = Math.max(1, normInt(o.punctuationMin, 2));
        const roleSwitchMin = Math.max(1, normInt(o.roleSwitchMin, 2));
        const keywordCap = Number.isFinite(Number(o.maxKeywordScore))
            ? Math.max(0, Number(o.maxKeywordScore)) : weights.keywordCap;

        const stats = {
            messageCount: 0,
            chars: 0,
            keywordHits: [],
            customPatternHit: '',
            roleSwitchCount: 0,
            punctuationHits: 0,
            entityHits: 0,
        };
        if (!list.length) {
            return { triggered: false, score: 0, threshold, reasons: [], stats };
        }

        const combined = list.map((m) => m.content).join('\n');
        stats.messageCount = list.length;
        stats.chars = combined.length;

        let score = 0;
        const reasons = [];

        // ① 关键词
        const keywordHits = keywords.filter((k) => combined.includes(k));
        if (keywordHits.length) {
            score += Math.min(keywordCap, keywordHits.length * weights.keywordPerHit);
            reasons.push('关键词: ' + keywordHits.slice(0, 3).join(', '));
        }
        stats.keywordHits = keywordHits.slice(0, 32);

        // ② 自定义触发规则（命中一条即止，避免用户堆规则后分数爆炸）
        for (const pattern of normalizePatterns(o.patterns)) {
            let hit = false;
            try { hit = new RegExp(pattern, 'i').test(combined); } catch (e) { hit = false; }
            if (hit) {
                score += weights.customPattern;
                stats.customPatternHit = pattern;
                reasons.push('自定义触发: ' + pattern);
                break;
            }
        }

        // ③ 多轮往返互动
        const roleSwitchCount = countRoleSwitches(list);
        stats.roleSwitchCount = roleSwitchCount;
        if (roleSwitchCount >= roleSwitchMin) {
            score += weights.roleSwitch;
            reasons.push('多轮往返互动');
        }

        // ④ 情绪/冲突波动
        const punctuationHits = (combined.match(/[!?！？]/g) || []).length;
        stats.punctuationHits = punctuationHits;
        if (punctuationHits >= punctuationMin) {
            score += weights.punctuation;
            reasons.push('情绪/冲突波动');
        }

        // ⑤ 疑似新实体/新地点
        const entityPattern = o.entityPattern || DEFAULT_ENTITY_PATTERN;
        const entityHits = countMatches(combined, entityPattern);
        stats.entityHits = entityHits;
        if (entityHits > 0) {
            score += weights.entity;
            reasons.push('疑似新实体/新地点');
        }

        return { triggered: score >= threshold, score, threshold, reasons, stats };
    }

    /**
     * 门控台账诊断：评估数 / 命中数 / 跳过数 / 命中率 / 高频理由 / 省下的调用数
     * @param {Array} records [{score, triggered, reasons}] 或 evaluateTrigger 结果数组
     */
    function summarizeTriggers(records) {
        const list = (Array.isArray(records) ? records : []).filter(Boolean);
        let fired = 0;
        let scoreSum = 0;
        const reasonCount = {};
        for (const r of list) {
            if (r.triggered === true) fired += 1;
            scoreSum += Number(r.score || 0);
            for (const reason of (Array.isArray(r.reasons) ? r.reasons : [])) {
                const key = String(reason).split(':')[0].trim() || String(reason);
                reasonCount[key] = (reasonCount[key] || 0) + 1;
            }
        }
        const topReasons = Object.keys(reasonCount)
            .map((key) => ({ reason: key, count: reasonCount[key] }))
            .sort((a, b) => (b.count - a.count) || a.reason.localeCompare(b.reason, 'en'))
            .slice(0, 6);
        const total = list.length;
        return {
            evaluated: total,
            fired,
            skipped: total - fired,
            savedCalls: total - fired,
            fireRate: total ? Number((fired / total).toFixed(4)) : 0,
            avgScore: total ? Number((scoreSum / total).toFixed(3)) : 0,
            topReasons,
        };
    }

    const api = {
        DEFAULT_TRIGGER_KEYWORDS,
        DEFAULT_THRESHOLD,
        DEFAULT_WEIGHTS,
        DEFAULT_ENTITY_SUFFIXES,
        normalizePending,
        normalizePatterns,
        evaluateTrigger,
        summarizeTriggers,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaSmartTrigger = api;
})(typeof window !== 'undefined' ? window : globalThis);