// Phase 5: WebWorker 多线程算法加速
// graph-worker.js - 在独立线程中执行算法，避免阻塞主线程

// Worker 消息处理
self.onmessage = function(e) {
    const { type, data, options } = e.data;
    
    try {
        let result;
        const startTime = performance.now();
        
        switch (type) {
            case 'pagerank':
                result = workerPageRank(data.nodes, data.edges, options);
                break;
            case 'dpp':
                result = workerDPP(data.candidates, options);
                break;
            case 'community':
                result = workerCommunity(data.nodes, data.edges, options);
                break;
            case 'batch':
                result = workerBatch(data.operations);
                break;
            default:
                throw new Error(`Unknown operation: ${type}`);
        }
        
        const elapsed = performance.now() - startTime;
        
        self.postMessage({
            success: true,
            type,
            result,
            elapsed
        });
    } catch (error) {
        self.postMessage({
            success: false,
            type,
            error: error.message
        });
    }
};

// PageRank 算法 (Worker 版本)
function workerPageRank(nodes, edges, options = {}) {
    const {
        dampingFactor = 0.85,
        maxIterations = 30,
        tolerance = 1e-6,
        startNodes = null
    } = options;
    
    if (nodes.length === 0) return {};
    
    // 初始化
    const ranks = {};
    const initialRank = 1.0 / nodes.length;
    for (const node of nodes) {
        ranks[node.id] = startNodes && startNodes.includes(node.id) ? 1.0 : initialRank;
    }
    
    // 构建邻接表
    const outLinks = {};
    const inLinks = {};
    const outDegree = {};
    
    for (const node of nodes) {
        outLinks[node.id] = [];
        inLinks[node.id] = [];
        outDegree[node.id] = 0;
    }
    
    for (const edge of edges) {
        const weight = edge.weight || 1.0;
        outLinks[edge.from]?.push({ to: edge.to, weight });
        inLinks[edge.to]?.push({ from: edge.from, weight });
        outDegree[edge.from] = (outDegree[edge.from] || 0) + 1;
    }
    
    // 自适应迭代
    let prevDiff = Infinity;
    let stableCount = 0;
    
    for (let iter = 0; iter < maxIterations; iter++) {
        const newRanks = {};
        let diff = 0;
        
        for (const node of nodes) {
            const nodeId = node.id;
            let rank = (1 - dampingFactor) / nodes.length;
            
            const incoming = inLinks[nodeId] || [];
            for (const { from, weight } of incoming) {
                const fromRank = ranks[from] || 0;
                const degree = outDegree[from] || 1;
                rank += dampingFactor * (fromRank / degree) * weight;
            }
            
            newRanks[nodeId] = rank;
            diff += Math.abs(rank - (ranks[nodeId] || 0));
        }
        
        // 自适应收敛检测
        if (diff < tolerance) {
            if (diff < prevDiff * 0.5) stableCount++;
            else stableCount = 0;
            
            if (stableCount >= 3) break;
        }
        prevDiff = diff;
        
        Object.assign(ranks, newRanks);
        
        if (diff < tolerance) break;
    }
    
    return ranks;
}

// DPP 多样性采样 (Worker 版本)
function workerDPP(candidates, options = {}) {
    const { k = 5, lambdaDiversity = 0.5 } = options;
    
    if (candidates.length <= k) return candidates;
    
    const n = Math.min(candidates.length, 50);
    const topCandidates = candidates.slice(0, n);
    
    // 计算相似度矩阵
    const similarity = Array(n).fill(0).map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
        similarity[i][i] = 1.0;
        for (let j = i + 1; j < n; j++) {
            const nodeI = topCandidates[i].node || topCandidates[i];
            const nodeJ = topCandidates[j].node || topCandidates[j];
            
            // 简化相似度计算（基于属性）
            let sim = 0;
            if (nodeI.type === nodeJ.type) sim += 0.5;
            if (nodeI.data && nodeJ.data) {
                const keysI = Object.keys(nodeI.data);
                const keysJ = Object.keys(nodeJ.data);
                const intersection = keysI.filter(k => keysJ.includes(k)).length;
                const union = new Set([...keysI, ...keysJ]).size;
                sim += 0.5 * (union > 0 ? intersection / union : 0);
            }
            
            similarity[i][j] = similarity[j][i] = sim;
        }
    }
    
    // 贪心选择
    const selected = [];
    const selectedIndices = new Set();
    
    // 第一个：最高分
    let maxScoreIdx = 0;
    let maxScore = topCandidates[0].score || 0;
    for (let i = 1; i < n; i++) {
        if ((topCandidates[i].score || 0) > maxScore) {
            maxScore = topCandidates[i].score || 0;
            maxScoreIdx = i;
        }
    }
    selected.push(topCandidates[maxScoreIdx]);
    selectedIndices.add(maxScoreIdx);
    
    // 选择剩余
    while (selected.length < k && selected.length < n) {
        let bestIdx = -1;
        let bestScore = -Infinity;
        
        for (let i = 0; i < n; i++) {
            if (selectedIndices.has(i)) continue;
            
            const originalScore = topCandidates[i].score || 0;
            let maxSim = 0;
            for (const selIdx of selectedIndices) {
                maxSim = Math.max(maxSim, similarity[i][selIdx]);
            }
            
            const diversityScore = originalScore * (1 - lambdaDiversity * maxSim);
            
            if (diversityScore > bestScore) {
                bestScore = diversityScore;
                bestIdx = i;
            }
        }
        
        if (bestIdx !== -1) {
            selected.push(topCandidates[bestIdx]);
            selectedIndices.add(bestIdx);
        } else {
            break;
        }
    }
    
    return selected;
}

// 社区检测 (Worker 版本)
function workerCommunity(nodes, edges, options = {}) {
    const { maxIterations = 15 } = options;
    
    if (nodes.length === 0) return [];
    
    const communities = {};
    for (const node of nodes) {
        communities[node.id] = node.id;
    }
    
    // 构建加权邻接表
    const weightSum = {};
    for (const node of nodes) {
        weightSum[node.id] = 0;
    }
    for (const edge of edges) {
        const w = edge.weight || 1.0;
        weightSum[edge.from] = (weightSum[edge.from] || 0) + w;
        weightSum[edge.to] = (weightSum[edge.to] || 0) + w;
    }
    
    // 多级聚合
    let changed = true;
    let iterations = 0;
    
    while (changed && iterations < maxIterations) {
        changed = false;
        iterations++;
        
        for (const node of nodes) {
            const neighborCommunities = {};
            
            for (const edge of edges) {
                let neighborId = null;
                let weight = edge.weight || 1.0;
                
                if (edge.from === node.id) neighborId = edge.to;
                else if (edge.to === node.id) neighborId = edge.from;
                
                if (neighborId) {
                    const commId = communities[neighborId];
                    neighborCommunities[commId] = (neighborCommunities[commId] || 0) + weight;
                }
            }
            
            // 选择最优社区
            let bestComm = communities[node.id];
            let bestGain = neighborCommunities[bestComm] || 0;
            
            for (const [commId, weight] of Object.entries(neighborCommunities)) {
                const nodeStrength = weightSum[node.id] || 0;
                const gain = weight - 0.1 * nodeStrength;
                
                if (gain > bestGain) {
                    bestGain = gain;
                    bestComm = commId;
                }
            }
            
            if (bestComm !== communities[node.id]) {
                communities[node.id] = bestComm;
                changed = true;
            }
        }
    }
    
    // 整理结果
    const result = {};
    for (const [nodeId, commId] of Object.entries(communities)) {
        if (!result[commId]) result[commId] = [];
        result[commId].push(nodeId);
    }
    
    // 过滤单节点社区
    return Object.values(result).filter(comm => comm.length > 1);
}

// 批量操作
function workerBatch(operations) {
    const results = [];
    for (const op of operations) {
        const startTime = performance.now();
        let result;
        
        switch (op.type) {
            case 'pagerank':
                result = workerPageRank(op.data.nodes, op.data.edges, op.options);
                break;
            case 'dpp':
                result = workerDPP(op.data.candidates, op.options);
                break;
            case 'community':
                result = workerCommunity(op.data.nodes, op.data.edges, op.options);
                break;
        }
        
        results.push({
            type: op.type,
            result,
            elapsed: performance.now() - startTime
        });
    }
    return results;
}

// 通知 Worker 准备就绪
self.postMessage({ type: 'ready' });