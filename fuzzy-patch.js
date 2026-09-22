/* ========================================================
 * fuzzy-patch.js — [v3.184.0] 归一化补丁匹配（占位符填充失配时的宽容回退）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   本插件有 8 处「把值填进用户可编辑模板」的落点，全部写成字面 replace：
 *     index.js:3586-3591  KNOWN_CHARS / HISTORY / SUSPENSE / LOCKED_FACTS / SCENES / CONTENT
 *     index.js:3768-3769  LORE / ROLE_COUNT
 *   模板来自 settings-ui.js 的 `<textarea id="ls-prompt">`（用户可直接改）与
 *   `<textarea id="ls-roles-prompt">`。用户在编辑器里粘贴/输入时，
 *   `{{KNOWN_CHARS}}` 极易被输入法或复制源换成 `{{KNOWN_CHARS}}`（全角花括号）、
 *   `{{ KNOWN_CHARS }}`（带空格）等形态——**字面 replace 一次都不命中**。
 *   修前后果不是报错，是**静默**：
 *     · 占位符原样留在 prompt 里，连同 `{{KNOWN_CHARS}}` 一起发给 LLM
 *       （模型看到的是模板语法而不是角色名单）；
 *     · 返回值 `prompt` 非空、调用链不抛、日志一行没有——功能「接上了但永远空转」。
 *   同族的第二处静默：`String.replace(str, val)` 里若 val 含 `$&`/`$1` 这类序列，
 *   会被当替换模式解释并吃掉原文（正文含 `$&` 就不再是正文）。
 *
 *   nocturne_memory 的 backend/text_patch.py 正是治这个：LLM 回读记忆正文再重发时
 *   会带入弯引号/破折号变体与行尾空白差异，它用 NFC + 字符映射 + 位置映射做
 *   归一化匹配回退，并靠「恰好一个命中」闸门防歧义。
 *
 *   本模块取其**机制**，按 LonSha 规范重写：
 *     · 精确命中优先（零风险路径）；精确 0 命中才走归一化回退。
 *     · 归一化回退**唯一性闸门**：恰好一个命中才替换；0 个或 ≥2 个一律拒绝并报因。
 *       歧义时猜一个 = 改错地方，比不改更糟。
 *     · 缩进守卫：命中若滑进别的行的纯缩进区（前缀全是空格/制表符）则判无效——
 *       候选开头的空格可能恰好对齐到更深一层的缩进里，替换会静默破坏缩进结构。
 *     · 换行风格保持：内容用 CRLF、新文本用 LF 时，把新文本转成 CRLF 再落，
 *       不让一次替换把整份内容的换行风格搅混。
 *     · 替换值一律用函数形式（`() => val`），杜绝 `$&` 被当替换模式。
 *     · 不抛：本模块跑在提取路径上（每轮生成前），抛一次会连坐整轮提取。
 *
 * 【与 canonical-stringify.js 的分工（方向相反，不可混用）】
 *   canonical-stringify  做**哈希**：必须逐字节敏感，任何宽容都会让指纹碰撞
 *   fuzzy-patch          做**匹配**：必须宽容到能认出「同一个占位符的变体写法」
 *   两者都处理「文本等价性」，但一个要求「不同的必须不同」，一个要求「相同的能认出」。
 *   故本模块的宽容只用于**定位**，绝不用于**判定两个存档是否同一状态**。
 *
 * 【比源实现更严的一处（有意为之）】
 *   源实现开头就把整份 content NFC 化后再定位，返回的也是 NFC 后的内容
 *   —— 替换一个占位符会连带改动正文里所有非 NFC 字符（未触碰处也被改）。
 *   本模块相反：内容非 NFC 时**整个补丁拒绝**（reason='content-not-nfc'），
 *   保证「除替换区间外，原文逐字节不变」。宁可这次不填，也不静默改写用户正文。
 *
 * 【可移植性说明】
 *   机制出处：nocturne_memory（Dataojitori/nocturne_memory）backend/text_patch.py。
 *   实现按本仓规范重写（零依赖、不抛、fail-closed、位置映射、I6 读数），未复制其代码。
 */
(function (root) {
    'use strict';
    const PATCH_VERSION = 1;
    // 弯引号 / 破折号 / 全角变体 → ASCII。1 对 1，不改变长度（位置映射因此保持成立）。
    //   刻意**不**映射中文引号「」『』：中文语境下它们与 " 不完全等价（有时充当书名号），
    //   映射会误伤正文。只映射「同一个符号的不同编码写法」这一类真变体。
    const NORM_CHAR_MAP = {
        '\u201c': '"', '\u201d': '"', '\u00ab': '"', '\u00bb': '"', '\uff02': '"',
        '\u2018': "'", '\u2019': "'", '\u00b4': "'", '\uff07': "'",
        '\u2013': '-', '\u2014': '-', '\u2015': '-', '\uff0d': '-',
    };
    // 占位符残留扫描的上报上限（有界：残留可能上百，读数只需要知道「有、大概多少」）。
    const MAX_LEFTOVER_REPORT = 5;

    function mapChar(ch) {
        return Object.prototype.hasOwnProperty.call(NORM_CHAR_MAP, ch) ? NORM_CHAR_MAP[ch] : ch;
    }
    function normStr(v) { return String(v == null ? '' : v); }
    function toNfc(s) {
        try { return String(s).normalize('NFC'); } catch (_e) { return String(s); }
    }
    function isNfc(s) {
        try { return String(s).normalize('NFC') === String(s); } catch (_e) { return false; }
    }
    function countOccurrences(hay, needle) {
        const h = normStr(hay), n = normStr(needle);
        if (!n) return 0;
        let c = 0, i = 0;
        while ((i = h.indexOf(n, i)) !== -1) { c++; i += n.length; }
        return c;
    }

    /**
     * 归一化并建立位置映射（纯函数、不抛）。
     * @returns {{text:string, posMap:number[], collapsedFirstLine:boolean}}
     *   posMap[i] = 归一化文本第 i 个字符来自**输入**的哪个下标。
     *   步骤：去行尾空白 → 折叠连续空格（保护缩进）→ 变体字符映射。
     *   **输入假定已是 NFC**（调用方先验，见 applyPatch 的 content-not-nfc 纪律）。
     * @param {{preserveFirstLineIndent?:boolean}} opts
     *   false 表示「首行的前导空白按普通行内空格折叠」——用于候选片段首行可能从行中间开始的情形。
     */
    function normalizeWithPositions(text, opts) {
        const o = opts || {};
        const preserveFirstLineIndent = o.preserveFirstLineIndent !== false;
        const lines = normStr(text).split('\n');
        const out = [];
        const posMap = [];
        let offset = 0;
        for (let li = 0; li < lines.length; li++) {
            const original = lines[li];
            if (li > 0) { out.push('\n'); posMap.push(offset - 1); }
            let line = original;
            if (line.length && line.charAt(line.length - 1) === '\r') line = line.slice(0, -1);
            let contentEnd = line.length;
            while (contentEnd > 0 && (line.charAt(contentEnd - 1) === ' ' || line.charAt(contentEnd - 1) === '\t')) contentEnd--;
            // 首行缩进是否受保护：保护 = 把前导空白当结构；不保护 = 当普通行内空格折叠。
            const protectIndent = (li > 0) || preserveFirstLineIndent;
            let leadingWs = 0;
            if (protectIndent) {
                for (let ci = 0; ci < contentEnd; ci++) {
                    const c = line.charAt(ci);
                    if (c === ' ' || c === '\t') leadingWs++; else break;
                }
            }
            let prevSpace = false;
            for (let ci = 0; ci < contentEnd; ci++) {
                let ch = mapChar(line.charAt(ci));
                if (ci < leadingWs) { out.push(ch); posMap.push(offset + ci); continue; }
                if (ch === ' ') { if (prevSpace) continue; prevSpace = true; } else prevSpace = false;
                out.push(ch);
                posMap.push(offset + ci);
            }
            offset += original.length + 1;
        }
        return { text: out.join(''), posMap: posMap, collapsedFirstLine: !preserveFirstLineIndent };
    }

    /**
     * 在归一化内容里找候选的全部**有效**命中（纯函数、不抛）。
     * 无效 = 命中滑进了某一行的纯缩进区（该行从行首到命中点全是空白），
     *   而候选首行又有前导空白——两个空白计数偶然对上，替换会静默破坏缩进。
     */
    function findValidMatches(normContent, candidate, indentCollapsed) {
        const hits = [];
        const firstLine = normStr(candidate).split('\n', 1)[0];
        const couldSlide = firstLine.length > 0 && (firstLine.charAt(0) === ' ' || firstLine.charAt(0) === '\t');
        let start = 0, pos = 0;
        while ((pos = normStr(normContent).indexOf(candidate, start)) !== -1) {
            let valid = true;
            if (couldSlide) {
                let lineStart = normContent.lastIndexOf('\n', pos - 1);
                lineStart = lineStart === -1 ? 0 : lineStart + 1;
                const prefix = normContent.slice(lineStart, pos);
                let inIndent = true;
                for (let k = 0; k < prefix.length; k++) {
                    const c = prefix.charAt(k);
                    if (c !== ' ' && c !== '\t') { inIndent = false; break; }
                }
                if (inIndent) {
                    if (indentCollapsed) { if (prefix.length > 0) valid = false; }
                    else { if (pos !== lineStart) valid = false; }
                }
            }
            if (valid) hits.push({ idx: pos, len: candidate.length, collapsed: !!indentCollapsed });
            start = pos + 1;
        }
        return hits;
    }

    /**
     * 归一化补丁（唯一性闸门）。恰好一个有效命中才返回结果，否则 null。
     * @returns {{idx:number, len:number}|null}
     */
    function findUniqueNormalizedMatch(content, oldString) {
        let normContent, posMap;
        try {
            const n = normalizeWithPositions(content, { preserveFirstLineIndent: true });
            normContent = n.text; posMap = n.posMap;
        } catch (_e) { return null; }
        if (!posMap.length) return null;
        const all = [];
        const presets = [true, false];
        for (const preserve of presets) {
            let candidate;
            try { candidate = normalizeWithPositions(toNfc(oldString), { preserveFirstLineIndent: preserve }).text; }
            catch (_e) { continue; }
            if (!candidate) continue;
            const hits = findValidMatches(normContent, candidate, !preserve);
            for (const h of hits) {
                // 同一位置 + 同一长度视为同一个命中（两种候选写法归一后相同）
                if (!all.some(x => x.idx === h.idx && x.len === h.len)) all.push(h);
            }
        }
        if (all.length !== 1) return null;
        // 坐标换算：把「归一化文本的下标区间」换回「原始内容的下标区间」
        const h = all[0];
        const origStart = posMap[h.idx];
        const matchEnd = h.idx + h.len;
        const origEnd = matchEnd < posMap.length ? posMap[matchEnd] : posMap[posMap.length - 1] + 1;
        if (typeof origStart !== 'number' || typeof origEnd !== 'number' || origEnd < origStart) return null;
        // 让替换区间吞掉可能的 CR（避免留下孤立的 \r）
        let s = origStart, e = origEnd;
        const c = normStr(content);
        if (e < c.length && c.charAt(e) === '\n' && e > 0 && c.charAt(e - 1) === '\r') e -= 1;
        if (s < c.length && c.charAt(s) === '\n' && s > 0 && c.charAt(s - 1) === '\r') s -= 1;
        return { idx: s, len: e - s, normalized: true };
    }

    /**
     * 落一次补丁（纯函数、不抛）。
     * @param {string} content    原文
     * @param {string} oldString  要被替换掉的片段
     * @param {string} newString  新片段
     * @param {{normalize?:boolean}} opts  normalize:false 关闭归一化回退（只认精确命中）
     * @returns {{ok:boolean, text:string, mode:string, hits:number, reason?:string}}
     *   mode: 'exact' | 'normalized'| 'ambiguous' | 'notfound' | 'rejected'
     *   失败时 text 一律是**原文**（不改就是不改，绝不返回半改的结果）
     */
    /**
     * 让新文本的换行风格与内容一致（纯函数、不抛）。
     *   为什么必须两条路径共用一个：精确路径与归一化路径若各写一份，
     *   同一份内容落同一段文本会得到不同换行风格——「同一件事两套规则」。
     */
    function matchNewlines(content, newString) {
        const val = normStr(newString);
        if (val.indexOf('\n') === -1) return val;
        const lf = val.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        return normStr(content).indexOf('\r\n') !== -1 ? lf.replace(/\n/g, '\r\n') : lf;
    }

    function applyPatch(content, oldString, newString, opts) {
        const o = opts || {};
        const raw = normStr(content);
        const oldRaw = normStr(oldString);
        const newRaw = normStr(newString);
        if (!oldRaw) return { ok: false, text: raw, mode: 'rejected', hits: 0, reason: 'empty-old' };

        // ① 精确命中：唯一则直接替换（零风险路径）
        const exact = countOccurrences(raw, oldRaw);
        if (exact === 1) {
            const i = raw.indexOf(oldRaw);
            const _v = matchNewlines(raw, newRaw);
            return { ok: true, mode: 'exact', hits: 1, text: raw.slice(0, i) + _v + raw.slice(i + oldRaw.length) };
        }
        if (exact > 1) return { ok: false, text: raw, mode: 'ambiguous', hits: exact, reason: 'ambiguous-exact:' + exact };
        if (o.normalize === false) return { ok: false, text: raw, mode: 'notfound', hits: 0, reason: 'notfound' };

        // ② 归一化回退。先验：内容必须已是 NFC，否则坐标不可信（见文件头说明）
        if (!isNfc(raw)) return { ok: false, text: raw, mode: 'rejected', hits: 0, reason: 'content-not-nfc' };
        const m = findUniqueNormalizedMatch(raw, oldRaw);
        if (!m) {
            // 区分「零命中」与「多命中」：读数里两者含义完全不同（没写 vs 写重了）
            const probe = normalizeWithPositions(raw, { preserveFirstLineIndent: true });
            const cand = normalizeWithPositions(toNfc(oldRaw), { preserveFirstLineIndent: true }).text;
            const n = probe.text && cand ? countOccurrences(probe.text, cand) : 0;
            return { ok: false, text: raw, mode: n > 1 ? 'ambiguous' : 'notfound', hits: n, reason: n > 1 ? 'ambiguous-normalized:' + n : 'notfound-normalized' };
        }
        // 换行风格保持：与精确路径共用同一处换算（见 matchNewlines）
        const val = matchNewlines(raw, newRaw);
        return { ok: true, mode: 'normalized', hits: 1, text: raw.slice(0, m.idx) + val + raw.slice(m.idx + m.len) };
    }

    /**
     * 批量填模板占位符（纯函数、不抛）。供提示词填充使用。
     * 与裸 `.replace` 的两处**真修复**：
     *   ① 值用函数形式落，`$&` / `$1` 不再被当替换模式吃掉；
     *   ② 占位符出现多次时**全部**替换（旧 `.replace` 只换第一个，剩下的原样发给模型）
     *      并记为 mode='exact-all:N'——是修，不是悄悄行为改变。
     * @param {string} template
     * @param {Object<string,string>} tokens
     * @returns {{text:string, applied:string[], missed:string[], modes:Object, total:number, leftover:string[], leftoverMore:number}}
     */
    function patchTokens(template, tokens, opts) {
        const o = opts || {};
        const map = (tokens && typeof tokens === 'object') ? tokens : {};
        const keys = Object.keys(map);
        let text = normStr(template);
        const applied = [], missed = [], modes = {};
        for (const key of keys) {
            const tok = '{{' + key + '}}';
            const val = normStr(map[key]);
            const n = countOccurrences(text, tok);
            if (n === 1) { text = text.replace(tok, () => val); applied.push(key); modes[key] = 'exact'; continue; }
            if (n > 1) { text = text.split(tok).join(val); applied.push(key); modes[key] = 'exact-all:' + n; continue; }
            // 字面 0 命中 → 归一化回退（唯一命中才落，歧义不猜）
            const r = applyPatch(text, tok, val, o);
            if (r.ok) { text = r.text; applied.push(key); modes[key] = r.mode; continue; }
            missed.push(key + '(' + (r.reason || 'miss') + ')');
            modes[key] = r.mode;
        }
        // 残留扫描：填完之后模板里还有 {{...}} —— 用户写成了别的形态（全角/多空格/单括号）。
        //   旧实现对此完全静默（字面量直接发给 LLM），这里必须现形。
        let leftover = [], more = 0;
        try {
            const seen = new Set();
            const re = /\{\{[^{}\n]{0,40}\}\}/g;
            let mm;
            while ((mm = re.exec(text)) !== null) {
                const s = mm[0];
                if (seen.has(s)) continue;
                seen.add(s);
                if (leftover.length < MAX_LEFTOVER_REPORT) leftover.push(s); else more++;
            }
        } catch (_e) { /* 扫描失败不改变结果，只是读数缺失 */ }
        return { text: text, applied: applied, missed: missed, modes: modes, total: keys.length, leftover: leftover, leftoverMore: more };
    }

    /**
     * 诊断面读数（纯函数、不抛）。
     * 为什么把「归一化命中」单列：它证明宽容回退真被用上了——若永远为 0，
     *   说明要么用户没写坏模板（好事），要么回退根本没接进来（功能空转），两者必须可分辨。
     */
    function line(read) {
        const r = read || {};
        if (r.moduleMissing) return '模块未加载（fuzzy-patch.js）';
        if (!r.total) return '模板无占位符';
        const modes = r.modes || {};
        let exact = 0, fuzzy = 0, all = 0;
        for (const k of Object.keys(modes)) {
            const v = String(modes[k] || '');
            if (v === 'exact') exact++;
            else if (v === 'normalized') fuzzy++;
            else if (v.indexOf('exact-all') === 0) all++;
        }
        const parts = ['占位符 ' + (r.applied || 0) + '/' + r.total + ' 填充', '精确 ' + exact];
        if (fuzzy) parts.push('归一化回退 ' + fuzzy);
        if (all) parts.push('多处替换 ' + all);
        if (r.leftover && r.leftover.length) {
            parts.push('残留 ' + r.leftover.join(''));
            if (r.leftoverMore) parts.push('另 ' + r.leftoverMore + ' 种');
        }
        if (r.missed && r.missed.length) parts.push('未填 ' + r.missed.join('，'));
        return parts.join(' · ');
    }

    const api = {
        PATCH_VERSION: PATCH_VERSION,
        NORM_CHAR_MAP: NORM_CHAR_MAP,
        MAX_LEFTOVER_REPORT: MAX_LEFTOVER_REPORT,
        normalizeWithPositions: normalizeWithPositions,
        findValidMatches: findValidMatches,
        findUniqueNormalizedMatch: findUniqueNormalizedMatch,
        applyPatch: applyPatch,
        matchNewlines: matchNewlines,
        patchTokens: patchTokens,
        countOccurrences: countOccurrences,
        line: line,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaFuzzyPatch = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);