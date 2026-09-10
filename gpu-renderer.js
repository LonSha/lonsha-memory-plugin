// Phase 7: WebGL GPU 渲染引擎
// gpu-renderer.js - 使用 WebGL 2.0 渲染大规模图谱

class GPUGraphRenderer {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.gl = null;
        this.programs = {};
        this.buffers = {};
        this.textures = {};
        this.camera = {
            x: 0,
            y: 0,
            zoom: 1.0,
            minZoom: 0.1,
            maxZoom: 10.0
        };
        
        this.options = {
            maxNodes: options.maxNodes || 10000,
            maxEdges: options.maxEdges || 50000,
            nodeSize: options.nodeSize || 10,
            edgeWidth: options.edgeWidth || 2,
            enableBloom: options.enableBloom !== false,
            enableShadows: options.enableShadows !== false,
            msaa: options.msaa || 4
        };
        
        this.stats = {
            fps: 0,
            drawCalls: 0,
            vertexCount: 0,
            triangleCount: 0
        };
        
        this.init();
    }
    
    // 初始化 WebGL 上下文
    init() {
        const contextOptions = {
            alpha: true,
            depth: true,
            stencil: false,
            antialias: this.options.msaa > 1,
            powerPreference: 'high-performance'
        };
        
        this.gl = this.canvas.getContext('webgl2', contextOptions);
        
        if (!this.gl) {
            console.error('[GPU Renderer] WebGL 2.0 not supported');
            throw new Error('WebGL 2.0 not available');
        }
        
        console.log('[GPU Renderer] WebGL 2.0 initialized');
        
        // 启用扩展
        this.enableExtensions();
        
        // 编译着色器
        this.compileShaders();
        
        // 创建缓冲区
        this.createBuffers();
        
        // 设置 WebGL 状态
        this.setupGLState();
        
        console.log('[GPU Renderer] Initialization complete');
    }
    
    // 启用 WebGL 扩展
    enableExtensions() {
        const gl = this.gl;
        
        // 浮点纹理（用于高精度计算）
        gl.getExtension('EXT_color_buffer_float');
        gl.getExtension('OES_texture_float_linear');
        
        // 实例化渲染（批量绘制）
        gl.getExtension('ANGLE_instanced_arrays');
        
        console.log('[GPU Renderer] Extensions enabled');
    }
    
    // 编译着色器程序
    compileShaders() {
        const gl = this.gl;
        
        // 节点渲染着色器
        this.programs.node = this.createProgram(
            // Vertex Shader
            `#version 300 es
            precision highp float;
            
            // 实例化属性
            in vec2 a_position;      // 节点位置
            in float a_size;         // 节点大小
            in vec4 a_color;         // 节点颜色
            in float a_importance;   // 重要性（影响大小）
            
            // 相机变换
            uniform mat3 u_camera;
            uniform vec2 u_resolution;
            
            out vec4 v_color;
            out float v_importance;
            
            void main() {
                // 应用相机变换
                vec3 pos = u_camera * vec3(a_position, 1.0);
                
                // 转换到裁剪空间
                vec2 clipSpace = (pos.xy / u_resolution) * 2.0 - 1.0;
                gl_Position = vec4(clipSpace * vec2(1, -1), 0.0, 1.0);
                
                // 根据重要性调整大小
                gl_PointSize = a_size * (1.0 + a_importance * 0.5);
                
                v_color = a_color;
                v_importance = a_importance;
            }`,
            
            // Fragment Shader
            `#version 300 es
            precision highp float;
            
            in vec4 v_color;
            in float v_importance;
            
            out vec4 fragColor;
            
            void main() {
                // 圆形节点（点精灵）
                vec2 coord = gl_PointCoord - vec2(0.5);
                float dist = length(coord);
                
                if (dist > 0.5) {
                    discard;
                }
                
                // 平滑边缘（抗锯齿）
                float alpha = 1.0 - smoothstep(0.4, 0.5, dist);
                
                // 重要节点发光效果
                float glow = v_importance * (1.0 - dist * 2.0);
                vec3 color = v_color.rgb + vec3(glow * 0.3);
                
                fragColor = vec4(color, v_color.a * alpha);
            }`
        );
        
        // 边渲染着色器
        this.programs.edge = this.createProgram(
            // Vertex Shader
            `#version 300 es
            precision highp float;
            
            in vec2 a_position;
            in vec4 a_color;
            in float a_width;
            
            uniform mat3 u_camera;
            uniform vec2 u_resolution;
            
            out vec4 v_color;
            
            void main() {
                vec3 pos = u_camera * vec3(a_position, 1.0);
                vec2 clipSpace = (pos.xy / u_resolution) * 2.0 - 1.0;
                gl_Position = vec4(clipSpace * vec2(1, -1), 0.0, 1.0);
                v_color = a_color;
            }`,
            
            // Fragment Shader
            `#version 300 es
            precision highp float;
            
            in vec4 v_color;
            out vec4 fragColor;
            
            void main() {
                fragColor = v_color;
            }`
        );
        
        // Bloom 后处理着色器
        if (this.options.enableBloom) {
            this.programs.bloom = this.createProgram(
                // Vertex Shader (全屏四边形)
                `#version 300 es
                precision highp float;
                
                in vec2 a_position;
                out vec2 v_uv;
                
                void main() {
                    gl_Position = vec4(a_position, 0.0, 1.0);
                    v_uv = a_position * 0.5 + 0.5;
                }`,
                
                // Fragment Shader (高斯模糊)
                `#version 300 es
                precision highp float;
                
                in vec2 v_uv;
                uniform sampler2D u_texture;
                uniform vec2 u_direction;
                uniform float u_intensity;
                
                out vec4 fragColor;
                
                void main() {
                    vec4 color = vec4(0.0);
                    float total = 0.0;
                    
                    // 5x5 高斯核
                    for (int i = -2; i <= 2; i++) {
                        float weight = exp(-float(i * i) / 2.0);
                        vec2 offset = u_direction * float(i) / 512.0;
                        color += texture(u_texture, v_uv + offset) * weight;
                        total += weight;
                    }
                    
                    fragColor = color / total * u_intensity;
                }`
            );
        }
        
        console.log('[GPU Renderer] Shaders compiled');
    }
    
    // 创建着色器程序
    createProgram(vertexSource, fragmentSource) {
        const gl = this.gl;
        
        const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);
        
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(program));
            throw new Error('Failed to link program');
        }
        
        return program;
    }
    
    // 编译单个着色器
    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            throw new Error('Failed to compile shader');
        }
        
        return shader;
    }
    
    // 创建缓冲区
    createBuffers() {
        const gl = this.gl;
        
        // 节点缓冲区（实例化数据）
        this.buffers.nodePositions = gl.createBuffer();
        this.buffers.nodeSizes = gl.createBuffer();
        this.buffers.nodeColors = gl.createBuffer();
        this.buffers.nodeImportance = gl.createBuffer();
        
        // 边缓冲区（线段）
        this.buffers.edgePositions = gl.createBuffer();
        this.buffers.edgeColors = gl.createBuffer();
        this.buffers.edgeWidths = gl.createBuffer();
        
        // 全屏四边形（用于后处理）
        this.buffers.fullscreenQuad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.fullscreenQuad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,  1, -1,  -1, 1,
            -1, 1,   1, -1,   1, 1
        ]), gl.STATIC_DRAW);
        
        console.log('[GPU Renderer] Buffers created');
    }
    
    // 设置 WebGL 状态
    setupGLState() {
        const gl = this.gl;
        
        // 启用混合（透明度）
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        // 启用深度测试
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        
        // 清除颜色
        gl.clearColor(0.05, 0.05, 0.1, 1.0);
    }
    
    // 渲染图谱
    render(nodes, edges) {
        const gl = this.gl;
        const startTime = performance.now();
        
        // 调整 canvas 大小
        this.resizeCanvas();
        
        // 清除画布
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        
        // 更新相机矩阵
        const cameraMatrix = this.getCameraMatrix();
        
        // 渲染边
        this.renderEdges(edges, cameraMatrix);
        
        // 渲染节点
        this.renderNodes(nodes, cameraMatrix);
        
        // 后处理（Bloom）
        if (this.options.enableBloom) {
            this.applyBloom();
        }
        
        // 更新统计
        const elapsed = performance.now() - startTime;
        this.stats.fps = 1000 / elapsed;
        this.stats.vertexCount = nodes.length + edges.length * 2;
        
        return this.stats;
    }
    
    // 渲染节点
    renderNodes(nodes, cameraMatrix) {
        const gl = this.gl;
        const program = this.programs.node;
        
        gl.useProgram(program);
        
        // 上传节点数据
        const positions = new Float32Array(nodes.length * 2);
        const sizes = new Float32Array(nodes.length);
        const colors = new Float32Array(nodes.length * 4);
        const importance = new Float32Array(nodes.length);
        
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            positions[i * 2] = node.x || 0;
            positions[i * 2 + 1] = node.y || 0;
            sizes[i] = node.size || this.options.nodeSize;
            
            const color = node.color || [1, 1, 1, 1];
            colors[i * 4] = color[0];
            colors[i * 4 + 1] = color[1];
            colors[i * 4 + 2] = color[2];
            colors[i * 4 + 3] = color[3];
            
            importance[i] = node.importance || 0;
        }
        
        // 绑定缓冲区
        const posLoc = gl.getAttribLocation(program, 'a_position');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.nodePositions);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        
        const sizeLoc = gl.getAttribLocation(program, 'a_size');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.nodeSizes);
        gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(sizeLoc);
        gl.vertexAttribPointer(sizeLoc, 1, gl.FLOAT, false, 0, 0);
        
        const colorLoc = gl.getAttribLocation(program, 'a_color');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.nodeColors);
        gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(colorLoc);
        gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 0, 0);
        
        const impLoc = gl.getAttribLocation(program, 'a_importance');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.nodeImportance);
        gl.bufferData(gl.ARRAY_BUFFER, importance, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(impLoc);
        gl.vertexAttribPointer(impLoc, 1, gl.FLOAT, false, 0, 0);
        
        // 设置 uniforms
        const cameraLoc = gl.getUniformLocation(program, 'u_camera');
        gl.uniformMatrix3fv(cameraLoc, false, cameraMatrix);
        
        const resLoc = gl.getUniformLocation(program, 'u_resolution');
        gl.uniform2f(resLoc, gl.canvas.width, gl.canvas.height);
        
        // 绘制节点（点精灵）
        gl.drawArrays(gl.POINTS, 0, nodes.length);
        
        this.stats.drawCalls++;
    }
    
    // 渲染边
    renderEdges(edges, cameraMatrix) {
        const gl = this.gl;
        const program = this.programs.edge;
        
        gl.useProgram(program);
        
        // 上传边数据
        const positions = new Float32Array(edges.length * 4);
        const colors = new Float32Array(edges.length * 8);
        
        for (let i = 0; i < edges.length; i++) {
            const edge = edges[i];
            positions[i * 4] = edge.x1 || 0;
            positions[i * 4 + 1] = edge.y1 || 0;
            positions[i * 4 + 2] = edge.x2 || 0;
            positions[i * 4 + 3] = edge.y2 || 0;
            
            const color = edge.color || [0.3, 0.3, 0.3, 0.5];
            for (let j = 0; j < 2; j++) {
                colors[i * 8 + j * 4] = color[0];
                colors[i * 8 + j * 4 + 1] = color[1];
                colors[i * 8 + j * 4 + 2] = color[2];
                colors[i * 8 + j * 4 + 3] = color[3];
            }
        }
        
        // 绑定缓冲区
        const posLoc = gl.getAttribLocation(program, 'a_position');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.edgePositions);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        
        const colorLoc = gl.getAttribLocation(program, 'a_color');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.edgeColors);
        gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(colorLoc);
        gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 0, 0);
        
        // 设置 uniforms
        const cameraLoc = gl.getUniformLocation(program, 'u_camera');
        gl.uniformMatrix3fv(cameraLoc, false, cameraMatrix);
        
        const resLoc = gl.getUniformLocation(program, 'u_resolution');
        gl.uniform2f(resLoc, gl.canvas.width, gl.canvas.height);
        
        // 绘制边（线段）
        gl.drawArrays(gl.LINES, 0, edges.length * 2);
        
        this.stats.drawCalls++;
    }
    
    // 应用 Bloom 后处理
    applyBloom() {
        // TODO: 实现两遍高斯模糊 + 叠加
        // 这里简化实现，完整版需要 FBO + 多次渲染
    }
    
    // 获取相机变换矩阵
    getCameraMatrix() {
        const zoom = this.camera.zoom;
        const x = -this.camera.x;
        const y = -this.camera.y;
        
        return new Float32Array([
            zoom, 0, 0,
            0, zoom, 0,
            x * zoom, y * zoom, 1
        ]);
    }
    
    // 调整 canvas 大小
    resizeCanvas() {
        const displayWidth = this.canvas.clientWidth;
        const displayHeight = this.canvas.clientHeight;
        
        if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
            this.canvas.width = displayWidth;
            this.canvas.height = displayHeight;
            this.gl.viewport(0, 0, displayWidth, displayHeight);
        }
    }
    
    // 相机控制
    pan(dx, dy) {
        this.camera.x += dx / this.camera.zoom;
        this.camera.y += dy / this.camera.zoom;
    }
    
    zoom(delta, centerX, centerY) {
        const oldZoom = this.camera.zoom;
        this.camera.zoom *= Math.pow(1.1, delta);
        this.camera.zoom = Math.max(this.camera.minZoom, Math.min(this.camera.maxZoom, this.camera.zoom));
        
        // 调整相机位置，使缩放以鼠标位置为中心
        const zoomRatio = this.camera.zoom / oldZoom;
        this.camera.x = centerX - (centerX - this.camera.x) * zoomRatio;
        this.camera.y = centerY - (centerY - this.camera.y) * zoomRatio;
    }
    
    // 清理资源
    dispose() {
        const gl = this.gl;
        
        // 删除程序
        for (const key in this.programs) {
            gl.deleteProgram(this.programs[key]);
        }
        
        // 删除缓冲区
        for (const key in this.buffers) {
            gl.deleteBuffer(this.buffers[key]);
        }
        
        console.log('[GPU Renderer] Resources disposed');
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GPUGraphRenderer };
} else {
    window.GPUGraphRenderer = GPUGraphRenderer;
}