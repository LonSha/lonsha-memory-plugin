// 审计基建（v3.184）：调研清单收尾四件套面扫描
// ------------------------------------------------------------
// 为什么存在：
//   v3.184 一次落了四个模块（relation-disclosure / node-rollup / fuzzy-patch / changeset）。
//   四个模块都不是「函数写错」型风险，而是三类宿主侧失效：
//     ① 模块在、宿主不调用 —— 单元测试全绿而运行时永不生效（本仓 v3.0~v3.11 主线缺陷）
//     ② 调用了但**在错误的位置** —— 例如关系收口落在注入侧之外，或改前值取在写入之后
//     ③ 调用了但读数为零/不可分辨 —— 「没写条件」与「条件全命中」同形，坏了没人知道
//   本扫描守的就是这三条缝。单元测试只验模块自身，验不了「宿主到底有没有真用、用对没有」。
//
// 判定：
//   R1 四模块存活：可 require、版本常量与导出函数齐全、行数不低于下限（防被截断成空壳）
//   R2 宿主真消费：manifest 登记 + 统一取库口 + 每模块的关键调用点逐个在场
//   R3 位置纪律：关系收口在关系块内、变更集前值取在写入之前
//   R4 行为纪律（跑真模块，不看文本看行为）：
//        关系披露 —— 病句放行 / 空上下文放行 / 忙义拒绝 / 全角分隔符
//        图谱汇总 —— 事件节点无 floor 也能成组（本仓储真实节点形状的陷阱）
//        宽容填充 —— 唯一性闸门 / $& 不被当替换模式 / 残留可见
//        变更集   —— before 冻结 / 净零不进展示 / 淘汰可见
//   R5 读数可分辨：四个诊断行都在，且都真进 selfCheck 的子系统列表
//   R6 配置面：三个新键已声明 + 有 UI 控件（v3.160 纪律）；变更集刻意两样都没有
//
// 退出码：0=卫生  1=存在真缺陷  2=结构漂移（探测器失效）
// 夹具通道：LONSHA_AUDIT_ROOT 指向合成仓库（负控制用）。
import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
// 本文件源码（R0 自证用：上报点数与读数行都从源码实测，避免「判据被删改而结论不变」）
const P = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
const FILES = {
    rd: 'relation-disclosure.js',
    nr: 'node-rollup.js',
    fp: 'fuzzy-patch.js',
    cs: 'changeset.js',
    idx: 'index.js',
    sui: 'settings-ui.js',
    mf: 'manifest.json',
};
for (const k of ['rd', 'nr', 'fp', 'cs', 'idx', 'sui', 'mf']) {
    if (!fs.existsSync(path.join(ROOT, FILES[k]))) {
        console.error('[final-four] 缺少 ' + FILES[k] + '（' + ROOT + '）');
        process.exit(2);
    }
}
const idxRaw = fs.readFileSync(path.join(ROOT, FILES.idx), 'utf8');
const sui = fs.readFileSync(path.join(ROOT, FILES.sui), 'utf8');
// 形态判据一律在剥注释后的文本上下结论（注释里写「已收口」不算收口）。
function stripComments(code) {
    const out = code.split('');
    let i = 0;
    while (i < code.length) {
        const c = code[i];
        if (c === '/' && code[i + 1] === '/') { while (i < code.length && code[i] !== '\n') { out[i] = ' '; i++; } continue; }
        if (c === '/' && code[i + 1] === '*') {
            out[i] = ' '; out[i + 1] = ' '; i += 2;
            while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) { if (code[i] !== '\n') out[i] = ' '; i++; }
            if (i < code.length) { out[i] = ' '; out[i + 1] = ' '; i += 2; }
            continue;
        }
        i++;
    }
    return out.join('');
}
const idx = stripComments(idxRaw);
if (idxRaw.length < 500000) {
    console.error('[final-four] index.js 退化（' + idxRaw.length + ' 字节），审计需同步结构变化');
    process.exit(2);
}
const defects = [];

// ── R1 四模块存活 ──
let RD, NR, FP, CS;
try { RD = require(path.join(ROOT, FILES.rd)); } catch (e) { console.error('[final-four] relation-disclosure 加载失败：' + e.message); process.exit(2); }
try { NR = require(path.join(ROOT, FILES.nr)); } catch (e) { console.error('[final-four] node-rollup 加载失败：' + e.message); process.exit(2); }
try { FP = require(path.join(ROOT, FILES.fp)); } catch (e) { console.error('[final-four] fuzzy-patch 加载失败：' + e.message); process.exit(2); }
try { CS = require(path.join(ROOT, FILES.cs)); } catch (e) { console.error('[final-four] changeset 加载失败：' + e.message); process.exit(2); }
const need = [
    ['relation-disclosure', RD, ['parseDisclosure', 'compileConditions', 'testDisclosure', 'partition', 'line'], 'DISCLOSURE_VERSION'],
    ['node-rollup', NR, ['rollupRange', 'canRollup', 'planRollup', 'line'], 'ROLLUP_VERSION'],
    ['fuzzy-patch', FP, ['normalizeWithPositions', 'findValidMatches', 'findUniqueNormalizedMatch', 'applyPatch', 'patchTokens', 'line'], 'PATCH_VERSION'],
    ['changeset', CS, ['ChangesetStore', 'makeRowKey', 'rowsEqual', 'normVal', 'line'], 'CHANGESET_VERSION'],
];
for (const [name, mod, fns, verKey] of need) {
    for (const fn of fns) {
        const t = typeof mod[fn];
        if (fn === 'ChangesetStore' ? t !== 'function' : t !== 'function') defects.push('R1 ' + name + ' 缺导出 ' + fn);
    }
    if (!Number.isFinite(Number(mod[verKey]))) defects.push('R1 ' + name + ' 缺版本常量 ' + verKey);
}
// 行数下限：防模块被截断成空壳仍然「导出齐全」。
const MIN_LINES = { rd: 150, nr: 150, fp: 200, cs: 180 };
for (const k of ['rd', 'nr', 'fp', 'cs']) {
    const n = fs.readFileSync(path.join(ROOT, FILES[k]), 'utf8').split('\n').length;
    if (n < MIN_LINES[k]) defects.push('R1 ' + FILES[k] + ' 只有 ' + n + ' 行（下限 ' + MIN_LINES[k] + '），疑似截断');
}

// ── R2 宿主真消费 ──
try {
    const mf = JSON.parse(fs.readFileSync(path.join(ROOT, FILES.mf), 'utf8'));
    const ex = Array.isArray(mf.extra_js) ? mf.extra_js : [];
    for (const k of ['rd', 'nr', 'fp', 'cs']) {
        if (!ex.includes(FILES[k])) defects.push('R2 manifest.extra_js 未登记 ' + FILES[k] + '（取库必返回 module-unavailable）');
    }
} catch (e) { defects.push('R2 manifest.json 读取失败：' + e.message); }
const libs = [
    ['relation-disclosure', /_moduleLib\(\(\) => window\.LonShaRelationDisclosure,\s*'relation-disclosure\.js'\)/],
    ['node-rollup', /_moduleLib\(\(\) => window\.LonShaNodeRollup,\s*'node-rollup\.js'\)/],
    ['fuzzy-patch', /_moduleLib\(\(\) => window\.LonShaFuzzyPatch,\s*'fuzzy-patch\.js'\)/],
    ['changeset', /_moduleLib\(\(\) => window\.LonShaChangeset,\s*'changeset\.js'\)/],
];
for (const [name, re] of libs) if (!re.test(idx)) defects.push('R2 宿主未按契约取库：' + name);
const calls = [
    ['关系披露 partition', /_RD\.partition\(/],
    ['关系过滤后循环', /_relKept\.forEach\(/],
    ['图谱汇总排程', /autoRollup\(|planRollup\(/],
    ['图谱维护', /maintainGraph\(/],
    ['占位符宽容填充', /\.patchTokens\(/],
    ['配置迁移宽容替换', /\.applyPatch\(/],
    ['变更集记录', /_changeset\(\)\?\.record\(/],
    ['变更集回滚联动', /_changeset\(\)\?\.removeByFloor\?\.\(floor\)/],
];
for (const [name, re] of calls) if (!re.test(idx)) defects.push('R2 宿主未调用：' + name);

// ── R3 位置纪律 ──
// 关系收口必须落在关系块**内部**（落在外面等于对别的块做过滤，关系原样进注入）
{
    const relIdx = idx.indexOf("blocks.push('[角色关系]')");
    const partIdx = idx.indexOf('_RD.partition(relations');
    if (relIdx < 0) defects.push('R3 找不到关系块');
    else if (partIdx < 0 || partIdx > relIdx) defects.push('R3 关系收口不在关系块之前（过滤了但注入的仍是原样）');
}
// 变更集前值必须取在写入之前（取在之后只能拿到结果，前后值退化成「结果」一个数）
{
    const i = idx.indexOf('const _csPrev =');
    if (i < 0) defects.push('R3 找不到改前取值点');
    else {
        const seg = idx.slice(i, i + 1600);
        const w = seg.indexOf('rec.fields[field] =');
        if (w < 0 || w < seg.indexOf('const _csPrev')) defects.push('R3 前值取在写入之后（前后值退化）');
    }
}
// 维护管线顺序：rollup 先、vacuum 后（先 vacuum 会误判刚被认领的孤儿）。
//   **必须锚在方法定义**：`maintainGraph(` 的第一处命中是维护管线里的调用点，
//   从那里取窗口时破坏方法体根本不在窗口内 ⇒ 破坏不翻红（本轮踩到的假绿）。
{
    const mg = idx.indexOf('maintainGraph(options = {})');
    if (mg < 0) defects.push('R3 找不到 maintainGraph 方法定义');
    else {
        const seg = idx.slice(mg, mg + 2500);
        const a = seg.indexOf('this.autoRollup(');
        const b = seg.indexOf('this.vacuum(');
        if (a < 0) defects.push('R3 maintainGraph 内未调用 autoRollup');
        if (b < 0) defects.push('R3 maintainGraph 内未调用 vacuum（零调用点复发）');
        if (a >= 0 && b >= 0 && a > b) defects.push('R3 maintainGraph 顺序错（须 rollup 先于 vacuum）');
    }
}

// ── R4 行为纪律（跑真模块） ──
// 整段包 try/catch：**任一探针抛异常都不得让扫描崩溃**。
//   本轮负控制踩到：把 RD.partition 破坏掉之后，这里直接抛 TypeError、扫描以栈退出，
//   归因串（R1 缺导出 partition）被栈淹没，负控制反而判「归因不对」。
//   审计的输出必须**始终是缺陷清单**，否则它自己的失效就不可归因。
try {
    // R4-a 关系披露：病句放行 / 空上下文放行 / 忙义拒绝 / 全角分隔符
    const bad = RD.testDisclosure('[unclosed', 'x');
    if (bad.state !== 'invalid') defects.push('R4a 病句必须放行并标记 invalid，实为 ' + bad.state);
    const empty = RD.testDisclosure('告白', '');
    if (empty.state === 'miss') defects.push('R4a 空上下文不得判未命中（读失败 ≠ 读了 0）');
    const amb = RD.partition([{ data: { disclosure: '' } }, { data: { disclosure: '' } }], 'x');
    if (amb.kept.length !== 2) defects.push('R4a 无条件的边必须全部进注入');
    const full = RD.parseDisclosure('!甲；乙，丙');
    if (full.negative.length !== 1 || full.positive.length !== 2) {
        defects.push('R4a 全角分隔符未生效：' + JSON.stringify(full));
    }
    // R4-b 图谱汇总：**事件节点没有 node.floor**（本仓真实形状，floor 挂在边上）也必须能成组。
    //   形状按 addNode 的真实产出：节点 = {id, type, name, data}，楼层在 data.floor（边上的 floor）。
    //   若判据写成「必须有 node.floor」⇒ 事件节点全被跳过 ⇒ 功能接上了但永远空转。
    const nodes = new Map();
    const ids = [];
    for (let i = 0; i < 5; i++) {
        const id = 'v' + i;
        nodes.set(id, { id, type: 'event', name: 'e' + i, data: { floor: 10 + i, timestamp: 1000 + i } });
        ids.push(id);
    }
    const plan = NR.planRollup(nodes, ids, '汇总测试', { minChildren: 4, label: '事件' });
    if (!plan || !plan.ok || !plan.parent) {
        defects.push('R4b 事件节点（floor 挂在 data 上）必须仍能成组——否则功能接上了但永远空转：' + JSON.stringify(plan && plan.reason));
    } else if (!Number.isFinite(Number(plan.parent.data.rollupFloorStart))) {
        defects.push('R4b 边界必须从 data.floor 回退读到（否则「有无边界」读数恒为 0）');
    }
    // 真判不了的（既无 floor 也无时间戳）不得抛，且必须进 skipped 而非静默
    {
        const m2 = new Map([['a', { id: 'a', type: 'event', name: 'x', data: {} }], ['b', { id: 'b', type: 'event', name: 'y', data: {} }]]);
        let threw = false;
        try { NR.planRollup(m2, ['a', 'b'], 's', { minChildren: 2 }); } catch (_e) { threw = true; }
        if (threw) defects.push('R4b 无楼层信息的节点不得让判据抛（判不了就不压，不是崩）');
    }
    // R4-c 宽容填充：唯一性闸门 / $& / 残留
    if (FP.applyPatch('{{T}}甲{{T}}', '{{T}}', 'v').ok !== false) defects.push('R4c 多处命中必须拒绝（歧义不猜）');
    if (FP.applyPatch('前 {{T}} 后', '{{T}}', '$&').text !== '前 $& 后') defects.push('R4c $& 必须字面落值');
    if (!FP.patchTokens('{{A}} {{Z}}', { A: 'v' }).leftover.includes('{{Z}}')) defects.push('R4c 残留占位符必须可见');
    // R4-d 变更集：before 冻结 / 净零不进展示 / 淘汰可见
    const st = new CS.ChangesetStore({ maxRows: 20 });
    st.record({ table: 'status', pk: ['甲', '好感'], before: 3, after: 8 });
    st.record({ table: 'status', pk: ['甲', '好感'], before: 8, after: 12 });
    const v = st.getSnapshotView();
    if (v.length !== 1 || v[0].before !== 3 || v[0].after !== 12) {
        defects.push('R4d 覆盖语义错（before 必须冻结在最初）：' + JSON.stringify(v));
    }
    const st2 = new CS.ChangesetStore();
    st2.record({ table: 'status', pk: ['乙', 'x'], before: 3, after: 3 });
    if (st2.getSnapshotView().length !== 0) defects.push('R4d 净零不得进展示');
    const st3 = new CS.ChangesetStore({ maxRows: 20 });
    for (let i = 0; i < 25; i++) st3.record({ table: 't', pk: ['k' + i], before: 0, after: i + 1 });
    if (!st3.summarize(false).includes('已淘汰 5')) defects.push('R4d 淘汰必须可见（读者不该把窗口当全集）');
} catch (e) {
    defects.push('R4 行为探针抛异常（判据不得抛）：' + String(e && e.message || e));
}

// ── R5 读数可分辨 ──
{
    const sc = idx.indexOf('async selfCheck(');
    if (sc < 0) defects.push('R5 找不到 selfCheck');
    else {
        const scBody = idx.slice(sc);
        const rowsIdx = scBody.indexOf('const rows = [');
        let lit = '';
        if (rowsIdx < 0) defects.push('R5 selfCheck 未构建子系统列表 rows');
        else {
            const lb = scBody.indexOf('[', rowsIdx);
            let bd = 0, rb = -1;
            for (let i = lb; i < scBody.length; i++) {
                if (scBody[i] === '[') bd++;
                else if (scBody[i] === ']') { bd--; if (bd === 0) { rb = i; break; } }
            }
            if (rb < 0) defects.push('R5 selfCheck 的 rows 列表字面量不闭合');
            else lit = scBody.slice(lb, rb + 1);
        }
        const rowsKeys = [];
        for (const m of lit.matchAll(/\['([^']+)',/g)) rowsKeys.push(m[1]);
        for (const m of scBody.matchAll(/rows\.push\(\[\s*'([^']+)'/g)) rowsKeys.push(m[1]);
        for (const [key, entryFn] of [
            ['关系披露', '_relationDisclosureLine'],
            ['图谱汇总', '_graphRollupLine'],
            ['提示词填充', '_promptFillLine'],
            ['行级变更', '_changesetLine'],
        ]) {
            if (!rowsKeys.includes(key)) {
                defects.push('R5 诊断行「' + key + '」未进入 selfCheck 子系统列表（用户读不到 = 坏了没人知道）');
            }
            if (!scBody.includes('this.' + entryFn + '(')) {
                defects.push('R5 ' + entryFn + ' 在 selfCheck 内无调用点（只有定义、没人念）');
            }
        }
        // 读数必须四态可分辨：无条件 20 与条件全命中 20 不得同形
        const a = RD.line({ counts: { total: 20, always: 20, match: 0, miss: 0 } });
        const b = RD.line({ counts: { total: 20, always: 0, match: 20, miss: 0 } });
        if (a === b) defects.push('R5 关系披露读数把「谁都没写条件」与「条件全命中」混成一句');
        const pa = FP.line({ total: 6, applied: 6, modes: { A: 'exact' } });
        const pb = FP.line({ total: 6, applied: 6, modes: { A: 'normalized' } });
        if (pa === pb) defects.push('R5 提示词填充读数把「用了回退」与「没用」混成一句');
    }
}

// ── R6 配置面 ──
{
    for (const k of ['relationDisclosureEnabled', 'fuzzyPatchEnabled', 'graphRollupEnabled']) {
        if (!new RegExp('\\b' + k + ':').test(idx)) defects.push('R6 默认配置块未声明 ' + k + '（引擎有功能、用户无法开关）');
        if (!sui.includes("ck('" + k + "'")) defects.push('R6 设置面板缺控件 ' + k + '（不可达）');
    }
    // 变更集刻意不加键、不导出的理由必须留档（不加声明的纪律）
    if (!idxRaw.includes('刻意不加配置键')) defects.push('R6 变更集不加配置键的理由未留档');
    if (!idxRaw.includes('刻意不导出')) defects.push('R6 变更集不导出的理由未留档');
}

// ── R0 审计自身可分辨（补） ──
//   修前形态：本脚本在**通过路径上零输出**（其他审计脚本都会打一行卫生读数）。
//   要紧的不是排版，是 I6：「真跑过且全过」与「因判据被删/早退而什么都没查」退出码同为 0，
//   读者拿不到任何可分辨的读数——审计的通过结论本身必须打印，否则它的失效不可归因。
//   两条自证：① 上报点数从源码实测（判据被截断成空壳必须在读数里现形）；
//             ② 读数行自身必须存在（删掉它 ⇒ 通过时静默 ⇒ 与「没跑」同形）。
// 两条 needle 都**拆开拼接**：否则判据文本自己就含整串，
//   P.includes(needle) 恒真——判据自我满足的空转（本轮踩到：把读数行改名后仍报绿）。
const _READOUT = 'console.log(\'[final-four] ' + '卫生：';
const _SUBMIT = 'defects' + '.push(';
const _sub = P.split(/\r?\n/).filter(l => l.includes(_SUBMIT)).length;
if (_sub < 8) defects.push('R0 自证：上报点只有 ' + _sub + ' 个（判据疑被截断/删改）');
if (!P.includes(_READOUT)) defects.push('R0 自证：通过路径读数行缺失（跑过与没跑同形）');

if (defects.length) {
    console.error('[final-four] ' + defects.length + ' 个缺陷:');
    for (const d of defects) console.error('  - ' + d);
    process.exit(1);
}
// 通过结论必须打印（I6）：模块行数/取库口数/上报点数一律实测，不写死。
const _lines = (f) => fs.readFileSync(path.join(ROOT, FILES[f]), 'utf8').trim().split('\n').length;
// 读数行里的 R 编号一律紧跟全角 '｜'，**不得出现「R编号 + 半角空格」**：
//   负控制的卫生态守卫正是按该模式扫「卫生态不得泄漏归因串」，健康行不能把自己算成泄漏。
console.log('[final-four] 卫生：R1｜四模块存活（rd ' + _lines('rd') + ' / nr ' + _lines('nr')
    + ' / fp ' + _lines('fp') + ' / cs ' + _lines('cs') + ' 行）'
    + '｜R2｜宿主真消费（取库口 ' + libs.length + ' + 调用点 ' + calls.length + '）'
    + '｜R3｜位置纪律 3 项｜R4｜行为纪律 4 组｜R5｜诊断行 4 条｜R6｜配置面 3 键'
    + '｜上报点 ' + _sub + ' 个，本次零触发');
