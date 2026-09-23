// [v3.163] 图谱扩散算法的唯一实现已归口 graph_algorithms.js（增强版：稀疏矩阵 PageRank 自适应收敛、
//   DPP 增量采样、多级社区检测、性能埋点）。此前本文件在顶层声明了与 graph_algorithms.js
//   同名的类，构成词法绑定冲突：后加载的 graph_algorithms.js 抛 SyntaxError 整文件失效，
//   因此增强版从未生效、pageRankDamping 第 4 参被本文件的朴素版丢弃。
//   现本文件不再声明该类，仅保留可视化模块，图算法一律经 window 上的全局取用。
// Phase 4: 可视化模块
// 参考: Anima的D3.js图谱 + 时间线视图

//
// [v3.193.0] 包进 IIFE + 幂等守卫。此前这里是**顶层 class 声明**：宿主把 extra_js
//   脚本加载两次（重复注入扩展、开发期热重载、宿主对同一文件二次 eval）时，
//   第二次会抛 SyntaxError: Identifier 'MemoryVisualizer' has already been declared ——
//   失败发生在**加载期**，窗口就在类声明本身，文件里任何 try/catch 都拦不住。
//   同批的 graph_algorithms.js 已是 IIFE + 守卫形态（基线健康），本文件对齐它。
(function (global) {
    'use strict';
    if (global && global.__LonShaVisualizerLoaded) return;   // 幂等：二次加载直接返回
    if (global) global.__LonShaVisualizerLoaded = true;
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
        
        const diffusion = new window.GraphDiffusion(this.engine.graph);
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
        
        const diffusion = new window.GraphDiffusion(this.engine.graph);
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
} else if (global) {
    global.MemoryVisualizer = MemoryVisualizer;
}
})(typeof window !== 'undefined' ? window : globalThis);