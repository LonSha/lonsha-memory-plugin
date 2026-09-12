#!/usr/bin/env python3
# lonsha v3.2.2: DF6 空召回残留修复（baibai 语义："注入空串等于清除"）
# 边界: onBeforeGeneration 返回 '' 时（召回价值判断跳过 / 剧情全在窗口内 / 缓存无命中），
# 旧槽位不被覆盖 → 上一轮召回残留注入本轮。修复: 无论有无内容都写入（空=清除）；
# 卷摘要槽独立刷新（与召回无关，是全量卷折叠产物）。
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

# ── DF6-0 版本号 ──
rep("    const VERSION = '3.2.1';", "    const VERSION = '3.2.2';", 'DF6-0 版本号')

# ── DF6-1 主注入路径: 空召回=显式清除 + 卷摘要独立刷新 ──
rep("""                            const injection = await this.engine.onBeforeGeneration();
                            if (injection) {
                                // [v3.2] DF5: 经统一通道写入（修复 v2.8 起 position/depth/scan 参数错位——深度配置从未真正生效的根因）
                                const depth = Math.min(2, Math.max(0, Number(this.engine.config.config.injectionDepth) || 0));
                                writeInjectSlot('lonsha_memory', injection, depth);
                                const volText = this.engine.buildVolumeInjection();
                                writeInjectSlot('lonsha_memory_history', volText || '', 9999);
                            }""",
    """                            const injection = await this.engine.onBeforeGeneration();
                            // [v3.2] DF6: 空召回=显式清除（baibai 语义"注入空串等于清除"——召回价值判断跳过时旧槽位残留会注入上一轮记忆）
                            const depth = Math.min(2, Math.max(0, Number(this.engine.config.config.injectionDepth) || 0));
                            writeInjectSlot('lonsha_memory', injection || '', depth);
                            // [v3.2] DF6: 卷摘要槽独立刷新（与召回无关；空卷=清除旧卷）
                            try { writeInjectSlot('lonsha_memory_history', this.engine.buildVolumeInjection() || '', 9999); } catch (e) { errLog(e, 'DF6.卷摘要刷新'); }""",
    'DF6-1 主注入空清除')

# ── DF6-2 interceptor 同语义 ──
rep("""            const injection = await plugin.engine.onBeforeGeneration();
            if (injection) {
                // [v3.2] DF5: 经统一通道写入（修复参数错位；通道不可用时降级 system 消息）
                const okInj = writeInjectSlot('lonsha_memory', injection, Math.min(2, Math.max(0, Number(plugin.engine.config.config.injectionDepth) || 0)));
                if (okInj) {
                    writeInjectSlot('lonsha_memory_history', plugin.engine.buildVolumeInjection() || '', 9999);
                } else if (Array.isArray(chat) && chat.length > 0 && chat[0]) {
                    // 降级：注入到 system 消息尾部
                    chat[0].mes = (chat[0].mes || '') + injection;
                }
            }""",
    """            const injection = await plugin.engine.onBeforeGeneration();
            // [v3.2] DF6: 空召回=显式清除；卷摘要独立刷新
            const okInj = writeInjectSlot('lonsha_memory', injection || '', Math.min(2, Math.max(0, Number(plugin.engine.config.config.injectionDepth) || 0)));
            if (okInj) {
                try { writeInjectSlot('lonsha_memory_history', plugin.engine.buildVolumeInjection() || '', 9999); } catch (e) { errLog(e, 'DF6.interceptor卷摘要'); }
            } else if (injection && Array.isArray(chat) && chat.length > 0 && chat[0]) {
                // 降级：注入到 system 消息尾部（仅通道不可用且有内容时）
                chat[0].mes = (chat[0].mes || '') + injection;
            }""",
    'DF6-2 interceptor空清除')

open(PATH, 'w', encoding='utf-8').write(src)
print('\n全部通过。写入 index.js')