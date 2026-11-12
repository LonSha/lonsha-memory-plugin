/**
 * tests/audit/_persistence_field_judge.mjs — v3.463.0
 * —— L21-O4 的**唯一判定真源**（纯函数，不读磁盘、不 side-effect）
 *
 * 【为什么要有这个文件，而不是把判定写进判据里】
 *   判据要做三件事：抽真源码的结构、对账、造负控制。若三件事写在一起，
 *   负控制就只能「破坏真文件再跑一遍」——那既慢又危险（跑完忘了还原就把仓写坏了）。
 *   本仓的既有纪律是「判定体与探针分离、判定体纯函数化」（见 _loading_surface_judge.mjs）。
 *   故这里只做纯函数：**输入是文本与结构，输出是判定结果**。
 *   取真源码的工作交给判据用 fs 读一次传进来，负控制则直接传改造过的字符串。
 *
 * 【本文件治的形态（修前现场，可复算）】
 *   ① `WorldProgress` 的 export() 写了 `knowledgeTraces` / `branchSemanticsRead` /
 *      `volumeContinuationRead` 三个键，import() 也逐个读回来 —— 但**构造函数里一个都没建格**。
 *      于是全新实例上 `worldProg.knowledgeTraces === undefined`，而读取侧用的是
 *      `this.x || (this.x = {...})` 这种**懒建**写法：「还没记过」与「记了但读不到」同形。
 *      这正是本仓反复点名的「undefined 与真的没有同形」。
 *   ② `engine-persistence-ops.js` 的持久化水合表登记了 50 项，其中 39 项登记的水合函数
 *      （`hydrateState` / `hydrateRippleState` / …）在对应文件的**导出面上根本不存在** ——
 *      那 39 个文件是**类形态**，`hydrateState` 是**实例方法**，表却把它当静态函数调用。
 *      于是 `typeof mod[hydrator] === 'function'` 恒假，静默走 `: _ext[extKey]` 兜底 ——
 *      把原始 payload 直接赋给 `this._xxxState`，类实例从未被创建、更没被水合。
 *
 * 【本文件的三个输出面（对应计划原文的三条验收）】
 *   judgeWorldProgressFields — 构造函数 / 导出 / 导入**三向对账**，含豁免双向校验
 *   judgeHydrationTable      — 水合表「登记的水合函数 ↔ 真码导出面」对账
 *   settleExemptions         — 豁免表双向校验（豁免了却在枚举里 ⇒ 红）
 */

const IDENT = /^[A-Za-z_$][\w$]*$/;

/* ------------------------------------------------------------------
 * 一、源码切片：把「类体 / 方法体」从文本里切出来
 * ------------------------------------------------------------------
 * 为什么不用正则一把梭：本仓的方法是嵌套花括号的，`export()` 里还有三元与对象字面量。
 * 用花括号配平是最小可信的做法；**不引第三方 parser**（本仓无此依赖，且引入即多一个真源）。
 * ★ 切不出来时返回 null 而**不是**抛错：判据要能说「切不出来」这件事本身，
 *   把「没找到」与「找到了但是空的」压成同一个异常，就又变成一类同形。
 */
export function lineIndexOf(text, re) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i;
    return -1;
}

export function blockEnd(text, startIdx) {
    const lines = text.split('\n');
    let depth = 0, started = false;
    for (let i = startIdx; i < lines.length; i++) {
        for (const ch of lines[i]) {
            if (ch === '{') { depth++; started = true; }
            else if (ch === '}') depth--;
        }
        if (started && depth === 0) return i;
    }
    return -1;
}

/** 切出 `class X` 的类体 [start, end]（含花括号行） */
export function sliceClass(text, className) {
    const start = lineIndexOf(text, new RegExp('^\\s*class\\s+' + className + '\\b'));
    if (start < 0) return null;
    const end = blockEnd(text, start);
    return end < 0 ? null : { start, end };
}

/** 在类体里切出某个方法（实例方法，类体缩进一级） */
export function sliceMethod(text, className, methodName) {
    const cls = sliceClass(text, className);
    if (!cls) return null;
    const lines = text.split('\n');
    for (let i = cls.start; i <= cls.end; i++) {
        if (new RegExp('^\\s{4}' + methodName + '\\s*\\(').test(lines[i])) {
            const end = blockEnd(text, i);
            return end < 0 ? null : { start: i, end };
        }
    }
    return null;
}

/* ------------------------------------------------------------------
 * 二、WorldProgress 三向对账
 * ------------------------------------------------------------------ */

/**
 * 从构造函数抽「存储格」：`this.X = ...`
 *
 * ★ 为什么只认 8 空格缩进：类体 4 空格 + 构造函数体内 4 空格。
 *   放宽成 `\s*` 会把 if 块里、闭包里、注释样例里的赋值也吸进来 ——
 *   那是本仓 `_consumption_lib.mjs` 刚修过的同一类缺陷（把属性名当宿主对象）。
 *   宁可漏（漏了会被对账的另一侧报出来）也不可虚报（虚报会让判据失去意义）。
 */
export function extractCtorFields(text, className = 'WorldProgress') {
    const m = sliceMethod(text, className, 'constructor');
    if (!m) return null;
    const lines = text.split('\n');
    const out = [];
    for (let i = m.start; i <= m.end; i++) {
        const mm = lines[i].match(/^\s{8}this\.([A-Za-z_$][\w$]*)\s*=/);
        if (mm) out.push(mm[1]);
    }
    return out;
}

/** 从 `export()` 抽持久化键：`key: this.x` */
export function extractExportKeys(text, className = 'WorldProgress') {
    const m = sliceMethod(text, className, 'export');
    if (!m) return null;
    const lines = text.split('\n');
    const out = [];
    for (let i = m.start; i <= m.end; i++) {
        const mm = lines[i].match(/^\s{12}([A-Za-z_$][\w$]*)\s*:/);
        if (mm) out.push(mm[1]);
    }
    return out;
}

/**
 * 从 `import(data)` 抽「读的键 → 落的格」。
 *
 * ★ 两件事必须分开抽：`data.X` 是**存档里的键名**，`this.Y` 是**实例上的落格**。
 *   只看 `this.Y` 就会把「键名与格名不一致」（`data.branchSemanticsRead` → `this._branchSemanticsRead`）
 *   判成「落了个不存在的格」—— 那是虚报。这两列只有分开存才判得准。
 */
export function extractImportPairs(text, className = 'WorldProgress') {
    const m = sliceMethod(text, className, 'import');
    if (!m) return null;
    const lines = text.split('\n');
    const out = [];
    for (let i = m.start; i <= m.end; i++) {
        const st = lines[i].match(/^\s{12}this\.([A-Za-z_$][\w$]*)\s*=/);
        if (!st) continue;
        const dk = lines[i].match(/\bdata\.([A-Za-z_$][\w$]*)/);
        out.push({ key: dk ? dk[1] : null, store: st[1], line: i + 1 });
    }
    return out;
}

/** 默认豁免：本次实测判定为「不该持久化」的格，逐条给理由（空表也要显式存在） */
export const DEFAULT_WORLD_PROGRESS_EXEMPT = Object.freeze({
    pendingWrite: '运行时挂起位：一次 publish() 内的临时产物，跨会话无意义',
    revision: '运行时版本计数：每次装载由本机从 0 起算，持久化它会让「同内容不同 revision」变成伪变更',
    EVERY_FLOORS: '常量（配置默认值），不是状态',
    MAX_ACTIVE: '常量（配置默认值），不是状态',
    HINT_LEVEL: '常量（枚举表），不是状态',
    _knowledgeRead: '累计读数缓存：重新装载后由内核重算（读数不是状态本体）',
    _secretRead: '累计读数缓存：重新装载后由内核重算（同 _knowledgeRead 口径）',
});

/**
 * 三向对账。
 * @param {{ctor:string[]|null, exportKeys:string[]|null, importPairs:Array|null}} src
 * @param {object} exempt  豁免表（默认 DEFAULT_WORLD_PROGRESS_EXEMPT）
 * @returns {{ok:boolean, gaps:object, stats:object, exemptViolations:string[]}}
 */
export function judgeWorldProgressFields(src, exempt = DEFAULT_WORLD_PROGRESS_EXEMPT) {
    const { ctor, exportKeys, importPairs } = src;
    if (!ctor || !exportKeys || !importPairs) {
        // 切不出来**不是通过**：这是判定体自身的失效，必须显式说出是哪一段切不出来
        return {
            ok: false, gaps: {}, exemptViolations: [],
            stats: { error: 'slice-failed', ctor: !!ctor, exportKeys: !!exportKeys, importPairs: !!importPairs },
        };
    }
    const E = new Set(exportKeys);
    const importKeys = new Set(importPairs.map(p => p.key).filter(Boolean));
    const importStores = new Set(importPairs.map(p => p.store));
    const C = new Set(ctor);
    const EX = new Set(Object.keys(exempt));

    // ① 导出↔导入：导出写了但导入读不到 ⇒ 存盘丢；导入读了但导出不写 ⇒ 恢复恒空
    const exportNotImported = exportKeys.filter(k => !importKeys.has(k));
    const importNotExported = [...importKeys].filter(k => !E.has(k));

    // ② 导入落格必须在构造函数里有格（否则导入写的是野格）
    const importStoreMissing = [...importStores].filter(s => !C.has(s));

    // ③ 导出键若在构造函数里没有同名格，必须能映射到一个已建格（读数缓存那类改名前缀）
    //    判定口径：导出键 k 无同名格时，允许 `_k` / `_k` 变体存在于构造函数，或它是豁免项
    const exportKeyNoStore = exportKeys.filter(k => {
        if (C.has(k)) return false;
        if (C.has('_' + k)) return false;               // data.branchSemanticsRead -> this._branchSemanticsRead
        if (EX.has(k)) return false;
        return true;
    });

    // ④ 构造函数有格但导出不写：必须**要么**进豁免表，**要么**被 import 落格（说明它由导入建）
    const ctorNotPersisted = ctor.filter(k => !E.has(k) && !importStores.has(k) && !EX.has(k));

    // ⑤ 豁免双向：豁免了但其实是持久化字段 ⇒ 红（防豁免表腐烂）
    const exemptViolations = [...EX].filter(k => E.has(k) || importKeys.has(k) || importStores.has(k));

    const gaps = {
        exportNotImported,   // 写出去了却没读回来
        importNotExported,   // 读回来了却没写出去
        importStoreMissing,  // 导入落到不存在的格
        exportKeyNoStore,    // 导出键映射不到任何已建格
        ctorNotPersisted,    // 建了格但不持久化、也没豁免
    };
    const ok = Object.values(gaps).every(a => a.length === 0) && exemptViolations.length === 0;
    return {
        ok, gaps, exemptViolations,
        stats: {
            ctor: ctor.length, exportKeys: exportKeys.length,
            importKeys: importKeys.size, importStores: importStores.size,
            exempt: EX.size,
        },
    };
}

/* ------------------------------------------------------------------
 * 三、持久化水合表对账（登记的水合函数 ↔ 真码导出面）
 * ------------------------------------------------------------------ */

/**
 * 从 `engine-persistence-ops.js` 抽三处：
 *   write   — `this._x ? { lonshaXState: this._x } : {}`   （写盘面）
 *   manual  — `_ext.lonshaXState`                         （手写恢复面）
 *   table   — `['lonshaXState', '_x', 'Global', 'file.js', 'fn']`  （登记表）
 */
export function extractHydrationSurface(text) {
    const lines = text.split('\n');
    const write = [];
    for (let i = 0; i < lines.length; i++) {
        /* ★ 三种写盘形态都要认（v3.463.0 / v3.465.1 依次加入）：
         *   ① `this._x ? { lonshaXState: this._x } : {}`                  —— 函数库形态原样值
         *   ② `this._x ? { lonshaXState: _stateForSave(this._x) } : {}`     —— 类形态须走 exportState()
         *   ③ `this._x ? { lonshaXState: _collForSave(this._x) } : {}`      —— 状态里带 Map/Set，须先摊平
         *   每次新增包裹层都踩过同一个坑：**判据滞后于产品**，于是改造过的项被报成
         *   「读面登记但写盘不产」（readOnly 虚报）。这不是产品缺陷，是抽取没跟上写法。
         *   故这里写成「包裹层名单」而不是逐次加分支 —— 下次再加包裹层只改名单一处。 */
        const WRAPPERS = '(?:_stateForSave|_collForSave)?';
        const m = lines[i].match(new RegExp('this\\.(_[A-Za-z0-9_]+)\\s*\\?\\s*\\{\\s*(lonsha[A-Za-z0-9_]+)\\s*:\\s*' + WRAPPERS + '\\s*\\(?\\s*this\\.(_[A-Za-z0-9_]+)'));
        if (m) write.push({ store: m[1], extKey: m[2], line: i + 1 });
    }
    const manual = new Set();
    for (let i = 0; i < lines.length; i++) {
        const mm = lines[i].match(/_ext\.(lonsha[A-Za-z0-9_]+)/g);
        if (mm) for (const t of mm) manual.add(t.replace('_ext.', ''));
    }
    const table = [];
    let inTable = false;
    for (let i = 0; i < lines.length; i++) {
        if (/const v21Engines\s*=\s*\[/.test(lines[i])) inTable = true;
        if (!inTable) continue;
        const m = lines[i].match(/\[\s*'(lonsha[A-Za-z0-9_]+)',\s*'(_[A-Za-z0-9_]+)',\s*'([A-Za-z0-9_$]+)',\s*'([A-Za-z0-9_.-]+\.js)',\s*'([A-Za-z0-9_]+)'\s*\]/);
        if (m) table.push({ extKey: m[1], store: m[2], globalName: m[3], file: m[4], hydrator: m[5], line: i + 1 });
        if (/^\s*\];/.test(lines[i])) { inTable = false; break; }
    }
    return { write, manual, table };
}

/**
 * 从模块源码抽**导出面**的符号集合（`return { A, B }` / `return { A: x }`）。
 * ★ 只认 return 的对象字面量：本仓所有模块都走 UMD 的 `factory()` 返回对象，
 *   类形态则 `return SomeClass`（此时导出面就是那个类名本身，不含 hydrateState）。
 *
 * ★★ 这里踩过的坑（必须写下来，否则下次还会踩）：
 *   最初用 `return\s*\{([^}]*)\}` 直接抓 —— 那是**错的**。`[^}]*` 遇到函数体里的
 *   `return base;` / 内层 `}` 就停，抓到的「导出面」其实是某段函数体的前半截。
 *   本仓实测（v3.463.0 起点）：oath-fracture 明明已导出 `hydrateState`，
 *   判定体却报「导出面只有 [trustScore, createState, ...]」——**那条 detail 是假的**。
 *   判据虚报比漏报更坏：它会让人去修一个不存在的问题。
 *   故改成：从文件**末尾**向前找 `return {`，再按花括号配平取整块。
 *   导出面在 UMD 工厂函数的最后，这是本仓的铁律（同 _loading_surface_judge 的 UMD 尾巴判定）。
 */
export function extractExports(src) {
    const symbols = new Set();
    const idx = src.lastIndexOf('return {');
    if (idx >= 0) {
        // 从 '{' 配平取整块
        const open = src.indexOf('{', idx);
        let depth = 0, end = -1;
        for (let i = open; i < src.length; i++) {
            const ch = src[i];
            if (ch === '{') depth++;
            else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        if (end > open) {
            const body = src.slice(open + 1, end);
            // 顶层逗号切分（本仓导出面没有嵌套对象字面量，但仍做一层配平防意外）
            let d = 0, cur = '';
            for (const ch of body) {
                if (ch === '{' || ch === '[' || ch === '(') d++;
                else if (ch === '}' || ch === ']' || ch === ')') d--;
                if (ch === ',' && d === 0) { flush(cur, symbols); cur = ''; }
                else cur += ch;
            }
            flush(cur, symbols);
        }
    }
    // 类形态：`return SomeClass;` 或 `return { ... SomeClass }`
    const single = src.match(/return\s+([A-Za-z_$][\w$]*)\s*;\s*$/m);
    if (single) symbols.add(single[1]);
    return symbols;
}

/**
 * 判定某模块是否**以类形态**提供水合能力（此时 `hydrateX` 是实例方法，属合法形态）。
 *
 * ★ 为什么必须把这一形态算作「存在」而不是「缺失」：
 *   本仓有 12 个 V21 心智引擎是 `class Xxx { hydrateState(s) {...} }` +
 *   UMD `root.Xxx = api`（导出的是类本身）。它们的持久化是
 *   **`new Xxx()` 之后把存档喂给实例方法**，而不是调静态函数。
 *   最初的判定体只认「导出面里有同名符号」，于是把这 12 个全报成缺失 ——
 *   那是**判据虚报**（让人去给已经有的东西再补一个）。判据虚报比漏报更坏。
 *   ★ 但也不能就此判通过：水合表若登记成「静态调用」而模块是类形态，
 *     宿主侧的 `typeof mod['hydrateState'] === 'function'` 依然恒假 ——
 *     所以这里只回答「模块**有能力**水合」，宿主接线对不对由 judgeHydrationWiring 判。
 */
export function classHydratorInfo(src, hydrator) {
    /* ★ 缩进必须**相对类声明行**算，不能写死 4 空格。
     * v3.465.2 的教训：36 个 R18 内核原本把 `class X { ... }` 放在文件顶层，
     * 类体 4 空格、方法 8 空格；为了让经典脚本上下文能重复加载（否则 class 是
     * lexical binding，第二次加载必抛 `Identifier 'X' has already been declared`），
     * 类体被整体搬进 UMD 的 `factory()` 内，类体变 8 空格、方法变 12 空格。
     * 产品形态变了、**能力一个字没变**，而这里写死 `^\\s{4}` 就把 36 个类形态
     * 全判成 `kind: 'none'` —— 判据滞后于产品 = 判据问题，不是产品缺陷。
     * 故改为：捕获类声明行的前缀缩进 indent，方法缩进 = indent + 4。 */
    const m = src.match(/^([ \t]*)class\s+([A-Za-z_$][\w$]*)/m);
    if (!m) return null;
    const classIndent = m[1];
    const cls = m[2];
    const memberIndent = classIndent + '    ';
    const pad = memberIndent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 实例方法：类体一级缩进 + 同名
    const re = new RegExp('^' + pad + hydrator + '\\s*\\(', 'm');
    // 静态方法：static hydrateX(...)
    const reStatic = new RegExp('^' + pad + 'static\\s+' + hydrator + '\\s*\\(', 'm');
    // 静态工厂：static fromState / fromJSON / restore 形态（本仓暂未用，留判定位）
    if (reStatic.test(src)) return { cls, kind: 'static-method' };
    if (re.test(src)) return { cls, kind: 'instance-method' };
    return { cls, kind: 'none' };
}

/**
 * 判定宿主的**接线形态**是否正确：登记成静态调用，而模块是类形态 ⇒ 接线错误（必须红）。
 * @param {Array} table  水合表
 * @param {(file:string)=>string|null} readModule
 */
export function judgeHydrationWiring(table, readModule) {
    const miswired = [];
    for (const t of table) {
        const src = readModule(t.file);
        if (src === null) continue;
        const ex = extractExports(src);
        if (ex.has(t.hydrator)) continue;                    // 静态函数存在，接线正确
        const ci = classHydratorInfo(src, t.hydrator);
        if (ci && ci.kind !== 'none') {
            // 模块有能力，但宿主按静态调 —— 接线错，必须点名
            miswired.push({ extKey: t.extKey, file: t.file, hydrator: t.hydrator, cls: ci.cls, kind: ci.kind });
        }
    }
    return { ok: miswired.length === 0, miswired };
}

function flush(chunk, out) {
    const k = chunk.split(':')[0].split('=')[0].trim().replace(/^\/\*[\s\S]*?\*\//, '').trim();
    if (IDENT.test(k)) out.add(k);
}

/**
 * 水合表对账。
 * @param {{write:Array, manual:Set, table:Array}} surf
 * @param {(file:string)=>string|null} readModule  读模块源码；null 表示文件缺失
 */
export function judgeHydrationTable(surf, readModule) {
    const { write, manual, table } = surf;
    const writeKeys = new Set(write.map(w => w.extKey));
    const readKeys = new Set([...manual, ...table.map(t => t.extKey)]);

    // ① 写盘但两处读面都不读 ⇒ 存了永远读不回
    const writeOnly = [...writeKeys].filter(k => !readKeys.has(k));
    // ② 读面登记了但写盘面不产 ⇒ 恢复的恒是空
    const readOnly = [...readKeys].filter(k => !writeKeys.has(k));

    /* ③ 登记的水合函数必须在**该模块能提供它的任一形态**上存在。
     *   ★ 三种合法形态（v3.463.0 实测收敛）：
     *     static      —— 函数库导出 `hydrateState`（宿主持 mod 直接调）
     *     instance    —— 类形态，`hydrateState` 是实例方法（宿主 new 后调）
     *     none        —— 两者都没有 ⇒ **真缺失**，必须红
     *   最初只认 static，把 12 个类形态全报成缺失（判据虚报）。
     *   但 instance 也不能就此算「全绿」——接线是否真的按实例调，由 judgeHydrationWiring 判，
     *   两条判据各答各的问题，不许合并成一个布尔（合并就会让「有能力」冒充「已接对」）。 */
    const missingFile = [];
    const hydratorMissing = [];
    const hydratorInstance = [];
    const detail = [];
    for (const t of table) {
        const src = readModule(t.file);
        if (src === null) { missingFile.push(t.file); continue; }
        const ex = extractExports(src);
        if (ex.has(t.hydrator)) continue;                        // 形态 ①：静态
        const ci = classHydratorInfo(src, t.hydrator);
        if (ci && ci.kind !== 'none') {                          // 形态 ②：类实例方法
            hydratorInstance.push({ extKey: t.extKey, file: t.file, hydrator: t.hydrator, cls: ci.cls, kind: ci.kind });
            continue;
        }
        hydratorMissing.push({ extKey: t.extKey, file: t.file, hydrator: t.hydrator, exports: [...ex] });
        detail.push(`${t.extKey}: 表登记 ${t.hydrator}，导出面与类原型上都没有（导出面只有 [${[...ex].slice(0, 6).join(', ')}]）`);
    }

    // ④ 重复登记（同一 extKey 或同一 store 两次 ⇒ 后者静默覆盖前者，v3.444.0 那个形态）
    const dupKeys = [...new Set(table.map(t => t.extKey))].filter(k => table.filter(t => t.extKey === k).length > 1);
    const dupStores = [...new Set(table.map(t => t.store))].filter(s => table.filter(t => t.store === s).length > 1);

    const ok = writeOnly.length === 0 && readOnly.length === 0
        && missingFile.length === 0 && hydratorMissing.length === 0
        && dupKeys.length === 0 && dupStores.length === 0;
    return {
        ok,
        gaps: { writeOnly, readOnly, missingFile, hydratorMissing, hydratorInstance, dupKeys, dupStores },
        detail,
        stats: {
            write: write.length, manual: manual.size, table: table.length,
            staticForm: table.length - hydratorMissing.length - hydratorInstance.length,
            instanceForm: hydratorInstance.length,
        },
    };
}

/* ------------------------------------------------------------------
 * 四、单源措辞（判据与读数共用，避免两处各写一份）
 * ------------------------------------------------------------------ */
export const QUESTION = Object.freeze({
    fields: '构造 / 导出 / 导入三处枚举是否**逐个字段**对齐（任一缺任一即算漏登记）',
    hydration: '水合表登记的每个水合函数是否**在真码导出面上真的存在**（不只是文件存在）',
});

export const BOUNDARY = '本判定体只读静态源码：能证明「三处枚举对齐」「登记的函数名真的存在」，'
    + '不能证明「运行时水合真的把状态装回去了」——后者只由真机/真装载给。'
    + '故本判定的绿不等于功能可用，只等于**没有漏登记与错登记**。';
