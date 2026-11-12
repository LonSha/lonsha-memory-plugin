/* ============================================================
 * tests/audit/_lib_handle_judge.mjs — L21-O9 判定体（纯函数，不碰 fs）
 * ------------------------------------------------------------
 * 治什么：`index.js` 里散着上百个 `_xxxLib()` 取库口。每个取库口的「真码」只有一行
 *   `_moduleLib(() => window.Xxx, 'xxx.js')`，但旁边往往有长注释说「本模块指向 xxx.js」。
 *   注释与真码是**两份可能漂移的声明**：改真码不改注释，读代码的人就被注释骗；
 *   同名两份（v3.444.0 的 `_eraContinuationLib`）则后者静默覆盖前者，自检拿到错的库。
 *   本判定体把「变量名 ↔ 目标全局名 ↔ 目标文件 ↔ 注释声称的文件名」四者做静态对账。
 *
 * 三分纪律（本仓反复用）：
 *   1. 抽不到就报 `slice-failed`，**不许当通过**；
 *   2. 分类单列计数，不许压成一个布尔（`duplicate` / `missingFile` / `globalNotMounted` /
 *      `commentMismatch` 四档，各档处置完全不同）；
 *   3. 豁免也双向：豁免表里登记了但实际已是缺口 ⇒ 红（防豁免表腐烂）。
 *
 * 诚实边界（写进 BOUNDARY，由判据钉住）：
 *   静态对账只证明「声明与真码文字一致」，**不能证明运行时取到了正确的库** ——
 *   例如模块能挂载但挂载名在第 200 行被另一次赋值覆盖，本判定看不见。
 * ============================================================ */

export const QUESTION = {
    handles: 'index.js 的每个 _xxxLib 取库口：目标文件必须在盘、挂载名必须真被挂上、注释声称的文件名不得与真码相左',
};

export const BOUNDARY =
    '本判定只做**静态**对账：证明「取库口声明 ↔ 磁盘真码 ↔ 注释」三者文字一致，' +
    '不能证明运行时真的取到了正确的库（同名二次赋值、条件分支里的覆盖挂载都在射程外）。' +
    '它绿的含义是「不可能因为改名/重名/写错文件名而静默取到错的库」，不是「取库一定成功」。';

/* 单函数注释的判据：块里出现这些词，说明这块注释是在说**紧邻的那一个**函数。 */
const SELF_WORDS = ['本模块', '本件', '本函数', '本取库口', '取库口指向', '本面'];
/* 区分语义：注释提到**别的**文件名，但明说是为了「别搞混」。这类不算注释说错。
 *   ★ 词表必须**指向「两件不是同一件事」这个概念本身**，不许放「不同」「与 `」这类泛词。
 *   实测教训（本文件第一次跑 A6 时被负控制当场抓住）：夹具写「本件与别件不同，故单独一个
 *   取库口」，因词表里有 `不同` 二字被误判成「显式区分」⇒ 真码指向 demo-new.js、注释声称
 *   demo-old.js 的真缺口被**放过**了。那正是「判据过宽 ⇒ 缺口静默通过」的形态，
 *   比漏报更坏（它会让人以为已经查过了）。故收紧成下面这几条完整短语。 */
const DISAMBIG_WORDS = ['不是同一件', '不是同一个', '不是一回事', '别合并', '不要合并', '别搞混', '两件名字像'];

/* ---------- 切片工具 ---------- */

/** 按花括号配平切出从 `startLine` 开始的函数体（0 基）。切不出来返回 null。 */
export function sliceBody(lines, startLine) {
    let depth = 0, started = false;
    const out = [];
    for (let i = startLine; i < Math.min(lines.length, startLine + 60); i++) {
        const l = lines[i];
        for (const ch of l) {
            if (ch === '{') { depth++; started = true; }
            else if (ch === '}') depth--;
        }
        out.push(l);
        if (started && depth === 0) return out.join('\n');
    }
    return null;
}

/** 向上取紧邻的连续注释块（0 基 `lineNo`）。遇到代码行即停。 */
export function commentAbove(lines, lineNo) {
    const out = [];
    let i = lineNo - 1;
    while (i >= 0) {
        const t = lines[i].trim();
        if (t === '') { out.unshift(lines[i]); i--; continue; }
        if (t.startsWith('*') || t.startsWith('/*') || t.startsWith('//') || t.endsWith('*/')) {
            out.unshift(lines[i]);
            if (t.startsWith('/*')) break;
            i--;
            continue;
        }
        break;
    }
    return out.join('\n');
}

/** 注释块是否被多个函数共享：块与函数之间若还夹着别的 `function` 声明则不是共享块 ——
 *  这个判断由调用方按「上一个 function 行号」给出（见 extractCommentOwnership）。 */
export function commentIsSelfScoped(comment) {
    return SELF_WORDS.some((w) => comment.includes(w));
}

export function commentHasDisambiguation(comment) {
    return DISAMBIG_WORDS.some((w) => comment.includes(w));
}

/** 注释里出现的所有 `.js` 文件名（小写开头，允许 `-` `_` `.`）。 */
export function claimedFiles(comment) {
    const set = new Set();
    for (const m of comment.matchAll(/([a-z][a-z0-9._-]*\.js)\b/g)) set.add(m[1]);
    return [...set];
}

/* ---------- 抽 index.js 的全部取库口 ---------- */

/** 返回 [{ name, line, body, comment, file, globalExpr }] 与 `nonModuleLib` 名单。 */
export function extractLibHandles(indexText) {
    const lines = String(indexText).split('\n');
    const declRe = /^\s*function\s+(_[A-Za-z0-9_$]*Lib)\s*\(/;
    const decls = [];
    for (let i = 0; i < lines.length; i++) {
        const m = declRe.exec(lines[i]);
        if (m) decls.push({ name: m[1], line: i + 1 });
    }
    /* `_moduleLib` 自身也是 `_xLib` 形态，但它是**取库原语**，不是取库口。单列，不算缺口。 */
    const PRIMITIVE = new Set(['_moduleLib']);

    /* 每个声明的「注释归属」：若该函数之前的注释块属于更早的另一个函数（块与函数之间
     * 没有新注释），则它是共享块。判法：取紧邻块，再看块上方紧跟的是否为另一个
     * `function _xxxLib` 的右花括号 —— 是则共享。这里用更稳的口径：块里出现 SELF_WORDS
     * 才算「在说本函数」，否则一律按「可能是分组注释」处理并在读数里单列。 */
    const rows = [];
    const nonModuleLib = [];
    for (const d of decls) {
        const body = sliceBody(lines, d.line - 1);
        if (body === null) {
            nonModuleLib.push({ name: d.name, line: d.line, body: null, why: 'slice-failed' });
            continue;
        }
        const cm = commentAbove(lines, d.line - 1);
        /* 真码：`_moduleLib(() => EXPR, 'file.js')`，允许跨行与多参。 */
        const mm = /_moduleLib\(\s*\(\)\s*=>\s*([A-Za-z0-9_$.]+)\s*,\s*'([^']+)'\s*\)/.exec(body);
        const calls = (body.match(/_moduleLib\s*\(/g) || []).length;
        rows.push({
            name: d.name,
            line: d.line,
            body,
            comment: cm,
            file: mm ? mm[2] : null,
            globalExpr: mm ? mm[1] : null,
            callCount: calls,
            primitive: PRIMITIVE.has(d.name),
        });
    }
    /* 同名重复 */
    const byName = new Map();
    for (const r of rows) {
        if (!byName.has(r.name)) byName.set(r.name, []);
        byName.get(r.name).push(r.line);
    }
    const duplicate = [...byName.entries()].filter(([, v]) => v.length > 1)
        .map(([name, ls]) => ({ name, lines: ls }));
    /* 非 `_moduleLib` 形态（含原语 `_moduleLib` 本身） */
    for (const r of rows) {
        if (!r.file && !r.primitive) nonModuleLib.push({ name: r.name, line: r.line, body: r.body, why: 'no-module-lib-call' });
    }
    return { rows, duplicate, nonModuleLib, total: rows.length, uniqueNames: byName.size };
}

/* ---------- 目标文件的挂载名 ---------- */

/** 从模块源码抽「疑似全局挂载名」。刻意**不枚举前缀白名单**（本仓实测有 window /
 *  global / globalThis / root / self / g 六种；写死白名单会把 `g.LonShaXxx` 判成没挂载 ——
 *  那是我第一版探针的假阳性来源）。改为「任意标识符 . 大写名 =」，
 *  代价可能收进 `this.X =`，但那只会让判据更松、不会虚报（宁可漏也不可虚报）。 */
export function mountedNamesOf(moduleText) {
    const s = String(moduleText);
    const names = new Set();
    for (const m of s.matchAll(/(?:^|[^.\w$])[A-Za-z_$][\w$]*\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*=(?!=)/gm)) names.add(m[1]);
    for (const m of s.matchAll(/(?:^|[^.\w$])[A-Za-z_$][\w$]*\s*\[\s*['"]([A-Za-z_$][A-Za-z0-9_$]*)['"]\s*\]\s*=(?!=)/gm)) names.add(m[1]);
    return [...names];
}

/* ---------- 主判定 ---------- */

/**
 * @param {string} indexText  index.js 源码
 * @param {(rel:string)=>string|null} readModule 按相对路径读模块源码，不存在返回 null
 * @param {{ exemptHandles?: Record<string,string> }} [opts] 豁免表：变量名 → 理由（必须非空）
 */
export function judgeLibHandles(indexText, readModule, opts = {}) {
    const exempt = opts.exemptHandles || {};
    const ex = extractLibHandles(indexText);

    const duplicate = ex.duplicate;
    const sliceFailed = ex.nonModuleLib.filter((r) => r.why === 'slice-failed');
    const missingFile = [];
    const globalNotMounted = [];
    const commentMismatch = [];
    const commentShared = [];
    const commentDisambiguated = [];
    const commentAbsent = [];
    const exemptViolations = [];

    for (const r of ex.rows) {
        if (r.primitive || !r.file) continue;
        const modText = readModule(r.file);
        if (modText === null) {
            missingFile.push({ name: r.name, line: r.line, file: r.file });
            if (exempt[r.name]) exemptViolations.push({ name: r.name, why: '豁免了但目标文件真的不在盘' });
            continue;
        }
        /* 挂载名 */
        const short = String(r.globalExpr || '').split('.').pop();
        const mounted = mountedNamesOf(modText);
        if (short && mounted.length && !mounted.includes(short)) {
            globalNotMounted.push({ name: r.name, line: r.line, file: r.file, want: short, mountedSample: mounted.slice(0, 8) });
        }
        /* 注释声称 */
        const claimed = claimedFiles(r.comment);
        if (claimed.length === 0) { commentAbsent.push({ name: r.name, line: r.line }); continue; }
        if (claimed.includes(r.file)) continue;                       // 一致
        if (!commentIsSelfScoped(r.comment)) { commentShared.push({ name: r.name, line: r.line, file: r.file, claimed }); continue; }
        if (commentHasDisambiguation(r.comment)) { commentDisambiguated.push({ name: r.name, line: r.line, file: r.file, claimed }); continue; }
        commentMismatch.push({ name: r.name, line: r.line, file: r.file, claimed });
    }

    /* 豁免双向：登记了豁免、但该项在真码上本来就没问题 ⇒ 也要红（防豁免表腐烂成垃圾桶）。
     *   例外：豁免项若属于「已确认的存量问题」允许留着 —— 但那样的项必须在这里被点名，
     *   故本判定不做这种宽容：豁免表只允许登记 `_moduleLib` 原语这一种。 */
    const rowsByName = new Map(ex.rows.map((r) => [r.name, r]));
    for (const name of Object.keys(exempt)) {
        if (String(exempt[name] || '').trim().length === 0) {
            exemptViolations.push({ name, why: '豁免理由为空' });
            continue;
        }
        const r = rowsByName.get(name);
        if (!r) { exemptViolations.push({ name, why: '豁免表里的变量名在 index.js 里不存在（名字写错或已删除）' }); continue; }
        if (!r.primitive) {
            /* 非原语却进了豁免 ⇒ 豁免表在替一个本该对账的取库口打掩护 */
            exemptViolations.push({ name, why: '豁免表只允许登记取库原语 _moduleLib；该名是真取库口，应参与对账' });
        }
    }

    const ok = duplicate.length === 0 && sliceFailed.length === 0 && missingFile.length === 0 &&
        globalNotMounted.length === 0 && commentMismatch.length === 0 && exemptViolations.length === 0;

    return {
        ok,
        total: ex.total,
        uniqueNames: ex.uniqueNames,
        duplicate,
        sliceFailed,
        missingFile,
        globalNotMounted,
        commentMismatch,
        /* 三类「不算缺口但必须可见」的读数，单列不合并 */
        commentShared,
        commentDisambiguated,
        commentAbsent,
        nonModuleLibOther: ex.nonModuleLib.filter((r) => r.why !== 'slice-failed'),
        exemptViolations,
    };
}
