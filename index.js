(function() {
    'use strict';
    const PLUGIN_NAME = 'LonSha记忆引擎';
    const VERSION = '3.35.0';
    // [v3.1] SF1: 带超时+自动重试的 fetch（抄 baibai embed.ts——向量/LLM 上游常挂住不返回）
    // 分类重试：内部超时/网络异常/5xx/429 → 重试；4xx（鉴权/格式）→ 不重试直接返回交调用方
    async function fetchWithTimeoutRetry(url, init, opts) {
        const { timeoutSec = 30, retries = 2, label = 'API', externalSignal = null } = opts || {};
        const maxAttempts = Math.max(1, 1 + Math.max(0, retries));
        let lastErr = null;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // [v3.2] DF2: 外部已取消（用户中止生成）→ 立即抛出，绝不重试
            if (externalSignal?.aborted) throw new Error(`${label} 已取消(外部中止)`);
            const ctrl = new AbortController();
            let timedOut = false;
            const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, Math.max(1000, timeoutSec * 1000));
            if (externalSignal) {
                try { externalSignal.addEventListener('abort', () => { if (!timedOut) ctrl.abort(); }, { once: true }); } catch (e) {}
            }
            try {
                const resp = await fetch(url, { ...init, signal: ctrl.signal });
                clearTimeout(timer);
                if ((resp.status >= 500 || resp.status === 429) && attempt < maxAttempts - 1) {
                    lastErr = new Error(`${label} API ${resp.status}`);
                    await new Promise(r => setTimeout(r, 800));
                    continue;
                }
                return resp;
            } catch (err) {
                clearTimeout(timer);
                // [v3.2] DF2: 取消来源区分——外部中止(AbortError 且非内部超时)绝不重试；内部超时/网络异常照旧重试
                if (!timedOut && err?.name === 'AbortError' && externalSignal?.aborted) throw new Error(`${label} 已取消(外部中止)`);
                if ((timedOut || err?.name === 'TypeError') && attempt < maxAttempts - 1) {
                    lastErr = err;
                    await new Promise(r => setTimeout(r, 800));
                    continue;
                }
                throw (lastErr || err);
            }
        }
        throw (lastErr || new Error(`${label} 重试耗尽`));
    }

    // [v3.1] SF4: 角色名归一化（抄 yuzuki character-name-matcher——NFKC+空白折叠，防跨楼身份分裂）
    function normalizeCharName(name) {
        try {
            return String(name || '').normalize('NFKC').replace(/\s+/g, '').trim().toLowerCase();
        } catch (e) { errLog(e, 'SF4.normalizeCharName'); return String(name || ''); }
    }

    // [v3.2] DF5: 注入槽位唯一写入通道——修复 v2.8 起 setExtensionPrompt 参数错位 bug。
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

    // [v3.3] 台账重放化：楼层指纹（位置无关的消息身份）——编辑/swipe/删楼后对账用。
    // 范式: baibai 叶子 leafValid（失效≠删除）+ yuzuki getMessageSignature（role|swipe|hash|gen）。
    // 与楼层号解耦: 删楼后消息前移，指纹仍能重新定位（自愈）；翻 swipe 时 swipe 段变化（失活/复活）。
    function hash32(str) {
        let h = 0x811c9dc5;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
        return (h >>> 0).toString(16).padStart(8, '0');
    }
    function msgTextOf(m) {
        try {
            const sw = Math.max(0, Math.round(Number(m?.swipe_id) || 0));
            if (Array.isArray(m?.swipes) && typeof m.swipes[sw] === 'string') return m.swipes[sw];
            return String(m?.mes || m?.content || m?.text || '');
        } catch (e) { return ''; }
    }
    function msgFpOf(m) {
        try {
            return [(m?.is_user === true || m?.role === 'user') ? 'u' : 'a', Math.max(0, Math.round(Number(m?.swipe_id) || 0)), hash32(msgTextOf(m)), String(m?.send_date || m?.extra?.send_date || '')].join('|');
        } catch (e) { errLog(e, 'V33.msgFpOf'); return ''; }
    }

    // [v3.13] 思维链/正文分流（收编 zhino A5.2.1: 思维链泄漏进正文 23 条 → 0 条）
    // 剥离 <thinking>...</thinking>（含残缺变体），返回 {content, thinking}
    // - 完整标签: 成对剥离（支持嵌套配对）
    // - 闭标签缺失: 从开标签剥到文末（残缺思维链整段丢弃，防草稿泄漏）
    // - ``` 围栏内的开标签不剥（代码示例中的标签不是思维链）
    function extractThinkingChain(text) {
        try {
            let s = String(text || '');
            if (!s) return { content: '', thinking: '' };
            const thinkingParts = [];
            const fenceMask = [];
            // 先遮罩 ``` 围栏，防止剥掉代码示例里的 <thinking> 标签
            s = s.replace(/```[\s\S]*?```/g, (m) => { fenceMask.push(m); return '\u0000F' + (fenceMask.length - 1) + '\u0000'; });
            // 嵌套配对剥离: 遇开标签 depth+1，遇闭标签 depth-1，depth 归零时整段截出
            let out = '', depth = 0, buf = '';
            const tokens = s.split(/(<\/?thinking>)/i);
            for (const tk of tokens) {
                if (/^<thinking>$/i.test(tk)) { if (depth === 0) buf = ''; depth++; }
                else if (/^<\/thinking>$/i.test(tk)) {
                    depth--;
                    if (depth <= 0) { if (buf) thinkingParts.push(buf); buf = ''; depth = 0; }
                    else if (buf) { buf += tk; }
                }
                else if (depth > 0) { buf += tk; }
                else { out += tk; }
            }
            // 残缺: 有开无闭——buf 里是剥到文末的思维链，整段丢弃（不进正文）
            if (depth > 0 && buf) thinkingParts.push(buf);
            // 清理剥离后残留的空标签与多余空行，还原围栏
            out = out.replace(/<\/?thinking>/gi, '').replace(/\n{3,}/g, '\n\n').trim();
            out = out.replace(/\u0000F(\d+)\u0000/g, (_, i) => fenceMask[Number(i)] || '');
            return { content: out, thinking: thinkingParts.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
        } catch (e) { errLog(e, 'V313.extractThinkingChain'); return { content: String(text || ''), thinking: '' }; }
    }
    // [v3.13] 思维链投递头框定（抄 zhino 锚点构造——防草稿被下游当已发生事实）
    function thinkingAnchorHeader() {
        return '【思维链·场外信号（仅供检索参考，其中构思/模拟/内心独白段落尚未发生，严禁当作剧情事实写入摘要/时间线/图谱）】';
    }
    // [v3.27] <synopsis> 轻量提取（AnchorNote）: AI 回复已带 synopsis 标签时正则直取做摘要，省一次 LLM 调用
    const SYNOPSIS_BLOCK_RE = /(?:^|\n)\s*<synopsis\b[^>]*>\s*\n?([\s\S]*?)\n?\s*<\/synopsis>\s*(?=\n|$)/i;
    function extractSynopsisFast(text) {
        try {
            const s = String(text || '');
            const m = s.match(SYNOPSIS_BLOCK_RE);
            if (!m) return null;
            const content = String(m[1] || '').trim();
            if (!content || content.length < 12) return null;
            // 剥掉内层子标签（Nub/Title 等），只保留正文概括
            return content.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
        } catch (e) { return null; }
    }

    // [v3.33] AI 主动记忆操作符解析（st-memory-enhancement AI 编辑表格理念轻量版）：从回复原文提取 <field>/<todo>/<item> 标签并转为结构化操作，供后端 applyChanges/addTodos/itemOps 直接纳入。能力与主线 LLM 提取互补（主动写高置信覆盖，被动提取保底全量）
    function extractMemoryOpsFromText(text) {
        try {
            const out = { changes: [], todos: [], items: [] };
            const src = String(text || '');
            if (!src.includes('<')) return out;
            const re = /<(field|todo|item)\s*:\s*([^>]+?)>\s*/gi;
            let m;
            while ((m = re.exec(src)) && out.changes.length + out.todos.length + out.items.length < 30) {
                const kind = m[1].toLowerCase();
                const body = String(m[2] || '').trim();
                if (!body) continue;
                if (kind === 'field') {
                    // <field:角色.字段=值或增量>
                    const eq = body.indexOf('=');
                    if (eq < 1) continue;
                    const lhs = body.slice(0, eq).trim();
                    const val = body.slice(eq + 1).trim();
                    if (!val) continue;
                    const dot = lhs.indexOf('.');
                    if (dot < 1) continue;
                    const character = lhs.slice(0, dot).trim();
                    const field = lhs.slice(dot + 1).trim();
                    if (!character || !field) continue;
                    const chg = { character, field };
                    if (/^[+-]\d+([.]\d+)?$/.test(val)) chg.delta = Number(val);
                    else chg.value = val;
                    out.changes.push(chg);
                } else if (kind === 'todo') {
                    // <todo:角色.事项|日期>
                    const bar = body.indexOf('|');
                    const lhs = bar > 0 ? body.slice(0, bar) : body;
                    const dot = lhs.indexOf('.');
                    const character = (dot > 0 ? lhs.slice(0, dot) : lhs).trim();
                    const text = (dot > 0 ? lhs.slice(dot + 1) : '').trim();
                    const date = bar > 0 ? body.slice(bar + 1).trim() : '';
                    if (!character || !text) continue;
                    out.todos.push({ character, text, date });
                } else if (kind === 'item') {
                    // <item:取得=角色.物品名|描述> 或 <item:失去=角色.物品名>
                    const eq = body.indexOf('=');
                    if (eq < 1) continue;
                    const action = body.slice(0, eq).trim();
                    const rest = body.slice(eq + 1).trim();
                    const dot = rest.indexOf('.');
                    if (dot < 1) continue;
                    const holder = rest.slice(0, dot).trim();
                    const rest2 = rest.slice(dot + 1);
                    const bar = rest2.indexOf('|');
                    const name = (bar > 0 ? rest2.slice(0, bar) : rest2).trim();
                    const desc = bar > 0 ? rest2.slice(bar + 1).trim() : '';
                    if (!holder || !name) continue;
                    out.items.push({ action: action === '失去' ? 'update' : 'add', name, desc, holder, state: action === '失去' ? '丢失' : '' });
                }
            }
            return out;
        } catch (e) { return { changes: [], todos: [], items: [] }; }
    }
    // 移除回复中的 AI 记忆操作符标签（压缩为空，不污染对话道白）
    function stripMemoryOpsTags(text) {
        try { return String(text || '').replace(/<\/?(field|todo|item)\s*:[^>]*?>/gi, ''); }
        catch (e) { return text; }
    }

    // [v3.0] SD: 错误记录器——环形缓冲存最近50条，替代静默吞错。诊断面板读取展示。
    const _errBuf = [];
    // [v3.18] 错误提示规则库（shujuku: 43条→精简15条人话 + 通用兜底）
    const _ERROR_HINTS = [
        // [network] 网络/API
        { re: /Failed to fetch|NetworkError|network error|fetch failed|ECONNREFUSED|ENOTFOUND/i, hint: '网络不通：检查设备是否联网、地址是否正确。' },
        { re: /401|Unauthorized|invalid.*api.*key|api key.*invalid/i, hint: 'API Key 无效或过期：去设置→网络与API 检查 Key。' },
        { re: /403|Forbidden|permission denied/i, hint: '权限不足：API Key 可能无权限访问该模型/端点。' },
        { re: /429|Too Many Requests|rate limit|quota|insufficient_quota/i, hint: '触发限流/额度用完：稍等重试，或降低并发/调用频率。' },
        { re: /5\d\d|Internal Server Error|Bad Gateway|Service Unavailable/i, hint: 'API 服务器错误：通常是上游临时故障，稍后重试。' },
        { re: /timeout|timed out|ETIMEDOUT|aborted/i, hint: '请求超时：网络慢或模型响应慢，可加大超时时间。' },
        { re: /CORS|cross.origin|Access-Control-Allow/i, hint: '跨域受限：该 API 端点不支持浏览器跨域访问，需走代理。' },
        // [storage] 存储
        { re: /QuotaExceeded|quota exceeded|exceeded.*storage/i, hint: '浏览器存储空间已满：清理浏览器数据或减少记忆量。' },
        { re: /IndexedDB|indexedDB.*error|object store/i, hint: '本地数据库异常：可能是浏览器隐私模式或数据损坏，尝试恢复快照。' },
        // [parse] 解析/数据
        { re: /Unexpected token.*JSON|JSON\.parse|Unexpected end of JSON/i, hint: '模型返回的 JSON 损坏：插件已自动容错，可重试该楼提取。' },
        { re: /undefined is not|Cannot read propert|is not a function/i, hint: '内部数据缺失（常见于导入旧存档）：建议尝试快照恢复或重新导入。' },
        { re: /RangeError|Maximum call stack|out of memory/i, hint: '内存/栈溢出：记忆量过大，建议清空部分历史或减少注入预算。' },
        // [unknown] 未知兜底
    ];
    // [v3.18] JSON sanitizer（shujuku/baibai）: 全角引号归一 + 未转义引号修复
    function sanitizeJson(raw) {
        try {
            let s = String(raw || '').trim();
            if (!s) return s;
            // 全角引号/逗号/冒号 → 半角
            s = s.replace(/\u201c|\u201d|\u201e/g, '"').replace(/\uff0c/g, ',').replace(/\uff1a/g, ':');
            // 剥离 ```json 围栏
            s = s.replace(/^```json\s*/i, '').replace(/```\s*$/, '');
            // 未转义引号修复（状态机）：字符串内裸引号前补转义
            // （简单实现：只处理 JSON.parse 失败的常见情况——尾部逗号、单引号）
            s = s.replace(/,\s*([}\]])/g, '$1');   // 去尾逗号
            s = s.replace(/'/g, '"');                 // 单引号→双引号
            return s;
        } catch (e) { return String(raw || ''); }
    }
    function hintForError(err) {
        const msg = String(err?.message || err || '').slice(0, 200);
        for (const h of _ERROR_HINTS) if (h.re.test(msg)) return h.hint;
        return '未知错误：可复制上面的错误信息反馈给插件作者。';
    }
    // [v3.18] 错误提示规则库附加到 errLog 记录中
    function errLog(err, tag) {
        try {
            _errBuf.push({
                t: Date.now(),
                tag: String(tag || ''),
                msg: String(err?.message || err || ''),
                hint: hintForError(err),   // [v3.18] 人话提示（shujuku 错误规则库）
                stack: String(err?.stack || '').split('\n').slice(0, 3).join(' | ')
            });
            if (_errBuf.length > 50) _errBuf.shift();
            if (window.LonShaMemory?.engine?.config?.config?.debugMode) console.warn(`[${PLUGIN_NAME}][${tag}]`, err);
        } catch (e2) {}
    }
    
    class ConfigManager {
        constructor() {
            this.config = {
                enabled: true,
                extractionEnabled: true,
                vectorEnabled: true,
                graphDiffusionEnabled: true,
                autoSave: true,
                maxSummaryLength: 200,
                // [v3.14] 从世界书提取角色提示词（zhino 触发词优先思路）
                extractRolesLimit: 50,
                extractRolesPrompt: `你是角色名提取器。从下面世界书条目中提取【角色】及其别名。
规则：
1. 只提取明确是角色/人物的条目（含拟人化角色），跳过地点/物品/组织/概念类条目
2. 条目标题路径（title）和触发词（key）是最可靠的角色名来源，优先采用
3. 正文中的其他称呼、昵称、代号、外号可作别名（aliases），最多 8 个
4. 不要提取路人、一次性出场、纯背景板（宁可漏记也不多记）
5. 输出 JSON 数组：[{"name":"角色名","aliases":["别名1","别名2"]}]，仅输出 JSON，不要解释

世界书条目：
{{LORE}}

请提取最多 {{ROLE_COUNT}} 个角色。`,
                extractionPrompt: `你是剧情记忆整理员。阅读【本轮对话】，对照【已知角色名单】、【前情提要】与【悬念簿】，只提取明确发生的事实，禁止编造与推测。注意：思维链/内心独白中的构思草稿、模拟对话、心理预演均尚未发生，严禁当作剧情事实提取。
【已知角色名单】（提取角色必须复用这些主名；识别出别名/昵称/代称时，归并到对应主名）
{{KNOWN_CHARS}}
【前情提要】（此前剧情摘要，仅供理解上下文，禁止重复提取其中已记录的内容）
{{HISTORY}}
【悬念簿】（此前立下但尚未了结的约定/伏笔/未解之谜。若本轮有进展或了结，必须在 plans.resolve 中登记；禁止重复提取已了结项）
{{SUSPENSE}}
【已知场景树】（location/scenes.path 必须使用这些已登记路径，或在其下新增更细一层）
{{SCENES}}
【本轮对话】
{{CONTENT}}
【提取规则】
1. characters：本轮实际登场、有名有戏份的角色。必须使用已知角色名单中的主名（别名归并）；纯路人忽略；不要把用户本人算进去。
2. events：只写已发生的事实。涉及约定、承诺、冲突、物品交付、地点移动、关系变化时，写清具体内容，禁止泛化成"某物""发生变化"。每个事件标注 scope："objective"（公开事实，所有在场角色都知道）或 "pov"（仅某角色亲眼看到/独自知道的事实，此时必须给出 owner=该角色主名）。每个事件还要标注 importance（1-10，数字越大越重要：1-3日常琐事、4-6值得注意、7-8重大事件、9-10故事定义级）。
3. relationships：单向主观关系（from 看 to）。A看B 与 B看A 可能不同，分别各记一条。type 用简短词（如：暗恋、警惕、依赖、挚友、敌视）。attitude 只能填 positive / negative / neutral。
4. summary（最重要，必填）：用【监控摄像头视角】+【警察做笔录风格】重写本轮剧情，30-80字。必须包含：①谁对谁做了/说了什么（写具体动作或台词大意）②明确写出的状态变化③新信息或结果。时间锚定：保留具体人名、物品名、地点名。严禁照抄原文句子（必须用你自己的话重新组织）；严禁氛围描写（"气氛变得…"）和阅读理解句式（"体现了…的心态"）；严禁剧情续写（止步于原文最后一个动作）。纯叙述句，无 markdown。
5. story_date：本轮剧情中明确写出的日期（如"3月12日""2026年5月1日"）；未明确写出则填 null。禁止编造日期。
6. pov_memories：本轮产生的角色私密认知/秘密/内心独白（摄像头拍不到、仅该角色自己知道的内容）。每条必须给出 owner（哪个角色知道）和 content（一句话说清）。已在对话中公开说出口的内容不算。没有则填空数组。
7. plans：本轮剧情中【新出现】的约定、目标、伏笔或未解之谜。kind 填 "plan"（角色主动要做的事）或 "suspense"（埋下的谜团/伏笔）。content 一句话写清。contentIsNew 必须为 true。没有新悬念则填空数组。禁止把悬念簿里已有的悬项重复登记。
8. plans.resolve：本轮【了结】了悬念簿里的悬项时填写。id 必须使用【悬念簿】中列出的编号（如 s3）。outcome 填 "done"（真做成/真揭晓）或 "cancelled"（被取消/放弃/作废）或 "failed"（尝试了但失败/以坏结局收场）。reason 一句话写明怎么收场的。没有则填空数组。
9. scenes：本轮【新出现】或【描述变化】的地点。action 填 "add"（新地点）或 "update"（更新描述）。path 是由大到小的数组（如 ["城市","街区","店铺"]，最多3层，末级=具体场所）。没有则填空数组。
9b. items：本轮剧情中【明确出现实体流转】的物品。新增获得填 {"action":"add","name":"物品名","desc":"一句话描述","holder":"当前持有者角色名"}；位置/状态变化填 {"action":"update","name":"已有物品名","holder":"新持有者或空","state":"完好/损坏/丢失/使用完毕"}；禁止臆测没有依据的物品；没有则填空数组。\n10. location：本轮剧情结束时主角所在的场景完整路径（必须用已登记场景路径之一；移动了才填，没动填 null）。
9c. time_advance_days：本轮剧情结束时相对上一楼【跳过了几天】（如正文出现\"三天后\",\"次日\",\"一周后\"且未写出具体日期时，填天数3/1/7；日期明确写了具体年月日则填0；没有时间跳跃填 null）。禁止臆测。
11. 只输出一个 JSON 对象，不得输出解释或代码块围栏。字符串内含英文双引号时转义为 \\\"，中文引号直接用。
【输出格式】
{"characters": ["角色名"], "events": [{"type": "事件类型", "description": "描述", "scope": "objective", "owner": "", "importance": 5}], "relationships": [{"from": "A", "to": "B", "type": "关系", "attitude": "positive"}], "summary": "概括", "story_date": null, "pov_memories": [{"owner": "角色A", "content": "只有A知道的秘密"}], "status_changes": [{"character": "角色名", "field": "好感", "delta": 5, "value": null, "reason": "原因"}], "todos": [{"character": "角色名", "text": "待办事项", "date": "3月15日"}], "plans": [{"kind": "plan", "content": "新立下的约定或目标", "contentIsNew": true}], "plans_resolve": [{"id": "s3", "outcome": "done", "reason": "如何了结的"}], "scenes": [{"action": "add", "path": ["城市", "街区", "店铺"], "desc": "一句话描述"}], "time_advance_days": null, "items": [{"action": "add", "name": "物品名", "desc": "描述", "holder": "持有者", "state": ""}], "location": null}`,
                // [v2.2] RC: plans=本轮新出现的约定/伏笔/谜团（kind: plan|suspense），plans_resolve=了结悬念簿悬项（id用悬念簿编号，outcome: done|cancelled|failed）。无则空数组。
                // [v2.4] RE: scenes=新出现/变化地点（action add|update，path 由大到小数组）；location=本轮结束主角所在场景路径（未动填 null）；status_changes 里角色位置变化用 field:"位置"（value=场景末级名）。
                // [v2.0] status_changes: delta=数值增减(可负)，value=直接设绝对值，二选一；field 用简短中文（好感/疲劳/心情/健康/信任/金钱等）。todos: date 是剧情中明确出现的日期，无则空字符串。无变化填空数组。
                // [v2.0] status_changes: delta=数值增减(可负)，value=直接设绝对值，二选一；field 用简短中文（好感/疲劳/心情/健康/信任/金钱等）。todos: date 是剧情中明确出现的日期，无则空字符串。无变化填空数组。
                // [v1.4] 独立 API 配置（提取用 LLM + 向量用 Embedding）
                apiProviderCustom: false,       // false=跟随正文接口, true=用下方独立配置
                apiUrl: '',
                apiKey: '',
                apiModel: 'gpt-4o-mini',
                embeddingUrl: '',
                embeddingKey: '',
                embeddingModel: 'text-embedding-ada-002',
                vectorTopK: 5,
                hybridAlpha: 0.7,
                pageRankDamping: 0.85,
                dppLambda: 0.5,
                debugMode: false,
                // [v1.7] RubyPhone 双向联动
                rubyPhoneBridge: true,      // 回填: LLM 提取结果 → RubyPhone 手机记忆
                rubyPhoneRecall: true,      // 召回: RubyPhone 记忆库作为一路召回源
                rubyPhoneRecallTopN: 3,     // 每轮从手机记忆召回条数
                // [v1.8] P0: POV 认知边界 + 剧情时间线
                povIsolation: true,         // 角色私密记忆隔离（只注入当前登场角色的 POV）
                povMaxPerTurn: 3,           // 每轮最多注入的 POV 条数
                plotTimeline: true,         // 剧情时间线（按剧情日期整理摘要）
                timelineWindowDays: 3,      // 时间线召回时间窗（天）
                // [v1.9] P1: 层级摘要折叠 + BM25 稀疏检索
                summaryFoldEnabled: true,   // 摘要超阈值自动折叠成卷摘要
                summaryFoldThreshold: 30,   // 触发折叠的活跃摘要条数
                summaryFoldBatchSize: 20,   // 每批折叠条数
                bm25Enabled: true,          // BM25 稀疏检索（词频×逆文档频率）
                bm25TopK: 5,                // BM25 每轮召回条数
                // [v2.0] P2: 角色状态表 + 楼层账本
                characterStateEnabled: true,   // 角色数值状态追踪（好感/疲劳/心情等）
                todoTrackingEnabled: true,     // 待办事项追踪（带剧情日期，过期自动清理）
                todoExpiryMinutes: 60,         // 待办过期延迟（分钟）
                floorLedgerEnabled: true,      // 楼层账本（删楼/重生成自动回滚记忆）
                // [v2.1] P3: 互斥锁 + 上下文预算 + 节日感知
                extractionLockEnabled: true,   // 提取互斥（防并发写坏数据）
                injectionBudget: 3000,         // 注入简报字符预算（超预算自动裁剪）
                budgetStrategy: 'balanced',    // 预算策略: balanced | recency | relevance
                holidayAware: true,            // 节日感知（剧情日期临近节日时增强相关记忆）
                // [v2.2] RC: 悬念簿 + 相对时间
                suspenseEnabled: true,         // 悬念簿（约定/伏笔/未解之谜，三态了结防复读）
                suspenseMaxOpen: 20,           // 悬念簿在追踪上限（超出最旧的自动沉降）
                relativeTime: true,            // 剧情时间线注入加相对时间前缀（如"3天前·3月12日"）
                injectionDepth: 0,             // [v2.6] RG: 注入深度（0=D0紧邻最新输入；D1/D2 需 ST 核心支持，预留）
                // [v2.3] RD: rerank 精排（抄 baibai 两阶段检索）
                rerankEnabled: false,          // LLM 精排召回结果（需配独立API，延迟+费用换精度）
                rerankApiUrl: '',
                rerankApiKey: '',
                rerankModel: '',
                rerankCandidates: 12,          // 进入精排的候选数
                // [v2.4] RE: 场景树 + 在场分档 + 查询重写
                sceneEnabled: true,            // 场景地图树（由大到小路径层级，注入当前场景）
                presenceInjection: true,       // 不在场角色分档注入（防凭空出现）
                // [v3.16] zhino 三核心开关
                charMemEnabled: true,        // 角色记忆银行（两层记忆）
                neuralChainEnabled: true,    // 神经链召回（链1+链2）
                worldProgressEnabled: false, // 世界推进（默认关，需观察效果后开）
                worldProgressEveryFloors: 2,
                worldProgressMaxCandidates: 2,
                queryRewrite: false,           // 生成前用小模型重写检索查询（需API，提升召回命中）
                // [v2.5] RF: 回响池 + 活人感日记 + 每N楼提取 + 反思
                echoEnabled: true,             // 回响池（抄anima：召回过的记忆停留N轮防闪烁）
                echoBaseLife: 2,               // 常规召回停留轮数
                echoMaxCount: 10,              // 回响池容量
                livingDiary: true,             // 活人感日记（抄hcdiary：第一人称+secret+记忆回环）
                diaryEveryFloors: 3,           // 每N楼写一次日记（0=每楼）
                reflectionEnabled: false,      // 反思节点（抄stbme：洞察提炼，需API，默认关）
                reflectEveryFloors: 10,        // [v2.8] RT-B: 反思每N楼触发
                itemLedgerEnabled: true,       // [v2.8] RT-C: 物品台账（提取物品流转，抄yuzuki物品表）
                recallCacheEnabled: true,      // [v2.9] RU-D: swipe同楼重roll复用召回缓存
                heatOnRecallEnabled: true,     // [v3.31] 召回加热：被想起→activationCount+/lastActive 刷新（kiwi-mem 热度理念，接 decayScore 续命轴）
                // [v3.25] 召回类型分级（MemoryPilot）+ token 预算双层（记忆库v5）+ 归档隐藏（Bakemono共识）
                recallTierEnabled: true,       // 召回类型分级（常驻 constant / 触发 trigger，注入预算裁剪优先保常驻）
                memoryTokenBudget: 900,        // 记忆注入 token 预算（替代单层字符预算，按 token 剪裁）
                keepRecentTokenReserve: 0,     // 保留给最近正文的 token 预留（0=不预留；>0 时注入预算自动扣减）
                autoArchiveCovered: false,     // 归档隐藏已被卷摘要覆盖的旧楼层（默认关，防灾）
                archivePreserveRecent: 6,      // 归档时保留最近 N 个 AI 楼层不隐藏
                // [v3.27] 命中监控 + synopsis 轻量提取 + 触发词按需注入（MemoryPilot + AnchorNote）
                trailMonitor: true,             // 记录最近一次召回轨迹（settings-ui 状态面板展示）
                synopsisFastPath: true,         // AI 回复已含 <synopsis> 标签时正则直取（省 LLM 调用）
                // [v3.33] AI 主动记忆操作符（st-memory-enhancement AI 编辑表格理念的轻量版）：AI 在回复中写标签主动更新状态/待办/物品
                aiRecallOps: true,               // 总开关：允许 AI 用 <field>/<todo>/<item> 标签主动写记忆
                aiRecallOpsMaxPerFloor: 12,     // 每楼最多归入主动操作数
                aiRecallOpsDebug: false,        // 调试日志
                onDemandTriggerPhrase: '',      // 触发词按需注入长指令（空=关闭该功能；填「请生成锚点日记」等）
                // [v3.28] 三级金字塔 + 记忆树路由（st-memory-wizzard 本地轻量版）
                historicalFoldThreshold: 12,    // 卷摘要（周记）积累多少条后折叠成史记
                memoryTreeEnabled: false,       // 记忆树路由召回（本地轻量版，无需第二模型；默认关观察）
                vectorMaxCount: 500,           // [v2.9] RU-B: 向量硬上限
                summaryMaxCount: 400,          // [v2.9] RU-B: 摘要硬上限
                optimizeEveryFloors: 50,       // [v2.9] RU-B: 优化周期（楼）
                // [v3.30] PV: 记忆矛盾换代（supersede）——新记忆与旧记忆高置信冲突时旧条退出召回
                supersedeEnabled: true,          // 总开关
                supersedeScanPool: 30,           // 每次扫描池大小

            };
            this.loadConfig();
        }
        loadConfig() {
            try {
                const saved = localStorage.getItem('lonsha_memory_config');
                if (saved) this.config = {...this.config, ...JSON.parse(saved)};
                // [v1.6] 迁移摘要规则到笔录风格（治照抄）
                if (this.config.extractionPrompt?.includes('30-60字概括本轮剧情')) {
                    const defaults = new (this.constructor)().config;
                    this.config.extractionPrompt = defaults.extractionPrompt;
                    this.saveConfig();
                    console.log(`[${PLUGIN_NAME}] ✓ 摘要规则已升级到 v1.6 (笔录风格·治照抄)`);
                }
                // [v1.5] 迁移到三家融合版提示词（已知角色名单+前情提要+客观纪要规范）
                if (this.config.extractionPrompt && !this.config.extractionPrompt.includes('{{KNOWN_CHARS}}')) {
                    const defaults = new (this.constructor)().config;
                    this.config.extractionPrompt = defaults.extractionPrompt;
                    this.saveConfig();
                    console.log(`[${PLUGIN_NAME}] ✓ 提取提示词已升级到 v1.5 (已知角色名单+记忆回环+客观纪要)`);
                }
                // [v1.4.2] 迁移旧版提示词：summary 字段描述太弱导致 LLM 返回空摘要
                if (this.config.extractionPrompt?.includes('"summary": "摘要"')) {
                    this.config.extractionPrompt = this.config.extractionPrompt.replace(
                        '"summary": "摘要"',
                        '"summary": "用一句话概括这段对话发生了什么、角色间关系有何进展（30-60字，必须是你自己的概括，禁止照抄原文）"'
                    );
                    this.saveConfig();
                    console.log(`[${PLUGIN_NAME}] ✓ 提取提示词已自动升级 (summary 要求真概括)`);
                }
            } catch (e) { errLog(e, 'ConfigManager.loadConfig'); }
        }
        saveConfig() {
            try {
                localStorage.setItem('lonsha_memory_config', JSON.stringify(this.config));
            } catch (e) { errLog(e, 'ConfigManager.saveConfig'); }
        }
    }
    
    class LLMCaller {
        constructor(config) { this.config = config; }
        async callAPI(prompt) {
            try {
                const cfg = this.config.config;
                // [v1.4] 优先：独立 API（设置面板配置）
                if (cfg.apiProviderCustom && cfg.apiUrl && cfg.apiKey) {
                    const result = await this.callOpenAI(prompt, cfg.apiUrl, cfg.apiKey, cfg.apiModel);
                    if (result) return result;
                    console.warn(`[${PLUGIN_NAME}] 独立API调用失败，降级到宿主接口`);
                }
                // [v1.4.1 关键修复] generateQuietPrompt 只在 getContext() 上，不在 window！
                const ctx = window.SillyTavern?.getContext?.();
                const quiet = ctx?.generateQuietPrompt;
                if (typeof quiet === 'function') {
                    const result = await quiet({ quietPrompt: prompt, quietToLoud: false, skipWIAN: false });
                    if (result) return result;
                    // 兼容旧签名（位置参数）
                    return await quiet(prompt, false, false);
                }
                console.warn(`[${PLUGIN_NAME}] 宿主无 generateQuietPrompt，请在设置中配置独立API`);
                return null;
            } catch (err) {
                console.error(`[${PLUGIN_NAME}] API调用失败:`, err);
                return null;
            }
        }
        // [v2.4] RE: 查询重写（抄 baibai rewriteQuery——把最近剧情改写成检索意图，失败返回 null 降级）
        async rewriteQuery(recentText) {
            try {
                if (!this.config.config.queryRewrite) return null;
                const cfg = this.config.config;
                const prompt = `把下面的剧情进展改写成 1-3 条适合检索历史记忆的短查询（每条一行，只写关键人名/地点/物件/事件词，去掉口语与修饰）。只输出查询行，不要解释。\n${String(recentText || '').substring(0, 600)}`;
                let raw = null;
                if (cfg.apiProviderCustom && cfg.apiUrl && cfg.apiKey) {
                    raw = await this.callOpenAI(prompt, cfg.apiUrl, cfg.apiKey, cfg.apiModel);
                } else {
                    const ctx = window.SillyTavern?.getContext?.();
                    const quiet = ctx?.generateQuietPrompt;
                    if (typeof quiet !== 'function') return null;
                    raw = await quiet({ quietPrompt: prompt, quietToLoud: false, skipWIAN: false });
                    if (!raw) raw = await quiet(prompt, false, false);
                }
                if (!raw) return null;
                const lines = String(raw).split('\n').map(s => s.replace(/^[-•\d.、\s]+/, '').trim()).filter(s => s.length >= 2 && s.length <= 40).slice(0, 3);
                return lines.length ? lines : null;
            } catch (e) { return null; }
        }
        // [v2.3] RD: rerank 精排——小模型把候选按与查询的相关度重排。失败返回 null (调用方静默降级)
        async rerank(query, docs) {
            try {
                const cfg = this.config.config;
                const url = cfg.rerankApiUrl || cfg.apiUrl;
                const key = cfg.rerankApiKey || cfg.apiKey;
                const model = cfg.rerankModel || cfg.apiModel;
                if (!cfg.rerankEnabled || !url || !key) return null;
                const list = docs.map((d, i) => `[${i + 1}] ${(d.text || d.summary || d.name || '').substring(0, 150)}`).join('\n');
                const prompt = `你是检索精排器。给定【查询】和编号候选列表，按与查询的相关度从高到低输出候选编号。只输出JSON数组（如 ["3","1","7"]），不要解释。可以只输出明显相关的编号（无关的不要收录）。
【查询】${String(query || '').substring(0, 300)}
【候选】\n${list}`;
                let raw = null;
                if (cfg.apiProviderCustom && url && key) {
                    raw = await this.callOpenAI(prompt, url, key, model);
                } else {
                    const ctx = window.SillyTavern?.getContext?.();
                    const quiet = ctx?.generateQuietPrompt;
                    if (typeof quiet !== 'function') return null;
                    raw = await quiet({ quietPrompt: prompt, quietToLoud: false, skipWIAN: false });
                    if (!raw) raw = await quiet(prompt, false, false);
                }
                if (!raw) return null;
                const m = String(raw).match(/\[[\s\S]*?\]/);
                if (!m) return null;
                const order = JSON.parse(sanitizeJson(m[0]));
                if (!Array.isArray(order) || !order.length) return null;
                return order.map(x => Number(x) - 1).filter(i => i >= 0 && i < docs.length);
            } catch (e) { return null; }
        }
        // [v1.4.1] 抓取模型列表（OpenAI 兼容 /models 端点）
        async fetchModels(url, key) {
            let base = url.replace(/\/+$/, '');
            if (base.includes('/chat/completions')) base = base.replace(/\/chat\/completions$/, '');
            const endpoint = base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
            const res = await fetchWithTimeoutRetry(endpoint, { headers: { 'Authorization': `Bearer ${key}` } }, { timeoutSec: 15, retries: 1, label: '模型列表' });
            if (!res.ok) throw new Error(`模型列表 ${res.status}`);
            const data = await res.json();
            return (data.data || data.models || []).map(m => m.id || m.name).filter(Boolean).sort();
        }
        async callOpenAI(prompt, url, key, model) {
            // 端点归一化：兼容 base(https://x.com/v1) 和完整端点两种填法
            let endpoint = url.replace(/\/+$/, '');
            if (!endpoint.includes('/chat/completions')) {
                endpoint = endpoint.endsWith('/v1') ? endpoint + '/chat/completions' : endpoint + '/v1/chat/completions';
            }
            // [v3.1] SF1: 超时+分类重试（5xx/429/超时重试，4xx不重试）
            const res = await fetchWithTimeoutRetry(endpoint, {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`},
                body: JSON.stringify({model: model || 'gpt-4o-mini', messages: [{role: 'user', content: prompt}], temperature: 0.3, max_tokens: 1000})
            });
            if (!res.ok) throw new Error(`API ${res.status}: ${await res.text().catch(() => '')}`);
            const data = await res.json();
            return data.choices?.[0]?.message?.content || '';
        }
        async callGeneric(prompt, server) {
            const res = await fetchWithTimeoutRetry(`${server}/api/v1/generate`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({prompt, max_length: 500, temperature: 0.3})
            });
            const data = await res.json();
            return data.results?.[0]?.text || '';
        }
    }
    
    class VectorStore {
        constructor(config) {
            this.config = config;
            this.vectors = [];
            this.dimension = 1536;
        }
        
        async getEmbedding(text) {
            try {
                // [v1.4] 独立 Embedding 配置优先，Key 可回退到提取 Key
                const cfg = this.config.config;
                const api_key = cfg.embeddingKey || cfg.apiKey || localStorage.getItem('api_key_openai') || '';
                const api_base = (cfg.embeddingUrl || 'https://api.openai.com').replace(/\/+$/, '');
                
                if (!api_key) {
                    console.warn(`[${PLUGIN_NAME}] 无Embedding密钥，使用简化向量（可在设置中配置）`);
                    return this.simpleEmbedding(text);
                }
                
                const url = api_base.endsWith('/v1') ? `${api_base}/embeddings` : `${api_base}/v1/embeddings`;
                const res = await fetchWithTimeoutRetry(url, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${api_key}`},
                    body: JSON.stringify({model: this.config.config.embeddingModel, input: text})
                });
                
                const data = await res.json();
                if (data.error) {
                    console.warn(`[${PLUGIN_NAME}] Embedding API错误，降级`, data.error);
                    return this.simpleEmbedding(text);
                }
                
                return data.data?.[0]?.embedding || this.simpleEmbedding(text);
            } catch (err) {
                console.warn(`[${PLUGIN_NAME}] Embedding失败，降级:`, err);
                return this.simpleEmbedding(text);
            }
        }
        
        simpleEmbedding(text) {
            const vec = new Array(this.dimension).fill(0);
            for (let i = 0; i < text.length && i < this.dimension; i++) {
                vec[i % this.dimension] += text.charCodeAt(i) / 10000;
            }
            const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
            return vec.map(v => v / (norm || 1));
        }
        
        async addVector(text, metadata) {
            const embedding = await this.getEmbedding(text);
            const id = `vec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            this.vectors.push({id, text, embedding, metadata, timestamp: Date.now(), accessCount: 0, importance: metadata?.importance || 5});
            return id;
        }
        
        cosineSimilarity(vecA, vecB) {
            if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
            let dot = 0, normA = 0, normB = 0;
            for (let i = 0; i < vecA.length; i++) {
                dot += vecA[i] * vecB[i];
                normA += vecA[i] * vecA[i];
                normB += vecB[i] * vecB[i];
            }
            return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
        }
        
        // [v2.7] RS: 按楼层删除向量（rollbackFloor 联动，幂等）
        removeByFloor(floor) {
            const before = this.vectors.length;
            this.vectors = this.vectors.filter(v => v.metadata?.floor !== floor);
            return before - this.vectors.length;
        }

        async search(query, topK = 5) {
            if (this.vectors.length === 0) return [];
            const queryVec = await this.getEmbedding(query);
            const scored = this.vectors.map(v => ({
                ...v,
                score: this.cosineSimilarity(queryVec, v.embedding)
            }));
            scored.sort((a, b) => b.score - a.score);
            // [v3.1] SF3: 召回命中计数（遗忘价值公式的 accessFreq 输入）
            // [v3.31] 切分加热：被想起→激活次数+1 + lastActive 刷新（接 decayScore 的续命轴，打通 accessCount 与 activationCount 双字段）
            for (const v of scored.slice(0, topK)) {
                const src = this.vectors.find(x => x.id === v.id);
                if (src) this._heatEntry(src);
            }
            return scored.slice(0, topK);
        }
        // [v3.31] 单条记忆加热（kiwi-mem 记忆热度「被想起即升温」）：
        // 召回命中 → activationCount++（decayScore 公式的激活次数臂）+ lastActive=now（重置衰减轴=天然续命）
        // 设计点：VectorStore 条目同时承载 accessCount(遗忘价值) 与 activationCount(热度公式)，
        // 过去只有 accessCount 涨、activationCount 永不更新 → 衰减轴越走越老，「常被聊到」却热度不升。
        _heatEntry(v) {
            v.accessCount = (v.accessCount || 0) + 1;
            v.activationCount = (v.activationCount || 1) + 1;
            v.lastActive = Date.now();
            v.metadata = { ...(v.metadata || {}), accessCount: v.accessCount, activationCount: v.activationCount, lastActive: v.lastActive };
            return v;
        }
        // [v3.31] 按文本匹配加热（BM25/摘要碎片被想起但无独立 vector id 时按 text 回找）
        heatByText(text) {
            if (!text) return 0;
            let heated = 0;
            for (const v of this.vectors) {
                if (v.text && v.text === text) {
                    this._heatEntry(v);
                    heated++;
                }
            }
            return heated;
        }
        
        export() { return this.vectors.map(v => ({...v, embedding: Array.from(v.embedding)})); }
        import(data) {
            this.vectors = (data || []).map(v => ({...v, embedding: new Float32Array(v.embedding || [])}));
        }
    }
    
    // [v3.19] 周期调度纯函数（收编 RUBY scheduler.js）: 位置取模 + 多任务分发
    function cyclePositionFor(aiReplyCount, len) {
        if (!len || len <= 0 || aiReplyCount <= 0) return 0;
        return ((aiReplyCount - 1) % len) + 1;
    }
    function collectCycleTasks(tasks, position) {
        if (!position || position <= 0) return [];
        return (tasks || []).filter(t => t?.enabled && (t.cyclePositions || []).includes(position));
    }
    // [v3.23] 剧情时间约束解析（NE-Memory parseTimeConstraint 移植）
    // 从 recall 查询中解析出时间约束（Day X / 月 / ISO 日期 / 相对时间），
    // 供 timeline 召回前做时间过滤——"那天/周二/5月 发生了什么"这类查询也能命中时间线
    const TIME_WORDS_ZH = ['今天','昨天','明天','前天','上午','下午','晚上','早晨','凌晨','周一','周二','周三','周四','周五','周六','周日','一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月','天','周','月','年','小时','分钟','星期','礼拜'];
    function parseStoryTimeConstraint(query) {
        try {
            const q = String(query || '').trim();
            if (!q) return null;
            // 1. 剧情历 Day X - Day Y 范围（支持中文"到"）
            const dayRange = q.match(/Day\s*(\d+)\s*(?:[-–—]|to|到)\s*Day?\s*(\d+)/i);
            if (dayRange) return { type: 'narrative_range', from: 'Day ' + dayRange[1], to: 'Day ' + dayRange[2], period: 'Day ' + dayRange[1] + '-' + dayRange[2] };
            // 2. Day X
            const daySingle = q.match(/Day\s*(\d+)/i);
            if (daySingle) return { type: 'narrative', period: 'Day ' + daySingle[1] };
            // 3. ISO 日期 YYYY-MM / YYYY年M月
            const isoMatch = q.match(/\b(20\d{2})[-年](\d{1,2})\b/);
            if (isoMatch) return { type: 'absolute', period: isoMatch[1] + '-' + String(isoMatch[2]).padStart(2, '0'), month: parseInt(isoMatch[2]), year: parseInt(isoMatch[1]) };
            // 4. 中文相对时间
            if (/(昨天|前天)/.test(q)) return { type: 'relative', period: '昨天' };
            if (/今天|今天.+(？|\?)|今天.*(如何|怎样|怎样|发生了什么)/.test(q)) return { type: 'relative_today', period: '今天' };
            // 5. 中文月份
            const mMonth = q.match(/(上午|下午|晚上|早晨|凌晨)|(一月|二月|三月|四月|五月|六月|七月|八月|九月|十月|十一月|十二月)/);
            if (mMonth && mMonth[2]) {
                const cnMonths = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
                const mi = cnMonths.indexOf(mMonth[2]);
                // 归一为 absolute（月号约束），period 兼容中文月份过滤
                return { type: 'absolute', period: mMonth[2], month: mi + 1, year: null, cn: true };
            }
            return null;
        } catch (e) { return null; }
    }
    // 时间过滤（作用于 timeline 条目，按 date 匹配）
    function filterTimelineByConstraint(entries, c) {
        if (!c || !Array.isArray(entries) || !entries.length) return entries;
        const normD = (d) => String(d || '').replace(/\s+/g, '').replace(/[年月日]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        return entries.filter(e => {
            const raw = String(e.date || '');
            const ek = normD(raw);
            const normAbs = ek;   // 归一化绝对日期：2026-05-12 → 2026-05；5月3日 → 5-3
            if (!ek) return false;
            // 剧情历（Day N）判定：raw 含 Day（不区分大小写）
            const isDay = /^day\s*\d+/i.test(raw) || /^day\s*\d+/i.test(raw.trim());
            if (c.type === 'narrative' || c.type === 'narrative_range') {
                if (!isDay) return false;   // 剧情历约束只匹配剧情历日期
                const dm = raw.match(/day\s*(\d+)/i);
                if (!dm) return false;
                const dayNum = parseInt(dm[1]);
                if (c.type === 'narrative') {
                    const targetDay = parseInt(String(c.period).replace(/[^0-9]/g, ''));
                    return dayNum === targetDay;
                }
                const fromD = parseInt(String(c.from).replace(/[^0-9]/g, ''));
                const toD = parseInt(String(c.to).replace(/[^0-9]/g, ''));
                return dayNum >= fromD && dayNum <= toD;
            }
            if (c.type === 'absolute') {
                if (isDay) return false;    // 绝对月约束不匹配剧情历
                const period = c.period.replace(/^0(?=(\d{2})$)/, '');   // 2026-05 → 2026-5 也接受
                // 兼容 YYYY-MM（ISO）与 YYYY-M（中文）
                const yearMonth = normAbs.match(/^(20\d{2})-(\d{1,2})/);
                const wantYear = String(c.year || '');
                const wantMonth = String(c.month || '');
                if (yearMonth && wantYear) {
                    return yearMonth[1] === wantYear && parseInt(yearMonth[2]) === parseInt(wantMonth);
                }
                // 中文月份（5月3日 → 5-3）：匹配月份段
                if (wantMonth) {
                    const cnMonth = normAbs.match(/^(\d{1,2})-/);
                    return !!cnMonth && parseInt(cnMonth[1]) === parseInt(wantMonth);
                }
                return normAbs.indexOf(period) !== -1 || normAbs.indexOf(period.replace(/-0(\d)$/, '-$1')) !== -1;
            }
            if (c.type === 'relative') {
                if (isDay) return false;
                return normAbs.indexOf(normD(c.period)) !== -1;
            }
            return true;
        });
    }
    // [v3.19] 系统隐藏消息识别（ruby reader.js isSystemHiddenMsg）:
    // ST 安静生成的消息 is_system=true 但非 user 且非空 → 是 AI 回复（须计入楼层指纹/AI 楼层序数）
    function isSystemHiddenMsg(m) {
        if (!m) return false;
        if (m.is_system !== true) return false;
        if (m.is_user === true) return false;
        return !!(m.name && String(m.mes || '').trim().length > 0);
    }
    // [v3.19] 增量书签（ruby reader.js）: 按用途记录已读楼层，只增量读新楼
    // 存 chatMetadata.extensions.LonShaMemory.bookmarks（ST 原生元数据通道）
    // [v3.20] Ebbinghaus 衰减评分（收编 ruby-phone-work，移植自 sxiphone）
    // 综合: 重要性×激活次数^0.3×e^(-λ·天数)×情绪权重×强化保护
    // 特例: pinned=999, permanent>=100, feel>=50, resolved×0.05
    function decayScore(m, conf) {
        if (!m) return 0;
        const lambda = conf?.lambda || 0.03;
        const now = Date.now();
        const lastActive = m.lastActive ? (typeof m.lastActive === 'number' ? m.lastActive : new Date(m.lastActive).getTime()) : (m.ts || now);
        const days = (now - lastActive) / 86400000;
        const hours = (now - lastActive) / 3600000;
        const importance = (m.importance !== undefined && m.importance !== null) ? m.importance : (m._isCore ? 1 : 0.5);   // [v3.20] 修复 ?? 与 ?: 优先级
        const activation = m.activationCount || 1;
        const strength = m.memoryStrength ?? (m._isCore ? 0.8 : 0.4);
        const freshHalfLife = conf?.freshHalfLife || 48;
        const reinforcement = 1 + Math.min((m.reinforcementCount || 0) * 0.15, 1.5);
        const arousal = m.emotion?.arousal ?? 0.5;
        const emotionWeight = 1 + arousal * 0.8;
        const combined = days <= (conf?.shortTermDays || 7)
            ? Math.exp(-0.1 * days) * 0.7 + emotionWeight * 0.3
            : emotionWeight * 0.7 + Math.exp(-0.1 * days) * 0.3;
        const freshness = 1 + Math.exp(-hours / freshHalfLife);
        let score = Math.max(importance, 1) * Math.pow(activation, 0.3) * Math.exp(-lambda * Math.max(days, 0)) * combined * freshness * (0.5 + strength * 0.5) * reinforcement;
        if (m.resolved) score *= 0.05;
        if (m.pinned) score = 999;
        return score;
    }
    // [v3.20] Ebbinghaus 补充字段（addCore/addRecent 写入时初始化）
    function _initEbbingMeta(m) {
        if (!m.ts) m.ts = Date.now();
        if (m.lastActive === undefined) m.lastActive = m.ts;
        if (m.activationCount === undefined) m.activationCount = 1;
        if (m.importance === undefined) m.importance = 3;   // 1-5 默认3
        if (m.memoryStrength === undefined) m.memoryStrength = 0.5;
        if (m.reinforcementCount === undefined) m.reinforcementCount = 0;
        if (m.emotion === undefined) m.emotion = { valence: 0.5, arousal: 0.5 };
        return m;
    }

    class IncrementBookmark {
        constructor(engine) { this.engine = engine; this.NS = 'LonShaMemory'; }
        _store() {
            try {
                const ctx = window.SillyTavern?.getContext?.();
                const meta = ctx?.chatMetadata;
                if (!meta) return null;
                meta.extensions ??= {};
                meta.extensions[this.NS] ??= {};
                meta.extensions[this.NS].bookmarks ??= {};
                return meta.extensions[this.NS].bookmarks;
            } catch (e) { return null; }
        }
        get(key) { const s = this._store(); if (!s) return 0; const v = Number(s[key]); return Number.isFinite(v) && v > 0 ? v : 0; }
        save(key, ordinal) {
            const s = this._store();
            if (!s || !Number.isFinite(ordinal) || ordinal <= 0) return;
            s[key] = ordinal;
            try { window.SillyTavern?.getContext?.()?.saveMetadataDebounced?.(); } catch (e) {}
        }
        reset(key) { const s = this._store(); if (s) delete s[key]; }
        all() { const s = this._store(); return s ? { ...s } : {}; }
        // [v3.19] 删楼后书签重同步（ruby resyncBookmarksAfterDeletion）:
        // 删除使后续楼层序数前移，书签减去位于其前的被删楼层数；越界重置
        resyncAfterDeletion(deletedOldOrdinals, currentAiCount) {
            const s = this._store();
            if (!s || !deletedOldOrdinals?.length) return [];
            const changed = [];
            for (const [k, raw] of Object.entries(s)) {
                const b = Number(raw);
                if (!Number.isFinite(b) || b <= 0) continue;
                let next = b - deletedOldOrdinals.filter(d => d <= b).length;
                if (next > currentAiCount) next = 0;
                if (next !== b) { s[k] = next; changed.push(`${k} ${b}→${next}`); }
            }
            if (changed.length && window.SillyTavern?.getContext?.()?.saveMetadataDebounced) {
                try { window.SillyTavern.getContext().saveMetadataDebounced(); } catch (e) {}
            }
            return changed;
        }
    }

    // [v3.23] 跨调用去重状态（NE-Memory recall_memory lastRecallMsgIds）
    // 缓存上一次注入召回结果的追溯指纹, 下次注入时若候选已被上轮覆盖则附加 [DEDUP] 提示
    const _recallDedupState = { lastTexts: null, lastQuery: '', lastChatId: '' };
    function recallDedupMark(candidates, curChatId, curQuery) {
        try {
            const st = _recallDedupState;
            const chatChanged = curChatId && st.lastChatId && curChatId !== st.lastChatId;
            if (chatChanged) { st.lastTexts = null; st.lastQuery = ''; st.lastChatId = curChatId; return null; }
            if (!st.lastTexts || !Array.isArray(candidates)) return null;
            const usedSet = new Set(st.lastTexts);
            const marked = [];
            for (const c of candidates) {
                const key = String(c.text || c.summary || c.name || '');
                if (key && usedSet.has(key)) marked.push(c);
            }
            return marked.length ? marked : null;
        } catch (e) { return null; }
    }
    function recallDedupRemember(recalled) {
        try {
            if (!Array.isArray(recalled) || !recalled.length) return;
            _recallDedupState.lastTexts = recalled.map(r => String(r.text || r.summary || r.name || '')).filter(Boolean).slice(0, 12);
        } catch (e) {}
    }
    // [v3.23.1] 跨调用去重指纹重置（NE-Memory 补救）: 事件清理 _recallCache 时同步清空 dedup 指纹，
    // 防编辑/swipe/删楼后旧楼层文本残留导致新内容被误标"已覆盖"
    function resetRecallDedup() {
        try { _recallDedupState.lastTexts = null; _recallDedupState.lastQuery = ''; _recallDedupState.lastChatId = ''; } catch (e) {}
    }
    class MemoryEngine {
        constructor(config) {
            // [v3.23] chatMetadata 迁移恢复防重入（NE auto-restore）
            this._migrateRestored = false;
            // [v3.25] 图扩散不应期疲劳（TriviumDB Refractory Period）: Top-N 赢家打疲劳标, 下轮命中降权
            this._diffusionFatigue = new Map();   // { nodeId/name: fatigueCount }
            this._diffusionFatigueTopN = 5;
            this._diffusionFatigueTimeout = 3;    // 疲劳标记保留轮数（防永久封印）
            // [v3.25] 归档隐藏状态（Bakemono archive-controller）
            this._archivedFloorIds = new Set();   // 已被插件归档隐藏的楼层（可恢复）
            // [v3.27] 命中轨迹记录（MemoryPilot monitor）: 最近一次召回详情供面板诊断
            this._lastRecallTrace = null;   // { query, sources, hitCount, durationMs, ts, triggerHit }
            this.bookmarks = new IncrementBookmark(this);   // [v3.19] 增量书签（ruby）
            this.config = config;
            this.graph = new MemoryGraph();
            this.summary = new SummarySystem();
            this.diary = new DiarySystem();
            this.charMem = new CharacterMemoryBank();   // [v3.16] 角色记忆银行（核心/近期两层）
            this.worldProg = new WorldProgress();        // [v3.16] 世界推进（不在场角色）
            this.reflection = new ReflectionSystem();  // [v2.8] RT-B 反思系统
            this.items = { records: [] };               // [v2.8] RT-C 物品台账（派生缓存）
            this._lastStoryDate = null;                 // [v2.9] RU-A 主动时间推进的锚点
            this._recallCache = null;                   // [v2.9] RU-D swipe 召回缓存 {floor, queryKey, injection}
            this._generationActive = false;             // [v3.10] 生成中标志（GENERATION_STARTED→MESSAGE_RECEIVED 之间为 true；自愈调度器读它防并发）
            this.snapshots = new SnapshotManager();     // [v2.9] RU-C 存储快照
            this._lastKnownChatLen = 0;  // [v3.1] SF2 渲染切片保护基线
            this._lastOptimizeFloor = 0;                // [v2.9] RU-B 优化周期锚点
            this.itemOps = [];                          // 物品 ops 真源（楼层回滚用）
            this.vector = new VectorStore(config);
            this.storage = new StorageManager();
            this.llm = new LLMCaller(config);
            // [v1.8] P0
            this.pov = new PovMemory();
            this.timeline = new PlotTimeline();
            // [v1.9] P1
            this.bm25 = new BM25();
            // [v2.0] P2
            this.status = new CharacterState();
            this.ledger = new FloorLedger();
            // [v2.1] P3
            this.mutex = new Mutex();
            this.holiday = new HolidayAware();
            // [v2.2] RC
            this.suspense = new SuspenseBook();
            // [v2.4] RE
            this.scene = new SceneBook();
            // [v2.5] RF
            this.echo = new EchoPool();
            // [v3.30] PV: 记忆矛盾换代（window.LonShaSupersede）
            this.supersede = new (window.LonShaSupersede?.SupersedeManager || function() {
                this.supersededMap = {}; this.config = {};
                this.scan = () => []; this.isSuperseded = () => false;
                this.revive = () => 0; this.export = () => ({supersededMap:{}}); this.import = () => {};
            })();
        }
        
        // [v3.1] SF5: 番外楼判定（抄 baibai bbs_omit——标记楼对引擎彻底不存在）
        isOmittedFloor(message) {
            try {
                return message?.extra?.lonsha_omit === true;
            } catch (e) { errLog(e, 'SF5.isOmittedFloor'); return false; }
        }

        async onMessageReceived(message, messageId = null) {
            // [v3.10] 生成结束（新回复落层=本轮生成闭环），复位生成标志
            this._generationActive = false;
            if (!this.config.config.enabled) return;
            // [v3.1] SF5: 番外楼双保险（事件层已短路，这里防直接调用路径）
            if (this.isOmittedFloor(message)) { if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 楼层为番外楼，引擎跳过`); return; }
            // [v1.2 真机适配修复] ST 消息对象没有 index 字段，
            // 楼层号来自 eventSource 回调的 messageId
            message = { ...message, index: messageId ?? message.index ?? 0 };
            // [v1.4] 清洗正文：剥离 HTML注释/SDC标签/自定义标签，防止脏数据入库
            // [v3.13] 思维链/正文分流: 先剥 <thinking> 再清洗（zhino A5.2.1——思维链草稿不入正文/摘要/图谱）
            // 注意: thinking 存引擎信号队列而非 message.extra（message 是浅拷贝，extra 引用与原对象共享，直接写会污染 ST 真实消息）
            const _tc = extractThinkingChain(message.mes || message.content || '');
            // [v3.29] synopsis 快速路径需原始文本——cleanMessageText 会剥 <synopsis> 标签，故在清洗前快照原文
            const _rawForSynopsis = String(_tc.content || message.content || '');
            // [v3.33] AI 主动记忆操作符：从原文提取 <field>/<todo>/<item> 标签（清洗前，因为 cleanMessageText 会剥标签）
            const aiRecallOps = this.config.config.aiRecallOps ? extractMemoryOpsFromText(_rawForSynopsis) : null;
            if (aiRecallOps && (aiRecallOps.changes.length || aiRecallOps.todos.length || aiRecallOps.items.length)) {
                if (this.config.config.aiRecallOpsDebug) console.log(`[${PLUGIN_NAME}] 主动记忆操作: 字段${aiRecallOps.changes.length} 待办${aiRecallOps.todos.length} 物品${aiRecallOps.items.length} (楼层 ${message.index})`);
                _tc.content = stripMemoryOpsTags(_tc.content);
            }
            message.mes = this.cleanMessageText(_tc.content);
            if (_tc.thinking) {
                if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 思维链已分流 (楼层 ${message.index}, ${_tc.thinking.length} 字)`);
                try { this.feedThinking(_tc.thinking, message.index); } catch (e) { errLog(e, 'feedThinking'); }
            }
            if (!message.mes) { console.log(`[${PLUGIN_NAME}] 消息清洗后为空，跳过`); return; }
            console.log(`[${PLUGIN_NAME}] 处理新消息 (楼层 ${message.index})`);
            const chatId = this.getCurrentChatId();
            if (!chatId) return;
            // [v2.1] P3: 提取互斥（抄 hcdiary cdBusy——防并发提取写坏数据）
            if (this.config.config.extractionLockEnabled) {
                const acquired = await this.mutex.acquire();
                if (!acquired) {
                    // [v2.5] 修复: 原实现直接 return 丢消息；改为至少做摘要兜底，防该楼彻底无记忆
                    try {
                        const fallback = this.extractMemorySimple(message);
                        // [v3.8] 降级摘要不覆盖已有优质摘要（opts.degraded）
                        if (fallback?.summary) await this.summary.createSummary(message, fallback.summary, { degraded: true });
                        // [v3.10] 记录到待补集合：锁释放后（下一条消息处理完）由 CHAT 补提取
                        this._lockDegradePending = this._lockDegradePending || new Set();
                        this._lockDegradePending.add(message.index || 0);
                        console.warn(`[${PLUGIN_NAME}] 提取锁排队超时，已降级为本地摘要并排队补提取 (楼层 ${message.index})`);
                    } catch (e) { errLog(e, 'onMessageReceived.提取锁降级'); }
                    return;
                }
            }
            try {
                // [v3.27] <synopsis> 轻量提取快速路径（AnchorNote）: AI 自带 <synopsis> 标签时正则直取做 summary，省一次 LLM 调用
                // [v3.29] 用清洗前的原文检测（cleanMessageText 会剥 <synopsis> 标签导致快速路径失效）
                let extracted = null;
                if (this.config.config.synopsisFastPath) {
                    const synopsisText = extractSynopsisFast(_rawForSynopsis || message.mes || message.content || '');
                    if (synopsisText) {
                        extracted = { summary: synopsisText, characters: [], events: [], relationships: [] };
                        if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] <synopsis>快速路径: 楼层 ${message.index}`);
                    }
                }
                if (!extracted) extracted = await this.extractMemoryWithLLM(message);
                // [v3.33] AI 主动记忆操作 merged into extracted: high-confidence writes override/augment passive LLM extraction
                if (aiRecallOps && (aiRecallOps.changes.length || aiRecallOps.todos.length || aiRecallOps.items.length)) {
                    extracted = extracted || { characters: [], events: [], relationships: [], summary: "" };
                    extracted.status_changes = [...(extracted.status_changes || []), ...aiRecallOps.changes];
                    extracted.todos = [...(extracted.todos || []), ...aiRecallOps.todos];
                    extracted.items = [...(extracted.items || []), ...aiRecallOps.items];
                    // [v3.33] 每楼主动操作数上限（防 AI 滥用标签洪流）
                    const _cap = Number(this.config.config.aiRecallOpsMaxPerFloor) || 12;
                    if (extracted.status_changes.length > _cap) extracted.status_changes = extracted.status_changes.slice(-_cap);
                    if (extracted.todos.length > _cap) extracted.todos = extracted.todos.slice(-_cap);
                    if (extracted.items.length > _cap) extracted.items = extracted.items.slice(-_cap);
                }
                if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 提取:`, extracted);
                
                // [v1.7] RubyPhone 联动①: LLM 提取结果回填手机记忆库
                if (this.config.config.rubyPhoneBridge && extracted) {
                    try {
                        const bridge = window.VirtualPhone?.lonshaBridge;
                        if (bridge?.backfill) {
                            bridge.backfill(extracted);
                        } else if (window.VirtualPhone?.memoryCore) {
                            // 兜底: 桥未挂载时直接写入记忆库 (摘要→长期记忆)
                            const s = String(extracted.summary || '').trim();
                            if (s.length >= 15) window.VirtualPhone.memoryCore.record('ai', '[剧情] ' + s, {});
                        }
                    } catch (e) {
                        if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] RubyPhone回填失败:`, e);
                    }
                }
                
                const messageText = message.mes || '';
                
                if (extracted?.characters) {
                    // [v3.6] 图谱膨胀修复: 先查后建（原实现每楼新 id——同角色 N 楼 = N 个重复节点，长对话无限膨胀）
                    for (const char of extracted.characters) {
                        const canonical = this.resolveCharacterName(char);
                        this.graph.snapshotGraph(message.index);   // [v3.15] 图谱快照: 楼层起点
                        const existChar = this.graph.findCharacterByName(canonical);
                        if (existChar) {
                            // 已存在: 只补首次出现信息（不重复建；source 保留首次）
                            if (!existChar.data?.source && messageText) existChar.data = {...(existChar.data || {}), source: messageText};
                        } else {
                            this.graph.addNode({type: 'character', name: canonical, data: {source: messageText}});
                        }
                    }
                }
                
                if (extracted?.events) {
                    for (const event of extracted.events) {
                        const nodeId = this.graph.addNode({type: 'event', name: event.type, data: event});
                        if (event.participants) {
                            for (const p of event.participants) {
                                this.graph.addEdge({from: p, to: nodeId, label: 'participated_in'});
                            }
                        }
                    }
                }
                
                if (extracted?.relationships) {
                    for (const rel of extracted.relationships) {
                        // [v1.5] 单向主观关系：主名归并 + attitude 三值入边数据
                        this.graph.addEdge({
                            from: this.resolveCharacterName(rel.from),
                            to: this.resolveCharacterName(rel.to),
                            label: rel.type, weight: 1.0,
                            data: {attitude: rel.attitude || 'neutral', note: rel.note || ''}
                        });
                    }
                }
                
                // [v1.8] P0: 写入角色私密记忆（POV 隔离）
                if (this.config.config.povIsolation && Array.isArray(extracted?.pov_memories)) {
                    let povCount = 0;
                    for (const p of extracted.pov_memories) {
                        if (p?.owner && p?.content) {
                            const owner = this.resolveCharacterName(p.owner);
                            this.pov.add(owner, String(p.content).trim(), message.index || 0);
                            povCount++;
                        }
                    }
                    // 事件里标了 scope:pov 的也收进 POV 池
                    for (const ev of (extracted?.events || [])) {
                        if (ev?.scope === 'pov' && ev?.owner && ev?.description) {
                            this.pov.add(this.resolveCharacterName(ev.owner), String(ev.description).trim(), message.index || 0);
                            povCount++;
                        }
                    }
                    if (povCount && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] POV私密记忆 +${povCount}`);
                }
                // [v3.16] 角色记忆银行写入（收编 zhino 两层记忆）: 近期=每轮摘要; 核心=关系变化/约定/重大事件
                if (this.config.config.charMemEnabled && extracted) {
                    try {
                        const floor = message.index || 0;
                        // 近期记忆: 当前角色最近发生了什么
                        const chars = (extracted.characters || []).slice(0, 5);
                        if (chars.length && extracted.summary) {
                            for (const ch of chars) {
                                const cn = this.resolveCharacterName(ch);
                                this.charMem.addRecent(cn, extracted.summary.slice(0, 120), floor);
                            }
                        }
                        // 核心记忆: 关系变化（关系建立/恶化）、约定/目标新立
                        for (const rel of (extracted.relationships || [])) {
                            const att = rel?.attitude;
                            if (att === 'positive' || att === 'negative') {
                                const a = this.resolveCharacterName(rel.from), b = this.resolveCharacterName(rel.to);
                                const coreText = `${a}与${b}关系（${att === 'positive' ? '友好' : '对立'}）`;
                                this.charMem.addCore(a, coreText, floor);
                                this.charMem.addCore(b, coreText, floor);
                            }
                        }
                        for (const pl of (extracted.plans || [])) {
                            if (pl?.contentIsNew && pl.content) {
                                const owner = (pl.character && this.resolveCharacterName(pl.character)) || (chars[0] && this.resolveCharacterName(chars[0]));
                                if (owner) this.charMem.addCore(owner, `约定/目标: ${String(pl.content).slice(0, 100)}`, floor);
                            }
                        }
                    } catch (e) { errLog(e, 'onMessageReceived.charMem写入'); }
                }

                // [v1.8] P0: 写入剧情时间线
                if (this.config.config.plotTimeline && extracted?.summary) {
                    const sd = this.extractStoryDate(message.mes || '', extracted.story_date);
                    // [v3.32] event importance aggregation - Visual-Memory tiering
                    let tlImp = 5;
                    for (const ev of (extracted?.events || [])) {
                        const v = Number(ev?.importance);
                        if (v >= 1 && v <= 10 && v > tlImp) tlImp = v;
                    }
                    // [v3.18] 时间锚点一致性校验（检测倒跳）
                    if (sd) this.checkTimeMonotonic(sd, message.index || 0);
                    if (sd) this.timeline.add(sd, extracted.summary, message.index || 0, extracted.characters || [], tlImp);
                    // [v2.9] RU-A: 主动时间推进——正文说"三天后/次日"但没写日期时，基于上一楼日期算术推进
                    const adv = Number(extracted.time_advance_days) || 0;
                    if (adv > 0) {
                        const base = sd || this._lastStoryDate;
                        const advanced = base ? this.advanceStoryDate(base, adv) : null;
                        if (advanced) {
                            this.timeline.add(advanced, extracted.summary, message.index || 0, extracted.characters || [], tlImp);
                            this._lastStoryDate = advanced;
                            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 时间推进: ${base} +${adv}天 → ${advanced}`);
                        }
                    } else if (sd) {
                        this._lastStoryDate = sd;
                    }
                }

                // [v2.2] RC: 悬念簿（新悬项登记 + 了结核销 + 超限沉降）
                if (this.config.config.suspenseEnabled && extracted) {
                    try {
                        let susN = 0;
                        for (const pl of (extracted.plans || [])) {
                            if (pl && pl.contentIsNew !== false && pl.content) {
                                if (this.suspense.add(pl.kind, pl.content, message.index || 0, extracted.story_date || null)) susN++;
                            }
                        }
                        let resN = 0;
                        for (const pr of (extracted.plans_resolve || [])) {
                            if (pr && (pr.id || pr.content)) {
                                if (this.suspense.resolve(pr.id || pr.content, pr.outcome, pr.reason, message.index || 0)) resN++;
                            }
                        }
                        const pruned = this.suspense.prune(this.config.config.suspenseMaxOpen || 20);
                        if ((susN || resN || pruned) && this.config.config.debugMode) {
                            console.log(`[${PLUGIN_NAME}] 悬念簿: +${susN} 新增, ${resN} 了结, ${pruned} 沉降`);
                        }
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 悬念簿处理失败:`, e); }
                }

                // [v2.4] RE: 场景树（新地点登记 + 位置追踪）
                if (this.config.config.sceneEnabled && extracted) {
                    try {
                        const scN = this.scene.apply(extracted.scenes, message.index || 0);
                        if (extracted.location) this.scene.setLocation(message.index || 0, extracted.location);
                        // [v2.8] RT-C: 物品台账应用（ops 真源记录，回滚可重放）
                        // [v3.8] 修复 v3.3「先清」自相矛盾：改为「同状态(fp)清、多变体保留」——
                        //   同一文本状态重复提取时清旧防堆积；不同 swipe 变体（不同 fp）保留，
                        //   切回旧变体时由 rebuildItems 的 fp 匹配自动复活（不再依赖重提取重建）
                        if (this.config.config.itemLedgerEnabled && Array.isArray(extracted.items) && extracted.items.length) {
                            const fpNow = msgFpOf(message);
                            const floorNow = message.index || 0;
                            if (fpNow) this.itemOps = (this.itemOps || []).filter(o => !(o && o.floor === floorNow && o.fp === fpNow));
                            for (const it of extracted.items) {
                                if (!it?.name) continue;
                                this.itemOps.push({ floor: floorNow, fp: fpNow, ...it });
                            }
                            this.rebuildItems();
                        }
                        if ((scN || extracted.location) && this.config.config.debugMode) {
                            console.log(`[${PLUGIN_NAME}] 场景树: +${scN} 地点, 位置=${SceneBook.keyOf(extracted.location) || '未变'}`);
                        }
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 场景树处理失败:`, e); }
                }

                // [v2.0] P2: 角色状态 + 待办 + 楼层账本
                const floor = message.index || 0;
                const nodesBefore = this.graph.nodes.size;
                if (this.config.config.characterStateEnabled && extracted?.status_changes) {
                    try {
                        const n = this.status.applyChanges(extracted.status_changes, floor);
                        if (n && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 状态更新 ${n} 项`);
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 状态写入失败:`, e); }
                }
                if (this.config.config.todoTrackingEnabled && extracted?.todos) {
                    try {
                        this.status.addTodos(extracted.todos, floor);
                    } catch (e) { errLog(e, 'onMessageReceived.文本清洗'); }
                }
                if (this.config.config.todoTrackingEnabled) {
                    try {
                        const sd = this.getLatestStoryDate();
                        if (sd) this.status.pruneTodos(sd, this.config.config.todoExpiryMinutes || 60);
                    } catch (e) { errLog(e, 'onMessageReceived.状态应用'); }
                }
                if (this.config.config.floorLedgerEnabled) {
                    try {
                        const allIds = Array.from(this.graph.nodes.keys());
                        this.ledger.record(floor, {
                            nodeIds: allIds.slice(nodesBefore),
                            povIds: this.pov.povs.filter(p => p.floor === floor).map(p => p.id),
                            timelineIds: this.timeline.entries.filter(t => t.floor === floor).map(t => t.id)
                        });
                    } catch (e) { errLog(e, 'onMessageReceived.楼层账本'); }
                }

                const summary = await this.summary.createSummary(message, extracted?.summary);
                
                // [v3.30] PV: 记忆矛盾换代 —— 新摘要与既有活跃摘要做高置信冲突检测, 旧条 superseded 退出召回
                if (window.LonShaSupersede && this.config.config.supersedeEnabled) {
                    try {
                        const newKey = 'sum_' + (message.index || 0);
                        const activeSumsLc = this.summary.getActiveSummaries()
                            .map(s => ({ key: 'sum_' + s.floor, text: s.text, importance: s.importance || extracted?.importance || 5 }));
                        const newSumsLc = activeSumsLc.filter(s => s.key === newKey);
                        const oldSumsLc = activeSumsLc.filter(s => s.key !== newKey)
                            .slice(-(this.config.config.supersedeScanPool || 30));
                        const supersededLc = newSumsLc.length
                            ? this.supersede.scan(newSumsLc, oldSumsLc)
                            : [];
                        if (supersededLc.length) {
                            this.statsSuperseded = (this.statsSuperseded || 0) + supersededLc.length;
                            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🕊 矛盾换代: ${supersededLc.length} 条旧记忆被新事实压制`);
                        }
                        this.supersede.revive(activeSumsLc.map(s => s.key));
                    } catch (e) { errLog(e, 'onMessageReceived.supersede'); }
                }
                
                // [v2.5] RF: 活人感日记——每N楼一次批量生成登场角色第一人称日记
                if (this.config.config.livingDiary) {
                    try {
                        const dn = await this.diary.generateLiving(this.config.config, this.llm, extracted?.characters ? this.getKnownCharacters() : [], message.index || 0);
                        // [v2.8] RT-B: 反思生成（每N楼节流，与日记独立）
                        try { if (this.config.config.reflectionEnabled) await this.reflection.generate(this.config.config, this.llm, this, message.index || 0); } catch (e) { errLog(e, 'onMessageReceived.反思生成'); }
                        // [v2.9] RU-B: 定期记忆优化（每N楼防膨胀）
                        try {
                            const oEvery = this.config.config.optimizeEveryFloors || 50;
                            if (!this._lastOptimizeFloor || (message.index || 0) - this._lastOptimizeFloor >= oEvery) {
                                this._lastOptimizeFloor = message.index || 0;
                                this.optimizeMemory();
                            }
                        } catch (e) { errLog(e, 'onMessageReceived.优化器'); }
                        if (dn && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 活人感日记 +${dn} 条`);
                    } catch (e) { errLog(e, 'onMessageReceived.POV状态回收'); }
                }
                
                if (this.config.config.vectorEnabled) {
                    // [v3.13] 场外信号拼入向量素材（只影响检索，不进注入文本）
                const _sig = (this._thinkingSignals || []).filter(s => s.floor === message.index).map(s => (s.text.split('\n')[1] || '').slice(0, 120));
                const vectorText = `${extracted?.summary || this.summary.smartTruncate(messageText, 200)}\n角色:${extracted?.characters?.join(',') || ''}${_sig.length ? '\n场外:' + _sig.join(' ') : ''}`;
                    await this.vector.addVector(vectorText, {
                        floor: message.index || 0,
                        characters: extracted?.characters || [],
                        events: extracted?.events || [],
                        summary: extracted?.summary || ''
                    });
                }
                
                // [v1.9] P1: BM25 索引重建 + 层级摘要折叠
                if (this.config.config.bm25Enabled) {
                    try {
                        this.bm25.rebuild(this.summary.getActiveSummaries().map(s => ({id: 'sum_' + s.floor, text: s.text, floor: s.floor, source: 'bm25'})));
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] BM25重建失败:`, e); }
                }
                if (this.config.config.summaryFoldEnabled) {
                    try { await this.summary.maybeFold(this.config.config, this.llm); } catch (e) { errLog(e, 'onMessageReceived.摘要折叠'); }
                }
                // [v3.25] 归档隐藏已覆盖楼层（Bakemono 共识，默认关）: 折叠成功后把 folded 旧楼设 is_hidden
                if (this.config.config.autoArchiveCovered) {
                    try { this.archiveCoveredFloors(); } catch (e) { errLog(e, 'onMessageReceived.归档隐藏'); }
                }
                // [v3.16] 世界推进触发: 每 EVERY_FLOORS 楼标记 pending，等下次生成前推演（独立于摘要折叠开关）
                try {
                    const wpEvery = Number(this.config.config.worldProgressEveryFloors || (this.worldProg?.EVERY_FLOORS || 2));
                    // [v3.19] 周期纯函数（ruby）: 位置取模替代固定锚点
                    if (this.config.config.worldProgressEnabled && wpEvery > 0 && cyclePositionFor(message.index || 0, wpEvery) === wpEvery) {
                        this.worldProg.markPending();
                    }
                } catch (e) { errLog(e, 'onMessageReceived.世界推进标记'); }

                // [v3.1] SF2: 更新聊天长度基线（供删除事件对比，防渲染切片误判）
                try { this._lastKnownChatLen = (window.SillyTavern?.getContext?.()?.chat?.length) || this._lastKnownChatLen; } catch (e) { errLog(e, 'SF2.基线更新'); }
                // [v2.2] RB: 楼层提交盖章 → 桥同步手机侧楼层状态 (幂等)
                try {
                    const rb = window.VirtualPhone?.lonshaBridge;
                    if (rb?.onFloorCommitted) rb.onFloorCommitted(message.index || 0);
                } catch (e) { errLog(e, 'onMessageReceived.RubyPhone桥'); }
                if (this.config.config.autoSave) {
                    // [v2.9] RU-C: 定期快照（每 snapshotEveryFloors 楼一份，IndexedDB 独立于 chatMetadata）
                    try {
                        const snapEvery = this.config.config.snapshotEveryFloors || 50;
                        const curFloor = message.index || 0;
                        if (!this._lastSnapshotFloor || curFloor - this._lastSnapshotFloor >= snapEvery) {
                            this._lastSnapshotFloor = curFloor;
                            const snapData = await this.collectExport();
                            await this.snapshots.save(chatId, curFloor, snapData);
                            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 快照已保存 (floor ${curFloor})`);
                        }
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 快照失败:`, e); }
                    // [v3.23] 定期把记忆快照嵌入 chatMetadata 供跨设备迁移（NE auto-restore）——每 20 楼一次，避免频繁写大头元数据
                    try {
                        if (!this._embedCount) this._embedCount = 0;
                        this._embedCount++;
                        if (this._embedCount >= 20) {
                            this._embedCount = 0;
                            this.embedVaultToChatMeta?.();
                        }
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 嵌入元数据失败:`, e); }
                    await this.storage.save(chatId, {
                                                graph: this.graph.export(),
                        charMem: this.charMem ? this.charMem.export() : {},
                        worldProg: this.worldProg ? this.worldProg.export() : {}, summaries: this.summary.export(),
                        diaries: this.diary.export(),
                        reflection: this.reflection?.export?.(),
                        itemOps: this.itemOps,
                        vectors: this.vector.export(),
                        povs: this.pov.export(),
                        timeline: this.timeline.export(),
                        status: this.status.export(),
                        ledger: this.ledger.export(),
                        suspense: this.suspense.export(),
                        scene: this.scene.export(),
                        echo: this.echo.export(),
                        supersede: window.LonShaSupersede ? this.supersede.export() : { supersededMap: {} },
                        version: VERSION
                    });
                }
                
                console.log(`[${PLUGIN_NAME}] ✓ 完成 (${extracted?.characters?.length || 0}角色, ${extracted?.events?.length || 0}事件, 向量=${this.vector.vectors.length})`);
            } catch (err) {
                console.error(`[${PLUGIN_NAME}] ✗ 失败:`, err);
            } finally {
                if (this.config.config.extractionLockEnabled) this.mutex.release();
                // [v3.10] 锁释放后补提取降级楼层（一次最多 10 楼，防堆积）
                try {
                    if (this._lockDegradePending?.size && this.config.config.extractionEnabled) {
                        const list = Array.from(this._lockDegradePending).sort((a, b) => a - b).slice(0, 10);
                        for (const f of list) this._lockDegradePending.delete(f);
                        if (list.length) {
                            console.log(`[${PLUGIN_NAME}] 锁空闲，补提取降级楼层: ${list.join(',')}`);
                            setTimeout(async () => {
                                try { await this.backfillFloors(list); } catch (e) { errLog(e, 'EV.锁后补提取'); }
                            }, 1000);
                        }
                    }
                } catch (e) { errLog(e, 'EV.锁后补提取调度'); }
            }
        }
        
        async extractMemoryWithLLM(message) {
            if (!this.config.config.extractionEnabled) return this.extractMemorySimple(message);
            try {
                const content = (message.mes || '').substring(0, 2000);
                // [v1.5] 抄 HCDiary：注入已知角色名单 + 前情提要（记忆回环）
                const knownChars = this.getKnownCharacters();
                const history = this.summary.getActiveSummaries().slice(-5).map(s => s.text).join('\n');
                const volText = (this.summary.volumes || []).slice(-2).map(v => `【卷${v.floorStart}-${v.floorEnd}】${v.text}`).join('\n');
                const historyFull = [volText, history].filter(Boolean).join('\n');
                const prompt = this.config.config.extractionPrompt
                    .replace('{{KNOWN_CHARS}}', knownChars.join('、') || '（暂无，从本轮开始积累）')
                    .replace('{{HISTORY}}', historyFull || '（暂无）')
                    .replace('{{SUSPENSE}}', (this.config.config.suspenseEnabled && this.suspense.openItems().length) ? this.suspense.briefForPrompt() : '（暂无未了结的悬念）')
                    .replace('{{SCENES}}', (this.config.config.sceneEnabled && this.scene.nodes.size) ? this.scene.brief() : '（暂无已登记场景）')
                    .replace('{{CONTENT}}', content);
                const response = await this.llm.callAPI(prompt);
                if (!response) {
                    console.warn(`[${PLUGIN_NAME}] LLM无响应，用简单提取`);
                    return this.extractMemorySimple(message);
                }
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(sanitizeJson(jsonMatch[0]));
                    // [v1.4] 角色名合法性校验：1-8字、无标点数字，过滤"钥匙在锁"类误提取
                    if (Array.isArray(parsed.characters)) {
                        parsed.characters = parsed.characters.filter(n =>
                            typeof n === 'string' && n.length >= 1 && n.length <= 8 && !/[\d\p{P}\s]/u.test(n)
                        );
                    }
                    return parsed;
                } else {
                    return this.extractMemorySimple(message);
                }
            } catch (err) {
                console.error(`[${PLUGIN_NAME}] LLM提取失败:`, err);
                return this.extractMemorySimple(message);
            }
        }
        
        // [v1.5] 抄 HCDiary cdCaptureCast：从最近楼层捕获登场角色（词边界正则，防误匹配）
        captureCast() {
            const ctx = window.SillyTavern?.getContext?.();
            const chat = ctx?.chat || [];
            const window = chat.slice(-8); // 最近8楼判定窗口
            const sceneText = window.map(m => (m?.mes || '')).join('\n');
            if (!sceneText) return [];
            const cast = [];
            for (const name of this.getKnownCharacters()) {
                if (!name || name.length < 2) continue;
                try {
                    const re = new RegExp('(?<![\u4e00-\u9fa5a-zA-Z])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-zA-Z0-9])', 'i');
                    if (re.test(sceneText)) cast.push(name);
                } catch (e) { /* 正则失败跳过 */ }
            }
            return cast.slice(0, 5);
        }

        // [v1.5] 抄 HCDiary：已知角色名单（主卡角色 + 图谱已积累角色，排除用户）
        getKnownCharacters() {
            const known = [];
            const ctx = window.SillyTavern?.getContext?.();
            if (ctx?.name2 && ctx.name2 !== ctx.name1) known.push(ctx.name2);
            for (const node of this.graph.nodes.values()) {
                if (node.type === 'character' && node.name && !known.includes(node.name) && node.name !== ctx?.name1) {
                    known.push(node.name);
                }
            }
            return known.slice(0, 20);
        }
        // [v1.5] 抄 HCDiary：别名归并——新名字与已有主名互为包含时，归并到主名
        resolveCharacterName(name) {
            if (!name) return name;
            if (this.graph.nameIndex.has(name)) return name;
            for (const known of this.graph.nameIndex.keys()) {
                if (known.includes(name) || name.includes(known)) return known;
            }
            return name;
        }
        
        // [v3.13] 思维链白名单投递: 提取"场外信号"（角色疑虑/迟到暗示/外部动作/下一幕预告），
        // 仅作为附件包附加向量素材（提升召回命中），绝不写入 summary/timeline/graph/status 任何事实性记忆
        // [v3.22] 场外信号按楼层清理（rollbackFloor 联动）: 删楼后旧信号不残留
        clearThinkingSignalsByFloor(floor) {
            try {
                const f = Math.max(0, Math.round(Number(floor) || 0));
                if (Array.isArray(this._thinkingSignals)) {
                    this._thinkingSignals = this._thinkingSignals.filter(s => s.floor !== f);
                }
            } catch (e) { errLog(e, 'rollbackFloor.场外信号清理'); }
        }
        feedThinking(thinking, floor) {
            if (!thinking) return;
            const t = String(thinking).slice(0, 800);
            // 场外信号判定: 疑虑/预告/外部/未发生类关键词命中才投递（防思维链噪音全量入库）
            const SIGNAL_RE = /(疑虑|怀疑|犹豫|担心|打算|计划|准备|迟到|缺席|不在场|场外|暗中|偷偷|预示|预告|即将|接下来|下一幕|伏笔|内疚|隐瞒)/;
            if (!SIGNAL_RE.test(t)) return;
            const f = Math.max(0, Math.round(Number(floor) || 0));
            this._thinkingSignals = this._thinkingSignals || [];
            // 同楼覆盖（swipe 重跑时替换旧信号，不堆积）
            const idx = this._thinkingSignals.findIndex(s => s.floor === f);
            const sig = { floor: f, text: thinkingAnchorHeader() + '\n' + t, ts: Date.now() };
            if (idx >= 0) this._thinkingSignals[idx] = sig; else this._thinkingSignals.push(sig);
            if (this._thinkingSignals.length > 12) this._thinkingSignals.shift();
            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 场外信号入库（仅检索用）楼层 ${f}`);
        }
    // [v3.14] 从世界书提取角色（收编 zhino A5.2.1: 触发词=世界书 key 是别名最可靠来源）
    // 快速模式: 只读 条目标题路径 + 触发词(key) + 正文前300字
    async extractRolesFromLore() {
        try {
            const ctx = window.SillyTavern?.getContext?.();
            const lore = ctx?.lore;
            if (!lore || !Array.isArray(lore) || !lore.length) return [];
            // 收集条目（覆盖全部条目的 key/comment/content 前300字——zhino: 触发词比正文更小更准）
            const samples = lore.slice(0, Math.min(lore.length, 400)).map(e => {
                const key = String(e?.key || '').trim();
                const title = String(e?.comment || e?.displayName || key || '').trim();
                const body = String(e?.content || '').trim().slice(0, 300);
                return { key, title, body };
            }).filter(s => s.key || s.title || s.body);
            if (!samples.length) return [];
            const prompt = this.config.config.extractRolesPrompt
                .replace('{{LORE}}', samples.map(s => `【${s.title || s.key}】key=${s.key}\n${s.body}`).join('\n---\n'))
                .replace('{{ROLE_COUNT}}', String(Math.min(samples.length, 80)));
            const raw = await this.llm.callAPI(prompt);
            // 宽松 JSON 解析（兼容 ```json 围栏）
            let arr = [];
            const m = String(raw || '').match(/```json\s*([\s\S]*?)```/);
            const json = m ? m[1] : String(raw || '').replace(/[\s\S]*?(\[.*\])[\s\S]*/s, '$1');
            try { arr = JSON.parse(sanitizeJson(json)); } catch (_) { arr = []; }
            if (!Array.isArray(arr)) arr = [];
            return arr
                .filter(x => x && typeof x.name === 'string' && x.name.trim())
                .map(x => ({
                    name: x.name.trim(),
                    aliases: (Array.isArray(x.aliases) ? x.aliases : []).filter(a => typeof a === 'string' && a.trim() && a.trim() !== x.name.trim()).map(a => a.trim()).slice(0, 8),
                }))
                .slice(0, Number(this.config.config.extractRolesLimit) || 50);
        } catch (e) { errLog(e, 'V314.extractRolesFromLore'); return []; }
    }

    // [v3.14] 写入图谱: 已有角色只补别名（zhino: 不改主名）；新角色入节点
    applyExtractedRoles(roles) {
        if (!Array.isArray(roles) || !roles.length) return { added: 0, aliasPatched: 0 };
        let added = 0, aliasPatched = 0;
        for (const r of roles) {
            try {
                const canonical = this.resolveCharacterName(r.name);
                const node = this.graph.findCharacterByName(canonical);
                if (node) {
                    // 已有角色: 只补别名，不入新节点
                    const cur = new Set(node.data?.aliases || []);
                    let changed = false;
                    for (const a of (r.aliases || [])) {
                        if (a && !cur.has(a)) { cur.add(a); changed = true; }
                    }
                    if (changed) { node.data = { ...(node.data || {}), aliases: Array.from(cur) }; aliasPatched++; }
                } else {
                    this.graph.addNode({ type: 'character', name: canonical, data: { source: '[世界书]', aliases: r.aliases || [] } });
                    added++;
                }
            } catch (e) { errLog(e, 'V314.applyExtractedRoles'); }
        }
        return { added, aliasPatched };
    }


        extractMemorySimple(message) {
            // [v1.4 修复] 旧版用正则抓任意中文词块当角色名，产生"钥匙在锁""两下"这类垃圾。
            // 现在只匹配已知角色（当前角色卡 + 图谱已有节点），宁可漏记不记错。
            const content = message.mes || '';
            const known = new Set();
            const ctx = window.SillyTavern?.getContext?.();
            if (ctx?.name2) known.add(ctx.name2);
            if (ctx?.name1) known.add(ctx.name1);
            for (const node of this.graph.nodes.values()) {
                if (node.type === 'character' && node.name) known.add(node.name);
            }
            const characters = Array.from(known).filter(n => n && content.includes(n)).slice(0, 5);
            return {characters, events: [], relationships: [], entities: [], summary: this.summary.smartTruncate(content, 100)};
        }
        
        // [v1.8] P0: 剧情日期提取（优先 LLM 标注，其次从正文匹配，最后兜底实时日期）
        extractStoryDate(messageText, llmDate) {
            if (llmDate) return String(llmDate).trim();
            const m = String(messageText || '').match(/(\d{1,4})\s*[年\/-]\s*(\d{1,2})\s*[月\/-]\s*(\d{1,2})\s*日?/);
            if (m) return `${m[1]}年${m[2]}月${m[3]}日`;
            try {
                const tm = window.VirtualPhone?.timeManager;
                if (tm?.getCurrentStoryTime) {
                    const t = tm.getCurrentStoryTime();
                    if (t?.date && !t.isReal) return String(t.date);
                }
            } catch (e) { errLog(e, 'extractStoryDate'); }
            return null;
        }
        // [v2.9] RU-A: 主动时间推进（抄 shujuku plot-runtime——"三天后"无具体日期时算术推进）
        advanceStoryDate(baseDate, days) {
            try {
                const h = new RelativeTimeHelper();
                const parsed = h.parseStoryDate(baseDate);
                if (!parsed || parsed.type !== 'standard') return null;  // 架空日历无法算术，宁可不推
                const now = new Date();
                const y = parsed.year ?? now.getFullYear();
                const m = parsed.month ?? (now.getMonth() + 1);
                const d = parsed.day ?? 1;
                const t = new Date(y, m - 1, d + Number(days));
                return `${t.getFullYear()}年${t.getMonth() + 1}月${t.getDate()}日`;
            } catch (e) { return null; }
        }

        // [v1.8] P0: 当前剧情时间锚点（时间线召回用）
        // [v3.18] 时间锚点一致性（baibai 时间协议的轻量版）:
        // 记录最近剧情日，检测时间倒跳（正文矛盾/重roll导致）并告警
        // 不要求主模型改协议，仅用现有 story_date 数据做一致性防线
        _lastStoryDateSeen = null;
        _lastStoryDateFloor = -1;
        // [v3.25] 图扩散节点身份提取（TriviumDB Refractory 用）：兼容原始 result 与 {node} 包裹
        _nodeIdentity(r) {
            try {
                const n = r?.node || r || {};
                return n.id || n.name || n.key || null;
            } catch (e) { return null; }
        }
        // [v3.25] 归档隐藏已被卷摘要覆盖的旧楼层（Bakemono archive-controller 移植，默认关）:
        // 可逆（is_hidden 可恢复）、保留最近 N 个 AI 楼、手动确认由 settings-ui 触发
        archiveCoveredFloors(preserveRecent) {
            try {
                const c = window.SillyTavern?.getContext?.();
                const chat = c?.chat || [];
                if (!chat.length || typeof c?.hideChatMessageRange !== 'function') return 0;
                const keep = Math.max(0, Number(preserveRecent != null ? preserveRecent : this.config.config.archivePreserveRecent) || 0);
                // 被卷摘要覆盖的楼层 = 折叠标记（folded=true）对应的摘要楼层
                const foldedFloors = new Set(
                    (this.summary?.summaries || [])
                        .filter(s => s.folded && Number.isFinite(s.floor))
                        .map(s => s.floor)
                );
                // 收集这些楼对应的 chat 下标（最近 keep 个 AI 楼保留）
                let aiSeen = 0;
                const toHide = [];
                for (let i = 0; i < chat.length; i++) {
                    const m = chat[i];
                    if (!m || m.is_user || m.is_system || m.is_hidden) continue;
                    aiSeen++;
                    if (aiSeen > keep && foldedFloors.has(i) && !this._archivedFloorIds.has(i)) {
                        toHide.push(i);
                    }
                }
                // 执行隐藏（逐个，可逆）
                let hid = 0;
                for (const idx of toHide) {
                    try { c.hideChatMessageRange(idx, idx, false); this._archivedFloorIds.add(idx); hid++; } catch (e) {}
                }
                if (hid && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 归档隐藏: ${hid} 楼 (保留最近 ${keep} AI楼)`);
                return hid;
            } catch (e) { errLog(e, '归档隐藏.archiveCoveredFloors'); return 0; }
        }
        // 恢复插件归档隐藏的楼层（is_hidden=false）
        restoreArchivedFloors() {
            try {
                const c = window.SillyTavern?.getContext?.();
                const chat = c?.chat || [];
                if (!this._archivedFloorIds.size) return 0;
                let restored = 0;
                for (const idx of this._archivedFloorIds) {
                    const m = chat[idx];
                    if (m && typeof c?.setIsHidden === 'function') {
                        try { c.setIsHidden(idx, false); restored++; } catch (e) {}
                    }
                }
                this._archivedFloorIds.clear();
                if (restored && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 归档恢复: ${restored} 楼`);
                return restored;
            } catch (e) { errLog(e, '归档隐藏.restoreArchivedFloors'); return 0; }
        }
        // [v3.23] chatMetadata 嵌入记忆库迁移恢复（NE auto-restore 轻量版）
        // 检测 chatMetadata.extensions.LonShaMemory.embeddedVault（导出时嵌入的全量存档），
        // 本地有更新版本则忽略并清理；本地为空则在启动时提示恢复。
        checkEmbeddedMigration() {
            try {
                if (this._migrateRestored) return;
                this._migrateRestored = true;
                const c = window.SillyTavern?.getContext?.();
                const meta = c?.chatMetadata;
                const emb = meta?.extensions?.[this.STORAGE_KEY]?.embeddedVault;
                if (!emb || typeof emb !== 'object') return;
                // 本地已有记忆库且版本不旧 → 清理嵌入并跳过
                let local = null;
                try {
                    // [v3.23] 用 collectExport 读本地版本（纯方法探测，无副作用）
                    local = (typeof this.collectExport === 'function') ? this.collectExport() : null;
                } catch (e) {}
                const localVer = typeof local?.version === 'string' ? parseFloat(local.version) || 0 : (local?.version || 0);
                const embVer = typeof emb.version === 'string' ? parseFloat(emb.version) || 0 : (emb.version || 0);
                if (localVer >= embVer && localVer > 0) {
                    this.clearEmbeddedVaultMeta();
                    return;
                }
                // 本地空 → 弹提示（非阻塞）
                try {
                    const toastr = window.toastr;
                    if (toastr?.info) {
                        toastr.info(`检测到聊天元数据中嵌入的记忆存档（版本 ${emb.version || '?'}）。本地暂无更新版本。可手动到设置→导入恢复。`, 'LonSha记忆引擎', { timeOut: 6000, closeButton: true });
                    }
                } catch (e2) {}
                // 可恢复数据留在 embeddedVault 供 settings-ui 导入按钮读取
                const cfg = this.config.config;
                cfg._embeddedVaultReady = true;
                this.config.saveConfig();
            } catch (e) { errLog(e, '迁移恢复.checkEmbeddedMigration'); }
        }
        clearEmbeddedVaultMeta() {
            try {
                const c = window.SillyTavern?.getContext?.();
                const meta = c?.chatMetadata;
                if (!meta?.extensions?.[this.STORAGE_KEY]) return;
                delete meta.extensions[this.STORAGE_KEY].embeddedVault;
                this._migrateRestored = true;
            } catch (e) { errLog(e, '迁移恢复.clearEmbeddedVaultMeta'); }
        }
        // [v3.23] 导出时把当前记忆附加到 chatMetadata 供跨设备迁移（NE auto-restore 的写入侧）
        embedVaultToChatMeta() {
            try {
                if (typeof this.collectExport !== 'function') return false;
                const payload = this.collectExport();
                if (!payload) return false;
                const c = window.SillyTavern?.getContext?.();
                const meta = c?.chatMetadata;
                if (!meta) return false;
                if (!meta.extensions) meta.extensions = {};
                if (!meta.extensions[this.STORAGE_KEY]) meta.extensions[this.STORAGE_KEY] = {};
                meta.extensions[this.STORAGE_KEY].embeddedVault = payload;
                return true;
            } catch (e) { errLog(e, '迁移恢复.embedVaultToChatMeta'); return false; }
        }
        checkTimeMonotonic(dateStr, floor) {
            try {
                if (!dateStr) return null;
                const cur = this._lastStoryDateSeen;
                if (cur && dateStr !== cur) {
                    // 粗略判断倒跳（用 storyDayDiff，负值=往前跳）
                    const diff = (this.storyDayDiff || storyDayDiff)(dateStr, cur);
                    if (diff !== null && diff !== undefined && diff < 0) {
                        if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] ⚠ 剧情时间倒跳: ${cur} → ${dateStr} (第${floor}楼) — 可能是重roll/编辑导致，记忆已按新时间锚点`);
                    }
                }
                this._lastStoryDateSeen = dateStr;
                this._lastStoryDateFloor = Number(floor) || 0;
                return dateStr;
            } catch (e) { return dateStr; }
        }
        getLatestStoryDate() {
            try {
                // 优先从最近楼层找剧情日期
                const ctx = window.SillyTavern?.getContext?.();
                const chat = ctx?.chat || [];
                for (let i = chat.length - 1; i >= Math.max(0, chat.length - 6); i--) {
                    const m = chat[i];
                    const text = (m?.mes || '') + (m?.content || '');
                    const hit = String(text).match(/(\d{1,4})\s*[年\/-]\s*(\d{1,2})\s*[月\/-]\s*(\d{1,2})\s*日?/);
                    if (hit) return `${hit[1]}年${hit[2]}月${hit[3]}日`;
                }
                // 兜底：手机时间管理器
                const tm = window.VirtualPhone?.timeManager;
                if (tm?.getCurrentStoryTime) {
                    const t = tm.getCurrentStoryTime();
                    if (t?.date && !t.isReal) return String(t.date);
                }
            } catch (e) { errLog(e, 'getLatestStoryDate'); }
            return null;
        }

        // [v1.4] 正文清洗：剥离注释/标签/世界书标记
        cleanMessageText(text) {
            return String(text || '')
                .replace(/<!--[\s\S]*?-->/g, '')      // HTML注释 (SDC-start 等)
                .replace(/<\/?[a-zA-Z_][\w-]*[^>]*>/g, '')  // 自定义标签 (konatan_planning 等)
                .replace(/\[\[.*?\]\]/g, '')           // [[宏]]
                .replace(/\{\{.*?\}\}/g, '')          // {{宏}}
                .trim();
        }
        
        async onBeforeGeneration(context) {
            if (!this.config.config.enabled) return '';
            const chatId = this.getCurrentChatId();
            if (!chatId) return '';
            try {
                // [v3.27] 命中轨迹计时起点（MemoryPilot monitor）
                this._traceStartTime = Date.now();
                // [v3.12] 生成路径只读加载（原无条件 load 会 import 旧存档覆盖运行时——自愈/shift/编辑修改全被回退）
                await this.storage.load(chatId, { preserveRuntime: true });
                const query = this.buildQuery(context);
                // [v2.9] RU-D: swipe 同楼重roll复用缓存（抄 anima _lastRetrievalPayload——同楼且同查询直接复用，省 rewrite+embedding+rerank 三次调用）
                if (this.config.config.recallCacheEnabled && this._recallCache) {
                    try {
                        const ctxChat = window.SillyTavern?.getContext?.()?.chat || [];
                        const curFloor = ctxChat.length - 1;
                        const qKey = String(query.text || '').slice(0, 200);
                        if (this._recallCache.floor === curFloor && this._recallCache.queryKey === qKey && this._recallCache.injection) {
                            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 召回缓存命中 (floor ${curFloor})`);
                            return this._recallCache.injection;
                        }
                    } catch (e) { errLog(e, 'cleanMessageText'); }
                }
                // [v2.4] RE: 召回价值判断（抄 baibai recallWorthRunning——剧情全在窗口内时跳过，省额度）
                if (!this.recallWorthRunning()) return '';
                // [v2.4] RE: 查询重写——把最近剧情改写成多条检索查询，主查询之外追加多路
                try {
                    const qs = await this.llm.rewriteQuery(query.text);
                    if (qs && qs.length) query.queries = qs;
                } catch (e) { errLog(e, 'cleanMessageText'); }
                const recalled = await this.recallMemory(query);
                // [v2.5] RF: 回响池——本轮召回的进池续命，池中仍在停留期的合并注入（召回结果跨轮连续，不再闪烁）
                try {
                    if (this.config.config.echoEnabled) {
                        const merged = new Map();
                        for (const r of recalled) merged.set(r.id || r.text || JSON.stringify(r).slice(0, 60), r);
                        for (const e of this.echo.tick()) {
                            if (e.text && !merged.has(e.key)) merged.set(e.key, { id: e.key, text: e.text, source: e.source, echo: true });
                        }
                        this.echo.onRecalled(recalled);
                        const inj1 = this.buildInjection(Array.from(merged.values()).slice(0, this.config.config.vectorTopK * 2 + (this.config.config.echoMaxCount || 10)));
                        try {
                            const cc = window.SillyTavern?.getContext?.()?.chat || [];
                            this._recallCache = {floor: cc.length - 1, queryKey: String(query.text || '').slice(0, 200), injection: inj1};
                        } catch (e) { errLog(e, 'cleanMessageText'); }
                        return inj1;
                    }
                } catch (e) { errLog(e, 'cleanMessageText'); }
                // [v3.16] 世界推进: 生成路径注入前把待推进的不在场角色动态并入（zhino: 玩家发消息不在生成时挤 API，后台推演产物注入）
                try {
                    if (this.config.config.worldProgressEnabled) {
                        // [v3.17] 发布确认: 生成路径注入 = 宿主确认点，pending 一次性 publish（shujuku 语义）
            // [v3.21] 世界推进实际推演（修复空转）: active 为空时用 charMem 填充，再 publish/toInjection
            try {
                if (this.config.config.worldProgressEnabled && this.worldProg) {
                    const activeCount = this.worldProg.active ? Object.keys(this.worldProg.active).length : 0;
                    if (activeCount === 0) {
                        const currentChat = window.SillyTavern?.getContext?.()?.chat || [];
                        const known = this.getKnownCharacters();
                        const present = this.captureCast();
                        const floor = currentChat.length;
                        this.worldProg.generateFromMemory(this, known, present, floor);
                    }
                    if (this.worldProg.pendingWrite) this.worldProg.publish();
                }
            } catch (e) { errLog(e, 'onBeforeGeneration.世界推进推演'); }
            const prog = this.worldProg ? this.worldProg.toInjection() : [];
                        for (const wp of prog) {
                            if (!recalled.some(r => (r.text || '') === wp.text)) recalled.push(wp);
                        }
                        // [v3.23] 跨调用去重: 本轮回溯结果记指纹（NE-Memory）。同一话题连续追问时下轮识别已覆盖项
                        try {
                            const ctxCc = window.SillyTavern?.getContext?.();
                            const chatIdCc = ctxCc?.chatId || ctxCc?.characterId || '';
                            // 先记指纹（基于原始 recalled，不含 DEDUP 标记前缀，防自污染）
                            recallDedupRemember(recalled);
                            const dedupMarked = recallDedupMark(recalled, chatIdCc, String(query.text || ''));
                            if (dedupMarked && dedupMarked.length) {
                                // [DEDUP] 提示项追加到尾部（RRF 已排序，去重标记推后不顶掉新召回）
                                for (const dm of dedupMarked) {
                                    recalled.push({ text: `[DEDUP已覆盖·若本轮查询需更深细节才用] ${dm.text || ''}`, source: 'dedup' });
                                }
                            }
                        } catch (e) { errLog(e, 'recallMemory.跨调用去重'); }
                    }
            } catch (e) { errLog(e, 'onBeforeGeneration.世界推进'); }
                const inj2 = this.buildInjection(recalled);
                // [v3.27] 命中轨迹记录（MemoryPilot monitor）+ 触发词按需注入（AnchorNote anchorOnDemand）
                try {
                    if (this.config.config.trailMonitor) {
                        const srcMap = {};
                        for (const r of (recalled || [])) { const s = String(r?.source || 'other').split('+')[0]; srcMap[s] = (srcMap[s] || 0) + 1; }
                        this._lastRecallTrace = {
                            query: String(query?.text || '').slice(0, 120),
                            sources: srcMap,
                            hitCount: (recalled || []).length,
                            durationMs: Date.now() - (this._traceStartTime || Date.now()),
                            ts: new Date().toISOString(),
                            triggerHit: false
                        };
                    }
                    // 触发词按需注入: 用户最近消息含触发词时，追加对应长指令到注入尾部（省 token——平时不发）
                    const triggerPhrase = this.config.config.onDemandTriggerPhrase;
                    if (triggerPhrase) {
                        const users = window.SillyTavern?.getContext?.()?.chat?.filter(m => m.is_user) || [];
                        const lastUser = users.length ? String(users[users.length - 1]?.mes || '') : '';
                        const worldNote = this.worldProg?.toInjection?.() || [];
                        const noteText = worldNote.map(w => w.text || w.content || '').filter(Boolean).slice(0, 5).join('\n');
                        if (lastUser.includes(triggerPhrase) && noteText) {
                            inj2 += '\n\n〔场外世界推进·按需指令已触发〕' + noteText;
                            if (this._lastRecallTrace) this._lastRecallTrace.triggerHit = true;
                        }
                    }
                } catch (e) { errLog(e, 'onBeforeGeneration.轨迹/触发词'); }
                try {
                    const cc = window.SillyTavern?.getContext?.()?.chat || [];
                    this._recallCache = {floor: cc.length - 1, queryKey: String(query.text || '').slice(0, 200), injection: inj2};
                } catch (e) { errLog(e, 'cleanMessageText'); }
                return inj2;
            } catch (err) {
                return '';
            }
        }
        // [v2.4] RE: 是否值得跑召回——最近5楼就在全部对话里(无更早历史)则没有可召回的旧事
        // [v2.8] RT-C: 物品台账重建（ops 真源重放——事件溯源范式，与 status/scene 一致）
        // [v3.2] DF3: 物品 op 清洗（LLM 原文直存 ops，desc/holder 无长度上限会撑爆注入与存档）
        _sanitizeItemOp(op) {
            try {
                if (!op || typeof op !== 'object') return null;
                const action = op.action === 'add' ? 'add' : (op.action === 'update' ? 'update' : '');
                const name = String(op.name || '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 40);
                if (!action || !name) return null;
                const clean = { action, name, floor: Math.max(0, Math.round(Number(op.floor) || 0)) };
                const desc = String(op.desc || '').trim();
                const holder = String(op.holder || '').trim();
                const state = String(op.state || '').trim();
                if (desc) clean.desc = desc.slice(0, 80);
                if (holder) clean.holder = holder.slice(0, 20);
                if (state) clean.state = state.slice(0, 10);
                return clean;
            } catch (e) { errLog(e, 'DF3.sanitizeItemOp'); return null; }
        }
        rebuildItems() {
            // [v3.3] 台账重放化：只应用「指纹匹配当前聊天」的 ops（baibai leafValid 语义——
            // 编辑/swipe 自动失活、翻回复活、删楼自愈；carried（携带自旧档）/无 fp（旧数据）不过滤）
            let chat = null;
            try { const c = window.SillyTavern?.getContext?.()?.chat; chat = Array.isArray(c) ? c : null; } catch (e) {}
            const liveFp = chat ? new Set(chat.map(m => msgFpOf(m))) : null;
            const map = new Map();
            let skipped = 0;
            for (const rawOp of (this.itemOps || [])) {
                const op = this._sanitizeItemOp(rawOp);   // [v3.2] DF3: 渲染前清洗（真源不动，旧档兼容）
                if (!op) continue;
                if (chat && rawOp && rawOp.fp && rawOp.carried !== true && !liveFp.has(rawOp.fp)) { skipped++; continue; }
                const exist = map.get(op.name);
                if (op.action === 'add' && !exist) {
                    map.set(op.name, { name: op.name, desc: String(op.desc || '').slice(0, 80), holder: String(op.holder || '').slice(0, 20), state: '完好', floor: op.floor });
                } else if (op.action === 'update' && exist) {
                    if (op.holder) exist.holder = String(op.holder).slice(0, 20);
                    if (op.state) exist.state = String(op.state).slice(0, 10);
                    exist.floor = op.floor;
                }
            }
            // [v3.2] DF3: 派生视图硬上限（真源 itemOps 不裁剪，重放语义不受影响）
            this.items.records = Array.from(map.values()).slice(-25);
            this.items._stale = skipped;   // [v3.3] 失活计数（selfCheck 展示）
        }
        // [v3.3] 台账重放化：楼层回滚改为「全量指纹对账」（不再硬过滤——
        // 编辑楼 f 只失活 f 自己的 ops，f+1.. 楼指纹未变继续生效；删楼前移按指纹重新定位自愈）
        rollbackItemsFrom(floor) {
            return this.reconcileItemOps();
        }
        reconcileItemOps() {
            let removed = 0, healed = 0, adopted = 0;
            try {
                let chat = null;
                try { const c = window.SillyTavern?.getContext?.()?.chat; chat = Array.isArray(c) ? c : null; } catch (e) {}
                if (!chat) { this.rebuildItems(); return 0; }
                const byFp = new Map();   // fp → [floor...]（保序）
                chat.forEach((m, i) => { const fp = msgFpOf(m); if (!fp) return; const arr = byFp.get(fp); if (arr) arr.push(i); else byFp.set(fp, [i]); });
                const next = [];
                for (const op of (this.itemOps || [])) {
                    if (!op || typeof op !== 'object') continue;
                    if (op.carried === true) { next.push(op); continue; }   // 携带自旧档：无对应楼层，永久有效
                    if (!op.fp) {
                        // 旧档迁移：按当前楼层补采指纹；楼不存在则清理
                        const m = chat[op.floor];
                        if (m) { op.fp = msgFpOf(m); adopted++; next.push(op); } else { removed++; }
                        continue;
                    }
                    const positions = byFp.get(op.fp);
                    if (positions && positions.length) {
                        // 自愈：指纹在聊天中重新定位（删楼前移等）→ 取最接近原 floor 的位置
                        let best = positions[0];
                        for (const p of positions) { if (Math.abs(p - op.floor) < Math.abs(best - op.floor)) best = p; }
                        if (op.floor !== best) { op.floor = best; healed++; }
                        next.push(op);
                    } else if (Math.floor(Number(op.floor) || 0) >= chat.length) {
                        removed++;   // 楼整体不存在且指纹全局无匹配 → 清理
                    } else {
                        next.push(op);   // 楼在但文本已变（编辑/swipe）→ 保留失活（可能翻回复活）
                    }
                }
                this.itemOps = next;
                this.rebuildItems();
            } catch (e) { errLog(e, 'V33.reconcileItemOps'); }
            if ((removed || healed || adopted) && this.config?.config?.debugMode) console.log(`[${PLUGIN_NAME}] 台账对账: 清理 ${removed} / 自愈 ${healed} / 补采 ${adopted}`);
            return removed;
        }
        // [v3.3] 当前有效 ops 列表（打包/导出用）：carried 或指纹匹配当前聊天；无 fp 旧档保留（下游标 carried 兜底）
        activeItemOps() {
            let chat = null;
            try { const c = window.SillyTavern?.getContext?.()?.chat; chat = Array.isArray(c) ? c : null; } catch (e) {}
            if (!chat) return [...(this.itemOps || [])];
            const liveFp = new Set(chat.map(m => msgFpOf(m)));
            return (this.itemOps || []).filter(o => {
                if (!o || typeof o !== 'object') return false;
                if (o.carried === true) return true;
                if (!o.fp) return true;
                return liveFp.has(o.fp);
            });
        }

        // [v3.5] 补提取：扫出「AI 楼且无摘要」的缺口（插件禁用期/提取失败/中途安装的场景）
        // 判定：非 user、非系统、非番外楼、正文非空、且 summaries 无该楼层记录
        scanMissingFloors() {
            const missing = [];
            try {
                const chat = window.SillyTavern?.getContext?.()?.chat;
                if (!Array.isArray(chat)) return missing;
                const covered = new Set((this.summary?.summaries || []).map(s => s.floor));
                // [v3.19] 增量书签裁剪（ruby）: 从书签处开始扫描（省全量扫描）
                const fromFloor = (this.bookmarks && this.bookmarks.get('scan')) || 0;
                // 番外楼（lonsha_omit）与空楼跳过；user 楼不提取（提取管线只处理 AI 楼）
                for (let i = Math.max(fromFloor, 0); i < chat.length; i++) {
                    const m = chat[i];
                    if (!m || m.is_user) continue;
                    if (m.is_system === true) continue;
                    if (this.isOmittedFloor(m)) continue;
                    const text = String(m.mes || '').trim();
                    if (!text) continue;
                    if (covered.has(i)) continue;
                    missing.push(i);
                }
            } catch (e) { errLog(e, 'BF.scanMissingFloors'); }
            return missing;
        }
        // [v3.5] 补提取指定楼层（复跑提取管线——复用 onMessageReceived 的提取段，但跳过摘要回滚等）
        // 上限保护：单次最多 30 楼（防一次扫全车）；带互斥锁防与实时提取并发
        async backfillFloors(floors, onProgress) {
            const done = { ok: 0, fail: 0, skipped: 0 };
            try {
                const acquired = await this.mutex.acquire();
                if (!acquired) { console.warn(`[${PLUGIN_NAME}] 补提取排队超时（实时提取进行中）`); return done; }
                try {
                    const chat = window.SillyTavern?.getContext?.()?.chat || [];
                    const list = (Array.isArray(floors) ? floors : []).slice(0, 30);
                    for (const idx of list) {
                        const m = chat[idx];
                        if (!m || !String(m.mes || '').trim()) { done.skipped++; continue; }
                        try {
                            // 复用主管线消息对象构造（与 onMessageReceived 相同语义）
                            const msg = { ...m, index: idx };
                            msg.mes = this.cleanMessageText(msg.mes || '');
                            if (!msg.mes) { done.skipped++; continue; }
                            const extracted = await this.extractMemoryWithLLM(msg);
                            // 只补「图谱节点/关系 + 摘要」核心两类（保召回可用）；细粒度子系统（状态/悬念/物品）交后续实时楼带动
                            // 去重纪律：addNode 不去重（每次新 id）——补提取对角色节点先查后建，防历史重灌放大重复
                            if (extracted?.characters) {
                                for (const char of extracted.characters) {
                                    try {
                                        const canonical = this.resolveCharacterName(char);
                                        const exist = this.graph.findByNames([canonical]).some(n => n.type === 'character');
                                        if (!exist) this.graph.addNode({type: 'character', name: canonical, data: {source: msg.mes}});
                                    } catch (e) {}
                                }
                            }
                            if (extracted?.events) {
                                for (const event of extracted.events) {
                                    try {
                                        const nodeId = this.graph.addNode({type: 'event', name: event.type, data: {...event, backfillFloor: idx}});
                                        for (const p of (event.participants || [])) {
                                            try { this.graph.addEdge({from: p, to: nodeId, label: 'participated_in'}); } catch (e) {}
                                        }
                                    } catch (e) {}
                                }
                            }
                            if (extracted?.relationships) {
                                for (const rel of extracted.relationships) {
                                    try {
                                        this.graph.addEdge({from: this.resolveCharacterName(rel.from), to: this.resolveCharacterName(rel.to), label: rel.type, weight: 1.0, data: {attitude: rel.attitude || 'neutral', note: rel.note || ''}});
                                    } catch (e) {}
                                }
                            }
                            if (extracted?.summary) await this.summary.createSummary(msg, extracted.summary);
                            done.ok++;
                            if (typeof onProgress === 'function') { try { onProgress(idx, done); } catch (e) {} }
                        } catch (e) { errLog(e, `BF.backfill.floor${idx}`); done.fail++; }
                    }
                } finally { if (this.config.config.extractionLockEnabled) this.mutex.release(); }
                    } catch (e) { errLog(e, 'BF.backfillFloors'); }
                    // [v3.19] 补提取完成后推进书签
                    try { if (this.bookmarks && floors?.length) this.bookmarks.save('scan', Math.max(...floors) + 1); } catch (e) {}
            if (done.ok || done.fail) {
                try { await this.storage.save(this.getCurrentChatId(), this.collectExport()); } catch (e) { errLog(e, 'BF.backfill.save'); }
            }
            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 补提取完成: ${done.ok}成/${done.fail}败/${done.skipped}跳`);
            return done;
        }

        // [v2.9] RU-B: 记忆优化器（抄 shujuku optimization——防长对话记忆无限膨胀）
        optimizeMemory() {
            let removed = 0;
            // 1. 向量文本级去重（完全相同文本只留最新）
            const seen = new Map();
            for (const v of this.vector.vectors) {
                const key = String(v.text || '').trim();
                if (!key) continue;
                const prev = seen.get(key);
                if (prev && prev.timestamp <= v.timestamp) { prev._dup = true; seen.set(key, v); }
                else if (prev) { v._dup = true; }
                else seen.set(key, v);
            }
            const beforeDup = this.vector.vectors.length;
            this.vector.vectors = this.vector.vectors.filter(v => !v._dup);
            removed += beforeDup - this.vector.vectors.length;
            // 2. 向量硬上限（超限按遗忘价值淘汰）
            const vMax = this.config.config.vectorMaxCount || 500;
            if (this.vector.vectors.length > vMax) {
                // [v3.1] SF3: 遗忘价值淘汰（importance/10 × recency × (1+accessFreq)，淘汰没人在乎的而非最老的）
                const now = Date.now();
                const rv = (v) => {
                    const ageH = Math.max(0.5, (now - (v.timestamp || now)) / 3600000);
                    const recency = 1 / (1 + Math.log10(1 + ageH));
                    const accessFreq = (v.accessCount || 0) / Math.max(1, ageH / 24);
                    return ((v.importance || 5) / 10) * recency * (1 + accessFreq);
                };
                this.vector.vectors.sort((a, b) => rv(a) - rv(b));
                const cut = this.vector.vectors.length - vMax;
                this.vector.vectors = this.vector.vectors.slice(cut);
                removed += cut;
            }
            // 3. 摘要硬上限（已折叠的最旧条目物理删除；maybeFold 负责合并，这里兜底）
            const sMax = this.config.config.summaryMaxCount || 400;
            const sums = this.summary.summaries;
            if (sums.length > sMax) {
                const foldedOld = sums.filter(s => s.folded);
                const foldable = Math.min(sums.length - sMax, foldedOld.length);
                if (foldable > 0) {
                    const removeIds = new Set(foldedOld.slice(0, foldable).map(s => s.floor));
                    this.summary.summaries = sums.filter(s => !removeIds.has(s.floor));
                    removed += foldable;
                }
            }
            // 3b. [v3.8] 孤儿物资 ops 清理（v3.8 多变体保留后的必要对账：fp 不在该楼任何 swipe 取值中的 ops 是彻底废除的变体）
            try {
                const chat = window.SillyTavern?.getContext?.()?.chat;
                if (Array.isArray(chat) && this.itemOps?.length) {
                    const floorFps = new Map();   // floor → Set(该楼所有 swipe 文本的 fp)
                    chat.forEach((m, i) => {
                        const set = new Set();
                        set.add(msgFpOf(m));
                        if (Array.isArray(m?.swipes)) {
                            for (let sw = 0; sw < m.swipes.length; sw++) {
                                if (typeof m.swipes[sw] === 'string') {
                                    set.add([(m?.is_user === true || m?.role === 'user') ? 'u' : 'a', sw, hash32(m.swipes[sw]), String(m?.send_date || m?.extra?.send_date || '')].join('|'));
                                }
                            }
                        }
                        floorFps.set(i, set);
                    });
                    const beforeOps = this.itemOps.length;
                    this.itemOps = this.itemOps.filter(o => {
                        if (!o || typeof o !== 'object') return false;
                        if (o.carried === true || !o.fp) return true;   // carried/旧档保留
                        const set = floorFps.get(o.floor);
                        if (!set) return Math.floor(Number(o.floor) || 0) < chat.length;   // 越界清（楼层不存在）；界限内保（pending）
                        return set.has(o.fp);
                    });
                    const opGone = beforeOps - this.itemOps.length;
                    if (opGone > 0) { removed += opGone; this.rebuildItems(); }
                }
            } catch (e) { errLog(e, 'HS.孤儿ops清理'); }
            // 4. [v3.6] 图谱重复角色节点合并（兜底：对历史已膨胀的图谱——同归一化名只留最早一个，迁移边）
            try {
                const byName = new Map();
                const dupIds = [];
                for (const node of Array.from(this.graph.nodes.values())) {
                    if (node.type !== 'character' || !node.name) continue;
                    const nk = normalizeCharName(node.name);
                    const prev = byName.get(nk);
                    if (!prev) { byName.set(nk, node); continue; }
                    // 保留更早创建的，另一个标记合并
                    const [keep, drop] = (prev.timestamp || 0) <= (node.timestamp || 0) ? [prev, node] : [node, prev];
                    byName.set(nk, keep);
                    dupIds.push({ keepId: keep.id, dropId: drop.id });
                }
                for (const { keepId, dropId } of dupIds) {
                    // 迁移边: 指向 drop 的边重定向到 keep（去重后 addEdge 复合 id 天然去重）
                    for (const [eid, e] of Array.from(this.graph.edges)) {
                        if (e.from === dropId || e.to === dropId) {
                            this.graph.edges.delete(eid);
                            const newFrom = e.from === dropId ? keepId : e.from;
                            const newTo = e.to === dropId ? keepId : e.to;
                            if (newFrom !== newTo) this.graph.edges.set(`${newFrom}-${newTo}-${e.label || 'related'}`, {...e, from: newFrom, to: newTo, id: `${newFrom}-${newTo}-${e.label || 'related'}`});
                        }
                    }
                    this.graph.nodes.delete(dropId);
                    removed++;
                }
                if (dupIds.length) this.graph.rebuildNameIndex();
                if (dupIds.length && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 图谱去重: 合并 ${dupIds.length} 个重复角色节点`);
            } catch (e) { errLog(e, 'GD.图谱去重'); }
            if (removed && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 记忆优化: 清理 ${removed} 条冗余`);
            return removed;
        }

        recallWorthRunning() {
            try {
                const chat = window.SillyTavern?.getContext?.()?.chat || [];
                const aiFloors = chat.filter(m => !m.is_user).length;
                if (aiFloors <= 5) return false;   // 几乎全部在上下文窗口内
                return true;
            } catch (e) { return true; }
        }
        
        async recallMemory(query) {
            const results = {summary: [], graph: [], diary: [], vector: [], diffusion: [], pov: [], timeline: [], bm25: [], volume: [], status: [], holiday: [], suspense: [], presence: [], neuralChain: [], worldProg: []};
            
            results.summary = this.summary.search(query.text);
            
            // [v1.5] 登场角色捕获（抄 HCDiary）：从最近楼层窗口判断谁登场，只召回这些角色的记忆
            const castCaptured = this.captureCast();
            if (castCaptured.length > 0) query.characters = castCaptured;
            
            if (query.characters?.length > 0) {
                results.graph = this.graph.findByNames(query.characters);
                results.diary = this.diary.search(query.characters);
                // [v3.28] 记忆树路由召回（st-memory-wizzard 本地轻量版，无需第二模型）:
                // 用图谱角色节点做「树路径」，命中角色的邻接事件/关系/物品作为该角色子树召回
                // 无前快模型时用现有 host 召回替代路由（角色→图谱边→关联记忆）
                try {
                    if (this.config.config.memoryTreeEnabled && this.graph?.nodes?.size) {
                        const treePaths = [];
                        for (const ch of query.characters.slice(0, 4)) {
                            const node = this.graph.findCharacterByName(ch);
                            if (!node) continue;
                            // 角色子树的关联：从该角色的图谱边提取关联节点名
                            const neighborNames = new Set();
                            for (const edge of this.graph.edges.values()) {
                                if (edge.from === node.id) neighborNames.add(this.graph.nodes.get(edge.to)?.name);
                                else if (edge.to === node.id) neighborNames.add(this.graph.nodes.get(edge.from)?.name);
                            }
                            for (const nn of neighborNames) {
                                if (!nn || nn === ch) continue;
                                const nm = this.graph.findCharacterByName(nn);
                                if (nm?.data?.description) {
                                    treePaths.push({ id: 'tree_' + node.id + '_' + nm.id, text: `${ch} → ${nn}：${String(nm.data.description).slice(0, 80)}`, source: 'memoryTree', character: ch });
                                }
                            }
                        }
                        if (treePaths.length) {
                            const exists = new Set((results.graph || []).map(g => g.id || g.name || g.node?.id));
                            results.graph = [...(results.graph || []), ...treePaths.filter(t => !exists.has(t.id))].slice(0, this.config.config.vectorTopK * 2 + 4);
                        }
                    }
                } catch (e) { errLog(e, 'recallMemory.记忆树路由'); }
                // [v3.16] 神经链召回（抄 zhino）: 链1(用户→在场角色) + 链2(在场角色→角色间)，链2 去重已注入链1
                try {
                    if (this.config.config.neuralChainEnabled && query.characters.length > 0) {
                        const userQuery = `${query.text || ''}`;
                        const chain1 = query.characters.slice(0, 3).map(c => {
                            const mems = (this.charMem?.search ? this.charMem.search(c, userQuery) : []);
                            return mems.map(m => ({ id: 'c1_' + c + '_' + m.id, text: `${c}：${m.text}`, source: 'neuralChain', chain: 1, character: c }));
                        }).flat().slice(0, 6);
                        // 链2: 在场角色之间（双向），去重已进链1的 id
                        const seenC1 = new Set(chain1.map(x => x.text));
                        const chain2 = [];
                        for (let i = 0; i < query.characters.length; i++) {
                            for (let j = i + 1; j < query.characters.length; j++) {
                                const a = query.characters[i], b = query.characters[j];
                                for (const mem of (this.charMem?.search ? [...this.charMem.search(a, b), ...this.charMem.search(b, a)] : [])) {
                                    const text = `${a}↔${b}：${mem.text}`;
                                    if (!seenC1.has(text)) chain2.push({ id: 'c2_' + mem.id, text, source: 'neuralChain', chain: 2 });
                                }
                            }
                        }
                        results.neuralChain = [...chain1, ...chain2].slice(0, 8);
                    }
                } catch (e) { errLog(e, 'recallMemory.神经链'); }
                
                // Phase 3: 图扩散增强召回
                if (this.config.config.graphDiffusionEnabled && window.LonShaMemory?.diffusion) {
                    try {
                        const seedNodes = results.graph.slice(0, 3);
                        if (seedNodes.length > 0) {
                            // [v3.25] 不应期疲劳：滚轮前先衰减疲劳计数（防永久封印，TriviumDB Refractory）
                            for (const [k, v] of this._diffusionFatigue) {
                                if (v <= 1) this._diffusionFatigue.delete(k);
                                else this._diffusionFatigue.set(k, v - 1);
                            }
                            const diffusionResults = window.LonShaMemory.diffusion.personalizedPageRank(
                                seedNodes, 
                                3, 
                                this.config.config.vectorTopK
                            );
                            // [v3.25] 黑洞降权 + 疲劳抑制（TriviumDB Link Specificity + Refractory）
                            const fatigue = this._diffusionFatigue;
                            const suppressed = [];
                            for (const r of diffusionResults) {
                                const nid = this._nodeIdentity(r);
                                // 疲劳抑制：命中疲劳节点 → 能量×0.15（TriviumDB fatigue_discount）
                                if (nid && fatigue.has(nid)) {
                                    suppressed.push({ ...r, score: (r.score || 0) * 0.15 });
                                    // 被抑制即解除（无记忆效应）
                                    fatigue.delete(nid);
                                } else {
                                    suppressed.push(r);
                                }
                            }
                            // DPP多样性采样（用抑制后的结果）
                            const diverseResults = window.LonShaMemory.diffusion.diversitySampling(
                                suppressed,
                                Math.min(5, suppressed.length),
                                this.config.config.dppLambda
                            );
                            results.diffusion = diverseResults.map(r => ({
                                ...r.node,
                                score: r.score,
                                source: 'diffusion'
                            }));
                            // [v3.25] Top-N 赢家打疲劳标（下一轮抑制热点）
                            for (const r of results.diffusion.slice(0, this._diffusionFatigueTopN)) {
                                const nid = this._nodeIdentity({ node: r });
                                if (nid) this._diffusionFatigue.set(nid, this._diffusionFatigueTimeout);
                            }
                            if (this.config.config.debugMode) {
                                console.log(`[${PLUGIN_NAME}] 图扩散召回: ${results.diffusion.length}条`);
                            }
                        }
                    } catch (err) {
                        console.warn(`[${PLUGIN_NAME}] 图扩散失败:`, err);
                    }
                }
            }
            
            // [v2.4] RE: 多查询召回——主查询 + rewriteQuery 改写的查询分别检索，结果并入同一路（RRF 会融合）
            if (this.config.config.vectorEnabled && query.text) {
                const vectorResults = await this.vector.search(query.text, this.config.config.vectorTopK);
                results.vector = vectorResults.map(v => ({
                    text: v.text,
                    score: v.score,
                    metadata: v.metadata,
                    source: 'vector'
                }));
                if (Array.isArray(query.queries) && query.queries.length) {
                    for (const q2 of query.queries) {
                        try {
                            const more = await this.vector.search(q2, 3);
                            for (const v of more) results.vector.push({text: v.text, score: v.score * 0.9, metadata: v.metadata, source: 'vector'});
                        } catch (e) { errLog(e, 'recallMemory.图扩散'); }
                    }
                }
            }
            
            // [v1.9] P1: BM25 稀疏检索召回
            if (this.config.config.bm25Enabled && this.bm25.N && query.text) {
                try {
                    results.bm25 = this.bm25.search(query.text, this.config.config.bm25TopK || 5, {cliffCut: true, minResults: 2})
                        .map(d => ({id: d.id, text: d.text, floor: d.floor, score: d.score, source: 'bm25'}));
                    // [v3.31] BM25 命中碎片也加热（按 text 回找 vector 条目；无则静默跳过）
                    if (this.config.config.heatOnRecallEnabled) {
                        for (const b of results.bm25) { try { this.vector.heatByText(b.text); } catch (e) {} }
                    }
                    if (Array.isArray(query.queries) && query.queries.length) {
                        const seenB = new Set(results.bm25.map(x => x.id));
                        for (const q2 of query.queries) {
                            for (const d of this.bm25.search(q2, 3)) {
                                if (!seenB.has(d.id)) { seenB.add(d.id); results.bm25.push({id: d.id, text: d.text, floor: d.floor, score: d.score, source: 'bm25'}); }
                            }
                        }
                    }
                } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] BM25检索失败:`, e); }
            }
            // [v1.9] P1: 卷摘要召回（已折叠的高层概括）
            if (this.config.config.summaryFoldEnabled && this.summary.volumes.length) {
                results.volume = this.summary.searchVolumes(2)
                    .map(v => ({id: v.id, text: `【卷${v.floorStart}-${v.floorEnd}】${v.text}`, floor: v.floorStart, source: 'volume'}));
            }
            
            // [v2.1] P3: 节日感知召回（剧情日期临近节日时，用节日关键词召回相关记忆）
            if (this.config.config.holidayAware) {
                try {
                    const sd = this.getLatestStoryDate();
                    const h = sd ? this.holiday.current(sd) : null;
                    if (h) {
                        const kw = this.holiday.keywords(h.name);
                        const kwHits = [];
                        if (kw.length) {
                            for (const s of this.summary.getActiveSummaries()) {
                                if (kw.some(k => s.text.includes(k))) kwHits.push({id: 'hol_' + s.floor, text: s.text, floor: s.floor, holiday: h.name, source: 'holiday'});
                            }
                            results.holiday = kwHits.slice(0, 3);
                        }
                        if (this.config.config.debugMode && h) console.log(`[${PLUGIN_NAME}] 🎉 节日感知: ${h.name} (偏移${h.offsetDays}天)`);
                    }
                } catch (e) { errLog(e, 'recallMemory.物品召回'); }
            }
            
            // [v2.0] P2: 角色状态召回（只取当前登场角色）
            if (this.config.config.characterStateEnabled && Object.keys(this.status.characters || {}).length) {
                const presentCast = this.captureCast();
                const owners = presentCast.length ? presentCast : (window.SillyTavern?.getContext?.()?.name2 ? [window.SillyTavern.getContext().name2] : []);
                if (owners.length) {
                    results.status = this.status.searchByNames(owners, 5).map(r => ({
                        name: r.name, fields: r.fields, todos: r.todos, source: 'status'
                    }));
                }
            }
            
            // [v1.8] P0: 剧情时间线召回（按剧情日期相近度）
            // [v3.23] 时间感知检索（NE-Memory）: 若查询含时间约束（Day X/月/日期），优先按约束过滤时间线
            if (this.config.config.plotTimeline && this.timeline.entries.length) {
                const anchorDate = this.getLatestStoryDate();
                const tcQuery = parseStoryTimeConstraint(query.text);
                let timelinePool = this.timeline.entries;
                if (tcQuery) {
                    const filteredTl = filterTimelineByConstraint(this.timeline.entries, tcQuery);
                    if (filteredTl.length > 0) timelinePool = filteredTl;
                }
                if ((tcQuery ? timelinePool.length > 0 : anchorDate)) {
                    const relOn = this.config.config.relativeTime !== false;
                    const tlSource = tcQuery
                        ? [...timelinePool].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5)
                        : this.timeline.searchNear(anchorDate, this.config.config.timelineWindowDays, 5);
                    results.timeline = tlSource
                        .map(e => {
                            // [v2.2] RC: 相对时间前缀（"3天前·3月12日"），解析失败不加（宁可不标绝不标错）
                            let rel = '';
                            if (relOn) {
                                try { rel = relativePrefix(e.date, anchorDate); } catch (err) { rel = ''; }
                            }
                            return {id: e.id, text: `[${rel ? rel + '·' : ''}${e.date}] ${e.text}`, date: e.date, floor: e.floor, source: 'timeline', importance: e.importance || 5};
                        });
                }
            }
            
            // [v2.8] RT-C: 物品台账召回（当前登场角色持有/查询命中的物品）
            if (this.config.config.itemLedgerEnabled && this.itemOps?.length) {
                const cast = this.captureCast();
                const relevant = this.items.records.filter(r =>
                    cast.some(c => (r.holder || '').includes(c)) || (query.text && query.text.includes(r.name))
                ).slice(-5);
                if (relevant.length) {
                    results.items = relevant.map(r => ({ text: `${r.name}（${r.holder || '无主'}持有，${r.state}）${r.desc ? '：' + r.desc : ''}`, source: 'items' }));
                }
            }
            // [v2.8] RT-B: 反思召回（重要度 Top-2）
            if (this.config.config.reflectionEnabled && this.reflection?.items?.length) {
                results.reflections = this.reflection.search(2).map(r => ({ text: `洞察：${r.insight}${r.suggestion ? '（提示：' + r.suggestion + '）' : ''}`, source: 'reflection' }));
            }

            // [v1.7] RubyPhone 联动②: 手机记忆库作为一路召回源
            if (this.config.config.rubyPhoneRecall && query.text) {
                try {
                    const bridge = window.VirtualPhone?.lonshaBridge;
                    if (bridge?.recall) {
                        const phoneHits = bridge.recall(query.text, this.config.config.rubyPhoneRecallTopN || 3);
                        if (phoneHits.length) {
                            results.rubyphone = phoneHits.map(h => ({
                                text: h.content,
                                score: h.score,
                                metadata: { layer: h.layer, source: 'rubyphone' },
                                source: 'rubyphone'
                            }));
                        }
                    }
                } catch (e) {
                    if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] RubyPhone召回失败:`, e);
                }
            }
            
            // [v2.4] RE: 在场分档——不在场已登场角色给极简档（防 AI 让不在场的人凭空出现）
            if (this.config.config.presenceInjection) {
                try {
                    const castNow = castCaptured.length ? castCaptured : query.characters || [];
                    const absent = this.getKnownCharacters()
                        .filter(n => !castNow.includes(n))
                        .map(n => {
                            const loc = this.status?.characters?.[n]?.fields?.['位置'];
                            return { name: n, loc: loc || null };
                        })
                        .slice(0, 6);
                    results.presence = absent.map(a => ({
                        id: 'abs_' + a.name, text: a.loc ? `${a.name}（现在: ${a.loc}，不在场）` : `${a.name}（不在场）`,
                        source: 'presence'
                    }));
                } catch (e) { errLog(e, 'recallMemory.HolidayAware'); }
            }
            
            // [v2.2] RC: 悬念簿召回（未了结悬项 + 近期了结，防 AI 把办完的事反复提/把伏笔写丢）
            if (this.config.config.suspenseEnabled && this.suspense.items.length) {
                try {
                    const openList = this.suspense.openItems().slice(0, 8).map(x => ({
                        id: x.id, text: `${x.kind === 'suspense' ? '未解之谜' : '约定/目标'}（第${x.floor != null ? x.floor + '楼立下' : '早期'}）: ${x.content}`,
                        floor: x.floor, source: 'suspense'
                    }));
                    const resolvedList = this.suspense.recentlyResolved(3).map(x => ({
                        id: x.id, text: `已了结[${x.outcome === 'done' ? '完成' : x.outcome === 'cancelled' ? '取消' : '失败'}]${x.resolvedReason ? '：' + x.resolvedReason : ''} — 原项: ${x.content}`,
                        floor: x.resolvedFloor, source: 'suspense'
                    }));
                    results.suspense = openList.concat(resolvedList);
                } catch (e) { errLog(e, 'recallMemory.POV时序'); }
            }
            
            // [v1.8] P0: POV 私密记忆召回（只取当前登场角色的，防剧透）
            if (this.config.config.povIsolation && this.pov.povs.length) {
                const present = this.captureCast();
                const owners = present.length ? present : (window.SillyTavern?.getContext?.()?.name2 ? [window.SillyTavern.getContext().name2] : []);
                if (owners.length) {
                    results.pov = this.pov.search(owners, this.config.config.povMaxPerTurn || 3)
                        .map(p => ({id: p.id, owner: p.owner, text: p.content, floor: p.floor, source: 'pov'}));
                }
            }
            
            // [v3.30] PV: superseded 摘要排除 —— 被换代压制的记忆退出召回
            if (window.LonShaSupersede && this.config.config.supersedeEnabled && results.summary?.length) {
                try {
                    results.summary = results.summary.filter(item => {
                        const key = item.id || (item.source === 'summary' ? 'sum_' + item.floor : null);
                        return !(key && this.supersede.isSuperseded(key));
                    });
                } catch (e) { errLog(e, 'recallMemory.supersede过滤'); }
            }
            
            // [v2.3] RD: 两阶段精排 (抄 baibai recall: 多路粗召回 → LLM rerank 精排)
            const merged = this.hybridMerge(results);
            if (this.config.config.rerankEnabled && merged.length > 3 && query.text) {
                try {
                    const candN = this.config.config.rerankCandidates || 12;
                    const candidates = merged.slice(0, candN);
                    const rest = merged.slice(candN);
                    const order = await this.llm.rerank(query.text, candidates);
                    if (order && order.length) {
                        const picked = order.map(i => candidates[i]).filter(Boolean);
                        const restSet = new Set(candidates.filter((_, i) => !order.includes(i)));
                        return [...picked, ...restSet, ...rest];
                    }
                } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] rerank失败(降级):`, e); }
            }
            return merged;
        }
        
        // [v1.5] RRF 倒数排名融合（抄 shujuku reciprocalRankFusion）——
        // 比固定权重 alpha 更稳健：不需要调参，多路召回中同时命中的记忆自动获得更高分
        hybridMerge(results) {
            const K = 60; // RRF 标准常数
            const lists = [
                results.vector || [],
                results.diffusion || [],
                results.graph || [],
                results.summary || [],
                results.diary || [],
                results.rubyphone || [],
                results.timeline || [],
                results.pov || [],
                results.bm25 || [],
                results.volume || [],
                results.status || [],
                results.holiday || [],
                results.suspense || [],
                results.presence || []
            ];
            const byKey = new Map();
            lists.forEach((list, listIdx) => {
                list.forEach((item, rank) => {
                    const key = item.id || item.text || item.name || JSON.stringify(item).substring(0, 80);
                    const rrfScore = 1 / (K + rank + 1);
                    const prev = byKey.get(key);
                    byKey.set(key, {
                        ...item,
                        rrfScore: (prev?.rrfScore || 0) + rrfScore,
                        hits: (prev?.hits || 0) + 1,   // 被几路召回命中
                        source: prev?.source ? prev.source + '+' : ['vector','diffusion','graph','summary','diary','rubyphone','timeline','pov','bm25','volume','status','holiday','suspense','presence'][listIdx]
                    });
                });
            });
            const merged = Array.from(byKey.values());
            merged.sort((a, b) => (b.rrfScore || 0) - (a.rrfScore || 0));
            const top = merged.slice(0, this.config.config.vectorTopK * 2);
            if (this.config.config.debugMode) {
                console.log(`[${PLUGIN_NAME}] RRF融合: ${merged.length} 项, 多路命中: ${top.filter(t => t.hits > 1).length} 项`);
            // [v3.16] 神经链 + 世界推进 汇入召回结果
            if (results.neuralChain?.length) for (const nc of results.neuralChain) { if (!top.some(t => (t.text||'') === nc.text)) top.push(nc); }
            if (results.worldProg?.length) for (const wp of results.worldProg) { if (!top.some(t => (t.text||'') === wp.text)) top.push(wp); }
            }
            return top;
        }

        _legacyHybridMerge(results) {
            const alpha = this.config.config.hybridAlpha;
            const merged = [];
            const seen = new Set();
            
            // 向量检索结果 (权重 α)
            for (const v of results.vector || []) {
                const key = v.text || JSON.stringify(v.metadata);
                if (!seen.has(key)) {
                    seen.add(key);
                    merged.push({...v, finalScore: v.score * alpha, source: 'vector'});
                }
            }
            
            // 图扩散结果 (权重 α * 0.8)
            for (const d of results.diffusion || []) {
                const key = d.id || d.name || JSON.stringify(d);
                if (!seen.has(key)) {
                    seen.add(key);
                    merged.push({...d, finalScore: d.score * alpha * 0.8, source: 'diffusion'});
                }
            }
            
            // 其他结果均分剩余权重
            const remainingWeight = (1 - alpha) / 3;
            for (const source of [results.graph, results.summary, results.diary]) {
                for (const item of source || []) {
                    const key = item.id || item.text || item.name || JSON.stringify(item);
                    if (!seen.has(key)) {
                        seen.add(key);
                        merged.push({...item, finalScore: remainingWeight, source: 'graph/summary/diary'});
                    }
                }
            }
            
            merged.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
            return merged.slice(0, this.config.config.vectorTopK * 2);
        }
        
        buildQuery(context) {
            const recentMsgs = window.SillyTavern?.getContext?.()?.chat?.slice(-5) || [];
            const text = recentMsgs.map(m => m.mes).join(' ');
            return {text, characters: this.extractCharactersFromContext(text), queries: null};
        }
        
        extractCharactersFromContext(text) {
            const chars = new Set();
            const ctx = window.SillyTavern?.getContext?.();
            if (ctx?.name2) chars.add(ctx.name2);
            if (ctx?.name1) chars.add(ctx.name1);
            return Array.from(chars);
        }
        
        // [v1.5] 注入格式（抄 baibai 私密简报包裹 + HCDiary 分区结构）
        buildInjection(recalled) {
            if (!recalled?.length) return '';
            const NOTE = '〔记忆系统私密简报｜仅你可见〕以下内容帮助保持剧情连贯;严禁在回复正文中复述、罗列或提及本节内容。';
            const END = '〔私密简报结束〕请像一个已读过前情的叙述者那样自然续写,不要复述简报本身。';
            
            // 分区：剧情摘要 / 角色关系 / 角色日记 / 手机记忆（抄 HCDiary 的分类注入）
            const summaries = [], relations = [], diaries = [], phoneMem = [], timelines = [], povs = [], volumes = [], bm25Hits = [], statuses = [], holidays = [], suspenses = [], itemRecs = [], reflectRecs = [], neuralChains = [], worldProgs = [], dedupNotes = [], treeNotes = [];
            for (const item of recalled.slice(0, this.config.config.vectorTopK * 2)) {
                if (item.source === 'worldprogress') worldProgs.push(item);
                else if (item.source === 'neuralChain') neuralChains.push(item);
                else if (item.source === 'items') itemRecs.push(item);
                else if (item.source === 'reflection') reflectRecs.push(item);
                else if (item.source === 'status') statuses.push(item);
                else if (item.source === 'suspense') suspenses.push(item);
                else if (item.source?.includes('holiday')) holidays.push(item);
                else if (item.source?.includes('volume')) volumes.push(item);
                else if (item.source === 'bm25') bm25Hits.push(item);
                else if (item.source?.includes('pov')) povs.push(item);
                else if (item.source?.includes('timeline')) timelines.push(item);
                else if (item.source?.includes('rubyphone')) phoneMem.push(item);
                else if (item.source?.includes('diary')) diaries.push(item);
                else if (item.source?.includes('graph')) relations.push(item);
                else if (item.source === 'memoryTree') treeNotes.push(item);
                else if (item.source === 'dedup') dedupNotes.push(item);
                else summaries.push(item);
            }
            
            const blocks = [];
            if (volumes.length) {
                blocks.push('[早前剧情概括·卷]');
                const seenV = new Set();
                volumes.forEach(i => {
                    const key = i.text || '';
                    if (seenV.has(key)) return;
                    seenV.add(key);
                    blocks.push(`- ${key}`);
                });
            }
            if (summaries.length) {
                blocks.push('[前情摘要]');
                summaries.forEach(i => blocks.push(`- ${i.text || i.summary || i.name || ''}`));
            }
            if (bm25Hits.length) {
                const seenB = new Set((summaries.length ? summaries : []).map(x => x.text));
                const fresh = bm25Hits.filter(b => !seenB.has(b.text));
                if (fresh.length) {
                    blocks.push('[相关片段·关键词命中]');
                    fresh.forEach(i => blocks.push(`- ${i.text || ''}`));
                }
            }
            if (statuses.length) {
                blocks.push('[角色状态]');
                statuses.forEach(s => {
                    const fieldText = (s.fields || []).map(([k, v]) => `${k}:${v}`).join(' | ');
                    const todoText = (s.todos || []).length ? `；待办: ${s.todos.map(t => (t.date ? `${t.date} ` : '') + t.text).join('、')}` : '';
                    blocks.push(`- ${s.name}${fieldText ? ' — ' + fieldText : ''}${todoText}`);
                });
            }
            if (relations.length) {
                blocks.push('[角色关系]');
                relations.forEach(i => {
                    const att = i.data?.attitude === 'positive' ? '友好' : i.data?.attitude === 'negative' ? '排斥' : '中立';
                    blocks.push(`- ${i.from || i.name} → ${i.to || ''}：${i.label || '相关'}[${att}]`);
                });
            }
            if (treeNotes.length) {
                // [v3.28] 记忆树路由召回（st-memory-wizzard）
                blocks.push('[记忆树·角色关联]');
                treeNotes.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (diaries.length) {
                blocks.push('[角色日记·近期]（第一人称心声，仅作内心参考，不得在对话中直接引用原文）');
                diaries.forEach(i => blocks.push(`- ${i.name || i.character || ''}（${i.floor != null ? '第' + i.floor + '楼' : ''}${i.mood ? '·' + i.mood : ''}）：${i.text || i.entry || ''}${i.secret ? ' ｜未说出口: ' + i.secret : ''}`));
            }
            if (timelines.length) {
                // [v3.32] chronicle timeline tiering (Visual-Memory highlightThreshold idea): key events >=7 top block, rest as list
                const tlKey = timelines.filter(i => (i.importance || 5) >= 7);
                const tlRest = timelines.filter(i => (i.importance || 5) < 7);
                if (tlKey.length) {
                    blocks.push("[关键事件·影响当前]");
                    const seenK = new Set();
                    tlKey.forEach(i => {
                        const key = i.text || "";
                        if (seenK.has(key)) return;
                        seenK.add(key);
                        blocks.push(`- ${key}`);
                    });
                }
                if (tlRest.length) {
                    blocks.push("[剧情时间线]");
                    const seen = new Set();
                    tlRest.forEach(i => {
                        const key = i.text || "";
                        if (seen.has(key)) return;
                        seen.add(key);
                        blocks.push(`- ${key}`);
                    });
                }
            }
            if (dedupNotes.length) {
                // [v3.23] 跨调用去重提示（NE-Memory）: 标记上轮已覆盖项，防连续追问复读
                blocks.push('[已覆盖记忆·防复读]');
                dedupNotes.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (povs.length) {
                const present = this.captureCast();
                const who = present.length ? present.join('、') : '当前角色';
                blocks.push(`〔${who}的内心/私密认知｜仅该角色知晓，其他角色不得表现出已知道〕`);
                povs.forEach(i => blocks.push(`- ${i.owner}：${i.text || ''}`));
            }
            if (phoneMem.length) {
                blocks.push('[手机生活记忆]');
                phoneMem.forEach(i => blocks.push(`- ${i.text || i.content || ''}`));
            }
            const scenesList = [], presenceList = [];
            for (const item of recalled.slice(0, this.config.config.vectorTopK * 2)) {
                if (item.source === 'scene') scenesList.push(item);
                else if (item.source === 'presence') presenceList.push(item);
            }
            if (itemRecs.length) {
                blocks.push('[物品台账]');
                itemRecs.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (reflectRecs.length) {
                blocks.push('[高层洞察]（长线关系趋势/线索，供叙事参考不作事实）');
                reflectRecs.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (this.config.config.sceneEnabled) {
                try {
                    const cur = this.scene.currentKey();
                    if (cur) {
                        const chain = this.scene.chainOf(cur);
                        if (chain.length) {
                            blocks.push('[当前场景]');
                            const line = chain.map(n => n.path[n.path.length - 1] + (n.desc ? `（${n.desc}）` : '')).join(' › ');
                            blocks.push(`- ${line}`);
                        }
                    }
                } catch (e) { errLog(e, 'buildInjection.场景链'); }
            }
            if (scenesList.length) {
                blocks.push('[相关地点]');
                scenesList.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (neuralChains.length) {
                blocks.push('[关系记忆·神经链]（链1用户→角色 / 链2角色↔角色）');
                const seenN = new Set();
                neuralChains.forEach(i => { const key = i.text || ''; if (!seenN.has(key)) { seenN.add(key); blocks.push(`- ${key}`); } });
            }
            if (worldProgs.length) {
                blocks.push('〔场外角色动态｜他们已各自行动，可自然成为后续话题〕');
                const seenW = new Set();
                worldProgs.forEach(i => { const key = i.text || ''; if (!seenW.has(key)) { seenW.add(key); blocks.push(`- ${key}`); } });
            }
            if (presenceList.length) {
                blocks.push('〔不在场角色｜未经剧情发展不得让他们凭空出现或立即知晓场内发生的事〕');
                presenceList.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (suspenses.length) {
                blocks.push('[悬念簿]');
                const seenS = new Set();
                suspenses.forEach(i => {
                    const key = i.text || '';
                    if (seenS.has(key)) return;
                    seenS.add(key);
                    blocks.push(`- ${key}`);
                });
            }
            if (holidays.length) {
                blocks.push(`〔剧情时间临近 ${holidays[0].holiday}｜氛围提示，可自然融入但不强求〕`);
                const seenH = new Set();
                holidays.forEach(i => {
                    const key = i.text || '';
                    if (seenH.has(key)) return;
                    seenH.add(key);
                    blocks.push(`- ${key}`);
                });
            }
            
            if (!blocks.length) return '';
            let full = `\n\n${NOTE}\n${blocks.join('\n')}\n${END}\n`;
            // [v3.25] 召回类型分级 + token 预算双层（MemoryPilot + 记忆库v5）:
            // 常驻分区（role=constant，每轮必注）优先保留；触发分区按预算裁剪
            const RESIDENT_MARKERS = ['[前情摘要]', '[角色状态]', '[角色关系]', '[关键事件·影响当前]', '[剧情时间线]', '[卷]', '[早前剧情概括]'];
            const residentBlocks = blocks.filter(b => RESIDENT_MARKERS.some(m => b.startsWith(m)));
            const triggerBlocks = blocks.filter(b => !RESIDENT_MARKERS.some(m => b.startsWith(m)));
            // [v2.1] P3: 注入预算裁剪（抄 stbme context-window：超预算优先保近期/相关）
            let budget = this.config.config.injectionBudget || 3000;
            // [v3.25] token 预算双层：memoryTokenBudget（记忆注入 token 上限）扣减 keepRecentTokenReserve（最近正文预留）
            const reserve = Number(this.config.config.keepRecentTokenReserve) || 0;
            const tokenBudget = Number(this.config.config.memoryTokenBudget) || 0;
            if (tokenBudget > 0) budget = Math.max(200, Math.min(budget, Math.floor(tokenBudget * 4)));  // token→字符粗换算(~0.25 token/字符)
            if (reserve > 0) budget = Math.max(200, budget - Math.floor(reserve * 4));
            const keepCount = this.config.config.budgetStrategy || 'balanced';
            if (full.length > budget) {
                const strategy = keepCount;
                if (strategy === 'relevance') {
                    // 常驻全保留 + 触发保留 RRF 前 60%
                    const keepTrig = Math.max(3, Math.floor(triggerBlocks.length * 0.6));
                    const kept = [...residentBlocks, ...triggerBlocks.slice(0, keepTrig)];
                    full = `\n\n${NOTE}\n${kept.join('\n')}\n${END}\n`;
                } else if (strategy === 'recency') {
                    // 保留常驻 + 近期分区
                    const recencyTypes = ['[关键事件·影响当前]', '[剧情时间线]', '[角色状态]', 'POV', '[手机生活记忆]', '[前情摘要]', '[节日]'];
                    const kept = [...residentBlocks, ...triggerBlocks.filter(b => recencyTypes.some(k => b.startsWith(k) || b.includes(k)))];
                    full = kept.length ? `\n\n${NOTE}\n${kept.join('\n')}\n${END}\n` : full.slice(0, budget);
                } else {
                    // balanced：常驻全保留 + 触发截断到剩余预算
                    const residentText = `\n\n${NOTE}\n${residentBlocks.join('\n')}`;
                    const triggerFull = triggerBlocks.join('\n');
                    const triggerBudget = Math.max(0, budget - residentText.length);
                    const triggerKept = [];
                    let acc = 0;
                    for (const t of triggerBlocks) {
                        if (acc + t.length > triggerBudget) break;
                        triggerKept.push(t); acc += t.length;
                    }
                    full = `${residentText}${triggerKept.length ? '\n' + triggerKept.join('\n') : ''}\n${END}\n`;
                }
                if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 注入预算裁剪: ${budget} 字符 (常驻${residentBlocks.length}块保留)`);
            }
            return full;
        }
        
        // [v2.0] P2: 楼层账本回滚（删楼/重生成后把该楼层产生的记忆撤掉）
        rollbackFloor(floor) {
            try {
                if (!this.config.config.floorLedgerEnabled) return 0;
                const entry = this.ledger.get(floor);
                if (!entry) return 0;
                // 回滚节点（该楼新增的图谱节点）
                // [v3.6] 升级: ① character 节点长寿命——删前检查后续摘要是否仍提及该角色，提及则保留；
                //          ② 删完统一 rebuildNameIndex（原实现只 clear 不重建，名称查询全失效）
                const keepIds = new Set();
                for (const id of (entry.nodeIds || [])) {
                    const node = this.graph.nodes.get(id);
                    if (!node) continue;
                    if (node.type === 'character') {
                        try {
                            const laterTexts = (this.summary?.summaries || []).filter(s => (s.floor || 0) > floor).map(s => s.text || '').join('\n');
                            const nameHit = node.name && laterTexts.includes(node.name);
                            if (nameHit) { keepIds.add(id); continue; }   // 后续剧情仍提及 → 保留（长寿命实体）
                        } catch (e) {}
                    }
                    this.graph.nodes.delete(id);
                    for (const [eid, e] of Array.from(this.graph.edges)) {
                        if (e.from === id || e.to === id) this.graph.edges.delete(eid);
                    }
                }
                this.graph.rebuildNameIndex();
                // [v3.15] 图谱楼层截断回溯（收编 zhino）: 删楼后用楼层前状态重建（truncateGraphFrom 内部会再 rebuildNameIndex）
                try { this.graph.truncateGraphFrom(floor); } catch (e) { errLog(e, 'rollbackFloor.图谱回溯'); }
                // [v3.17] 世界推进对账（yuzuki）+ 丢弃 pending（shujuku 拒绝半提交）: 删楼后过期推进失活
                try { if (this.worldProg) { this.worldProg.discard(); this.worldProg.reconcile(floor - 1); } } catch (e) { errLog(e, 'rollbackFloor.世界推进对账'); }
                // [v3.22] 角色记忆银行 + 场外信号 楼层清理（rollback 未清 → 旧记忆残留）
                try { if (this.charMem?.removeByFloor) this.charMem.removeByFloor(floor); } catch (e) { errLog(e, 'rollbackFloor.charMem清理'); }
                try { this.clearThinkingSignalsByFloor(floor); } catch (e) { errLog(e, 'rollbackFloor.场外信号清理'); }
                // [v3.25.1] rollbackFloor 清空归档状态（楼层 index 前移，旧归档失效）
                try { this._archivedFloorIds?.clear(); } catch (e) { errLog(e, 'rollbackFloor.归档状态清理'); }
                if (keepIds.size && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 回滚: 保留 ${keepIds.size} 个长寿命角色节点`);
                // 回滚 POV
                const povIdSet = new Set(entry.povIds || []);
                this.pov.povs = this.pov.povs.filter(p => !povIdSet.has(p.id));
                // 回滚时间线
                const tlIdSet = new Set(entry.timelineIds || []);
                this.timeline.entries = this.timeline.entries.filter(t => !tlIdSet.has(t.id));
                // [v2.3] RD: 状态回滚——[v3.9] 改单楼语义（原 < floor 级联：编辑单楼会摧毁后续所有楼的 status 记忆）
                try {
                    if (this.status?.ops?.length) {
                        this.status.ops = this.status.ops.filter(o => o.floor !== floor);
                        this.status.rebuildFromOps();
                    }
                } catch (e) { errLog(e, 'rollbackFloor.节点清理'); }
                // [v2.4] RE: 场景树回滚——[v3.9] 改单楼语义（同上，原 rollbackFrom 级联过滤）
                try {
                    if (this.config.config.sceneEnabled && this.scene?.opsLog?.length) this.scene.rollbackFloorOnly(floor);
                } catch (e) { errLog(e, 'rollbackFloor.status回滚'); }
                // [v2.7] RS: 日记/向量回滚（补最后两个缺口，至此全部子系统楼层可回滚）
                try { const nd = this.diary?.removeByFloor ? this.diary.removeByFloor(floor) : 0; if (nd && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 日记回滚: ${nd}条`); } catch (e) { errLog(e, 'rollbackFloor.日记回滚'); }
                try { const nv = this.vector?.removeByFloor ? this.vector.removeByFloor(floor) : 0; if (nv && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 向量回滚: ${nv}条`); } catch (e) { errLog(e, 'rollbackFloor.向量回滚'); }
                // [v2.8] RT: 物品台账回滚（ops真源过滤+重放）+ 反思条目回滚
                try { const ni = this.rollbackItemsFrom ? this.rollbackItemsFrom(floor) : 0; if (ni && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 台账对账: 清理 ${ni} 条失效ops`); } catch (e) { errLog(e, 'rollbackFloor.台账对账'); }
                try { if (this.reflection?.items?.length) this.reflection.items = this.reflection.items.filter(r => r.floor !== floor); } catch (e) { errLog(e, 'rollbackFloor.反思回滚'); }
                // [v2.2] RC: 回滚该楼层登记/了结的悬念簿条目
                try {
                    if (this.suspense.items.length) {
                        const before = this.suspense.items.length;
                        this.suspense.items = this.suspense.items.filter(x => x.floor !== floor && x.resolvedFloor !== floor);
                        if (this.suspense.items.length !== before && this.config.config.debugMode) {
                            console.log(`[${PLUGIN_NAME}] 悬念簿回滚: 清除 ${before - this.suspense.items.length} 条 (楼层 ${floor})`);
                        }
                    }
                } catch (e) { errLog(e, 'rollbackFloor.悬念回滚'); }
                // 回滚该楼层摘要
                this.summary.summaries = this.summary.summaries.filter(s => s.floor !== floor);
                // [v2.2] RB: 楼层回滚联动 RubyPhone 手机记忆 (幂等, 桥不在时静默跳过)
                try {
                    const rb = window.VirtualPhone?.lonshaBridge;
                    if (rb?.onFloorRollback) rb.onFloorRollback(floor);
                } catch (e) { errLog(e, 'rollbackFloor.手机记忆联动'); }
                // 移除账本记录
                this.ledger.remove(floor);
                // 重建 BM25 索引
                try {
                    if (this.config.config.bm25Enabled) {
                        this.bm25.rebuild(this.summary.getActiveSummaries().map(s => ({id: 'sum_' + s.floor, text: s.text, floor: s.floor, source: 'bm25'})));
                    }
                } catch (e) { errLog(e, 'rollbackFloor.BM25重建'); }
                if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 楼层 ${floor} 记忆已回滚`);
                // [v3.19] 删楼后书签重同步（ruby resyncAfterDeletion）: 楼层序数前移，书签补偿
                try {
                    if (this.bookmarks) {
                        const curCount = (window.SillyTavern?.getContext?.()?.chat?.length) || 0;
                        const changed = this.bookmarks.resyncAfterDeletion([Number(floor) || 0], curCount);
                        if (changed.length && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 书签重同步: ${changed.join(', ')}`);
                    }
                } catch (e) { errLog(e, 'rollbackFloor.书签重同步'); }
                return 1;
            } catch (e) {
                if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 楼层回滚失败:`, e);
                return 0;
            }
        }

        // [v3.9] 删楼后楼层前移重定位：所有子系统中 floor > deleted 的键 -1（数据零丢失——
        // 旧实现把被删楼之后的记忆全部销毁，但这些楼只是位置前移，记忆内容仍对应前移后的文本）
        shiftFloorsFrom(deleted) {
            let shifted = 0;
            const dec = (v) => { if (v > deleted) { shifted++; return v - 1; } return v; };
            try {
                // 摘要
                for (const s of (this.summary.summaries || [])) s.floor = dec(s.floor);
                // 卷（范围缩1：起止同减；跨被删楼则 end-1）
                for (const v of (this.summary.volumes || [])) {
                    if (v.floorStart > deleted) v.floorStart--;
                    if (v.floorEnd >= deleted) v.floorEnd = Math.max(v.floorStart, v.floorEnd - 1);
                }
                // 向量（metadata.floor）
                for (const v of (this.vector.vectors || [])) {
                    if (v.metadata && typeof v.metadata.floor === 'number' && v.metadata.floor > deleted) v.metadata.floor--;
                }
                // 日记
                for (const name of Object.keys(this.diary?.diaries || {})) {
                    for (const d of this.diary.diaries[name]) d.floor = dec(d.floor);
                }
                // POV
                for (const p of (this.pov?.povs || [])) p.floor = dec(p.floor);
                // 时间线
                for (const e of (this.timeline?.entries || [])) e.floor = dec(e.floor);
                // 悬念簿（floor 与 resolvedFloor 分别处理）
                for (const x of (this.suspense?.items || [])) {
                    if (x.floor !== null && x.floor !== undefined) x.floor = dec(x.floor);
                    if (x.resolvedFloor !== null && x.resolvedFloor !== undefined) x.resolvedFloor = dec(x.resolvedFloor);
                }
                // 物品台账
                for (const o of (this.itemOps || [])) o.floor = dec(o.floor);
                // 反思
                for (const r of (this.reflection?.items || [])) r.floor = dec(r.floor);
                // 角色状态 ops + todos.floor
                for (const op of (this.status?.ops || [])) {
                    op.floor = dec(op.floor);
                    for (const t of (op.todos || [])) t.floor = dec(t.floor);
                }
                for (const name of Object.keys(this.status?.characters || {})) {
                    for (const t of (this.status.characters[name]?.todos || [])) t.floor = dec(t.floor);
                }
                // 场景 track + opsLog
                for (const t of (this.scene?.track || [])) t.floor = dec(t.floor);
                for (const o of (this.scene?.opsLog || [])) o.floor = dec(o.floor);
                // 楼层账本（键与内容同移）
                const fl = this.ledger?.floors || {};
                const entries = Object.entries(fl).map(([k, v]) => [Number(k), v]).sort((a, b) => a[0] - b[0]);
                const next = {};
                for (const [f, v] of entries) {
                    if (f === deleted) continue;          // 被删楼已回滚
                    const nf = f > deleted ? f - 1 : f;
                    v.floor = nf;
                    next[nf] = v;
                }
                if (this.ledger) this.ledger.floors = next;
                // 场景派生重建（track/opsLog 的 floor 已变）
                if (this.config.config.sceneEnabled && this.scene?.opsLog?.length) {
                    this.scene.nodes.clear();
                    for (const e of [...this.scene.opsLog].sort((a, b) => a.floor - b.floor)) this.scene.apply(e.ops, e.floor, true);
                }
                this.rebuildItems?.();
            } catch (e) { errLog(e, 'SH.shiftFloorsFrom'); }
            if (shifted && this.config?.config?.debugMode) console.log(`[${PLUGIN_NAME}] 楼层前移: ${shifted} 条记忆重定位 (deleted=${deleted})`);
            return shifted;
        }

        // [v2.3] RD: 携带背包（抄 baibai carryover——把记忆打包带走，新对话无缝续写）
        packCarryover() {
            try {
                const active = this.summary.getActiveSummaries().slice(-40);
                const statusFlat = [];
                for (const [name, rec] of Object.entries(this.status.characters || {})) {
                    for (const [field, value] of Object.entries(rec.fields || {})) {
                        statusFlat.push({ character: name, field, value, reason: '携带自旧对话' });
                    }
                }
                // [v2.7] RS: 全量携带——补 graph/diary/scene/vector/pov（v2.3 版只带摘要+悬念+时间线+状态）
                return {
                    version: VERSION,   // [v3.11] 硬编码 '2.7.0' → 动态版本
                    summaries: active.map(s => ({ floor: s.floor, text: s.text, level: 1, timestamp: s.timestamp, folded: false })),
                    volumes: [...(this.summary.volumes || [])],
                    suspense: this.suspense.items.filter(x => x.status === 'open'),
                    timeline: [...this.timeline.entries],
                    statusFlat,
                    graph: this.graph.export(),
                    povs: this.pov?.export?.() || [],
                    diary: this.diary?.export?.() || { diaries: {} },
                    reflection: this.reflection?.export?.() || { items: [] },
                    itemOps: this.activeItemOps(),   // [v3.3] 只携带当前有效的 ops（失活项不得以 carried 形式永久化到新对话）
                    scene: this.config.config.sceneEnabled ? this.scene.export() : null,
                    vectors: this.config.config.vectorEnabled ? this.vector.export() : null,
                    counts: {
                        summaries: active.length, suspense: this.suspense.items.filter(x => x.status === 'open').length,
                        graphNodes: this.graph.nodes.size, diaries: Object.values(this.diary?.diaries || {}).reduce((a, b) => a + b.length, 0),
                        vectors: this.config.config.vectorEnabled ? this.vector.vectors.length : 0
                    },
                    packedAt: new Date().toISOString()
                };
            } catch (e) { return null; }
        }
        // 应用携带包 (新对话开局调用: 摘要/卷/时间线/悬念导入 + 状态重建)
        applyCarryover(pack) {
            try {
                if (!pack) return false;
                if (Array.isArray(pack.summaries) && pack.summaries.length) {
                    this.summary.summaries = pack.summaries.map(s => ({ ...s, folded: false }));
                }
                if (Array.isArray(pack.volumes) && pack.volumes.length) this.summary.volumes = pack.volumes;
                if (Array.isArray(pack.suspense)) this.suspense.import(pack.suspense);
                if (Array.isArray(pack.timeline) && pack.timeline.length) this.timeline.entries = [...pack.timeline];
                if (Array.isArray(pack.statusFlat) && pack.statusFlat.length) {
                    this.status.applyChanges(pack.statusFlat, 0, true);
                }
                // [v2.7] RS: 全量导入（graph/pov/diary/scene/vector，兼容 v2.3 旧包——字段缺失静默跳过）
                try { if (pack.graph?.nodes) this.graph.import(pack.graph); } catch (e) { console.warn('[LonSha] graph导入失败:', e); }
                try { if (Array.isArray(pack.povs) && pack.povs.length && this.pov?.import) this.pov.import(pack.povs); } catch (e) { errLog(e, 'applyCarryover.graph'); }
                try { if (pack.diary && this.diary?.import) this.diary.import(pack.diary); } catch (e) { errLog(e, 'applyCarryover.pov'); }
                try { if (pack.reflection && this.reflection?.import) this.reflection.import(pack.reflection); } catch (e) { errLog(e, 'applyCarryover.diary'); }
                try { if (Array.isArray(pack.itemOps)) { this.itemOps = pack.itemOps.map(o => ({ ...o, carried: true })); this.rebuildItems(); } } catch (e) { errLog(e, 'applyCarryover.itemOps'); }   // [v3.3] 携带包：无对应楼层，标 carried 永久有效
                try { if (pack.scene && this.scene?.import) this.scene.import(pack.scene); } catch (e) { errLog(e, 'applyCarryover.scene'); }
                try { if (Array.isArray(pack.vectors) && pack.vectors.length) this.vector.import(pack.vectors); } catch (e) { console.warn('[LonSha] 向量导入失败:', e); }
                if (this.config.config.bm25Enabled) {
                    this.bm25.rebuild(this.summary.getActiveSummaries().map(s => ({id: 'sum_' + s.floor, text: s.text, floor: s.floor, source: 'bm25'})));
                }
                if (this.config.config.debugMode && pack.counts) {
                    console.log(`[${PLUGIN_NAME}] 携带包导入: 图谱${this.graph.nodes.size}/${pack.counts.graphNodes} 日记${Object.values(this.diary?.diaries || {}).reduce((a, b) => a + b.length, 0)}/${pack.counts.diaries} 向量${this.vector.vectors.length}/${pack.counts.vectors}`);
                }
                return true;
            } catch (e) { return false; }
        }
        // [v3.1] SF6: 卷摘要顶部注入
        buildVolumeInjection() {
            try {
                // [v3.28] 三级金字塔注入: 史记(最高层) + 活跃周记(中层) + 最新卷(近层)
                const his = (this.summary.historical || []).slice(-3);
                const vols = this.summary.getActiveVolumes ? this.summary.getActiveVolumes().slice(-3) : (this.summary.volumes || []).slice(-3);
                if (!his.length && !vols.length) return '';
                const parts = [];
                if (his.length) parts.push('【史记·跨阶段总览】' + his.map(h => h.text).join('\n'));
                if (vols.length) parts.push('【周记·阶段概括】' + vols.map(v => `（第${v.floorStart}-${v.floorEnd}楼）${v.text}`).join('\n'));
                return `\n〔前情总览｜早期剧情层级概括，细节以正文和记忆简报为准〕\n${parts.join('\n')}\n`;
            } catch (e) { errLog(e, 'SF6.buildVolumeInjection'); return ''; }
        }

        // [v3.0] SD: 一键诊断——子系统统计 + 召回管线 dry-run + 存档 schema 校验 + 错误日志
        async selfCheck() {
            const report = { time: new Date().toLocaleString(), version: VERSION, stats: [], errors: _errBuf.slice(-15), pipeline: null, schema: null };   // [v3.2] DF4: 面板只展示最近15条
            try {
                // 1. 各子系统数据量统计
                const rows = [
                    ['图谱', `${this.graph.nodes.size} 节点 / ${this.graph.edges.size} 边`],
                    ['向量', `${this.vector.vectors.length} 条${(this.vector.vectors.length || 0) > (this.config.config.vectorMaxCount || 500) ? ' ⚠️超限' : ''}`],
                    ['摘要', `${this.summary.summaries.length} 条（${this.summary.summaries.filter(s => s.folded).length} 已折叠 / 卷 ${this.summary.volumes.length}）`],
                    ['日记', `${Object.keys(this.diary.diaries).length} 角色 / ${Object.values(this.diary.diaries).reduce((a, b) => a + b.length, 0)} 篇`],
                    ['时间线', `${this.timeline.entries.length} 条`],
                    ['悬念簿', `${this.suspense.items.filter(x => x.status === 'open').length} 开放 / ${this.suspense.items.length} 总`],
                    ['场景树', `${this.scene.nodes.size} 节点 / ops ${this.scene.opsLog.length}`],
                    ['物品台账', `${this.items.records.length} 件 / ops ${this.itemOps.length}${this.items._stale ? `（失活 ${this.items._stale}）` : ''}`],
                    ['补提取', `${this.scanMissingFloors().length} 个楼层无记忆（可在设置面板补提取）`],
                    ['反思', `${this.reflection.items.length} 条`],
                    ['POV', `${this.pov.povs.length} 条`],
                    ['角色状态', `${Object.keys(this.status.characters || {}).length} 人`],
                    ['回响池', `${this.echo.pool ? this.echo.pool.size : (this.echo.items ? this.echo.items.length : '?')}`],
                    ['楼层账本', `${Object.keys(this.ledger.floors || {}).length} 楼`],
                ];
                report.stats = rows.map(([k, v]) => ({k, v}));
                // 2. 召回管线 dry-run（不注入，只验证链路通）
                try {
                    const query = this.buildQuery(null);
                    const qText = String(query.text || '').trim();
                    if (!qText) {
                        report.pipeline = { ok: false, note: '查询文本为空（对话太短？）' };
                    } else {
                        const t0 = Date.now();
                        const recalled = await this.recallMemory(query);
                        const inj = this.buildInjection(recalled);
                        const merged = recalled.filter(Boolean).reduce((a, b) => a + (Array.isArray(b) ? b.length : 0), 0);
                        report.pipeline = { ok: true, queryLen: qText.length, routes: Object.entries(recalled).filter(([, v]) => Array.isArray(v) && v.length).map(([k, v]) => `${k}:${v.length}`), merged, injLen: (inj || '').length, ms: Date.now() - t0 };
                    }
                } catch (e) { report.pipeline = { ok: false, note: 'dry-run异常: ' + (e?.message || e) }; }
                // 3. 存档 schema 校验（export 字段 vs load 导入字段配对）
                try {
                    const saved = this.collectExport();
                    const expected = ['graph', 'summaries', 'diaries', 'vectors', 'povs', 'timeline', 'status', 'ledger', 'suspense', 'scene'];
                    const missing = expected.filter(k => saved[k] === undefined || saved[k] === null);
                    const nonEmpty = expected.filter(k => saved[k] && (Array.isArray(saved[k]) ? saved[k].length : Object.keys(saved[k]).length) > 0);
                    report.schema = { ok: missing.length === 0, missing, nonEmpty };
                } catch (e) { report.schema = { ok: false, missing: ['collectExport异常: ' + (e?.message || e)] }; }
            } catch (e) { report.fatal = String(e?.message || e); }
            return report;
        }

        // [v2.9] RU-C: 全量导出（快照/存档共用同构数据）
        collectExport() {
            return {
                version: VERSION,
                graph: this.graph.export(),
                summaries: this.summary.export(),
                diaries: this.diary.export(),
                reflection: this.reflection?.export?.(),
                itemOps: this.itemOps,
                vectors: this.vector.export(),
                povs: this.pov.export(),
                timeline: this.timeline.export(),
                status: this.status.export(),
                ledger: this.ledger.export(),
                suspense: this.suspense.export(),
                scene: this.scene.export(),
                echo: this.echo?.export?.(),
                packedAt: new Date().toISOString()
            };
        }

        getCurrentChatId() {
            try {
                const c = window.SillyTavern?.getContext?.();
                return c?.chatId || c?.chatMetadata?.file_name || null;
            } catch { return null; }
        }
    }
    
    // [v2.5] RF: 回响池（抄 anima echoConfig——召回过的记忆停留N轮，防同一记忆"闪现又消失"）
    class EchoPool {
        constructor() { this.items = []; }   // [{key, text, source, life}]
        onRecalled(recalled) {
            try {
                const now = Date.now();
                for (const item of (recalled || []).slice(0, 20)) {
                    const key = item.id || item.text || JSON.stringify(item).slice(0, 60);
                    const exist = this.items.find(x => x.key === key);
                    if (exist) { exist.life = Math.max(exist.life, 2); exist.lastSeen = now; }   // 重要度更高的条目粘更久
                    else this.items.push({ key, text: item.text || item.content || item.summary || '', source: item.source, life: 2, lastSeen: now });
                }
                if (this.items.length > 30) this.items = this.items.slice(-30);
            } catch (e) { errLog(e, 'EchoPool.onRecalled'); }
        }
        /** 每轮衰减；返回仍存活的（life>0） */
        tick() {
            this.items = this.items.filter(x => { x.life -= 1; return x.life > 0; });
            return this.items;
        }
        export() { return this.items; }
        import(data) { this.items = Array.isArray(data) ? data.slice(0, 30) : []; }
    }

    // [v2.4] RE: 场景地图树（抄 baibai MemScene：由大到小路径层级 + 当前位置追踪 + ops重放）
    class SceneBook {
        constructor() {
            this.nodes = new Map();   // key: 'a/b/c' → {path[], desc, floor, updatedAt} (派生缓存)
            this.track = [];          // [{floor, pathKey}] 位置轨迹 (取末位=当前)
            this.opsLog = [];         // [{floor, ops}] 真源 (重放重建用, 抄 baibai delta-replay)
        }
        static keyOf(path) { return (path || []).map(s => String(s).trim()).filter(Boolean).join('/'); }
        /** 应用场景 ops。op: {action:'add'|'update', path:[由大到小], desc} */
        apply(ops, floor, _replaying = false) {
            let n = 0;
            for (const op of (ops || [])) {
                const path = (op?.path || []).map(s => String(s).trim()).filter(Boolean).slice(0, 4);
                if (!path.length) continue;
                const k = SceneBook.keyOf(path);
                const exist = this.nodes.get(k);
                if (op.action === 'update' && !exist) continue;   // update 只改已存在的
                if (!exist) {
                    for (let i = 1; i < path.length; i++) {
                        const pk = SceneBook.keyOf(path.slice(0, i));
                        if (!this.nodes.has(pk)) this.nodes.set(pk, { path: path.slice(0, i), desc: '', floor, updatedAt: Date.now() });
                    }
                    this.nodes.set(k, { path, desc: String(op.desc || '').slice(0, 80), floor, updatedAt: Date.now() });
                } else if (op.desc && op.desc !== exist.desc) {
                    exist.desc = String(op.desc).slice(0, 80); exist.updatedAt = Date.now(); exist.floor = floor;
                } else continue;
                n++;
            }
            if (!_replaying && n) {
                const i = this.opsLog.findIndex(o => o.floor === floor);
                if (i >= 0) this.opsLog[i] = { floor, ops };
                else this.opsLog.push({ floor, ops });
                if (this.opsLog.length > 400) this.opsLog.shift();
            }
            return n;
        }
        /** 记录位置轨迹（同楼覆盖） */
        setLocation(floor, path) {
            const k = SceneBook.keyOf(path);
            if (!k) return;
            const i = this.track.findIndex(t => t.floor === floor);
            if (i >= 0) this.track[i] = { floor, pathKey: k };
            else this.track.push({ floor, pathKey: k });
            if (this.track.length > 200) this.track.shift();
        }
        currentKey() { return this.track.length ? this.track[this.track.length - 1].pathKey : null; }
        /** 某位置的由大到小链（含描述） */
        chainOf(key) {
            const parts = String(key || '').split('/').filter(Boolean);
            const out = [];
            for (let i = 1; i <= parts.length; i++) {
                const n = this.nodes.get(parts.slice(0, i).join('/'));
                if (n) out.push(n);
            }
            return out;
        }
        /** 重建（删楼回滚后: 过滤真源 → 重放） */
        rebuildFromOps() {
            this.nodes.clear();
            this.track = this.track.filter(t => t.floor < (this._cutoff || 0) || this._cutoff === undefined ? true : false);
            const log = [...this.opsLog].sort((a, b) => a.floor - b.floor);
            for (const e of log) { this.apply(e.ops, e.floor, true); }
        }
        rollbackFrom(floor) {
            this.opsLog = this.opsLog.filter(o => o.floor < floor);
            this.track = this.track.filter(t => t.floor < floor);
            this.nodes.clear();
            for (const e of [...this.opsLog].sort((a, b) => a.floor - b.floor)) this.apply(e.ops, e.floor, true);
        }
        // [v3.9] 单楼回滚（只清该楼的 opsLog/track 并重放——不级联摧毁后续楼层；编辑路径用）
        rollbackFloorOnly(floor) {
            this.opsLog = this.opsLog.filter(o => o.floor !== floor);
            this.track = this.track.filter(t => t.floor !== floor);
            this.nodes.clear();
            for (const e of [...this.opsLog].sort((a, b) => a.floor - b.floor)) this.apply(e.ops, e.floor, true);
        }
        /** 给提取 prompt 的场景清单（最多15行） */
        brief() {
            const arr = [...this.nodes.values()].filter(n => n.desc || n.path.length >= 2).slice(-15);
            if (!arr.length) return '（暂无已登记场景）';
            return arr.map(n => `${n.path.join('/')} — ${n.desc || ''}`).join('\n');
        }
        export() { return { nodes: Array.from(this.nodes.values()), track: this.track, opsLog: this.opsLog }; }
        import(data) {
            if (!data || typeof data !== 'object') return;
            this.nodes = new Map((data.nodes || []).map(n => [SceneBook.keyOf(n.path), n]));
            this.track = Array.isArray(data.track) ? data.track : [];
            this.opsLog = Array.isArray(data.opsLog) ? data.opsLog : [];
        }
    }

    // [v2.2] RC: 悬念簿（抄 baibai MemPlan：约定/伏笔/未解之谜 + done/cancelled/failed 三态了结）
    class SuspenseBook {
        constructor() { this.items = []; this._seq = 0; }
        /** 添加新悬项。kind: 'plan'|'suspense' */
        add(kind, content, floor, createdTime) {
            const c = String(content || '').trim();
            if (c.length < 4) return null;
            const id = 'sus_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            this._seq = (this._seq || 0) + 1;
            this.items.push({
                id, sid: 's' + this._seq, kind: (kind === 'suspense' ? 'suspense' : 'plan'), content: c.slice(0, 120),
                status: 'open', floor: floor ?? null, createdTime: createdTime || null,
                outcome: null, resolvedReason: null, resolvedFloor: null, createdAt: Date.now()
            });
            return id;
        }
        /** 了结悬项。outcome: 'done'|'cancelled'|'failed' */
        resolve(idOrContent, outcome, reason, floor) {
            let it = this.items.find(x => x.id === idOrContent && x.status === 'open');
            if (!it) it = this.items.find(x => x.sid === idOrContent && x.status === 'open');
            if (!it) {
                const key = String(idOrContent || '').trim();
                it = this.items.find(x => x.status === 'open' && (x.content.includes(key) || key.includes(x.content)));
            }
            if (!it) return null;
            it.status = 'resolved';
            it.outcome = ['done', 'cancelled', 'failed'].includes(outcome) ? outcome : 'done';
            it.resolvedReason = String(reason || '').slice(0, 80) || null;
            it.resolvedFloor = floor ?? null;
            return it;
        }
        openItems() { return this.items.filter(x => x.status === 'open'); }
        /** 近期了结（注入"已了结"分区，防主模型把办完的事再拿出来说） */
        recentlyResolved(limit = 3) {
            return this.items.filter(x => x.status === 'resolved').slice(-limit).reverse();
        }
        /** 上限控制：超出的最旧 open 沉降（不再注入，但保留记录） */
        prune(maxOpen) {
            const open = this.openItems();
            if (open.length <= (maxOpen || 20)) return 0;
            const toClose = open.slice(0, open.length - (maxOpen || 20));
            for (const it of toClose) { it.status = 'resolved'; it.outcome = 'cancelled'; it.resolvedReason = '（长期未了结，自动沉降）'; }
            return toClose.length;
        }
        /** 给提取 prompt 的悬念清单（带稳定短编号 s1/s2… 供 LLM 引用了结） */
        briefForPrompt() {
            const open = this.openItems();
            if (!open.length) return '（暂无未了结的悬念）';
            return open.slice(0, 12).map(x => `${x.sid || '?'}: ${x.kind === 'suspense' ? '[谜团]' : '[约定]'} ${x.content}`).join('\n');
        }
        export() { return this.items; }
        import(data) {
            this.items = Array.isArray(data) ? data : [];
            // 恢复序号器: 取历史最大 sid 编号, 防新条目 sid 撞号
            let mx = 0;
            for (const x of this.items) {
                const m = String(x.sid || '').match(/^s(\d+)$/);
                if (m) mx = Math.max(mx, Number(m[1]));
            }
            this._seq = mx;
        }
    }

    // [v2.2] RC: 相对时间前缀（抄 baibai timeRel：数字日历精确算天数差，宁可不标绝不标错）
    function parseStoryDateLoose(s) {
        s = String(s || '');
        // 带年: 2026年3月12日 / 2026-3-12 / 2026/3/12 / 2026.3.12
        let m = s.match(/(\d{3,4})\s*[年\/\-.]\s*(\d{1,2})\s*[月\/\-.]\s*(\d{1,2})/) || s.match(/(\d{1,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/);
        if (m) {
            let y = Number(m[1]); if (y < 100) y += 2000;
            const mo = Number(m[2]), d = Number(m[3]);
            if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { y, mo, d };
            return null;
        }
        // 无年: 3月12日 / 3月12 / 3-12(后接边界, 防"1.5个小时"小数误判)
        m = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/) || s.match(/(\d{1,2})[\/\-.](\d{1,2})(?=$|\s|日)/);
        if (m) {
            const mo = Number(m[1]), d = Number(m[2]);
            if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { y: null, mo, d };
        }
        return null;
    }
    function storyDayDiff(dateA, dateB) {
        const a = parseStoryDateLoose(dateA), b = parseStoryDateLoose(dateB);
        if (!a || !b) return null;
        // 年份补齐: 双方都无年按同年比; 一方无年借用对方的年; 差值超2年视为年份推测可疑, 宁可不标
        let ya = a.y, yb = b.y;
        if (ya === null && yb === null) { ya = 2000; yb = 2000; }
        else if (ya === null) ya = yb;
        else if (yb === null) yb = ya;
        const diff = Math.round((new Date(ya, a.mo - 1, a.d) - new Date(yb, b.mo - 1, b.d)) / 86400000);
        if (isNaN(diff) || Math.abs(diff) > 730) return null;
        return diff;
    }
    // [v2.6] RG: 相对时间统一走 RelativeTimeHelper（架空日历/全角分隔符容忍），旧 storyDayDiff 保留为兜底
    function relativePrefix(dateStr, nowStr) {
        try {
            const p = new RelativeTimeHelper().relativeTimePrefix(dateStr, nowStr);
            if (p) return p;
        } catch (e) { errLog(e, 'relativePrefix.legacy兜底'); }
        try {
            if (!dateStr || !nowStr) return '';
            const diff = storyDayDiff(nowStr, dateStr);
            if (diff === null || isNaN(diff)) return '';
            if (diff === 0) return '今天';
            if (diff === 1) return '昨天';
            if (diff === 2) return '前天';
            if (diff > 2 && diff < 7) return diff + '天前';
            if (diff >= 7 && diff < 30) return Math.floor(diff / 7) + '周前';
            if (diff >= 30 && diff < 365) return Math.floor(diff / 30) + '个月前';
            if (diff >= 365) return Math.floor(diff / 365) + '年前';
            if (diff === -1) return '明天';
            if (diff < -1 && diff > -7) return Math.abs(diff) + '天后';
            return '';   // 更远的未来不标（宁可不标绝不标错）
        } catch (e) { return ''; }
    }

    class MemoryGraph {
        constructor() { this.nodes = new Map(); this.edges = new Map(); this.nameIndex = new Map(); this._snapshots = []; this.SNAP_MAX = 6; }
        // [v3.15] 图谱版本快照（收编 zhino）: 每楼记录楼层起点图状态，最多 SNAP_MAX 张
        snapshotGraph(floor) {
            const f = Math.max(0, Math.round(Number(floor) || 0));
            if (!this._snapshots) this._snapshots = [];
            // 同楼重复拍只更新（swipe/重试时覆盖旧快照，不堆积）
            const idx = this._snapshots.findIndex(s => s.floor === f);
            const snap = { floor: f, nodes: Array.from(this.nodes.values()).map(n => ({...n})), edges: Array.from(this.edges.values()).map(e => ({...e})), ts: Date.now() };
            if (idx >= 0) this._snapshots[idx] = snap; else this._snapshots.push(snap);
            // 最多 6 张，超额淘汰最旧
            if (this._snapshots.length > this.SNAP_MAX) {
                this._snapshots.sort((a, b) => a.floor - b.floor);
                this._snapshots.shift();
            }
            if (window.LonShaMemory?.engine?.config?.config?.debugMode) console.log(`[${PLUGIN_NAME}] 图谱快照: 楼层 ${f} (共 ${this._snapshots.length} 张)`);
            return snap;
        }
        // [v3.15] 楼层截断回溯: 删除 floor 及之后的快照，回滚到 floor 前的最近快照重建图
        // （zhino: 重roll某楼层后，该楼层及之后的图谱版本被自动截断，用楼层前状态重建）
        truncateGraphFrom(floor) {
            if (!Array.isArray(this._snapshots) || !this._snapshots.length) return false;
            const f = Math.max(0, Math.round(Number(floor) || 0));
            // 找 floor 前（不含）的最近快照
            const before = this._snapshots.filter(s => s.floor < f).sort((a, b) => b.floor - a.floor)[0];
            // 截断: 删除 floor 及之后的快照
            this._snapshots = this._snapshots.filter(s => s.floor < f);
            if (before) {
                this.nodes.clear();
                this.edges.clear();
                for (const n of before.nodes) this.nodes.set(n.id, n);
                for (const e of before.edges) this.edges.set(e.id, e);
                this.rebuildNameIndex();
                if (window.LonShaMemory?.engine?.config?.config?.debugMode) console.log(`[${PLUGIN_NAME}] 图谱回溯: 回滚到楼层 ${before.floor} 状态 (删楼 ${f})`);
            }
            return !!before;
        }

        addNode(node) {
            const id = node.id || `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const fullNode = {...node, id, timestamp: Date.now()};
            this.nodes.set(id, fullNode);
            if (node.name) {
                // [v3.1] SF4: 归一化索引键（NFKC+空白折叠+小写），「绫地宁宁」与「绫地 宁宁」同一身份
                const nk = normalizeCharName(node.name);
                if (!this.nameIndex.has(nk)) this.nameIndex.set(nk, []);
                if (!this.nameIndex.get(nk).includes(id)) this.nameIndex.get(nk).push(id);
                // 原名键也保留（兼容未归一化的旧查询）
                if (nk !== node.name) {
                    if (!this.nameIndex.has(node.name)) this.nameIndex.set(node.name, []);
                    if (!this.nameIndex.get(node.name).includes(id)) this.nameIndex.get(node.name).push(id);
                }
            }
            return id;
        }
        addEdge(edge) {
            const id = `${edge.from}-${edge.to}-${edge.label || 'related'}`;
            this.edges.set(id, {...edge, id, timestamp: Date.now()});
            return id;
        }
        findByNames(names) {
            const results = [];
            for (const name of names) {
                // [v3.1] SF4: 查询键归一化（原名查不到时降级归一化键）
                const ids = this.nameIndex.get(name) || this.nameIndex.get(normalizeCharName(name));
                if (ids) for (const id of ids) { const node = this.nodes.get(id); if (node) results.push(node); }
            }
            return results;
        }
        // [v3.6] 按名查单节点（角色去重用——命中第一个 character 类型的节点）
        findCharacterByName(name) {
            try {
                const nk = normalizeCharName(name);
                const ids = [...(this.nameIndex.get(nk) || []), ...(this.nameIndex.get(name) || [])];
                for (const id of ids) {
                    const n = this.nodes.get(id);
                    if (n && n.type === 'character') return n;
                }
                return null;
            } catch (e) { errLog(e, 'GD.findCharacterByName'); return null; }
        }
        // [v3.6] 索引全量重建（rollbackFloor 删节点后必须重建——原实现只 clear 不重建，名称查询全失效）
        rebuildNameIndex() {
            try {
                this.nameIndex.clear();
                for (const node of this.nodes.values()) {
                    if (!node?.name) continue;
                    const nk = normalizeCharName(node.name);
                    if (!this.nameIndex.has(nk)) this.nameIndex.set(nk, []);
                    if (!this.nameIndex.get(nk).includes(node.id)) this.nameIndex.get(nk).push(node.id);
                    if (nk !== node.name) {
                        if (!this.nameIndex.has(node.name)) this.nameIndex.set(node.name, []);
                        if (!this.nameIndex.get(node.name).includes(node.id)) this.nameIndex.get(node.name).push(node.id);
                    }
                }
            } catch (e) { errLog(e, 'GD.rebuildNameIndex'); }
        }
        export() { return {nodes: Array.from(this.nodes.values()), edges: Array.from(this.edges.values()), snapshots: Array.isArray(this._snapshots) ? this._snapshots : []}; }
        import(data) {
            this._snapshots = Array.isArray(data?.snapshots) ? data.snapshots : [];
            this.nodes.clear(); this.edges.clear(); this.nameIndex.clear();
            if (data?.nodes) for (const node of data.nodes) this.nodes.set(node.id, node);
            if (data?.edges) for (const edge of data.edges) this.edges.set(edge.id, edge);
            this.rebuildNameIndex();   // [v3.6] 统一走重建（原实现不归一化，SF4 归一化键缺失）
        }
    }
    
    class SummarySystem {
        constructor() { this.summaries = []; this.volumes = []; this.historical = []; this.folding = false; this.foldingHistorical = false; }
        // [v3.28] 三级金字塔（st-memory-wizzard）: summaries(level1日记) → volumes(level2周记/卷) → historical(level3史记)
        // [v1.4.2] 智能截断：优先在句子边界断开，避免"但那个"式半句截断
        smartTruncate(text, maxLen) {
            text = String(text || '').trim();
            if (text.length <= maxLen) return text;
            const cut = text.substring(0, maxLen);
            let lastEnd = -1;
            for (const ch of ['。', '！', '？', '…', '”', '"']) {
                const i = cut.lastIndexOf(ch);
                if (i > lastEnd) lastEnd = i;
            }
            return lastEnd > maxLen * 0.5 ? cut.substring(0, lastEnd + 1) : cut + '……';
        }
        async createSummary(message, llmSummary, opts = {}) {
            const text = llmSummary || this.smartTruncate(message.mes || '', 200);
            const floor = message.index || 0;
            // [v3.7] 同楼去重: 编辑重提取/手动补提时同楼摘要替换而非堆积（原实现 push 不去重——10 次编辑 = 10 条同楼摘要）
            const existIdx = this.summaries.findIndex(s => s.floor === floor);
            if (existIdx >= 0) {
                const old = this.summaries[existIdx];
                // [v3.8] 降级保护: 本地截断摘要（无 LLM 时）不得劣化覆盖已有摘要（提取锁排队超时场景）
                if (opts.degraded && !opts.force) return old;
                // 仅当新文本不同才替换（保 id/timestamp 连续性）
                if (old.text !== text) {
                    this.summaries[existIdx] = { ...old, text, timestamp: Date.now(), degradedText: !!opts.degraded || undefined };
                }
                return this.summaries[existIdx];
            }
            const summary = {floor, text, level: 1, timestamp: Date.now(), folded: false};
            this.summaries.push(summary);
            return summary;
        }
        // 活跃（未折叠）摘要
        getActiveSummaries() { return this.summaries.filter(s => !s.folded); }
        search(query) { return this.getActiveSummaries().filter(s => s.text.includes(query)).slice(0, 5); }
        // [v1.9] P1: 层级折叠——活跃摘要超过阈值时，把最早一批用 LLM 合并成卷摘要
        async maybeFold(config, llm) {
            if (this.folding || !config?.summaryFoldEnabled) return null;
            const active = this.getActiveSummaries();
            if (active.length < (config.summaryFoldThreshold || 30)) return null;
            const batchSize = config.summaryFoldBatchSize || 20;
            const batch = active.slice(0, batchSize);
            if (batch.length < 5) return null;
            this.folding = true;
            try {
                const list = batch.map(s => '- ' + s.text).join('\n');
                const prompt = `你是剧情记忆整理员。以下是同一段长剧情的前${batch.length}条楼层摘要。请把它们合并成一条80-150字的高层剧情概括（卷摘要），保留关键人物、地点、因果与转折，丢弃重复细节。只输出概括本身，不要编号、不要markdown、不要换行。\n\n${list}`;
                const raw = await llm.callAPI(prompt);
                const clean = String(raw || '').replace(/^[-•\s]+/, '').trim();
                if (clean && clean.length >= 20) {
                    const floors = batch.map(s => s.floor).filter(f => f !== undefined && f !== null);
                    this.volumes.push({
                        id: 'vol_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                        text: clean,
                        floorStart: floors.length ? Math.min(...floors) : 0,
                        floorEnd: floors.length ? Math.max(...floors) : 0,
                        count: batch.length,
                        timestamp: Date.now(),
                        level: 2   // [v3.28] 卷摘要 = 周记层（中层）
                    });
                    batch.forEach(s => { s.folded = true; });
                    if (this.volumes.length > 20) this.volumes.shift();
                    // [v3.28] 三级金字塔: 卷摘要（周记）积累超阈值 → 继续折叠成史记（最高层）
                    if (this.volumes.length >= (config.historicalFoldThreshold || 12)) {
                        try { this.maybeFoldHistorical(config, llm); } catch (e2) { if (config?.debugMode) console.warn(`[${PLUGIN_NAME}] 史记折叠失败:`, e2); }
                    }
                    if (config.debugMode) console.log(`[${PLUGIN_NAME}] 摘要折叠: ${batch.length}条 → 卷摘要#${this.volumes.length}`);
                    return this.volumes[this.volumes.length - 1];
                }
            } catch (e) {
                if (config?.debugMode) console.warn(`[${PLUGIN_NAME}] 摘要折叠失败:`, e);
            } finally {
                this.folding = false;
            }
            return null;
        }
        // 卷摘要召回（最近 N 卷，低权重）
        // [v3.28] 三级金字塔最高层: 卷摘要（周记）积累超阈值 → 折叠成史记（最高层，跨阶段总览）
        // [v3.29] 修复僵尸链路: 原用 this.folding 防重入——但本方法在 maybeFold 的 try 块内被调（folding=true），
        // 导致永远 return null（史记折叠从不执行）。改用独立 foldingHistorical 标志。
        async maybeFoldHistorical(config, llm) {
            if (this.foldingHistorical) return null;
            const vols = this.volumes;
            const threshold = config?.historicalFoldThreshold || 12;
            if (vols.length < threshold) return null;
            const batch = vols.slice(0, threshold);
            this.foldingHistorical = true;
            try {
                const list = batch.map(v => `[第${v.floorStart}-${v.floorEnd}楼] ${v.text}`).join('\n');
                const prompt = `你是历史学家。以下是同一段长剧情的${batch.length}个阶段概括（周记）。请把它们合并成一段150-250字的历史总览（史记），保留关键人物、重要转折、长期伏笔与因果主线，压缩重复描述。只输出概括本身，不要编号、不要markdown、不要换行。\n\n${list}`;
                const raw = await llm.callAPI(prompt);
                const clean = String(raw || '').replace(/^[-•\s]+/, '').trim();
                if (clean && clean.length >= 30) {
                    this.historical.push({
                        id: 'his_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                        text: clean,
                        floorStart: batch[0]?.floorStart ?? 0,
                        floorEnd: batch[batch.length - 1]?.floorEnd ?? 0,
                        count: batch.length,
                        timestamp: Date.now(),
                        level: 3
                    });
                    // 已入史记的周记标记归档（不再作为中层单独注入）
                    batch.forEach(v => { v.archived = true; });
                    if (this.historical.length > 6) this.historical.shift();
                    if (config?.debugMode) console.log(`[${PLUGIN_NAME}] 史记折叠: ${batch.length}个周记 → 史记#${this.historical.length}`);
                    return this.historical[this.historical.length - 1];
                }
            } finally { this.foldingHistorical = false; }
            return null;
        }
        // 活跃周记（未入史记）
        getActiveVolumes() { return this.volumes.filter(v => !v.archived); }
        searchVolumes(limit = 2) { return this.volumes.slice(-limit).reverse(); }
        export() { return { summaries: this.summaries, volumes: this.volumes, historical: this.historical }; }
        import(data) {
            if (Array.isArray(data)) { this.summaries = data; this.volumes = []; this.historical = []; }
            else if (data && typeof data === 'object') {
                this.summaries = Array.isArray(data.summaries) ? data.summaries : [];
                this.volumes = Array.isArray(data.volumes) ? data.volumes : [];
                // [v3.28] 史记层导入对称
                this.historical = Array.isArray(data.historical) ? data.historical : [];
                // 兼容旧卷摘要数据（无 level/archived）: 自动补默认
                for (const v of this.volumes) { if (v.level === undefined) v.level = 2; if (v.archived === undefined) v.archived = false; }
            }
        }
    }
    

    // [v1.8] P0: POV 私密记忆（抄 stbme memory-scope：客观 vs 角色主观认知隔离）
    // [v3.16] 角色记忆银行（收编 zhino 两层记忆）: 核心(永久) + 近期(自动更替)
    class CharacterMemoryBank {
        constructor() {
            this.memories = {};   // { charName: { core: [], recent: [] } }
            this.RECENT_KEEP = 3; // 近期记忆保留最近 3 个版本
        }
        // 追加核心记忆（永久，不自动删）
        _detId(char, text) {
            let h = 0x811c9dc5;
            const s = String(char || '') + '|' + String(text || '');
            for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
            return (h >>> 0).toString(36);
        }
        addCore(char, text, floor) {
            if (!char || !text) return null;
            const c = this._c(char);
            // [v3.17] 确定性 id（baibai 确定性语义）: 同角色同文本同楼层 → 同 id，swipe 重run 幂等不重复
            const m = { id: 'cm_' + this._detId(char, text) + '_' + (Math.max(0, Math.round(Number(floor) || 0))), text: String(text).slice(0, 200), floor: floor || 0, ts: Date.now() };
            _initEbbingMeta(m);   // [v3.20] Ebbinghaus 字段
            // 三态补丁: 同 id 已存在则更新（幂等），不同文本新增
            const existIdx = c.core.findIndex(x => x.id === m.id);
            if (existIdx >= 0) { c.core[existIdx].text = m.text; c.core[existIdx].ts = m.ts; return c.core[existIdx]; }
            c.core.push(m);
            if (c.core.length > 50) this._gcCore(c, Date.now());   // [v3.17] GC 校准淘汰
            return m;
        }
        // 追加近期记忆（自动更替: 保留最近 RECENT_KEEP 条）
        addRecent(char, text, floor) {
            if (!char || !text) return null;
            const c = this._c(char);
            const m = { id: 'mr_' + this._detId(char, text) + '_' + (Math.max(0, Math.round(Number(floor) || 0))), text: String(text).slice(0, 200), floor: floor || 0, ts: Date.now() };
            _initEbbingMeta(m);   // [v3.20] Ebbinghaus 字段
            const existIdx = c.recent.findIndex(x => x.id === m.id);
            if (existIdx >= 0) { c.recent[existIdx].text = m.text; c.recent[existIdx].ts = m.ts; return c.recent[existIdx]; }
            c.recent.push(m);
            if (c.recent.length > this.RECENT_KEEP) c.recent.shift();
            return m;
        }
        // [v3.17] GC 校准器（anima retention value）: 淘汰「没人在乎的」而非粗暴截断
        _gcCore(c, now) {
            if (!c.core || c.core.length <= 50) return;
            // [v3.20] Ebbinghaus 衰减评分（收编 ruby-phone-work）: 淘汰「没人在乎的」
            // 按 decayScore 保底，淘汰分数最低的（最重要/最常激活/最新鲜的保留）
            const scored = c.core.map(m => ({ m, s: decayScore(m, {}) }));
            scored.sort((a, b) => b.s - a.s);
            c.core = scored.slice(0, 50).map(x => x.m);
        }
        // [v3.17] GC 校准器对外接口（可手动触发，淘汰访问频次最低者）
        gc(char, now) {
            const c = this._c(char);
            this._gcCore(c, now || Date.now());
        }
        // 手动升降级（核心 ↔ 近期）
        promoteToCore(char, id) { const c = this._c(char); const i = c.recent.findIndex(m => m.id === id); if (i < 0) return false; const [m] = c.recent.splice(i, 1); m.ts = Date.now(); c.core.push(m); return true; }
        demoteToRecent(char, id) { const c = this._c(char); const i = c.core.findIndex(m => m.id === id); if (i < 0) return false; const [m] = c.core.splice(i, 1); m.ts = Date.now(); c.recent.push(m); if (c.recent.length > this.RECENT_KEEP) c.recent.shift(); return true; }
        // 删除单条
        deleteMemory(char, id) { const c = this._c(char); c.core = c.core.filter(m => m.id !== id); c.recent = c.recent.filter(m => m.id !== id); return true; }
        // 该角色全部记忆
        of(char) { return this._c(char); }
        // 召回（链1/链2 用）: 匹配查询词，按相关性+时间衰减排序
        search(char, query) {
            const c = this._c(char);
            const q = String(query || '').slice(0, 60);
            const all = [...c.core, ...c.recent].map(m => ({...m, _isCore: c.core.includes(m)}));
            if (!q) return all.slice(-8).reverse();
            // [v3.20] Ebbinghaus 衰减排序（ruby-phone-work）: 核心优先 + 衰减价值 + 时间
            return all.filter(m => m.text.includes(q))
                .sort((a, b) => {
                    const sa = decayScore(a, {}) * (a._isCore ? 3 : 1), sb = decayScore(b, {}) * (b._isCore ? 3 : 1);
                    return sb - sa || (b.ts || 0) - (a.ts || 0);
                })
                .slice(0, 6);
        }
        _c(char) { if (!this.memories[char]) this.memories[char] = { core: [], recent: [] }; return this.memories[char]; }
        // [v3.22] 按楼层删除（rollbackFloor 联动）: 删楼后该楼记忆不残留
        removeByFloor(floor) {
            const f = Math.max(0, Math.round(Number(floor) || 0));
            let removed = 0;
            for (const char of Object.keys(this.memories)) {
                const c = this.memories[char];
                c.core = c.core.filter(x => x.floor !== f);
                c.recent = c.recent.filter(x => x.floor !== f);
                removed += 1;
            }
            return removed;
        }
        export() { return this.memories; }
        import(data) { this.memories = (data && typeof data === 'object') ? data : {}; for (const k of Object.keys(this.memories)) { if (!this.memories[k].core) this.memories[k].core = []; if (!this.memories[k].recent) this.memories[k].recent = []; } }
    }

    class PovMemory {
        constructor() { this.povs = []; }
        add(owner, content, floor) {
            if (!owner || !content) return null;
            const exist = this.povs.find(p => p.owner === owner && p.content === content);
            if (exist) { exist.floor = floor; exist.timestamp = Date.now(); exist.count = (exist.count || 0) + 1; return exist; }
            const p = {id: 'pov_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), owner, content, floor, timestamp: Date.now(), count: 1};
            this.povs.push(p);
            if (this.povs.length > 200) this.povs.shift();
            return p;
        }
        // 只取指定角色（当前登场者）的私密记忆，防剧透
        search(owners, limit = 3) {
            const set = new Set(owners);
            return this.povs.filter(p => set.has(p.owner)).slice(-limit).reverse();
        }
        export() { return this.povs; }
        import(data) { this.povs = Array.isArray(data) ? data : []; }
    }
    
    // [v1.8] P0: 剧情时间线（抄 yuzuki plot-summary：按剧情日期排序）
    // ═══════════════════════════════════════════════════════════════
    // [v2.6] RG: 相对时间工具类（移植自 baibai timeRel.ts 核心算法）
    // 用途：给历史记忆注入加相对前缀（「昨天」「3天前」「上周」），
    // 让主模型与用户都能直观感知「这段剧情距离现在多久」。
    // 设计底线（沿用 baibai）：时间是 AI 写的自由文本，数字日历精确算天数差，
    // 架空日历（霜月3日）仅同月可算，跨架空月放弃。宁可不标，绝不标错。
    // ═══════════════════════════════════════════════════════════════
    // [v3.16] 世界推进（收编 zhino）: 不在场角色独立行动
    // 每 N 楼标记 pending → 下次消息生成前推演不在场角色行动（不抢 AI 生成 API）
    class WorldProgress {
        constructor() {
            // [v3.17] 发布确认（shujuku pending/accepted + revision 拒旧）：推进在 detached 副本产生，宿主确认后一次性 published
            this.pendingWrite = null;    // 待发布的写入 {charName, level, memory, floor}
            this.revision = 0;           // 单调修订号（乐观并发：旧实例迟到提交被拒）
            this.active = {};            // { charName: {level, entryHint|null, memory, floor, ts} }
            this.pending = false;
            this.EVERY_FLOORS = 2;       // 默认每 2 楼触发
            this.MAX_ACTIVE = 2;         // 候选最多 2 人
            this.HINT_LEVEL = { NONE: 0, TRACE: 1, MESSAGE: 2, ENTER: 3 };
        }
        markPending() { this.pending = true; }
        candidates(knownChars, presentChars, status, graph) {
            // 不在场 = 已知角色 - 在场角色
            return knownChars.filter(n => !presentChars.includes(n)).slice(0, 8);
        }
        // 选出最多 2 个候选（综合上次互动轮距 / 有无待办）
        select(candidates, status) {
            const scored = candidates.map(c => {
                let score = 0;
                const st = status?.characters?.[c];
                const lastSeen = st?.fields?.['上次互动'] ? Number(st.fields['上次互动']) : 0;
                const floorGap = st ? 0 : 5;
                score = (st?.fields?.['有独立目标'] ? 3 : 0) + lastSeen + (st?.todos?.length ? 2 : 0) + floorGap;
                return { name: c, score };
            }).sort((a, b) => b.score - a.score);
            return scored.slice(0, this.MAX_ACTIVE).map(s => s.name);
        }
        // [v3.17] 发布确认: 先暂存 pending（detached），宿主确认后 publish 生效
        propose(char, level, memory, floor) {
            this.pendingWrite = { char, level, memory, floor, revision: ++this.revision };
            return this.pendingWrite;
        }
        // 宿主确认（剧情生成成功/楼层稳定后调用）→ 一次性发布
        publish() {
            if (!this.pendingWrite) return null;
            const { char, level, memory, floor } = this.pendingWrite;
            this.active[char] = { level: level || 0, entryHint: level >= 1 && level <= 3 ? memory : null, memory, floor: floor || 0, ts: Date.now() };
            if (Object.keys(this.active).length > 10) {
                const oldest = Object.keys(this.active).sort((a, b) => this.active[a].ts - this.active[b].ts)[0];
                delete this.active[oldest];
            }
            const done = this.pendingWrite; this.pendingWrite = null; return done;
        }
        // 拒绝提交（楼层回滚/重roll 时丢弃 pending，防半提交推进污染）
        discard() { const d = this.pendingWrite; this.pendingWrite = null; return d; }
        // [v3.17] 对账（yuzuki overlay）: 楼层重排后推进过期自动失活
        reconcile(latestFloor) {
            const f = Math.max(0, Math.round(Number(latestFloor) || 0));
            let removed = 0;
            for (const k of Object.keys(this.active)) {
                if (this.active[k].floor > f) { delete this.active[k]; removed++; }
            }
            return removed;
        }
        // [v3.21] 实际推演: 用 charMem 最近记忆 + 图谱位置生成不在场角色动态（零新增 API 调用）
        // 这是 WorldProgress 的核心填充步骤——此前 active 恒空，世界推进空转
        generateFromMemory(engine, knownChars, presentChars, floor) {
            if (!engine || !knownChars?.length) return 0;
            const cands = this.candidates(knownChars, presentChars, null, engine.graph);
            if (!cands.length) return 0;
            const chosen = this.select(cands, engine.status);
            if (!chosen.length) return 0;
            let filled = 0;
            for (const name of chosen) {
                const mems = engine.charMem?.search ? engine.charMem.search(name, '') : [];
                if (!mems.length) continue;
                const recent = mems[0]?.text || '';
                if (!recent) continue;
                const memory = `（场外动态）${name}：${recent} —— 其生活仍在继续`;
                this.active[name] = { level: 0, entryHint: null, memory, floor: Number(floor) || 0, ts: Date.now() };
                filled++;
            }
            if (Object.keys(this.active).length > 10) {
                const oldest = Object.keys(this.active).sort((a, b) => this.active[a].ts - this.active[b].ts)[0];
                delete this.active[oldest];
            }
            return filled;
        }
        store(char, level, memory, floor) {
            this.active[char] = { level: level || 0, entryHint: level >= 1 && level <= 3 ? memory : null, memory, floor: floor || 0, ts: Date.now() };
            if (Object.keys(this.active).length > 10) {
                const oldest = Object.keys(this.active).sort((a, b) => this.active[a].ts - this.active[b].ts)[0];
                delete this.active[oldest];
            }
        }
        // 输出注入（buildInjection 调用）: 有入场引导的插消息位，无的进 world_state
        toInjection() {
            const entries = Object.values(this.active);
            if (!entries.length) return [];
            return entries.map(a => ({
                id: 'wp_' + a.floor,
                text: `${a.floor != null ? `（第${a.floor}楼待推进）${a.name || ''}` : ''}${a.memory || ''}`,
                source: 'worldprogress'
            }));
        }
        export() { return { active: this.active, pending: this.pending }; }
        import(data) { if (data) { this.active = data.active || {}; this.pending = !!data.pending; } }
    }

    class RelativeTimeHelper {
        constructor() {
            this.DAY_MS = 24 * 60 * 60 * 1000;
            this.WEEK_MS = 7 * this.DAY_MS;
            // 带「年月日」单位的日期字段之间允许出现的装饰分隔符
            this.DATE_FIELD_SEPARATOR = '[\\s·・•‧∙⋅.．。﹒/／,，、_\\-—–－]*';
        }

        /** 把全角/中文句点等日期分隔符规范成 / */
        normalizeNumericDateSeparators(dateStr) {
            if (!dateStr) return dateStr;
            return dateStr
                // 长格式(4 位年起):日数后只要不再跟数字/点即认,容忍后接逗号、中文、括号等
                .replace(/^(\d{4,})[.．。﹒](\d{1,2})[.．。﹒](\d{1,2})(?![\d.．。﹒])/, '$1/$2/$3')
                // 短格式(M.D):歧义大,仍要求后接空白或结尾,保守
                .replace(/^(\d{1,2})[.．。﹒](\d{1,2})(?=$|\s)/, '$1/$2');
        }

        /** 看起来是结构化数字日期(用于排除「霜月3日」误判为架空) */
        looksLikeStructuredNumericDate(dateStr) {
            if (!dateStr) return false;
            return (
                /^(?:\d{4,}[/.\-．。﹒]\d{1,2}[/.\-．。﹒]\d{1,2}|\d{1,2}[/.\-．。﹒]\d{1,2})(?=$|\s)/.test(dateStr) ||
                new RegExp(`^\\d+\\s*年${this.DATE_FIELD_SEPARATOR}\\d{1,2}\\s*月${this.DATE_FIELD_SEPARATOR}\\d{1,2}\\s*日?(?=$|\\s)`).test(dateStr) ||
                new RegExp(`^\\d{1,2}\\s*月${this.DATE_FIELD_SEPARATOR}\\d{1,2}\\s*日?(?=$|\\s)`).test(dateStr)
            );
        }

        /** 从架空日期串里抽「日数」(阿拉伯优先,无则取首个数字) */
        extractDayNumber(dateStr) {
            if (!dateStr) return null;
            const m = dateStr.match(/(\d+)\s*[日号]/) || dateStr.match(/第\s*(\d+)/);
            if (m) return parseInt(m[1], 10);
            const any = dateStr.match(/(\d+)/);
            if (any) return parseInt(any[1], 10);
            return null;
        }

        /** 从架空日期串里抽「月标识」(如「霜月」) */
        extractMonthIdentifier(dateStr) {
            if (!dateStr) return null;
            const m = dateStr.match(/([^\s\d]+月)/);
            if (m) return m[1];
            const num = dateStr.match(/(?:\d{4}[/\-])?(\d{1,2})[/\-]\d{1,2}/);
            if (num) return `M${num[1]}`;
            return null;
        }

        /** 解析故事日期字符串 → {type: 'standard'|'fantasy', year?, month?, day?, monthId?, calendarPrefix?} */
        parseStoryDate(dateStr) {
            if (!dateStr || typeof dateStr !== 'string') return null;
            const trimmed = dateStr.trim();
            if (!trimmed) return null;

            const normalized = this.normalizeNumericDateSeparators(trimmed);

            // 1. 尝试结构化数字日期
            if (this.looksLikeStructuredNumericDate(normalized)) {
                // 长格式：YYYY/M/D 或 YYYY-M-D
                let m = normalized.match(/^(\d{4,})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
                if (m) return {type: 'standard', year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10)};

                // 短格式：M/D 或 M-D
                m = normalized.match(/^(\d{1,2})[\/\-](\d{1,2})(?=$|\s)/);
                if (m) return {type: 'standard', month: parseInt(m[1], 10), day: parseInt(m[2], 10)};

                // 中文格式：X年Y月Z日
                const reYear = new RegExp(`^(\\d+)\\s*年${this.DATE_FIELD_SEPARATOR}(\\d{1,2})\\s*月${this.DATE_FIELD_SEPARATOR}(\\d{1,2})\\s*日?`);
                m = trimmed.match(reYear);
                if (m) return {type: 'standard', year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10)};

                // 中文格式：X月Y日
                const reMonth = new RegExp(`^(\\d{1,2})\\s*月${this.DATE_FIELD_SEPARATOR}(\\d{1,2})\\s*日?`);
                m = trimmed.match(reMonth);
                if (m) return {type: 'standard', month: parseInt(m[1], 10), day: parseInt(m[2], 10)};
            }

            // 2. 尝试架空日历（如「霜月3日」）
            const monthId = this.extractMonthIdentifier(trimmed);
            const day = this.extractDayNumber(trimmed);
            if (monthId && day) return {type: 'fantasy', monthId, day};

            return null;
        }

        /** 算天数差（standard 日期精确算，fantasy 日期仅同月可算） */
        calcDaysDiff(date1, date2) {
            if (!date1 || !date2) return null;
            if (date1.type !== date2.type) return null;

            if (date1.type === 'standard') {
                // 补齐缺失的年/月（按当前真实时间补）
                const now = new Date();
                const y1 = date1.year ?? now.getFullYear();
                const m1 = date1.month ?? (now.getMonth() + 1);
                const d1 = date1.day ?? 1;
                const y2 = date2.year ?? now.getFullYear();
                const m2 = date2.month ?? (now.getMonth() + 1);
                const d2 = date2.day ?? 1;

                const t1 = new Date(y1, m1 - 1, d1).getTime();
                const t2 = new Date(y2, m2 - 1, d2).getTime();
                return Math.round((t2 - t1) / this.DAY_MS);
            }

            if (date1.type === 'fantasy') {
                // 架空日历：只有同月才能算天数差
                if (date1.monthId !== date2.monthId) return null;
                return (date2.day ?? 0) - (date1.day ?? 0);
            }

            return null;
        }

        /** 生成相对时间前缀（「昨天」「3天前」「上周」等） */
        relativeTimePrefix(storyDate, nowDate) {
            const parsed1 = this.parseStoryDate(storyDate);
            const parsed2 = this.parseStoryDate(nowDate);
            const daysDiff = this.calcDaysDiff(parsed1, parsed2);

            if (daysDiff === null || daysDiff === undefined) return '';
            if (daysDiff === 0) return '今天';
            if (daysDiff === 1) return '昨天';
            if (daysDiff === 2) return '前天';
            if (daysDiff === -1) return '明天';
            if (daysDiff === -2) return '后天';
            if (daysDiff > 0 && daysDiff <= 7) return `${daysDiff}天前`;
            if (daysDiff < 0 && daysDiff >= -7) return `${-daysDiff}天后`;
            if (daysDiff > 7 && daysDiff < 14) return '上周';
            if (daysDiff < -7 && daysDiff > -14) return '下周';
            if (daysDiff >= 14 && daysDiff < 30) return `${Math.floor(daysDiff / 7)}周前`;
            if (daysDiff <= -14 && daysDiff > -30) return `${Math.floor(-daysDiff / 7)}周后`;
            if (daysDiff >= 30 && daysDiff < 365) return `${Math.floor(daysDiff / 30)}个月前`;
            if (daysDiff <= -30 && daysDiff > -365) return `${Math.floor(-daysDiff / 30)}个月后`;
            if (daysDiff >= 365) return `${Math.floor(daysDiff / 365)}年前`;
            if (daysDiff <= -365) return `${Math.floor(-daysDiff / 365)}年后`;
            return '';
        }
    }

    class PlotTimeline {
        constructor() { this.entries = []; }
        add(date, text, floor, characters = [], importance = 5) {
            if (!date || !text) return null;
            const exist = this.entries.find(e => e.date === date && e.text === text);
            if (exist) { exist.floor = floor; exist.timestamp = Date.now(); if (importance > (exist.importance || 5)) exist.importance = importance; return exist; }
            const e = {id: 'tl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), date, text, floor, characters, importance: (importance >= 1 && importance <= 10) ? importance : 5, timestamp: Date.now()};
            this.entries.push(e);
            if (this.entries.length > 500) this.entries.shift();
            return e;
        }
        // 按剧情日期相近度召回（同日最优先，前缀相近次之，最后兜底最新）
        searchNear(date, windowDays = 3, limit = 5) {
            if (!date) return this.entries.slice(-limit).reverse();
            const key = this._norm(date);
            const scored = this.entries.map(e => {
                const ek = this._norm(e.date);
                let dist = 999;
                if (ek === key) dist = 0;
                else if (ek.slice(0, 6) === key.slice(0, 6)) dist = 1;
                else if (ek.slice(0, 4) === key.slice(0, 4)) dist = 2;
                return {e, dist, t: e.timestamp};
            });
            scored.sort((a, b) => a.dist - b.dist || b.t - a.t);
            return scored.slice(0, limit).map(s => s.e);
        }
        _norm(d) { return String(d || '').replace(/\s+/g, '').replace(/[年月日]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''); }
        export() { return this.entries; }
        import(data) { this.entries = Array.isArray(data) ? data : []; }
    }
    
    // [v1.9] P1: BM25 稀疏检索（抄 anima bm25：词频×逆文档频率×长度归一化）
    class BM25 {
        constructor() { this.docs = []; this.docTerms = []; this.df = new Map(); this.N = 0; this.avgLen = 0; }
        _tokenize(text) {
            const tokens = [];
            const s = String(text || '').toLowerCase();
            (s.match(/[a-z0-9]+/g) || []).forEach(w => tokens.push(w));
            const cjkRuns = s.match(/[\u4e00-\u9fa5]+/g) || [];
            for (const run of cjkRuns) {
                if (run.length === 1) { tokens.push(run); continue; }
                for (let i = 0; i < run.length - 1; i++) tokens.push(run.slice(i, i + 2));
            }
            return tokens;
        }
        rebuild(docs) {
            this.docs = docs || [];
            this.N = this.docs.length;
            this.docTerms = this.docs.map(d => {
                const terms = this._tokenize(d.text);
                const map = new Map();
                terms.forEach(t => map.set(t, (map.get(t) || 0) + 1));
                return map;
            });
            this.df = new Map();
            for (const tm of this.docTerms) for (const t of tm.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
            this.avgLen = this.N ? this.docTerms.reduce((a, m) => a + m.size, 0) / this.N : 0;
        }
        search(query, topK = 5, opts = {}) {
            if (!this.N) return [];
            const qTerms = this._tokenize(query);
            if (!qTerms.length) return [];
            const k1 = 1.2, b = 0.75;
            const scored = [];
            for (let i = 0; i < this.N; i++) {
                const tm = this.docTerms[i];
                const len = tm.size || 1;
                let score = 0;
                const seen = new Set();
                for (const qt of qTerms) {
                    if (seen.has(qt)) continue;
                    seen.add(qt);
                    const tf = tm.get(qt) || 0;
                    if (!tf) continue;
                    const df = this.df.get(qt) || 0;
                    const idf = Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
                    score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * len / (this.avgLen || 1)));
                }
                if (score > 0) scored.push({ ...this.docs[i], score });
            }
            scored.sort((a, b) => b.score - a.score);
            if (!opts.cliffCut) return scored.slice(0, topK);
            // [v3.23] 断崖截断（NE-Memory retrieval-filter 分数断崖）: 相邻分 3x 且低于首项 15% → 自然截断
            // 弱相关长尾截掉，minResults 保底防空洞
            const minResults = opts.minResults || 2;
            let resultCount = Math.min(topK, scored.length);
            const topScore = scored[0]?.score || 0;
            if (resultCount >= minResults && scored.length > minResults && topScore > 0) {
                for (let i = 0; i < resultCount - 1; i++) {
                    const cur = scored[i].score;
                    const next = Math.max(scored[i + 1].score, 1e-8);
                    const pctOfTop = next / Math.max(topScore, 1e-8);
                    if (cur / next > 3.0 && pctOfTop < 0.15 && (i + 1) >= minResults) {
                        resultCount = i + 1;
                        break;
                    }
                }
            }
            // 保底: 至少返回 minResults 条非零分结果
            let pos = 0;
            while (pos < scored.length && scored[pos].score > 0) pos++;
            if (resultCount < minResults) resultCount = Math.min(Math.max(minResults, 1), Math.max(pos, 1), scored.length);
            return scored.slice(0, resultCount);
        }
    }
    
    // [v2.0] P2: 角色状态表（抄 yuzuki character-status：数值状态 + 待办生命周期）
    class CharacterState {
        constructor() {
            this.characters = {};   // { 角色名: { fields: {...}, todos: [...], updatedAt, floor } } (派生缓存)
            // [v2.3] RD: 事件溯源真源——每楼一条 op {floor, changes, todos}, 状态由重放推导 (抄 baibai delta-replay)
            this.ops = [];
            this.MAX_OPS = 500;
            this.MAX_FIELDS = 24;
            this.MAX_TODOS = 12;
        }
        // [v2.3] ops 记录 (同楼覆盖式: 重复提取同楼时后写覆盖前写, 重放幂等)
        _logOp(floor, kind, items) {
            try {
                if (!items || !items.length) return;
                let op = this.ops.find(o => o.floor === floor);
                if (!op) {
                    op = { floor, changes: [], todos: [] };
                    this.ops.push(op);
                    if (this.ops.length > this.MAX_OPS) this.ops.shift();
                }
                if (kind === 'changes') op.changes = items;
                if (kind === 'todos') op.todos = items;
            } catch (e) { errLog(e, 'CharacterState._logOp'); }
        }
        // [v2.3] 重放重建: 清空派生状态, 按楼层升序重放全部 ops (删楼回滚后调它, 天然一致)
        rebuildFromOps() {
            try {
                const saved = [...this.ops].sort((a, b) => a.floor - b.floor);
                this.characters = {};
                for (const op of saved) {
                    if (Array.isArray(op.changes) && op.changes.length) this.applyChanges(op.changes, op.floor, true);
                    if (Array.isArray(op.todos) && op.todos.length) this.addTodos(op.todos, op.floor, true);
                }
            } catch (e) { errLog(e, 'CharacterState.rebuildFromOps'); }
        }
        _ensure(name) {
            if (!this.characters[name]) {
                this.characters[name] = { name, fields: {}, todos: [], updatedAt: Date.now(), floor: 0 };
            }
            return this.characters[name];
        }
        // 设置/增量修改状态字段 ([v2.3] _replaying=true 表示正在重放, 不再记 op)
        applyChanges(changes, floor, _replaying = false) {
            if (!Array.isArray(changes)) return 0;
            let n = 0;
            const effective = [];
            for (const c of changes) {
                const name = String(c?.character || c?.name || '').trim();
                const field = String(c?.field || '').trim();
                if (!name || !field) continue;
                const rec = this._ensure(name);
                // 数值增量 / 绝对值 / 文本
                if (c.delta !== undefined && c.delta !== null && !isNaN(Number(c.delta))) {
                    const base = Number(rec.fields[field]) || 0;
                    rec.fields[field] = Math.round((base + Number(c.delta)) * 100) / 100;
                } else if (c.value !== undefined && c.value !== null) {
                    rec.fields[field] = (typeof c.value === 'number') ? c.value : String(c.value).trim();
                }
                if (c.reason) rec.lastReason = String(c.reason).trim();
                rec.updatedAt = Date.now();
                rec.floor = floor || 0;
                // 字段数上限保护
                const keys = Object.keys(rec.fields);
                if (keys.length > this.MAX_FIELDS) delete rec.fields[keys[0]];
                effective.push(c);
                n++;
            }
            if (!_replaying && effective.length) this._logOp(floor, 'changes', effective);
            return n;
        }
        // 待办事项（带去重 + 过期清理）([v2.3] _replaying=true 表示正在重放)
        addTodos(items, floor, _replaying = false) {
            if (!Array.isArray(items)) return 0;
            let n = 0;
            const effective = [];
            for (const t of items) {
                const name = String(t?.character || t?.owner || '').trim();
                const text = String(t?.text || t?.content || '').trim();
                if (!name || !text) continue;
                const rec = this._ensure(name);
                // [v3.31] concern 复发（kiwi-mem/kimi-core 理念）：同一待办被再次提起 = 复发
                const reoccurred = (rec.todos || []).some(x => x.text === text);   // 先查旧件是否存在
                rec.todos = rec.todos.filter(x => x.text !== text);                // 再移除旧件
                rec.todos.push({
                    text, date: t.date ? String(t.date).trim() : '', floor: floor || 0, createdAt: Date.now(),
                    lastMentionedAt: Date.now(),         // [v3.31] 复发追踪：最近一次被提及
                    reoccurred: reoccurred || undefined, // [v3.31] 标记这是复发（历史上有过）
                });
                if (rec.todos.length > this.MAX_TODOS) rec.todos.shift();
                effective.push(t);
                n++;
            }
            if (!_replaying && effective.length) this._logOp(floor, 'todos', effective);
            return n;
        }
        // 过期待办清理（抄 yuzuki todo-manager：剧情时间超过延迟即移除）
        pruneTodos(currentDate, expiryMinutes = 60) {
            if (!currentDate) return 0;
            const cur = this._parseDate(currentDate);
            if (!cur) return 0;
            let removed = 0;
            for (const name of Object.keys(this.characters)) {
                const rec = this.characters[name];
                rec.todos = (rec.todos || []).filter(t => {
                    // [v3.31] concern 复发豁免：最近 24h 内被重申的待办即使日期已过也暂不清（延续生命周期）
                    if (t.lastMentionedAt && (Date.now() - t.lastMentionedAt < 24 * 3600000)) return true;
                    if (!t.date) return true;
                    const td = this._parseDate(t.date);
                    if (!td) return true;
                    const diffMin = (cur - td) / 60000;
                    if (diffMin > expiryMinutes) { removed++; return false; }
                    return true;
                });
            }
            return removed;
        }
        _parseDate(d) {
            const m = String(d || '').match(/(\d{1,4})\s*[年\/-]\s*(\d{1,2})\s*[月\/-]\s*(\d{1,2})/);
            if (!m) return null;
            let y = Number(m[1]); if (y < 100) y += 2000;
            return new Date(y, Number(m[2]) - 1, Number(m[3]), 0, 0, 0).getTime();
        }
        // 按角色召回（只返回有状态的）
        searchByNames(names, limit = 5) {
            const out = [];
            for (const n of (names || [])) {
                const rec = this.characters[n];
                if (!rec) continue;
                const fields = Object.entries(rec.fields || {});
                const todos = (rec.todos || []);
                if (!fields.length && !todos.length) continue;
                out.push({ name: n, fields, todos });
            }
            return out.slice(0, limit);
        }
        export() { return { characters: this.characters, ops: this.ops }; }
        import(data) {
            if (data && typeof data === 'object' && data.characters) {
                this.characters = data.characters;
                this.ops = Array.isArray(data.ops) ? data.ops : [];
            } else {
                // 旧格式 (v2.2 之前): 纯 characters 对象, ops 从零开始积累
                this.characters = (data && typeof data === 'object') ? data : {};
                this.ops = [];
            }
        }
    }
    
    // [v2.0] P2: 楼层账本（抄 yuzuki floor-ledger：记忆变更绑定楼层，删楼/重生成自动回滚）
    class FloorLedger {
        constructor() {
            this.floors = {};   // { floor: { nodeIds:[], summaryFloors:[], povIds:[], timelineIds:[], statusSnapshot:{} } }
            this.MAX_FLOORS = 400;
        }
        beginFloor(floor, statusSnapshot) {
            this.floors[floor] = {
                floor,
                nodeIds: [],
                summaryFloors: [],
                povIds: [],
                timelineIds: [],
                statusSnapshot: statusSnapshot || null,
                createdAt: Date.now()
            };
            const keys = Object.keys(this.floors);
            if (keys.length > this.MAX_FLOORS) {
                delete this.floors[keys.sort((a, b) => a - b)[0]];
            }
            return this.floors[floor];
        }
        record(floor, patch) {
            const e = this.floors[floor] || this.beginFloor(floor);
            if (patch.nodeIds) e.nodeIds.push(...patch.nodeIds);
            if (patch.summaryFloors) e.summaryFloors.push(...patch.summaryFloors);
            if (patch.povIds) e.povIds.push(...patch.povIds);
            if (patch.timelineIds) e.timelineIds.push(...patch.timelineIds);
            return e;
        }
        get(floor) { return this.floors[floor] || null; }
        // 移除楼层记录，返回被移除的条目（供调用方回滚）
        remove(floor) {
            const e = this.floors[floor];
            if (!e) return null;
            delete this.floors[floor];
            return e;
        }
        // 该楼层之后的所有楼层（重生成/删楼后需回滚的）
        floorsAfter(floor) {
            return Object.keys(this.floors).map(Number).filter(f => f > floor).sort((a, b) => a - b);
        }
        export() { return this.floors; }
        import(data) { this.floors = (data && typeof data === 'object') ? data : {}; }
    }
    
    // [v2.1] P3: 提取互斥锁（抄 hcdiary：cdBusy/cdPending 防并发写坏数据）
    class Mutex {
        constructor() { this.busy = false; this.pending = false; this.waiters = []; }
        async acquire() {
            if (!this.busy) { this.busy = true; return true; }
            // 已有任务在跑：排队等待（最多等 30s，避免死等）
            return new Promise((resolve) => {
                let done = false;
                const timer = setTimeout(() => {
                    if (done) return;
                    done = true;
                    const i = this.waiters.indexOf(entry);
                    if (i >= 0) this.waiters.splice(i, 1);
                    resolve(false);
                }, 30000);
                const entry = (ok) => {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    if (ok) this.busy = true;
                    resolve(ok);
                };
                this.waiters.push(entry);
            });
        }
        release() {
            if (this.waiters.length) {
                const next = this.waiters.shift();
                next(true);   // 直接把锁交给下一个等待者
            } else {
                this.busy = false;
            }
        }
        get locked() { return this.busy; }
        get queueLength() { return this.waiters.length; }
    }
    
    // [v2.1] P3: 节日感知（抄 anima default_rag_strategy.holidays：日期临近节日时增强）
    class HolidayAware {
        constructor() {
            this.holidays = [
                { date: '12-25', name: '圣诞节', before: 3, after: 3 },
                { date: '02-14', name: '情人节', before: 2, after: 2 },
                { date: '01-01', name: '元旦', before: 3, after: 3 },
                { date: '10-31', name: '万圣节', before: 1, after: 1 },
                { date: '05-20', name: '网络情人节', before: 1, after: 1 },
                { date: '06-01', name: '儿童节', before: 1, after: 1 },
                { date: '08-15', name: '中秋节', before: 3, after: 3 },
                { date: '07-07', name: '七夕', before: 2, after: 2 }
            ];
        }
        _parse(dateStr) {
            const s = String(dateStr || '');
            // [v2.2] 修复: 支持无年日期("3月12日"); 节日比较只看月/日, 年缺省用占位年
            const m = s.match(/(\d{3,4})\s*[年\/\-.]\s*(\d{1,2})\s*[月\/\-.]\s*(\d{1,2})/)
                || s.match(/(\d{1,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/)
                || s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
            if (!m) return null;
            const mo = Number(m[m.length - 2]), d = Number(m[m.length - 1]);
            if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
            let y = m.length === 4 ? Number(m[1]) : 2024;
            if (y < 100) y += 2000;
            return { y, mo, d };
        }
        /** 返回当前日期所处的节日（含临近窗口），无则 null */
        current(dateStr) {
            const p = this._parse(dateStr);
            if (!p) return null;
            for (const h of this.holidays) {
                const [hm, hd] = h.date.split('-').map(Number);
                const cur = p.mo * 100 + p.d;
                const target = hm * 100 + hd;
                // 允许跨月窗口（简单按天数近似）
                const diff = this._dayDiff(p.mo, p.d, hm, hd, p.y);
                if (diff >= -h.before && diff <= h.after) {
                    return { name: h.name, date: h.date, offsetDays: diff };
                }
            }
            return null;
        }
        _dayDiff(m1, d1, m2, d2, year) {
            const a = new Date(year, m1 - 1, d1).getTime();
            let bYear = year;
            const b = new Date(bYear, m2 - 1, d2).getTime();
            let diff = Math.round((a - b) / 86400000);
            // 处理跨年（如 12月 看 1月1日）
            if (diff > 180) diff -= 365;
            if (diff < -180) diff += 365;
            return diff;
        }
        /** 节日关键词（用于召回加权 / 注入提示） */
        keywords(holidayName) {
            const map = {
                '圣诞节': ['圣诞', '圣诞树', '礼物', '平安夜', '雪'],
                '情人节': ['情人节', '玫瑰', '巧克力', '告白', '约会'],
                '元旦': ['元旦', '新年', '跨年', '倒计时'],
                '万圣节': ['万圣', '南瓜', '糖果', '变装'],
                '网络情人节': ['520', '告白', '我爱你'],
                '儿童节': ['儿童节', '游乐场', '糖果'],
                '中秋节': ['中秋', '月饼', '团圆', '赏月'],
                '七夕': ['七夕', '牛郎织女', '鹊桥', '乞巧']
            };
            return map[holidayName] || [];
        }
    }
    
    // [v2.5] RF: 活人感日记（抄 hcdiary——第一人称心声+secret+记忆回环; 旧版仅summary副本已废弃）
    // [v2.8] RT-B: 反思系统（抄 stbme reflection——每N楼从近期剧情提炼高层洞察）
    class ReflectionSystem {
        constructor() { this.items = []; this._lastReflectFloor = -1; this._running = false; }
        /** 反思生成：抽最近窗口剧情+已知矛盾区，产出 {insight,trigger,suggestion,importance} */
        async generate(config, llm, engine, floor) {
            const every = Math.max(0, Number(config.reflectEveryFloors || 10));
            if (!config.reflectionEnabled || !llm) return 0;
            if (every > 0 && (floor - this._lastReflectFloor) < every) return 0;
            if (this._running) return 0;
            this._running = true;
            this._lastReflectFloor = floor;
            try {
                const ctx = window.SillyTavern?.getContext?.();
                const chat = ctx?.chat || [];
                const win = chat.slice(-Math.max(6, every)).map(m => (m.mes || '').substring(0, 400)).join('\n');
                if (!win) return 0;
                const contradictions = (engine.suspense?.items || []).filter(x => x.status !== 'open').slice(-3)
                    .map(x => `- ${x.content}（${x.status}）`).join('\n') || '(无)';
                const recentInsights = this.items.slice(-3).map(i => `- ${i.insight}`).join('\n') || '(无)';
                const prompt = `你是 RP 长期记忆系统的反思生成器。阅读最近剧情，提炼最值得长期保留的高层结论。
规则：
- insight 总结最近情节中最值得长期保留的变化、关系趋势或潜在线索（50字内，不复述事件）。
- trigger 说明触发这条反思的关键事件或矛盾。
- suggestion 给出后续叙事上值得关注的提示。
- importance 1-10，数字越大越重要。
- 只输出JSON：{"insight":"...","trigger":"...","suggestion":"...","importance":5}
【最近剧情】
${win}
【近期已有反思】（禁止重复提炼相同结论）
${recentInsights}
【已了结/失败的悬念】（可作为矛盾线索参考）
${contradictions}`;
                const raw = await llm.callAPI(prompt);
                if (!raw) return 0;
                const m = String(raw).match(/\{[\s\S]*\}/);
                if (!m) return 0;
                const parsed = JSON.parse(m[0]);
                const insight = String(parsed?.insight || '').trim();
                if (insight.length < 8) return 0;
                this.items.push({
                    floor, insight: insight.slice(0, 120),
                    trigger: String(parsed?.trigger || '').slice(0, 120),
                    suggestion: String(parsed?.suggestion || '').slice(0, 120),
                    importance: Math.min(10, Math.max(1, Number(parsed?.importance) || 5)),
                    timestamp: Date.now()
                });
                if (this.items.length > 20) this.items.shift();
                return 1;
            } catch (e) { return 0; }
            finally { this._running = false; }
        }
        /** 召回：重要度 Top-N */
        search(limit = 2) {
            return [...this.items].sort((a, b) => b.importance - a.importance).slice(0, limit);
        }
        export() { return { items: this.items, lastReflectFloor: this._lastReflectFloor }; }
        import(data) {
            if (data && typeof data === 'object' && Array.isArray(data.items)) {
                this.items = data.items;
                this._lastReflectFloor = Number(data.lastReflectFloor ?? -1);
            } else if (Array.isArray(data)) { this.items = data; }
        }
    }

    class DiarySystem {
        constructor() { this.diaries = {}; this._lastDiaryFloor = -1; this._writing = false; this._pending = null; }
        /**
         * 活人感日记生成（每N楼节流，抽最近窗口一次生成所有登场角色的日记）
         * @returns {number} 写入条数
         */
        async generateLiving(config, llm, knownChars, floor) {
            const every = Math.max(0, Number(config.diaryEveryFloors || 3));
            if (!config.livingDiary || !llm) return 0;
            if (every > 0 && (floor - this._lastDiaryFloor) < every) return 0;
            if (this._writing) { this._pending = floor; return 0; }
            this._writing = true;
            this._lastDiaryFloor = floor;
            try {
                const ctx = window.SillyTavern?.getContext?.();
                const chat = ctx?.chat || [];
                const win = chat.slice(-Math.max(4, every * 2 + 2)).map(m => (m.mes || '').substring(0, 500)).join('\n');
                if (!win) return 0;
                const memory = Object.entries(this.diaries).map(([n, arr]) => {
                    const last = (arr || []).slice(-1)[0];
                    return last ? `${n}: ${String(last.text || '').substring(0, 60)}` : null;
                }).filter(Boolean).slice(0, 10).join('\n');
                const prompt = `你是"角色日记"记录员。阅读给定剧情片段，为其中每个有名有戏份的登场角色，以该角色第一人称主观视角写一篇日记。
规则：
- 只为有名字、有实际戏份的角色写；纯路人忽略；不要为用户/玩家角色写日记。
- 第一人称，带该角色的情绪、私心、主观理解（可与事实有偏差）。同一事件不同角色可以记得不同。
- entry 是心声不是剧情复述：聚焦心理活动、情绪、关系变化、关键决定。100字内。
- secret 写"没说出口的心思"（没有填空串）。
- 复用已知角色名单中的主名。只输出JSON：{"diaries":[{"name":"主名","entry":"第一人称正文","mood":"心情词","secret":"没说出口的心思"}]}
${knownChars?.length ? `已知角色名单: ${knownChars.join('、')}` : '已知角色名单: (暂无)'}
${memory ? `各角色已有记忆(最新日记):\n${memory}` : '各角色已有记忆: (暂无)'}
【剧情片段】
${win}`;
                const raw = await llm.callAPI(prompt);
                if (!raw) return 0;
                const m = String(raw).match(/\{[\s\S]*\}/);
                if (!m) return 0;
                const parsed = JSON.parse(m[0]);
                let n = 0;
                for (const d of (parsed.diaries || [])) {
                    const name = String(d?.name || '').trim();
                    const entry = String(d?.entry || '').trim();
                    if (!name || entry.length < 4) continue;
                    if (!this.diaries[name]) this.diaries[name] = [];
                    this.diaries[name].push({
                        floor, text: entry.slice(0, 200), mood: String(d.mood || '平静').slice(0, 10),
                        secret: String(d.secret || '').slice(0, 100), timestamp: Date.now()
                    });
                    if (this.diaries[name].length > 30) this.diaries[name].shift();
                    n++;
                }
                return n;
            } catch (e) { return 0; }
            finally { this._writing = false; }
        }
        search(characters) {
            const results = [];
            for (const char of (characters || [])) if (this.diaries[char]) results.push(...this.diaries[char].slice(-3));
            return results;
        }
        // [v2.7] RS: 按楼层删除日记（rollbackFloor 联动，幂等）
        removeByFloor(floor) {
            let n = 0;
            for (const name of Object.keys(this.diaries)) {
                const arr = this.diaries[name];
                const filtered = arr.filter(d => d.floor !== floor);
                if (filtered.length !== arr.length) { n += arr.length - filtered.length; this.diaries[name] = filtered; }
            }
            return n;
        }
        export() { return { diaries: this.diaries, lastDiaryFloor: this._lastDiaryFloor }; }
        import(data) {
            if (data && typeof data === 'object' && data.diaries) {
                this.diaries = data.diaries;
                this._lastDiaryFloor = Number(data.lastDiaryFloor ?? -1);
            } else {
                this.diaries = data || {};
            }
        }
    }
    
    // [v2.9] RU-C: 存储快照管理（抄 shujuku SQLite 版本管理理念——IndexedDB 每50楼一份快照，可回溯恢复）
    class SnapshotManager {
        constructor() { this.DB_NAME = 'lonsha_snapshots'; this.STORE = 'snaps'; this.MAX_KEEP = 5; this._db = null; }
        async _open() {
            if (this._db) return this._db;
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(this.DB_NAME, 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.STORE)) {
                        db.createObjectStore(this.STORE, { keyPath: 'id' });
                    }
                };
                req.onsuccess = () => { this._db = req.result; resolve(req.result); };
                req.onerror = () => reject(req.error);
            });
        }
        /** 保存快照（同对话只保留最近 MAX_KEEP 份，同楼覆盖） */
        async save(chatId, floor, data) {
            try {
                const db = await this._open();
                const id = `${chatId}`;
                // 读出该对话现有快照
                const existing = await new Promise((resolve) => {
                    const tx = db.transaction(this.STORE, 'readonly');
                    const req = tx.objectStore(this.STORE).get(id);
                    req.onsuccess = () => resolve(req.result || {id, snaps: []});
                    req.onerror = () => resolve({id, snaps: []});
                });
                const snaps = (existing.snaps || []).filter(s => s.floor !== floor);
                snaps.push({floor, data, timestamp: Date.now()});
                snaps.sort((a, b) => a.floor - b.floor);
                while (snaps.length > this.MAX_KEEP) snaps.shift();
                const doc = {id, snaps};
                await new Promise((resolve, reject) => {
                    const tx = db.transaction(this.STORE, 'readwrite');
                    tx.objectStore(this.STORE).put(doc);
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });
                return snaps.length;
            } catch (e) { return 0; }
        }
        /** 列出该对话的快照（楼层+时间） */
        async list(chatId) {
            try {
                const db = await this._open();
                return await new Promise((resolve) => {
                    const tx = db.transaction(this.STORE, 'readonly');
                    const req = tx.objectStore(this.STORE).get(`${chatId}`);
                    req.onsuccess = () => resolve((req.result?.snaps || []).map(s => ({floor: s.floor, timestamp: s.timestamp})));
                    req.onerror = () => resolve([]);
                });
            } catch (e) { return []; }
        }
        /** 恢复指定楼层的快照数据 */
        async restore(chatId, floor) {
            try {
                const db = await this._open();
                return await new Promise((resolve) => {
                    const tx = db.transaction(this.STORE, 'readonly');
                    const req = tx.objectStore(this.STORE).get(`${chatId}`);
                    req.onsuccess = () => {
                        const snap = (req.result?.snaps || []).find(s => s.floor === floor);
                        resolve(snap?.data || null);
                    };
                    req.onerror = () => resolve(null);
                });
            } catch (e) { return null; }
        }
    }

    class StorageManager {
        constructor() { this.STORAGE_KEY = 'lonsha_memory'; }
        async save(chatId, data) {
            try {
                const ctx = window.SillyTavern?.getContext?.();
                if (!ctx?.chatMetadata) return;
                // [v3.4] DB: 摘要骤减保护——存储前对比上一版，总量骤减（>50%且缺口≥20）先紧急备份再写
                try {
                    const prev = ctx.chatMetadata.extensions?.[this.STORAGE_KEY]?.data;
                    const prevN = Array.isArray(prev?.summaries?.summaries) ? prev.summaries.summaries.length : (Array.isArray(prev?.summaries) ? prev.summaries.length : 0);
                    const nextN = Array.isArray(data?.summaries?.summaries) ? data.summaries.summaries.length : (Array.isArray(data?.summaries) ? data.summaries.length : 0);
                    if (prevN >= 30 && nextN < prevN * 0.5 && (prevN - nextN) >= 20) {
                        console.warn(`[${PLUGIN_NAME}] 摘要骤减 ${prevN}→${nextN}，写紧急备份`);
                        const eb = window.LonShaMemory?.emergency;
                        if (eb?.save) await eb.save(chatId, `摘要骤减 ${prevN}→${nextN}`, prev, { summaries: prevN });
                    }
                } catch (e) { errLog(e, 'DB.骤减检测'); }
                if (!ctx.chatMetadata.extensions) ctx.chatMetadata.extensions = {};
                ctx.chatMetadata.extensions[this.STORAGE_KEY] = {version: VERSION, chatId, data, timestamp: Date.now()};
                if (ctx.saveChat) await ctx.saveChat(); else if (window.saveChat) await window.saveChat();
            } catch (err) { console.error('保存失败:', err); }
        }
        async load(chatId, opts = {}) {
            try {
                const ctx = window.SillyTavern?.getContext?.();
                const data = ctx?.chatMetadata?.extensions?.[this.STORAGE_KEY]?.data;
                // [v3.12] preserveRuntime=true（生成路径）: 只读返回存档数据，不 import 覆盖运行时——
                //   运行时内存里的自愈/shift/编辑修改是最新状态，被旧存档盖回=回退（v3.7~v3.9 修复成果全被冲掉的经典 bug）
                if (opts.preserveRuntime) return data || null;
                if (data && window.LonShaMemory?.engine) {
                    const engine = window.LonShaMemory.engine;
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
                    if (data.supersede && engine.supersede) engine.supersede.import(data.supersede);
                    if (data.reflection && engine.reflection) engine.reflection.import(data.reflection);
                    // [v3.16] 角色记忆银行 + 世界推进恢复
                    if (data.charMem && engine.charMem) engine.charMem.import(data.charMem);
                    if (data.worldProg && engine.worldProg) engine.worldProg.import(data.worldProg);
                    if (Array.isArray(data.itemOps)) { engine.itemOps = data.itemOps; (engine.reconcileItemOps || engine.rebuildItems)?.call(engine); }   // [v3.3] 加载即对账（补 fp/自愈/清理）
                }
                return data;
            } catch (err) { return null; }
        }
    }
    
    // [v3.4] DB: 紧急备份（摘要骤减保护，抄 hcdiary 日记骤减补回——检测到骤减自动写 IndexedDB 快照 + localStorage）
    class EmergencyBackup {
        constructor() { this.DB_NAME = 'lonsha_snapshots'; this.STORE = 'snaps'; this.MAX_EMERGENCY = 8; this.LS_KEY = 'lonsha_emergency_backup'; this._db = null; }
        async _open() {
            if (this._db) return this._db;
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(this.DB_NAME, 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.STORE)) db.createObjectStore(this.STORE, { keyPath: 'id' });
                };
                req.onsuccess = () => { this._db = req.result; resolve(req.result); };
                req.onerror = () => reject(req.error);
            });
        }
        /** 写紧急备份（同聊天最多保留 MAX_EMERGENCY 份；IndexedDB + localStorage 双写） */
        async save(chatId, reason, data, counts) {
            const entry = { floor: -1, emergency: true, reason: String(reason || ''), counts: counts || {}, data, timestamp: Date.now() };
            // localStorage 兜底（IndexedDB 不可用时也能保命）
            try {
                if (data.summaries && JSON.stringify(data.summaries).length < 900000) {
                    localStorage.setItem(this.LS_KEY + ':' + String(chatId || 'default'), JSON.stringify({ reason: entry.reason, counts: entry.counts, timestamp: entry.timestamp, data: { summaries: data.summaries, diaries: data.diaries, graph: data.graph, itemOps: data.itemOps } }));
                }
            } catch (e) {}
            try {
                const db = await this._open();
                const id = 'emergency:' + String(chatId || 'default');
                const existing = await new Promise((resolve) => {
                    const tx = db.transaction(this.STORE, 'readonly');
                    const req = tx.objectStore(this.STORE).get(id);
                    req.onsuccess = () => resolve(req.result || { id, snaps: [] });
                    req.onerror = () => resolve({ id, snaps: [] });
                });
                const snaps = (existing.snaps || []).slice(-(this.MAX_EMERGENCY - 1));
                snaps.push(entry);
                await new Promise((resolve, reject) => {
                    const tx = db.transaction(this.STORE, 'readwrite');
                    tx.objectStore(this.STORE).put({ id, snaps });
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });
                return true;
            } catch (e) { errLog(e, 'DB.emergency.save'); return false; }
        }
        /** 读最近一份紧急备份 */
        async latest(chatId) {
            try {
                const db = await this._open();
                return await new Promise((resolve) => {
                    const tx = db.transaction(this.STORE, 'readonly');
                    const req = tx.objectStore(this.STORE).get('emergency:' + String(chatId || 'default'));
                    req.onsuccess = () => { const s = req.result?.snaps || []; resolve(s.length ? s[s.length - 1] : null); };
                    req.onerror = () => resolve(null);
                });
            } catch (e) { return null; }
        }
    }

    class LonShaMemoryPlugin {
        constructor() { 
            this.configMgr = new ConfigManager(); 
            this.engine = new MemoryEngine(this.configMgr); 
            this.emergency = new EmergencyBackup();   // [v3.4] DB: 紧急备份
            this.diffusion = null;
            this.visualizer = null;
            this.initialized = false; 
        }
        async init() {
            if (this.initialized) return;
            console.log(`[${PLUGIN_NAME}] v${VERSION} 初始化...`);
            await this.waitForST();
            this.loadModules();
            this.registerEvents();
            // [v3.23] chatMetadata 迁移恢复检测（NE auto-restore）
            try { this.checkEmbeddedMigration(); } catch (e) { errLog(e, '迁移恢复.init'); }
            this.createUI();
            await this.ensureSettingsUI();
            // [v1.2] 初始化时加载当前对话的已有记忆数据
            try {
                const chatId = this.engine.getCurrentChatId();
                if (chatId) {
                    const data = await this.engine.storage.load(chatId);
                    if (data) console.log(`[${PLUGIN_NAME}] ✓ 已加载历史记忆 (节点 ${this.engine.graph.nodes.size}, 向量 ${this.engine.vector.vectors.length})`);
                }
            } catch (err) {
                console.warn(`[${PLUGIN_NAME}] 历史记忆加载失败:`, err);
            }
            this.initialized = true;
            console.log(`[${PLUGIN_NAME}] ✓ 初始化完成 (LLM+向量检索+图扩散+可视化已启用)`);
        }
        
        // [v1.3] 设置面板加载兜底：宿主若不加载 extra_js，则动态注入 settings-ui.js
        async ensureSettingsUI() {
            if (this.showSettingsPanel) { this._settingsUIMounted = true; return; }
            try {
                const scriptSrc = document.currentScript?.src
                    || Array.from(document.querySelectorAll('script[src]')).map(s => s.src).find(s => s.includes('lonsha-memory-plugin') && s.endsWith('index.js'));
                if (!scriptSrc) return;
                const base = scriptSrc.replace(/index\.js.*$/, '');
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = base + 'settings-ui.js';
                    s.onload = resolve;
                    s.onerror = reject;
                    document.head.appendChild(s);
                });
                // 等待挂载完成
                for (let i = 0; i < 20 && !this.showSettingsPanel; i++) {
                    await new Promise(r => setTimeout(r, 150));
                }
                this._settingsUIMounted = !!this.showSettingsPanel;
                console.log(`[${PLUGIN_NAME}] ${this._settingsUIMounted ? '✓ 设置面板已加载 (动态注入)' : '⚠️ 设置面板加载超时'}`);
            } catch (err) {
                console.warn(`[${PLUGIN_NAME}] settings-ui.js 动态加载失败:`, err);
            }
        }
        loadModules() {
            // 加载图扩散模块
            if (typeof GraphDiffusion !== 'undefined') {
                this.diffusion = new GraphDiffusion(this.engine.graph);
                console.log(`[${PLUGIN_NAME}] ✓ 图扩散模块已加载`);
            }
            // 加载可视化模块
            if (typeof MemoryVisualizer !== 'undefined') {
                this.visualizer = new MemoryVisualizer(this.engine);
                console.log(`[${PLUGIN_NAME}] ✓ 可视化模块已加载`);
            }
        }
        async waitForST() { return new Promise(resolve => { const check = () => { if (window.SillyTavern?.getContext) resolve(); else setTimeout(check, 100); }; check(); }); }
        // [v3.18] 控制平面（stbme 最小版）: 事件注册统一收口 + 就绪状态机
        // 所有事件处理器注册前先检查控制平面就绪，避免半初始化注册
        _controlReady = false;
        _controlInfo = { events: 0, lastEvent: null, registeredAt: null };
        ensureControlReady() {
            if (this._controlReady) return true;
            if (!window.SillyTavern?.getContext?.()) return false;
            this._controlReady = true;
            this._controlInfo.registeredAt = Date.now();
            return true;
        }
        // 统一事件注册包装：记录 + 注册 + 防重
        bindEvent(eventSource, type, handler) {
            try {
                if (!this.ensureControlReady()) return false;
                eventSource.on(type, handler);
                this._controlInfo.events++;
                this._controlInfo.lastEvent = type;
                return true;
            } catch (e) { errLog(e, '控制平面.bindEvent'); return false; }
        }
        registerEvents() {
            // [v3.18] 控制平面就绪检查（stbme 最小版）
            if (!this.ensureControlReady()) { console.warn(`[${PLUGIN_NAME}] 控制平面未就绪，跳过事件注册`); return; }
            // [v1.2 真机适配修复] 原实现监听 'message_received' 自定义事件，
            // 标准 SillyTavern 中不存在该事件，导致提取链路从不触发。
            // 正确方式：通过 SillyTavern 的 eventSource + event_types 注册。
            this.eventHandlers = []; // 记录已注册事件，供卸载清理

            try {
                const ctx = window.SillyTavern?.getContext?.();
                const eventSource = ctx?.eventSource
                    || (typeof eventSource !== 'undefined' ? eventSource : null);
                const types = ctx?.event_types
                    || (typeof event_types !== 'undefined' ? event_types : null);

                if (!eventSource || !types?.MESSAGE_RECEIVED) {
                    console.warn(`[${PLUGIN_NAME}] eventSource 不可用，事件监听未注册（仅手动模式可用）`);
                    return;
                }

                // MESSAGE_RECEIVED 回调参数是 messageId，需要从 chat 数组取消息对象
                eventSource.on(types.MESSAGE_RECEIVED, (messageId) => {
                    try {
                        const c = window.SillyTavern?.getContext?.();
                        const message = c?.chat?.[messageId];
                        // [v3.1] SF5: 番外楼跳过（extra.lonsha_omit=true 的楼彻底排除记忆——必须在提取之前判定）
                        if (message?.extra?.lonsha_omit === true) {
                            if (this.engine.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 楼层 ${messageId} 为番外楼，跳过记忆提取`);
                            return;
                        }
                        if (message) this.engine.onMessageReceived(message, messageId);
                    } catch (err) {
                        console.error(`[${PLUGIN_NAME}] 消息处理失败:`, err);
                    }
                });
                this.eventHandlers.push({ eventSource, type: types.MESSAGE_RECEIVED });

                // CHAT_CHANGED：切换对话时重新加载对应数据
                if (types.CHAT_CHANGED) {
                    eventSource.on(types.CHAT_CHANGED, async () => {
                        try { this.engine._recallCache = null; } catch (e) { errLog(e, 'events.CHAT_CHANGED缓存清理'); }  // [v2.9] RU-D: 换对话，缓存失效
                        // [v3.23.1] 换对话同步清空 dedup 指纹（防旧对话文本误标新对话）
                        try { resetRecallDedup(); } catch (e) { errLog(e, 'events.CHAT_CHANGED去重清空'); }
                        // [v3.25.1] 换对话同步清空归档状态（防旧对话楼层 index 误操作新对话）
                        try { this.engine._archivedFloorIds?.clear(); } catch (e) { errLog(e, 'events.CHAT_CHANGED归档清空'); }
                        // [v3.2] DF1/DF5: 清空注入槽位（setExtensionPrompt 持久化，旧聊天注入会残留到新聊天；GENERATION_STARTED 若仍活跃会立即重新注入）
                        try { clearInjectSlots(); } catch (e) { errLog(e, 'events.CHAT_CHANGED槽位清空'); }
                        // [v3.9] SF2: 基线重置（换聊天后用新聊天的长度，防旧基线误报批量删除）
                        try { this.engine._lastKnownChatLen = window.SillyTavern?.getContext?.()?.chat?.length || 0; } catch (e) {}
                        // [v3.12] 清自愈定时器/待愈集合（跨聊天污染防护——旧聊天的待愈楼层对新聊天无意义）
                        try {
                            if (this._editHealTimer) { clearTimeout(this._editHealTimer); this._editHealTimer = null; }
                            this._editHealPending = new Set();
                            this._selfHealRunning = false;
                            this._lockDegradePending = new Set();
                        } catch (e) { errLog(e, 'events.CHAT_CHANGED自愈清理'); }
                        try {
                            const chatId = this.engine.getCurrentChatId();
                            if (chatId) await this.engine.storage.load(chatId);
                        } catch (err) {
                            console.error(`[${PLUGIN_NAME}] 对话切换加载失败:`, err);
                        }
                    });
                    this.eventHandlers.push({ eventSource, type: types.CHAT_CHANGED });
                }

                // [v3.7] 楼层编辑——升级为「精准回滚 + 防抖自愈」:
                //   只回滚被编辑楼（不再级联摧毁下游记忆），防抖 3s 后自动重提取该楼（编辑=新内容的新记忆）
                //   语义依据: 下游楼各自记录的是「它们所述剧情」，编辑楼改动不使下游失效（细致于旧级联策略）
                if (types.MESSAGE_EDITED) {
                    eventSource.on(types.MESSAGE_EDITED, (messageId) => {
                        try { this.engine._recallCache = null; } catch (e) { errLog(e, 'events.MESSAGE_EDITED缓存清理'); }  // [v2.9] RU-D: 上下文变了，缓存失效
                        // [v3.23.1] 编辑楼同步清空 dedup 指纹（防编辑后的新内容被旧指纹误标）
                        try { resetRecallDedup(); } catch (e) { errLog(e, 'events.MESSAGE_EDITED去重清空'); }
                        // [v3.25.1] 编辑楼清空归档状态（该楼折叠覆盖关系可能已变化）
                        try { this.engine._archivedFloorIds?.clear(); } catch (e) { errLog(e, 'events.MESSAGE_EDITED归档清空'); }
                        try {
                            const f = Number(messageId);
                            if (!Number.isFinite(f) || f < 0) return;
                            console.log(`[${PLUGIN_NAME}] 楼层 ${f} 被编辑: 回滚该楼 + 防抖自愈`);
                            this.engine.rollbackFloor(f);
                            this._scheduleFloorHeal(f);   // [v3.8] 统一调度器
                            // [v3.12] 立即持久化（原只改内存——刷新页面丢 v3.9 shift/回滚成果）
                            try {
                                const cSave = window.SillyTavern?.getContext?.();
                                if (cSave?.chat?.length) this.engine.storage.save(this.engine.getCurrentChatId(), this.engine.collectExport());
                            } catch (e) { errLog(e, 'events.编辑即时存盘'); }
                        } catch (err) { console.warn(`[${PLUGIN_NAME}] 编辑回滚失败:`, err); }
                    });
                    this.eventHandlers.push({ eventSource, type: types.MESSAGE_EDITED });
                }
                if (types.MESSAGE_SWIPED) {
                    eventSource.on(types.MESSAGE_SWIPED, (messageId) => {
                        // [v3.23.1] swipe 重roll后同步清空 dedup 指纹（防旧 swipe 文本残留误标新回复）
                        try { resetRecallDedup(); } catch (e) { errLog(e, 'events.MESSAGE_SWIPED去重清空'); }
                        try {
                            const f = Number(messageId);
                            if (Number.isFinite(f) && f >= 0) {
                                // [v2.9] RU-D: swipe 不清召回缓存（同楼重roll复用，本楼记忆对召回影响极小）
                                if (this.configMgr.config.debugMode) console.log(`[${PLUGIN_NAME}] 楼层 ${f} 滑动/重生成, 回滚该楼记忆`);
                                this.engine.rollbackFloor(f);
                                // [v3.8] swipe 自愈: 修「swipe 后该楼无记忆」缺口——防抖后重提取当前变体（编辑自愈同款）
                                this._scheduleFloorHeal(f);
                                // [v3.12] 立即持久化（刷新页面防丢）
                                try {
                                    const cSave = window.SillyTavern?.getContext?.();
                                    if (cSave?.chat?.length) this.engine.storage.save(this.engine.getCurrentChatId(), this.engine.collectExport());
                                } catch (e) { errLog(e, 'events.swipe即时存盘'); }
                            }
                        } catch (err) {}
                    });
                    this.eventHandlers.push({ eventSource, type: types.MESSAGE_SWIPED });
                }
// [v2.0] P2: 删楼回滚（楼层账本）
                if (types.MESSAGE_DELETED) {
                    eventSource.on(types.MESSAGE_DELETED, async (messageId) => {
                        try { this.engine._recallCache = null; } catch (e) { errLog(e, 'events.MESSAGE_DELETED缓存清理'); }  // [v2.9] RU-D: 上下文变了，缓存失效
                        // [v3.23.1] 删楼同步清空 dedup 指纹（防删楼后残留指纹误标后续召回）
                        try { resetRecallDedup(); } catch (e) { errLog(e, 'events.MESSAGE_DELETED去重清空'); }
                        // [v3.25.1] 删楼清空归档状态（楼层 index 前移，旧归档 index 语义失效）
                        try { this.engine._archivedFloorIds?.clear(); } catch (e) { errLog(e, 'events.MESSAGE_DELETED归档清空'); }
                        // [v3.1] SF2: 渲染切片保护（抄 stbme history-safety——删除 payload 不可靠，批量删除时警告）
                        try {
                            const c = window.SillyTavern?.getContext?.();
                            const chatLen = c?.chat?.length || 0;
                            if (this.engine._lastKnownChatLen && this.engine._lastKnownChatLen - chatLen > 5) {
                                console.warn(`[${PLUGIN_NAME}] 检测到批量删除(${this.engine._lastKnownChatLen}→${chatLen})，楼层账本回滚可能不完整，建议打开诊断面板核对`);
                                errLog(new Error(`批量删除 ${this.engine._lastKnownChatLen}→${chatLen}，回滚可能不完整`), 'SF2.批量删除警告');
                            }
                            this.engine._lastKnownChatLen = chatLen;
                        } catch (e) { errLog(e, 'SF2.渲染切片保护'); }
                        try {
                            const c = window.SillyTavern?.getContext?.();
                            // ST 删楼后 chat 已变化，直接尝试回滚该楼及其后的记忆
                            const floor = Number(messageId);
                            if (!Number.isFinite(floor)) return;
                            plugin.engine.rollbackFloor(floor);
                            // [v3.9] 废除级联销毁：被删楼之后的记忆不再删除，改为楼层前移重定位（数据零丢失）
                            try { plugin.engine.shiftFloorsFrom?.(floor); } catch (e) { errLog(e, 'SH.删楼前移'); }
                            // [v3.3] 台账重放化：删除后全量对账
                            try { plugin.engine.reconcileItemOps?.(); } catch (e) { errLog(e, 'V33.删楼全量对账'); }
                            // [v3.12] 立即持久化（删楼+shift 成果防刷新丢失）
                            try {
                                const cidSave = plugin.engine.getCurrentChatId();
                                if (cidSave) await plugin.engine.storage.save(cidSave, plugin.engine.collectExport());
                            } catch (e) { errLog(e, 'events.删楼即时存盘'); }
                        } catch (err) {
                            if (plugin.engine.config.config.debugMode) console.error(`[${PLUGIN_NAME}] 删楼回滚失败:`, err);
                        }
                    });
                    this.eventHandlers.push({ eventSource, type: types.MESSAGE_DELETED });
                }
                // [v1.2] GENERATION_STARTED：生成前注入记忆（主注入路径）
                // [v3.12] GENERATION_ENDED 兜底: 用户 Esc 中止生成时 MESSAGE_RECEIVED 不触发，标志卡死 true → 自愈永久延后
                if (types.GENERATION_ENDED) {
                    eventSource.on(types.GENERATION_ENDED, () => {
                        try { this.engine._generationActive = false; } catch (e) { errLog(e, 'events.GENERATION_ENDED复位'); }
                    });
                    this.eventHandlers.push({ eventSource, type: types.GENERATION_ENDED });
                }
                if (types.GENERATION_STARTED) {
                    eventSource.on(types.GENERATION_STARTED, async () => {
                        // [v3.12] 代际标记: 并发两次 STARTED（快速连发）时，后到者递增代际；先到者的慢写最后检查代际避免覆盖新注入
                        const myGen = (this._genSeq = (this._genSeq || 0) + 1);
                        try {
                            // [v3.2] DF1: 引擎停用（总开关关，或提取+向量全关）时清空槽位并跳过——持久化槽位不清则旧注入残留
                            const _cfg = this.engine.config.config;
                            if (_cfg.enabled === false || (_cfg.extractionEnabled === false && _cfg.vectorEnabled === false)) {
                                clearInjectSlots();
                                return;
                            }
                            this.engine._generationActive = true;   // [v3.10] 标记生成中（自愈调度器读）
                            const injection = await this.engine.onBeforeGeneration();
                            // [v3.12] 代际检查: await 期间若已有更新的一次 STARTED（myGen 过期），放弃本次慢结果（防旧注入覆盖新注入）
                            if (myGen !== this._genSeq) { console.log(`[${PLUGIN_NAME}] 注入代际过期，放弃本次结果`); return; }
                            // [v3.2] DF6: 空召回=显式清除（baibai 语义"注入空串等于清除"——召回价值判断跳过时旧槽位残留会注入上一轮记忆）
                            const depth = Math.min(2, Math.max(0, Number(this.engine.config.config.injectionDepth) || 0));
                            writeInjectSlot('lonsha_memory', injection || '', depth);
                            // [v3.2] DF6: 卷摘要槽独立刷新（与召回无关；空卷=清除旧卷）
                            try { writeInjectSlot('lonsha_memory_history', this.engine.buildVolumeInjection() || '', 9999); } catch (e) { errLog(e, 'DF6.卷摘要刷新'); }
                        } catch (err) {
                            console.error(`[${PLUGIN_NAME}] 生成前注入失败:`, err);
                        }
                    });
                    this.eventHandlers.push({ eventSource, type: types.GENERATION_STARTED });
                }

                console.log(`[${PLUGIN_NAME}] ✓ 事件监听已注册 (MESSAGE_RECEIVED${types.CHAT_CHANGED ? ' + CHAT_CHANGED' : ''}${types.GENERATION_STARTED ? ' + GENERATION_STARTED' : ''})`);
            } catch (err) {
                console.error(`[${PLUGIN_NAME}] 事件注册异常:`, err);
            }
        }

        // [v3.8] 统一楼层自愈调度器（编辑/swipe 共用）:
        //   防抖 3s 后对「待愈楼层集合」逐楼重提取（集合去重 + 连编多楼支持）
        _scheduleFloorHeal(f) {
            try {
                this._editHealPending = this._editHealPending || new Set();
                this._editHealPending.add(f);
                if (this._editHealTimer) clearTimeout(this._editHealTimer);
                this._editHealTimer = setTimeout(() => {
                    this._editHealTimer = null;
                    this._runFloorHeal();
                }, 3000);
            } catch (e) { errLog(e, 'events.楼层自愈计时'); }
        }
        // [v3.10] 自愈执行体：生成中延后重试（防与 onBeforeGeneration 召回并发读脏）；防重入（执行中再调度不叠加）
        async _runFloorHeal() {
            try {
                if (this._selfHealRunning) return;   // 防重入：上一轮未完成，本轮跳过（pending 已收集，下轮定时器会再跑）
                // [v3.10] 生成中（LLM 召回在飞）不重提取——楼层留在待愈集合，5s 后再试
                if (this.engine?._generationActive) {
                    if (this._editHealPending?.size) {
                        this._editHealTimer = setTimeout(() => { this._editHealTimer = null; this._runFloorHeal(); }, 5000);
                    }
                    return;
                }
                const pending = Array.from(this._editHealPending || []).sort((a, b) => a - b);
                this._editHealPending = new Set();
            this._selfHealRunning = false;             // [v3.10] 自愈执行防重入
                if (!pending.length) return;
                this._selfHealRunning = true;
                try {
                    for (const hf of pending) {
                        try {
                            const c = window.SillyTavern?.getContext?.();
                            const m = c?.chat?.[hf];
                            if (!m || m.is_user === true) continue;   // 用户楼不提取
                            if (this.engine.isOmittedFloor?.(m)) continue;
                            const text = String(m.mes || '').trim();
                            if (!text) continue;
                            console.log(`[${PLUGIN_NAME}] 楼层自愈: 重提取楼层 ${hf}`);
                            await this.engine.onMessageReceived({ ...m, index: hf }, hf);
                        } catch (e) { errLog(e, `events.楼层自愈重提取.${hf}`); }
                    }
                } finally { this._selfHealRunning = false; }
            } catch (e) { errLog(e, 'events.楼层自愈执行'); }
        }
        // 插件卸载时清理事件监听
        unregisterEvents() {
            if (!this.eventHandlers) return;
            for (const { eventSource, type } of this.eventHandlers) {
                try { eventSource.removeListener?.(type); } catch {}
                try { eventSource.off?.(type); } catch {}
            }
            this.eventHandlers = [];
        }
        createUI() {
            const fab = document.createElement('div');
            fab.id = 'lonsha-memory-fab'; fab.innerHTML = '🧠';
            fab.style.cssText = 'position:fixed;bottom:80px;right:20px;width:50px;height:50px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:10000;transition:transform 0.2s;';
            fab.addEventListener('click', () => this.showPanel());
            fab.addEventListener('mouseenter', () => fab.style.transform = 'scale(1.1) rotate(5deg)');
            fab.addEventListener('mouseleave', () => fab.style.transform = 'scale(1)');
            document.body.appendChild(fab);
        }
        showPanel() {
            // 设置面板模块 (settings-ui.js) 会覆盖 showFabMenu 提供完整菜单；
            // 此处为兜底：模块未加载时提示
            if (this.showFabMenu && this._settingsUIMounted) return this.showFabMenu();
            const stats = {nodes: this.engine.graph.nodes.size, edges: this.engine.graph.edges.size, vectors: this.engine.vector.vectors.length};
            alert(`LonSha记忆引擎 v${VERSION}\n\n图谱节点: ${stats.nodes} | 关系边: ${stats.edges} | 向量: ${stats.vectors}\n\n⚠️ 设置面板模块未加载（检查 settings-ui.js）\n🔧 调试: window.LonShaMemory`);
        }
    }
    
    // [v1.2 真机适配修复] 原实现是空占位 async chat => chat，记忆注入从不发生。
    // 保留 interceptor 作为兼容入口（部分 ST 版本通过 manifest generate_interceptor 调用），
    // 主注入路径改为 GENERATION_STARTED 事件 + setExtensionPrompt（ST 标准注入方式）。
    window.lonsha_memory_interceptor = async (chat, ...args) => {
        try {
            // [v3.2] DF1: 停用时不注入（与 GENERATION_STARTED 主路径同语义）
            const _cfgI = plugin.engine.config.config;
            if (_cfgI.enabled === false || (_cfgI.extractionEnabled === false && _cfgI.vectorEnabled === false)) return chat;
            const injection = await plugin.engine.onBeforeGeneration();
            // [v3.2] DF6: 空召回=显式清除；卷摘要独立刷新
            const okInj = writeInjectSlot('lonsha_memory', injection || '', Math.min(2, Math.max(0, Number(plugin.engine.config.config.injectionDepth) || 0)));
            if (okInj) {
                try { writeInjectSlot('lonsha_memory_history', plugin.engine.buildVolumeInjection() || '', 9999); } catch (e) { errLog(e, 'DF6.interceptor卷摘要'); }
            } else if (injection && Array.isArray(chat) && chat.length > 0 && chat[0]) {
                // 降级：注入到 system 消息尾部（仅通道不可用且有内容时）
                chat[0].mes = (chat[0].mes || '') + injection;
            }
        } catch (err) {
            console.error(`[${PLUGIN_NAME}] 记忆注入失败:`, err);
        }
        return chat;
    };
    const plugin = new LonShaMemoryPlugin();
    plugin.init().catch(err => console.error(`[${PLUGIN_NAME}] 初始化失败:`, err));
    window.LonShaMemory = plugin;
})();
