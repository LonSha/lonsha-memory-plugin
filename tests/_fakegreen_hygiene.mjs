/* ============================================================
 * tests/_fakegreen_hygiene.mjs —— 负控制卫生判据的**唯一真源** [v3.267.0 · A2 判据面卫生]
 * ------------------------------------------------------------
 * 为什么存在（本轮实测读数，不是整洁性偏好）：
 *   本仓「负控制」是判据体系的地基（本仓最贵的形态是「绿着，但绿的成因不是判据在守」）。
 *   实测现状：`tests/audit/` 下 17 份 `*_negctl.mjs`，`tests/` 下 93 份带 N 组的套件 ——
 *   **每份都各自决定「怎么破坏、怎么验」**，没有任何一处机检它们是否真的具备
 *   「真源码破坏 → 独立树上真跑 → 按归因翻红」这三件（v3.54.0 下游仓用 58 项历史遗留
 *   换来的同一条结论：判据族自己会腐坏，而不全量跑就看不见）。
 *
 *   本文件把「负控制卫生」从「27 份 fixture 各自的写法」收敛成一个**可机检的信号集**，
 *   并显式登记「哪些信号实测不饱和、故**不得**进硬判据」——后者是同一纪律的另一半：
 *   判据放宽（用不饱和信号做硬判据）会立刻产生假红，假红又会被读者当噪声忽略，
 *   最终结果与「没有判据」等价。
 *
 * 三形态假绿（本判据集治的就是这三形，对应 `scan_fakegreen_hygiene` 的 B 段）：
 *   ① 对原文件断言 —— 破坏没发生也绿。检出信号：K1（破坏必须落盘）+ K6（目标必须指向副本）。
 *   ② 破坏写死成模拟常量 —— 真判据根本没被调用。检出信号：K4（定点检查 / 统一破坏工具）。
 *   ③ 破坏把判据自己删了（自我指涉）—— 判据引用锚点串。检出信号：K5（归因必须来自被测门禁输出）。
 *
 * 只读：纯数据 + 纯函数，不读环境、不写盘、不改入参、不抛。
 * ============================================================ */

/**
 * 硬判据信号集（**实测 17/17 饱和**，2026-10-04 采样；不饱和的一律不入此表）。
 *   `why` 一栏写「它挡住的是哪种假绿」——改信号必须同时改这段理由，否则纪律会静默漂移。
 */
export const NEGCTL_SIGNALS = Object.freeze([
    { id: 'K1', re: /writeFileSync\s*\(/, why: '① 破坏必须落到盘上（不落盘 = 对原文件断言的第一形）' },
    { id: 'K2', re: /(spawnSync|execFileSync|execSync)\s*\(/, why: '被测门禁必须真跑（不是「读代码想象它会红」）' },
    { id: 'K3', re: /mkdtempSync\s*\(/, why: '独立树：破坏不得写进真仓库（否则负控制会污染后续跑批）' },
    { id: 'K4', re: /(\.split\([^)]*\)\.length\s*-\s*1|breakOnce|breakSource|breakText|mutateOnce|breakFile|assertSingleHit)/, why: '② 定点检查：锚点须恰中 1 次（否则破坏位置不可复现）' },
    { id: 'K5', re: /(expectAttr|includes\(|toContain|归因)/, why: '③ 按归因翻红（只验退出码会放过「因别的缺陷翻红」的空转）' },
    { id: 'K6', re: /(LONSHA_AUDIT_ROOT|path\.join\(dir|dir,)/, why: '① 目标必须指向副本（对真仓库断言 = 破坏没发生也绿）' },
    { id: 'K7', re: /rmSync\s*\(/, why: '清场：临时树必须回收（否则判据会污染下一次跑批）' },
    { id: 'K8', re: /process\.exit\([012]\)/, why: '三态出口（0 卫生 / 1 真缺陷 / 2 结构漂移）不得缺' },
    /* K9 阳性对照：**实测 17/17 饱和**（2026-10-04 逐份核实：`原版` 形态 17 份、
     *   `toExit0` 11 份、`N0-case`/`expectExit` 各 5 份 —— 三种写法都算，取并集即饱和）。
     *   【留痕】首版把它写在 ADVISORY 里、判据取 `code\s*[=:]=?\s*0|status...|expectStatus|===\s*0`，
     *   实测只 11/17 饱和 —— 那不是「6 份缺阳性对照」，是**判据自己的正则过窄**
     *   （漏了 `expectExit ... , 0` 与「N0-原版对照」两种本仓在用的写法）。
     *   这正是本仓的老毛病：把「我没想到的写法」读成「对方有缺陷」。 */
    { id: 'K9', re: /(原版|N0|expectExit|expectStatus|status\s*===\s*0|code\s*===\s*0)/, why: '阳性对照必须在场（只验破坏会翻红，会把「破坏写死成模拟常量」判成绿）' },
]);

/**
 * 观测性读数（**实测不饱和，故只报数、不阻断**）。
 *   写在这里而不是删掉：它们是下一步的门，删掉就等于「没人再知道还差什么」。
 */
export const NEGCTL_ADVISORY = Object.freeze([
    { id: 'A1', re: /(pass\+\+|fail\+\+|pass\s*=\s*0)/, note: '自计数出口 —— 实测 7/17 饱和：非必需（K5 已保证归因），仅作可读性读数' },
]);

/** 三形态假绿的名字（报告与判据共用，避免各处自己起名）。 */
export const FAKE_GREEN_FORMS = Object.freeze({
    posOriginal: '① 对原文件断言（破坏没发生也绿）',
    constFake: '② 破坏写死成模拟常量（真判据没被调用）',
    selfReferential: '③ 破坏把判据自己删了（自我指涉）',
});

/**
 * 对**剥掉注释后**的负控制源码判卫生。
 *   剥注释是必须的（`scan_break_kit` 的实测教训）：不剥时本仓负控制头注里逐字写着
 *   `mkdtempSync` / `writeFileSync`，于是头注本身就让信号集**看起来**饱和，判据空转。
 * @param {string} code 剥注释后的源码
 * @returns {{missing: string[], advisories: string[], ok: boolean}}
 */
export function auditNegctlSource(code) {
    const s = String(code == null ? '' : code);
    const missing = NEGCTL_SIGNALS.filter((g) => !g.re.test(s)).map((g) => g.id + ' ' + g.why);
    const advisories = NEGCTL_ADVISORY.filter((g) => !g.re.test(s)).map((g) => g.id + ' ' + g.note);
    return { missing, advisories, ok: missing.length === 0 };
}

/** 判据纯度自检（H5）：判据**自身**不得引用锚点字面量。
 *   把判据源码里出现过的「看起来像锚点」的长引号串数出来 —— 归因串（消息片段）是允许的，
 *   被破坏的源码片段不是。判据侧只检查**禁止清单**，避免把消息片段误杀。 */
export function judgeIsPure(judgeCode, anchors) {
    const bad = [];
    for (const a of anchors) {
        const body = String(judgeCode == null ? '' : judgeCode);
        if (body.includes(a)) bad.push(a.slice(0, 60));
    }
    return bad;
}