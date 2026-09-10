// Phase 8: 图神经网络（GNN）记忆推荐引擎
// gnn-recommender.js - 基于图结构的上下文记忆推荐系统

class GNNRecommender {
    constructor(memoryGraph, config = {}) {
        this.graph = memoryGraph;
        this.config = {
            embeddingDim: config.embeddingDim || 128,
            numLayers: config.numLayers || 3,
            learningRate: config.learningRate || 0.01,
            hiddenDim: config.hiddenDim || 64,
            dropoutRate: config.dropoutRate || 0.1,
            minConfidence: config.minConfidence || 0.75,
            targetAccuracy: config.targetAccuracy || 0.85,
            ...config
        };
        
        // 节点嵌入矩阵（初始化为随机向量）
        this.embeddings = new Map();
        this.weights = {
            layer1: null,
            layer2: null,
            layer3: null,
            attention: null
        };
        
        this.trainingHistory = [];
        this.performance = {
            accuracy: 0,
            precision: 0,
            recall: 0,
            f1Score: 0
        };
        
        this.initialized = false;
    }
    
    // 初始化 GNN 模型
    async initialize() {
        console.log('[GNN] 初始化模型...');
        const nodes = Array.from(this.graph.nodes.values());
        
        // 为每个节点生成初始嵌入向量
        for (const node of nodes) {
            this.embeddings.set(node.id, this._randomVector(this.config.embeddingDim));
        }
        
        // 初始化权重矩阵
        this.weights = {
            layer1: this._randomMatrix(this.config.embeddingDim, this.config.hiddenDim),
            layer2: this._randomMatrix(this.config.hiddenDim, this.config.hiddenDim),
            layer3: this._randomMatrix(this.config.hiddenDim, this.config.embeddingDim),
            attention: this._randomMatrix(this.config.embeddingDim, 1)
        };
        
        this.initialized = true;
        console.log(`[GNN] 模型初始化完成：${nodes.length} 节点，${this.config.embeddingDim}维嵌入`);
        
        return this;
    }
    
    // 图神经网络前向传播（3层 GCN + 注意力机制）
    forward(nodeId, context = []) {
        if (!this.initialized) {
            throw new Error('GNN 模型未初始化，请先调用 initialize()');
        }
        
        const node = this.graph.nodes.get(nodeId);
        if (!node) return null;
        
        let embedding = this.embeddings.get(nodeId);
        
        // Layer 1: 邻居聚合 + 非线性激活
        embedding = this._graphConvolution(nodeId, embedding, this.weights.layer1);
        embedding = this._relu(embedding);
        embedding = this._dropout(embedding, this.config.dropoutRate);
        
        // Layer 2: 第二层卷积
        embedding = this._graphConvolution(nodeId, embedding, this.weights.layer2);
        embedding = this._relu(embedding);
        embedding = this._dropout(embedding, this.config.dropoutRate);
        
        // Layer 3: 输出层
        embedding = this._graphConvolution(nodeId, embedding, this.weights.layer3);
        
        // 注意力机制：融合上下文信息
        if (context.length > 0) {
            const contextEmbeddings = context
                .map(cid => this.embeddings.get(cid))
                .filter(e => e);
            
            if (contextEmbeddings.length > 0) {
                const attentionScores = contextEmbeddings.map(ce => 
                    this._attention(embedding, ce)
                );
                const totalScore = attentionScores.reduce((a, b) => a + b, 0);
                
                // 加权融合上下文
                const contextVector = contextEmbeddings
                    .map((ce, i) => this._scalarMultiply(ce, attentionScores[i] / totalScore))
                    .reduce((acc, vec) => this._vectorAdd(acc, vec), new Array(this.config.embeddingDim).fill(0));
                
                embedding = this._vectorAdd(
                    this._scalarMultiply(embedding, 0.7),
                    this._scalarMultiply(contextVector, 0.3)
                );
            }
        }
        
        return embedding;
    }
    
    // 推荐记忆（基于当前对话上下文）
    async recommend(currentContext = [], topK = 10) {
        const startTime = Date.now();
        
        if (!this.initialized) {
            await this.initialize();
        }
        
        // 提取上下文节点 ID
        const contextNodeIds = currentContext
            .map(msg => this._extractNodeIdsFromMessage(msg))
            .flat();
        
        // 计算当前上下文的平均嵌入
        const contextEmbedding = this._averageEmbedding(contextNodeIds);
        
        if (!contextEmbedding) {
            return { recommendations: [], confidence: 0, elapsed: Date.now() - startTime };
        }
        
        // 对所有节点计算推荐分数
        const candidates = [];
        for (const [nodeId, node] of this.graph.nodes) {
            // 跳过已在上下文中的节点
            if (contextNodeIds.includes(nodeId)) continue;
            
            // GNN 前向传播
            const nodeEmbedding = this.forward(nodeId, contextNodeIds);
            
            // 计算相似度（余弦相似度）
            const similarity = this._cosineSimilarity(contextEmbedding, nodeEmbedding);
            
            // 考虑节点重要性（PageRank）
            const importance = node.rank || 0;
            
            // 考虑时间衰减
            const recency = this._timeDecay(node.timestamp);
            
            // 综合得分：相似度 0.6 + 重要性 0.3 + 新鲜度 0.1
            const score = similarity * 0.6 + importance * 0.3 + recency * 0.1;
            
            candidates.push({
                nodeId,
                node,
                score,
                similarity,
                importance,
                recency,
                confidence: similarity // 置信度主要看相似度
            });
        }
        
        // 排序并返回 Top-K
        candidates.sort((a, b) => b.score - a.score);
        const recommendations = candidates.slice(0, topK);
        
        // 计算平均置信度
        const avgConfidence = recommendations.length > 0
            ? recommendations.reduce((sum, r) => sum + r.confidence, 0) / recommendations.length
            : 0;
        
        const elapsed = Date.now() - startTime;
        
        console.log(`[GNN推荐] ${recommendations.length}/${candidates.length} 候选，置信度 ${(avgConfidence * 100).toFixed(1)}%，耗时 ${elapsed}ms`);
        
        return {
            recommendations,
            confidence: avgConfidence,
            elapsed,
            meetsTarget: avgConfidence >= this.config.minConfidence
        };
    }
    
    // 训练模型（基于历史对话数据）
    async train(trainingData, epochs = 50) {
        console.log(`[GNN训练] 开始训练，${trainingData.length} 样本，${epochs} 轮`);
        
        if (!this.initialized) {
            await this.initialize();
        }
        
        for (let epoch = 0; epoch < epochs; epoch++) {
            let totalLoss = 0;
            let correct = 0;
            
            // 打乱训练数据
            const shuffled = this._shuffle([...trainingData]);
            
            for (const sample of shuffled) {
                const { context, target, label } = sample; // label: 1=相关, 0=不相关
                
                // 前向传播
                const contextEmbedding = this._averageEmbedding(context);
                const targetEmbedding = this.forward(target, context);
                
                if (!contextEmbedding || !targetEmbedding) continue;
                
                // 计算预测分数
                const prediction = this._cosineSimilarity(contextEmbedding, targetEmbedding);
                const predictedLabel = prediction > 0.5 ? 1 : 0;
                
                // 计算损失（二元交叉熵）
                const loss = this._binaryCrossEntropy(prediction, label);
                totalLoss += loss;
                
                // 计算准确率
                if (predictedLabel === label) correct++;
                
                // 反向传播（简化版梯度下降）
                const gradient = prediction - label;
                this._updateEmbedding(target, gradient);
            }
            
            const accuracy = correct / shuffled.length;
            const avgLoss = totalLoss / shuffled.length;
            
            this.trainingHistory.push({ epoch, loss: avgLoss, accuracy });
            
            if ((epoch + 1) % 10 === 0) {
                console.log(`[GNN训练] Epoch ${epoch + 1}/${epochs} - Loss: ${avgLoss.toFixed(4)}, Acc: ${(accuracy * 100).toFixed(1)}%`);
            }
            
            // 早停：准确率达标
            if (accuracy >= this.config.targetAccuracy) {
                console.log(`[GNN训练] 达到目标准确率 ${(accuracy * 100).toFixed(1)}%，提前结束`);
                break;
            }
        }
        
        // 计算最终性能指标
        await this._evaluatePerformance(trainingData);
        
        return this.performance;
    }
    
    // 评估模型性能
    async _evaluatePerformance(testData) {
        let tp = 0, fp = 0, tn = 0, fn = 0;
        
        for (const sample of testData) {
            const { context, target, label } = sample;
            const contextEmbedding = this._averageEmbedding(context);
            const targetEmbedding = this.forward(target, context);
            
            if (!contextEmbedding || !targetEmbedding) continue;
            
            const prediction = this._cosineSimilarity(contextEmbedding, targetEmbedding);
            const predictedLabel = prediction > 0.5 ? 1 : 0;
            
            if (predictedLabel === 1 && label === 1) tp++;
            else if (predictedLabel === 1 && label === 0) fp++;
            else if (predictedLabel === 0 && label === 0) tn++;
            else if (predictedLabel === 0 && label === 1) fn++;
        }
        
        const accuracy = (tp + tn) / (tp + tn + fp + fn);
        const precision = tp / (tp + fp) || 0;
        const recall = tp / (tp + fn) || 0;
        const f1Score = 2 * (precision * recall) / (precision + recall) || 0;
        
        this.performance = { accuracy, precision, recall, f1Score };
        
        console.log(`[GNN性能] 准确率: ${(accuracy * 100).toFixed(1)}% | 精确率: ${(precision * 100).toFixed(1)}% | 召回率: ${(recall * 100).toFixed(1)}% | F1: ${(f1Score * 100).toFixed(1)}%`);
        
        return this.performance;
    }
    
    // === 图卷积操作 ===
    _graphConvolution(nodeId, embedding, weights) {
        const node = this.graph.nodes.get(nodeId);
        if (!node) return embedding;
        
        // 获取邻居节点
        const neighbors = this._getNeighbors(nodeId);
        
        if (neighbors.length === 0) {
            return this._matrixMultiply(embedding, weights);
        }
        
        // 聚合邻居嵌入（均值池化）
        const neighborEmbeddings = neighbors
            .map(nid => this.embeddings.get(nid))
            .filter(e => e);
        
        const aggregated = neighborEmbeddings.length > 0
            ? this._averageVectors(neighborEmbeddings)
            : embedding;
        
        // 结合自身嵌入和聚合嵌入
        const combined = this._vectorAdd(
            this._scalarMultiply(embedding, 0.5),
            this._scalarMultiply(aggregated, 0.5)
        );
        
        // 矩阵变换
        return this._matrixMultiply(combined, weights);
    }
    
    // === 注意力机制 ===
    _attention(query, key) {
        // 计算注意力分数：dot product + softmax
        const score = this._dotProduct(query, key);
        return Math.exp(score); // softmax 的分子部分
    }
    
    // === 辅助函数 ===
    _getNeighbors(nodeId) {
        const neighbors = [];
        for (const [eid, edge] of this.graph.edges) {
            if (edge.source === nodeId) neighbors.push(edge.target);
            if (edge.target === nodeId) neighbors.push(edge.source);
        }
        return [...new Set(neighbors)];
    }
    
    _extractNodeIdsFromMessage(message) {
        // 从消息中提取相关的节点 ID（简化版：匹配角色名、实体）
        const nodeIds = [];
        const text = message.content || message.mes || '';
        
        for (const [nodeId, node] of this.graph.nodes) {
            if (text.includes(node.name) || text.includes(node.data?.name || '')) {
                nodeIds.push(nodeId);
            }
        }
        
        return nodeIds;
    }
    
    _averageEmbedding(nodeIds) {
        const embeddings = nodeIds
            .map(id => this.embeddings.get(id))
            .filter(e => e);
        
        return embeddings.length > 0 ? this._averageVectors(embeddings) : null;
    }
    
    _averageVectors(vectors) {
        if (vectors.length === 0) return null;
        const dim = vectors[0].length;
        const avg = new Array(dim).fill(0);
        
        for (const vec of vectors) {
            for (let i = 0; i < dim; i++) {
                avg[i] += vec[i];
            }
        }
        
        return avg.map(v => v / vectors.length);
    }
    
    _timeDecay(timestamp) {
        if (!timestamp) return 0.5;
        const ageMs = Date.now() - timestamp;
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        return Math.exp(-ageDays / 30); // 30天半衰期
    }
    
    // === 激活函数与正则化 ===
    _relu(vector) {
        return vector.map(v => Math.max(0, v));
    }
    
    _dropout(vector, rate) {
        // 训练时随机丢弃部分神经元
        return vector.map(v => Math.random() > rate ? v : 0);
    }
    
    // === 损失函数 ===
    _binaryCrossEntropy(prediction, label) {
        const epsilon = 1e-7; // 防止 log(0)
        const p = Math.max(epsilon, Math.min(1 - epsilon, prediction));
        return -(label * Math.log(p) + (1 - label) * Math.log(1 - p));
    }
    
    // === 梯度更新 ===
    _updateEmbedding(nodeId, gradient) {
        const embedding = this.embeddings.get(nodeId);
        if (!embedding) return;
        
        const updated = embedding.map(v => v - this.config.learningRate * gradient);
        this.embeddings.set(nodeId, updated);
    }
    
    // === 向量/矩阵运算 ===
    _randomVector(dim) {
        return Array(dim).fill(0).map(() => (Math.random() - 0.5) * 0.1);
    }
    
    _randomMatrix(rows, cols) {
        return Array(rows).fill(0).map(() => this._randomVector(cols));
    }
    
    _matrixMultiply(vector, matrix) {
        // vector (1 x n) × matrix (n x m) = result (1 x m)
        const result = new Array(matrix[0].length).fill(0);
        for (let j = 0; j < matrix[0].length; j++) {
            for (let i = 0; i < vector.length; i++) {
                result[j] += vector[i] * matrix[i][j];
            }
        }
        return result;
    }
    
    _vectorAdd(a, b) {
        return a.map((v, i) => v + b[i]);
    }
    
    _scalarMultiply(vector, scalar) {
        return vector.map(v => v * scalar);
    }
    
    _dotProduct(a, b) {
        return a.reduce((sum, v, i) => sum + v * b[i], 0);
    }
    
    _cosineSimilarity(a, b) {
        const dot = this._dotProduct(a, b);
        const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
        const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
        return normA && normB ? dot / (normA * normB) : 0;
    }
    
    _shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
    
    // === 导出/导入模型 ===
    exportModel() {
        return {
            config: this.config,
            embeddings: Array.from(this.embeddings.entries()),
            weights: this.weights,
            performance: this.performance,
            trainingHistory: this.trainingHistory
        };
    }
    
    importModel(modelData) {
        this.config = modelData.config;
        this.embeddings = new Map(modelData.embeddings);
        this.weights = modelData.weights;
        this.performance = modelData.performance;
        this.trainingHistory = modelData.trainingHistory;
        this.initialized = true;
        console.log('[GNN] 模型导入完成');
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GNNRecommender };
} else {
    window.GNNRecommender = GNNRecommender;
}