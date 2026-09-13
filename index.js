(function() {
    'use strict';
    const PLUGIN_NAME = 'LonSha记忆引擎';
    const VERSION = '3.50.0';
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

    // [v3.13] 思维链/正文分流
    // [v3.45] 吸收 shujuku lenient-text: 扩展主流推理标签 (think/thinking/thought/reasoning/analysis)
    // 并在未闭合截断时引入宽容熔断器，剥离开标签、保护真实正文不被吞没白屏
    function extractThinkingChain(text) {
        try {
            let s = String(text || '');
            if (!s) return { content: '', thinking: '' };
            const thinkingParts = [];
            const fenceMask = [];
            // 先遮罩 ``` 围栏，防止剥掉代码示例里的推理标签
            s = s.replace(/```[\s\S]*?```/g, (m) => { fenceMask.push(m); return '\u0000F' + (fenceMask.length - 1) + '\u0000'; });
            
            // [v3.45] 扩展支持 think|thinking|thought|reasoning|analysis 5类推理标签
            let out = '', depth = 0, buf = '';
            const tokens = s.split(/(<\/?(?:think|thinking|thought|reasoning|analysis)\b[^>]*>)/i);
            for (const tk of tokens) {
                if (/^<(?:think|thinking|thought|reasoning|analysis)\b[^>]*>$/i.test(tk)) {
                    if (depth === 0) buf = '';
                    depth++;
                } else if (/^<\/(?:think|thinking|thought|reasoning|analysis)\s*>$/i.test(tk)) {
                    depth--;
                    if (depth <= 0) {
                        if (buf && buf.trim()) thinkingParts.push(buf.trim());
                        buf = '';
                        depth = 0;
                    } else if (buf) {
                        buf += tk;
                    }
                } else if (depth > 0) {
                    buf += tk;
                } else {
                    out += tk;
                }
            }
            // [v3.45] 宽容熔断器 (shujuku lenient-text): 处理未闭合标签
            if (depth > 0 && buf) {
                const switchMatch = buf.match(/\n\s*\n(?=[\u4e00-\u9fa5A-Za-z0-9"'#*[{`])/);
                if (switchMatch) {
                    const thinkContent = buf.slice(0, switchMatch.index).trim();
                    const bodyContent = buf.slice(switchMatch.index).trim();
                    if (thinkContent) thinkingParts.push(thinkContent);
                    out += (out ? '\n\n' : '') + bodyContent;
                } else {
                    // 纯思考且截断
                    if (buf.trim()) thinkingParts.push(buf.trim());
                }
            }

            // 清理剥离后残留的空标签与多余空行，还原围栏
            out = out.replace(/<\/?(?:think|thinking|thought|reasoning|analysis)\b[^>]*>/gi, '').replace(/\n{3,}/g, '\n\n').trim();
            out = out.replace(/\u0000F(\d+)\u0000/g, (_, i) => fenceMask[Number(i)] || '');
            return {
                content: out,
                thinking: thinkingParts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
            };
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
    // [v3.43] 吸收 baibai: NPC 四档压平分级注入与性别铁律
    function buildNpcTierInjection(npcs = []) {
        if (!Array.isArray(npcs)) return [];
        const oneLine = (value) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        const out = [];
        for (const npc of npcs) {
            if (!npc || !String(npc.name || '').trim()) continue;
            const name = oneLine(npc.name);
            const gender = npc.gender ? `[性别:${oneLine(npc.gender)}]` : '';
            const tier = npc.roleTier || (npc.isImportant ? 'important' : npc.isPresent ? 'present' : 'absent');
            if (tier === 'important') {
                const fields = Array.isArray(npc.fields) ? npc.fields.map(x => Array.isArray(x) ? `${oneLine(x[0])}:${oneLine(x[1])}` : '').filter(Boolean).join(' | ') : '';
                const todos = Array.isArray(npc.todos) ? npc.todos.map(x => oneLine(x?.text || x?.content)).filter(Boolean).join('、') : '';
                out.push(oneLine(`- ${name}${gender}${npc.title ? `（${oneLine(npc.title)}）` : ''}${fields ? ` — ${fields}` : ''}${todos ? `；待办:${todos}` : ''}${npc.persona ? `；当前人设:${oneLine(npc.persona)}` : ''}`));
            } else if (tier === 'present') {
                const fields = Array.isArray(npc.fields) ? npc.fields.map(x => Array.isArray(x) ? `${oneLine(x[0])}:${oneLine(x[1])}` : '').filter(Boolean).join(' | ') : '';
                out.push(oneLine(`- ${name}${gender}${npc.now ? ` 当前姿态:${oneLine(npc.now)}` : ''}${fields ? ` — ${fields}` : ''}${npc.persona ? `；当前人设:${oneLine(npc.persona)}` : ''}`));
            } else if (tier === 'same_area') {
                const traits = Array.isArray(npc.traits) ? npc.traits.map(oneLine).filter(Boolean).slice(0, 3).join('、') : '';
                out.push(oneLine(`- ${name}${gender}${npc.identity ? `（${oneLine(npc.identity)}）` : ''}${traits ? ` — 性格:${traits}` : ''}`));
            } else {
                const relationHead = oneLine(npc.relation || '').split(/[，,]/)[0].slice(0, 12);
                const identity = oneLine(npc.title || npc.identity || '');
                out.push(oneLine(`- ${name}${gender}${relationHead ? ` 称谓:${relationHead}` : ''}${identity ? ` 身份:${identity}` : ''}`));
            }
        }
        return out;
    }
    // [v3.43] end NPC tier injection
    // [v3.45] 吸收 baibai: NPC 长期社会人伦羁绊网（血缘/婚姻/主仆/宿敌，不因不在场而失效）
    function fmtNpcTiesContext(npcs) {
        if (!Array.isArray(npcs) || !npcs.length) return '';
        const oneLine = (value) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        const relationKey = (value) => String(value || '').toLowerCase().replace(/[；;]/g, ';').replace(/\s+/g, ' ').trim();
        const grouped = new Map();
        for (const npc of npcs) {
            const name = oneLine(npc?.name);
            const rawTies = Array.isArray(npc?.ties) ? npc.ties.join(';') : oneLine(npc?.ties);
            if (!name || !rawTies) continue;

            const nameKey = name.toLowerCase();
            let entry = grouped.get(nameKey);
            if (!entry) {
                entry = { name, ties: [], seen: new Set() };
                grouped.set(nameKey, entry);
            }
            for (const tie of rawTies.split(/[；;]/).map(one => one.trim()).filter(Boolean)) {
                const tieKey = relationKey(tie);
                if (entry.seen.has(tieKey)) continue;
                entry.seen.add(tieKey);
                entry.ties.push(tie);
            }
        }

        const rows = [...grouped.values()]
            .filter(entry => entry.ties.length > 0)
            .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
            .map(entry => `- ${entry.name}：${entry.ties.join('；')}`);
        return rows.length ? `[角色长期关系网]（血缘/婚姻/主仆/宿敌等，不因是否在场而失效）：\n${rows.join('\n')}` : '';
    }
    // [v3.48] 吸收 yuzuki: 关系五分类学（family/intimate/hostile/social/other 正则分类）
    function classifyRelationshipType(relation) {
        try {
            const value = String(relation || '');
            if (!value) return 'other';
            if (/(师父|师母|师傅|干爹|干妈|义父|义母)/.test(value)) return 'social';  // [v3.48] 「师父」含「父」字，必须先于 family 判定
            if (/(父|母|兄|弟|姐|妹|祖|孙|叔|伯|姑|姨|舅|侄|甥|亲属|亲戚|家人|家族|养父|养母|继父|继母|异母|异父|血缘|血亲)/.test(value)) return 'family';
            if (/(恋|爱|婚|夫|妻|情侣|伴侣|未婚|情人|暗恋|亲密|前任|暧昧|床)/.test(value)) return 'intimate';
            if (/(敌|仇|宿敌|竞争|对手|冲突|敌对|嫌疑|警惕|背叛|出卖)/.test(value)) return 'hostile';
            if (/(同事|同学|朋友|好友|上司|下属|老师|学生|师父|徒弟|合作|盟友|搭档|邻居|校友|秘书|助理|雇主|雇员|主仆|仆人|侍女)/.test(value)) return 'social';
            return 'other';
        } catch (e) { return 'other'; }
    }
    // [v3.48] 吸收 yuzuki + 配合 v3.45 羁绊网: 伦理冲突检测（family × intimate 交叉即告警）
    function detectEthicsConflict(fromName, toName, relationType, existingTies) {
        try {
            const cls = classifyRelationshipType(relationType);
            if (cls !== 'intimate') return null;
            // 检查两人之间是否已有 family 类羁绊（血缘/婚姻）
            const key = normalizeCharName(toName);
            for (const tie of (existingTies || [])) {
                const tName = normalizeCharName(tie?.name || '');
                if (tName !== key) continue;
                const ties = Array.isArray(tie?.ties) ? tie.ties.join(';') : String(tie?.ties || '');
                // [v3.48] 置信分级：tie 显式含 from 名（如「苏晨:亲生哥哥」）→ 直接告警；
                // 双向血缘词（兄妹/父子等，从任何一方看都成立）→ 也告警；
                // 单向关系词无主名（如只写「亲生妹妹」未写是谁的妹妹）→ 不告警（无法确认 from 是血亲）
                const explicitFrom = ties.includes(fromName);
                const bidirectional = /(兄妹|姐弟|兄弟|姐妹|父子|父女|母子|母女|祖孙|血缘|血亲)/.test(ties);
                if (explicitFrom || bidirectional) {  // 防乱伦优先：血缘证据即告警（保守策略）
                    return { from: fromName, to: toName, relation: relationType, tie: ties };
                }
            }
            return null;
        } catch (e) { return null; }
    }

    // [v3.41] 吸收 Stitches 工业级标签净化: 剥除思维链、多智能体协调与中间跑团标签，保护正文不被污染
    function stripMemoryOpsTags(text) {
        try {
            let s = String(text || '');
            // 1. 过滤 Stitches / RebornV 及复杂跑团中间成对块标签
            s = s.replace(/<(recall|dm_plan|dm_set|plan|inner|act|npcs|file|scene|dm_story|dm_track|npc_track|npc_jump|disclaimer|JSONPatch|Analysis|UpdateVariable|tucao|StatusPlaceHolderImpl|summary|options|thinking|think|thought|reasoning|analysis|review|refine|itsuki|output)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
            // 2. 过滤单操作符与时间物理标签
            s = s.replace(/<\/?(field|todo|item|time|date|bbs_time)\s*:[^>]*?>/gi, '');
            return s.trim();
        } catch (e) { return text; }
    }
    const stripInternalTags = stripMemoryOpsTags;
    // [v3.37] 提取正文中的物理时间标签锚点（抄 baibai 正文时间锚点理念，零API同步）
    function extractTimeTagFast(text) {
        try {
            const s = String(text || '');
            if (!s.includes('<')) return null;
            const m = /<(?:time|date|bbs_time)\s*:\s*([^>]+?)>/i.exec(s);
            if (m && m[1]) {
                const rawTime = m[1].trim();
                if (rawTime.length >= 2 && rawTime.length <= 40) return rawTime;
            }
            return null;
        } catch (e) { return null; }
    }

    // [v3.0] SD: 错误记录器——环形缓冲存最近50条，替代静默吞错。诊断面板读取展示。
    const _errBuf = [];
    // [v3.18] 错误提示规则库（shujuku: 43条精简版）
    // [v3.36] 升级为结构化人话诊断矩阵（包含原因诊断与具体可操作建议）
    const _ERROR_HINTS = [
        // [api-auth] 鉴权与配额
        { re: /401|Unauthorized|invalid.*api.*key|api key.*invalid/i, title: 'API Key 无效', reason: '密钥错误、被撤销或未配置。', action: '前往设置检查 API Key 与端点地址是否匹配。' },
        { re: /403|Forbidden|permission denied/i, title: '访问受限', reason: '当前 Key 缺少该模型权限或账户被封禁。', action: '检查账户权限或切换具有权限的模型。' },
        { re: /insufficient_quota|quota exceeded|billing|balance/i, title: '额度耗尽', reason: 'API 提供商账户余额用尽或免费额度已过期。', action: '前往服务商控制台充值，或更换有效服务商。' },
        { re: /429|Too Many Requests|rate limit|quota/i, title: '触发频控限流', reason: '短时间内调用频率过高。', action: '稍等片刻重试，或调大并发间隔时间。' },
        
        // [api-model] 模型与上下文
        { re: /404|not found|The model .* does not exist/i, title: '模型不存在', reason: '服务商端点未找到填写的模型名。', action: '在设置中核对模型名称拼写（如区分-preview/-latest）。' },
        { re: /context_length_exceeded|maximum context length|too many tokens|max_tokens/i, title: '上下文超限', reason: '单次提示词总 Token 超出了模型支持的上下文窗口。', action: '在设置中降低记忆注入预算，或开启归档隐藏已折叠楼层。' },
        { re: /content_filter|sensitive|safety|policy violation/i, title: '内容安全拦截', reason: '剧情内容触发了提供商的敏感词安全审查。', action: '适当调整角色台词/剧情道白，或更换审查宽松的模型。' },

        // [network] 网络通信
        { re: /Failed to fetch|NetworkError|network error|fetch failed|ECONNREFUSED|ENOTFOUND/i, title: '网络不通（连接失败）', reason: '无法连接到指定的 API 目标地址。', action: '检查设备是否联网、代理软件是否放行或域名是否拼写错误。' },
        { re: /timeout|timed out|ETIMEDOUT|aborted/i, title: '请求超时', reason: '上游服务器在限定时间内未完成响应。', action: '检查网络延迟，或在设置中加大提取/向量超时上限。' },
        { re: /CORS|cross.origin|Access-Control-Allow/i, title: '跨域访问受限', reason: '浏览器禁止网页直接跨域调用该私有或公网端点。', action: '配置反向代理（如酒馆内置代理）或在服务端放行 CORS。' },
        { re: /5\d\d|Internal Server Error|Bad Gateway|Service Unavailable/i, title: '上游服务器异常', reason: 'API 服务商内部服务故障或宕机。', action: '通常为服务商短暂波动，稍作等待后重试。' },

        // [storage] 本地存储
        { re: /QuotaExceeded|quota exceeded|exceeded.*storage/i, title: '浏览器存储满', reason: '当前源的 localStorage 或 IndexedDB 配额已耗尽。', action: '导出聊天记录后清理多余历史，或精简非必要插件缓存。' },
        { re: /IndexedDB|indexedDB.*error|object store|SecurityError/i, title: '数据库/权限受限', reason: '浏览器隐私模式或无痕模式限制了本地持久化。', action: '关闭隐私无痕模式，或通过顶部菜单执行快照恢复。' },

        // [runtime] 数据与宿主
        { re: /Unexpected token.*JSON|JSON\.parse|Unexpected end of JSON/i, title: 'JSON 格式破损', reason: 'LLM 未按约束输出标准 JSON（夹带了解释文本或未转义引号）。', action: '插件已自动安全兜底；若持续出现建议更换指令遵循能力更强的模型。' },
        { re: /setExtensionPrompt|getContext/i, title: '酒馆接口未就绪', reason: 'SillyTavern 核心接口未就绪或被第三方扩展拦截。', action: '刷新酒馆页面，并确认 SillyTavern 版本 >= 1.12.0。' },
        { re: /undefined is not|Cannot read propert|is not a function/i, title: '内部引用空指针', reason: '运行时数据字段缺失（多见于跨大版本旧档）。', action: '建议在设置面板点击【一键自愈】或重新导入最新备份。' },
        { re: /RangeError|Maximum call stack|out of memory/i, title: '内存/调用栈溢出', reason: '记忆链路循环递归或超大单体文本撑爆内存。', action: '降低检索条数上限，减少单楼正文字符数。' }
    ];
    // [v3.18] JSON sanitizer（shujuku/baibai）: 全角引号归一 + 未转义引号修复
    // [v3.44] 吸收 shujuku: 字符流状态机 JSON 容错解析器 (Robust Stream Sanitizer)
    function sanitizeJson(raw) {
        try {
            if (!raw) return '';
            let s = String(raw).trim();
            if (!s) return '';

            // 1. 全角引号与全角标点归一化
            s = s.replace(/[\u201c\u201d\u201e\u300c\u300d]/g, '"')
                 .replace(/[\u2018\u2019]/g, "'")
                 .replace(/\uff0c/g, ',')
                 .replace(/\uff1a/g, ':')
                 .replace(/\uff1b/g, ';');
            // 单引号键值向双引号转换（保护 don't, it's 等字母间缩写）
            s = s.replace(/([a-zA-Z])'([a-zA-Z])/g, '$1__APOSTROPHE__$2')
                 .replace(/'/g, '"')
                 .replace(/__APOSTROPHE__/g, "'");

            // 2. 剥离外层闲聊废话与 Markdown 围栏
            const firstObj = s.indexOf('{');
            const firstArr = s.indexOf('[');
            let startIdx = -1;
            let isArray = false;
            if (firstObj !== -1 && firstArr !== -1) {
                if (firstObj < firstArr) { startIdx = firstObj; isArray = false; }
                else { startIdx = firstArr; isArray = true; }
            } else if (firstObj !== -1) {
                startIdx = firstObj; isArray = false;
            } else if (firstArr !== -1) {
                startIdx = firstArr; isArray = true;
            }

            if (startIdx === -1) {
                return s.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
            }

            const endToken = isArray ? ']' : '}';
            const endIdx = s.lastIndexOf(endToken);
            if (endIdx > startIdx) {
                s = s.slice(startIdx, endIdx + 1);
            } else {
                s = s.slice(startIdx);
            }

            // 3. 字符流状态机：修复未转义双引号与字符串内部裸引号
            let out = '';
            let inString = false;
            let escaped = false;
            for (let i = 0; i < s.length; i++) {
                const ch = s[i];
                if (escaped) {
                    out += ch;
                    escaped = false;
                    continue;
                }
                if (ch === '\\') {
                    out += ch;
                    escaped = true;
                    continue;
                }
                if (ch === '"') {
                    if (!inString) {
                        inString = true;
                        out += ch;
                    } else {
                        // 前瞻下一个非空白字符
                        let nextNonSpace = '';
                        for (let j = i + 1; j < s.length; j++) {
                            const nc = s[j];
                            if (nc !== ' ' && nc !== '\t' && nc !== '\r' && nc !== '\n') {
                                nextNonSpace = nc;
                                break;
                            }
                        }
                        if (!nextNonSpace || nextNonSpace === ',' || nextNonSpace === ':' || nextNonSpace === '}' || nextNonSpace === ']') {
                            inString = false;
                            out += ch;
                        } else {
                            out += '\\"';
                        }
                    }
                } else {
                    out += ch;
                }
            }

            // 4. 清除对象/数组尾部多余的逗号（悬挂逗号：, } 或 , ]）
            out = out.replace(/,\s*([}\]])/g, '$1');

            // 5. 修复未加引号的纯英文字母对象键（如 { name: "value" } -> { "name": "value" }）
            out = out.replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":');

            return out.trim();
        } catch (e) {
            return String(raw || '').trim();
        }
    }
    function safeJsonParse(raw, fallback = null) {
        if (!raw) return fallback;
        try {
            return JSON.parse(raw);
        } catch (_) {
            try {
                return JSON.parse(sanitizeJson(raw));
            } catch (e) {
                return fallback;
            }
        }
    }
    function hintForError(err) {
        const msg = String(err?.message || err || '').slice(0, 300);
        for (const h of _ERROR_HINTS) {
            if (h.re.test(msg)) {
                return `【${h.title}】${h.reason} 建议：${h.action}`;
            }
        }
        return '【未知错误】未命中已知错误模式。建议复制错误日志反馈给插件作者。';
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
3b. conflicts：本轮对话中出现【同一事实的两个版本对不上】时登记（如某角色在甲事件声称X、本轮又声称Y）。
先判断是更正还是真矛盾：更正（时间线自然演进，如搬家/换工作）不登记，由正常提取覆盖；
真矛盾（说不通的版本冲突，如自相矛盾的口供、立场摇摆）填 {"subject":"角色名或事实","versionA":"版本A描述","versionB":"版本B描述","note":"矛盾性质一句话"}。没有则填空数组。
4. summary（最重要，必填）：用【监控摄像头视角】+【警察做笔录风格】重写本轮剧情，30-80字。必须包含：①谁对谁做了/说了什么（写具体动作或台词大意）②明确写出的状态变化③新信息或结果。时间锚定：保留具体人名、物品名、地点名。严禁照抄原文句子（必须用你自己的话重新组织）；严禁氛围描写（"气氛变得…"）和阅读理解句式（"体现了…的心态"）；严禁剧情续写（止步于原文最后一个动作）。纯叙述句，无 markdown。
5. story_date：本轮剧情中明确写出的日期（如"3月12日""2026年5月1日"）；未明确写出则填 null。禁止编造日期。
6. pov_memories：本轮产生的角色私密认知/秘密/内心独白（摄像头拍不到、仅该角色自己知道的内容）。每条必须给出 owner（哪个角色知道）和 content（一句话说清）。已在对话中公开说出口的内容不算。没有则填空数组。
7. plans：本轮剧情中【新出现】的约定、目标、伏笔或未解之谜。kind 填 "plan"（角色主动要做的事）或 "suspense"（埋下的谜团/伏笔）。content 一句话写清。contentIsNew 必须为 true。没有新悬念则填空数组。禁止把悬念簿里已有的悬项重复登记。
8. plans.resolve：本轮【了结】了悬念簿里的悬项时填写。id 必须使用【悬念簿】中列出的编号（如 s3）。outcome 填 "done"（真做成/真揭晓）或 "cancelled"（被取消/放弃/作废）或 "failed"（尝试了但失败/以坏结局收场）。reason 一句话写明怎么收场的。没有则填空数组。
9. scenes：本轮【新出现】或【描述变化】的地点。action 填 "add"（新地点）或 "update"（更新描述）。path 是由大到小的数组（如 ["城市","街区","店铺"]，最多3层，末级=具体场所）。没有则填空数组。
9b. items：本轮剧情中【明确出现实体流转】的物品。新增获得填 {"action":"add","name":"物品名","desc":"一句话描述","holder":"当前持有者角色名"}；位置/状态变化填 {"action":"update","name":"已有物品名","holder":"新持有者或空","state":"完好/损坏/丢失/使用完毕"}；禁止臆测没有依据的物品；没有则填空数组。\n10. location：本轮剧情结束时主角所在的场景完整路径（必须用已登记场景路径之一；移动了才填，没动填 null）。
9c. time_advance_days：本轮剧情结束时相对上一楼【跳过了几天】（如正文出现\"三天后\",\"次日\",\"一周后\"且未写出具体日期时，填天数3/1/7；日期明确写了具体年月日则填0；没有时间跳跃填 null）。禁止臆测。
9d. money_changes：本轮剧情中【明确写出金额变动】的记录。新增收入填 {"character":"角色名","value":新金额数字,"reason":"干了什么加多少钱"}；明确写出花了多少/赚了多少（未写总余额）填 {"character":"角色名","delta":±数字,"reason":"买了什么减多少钱"}。角色名填主角时用"主角"。禁止臆测没有明确金额的变动；没有则填空数组。
9e. outline：仅当用户消息或剧情明显进入【新阶段转折】且你在回复中规划了新阶段时，才在回复正文（非 JSON）中输出大纲标签块：
<stage_title>阶段标题</stage_title><stage_goal>阶段整体目标</stage_goal><stage_tempo>buildup|mixed|surge|aftermath</stage_tempo>
<node><node_title>节点标题</node_title><node_goal>节点目标</node_goal><turn pacing="setup|pressure|turn|cooldown">该轮要发生的具体剧情</turn>...</node>...
pacing 语义：setup=铺垫（关系/信息/情绪），pressure=施压（行动+阻碍+悬念），turn=反转（揭示/爆点），cooldown=收束（后果/余韵）。
tempo 语义：buildup=铺垫蓄力，mixed=松紧交替，surge=高压密集，aftermath=余波消化。JSON 输出中不需要包含 outline 字段。
11. 只输出一个 JSON 对象，不得输出解释或代码块围栏。字符串内含英文双引号时转义为 \\\"，中文引号直接用。
【输出格式】
{"characters": ["角色名"], "events": [{"type": "事件类型", "description": "描述", "scope": "objective", "owner": "", "importance": 5}], "relationships": [{"from": "A", "to": "B", "type": "关系", "attitude": "positive"}], "conflicts": [{"subject": "角色或事实", "versionA": "版本A", "versionB": "版本B", "note": "矛盾性质"}], "summary": "概括", "story_date": null, "pov_memories": [{"owner": "角色A", "content": "只有A知道的秘密"}], "status_changes": [{"character": "角色名", "field": "好感", "delta": 5, "value": null, "reason": "原因"}], "todos": [{"character": "角色名", "text": "待办事项", "date": "3月15日"}], "plans": [{"kind": "plan", "content": "新立下的约定或目标", "contentIsNew": true}], "plans_resolve": [{"id": "s3", "outcome": "done", "reason": "如何了结的"}], "scenes": [{"action": "add", "path": ["城市", "街区", "店铺"], "desc": "一句话描述"}], "time_advance_days": null, "items": [{"action": "add", "name": "物品名", "desc": "描述", "holder": "持有者", "state": ""}], "money_changes": [{"character": "角色名", "delta": -100, "value": null, "reason": "买了什么"}], "location": null}`,
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
                npcTierInjection: true,        // baibai 四档角色分级压平注入
                npcTiesInjection: true,        // baibai 跨空间 NPC 长期社会人伦羁绊网注入
                protagonistTracking: true,     // baibai 主角客观档案与生活习惯癖好追踪
                dualTimeAnchorEnabled: true,    // baibai 正文起止时间锚点
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
                // [v3.37] 工业级体系化演进新配置：
                hippoDiffusionEnabled: true,     // HippoRAG 双路引燃扩散（BM25/实体联合做种子）
                temporalGraphEnabled: true,      // 时态图谱（有效区间 validFrom/To + 历史追溯）
                entropyReflectionEnabled: true,  // 叙事熵/惊奇度累加器驱动自适应反思
                entropyThreshold: 15,            // 触发自适应反思的惊奇度累积阈值
                timeTagAnchorEnabled: true,      // 正文时间标签物理锚点快速提取
                cacheFriendlyInjection: true,    // Prompt Cache 友好型冷热槽位分流
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
                // [v3.50] 评分式精排：每条 0-10 分（无关 0 分），比排序式更稳——单条失败不影响全局，且可按阈值过滤
                const prompt = `你是检索评分器。给定【查询】和编号候选列表，为每条候选打相关度分（0-10 整数：0=完全无关，1-3=弱相关，4-6=有用，7-8=高度相关，9-10=直接回答查询）。只输出JSON对象（如 {"1":8,"3":4,"7":0}），键为候选编号字符串、值为分数，无关候选可省略（视为0分）。不要解释。
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
                const rawStr = String(raw);
                // [v3.50] 优先解析评分对象 {"1":8,...}；兼容旧排序数组 ["3","1"]
                const objM = rawStr.match(/\{[\s\S]*?\}/);
                if (objM) {
                    try {
                        const scores = JSON.parse(sanitizeJson(objM[0]));
                        if (scores && typeof scores === 'object') {
                            const scored = docs.map((d, i) => ({ d, i, s: Number(scores[String(i + 1)]) || 0 }))
                                .filter(x => x.s > 0)
                                .sort((a, b) => b.s - a.s);
                            if (scored.length) {
                                // 把分数写回 item（供下游 RRF/预算裁剪参考），返回排序索引
                                for (const x of scored) if (docs[x.i]) docs[x.i]._rerankScore = x.s;
                                return scored.map(x => x.i);
                            }
                        }
                    } catch (e) { /* 落入旧格式解析 */ }
                }
                const m = rawStr.match(/\[[\s\S]*?\]/);
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
            // [v3.37] 叙事惊奇度/熵累加器（MemGPT 动态反思理念）
            this._narrativeEntropy = 0;
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
            // [v3.46] 剧情时钟与回忆隔离
            this.clock = new GameClock();
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
            // [v3.47] 钱财账本 + 剧情卡牌（hcdiary 吸收）
            this.moneyLedger = new MoneyLedger();
            this.cards = new CardCollection();
            this.conflicts = new ConflictBook();
            this.outline = new OutlineDirector();
            this.pairMem = new PairMemory();
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

            // [v3.44] 开场白写入抑制 (Opening Floor Write Suppression，抄 shujuku)
            // 无用户消息、仅第 0 楼开场白时，系统只读加载，抑制所有写操作与记忆 ops 生成，保持新会话纯净
            const _ctxChat = window.SillyTavern?.getContext?.()?.chat;
            const _isOpeningStage = (!_ctxChat || _ctxChat.length <= 1 || (_ctxChat.length === 1 && !_ctxChat[0]?.is_user)) && message.index <= 0;
            if (_isOpeningStage && !message.is_user) {
                if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 处于首楼开场白阶段，只读展示，抑制自动记忆写入`);
                return;
            }
            // [v1.4] 清洗正文：剥离 HTML注释/SDC标签/自定义标签，防止脏数据入库
            // [v3.13] 思维链/正文分流: 先剥 <thinking> 再清洗（zhino A5.2.1——思维链草稿不入正文/摘要/图谱）
            // 注意: thinking 存引擎信号队列而非 message.extra（message 是浅拷贝，extra 引用与原对象共享，直接写会污染 ST 真实消息）
            const _tc = extractThinkingChain(message.mes || message.content || '');
            // [v3.29] synopsis 快速路径需原始文本——cleanMessageText 会剥 <synopsis> 标签，故在清洗前快照原文
            const _rawForSynopsis = String(_tc.content || message.content || '');
            // [v3.33] AI 主动记忆操作符：从原文提取 <field>/<todo>/<item> 标签（清洗前，因为 cleanMessageText 会剥标签）
            const aiRecallOps = this.config.config.aiRecallOps ? extractMemoryOpsFromText(_rawForSynopsis) : null;
            // [v3.37] 物理时间标签锚点：从原文提取 <time>/<date> 标签（baibai 理念，零API同步）
            const timeTagFound = (this.config.config.timeTagAnchorEnabled !== false) ? extractTimeTagFast(_rawForSynopsis) : null;
            // [v3.48] P1: 大纲标签解析（AI 回复自带 <stage_title>/<node>/<turn> 时自动成为导演大纲）
            if (this.config.config.outlineDirectorEnabled !== false && _rawForSynopsis && _rawForSynopsis.includes('<node')) {
                try {
                    const _outlineParsed = this.outline.parseOutline(_rawForSynopsis, message.index || 0);
                    if (_outlineParsed && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🎬 解析剧情大纲: ${_outlineParsed.title}（${_outlineParsed.nodes.length} 节点）`);
                } catch (e) { errLog(e, 'onMessageReceived.大纲解析'); }
            }
            const dualTimeAnchor = (this.config.config.dualTimeAnchorEnabled !== false) ? (() => {
                try { return new RelativeTimeHelper().extractDualTimeTags(_rawForSynopsis); } catch (e) { return null; }
            })() : null;
            if ((aiRecallOps && (aiRecallOps.changes.length || aiRecallOps.todos.length || aiRecallOps.items.length)) || timeTagFound || dualTimeAnchor?.hasDual) {
                if (aiRecallOps && this.config.config.aiRecallOpsDebug) console.log(`[${PLUGIN_NAME}] 主动记忆操作: 字段${aiRecallOps.changes.length} 待办${aiRecallOps.todos.length} 物品${aiRecallOps.items.length} (楼层 ${message.index})`);
                if (timeTagFound && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 物理时间标签命中: ${timeTagFound} (楼层 ${message.index})`);
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
                // [v3.37] 物理时间标签优先赋权盖章（baibai 权威时间同步）
                if (timeTagFound) {
                    extracted = extracted || { characters: [], events: [], relationships: [], summary: "" };
                    extracted.story_date = timeTagFound;
                    this._lastStoryDateSeen = timeTagFound;
                }
                if (dualTimeAnchor?.hasDual) {
                    extracted = extracted || { characters: [], events: [], relationships: [], summary: "" };
                    extracted.time_anchor = { start: dualTimeAnchor.start, end: dualTimeAnchor.end, durationMinutes: dualTimeAnchor.durationMinutes };
                }
                if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 提取:`, extracted);
                
                // [v1.7] RubyPhone 联动①: LLM 提取结果回填手机记忆库
                if (this.config.config.rubyPhoneBridge && extracted) {
                    try {
                        const bridge = window.VirtualPhone?.lonshaBridge;
                        if (bridge?.backfill) {
                            // [v3.48] P0-4: backfill 携带剧情时钟快照（money_changes/conflicts 已在 extracted 原生 schema）
                            const _backfillPayload = { ...extracted, clock: this.clock?.export?.() || null };
                            bridge.backfill(_backfillPayload);
                            // [v3.49] P4: 心理暗流日记双端互通（幂等回填手机日记 App）
                            if (this.config.config.diaryBridgeEnabled !== false && this.diary?.diaries) {
                                try { bridge.backfillDiaries?.(this.diary.diaries); } catch (e) { errLog(e, 'rubyPhoneBridge.日记回填'); }
                            }
                            // [v3.50] P6: 剧情时钟权威同步（GameClock → 手机状态栏，仅日期变化时写）
                            if (this.config.config.clockSyncEnabled !== false && _backfillPayload.clock?.date) {
                                try { bridge.syncClock?.(_backfillPayload.clock); } catch (e) { errLog(e, 'rubyPhoneBridge.时钟同步'); }
                            }
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
                                this.graph.addEdge({from: p, to: nodeId, label: 'participated_in', floor: message.index || 0});
                            }
                        }
                    }
                }
                
                if (extracted?.relationships) {
                    for (const rel of extracted.relationships) {
                        const relFrom = this.resolveCharacterName(rel.from);
                        const relTo = this.resolveCharacterName(rel.to);
                        // [v1.5] 单向主观关系：主名归并 + attitude 三值入边数据
                        // [v3.37] 传入时态楼层 floor（时态图谱 Zep 理念）
                        this.graph.addEdge({
                            from: relFrom,
                            to: relTo,
                            label: rel.type, weight: 1.0,
                            floor: message.index || 0,
                            data: {attitude: rel.attitude || 'neutral', note: rel.note || '', relClass: classifyRelationshipType(rel.type)}
                        });
                        // [v3.43] 图谱关系已由 addEdge 记录为楼层 delta，供 swipe/删楼重放
                        // [v3.48] P2: 伦理冲突检测（family × intimate 交叉即告警，配合 v3.45 羁绊网防乱伦）
                        if (this.config.config.ethicsConflictEnabled !== false && Array.isArray(extracted?.ties_context)) {
                            const _ethics = detectEthicsConflict(relFrom, relTo, rel.type, extracted.ties_context);
                            if (_ethics && this.config.config.debugMode) {
                                console.warn(`[${PLUGIN_NAME}] ⚠️ 伦理冲突: ${_ethics.from} × ${_ethics.to}（${_ethics.relation}）与既有血缘羁绊「${_ethics.tie}」交叉`);
                            }
                        }
                    }
                }
                
                // [v3.42/v3.43] 将提取出的结构化人格、地理与不在场认知写入对应真源
                try {
                    const storyFloor = message.index || 0;
                    for (const ch of (extracted?.characters || [])) {
                        const cn = this.resolveCharacterName(ch);
                        const node = this.graph.findCharacterByName(cn);
                        const fields = extracted?.character_states?.[ch] || extracted?.character_states?.[cn] || null;
                        if (fields?.baseline) this.status.setBaseline(cn, { ...fields.baseline, floor: storyFloor });
                        if (fields?.drift) this.status.recordDrift(cn, { ...fields.drift, floor: storyFloor });
                    }
                    const geo = extracted?.geo_location || extracted?.location_context;
                    if (geo && typeof geo === 'object') this.status.setGeoLocation({ ...geo, floor: storyFloor });
                } catch (e) { errLog(e, 'onMessageReceived.caikis状态增强'); }

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

                // [v3.46] 吸收 Bakemono: 剧情时钟维护与回忆隔离
                try {
                    const curFloor = message.index || 0;
                    const clk = extracted?.story_clock;
                    if (clk && typeof clk === 'object') {
                        this.clock.setTime({
                            date: clk.date,
                            label: clk.label,
                            flashback: !!clk.is_flashback,
                            relativeDays: clk.relative_days,
                            floor: curFloor
                        });
                    } else if (extracted?.story_date) {
                        const isFlashback = /回忆|往事|当年|曾经|十年前|百年前/.test(message.mes || '');
                        this.clock.setTime({
                            date: extracted.story_date,
                            flashback: isFlashback,
                            floor: curFloor
                        });
                    }
                } catch (e) { errLog(e, 'onMessageReceived.GameClock'); }

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
                    if (extracted?.time_anchor?.end) this.checkTimeMonotonic(extracted.time_anchor.end, message.index || 0);
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

                // [v3.48] P1: 大纲轮次推进（每个 AI 楼层处理完 → 当前 turn 记入简史并推进指针）
                if (this.config.config.outlineDirectorEnabled !== false && this.outline?.stage && !message.is_user) {
                    try {
                        const _curBefore = this.outline._turnIndex;
                        this.outline.advanceTurn(message.index || 0);
                        if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🎬 大纲推进: 第${_curBefore + 1}轮完成 → 指针 ${this.outline._turnIndex}`);
                    } catch (e) { errLog(e, 'onMessageReceived.大纲推进'); }
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
                // [v3.49] P5: 群像共同记忆（关系对归因式切片）
                if (this.config.config.pairMemoryEnabled !== false && Array.isArray(extracted?.relationships)) {
                    try {
                        const sd = this.getLatestStoryDate();
                        const n = this.pairMem.addFromExtracted(extracted.relationships, extracted.characters, floor, sd);
                        if (n && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 👥 群像记忆更新 ${n} 条`);
                    } catch (e) { errLog(e, 'onMessageReceived.群像记忆'); }
                }
                // [v3.47] 钱财账本 + 剧情卡牌（hcdiary 吸收）
                if (this.config.config.moneyLedgerEnabled !== false && Array.isArray(extracted?.money_changes) && extracted.money_changes.length) {
                    try {
                        const sd = this.getLatestStoryDate();
                        for (const mc of extracted.money_changes) {
                            const nm = String(mc?.character || '').trim();
                            if (!nm) continue;
                            if (mc.value !== null && mc.value !== undefined && mc.value !== '') {
                                this.moneyLedger.setMoney(nm, Number(mc.value) || 0, mc.reason || '', floor, sd);
                            } else if (mc.delta) {
                                this.moneyLedger.addDelta(nm, Number(mc.delta) || 0, mc.reason || '', floor, sd);
                            }
                        }
                        if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 钱财账本更新 ${extracted.money_changes.length} 项`);
                    } catch (e) { errLog(e, 'onMessageReceived.钱财账本'); }
                }
                // [v3.47] 矛盾账本（memorybooks 吸收：真矛盾显式标注并存）
                if (this.config.config.conflictBookEnabled !== false && Array.isArray(extracted?.conflicts) && extracted.conflicts.length) {
                    try {
                        const sd = this.getLatestStoryDate();
                        const n = this.conflicts.addFromExtracted(extracted.conflicts, floor, sd);
                        if (n && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] ⚔️ 登记真矛盾 ${n} 条`);
                    } catch (e) { errLog(e, 'onMessageReceived.矛盾账本'); }
                }
                if (this.config.config.cardCollectionEnabled !== false && Array.isArray(extracted?.events)) {
                    try {
                        const sd = this.getLatestStoryDate();
                        const n = this.cards.forgeFromEvents(extracted.events, floor, sd, 8);
                        if (n && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🃏 铸造剧情卡牌 ${n} 张`);
                    } catch (e) { errLog(e, 'onMessageReceived.剧情卡牌'); }
                }
                if (this.config.config.floorLedgerEnabled) {
                    try {
                        const allIds = Array.from(this.graph.nodes.keys());
                        this.ledger.record(floor, {
                            nodeIds: allIds.slice(nodesBefore),
                            povIds: this.pov.povs.filter(p => p.floor === floor).map(p => p.id),
                            timelineIds: this.timeline.entries.filter(t => t.floor === floor).map(t => t.id),
                            timeAnchor: extracted?.time_anchor || null
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
                        if (dn && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 活人感日记 +${dn} 条`);
                    } catch (e) { errLog(e, 'onMessageReceived.POV状态回收'); }
                }

                // [v3.37] 叙事惊奇度/熵累加器（MemGPT 动态反思理念）
                let deltaEntropy = 0;
                let hasTurnaround = false;
                if (Array.isArray(extracted?.events)) {
                    for (const ev of extracted.events) {
                        const imp = Number(ev.importance) || 5;
                        if (imp >= 9) { deltaEntropy += 6; hasTurnaround = true; }
                        else if (imp >= 7) { deltaEntropy += 3; }
                        else if (imp >= 5) { deltaEntropy += 1; }
                    }
                }
                if (Array.isArray(extracted?.status_changes) && extracted.status_changes.length) {
                    deltaEntropy += Math.min(5, extracted.status_changes.length);
                }
                if (Array.isArray(extracted?.plans_resolve) && extracted.plans_resolve.length) {
                    deltaEntropy += extracted.plans_resolve.length * 4;
                }
                this._narrativeEntropy = (this._narrativeEntropy || 0) + deltaEntropy;
                const entropyThresh = Number(this.config.config.entropyThreshold || 15);
                const isEntropyTriggered = this.config.config.entropyReflectionEnabled !== false && (this._narrativeEntropy >= entropyThresh || hasTurnaround);

                // [v2.8] RT-B + [v3.37]: 反思生成（周期节流 OR 惊奇度冲顶自适应触发，与日记独立）
                try {
                    if (this.config.config.reflectionEnabled) {
                        const didReflect = await this.reflection.generate(this.config.config, this.llm, this, message.index || 0, isEntropyTriggered);
                        if (didReflect) {
                            this._narrativeEntropy = 0;
                            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 💡 触发反思提炼（${isEntropyTriggered ? '惊奇度自适应' : '周期节流'}）`);
                        }
                    }
                } catch (e) { errLog(e, 'onMessageReceived.反思生成'); }

                // [v2.9] RU-B: 定期记忆优化（每N楼防膨胀）
                try {
                    const oEvery = this.config.config.optimizeEveryFloors || 50;
                    if (!this._lastOptimizeFloor || (message.index || 0) - this._lastOptimizeFloor >= oEvery) {
                        this._lastOptimizeFloor = message.index || 0;
                        this.optimizeMemory();
                        // [v3.47] 睡眠周期：每 sleepEveryN 次提取触发一次归档遗忘
                        try {
                            this._sleepCount = (this._sleepCount || 0) + 1;
                            const sleepN = Number(this.config.config.sleepEveryN) || 10;
                            if (this._sleepCount % sleepN === 0) this.sleepCycle();
                        } catch (e) { errLog(e, 'sleepCycle.触发'); }
                    }
                } catch (e) { errLog(e, 'onMessageReceived.优化器'); }
                
                if (this.config.config.vectorEnabled) {
                    // [v3.13] 场外信号拼入向量素材（只影响检索，不进注入文本）
                const _sig = (this._thinkingSignals || []).filter(s => s.floor === message.index).map(s => (s.text.split('\n')[1] || '').slice(0, 120));
                const vectorText = `${extracted?.summary || this.summary.smartTruncate(messageText, 200)}\n角色:${extracted?.characters?.join(',') || ''}${_sig.length ? '\n场外:' + _sig.join(' ') : ''}`;
                    await this.vector.addVector(vectorText, {
                        floor: message.index || 0,
                        characters: extracted?.characters || [],
                        events: extracted?.events || [],
                        summary: extracted?.summary || '',
                        timeAnchor: extracted?.time_anchor || null
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
                // [v3.38] 语义级休眠检测（TriviumDB 理念，防长篇跑团上下文与内存膨胀）
                try { if (this.summary?.markDormant) this.summary.markDormant(message.index || 0, 30); } catch (e) {}
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
                        moneyLedger: this.moneyLedger.export(),
                        cards: this.cards.export(),
                        conflicts: this.conflicts.export(),
                outline: this.outline.export(),
                pairMem: this.pairMem.export(),
                        outline: this.outline.export(),
                        pairMem: this.pairMem.export(),
                        scene: this.scene.export(),
                        echo: this.echo.export(),
                        supersede: window.LonShaSupersede ? this.supersede.export() : { supersededMap: {} },
                        narrativeEntropy: this._narrativeEntropy || 0,
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
                // [v2.5/v3.40] RF: 回响池——本轮召回的进池续命，池中仍在停留期的合并注入（与下游世界推进与去重无缝合流，杜绝早退截断）
                let candidateItems = [...recalled];
                try {
                    if (this.config.config.echoEnabled) {
                        const merged = new Map();
                        for (const r of recalled) merged.set(r.id || r.text || JSON.stringify(r).slice(0, 60), r);
                        for (const e of this.echo.tick()) {
                            if (e.text && !merged.has(e.key)) merged.set(e.key, { id: e.key, text: e.text, source: e.source, echo: true });
                        }
                        this.echo.onRecalled(recalled);
                        candidateItems = Array.from(merged.values()).slice(0, this.config.config.vectorTopK * 2 + (this.config.config.echoMaxCount || 10));
                    }
                } catch (e) { errLog(e, 'onBeforeGeneration.回响池'); }
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
                            if (!candidateItems.some(r => (r.text || '') === wp.text)) candidateItems.push(wp);
                        }
                        // [v3.23] 跨调用去重: 本轮回溯结果记指纹（NE-Memory）。同一话题连续追问时下轮识别已覆盖项
                        try {
                            const ctxCc = window.SillyTavern?.getContext?.();
                            const chatIdCc = ctxCc?.chatId || ctxCc?.characterId || '';
                            // 先记指纹（基于原始 recalled，不含 DEDUP 标记前缀，防自污染）
                            recallDedupRemember(candidateItems);
                            const dedupMarked = recallDedupMark(candidateItems, chatIdCc, String(query.text || ''));
                            if (dedupMarked && dedupMarked.length) {
                                for (const dm of dedupMarked) {
                                    candidateItems.push({ text: `[DEDUP已覆盖·若本轮查询需更深细节才用] ${dm.text || ''}`, source: 'dedup' });
                                }
                            }
                        } catch (e) { errLog(e, 'recallMemory.跨调用去重'); }
                    }
            } catch (e) { errLog(e, 'onBeforeGeneration.世界推进'); }
                const inj2 = this.buildInjection(candidateItems);
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
        // [v3.36] 确定性物品键名归一（抄 baibai 确定性 id 理念）：
        // 剥离包裹的书名号《》、方括号【】[]、小括号（）()、引号等，NFKC 归一化并转小写
        static normalizeItemKey(name) {
            try {
                return String(name || '')
                    .normalize('NFKC')
                    .replace(/[《》【】\[\]（）\(\)\u0022\u0027“”‘’〈〉]/g, '')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .toLowerCase();
            } catch (e) { return String(name || '').trim().toLowerCase(); }
        }
        // [v3.2] DF3: 物品 op 清洗（LLM 原文直存 ops，desc/holder 无长度上限会撑爆注入与存档）
        // [v3.36] 扩展支持 remove 动作及确定性键名归一与三态补丁解析
        _sanitizeItemOp(op) {
            try {
                if (!op || typeof op !== 'object') return null;
                const act = String(op.action || '').trim().toLowerCase();
                // 白名单只放行 add, update, remove
                const action = (act === 'add' || act === 'update' || act === 'remove') ? act : '';
                const name = String(op.name || '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 40);
                if (!action || !name) return null;
                // 内部自包含确定性归一化，无需外部变量依赖
                const key = name.replace(/[《》【】\[\]（）\(\)\u0022\u0027“”‘’〈〉]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
                if (!key) return null;
                const clean = { action, name, key, floor: Math.max(0, Math.round(Number(op.floor) || 0)) };
                if (op.desc !== undefined && op.desc !== null) clean.desc = String(op.desc).trim().slice(0, 80);
                if (op.holder !== undefined && op.holder !== null) {
                    const h = String(op.holder).trim();
                    clean.holder = (h === '' || h === '无' || h === '地上' || h === 'null') ? '地上/遗落' : h.slice(0, 20);
                } else if (op.holder === null) {
                    clean.holder = '地上/遗落';
                }
                if (op.state !== undefined && op.state !== null) clean.state = String(op.state).trim().slice(0, 10);
                // [v3.44] 吸收 baibai: 物品物理可达性与随身/存放互斥铁律
                if (op.carried !== undefined && op.carried !== null) {
                    clean.carried = (op.carried === true || op.carried === 'true' || op.carried === 1);
                }
                if (op.location !== undefined && op.location !== null) {
                    const loc = String(op.location).trim().slice(0, 40);
                    clean.location = (loc === 'null' || loc === 'none' || loc === '无') ? '' : loc;
                }
                // 互斥自愈：随身携带则清空存放地点；有具体存放地点则 carried 强制为 false
                if (clean.carried === true) {
                    clean.location = '';
                } else if (clean.location) {
                    clean.carried = false;
                }
                return clean;
            } catch (e) { errLog(e, 'DF3.sanitizeItemOp'); return null; }
        }
        rebuildItems() {
            // [v3.3] 台账重放化：只应用「指纹匹配当前聊天」的 ops（baibai leafValid 语义——
            // 编辑/swipe 自动失活、翻回复活、删楼自愈；carried（携带自旧档）/无 fp（旧数据）不过滤）
            // [v3.36] 确定性 ID 索引 + 三态补丁语义（未提供不更新、明确置空清空、有效值覆盖）+ remove 剔除
            let chat = null;
            try { const c = window.SillyTavern?.getContext?.()?.chat; chat = Array.isArray(c) ? c : null; } catch (e) {}
            const liveFp = chat ? new Set(chat.map(m => msgFpOf(m))) : null;
            const map = new Map();
            let skipped = 0;
            // 排除仅为状态属性的损坏，只剔除明确不在身上的丢失/丢弃/消耗项
            const REMOVE_STATES = new Set(['丢失', '损毁', '已消耗', '消耗完毕', '丢弃', '已丢弃', '遗落']);

            for (const rawOp of (this.itemOps || [])) {
                const op = this._sanitizeItemOp(rawOp);   // [v3.2] DF3: 渲染前清洗（真源不动，旧档兼容）
                if (!op) continue;
                if (chat && rawOp && rawOp.fp && rawOp.carried !== true && !liveFp.has(rawOp.fp)) { skipped++; continue; }
                const itemKey = op.key || (op.name ? op.name.replace(/[《》【】\[\]（）\(\)\u0022\u0027“”‘’〈〉]/g, '').trim().toLowerCase() : '');
                const exist = map.get(itemKey);

                if (op.action === 'remove') {
                    map.delete(itemKey);
                    continue;
                }

                if (op.action === 'add') {
                    if (!exist) {
                        const isRemoved = op.state && REMOVE_STATES.has(op.state);
                        if (!isRemoved) {
                            map.set(itemKey, {
                                name: op.name,
                                key: itemKey,
                                desc: op.desc || '',
                                holder: op.holder || '无主',
                                state: op.state || '完好',
                                floor: op.floor,
                                carried: op.carried !== undefined ? op.carried : (!op.location),
                                location: op.location || ''
                            });
                        }
                    } else {
                        // 重复 add 视为更新属性
                        if (op.desc !== undefined) exist.desc = op.desc;
                        if (op.holder !== undefined) exist.holder = op.holder;
                        if (op.state !== undefined) exist.state = op.state;
                        if (op.carried !== undefined) exist.carried = op.carried;
                        if (op.location !== undefined) exist.location = op.location;
                        if (exist.carried === true) exist.location = '';
                        else if (exist.location) exist.carried = false;
                        exist.floor = op.floor;
                        if (exist.state && REMOVE_STATES.has(exist.state)) map.delete(itemKey);
                    }
                } else if (op.action === 'update' && exist) {
                    // 三态补丁语义: undefined 保持原值，提供值则覆盖
                    if (op.desc !== undefined) exist.desc = op.desc;
                    if (op.holder !== undefined) exist.holder = op.holder;
                    if (op.state !== undefined) exist.state = op.state;
                    if (op.carried !== undefined) exist.carried = op.carried;
                    if (op.location !== undefined) exist.location = op.location;
                    if (exist.carried === true) exist.location = '';
                    else if (exist.location) exist.carried = false;
                    exist.floor = op.floor;
                    if (exist.state && REMOVE_STATES.has(exist.state)) {
                        map.delete(itemKey);
                    }
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

        // [v3.47] 睡眠周期·归档式遗忘（stbme sleepCycle 吸收）：每 N 次提取触发一次"睡眠"，
        // 保留价值低于阈值的记忆归档（不物理删除，滚入冷存档 archivedMemories），需要时可唤醒。
        // 修复 stbme 已知 bug：accessCount 未初始化时 NaN 参与比较导致永不遗忘（NaN < threshold 为 false）——此处显式 Number() 兜底。
        sleepCycle() {
            const cfg = this.config.config;
            if (cfg.sleepCycleEnabled === false) return { archived: 0 };
            const now = Date.now();
            const threshold = Number(cfg.sleepForgetThreshold) || 0.5;
            let archived = 0;
            try {
                // 对摘要系统执行睡眠：活跃摘要中低保留价值条目归档
                const sums = this.summary.summaries || [];
                for (const s of sums) {
                    if (!s || s.archivedForSleep) continue;
                    if (s.importance >= 8) continue;  // 高重要度豁免
                    const created = Number(s.createdAt || s.timestamp || 0);
                    if (!created || (now - created) < 3600 * 1000) continue;  // 创建不足1小时豁免
                    const ageHours = Math.max(0.1, (now - created) / 3600000);
                    const recency = 1 / (1 + Math.log10(1 + ageHours));
                    const access = Number(s.accessCount);  // 修 NaN：undefined → NaN → || 0
                    const accessCount = Number.isFinite(access) ? access : 0;
                    const accessFreq = accessCount / Math.max(1, ageHours / 24);
                    const imp = Number(s.importance);
                    const importance = Number.isFinite(imp) ? imp : 5;
                    const retentionValue = (importance / 10) * recency * (1 + accessFreq);
                    if (retentionValue < threshold) {
                        s.archivedForSleep = true;
                        s.archivedAt = now;
                        archived++;
                    }
                }
                if (archived && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 😴 睡眠周期: 归档 ${archived} 条低价值记忆`);
            } catch (e) { errLog(e, 'sleepCycle'); }
            return { archived };
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

                // [v3.37/v3.38] 时态知识图谱（Temporal Graph, Zep 理念）：支持角色名与节点ID双向匹配
                try {
                    const isHistorical = /当年|曾经|以前|旧怨|旧事|过去|往事|回忆|最初/i.test(query.text || '');
                    const charMatchKeys = new Set();
                    (query.characters || []).forEach(c => {
                        charMatchKeys.add(c);
                        charMatchKeys.add(normalizeCharName(c));
                    });
                    (results.graph || []).forEach(n => {
                        if (n.id) charMatchKeys.add(n.id);
                        if (n.name) {
                            charMatchKeys.add(n.name);
                            charMatchKeys.add(normalizeCharName(n.name));
                        }
                    });
                    const relEdges = [];
                    for (const edge of this.graph.edges.values()) {
                        const hitFrom = charMatchKeys.has(edge.from) || charMatchKeys.has(normalizeCharName(edge.from));
                        const hitTo = charMatchKeys.has(edge.to) || charMatchKeys.has(normalizeCharName(edge.to));
                        if (hitFrom || hitTo) {
                            if (edge.active !== false) {
                                relEdges.push(edge);
                            } else if (isHistorical && (edge.validTo != null || edge.active === false)) {
                                relEdges.push({ ...edge, historical: true });
                            }
                        }
                    }
                    if (relEdges.length) {
                        results.relations = relEdges.slice(0, 6);
                    }
                } catch (e) { errLog(e, 'recallMemory.时态关系'); }

                // [v3.28] 记忆树路由召回（st-memory-wizzard 本地轻量版，无需第二模型）
                try {
                    if (this.config.config.memoryTreeEnabled && this.graph?.nodes?.size) {
                        const treePaths = [];
                        for (const ch of query.characters.slice(0, 4)) {
                            const node = this.graph.findCharacterByName(ch);
                            if (!node) continue;
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

                // [v3.16] 神经链召回（抄 zhino）
                try {
                    if (this.config.config.neuralChainEnabled && query.characters.length > 0) {
                        const userQuery = `${query.text || ''}`;
                        const chain1 = query.characters.slice(0, 3).map(c => {
                            const mems = (this.charMem?.search ? this.charMem.search(c, userQuery) : []);
                            return mems.map(m => ({ id: 'c1_' + c + '_' + m.id, text: `${c}：${m.text}`, source: 'neuralChain', chain: 1, character: c }));
                        }).flat().slice(0, 6);
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
            }

            // [v1.9] P1: BM25 稀疏检索召回（提前执行，为 HippoRAG 准备文本实体输入）
            if (this.config.config.bm25Enabled && this.bm25.N && query.text) {
                try {
                    results.bm25 = this.bm25.search(query.text, this.config.config.bm25TopK || 5, {cliffCut: true, minResults: 2})
                        .map(d => ({id: d.id, text: d.text, floor: d.floor, score: d.score, source: 'bm25'}));
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

            // [v2.8] RT-C: 物品台账召回（提前执行，为 HippoRAG 提取道具实体输入）
            // [v3.44] 吸收 baibai: 物品物理可达性与随身/寄存解耦（Carried vs Location 互斥）
            if (this.config.config.itemLedgerEnabled && this.itemOps?.length) {
                const cast = this.captureCast();
                const qText = query.text || '';
                let currentGeo = '';
                try {
                    const charState = window.LonShaMemory?.engine?.characterState;
                    if (charState?.getGeoLocation) {
                        const geo = charState.getGeoLocation();
                        currentGeo = `${geo.majorArea || ''} ${geo.minorArea || ''} ${geo.detailLocation || ''}`.trim().toLowerCase();
                    }
                } catch (e) {}

                const relevant = this.items.records.filter(r => {
                    const isRemoved = r.state && (r.state === '丢失' || r.state === '损毁' || r.state === '已消耗' || r.state === '丢弃');
                    if (isRemoved) return qText && qText.includes(r.name);
                    return cast.some(c => (r.holder || '').includes(c)) || (qText && qText.includes(r.name));
                }).slice(-8);

                if (relevant.length) {
                    const accessible = [];
                    const stored = [];
                    for (const r of relevant) {
                        const isCarried = (r.carried === true || (!r.location && r.carried !== false));
                        if (isCarried) {
                            accessible.push({
                                name: r.name,
                                text: `${r.name}（随身·${r.holder || '无主'}持有，${r.state || '完好'}）${r.desc ? '：' + r.desc : ''}`,
                                source: 'items'
                            });
                        } else {
                            const loc = (r.location || '').trim();
                            const locLower = loc.toLowerCase();
                            const isNearby = locLower && currentGeo && (currentGeo.includes(locLower) || locLower.includes(currentGeo));
                            if (isNearby) {
                                accessible.push({
                                    name: r.name,
                                    text: `${r.name}（在场·存放于${loc}，${r.state || '完好'}）${r.desc ? '：' + r.desc : ''}`,
                                    source: 'items'
                                });
                            } else {
                                stored.push({
                                    name: r.name,
                                    text: `${r.name}（存放于${loc || '他处'}，${r.holder || '无主'}持有）`,
                                    source: 'items_stored'
                                });
                            }
                        }
                    }
                    results.items = accessible;
                    if (stored.length) results.itemsStored = stored;
                }
            }

            // Phase 3: 图扩散增强召回（HippoRAG 实体引燃在此顺利读取 BM25 与 items）
            if (this.config.config.graphDiffusionEnabled && window.LonShaMemory?.diffusion) {
                try {
                    let seedNodes = [...(results.graph || [])];
                    if (this.config.config.hippoDiffusionEnabled !== false) {
                        // [v3.37/v3.38] HippoRAG 双路引燃扩散：BM25 文本 + 活跃物品联合识别种子节点
                        const entityCandidates = new Set();
                        (results.bm25 || []).slice(0, 5).forEach(b => {
                            if (b.text) {
                                const matched = this.graph.findNodesMentionedIn(b.text);
                                for (const node of matched) entityCandidates.add(node);
                            }
                        });
                        (results.items || []).slice(0, 3).forEach(it => {
                            const raw = it.name || it.text || '';
                            if (raw) {
                                const matched = this.graph.findNodesMentionedIn(raw);
                                for (const node of matched) entityCandidates.add(node);
                            }
                        });
                        for (const cand of entityCandidates) {
                            if (!seedNodes.some(s => s.id === cand.id)) seedNodes.push(cand);
                        }
                    }
                    seedNodes = seedNodes.slice(0, 5);
                    if (seedNodes.length > 0) {
                        for (const [k, v] of this._diffusionFatigue) {
                            if (v <= 1) this._diffusionFatigue.delete(k);
                            else this._diffusionFatigue.set(k, v - 1);
                        }
                        const diffusionResults = window.LonShaMemory.diffusion.personalizedPageRank(
                            seedNodes, 
                            3, 
                            this.config.config.vectorTopK
                        );
                        const fatigue = this._diffusionFatigue;
                        const suppressed = [];
                        for (const r of diffusionResults) {
                            const nid = this._nodeIdentity(r);
                            if (nid && fatigue.has(nid)) {
                                suppressed.push({ ...r, score: (r.score || 0) * 0.15 });
                                fatigue.delete(nid);
                            } else {
                                suppressed.push(r);
                            }
                        }
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
            
            // [v2.4] RE: 多查询召回——主查询 + rewriteQuery 改写的查询分别检索
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
                        } catch (e) { errLog(e, 'recallMemory.向量重试'); }
                    }
                }
            }

            // [v1.9] P1: 卷摘要召回（已折叠的高层概括）
            if (this.config.config.summaryFoldEnabled && this.summary.volumes.length) {
                results.volume = this.summary.searchVolumes(2)
                    .map(v => ({id: v.id, text: `【卷${v.floorStart}-${v.floorEnd}】${v.text}`, floor: v.floorStart, source: 'volume'}));
            }
            
            // [v2.1] P3: 节日感知召回
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
                } catch (e) { errLog(e, 'recallMemory.节日感知'); }
            }
            
            // [v2.0] P2: 角色状态召回
            if (this.config.config.characterStateEnabled && Object.keys(this.status.characters || {}).length) {
                const presentCast = this.captureCast();
                const owners = presentCast.length ? presentCast : (window.SillyTavern?.getContext?.()?.name2 ? [window.SillyTavern.getContext().name2] : []);
                if (owners.length) {
                    results.status = this.status.searchByNames(owners, 5).map(r => ({
                        name: r.name, fields: r.fields, todos: r.todos, source: 'status'
                    }));
                }
            }
            
            // [v1.8] P0: 剧情时间线召回
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
                            let rel = '';
                            if (relOn) {
                                try { rel = relativePrefix(e.date, anchorDate); } catch (err) { rel = ''; }
                            }
                            return {id: e.id, text: `[${rel ? rel + '·' : ''}${e.date}] ${e.text}`, date: e.date, floor: e.floor, source: 'timeline', importance: e.importance || 5};
                        });
                }
            }

            // [v2.8] RT-B: 反思召回（重要度 Top-2）
            if (this.config.config.reflectionEnabled && this.reflection?.items?.length) {
                results.reflections = this.reflection.search(2).map(r => ({ text: `洞察：${r.insight}${r.suggestion ? '（提示：' + r.suggestion + '）' : ''}`, source: 'reflection' }));
            }

            // [v1.7] RubyPhone 联动②: 手机记忆库作为一路召回源
            // [v3.48] P0 桥修复: queryPhoneMemory 是 v1.7 时代写错的方法名（bridge 只有 recall），守卫开关 rubyPhoneSync 也不存在（配置叫 rubyPhoneRecall）——三处断线导致手机召回通道从未生效
            if (this.config.config.rubyPhoneRecall && window.VirtualPhone?.lonshaBridge) {
                try {
                    const _phoneQuery = window.VirtualPhone.lonshaBridge.queryPhoneMemory || window.VirtualPhone.lonshaBridge.recall.bind(window.VirtualPhone.lonshaBridge);
                    const phoneHits = await _phoneQuery(query.text, this.config.config.rubyPhoneRecallTopN || 3);
                    if (phoneHits?.length) {
                        results.rubyphone = phoneHits.map((h, i) => ({
                            // [v3.48] P0 字段对齐: bridge.recall 返回 {content, score, layer, floor}，旧映射期望 h.id/h.type  恒 undefined
                            id: 'phone_' + (h.id ?? (h.floor ?? 'i') + '_' + i),
                            text: `[手机记忆·${h.layer || h.type || '生活'}] ${h.content}`,
                            source: 'rubyphone',
                            importance: h.importance || 5,
                            score: h.score || 0.5
                        }));
                    }
                } catch (e) { errLog(e, 'recallMemory.手机记忆召回'); }
            }
            
            // [v2.4] RE: 在场分档——不在场已登场角色给极简档
            if (this.config.config.presenceTier) {
                const present = new Set(this.captureCast());
                const allKnown = this.getKnownCharacters();
                const absent = allKnown.filter(c => !present.has(c));
                if (absent.length) {
                    results.presence = absent.map(a => ({
                        character: a, text: `${a}（当前不在场）`, source: 'presence'
                    }));
                }
            }
            
            // [v2.2] RC: 悬念簿召回
            if (this.config.config.suspenseEnabled && this.suspense.items.length) {
                const openList = this.suspense.openItems().slice(-3)
                    .map(x => ({ id: 'sus_' + x.id, text: `【待解决·悬念】${x.content}${x.createdTime ? ' (' + x.createdTime + ')' : ''}`, source: 'suspense', status: 'open' }));
                const resolvedList = this.suspense.recentlyResolved(2)
                    .map(x => ({ id: 'sus_res_' + x.id, text: `【近期了结】${x.content} → ${x.resolution || '已解决'}`, source: 'suspense', status: x.status }));
                results.suspense = openList.concat(resolvedList);
            }
            
            // [v1.8] P0: POV 私密记忆召回
            if (this.config.config.povIsolation && this.pov.povs.length) {
                const present = this.captureCast();
                const owners = present.length ? present : (window.SillyTavern?.getContext?.()?.name2 ? [window.SillyTavern.getContext().name2] : []);
                if (owners.length) {
                    results.pov = this.pov.search(owners, this.config.config.povMaxPerTurn || 3)
                        .map(p => ({id: p.id, owner: p.owner, text: p.content, floor: p.floor, source: 'pov'}));
                }
            }
            
            // [v3.30] PV: superseded 摘要排除
            if (window.LonShaSupersede && this.config.config.supersedeEnabled && results.summary?.length) {
                try {
                    results.summary = results.summary.filter(item => {
                        const key = item.id || (item.source === 'summary' ? 'sum_' + item.floor : null);
                        return !(key && this.supersede.isSuperseded(key));
                    })
                    .filter(i => !(i?.source === 'summary' && i?.archivedForSleep));  // [v3.47] 睡眠归档：低价值记忆不进入召回（存档中可查）
                } catch (e) { errLog(e, 'recallMemory.supersede过滤'); }
            }

            // [v3.38] 语义级休眠伏笔唤醒检测（TriviumDB 双区记忆理念）
            try {
                if (this.summary?.awakenByEntities) {
                    const presentEntities = [...(query.characters || []), ...((results.items || []).map(i => i.name || ''))].filter(Boolean);
                    const awakened = this.summary.awakenByEntities(presentEntities);
                    if (awakened?.length) {
                        for (const aw of awakened) {
                            results.summary.push({ id: 'sum_' + aw.floor, text: `【久别重现】${aw.text}`, floor: aw.floor, source: 'summary', awakened: true });
                        }
                    }
                }
            } catch (e) { errLog(e, 'recallMemory.休眠唤醒'); }
            
            // [v2.3] RD: 两阶段精排
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
            // [v3.48] P3: 本地意图分流重排（零 API 中间层，历史/物品/关系三路意图统一收敛）
            return this.intentRerank(merged, queryText);
        }

        // [v3.48] P3: 本地意图分流重排管线（triviumdb on_rerank 理念，零 API）
        // 统一化三路意图分流：历史回顾类 query 提权时态历史边；物品类 query 提权物品台账；关系类 query 提权关系网。
        // 之前三路意图分流散落在 recallMemory 各分支（isHistorical 等），本管线将其收敛为召回后统一中间层。
        intentRerank(merged, queryText) {
            try {
                const q = String(queryText || '');
                if (!q || !Array.isArray(merged) || merged.length < 2) return merged;
                const isHistory = /当年|曾经|以前|旧怨|旧事|过去|往事|回忆|最初|那时候/i.test(q);
                const isItem = /物品|道具|东西|短剑|信物|钥匙|账本|礼物|随身|物品栏|装备/i.test(q) || this.itemOps?.some(o => o?.name && q.includes(o.name));
                const isRelation = /关系|羁绊|仇|恩|暗恋|结义|师徒|婚|血缘/i.test(q);
                if (!isHistory && !isItem && !isRelation) return merged;
                const boost = (item) => {
                    const text = String(item?.text || '');
                    let b = 0;
                    if (isHistory && (item?.historical || /当年|曾经|以前|旧|最初/.test(text))) b += 2.0;
                    if (isItem && (/物品|道具|随身|寄存/.test(text) || (text.includes('[') && this.itemOps?.some(o => o?.name && text.includes(o.name))))) b += 2.0;
                    if (isRelation && /关系|羁绊|→|恩怨|结义|血缘/.test(text)) b += 1.5;
                    return b;
                };
                return merged.map(item => ({ ...item, _intentBoost: boost(item) }))
                    .sort((a, b) => (b._intentBoost || 0) - (a._intentBoost || 0));
            } catch (e) { errLog(e, 'intentRerank'); return merged; }
        }

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
                results.presence || [],
                results.items || [],
                results.itemsStored || []
            ];
            const byKey = new Map();
            lists.forEach((list, listIdx) => {
                list.forEach((item, rank) => {
                    const key = item.id || item.text || item.name || JSON.stringify(item).substring(0, 80);
                    const rrfScore = 1 / (K + rank + 1);
                    // [v3.50] 精排分加成：LLM 评分式 rerank 的高分项（>=6）给 RRF 加权（评分/10 × 0.05）
                    const rerankBonus = item._rerankScore >= 6 ? (item._rerankScore / 10) * 0.05 : 0;
                    const prev = byKey.get(key);
                    byKey.set(key, {
                        ...item,
                        rrfScore: (prev?.rrfScore || 0) + rrfScore + rerankBonus,
                        hits: (prev?.hits || 0) + 1,   // 被几路召回命中
                        source: prev?.source ? prev.source + '+' : ['vector','diffusion','graph','summary','diary','rubyphone','timeline','pov','bm25','volume','status','holiday','suspense','presence','items','items_stored'][listIdx]
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
        
        // [v3.43] 从当前图谱/状态生成四档 NPC 轻量记录，供 buildInjection 使用
        // [v3.45] 吸收 baibai: 跨空间 NPC 长期人伦社会羁绊网
        getNpcTiesRecords() {
            try {
                const map = new Map();
                // 1. 从 status.npcTies 获取
                const statusTies = this.status?.getNpcTiesRecords?.() || [];
                for (const r of statusTies) {
                    if (r.name && r.ties?.length) {
                        map.set(r.name.toLowerCase(), { name: r.name, ties: [...r.ties] });
                    }
                }
                // 2. 从 graph 中获取长期人伦羁绊边
                if (this.graph?.edges) {
                    const PERMANENT_REL_RE = /母|父|妻|夫|女|子|兄|弟|姐|妹|宿敌|死敌|主仆|结义|结拜|恩师|师傅|徒弟|亲属|血亲/;
                    for (const e of this.graph.edges.values()) {
                        const label = String(e.label || e.relation || '');
                        if (PERMANENT_REL_RE.test(label) || e.permanent === true) {
                            const fromNode = this.graph.nodes.get(e.from);
                            const toNode = this.graph.nodes.get(e.to);
                            const fromName = fromNode?.name || e.from;
                            const toName = toNode?.name || e.to;
                            if (fromName && toName && label) {
                                const key = fromName.toLowerCase();
                                const tieStr = `${toName}之${label}`;
                                if (!map.has(key)) map.set(key, { name: fromName, ties: [] });
                                const rec = map.get(key);
                                if (!rec.ties.includes(tieStr)) rec.ties.push(tieStr);
                            }
                        }
                    }
                }
                return Array.from(map.values());
            } catch (e) {
                errLog(e, 'getNpcTiesRecords');
                return [];
            }
        }
        getNpcTiesPrompt() {
            try {
                const recs = this.getNpcTiesRecords();
                return fmtNpcTiesContext(recs);
            } catch (e) { return ''; }
        }

        // [v3.45] 吸收 baibai: 跨会话数据平移与状态种子 (Carryover Seed)
        generateCarryoverSeed(options = {}) {
            try {
                const ctx = window.SillyTavern?.getContext?.();
                const curFloor = (ctx?.chat || []).length - 1;
                const activeVols = this.summary?.getActiveVolumes?.() || [];
                const recentSums = (this.summary?.summaries || []).slice(-5).map(s => s.text || s.summary || '').filter(Boolean);
                const recapParts = [];
                if (activeVols.length) {
                    recapParts.push(...activeVols.map(v => `（第${v.floorStart}-${v.floorEnd}楼）${v.text}`));
                }
                if (recentSums.length) {
                    recapParts.push(...recentSums);
                }
                return {
                    type: 'lonsha_carryover_seed',
                    version: VERSION,
                    createdAt: Date.now(),
                    clock: this.clock?.getSnapshot?.() || null,
                    sourceFloor: curFloor,
                    summaryRecap: recapParts.join('\n'),
                    protagonist: this.status?.getProtagonist?.() || {},
                    lifeDetails: (this.status?.lifeDetails || []).filter(d => d.tier !== 'archive'),
                    carriedItems: (this.items?.records || []).filter(i => i.carried || !i.location),
                    openSuspenses: this.suspense?.openItems?.() || [],
                    npcTies: this.status?.getAllNpcTies?.() || {},
                    baselines: this.status?.baselines || {},
                    geoContext: this.status?.getGeoLocation?.() || {}
                };
            } catch (e) {
                errLog(e, 'generateCarryoverSeed');
                return null;
            }
        }
        importCarryoverSeed(seed, options = {}) {
            if (!seed || typeof seed !== 'object' || seed.type !== 'lonsha_carryover_seed') {
                console.warn(`[${PLUGIN_NAME}] 无效的 Carryover 种子数据`);
                return false;
            }
            try {
                if (seed.summaryRecap && this.summary) {
                    this.summary.createSummary({ mes: '', index: 0 }, `【跨会话前情承接】\n${seed.summaryRecap}`, { seed: true });
                }
                if (seed.clock && this.clock?.import) this.clock.import(seed.clock);
                if (seed.protagonist && this.status?.setProtagonist) {
                    this.status.setProtagonist(seed.protagonist, 0);
                }
                if (Array.isArray(seed.lifeDetails) && this.status?.addLifeDetail) {
                    for (const d of seed.lifeDetails) this.status.addLifeDetail(d, 0);
                }
                if (Array.isArray(seed.carriedItems)) {
                    for (const it of seed.carriedItems) {
                        this.itemOps.push({
                            floor: 0,
                            action: 'add',
                            name: it.name,
                            desc: it.desc || '',
                            holder: it.holder || '主角',
                            carried: true,
                            location: '',
                            state: it.state || '完好',
                            updatedAt: Date.now()
                        });
                    }
                    (this.reconcileItemOps || this.rebuildItems)?.call(this);
                }
                if (Array.isArray(seed.openSuspenses) && this.suspense?.add) {
                    for (const s of seed.openSuspenses) {
                        this.suspense.add(s.kind || 'plan', s.content, 0, s.createdTime);
                    }
                }
                if (seed.npcTies && this.status?.setNpcTies) {
                    for (const [name, ties] of Object.entries(seed.npcTies)) {
                        this.status.setNpcTies(name, ties);
                    }
                }
                if (seed.baselines && this.status?.setBaseline) {
                    for (const [name, base] of Object.entries(seed.baselines)) {
                        this.status.setBaseline(name, base);
                    }
                }
                if (seed.geoContext && this.status?.setGeoLocation) {
                    this.status.setGeoLocation(seed.geoContext);
                }
                console.log(`[${PLUGIN_NAME}] ✓ 跨会话 Carryover 种子导入成功 (来源版本: ${seed.version || 'unknown'})`);
                return true;
            } catch (e) {
                errLog(e, 'importCarryoverSeed');
                return false;
            }
        }

        buildNpcTierRecords() {
            try {
                const present = new Set(this.captureCast());
                const ctx = window.SillyTavern?.getContext?.();
                const currentLocation = this.status?.geoContext?.minorArea || '';
                const known = this.getKnownCharacters();
                return known.slice(0, 20).map(name => {
                    const node = this.graph.findCharacterByName(name);
                    const rec = this.status?.characters?.[name] || {};
                    const baseline = this.status?.baselines?.[name];
                    const persona = this.status?.getEffectivePersona?.(name, (ctx?.chat || []).length - 1);
                    const isPresent = present.has(name);
                    const isImportant = this.status?.isNpcTracked?.(name) || !!baseline || !!rec.fields?.['重要'];
                    const roleTier = isImportant ? 'important' : isPresent ? 'present' : 'absent';
                    return {
                        name,
                        gender: node?.data?.gender || node?.gender || rec.fields?.['性别'] || '',
                        roleTier,
                        isPresent,
                        isImportant,
                        title: node?.data?.title || node?.data?.identity || '',
                        identity: node?.data?.identity || '',
                        relation: node?.data?.relation || '',
                        now: rec.fields?.['当前动作'] || rec.fields?.['姿态'] || '',
                        fields: Object.entries(rec.fields || {}).slice(0, 6),
                        todos: rec.todos || [],
                        traits: baseline?.traits || [],
                        persona: persona?.description || '',
                        location: currentLocation
                    };
                });
            } catch (e) {
                errLog(e, 'buildNpcTierRecords');
                return [];
            }
        }
        // [v1.5] 注入格式（抄 baibai 私密简报包裹 + HCDiary 分区结构）
        buildInjection(recalled) {
            if (!recalled?.length) return '';
            const NOTE = '〔记忆系统私密简报｜仅你可见〕以下内容帮助保持剧情连贯;严禁在回复正文中复述、罗列或提及本节内容。';
            const END = '〔私密简报结束〕请像一个已读过前情的叙述者那样自然续写,不要复述简报本身。';
            
            // 分区：剧情摘要 / 角色关系 / 角色日记 / 手机记忆（抄 HCDiary 的分类注入）
            const summaries = [], relations = [], diaries = [], phoneMem = [], timelines = [], povs = [], volumes = [], bm25Hits = [], statuses = [], holidays = [], suspenses = [], itemRecs = [], itemStoredRecs = [], reflectRecs = [], neuralChains = [], worldProgs = [], dedupNotes = [], treeNotes = [];
            for (const item of recalled.slice(0, this.config.config.vectorTopK * 2)) {
                if (item.source === 'worldprogress') worldProgs.push(item);
                else if (item.source === 'neuralChain') neuralChains.push(item);
                else if (item.source === 'items') itemRecs.push(item);
                else if (item.source === 'items_stored' || item.source?.includes('items_stored')) itemStoredRecs.push(item);
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
            // ===== A. 静态锚定前缀区 (Static Cache Anchor Zone - Prompt Cache Guard) =====
            // [v3.46] 宏观世界线·纪元史记 (Grand Chronicle)
            if (this.summary?.getGrandChroniclePrompt) {
                const grandText = this.summary.getGrandChroniclePrompt();
                if (grandText) blocks.push(grandText);
            }
            // [v3.45] 吸收 baibai: 主角客观档案与生活习惯癖好追踪
            if (this.config.config.protagonistTracking !== false) {
                const proPrompt = this.status?.getProtagonistPrompt?.();
                const lifePrompt = this.status?.getLifeDetailsPrompt?.(5) || [];
                if (proPrompt || lifePrompt.length) {
                    blocks.push('[主角当前客观状态与生活习惯]');
                    if (proPrompt) blocks.push(`- ${proPrompt}`);
                    if (lifePrompt.length) blocks.push(...lifePrompt);
                }
            }
            // [v3.45] 吸收 baibai: 跨空间角色长期人伦社会羁绊网（稳定字典序排序）
            if (this.config.config.npcTiesInjection !== false) {
                const tiesText = this.getNpcTiesPrompt?.();
                if (tiesText) {
                    blocks.push(tiesText);
                }
            }
            if (this.config.config.npcTierInjection !== false) {
                const npcTierLines = buildNpcTierInjection(this.buildNpcTierRecords());
                if (npcTierLines.length) {
                    blocks.push('[角色索引·分级注入]');
                    blocks.push(...npcTierLines);
                }
            }

            // ===== B. 动态易变尾部区 (Volatile Dynamic Zone) =====
            // [v3.46] 吸收 Bakemono: 当前剧情时钟与回忆隔离
            const clockPrompt = this.clock?.getContextPrompt?.();
            if (clockPrompt) {
                blocks.push(clockPrompt);
            }
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
                const CLS_CN = { family: '血缘', intimate: '亲密', hostile: '敌对', social: '社交', other: '其他' };
                relations.forEach(i => {
                    const att = i.data?.attitude === 'positive' ? '友好' : i.data?.attitude === 'negative' ? '排斥' : '中立';
                    const fromName = this.graph.nodes.get(i.from)?.name || i.from || i.name;
                    const toName = this.graph.nodes.get(i.to)?.name || i.to || '';
                    const histNote = (i.active === false && i.validTo != null) ? `（曾于第${i.validTo}楼前）` : '';
                    const cls = i.data?.relClass || classifyRelationshipType(i.label);
                    blocks.push(`- ${fromName} → ${toName}：${i.label || '相关'}[${att}·${CLS_CN[cls] || '其他'}]${histNote}`);
                });
            }
            // [v3.45] 吸收 baibai: 近期已了结/已作废事项防复读注入
            const recentDone = this.suspense?.getRecentlyResolvedPrompt?.(3) || [];
            if (recentDone.length) {
                blocks.push('[近期已了结事项·切勿重复执行或提及]');
                blocks.push(...recentDone);
            }
            // [v3.37] Prompt Cache 友好优化：活跃阶段周记随底层动态槽注入
            if (this.config.config.cacheFriendlyInjection !== false && this.summary.getActiveVolumes) {
                const activeVols = this.summary.getActiveVolumes().slice(-2);
                if (activeVols.length) {
                    blocks.push('[阶段进展·周记]');
                    activeVols.forEach(v => blocks.push(`- （第${v.floorStart}-${v.floorEnd}楼）${v.text}`));
                }
            }
            if (treeNotes.length) {
                // [v3.28] 记忆树路由召回（st-memory-wizzard）
                blocks.push('[记忆树·角色关联]');
                treeNotes.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (diaries.length) {
                blocks.push('[角色日记·近期]（第一人称心声，仅作内心参考，不得在对话中直接引用原文）');
                diaries.forEach(i => blocks.push(`- ${i.name || i.character || ''}（${i.floor != null ? '第' + i.floor + '楼' : ''}${i.mood ? '·' + i.mood : ''}）：${i.text || i.entry || ''}${i.secret ? ' ｜未说出口: ' + i.secret : ''}${i.attitude ? ' ｜对用户态度: ' + i.attitude : ''}${Array.isArray(i.keyEvents) && i.keyEvents.length ? ' ｜亲历要事: ' + i.keyEvents.join('；') : ''}${Array.isArray(i.subjRelations) && i.subjRelations.length ? ' ｜主观关系印象: ' + i.subjRelations.join('；') : ''}`));
            }
            // [v3.47] 钱财账本 + 剧情卡牌注入（hcdiary 吸收）
            if (this.moneyLedger) {
                const moneyPrompt = this.moneyLedger.toPrompt();
                if (moneyPrompt) blocks.push(moneyPrompt);
            }
            if (this.cards) {
                const cardsPrompt = this.cards.toPrompt();
                if (cardsPrompt) blocks.push(cardsPrompt);
            }
            if (this.conflicts) {
                const conflictPrompt = this.conflicts.toPrompt();
                if (conflictPrompt) blocks.push(conflictPrompt);
            }
            // [v3.48] P1: 大纲导演注入（导演视角：本轮目标+节奏）
            if (this.outline) {
                const outlinePrompt = this.outline.toPrompt();
                if (outlinePrompt) blocks.push(outlinePrompt);
            }
            // [v3.49] P5: 群像共同记忆注入（只注入在场角色相关的关系对）
            if (this.pairMem) {
                const pairPrompt = this.pairMem.toPrompt(extracted?.characters || this.captureCast());
                if (pairPrompt) blocks.push(pairPrompt);
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
                const presentSet = new Set(present.map(p => this.resolveCharacterName(p)));
                // [v3.46] 视界隔离与全知禁令：当前有在场角色时，滤除不在场角色的私密心声防隔空读心透视
                const validPovs = (present.length > 0)
                    ? povs.filter(p => !p.owner || presentSet.has(this.resolveCharacterName(p.owner)))
                    : povs;
                if (validPovs.length) {
                    const who = present.length ? present.join('、') : '当前角色';
                    blocks.push(`〔全知禁令与私密视界｜仅${who}知晓，其他角色绝不知情，严禁未卜先知或在对话动作中直接戳破〕`);
                    validPovs.forEach(i => blocks.push(`- ${i.owner}：${i.text || ''}`));
                }
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
                blocks.push(itemStoredRecs.length ? '[物品台账·在场/随身]' : '[物品台账]');
                itemRecs.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (itemStoredRecs.length) {
                blocks.push('[物品台账·他处寄存]（注意：以下物品存放于其他地点或未随身携带，角色当前不可随手隔空取出）');
                itemStoredRecs.forEach(i => blocks.push(`- ${i.text || ''}`));
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
            const RESIDENT_MARKERS = ['[前情摘要]', '[角色状态]', '[角色关系]', '[关键事件·影响当前]', '[剧情时间线]', '[卷]', '[早前剧情概括]', '[角色长期关系网]', '[主角当前客观状态与生活习惯]', '[近期已了结事项', '[宏观世界线·纪元史记]', '[当前剧情时间]'];
            const residentBlocks = blocks.filter(b => RESIDENT_MARKERS.some(m => b.startsWith(m)));
            const triggerBlocks = blocks.filter(b => !RESIDENT_MARKERS.some(m => b.startsWith(m)));
            // [v2.1] P3: 注入预算裁剪（抄 stbme context-window：超预算优先保近期/相关）
            let budget = this.config.config.injectionBudget || 3000;
            // [v3.25] token 预算双层：memoryTokenBudget（记忆注入 token 上限）扣减 keepRecentTokenReserve（最近正文预留）
            const reserve = Number(this.config.config.keepRecentTokenReserve) || 0;
            const tokenBudget = Number(this.config.config.memoryTokenBudget) || 0;
            if (tokenBudget > 0) budget = Math.max(200, Math.min(budget, Math.floor(tokenBudget * 4)));  // token→字符粗换算(~0.25 token/字符)
            if (reserve > 0) budget = Math.max(200, budget - Math.floor(reserve * 4));
            // [v3.50] 第三层：上下文感知自适应——聊天楼层少（上下文占用低）时自动扩容预算（早期多喂记忆加速建立世界感），
            // 楼层多时按基准收紧（保护最近正文空间）。扩张系数随楼层衰减，clamp 0.6x~1.8x 基准。
            if (this.config.config.adaptiveBudget !== false) {
                try {
                    const _chatLen = window.SillyTavern?.getContext?.()?.chat?.length || 0;
                    if (_chatLen > 0) {
                        const decayRef = Number(this.config.config.adaptiveBudgetDecayFloors) || 80;
                        const factor = Math.max(0.6, Math.min(1.8, 1.8 - (_chatLen / decayRef) * 1.2));
                        budget = Math.max(200, Math.floor(budget * factor));
                    }
                } catch (e) { /* 上下文不可用时用基准预算 */ }
            }
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
                try {
                    if (this.graph?.rollbackGraphFrom) this.graph.rollbackGraphFrom(floor);
                    else this.graph.truncateGraphFrom(floor);
                } catch (e) { errLog(e, 'rollbackFloor.图谱回溯'); }
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
                try { const nm2 = this.moneyLedger?.removeByFloor ? this.moneyLedger.removeByFloor(floor) : 0; if (nm2 && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 钱财流水回滚: ${nm2}条`); } catch (e) { errLog(e, 'rollbackFloor.钱财回滚'); }
                try { const nc = this.cards?.removeByFloor ? this.cards.removeByFloor(floor) : 0; if (nc && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 卡牌回滚: ${nc}张`); } catch (e) { errLog(e, 'rollbackFloor.卡牌回滚'); }
                try { const ncf = this.conflicts?.removeByFloor ? this.conflicts.removeByFloor(floor) : 0; if (ncf && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 矛盾回滚: ${ncf}条`); } catch (e) { errLog(e, 'rollbackFloor.矛盾回滚'); }
                try { const npm = this.pairMem?.removeByFloor ? this.pairMem.removeByFloor(floor) : 0; if (npm && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 群像回滚: ${npm}条`); } catch (e) { errLog(e, 'rollbackFloor.群像回滚'); }
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
                // [v3.47] 钱财账本流水 + 剧情卡牌 + 矛盾账本
                for (const l of (this.moneyLedger?.moneyLog || [])) l.floor = dec(l.floor);
                for (const c of (this.cards?.cards || [])) c.floor = dec(c.floor);
                for (const c of (this.conflicts?.conflicts || [])) c.floor = dec(c.floor);
                for (const p of (this.pairMem?.pairs || [])) for (const e of p.entries) e.floor = dec(e.floor);
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
                // [v3.38] 图谱时态边（validFrom/validTo/floor）与快照前移
                if (this.graph?.edges) {
                    for (const edge of this.graph.edges.values()) {
                        if (typeof edge.validFrom === 'number' && edge.validFrom > deleted) edge.validFrom--;
                        if (typeof edge.validTo === 'number' && edge.validTo > deleted) edge.validTo--;
                        if (typeof edge.floor === 'number' && edge.floor > deleted) edge.floor--;
                    }
                }
                if (Array.isArray(this.graph?._snapshots)) {
                    for (const snap of this.graph._snapshots) {
                        if (typeof snap.floor === 'number' && snap.floor > deleted) snap.floor--;
                    }
                }
                if (Array.isArray(this.graph?.graphOps)) {
                    this.graph.graphOps = this.graph.graphOps.filter(op => op.floor !== deleted);
                    for (const op of this.graph.graphOps) {
                        if (typeof op.floor === 'number' && op.floor > deleted) op.floor--;
                        if (op.edge) {
                            if (typeof op.edge.validFrom === 'number' && op.edge.validFrom > deleted) op.edge.validFrom--;
                            if (typeof op.edge.validTo === 'number' && op.edge.validTo > deleted) op.edge.validTo--;
                            if (typeof op.edge.floor === 'number' && op.edge.floor > deleted) op.edge.floor--;
                        }
                    }
                }
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
                if (pack.moneyLedger && this.moneyLedger) this.moneyLedger.import(pack.moneyLedger);
                if (pack.cards && this.cards) this.cards.import(pack.cards);
                if (pack.conflicts && this.conflicts) this.conflicts.import(pack.conflicts);
                if (pack.outline && this.outline) this.outline.import(pack.outline);
                if (pack.pairMem && this.pairMem) this.pairMem.import(pack.pairMem);
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
        // [v3.37] Prompt Cache 友好优化：开启 cacheFriendlyInjection 时，顶槽(9999)只写入绝对稳定的【史记】
        // 只要无新史记折叠，顶槽字符串保持绝对恒定，确保大模型持续命中 Prefix Caching！
        buildVolumeInjection() {
            try {
                const his = (this.summary.historical || []).slice(-3);
                const isCacheFriendly = this.config.config.cacheFriendlyInjection !== false;
                const vols = isCacheFriendly ? [] : (this.summary.getActiveVolumes ? this.summary.getActiveVolumes().slice(-3) : (this.summary.volumes || []).slice(-3));
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
                        report.pipeline = { ok: false, note: '查询文本为空（对话太短？）', hint: '多聊几句产生对话正文后会自动恢复正常' };
                    } else {
                        const t0 = Date.now();
                        const recalled = await this.recallMemory(query);
                        const inj = this.buildInjection(recalled);
                        const merged = recalled.filter(Boolean).reduce((a, b) => a + (Array.isArray(b) ? b.length : 0), 0);
                        report.pipeline = { ok: true, queryLen: qText.length, routes: Object.entries(recalled).filter(([, v]) => Array.isArray(v) && v.length).map(([k, v]) => `${k}:${v.length}`), merged, injLen: (inj || '').length, ms: Date.now() - t0 };
                    }
                } catch (e) { report.pipeline = { ok: false, note: 'dry-run异常: ' + (e?.message || e), hint: hintForError(e) }; }
                // 3. 存档 schema 校验（export 字段 vs load 导入字段配对）
                try {
                    const saved = this.collectExport();
                    const expected = ['graph', 'summaries', 'diaries', 'vectors', 'povs', 'timeline', 'status', 'ledger', 'suspense', 'scene'];
                    const missing = expected.filter(k => saved[k] === undefined || saved[k] === null);
                    const nonEmpty = expected.filter(k => saved[k] && (Array.isArray(saved[k]) ? saved[k].length : Object.keys(saved[k]).length) > 0);
                    report.schema = { ok: missing.length === 0, missing, nonEmpty, hint: missing.length ? '建议点击设置面板【一键自愈】以自动补齐缺省数据' : '' };
                } catch (e) { report.schema = { ok: false, missing: ['collectExport异常: ' + (e?.message || e)], hint: hintForError(e) }; }
            } catch (e) { report.fatal = String(e?.message || e); }
            return report;
        }

        // [v2.9] RU-C: 全量导出（快照/存档共用同构数据）
        // [v3.38] 无损完整全量导出（补充 charMem, worldProg, supersede, narrativeEntropy）
        collectExport() {
            return {
                version: VERSION,
                clock: this.clock?.export?.() || null,
                graph: this.graph.export(),
                charMem: this.charMem ? this.charMem.export() : {},
                worldProg: this.worldProg ? this.worldProg.export() : {},
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
                moneyLedger: this.moneyLedger.export(),
                cards: this.cards.export(),
                conflicts: this.conflicts.export(),
                scene: this.scene.export(),
                echo: this.echo?.export?.(),
                supersede: window.LonShaSupersede ? this.supersede.export() : { supersededMap: {} },
                narrativeEntropy: this._narrativeEntropy || 0,
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
        add(kind, content, floor, createdTime, due) {
            const c = String(content || '').trim();
            if (c.length < 4) return null;
            const id = 'sus_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            this._seq = (this._seq || 0) + 1;
            this.items.push({
                id, sid: 's' + this._seq, kind: (kind === 'suspense' ? 'suspense' : 'plan'), content: c.slice(0, 120),
                status: 'open', floor: floor ?? null, createdTime: createdTime || null, due: due || null,
                outcome: null, resolvedReason: null, resolvedFloor: null, createdAt: Date.now()
            });
            return id;
        }
        /** [v3.46] 吸收 Bakemono: 悬念倒计时与剧情时钟联动计算 */
        getOpenPrompts(clockDate) {
            const rth = new RelativeTimeHelper();
            return this.openItems().map(it => {
                let note = `${it.sid} [${it.kind === 'plan' ? '计划' : '悬念'}] ${it.content}`;
                if (it.due) {
                    const dueStr = String(it.due).trim();
                    if (clockDate && rth) {
                        try {
                            const pClock = rth.parseStoryDate(clockDate);
                            const pDue = rth.parseStoryDate(dueStr);
                            if (pClock && pDue && pClock.type === 'standard' && pDue.type === 'standard') {
                                const d1 = new Date(Date.UTC(pClock.year || 2026, (pClock.month || 1) - 1, pClock.day || 1));
                                const d2 = new Date(Date.UTC(pDue.year || 2026, (pDue.month || 1) - 1, pDue.day || 1));
                                const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
                                if (diffDays < 0) note += ` [已逾期${Math.abs(diffDays)}天!]`;
                                else if (diffDays === 0) note += ' [今日到期!]';
                                else note += ` [距期限还剩${diffDays}天]`;
                            } else {
                                note += ` [期限:${dueStr}]`;
                            }
                        } catch (e) { note += ` [期限:${dueStr}]`; }
                    } else {
                        note += ` [期限:${dueStr}]`;
                    }
                }
                return note;
            });
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
        /** [v3.45] 近期已了结/已作废事项防复读注入 (baibai 理念) */
        getRecentlyResolvedPrompt(limit = 3) {
            const recents = this.recentlyResolved(limit);
            if (!recents.length) return [];
            return recents.map(x => {
                const outcomeMap = { done: '已达成', cancelled: '已作废', failed: '已失败' };
                const outLabel = outcomeMap[x.outcome] || '已了结';
                const reason = x.resolvedReason ? `（原因：${x.resolvedReason}）` : '';
                return `- [${outLabel}] ${x.content}${reason}`;
            });
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

    // [v3.38] 关系多维共存与互斥演化（Zep/Graphiti 理念）
    const RELATION_CONFLICT_GROUPS = [
        new Set(['陌生', '相识', '友好', '暧昧', '暗恋', '热恋', '恋人', '夫妻', '冷战', '决裂', '陌路']),
        new Set(['盟友', '同行', '中立', '对立', '敌对', '宿敌', '仇敌', '背叛'])
    ];
    function areLabelsInConflict(l1, l2) {
        if (!l1 || !l2 || l1 === l2) return false;
        for (const group of RELATION_CONFLICT_GROUPS) {
            if (group.has(l1) && group.has(l2)) return true;
        }
        const p1 = `${l1}-${l2}`, p2 = `${l2}-${l1}`;
        if (/恋人-决裂|决裂-恋人|友好-敌对|敌对-友好|盟友-宿敌|宿敌-盟友/i.test(p1)) return true;
        return false;
    }

    class MemoryGraph {
        constructor() {
            this.nodes = new Map();
            this.edges = new Map();
            this.nameIndex = new Map();
            this._snapshots = [];
            this.SNAP_MAX = 6;
            // [v3.43] 吸收 baibai: 图谱关系事件溯源真源 (Graph Delta Replay)
            this.graphOps = []; // [{ floor, edge, ts }]
            this.MAX_GRAPH_OPS = 500;
        }

        // 记录关系操作事件
        _logGraphOp(floor, edge) {
            try {
                this.graphOps.push({ floor: Number(floor) || 0, edge: { ...edge }, ts: Date.now() });
                if (this.graphOps.length > this.MAX_GRAPH_OPS) this.graphOps.shift();
            } catch (e) { errLog(e, 'MemoryGraph._logGraphOp'); }
        }

        // 事件溯源重放：清空所有边，按楼层顺序幂等重放关系网络
        rebuildGraphFromOps() {
            try {
                this.edges.clear();
                const sorted = [...this.graphOps].sort((a, b) => a.floor - b.floor);
                for (const op of sorted) {
                    if (op.edge) this.addEdge(op.edge, true);
                }
            } catch (e) { errLog(e, 'MemoryGraph.rebuildGraphFromOps'); }
        }

        // 楼层回滚/滑动重roll时截断溯源流并重放
        rollbackGraphFrom(cutoffFloor) {
            try {
                const f = Number(cutoffFloor) || 0;
                this.graphOps = this.graphOps.filter(op => op.floor < f);
                this.rebuildGraphFromOps();
            } catch (e) { errLog(e, 'MemoryGraph.rollbackGraphFrom'); }
        }
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
            if (typeof window !== 'undefined' && window.LonShaMemory?.engine?.config?.config?.debugMode) console.log(`[${PLUGIN_NAME}] 图谱快照: 楼层 ${f} (共 ${this._snapshots.length} 张)`);
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
                if (typeof window !== 'undefined' && window.LonShaMemory?.engine?.config?.config?.debugMode) console.log(`[${PLUGIN_NAME}] 图谱回溯: 回滚到楼层 ${before.floor} 状态 (删楼 ${f})`);
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
        // [v3.37/v3.38] 时态知识图谱（Temporal Graph, Zep/Graphiti 理念）:
        // 记录关系的有效区间 [validFrom, validTo]；仅当同维度冲突时标记 closed；不同维度多维共存
        addEdge(edge, _replaying = false) {
            const from = String(edge.from || '');
            const to = String(edge.to || '');
            const label = String(edge.label || edge.relation || 'related');
            const floor = Math.max(0, Math.round(Number(edge.floor ?? edge.validFrom ?? 0)));
            const id = edge.id || (edge.active === false ? `${from}-${to}-${label}-${edge.validTo ?? floor}` : `${from}-${to}-${label}`);

            if (label !== 'participated_in') {
                for (const [existingId, e] of this.edges) {
                    if (e.from === from && e.to === to && e.label !== 'participated_in' && e.active !== false) {
                        // 只有属于同维度冲突谓词时才闭环旧关系；正交维度（如师徒 vs 恋人）和谐并存
                        if (areLabelsInConflict(e.label, label)) {
                            e.active = false;
                            e.validTo = floor;
                        }
                    }
                }
            }

            const existing = this.edges.get(id);
            const validFrom = (existing && existing.validFrom != null) ? existing.validFrom : (edge.validFrom != null ? edge.validFrom : floor);
            // 关键修复：保留传入的 validTo（防止 import 恢复历史边时被置空覆盖！）
            const validTo = edge.validTo !== undefined ? edge.validTo : null;
            const active = edge.active !== undefined ? edge.active !== false : (validTo === null);

            const fullEdge = {
                ...edge,
                id,
                from,
                to,
                label,
                validFrom,
                validTo,
                active,
                timestamp: Date.now()
            };
            this.edges.set(id, fullEdge);
            if (!_replaying) this._logGraphOp(floor, fullEdge);
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
        // [v3.39] 数据库级实体倒排索引快速匹配: 代替 O(N) 全量循环
        findNodesMentionedIn(text) {
            if (!text || typeof text !== 'string') return [];
            const hits = new Set();
            for (const [nameKey, ids] of this.nameIndex) {
                if (nameKey.length >= 2 && text.includes(nameKey)) {
                    for (const id of ids) {
                        const node = this.nodes.get(id);
                        if (node) hits.add(node);
                    }
                }
            }
            return Array.from(hits);
        }
        // [v3.40] 数据库级碎片整理与真空压缩 (Graph Vacuum & Compaction)
        vacuum(options = {}) {
            const maxHistoricalPerPair = Math.max(1, Number(options.maxHistoricalPerPair) || 3);
            const pruneOrphans = options.pruneOrphans !== false;
            let prunedEdges = 0;
            let prunedNodes = 0;

            // 1. 时态历史边压缩 (Historical Edges Compaction)
            const pairHistMap = new Map();
            for (const [id, e] of this.edges) {
                if (e.active === false) {
                    const pairKey = `${e.from}->${e.to}`;
                    if (!pairHistMap.has(pairKey)) pairHistMap.set(pairKey, []);
                    pairHistMap.get(pairKey).push(e);
                }
            }
            for (const [pairKey, histEdges] of pairHistMap) {
                if (histEdges.length > maxHistoricalPerPair) {
                    histEdges.sort((a, b) => (Number(b.validTo) || 0) - (Number(a.validTo) || 0));
                    const toRemove = histEdges.slice(maxHistoricalPerPair);
                    for (const re of toRemove) {
                        this.edges.delete(re.id);
                        prunedEdges++;
                    }
                }
            }

            // 2. 孤儿临时节点回收 (Prune Orphan Transient Nodes)
            if (pruneOrphans) {
                const connectedNodeIds = new Set();
                for (const e of this.edges.values()) {
                    connectedNodeIds.add(e.from);
                    connectedNodeIds.add(e.to);
                }
                for (const [id, node] of this.nodes) {
                    if (node && node.type !== 'character' && !connectedNodeIds.has(id)) {
                        this.nodes.delete(id);
                        prunedNodes++;
                    }
                }
            }

            // 3. 索引自愈重构
            if (prunedNodes > 0 || prunedEdges > 0) {
                this.rebuildNameIndex();
            }
            return { prunedEdges, prunedNodes, remainingNodes: this.nodes.size, remainingEdges: this.edges.size };
        }
        export() { return {nodes: Array.from(this.nodes.values()), edges: Array.from(this.edges.values()), snapshots: Array.isArray(this._snapshots) ? this._snapshots : [], graphOps: Array.isArray(this.graphOps) ? this.graphOps : []}; }
        import(data) {
            this._snapshots = Array.isArray(data?.snapshots) ? data.snapshots : [];
            this.nodes.clear(); this.edges.clear(); this.nameIndex.clear();
            if (data?.nodes) for (const node of data.nodes) this.nodes.set(node.id, node);
            if (data?.edges) for (const edge of data.edges) this.edges.set(edge.id, edge);
            this.graphOps = Array.isArray(data?.graphOps) ? data.graphOps : [];
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
            if (!message && !llmSummary) return null;
            const safeMes = typeof message?.mes === 'string' ? message.mes : (typeof message === 'string' ? message : '');
            const text = llmSummary || this.smartTruncate(safeMes, 200);
            const rawFloor = Number(message?.index ?? message?.floor);
            const floor = Number.isFinite(rawFloor) ? Math.max(0, Math.round(rawFloor)) : 0;
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
        // 活跃（未折叠且非休眠）摘要
        // [v3.38] 语义级休眠与激活机制（TriviumDB 双区记忆理念）: 长期未涉足的旧摘要自动进入休眠态
        // [v3.41] 吸收 Stitches: 紧凑 AM 记忆地址编码索引 (Memory Address Code)
        generateAMIndex(limit = 25) {
            const active = this.getActiveSummaries().slice(-limit);
            if (!active.length) return '';
            return active.map(s => `[AM${s.floor}] 第${s.floor}楼: ${s.text}`).join('\n');
        }
        // 按 AM 编码快速反解召回完整记忆
        resolveByAMCodes(codesInput) {
            if (!codesInput) return [];
            const codes = Array.isArray(codesInput)
                ? codesInput
                : String(codesInput).match(/AM\d+/gi) || [];
            const floors = new Set(codes.map(c => Number(String(c).replace(/^AM/i, ''))).filter(n => !isNaN(n)));
            return (this.summaries || []).filter(s => floors.has(s.floor));
        }
        getActiveSummaries() { return this.summaries.filter(s => !s.folded && !s.dormant); }
        search(query) { return this.getActiveSummaries().filter(s => s.text.includes(query)).slice(0, 5); }
        
        // [v3.38] 标记休眠：超过 threshold 楼层未提及且非高重要度的已折叠旧摘要进入休眠
        markDormant(currentFloor, threshold = 30) {
            for (const s of (this.summaries || [])) {
                if (!s.folded) continue;
                const dist = currentFloor - (s.floor || 0);
                if (dist > threshold && (s.importance || 5) < 8 && !s.awakened) {
                    s.dormant = true;
                }
            }
        }
        // [v3.38] 实体引燃休眠伏笔唤醒：当出现相关实体时，休眠记忆苏醒
        awakenByEntities(entities) {
            const awakened = [];
            if (!Array.isArray(entities) || !entities.length) return awakened;
            for (const s of (this.summaries || [])) {
                if (s.dormant) {
                    const hit = entities.some(e => e && e.length >= 2 && s.text && s.text.includes(e));
                    if (hit) {
                        s.dormant = false;
                        s.awakened = true;
                        awakened.push(s);
                    }
                }
            }
            return awakened;
        }
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
        // [v3.46] 吸收 Bakemono / MemoryWizard: 宏观史记与编年金字塔 (Grand Chronicle)
        addGrandChronicle(text, opts = {}) {
            const clean = String(text || '').replace(/^[-•\s]+/, '').trim();
            if (!clean) return null;
            const entry = {
                id: 'his_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                text: clean,
                floorStart: Number.isFinite(Number(opts.floorStart)) ? Number(opts.floorStart) : 0,
                floorEnd: Number.isFinite(Number(opts.floorEnd)) ? Number(opts.floorEnd) : 0,
                count: Number.isFinite(Number(opts.count)) ? Number(opts.count) : 1,
                timestamp: Date.now(),
                level: 3,
                source: opts.source || 'manual'
            };
            this.historical.push(entry);
            if (this.historical.length > 6) this.historical.shift();
            return entry;
        }
        getGrandChroniclePrompt() {
            if (!this.historical || !this.historical.length) return '';
            const rows = this.historical.map(h => '- ' + h.text);
            return '[宏观世界线·纪元史记]（长程核心脉络与不可变历史大事件）：\n' + rows.join('\n');
        }
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
            this.pendingWrite = null;
            this.revision = 0;
            this.active = {};
            this.pending = false;
            this.EVERY_FLOORS = 2;
            this.MAX_ACTIVE = 2;
            this.HINT_LEVEL = { NONE: 0, TRACE: 1, MESSAGE: 2, ENTER: 3 };

            // [v3.41] 吸收 Stitches: 约定账本 (Promises Ledger)
            this.promises = []; // [{ id, character, deadlineFloor, content, status: 'pending'|'imminent'|'overdue'|'fulfilled'|'broken', floor }]
            // [v3.41] 吸收 Stitches: 认知隔离 (Cognitive Horizon)
            this.knowledge = {}; // { [charName]: { known: string[], unaware: string[] } }
            // [v3.41] 吸收 Stitches: 剧情支线生命周期与衰减时钟 (Plot Arcs)
            this.plotArcs = []; // [{ id, title, clue, lastActiveFloor, status: 'active'|'shelved'|'resolved', interestedBy }]
        }

        // ===== 约定账本 (Promises Ledger) =====
        addPromise(p = {}) {
            const id = 'prom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            const prom = {
                id,
                character: p.character || '通用',
                content: p.content || '',
                deadlineFloor: Number(p.deadlineFloor) || 9999,
                floor: Number(p.floor) || 0,
                status: 'pending',
                createdAt: Date.now()
            };
            this.promises.push(prom);
            return prom;
        }
        checkPromises(currentFloor) {
            const f = Number(currentFloor) || 0;
            for (const p of this.promises) {
                if (p.status === 'fulfilled' || p.status === 'broken') continue;
                if (f > p.deadlineFloor) {
                    p.status = 'overdue';
                } else if (f >= p.deadlineFloor - 2) {
                    p.status = 'imminent';
                } else {
                    p.status = 'pending';
                }
            }
        }
        fulfillPromise(id) {
            const p = this.promises.find(x => x.id === id);
            if (p) p.status = 'fulfilled';
            return p;
        }
        breakPromise(id) {
            const p = this.promises.find(x => x.id === id);
            if (p) p.status = 'broken';
            return p;
        }

        // ===== 认知隔离 (Cognitive Horizon) =====
        markUnaware(charName, fact) {
            if (!charName || !fact) return;
            if (!this.knowledge[charName]) this.knowledge[charName] = { known: [], unaware: [] };
            const k = this.knowledge[charName];
            if (!k.unaware.includes(fact) && !k.known.includes(fact)) {
                k.unaware.push(fact);
            }
        }
        revealKnowledge(charName, fact, source = '') {
            if (!charName || !fact) return;
            if (!this.knowledge[charName]) this.knowledge[charName] = { known: [], unaware: [] };
            const k = this.knowledge[charName];
            k.unaware = k.unaware.filter(x => x !== fact);
            if (!k.known.includes(fact)) k.known.push(fact);
        }
        getReEntryNotice(charName) {
            const k = this.knowledge?.[charName];
            if (!k || !k.unaware?.length) return '';
            const unawareList = k.unaware.slice(0, 3).map(u => `尚未得知：${u}`).join('；');
            return `〔认知隔离提示：角色【${charName}】此前不在场，${unawareList}。扮演该角色时切勿未卜先知、不可主动提起其不知情的事实〕`;
        }

        // ===== 剧情支线生命周期 (Plot Arcs) =====
        addPlotArc(arc = {}) {
            const id = 'arc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            const entry = {
                id,
                title: arc.title || '支线',
                clue: arc.clue || '',
                lastActiveFloor: Number(arc.currentFloor) || 0,
                status: 'active',
                interestedBy: arc.interestedBy || ''
            };
            this.plotArcs.push(entry);
            return entry;
        }
        touchArc(idOrTitle, currentFloor) {
            const arc = this.plotArcs.find(a => a.id === idOrTitle || a.title === idOrTitle);
            if (arc) {
                arc.status = 'active';
                arc.lastActiveFloor = Number(currentFloor) || arc.lastActiveFloor;
            }
            return arc;
        }
        decayArcs(currentFloor, maxInactiveTurns = 15) {
            const f = Number(currentFloor) || 0;
            for (const a of this.plotArcs) {
                if (a.status === 'resolved') continue;
                if (f - (a.lastActiveFloor || 0) > maxInactiveTurns) {
                    a.status = 'shelved';
                }
            }
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
        // 输出注入（buildInjection 调用）: 包含约定账本、活跃支线与不在场推进
        toInjection() {
            const results = [];
            // 1. 约定账本注入 (高优先级)
            const activePromises = (this.promises || []).filter(p => p.status !== 'fulfilled' && p.status !== 'broken');
            if (activePromises.length) {
                const promLines = activePromises.map(p => {
                    const statusDesc = p.status === 'overdue' ? '【已逾期】' : (p.status === 'imminent' ? '【即将到期】' : '【进行中】');
                    return `- [约定|${p.character}|截止第${p.deadlineFloor}楼] ${statusDesc} ${p.content}`;
                }).join('\n');
                results.push({
                    id: 'wp_promises',
                    text: `〔未竟约定与承诺〕\n${promLines}`,
                    source: 'worldprogress+promises'
                });
            }

            // 2. 活跃剧情支线注入
            const activeArcs = (this.plotArcs || []).filter(a => a.status === 'active');
            if (activeArcs.length) {
                const arcLines = activeArcs.map(a => `- [支线:${a.title}] ${a.clue}${a.interestedBy ? ` (关注者: ${a.interestedBy})` : ''}`).join('\n');
                results.push({
                    id: 'wp_arcs',
                    text: `〔活跃剧情支线〕\n${arcLines}`,
                    source: 'worldprogress+arcs'
                });
            }

            // 3. 场外动态推进注入
            const entries = Object.values(this.active);
            for (const a of entries) {
                results.push({
                    id: 'wp_' + a.floor,
                    text: `${a.floor != null ? `（第${a.floor}楼待推进）${a.name || ''}` : ''}${a.memory || ''}`,
                    source: 'worldprogress'
                });
            }
            return results;
        }
        export() {
            return {
                active: this.active,
                pending: this.pending,
                promises: this.promises || [],
                knowledge: this.knowledge || {},
                plotArcs: this.plotArcs || []
            };
        }
        import(data) {
            if (data) {
                this.active = data.active || {};
                this.pending = !!data.pending;
                this.promises = Array.isArray(data.promises) ? data.promises : [];
                this.knowledge = (typeof data.knowledge === 'object' && data.knowledge) ? data.knowledge : {};
                this.plotArcs = Array.isArray(data.plotArcs) ? data.plotArcs : [];
            }
        }
    }

    class RelativeTimeHelper {
        // [v3.43] 吸收 baibai: 双界时间锚点提取 (起止时间与经过时长)
        extractDualTimeTags(text) {
            const s = String(text || '');
            const startM = /<bbs_start>([\s\S]*?)<\/bbs_start>/i.exec(s);
            const endM = /<bbs_end>([\s\S]*?)<\/bbs_end>/i.exec(s);
            if (startM && endM) {
                const start = startM[1].trim();
                const end = endM[1].trim();
                let durationMinutes = 0;
                try {
                    const t1 = new Date(start).getTime();
                    const t2 = new Date(end).getTime();
                    if (!isNaN(t1) && !isNaN(t2)) {
                        durationMinutes = Math.max(0, Math.round((t2 - t1) / 60000));
                    }
                } catch (e) {}
                return { hasDual: true, start, end, durationMinutes };
            }
            return { hasDual: false, start: null, end: null, durationMinutes: 0 };
        }

        // [v3.43] 吸收 baibai: 年龄精准推算时钟 (基于出生日期与当前剧情日期的数学差)
        calcAge(birthDateStr, currentStoryDateStr) {
            try {
                const b = this.parseStoryDate(birthDateStr);
                const c = this.parseStoryDate(currentStoryDateStr);
                if (b && c && b.year && c.year) {
                    let age = c.year - b.year;
                    if (c.month != null && b.month != null) {
                        if (c.month < b.month || (c.month === b.month && (c.day || 0) < (b.day || 0))) {
                            age--;
                        }
                    }
                    return Math.max(0, age);
                }
            } catch (e) {}
            return 0;
        }

        // [v3.43] 吸收 baibai: 相识天数数学推算
        calcDaysTogether(firstMetDateStr, currentStoryDateStr) {
            try {
                const d1 = new Date(this.normalizeNumericDateSeparators(firstMetDateStr)).getTime();
                const d2 = new Date(this.normalizeNumericDateSeparators(currentStoryDateStr)).getTime();
                if (!isNaN(d1) && !isNaN(d2)) {
                    return Math.max(0, Math.floor((d2 - d1) / this.DAY_MS));
                }
            } catch (e) {}
            return 0;
        }
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

        // [v3.46] 吸收 Bakemono: 剧情时钟与回忆隔离（GameClock）
    class GameClock {
        constructor() {
            this.date = '';             // 绝对日期或架空历法，如 '2026-09-13', '天顺三年春'
            this.label = '';            // 时段/刻度/天气，如 '申时·薄暮·大雪', '清晨'
            this.precision = 'unknown'; // 'day' | 'approximate' | 'unknown'
            this.lastFlashback = null;  // { date, label, floor, recordedAt }
            this.turn = 0;              // 当前所处轮次/楼层
        }

        // 设置/推进剧情时间
        // opts: { date, label, flashback, floor, relativeDays }
        setTime(opts = {}) {
            const isFlashback = !!opts.flashback;
            const newDate = opts.date ? String(opts.date).trim() : '';
            const newLabel = opts.label ? String(opts.label).trim() : '';
            const floor = Number.isFinite(Number(opts.floor)) ? Math.max(0, Math.round(Number(opts.floor))) : this.turn;

            if (isFlashback) {
                // 回忆时间：严格隔离！绝不修改当前主剧情时钟！
                this.lastFlashback = {
                    date: newDate,
                    label: newLabel,
                    floor,
                    recordedAt: Date.now()
                };
                return { updated: false, flashback: true, clock: this.getSnapshot() };
            }

            let changed = false;
            if (newDate && newDate !== this.date) {
                this.date = newDate;
                this.precision = 'day';
                changed = true;
            }
            if (newLabel && newLabel !== this.label) {
                this.label = newLabel;
                if (!this.precision || this.precision === 'unknown') this.precision = 'approximate';
                changed = true;
            }
            if (opts.relativeDays && Number.isInteger(Number(opts.relativeDays))) {
                const days = Number(opts.relativeDays);
                if (this.date) {
                    try {
                        const rth = new RelativeTimeHelper();
                        const parsed = rth.parseStoryDate(this.date);
                        if (parsed && parsed.type === 'standard') {
                            const now = new Date();
                            const y = parsed.year ?? now.getFullYear();
                            const m = parsed.month ?? (now.getMonth() + 1);
                            const d = parsed.day ?? 1;
                            const t = new Date(Date.UTC(y, m - 1, d + days));
                            this.date = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
                            changed = true;
                        }
                    } catch (e) {}
                }
            }
            this.turn = floor;
            return { updated: changed, flashback: false, clock: this.getSnapshot() };
        }

        getSnapshot() {
            return {
                date: this.date,
                label: this.label,
                precision: this.precision,
                lastFlashback: this.lastFlashback ? { ...this.lastFlashback } : null,
                turn: this.turn
            };
        }

        getContextPrompt() {
            const parts = [];
            if (this.date) parts.push(this.date);
            if (this.label) parts.push(this.label);
            if (!parts.length) return '';
            let text = `[当前剧情时间]：${parts.join(' · ')}。回忆不改变当前时钟。`;
            if (this.lastFlashback && (this.lastFlashback.date || this.lastFlashback.label)) {
                const fb = [this.lastFlashback.date, this.lastFlashback.label].filter(Boolean).join(' · ');
                text += `（前情往事回忆为 ${fb}，非当前时钟）`;
            }
            return text;
        }

        export() { return this.getSnapshot(); }
        import(data) {
            if (!data || typeof data !== 'object') return;
            this.date = String(data.date || '').trim();
            this.label = String(data.label || '').trim();
            this.precision = String(data.precision || 'unknown');
            this.lastFlashback = data.lastFlashback && typeof data.lastFlashback === 'object' ? { ...data.lastFlashback } : null;
            this.turn = Number.isFinite(Number(data.turn)) ? Math.max(0, Math.round(Number(data.turn))) : 0;
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
            this.ops = [];
            this.MAX_OPS = 500;
            this.MAX_FIELDS = 24;
            this.MAX_TODOS = 12;

            // [v3.42] 吸收 caikis: 人设基线与短期人设偏移 (Baseline vs Drift)
            this.baselines = {};    // { [name]: { traits: [], speechStyle: '', coreBelief: '', lockedAtFloor, updatedAt } }
            this.drifts = {};       // { [name]: { mood: '', reinforced: '', weakened: '', behaviorChange: '', floor: 0, updatedAt } }
            // [v3.42] 吸收 caikis: NPC 晋升机制 (Promotion Pipeline)
            this.transientNpcs = {};// 轻量路人 { [name]: { identity, firstSeenFloor, lastSeenFloor, meetCount } }
            this.trackedNpcs = new Set(); // 晋升为常驻深度追踪的角色
            // [v3.42] 吸收 caikis: 三级地理空间感知 (3-Tier Geo Context)
            this.geoContext = { majorArea: '', minorArea: '', detailLocation: '', floor: 0, updatedAt: 0 };
            // [v3.45] 吸收 baibai: NPC 长期人伦社会羁绊网 (Long-term NPC Ties)
            this.npcTies = {}; // { [name]: string[] }
            // [v3.45] 吸收 baibai: 主角客观状态 (Protagonist State) 与 生活细节癖好 (Life Details)
            this.protagonist = { gender: '', age: '', identity: '', appearance: '', outfit: '', condition: '', floor: 0, updatedAt: 0 };
            this.lifeDetails = []; // [ { id, text, topics: [], tier: 'active', floor, createdAt } ]
        }

        // ===== [v3.42] 吸收 caikis: 人设基线 (Baseline) vs 人设偏移 (Drift) =====
        setBaseline(name, b = {}) {
            if (!name) return null;
            this.baselines[name] = {
                traits: Array.isArray(b.traits) ? b.traits : (b.traits ? [b.traits] : []),
                speechStyle: b.speechStyle || '',
                coreBelief: b.coreBelief || '',
                lockedAtFloor: Number(b.floor) || 0,
                updatedAt: Date.now()
            };
            return this.baselines[name];
        }
        recordDrift(name, d = {}) {
            if (!name) return null;
            this.drifts[name] = {
                mood: d.mood || '',
                reinforced: d.reinforced || '',
                weakened: d.weakened || '',
                behaviorChange: d.behaviorChange || '',
                floor: Number(d.floor) || 0,
                updatedAt: Date.now()
            };
            return this.drifts[name];
        }
        getEffectivePersona(name, currentFloor = 0) {
            const base = this.baselines[name];
            const drift = this.drifts[name];
            if (!base && !drift) return { name, hasDrift: false, description: '' };
            const f = Number(currentFloor) || 0;
            // 超过 15 楼无新刺激，性格偏移衰减收敛
            const driftAge = drift ? Math.max(0, f - (drift.floor || 0)) : 999;
            const hasActiveDrift = !!(drift && driftAge <= 15);

            const parts = [];
            if (base) {
                if (base.traits.length) parts.push(`核心性格：${base.traits.join('、')}`);
                if (base.speechStyle) parts.push(`用语习惯：${base.speechStyle}`);
                if (base.coreBelief) parts.push(`基线定海神针：${base.coreBelief}`);
            }
            if (hasActiveDrift) {
                parts.push(`【近期人设偏移·第${drift.floor}楼受刺激】`);
                if (drift.mood) parts.push(`当前心境：${drift.mood}`);
                if (drift.reinforced) parts.push(`被强化侧面：${drift.reinforced}`);
                if (drift.weakened) parts.push(`被弱化：${drift.weakened}`);
                if (drift.behaviorChange) parts.push(`行为模式变化：${drift.behaviorChange}`);
            }
            return {
                name,
                hasDrift: hasActiveDrift,
                baseline: base,
                drift: hasActiveDrift ? drift : null,
                description: parts.join('；')
            };
        }

        // ===== [v3.42] 吸收 caikis: NPC 晋升机制 (Promotion Pipeline) =====
        registerTransientNpc(name, info = {}) {
            if (!name || this.trackedNpcs.has(name)) return;
            if (!this.transientNpcs[name]) {
                this.transientNpcs[name] = {
                    name,
                    identity: info.identity || '路人',
                    firstSeenFloor: Number(info.floor) || 0,
                    lastSeenFloor: Number(info.floor) || 0,
                    meetCount: 1
                };
            } else {
                const rec = this.transientNpcs[name];
                rec.lastSeenFloor = Number(info.floor) || rec.lastSeenFloor;
                rec.meetCount = (rec.meetCount || 1) + 1;
                if (info.identity) rec.identity = info.identity;
            }
            return this.transientNpcs[name];
        }
        promoteNpc(name) {
            if (!name) return false;
            this.trackedNpcs.add(name);
            delete this.transientNpcs[name];
            return true;
        }
        isNpcTracked(name) {
            return this.trackedNpcs.has(name);
        }

        // ===== [v3.42] 吸收 caikis: 三级地理空间感知 (3-Tier Geo Context) =====
        setGeoLocation(geo = {}) {
            this.geoContext = {
                majorArea: geo.majorArea || '',
                minorArea: geo.minorArea || '',
                detailLocation: geo.detailLocation || '',
                floor: Number(geo.floor) || 0,
                updatedAt: Date.now()
            };
            return this.geoContext;
        }
        getGeoLocation() {
            return this.geoContext;
        }
        getGeoPrompt() {
            const g = this.geoContext;
            if (!g || (!g.majorArea && !g.minorArea && !g.detailLocation)) return '';
            return `〔当前地理位置〕主要地区: ${g.majorArea || '未知'} | 次要地区: ${g.minorArea || '未知'} | 详细地点: ${g.detailLocation || '未知'}`;
        }

        // ===== [v3.45] 吸收 baibai: NPC 长期社会人伦羁绊 (NPC Ties) =====
        addNpcTie(name, tie) {
            if (!name || !tie) return null;
            const normName = String(name).trim();
            if (!normName) return null;
            this.npcTies[normName] = this.npcTies[normName] || [];
            const parts = String(tie).split(/[；;]/).map(s => s.trim()).filter(Boolean);
            for (const p of parts) {
                if (!this.npcTies[normName].includes(p)) {
                    this.npcTies[normName].push(p);
                }
            }
            return this.npcTies[normName];
        }
        setNpcTies(name, ties) {
            if (!name) return null;
            const normName = String(name).trim();
            const list = Array.isArray(ties) ? ties : String(ties || '').split(/[；;]/);
            this.npcTies[normName] = [];
            for (const t of list) {
                const s = String(t || '').trim();
                if (s && !this.npcTies[normName].includes(s)) {
                    this.npcTies[normName].push(s);
                }
            }
            return this.npcTies[normName];
        }
        getNpcTies(name) {
            return this.npcTies[String(name || '').trim()] || [];
        }
        getAllNpcTies() {
            return { ...this.npcTies };
        }
        getNpcTiesRecords() {
            return Object.entries(this.npcTies).map(([name, ties]) => ({ name, ties: [...ties] }));
        }

        // ===== [v3.45] 吸收 baibai: 主角客观档案 (Protagonist) =====
        setProtagonist(patch = {}, floor = 0) {
            if (!patch || typeof patch !== 'object') return this.protagonist;
            for (const key of ['gender', 'age', 'identity', 'appearance', 'outfit', 'condition']) {
                if (patch[key] !== undefined) {
                    this.protagonist[key] = String(patch[key] ?? '').trim();
                }
            }
            this.protagonist.floor = Number(floor) || this.protagonist.floor || 0;
            this.protagonist.updatedAt = Date.now();
            return this.protagonist;
        }
        getProtagonist() {
            return { ...this.protagonist };
        }
        getProtagonistPrompt() {
            const p = this.protagonist;
            if (!p) return '';
            const parts = [];
            if (p.gender) parts.push(`[性别:${p.gender}]`);
            if (p.age) parts.push(`年龄:${p.age}`);
            if (p.identity) parts.push(`身份:${p.identity}`);
            if (p.appearance) parts.push(`体貌:${p.appearance}`);
            if (p.outfit) parts.push(`当前着装:${p.outfit}`);
            if (p.condition) parts.push(`生理/伤病状况:${p.condition}`);
            return parts.length ? parts.join(' | ') : '';
        }

        // ===== [v3.45] 吸收 baibai: 主角生活习惯与癖好档案 (Life Details) =====
        _normalizeDetailText(text) {
            return String(text || '').trim().toLowerCase().replace(/[，。！？!?、；;：:\s]+$/u, '');
        }
        addLifeDetail(detail, floor = 0) {
            const rawText = typeof detail === 'string' ? detail : (detail?.text || '');
            const cleanText = String(rawText || '').trim();
            if (!cleanText || cleanText.length < 2) return null;

            const norm = this._normalizeDetailText(cleanText);
            const topics = Array.isArray(detail?.topics) ? detail.topics.map(t => String(t).trim()).filter(Boolean) : [];
            const tier = ['pinned', 'active', 'archive'].includes(detail?.tier) ? detail.tier : 'active';

            let existing = this.lifeDetails.find(d => this._normalizeDetailText(d.text) === norm);
            if (existing) {
                existing.text = cleanText;
                existing.tier = tier;
                if (topics.length) existing.topics = Array.from(new Set([...existing.topics, ...topics]));
                existing.floor = Number(floor) || existing.floor || 0;
                return existing;
            }

            const item = {
                id: `life_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                text: cleanText,
                topics,
                tier,
                floor: Number(floor) || 0,
                createdAt: Date.now()
            };
            this.lifeDetails.push(item);
            if (this.lifeDetails.length > 30) this.lifeDetails.shift();
            return item;
        }
        removeLifeDetail(idOrText) {
            if (!idOrText) return false;
            const norm = this._normalizeDetailText(idOrText);
            const idx = this.lifeDetails.findIndex(d => d.id === idOrText || this._normalizeDetailText(d.text) === norm);
            if (idx !== -1) {
                this.lifeDetails.splice(idx, 1);
                return true;
            }
            return false;
        }
        getLifeDetailsPrompt(limit = 5) {
            const active = this.lifeDetails.filter(d => d.tier !== 'archive').slice(-limit);
            return active.map(d => `- ${d.text}${d.topics?.length ? ` [${d.topics.join('/')}]` : ''}`);
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
        export() {
            return {
                characters: this.characters,
                ops: this.ops,
                baselines: this.baselines || {},
                drifts: this.drifts || {},
                transientNpcs: this.transientNpcs || {},
                trackedNpcs: Array.from(this.trackedNpcs || []),
                geoContext: this.geoContext || {},
                npcTies: this.npcTies || {},
                protagonist: this.protagonist || {},
                lifeDetails: Array.isArray(this.lifeDetails) ? this.lifeDetails : []
            };
        }
        import(data) {
            if (data && typeof data === 'object' && data.characters) {
                this.characters = data.characters;
                this.ops = Array.isArray(data.ops) ? data.ops : [];
                this.baselines = data.baselines || {};
                this.drifts = data.drifts || {};
                this.transientNpcs = data.transientNpcs || {};
                this.trackedNpcs = new Set(Array.isArray(data.trackedNpcs) ? data.trackedNpcs : []);
                this.geoContext = data.geoContext || { majorArea: '', minorArea: '', detailLocation: '', floor: 0, updatedAt: 0 };
                this.npcTies = data.npcTies || {};
                this.protagonist = data.protagonist || { gender: '', age: '', identity: '', appearance: '', outfit: '', condition: '', floor: 0, updatedAt: 0 };
                this.lifeDetails = Array.isArray(data.lifeDetails) ? data.lifeDetails : [];
            } else {
                this.characters = (data && typeof data === 'object') ? data : {};
                this.ops = [];
                this.baselines = {};
                this.drifts = {};
                this.transientNpcs = {};
                this.trackedNpcs = new Set();
                this.geoContext = { majorArea: '', minorArea: '', detailLocation: '', floor: 0, updatedAt: 0 };
                this.npcTies = {};
                this.protagonist = { gender: '', age: '', identity: '', appearance: '', outfit: '', condition: '', floor: 0, updatedAt: 0 };
                this.lifeDetails = [];
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
        // [v3.37] 扩展 forceTrigger 支持惊奇度冲顶自适应触发
        async generate(config, llm, engine, floor, forceTrigger = false) {
            const every = Math.max(0, Number(config.reflectEveryFloors || 10));
            if (!config.reflectionEnabled || !llm) return 0;
            if (!forceTrigger && every > 0 && (floor - this._lastReflectFloor) < every) return 0;
            if (this._running) return 0;
            this._running = true;
            // [v3.38] 延迟更新 _lastReflectFloor，仅当成功产生反思时才记录
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
                const sanitized = sanitizeJson(raw);
                const m = String(sanitized).match(/\{[\s\S]*\}/);
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
                this._lastReflectFloor = floor;
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
- attitude_to_user 写该角色此刻对用户/主角的态度（一句话，如：表面客气心底记仇、依赖中带试探）。
- key_events 写他亲历且对他个人有分量的事件（数组，最多3条）。
- relationship_with_others 写他对自己与别人关系的主观印象（对象:描述；按他经历来写，不是上帝视角结论，可有偏差——单恋/错付/误判都是宝贵素材）。
- 复用已知角色名单中的主名。只输出JSON：{"diaries":[{"name":"主名","entry":"第一人称正文","mood":"心情词","secret":"没说出口的心思","attitude_to_user":"对用户态度","key_events":["事件1"],"relationship_with_others":{"某角色":"他眼中的关系"}}]}
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
                        secret: String(d.secret || '').slice(0, 100), timestamp: Date.now(),
                        attitude: String(d.attitude_to_user || '').slice(0, 60),
                        keyEvents: (Array.isArray(d.key_events) ? d.key_events : []).map(x => String(x).slice(0, 60)).slice(0, 3),
                        subjRelations: (d.relationship_with_others && typeof d.relationship_with_others === 'object' && !Array.isArray(d.relationship_with_others)) ? Object.entries(d.relationship_with_others).slice(0, 4).map(([k, v]) => `${String(k).slice(0, 12)}:${String(v).slice(0, 40)}`) : []
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
    

    // [v3.47] 吸收 hcdiary: 钱财账本（经济系统追踪——当前金额覆盖式 + 变动流水追加式）
    class MoneyLedger {
        constructor() { this.money = {}; this.moneyLog = []; }
        /** 设置/调整某角色当前金额（覆盖式；delta 为数值增减） */
        setMoney(name, amount, reason, floor, storyTime) {
            const key = normalizeCharName(name);
            if (!key) return false;
            const prev = Number(this.money[key]?.amount) || 0;
            const next = amount;
            this.money[key] = { name: String(name).trim(), amount: next, updatedAt: Date.now(), floor: floor || 0 };
            if (reason) {
                this.moneyLog.push({ key, name: String(name).trim(), time: storyTime || '', floor: floor || 0, desc: String(reason).slice(0, 80), delta: Math.round((next - prev) * 100) / 100, timestamp: Date.now() });
                if (this.moneyLog.length > 60) this.moneyLog.shift();
            }
            return true;
        }
        /** 数值增减（delta 可负） */
        addDelta(name, delta, reason, floor, storyTime) {
            const key = normalizeCharName(name);
            const prev = Number(this.money[key]?.amount) || 0;
            return this.setMoney(name, prev + (Number(delta) || 0), reason, floor, storyTime);
        }
        getMoney(name) { return this.money[normalizeCharName(name)] || null; }
        /** 注入提示词（当前金额 + 最近流水） */
        toPrompt() {
            const lines = [];
            const entries = Object.values(this.money).filter(e => e && e.name).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
            for (const e of entries) lines.push(`- ${e.name}：${e.amount}`);
            const logs = this.moneyLog.slice(-5);
            const logLines = logs.map(l => `  · ${l.name} ${l.delta >= 0 ? '+' : ''}${l.delta}（${l.desc}）`).filter(Boolean);
            if (!lines.length) return '';
            let out = '[当前钱财账本]（角色经济状态，花钱/挣钱须与账本一致，禁止凭空获得或挥霍）：\n' + lines.join('\n');
            if (logLines.length) out += '\n[钱财变动流水·最近]：\n' + logLines.join('\n');
            return out;
        }
        removeByFloor(floor) {
            let n = 0;
            const before = this.moneyLog.length;
            this.moneyLog = this.moneyLog.filter(l => l.floor !== floor);
            n += before - this.moneyLog.length;
            return n;
        }
        export() { return { money: this.money, moneyLog: this.moneyLog }; }
        import(data) {
            if (data && typeof data === 'object') {
                this.money = data.money || {};
                this.moneyLog = Array.isArray(data.moneyLog) ? data.moneyLog : [];
            }
        }
    }

    // [v3.47] 吸收 hcdiary: 剧情卡牌收集（重要剧情时刻铸成记忆卡牌，游戏化收藏）
    class CardCollection {
        constructor() { this.cards = []; }
        /** 铸卡（重要度>=8 的事件自动成卡；幂等：同楼层同标题不重复铸） */
        forge(title, desc, floor, icon, storyTime) {
            const t = String(title || '').trim();
            if (!t || t.length < 2) return false;
            if (this.cards.some(c => c.floor === floor && c.title === t)) return false;
            this.cards.push({
                title: t.slice(0, 30),
                desc: String(desc || '').slice(0, 100),
                floor: floor || 0,
                time: String(storyTime || '').slice(0, 30),
                icon: String(icon || '🃏').slice(0, 8),
                timestamp: Date.now()
            });
            if (this.cards.length > 50) this.cards.shift();
            return true;
        }
        /** 从事件列表铸卡（importance>=threshold） */
        forgeFromEvents(events, floor, storyTime, threshold) {
            const th = Number(threshold) || 8;
            let n = 0;
            for (const ev of (events || [])) {
                if (!ev || (Number(ev.importance) || 0) < th) continue;
                if (this.forge(ev.type || '事件', ev.description, floor, '🃏', storyTime)) n++;
            }
            return n;
        }
        toPrompt() {
            if (!this.cards.length) return '';
            const recent = this.cards.slice(-8);
            const rows = recent.map(c => `- ${c.icon}【${c.title}】${c.desc}${c.time ? `（${c.time}）` : ''}`);
            return `[剧情卡牌收集]（重要时刻纪念，可作为话题回忆）：\n${rows.join('\n')}`;
        }
        removeByFloor(floor) {
            const before = this.cards.length;
            this.cards = this.cards.filter(c => c.floor !== floor);
            return before - this.cards.length;
        }
        export() { return { cards: this.cards }; }
        import(data) { if (data && Array.isArray(data.cards)) this.cards = data.cards; }
    }

    // [v3.47] 吸收 memorybooks: 矛盾账本（真矛盾显式标注并存，"某角色在甲事件声称X，在乙事件声称Y"，不静默择一）
    class ConflictBook {
        constructor() { this.conflicts = []; }
        /** 登记真矛盾（幂等：同 subject 同版本对不重复登记） */
        add(subject, versionA, versionB, note, floor, storyTime) {
            const s = String(subject || '').trim();
            if (!s || s.length < 2) return false;
            const a = String(versionA || '').slice(0, 100);
            const b = String(versionB || '').slice(0, 100);
            if (!a || !b) return false;
            if (this.conflicts.some(c => c.subject === s && c.versionA === a && c.versionB === b)) return false;
            this.conflicts.push({
                subject: s.slice(0, 40), versionA: a, versionB: b,
                note: String(note || '').slice(0, 60),
                floor: floor || 0, time: String(storyTime || '').slice(0, 30),
                timestamp: Date.now()
            });
            if (this.conflicts.length > 30) this.conflicts.shift();
            return true;
        }
        /** 提取处理入口 */
        addFromExtracted(list, floor, storyTime) {
            let n = 0;
            for (const c of (list || [])) {
                if (this.add(c?.subject, c?.versionA, c?.versionB, c?.note, floor, storyTime)) n++;
            }
            return n;
        }
        /** 注入提示词：矛盾显式标注，提示 AI 这些事实存在多版本，不得擅自裁决 */
        toPrompt() {
            if (!this.conflicts.length) return '';
            const rows = this.conflicts.slice(-6).map(c =>
                `- ${c.subject}：版本A「${c.versionA}」 ↔ 版本B「${c.versionB}」${c.note ? `（${c.note}）` : ''}`);
            return `[未决矛盾·显式标注]（以下事实存在多个对不上的版本，是剧情资产。对话涉及这些事实时保持张力或自然揭示，严禁擅自裁决谁对谁错）：\n${rows.join('\n')}`;
        }
        removeByFloor(floor) {
            const before = this.conflicts.length;
            this.conflicts = this.conflicts.filter(c => c.floor !== floor);
            return before - this.conflicts.length;
        }
        export() { return { conflicts: this.conflicts }; }
        import(data) { if (data && Array.isArray(data.conflicts)) this.conflicts = data.conflicts; }
    }

    // [v3.48] 吸收 shujuku: 剧情大纲导演（阶段节奏四形态 + 轮级 pacing 四相 + 宽容标签解析）
    // 记忆插件从此有了"导演视角"：不只记录过去，还规划未来。
    class OutlineDirector {
        constructor() {
            this.stage = null;        // { title, goal, tempo, nodes: [{title, goal, turns: [{goal, pacing}] }] }
            this._turnIndex = 0;      // 全局扁平 turn 指针
            this._turnFloor = 0;      // 当前 turn 起始楼层
            this.history = [];        // 已完成 turn 的简史
        }
        static TEMPOS = [
            { key: 'buildup', desc: '铺垫型：低压为主，攒关系与信息，为爆发蓄力' },
            { key: 'mixed', desc: '起伏型：常规推进，松紧交替' },
            { key: 'surge', desc: '高压型：决战/逃亡/密集事件' },
            { key: 'aftermath', desc: '余波型：消化代价、重建关系、落地前段高压' }
        ];
        static PACINGS = [
            { key: 'setup', desc: '铺垫：关系变化、信息沉淀、情绪落地' },
            { key: 'pressure', desc: '施压：行动+阻碍+悬念，冲突升级' },
            { key: 'turn', desc: '反转：揭示/转折/高潮爆点' },
            { key: 'cooldown', desc: '收束：后果消化、余韵' }
        ];
        get flatTurns() {
            if (!this.stage) return [];
            const out = [];
            for (const n of this.stage.nodes) for (const t of n.turns) out.push(t);
            return out;
        }
        get currentTurn() { return this.flatTurns[this._turnIndex] || null; }
        get exhausted() { return !this.stage || this._turnIndex >= this.flatTurns.length; }
        /** 宽容解析 AI 回复中的大纲标签（标签外内容全部忽略；<think> 已在上游剥离） */
        parseOutline(raw, floor) {
            const text = String(raw || '');
            if (!text.includes('<node')) return null;
            try {
                const pick = (tag) => {
                    const m = new RegExp('<' + tag + '>\\s*([\\s\\S]*?)\\s*</' + tag + '>', 'i').exec(text);
                    return m ? m[1].trim() : '';
                };
                const nodeBlocks = [];
                const nodeRe = /<node>([\s\S]*?)<\/node>/gi;
                let nm;
                while ((nm = nodeRe.exec(text))) {
                    const block = nm[1];
                    const turns = [];
                    const turnRe = /<turn([^>]*)>([\s\S]*?)<\/turn>/gi;
                    let tm;
                    while ((tm = turnRe.exec(block))) {
                        const pacingM = /pacing\s*=\s*[^a-z0-9]{0,2}([a-z]+)/i.exec(tm[1] || '');
                        const goal = String(tm[2] || '').replace(/<[^>]+>/g, '').trim();
                        if (goal) turns.push({ goal: goal.slice(0, 120), pacing: pacingM ? pacingM[1].toLowerCase() : 'mixed' });
                    }
                    if (turns.length) nodeBlocks.push({
                        title: (pick.call(null, 'node_title') || '').slice(0, 40),
                        goal: (pick.call(null, 'node_goal') || '').slice(0, 150),
                        turns
                    });
                }
                if (!nodeBlocks.length) return null;
                this.stage = {
                    title: pick('stage_title').slice(0, 60) || '未命名阶段',
                    goal: pick('stage_goal').slice(0, 200),
                    tempo: (pick('stage_tempo') || 'mixed').toLowerCase(),
                    nodes: nodeBlocks
                };
                this._turnIndex = 0;
                this._turnFloor = floor || 0;
                return this.stage;
            } catch (e) { return null; }
        }
        /** 每楼推进：当前 turn 的起始楼层距离超过 N 楼或剧情明显完成时推进（由外部判定） */
        advanceTurn(floor) {
            const cur = this.currentTurn;
            if (cur) {
                this.history.push({ goal: cur.goal, pacing: cur.pacing, floorFrom: this._turnFloor, floorTo: floor || 0 });
                if (this.history.length > 30) this.history.shift();
            }
            this._turnIndex++;
            this._turnFloor = floor || 0;
        }
        /** 注入块（导演视角：阶段/节点/本轮目标/本轮节奏） */
        toPrompt() {
            if (!this.stage) return '';
            const lines = [];
            const tempoDef = OutlineDirector.TEMPOS.find(t => t.key === this.stage.tempo);
            lines.push(`[剧情大纲·导演视角]（当前阶段「${this.stage.title}」：${this.stage.goal}）`);
            lines.push(`阶段节奏：${this.stage.tempo}${tempoDef ? '（' + tempoDef.desc + '）' : ''}`);
            // 扁平定位当前 node
            let acc = 0, nodeInfo = null;
            for (const n of this.stage.nodes) {
                if (this._turnIndex < acc + n.turns.length) { nodeInfo = { n, local: this._turnIndex - acc }; break; }
                acc += n.turns.length;
            }
            if (nodeInfo) {
                lines.push(`当前节点「${nodeInfo.n.title || '未命名'}」：${nodeInfo.n.goal}`);
                const cur = nodeInfo.n.turns[nodeInfo.local];
                const pacDef = OutlineDirector.PACINGS.find(p => p.key === cur.pacing);
                lines.push(`本轮目标（第${this._turnIndex + 1}/${this.flatTurns.length}轮）：${cur.goal}`);
                lines.push(`本轮节奏：${cur.pacing}${pacDef ? '（' + pacDef.desc + '）' : ''}——剧情推进应贴合该节奏形态`);
                const next = nodeInfo.n.turns[nodeInfo.local + 1];
                if (next) lines.push(`下一轮预告：${next.goal}`);
            } else if (this.exhausted) {
                lines.push('⚠️ 大纲轮次已耗尽：剧情可自然收束本阶段，建议 AI 以收束姿态推进并在方便时提出新的阶段方向');
            }
            return lines.join('\n');
        }
        removeByFloor(floor) {
            // 大纲是计划不是事实——不做按楼回滚（轮指针只进不退）
            return 0;
        }
        export() {
            return { stage: this.stage, turnIndex: this._turnIndex, turnFloor: this._turnFloor, history: this.history };
        }
        import(data) {
            if (data && typeof data === 'object') {
                this.stage = data.stage || null;
                this._turnIndex = Number(data.turnIndex) || 0;
                this._turnFloor = Number(data.turnFloor) || 0;
                this.history = Array.isArray(data.history) ? data.history : [];
            }
        }
    }

    // [v3.49] 吸收 memorybooks Topical Clip: 群像共同记忆（关系对为单位，归因式）
    // "Alice did X, Bob thought Y, both agreed Z"——归因清晰，不合并人格；
    // 只有单方知晓的事实时显式标注，不暗示共享认知（除非剧情支持）。
    class PairMemory {
        constructor() { this.pairs = []; }
        static _keyOf(a, b) {
            const x = normalizeCharName(a), y = normalizeCharName(b);
            return [x, y].sort().join('|');
        }
        /** 记录关系对共同经历的事件（归因式） */
        addEntry(a, b, floor, storyTime, attribution) {
            const ka = String(a || '').trim(), kb = String(b || '').trim();
            if (!ka || !kb || ka === kb) return false;
            const event = String(attribution?.event || '').trim();
            if (event.length < 4) return false;
            const key = PairMemory._keyOf(ka, kb);
            if (this.pairs.some(p => p.key === key && p.entries.some(e => e.event === event))) return false;
            let pair = this.pairs.find(p => p.key === key);
            if (!pair) {
                pair = { key, a: ka, b: kb, entries: [] };
                this.pairs.push(pair);
            }
            pair.entries.push({
                event: event.slice(0, 100),
                // 归因：谁做了什么、谁怎么想、共同约定（memorybooks 原则：不合并人格）
                actorDo: String(attribution?.actorDo || '').slice(0, 80),
                otherThink: String(attribution?.otherThink || '').slice(0, 80),
                bothAgreed: String(attribution?.bothAgreed || '').slice(0, 80),
                // 认知归属：只有单方知道的事实时显式标注
                knownBy: attribution?.knownBy === 'both' ? 'both' : 'one',
                floor: floor || 0,
                time: String(storyTime || '').slice(0, 30),
                timestamp: Date.now()
            });
            if (pair.entries.length > 20) pair.entries.shift();
            return true;
        }
        /** 从提取的 relationships + events 归因构建 */
        addFromExtracted(relationships, characters, floor, storyTime) {
            let n = 0;
            for (const rel of (relationships || []).slice(0, 6)) {
                const from = rel?.from || '', to = rel?.to || '';
                if (!from || !to) continue;
                if (this.addEntry(from, to, floor, storyTime, {
                    event: `关系确立/变化：${rel.type || '相关'}`,
                    actorDo: `${from} 对 ${to} 的态度：${rel.type}`,
                    knownBy: 'both'
                })) n++;
            }
            return n;
        }
        /** 注入：关系对的历史事件线（Topical Clip 风格） */
        toPrompt(presentChars) {
            if (!this.pairs.length) return '';
            const present = new Set((presentChars || []).map(c => normalizeCharName(c)));
            // 只注入在场角色相关的关系对
            const relevant = this.pairs.filter(p => present.has(p.a) || present.has(p.b));
            if (!relevant.length) return '';
            const rows = [];
            for (const pair of relevant.slice(-5)) {
                const recent = pair.entries.slice(-3);
                for (const e of recent) {
                    let line = `- ${pair.a} × ${pair.b}：${e.event}`;
                    if (e.actorDo) line += `｜${e.actorDo}`;
                    if (e.otherThink) line += `｜${e.otherThink}`;
                    if (e.bothAgreed) line += `｜共同：${e.bothAgreed}`;
                    if (e.knownBy === 'one') line += '｜⚠️仅单方知晓';
                    rows.push(line);
                }
            }
            return rows.length ? `[群像共同记忆·归因式]（关系对的共同经历，归因清晰；⚠️标注项仅单方知晓，另一方绝不知情）：\n${rows.join('\n')}` : '';
        }
        removeByFloor(floor) {
            let n = 0;
            for (const pair of this.pairs) {
                const before = pair.entries.length;
                pair.entries = pair.entries.filter(e => e.floor !== floor);
                n += before - pair.entries.length;
            }
            this.pairs = this.pairs.filter(p => p.entries.length > 0);
            return n;
        }
        export() { return { pairs: this.pairs }; }
        import(data) { if (data && Array.isArray(data.pairs)) this.pairs = data.pairs; }
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
        constructor() {
            this.STORAGE_KEY = 'lonsha_memory';
            this._isWriting = false;
            this._pendingWrite = null;
            this._revision = 0; // [v3.44] 乐观并发单调修订号 (Revision-based Optimistic Locking)
        }
        getRevision() {
            return this._revision;
        }
        setStateIfRevision(expectedRev, updateFn) {
            if (expectedRev != null && expectedRev < this._revision) {
                console.warn(`[${PLUGIN_NAME}] 状态更新被拒绝：版本冲突 (当前 rev: ${this._revision}, 请求 rev: ${expectedRev})`);
                return false;
            }
            if (typeof updateFn === 'function') updateFn();
            return true;
        }
        // [v3.40] 数据库级写入协调器 (Write Coalescing & Serialized Mutex)
        // [v3.44] 乐观并发修订号校验 (opts.expectedRevision)
        async save(chatId, data) {
            const opts = arguments[2] || {};
            if (!chatId || !data) return false;
            if (opts.expectedRevision != null && opts.expectedRevision < this._revision) {
                console.warn(`[${PLUGIN_NAME}] 存储写入被拒绝：检测到修订版本冲突 (当前 rev: ${this._revision}, 请求 rev: ${opts.expectedRevision})，防止旧快照覆盖最新状态`);
                return false;
            }
            this._revision += 1;
            const currentRev = this._revision;
            if (this._isWriting) {
                this._pendingWrite = { chatId, data, revision: currentRev };
                return true;
            }
            this._isWriting = true;
            try {
                let curChatId = chatId;
                let curData = data;
                while (curData) {
                    try {
                        const ctx = window.SillyTavern?.getContext?.();
                        if (ctx?.chatMetadata) {
                            // [v3.4] DB: 摘要骤减保护——存储前对比上一版，总量骤减（>50%且缺口≥20）先紧急备份再写
                            try {
                                const prev = ctx.chatMetadata.extensions?.[this.STORAGE_KEY]?.data;
                                const prevN = Array.isArray(prev?.summaries?.summaries) ? prev.summaries.summaries.length : (Array.isArray(prev?.summaries) ? prev.summaries.length : 0);
                                const nextN = Array.isArray(curData?.summaries?.summaries) ? curData.summaries.summaries.length : (Array.isArray(curData?.summaries) ? curData.summaries.length : 0);
                                if (prevN >= 30 && nextN < prevN * 0.5 && (prevN - nextN) >= 20) {
                                    console.warn(`[${PLUGIN_NAME}] 摘要骤减 ${prevN}→${nextN}，写紧急备份`);
                                    const eb = window.LonShaMemory?.emergency;
                                    if (eb?.save) await eb.save(curChatId, `摘要骤减 ${prevN}→${nextN}`, prev, { summaries: prevN });
                                }
                            } catch (e) { errLog(e, 'DB.骤减检测'); }
                            if (!ctx.chatMetadata.extensions) ctx.chatMetadata.extensions = {};
                            const stats = {
                                nodes: curData?.graph?.nodes?.length || 0,
                                edges: curData?.graph?.edges?.length || 0,
                                summaries: Array.isArray(curData?.summaries?.summaries) ? curData.summaries.summaries.length : (Array.isArray(curData?.summaries) ? curData.summaries.length : 0),
                                ts: Date.now()
                            };
                            ctx.chatMetadata.extensions[this.STORAGE_KEY] = {
                                version: VERSION,
                                revision: currentRev,
                                chatId: curChatId,
                                stats,
                                data: curData,
                                timestamp: Date.now()
                            };
                            if (ctx.saveChat) await ctx.saveChat(); else if (window.saveChat) await window.saveChat();
                        }
                    } catch (err) { console.error('保存失败:', err); }
                    if (this._pendingWrite) {
                        curChatId = this._pendingWrite.chatId;
                        curData = this._pendingWrite.data;
                        this._pendingWrite = null;
                    } else {
                        curData = null;
                    }
                }
            } finally {
                this._isWriting = false;
            }
            return true;
        }
        async load(chatId, opts = {}) {
            try {
                const ctx = window.SillyTavern?.getContext?.();
                const extData = ctx?.chatMetadata?.extensions?.[this.STORAGE_KEY];
                const data = extData?.data;
                if (extData?.revision != null) {
                    this._revision = Math.max(this._revision, Number(extData.revision) || 0);
                }
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
                    if (data.clock && engine.clock) engine.clock.import(data.clock);
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
                    if (typeof data.narrativeEntropy === 'number') engine._narrativeEntropy = data.narrativeEntropy;
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
    plugin.sanitizeJson = sanitizeJson;
    plugin.safeJsonParse = safeJsonParse;
    plugin.init().catch(err => console.error(`[${PLUGIN_NAME}] 初始化失败:`, err));
    window.LonShaMemory = plugin;
})();