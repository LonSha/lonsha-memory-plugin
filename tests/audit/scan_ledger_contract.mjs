// 审计基建 AX（v3.207.0）：账本实体契约面 —— 「一份契约 6 份拷贝」不得回潮
// ------------------------------------------------------------
// 为什么存在：
//   本仓六本「逐条实体 + 变更历史」的账（伏笔 seed / 秘密 secret / 平行事实 parallel /
//   约定 commitment / 事实版本 fact-version / 事件线 event-completeness）此前各抄一份
//   实体读取契约：`revision: finite(x) || 1` 六处、`item.revision += 1` 六处、
//   `history 幂等比对 + push + 截断` 五处、`function text/finite` 各六处。
//   它不是「整洁性问题」：同一口径 6 份实现 ⇒ 改一处漏五处，判据在不同账上语义漂移。
//   这正是本仓治理过多轮的形态（v3.202「新增子系统忘了接回滚」、v3.191「stripComments
//   分裂成 4 种变体」）—— 去掉重复的那次修复，会在下一次新增账本时原样复发。
//
//   第二件被本门禁钉住的事：`item.revision` 此前是**写进去但全仓零消费**的字段
//   （没有任何调用点读它、没有任何测试锁它的数值）。契约模块把它接成自检面的
//   真实读侧（index.js 的「账本实体」一行）——「有字段没人读」也是本仓治理过的形态。
//
// 判据：
//   R1 契约模块在 manifest.extra_js 里**声明**，且排在全部消费者之前
//      （浏览器按声明顺序注入经典脚本：契约必须在消费它的账本之前挂上）
//   R2 六本账逐个委派：都出现取库块指纹，且 revision/history/record 三处都走契约
//   R3 反重复：六本账里不得再出现 `revision: finite(`、`.revision += 1` 与本地 `function text(`
//   R4 index.js 消费面：引用 window.LonShaLedgerEntity，且自检面有一行真的读它
//   R5 结构健康：账本数不少于下限；契约模块导出面齐全；扫描面非空
// 退出码：0=卫生  1=存在真缺陷（重复回潮 / 未委派 / 未消费）  2=结构漂移（探测对象不在）
// 夹具通道：LONSHA_AUDIT_FIXTURE=1 放宽「账本数」下限，供单测塞合成仓库。
import fs from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';
const ROOT = process.env.LONSHA_AUDIT_ROOT || path.resolve(HERE, '..', '..');
const CONTRACT = 'ledger-entity.js';
/** 消费者清单。**不写死上限**：九本是当前事实，R3 保证新账也必须委派。
 *   [v3.240.0] 原为**六**本委派账；本版把另三本「逐条实体」账（回扣 recall-echo /
 *   回声 echo / 修复 repair）也收进契约 —— 它们此前各自自带一份 `text` + `finite` 拷贝，
 *   而那份 `finite` 正是 `Number.isFinite(Number(v))` 形态（`finite(null) === 0`）。
 *   收编后全仓「外部来的数」判据只此一份。 */
const BOOKS = ['seed-ledger.js', 'secret-ledger.js', 'parallel-ledger.js',
    'commitment-ledger.js', 'fact-version.js', 'event-completeness.js',
    'recall-echo.js', 'echo-ledger.js', 'repair-loop.js'];
const MIN_BOOKS = FIXTURE_MODE ? 1 : 9;

// 结构漂移一律走这里；退出码写**字面量**而不是变量 —— 静态守卫要能看出「本脚本会 fail-closed」
//   （审计段约定：每个扫描器都必须具备 exit 2 的阻断能力，见 v3159 的 [2] 判据）。
function bail(msg) {
    console.error('[ledger-contract] ' + msg);
    process.exit(2);
}
function readOrNull(p) {
    try { return fs.readFileSync(p, 'utf-8'); } catch (e) { return null; }
}

/* ---------- 0. 结构预检（fail-closed） ---------- */
const mfPath = path.join(ROOT, 'manifest.json');
const mfRaw = readOrNull(mfPath);
if (!mfRaw) bail('找不到 manifest.json（工作目录可能不对：' + ROOT + '）');
let manifest;
try { manifest = JSON.parse(mfRaw); } catch (e) { bail('manifest.json 解析失败：' + e.message); }
const extra = Array.isArray(manifest.extra_js) ? manifest.extra_js.slice() : [];
if (!extra.length) bail('manifest.extra_js 为空：抽取器已失效');

const books = BOOKS.filter((f) => fs.existsSync(path.join(ROOT, f)));
if (books.length < MIN_BOOKS) {
    bail('只找到 ' + books.length + ' 本账（下限 ' + MIN_BOOKS + '）：扫描面不可信，账本被改名或删除');
}
const contractSrc = readOrNull(path.join(ROOT, CONTRACT));
if (contractSrc == null) bail('找不到契约模块 ' + CONTRACT + '：真源不在，判据无从谈起');
const indexSrc = readOrNull(path.join(ROOT, 'index.js'));
if (indexSrc == null) bail('找不到 index.js');

const defects = [];

/* ---------- R1 声明与顺序 ---------- */
const at = extra.indexOf(CONTRACT);
if (at < 0) {
    defects.push('R1 ' + CONTRACT + ' 未登记进 manifest.extra_js —— 不登记 = 不加载 = 六本账的取库全部落空');
} else {
    const consumers = books.map((f) => extra.indexOf(f)).filter((i) => i >= 0);
    const first = consumers.length ? Math.min(...consumers) : extra.length;
    if (at > first) {
        defects.push('R1 ' + CONTRACT + ' 排在消费者之后（契约 @' + at + '，最早消费者 @' + first + '）：'
            + '经典脚本按声明顺序注入，消费者先跑就取不到契约');
    }
}

/* ---------- R2 六本账逐个委派 ---------- */
// 取库块指纹：与六本账里的字面量逐字一致（这就是「同形」的可机检形态）。
const LE_BLOCK = "const LE = (typeof window !== 'undefined' && window.LonShaLedgerEntity) ? window.LonShaLedgerEntity";
// 每本账**该委派哪几处**是逐本不同的，必须按账声明 —— R2 首跑就在此证明了这一点：
//   事件线账用 `segments` 作历史容器（没有 history 面）、版本自增在 addSegment/abandonEvent
//   就地走 bumpRevision（没有 record 面）。把它当作「缺委派」不是发现缺陷，是把判据收窄到失真。
//   故这里的表是**契约的显式清单**，不是「六本账必须长得一样」的模板。
const NEEDS = {
    'seed-ledger.js': [['LE.revisionOf(', '修订号读回'], ['LE.copyHistory(', '历史读回'], ['LE.recordEvent(', '变更入账']],
    'secret-ledger.js': [['LE.revisionOf(', '修订号读回'], ['LE.copyHistory(', '历史读回'], ['LE.recordEvent(', '变更入账']],
    'parallel-ledger.js': [['LE.revisionOf(', '修订号读回'], ['LE.copyHistory(', '历史读回'], ['LE.recordEvent(', '变更入账']],
    'commitment-ledger.js': [['LE.revisionOf(', '修订号读回'], ['LE.copyHistory(', '历史读回'], ['LE.recordEvent(', '变更入账']],
    /* [v3.240.0] 三本独立账委派的是**取值原语**，不是 revision/history 三件套
     *   —— 它们本来就没有 history 容器，也没有 revision 面（回扣账是候选池、
     *   回声账按 char+mode 覆盖、修复账是动作回执）。按账显式登记，正是 R2 的写法：
     *   不是「六本必须长得一样」，而是「每本说清自己委派了哪几处」。 */
    'recall-echo.js': [['const text = LE.text', '文本归一'], ['const finite = LE.finite', '数值归一'], ['const finiteFloor = LE.finiteFloor', '楼层取值口']],
    'echo-ledger.js': [['const text = LE.text', '文本归一'], ['const finite = LE.finite', '数值归一'], ['const finiteFloor = LE.finiteFloor', '楼层取值口']],
    'repair-loop.js': [['const text = LE.text', '文本归一'], ['const finite = LE.finite', '数值归一'], ['const finiteFloor = LE.finiteFloor', '楼层取值口']],
    'fact-version.js': [['LE.revisionOf(', '修订号读回'], ['LE.copyHistory(', '历史读回'], ['LE.recordEvent(', '变更入账']],
    // 事件线：segments 即它的历史容器（本账的领域形状），版本自增就地 → 只要求两处。
    'event-completeness.js': [['LE.revisionOf(', '修订号读回'], ['LE.bumpRevision(', '版本自增']]
};
for (const f of books) {
    const src = readOrNull(path.join(ROOT, f)) || '';
    if (!src.includes(LE_BLOCK)) {
        defects.push('R2 ' + f + ' 没有取库块（未接契约真源）');
        continue;
    }
    const need = NEEDS[f];
    if (!need) { defects.push('R2 ' + f + ' 不在委派表里：新增账本必须显式登记它委派哪几处'); continue; }
    for (const [needle, what] of need) {
        if (!src.includes(needle)) defects.push('R2 ' + f + ' 的' + what + '未走契约（缺 ' + needle + '）');
    }
}

/* ---------- R3 反重复：被收走的那些写法不得回潮 ---------- */
for (const f of books) {
    const src = readOrNull(path.join(ROOT, f)) || '';
    if (/revision:\s*finite\(/.test(src)) {
        defects.push('R3 ' + f + ' 又出现了 `revision: finite(` —— 契约读回被就地重写（正是本门禁要堵的重复回潮）');
    }
    if (/\.revision\s*\+=\s*1/.test(src)) {
        defects.push('R3 ' + f + ' 又出现了 `.revision += 1` —— 版本自增应走 LE.bumpRevision / LE.recordEvent');
    }
    if (/Array\.isArray\([A-Za-z_$][\w$]*\.history\)\s*\?\s*[A-Za-z_$][\w$]*\.history\.slice\(-MAX_HISTORY\)/.test(src)) {
        defects.push('R3 ' + f + ' 又手写了 history 截断 —— 应走 LE.copyHistory');
    }
    if (/function\s+text\s*\(/.test(src)) {
        defects.push('R3 ' + f + ' 又本地声明了 `function text(` —— text/finite 由契约提供');
    }
    if (/function\s+finite\s*\(/.test(src)) {
        defects.push('R3 ' + f + ' 又本地声明了 `function finite(` —— text/finite 由契约提供（v3.240.0 已收编九账）');
    }
}
/* ---------- R3b [v3.240.0] 九账的 floor 一族必须走按名点名的有限数值口 ----------
 * 为什么单列一条：floor 一族（floor / updatedFloor / revealedFloor / settledFloor /
 *   recoveredFloor / 段的 floor）是全仓最容易被 `Number.isFinite(Number(v))` 塔成 0 的地方，
 *   而 `floor` 这个字段名在**各账之间同名不同域**（承诺账的 floor 与秘密账的 floor 是两套数据）。
 *   判据刻意只认「字段名 : finite(」这一形态（不误伤 `finite(limit)` 等分页读数的合法用法），
 *   并且要求按名点名的 `finiteFloor` —— 名字相同，读代码的人不必再比对「这里的 finite 是不是那个」。 */
for (const f of books) {
    const src = readOrNull(path.join(ROOT, f)) || '';
    const bad = [];
    for (const m of src.matchAll(/\bfloor\s*:\s*(?!finiteFloor\b)finite\(/g)) {
        bad.push(m[0]);
    }
    if (bad.length) {
        defects.push('R3b ' + f + ' 的 floor 一族仍在走 `finite(`（' + bad.length + ' 处）—— '
            + '应走 `finiteFloor(`（v3.240.0：finite(null) 曾得 0，把「楼层未知」写成第 0 楼）');
    }
}

/* ---------- R4 index.js 消费面 ---------- */
if (!/window\.LonShaLedgerEntity/.test(indexSrc)) {
    defects.push('R4 index.js 未引用 window.LonShaLedgerEntity —— 模块接线审记 B4 会把「已挂载但零消费」判成缺陷，'
        + '且 `revision` 会退回「写进去没人读」');
}
if (!/LE\.line\(/.test(indexSrc)) {
    defects.push('R4 index.js 没有真正读账本实体读数（缺 LE.line(）—— 消费面只挂了个取库口不算接线');
}

/* ---------- R5 结构健康 ---------- */
for (const key of ['revisionOf', 'bumpRevision', 'recordEvent', 'copyHistory', 'scanBook', 'line', 'REVISION',
    'finite', 'finiteFloor', 'numOrNull', 'FINITE_DOMAINS']) {
    if (!new RegExp('\\b' + key + '\\b').test(contractSrc)) {
        defects.push('R5 契约模块缺导出面 `' + key + '`（被删/改名即判据失去真源）');
    }
}
// 契约自己不得反过来抄账本的局部常量（MAX_HISTORY 各账不同，收上来就把差异抹平了）
if (/MAX_HISTORY\s*=/.test(contractSrc)) {
    defects.push('R5 契约模块里出现了 MAX_HISTORY 常量 —— 各账上限不同（6/8/8/12/12），必须留在各自模块');
}

/* ---------- R6 [v3.242.0] 契约的输入/输出域声明表必须成表 ----------
 * 【为什么单列一条】本契约的输出此前只能靠读实现来推断，「判据写得对不对」本身没法判。
 *   声明表把域写在**与实现同文件同版本**的地方，下游判据才能写成表驱动对拍。
 *   这条判据只保证「表还在、而且是表」：真值对拍在 tests/v3242 里做（真函数 × 真表）。
 *   形态锚点用括号配对取 `FINITE_DOMAINS = Object.freeze({` 的那一段 —— 不靠正则猜结构。 */
const fdAt = contractSrc.indexOf('const FINITE_DOMAINS = Object.freeze({');
if (fdAt < 0) {
    defects.push('R6 契约缺输入/输出域声明表 FINITE_DOMAINS（判据失去可对拍的域）');
} else {
    const seg = contractSrc.slice(fdAt, fdAt + 2600);
    if (!/outputs:\s*Object\.freeze\(\[/.test(seg)) {
        defects.push('R6 FINITE_DOMAINS 缺 outputs 声明（输出不可枚举 ⇒ 判据无法收口）');
    }
    const casesAt = seg.indexOf('cases: Object.freeze([');
    if (casesAt < 0) {
        defects.push('R6 FINITE_DOMAINS 缺 cases 声明（没有对拍样本 ⇒ 表是装饰）');
    } else {
        const rows = [...seg.slice(casesAt).matchAll(/\['([^']+)',\s*'([^']+)'\]/g)];
        if (rows.length < 10) {
            defects.push('R6 FINITE_DOMAINS.cases 只有 ' + rows.length + ' 条（< 10）：样本被抽薄，表驱动对拍失去意义');
        }
        const outs = new Set([...seg.matchAll(/outputs:\s*Object\.freeze\(\[([^\]]*)\]/g)]
            .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])));
        /* 下标 1 是**样本标签**、2 才是**期望值** —— 本判据首跑写成 `[, exp]`（取到标签），
         *   于是 23 条样本全报「不在 outputs 里」。留痕：正则捕获组的下标不是「谁看起来像」。 */
        for (const [, label, exp] of rows) {
            if (!outs.has(exp)) defects.push('R6 FINITE_DOMAINS 样本「' + label + '」的期望 `' + exp + '` 不在 outputs 里（表自相矛盾）');
        }
        if (outs.size > 3) {
            defects.push('R6 FINITE_DOMAINS.outputs 有 ' + outs.size + ' 种（> 3）：输出集不再是有限可枚举形态');
        }
    }
}

/* ---------- R7 [v3.242.0] 在役测试面登记表不得重复行 ----------
 * 【为什么单列一条】TSV 是「谁在扫描面里」的唯一名册，也是跨仓守卫的基准。
 *   重复登记会让「在役 221 / 参考基准 221」这种读数看着对、实际多算一行 ——
 *   读数对不上时没人能从名字里看出重复。 */
const tsvPath = path.join(ROOT, 'tests', 'audit', 'catalog_reference_consumers.tsv');
const tsvRaw = readOrNull(tsvPath);
if (tsvRaw == null) {
    defects.push('R7 缺在役测试面登记表 catalog_reference_consumers.tsv');
} else {
    const names = tsvRaw.split('\n')
        .map((l) => l.split('\t')[0].trim())
        .filter((l) => l && !l.startsWith('#'));
    const dup = names.filter((n, i) => names.indexOf(n) !== i && names.indexOf(n) < i);
    if (dup.length) {
        defects.push('R7 登记表有重复行：' + [...new Set(dup)].slice(0, 5).join(' / '));
    }
    if (!names.length) defects.push('R7 登记表里一行有效登记都没有（名册为空 = 跨仓守卫失去基准）');
}

/* ---------- 报告 ---------- */
console.log('=== 账本实体契约面 ===');
console.log('契约 ' + CONTRACT + ' @extra_js[' + at + '] | 消费者 ' + books.length + ' 本 | 契约 ' + contractSrc.length + ' 字符');
console.log('扫描面：manifest 声明 ' + extra.length + ' 个脚本，其中账本 ' + books.length + ' 本');
if (defects.length) {
    console.error('');
    for (const d of defects) console.error('[ledger-contract] ' + d);
    console.error('');
    console.error('[ledger-contract] 失败：账本实体契约面存在 ' + defects.length + ' 项缺陷。');
    process.exit(1);
}
console.log('[ledger-contract] 通过：契约声明在消费者之前、' + books.length
    + ' 本账全部委派、floor 一族走 finiteFloor、index.js 有真实读侧、无重复回潮、'
    + '域声明表成表、登记表无重复行。');
process.exit(0);
