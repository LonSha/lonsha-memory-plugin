/**
 * sentence-edits.js — [R27-C] 句子级改写：精确替换 + 十条拒绝码
 *
 * 【来源】照 shrink1024/fish-memory 的 src/core/sentence-edits.js（75 行）行为重写。
 *         该仓无 LICENSE，未复制任何代码；拒绝码语义与三条阈值（256 字 / 60% / 64 字）
 *         属于机制契约，按其行为重写并按同一套边界自测。
 *
 * 【要解决什么】
 *   让模型「改一句话」这件事，如果实现成 eval / 正则替换 / 模糊匹配，会遇到三类事故：
 *     ① 改到了不该改的地方（同一句话在条目里出现两次，替换了错的那处）；
 *     ② 一次改掉了半张世界书（模型给出「把整段换成……」的巨型 oldText）；
 *     ③ 改坏了受保护资料（把 [受保护资料] 引用当普通文本重写掉）。
 *   本模块把「能不能改」拆成十个可点名的拒绝码，**任何一条不满足就整条拒绝**，
 *   而不是「尽力改一点」——改写失败必须是显式的，不能是静默的部分成功。
 *
 * 【十条拒绝码】（闭集，面板/日志同源）
 *   patch-segment-missing      段 id 不存在
 *   patch-protected            段被规则锁定（writable=false）
 *   patch-not-found            原文不在该段里 / 模型声明不在输入内
 *   patch-ambiguous            原文在该段出现不止一次（不知道该改哪处）
 *   patch-invalid              形状非法（类型错、切代理对、append 与 oldText 混用）
 *   patch-span-too-long        单次改动跨度 > 256 字
 *   patch-span-multiline       跨度含换行（跨行改写不做，交给整段重写）
 *   patch-span-too-wide        跨度覆盖全条目有效字数的 60% 以上
 *   patch-overlap              两个改动区间重叠（都在同一段上）
 *   patch-protected-reference  改动会让 [受保护资料] 引用变多
 *
 * 【三条阈值】
 *   MAX_EDIT_SPAN_CHARS = 256 —— 一句到两句话，超过就不是「句子级」了；
 *   MAX_EDIT_COVERAGE   = 0.6 —— 改掉六成以上等于重写，应走整段替换；
 *   SHORT_SINGLE_ENTRY_CHARS = 64 —— 整条只有一句短句时，60% 的门槛反而会误伤
 *      （一句 20 字的话改 12 字就超 60%，但那就是正常改法），故对「短单句条目」豁免覆盖面检查。
 *
 * 【与源码差异（逐条可指认）】
 *   · 码点计数用逐码点遍历（不用正则 g 状态），超限即停；
 *   · 短单句判定抽成可测函数并导出（shortSingleEntry），便于负控制；
 *   · 拒绝面统一带 `editIndex` 并稳定排序（源码排序同，但未导出排序函数）；
 *   · 增 readings（改了几段、拒了几条、按码分组）与 line() 诊断行；
 *   · 全程不抛：形状错误一律落到 patch-invalid，与「改不了」同形但码不同。
 */
(function (root) {
    'use strict';

    /** 本面结构版本（形状一变必须抬这个数）。 */
    const SE_VERSION = 1;
    /** 读数 kind。 */
    const SE_KIND = 'sentence_edits';
    /** 单次改动跨度上限（码点）。 */
    const MAX_EDIT_SPAN_CHARS = 256;
    /** 单次改动可覆盖的有效字数比例上限。 */
    const MAX_EDIT_COVERAGE = 0.6;
    /** 短单句条目的字数上限（码点）。 */
    const SHORT_SINGLE_ENTRY_CHARS = 64;
    /** 拒绝码闭集（顺序即诊断优先级，面板照此顺序展示）。 */
    const REJECT_CODES = Object.freeze([
        'patch-segment-missing',
        'patch-protected',
        'patch-not-found',
        'patch-ambiguous',
        'patch-invalid',
        'patch-span-too-long',
        'patch-span-multiline',
        'patch-span-too-wide',
        'patch-overlap',
        'patch-protected-reference'
    ]);
    /** 受保护引用标记（出现次数变多即拒绝）。 */
    const PROTECTED_MARK = '[受保护资料]';
    /** 换行字符类（含 Unicode 行分隔符）。 */
    const LINE_BREAKS = ['\n', '\r', '\v', '\f', '\u0085', '\u2028', '\u2029'];
    /** 短单句判定里「不属于单句」的字符（结尾标点已先剥掉）。 */
    const NOT_SINGLE = ['.', '!', '?', '。', '！', '？', ',', '，', '、', ';', '；', '|', '{', '}', '[', ']', '<', '>'];

    /** 含换行？ */
    function hasLineBreak(text) {
        const s = String(text ?? '');
        for (let i = 0; i < s.length; i++) if (LINE_BREAKS.indexOf(s[i]) >= 0) return true;
        return false;
    }

    /** 码点计数，数到超过 limit 立刻返回（用于巨长文本不扫全）。 */
    function countUpTo(text, limit) {
        const s = String(text ?? '');
        let n = 0;
        for (const _ch of s) {
            n++;
            if (n > limit) return n;
        }
        return n;
    }

    /** 是否切开了代理对（半个 emoji / 半个罕用字）。 */
    function cutsSurrogatePair(text, at) {
        const s = String(text ?? '');
        if (at <= 0 || at >= s.length) return false;
        const before = s.charCodeAt(at - 1);
        const after = s.charCodeAt(at);
        return before >= 0xD800 && before <= 0xDBFF && after >= 0xDC00 && after <= 0xDFFF;
    }

    /** 条目有效字数（只数非空白码点），超过「60% 门槛所需的最大值」就停。 */
    function bodySize(entry) {
        const stop = Math.floor(MAX_EDIT_SPAN_CHARS / MAX_EDIT_COVERAGE) + 1;
        const segments = entry && Array.isArray(entry.segments) ? entry.segments : [];
        let n = 0;
        for (const segment of segments) {
            const text = String((segment && segment.text) || '');
            for (const ch of text) {
                if (ch.trim().length === 0) continue;
                n++;
                if (n >= stop) return n;
            }
        }
        return n;
    }

    /**
     * 是不是「一条短单句」：
     *   单段、trim 后 ≤64 码点、无换行、剥掉结尾标点后不含句读/列表/标签符号、冒号至多一个。
     * 这是**保守豁免**，不是语言解析器：宁可判成「不是单句」（走 60% 检查），
     * 也不要把一小段列表或结构化记录当成一句话放行。
     */
    function shortSingleEntry(entry) {
        const segments = entry && Array.isArray(entry.segments) ? entry.segments : [];
        if (segments.length !== 1) return false;
        const raw = String((segments[0] && segments[0].text) || '');
        const text = raw.trim();
        if (!text) return false;
        if (text.length > SHORT_SINGLE_ENTRY_CHARS * 2) return false;
        if (countUpTo(text, SHORT_SINGLE_ENTRY_CHARS) > SHORT_SINGLE_ENTRY_CHARS) return false;
        if (hasLineBreak(text)) return false;
        // 剥掉结尾的标点与成对引号/括号，再看正文里还有没有句读符号。
        let inner = text;
        while (inner.length) {
            const last = inner[inner.length - 1];
            if (NOT_SINGLE.indexOf(last) >= 0 && '。！？.!?'.indexOf(last) >= 0) { inner = inner.slice(0, -1); continue; }
            if ('"\'”’」』）)'.indexOf(last) >= 0) { inner = inner.slice(0, -1); continue; }
            break;
        }
        for (const ch of inner) if (NOT_SINGLE.indexOf(ch) >= 0) return false;
        let colons = 0;
        for (const ch of text) if (ch === ':' || ch === '：') colons++;
        return colons <= 1;
    }

    /** 非空白码点数。 */
    function selectedChars(text) {
        let n = 0;
        for (const ch of String(text ?? '')) if (ch.trim().length !== 0) n++;
        return n;
    }

    /**
     * 应用一批句子级改动。
     * @param {{segments:Array}} entry 条目（segments 每项 {id, text, writable?}）
     * @param {Array} edits 每项 {segmentId, oldText?, newText?, append?, outsideInput?}
     * @returns {{segments:Array, applied:number, rejected:Array, readings:object, line:string}}
     */
    function applySentenceEdits(entry, edits) {
        const rejected = [];
        const plans = [];
        const list = Array.isArray(edits) ? edits : [];
        const segments = entry && Array.isArray(entry.segments) ? entry.segments : [];
        const byId = new Map();
        for (const s of segments) if (s && s.id !== undefined) byId.set(String(s.id), s);
        const reject = (editIndex, segmentId, code) => {
            rejected.push({ editIndex: editIndex, segmentId: segmentId, code: code });
        };

        let spanContext;
        for (let index = 0; index < list.length; index++) {
            const edit = list[index] && typeof list[index] === 'object' ? list[index] : {};
            const segment = edit.segmentId === undefined ? null : byId.get(String(edit.segmentId));
            if (!segment) { reject(index, edit.segmentId, 'patch-segment-missing'); continue; }
            if (segment.writable === false) { reject(index, segment.id, 'patch-protected'); continue; }
            if (edit.outsideInput === true) { reject(index, segment.id, 'patch-not-found'); continue; }

            const text = String(segment.text ?? '');
            const isAppend = Object.prototype.hasOwnProperty.call(edit, 'append');
            if (isAppend) {
                // append 与 oldText/newText 互斥：混用等于「两种意图」，不许猜。
                const mixed = Object.prototype.hasOwnProperty.call(edit, 'oldText')
                    || Object.prototype.hasOwnProperty.call(edit, 'newText');
                if (typeof edit.append !== 'string' || mixed) { reject(index, segment.id, 'patch-invalid'); continue; }
                if (edit.append.length) {
                    plans.push({ index: index, id: String(segment.id), start: text.length, end: text.length, text: edit.append, append: true });
                }
                continue;
            }

            if (typeof edit.oldText !== 'string' || !edit.oldText.length || typeof edit.newText !== 'string') {
                reject(index, segment.id, 'patch-invalid');
                continue;
            }
            const at = text.indexOf(edit.oldText);
            if (at < 0) { reject(index, segment.id, 'patch-not-found'); continue; }
            if (text.indexOf(edit.oldText, at + 1) >= 0) { reject(index, segment.id, 'patch-ambiguous'); continue; }
            if (cutsSurrogatePair(text, at) || cutsSurrogatePair(text, at + edit.oldText.length)) {
                reject(index, segment.id, 'patch-invalid');
                continue;
            }
            if (edit.oldText === edit.newText) continue; // 空操作：不算改，也不算拒
            if (countUpTo(edit.oldText, MAX_EDIT_SPAN_CHARS) > MAX_EDIT_SPAN_CHARS) {
                reject(index, segment.id, 'patch-span-too-long');
                continue;
            }
            if (hasLineBreak(edit.oldText.trim())) { reject(index, segment.id, 'patch-span-multiline'); continue; }
            if (spanContext === undefined) {
                spanContext = { size: bodySize(entry), short: shortSingleEntry(entry) };
            }
            if (!spanContext.short) {
                const picked = selectedChars(edit.oldText);
                if (!spanContext.size || picked / spanContext.size > MAX_EDIT_COVERAGE) {
                    reject(index, segment.id, 'patch-span-too-wide');
                    continue;
                }
            }
            plans.push({ index: index, id: String(segment.id), start: at, end: at + edit.oldText.length, text: edit.newText });
        }

        // 区间冲突：同段、两个都不是 append、区间相交 ⇒ 两方一起拒（不猜谁优先）。
        const conflicted = new Set();
        for (let i = 0; i < plans.length; i++) {
            for (let j = i + 1; j < plans.length; j++) {
                const a = plans[i];
                const b = plans[j];
                if (a.id === b.id && !a.append && !b.append && a.start < b.end && b.start < a.end) {
                    conflicted.add(a.index);
                    conflicted.add(b.index);
                }
            }
        }

        const next = segments.map((s) => (s && typeof s === 'object' ? { ...s } : s));
        let applied = 0;
        for (const segment of next) {
            if (!segment || segment.id === undefined) continue;
            const mine = plans.filter((p) => p.id === String(segment.id));
            if (!mine.length) continue;
            for (const p of mine) if (conflicted.has(p.index)) reject(p.index, segment.id, 'patch-overlap');
            const valid = mine.filter((p) => !conflicted.has(p.index));
            if (!valid.length) continue;
            const before = String(segment.text ?? '');
            let text = before;
            // 从后往前改，保证前面改动不移动后面已算好的下标。
            // 同一位置的多个 append 用 editIndex 倒序拼，保持作者给的原顺序。
            const ordered = valid.slice().sort((a, b) => (b.start - a.start) || (b.index - a.index));
            for (const p of ordered) text = text.slice(0, p.start) + p.text + text.slice(p.end);
            // 受保护引用不许变多：改出来比原来多，说明这次改写把引用写成了普通文本。
            if (countOccurrences(text, PROTECTED_MARK) > countOccurrences(before, PROTECTED_MARK)) {
                for (const p of valid) reject(p.index, segment.id, 'patch-protected-reference');
                continue;
            }
            segment.text = text;
            applied += valid.length;
        }

        rejected.sort((a, b) => a.editIndex - b.editIndex);
        const readings = summarize(list.length, plans.length, applied, rejected);
        return { segments: next, applied: applied, rejected: rejected, readings: readings, line: readings.line };
    }

    /** 子串出现次数（不重叠计数，够用且可预期）。 */
    function countOccurrences(text, needle) {
        const s = String(text ?? '');
        if (!needle) return 0;
        let n = 0;
        let at = s.indexOf(needle);
        while (at >= 0) {
            n++;
            at = s.indexOf(needle, at + needle.length);
        }
        return n;
    }

    /** 汇总读数：按码分组，并显式区分「被拒」与「空操作跳过」。 */
    function summarize(total, planned, applied, rejected) {
        const byCode = {};
        for (const code of REJECT_CODES) byCode[code] = 0;
        for (const r of rejected) byCode[r.code] = (byCode[r.code] || 0) + 1;
        const readings = {
            kind: SE_KIND,
            version: SE_VERSION,
            totalEdits: total,
            planned: planned,
            applied: applied,
            rejected: rejected.length,
            byCode: byCode,
            // 一条都没改也没拒 = 全部是空操作（oldText 与 newText 相同）
            noop: Math.max(0, total - planned - rejected.length)
        };
        readings.line = line(readings);
        return readings;
    }

    /** 诊断行：改了几条、拒了几条、拒在哪几类。 */
    function line(readings) {
        const r = readings && typeof readings === 'object' ? readings : {};
        const hit = [];
        const byCode = r.byCode && typeof r.byCode === 'object' ? r.byCode : {};
        for (const code of REJECT_CODES) if (byCode[code]) hit.push(code.replace('patch-', '') + '×' + byCode[code]);
        const tail = hit.length ? '（' + hit.join('，') + '）' : '';
        return '句子级改写 改' + String(r.applied ?? 0) + '/计划' + String(r.planned ?? 0)
            + '/总' + String(r.totalEdits ?? 0) + ' 拒' + String(r.rejected ?? 0) + tail;
    }

    /** 自检（供 engine-self-check 与测试共用）。 */
    function selfCheck() {
        const entry = { id: 'e1', segments: [{ id: 's1', text: '张三走进酒楼，把刀放在桌上，说了一句无关紧要的废话。' }] };
        const okEdit = applySentenceEdits(entry, [{ segmentId: 's1', oldText: '酒楼', newText: '客栈' }]);
        const ambig = applySentenceEdits({ id: 'e2', segments: [{ id: 's1', text: '刀刀刀' }] }, [{ segmentId: 's1', oldText: '刀', newText: '剑' }]);
        const prot = applySentenceEdits({ id: 'e3', segments: [{ id: 's1', text: 'abc', writable: false }] }, [{ segmentId: 's1', oldText: 'a', newText: 'b' }]);
        // 覆盖面检查只对「非短单句」生效：短单句（单段、≤64 字、无句读）本来就该允许改掉大半。
        // 所以要验 too-wide，必须用一条**长条目**（内含逗号 ⇒ 不是单句）。
        const longText = '他走进酒楼，抬头看了看天色，又低头数了数钱袋里的碎银，最后把刀放在桌上，说了几句无关紧要的废话，然后才转身离开。';
        const wide = applySentenceEdits(
            { id: 'e4', segments: [{ id: 's1', text: longText }] },
            [{ segmentId: 's1', oldText: '他走进酒楼，抬头看了看天色，又低头数了数钱袋里的碎银，最后把刀放在桌上，说了几句无关紧要的废话', newText: 'X' }]
        );
        // 短单句豁免的正例：4 字短句改 3 字（75% > 60%）必须允许，否则正常改法会被误伤。
        const shortOk = applySentenceEdits(
            { id: 'e5', segments: [{ id: 's1', text: '他走了。' }] },
            [{ segmentId: 's1', oldText: '他走了', newText: '她来了' }]
        );
        const checks = [
            ['正常替换生效', okEdit.applied === 1 && okEdit.segments[0].text.indexOf('客栈') >= 0],
            ['重复出现判 ambiguous', ambig.rejected.length === 1 && ambig.rejected[0].code === 'patch-ambiguous'],
            ['锁定段判 protected', prot.rejected.length === 1 && prot.rejected[0].code === 'patch-protected'],
            ['长条目改掉七成判 too-wide', wide.rejected.length === 1 && wide.rejected[0].code === 'patch-span-too-wide'],
            ['短单句豁免（改掉 75% 也放行）', shortOk.applied === 1 && shortOk.rejected.length === 0]
        ];
        return {
            ok: checks.every((x) => x[1]),
            checks: checks.map((x) => ({ name: x[0], ok: !!x[1] }))
        };
    }

    const api = {
        SE_VERSION: SE_VERSION,
        SE_KIND: SE_KIND,
        MAX_EDIT_SPAN_CHARS: MAX_EDIT_SPAN_CHARS,
        MAX_EDIT_COVERAGE: MAX_EDIT_COVERAGE,
        SHORT_SINGLE_ENTRY_CHARS: SHORT_SINGLE_ENTRY_CHARS,
        REJECT_CODES: REJECT_CODES,
        PROTECTED_MARK: PROTECTED_MARK,
        hasLineBreak: hasLineBreak,
        countUpTo: countUpTo,
        cutsSurrogatePair: cutsSurrogatePair,
        bodySize: bodySize,
        shortSingleEntry: shortSingleEntry,
        selectedChars: selectedChars,
        applySentenceEdits: applySentenceEdits,
        summarize: summarize,
        line: line,
        selfCheck: selfCheck
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaSentenceEdits = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);