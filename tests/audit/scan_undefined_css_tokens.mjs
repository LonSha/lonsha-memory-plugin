// 审计基建 · CSS 自定义属性依赖闭合扫描（未定义/无效 token 的静态门）[v3.476.0]
// ------------------------------------------------------------
// 为什么存在（红因是实测的，不是推想的）：
//   `css/lonsha-design.css` 头注自称「单一事实源：全部 UI 颜色 / 阴影 / 圆角 / **间距** / 动效」，
//   但 v3.5 里**一条间距、一条字号都没有**；而 `style.css` / `dashboard*.css` 合计
//   **299 处** `var(--ls-sp-*)` / `var(--ls-fs-*)`，且**零 fallback**。
//   按 CSS 规范这些声明是 invalid-at-computed-value-time：padding/margin/gap 回落 0、
//   font-size 回落继承 —— 面板的间距与字阶在**源码层**就不成立，而任何一条既有判据都不会红：
//   没有哪条规则「写错了」，错的是**定义端缺了一族、消费端照用**。
//
// 这条门守的不变量：**任何被消费的自定义属性，要么在本仓有定义，要么在调用点自带 fallback，
//   要么带着理由登记为已知缺口。** 三者缺一，那条声明就是死的。
//
// 判定策略：
//   U1 扫描面 = 仓内 css/*.css，**先 stripComments**（v3.245 那条纪律：文本判据不看注释）。
//      实测：用未剥离注释的口径会把注释里写的 `var(--ls-sp-*)` 当成真消费，
//      于是「补齐 token」之后仍报未定义 —— 那是判据自己被自己的说明文字骗了。
//   U2 定义面 = `--name:`（前面必须是非 `(` 字符），消费面 = `var(--name`。
//   U3 **fallback 即兜底，不算死声明**：`var(--x, 1px)` 在 --x 缺失时退回 1px，是合法写法。
//      修前本判据把这类也报成缺陷 —— 那不是「保守」，是把有兜底的写法与裸用同形处置，
//      会让豁免表被误报占满，真正裸用的 299 处反而被淹掉。
//      ⇒ 只有**裸 `var(--x)`**（括号内没有逗号）才要求必须被定义。
//   U4 未定义**裸用**集必须为空 —— 除非在 baseline 里逐条登记（kind=debt 欠账 / kind=host 宿主注入）。
//   U5 **豁免双向**：已登记但当前「已被定义」「已自带 fallback」「已无消费」的条目同样报红。
//      豁免是欠账凭证，不是永久通行证；债还了不删条目，等于把门变成装饰。
//   U6 分母自证：文件数 / 定义数 / 消费数任一低于下限 ⇒ exit 2 fail-closed。
//      「0 个问题」在没有分母时不是结论。
//   U7 判据自带负控制：合成源码上必须同时答对四件事 —— 认出定义、抓到裸用未定义、
//      放过带 fallback 的、忽略注释里写的。答错即 exit 2（探测器坏了不许伪装成绿）。
//
// 退出码：0=卫生  1=存在真缺陷  2=结构漂移（探测器/配置不可用）
// 夹具通道：LONSHA_AUDIT_ROOT 指定仓库根（供单测塞合成仓库）。
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '../_audit_lib.mjs';

const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const CSS_DIR = path.join(ROOT, 'css');
const BASELINE = path.join(ROOT, 'tests', 'audit', 'undefined-css-token-baseline.json');

/* 定义面：`--x:` 之前必须是行首/空白/;/{ —— 排除 `var(--x)` 这种消费形态。 */
const DEF_RE = /(?:^|[\s;{])(--[A-Za-z0-9_-]+)\s*:/gm;
/* 消费面：捕获名字，并探测名字后是否紧跟参数（有逗号 = 带 fallback）。 */
const USE_RE = /var\(\s*(--[A-Za-z0-9_-]+)(\s*,)?/g;

function scanSource(src) {
    const defs = new Set();
    const all = new Set();
    const bare = new Set();
    let m;
    DEF_RE.lastIndex = 0;
    while ((m = DEF_RE.exec(src)) !== null) defs.add(m[1]);
    USE_RE.lastIndex = 0;
    while ((m = USE_RE.exec(src)) !== null) {
        all.add(m[1]);
        if (!m[2]) bare.add(m[1]);   // 括号内无逗号 ⇒ 裸用，缺定义即失效
    }
    return { defs, all, bare };
}

/* U7 负控制：四件事必须全答对。 */
function selfTest() {
    const synth = [
        '.a { --known: 1px; width: var(--known); height: var(--missing); }',
        '.b { box-shadow: 0 0 0 var(--guarded, 1px) black; }',
        '/* 注释里的 var(--from-comment) 不算消费 */',
    ].join('\n');
    const s = scanSource(stripComments(synth));
    const bareUndef = [...s.bare].filter((t) => !s.defs.has(t)).sort();
    const checks = {
        defFound: s.defs.has('--known'),
        bareCaught: bareUndef.length === 1 && bareUndef[0] === '--missing',
        fallbackExempt: s.all.has('--guarded') && !s.bare.has('--guarded'),
        commentIgnored: !s.all.has('--from-comment'),
    };
    const failed = Object.keys(checks).filter((k) => !checks[k]);
    if (failed.length) {
        console.error('[undefined-css-tokens] 负控制失败：' + failed.join(', '));
        console.error('  bareUndef=' + JSON.stringify(bareUndef));
        console.error('  defs=' + JSON.stringify([...s.defs])
            + ' all=' + JSON.stringify([...s.all]) + ' bare=' + JSON.stringify([...s.bare]));
        process.exit(2);
    }
}

function die(msg) {
    console.error('[undefined-css-tokens] ' + msg);
    process.exit(2);
}

function main() {
    selfTest();

    if (!fs.existsSync(CSS_DIR)) die('找不到 css/ 目录（ROOT=' + ROOT + '）——结构漂移');
    const files = fs.readdirSync(CSS_DIR).filter((n) => n.endsWith('.css')).sort();
    if (files.length < 5) die('扫描面只剩 ' + files.length + ' 个 css 文件 —— 分母异常，fail-closed');

    const defs = new Set();
    const all = new Set();
    const bare = new Set();
    const perFile = [];
    for (const n of files) {
        let raw = '';
        try {
            raw = fs.readFileSync(path.join(CSS_DIR, n), 'utf8');
        } catch (e) {
            die('读不到 css/' + n + '：' + e.message);
        }
        const s = scanSource(stripComments(raw));
        for (const d of s.defs) defs.add(d);
        for (const u of s.all) all.add(u);
        for (const u of s.bare) bare.add(u);
        perFile.push({ n, defs: s.defs.size, uses: s.all.size });
    }

    if (defs.size < 40 || all.size < 100) {
        die('分母异常：定义 ' + defs.size + ' / 消费 ' + all.size + ' —— fail-closed');
    }

    const bareUndefined = [...bare].filter((t) => !defs.has(t)).sort();
    const guarded = [...all].filter((t) => !defs.has(t) && !bare.has(t)).sort();

    if (!fs.existsSync(BASELINE)) die('缺 baseline：' + path.relative(ROOT, BASELINE));
    let base = null;
    try {
        base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    } catch (e) {
        die('baseline 不是合法 JSON：' + e.message);
    }
    const entries = Array.isArray(base && base.entries) ? base.entries : null;
    if (!entries) die('baseline 缺 entries 数组');
    const bad = entries.find((e) => !e || typeof e.token !== 'string'
        || !e.token.startsWith('--')
        || (e.kind !== 'debt' && e.kind !== 'host')
        || typeof e.reason !== 'string' || e.reason.length < 20
        || typeof e.release !== 'string' || e.release.length < 10);
    if (bad) die('baseline 条目需 kind(debt|host) + reason(>=20字) + release(解除条件)：' + JSON.stringify(bad));

    const registered = new Set(entries.map((e) => e.token));
    const fresh = bareUndefined.filter((t) => !registered.has(t));
    const listed = new Set(bareUndefined);
    const stale = entries.filter((e) => !listed.has(e.token));

    console.log('[undefined-css-tokens] 扫描面：' + files.length + ' 文件 / 定义 ' + defs.size
        + ' / 消费 ' + all.size + ' / 裸用 ' + bare.size
        + ' / 裸用未定义 ' + bareUndefined.length
        + ' / 带兜底未定义 ' + guarded.length
        + ' / 登记 ' + entries.length);
    if (guarded.length) {
        console.log('  带 fallback 兜底（合法写法，仅记录）：' + guarded.join(' '));
    }
    for (const f of perFile) {
        if (f.uses === 0) console.log('  ⚠ css/' + f.n + ' 零消费（纯定义文件或空壳）');
    }

    if (fresh.length) {
        console.error('[undefined-css-tokens] 这些自定义属性被**裸用**且全仓无定义（整条声明失效）：');
        for (const t of fresh) console.error('  ✗ ' + t);
        console.error('  修法三选一：补定义 / 调用点加 fallback / 登记进 baseline 并写清理由与解除条件。');
        process.exit(1);
    }

    if (stale.length) {
        console.error('[undefined-css-tokens] 豁免已过期（条目还在，但该 token 已被定义、已有 fallback 或已无消费）：');
        for (const e of stale) console.error('  ✗ ' + e.token);
        console.error('  豁免是欠账凭证：债还了就删条目，否则这道门会变成装饰。');
        process.exit(1);
    }

    console.log('[undefined-css-tokens] 卫生：所有裸用的自定义属性都有定义或已登记豁免。');
    process.exit(0);
}

main();