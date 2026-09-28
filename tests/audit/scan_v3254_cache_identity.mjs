#!/usr/bin/env node
// 审计扫描器：M-O4 派生缓存身份统一 + 负载量测面（[v3.254.0]）
// ------------------------------------------------------------
// 为什么存在：
//   本版把「缓存凭什么说还有效」收成一处判据（cache-identity.js），把「长线规模与缓存负载」
//   立成可注入的量测台（cache-workload.js）。两个模块都极易**静默失效**：
//     · 模块没注册进 manifest.extra_js ⇒ 浏览器不加载 ⇒ `_cacheIdentityLib()` 恒 null ⇒
//       消费点「退回既有判据」，**不报错**，功能等于没上（本仓 scan_module_wiring 的 B3
//       正是为这种「引用了但没人供给」建的，本扫描器再从 M-O4 自己的契约面守一遍）；
//     · 身份位少一位（例如把 revision 丢掉）⇒ 换对话/回滚后仍命中旧注入，仍是**不报错只错结果**；
//     · 量测台「读不出也报 measured:true」⇒ 把测不出读成很便宜（本版实测修掉两处：坏时钟折成 0、
//       序列化失败读成 0 字节）；
//     · 判定把方向丢了（max/min 比值）⇒ **递减**曲线被判成超线性热点，给出「改产品」的建议。
//       §本版实测：settings 曲线 5.12→1.29→0.26→0.05 属亚线性，首稿却报 open-hotspot-candidate。
//   这四类都不会让任何既有门禁变红，故必须有一条判据钉在它们自己的契约面上。
//
// 判据（C 面；全部基于真文件内容与真模块装载，不靠文本猜测）：
//   C1 注册面：两个模块都在 manifest.extra_js 里，且文件真在场。
//   C2 身份位表：IDENTITY_KEYS 恰为会话/代际/修订/历史四位且顺序即契约。
//   C3 词表守卫：INVALIDATION_CAUSES 恰为计划点名的六词；REASONS 含 hit/no-current/no-id 三档。
//   C4 装载面：两个模块可装载且导出面齐备（缺导出即静默降级）；档位表含 1000/5000/10000。
//   C5 接线面：index.js 真引用两个全局符号，且五个宿主口各自在场（只认符号，不认注释）。
//   C6 判定方向：超线性须「边际逐段非降且首尾比 > 阈值」；亚线性须「首段/末段 > 阈值」；
//      钝钟**不得**产出 open-*。这是本版修掉的最大判定缺陷，故立成常驻判据。
//   C7 探针形态：`_m_o4_probe.mjs` 是探针不是扫描器（下划线前缀），不得进扫描器登记表；
//      登记表里的每一行必须真在磁盘上（退位项）。
//   C9 身份来源：`revision` 位**不得**读 `storage.getRevision()`（无条件自增的落盘计数器）——
//      每轮 save 都前进 ⇒ 缓存永不命中，形态：静默禁用缓存。两向都守：静态看这一位有没有被
//      写成那个来源；行为面用**真源码抽出的方法体**真跑（正向：同会话同代际 + 历史指纹逐字未
//      变 + 一次落盘 ⇒ 必须 hit；反向 1：换会话 ⇒ conversation-changed；反向 2：历史变 ⇒ history-changed）。
//      反向两条专防「为了压假阳把整位填成常量」（判据面自身失效）。
//
//   C8 结构健康：探测器失效即 exit 2，不得以全绿通过。
//
// 【判据与入口分离（v3253 F3 同纪律）】本文件导出 judge* 一批**纯函数判据**（输入即磁盘事实或
//   模块对象），并把它们组装成人读问题表。常驻套件 tests/v3254_cache_identity_and_workload.test.mjs
//   import 的正是这一批 —— 于是负控制可以「破坏真源码 → 拿被破坏的内容重跑**同一条**判据」，
//   而不是另写一份模拟判据（那是本仓 v3216 假红的根因）。
//
// 退出码：0=卫生  1=存在真缺陷（未注册/缺导出/接线缺失/判定方向错误）  2=结构漂移（探测器失效）
// 夹具通道：LONSHA_AUDIT_FIXTURE=1 放宽下限；LONSHA_AUDIT_ROOT=<dir> 指定仓库根。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { stripComments } from '../_audit_lib.mjs';

/* ============================================================
 * 判据面（纯函数：输入是磁盘内容或模块对象，输出是问题字符串数组）
 * ============================================================ */

/** 本版两个模块的契约面（顺序即报表顺序）。 */
export const MODS = [
    { file: 'cache-identity.js', global: 'LonShaCacheIdentity' },
    { file: 'cache-workload.js', global: 'LonShaCacheWorkload' },
];
export const EXPECTED_KEYS = ['chatId', 'epoch', 'revision', 'historyFingerprint'];
export const EXPECTED_CAUSES = ['switch', 'edit', 'delete', 'regen', 'import', 'restore'];
export const EXPECTED_PATHS = 'snapshot,candidate,serialize,settings';
/** 宿主五口：定义形态判据的完整名单（三个方法各写判据 + 两个 `function` 取库口）。 */
export const HOST_ENTRIES = ['_dataRevision', '_cacheIdentityOf', '_cacheIdentityStale'];
export const HOST_LIBS = ['_cacheIdentityLib', '_cacheWorkloadLib'];

/** C1 注册面：模块文件在场 + 在 manifest.extra_js 上（浏览器真的会加载）。 */
export function judgeRegistration(extra, diskHas) {
    const problems = [];
    for (const m of MODS) {
        if (!diskHas(m.file)) problems.push('C1 ' + m.file + ' 不在磁盘（模块被删/改名？）');
        if (!extra.includes(m.file)) problems.push('C1 ' + m.file + ' 未注册进 manifest.extra_js（浏览器不会加载 ⇒ 消费点恒退回旧判据，不报错）');
    }
    return problems;
}

/** C2 身份位表：恰四位且顺序即 key 拼装契约。 */
export function judgeIdentityKeys(CI) {
    const problems = [];
    if (!Array.isArray(CI.IDENTITY_KEYS)) return ['C4 cache-identity.js 未导出 IDENTITY_KEYS'];
    if (CI.IDENTITY_KEYS.join(',') !== EXPECTED_KEYS.join(',')) {
        problems.push('C2 身份位表漂移：实为 [' + CI.IDENTITY_KEYS.join(',') + ']，应为 [' + EXPECTED_KEYS.join(',')
            + ']（顺序即 key 拼装契约；少一位即换对话/回滚后仍命中旧注入）');
    }
    return problems;
}

/** C3 词表守卫：失效原因六词逐字；REASONS 三档可分。 */
export function judgeVocabularies(CI) {
    const problems = [];
    if (!Array.isArray(CI.INVALIDATION_CAUSES)) problems.push('C4 未导出 INVALIDATION_CAUSES');
    else if (CI.INVALIDATION_CAUSES.join(',') !== EXPECTED_CAUSES.join(',')) {
        problems.push('C3 失效原因词表漂移：实为 [' + CI.INVALIDATION_CAUSES.join(',') + ']，应为 ['
            + EXPECTED_CAUSES.join(',') + ']（调用方不得自创同义字，否则读数无法机检）');
    }
    if (!Array.isArray(CI.REASONS)) problems.push('C4 未导出 REASONS');
    else {
        for (const r of ['hit', 'no-current', 'no-id']) {
            if (!CI.REASONS.includes(r)) problems.push('C3 REASONS 缺 ' + r + '（「没带身份」与「判不了」与「一致」必须可分）');
        }
    }
    return problems;
}

/** C4 导出面：缺导出即静默降级（调用方拿到 undefined 只会退回旧口径）。 */
export function judgeExports(CI, WL) {
    const problems = [];
    if (CI.__loadError) problems.push('C4 cache-identity.js 装载失败：' + CI.__loadError);
    else {
        for (const fn of ['identityOf', 'identityKey', 'sameIdentity', 'diffIdentity', 'invalidate', 'causeOf', 'line']) {
            if (typeof CI[fn] !== 'function') problems.push('C4 cache-identity.js 缺导出函数 ' + fn + '（消费点会静默降级）');
        }
    }
    if (WL.__loadError) problems.push('C4 cache-workload.js 装载失败：' + WL.__loadError);
    else {
        for (const fn of ['curve', 'survey', 'repeatCost', 'report', 'bytesOf']) {
            if (typeof WL[fn] !== 'function') problems.push('C4 cache-workload.js 缺导出函数 ' + fn);
        }
        if (!Array.isArray(WL.SIZES) || !WL.SIZES.includes(1000) || !WL.SIZES.includes(5000) || !WL.SIZES.includes(10000)) {
            problems.push('C4 档位表缺计划点名的量级（须含 1000/5000/10000）');
        }
        if (!Array.isArray(WL.PATHS) || WL.PATHS.join(',') !== EXPECTED_PATHS) {
            problems.push('C4 消费路径表漂移：应为 ' + EXPECTED_PATHS);
        }
    }
    return problems;
}

/** C5 接线面：全局符号被引用 + 五个宿主口各有定义形态（注释不足以满足）。 */
export function judgeHostWiring(entryName, entryCode, doDef) {
    const problems = [];
    for (const m of MODS) {
        const re = new RegExp('\\bwindow\\s*\\.\\s*' + m.global + '\\b');
        if (!re.test(entryCode)) problems.push('C5 ' + entryName + ' 未引用 window.' + m.global + '（模块接线审计 B4 会在「挂载却零消费」时报它）');
    }
    for (const name of HOST_ENTRIES) {
        if (!doDef(name)) problems.push('C5 ' + entryName + ' 缺宿主口 ' + name + '()（消费点将各自手写判据，退回身份散点）');
    }
    for (const name of HOST_LIBS) {
        if (!doDef(name)) problems.push('C5 ' + entryName + ' 缺取库口 ' + name + '()');
    }
    return problems;
}

/**
 * 定义形态判据（导出版，供套件对**被破坏的文本**重跑同一条判据）。
 * 必须认两种形态：
 *   · 类方法简写 `_name(...) {`（本仓宿主口的主流形态）
 *   · 函数声明 `function _name(...) {`（M-O4 的两个取库口是这种）
 * 首稿只认前者 ⇒ 在真仓库上误报两条「缺取库口」（判据缺陷，非真缺陷；实测
 * `_cacheIdentityLib` 在 index.js:122、`_cacheWorkloadLib` 在 :130，都是 function 形态）。
 * 仍不用「注释里出现过的名字」：本式要求行首（可带空白）紧跟定义，注释行过不了。
 */
export function makeDefJudge(entryCode) {
    return (name) => new RegExp('^\\s*(?:function\\s+)?' + name + '\\s*\\([^)]*\\)\\s*\\{', 'm').test(entryCode);
}

/* ---------- C6 判定方向：用伪探针驱动真模块，不读源码文本 ---------- */
/** 伪探针的四型：不变 / 线性 / 亚线性 / 真超线性（本版修掉的正是后两型的区分）。 */
export const PSEUDO_SUITE = [
    { tag: 'constant', fn: (n) => 42, wantShape: 'linear', wantOpen: false },
    { tag: 'linear', fn: (n) => n * 10, wantShape: 'linear', wantOpen: false },
    { tag: 'sublinear', fn: (n) => Math.sqrt(n) * 100, wantShape: 'sublinear', wantOpen: false },
    { tag: 'quadratic', fn: (n) => n * n, wantShape: 'superlinear', wantOpen: true },
];
export const CURVE_SIZES = [0, 100, 200, 400, 800];

/**
 * 方向假绿的判别集（**形状不变**的驱动）：这几个形态在修前修后**会得到同一个 `shape`**，
 * 差别只在「有没有 open 旗标」—— 而首稿的 `maxSlope/minSlope > 1.5` 恰恰只看比值、不看方向。
 * §下列斜率是**实测**（本仓 cache-workload.js 真模块跑出来的，不是推算）。
 * 【先记一条口径】：本模块的 `slope` 数组是**相对空点的累计均斜率**（`(b(n)−b(0))/n`），
 *   不是逐段边际 —— 所以设计判别集时必须按这个口径算，否则「我以为的 V 形」在读数里看不见。
 *   · `sublinear`（100·√n）：斜率 [10, 7.07, 5, 3.54] **递减**，首/末 = 2.83 > 1.5 ⇒ 判 `sublinear`；
 *     而首稿 max/min = 2.82 > 1.5 ⇒ **假报超线性热点**（与本版实测的 settings 曲线同型）。
 *   · `v-shaped`（读数先缓后陡）：斜率 [5, 3, 1.75, 5]，首/末 = 1.0 ⇒ 判 `linear`（两端一样陡）；
 *     而首稿 max/min = 2.86 > 1.5 ⇒ 同样假报超线性热点（比值纯属中段低谷造出来的）。
 *   · `dip-then-surge`（读数先陡、中间平、末段又陡）：斜率 [10, 5.25, 2.88, 25]，首/末 = 0.4 ⇒ 判 `linear`；
 *     而首稿 max/min = 8.68 > 1.5 ⇒ 假报热点。这一型**只有「逐段非降」那道闸挡得住** ——
 *     末段/首段 = 2.5 > 1.5（比值的另一端也超阈），光看首尾比会漏。
 *   · 三者在新旧两版都判同一个 `shape`，故它们驱动的不是「形状标签」而是 open 旗标 ——
 *     只有这样才测得出「结论说支持、证据不支持」这条本版最大的缺陷（可复现，不靠读源码文本）。
 */
export const OPEN_FLAG_CASES = [
    { tag: 'sublinear', fn: (n) => Math.sqrt(n) * 100, wantShape: 'sublinear', wantOpen: false },
    {
        tag: 'v-shaped',
        /* 实测读数：b = [0, 500, 600, 700, 4000]（档位 0/100/200/400/800）⇒ 均斜率 [5, 3, 1.75, 5]。 */
        fn: (n) => (n <= 100 ? n * 5 : (n <= 200 ? 500 + (n - 100) : (n <= 400 ? 600 + (n - 200) / 2 : 700 + 8.25 * (n - 400)))),
        wantShape: 'linear',
        wantOpen: false,
    },
    {
        tag: 'dip-then-surge',
        /* 实测读数：b = [0, 1000, 1050, 1100, 20000] ⇒ 均斜率 [10, 5.25, 2.88, 25]。 */
        fn: (n) => (n <= 100 ? n * 10 : (n <= 200 ? 1000 + (n - 100) / 2 : (n <= 400 ? 1100 + (n - 200) / 4 : 1200 + 47 * (n - 400)))),
        wantShape: 'linear',
        wantOpen: false,
    },
    { tag: 'quadratic', fn: (n) => n * n, wantShape: 'superlinear', wantOpen: true },
];

/** 由「读数函数」造一个探针（bytes 直接取读数值）。 */
export function pseudoProbe(fn) {
    return { build: (n) => n, read: (n) => fn(n), bytes: (o) => o };
}

/**
 * C6-a 形状分型：四型伪探针（不变/线性/亚线性/超线性）+ 钝钟下不得报 measured:true。
 */
export function judgeShape(WL) {
    const problems = [];
    if (typeof WL.curve !== 'function') return problems;
    for (const c of PSEUDO_SUITE) {
        const r = WL.curve('probe', pseudoProbe(c.fn), { sizes: CURVE_SIZES });
        if (r.measured !== true) { problems.push('C6 伪探针 ' + c.tag + ' 竟测不出（reason=' + r.reason + '）'); continue; }
        if (r.shape !== c.wantShape) {
            problems.push('C6 方向判定错误：' + c.tag + ' 应为 ' + c.wantShape + '，实为 ' + r.shape
                + '（斜率 ' + JSON.stringify(r.slope) + '）——「把方向丢了」会让递减曲线假报超线性热点');
        }
        if (c.wantOpen !== (r.recommendation === 'open-hotspot-candidate')) {
            problems.push('C6 ' + c.tag + ' 的推荐位错：' + r.recommendation + '（只有真超线性才许 open-*）');
        }
    }
    /* 钝钟（注入时钟说非有限数）⇒ 必须报测不出，**不得**报「耗时 0」。
       本版修前：NaN 折成 0 ⇒ 曲线 measured:true 且 ms 全 0（把测不出读成很便宜）。 */
    const bad = WL.curve('probe', pseudoProbe((n) => n), { sizes: CURVE_SIZES, clock: { now: () => NaN } });
    if (bad.measured === true) problems.push('C6 钝钟下曲线仍报 measured:true（「时钟坏了」被读成「耗时 0」）');
    return problems;
}

/**
 * C6-b open 旗标的方向性：**形状不变**的判别集（见 `OPEN_FLAG_CASES` 头注）。
 * 这一条是「结论说支持、证据不支持」的常驻防线：比值大的递减/V 形曲线**永远**不得拿到 open-*。
 */
export function judgeOpenFlag(WL) {
    const problems = [];
    if (typeof WL.curve !== 'function') return problems;
    for (const c of OPEN_FLAG_CASES) {
        const r = WL.curve('probe', pseudoProbe(c.fn), { sizes: CURVE_SIZES });
        if (r.measured !== true) { problems.push('C6 ' + c.tag + ' 竟测不出（reason=' + r.reason + '）'); continue; }
        const opened = r.recommendation === 'open-hotspot-candidate';
        if (opened !== c.wantOpen) {
            problems.push('C6 ' + c.tag + '（shape=' + r.shape + '，斜率 ' + JSON.stringify(r.slope) + '）'
                + (c.wantOpen ? '是真超线性却没 open（漏报热点）' : '被给了 open-* —— 证据不支持却让产品改（计划原文禁的形态）'));
        }
        if (c.wantShape !== r.shape) problems.push('C6 ' + c.tag + ' 的形状夹带漂移：' + r.shape + ' ≠ ' + c.wantShape);
    }
    return problems;
}

/**
 * C6-c 重复读取读数：坏钟与钝钟必须**不同形**，可控钟必须真给出比值。
 *   · 坏钟（`now()` 说 NaN）⇒ `clock-nonfinite`（时钟坏了）；
 *   · 钝钟（`now()` 恒 0，单次读恰为 0）⇒ `clock-resolution-too-coarse`（读得比时钟还快）。
 * 两者若同形，读者就分不出「读数不可信」与「这次读太快」—— 正是本仓最贵的那类退化。
 */
export function judgeRepeatReasons(WL) {
    const problems = [];
    if (typeof WL.repeatCost !== 'function') return problems;
    const dead = WL.repeatCost(pseudoProbe((n) => n), { n: 100, repeat: 5, clock: { now: () => NaN } });
    if (dead.measured === true) problems.push('C6 坏钟下 repeatCost 仍报 measured:true');
    if (dead.reason !== 'clock-nonfinite') problems.push('C6 坏钟（NaN）的原因应为 clock-nonfinite，实为 ' + dead.reason);
    const coarse = WL.repeatCost(pseudoProbe((n) => n), { n: 100, repeat: 5, clock: { now: () => 0 } });
    if (coarse.redundancy !== null) problems.push('C6 钝钟下 repeatCost 不得给出比值（分母为 0 的比值无意义）');
    if (coarse.reason !== 'clock-resolution-too-coarse') {
        problems.push('C6 钝钟（恒 0）的原因应为 clock-resolution-too-coarse，实为 ' + coarse.reason
            + '（「时钟坏了」与「读得比时钟还快」必须不同形）');
    }
    if (dead.reason === coarse.reason) problems.push('C6 坏钟与钝钟被读成同一件事（两态必须不同形）');
    /* 可控时钟下必须真给出比值 —— 否则上面几条可能只是「永远测不出」的假绿。 */
    const okRepeat = (() => { let t = 0; return WL.repeatCost({ build: (n) => n, read: (n) => { t += 2; return n; } }, { n: 100, repeat: 5, clock: { now: () => t } }); })();
    if (okRepeat.measured !== true || okRepeat.redundancy !== 5) {
        problems.push('C6 可控时钟下 repeatCost 应给出 redundancy=5，实为 ' + JSON.stringify(okRepeat));
    }
    return problems;
}

/* ---------- C9 \u8eab\u4efd\u6765\u6e90\uff1arevision \u4f4d\u4e0d\u5f97\u8bfb\u300c\u65e0\u6761\u4ef6\u81ea\u589e\u7684\u843d\u76d8\u8ba1\u6570\u5668\u300d ---------- */

/**
 * \u4ece\u5165\u53e3\u6e90\u7801\u91cc\u62bd\u51fa**\u771f\u65b9\u6cd5\u4f53**\uff08\u82b1\u62ec\u53f7\u914d\u5e73\uff09\u3002
 * \u951a\u70b9\u5fc5\u987b**\u5b58\u5728\u4e14\u552f\u4e00**\uff08\u91cd\u540d/\u91cd\u590d\u5b9a\u4e49 \u21d2 \u8fd4 error\uff0c\u7edd\u4e0d\u6311\u7b2c\u4e00\u6761\u786c\u8dd1\uff09\uff1b
 * \u4e0d\u914d\u5e73\u5373\u8fd4 error \u2014\u2014 \u5224\u636e\u4e0d\u5f97\u5bf9\u534a\u4e2a\u65b9\u6cd5\u4f53\u65ad\u8a00\u3002
 * \u4e3a\u4ec0\u4e48\u8981\u62bd\u771f\u6e90\u7801\uff1a\u672c\u4ed3\u8bb0\u8fc7\u4e24\u79cd\u8d1f\u63a7\u5236\u5047\u7eff\uff08\u2460\u5bf9\u539f\u6587\u4ef6\u65ad\u8a00\uff1b\u2461\u7834\u574f\u5199\u6b7b\u6210\u6a21\u62df\u5e38\u91cf\uff09\uff0c
 * \u552f\u4e00\u53ef\u4fe1\u5f62\u6001\u662f\u300c\u771f\u6e90\u7801\u7834\u574f \u2192 \u62bd\u540c\u4e00\u6bb5 \u2192 \u7528\u540c\u4e00\u6761\u5224\u636e\u91cd\u8dd1\u300d\u3002
 */
export function methodBody(text, anchor) {
    if (typeof text !== 'string' || !text) return { error: '\u5165\u53e3\u6e90\u7801\u4e0d\u53ef\u8bfb\uff08\u7ed3\u6784\u6f02\u79fb\uff09' };
    const a = String(anchor || '');
    if (!a.trim().endsWith('{')) return { error: '\u951a\u70b9\u9808\u4ee5 \u0060{\u0060 \u7ed3\u5c3e\uff1a' + a };
    const i = text.indexOf(a);
    if (i < 0) return { error: '\u951a\u70b9\u4e0d\u5b58\u5728\uff1a' + a };
    if (text.indexOf(a, i + 1) >= 0) return { error: '\u951a\u70b9\u4e0d\u552f\u4e00\uff08\u91cd\u540d/\u91cd\u590d\u5b9a\u4e49\uff09\uff1a' + a };
    /* 配平走剥注释副本（等长，索引对齐）：注释里的花括号不得弄乱边界。 */
    const masked = stripCommentsKeepLength(text);
    let depth = 0;
    for (let k = i + a.length - 1; k < text.length; k++) {
        const c = masked.charAt(k);
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return { text: text.slice(i, k + 1), body: text.slice(i + a.length, k) }; }
    }
    return { error: '\u82b1\u62ec\u53f7\u4e0d\u914d\u5e73\uff08\u65b9\u6cd5\u4f53\u88ab\u622a\u65ad\uff09\uff1a' + a };
}

/** `_cacheIdentityOf()` \u7684\u5b9a\u4e49\u5f62\u6001\uff08\u884c\u9996\u53ef\u5e26\u7a7a\u767d\uff1b\u5fc5\u987b\u5e26 `()`\uff0c\u907f\u514d\u5339\u914d\u5230\u8c03\u7528\u70b9\uff09\u3002 */
/**
 * 剥掉注释（保长：代码位以空格占位、换行不动）。
 *
 * **唯一真源：`tests/_audit_lib.mjs` 的 `stripComments`** —— 本名保留为
 *   delegating 薄包装（v3254/v3255 两个套件按此名 import）。
 *
 * 【留痕：本函数首稿在此**本地重写**了一份（等长占位的自写状态机），\n *   被 `tests/audit/scan_audit_lib_consolidation.mjs` 的 E1 当场判红：
 *   「tests/audit/scan_v3254_cache_identity.mjs 仍在本地重写 stripComments」。
 *   而它确实与真源**同语义**（真源同样认字符串 / 模板串 / 正则字面量，
 *   且 `blank()` 保长），故不属于「语义确实不同」那一类（EXEMPT 登记的是后者）。
 *   这正是「唯一真源」要收的那类重复 ⇒ 改为转调，而不是改名绕过。
 *
 * 一个真实差别（实测）：真源额外认**正则字面量**（本仓 index.js 里有 `//` 形的正则，
 *   本地自写版会误判成行注释而吞掉该行真代码）—— 这是归并后**变好**的那一步。
 */
export const stripCommentsKeepLength = (text) => stripComments(text);

/** 形态判据的归一化：只保留结构字符，所以判据里不需要正则转义。 */
export function normForMatch(text) {
    return String(text || '').replace(new RegExp('[^A-Za-z0-9_$().]+', 'g'), '');
}

/** 被禁的来源（落盘计数器）的针：命中即「该位被填成每轮都在变的读数」。 */
export const REV_SOURCE_NEEDLE = 'this.storage.getRevision(';

export const IDENTITY_ANCHOR_RE = /\n[ \t]*_cacheIdentityOf\s*\(\s*\)\s*\{/;

/**
 * C9 \u8eab\u4efd\u6765\u6e90\uff08\u4e24\u5411\u90fd\u5b88\uff09\uff1a
 *   \u2460 \u9759\u6001\uff1a`_cacheIdentityOf()` \u91cc**\u4e0d\u5f97**\u51fa\u73b0 `this.storage.getRevision()` \u2014\u2014
 *      \u90a3\u662f\u65e0\u6761\u4ef6\u81ea\u589e\u7684\u843d\u76d8\u8ba1\u6570\u5668\uff08\u6bcf\u6b21 save \u524d\u8fdb\uff09\uff0c\u6df7\u8fdb\u8eab\u4efd \u21d2 \u7f13\u5b58\u6c38\u4e0d\u547d\u4e2d\uff1b
 *   \u2461 \u884c\u4e3a\uff1a\u7528**\u771f\u6e90\u7801\u62bd\u51fa\u7684\u65b9\u6cd5\u4f53**\u771f\u8dd1\uff08`new Function` \u91cd\u5efa + `call(host)`\uff09\uff1a
 *      \u00b7 \u6b63\u5411\uff1a\u540c\u4f1a\u8bdd\u540c\u4ee3\u9645\u3001\u5386\u53f2\u6307\u7eb9\u9010\u5b57\u672a\u53d8\u3001\u671f\u95f4\u843d\u76d8\u4e00\u6b21 \u21d2 `reason === 'hit'`\uff1b
 *      \u00b7 \u53cd\u5411 1\uff1a\u6362\u4f1a\u8bdd \u21d2 `conversation-changed`\uff1b
 *      \u00b7 \u53cd\u5411 2\uff1a\u5386\u53f2\u6307\u7eb9\u53d8 \u21d2 `history-changed`\u3002
 *      \u4e24\u6761\u53cd\u5411\u4e13\u9632\u300c\u4e3a\u4e86\u538b\u5047\u9633\u628a\u6574\u4f4d\u586b\u6210\u5e38\u91cf\u300d\uff08\u5224\u636e\u9762\u81ea\u8eab\u5931\u6548\uff09\u3002
 * @param {object} CI cache-identity.js \u771f\u6a21\u5757
 * @param {string} entryCode \u5165\u53e3\u6e90\u7801
 */
export function judgeIdentitySource(CI, entryCode) {
    const problems = [];
    if (typeof entryCode !== 'string' || !entryCode) {
        return ['C9 \u5165\u53e3\u6e90\u7801\u4e0d\u53ef\u8bfb\uff08\u5224\u636e\u62ff\u4e0d\u5230\u771f\u6e90\u7801 \u2014\u2014 \u7ed3\u6784\u6f02\u79fb\u4e0d\u662f\u300c\u6ca1\u95ee\u9898\u300d\uff09'];
    }
    const hit = IDENTITY_ANCHOR_RE.exec(entryCode);
    if (!hit) return ['C9 \u5165\u53e3\u91cc\u627e\u4e0d\u5230 `_cacheIdentityOf()` \u5b9a\u4e49\uff08\u951a\u70b9\u6d88\u5931 \u21d2 \u5224\u636e\u5fc5\u987b\u8f6c\u7ea2\uff0c\u4e0d\u5f97\u9759\u9ed8\u653e\u884c\uff09'];
    const blk = methodBody(entryCode, hit[0]);
    if (blk.error) return ['C9 ' + blk.error];
    /* 判据纯度（H5/W9 同纪律）：在**剥掉注释**的副本上下结论 —— 头注里逐字引用了这个来源，直接匹原文会假红。 */
    if (normForMatch(stripCommentsKeepLength(blk.text)).includes(REV_SOURCE_NEEDLE)) {
        problems.push('C9 `_cacheIdentityOf()` \u7684 revision \u4f4d\u8bfb\u4e86 `storage.getRevision()` \u2014\u2014 \u90a3\u662f**\u65e0\u6761\u4ef6**\u81ea\u589e\u7684\u843d\u76d8\u8ba1\u6570\u5668'
            + '\uff08`save()` \u6bcf\u6b21\u524d\u8fdb\uff09\uff0c\u6545\u540c\u4e00\u697c\u6bcf\u7f16\u8f91/swipe/\u5220\u697c\u4e00\u6b21\u547d\u4e2d\u68c0\u67e5\u5c31\u6362\u8bfb\u6570 \u21d2 \u7f13\u5b58\u6c38\u4e0d\u547d\u4e2d\uff08\u9759\u9ed8\u7981\u7528\u7f13\u5b58\uff0c'
            + '\u8ba1\u5212\u539f\u6587\u7981\u7684\u5f62\u6001\uff09\u3002\u672c\u5f15\u64ce\u4e0d\u81ea\u884c\u586b\u8fd9\u4e00\u4f4d\uff08\u5199 `null` \u21d2 key \u91cc `r-`\uff09\u3002');
    }
    if (!CI || typeof CI.invalidate !== 'function') return problems.concat(['C9 cache-identity.js \u7684 invalidate \u4e0d\u53ef\u7528\uff08\u65e0\u6cd5\u505a\u884c\u4e3a\u9762\u5224\u636e\uff09']);
    let fn = null;
    try { fn = new Function('errLog', 'return function(){' + blk.body + '}')(() => {}); }
    catch (e) { return problems.concat(['C9 \u771f\u6e90\u7801\u65b9\u6cd5\u4f53\u65e0\u6cd5\u91cd\u5efa\uff08\u8bed\u6cd5\u6f02\u79fb\uff09\uff1a' + String((e && e.message) || e)]); }
    const mkHost = (chatId, fp, rev0) => {
        let rev = Number(rev0) || 0;
        return {
            getCurrentChatId: () => chatId,
            _mutationEpoch: 3,
            _dataRevision: () => fp,
            storage: { getRevision: () => rev, save: () => { rev += 1; return true; } },
        };
    };
    const call = (host) => { try { return fn.call(host); } catch (e) { return { __err: String((e && e.message) || e) }; } };
    const A = mkHost('chat-A', 'abc123_40', 0);
    const idBefore = call(A);
    if (idBefore && idBefore.__err) return problems.concat(['C9 \u771f\u6e90\u7801\u65b9\u6cd5\u4f53\u771f\u8dd1\u629b\u4e86\uff1a' + idBefore.__err]);
    A.storage.save();
    const idAfter = call(A);
    if (!idBefore || !idAfter) { problems.push('C9 \u771f\u6e90\u7801\u65b9\u6cd5\u4f53\u8fd4\u56de\u7a7a\uff08\u8eab\u4efd\u8bfb\u4e0d\u51fa\u6765\uff0c\u884c\u4e3a\u9762\u5224\u636e\u5931\u6548\uff09'); return problems; }
    const r = (() => { try { return CI.invalidate(idBefore, idAfter, {}); } catch (e) { return { __err: String((e && e.message) || e) }; } })();
    if (r && r.__err) return problems.concat(['C9 invalidate() \u629b\u4e86\uff1a' + r.__err]);
    if (r.stale !== false || r.reason !== 'hit') {
        problems.push('C9 \u6b63\u5411\u5931\u8d25\uff1a\u540c\u4f1a\u8bdd\u540c\u4ee3\u9645\u3001\u5386\u53f2\u6307\u7eb9\u9010\u5b57\u672a\u53d8\uff0c\u4ec5\u843d\u76d8\u4e00\u6b21\uff0c\u5374\u5224 `' + r.reason + '`'
            + '\uff08' + r.from + ' \u2192 ' + r.to + '\uff09\u2014\u2014 \u8eab\u4efd\u91cc\u6df7\u8fdb\u4e86\u300c\u6bcf\u8f6e\u90fd\u5728\u53d8\u300d\u7684\u8bfb\u6570');
    }
    const B = mkHost('chat-B', 'abc123_40', 1);
    const r1 = CI.invalidate(call(A), call(B), {});
    if (r1.reason !== 'conversation-changed') {
        problems.push('C9 \u53cd\u5411 1 \u5931\u8d25\uff1a\u6362\u4f1a\u8bdd\u672a\u5224 conversation-changed\uff08\u5b9e\u4e3a `' + r1.reason + '`\uff09\u2014\u2014 \u5224\u636e\u9762\u81ea\u8eab\u5931\u6548\uff08\u4e0d\u662f\u4ea7\u54c1\u7f3a\u9677\uff09');
    }
    const C2 = mkHost('chat-A', 'def456_41', 1);
    const r2 = CI.invalidate(call(A), call(C2), {});
    if (r2.reason !== 'history-changed') {
        problems.push('C9 \u53cd\u5411 2 \u5931\u8d25\uff1a\u5386\u53f2\u6307\u7eb9\u53d8\u672a\u5224 history-changed\uff08\u5b9e\u4e3a `' + r2.reason + '`\uff09\u2014\u2014 \u5224\u636e\u9762\u81ea\u8eab\u5931\u6548\uff08\u4e0d\u662f\u4ea7\u54c1\u7f3a\u9677\uff09');
    }
    return problems;
}

/** C6 合成入口（扫描器用它；套件按需分别调三个子判据做定向负控制）。 */
export function judgeDirection(WL) {
    return [].concat(judgeShape(WL), judgeOpenFlag(WL), judgeRepeatReasons(WL));
}

/* ---------- C7 探针形态 ---------- */
/** 探针文件名形态：下划线前缀 + 含 probe（恒 exit 0，故不得进灵敏度矩阵）。 */
export const PROBE_RE = /^_.*probe.*\.mjs$/;

/** C7：探针不得登记进扫描器矩阵；矩阵里的每一行必须真在磁盘上。 */
export function judgeProbeShape(probeFiles, matrixText, diskHas) {
    const problems = [];
    if (matrixText) {
        for (const p of probeFiles) {
            if (matrixText.split('\n').some((l) => l.startsWith(p + '\t'))) {
                problems.push('C7 探针 ' + p + ' 被登记进扫描器灵敏度矩阵（探针恒 exit 0，登记会让 H/G/T 三列失去意义）');
            }
        }
        for (const line of matrixText.split('\n')) {
            const t = line.trim();
            if (!t || t.startsWith('#')) continue;
            const f = t.split('\t')[0];
            if (!diskHas(path.join('tests', 'audit', f))) problems.push('C7 矩阵登记了不存在的扫描器 ' + f);
        }
    }
    return problems;
}

/* ============================================================
 * 入口（只在直接执行时跑；被 import 时纯函数面可用）
 * ============================================================ */

const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();

function failClosed(msg) {
    console.error('[m-o4-identity] ' + msg);
    process.exit(2);
}

/** 装载真模块（CJS 优先，退化到 ESM 动态导入）。 */
export async function loadModule(root, rel) {
    const require_ = createRequire(path.join(root, 'noop.cjs'));
    try { return require_(path.join(root, rel)); }
    catch (_e) {
        try {
            const m = await import(pathToFileURL(path.join(root, rel)).href);
            return m.default || m;
        } catch (e2) { return { __loadError: String((e2 && e.message) || e2) }; }
    }
}

export function readIf(p) {
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

export async function runAll(root) {
    const problems = [];
    const manifestRaw = readIf(path.join(root, 'manifest.json'));
    if (!manifestRaw) failClosed('读不到 manifest.json（工作目录可能不对：' + root + '）');
    let manifest;
    try { manifest = JSON.parse(manifestRaw); }
    catch (e) { failClosed('manifest.json 不是合法 JSON：' + e.message); }
    const entry = manifest.js || 'index.js';
    const entryCode = readIf(path.join(root, entry));
    if (!entryCode || entryCode.length < 1000) failClosed('读不到/退化的入口 ' + entry + '（结构漂移）');
    const extra = Array.isArray(manifest.extra_js) ? manifest.extra_js : [];
    const diskHas = (rel) => fs.existsSync(path.join(root, rel));

    problems.push(...judgeRegistration(extra, diskHas));

    const CI = await loadModule(root, 'cache-identity.js');
    const WL = await loadModule(root, 'cache-workload.js');
    if (!CI.__loadError) {
        problems.push(...judgeIdentityKeys(CI));
        problems.push(...judgeVocabularies(CI));
    }
    problems.push(...judgeExports(CI, WL));
    problems.push(...judgeHostWiring(entry, entryCode, makeDefJudge(entryCode)));
    if (!WL.__loadError) problems.push(...judgeDirection(WL));
    /* C9 身份来源：静态 + 行为两面都守（CI 未装载时也要跑 —— 静态面不依赖模块）。 */
    problems.push(...judgeIdentitySource(CI, entryCode));

    const AUDIT_DIR = path.join(root, 'tests', 'audit');
    let probeFiles = [];
    if (fs.existsSync(AUDIT_DIR)) {
        probeFiles = fs.readdirSync(AUDIT_DIR).filter((f) => PROBE_RE.test(f));
        if (!FIXTURE_MODE && probeFiles.length === 0) problems.push('C7 审计目录下找不到只读探针（`_*probe*.mjs`）——量测面无工具');
        problems.push(...judgeProbeShape(probeFiles, readIf(path.join(AUDIT_DIR, 'audit_scan_probe_matrix.tsv')),
            (rel) => fs.existsSync(path.join(root, rel))));
    } else if (!FIXTURE_MODE) {
        problems.push('C7 找不到 tests/audit 目录（结构漂移）');
    }

    if (MODS.length !== 2) failClosed('C8 模块面常量被改动（探测器失效）');
    if (!FIXTURE_MODE) {
        if (extra.length < 50) failClosed('C8 manifest.extra_js 只抽到 ' + extra.length + ' 项（低于下限 50），抽取器已失效');
        if (entryCode.length < 500000) failClosed('C8 入口只读到 ' + entryCode.length + ' 字节（低于下限），扫描面不可信');
    }
    const notes = ['模块 ' + MODS.length + ' 个 / 词表 ' + EXPECTED_CAUSES.length + ' 词 / 伪探针 '
        + PSEUDO_SUITE.length + ' 型 / 探针 ' + probeFiles.length + ' 个'];
    return { problems, notes };
}

export const isMain = (() => {
    try { return !!process.argv[1] && /scan_v3254_cache_identity\.mjs$/.test(process.argv[1]); }
    catch (_e) { return false; }
})();

if (isMain) {
    const { problems, notes } = await runAll(ROOT);
    console.log('=== M-O4 缓存身份与负载量测面：模块 ' + MODS.length + ' 个 / 问题 ' + problems.length + ' ===');
    for (const p of problems) console.log('  ✗ ' + p);
    for (const n of notes) console.log('  · ' + n);
    if (problems.length) { console.error('[m-o4-identity] 存在真缺陷 ' + problems.length + ' 条'); process.exit(1); }
    console.log('[m-o4-identity] 卫生');
    process.exit(0);
}
