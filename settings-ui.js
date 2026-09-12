// LonSha记忆引擎 - 设置与状态面板 (v1.3)
// settings-ui.js - 移动端适配的设置界面，通过原型扩展挂载到 LonShaMemoryPlugin
(function() {
    'use strict';

    // 等插件就绪后挂载
    const mount = () => {
        const plugin = window.LonShaMemory;
        if (!plugin) { setTimeout(mount, 200); return; }

        const PLUGIN_NAME = 'LonSha记忆引擎';
        const VERSION = plugin.engine?.config?.config ? '1.3.0' : '1.3.0';

        // ========== 共享样式 ==========
        const style = document.createElement('style');
        style.textContent = `
            .lonsha-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 10002; display: flex; align-items: flex-end; justify-content: center; }
            @media (min-width: 600px) { .lonsha-overlay { align-items: center; } }
            .lonsha-sheet { background: #1e1e2e; width: 100%; max-width: 500px; max-height: 85vh; border-radius: 16px 16px 0 0; display: flex; flex-direction: column; border: 1px solid #45475a; }
            @media (min-width: 600px) { .lonsha-sheet { border-radius: 16px; max-height: 80vh; } }
            .lonsha-sheet-header { display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid #313244; color: #cdd6f4; font-size: 16px; font-weight: bold; flex-shrink: 0; }
            .lonsha-sheet-close { padding: 8px 12px; color: #f38ba8; font-size: 18px; cursor: pointer; }
            .lonsha-sheet-body { padding: 12px 16px 24px; overflow-y: auto; -webkit-overflow-scrolling: touch; color: #cdd6f4; }
            .ls-group { margin-bottom: 16px; }
            .ls-group-title { font-size: 12px; color: #89b4fa; margin: 8px 0 6px; font-weight: bold; letter-spacing: 1px; }
            .ls-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 8px; border-bottom: 1px solid #313244; font-size: 15px; }
            .ls-row:last-child { border-bottom: none; }
            .ls-row input[type="checkbox"] { width: 44px; height: 44px; margin: 0; accent-color: #89b4fa; }
            .ls-slider { width: 100%; accent-color: #89b4fa; height: 32px; }
            .ls-slider-label { display: flex; justify-content: space-between; font-size: 14px; padding: 8px; color: #a6adc8; }
            .ls-slider-val { color: #89b4fa; font-weight: bold; }
            .ls-input { width: 100%; background: #181825; color: #cdd6f4; border: 1px solid #45475a; border-radius: 8px; padding: 11px; font-size: 14px; margin: 5px 0; box-sizing: border-box; }
            .ls-input::placeholder { color: #585b70; }
            .ls-textarea { width: 100%; min-height: 120px; background: #181825; color: #cdd6f4; border: 1px solid #45475a; border-radius: 8px; padding: 10px; font-size: 13px; font-family: monospace; box-sizing: border-box; }
            .ls-btn { display: block; width: 100%; padding: 13px; margin: 8px 0; background: #313244; color: #cdd6f4; border: none; border-radius: 10px; font-size: 15px; text-align: center; cursor: pointer; }
            .ls-btn:active { background: #45475a; }
            .ls-btn-primary { background: linear-gradient(135deg, #667eea, #764ba2); color: white; }
            .ls-btn-danger { background: #45273a; color: #f38ba8; }
            .ls-stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 8px 0; }
            .ls-stat-card { background: #181825; border-radius: 10px; padding: 12px 4px; text-align: center; }
            .ls-stat-num { font-size: 20px; font-weight: bold; color: #89b4fa; }
            .ls-stat-label { font-size: 11px; color: #a6adc8; margin-top: 2px; }
            .ls-hint { font-size: 12px; color: #6c7086; padding: 6px 8px; line-height: 1.5; }
            .ls-clickable { cursor: pointer; transition: transform 0.15s; }
            .ls-clickable:active { transform: scale(0.95); }
            .ls-item { background: #181825; border-radius: 10px; padding: 10px 12px; margin: 6px 0; }
            .ls-item-meta { font-size: 11px; color: #6c7086; margin-bottom: 4px; }
            .ls-item-text { font-size: 14px; color: #cdd6f4; line-height: 1.6; word-break: break-word; }
            .ls-toast { position: fixed; bottom: 150px; left: 50%; transform: translateX(-50%); background: #a6e3a1; color: #1e1e2e; padding: 10px 20px; border-radius: 20px; font-size: 14px; z-index: 10003; }
        `;
        document.head.appendChild(style);

        // ========== 工具 ==========
        const closeOverlay = (id) => document.getElementById(id)?.remove();
        const makeSheet = (id, title, bodyHTML) => {
            closeOverlay(id);
            const overlay = document.createElement('div');
            overlay.id = id;
            overlay.className = 'lonsha-overlay';
            overlay.innerHTML = `
                <div class="lonsha-sheet">
                    <div class="lonsha-sheet-header"><span>${title}</span><span class="lonsha-sheet-close">✕</span></div>
                    <div class="lonsha-sheet-body">${bodyHTML}</div>
                </div>
            `;
            overlay.querySelector('.lonsha-sheet-close').addEventListener('click', () => closeOverlay(id));
            overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(id); });
            document.body.appendChild(overlay);
            return overlay;
        };
        const toast = (msg) => {
            const t = document.createElement('div');
            t.className = 'ls-toast';
            t.textContent = msg;
            document.body.appendChild(t);
            setTimeout(() => t.remove(), 1800);
        };

        // ========== 状态总览 ==========
        plugin.showStatsPanel = function() {
            const s = this.engine;
            const cfg = s.config.config;
            let phoneStatus = '未安装';
            try {
                const bridge = window.VirtualPhone?.lonshaBridge;
                if (bridge) {
                    const bs = bridge.getStats?.() || {};
                    phoneStatus = (bridge.enabled ? '✅ 已连接' : '⛔ 已关闭') + ` (回填${bs.backfillCount || 0}·BM25 ${bs.bm25Docs || 0}${bridge.isCoordinated ? '·协调注入' : ''})`;
                }
                else if (window.VirtualPhone?.memoryCore) phoneStatus = '⚠️ 桥未挂载';
            } catch (e) {}
            const body = `
                <div class="ls-stat-grid">
                    <div class="ls-stat-card ls-clickable" data-view="graph"><div class="ls-stat-num">${s.graph.nodes.size}</div><div class="ls-stat-label">图谱节点 👁</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="relations"><div class="ls-stat-num">${s.graph.edges.size}</div><div class="ls-stat-label">关系边 👁</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="summaries"><div class="ls-stat-num">${s.summary.summaries.length}</div><div class="ls-stat-label">摘要 👁</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="vectors"><div class="ls-stat-num">${s.vector.vectors.length}</div><div class="ls-stat-label">向量 👁</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="diaries"><div class="ls-stat-num">${Object.keys(s.diary.diaries).length}</div><div class="ls-stat-label">角色日记 👁</div></div>
                    <div class="ls-stat-card"><div class="ls-stat-num">${cfg.enabled ? '✅' : '⛔'}</div><div class="ls-stat-label">插件状态</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="povs"><div class="ls-stat-num">${s.pov?.povs?.length || 0}</div><div class="ls-stat-label">POV私密记忆 👁</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="timeline"><div class="ls-stat-num">${s.timeline?.entries?.length || 0}</div><div class="ls-stat-label">剧情时间线 👁</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="volumes"><div class="ls-stat-num">${s.summary?.volumes?.length || 0}</div><div class="ls-stat-label">卷摘要 👁</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="suspense"><div class="ls-stat-num">${s.suspense?.openItems?.().length || 0}</div><div class="ls-stat-label">悬念簿 👁</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="scene"><div class="ls-stat-num">${s.scene?.nodes?.size || 0}</div><div class="ls-stat-label">场景树 👁</div></div>
                    <div class="ls-stat-card"><div class="ls-stat-num">${s.bm25?.N || 0}</div><div class="ls-stat-label">BM25 索引</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="status"><div class="ls-stat-num">${Object.keys(s.status?.characters || {}).length}</div><div class="ls-stat-label">角色状态 👁</div></div>
                    <div class="ls-stat-card"><div class="ls-stat-num">${Object.keys(s.ledger?.floors || {}).length}</div><div class="ls-stat-label">楼层账本</div></div>
                    <div class="ls-stat-card"><div class="ls-stat-num">${s.mutex?.locked ? '🔒' : '🟢'}</div><div class="ls-stat-label">提取锁 ${s.mutex?.queueLength ? `(队列${s.mutex.queueLength})` : ''}</div></div>
                    <div class="ls-stat-card"><div class="ls-stat-num" style="font-size:15px;">${phoneStatus}</div><div class="ls-stat-label">📱 RubyPhone 联动</div></div>
                </div>
                <div class="ls-hint">点击带 👁 的卡片可查看记忆内容详情。数据保存在当前对话的 chatMetadata 中，随对话自动持久化。</div>
            `;
            const ov = makeSheet('lonsha-stats-overlay', '📊 状态总览', body);
            ov.querySelectorAll('.ls-clickable').forEach(card => {
                card.addEventListener('click', () => plugin.showBrowser(card.dataset.view));
            });
        };

        // ========== 记忆内容浏览器（v1.3.1）==========
        plugin.showBrowser = function(viewType) {
            const s = this.engine;
            let title = '', body = '';
            const esc = (t) => String(t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const fmtTime = (ts) => ts ? new Date(ts).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}) : '';

            if (viewType === 'summaries') {
                title = '📝 摘要列表';
                const list = s.summary.summaries;
                body = list.length === 0 ? '<div class="ls-hint">暂无摘要。去聊几句，AI 回复后会自动生成。</div>' :
                    list.slice().reverse().map(m => `
                        <div class="ls-item">
                            <div class="ls-item-meta">楼层 ${m.floor ?? '?'} · ${fmtTime(m.timestamp)}</div>
                            <div class="ls-item-text">${esc(m.text)}</div>
                        </div>`).join('');
            }
            else if (viewType === 'diaries') {
                title = '📔 角色日记';
                const diaries = s.diary.diaries;
                const names = Object.keys(diaries);
                body = names.length === 0 ? '<div class="ls-hint">暂无日记。提取到角色后会自动撰写。</div>' :
                    names.map(name => `
                        <div class="ls-group">
                            <div class="ls-group-title">📓 ${esc(name)} (${diaries[name].length} 篇)</div>
                            ${diaries[name].slice(-10).reverse().map(d => `
                                <div class="ls-item">
                                    <div class="ls-item-meta">楼层 ${d.floor ?? '?'} · ${fmtTime(d.timestamp)}</div>
                                    <div class="ls-item-text">${esc(d.text)}</div>
                                </div>`).join('')}
                        </div>`).join('');
            }
            else if (viewType === 'graph') {
                title = '🕸️ 图谱节点';
                const nodes = Array.from(s.graph.nodes.values());
                body = nodes.length === 0 ? '<div class="ls-hint">暂无节点。</div>' :
                    nodes.map(n => `
                        <div class="ls-item">
                            <div class="ls-item-meta">${esc(n.type || '未知类型')} · ${fmtTime(n.timestamp)}</div>
                            <div class="ls-item-text"><b>${esc(n.name)}</b>${n.data?.description ? ' — ' + esc(n.data.description) : ''}</div>
                        </div>`).join('');
            }
            else if (viewType === 'povs') {
                title = '🧠 POV 私密记忆';
                const povs = s.pov?.povs || [];
                body = povs.length === 0 ? '<div class="ls-hint">暂无私密记忆。提取到角色内心/秘密时会自动记录。</div>' :
                    povs.slice().reverse().map(p => `
                        <div class="ls-item">
                            <div class="ls-item-meta"><b>${esc(p.owner)}</b> · 楼层 ${p.floor ?? '?'} · 触发${p.count || 1}次</div>
                            <div class="ls-item-text">${esc(p.content)}</div>
                        </div>`).join('');
            }
            else if (viewType === 'timeline') {
                title = '📅 剧情时间线';
                const tl = s.timeline?.entries || [];
                body = tl.length === 0 ? '<div class="ls-hint">暂无剧情时间线。剧情中出现明确日期时会自动记录。</div>' :
                    tl.slice().reverse().map(e => `
                        <div class="ls-item">
                            <div class="ls-item-meta"><b>${esc(e.date)}</b> · 楼层 ${e.floor ?? '?'}${e.characters?.length ? ' · ' + esc(e.characters.join('、')) : ''}</div>
                            <div class="ls-item-text">${esc(e.text)}</div>
                        </div>`).join('');
            }
            else if (viewType === 'volumes') {
                title = '📚 卷摘要（高层剧情概括）';
                const vols = s.summary?.volumes || [];
                body = vols.length === 0 ? '<div class="ls-hint">暂无卷摘要。活跃摘要超过阈值后会自动折叠生成。</div>' :
                    vols.slice().reverse().map(v => `
                        <div class="ls-item">
                            <div class="ls-item-meta"><b>卷 ${v.floorStart ?? '?'}-${v.floorEnd ?? '?'}</b> · ${v.count || 0}条合并</div>
                            <div class="ls-item-text">${esc(v.text)}</div>
                        </div>`).join('');
            }
            else if (viewType === 'status') {
                title = '🎮 角色状态 + 待办';
                const chars = s.status?.characters || {};
                const names = Object.keys(chars);
                body = names.length === 0 ? '<div class="ls-hint">暂无角色状态。聊几句后 LLM 会自动提取数值变化。</div>' :
                    names.map(n => {
                        const rec = chars[n];
                        const fields = Object.entries(rec.fields || {}).map(([k, v]) => `<span class="ls-item-text">${esc(k)}:${esc(String(v))}</span>`).join(' | ');
                        const todos = (rec.todos || []).map(t => `<div class="ls-item-text">· ${esc(t.date ? t.date + ' ' : '')}${esc(t.text)}</div>`).join('');
                        return `<div class="ls-group">
                            <div class="ls-group-title">📊 ${esc(n)}</div>
                            <div class="ls-item">${fields || '<span class="ls-hint">无状态字段</span>'}</div>
                            ${todos ? `<div class="ls-item"><div class="ls-item-meta">待办</div>${todos}</div>` : ''}
                        </div>`;
                    }).join('');
            }
            else if (viewType === 'scene') {
                title = '🗺️ 场景树';
                const cur = s.scene?.currentKey?.();
                const nodes = Array.from(s.scene?.nodes?.values() || []);
                body = (nodes.length === 0) ? '<div class="ls-hint">暂无场景。LLM 提取到地点后会自动登记层级。</div>' :
                    (cur ? `<div class="ls-group"><div class="ls-group-title">当前位置</div><div class="ls-item"><div class="ls-item-text">${esc(cur.split('/').join(' › '))}</div></div></div>` : '') +
                    `<div class="ls-group"><div class="ls-group-title">全部地点 (${nodes.length})</div>` +
                    nodes.map(n => `<div class="ls-item"><div class="ls-item-meta">第${n.floor ?? '?'}楼</div><div class="ls-item-text">${esc(n.path.join(' › '))}${n.desc ? ' — ' + esc(n.desc) : ''}</div></div>`).join('') +
                    '</div>';
            }
            else if (viewType === 'suspense') {
                title = '🔖 悬念簿';
                const items = s.suspense?.items || [];
                const open = items.filter(x => x.status === 'open');
                const resolved = items.filter(x => x.status === 'resolved').slice(-10).reverse();
                body = (items.length === 0) ? '<div class="ls-hint">暂无悬念。LLM 提取到约定/伏笔/谜团后会自动登记。</div>' :
                    `<div class="ls-group"><div class="ls-group-title">未了结 (${open.length})</div>` +
                    (open.map(x => `<div class="ls-item"><div class="ls-item-meta">${x.kind === 'suspense' ? '谜团' : '约定'} · 第${x.floor ?? '?'}楼${x.createdTime ? ' · ' + esc(x.createdTime) : ''}</div><div class="ls-item-text">${esc(x.content)}</div></div>`).join('') || '<div class="ls-hint">无</div>') +
                    `</div><div class="ls-group"><div class="ls-group-title">近期了结</div>` +
                    (resolved.map(x => `<div class="ls-item"><div class="ls-item-meta">${x.outcome === 'done' ? '✅ 完成' : x.outcome === 'cancelled' ? '🚫 取消' : '❌ 失败'}${x.resolvedReason ? ' · ' + esc(x.resolvedReason) : ''}</div><div class="ls-item-text">${esc(x.content)}</div></div>`).join('') || '<div class="ls-hint">无</div>') +
                    '</div>';
            }
            else if (viewType === 'relations') {
                title = '🔗 关系边';
                const nameOf = (id) => s.graph.nodes.get(id)?.name || id;
                const edges = Array.from(s.graph.edges.values());
                body = edges.length === 0 ? '<div class="ls-hint">暂无关系。</div>' :
                    edges.map(e => `
                        <div class="ls-item">
                            <div class="ls-item-text">${esc(nameOf(e.from))} <span style="color:#89b4fa">—[${esc(e.label || '相关')}]→</span> ${esc(nameOf(e.to))}</div>
                        </div>`).join('');
            }
            else if (viewType === 'vectors') {
                title = '🧲 向量记忆';
                const vecs = s.vector.vectors;
                body = vecs.length === 0 ? '<div class="ls-hint">暂无向量。需要配置 Embedding API。</div>' :
                    vecs.slice().reverse().map(v => `
                        <div class="ls-item">
                            <div class="ls-item-meta">楼层 ${v.metadata?.floor ?? '?'} · ${fmtTime(v.timestamp)}</div>
                            <div class="ls-item-text">${esc((v.text || '').substring(0, 150))}</div>
                        </div>`).join('');
            }

            const ov = makeSheet('lonsha-browser-overlay', title, body || '<div class="ls-hint">暂无数据</div>');
            // 浏览器里加一个返回按钮
            const back = document.createElement('div');
            back.className = 'ls-btn';
            back.textContent = '← 返回状态总览';
            back.addEventListener('click', () => { ov.remove(); plugin.showStatsPanel(); });
            ov.querySelector('.lonsha-sheet-body').appendChild(back);
        };

        // ========== 设置面板 ==========
        plugin.showSettingsPanel = function() {
            const self = this;
            const c = this.engine.config.config;
            const ck = (key, label, hint) => `
                <label class="ls-row">
                    <div><div>${label}</div>${hint ? `<div class="ls-hint">${hint}</div>` : ''}</div>
                    <input type="checkbox" data-cfg="${key}" ${c[key] ? 'checked' : ''}>
                </label>`;
            const body = `
                <div class="ls-group">
                    <div class="ls-group-title">基础开关</div>
                    ${ck('enabled', '启用插件', '总开关，关闭后不提取也不注入')}
                    ${ck('extractionEnabled', '自动提取', '每条 AI 回复后自动用 LLM 提取记忆')}
                    ${ck('vectorEnabled', '向量检索', '需要 Embedding API，关闭则只用关键词+图谱')}
                    ${ck('graphDiffusionEnabled', 'PageRank 图扩散', '从已知角色出发扩散召回关联记忆')}
                    ${ck('autoSave', '自动保存', '每次提取后自动写入对话存档')}
                    ${ck('debugMode', '调试模式', 'console 显示召回分数与提取详情')}
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">召回与注入</div>
                    <div class="ls-slider-label"><span>注入记忆条数 (Top-K)</span><span class="ls-slider-val" id="ls-v-topk">${c.vectorTopK}</span></div>
                    <input type="range" class="ls-slider" min="1" max="20" step="1" value="${c.vectorTopK}" data-cfg-num="vectorTopK">
                    <div class="ls-slider-label"><span>向量权重 α（0=纯图谱，1=纯向量）</span><span class="ls-slider-val" id="ls-v-alpha">${c.hybridAlpha}</span></div>
                    <input type="range" class="ls-slider" min="0" max="1" step="0.1" value="${c.hybridAlpha}" data-cfg-num="hybridAlpha">
                    <div class="ls-slider-label"><span>摘要最大长度</span><span class="ls-slider-val" id="ls-v-sumlen">${c.maxSummaryLength}</span></div>
                    <input type="range" class="ls-slider" min="50" max="500" step="50" value="${c.maxSummaryLength}" data-cfg-num="maxSummaryLength">
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">🛡️ 稳定性 + 预算 + 节日</div>
                    ${ck('extractionLockEnabled', '提取互斥锁', '防并发提取写坏数据（抄 hcdiary）')}
                    ${ck('holidayAware', '节日感知', '剧情日期临近节日时召回相关记忆（圣诞/情人节/七夕等）')}
                    <div class="ls-slider-label"><span>注入预算（字符）</span><span class="ls-slider-val" id="ls-v-budget">${c.injectionBudget || 3000}</span></div>
                    <input type="range" class="ls-slider" min="1000" max="6000" step="200" value="${c.injectionBudget || 3000}" data-cfg-num="injectionBudget">
                    <div class="ls-hint" style="padding:0 8px;">注入简报超预算时自动裁剪，保护上下文窗口。</div>
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">🎮 角色状态 + 待办 + 楼层账本</div>
                    ${ck('characterStateEnabled', '角色状态追踪', '提取时记录好感/疲劳/心情等数值变化，注入时展示当前状态')}
                    ${ck('todoTrackingEnabled', '待办追踪', '提取角色待办事项，剧情时间过期自动清理')}
                    ${ck('floorLedgerEnabled', '楼层账本', '删楼/重生成时自动回滚该楼层产生的记忆')}
                    <div class="ls-hint" style="padding:0 8px;">状态变化由 LLM 每轮提取（delta 增减或绝对值），字段用简短中文（好感/疲劳/心情/健康/信任/金钱等）。</div>
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">📚 层级摘要折叠 + BM25 稀疏检索</div>
                    ${ck('summaryFoldEnabled', '摘要自动折叠', '活跃摘要超阈值时合并成卷摘要，防长线膨胀')}
                    ${ck('bm25Enabled', 'BM25 关键词检索', '词频×逆文档频率稀疏检索，比纯包含匹配更准')}
                    <div class="ls-slider-label"><span>折叠阈值（条）</span><span class="ls-slider-val" id="ls-v-fold">${c.summaryFoldThreshold || 30}</span></div>
                    <input type="range" class="ls-slider" min="15" max="80" step="5" value="${c.summaryFoldThreshold || 30}" data-cfg-num="summaryFoldThreshold">
                    <div class="ls-hint" style="padding:0 8px;">摘要超过阈值后，最早的一批会用 LLM 合并成"卷摘要"（早前剧情概括），旧的单条摘要不再参与召回。</div>
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">🧠 POV 认知边界 + 剧情时间线</div>
                    ${ck('povIsolation', 'POV 私密记忆隔离', '角色私密认知/秘密单独存储，只注入当前登场角色的，防剧透')}
                    ${ck('plotTimeline', '剧情时间线', '按剧情日期整理摘要，召回时优先取当前剧情时间附近')}
                    <div class="ls-hint" style="padding:0 8px;">提取时会额外标注每个事件是客观事实(所有人可见)还是某角色的私密认知(POV)。</div>
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">🪞 反思 + 物品台账 + 注入深度</div>
                    ${ck('reflectionEnabled', '反思节点（抄stbme，需API）', '每N楼从近期剧情提炼高层洞察（关系趋势/潜在线索）注入，与日记独立节流')}
                    <div class="ls-slider-label"><span>每N楼反思一次</span><span class="ls-slider-val" id="ls-v-rf">${c.reflectEveryFloors || 10}</span></div>
                    <input type="range" class="ls-slider" min="3" max="30" step="1" value="${c.reflectEveryFloors || 10}" data-cfg-num="reflectEveryFloors">
                    ${ck('itemLedgerEnabled', '物品台账（抄yuzuki）', '提取物品获得/转移/损坏流转，注入"谁持有什么、什么状态"，防物品凭空消失又出现')}
                    <div class="ls-slider-label"><span>注入深度 D0/D1/D2</span><span class="ls-slider-val" id="ls-v-injdepth">${c.injectionDepth || 0}</span></div>
                    <input type="range" class="ls-slider" min="0" max="2" step="1" value="${c.injectionDepth || 0}" data-cfg-num="injectionDepth">
                    <div class="ls-hint" style="padding:0 8px;">D0=紧邻最新输入；D1/D2=插到更早位置缓解近因偏误（经 setExtensionPrompt depth 参数生效）。</div>
                    <div class="ls-hint" style="padding:0 8px; margin-top:6px;">🎬 番外楼：控制台执行 <code>SillyTavern.getContext().chat[N].extra.lonsha_omit = true</code> 可将该楼排除出记忆系统（小剧场/玩梗楼用）。</div>
                    <div class="ls-hint" style="padding:0 8px; margin-top:6px;">📦 记忆优化：每 ${c.optimizeEveryFloors || 50} 楼自动去重+淘汰最旧（向量上限 ${c.vectorMaxCount || 500} / 摘要上限 ${c.summaryMaxCount || 400}）；🗄️ 每 ${c.snapshotEveryFloors || 50} 楼自动快照（保留最近5份，IndexedDB）。</div>
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">📢 回响池 + 日记 + 提取节流</div>
                    ${ck('echoEnabled', '回响池（抄anima）', '召回过的记忆停留N轮，防同一记忆"这轮有下轮消失"的闪烁感')}
                    ${ck('livingDiary', '活人感日记（抄hcdiary）', '第一人称心声+没说出口的秘密，替代旧版摘要副本日记')}
                    ${ck('reflectionEnabled', '反思节点（抄stbme，需API）', '定期从近期剧情提炼高层洞察（关系趋势/潜在线索）注入，默认关')}
                    <div class="ls-slider-label"><span>回响停留轮数</span><span class="ls-slider-val" id="ls-v-echo">${c.echoBaseLife || 2}</span></div>
                    <input type="range" class="ls-slider" min="1" max="5" step="1" value="${c.echoBaseLife || 2}" data-cfg-num="echoBaseLife">
                    <div class="ls-slider-label"><span>每N楼写一次日记</span><span class="ls-slider-val" id="ls-v-df">${c.diaryEveryFloors || 3}</span></div>
                    <input type="range" class="ls-slider" min="0" max="10" step="1" value="${c.diaryEveryFloors || 3}" data-cfg-num="diaryEveryFloors">
                    <div class="ls-hint" style="padding:0 8px;">日记每N楼批量生成一次（0=每楼），省API额度；生成失败自动跳过不影响主流程。</div>
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">🗺️ 场景树 + 在场分档</div>
                    ${ck('sceneEnabled', '场景地图树', '提取登记地点层级（城市›街区›店铺），注入当前场景链；删楼自动回滚')}
                    ${ck('presenceInjection', '不在场角色提示', '已登场但不在场的角色注入"现在在哪"，防 AI 让人凭空出现')}
                    ${ck('queryRewrite', '查询重写（需API）', '生成前用小模型把剧情改写成检索词，多路召回更准；每轮多一次API调用')}
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">🔖 悬念簿 + 相对时间</div>
                    ${ck('suspenseEnabled', '悬念簿', '约定/伏笔/未解之谜三态追踪（完成/取消/失败），防 AI 把办完的事反复提、把伏笔写丢')}
                    ${ck('relativeTime', '相对时间前缀', '剧情时间线注入时加"3天前·3月12日"式前缀，距离感一目了然；[v2.6] 支持架空日历（霜月3日）与全角分隔符，解析失败自动降级不标')}
                    <div class="ls-slider-label"><span>注入深度（D0/D1/D2）</span><span class="ls-slider-val" id="ls-v-injdepth">${c.injectionDepth || 0}</span></div>
                    <input type="range" class="ls-slider" min="0" max="2" step="1" value="${c.injectionDepth || 0}" data-cfg-num="injectionDepth">
                    <div class="ls-hint" style="padding:0 8px;">D0=紧邻最新输入（默认，当前生效）；D1/D2=插入更早位置缓解近因偏误（需 ST 核心级 hook，预留位暂不生效）。</div>
                    <div class="ls-slider-label"><span>悬念追踪上限（条）</span><span class="ls-slider-val" id="ls-v-susmax">${c.suspenseMaxOpen || 20}</span></div>
                    <input type="range" class="ls-slider" min="5" max="40" step="5" value="${c.suspenseMaxOpen || 20}" data-cfg-num="suspenseMaxOpen">
                    <div class="ls-hint" style="padding:0 8px;">超出上限的最旧悬念自动沉降（标记取消），不再注入但保留记录。</div>
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">📱 RubyPhone 联动</div>
                    ${ck('rubyPhoneBridge', '回填手机记忆', 'LLM 提取结果（摘要/事件/关系）写入 RubyPhone 手机"记忆"App')}
                    ${ck('rubyPhoneRecall', '手机记忆参与召回', 'RubyPhone 记忆库（感官/空间/时间池）作为一路召回源注入简报')}
                    <div class="ls-slider-label"><span>手机记忆召回条数</span><span class="ls-slider-val" id="ls-v-phone">${c.rubyPhoneRecallTopN}</span></div>
                    <input type="range" class="ls-slider" min="1" max="8" step="1" value="${c.rubyPhoneRecallTopN}" data-cfg-num="rubyPhoneRecallTopN">
                    <div class="ls-hint" style="padding:0 8px;">需要已安装 <b>RubyPhone (ruby-phone)</b> 扩展；未安装时自动跳过，不影响本插件。</div>
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">API 配置（可选）</div>
                    <label class="ls-row">
                        <div><div>使用独立提取接口</div><div class="ls-hint">开启后提取走下方 API，不再蹭正文接口。关闭则用宿主接口。</div></div>
                        <input type="checkbox" data-cfg="apiProviderCustom" ${c.apiProviderCustom ? 'checked' : ''}>
                    </label>
                    <div style="padding: 4px 8px;">
                        <input type="text" class="ls-input" placeholder="API 地址（如 https://api.xxx.com/v1）" value="${c.apiUrl || ''}" data-cfg-text="apiUrl" autocomplete="off">
                        <input type="password" class="ls-input" placeholder="API Key" value="${c.apiKey || ''}" data-cfg-text="apiKey" autocomplete="off">
                        <div style="display:flex;gap:6px;">
                            <select class="ls-input" id="ls-model-select" data-cfg-text="apiModel" style="flex:1;display:none;"><option value="${c.apiModel || ''}">${c.apiModel || '点击右侧抓取模型'}</option></select>
                            <input type="text" class="ls-input" id="ls-model-input" placeholder="模型名（或点右侧抓取列表）" value="${c.apiModel || ''}" style="flex:1;display:block;" autocomplete="off">
                            <button class="ls-btn" id="ls-fetch-models" style="width:auto;padding:0 14px;margin:5px 0;white-space:nowrap;">🔄</button>
                        </div>
                        <div class="ls-hint" id="ls-model-status"></div>
                        <div class="ls-hint">兼容 OpenAI 格式；地址填 base 即可（自动补 /chat/completions）</div>
                    </div>
                    <div style="padding: 0 8px;"><div class="ls-group-title" style="margin-top:10px">Embedding（向量检索用）</div></div>
                    <div style="padding: 4px 8px;">
                        <input type="text" class="ls-input" placeholder="Embedding 地址（留空=同提取API）" value="${c.embeddingUrl || ''}" data-cfg-text="embeddingUrl" autocomplete="off">
                        <input type="password" class="ls-input" placeholder="Embedding Key（留空=用提取Key）" value="${c.embeddingKey || ''}" data-cfg-text="embeddingKey" autocomplete="off">
                        <input type="text" class="ls-input" placeholder="Embedding 模型（如 text-embedding-3-small）" value="${c.embeddingModel || ''}" data-cfg-text="embeddingModel" autocomplete="off">
                        <div class="ls-hint">不配置时向量功能用简化算法（弱但免费），配置后为真语义检索</div>
                    </div>
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">🎯 Rerank 精排（可选，抄 baibai 两阶段检索）</div>
                    ${ck('rerankEnabled', 'LLM 精排召回结果', '粗召回后用小模型重排候选。更准但每轮多一次API调用；失败自动降级')}
                    <input type="text" class="ls-input" placeholder="精排API地址（留空=用提取API）" value="${c.rerankApiUrl || ''}" data-cfg-text="rerankApiUrl" autocomplete="off">
                    <input type="password" class="ls-input" placeholder="精排Key（留空=用提取Key）" value="${c.rerankApiKey || ''}" data-cfg-text="rerankApiKey" autocomplete="off">
                    <input type="text" class="ls-input" placeholder="精排模型（建议快而便宜的小模型）" value="${c.rerankModel || ''}" data-cfg-text="rerankModel" autocomplete="off">
                    <div class="ls-slider-label"><span>精排候选数</span><span class="ls-slider-val" id="ls-v-rerank">${c.rerankCandidates || 12}</span></div>
                    <input type="range" class="ls-slider" min="6" max="24" step="2" value="${c.rerankCandidates || 12}" data-cfg-num="rerankCandidates">
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">提取提示词</div>
                    <textarea class="ls-textarea" id="ls-prompt">${c.extractionPrompt}</textarea>
                    <div class="ls-hint">{{CONTENT}} 会替换为消息内容。改坏了解析会失败，届时可点下方恢复默认。</div>
                    <button class="ls-btn" id="ls-prompt-reset">↩️ 恢复默认提示词</button>
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">数据管理</div>
                    <button class="ls-btn" id="ls-export">📤 导出记忆数据 (JSON)</button>
                    <button class="ls-btn" id="ls-import">📥 导入记忆数据</button>
                    <button class="ls-btn ls-btn-danger" id="ls-clear">🗑️ 清空当前对话记忆</button>
                    <div class="ls-hint" style="padding:0 8px;">🚚 携带背包：打包当前记忆 → 新对话里点"导入携带包"，无缝连载（抄 baibai carryover）。</div>
                    <button class="ls-btn" id="ls-carry-pack">🚚 打包当前记忆（带去新对话）</button>
                    <button class="ls-btn" id="ls-carry-apply">📥 导入携带包（新对话开局用）</button>
                </div>
                <button class="ls-btn" id="ls-snap-restore">🗄️ 快照恢复</button>
                <button class="ls-btn ls-btn-primary" id="ls-save">💾 保存设置</button>
            `;

            const overlay = makeSheet('lonsha-settings-overlay', '⚙️ 记忆引擎设置', body);
            // [v3.4] DB 修复：原绑定写在本行之前（overlay 声明前使用 → TDZ ReferenceError，设置面板打开即崩）
            overlay.querySelector('#ls-snap-restore').addEventListener('click', () => { plugin.showSnapshotRestore(); });

            // 滑块实时显示
            overlay.querySelectorAll('input[type=range]').forEach(r => {
                r.addEventListener('input', () => {
                    const map = { vectorTopK: 'ls-v-topk', hybridAlpha: 'ls-v-alpha', maxSummaryLength: 'ls-v-sumlen', rerankCandidates: 'ls-v-rerank', suspenseMaxOpen: 'ls-v-susmax', echoBaseLife: 'ls-v-echo', diaryEveryFloors: 'ls-v-df', injectionDepth: 'ls-v-injdepth', reflectEveryFloors: 'ls-v-rf' };
                    const el = document.getElementById(map[r.dataset.cfgNum]);
                    if (el) el.textContent = r.value;
                });
            });

            // [v1.4.1] 抓取模型列表
            overlay.querySelector('#ls-fetch-models').addEventListener('click', async () => {
                const url = overlay.querySelector('[data-cfg-text="apiUrl"]').value.trim();
                const key = overlay.querySelector('[data-cfg-text="apiKey"]').value.trim();
                const status = overlay.querySelector('#ls-model-status');
                if (!url || !key) { status.textContent = '⚠️ 请先填 API 地址和 Key'; return; }
                status.textContent = '⏳ 抓取中...';
                try {
                    const models = await this.engine.llm.fetchModels(url, key);
                    if (!models.length) { status.textContent = '⚠️ 列表为空'; return; }
                    const sel = overlay.querySelector('#ls-model-select');
                    sel.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
                    if (models.includes(this.engine.config.config.apiModel)) sel.value = this.engine.config.config.apiModel;
                    sel.style.display = 'block';
                    overlay.querySelector('#ls-model-input').style.display = 'none';
                    status.textContent = `✅ 已加载 ${models.length} 个模型`; 
                } catch (e) {
                    status.textContent = '❌ 抓取失败: ' + e.message + '（可手动填模型名）';
                }
            });

            // [v2.3] 携带背包: 打包 → localStorage + 文件下载; 导入 → 应用到当前对话
            overlay.querySelector('#ls-carry-pack').addEventListener('click', () => {
                const pack = this.engine.packCarryover();
                if (!pack) { toast('打包失败'); return; }
                try {
                    localStorage.setItem('lonsha_carryover_pack', JSON.stringify(pack));
                    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `lonsha-carryover-${Date.now()}.json`;
                    a.click();
                    toast(`已打包 摘要${pack.counts?.summaries ?? pack.summaries.length}+悬念${pack.counts?.suspense ?? pack.suspense.length}+图谱${pack.counts?.graphNodes ?? 0}+日记${pack.counts?.diaries ?? 0}+向量${pack.counts?.vectors ?? 0} (本地+文件双备份)`);
                } catch (e) { toast('打包失败: ' + e.message); }
            });
            overlay.querySelector('#ls-carry-apply').addEventListener('click', () => {
                let pack = null;
                try { pack = JSON.parse(localStorage.getItem('lonsha_carryover_pack') || 'null'); } catch (e) {}
                const apply = (p) => {
                    if (this.engine.applyCarryover(p)) {
                        const chatId = this.engine.getCurrentChatId();
                        if (chatId) this.engine.storage.save(chatId, {
                            graph: this.engine.graph.export(), summaries: this.engine.summary.export(),
                            diaries: this.engine.diary.export(), vectors: this.engine.vector.export(),
                            povs: this.engine.pov.export(), timeline: this.engine.timeline.export(),
                            status: this.engine.status.export(), ledger: this.engine.ledger.export(),
                            suspense: this.engine.suspense.export(), version: '2.7.0'
                        });
                        toast('✅ 携带包已导入，剧情无缝衔接');
                    } else toast('导入失败');
                };
                if (pack && pack.summaries) { apply(pack); return; }
                const input = document.createElement('input');
                input.type = 'file'; input.accept = '.json';
                input.onchange = () => {
                    const f = input.files[0]; if (!f) return;
                    const r = new FileReader();
                    r.onload = () => { try { apply(JSON.parse(r.result)); } catch (e) { toast('文件解析失败'); } };
                    r.readAsText(f);
                };
                input.click();
            });
            // 恢复默认提示词
            overlay.querySelector('#ls-prompt-reset').addEventListener('click', () => {
                overlay.querySelector('#ls-prompt').value = `分析以下对话，提取JSON格式：
{"characters": ["角色名"], "events": [{"type": "事件", "description": "描述"}], "relationships": [{"from": "A", "to": "B", "type": "关系"}], "summary": "摘要"}

对话：{{CONTENT}}`;
                toast('已恢复默认提示词');
            });

            // 导出
            overlay.querySelector('#ls-export').addEventListener('click', () => {
                const data = {
                    graph: this.engine.graph.export(),
                    summaries: this.engine.summary.export(),
                    diaries: this.engine.diary.export(),
                    vectors: this.engine.vector.export(),
                    exportedAt: new Date().toISOString()
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `lonsha-memory-${Date.now()}.json`;
                a.click();
                toast('已导出');
            });

            // 导入
            overlay.querySelector('#ls-import').addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = () => {
                    const file = input.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                        try {
                            const data = JSON.parse(reader.result);
                            if (data.graph) this.engine.graph.import(data.graph);
                            if (data.summaries) this.engine.summary.import(data.summaries);
                            if (data.diaries) this.engine.diary.import(data.diaries);
                            if (data.vectors) this.engine.vector.import(data.vectors);
                            const chatId = this.engine.getCurrentChatId();
                            if (chatId) this.engine.storage.save(chatId, {
                                graph: this.engine.graph.export(),
                                summaries: this.engine.summary.export(),
                                diaries: this.engine.diary.export(),
                                vectors: this.engine.vector.export(),
                                version: '1.3.0'
                            });
                            toast('✅ 导入成功');
                        } catch (e) { toast('❌ 导入失败: ' + e.message); }
                    };
                    reader.readAsText(file);
                };
                input.click();
            });

            // 清空
            overlay.querySelector('#ls-clear').addEventListener('click', () => {
                if (!confirm('确定清空当前对话的所有记忆数据？此操作不可恢复。')) return;
                this.engine.graph.nodes.clear();
                this.engine.graph.edges.clear();
                this.engine.graph.nameIndex.clear();
                this.engine.summary.summaries = [];
                this.engine.diary.diaries = {};
                this.engine.vector.vectors = [];
                if (this.engine.pov) this.engine.pov.povs = [];
                if (this.engine.timeline) this.engine.timeline.entries = [];
                if (this.engine.status) this.engine.status.characters = {};
                if (this.engine.ledger) this.engine.ledger.floors = {};
                const chatId = this.engine.getCurrentChatId();
                if (chatId) this.engine.storage.save(chatId, { graph: {nodes:[],edges:[]}, summaries: {summaries:[],volumes:[]}, diaries: {}, vectors: [], povs: [], timeline: [], status: {}, ledger: {}, version: '2.0.0' });
                toast('已清空');
            });

            // 保存
            overlay.querySelector('#ls-save').addEventListener('click', () => {
                overlay.querySelectorAll('[data-cfg]').forEach(el => {
                    this.engine.config.config[el.dataset.cfg] = el.checked;
                });
                overlay.querySelectorAll('[data-cfg-num]').forEach(el => {
                    const v = parseFloat(el.value);
                    this.engine.config.config[el.dataset.cfgNum] = Number.isInteger(v) && el.max !== '1' ? v : v;
                    if (el.dataset.cfgNum === 'vectorTopK' || el.dataset.cfgNum === 'maxSummaryLength') {
                        this.engine.config.config[el.dataset.cfgNum] = parseInt(el.value);
                    }
                });
                overlay.querySelectorAll('[data-cfg-text]').forEach(el => {
                    this.engine.config.config[el.dataset.cfgText] = el.value.trim();
                });
                const promptEl = overlay.querySelector('#ls-prompt');
                if (promptEl && promptEl.value.trim()) {
                    this.engine.config.config.extractionPrompt = promptEl.value;
                }
                this.engine.config.saveConfig();
                toast('✅ 设置已保存');
                closeOverlay('lonsha-settings-overlay');
            });
        };

        // ========== FAB 快捷菜单 ==========
        plugin.showFabMenu = function() {
            const existing = document.getElementById('lonsha-fab-menu');
            if (existing) { existing.remove(); return; }

            const menu = document.createElement('div');
            menu.id = 'lonsha-fab-menu';
            menu.innerHTML = `
                <div style="padding:6px 14px;color:#a6adc8;font-size:11px;border-bottom:1px solid #313244;margin-bottom:4px;">LonSha记忆引擎</div>
                <div class="lsm-item" data-act="stats">📊 状态总览</div>
                <div class="lsm-item" data-act="viz">🕸️ 记忆图谱</div>
                <div class="lsm-item" data-act="settings">⚙️ 设置</div>
                <div class="lsm-item" data-act="diag">🩺 一键诊断</div>
                <style>
                    #lonsha-fab-menu { position: fixed; bottom: 145px; right: 20px; background: #1e1e2e; border: 1px solid #45475a; border-radius: 14px; padding: 6px; z-index: 10001; box-shadow: 0 8px 32px rgba(0,0,0,0.6); min-width: 190px; }
                    .lsm-item { padding: 13px 14px; color: #cdd6f4; font-size: 15px; border-radius: 9px; cursor: pointer; }
                    .lsm-item:active { background: #45475a; }
                </style>
            `;
            menu.querySelectorAll('.lsm-item').forEach(item => {
                item.addEventListener('click', () => {
                    menu.remove();
                    const act = item.dataset.act;
                    if (act === 'stats') plugin.showStatsPanel();
                    else if (act === 'viz') {
                        if (plugin.visualizer) plugin.visualizer.createPanel();
                        else plugin.showStatsPanel();
                    }
                    else if (act === 'settings') plugin.showSettingsPanel();
                    else if (act === 'diag') plugin.showDiagnose();
                });
            });
            document.body.appendChild(menu);
            setTimeout(() => {
                const closer = (e) => {
                    if (!menu.contains(e.target) && e.target.id !== 'lonsha-memory-fab') {
                        menu.remove();
                        document.removeEventListener('click', closer);
                    }
                };
                document.addEventListener('click', closer);
            }, 50);
        };

        // [v2.9] RU-C: 快照恢复面板
        plugin.showSnapshotRestore = async function() {
            const engine = plugin.engine;
            const chatId = engine.getCurrentChatId();
            if (!chatId) { toast('无可用对话'); return; }
            const snaps = await engine.snapshots.list(chatId);
            if (!snaps.length) { toast('暂无快照（每50楼自动保存一份）'); return; }
            const body = snaps.map(s => {
                const time = new Date(s.timestamp).toLocaleString();
                return `<div class="lsm-item" data-floor="${s.floor}" style="display:flex;justify-content:space-between;">
                    <span>楼层 ${s.floor}</span><span style="color:#a6adc8;font-size:12px;">${time}</span>
                </div>`;
            }).join('');
            const menu = document.createElement('div');
            menu.id = 'lonsha-snap-menu';
            menu.innerHTML = `
                <div style="padding:6px 14px;color:#a6adc8;font-size:11px;border-bottom:1px solid #313244;">🗄️ 快照恢复（选择要恢复的楼层）</div>
                ${body}
                <style>#lonsha-snap-menu { position: fixed; bottom: 200px; right: 20px; background: #1e1e2e; border: 1px solid #45475a; border-radius: 14px; padding: 6px; z-index: 10001; box-shadow: 0 8px 32px rgba(0,0,0,0.6); min-width: 260px; max-height: 60vh; overflow-y: auto; }</style>`;
            menu.querySelectorAll('.lsm-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const floor = Number(item.dataset.floor);
                    const data = await engine.snapshots.restore(chatId, floor);
                    if (!data) { toast('快照数据为空'); return; }
                    // 恢复：与 load 相同的导入管线
                    try {
                        if (data.graph) engine.graph.import(data.graph);
                        if (data.summaries) engine.summary.import(data.summaries);
                        if (data.diaries) engine.diary.import(data.diaries);
                        if (data.vectors) engine.vector.import(data.vectors);
                        if (data.povs && engine.pov) engine.pov.import(data.povs);
                        if (data.timeline && engine.timeline) engine.timeline.import(data.timeline);
                        if (data.status && engine.status) engine.status.import(data.status);
                        if (data.ledger && engine.ledger) engine.ledger.import(data.ledger);
                        if (data.suspense && engine.suspense) engine.suspense.import(data.suspense);
                        if (data.scene && engine.scene) engine.scene.import(data.scene);
                        if (data.echo && engine.echo) engine.echo.import(data.echo);
                        if (data.reflection && engine.reflection) engine.reflection.import(data.reflection);
                        if (Array.isArray(data.itemOps)) { engine.itemOps = data.itemOps; (engine.reconcileItemOps || engine.rebuildItems).call(engine); }   // [v3.4] 恢复后走对账（补 fp/清理，去重复调用）
                        const cid = engine.getCurrentChatId();
                        if (cid) await engine.storage.save(cid, engine.collectExport());
                        menu.remove();
                        toast(`✅ 已恢复到快照（楼层 ${floor}）`);
                    } catch (e) { toast('恢复失败: ' + e.message); }
                });
            });
            const closer = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', closer); } };
            setTimeout(() => document.addEventListener('click', closer), 50);
            document.body.appendChild(menu);
        };

        // [v3.0] SD: 一键诊断面板
        plugin.showDiagnose = async function() {
            const engine = plugin.engine;
            if (!engine) { toast('引擎未初始化'); return; }
            toast('诊断中…');
            let r;
            try { r = await engine.selfCheck(); } catch (e) { toast('诊断失败: ' + e.message); return; }
            const errRows = (r.errors || []).slice(-15).reverse().map(e2 =>
                `<div style="padding:4px 8px;font-size:11px;border-bottom:1px solid #313244;">
                    <span style="color:#f38ba8;">[${e2.tag}]</span> <span style="color:#a6adc8;">${new Date(e2.t).toLocaleTimeString()}</span>
                    <div style="color:#cdd6f4;font-size:12px;">${(e2.msg || '').substring(0, 120)}</div>
                </div>`).join('') || '<div style="padding:8px;color:#a6e3a1;font-size:12px;">✓ 无错误记录</div>';
            const statRows = (r.stats || []).map(s => `<div style="display:flex;justify-content:space-between;padding:5px 8px;font-size:13px;border-bottom:1px solid #313244;">
                <span style="color:#a6adc8;">${s.k}</span><span>${s.v}</span></div>`).join('');
            const p = r.pipeline;
            const pipeHTML = p ? (p.ok
                ? `<div style="padding:6px 8px;font-size:12px;color:#a6e3a1;">✓ 管线通畅 ${p.ms}ms ｜ 查询${p.queryLen}字 → 命中[${(p.routes || []).join(' ')}] → 合并${p.merged}条 → 注入${p.injLen}字</div>`
                : `<div style="padding:6px 8px;font-size:12px;color:#f9e2af;">⚠️ ${p.note || '管线异常'}</div>`) : '';
            const sc = r.schema;
            const schemaHTML = sc ? (sc.ok
                ? `<div style="padding:6px 8px;font-size:12px;color:#a6e3a1;">✓ 存档完整（非空: ${(sc.nonEmpty || []).join('、') || '暂无数据'}）</div>`
                : `<div style="padding:6px 8px;font-size:12px;color:#f38ba8;">✗ 缺失字段: ${(sc.missing || []).join('、')}</div>`) : '';
            const body = `
                <div style="padding:4px 8px;font-size:11px;color:#a6adc8;">${r.time} ｜ v${r.version}</div>
                <div style="margin:6px 0;">${statRows}</div>
                ${pipeHTML}${schemaHTML}
                <div style="padding:6px 8px;font-size:12px;color:#a6adc8;border-top:1px solid #45475a;margin-top:6px;">最近错误（环形缓冲，最多50条）</div>
                <div style="max-height:30vh;overflow-y:auto;">${errRows}</div>`;
            const overlay = makeSheet('lonsha-diag-overlay', '🩺 一键诊断', body);
        };

        console.log('[LonSha记忆引擎] ✓ 设置面板模块已挂载 (点击🧠 → ⚙️设置)');
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(mount, 300));
    } else {
        setTimeout(mount, 300);
    }
})();