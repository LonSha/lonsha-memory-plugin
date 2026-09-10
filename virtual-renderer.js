// Phase 5: 虚拟滚动渲染器
// virtual-renderer.js - Canvas 视口裁剪，只渲染可见节点

class VirtualGraphRenderer {
    constructor(canvas, graph) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.graph = graph;
        
        // 视口配置
        this.viewport = {
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height,
            scale: 1.0,
            minScale: 0.1,
            maxScale: 3.0
        };
        
        // 渲染配置
        this.config = {
            nodeRadius: 6,
            edgeWidth: 1,
            labelFontSize: 10,
            renderDistance: 100, // 视口外100px也渲染（缓冲区）
            maxVisibleNodes: 200 // 最多渲染200个节点
        };
        
        // 性能监控
        this.stats = {
            totalNodes: 0,
            visibleNodes: 0,
            culledNodes: 0,
            renderTime: 0,
            fps: 0
        };
        
        // 空间索引（四叉树）
        this.quadtree = null;
        
        this.initEventListeners();
    }
    
    // 初始化事件监听
    initEventListeners() {
        // 鼠标滚轮缩放
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoom(delta, e.offsetX, e.offsetY);
        });
        
        // 拖拽平移
        let isDragging = false;
        let lastX, lastY;
        
        this.canvas.addEventListener('mousedown', (e) => {
            isDragging = true;
            lastX = e.offsetX;
            lastY = e.offsetY;
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const dx = e.offsetX - lastX;
                const dy = e.offsetY - lastY;
                this.pan(dx, dy);
                lastX = e.offsetX;
                lastY = e.offsetY;
            }
        });
        
        this.canvas.addEventListener('mouseup', () => {
            isDragging = false;
        });
        
        this.canvas.addEventListener('mouseleave', () => {
            isDragging = false;
        });
    }
    
    // 缩放
    zoom(factor, centerX, centerY) {
        const newScale = Math.max(
            this.viewport.minScale,
            Math.min(this.viewport.maxScale, this.viewport.scale * factor)
        );
        
        // 围绕鼠标位置缩放
        const worldX = (centerX - this.viewport.x) / this.viewport.scale;
        const worldY = (centerY - this.viewport.y) / this.viewport.scale;
        
        this.viewport.scale = newScale;
        this.viewport.x = centerX - worldX * newScale;
        this.viewport.y = centerY - worldY * newScale;
        
        this.render();
    }
    
    // 平移
    pan(dx, dy) {
        this.viewport.x += dx;
        this.viewport.y += dy;
        this.render();
    }
    
    // 构建四叉树空间索引
    buildQuadtree(nodes) {
        const bounds = this.calculateBounds(nodes);
        this.quadtree = new Quadtree(bounds, 10); // 每个节点最多10个对象
        
        for (const node of nodes) {
            if (node.pos) {
                this.quadtree.insert({
                    x: node.pos.x,
                    y: node.pos.y,
                    width: this.config.nodeRadius * 2,
                    height: this.config.nodeRadius * 2,
                    node
                });
            }
        }
    }
    
    // 计算节点边界
    calculateBounds(nodes) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        for (const node of nodes) {
            if (node.pos) {
                minX = Math.min(minX, node.pos.x);
                minY = Math.min(minY, node.pos.y);
                maxX = Math.max(maxX, node.pos.x);
                maxY = Math.max(maxY, node.pos.y);
            }
        }
        
        return {
            x: minX - 50,
            y: minY - 50,
            width: maxX - minX + 100,
            height: maxY - minY + 100
        };
    }
    
    // 视口裁剪：查询可见节点
    queryVisibleNodes(positions) {
        const buffer = this.config.renderDistance;
        const viewBounds = {
            x: -this.viewport.x / this.viewport.scale - buffer,
            y: -this.viewport.y / this.viewport.scale - buffer,
            width: this.viewport.width / this.viewport.scale + buffer * 2,
            height: this.viewport.height / this.viewport.scale + buffer * 2
        };
        
        const visibleNodes = [];
        
        for (const [nodeId, pos] of positions) {
            if (this.isInViewport(pos, viewBounds)) {
                visibleNodes.push({ id: nodeId, pos });
            }
        }
        
        // 限制最大可见节点数（优先显示中心节点）
        if (visibleNodes.length > this.config.maxVisibleNodes) {
            const centerX = viewBounds.x + viewBounds.width / 2;
            const centerY = viewBounds.y + viewBounds.height / 2;
            
            visibleNodes.sort((a, b) => {
                const distA = Math.sqrt((a.pos.x - centerX) ** 2 + (a.pos.y - centerY) ** 2);
                const distB = Math.sqrt((b.pos.x - centerX) ** 2 + (b.pos.y - centerY) ** 2);
                return distA - distB;
            });
            
            return visibleNodes.slice(0, this.config.maxVisibleNodes);
        }
        
        return visibleNodes;
    }
    
    // 判断节点是否在视口内
    isInViewport(pos, viewBounds) {
        return pos.x >= viewBounds.x && 
               pos.x <= viewBounds.x + viewBounds.width &&
               pos.y >= viewBounds.y && 
               pos.y <= viewBounds.y + viewBounds.height;
    }
    
    // 世界坐标转屏幕坐标
    worldToScreen(x, y) {
        return {
            x: x * this.viewport.scale + this.viewport.x,
            y: y * this.viewport.scale + this.viewport.y
        };
    }
    
    // 屏幕坐标转世界坐标
    screenToWorld(x, y) {
        return {
            x: (x - this.viewport.x) / this.viewport.scale,
            y: (y - this.viewport.y) / this.viewport.scale
        };
    }
    
    // 渲染图谱（虚拟滚动版本）
    render(nodes, edges, positions) {
        const startTime = performance.now();
        
        // 清空画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 保存变换状态
        this.ctx.save();
        
        // 应用视口变换
        this.ctx.translate(this.viewport.x, this.viewport.y);
        this.ctx.scale(this.viewport.scale, this.viewport.scale);
        
        // 查询可见节点
        const visibleNodes = this.queryVisibleNodes(positions);
        const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
        
        // 渲染可见边
        this.ctx.strokeStyle = '#4a5568';
        this.ctx.lineWidth = this.config.edgeWidth / this.viewport.scale;
        
        for (const edge of edges) {
            if (visibleNodeIds.has(edge.from) || visibleNodeIds.has(edge.to)) {
                const fromPos = positions.get(edge.from);
                const toPos = positions.get(edge.to);
                
                if (fromPos && toPos) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(fromPos.x, fromPos.y);
                    this.ctx.lineTo(toPos.x, toPos.y);
                    this.ctx.stroke();
                }
            }
        }
        
        // 渲染可见节点
        for (const { id, pos } of visibleNodes) {
            const node = nodes.get(id);
            if (!node) continue;
            
            const color = this.getNodeColor(node.type);
            const radius = node.type === 'character' ? 
                this.config.nodeRadius * 1.3 : this.config.nodeRadius;
            
            this.ctx.fillStyle = color;
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, radius / this.viewport.scale, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 绘制标签（缩放足够大时）
            if (this.viewport.scale > 0.5 && node.name) {
                this.ctx.fillStyle = '#e2e8f0';
                this.ctx.font = `${this.config.labelFontSize / this.viewport.scale}px sans-serif`;
                this.ctx.textAlign = 'center';
                this.ctx.fillText(
                    node.name.substring(0, 8),
                    pos.x,
                    pos.y + radius / this.viewport.scale + 12 / this.viewport.scale
                );
            }
        }
        
        // 恢复变换
        this.ctx.restore();
        
        // 绘制视口信息
        this.drawViewportInfo(visibleNodes.length, nodes.size);
        
        // 更新性能统计
        this.stats.totalNodes = nodes.size;
        this.stats.visibleNodes = visibleNodes.length;
        this.stats.culledNodes = nodes.size - visibleNodes.length;
        this.stats.renderTime = performance.now() - startTime;
        this.stats.fps = 1000 / this.stats.renderTime;
    }
    
    // 绘制视口信息
    drawViewportInfo(visible, total) {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(10, 10, 200, 80);
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '12px monospace';
        this.ctx.textAlign = 'left';
        
        this.ctx.fillText(`总节点: ${total}`, 20, 30);
        this.ctx.fillText(`可见: ${visible}`, 20, 50);
        this.ctx.fillText(`剔除: ${total - visible} (${((total - visible) / total * 100).toFixed(1)}%)`, 20, 70);
        this.ctx.fillText(`缩放: ${this.viewport.scale.toFixed(2)}x`, 20, 90);
    }
    
    // 获取节点颜色
    getNodeColor(type) {
        const colors = {
            character: '#667eea',
            event: '#f6ad55',
            entity: '#68d391',
            default: '#a0aec0'
        };
        return colors[type] || colors.default;
    }
    
    // 获取性能统计
    getStats() {
        return { ...this.stats };
    }
    
    // 适应视口（显示所有节点）
    fitToView(positions) {
        const nodes = Array.from(positions.values());
        if (nodes.length === 0) return;
        
        const bounds = this.calculateBounds(nodes.map(pos => ({ pos })));
        
        const scaleX = this.canvas.width / bounds.width;
        const scaleY = this.canvas.height / bounds.height;
        this.viewport.scale = Math.min(scaleX, scaleY) * 0.9;
        
        this.viewport.x = (this.canvas.width - bounds.width * this.viewport.scale) / 2 - bounds.x * this.viewport.scale;
        this.viewport.y = (this.canvas.height - bounds.height * this.viewport.scale) / 2 - bounds.y * this.viewport.scale;
        
        this.render();
    }
}

// 简化的四叉树实现
class Quadtree {
    constructor(bounds, maxObjects = 10, maxLevels = 5, level = 0) {
        this.bounds = bounds;
        this.maxObjects = maxObjects;
        this.maxLevels = maxLevels;
        this.level = level;
        this.objects = [];
        this.nodes = [];
    }
    
    // 插入对象
    insert(obj) {
        if (this.nodes.length > 0) {
            const index = this.getIndex(obj);
            if (index !== -1) {
                this.nodes[index].insert(obj);
                return;
            }
        }
        
        this.objects.push(obj);
        
        if (this.objects.length > this.maxObjects && this.level < this.maxLevels) {
            if (this.nodes.length === 0) {
                this.split();
            }
            
            let i = 0;
            while (i < this.objects.length) {
                const index = this.getIndex(this.objects[i]);
                if (index !== -1) {
                    this.nodes[index].insert(this.objects.splice(i, 1)[0]);
                } else {
                    i++;
                }
            }
        }
    }
    
    // 分裂为4个子节点
    split() {
        const subWidth = this.bounds.width / 2;
        const subHeight = this.bounds.height / 2;
        const x = this.bounds.x;
        const y = this.bounds.y;
        
        this.nodes[0] = new Quadtree({ x: x + subWidth, y, width: subWidth, height: subHeight }, 
            this.maxObjects, this.maxLevels, this.level + 1);
        this.nodes[1] = new Quadtree({ x, y, width: subWidth, height: subHeight }, 
            this.maxObjects, this.maxLevels, this.level + 1);
        this.nodes[2] = new Quadtree({ x, y: y + subHeight, width: subWidth, height: subHeight }, 
            this.maxObjects, this.maxLevels, this.level + 1);
        this.nodes[3] = new Quadtree({ x: x + subWidth, y: y + subHeight, width: subWidth, height: subHeight }, 
            this.maxObjects, this.maxLevels, this.level + 1);
    }
    
    // 获取对象所属象限
    getIndex(obj) {
        const verticalMidpoint = this.bounds.x + this.bounds.width / 2;
        const horizontalMidpoint = this.bounds.y + this.bounds.height / 2;
        
        const topQuadrant = obj.y < horizontalMidpoint && obj.y + obj.height < horizontalMidpoint;
        const bottomQuadrant = obj.y > horizontalMidpoint;
        
        if (obj.x < verticalMidpoint && obj.x + obj.width < verticalMidpoint) {
            if (topQuadrant) return 1;
            else if (bottomQuadrant) return 2;
        } else if (obj.x > verticalMidpoint) {
            if (topQuadrant) return 0;
            else if (bottomQuadrant) return 3;
        }
        
        return -1;
    }
    
    // 查询范围内的对象
    retrieve(bounds) {
        const foundObjects = this.objects.slice();
        
        if (this.nodes.length > 0) {
            const index = this.getIndex(bounds);
            if (index !== -1) {
                foundObjects.push(...this.nodes[index].retrieve(bounds));
            } else {
                for (const node of this.nodes) {
                    foundObjects.push(...node.retrieve(bounds));
                }
            }
        }
        
        return foundObjects;
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VirtualGraphRenderer, Quadtree };
} else {
    window.VirtualGraphRenderer = VirtualGraphRenderer;
    window.Quadtree = Quadtree;
}