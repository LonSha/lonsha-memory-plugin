# -*- coding: utf-8 -*-
"""[v3.338.0] v3282 blockFrom 补上「正则字面量感知」。切片定位，不依赖逐字锚点。"""
import io, sys
P = 'tests/v3282_o7_alias_copy_ledger.test.mjs'
src = io.open(P, encoding='utf-8').read()
START = 'function blockFrom(src, startBrace) {'
END = '/** \u8df3\u8fc7\u53c2\u6570\u8868\uff0c\u8fd4\u56de\u5176\u540e\u7684 `{` \u4e0b\u6807\uff08\u627e\u4e0d\u5230\u7ed9 -1\uff09\u3002 */'
i = src.find(START); j = src.find(END)
print('i', i, 'j', j)
if i < 0 or j < 0 or j <= i: sys.exit('span not found')
span = src[i:j]
if 'REGEX_PREV' in span:
    print('already patched (idempotent skip)'); sys.exit(0)
if span.count('function blockFrom') != 1 or 'quote = null;' not in span: sys.exit('span shape unexpected')
NEW = r'''function blockFrom(src, startBrace) {
    let depth = 0, i = startBrace, quote = null, prevSig = '';
    const n = src.length;
    /* 「/ 是正则起始还是除号」的口径同 tests/_audit_lib.mjs 的 stripComments：
     *   v3.335.0 给 index.js 加的一行正则字面量其字符类里含 " —— 只跳字符串、
     *   不跳正则的旧实现会把它当成字符串起始，状态机失步后 MemoryEngine 类体
     *   永不闭合（blockFrom -> null），_numOrNull 不被枚举，别名副本面整片塔掉。 */
    const word = (end) => {
        let k = end;
        while (k > 0 && /[A-Za-z0-9_$]/.test(src[k - 1])) k--;
        return src.slice(k, end);
    };
    const REGEX_PREV = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '^', '~', '<', '>']);
    const REGEX_PREV_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'case', 'do', 'else', 'yield', 'await']);
    while (i < n) {
        const c = src[i];
        if (quote) {
            if (c === '\\') { i += 2; continue; }
            if (c === quote) quote = null;
            i++; continue;
        }
        if (c === '"' || c === "'" || c === '`') { quote = c; prevSig = c; i++; continue; }
        if (c === '/' && src[i + 1] === '/') { const e = src.indexOf(String.fromCharCode(10), i); i = e < 0 ? n : e + 1; continue; }
        if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i); i = e < 0 ? n : e + 2; continue; }
        if (c === '/' && (REGEX_PREV.has(prevSig) || REGEX_PREV_WORD.has(word(i)))) {
            let j = i + 1, cls = false;
            while (j < n) {
                const d = src[j];
                if (d === '\\') { j += 2; continue; }
                if (d === '[') cls = true;
                else if (d === ']') cls = false;
                else if (d === '/' && !cls) { j++; break; }
                else if (d === String.fromCharCode(10)) break;
                j++;
            }
            i = j; prevSig = ')'; continue;
        }
        if ('{[('.includes(c)) { depth++; prevSig = c; i++; continue; }
        if ('}])'.includes(c)) { depth--; prevSig = c; if (depth === 0) return src.slice(startBrace + 1, i); i++; continue; }
        if (!/\s/.test(c)) prevSig = c;
        i++;
    }
    return null;
}

'''
out = src[:i] + NEW + src[j:]
io.open(P, 'w', encoding='utf-8').write(out)
print('patched; len', len(src), '->', len(out))
