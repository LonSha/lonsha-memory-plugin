/**
 * index-helpers.js — [v3.472 · L22-O1] index.js 拆分（两批）：无状态纯函数（第 1 批 10 个 / 238 行 + 第 2 批 15 个 / 301 行 = 25 个 / 539 行）
 *
 * 【为什么是这一簇】
 *   index.js 13546 行、单个 IIFE。拆它的第一刀不能挑“看着最简单的”，只能挑**实测能裸搬**的。
 *   对本件 241 个顶层函数逐个做自由标识符实测（剥注释与字符串后统计它引用了哪些 IIFE 局部名），
 *   依赖闭包为空且**声明唯一**的只有这 10 个：
 *     10 个零依赖：loadExtraJsScript / estimateTextTokens / hash32 / stripMemoryOpsTags /
 *                  extractTimeTagFast / sanitizeJson / cyclePositionFor / _initEbbingMeta /
 *                  ledgerClip / parseStoryDateLoose
 *     1 个只依赖本簇内：safeJsonParse（→ sanitizeJson）
 *   ★ 为什么不是 12 个：parseStoryDateLoose 在本件里被**声明了两次**（列首一个、
 *     缩进 4 的一个，后定义覆盖前定义），storyDayDiff 又依赖它。同名双声明是
 *     “同名不同物”，搬走它会让剩下的那一份变成唯一的实现 —— 那是**改语义**，不是搬代码，
 *     故这两批都不碰它。
 *   其余函数都摸到了 IIFE 里的东西 —— 其中 175 个是 _moduleLib(...) 取库，
 *   那意味着“搬走它”要先回答“库怎么拿”，不属于第一簇。
 *
 * 【搬法】
 *   函数体**逐字节照搬**（每段 sha256 落账在 tests/audit/index_helpers_baseline.json，由闸比对）。
 *   index.js 里删掉定义，改从本模块取同名绑定 —— 调用点一行没改。
 *   取库走仓内既有约：_moduleLib(() => window.LonShaIndexHelpers, 'index-helpers.js')，
 *   缺席归因复用 _noteModuleFailure / _moduleFailureSnapshot，不自写 catch 吞错。
 *
 * 【不许做的事】
 *   ★ 在 index.js 里留同形兜底实现（那就是第二份实现，本仓反复治过的那类）。
 *   ★ 顺手改函数体（闸比对 sha256，会红）。
 */

(function (global) {
    'use strict';

    /* ——— loadExtraJsScript ———（自 index.js L477–L489 逐字节搬迁；改它必须同时改基线台账） */
    /** 注入一个 extra_js 模块（浏览器原生解析器；失败即 reject，**不吞**）。 */
    function loadExtraJsScript(url) {
        return new Promise((resolve, reject) => {
            try {
                const s = document.createElement('script');
                s.type = 'module';
                s.src = url;
                s.onload = () => resolve(true);
                s.onerror = () => reject(new Error('script-error'));
                document.head.appendChild(s);
            } catch (e) { reject(e); }
        });
    }

    /* ——— estimateTextTokens ———（自 index.js L524–L536 逐字节搬迁；改它必须同时改基线台账） */
    // [v3.128] token 量级估算（baibai bytes/3.35 口径 + CJK 感知）：中文 UTF-8 每字 3 字节 ≈ 0.9 token，
    // ASCII/数字约 4 字符 1 token。此前引擎仅在 PrequelSystem 内用 chars/4 的乐观口径，对中文正文低估约 3.5 倍。
    function estimateTextTokens(text) {
        const s = String(text || '');
        if (!s) return 0;
        let cjk = 0;
        for (let i = 0; i < s.length; i++) {
            const c = s.codePointAt(i);
            if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x3400 && c <= 0x4dbf) || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xf900 && c <= 0xfaff)) cjk++;
        }
        const rest = s.length - cjk;
        return Math.max(1, Math.ceil(cjk * 0.9 + rest / 4));
    }

    /* ——— hash32 ———（自 index.js L537–L545 逐字节搬迁；改它必须同时改基线台账） */
    // [v3.3] 台账重放化：楼层指纹（位置无关的消息身份）——编辑/swipe/删楼后对账用。
    // 范式: baibai 叶子 leafValid（失效≠删除）+ yuzuki getMessageSignature（role|swipe|hash|gen）。
    // 与楼层号解耦: 删楼后消息前移，指纹仍能重新定位（自愈）；翻 swipe 时 swipe 段变化（失活/复活）。
    function hash32(str) {
        let h = 0x811c9dc5;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
        return (h >>> 0).toString(16).padStart(8, '0');
    }

    /* ——— stripMemoryOpsTags ———（自 index.js L795–L805 逐字节搬迁；改它必须同时改基线台账） */
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

    /* ——— extractTimeTagFast ———（自 index.js L807–L819 逐字节搬迁；改它必须同时改基线台账） */
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

    /* ——— sanitizeJson ———（自 index.js L853–L999 逐字节搬迁；改它必须同时改基线台账） */
    // [v3.18] JSON sanitizer（shujuku/baibai）: 全角引号归一 + 未转义引号修复
    // [v3.44] 吸收 shujuku: 字符流状态机 JSON 容错解析器 (Robust Stream Sanitizer)
    // [v3.469.0 · 借鉴 shujuku 1.3.7「JSON 清洗保留字符串正文」]
    //   结构感知归一化：只归一化「字符串外部」的结构位；字符串内部的一律原样保留。
    //   旧版全局替换 “ ” 「 」 ， ： ； 会把台词原文改形——清洗器自己破坏记忆正文。
    //   直引号歧义沿用前瞻判定：后随结构位（, : } ]）才视为关引号，否则当内容转义保留。
    function sanitizeJson(raw) {
        try {
            if (!raw) return '';
            let s = String(raw).trim();
            if (!s) return '';

            // 1. 引号结构状态机（第一遍）：直引号 / 全角弯引号 / 直角引号定界 + 结构位标点归一化
            const OPENERS = new Map([['"', '"'], ['“', '”'], ['「', '」']]);
            let out = '';
            let inStr = false;
            let closer = '';
            let escaped = false;
            for (let i = 0; i < s.length; i++) {
                const ch = s[i];
                if (inStr) {
                    if (closer === '"' && !escaped && ch === '\\') { out += ch; escaped = true; continue; }
                    if (escaped) { out += ch; escaped = false; continue; }
                    if (ch === closer) {
                        if (closer === '"') {
                            let nextNonSpace = '';
                            for (let j = i + 1; j < s.length; j++) {
                                const nc = s[j];
                                if (nc !== ' ' && nc !== '\t' && nc !== '\n' && nc !== '\r') { nextNonSpace = nc; break; }
                            }
                            if (!nextNonSpace || nextNonSpace === ',' || nextNonSpace === ':' || nextNonSpace === '}' || nextNonSpace === ']') {
                                inStr = false; out += '"'; continue;
                            }
                            out += '\\\"'; continue;   // 字符串内部裸引号：转义保留原文
                        }
                        inStr = false; out += '"'; continue;  // 全角/直角关引号 → 结构位 "
                    }
                    /* [v3.472.0 修·混用定界] «弯/直角开引号 + 直引号收尾» 的混用形态。
                     *   修前本行无条件把串内直引号当「裸引号」转义，于是 `“count"` 这类写法永远收不了尾，
                     *   整段被当成一个未闭合字符串吞掉（实测 v344 的 raw4 当场解析成 null）。
                     *   判法与该串自己的收尾判据同源：后面第一个非空白是结构位 ⇒ 它就是收尾。
                     *   为什么不一律收尾：`他说 "好" 然后` 这类真·串内裸引号必须继续转义保留，
                     *   那正是 v3.469.0 修过的形态，两者只能按后续字符分。 */
                    if (closer !== '"' && ch === '"') {
                        let nextNS = '';
                        for (let j = i + 1; j < s.length; j++) {
                            const nc = s[j];
                            if (nc !== ' ' && nc !== '\t' && nc !== '\n' && nc !== '\r') { nextNS = nc; break; }
                        }
                        if (!nextNS || nextNS === ',' || nextNS === ':' || nextNS === '}' || nextNS === ']') {
                            inStr = false; out += '"'; continue;
                        }
                        out += '\\"'; continue;
                    }
                    out += ch;   // 字符串内部：原样保留（含 ，：；‘’“”「」）
                    continue;
                }
                if (OPENERS.has(ch)) { inStr = true; closer = OPENERS.get(ch); out += '"'; continue; }
                if (ch === '”' || ch === '」') { out += '"'; continue; }   // 孤立关引号防串位
                if (ch === '，') { out += ','; continue; }
                if (ch === '：') { out += ':'; continue; }
                if (ch === '；') { out += ';'; continue; }
                out += ch;
            }
            s = out;

            // 2. 单引号第二遍：字符串外部的 ' 归一为 "（词内撇号 don't 与串内 '原文' 保留）
            out = '';
            let inDq = false;
            let inSq = false;
            escaped = false;
            for (let i = 0; i < s.length; i++) {
                const ch = s[i];
                if (inDq) {
                    if (escaped) { out += ch; escaped = false; continue; }
                    if (ch === '\\') { out += ch; escaped = true; continue; }
                    if (ch === '"') {
                        let nextNonSpace = '';
                        for (let j = i + 1; j < s.length; j++) {
                            const nc = s[j];
                            if (nc !== ' ' && nc !== '\t' && nc !== '\n' && nc !== '\r') { nextNonSpace = nc; break; }
                        }
                        if (!nextNonSpace || nextNonSpace === ',' || nextNonSpace === ':' || nextNonSpace === '}' || nextNonSpace === ']') {
                            inDq = false; out += ch; continue;
                        }
                        out += '\\\"'; continue;
                    }
                    out += ch; continue;   // 直引号串内：' 与其余字符都是内容
                }
                if (inSq) {
                    if (ch === "'") {
                        let nextNonSpace = '';
                        for (let j = i + 1; j < s.length; j++) {
                            const nc = s[j];
                            if (nc !== ' ' && nc !== '\t' && nc !== '\n' && nc !== '\r') { nextNonSpace = nc; break; }
                        }
                        if (!nextNonSpace || nextNonSpace === ',' || nextNonSpace === ':' || nextNonSpace === '}' || nextNonSpace === ']') {
                            inSq = false; out += '"'; continue;
                        }
                        out += ch; continue;   // 词内撇号/内容
                    }
                    if (ch === '"') { out += '\\\"'; continue; }   // 单引号串内的直引号需转义
                    out += ch; continue;
                }
                if (ch === '"') { inDq = true; out += ch; continue; }
                if (ch === "'") { inSq = true; out += '"'; continue; }
                out += ch;
            }
            s = out;

            // 3. 剥离外层闲聊废话与 Markdown 围栏
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

            // 4. 清除对象/数组尾部多余的逗号（悬挂逗号：, } 或 , ]）
            s = s.replace(/,\s*([}\]])/g, '$1');

            // 5. 修复未加引号的纯英文字母对象键（如 { name: "value" } -> { "name": "value" }）
            s = s.replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":');

            return s.trim();
        } catch (e) {
            return String(raw || '').trim();
        }
    }

    /* ——— safeJsonParse ———（自 index.js L1000–L1011 逐字节搬迁；改它必须同时改基线台账） */
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

    /* ——— cyclePositionFor ———（自 index.js L1887–L1890 逐字节搬迁；改它必须同时改基线台账） */
    function cyclePositionFor(aiReplyCount, len) {
        if (!len || len <= 0 || aiReplyCount <= 0) return 0;
        return ((aiReplyCount - 1) % len) + 1;
    }

    /* ——— _initEbbingMeta ———（自 index.js L2005–L2015 逐字节搬迁；改它必须同时改基线台账） */
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

    /* ——— ledgerClip ———（自 index.js L2087–L2091 逐字节搬迁；改它必须同时改基线台账） */
    function ledgerClip(v, max) {
        if (v === undefined || v === null) return undefined;
        const s = String(v).replace(/\s+/g, ' ').trim();
        return s.length > max ? s.slice(0, max) : s;
    }
    /* ================================================================
     * 【第 2 批 · b2】15 个「闭包已满足 + 声明唯一 + 无 this + 非装载期调用」的函数
     *   判据不是「看着简单」，而是对拆完第 1 批之后的 index.js 重算依赖闭包：
     *   闭包里剩余的 IIFE 局部名**只允许**是第 1 批已搬走的那些。
     *   同名双声明的 parseStoryDateLoose 仍不搬（语义决定，不是搬运）；numOr 装载期可达，同样不搬。
     *   逐字节搬迁；每段 sha256 落账（tests/audit/index_helpers_baseline.json）。
     * ================================================================ */
    /* ——— compareVersion ———（自 index.js L337–L347 逐字节搬迁；改它必须同时改基线台账） */
    function compareVersion(a, b) {
        const pa = String(a == null ? '' : a).split('.').map(x => parseInt(x, 10));
        const pb = String(b == null ? '' : b).split('.').map(x => parseInt(x, 10));
        const n = Math.max(pa.length, pb.length);
        for (let i = 0; i < n; i++) {
            const x = Number.isFinite(pa[i]) ? pa[i] : 0;
            const y = Number.isFinite(pb[i]) ? pb[i] : 0;
            if (x !== y) return x < y ? -1 : 1;
        }
        return 0;
    }

    /* ——— _getCredKey ———（自 index.js L353–L356 逐字节搬迁；改它必须同时改基线台账） */
    function _getCredKey(url, init, opts) {
        const key = opts?.apiKey || (init?.headers?.Authorization || init?.headers?.authorization || '').replace(/^Bearer\s+/i, '');
        return key ? hash32(String(url || '') + '|' + String(key)) : (url ? hash32(String(url)) : null);
    }

    /* ——— msgTextOf ———（自 index.js L553–L559 逐字节搬迁；改它必须同时改基线台账） */
    function msgTextOf(m) {
        try {
            const sw = Math.max(0, Math.round(Number(m?.swipe_id) || 0));
            if (Array.isArray(m?.swipes) && typeof m.swipes[sw] === 'string') return m.swipes[sw];
            return String(m?.mes || m?.content || m?.text || '');
        } catch (e) { return ''; }
    }

    /* ——— thinkingAnchorHeader ———（自 index.js L623–L626 逐字节搬迁，含上方紧贴注释 1 行；改它必须同时改基线台账） */
    // [v3.13] 思维链投递头框定（抄 zhino 锚点构造——防草稿被下游当已发生事实）
    function thinkingAnchorHeader() {
        return '【思维链·场外信号（仅供检索参考，其中构思/模拟/内心独白段落尚未发生，严禁当作剧情事实写入摘要/时间线/图谱）】';
    }

    /* ——— extractMemoryOpsFromText ———（自 index.js L641–L698 逐字节搬迁，含上方紧贴注释 1 行；改它必须同时改基线台账） */
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

    /* ——— buildNpcTierInjection ———（自 index.js L699–L726 逐字节搬迁，含上方紧贴注释 1 行；改它必须同时改基线台账） */
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

    /* ——— classifyRelationshipType ———（自 index.js L759–L771 逐字节搬迁，含上方紧贴注释 1 行；改它必须同时改基线台账） */
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

    /* ——— _formatBindDepsRow ———（自 index.js L1625–L1656 逐字节搬迁，含上方紧贴注释 7 行；改它必须同时改基线台账） */
    /** [v3.277.0 O7] 依赖注入诊断行的**纯函数**格式化面：selfCheck 调用它，判据也真跑它。
     *  为什么必须抽成纯函数：诊断行若只住在 selfCheck 的内联 IIFE 里，
     *  就只能靠读源码判断、无法被真跑（本仓治理过多轮的「判据只能文本推断」形态）。
     *  抽出后同一段逻辑既被 selfCheck 用，也能被判据用 new Function 真跑三态：
     *  破坏它（如把失败项过滤改成空数组）能让判据当场翻红。
     *  入参：constructRead（构造期三态数组或 null）、rebindRead（装载后重绑三态数组或 null）。
     *  返回：[标题, 值] 两元组（与 selfCheck 的 rows 元素同形）。 */
    function _formatBindDepsRow(constructRead, rebindRead) {
        const fmt = (r) => r.map((x) => x.tag + ' ' + x.swapped).join(' · ');
        const badOf = (r) => r.filter((x) => !x || x.ok !== true);
        const reb = Array.isArray(rebindRead) ? rebindRead : null;
        if (reb) {
            const bad = badOf(reb);
            const total = reb.reduce((a, x) => a + (Number(x && x.swapped) || 0), 0);
            if (!bad.length) {
                const c0 = Array.isArray(constructRead) ? constructRead : [];
                const c0bad = badOf(c0).length;
                return ['依赖注入', fmt(reb) + '（共换 ' + total + ' 项）'
                    + (c0bad ? '；构造期 ' + c0bad + ' 处因 extra_js 未装载而缺席，装载后已补齐' : '')];
            }
            return ['依赖注入', '⚠ 装载后仍有 ' + bad.length + '/' + reb.length + ' 处未注入：'
                + bad.map((x) => (x && x.tag ? x.tag : '?') + '（' + ((x && x.why) || '未知') + '）').join(' · ')
                + ' · 成功处 ' + fmt(reb.filter((x) => x && x.ok === true))];
        }
        const r = Array.isArray(constructRead) ? constructRead : null;
        if (!r) return ['依赖注入', '—（尚未走到构造期，未注入）'];
        const bad = badOf(r);
        if (!bad.length) return ['依赖注入', fmt(r) + '（共换 ' + r.reduce((a, x) => a + (Number(x.swapped) || 0), 0) + ' 项）'];
        return ['依赖注入', '⚠ ' + bad.length + '/' + r.length + ' 处未注入（构造期）：'
            + bad.map((x) => (x && x.tag ? x.tag : '?') + '（' + ((x && x.why) || '未知') + '）').join(' · ')
            + ' · 模块装载后未重绑'];
    }

    /* ——— parseStoryTimeConstraint ———（自 index.js L1711–L1740 逐字节搬迁，含上方紧贴注释 3 行；改它必须同时改基线台账） */
    // [v3.23] 剧情时间约束解析（NE-Memory parseTimeConstraint 移植）
    // 从 recall 查询中解析出时间约束（Day X / 月 / ISO 日期 / 相对时间），
    // 供 timeline 召回前做时间过滤——"那天/周二/5月 发生了什么"这类查询也能命中时间线
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

    /* ——— filterTimelineByConstraint ———（自 index.js L1741–L1788 逐字节搬迁，含上方紧贴注释 1 行；改它必须同时改基线台账） */
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

    /* ——— isSystemHiddenMsg ———（自 index.js L1789–L1796 逐字节搬迁，含上方紧贴注释 2 行；改它必须同时改基线台账） */
    // [v3.19] 系统隐藏消息识别（ruby reader.js isSystemHiddenMsg）:
    // ST 安静生成的消息 is_system=true 但非 user 且非空 → 是 AI 回复（须计入楼层指纹/AI 楼层序数）
    function isSystemHiddenMsg(m) {
        if (!m) return false;
        if (m.is_system !== true) return false;
        if (m.is_user === true) return false;
        return !!(m.name && String(m.mes || '').trim().length > 0);
    }

    /* ——— decayScore ———（自 index.js L1799–L1824 逐字节搬迁，含上方紧贴注释 3 行；改它必须同时改基线台账） */
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

    /* ——— ledgerItemKey ———（自 index.js L1884–L1894 逐字节搬迁，含上方紧贴注释 1 行；改它必须同时改基线台账） */
    /** 键名归一（与 MemoryEngine.normalizeItemKey / _sanitizeItemOp 同源规则） */
    function ledgerItemKey(name) {
        try {
            return String(name || '')
                .normalize('NFKC')
                .replace(/[\u300a\u300b\u3010\u3011\[\]\uff08\uff09\(\)\u0022\u0027\u201c\u201d\u2018\u2019\u3008\u3009]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
        } catch (e) { return String(name || '').trim().toLowerCase(); }
    }

    /* ——— repairReceipt ———（自 index.js L13002–L13035 逐字节搬迁，含上方紧贴注释 7 行；改它必须同时改基线台账） */
    /**
     * [v3.214.0] R1-F：受控写入面的**恒定回执**（唯一构造点）。
     *   下游按 shape 编程（先看 `ok`，再按 `reason` 分诊）。若某个分支少写三个键，
     *   那份回执就与其它回执**形状不同** ——「字段缺失」于是再次与「字段是空」同形
     *   （本仓九账证据面刚治理过的正是这一形态）。故所有分支一律经此构造。
     *   9 个键一个不少，失败分支与成功分支同形，只有「没给」才取默认值。
     */
    function repairReceipt(extra) {
        const e = extra || {};
        /* [v3.295.0 · X2] 回执从 **9 键扩到 13 键**。为什么不是「只给 applyPlan 加三个键」：
         *   v3215 的 `assertReceiptShape` 钉的是「**同一命名空间内所有方法**回执键集逐字相同」，
         *   它的本意是「失败分支与成功分支不同形」——只给新方法加键，会让命名空间里出现
         *   两种形状，那正是该判据要防的。故新读数一律**全体方法都有**，恒定给默认值：
         *     · applied  —— 落笔改到的项数（其余方法恒 0）；
         *     · verified —— 原数据核验通过的项数（其余方法恒 0）；
         *     · readback —— 持久化回读的结论：true / false / **null**（没尝试）。
         *                  三态而非布尔：「没尝试」与「试了失败」不同形（本仓同族纪律）。
         *     · items    —— 逐项结局（落笔才有内容；其余方法恒空数组，**不是 undefined**）。 */
        return {
            ok: !!e.ok,
            reason: e.reason || '',
            repairId: e.repairId != null ? e.repairId : null,
            action: e.action || '',
            affected: Array.isArray(e.affected) ? e.affected : [],
            total: Number.isFinite(e.total) ? e.total : 0,
            revision: Number.isFinite(e.revision) ? e.revision : 0,
            replayed: !!e.replayed,
            applied: Number.isFinite(e.applied) ? e.applied : 0,
            verified: Number.isFinite(e.verified) ? e.verified : 0,
            readback: (e.readback === true) ? true : (e.readback === false ? false : null),
            items: Array.isArray(e.items) ? e.items : [],
            at: Date.now(),
        };
    }

    /* ——— opLogStatsCompat ———（自 index.js L13332–L13346 逐字节搬迁；改它必须同时改基线台账） */
    function opLogStatsCompat(engine) {
        // [v3.169] 账本自述面：旧实现把「没有账本」「stats 缺失」与「统计抛错」三种处境
        //   一律返回 {total:0, byType:{}}——与「真的 0 条事件」完全同形。读者拿到的那个 0
        //   可能来自三种完全不同的处境，而它看起来一模一样：这是「静默降级」在读取侧的形态。
        //   「有无读取接口」与「读得出来吗」是两件事，故分两态：
        //     absent —— 账本对象或其 stats 接口不存在（从读取方看就是没有账本）
        //     error  —— 接口在但要不出结果（抛错）
        const readable = !!engine?.opLog && typeof engine.opLog.stats === 'function';
        if (!readable) return { total: 0, byType: {}, absent: true };
        try {
            const st = engine.opLog.stats();
            if (!st || typeof st !== 'object') return { total: 0, byType: {}, absent: true };
            return st;
        } catch (e) { return { total: 0, byType: {}, error: String(e?.message || e) }; }
    }

    const api = {
        loadExtraJsScript,
        estimateTextTokens,
        hash32,
        stripMemoryOpsTags,
        extractTimeTagFast,
        sanitizeJson,
        safeJsonParse,
        cyclePositionFor,
        _initEbbingMeta,
        ledgerClip,
        compareVersion,
        _getCredKey,
        msgTextOf,
        thinkingAnchorHeader,
        extractMemoryOpsFromText,
        buildNpcTierInjection,
        classifyRelationshipType,
        _formatBindDepsRow,
        parseStoryTimeConstraint,
        filterTimelineByConstraint,
        isSystemHiddenMsg,
        decayScore,
        ledgerItemKey,
        repairReceipt,
        opLogStatsCompat,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaIndexHelpers = api;
})(typeof window !== 'undefined' ? window : globalThis);
