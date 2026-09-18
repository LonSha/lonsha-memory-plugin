/**
 * extraction-cadence.js — [v3.98 缝合] 按类型抽取节奏引擎
 *
 * 【来源】缝合 FunnyCups/Luker（SillyTavern 分叉）memory-graph 扩展的
 *         extraction-schedule.js，按记忆插件工程规范重写为可测纯函数 IIFE 模块。
 *         保留其「按类型抽取节奏 + prompt-cache 友好」核心设计，非照抄。
 *
 * 【机制】
 *   长篇 RP 的记忆抽取若每楼全类型触发，token 开销巨大且噪声多。Luker 的做法：
 *   给每种记忆类型配置独立抽取节奏 extractEveryN（如人物关系 everyN=1 每楼抽取、
 *   世界观 everyN=5 每5楼、细节 everyN=10 每10楼），仅当 楼层序号 % everyN === 0
 *   时该类型才在本轮激活。这样高频类型保持新鲜、低频类型摊薄成本。
 *   - computeActiveTypes：给定 schema（含 extractEveryN）与当前楼层序号，
 *     算出本轮激活的类型集合
 *   - buildPerTypeRulesBlock：把激活类型的抽取指令拼成 user-prompt 附加块
 *   - assembleSystemPrompt：返回字节稳定的 system prompt（per-type 规则放 user
 *     prompt，使 system prompt 跨轮不变 —— Anthropic prompt-cache 友好，缓存命中
 *     可省 system prompt 部分的输入 token 费用）
 *
 * 【与源码差异】
 *   - 源码依赖 default-prompts.js 的 DEFAULT_PER_TYPE_INSTRUCTIONS；
 *     本实现自包含，schema 由调用方提供，不耦合 Luker 的 prompt 资源
 *   - 保留 seq % everyN === 0 的语义（seq 归一为 >=0 整数，everyN 归一为 >=1）
 *   - 增加 nextActiveSeq：预测某类型下一次激活的楼层（供 UI 展示「还有 N 楼抽取」）
 *   - 增加 summarizeCadence：人类可读的节奏摘要（调试/设置界面用）
 */

(function (global) {
    'use strict';

    /** 归一化类型 id（trim+小写） */
    function normTypeId(id) {
        return String(id ?? '').trim().toLowerCase();
    }

    /** 归一化 everyN（>=1 整数，非法回落 1） */
    function normEveryN(value) {
        const n = Math.floor(Number(value));
        return Number.isFinite(n) && n >= 1 ? n : 1;
    }

    /** 归一化楼层序号（>=0 整数，非法回落 0） */
    function normSeq(value) {
        const n = Math.floor(Number(value));
        return Number.isFinite(n) && n >= 0 ? n : 0;
    }

    /**
     * 计算本轮激活的抽取类型集合
     * @param {Array<{id:string, extractEveryN?:number}>} schema 类型配置
     * @param {number} currentSeq 当前楼层序号
     * @returns {Set<string>} 本轮激活的类型 id 集合
     */
    function computeActiveTypes(schema, currentSeq, carry = null) {
        const active = new Set();
        const seq = normSeq(currentSeq);
        // [v3.173] 读数：本模块缝合后 68 个版本无人调用（v3.163 账本零消费）。
        //   节奏机制的全部风险是「某一类这一轮该抽却没抽」——而旧实现的两种失效
        //   都表达为集合里没有这个 id，与「这一类本轮本就不该抽」同形：
        //     ① 非法 everyN（NaN/0/负数 → 静默回落 1，即被改成『每轮都抽』）；
        //     ② 无 id 的类型（整条被跳过，连『被跳过』都没记）。
        const _read = { schema: 0, accepted: 0, active: 0, inactive: 0, normalizedFallback: [], skippedNoId: [], seq };
        if (carry && typeof carry === 'object') carry.cadence = _read;
        const list = Array.isArray(schema) ? schema : [];
        _read.schema = list.length;
        if (!Array.isArray(schema) && schema !== undefined) _read.schemaMalformed = true;
        for (const entry of list) {
            const typeId = normTypeId(entry?.id);
            if (!typeId) { _read.skippedNoId.push(String(entry?.id ?? typeof entry)); continue; }
            const raw = entry?.extractEveryN ?? 1;
            const everyN = normEveryN(raw);
            if (Number(raw) !== everyN) _read.normalizedFallback.push(typeId + ':' + String(raw) + '->' + everyN);
            _read.accepted++;
            if (seq % everyN === 0) { active.add(typeId); _read.active++; } else { _read.inactive++; }
        }
        return active;
    }

    /**
     * 预测某类型下一次激活的楼层序号
     * @param {number} extractEveryN
     * @param {number} currentSeq 当前楼层序号
     * @returns {number} 下次激活楼层（若本轮即激活，返回 currentSeq）
     */
    function nextActiveSeq(extractEveryN, currentSeq) {
        const everyN = normEveryN(extractEveryN);
        const seq = normSeq(currentSeq);
        const rem = seq % everyN;
        return rem === 0 ? seq : seq + (everyN - rem);
    }

    /**
     * 组装 per-type 抽取规则块（附加到 user prompt）
     * 仅包含本轮激活且有抽取指令的类型。
     * @param {Array<{id:string, extractionInstructions?:string}>} schema
     * @param {Set<string>} activeTypes 本轮激活类型
     * @returns {string} 规则块文本（无激活规则返回 ''）
     */
    function buildPerTypeRulesBlock(schema, activeTypes, carry = null) {
        const activeSet = activeTypes instanceof Set ? activeTypes : new Set(activeTypes || []);
        const sections = [];
        // [v3.173] 读数：本轮激活却无指令的类型会被静默从 prompt 里漏掉——
        //   prompt 少一段与「本轮确实没什么要抽」在成品上完全同形（I6）。
        const _read = { activeTypes: activeSet.size, emitted: 0, skippedNoInstructions: [], skippedInactive: [], missingInSchema: [] };
        if (carry && typeof carry === 'object') carry.cadenceRules = _read;
        const _seen = new Set();
        for (const entry of Array.isArray(schema) ? schema : []) {
            const typeId = normTypeId(entry?.id);
            if (!typeId || !activeSet.has(typeId)) continue;
            _seen.add(typeId);
            const instructions = String(entry?.extractionInstructions ?? '').trim();
            if (!instructions) { _read.skippedNoInstructions.push(typeId); continue; }
            sections.push(`[${typeId}]\n${instructions}`);
            _read.emitted++;
        }
        for (const t of activeSet) if (!_seen.has(t)) _read.missingInSchema.push(t);
        _read.skippedInactive = (Array.isArray(schema) ? schema : [])
            .map(e => normTypeId(e?.id)).filter(id => id && !activeSet.has(id));
        if (sections.length === 0) return '';
        return `=== Per-type extraction rules (active this round) ===\n\n${sections.join('\n\n')}`;
    }

    /**
     * 返回字节稳定的 system prompt（per-type 规则走 user prompt，
     * 使 system prompt 跨节奏轮不变 —— Anthropic prompt-cache 友好）。
     * @param {string} basePrompt
     * @returns {string}
     */
    function assembleSystemPrompt(basePrompt) {
        return String(basePrompt ?? '').trim();
    }

    /**
     * 生成节奏摘要（调试/设置界面用）
     * @param {Array<{id:string, extractEveryN?:number}>} schema
     * @param {number} currentSeq
     * @returns {Array<{id:string, everyN:number, active:boolean, nextSeq:number, floorsUntilNext:number}>}
     */
    function summarizeCadence(schema, currentSeq) {
        const seq = normSeq(currentSeq);
        const active = computeActiveTypes(schema, seq);
        const out = [];
        for (const entry of Array.isArray(schema) ? schema : []) {
            const typeId = normTypeId(entry?.id);
            if (!typeId) continue;
            const everyN = normEveryN(entry?.extractEveryN ?? 1);
            const next = nextActiveSeq(everyN, seq);
            out.push({
                id: typeId,
                everyN,
                active: active.has(typeId),
                nextSeq: next,
                floorsUntilNext: next - seq,
            });
        }
        return out;
    }

    const api = {
        computeActiveTypes,
        nextActiveSeq,
        buildPerTypeRulesBlock,
        assembleSystemPrompt,
        summarizeCadence,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaExtractionCadence = api;
})(typeof window !== 'undefined' ? window : globalThis);