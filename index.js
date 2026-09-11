(function() {
    'use strict';
    const PLUGIN_NAME = 'LonSha记忆引擎';
    const VERSION = '2.4.0';
    
    class ConfigManager {
        constructor() {
            this.config = {
                enabled: true,
                extractionEnabled: true,
                vectorEnabled: true,
                graphDiffusionEnabled: true,
                autoSave: true,
                maxSummaryLength: 200,
                extractionPrompt: `你是剧情记忆整理员。阅读【本轮对话】，对照【已知角色名单】、【前情提要】与【悬念簿】，只提取明确发生的事实，禁止编造与推测。
【已知角色名单】（提取角色必须复用这些主名；识别出别名/昵称/代称时，归并到对应主名）
{{KNOWN_CHARS}}
【前情提要】（此前剧情摘要，仅供理解上下文，禁止重复提取其中已记录的内容）
{{HISTORY}}
【悬念簿】（此前立下但尚未了结的约定/伏笔/未解之谜。若本轮有进展或了结，必须在 plans.resolve 中登记；禁止重复提取已了结项）
{{SUSPENSE}}
【已知场景树】（location/scenes.path 必须使用这些已登记路径，或在其下新增更细一层）
{{SCENES}}
【本轮对话】
{{CONTENT}}
【提取规则】
1. characters：本轮实际登场、有名有戏份的角色。必须使用已知角色名单中的主名（别名归并）；纯路人忽略；不要把用户本人算进去。
2. events：只写已发生的事实。涉及约定、承诺、冲突、物品交付、地点移动、关系变化时，写清具体内容，禁止泛化成"某物""发生变化"。每个事件标注 scope："objective"（公开事实，所有在场角色都知道）或 "pov"（仅某角色亲眼看到/独自知道的事实，此时必须给出 owner=该角色主名）。
3. relationships：单向主观关系（from 看 to）。A看B 与 B看A 可能不同，分别各记一条。type 用简短词（如：暗恋、警惕、依赖、挚友、敌视）。attitude 只能填 positive / negative / neutral。
4. summary（最重要，必填）：用【监控摄像头视角】+【警察做笔录风格】重写本轮剧情，30-80字。必须包含：①谁对谁做了/说了什么（写具体动作或台词大意）②明确写出的状态变化③新信息或结果。时间锚定：保留具体人名、物品名、地点名。严禁照抄原文句子（必须用你自己的话重新组织）；严禁氛围描写（"气氛变得…"）和阅读理解句式（"体现了…的心态"）；严禁剧情续写（止步于原文最后一个动作）。纯叙述句，无 markdown。
5. story_date：本轮剧情中明确写出的日期（如"3月12日""2026年5月1日"）；未明确写出则填 null。禁止编造日期。
6. pov_memories：本轮产生的角色私密认知/秘密/内心独白（摄像头拍不到、仅该角色自己知道的内容）。每条必须给出 owner（哪个角色知道）和 content（一句话说清）。已在对话中公开说出口的内容不算。没有则填空数组。
7. plans：本轮剧情中【新出现】的约定、目标、伏笔或未解之谜。kind 填 "plan"（角色主动要做的事）或 "suspense"（埋下的谜团/伏笔）。content 一句话写清。contentIsNew 必须为 true。没有新悬念则填空数组。禁止把悬念簿里已有的悬项重复登记。
8. plans.resolve：本轮【了结】了悬念簿里的悬项时填写。id 必须使用【悬念簿】中列出的编号（如 s3）。outcome 填 "done"（真做成/真揭晓）或 "cancelled"（被取消/放弃/作废）或 "failed"（尝试了但失败/以坏结局收场）。reason 一句话写明怎么收场的。没有则填空数组。
9. scenes：本轮【新出现】或【描述变化】的地点。action 填 "add"（新地点）或 "update"（更新描述）。path 是由大到小的数组（如 ["城市","街区","店铺"]，最多3层，末级=具体场所）。没有则填空数组。
10. location：本轮剧情结束时主角所在的场景完整路径（必须用已登记场景路径之一；移动了才填，没动填 null）。
11. 只输出一个 JSON 对象，不得输出解释或代码块围栏。字符串内含英文双引号时转义为 \\\"，中文引号直接用。
【输出格式】
{"characters": ["角色名"], "events": [{"type": "事件类型", "description": "描述", "scope": "objective", "owner": ""}], "relationships": [{"from": "A", "to": "B", "type": "关系", "attitude": "positive"}], "summary": "概括", "story_date": null, "pov_memories": [{"owner": "角色A", "content": "只有A知道的秘密"}], "status_changes": [{"character": "角色名", "field": "好感", "delta": 5, "value": null, "reason": "原因"}], "todos": [{"character": "角色名", "text": "待办事项", "date": "3月15日"}], "plans": [{"kind": "plan", "content": "新立下的约定或目标", "contentIsNew": true}], "plans_resolve": [{"id": "s3", "outcome": "done", "reason": "如何了结的"}], "scenes": [{"action": "add", "path": ["城市", "街区", "店铺"], "desc": "一句话描述"}], "location": null}`,
                // [v2.2] RC: plans=本轮新出现的约定/伏笔/谜团（kind: plan|suspense），plans_resolve=了结悬念簿悬项（id用悬念簿编号，outcome: done|cancelled|failed）。无则空数组。
                // [v2.4] RE: scenes=新出现/变化地点（action add|update，path 由大到小数组）；location=本轮结束主角所在场景路径（未动填 null）；status_changes 里角色位置变化用 field:"位置"（value=场景末级名）。
                // [v2.0] status_changes: delta=数值增减(可负)，value=直接设绝对值，二选一；field 用简短中文（好感/疲劳/心情/健康/信任/金钱等）。todos: date 是剧情中明确出现的日期，无则空字符串。无变化填空数组。
                // [v2.0] status_changes: delta=数值增减(可负)，value=直接设绝对值，二选一；field 用简短中文（好感/疲劳/心情/健康/信任/金钱等）。todos: date 是剧情中明确出现的日期，无则空字符串。无变化填空数组。
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
                timelineWindowDays: 3,      // 时间线召回时间窗（天）
                // [v1.9] P1: 层级摘要折叠 + BM25 稀疏检索
                summaryFoldEnabled: true,   // 摘要超阈值自动折叠成卷摘要
                summaryFoldThreshold: 30,   // 触发折叠的活跃摘要条数
                summaryFoldBatchSize: 20,   // 每批折叠条数
                bm25Enabled: true,          // BM25 稀疏检索（词频×逆文档频率）
                bm25TopK: 5,                // BM25 每轮召回条数
                // [v2.0] P2: 角色状态表 + 楼层账本
                characterStateEnabled: true,   // 角色数值状态追踪（好感/疲劳/心情等）
                todoTrackingEnabled: true,     // 待办事项追踪（带剧情日期，过期自动清理）
                todoExpiryMinutes: 60,         // 待办过期延迟（分钟）
                floorLedgerEnabled: true,      // 楼层账本（删楼/重生成自动回滚记忆）
                // [v2.1] P3: 互斥锁 + 上下文预算 + 节日感知
                extractionLockEnabled: true,   // 提取互斥（防并发写坏数据）
                injectionBudget: 3000,         // 注入简报字符预算（超预算自动裁剪）
                budgetStrategy: 'balanced',    // 预算策略: balanced | recency | relevance
                holidayAware: true,            // 节日感知（剧情日期临近节日时增强相关记忆）
                // [v2.2] RC: 悬念簿 + 相对时间
                suspenseEnabled: true,         // 悬念簿（约定/伏笔/未解之谜，三态了结防复读）
                suspenseMaxOpen: 20,           // 悬念簿在追踪上限（超出最旧的自动沉降）
                relativeTime: true,            // 剧情时间线注入加相对时间前缀（如"3天前·3月12日"）
                // [v2.3] RD: rerank 精排（抄 baibai 两阶段检索）
                rerankEnabled: false,          // LLM 精排召回结果（需配独立API，延迟+费用换精度）
                rerankApiUrl: '',
                rerankApiKey: '',
                rerankModel: '',
                rerankCandidates: 12,          // 进入精排的候选数
                // [v2.4] RE: 场景树 + 在场分档 + 查询重写
                sceneEnabled: true,            // 场景地图树（由大到小路径层级，注入当前场景）
                presenceInjection: true,       // 不在场角色分档注入（防凭空出现）
                queryRewrite: false            // 生成前用小模型重写检索查询（需API，提升召回命中）
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
        // [v2.4] RE: 查询重写（抄 baibai rewriteQuery——把最近剧情改写成检索意图，失败返回 null 降级）
        async rewriteQuery(recentText) {
            try {
                if (!this.config.config.queryRewrite) return null;
                const cfg = this.config.config;
                const prompt = `把下面的剧情进展改写成 1-3 条适合检索历史记忆的短查询（每条一行，只写关键人名/地点/物件/事件词，去掉口语与修饰）。只输出查询行，不要解释。\n${String(recentText || '').substring(0, 600)}`;
                let raw = null;
                if (cfg.apiProviderCustom && cfg.apiUrl && cfg.apiKey) {
                    raw = await this.callOpenAI(prompt, cfg.apiUrl, cfg.apiKey, cfg.apiModel);
                } else {
                    const ctx = window.SillyTavern?.getContext?.();
                    const quiet = ctx?.generateQuietPrompt;
                    if (typeof quiet !== 'function') return null;
                    raw = await quiet({ quietPrompt: prompt, quietToLoud: false, skipWIAN: false });
                    if (!raw) raw = await quiet(prompt, false, false);
                }
                if (!raw) return null;
                const lines = String(raw).split('\n').map(s => s.replace(/^[-•\d.、\s]+/, '').trim()).filter(s => s.length >= 2 && s.length <= 40).slice(0, 3);
                return lines.length ? lines : null;
            } catch (e) { return null; }
        }
        // [v2.3] RD: rerank 精排——小模型把候选按与查询的相关度重排。失败返回 null (调用方静默降级)
        async rerank(query, docs) {
            try {
                const cfg = this.config.config;
                const url = cfg.rerankApiUrl || cfg.apiUrl;
                const key = cfg.rerankApiKey || cfg.apiKey;
                const model = cfg.rerankModel || cfg.apiModel;
                if (!cfg.rerankEnabled || !url || !key) return null;
                const list = docs.map((d, i) => `[${i + 1}] ${(d.text || d.summary || d.name || '').substring(0, 150)}`).join('\n');
                const prompt = `你是检索精排器。给定【查询】和编号候选列表，按与查询的相关度从高到低输出候选编号。只输出JSON数组（如 ["3","1","7"]），不要解释。可以只输出明显相关的编号（无关的不要收录）。
【查询】${String(query || '').substring(0, 300)}
【候选】\n${list}`;
                let raw = null;
                if (cfg.apiProviderCustom && url && key) {
                    raw = await this.callOpenAI(prompt, url, key, model);
                } else {
                    const ctx = window.SillyTavern?.getContext?.();
                    const quiet = ctx?.generateQuietPrompt;
                    if (typeof quiet !== 'function') return null;
                    raw = await quiet({ quietPrompt: prompt, quietToLoud: false, skipWIAN: false });
                    if (!raw) raw = await quiet(prompt, false, false);
                }
                if (!raw) return null;
                const m = String(raw).match(/\[[\s\S]*?\]/);
                if (!m) return null;
                const order = JSON.parse(m[0]);
                if (!Array.isArray(order) || !order.length) return null;
                return order.map(x => Number(x) - 1).filter(i => i >= 0 && i < docs.length);
            } catch (e) { return null; }
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
            // [v1.9] P1
            this.bm25 = new BM25();
            // [v2.0] P2
            this.status = new CharacterState();
            this.ledger = new FloorLedger();
            // [v2.1] P3
            this.mutex = new Mutex();
            this.holiday = new HolidayAware();
            // [v2.2] RC
            this.suspense = new SuspenseBook();
            // [v2.4] RE
            this.scene = new SceneBook();
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
            // [v2.1] P3: 提取互斥（抄 hcdiary cdBusy——防并发提取写坏数据）
            if (this.config.config.extractionLockEnabled) {
                const acquired = await this.mutex.acquire();
                if (!acquired) {
                    if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 提取锁排队超时，跳过本轮`);
                    return;
                }
            }
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

                // [v2.2] RC: 悬念簿（新悬项登记 + 了结核销 + 超限沉降）
                if (this.config.config.suspenseEnabled && extracted) {
                    try {
                        let susN = 0;
                        for (const pl of (extracted.plans || [])) {
                            if (pl && pl.contentIsNew !== false && pl.content) {
                                if (this.suspense.add(pl.kind, pl.content, message.index || 0, extracted.story_date || null)) susN++;
                            }
                        }
                        let resN = 0;
                        for (const pr of (extracted.plans_resolve || [])) {
                            if (pr && (pr.id || pr.content)) {
                                if (this.suspense.resolve(pr.id || pr.content, pr.outcome, pr.reason, message.index || 0)) resN++;
                            }
                        }
                        const pruned = this.suspense.prune(this.config.config.suspenseMaxOpen || 20);
                        if ((susN || resN || pruned) && this.config.config.debugMode) {
                            console.log(`[${PLUGIN_NAME}] 悬念簿: +${susN} 新增, ${resN} 了结, ${pruned} 沉降`);
                        }
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 悬念簿处理失败:`, e); }
                }

                // [v2.4] RE: 场景树（新地点登记 + 位置追踪）
                if (this.config.config.sceneEnabled && extracted) {
                    try {
                        const scN = this.scene.apply(extracted.scenes, message.index || 0);
                        if (extracted.location) this.scene.setLocation(message.index || 0, extracted.location);
                        if ((scN || extracted.location) && this.config.config.debugMode) {
                            console.log(`[${PLUGIN_NAME}] 场景树: +${scN} 地点, 位置=${SceneBook.keyOf(extracted.location) || '未变'}`);
                        }
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 场景树处理失败:`, e); }
                }

                // [v2.0] P2: 角色状态 + 待办 + 楼层账本
                const floor = message.index || 0;
                const nodesBefore = this.graph.nodes.size;
                if (this.config.config.characterStateEnabled && extracted?.status_changes) {
                    try {
                        const n = this.status.applyChanges(extracted.status_changes, floor);
                        if (n && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 状态更新 ${n} 项`);
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 状态写入失败:`, e); }
                }
                if (this.config.config.todoTrackingEnabled && extracted?.todos) {
                    try {
                        this.status.addTodos(extracted.todos, floor);
                    } catch (e) {}
                }
                if (this.config.config.todoTrackingEnabled) {
                    try {
                        const sd = this.getLatestStoryDate();
                        if (sd) this.status.pruneTodos(sd, this.config.config.todoExpiryMinutes || 60);
                    } catch (e) {}
                }
                if (this.config.config.floorLedgerEnabled) {
                    try {
                        const allIds = Array.from(this.graph.nodes.keys());
                        this.ledger.record(floor, {
                            nodeIds: allIds.slice(nodesBefore),
                            povIds: this.pov.povs.filter(p => p.floor === floor).map(p => p.id),
                            timelineIds: this.timeline.entries.filter(t => t.floor === floor).map(t => t.id)
                        });
                    } catch (e) {}
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
                
                // [v1.9] P1: BM25 索引重建 + 层级摘要折叠
                if (this.config.config.bm25Enabled) {
                    try {
                        this.bm25.rebuild(this.summary.getActiveSummaries().map(s => ({id: 'sum_' + s.floor, text: s.text, floor: s.floor, source: 'bm25'})));
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] BM25重建失败:`, e); }
                }
                if (this.config.config.summaryFoldEnabled) {
                    try { await this.summary.maybeFold(this.config.config, this.llm); } catch (e) {}
                }

                // [v2.2] RB: 楼层提交盖章 → 桥同步手机侧楼层状态 (幂等)
                try {
                    const rb = window.VirtualPhone?.lonshaBridge;
                    if (rb?.onFloorCommitted) rb.onFloorCommitted(message.index || 0);
                } catch (e) {}
                if (this.config.config.autoSave) {
                    await this.storage.save(chatId, {
                        graph: this.graph.export(),
                        summaries: this.summary.export(),
                        diaries: this.diary.export(),
                        vectors: this.vector.export(),
                        povs: this.pov.export(),
                        timeline: this.timeline.export(),
                        status: this.status.export(),
                        ledger: this.ledger.export(),
                        suspense: this.suspense.export(),
                        scene: this.scene.export(),
                        version: VERSION
                    });
                }
                
                console.log(`[${PLUGIN_NAME}] ✓ 完成 (${extracted?.characters?.length || 0}角色, ${extracted?.events?.length || 0}事件, 向量=${this.vector.vectors.length})`);
            } catch (err) {
                console.error(`[${PLUGIN_NAME}] ✗ 失败:`, err);
            } finally {
                if (this.config.config.extractionLockEnabled) this.mutex.release();
            }
        }
        
        async extractMemoryWithLLM(message) {
            if (!this.config.config.extractionEnabled) return this.extractMemorySimple(message);
            try {
                const content = (message.mes || '').substring(0, 2000);
                // [v1.5] 抄 HCDiary：注入已知角色名单 + 前情提要（记忆回环）
                const knownChars = this.getKnownCharacters();
                const history = this.summary.getActiveSummaries().slice(-5).map(s => s.text).join('\n');
                const volText = (this.summary.volumes || []).slice(-2).map(v => `【卷${v.floorStart}-${v.floorEnd}】${v.text}`).join('\n');
                const historyFull = [volText, history].filter(Boolean).join('\n');
                const prompt = this.config.config.extractionPrompt
                    .replace('{{KNOWN_CHARS}}', knownChars.join('、') || '（暂无，从本轮开始积累）')
                    .replace('{{HISTORY}}', historyFull || '（暂无）')
                    .replace('{{SUSPENSE}}', (this.config.config.suspenseEnabled && this.suspense.openItems().length) ? this.suspense.briefForPrompt() : '（暂无未了结的悬念）')
                    .replace('{{SCENES}}', (this.config.config.sceneEnabled && this.scene.nodes.size) ? this.scene.brief() : '（暂无已登记场景）')
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
                // [v2.4] RE: 召回价值判断（抄 baibai recallWorthRunning——剧情全在窗口内时跳过，省额度）
                if (!this.recallWorthRunning()) return '';
                // [v2.4] RE: 查询重写——把最近剧情改写成多条检索查询，主查询之外追加多路
                try {
                    const qs = await this.llm.rewriteQuery(query.text);
                    if (qs && qs.length) query.queries = qs;
                } catch (e) {}
                const recalled = await this.recallMemory(query);
                return this.buildInjection(recalled);
            } catch (err) {
                return '';
            }
        }
        // [v2.4] RE: 是否值得跑召回——最近5楼就在全部对话里(无更早历史)则没有可召回的旧事
        recallWorthRunning() {
            try {
                const chat = window.SillyTavern?.getContext?.()?.chat || [];
                const aiFloors = chat.filter(m => !m.is_user).length;
                if (aiFloors <= 5) return false;   // 几乎全部在上下文窗口内
                return true;
            } catch (e) { return true; }
        }
        
        async recallMemory(query) {
            const results = {summary: [], graph: [], diary: [], vector: [], diffusion: [], pov: [], timeline: [], bm25: [], volume: [], status: [], holiday: [], suspense: [], presence: []};
            
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
            
            // [v2.4] RE: 多查询召回——主查询 + rewriteQuery 改写的查询分别检索，结果并入同一路（RRF 会融合）
            if (this.config.config.vectorEnabled && query.text) {
                const vectorResults = await this.vector.search(query.text, this.config.config.vectorTopK);
                results.vector = vectorResults.map(v => ({
                    text: v.text,
                    score: v.score,
                    metadata: v.metadata,
                    source: 'vector'
                }));
                if (Array.isArray(query.queries) && query.queries.length) {
                    for (const q2 of query.queries) {
                        try {
                            const more = await this.vector.search(q2, 3);
                            for (const v of more) results.vector.push({text: v.text, score: v.score * 0.9, metadata: v.metadata, source: 'vector'});
                        } catch (e) {}
                    }
                }
            }
            
            // [v1.9] P1: BM25 稀疏检索召回
            if (this.config.config.bm25Enabled && this.bm25.N && query.text) {
                try {
                    results.bm25 = this.bm25.search(query.text, this.config.config.bm25TopK || 5)
                        .map(d => ({id: d.id, text: d.text, floor: d.floor, score: d.score, source: 'bm25'}));
                    if (Array.isArray(query.queries) && query.queries.length) {
                        const seenB = new Set(results.bm25.map(x => x.id));
                        for (const q2 of query.queries) {
                            for (const d of this.bm25.search(q2, 3)) {
                                if (!seenB.has(d.id)) { seenB.add(d.id); results.bm25.push({id: d.id, text: d.text, floor: d.floor, score: d.score, source: 'bm25'}); }
                            }
                        }
                    }
                } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] BM25检索失败:`, e); }
            }
            // [v1.9] P1: 卷摘要召回（已折叠的高层概括）
            if (this.config.config.summaryFoldEnabled && this.summary.volumes.length) {
                results.volume = this.summary.searchVolumes(2)
                    .map(v => ({id: v.id, text: `【卷${v.floorStart}-${v.floorEnd}】${v.text}`, floor: v.floorStart, source: 'volume'}));
            }
            
            // [v2.1] P3: 节日感知召回（剧情日期临近节日时，用节日关键词召回相关记忆）
            if (this.config.config.holidayAware) {
                try {
                    const sd = this.getLatestStoryDate();
                    const h = sd ? this.holiday.current(sd) : null;
                    if (h) {
                        const kw = this.holiday.keywords(h.name);
                        const kwHits = [];
                        if (kw.length) {
                            for (const s of this.summary.getActiveSummaries()) {
                                if (kw.some(k => s.text.includes(k))) kwHits.push({id: 'hol_' + s.floor, text: s.text, floor: s.floor, holiday: h.name, source: 'holiday'});
                            }
                            results.holiday = kwHits.slice(0, 3);
                        }
                        if (this.config.config.debugMode && h) console.log(`[${PLUGIN_NAME}] 🎉 节日感知: ${h.name} (偏移${h.offsetDays}天)`);
                    }
                } catch (e) {}
            }
            
            // [v2.0] P2: 角色状态召回（只取当前登场角色）
            if (this.config.config.characterStateEnabled && Object.keys(this.status.characters || {}).length) {
                const presentCast = this.captureCast();
                const owners = presentCast.length ? presentCast : (window.SillyTavern?.getContext?.()?.name2 ? [window.SillyTavern.getContext().name2] : []);
                if (owners.length) {
                    results.status = this.status.searchByNames(owners, 5).map(r => ({
                        name: r.name, fields: r.fields, todos: r.todos, source: 'status'
                    }));
                }
            }
            
            // [v1.8] P0: 剧情时间线召回（按剧情日期相近度）
            if (this.config.config.plotTimeline && this.timeline.entries.length) {
                const anchorDate = this.getLatestStoryDate();
                if (anchorDate) {
                    const relOn = this.config.config.relativeTime !== false;
                    results.timeline = this.timeline.searchNear(anchorDate, this.config.config.timelineWindowDays, 5)
                        .map(e => {
                            // [v2.2] RC: 相对时间前缀（"3天前·3月12日"），解析失败不加（宁可不标绝不标错）
                            let rel = '';
                            if (relOn) {
                                try { rel = relativePrefix(e.date, anchorDate); } catch (err) { rel = ''; }
                            }
                            return {id: e.id, text: `[${rel ? rel + '·' : ''}${e.date}] ${e.text}`, date: e.date, floor: e.floor, source: 'timeline'};
                        });
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
            
            // [v2.4] RE: 在场分档——不在场已登场角色给极简档（防 AI 让不在场的人凭空出现）
            if (this.config.config.presenceInjection) {
                try {
                    const castNow = castCaptured.length ? castCaptured : query.characters || [];
                    const absent = this.getKnownCharacters()
                        .filter(n => !castNow.includes(n))
                        .map(n => {
                            const loc = this.status?.characters?.[n]?.fields?.['位置'];
                            return { name: n, loc: loc || null };
                        })
                        .slice(0, 6);
                    results.presence = absent.map(a => ({
                        id: 'abs_' + a.name, text: a.loc ? `${a.name}（现在: ${a.loc}，不在场）` : `${a.name}（不在场）`,
                        source: 'presence'
                    }));
                } catch (e) {}
            }
            
            // [v2.2] RC: 悬念簿召回（未了结悬项 + 近期了结，防 AI 把办完的事反复提/把伏笔写丢）
            if (this.config.config.suspenseEnabled && this.suspense.items.length) {
                try {
                    const openList = this.suspense.openItems().slice(0, 8).map(x => ({
                        id: x.id, text: `${x.kind === 'suspense' ? '未解之谜' : '约定/目标'}（第${x.floor != null ? x.floor + '楼立下' : '早期'}）: ${x.content}`,
                        floor: x.floor, source: 'suspense'
                    }));
                    const resolvedList = this.suspense.recentlyResolved(3).map(x => ({
                        id: x.id, text: `已了结[${x.outcome === 'done' ? '完成' : x.outcome === 'cancelled' ? '取消' : '失败'}]${x.resolvedReason ? '：' + x.resolvedReason : ''} — 原项: ${x.content}`,
                        floor: x.resolvedFloor, source: 'suspense'
                    }));
                    results.suspense = openList.concat(resolvedList);
                } catch (e) {}
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
            
            // [v2.3] RD: 两阶段精排 (抄 baibai recall: 多路粗召回 → LLM rerank 精排)
            const merged = this.hybridMerge(results);
            if (this.config.config.rerankEnabled && merged.length > 3 && query.text) {
                try {
                    const candN = this.config.config.rerankCandidates || 12;
                    const candidates = merged.slice(0, candN);
                    const rest = merged.slice(candN);
                    const order = await this.llm.rerank(query.text, candidates);
                    if (order && order.length) {
                        const picked = order.map(i => candidates[i]).filter(Boolean);
                        const restSet = new Set(candidates.filter((_, i) => !order.includes(i)));
                        return [...picked, ...restSet, ...rest];
                    }
                } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] rerank失败(降级):`, e); }
            }
            return merged;
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
                results.pov || [],
                results.bm25 || [],
                results.volume || [],
                results.status || [],
                results.holiday || [],
                results.suspense || [],
                results.presence || []
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
                        source: prev?.source ? prev.source + '+' : ['vector','diffusion','graph','summary','diary','rubyphone','timeline','pov','bm25','volume','status','holiday','suspense','presence'][listIdx]
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
            return {text, characters: this.extractCharactersFromContext(text), queries: null};
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
            const summaries = [], relations = [], diaries = [], phoneMem = [], timelines = [], povs = [], volumes = [], bm25Hits = [], statuses = [], holidays = [], suspenses = [];
            for (const item of recalled.slice(0, this.config.config.vectorTopK * 2)) {
                if (item.source === 'status') statuses.push(item);
                else if (item.source === 'suspense') suspenses.push(item);
                else if (item.source?.includes('holiday')) holidays.push(item);
                else if (item.source?.includes('volume')) volumes.push(item);
                else if (item.source === 'bm25') bm25Hits.push(item);
                else if (item.source?.includes('pov')) povs.push(item);
                else if (item.source?.includes('timeline')) timelines.push(item);
                else if (item.source?.includes('rubyphone')) phoneMem.push(item);
                else if (item.source?.includes('diary')) diaries.push(item);
                else if (item.source?.includes('graph')) relations.push(item);
                else summaries.push(item);
            }
            
            const blocks = [];
            if (volumes.length) {
                blocks.push('[早前剧情概括·卷]');
                const seenV = new Set();
                volumes.forEach(i => {
                    const key = i.text || '';
                    if (seenV.has(key)) return;
                    seenV.add(key);
                    blocks.push(`- ${key}`);
                });
            }
            if (summaries.length) {
                blocks.push('[前情摘要]');
                summaries.forEach(i => blocks.push(`- ${i.text || i.summary || i.name || ''}`));
            }
            if (bm25Hits.length) {
                const seenB = new Set((summaries.length ? summaries : []).map(x => x.text));
                const fresh = bm25Hits.filter(b => !seenB.has(b.text));
                if (fresh.length) {
                    blocks.push('[相关片段·关键词命中]');
                    fresh.forEach(i => blocks.push(`- ${i.text || ''}`));
                }
            }
            if (statuses.length) {
                blocks.push('[角色状态]');
                statuses.forEach(s => {
                    const fieldText = (s.fields || []).map(([k, v]) => `${k}:${v}`).join(' | ');
                    const todoText = (s.todos || []).length ? `；待办: ${s.todos.map(t => (t.date ? `${t.date} ` : '') + t.text).join('、')}` : '';
                    blocks.push(`- ${s.name}${fieldText ? ' — ' + fieldText : ''}${todoText}`);
                });
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
            const scenesList = [], presenceList = [];
            for (const item of recalled.slice(0, this.config.config.vectorTopK * 2)) {
                if (item.source === 'scene') scenesList.push(item);
                else if (item.source === 'presence') presenceList.push(item);
            }
            if (this.config.config.sceneEnabled) {
                try {
                    const cur = this.scene.currentKey();
                    if (cur) {
                        const chain = this.scene.chainOf(cur);
                        if (chain.length) {
                            blocks.push('[当前场景]');
                            const line = chain.map(n => n.path[n.path.length - 1] + (n.desc ? `（${n.desc}）` : '')).join(' › ');
                            blocks.push(`- ${line}`);
                        }
                    }
                } catch (e) {}
            }
            if (scenesList.length) {
                blocks.push('[相关地点]');
                scenesList.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (presenceList.length) {
                blocks.push('〔不在场角色｜未经剧情发展不得让他们凭空出现或立即知晓场内发生的事〕');
                presenceList.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (suspenses.length) {
                blocks.push('[悬念簿]');
                const seenS = new Set();
                suspenses.forEach(i => {
                    const key = i.text || '';
                    if (seenS.has(key)) return;
                    seenS.add(key);
                    blocks.push(`- ${key}`);
                });
            }
            if (holidays.length) {
                blocks.push(`〔剧情时间临近 ${holidays[0].holiday}｜氛围提示，可自然融入但不强求〕`);
                const seenH = new Set();
                holidays.forEach(i => {
                    const key = i.text || '';
                    if (seenH.has(key)) return;
                    seenH.add(key);
                    blocks.push(`- ${key}`);
                });
            }
            
            if (!blocks.length) return '';
            let full = `\n\n${NOTE}\n${blocks.join('\n')}\n${END}\n`;
            // [v2.1] P3: 注入预算裁剪（抄 stbme context-window：超预算优先保近期/相关）
            const budget = this.config.config.injectionBudget || 3000;
            if (full.length > budget) {
                const strategy = this.config.config.budgetStrategy || 'balanced';
                if (strategy === 'relevance') {
                    // 只保留 RRF 得分最高的（已排序，前 60% 内容）
                    const slice = Math.floor(blocks.length * 0.6);
                    const kept = blocks.slice(0, Math.max(3, slice));
                    full = `\n\n${NOTE}\n${kept.join('\n')}\n${END}\n`;
                } else if (strategy === 'recency') {
                    // 保留时间线/POV/状态等"近期"分区，砍掉早前概括与 BM25
                    const keepTypes = ['剧情时间线', '角色状态', 'POV', '手机生活记忆', '前情摘要', '节日'];
                    const kept = blocks.filter(b => keepTypes.some(k => b.startsWith('[' + k) || b.includes(k)));
                    full = kept.length ? `\n\n${NOTE}\n${kept.join('\n')}\n${END}\n` : full.slice(0, budget);
                } else {
                    // balanced：整体截断到预算
                    full = full.slice(0, budget);
                }
                if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 注入预算裁剪: ${budget} 字符`);
            }
            return full;
        }
        
        // [v2.0] P2: 楼层账本回滚（删楼/重生成后把该楼层产生的记忆撤掉）
        rollbackFloor(floor) {
            try {
                if (!this.config.config.floorLedgerEnabled) return 0;
                const entry = this.ledger.get(floor);
                if (!entry) return 0;
                // 回滚节点（该楼新增的图谱节点）
                for (const id of (entry.nodeIds || [])) {
                    this.graph.nodes.delete(id);
                    this.graph.nameIndex.clear();
                }
                // 回滚 POV
                const povIdSet = new Set(entry.povIds || []);
                this.pov.povs = this.pov.povs.filter(p => !povIdSet.has(p.id));
                // 回滚时间线
                const tlIdSet = new Set(entry.timelineIds || []);
                this.timeline.entries = this.timeline.entries.filter(t => !tlIdSet.has(t.id));
                // [v2.3] RD: 状态回滚改为事件溯源范式——删 ops 真源 → 重放重建 (不再依赖字段级补偿)
                try {
                    if (this.status?.ops?.length) {
                        this.status.ops = this.status.ops.filter(o => o.floor < floor);
                        this.status.rebuildFromOps();
                    }
                } catch (e) {}
                // [v2.4] RE: 场景树回滚（真源过滤+重放）
                try {
                    if (this.config.config.sceneEnabled && this.scene?.opsLog?.length) this.scene.rollbackFrom(floor);
                } catch (e) {}
                // [v2.2] RC: 回滚该楼层登记/了结的悬念簿条目
                try {
                    if (this.suspense.items.length) {
                        const before = this.suspense.items.length;
                        this.suspense.items = this.suspense.items.filter(x => x.floor !== floor && x.resolvedFloor !== floor);
                        if (this.suspense.items.length !== before && this.config.config.debugMode) {
                            console.log(`[${PLUGIN_NAME}] 悬念簿回滚: 清除 ${before - this.suspense.items.length} 条 (楼层 ${floor})`);
                        }
                    }
                } catch (e) {}
                // 回滚该楼层摘要
                this.summary.summaries = this.summary.summaries.filter(s => s.floor !== floor);
                // [v2.2] RB: 楼层回滚联动 RubyPhone 手机记忆 (幂等, 桥不在时静默跳过)
                try {
                    const rb = window.VirtualPhone?.lonshaBridge;
                    if (rb?.onFloorRollback) rb.onFloorRollback(floor);
                } catch (e) {}
                // 移除账本记录
                this.ledger.remove(floor);
                // 重建 BM25 索引
                if (this.config.config.bm25Enabled) {
                    this.bm25.rebuild(this.summary.getActiveSummaries().map(s => ({id: 'sum_' + s.floor, text: s.text, floor: s.floor, source: 'bm25'})));
                }
                if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 楼层 ${floor} 记忆已回滚`);
                return 1;
            } catch (e) {
                if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 楼层回滚失败:`, e);
                return 0;
            }
        }

        // [v2.3] RD: 携带背包（抄 baibai carryover——把记忆打包带走，新对话无缝续写）
        packCarryover() {
            try {
                const active = this.summary.getActiveSummaries().slice(-40);
                const statusFlat = [];
                for (const [name, rec] of Object.entries(this.status.characters || {})) {
                    for (const [field, value] of Object.entries(rec.fields || {})) {
                        statusFlat.push({ character: name, field, value, reason: '携带自旧对话' });
                    }
                }
                return {
                    summaries: active.map(s => ({ floor: s.floor, text: s.text, level: 1, timestamp: s.timestamp, folded: false })),
                    volumes: [...(this.summary.volumes || [])],
                    suspense: this.suspense.items.filter(x => x.status === 'open'),
                    timeline: [...this.timeline.entries],
                    statusFlat,
                    packedAt: new Date().toISOString()
                };
            } catch (e) { return null; }
        }
        // 应用携带包 (新对话开局调用: 摘要/卷/时间线/悬念导入 + 状态重建)
        applyCarryover(pack) {
            try {
                if (!pack) return false;
                if (Array.isArray(pack.summaries) && pack.summaries.length) {
                    this.summary.summaries = pack.summaries.map(s => ({ ...s, folded: false }));
                }
                if (Array.isArray(pack.volumes) && pack.volumes.length) this.summary.volumes = pack.volumes;
                if (Array.isArray(pack.suspense)) this.suspense.import(pack.suspense);
                if (Array.isArray(pack.timeline) && pack.timeline.length) this.timeline.entries = [...pack.timeline];
                if (Array.isArray(pack.statusFlat) && pack.statusFlat.length) {
                    this.status.applyChanges(pack.statusFlat, 0, true);
                }
                if (this.config.config.bm25Enabled) {
                    this.bm25.rebuild(this.summary.getActiveSummaries().map(s => ({id: 'sum_' + s.floor, text: s.text, floor: s.floor, source: 'bm25'})));
                }
                return true;
            } catch (e) { return false; }
        }
        getCurrentChatId() {
            try { return window.SillyTavern?.getContext?.()?.chatId; } catch { return null; }
        }
    }
    
    // [v2.4] RE: 场景地图树（抄 baibai MemScene：由大到小路径层级 + 当前位置追踪 + ops重放）
    class SceneBook {
        constructor() {
            this.nodes = new Map();   // key: 'a/b/c' → {path[], desc, floor, updatedAt} (派生缓存)
            this.track = [];          // [{floor, pathKey}] 位置轨迹 (取末位=当前)
            this.opsLog = [];         // [{floor, ops}] 真源 (重放重建用, 抄 baibai delta-replay)
        }
        static keyOf(path) { return (path || []).map(s => String(s).trim()).filter(Boolean).join('/'); }
        /** 应用场景 ops。op: {action:'add'|'update', path:[由大到小], desc} */
        apply(ops, floor, _replaying = false) {
            let n = 0;
            for (const op of (ops || [])) {
                const path = (op?.path || []).map(s => String(s).trim()).filter(Boolean).slice(0, 4);
                if (!path.length) continue;
                const k = SceneBook.keyOf(path);
                const exist = this.nodes.get(k);
                if (op.action === 'update' && !exist) continue;   // update 只改已存在的
                if (!exist) {
                    for (let i = 1; i < path.length; i++) {
                        const pk = SceneBook.keyOf(path.slice(0, i));
                        if (!this.nodes.has(pk)) this.nodes.set(pk, { path: path.slice(0, i), desc: '', floor, updatedAt: Date.now() });
                    }
                    this.nodes.set(k, { path, desc: String(op.desc || '').slice(0, 80), floor, updatedAt: Date.now() });
                } else if (op.desc && op.desc !== exist.desc) {
                    exist.desc = String(op.desc).slice(0, 80); exist.updatedAt = Date.now(); exist.floor = floor;
                } else continue;
                n++;
            }
            if (!_replaying && n) {
                const i = this.opsLog.findIndex(o => o.floor === floor);
                if (i >= 0) this.opsLog[i] = { floor, ops };
                else this.opsLog.push({ floor, ops });
                if (this.opsLog.length > 400) this.opsLog.shift();
            }
            return n;
        }
        /** 记录位置轨迹（同楼覆盖） */
        setLocation(floor, path) {
            const k = SceneBook.keyOf(path);
            if (!k) return;
            const i = this.track.findIndex(t => t.floor === floor);
            if (i >= 0) this.track[i] = { floor, pathKey: k };
            else this.track.push({ floor, pathKey: k });
            if (this.track.length > 200) this.track.shift();
        }
        currentKey() { return this.track.length ? this.track[this.track.length - 1].pathKey : null; }
        /** 某位置的由大到小链（含描述） */
        chainOf(key) {
            const parts = String(key || '').split('/').filter(Boolean);
            const out = [];
            for (let i = 1; i <= parts.length; i++) {
                const n = this.nodes.get(parts.slice(0, i).join('/'));
                if (n) out.push(n);
            }
            return out;
        }
        /** 重建（删楼回滚后: 过滤真源 → 重放） */
        rebuildFromOps() {
            this.nodes.clear();
            this.track = this.track.filter(t => t.floor < (this._cutoff || 0) || this._cutoff === undefined ? true : false);
            const log = [...this.opsLog].sort((a, b) => a.floor - b.floor);
            for (const e of log) { this.apply(e.ops, e.floor, true); }
        }
        rollbackFrom(floor) {
            this.opsLog = this.opsLog.filter(o => o.floor < floor);
            this.track = this.track.filter(t => t.floor < floor);
            this.nodes.clear();
            for (const e of [...this.opsLog].sort((a, b) => a.floor - b.floor)) this.apply(e.ops, e.floor, true);
        }
        /** 给提取 prompt 的场景清单（最多15行） */
        brief() {
            const arr = [...this.nodes.values()].filter(n => n.desc || n.path.length >= 2).slice(-15);
            if (!arr.length) return '（暂无已登记场景）';
            return arr.map(n => `${n.path.join('/')} — ${n.desc || ''}`).join('\n');
        }
        export() { return { nodes: Array.from(this.nodes.values()), track: this.track, opsLog: this.opsLog }; }
        import(data) {
            if (!data || typeof data !== 'object') return;
            this.nodes = new Map((data.nodes || []).map(n => [SceneBook.keyOf(n.path), n]));
            this.track = Array.isArray(data.track) ? data.track : [];
            this.opsLog = Array.isArray(data.opsLog) ? data.opsLog : [];
        }
    }

    // [v2.2] RC: 悬念簿（抄 baibai MemPlan：约定/伏笔/未解之谜 + done/cancelled/failed 三态了结）
    class SuspenseBook {
        constructor() { this.items = []; this._seq = 0; }
        /** 添加新悬项。kind: 'plan'|'suspense' */
        add(kind, content, floor, createdTime) {
            const c = String(content || '').trim();
            if (c.length < 4) return null;
            const id = 'sus_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            this._seq = (this._seq || 0) + 1;
            this.items.push({
                id, sid: 's' + this._seq, kind: (kind === 'suspense' ? 'suspense' : 'plan'), content: c.slice(0, 120),
                status: 'open', floor: floor ?? null, createdTime: createdTime || null,
                outcome: null, resolvedReason: null, resolvedFloor: null, createdAt: Date.now()
            });
            return id;
        }
        /** 了结悬项。outcome: 'done'|'cancelled'|'failed' */
        resolve(idOrContent, outcome, reason, floor) {
            let it = this.items.find(x => x.id === idOrContent && x.status === 'open');
            if (!it) it = this.items.find(x => x.sid === idOrContent && x.status === 'open');
            if (!it) {
                const key = String(idOrContent || '').trim();
                it = this.items.find(x => x.status === 'open' && (x.content.includes(key) || key.includes(x.content)));
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

    // [v2.2] RC: 相对时间前缀（抄 baibai timeRel：数字日历精确算天数差，宁可不标绝不标错）
    function parseStoryDateLoose(s) {
        s = String(s || '');
        // 带年: 2026年3月12日 / 2026-3-12 / 2026/3/12 / 2026.3.12
        let m = s.match(/(\d{3,4})\s*[年\/\-.]\s*(\d{1,2})\s*[月\/\-.]\s*(\d{1,2})/) || s.match(/(\d{1,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/);
        if (m) {
            let y = Number(m[1]); if (y < 100) y += 2000;
            const mo = Number(m[2]), d = Number(m[3]);
            if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { y, mo, d };
            return null;
        }
        // 无年: 3月12日 / 3月12 / 3-12(后接边界, 防"1.5个小时"小数误判)
        m = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/) || s.match(/(\d{1,2})[\/\-.](\d{1,2})(?=$|\s|日)/);
        if (m) {
            const mo = Number(m[1]), d = Number(m[2]);
            if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { y: null, mo, d };
        }
        return null;
    }
    function storyDayDiff(dateA, dateB) {
        const a = parseStoryDateLoose(dateA), b = parseStoryDateLoose(dateB);
        if (!a || !b) return null;
        // 年份补齐: 双方都无年按同年比; 一方无年借用对方的年; 差值超2年视为年份推测可疑, 宁可不标
        let ya = a.y, yb = b.y;
        if (ya === null && yb === null) { ya = 2000; yb = 2000; }
        else if (ya === null) ya = yb;
        else if (yb === null) yb = ya;
        const diff = Math.round((new Date(ya, a.mo - 1, a.d) - new Date(yb, b.mo - 1, b.d)) / 86400000);
        if (isNaN(diff) || Math.abs(diff) > 730) return null;
        return diff;
    }
    function relativePrefix(dateStr, nowStr) {
        try {
            if (!dateStr || !nowStr) return '';
            const diff = storyDayDiff(nowStr, dateStr);
            if (diff === null || isNaN(diff)) return '';
            if (diff === 0) return '今天';
            if (diff === 1) return '昨天';
            if (diff === 2) return '前天';
            if (diff > 2 && diff < 7) return diff + '天前';
            if (diff >= 7 && diff < 30) return Math.floor(diff / 7) + '周前';
            if (diff >= 30 && diff < 365) return Math.floor(diff / 30) + '个月前';
            if (diff >= 365) return Math.floor(diff / 365) + '年前';
            if (diff === -1) return '明天';
            if (diff < -1 && diff > -7) return Math.abs(diff) + '天后';
            return '';   // 更远的未来不标（宁可不标绝不标错）
        } catch (e) { return ''; }
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
        constructor() { this.summaries = []; this.volumes = []; this.folding = false; }
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
            const summary = {floor: message.index || 0, text, level: 1, timestamp: Date.now(), folded: false};
            this.summaries.push(summary);
            return summary;
        }
        // 活跃（未折叠）摘要
        getActiveSummaries() { return this.summaries.filter(s => !s.folded); }
        search(query) { return this.getActiveSummaries().filter(s => s.text.includes(query)).slice(0, 5); }
        // [v1.9] P1: 层级折叠——活跃摘要超过阈值时，把最早一批用 LLM 合并成卷摘要
        async maybeFold(config, llm) {
            if (this.folding || !config?.summaryFoldEnabled) return null;
            const active = this.getActiveSummaries();
            if (active.length < (config.summaryFoldThreshold || 30)) return null;
            const batchSize = config.summaryFoldBatchSize || 20;
            const batch = active.slice(0, batchSize);
            if (batch.length < 5) return null;
            this.folding = true;
            try {
                const list = batch.map(s => '- ' + s.text).join('\n');
                const prompt = `你是剧情记忆整理员。以下是同一段长剧情的前${batch.length}条楼层摘要。请把它们合并成一条80-150字的高层剧情概括（卷摘要），保留关键人物、地点、因果与转折，丢弃重复细节。只输出概括本身，不要编号、不要markdown、不要换行。\n\n${list}`;
                const raw = await llm.callAPI(prompt);
                const clean = String(raw || '').replace(/^[-•\s]+/, '').trim();
                if (clean && clean.length >= 20) {
                    const floors = batch.map(s => s.floor).filter(f => f !== undefined && f !== null);
                    this.volumes.push({
                        id: 'vol_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                        text: clean,
                        floorStart: floors.length ? Math.min(...floors) : 0,
                        floorEnd: floors.length ? Math.max(...floors) : 0,
                        count: batch.length,
                        timestamp: Date.now()
                    });
                    batch.forEach(s => { s.folded = true; });
                    if (this.volumes.length > 20) this.volumes.shift();
                    if (config.debugMode) console.log(`[${PLUGIN_NAME}] 摘要折叠: ${batch.length}条 → 卷摘要#${this.volumes.length}`);
                    return this.volumes[this.volumes.length - 1];
                }
            } catch (e) {
                if (config?.debugMode) console.warn(`[${PLUGIN_NAME}] 摘要折叠失败:`, e);
            } finally {
                this.folding = false;
            }
            return null;
        }
        // 卷摘要召回（最近 N 卷，低权重）
        searchVolumes(limit = 2) { return this.volumes.slice(-limit).reverse(); }
        export() { return { summaries: this.summaries, volumes: this.volumes }; }
        import(data) {
            if (Array.isArray(data)) { this.summaries = data; this.volumes = []; }
            else if (data && typeof data === 'object') {
                this.summaries = Array.isArray(data.summaries) ? data.summaries : [];
                this.volumes = Array.isArray(data.volumes) ? data.volumes : [];
            }
        }
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
    
    // [v1.9] P1: BM25 稀疏检索（抄 anima bm25：词频×逆文档频率×长度归一化）
    class BM25 {
        constructor() { this.docs = []; this.docTerms = []; this.df = new Map(); this.N = 0; this.avgLen = 0; }
        _tokenize(text) {
            const tokens = [];
            const s = String(text || '').toLowerCase();
            (s.match(/[a-z0-9]+/g) || []).forEach(w => tokens.push(w));
            const cjkRuns = s.match(/[\u4e00-\u9fa5]+/g) || [];
            for (const run of cjkRuns) {
                if (run.length === 1) { tokens.push(run); continue; }
                for (let i = 0; i < run.length - 1; i++) tokens.push(run.slice(i, i + 2));
            }
            return tokens;
        }
        rebuild(docs) {
            this.docs = docs || [];
            this.N = this.docs.length;
            this.docTerms = this.docs.map(d => {
                const terms = this._tokenize(d.text);
                const map = new Map();
                terms.forEach(t => map.set(t, (map.get(t) || 0) + 1));
                return map;
            });
            this.df = new Map();
            for (const tm of this.docTerms) for (const t of tm.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
            this.avgLen = this.N ? this.docTerms.reduce((a, m) => a + m.size, 0) / this.N : 0;
        }
        search(query, topK = 5) {
            if (!this.N) return [];
            const qTerms = this._tokenize(query);
            if (!qTerms.length) return [];
            const k1 = 1.2, b = 0.75;
            const scored = [];
            for (let i = 0; i < this.N; i++) {
                const tm = this.docTerms[i];
                const len = tm.size || 1;
                let score = 0;
                const seen = new Set();
                for (const qt of qTerms) {
                    if (seen.has(qt)) continue;
                    seen.add(qt);
                    const tf = tm.get(qt) || 0;
                    if (!tf) continue;
                    const df = this.df.get(qt) || 0;
                    const idf = Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
                    score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * len / (this.avgLen || 1)));
                }
                if (score > 0) scored.push({ ...this.docs[i], score });
            }
            scored.sort((a, b) => b.score - a.score);
            return scored.slice(0, topK);
        }
    }
    
    // [v2.0] P2: 角色状态表（抄 yuzuki character-status：数值状态 + 待办生命周期）
    class CharacterState {
        constructor() {
            this.characters = {};   // { 角色名: { fields: {...}, todos: [...], updatedAt, floor } } (派生缓存)
            // [v2.3] RD: 事件溯源真源——每楼一条 op {floor, changes, todos}, 状态由重放推导 (抄 baibai delta-replay)
            this.ops = [];
            this.MAX_OPS = 500;
            this.MAX_FIELDS = 24;
            this.MAX_TODOS = 12;
        }
        // [v2.3] ops 记录 (同楼覆盖式: 重复提取同楼时后写覆盖前写, 重放幂等)
        _logOp(floor, kind, items) {
            try {
                if (!items || !items.length) return;
                let op = this.ops.find(o => o.floor === floor);
                if (!op) {
                    op = { floor, changes: [], todos: [] };
                    this.ops.push(op);
                    if (this.ops.length > this.MAX_OPS) this.ops.shift();
                }
                if (kind === 'changes') op.changes = items;
                if (kind === 'todos') op.todos = items;
            } catch (e) {}
        }
        // [v2.3] 重放重建: 清空派生状态, 按楼层升序重放全部 ops (删楼回滚后调它, 天然一致)
        rebuildFromOps() {
            try {
                const saved = [...this.ops].sort((a, b) => a.floor - b.floor);
                this.characters = {};
                for (const op of saved) {
                    if (Array.isArray(op.changes) && op.changes.length) this.applyChanges(op.changes, op.floor, true);
                    if (Array.isArray(op.todos) && op.todos.length) this.addTodos(op.todos, op.floor, true);
                }
            } catch (e) {}
        }
        _ensure(name) {
            if (!this.characters[name]) {
                this.characters[name] = { name, fields: {}, todos: [], updatedAt: Date.now(), floor: 0 };
            }
            return this.characters[name];
        }
        // 设置/增量修改状态字段 ([v2.3] _replaying=true 表示正在重放, 不再记 op)
        applyChanges(changes, floor, _replaying = false) {
            if (!Array.isArray(changes)) return 0;
            let n = 0;
            const effective = [];
            for (const c of changes) {
                const name = String(c?.character || c?.name || '').trim();
                const field = String(c?.field || '').trim();
                if (!name || !field) continue;
                const rec = this._ensure(name);
                // 数值增量 / 绝对值 / 文本
                if (c.delta !== undefined && c.delta !== null && !isNaN(Number(c.delta))) {
                    const base = Number(rec.fields[field]) || 0;
                    rec.fields[field] = Math.round((base + Number(c.delta)) * 100) / 100;
                } else if (c.value !== undefined && c.value !== null) {
                    rec.fields[field] = (typeof c.value === 'number') ? c.value : String(c.value).trim();
                }
                if (c.reason) rec.lastReason = String(c.reason).trim();
                rec.updatedAt = Date.now();
                rec.floor = floor || 0;
                // 字段数上限保护
                const keys = Object.keys(rec.fields);
                if (keys.length > this.MAX_FIELDS) delete rec.fields[keys[0]];
                effective.push(c);
                n++;
            }
            if (!_replaying && effective.length) this._logOp(floor, 'changes', effective);
            return n;
        }
        // 待办事项（带去重 + 过期清理）([v2.3] _replaying=true 表示正在重放)
        addTodos(items, floor, _replaying = false) {
            if (!Array.isArray(items)) return 0;
            let n = 0;
            const effective = [];
            for (const t of items) {
                const name = String(t?.character || t?.owner || '').trim();
                const text = String(t?.text || t?.content || '').trim();
                if (!name || !text) continue;
                const rec = this._ensure(name);
                rec.todos = rec.todos.filter(x => x.text !== text);
                rec.todos.push({ text, date: t.date ? String(t.date).trim() : '', floor: floor || 0, createdAt: Date.now() });
                if (rec.todos.length > this.MAX_TODOS) rec.todos.shift();
                effective.push(t);
                n++;
            }
            if (!_replaying && effective.length) this._logOp(floor, 'todos', effective);
            return n;
        }
        // 过期待办清理（抄 yuzuki todo-manager：剧情时间超过延迟即移除）
        pruneTodos(currentDate, expiryMinutes = 60) {
            if (!currentDate) return 0;
            const cur = this._parseDate(currentDate);
            if (!cur) return 0;
            let removed = 0;
            for (const name of Object.keys(this.characters)) {
                const rec = this.characters[name];
                rec.todos = (rec.todos || []).filter(t => {
                    if (!t.date) return true;
                    const td = this._parseDate(t.date);
                    if (!td) return true;
                    const diffMin = (cur - td) / 60000;
                    if (diffMin > expiryMinutes) { removed++; return false; }
                    return true;
                });
            }
            return removed;
        }
        _parseDate(d) {
            const m = String(d || '').match(/(\d{1,4})\s*[年\/-]\s*(\d{1,2})\s*[月\/-]\s*(\d{1,2})/);
            if (!m) return null;
            let y = Number(m[1]); if (y < 100) y += 2000;
            return new Date(y, Number(m[2]) - 1, Number(m[3]), 0, 0, 0).getTime();
        }
        // 按角色召回（只返回有状态的）
        searchByNames(names, limit = 5) {
            const out = [];
            for (const n of (names || [])) {
                const rec = this.characters[n];
                if (!rec) continue;
                const fields = Object.entries(rec.fields || {});
                const todos = (rec.todos || []);
                if (!fields.length && !todos.length) continue;
                out.push({ name: n, fields, todos });
            }
            return out.slice(0, limit);
        }
        export() { return { characters: this.characters, ops: this.ops }; }
        import(data) {
            if (data && typeof data === 'object' && data.characters) {
                this.characters = data.characters;
                this.ops = Array.isArray(data.ops) ? data.ops : [];
            } else {
                // 旧格式 (v2.2 之前): 纯 characters 对象, ops 从零开始积累
                this.characters = (data && typeof data === 'object') ? data : {};
                this.ops = [];
            }
        }
    }
    
    // [v2.0] P2: 楼层账本（抄 yuzuki floor-ledger：记忆变更绑定楼层，删楼/重生成自动回滚）
    class FloorLedger {
        constructor() {
            this.floors = {};   // { floor: { nodeIds:[], summaryFloors:[], povIds:[], timelineIds:[], statusSnapshot:{} } }
            this.MAX_FLOORS = 400;
        }
        beginFloor(floor, statusSnapshot) {
            this.floors[floor] = {
                floor,
                nodeIds: [],
                summaryFloors: [],
                povIds: [],
                timelineIds: [],
                statusSnapshot: statusSnapshot || null,
                createdAt: Date.now()
            };
            const keys = Object.keys(this.floors);
            if (keys.length > this.MAX_FLOORS) {
                delete this.floors[keys.sort((a, b) => a - b)[0]];
            }
            return this.floors[floor];
        }
        record(floor, patch) {
            const e = this.floors[floor] || this.beginFloor(floor);
            if (patch.nodeIds) e.nodeIds.push(...patch.nodeIds);
            if (patch.summaryFloors) e.summaryFloors.push(...patch.summaryFloors);
            if (patch.povIds) e.povIds.push(...patch.povIds);
            if (patch.timelineIds) e.timelineIds.push(...patch.timelineIds);
            return e;
        }
        get(floor) { return this.floors[floor] || null; }
        // 移除楼层记录，返回被移除的条目（供调用方回滚）
        remove(floor) {
            const e = this.floors[floor];
            if (!e) return null;
            delete this.floors[floor];
            return e;
        }
        // 该楼层之后的所有楼层（重生成/删楼后需回滚的）
        floorsAfter(floor) {
            return Object.keys(this.floors).map(Number).filter(f => f > floor).sort((a, b) => a - b);
        }
        export() { return this.floors; }
        import(data) { this.floors = (data && typeof data === 'object') ? data : {}; }
    }
    
    // [v2.1] P3: 提取互斥锁（抄 hcdiary：cdBusy/cdPending 防并发写坏数据）
    class Mutex {
        constructor() { this.busy = false; this.pending = false; this.waiters = []; }
        async acquire() {
            if (!this.busy) { this.busy = true; return true; }
            // 已有任务在跑：排队等待（最多等 30s，避免死等）
            return new Promise((resolve) => {
                let done = false;
                const timer = setTimeout(() => {
                    if (done) return;
                    done = true;
                    const i = this.waiters.indexOf(entry);
                    if (i >= 0) this.waiters.splice(i, 1);
                    resolve(false);
                }, 30000);
                const entry = (ok) => {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    if (ok) this.busy = true;
                    resolve(ok);
                };
                this.waiters.push(entry);
            });
        }
        release() {
            if (this.waiters.length) {
                const next = this.waiters.shift();
                next(true);   // 直接把锁交给下一个等待者
            } else {
                this.busy = false;
            }
        }
        get locked() { return this.busy; }
        get queueLength() { return this.waiters.length; }
    }
    
    // [v2.1] P3: 节日感知（抄 anima default_rag_strategy.holidays：日期临近节日时增强）
    class HolidayAware {
        constructor() {
            this.holidays = [
                { date: '12-25', name: '圣诞节', before: 3, after: 3 },
                { date: '02-14', name: '情人节', before: 2, after: 2 },
                { date: '01-01', name: '元旦', before: 3, after: 3 },
                { date: '10-31', name: '万圣节', before: 1, after: 1 },
                { date: '05-20', name: '网络情人节', before: 1, after: 1 },
                { date: '06-01', name: '儿童节', before: 1, after: 1 },
                { date: '08-15', name: '中秋节', before: 3, after: 3 },
                { date: '07-07', name: '七夕', before: 2, after: 2 }
            ];
        }
        _parse(dateStr) {
            const s = String(dateStr || '');
            // [v2.2] 修复: 支持无年日期("3月12日"); 节日比较只看月/日, 年缺省用占位年
            const m = s.match(/(\d{3,4})\s*[年\/\-.]\s*(\d{1,2})\s*[月\/\-.]\s*(\d{1,2})/)
                || s.match(/(\d{1,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/)
                || s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
            if (!m) return null;
            const mo = Number(m[m.length - 2]), d = Number(m[m.length - 1]);
            if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
            let y = m.length === 4 ? Number(m[1]) : 2024;
            if (y < 100) y += 2000;
            return { y, mo, d };
        }
        /** 返回当前日期所处的节日（含临近窗口），无则 null */
        current(dateStr) {
            const p = this._parse(dateStr);
            if (!p) return null;
            for (const h of this.holidays) {
                const [hm, hd] = h.date.split('-').map(Number);
                const cur = p.mo * 100 + p.d;
                const target = hm * 100 + hd;
                // 允许跨月窗口（简单按天数近似）
                const diff = this._dayDiff(p.mo, p.d, hm, hd, p.y);
                if (diff >= -h.before && diff <= h.after) {
                    return { name: h.name, date: h.date, offsetDays: diff };
                }
            }
            return null;
        }
        _dayDiff(m1, d1, m2, d2, year) {
            const a = new Date(year, m1 - 1, d1).getTime();
            let bYear = year;
            const b = new Date(bYear, m2 - 1, d2).getTime();
            let diff = Math.round((a - b) / 86400000);
            // 处理跨年（如 12月 看 1月1日）
            if (diff > 180) diff -= 365;
            if (diff < -180) diff += 365;
            return diff;
        }
        /** 节日关键词（用于召回加权 / 注入提示） */
        keywords(holidayName) {
            const map = {
                '圣诞节': ['圣诞', '圣诞树', '礼物', '平安夜', '雪'],
                '情人节': ['情人节', '玫瑰', '巧克力', '告白', '约会'],
                '元旦': ['元旦', '新年', '跨年', '倒计时'],
                '万圣节': ['万圣', '南瓜', '糖果', '变装'],
                '网络情人节': ['520', '告白', '我爱你'],
                '儿童节': ['儿童节', '游乐场', '糖果'],
                '中秋节': ['中秋', '月饼', '团圆', '赏月'],
                '七夕': ['七夕', '牛郎织女', '鹊桥', '乞巧']
            };
            return map[holidayName] || [];
        }
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
                    if (data.status && engine.status) engine.status.import(data.status);
                    if (data.ledger && engine.ledger) engine.ledger.import(data.ledger);
                    if (data.suspense && engine.suspense) engine.suspense.import(data.suspense);
                    if (data.scene && engine.scene) engine.scene.import(data.scene);
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

                // [v2.4] RE: 楼层编辑/滑动感知——被编辑的楼层及其之后全部按删楼处理 (同 baibai 陈旧失效语义)
                if (types.MESSAGE_EDITED) {
                    eventSource.on(types.MESSAGE_EDITED, (messageId) => {
                        try {
                            const f = Number(messageId);
                            if (Number.isFinite(f) && f >= 0) {
                                console.log(`[${PLUGIN_NAME}] 楼层 ${f} 被编辑, 级联回滚该楼及之后的记忆`);
                                this.engine.rollbackFloor(f);
                                const c = window.SillyTavern?.getContext?.();
                                const after = [];
                                for (let i = f + 1; i < (c?.chat?.length || 0); i++) after.push(i);
                                for (const ff of after.reverse()) this.engine.rollbackFloor(ff);
                            }
                        } catch (err) { console.warn(`[${PLUGIN_NAME}] 编辑回滚失败:`, err); }
                    });
                    this.eventHandlers.push({ eventSource, type: types.MESSAGE_EDITED });
                }
                if (types.MESSAGE_SWIPED) {
                    eventSource.on(types.MESSAGE_SWIPED, (messageId) => {
                        try {
                            const f = Number(messageId);
                            if (Number.isFinite(f) && f >= 0) {
                                if (this.configMgr.config.debugMode) console.log(`[${PLUGIN_NAME}] 楼层 ${f} 滑动/重生成, 回滚该楼记忆`);
                                this.engine.rollbackFloor(f);
                            }
                        } catch (err) {}
                    });
                    this.eventHandlers.push({ eventSource, type: types.MESSAGE_SWIPED });
                }
// [v2.0] P2: 删楼回滚（楼层账本）
                if (types.MESSAGE_DELETED) {
                    eventSource.on(types.MESSAGE_DELETED, (messageId) => {
                        try {
                            const c = window.SillyTavern?.getContext?.();
                            // ST 删楼后 chat 已变化，直接尝试回滚该楼及其后的记忆
                            const floor = Number(messageId);
                            if (!Number.isFinite(floor)) return;
                            plugin.engine.rollbackFloor(floor);
                            // 同时清掉该楼之后的账本残留（删楼会连锁前移）
                            const after = plugin.engine.ledger.floorsAfter(floor);
                            for (const f of after.reverse()) plugin.engine.rollbackFloor(f);
                        } catch (err) {
                            if (plugin.engine.config.config.debugMode) console.error(`[${PLUGIN_NAME}] 删楼回滚失败:`, err);
                        }
                    });
                    this.eventHandlers.push({ eventSource, type: types.MESSAGE_DELETED });
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
