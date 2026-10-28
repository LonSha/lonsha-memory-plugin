// LonSha记忆引擎 - 设置与状态面板 (v1.3)
// settings-ui.js - 移动端适配的设置界面，通过原型扩展挂载到 LonShaMemoryPlugin
(function() {
    'use strict';

    // 等插件就绪后挂载
    const mount = () => {
        const plugin = window.LonShaMemory;
        if (!plugin) { setTimeout(mount, 200); return; }

        const PLUGIN_NAME = 'LonSha记忆引擎';
        const reportUiError = (error, tag = 'nonfatal') => {
            try {
                const logger = window.LonShaMemory?.reportError;
                if (typeof logger === 'function') logger(error, `settings-ui.${tag}`);
                else if (window.LonShaMemory?.config?.config?.debugMode) console.warn(`[${PLUGIN_NAME}][${tag}]`, error);
            } catch (reportError) { console.warn('[LonShaMemory][settings-ui.report]', reportError); }
        };

        const VERSION = plugin.VERSION || '3.77.0';   // [v3.77] A: 版本真值（原硬编码 '1.3.0' 假版本，自检/展示全用真值）

        // ========== 共享样式 ==========
        const style = document.createElement('style');
        style.textContent = `
            /* ==== LonSha 设置面板 · 精密档案室微质感 v3.5 ==== */
            /* [v3.422] 缺陷修复：设计 token 就地作用域化。此前 --ls-* 只声明在 :root（css/lonsha-design.css），
               宿主 SillyTavern 的主题变量 / 样式注入时序一旦在 :root 层改写同名变量，面板就会退化成
               「白底 + 淡色字」完全不可读。现把全套 token 重声明到 .lonsha-overlay（覆盖其内 .lonsha-sheet 及全部后代）
               与 .ls-toast（直接挂在 body 上，不经过 sheet）两种容器上：
               自定义属性按「就近继承」解析，面板内部全部 var(--ls-*) 以容器层为准，宿主 :root 改写无法穿透。
               本清单与 css/lonsha-design.css 严格同步（单一事实源仍在那边，此处为防御性副本）。 */
            .lonsha-overlay,
            .ls-toast,
            #lonsha-memory-fab {
                /* [v3.424.0] 缺陷修复：真机反馈「复选框和底部按钮还是白底，看不清」。
                 *   根因不是配色，而是原生控件底色：accent-color 只决定勾选时的填充色，
                 *   checkbox 未勾选态的方块底、input 的默认底都由浏览器按 color-scheme 决定，
                 *   而本面板此前从未声明它 —— 宿主页面若是浅色 color-scheme，
                 *   深色面板里就必然嵌着几块白底原生控件。声明 dark 后原生件随深色走。 */
                color-scheme: dark;
                --ls-accent: #38bdf8; --ls-accent-strong: #0284c7; --ls-accent-hover: #7dd3fc;
                --ls-accent-soft: rgba(56,189,248,0.10); --ls-accent-softer: rgba(56,189,248,0.05);
                --ls-accent-line: rgba(56,189,248,0.28); --ls-on-accent: #04121e;
                --ls-gold: #fbbf24; --ls-gold-soft: rgba(251,191,36,0.10); --ls-gold-line: rgba(251,191,36,0.30); --ls-gold-hover: #fde68a;
                --ls-bg-0: #06080d; --ls-bg-1: #0a0f18; --ls-bg-2: #111827; --ls-bg-3: #1b2436; --ls-bg-4: #27334a;
                --ls-bg-glass: rgba(10,15,24,0.88);
                --ls-line: rgba(255,255,255,0.07); --ls-line-strong: rgba(255,255,255,0.14); --ls-line-subtle: rgba(255,255,255,0.04);
                --ls-inner-rim: inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.40);
                --ls-inner-glow: inset 0 0 16px rgba(56,189,248,0.04);
                --ls-text: #f1f5f9; --ls-text-2: #94a3b8; --ls-text-3: #64748b; --ls-text-4: #475569; --ls-inverse: #06080d;
                --ls-success: #34d399; --ls-success-soft: rgba(52,211,153,0.10);
                --ls-warn: #fbbf24; --ls-warn-soft: rgba(251,191,36,0.10);
                --ls-danger: #f87171; --ls-danger-soft: rgba(248,113,113,0.12); --ls-danger-line: rgba(248,113,113,0.30);
                --ls-info: #38bdf8; --ls-info-soft: rgba(56,189,248,0.10);
                --ls-r-xs: 4px; --ls-r-sm: 6px; --ls-r-md: 10px; --ls-r-lg: 14px; --ls-r-xl: 18px; --ls-r-pill: 9999px;
                --ls-sh-1: 0 1px 2px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.35);
                --ls-sh-2: 0 4px 20px -2px rgba(0,0,0,0.65), 0 12px 32px -4px rgba(2,6,23,0.55);
                --ls-sh-3: 0 20px 50px -10px rgba(0,0,0,0.85), 0 10px 24px -5px rgba(0,0,0,0.65);
                --ls-sh-accent: 0 2px 14px rgba(56,189,248,0.28); --ls-sh-accent-lg: 0 6px 28px rgba(56,189,248,0.38);
                --ls-glow-gold: 0 2px 14px rgba(251,191,36,0.25);
                --ls-t-fast: 140ms; --ls-t-med: 220ms; --ls-t-slow: 360ms;
                --ls-ease: cubic-bezier(0.16, 1, 0.3, 1); --ls-ease-out: cubic-bezier(0, 0, 0.2, 1);
                --ls-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
                --ls-mono: ui-monospace, "JetBrains Mono", "SF Mono", "Cascadia Code", Consolas, monospace;
                --ls-blur: saturate(160%) blur(20px);
                --ls-radial-glow: radial-gradient(circle at 50% 0%, rgba(56,189,248,0.08) 0%, transparent 75%);
            }
            .lonsha-overlay { position: fixed; inset: 0; background: rgba(4, 7, 12, 0.75); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10002; display: flex; align-items: flex-end; justify-content: center; animation: ls-fade var(--ls-t-med,220ms) var(--ls-ease-out,ease); }
            @media (min-width: 600px) { .lonsha-overlay { align-items: center; } }
            @keyframes ls-fade { from { opacity: 0; } to { opacity: 1; } }
            .lonsha-sheet { background: var(--ls-bg-1, #0a0f18); background-image: var(--ls-radial-glow); backdrop-filter: var(--ls-blur, saturate(160%) blur(20px)); -webkit-backdrop-filter: var(--ls-blur, saturate(160%) blur(20px)); width: 100%; max-width: 520px; max-height: 85vh; border-radius: var(--ls-r-lg, 14px) var(--ls-r-lg, 14px) 0 0; display: flex; flex-direction: column; border: 1px solid var(--ls-line-strong, rgba(255,255,255,0.14)); box-shadow: var(--ls-sh-3), var(--ls-inner-rim); color: var(--ls-text, #f1f5f9); font-family: var(--ls-font, system-ui, sans-serif); animation: ls-sheet-up var(--ls-t-slow, 360ms) var(--ls-ease); overflow: hidden; }
            @media (min-width: 600px) { .lonsha-sheet { border-radius: var(--ls-r-lg, 14px); max-height: 82vh; animation: ls-sheet-pop var(--ls-t-slow, 360ms) var(--ls-ease); } }
            @keyframes ls-sheet-up { from { transform: translateY(28px); opacity: 0; filter: blur(4px); } to { transform: none; opacity: 1; filter: blur(0); } }
            @keyframes ls-sheet-pop { from { transform: scale(0.96); opacity: 0; filter: blur(4px); } to { transform: none; opacity: 1; filter: blur(0); } }
            .lonsha-sheet-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: var(--ls-bg-2, #111827); border-bottom: 1px solid var(--ls-line, rgba(255,255,255,0.07)); color: var(--ls-text, #f1f5f9); font-size: 15px; font-weight: 600; letter-spacing: -0.01em; flex-shrink: 0; box-shadow: 0 1px 0 rgba(255,255,255,0.02); }
            .lonsha-sheet-close { padding: 6px 10px; color: var(--ls-text-3, #64748b); font-size: 17px; cursor: pointer; border-radius: var(--ls-r-sm, 6px); border: 1px solid transparent; transition: all var(--ls-t-fast, 140ms) var(--ls-ease); }
            .lonsha-sheet-close:hover { background: var(--ls-danger-soft, rgba(248,113,113,0.12)); border-color: var(--ls-danger-line); color: var(--ls-danger, #f87171); }
            .lonsha-sheet-body { padding: 16px 20px 28px; overflow-y: auto; -webkit-overflow-scrolling: touch; color: var(--ls-text, #f1f5f9); }
            .ls-group { margin-bottom: 20px; }
            .ls-group-title { font-size: 11px; color: var(--ls-accent, #38bdf8); margin: 12px 0 8px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; overflow-wrap: anywhere; word-break: break-word; font-family: var(--ls-mono); display: flex; align-items: center; gap: 6px; }
            .ls-group-title::before { content: ''; width: 4px; height: 4px; border-radius: 50%; background: var(--ls-accent); box-shadow: 0 0 6px var(--ls-accent); }
            .ls-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 10px; border-bottom: 1px solid var(--ls-line, rgba(255,255,255,0.06)); font-size: 14px; border-radius: var(--ls-r-sm); transition: background var(--ls-t-fast) var(--ls-ease); }
            .ls-row:hover { background: var(--ls-accent-softer); }
            .ls-row > div { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
            .ls-row:last-child { border-bottom: none; }
            .ls-row input[type="checkbox"] { width: 38px; height: 38px; margin: 0; cursor: pointer; accent-color: var(--ls-accent, #38bdf8); appearance: none; -webkit-appearance: none; background-color: var(--ls-bg-2, #111827); border: 2px solid var(--ls-line-strong, rgba(255,255,255,0.14)); border-radius: var(--ls-r-sm, 6px); position: relative; box-sizing: border-box; transition: background-color var(--ls-t-fast, 140ms) var(--ls-ease), border-color var(--ls-t-fast, 140ms) var(--ls-ease); }
            .ls-row input[type="checkbox"]:hover { border-color: var(--ls-accent-line, rgba(56,189,248,0.28)); }
            /* 勾选态：自绘对勾（appearance:none 后原生勾选标记不再出现，必须自己画） */
            .ls-row input[type="checkbox"]:checked { background-color: var(--ls-accent-strong, #0284c7); border-color: var(--ls-accent, #38bdf8); }
            .ls-row input[type="checkbox"]:checked::after { content: ''; position: absolute; left: 12px; top: 5px; width: 8px; height: 15px; border: solid #ffffff; border-width: 0 3px 3px 0; transform: rotate(45deg); box-sizing: border-box; }
            .ls-row input[type="checkbox"]:focus-visible { outline: 2px solid var(--ls-accent, #38bdf8); outline-offset: 2px; }
            .ls-slider { width: 100%; accent-color: var(--ls-accent, #38bdf8); height: 28px; cursor: pointer; color-scheme: dark; }
            .ls-slider-label { display: flex; justify-content: space-between; gap: 8px; min-width: 0; font-size: 13px; padding: 8px 4px; color: var(--ls-text-2, #94a3b8); overflow-wrap: anywhere; word-break: break-word; }
            .ls-slider-val { color: var(--ls-accent, #38bdf8); font-weight: 600; font-variant-numeric: tabular-nums; font-family: var(--ls-mono); }
            .ls-input { width: 100%; background: var(--ls-bg-2, #111827); color: var(--ls-text, #f1f5f9); border: 1px solid var(--ls-line, rgba(255,255,255,0.08)); border-radius: var(--ls-r-sm, 6px); padding: 10px 12px; font-size: 13px; margin: 5px 0; box-sizing: border-box; box-shadow: inset 0 1px 2px rgba(0,0,0,0.4); transition: all var(--ls-t-fast, 140ms) var(--ls-ease); }
            .ls-input:focus { outline: none; border-color: var(--ls-accent, #38bdf8); box-shadow: 0 0 0 2px var(--ls-accent-soft), inset 0 1px 2px rgba(0,0,0,0.4); }
            .ls-input::placeholder { color: var(--ls-text-4, #475569); }
            .ls-textarea { width: 100%; min-height: 120px; background: var(--ls-bg-2, #111827); color: var(--ls-text, #f1f5f9); border: 1px solid var(--ls-line, rgba(255,255,255,0.08)); border-radius: var(--ls-r-sm, 6px); padding: 11px 12px; font-size: 13px; font-family: var(--ls-mono, monospace); box-sizing: border-box; box-shadow: inset 0 1px 2px rgba(0,0,0,0.4); transition: all var(--ls-t-fast, 140ms) var(--ls-ease); line-height: 1.5; }
            .ls-textarea:focus { outline: none; border-color: var(--ls-accent, #38bdf8); box-shadow: 0 0 0 2px var(--ls-accent-soft), inset 0 1px 2px rgba(0,0,0,0.4); }
            .ls-btn { display: block; width: 100%; padding: 11px 14px; margin: 8px 0; background: var(--ls-bg-3, #1b2436); color: var(--ls-text, #f1f5f9); border: 1px solid var(--ls-line, rgba(255,255,255,0.08)); border-radius: var(--ls-r-sm, 6px); font-size: 14px; font-weight: 500; letter-spacing: 0.01em; text-align: center; cursor: pointer; box-shadow: var(--ls-sh-1), var(--ls-inner-rim); transition: all var(--ls-t-fast, 140ms) var(--ls-ease); }
            .ls-btn:hover { background: var(--ls-bg-4, #27334a); border-color: var(--ls-line-strong); color: #ffffff; }
            /* [v3.424.0] 面板内**所有**原生按钮兜底压成深色：真机反馈底部三个胶囊按钮仍是白底。
             *   它们没带 .ls-btn（走的是行内样式），宿主浅色主题的 button 默认底因此透出来。
             *   只作用于面板容器内部，不影响宿主其他 UI。 */
            .lonsha-sheet button:not(.ls-btn):not(.ls-tab-btn):not(.ls-mode-pill) {
                background-color: var(--ls-bg-3, #1b2436);
                color: var(--ls-text, #f1f5f9);
                border: 1px solid var(--ls-line, rgba(255,255,255,0.08));
                border-radius: var(--ls-r-sm, 6px);
                box-shadow: var(--ls-inner-rim);
            }
            .lonsha-sheet button:not(.ls-btn):not(.ls-tab-btn):not(.ls-mode-pill):hover {
                background-color: var(--ls-bg-4, #27334a);
                color: #ffffff;
            }
            .ls-btn:active { transform: translateY(1px); box-shadow: none; }
            .ls-btn-primary { background: var(--ls-accent-strong, #0284c7); border-color: transparent; color: #ffffff; font-weight: 600; box-shadow: var(--ls-sh-accent), inset 0 1px 0 rgba(255,255,255,0.22); }
            .ls-btn-primary:hover { background: var(--ls-accent, #38bdf8); color: #04121e; box-shadow: var(--ls-sh-accent-lg); }
            .ls-btn-danger { background: var(--ls-danger-soft, rgba(248,113,113,0.12)); border-color: var(--ls-danger-line); color: var(--ls-danger, #f87171); }
            .ls-btn-danger:hover { background: var(--ls-danger); color: #04121e; border-color: transparent; }

            .ls-stat-section-title { font-size: 11px; font-weight: 600; color: var(--ls-accent, #38bdf8); margin: 16px 0 6px 2px; letter-spacing: 0.08em; text-transform: uppercase; font-family: var(--ls-mono); display: flex; align-items: center; gap: 6px; }
            .ls-stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 12px 0; }
            .ls-stat-card { background: var(--ls-bg-2, #111827); border: 1px solid var(--ls-line, rgba(255,255,255,0.07)); border-radius: var(--ls-r-sm, 6px); padding: 14px 6px; text-align: center; position: relative; overflow: hidden; box-shadow: var(--ls-sh-1), var(--ls-inner-rim); transition: all var(--ls-t-med, 220ms) var(--ls-ease); }
            .ls-stat-card::before { content: ''; position: absolute; top: 0; left: 15%; right: 15%; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent); }
            .ls-stat-card:hover { transform: translateY(-2px); border-color: var(--ls-accent-line); box-shadow: var(--ls-sh-2), 0 0 16px -4px rgba(56,189,248,0.2); }
            .ls-stat-num { font-size: 20px; font-weight: 700; color: var(--ls-text, #f1f5f9); font-variant-numeric: tabular-nums; font-family: var(--ls-mono); letter-spacing: -0.02em; }
            .ls-stat-label { font-size: 11px; color: var(--ls-text-2, #94a3b8); margin-top: 3px; letter-spacing: 0.04em; text-transform: uppercase; font-weight: 500; }
            .ls-hint { font-size: 12px; color: var(--ls-text-3, #64748b); padding: 6px 4px; line-height: 1.55; overflow-wrap: anywhere; word-break: break-word; }
            .ls-clickable { cursor: pointer; transition: all var(--ls-t-fast, 140ms) var(--ls-ease); }
            .ls-clickable:active { transform: scale(0.98); }
            .ls-item { background: var(--ls-bg-2, #111827); border: 1px solid var(--ls-line, rgba(255,255,255,0.07)); border-radius: var(--ls-r-sm, 6px); padding: 12px 14px; margin: 8px 0; box-shadow: var(--ls-inner-rim); }
            .ls-item-meta { font-size: 11px; color: var(--ls-text-3, #64748b); margin-bottom: 5px; font-family: var(--ls-mono); }
            .ls-item-text { font-size: 14px; color: var(--ls-text, #f1f5f9); line-height: 1.6; word-break: break-word; }
            .ls-toast { position: fixed; bottom: 150px; left: 50%; transform: translateX(-50%); background: var(--ls-bg-glass); backdrop-filter: var(--ls-blur); -webkit-backdrop-filter: var(--ls-blur); color: var(--ls-text); border: 1px solid var(--ls-accent-line); padding: 10px 22px; border-radius: var(--ls-r-pill, 999px); font-size: 13px; font-weight: 600; letter-spacing: 0.02em; box-shadow: var(--ls-sh-3), var(--ls-sh-accent); z-index: 10003; animation: ls-toast-in var(--ls-t-med, 220ms) var(--ls-ease); }
            @keyframes ls-toast-in { from { transform: translate(-50%,10px); opacity: 0; } to { transform: translate(-50%,0); opacity: 1; } }
            /* ==== Tab 选项卡导航（微刻度分段芯片） ==== */
            .ls-tabs-nav { display: flex; gap: 6px; border-bottom: 1px solid var(--ls-line, rgba(255,255,255,0.07)); padding: 0 0 10px 0; margin-bottom: 16px; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
            .ls-tabs-nav::-webkit-scrollbar { display: none; }
            .ls-tab-btn { background: var(--ls-bg-2, #111827); border: 1px solid var(--ls-line, rgba(255,255,255,0.07)); color: var(--ls-text-2, #94a3b8); padding: 7px 13px; border-radius: var(--ls-r-sm, 6px); font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap; transition: all var(--ls-t-fast, 140ms); flex-shrink: 0; min-width: 0; overflow-wrap: anywhere; word-break: break-word; box-shadow: inset 0 1px 0 rgba(255,255,255,0.03); }
            .ls-tab-btn:hover { color: var(--ls-text, #f1f5f9); background: var(--ls-bg-3, #1b2436); border-color: var(--ls-line-strong); }
            .ls-tab-btn.active { color: var(--ls-accent, #38bdf8); background: var(--ls-bg-4, #27334a); border-color: var(--ls-accent-line); font-weight: 600; box-shadow: var(--ls-sh-accent), inset 0 1px 0 rgba(56,189,248,0.3); }
            .ls-tab-pane { display: none; }
            .ls-tab-pane.active { display: block; animation: ls-fade var(--ls-t-fast,150ms) var(--ls-ease,ease); }
            .ls-mode-banner { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 0 0 16px 0; padding: 4px; background: rgba(0,0,0,0.25); border-radius: var(--ls-r-sm, 6px); border: 1px solid var(--ls-line, rgba(255,255,255,0.06)); }
            .ls-mode-pill { padding: 8px 4px; text-align: center; font-size: 11px; font-weight: 600; color: var(--ls-text-2, #94a3b8); border-radius: 4px; cursor: pointer; transition: all var(--ls-t-fast, 140ms); }
            .ls-mode-pill:hover { color: var(--ls-text, #f1f5f9); background: rgba(255,255,255,0.04); }
            .ls-mode-pill.active { color: var(--ls-accent, #38bdf8); background: var(--ls-bg-3, #1b2436); box-shadow: var(--ls-inner-rim), 0 0 12px rgba(56,189,248,0.15); }
            /* ==== [v3.423] 玩家主页（FAB 直达） ==== */
            .ls-home-status { background: var(--ls-bg-2, #111827); border: 1px solid var(--ls-line, rgba(255,255,255,0.07)); border-radius: var(--ls-r-md, 10px); padding: 14px; margin-bottom: 16px; box-shadow: var(--ls-inner-rim); }
            .ls-home-status-main { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
            .ls-home-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
            .ls-home-modes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 4px; background: rgba(0,0,0,0.25); border-radius: var(--ls-r-sm, 6px); border: 1px solid var(--ls-line, rgba(255,255,255,0.06)); }
            .ls-home-section { margin-bottom: 18px; }
            .ls-home-title { font-size: 13px; font-weight: 600; color: var(--ls-text-2, #94a3b8); margin: 0 0 8px 2px; letter-spacing: 0.04em; display: flex; align-items: center; justify-content: space-between; }
            .ls-home-more { font-size: 12px; color: var(--ls-accent, #38bdf8); cursor: pointer; font-weight: 500; }
            .ls-home-event { padding: 10px 12px; background: var(--ls-bg-2, #111827); border: 1px solid var(--ls-line, rgba(255,255,255,0.06)); border-radius: var(--ls-r-sm, 6px); margin-bottom: 6px; font-size: 13px; color: var(--ls-text, #f1f5f9); line-height: 1.5; position: relative; }
            .ls-home-event-meta { display: block; font-size: 11px; color: var(--ls-text-3, #64748b); margin-top: 3px; font-family: var(--ls-mono, monospace); }
            .ls-home-chip { display: inline-block; padding: 6px 14px; margin: 0 6px 6px 0; background: var(--ls-bg-2, #111827); border: 1px solid var(--ls-line, rgba(255,255,255,0.08)); border-radius: var(--ls-r-pill, 999px); font-size: 13px; color: var(--ls-text, #f1f5f9); cursor: pointer; transition: all var(--ls-t-fast, 140ms); }
            .ls-home-chip:hover { border-color: var(--ls-accent-line); color: var(--ls-accent, #38bdf8); }
            .ls-home-actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 4px; }
            .ls-home-actions .ls-btn { margin: 0; width: 100%; box-sizing: border-box; }

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
            } catch (e) { reportUiError(e, 'nonfatal') }
            const body = `
                <div class="ls-stat-section-title">◷ 发生的故事</div>
                <div class="ls-stat-grid">
                    <div class="ls-stat-card ls-clickable" data-view="timeline"><div class="ls-stat-num">${s.timeline?.entries?.length || 0}</div><div class="ls-stat-label">剧情时间线</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="summaries"><div class="ls-stat-num">${s.summary.summaries.length}</div><div class="ls-stat-label">事件摘要</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="deltas"><div class="ls-stat-num">${s.deltaBook?.deltas?.length || 0}</div><div class="ls-stat-label">正史增量</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="volumes"><div class="ls-stat-num">${s.summary?.volumes?.length || 0}</div><div class="ls-stat-label">分卷史记</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="lockedfacts"><div class="ls-stat-num">${s.summary?.getLockedFacts?.().length || 0}</div><div class="ls-stat-label">锁定史实</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="pulse"><div class="ls-stat-num">${s.pulse?.beats?.length || 0}</div><div class="ls-stat-label">叙事张力</div></div>
                </div>

                <div class="ls-stat-section-title">◈ 人物</div>
                <div class="ls-stat-grid">
                    <div class="ls-stat-card ls-clickable" data-view="status"><div class="ls-stat-num">${Object.keys(s.status?.characters || {}).length}</div><div class="ls-stat-label">角色心境</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="povs"><div class="ls-stat-num">${s.pov?.povs?.length || 0}</div><div class="ls-stat-label">私密心声</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="diaries"><div class="ls-stat-num">${Object.keys(s.diary.diaries).length}</div><div class="ls-stat-label">角色日记</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="protagonist"><div class="ls-stat-num">${['gender','age','identity','appearance','outfit','condition'].filter(k => s.status?.protagonist?.[k]).length}</div><div class="ls-stat-label">主角档案</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="relations"><div class="ls-stat-num">${s.graph.edges.size}</div><div class="ls-stat-label">关系网络</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="conflicts"><div class="ls-stat-num">${s.conflicts?.conflicts?.length || 0}</div><div class="ls-stat-label">未决矛盾</div></div>
                </div>

                <div class="ls-stat-section-title">⬡ 世界与物品</div>
                <div class="ls-stat-grid">
                    <div class="ls-stat-card ls-clickable" data-view="items"><div class="ls-stat-num">${s.items?.records?.length || 0}</div><div class="ls-stat-label">物品流转</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="suspense"><div class="ls-stat-num">${s.suspense?.openItems?.().length || 0}</div><div class="ls-stat-label">未解之谜</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="scene"><div class="ls-stat-num">${s.scene?.nodes?.size || 0}</div><div class="ls-stat-label">场景地点</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="graph"><div class="ls-stat-num">${s.graph.nodes.size}</div><div class="ls-stat-label">认知节点</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="vectors"><div class="ls-stat-num">${s.vector.vectors.length}</div><div class="ls-stat-label">语义向量</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="prequel"><div class="ls-stat-num">${s.prequel?.text ? '已导入' : '—'}</div><div class="ls-stat-label">前情设定</div></div>
                </div>

                <div class="ls-stat-section-title">⚙ 维护</div>
                <div class="ls-stat-grid">
                    <div class="ls-stat-card ls-clickable" data-view="injection"><div class="ls-stat-num">${s._lastInjection ? '就绪' : '—'}</div><div class="ls-stat-label">本轮注入预览</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="memorycenter"><div class="ls-stat-num">调阅</div><div class="ls-stat-label">详细设置</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="report"><div class="ls-stat-num">生成</div><div class="ls-stat-label">全景档案报告</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="archive"><div class="ls-stat-num">${s._lastArchiveAudit ? (s._lastArchiveAudit.verdict === 'classified' ? ((s._lastArchiveAudit.cleanup || 0) > 0 ? (s._lastArchiveAudit.cleanup + ' 项') : '正常') : '—') : '—'}</div><div class="ls-stat-label">存档健康体检</div></div>
                    <div class="ls-stat-card ls-clickable" data-view="oplog" title="${(s.opLog?._truncated || s.opLog?._trimFields) ? '账本已发生淘汰或字段裁剪，点击查看自述' : '事件审计链（窗口/累计/损失）'}"><div class="ls-stat-num">${s.opLog?.entries?.length || 0}${(s.opLog?._truncated || s.opLog?._trimFields) ? '<span title="账本有损失" style="font-size:12px;color:var(--ls-warn,#e3b341)">※</span>' : ''}</div><div class="ls-stat-label">操作审计日志</div></div>
                    <div class="ls-stat-card"><div class="ls-stat-num" style="font-size:13px;line-height:24px;">${phoneStatus}</div><div class="ls-stat-label">RubyPhone 协同</div></div>
                </div>
                <div class="ls-hint" style="display:flex;align-items:center;gap:6px;"><span style="color:var(--ls-accent);font-size:14px;">◈</span> 点击卡片可查看对应档案的条目明细与演进事实。数据自动与对话快照安全绑定。</div>
                <details style="margin-top:14px;border:1px solid var(--ls-line,rgba(240,246,252,0.10));border-radius:var(--ls-r-md,12px);padding:8px 12px;background:var(--ls-bg-2,#161b22);">
                    <summary style="cursor:pointer;color:var(--ls-accent,#58a6ff);font-size:12px;font-weight:600;padding:4px 0;">🔍 展开查看底层运行轨迹与诊断指标</summary>
                    <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--ls-line,rgba(240,246,252,0.10));">
                ${s._lastRecallTrace ? `<div class="ls-group"><div class="ls-group-title">🎯 最近一次召回（MemoryPilot monitor）</div><div class="ls-item"><div class="ls-item-meta">查询「${s._lastRecallTrace.query || ''}」 · ${s._lastRecallTrace.hitCount || 0} 条 · ${s._lastRecallTrace.durationMs || 0}ms · ${new Date(s._lastRecallTrace.ts).toLocaleTimeString('zh-CN')}${s._lastRecallTrace.triggerHit ? ' · <span style="color:var(--ls-warn,#d29922)">⚠️ 触发词命中</span>' : ''}</div><div class="ls-item-text">来源分布: ${Object.entries(s._lastRecallTrace.sources || {}).map(([k, v]) => `${k}×${v}`).join(' · ') || '无'}</div></div></div>` : '<div class="ls-hint">🎯 最近召回监控：生成过一次后显示命中来源分布。</div>'}
                ${s._lastChangeTrace || s._timelineInjectFloor != null || s._diaryInjectFloor != null || s.storage?._lastWrite?.status === 'failed' || s._lastRestore?.failed?.length || s._staleTaskDropped || s._epochDropped || s.mutex?._foreignRelease ? (() => {   /* [v3.145] 栅栏作废/越权释放也强制可见 */ /* [v3.140] 写入失败/恢复失败必须无条件可见（坏了有人知道吗） */  const ct = s._lastChangeTrace || {}; const seg = (o) => o ? `${o.found ?? 0} 找到${o.added != null ? ` / ${o.added} 新增` : ''}` : '—'; return `<div class="ls-group"><div class="ls-group-title">⏳ 变化注入（Horae/HCDiary 诊断）</div><div class="ls-item"><div class="ls-item-meta">楼层 ${ct.floor ?? '—'} · 游标 ${ct.cursor ?? '—'} · 锚点「${ct.anchorDate || '—'}」${ct.ts ? ' · ' + new Date(ct.ts).toLocaleTimeString('zh-CN') : ''}${s._timeWentBack ? ` · <span style="color:var(--ls-warn,#d29922)">⚠️ 时间倒跳 ${s._timeWentBack.from}→${s._timeWentBack.to}(第${s._timeWentBack.floor}楼)</span>` : ''}</div><div class="ls-item-text">时间线 ${seg(ct.timeline)} · 状态 ${seg(ct.status)} · 关系 ${seg(ct.pair)} · 物品 ${seg(ct.items)} · 日记 ${seg(ct.diary)}</div><div class="ls-item-meta">游标持久化: timeline=${s._timelineInjectFloor ?? '未初始化'} diary=${s._diaryInjectFloor ?? '未初始化'} · chat=${s._timelineCursorChatId ?? '—'}${(() => { const c = s.clock || s._clock; const t = c?.timeTagStats; if (!t) return ''; const warn = t.total > 0 && t.calibrated === 0 ? ` · <span style="color:var(--ls-warn,#d29922)">⚠️ 标签从未成功校准，检查正文格式</span>` : ''; return `</div><div class="ls-item-meta">🕐 时间标签协议: 共${t.total}楼 · 成对${t.paired} · 校准${t.calibrated}${t.unparseable ? ` · 无法解析${t.unparseable}` : ''}${warn}`; })()}</div><div class="ls-item-meta">💾 保存地面真源: ${(() => { const g = s._lastSaveGroundTruth; if (!g || !g.ts) return '尚未保存'; return `${new Date(g.ts).toLocaleString('zh-CN')} · 楼层 ${g.floor} · 来源 ${Object.entries(g.sources || {}).map(([k, v]) => `${k}×${v}`).join(' /') || '—'}`; })()}</div>${(() => { const w = s.storage?._lastWrite, r = s._lastRestore; const parts = []; if (w && w.ts) { const bad = w.status !== 'confirmed'; parts.push(`💾 写入 ${w.status}${bad ? ' <span style="color:var(--ls-warn,#d29922)">' + (w.error || '未落地') + '</span>' : ''} · rev ${w.revision} · ${new Date(w.ts).toLocaleTimeString('zh-CN')}`); } if (s._staleTaskDropped) parts.push(`<span style="color:var(--ls-warn,#d29922)">⏸️ 会话租约作废 ${s._staleTaskDropped} 次${s._lastStaleDrop ? `（最近 ${s._lastStaleDrop.task || '提取'}：${s._lastStaleDrop.from} → ${s._lastStaleDrop.to}）` : ''}</span>`); if (s._epochDropped) parts.push(`<span style="color:var(--ls-warn,#d29922)">🚧 状态变更栅栏作废 ${s._epochDropped} 次${s._lastEpochBump ? `（最近 ${s._lastEpochBump.reason} → 栅栏 ${s._lastEpochBump.epoch}）` : ''}</span>`); if (s.mutex?._foreignRelease) parts.push(`<span style="color:var(--ls-warn,#d29922)">🔒 拒绝越权释放锁 ${s.mutex._foreignRelease} 次</span>`); if (r && r.at) { const f = (r.failed || []).length; parts.push(`♻️ 最近恢复(${r.source}${r.loadedProducer ? ' ← v' + r.loadedProducer : ''}) ${new Date(r.at).toLocaleTimeString('zh-CN')} · ${r.count} 字段${f ? ' <span style="color:var(--ls-warn,#d29922)">失败 ' + r.failed.map(x => x.key).join('/') + '</span>' : ''}${r.rolledBack ? ' <span style="color:var(--ls-warn,#d29922)">已自动回滚原状态</span>' : (f ? ' <span style="color:#f85149">未回滚（保留半套，可紧急备份恢复）</span>' : '')}${r.rollbackWarning ? ' <span style="color:#f85149">' + r.rollbackWarning + '</span>' : ''}`); } return parts.length ? '<div class="ls-item-meta">' + parts.join(' · ') + '</div>' : ''; })()}</div></div>`; })() : ''}
                ${(s._recallSourceStats && s._recallSourceStats.total > 0) ? `<div class="ls-group"><div class="ls-group-title">📈 召回源命中率（最近 ${s._recallSourceStats.total} 轮）</div><div class="ls-item">${Object.entries(s._recallSourceStats.bySource || {}).sort((a, b) => b[1].hits - a[1].hits).map(([k, v]) => { const pct = Math.min(100, Math.round((v.hits / Math.max(1, v.rounds)) * 100)); const bar = '█'.repeat(Math.max(1, Math.round(pct / 10))); return `<div class="ls-item-text" style="margin:2px 0"><b>${k}</b> ${bar} ${pct}%（${v.hits} 次/${v.rounds} 轮）</div>`; }).join('')}</div><div class="ls-hint">💡 长期 0% 的召回源可在设置中关闭以省资源；命中率数据 200 轮半衰，反映近期状态。</div></div>` : ''}
                    </div>
                </details>
            `;
            const ov = makeSheet('lonsha-stats-overlay', '📖 记忆总览', body);
            ov.querySelectorAll('.ls-clickable').forEach(card => {
                card.addEventListener('click', () => plugin.showBrowser(card.dataset.view));
            });
        };

        // [v3.14] 从世界书提取角色面板（收编 zhino）: 提取 → 预览勾选 → 确认写入
        plugin.showExtractRoles = async function() {
            const engine = plugin.engine;
            if (!engine) { toast('引擎未初始化'); return; }
            toast('📚 正在读取世界书并提取角色…');
            let roles = [];
            try { roles = await engine.extractRolesFromLore(); } catch (e) { toast('提取失败: ' + e.message); return; }
            if (!roles.length) { toast('⚠️ 未提取到角色（检查是否绑定了世界书/API 是否可用）'); return; }
            const esc = (t) => String(t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            // 标注已存在角色（将只补别名）
            const known = new Set(engine.getKnownCharacters ? engine.getKnownCharacters() : []);
            const rows = roles.map((r, idx) => {
                const isKnown = known.has(r.name) || (engine.graph?.findCharacterByName ? !!engine.graph.findCharacterByName(r.name) : false);
                return `<div class="ls-item" style="display:flex;gap:8px;align-items:flex-start;padding:6px 8px;">
                    <input type="checkbox" class="ls-extract-cb" data-idx="${idx}" checked style="margin-top:3px;flex:0 0 auto;">
                    <div style="flex:1;">
                        <div><b>${esc(r.name)}</b> ${isKnown ? '<span style="color:var(--ls-success,#3fb950);font-size:11px;">（已存在，仅补别名）</span>' : '<span style="color:var(--ls-warn,#d29922);font-size:11px;">（新角色）</span>'}</div>
                        ${r.aliases?.length ? `<div style="color:var(--ls-text-2,#9da7b3);font-size:12px;">别名: ${esc(r.aliases.join('、'))}</div>` : ''}
                    </div>
                </div>`;
            }).join('') || '<div class="ls-hint">无角色可写入</div>';
            const body = `
                <div style="padding:4px 8px;font-size:12px;color:var(--ls-text-2,#9da7b3);">提取到 ${roles.length} 个角色，勾选要写入的条目（已存在角色只会补别名，不会覆盖主名或数据）</div>
                <div style="max-height:40vh;overflow-y:auto;margin:6px 0;">${rows}</div>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button class="ls-btn" id="ls-extract-cancel">取消</button>
                    <button class="ls-btn ls-btn-primary" id="ls-extract-apply">✅ 写入 ${roles.length} 个</button>
                </div>`;
            const overlay = makeSheet('lonsha-extract-overlay', '⬡ 角色谱系提取', body);
            overlay.querySelector('#ls-extract-cancel').addEventListener('click', () => { overlay.remove(); });
            overlay.querySelector('#ls-extract-apply').addEventListener('click', async () => {
                const sel = Array.from(overlay.querySelectorAll('.ls-extract-cb:checked')).map(cb => roles[Number(cb.dataset.idx)]);
                if (!sel.length) { toast('未勾选任何角色'); return; }
                try {
                    const res = engine.applyExtractedRoles(sel);
                    const chatId = engine.getCurrentChatId();
                    if (chatId) await engine.storage.save(chatId, engine.collectExport());
                    toast(`✅ 写入完成: 新增 ${res.added} 个，补别名 ${res.aliasPatched} 个`);
                    overlay.remove();
                } catch (e) { toast('写入失败: ' + e.message); }
            });
        };

        // ========== 记忆内容浏览器（v1.3.1）==========
        plugin.showBrowser = function(viewType) {
            const s = this.engine;
            let title = '', body = '';
            // [v3.273] 交互绑定块要用引擎别名（该块原先错位在 showStatsPanel，eng 与 viewType 双未定义）；搬回本函数后 viewType 在作用域内，eng 在此声明。
            const eng = this.engine;
            const esc = (t) => String(t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            /* [v3.303.0 M-O2] 属性值专用转义 `escAttr`：`esc` 只处理 & < >，把它用在
             *   **属性值**上时，值里一个双引号就能提前闭合属性、余下内容被浏览器当成新标签
             *   （属性吞并）。本函数九个 `data-opid` 里 `items`（物品名）与 `life`（档案 id）
             *   都是用户/LLM 产出的自由文本，故口令按上下文分：文本节点用 `esc`，属性值用 `escAttr`。
             *   修前实测：物品名含双引号 ⇒ `getAttribute("data-opid")` 读回被吞并后的残缺串，
             *   点击后寻址失败；更坏的情形是页面被注入多余标签而**不报错**。 */
            const escAttr = (t) => esc(t).replace(/"/g, '&quot;');
            const fmtTime = (ts) => ts ? new Date(ts).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}) : '';

            if (viewType === 'summaries') {
                title = '📝 摘要列表';
                const list = s.summary.summaries;
                // [v3.74] B2: 手动补摘输入框（柏宝书：任意楼层单独补摘）
                const addForm = `<div style="display:flex;gap:6px;margin:8px 0;">
                    <input id="ls-ms-floor" type="number" placeholder="楼层" min="0" style="width:70px;padding:6px 8px;border:1px solid var(--ls-line-strong,rgba(240,246,252,0.18));border-radius:6px;background:var(--ls-bg-1,#0d1117);color:var(--ls-text,#e6edf3);font-size:13px;" />
                    <input id="ls-ms-text" type="text" placeholder="手动补摘：该楼剧情一句话…" style="flex:1;padding:6px 8px;border:1px solid var(--ls-line-strong,rgba(240,246,252,0.18));border-radius:6px;background:var(--ls-bg-1,#0d1117);color:var(--ls-text,#e6edf3);font-size:13px;" />
                    <button id="ls-ms-add" class="ls-btn" style="padding:6px 14px;">+ 补摘</button>
                    <button id="ls-ms-complete" class="ls-btn" style="padding:6px 14px;background:var(--ls-line-strong,rgba(240,246,252,0.18));" title="扫描缺失楼层并批量 LLM 补齐（每批最多 5 楼）">🔧 批量补齐</button>
                </div>
                <div style="display:flex;gap:6px;margin:0 0 8px 0;">
                    <input id="ls-omit-floor" type="number" placeholder="楼层" min="0" style="width:70px;padding:6px 8px;border:1px solid var(--ls-line-strong,rgba(240,246,252,0.18));border-radius:6px;background:var(--ls-bg-1,#0d1117);color:var(--ls-text,#e6edf3);font-size:13px;" />
                    <button id="ls-omit-mark" class="ls-btn" style="padding:6px 14px;background:var(--ls-bg-3,#21262d);" title="将该楼排除出记忆系统（小剧场/玩梗楼用，可取消）">🎬 标记番外</button>
                    <button id="ls-omit-unmark" class="ls-btn" style="padding:6px 14px;background:var(--ls-bg-3,#21262d);" title="取消番外标记，恢复该楼记忆处理">↩️ 取消番外</button>
                </div><div class="ls-hint" style="font-size:11px;color:var(--ls-text-3,#6e7681);margin:4px 0;">💡 若正文出现 &lt;bbs_start&gt;/&lt;bbs_end&gt; 标签原文，可在酒馆设置 → 正则中添加隐藏规则（Find: /&lt;bbs_(start|end)&gt;[\s\S]*?&lt;\/bbs_(start|end)&gt;/g, Replace: 空白），标签仍会保留在底层数据供记忆系统使用。</div>`;
                body = addForm + (list.length === 0 ? '<div class="ls-hint">暂无摘要。去聊几句，AI 回复后会自动生成。</div>' :
                    list.slice().reverse().map(m => `
                        <div class="ls-item ls-clickable" data-opkind="summary" data-opid="${escAttr(String(m.floor))}">
                            <div class="ls-item-meta">楼层 ${m.floor ?? '?'} · ${fmtTime(m.timestamp)}</div>
                            <div class="ls-item-text">${esc(m.text)}</div>
                        </div>`).join(''));
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
                        <div class="ls-item ls-clickable" data-opkind="pov" data-opid="${escAttr(p.id)}">
                            <div class="ls-item-meta"><b>${esc(p.owner)}</b> · 楼层 ${p.floor ?? '?'} · 触发${p.count || 1}次</div>
                            <div class="ls-item-text">${esc(p.content)}</div>
                        </div>`).join('');
            }
            else if (viewType === 'timeline') {
                title = '📅 剧情时间线';
                const tl = s.timeline?.entries || [];
                body = tl.length === 0 ? '<div class="ls-hint">暂无剧情时间线。剧情中出现明确日期时会自动记录。</div>' :
                    tl.slice().reverse().map(e => `
                        <div class="ls-item ls-clickable" data-opkind="timeline" data-opid="${escAttr(e.id)}">
                            <div class="ls-item-meta"><b>${esc(e.date)}</b> · 楼层 ${e.floor ?? '?'} · ⭐${e.importance || 5}${e.characters?.length ? ' · ' + esc(e.characters.join('、')) : ''}</div>
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
            else if (viewType === 'protagonist') {
                title = '🧍 主角档案 + 生活小档案';
                const p = s.status?.protagonist || {};
                const pFields = ['gender', 'age', 'identity', 'appearance', 'outfit', 'condition'];
                const pLabels = { gender: '性别', age: '年龄', identity: '身份', appearance: '体貌', outfit: '当前着装', condition: '生理/伤病状况' };
                const pRows = pFields.map(k => `<div class="ls-item ls-clickable" data-opkind="protagonist_field" data-opid="${escAttr(k)}"><div class="ls-item-meta">${pLabels[k]}${p.floor ? ` · 第${p.floor}楼更新` : ''}</div><div class="ls-item-text">${esc(p[k]) || '<span class="ls-hint">未登记（点击编辑）</span>'}</div></div>`).join('');
                const lds = s.status?.lifeDetails || [];
                const tierName = { pinned: '📌 置顶常驻', active: '🔹 常规', archive: '📦 沉降' };
                let ldHtml = '';
                for (const tier of ['pinned', 'active', 'archive']) {
                    const group = lds.filter(d => (d.tier || 'active') === tier);
                    if (!group.length) continue;
                    ldHtml += `<div class="ls-group"><div class="ls-group-title">${tierName[tier]} (${group.length})</div>` +
                        group.map(d => `<div class="ls-item ls-clickable" data-opkind="life" data-opid="${escAttr(d.id)}"><div class="ls-item-meta">${d.floor ? `第${d.floor}楼` : '—'}${(d.anchors || []).length ? ' · ' + esc((d.anchors || []).slice(0, 4).join('/')) : ''}${d.until ? ' · 至 ' + esc(d.until) : ''}</div><div class="ls-item-text">${esc(d.text)}</div></div>`).join('') + '</div>';
                }
                body = `<div class="ls-group"><div class="ls-group-title">🧍 主角档案（点击字段可编辑）</div>${pRows}</div>` +
                    `<div class="ls-group"><div class="ls-group-title">🧬 生活小档案 (${lds.length})</div>` +
                    (ldHtml || '<div class="ls-hint">暂无。LLM 提取到主角习惯/偏好后会自动登记。</div>') +
                    '<div class="ls-hint">📌 置顶常驻 · 🔹 常规时效 · 📦 沉降仅命中浮出（点击条目可操作）</div></div>';
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
                    (open.map(x => `<div class="ls-item ls-clickable" data-opkind="suspense" data-opid="${escAttr(x.id)}"><div class="ls-item-meta">${x.kind === 'suspense' ? '谜团' : '约定'} · 第${x.floor ?? '?'}楼${x.createdTime ? ' · ' + esc(x.createdTime) : ''}</div><div class="ls-item-text">${esc(x.content)}</div></div>`).join('') || '<div class="ls-hint">无</div>') +
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
                            <div class="ls-item-text">${esc(nameOf(e.from))} <span style="color:var(--ls-accent,#58a6ff)">—[${esc(e.label || '相关')}]→</span> ${esc(nameOf(e.to))}</div>
                        </div>`).join('');
            }
            else if (viewType === 'vectors') {
                title = '🧲 向量记忆';
                const vecs = s.vector.vectors;
                body = vecs.length === 0 ? '<div class="ls-hint">暂无向量。需要配置 Embedding API。</div>' :
                    vecs.slice().reverse().map(v => `
                        <div class="ls-item ls-clickable" data-opkind="vector" data-opid="${escAttr(v.id)}">
                            <div class="ls-item-meta">楼层 ${v.metadata?.floor ?? '?'} · ${fmtTime(v.timestamp)}</div>
                            <div class="ls-item-text">${esc((v.text || '').substring(0, 150))}</div>
                        </div>`).join('');
            }
            else if (viewType === 'items') {
                title = '🎒 物品台账';
                const items = s.items?.records || [];
                body = items.length === 0 ? '<div class="ls-hint">暂无物品记录。剧情中出现物品获得、转交或丢失时会自动登记。</div>' :
                    items.slice().reverse().map(it => `
                        <div class="ls-item ls-clickable" data-opkind="item" data-opid="${escAttr(it.name)}">
                            <div class="ls-item-meta"><b>${esc(it.name)}</b> · 持有者: ${esc(it.holder || '无主')} · 状态: ${esc(it.state || '完好')}${it.floor !== undefined ? ` · 第${it.floor}楼` : ''}</div>
                            <div class="ls-item-text">${esc(it.desc || '（无描述）')}</div>
                        </div>`).join('');
            }

            else if (viewType === 'oplog') {
                // [v3.55] P16: 事件溯源审计浏览器（消费 v3.54 OpLog）
                title = '🔍 事件审计链（OpLog）';
                const opLog = s.opLog;
                if (!opLog || !opLog.entries?.length) {
                    body = '<div class="ls-hint">暂无事件记录。进行几轮对话后，此处显示所有记忆变更的完整审计链。</div>';
                } else {
                    const st = opLog.stats();
                    // [v3.169] 账本自述面：此表曾只有 13 项，而真实埋点类型有 19 种——
                    //   locked_fact / worldprogress / cse / delta / gc / ledger 六类变更
                    //   在「事件审计链」里显示为英文原始 key。呈现层与账本的**类型集合**
                    //   不同步，等于账本自己没被完整读出来。补齐后由测试锁定集合关系。
                    const typeCn = { summary: '📝摘要', graph: '🕸️图谱', status: '📊状态', item: '🎒物品', suspense: '🧩悬念', diary: '📔日记', pov: '👁认知', timeline: '📅时间线', card: '🃏卡牌', money: '💰钱财', conflict: '⚔️矛盾', pair: '👥群像', rollback: '↩️回滚', locked_fact: '🔒锁定事实', worldprogress: '🌍世界进度', cse: '🧠人物状态', delta: '📒正史增量', gc: '🧹回收账本', ledger: '📚楼层账本' };
                    const head = `<div class="ls-hint">共 ${st.total} 条事件（环形 500）：${Object.entries(st.byType).sort((a,b) => b[1]-a[1]).map(([k,v]) => `${typeCn[k] || k}×${v}`).join(' · ')}</div>`
                        + `<div class="ls-hint" style="${(st.truncated || st.trimFields) ? 'color:var(--ls-warn,#e3b341)' : ''}">📒 账本自述：${esc(opLog.auditSummary?.() || ('窗口 ' + st.total))}${(st.truncated || st.trimFields) ? '　（下方类型统计只覆盖当前窗口；已淘汰事件不计入，且其类型会从统计中整体消失）' : ''}</div>`;
                    // [v3.59] B: 楼层过滤输入框（输入楼层号只显示该楼事件；空=全部）
                    const floorInput = `<div style="margin:6px 0"><input type="number" id="lonsha-oplog-floor-filter" placeholder="按楼层过滤（空=全部）" style="width:100%;background:var(--ls-bg-1,#0d1117);color:var(--ls-text,#e6edf3);border:1px solid var(--ls-line-strong,rgba(240,246,252,0.18));border-radius:6px;padding:6px 10px;font-size:13px;box-sizing:border-box;" /></div>`;
                    const rows = opLog.recent(80).slice().reverse().map(e => `
                        <div class="ls-item">
                            <div class="ls-item-meta">#${e.seq} · ${typeCn[e.type] || e.type} · ${esc(e.op)} · ${e.floor !== null && e.floor !== undefined ? `第${e.floor}楼` : '—'} · ${fmtTime(e.ts)}</div>
                            <div class="ls-item-text">${esc(e.ref)}${e.meta ? ` <span style="color:var(--ls-text-2,#9da7b3)">— ${esc(e.meta)}</span>` : ''}</div>
                        </div>`).join('');
                    body = head + floorInput + `<div id="lonsha-oplog-rows">${rows}</div>`;
                }
            }

            else if (viewType === 'archive') {
                // [v3.261.0 缝合 MyriadKnots] 存档体检（三分判定：活真源 / 可清理候选 / 保留）。
                //   为什么不塞进「最近恢复」：恢复面回答「这次搬了哪些字段」，
                //   体检面回答「这份档里有没有谁都不认的键、有没有读不出的值」——成因与处置都不同。
                //   本页**只点名不执行**：清理已有唯一真源（顶层键集合），在此再删一份就是第二份判据。
                title = '🧾 存档体检（MyriadKnots）';
                const aa = s._lastArchiveAudit;
                if (!aa) {
                    body = '<div class="ls-hint">尚无恢复记录。导入一次存档（或恢复快照）后，此处显示该档的三分判定：活真源 / 可清理候选 / 保留。</div>';
                } else if (aa.verdict !== 'classified') {
                    body = `<div class="ls-hint">本档未产出判定：<b>${esc(aa.verdict)}</b>${aa.why ? ' · ' + esc(aa.why) : ''}</div>`
                        + '<div class="ls-hint" style="color:var(--ls-text-3,#6e7681)">「判不了」不等于「查过没问题」——故不编默认值，如实说判不了。</div>';
                } else {
                    const head = `<div class="ls-hint">判定 <b>${esc(aa.verdict)}</b> · 总 ${aa.total ?? 0} 键 / ${aa.bytes ?? 0} 字节 · 活真源 ${aa.active ?? 0} · 可清理候选 ${aa.cleanup ?? 0} · 保留 ${aa.retained ?? 0}</div>`;
                    const warn = (aa.cleanup || 0) > 0
                        ? `<div class="ls-hint" style="color:var(--ls-warn,#e3b341)">⚠️ 有 ${aa.cleanup} 个键可清理：不在本插件存档顶层键集合内、且值可读。清理不在本页执行，此处只点名。</div>`
                        : '';
                    const ckRow = (aa.cleanupKeys || []).length
                        ? `<div class="ls-item"><div class="ls-item-meta">可清理候选</div><div class="ls-item-text">${(aa.cleanupKeys || []).map(esc).join(' · ')}</div></div>` : '';
                    const rkRow = (aa.retainedKeys || []).length
                        ? `<div class="ls-item"><div class="ls-item-meta">保留（含原因）</div><div class="ls-item-text">${(aa.retainedKeys || []).map(esc).join(' · ')}</div></div>` : '';
                    const cl = s._lastItemOpsClaim;
                    const claim = cl
                        ? `<div class="ls-item"><div class="ls-item-meta">🎒 物品 op 忠实认领证明</div><div class="ls-item-text">候选 ${cl.ops} 条 / 楼层 ${cl.floors} 层 · 可证明 ${cl.proved} · 判不了 ${cl.unproved}${cl.issue ? ' · 根因 ' + esc(cl.issue) : ''}</div><div class="ls-item-meta" style="color:var(--ls-text-3,#6e7681)">只读证明：不删任何 op —— 失效清理的唯一真源是优化 3b 段（fp 不在该楼任何 swipe 取值里）。</div></div>`
                        : '<div class="ls-hint">🎒 物品 op 认领证明：本次导入无 itemOps，或聊天未就绪。</div>';
                    body = head + warn + ckRow + rkRow + claim
                        + (aa.line ? `<div class="ls-hint" style="color:var(--ls-text-3,#6e7681)">${esc(aa.line)}</div>` : '');
                }
            }

            else if (viewType === 'lockedfacts') {
                // [v3.63] 锁定事实管理（dsh lockedFacts）：查看/新增/删除，逐字保护
                title = '🔒 用户锁定剧情事实';
                const list = (s.summary?.getLockedFacts?.() || []);
                const head = `<div class="ls-hint">锁定的剧情事实会<b>逐字</b>进入每轮摘要与注入流，永不因压缩丢失。摘要生成后有校验器防遗漏。适用于：关键约定、物品归属、重要转折、你不想被 AI 忘记的一切。</div>`;
                const addForm = `<div style="display:flex;gap:6px;margin:8px 0;">
                    <input id="ls-lf-input" type="text" placeholder="输入要锁定的剧情事实…" style="flex:1;padding:6px 8px;border:1px solid var(--ls-line-strong,rgba(240,246,252,0.18));border-radius:6px;background:var(--ls-bg-1,#0d1117);color:var(--ls-text,#e6edf3);font-size:13px;" />
                    <button id="ls-lf-add" class="ls-btn" style="padding:6px 14px;">🔒 锁定</button>
                </div>`;
                const items = list.length === 0
                    ? '<div class="ls-hint">暂无锁定事实。在输入框输入事实后点击锁定。</div>'
                    : list.slice().reverse().map(f => `
                        <div class="ls-item" style="display:flex;align-items:flex-start;gap:8px;">
                            <div style="flex:1;">
                                <div class="ls-item-meta">第${f.floor}楼锁定 · ${fmtTime(f.createdAt)}</div>
                                <div class="ls-item-text">${esc(f.text)}</div>
                            </div>
                            <button class="ls-btn ls-lf-del" data-lfid="${escAttr(f.id)}" style="padding:2px 8px;font-size:12px;flex-shrink:0;">✕</button>
                        </div>`).join('');
                body = head + addForm + '<div style="margin-top:8px;">' + items + '</div>';
            }
            else if (viewType === 'deltas') {
                // [v3.68] A: 正史增量视图（established/uncertain 分状态，手动确证）
                title = '📒 正史增量账本';
                const list = s.deltaBook?.deltas || [];
                if (!list.length) {
                    body = '<div class="ls-hint">暂无正史增量。摘要折叠时 LLM 会同步产出增量事实（established=有明确证据，uncertain=存疑待佐证，后续剧情会自动确证）。</div>';
                } else {
                    const stBadge = (st) => st === 'established'
                        ? '<span style="font-size:10px;font-weight:700;color:var(--ls-success,#3fb950);background:var(--ls-success-soft,rgba(63,185,80,0.12));border-radius:4px;padding:1px 6px;">✅已确证</span>'
                        : '<span style="font-size:10px;font-weight:700;color:var(--ls-warn,#d29922);background:var(--ls-warn-soft,rgba(210,153,34,0.12));border-radius:4px;padding:1px 6px;">⏳待定</span>';
                    body = list.slice().reverse().map(d => `
                        <div class="ls-item" style="display:flex;align-items:flex-start;gap:8px;">
                            <div style="flex:1;">
                                <div class="ls-item-meta">${stBadge(d.status)} · 第${d.evidenceFloor}楼 · ${fmtTime(d.timestamp)}</div>
                                <div class="ls-item-text">${esc(d.summary)}</div>
                            </div>
                            ${d.status === 'uncertain' ? `<button class="ls-btn ls-delta-confirm" data-dsum="${escAttr(d.summary)}" style="padding:2px 8px;font-size:12px;flex-shrink:0;">✓</button>` : ''}
                        </div>`).join('');
                }
}
             else if (viewType === 'pulse') {
                 // [v3.96] 叙事心电图视图（原创：张力曲线 + 节奏诊断 + 角色弧光）
                 title = '💓 叙事心电图';
                 const beats = s.pulse?.beats || [];
                 const arcs = s.pulse?.arcs || {};
                 if (!beats.length) {
                     body = '<div class="ls-hint">暂无叙事心电图数据。生成几楼剧情后，此处会画出张力曲线（情感极性×冲突×悬念合成）与角色弧光阶段。纯文本启发式，零额外 API。</div>';
                 } else {
                     const diag = s.pulse.diagnose(6);
                     // 节奏状态横幅
                     const statusMap = {
                         breath: { c: '#d29922', bg: 'rgba(210,153,34,0.12)', t: '持续高压，建议呼吸拍' },
                         surge:  { c: '#58a6ff', bg: 'rgba(56,139,253,0.12)', t: '偏平淡，建议掀波澜' },
                         flow:   { c: '#3fb950', bg: 'rgba(63,185,80,0.12)', t: '节奏平稳' }
                     };
                     const sm = statusMap[diag.status] || statusMap.flow;
                     const banner = `<div class="ls-item" style="border-left:3px solid ${sm.c};background:${sm.bg};">
                         <div class="ls-item-meta" style="color:${sm.c};font-weight:700;">${sm.t} · 近楼均张力 ${Math.round(diag.avgTension*100)}% · 极性 ${diag.avgPolarity>=0?'+':''}${diag.avgPolarity.toFixed(2)}</div>
                         ${diag.advice ? `<div class="ls-item-text">${esc(diag.advice)}</div>` : ''}
                     </div>`;
                     // 张力曲线（最近 40 楼，纯 CSS 竖条；高度=张力，颜色=极性冷暖）
                     const recent = beats.slice(-40);
                     const barColor = b => {
                         if (b.polarity > 0.15) return 'var(--ls-success,#3fb950)';   // 暖
                         if (b.polarity < -0.15) return 'var(--ls-danger,#f85149)';    // 冷
                         return 'var(--ls-info,#58a6ff)';                                 // 中性
                     };
                     const bars = recent.map(b => {
                         const h = Math.max(4, Math.round(b.tension * 60));
                         return `<div title="第${b.floor}楼 · 张力${Math.round(b.tension*100)}% · 极性${b.polarity.toFixed(2)}${b.dominant?(' · '+b.dominant):''}" style="flex:1;min-width:3px;height:${h}px;background:${barColor(b)};border-radius:2px 2px 0 0;opacity:0.85;align-self:flex-end;"></div>`;
                     }).join('');
                     const chart = `<div class="ls-item">
                         <div class="ls-item-meta">张力曲线（近 ${recent.length} 楼 · 绿=情绪上扬 / 红=情绪下沉 / 蓝=中性，高度=张力）</div>
                         <div style="display:flex;align-items:flex-end;gap:2px;height:64px;padding:6px 2px 0;border-bottom:1px solid var(--ls-border,#30363d);">${bars}</div>
                     </div>`;
                     // 角色弧光阶段
                     const arcKeys = Object.keys(arcs).filter(k => arcs[k].polarityTrail?.length >= 3);
                     const phaseBadge = p => {
                         const cmap = { '启程':'#58a6ff', '历练':'#d29922', '低谷':'#f85149', '蜕变':'#bc8cff', '归真':'#3fb950' };
                         const col = cmap[p] || '#8b949e';
                         return `<span style="font-size:11px;font-weight:700;color:${col};background:${col}22;border-radius:4px;padding:1px 7px;">${p}</span>`;
                     };
                     const arcHtml = arcKeys.length ? `<div class="ls-item">
                         <div class="ls-item-meta">角色弧光阶段（情感轨迹拟合）</div>
                         ${arcKeys.slice(0,8).map(k => {
                             const a = arcs[k];
                             const trail = a.polarityTrail.slice(-6).map(x => x.polarity >= 0 ? '↗' : '↘').join('');
                             return `<div class="ls-item-text" style="display:flex;justify-content:space-between;align-items:center;"><span><b>${esc(k)}</b> <span style="color:var(--ls-text-3,#6e7681);font-size:11px;">${trail}</span></span>${phaseBadge(a.phase)}</div>`;
                         }).join('')}
                     </div>` : '';
                     body = banner + chart + arcHtml;
                 }
             }
             else if (viewType === 'conflicts') {
                // [v3.65] C: 未决矛盾视图（severity 严重度分级展示）
                title = '⚔️ 未决矛盾账本';
                const list = s.conflicts?.conflicts || [];
                if (!list.length) {
                    body = '<div class="ls-hint">暂无未决矛盾。LLM 检测到同一事实两个版本对不上时自动登记（矛盾是剧情资产，AI 不会擅自裁决）。</div>';
                } else {
                    const sevBadge = (sev) => {
                        if (sev === 'high') return '<span style="font-size:10px;font-weight:700;color:var(--ls-danger,#f85149);background:var(--ls-danger-soft,rgba(248,81,73,0.14));border-radius:4px;padding:1px 6px;">🔴高</span>';
                        if (sev === 'low') return '<span style="font-size:10px;font-weight:700;color:var(--ls-info,#58a6ff);background:var(--ls-info-soft,rgba(56,139,253,0.12));border-radius:4px;padding:1px 6px;">🔵低</span>';
                        return '<span style="font-size:10px;font-weight:700;color:var(--ls-warn,#d29922);background:var(--ls-warn-soft,rgba(210,153,34,0.12));border-radius:4px;padding:1px 6px;">🟡中</span>';
                    };
                    body = list.slice().reverse().map(c => `
                        <div class="ls-item">
                            <div class="ls-item-meta">${sevBadge(c.severity)} <b>${esc(c.subject)}</b> · 第${c.floor}楼${c.time ? ' · ' + esc(c.time) : ''}</div>
                            <div class="ls-item-text">版本A「${esc(c.versionA)}」 ↔ 版本B「${esc(c.versionB)}」${c.note ? '<br /><span style="color:var(--ls-text-3,#6e7681);">' + esc(c.note) + '</span>' : ''}</div>
                        </div>`).join('');
                }
            }
            else if (viewType === 'injection') {
                // [v3.57] P19: 注入内容预览（AI 实际看到的完整上下文）
                // [v3.215.0] R2-A：本面板**只**为真生成读数作证（`_lastInjection`）。
                //   修前 `_lastInjection` 被 selfCheck 的「召回管线 dry-run（**不注入**，只验证链路通）」
                //   也写过一次 —— 一次诊断会把「最近一次实际注入」覆盖掉，
                //   而本面板文案写的是「即 AI 真实所见」：面板在替一次**没发生过的注入**作证。
                //   现在两条路分开：真生成 → `_lastInjection`；诊断 → `_diagnostics.dryRun`，
                //   下面单独一格展示并明写「不计入实际注入」。
                title = '👁 注入内容预览';
                const inj = s._lastInjection;
                const _dryRun = s._diagnostics?.dryRun;
                if (!inj?.html) {
                    body = '<div class="ls-hint">暂无注入记录。生成一次回复后，此处显示 AI 实际看到的完整记忆注入块（含预算裁剪后的最终形态）。</div>'
                        // [v3.218.0] R2-E：零块分支同样要带结局（零块 + 被中止 vs 零块 + 已完成，处置不同）
                        + (inj ? `<div class="ls-hint" style="color:var(--ls-warn,#d29922);">最近一轮（第 ${inj.round} 轮）真生成，实际注入 0 块：读了召回、但没有任何块送进上下文 —— 这与「还没跑过」是两件事，不要混读。${String(inj.outcome || 'pending') === 'aborted' ? '（该轮已被中止）' : (String(inj.outcome || 'pending') === 'completed' ? '（该轮已完成）' : '')}</div>` : '');
                } else {
                    /* [v3.218.0] R2-E：面板必须说清这一轮的**结局**。
                     *   修前中止与完成同形 —— 用户看到「最近一次实际注入」以为回复在路上，
                     *   其实那一轮已被 Esc 中止（或反之：以为没跑，其实早已出稿）。
                     *   两者处置相反：前者该重发、后者该看回复。 */
                    const _oc = String(inj.outcome || 'pending');
                    const _ocBadge = _oc === 'completed'
                        ? ' <span style="color:var(--ls-success,#3fb950);">✓ 已完成（回复已落层）</span>'
                        : (_oc === 'aborted'
                            ? ' <span style="color:var(--ls-warn,#d29922);">⚠️ 被中止（本轮无回复，可重发）</span>'
                            : ' <span style="color:var(--ls-text-3,#6e7681);">· 结局未定（生成进行中或宿主未发结束事件）</span>');
                    let head = `<div class="ls-hint">最近一次实际注入 · ${new Date(inj.ts).toLocaleTimeString('zh-CN')} · 第 ${inj.round} 轮 · ${inj.html.length} 字符${inj.tokens ? ` · 约 ${inj.tokens} token（CJK 口径估算）` : ''}（已经预算裁剪，即 AI 真实所见）${_ocBadge}</div>`;
                    // [v3.215.0] R2-A 逐块读数：回答「进的是哪几块 / 裁的是哪几块」——
                    //   修前只有聚合数（丢了几块 / 多少字符），回答不了「丢的是哪一块」。
                    if (Array.isArray(inj.blocks) && inj.blocks.length) {
                        const _dropped = inj.blocks.filter(b => !b.kept);
                        head += `<div class="ls-item" style="margin:6px 0"><div class="ls-item-meta">🧩 逐块读数 · 候选 ${inj.total} 块 · 保留 ${inj.kept}${_dropped.length ? ` · <span style="color:var(--ls-warn,#d29922)">裁掉 ${_dropped.length}</span>` : ''}</div>${_dropped.length ? `<div class="ls-item-text" style="font-size:12px">被裁块：${_dropped.slice(0, 6).map(b => esc(b.label) + '（' + b.chars + ' 字符 · ' + b.reason + '）').join(' / ')}${_dropped.length > 6 ? ' …' : ''}</div>` : ''}</div>`;
                    }
                    // [v3.144] CP: 预算实测条（丢弃可见性）——超预算时丢了什么此前完全静默
                    const _bs = s._lastBudgetStats;
                    if (_bs && _bs.ts) {
                        /* [v3.274.0] O4：块级留存数**三态展示**，`keptBlocks` 为 null 时不得参与算术。
                         *   修前这里是「候选总数 − 保留数」自己推一遍：null 被当 0
                         *   ⇒ 面板报「丢弃 N 块」，而事实是「这一轮块级留存不可测」
                         *   （回执缺席 / 内联回落 / 硬截断无 span）。把「测不了」显示成一个具体的
                         *   丢弃块数，正是本仓最忌的假读数——它看起来与「真丢了 N 块」完全同形。
                         *   判据与来源一并显示：读的人当场知道这组数是真读数还是不可测。 */
                        const _keptKnown = Number.isFinite(_bs.keptBlocks);
                        /* 丢弃块数**直接消费回执**（`droppedBlocks`），不再自己拿「候选总数 − 保留数」推导：
                         *   ① 那会把「被切半」也算成「整块被丢」（半段其实进了载荷）；
                         *   ② 同一个事实立第二份实现，本仓点名的头号缺陷形态。
                         *   回执不可测时 `droppedBlocks` 为 null，面板随之转「不可测」文案。 */
                        const _dropN = Number.isFinite(_bs.droppedBlocks) ? _bs.droppedBlocks : null;
                        const _blkPhrase = (_dropN !== null)
                            ? `${_dropN} 块`
                            : `块级留存不可测（${String(_bs.keptFrom || 'unknown')}）`;
                        const _whyLine = (!_keptKnown && _bs.keptWhy)
                            ? `<div class="ls-item-text" style="font-size:12px;color:var(--ls-text-3,#6e7681);">${esc(String(_bs.keptWhy))}</div>` : '';
                        const _partialLine = (Number.isFinite(_bs.partialBlocks) && _bs.partialBlocks > 0)
                            ? `<div class="ls-item-text" style="font-size:12px;color:var(--ls-warn,#d29922);">被切半的块 ${_bs.partialBlocks} 块（硬截断切口落在块内部：半段进了载荷，与「整块被丢」不是一回事）</div>` : '';
                        const _roLine = (Number.isFinite(_bs.residentOverflowOver) && _bs.residentOverflowOver > 0)
                            ? `<div class="ls-item-text" style="font-size:12px;color:var(--ls-warn,#d29922);">常驻溢出 ${_bs.residentOverflowOver} 字符（关键事实保护：常驻块优先于预算上限）</div>` : '';
                        head += `<div class="ls-item" style="margin:6px 0"><div class="ls-item-meta">📊 预算实测 · 上限 ${_bs.requested} 字符 · 裁剪前 ${_bs.beforeChars} → 实际 ${_bs.afterChars}${_bs.droppedChars ? ` · <span style="color:var(--ls-warn,#d29922)">丢弃 ${_bs.droppedChars} 字符 / ${_blkPhrase}</span>` : ''} · 策略 ${_bs.strategy}${_bs.tokenBudget ? ` · token 上限 ${_bs.tokenBudget}` : ''} · 约 ${_bs.tokens} token</div>${_bs.droppedSamples && _bs.droppedSamples.length ? `<div class="ls-item-text" style="font-size:12px">被丢弃示例：${_bs.droppedSamples.map(x => String(x).replace(/[<&]/g, ch => ch === '<' ? '&lt;' : '&amp;')).join(' / ')}</div>` : ''}<div class="ls-item-meta">候选块 ${_bs.totalBlocks} · 保留 ${_keptKnown ? _bs.keptBlocks : '不可测'}${_keptKnown ? '' : '（' + String(_bs.keptFrom || 'unknown') + '）'}${_bs.droppedChars > 0 && _keptKnown ? ' —— 如需更少丢弃可上调注入预算或 memoryTokenBudget' : ''}</div>${_partialLine}${_roLine}${_whyLine}</div>`;
                    }
                    // 分块渲染：按区块标题拆分便于阅读
                    const blocks = inj.html.split('\n').filter(l => l.trim());
                    // [v3.59] D2: diff 高亮——对比上一轮注入，新增行标绿色边框
                    const prevLines = inj.prev ? new Set(inj.prev.split('\n').map(x => x.trim())) : null;
                    let newCount = 0;
                    const bodyHtml = blocks.map(l => {
                        const trimmed = l.trim();
                        const isHeader = /^\[[^\]]+\]/.test(trimmed) || trimmed.includes('〔') || trimmed.includes('NOTE');
                        const text = esc(trimmed);
                        const isNew = prevLines && !prevLines.has(trimmed) && !isHeader;
                        if (isNew) newCount++;
                        const newStyle = isNew ? 'border-left:2px solid var(--ls-success,#3fb950);background:var(--ls-success-soft,rgba(63,185,80,0.12));' : '';
                        return isHeader
                            ? `<div class="ls-item-meta" style="color:var(--ls-success,#3fb950);font-weight:bold;margin-top:6px;">${text}</div>`
                            : `<div class="ls-item-text" style="padding-left:12px;${newStyle}">${text}${isNew ? ' <span style="color:var(--ls-success,#3fb950);font-size:11px;">NEW</span>' : ''}</div>`;
                    }).join('');
                    const diffNote = prevLines ? `<div class="ls-hint" style="color:var(--ls-success,#3fb950);">🆕 本轮新增 ${newCount} 行（绿色标注）</div>` : '';
                    body = head + diffNote + `<div class="ls-item">${bodyHtml}</div>`;
                }
                // [v3.215.0] R2-A：诊断读数**单独一格**，并明写它没有进上下文。
                //   修前它与真注入共用 `_lastInjection`，面板读不出「这是哪一路」；
                //   现在即便 `origin === 'dry-run'` 的读数出现在同一屏，也不会被误读成 AI 真实所见。
                if (_dryRun && (_dryRun.origin === 'dry-run' || _dryRun.id === 'diagnostics')) {
                    const _dryOn = _dryRun.chars > 0;
                    body += `<div class="ls-item" style="margin-top:8px;border-left:2px solid var(--ls-info,#58a6ff);"><div class="ls-item-meta">🧪 诊断 dry-run（不注入，只验证链路通）· ${_dryOn ? `${_dryRun.chars} 字符 / ${_dryRun.bytes} 字节` : '未产出载荷（召回为空或链路未通）'}</div><div class="ls-item-text" style="font-size:12px;color:var(--ls-text-3,#6e7681);">这段内容**没有**进入 AI 上下文，不能当作「AI 真实所见」；它只回答「召回→注入这条链路通不通」。实际注入见上方。</div></div>`;
                }
            }

            else if (viewType === 'prequel') {
                // [v3.87] 前情导入（吸收 MyriadKnots recall-prequel）
                title = '📜 前情导入';
                const pq = s.prequel;
                const cur = pq?.text || '';
                body = `<div class="ls-hint">粘贴过去经历的原文资料（旧存档概要/前作剧情/人设背景等）。每次生成时自动切片并按当前对话相关性选段注入（预算为注入预算的 30%，token 上限 1200）；无命中时兜底注入末尾两段。留空保存即清除。</div>
                    <textarea class="ls-textarea" id="ls-pq-text" style="min-height:200px;" placeholder="在此粘贴前情资料…">${esc(cur)}</textarea>
                    <div class="ls-hint" id="ls-pq-stat">当前 ${cur.length} 字符${pq?.importedAt ? ' · 导入于 ' + new Date(pq.importedAt).toLocaleString('zh-CN') : ''}</div>
                    <button class="ls-btn ls-btn-primary" id="ls-pq-save">💾 保存前情资料</button>`;
            }
            else if (viewType === 'memorycenter') {
                title = '🔍 记忆控制中心';
                /* [v3.310.0 · M-X1] 用户侧记忆控制中心。
                 *   薄接线：**条件与结果全在内核**（memory-center.js）；本块只做两件事 ——
                 *   ① 把内核产出的整页串塞进容器（渲染口径不在面板里重写：重写一次就会出现
                 *      「界面显示的」与「内核真查到的」各说一套，正是验收第四条要防的形态）；
                 *   ② 把 `[data-mc]` / `[data-action]` 的点击转给内核（**动作只声明不执行**：
                 *      处置类动作走 `_memoryCenterHandlers` 映射，缺失即如实报「未接」，不假装成功）。
                 *   四态（有命中 / 确实没有 / 判不了 / 面不可用）由内核判、由 `data-view` 属性自证，
                 *   本块不把任何一态改写成另一态。 */
                const d = (typeof s.memoryCenterDescribe === 'function') ? s.memoryCenterDescribe() : null;
                const bad = !d || d.complete !== true;
                if (bad) {
                    body = '<div class="ls-hint" style="color:var(--ls-warn,#d29922);">⚠️ 记忆控制中心不可用：'
                        + esc(!d ? '模块未加载（memory-center.js）'
                            : (d.reason === 'module-unavailable' ? '模块未加载（memory-center.js）'
                                : ((d.missing && d.missing.length) ? '依赖缺格：' + (d.missing || []).map((m) => m.key).join('、')
                                    : '界面字段与条件登记表不对齐'))) + '</div>';
                } else if (typeof s.memoryCenterView !== 'function' || typeof s.memoryCenterSheet !== 'function') {
                    body = '<div class="ls-hint" style="color:var(--ls-warn,#d29922);">⚠️ 宿主未接控制中心出口（memoryCenterView / memoryCenterSheet）</div>';
                } else {
                    const face = s.memoryCenterView(plugin._memoryCenterState || null, { availableHandlers: Object.keys(plugin._memoryCenterHandlers || {}) });
                    plugin._memoryCenterLastFace = face;
                    body = '<div class="ls-hint">🔍 本面直读原账**全量**（分页由匹配总数驱动 —— 超过 200 条的历史记录仍能翻到）。'
                        + '四态分开：有命中 / 确实没有 / 判不了（区间反转 · 翻过头 · 点了不存在的账）/ 面不可用（内核缺席 · 面板空）。'
                        + '保存的是**条件**，不是第二份证据库。</div>' + s.memoryCenterSheet(face);
                }
            }
            else if (viewType === 'report') {
                // [v3.61] P24: 记忆全景 Markdown 报告导出
                const md = this.engine.exportMemoryReport();
                const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `lonsha-memory-report-${Date.now()}.md`;
                a.click();
                toast('📄 记忆全景报告已导出');
                body = '<div class="ls-hint">✅ 报告已下载。包含：概览/主角档案/生活小档案/羁绊网/卷摘要/史记/群像/悬念/日记/物品/大纲/审计统计全部 12 个板块。</div><pre style="max-height:300px;overflow:auto;font-size:11px;background:var(--ls-bg-1,#0d1117);padding:10px;border-radius:8px;white-space:pre-wrap;">' + esc(md.substring(0, 1500)) + '…</pre>';
            }

            /* [v3.303.0 M-O2] 提示必须与**本面板真有可点条目**一致：本函数有 22 个视图，
             *   而带 `data-opkind`（点下去会走 `_memOps`）的只有 9 类条目。
             *   修前无条件挂这条提示 ⇒ `lockedfacts` / `deltas` / `oplog` 等**一个可点条目都没有**
             *   的视图上也写着「点击条目可操作」，用户按提示点下去毫无反应 ——
             *   这正是本刀要清的形态（把「不可用」说成「可用」，比不提示更坏）。
             *   判据从**已渲染的 HTML 自身**取（`body` 里有没有 `data-opkind=` 标记），
             *   而不是另立一份「哪些视图可点」的名单 —— 名单会与渲染面漂移。 */
            const opHint = /\sdata-opkind=/.test(body || '') ? '<div class="ls-hint" style="color:var(--ls-accent,#58a6ff);margin-bottom:6px;">💡 点击条目可操作（删除 / 提升重要度 / 标记完成）</div>' : '';
            const ov = makeSheet('lonsha-browser-overlay', title, body ? (opHint + body) : '<div class="ls-hint">暂无数据</div>');
            ov.querySelectorAll('[data-opkind]').forEach(it => {
                it.addEventListener('click', () => {
                    plugin._memOps(it.dataset.opkind, it.dataset.opid, () => {
                        ov.remove();
                        plugin.showBrowser(viewType);
                    });
                });
            });

            // [v3.63] lockedfacts 视图的交互绑定
            if (viewType === 'lockedfacts') {
                const addBtn = ov.querySelector('#ls-lf-add');
                const input = ov.querySelector('#ls-lf-input');
                if (addBtn && input) {
                    const doAdd = () => {
                        const text = (input.value || '').trim();
                        if (!text) { toast('请输入事实内容'); return; }
                        const curFloor = (window.SillyTavern?.getContext?.()?.chat?.length || 1) - 1;
                        s.lockFact ? s.lockFact(text) : s.summary.addLockedFact(text, curFloor);
                        toast('🔒 已锁定：' + text.slice(0, 30) + (text.length > 30 ? '…' : ''));
                        plugin.showBrowser('lockedfacts');
                    };
                    addBtn.addEventListener('click', doAdd);
                    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
                }
                ov.querySelectorAll('.ls-lf-del').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const id = btn.dataset.lfid;
                        const fact = (s.summary.getLockedFacts() || []).find(f => f.id === id);
                        if (fact && confirm('解除锁定并从摘要保护中移除？\n\n' + fact.text)) {
                            s.unlockFact ? s.unlockFact(id) : s.summary.removeLockedFact(id);
                            toast('已解除锁定');
                            plugin.showBrowser('lockedfacts');
                        }
                    });
                });
            }

            // [v3.87] prequel 视图的保存绑定
            if (viewType === 'prequel') {
                const saveBtn = ov.querySelector('#ls-pq-save');
                const ta = ov.querySelector('#ls-pq-text');
                if (saveBtn && ta) {
                    saveBtn.addEventListener('click', async () => {
                        const val = (ta.value || '').trim();
                        try {
                            if (!val) {
                                s.prequel?.clearPrequel?.();
                                toast('已清空前情资料');
                            } else {
                                const r = s.prequel.importPrequel(val);
                                if (!r.ok) { toast('内容为空'); return; }
                                toast(r.truncated ? ('✅ 已保存（超长截断至 ' + r.chars + ' 字符）') : ('✅ 已保存 ' + r.chars + ' 字符'));
                            }
                            const chatId = s.getCurrentChatId?.();
                            if (chatId) await s.storage.save(chatId, s.collectExport());
                            plugin.showBrowser('prequel');
                        } catch (e) { toast('保存失败: ' + e.message); }
                    });
                }
            }
            // [v3.74] B3: summaries 视图的手动补摘绑定
            if (viewType === 'summaries') {
                const addBtn = ov.querySelector('#ls-ms-add');
                const floorIn = ov.querySelector('#ls-ms-floor');
                const textIn = ov.querySelector('#ls-ms-text');
                if (addBtn && floorIn && textIn) {
                    const doAdd = () => {
                        const f = Number(floorIn.value);
                        const t = (textIn.value || '').trim();
                        if (!t) { toast('请输入摘要内容'); return; }
                        if (!Number.isFinite(f) || f < 0) { toast('请输入有效楼层号'); return; }
                        if (!s.summary?.addManualSummary) { toast('引擎版本过旧'); return; }
                        const r = s.summary.addManualSummary(f, t);
                        if (r) {
                            toast('✅ 已补录第 ' + f + ' 楼摘要');
                            if (eng?.bm25?.rebuild && s.summary?.getActiveSummaries) {
                                eng.bm25.rebuild(s.summary.getActiveSummaries().map(x => ({id: 'sum_' + x.floor, text: x.text, floor: x.floor, source: 'bm25'})));
                            }
                            plugin.showBrowser('summaries');
                        } else { toast('该楼层已有摘要'); }
                    };
                    addBtn.addEventListener('click', doAdd);
                    textIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
                }
                // [v3.79] A: 一键批量补齐按钮（v3.76 引擎管线首次获得 UI 入口）
                const compBtn = ov.querySelector('#ls-ms-complete');
                if (compBtn) {
                    compBtn.addEventListener('click', async () => {
                        if (!s.summary?.completeMissingFloors) { toast('引擎版本过旧'); return; }
                        let missingN = 0;
                        try { missingN = s.summary.missingFloors((window.SillyTavern?.getContext?.()?.chat?.length || 1) - 1).length; } catch (e) { reportUiError(e, 'nonfatal') }
                        if (!missingN) { toast('✅ 无缺失楼层'); return; }
                        if (!confirm('发现 ' + missingN + ' 个缺失楼层（不含番外/用户楼）。\n将调用 LLM 批量补齐（每批最多 5 楼，本批补完后可再次点击续补）。\n继续？')) return;
                        compBtn.disabled = true; compBtn.textContent = '⏳ 补齐中…';
                        try {
                            const chat = window.SillyTavern?.getContext?.()?.chat || [];
                            const r = await s.summary.completeMissingFloors(s.config.config, s.llm, (f) => String(chat?.[f]?.mes || ''), 5);
                            if (r?.skipped) { toast('⚠️ 上一批仍在进行中'); }
                            else {
                                toast('✅ 已补齐 ' + (r.done || 0) + ' 楼' + (r.missing ? '（还剩 ' + r.missing + ' 楼）' : ''));
                                if (s.bm25?.rebuild && s.summary?.getActiveSummaries) {
                                    s.bm25.rebuild(s.summary.getActiveSummaries().map(x => ({id: "sum_" + x.floor, text: x.text, floor: x.floor, source: "bm25"})));
                                }
                                plugin.showBrowser('summaries');
                            }
                        } catch (e) { toast('❌ 补齐失败：' + (e.message || e)); }
                    });
                }
                // [v3.79] C: 番外楼标记/取消（替代控制台命令，柏宝书 bbs_omit 的 UI 入口）
                const omitIn = ov.querySelector('#ls-omit-floor');
                const omitMark = ov.querySelector('#ls-omit-mark');
                const omitUnmark = ov.querySelector('#ls-omit-unmark');
                if (omitIn && omitMark && omitUnmark) {
                    const setOmit = (mark) => {
                        const f = Number(omitIn.value);
                        if (!Number.isFinite(f) || f < 0) { toast('请输入有效楼层号'); return; }
                        try {
                            const chat = window.SillyTavern?.getContext?.()?.chat || [];
                            const m = chat[f];
                            if (!m) { toast('该楼层不存在'); return; }
                            m.extra = m.extra || {};
                            m.extra.lonsha_omit = mark;
                            toast(mark ? '🎬 第 ' + f + ' 楼已标记为番外（引擎将彻底忽略）' : '↩️ 第 ' + f + ' 楼已取消番外标记');
                            if (mark && s.summary?.removeByFloor) { try { s.summary.removeByFloor(f); } catch (e) { reportUiError(e, 'nonfatal') } }
                        } catch (e) { toast('操作失败：' + (e.message || e)); }
                    };
                    omitMark.addEventListener('click', () => setOmit(true));
                    omitUnmark.addEventListener('click', () => setOmit(false));
                }
            }

            // [v3.68] A: deltas 视图的手动确证绑定
            if (viewType === 'deltas') {
                ov.querySelectorAll('.ls-delta-confirm').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const dsum = btn.dataset.dsum;
                        const n = s.deltaBook?.confirm?.(dsum) || 0;
                        if (n > 0) {
                            toast('✅ 已确证 ' + n + ' 条增量事实');
                            plugin.showBrowser('deltas');
                        } else {
                            toast('未找到匹配的待定项');
                        }
                    });
                });
            }

            // [v3.59] B2: OpLog 楼层过滤交互（输入楼层号实时过滤该楼事件）
            const floorFilter = ov.querySelector('#lonsha-oplog-floor-filter');
            const oplogRows = ov.querySelector('#lonsha-oplog-rows');
            if (floorFilter && oplogRows && viewType === 'oplog' && s.opLog?.entries) {
                const allRows = Array.from(oplogRows.children);
                floorFilter.addEventListener('input', () => {
                    const q = floorFilter.value.trim();
                    if (!q) { allRows.forEach(r => r.style.display = ''); return; }
                    const fl = Number(q);
                    allRows.forEach(r => {
                        // 从条目 meta 行提取楼层（"第N楼"或"—"）
                        const m = r.querySelector('.ls-item-meta')?.textContent || '';
                        const match = /第(\d+)楼/.exec(m);
                        r.style.display = (match && Number(match[1]) === fl) ? '' : 'none';
                    });
                });
            }
            // [v3.310.0 · M-X1] 记忆控制中心的交互绑定
            /*   三条纪律（与内核的分工，不在面板里重写）：
             *   ① **事件 → 内核动作名**，不在这里算条件（条件归一在内核 buildSpec）；
             *   ② 处置类动作（`row.*` / `saved.*` / `query.save`）走 `_memoryCenterHandlers`；
             *      宿主没接的 handler ⇒ 内核已把它降级为 `unavailable`，这里如实提示「未接」，
             *      **不假装成功**（本仓最贵的老账就是把「不可用」说成「可用」）；
             *   ③ 每次交互都重跑一次 dispatch（界面显示的永远是**这一次**的真结果）。 */
            if (viewType === 'memorycenter') {
                /* ★ 空白态**取自内核**（`memoryCenterBlankState()`），不在这里手抄字段表 ——
                 *   手抄一次就是**第二套字段清单**：内核日后加一格条件而面板没跟上，
                 *   界面会静默少一格（本仓治理过多轮的「两份口径」，也是本刀特意单开
                 *   一个宿主出口的理由）。内核不可达时给空壳并把归因留在别处
                 *   （`memoryCenterDescribe()` 报 module-unavailable），
                 *   不在这里编一份「看起来完整」的假状态 —— 那会把不可用伪装成可用。 */
                const mcState = () => {
                    if (plugin._memoryCenterState) return plugin._memoryCenterState;
                    const b = (typeof s.memoryCenterBlankState === 'function') ? s.memoryCenterBlankState() : null;
                    plugin._memoryCenterState = b || {};
                    return plugin._memoryCenterState;
                };
                const rerender = () => { ov.remove(); plugin.showBrowser('memorycenter'); };
                ov.querySelectorAll('[data-mc="f"]').forEach((el) => {
                    const commit = () => {
                        if (typeof s.memoryCenterStep !== 'function') return;
                        const face = s.memoryCenterStep(mcState(), 'filter', { key: el.dataset.k, value: el.value });
                        plugin._memoryCenterState = face.state || plugin._memoryCenterState;
                    };
                    el.addEventListener('change', commit);
                    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commit(); rerender(); } });
                });
                ov.querySelectorAll('[data-mc="apply"]').forEach((b2) => b2.addEventListener('click', () => {
                    ov.querySelectorAll('[data-mc="f"]').forEach((el) => {
                        if (typeof s.memoryCenterStep !== 'function') return;
                        const face = s.memoryCenterStep(mcState(), 'filter', { key: el.dataset.k, value: el.value });
                        plugin._memoryCenterState = face.state || plugin._memoryCenterState;
                    });
                    rerender();
                }));
                ov.querySelectorAll('[data-mc="page"]').forEach((b2) => b2.addEventListener('click', () => {
                    if (typeof s.memoryCenterStep !== 'function') return;
                    const face = s.memoryCenterStep(mcState(), 'page', { page: Number(b2.dataset.page) });
                    plugin._memoryCenterState = face.state || plugin._memoryCenterState;
                    rerender();
                }));
                /* [v3.325.0 · M3-O8] 组织层交互（资料页 / 详情进出 / 选区 / 批量档位）。
                 *   三条纪律与上面同：① 事件 → 内核动作名，不在面板里算；② 状态只从 face.state 回写
                 *   （面板不得自己拼一份）；③ 每次交互都重跑一次 dispatch，界面显示的**永远是这一次**的真结果。
                 *   ★ 「进出详情保留筛选与页码」的保证来自内核 `navigate()`（它只动组织态），
                 *     面板这里**不重建状态**——重建一次就等于把页码与筛选条件丢掉。 */
                const stepOrg = (action, payload) => {
                    if (typeof s.memoryCenterStep !== 'function') return;
                    const face = s.memoryCenterStep(mcState(), action, payload);
                    plugin._memoryCenterState = face.state || plugin._memoryCenterState;
                    rerender();
                };
                ov.querySelectorAll('[data-mc="profile"]').forEach((b2) => b2.addEventListener('click', () => {
                    stepOrg('profile', { to: 'profile', profile: b2.dataset.profile });
                }));
                ov.querySelectorAll('[data-mc="select"]').forEach((cb) => cb.addEventListener('click', (ev) => {
                    /* 阻止标签点击再触发一次 change（否则同一次点击会来回翻转两遍 = 看上去「点不动」）。 */
                    if (ev) ev.stopPropagation();
                    stepOrg('select', { ref: cb.dataset.ref, mode: 'toggle' });
                }));
                ov.querySelectorAll('[data-mc="select-clear"]').forEach((b2) => b2.addEventListener('click', () => {
                    stepOrg('select', { mode: 'clear' });
                }));
                ov.querySelectorAll('[data-mc="batch"]').forEach((b2) => b2.addEventListener('click', () => {
                    stepOrg('batch', { action: b2.dataset.batchAction });
                }));
                ov.querySelectorAll('[data-mc="detail-back"]').forEach((b2) => b2.addEventListener('click', () => {
                    stepOrg('navigate', { to: 'list' });
                }));
                ov.querySelectorAll('[data-action]').forEach((b2) => b2.addEventListener('click', () => {
                    if (b2.disabled || b2.getAttribute('aria-disabled') === 'true') { toast('该动作不可用（宿主未接 handler）'); return; }
                    const id = b2.dataset.action;
                    const ref = b2.dataset.ref || '';
                    const h = (plugin._memoryCenterHandlers || {})[id];
                    if (typeof h !== 'function') { toast('该动作未接：' + id); return; }
                    try {
                        h.call(plugin, { ref: ref, state: mcState(), face: plugin._memoryCenterLastFace });
                    } catch (e) { toast('动作失败：' + (e && e.message ? e.message : e)); }
                }));
            }

            // 浏览器里加一个返回按钮
            const back = document.createElement('div');
            back.className = 'ls-btn';
            // [v3.38] 撤销上次人工操作按钮
            const auditCount = (plugin._auditStack && plugin._auditStack.length) || 0;
            if (auditCount > 0) {
                const undoBtn = document.createElement('div');
                undoBtn.className = 'ls-btn';
                undoBtn.style.background = 'var(--ls-line,rgba(240,246,252,0.10))';
                undoBtn.style.color = 'var(--ls-warn,#d29922)';
                undoBtn.style.marginBottom = '6px';
                undoBtn.textContent = `↺ 撤销上次修改（剩余可撤销: ${auditCount}）`;
                undoBtn.addEventListener('click', async () => {
                    await plugin.undoLastOp();
                    ov.remove();
                    plugin.showBrowser(viewType);
                });
                ov.querySelector('.lonsha-sheet-body').appendChild(undoBtn);
            }
            back.textContent = '← 返回状态总览';
            back.addEventListener('click', () => { ov.remove(); plugin.showStatsPanel(); });
            ov.querySelector('.lonsha-sheet-body').appendChild(back);
        };

        // ========== 设置面板 ==========
        plugin.showSettingsPanel = function() {
            const self = this;
            // [v3.271] 面板 HTML 构造期需要转义器；此前本函数体内未定义 esc，
            //   一进入模板串即抛 ReferenceError: esc is not defined，设置面板整块打不开。
            const esc = (t) => String(t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const c = this.engine.config.config;
            const ck = (key, label, hint) => `
                <label class="ls-row">
                    <div><div>${label}</div>${hint ? `<div class="ls-hint">${hint}</div>` : ''}</div>
                    <input type="checkbox" data-cfg="${key}" ${c[key] ? 'checked' : ''}>
                </label>`;
            const body = `
                <div class="ls-tabs-nav">
                    <button type="button" class="ls-tab-btn active" data-tab="general">◈ 常用</button>
                    <button type="button" class="ls-tab-btn" data-tab="narrative">◷ 故事与人物</button>
                    <button type="button" class="ls-tab-btn" data-tab="retrieval">⬡ 记录与世界</button>
                    <button type="button" class="ls-tab-btn" data-tab="advanced">⚙ 高级</button>
                </div>
                <div class="ls-mode-banner" id="ls-mode-banner">
                    <!-- [v3.422] 缺陷修复：三个模式 pill 此前是纯装饰（无事件、active 硬编码），点击毫无反应。
                         现接入真实配置 extractionProfile（quality/balanced/low-cost 三档抽取节奏，与「联想与世界」页的档位下拉同源），
                         active 态从配置实读；点击立即写回 config + saveConfig + 同步档位下拉，无需点保存。 -->
                    <div class="ls-mode-pill${(c.extractionProfile || 'balanced') === 'balanced' ? ' active' : ''}" data-profile="balanced" role="button" title="均衡档：每 3 楼攒批提取，叙事与记忆成本平衡">◈ 沉浸叙事推荐</div>
                    <div class="ls-mode-pill${(c.extractionProfile || 'balanced') === 'quality' ? ' active' : ''}" data-profile="quality" role="button" title="质量档：每楼都提取，记忆最完整（API 消耗最高）">◷ 深度推演模式</div>
                    <div class="ls-mode-pill${(c.extractionProfile || 'balanced') === 'low-cost' ? ' active' : ''}" data-profile="low-cost" role="button" title="省流档：每 5 楼攒批且只抽核心类型（API 消耗最低）">⬡ 极简轻量模式</div>
                </div>
                <div class="ls-tab-pane active" data-tab-pane="general">
                <div class="ls-group">
                    <!-- [v3.423] API 连接前置：玩家第一件事就是连 API，不再埋在第 3 个 tab 里 -->
                    <div class="ls-group-title">🔗 AI 接口连接</div>
                    <label class="ls-row">
                        <div><div>使用自己的 AI 接口</div><div class="ls-hint">关闭 = 直接用游戏当前对话的接口（推荐，零配置）。开启 = 填下方专用接口。</div></div>
                        <input type="checkbox" data-cfg="apiProviderCustom" ${c.apiProviderCustom ? 'checked' : ''}>
                    </label>
                    <div style="padding: 4px 8px;">
                        <input type="text" class="ls-input" placeholder="API 地址（如 https://api.xxx.com/v1）" value="${c.apiUrl || ''}" data-cfg-text="apiUrl" autocomplete="off">
                        <input type="password" class="ls-input" placeholder="API Key" value="${c.apiKey || ''}" data-cfg-text="apiKey" autocomplete="off">
                        <div style="display:flex;gap:6px;">
                            <select class="ls-input" id="ls-model-select" data-cfg-text="apiModel" style="flex:1;display:none;"><option value="${c.apiModel || ''}">${c.apiModel || '点击右侧抓取模型'}</option></select>
                            <input type="text" class="ls-input" id="ls-model-input" placeholder="模型名（或点右侧抓取列表）" value="${c.apiModel || ''}" style="flex:1;display:block;" autocomplete="off">
                            <button class="ls-btn" id="ls-fetch-models" style="width:auto;padding:0 14px;margin:5px 0;white-space:nowrap;">🔄</button>
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
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">[CORE] 记忆开关</div>
                    ${ck('preferModuleFiles', 'extra_js 自装载', '模块按清单顺序自动加载，保障所有记忆机制生效')}
                    ${ck('enabled', '启用插件', '总开关，关闭后不提取也不注入')}
                    ${ck('extractionEnabled', '自动提取', '每条 AI 回复后自动用 LLM 提取记忆')}
                    ${ck('vectorEnabled', '向量检索', '需要 Embedding API，关闭则只用关键词+图谱')}
                    ${ck('graphDiffusionEnabled', 'PageRank 图扩散', '从已知角色出发扩散召回关联记忆')}
                    ${ck('autoSave', '自动保存', '每次提取后自动写入对话存档')}
                    ${ck('debugMode', '调试模式', 'console 显示召回分数与提取详情')}
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">[RECALL] 回忆多少</div>
                    <div class="ls-slider-label"><span>注入记忆条数 (Top-K)</span><span class="ls-slider-val" id="ls-v-topk">${c.vectorTopK ?? 5}</span></div>
                    <input type="range" class="ls-slider" min="1" max="20" step="1" value="${c.vectorTopK ?? 5}" data-cfg-num="vectorTopK">
                    <div class="ls-slider-label"><span>向量权重 α（0=纯图谱，1=纯向量）</span><span class="ls-slider-val" id="ls-v-alpha">${c.hybridAlpha ?? 0.7}</span></div>
                    <input type="range" class="ls-slider" min="0" max="1" step="0.1" value="${c.hybridAlpha ?? 0.7}" data-cfg-num="hybridAlpha">
                    ${ck('hybridMergeWeighted', 'α 加权融合（v3.156）', '打开后上面的 α 滑块才真正生效（α=1 偏向量 / α=0 偏图谱）；关闭=RRF 融合，α 仅记录不参与排序。默认关。')}
                    <div class="ls-slider-label"><span>摘要最大长度</span><span class="ls-slider-val" id="ls-v-sumlen">${c.maxSummaryLength ?? 200}</span></div>
                    <input type="range" class="ls-slider" min="50" max="500" step="50" value="${c.maxSummaryLength ?? 200}" data-cfg-num="maxSummaryLength">
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">[STABILITY] 用量与保护</div>
                    ${ck('extractionLockEnabled', '提取互斥锁', '并发保护：快速连续对话时防止记忆写入冲突')}
                    ${ck('holidayAware', '节日感知', '剧情日期临近节日时召回相关记忆（圣诞/情人节/七夕等）')}
                    <div class="ls-slider-label"><span>注入预算（字符）</span><span class="ls-slider-val" id="ls-v-budget">${c.injectionBudget || 3000}</span></div>
                    <input type="range" class="ls-slider" min="1000" max="6000" step="200" value="${c.injectionBudget || 3000}" data-cfg-num="injectionBudget">
                    <div class="ls-hint" style="padding:0 8px;">注入简报超预算时自动裁剪，保护上下文窗口。</div>
                </div>
                </div>
                <div class="ls-tab-pane" data-tab-pane="narrative">
                <div class="ls-group">
                     <div class="ls-group-title">[CHARACTER] 人物状态记录</div>
                     ${ck('characterStateEnabled', '角色状态追踪', '提取时记录好感/疲劳/心情等数值变化，注入时展示当前状态')}
                     ${ck('cseEnabled', 'CSE 人物状态引擎', '分层建模人物心理：核心人设/逐渐适应/当下情绪 + toward 对象绑定 + 私密/幕后可见性 + 证据链置信度（待证项注入时标注，防推测当事实）')}
                     ${ck('narrativePulseEnabled', '叙事心电图', '情感极性曲线 + 张力节奏 + 角色弧光阶段 + 自反性节奏建议（连续高压提醒放缓呼吸拍，连续平淡提醒掀起波澜），纯文本启发式零额外 API')}
                     ${ck('todoTrackingEnabled', '待办追踪', '提取角色待办事项，剧情时间过期自动清理')}
                     ${ck('floorLedgerEnabled', '楼层账本', '删楼/重生成时自动回滚该楼层产生的记忆')}
                    <div class="ls-slider-label"><span>楼层账本保留上限</span><span class="ls-slider-val" id="ls-v-flret">${c.floorLedgerRetention || 400}</span></div>
                    <input type="range" class="ls-slider" min="50" max="2000" step="50" value="${c.floorLedgerRetention || 400}" data-cfg-num="floorLedgerRetention" oninput="document.getElementById('ls-v-flret').textContent=this.value">
                    <div class="ls-hint" style="padding:0 8px;">原硬编码 400 且超限静默删除最旧楼层——被删楼层的回滚能力就此静默失效（该楼产生的图谱/POV/时间线条目再也无法按楼撤销）。超限淘汰现在记入 op-log 与诊断面板「已淘汰」计数，长线连载可上调。</div>
                    ${ck('floorLedgerEvictionDebug', '楼层账本淘汰调试日志', '开启后楼层账本淘汰、以及「回滚请求命中已淘汰楼层」时在控制台 warn（默认关）')}
                     <div class="ls-hint" style="padding:0 8px;">状态变化由 LLM 每轮提取（delta 增减或绝对值），字段用简短中文（好感/疲劳/心情/健康/信任/金钱等）。CSE 引擎另记 cse_states（layer/toward/visibility）。</div>
                 </div>
                <div class="ls-tab-pane" data-tab-pane="advanced">
                <div class="ls-group">
                    <div class="ls-group-title">[CHRONO] 故事整理</div>
                    ${ck('summaryFoldEnabled', '摘要自动折叠', '活跃摘要超阈值时合并成卷摘要，防长线膨胀')}
                    <div class="ls-slider-label"><span>卷摘要保留上限</span><span class="ls-slider-val" id="ls-v-volret">${c.volumeRetention || 40}</span></div>
                    <input type="range" class="ls-slider" min="4" max="200" step="2" value="${c.volumeRetention || 40}" data-cfg-num="volumeRetention" oninput="document.getElementById('ls-v-volret').textContent=this.value">
                    <div class="ls-hint" style="padding:0 8px;">超上限时不再静默丢卷，而是把被淘汰卷折叠的源摘要解折叠回活跃池（叙事可重新参与召回），并记入 op-log。</div>
                    <div class="ls-slider-label"><span>史记保留上限</span><span class="ls-slider-val" id="ls-v-hisret">${c.historicalRetention || 24}</span></div>
                    <input type="range" class="ls-slider" min="2" max="100" step="1" value="${c.historicalRetention || 24}" data-cfg-num="historicalRetention" oninput="document.getElementById('ls-v-hisret').textContent=this.value">
                    <div class="ls-hint" style="padding:0 8px;">最高层纪史上限；淘汰同样显式记日志，不再静默 shift。</div>
                    ${ck('bm25Enabled', 'BM25 关键词检索', '词频×逆文档频率稀疏检索，比纯包含匹配更准')}
                    ${ck('sessionLeaseGuardEnabled', '会话租约校验', '异步提取/补提取/STM 巩固跨 await 后若已切换聊天，旧任务结果作废，防跨聊天记忆污染')}
                    ${ck('atomicRestoreEnabled', '恢复原子提交', '导入/嵌入恢复部分失败时自动回滚到恢复前状态，不留半套记忆（快照仅对用户发起的恢复抓取）')}
                    ${ck('swipeFingerprintGuard', 'swipe 指纹校验', '召回缓存命中前验证末楼消息指纹：翻变体自动失效重算，翻回旧变体则到变体级复用')}
                    ${ck('volumeIntegrityGuard', '卷摘要 intact 判定', '折叠区下楼层被 swipe/编辑后卷摘要嵌失效叙事——召回前对账源楼层指纹，失效整卷降级并展开源摘要回活跃池')}
                    ${ck('aliasQueryExpansion', '别名查询扩展', '查询命中角色别名/昵称时自动附加主名词条参与 BM25 检索：喊昵称也能召回主名记忆')}
                    ${ck('termLexiconEnabled', '术语词典', '聊天内非角色实体术语（物品/地名/招式/组织等）沉淀成词典；查询命中术语时自动附加规范名参与检索')}
                    ${ck('bm25LexiconNormalizeEnabled', 'BM25 词典归一', '文档端把术语别名统一为规范名、查询端附加规范名+释义短语，两侧同词典对齐')}
                    ${ck('statusAwareQuotaEnabled', '感知检索配额', '剧情状态调制检索条数：高压期(surge)多喂记忆、余波期降噪、未决矛盾/开放悬念密集期加量（默认关）')}
                    ${ck('swipeAwareRecallEnabled', 'swipe 重绘感知', '当前回复处于重绘(swipe)态时上调召回配额，给模型更宽候选（需先开启感知检索配额总开关，默认关）')}
                    ${ck('ledgerAwareQuotaEnabled', '物品台账感知臂', '近 6 楼内物品台账发生变动时上调召回配额（感知物品变动自动调节召回，默认关）')}
                    <div class="ls-slider-label"><span>词典条目上限</span><span class="ls-slider-val" id="ls-v-lexmax">${c.termLexiconMax ?? 40}</span></div>
                    <input type="range" class="ls-slider" min="10" max="120" step="10" value="${c.termLexiconMax ?? 40}" data-cfg-num="termLexiconMax">
                    ${ck('prequelEnabled', '前情资料注入', '用户导入的前情原文按相关性选段注入（预算 30%）')}
                    ${ck('bridgeEnabled', '公开快照桥', '在 window.lonsha_memory_bridge_v1 暴露只读状态快照（主角/NPC账本/大纲/世界推进），供外部脚本读取')}
                    <div class="ls-slider-label"><span>折叠阈值（条）</span><span class="ls-slider-val" id="ls-v-fold">${c.summaryFoldThreshold || 30}</span></div>
                    <input type="range" class="ls-slider" min="15" max="80" step="5" value="${c.summaryFoldThreshold || 30}" data-cfg-num="summaryFoldThreshold">
                    <div class="ls-hint" style="padding:0 8px;">摘要超过阈值后，最早的一批会用 LLM 合并成"卷摘要"（早前剧情概括），旧的单条摘要不再参与召回。</div>
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">[BOUNDARY] 时间线</div>
                    ${ck('povIsolation', 'POV 私密记忆隔离', '角色私密心事与暗线单独隔离，只展示当前在场角色知晓的事实')}
                    ${ck('plotTimeline', '剧情时间线', '按故事时间线整理事件，优先唤醒当前日期临近的经历')}
                    <div class="ls-hint" style="padding:0 8px;">提取时会额外标注每个事件是客观事实(所有人可见)还是某角色的私密认知(POV)。</div>
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">[LEDGER] 物品记录</div>
                    ${ck('reflectionEnabled', '反思节点（需额外模型支持）', '每N楼从近期剧情提炼高层洞察（关系趋势/潜在线索）注入，与日记独立节流')}
                    <div class="ls-slider-label"><span>每N楼反思一次</span><span class="ls-slider-val" id="ls-v-rf">${c.reflectEveryFloors || 10}</span></div>
                    <input type="range" class="ls-slider" min="3" max="30" step="1" value="${c.reflectEveryFloors || 10}" data-cfg-num="reflectEveryFloors">
                    ${ck('itemLedgerEnabled', '物品台账', '提取物品获得/转移/损坏流转，注入"谁持有什么、什么状态"，防物品凭空消失又出现')}
                    ${ck('ledgerWriteValidationEnabled', '台账写入校验', '入账前对 LLM 提取/携带包的物品 op 逐项宽容校验：action 枚举、name/desc/holder/state/location 长度上限、floor 非负整数、holder 占位归「地上/遗落」、carried 与 location 互斥自愈。能修就修、修不了才丢，绝不因一项脏丢整批；关闭则逐位回退旧行为')}
                    ${ck('carryoverContractStrict', '携带契约严格模式', '导入旧格式携带包时校验契约键是否齐全，缺键则打告警并计入「静默降级」总账（不阻断导入）；关闭则不校验。保障旧版本携带包向后兼容')}
                    ${ck('ledgerWriteValidationDebug', '台账校验调试日志', '开启后每次写入校验有违规时在控制台 warn 输出逐项原因（默认关）')}
                    ${ck('moneyLedgerEnabled', '钱财账本', '跟踪角色金额与变动流水，注入防凭空暴富；配合下方单笔幅度上限可 clamp 异常改值')}
                    <div class="ls-slider-label"><span>💰 钱财改值幅度上限（0=关）</span><span class="ls-slider-val" id="ls-v-mmd">${c.maxMoneyDelta || 0}</span></div>
                    <input type="range" class="ls-slider" min="0" max="100000" step="1000" value="${c.maxMoneyDelta || 0}" data-cfg-num="maxMoneyDelta" oninput="document.getElementById('ls-v-mmd').textContent=this.value">
                    <div class="ls-hint" style="padding:0 8px;">覆盖式改值与旧金额差超过该上限时按 旧值±上限 clamp（防数值异常突变）；delta 式增减不受限。</div>
                    <div class="ls-hint" style="padding:0 8px; margin-top:6px;">🎬 番外楼：控制台执行 <code>SillyTavern.getContext().chat[N].extra.lonsha_omit = true</code> 可将该楼排除出记忆系统（小剧场/玩梗楼用）。</div>
                    <div class="ls-hint" style="padding:0 8px; margin-top:6px;">📦 记忆优化：每 ${c.optimizeEveryFloors || 50} 楼自动去重+淘汰最旧（向量上限 ${c.vectorMaxCount || 500} / 摘要上限 ${c.summaryMaxCount || 400}）；🗄️ 每 ${c.snapshotEveryFloors || 50} 楼自动快照（保留最近5份，IndexedDB）。</div>
                    ${ck('maintenancePipelineEnabled', '维护流水线', '把归档休眠→优化去重→节奏分诊编排为一次可诊断流水线：单步失败可重试，长期未维护自动跳回优化补做。默认关（关时走既有逐条维护路径，行为不变）')}
                    <div class="ls-slider-label"><span>维护超期提醒（天）</span><span class="ls-slider-val" id="ls-v-mntd">${c.maintenanceOverdueWarnDays || 45}</span></div>
                    <input type="range" class="ls-slider" min="7" max="120" step="1" value="${c.maintenanceOverdueWarnDays || 45}" data-cfg-num="maintenanceOverdueWarnDays">
                    <div class="ls-hint" style="padding:0 8px;">距上次维护超过该天数 → 流水线跳回优化步骤补做一次（防长篇长时间挂机后记忆长期未整理）。</div>
                    ${ck('pristineFetchEnabled', '绕包装取数', '宿主预设脚本（如 Kemini 伴生面板）会 patch 页面 fetch 并改写内部请求的请求体/响应流，轻则混入外来注入文本、重则工具调用被剥且静默发生。打开后内部取数改走「剥离已知包装 → 专用隐藏同源 iframe 原生 fetch」，拿回未改写的原始响应。默认开：纯传输层防御，不改请求/响应语义，拿不到原生 fetch 时逐字回退全局 fetch')}
                     ${ck('nativeToolExtractEnabled', '原生函数调用协议', '内部模型调用改带 tools 请求，回包里的 tool_calls 被真执行（search_memory 关键词检索 / write_memory 写显式摘要 / vector_search 语义检索）并以 role=tool 回灌，最多 nativeToolMaxRounds 轮后取最终正文。关闭时逐字节走旧文本路径。默认关（实验）')}
                    <div class="ls-slider-label"><span>工具回合上限（1~5）</span><span class="ls-slider-val" id="ls-v-ntmr">${c.nativeToolMaxRounds ?? 3}</span></div>
                    <input type="range" class="ls-slider" min="1" max="5" step="1" value="${c.nativeToolMaxRounds ?? 3}" data-cfg-num="nativeToolMaxRounds" oninput="document.getElementById('ls-v-ntmr').textContent=this.value">
                    <div class="ls-hint" style="padding:0 8px;">模型在一轮内最多连续调用几次工具（检索→精读→作答 三轮够用）。引擎侧另夹一道 Math.min(5, …)，此处填超过 5 也不会被采纳。</div>
                     ${ck('llmEventChainEnabled', 'LLM 调用事件链审计', '为每次模型调用记录事件链并校验迁移不变量（run_started→model_requested→assistant_message/run_failed）。违反只在控制台告警、不中断主链路。默认关')}
                    ${ck('recallArtifactEnabled', '召回产物持久化', '把每轮召回结果存成带「历史指纹」的产物：重开对话可直接复用注入，且上游楼层被编辑/删楼时指纹变化 → 自动拒绝复用陈旧注入。默认关')}
                    ${ck('smartTriggerEnabled', '事件性门控', '先判断本楼有没有事件性（关键词/自定义正则/多轮往返/情绪波动/疑似新实体），达不到阈值就跳过 LLM 提取、降级为本地廉价摘要——省下大量平淡楼的 API 调用，绝不丢楼层。默认关')}
                    ${ck('vectorTailRecoveryEnabled', '掉队候选补召回', '把因「无向量/零向量/维度不符」而永远进不了向量检索的条目，低分补进候选池交由正常评分与预算裁剪决定去留（防「记忆在库里却召不回」）。默认关')}
                    ${ck('coverageLedgerEnabled', '覆盖账本重算', '归档隐藏改为「由当前有效覆盖者推导」：卷摘要/折叠被撤销或删除时，被它覆盖的楼层自动恢复可见，不再留下没人认领的孤儿隐藏楼；用户手动隐藏的楼层绝不接管。默认关')}
                    <div class="ls-slider-label"><span>门控阈值</span><span class="ls-slider-val" id="ls-v-stg">${c.smartTriggerThreshold ?? 2}</span></div>
                    <input type="range" class="ls-slider" min="1" max="10" step="1" value="${c.smartTriggerThreshold ?? 2}" data-cfg-num="smartTriggerThreshold">
                    <div class="ls-hint" style="padding:0 8px;">达到该分才判为值得抽取 LLM；bionic 缺省 2。调低更容易触发（省得少），调高更省（可能漏事件）。</div>
                    <textarea class="ls-textarea" data-cfg-text="smartTriggerPatterns" placeholder="自定义触发规则（每行一条正则，命中即加权 2 分）">${c.smartTriggerPatterns || ''}</textarea>
                    <div class="ls-slider-label" style="margin-top:8px;"><span>抽取节奏档位</span><span class="ls-slider-val">${c.extractionProfile || 'balanced'}</span></div>
                    <select class="ls-input" data-cfg-text="extractionProfile">
                        <option value="quality" ${(c.extractionProfile || 'balanced') === 'quality' ? 'selected' : ''}>quality（每楼都抽，最贵）</option>
                        <option value="balanced" ${(c.extractionProfile || 'balanced') === 'balanced' ? 'selected' : ''}>balanced（每 3 楼攒批一次，默认）</option>
                        <option value="low-cost" ${(c.extractionProfile || 'balanced') === 'low-cost' ? 'selected' : ''}>low-cost（每 5 楼攒批，且只抽核心类型）</option>
                    </select>
                    <div class="ls-hint" style="padding:0 8px;">档位只决定**平淡楼**攒批的周期与条数；身份/承诺/物品/关系/事件这五类结构性信号**任何档位都当场抽**（关键事件不因省调用被推到周期楼外）。诊断面「抽取节奏」一行会如实报即时/攒批/错过的楼。</div>
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">[RESONANCE] 人物心声</div>
                    ${ck('echoEnabled', '回响池', '召回过的记忆停留N轮，防同一记忆"这轮有下轮消失"的闪烁感')}
                    ${ck('livingDiary', '活人感日记（抄hcdiary）', '第一人称心声+没说出口的秘密，替代旧版摘要副本日记')}
                    ${ck('diaryChangeDrivenInjection', '变化日记注入', '只将上次注入游标之后、当前登场角色的新日记加入本轮上下文')}
                    ${ck('timeChangeDrivenInjection', '时间锚点变化注入', '复用现有剧情时间线，只将上次游标之后且与当前剧情时间相关的新事件加入本轮上下文')}
                    <div class="ls-hint" style="padding:0 8px;">时间变化注入同时覆盖时间线、在场角色状态、关系对及物品变化。</div>
                    <div class="ls-slider-label"><span>回响停留轮数</span><span class="ls-slider-val" id="ls-v-echo">${c.echoBaseLife || 2}</span></div>
                    <input type="range" class="ls-slider" min="1" max="5" step="1" value="${c.echoBaseLife || 2}" data-cfg-num="echoBaseLife">
                    <div class="ls-slider-label"><span>每N楼写一次日记</span><span class="ls-slider-val" id="ls-v-df">${c.diaryEveryFloors ?? 3}</span></div>
                    <input type="range" class="ls-slider" min="0" max="10" step="1" value="${c.diaryEveryFloors ?? 3}" data-cfg-num="diaryEveryFloors">
                    <div class="ls-slider-label"><span>时间线变化注入条数</span><span class="ls-slider-val">${c.timeChangeMaxCandidates || 5}</span></div>
                    <input type="range" class="ls-slider" min="1" max="20" step="1" value="${c.timeChangeMaxCandidates || 5}" data-cfg-num="timeChangeMaxCandidates">
                    <div class="ls-hint" style="padding:0 8px;">日记每N楼批量生成一次（<b>0=每楼</b>，v3.156 起真正生效），省API额度；生成失败自动跳过不影响主流程。</div>
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">[WORLD] 地点记录</div>
                    ${ck('sceneEnabled', '场景地图树', '提取登记地点层级（城市›街区›店铺），注入当前场景链；删楼自动回滚')}
                    ${ck('presenceInjection', '不在场角色提示', '已登场但不在场的角色注入"现在在哪"，防 AI 让人凭空出现（v3.91 修复：此前门控键断裂导致该功能从未生效）')}
                    ${ck('queryRewrite', '查询重写（需API）', '生成前用小模型把剧情改写成检索词，多路召回更准；每轮多一次API调用')}
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">[SUSPENSE] 伏笔追踪</div>
                    ${ck('suspenseEnabled', '悬念簿', '约定/伏笔/未解之谜三态追踪（完成/取消/失败），防 AI 把办完的事反复提、把伏笔写丢')}
                    ${ck('relativeTime', '相对时间前缀', '剧情时间线注入时加"3天前·3月12日"式前缀，距离感一目了然；[v2.6] 支持架空日历（霜月3日）与全角分隔符，解析失败自动降级不标')}
                    <div class="ls-slider-label"><span>注入深度（D0/D1/D2）</span><span class="ls-slider-val" id="ls-v-injdepth">${c.injectionDepth || 0}</span></div>
                    <input type="range" class="ls-slider" min="0" max="2" step="1" value="${c.injectionDepth || 0}" data-cfg-num="injectionDepth">
                    <div class="ls-hint" style="padding:0 8px;">D0=紧邻最新输入（默认）；D1/D2=插到更早位置缓解近因偏误（经 setExtensionPrompt depth 参数生效）。</div>
                    <div class="ls-slider-label"><span>悬念追踪上限（条）</span><span class="ls-slider-val" id="ls-v-susmax">${c.suspenseMaxOpen || 20}</span></div>
                    <input type="range" class="ls-slider" min="5" max="40" step="5" value="${c.suspenseMaxOpen || 20}" data-cfg-num="suspenseMaxOpen">
                    <div class="ls-hint" style="padding:0 8px;">超出上限的最旧悬念自动沉降（标记取消），不再注入但保留记录。</div>
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">[DEVICE] 虚拟手机联动</div>
                    ${ck('rubyPhoneBridge', '回填手机记忆', 'LLM 提取结果（摘要/事件/关系）写入 RubyPhone 手机"记忆"App')}
                    ${ck('rubyPhoneRecall', '手机记忆参与召回', 'RubyPhone 记忆库（感官/空间/时间池）作为一路召回源注入简报')}
                    <div class="ls-slider-label"><span>手机记忆召回条数</span><span class="ls-slider-val" id="ls-v-phone">${c.rubyPhoneRecallTopN ?? 3}</span></div>
                    <input type="range" class="ls-slider" min="1" max="8" step="1" value="${c.rubyPhoneRecallTopN ?? 3}" data-cfg-num="rubyPhoneRecallTopN">
                    <div class="ls-hint" style="padding:0 8px;">需要已安装 <b>RubyPhone (ruby-phone)</b> 扩展；未安装时自动跳过，不影响本插件。</div>
                </div>
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">[DOMAIN] 分类记录</div>
                    ${ck('diaryBridgeEnabled', '日记桥', '本轮提取的日记同步写进手机日记；关闭后日记只留在记忆库')}
                    ${ck('clockSyncEnabled', '剧情时钟权威同步', '正文时间锚点回填手机时钟；关闭后手机时钟不被剧情时间改写')}
                    ${ck('pairMemoryEnabled', '配对记忆', '从 relationships 提取双人关系记忆；关闭后只保留单角色记忆')}
                    ${ck('conflictBookEnabled', '冲突簿', '从 conflicts 提取并维护人物矛盾关系；关闭后不建冲突条目')}
                    ${ck('cardCollectionEnabled', '事件收藏册', '从 events 提取剧情事件卡片；关闭后不收集事件卡')}
                    ${ck('ethicsConflictEnabled', '伦理冲突检测', 'family × intimate 关系冲突标记；关闭后不做该类校验')}
                    ${ck('adaptiveBudget', '注入预算自适应', '楼层少时自动扩容注入预算、楼层多时收紧（0.6x~1.8x）；关闭则恒用基准预算')}
                    <div class="ls-slider-label"><span>自适应衰减参考楼层</span><span class="ls-slider-val" id="ls-v-adaptdecay">${c.adaptiveBudgetDecayFloors ?? 80}</span></div>
                    <input type="range" class="ls-slider" min="10" max="400" step="10" value="${c.adaptiveBudgetDecayFloors ?? 80}" data-cfg-num="adaptiveBudgetDecayFloors">
                    <div class="ls-slider-label"><span>睡眠归档周期（每 N 次提取）</span><span class="ls-slider-val" id="ls-v-sleepn">${c.sleepEveryN ?? 10}</span></div>
                    <input type="range" class="ls-slider" min="1" max="100" step="1" value="${c.sleepEveryN ?? 10}" data-cfg-num="sleepEveryN">
                    <div class="ls-slider-label"><span>定期快照间隔（楼）</span><span class="ls-slider-val" id="ls-v-snapevery">${c.snapshotEveryFloors ?? 50}</span></div>
                    <input type="range" class="ls-slider" min="10" max="500" step="10" value="${c.snapshotEveryFloors ?? 50}" data-cfg-num="snapshotEveryFloors">
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">[INFERENCE] 推理与多路策略</div>
                    <div class="ls-row">
                        <div><div>预算裁剪策略</div><div class="ls-hint">balanced=常驻全保留+触发截断到剩余预算；relevance=触发只保留 RRF 前 60%；recency=触发只保留时间/状态类分区</div></div>
                        <select class="ls-input" data-cfg-text="budgetStrategy">
                            <option value="balanced" ${c.budgetStrategy === 'balanced' ? 'selected' : ''}>balanced（均衡）</option>
                            <option value="relevance" ${c.budgetStrategy === 'relevance' ? 'selected' : ''}>relevance（按相关度）</option>
                            <option value="recency" ${c.budgetStrategy === 'recency' ? 'selected' : ''}>recency（按新近）</option>
                        </select>
                    </div>
                    ${ck('memoryTreeEnabled', '记忆树路由召回', '按角色沿图谱生成树状路径做召回；默认关，观察期功能')}
                    ${ck('aiRecallOpsDebug', 'AI 主动操作调试日志', '把 AI 用标签写记忆的每一条操作打进 console（排障用）')}
                    <div class="ls-slider-label"><span>PageRank 扩散阻尼</span><span class="ls-slider-val" id="ls-v-pagerank">${c.pageRankDamping ?? 0.85}</span></div>
                    <input type="range" class="ls-slider" min="0.1" max="0.95" step="0.05" value="${c.pageRankDamping ?? 0.85}" data-cfg-num="pageRankDamping">
                    <div class="ls-slider-label"><span>DPP 多样性 λ（0=最相关，1=最多样）</span><span class="ls-slider-val" id="ls-v-dpp">${c.dppLambda ?? 0.5}</span></div>
                    <input type="range" class="ls-slider" min="0" max="1" step="0.05" value="${c.dppLambda ?? 0.5}" data-cfg-num="dppLambda">
                    <div class="ls-slider-label"><span>金字塔层级名（逗号分隔，至少 3 层，tier0 起）</span></div>
                    <textarea class="ls-textarea" id="ls-pyramid-tiers" style="min-height:64px;">${esc((Array.isArray(c.pyramidTiers) ? c.pyramidTiers : ['日记', '周记', '史记', '书', '传奇']).join('，'))}</textarea>
                    <div class="ls-slider-label"><span>角色名提取提示词</span></div>
                    <textarea class="ls-textarea" id="ls-roles-prompt" style="min-height:120px;">${esc(c.extractRolesPrompt || '')}</textarea>
                    <div class="ls-slider-label"><span>触发词按需注入（留空=关闭该功能）</span></div>
                    <textarea class="ls-textarea" data-cfg-text="onDemandTriggerPhrase" placeholder="例：请生成锚点日记">${esc(c.onDemandTriggerPhrase || '')}</textarea>
                    <div class="ls-slider-label"><span>副API通道（JSON，按任务配独立端点）</span></div>
                    <textarea class="ls-textarea" id="ls-secondary-apis" style="min-height:150px;" placeholder='{"summarize":{"endpoint":"https://...","apiKey":"sk-...","model":"gpt-4o-mini"},"rerank":{...}}'>${esc(JSON.stringify(c.secondaryApis || {}, null, 2))}</textarea>
                    <div class="ls-hint">可选任务键：extract / summarize / embed / select / rerank / rewrite / state。未配的任务回落主通道；JSON 解析失败时保留原值并提示。</div>
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">[TOPOLOGY] 因果追踪</div>
                    ${ck('hippoDiffusionEnabled', 'HippoRAG 联合引燃', '从 BM25 / 道具中提取高频匹配实体，与角色联合作为图扩散种子，实现概念引燃因果拓扑')}
                    ${ck('temporalGraphEnabled', '时态知识图谱（Temporal Graph）', '记录关系的有效区间 [validFrom, validTo]，旧关系演进时自动标记历史，支持往事羁绊追溯')}
                    ${ck('entropyReflectionEnabled', '自适应叙事熵反思', '根据事件重要度与剧情惊奇度动态蓄力，冲顶时提前触发反思提炼，告别机械固定轮数')}
                    ${ck('timeTagAnchorEnabled', '正文时间标签物理锚点', '识别回复正文中的 <time>/<date> 标签作为绝对剧情时间，零API同步且自动剥离隐藏')}
                    ${ck('cacheFriendlyInjection', 'Prompt Cache 友好型分流', '顶槽锁定绝对稳定的史记前缀，动态周记下沉，使 Claude/DeepSeek/Kimi 持续命中 Prefix Caching')}
                </div>

                <div class="ls-group">
                    <div class="ls-group-title">[WORLDLINE] 世界线记忆（多世界线题材）</div>
                    ${ck('worldlineMemoryEnabled', '分层记忆与跨层污染闸', '适用于任何一种「同一角色不止一段人生」的机制：梦境层级、时间循环轮次、平行宇宙、存档读档、位面、世界线……插件不认识任何具体世界观，只认两件抽象事实：① 层标记（当前在哪一层，名字由你的卡自己定）② 切换楼层（第几楼切过去的）。两者合起来叫「纪元」。开启后每条记忆按归属判：同纪元可当事实；异纪元默认挡下（谁都不例外，主角也不给特权）；连楼层都没有的判不了、绝不冒充本纪元。另有一道「未来纪元」闸：起线楼层比你晚的记忆，对任何角色都不可见（防剧透）。默认关。')}
                    <div class="ls-slider-label"><span>当前层标记（名字由你的卡定，如 现实 / 梦一 / 第二轮 / 平行A）</span></div>
                    <input type="text" class="ls-input" placeholder="留空 = 未设定，条目一律判不了" value="${c.worldlineId || ''}" data-cfg-text="worldlineId" autocomplete="off">
                    <div class="ls-slider-label"><span>当前纪元从哪一楼起（消息索引；留空 = 不猜）</span></div>
                    <input type="text" class="ls-input" placeholder="如 45 = 第 45 楼切到本层" value="${c.worldlineStartFloor ?? ''}" data-cfg-text="worldlineStartFloor" autocomplete="off">
                    <div class="ls-slider-label"><span>切换登记表（每行 楼层:层标记；只有楼层没有层标记的记忆靠它反推纪元）</span></div>
                    <textarea class="ls-textarea" data-cfg-text="worldlineJumps" style="min-height:72px;" placeholder="例：1:现实&#10;20:梦境一层&#10;45:现实&#10;70:梦境二层">${esc(c.worldlineJumps || '')}</textarea>
                    <div class="ls-slider-label"><span>层标记别名表（每行 原写法=归一键；同一层有多种写法时才需要）</span></div>
                    <textarea class="ls-textarea" data-cfg-text="worldlineLayerAlias" style="min-height:56px;" placeholder="例：的梦=梦境一层">${esc(c.worldlineLayerAlias || '')}</textarea>
                    <div class="ls-row">
                        <div><div>跨层保留者特权</div><div class="ls-hint">默认 none：<b>谁都不许串</b>，名单内的人（含主角）也看不到别的纪元的记忆 —— 那本身就是串。allow=名单内可见异纪元（题材需要「保留记忆」时才开）。写错任何值都折回 none。</div></div>
                        <select class="ls-input" data-cfg-text="worldlineReaderPolicy">
                            <option value="none" ${c.worldlineReaderPolicy !== 'allow' ? 'selected' : ''}>none（谁都不许串，推荐）</option>
                            <option value="allow" ${c.worldlineReaderPolicy === 'allow' ? 'selected' : ''}>allow（名单内可见）</option>
                        </select>
                    </div>
                    <div class="ls-slider-label"><span>层编号（可选读数，如 1.130205 / 0.571024；不参与判定除非配了下面的分段）</span></div>
                    <input type="text" class="ls-input" placeholder="留空 = 1.048596 默认" value="${c.worldlineDivergence ?? 1.048596}" data-cfg-num="worldlineDivergence" autocomplete="off">
                    <div class="ls-slider-label"><span>层编号分段（每行 域名&lt;上界；<b>留空 = 没有分段</b>，数字完全不参与判定）</span></div>
                    <textarea class="ls-textarea" data-cfg-text="worldlineBands" style="min-height:56px;" placeholder="留空即可。确有编号体系才填，例：低位&lt;1.0&#10;高位&lt;2.0">${esc(c.worldlineBands || '')}</textarea>
                    <div class="ls-row">
                        <div><div>邻近世界线记忆怎么处置</div><div class="ls-hint">邻近 = 同一吸引域且变动率够近。hold=只作预感（默认，不得当事实）；allow=可以当事实用；block=一律不进。</div></div>
                        <select class="ls-input" data-cfg-text="worldlineAdjacentPolicy">
                            <option value="hold" ${c.worldlineAdjacentPolicy === 'hold' ? 'selected' : ''}>hold（只作预感）</option>
                            <option value="allow" ${c.worldlineAdjacentPolicy === 'allow' ? 'selected' : ''}>allow（可当事实）</option>
                            <option value="block" ${c.worldlineAdjacentPolicy === 'block' ? 'selected' : ''}>block（不进）</option>
                        </select>
                    </div>
                    <div class="ls-slider-label"><span>跨层保留者名单（逗号分隔；须把上面策略改成 allow 才生效）</span></div>
                    <textarea class="ls-textarea" data-cfg-text="worldlineReaders" style="min-height:56px;" placeholder="例：主角名，配角名">${esc(c.worldlineReaders || '')}</textarea>
                    <div class="ls-slider-label"><span>收束事件登记（每行一条：事件键=all 或 事件键=域A,域B）</span></div>
                    <textarea class="ls-textarea" data-cfg-text="worldlineConvergences" style="min-height:72px;" placeholder="例：某人之死=all&#10;某事件=高位">${esc(c.worldlineConvergences || '')}</textarea>
                    <div class="ls-hint" style="padding:0 8px;">⭐ 未登记 ≠ 不会发生：没登记的事件一律报「判不了」，不会被静默当成「不收束」。只登记了键不给域的行，等于「登记过但本域不收束」。</div>
                </div>
                <div class="ls-tab-pane" data-tab-pane="retrieval">
                <div class="ls-group">
                    <div class="ls-group-title">[RERANK] 回忆排序优化（可选）</div>
                    ${ck('rerankEnabled', 'LLM 精排召回结果', '粗召回后用小模型重排候选。更准但每轮多一次API调用；失败自动降级')}
                    <input type="text" class="ls-input" placeholder="精排API地址（留空=用提取API）" value="${c.rerankApiUrl || ''}" data-cfg-text="rerankApiUrl" autocomplete="off">
                    <input type="password" class="ls-input" placeholder="精排Key（留空=用提取Key）" value="${c.rerankApiKey || ''}" data-cfg-text="rerankApiKey" autocomplete="off">
                    <input type="text" class="ls-input" placeholder="精排模型（建议快而便宜的小模型）" value="${c.rerankModel || ''}" data-cfg-text="rerankModel" autocomplete="off">
<div class="ls-slider-label"><span>精排候选数</span><span class="ls-slider-val" id="ls-v-rerank">${c.rerankCandidates || 12}</span></div>
                     <input type="range" class="ls-slider" min="6" max="24" step="2" value="${c.rerankCandidates || 12}" data-cfg-num="rerankCandidates">
                 </div>
                 <div class="ls-group">
                     <div class="ls-group-title">[INTELLIGENCE] 记忆巩固</div>
                     ${ck('aiSelectEnabled', '前置 AI 精选召回', '粗召回候选→前置 AI JSON 精选「本轮真正相关」再注入。减少无关注入、省 token 提精度；失败自动降级本地评分 topN')}
                     <div class="ls-slider-label"><span>精选候选上限</span><span class="ls-slider-val" id="ls-v-aiselcand">${c.aiSelectMaxCandidates || 20}</span></div>
                     <input type="range" class="ls-slider" min="8" max="40" step="4" value="${c.aiSelectMaxCandidates || 20}" data-cfg-num="aiSelectMaxCandidates">
                     <div class="ls-slider-label"><span>AI 精选条数</span><span class="ls-slider-val" id="ls-v-aiselsel">${c.aiSelectMaxSelect || 6}</span></div>
                     <input type="range" class="ls-slider" min="2" max="12" step="1" value="${c.aiSelectMaxSelect || 6}" data-cfg-num="aiSelectMaxSelect">
                     ${ck('stmLtmEnabled', 'STM/LTM 分层巩固', '短期记忆逐条积累→达阈值巩固→溢出滚入长期摘要。游标断点续跑，新消息从上次进度继续，崩溃可恢复')}
                     <div class="ls-slider-label"><span>巩固触发阈值</span><span class="ls-slider-val" id="ls-v-stmth">${c.stmLtmThreshold || 5}</span></div>
                     <input type="range" class="ls-slider" min="3" max="10" step="1" value="${c.stmLtmThreshold || 5}" data-cfg-num="stmLtmThreshold">
                     <!-- [v3.421.0] 批末主动销项的保底留存：巩固完的 stm 条目该在批末销掉，但销到 0 行等于把可变区清空、下批又从零积。这一格就是「销后至少留几条」。 -->
                     <div class="ls-slider-label"><span>销项保底留存</span><span class="ls-slider-val" id="ls-v-stmkeep">${c.stmLtmCloseMinKeep || 3}</span></div>
                     <input type="range" class="ls-slider" min="1" max="10" step="1" value="${c.stmLtmCloseMinKeep || 3}" data-cfg-num="stmLtmCloseMinKeep">
                     ${ck('unifiedRecallEnabled', '统一召回管线', '图谱记忆节点候选化成统一 keys 结构，与世界书条目走同一套评分召回；event/quest/character/location 类型保底入选')}
                     <div class="ls-hint">副API通道（secondaryApis）：可在配置 JSON 中按任务（extract/summarize/select/rerank/rewrite/state）配独立端点，给小任务配便宜模型。STM 巩固摘要已接入 summarize 通道。</div>
                 </div>
                <div class="ls-group">
                    <div class="ls-group-title">[PROMPT] 提取规则模板（高级）</div>
                    <textarea class="ls-textarea" id="ls-prompt">${c.extractionPrompt}</textarea>
                    <div class="ls-hint">{{CONTENT}} 会替换为消息内容。改坏了解析会失败，届时可点下方恢复默认。</div>
                    <button class="ls-btn" id="ls-prompt-reset">↩ 恢复默认提示词</button>
                </div>
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">[DATA] 备份与迁移</div>
                    <button class="ls-btn" id="ls-export">📤 导出档案 (JSON)</button>
                    <button class="ls-btn" id="ls-import">📥 导入档案</button>
                    <button class="ls-btn" id="ls-embedded-restore" ${c._embeddedVaultReady ? '' : 'style="display:none;"'}>♻ 恢复嵌入存档（跨设备迁移）</button>
                    <button class="ls-btn ls-btn-danger" id="ls-clear">🗑 清空当前对话记忆</button>
                    <div class="ls-hint" style="padding:0 8px;">🚚 携带背包：打包当前记忆 → 新对话里点"导入携带包"，无缝连载。</div>
                    <button class="ls-btn" id="ls-carry-pack">🚚 打包当前记忆（跨会话携带）</button>
                    <button class="ls-btn" id="ls-carry-apply">📥 导入携带包（新故事开局）</button>
                </div>
                <div class="ls-group">
                    <details id="ls-advanced" style="padding:0 8px;">
                        <summary style="cursor:pointer;color:var(--ls-accent,#58a6ff);font-size:12px;font-weight:600;letter-spacing:1.2px;padding:6px 0;">🧪 高级调参（展开调整召回预算/向量/摘要上限等内部参数）</summary>
                        <div class="ls-hint" style="padding:6px 0 2px;">⚠️ 这些参数影响资源消耗与召回精度。默认值经过长期验证，非必要不调；改出问题直接点「恢复默认」。</div>
                        <div class="ls-slider-label"><span>注入 token 预算</span><span class="ls-slider-val" id="ls-v-mtb">${c.memoryTokenBudget ?? 2700}</span></div>
                        <input type="range" class="ls-slider" min="200" max="6000" step="100" value="${c.memoryTokenBudget ?? 2700}" data-cfg-num="memoryTokenBudget">
                        <div class="ls-slider-label"><span>最近正文 token 预留</span><span class="ls-slider-val" id="ls-v-krtr">${c.keepRecentTokenReserve ?? 0}</span></div>
                        <input type="range" class="ls-slider" min="0" max="1000" step="50" value="${c.keepRecentTokenReserve ?? 0}" data-cfg-num="keepRecentTokenReserve">
                        <div class="ls-slider-label"><span>向量条数上限</span><span class="ls-slider-val" id="ls-v-vmc">${c.vectorMaxCount ?? 500}</span></div>
                        <input type="range" class="ls-slider" min="50" max="2000" step="50" value="${c.vectorMaxCount ?? 500}" data-cfg-num="vectorMaxCount">
                        <div class="ls-slider-label"><span>摘要条数上限</span><span class="ls-slider-val" id="ls-v-smc">${c.summaryMaxCount ?? 400}</span></div>
                        <input type="range" class="ls-slider" min="50" max="1500" step="50" value="${c.summaryMaxCount ?? 400}" data-cfg-num="summaryMaxCount">
                        <div class="ls-slider-label"><span>BM25 topK</span><span class="ls-slider-val" id="ls-v-bk">${c.bm25TopK ?? 5}</span></div>
                        <input type="range" class="ls-slider" min="1" max="20" step="1" value="${c.bm25TopK ?? 5}" data-cfg-num="bm25TopK">
                        <div class="ls-slider-label"><span>向量分块阈值（字符）</span><span class="ls-slider-val" id="ls-v-vct">${c.vectorChunkThreshold ?? 1200}</span></div>
                        <input type="range" class="ls-slider" min="400" max="4000" step="100" value="${c.vectorChunkThreshold ?? 1200}" data-cfg-num="vectorChunkThreshold">
                        <div class="ls-slider-label"><span>向量分块大小</span><span class="ls-slider-val" id="ls-v-vcs">${c.vectorChunkSize ?? 800}</span></div>
                        <input type="range" class="ls-slider" min="200" max="2000" step="100" value="${c.vectorChunkSize ?? 800}" data-cfg-num="vectorChunkSize">
                        <div class="ls-slider-label"><span>向量分块重叠</span><span class="ls-slider-val" id="ls-v-vco">${c.vectorChunkOverlap ?? 10}</span></div>
                        <input type="range" class="ls-slider" min="0" max="200" step="10" value="${c.vectorChunkOverlap ?? 10}" data-cfg-num="vectorChunkOverlap">
                        <div class="ls-slider-label"><span>历史折叠阈值（楼）</span><span class="ls-slider-val" id="ls-v-hft">${c.historicalFoldThreshold ?? 12}</span></div>
                        <input type="range" class="ls-slider" min="4" max="60" step="2" value="${c.historicalFoldThreshold ?? 12}" data-cfg-num="historicalFoldThreshold">
                        <div class="ls-slider-label"><span>优化周期（楼）</span><span class="ls-slider-val" id="ls-v-oef">${c.optimizeEveryFloors ?? 50}</span></div>
                        <input type="range" class="ls-slider" min="10" max="200" step="10" value="${c.optimizeEveryFloors ?? 50}" data-cfg-num="optimizeEveryFloors">
                        <div class="ls-slider-label"><span>惊奇度累积阈值</span><span class="ls-slider-val" id="ls-v-et">${c.entropyThreshold ?? 15}</span></div>
                        <input type="range" class="ls-slider" min="3" max="60" step="1" value="${c.entropyThreshold ?? 15}" data-cfg-num="entropyThreshold">
                        <div class="ls-slider-label"><span>回响池上限（0=关闭）</span><span class="ls-slider-val" id="ls-v-emc">${c.echoMaxCount ?? 10}</span></div>
                        <input type="range" class="ls-slider" min="0" max="40" step="1" value="${c.echoMaxCount ?? 10}" data-cfg-num="echoMaxCount">
                        <div class="ls-slider-label"><span>在场候选上限</span><span class="ls-slider-val" id="ls-v-pmc">${c.presenceMaxCandidates ?? 8}</span></div>
                        <input type="range" class="ls-slider" min="2" max="20" step="1" value="${c.presenceMaxCandidates ?? 8}" data-cfg-num="presenceMaxCandidates">
                        <div class="ls-slider-label"><span>补召回条数上限</span><span class="ls-slider-val" id="ls-v-vtrl">${c.vectorTailRecoveryLimit ?? 8}</span></div>
                        <input type="range" class="ls-slider" min="0" max="40" step="1" value="${c.vectorTailRecoveryLimit ?? 8}" data-cfg-num="vectorTailRecoveryLimit">
                        <div class="ls-slider-label"><span>时间线窗口（天）</span><span class="ls-slider-val" id="ls-v-twd">${c.timelineWindowDays ?? 3}</span></div>
                        <input type="range" class="ls-slider" min="1" max="30" step="1" value="${c.timelineWindowDays ?? 3}" data-cfg-num="timelineWindowDays">
                        <div class="ls-slider-label"><span>每楼 AI 操作上限</span><span class="ls-slider-val" id="ls-v-aom">${c.aiRecallOpsMaxPerFloor ?? 12}</span></div>
                        <input type="range" class="ls-slider" min="0" max="40" step="1" value="${c.aiRecallOpsMaxPerFloor ?? 12}" data-cfg-num="aiRecallOpsMaxPerFloor">
                        <div class="ls-slider-label"><span>锁定事实字符上限</span><span class="ls-slider-val" id="ls-v-lfmc">${c.lockedFactMaxChars ?? 4000}</span></div>
                        <input type="range" class="ls-slider" min="500" max="20000" step="500" value="${c.lockedFactMaxChars ?? 4000}" data-cfg-num="lockedFactMaxChars">
                        <div class="ls-slider-label"><span>大纲计划冷却（楼）</span><span class="ls-slider-val" id="ls-v-opcf">${c.outlinePlanCooldownFloors ?? 10}</span></div>
                        <input type="range" class="ls-slider" min="2" max="60" step="1" value="${c.outlinePlanCooldownFloors ?? 10}" data-cfg-num="outlinePlanCooldownFloors">
                        <div class="ls-slider-label"><span>角色提取上限</span><span class="ls-slider-val" id="ls-v-erl">${c.extractRolesLimit ?? 50}</span></div>
                        <input type="range" class="ls-slider" min="5" max="200" step="5" value="${c.extractRolesLimit ?? 50}" data-cfg-num="extractRolesLimit">
                        <div class="ls-slider-label"><span>待办过期（分钟）</span><span class="ls-slider-val" id="ls-v-tem">${c.todoExpiryMinutes ?? 60}</span></div>
                        <input type="range" class="ls-slider" min="5" max="720" step="5" value="${c.todoExpiryMinutes ?? 60}" data-cfg-num="todoExpiryMinutes">
                        <div class="ls-slider-label"><span>世界推进间隔（楼）</span><span class="ls-slider-val" id="ls-v-wpef">${c.worldProgressEveryFloors ?? 2}</span></div>
                        <input type="range" class="ls-slider" min="1" max="20" step="1" value="${c.worldProgressEveryFloors ?? 2}" data-cfg-num="worldProgressEveryFloors">
                        <div class="ls-slider-label"><span>世界推进候选上限</span><span class="ls-slider-val" id="ls-v-wpmc">${c.worldProgressMaxCandidates ?? 2}</span></div>
                        <input type="range" class="ls-slider" min="1" max="10" step="1" value="${c.worldProgressMaxCandidates ?? 2}" data-cfg-num="worldProgressMaxCandidates">
                        <div class="ls-slider-label"><span>POV 每轮上限</span><span class="ls-slider-val" id="ls-v-pmpt">${c.povMaxPerTurn ?? 3}</span></div>
                        <input type="range" class="ls-slider" min="1" max="10" step="1" value="${c.povMaxPerTurn ?? 3}" data-cfg-num="povMaxPerTurn">
                        <div class="ls-slider-label"><span>摘要折叠批量</span><span class="ls-slider-val" id="ls-v-sfb">${c.summaryFoldBatchSize ?? 20}</span></div>
                        <input type="range" class="ls-slider" min="5" max="100" step="5" value="${c.summaryFoldBatchSize ?? 20}" data-cfg-num="summaryFoldBatchSize">
                        <div class="ls-slider-label"><span>取代理由扫描池</span><span class="ls-slider-val" id="ls-v-ssp">${c.supersedeScanPool ?? 30}</span></div>
                        <input type="range" class="ls-slider" min="5" max="100" step="5" value="${c.supersedeScanPool ?? 30}" data-cfg-num="supersedeScanPool">
                        <div class="ls-slider-label"><span>归档保留最近楼</span><span class="ls-slider-val" id="ls-v-apr">${c.archivePreserveRecent ?? 6}</span></div>
                        <input type="range" class="ls-slider" min="0" max="30" step="1" value="${c.archivePreserveRecent ?? 6}" data-cfg-num="archivePreserveRecent">
                    </details>
                </div>
                <div class="ls-group">
                    <div class="ls-group-title">[ADVANCED] 高级调整</div>
                    ${ck('protagonistTracking', '主角档案追踪', 'baibai 主角客观档案与生活习惯癖好追踪')}
                    ${ck('dualTimeAnchorEnabled', '正文时间锚点', 'baibai 正文起止时间锚点（故事内时间推演）')}
                    ${ck('charMemEnabled', '角色记忆银行', '两层记忆（短期/长期）按角色隔离')}
                    ${ck('neuralChainEnabled', '神经链召回', '链1+链2 关联链式召回')}
                    ${ck('npcTierInjection', 'NPC 分档注入', '按重要度分档注入 NPC 信息')}
                    ${ck('npcTiesInjection', 'NPC 关系注入', '注入 NPC 间关系网络')}
                    ${ck('recallCacheEnabled', '召回缓存', '同查询短期复用召回结果（省 API）')}
                    ${ck('heatOnRecallEnabled', '召回加热', '被召回的记忆提升活跃度（防冷启动丢失）')}
                    ${ck('recallAuditEnabled', '召回命中自检', '每轮召回后记录 查询/命中分布/空结果 到环形账本，诊断面板「召回效果自检」可见——召回是唯一无自检防线的核心机制（v3.150）')}
                     ${ck('recallProvenanceFilter', '分支感知召回过滤', '摘要来源楼被翻页(source_changed)后不再注入——防旧分支叙事与当前分支一起进模型。只剔这一态：判不了、缺源（删楼与前移不可区分）、正文改写的都放行（v3.183）')}
                     ${ck('sleepAwakenEnabled', '睡眠语义唤醒', '低保留价值被归档(archivedForSleep)的摘要，在相似情景再次出现时回程——此前归档是单向门：注释承诺「需要时可唤醒」而全仓归零点为 0。与「实体名唤醒」分工：那条按名字逐字命中，本条按语义相似。默认开（v3.234.0）')}
            ck('rollbackPreviewEnabled', '回滚预览（破坏前先算）', '删除楼层前先算出「会撤掉多少条 / 其后多少面随之重定位」，只读不落地；预告与实撤不符时在诊断面板留痕（默认开）。'),
            ck('snapshotPrecheckEnabled', '快照恢复前预检', '从快照恢复前先做一次只读预检：快照无可恢复内容时直接拦住、不落盘，避免把「恢复了个空」写进存档（默认开）。'),
                     <div class="ls-slider-label"><span>条目关联停用词</span></div>
                     <textarea class="ls-textarea" data-cfg-text="crosslinkStopwords" placeholder="逗号分隔，如：主角,系统,旁白">${c.crosslinkStopwords || ''}</textarea>
                     <div class="ls-hint" style="padding:0 8px;">条目关联（Aho-Corasick）扫正文找共享关键词时忽略这些通用词——否则「主角」「系统」这类词会把所有条目串成一团（v3.183）。</div>
                     ${ck('crosslinkRecallBoost', '条目关联·召回提权', '按当前查询扫关联词表，命中的摘要键在召回融合里加一个固定小分（只提名次，不换条目、不写图、不删边）。默认关：关闭时不扫词表、零开销、零行为变化（v3.185）')}
                     ${ck('emotionOppositeRecall', '情绪反向召回', '负面的当下把「相对的那一面」也带进上下文：难过时想起温柔相待、恐惧时想起安然相伴、绝境里想起承诺。命中项在召回融合里加固定小分（只提名次，不换条目、不写图、不删边）。默认关：关闭时不扫词表、零开销、零行为变化（v3.186）')}
                     ${ck('graphRollupEnabled', '图谱语义汇总', '长线对话下把「同类型、未被认领」的散节点每 N 个压成一层父节点（+ semantic_contains 边），父节点不删除任何子节点；同时把此前零调用点的图压缩（vacuum）接进周期维护（v3.184）')}
                     <div class="ls-slider-label"><span>汇总每层节点数</span><span class="ls-slider-val" id="ls-v-grmc">${c.graphRollupMinChildren ?? 4}</span></div>
                     <input type="range" class="ls-slider" min="2" max="12" step="1" value="${c.graphRollupMinChildren ?? 4}" data-cfg-num="graphRollupMinChildren">
                     <div class="ls-hint" style="padding:0 8px;">每几个散节点压成一层（默认 4）。调小压得更狠、层更多；调大则只压大簇。</div>
                     ${ck('relationDisclosureEnabled', '关系披露条件', '关系边可带「何时才给模型看」的触发条件（提取时按当前剧情形如「告白|结婚」）。未触发的关系本轮不进注入，但仍留在图与召回池里，情境对了下轮照常出现。没写条件的关系一律照常注入（v3.184）')}
                    ${ck('fuzzyPatchEnabled', '提示词宽容填充', '模板占位符（如 {{KNOWN_CHARS}}）被编辑成全角括号/多空格形态后仍能被认出并填上；未命中时退回精确匹配，填完仍残留的占位符进自检告警。无占位符残留时逐字节等同旧行为（v3.184）')}
                    ${ck('floorRecallLedgerEnabled', '楼层召回账本', '把「哪楼剧情被哪轮召回」回记进楼层账本 + 向量命中续热度，让楼层账本从记写入扩展到记召回（v3.150）')}
                    ${ck('recallTierEnabled', '分层召回', '按记忆层分级召回')}
                    ${ck('synopsisFastPath', '摘要快速通道', '短消息跳过完整 LLM 摘要')}
                    ${ck('aiRecallOps', 'AI 召回操作', '允许 AI 在回复中发起召回操作指令')}
                    ${ck('pyramidAutoExtend', '金字塔自动扩展', '活跃度溢出时自动加层')}
                    ${ck('supersedeEnabled', '记忆取代', '新事实与旧事实矛盾时登记取代关系')}
                    ${ck('lockedFactsEnabled', '锁定事实', '用户锁定的剧情事实逐字保留')}
                    ${ck('outlineDirectorEnabled', '大纲导演', '解析 AI 回复中的大纲标签')}
                    ${ck('outlineAutoPlan', '大纲自动规划', '无大纲时自动生成剧情规划')}
                    ${ck('trailMonitor', '召回轨迹监控', '记录最近一次召回来源供状态面板展示')}
                    ${ck('autoArchiveCovered', '归档隐藏旧楼层', '被卷摘要覆盖的旧楼层自动隐藏（v3.25，默认关）')}
                    ${ck('worldProgressEnabled', '世界推进', '世界状态随剧情推进（默认关，需观察效果后开）')}
                    ${ck('vectorChunkEnabled', '长文本分块向量化', '超阈值字符的长文本切块后再向量化（默认关，短文本不受影响）')}
                </div>
                </div>
                <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--ls-line,rgba(240,246,252,0.10));display:flex;flex-direction:column;gap:6px;">
                    <button class="ls-btn ls-btn-primary" id="ls-save" style="margin:0;">◈ 保存配置</button>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
                        <button class="ls-btn" id="ls-snap-restore" style="padding:9px 4px;font-size:12px;margin:0;">◷ 快照还原</button>
                        <button class="ls-btn" id="ls-backfill" style="padding:9px 4px;font-size:12px;margin:0;">⊕ 补提取缺失</button>
                        <button class="ls-btn" id="ls-extract-roles" style="padding:9px 4px;font-size:12px;margin:0;">⬡ 提取角色</button>
                    </div>
                </div>
            `;

            const overlay = makeSheet('lonsha-settings-overlay', '⚙ 设置', body);
            overlay.querySelectorAll('.ls-tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const tab = btn.dataset.tab;
                    overlay.querySelectorAll('.ls-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
                    overlay.querySelectorAll('.ls-tab-pane').forEach(p => p.classList.toggle('active', p.dataset.tabPane === tab));
                });
            });
            // [v3.422] 缺陷修复：模式 pill 接线。此前三个 .ls-mode-pill 是纯装饰 div（全文件零监听、active 硬编码），
            //   点击毫无反应。现映射到真实配置 extractionProfile（quality/balanced/low-cost）：
            //   点击 → 立即写 config + saveConfig 落盘 + 同步「联想与世界」页的档位下拉与 active 高亮，无需再点保存。
            const VALID_PROFILES = ['balanced', 'quality', 'low-cost'];
            overlay.querySelectorAll('.ls-mode-pill').forEach(pill => {
                pill.addEventListener('click', () => {
                    const profile = pill.dataset.profile;
                    if (!VALID_PROFILES.includes(profile)) return;
                    this.engine.config.config.extractionProfile = profile;
                    this.engine.config.saveConfig();
                    overlay.querySelectorAll('.ls-mode-pill').forEach(p => p.classList.toggle('active', p === pill));
                    const profSel = overlay.querySelector('select[data-cfg-text="extractionProfile"]');
                    if (profSel) {
                        profSel.value = profile;
                        // 档位读数 = 档位下拉紧邻的前一个 .ls-slider-label 里的 .ls-slider-val
                        //   （不能全局 querySelector('.ls-slider-val')，那会抓到 vectorTopK 等首个滑杆的读数）
                        const labelDiv = profSel.previousElementSibling;
                        const profLabel = labelDiv ? labelDiv.querySelector('.ls-slider-val') : null;
                        if (profLabel) profLabel.textContent = profile;
                    }
                    toast('✅ 已切换到「' + pill.textContent.trim() + '」（抽取档位 ' + profile + '，已保存）');
                });
            });
            // [v3.4] DB 修复：原绑定写在本行之前（overlay 声明前使用 → TDZ ReferenceError，设置面板打开即崩）
            overlay.querySelector('#ls-snap-restore').addEventListener('click', () => { plugin.showSnapshotRestore(); });
            // [v3.5] 补提取缺失楼层
            overlay.querySelector('#ls-extract-roles').addEventListener('click', async () => { plugin.showExtractRoles(); });
            overlay.querySelector('#ls-backfill').addEventListener('click', async () => {
                const engine = plugin.engine;
                const missing = engine.scanMissingFloors();
                if (!missing.length) { toast('✅ 没有缺失楼层，记忆全覆盖'); return; }
                const preview = missing.slice(0, 10).join(', ') + (missing.length > 10 ? ` … 共 ${missing.length} 楼` : '');
                if (!confirm(`发现 ${missing.length} 个楼层无记忆（AI 楼）。补提取将调用 API 逐楼提取，是否继续？\n\n楼层: ${preview}`)) return;
                toast(`🔧 补提取中…（${Math.min(missing.length, 30)} 楼，需一些时间）`);
                const done = await engine.backfillFloors(missing, (idx, d) => {
                    if ((d.ok + d.fail) % 5 === 0) toast(`🔧 补提取进度: ${d.ok + d.fail}/${Math.min(missing.length, 30)}`);
                });
                toast(`✅ 补提取完成: ${done.ok} 成功 / ${done.fail} 失败 / ${done.skipped} 跳过`);
            });

            // 滑块实时显示（[v3.113] 改为通用就近查找：滑条的显示标签必然在其上方紧邻的 .ls-slider-val 中，
            //                       不再维护硬编码 id 映射表——新增滑条自动联动）
            overlay.querySelectorAll('input[type=range]').forEach(r => {
                r.addEventListener('input', () => {
                    let el = null;
                    let n = r;
                    // 向上查找最近的 .ls-slider-val（最多回溯 6 层）
                    for (let i = 0; i < 6 && n && n.previousElementSibling !== null; i++) {
                        n = n.previousElementSibling;
                        el = n.querySelector && n.querySelector('.ls-slider-val');
                        if (el) break;
                        if (n.classList && n.classList.contains('ls-slider-val')) { el = n; break; }
                    }
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
                // [v3.77] B: 携带预览（确认后落盘下载）
                try {
                    const c = pack.counts || {};
                    const prevMsg = '🚚 携带包预览\n\n摘要 ' + (c.summaries ?? pack.summaries?.length ?? 0) + ' 条\n悬念 ' + (c.suspense ?? pack.suspense?.length ?? 0) + ' 条\n图谱节点 ' + (c.graphNodes ?? 0) + '\n日记 ' + (c.diaries ?? 0) + '\n向量 ' + (c.vectors ?? 0) + '\n\n确认打包？（打包后新对话点「导入携带包」无缝续写）';
                    if (!confirm(prevMsg)) { toast('已取消打包'); return; }
                } catch (e) { reportUiError(e, 'nonfatal') }
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
                try { pack = JSON.parse(localStorage.getItem('lonsha_carryover_pack') || 'null'); } catch (e) { reportUiError(e, 'nonfatal') }
                const apply = async (p) => {
                    if (this.engine.applyCarryover(p)) {
                        const chatId = this.engine.getCurrentChatId();
                        // [v3.11] 存盘统一走 collectExport（原 '2.7.0' 块缺 reflection/scene/echo/itemOps）
                        if (chatId) await this.engine.storage.save(chatId, this.engine.collectExport());
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
            // [v3.138] CP-L2: 嵌入存档恢复闭环——v3.23 起只写 _embeddedVaultReady 标志、toast 指路“设置→导入恢复”，
            // 但按钮从未存在，跨设备迁移恢复路径断裂。按钮由 checkEmbeddedMigration 按检测结果显示。
            overlay.querySelector('#ls-embedded-restore').addEventListener('click', async () => {
                try {
                    const eng = self.engine;
                    const _sk = eng.storage.STORAGE_KEY;   // [v3.140] 真键（engine 实例上无此属性 → 旧实现读到 undefined 键）
                    const _ext = window.SillyTavern?.getContext?.()?.chatMetadata?.extensions;
                    const emb = _ext?.[_sk]?.embeddedVault || _ext?.undefined?.embeddedVault;
                    if (!emb || typeof emb !== 'object') { toast('未发现嵌入存档'); return; }
                    // [v3.142] CP 两阶段：先只读预检（零副作用），确认有可恢复内容且结构代际可接受，才真正应用
                    const _pre = eng.restoreFromPayload(emb, { source: 'embedded-vault', dryRun: true });
                    if (!_pre.count) { toast('\u274c 嵌入存档无可恢复内容，保持原状（未清理副本）'); return; }
                    if (_pre.schemaWarning) { toast('\u26a0\ufe0f ' + _pre.schemaWarning + '——已中止恢复'); return; }
                    const _rr = eng.restoreFromPayload(emb, { source: 'embedded-vault', snapshot: true });   // [v3.146] 部分失败自动回滚
                    const chatId = eng.getCurrentChatId();
                    if (chatId) await eng.storage.save(chatId, eng.collectExport());
                    try { eng.clearEmbeddedVaultMeta(); } catch (e) { reportUiError(e, 'nonfatal') }
                    try { delete eng.config.config._embeddedVaultReady; eng.config.saveConfig(); } catch (e) { reportUiError(e, 'nonfatal') }
                    const _pf = _rr.failed.length ? `（失败 ${_rr.failed.map(f => f.key).join('/')}）` : '';
                    toast((_rr.ok ? '✅ ' : '⚠️ 部分恢复: ') + `已恢复 ${_rr.count} 个字段${_pf}`);
                    if (!_rr.count) { toast('❌ 嵌入存档无可恢复内容，保持原状'); return; }
                } catch (e) { reportUiError(e, 'ls-embedded-restore'); toast('恢复失败: ' + e.message); }
            });
            // 恢复默认提示词
            overlay.querySelector('#ls-prompt-reset').addEventListener('click', () => {
                overlay.querySelector('#ls-prompt').value = `分析以下对话，提取JSON格式：
{"characters": ["角色名"], "events": [{"type": "事件", "description": "描述"}], "relationships": [{"from": "A", "to": "B", "type": "关系"}], "summary": "摘要"}

对话：{{CONTENT}}`;
                toast('已恢复默认提示词');
            });

            // 导出
            overlay.querySelector('#ls-export').addEventListener('click', async () => {
                // [v3.136] CP: 导出走 collectExport 单真源（原手写 4 键清单缺 clock/timeline/status/moneyLedger 等 30 余键，与 OMR 同病）
                const data = await this.engine.collectExport();
                data.exportedAt = new Date().toISOString();
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
                    reader.onload = async () => {
                        try {
                            const data = JSON.parse(reader.result);
                            // [v3.138] CP-L2: 恢复管线收编单真源 restoreFromPayload（原 40 余行手写清单，三处副本之一）
                            const chatId = this.engine.getCurrentChatId();
                            // [v3.142] CP 原子性：恢复前先只读取回原存档（preserveRuntime 不写运行时），供部分失败时紧急备份留退路
                            const _prev = chatId ? await this.engine.storage.load(chatId, { preserveRuntime: true }) : null;
                            const _rn = this.engine.restoreFromPayload(data, { source: 'file-import', snapshot: true });   // [v3.146] 部分失败自动回滚
                            if (!_rn.count) { toast('❌ 存档无可恢复内容，原记忆保持不变（未落盘）'); return; }   // [v3.142] 空恢复不得覆盖原存档
                            if (_rn.failed.length) {
                                // [v3.142] 部分失败：运行时已半改，落盘前先把改前的完整存档送进紧急备份（面板可回滚）
                                try { if (_prev) await window.LonShaMemory?.emergency?.save(chatId, `部分导入前原存档（失败 ${_rn.failed.map(f => f.key).join('/')}）`, _prev, { restored: _rn.count, failed: _rn.failed.length }); } catch (e) { reportUiError(e, 'nonfatal') }
                            }
                            // [v3.11] 存盘统一走 collectExport（原 version '1.3.0' 块只存 4 字段——导入后新子系统记忆全丢）
                            if (chatId) await this.engine.storage.save(chatId, this.engine.collectExport());
                            toast((_rn.ok ? '✅ ' : '⚠️ 部分导入: ') + `已恢复 ${_rn.count} 个字段` + (_rn.failed.length ? `（失败 ${_rn.failed.map(f => f.key).join('/')}，原存档已存紧急备份）` : '') + (_rn.unknown?.length ? `（未知键 ${_rn.unknown.length} 个已保留）` : '') + (_rn.missing?.length ? `（引擎缺模块 ${_rn.missing.length}）` : ''));
                        } catch (e) { toast('❌ 导入失败: ' + e.message); }
                    };
                    reader.readAsText(file);
                };
                input.click();
            });

            // 清空
            // [v3.236.0] R4-B 缺口 3：本处理器此前是**一段手抄赋值**（16 个模块），
            //   而恢复面登记着 42 面 —— 有 16 个模块面从未被清空触达，末尾却仍走
            //   `collectExport()` 全量落盘。于是「已清空」这句话在数据上是假的。
            //   现在只剩三件事：调引擎的清空入口、按结局播报、按结局落盘。
            //   顺序上**先清后存**是刻意的：存的是清空之后的状态，一旦顺序颠倒，
            //   用户在「清空失败」时会把清空前的数据再写一遍（该覆盖的没覆盖）。
            overlay.querySelector('#ls-clear').addEventListener('click', async () => {
                if (!confirm('确定清空当前对话的所有记忆数据？此操作不可恢复。')) return;
                const _cr = this.engine.clearRuntimeMemory();
                const chatId = this.engine.getCurrentChatId();
                // [v3.11] 存盘统一走 collectExport（原 '2.0.0' 块字段不全——itemOps/reflection/suspense/scene/echo 残留）
                if (chatId) await this.engine.storage.save(chatId, this.engine.collectExport());
                // 播报三态：失败必须点名（否则「有面没清干净」与「全清干净」在 UI 上同形）
                if (!_cr.ok) toast('⚠️ 已清空 ' + _cr.count + ' 面，' + _cr.failed.length + ' 面失败：' + _cr.failed.map(f => f.label || f.id).join('/'));
                else if (_cr.skipped.length) toast('✅ 已清空 ' + _cr.count + ' 面（' + _cr.skipped.length + ' 面本机未加载，跳过错开）');
                else toast('✅ 已清空 ' + _cr.count + ' 面');
                /* [v3.236.0] R4-B：**清空面 ↔ 恢复面的覆盖核对**（可机检读数的消费点）。
                 *   清空是「把运行时按面抹掉」，恢复是按面装上；两面清单必须互为闭包。
                 *   修前这两份清单各自手抄、无人对账（缺口 3 的形状），所以这里不打印数字了事，
                 *   而是把**漏掉的面逐个点名** —— 「已清空」这句话必须能被证伪。 */
                const _cov = (typeof this.engine.snapshotClearCoverage === 'function') ? this.engine.snapshotClearCoverage() : null;
                if (_cov && !_cov.ok) toast('⚠️ 清空覆盖未对齐，这些面没有清空动作：' + _cov.missingInClear.join('/'));
                /* [v3.236.0] R4-B：**「没查过」必须与「查过没问题」分开说**（三态口径）。
                 *   修前只播报失败态，于是「本会话一次都没恢复过 ⇒ 覆盖无从谈起」与
                 *   「恢复面全被清空面覆盖」在用户侧同样**静默**（两者都是没有提示）。
                 *   `everRestored` 的存在让这句话有第三个答案，而不是把两种情形挤进同一个「没提示」。 */
                else if (_cov && !_cov.everRestored) toast('ℹ️ 本会话尚无任何面被恢复过，「清空覆盖」无从核对（清空本身已按面登记执行）');
            });

            // 保存
            overlay.querySelector('#ls-save').addEventListener('click', () => {
                overlay.querySelectorAll('[data-cfg]').forEach(el => {
                    this.engine.config.config[el.dataset.cfg] = el.checked;
                });
                overlay.querySelectorAll('[data-cfg-num]').forEach(el => {
                    const raw = parseFloat(el.value);
                    const step = parseFloat(el.step) || 1;
                    /* [v3.424.1] NaN 不是合法配置值：文本框留空时 parseFloat('') 会给出 NaN，
                     *   直接写进 config 会让后续所有数值判据静默失效（NaN 与任何数比较都 false）。
                     *   保留原值并跳过，不静默归零。 */
                    if (!Number.isFinite(raw)) return;
                    const v = Number.isInteger(step) ? Math.round(raw) : raw;
                    this.engine.config.config[el.dataset.cfgNum] = v;
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
                // [v3.161] 专用控件的保存路径：结构型 / 长文本类配置不能走通用 data-cfg 收集
                const tiersEl = overlay.querySelector('#ls-pyramid-tiers');
                if (tiersEl) {
                    const arr = tiersEl.value.split(/[，,\n]/).map(x => x.trim()).filter(Boolean);
                    if (arr.length >= 3) this.engine.config.config.pyramidTiers = arr;
                    else toast('⚠️ 金字塔层级至少 3 层，已保留原值');
                }
                const rolesEl = overlay.querySelector('#ls-roles-prompt');
                if (rolesEl && rolesEl.value.trim()) this.engine.config.config.extractRolesPrompt = rolesEl.value;
                const chanEl = overlay.querySelector('#ls-secondary-apis');
                if (chanEl) {
                    try {
                        const v = JSON.parse(chanEl.value.trim() || '{}');
                        if (v && typeof v === 'object' && !Array.isArray(v)) this.engine.config.config.secondaryApis = v;
                        else toast('⚠️ 副API通道需为 JSON 对象，已保留原值');
                    } catch (e) { toast('⚠️ 副API通道 JSON 解析失败，已保留原值'); }
                }
                this.engine.config.saveConfig();
                toast('✅ 设置已保存');
                closeOverlay('lonsha-settings-overlay');
            });
        };

        // [v3.77] A: 版本更新检测
        plugin.checkUpdate = async function() {
            const cur = plugin.VERSION || '3.77.0';
            toast('🔄 正在检查更新...');
            try {
                const url = 'https://raw.githubusercontent.com/LonSha/lonsha-memory-plugin/main/manifest.json?t=' + Date.now();
                const res = await fetch(url, { cache: 'no-store' });
                if (!res.ok) { toast('❌ 检查失败：HTTP ' + res.status); return; }
                const mf = await res.json();
                const latest = String(mf.version || '');
                if (!latest) { toast('❌ 远端版本号缺失'); return; }
                const isNewer = (a, b) => {
                    const pa = a.split('.').map(n => parseInt(n, 10) || 0);
                    const pb = b.split('.').map(n => parseInt(n, 10) || 0);
                    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                        const x = pa[i] || 0, y = pb[i] || 0;
                        if (x > y) return true;
                        if (x < y) return false;
                    }
                    return false;
                };
                if (isNewer(latest, cur)) toast(`🆕 发现新版本 ${latest}（当前 ${cur}）`);
                else toast(`✅ 已是最新版本 ${cur}`);
            } catch (e) { toast('❌ 检查失败：' + (e.message || e)); }
        };

        // ========== FAB 快捷菜单 ==========
        // ========== [v3.423] 玩家主页：FAB 点开即达 ==========
        // 产品定位（用户拍板）：玩家只关心三件事——记忆能力在不在跑、这里的人是谁、过去发生了什么。
        // 引擎名/召回源/BM25 等开发者黑话一律不上主页；专业视图仍可从总览与设置进入。
        plugin.showPlayerHome = function() {
            const s = this.engine;
            const cfg = s.config.config;
            const esc = (t) => String(t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const running = cfg.enabled !== false && cfg.extractionEnabled !== false;
            const hasApi = !!(cfg.apiUrl && cfg.apiKey) || cfg.apiProviderCustom !== true; // 未配独立API时默认走宿主接口，视为可用
            const apiLabel = cfg.apiProviderCustom ? (cfg.apiUrl ? '✅ 已连接' : '⚠️ 未配置') : '✅ 用游戏自带接口';
            const modeName = { balanced: '◈ 沉浸叙事', quality: '◷ 深度推演', 'low-cost': '⬡ 极简轻量' }[cfg.extractionProfile || 'balanced'] || '◈ 沉浸叙事';
            const chars = Object.keys(s.status?.characters || {});
            const recent = (s.summary.summaries || []).slice(-5).reverse();
            const memoryCount = (s.summary.summaries || []).length;
            const body = `
                <div class="ls-home-status">
                    <div class="ls-home-status-main">
                        <span class="ls-home-dot" style="background:${running && hasApi ? 'var(--ls-success,#34d399)' : 'var(--ls-warn,#fbbf24)'};box-shadow:0 0 8px ${running && hasApi ? 'var(--ls-success,#34d399)' : 'var(--ls-warn,#fbbf24)'};"></span>
                        <div>
                            <div style="font-size:15px;font-weight:600;color:var(--ls-text,#f1f5f9);">${running && hasApi ? '记忆正在运转' : (running ? '记忆在运转，接口未连' : '记忆已暂停')}</div>
                            <div class="ls-hint" style="margin:2px 0 0;">已记住 ${memoryCount} 段剧情 · 接口 ${apiLabel}</div>
                        </div>
                    </div>
                    <div class="ls-home-modes">
                        ${['balanced','quality','low-cost'].map(p => `<div class="ls-mode-pill${(cfg.extractionProfile || 'balanced') === p ? ' active' : ''}" data-home-profile="${p}" role="button">${ {balanced:'◈ 沉浸叙事',quality:'◷ 深度推演','low-cost':'⬡ 极简轻量'}[p] }</div>`).join('')}
                    </div>
                </div>
                <div class="ls-home-section">
                    <div class="ls-home-title">◷ 最近发生的事</div>
                    ${recent.length === 0 ? '<div class="ls-hint">还没有故事记录。继续聊天，这里会自动写下发生过的事。</div>'
                      : recent.map(m => `<div class="ls-home-event">${esc(String(m.text || m.summary || '').slice(0, 60))}${String(m.text || m.summary || '').length > 60 ? '…' : ''}<span class="ls-home-event-meta">第 ${m.floor ?? '?'} 楼</span></div>`).join('')}
                </div>
                <div class="ls-home-section">
                    <div class="ls-home-title">◈ 这里的人 <span class="ls-home-more" data-home-jump="status">${chars.length} 人 ›</span></div>
                    ${chars.length === 0 ? '<div class="ls-hint">登场人物出现后会自动记录。</div>'
                      : chars.slice(0, 6).map(n => `<div class="ls-home-chip" data-home-jump="status">${esc(n)}</div>`).join('')}
                </div>
                <div class="ls-home-actions">
                    <button class="ls-btn" data-home-act="overview">📖 记忆总览</button>
                    <button class="ls-btn" data-home-act="timeline">◷ 故事时间线</button>
                    <button class="ls-btn ls-btn-primary" data-home-act="settings">⚙ 设置</button>
                </div>
                <div class="ls-hint" style="text-align:center;margin-top:12px;"><span class="lsm-item" data-act="ckpt" style="cursor:pointer;color:var(--ls-text-3,#64748b);">⚑ 时间检查点</span> · <span class="lsm-item" data-act="update" style="cursor:pointer;color:var(--ls-text-3,#64748b);">↻ 检查更新</span></div>
            `;
            const ov = makeSheet('lonsha-home-overlay', '🧠 记忆', body);
            const profileWrite = (profile) => {
                if (!['balanced','quality','low-cost'].includes(profile)) return;
                this.engine.config.config.extractionProfile = profile;
                this.engine.config.saveConfig();
                ov.querySelectorAll('[data-home-profile]').forEach(p => p.classList.toggle('active', p.dataset.homeProfile === profile));
                toast('✅ 已切换到「' + {balanced:'沉浸叙事',quality:'深度推演','low-cost':'极简轻量'}[profile] + '」');
            };
            ov.querySelectorAll('[data-home-profile]').forEach(p => p.addEventListener('click', () => profileWrite(p.dataset.homeProfile)));
            ov.querySelectorAll('[data-home-jump]').forEach(el => el.addEventListener('click', () => {
                closeOverlay('lonsha-home-overlay');
                plugin.showBrowser(el.dataset.homeJump);
            }));
            ov.querySelectorAll('[data-home-act]').forEach(el => el.addEventListener('click', () => {
                closeOverlay('lonsha-home-overlay');
                const act = el.dataset.homeAct;
                if (act === 'overview') plugin.showStatsPanel();
                else if (act === 'timeline') plugin.showBrowser('timeline');
                else if (act === 'settings') plugin.showSettingsPanel();
            }));
            ov.querySelector('.lsm-item[data-act="update"]').addEventListener('click', () => { closeOverlay('lonsha-home-overlay'); plugin.checkUpdate(); });
            ov.querySelector('.lsm-item[data-act="ckpt"]').addEventListener('click', () => { closeOverlay('lonsha-home-overlay'); plugin.showCheckpoints(); });
        };
        plugin.showFabMenu = function() {
            // [v3.423] FAB 直达玩家主页；旧七项菜单退役（功能全部保留在总览/设置内）。
            plugin.showPlayerHome();
        };

        /**
         * [v3.238.0] R4-D：**检查点面板**（产品面入口）。
         *
         * 为什么要有这一个函数：R4-C 的 8 个引擎方法此前在面板侧**零消费** ——
         *   功能建好了，用户点不到。本函数是「让用户拿得到手里」的那一步，
         *   且它**不自己拼 HTML**：菜单行、预览文案、对照文案三族都由引擎产出
         *   （`checkpointMenuItems` / `checkpointRestorePreviewLines` / `checkpointBranchesDiffLines`），
         *   面板只负责塞进 popup 与把结局播报出来。
         *
         * 三态**不同形**（本仓老账 ①，直接写进这个函数的形状里）：
         *   · 清单读不到（引擎返回 `null`）⇒ 明说「读不到」，**不**说「还没有检查点」；
         *   · 清单为空（返回空串）⇒ 说「还没有检查点」并给出存第一份的指引；
         *   · 有记录 ⇒ 渲染行，每行两个动作（预览 / 删除），底部两个动作（存一份 / 并排对照）。
         */
        plugin.showCheckpoints = function() {
            const engine = plugin.engine;
            const chatId = engine.getCurrentChatId();
            if (!chatId) { toast('无可用对话'); return; }

            const open = (html, onClick) => {
                const ov = makeSheet('lonsha-ckpt-overlay', '◷ 时间轴检查点', html);
                onClick(ov);
                return ov;
            };
            /* [v3.239.0] 三个互斥分支共用同一个「存一份」按钮字面量：
             *   DOM id 在静态扫描里按出现次数判重（v3162 [1b]），写三遍会被判成
             *   「同一 id 出现多次 ⇒ getElementById 只返回第一个」——虽然分支互斥、
             *   运行期不会真的重复，但**判据看不到互斥**，且将来加入第四分支时
             *   更容易真的重复。收成一处是唯一不会漂移的形状。 */
            const SAVE_BTN = '<button class="ls-btn ls-btn-primary" id="ls-ckpt-save">🔖 存一份检查点</button>';
            const bodyHTML = () => {
                const menu = engine.checkpointMenuItems();
                /* 读不到 ≠ 空：三种处境分别给三句话。 */
                if (menu === null) {
                    return '<div class="ls-hint">检查点清单**读不到**（宿主无可用存储 / 模块未加载 / 存储形态不合）——'
                        + '这不是「还没有检查点」，是「看不到」。请确认插件已 init 且宿主提供 localStorage。</div>'
                        + SAVE_BTN;
                }
                if (!menu) {
                    return '<div class="ls-hint">还没有检查点。检查点是一份**取名的当下状态**（最多保留 5 份），'
                        + '用来「动手之前先留一手」，也可以两份并排对照看差了什么。</div>'
                        + SAVE_BTN;
                }
                return '<div style="padding:2px 8px 6px;color:var(--ls-text-2,#9da7b3);font-size:11px;">'
                    + '本会话已存 ' + String((menu.match(/class="lsm-item"/g) || []).length) + ' 份（最多 5 份，超限淘汰最旧）</div>'
                    + menu
                    + '<div style="display:flex;gap:6px;margin:10px 0 0;">'
                    + SAVE_BTN
                    + '<button class="ls-btn" style="flex:1;" id="ls-ckpt-diff">⇄ 并排对照</button>'
                    + '</div>'
                    + '<button class="ls-btn ls-btn-danger" id="ls-ckpt-drop">🗑 删除某一份…</button>'
                    + '<div style="padding:4px 8px;color:var(--ls-text-3,#6e7681);font-size:11px;">'
                    + '点一行 = 看「恢复后会差什么」（只预览，不执行）；删除必须报出名字，不做批量清空。</div>';
            };
            const wire = (ov) => {
                const saveBtn = ov.querySelector('#ls-ckpt-save');
                if (saveBtn) saveBtn.addEventListener('click', () => {
                    let nm;
                    try { nm = prompt('给这份检查点取个名字（最长 32 字，同名会覆盖并如实报出）：', '备份'); }
                    catch (e) { toast('当前环境不支持输入框'); return; }
                    if (nm === null || nm === undefined) return;
                    const r = engine.saveCheckpoint(nm);
                    if (!r || r.ok !== true) { toast('❌ 存检查点失败：' + String((r && r.reason) || '未知')); return; }
                    let msg = '✅ 已存「' + String(r.name) + '」' + (Number.isFinite(Number(r.at)) ? '' : '');
                    msg += r.overwritten ? ('（覆盖了同名旧份' + (Number.isFinite(Number(r.previousAt)) ? '，旧份时间 ' + new Date(Number(r.previousAt)).toLocaleString() : '') + '）') : '';
                    if (Array.isArray(r.evicted) && r.evicted.length) msg += '（超限淘汰：' + r.evicted.join('、') + '）';
                    toast(msg);
                    ov.remove();
                    plugin.showCheckpoints();
                });
                const diffBtn = ov.querySelector('#ls-ckpt-diff');
                if (diffBtn) diffBtn.addEventListener('click', () => {
                    let a, b;
                    try { a = prompt('对照：A 的名字', ''); b = prompt('对照：B 的名字', ''); }
                    catch (e) { toast('当前环境不支持输入框'); return; }
                    if (!a || !b) return;
                    const lines = engine.checkpointBranchesDiffLines(a, b);
                    /* 任一侧缺失 ⇒ 引擎返回 null（不拿空载荷冒充「那边是空的」），面板如实说。 */
                    if (lines === null) { toast('❌ 对照失败：至少有一份不存在，或载荷已损坏（拿不到可选）'); return; }
                    /* [v3.252.0] F7 首阶段：键面之上再给一层**内容级**对照。
                     *   为什么必须由面板**真调用**（而不是只留引擎出口）：R4-C 的教训就是
                     *   「建好不消费 = 功能级失效」—— 出口存在但用户点不到，等于没做。
                     *   三态：深比较出口不存在时 checkpointContentDiffLines 仍会返回键面文案
                     *   （并明说「本版无深比较」），故这里只判 null（= 读不到）。 */
                    const deepLines = engine.checkpointContentDiffLines(a, b);
                    alert(deepLines === null ? lines : (lines + '\n\n── 内容级 ──\n' + deepLines));
                });
                const dropBtn = ov.querySelector('#ls-ckpt-drop');
                if (dropBtn) dropBtn.addEventListener('click', () => {
                    let nm;
                    try { nm = prompt('要删除哪一份？（必须写全名；删除不可恢复）', ''); }
                    catch (e) { toast('当前环境不支持输入框'); return; }
                    if (!nm) return;
                    const r = engine.dropCheckpoint(nm);
                    if (!r || r.ok !== true) { toast('❌ 删除失败：' + String((r && r.reason) || '未知')); return; }
                    /* 删除幂等：不存在也报 ok:true + existed:false —— 面板如实分形播报。 */
                    toast(r.existed ? ('🗑 已删除「' + String(nm) + '」') : ('ℹ️ 没有叫「' + String(nm) + '」的检查点（未改动任何东西）'));
                    ov.remove();
                    plugin.showCheckpoints();
                });
                ov.querySelectorAll('.lsm-item[data-name]').forEach(item => {
                    item.addEventListener('click', () => {
                        const nm = item.getAttribute('data-name');
                        const detail = engine.checkpointDetailLines(nm);
                        if (detail === null) { toast('❌ 这份检查点读不到或记录已损坏'); return; }
                        const lines = engine.checkpointRestorePreviewLines(nm);
                        if (lines === null) { toast('❌ 预览失败：这份检查点读不到或载荷已损坏'); return; }
                        if (!confirm(detail + '\n\n── 恢复后会差什么 ──\n' + lines
                            + '\n\n（这只是预览，不会改动当前记忆；真要恢复请用「设置 → 快照恢复」那一条管线）')) return;
                        /* 预览归预览：这里**刻意不执行恢复** —— 真落地只走 restoreFromPayload 单真源。 */
                        toast('ℹ️ 以上为预览；本面板不执行恢复');
                    });
                });
            };
            open(bodyHTML(), wire);
        };

        // [v2.9] RU-C: 快照恢复面板
        plugin.showSnapshotRestore = async function() {
            const engine = plugin.engine;
            const chatId = engine.getCurrentChatId();
            if (!chatId) { toast('无可用对话'); return; }
            const _list = await engine.snapshots.list(chatId);
            if (!_list.length) { toast('暂无快照（每50楼自动保存一份）'); return; }
            /* [v3.236.0] R4-B：行的 HTML 由引擎产出（面板只负责把它塞进 popup）。 */
            const body = engine.snapshotRestoreMenu(_list);
            const menu = document.createElement('div');
            menu.id = 'lonsha-snap-menu';
            menu.innerHTML = `
                <div style="padding:6px 14px;color:var(--ls-text-2,#9da7b3);font-size:11px;border-bottom:1px solid var(--ls-line,rgba(240,246,252,0.10));">◷ 快照还原（选择要恢复的楼层）</div>
                ${body}
                <!-- [v3.238.0] R4-D：恢复是**破坏性动作**，故在这里给「先留一手」的入口 —— 检查点面板 -->
                <div class="lsm-item" id="ls-ckpt-from-snap" style="border-top:1px solid var(--ls-line,rgba(240,246,252,0.10));">🔖 先存一份检查点再恢复…</div>
                <style>#lonsha-snap-menu { position: fixed; bottom: 200px; right: 20px; background: var(--ls-bg-1,#0d1117); backdrop-filter: var(--ls-blur,none); -webkit-backdrop-filter: var(--ls-blur,none); border: 1px solid var(--ls-line,rgba(240,246,252,0.10)); border-radius: var(--ls-r-lg,16px); padding: 6px; z-index: 10001; box-shadow: var(--ls-sh-2,0 12px 32px rgba(1,4,9,0.6)); min-width: 260px; max-height: 60vh; overflow-y: auto; animation: ls-menu-in var(--ls-t-med,200ms) var(--ls-ease,ease); }</style>`;
            menu.querySelectorAll('.lsm-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const floor = Number(item.dataset.floor);
                    /* [v3.236.0] R4-B 缺口 1：**整条流程下沉到引擎**（读快照 → 两阶段恢复 → 落盘）。
                     *   面板在这里只做两件事：把楼层交出去、把结局播报出来。
                     *   修前形状（留痕，别改回去）：面板手抄 14 行 `engine.X.import(data.X)`，
                     *   而 `restoreFromPayload` 登记着 42 面 ⇒ 用户点「快照恢复」后 13 面回到快照、
                     *   其余 29 面维持现值，再经全量序列化落盘成一份「半套状态」。
                     *   为什么连读与写也要一起下沉：留一段在面板，就留了一处「流程谁说了算」的暗面；
                     *   而 `snapshotPrecheckEnabled` 的消费点必须落在**有调用者**的方法内
                     *   （D1 两跳可达性），否则声明键在活性判据眼里就是死配置。 */
                    let _fr;
                    try { _fr = await engine.restoreSnapshotFlow(chatId, floor); }
                    catch (e) { toast('恢复失败: ' + e.message); return; }
                    if (!_fr.ok) { toast('❌ ' + _fr.reason); return; }
                    if (!_fr.applied) { toast('❌ ' + _fr.reason); return; }
                    const _rn = _fr.result;
                    menu.remove();
                    toast((_rn.ok ? '✅ ' : '⚠️ 部分恢复: ') + `已恢复到快照（楼层 ${floor}） · 恢复 ${_rn.count} 个字段`
                        + (_rn.failed.length ? `（失败 ${_rn.failed.map(f => f.key).join('/')}` + (_rn.rolledBack ? '，已自动回滚原状态）' : '，未回滚（保留半套，可紧急备份恢复））') : '')
                        + (_rn.unknown?.length ? `（未知键 ${_rn.unknown.length} 个已保留）` : '')
                        + (_rn.missing?.length ? `（引擎缺模块 ${_rn.missing.length}）` : '')
                        + ((_fr.precheck && _fr.precheck.count !== _rn.count) ? `（预检 ${_fr.precheck.count} 面 / 实恢复 ${_rn.count} 面）` : ''));
                });
            });
            const _ck = menu.querySelector('#ls-ckpt-from-snap');
            if (_ck) _ck.addEventListener('click', () => { menu.remove(); plugin.showCheckpoints(); });
            const closer = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', closer); } };
            setTimeout(() => document.addEventListener('click', closer), 50);
            document.body.appendChild(menu);
        };

        // [v3.0] SD: 一键诊断面板
        // [v3.34] 记忆管理器
        plugin._memPersist = async function() {
            try {
                const eng = this.engine;
                await eng.storage.save(eng.getCurrentChatId(), eng.collectExport());
                return true;
            } catch (e) { console.error("[LonSha] persist fail:", e); return false; }
        };
        plugin._memToast = function(msg, ok = true) {
            const t = document.createElement("div");
            t.className = "ls-toast";
            t.style.background = ok ? "var(--ls-success,#3fb950)" : "var(--ls-danger,#f85149)";
            t.textContent = msg;
            document.body.appendChild(t);
            setTimeout(() => t.remove(), 1800);
        };
        /* ────────────────────────────────────────────────────────────────
         * [v3.338.0 · M4-O8] 记忆控制中心**处置类动作的生产方**（`_memoryCenterHandlers`）。
         *
         * 【为什么此前是空的】内核 `memory-center.js` 声明了 9 个动作、面板也把点击转给了
         *   `plugin._memoryCenterHandlers`，但这个映射**全仓零定义** —— 于是每个按钮都走
         *   「该动作未接」分支。声明面与执行面之间缺的正是这一段（本仓治理过多轮的
         *   「出口齐全、正常会话不供数」）。
         *
         * 【本块只做三件事，一行账都不自己算】
         *   ① 收集用户在面板上圈的范围与逐项勾选；
         *   ② 把「提案 / 落笔 / 撤销」三件交给**宿主公开出口**
         *      （`correctionPlanReextract` / `applyCorrectionPlan` / `undoCorrection`）；
         *   ③ 把回执**原样**显示（applied / verified / readback 三态分开，不合并成一格）。
         *   范围与条件归一在内核、落笔在 owner —— 面板重写一次就会出现第二套口径。
         * ──────────────────────────────────────────────────────────────── */
        plugin._memoryCenterHandlers = plugin._memoryCenterHandlers || {};
        /** 纠错面板：圈范围 → 提案 → 逐项选/拒 → 确认落笔 → 分别撤销。 */
        plugin.showCorrectionPanel = function (seed) {
            const self = this;
            const s = this.engine;
            const sd = (seed && typeof seed === 'object') ? seed : {};
            const esc2 = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            /* 面板**不自持提案**：每次重跑都现取（缓存一份提案就是第二份证据库）。 */
            let last = null;
            const body = `
                <div class="ls-hint">本面板走的是**原生出口**：圈定范围 → 看新旧对照 → 逐项选/拒 → 确认落笔。
                未圈范围不产提案；未选中的项**一个字节不动**；撤配置与撤事实是两个 token。</div>
                <div class="ls-row"><div><div>楼层范围</div><div class="ls-hint">起点与终点都填（或只填起点＝单楼）</div></div>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <input class="ls-input" id="ls-cp-from" style="width:70px" placeholder="from" value="${sd.from != null ? esc2(sd.from) : ''}">
                        <span>~</span>
                        <input class="ls-input" id="ls-cp-to" style="width:70px" placeholder="to" value="${sd.to != null ? esc2(sd.to) : ''}">
                    </div></div>
                <div style="display:flex;gap:8px;margin:8px 0;">
                    <div class="ls-btn ls-btn-primary" id="ls-cp-plan">① 生成提案（不落笔）</div>
                    <div class="ls-btn" id="ls-cp-apply" style="opacity:0.5;pointer-events:none;">② 确认执行</div>
                </div>
                <div id="ls-cp-out"></div>
                <div id="ls-cp-undo"></div>
            `;
            const ov = makeSheet('lonsha-correction-sheet', '⬡ 记忆审计与自愈', body);
            const out = ov.querySelector('#ls-cp-out');
            const undoBox = ov.querySelector('#ls-cp-undo');
            const applyBtn = ov.querySelector('#ls-cp-apply');
            const rangeOf = () => {
                const f = String(ov.querySelector('#ls-cp-from').value || '').trim();
                const t = String(ov.querySelector('#ls-cp-to').value || '').trim();
                if (f === '' && t === '') return null;
                if (f !== '' && t === '') return Number(f);
                return { from: Number(f), to: Number(t) };
            };
            const picks = new Map();
            const render = (plan) => {
                last = plan;
                if (!plan || plan.ok !== true) {
                    out.innerHTML = '<div class="ls-hint" style="color:var(--ls-warn,#d29922);">⚠️ '
                        + esc2('提案不可用：' + ((plan && plan.reason) || 'unknown')) + '</div>';
                    return;
                }
                if (plan.scoped !== true) {
                    out.innerHTML = '<div class="ls-hint" style="color:var(--ls-warn,#d29922);">⚠️ 范围未圈定（'
                        + esc2(plan.scope && plan.scope.reason) + '）⇒ **不产全量提案**：'
                        + esc2(plan.why) + '</div>';
                    return;
                }
                const rows = (plan.items || []).map((it) => {
                    const d = picks.has(it.key) ? picks.get(it.key) : it.decision;
                    const b4 = it.before ? esc2(it.before.value) : '（无）';
                    return '<div class="ls-item" data-cpkey="' + esc2(it.key) + '">'
                        + '<div class="ls-item-meta">' + esc2(it.outcome) + ' · 楼层 ' + esc2(it.floor == null ? '—' : it.floor)
                        + ' · ' + esc2(it.key) + (it.evidenceComplete ? '' : ' · ⚠️ 出处不全') + '</div>'
                        + '<div class="ls-item-text">改前：' + b4 + '　→　改后：' + esc2(it.after && it.after.value) + '</div>'
                        + '<div class="ls-mc-actions">'
                        + '<button class="ls-btn' + (d === 'selected' ? ' ls-btn-primary' : '') + '" data-cppick="selected">选</button>'
                        + '<button class="ls-btn' + (d === 'rejected' ? ' ls-btn-danger' : '') + '" data-cppick="rejected">拒</button>'
                        + '</div></div>';
                }).join('');
                const st = plan.staged || { proposed: 0, selected: 0, rejected: 0 };
                out.innerHTML = '<div class="ls-hint">范围 ' + esc2(plan.scope.from) + '~' + esc2(plan.scope.to)
                    + ' · 对照四态 新增 ' + (plan.byOutcome.added || 0) + ' / 保留 ' + (plan.byOutcome.kept || 0)
                    + ' / 替换 ' + (plan.byOutcome.replaced || 0) + ' / 冲突 ' + (plan.byOutcome.conflicted || 0)
                    + ' · 暂存 选 ' + st.selected + ' 拒 ' + st.rejected + ' 待定 ' + st.proposed
                    + '（未选范围 ' + plan.untouched + ' 条不动）</div>' + rows;
                out.querySelectorAll('[data-cppick]').forEach((b) => b.addEventListener('click', () => {
                    const key = b.closest('[data-cpkey]').dataset.cpkey;
                    picks.set(key, b.dataset.cppick);
                    render(last);
                }));
                const nSel = (plan.items || []).filter((it) => (picks.has(it.key) ? picks.get(it.key) : it.decision) === 'selected').length;
                applyBtn.style.opacity = nSel ? '1' : '0.5';
                applyBtn.style.pointerEvents = nSel ? 'auto' : 'none';
            };
            ov.querySelector('#ls-cp-plan').addEventListener('click', () => {
                const rng = rangeOf();
                const src = (typeof s.correctionSourceFacts === 'function') ? s.correctionSourceFacts(rng) : { ok: false, reason: 'host-absent', facts: [] };
                const nf = (typeof s.correctionReextractFacts === 'function') ? s.correctionReextractFacts({ range: rng, newFacts: sd.newFacts }) : { ok: false, reason: 'host-absent', facts: [] };
                if (nf.ok !== true) {
                    out.innerHTML = '<div class="ls-hint" style="color:var(--ls-warn,#d29922);">⚠️ 取不到新提取结果（'
                        + esc2(nf.reason) + '）—— **不拿旧账冒充新结果**。夹具可经 newFacts 直给。</div>';
                    return;
                }
                picks.clear();
                const plan = s.correctionPlanReextract({
                    range: rng, oldFacts: src.facts, newFacts: nf.facts,
                    selections: []
                }, {});
                render(plan);
            });
            applyBtn.addEventListener('click', async () => {
                if (!last || last.scoped !== true) { toast('先圈范围并生成提案'); return; }
                const rng = rangeOf();
                const src = (typeof s.correctionSourceFacts === 'function') ? s.correctionSourceFacts(rng) : { ok: false, facts: [] };
                const nf = (typeof s.correctionReextractFacts === 'function') ? s.correctionReextractFacts({ range: rng, newFacts: sd.newFacts }) : { ok: false, facts: [] };
                const sel = (last.items || []).map((it) => ({ key: it.key, decision: picks.has(it.key) ? picks.get(it.key) : it.decision }));
                toast('落笔中…');
                const r = await s.applyCorrectionPlan({
                    range: rng, oldFacts: src.facts, newFacts: nf.facts, selections: sel
                });
                if (!r) { toast('落笔降级（模块缺席 / 异常）'); return; }
                out.innerHTML = '<div class="ls-hint">回执：' + esc2(r.ok ? '✅ 完成' : ('⚠️ ' + (r.reason || '部分失败')))
                    + ' · 选中 ' + r.selected + ' 拒 ' + r.rejected
                    + ' · 落笔 ' + r.applied + ' 项 / 核到原数据 ' + r.verified + ' 项'
                    + ' · 落盘回读 ' + (r.readback === true ? '真' : (r.readback === false ? '假' : '**没尝试**'))
                    + (r.stale ? ' · ⚠️ 代际已变（本批作废）' : '') + '</div>'
                    + (r.items || []).map((x) => '<div class="ls-item"><div class="ls-item-meta">' + esc2(x.outcome)
                        + ' · ' + esc2(x.status) + (x.reason ? ' · ' + esc2(x.reason) : '')
                        + (x.replayed ? ' · 幂等命中（未重复落）' : '') + '</div></div>').join('');
                const u = r.undo || {};
                const btns = [];
                if (u.factUndo) btns.push('<div class="ls-btn ls-btn-danger" data-cpundo="fact" data-token="' + esc2(u.factUndo.token) + '">↺ 撤销本次事实变更</div>');
                if (u.configUndo) btns.push('<div class="ls-btn ls-btn-danger" data-cpundo="config" data-token="' + esc2(u.configUndo.token) + '">↺ 撤销本次配置变更</div>');
                undoBox.innerHTML = btns.length
                    ? '<div class="ls-hint">两路撤销**分开**：' + esc2(u.note || '') + '</div><div style="display:flex;gap:8px;">' + btns.join('') + '</div>'
                    : '<div class="ls-hint">本次无可撤销项（没落新条目）。</div>';
                undoBox.querySelectorAll('[data-cpundo]').forEach((b) => b.addEventListener('click', async () => {
                    const ur = s.undoCorrection({ kind: b.dataset.cpundo, token: b.dataset.token });
                    const ok = ur && ur.ok === true;
                    toast(ok ? ('↺ 已撤销 ' + ur.reverted + ' 项') : ('撤销失败：' + ((ur && ur.reason) || 'unknown')));
                    if (ok) {
                        const persistedOk = await self._memPersist();
                        if (!persistedOk) toast('撤销已生效但存盘失败', false);
                        undoBox.innerHTML = '<div class="ls-hint">已撤销 ' + ur.reverted + ' 项（'
                            + (ur.touchedFacts ? '事实' : '配置') + '面；另一面**未被触碰**）。</div>';
                    }
                }));
            });
        };
        plugin._memoryCenterHandlers['row.repair.preview'] = function (ctx) {
            const ref = String((ctx && ctx.ref) || '');
            const floor = /:(\d+)$/.exec(ref);
            return this.showCorrectionPanel(floor ? { from: Number(floor[1]), to: Number(floor[1]) } : {});
        };
        plugin._memoryCenterHandlers['row.detail'] = function (ctx) {
            const ref = String((ctx && ctx.ref) || '');
            const face = (typeof this.engine?.memoryCenterView === 'function')
                ? this.engine.memoryCenterView(this._memoryCenterState || null, { detail: ref }) : null;
            const d = (face && face.detailFace) ? face.detailFace : null;
            if (!d) { toast('该条取不到详情'); return; }
            toast('详情：' + (d.textChannel || 'projection') + '（' + String(d.text || '').slice(0, 24) + '…）');
        };
        plugin._memoryCenterHandlers['row.revoke'] = function (ctx) {
            /* 单条撤回走**宿主直写面**（`memoryCenterRevoke`，作用在事实账）：
             *   不伪造 journal —— 伪造会把「撤销这一批」的真流水覆盖掉，那一批再也撤不回来。
             *   行不在事实账上时如实报 not-found，不假装成功。 */
            const ref = String((ctx && ctx.ref) || '');
            const id = ref.indexOf(':') >= 0 ? ref.slice(ref.indexOf(':') + 1) : ref;
            if (!id) { toast('该条没有可撤回的 id'); return; }
            const eng = this.engine;
            if (!eng || typeof eng.memoryCenterRevoke !== 'function') { toast('宿主未接单条撤回出口'); return; }
            const r = eng.memoryCenterRevoke(id, 'center-row-revoke');
            toast(r && r.ok ? (r.replayed ? '该条此前已撤回（幂等）' : '↺ 已撤回该条')
                : ('撤回失败：' + ((r && r.reason) || 'unknown')));
            if (r && r.ok) this.showBrowser('memorycenter');
        };
        plugin._memoryCenterHandlers['row.dispute'] = function () {
            /* 标记争议：事实账**没有**「争议」写面 —— `disputed` 在 `fact-state.js` 是**推导态**
             *   （指涉悬空 / 显式字段）。故这里**如实报不可用**，不编一个假写入。 */
            toast('该动作不可用：事实账无「争议」写面（disputed 为推导态，由指涉悬空判定）');
        };
        plugin._memoryCenterHandlers['row.export'] = function (ctx) {
            const ref = String((ctx && ctx.ref) || '');
            if (!ref) { toast('该条没有引用键'); return; }
            toast('已复制引用键：' + ref);
        };
        plugin._memoryCenterHandlers['query.save'] = function () {
            /* 保存条件走**宿主唯一出口**（条件口径在内核 `buildSpec`，面板不拼）。 */
            const eng = this.engine;
            if (!eng || typeof eng.memoryCenterSaveQuery !== 'function') { toast('宿主未接保存条件出口'); return; }
            const r = eng.memoryCenterSaveQuery(this._memoryCenterState || null);
            if (!r || r.ok !== true) { toast('保存失败：' + ((r && r.reason) || 'unknown')); return; }
            toast('已保存查询条件：' + r.label + (r.replaced ? '（覆盖同条件）' : '') + ' · 共 ' + r.count + ' 条');
            this.showBrowser('memorycenter');
        };
        plugin._memoryCenterHandlers['query.reset'] = function () {
            /* 清空条件走**内核 step**（`reset` 保留 pageSize 与 saved —— 那是内核的口径）。 */
            const s = this.engine;
            if (!s || typeof s.memoryCenterStep !== 'function') { toast('宿主未接控制中心出口'); return; }
            const face = s.memoryCenterStep(this._memoryCenterState || null, 'reset', {});
            this._memoryCenterState = face.state || this._memoryCenterState;
            this.showBrowser('memorycenter');
        };
        plugin._memoryCenterHandlers['saved.remove'] = function (ctx) {
            /* 删除走**宿主真源**（`removeEvidenceQuery` 走 evidence-query 的 saved 表）。 */
            const key = String((ctx && ctx.ref) || '');
            const eng = this.engine;
            if (!eng || typeof eng.removeEvidenceQuery !== 'function') { toast('宿主未接删除出口'); return; }
            const r = eng.removeEvidenceQuery(key);
            toast(r && r.ok ? '已删除该条件' : ('删除失败：' + ((r && r.reason) || 'unknown')));
            this.showBrowser('memorycenter');
        };
        plugin._memoryCenterHandlers['saved.replay'] = function (ctx) {
            /* 回放：**用当前原账重跑** —— 走内核 `load-saved`（它取保存的 spec 重建状态）。 */
            const key = String((ctx && ctx.ref) || '');
            const s = this.engine;
            if (!s || typeof s.memoryCenterStep !== 'function') { toast('宿主未接控制中心出口'); return; }
            const face = s.memoryCenterStep(this._memoryCenterState || null, 'load-saved', { replayKey: key });
            if (!face || face.handled !== true) { toast('该条件不在保存列表里'); return; }
            this._memoryCenterState = face.state || this._memoryCenterState;
            this.showBrowser('memorycenter');
        };
        // [v3.38] 人工干预撤销栈与撤销方法（Event Sourcing Audit Trail）
        plugin._auditStack = [];
        plugin.undoLastOp = async function() {
            if (!this._auditStack || !this._auditStack.length) {
                this._memToast('暂无可撤销的操作', false);
                return false;
            }
            const op = this._auditStack.pop();
            try {
                if (typeof op?.undo === 'function') {
                    await op.undo();
                    const ok = await this._memPersist();
                    this._memToast(`↺ 已撤销: ${op.desc || '上一步操作'}`, ok);
                    return ok;
                }
            } catch (e) {
                console.error('undo failed:', e);
                this._memToast('撤销执行异常: ' + e.message, false);
            }
            return false;
        };

        plugin._memOps = function(kind, id, onDone) {
            const eng = this.engine;
            const esc = (t) => String(t || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
            /* [v3.303.0 M-O2] **比对同一性**：本函数收到的 `id` 永远来自 `dataset` / HTML 属性，
             *   而 DOM 属性**只能是字符串**（`data-opid="3"` 读出来是 `'3'`，不是 `3`）。
             *   改动前的各分支拿它去比引擎侧的原生值（summary 是 `floor: Number`、
             *   life/suspense 是各自 `id` 生成式）——一旦两侧类型不同，`===` 恒 false，
             *   于是 `find` 恒落空、函数**静默 return**，表现为「条目点得动但面板永远不弹」。
             *   真宿主实测（probe flow5，真 ST 1.19.0 + Chromium 131）：
             *     `_memOps('summary','3')` ⇒ panelOpen=false；`_memOps('summary',3)` ⇒ panelOpen=true
             *     （同函数、同数据、只差 id 类型）⇒ 根因是**两侧类型不同**，不是数据没造出来。
             *   读侧口径必须与写侧同源：在寻址口**一次性**归一成字符串（`String()` 在写侧
             *   同样是规范化口，见 `addManualSummary` / `addLockedFact` 的 `String(floor)`），
             *   各分支的比对表达式相应改为 `.id === key` / `.floor === key` —— 不做逐处 `Number()`
             *   强转（那会把字符串型 id 打回 NaN，把一类错换成另一类错）。 */
            const key = String(id);
            let label = "", actions = [];
            if (kind === "timeline") {
                const e = eng.timeline.entries.find(x => x.id === key);
                if (!e) return;
                label = esc(e.text).substring(0, 60);
                actions = [
                    { t: "⭐ 提升重要度", fn: () => { e.importance = Math.min(10, (e.importance || 5) + 2); return "重要度→" + e.importance; } },
                    { t: "🗑 删除该条", fn: () => { eng.timeline.entries = eng.timeline.entries.filter(x => x.id !== key); return "已删除"; }, danger: true },
                ];
            }
            else if (kind === "summary") {
                const m = eng.summary.summaries.find(x => String(x.floor) === key);
                if (!m) return;
                label = esc(m.text).substring(0, 60);
                actions = [
                    { t: "✏ 编辑该摘要", fn: () => {
                        const nt = prompt('编辑第 ' + id + ' 楼摘要（可直接修改文本）：', m.text);
                        if (nt === null) return;
                        if (!eng.summary?.updateSummaryText) { toast('引擎版本过旧'); return; }
                        if (eng.summary.updateSummaryText(Number(key), nt)) {
                            toast('✅ 摘要已更新');
                            if (eng.bm25?.rebuild && eng.summary?.getActiveSummaries) {
                                eng.bm25.rebuild(eng.summary.getActiveSummaries().map(s => ({id: 'sum_' + s.floor, text: s.text, floor: s.floor, source: 'bm25'})));
                            }
                        } else { toast('更新失败'); }
                    } },
                    { t: "🗑 删除该摘要", fn: () => {
                        eng.summary.summaries = eng.summary.summaries.filter(x => String(x.floor) !== key);
                        if (eng.bm25?.rebuild && eng.summary?.getActiveSummaries) {
                            eng.bm25.rebuild(eng.summary.getActiveSummaries().map(s => ({id: 'sum_' + s.floor, text: s.text, floor: s.floor, source: 'bm25'})));
                        }
                        return "已删除摘要";
                    }, danger: true },
                ];
            } else if (kind === "pov") {
                const p = (eng.pov?.povs || []).find(x => x.id === key);
                if (!p) return;
                label = esc(p.content).substring(0, 60);
                actions = [
                    { t: "🗑 删除该私密记忆", fn: () => { eng.pov.povs = eng.pov.povs.filter(x => x.id !== key); return "已删除POV"; }, danger: true },
                ];
            }
            else if (kind === "vector") {
                const v = eng.vector.vectors.find(x => x.id === key);
                if (!v) return;
                label = esc((v.text || "").substring(0, 60));
                actions = [
                    { t: "🗑 删除该向量", fn: () => { eng.vector.vectors = eng.vector.vectors.filter(x => x.id !== key); return "已删除向量"; }, danger: true },
                ];
            } else if (kind === "todo") {
                const parts = String(id).split("|||");
                const ch = parts[0], text = parts.slice(1).join("|||");
                const rec = eng.status?.characters?.[ch];
                if (!rec) return;
                label = esc(ch) + " · 待办: " + esc(text);
                actions = [
                    { t: "✅ 标记完成（删除）", fn: () => { rec.todos = (rec.todos || []).filter(x => x.text !== text); return "待办已移除"; } },
                ];
            }
            else if (kind === "field") {
                const parts = String(id).split("|||");
                const ch = parts[0], field = parts[1];
                const rec = eng.status?.characters?.[ch];
                if (!rec) return;
                label = esc(ch) + " · " + esc(field) + " = " + esc(String(rec.fields?.[field] ?? ""));
                actions = [
                    { t: "✏️ 修改数值", fn: () => {
                        const cur = rec.fields?.[field] ?? 0;
                        let nv = null;
                        try { nv = prompt("新值（支持 +5 / -3 / 绝对值 / 文本）:", String(cur)); } catch (e) { console.warn("prompt unavailable:", e); }
                        if (nv === null) return null;
                        const val = nv.trim(); if (!val) return null;
                        if (/^[+-]\d+([.]\d+)?$/.test(val)) {
                            const base = Number(rec.fields[field]) || 0;
                            rec.fields[field] = Math.round((base + Number(val)) * 100) / 100;
                        } else rec.fields[field] = val;
                        return field + " → " + rec.fields[field];
                    } },
                    { t: "🗑 删除该字段", fn: () => { delete rec.fields[field]; return "字段已删除"; }, danger: true },
                ];
            }
            else if (kind === "protagonist_field") {
                const p = eng.status?.protagonist;
                if (!p) return;
                const labels = { gender: "性别", age: "年龄", identity: "身份", appearance: "体貌", outfit: "当前着装", condition: "生理/伤病状况" };
                const field = String(id);
                if (!labels[field]) return;
                label = "🧍 " + labels[field] + " = " + esc(String(p[field] || "（未登记）"));
                actions = [
                    { t: "✏️ 编辑", fn: () => {
                        let nv = null;
                        try { nv = prompt(labels[field] + "（留空清除）:", String(p[field] || "")); } catch (e) { console.warn("prompt unavailable:", e); }
                        if (nv === null) return null;
                        const old = String(p[field] || "");
                        const curFloor = (window.SillyTavern?.getContext?.()?.chat?.length || 1) - 1;
                        eng.status.setProtagonist({ [field]: nv }, curFloor);
                        return { label: "已更新「" + labels[field] + "」", desc: "主角档案「" + labels[field] + "」还原", undo: () => { eng.status.setProtagonist({ [field]: old }, curFloor); } };
                    } },
                ];
            }
            else if (kind === "life") {
                const ld = (eng.status?.lifeDetails || []).find(x => x.id === key);
                if (!ld) return;
                label = esc(ld.text).substring(0, 60);
                const setTier = (tier, name) => () => {
                    const old = ld.tier || "active";
                    ld.tier = tier;
                    return { label: "已" + name, desc: "生活小档案层级还原", undo: () => { ld.tier = old; } };
                };
                actions = [
                    { t: "📌 置顶常驻", fn: setTier("pinned", "置顶") },
                    { t: "🔹 常规", fn: setTier("active", "设为常规") },
                    { t: "📦 沉降", fn: setTier("archive", "沉降") },
                    { t: "✏️ 编辑内容", fn: () => {
                        let nv = null;
                        try { nv = prompt("编辑生活小档案:", ld.text); } catch (e) { console.warn("prompt unavailable:", e); }
                        if (nv === null) return null;
                        const next = String(nv).trim();
                        if (!next) return null;
                        const old = ld.text;
                        ld.text = next;
                        return { label: "已更新", desc: "生活小档案内容还原", undo: () => { ld.text = old; } };
                    } },
                    { t: "🗑 删除该条", fn: () => {
                        const backup = { ...ld };
                        const idx2 = (eng.status.lifeDetails || []).indexOf(ld);
                        eng.status.lifeDetails = eng.status.lifeDetails.filter(x => x.id !== key);
                        return { label: "已删除", desc: "生活小档案删除还原", undo: () => { if (idx2 >= 0) eng.status.lifeDetails.splice(idx2, 0, backup); else eng.status.lifeDetails.push(backup); } };
                    }, danger: true },
                ];
            }
            else if (kind === "suspense") {
                const it = (eng.suspense?.items || []).find(x => x.id === key);
                if (!it) return;
                label = esc(it.content).substring(0, 60);
                actions = [
                    { t: "✅ 标记完成", fn: () => { eng.suspense.resolve(id, "done", "（手动了结）"); return "悬念已了结"; } },
                    { t: "🚫 标记取消", fn: () => { eng.suspense.resolve(id, "cancelled", "（手动取消）"); return "悬念已取消"; } },
                    { t: "🗑 删除该条", fn: () => { eng.suspense.items = eng.suspense.items.filter(x => x.id !== key); return "已删除悬念"; }, danger: true },
                ];
            } else if (kind === "item") {
                const rec = (eng.items?.records || []).find(x => x.name === key);
                if (!rec) return;
                label = esc(rec.name) + "（" + esc(rec.holder || "无主") + " · " + esc(rec.state || "完好") + "）";
                actions = [
                    { t: "👤 变更持有者", fn: () => {
                        let nh = null;
                        try { nh = prompt("新持有者名称（置空填 '地上'）:", String(rec.holder || "")); } catch (e) { reportUiError(e, 'nonfatal') }
                        if (nh === null) return null;
                        const holder = nh.trim() || "地上";
                        eng.itemOps = eng.itemOps || [];
                        const currentFloor = eng.summary?.summaries?.length || 0;
                        eng.itemOps.push({ action: "update", name: rec.name, holder, floor: currentFloor });
                        eng.rebuildItems();
                        const oldH = rec.holder || "地上";
                        return {
                            label: "持有者 → " + holder,
                            desc: `物品【${rec.name}】持有者还原为 ${oldH}`,
                            undo: () => {
                                eng.itemOps.push({ action: "update", name: rec.name, holder: oldH, floor: eng.summary?.summaries?.length || 0 });
                                eng.rebuildItems();
                            }
                        };
                    } },
                    { t: "📦 变更状态", fn: () => {
                        let ns = null;
                        try { ns = prompt("新状态（完好 / 损坏 / 消耗完毕 / 丢失）:", String(rec.state || "完好")); } catch (e) { reportUiError(e, 'nonfatal') }
                        if (ns === null) return null;
                        const state = ns.trim() || "完好";
                        eng.itemOps = eng.itemOps || [];
                        const currentFloor = eng.summary?.summaries?.length || 0;
                        eng.itemOps.push({ action: "update", name: rec.name, state, floor: currentFloor });
                        eng.rebuildItems();
                        const oldS = rec.state || "完好";
                        return {
                            label: "状态 → " + state,
                            desc: `物品【${rec.name}】状态还原为 ${oldS}`,
                            undo: () => {
                                eng.itemOps.push({ action: "update", name: rec.name, state: oldS, floor: eng.summary?.summaries?.length || 0 });
                                eng.rebuildItems();
                            }
                        };
                    } },
                    { t: "🗑 标记丢弃/移除", fn: () => {
                        eng.itemOps = eng.itemOps || [];
                        const currentFloor = eng.summary?.summaries?.length || 0;
                        eng.itemOps.push({ action: "remove", name: rec.name, state: "丢弃", floor: currentFloor });
                        eng.rebuildItems();
                        const oldS = rec.state || "完好";
                        const oldH = rec.holder || "地上";
                        return {
                            label: "物品已移除活动列表",
                            desc: `恢复物品【${rec.name}】`,
                            undo: () => {
                                eng.itemOps.push({ action: "add", name: rec.name, holder: oldH, state: oldS, floor: eng.summary?.summaries?.length || 0 });
                                eng.rebuildItems();
                            }
                        };
                    }, danger: true },
                ];
            }
            if (!actions.length) return;
            plugin._memOpsRender(label, actions, onDone);
        };
        plugin._memOpsRender = function(label, actions, onDone) {
            const ovId = "lonsha-memops-overlay";
            document.getElementById(ovId)?.remove();
            const ov = document.createElement("div");
            ov.id = ovId;
            ov.className = "lonsha-overlay";
            ov.innerHTML = `<div class="lonsha-sheet" style="max-width:400px;"><div class="lonsha-sheet-header"><span>✏️ 记忆操作</span><span class="lonsha-sheet-close" id="memops-close">✕</span></div><div class="lonsha-sheet-body"><div class="ls-item" style="margin-bottom:10px;"><div class="ls-item-text">${label}</div></div>${actions.map((a, i) => `<div class="ls-btn ${a.danger ? "ls-btn-danger" : ""}" data-ai="${i}" style="margin:6px 0;">${a.t}</div>`).join("")}</div></div>`;
            document.body.appendChild(ov);
            ov.querySelector("#memops-close").addEventListener("click", () => ov.remove());
            ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
            ov.querySelectorAll("[data-ai]").forEach(btn => {
                btn.addEventListener("click", async () => {
                    const a = actions[Number(btn.dataset.ai)];
                    let res;
                    try { res = a.fn(); } catch (e2) { res = null; console.error(e2); }
                    if (res === null || res === undefined) return;
                    const msg = typeof res === 'object' ? res.label : String(res);
                    if (typeof res === 'object' && typeof res.undo === 'function') {
                        plugin._auditStack = plugin._auditStack || [];
                        plugin._auditStack.push(res);
                        if (plugin._auditStack.length > 30) plugin._auditStack.shift();
                    }
                    // validated above
                    ov.remove();
                    const ok = await plugin._memPersist();
                    plugin._memToast(ok ? "✅ " + msg : "⚠️ 已改但存盘失败", ok);
                    if (ok && typeof onDone === "function") onDone();
                });
            });
        };

        plugin.showDiagnose = async function() {
            const engine = plugin.engine;
            if (!engine) { toast('引擎未初始化'); return; }
            toast('诊断中…');
            let r;
            /* [v3.303.0 M-O2] **`esc` 必须在本函数内可见**：本档是一个 IIFE，里面每个 `show*`
             *   各定义一个局部的 `const esc`；本函数原先**漏了这一行**，而下面构造错误行的
             *   模板串里用了 6 处 `esc(...)` ⇒ 一进 HTML 构造即 `ReferenceError: esc is not defined`。
             *   形态定性：这条路径**只在真有诊断数据时**才走到 —— 空数据下 `r.errors` 为空、
             *   `r.pipeline` / `r.schema` 缺席都会跳开用 `esc` 的那几行，故「新档空跑一次」看不出来。
             *   真宿主实测（probe flow3 / flow5，真 ST 1.19.0 + Chromium 131）：
             *   `showDiagnose()` ⇒ `threw = "esc is not defined"`、诊断面板 **未落 DOM**。
             *   静态普查（/tmp/mo2/esc_scope2.py；模板串内 `${...}` 插值按代码词法处理）：
             *   全档 4 处 `const esc =` / 80 处使用点 / **3 处不可达**，全部落在这个函数体内。 */
            const esc = (t) => String(t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            try { r = await engine.selfCheck(); } catch (e) { toast('诊断失败: ' + e.message); return; }
            const errRows = (r.errors || []).slice(-15).reverse().map(e2 =>
                `<div style="padding:6px 8px;font-size:11px;border-bottom:1px solid var(--ls-line,rgba(240,246,252,0.10));">
                    <div style="display:flex;justify-content:space-between;">
                        <span style="color:var(--ls-danger,#f85149);font-weight:bold;">[${esc(e2.tag)}]</span>
                        <span style="color:var(--ls-text-2,#9da7b3);">${new Date(e2.t).toLocaleTimeString()}</span>
                    </div>
                    <div style="color:var(--ls-text,#e6edf3);font-size:12px;margin:3px 0;">${esc(e2.msg || '').substring(0, 150)}</div>
                    ${e2.hint ? `<div style="color:var(--ls-warn,#d29922);font-size:11px;background:var(--ls-bg-1,#0d1117);padding:4px 8px;border-radius:4px;margin-top:4px;border-left:3px solid var(--ls-warn,#d29922);">💡 诊断指引：${esc(e2.hint)}</div>` : ''}
                </div>`).join('') || '<div style="padding:8px;color:var(--ls-success,#3fb950);font-size:12px;">✓ 无错误记录</div>';
            const statRows = (r.stats || []).map(s => `<div style="display:flex;justify-content:space-between;padding:5px 8px;font-size:13px;border-bottom:1px solid var(--ls-line,rgba(240,246,252,0.10));">
                <span style="color:var(--ls-text-2,#9da7b3);">${s.k}</span><span>${s.v}</span></div>`).join('');
            const p = r.pipeline;
            const pipeHTML = p ? (p.ok
                ? `<div style="padding:6px 8px;font-size:12px;color:var(--ls-success,#3fb950);">✓ 管线通畅 ${p.ms}ms ｜ 查询${p.queryLen}字 → 命中[${(p.routes || []).join(' ')}] → 合并${p.merged}条 → 注入${p.injLen}字</div>`
                : `<div style="padding:6px 8px;font-size:12px;color:var(--ls-warn,#d29922);">⚠️ ${esc(p.note || '管线异常')}${p.hint ? `<br><span style="color:var(--ls-text,#e6edf3);font-size:11px;">💡 ${esc(p.hint)}</span>` : ''}</div>`) : '';
            const sc = r.schema;
            const schemaHTML = sc ? (sc.ok
                ? `<div style="padding:6px 8px;font-size:12px;color:var(--ls-success,#3fb950);">✓ 存档完整（非空: ${(sc.nonEmpty || []).join('、') || '暂无数据'}）</div>`
                : `<div style="padding:6px 8px;font-size:12px;color:var(--ls-danger,#f85149);">✗ 缺失字段: ${(sc.missing || []).join('、')}${sc.hint ? `<br><span style="color:var(--ls-warn,#d29922);font-size:11px;">💡 ${esc(sc.hint)}</span>` : ''}</div>`) : '';
            const body = `
                <div style="padding:4px 8px;font-size:11px;color:var(--ls-text-2,#9da7b3);">${r.time} ｜ v${r.version}</div>
                <div style="margin:6px 0;">${statRows}</div>
                ${pipeHTML}${schemaHTML}
                <div style="padding:6px 8px;font-size:12px;color:var(--ls-text-2,#9da7b3);border-top:1px solid var(--ls-line-strong,rgba(240,246,252,0.18));margin-top:6px;">最近错误（环形缓冲，最多50条）</div>
                <div style="max-height:30vh;overflow-y:auto;">${errRows}</div>`;
            const overlay = makeSheet('lonsha-diag-overlay', '⚙ 记忆内核全景诊断', body);
        };

        console.log('[LonSha记忆引擎] ✓ 设置面板模块已挂载 (点击🧠 → ⚙️设置)');
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(mount, 300));
    } else {
        setTimeout(mount, 300);
    }
})();