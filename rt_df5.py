#!/usr/bin/env python3
# lonsha v3.2.1: DF5 注入参数错位修复（重大——"注入深度配置化"自 v2.8 起从未真正生效）
# 根因: 旧调用 setExtensionPrompt(key, content, depth, true, 4) 与 ST 标准签名
#   (prompt_id, content, position, depth, scan, role, filter) 错位。
# 三源交叉验证: shujuku 官方 d.ts / baibai inject.ts(抄 script.js:486) / stbme 实际调用。
import sys

PATH = '/home/user/lonsha-memory-plugin/index.js'
src = open(PATH, encoding='utf-8').read()

def rep(old, new, tag):
    global src
    n = src.count(old)
    if n != 1:
        print(f'FAIL: {tag} (匹配 {n} 次, 需恰好 1 次)'); sys.exit(1)
    src = src.replace(old, new, 1)
    print(f'ok: {tag}')

# ── DF5-0 版本号 ──
rep("    const VERSION = '3.2.0';", "    const VERSION = '3.2.1';", 'DF5-0 版本号')

# ── DF5-1 插入唯一写入通道（收敛到单一通道，格式错位结构上不可能再发生）──
CHANNEL = '''    // [v3.2] DF5: 注入槽位唯一写入通道——修复 v2.8 起 setExtensionPrompt 参数错位 bug。
    // ST 标准签名（权威源: shujuku @types/iframe/exported.sillytavern.d.ts + baibai inject.ts 抄 script.js:486）:
    //   setExtensionPrompt(prompt_id, content, position, depth, scan, role, filter)
    //   position: -1=不注入(绿灯用), 1=IN_CHAT; role: 0=system, 1=user, 2=assistant; scan: 是否加入绿灯扫描文本
    // 旧调用 (key, content, depth, true, 4) 令配置深度落进 position 位、true 落进 depth 位、4 落进 scan 位——
    // "D0/D1/D2 深度配置"从未真正生效（position 收到 0/1/2，D2 时为非法值）。收敛到本通道后，格式错位在结构上不可能再发生。
    const INJECT_POSITION_IN_CHAT = 1;
    const INJECT_ROLE_SYSTEM = 0;
    function writeInjectSlot(key, content, depth) {
        try {
            const c = window.SillyTavern?.getContext?.();
            if (typeof c?.setExtensionPrompt !== 'function') return false;
            c.setExtensionPrompt(String(key), String(content || ''), INJECT_POSITION_IN_CHAT, Math.max(0, Math.round(Number(depth) || 0)), false, INJECT_ROLE_SYSTEM, null);
            return true;
        } catch (e) { errLog(e, 'DF5.writeInjectSlot'); return false; }
    }
    function clearInjectSlots() {
        writeInjectSlot('lonsha_memory', '', 0);
        writeInjectSlot('lonsha_memory_history', '', 9999);
    }

'''
rep("    // [v3.0] SD: 错误记录器——环形缓冲存最近50条，替代静默吞错。诊断面板读取展示。",
    CHANNEL + "    // [v3.0] SD: 错误记录器——环形缓冲存最近50条，替代静默吞错。诊断面板读取展示。",
    'DF5-1 统一通道插入')

# ── DF5-2 CHAT_CHANGED 清空改走通道 ──
rep("""                        // [v3.2] DF1: 清空注入槽位（setExtensionPrompt 持久化，旧聊天注入会残留到新聊天；GENERATION_STARTED 若仍活跃会立即重新注入）
                        try {
                            const ccc = window.SillyTavern?.getContext?.();
                            if (ccc?.setExtensionPrompt) {
                                ccc.setExtensionPrompt('lonsha_memory', '', 0, false, 4);
                                ccc.setExtensionPrompt('lonsha_memory_history', '', 9999, false, 4);
                            }
                        } catch (e) { errLog(e, 'events.CHAT_CHANGED槽位清空'); }""",
    """                        // [v3.2] DF1/DF5: 清空注入槽位（setExtensionPrompt 持久化，旧聊天注入会残留到新聊天；GENERATION_STARTED 若仍活跃会立即重新注入）
                        try { clearInjectSlots(); } catch (e) { errLog(e, 'events.CHAT_CHANGED槽位清空'); }""",
    'DF5-2 CHAT_CHANGED清空改通道')

# ── DF5-3 生成前停用清空改走通道 ──
rep("""                            if (_cfg.enabled === false || (_cfg.extractionEnabled === false && _cfg.vectorEnabled === false)) {
                                const c0 = window.SillyTavern?.getContext?.();
                                if (c0?.setExtensionPrompt) {
                                    c0.setExtensionPrompt('lonsha_memory', '', 0, false, 4);
                                    c0.setExtensionPrompt('lonsha_memory_history', '', 9999, false, 4);
                                }
                                return;
                            }""",
    """                            if (_cfg.enabled === false || (_cfg.extractionEnabled === false && _cfg.vectorEnabled === false)) {
                                clearInjectSlots();
                                return;
                            }""",
    'DF5-3 停用清空改通道')

# ── DF5-4 主注入路径改走通道（position 恒 IN_CHAT=1，depth 配置真正生效）──
rep("""                                const c = window.SillyTavern?.getContext?.();
                                if (c?.setExtensionPrompt) {
                                    // [v2.8补+v3.1] RT-A: 注入深度配置化 + SF6: 卷摘要顶部槽位
                                    const depth = Math.min(2, Math.max(0, Number(this.engine.config.config.injectionDepth) || 0));
                                    c.setExtensionPrompt('lonsha_memory', injection, depth, true, 4);
                                    const volText = this.engine.buildVolumeInjection();
                                    c.setExtensionPrompt('lonsha_memory_history', volText || '', 9999, true, 4);
                                }""",
    """                                // [v3.2] DF5: 经统一通道写入（修复 v2.8 起 position/depth/scan 参数错位——深度配置从未真正生效的根因）
                                const depth = Math.min(2, Math.max(0, Number(this.engine.config.config.injectionDepth) || 0));
                                writeInjectSlot('lonsha_memory', injection, depth);
                                const volText = this.engine.buildVolumeInjection();
                                writeInjectSlot('lonsha_memory_history', volText || '', 9999);""",
    'DF5-4 主注入改通道')

# ── DF5-5 interceptor 兼容入口改走通道（降级判定改为通道返回值）──
rep("""                const c = window.SillyTavern?.getContext?.();
                if (c?.setExtensionPrompt) {
                    // [v2.8补+v3.1] RT-A: 配置化深度 + SF6: 卷摘要顶部槽位
                    const depth = Math.min(2, Math.max(0, Number(plugin.engine.config.config.injectionDepth) || 0));
                    c.setExtensionPrompt('lonsha_memory', injection, depth, true, 4);
                    const volText = plugin.engine.buildVolumeInjection();
                    c.setExtensionPrompt('lonsha_memory_history', volText || '', 9999, true, 4);
                } else if (Array.isArray(chat) && chat.length > 0 && chat[0]) {
                    // 降级：注入到 system 消息尾部
                    chat[0].mes = (chat[0].mes || '') + injection;
                }""",
    """                // [v3.2] DF5: 经统一通道写入（修复参数错位；通道不可用时降级 system 消息）
                const okInj = writeInjectSlot('lonsha_memory', injection, Math.min(2, Math.max(0, Number(plugin.engine.config.config.injectionDepth) || 0)));
                if (okInj) {
                    writeInjectSlot('lonsha_memory_history', plugin.engine.buildVolumeInjection() || '', 9999);
                } else if (Array.isArray(chat) && chat.length > 0 && chat[0]) {
                    // 降级：注入到 system 消息尾部
                    chat[0].mes = (chat[0].mes || '') + injection;
                }""",
    'DF5-5 interceptor改通道')

open(PATH, 'w', encoding='utf-8').write(src)
print('\n全部通过。写入 index.js')
