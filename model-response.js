/**
 * model-response.js — [v3.102 缝合] LLM 响应协议归一化引擎
 *
 * 【来源】缝合 m61-oss/st-bionic-memory（BME）agent/model-protocol.js，
 *         按本插件工程规范重写为可测纯函数 IIFE 模块，保留完整语义、非照抄。
 *
 * 【机制】上游 LLM 网关的响应形状并不统一：
 *   - content 可能是字符串，也可能是分片数组 [{type:'text',text}] / [{content}]
 *   - tool call 可能在 response.tool_calls（OpenAI 蛇形）或 response.toolCalls（SDK 驼形）
 *   - 单条 tool call 可能在 {function:{name,arguments}} 包一层，也可能平铺在顶层
 *   - 同一响应内重复 tool call id 说明网关串包，必须拒绝而非静默覆盖
 *   - finish_reason 是判断「输出被 max_tokens 截断」（length）的唯一可靠信号
 *
 * 归一化后得到单一内部形状 { content, toolCalls, finishReason, reasoningContent,
 * usage, raw }，下游只认这一种形状。
 *
 * 【与源码差异】
 *   - 源码依赖 domain/memory-id（cloneDomainValue / hashDomainValue / stableStringify），
 *     本实现内置稳定序列化与 FNV-1a 指纹，零依赖自包含。
 *   - 增加 wasTruncated()：把 finish_reason=length 显式建模为可判定谓词，
 *     供调用方在截断时切换到宽松 JSON 恢复路径（配合 loose-json.js）。
 *   - 增加 toToolMessage()/toAssistantMessage() 的 OpenAI 线上形状输出。
 */
(function (global) {
    'use strict';

    /** 稳定序列化：对象键每层字典序排序（同语义 → 同字节，供 tool call id 指纹） */
    function stableStringify(value) {
        if (value === null || typeof value !== 'object') {
            if (typeof value === 'bigint') return JSON.stringify(String(value));
            const s = JSON.stringify(value);
            return s === undefined ? 'null' : s;
        }
        if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
        const entries = Object.keys(value).sort()
            .filter(k => value[k] !== undefined)
            .map(k => JSON.stringify(k) + ':' + stableStringify(value[k]));
        return '{' + entries.join(',') + '}';
    }

    /** FNV-1a 32bit 指纹（8 位十六进制，稳定无依赖） */
    function fnv1a(str) {
        let h = 0x811c9dc5;
        const s = String(str);
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return ('0000000' + h.toString(16)).slice(-8);
    }

    /**
     * content 归一化：字符串直通；分片数组拼接（支持 'str' | {text} | {content}）；
     * 其余形状（含 null/undefined/数字）→ ''。
     */
    function normalizeContent(value) {
        if (typeof value === 'string') return value;
        if (!Array.isArray(value)) return '';
        return value.map(part => {
            if (typeof part === 'string') return part;
            if (part && typeof part === 'object') {
                if (typeof part.text === 'string') return part.text;
                if (typeof part.content === 'string') return part.content;
            }
            return '';
        }).join('');
    }

    /**
     * 单条 tool call 归一化。
     * 兼容 {function:{name,arguments}} 与平铺 {name,arguments} 两种形状。
     * @throws {Error} 缺少 name
     */
    function normalizeToolCall(toolCall, index) {
        const tc = toolCall || {};
        const fn = tc.function && typeof tc.function === 'object' ? tc.function : tc;
        const name = String(fn.name || tc.name || '').trim();
        if (!name) throw new Error('model returned a tool call without a name');
        const rawArguments = fn.arguments !== undefined ? fn.arguments
            : (tc.arguments !== undefined ? tc.arguments : '{}');
        const argumentsText = typeof rawArguments === 'string'
            ? rawArguments
            : stableStringify(rawArguments);
        const id = String(tc.id || '').trim()
            || ('call_' + index + '_' + fnv1a(stableStringify({ name, arguments: argumentsText })));
        return {
            id,
            type: 'function',
            name,
            arguments: argumentsText || '{}',
            function: { name, arguments: argumentsText || '{}' },
        };
    }

    /**
     * 模型响应归一化。
     * @throws {Error} 重复 tool call id / content 与 tool call 双空
     */
    function normalizeModelResponse(response) {
        const r = response || {};
        const content = normalizeContent(r.content);
        const source = Array.isArray(r.toolCalls) ? r.toolCalls
            : (Array.isArray(r.tool_calls) ? r.tool_calls : []);
        const toolCalls = source.map((tc, i) => normalizeToolCall(tc, i));
        const ids = new Set();
        for (const tc of toolCalls) {
            if (ids.has(tc.id)) throw new Error('model returned duplicate tool call id: ' + tc.id);
            ids.add(tc.id);
        }
        if (!content.trim() && toolCalls.length === 0) {
            throw new Error('model returned neither content nor tool calls');
        }
        return {
            content,
            toolCalls,
            finishReason: String(r.finishReason || r.finish_reason || ''),
            reasoningContent: String(r.reasoningContent || r.reasoning_content || ''),
            usage: r.usage === undefined ? null : r.usage,
            raw: r.raw,
        };
    }

    /**
     * 截断判定：finish_reason 为 length / max_tokens / max_output_tokens。
     * 接受归一化后的响应，也接受原始响应对象（内部自动归一化兜底）。
     */
    function wasTruncated(responseOrNormalized) {
        let fr = '';
        const x = responseOrNormalized || {};
        if (typeof x.finishReason === 'string' || typeof x.finish_reason === 'string') {
            fr = String(x.finishReason || x.finish_reason || '').toLowerCase();
        }
        return fr === 'length' || fr === 'max_tokens' || fr === 'max_output_tokens';
    }

    /** 归一化结果 → OpenAI assistant 消息（无 tool call 时不带 tool_calls 字段） */
    function toAssistantMessage(responseOrNormalized) {
        const n = (responseOrNormalized && Array.isArray(responseOrNormalized.toolCalls))
            ? responseOrNormalized
            : normalizeModelResponse(responseOrNormalized);
        const message = { role: 'assistant', content: n.content };
        if (n.toolCalls.length > 0) {
            message.tool_calls = n.toolCalls.map(tc => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.name, arguments: tc.arguments },
            }));
        }
        return { response: n, message };
    }

    /** 工具执行结果 → OpenAI tool 消息 */
    function toToolMessage(toolCall, result) {
        const tc = toolCall || {};
        return {
            role: 'tool',
            tool_call_id: String(tc.id || ''),
            name: String(tc.name || (tc.function && tc.function.name) || ''),
            content: String((result && result.content != null) ? result.content : ''),
        };
    }

    const api = {
        stableStringify,
        fnv1a,
        normalizeContent,
        normalizeToolCall,
        normalizeModelResponse,
        wasTruncated,
        toAssistantMessage,
        toToolMessage,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaModelResponse = api;
})(typeof window !== 'undefined' ? window : globalThis);
