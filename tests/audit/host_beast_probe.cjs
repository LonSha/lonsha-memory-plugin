/* 探针：index.js 宿主巨兽分诊（P-2）—— 只量，不拆。
 *
 * 要回答的问题（BEFORE 拆，必须先有它）：
 *   ① index.js 里到底有哪些「域」？各占多少行？（只按缩进 4 的成员方法切分 —— 保守、可复算）
 *   ② 哪些域是**可以独立搬走**的（内部自洽、出口少），哪些是**深度耦合**的（出口多、被自己人调）？
 *   ③ 搬走一个域的**代价**是多少（要改多少处引用）？
 * 本探针只回答读数，**不决定拆不拆**（决策必须挂在读数上，且拆本身的形状不在本轮）。
 *
 * 口径纪律（三条）：
 *   · 行数按**物理行**（含注释与空行）—— 因为「文件多大」这件事是编辑器/加载器的体验，不是逻辑量；
 *   · 方法归属按**最外层缩进的成员方法签名**切分（`    name(...) {`），嵌套闭包内的同名不算；
 *   · 一切可复算：同一份 index.js 跑两次读数必须逐字节相同（见套件 C1）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const LINES = SRC.split('\n');

/* ── 1. 成员方法切分：8 空格缩进的 `name(args) {` / `async name(args) {` / `get name() {` ──
 *   为什么是 8 空格：本仓 index.js 的结构是 `(function () {` → `class … {` → 成员，
 *   即类体缩进 4、成员签名缩进 8。**首版按 4 空格切分，只切出 4 个方法、89.5% 落在「未归类」**
 *   —— 那不是读数，那是把缩进层级搞错了：4 空格层级的 `if (…) {` / `const X = …`
 *   被当成了方法签名。切分口径本身必须先自证（见套件 B1：成员数必须落在合理量级）。 */
const MEMBER_RE = /^ {8}(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/;
const members = [];
for (let i = 0; i < LINES.length; i++) {
    const m = MEMBER_RE.exec(LINES[i]);
    if (m) {
        /* 排除控制流关键字：`if (` / `for (` / `while (` / `switch (` / `catch (` 在深缩进下
         *   也会匹配签名形状，但它们不是成员。排除表是**显式的**（不靠猜），并且套件 B1
         *   断言「排除后必须没有任何控制流词残留」。 */
        if (/^(if|for|while|switch|catch|return|typeof|function)$/.test(m[1])) continue;
        members.push({ name: m[1], start: i + 1 });
    }
}
for (let i = 0; i < members.length; i++) {
    members[i].end = (i + 1 < members.length) ? members[i + 1].start - 1 : LINES.length;
    members[i].lines = members[i].end - members[i].start + 1;
}

/* ── 2. 域分组：按名字前缀 + 一张显式登记表（可复算；不靠猜） ──
 *   为什么用「前缀 + 显式表」而不是聚类算法：聚类出来的域无法与作者的意图对齐，
 *   而「能不能搬走」这件事必须问作者把它写在一起的理由。 */
const DOMAIN_RULES = [
    [/^(?:build|read|write)WorldLedger/, '世界账本读取'],
    [/^(?:scene|_scene)/, '场所/场景'],
    [/^(?:commit|resolve|_commit|promise)/, '承诺账本'],
    [/^(?:event|_event)/, '事件链/完整性'],
    [/^(?:recall|_recall|injection|_injection)/, '召回与注入'],
    [/^(?:build)?(?:Bridge|bridge)/, '桥/快照出口'],
    [/^(?:selfCheck|diag|_diag|dump|export)/, '诊断与导出'],
    [/^(?:get|set|load|save|_load|_save)(?:Settings|Config|Data|State)/, '配置与持久化'],
    [/^(?:on|handle|_on|_handle)/, '宿主事件接线'],
    [/^(?:status|_status|lifeDetail|character|protagonist|money|outline|worldProg|clock)/, '业务状态面'],
];
function domainOf(name) {
    for (const [re, label] of DOMAIN_RULES) if (re.test(name)) return label;
    return '（未归类）';
}

const byDomain = new Map();
for (const m of members) {
    const d = domainOf(m.name);
    const cur = byDomain.get(d) || { domain: d, members: [], lines: 0 };
    cur.members.push(m.name);
    cur.lines += m.lines;
    byDomain.set(d, cur);
}
const domains = [...byDomain.values()].sort((a, b) => b.lines - a.lines);

/* ── 3. 外部引用面：每个域在 index.js 之外被点名多少次（搬走的「接线成本」） ── */
function walkJs(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === '.git' || e.name === 'node_modules' || e.name === 'tests') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walkJs(p, out);
        else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}
const outside = walkJs(ROOT).filter((p) => path.basename(p) !== 'index.js').map((p) => fs.readFileSync(p, 'utf8')).join('\n');
function countOutside(name) {
    const re = new RegExp('\\b' + name.replace(/[$]/g, '\\$') + '\\b', 'g');
    const hits = outside.match(re);
    return hits ? hits.length : 0;
}

/* ── 4. 域内自洽度：域内成员互相点名占该域成员总数的比例 ── */
const outsideWhole = outside;   // 域外（其它模块）整体文本
const memberNames = new Set(members.map((m) => m.name));
function selfCohesion(d) {
    const names = d.members;
    let internal = 0, external = 0;
    for (const n of names) {
        const re = new RegExp('\\b' + n.replace(/[$]/g, '\\$') + '\\b', 'g');
        const all = (SRC.match(re) || []).length - 1;   // 减去定义自身
        const out = countOutside(n);
        internal += Math.max(0, all - out);
        external += out;
    }
    const total = internal + external;
    return { internal, external, outsideShare: total ? +(external * 100 / total).toFixed(1) : 0 };
}

const report = {
    file: 'index.js',
    total_lines: LINES.length,
    member_count: members.length,
    domains: domains.map((d) => {
        const coh = selfCohesion(d);
        const outsideHits = d.members.reduce((a, n) => a + countOutside(n), 0);
        return {
            domain: d.domain,
            members: d.members.length,
            lines: d.lines,
            lines_pct: +(d.lines * 100 / LINES.length).toFixed(1),
            outside_refs: outsideHits,
            internal_refs: coh.internal,
            outside_ref_share_pct: coh.outsideShare,
        };
    }),
    unclassified_top: domains.find((d) => d.domain === '（未归类）')
        ? byDomain.get('（未归类）').members.slice(0, 25) : [],
    /* ── 5. 最大成员 TOP 40（分诊的主读数：巨兽到底长在哪几个方法上） ──
     *   domain 用「未归类」不代表它是野代码 —— 只代表它不在本探针的 10 条前缀规则里。
     *   故这里如实带出每个大成员的外部引用数，读者可自行判断「搬它要动多少接线」。 */
    biggest_members: [...members].sort((a, b) => b.lines - a.lines).slice(0, 40)
        .map((m) => ({ name: m.name, lines: m.lines, outside_refs: countOutside(m.name) })),
    /* ── 7. 拆分候选分诊：巨兽拆分的「可搬性」是什么形状 ──
     *   三个读数决定一个成员能不能先被搬走：
     *     · lines        —— 搬它能减多少行
     *     · outside_refs —— 搬它要改多少处外部接线（成本）
     *     · is_host_cb   —— 它是不是宿主回调（`on*`）或注册面：那类成员即使外部引用为 0 也不能单独搬，
     *                       因为它们是**生命周期接线本身**，搬走等于把入口从宿主事件上摘下来。
     *   本探针只做分诊，**不排优先级**（排优先级要一并看功能风险，那不在读数里）。 */
    split_candidates: (() => {
        const hostCb = (n) => /^(on|register|_on)/.test(n);
        const rows = members.filter((m) => m.lines >= 80).map((m) => ({
            name: m.name,
            lines: m.lines,
            outside_refs: countOutside(m.name),
            is_host_lifecycle: hostCb(m.name),
        }));
        const lowCoupling = rows.filter((r) => !r.is_host_lifecycle && r.outside_refs <= 2);
        const highCoupling = rows.filter((r) => !r.is_host_lifecycle && r.outside_refs >= 7);
        return {
            threshold_lines: 80,
            total_over_threshold: rows.length,
            low_coupling_non_lifecycle: lowCoupling.length,
            high_coupling_non_lifecycle: highCoupling.length,
            low_coupling_examples: lowCoupling.sort((a, b) => b.lines - a.lines).slice(0, 12),
            high_coupling_examples: highCoupling.sort((a, b) => b.lines - a.lines).slice(0, 12),
        };
    })(),
    /* ── 6. 缝合模块接线面：index.js 里点了多少个别家模块（「巨兽里有几成是接线」） ──
     *   注意调用形状：`_moduleLib(() => window.LonShaXxx, 'scene-book.js')` —— 第一参是**箭头函数**，
     *   里面有 `)` 与 `>`，所以**不能**用 `_moduleLib\([^)]*?\)` 那种「遇右括号即止」的朴素匹配
     *   （首版就是这么写的，读数 0 —— 一个漂亮的假零）。这里按「从 `_moduleLib(` 起到
     *   最近的 `,)` 形态的文件名实参」匹配，并显式要求文件名以 `.js'` 结束。 */
    seam_modules: (() => {
        const re = /_moduleLib\(\s*\(\)\s*=>\s*window\.[A-Za-z_$][\w$]*\s*,\s*'([^']+\.js)'\s*\)/g;
        const names = new Set();
        let sites = 0, m;
        while ((m = re.exec(SRC)) !== null) { sites += 1; names.add(m[1]); }
        return {
            distinct_modules: names.size,
            reference_sites: sites,
            call_shape_sites: (SRC.match(/_moduleLib\(/g) || []).length,
            /* 取库口自身的定义点不计入「调用点」 */
            sample: [...names].slice(0, 8),
        };
    })(),
};

console.log(JSON.stringify(report, null, 1));