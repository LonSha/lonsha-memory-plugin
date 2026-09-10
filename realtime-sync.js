// Phase 7: WebSocket 实时协作
// realtime-sync.js - 多人实时共享与协作

class RealtimeSync {
    constructor(serverUrl, options = {}) {
        this.serverUrl = serverUrl;
        this.ws = null;
        this.clientId = this.generateClientId();
        this.roomId = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
        this.reconnectDelay = options.reconnectDelay || 1000;
        
        this.options = {
            autoReconnect: options.autoReconnect !== false,
            heartbeatInterval: options.heartbeatInterval || 30000,
            operationBufferSize: options.operationBufferSize || 100
        };
        
        this.state = {
            connected: false,
            room: null,
            users: new Map(),
            operations: [],
            operationId: 0
        };
        
        this.handlers = {
            onConnect: null,
            onDisconnect: null,
            onOperation: null,
            onUserJoin: null,
            onUserLeave: null,
            onError: null
        };
        
        this.heartbeatTimer = null;
        this.operationBuffer = [];
    }
    
    // 生成客户端 ID
    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // 连接到服务器
    connect(roomId) {
        this.roomId = roomId;
        
        console.log(`[Realtime] Connecting to ${this.serverUrl}, room: ${roomId}`);
        
        try {
            this.ws = new WebSocket(this.serverUrl);
            
            this.ws.onopen = () => this.handleOpen();
            this.ws.onclose = (event) => this.handleClose(event);
            this.ws.onerror = (error) => this.handleError(error);
            this.ws.onmessage = (event) => this.handleMessage(event);
        } catch (error) {
            console.error('[Realtime] Connection failed:', error);
            if (this.handlers.onError) {
                this.handlers.onError(error);
            }
        }
    }
    
    // 处理连接建立
    handleOpen() {
        console.log('[Realtime] Connected to server');
        this.state.connected = true;
        this.reconnectAttempts = 0;
        
        // 发送加入房间请求
        this.send({
            type: 'join',
            roomId: this.roomId,
            clientId: this.clientId,
            timestamp: Date.now()
        });
        
        // 启动心跳
        this.startHeartbeat();
        
        // 发送缓冲的操作
        this.flushOperationBuffer();
        
        if (this.handlers.onConnect) {
            this.handlers.onConnect();
        }
    }
    
    // 处理连接关闭
    handleClose(event) {
        console.log('[Realtime] Connection closed:', event.code, event.reason);
        this.state.connected = false;
        
        // 停止心跳
        this.stopHeartbeat();
        
        if (this.handlers.onDisconnect) {
            this.handlers.onDisconnect(event);
        }
        
        // 自动重连
        if (this.options.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
            console.log(`[Realtime] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
            
            setTimeout(() => {
                this.connect(this.roomId);
            }, delay);
        }
    }
    
    // 处理错误
    handleError(error) {
        console.error('[Realtime] WebSocket error:', error);
        
        if (this.handlers.onError) {
            this.handlers.onError(error);
        }
    }
    
    // 处理消息
    handleMessage(event) {
        try {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
                case 'joined':
                    this.handleJoined(message);
                    break;
                
                case 'user_join':
                    this.handleUserJoin(message);
                    break;
                
                case 'user_leave':
                    this.handleUserLeave(message);
                    break;
                
                case 'operation':
                    this.handleOperation(message);
                    break;
                
                case 'sync':
                    this.handleSync(message);
                    break;
                
                case 'error':
                    this.handleServerError(message);
                    break;
                
                case 'pong':
                    // 心跳响应
                    break;
                
                default:
                    console.warn('[Realtime] Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('[Realtime] Failed to parse message:', error);
        }
    }
    
    // 处理加入成功
    handleJoined(message) {
        console.log('[Realtime] Joined room:', message.roomId);
        this.state.room = message.room;
        
        // 更新用户列表
        if (message.users) {
            this.state.users.clear();
            for (const user of message.users) {
                this.state.users.set(user.clientId, user);
            }
        }
    }
    
    // 处理用户加入
    handleUserJoin(message) {
        console.log('[Realtime] User joined:', message.user.clientId);
        this.state.users.set(message.user.clientId, message.user);
        
        if (this.handlers.onUserJoin) {
            this.handlers.onUserJoin(message.user);
        }
    }
    
    // 处理用户离开
    handleUserLeave(message) {
        console.log('[Realtime] User left:', message.clientId);
        this.state.users.delete(message.clientId);
        
        if (this.handlers.onUserLeave) {
            this.handlers.onUserLeave(message.clientId);
        }
    }
    
    // 处理操作
    handleOperation(message) {
        console.log('[Realtime] Received operation:', message.operation.type);
        
        // 记录操作
        this.state.operations.push(message.operation);
        
        // 限制操作历史大小
        if (this.state.operations.length > this.options.operationBufferSize) {
            this.state.operations.shift();
        }
        
        if (this.handlers.onOperation) {
            this.handlers.onOperation(message.operation, message.clientId);
        }
    }
    
    // 处理同步
    handleSync(message) {
        console.log('[Realtime] Received sync:', message.operations.length, 'operations');
        
        // 批量应用操作
        for (const operation of message.operations) {
            if (this.handlers.onOperation) {
                this.handlers.onOperation(operation, message.clientId);
            }
        }
    }
    
    // 处理服务器错误
    handleServerError(message) {
        console.error('[Realtime] Server error:', message.error);
        
        if (this.handlers.onError) {
            this.handlers.onError(new Error(message.error));
        }
    }
    
    // 发送消息
    send(message) {
        if (!this.state.connected) {
            console.warn('[Realtime] Not connected, buffering message');
            this.operationBuffer.push(message);
            return false;
        }
        
        try {
            this.ws.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error('[Realtime] Failed to send message:', error);
            return false;
        }
    }
    
    // 发送操作
    sendOperation(operation) {
        const operationId = ++this.state.operationId;
        
        const message = {
            type: 'operation',
            roomId: this.roomId,
            clientId: this.clientId,
            operationId,
            operation: {
                ...operation,
                id: operationId,
                clientId: this.clientId,
                timestamp: Date.now()
            }
        };
        
        return this.send(message);
    }
    
    // 请求完整同步
    requestSync() {
        return this.send({
            type: 'request_sync',
            roomId: this.roomId,
            clientId: this.clientId,
            since: this.state.operations.length > 0 
                ? this.state.operations[this.state.operations.length - 1].id 
                : 0
        });
    }
    
    // 启动心跳
    startHeartbeat() {
        this.stopHeartbeat();
        
        this.heartbeatTimer = setInterval(() => {
            if (this.state.connected) {
                this.send({
                    type: 'ping',
                    clientId: this.clientId,
                    timestamp: Date.now()
                });
            }
        }, this.options.heartbeatInterval);
    }
    
    // 停止心跳
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
    
    // 刷新操作缓冲区
    flushOperationBuffer() {
        if (this.operationBuffer.length === 0) return;
        
        console.log(`[Realtime] Flushing ${this.operationBuffer.length} buffered operations`);
        
        for (const message of this.operationBuffer) {
            this.send(message);
        }
        
        this.operationBuffer = [];
    }
    
    // 断开连接
    disconnect() {
        console.log('[Realtime] Disconnecting...');
        
        this.options.autoReconnect = false;
        this.stopHeartbeat();
        
        if (this.ws && this.state.connected) {
            this.send({
                type: 'leave',
                roomId: this.roomId,
                clientId: this.clientId
            });
            
            this.ws.close(1000, 'Client disconnect');
        }
        
        this.state.connected = false;
    }
    
    // 注册事件处理器
    on(event, handler) {
        if (this.handlers.hasOwnProperty(`on${event.charAt(0).toUpperCase()}${event.slice(1)}`)) {
            this.handlers[`on${event.charAt(0).toUpperCase()}${event.slice(1)}`] = handler;
        } else {
            console.warn(`[Realtime] Unknown event: ${event}`);
        }
    }
}

// 操作类型定义
const OperationType = {
    // 节点操作
    NODE_ADD: 'node_add',
    NODE_UPDATE: 'node_update',
    NODE_DELETE: 'node_delete',
    
    // 边操作
    EDGE_ADD: 'edge_add',
    EDGE_UPDATE: 'edge_update',
    EDGE_DELETE: 'edge_delete',
    
    // 摘要操作
    SUMMARY_ADD: 'summary_add',
    SUMMARY_UPDATE: 'summary_update',
    SUMMARY_DELETE: 'summary_delete',
    
    // 游标操作
    CURSOR_MOVE: 'cursor_move',
    CURSOR_SELECT: 'cursor_select'
};

// 操作转换（OT - Operational Transformation）
class OperationTransformer {
    // 转换两个并发操作
    static transform(op1, op2) {
        // 简化实现，完整版需要处理所有操作组合
        
        if (op1.type === OperationType.NODE_UPDATE && op2.type === OperationType.NODE_UPDATE) {
            if (op1.nodeId === op2.nodeId) {
                // 同一节点的并发更新
                // 使用时间戳决定优先级
                if (op1.timestamp < op2.timestamp) {
                    return [op1, null]; // op1 优先，丢弃 op2
                } else {
                    return [null, op2]; // op2 优先，丢弃 op1
                }
            }
        }
        
        if (op1.type === OperationType.NODE_DELETE && op2.type === OperationType.NODE_UPDATE) {
            if (op1.nodeId === op2.nodeId) {
                // 删除优先于更新
                return [op1, null];
            }
        }
        
        // 默认：两个操作都保留
        return [op1, op2];
    }
    
    // 应用操作到状态
    static apply(state, operation) {
        switch (operation.type) {
            case OperationType.NODE_ADD:
                if (!state.nodes.has(operation.node.id)) {
                    state.nodes.set(operation.node.id, operation.node);
                }
                break;
            
            case OperationType.NODE_UPDATE:
                if (state.nodes.has(operation.nodeId)) {
                    const node = state.nodes.get(operation.nodeId);
                    Object.assign(node, operation.updates);
                }
                break;
            
            case OperationType.NODE_DELETE:
                state.nodes.delete(operation.nodeId);
                break;
            
            case OperationType.EDGE_ADD:
                if (!state.edges.has(operation.edge.id)) {
                    state.edges.set(operation.edge.id, operation.edge);
                }
                break;
            
            case OperationType.EDGE_UPDATE:
                if (state.edges.has(operation.edgeId)) {
                    const edge = state.edges.get(operation.edgeId);
                    Object.assign(edge, operation.updates);
                }
                break;
            
            case OperationType.EDGE_DELETE:
                state.edges.delete(operation.edgeId);
                break;
            
            default:
                console.warn('[OT] Unknown operation type:', operation.type);
        }
        
        return state;
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RealtimeSync, OperationType, OperationTransformer };
} else {
    window.RealtimeSync = RealtimeSync;
    window.OperationType = OperationType;
    window.OperationTransformer = OperationTransformer;
}