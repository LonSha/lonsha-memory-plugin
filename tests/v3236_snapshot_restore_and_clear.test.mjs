// tests/v3236_snapshot_restore_and_clear.test.mjs — R4-B：快照恢复收编单真源 / 会话身份快照节流 / 清空面收编 [v3.236.0]
//
//   本版把三处**同一种形状**的缺陷一起收掉：**两份手抄清单必然漂移，而漂移是无声的**。
//     · 缺口 1：用户点「快照恢复」走的是面板里手抄的 13 个 `engine.X.import(data.X)`，
//       而 `restoreFromPayload` 登记着 42 面 ⇒ 恢复成「半套状态」再全量落盘；
//     · 缺口 2：定期快照的节流锚点是**裸楼层数**，不认会话身份 ⇒ 切到 B 会话后
//       `curFloor - A的锚点` 恒为负，判据不触发 ⇒ B 的快照**一份都不落盘且不报错**；
//     · 缺口 3：清空按钮手抄 16 个模块，恢复面有 42 面 ⇒ 16 个模块面**从未被清空触达**，
//       末尾却走 `collectExport()` 全量落盘 ⇒ 用户看到「已清空」，数据原样还在。
//
//   三条的共同修法不是「再抄一遍」，而是让清单**从登记点自身产出**：
//     · 恢复键由 `_imp` 登记（`res.registered`），清空键由 `clearRuntimeMemory` 的 `A(...)` 登记；
//     · 两侧键集合的包含关系变成**可机检的读数**（D 段），而不是靠人读两份清单。
//
//   覆盖：
//     A 缺口 1（快照恢复收编：单真源 / 两阶段 / 预检闸门在引擎侧 / 空快照不落盘）
//     B 缺口 2（会话身份锚点四态 / 旧字段退役 / CHAT_CHANGED 复位 / 诊断三态）
//     C 缺口 3（清空入口登记 / 载荷形态逐条真守卫 / 面板不再手抄 / 覆盖核对三态）
//     D 结构闭环（清空面 ⊇ 恢复面；键名不发明新面）
//     E 行为面（真跑探针：宿主成员与规模仍在同一量级；三源同源）
//     F 负控制（三条：真源码破坏 → 整仓镜像 → **同款判据**必须转红）
//     G 版本锚与结构面
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (p) => fs.readFileSync(p, 'utf8');
const idx = read(path.join(ROOT, 'index.js'));
const ui = read(path.join(ROOT, 'settings-ui.js'));

/** 取一段源码（起点字面量 → 终点字面量）。**不**用正则：本仓的锚点里全是括号与引号。 */
function blockOf(src, startLit, endLit) {
    const i = src.indexOf(startLit);
    assert.ok(i > 0, '起点必须在场：' + startLit);
    const j = src.indexOf(endLit, i + startLit.length);
    assert.ok(j > i, '终点必须在其后：' + endLit);
    return src.slice(i, j);
}
/** 恢复面的**登记键**（由 `_imp` 的第一参给出，与调用序一致）。 */
function impKeysOf(src) {
    const body = blockOf(src, 'restoreFromPayload(data) {', 'getCurrentChatId() {');
    return [...body.matchAll(/_imp\(\s*'([^']+)'/g)].map((m) => m[1]);
}
/** 清空面的**登记键**（由 `clearRuntimeMemory` 里 `A(face, id, …)` 的第二参给出）。 */
function clearKeysOf(src) {
    const body = blockOf(src, 'clearRuntimeMemory() {', 'snapshotClearCoverage() {');
    return [...body.matchAll(/A\('(?:module|direct)',\s*'([^']+)'/g)].map((m) => m[1]);
}

/* ══════════ 共用判据体：负控制与 A/B/C 段跑的是**同一份**代码 ══════════ */

/** A 段：快照恢复必须走单真源（面板不得再手抄 import 清单）。 */
function assertSnapshotRestoreSingleSource(uiText, srcText) {
    /* 取样区间 = **本处理器自身**（`showSnapshotRestore` 定义 → 下一个面板定义）。
     *   两次踩坑的教训（都留在这里，因为下一个人还会想用「更宽」的区间）：
     *     · 终点取 `document.body.appendChild(menu);` ⇒ 那个字面量在本文件里**更早**出现一次
     *       （菜单面板）⇒ 区间被截断成「按钮绑定 → 菜单面板」，判据读到的是**别的面板**；
     *     · 起点取**按钮绑定**（`overlay.querySelector('#ls-snap-restore')`）⇒ 区间把设置面板
     *       骨架整段包进来，而它内部的 `engine.storage.save(` 出现得**比本处理器的拦截语句更早**
     *       ⇒ 「拦截必须先于落盘」在真源码上误判失败（区间与判据的语义对不上）。
     *   口径：判据断言的是**这个恢复流程**的性质，区间就必须恰好是这段流程。 */
    const seg = blockOf(uiText, 'plugin.showSnapshotRestore = async function()', 'plugin._memPersist = async function()');
    /* 「手抄」只认**代码**：留痕注释里引用旧形状（`engine.X.import(data.X)`）不是并行真源。
     *   若把注释也算进去，本判据就变成「不许解释历史」—— 那是自伤。 */
    const segCode = seg.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const handWritten = [...segCode.matchAll(/engine\.[A-Za-z]+\.import\(data\./g)].map((m) => m[0]);
    assert.deepEqual(handWritten, [],
        '面板的快照恢复不得再手抄 `engine.X.import(data.X)`（漏一面就是半套状态）：' + handWritten.join(' / '));
    assert.ok(seg.includes('restoreSnapshotFlow(chatId, floor)'),
        '必须走引擎侧的**流程**入口（读快照 → 两阶段恢复 → 落盘全在引擎，面板不持有任何一段）');
    /* 流程入口必须真住在引擎侧、且闸门读点所在的 `restoreFromSnapshot` 由它调用 ——
     *   这是 `snapshotPrecheckEnabled` 的「两跳可达性」：键 → 闸门方法 → **有调用者**的流程方法。
     *   面板此时不再是唯一持有流程整段的地方，声明键的可达性因此不再依赖「谁恰好调了它」。 */
    assert.match(srcText, /async restoreSnapshotFlow\(chatId, floor\) \{/, '流程入口必须定义在 index.js');
    const flow = blockOf(srcText, 'async restoreSnapshotFlow(chatId, floor) {', 'snapshotRestoreMenu(snaps) {');
    assert.match(flow, /this\.restoreFromSnapshot\(cid, data\)/, '流程必须调两阶段入口（声明键的消费链由此可达）');
    assert.match(flow, /await this\.storage\.save\(cid, this\.collectExport\(\)\)/, '落盘必须在流程内（顺序不依赖调用方自觉）');
    /* 面板**只播报、不判断**：它不得自己读预检闸门（读点必须在引擎侧，否则配置是死键）。 */
    /* 判据读**代码**、不读注释：本版在处理器里写了「为什么不能读闸门」的留痕，
     *   注释里出现键名是解释历史，不是第二真源（与上面「手抄 import 只认代码」同款）。 */
    assert.ok(!/snapshotPrecheckEnabled/.test(segCode), '面板不得自己读预检闸门（那是死配置的形状）');
    /* 「无可恢复内容」必须在落盘**之前**拦住 —— 性质不变，但**保证者**变了：
     *   流程下沉后面板已经不落盘了（它只播报 `applied`/`reason`），
     *   顺序的唯一保证点是流程体内那一次 `storage.save`。
     *   判据跟着性质走：顺序判定落在**流程体**上，并在面板侧守「按 applied 拦住」。
     *   （留痕：旧版此处用 `seg` 取 `if (!_rs.applied)` 与 `engine.storage.save(` 的位置比大小，
     *   那是在断言「面板自己保证顺序」——流程一下沉，它测的就是别的代码了。） */
    const flowEarly = flow.indexOf('if (!rs.applied) {');
    const flowSave = flow.indexOf('await this.storage.save(');
    assert.ok(flowEarly > 0, '空快照必须被拦住（流程内早退）');
    assert.ok(flowSave > flowEarly, '拦截必须发生在落盘之前（否则「恢复了个空」会被写进存档）');
    assert.match(flow, /rs\.reason === 'empty-snapshot'/, '拦截理由必须来自两阶段入口的判断（流程不自己猜）');
    assert.match(segCode, /if \(!_fr\.applied\)/, '面板必须按流程返回的 applied 拦住（只播报、不判断）');

    /* 引擎侧：两阶段 + 闸门 + dryRun 契约逐条在场。 */
    const eng = blockOf(srcText, 'restoreFromSnapshot(chatId, payload) {', 'clearRuntimeMemory()');
    assert.match(eng, /snapshotPrecheckEnabled !== false/, '★ 闸门读点必须在引擎侧（v3160 [1b]：声明键须有引擎内消费点）');
    assert.match(eng, /source: 'snapshot-precheck', dryRun: true/, '预检必须显式走 dryRun（只读，不写运行时）');
    assert.match(eng, /source: 'snapshot-restore', snapshot: true/, '真恢复必须请求快照（v3.146 部分失败自动回滚）');
    assert.match(eng, /if \(pre\.count === 0\) \{ res\.reason = 'empty-snapshot'; return res; \}/, '空快照必须在真恢复之前返回');
    assert.match(eng, /res\.applied = true;/, 'applied 是面板唯一的判据面');
}

/** B 段：会话身份锚点的四态契约（`fresh` 语义本身是修法）。 */
function assertSnapshotAnchorContract(src) {
    const b = blockOf(src, '_snapshotAnchorOf(chatId) {', 'onMessageReceived');
    assert.match(b, /chatId === undefined \|\| chatId === null/, '空身份必须与「有身份」分开判定');
    assert.match(b, /if \(!id\) return \{ fresh: false/, '★ 拿不到会话就不该记「谁存的」（不建身份、不重置）');
    assert.match(b, /_snapshotAnchorChatId !== id/, '身份比对必须按会话 id');
    assert.match(b, /this\._snapshotAnchorFloor = 0;/, '★ 身份不符必须把锚点**重置为 0**（保留旧楼层就是保留那个 bug）');
    assert.match(b, /fresh: true, floor: 0/, '重置后必须给 fresh（新会话先落一份，与从未快照过的会话同形）');
    assert.match(b, /fresh: false, floor: Number\(this\._snapshotAnchorFloor\) \|\| 0/, '身份相同走正常节流');
    /* 调用点必须用同一个读数，不得各自再取一次当前会话 id。 */
    const call = blockOf(src, 'const anchor = this._snapshotAnchorOf(chatId);', 'this._snapshotByChat.push');
    assert.match(call, /anchor\.fresh \|\| curFloor - anchor\.floor >= snapEvery/,
        '闸门必须是「首份 或 距锚点满周期」，不是裸楼层差');
}

/** C 段：清空面的载荷形态必须**逐条**是守卫认得的形状（否则是假清空）。 */
function assertClearPayloadShapes(src) {
    const body = blockOf(src, 'clearRuntimeMemory() {', 'snapshotClearCoverage() {');
    assert.ok(body.length > 800, '清空入口体必须在场，实得 ' + body.length + ' 字符');
    const need = [
        ['人物状态', "e.status.import({ characters: {} })"],
        ['正史增量', "e.deltaBook.import({ deltas: [] })"],
        ['群像记忆', "e.pairMem.import({ pairs: [] })"],
        ['卡牌', "e.cards.import({ cards: [] })"],
        ['矛盾账本', "e.conflicts.import({ conflicts: [] })"],
        ['摘要平行面（锁定事实）', 'e.summary.lockedFacts = []'],
        ['日记平行面（注入游标）', 'e.diary._lastDiaryFloor = -1'],
        ['场景真清空入口', "typeof e.scene.clear === 'function'"],
        ['前情真清空入口', "typeof e.prequel.clearPrequel === 'function'"],
        ['图谱（Map 清空）', 'e.graph.nodes.clear()'],
        ['账本自述面（血缘修复留痕）', 'e.ledger.import({})'],
        ['记忆取代（保 config 语义）', "e.supersede.import({ supersededMap: {} })"],
    ];
    for (const [label, lit] of need) {
        assert.ok(body.includes(lit), label + ' 必须用守卫认得的载荷形状（假清空的面在 UI 上与真清空同形）：' + lit);
    }
    /* 反坐实：这些形状**看起来**在清空，实际不赋值（守卫的 `if` 不成立）。 */
    const fake = ['e.cards.import([])', 'e.conflicts.import([])', 'e.deltaBook.import([])', 'e.pairMem.import([])'];
    for (const bad of fake) {
        assert.ok(!body.includes(bad), '假清空形态不得存在（守卫不认这个负载，等于没清）：' + bad);
    }
}

/** C 段：清空入口必须逐面登记（读数有名字），且面板不再手抄。 */
function assertClearIsLedgered(src, uiText) {
    const body = blockOf(src, 'clearRuntimeMemory() {', 'snapshotClearCoverage() {');
    assert.match(body, /const A = \(face, id, label, need, fn\) => \{/, '登记函数必须带 face/id/label/need（失败要能点名）');
    assert.match(body, /res\.failed\.push\(\{ face: face, id: id, label: label/, '失败必须具名（否则「有面没清干净」与「全清干净」在 UI 上同形）');
    assert.match(body, /this\._clearRuntimeReport = res;/, '结局必须留在宿主上供覆盖核对消费');
    const panel = blockOf(uiText, "overlay.querySelector('#ls-clear')", '// 保存');
    assert.ok(panel.includes('clearRuntimeMemory()'), '面板必须调引擎的清空入口');
    const handWritten = [...panel.matchAll(/this\.engine\.[A-Za-z]+\.[A-Za-z]+ = (?:\[\]|\{\}|new Map\(\))/g)].map((m) => m[0]);
    assert.deepEqual(handWritten, [], '面板不得再手抄清空赋值（两份清单必然漂移）：' + handWritten.join(' / '));
    assert.match(panel, /_cr\.failed\.length/, '失败面数必须播报');
}

/* ══════════ A 缺口 1：快照恢复收编单真源 ══════════ */
test('v3236 A1. ★★★ 面板快照恢复走单真源：不再手抄 import 清单，两阶段（预检 + 真恢复）齐备', () => {
    assertSnapshotRestoreSingleSource(ui, idx);
});

test('v3236 A2. ★★ 预检闸门必须**在引擎侧**有消费点（声明键放在 UI 侧会变成死配置）', () => {
    /* v3160 [1b]：每个默认配置键必须在默认配置块之外有消费点。本版把预检做成
     *   「UI 只调一次引擎方法」的形状正是为了这条 —— 判据在此复述一遍，防后人把读点搬回 UI。 */
    assert.match(idx, /snapshotPrecheckEnabled:\s*true/, '默认开启（破坏性操作前先只读预检）');
    assert.match(idx, /(?:this\.config\.config|cfg)\.snapshotPrecheckEnabled !== false/, '★ 读点必须落在 index.js（默认开可关的 `!== false` 形状）');
    assert.match(ui, /ck\('snapshotPrecheckEnabled', '快照恢复前预检'/, '面板必须有对应开关');
});

test('v3236 A3. ★★ 回滚文案在**本面板段**只准一处，且态来自单真源返回（v3.146 的可见性契约仍成立）', () => {
    /* 口径修正（本轮取证）：`已自动回滚原状态` 在全文件里合法地出现**两处** ——
     *   ① 「状态总览」的 `_lastRestore` 诊断行（读 `r.rolledBack`，是**跨面板共用**的读数）；
     *   ② **本**快照恢复面板的播报（读 `_rn.rolledBack`）。
     *   原判据把「全文件只准一处」当目标，等于要求别的面板不许播报同一件事 —— 口径过宽。
     *   真正要守的两件事：① 本面板段内不得重复注入（同一次恢复不要把同一句话说两遍）；
     *   ② 回滚态必须来自单真源返回（不许面板自己推）。 */
    /* 区间同上：必须含**本处理器的播报行**，否则这条断言在空区间上通过（假绿）。 */
    const seg = blockOf(ui, 'plugin.showSnapshotRestore = async function()', 'plugin._memPersist = async function()');
    assert.ok(seg.includes('_rn.rolledBack'), '区间必须覆盖本处理器的播报行（否则下面的计数是空跑）');
    assert.equal((seg.match(/已自动回滚原状态/g) || []).length, 1, '本面板段内回滚文案只准一处');
    assert.match(ui, /_rn\.rolledBack/, '回滚态必须来自单真源返回的结果');
});

/* ══════════ B 缺口 2：会话身份快照节流 ══════════ */
test('v3236 B1. ★★★ 盲点四态：身份不符 ⇒ 重置锚点并给 fresh（否则 B 会话永远不落快照）', () => {
    assertSnapshotAnchorContract(idx);
});

test('v3236 B2. ★★★ 旧字段退役：`_lastSnapshotFloor` 全仓零出现（同名必须同义）', () => {
    /* 本版刻意**不沿用**旧名：旧名的语义是「裸楼层数」，新语义是「某会话的锚点楼层」。
     *   同名不同义正是本仓反复出问题的地方（第二真源）。 */
    /* 只禁**活引用**（赋值 / 属性读取）；注释里提旧名是留痕，不算并行真源 ——
     *   若连注释都不许提，这套判据就变成「不许解释历史」了。 */
    const live = [];
    for (const rel of ['index.js', 'settings-ui.js']) {
        const t = read(path.join(ROOT, rel));
        if (/[.\s]_lastSnapshotFloor\s*=/.test(t) || /\._lastSnapshotFloor\b/.test(t)) live.push(rel);
    }
    assert.deepEqual(live, [], '旧字段必须退役，不得留成活引用（并行真源）：' + live.join(' / '));
    assert.match(idx, /this\._snapshotAnchorChatId = null;/, '新锚点（身份）必须在构造期初始化');
    assert.match(idx, /this\._snapshotAnchorFloor = 0;/, '新锚点（楼层）必须在构造期初始化');
});

test('v3236 B3. ★★ 切会话必须复位锚点（复位的是节流面，不是快照库）', () => {
    /* 起点锚点取**真源码形态**：本仓的 CHAT_CHANGED 处理是 `if (types.CHAT_CHANGED) {`
     *   （v3.236.0 实测；写 `case 'CHAT_CHANGED'` 是凭空发明的形态，判据自己先抛「起点必须在场」）。
     *   终点取该区块**末尾**的清空语句（用区块内的具名日志串，稳且唯一）。 */
    const seg = blockOf(idx, 'if (types.CHAT_CHANGED) {', 'events.CHAT_CHANGED自愈清理');
    assert.match(seg, /_snapshotAnchorChatId = null/, '切会话必须卸下身份');
    assert.match(seg, /_snapshotAnchorFloor = 0/, '切会话必须归零锚点');
    /* 数据面不许一起动：快照按 chatId 分 id 存，旧会话回去还能恢复。 */
    assert.ok(!/snapshots\.(clear|delete|drop)/.test(seg), '节流复位不得顺手删快照（那是用户的回滚退路）');
});

test('v3236 B4. ★★ 诊断面三态：未启用 / 本会话尚无锚点 / 锚点读数，且跨会话份数单列', () => {
    assert.match(idx, /\['定期快照', \(\(\) => \{/, '诊断行必须在场');
    assert.match(idx, /—（未启用）/, '未启用态');
    assert.match(idx, /本会话尚无锚点/, '「没查过」态（不许显示成 0 楼）');
    assert.match(idx, /锚点 ' \+ \(Number\(this\._snapshotAnchorFloor\) \|\| 0\)/, '锚点读数态');
    assert.match(idx, /跨会话 ' \+ \(_own - _mine\)/, '跨会话份数必须单列（污染一眼可见）');
});

/* ══════════ C 缺口 3：清空面收编 ══════════ */
test('v3236 C1. ★★★ 清空载荷形态逐条真守卫（守卫不认的负载 = 假清空）', () => {
    assertClearPayloadShapes(idx);
});

test('v3236 C2. ★★★ 清空入口逐面登记，面板不再手抄赋值', () => {
    assertClearIsLedgered(idx, ui);
});

test('v3236 C3. ★★★ 覆盖核对三态：`everRestored` 把「没查过」与「查过没问题」分开', () => {
    const cov = blockOf(idx, 'snapshotClearCoverage() {', '_snapshotAnchorOf');
    assert.match(cov, /rest\.registered/, '恢复面键必须来自登记点自身（不许再抄一份）');
    assert.match(cov, /rep\.cleared\.concat\(rep\.skipped\)/, '清空面须含 skipped（本机未加载不算漏）');
    assert.match(cov, /missingInClear/, '漏面必须具名');
    assert.match(cov, /ok: missingInClear\.length === 0/, 'ok 必须挂在漏面上');
    /* ★ 三态的**第三态**（本轮补实现）：`everRestored` 把「没查过」与「查过没问题」分开。
     *   修前实现只回两个集合 ⇒ `_lastRestore` 为 null 时两个集合都空、`ok` 也是 true，
     *   与「查过且对得上」**同形**（本仓三态纪律：v3.166 的 sources/attempts 分家同款）。 */
    assert.match(cov, /const everRestored = !!/, '★ 必须显式产出 everRestored（不编默认值）');
    assert.match(cov, /everRestored: everRestored/, 'everRestored 必须随读数外供');
    assert.match(ui, /_cov\.everRestored/, 'everRestored 必须在面板上有消费点（否则是死字段）');
    /* 恢复键由 `_imp` 登记点自身产出。 */
    assert.match(idx, /const _impKeys = \[\];/, '登记序号必须落在方法内');
    assert.match(idx, /_impKeys\.push\(key\);/, '★ 每个 _imp 调用都必须登记自己的键（含 skipped/missing 两条早退路径）');
    assert.match(idx, /res\.registered = _impKeys;/, '登记结果必须随恢复结果外供');
});

/* ══════════ D 结构闭环 ══════════ */
test('v3236 D1. ★★★ 清空面 ⊇ 恢复面（两侧键集合的包含关系是可机检读数，不靠人读两份清单）', () => {
    const imp = impKeysOf(idx);
    const clr = clearKeysOf(idx);
    assert.ok(imp.length >= 40, '恢复面登记键须在 40 条以上（本版实测 42），实得 ' + imp.length);
    assert.ok(clr.length >= 40, '清空面登记键须在 40 条以上，实得 ' + clr.length);
    const missing = imp.filter((k) => !clr.includes(k));
    assert.deepEqual(missing, [], '恢复面里这些**面**在清空面上找不到对应写动作（缺口 3 的形状）: ' + missing.join(', '));
});

test('v3236 D2. ★★ 两侧键名都必须是存档契约里的键（不得发明新面）', () => {
    const contract = new Set([...idx.matchAll(/'([a-zA-Z][A-Za-z0-9]*)'/g)].map((m) => m[1]));
    for (const k of [...impKeysOf(idx), ...clearKeysOf(idx)]) {
        assert.ok(contract.has(k), '键名必须在本文件里存在（防拼写漂移）：' + k);
    }
    /* 恢复面键集合必须与清空面键集合**同序可对齐**：两侧都按调用序产出，便于人工对照。 */
    const imp = impKeysOf(idx);
    assert.equal(new Set(imp).size, imp.length, '恢复面键不得重复（重复即有两个面共用一个键）');
    const clr = clearKeysOf(idx);
    assert.equal(new Set(clr).size, clr.length, '清空面键不得重复');
});

/* ══════════ E 行为面 ══════════ */
test('v3236 E1. ★★ 真跑宿主探针：`onMessageReceived` 仍是最大成员且规模仍在同一量级', () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tests', 'audit', 'host_beast_probe.cjs')],
        { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
    assert.equal(r.status, 0, '探针必须能跑通：' + String(r.stderr || '').slice(0, 200));
    const rep = JSON.parse(r.stdout);
    const top = rep.biggest_members[0];
    assert.match(top.name, /^on/, '最大成员仍应是宿主回调形状（本版改的是它内部，不是它的地位）');
    assert.ok(top.lines >= 1000, '最大成员须 ≥ 1000 行，实测 ' + top.lines);
    assert.equal(rep.total_lines, idx.split('\n').length, '★ 探针读的必须就是真 index.js');
});

test('v3236 E2. ★★ 三源同源（index.js VERSION / manifest / package.json）', () => {
    const v = /const VERSION = '([0-9]+\.[0-9]+\.[0-9]+)'/.exec(idx)[1];
    assert.equal(JSON.parse(read(path.join(ROOT, 'manifest.json'))).version, v, 'manifest 漂移');
    assert.equal(JSON.parse(read(path.join(ROOT, 'package.json'))).version, v, 'package.json 漂移');
});

/* ══════════ F 负控制（真源码破坏 → 整仓镜像 → 同款判据必须转红） ══════════
 *   本仓口径（v310 / v311 / v3225 / v3230 同款）：
 *     · **真源码破坏**（不写模拟常量，不写死判据）；
 *     · **整仓镜像**里重跑**同款判据**（不是另写一条弱判据去看）；
 *     · 锚点必须**恰中 1 次**（多中即说明破坏面选错，当场失败而不是静默改错行）。
 *   判据纯度：负控制层内**不**再声明被破坏的字面量（用运行时拼接），避免「判据引用了锚点串」
 *   这种自指假绿。 */
function withMirror(mut, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3236-mir-'));
    try {
        fs.cpSync(ROOT, dir, { recursive: true, filter: (s) => !s.split(path.sep).includes('.git') });
        mut(dir);
        return fn(dir);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}
function mutateOnce(dir, rel, from, to) {
    const p = path.join(dir, rel);
    const s = read(p);
    const n = s.split(from).length - 1;
    assert.equal(n, 1, '负控制锚点必须恰中 1 次（' + rel + '）：' + from.slice(0, 70) + '（实得 ' + n + ' 次）');
    fs.writeFileSync(p, s.replace(from, to));
}

test('v3236 N1. ★★★ 破坏清空载荷形态（人物状态回退成空对象）⇒ C1 同款判据必须转红', () => {
    /* 锚点串在**运行时拼接**：判据层内不得再声明一遍被破坏的字面量（自指假绿的一种）。 */
    const FROM = "e.status.import({ characters: {} })";
    const TO = 'e.status.import(' + '{}' + ')';
    withMirror((dir) => { mutateOnce(dir, 'index.js', FROM, TO); }, (dir) => {
        const broken = read(path.join(dir, 'index.js'));
        assert.throws(() => assertClearPayloadShapes(broken), /人物状态/, '载荷形态判据必须抓到（否则 C1 是空跑）');
    });
});

test('v3236 N2. ★★★ 破坏锚点重置（身份不符时保留旧楼层）⇒ B1 同款判据必须转红', () => {
    const FROM = 'return { fresh: true, floor: 0, chatId: id };';
    const TO = 'return { fresh: ' + 'false' + ', floor: Number(this._snapshotAnchorFloor) || 0, chatId: id };';
    withMirror((dir) => { mutateOnce(dir, 'index.js', FROM, TO); }, (dir) => {
        const broken = read(path.join(dir, 'index.js'));
        assert.throws(() => assertSnapshotAnchorContract(broken), /fresh/, '锚点契约判据必须抓到（否则 B1 是空跑）');
    });
});

test('v3236 N3. ★★★ 破坏单真源（面板换回手抄 import）⇒ A1 同款判据必须转红', () => {
    /* 锚点随架构更新：面板现在只调**流程**入口（`restoreSnapshotFlow`）。
     *   破坏方式不变：让「走单一流程」变成「顺手手抄一次 import 再走流程」。 */
    const FROM = '_fr = await engine.restoreSnapshotFlow(chatId, floor);';
    const TO = '_fr = ' + 'engine' + '.graph.import(data.graph) || await engine.restoreSnapshotFlow(chatId, floor);';
    withMirror((dir) => { mutateOnce(dir, 'settings-ui.js', FROM, TO); }, (dir) => {
        const broken = read(path.join(dir, 'settings-ui.js'));
        assert.throws(() => assertSnapshotRestoreSingleSource(broken, read(path.join(dir, 'index.js'))),
            /不得再手抄/, '单真源判据必须抓到（否则 A1 是空跑）');
    });
});

/* ══════════ G 版本锚与结构面 ══════════ */
test('v3236 G1. ★★ 版本锚与结构面', () => {
    const vnum = (s) => { const m = /^([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(String(s).trim()); return m ? (+m[1]) * 1e6 + (+m[2]) * 1e3 + (+m[3]) : NaN; };
    const v = /const VERSION = '([0-9]+\.[0-9]+\.[0-9]+)'/.exec(idx)[1];
    assert.ok(vnum(v) >= vnum('3.236.0'), '本套件出生版本不得高于当版：' + v);
    const files = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs'));
    assert.ok(files.length >= 50, '结构面：测试文件数须 ≥ 50，实得 ' + files.length);
});
