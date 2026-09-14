/**
 * text-chunk.js — [v3.95 缝合] 智能文本分块引擎
 *
 * 【来源】缝合 RaphllA/vectors-enhanced 的 splitTextIntoChunks 智能分块机制：
 *   长文本向量化/记忆入库前，按「语义边界」切成带重叠的块，避免硬切把句子/事件
 *   拦腰截断导致检索语义破碎。分块 + overlap 重叠滑动保证跨块上下文连续。
 *
 * 【工程化重写】（非照抄 1453 行 VectorizationProcessor，只取分块算法）：
 *   - 纯函数无 window 依赖，可测；IIFE + window + module 双导出（对齐四模块约定）。
 *   - 智能边界优先级：段落\n\n > 单换行 > 中英文句点(。？！.?!) > 空格词边界 > 硬切。
 *   - overlap 重叠滑动窗口（默认 10%），跨块保留上下文衔接。
 *   - 自定义分隔符优先（forceChunkDelimiter），长部分递归细分。
 *   - 中文适配：无空格时按标点/硬切，不依赖英文词边界。
 *
 * 挂 window.LonShaTextChunk，双导出。
 */
(function() {

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_OVERLAP_PERCENT = 10;

// 中英文句点集合（对齐 vectors-enhanced sentenceMarkers）
const SENTENCE_MARKERS = ['.', '?', '!', '。', '？', '！'];

/**
 * 智能分块（带自定义分隔符优先）。
 * @param {string} text
 * @param {number} chunkSize 单块目标字符数（默认 1000）
 * @param {number} overlapPercent 重叠百分比（默认 10）
 * @param {string|null} forceChunkDelimiter 自定义分隔符（优先按它切，长部分再细分）
 * @returns {string[]} 块数组
 */
function chunkText(text, chunkSize = DEFAULT_CHUNK_SIZE, overlapPercent = DEFAULT_OVERLAP_PERCENT, forceChunkDelimiter = null) {
    text = String(text ?? '');
    if (!text || text.length <= chunkSize) return text ? [text] : [];

    // 自定义分隔符优先：先按它粗切，超长部分递归细分
    if (forceChunkDelimiter && String(forceChunkDelimiter).trim()) {
        const parts = text.split(String(forceChunkDelimiter).trim());
        if (parts.length > 1) {
            const out = [];
            for (const part of parts) {
                if (part.length <= chunkSize) {
                    if (part.trim()) out.push(part.trim());
                } else {
                    out.push(...chunkWithoutDelimiter(part, chunkSize, overlapPercent));
                }
            }
            return out.filter(c => c.length > 0);
        }
    }
    return chunkWithoutDelimiter(text, chunkSize, overlapPercent);
}

/**
 * 智能边界分块（无分隔符）：按 段落 > 换行 > 句点 > 词边界 > 硬切 优先级切。
 * @param {string} text
 * @param {number} chunkSize
 * @param {number} overlapPercent
 * @returns {string[]}
 */
function chunkWithoutDelimiter(text, chunkSize = DEFAULT_CHUNK_SIZE, overlapPercent = DEFAULT_OVERLAP_PERCENT) {
    const chunks = [];
    const overlapSize = Math.max(0, Math.floor(chunkSize * overlapPercent / 100));
    let start = 0;
    let guard = 0; // 防死循环保险
    const maxIter = Math.ceil(text.length / Math.max(1, chunkSize - overlapSize)) + 8;

    while (start < text.length && guard++ < maxIter) {
        let end = start + chunkSize;
        if (end < text.length) {
            end = _findBoundary(text, start, end, chunkSize);
        }
        const chunk = text.slice(start, end).trim();
        if (chunk) chunks.push(chunk);
        // 重叠滑动：下一块起点回退 overlapSize
        const nextStart = end - overlapSize;
        // 防踏步：确保 start 严格前进
        start = Math.max(nextStart, start + 1);
    }
    return chunks;
}

/**
 * 在 [start, end) 区间内找最优切分点（语义边界），返回调整后的 end。
 * 优先级：段落\n\n > 单换行 > 中英文句点 > 空格词边界 > 硬切(原 end)。
 */
function _findBoundary(text, start, end, chunkSize) {
    // 段落边界（\n\n），需落在后半段（>50%）才采纳
    const dnl = text.lastIndexOf('\n\n', end);
    if (dnl > start + chunkSize * 0.5) return dnl + 2;
    // 单换行，需 >70%
    const nl = text.lastIndexOf('\n', end);
    if (nl > start + chunkSize * 0.7) return nl + 1;
    // 中英文句点，需 >70%，取最靠后者
    let best = -1;
    for (const marker of SENTENCE_MARKERS) {
        const idx = text.lastIndexOf(marker, end);
        if (idx > start + chunkSize * 0.7 && idx > best) best = idx;
    }
    if (best > -1) return best + 1;
    // 空格词边界（英文），需 >70%
    const sp = text.lastIndexOf(' ', end);
    if (sp > start + chunkSize * 0.7) return sp;
    // 硬切
    return end;
}

/**
 * 估算分块数量（不向量化，仅预览/预算用）。
 */
function estimateChunkCount(text, chunkSize = DEFAULT_CHUNK_SIZE, overlapPercent = DEFAULT_OVERLAP_PERCENT) {
    return chunkText(text, chunkSize, overlapPercent).length;
}

const api = { DEFAULT_CHUNK_SIZE, DEFAULT_OVERLAP_PERCENT, SENTENCE_MARKERS, chunkText, chunkWithoutDelimiter, estimateChunkCount };
if (typeof window !== 'undefined') window.LonShaTextChunk = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();