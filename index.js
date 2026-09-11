(function() {
    'use strict';
    const PLUGIN_NAME = 'LonSha记忆引擎';
    const VERSION = '1.8.0';
    
    class ConfigManager {
        constructor() {
            this.config = {
                enabled: true,
                extractionEnabled: true,
                vectorEnabled: true,
                graphDiffusionEnabled: true,
                autoSave: true,
                maxSummaryLength: 200,
                extractionPrompt: `你是剧情记忆整理员。阅读【本轮对话】，对照【已知角色名单】与【前情提要】，只提取明确发生的事实，禁止编造与推测。

【已知角色名单】（提取角色必须复用这些主名；识别出别名/昵称/代称时，归并到对应主名）
{{KNOWN_CHARS}}

【前情提要】（此前剧情摘要，仅供理解上下文，禁止重复提取其中已记录的内容）
{{HISTORY}}

【本轮对话】
{{CONTENT}}

【提取规则】
1. characters：本轮实际登场、有名有戏份的角色。必须使用已知角色名单中的主名（别名归并）；纯路人忽略；不要把用户本人算进去。
2. events：只写已发生的事实。涉及约定、承诺、冲突、物品交付、地点移动、关系变化时，写清具体内容，禁止泛化成"某物""发生变化"。每个事件标注 scope："objective"（公开事实，所有在场角色都知道）或 "pov"（仅某角色亲眼看到/独自知道的事实，此时必须给出 owner=该角色主名）。
3. relationships：单向主观关系（from 看 to）。A看B 与 B看A 可能不同，分别各记一条。type 用简短词（如：暗恋、警惕、依赖、挚友、敌视）。attitude 只能填 positive / negative / neutral。
4. summary（最重要，必填）：用【监控摄像头视角】+【警察做笔录风格】重写本轮剧情，30-80字。必须包含：①谁对谁做了/说了什么（写具体动作或台词大意）②明确写出的状态变化③新信息或结果。时间锚定：保留具体人名、物品名、地点名。严禁照抄原文句子（必须用你自己的话重新组织）；严禁氛围描写（"气氛变得…"）和阅读理解句式（"体现了…的心态"）；严禁剧情续写（止步于原文最后一个动作）。纯叙述句，无 markdown。
5. story_date：本轮剧情中明确写出的日期（如"3月12日""2026年5月1日"）；未明确写出则填 null。禁止编造日期。
6. pov_memories：本轮产生的角色私密认知/秘密/内心独白（摄像头拍不到、仅该角色自己知道的内容）。每条必须给出 owner（哪个角色知道）和 content（一句话说清）。已在对话中公开说出口的内容不算。没有则填空数组。
7. 只输出一个 JSON 对象，不得输出解释或代码块围栏。字符串内含英文双引号时转义为 \\\"，中文引号直接用。

【输出格式】
{"characters": ["角色名"], "events": [{"type": "事件类型", "description": "描述", "scope": "objective", "owner": ""}], "relationships": [{"from": "A", "to": "B", "type": "关系", "attitude": "positive"}], "summary": "概括", "story_date": null, "pov_memories": [{"owner": "角色A", "content": "只有A知道的秘密"}]}`,
                // [v1.4] 独立 API 配置（提取用 LLM + 向量用 Embedding）
                apiProviderCustom: false,       // false=跟随正文接口, true=用下方独立配置
                apiUrl: '',
                apiKey: '',
                apiModel: 'gpt-4o-mini',
                embeddingUrl: '',
                embeddingKey: '',
                embeddingModel: 'text-embedding-ada-002',
                vectorTopK: 5,
                hybridAlpha: 0.7,
                pageRankDamping: 0.85,
                dppLambda: 0.5,
                debugMode: false,
                // [v1.7] RubyPhone 双向联动
                rubyPhoneBridge: true,      // 回填: LLM 提取结果 → RubyPhone 手机记忆
                rubyPhoneRecall: true,      // 召回: RubyPhone 记忆库作为一路召回源
                rubyPhoneRecallTopN: 3,     // 每轮从手机记忆召回条数
                // [v1.8] P0: POV 认知边界 + 剧情时间线
                povIsolation: true,         // 角色私密记忆隔离（只注入当前登场角色的 POV）
                povMaxPerTurn: 3,           // 每轮最多注入的 POV 条数
                plotTimeline: true,         // 剧情时间线（按剧情日期整理摘要）
                timelineWindowDays: 3       // 时间线召回时间窗（天）
            };
            this.loadConfig();
        }
        loadConfig() {
            try {
                const saved = localStorage.getItem('lonsha_memory_config');
                if (saved) this.config = {...this.config, ...JSON.parse(saved)};
                // [v1.6] 迁移摘要规则到笔录风格（治照抄）
                if (this.config.extractionPrompt?.includes('30-60字概括本轮剧情')) {
                    const defaults = new (this.constructor)().config;
                    this.config.extractionPrompt = defaults.extractionPrompt;
                    this.saveConfig();
                    console.log(`[${PLUGIN_NAME}] ✓ 摘要规则已升级到 v1.6 (笔录风格·治照抄)`);
                }
                // [v1.5] 迁移到三家融合版提示词（已知角色名单+前情提要+客观纪要规范）
                if (this.config.extractionPrompt && !this.config.extractionPrompt.includes('{{KNOWN_CHARS}}')) {
                    const defaults = new (this.constructor)().config;
                    this.config.extractionPrompt = defaults.extractionPrompt;
                    this.saveConfig();
                    console.log(`[${PLUGIN_NAME}] ✓ 提取提示词已升级到 v1.5 (已知角色名单+记忆回环+客观纪要)`);
                }
                // [v1.4.2] 迁移旧版提示词：summary 字段描述太弱导致 LLM 返回空摘要
                if (this.config.extractionPrompt?.includes('"summary": "摘要"')) {
                    this.config.extractionPrompt = this.config.extractionPrompt.replace(
                        '"summary": "摘要"',
                        '"summary": "用一句话概括这段对话发生了什么、角色间关系有何进展（30-60字，必须是你自己的概括，禁止照抄原文）"'
                    );
                    this.saveConfig();
                    console.log(`[${PLUGIN_NAME}] ✓ 提取提示词已自动升级 (summary 要求真概括)`);
                }
            } catch (e) {}
        }
        saveConfig() {
            try {
                localStorage.setItem('lonsha_memory_config', JSON.stringify(this.config));
            } catch (e) {}
        }
    }
    
    class LLMCaller {
        constructor(config) { this.config = config; }
        async callAPI(prompt) {
            try {
                const cfg = this.config.config;
                // [v1.4] 优先：独立 API（设置面板配置）
                if (cfg.apiProviderCustom && cfg.apiUrl && cfg.apiKey) {
                    const result = await this.callOpenAI(prompt, cfg.apiUrl, cfg.apiKey, cfg.apiModel);
                    if (result) return result;
                    console.warn(`[${PLUGIN_NAME}] 独立API调用失败，降级到宿主接口`);
                }
                // [v1.4.1 关键修复] generateQuietPrompt 只在 getContext() 上，不在 window！
                const ctx = window.SillyTavern?.getContext?.();
                const quiet = ctx?.generateQuietPrompt;
                if (typeof quiet === 'function') {
                    const result = await quiet({ quietPrompt: prompt, quietToLoud: false, skipWIAN: false });
                    if (result) return result;
                    // 兼容旧签名（位置参数）
                    return await quiet(prompt, false, false);
                }
                console.warn(`[${PLUGIN_NAME}] 宿主无 generateQuietPrompt，请在设置中配置独立API`);
                return null;
            } catch (err) {
                console.error(`[${PLUGIN_NAME}] API调用失败:`, err);
                return null;
            }
        }
        // [v1.4.1] 抓取模型列表（OpenAI 兼容 /models 端点）
        async fetchModels(url, key) {
            let base = url.replace(/\/+$/, '');
            if (base.includes('/chat/completions')) base = base.replace(/\/chat\/completions$/, '');
            const endpoint = base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
            const res = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${key}` } });
            if (!res.ok) throw new Error(`模型列表 ${res.status}`);
            const data = await res.json();
            return (data.data || data.models || []).map(m => m.id || m.name).filter(Boolean).sort();
        }
        async callOpenAI(prompt, url, key, model) {
            // 端点归一化：兼容 base(https://x.com/v1) 和完整端点两种填法
            let endpoint = url.replace(/\/+$/, '');
            if (!endpoint.includes('/chat/completions')) {
                endpoint = endpoint.endsWith('/v1') ? endpoint + '/chat/completions' : endpoint + '/v1/chat/completions';
            }
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`},
                body: JSON.stringify({model: model || 'gpt-4o-mini', messages: [{role: 'user', content: prompt}], temperature: 0.3, max_tokens: 1000})
            });
            if (!res.ok) throw new Error(`API ${res.status}: ${await res.text().catch(() => '')}`);
            const data = await res.json();
            return data.choices?.[0]?.message?.content || '';
        }
        async callGeneric(prompt, server) {
            const res = await fetch(`${server}/api/v1/generate`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({prompt, max_length: 500, temperature: 0.3})
            });
            const data = await res.json();
            return data.results?.[0]?.text || '';
        }
    }
    
    class VectorStore {
        constructor(config) {
            this.config = config;
            this.vectors = [];
            this.dimension = 1536;
        }
        
        async getEmbedding(text) {
            try {
                // [v1.4] 独立 Embedding 配置优先，Key 可回退到提取 Key
                const cfg = this.config.config;
                const api_key = cfg.embeddingKey || cfg.apiKey || localStorage.getItem('api_key_openai') || '';
                const api_base = (cfg.embeddingUrl || 'https://api.openai.com').replace(/\/+$/, '');
                
                if (!api_key) {
                    console.warn(`[${PLUGIN_NAME}] 无Embedding密钥，使用简化向量（可在设置中配置）`);
                    return this.simpleEmbedding(text);
                }
                
                const url = api_base.endsWith('/v1') ? `${api_base}/embeddings` : `${api_base}/v1/embeddings`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${api_key}`},
                    body: JSON.stringify({model: this.config.config.embeddingModel, input: text})
                });
                
                const data = await res.json();
                if (data.error) {
                    console.warn(`[${PLUGIN_NAME}] Embedding API错误，降级`, data.error);
                    return this.simpleEmbedding(text);
                }
                
                return data.data?.[0]?.embedding || this.simpleEmbedding(text);
            } catch (err) {
                console.warn(`[${PLUGIN_NAME}] Embedding失败，降级:`, err);
                return this.simpleEmbedding(text);
            }
        }
        
        simpleEmbedding(text) {
            const vec = new Array(this.dimension).fill(0);
            for (let i = 0; i < text.length && i < this.dimension; i++) {
                vec[i % this.dimension] += text.charCodeAt(i) / 10000;
            }
            const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
            return vec.map(v => v / (norm || 1));
        }
        
        async addVector(text, metadata) {
            const embedding = await this.getEmbedding(text);
            const id = `vec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            this.vectors.push({id, text, embedding, metadata, timestamp: Date.now()});
            return id;
        }
        
        cosineSimilarity(vecA, vecB) {
            if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
            let dot = 0, normA = 0, normB = 0;
            for (let i = 0; i < vecA.length; i++) {
                dot += vecA[i] * vecB[i];
                normA += vecA[i] * vecA[i];
                normB += vecB[i] * vecB[i];
            }
            return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
        }
        
        async search(query, topK = 5) {
            if (this.vectors.length === 0) return [];
            const queryVec = await this.getEmbedding(query);
            const scored = this.vectors.map(v => ({
                ...v,
                score: this.cosineSimilarity(queryVec, v.embedding)
            }));
            scored.sort((a, b) => b.score - a.score);
            return scored.slice(0, topK);
        }
        
        export() { return this.vectors.map(v => ({...v, embedding: Array.from(v.embedding)})); }
        import(data) {
            this.vectors = (data || []).map(v => ({...v, embedding: new Float32Array(v.embedding || [])}));
        }
    }
    
    class MemoryEngine {
        constructor(config) {
            this.config = config;
            this.graph = new MemoryGraph();
            this.summary = new SummarySystem();
            this.diary = new DiarySystem();
            this.vector = new VectorStore(config);
            this.storage = new StorageManager();
            this.llm = new LLMCaller(config);
            // [v1.8] P0
            this.pov = new PovMemory();
            this.timeline = new PlotTimeline();
        }
        
        async onMessageReceived(message, messageId = null) {
            if (!this.config.config.enabled) return;
            // [v1.2 真机适配修复] ST 消息对象没有 index 字段，
            // 楼层号来自 eventSource 回调的 messageId
            message = { ...message, index: messageId ?? message.index ?? 0 };
            // [v1.4] 清洗正文：剥离 HTML注释/SDC标签/自定义标签，防止脏数据入库
            message.mes = this.cleanMessageText(message.mes || message.content || '');
            if (!message.mes) { console.log(`[${PLUGIN_NAME}] 消息清洗后为空，跳过`); return; }
            console.log(`[${PLUGIN_NAME}] 处理新消息 (楼层 ${message.index})`);
            const chatId = this.getCurrentChatId();
            if (!chatId) return;
            try {
                const extracted = await this.extractMemoryWithLLM(message);
                if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 提取:`, extracted);
                
                // [v1.7] RubyPhone 联动①: LLM 提取结果回填手机记忆库
                if (this.config.config.rubyPhoneBridge && extracted) {
                    try {
                        const bridge = window.VirtualPhone?.lonshaBridge;
                        if (bridge?.backfill) {
                            bridge.backfill(extracted);
                        } else if (window.VirtualPhone?.memoryCore) {
                            // 兜底: 桥未挂载时直接写入记忆库 (摘要→长期记忆)
                            const s = String(extracted.summary || '').trim();
                            if (s.length >= 15) window.VirtualPhone.memoryCore.record('ai', '[剧情] ' + s, {});
                        }
                    } catch (e) {
                        if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] RubyPhone回填失败:`, e);
                    }
                }
                
                const messageText = message.mes || '';
                
                if (extracted?.characters) {
                    for (const char of extracted.characters) {
                        const canonical = this.resolveCharacterName(char);
                        this.graph.addNode({type: 'character', name: canonical, data: {source: messageText}});
                    }
                }
                
                if (extracted?.events) {
                    for (const event of extracted.events) {
                        const nodeId = this.graph.addNode({type: 'event', name: event.type, data: event});
                        if (event.participants) {
                            for (const p of event.participants) {
                                this.graph.addEdge({from: p, to: nodeId, label: 'participated_in'});
                            }
                        }
                    }
                }
                
                if (extracted?.relationships) {
                    for (const rel of extracted.relationships) {
                        // [v1.5] 单向主观关系：主名归并 + attitude 三值入边数据
                        this.graph.addEdge({
                            from: this.resolveCharacterName(rel.from),
                            to: this.resolveCharacterName(rel.to),
                            label: rel.type, weight: 1.0,
                            data: {attitude: rel.attitude || 'neutral', note: rel.note || ''}
                        });
                    }
                }
                
                // [v1.8] P0: 写入角色私密记忆（POV 隔离）
                if (this.config.config.povIsolation && Array.isArray(extracted?.pov_memories)) {
                    let povCount = 0;
                    for (const p of extracted.pov_memories) {
                        if (p?.owner && p?.content) {
                            const owner = this.resolveCharacterName(p.owner);
                            this.pov.add(owner, String(p.content).trim(), message.index || 0);
                            povCount++;
                        }
                    }
                    // 事件里标了 scope:pov 的也收进 POV 池
                    for (const ev of (extracted?.events || [])) {
                        if (ev?.scope === 'pov' && ev?.owner && ev?.description) {
                            this.pov.add(this.resolveCharacterName(ev.owner), String(ev.description).trim(), message.index || 0);
                            povCount++;
                        }
                    }
                    if (povCount && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] POV私密记忆 +${povCount}`);
                }

                // [v1.8] P0: 写入剧情时间线
                if (this.config.config.plotTimeline && extracted?.summary) {
                    const sd = this.extractStoryDate(message.mes || '', extracted.story_date);
                    this.timeline.add(sd, extracted.summary, message.index || 0, extracted.characters || []);
                }

                const summary = await this.summary.createSummary(message, extracted?.summary);
                
                if (extracted?.characters) {
                    for (const char of extracted.characters) {
                        await this.diary.writeDiary(char, message, summary, extracted);
                    }
                }
                
                if (this.config.config.vectorEnabled) {
                    const vectorText = `${extracted?.summary || this.summary.smartTruncate(messageText, 200)}\n角色:${extracted?.characters?.join(',') || ''}`;
                    await this.vector.addVector(vectorText, {
                        floor: message.index || 0,
                        characters: extracted?.characters || [],
                        events: extracted?.events || [],
                        summary: extracted?.summary || ''
                    });
                }
                
                if (this.config.config.autoSave) {
                    await this.storage.save(chatId, {
                        graph: this.graph.export(),
                        summaries: this.summary.export(),
                        diaries: this.diary.export(),
                        vectors: this.vector.export(),
                        povs: this.pov.export(),
                        timeline: this.timeline.export(),
                        version: VERSION
                    });
                }
                
                console.log(`[${PLUGIN_NAME}] ✓ 完成 (${extracted?.characters?.length || 0}角色, ${extracted?.events?.length || 0}事件, 向量=${this.vector.vectors.length})`);
            } catch (err) {
                console.error(`[${PLUGIN_NAME}] ✗ 失败:`, err);
            }
        }
        
        async extractMemoryWithLLM(message) {
            if (!this.config.config.extractionEnabled) return this.extractMemorySimple(message);
            try {
                const content = (message.mes || '').substring(0, 2000);
                // [v1.5] 抄 HCDiary：注入已知角色名单 + 前情提要（记忆回环）
                const knownChars = this.getKnownCharacters();
                const history = this.summary.summaries.slice(-5).map(s => s.text).join('\n');
                const prompt = this.config.config.extractionPrompt
                    .replace('{{KNOWN_CHARS}}', knownChars.join('、') || '（暂无，从本轮开始积累）')
                    .replace('{{HISTORY}}', history || '（暂无）')
                    .replace('{{CONTENT}}', content);
                const response = await this.llm.callAPI(prompt);
                if (!response) {
                    console.warn(`[${PLUGIN_NAME}] LLM无响应，用简单提取`);
                    return this.extractMemorySimple(message);
                }
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    // [v1.4] 角色名合法性校验：1-8字、无标点数字，过滤"钥匙在锁"类误提取
                    if (Array.isArray(parsed.characters)) {
                        parsed.characters = parsed.characters.filter(n =>
                            typeof n === 'string' && n.length >= 1 && n.length <= 8 && !/[\d\p{P}\s]/u.test(n)
                        );
                    }
                    return parsed;
                } else {
                    return this.extractMemorySimple(message);
                }
            } catch (err) {
                console.error(`[${PLUGIN_NAME}] LLM提取失败:`, err);
                return this.extractMemorySimple(message);
            }
        }
        
        // [v1.5] 抄 HCDiary cdCaptureCast：从最近楼层捕获登场角色（词边界正则，防误匹配）
        captureCast() {
            const ctx = window.SillyTavern?.getContext?.();
            const chat = ctx?.chat || [];
            const window = chat.slice(-8); // 最近8楼判定窗口
            const sceneText = window.map(m => (m?.mes || '')).join('\n');
            if (!sceneText) return [];
            const cast = [];
            for (const name of this.getKnownCharacters()) {
                if (!name || name.length < 2) continue;
                try {
                    const re = new RegExp('(?<![\u4e00-\u9fa5a-zA-Z])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-zA-Z0-9])', 'i');
                    if (re.test(sceneText)) cast.push(name);
                } catch (e) { /* 正则失败跳过 */ }
            }
            return cast.slice(0, 5);
        }

        // [v1.5] 抄 HCDiary：已知角色名单（主卡角色 + 图谱已积累角色，排除用户）
        getKnownCharacters() {
            const known = [];
            const ctx = window.SillyTavern?.getContext?.();
            if (ctx?.name2 && ctx.name2 !== ctx.name1) known.push(ctx.name2);
            for (const node of this.graph.nodes.values()) {
                if (node.type === 'character' && node.name && !known.includes(node.name) && node.name !== ctx?.name1) {
                    known.push(node.name);
                }
            }
            return known.slice(0, 20);
        }
        // [v1.5] 抄 HCDiary：别名归并——新名字与已有主名互为包含时，归并到主名
        resolveCharacterName(name) {
            if (!name) return name;
            if (this.graph.nameIndex.has(name)) return name;
            for (const known of this.graph.nameIndex.keys()) {
                if (known.includes(name) || name.includes(known)) return known;
            }
            return name;
        }
        
        extractMemorySimple(message) {
            // [v1.4 修复] 旧版用正则抓任意中文词块当角色名，产生"钥匙在锁""两下"这类垃圾。
            // 现在只匹配已知角色（当前角色卡 + 图谱已有节点），宁可漏记不记错。
            const content = message.mes || '';
            const known = new Set();
            const ctx = window.SillyTavern?.getContext?.();
            if (ctx?.name2) known.add(ctx.name2);
            if (ctx?.name1) known.add(ctx.name1);
            for (const node of this.graph.nodes.values()) {
                if (node.type === 'character' && node.name) known.add(node.name);
            }
            const characters = Array.from(known).filter(n => n && content.includes(n)).slice(0, 5);
            return {characters, events: [], relationships: [], entities: [], summary: this.summary.smartTruncate(content, 100)};
        }
        
        // [v1.8] P0: 剧情日期提取（优先 LLM 标注，其次从正文匹配，最后兜底实时日期）
        extractStoryDate(messageText, llmDate) {
            if (llmDate) return String(llmDate).trim();
            const m = String(messageText || '').match(/(\d{1,4})\s*[年\/-]\s*(\d{1,2})\s*[月\/-]\s*(\d{1,2})\s*日?/);
            if (m) return `${m[1]}年${m[2]}月${m[3]}日`;
            try {
                const tm = window.VirtualPhone?.timeManager;
                if (tm?.getCurrentStoryTime) {
                    const t = tm.getCurrentStoryTime();
                    if (t?.date && !t.isReal) return String(t.date);
                }
            } catch (e) {}
            return null;
        }
        // [v1.8] P0: 当前剧情时间锚点（时间线召回用）
        getLatestStoryDate() {
            try {
                // 优先从最近楼层找剧情日期
                const ctx = window.SillyTavern?.getContext?.();
                const chat = ctx?.chat || [];
                for (let i = chat.length - 1; i >= Math.max(0, chat.length - 6); i--) {
                    const m = chat[i];
                    const text = (m?.mes || '') + (m?.content || '');
                    const hit = String(text).match(/(\d{1,4})\s*[年\/-]\s*(\d{1,2})\s*[月\/-]\s*(\d{1,2})\s*日?/);
                    if (hit) return `${hit[1]}年${hit[2]}月${hit[3]}日`;
                }
                // 兜底：手机时间管理器
                const tm = window.VirtualPhone?.timeManager;
                if (tm?.getCurrentStoryTime) {
                    const t = tm.getCurrentStoryTime();
                    if (t?.date && !t.isReal) return String(t.date);
                }
            } catch (e) {}
            return null;
        }

        // [v1.4] 正文清洗：剥离注释/标签/世界书标记
        cleanMessageText(text) {
            return String(text || '')
                .replace(/<!--[\s\S]*?-->/g, '')      // HTML注释 (SDC-start 等)
                .replace(/<\/?[a-zA-Z_][\w-]*[^>]*>/g, '')  // 自定义标签 (konatan_planning 等)
                .replace(/\[\[.*?\]\]/g, '')           // [[宏]]
                .replace(/\{\{.*?\}\}/g, '')          // {{宏}}
                .trim();
        }
        
        async onBeforeGeneration(context) {
            if (!this.config.config.enabled) return '';
            const chatId = this.getCurrentChatId();
            if (!chatId) return '';
            try {
                await this.storage.load(chatId);
                const query = this.buildQuery(context);
                const recalled = await this.recallMemory(query);
                return this.buildInjection(recalled);
            } catch (err) {
                return '';
            }
        }
        
        async recallMemory(query) {
            const results = {summary: [], graph: [], diary: [], vector: [], diffusion: [], pov: [], timeline: []};
            
            results.summary = this.summary.search(query.text);
            
            // [v1.5] 登场角色捕获（抄 HCDiary）：从最近楼层窗口判断谁登场，只召回这些角色的记忆
            const castCaptured = this.captureCast();
            if (castCaptured.length > 0) query.characters = castCaptured;
            
            if (query.characters?.length > 0) {
                results.graph = this.graph.findByNames(query.characters);
                results.diary = this.diary.search(query.characters);
                
                // Phase 3: 图扩散增强召回
                if (this.config.config.graphDiffusionEnabled && window.LonShaMemory?.diffusion) {
                    try {
                        const seedNodes = results.graph.slice(0, 3);
                        if (seedNodes.length > 0) {
                            const diffusionResults = window.LonShaMemory.diffusion.personalizedPageRank(
                                seedNodes, 
                                3, 
                                this.config.config.vectorTopK
                            );
                            
                            // DPP多样性采样
                            const diverseResults = window.LonShaMemory.diffusion.diversitySampling(
                                diffusionResults,
                                Math.min(5, diffusionResults.length),
                                this.config.config.dppLambda
                            );
                            
                            results.diffusion = diverseResults.map(r => ({
                                ...r.node,
                                score: r.score,
                                source: 'diffusion'
                            }));
                            
                            if (this.config.config.debugMode) {
                                console.log(`[${PLUGIN_NAME}] 图扩散召回: ${results.diffusion.length}条`);
                            }
                        }
                    } catch (err) {
                        console.warn(`[${PLUGIN_NAME}] 图扩散失败:`, err);
                    }
                }
            }
            
            if (this.config.config.vectorEnabled && query.text) {
                const vectorResults = await this.vector.search(query.text, this.config.config.vectorTopK);
                results.vector = vectorResults.map(v => ({
                    text: v.text,
                    score: v.score,
                    metadata: v.metadata,
                    source: 'vector'
                }));
            }
            
            // [v1.8] P0: 剧情时间线召回（按剧情日期相近度）
            if (this.config.config.plotTimeline && this.timeline.entries.length) {
                const anchorDate = this.getLatestStoryDate();
                if (anchorDate) {
                    results.timeline = this.timeline.searchNear(anchorDate, this.config.config.timelineWindowDays, 5)
                        .map(e => ({id: e.id, text: `[${e.date}] ${e.text}`, date: e.date, floor: e.floor, source: 'timeline'}));
                }
            }
            
            // [v1.7] RubyPhone 联动②: 手机记忆库作为一路召回源
            if (this.config.config.rubyPhoneRecall && query.text) {
                try {
                    const bridge = window.VirtualPhone?.lonshaBridge;
                    if (bridge?.recall) {
                        const phoneHits = bridge.recall(query.text, this.config.config.rubyPhoneRecallTopN || 3);
                        if (phoneHits.length) {
                            results.rubyphone = phoneHits.map(h => ({
                                text: h.content,
                                score: h.score,
                                metadata: { layer: h.layer, source: 'rubyphone' },
                                source: 'rubyphone'
                            }));
                        }
                    }
                } catch (e) {
                    if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] RubyPhone召回失败:`, e);
                }
            }
            
            // [v1.8] P0: POV 私密记忆召回（只取当前登场角色的，防剧透）
            if (this.config.config.povIsolation && this.pov.povs.length) {
                const present = this.captureCast();
                const owners = present.length ? present : (window.SillyTavern?.getContext?.()?.name2 ? [window.SillyTavern.getContext().name2] : []);
                if (owners.length) {
                    results.pov = this.pov.search(owners, this.config.config.povMaxPerTurn || 3)
                        .map(p => ({id: p.id, owner: p.owner, text: p.content, floor: p.floor, source: 'pov'}));
                }
            }
            
            return this.hybridMerge(results);
        }
        
        // [v1.5] RRF 倒数排名融合（抄 shujuku reciprocalRankFusion）——
        // 比固定权重 alpha 更稳健：不需要调参，多路召回中同时命中的记忆自动获得更高分
        hybridMerge(results) {
            const K = 60; // RRF 标准常数
            const lists = [
                results.vector || [],
                results.diffusion || [],
                results.graph || [],
                results.summary || [],
                results.diary || [],
                results.rubyphone || [],
                results.timeline || [],
                results.pov || []
            ];
            const byKey = new Map();
            lists.forEach((list, listIdx) => {
                list.forEach((item, rank) => {
                    const key = item.id || item.text || item.name || JSON.stringify(item).substring(0, 80);
                    const rrfScore = 1 / (K + rank + 1);
                    const prev = byKey.get(key);
                    byKey.set(key, {
                        ...item,
                        rrfScore: (prev?.rrfScore || 0) + rrfScore,
                        hits: (prev?.hits || 0) + 1,   // 被几路召回命中
                        source: prev?.source ? prev.source + '+' : ['vector','diffusion','graph','summary','diary','rubyphone','timeline','pov'][listIdx]
                    });
                });
            });
            const merged = Array.from(byKey.values());
            merged.sort((a, b) => (b.rrfScore || 0) - (a.rrfScore || 0));
            const top = merged.slice(0, this.config.config.vectorTopK * 2);
            if (this.config.config.debugMode) {
                console.log(`[${PLUGIN_NAME}] RRF融合: ${merged.length} 项, 多路命中: ${top.filter(t => t.hits > 1).length} 项`);
            }
            return top;
        }

        _legacyHybridMerge(results) {
            const alpha = this.config.config.hybridAlpha;
            const merged = [];
            const seen = new Set();
            
            // 向量检索结果 (权重 α)
            for (const v of results.vector || []) {
                const key = v.text || JSON.stringify(v.metadata);
                if (!seen.has(key)) {
                    seen.add(key);
                    merged.push({...v, finalScore: v.score * alpha, source: 'vector'});
                }
            }
            
            // 图扩散结果 (权重 α * 0.8)
            for (const d of results.diffusion || []) {
                const key = d.id || d.name || JSON.stringify(d);
                if (!seen.has(key)) {
                    seen.add(key);
                    merged.push({...d, finalScore: d.score * alpha * 0.8, source: 'diffusion'});
                }
            }
            
            // 其他结果均分剩余权重
            const remainingWeight = (1 - alpha) / 3;
            for (const source of [results.graph, results.summary, results.diary]) {
                for (const item of source || []) {
                    const key = item.id || item.text || item.name || JSON.stringify(item);
                    if (!seen.has(key)) {
                        seen.add(key);
                        merged.push({...item, finalScore: remainingWeight, source: 'graph/summary/diary'});
                    }
                }
            }
            
            merged.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
            return merged.slice(0, this.config.config.vectorTopK * 2);
        }
        
        buildQuery(context) {
            const recentMsgs = window.SillyTavern?.getContext?.()?.chat?.slice(-5) || [];
            const text = recentMsgs.map(m => m.mes).join(' ');
            return {text, characters: this.extractCharactersFromContext(text)};
        }
        
        extractCharactersFromContext(text) {
            const chars = new Set();
            const ctx = window.SillyTavern?.getContext?.();
            if (ctx?.name2) chars.add(ctx.name2);
            if (ctx?.name1) chars.add(ctx.name1);
            return Array.from(chars);
        }
        
        // [v1.5] 注入格式（抄 baibai 私密简报包裹 + HCDiary 分区结构）
        buildInjection(recalled) {
            if (!recalled?.length) return '';
            const NOTE = '〔记忆系统私密简报｜仅你可见〕以下内容帮助保持剧情连贯;严禁在回复正文中复述、罗列或提及本节内容。';
            const END = '〔私密简报结束〕请像一个已读过前情的叙述者那样自然续写,不要复述简报本身。';
            
            // 分区：剧情摘要 / 角色关系 / 角色日记 / 手机记忆（抄 HCDiary 的分类注入）
            const summaries = [], relations = [], diaries = [], phoneMem = [], timelines = [], povs = [];
            for (const item of recalled.slice(0, this.config.config.vectorTopK * 2)) {
                if (item.source?.includes('pov')) povs.push(item);
                else if (item.source?.includes('timeline')) timelines.push(item);
                else if (item.source?.includes('rubyphone')) phoneMem.push(item);
                else if (item.source?.includes('diary')) diaries.push(item);
                else if (item.source?.includes('graph')) relations.push(item);
                else summaries.push(item);
            }
            
            const blocks = [];
            if (summaries.length) {
                blocks.push('[前情摘要]');
                summaries.forEach(i => blocks.push(`- ${i.text || i.summary || i.name || ''}`));
            }
            if (relations.length) {
                blocks.push('[角色关系]');
                relations.forEach(i => {
                    const att = i.data?.attitude === 'positive' ? '友好' : i.data?.attitude === 'negative' ? '排斥' : '中立';
                    blocks.push(`- ${i.from || i.name} → ${i.to || ''}：${i.label || '相关'}[${att}]`);
                });
            }
            if (diaries.length) {
                blocks.push('[角色日记·近期]');
                diaries.forEach(i => blocks.push(`- ${i.character || ''}（${i.floor != null ? '第' + i.floor + '楼' : ''}）：${i.text || i.entry || ''}`));
            }
            if (timelines.length) {
                blocks.push('[剧情时间线]');
                const seen = new Set();
                timelines.forEach(i => {
                    const key = i.text || '';
                    if (seen.has(key)) return;
                    seen.add(key);
                    blocks.push(`- ${key}`);
                });
            }
            if (povs.length) {
                const present = this.captureCast();
                const who = present.length ? present.join('、') : '当前角色';
                blocks.push(`〔${who}的内心/私密认知｜仅该角色知晓，其他角色不得表现出已知道〕`);
                povs.forEach(i => blocks.push(`- ${i.owner}：${i.text || ''}`));
            }
            if (phoneMem.length) {
                blocks.push('[手机生活记忆]');
                phoneMem.forEach(i => blocks.push(`- ${i.text || i.content || ''}`));
            }
            
            if (!blocks.length) return '';
            return `\n\n${NOTE}\n${blocks.join('\n')}\n${END}\n`;
        }
        
        getCurrentChatId() {
            try { return window.SillyTavern?.getContext?.()?.chatId; } catch { return null; }
        }
    }
    
    class MemoryGraph {
        constructor() { this.nodes = new Map(); this.edges = new Map(); this.nameIndex = new Map(); }
        addNode(node) {
            const id = node.id || `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const fullNode = {...node, id, timestamp: Date.now()};
            this.nodes.set(id, fullNode);
            if (node.name) {
                if (!this.nameIndex.has(node.name)) this.nameIndex.set(node.name, []);
                this.nameIndex.get(node.name).push(id);
            }
            return id;
        }
        addEdge(edge) {
            const id = `${edge.from}-${edge.to}-${edge.label || 'related'}`;
            this.edges.set(id, {...edge, id, timestamp: Date.now()});
            return id;
        }
        findByNames(names) {
            const results = [];
            for (const name of names) {
                const ids = this.nameIndex.get(name);
                if (ids) for (const id of ids) { const node = this.nodes.get(id); if (node) results.push(node); }
            }
            return results;
        }
        export() { return {nodes: Array.from(this.nodes.values()), edges: Array.from(this.edges.values())}; }
        import(data) {
            this.nodes.clear(); this.edges.clear(); this.nameIndex.clear();
            if (data?.nodes) for (const node of data.nodes) {
                this.nodes.set(node.id, node);
                if (node.name) {
                    if (!this.nameIndex.has(node.name)) this.nameIndex.set(node.name, []);
                    this.nameIndex.get(node.name).push(node.id);
                }
            }
            if (data?.edges) for (const edge of data.edges) this.edges.set(edge.id, edge);
        }
    }
    
    class SummarySystem {
        constructor() { this.summaries = []; }
        // [v1.4.2] 智能截断：优先在句子边界断开，避免"但那个"式半句截断
        smartTruncate(text, maxLen) {
            text = String(text || '').trim();
            if (text.length <= maxLen) return text;
            const cut = text.substring(0, maxLen);
            let lastEnd = -1;
            for (const ch of ['。', '！', '？', '…', '”', '"']) {
                const i = cut.lastIndexOf(ch);
                if (i > lastEnd) lastEnd = i;
            }
            return lastEnd > maxLen * 0.5 ? cut.substring(0, lastEnd + 1) : cut + '……';
        }
        async createSummary(message, llmSummary) {
            const text = llmSummary || this.smartTruncate(message.mes || '', 200);
            const summary = {floor: message.index || 0, text, level: 1, timestamp: Date.now()};
            this.summaries.push(summary);
            return summary;
        }
        search(query) { return this.summaries.filter(s => s.text.includes(query)).slice(0, 5); }
        export() { return this.summaries; }
        import(data) { this.summaries = data || []; }
    }
    

    // [v1.8] P0: POV 私密记忆（抄 stbme memory-scope：客观 vs 角色主观认知隔离）
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
    
    // [v1.8] P0: 剧情时间线（抄 yuzuki plot-summary：按剧情日期排序）
    class PlotTimeline {
        constructor() { this.entries = []; }
        add(date, text, floor, characters = []) {
            if (!date || !text) return null;
            const exist = this.entries.find(e => e.date === date && e.text === text);
            if (exist) { exist.floor = floor; exist.timestamp = Date.now(); return exist; }
            const e = {id: 'tl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), date, text, floor, characters, timestamp: Date.now()};
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
        export() { return this.entries; }
        import(data) { this.entries = Array.isArray(data) ? data : []; }
    }
    
    class DiarySystem {

        constructor() { this.diaries = {}; }
        async writeDiary(character, message, summary, extracted) {
            if (!this.diaries[character]) this.diaries[character] = [];
            this.diaries[character].push({floor: message.index || 0, text: summary.text, mood: 'neutral', events: extracted?.events || [], timestamp: Date.now()});
        }
        search(characters) {
            const results = [];
            for (const char of characters) if (this.diaries[char]) results.push(...this.diaries[char].slice(-3));
            return results;
        }
        export() { return this.diaries; }
        import(data) { this.diaries = data || {}; }
    }
    
    class StorageManager {
        constructor() { this.STORAGE_KEY = 'lonsha_memory'; }
        async save(chatId, data) {
            try {
                const ctx = window.SillyTavern?.getContext?.();
                if (!ctx?.chatMetadata) return;
                if (!ctx.chatMetadata.extensions) ctx.chatMetadata.extensions = {};
                ctx.chatMetadata.extensions[this.STORAGE_KEY] = {version: VERSION, chatId, data, timestamp: Date.now()};
                if (ctx.saveChat) await ctx.saveChat(); else if (window.saveChat) await window.saveChat();
            } catch (err) { console.error('保存失败:', err); }
        }
        async load(chatId) {
            try {
                const ctx = window.SillyTavern?.getContext?.();
                const data = ctx?.chatMetadata?.extensions?.[this.STORAGE_KEY]?.data;
                if (data && window.LonShaMemory?.engine) {
                    const engine = window.LonShaMemory.engine;
                    if (data.graph) engine.graph.import(data.graph);
                    if (data.summaries) engine.summary.import(data.summaries);
                    if (data.diaries) engine.diary.import(data.diaries);
                    if (data.vectors) engine.vector.import(data.vectors);
                    if (data.povs && engine.pov) engine.pov.import(data.povs);
                    if (data.timeline && engine.timeline) engine.timeline.import(data.timeline);
                }
                return data;
            } catch (err) { return null; }
        }
    }
    
    class LonShaMemoryPlugin {
        constructor() { 
            this.configMgr = new ConfigManager(); 
            this.engine = new MemoryEngine(this.configMgr); 
            this.diffusion = null;
            this.visualizer = null;
            this.initialized = false; 
        }
        async init() {
            if (this.initialized) return;
            console.log(`[${PLUGIN_NAME}] v${VERSION} 初始化...`);
            await this.waitForST();
            this.loadModules();
            this.registerEvents();
            this.createUI();
            await this.ensureSettingsUI();
            // [v1.2] 初始化时加载当前对话的已有记忆数据
            try {
                const chatId = this.engine.getCurrentChatId();
                if (chatId) {
                    const data = await this.engine.storage.load(chatId);
                    if (data) console.log(`[${PLUGIN_NAME}] ✓ 已加载历史记忆 (节点 ${this.engine.graph.nodes.size}, 向量 ${this.engine.vector.vectors.length})`);
                }
            } catch (err) {
                console.warn(`[${PLUGIN_NAME}] 历史记忆加载失败:`, err);
            }
            this.initialized = true;
            console.log(`[${PLUGIN_NAME}] ✓ 初始化完成 (LLM+向量检索+图扩散+可视化已启用)`);
        }
        
        // [v1.3] 设置面板加载兜底：宿主若不加载 extra_js，则动态注入 settings-ui.js
        async ensureSettingsUI() {
            if (this.showSettingsPanel) { this._settingsUIMounted = true; return; }
            try {
                const scriptSrc = document.currentScript?.src
                    || Array.from(document.querySelectorAll('script[src]')).map(s => s.src).find(s => s.includes('lonsha-memory-plugin') && s.endsWith('index.js'));
                if (!scriptSrc) return;
                const base = scriptSrc.replace(/index\.js.*$/, '');
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = base + 'settings-ui.js';
                    s.onload = resolve;
                    s.onerror = reject;
                    document.head.appendChild(s);
                });
                // 等待挂载完成
                for (let i = 0; i < 20 && !this.showSettingsPanel; i++) {
                    await new Promise(r => setTimeout(r, 150));
                }
                this._settingsUIMounted = !!this.showSettingsPanel;
                console.log(`[${PLUGIN_NAME}] ${this._settingsUIMounted ? '✓ 设置面板已加载 (动态注入)' : '⚠️ 设置面板加载超时'}`);
            } catch (err) {
                console.warn(`[${PLUGIN_NAME}] settings-ui.js 动态加载失败:`, err);
            }
        }
        loadModules() {
            // 加载图扩散模块
            if (typeof GraphDiffusion !== 'undefined') {
                this.diffusion = new GraphDiffusion(this.engine.graph);
                console.log(`[${PLUGIN_NAME}] ✓ 图扩散模块已加载`);
            }
            // 加载可视化模块
            if (typeof MemoryVisualizer !== 'undefined') {
                this.visualizer = new MemoryVisualizer(this.engine);
                console.log(`[${PLUGIN_NAME}] ✓ 可视化模块已加载`);
            }
        }
        async waitForST() { return new Promise(resolve => { const check = () => { if (window.SillyTavern?.getContext) resolve(); else setTimeout(check, 100); }; check(); }); }
        registerEvents() {
            // [v1.2 真机适配修复] 原实现监听 'message_received' 自定义事件，
            // 标准 SillyTavern 中不存在该事件，导致提取链路从不触发。
            // 正确方式：通过 SillyTavern 的 eventSource + event_types 注册。
            this.eventHandlers = []; // 记录已注册事件，供卸载清理

            try {
                const ctx = window.SillyTavern?.getContext?.();
                const eventSource = ctx?.eventSource
                    || (typeof eventSource !== 'undefined' ? eventSource : null);
                const types = ctx?.event_types
                    || (typeof event_types !== 'undefined' ? event_types : null);

                if (!eventSource || !types?.MESSAGE_RECEIVED) {
                    console.warn(`[${PLUGIN_NAME}] eventSource 不可用，事件监听未注册（仅手动模式可用）`);
                    return;
                }

                // MESSAGE_RECEIVED 回调参数是 messageId，需要从 chat 数组取消息对象
                eventSource.on(types.MESSAGE_RECEIVED, (messageId) => {
                    try {
                        const c = window.SillyTavern?.getContext?.();
                        const message = c?.chat?.[messageId];
                        if (message) this.engine.onMessageReceived(message, messageId);
                    } catch (err) {
                        console.error(`[${PLUGIN_NAME}] 消息处理失败:`, err);
                    }
                });
                this.eventHandlers.push({ eventSource, type: types.MESSAGE_RECEIVED });

                // CHAT_CHANGED：切换对话时重新加载对应数据
                if (types.CHAT_CHANGED) {
                    eventSource.on(types.CHAT_CHANGED, async () => {
                        try {
                            const chatId = this.engine.getCurrentChatId();
                            if (chatId) await this.engine.storage.load(chatId);
                        } catch (err) {
                            console.error(`[${PLUGIN_NAME}] 对话切换加载失败:`, err);
                        }
                    });
                    this.eventHandlers.push({ eventSource, type: types.CHAT_CHANGED });
                }

                // [v1.2] GENERATION_STARTED：生成前注入记忆（主注入路径）
                if (types.GENERATION_STARTED) {
                    eventSource.on(types.GENERATION_STARTED, async () => {
                        try {
                            const injection = await this.engine.onBeforeGeneration();
                            if (injection) {
                                const c = window.SillyTavern?.getContext?.();
                                if (c?.setExtensionPrompt) {
                                    // depth=1 较浅位置, scan=true, role=4 (system)
                                    c.setExtensionPrompt('lonsha_memory', injection, 1, true, 4);
                                }
                            }
                        } catch (err) {
                            console.error(`[${PLUGIN_NAME}] 生成前注入失败:`, err);
                        }
                    });
                    this.eventHandlers.push({ eventSource, type: types.GENERATION_STARTED });
                }

                console.log(`[${PLUGIN_NAME}] ✓ 事件监听已注册 (MESSAGE_RECEIVED${types.CHAT_CHANGED ? ' + CHAT_CHANGED' : ''}${types.GENERATION_STARTED ? ' + GENERATION_STARTED' : ''})`);
            } catch (err) {
                console.error(`[${PLUGIN_NAME}] 事件注册异常:`, err);
            }
        }

        // 插件卸载时清理事件监听
        unregisterEvents() {
            if (!this.eventHandlers) return;
            for (const { eventSource, type } of this.eventHandlers) {
                try { eventSource.removeListener?.(type); } catch {}
                try { eventSource.off?.(type); } catch {}
            }
            this.eventHandlers = [];
        }
        createUI() {
            const fab = document.createElement('div');
            fab.id = 'lonsha-memory-fab'; fab.innerHTML = '🧠';
            fab.style.cssText = 'position:fixed;bottom:80px;right:20px;width:50px;height:50px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:10000;transition:transform 0.2s;';
            fab.addEventListener('click', () => this.showPanel());
            fab.addEventListener('mouseenter', () => fab.style.transform = 'scale(1.1) rotate(5deg)');
            fab.addEventListener('mouseleave', () => fab.style.transform = 'scale(1)');
            document.body.appendChild(fab);
        }
        showPanel() {
            // 设置面板模块 (settings-ui.js) 会覆盖 showFabMenu 提供完整菜单；
            // 此处为兜底：模块未加载时提示
            if (this.showFabMenu && this._settingsUIMounted) return this.showFabMenu();
            const stats = {nodes: this.engine.graph.nodes.size, edges: this.engine.graph.edges.size, vectors: this.engine.vector.vectors.length};
            alert(`LonSha记忆引擎 v${VERSION}\n\n图谱节点: ${stats.nodes} | 关系边: ${stats.edges} | 向量: ${stats.vectors}\n\n⚠️ 设置面板模块未加载（检查 settings-ui.js）\n🔧 调试: window.LonShaMemory`);
        }
    }
    
    // [v1.2 真机适配修复] 原实现是空占位 async chat => chat，记忆注入从不发生。
    // 保留 interceptor 作为兼容入口（部分 ST 版本通过 manifest generate_interceptor 调用），
    // 主注入路径改为 GENERATION_STARTED 事件 + setExtensionPrompt（ST 标准注入方式）。
    window.lonsha_memory_interceptor = async (chat, ...args) => {
        try {
            const injection = await plugin.engine.onBeforeGeneration();
            if (injection) {
                const c = window.SillyTavern?.getContext?.();
                if (c?.setExtensionPrompt) {
                    c.setExtensionPrompt('lonsha_memory', injection, 1, 4);
                } else if (Array.isArray(chat) && chat.length > 0 && chat[0]) {
                    // 降级：注入到 system 消息尾部
                    chat[0].mes = (chat[0].mes || '') + injection;
                }
            }
        } catch (err) {
            console.error(`[${PLUGIN_NAME}] 记忆注入失败:`, err);
        }
        return chat;
    };
    const plugin = new LonShaMemoryPlugin();
    plugin.init().catch(err => console.error(`[${PLUGIN_NAME}] 初始化失败:`, err));
    window.LonShaMemory = plugin;
})();
