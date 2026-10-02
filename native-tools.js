(function (global) {
    'use strict';
/**
 * native-tools.js — [v3.260.0 缝合] 原生函数调用协议：工具定义 / 响应累积 / 消息锚定
 *
 * 【来源】缝合 AlbusKen/shujuku（数剧）src/service/ai/native-tool.ts，
 *         按本插件工程规范重写为经典脚本 IIFE 模块（双导出），保留完整解析语义。
 *
 * 【为什么需要这一面】
 *   此前本插件的内部模型调用只取「文本正文」，协议层（工具调用）的地基其实已在
 *   model-response.js 里备好（normalizeModelResponse / toAssistantMessage / toToolMessage），
 *   缺的是三样东西：① 本插件自有工具的定义；② 把 OpenAI / Anthropic / Gemini 三种
 *   SSE 与 JSON 回包累积成一轮「内容 + 工具调用」的读取器；③ 把工具回执回灌时的消息
 *   锚定——酒馆会把连续的 assistant 消息并成前一条并丢掉后者的 tool_calls，
 *   随后原生协议就会报 "tool result's tool id not found"。
 *
 * 【三条关键纪律（与源码逐字同构）】
 *   1. 原生调用的协议边界：不从 assistant.content 里猜工具动作。参数先按 JSON 解析、
 *      校验为对象、拒绝文本协议的 `action` 字段，再交给领域分发器。
 *   2. 工具调用 ID 去重：同一轮里 id 重复视作协议错误直接抛。
 *   3. 消息锚定幂等：连续 assistant 合并时保留全部编号；无编号的 tool 回执补回
 *      所属 assistant 的 tool_calls（补一条占位），不改写任何既有编号。
 *
 * 【与源码差异】
 *   - TS 类型与 _ACU 后缀按本仓经典脚本惯例去除；
 *   - 工具目录由 shujuku 的 7 个资料工具改为本插件 3 个记忆工具
 *     （search_memory / write_memory / vector_search），描述改口径、结构同构；
 *   - 保留 OpenAI / Anthropic / Gemini 三形态累积器与 SSE 解析（readChatTurn 同时
 *     处理非流式 JSON 与流式 text/event-stream 两种回包，对齐源码 readFetchChatTurn）；
 *   - 本模块不做 HTTP，只做协议：取数与发请求由调用方（index.js）负责。
 *
 * 挂 window.LonShaNativeTools，双导出（对齐 memory-books / pristine-fetch 约定）。
 */

    /** 本插件对外暴露给模型的工具名（冻结面，判据 A 段据此断言）。 */
    var MEMORY_TOOL_NAMES = ['search_memory', 'write_memory', 'vector_search'];

    /** 原生工具请求的尾部预填充：让模型先写思维链，再调用函数或输出最终文本。 */
    var TOOL_THINK_PREFILL = ' thinking\n';

    /** 提示词末尾的用户消息；内部 role 字段是要求原样保留的文本，不是消息身份。 */
    var USER_PREFILL_CONTENT = '{\n'
        + '    "role": "assistant",\n'
        + '    "content": "<thinking>我已经完成了思考。\\n</thinking>"\n'
        + '},\n'
        + '{\n'
        + '    "role": "assistant",\n'
        + '    "content": "<thinking>让我开始我的任务。\\n</thinking>"\n'
        + '}';

    /** 三个记忆工具的定义（OpenAI function 形态；写库口与真实消费方一一对应）。 */
    var MEMORY_TOOL_DEFINITIONS = [
        {
            type: 'function',
            function: {
                name: 'search_memory',
                description: '按关键词检索历史记忆（BM25 分支检索 + 断崖截断）。何时使用：知道要找什么但还拿不到条目正文，'
                    + '例如要确认某个地名/物件/人物此前是否出现、出现在哪一楼的摘要里。query 用短关键词或人名，不要贴整段正文。'
                    + '可选 topK（1 到 20）。范例：{"query":"寄存武器","topK":5}。命中后再按需要精读或直接使用结果。',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: '关键词或人名。' },
                        topK: { type: 'integer', minimum: 1, maximum: 20, description: '返回条数，默认 5。' },
                    },
                    required: ['query'],
                    additionalProperties: false,
                },
            },
        },
        {
            type: 'function',
            function: {
                name: 'write_memory',
                description: '把一条事实写成指定楼层的显式摘要（幂等：同楼层已有摘要则拒绝写入）。何时使用：本轮产生了值得长期保留的'
                    + '状态变化，而自动提取还没落笔。floor 是对话楼层号，text 是要保留的事实（≤2000 字），storyTime 可选。'
                    + '范例：{"floor":128,"text":"主角把寄存的短刀交给守门人保管","storyTime":"第三日 黄昏"}。'
                    + '写入前请确认楼层正确，本工具不覆盖已有摘要。',
                parameters: {
                    type: 'object',
                    properties: {
                        floor: { type: 'integer', minimum: 0, description: '对话楼层号。' },
                        text: { type: 'string', description: '要保留的事实，≤2000 字。' },
                        storyTime: { type: 'string', description: '可选剧情时间标签。' },
                    },
                    required: ['floor', 'text'],
                    additionalProperties: false,
                },
            },
        },
        {
            type: 'function',
            function: {
                name: 'vector_search',
                description: '按语义相似度检索向量库（需要 Embedding API）。何时使用：只知道大致意思、没有准确关键词，'
                    + '例如「和守门人的约定」这类语义查询。query 是要检索的自然语言，可选 topK（1 到 20）。'
                    + '注意：向量库为空或未启用时返回空数组，此时改用 search_memory。',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: '自然语言查询。' },
                        topK: { type: 'integer', minimum: 1, maximum: 20, description: '返回条数，默认 5。' },
                    },
                    required: ['query'],
                    additionalProperties: false,
                },
            },
        },
    ];

    function endsWith(text, suffix) {
        return text.length >= suffix.length && text.slice(text.length - suffix.length) === suffix;
    }

    function shallowCopy(source) {
        var out = {};
        for (var key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
        }
        return out;
    }

    /** 单条工具调用的归一化：id 与函数名都非空才收下，否则丢弃（对齐源码 normalizeStoredToolCall）。 */
    function normalizeStoredToolCall(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        var id = typeof raw.id === 'string' ? raw.id.trim() : '';
        var name = typeof raw.name === 'string' ? raw.name.trim() : '';
        if (!id || !name) return null;
        var args = typeof raw.arguments === 'string'
            ? raw.arguments
            : JSON.stringify(raw.arguments === undefined ? {} : raw.arguments);
        return { id: id, name: name, arguments: args };
    }

    /** 把「模型回复」归一成 { content, toolCalls }：字符串直接当正文，对象读 toolCalls 数组。 */
    function normalizeModelReply(raw) {
        if (typeof raw === 'string' || raw === null || raw === undefined) {
            return { content: String(raw === null || raw === undefined ? '' : raw), toolCalls: [] };
        }
        if (typeof raw === 'object' && !Array.isArray(raw)) {
            var calls = Array.isArray(raw.toolCalls)
                ? raw.toolCalls.map(normalizeStoredToolCall).filter(function (c) { return !!c; })
                : [];
            return { content: typeof raw.content === 'string' ? raw.content : '', toolCalls: calls };
        }
        return { content: String(raw), toolCalls: [] };
    }

    /**
     * 原生调用的协议边界：不从 assistant.content 猜工具动作，参数先验证再交领域分发器。
     * 任一调用 id/函数名为空、id 重复、参数非 JSON 对象、或携带文本协议 action 字段 → 抛。
     */
    function toolArguments(calls) {
        var seen = {};
        return (Array.isArray(calls) ? calls : []).map(function (call) {
            var id = String((call && call.id) || '').trim();
            var name = String((call && call.name) || '').trim();
            if (!id || !name || seen[id]) throw new Error('原生工具调用 ID 或函数名无效、或 ID 重复');
            seen[id] = true;
            var args = JSON.parse((call && call.arguments) || '{}');
            if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('工具 ' + name + ' 的参数必须是 JSON 对象');
            if ('action' in args) throw new Error('工具 ' + name + ' 的参数不得包含文本协议 action');
            var payload = shallowCopy(args);
            payload.action = name;
            return { call: call, payload: payload };
        });
    }

    /** 工具回执消息序列：一条 assistant（带全部 tool_calls）+ 每个调用一条 role=tool 结果。 */
    function toolMessagesFromCalls(content, calls, results) {
        var list = Array.isArray(calls) ? calls : [];
        var out = [{
            role: 'assistant',
            content: content,
            tool_calls: list.map(function (call) {
                return { id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } };
            }),
        }];
        list.forEach(function (call, index) {
            var hit = results && results[index];
            out.push({
                role: 'tool',
                tool_call_id: call.id,
                content: (hit === undefined || hit === null) ? '工具未返回对应结果' : String(hit),
            });
        });
        return out;
    }

    /** 转 OpenAI wire 形态的 tool_calls（独立导出，供外部构造请求体时复用）。 */
    function openAiToolCalls(calls) {
        return (Array.isArray(calls) ? calls : []).map(function (call) {
            return { id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } };
        });
    }

    /** 未完成的 JSON 预填充 stub（它会让后续带 tool_calls 的 assistant 被并掉、编号丢失）。 */
    function isJsonPrefillStub(content) {
        var trimmed = String(content === null || content === undefined ? '' : content).trim();
        return trimmed === '{'
            || trimmed.indexOf('<continue>') !== -1
            || endsWith(trimmed, '{\n  "thought": "')
            || endsWith(trimmed, '{\n  "summary": "')
            || endsWith(trimmed, '{\n  "verdict": "')
            || endsWith(trimmed, '{\n  "instruction": "');
    }

    /** 去掉未完成的 JSON 预填充（只按 stub 内容判定，不改写其它消息）。 */
    function dropTerminalJsonPrefill(messages) {
        return (Array.isArray(messages) ? messages : []).filter(function (message) {
            return !(message && message.role === 'assistant' && isJsonPrefillStub(message.content));
        });
    }

    /** 思维链预填充 stub 判定。 */
    function isThinkPrefillStub(content) {
        return String(content === null || content === undefined ? '' : content).trim() === ' thinking';
    }

    /**
     * 酒馆会把连续的 assistant 并成前一条，后一条的 tool_calls 被丢掉。
     * 先自己并成一条并保留全部编号，再给缺少编号的工具结果补上对应 tool_call，
     * 否则上游会报 tool result's tool id not found。
     */
    function anchorToolCalls(messages) {
        var source = Array.isArray(messages) ? messages : [];
        var collapsed = [];
        for (var i = 0; i < source.length; i++) {
            var message = source[i];
            var previous = collapsed[collapsed.length - 1];
            if (previous && previous.role === 'assistant' && message.role === 'assistant') {
                var toolCalls = (previous.tool_calls || []).concat(message.tool_calls || []);
                var merged = shallowCopy(previous);
                merged.content = [previous.content, message.content]
                    .filter(function (part) { return part && String(part).trim(); })
                    .join('\n\n');
                if (toolCalls.length) merged.tool_calls = toolCalls;
                else delete merged.tool_calls;
                collapsed[collapsed.length - 1] = merged;
                continue;
            }
            collapsed.push(shallowCopy(message));
        }
        var assistant = null;
        for (var j = 0; j < collapsed.length; j++) {
            var current = collapsed[j];
            if (current.role === 'assistant') assistant = current;
            if (current.role !== 'tool' || !current.tool_call_id || !assistant) continue;
            var has = (assistant.tool_calls || []).some(function (call) { return call.id === current.tool_call_id; });
            if (has) continue;
            assistant.tool_calls = (assistant.tool_calls || []).concat([{
                id: current.tool_call_id,
                type: 'function',
                function: { name: 'search_memory', arguments: '{}' },
            }]);
        }
        return collapsed;
    }

    /**
     * 去掉 JSON 预填充、锚定工具编号，并在请求最末补上思维链开头。
     * 思维链只能是最后一条：留在带 tool_calls 的 assistant 前面会被酒馆并掉、编号随之丢失。
     * 上一条已经是 assistant 时不再追加，避免再次并成一条。
     */
    function withThinkPrefill(messages) {
        var stripped = anchorToolCalls(dropTerminalJsonPrefill(messages).filter(function (message) {
            return !(message && message.role === 'assistant' && isThinkPrefillStub(message.content));
        }));
        var last = stripped[stripped.length - 1];
        if (!last || last.role === 'assistant' || (last.role === 'user' && last.content === USER_PREFILL_CONTENT)) return stripped;
        return stripped.concat([{ role: 'assistant', content: TOOL_THINK_PREFILL }]);
    }

    /**
     * assistant 之后必须有 user 或 tool 反馈。一个动作可以跟多条 tool 结果。
     * 纯 assistant/user 交替仍然合法。
     */
    function isModelExchangeSequence(messages) {
        if (!messages || !messages.length || messages[0].role !== 'assistant') return false;
        var feedback = 0;
        for (var i = 0; i < messages.length; i++) {
            var message = messages[i];
            if (message.role === 'assistant') {
                if (feedback === 0 && message !== messages[0]) return false;
                feedback = 0;
                continue;
            }
            if (message.role !== 'user' && message.role !== 'tool') return false;
            feedback += 1;
        }
        return feedback > 0;
    }

    /* ------------------------------------------------------------------ *
     * 响应累积：OpenAI / Anthropic / Gemini 三种回包形态归一到一轮 { content, toolCalls }
     * ------------------------------------------------------------------ */

    function createAccumulator() {
        return { content: '', calls: new Map(), usage: undefined };
    }

    function slot(state, index) {
        var existing = state.calls.get(index);
        if (existing) return existing;
        var created = { id: '', name: '', arguments: '' };
        state.calls.set(index, created);
        return created;
    }

    function rememberUsage(state, json) {
        if (json.usage && typeof json.usage === 'object') state.usage = json.usage;
        if (json.usageMetadata && typeof json.usageMetadata === 'object') state.usage = json.usageMetadata;
    }

    /** 把一个 SSE data 帧（或一个非流式 JSON 对象）吸进累积器。 */
    function absorbChatCompletionEvent(state, json) {
        if (!json || typeof json !== 'object' || Array.isArray(json)) return;
        rememberUsage(state, json);
        var choice = Array.isArray(json.choices) ? json.choices[0] : undefined;
        var delta = choice && choice.delta && typeof choice.delta === 'object' ? choice.delta : undefined;
        var message = choice && choice.message && typeof choice.message === 'object' ? choice.message : undefined;
        var packet = delta || message;
        if (packet && typeof packet.content === 'string') state.content += packet.content;
        if (packet && Array.isArray(packet.tool_calls)) {
            packet.tool_calls.forEach(function (raw, fallback) { absorbOpenAiToolCall(state, raw, fallback); });
        }
        if (json.type === 'content_block_delta' && json.delta && typeof json.delta === 'object') {
            var index = typeof json.index === 'number' ? json.index : 0;
            if (json.delta.type === 'text_delta' && typeof json.delta.text === 'string') state.content += json.delta.text;
            if (json.delta.type === 'input_json_delta' && typeof json.delta.partial_json === 'string') {
                slot(state, index).arguments += json.delta.partial_json;
            }
        }
        if (json.type === 'content_block_start' && json.content_block && typeof json.content_block === 'object') {
            var block = json.content_block;
            if (block.type === 'tool_use') {
                var startIndex = typeof json.index === 'number' ? json.index : state.calls.size;
                var current = slot(state, startIndex);
                if (typeof block.id === 'string') current.id = block.id;
                if (typeof block.name === 'string') current.name = block.name;
            }
        }
        var candidates = Array.isArray(json.candidates) ? json.candidates[0] : undefined;
        var parts = candidates && candidates.content && typeof candidates.content === 'object'
            ? candidates.content.parts : undefined;
        if (Array.isArray(parts)) {
            for (var i = 0; i < parts.length; i++) absorbGeminiPart(state, parts[i]);
        }
    }

    function absorbOpenAiToolCall(state, raw, fallback) {
        if (!raw || typeof raw !== 'object') return;
        var index = typeof raw.index === 'number' ? raw.index : fallback;
        var current = slot(state, index);
        if (typeof raw.id === 'string' && raw.id) current.id = raw.id;
        var fn = raw.function && typeof raw.function === 'object' ? raw.function : undefined;
        if (fn && typeof fn.name === 'string' && fn.name) current.name = current.name ? current.name : fn.name;
        if (fn && typeof fn.arguments === 'string') current.arguments += fn.arguments;
        else if (fn && fn.arguments && typeof fn.arguments === 'object') current.arguments = JSON.stringify(fn.arguments);
    }

    function absorbGeminiPart(state, raw) {
        if (!raw || typeof raw !== 'object') return;
        if (typeof raw.text === 'string' && raw.thought !== true) state.content += raw.text;
        var call = raw.functionCall;
        if (!call || typeof call !== 'object') return;
        var name = typeof call.name === 'string' ? call.name.slice(call.name.lastIndexOf(':') + 1) : '';
        var index = state.calls.size;
        var current = name ? slot(state, index) : (state.calls.get(state.calls.size - 1) || slot(state, index));
        if (name) current.name = name;
        if (typeof call.id === 'string' && call.id) current.id = call.id;
        if (typeof call.args === 'string') current.arguments += call.args;
        else if (call.args && typeof call.args === 'object') current.arguments = JSON.stringify(call.args);
    }

    /** 收尾：按 index 排序还原调用次序，空 id 补 call_N，无名则过滤。 */
    function finishChatTurn(state) {
        var entries = [];
        state.calls.forEach(function (call, index) { entries.push([index, call]); });
        entries.sort(function (left, right) { return left[0] - right[0]; });
        var toolCalls = entries.map(function (entry, index) {
            var call = entry[1];
            return {
                id: call.id || ('call_' + index),
                name: call.name,
                arguments: call.arguments || '{}',
            };
        }).filter(function (call) { return !!call.name; });
        return { content: state.content, toolCalls: toolCalls };
    }

    /** 非流式 JSON 对象 → 一轮。同时兼容「字符串回复」与「{content} 包装」两种退化形态。 */
    function chatTurnFromJson(data) {
        var state = createAccumulator();
        absorbChatCompletionEvent(state, data);
        if (typeof data === 'string') state.content = data;
        else if (data && typeof data === 'object' && typeof data.content === 'string' && !state.content) {
            state.content = data.content;
        }
        return { turn: finishChatTurn(state), usage: state.usage };
    }

    /**
     * 读一轮回复：非流式且非 text/event-stream → 直接 json()；否则按 SSE 逐行解析。
     * SSE 规则：只认 `data: ` 前缀；`[DONE]` 跳过；解析失败的半截帧留给下一行（buffer 不前进）。
     */
    function readChatTurn(response, streaming, signal) {
        var contentType = (response && response.headers && response.headers.get)
            ? (response.headers.get('content-type') || '') : '';
        if (!streaming && contentType.indexOf('text/event-stream') === -1) {
            return Promise.resolve(response.json()).then(function (data) { return chatTurnFromJson(data); });
        }
        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var state = createAccumulator();
        var buffer = '';
        var pump = function () {
            if (signal && signal.aborted) return Promise.reject(new Error('Request aborted'));
            return reader.read().then(function (chunk) {
                if (chunk.done) return null;
                buffer += decoder.decode(chunk.value, { stream: true });
                var lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i];
                    if (line.indexOf('data: ') !== 0) continue;
                    var data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try { absorbChatCompletionEvent(state, JSON.parse(data)); } catch (e) { /* 半截 SSE 留给下一行。 */ }
                }
                return pump();
            });
        };
        var release = function () { try { reader.releaseLock(); } catch (e) { /* 作罢 */ } };
        return pump().then(function () {
            release();
            return { turn: finishChatTurn(state), usage: state.usage };
        }, function (err) {
            release();
            throw err;
        });
    }

    var api = Object.freeze({
        MEMORY_TOOL_NAMES: MEMORY_TOOL_NAMES,
        MEMORY_TOOL_DEFINITIONS: MEMORY_TOOL_DEFINITIONS,
        TOOL_THINK_PREFILL: TOOL_THINK_PREFILL,
        USER_PREFILL_CONTENT: USER_PREFILL_CONTENT,
        normalizeStoredToolCall: normalizeStoredToolCall,
        normalizeModelReply: normalizeModelReply,
        toolArguments: toolArguments,
        toolMessagesFromCalls: toolMessagesFromCalls,
        openAiToolCalls: openAiToolCalls,
        isJsonPrefillStub: isJsonPrefillStub,
        dropTerminalJsonPrefill: dropTerminalJsonPrefill,
        isThinkPrefillStub: isThinkPrefillStub,
        anchorToolCalls: anchorToolCalls,
        withThinkPrefill: withThinkPrefill,
        isModelExchangeSequence: isModelExchangeSequence,
        createAccumulator: createAccumulator,
        absorbChatCompletionEvent: absorbChatCompletionEvent,
        finishChatTurn: finishChatTurn,
        chatTurnFromJson: chatTurnFromJson,
        readChatTurn: readChatTurn,
    });

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaNativeTools = api;
})(typeof window !== 'undefined' ? window : globalThis);