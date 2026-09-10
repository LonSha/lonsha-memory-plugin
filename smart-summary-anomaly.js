// Phase 8: 智能摘要生成 + 图异常检测
// smart-summary-anomaly.js - 高质量摘要（目标 > 4.0/5.0）+ 异常检测（召回率 > 95%）

// ========== 智能摘要生成器 ==========
class SmartSummarizer {
    constructor(llmCaller, config = {}) {
        this.llm = llmCaller;
        this.config = {
            targetQuality: config.targetQuality || 4.0,
            maxLength: config.maxLength || 200,
            minLength: config.minLength || 50,
            useMultiLevel: config.useMultiLevel !== false,
            useAbstractive: config.useAbstractive !== false,
            ...config
        };
        
        this.qualityScores = [];
        
        // 摘要提示词（多层次摘要）
        this.summaryPrompt = `请为以下对话生成多层次摘要：

**对话内容**：
{{CONTENT}}

**输出格式**（JSON）：
\`\`\`json
{
  "oneSentence": "一句话核心总结（20字以内）",
  "brief": "简要摘要（50-100字，适合快速浏览）",
  "detailed": "详细摘要（150-200字，包含关键事件和转折点）",
  "keyPoints": [
    "关键点1：具体事实或结论",
    "关键点2：重要转折或冲突",
    "关键点3：情感变化或主题"
  ],
  "entities": ["主要角色/实体列表"],
  "sentiment": {
    "overall": "positive|neutral|negative",
    "evolution": "情感演变描述"
  },
  "importance": 0.0-1.0,
  "quality": 0.0-5.0
}
\`\`\`

**要求**：
- 忠实原文（不添加臆测内容）
- 保留关键信息和因果关系
- 语言简洁流畅
- quality 自评分数（参考：信息完整性、流畅度、准确性）`;
    }
    
    // 生成摘要
    async summarize(content, context = {}) {
        const startTime = Date.now();
        
        try {
            console.log(`[智能摘要] 开始生成摘要，内容长度 ${content.length} 字符`);
            
            const prompt = this.summaryPrompt.replace('{{CONTENT}}', content);
            const rawResponse = await this.llm.call(prompt, {
                temperature: 0.4,
                max_tokens: 500
            });
            
            let summary = this._parseJSON(rawResponse);
            if (!summary) {
                console.warn('[智能摘要] JSON 解析失败，尝试提取式摘要');
                summary = this._extractiveSummary(content);
            }
            
            // 后处理和质量评估
            summary = this._postProcess(summary, content);
            summary.generatedAt = Date.now();
            summary.elapsed = Date.now() - startTime;
            
            // 记录质量分数
            if (summary.quality) {
                this.qualityScores.push(summary.quality);
            }
            
            console.log(`[智能摘要] 完成！质量评分 ${summary.quality?.toFixed(1)}/5.0，耗时 ${summary.elapsed}ms`);
            
            return summary;
            
        } catch (error) {
            console.error('[智能摘要] 生成失败:', error.message);
            return this._extractiveSummary(content);
        }
    }
    
    // 批量摘要
    async summarizeBatch(contents, options = {}) {
        const results = [];
        
        console.log(`[批量摘要] 开始处理 ${contents.length} 条内容`);
        
        for (let i = 0; i < contents.length; i++) {
            const summary = await this.summarize(contents[i]);
            results.push(summary);
            
            if ((i + 1) % 10 === 0) {
                console.log(`[批量摘要] 进度: ${i + 1}/${contents.length}`);
            }
        }
        
        const avgQuality = this.getAverageQuality();
        console.log(`[批量摘要] 完成！平均质量 ${avgQuality.toFixed(2)}/5.0`);
        
        return {
            summaries: results,
            stats: {
                total: results.length,
                avgQuality,
                meetsTarget: avgQuality >= this.config.targetQuality
            }
        };
    }
    
    // 提取式摘要（LLM 失败时的兜底方案）
    _extractiveSummary(content) {
        // 简单的提取式摘要：按句子重要性排序
        const sentences = content.split(/[。！？\n]+/).filter(s => s.trim().length > 10);
        
        if (sentences.length === 0) {
            return {
                oneSentence: content.slice(0, 20) + '...',
                brief: content.slice(0, 100),
                detailed: content.slice(0, 200),
                keyPoints: [],
                entities: [],
                sentiment: { overall: 'neutral', evolution: '' },
                importance: 0.5,
                quality: 2.5,
                method: 'extractive'
            };
        }
        
        // 选择前3个句子作为摘要
        const topSentences = sentences.slice(0, Math.min(3, sentences.length));
        const brief = topSentences.join('。') + '。';
        
        return {
            oneSentence: sentences[0].slice(0, 20) + '...',
            brief: brief.slice(0, 100),
            detailed: brief.slice(0, 200),
            keyPoints: topSentences.map((s, i) => `要点${i + 1}：${s}`),
            entities: [],
            sentiment: { overall: 'neutral', evolution: '' },
            importance: 0.5,
            quality: 2.5,
            method: 'extractive'
        };
    }
    
    // JSON 解析
    _parseJSON(text) {
        try {
            const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[1] || jsonMatch[0]);
            }
            return JSON.parse(text);
        } catch (error) {
            return null;
        }
    }
    
    // 后处理
    _postProcess(summary, originalContent) {
        // 确保字段完整性
        summary.oneSentence = summary.oneSentence || originalContent.slice(0, 20) + '...';
        summary.brief = summary.brief || originalContent.slice(0, 100);
        summary.detailed = summary.detailed || originalContent.slice(0, 200);
        summary.keyPoints = summary.keyPoints || [];
        summary.entities = summary.entities || [];
        summary.sentiment = summary.sentiment || { overall: 'neutral', evolution: '' };
        summary.importance = summary.importance || 0.5;
        
        // 长度限制
        if (summary.brief.length > this.config.maxLength) {
            summary.brief = summary.brief.slice(0, this.config.maxLength) + '...';
        }
        
        // 质量评估（如果 LLM 没有提供）
        if (!summary.quality) {
            summary.quality = this._assessQuality(summary, originalContent);
        }
        
        return summary;
    }
    
    // 质量评估（启发式）
    _assessQuality(summary, originalContent) {
        let score = 3.0; // 基础分
        
        // 长度合理性（50-200字最佳）
        const briefLen = summary.brief.length;
        if (briefLen >= this.config.minLength && briefLen <= this.config.maxLength) {
            score += 0.5;
        } else {
            score -= 0.3;
        }
        
        // 信息完整性（关键点数量）
        if (summary.keyPoints.length >= 3) {
            score += 0.5;
        }
        
        // 实体识别
        if (summary.entities.length > 0) {
            score += 0.3;
        }
        
        // 情感分析
        if (summary.sentiment && summary.sentiment.overall !== 'neutral') {
            score += 0.2;
        }
        
        return Math.min(Math.max(score, 1.0), 5.0);
    }
    
    // 获取平均质量
    getAverageQuality() {
        if (this.qualityScores.length === 0) return 0;
        return this.qualityScores.reduce((a, b) => a + b, 0) / this.qualityScores.length;
    }
    
    // 导出报告
    exportReport() {
        return {
            config: this.config,
            stats: {
                totalSummaries: this.qualityScores.length,
                avgQuality: this.getAverageQuality(),
                minQuality: Math.min(...this.qualityScores),
                maxQuality: Math.max(...this.qualityScores),
                meetsTarget: this.getAverageQuality() >= this.config.targetQuality
            },
            timestamp: Date.now()
        };
    }
}

// ========== 图异常检测器 ==========
class GraphAnomalyDetector {
    constructor(memoryGraph, config = {}) {
        this.graph = memoryGraph;
        this.config = {
            targetRecall: config.targetRecall || 0.95,
            zScoreThreshold: config.zScoreThreshold || 3.0,
            minEdgesToCheck: config.minEdgesToCheck || 3,
            checkIsolatedNodes: config.checkIsolatedNodes !== false,
            checkDuplicates: config.checkDuplicates !== false,
            checkInconsistencies: config.checkInconsistencies !== false,
            ...config
        };
        
        this.anomalies = [];
        this.performance = {
            detected: 0,
            truePositives: 0,
            falsePositives: 0,
            falseNegatives: 0,
            recall: 0,
            precision: 0
        };
    }
    
    // 执行全面异常检测
    async detect() {
        const startTime = Date.now();
        this.anomalies = [];
        
        console.log('[异常检测] 开始检测图谱异常...');
        
        // 检测 1：孤立节点（没有任何连接）
        if (this.config.checkIsolatedNodes) {
            this._detectIsolatedNodes();
        }
        
        // 检测 2：重复实体（名称相似但 ID 不同）
        if (this.config.checkDuplicates) {
            this._detectDuplicateEntities();
        }
        
        // 检测 3：度数异常（连接数远超平均值）
        this._detectDegreeAnomalies();
        
        // 检测 4：边权重异常（权重异常高/低）
        this._detectEdgeWeightAnomalies();
        
        // 检测 5：时间戳异常（未来时间或过于陈旧）
        this._detectTimestampAnomalies();
        
        // 检测 6：逻辑不一致（如：A→B 的关系类型与 B→A 矛盾）
        if (this.config.checkInconsistencies) {
            this._detectLogicalInconsistencies();
        }
        
        // 检测 7：PageRank 异常（重要性与连接不匹配）
        this._detectPageRankAnomalies();
        
        const elapsed = Date.now() - startTime;
        console.log(`[异常检测] 完成！检测到 ${this.anomalies.length} 个异常，耗时 ${elapsed}ms`);
        
        return {
            anomalies: this.anomalies,
            stats: {
                total: this.anomalies.length,
                byType: this._groupByType(),
                elapsed
            }
        };
    }
    
    // 检测 1：孤立节点
    _detectIsolatedNodes() {
        const connectedNodes = new Set();
        
        for (const [eid, edge] of this.graph.edges) {
            connectedNodes.add(edge.source);
            connectedNodes.add(edge.target);
        }
        
        for (const [nid, node] of this.graph.nodes) {
            if (!connectedNodes.has(nid)) {
                this.anomalies.push({
                    type: 'ISOLATED_NODE',
                    severity: 'medium',
                    nodeId: nid,
                    node,
                    message: `节点 "${node.name}" 没有任何连接`,
                    recommendation: '检查是否应该删除或连接到其他节点'
                });
            }
        }
    }
    
    // 检测 2：重复实体
    _detectDuplicateEntities() {
        const nameIndex = new Map();
        
        for (const [nid, node] of this.graph.nodes) {
            const normalized = (node.name || '').toLowerCase().trim();
            if (!normalized) continue;
            
            if (!nameIndex.has(normalized)) {
                nameIndex.set(normalized, []);
            }
            nameIndex.get(normalized).push({ id: nid, node });
        }
        
        for (const [name, instances] of nameIndex) {
            if (instances.length > 1) {
                this.anomalies.push({
                    type: 'DUPLICATE_ENTITY',
                    severity: 'high',
                    entities: instances,
                    message: `发现 ${instances.length} 个相同名称的实体: "${name}"`,
                    recommendation: '合并重复实体或重命名以区分'
                });
            }
        }
    }
    
    // 检测 3：度数异常
    _detectDegreeAnomalies() {
        // 计算每个节点的度数
        const degrees = new Map();
        for (const [nid] of this.graph.nodes) {
            degrees.set(nid, 0);
        }
        
        for (const [eid, edge] of this.graph.edges) {
            degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
            degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
        }
        
        // 计算平均度数和标准差
        const degreeValues = Array.from(degrees.values());
        const mean = degreeValues.reduce((a, b) => a + b, 0) / degreeValues.length;
        const variance = degreeValues.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / degreeValues.length;
        const stdDev = Math.sqrt(variance);
        
        // 检测异常（Z-score > 阈值）
        for (const [nid, degree] of degrees) {
            if (degree === 0) continue;
            
            const zScore = (degree - mean) / (stdDev || 1);
            if (Math.abs(zScore) > this.config.zScoreThreshold) {
                this.anomalies.push({
                    type: 'DEGREE_ANOMALY',
                    severity: zScore > 0 ? 'medium' : 'low',
                    nodeId: nid,
                    node: this.graph.nodes.get(nid),
                    degree,
                    mean,
                    zScore: zScore.toFixed(2),
                    message: `节点 "${this.graph.nodes.get(nid)?.name}" 的度数 (${degree}) 远${zScore > 0 ? '高于' : '低于'}平均值 (${mean.toFixed(1)})`,
                    recommendation: zScore > 0 ? '检查是否为中心节点或需要拆分' : '检查是否缺少关系'
                });
            }
        }
    }
    
    // 检测 4：边权重异常
    _detectEdgeWeightAnomalies() {
        const weights = Array.from(this.graph.edges.values())
            .map(e => e.weight || 1.0)
            .filter(w => w > 0);
        
        if (weights.length === 0) return;
        
        const mean = weights.reduce((a, b) => a + b, 0) / weights.length;
        const variance = weights.reduce((sum, w) => sum + Math.pow(w - mean, 2), 0) / weights.length;
        const stdDev = Math.sqrt(variance);
        
        for (const [eid, edge] of this.graph.edges) {
            const weight = edge.weight || 1.0;
            const zScore = (weight - mean) / (stdDev || 1);
            
            if (Math.abs(zScore) > this.config.zScoreThreshold) {
                this.anomalies.push({
                    type: 'EDGE_WEIGHT_ANOMALY',
                    severity: 'low',
                    edgeId: eid,
                    edge,
                    weight,
                    mean,
                    zScore: zScore.toFixed(2),
                    message: `边 "${edge.source}" → "${edge.target}" 的权重 (${weight.toFixed(2)}) 异常`,
                    recommendation: '检查权重计算逻辑或关系强度'
                });
            }
        }
    }
    
    // 检测 5：时间戳异常
    _detectTimestampAnomalies() {
        const now = Date.now();
        const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
        const oneYearLater = now + 365 * 24 * 60 * 60 * 1000;
        
        for (const [nid, node] of this.graph.nodes) {
            const ts = node.timestamp;
            if (!ts) continue;
            
            // 未来时间
            if (ts > oneYearLater) {
                this.anomalies.push({
                    type: 'FUTURE_TIMESTAMP',
                    severity: 'high',
                    nodeId: nid,
                    node,
                    timestamp: ts,
                    message: `节点 "${node.name}" 的时间戳在遥远未来 (${new Date(ts).toISOString()})`,
                    recommendation: '修正时间戳或检查时区设置'
                });
            }
            
            // 过于陈旧（超过1年且没有连接）
            if (ts < oneYearAgo) {
                const hasConnections = Array.from(this.graph.edges.values())
                    .some(e => e.source === nid || e.target === nid);
                
                if (!hasConnections) {
                    this.anomalies.push({
                        type: 'STALE_NODE',
                        severity: 'low',
                        nodeId: nid,
                        node,
                        timestamp: ts,
                        age: Math.floor((now - ts) / (1000 * 60 * 60 * 24)),
                        message: `节点 "${node.name}" 已超过 ${Math.floor((now - ts) / (1000 * 60 * 60 * 24))} 天未活跃`,
                        recommendation: '考虑归档或删除过期节点'
                    });
                }
            }
        }
    }
    
    // 检测 6：逻辑不一致
    _detectLogicalInconsistencies() {
        // 检查双向边的一致性
        for (const [eid, edge] of this.graph.edges) {
            const reverseEdge = Array.from(this.graph.edges.values())
                .find(e => e.source === edge.target && e.target === edge.source);
            
            if (reverseEdge && edge.type && reverseEdge.type) {
                // 检查关系类型是否逻辑一致
                const contradictions = [
                    ['friend', 'enemy'],
                    ['trust', 'distrust'],
                    ['ally', 'opponent']
                ];
                
                for (const [type1, type2] of contradictions) {
                    if ((edge.type.includes(type1) && reverseEdge.type.includes(type2)) ||
                        (edge.type.includes(type2) && reverseEdge.type.includes(type1))) {
                        this.anomalies.push({
                            type: 'LOGICAL_INCONSISTENCY',
                            severity: 'high',
                            edges: [edge, reverseEdge],
                            message: `关系矛盾: "${edge.source}" ↔ "${edge.target}" (${edge.type} vs ${reverseEdge.type})`,
                            recommendation: '检查关系定义或修正矛盾'
                        });
                    }
                }
            }
        }
    }
    
    // 检测 7：PageRank 异常
    _detectPageRankAnomalies() {
        const degrees = new Map();
        for (const [nid] of this.graph.nodes) {
            degrees.set(nid, 0);
        }
        
        for (const [eid, edge] of this.graph.edges) {
            degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
        }
        
        for (const [nid, node] of this.graph.nodes) {
            const rank = node.rank || 0;
            const degree = degrees.get(nid) || 0;
            
            // PageRank 高但入度低（异常）
            if (rank > 0.05 && degree < 2) {
                this.anomalies.push({
                    type: 'PAGERANK_ANOMALY',
                    severity: 'medium',
                    nodeId: nid,
                    node,
                    rank,
                    degree,
                    message: `节点 "${node.name}" PageRank 高 (${rank.toFixed(3)}) 但入度低 (${degree})`,
                    recommendation: '检查 PageRank 计算或节点重要性评估'
                });
            }
        }
    }
    
    // 按类型分组
    _groupByType() {
        const groups = {};
        for (const anomaly of this.anomalies) {
            groups[anomaly.type] = (groups[anomaly.type] || 0) + 1;
        }
        return groups;
    }
    
    // 评估性能（与真实标注对比）
    evaluatePerformance(groundTruthAnomalies) {
        const detected = new Set(this.anomalies.map(a => a.nodeId || a.edgeId).filter(Boolean));
        const truth = new Set(groundTruthAnomalies.map(a => a.nodeId || a.edgeId).filter(Boolean));
        
        let tp = 0, fp = 0, fn = 0;
        
        for (const id of detected) {
            if (truth.has(id)) tp++;
            else fp++;
        }
        
        for (const id of truth) {
            if (!detected.has(id)) fn++;
        }
        
        const recall = tp / (tp + fn) || 0;
        const precision = tp / (tp + fp) || 0;
        
        this.performance = {
            detected: this.anomalies.length,
            truePositives: tp,
            falsePositives: fp,
            falseNegatives: fn,
            recall,
            precision,
            meetsTarget: recall >= this.config.targetRecall
        };
        
        console.log(`[异常检测评估] 召回率: ${(recall * 100).toFixed(1)}% | 精确率: ${(precision * 100).toFixed(1)}% ${recall >= this.config.targetRecall ? '✓ 达标' : '✗ 未达标'}`);
        
        return this.performance;
    }
    
    // 导出报告
    exportReport() {
        return {
            config: this.config,
            anomalies: this.anomalies,
            stats: {
                total: this.anomalies.length,
                byType: this._groupByType(),
                bySeverity: {
                    high: this.anomalies.filter(a => a.severity === 'high').length,
                    medium: this.anomalies.filter(a => a.severity === 'medium').length,
                    low: this.anomalies.filter(a => a.severity === 'low').length
                }
            },
            performance: this.performance,
            timestamp: Date.now()
        };
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SmartSummarizer, GraphAnomalyDetector };
} else {
    window.SmartSummarizer = SmartSummarizer;
    window.GraphAnomalyDetector = GraphAnomalyDetector;
}