// Phase 6: IndexedDB 持久化存储
// storage.js - 本地数据库存储，支持大规模数据持久化

class MemoryStorage {
    constructor(dbName = 'LonShaMemory', version = 1) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
    }
    
    // 初始化数据库
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                console.log('[Storage] IndexedDB initialized');
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // 节点存储
                if (!db.objectStoreNames.contains('nodes')) {
                    const nodeStore = db.createObjectStore('nodes', { keyPath: 'id' });
                    nodeStore.createIndex('type', 'type', { unique: false });
                    nodeStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                // 边存储
                if (!db.objectStoreNames.contains('edges')) {
                    const edgeStore = db.createObjectStore('edges', { keyPath: 'id', autoIncrement: true });
                    edgeStore.createIndex('from', 'from', { unique: false });
                    edgeStore.createIndex('to', 'to', { unique: false });
                }
                
                // 摘要存储
                if (!db.objectStoreNames.contains('summaries')) {
                    const summaryStore = db.createObjectStore('summaries', { keyPath: 'id', autoIncrement: true });
                    summaryStore.createIndex('floor', 'floor', { unique: false });
                    summaryStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                // PageRank 缓存
                if (!db.objectStoreNames.contains('pagerank')) {
                    db.createObjectStore('pagerank', { keyPath: 'id' });
                }
                
                // 元数据
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'key' });
                }
                
                console.log('[Storage] Database schema created');
            };
        });
    }
    
    // 保存节点
    async saveNode(node) {
        const tx = this.db.transaction(['nodes'], 'readwrite');
        const store = tx.objectStore('nodes');
        await store.put({ ...node, savedAt: Date.now() });
        return tx.complete;
    }
    
    // 批量保存节点
    async saveNodes(nodes) {
        const tx = this.db.transaction(['nodes'], 'readwrite');
        const store = tx.objectStore('nodes');
        
        for (const node of nodes) {
            await store.put({ ...node, savedAt: Date.now() });
        }
        
        return tx.complete;
    }
    
    // 获取节点
    async getNode(id) {
        const tx = this.db.transaction(['nodes'], 'readonly');
        const store = tx.objectStore('nodes');
        return await store.get(id);
    }
    
    // 获取所有节点
    async getAllNodes() {
        const tx = this.db.transaction(['nodes'], 'readonly');
        const store = tx.objectStore('nodes');
        return await store.getAll();
    }
    
    // 按类型查询节点
    async getNodesByType(type) {
        const tx = this.db.transaction(['nodes'], 'readonly');
        const store = tx.objectStore('nodes');
        const index = store.index('type');
        return await index.getAll(type);
    }
    
    // 保存边
    async saveEdge(edge) {
        const tx = this.db.transaction(['edges'], 'readwrite');
        const store = tx.objectStore('edges');
        await store.put({ ...edge, savedAt: Date.now() });
        return tx.complete;
    }
    
    // 批量保存边
    async saveEdges(edges) {
        const tx = this.db.transaction(['edges'], 'readwrite');
        const store = tx.objectStore('edges');
        
        for (const edge of edges) {
            await store.put({ ...edge, savedAt: Date.now() });
        }
        
        return tx.complete;
    }
    
    // 获取所有边
    async getAllEdges() {
        const tx = this.db.transaction(['edges'], 'readonly');
        const store = tx.objectStore('edges');
        return await store.getAll();
    }
    
    // 保存摘要
    async saveSummary(summary) {
        const tx = this.db.transaction(['summaries'], 'readwrite');
        const store = tx.objectStore('summaries');
        await store.put({ ...summary, savedAt: Date.now() });
        return tx.complete;
    }
    
    // 获取所有摘要
    async getAllSummaries() {
        const tx = this.db.transaction(['summaries'], 'readonly');
        const store = tx.objectStore('summaries');
        return await store.getAll();
    }
    
    // 保存 PageRank 结果
    async savePageRank(ranks, metadata = {}) {
        const tx = this.db.transaction(['pagerank'], 'readwrite');
        const store = tx.objectStore('pagerank');
        
        await store.put({
            id: 'latest',
            ranks: Object.fromEntries(ranks),
            metadata,
            timestamp: Date.now()
        });
        
        return tx.complete;
    }
    
    // 获取 PageRank 结果
    async getPageRank() {
        const tx = this.db.transaction(['pagerank'], 'readonly');
        const store = tx.objectStore('pagerank');
        const result = await store.get('latest');
        
        if (result && result.ranks) {
            return new Map(Object.entries(result.ranks));
        }
        return null;
    }
    
    // 导出所有数据
    async exportAll() {
        const [nodes, edges, summaries] = await Promise.all([
            this.getAllNodes(),
            this.getAllEdges(),
            this.getAllSummaries()
        ]);
        
        return {
            nodes,
            edges,
            summaries,
            exportedAt: Date.now(),
            version: this.version
        };
    }
    
    // 导入数据
    async importAll(data) {
        const { nodes, edges, summaries } = data;
        
        await Promise.all([
            this.saveNodes(nodes),
            this.saveEdges(edges),
            summaries ? this.saveSummaries(summaries) : Promise.resolve()
        ]);
        
        console.log('[Storage] Import completed');
    }
    
    async saveSummaries(summaries) {
        const tx = this.db.transaction(['summaries'], 'readwrite');
        const store = tx.objectStore('summaries');
        
        for (const summary of summaries) {
            await store.put(summary);
        }
        
        return tx.complete;
    }
    
    // 清空所有数据
    async clearAll() {
        const stores = ['nodes', 'edges', 'summaries', 'pagerank', 'metadata'];
        
        for (const storeName of stores) {
            const tx = this.db.transaction([storeName], 'readwrite');
            const store = tx.objectStore(storeName);
            await store.clear();
        }
        
        console.log('[Storage] All data cleared');
    }
    
    // 获取存储统计
    async getStats() {
        const [nodes, edges, summaries] = await Promise.all([
            this.getAllNodes(),
            this.getAllEdges(),
            this.getAllSummaries()
        ]);
        
        // 估算大小（粗略计算）
        const nodeSize = JSON.stringify(nodes).length;
        const edgeSize = JSON.stringify(edges).length;
        const summarySize = JSON.stringify(summaries).length;
        const totalSize = nodeSize + edgeSize + summarySize;
        
        return {
            nodeCount: nodes.length,
            edgeCount: edges.length,
            summaryCount: summaries.length,
            totalSize: (totalSize / 1024).toFixed(2) + ' KB',
            nodeSizeKB: (nodeSize / 1024).toFixed(2),
            edgeSizeKB: (edgeSize / 1024).toFixed(2),
            summarySizeKB: (summarySize / 1024).toFixed(2)
        };
    }
    
    // 关闭数据库
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            console.log('[Storage] Database closed');
        }
    }
}

// 自动同步管理器
class AutoSyncManager {
    constructor(storage, engine, interval = 60000) {
        this.storage = storage;
        this.engine = engine;
        this.interval = interval; // 默认每60秒同步一次
        this.timer = null;
        this.dirty = false;
    }
    
    // 启动自动同步
    start() {
        console.log(`[AutoSync] Starting auto-sync (interval: ${this.interval}ms)`);
        
        this.timer = setInterval(async () => {
            if (this.dirty) {
                await this.sync();
                this.dirty = false;
            }
        }, this.interval);
    }
    
    // 停止自动同步
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            console.log('[AutoSync] Auto-sync stopped');
        }
    }
    
    // 标记为脏数据
    markDirty() {
        this.dirty = true;
    }
    
    // 立即同步
    async sync() {
        console.log('[AutoSync] Syncing to IndexedDB...');
        
        try {
            const nodes = Array.from(this.engine.graph.nodes.values());
            const edges = Array.from(this.engine.graph.edges.values());
            const summaries = this.engine.summary.summaries;
            
            await Promise.all([
                this.storage.saveNodes(nodes),
                this.storage.saveEdges(edges),
                this.storage.saveSummaries(summaries)
            ]);
            
            console.log('[AutoSync] Sync completed');
            return true;
        } catch (error) {
            console.error('[AutoSync] Sync failed:', error);
            return false;
        }
    }
    
    // 从存储加载
    async load() {
        console.log('[AutoSync] Loading from IndexedDB...');
        
        try {
            const [nodes, edges, summaries] = await Promise.all([
                this.storage.getAllNodes(),
                this.storage.getAllEdges(),
                this.storage.getAllSummaries()
            ]);
            
            // 加载到引擎
            this.engine.graph.nodes.clear();
            for (const node of nodes) {
                this.engine.graph.nodes.set(node.id, node);
            }
            
            this.engine.graph.edges.clear();
            for (const edge of edges) {
                this.engine.graph.edges.set(edge.id || `edge_${Date.now()}_${Math.random()}`, edge);
            }
            
            this.engine.summary.summaries = summaries;
            
            console.log(`[AutoSync] Loaded ${nodes.length} nodes, ${edges.length} edges, ${summaries.length} summaries`);
            return true;
        } catch (error) {
            console.error('[AutoSync] Load failed:', error);
            return false;
        }
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MemoryStorage, AutoSyncManager };
} else {
    window.MemoryStorage = MemoryStorage;
    window.AutoSyncManager = AutoSyncManager;
}