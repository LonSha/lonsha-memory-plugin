/**
 * narrative-generators.js — 叙事产物生成类集（计划 A1 第三刀）
 *
 * 【为什么需要这一面 / 修前实测】
 *   A1 第一刀（v3.257.0 memory-ledgers.js）剥叶子账本类；第二刀（v3.258.0 memory-aux.js）剥工具类；
 *   本刀按同一条读数轴（成员级预算 + 文件规模上界）继续剥**生成侧派生系统**。
 *   选它们的读数依据（逐条实测，不是感觉）：
 *     · 三个类彼此**零互调**（无任何相互引用）；
 *     · 对主人模块级符号**零依赖**（不调 errLog / numOr / sanitizeJson 等；错误一律就地 try 兜成空值）；
 *     · 对外只被 MemoryEngine 在构造期 new 一次，之后按**方法名**调用；
 *     · 唯一宿主接触面是三处同形的 `window.SillyTavern?.getContext?.()`（可选链，环境不在时自然为空）。
 *
 * 【本模块的职责】
 *   · `DiarySystem`       活人感日记生成（[v2.5] 抽 hcdiary）
 *   · `ReflectionSystem`  反思系统（[v2.8] 抽 stbme reflection）
 *   · `OutlineDirector`   剧情大纲导演（[v3.48] 抽 shujuku：阶段节奏 + 轮级 pacing）
 *   三个类的公开面（方法名 / 返回形状 / 字段名 / 中文诊断字面量）与抽取前**逐字一致**。
 *
 * 【本模块不做什么（边界）】
 *   · 不读 localStorage、不发请求、不写盘；宿主上下文只经 `window.SillyTavern` 可选链取；
 *   · 不做跨类聚合（三个类互不引用，统合在宿主 `MemoryEngine`）；
 *   · **不另存一份主人函数副本**：模块内不重写 errLog / numOr / sanitizeJson，故一并将它们的调用面留在宿主。
 *
 * 【口径纪律】
 *   ① 全部方法在字段缺失 / 环境不可用时返回空值（0 / false / [] / null / 0），**绝不抛**；
 *   ② 模块缺席时宿主退到 `NarrativeGeneratorFallback`（常量空实现），如实回报「没有」；
 *   ③ 导出冻结（`Object.freeze(api)`）。
 *
 * 零依赖、CJS/IIFE 双导出（与全仓缝合模块同形）。
 */
(function (global) {
    'use strict';

    class DiarySystem {
        constructor() { this.diaries = {}; this._lastDiaryFloor = -1; this._writing = false; this._pending = null; }
        /**
         * 活人感日记生成（每N楼节流，抽最近窗口一次生成所有登场角色的日记）
         * @returns {number} 写入条数
         */
        async generateLiving(config, llm, knownChars, floor) {
            const every = Math.max(0, numOr(config.diaryEveryFloors, 3));   // [v3.156] 0=每楼（下一行 every>0 已正确处理）
            if (!config.livingDiary || !llm) return 0;
            if (every > 0 && (floor - this._lastDiaryFloor) < every) return 0;
            if (this._writing) { this._pending = floor; return 0; }
            this._writing = true;
            this._lastDiaryFloor = floor;
            try {
                const ctx = window.SillyTavern?.getContext?.();
                const chat = ctx?.chat || [];
                const win = chat.slice(-Math.max(4, every * 2 + 2)).map(m => (m.mes || '').substring(0, 500)).join('\n');
                if (!win) return 0;
                const memory = Object.entries(this.diaries).map(([n, arr]) => {
                    const last = (arr || []).slice(-1)[0];
                    return last ? `${n}: ${String(last.text || '').substring(0, 60)}` : null;
                }).filter(Boolean).slice(0, 10).join('\n');
                const prompt = `你是"角色日记"记录员。阅读给定剧情片段，为其中每个有名有戏份的登场角色，以该角色第一人称主观视角写一篇日记。
规则：
- 只为有名字、有实际戏份的角色写；纯路人忽略；不要为用户/玩家角色写日记。
- 第一人称，带该角色的情绪、私心、主观理解（可与事实有偏差）。同一事件不同角色可以记得不同。
- entry 是心声不是剧情复述：聚焦心理活动、情绪、关系变化、关键决定。100字内。
- secret 写"没说出口的心思"（没有填空串）。
- attitude_to_user 写该角色此刻对用户/主角的态度（一句话，如：表面客气心底记仇、依赖中带试探）。
- key_events 写他亲历且对他个人有分量的事件（数组，最多3条）。
- relationship_with_others 写他对自己与别人关系的主观印象（对象:描述；按他经历来写，不是上帝视角结论，可有偏差——单恋/错付/误判都是宝贵素材）。
- 复用已知角色名单中的主名。只输出JSON：{"diaries":[{"name":"主名","entry":"第一人称正文","mood":"心情词","secret":"没说出口的心思","attitude_to_user":"对用户态度","key_events":["事件1"],"relationship_with_others":{"某角色":"他眼中的关系"}}]}
${knownChars?.length ? `已知角色名单: ${knownChars.join('、')}` : '已知角色名单: (暂无)'}
${memory ? `各角色已有记忆(最新日记):\n${memory}` : '各角色已有记忆: (暂无)'}
【剧情片段】
${win}`;
                const raw = await llm.callAPI(prompt);
                if (!raw) return 0;
                const m = String(raw).match(/\{[\s\S]*\}/);
                if (!m) return 0;
                const parsed = JSON.parse(m[0]);
                let n = 0;
                for (const d of (parsed.diaries || [])) {
                    const name = String(d?.name || '').trim();
                    const entry = String(d?.entry || '').trim();
                    if (!name || entry.length < 4) continue;
                    if (!this.diaries[name]) this.diaries[name] = [];
                    this.diaries[name].push({
                        floor, text: entry.slice(0, 200), mood: String(d.mood || '平静').slice(0, 10),
                        secret: String(d.secret || '').slice(0, 100), timestamp: Date.now(),
                        attitude: String(d.attitude_to_user || '').slice(0, 60),
                        keyEvents: (Array.isArray(d.key_events) ? d.key_events : []).map(x => String(x).slice(0, 60)).slice(0, 3),
                        subjRelations: (d.relationship_with_others && typeof d.relationship_with_others === 'object' && !Array.isArray(d.relationship_with_others)) ? Object.entries(d.relationship_with_others).slice(0, 4).map(([k, v]) => `${String(k).slice(0, 12)}:${String(v).slice(0, 40)}`) : []
                    });
                    if (this.diaries[name].length > 30) this.diaries[name].shift();
                    n++;
                }
                return n;
            } catch (e) { return 0; }
            finally { this._writing = false; }
        }
        search(characters) {
            const results = [];
            const allowed = new Set((characters || []).map(c => String(c || '').trim()).filter(Boolean));
            for (const char of allowed) if (this.diaries[char]) results.push(...this.diaries[char].slice(-3));
            return results;
        }
        /** HCDiary 变化驱动适配：读取游标之后、指定角色的日记，返回副本。 */
        getChangesSince(floor = -1, characters = [], limit = 30) {
            const cursor = Number.isFinite(Number(floor)) ? Number(floor) : -1;
            const cap = Math.min(30, Math.max(0, Number(limit) || 0));
            const allowed = new Set((characters || []).map(c => String(c || '').trim()).filter(Boolean));
            const out = [];
            for (const [name, entries] of Object.entries(this.diaries || {})) {
                if (allowed.size && !allowed.has(name)) continue;
                for (const entry of (Array.isArray(entries) ? entries : [])) {
                    if (Number(entry?.floor) > cursor) out.push({ name, ...entry });
                }
            }
            return out
                .sort((a, b) => Number(a.floor) - Number(b.floor) || String(a.name).localeCompare(String(b.name), 'zh-CN'))
                .slice(-cap)
                .map(x => ({
                    ...x,
                    keyEvents: Array.isArray(x.keyEvents) ? [...x.keyEvents] : x.keyEvents,
                    subjRelations: Array.isArray(x.subjRelations) ? [...x.subjRelations] : x.subjRelations,
                }));
        }
        // [v2.7] RS: 按楼层删除日记（rollbackFloor 联动，幂等）
        removeByFloor(floor) {
            let n = 0;
            for (const name of Object.keys(this.diaries)) {
                const arr = this.diaries[name];
                const filtered = arr.filter(d => d.floor !== floor);
                if (filtered.length !== arr.length) { n += arr.length - filtered.length; this.diaries[name] = filtered; }
            }
            return n;
        }
        export() { return { diaries: this.diaries, lastDiaryFloor: this._lastDiaryFloor }; }
        import(data) {
            if (data && typeof data === 'object' && data.diaries) {
                this.diaries = data.diaries;
                this._lastDiaryFloor = Number(data.lastDiaryFloor ?? -1);
            } else {
                this.diaries = data || {};
            }
        }
    }

    class ReflectionSystem {
        constructor() { this.items = []; this._lastReflectFloor = -1; this._running = false; }
        /** 反思生成：抽最近窗口剧情+已知矛盾区，产出 {insight,trigger,suggestion,importance} */
        // [v3.37] 扩展 forceTrigger 支持惊奇度冲顶自适应触发
        async generate(config, llm, engine, floor, forceTrigger = false) {
            const every = Math.max(0, Number(config.reflectEveryFloors || 10));
            if (!config.reflectionEnabled || !llm) return 0;
            if (!forceTrigger && every > 0 && (floor - this._lastReflectFloor) < every) return 0;
            if (this._running) return 0;
            this._running = true;
            // [v3.38] 延迟更新 _lastReflectFloor，仅当成功产生反思时才记录
            try {
                const ctx = window.SillyTavern?.getContext?.();
                const chat = ctx?.chat || [];
                const win = chat.slice(-Math.max(6, every)).map(m => (m.mes || '').substring(0, 400)).join('\n');
                if (!win) return 0;
                const contradictions = (engine.suspense?.items || []).filter(x => x.status !== 'open').slice(-3)
                    .map(x => `- ${x.content}（${x.status}）`).join('\n') || '(无)';
                const recentInsights = this.items.slice(-3).map(i => `- ${i.insight}`).join('\n') || '(无)';
                const prompt = `你是 RP 长期记忆系统的反思生成器。阅读最近剧情，提炼最值得长期保留的高层结论。
规则：
- insight 总结最近情节中最值得长期保留的变化、关系趋势或潜在线索（50字内，不复述事件）。
- trigger 说明触发这条反思的关键事件或矛盾。
- suggestion 给出后续叙事上值得关注的提示。
- importance 1-10，数字越大越重要。
- 只输出JSON：{"insight":"...","trigger":"...","suggestion":"...","importance":5}
【最近剧情】
${win}
【近期已有反思】（禁止重复提炼相同结论）
${recentInsights}
【已了结/失败的悬念】（可作为矛盾线索参考）
${contradictions}`;
                const raw = await llm.callAPI(prompt);
                if (!raw) return 0;
                const sanitized = sanitizeJson(raw);
                const m = String(sanitized).match(/\{[\s\S]*\}/);
                if (!m) return 0;
                const parsed = JSON.parse(m[0]);
                const insight = String(parsed?.insight || '').trim();
                if (insight.length < 8) return 0;
                this.items.push({
                    floor, insight: insight.slice(0, 120),
                    trigger: String(parsed?.trigger || '').slice(0, 120),
                    suggestion: String(parsed?.suggestion || '').slice(0, 120),
                    importance: Math.min(10, Math.max(1, Number(parsed?.importance) || 5)),
                    timestamp: Date.now()
                });
                this._lastReflectFloor = floor;
                if (this.items.length > 20) this.items.shift();
                return 1;
            } catch (e) { return 0; }
            finally { this._running = false; }
        }
        /** 召回：重要度 Top-N */
        search(limit = 2) {
            return [...this.items].sort((a, b) => b.importance - a.importance).slice(0, limit);
        }
        export() { return { items: this.items, lastReflectFloor: this._lastReflectFloor }; }
        import(data) {
            if (data && typeof data === 'object' && Array.isArray(data.items)) {
                this.items = data.items;
                this._lastReflectFloor = Number(data.lastReflectFloor ?? -1);
            } else if (Array.isArray(data)) { this.items = data; }
        }
    }

    class OutlineDirector {
        constructor() {
            this.stage = null;        // { title, goal, tempo, nodes: [{title, goal, turns: [{goal, pacing}] }] }
            this._turnIndex = 0;      // 全局扁平 turn 指针
            this._turnFloor = 0;      // 当前 turn 起始楼层
            this.history = [];        // 已完成 turn 的简史
        }
        static TEMPOS = [
            { key: 'buildup', desc: '铺垫型：低压为主，攒关系与信息，为爆发蓄力' },
            { key: 'mixed', desc: '起伏型：常规推进，松紧交替' },
            { key: 'surge', desc: '高压型：决战/逃亡/密集事件' },
            { key: 'aftermath', desc: '余波型：消化代价、重建关系、落地前段高压' }
        ];
        static PACINGS = [
            { key: 'setup', desc: '铺垫：关系变化、信息沉淀、情绪落地' },
            { key: 'pressure', desc: '施压：行动+阻碍+悬念，冲突升级' },
            { key: 'turn', desc: '反转：揭示/转折/高潮爆点' },
            { key: 'cooldown', desc: '收束：后果消化、余韵' }
        ];
        get flatTurns() {
            if (!this.stage) return [];
            const out = [];
            for (const n of this.stage.nodes) for (const t of n.turns) out.push(t);
            return out;
        }
        get currentTurn() { return this.flatTurns[this._turnIndex] || null; }
        get exhausted() { return !this.stage || this._turnIndex >= this.flatTurns.length; }
        /** 宽容解析 AI 回复中的大纲标签（标签外内容全部忽略；<think> 已在上游剥离） */
        parseOutline(raw, floor) {
            const text = String(raw || '');
            if (!text.includes('<node')) return null;
            try {
                const pick = (tag) => {
                    const m = new RegExp('<' + tag + '>\\s*([\\s\\S]*?)\\s*</' + tag + '>', 'i').exec(text);
                    return m ? m[1].trim() : '';
                };
                const nodeBlocks = [];
                const nodeRe = /<node>([\s\S]*?)<\/node>/gi;
                let nm;
                while ((nm = nodeRe.exec(text))) {
                    const block = nm[1];
                    const turns = [];
                    const turnRe = /<turn([^>]*)>([\s\S]*?)<\/turn>/gi;
                    let tm;
                    while ((tm = turnRe.exec(block))) {
                        const pacingM = /pacing\s*=\s*[^a-z0-9]{0,2}([a-z]+)/i.exec(tm[1] || '');
                        const goal = String(tm[2] || '').replace(/<[^>]+>/g, '').trim();
                        if (goal) turns.push({ goal: goal.slice(0, 120), pacing: pacingM ? pacingM[1].toLowerCase() : 'mixed' });
                    }
                    if (turns.length) nodeBlocks.push({
                        title: (pick.call(null, 'node_title') || '').slice(0, 40),
                        goal: (pick.call(null, 'node_goal') || '').slice(0, 150),
                        turns
                    });
                }
                if (!nodeBlocks.length) return null;
                this.stage = {
                    title: pick('stage_title').slice(0, 60) || '未命名阶段',
                    goal: pick('stage_goal').slice(0, 200),
                    tempo: (pick('stage_tempo') || 'mixed').toLowerCase(),
                    nodes: nodeBlocks
                };
                this._turnIndex = 0;
                this._turnFloor = floor || 0;
                return this.stage;
            } catch (e) { return null; }
        }
        /** 每楼推进：当前 turn 的起始楼层距离超过 N 楼或剧情明显完成时推进（由外部判定） */
        advanceTurn(floor) {
            const cur = this.currentTurn;
            if (cur) {
                this.history.push({ goal: cur.goal, pacing: cur.pacing, floorFrom: this._turnFloor, floorTo: floor || 0 });
                if (this.history.length > 30) this.history.shift();
            }
            this._turnIndex++;
            this._turnFloor = floor || 0;
        }
        /** 注入块（导演视角：阶段/节点/本轮目标/本轮节奏） */
        toPrompt() {
            if (!this.stage) return '';
            const lines = [];
            const tempoDef = OutlineDirector.TEMPOS.find(t => t.key === this.stage.tempo);
            lines.push(`[剧情大纲·导演视角]（当前阶段「${this.stage.title}」：${this.stage.goal}）`);
            lines.push(`阶段节奏：${this.stage.tempo}${tempoDef ? '（' + tempoDef.desc + '）' : ''}`);
            // 扁平定位当前 node
            let acc = 0, nodeInfo = null;
            for (const n of this.stage.nodes) {
                if (this._turnIndex < acc + n.turns.length) { nodeInfo = { n, local: this._turnIndex - acc }; break; }
                acc += n.turns.length;
            }
            if (nodeInfo) {
                lines.push(`当前节点「${nodeInfo.n.title || '未命名'}」：${nodeInfo.n.goal}`);
                const cur = nodeInfo.n.turns[nodeInfo.local];
                const pacDef = OutlineDirector.PACINGS.find(p => p.key === cur.pacing);
                lines.push(`本轮目标（第${this._turnIndex + 1}/${this.flatTurns.length}轮）：${cur.goal}`);
                lines.push(`本轮节奏：${cur.pacing}${pacDef ? '（' + pacDef.desc + '）' : ''}——剧情推进应贴合该节奏形态`);
                const next = nodeInfo.n.turns[nodeInfo.local + 1];
                if (next) lines.push(`下一轮预告：${next.goal}`);
            } else if (this.exhausted) {
                lines.push('⚠️ 大纲轮次已耗尽：剧情可自然收束本阶段，建议 AI 以收束姿态推进并在方便时提出新的阶段方向');
            }
            return lines.join('\n');
        }
        // [v3.85] OutlineDirector 楼层生命周期：删楼撤销对应已执行轮次，但保留未执行计划。
        removeByFloor(floor) {
            const f = Number(floor);
            if (!Number.isFinite(f)) return 0;
            const before = this.history.length;
            this.history = this.history.filter(h => Number(h.floorTo) !== f);
            const removed = before - this.history.length;
            if (removed) {
                this._turnIndex = Math.max(0, this._turnIndex - removed);
                const prev = this.history[this.history.length - 1];
                this._turnFloor = prev ? Number(prev.floorTo) || 0 : 0;
            } else if (Number(this._turnFloor) === f) {
                const prev = this.history[this.history.length - 1];
                this._turnFloor = prev ? Number(prev.floorTo) || 0 : 0;
            }
            return removed;
        }
        rollbackFloor(floor) {
            return this.removeByFloor(floor);
        }
        shiftFloorRefs(deleted) {
            const del = Number(deleted);
            if (!Number.isFinite(del)) return 0;
            const dec = (value) => {
                const n = Number(value);
                return Number.isFinite(n) && n > del ? n - 1 : value;
            };
            let shifted = 0;
            const oldTurnFloor = this._turnFloor;
            this._turnFloor = dec(this._turnFloor);
            if (this._turnFloor !== oldTurnFloor) shifted++;
            for (const h of this.history) {
                const oldFrom = h.floorFrom, oldTo = h.floorTo;
                h.floorFrom = dec(h.floorFrom);
                h.floorTo = dec(h.floorTo);
                if (h.floorFrom !== oldFrom) shifted++;
                if (h.floorTo !== oldTo) shifted++;
            }
            return shifted;
        }
        /**
         * [v3.56] P18: 大纲耗尽时 LLM 自动规划新阶段（导演系统闭环）。
         * 上下文：最近摘要 + 群像关系 + 悬念簿（未结伏笔是新阶段最好的素材）。
         * 防重入 _planning + 冷却（失败后 outlinePlanCooldownFloors 楼内不重试，默认10）。
         * @returns 新阶段对象（规划成功）或 null
         */
        async planNext(config, llm, engine, floor) {
            if (!config.outlineAutoPlan || !llm) return null;
            if (!this.exhausted) return null;                    // 未耗尽不规划
            if (this._planning) return null;                     // 防重入
            const cooldown = Number(config.outlinePlanCooldownFloors) || 10;
            if (this._lastPlanFailFloor && (floor - this._lastPlanFailFloor) < cooldown) return null;
            this._planning = true;
            try {
                const ctx = (typeof window !== 'undefined') ? window.SillyTavern?.getContext?.() : null;
                const chat = ctx?.chat || [];
                const recentSummaries = (engine.summary?.getActiveSummaries?.() || []).slice(-4)
                    .map(s => `- ${s.text}`).join('\n') || '(无)';
                const openSusp = (engine.suspense?.openItems?.() || []).slice(-5)
                    .map(x => `- ${x.content}`).join('\n') || '(无)';
                const chars = (engine.getKnownCharacters?.() || []).slice(0, 12).join('、') || '(无)';
                const recentTurns = (this.history || []).slice(-3)
                    .map(h => `- [${h.pacing}] ${h.goal}`).join('\n') || '(首阶段)';
                const prompt = `你是 RP 剧情导演。上一阶段大纲已演完，请为接下来的剧情规划【新阶段大纲】。
规则：
- 新阶段要自然衔接最近剧情，优先消化【未结悬念】（伏笔是最好的阶段素材）。
- stage_tempo 从 buildup/mixed/surge/aftermath 中选（语义：铺垫蓄力/松紧交替/高压密集/余波消化）。
- 2-3 个 <node>，每个 node 内 2-4 个 <turn>，每个 turn 带 pacing 属性（setup 铺垫/pressure 施压/turn 反转/cooldown 收束）。
- turn 目标写具体剧情（一句话），不许空话；遵守角色名单，不新增主要角色。
- 标签外可写简短规划思路，系统只读标签内内容。
只输出以下标签结构：
<stage_title>阶段标题</stage_title>
<stage_goal>阶段整体目标</stage_goal>
<stage_tempo>形态</stage_tempo>
<node><node_title>节点标题</node_title><node_goal>节点目标</node_goal><turn pacing="setup">该轮剧情</turn>...</node>...
【角色名单】${chars}
【最近剧情摘要】
${recentSummaries}
【未结悬念】（新阶段优先消化）
${openSusp}
【上一阶段最后几轮】（衔接参考）
${recentTurns}`;
                const raw = await llm.callAPI(prompt);
                if (!raw) { this._lastPlanFailFloor = floor; return null; }
                const stage = this.parseOutline(raw, floor);
                if (!stage) { this._lastPlanFailFloor = floor; return null; }
                this._lastPlanFailFloor = 0;
                return stage;
            } catch (e) { this._lastPlanFailFloor = floor; return null; }
            finally { this._planning = false; }
        }
        export() {
            return { stage: this.stage, turnIndex: this._turnIndex, turnFloor: this._turnFloor, history: this.history };
        }
        import(data) {
            if (data && typeof data === 'object') {
                this.stage = data.stage || null;
                this._turnIndex = Number(data.turnIndex) || 0;
                this._turnFloor = Number(data.turnFloor) || 0;
                this.history = Array.isArray(data.history) ? data.history : [];
            }
        }
    }

    const api = Object.freeze({ DiarySystem, ReflectionSystem, OutlineDirector });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaNarrativeGenerators = api;
})(typeof window !== 'undefined' ? window : globalThis);
