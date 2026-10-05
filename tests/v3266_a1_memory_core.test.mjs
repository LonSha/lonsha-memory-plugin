/* ============================================================
 * tests/v3266_a1_memory_core.test.mjs — v3.266.0 [v3.267.0 frontier: A1 第七刀接管末项与V4/V5锚]
 *   出生下界 3.266.0 保持不变；V4 当版锚点由下方 `vnum('3.267.0')` frontier 明确接管。
 *
 * 主题：A1 宿主巨兽第六刀 —— 四个「内核数据模型」类（MemoryGraph / SummarySystem /
 *   GameClock / CharacterState）抽为 memory-core.js 之后的**接线、行为、依赖收口与破坏面**。
 *
 *   【为什么本档存在】
 *     前五刀剥的是叶子账本（一）、工具类（二）、生成侧派生系统（三）、书册与时间（四）、
 *     器官级类（五）。本刀剥的是宿主里最大的一块**内核数据模型**：它们不是「被调用的功能」，
 *     而是引擎字段的**唯一容器** —— 宿主自身只按字段名与方法名驱动它们
 *     （this.graph / this.summary / this.clock / this.status）。于是本刀多出三类
 *     **只有本刀才有的**风险：
 *       · ★ 字段名与类名刻意不同名：判据按类名推 `this.<Class>` 会恒红（或反向恒绿）。
 *       · ★ 同名函数有两份（parseStoryDateLoose ×2 / storyDayDiff ×1）：搬错一份就是第二真源。
 *         本刀的正解是**既不搬也不取** —— 四个类体只在一条注释里提到它们，零代码引用。
 *       · ★ 模块侧 VERSION 必须是 `let`：bindDeps 要能换它。照抄宿主的 `const` 会让
 *         `VERSION = d.version` 当场 TypeError，宿主 _bindCoreDeps 的 try/catch 把它吞掉，
 *         于是**整轮依赖注入静默中断**（B 段专门钉住这一条，D 段用它做负控制）。
 *     故本档不问「文件里有没有这几个类」，而问「接线是否逐点在场、依赖是否真被注入、
 *     副本是否与宿主同源、破坏之后同一条判据会不会翻红」。
 *
 *   【判据与负控制跑同一份代码】
 *     judgeSlice(idxSrc, modSrc) 是纯函数；A 段对磁盘真源码跑它，D 段对**真源码破坏后的
 *     副本**跑同一个它。破坏一律走唯一真源 tests/_break_kit.mjs 的 breakSource（锚点须恰中 1 次）。
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';
import { stripComments } from './_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const NL = String.fromCharCode(10);
const Q = String.fromCharCode(39);
const BS = String.fromCharCode(92);
const MOD_REL = 'memory-core.js';
const IDX = read('index.js');
const MOD = read(MOD_REL);
const MC = (await import('../memory-core.js')).default;
const SELF = read('tests/v3266_a1_memory_core.test.mjs');
/** 本刀剥走的四个内核数据模型类。 */
const CORE = ['MemoryGraph', 'SummarySystem', 'GameClock', 'CharacterState'];
/** 宿主实例字段 -> 类名（刻意不同名，故不能按类名推字段名）。 */
const FIELDS = { graph: 'MemoryGraph', summary: 'SummarySystem', clock: 'GameClock', status: 'CharacterState' };
/** 类成员面（不含 constructor）：退路与真实现按方法名对账，也是「搬完整了没有」的抽样面。
 *  共 107 项（17 + 33 + 12 + 45）—— 数字写在 F 段，防清单被静默裁短。 */
const MEMBERS = {
    MemoryGraph: ['_logGraphOp', 'rebuildGraphFromOps', 'rollbackGraphFrom', 'snapshotGraph', 'truncateGraphFrom', 'addNode', 'addEdge', 'findByNames', 'findCharacterByName', 'rebuildNameIndex', 'findNodesMentionedIn', 'vacuum', 'rollupGroup', 'maintainGraph', 'autoRollup', 'export', 'import'],
    SummarySystem: ['_reportError', 'addLockedFact', 'removeLockedFact', 'getLockedFacts', 'lockedFactsForPrompt', 'updateSummaryText', 'addManualSummary', 'missingFloors', 'completeMissingFloors', 'smartTruncate', 'compressSummary', 'createSummary', 'generateAMIndex', 'resolveByAMCodes', 'getActiveSummaries', 'search', 'markDormant', 'awakenByEntities', 'maybeFold', 'foldHigherTiers', 'enqueueRetry', 'processRetryQueue', 'getTaskInbox', 'getTaskInboxReport', 'maybeFoldHistorical', 'verifyVolumesIntact', 'getIntactVolumes', 'getActiveVolumes', 'searchVolumes', 'addGrandChronicle', 'getGrandChroniclePrompt', 'export', 'import'],
    GameClock: ['parseStoryDate', 'calcAge', 'setTime', 'getSnapshot', 'syncFromNarrative', 'getContextPrompt', 'export', 'readWorldAxisClock', 'worldClockLine', 'readWorldLedger', 'worldLedgerLine', 'import'],
    CharacterState: ['setBaseline', 'recordDrift', 'getEffectivePersona', 'registerTransientNpc', 'promoteNpc', 'isNpcTracked', 'setGeoLocation', 'getGeoLocation', 'getGeoPrompt', 'addNpcTie', 'setNpcTies', 'getNpcTies', 'getAllNpcTies', 'getNpcTiesRecords', 'setProtagonist', 'getEffectiveAge', '_clockHelpers', '_ageAnchor', 'getProtagonist', 'getProtagonistPrompt', '_normalizeDetailText', 'addLifeDetail', 'removeLifeDetail', 'removeLifeDetailByFloor', 'shiftLifeDetailFloors', 'removeProtagonistByFloor', 'shiftProtagonistFloor', 'shiftDriftFloors', 'removeDriftByFloor', 'shiftBaselineFloors', 'shiftGeoFloor', 'getLifeDetailsPrompt', '_logOp', 'rebuildFromOps', '_ensure', 'ageReadingPrompt', 'ageReading', 'exportAgeAnchors', 'applyChanges', 'addTodos', 'pruneTodos', 'getChangesSince', 'searchByNames', 'export', 'import'],
};
/** 逐字副本：宿主函数符号（模块内必须与宿主逐字同源；errLog 是唯一非逐字的一份）。 */
const VERBATIM_FNS = ['normalizeCharName', 'sanitizeJson', 'areLabelsInConflict'];
/** 逐字副本：宿主常量（VERSION 单列，因为它在模块侧必须是 let）。 */
const VERBATIM_CONSTS = ['PLUGIN_NAME', 'RELATION_CONFLICT_GROUPS', 'VERSION'];
/** 取库链副本：只复制「怎么取到它」这一层，不复制被取对象的逻辑（故不构成第二真源）。 */
const LIB_CHAIN = ['_moduleLib', '_memoryBooksLib', '_changeset', '_newRelativeTimeHelper'];
/** bindDeps 的键面（宿主 _bindCoreDeps 必须逐个提供）。 */
const DEP_KEYS = ['errLog', 'sanitizeJson', 'moduleLib', 'memoryBooksLib', 'changesetLib', 'relativeTimeHelperFactory', 'version'];
/** 双份同名函数：宿主仍须持有它们（本刀不搬），而类体里**不得有代码引用**。 */
const DUAL_FNS = ['parseStoryDateLoose', 'storyDayDiff'];
/** 退路缺席对照的锚点（宿主 CoreFallback 里必须存在）：D 段与 F 段共用同一个字面量，防拆出两份。 */
const FB_ANCHOR = "        getGeoPrompt() { return ''; }";   /* D/F 两段共用：字面量在本档只出现这一处 */

function classEnd(src, at) {
    const open = src.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return i + 1; }
    }
    return src.length;
}
function blockOf(src, at) { return src.slice(at, classEnd(src, at)); }
const CTRL = ['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'new'];
const memberRe = (indent) => new RegExp('^ {' + (indent + 4) + '}(?:static\\s+)?(?:async\\s+)?(?:get\\s+|set\\s+)?([A-Za-z_$][\\w$]*)\\s*\\(', 'gm');
const methodNames = (body, indent) => [...body.matchAll(memberRe(indent))].map((m) => m[1]).filter((n) => !CTRL.includes(n));
function methodsOf(src, name) {
    const at = src.indexOf('class ' + name + ' {');
    if (at < 0) return null;
    const indent = at - (src.lastIndexOf(NL, at - 1) + 1);
    return methodNames(blockOf(src, at), indent);
}
function classSpan(src, name) {
    const at = src.indexOf('class ' + name + ' {');
    if (at < 0) return null;
    return blockOf(src, at).split(NL).length;
}
/** 逐字副本比对：归一化空白后必须完全相同。 */
const nz = (s) => s.replace(/\s+/g, '');
function fnBody(src, header) {
    const at = src.indexOf(header);
    if (at < 0) return null;
    return blockOf(src, at);
}
/** 剥行注释：形态判据一律在它上面做，防注释里的示例文字自我满足。 */
const stripLine = (t) => t.split(NL).map((l) => l.replace(/\/\/.*$/, '')).join(NL);
const ok = (m) => console.log('  \u2713 ' + m);

/**
 * 真判据体（纯函数，无副作用）。返回问题列表，空数组 = 卫生。
 * A 段与 D 段跑的是**同一个它**。
 */
function judgeSlice(idxSrc, modSrc) {
    const problems = [];
    /* ① 宿主不得再内联声明，模块必须真声明它 */
    for (const name of CORE) {
        if (new RegExp('class ' + name + '\\s*\\{').test(idxSrc)) problems.push('index.js 仍内联 ' + name);
        if (!modSrc.includes('class ' + name + ' {')) problems.push(MOD_REL + ' 缺 ' + name);
    }
    /* ② 构造点逐点在场、恰一次、接在宿主字段上（字段名与类名刻意不同名） */
    for (const [field, name] of Object.entries(FIELDS)) {
        const needle = 'this.' + field + ' = _newCore(' + Q + name + Q;
        const n = idxSrc.split(needle).length - 1;
        if (n !== 1) problems.push('构造点 ' + needle + ' 命中 ' + n + ' 次（须恰 1）');
    }
    /* ③ 取库口：具名函数 + 真读表达式 */
    if (!/function _memoryCoreLib\(\)\s*\{/.test(idxSrc)) problems.push('缺具名取库口 _memoryCoreLib()');
    if (!idxSrc.includes("_moduleLib(() => window.LonShaMemoryCore, '" + MOD_REL + "')")) {
        problems.push('取库口不是真读表达式 window.LonShaMemoryCore');
    }
    /* ④ 缺席退路 + 统一构造点 + 依赖注入口 + 调用点 */
    if (!/class CoreFallback/.test(idxSrc)) problems.push('缺缺席退路 CoreFallback');
    if (!/function _newCore\(name, \.\.\.args\)/.test(idxSrc)) problems.push('缺统一构造点 _newCore(name, ...args)');
    if (!/function _bindCoreDeps\(\)\s*\{/.test(idxSrc)) problems.push('缺依赖注入口 _bindCoreDeps()');
    if (!idxSrc.includes('_bindCoreDeps();')) problems.push('_bindCoreDeps 定义了却没有调用点（依赖永远是副本）');
    /* ⑤ 依赖面：模块必须真导出 bindDeps，宿主必须逐个供给 */
    if (!/function bindDeps\(deps\)\s*\{/.test(modSrc)) problems.push(MOD_REL + ' 缺 bindDeps(deps)');
    const bindBlock = fnBody(idxSrc, 'function _bindCoreDeps() {') || '';
    for (const k of DEP_KEYS) {
        const re = new RegExp('(^|[\\s{,])(_?)' + k + '\\s*[:,]');
        if (!re.test(bindBlock)) problems.push('_bindCoreDeps 未提供 ' + k);
    }
    /* ⑥ 退路与真实现按方法名对账 */
    problems.push(...fallbackParity(idxSrc, modSrc));
    /* ⑦ 成员面不得缩水 */
    for (const [name, members] of Object.entries(MEMBERS)) {
        const real = methodsOf(modSrc, name);
        if (!real) { problems.push(MOD_REL + ' 里切不出 ' + name + '（判据自身失效）'); continue; }
        for (const m of members) if (!real.includes(m)) problems.push('模块 ' + name + ' 缺成员 ' + m);
    }
    /* ⑧ 逐字副本必须与宿主同源（唯一真源仍是宿主） */
    for (const fn of VERBATIM_FNS) {
        const modBody = fnBody(modSrc, 'function ' + fn);
        const hostBody = fnBody(idxSrc, 'function ' + fn);
        if (!modBody) { problems.push(MOD_REL + ' 缺 ' + fn + ' 的逐字副本'); continue; }
        if (!hostBody) { problems.push('宿主缺 ' + fn + '（判据自身失效）'); continue; }
        if (nz(modBody) !== nz(hostBody)) problems.push(MOD_REL + ' 的 ' + fn + ' 副本与宿主不逐字同源（副本已漂移）');
    }
    for (const c of VERBATIM_CONSTS) {
        if (!new RegExp('(const|let)\\s+' + c + '\\s*=').test(modSrc)) problems.push(MOD_REL + ' 缺常量副本 ' + c);
    }
    /* ⑨ 取库链副本：形态在场（不复制被取对象的逻辑） */
    for (const L of LIB_CHAIN) {
        if (!new RegExp('(let|function)\\s+' + L + '\\s*[=(]').test(modSrc)) problems.push(MOD_REL + ' 缺取库链副本 ' + L);
    }
    /* ⑩ ★ 本刀特有：模块侧 VERSION 必须是 let —— bindDeps 要能换它。
     *   照抄宿主的 const 会让 `VERSION = d.version` 当场 TypeError，
     *   宿主 _bindCoreDeps 的 try/catch 把它吞掉，**整轮依赖注入静默中断**。 */
    if (!/^\s*let VERSION\s*=\s*/m.test(modSrc)) problems.push(MOD_REL + ' 的 VERSION 不是 let（bindDeps 赋值会 TypeError，宿主 catch 吞掉并中断整轮注入）');
    /* ⑪ 双份同名函数：宿主仍须持有，而类体里不得有代码引用（本刀既不搬也不取） */
    for (const fn of DUAL_FNS) {
        if (!new RegExp('function ' + fn + '\\s*\\(').test(idxSrc)) problems.push('宿主已丢失 ' + fn + '（双份定义被搬走，读数轴基线口径被偷改）');
        for (const name of CORE) {
            const span = classSpan(modSrc, name);
            if (span == null) continue;
            const at = modSrc.indexOf('class ' + name + ' {');
            const body = stripComments(blockOf(modSrc, at));
            if (new RegExp('\\b' + fn + '\\s*\\(').test(body)) problems.push(name + ' 体内出现 ' + fn + ' 的代码引用（本刀应为零引用，仅注释提及）');
        }
    }
    /* ⑫ 不得造假类填「形态在场、永不执行」的 else 分支（第四刀已将其外移） */
    if (/class RelativeTimeHelper/.test(modSrc)) problems.push(MOD_REL + ' 造了假的 RelativeTimeHelper（会长出第二个时间解析真源）');
    /* ⑬ 模块自身只准有受控宿主接触面 */
    const mLines = stripComments(modSrc).split(NL);
    for (let i = 0; i < mLines.length; i++) {
        if (!mLines[i].includes('require(')) continue;
        const win = [mLines[i], mLines[i - 1] || '', mLines[i - 2] || ''].join(NL);
        if (win.includes('typeof require')) continue;
        problems.push(MOD_REL + ' 出现未守卫的裸 require(（模块自长的宿主依赖）');
        break;
    }
    if (!modSrc.includes('global.LonShaMemoryCore = api')) problems.push(MOD_REL + ' 缺全局导出面');
    if (!modSrc.includes('module.exports = api')) problems.push(MOD_REL + ' 缺 CommonJS 导出面');
    /* ⑭ 依赖锚点：宿主那些符号必须仍在宿主（搬走就是改了读数轴的尺子） */
    for (const c of VERBATIM_CONSTS) {
        if (!new RegExp('(const|let)\\s+' + c + '\\s*=').test(idxSrc)) problems.push('宿主已丢失 ' + c + '（依赖锚点被搬走）');
    }
    for (const fn of ['errLog', 'sanitizeJson', '_moduleLib', '_changeset', '_memoryBooksLib', '_newRelativeTimeHelper']) {
        if (!new RegExp('(function|let)\\s+' + fn + '\\b').test(idxSrc)) problems.push('宿主已丢失 ' + fn + '（依赖锚点被搬走）');
    }
    return problems;
}

/** 退路与真实现的方法面必须对得上（真实现有的，退路必须有同名空实现）。 */
function fallbackParity(idxSrc, modSrc) {
    const problems = [];
    const at = idxSrc.indexOf('class CoreFallback');
    if (at < 0) return ['退路类体切不出来（判据自身失效）'];
    const fbIndent = at - (idxSrc.lastIndexOf(NL, at - 1) + 1);
    const fbNames = new Set(methodNames(blockOf(idxSrc, at), fbIndent));
    for (const name of CORE) {
        const real = methodsOf(modSrc, name);
        if (!real) { problems.push(MOD_REL + ' 里切不出 ' + name + '（判据自身失效）'); continue; }
        for (const m of real) {
            if (m === 'constructor') continue;
            if (!fbNames.has(m)) problems.push('退路缺方法 ' + name + '.' + m);
        }
    }
    return problems;
}

/* ========== A 接线逐点在场 ========== */
test('v3266 A. 接线逐点在场：宿主不内联 / 模块真声明且成员齐 / 四处构造点对位 / 退路同形 / 依赖收口', () => {
    const problems = judgeSlice(IDX, MOD);
    assert.deepEqual(problems, [], '接线面缺陷：' + JSON.stringify(problems));
    ok('接线逐点在场（判据体与 D 段负控制同源）');
});

/* ========== B 模块真加载 + 行为 ========== */
test('v3266 B. 模块真加载：导出面 + 四类真构造 + 逐类语义抽检（含独立可用性）', async () => {
    for (const n of CORE) assert.equal(typeof MC[n], 'function', n + ' 须可构造');
    assert.equal(typeof MC.bindDeps, 'function', 'bindDeps 须可真调用');
    assert.equal(MC.PLUGIN_NAME, (/const PLUGIN_NAME = '([^']*)'/.exec(IDX) || [])[1], 'PLUGIN_NAME 副本须与宿主同值');
    /* MemoryGraph：归一化索引 / 同维度冲突闭环 / 快照与层级汇总 */
    const g = new MC.MemoryGraph();
    const id1 = g.addNode({ name: '绥地宁宁', type: 'character' });
    const id2 = g.addNode({ name: '绥地 宁宁', type: 'character' });
    assert.equal(g.findByNames(['绥地宁宁']).length, 2, 'NFKC+空白折叠+小写归一后两节点共一归一化索引键（同一身份）');
    assert.equal(g.findByNames(['绥地 宁宁']).length, 1, '原名键也保留（兼容未归一化的旧查询）—— 本节点自己的原名键');
    const e1 = g.addEdge({ from: id1, to: id2, label: '友好', floor: 1 });
    const e2 = g.addEdge({ from: id1, to: id2, label: '敌对', floor: 2 });
    assert.equal(g.edges.get(e1).active, false, '同维度冲突谓词应闭环旧边');
    assert.equal(g.edges.get(e1).validTo, 2, '旧边有效区间在新边楼层收口');
    assert.equal(g.edges.get(e2).active, true, '新边仍活');
    assert.equal(g.snapshotGraph(2).nodes.length, 2, '快照捕到两节点');
    assert.equal(g.truncateGraphFrom(1), false, '楼层 1 前无快照→回滚失败且不报错');
    assert.equal(typeof g.export().nodes.length, 'number', 'export 导出形状在场');
    /* SummarySystem：锁定事实预算裁剪 / 智能截断 / 手动补摘幂等 */
    const s = new MC.SummarySystem();
    assert.equal(s.lockedFactsForPrompt(100), '', '无锁定事实时返空串');
    const fid = s.addLockedFact('事实甲', 3);
    assert.ok(fid && s.getLockedFacts().length === 1, '锁定事实真写入');
    assert.equal(s.lockedFactsForPrompt(100), '- 事实甲（第3楼锁定）', '锁定事实注入文本形态（含楼层归因）');
    assert.equal(s.removeLockedFact(fid), true, '移除锁定事实真生效');
    assert.equal(s.smartTruncate('一二三四五六七八九十。', 4), '一二三四……', '截断在合理位置并补省略号');
    assert.equal(s.addManualSummary(5, '', ''), null, '空文本不建摘要（不静默写空）');
    assert.equal(s.addManualSummary(5, '五楼剧情摘要', '').floor, 5, '手动补摘落幂正确');
    assert.equal(s.addManualSummary(5, '重复', ''), null, '同楼层补摘幂等（防重复写入）');
    assert.ok(Array.isArray(s.search('剧情')), 'search 返回数组');
    /* GameClock：时钟推进 / 回忆严格隔离 / 快照形状 */
    const c = new MC.GameClock();
    const set1 = c.setTime({ date: '2026-09-13', label: '申时', floor: 7 });
    assert.equal(set1.updated, true, '新日期+新标签→时钟真推进');
    assert.equal(set1.clock.precision, 'day', '日期精度读为 day');
    const fb = c.setTime({ flashback: true, date: '1999-01-01', floor: 8 });
    assert.equal(fb.flashback, true, '回忆走隔离分支');
    assert.equal(c.getSnapshot().date, '2026-09-13', '★ 回忆绝不改主剧情时钟（日期不变）');
    assert.equal(c.getSnapshot().turn, 7, '回忆也不推楼层');
    assert.equal(c.getSnapshot().lastFlashback.date, '1999-01-01', '回忆单独记下');
    assert.ok(c.getContextPrompt().includes('[当前剧情时间]'), '上下文提示词在场');
    assert.equal(c.parseStoryDate('2026-09-13').year, 2026, '日期解析委托真到相对时间助手');
    assert.equal(c.readWorldAxisClock(null).ok, false, '世界钟读者缺席→如实报 ok:false（不槽不猜）');
    /* CharacterState：基线/漂移衰减 / NPC 晋升 / 三级地理 / 人伦瞾绊 / 生活小档案 */
    const st = new MC.CharacterState();
    st.setBaseline('夏木', { traits: ['冷静'], speechStyle: '简短', floor: 1 });
    st.recordDrift('夏木', { mood: '烦躁', floor: 3 });
    assert.equal(st.getEffectivePersona('夏木', 5).hasDrift, true, '15 楼内有效漂移→ hasDrift真');
    assert.equal(st.getEffectivePersona('夏木', 30).hasDrift, false, '★ 超过 15 楼无新刺激→ 漂移自然衰减（不是一直挂着）');
    st.registerTransientNpc('店员', { identity: '路人', floor: 2 });
    st.registerTransientNpc('店员', { floor: 4 });
    assert.equal(st.promoteNpc('店员'), true, '路人真晋升为常驻');
    assert.equal(st.isNpcTracked('店员'), true, '晋升后跟踪状态为真');
    st.setGeoLocation({ majorArea: '日本', minorArea: '东京', detailLocation: '涩谷', floor: 2 });
    assert.ok(st.getGeoPrompt().includes('涩谷'), '三级地理真进提示词');
    assert.deepEqual(st.addNpcTie('夏木', '同学；邻居'), ['同学', '邻居'], '全角分号真拆成两条瞾绁');
    st.addLifeDetail({ text: '爱喝黑咖啡' }, 4);
    assert.equal(st.removeLifeDetailByFloor(4), 1, '按楼删生活小档案真生效');
    assert.ok(st.export().baselines['夏木'], 'export 携带基线面');
    assert.deepEqual(st.searchByNames(['夏木']).length, 0, 'searchByNames 只读派生缓存（未同步时为空，不报错）');
    /* ★ 卡关开关（本刀特有，实测曾真红）：模块侧 VERSION 必须是 let，
     *   否则 bindDeps 的 `VERSION = d.version` 当场 TypeError，宿主 catch 吞掉→**整轮依赖注入静默中断**。
     *   这里真跑一次完整注入，读回被换掉的项数与新 VERSION。 */
    /* ★ 实测曾真红的一条：在一个**全新实例**上真跑完整注入（不污染本档共用的 MC），读回被换掉的项数与新 VERSION。
     *   ★ 这是**行为面**的根因探针：A 段只数「字段写没写 let」不够 —— const 下赋值会抛，而抛出后模块继续用副本跑，看上去一切正常。 */
    const fresh = (await import('../memory-core.js?fresh=' + Date.now())).default;
    let n = 0, threw = null;
    try { n = fresh.bindDeps({ errLog: () => {}, sanitizeJson: (x) => x, moduleLib: () => null, memoryBooksLib: () => null, changesetLib: () => null, relativeTimeHelperFactory: () => null, version: '9.9.9' }); } catch (e) { threw = e; }
    assert.equal(threw, null, '七个 key 里不得有任何一个抛（抛 = 整轮注入中断，宿主 try/catch 吞掉），实抛 ' + (threw && threw.message));
    assert.equal(n, 7, '七个 key 逐个真被换（含 version），实得 ' + n + ' —— 少一个就是内部断在那个 key 上');
    /* ★ 留痕（实测）：导出面 `api.VERSION` 是 **Object.freeze 的快照**，
     *   注入后不会跟着变 —— 故对 version 的可观测面就是上面那两条：
     *   **不抛**（const 会抛 TypeError）+ **n 恰为 key 数**（少一个 = 断在那个 key 上）。这里不写一条永远不会成立的断言。 */
    assert.ok(Object.isFrozen(fresh), '导出面必须冻结（否则副本会被外部改成第二真源）');
    assert.equal(fresh.VERSION, (/const VERSION = '([0-9.]+)'/.exec(IDX) || [])[1], '快照值仍是出生版本（含义：不跨会话漂移）');
    assert.equal(MC.VERSION, (/const VERSION = '([0-9.]+)'/.exec(IDX) || [])[1], '本档共用的 MC 未被上一步污染（不跨用例漋移）');
    ok('四类真构造 + 行为抽检全绿；依赖注入真换掉 7 项');
});

/* ========== C 加载面与基线 ========== */
test('v3266 C. 加载面与基线：memory-core 恰 1 项且在 memory-config 之前 + 基线读数同源', () => {
    const mf = JSON.parse(read('manifest.json'));
    assert.equal(mf.extra_js.filter((f) => f === MOD_REL).length, 1, MOD_REL + ' 须在 extra_js 恰好 1 次');
    /* [v3.267.0 A1 第七刀] 末项已交接给 memory-config.js；本档改守 memory-core 仍唯一登记且在 memory-config 之前。 */
    assert.ok(mf.extra_js.includes(MOD_REL), MOD_REL + ' 须仍在 extra_js');
    assert.ok(mf.extra_js.indexOf(MOD_REL) < mf.extra_js.indexOf('memory-config.js'), 'memory-core.js 必须在新末项 memory-config.js 之前');
    assert.equal(mf.extra_js[0], 'ledger-entity.js', 'ledger-entity.js 仍须在首位（v3.207 不变量）');
    assert.ok(!mf.extra_js.includes('memory-organs.js') || mf.extra_js.indexOf('memory-organs.js') < mf.extra_js.indexOf(MOD_REL), '五刀模块必须在本刀之前加载（依赖顺序）');
    const b = JSON.parse(read('tests/audit/host_beast_baseline.json'));
    assert.equal(b.readings.total_lines, IDX.split(NL).length, '基线行数须等于真 index.js 行数（含末行无换行）');
    assert.equal(b.measured_at, 'v' + (/const VERSION = '([0-9.]+)'/.exec(IDX) || [])[1], '当版须已在基线留读数');
    assert.ok(b.rebuilds[b.measured_at], '当版须在 rebuilds 面留读数');
    assert.equal(b.rebuilds[b.measured_at].readings.total_lines, b.readings.total_lines, 'rebuilds 与 readings 同读数');
    assert.ok(b.readings.total_lines < 15000, '★ A1 验收线：本刀后宿主须 < 15000 行，实测 ' + b.readings.total_lines);
    assert.ok(b.readings.total_lines < 18401, '★ A1 之后宿主读数须始终低于 A1 首刀前基线（18401）');
    const dcb = JSON.parse(read('tests/audit/dead_code_budget.json'));
    /* [v3.273.0 交棒] 原文是 `dcb.note.includes('3.267.0')` —— 那是**硬锁当版字面量**，
     *   与仓内 V2/V3 纪律同族的反模式，且方向反了：它只证明「note 里留着某个旧版本号」，
     *   证明不了「当前 ceiling 没被静默改掉」。改成版本无关的不变量：
     *   **当前 ceiling 必须能被最后一条 history 记录解释**（数值与理由两处同步）。
     *   静默改 ceiling 而不同步 history ⇒ 红；走 --bump 的合法抬版三条读数自动同步 ⇒ 绿。 */
    const _hist = Array.isArray(dcb.history) ? dcb.history : [];
    assert.ok(_hist.length >= 1, '死代码上限必须有抬升留痕（否则是静默抬升）');
    const _last = _hist[_hist.length - 1];
    assert.equal(dcb.ceiling, _last.ceiling, '当前 ceiling 必须等于最后一条 history 的 ceiling（防静默改数）');
    assert.equal(dcb.note, _last.reason, '当前 note 必须是最后一条 history 理由的复述（防理由与数脱节）');
    ok('manifest 尾项接管；基线行数/成员数与真文件同源且已达 15000 验收线');
});

/* ========== D 真源码破坏 -> 同一条判据必须翻红 ========== */
test('v3266 D. 真源码破坏 -> 同一条判据必须翻红', () => {
    const b1 = breakSource(IDX, "_moduleLib(() => window.LonShaMemoryCore, 'memory-core.js')",
        "_moduleLib(() => window.LonShaMemoryCoreTYPO, 'memory-core.js')", 'A1-取库口');
    assert.ok(judgeSlice(b1, MOD).some((p) => p.includes('真读表达式')), '取库口读错全局名必须翻红');
    const b2 = breakSource(MOD, 'class CharacterState {', 'class CharacterStateX {', 'A1-模块类名');
    assert.ok(judgeSlice(IDX, b2).some((p) => p.includes('缺 CharacterState')), '模块缺类必须翻红');
    const b3 = breakSource(IDX, "this.clock = _newCore('GameClock');", 'this.clock = null;', 'A1-漏接构造点');
    assert.ok(judgeSlice(b3, MOD).some((p) => p.includes("_newCore('GameClock'")), '漏接构造点必须翻红');
    const b4 = breakSource(IDX, FB_ANCHOR + NL, '', 'A1-退路缺方法');
    assert.ok(judgeSlice(b4, MOD).some((p) => p.includes('退路缺方法 CharacterState.getGeoPrompt')), '退路少一个方法必须翻红');
    const b5 = breakSource(IDX, '                errLog, sanitizeJson,', '                /* 依赖面被摘 */', 'A1-依赖注入被摘');
    assert.ok(judgeSlice(b5, MOD).some((p) => p.includes('未提供')), '依赖注入被摘必须翻红');
    const b6 = breakSource(MOD, "return String(name || '').normalize('NFKC').replace(/" + BS + "s+/g, '').trim().toLowerCase();", 'return String(name || ' + Q + Q + ');', 'A1-副本漂移');
    assert.ok(judgeSlice(IDX, b6).some((p) => p.includes('不逐字同源')), '副本与宿主不同源必须翻红');
    const b7 = breakSource(MOD, '    getTaskInboxReport() {', '    getTaskInboxReportRENAMED() {', 'A1-成员面缩水');
    assert.ok(judgeSlice(IDX, b7).some((p) => p.includes('缺成员 getTaskInboxReport')), '成员面缩水必须翻红');
    const b8 = breakSource(MOD, 'let VERSION = ' + Q, 'const VERSION = ' + Q, 'A1-VERSION 形态');
    assert.ok(judgeSlice(IDX, b8).some((p) => p.includes('不是 let')), 'VERSION 改回 const 必须翻红（否则注入静默中断无人管）');
    const b9 = breakSource(IDX, '    function storyDayDiff(dateA, dateB) {', '    function storyDayDiffMOVED(dateA, dateB) {', 'A1-双份同名函数');
    assert.ok(judgeSlice(b9, MOD).some((p) => p.includes('已丢失 storyDayDiff')), '宿主丢失双份定义必须翻红');
    const b10 = breakSource(MOD, '                const nk = normalizeCharName(node.name);', '            const nk = storyDayDiff(node.name, ' + Q + Q + ');', 'A1-类体内引用双份函数');
    assert.ok(judgeSlice(IDX, b10).some((p) => p.includes('代码引用')), '类体内出现双份同名函数的代码引用必须翻红');
    ok('十条真源码破坏各自被同一条判据抓到');
});

/* ========== E 出生版本下限锚 + V4 当版锚点 ========== */
const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
test('v3266 E. 当版锚点（V4）与四源同源：本档出生于 3.266.0，当前 frontier 锚于 vnum(3.267.0)', () => {
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.equal(codeVer, JSON.parse(read('manifest.json')).version, 'manifest 须与入口同源');
    assert.equal(codeVer, JSON.parse(read('package.json')).version, 'package 须与入口同源');
    assert.equal(codeVer, MC.VERSION, '模块副本 VERSION 须与入口同源（否则 bindDeps 注入前就已漂移）');
    assert.ok(read('CHANGELOG.md').startsWith('## v' + codeVer), 'CHANGELOG 顶节须是当前版本（人读面同源）');
    assert.ok(read('TODO.md').includes('最近更新：v' + codeVer), 'TODO 最近更新须是当前版本');
    assert.ok(vnum(codeVer) >= vnum('3.267.0'), '本轮 frontier 出生版本锚仍须在场，当前 ' + codeVer);
    ok('四源同源；当版锚点已留下（供版本守卫 V4 计数）');
});

/* ========== F 判据面自防护 ========== */
test('v3266 F. 判据面自防护：实现住在本档 + 走唯一破坏真源 + 清单不得缩水 + 负控制锚点纯度', () => {
    assert.ok(/function judgeSlice\(/.test(SELF), '判据体必须住在本档');
    assert.ok(/function fallbackParity\(/.test(SELF), '退路对账必须住在本档');
    assert.ok(SELF.includes('breakSource') && SELF.includes('./_break_kit.mjs'), '破坏必须走唯一真源');
    assert.equal(CORE.length, 4, '本刀剥走的类面为四项，不得缩水');
    assert.equal(Object.keys(FIELDS).length, 4, '构造点对位表为四项');
    assert.equal(Object.keys(MEMBERS).length, 4, '成员面对账表为四项');
    const allMemberNames = Object.keys(MEMBERS).reduce((a, k) => a.concat(MEMBERS[k]), []);
    assert.equal(allMemberNames.length, 107, '按类分别列合计 107 项（不得缩水）');
    assert.equal(VERBATIM_FNS.length, 3, '逐字副本函数三项');
    assert.equal(VERBATIM_CONSTS.length, 3, '逐字副本常量三项');
    assert.equal(LIB_CHAIN.length, 4, '取库链副本四项');
    assert.equal(DEP_KEYS.length, 7, 'bindDeps 键面七项');
    assert.equal(DUAL_FNS.length, 2, '双份同名函数两项');
    assert.ok(SELF.length > 20000, '本档不得被掏空（当前 ' + SELF.length + ' 字节）');
    assert.ok(SELF.includes('read(' + Q + 'index.js' + Q + ')') && SELF.includes('read(MOD_REL)'), '真源必须从磁盘读');
    const judgeRegion = SELF.slice(SELF.indexOf('function judgeSlice('), SELF.indexOf('function fallbackParity('));
    const dBlock = SELF.slice(SELF.indexOf("test('v3266 D."), SELF.indexOf('/* ========== E'));
    /* 出现次数统一算：退路锚点在本档里是拼出来的（FB_ANCHOR），故它的「写了几处」
     *   按引用名计（否则下面的 all >= 1 会把真写了的锚点误判成没写）。 */
    const occ = (t, a) => t.split(a).length - 1;
    const inRegion = (a) => occ(judgeRegion, a) + occ(dBlock, a);
    for (const [label, anchor, src] of [
        ['取库口', "_moduleLib(() => window.LonShaMemoryCore, '" + MOD_REL + "')", IDX],
        ['模块类名', 'class CharacterState {', MOD],
        ['构造点', "this.clock = _newCore('GameClock');", IDX],
        ['退路方法', FB_ANCHOR, IDX],
        ['依赖注入', '            return MC.bindDeps({', IDX],
    ]) {
        assert.ok(src.includes(anchor), label + ' 锚点在真源码里必须存在（否则负控制是空的）');
        const all = occ(SELF, anchor);
        assert.ok(all >= 1, label + ' 锚点必须至少被写一处');
        assert.ok(all - inRegion(anchor) <= 1, label + ' 的锚点字面量在「判据体与 D 段之外」不得多于一处（实测 ' + (all - inRegion(anchor)) + ' 次）');
    }
    ok('判据实现 / 破坏真源 / 清单规模 / 锚点纯度四者自洽');
});
