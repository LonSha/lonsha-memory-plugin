(function() {
    'use strict';
    const PLUGIN_NAME = 'LonSha记忆引擎';
    const VERSION = '1.3.1';
    
    class ConfigManager {
        constructor() {
            this.config = {
                enabled: true,
                extractionEnabled: true,
                vectorEnabled: true,
                graphDiffusionEnabled: true,
                autoSave: true,
                maxSummaryLength: 200,
                extractionPrompt: `分析以下对话，提取JSON格式：
{"characters": ["角色名"], "events": [{"type": "事件", "description": "描述"}], "relationships": [{"from": "A", "to": "B", "type": "关系"}], "summary": "摘要"}

对话：{{CONTENT}}`,
                embeddingModel: 'text-embedding-ada-002',
                vectorTopK: 5,
                hybridAlpha: 0.7,
                pageRankDamping: 0.85,
                dppLambda: 0.5,
                debugMode: false
            };
            this.loadConfig();
        }
        loadConfig() {
            try {
                const saved = localStorage.getItem('lonsha_memory_config');
                if (saved) this.config = {...this.config, ...JSON.parse(saved)};
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
                if (typeof window.generateQuietPrompt === 'function') {
                    return await window.generateQuietPrompt(prompt, false, false);
                }
                const main_api = localStorage.getItem('main_api') || 'openai';
                const api_server = localStorage.getItem('api_server') || '';
                const api_key = localStorage.getItem('api_key_openai') || '';
                if (main_api === 'openai' && api_key) {
                    return await this.callOpenAI(prompt, api_server || 'https://api.openai.com/v1/chat/completions', api_key);
                } else if (api_server) {
                    return await this.callGeneric(prompt, api_server);
                }
                return null;
            } catch (err) {
                console.error(`[${PLUGIN_NAME}] API调用失败:`, err);
                return null;
            }
        }
        async callOpenAI(prompt, url, key) {
            const res = await fetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`},
                body: JSON.stringify({model: 'gpt-3.5-turbo', messages: [{role: 'user', content: prompt}], temperature: 0.3, max_tokens: 1000})
            });
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
                const api_key = localStorage.getItem('api_key_openai') || '';
                const api_server = localStorage.getItem('api_server') || 'https://api.openai.com';
                
                if (!api_key) {
                    console.warn(`[${PLUGIN_NAME}] 无OpenAI密钥，使用简化向量`);
                    return this.simpleEmbedding(text);
                }
                
                const url = `${api_server}/v1/embeddings`;
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
        }
        
        async onMessageReceived(message, messageId = null) {
            if (!this.config.config.enabled) return;
            // [v1.2 真机适配修复] ST 消息对象没有 index 字段，
            // 楼层号来自 eventSource 回调的 messageId
            message = { ...message, index: messageId ?? message.index ?? 0 };
            console.log(`[${PLUGIN_NAME}] 处理新消息 (楼层 ${message.index})`);
            const chatId = this.getCurrentChatId();
            if (!chatId) return;
            
            try {
                const extracted = await this.extractMemoryWithLLM(message);
                if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 提取:`, extracted);
                
                const messageText = message.mes || '';
                
                if (extracted?.characters) {
                    for (const char of extracted.characters) {
                        this.graph.addNode({type: 'character', name: char, data: {source: messageText}});
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
                        this.graph.addEdge({from: rel.from, to: rel.to, label: rel.type, weight: 1.0, data: rel});
                    }
                }
                
                const summary = await this.summary.createSummary(message, extracted?.summary);
                
                if (extracted?.characters) {
                    for (const char of extracted.characters) {
                        await this.diary.writeDiary(char, message, summary, extracted);
                    }
                }
                
                if (this.config.config.vectorEnabled) {
                    const vectorText = `${extracted?.summary || messageText.substring(0, 200)}\n角色:${extracted?.characters?.join(',') || ''}`;
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
                const prompt = this.config.config.extractionPrompt.replace('{{CONTENT}}', content);
                const response = await this.llm.callAPI(prompt);
                if (!response) {
                    console.warn(`[${PLUGIN_NAME}] LLM无响应，用简单提取`);
                    return this.extractMemorySimple(message);
                }
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                } else {
                    return this.extractMemorySimple(message);
                }
            } catch (err) {
                console.error(`[${PLUGIN_NAME}] LLM提取失败:`, err);
                return this.extractMemorySimple(message);
            }
        }
        
        extractMemorySimple(message) {
            const content = message.mes || '';
            const characters = [];
            const namePattern = /([A-Z][a-z]+|[\u4e00-\u9fa5]{2,4})/g;
            const matches = content.match(namePattern);
            if (matches) characters.push(...new Set(matches.slice(0, 3)));
            return {characters, events: [], relationships: [], entities: [], summary: content.substring(0, 100)};
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
            const results = {summary: [], graph: [], diary: [], vector: [], diffusion: []};
            
            results.summary = this.summary.search(query.text);
            
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
            
            return this.hybridMerge(results);
        }
        
        hybridMerge(results) {
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
        
        buildInjection(recalled) {
            if (!recalled?.length) return '';
            let text = '\n\n[记忆系统]\n';
            for (const item of recalled.slice(0, 5)) {
                const score = item.score || item.finalScore || 0;
                const scoreStr = this.config.config.debugMode ? ` (${score.toFixed(3)})` : '';
                text += `• ${item.text || item.summary || item.name || ''}${scoreStr}\n`;
            }
            return text;
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
        async createSummary(message, llmSummary) {
            const text = llmSummary || (message.mes || '').substring(0, 200);
            const summary = {floor: message.index || 0, text, level: 1, timestamp: Date.now()};
            this.summaries.push(summary);
            return summary;
        }
        search(query) { return this.summaries.filter(s => s.text.includes(query)).slice(0, 5); }
        export() { return this.summaries; }
        import(data) { this.summaries = data || []; }
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
