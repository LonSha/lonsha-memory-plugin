/* ========================================================
 * memory-text-mirror.js — [v3.484.0] 记忆的可读文本镜像（渲染 + 回读）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   `projection-pipeline.js` 里 `toText` / `renderText` / `parseText` / `回读` /
 *   `文本投影` 的出现次数为 **0**：本仓能算「这块占多少 token、挤掉哪条」，
 *   却产不出一段**人能读、且能读回来**的档案文本。
 *   后果：① 用户没法肉眼校对插件到底记住了什么（只能看界面里的散条目）；
 *        ② 想把这批记忆落成角色卡 / 世界书条目，只能人工抄。
 *
 * 【缝合来源 / 只搬格式不搬业务】
 *   源：📚 通用角色弧光与世界书归档台 V4.6 的档案文本格式：
 *     · 段落头 `【角色记忆与人物弧光轨迹】`
 *     · 每条一行 `• [第123~125楼｜核心记忆]：「原话或概述」`
 *     · 独立的态度行 `当前对{{user}}态度：…`
 *     · 外层可包 `<character_memory character="名字">`（也认 archive / arc 两种旧标签）
 *   本仓只搬这套**格式与两条幂等纪律**（外层多标签兼容 + 重复保存不叠头），
 *   不搬它的双通道 LLM 引擎、面板与存储（本仓有自己的抽取与图谱）。
 *
 * 【为什么值得搬：往返可逆（round-trip）】
 *   parse(render(x)) 必须逐字回到 x —— 这条是本模块唯一的承重承诺。
 *   只渲染不回读，就等于又造了一个「写出去就再也读不回来」的一次性投影
 *   （本仓 v3.44x 那条 Map 序列化教训同族）。
 *
 * 【不做什么（边界）】
 *   · 不生成内容、不调模型：只把既有记录排版 / 解析；
 *   · 不碰 storage、不碰 window：纯函数；
 *   · 不改记录字段：渲染只读，解析只产新对象。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaMemoryTextMirror = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var STATES = { PARSED: 'parsed', EMPTY: 'empty', MALFORMED: 'malformed' };
    var HEADER = '【角色记忆与人物弧光轨迹】';
    var ATTITUDE_KEY = '当前对{{user}}态度';
    var OPEN_RE = /^\s*<character_(archive|memory|arc)\b([^>]*)>/i;
    var CLOSE_RE = /\s*<\/character_(archive|memory|arc)>\s*$/i;

    /** 内层文本里不许出现「」：出现了就换成『』，否则回读会提前断句。 */
    function sanitizeInner(text) {
        return String(text == null ? '' : text)
            .replace(/」/g, '』')
            .replace(/「/g, '『')
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function tagOf(rec) {
        var t = String(rec && (rec.tag || rec.type || rec.kind) || '').trim();
        return t || '近期记忆';
    }

    function floorRange(rec) {
        var from = Math.max(0, Math.floor(Number(rec && rec.from) || 0));
        var toRaw = rec && rec.to !== undefined && rec.to !== null ? Math.floor(Number(rec.to)) : from;
        var to = isFinite(toRaw) ? Math.max(from, toRaw) : from;
        return { from: from, to: to };
    }

    /**
     * render({ notes, attitude, character, wrap }) -> string
     *   notes: [{ from, to?, tag?, text }]
     *   wrap:  true 时包一层 <character_memory character="…">
     */
    function render(input) {
        var ipt = input && typeof input === 'object' ? input : {};
        var notes = Array.isArray(ipt.notes) ? ipt.notes : [];
        var lines = [HEADER];
        var written = 0;
        for (var i = 0; i < notes.length; i += 1) {
            var rec = notes[i];
            if (!rec || typeof rec !== 'object') continue;
            var body = sanitizeInner(rec.text);
            if (!body) continue;
            var fr = floorRange(rec);
            var head = fr.to > fr.from ? ('第' + fr.from + '~' + fr.to + '楼') : ('第' + fr.from + '楼');
            lines.push('• [' + head + '｜' + tagOf(rec) + ']：「' + body + '」');
            written += 1;
        }
        if (!written) lines.push('（当前尚无已记录的角色记忆）');
        var att = sanitizeInner(ipt.attitude);
        if (att) lines.push(ATTITUDE_KEY + '：' + att);
        var text = lines.join('\n');
        if (ipt.wrap) {
            var name = sanitizeInner(ipt.character || '');
            text = '<character_memory' + (name ? ' character="' + name.replace(/"/g, '"') + '"' : '') + '>\n'
                + text + '\n</character_memory>';
        }
        return text;
    }

    /** 剥外层标签：三种标签都认（旧档里三种都在用，只认一种会丢内容）。 */
    function unwrap(text) {
        var s = String(text == null ? '' : text).trim();
        var detected = null;
        var name = '';
        var m = s.match(OPEN_RE);
        if (m) {
            var tag = String(m[1] || '').toLowerCase();
            detected = tag === 'archive' ? 'character_archive' : ('character_' + tag);
            var nm = String(m[2] || '').match(/\bcharacter\s*=\s*["'”]([^"'”]+)["'”]/i);
            if (nm && nm[1]) name = nm[1].trim();
            s = s.replace(OPEN_RE, '').replace(CLOSE_RE, '').trim();
        }
        return { innerText: s, detectedTag: detected, character: name };
    }

    /**
     * 重复保存不叠头：代码注入的抬头一律剥掉。
     * 这条在源脚本里是「每次写前先剥」，否则每存一次就多一层标题。
     */
    function stripInjectedHeader(text) {
        return String(text == null ? '' : text)
            .replace(/^\s*使用说明\s*[:：][^\n]*\n+/i, '')
            .replace(/^\s*#\s*[^\n]*角色档案\s*\n+/i, '')
            .replace(/^\s*角色标识\s*[:：][^\n]*\n+/i, '')
            .replace(/^\s*【灵魂原典[^】]*】\s*/i, '')
            .replace(/^[ \t]+/gm, '')
            .trim();
    }

    function parse(text) {
        var raw = String(text == null ? '' : text);
        var out = { state: STATES.MALFORMED, notes: [], attitude: '', tag: null, character: '', reason: '' };
        if (!raw.trim()) {
            out.state = STATES.EMPTY;
            out.reason = 'empty-input';
            return out;
        }
        var un = unwrap(raw);
        out.tag = un.detectedTag;
        out.character = un.character;
        var body = stripInjectedHeader(un.innerText);
        body = body.replace(/^\s*【[^】]*角色记忆[^】]*】\s*/m, '');
        var attM = body.match(/^\s*当前对\{\{user\}\}态度\s*[:：]\s*(.+)$/m);
        if (attM && attM[1]) {
            var v = attM[1].trim();
            if (!/^(?:待观察|（待观察）|暂无|无)$/.test(v)) out.attitude = v;
            body = body.replace(attM[0], '');
        }
        body = body.replace(/^（当前尚无已记录的角色记忆[^）]*）\s*$/m, '');
        var re = /^•\s*\[第\s*(\d+)(?:~(\d+))?\s*楼｜([^\]]+?)\]：「([\s\S]*?)」(?=\r?\n•\s*\[第|\r?\n*$)/gm;
        var m2;
        while ((m2 = re.exec(body)) !== null) {
            var from = Math.max(0, Math.floor(Number(m2[1]) || 0));
            var to = m2[2] !== undefined ? Math.max(from, Math.floor(Number(m2[2]) || from)) : from;
            var txt = String(m2[4] || '').trim();
            if (!txt) continue;
            out.notes.push({ from: from, to: to, tag: String(m2[3] || '').trim() || '近期记忆', text: txt });
        }
        out.state = out.notes.length || out.attitude ? STATES.PARSED : STATES.EMPTY;
        if (out.state === STATES.EMPTY) out.reason = 'no-notes-and-no-attitude';
        return out;
    }

    /** 一行摘要（诊断行用）。 */
    function summary(res) {
        if (!res) return '未渲染';
        if (res.state === STATES.MALFORMED) return '入参不合法（' + (res.reason || 'unknown') + '）';
        if (res.state === STATES.EMPTY) return '无条目';
        return res.notes.length + ' 条' + (res.attitude ? ' · 含态度行' : '') + (res.tag ? ' · 外层 ' + res.tag : '');
    }

    return {
        STATES: STATES,
        HEADER: HEADER,
        ATTITUDE_KEY: ATTITUDE_KEY,
        render: render,
        parse: parse,
        unwrap: unwrap,
        stripInjectedHeader: stripInjectedHeader,
        summary: summary
    };
}));
