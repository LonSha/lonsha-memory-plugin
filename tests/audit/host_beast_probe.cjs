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
const Q2 = String.fromCharCode(39) + String.fromCharCode(39);
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
/* [v3.421.0] 量的是**宿主面**，不只是入口文件。
 *   十二批外提之后宿主类已散在 index.js + engine-*.js / memory-core.js 里，
 *   只读 index.js 会把「巨兽还有多大」量成入口的残渣（实测 11696 行 vs 真宿主面 28275 行），
 *   而测试侧（v3.421.0 起）读的是合并面 —— 生产读数与判据读数必须是同一个面，否则
 *   「探针读的就是真源码」这条断言会在两个不同的文件上各自成立。
 *   合并顺序与 tests/_audit_lib.mjs 的 hostSurface 一致：入口在前、模块在后；
 *   入口里的单行委派先剥走、附在末尾（与 hostSurface 同形，逐字节同构）。
 *   模块清单从 _audit_lib.mjs 的 HOST_MODULES 读（不另立第二份真源）。 */
const HOST_MODULES = (() => {
    const lib = fs.readFileSync(path.join(ROOT, 'tests', '_audit_lib.mjs'), 'utf8');
    const m = /export const HOST_MODULES = \[([\s\S]*?)\];/.exec(lib);
    if (!m) throw new Error('取不到 tests/_audit_lib.mjs 的 HOST_MODULES');
    return (m[1].match(/'([^']+)'/g) || []).map((x) => x.slice(1, -1));
})();
const DELEG = /^[ \t]*[_a-zA-Z$][\w$]*[ \t]*\(.*\)[ \t]*\{.*_moduleLib\(.*\}[ \t]*$/;
function faceOf(name) {
    const p = path.join(ROOT, name);
    if (!fs.existsSync(p)) return { text: '', deleg: [] };
    const keep = [], deleg = [];
    for (const ln of fs.readFileSync(p, 'utf8').split('\n')) {
        if (DELEG.test(ln)) deleg.push(ln); else keep.push(ln);
    }
    return { text: keep.join('\n'), deleg };
}
const __entry = faceOf('index.js');
const __mods = HOST_MODULES.map(faceOf);
const __delegAll = [__entry.deleg].concat(__mods.map((f) => f.deleg)).reduce((a, b) => a.concat(b), []);
const SRC = [__entry.text].concat(__mods.map((f) => f.text)).join('\n')
    + '\n' + '// ==== 剥下的单行委派（入口原文） ====' + '\n' + __delegAll.join('\n');
const LINES = SRC.split('\n');
/* 入口行数取**原文物理行**（不经剥委派）：行上界预算回答的是「这个文件本身多大、编不编得动」，
 *   剥掉委派后的行数会让预算与文件身材脱钩。 */
const ENTRY_LINES = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8').split('\n').length;
/* 两个面必须分开报（判据面不同，混用就会出现「拿入口的预算去卡合并面」的假红）：
 *   · entry_lines   —— 入口文件物理行数。行数预算 line_budget.ceiling 与 v3261/v3266 的
 *                      成员/行上界判据守的是**入口**（那只回答「这个文件还扛不扛得住编辑器」）；
 *   · surface_lines —— 宿主面合计行数（入口 + 外提模块）。成员切分 / 域账 / 占比的分母是它，
 *                      因为「巨兽长在哪个方法上」只在合并面上有答案。 */
const SURFACE_LINES = LINES.length;

/* ── 1. 成员切分：宿主面逐文件、按**直接父容器**认签名（不数缩进、不猜层级） ──
 *   这一格被真读数打回来四次，四个坑逐个填掉，记录在此免得回去：
 *   ① 单一缩进档 + 拼成一个大字符串 ⇒ 模块里的成员一个都切不出来，前一个入口成员一路吃到
 *      下一个入口成员（selfCheck 被算成 5358 行）。
 *   ② 只看缩进 ⇒ 模块是把原方法体裁过来的，签名与体内语句常常同缩进（engine-self-check.js
 *      签名 8、体内也 8），`foo(` 开头的语句被当成新成员（selfCheck 1512 行、helper 1515 行）。
 *   ③ 取最小深度当签名层 ⇒ 入口里几个顶层自由函数比类体浅一层，整个类体（821 个真成员）全丢。
 *   ④ 取众数深度 ⇒ 还剩下「体内同缩进的 `foo({` 语句」混进来（1097 个太多、且大成员仍是错的）。
 *   最终口径：维护一条**容器栈**（遇到 `{` 压栈、`}` 出栈），一条行算签名必须同时满足
 *     (a) 形态像签名（`name(...) {` / `async name(...) {` / `function name(...) {`）；
 *     (b) 它的直接父容器就是**函数/方法体或对象字面量**（栈顶深度 === 当前深度 - 1）。
 *   (b) 天然挡掉体内语句（体内语句的父容器是块，深度不会正好差 1 后再接 `{`），
 *   也让类体里的成员与 IIFE 里的自由函数是同一个口径。控制流关键字照旧显式排除。 */
const CTL = /^(if|for|while|switch|catch|return|typeof|else|do|try|with)$/;
const sigRe = (n) => new RegExp('^ {' + n + '}(?:async\\s+)?(?:function\\s+)?(?:get\\s+|set\\s+)?([A-Za-z_$][\\w$]*)\\s*\\([^)]*\\)\\s*\\{');
const SIG4 = sigRe(4), SIG8 = sigRe(8);
const strip = (ln) => ln.replace(/\/\/.*$/, '').replace(/'[^']*'/g, Q2).replace(/"[^"]*"/g, Q2).replace(/`[^`]*`/g, Q2);
const faces = [{ name: 'index.js', text: __entry.text }].concat(__mods.map((f, k) => ({ name: HOST_MODULES[k], text: f.text })));
const members = [];
for (const face of faces) {
    const lines = face.text.split('\n');
    const stack = [];   // 元素 { depth, isMember }：isMember = 该容器自身就是一个成员
    let depth = 0;
    const mine = [];
    for (let i = 0; i < lines.length; i++) {
        const m8 = SIG8.exec(lines[i]);
        const m4 = SIG4.exec(lines[i]);
        const m = (m8 && !CTL.test(m8[1])) ? m8 : ((m4 && !CTL.test(m4[1])) ? m4 : null);
        /* 只认「父容器本身不是成员」的那些行：方法体里的一切（含体内同缩进的 `foo({` 语句、
         *   体内声明的内层函数）都不算成员 —— 这正是原口径里「嵌套闭包内的同名不算」的机械化。 */
        const isMember = !!(m && stack.length && !stack[stack.length - 1].isMember
            && stack[stack.length - 1].depth === depth - 1);
        if (isMember) mine.push({ name: m[1], file: face.name, start: i + 1 });
        for (const ch of strip(lines[i])) {
            if (ch === '{') { stack.push({ depth: depth, isMember: isMember }); depth++; }
            else if (ch === '}') { depth = Math.max(0, depth - 1); if (stack.length) stack.pop(); }
        }
    }
    for (let i = 0; i < mine.length; i++) {
        mine[i].end = (i + 1 < mine.length) ? mine[i + 1].start - 1 : lines.length;
        mine[i].lines = mine[i].end - mine[i].start + 1;
        members.push(mine[i]);
    }
}/* ── 2. 域分组：按名字前缀 + 一张显式登记表（可复算；不靠猜） ──
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
    file: 'index.js（+ 宿主面外提模块，合并面）',
    surface_files: ['index.js'].concat(HOST_MODULES),
    entry_lines: ENTRY_LINES,
    surface_lines: SURFACE_LINES,
    /* total_lines 保持**入口**语义（历史字段名）：v3257/v3259/v3260/v3261/v3266 的行上界判据都拿它
     *   与 line_budget.ceiling 比，而那个预算守的就是入口文件本身。合并面只能新增 surface_lines，
     *   不得顶替 total_lines —— 否则「拿入口的预算去卡合并面」会当场假红。 */
    total_lines: ENTRY_LINES,
    member_count: members.length,
    /* 逐文件切分的自证读数：每个面切出多少成员。判据据此看「模块面是否真被切到」
     *   —— 单一层级切分时这里只会有 index.js 一个键（模块整段被吞进上一个成员）。 */
    members_by_file: (() => {
        const out = {};
        for (const m of members) out[m.file] = (out[m.file] || 0) + 1;
        return out;
    })(),
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
        .map((m) => ({ name: m.name, file: m.file, lines: m.lines, outside_refs: countOutside(m.name) })),
    /* ── 5b. 全文**同名成员**：判据「外部引用读数只能当上界」的据 ──
     *   为什么不能拿 TOP40 里的同名当据（v3.293.0 实测）：TOP40 是**切片**，
     *   边界随 index.js 增长漂移 —— v3.231.0 建套件时 `import` 恰在 TOP40 内，
     *   X6/X7 加真代码后它被挤出边界，于是那条断言读到的是「边界漂移」而不是
     *   「同名事实消失」（而全文同名仍有 22 组）。读数必须落在**不随切片移动**的面上。 */
    duplicate_member_names: (() => {
        const cnt = new Map();
        for (const m of members) cnt.set(m.name, (cnt.get(m.name) || 0) + 1);
        return [...cnt.entries()].filter(([, n]) => n > 1).map(([k]) => k).sort();
    })(),
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
            file: m.file,
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