// Phase 8: LLM 自动实体抽取增强
// llm-entity-extractor.js - 高精度结构化信息提取（目标 F1 > 90%）

class LLMEntityExtractor {
    constructor(llmCaller, config = {}) {
        this.llm = llmCaller;
        this.config = {
            targetF1: config.targetF1 || 0.90,
            minConfidence: config.minConfidence || 0.85,
            maxRetries: config.maxRetries || 2,
            useChainOfThought: config.useChainOfThought !== false,
            useSelfCorrection: config.useSelfCorrection !== false,
            ...config
        };
        
        this.performance = {
            precision: 0,
            recall: 0,
            f1Score: 0,
            totalExtracted: 0,
            totalCorrect: 0
        };
        
        // 实体类型定义（扩展版）
        this.entityTypes = {
            CHARACTER: '角色',
            LOCATION: '地点',
            ORGANIZATION: '组织',
            EVENT: '事件',
            ITEM: '物品',
            CONCEPT: '概念',
            EMOTION: '情感',
            RELATIONSHIP: '关系',
            TIME: '时间'
        };
        
        // 提取模板（Chain-of-Thought 版本）
        this.extractionPrompt = `你是一个专业的实体抽取助手。请仔细分析以下对话，提取结构化信息。

**分析步骤**（思维链）：
1. 通读对话，识别关键实体（角色、地点、物品等）
2. 分析实体之间的关系（互动、依赖、冲突等）
3. 提取重要事件及其时间顺序
4. 总结核心情感和主题

**对话内容**：
{{CONTENT}}

**输出格式**（严格 JSON）：
\`\`\`json
{
  "reasoning": "简要分析思路（1-2句话）",
  "entities": [
    {
      "name": "实体名称",
      "type": "CHARACTER|LOCATION|ORGANIZATION|EVENT|ITEM|CONCEPT|EMOTION|TIME",
      "attributes": {
        "description": "简要描述",
        "importance": 0.0-1.0,
        "sentiment": "positive|neutral|negative"
      },
      "mentions": [{"text": "原文引用", "position": 行号}]
    }
  ],
  "relationships": [
    {
      "source": "实体A",
      "target": "实体B",
      "type": "关系类型（如：朋友、敌对、拥有、位于）",
      "strength": 0.0-1.0,
      "description": "关系描述"
    }
  ],
  "events": [
    {
      "type": "事件类型",
      "description": "事件描述",
      "participants": ["参与者列表"],
      "time": "时间表达（相对/绝对）",
      "location": "地点（可选）",
      "significance": 0.0-1.0
    }
  ],
  "summary": {
    "brief": "一句话总结",
    "keyPoints": ["关键点1", "关键点2", "..."],
    "sentiment": "整体情感倾向",
    "topics": ["主题标签1", "主题标签2"]
  },
  "confidence": 0.0-1.0
}
\`\`\`

**要求**：
- 实体名称必须准确（直接引用原文）
- 关系必须有明确依据（不要臆测）
- 事件按时间顺序排列
- confidence 反映提取质量（低于 0.85 视为不确定）`;

        // 自校正提示词
        this.selfCorrectionPrompt = `请检查以下提取结果是否准确：

**原始对话**：
{{CONTENT}}

**提取结果**：
{{EXTRACTION}}

**检查项**：
1. 实体名称是否与原文一致？
2. 关系是否有明确依据？
3. 事件顺序是否正确？
4. 是否遗漏重要信息？
5. 是否存在幻觉（原文没有的内容）？

如果发现错误，请输出修正后的 JSON（格式同上）。如果正确无误，输出 \`{"status": "correct", "extraction": 原结果}\`。`;
    }
    
    // 提取结构化信息（带重试和自校正）
    async extract(content, options = {}) {
        const startTime = Date.now();
        let attempt = 0;
        let bestResult = null;
        let bestConfidence = 0;
        
        while (attempt < this.config.maxRetries) {
            attempt++;
            
            try {
                console.log(`[LLM提取] 尝试 ${attempt}/${this.config.maxRetries}...`);
                
                // 第一步：基础提取
                const prompt = this.extractionPrompt.replace('{{CONTENT}}', content);
                const rawResponse = await this.llm.call(prompt, {
                    temperature: 0.3, // 低温度保证稳定性
                    max_tokens: 2000
                });
                
                // 解析 JSON
                let extraction = this._parseJSON(rawResponse);
                if (!extraction) {
                    console.warn(`[LLM提取] 第 ${attempt} 次尝试解析失败，重试...`);
                    continue;
                }
                
                // 第二步：自校正（可选）
                if (this.config.useSelfCorrection && extraction.confidence < this.config.minConfidence) {
                    console.log(`[LLM提取] 置信度 ${(extraction.confidence * 100).toFixed(1)}% < ${this.config.minConfidence * 100}%，启动自校正...`);
                    
                    const correctionPrompt = this.selfCorrectionPrompt
                        .replace('{{CONTENT}}', content)
                        .replace('{{EXTRACTION}}', JSON.stringify(extraction, null, 2));
                    
                    const correctionResponse = await this.llm.call(correctionPrompt, {
                        temperature: 0.2,
                        max_tokens: 2000
                    });
                    
                    const corrected = this._parseJSON(correctionResponse);
                    if (corrected && corrected.status === 'correct') {
                        extraction = corrected.extraction;
                        extraction.selfCorrected = false;
                    } else if (corrected) {
                        extraction = corrected;
                        extraction.selfCorrected = true;
                        console.log('[LLM提取] 自校正完成');
                    }
                }
                
                // 后处理：规范化和验证
                extraction = this._postProcess(extraction, content);
                
                // 记录最佳结果
                if (extraction.confidence > bestConfidence) {
                    bestResult = extraction;
                    bestConfidence = extraction.confidence;
                }
                
                // 如果达到目标置信度，直接返回
                if (extraction.confidence >= this.config.minConfidence) {
                    console.log(`[LLM提取] 成功！置信度 ${(extraction.confidence * 100).toFixed(1)}%，耗时 ${Date.now() - startTime}ms`);
                    this._updatePerformance(extraction);
                    return extraction;
                }
                
            } catch (error) {
                console.error(`[LLM提取] 第 ${attempt} 次尝试出错:`, error.message);
            }
        }
        
        // 所有尝试后返回最佳结果
        if (bestResult) {
            console.log(`[LLM提取] 返回最佳结果（置信度 ${(bestConfidence * 100).toFixed(1)}%），耗时 ${Date.now() - startTime}ms`);
            this._updatePerformance(bestResult);
            return bestResult;
        }
        
        // 失败兜底：返回空结果
        console.warn('[LLM提取] 所有尝试失败，返回空结果');
        return this._emptyResult();
    }
    
    // 批量提取（处理多条消息）
    async extractBatch(messages, options = {}) {
        const results = [];
        const batchSize = options.batchSize || 5;
        
        console.log(`[LLM批量提取] 开始处理 ${messages.length} 条消息，批次大小 ${batchSize}`);
        
        for (let i = 0; i < messages.length; i += batchSize) {
            const batch = messages.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(msg => this.extract(msg.content || msg.mes || ''))
            );
            results.push(...batchResults);
            
            console.log(`[LLM批量提取] 进度: ${Math.min(i + batchSize, messages.length)}/${messages.length}`);
        }
        
        // 聚合统计
        const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
        const totalEntities = results.reduce((sum, r) => sum + (r.entities?.length || 0), 0);
        
        console.log(`[LLM批量提取] 完成！平均置信度 ${(avgConfidence * 100).toFixed(1)}%，提取 ${totalEntities} 个实体`);
        
        return {
            results,
            stats: {
                total: results.length,
                avgConfidence,
                totalEntities,
                performance: this.performance
            }
        };
    }
    
    // JSON 解析（容错）
    _parseJSON(text) {
        try {
            // 尝试提取 JSON 代码块
            const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const jsonStr = jsonMatch[1] || jsonMatch[0];
                return JSON.parse(jsonStr);
            }
            // 直接解析
            return JSON.parse(text);
        } catch (error) {
            console.warn('[JSON解析] 失败:', error.message);
            return null;
        }
    }
    
    // 后处理：规范化和验证
    _postProcess(extraction, originalContent) {
        if (!extraction) return this._emptyResult();
        
        // 确保必要字段存在
        extraction.entities = extraction.entities || [];
        extraction.relationships = extraction.relationships || [];
        extraction.events = extraction.events || [];
        extraction.summary = extraction.summary || {};
        extraction.confidence = extraction.confidence || 0.5;
        
        // 去重实体（按名称）
        const seenEntities = new Set();
        extraction.entities = extraction.entities.filter(e => {
            if (seenEntities.has(e.name)) return false;
            seenEntities.add(e.name);
            return true;
        });
        
        // 验证关系（确保引用的实体存在）
        const entityNames = new Set(extraction.entities.map(e => e.name));
        extraction.relationships = extraction.relationships.filter(r => 
            entityNames.has(r.source) && entityNames.has(r.target)
        );
        
        // 规范化类型（统一大写）
        extraction.entities = extraction.entities.map(e => ({
            ...e,
            type: (e.type || 'CONCEPT').toUpperCase()
        }));
        
        // 计算综合置信度（考虑实体数量和质量）
        const entityConfidence = extraction.entities.length > 0 ? 
            extraction.entities.reduce((sum, e) => sum + (e.attributes?.importance || 0.5), 0) / extraction.entities.length : 0;
        
        extraction.confidence = Math.min(
            extraction.confidence * 0.6 + entityConfidence * 0.4,
            1.0
        );
        
        return extraction;
    }
    
    // 空结果兜底
    _emptyResult() {
        return {
            reasoning: "提取失败",
            entities: [],
            relationships: [],
            events: [],
            summary: {
                brief: "",
                keyPoints: [],
                sentiment: "neutral",
                topics: []
            },
            confidence: 0
        };
    }
    
    // 更新性能指标
    _updatePerformance(extraction) {
        this.performance.totalExtracted += extraction.entities.length;
        
        // 简化版：假设高置信度 = 高准确率
        if (extraction.confidence >= this.config.minConfidence) {
            this.performance.totalCorrect += extraction.entities.length;
        } else {
            this.performance.totalCorrect += Math.floor(extraction.entities.length * extraction.confidence);
        }
        
        // 计算 Precision, Recall, F1（简化估算）
        this.performance.precision = this.performance.totalExtracted > 0 ?
            this.performance.totalCorrect / this.performance.totalExtracted : 0;
        
        this.performance.recall = this.performance.precision; // 假设召回率接近精确率
        
        this.performance.f1Score = this.performance.precision > 0 && this.performance.recall > 0 ?
            2 * (this.performance.precision * this.performance.recall) / (this.performance.precision + this.performance.recall) : 0;
    }
    
    // 评估（与人工标注对比）
    evaluateAgainstGroundTruth(extractions, groundTruths) {
        let tp = 0, fp = 0, fn = 0;
        
        for (let i = 0; i < extractions.length; i++) {
            const extracted = new Set(extractions[i].entities.map(e => e.name));
            const truth = new Set(groundTruths[i].entities.map(e => e.name));
            
            // True Positives: 提取正确的
            for (const entity of extracted) {
                if (truth.has(entity)) tp++;
                else fp++; // False Positives: 提取错误的
            }
            
            // False Negatives: 遗漏的
            for (const entity of truth) {
                if (!extracted.has(entity)) fn++;
            }
        }
        
        const precision = tp / (tp + fp) || 0;
        const recall = tp / (tp + fn) || 0;
        const f1Score = 2 * (precision * recall) / (precision + recall) || 0;
        
        this.performance = {
            precision,
            recall,
            f1Score,
            totalExtracted: tp + fp,
            totalCorrect: tp,
            meetsTarget: f1Score >= this.config.targetF1
        };
        
        console.log(`[LLM评估] Precision: ${(precision * 100).toFixed(1)}% | Recall: ${(recall * 100).toFixed(1)}% | F1: ${(f1Score * 100).toFixed(1)}% ${f1Score >= this.config.targetF1 ? '✓ 达标' : '✗ 未达标'}`);
        
        return this.performance;
    }
    
    // 导出性能报告
    exportReport() {
        return {
            config: this.config,
            performance: this.performance,
            timestamp: Date.now()
        };
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LLMEntityExtractor };
} else {
    window.LLMEntityExtractor = LLMEntityExtractor;
}