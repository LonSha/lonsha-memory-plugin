/**
 * npc-ties.js — [v3.99 缝合] NPC 长期关系网渲染引擎
 * 缝合 baibai-git/ST-BaiBai-Book（柏宝书 npcRelations.ts），重写为纯函数 IIFE。
 * 核心：ties 分号聚合去重 + 长期关系（不因在场失效）与在场状态分离。
 */
(function (global) {
    'use strict';

    /** 单行化（换行折叠为空格） */
    function oneLine(value) {
        return String(value ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim();
    }

    /** 关系去重键：小写 + 全角分号归一 + 空白折叠 */
    function relationKey(value) {
        return String(value ?? '').toLowerCase().replace(/[；;]/g, ';').replace(/\s+/g, ' ').trim();
    }

    /** 拆分 ties 字符串为逐项（分号分隔，去空） */
    function splitTies(ties) {
        return String(ties ?? '').split(/[；;]/).map(s => s.trim()).filter(Boolean);
    }

    /**
     * 聚合 NPC 长期关系为上下文文本。
     * 按规范化名字聚合（兼容重名旧数据），ties 逐项合并去重——既不整行重复，
     * 也不因「保留第一条」而丢掉同名 NPC 的后续独有关系。
     * @param {Array<{name:string, ties:string}>} npcs
     * @param {object} [options]
     * @param {string} [options.header] 自定义标题（默认长期关系说明）
     * @returns {string} 上下文文本（无有效条目返回 ''）
     */
    function fmtNpcTiesContext(npcs, options = {}) {
        const grouped = new Map();
        for (const npc of Array.isArray(npcs) ? npcs : []) {
            const name = oneLine(npc?.name);
            const ties = npc?.ties;
            if (!name || !oneLine(ties)) continue;
            const nameKey = name.toLowerCase();
            let entry = grouped.get(nameKey);
            if (!entry) {
                entry = { name, ties: [], seen: new Set() };
                grouped.set(nameKey, entry);
            }
            for (const tie of splitTies(ties)) {
                const k = relationKey(tie);
                if (entry.seen.has(k)) continue;
                entry.seen.add(k);
                entry.ties.push(tie);
            }
        }
        const rows = [...grouped.values()].map(e => `  - ${e.name}:${e.ties.join(';')}`);
        if (!rows.length) return '';
        const header = options.header ??
            '角色长期关系(血缘/婚姻/主仆/宿敌等，不因是否在场而失效):';
        return `${header}\n${rows.join('\n')}`;
    }

    /**
     * 渲染已登场 NPC 名册（给摘要模型，长期关系随既有状态给模型做整体覆盖更新）。
     * @param {Array<object>} npcs NpcSummaryView 数组
     * @returns {string} 名册文本（空名册返回 '  (无)'）
     */
    function fmtNpcSummaryList(npcs) {
        if (!Array.isArray(npcs) || !npcs.length) return '  (无)';
        return npcs.map(n => {
            const star = n?.important ? '★ ' : '';
            const inBracket = [];
            if (oneLine(n?.gender)) inBracket.push(oneLine(n.gender));
            if (oneLine(n?.age)) inBracket.push(`${oneLine(n.age)}${n?.ageTime ? `·记于${oneLine(n.ageTime)}` : ''}`);
            const bracket = inBracket.length ? `(${inBracket.join('·')})` : '';
            const place = n?.follow ? ' [随行]' : oneLine(n?.location) ? ` [在:${oneLine(n.location)}]` : '';
            const tail = [];
            if (oneLine(n?.title)) tail.push(oneLine(n.title));
            if (oneLine(n?.relation)) tail.push(`与主角:${oneLine(n.relation)}`);
            if (oneLine(n?.ties)) tail.push(`人际:${oneLine(n.ties)}`);
            const title = tail.length ? ` —— ${tail.join(';')}` : '';
            const state = [];
            if (oneLine(n?.outfit)) state.push(`着装:${oneLine(n.outfit)}`);
            if (oneLine(n?.condition)) state.push(`状态:${oneLine(n.condition)}`);
            const stateStr = state.length ? ` 〔${state.join(';')}〕` : '';
            return `  - ${star}${oneLine(n?.name)}${bracket}${place}${title}${stateStr}`;
        }).join('\n');
    }

    /**
     * 解析 ties 上下文文本回结构化数据（fmtNpcTiesContext 的逆操作，供读取/迁移）。
     * @param {string} text
     * @returns {Array<{name:string, ties:string[]}>}
     */
    function parseNpcTiesContext(text) {
        const out = [];
        for (const line of String(text ?? '').split('\n')) {
            const m = line.match(/^\s*-\s*([^:：]+)[:：](.+)$/);
            if (!m) continue;
            const name = oneLine(m[1]);
            if (!name) continue;
            out.push({ name, ties: splitTies(m[2]) });
        }
        return out;
    }

    const api = {
        oneLine,
        relationKey,
        splitTies,
        fmtNpcTiesContext,
        fmtNpcSummaryList,
        parseNpcTiesContext,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaNpcTies = api;
})(typeof window !== 'undefined' ? window : globalThis);