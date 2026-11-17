/**
 * index-helpers.js — [v3.472 · L22-O1] index.js 拆分第一簇：无状态纯函数（10 个 / 238 行）
 *
 * 【为什么是这一簇】
 *   index.js 13546 行、单个 IIFE。拆它的第一刀不能挑“看着最简单的”，只能挑**实测能裸搬**的。
 *   对本件 241 个顶层函数逐个做自由标识符实测（剥注释与字符串后统计它引用了哪些 IIFE 局部名），
 *   依赖闭包为空且**声明唯一**的只有这 10 个：
 *     10 个零依赖：loadExtraJsScript / estimateTextTokens / hash32 / stripMemoryOpsTags /
 *                  extractTimeTagFast / sanitizeJson / cyclePositionFor / _initEbbingMeta /
 *                  ledgerClip / parseStoryDateLoose
 *     1 个只依赖本簇内：safeJsonParse（→ sanitizeJson）
 *   ★ 为什么不是 12 个：parseStoryDateLoose 在本件里被**声明了两次**（L1839 列首一个、
 *     L11661 缩进 4 的一个，后定义覆盖前定义），storyDayDiff 又依赖它。同名双声明是
 *     “同名不同物”，搬走它会让剩下的那一份变成唯一的实现 —— 那是**改语义**，不是搬代码，
 *     故这一簇不碰它。
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
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaIndexHelpers = api;
})(typeof window !== 'undefined' ? window : globalThis);
