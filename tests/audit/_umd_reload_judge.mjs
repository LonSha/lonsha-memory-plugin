/* ============================================================
 * tests/audit/_umd_reload_judge.mjs — UMD 重载幂等的纯函数判定体 [v3.465.2]
 * ------------------------------------------------------------
 * 【它回答的唯一问题】
 *   「一个被 UMD/IIFE 尾巴包装的模块，在同一经典脚本上下文里被加载两次时，
 *     第二次会不会抛 SyntaxError？」
 *
 * 【为什么这个问题值一条判据】
 *   v3.461.0 把 36 个 R18 内核从 ESM 改成 UMD。改的时候只换了**尾巴**，
 *   类体仍留在文件顶层。于是这些文件长成：
 *       class Foo { ... }              ← 顶层词法声明（全局词法作用域）
 *       (function (root, factory) {    ← UMD 尾巴
 *           ...
 *       }(globalThis, function () { 'use strict'; return Foo; }));
 *   单看每一次加载都成功，`node --check` 也过 —— 因为**语法是合法的**。
 *   但 `class` / `const` / `let` 是 lexical binding，落在全局词法作用域里
 *   就**不允许二次声明**。同一 context 再跑一遍同一份源码 ⇒
 *   `SyntaxError: Identifier 'Foo' has already been declared`。
 *   实测：36 个文件全部命中，`scan_v3193_host_matrix.mjs` 的 M3 因此报「重复加载不幂等」，
 *   而 `v3159 [2d]`（健康树上每个审计脚本都必须过）被它拖红 —— 一条真缺陷，两处现形。
 *
 * 【为什么判据放在这里而不是只靠 M3】
 *   M3 是**运行时**观测：它只知道「抛了」，不知道「为什么抛」，也不知道
 *   「别的模块会不会也这么写」。而这条缺陷的成因是一个**形态**：
 *   「有 UMD 尾巴」+「尾巴外还有顶层词法声明」。形态可以被静态枚举，
 *   于是可以覆盖 manifest 全量 365 个模块，而不只是 M3 抽样到的那些。
 *   两层各司其职：本判定体判**形态**（快、全量、可离线证伪），
 *   M3 判**真实加载**（慢、抽样、证明形态确实会炸）。
 *
 * 【诚实边界】
 *   ① 本判定体不证明真机行为：它只看源码形态，不启动 SillyTavern；
 *      「宿主会不会真的重复加载同一份 extra_js」由宿主决定，本判定体不置评。
 *   ② 本判定体不判「UMD 尾巴本身写错」（factory 返回值与挂载名不一致那类）——
 *      那是 `v3461 A2/A3` 的事，此处不重复实现（两份实现即第二真源）。
 *   ③ 剥注释用的是**本文件自己的**最小剥离器，而非 `_audit_lib.mjs::stripComments`：
 *      判定体被要求「纯函数、不 import 任何东西」，才能被当夹具在任意源码上跑。
 *      这不是第二真源 —— 它只服务一个判据（找顶层词法声明），语义面远小于真源。
 *      为防漂移，判据侧 E2 会断言「本判定体与真源在真实文件上判定一致」。
 * ============================================================ */

export const QUESTION =
    '被 UMD/IIFE 包装的模块，在同一经典脚本上下文里加载第二次时会不会抛 SyntaxError？';

export const BOUNDARY = [
    '不证明真机行为：只看源码形态，不启动 SillyTavern、不判断宿主是否真的重复加载',
    '不判 UMD 尾巴本身写错（factory 返回值与挂载名不一致）—— 那是 v3461 A2/A3 的职责',
    '不承诺修复历史：形态改对只保证「从现在起可重载」，已发生的加载失败不在本判定体的证明范围内',
];

/** 最小剥注释：把 // 与 /* *\/ 换成等长空格，保留换行与偏移。
 *  字符串/模板串内的 // 不误伤（按引号状态机走）。
 *  不做正则字面量的完整识别 —— 本判定体只找行首词法声明，正则里的 // 不影响结论；
 *  这一点是**已知取舍**，写在这里而不是留给读者猜。 */
export function stripCommentsLite(src) {
    const out = [];
    let i = 0;
    const n = src.length;
    let q = null;
    while (i < n) {
        const c = src[i];
        if (q) {
            out.push(c);
            if (c === '\\') { out.push(src[i + 1] || ''); i += 2; continue; }
            if (c === q) q = null;
            i += 1;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') { q = c; out.push(c); i += 1; continue; }
        if (c === '/' && src[i + 1] === '/') {
            while (i < n && src[i] !== '\n') { out.push(' '); i += 1; }
            continue;
        }
        if (c === '/' && src[i + 1] === '*') {
            out.push(' '); out.push(' '); i += 2;
            while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
                out.push(src[i] === '\n' ? '\n' : ' ');
                i += 1;
            }
            if (i < n) { out.push(' '); out.push(' '); i += 2; }
            continue;
        }
        out.push(c);
        i += 1;
    }
    return out.join('');
}

/** UMD/IIFE 尾巴的起始行下标；没有则 -1。
 *  只认本仓既有的两种写法（`(function (root, factory)` 与 `(function (root, factory) {`），
 *  不做模糊猜测 —— 猜错的代价是「把裸脚本判成 UMD」，那是假红。 */
export function umdStartLine(lines) {
    for (let i = 0; i < lines.length; i++) {
        if (/^\(function\s*\(\s*root\s*,\s*factory\s*\)/.test(lines[i])) return i;
    }
    return -1;
}

/** 顶层（花括号深度 0）的词法声明。返回 [{line, kind, name}]（line 为 1 基）。
 *  只收 class/const/let/function —— `var` 不是 lexical binding，重复加载不抛，
 *  把它算进来会让判据过宽（假红），故**显式排除**并在此写明。 */
export function topLevelLexicalDecls(lines, upto) {
    const hits = [];
    let depth = 0;
    const end = upto < 0 ? lines.length : upto;
    for (let i = 0; i < end; i++) {
        const ln = lines[i];
        if (depth === 0) {
            const m = /^(class|const|let|function)\s+([A-Za-z_$][A-Za-z0-9_$]*)/.exec(ln);
            if (m) hits.push({ line: i + 1, kind: m[1], name: m[2] });
        }
        for (let j = 0; j < ln.length; j++) {
            const c = ln[j];
            if (c === '{') depth += 1;
            else if (c === '}') depth -= 1;
        }
        if (depth < 0) depth = 0;   // 容错：不因一处失配就静默返回空
    }
    return hits;
}

/** 主判定：给定一份源码，回答「它会不会在第二次加载时抛」。
 *  返回 {isUmd, umdLine, decls, issues}。
 *  `issues` 为空 = 形态安全；非空 = 每条都是可读的成因。 */
export function judgeSource(src) {
    const code = stripCommentsLite(src);
    const lines = code.split('\n');
    const umdLine = umdStartLine(lines);
    if (umdLine < 0) {
        return { isUmd: false, umdLine: -1, decls: [], issues: [] };
    }
    const decls = topLevelLexicalDecls(lines, umdLine);
    const issues = decls.map((d) =>
        `第 ${d.line} 行 \`${d.kind} ${d.name}\` 落在 UMD 尾巴（第 ${umdLine + 1} 行）之外 —— `
        + '顶层词法声明在全局作用域里不可二次声明，同一上下文加载第二次必抛 '
        + `SyntaxError: Identifier '${d.name}' has already been declared`);
    return { isUmd: true, umdLine: umdLine + 1, decls, issues };
}

/** 批量判定：files 为 [{file, src}]，返回 [{file, issues}]（只含有问题的）。 */
export function judgeAll(files) {
    const bad = [];
    for (const { file, src } of files) {
        const r = judgeSource(src);
        if (r.issues.length) bad.push({ file, umdLine: r.umdLine, issues: r.issues });
    }
    return bad;
}

/** 问题行展开成「人可读的一行一条」，供判据直接断言。 */
export function issueLines(bad) {
    const out = [];
    for (const b of bad) for (const i of b.issues) out.push(b.file + ' :: ' + i);
    return out;
}
