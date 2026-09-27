/* ============================================================
 * tests/_exit_codes.mjs —— 审计退出码三态的**唯一真源** [v3.247.0]
 * ------------------------------------------------------------
 * 为什么存在（本版实测，不是整洁性偏好）：
 *
 * ① 本仓审计面的退出码是**三分**语义（0 卫生 / 1 真缺陷 / 2 结构漂移），
 *    42 份脚本在注释里各自写了一遍「退出码：…」。注释不是判据 ——
 *    实测已经出现两种形态：
 *      · 有脚本**能** exit 2 但注释里没写（10 份）；
 *      · 有脚本注释里写着「2=结构漂移」而代码里 2 只在进程外（子进程）出现，
 *        自身从未 exit 2（本版实测）。
 *
 * ② 更贵的是「**归因**」这一层。`scan_resilience.mjs` 只有 0 与 2 两态：
 *    它检出的**真缺陷**（探测器零命中 = 本次结果不具证明力）也走 exit 2 ——
 *    而 2 的语义是「探测对象不在，无法给结论」。两种东西同码 ⇒
 *    `run.mjs` 汇总表里那一列 `status` 对读者**不可解释**：
 *    看到 2 的人分不清「门禁坏了」还是「代码坏了」。
 *
 * ③ 于是本文件把三态**收敛到一处**：一份表 + 一个 `shouldFail` 判定函数。
 *    读者（`tests/audit/scan_exit_codes.mjs`）逐脚本核对**能力与自述**，
 *    负控制（`tests/audit/scan_exit_codes_negctl.mjs`）用真源码破坏证明它真会翻红。
 *
 * 落点纪律：与 `_audit_lib.mjs` / `_fixture_sync.mjs` 同规范放在 `tests/` 下 ——
 *   放 `tests/audit/` 会被 `run.mjs` 的目录发现当成扫描器执行，纯定义文件零调用即以
 *   `exit 0` 判绿（本仓实测过 11 字节假绿）。
 *
 * 只读：纯数据 + 纯函数，不读环境、不写盘、不改入参、不抛。
 * ============================================================ */

import { stripComments } from './_audit_lib.mjs';

/** 三态的**稳定名**（数字会写错，名字不会）。 */
export const EXIT = Object.freeze({
    CLEAN: 0,
    DEFECT: 1,
    DRIFT: 2,
});

/**
 * 三态的语义表（**唯一一份**；注释里的自述必须与这里一致）。
 * `meaning` 是给人读的一句；`reachable` 说明**什么时候**该出现它。
 */
export const EXIT_TABLE = Object.freeze([
    { code: 0, name: 'clean', meaning: '卫生：判据跑完且没有发现真缺陷', when: '被检对象在位、探测器在工作、无缺陷' },
    { code: 1, name: 'defect', meaning: '真缺陷：判据的**检查对象**有问题', when: '代码/数据/清单本身违反判据（要改的是被检物）' },
    { code: 2, name: 'drift', meaning: '结构漂移：**探测器本身**失效，拒绝给结论', when: '被检对象缺失/被改名/下限不足/锚点过期（要改的是门禁或夹具）' },
]);

/** 自述行的规范形态：`退出码：0=…  1=…  2=…`（脚本注释里必须出现这三个数字） */
export const DECL_RE = /退出码[:：]([^\n]*)/;

/**
 * 从源码里抽出自述行里提到的码集合。
 * @param {string} src 源码
 * @returns {Set<number>} 自述提到的退出码（无自述行时为空集）
 */
export function declaredCodes(src) {
    const out = new Set();
    const m = DECL_RE.exec(String(src || ''));
    if (!m) return out;
    for (const d of m[1].matchAll(/(?<![0-9.])([012])(?![0-9])/g)) out.add(Number(d[1]));
    return out;
}

/**
 * 从源码里抽出**自身**能到达的码集合（只看自己的进程退出面）。
 *
 * 【两处判据自身缺陷留痕（v3.247.0 首跑暴露）】
 *  ① **exit 0 是隐式的**：不调用 `process.exit` 的脚本跑完即以 0 退出，所以
 *     「自述里有 0 而代码里搜不到 `process.exit(0)`」是**正常**的，不是缺陷。
 *     首版把它判成「注释里的能力」，一口气报出 12 条假红。修法：0 恒可达（Node 语义），
 *     并且在注释里写下来 —— 否则下一个人会再写一次同样的判据。
 *  ② **参数不能用 `[^)]*` 取**：`process.exit(shouldFail({ kind: 'drift' }))` 里第一个
 *     `)` 结束的是**内层** `{}` 调用，`[^)]*` 于是截出 `shouldFail({ kind: 'drift' }`（少一个
 *     闭合括号）⇒ 符号正则不匹配 ⇒ 误报「无法静态定值」。修法：**括号配对**取实参
 *     （本仓的老纪律：不靠正则猜结构；`declSegAt` 的注释里刚写过同款教训）。
 *
 *  ③ **判据不看注释**（首跑第 3 条假红）：本门禁自己的文件头注释里逐字写着
 *     `` `process.exit(<其它变量>)` ``，裸扫源码就把它当成「真代码里有一处动态退出」
 *     ⇒ 自己判自己红。修法：`reachableCodes` 先走 `stripComments`（**只认代码**是
 *     本仓纪律，`scan_audit_lib_consolidation` 的 E1 早就立过同款）。
 *
 * 认清四种形态：
 *   · `process.exit(1)` —— 字面量；
 *   · `process.exit(fail ? 1 : 0)` —— 三元（取其中的字面量集）；
 *   · `process.exit(EXIT.CLEAN)` / `process.exit(shouldFail({ kind: 'defect' }))`
 *     —— **规范符号拼写**（接入唯一真源后退出码走符号，静态读取器要认；
 *     否则「写法更好」反而被判成「归因不可核对」—— 那会把判据推向反向激励）；
 *   · `process.exit(<其它变量>)` —— 静态判不了，记 `dynamic` 交调用方按 fail-closed 处置。
 * @param {string} src
 * @returns {{codes:Set<number>, dynamic:boolean}}
 */
export function reachableCodes(src) {
    /* 只认代码：注释里写着 `process.exit(变量)` 不算动态退出（见上「缺陷③」） */
    const s = stripComments(String(src || ''));
    /* exit 0 恒可达（见上「缺陷①」）：脚本正常跑完就是 0，不需要显式写 */
    const codes = new Set([0]);
    let dynamic = false;
    const SYMBOL = [
        [/\bEXIT\.CLEAN\b|\bshouldFail\(\s*\{\s*kind:\s*'clean'\s*\}\s*\)/, 0],
        [/\bEXIT\.DEFECT\b|\bshouldFail\(\s*\{\s*kind:\s*'defect'\s*\}\s*\)/, 1],
        [/\bEXIT\.DRIFT\b|\bshouldFail\(\s*\{\s*kind:\s*'drift'\s*\}\s*\)/, 2],
    ];
    /** 括号配对取实参（不靠正则猜结构） */
    const argOf = (fromOpen) => {
        if (s[fromOpen] !== '(') return null;
        let depth = 0;
        for (let i = fromOpen; i < s.length; i++) {
            const c = s[i];
            if (c === '(') depth++;
            else if (c === ')') { depth--; if (depth === 0) return s.slice(fromOpen + 1, i); }
        }
        return null;    // 未闭合：如实返回 null（调用方按 dynamic 处置）
    };
    const consume = (arg) => {
        if (arg == null) { dynamic = true; return; }
        const lits = [...arg.matchAll(/(?<![0-9.])([012])(?![0-9])/g)].map((x) => Number(x[1]));
        if (lits.length) { for (const c of lits) codes.add(c); return; }
        let symbolic = false;
        for (const [re, code] of SYMBOL) {
            if (re.test(arg)) { codes.add(code); symbolic = true; }
        }
        if (!symbolic) dynamic = true;
    };
    for (const m of s.matchAll(/process\.exit\s*\(/g)) consume(argOf(m.index + m[0].length - 1));
    for (const m of s.matchAll(/process\.exitCode\s*=\s*([^;\n]+)/g)) consume(m[1]);
    return { codes, dynamic };
}

/**
 * 归因判定：某条发现应该落哪一态。
 *
 * 【为什么这条判据必须存在】本仓最贵的那种形态是「绿着，但绿的成因不是判据在守」。
 *   它有一个镜像形态：**红了，但红的成因不是检出缺陷** —— 反过来也成立：
 *   检出了真缺陷却报成「结构漂移」，读者会去修门禁而不是修代码。
 *   两种原因的处置**相反**，所以码必须不同。
 * @param {{kind:'defect'|'drift'}} finding
 * @returns {number} EXIT.DEFECT 或 EXIT.DRIFT
 */
export function shouldFail(finding) {
    const k = finding && finding.kind;
    if (k === 'drift') return EXIT.DRIFT;
    if (k === 'defect') return EXIT.DEFECT;
    return EXIT.DRIFT;      // 认不出的原因按 fail-closed 处理（结构漂移：拒绝给结论）
}

/** 三态盖满自证（判据自身要能回答「我的分类有没有漏」） */
export function selfConsistent() {
    const codes = EXIT_TABLE.map((r) => r.code);
    return codes.length === 3 && codes[0] === 0 && codes[1] === 1 && codes[2] === 2;
}

/** 审计脚本必须自述的三态（契约面：每个扫描器都要写全这三行） */
export const REQUIRED_CODES = Object.freeze([0, 1, 2]);