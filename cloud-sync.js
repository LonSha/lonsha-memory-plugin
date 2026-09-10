// Phase 7: 云端同步模块
// cloud-sync.js - Firebase/Supabase 离线优先同步

class CloudSync {
    constructor(provider, config) {
        this.provider = provider; // 'firebase' 或 'supabase'
        this.config = config;
        this.client = null;
        this.userId = null;
        this.syncQueue = [];
        this.syncTimer = null;
        this.conflictResolver = null;
        
        this.state = {
            online: navigator.onLine,
            syncing: false,
            lastSync: null,
            pendingChanges: 0
        };
        
        this.options = {
            syncInterval: config.syncInterval || 60000, // 60秒
            batchSize: config.batchSize || 50,
            conflictStrategy: config.conflictStrategy || 'last-write-wins'
        };
        
        this.init();
    }
    
    // 初始化云端客户端
    async init() {
        console.log(`[Cloud Sync] Initializing ${this.provider} client...`);
        
        try {
            if (this.provider === 'firebase') {
                await this.initFirebase();
            } else if (this.provider === 'supabase') {
                await this.initSupabase();
            } else {
                throw new Error(`Unknown provider: ${this.provider}`);
            }
            
            // 监听网络状态
            window.addEventListener('online', () => this.handleOnline());
            window.addEventListener('offline', () => this.handleOffline());
            
            // 启动自动同步
            this.startAutoSync();
            
            console.log('[Cloud Sync] Initialization complete');
        } catch (error) {
            console.error('[Cloud Sync] Initialization failed:', error);
            throw error;
        }
    }
    
    // 初始化 Firebase
    async initFirebase() {
        // 假设 Firebase SDK 已加载
        if (typeof firebase === 'undefined') {
            throw new Error('Firebase SDK not loaded');
        }
        
        const firebaseConfig = {
            apiKey: this.config.apiKey,
            authDomain: this.config.authDomain,
            projectId: this.config.projectId,
            storageBucket: this.config.storageBucket,
            messagingSenderId: this.config.messagingSenderId,
            appId: this.config.appId
        };
        
        firebase.initializeApp(firebaseConfig);
        
        // 认证
        if (this.config.auth) {
            const auth = firebase.auth();
            const user = await auth.signInAnonymously();
            this.userId = user.user.uid;
        }
        
        this.client = firebase.firestore();
        
        console.log('[Cloud Sync] Firebase initialized');
    }
    
    // 初始化 Supabase
    async initSupabase() {
        // 假设 Supabase SDK 已加载
        if (typeof supabase === 'undefined') {
            throw new Error('Supabase SDK not loaded');
        }
        
        this.client = supabase.createClient(
            this.config.url,
            this.config.anonKey
        );
        
        // 认证
        if (this.config.auth) {
            const { data, error } = await this.client.auth.signInAnonymously();
            if (error) throw error;
            this.userId = data.user.id;
        }
        
        console.log('[Cloud Sync] Supabase initialized');
    }
    
    // 上传数据
    async upload(collection, data) {
        if (!this.state.online) {
            console.log('[Cloud Sync] Offline, queuing upload');
            this.queueChange('upload', collection, data);
            return { queued: true };
        }
        
        try {
            this.state.syncing = true;
            
            if (this.provider === 'firebase') {
                return await this.uploadFirebase(collection, data);
            } else if (this.provider === 'supabase') {
                return await this.uploadSupabase(collection, data);
            }
        } catch (error) {
            console.error('[Cloud Sync] Upload failed:', error);
            this.queueChange('upload', collection, data);
            throw error;
        } finally {
            this.state.syncing = false;
        }
    }
    
    // Firebase 上传
    async uploadFirebase(collection, data) {
        const docRef = this.client.collection(collection).doc(data.id);
        
        // 添加元数据
        const document = {
            ...data,
            userId: this.userId,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            version: (data.version || 0) + 1
        };
        
        await docRef.set(document, { merge: true });
        
        console.log(`[Cloud Sync] Uploaded to Firebase: ${collection}/${data.id}`);
        return { success: true, id: data.id };
    }
    
    // Supabase 上传
    async uploadSupabase(collection, data) {
        const document = {
            ...data,
            user_id: this.userId,
            updated_at: new Date().toISOString(),
            version: (data.version || 0) + 1
        };
        
        const { data: result, error } = await this.client
            .from(collection)
            .upsert(document, { onConflict: 'id' });
        
        if (error) throw error;
        
        console.log(`[Cloud Sync] Uploaded to Supabase: ${collection}/${data.id}`);
        return { success: true, id: data.id };
    }
    
    // 下载数据
    async download(collection, filters = {}) {
        if (!this.state.online) {
            console.log('[Cloud Sync] Offline, cannot download');
            return { offline: true, data: [] };
        }
        
        try {
            this.state.syncing = true;
            
            if (this.provider === 'firebase') {
                return await this.downloadFirebase(collection, filters);
            } else if (this.provider === 'supabase') {
                return await this.downloadSupabase(collection, filters);
            }
        } catch (error) {
            console.error('[Cloud Sync] Download failed:', error);
            throw error;
        } finally {
            this.state.syncing = false;
        }
    }
    
    // Firebase 下载
    async downloadFirebase(collection, filters) {
        let query = this.client.collection(collection)
            .where('userId', '==', this.userId);
        
        // 应用过滤器
        if (filters.since) {
            query = query.where('updatedAt', '>', filters.since);
        }
        
        if (filters.limit) {
            query = query.limit(filters.limit);
        }
        
        const snapshot = await query.get();
        const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        console.log(`[Cloud Sync] Downloaded ${data.length} items from Firebase`);
        return { success: true, data };
    }
    
    // Supabase 下载
    async downloadSupabase(collection, filters) {
        let query = this.client
            .from(collection)
            .select('*')
            .eq('user_id', this.userId);
        
        // 应用过滤器
        if (filters.since) {
            query = query.gt('updated_at', filters.since);
        }
        
        if (filters.limit) {
            query = query.limit(filters.limit);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        console.log(`[Cloud Sync] Downloaded ${data.length} items from Supabase`);
        return { success: true, data };
    }
    
    // 删除数据
    async delete(collection, id) {
        if (!this.state.online) {
            console.log('[Cloud Sync] Offline, queuing delete');
            this.queueChange('delete', collection, { id });
            return { queued: true };
        }
        
        try {
            this.state.syncing = true;
            
            if (this.provider === 'firebase') {
                await this.client.collection(collection).doc(id).delete();
            } else if (this.provider === 'supabase') {
                await this.client.from(collection).delete().eq('id', id);
            }
            
            console.log(`[Cloud Sync] Deleted: ${collection}/${id}`);
            return { success: true };
        } catch (error) {
            console.error('[Cloud Sync] Delete failed:', error);
            this.queueChange('delete', collection, { id });
            throw error;
        } finally {
            this.state.syncing = false;
        }
    }
    
    // 完整同步
    async sync(collections, localData) {
        if (!this.state.online) {
            console.log('[Cloud Sync] Offline, cannot sync');
            return { offline: true };
        }
        
        console.log('[Cloud Sync] Starting full sync...');
        
        try {
            this.state.syncing = true;
            
            const results = {
                uploaded: 0,
                downloaded: 0,
                conflicts: 0,
                errors: []
            };
            
            // 下载远程更新
            for (const collection of collections) {
                try {
                    const remote = await this.download(collection, {
                        since: this.state.lastSync
                    });
                    
                    results.downloaded += remote.data.length;
                    
                    // 合并本地数据
                    if (localData[collection]) {
                        const merged = this.mergeData(
                            localData[collection],
                            remote.data
                        );
                        
                        results.conflicts += merged.conflicts.length;
                        localData[collection] = merged.data;
                    }
                } catch (error) {
                    results.errors.push({
                        collection,
                        operation: 'download',
                        error: error.message
                    });
                }
            }
            
            // 上传本地更改
            for (const collection of collections) {
                if (!localData[collection]) continue;
                
                for (const item of localData[collection]) {
                    if (item._dirty) {
                        try {
                            await this.upload(collection, item);
                            results.uploaded++;
                            delete item._dirty;
                        } catch (error) {
                            results.errors.push({
                                collection,
                                operation: 'upload',
                                item: item.id,
                                error: error.message
                            });
                        }
                    }
                }
            }
            
            // 处理队列中的操作
            await this.processQueue();
            
            this.state.lastSync = new Date();
            
            console.log('[Cloud Sync] Sync complete:', results);
            return results;
        } catch (error) {
            console.error('[Cloud Sync] Sync failed:', error);
            throw error;
        } finally {
            this.state.syncing = false;
        }
    }
    
    // 合并数据（冲突解决）
    mergeData(local, remote) {
        const merged = [...local];
        const conflicts = [];
        
        for (const remoteItem of remote) {
            const localIndex = merged.findIndex(item => item.id === remoteItem.id);
            
            if (localIndex === -1) {
                // 远程新增
                merged.push(remoteItem);
            } else {
                const localItem = merged[localIndex];
                
                // 检查冲突
                if (localItem._dirty && localItem.version !== remoteItem.version) {
                    conflicts.push({
                        id: remoteItem.id,
                        local: localItem,
                        remote: remoteItem
                    });
                    
                    // 冲突解决策略
                    if (this.options.conflictStrategy === 'last-write-wins') {
                        if (remoteItem.updatedAt > localItem.updatedAt) {
                            merged[localIndex] = remoteItem;
                        }
                    } else if (this.options.conflictStrategy === 'local-wins') {
                        // 保留本地
                    } else if (this.options.conflictStrategy === 'remote-wins') {
                        merged[localIndex] = remoteItem;
                    } else if (this.conflictResolver) {
                        merged[localIndex] = this.conflictResolver(localItem, remoteItem);
                    }
                } else {
                    // 无冲突，使用远程版本
                    merged[localIndex] = remoteItem;
                }
            }
        }
        
        return { data: merged, conflicts };
    }
    
    // 队列操作
    queueChange(operation, collection, data) {
        this.syncQueue.push({
            operation,
            collection,
            data,
            timestamp: Date.now()
        });
        
        this.state.pendingChanges = this.syncQueue.length;
        
        console.log(`[Cloud Sync] Queued ${operation}: ${collection}/${data.id}`);
    }
    
    // 处理队列
    async processQueue() {
        if (this.syncQueue.length === 0) return;
        
        console.log(`[Cloud Sync] Processing ${this.syncQueue.length} queued operations`);
        
        const batch = this.syncQueue.splice(0, this.options.batchSize);
        
        for (const item of batch) {
            try {
                if (item.operation === 'upload') {
                    await this.upload(item.collection, item.data);
                } else if (item.operation === 'delete') {
                    await this.delete(item.collection, item.data.id);
                }
            } catch (error) {
                console.error('[Cloud Sync] Queue operation failed:', error);
                // 重新入队
                this.syncQueue.push(item);
            }
        }
        
        this.state.pendingChanges = this.syncQueue.length;
    }
    
    // 启动自动同步
    startAutoSync() {
        if (this.syncTimer) return;
        
        this.syncTimer = setInterval(async () => {
            if (this.state.online && !this.state.syncing) {
                await this.processQueue();
            }
        }, this.options.syncInterval);
        
        console.log(`[Cloud Sync] Auto sync started (interval: ${this.options.syncInterval}ms)`);
    }
    
    // 停止自动同步
    stopAutoSync() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
        
        console.log('[Cloud Sync] Auto sync stopped');
    }
    
    // 处理上线
    handleOnline() {
        console.log('[Cloud Sync] Network online');
        this.state.online = true;
        
        // 立即处理队列
        this.processQueue();
    }
    
    // 处理离线
    handleOffline() {
        console.log('[Cloud Sync] Network offline');
        this.state.online = false;
    }
    
    // 设置冲突解决器
    setConflictResolver(resolver) {
        this.conflictResolver = resolver;
    }
    
    // 获取状态
    getState() {
        return { ...this.state };
    }
    
    // 清理
    dispose() {
        this.stopAutoSync();
        window.removeEventListener('online', this.handleOnline);
        window.removeEventListener('offline', this.handleOffline);
        console.log('[Cloud Sync] Disposed');
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CloudSync };
} else {
    window.CloudSync = CloudSync;
}