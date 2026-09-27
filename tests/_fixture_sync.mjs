/* ============================================================
 * tests/_fixture_sync.mjs —— 负控制夹具清单提取唯一真源 [v3.245.0]
 * ------------------------------------------------------------
 * 为什么存在（本轮实测，不是「整洁性偏好」）：
 *
 * ① 本仓的负控制纪律是「真源码破坏 → 独立 fixture 树 → 在副本上重跑同一套真判据」。
 *    这套做法的**唯一前提**是：fixture 树必须喂满被测门禁真正会读的那些文件。
 *    少喂一个 —— 门禁在 fixture 里提前走 fail-closed（exit 2），
 *    而那个 exit 2 会被负控制静默读成「结构漂移判据工作正常」。**空对空。**
 *
 * ② 这条教训本仓已经吃过两次，且两次都是**人工补救**：
 *      · v3.240.0：门禁把账本下限从 6 抬到 9，负控制自己先因「只找到 6 本账」
 *        exit 2，于是 V0–V5 全线报「破坏不可归因」——红的不是判据，是夹具；
 *      · v3.242.0：门禁新增 R7（登记表不得重复行）后，fixture 必须一并搬那张 TSV，
 *        否则 R7 在 fixture 里必然报「缺登记表」，同样被读成「判据工作正常」。
 *    两次的修法都是「把清单从门禁源码里提出来」（`scan_ledger_contract_negctl.mjs`），
 *    但**只改了那一处** —— 其余 12 个负控制仍然各自手抄文件名。
 *
 * ③ 手抄的后果是可测的，不是理论上的。本版开工前的实测（每份负控制「搬的文件」
 *    与「配对门禁真会读的文件」逐项对差）：
 *      · scan_ledger_contract_negctl 合上 TSV 后仍缺 6 本账
 *        （门禁把九本账全部登记进 R2/R3b 扫描面，fixture 只喂前三本 + 契约自己）；
 *      · scan_v3193_host_matrix_negctl 的 FILES 表是从 manifest 派生的（这一半对了），
 *        但门禁另有两处读 settings-ui.js / cost-ledger.js，fixture 一个都没搬；
 *      · scan_v3193_lexicon_drift_negctl 是裸 `snapshot()`（无清单可查），
 *        它搬对了是**恰好**搬对，不是结构上保证。
 *    三者当前**都跑绿** —— 因为缺的那些文件恰好不在各自判据会翻红的那条路径上。
 *    这正是本仓最怕的形态：「绿着，但绿的成因不是判据在守」。
 *
 * 落点说明：与 `tests/_audit_lib.mjs` 同一规范放在 `tests/` 下 —— 若放 `tests/audit/`，
 *   `tests/run.mjs` 的 `readdirSync(AUDIT_DIR).filter(f => f.endsWith('.mjs'))`
 *   会把它当审计脚本直接 node 执行，纯定义文件零调用即以 exit 0 判绿。
 *
 * 设计纪律（对齐本仓宪法）：
 *   · 只看代码：注释里写着文件名的解释性文字不是「消费」（一律先 stripComments）；
 *   · 只读：纯函数，无副作用，不写盘、不改入参、不抛；
 *   · 不猜：拿不准就**多报**（把候选交给调用方按 fail-closed 口径处置），
 *     本仓的老毛病是反过来 —— 用固定窗口 / 固定下标猜，猜错了还恒绿。
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from './_audit_lib.mjs';

/** 文件名候选：引号里的仓内相对路径（含扩展名）。刻意不认反引号 —— 路径拼接出来的名字不是清单。 */
export const FILE_RE = /'([A-Za-z0-9_][A-Za-z0-9_\-./]*\.(?:js|json|tsv|mjs))'/g;

/** 从源码里抽出全部文件名字面量（先剥注释：解释性文字里的名字不算消费） */
export function fileLits(src) {
    const out = new Set();
    const code = stripComments(String(src ?? ''));
    for (const m of code.matchAll(FILE_RE)) out.add(m[1]);
    return out;
}

/** 该名字是否真是仓（或 fixture 树）里的一个文件 */
export function repoExists(root, f) {
    try { return fs.existsSync(path.join(root, f)); } catch (_e) { return false; }
}

/**
 * 门禁里走「缺文件即 exit 2」的那些文件。
 *
 * 为什么必须单列：这些文件**不需要**进 fixture —— 负控制反而故意不搬它们，
 * 用来测门禁的 fail-closed 能力（结构漂移必须 exit 2 而不是静默放行）。
 * 把它们算成「夹具缺口」是把判据收窄到失真。
 *
 * 形态：`existsSync(<任意表达式，内含文件名>)`。用括号配对取实参，不靠正则猜结尾。
 */
export function failClosedOf(src) {
    const out = new Set();
    const code = stripComments(String(src ?? ''));
    const CALL = 'existsSync(';
    let at = code.indexOf(CALL);
    while (at >= 0) {
        const open = at + CALL.length - 1;   // 指向 '('
        let depth = 0;
        let end = -1;
        for (let i = open; i < code.length; i++) {
            const c = code[i];
            if (c === '(') depth++;
            else if (c === ')') { depth--; if (depth === 0) { end = i; break; } }
        }
        if (end < 0) break;
        for (const m of code.slice(open, end).matchAll(FILE_RE)) out.add(m[1]);
        at = code.indexOf(CALL, end);
    }
    return out;
}

/**
 * 门禁的「消费文件集」：源码里出现、且仓内真实存在的文件名字面量，减去 fail-closed 面。
 *
 * 为什么是「所有字面量」而不是「精读每个 readFileSync」：
 *   fixture 树要喂的是「门禁可能会去读的东西」。多喂一个文件不会让判据失真
 *   （门禁本来就不读它 ⇒ 无影响），少喂一个会让判据空对空。**不对称风险，
 *   故宁多勿少** —— 这与本仓「宁可少剥，不可少看」同一条纪律。
 */
export function gateFiles(root, gatePath) {
    let src = null;
    try { src = fs.readFileSync(gatePath, 'utf8'); } catch (_e) { return null; }
    const fc = failClosedOf(src);
    return [...fileLits(src)].filter((f) => repoExists(root, f) && !fc.has(f));
}

/**
 * 负控制「自己会复制/破坏的文件集」。
 *
 * 形态覆盖（都是本仓在用的写法）：
 *   · 数组常量：`const GAUGED = ['a.js', 'b.json']`、`const FILES = {k: 'a.js'}`（值也是字面量）
 *   · 单件常量：`const FLOOR = 'floor-ledger.js'`
 *   · 就地 join：`path.join(SRC, 'index.js')`、`fs.copyFileSync(SCAN, ...)`
 *   · 破坏目标：`mut('narrative-pulse.js', ...)`、`mutate(...)`
 * 上述全部落在「引号里的文件名字面量」这一种形态上 —— 故一条提取即够，
 *   不做「按变量名逐一识别」（那正是手抄换了个地方住）。
 */
export function fixtureFiles(root, negPath) {
    let src = null;
    try { src = fs.readFileSync(negPath, 'utf8'); } catch (_e) { return null; }
    return [...fileLits(src)].filter((f) => repoExists(root, f));
}

/** 负控制是否自称「从门禁源码提取清单」（v3.240.0 立的做法） */
export function isExtracting(negPath) {
    let src = null;
    try { src = fs.readFileSync(negPath, 'utf8'); } catch (_e) { return false; }
    const code = stripComments(src);
    return /从门禁源码|scanSrc|scanSource/.test(code);
}

/**
 * 负控制**实际会搬进 fixture 的文件集**（含运行时派生的部分）。
 *
 * 【为什么不能只数字面量】本版首跑就踩了这个坑：E2 对两份负控制各报一处缺口，
 *   而它们**结构上不可能有缺口** —— 因为它们的清单是**运行时派生**的：
 *     · scan_ledger_contract_negctl：从门禁源码里正则提取 BOOKS（v3.240.0 的修法）；
 *     · scan_v3193_host_matrix_negctl：从 manifest.json 派生 `[mf.js, ...mf.extra_js]`。
 *   两者源码里**没有**那些文件名（名字在别的文件里，运行时才被读出来），
 *   字面量提取当然看不见 —— 这正是「判据在量一个不是缺陷的东西」。
 *   判据要量的是「fixture 树里会不会有它」，故必须把派生来源一并算进来。
 *
 * 三类来源（全部是**结构性**判据，不做「看起来像」的猜测）：
 *   ① 源码字面量（手写清单）；
 *   ② 从门禁源码提取（清单与门禁同源 ⇒ 覆盖集就是门禁的消费集）；
 *   ③ 从 manifest.json 派生（门禁自己也读 manifest，故其消费的脚本都是 extra_js 成员）。
 *
 * @returns {Set<string>}
 */
export function effectiveCopies(root, negPath, gatePath) {
    const out = new Set(fixtureFiles(root, negPath) || []);
    let src = '';
    try { src = stripComments(fs.readFileSync(negPath, 'utf8')); } catch (_e) { return out; }

    // ② 从门禁源码提取：负控制搬的 = 门禁消费的
    if (isExtracting(negPath)) {
        for (const f of gateFiles(root, gatePath) || []) out.add(f);
    }
    // ③ 从 manifest 派生：`[mf.js].concat(mf.extra_js || [])` 一类写法
    if (/'manifest\.json'/.test(src) && /extra_js/.test(src) && /\.concat\(/.test(src)) {
        const mf = readManifest(root);
        if (mf) for (const f of [mf.js].concat(mf.extra_js || [])) if (f && repoExists(root, f)) out.add(f);
    }
    return out;
}

/** 读 manifest.json（读不到返回 null，由调用方按 fail-closed 分态） */
export function readManifest(root) {
    try { return JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')); } catch (_e) { return null; }
}

/**
 * 一对（门禁 → 负控制）的夹具缺口。
 * @returns {{gate:string, neg:string, reads:string[], copies:string[], missing:string[]}|null}
 */
export function pairDiff(root, gatePath, negPath) {
    const reads = gateFiles(root, gatePath);
    if (reads == null) return null;
    const copies = fixtureFiles(root, negPath);
    if (copies == null) return null;
    const have = effectiveCopies(root, negPath, gatePath);
    const gate = path.basename(gatePath);
    /* 整树复制形态：字面量口径**结构上必然误报**（源码里只有目录名，
     *   看不见门禁真会读的那些文件），故登记过的直接判无缺口。
     *   为什么这不是「把判据关掉」：
     *     · 判据没有消失，只是换了形态 —— 门禁侧对登记形态改判**行为探针**
     *       （真跑一次，门禁在镜像上必须 exit 0），那条判据比清单口径更强；
     *     · 本函数是纯函数（只读、不抛、不 spawn），不能在里面跑子进程；
     *     · 未登记的整树复制由门禁侧单独报红（登记面是唯一可写点）。
     *   检测用**行为特征**：负控制确实调用了 `cpSync(..., {recursive: true})`。 */
    let src = '';
    try { src = stripComments(fs.readFileSync(negPath, 'utf8')); } catch (_e) { src = ''; }
    const isMirror = /cpSync\s*\(/.test(src) && /recursive:\s*true/.test(src);
    const registered = Object.prototype.hasOwnProperty.call(MIRROR_GATES, gate);
    return {
        gate,
        neg: path.basename(negPath),
        reads,
        copies,
        isMirror,
        registered,
        missing: (isMirror && registered) ? [] : reads.filter((f) => !have.has(f)),
    };
}

/** 目录下满足谓词的文件名（排序） */
export function listDir(dir, pred) {
    try { return fs.readdirSync(dir).filter(pred).sort(); } catch (_e) { return []; }
}

/* ============================================================
 * [v3.246.0] 契约账本消费者身份 —— 唯一真源
 * ------------------------------------------------------------
 * 【为什么加在这里】TODO 的「未收敛面（v3.245.0 如实登记）」写的是：
 *   「各门禁**自己的**账本名册仍是多处手抄」。收编前必须先回答一句：
 *   那几份名册**是同一份名册，还是同名异义**？本轮逐条核过的答案（写下来防后人重判）：
 *
 *   | 落点 | 是什么 | 收编吗 |
 *   |---|---|---|
 *   | `scan_ledger_contract.mjs` 的 `BOOKS` / `MIN_BOOKS` | 账本名册（谁在契约扫描面里） | 收 |
 *   | `v3207` 的 `BOOKS` / `NEEDS` / `NO_REVISION_BOOKS` | 同一份名册 + 逐本委派判据 | 收 |
 *   | `v3240` 的 `BOOK_FILES` | 同一份名册（逐本真调） | 收 |
 *   | `v3242` / `v3243` 的 `GAUGED` | **同名异义**：mirror 树要搬的文件集（含 manifest / index / TSV） | **不收** |
 *
 * 【为什么用一个函数而不是再导出一份常量名册】
 *   本仓吃过这个形态：「清单两份 ⇒ 改一份漏一份」。若这里也硬编码一份九本账，
 *   收编就只是把「四处手抄」变成「五处手抄」。故本文件导出的是**提取手段**：
 *   从「这份源码里，哪些文件真的在跑账本级」当场算出来。名册因此**只有一个可写点**
 *   （`ledger-entity.js` 旁的 `BOOKS` 登记 + manifest 的 extra_js），其余全是读数。
 *   各门禁按名点名消费（`LIB.ledgerLevelConsumers`），掉一项即红 —— 不采用
 *   固定路径 `import { BOOKS } from ...` 的隐式耦合。
 *
 * 【指纹与门禁 R2 同一串，不是新造的】
 *   账本级的共同行是取库块（门禁 R2 本来就在逐本判它）。这里复用同一串常量，
 *   于是「R2 判委派」与「R9 判名册」量的是同一件事，不会各自漂移。
 * ============================================================ */
export const LE_BLOCK = "const LE = (typeof window !== 'undefined' && window.LonShaLedgerEntity) ? window.LonShaLedgerEntity";
/** 非账本的契约消费者：若某文件出现取库块指纹又不在 BOOKS 里，须在此登记并说明（空表 = 当前事实）。
 *  留这个**显式登记点**的理由：判据万一将来误报，正确的处置是「登记 + 说清」，
 *  而不是把判据放宽到什么都抓不到。 */
export const NON_BOOK_CONSUMERS = [];
/**
 * **整树复制夹具**的门禁登记面（v3.247.0 立）。
 *
 * 【为什么需要这张表】E2 的判据形态是「负控制会复制进夹具的文件 ⊇ 门禁的消费文件集」。
 *   这条判据对「按清单搬文件」的负控制是对的，但对**整树复制**的负控制必然误报：
 *   整树复制在源码里只出现一个目录名（tests/），不出现任何具体文件名，
 *   于是字面量提取看不见门禁真正会读的那两个文件 ⇒ 报「夹具缺 2 项」，
 *   而实际夹具比门禁要的更全。**判据在量一个不是缺陷的东西。**
 *
 * 【为什么不能简单地「多报就忽略」】关键不是「缺不缺」，而是「这套夹具机制对该门禁是不是好的」——
 *   整树复制也可能造出一棵让门禁走 fail-closed 的树（那时 exit 2 会被观测器读成「判据工作正常」）。
 *   故登记之后判据**不停**，改为**探针式**：真跑一次，门禁必须 exit 0。
 *   这是「结构判据 → 行为判据」的同一路数（本仓 v3.191 起反复用过）。
 *
 * 【登记纪律】本表是**唯一可写点**：
 *   · 新门禁若用整树复制夹具，必须登记（否则 E2 会按字面量口径报缺口，那是**有据**的红）；
 *   · 未登记的整树复制会被门禁识别出来并单独报「未登记」（不许悄悄绕过）；
 *   · 每条都要写「为什么整树复制是必要的」，不写理由的登记等于把判据关了。
 */
export const MIRROR_GATES = {
    'scan_break_kit.mjs': '被观测门禁递归读整个 tests/ 面（接收方 29 / 判据点 28 都由目录真值点出）；'
        + '只搬消费集的 2 个文件会让接收方面塌到下限以下 ⇒ 门禁 exit 2（结构漂移），'
        + '而那个 2 会被观测器读成「fail-closed 判据工作正常」——空对空。实测整仓镜像 1.18s / 10.4MB。',
    'scan_exit_codes.mjs': '被观测门禁逐个读 tests/audit 下的**全部** .mjs（活性面下限 40 由目录真值点出），'
        + '它没有「清单」可言 —— 字面量口径对它必然报缺口（源码里只有目录名）。'
        + '整树复制 tests/audit 是必要条件：只搬少数几份会让活性面提前 bail 成 exit 2，'
        + '而那个 2 会被负控制读成「结构漂移判据工作正常」——空对空。'
        + '【本条的来由】v3.247.0 新判据「整树复制未登记即红」上线后立刻在它身上命中 —— '
        + '该负控制（V2 早前建立）此前从未被这条口径量过，是本轮顺带补上的真实漏登记。',
};
/**
 * 审计门禁的**运行时依赖**（不是「消费的文件集」，见下）。
 *
 * 【为什么单列】本版给 `scan_ledger_contract.mjs` 加了 `await import('../_fixture_sync.mjs')`，
 *   于是「把门禁**脚本副本**复制进夹具树执行」的测试（如 v3240 G1）必须连这个文件一起搬 ——
 *   否则门禁在夹具里走 fail-closed 分支 `exit 2`，而那个 2 会被读成「判据红了」（归因错）。
 *   实测首跑就栽在这里（v3240 G1：期望 exit 1，实得 2）。
 *
 * 【为什么**不**并进 gateFiles】`gateFiles` 是「门禁可能会去读的仓内文件」，
 *   用于逐对「门禁消费集 − 负控制可复制集」对差。而本清单只在**复制脚本体**时才需要：
 *   多数负控制是「夹具树里放数据、执行的是**源仓**脚本」（脚本自身仍在源仓，
 *   `../_fixture_sync.mjs` 自然解析得到）⇒ 并进去只会凭空报出缺口（假红）。
 *   两类依赖需要的条件不同，故分列。
 */
export const RUNTIME_DEPS = ['tests/_audit_lib.mjs', 'tests/_fixture_sync.mjs'];
/* 两项，不是一项：真源自己 `import { stripComments } from './_audit_lib.mjs'`。
 *   [留痕] 首版只列了 `tests/_fixture_sync.mjs` —— 那是**按改动写清单**，
 *   而不是**按加载图写清单**。在最小夹具上实测报的是
 *   `Cannot find module '…/tests/_audit_lib.mjs' imported from …/_fixture_sync.mjs`。
 *   判据面（「夹具里能不能把它跑起来」）才是清单该对齐的对象。 */
/**
 * 在场且**真的在跑**账本级的那些文件（含取库块）。
 *
 * `files` 由调用方给出，库不替它决定：门禁给 `manifest.extra_js`（它看到的是加载面），
 *   测试给仓根 `*.js`（它看到的是磁盘面）—— 两者本就是各自的对象，
 *   由库统一口径反而会量到「不是自己那个对象」的东西。
 *
 * 【纪律】只认代码：先剥注释（注释里写着「当年这里有取库块」不算消费）。
 * @param {string} root 仓根
 * @param {string[]} files 候选文件名（相对仓根）
 * @returns {string[]} 含取库块的文件名（按入参顺序）
 */
export function ledgerLevelConsumers(root, files) {
    const out = [];
    for (const f of (Array.isArray(files) ? files : [])) {
        let src = null;
        try { src = fs.readFileSync(path.join(root, f), 'utf8'); } catch (_e) { continue; }
        if (stripComments(src).includes(LE_BLOCK)) out.push(f);
    }
    return out;
}

export default { FILE_RE, fileLits, repoExists, failClosedOf, gateFiles, fixtureFiles, isExtracting, pairDiff, listDir };