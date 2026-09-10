// Phase 3: 图谱扩散算法模块
// 参考: ST-BME的PageRank + Anima的DPP多样性采样

class GraphDiffusion {
    constructor(graph) {
        this.graph = graph;
    }
    
    // PageRank算法 - 计算节点重要度
    pageRank(options = {}) {
        const {
            dampingFactor = 0.85,
            maxIterations = 30,
            tolerance = 1e-6,
            startNodes = null
        } = options;
        
        const nodes = Array.from(this.graph.nodes.values());
        if (nodes.length === 0) return new Map();
        
        // 初始化PageRank值
        const ranks = new Map();
        const initialRank = 1.0 / nodes.length;
        for (const node of nodes) {
            ranks.set(node.id, startNodes && startNodes.includes(node.id) ? 1.0 : initialRank);
        }
        
        // 构建邻接表
        const outLinks = new Map();
        const inLinks = new Map();
        for (const node of nodes) {
            outLinks.set(node.id, []);
            inLinks.set(node.id, []);
        }
        
        for (const edge of this.graph.edges.values()) {
            const fromLinks = outLinks.get(edge.from);
            const toLinks = inLinks.get(edge.to);
            if (fromLinks) fromLinks.push({to: edge.to, weight: edge.weight || 1.0});
            if (toLinks) toLinks.push({from: edge.from, weight: edge.weight || 1.0});
        }
        
        // 迭代计算
        for (let iter = 0; iter < maxIterations; iter++) {
            const newRanks = new Map();
            let diff = 0;
            
            for (const node of nodes) {
                const nodeId = node.id;
                let rank = (1 - dampingFactor) / nodes.length;
                
                const incoming = inLinks.get(nodeId) || [];
                for (const {from, weight} of incoming) {
                    const fromRank = ranks.get(from) || 0;
                    const outDegree = (outLinks.get(from) || []).length || 1;
                    rank += dampingFactor * (fromRank / outDegree) * weight;
                }
                
                newRanks.set(nodeId, rank);
                diff += Math.abs(rank - (ranks.get(nodeId) || 0));
            }
            
            ranks.clear();
            for (const [id, rank] of newRanks) ranks.set(id, rank);
            
            if (diff < tolerance) break;
        }
        
        return ranks;
    }
    
    // 个性化PageRank - 从种子节点扩散
    personalizedPageRank(seedNodes, hops = 3, topK = 10) {
        const seedIds = seedNodes.map(n => n.id || n);
        const ranks = this.pageRank({
            dampingFactor: 0.85,
            maxIterations: 20,
            startNodes: seedIds
        });
        
        // 排序并返回Top-K
        const sorted = Array.from(ranks.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, topK);
        
        return sorted.map(([nodeId, score]) => ({
            node: this.graph.nodes.get(nodeId),
            score,
            source: 'pagerank'
        }));
    }
    
    // DPP (Determinantal Point Process) 多样性采样
    // 在高分节点中选择多样化的子集
    diversitySampling(candidates, k = 5, lambdaDiversity = 0.5) {
        if (candidates.length <= k) return candidates;
        
        // 计算相似度矩阵（基于共享邻居）
        const n = candidates.length;
        const similarity = Array(n).fill(0).map(() => Array(n).fill(0));
        
        for (let i = 0; i < n; i++) {
            for (let j = i; j < n; j++) {
                if (i === j) {
                    similarity[i][j] = 1.0;
                } else {
                    const nodeI = candidates[i].node || candidates[i];
                    const nodeJ = candidates[j].node || candidates[j];
                    const sim = this.computeNodeSimilarity(nodeI, nodeJ);
                    similarity[i][j] = similarity[j][i] = sim;
                }
            }
        }
        
        // 贪心选择：每次选择与已选集合差异最大的节点
        const selected = [];
        const selectedIndices = new Set();
        
        // 第一个节点：选择分数最高的
        let maxScoreIdx = 0;
        let maxScore = candidates[0].score || 0;
        for (let i = 1; i < n; i++) {
            if ((candidates[i].score || 0) > maxScore) {
                maxScore = candidates[i].score || 0;
                maxScoreIdx = i;
            }
        }
        selected.push(candidates[maxScoreIdx]);
        selectedIndices.add(maxScoreIdx);
        
        // 选择剩余k-1个节点
        while (selected.length < k && selected.length < n) {
            let bestIdx = -1;
            let bestScore = -Infinity;
            
            for (let i = 0; i < n; i++) {
                if (selectedIndices.has(i)) continue;
                
                // 计算多样性得分：原始分数 - λ * 与已选节点的平均相似度
                const originalScore = candidates[i].score || 0;
                let avgSimilarity = 0;
                for (const selIdx of selectedIndices) {
                    avgSimilarity += similarity[i][selIdx];
                }
                avgSimilarity /= selectedIndices.size;
                
                const diversityScore = originalScore - lambdaDiversity * avgSimilarity;
                
                if (diversityScore > bestScore) {
                    bestScore = diversityScore;
                    bestIdx = i;
                }
            }
            
            if (bestIdx !== -1) {
                selected.push(candidates[bestIdx]);
                selectedIndices.add(bestIdx);
            } else {
                break;
            }
        }
        
        return selected;
    }
    
    // 计算两个节点的相似度（基于共享邻居）
    computeNodeSimilarity(nodeA, nodeB) {
        const neighborsA = this.getNeighbors(nodeA.id);
        const neighborsB = this.getNeighbors(nodeB.id);
        
        if (neighborsA.length === 0 && neighborsB.length === 0) return 0;
        
        const setA = new Set(neighborsA);
        const setB = new Set(neighborsB);
        
        let intersection = 0;
        for (const n of setA) {
            if (setB.has(n)) intersection++;
        }
        
        const union = setA.size + setB.size - intersection;
        return union > 0 ? intersection / union : 0;
    }
    
    // 获取节点的邻居
    getNeighbors(nodeId) {
        const neighbors = [];
        for (const edge of this.graph.edges.values()) {
            if (edge.from === nodeId) neighbors.push(edge.to);
            if (edge.to === nodeId) neighbors.push(edge.from);
        }
        return neighbors;
    }
    
    // 边权重学习 - 基于时间衰减和交互频率
    updateEdgeWeights(timeDecayFactor = 0.95) {
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;
        
        for (const edge of this.graph.edges.values()) {
            const ageInDays = (now - (edge.timestamp || now)) / oneDayMs;
            const timeFactor = Math.pow(timeDecayFactor, ageInDays);
            
            // 频率因子（假设edge.data.count记录了交互次数）
            const frequency = (edge.data?.count || 1);
            const frequencyFactor = Math.log(1 + frequency);
            
            // 综合权重
            edge.weight = timeFactor * frequencyFactor;
        }
    }
    
    // 社区检测 - 简化的Louvain算法
    detectCommunities() {
        const nodes = Array.from(this.graph.nodes.values());
        const communities = new Map();
        
        // 初始化：每个节点为一个社区
        for (const node of nodes) {
            communities.set(node.id, node.id);
        }
        
        // 简化版：基于边权重聚合
        let changed = true;
        let iterations = 0;
        const maxIterations = 10;
        
        while (changed && iterations < maxIterations) {
            changed = false;
            iterations++;
            
            for (const node of nodes) {
                const neighborCommunities = new Map();
                
                // 统计邻居社区的权重和
                for (const edge of this.graph.edges.values()) {
                    let neighborId = null;
                    if (edge.from === node.id) neighborId = edge.to;
                    else if (edge.to === node.id) neighborId = edge.from;
                    
                    if (neighborId) {
                        const commId = communities.get(neighborId);
                        const weight = edge.weight || 1.0;
                        neighborCommunities.set(commId, (neighborCommunities.get(commId) || 0) + weight);
                    }
                }
                
                // 选择权重和最大的社区
                let bestComm = communities.get(node.id);
                let bestWeight = neighborCommunities.get(bestComm) || 0;
                
                for (const [commId, weight] of neighborCommunities) {
                    if (weight > bestWeight) {
                        bestWeight = weight;
                        bestComm = commId;
                    }
                }
                
                if (bestComm !== communities.get(node.id)) {
                    communities.set(node.id, bestComm);
                    changed = true;
                }
            }
        }
        
        // 整理社区结果
        const result = new Map();
        for (const [nodeId, commId] of communities) {
            if (!result.has(commId)) result.set(commId, []);
            result.get(commId).push(this.graph.nodes.get(nodeId));
        }
        
        return Array.from(result.values());
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GraphDiffusion };
} else {
    window.GraphDiffusion = GraphDiffusion;
}
// Phase 4: 可视化模块
// 参考: Anima的D3.js图谱 + 时间线视图

class MemoryVisualizer {
    constructor(engine) {
        this.engine = engine;
        this.container = null;
        this.graphView = null;
        this.timelineView = null;
    }
    
    // 创建可视化面板
    createPanel() {
        // 移除旧面板
        const old = document.getElementById('lonsha-viz-panel');
        if (old) old.remove();
        
        const panel = document.createElement('div');
        panel.id = 'lonsha-viz-panel';
        panel.innerHTML = `
            <div class="lonsha-viz-header">
                <h2>🧠 LonSha记忆可视化</h2>
                <button class="lonsha-viz-close">×</button>
            </div>
            <div class="lonsha-viz-tabs">
                <button class="lonsha-viz-tab active" data-view="graph">图谱视图</button>
                <button class="lonsha-viz-tab" data-view="timeline">时间线</button>
                <button class="lonsha-viz-tab" data-view="stats">统计面板</button>
                <button class="lonsha-viz-tab" data-view="community">社区分析</button>
            </div>
            <div class="lonsha-viz-content">
                <div id="lonsha-viz-graph" class="lonsha-viz-view active"></div>
                <div id="lonsha-viz-timeline" class="lonsha-viz-view"></div>
                <div id="lonsha-viz-stats" class="lonsha-viz-view"></div>
                <div id="lonsha-viz-community" class="lonsha-viz-view"></div>
            </div>
        `;
        
        document.body.appendChild(panel);
        this.container = panel;
        
        // 绑定事件
        panel.querySelector('.lonsha-viz-close').addEventListener('click', () => this.closePanel());
        
        const tabs = panel.querySelectorAll('.lonsha-viz-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                tabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.switchView(e.target.dataset.view);
            });
        });
        
        // 渲染初始视图
        this.renderGraphView();
        this.renderStatsView();
        this.renderTimelineView();
        this.renderCommunityView();
    }
    
    closePanel() {
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
    }
    
    switchView(viewName) {
        const views = this.container.querySelectorAll('.lonsha-viz-view');
        views.forEach(v => v.classList.remove('active'));
        const target = this.container.querySelector(`#lonsha-viz-${viewName}`);
        if (target) target.classList.add('active');
    }
    
    // 渲染图谱视图（简化版D3.js力导向图）
    renderGraphView() {
        const container = document.getElementById('lonsha-viz-graph');
        if (!container) return;
        
        const graph = this.engine.graph;
        const nodes = Array.from(graph.nodes.values());
        const edges = Array.from(graph.edges.values());
        
        if (nodes.length === 0) {
            container.innerHTML = '<div class="lonsha-empty">暂无图谱数据</div>';
            return;
        }
        
        // 使用Canvas绘制（轻量级替代D3.js）
        container.innerHTML = `
            <canvas id="lonsha-graph-canvas" width="800" height="600"></canvas>
            <div class="lonsha-graph-legend">
                <div><span class="legend-dot character"></span> 角色</div>
                <div><span class="legend-dot event"></span> 事件</div>
                <div><span class="legend-dot entity"></span> 实体</div>
            </div>
            <div class="lonsha-graph-info" id="lonsha-node-info"></div>
        `;
        
        const canvas = document.getElementById('lonsha-graph-canvas');
        const ctx = canvas.getContext('2d');
        
        // 简化的力导向布局
        const layout = this.createForceLayout(nodes, edges, canvas.width, canvas.height);
        
        // 动画渲染
        let frame = 0;
        const animate = () => {
            if (frame++ > 100) return; // 100帧后停止
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // 绘制边
            ctx.strokeStyle = '#4a5568';
            ctx.lineWidth = 1;
            for (const edge of edges) {
                const from = layout.positions.get(edge.from);
                const to = layout.positions.get(edge.to);
                if (from && to) {
                    ctx.beginPath();
                    ctx.moveTo(from.x, from.y);
                    ctx.lineTo(to.x, to.y);
                    ctx.stroke();
                }
            }
            
            // 绘制节点
            for (const node of nodes) {
                const pos = layout.positions.get(node.id);
                if (!pos) continue;
                
                const color = this.getNodeColor(node.type);
                const radius = node.type === 'character' ? 8 : 6;
                
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
                ctx.fill();
                
                // 绘制标签
                if (node.name) {
                    ctx.fillStyle = '#e2e8f0';
                    ctx.font = '10px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(node.name.substring(0, 6), pos.x, pos.y + radius + 12);
                }
            }
            
            layout.step();
            requestAnimationFrame(animate);
        };
        
        animate();
        
        // 添加交互
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            for (const node of nodes) {
                const pos = layout.positions.get(node.id);
                if (!pos) continue;
                
                const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
                if (dist < 10) {
                    this.showNodeInfo(node);
                    canvas.style.cursor = 'pointer';
                    return;
                }
            }
            canvas.style.cursor = 'default';
        });
    }
    
    // 创建简化的力导向布局
    createForceLayout(nodes, edges, width, height) {
        const positions = new Map();
        const velocities = new Map();
        
        // 随机初始化位置
        for (const node of nodes) {
            positions.set(node.id, {
                x: Math.random() * width,
                y: Math.random() * height
            });
            velocities.set(node.id, {x: 0, y: 0});
        }
        
        const step = () => {
            const damping = 0.9;
            const repulsion = 5000;
            const attraction = 0.01;
            const centerForce = 0.001;
            
            // 斥力
            for (const nodeA of nodes) {
                const posA = positions.get(nodeA.id);
                const velA = velocities.get(nodeA.id);
                
                for (const nodeB of nodes) {
                    if (nodeA.id === nodeB.id) continue;
                    const posB = positions.get(nodeB.id);
                    
                    const dx = posA.x - posB.x;
                    const dy = posA.y - posB.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    const force = repulsion / (dist * dist);
                    
                    velA.x += (dx / dist) * force;
                    velA.y += (dy / dist) * force;
                }
                
                // 中心引力
                const centerX = width / 2;
                const centerY = height / 2;
                velA.x += (centerX - posA.x) * centerForce;
                velA.y += (centerY - posA.y) * centerForce;
            }
            
            // 引力（边）
            for (const edge of edges) {
                const posFrom = positions.get(edge.from);
                const posTo = positions.get(edge.to);
                if (!posFrom || !posTo) continue;
                
                const dx = posTo.x - posFrom.x;
                const dy = posTo.y - posFrom.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                
                const force = dist * attraction;
                
                const velFrom = velocities.get(edge.from);
                const velTo = velocities.get(edge.to);
                
                velFrom.x += (dx / dist) * force;
                velFrom.y += (dy / dist) * force;
                velTo.x -= (dx / dist) * force;
                velTo.y -= (dy / dist) * force;
            }
            
            // 更新位置
            for (const node of nodes) {
                const pos = positions.get(node.id);
                const vel = velocities.get(node.id);
                
                pos.x += vel.x;
                pos.y += vel.y;
                
                // 边界限制
                pos.x = Math.max(20, Math.min(width - 20, pos.x));
                pos.y = Math.max(20, Math.min(height - 20, pos.y));
                
                vel.x *= damping;
                vel.y *= damping;
            }
        };
        
        return {positions, step};
    }
    
    getNodeColor(type) {
        const colors = {
            character: '#667eea',
            event: '#f6ad55',
            entity: '#68d391',
            default: '#a0aec0'
        };
        return colors[type] || colors.default;
    }
    
    showNodeInfo(node) {
        const infoDiv = document.getElementById('lonsha-node-info');
        if (!infoDiv) return;
        
        const neighbors = this.engine.graph.edges ? 
            Array.from(this.engine.graph.edges.values())
                .filter(e => e.from === node.id || e.to === node.id)
                .length : 0;
        
        infoDiv.innerHTML = `
            <div class="node-info-card">
                <h4>${node.name || node.id}</h4>
                <p>类型: ${node.type || '未知'}</p>
                <p>连接: ${neighbors} 条边</p>
                <p>创建: ${new Date(node.timestamp).toLocaleString()}</p>
            </div>
        `;
        infoDiv.style.display = 'block';
    }
    
    // 渲染时间线视图
    renderTimelineView() {
        const container = document.getElementById('lonsha-viz-timeline');
        if (!container) return;
        
        const summaries = this.engine.summary.summaries || [];
        
        if (summaries.length === 0) {
            container.innerHTML = '<div class="lonsha-empty">暂无时间线数据</div>';
            return;
        }
        
        // 按时间排序
        const sorted = [...summaries].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        
        let html = '<div class="lonsha-timeline">';
        for (const item of sorted) {
            const time = new Date(item.timestamp).toLocaleString();
            html += `
                <div class="timeline-item">
                    <div class="timeline-marker"></div>
                    <div class="timeline-content">
                        <div class="timeline-time">${time}</div>
                        <div class="timeline-text">${item.text || ''}</div>
                        <div class="timeline-floor">楼层 #${item.floor || 0}</div>
                    </div>
                </div>
            `;
        }
        html += '</div>';
        
        container.innerHTML = html;
    }
    
    // 渲染统计面板
    renderStatsView() {
        const container = document.getElementById('lonsha-viz-stats');
        if (!container) return;
        
        const stats = {
            nodes: this.engine.graph.nodes.size,
            edges: this.engine.graph.edges.size,
            characters: Array.from(this.engine.graph.nodes.values()).filter(n => n.type === 'character').length,
            events: Array.from(this.engine.graph.nodes.values()).filter(n => n.type === 'event').length,
            summaries: this.engine.summary.summaries.length,
            diaries: Object.keys(this.engine.diary.diaries).length,
            vectors: this.engine.vector.vectors.length
        };
        
        container.innerHTML = `
            <div class="lonsha-stats-grid">
                <div class="stat-card">
                    <div class="stat-icon">📊</div>
                    <div class="stat-value">${stats.nodes}</div>
                    <div class="stat-label">图谱节点</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">🔗</div>
                    <div class="stat-value">${stats.edges}</div>
                    <div class="stat-label">关系边</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">👥</div>
                    <div class="stat-value">${stats.characters}</div>
                    <div class="stat-label">角色数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">⚡</div>
                    <div class="stat-value">${stats.events}</div>
                    <div class="stat-label">事件数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">📝</div>
                    <div class="stat-value">${stats.summaries}</div>
                    <div class="stat-label">摘要数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">📖</div>
                    <div class="stat-value">${stats.diaries}</div>
                    <div class="stat-label">日记数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">🧮</div>
                    <div class="stat-value">${stats.vectors}</div>
                    <div class="stat-label">向量数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">💾</div>
                    <div class="stat-value">${this.estimateSize()} KB</div>
                    <div class="stat-label">存储占用</div>
                </div>
            </div>
            
            <div class="lonsha-actions">
                <button class="lonsha-btn" onclick="window.LonShaMemory.visualizer.exportData()">导出数据</button>
                <button class="lonsha-btn" onclick="window.LonShaMemory.visualizer.clearData()">清空数据</button>
                <button class="lonsha-btn" onclick="window.LonShaMemory.visualizer.runPageRank()">运行PageRank</button>
            </div>
        `;
    }
    
    // 渲染社区分析视图
    renderCommunityView() {
        const container = document.getElementById('lonsha-viz-community');
        if (!container) return;
        
        if (!window.GraphDiffusion) {
            container.innerHTML = '<div class="lonsha-empty">图算法模块未加载</div>';
            return;
        }
        
        const diffusion = new GraphDiffusion(this.engine.graph);
        const communities = diffusion.detectCommunities();
        
        if (communities.length === 0) {
            container.innerHTML = '<div class="lonsha-empty">暂无社区数据</div>';
            return;
        }
        
        let html = '<div class="lonsha-communities">';
        html += `<h3>检测到 ${communities.length} 个社区</h3>`;
        
        for (let i = 0; i < communities.length; i++) {
            const comm = communities[i];
            html += `
                <div class="community-card">
                    <div class="community-header">社区 ${i + 1} (${comm.length} 个节点)</div>
                    <div class="community-members">
                        ${comm.map(n => `<span class="member-tag">${n.name || n.id}</span>`).join('')}
                    </div>
                </div>
            `;
        }
        
        html += '</div>';
        container.innerHTML = html;
    }
    
    estimateSize() {
        try {
            const data = {
                graph: this.engine.graph.export(),
                summaries: this.engine.summary.export(),
                diaries: this.engine.diary.export(),
                vectors: this.engine.vector.export()
            };
            return Math.round(JSON.stringify(data).length / 1024);
        } catch {
            return 0;
        }
    }
    
    exportData() {
        const data = {
            graph: this.engine.graph.export(),
            summaries: this.engine.summary.export(),
            diaries: this.engine.diary.export(),
            vectors: this.engine.vector.export(),
            exportTime: Date.now()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lonsha-memory-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    clearData() {
        if (!confirm('确定要清空所有记忆数据吗？此操作不可恢复。')) return;
        
        this.engine.graph.nodes.clear();
        this.engine.graph.edges.clear();
        this.engine.graph.nameIndex.clear();
        this.engine.summary.summaries = [];
        this.engine.diary.diaries = {};
        this.engine.vector.vectors = [];
        
        alert('数据已清空');
        this.createPanel(); // 重新渲染
    }
    
    async runPageRank() {
        if (!window.GraphDiffusion) {
            alert('图算法模块未加载');
            return;
        }
        
        const diffusion = new GraphDiffusion(this.engine.graph);
        const ranks = diffusion.pageRank();
        
        const sorted = Array.from(ranks.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        let result = 'Top 10 重要节点（PageRank）:\n\n';
        for (const [nodeId, score] of sorted) {
            const node = this.engine.graph.nodes.get(nodeId);
            result += `${node?.name || nodeId}: ${score.toFixed(4)}\n`;
        }
        
        alert(result);
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MemoryVisualizer };
} else {
    window.MemoryVisualizer = MemoryVisualizer;
}