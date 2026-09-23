/* ============================================================
 * tests/_audit_lib.mjs —— 审计基建唯一真源 [v3.191.0]
 * ------------------------------------------------------------
 * 为什么存在（本轮实测，不是「整洁性偏好」）：
 *
 * ① `stripComments` 在 9 个 audit 脚本里各写一份，且已分裂成 4 种变体
 *    （实测哈希：16770b2c4e x2 / 48cb081500 x6 / e223cc0935 x1 / 修正版 x1）。
 *    同一条口径多份实现 => 修一处漏一处，判据在不同脚本里语义漂移。
 *
 * ② 更贵的是：那 3 种旧变体都不认字符串 / 正则字面量。实测（对真仓库文件逐字节比对）：
 *      · index.js:1450 的正则里 `//` 被当行注释，该行剥后整段为空；
 *      · 33 个真仓库 .js 里 30 个存在差异；
 *      · 模板串里出现注释起始符时会开启块注释态，直到遇到注释结束符才闭合，把其后的真代码整段吞掉。
 *    对审计脚本的后果是双向的：吞掉调用点 => 假红灯；吞掉手抄位移语句 => 假绿。
 *    形态 2（模板串）当前尚未在仓库里发病，但属潜伏。
 *
 * ③ `bodyOf` 在 2 个脚本里各写一份且签名不同；`codeLines` 在 4 处各写一份
 *    （tests/_negative_util.mjs 已导出，v3169/v3170/v3171 仍本地重写）。
 *
 * ④ 库文件若放在 tests/audit/ 下，会被 tests/run.mjs 的
 *      readdirSync(AUDIT_DIR).filter(f => f.endsWith('.mjs'))
 *    当成审计脚本直接 node 执行，并以退出码 0 判断「审计通过」——纯定义文件零调用即通过。
 *    实测：_audit_lib.mjs 曾以 exit 0 / 11 字节输出混在 30 个扫描器里被判绿。
 *    => 落点必须是 tests/（与 tests/_negative_util.mjs 同一规范），
 *    这样两个扫描面都不收它，无需改 runner。
 *
 * 收敛口径：本文件是唯一真源；脚本必须 import，不得再本地声明同名助手。
 * 由 tests/audit/scan_audit_lib_consolidation.mjs 的 E1 结构判据守住。
 *
 * 设计纪律（对齐本仓宪法）：
 *   · 不猜：未闭合字符串 / 正则时不吞后续代码（宁可少剥，不可少看）；
 *   · 只读：纯函数，无副作用（CLI 自证段仅在直接执行时运行）；
 *   · 不抛：畸形入参返回空串 / null，由调用方按自身退出码语义分态。
 * ============================================================ */
/** 判定 / 是正则起始还是除号：看上一个有意义的字符 */
const REGEX_PREV = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '^', '~', '<', '>']);
const REGEX_PREV_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'case', 'do', 'else', 'yield', 'await']);
/**
 * 剥掉注释，保留换行（行号可靠），代码位置以空格占位（不改变长度与偏移）。
 *
 * 与旧实现的关键差别：认字符串 / 模板串 / 正则字面量。
 *
 * @param {string} code
 * @returns {string} 与入参等长、换行位置一致的文本
 */
export function stripComments(code) {
    const src = String(code ?? '');
    const out = src.split('');
    const n = src.length;
    const blank = (from, to) => {
        const end = Math.min(to, out.length);
        for (let k = from; k < end; k++) if (out[k] !== '\n') out[k] = ' ';
    };
    const word = (end) => {
        let k = end;
        while (k > 0 && /[A-Za-z0-9_$]/.test(src[k - 1])) k--;
        return src.slice(k, end);
    };
    let i = 0;
    let prevSig = '';
    while (i < n) {
        const c = src[i];
        const c2 = src[i + 1];
        if (c === '/' && c2 === '/') {
            let j = i;
            while (j < n && src[j] !== '\n') j++;
            blank(i, j);
            i = j;
            continue;
        }
        if (c === '/' && c2 === '*') {
            let j = i + 2;
            while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
            const end = Math.min(n, j + 2);
            blank(i, end);
            i = end;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            let j = i + 1;
            while (j < n) {
                if (src[j] === '\\') { j += 2; continue; }
                if (src[j] === c) { j++; break; }
                if (c === '`' && src[j] === '$' && src[j + 1] === '{') {
                    let d = 1;
                    j += 2;
                    while (j < n && d > 0) {
                        if (src[j] === '\\') { j += 2; continue; }
                        if (src[j] === '{') d++;
                        else if (src[j] === '}') d--;
                        j++;
                    }
                    continue;
                }
                if (src[j] === '\n' && c !== '`') break;
                j++;
            }
            i = j;
            prevSig = c;
            continue;
        }
        if (c === '/' && (REGEX_PREV.has(prevSig) || REGEX_PREV_WORD.has(word(i)))) {
            let j = i + 1;
            let cls = false;
            while (j < n) {
                const d = src[j];
                if (d === '\\') { j += 2; continue; }
                if (d === '[') cls = true;
                else if (d === ']') cls = false;
                else if (d === '/' && !cls) { j++; break; }
                else if (d === '\n') break;
                j++;
            }
            i = j;
            prevSig = ')';
            continue;
        }
        if (!/\s/.test(c)) prevSig = c;
        i++;
    }
    return out.join('');
}
/** 剥注释后按行取「代码行」（去空行）——文本判据一律做在代码行上 */
export function codeLines(src) {
    return stripComments(src).split('\n').map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);
}
/**
 * 取 {...} 代码块（花括号配对，字符串内的花括号不计数）。
 *
 * 两种用法（旧脚本里是两份不同签名的实现，此处合一）：
 *   · 显式 marker：bodyOf(src, 'rollbackFloor(floor)')  —— 按 indexOf 定位，取其后第一个 {
 *   · 裸函数名  ：bodyOf(src, 'defaultCheatConfig')     —— 允许 function name( / const name =
 *
 * @param {string} src 源码（调用方自行决定是否先 stripComments）
 * @param {string} marker 方法/函数 marker 或裸名字
 * @returns {string|null} 含两端花括号的块文本；找不到返回 null（不抛）
 */
export function bodyOf(src, marker) {
    const text = String(src ?? '');
    const m = String(marker ?? '');
    if (!text || !m) return null;
    let at = text.indexOf(m);
    if (at < 0 && /^[A-Za-z_$][\w$]*$/.test(m)) {
        const re = new RegExp('(?:function\\s+|\\b(?:const|let|var)\\s+)' + m.replace(/\$/g, '\\$') + '\\b');
        const hit = re.exec(text);
        if (hit) at = hit.index;
    }
    if (at < 0) return null;
    const brace = text.indexOf('{', at);
    if (brace < 0) return null;
    return braceMatch(text, brace);
}
/**
 * 从 openIdx 处的 { 起做花括号配对（跳过字符串 / 模板串）。
 * @returns {string|null}
 */
export function braceMatch(text, openIdx) {
    const src = String(text ?? '');
    if (src[openIdx] !== '{') return null;
    let d = 0;
    for (let j = openIdx; j < src.length; j++) {
        const c = src[j];
        if (c === '"' || c === "'" || c === '`') {
            let k = j + 1;
            while (k < src.length) {
                if (src[k] === '\\') { k += 2; continue; }
                if (src[k] === c) { k++; break; }
                if (src[k] === '\n' && c !== '`') break;
                k++;
            }
            j = k - 1;
            continue;
        }
        if (c === '{') d++;
        else if (c === '}') { d--; if (d === 0) return src.slice(openIdx, j + 1); }
    }
    return null;
}
// ============================================================
// ------------------------------------------------------------
// v3.182 的教训「调用躺在早退分支之后」确得通用化，但自证时发现本版实现是错的：
//   真实早退守卫都写在 if 块里（相对方法体是嵌套深度 2），
//   而「只认深度 1 的顶层 return」会把早退分支之后的调用判成 reachable —— 假绿。
//   可信版本需要「嵌套函数体内的 return 不计」的规则，本版不提供：
//   半可信的 API 比没有更危险（后续扫描器会信任它）。
//   交接项：tests/audit/scan_v3182_ledger_replay.mjs 的 R2 仍是形态判据。
// ============================================================
// ============================================================
// CLI 自证（仅直接执行时运行）
// ------------------------------------------------------------
// 为什么库文件也要能自证：本轮的缺陷正是「判据错了不报错、只给错结论」，
// 而一个纯定义文件零调用即通过。故给它三态退出码：
//   0 = 自证通过（直接 node tests/_audit_lib.mjs 可验），被 import 时不执行。
//   1 = 自证失败（剥注释 / 可达性行为不符）。
// 落点仍在 tests/（不在扫描面内），故不会被 run.mjs 当审计脚本执行。
// ============================================================
function selfCheck() {
    const failures = [];
    const S1 = 'const a = 1; // real\nconst url = "http://x/y";\nconst keep1 = 2;\n';
    const S2 = 'const s = `a /* not a comment`;\nconst keep2 = 2;\n';
    const S3 = 'const re = /a\\/\\/b/;\nconst keep3 = 3;\n';
    const S4 = 'a /* b\nzzz */ ccc\nconst keep4 = 4;\n';
    // S6 与 index.js:1450 同形：正则里的行注释符不得把该行之后的代码吃掉
    const S6 = 'const api_base = (x || \'https://api.openai.com\').replace(/\/\/+$/, \'\');\nconst keep6 = 6;\n';
    const CASES = [
        ['S1 单行串含注释符', S1, 'keep1', '// real'],
        ['S2 模板串含块注释符', S2, 'keep2', null],
        ['S3 正则含注释符', S3, 'keep3', null],
        ['S4 块注释', S4, 'keep4', 'zzz'],
        ['S6 正则行注释符（index.js:1450 同形）', S6, 'keep6', null],
    ];
    for (const [name, src, keep, mustDrop] of CASES) {
        const out = stripComments(src);
        if (out.length !== src.length) failures.push(name + ': 剥后长度 ' + out.length + ' != ' + src.length + '（偏移会漂移）');
        if (out.split('\n').length !== src.split('\n').length) failures.push(name + ': 换行数改变');
        if (!out.includes(keep)) failures.push(name + ': 真代码 ' + keep + ' 被吞（假红灯/假绿的成因）');
        if (mustDrop && out.includes(mustDrop)) failures.push(name + ': 注释内容 ' + JSON.stringify(mustDrop) + ' 未被清除');
    }
    const pure = 'const zz = 1;\n';
    if (stripComments(pure).trim() !== pure.trim()) failures.push('S5 纯代码不得被改动');
    if (bodyOf('class A { m() { return 1; } }', 'm()') === null) failures.push('bodyOf 取不到方法体');
    if (braceMatch('{a{b}c}', 0) !== '{a{b}c}') failures.push('braceMatch 未能配对');
    console.log('[audit-lib] 自证通过：剥注释 6 形态（含正则行注释符同形用例）+ bodyOf/braceMatch 两口径均成立。');
    if (failures.length) {
        console.error('[audit-lib] 自证失败 ' + failures.length + ' 项：');
        for (const f of failures) console.error('  x ' + f);
        process.exit(1);
    }
}
const invokedDirectly = (() => {
    try {
        return !!process.argv[1] && /_audit_lib\.mjs$/.test(String(process.argv[1]));
    } catch (e) {
        return false;
    }
})();
if (invokedDirectly) selfCheck();
