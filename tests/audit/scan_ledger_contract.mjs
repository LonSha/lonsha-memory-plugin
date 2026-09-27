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
//   ---- v3.240.0 ~ v3.246.0 追加（判据与自述同源：清单改了这里也要改）----
//   R2b 楼层取值口：九账一律按名点名委派 `finiteFloor`（R3b 只盯 `floor: finite(` 形态）
//   R3c 文本一族不得就地重写（本地 `function text(` / 就地 trim / \s+ 折叠 / split 取首行）
//   R5b 导出面按**真形状**点名（加载真源，按真导出键集逐项判 typeof）
//   R9  账本名册 = 派生读数（谁真在跑契约 ↔ 名册登记了谁，必须同源）
// 退出码：0=卫生  1=存在真缺陷（重复回潮 / 未委派 / 未消费）  2=结构漂移（探测对象不在）
// 夹具通道：LONSHA_AUDIT_FIXTURE=1 放宽「账本数」下限，供单测塞合成仓库。
import fs from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

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

/* [v3.246.0] 账本级**派生读数**（唯一真源 tests/_fixture_sync.mjs）：谁真的在跑实体契约。
 *   【为什么在顶部算一次】R2b 与 R9 都要用它。两处各算一次就是又一份清单 ——
 *   而这正是本版要收掉的那个形态（清单 N 份，改一份漏 N−1 份）。
 *   【为什么喂 extra 而不是磁盘 glob】本门禁的样本是**加载面**：manifest 里没有的文件
 *   在浏览器里根本不会被执行，把它算成「消费者」是量错了对象。R4 的消费面同理写的是 index.js。
 *   【为什么读不到就结构漂移】真源缺失/被掏空时若静默降级成空集合，R9 会**恒绿**
 *   （没有任何消费者 ⇒ 永远没有「未登记」）。故 fail-closed：exit 2 并说清。
 *   【为什么用括号索引来判数组而不是 Array.isArray(obj[k])】本仓纪律：不猜。这里是要**显式点名**
 *   三个导出各自的形状，写成查表即形状与名字成对出现，掉了哪一个一眼可见。 */
let FX = null;
try { FX = await import('../_fixture_sync.mjs'); } catch (e) {
    bail('唯一真源 tests/_fixture_sync.mjs 不可加载（' + String((e && e.message) || e) + '）：账本级名册无从派生');
}
for (const [k, shaped] of [['ledgerLevelConsumers', (v) => typeof v === 'function'],
    ['LE_BLOCK', (v) => typeof v === 'string'],
    ['NON_BOOK_CONSUMERS', (v) => Array.isArray(v)]]) {
    if (!shaped(FX[k])) bail('唯一真源缺导出 ' + k + '（被掏空或改写成别的形状）：账本级名册无从派生');
}
const LEDGER_LEVEL = FX.ledgerLevelConsumers(ROOT, extra);
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
//   [v3.246.0] 指纹改由**真源**给出（FX.LE_BLOCK）。原先本文件与 tests/_fixture_sync.mjs 各写一份 ——
//   两串若哪天分叉，R2 会说「没有取库块」而 R9 说「在跑契约」，同一件事两个结论。
const LE_BLOCK = FX.LE_BLOCK;
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
/* [v3.246.0] 扫描面 = LEDGER_LEVEL（**派生**读数），不是 books（名册 ∩ 在场）。
 *   两者今天等长，但不等价：**新增第十本账**时 books 看不见它（它不在手抄的 BOOKS 里），
 *   于是 R2「没有取库块」这条永远抓不到**真正会发病的那一本**（新账本忘接契约）。
 *   派生读数的集合由「谁真的在跑契约」定义 ⇒ 新账本一出现就在扫描面内，漏接立刻被点名。 */
for (const f of LEDGER_LEVEL) {
    const src = readOrNull(path.join(ROOT, f)) || '';
    const need = NEEDS[f];
    if (!need) { defects.push('R2 ' + f + ' 不在委派表里：新增账本必须显式登记它委派哪几处'); continue; }
    for (const [needle, what] of need) {
        if (!src.includes(needle)) defects.push('R2 ' + f + ' 的' + what + '未走契约（缺 ' + needle + '）');
    }
}

/* ---------- R2b [v3.246.0] 楼层取值口：九账**一律**必须按名点名委派 `finiteFloor` ----------
 * 【为什么单列一条（不是重复劳动）】R3b 是**形态判据** —— 它只抓 `floor: finite(` 这一种写法。
 *   而本仓 floor 一族的实际写法绝大多数是**按名点名**的 `finiteFloor(...)`：把委派行
 *   `const finiteFloor = LE.finiteFloor;` 整行摘掉，floor 的每一处调用在文本形态上
 *   仍然长得**像**「走了契约」（名字还在），R3b 一个字都不会说 ⇒ 全门禁零响应。
 *   这是「判据齐全吗」与「判据覆盖的是不是同一件事」的分界：R3b 管**写法形态**，
 *   本段管**委派本身在不在**。两者缺一，就有一条路径能悄悄绕开。
 * 三本独立账的 NEEDS 里已登记该条（它们在 R2 主循环里判过），此处只补未登记的，避免同一事实报两条。 */
const FLOOR_DELEGATED = 'const finiteFloor = LE.finiteFloor';
/* 判谁：在册（有 NEEDS 登记）且尚未把该条写进委派表的账。
 *   【为什么先收成数组再循环】这一段原来边判边 continue —— 于是「判了几本」这个读数
 *   在文件里根本不存在（读数只出现在出错时）。收成数组后，判了几本、豁免几本都可枚举；
 *   豁免面由 FX.NON_BOOK_CONSUMERS **显式登记**（空表 = 当前事实），
 *   而不是「名字里有 Ledger 就放过」那种放宽（放宽之后判据什么都抓不到）。 */
const FLOOR_LEVEL = [];
for (const f of LEDGER_LEVEL) {
    if (!NEEDS[f]) continue;                       // 未登记的账已由 R2 点名，不重复报同一件事
    if (NEEDS[f].some((pair) => pair[0] === FLOOR_DELEGATED)) continue;
    FLOOR_LEVEL.push(f);
}
for (const f of FLOOR_LEVEL) {
    const src = readOrNull(path.join(ROOT, f)) || '';
    if (!src.includes(FLOOR_DELEGATED)) {
        defects.push('R2b ' + f + ' 的楼层取值口未走契约（缺 `' + FLOOR_DELEGATED + '`）—— '
            + 'R3b 只盯 `floor: finite(` 形态，摘掉委派行时它不会响');
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

/* ---------- R3c [v3.246.0] 文本一族不得就地重写 ----------
 * 【为什么单列一条】v3.207.0 把六本账各自抄的 `function text` 收进契约，当时**只有数一族**留下判据
 *   （R3 盯 `revision: finite(` 与 `.revision += 1`，R3b 盯 `floor: finite(`）—— **文本一族零判据**。
 *   于是「收编了谁」与「判据覆盖谁」两件事不同源：文本拷贝回潮，本门禁一个字都不会说。
 *   这正是本仓最贵的那种形态（绿着，但绿的成因不是判据在守）。
 *
 * 点名的五类就地实现（与 R3b 同族：按**形态**点名，不靠人记）：
 *   · 本地 `function text(` / 本地 `const text =`（非 `LE.text`）—— 回潮的原始形态；
 *   · 就地 `.trim()` —— 绕开契约的隐形空白口径（ZWSP / NBSP / BOM 不会被清掉）；
 *   · 就地 `.replace(/\s+/` 折叠 —— 同上，且它把「零宽串算不算空」的判据就地重写了一份；
 *   · 就地 `.split('\n')[0]` 取首行 —— 结果里会留下 CRLF 与首部空白。
 * **不误伤** `const text = LE.text;`（那正是委派本身）—— 故 `const text =` 的负向先行要吞掉空白，
 *   不能写成 `(?!LE\.)`：`=` 与 `LE` 之间有空格，那样写会把每一处正确委派都判成回潮（实测坐实）。 */
const LOCAL_TEXT_FORMS = [
    [/function\s+text\s*\(/, '本地声明 `function text(`'],
    [/const\s+text\s*=(?!\s*LE\.)/, '本地 `const text =` 未走契约'],
    [/\.trim\(\)/, '就地 `.trim()`（绕过契约的隐形空白口径）'],
    [/\.replace\(\s*\/\s*\\s\+\//, '就地 `.replace(/\\s+/` 折叠'],
    [/\.split\(\s*'\\n'\s*\)\s*\[\s*0\s*\]/, "就地取首行 `.split('\\n')[0]`"],
];
for (const f of books) {
    const src = readOrNull(path.join(ROOT, f)) || '';
    for (const [re, what] of LOCAL_TEXT_FORMS) {
        const n = (src.match(re) || []).length;
        if (n) {
            defects.push('R3c ' + f + ' 出现了' + what + '（' + n + ' 处）—— 文本归一必须走契约 LE.text');
        }
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
    'finite', 'finiteFloor', 'finiteNum', 'numOrNull', 'FINITE_DOMAINS', 'NUM_OR_NULL_DOMAINS']) {
    if (!new RegExp('\\b' + key + '\\b').test(contractSrc)) {
        defects.push('R5 契约模块缺导出面 `' + key + '`（被删/改名即判据失去真源）');
    }
}
/* ---------- R5b [v3.246.0] 导出面按**真形状**点名（不只按名字） ----------
 * 【为什么单列】上面那段 R5 只做文本存在性：`new RegExp('\\b' + key + '\\b').test(contractSrc)`。
 *   于是「导出面还在」只证明**名字被提过**，不证明它是函数、不证明它是这个契约的导出 ——
 *   把 `api` 里的项删掉而名字留在注释/别处，R5 照样绿（判据该看代码不看注释）。
 *   本段加载**真源**、按真导出键集逐项判 typeof；读数（导出面项数）由真源给出，
 *   故新增导出不改判据（数字自动跟随），删/改名则两处同时响。
 * 【为什么用 require 而不是 import】扫描器是同步流程，require 同为真源加载且不引入顶层 await；
 *   夹具模式下 ROOT 指向 mkdtemp，路径每次不同 ⇒ 不共享 require 缓存。 */
const req = createRequire(import.meta.url);
let contractApi = null;
try {
    contractApi = req(path.join(ROOT, CONTRACT));
} catch (e) {
    defects.push('R5b 契约真源无法加载（' + String((e && e.message) || e).slice(0, 90) + '）：导出面判据失去真源');
}
if (contractApi && typeof contractApi === 'object') {
    const FN_EXPORTS = ['text', 'finite', 'finiteFloor', 'finiteNum', 'numOrNull', 'names', 'revisionOf',
        'bumpRevision', 'recordEvent', 'copyHistory', 'scanBook', 'line'];
    for (const key of FN_EXPORTS) {
        if (typeof contractApi[key] !== 'function') {
            defects.push('R5b 契约导出 `' + key + '` 不是函数（typeof=' + typeof contractApi[key]
                + '）—— 消费方会静默取到 undefined 而不是报错');
        }
    }
    for (const key of ['REVISION', 'FINITE_DOMAINS', 'NUM_OR_NULL_DOMAINS', 'TEXT_DOMAINS']) {
        if (!contractApi[key] || typeof contractApi[key] !== 'object') {
            defects.push('R5b 契约导出 `' + key + '` 不是对象（typeof=' + typeof contractApi[key] + '）');
        }
    }
    console.log('  契约导出面 ' + Object.keys(contractApi).length + ' 项（真源读数）｜ 关键函数 '
        + FN_EXPORTS.length + ' 项逐一为 function');
} else if (contractApi !== null) {
    defects.push('R5b 契约真源加载到了非常规形状（typeof=' + typeof contractApi + '）');
}
// 契约自己不得反过来抄账本的局部常量（MAX_HISTORY 各账不同，收上来就把差异抹平了）
if (/MAX_HISTORY\s*=/.test(contractSrc)) {
    defects.push('R5 契约模块里出现了 MAX_HISTORY 常量 —— 各账上限不同（6/8/8/12/12），必须留在各自模块');
}

/* 取某个 top-level 声明段：从 marker 起，到**下一个** `\n  const ` 为止。
 * 【为什么不能用固定窗口】v3.242.0 写的是 `slice(at, at + 2600)`；v3.243.0 在
 *   `NUM_OR_NULL_DOMAINS` 之后 657 字符处又加了一张 `FINITE_DOMAINS` ⇒
 *   R6b 的窗口**跨进了下一张表**，读到 48 条样本（自己只有 25 条）、
 *   还能匹到别人表里的期望值。这个缺陷是被 tests/v3243 D4 的负控制抓出来的：
 *   把第二张表的 cases 抽到 2 条，R6b 却仍然绿 —— 因为它数的是**别人的**样本。
 *   固定窗口 = 「按猜的长度取段」，本仓的老毛病；改成按声明边界取。 */
function declSegAt(marker) {
    const at = contractSrc.indexOf(marker);
    if (at < 0) return null;
    const rest = contractSrc.slice(at + marker.length);
    const nx = /\n  const /.exec(rest);
    return contractSrc.slice(at, at + marker.length + (nx ? nx.index : rest.length));
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
    const seg = declSegAt('const FINITE_DOMAINS = Object.freeze({');
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

/* ---------- R9 [v3.246.0] 账本名册与扫描面必须**同源**（不是「多处手抄」） ----------
 * 【为什么单列一条（这是计划 #9 的本体，不是整洁性偏好）】本门禁原来断言的是
 *   「扫描面里有 N 本账」—— 判的是**手抄的那份清单**，不是磁盘事实。
 *   于是有一条路径能同时绕开 R2/R2b/R3/R3b/R3c：**新增一本账本级的契约消费者**。
 *   新账本必然在跑契约（有取库块），但没进 BOOKS ⇒ 它**同时**满足
 *     · 不在 `books` 里（BOOKS.filter 看不见它）⇒ R2 / R2b / R3 / R3b / R3c 全部跳过；
 *     · 不在 manifest 之外（它在 extra_js 里，装载面正常）⇒ R1 也说不着；
 *   全门禁一字不说。本仓为这个形态付过学费（「收编了谁」与「判据覆盖谁」不同源）。
 *   故 R9 量的是**同一件事的两侧**：谁真的在跑契约（派生读数）↔ 名册里登记了谁（手写一处）。
 *
 * 【为什么断言「同源」而不是断言「等长」】两者都能写下今天的九本；
 *   但只有同源能在**新增一本**时翻红 —— 等长只会说「数量没变，通过」。
 *   这正是本仓最贵的形态：绿着，但绿的成因不是判据在守。
 *
 * 【登记点只有一处】新增账本 ⇒ 在 BOOKS 补一行 + 在 manifest.extra_js 登记（R1 会盯顺序）。
 *   派生读数自动跟上，本判据随即验证两边确实对上了。
 * 【非账本消费者】若将来真出现「装了契约但不算账本」的文件，登记进真源的
 *   NON_BOOK_CONSUMERS 并说明 —— 不是把判据放宽。
 */
const consumerSet = new Set(LEDGER_LEVEL);
const declaredSet = new Set(BOOKS.concat(FX.NON_BOOK_CONSUMERS));
for (const f of LEDGER_LEVEL) {
    if (!declaredSet.has(f)) {
        defects.push('R9 ' + f + ' 在跑账本实体契约（含取库块）却不在名册里 —— '
            + '收编了谁与判据覆盖谁必须同源：新增账本请在 BOOKS 登记，真非账本者登记进 NON_BOOK_CONSUMERS');
    }
}
for (const f of BOOKS) {
    if (!consumerSet.has(f)) {
        defects.push('R9 名册里的 ' + f + ' 当前并没有在跑账本实体契约（缺取库块）—— 名册与扫描面不同源');
    }
}
const liveBooks = books.filter((f) => consumerSet.has(f));
if (liveBooks.length < MIN_BOOKS) {
    defects.push('R9 在场且在跑契约的账本只 ' + liveBooks.length + ' 本（下限 ' + MIN_BOOKS
        + '）—— 扫描面不可信：账本被改名、删取库块或未加载');
}
/* 读数分三层（对齐本仓纪律：判据也要给可枚举读数，否则「扫了几个」只有出错时才知道）：
 *   派生（谁真在跑契约）｜ 名册（手抄一处）｜ 在场且在跑（下限判据的对象）。
 *   非账本消费者登记面单列：它当前是空表（0 本），**空表也要有读数** ——
 *   否则那张表是死代码，「有值没人读」正是本仓治理过的形态。 */
console.log('  账本级名册 ' + LEDGER_LEVEL.length + ' 本（由 tests/_fixture_sync.mjs 派生，非手抄）｜ 名册登记 '
    + BOOKS.length + ' 本（含非账本消费者 ' + FX.NON_BOOK_CONSUMERS.length + ' 本）｜ 在场且在跑 '
    + liveBooks.length + ' 本｜楼层取值口按名点名委派 ' + FLOOR_LEVEL.length + ' 本');
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

/* ---------- R6b [v3.243.0] 第二张声明表：numOrNull / finiteNum 一族 ----------
 * 【为什么要有第二张】v3.242.0 给「楼层」族立了表（FINITE_DOMAINS），但同一份契约里
 *   还住着「原样数」族（时间戳 / 字节 / 计数 / 版本号）—— 它的输出域里**必须有小数**，
 *   与楼层族「只出整数」的承诺恰好相反。两族塞进一张表就等于又把语义混回去。
 *   本判据只保证「表还在、而且是表」；真值对拍在 tests/v3243 里做（真函数 × 真表）。 */
const ndAt = contractSrc.indexOf('const NUM_OR_NULL_DOMAINS = Object.freeze({');
if (ndAt < 0) {
    defects.push('R6b 契约缺「原样数」族的域声明表 NUM_OR_NULL_DOMAINS（该族输出域里必须有小数）');
} else {
    const seg2 = declSegAt('const NUM_OR_NULL_DOMAINS = Object.freeze({');
    if (!/outputs:\s*Object\.freeze\(\[/.test(seg2)) {
        defects.push('R6b NUM_OR_NULL_DOMAINS 缺 outputs 声明（输出不可枚举 ⇒ 判据无法收口）');
    }
    const casesAt2 = seg2.indexOf('cases: Object.freeze([');
    if (casesAt2 < 0) {
        defects.push('R6b NUM_OR_NULL_DOMAINS 缺 cases 声明（没有对拍样本 ⇒ 表是装饰）');
    } else {
        const rows2 = [...seg2.slice(casesAt2).matchAll(/\['([^']+)',\s*'([^']+)'\]/g)];
        if (rows2.length < 10) {
            defects.push('R6b NUM_OR_NULL_DOMAINS.cases 只有 ' + rows2.length + ' 条（< 10）：样本被抽薄');
        }
        const outs2 = new Set([...seg2.matchAll(/outputs:\s*Object\.freeze\(\[([^\]]*)\]/g)]
            .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])));
        for (const [, label2, exp2] of rows2) {
            if (!outs2.has(exp2)) defects.push('R6b NUM_OR_NULL_DOMAINS 样本「' + label2 + '」的期望不在 outputs 里（表自相矛盾）：' + exp2);
        }
        /* 与楼层族相反的口径：原样数族必须有小数的位置（否则与楼层族无法区分）。
         * 【同一个坑第三次 · 留痕】本行首跑写成 `r[1] === 'num'` —— 而 `matchAll` 的结果里
         *   下标 0 是完整匹配、1 才是**第一个捕获组（标签）**，期望值在下标 2。
         *   上一行 `for (const [, label2, exp2] of rows2)` 刚解构对了，下一行又用回下标。
         *   R6 首跑（v3.242.0）栽的是同一件事：**正则捕获组的下标不是「谁看起来像」**。 */
        if (!rows2.some((r) => r[2] === 'num')) {
            defects.push('R6b NUM_OR_NULL_DOMAINS.cases 里一条「num」样本都没有（表与楼层族无法区分）');
        }
    }
}

/* ---------- R8 [v3.243.0] 名字即口径：别名的取整/原样语义必须与名字同族 ----------
 * 【为什么单列一条】v3.240.0 把 `finiteFloor` 与 `numOrNull` 当成「同判据的两个名字」，
 *   于是 `numOrNull` 成了**取整版**；而全仓另外七处同名函数都不取整，
 *   实测分歧 5/18 个样本（0.5 / -0.5 / 3.9 / 字符串 0.5 / -0）。
 *   两个名字指向同一判据时，这类错误**没有任何判据能发现** —— 两边各自都「自洽」，
 *   只有把它们**放在一起按名字核对口径**才判得出来。本判据就是那一下核对：
 *     · 名字属「楼层」族（`finite` / 以 Floor 结尾）⇒ 函数体必须取整；
 *     · 名字属「原样数」族（`numOrNull` / `finiteNum`）⇒ 函数体必须原样返回。
 *   转发按目标递归判定（转发不是第二份实现，但**转发目标的口径就是它的口径**）。 */
const FN_NAMES = ['finite', 'finiteFloor', 'numOrNull', 'finiteNum'];
const RAW_FAMILY = /^numOrNull$|^finiteNum$/;
const FLOOR_FAMILY = /^finite$|Floor$/;
function fnBodyOf(name) {
    const at2 = contractSrc.indexOf('function ' + name + '(');
    if (at2 < 0) return null;
    const open = contractSrc.indexOf('{', at2);
    if (open < 0) return null;
    let depth = 0;
    for (let i = open; i < contractSrc.length; i++) {
        const c = contractSrc[i];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return contractSrc.slice(open, i + 1); }
    }
    return null;
}
function fnKindOf(name, seen) {
    const b = fnBodyOf(name);
    if (b == null) return 'absent';
    const guard = seen || {};
    if (guard[name]) return 'unknown';
    guard[name] = true;
    if (/Math\.floor\(/.test(b)) return 'rounded';
    if (/\.isFinite\(n\)\s*\?\s*n\b/.test(b)) return 'raw';
    const d = /return\s+(finiteFloor|finiteNum|finite|numOrNull)\(/.exec(b);
    if (d) return fnKindOf(d[1], guard);
    return 'unknown';
}
for (const name of FN_NAMES) {
    const kind = fnKindOf(name, {});
    if (kind === 'absent') {
        defects.push('R8 契约缺 function ' + name + '（四门之一定义不见了：判据失去真源）');
        continue;
    }
    if (kind === 'unknown') {
        defects.push('R8 契约 ' + name + ' 的口径判不出来（既无 Math.floor、也无原样返回、也无可解析的转发）');
        continue;
    }
    if (FLOOR_FAMILY.test(name) && kind !== 'rounded') {
        defects.push('R8 契约 ' + name + ' 名字属「楼层」族却口径为 ' + kind + '（不取整）：名字与语义不同族 —— 同名不同义就是这么长出来的');
    }
    if (RAW_FAMILY.test(name) && kind !== 'raw') {
        defects.push('R8 契约 ' + name + ' 名字属「原样数」族却口径为 ' + kind + '（取整）：时间/字节/计数会被悄悄抹掉小数');
    }
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
    + '两张域声明表成表、登记表无重复行、名字与口径同族（R3c 文本一族有判据、R2b 楼层取值口、R5b 导出面按真形状点名）。');
process.exit(0);
