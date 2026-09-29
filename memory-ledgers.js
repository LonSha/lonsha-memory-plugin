/**
 * memory-ledgers.js — 记忆叶子账本集（计划 A1 第一刀）
 *
 * 【为什么需要这一面 / 修前实测】
 *   `index.js` 在 v3.256.0 实测 18400 行（占全仓 45%）。P-2 分诊（tests/audit/host_beast_probe.cjs）
 *   已经**按读数否掉了「按域拆」**：最大的成员是生命周期接线本身（onMessageReceived 1228 行 /
 *   onBeforeGeneration 524 行 / registerEvents 379 行），它们外部引用数极低，但那是「唯一入口」
 *   而不是「松散」；拆错的形态（运行期 this 丢失）只有实机看得见。
 *   唯一有读数支持的第一刀是「成员级预算 + 文件规模上界」——**先剥最松的叶子**。
 *   本模块剥走的正是这样一批叶子：六个账本类各自只持有自己的数组/对象，彼此零互调，
 *   对外只被 `MemoryEngine` 在构造期 `new` 一次、在 fixup/回滚/注入/持久化四处按方法名调用。
 *
 * 【本模块的职责】
 *   · `MoneyLedger`    钱财账本（覆盖式当前金额 + 追加式变动流水）
 *   · `CardCollection` 剧情卡牌收集（重要度达阈的事件铸卡，游戏化收藏）
 *   · `ConflictBook`   矛盾账本（真矛盾显式并存标注，不静默择一）
 *   · `DeltaBook`      正史增量账本（established / uncertain 两态，变化驱动读取）
 *   · `PairMemory`     群像共同记忆（以关系对为单位，归因式，单方知晓显式标注）
 *   · `PovMemory`      角色私密记忆（防剧透，只对当前登场者检索）
 *   六个类的公开面（方法名/返回形状/字段名/中文注入块字面量）与抽取前**逐字一致**。
 *
 * 【本模块不做什么（边界）】
 *   · 不持有任何宿主状态：不读 `window.SillyTavern`、不碰 `localStorage`、不写盘、不发请求。
 *   · 不做跨账本聚合：六个类之间零引用（它们的统合由宿主侧 `MemoryEngine` 负责）。
 *   · 不新增第二实现：字符名归一化**不再重写一份**——本模块的 `norm()` 与宿主
 *     `normalizeCharName()` 同算式（NFKC + 去空白 + 小写），并把该算式写进自检，
 *     宿主侧 `scan_module_wiring` 的 B3/B4 会守「符号有人供、供了有人用」。
 *
 * 【口径纪律】
 *   ① **拿不到判据 ≠ 判失效**：本模块全部方法在字段缺失时返回空串 / 0 / false，
 *      绝不抛（宿主侧调用点均无外层 try 包裹，抛会把降级变成崩溃）。
 *   ② **缺席与空不同形**：模块缺席时宿主退到 `MemoryLedgerFallback`（常量空实现），
 *      它如实回报「没有」——不伪造一个能写不能读的账本。
 *   ③ **导出逐个冻结**：`Object.freeze(api)`，防止宿主误改方法引用。
 *
 * 零依赖、CJS/IIFE 双导出（与全仓缝合模块同形）。
 */
(function (global) {
    'use strict';
    /** 字符名归一化：与宿主 normalizeCharName 同算式（NFKC / 去空白 / 小写）。
     *  不依赖宿主函数对象：本模块要能被单独 require（测试面与 CDN 加载面同形）。 */
    function norm(name) {
        try {
            return String(name || '').normalize('NFKC').replace(/\s+/g, '').trim().toLowerCase();
        } catch (e) { return String(name || ''); }
    }

    class MoneyLedger {
        constructor() { this.money = {}; this.moneyLog = []; }
        /** 设置/调整某角色当前金额（覆盖式；delta 为数值增减） */
        setMoney(name, amount, reason, floor, storyTime) {
            const key = norm(name);
            if (!key) return false;
            const prev = Number(this.money[key]?.amount) || 0;
            const next = amount;
            this.money[key] = { name: String(name).trim(), amount: next, updatedAt: Date.now(), floor: floor || 0 };
            if (reason) {
                this.moneyLog.push({ key, name: String(name).trim(), time: storyTime || '', floor: floor || 0, desc: String(reason).slice(0, 80), delta: Math.round((next - prev) * 100) / 100, timestamp: Date.now() });
                if (this.moneyLog.length > 60) this.moneyLog.shift();
            }
            return true;
        }
        /** 数值增减（delta 可负） */
        addDelta(name, delta, reason, floor, storyTime) {
            const key = norm(name);
            const prev = Number(this.money[key]?.amount) || 0;
            return this.setMoney(name, prev + (Number(delta) || 0), reason, floor, storyTime);
        }
        getMoney(name) { return this.money[norm(name)] || null; }
        /** 注入提示词（当前金额 + 最近流水） */
        toPrompt() {
            const lines = [];
            const entries = Object.values(this.money).filter(e => e && e.name).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
            for (const e of entries) lines.push(`- ${e.name}：${e.amount}`);
            const logs = this.moneyLog.slice(-5);
            const logLines = logs.map(l => `  · ${l.name} ${l.delta >= 0 ? '+' : ''}${l.delta}（${l.desc}）`).filter(Boolean);
            if (!lines.length) return '';
            let out = '[当前钱财账本]（角色经济状态，花钱/挣钱须与账本一致，禁止凭空获得或挥霍）：\n' + lines.join('\n');
            if (logLines.length) out += '\n[钱财变动流水·最近]：\n' + logLines.join('\n');
            return out;
        }
        removeByFloor(floor) {
            let n = 0;
            const before = this.moneyLog.length;
            this.moneyLog = this.moneyLog.filter(l => l.floor !== floor);
            n += before - this.moneyLog.length;
            return n;
        }
        export() { return { money: this.money, moneyLog: this.moneyLog }; }
        import(data) {
            if (data && typeof data === 'object') {
                this.money = data.money || {};
                this.moneyLog = Array.isArray(data.moneyLog) ? data.moneyLog : [];
            }
        }
    }

    class CardCollection {
        constructor() { this.cards = []; }
        /** 铸卡（重要度>=8 的事件自动成卡；幂等：同楼层同标题不重复铸） */
        forge(title, desc, floor, icon, storyTime) {
            const t = String(title || '').trim();
            if (!t || t.length < 2) return false;
            if (this.cards.some(c => c.floor === floor && c.title === t)) return false;
            this.cards.push({
                title: t.slice(0, 30),
                desc: String(desc || '').slice(0, 100),
                floor: floor || 0,
                time: String(storyTime || '').slice(0, 30),
                icon: String(icon || '🃏').slice(0, 8),
                timestamp: Date.now()
            });
            if (this.cards.length > 50) this.cards.shift();
            return true;
        }
        /** 从事件列表铸卡（importance>=threshold） */
        forgeFromEvents(events, floor, storyTime, threshold) {
            const th = Number(threshold) || 8;
            let n = 0;
            for (const ev of (events || [])) {
                if (!ev || (Number(ev.importance) || 0) < th) continue;
                if (this.forge(ev.type || '事件', ev.description, floor, '🃏', storyTime)) n++;
            }
            return n;
        }
        toPrompt() {
            if (!this.cards.length) return '';
            const recent = this.cards.slice(-8);
            const rows = recent.map(c => `- ${c.icon}【${c.title}】${c.desc}${c.time ? `（${c.time}）` : ''}`);
            return `[剧情卡牌收集]（重要时刻纪念，可作为话题回忆）：\n${rows.join('\n')}`;
        }
        removeByFloor(floor) {
            const before = this.cards.length;
            this.cards = this.cards.filter(c => c.floor !== floor);
            return before - this.cards.length;
        }
        export() { return { cards: this.cards }; }
        import(data) { if (data && Array.isArray(data.cards)) this.cards = data.cards; }
    }

    class ConflictBook {
        constructor() { this.conflicts = []; }
        /** 登记真矛盾（幂等：同 subject 同版本对不重复登记） */
        add(subject, versionA, versionB, note, floor, storyTime, severity) {
            const s = String(subject || '').trim();
            if (!s || s.length < 2) return false;
            const a = String(versionA || '').slice(0, 100);
            const b = String(versionB || '').slice(0, 100);
            if (!a || !b) return false;
            if (this.conflicts.some(c => c.subject === s && c.versionA === a && c.versionB === b)) return false;
            // [v3.64] severity 严重度分级（dsh 证据链）：low/medium/high
            const sev = ['low', 'medium', 'high'].includes(severity) ? severity : 'medium';
            this.conflicts.push({
                subject: s.slice(0, 40), versionA: a, versionB: b,
                note: String(note || '').slice(0, 60),
                floor: floor || 0, time: String(storyTime || '').slice(0, 30),
                severity: sev,
                timestamp: Date.now()
            });
            if (this.conflicts.length > 30) this.conflicts.shift();
            return true;
        }
        /** 提取处理入口 */
        addFromExtracted(list, floor, storyTime) {
            let n = 0;
            for (const c of (list || [])) {
                if (this.add(c?.subject, c?.versionA, c?.versionB, c?.note, floor, storyTime, c?.severity)) n++;
            }
            return n;
        }
        /** 注入提示词：矛盾显式标注，提示 AI 这些事实存在多版本，不得擅自裁决 */
        toPrompt() {
            if (!this.conflicts.length) return '';
            const rows = this.conflicts.slice(-6).map(c =>
                `- ${c.subject}：版本A「${c.versionA}」 ↔ 版本B「${c.versionB}」${c.note ? `（${c.note}）` : ''}${c.severity && c.severity !== 'medium' ? ` 【严重度:${c.severity}】` : ''}`);
            return `[未决矛盾·显式标注]（以下事实存在多个对不上的版本，是剧情资产。对话涉及这些事实时保持张力或自然揭示，严禁擅自裁决谁对谁错）：\n${rows.join('\n')}`;
        }
        removeByFloor(floor) {
            const before = this.conflicts.length;
            this.conflicts = this.conflicts.filter(c => c.floor !== floor);
            return before - this.conflicts.length;
        }
        export() { return { conflicts: this.conflicts }; }
        import(data) { if (data && Array.isArray(data.conflicts)) this.conflicts = data.conflicts; }
    }

    class DeltaBook {
        constructor() { this.deltas = []; }
        /** 登记增量事实（幂等：同 evidenceFloor 同 summary 不重复） */
        add(summary, status, evidenceFloor) {
            const s = String(summary || '').trim();
            if (!s || s.length < 4) return false;
            const st = ['established', 'uncertain'].includes(status) ? status : 'uncertain';
            if (this.deltas.some(d => d.summary === s && d.evidenceFloor === (evidenceFloor || 0))) return false;
            this.deltas.push({
                summary: s.slice(0, 150),
                status: st,
                evidenceFloor: evidenceFloor || 0,
                timestamp: Date.now()
            });
            if (this.deltas.length > 60) this.deltas.shift();
            return true;
        }
        /** 从 LLM deltas 数组批量登记 */
        addFromList(list, floor) {
            let n = 0;
            for (const d of (list || [])) {
                if (this.add(d?.summary, d?.status, d?.evidenceFloor ?? floor)) n++;
            }
            return n;
        }
        /** 确证待定项（uncertain → established，用户确认或后续剧情佐证时调用） */
        confirm(summaryMatch) {
            let n = 0;
            for (const d of this.deltas) {
                if (d.status === 'uncertain' && d.summary.includes(String(summaryMatch || ''))) {
                    d.status = 'established';
                    n++;
                }
            }
            return n;
        }
        /** 变化驱动读取：只返回游标之后产生的增量事实，不修改账本。 */
        getChangesSince(floor = -1, limit = 50) {
            const cursor = Number.isFinite(Number(floor)) ? Number(floor) : -1;
            const cap = Math.min(50, Math.max(0, Number(limit) || 0));
            return this.deltas.filter(d => Number(d?.evidenceFloor) > cursor).slice(-cap).map(d => ({ ...d }));
        }
        /** 注入提示词：增量事实分状态展示；传 sinceFloor 时仅输出变化 */
        toPrompt({ sinceFloor = null, limit = 4 } = {}) {
            const source = sinceFloor === null || sinceFloor === undefined ? this.deltas : this.getChangesSince(sinceFloor, 50);
            if (!source.length) return '';
            const cap = Math.min(20, Math.max(1, Number(limit) || 4));
            const est = source.filter(d => d.status === 'established').slice(-cap);
            const unc = source.filter(d => d.status === 'uncertain').slice(-cap);
            const rows = [];
            for (const d of est) rows.push(`- [已确证] ${d.summary}`);
            for (const d of unc) rows.push(`- [待定] ${d.summary}（后续剧情可能佐证或推翻）`);
            return `[正史增量]（摘要阶段产出的增量事实记录）：\n${rows.join('\n')}`;
        }
        removeByFloor(floor) {
            const before = this.deltas.length;
            this.deltas = this.deltas.filter(d => d.evidenceFloor !== floor);
            return before - this.deltas.length;
        }
        export() { return { deltas: this.deltas }; }
        import(data) { if (data && Array.isArray(data.deltas)) this.deltas = data.deltas; }
    }

    class PairMemory {
        constructor() { this.pairs = []; }
        static _keyOf(a, b) {
            const x = norm(a), y = norm(b);
            return [x, y].sort().join('|');
        }
        /** 记录关系对共同经历的事件（归因式） */
        addEntry(a, b, floor, storyTime, attribution) {
            const ka = String(a || '').trim(), kb = String(b || '').trim();
            if (!ka || !kb || ka === kb) return false;
            const event = String(attribution?.event || '').trim();
            if (event.length < 4) return false;
            const key = PairMemory._keyOf(ka, kb);
            if (this.pairs.some(p => p.key === key && p.entries.some(e => e.event === event))) return false;
            let pair = this.pairs.find(p => p.key === key);
            if (!pair) {
                pair = { key, a: ka, b: kb, entries: [] };
                this.pairs.push(pair);
            }
            pair.entries.push({
                event: event.slice(0, 100),
                // 归因：谁做了什么、谁怎么想、共同约定（memorybooks 原则：不合并人格）
                actorDo: String(attribution?.actorDo || '').slice(0, 80),
                otherThink: String(attribution?.otherThink || '').slice(0, 80),
                bothAgreed: String(attribution?.bothAgreed || '').slice(0, 80),
                // 认知归属：只有单方知道的事实时显式标注
                knownBy: attribution?.knownBy === 'both' ? 'both' : 'one',
                floor: floor || 0,
                time: String(storyTime || '').slice(0, 30),
                timestamp: Date.now()
            });
            if (pair.entries.length > 20) pair.entries.shift();
            return true;
        }
        /** 从提取的 relationships + events 归因构建 */
        addFromExtracted(relationships, characters, floor, storyTime) {
            let n = 0;
            for (const rel of (relationships || []).slice(0, 6)) {
                const from = rel?.from || '', to = rel?.to || '';
                if (!from || !to) continue;
                if (this.addEntry(from, to, floor, storyTime, {
                    event: `关系确立/变化：${rel.type || '相关'}`,
                    actorDo: `${from} 对 ${to} 的态度：${rel.type}`,
                    knownBy: 'both'
                })) n++;
            }
            return n;
        }
        /** 注入：关系对的历史事件线（Topical Clip 风格） */
        toPrompt(presentChars) {
            if (!this.pairs.length) return '';
            const present = new Set((presentChars || []).map(c => norm(c)));
            // 只注入在场角色相关的关系对
            const relevant = this.pairs.filter(p => present.has(p.a) || present.has(p.b));
            if (!relevant.length) return '';
            const rows = [];
            for (const pair of relevant.slice(-5)) {
                const recent = pair.entries.slice(-3);
                for (const e of recent) {
                    let line = `- ${pair.a} × ${pair.b}：${e.event}`;
                    if (e.actorDo) line += `｜${e.actorDo}`;
                    if (e.otherThink) line += `｜${e.otherThink}`;
                    if (e.bothAgreed) line += `｜共同：${e.bothAgreed}`;
                    if (e.knownBy === 'one') line += '｜⚠️仅单方知晓';
                    rows.push(line);
                }
            }
            return rows.length ? `[群像共同记忆·归因式]（关系对的共同经历，归因清晰；⚠️标注项仅单方知晓，另一方绝不知情）：\n${rows.join('\n')}` : '';
        }
        // [v3.123] 关系变化增量读取：只返回游标后的关系对事件，并按当前角色关联。
        getChangesSince(floor = -1, characters = [], limit = 6) {
            const cursor = Number.isFinite(Number(floor)) ? Number(floor) : -1;
            const cap = Math.min(20, Math.max(0, Number(limit) || 0));
            const allowed = new Set((characters || []).map(x => norm(x)).filter(Boolean));
            const rows = [];
            for (const pair of (this.pairs || [])) {
                if (allowed.size && !allowed.has(norm(pair.a)) && !allowed.has(norm(pair.b))) continue;
                for (const e of (pair.entries || [])) if (Number(e.floor) > cursor) rows.push({ id: `pair_change_${pair.key}_${e.floor}`, floor: e.floor, text: `【关系变化】${pair.a} × ${pair.b}：${e.event}`, source: 'pair:change' });
            }
            return rows.sort((a,b) => Number(a.floor)-Number(b.floor)).slice(-cap).map(x => ({ ...x }));
        }
        removeByFloor(floor) {
            let n = 0;
            for (const pair of this.pairs) {
                const before = pair.entries.length;
                pair.entries = pair.entries.filter(e => e.floor !== floor);
                n += before - pair.entries.length;
            }
            this.pairs = this.pairs.filter(p => p.entries.length > 0);
            return n;
        }
        export() { return { pairs: this.pairs }; }
        import(data) { if (data && Array.isArray(data.pairs)) this.pairs = data.pairs; }
    }

    class PovMemory {
        constructor() { this.povs = []; }
        add(owner, content, floor) {
            if (!owner || !content) return null;
            const exist = this.povs.find(p => p.owner === owner && p.content === content);
            if (exist) { exist.floor = floor; exist.timestamp = Date.now(); exist.count = (exist.count || 0) + 1; return exist; }
            const p = {id: 'pov_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), owner, content, floor, timestamp: Date.now(), count: 1};
            this.povs.push(p);
            if (this.povs.length > 200) this.povs.shift();
            return p;
        }
        // 只取指定角色（当前登场者）的私密记忆，防剧透
        search(owners, limit = 3) {
            const set = new Set(owners);
            return this.povs.filter(p => set.has(p.owner)).slice(-limit).reverse();
        }
        export() { return this.povs; }
        import(data) { this.povs = Array.isArray(data) ? data : []; }
    }

    const api = Object.freeze({ MoneyLedger, CardCollection, ConflictBook, DeltaBook, PairMemory, PovMemory, norm });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaMemoryLedgers = api;
})(typeof window !== 'undefined' ? window : globalThis);
