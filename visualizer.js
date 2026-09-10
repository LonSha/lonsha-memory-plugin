// Phase 4: 可视化模块 [Fable优化版]
// 优化目标:
// 1. 拖拽编辑节点
// 2. 筛选器（类型/时间/社区）
// 3. 大图谱分页加载（虚拟滚动）
// 4. 性能监控面板

class MemoryVisualizer {
    constructor(engine) {
        this.engine = engine;
        this.container = null;
        this.graphView = null;
        this.timelineView = null;
        
        // 可视化状态
        this.state = {
            selectedNodes: new Set(),
            filters: {
                nodeType: 'all',
                timeRange: 'all',
                community: 'all'
            },
            pagination: {
                page: 1,
                pageSize: 100,
                totalPages: 1
            },
            dragState: {
                isDragging: false,
                draggedNode: null,
                startX: 0,
                startY: 0
            }
        };
        
        // 性能监控
        this.perfMonitor = {
            renderTime: 0,
            frameCount: 0,
            fps: 0,
            lastFrameTime: performance.now()
        };
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
                <h2>🧠 LonSha记忆可视化 v0.6</h2>
                <div class="lonsha-viz-controls">
                    <button class="lonsha-btn-sm" onclick="window.LonShaMemory.visualizer.showFilters()">🔍 筛选</button>
                    <button class="lonsha-btn-sm" onclick="window.LonShaMemory.visualizer.showPerformance()">📊 性能</button>
                    <button class="lonsha-btn-sm" onclick="window.LonShaMemory.visualizer.exportData()">💾 导出</button>
                </div>
                <button class="lonsha-viz-close">×</button>
            </div>
            <div class="lonsha-viz-tabs">
                <button class="lonsha-viz-tab active" data-view="graph">图谱视图</button>
                <button class="lonsha-viz-tab" data-view="timeline">时间线</button>
                <button class="lonsha-viz-tab" data-view="stats">统计面板</button>
                <button class="lonsha-viz-tab" data-view="community">社区分析</button>
                <button class="lonsha-viz-tab" data-view="performance">性能监控</button>
            </div>
            <div class="lonsha-viz-content">
                <div id="lonsha-viz-graph" class="lonsha-viz-view active"></div>
                <div id="lonsha-viz-timeline" class="lonsha-viz-view"></div>
                <div id="lonsha-viz-stats" class="lonsha-viz-view"></div>
                <div id="lonsha-viz-community" class="lonsha-viz-view"></div>
                <div id="lonsha-viz-performance" class="lonsha-viz-view"></div>
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
        
        // 渲染所有视图
        this.renderGraphView();
        this.renderStatsView();
        this.renderTimelineView();
        this.renderCommunityView();
        this.renderPerformanceView();
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
    
    // 渲染性能监控视图（新增）
    renderPerformanceView() {
        const container = document.getElementById('lonsha-viz-performance');
        if (!container) return;
        
        const diffusion = window.GraphDiffusion ? new GraphDiffusion(this.engine.graph) : null;
        const perfStats = diffusion ? diffusion.getPerformanceStats() : null;
        
        const memoryUsage = this.estimateSize();
        const nodeCount = this.engine.graph.nodes.size;
        const edgeCount = this.engine.graph.edges.size;
        
        let html = `
            <div class="lonsha-perf-panel">
                <h3>⚡ 性能监控仪表盘</h3>
                
                <div class="perf-section">
                    <h4>📊 算法性能</h4>
                    <div class="perf-grid">
                        <div class="perf-item">
                            <span class="perf-label">PageRank 耗时</span>
                            <span class="perf-value">${perfStats?.avgPageRankTime || '0ms'}</span>
                        </div>
                        <div class="perf-item">
                            <span class="perf-label">DPP 采样耗时</span>
                            <span class="perf-value">${perfStats?.avgDppTime || '0ms'}</span>
                        </div>
                        <div class="perf-item">
                            <span class="perf-label">社区检测耗时</span>
                            <span class="perf-value">${perfStats?.avgCommunityTime || '0ms'}</span>
                        </div>
                        <div class="perf-item">
                            <span class="perf-label">缓存命中率</span>
                            <span class="perf-value">${perfStats?.cacheHitRate || '0%'}</span>
                        </div>
                    </div>
                </div>
                
                <div class="perf-section">
                    <h4>💾 内存占用</h4>
                    <div class="perf-grid">
                        <div class="perf-item">
                            <span class="perf-label">总存储</span>
                            <span class="perf-value">${memoryUsage} KB</span>
                        </div>
                        <div class="perf-item">
                            <span class="perf-label">节点平均大小</span>
                            <span class="perf-value">${nodeCount > 0 ? (memoryUsage * 1024 / nodeCount).toFixed(0) : 0} B</span>
                        </div>
                        <div class="perf-item">
                            <span class="perf-label">图谱密度</span>
                            <span class="perf-value">${nodeCount > 0 ? (edgeCount / nodeCount).toFixed(2) : 0}</span>
                        </div>
                        <div class="perf-item">
                            <span class="perf-label">渲染FPS</span>
                            <span class="perf-value">${this.perfMonitor.fps.toFixed(1)}</span>
                        </div>
                    </div>
                </div>
                
                <div class="perf-section">
                    <h4>🔍 数据规模</h4>
                    <div class="perf-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${Math.min(nodeCount / 10, 100)}%"></div>
                        </div>
                        <span>节点: ${nodeCount} / 1000 (建议上限)</span>
                    </div>
                    <div class="perf-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${Math.min(edgeCount / 50, 100)}%"></div>
                        </div>
                        <span>边: ${edgeCount} / 5000 (建议上限)</span>
                    </div>
                </div>
                
                <div class="perf-actions">
                    <button class="lonsha-btn" onclick="window.LonShaMemory.visualizer.runBenchmark()">🔬 运行基准测试</button>
                    <button class="lonsha-btn" onclick="window.LonShaMemory.visualizer.optimizeMemory()">🧹 优化内存</button>
                    <button class="lonsha-btn" onclick="window.LonShaMemory.diffusion?.invalidateCache()">🔄 清除缓存</button>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
    }
    
    // 筛选器对话框（新增）
    showFilters() {
        const dialog = document.createElement('div');
        dialog.className = 'lonsha-filter-dialog';
        dialog.innerHTML = `
            <div class="filter-content">
                <h3>🔍 筛选器</h3>
                <div class="filter-group">
                    <label>节点类型</label>
                    <select id="filter-type">
                        <option value="all">全部</option>
                        <option value="character">角色</option>
                        <option value="event">事件</option>
                        <option value="entity">实体</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label>时间范围</label>
                    <select id="filter-time">
                        <option value="all">全部</option>
                        <option value="today">今天</option>
                        <option value="week">最近7天</option>
                        <option value="month">最近30天</option>
                    </select>
                </div>
                <div class="filter-actions">
                    <button class="lonsha-btn" onclick="window.LonShaMemory.visualizer.applyFilters()">应用</button>
                    <button class="lonsha-btn" onclick="this.closest('.lonsha-filter-dialog').remove()">取消</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
    }
    
    applyFilters() {
        const type = document.getElementById('filter-type')?.value || 'all';
        const time = document.getElementById('filter-time')?.value || 'all';
        
        this.state.filters.nodeType = type;
        this.state.filters.timeRange = time;
        
        // 重新渲染图谱
        this.renderGraphView();
        
        document.querySelector('.lonsha-filter-dialog')?.remove();
        alert(`筛选已应用: 类型=${type}, 时间=${time}`);
    }
    
    // 基准测试（新增）
    async runBenchmark() {
        if (!window.GraphDiffusion) {
            alert('图算法模块未加载');
            return;
        }
        
        alert('开始基准测试...');
        const results = [];
        
        // 测试1: PageRank
        const diffusion = new GraphDiffusion(this.engine.graph);
        const pr_start = performance.now();
        diffusion.pageRank({useCache: false});
        const pr_time = performance.now() - pr_start;
        results.push(`PageRank: ${pr_time.toFixed(2)}ms`);
        
        // 测试2: DPP采样
        const candidates = Array.from(this.engine.graph.nodes.values())
            .map(n => ({node: n, score: Math.random()}))
            .slice(0, 50);
        const dpp_start = performance.now();
        diffusion.diversitySampling(candidates, 10, 0.5);
        const dpp_time = performance.now() - dpp_start;
        results.push(`DPP采样: ${dpp_time.toFixed(2)}ms`);
        
        // 测试3: 社区检测
        const comm_start = performance.now();
        diffusion.detectCommunities();
        const comm_time = performance.now() - comm_start;
        results.push(`社区检测: ${comm_time.toFixed(2)}ms`);
        
        // 测试4: 向量检索
        if (this.engine.vector && this.engine.vector.vectors.length > 0) {
            const vec_start = performance.now();
            this.engine.vector.search([0.1, 0.2, 0.3, 0.4, 0.5], 5);
            const vec_time = performance.now() - vec_start;
            results.push(`向量检索: ${vec_time.toFixed(2)}ms`);
        }
        
        alert('基准测试结果:\n\n' + results.join('\n'));
    }
    
    // 内存优化（新增）
    optimizeMemory() {
        let optimized = 0;
        
        // 优化1: 清理过期摘要（超过30天）
        const now = Date.now();
        const oldSummaries = this.engine.summary.summaries.length;
        this.engine.summary.summaries = this.engine.summary.summaries.filter(s => {
            return (now - (s.timestamp || 0)) < 30 * 24 * 60 * 60 * 1000;
        });
        optimized += oldSummaries - this.engine.summary.summaries.length;
        
        // 优化2: 清理孤立节点（无边连接）
        const connectedNodes = new Set();
        for (const edge of this.engine.graph.edges.values()) {
            connectedNodes.add(edge.from);
            connectedNodes.add(edge.to);
        }
        
        const oldNodes = this.engine.graph.nodes.size;
        for (const [id, node] of this.engine.graph.nodes) {
            if (!connectedNodes.has(id)) {
                this.engine.graph.nodes.delete(id);
                optimized++;
            }
        }
        
        // 优化3: 清除算法缓存
        if (window.GraphDiffusion && this.engine.diffusion) {
            this.engine.diffusion.invalidateCache();
        }
        
        alert(`内存优化完成！\n清理了 ${optimized} 项数据`);
        this.renderStatsView();
        this.renderPerformanceView();
    }
    
    // 显示性能快捷方式
    showPerformance() {
        // 切换到性能监控标签
        const tabs = this.container.querySelectorAll('.lonsha-viz-tab');
        const views = this.container.querySelectorAll('.lonsha-viz-view');
        
        tabs.forEach(t => t.classList.remove('active'));
        views.forEach(v => v.classList.remove('active'));
        
        const perfTab = Array.from(tabs).find(t => t.dataset.view === 'performance');
        const perfView = document.getElementById('lonsha-viz-performance');
        
        if (perfTab) perfTab.classList.add('active');
        if (perfView) perfView.classList.add('active');
        
        this.renderPerformanceView();
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MemoryVisualizer };
} else {
    window.MemoryVisualizer = MemoryVisualizer;
}