/* ============================================================
 * tests/v3445_l13_x5_migrate_pack.test.mjs — v3.445.0
 * ------------------------------------------------------------
 * L13-X5 · 可携带记忆迁移包 —— 「记忆能不能搬出去、搬进来」。
 *
 * 【真实现场（本版起点，读码可复算）】
 *   迁移包内核 memory-migrate-pack.js 出厂即完整：packMemory / verifyPack /
 *   precheckImport / applyImport 四个面、sha 分级（每条 entrySha + 全包 headSha）、
 *   冲突三决策、墓碑与不可信条目的分列…… 单测也绿。但它**一处产品端调用都没有**：
 *   面板没有按钮、宿主没有桩、用户拿到 507 行内核却导不出也导不进。
 *     这是「功能级失效」的教科书形态 —— 模块在册、真加载、自身绿、产品面零调用。
 *
 * 【本档要证明的六件事（不是「函数返回了对象」）】
 *   A) 包本身就是账：headSha 覆盖 format/schema/counts/entries，改一个字节就整包作废
 *      —— 损坏必须 fail-closed，不许「部分可信」；
 *   B) 预检是**只读五分类**：add / conflict / identical / unrecognized / tombstoned
 *      各有归属、相加恰等于 total，且预检**一个字节都不写**；
 *   C) 冲突**绝不默认覆盖**：无决策 ⇒ pending，非法决策串同样 pending；三决策各落各账，
 *      keep-both 用确定性 id（同输入同 id）保证重跑幂等；墓碑条目永不写入；
 *   D) 宿主三桩真接线：exportMigratePack 必须把内核的**裸包**包装成 {ok,pack,skipped}
 *      （本版同版修掉的缺陷：裸包会让面板按 !r.ok 误判成功为失败），
 *      且模块缺席/器官缺席各自显式报因，不静默；
 *   E) 面板双按钮真接上三桩：1/2/3 三档决策映射、全同直接跳过、导入成功后回写存档；
 *   F) 台账与门禁同版：migrate-pack 在消费台账里是真的活跃调用点（不是零调用），
 *      seam 台账登记为 host-seam，面板不越过宿主直接摸模块名。
 *
 * 【当版锚点】本档自锚常量 BORN_V + vnum（锚必须住在当版档案里，供版本守卫 V4 计数；
 *   下界比较形，不锁当版 —— 抬版时本档不用重写）。v3444 档 G5 已把当版锚交棒给本档。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const KER_SRC = read('memory-migrate-pack.js');
const HOST_SRC = read('index.js');
const UI_SRC = read('settings-ui.js');
const MANIFEST = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));

/* ── 锚点（文件头声明一次；判据函数**不**引用这些串） ──────────────────────
 * 每条都经 `assertSingleHit` 把守（breakSource 内部会先做恰中 1 次检查），
 * 打偏会当场抛，不会静默改到别处。 */
const A_N1_PENDING = "                pending.push({ key: row.key, char: row.char, layer: row.layer, id: row.item.id, reason: 'no-decision' });";
const A_N2_DECIDE = "            const dec = DECISIONS.indexOf(raw) >= 0 ? raw : '';";
const A_N3_CONFLICT_OF = '            copy.conflictOf = row.item.id;';
const A_HOST_GUARD = "            if (!packed || (typeof packed !== 'object') || !packed.headSha) return { ok: false, reason: 'pack-failed' };";
const A_UI_BOTH = "else if (pick === '3') decisions[cf.key] = 'keep-both';";

/* ── 加载内核（真源码；传破坏副本时加载的就是副本） ── */
function loadKernel(src) {
    const mod = { exports: {} };
    new Function('module', 'exports', src || KER_SRC)(mod, mod.exports);
    return mod.exports;
}

/* ── 源码切片：宿主对象方法体（8 空格缩进成员）/ 面板 handler 窗口 ── */
function methodBody(src, name) {
    const start = src.indexOf('        ' + name + '(');
    if (start < 0) return '';
    const rest = src.slice(start + 8);
    const next = /\n {8}[A-Za-z_$][\w$]*\s*\(/.exec(rest);
    return next ? rest.slice(0, next.index) : rest.slice(0, 5000);
}
function panelWindow(src) {
    const at = src.indexOf("overlay.querySelector('#ls-migrate-apply')");
    if (at < 0) return '';
    const rest = src.slice(at);
    const next = rest.indexOf('overlay.querySelector(', 20);
    return next < 0 ? rest.slice(0, 6000) : rest.slice(0, next);
}
const occ = (s, sub) => (sub === '' ? -1 : s.split(sub).length - 1);

/* ── 静态判据（只描述「行为形状」，不引用上面任何锚点串） ───────────────
 * 为什么静态：宿主 index.js 是万行 IIFE、面板 settings-ui.js 依赖真实 DOM 与 ST 事件，
 *   无头环境装载不了。判据因此落在「方法体里必须同时具备哪几件事」上，并配真源码破坏负控制
 *   （破坏后同一判据必红），避免「文本里还留着字样 ⇒ 判绿」的假绿。 */
const judgeExportStub = (src) => {
    const b = methodBody(src, 'exportMigratePack');
    /* fail-closed 判据：**同一行**内既判 headSha 又返回 ok:false。
     *   为什么按行而不是整段正则（本档首版踩过）：守卫行长这样 ——
     *     if (!packed || (typeof packed !== 'object') || !packed.headSha) return { ok: false, … };
     *   条件里自带右括号，任何 `[^)]*headSha[^)]*` 形都会在第一个 `)` 处截断，
     *   于是「守卫明明在」却判红（假红），负控制也随之失去意义。 */
    const guardLine = b.split('\n').find((l) => l.includes('headSha') && /return\s*\{\s*ok:\s*false/.test(l)) || '';
    return {
        present: !!b,
        failClosed: /if\s*\(/.test(guardLine) && /headSha/.test(guardLine),
        wraps: /return\s*\{\s*ok:\s*true\s*,\s*pack:/.test(b),
        skipped: /skipped:\s*Array\.isArray/.test(b),
        rawLeak: /return\s+M\.packMemory\s*\(/.test(b),
        moduleGate: /reason:\s*'module-unavailable'/.test(b),
        charmGate: /reason:\s*'charmem-unavailable'/.test(b),
    };
};
const judgePanelApply = (src) => {
    const w = panelWindow(src);
    return {
        present: !!w,
        usePack: /pick\s*===\s*'2'[^\n]*use-pack/.test(w),
        keepBoth: /pick\s*===\s*'3'[^\n]*keep-both/.test(w),
        defaultLocal: /else\s+decisions\[[^\]]*\]\s*=\s*'keep-local'/.test(w),
        skipAllSame: /identical\.length\s*===\s*[^\n]*counts\.total/.test(w),
        persists: /storage\.save\([^\n]*collectExport\(\)/.test(w),
        outGate: /!out\s*\|\|\s*!out\.ok/.test(w),
    };
};

/* ── 数据构造 ── */
const CHAR = '林听雨';
const CORE_ITEM = { id: 'cm_1001', text: '她讨厌雨天', floor: 12 };
const RECENT_ITEM = { id: 'mr_2002', text: '约好周三见', floor: 40 };
const clone = (v) => JSON.parse(JSON.stringify(v));
const packOf = (K, buckets, extra) => K.packMemory({ source: { memories: buckets }, ...(extra || {}) });
const localOf = (buckets, extra) => ({ memories: buckets, ...(extra || {}) });

/* ============================================================
 * A · 包本身就是账
 * ============================================================ */
const K = loadKernel();

test('A1: 包形状齐全 —— format/schema/counts/entries/headSha 五面在场，且 hash 是 64 hex', () => {
    const p = packOf(K, { [CHAR]: { core: [CORE_ITEM], recent: [RECENT_ITEM] } });
    assert.equal(p.format, 'lonsha-memory-pack');
    assert.equal(p.schema, 1);
    assert.equal(p.counts.entries, 2);
    assert.equal(p.counts.chars, 1);
    assert.deepEqual(p.counts.layers, { core: 1, recent: 1 });
    assert.equal(p.entries.length, 2);
    assert.match(p.headSha, /^[0-9a-f]{64}$/, 'headSha 必须是 64 位十六进制');
    for (const e of p.entries) assert.match(e.sha, /^[0-9a-f]{64}$/, '每条 entry 自带 sha');
    assert.equal(K.verifyPack(p).ok, true, '原样自校验必须通过');
});

test('A2: 改一个字节就整包作废 —— 四类损坏各自 fail-closed 且**报得出是哪一类**', () => {
    const p = packOf(K, { [CHAR]: { core: [CORE_ITEM] } });
    const bad1 = clone(p); bad1.entries[0].item.text = '她喜欢雨天';
    assert.equal(K.verifyPack(bad1).reason, 'entry-sha-mismatch');
    assert.equal(K.verifyPack(bad1).at, 0, '必须点出是第几条坏了');
    const bad2 = clone(p); bad2.counts.entries = 9;
    assert.equal(K.verifyPack(bad2).reason, 'count-mismatch');
    const bad3 = clone(p); delete bad3.headSha;
    assert.equal(K.verifyPack(bad3).reason, 'head-sha-missing');
    const bad4 = clone(p); bad4.format = 'lonsha-memory-pack-v2';
    assert.equal(K.verifyPack(bad4).reason, 'bad-format');
    const bad5 = clone(p); bad5.headSha = 'f'.repeat(64);
    assert.equal(K.verifyPack(bad5).reason, 'head-sha-mismatch');
    /* 不许「部分可信」：任何一条坏，整包 entries 一律不认。 */
    const bad6 = clone(p);
    bad6.entries.push({ char: CHAR, layer: 'core', item: { id: 'cm_1002', text: 'x', floor: 1 }, sha: 'deadbeef' });
    bad6.counts.entries = 2;
    assert.equal(K.verifyPack(bad6).ok, false, '坏条目混进包 ⇒ 整包不认（不做部分信任）');
});

test('A3: 打包**不改调用方状态** —— 输入深比对逐字节不变', () => {
    const src = localOf({ [CHAR]: { core: [CORE_ITEM], recent: [RECENT_ITEM] } });
    const before = JSON.stringify(src);
    const p = packOf(K, src.memories);
    assert.equal(JSON.stringify(src), before, 'packMemory 不得就地改写 source');
    p.entries[0].item.text = '篡改副本';
    assert.equal(JSON.stringify(src), before, '改包不得回写源');
});

test('A4: 层/角色/楼层都是可选筛选，且筛掉的记账不漏', () => {
    const buckets = {
        [CHAR]: { core: [CORE_ITEM], recent: [RECENT_ITEM] },
        '周砚': { core: [{ id: 'cm_3003', text: '周砚的剑', floor: 5 }], recent: [] },
    };
    const onlyCore = packOf(K, buckets, { layers: ['core'] });
    assert.equal(onlyCore.counts.layers.recent, 0, '只要 core 时 recent 必须为 0');
    assert.equal(onlyCore.counts.entries, 2);
    const onlyChar = packOf(K, buckets, { chars: ['周砚'] });
    assert.equal(onlyChar.counts.chars, 1);
    assert.deepEqual([...new Set(onlyChar.entries.map((e) => e.char))], ['周砚']);
    const windowed = packOf(K, buckets, { sinceFloor: 10, untilFloor: 30 });
    assert.deepEqual(windowed.entries.map((e) => e.item.id), ['cm_1001'], '楼层窗口外的条目不得混入');
});

test('A5: 形状非法条目**跳过并记账**（skipped），不静默吞、也不炸整包', () => {
    const p = packOf(K, {
        [CHAR]: { core: [CORE_ITEM, { id: '', text: '没有 id', floor: 1 }, { id: 'cm_9', floor: 2 }], recent: [] },
    });
    assert.equal(p.counts.entries, 1);
    assert.equal(p.skipped.length, 2, '两条坏条目都要进 skipped');
    assert.deepEqual(p.skipped.map((s) => s.reason).sort(), ['item-id-missing', 'item-text-missing']);
});

/* ============================================================
 * B · 预检：只读五分类
 * ============================================================ */
test('B1: 五分类各有归属 —— add/conflict/identical/unrecognized/tombstoned 相加恰等于 total', () => {
    const pack = packOf(K, {
        [CHAR]: {
            core: [
                { id: 'cm_1001', text: '包内的新说法', floor: 12 },   // 与本地同 id 异文 ⇒ conflict
                { id: 'cm_1009', text: '本地没有这条', floor: 15 },   // ⇒ add
                { id: 'cm_1010', text: '   ', floor: 16 },            // 空文本 ⇒ unrecognized
                { id: 'xx_1011', text: '前缀不对', floor: 17 },       // 前缀不符 ⇒ unrecognized
            ],
            recent: [],
        },
    });
    /* 本地：cm_1001 异文（冲突）、cm_1008 与包内同文（identical）、cm_1012 已被墓碑 */
    const local = localOf({
        [CHAR]: {
            core: [
                { id: 'cm_1001', text: '本地说法', floor: 12 },
                { id: 'cm_1008', text: '两边一模一样', floor: 14 },
            ],
            recent: [],
        },
    }, { tombstones: { [CHAR]: [{ item: { id: 'cm_1012' } }] } });
    const pack2 = packOf(K, {
        [CHAR]: {
            core: [
                { id: 'cm_1001', text: '包内的新说法', floor: 12 },
                { id: 'cm_1009', text: '本地没有这条', floor: 15 },
                { id: 'cm_1010', text: '   ', floor: 16 },
                { id: 'xx_1011', text: '前缀不对', floor: 17 },
                { id: 'cm_1008', text: '两边一模一样', floor: 14 },
                { id: 'cm_1012', text: '已被我删过', floor: 18 },
            ],
            recent: [],
        },
    });
    const pre = K.precheckImport(pack2, local);
    assert.equal(pre.ok, true);
    assert.equal(pre.counts.add, 1, 'add 恰 1（cm_1009）');
    assert.equal(pre.counts.conflict, 1, 'conflict 恰 1（cm_1001 同 id 异文）');
    assert.equal(pre.counts.identical, 1, 'identical 恰 1（cm_1008 同文）');
    assert.equal(pre.counts.unrecognized, 2, 'unrecognized 恰 2（空文本 + 前缀不符）');
    assert.equal(pre.counts.tombstoned, 1, 'tombstoned 恰 1（本地墓碑）');
    assert.equal(pre.counts.total, pack2.entries.length, 'total 必须是包内条目总数');
    const sum = pre.counts.add + pre.counts.conflict + pre.counts.identical
        + pre.counts.unrecognized + pre.counts.tombstoned;
    assert.equal(sum, pre.counts.total, '五分类必须恰好覆盖每一类（不许有条目既不算也不丢）');
    /* 不可信条目必须报得出原因，不是「混在某个计数里」。 */
    assert.ok(pre.unrecognized.every((r) => /empty-text|id-prefix-mismatch|char-name-too-long/.test(r.reason)));
    assert.equal(pre.tombstoned[0].reason, 'tombstoned-locally');
    /* pack 变量此刻不该被用到（上面重造了含 identical/墓碑的全量包）—— 保留形状自检 */
    assert.equal(K.verifyPack(pack).ok, true);
});

test('B2: 预检**一个字节都不写** —— 本地状态前后逐字节相同', () => {
    const local = localOf({ [CHAR]: { core: [{ id: 'cm_1001', text: '本地说法', floor: 12 }], recent: [] } });
    const before = JSON.stringify(local);
    const pack = packOf(K, { [CHAR]: { core: [{ id: 'cm_1001', text: '包内说法', floor: 12 }, { id: 'cm_1002', text: '新的', floor: 13 }], recent: [] } });
    K.precheckImport(pack, local);
    assert.equal(JSON.stringify(local), before, 'precheck 是只读面');
});

test('B3: 坏包预检直接拒，且计数全 0（不许返回「一半的预检结果」）', () => {
    const pack = packOf(K, { [CHAR]: { core: [CORE_ITEM] } });
    const broken = clone(pack); broken.entries[0].sha = 'a'.repeat(64);
    const pre = K.precheckImport(broken, localOf({}));
    assert.equal(pre.ok, false);
    assert.equal(pre.rejected, true);
    assert.equal(pre.counts.total, 0);
    assert.deepEqual([pre.added.length, pre.conflicts.length, pre.identical.length, pre.unrecognized.length], [0, 0, 0, 0]);
});

/* ============================================================
 * C · 冲突绝不默认覆盖
 * ============================================================ */
const conflictScene = () => ({
    pack: packOf(K, { [CHAR]: { core: [{ id: 'cm_1001', text: '包内说法', floor: 12 }], recent: [] } }),
    local: localOf({ [CHAR]: { core: [{ id: 'cm_1001', text: '本地说法', floor: 12 }], recent: [] } }),
});

test('C1: 无决策 ⇒ 该条目一律 pending，本地原文不变；reason 明示 partial-conflicts-pending', () => {
    const { pack, local } = conflictScene();
    const r = K.applyImport(pack, local, {});
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'partial-conflicts-pending');
    assert.equal(r.report.pending, 1);
    assert.equal(r.pending.length, 1);
    assert.equal(r.pending[0].reason, 'no-decision');
    assert.equal(r.state.memories[CHAR].core[0].text, '本地说法', '没决策就不许覆盖');
    assert.equal(r.report.written, 0);
});

test('C2: 非法决策串（大小写混 / 自造词）同样按「没决策」处置 —— 不猜用户意思', () => {
    const { pack, local } = conflictScene();
    for (const bogus of ['USE-PACK', 'overwrite', 'use-pack ', '', null, 2, {}]) {
        const r = K.applyImport(pack, local, { [K.entryKeyOf(CHAR, 'core', 'cm_1001')]: bogus });
        assert.equal(r.report.pending, 1, '非法决策 ' + JSON.stringify(bogus) + ' 必须落 pending');
        assert.equal(r.state.memories[CHAR].core[0].text, '本地说法');
    }
});

test('C3: 三决策各落各账 —— keep-local 不动 / use-pack 替换 / keep-both 新增一条', () => {
    const { pack, local } = conflictScene();
    const key = K.entryKeyOf(CHAR, 'core', 'cm_1001');

    const r1 = K.applyImport(pack, local, { [key]: 'keep-local' });
    assert.equal(r1.report.keptLocal, 1);
    assert.equal(r1.report.written, 0);
    assert.equal(r1.state.memories[CHAR].core[0].text, '本地说法');
    assert.equal(r1.pending.length, 0);

    const r2 = K.applyImport(pack, local, { [key]: 'use-pack' });
    assert.equal(r2.report.replaced, 1);
    assert.equal(r2.state.memories[CHAR].core.length, 1, 'use-pack 是替换不是追加');
    assert.equal(r2.state.memories[CHAR].core[0].text, '包内说法');

    const r3 = K.applyImport(pack, local, { [key]: 'keep-both' });
    assert.equal(r3.report.keptBoth, 1);
    assert.equal(r3.state.memories[CHAR].core.length, 2, 'keep-both 必须两条并存');
    assert.equal(r3.state.memories[CHAR].core[0].text, '本地说法', '本地那条原地不动');
    const copyRow = r3.state.memories[CHAR].core[1];
    assert.equal(copyRow.text, '包内说法');
    assert.equal(copyRow.conflict, true, '两存副本必须自带 conflict 标记，后续可辨');
    assert.equal(copyRow.conflictOf, 'cm_1001', '必须记得它替代的是哪一条');
    assert.notEqual(copyRow.id, 'cm_1001', '两存副本必须换确定性 id，不许撞原 id');
});

test('C4: keep-both 的 id 是确定性的 —— 同角色+同文+同楼层必得同 id（幂等的根）', () => {
    const a = K.conflictIdOf(CHAR, '包内说法', 12);
    const b = K.conflictIdOf(CHAR, '包内说法', 12);
    assert.equal(a, b);
    assert.match(a, /^cf_[0-9a-f]{12}_12$/);
    assert.notEqual(a, K.conflictIdOf(CHAR, '包内说法', 13), '楼层不同必须另起一条（否则跨楼层记忆会互吞）');
    assert.notEqual(a, K.conflictIdOf('周砚', '包内说法', 12), '角色不同必须另起一条');
});

test('C5: 重跑同一次 keep-both 导入是幂等的 —— 不会越导越多', () => {
    const { pack, local } = conflictScene();
    const key = K.entryKeyOf(CHAR, 'core', 'cm_1001');
    const r1 = K.applyImport(pack, local, { [key]: 'keep-both' });
    assert.equal(r1.state.memories[CHAR].core.length, 2);
    /* 用第一次的结果当本地，再导同一份包、同一决策 */
    const r2 = K.applyImport(pack, r1.state, { [key]: 'keep-both' });
    assert.equal(r2.state.memories[CHAR].core.length, 2, '第二次不得再增一条（确定性 id 命中即跳过）');
    assert.equal(r2.report.keptBoth, 1);
    assert.equal(r2.report.written, 0, '第二次不该真的写');
});

test('C6: 墓碑条目永不写入 —— 无论给什么决策（删过的东西不许被别人的包复活）', () => {
    const pack = packOf(K, { [CHAR]: { core: [{ id: 'cm_1012', text: '我已经删过这条', floor: 18 }], recent: [] } });
    const local = localOf({ [CHAR]: { core: [], recent: [] } }, { tombstones: { [CHAR]: [{ item: { id: 'cm_1012' } }] } });
    for (const dec of ['keep-local', 'use-pack', 'keep-both']) {
        const r = K.applyImport(pack, local, { [K.entryKeyOf(CHAR, 'core', 'cm_1012')]: dec });
        assert.equal(r.report.tombstoned, 1);
        assert.equal(r.state.memories[CHAR].core.length, 0, '墓碑条目在 ' + dec + ' 决策下都不得写入');
    }
});

test('C7: apply **不改调用方状态** —— 返回新对象，local 逐字节不变', () => {
    const { pack, local } = conflictScene();
    const before = JSON.stringify(local);
    const r = K.applyImport(pack, local, { [K.entryKeyOf(CHAR, 'core', 'cm_1001')]: 'use-pack' });
    assert.equal(JSON.stringify(local), before, 'applyImport 必须返回新 state，不许就地改');
    assert.notEqual(r.state, local, '返回的必须是新对象');
    assert.equal(r.state.memories[CHAR].core[0].text, '包内说法');
});

test('C8: state 结构完整 —— 合并结果保留 autobiographies / tombstones（否则回写会抹掉自查史）', () => {
    const pack = packOf(K, { [CHAR]: { core: [{ id: 'cm_1001', text: '包内说法', floor: 12 }], recent: [] } });
    const local = localOf(
        { [CHAR]: { core: [], recent: [] } },
        { autobiographies: { [CHAR]: { note: '自查史' } }, tombstones: { [CHAR]: [{ item: { id: 'cm_9999' } }] } },
    );
    const r = K.applyImport(pack, local, {});
    assert.equal(r.state.memories[CHAR].core.length, 1, '无冲突条目照常写入');
    assert.deepEqual(r.state.autobiographies, { [CHAR]: { note: '自查史' } }, '自查史不许被合并吞掉');
    assert.equal(r.state.tombstones[CHAR].length, 1, '墓碑账不许被合并吞掉');
});

test('C9: 坏包 apply 直接拒 —— state 为 null（不许拿半截结果去回写存档）', () => {
    const pack = packOf(K, { [CHAR]: { core: [CORE_ITEM] } });
    const broken = clone(pack); broken.entries[0].item.text = '偷偷改了';
    const r = K.applyImport(broken, localOf({}), {});
    assert.equal(r.ok, false);
    assert.equal(r.rejected, true);
    assert.equal(r.state, null);
});

/* ============================================================
 * D · 宿主三桩真接线
 * ============================================================ */
test('D1: 三桩都在宿主对象上，且都经同一个取库口（面板不摸模块）', () => {
    for (const name of ['exportMigratePack', 'precheckMigrateImport', 'applyMigrateImport']) {
        assert.equal(occ(HOST_SRC, '        ' + name + '('), 1, name + ' 必须恰有 1 个定义');
        const body = methodBody(HOST_SRC, name);
        assert.ok(body.length > 0, name + ' 方法体必须可切出');
        assert.ok(body.includes('_migratePackLib()'), name + ' 必须经 _migratePackLib() 取库，不另起口子');
        assert.ok(/reason:\s*'module-unavailable'/.test(body), name + ' 模块缺席必须显式报因');
        assert.ok(/reason:\s*'charmem-unavailable'/.test(body), name + ' 器官缺席必须显式报因');
    }
    /* 取库口形：全局优先 + require 回落，且**不在构造期缓存**（惰性）。 */
    assert.equal(occ(HOST_SRC, '    function _migratePackLib() {'), 1);
    assert.ok(/window\.LonShaMigratePack/.test(HOST_SRC), '取库口必须认全局件 window.LonShaMigratePack');
    const libBody = HOST_SRC.slice(HOST_SRC.indexOf('    function _migratePackLib() {'));
    const oneLine = libBody.slice(0, libBody.indexOf('\n    }'));
    assert.ok(/return\s+_moduleLib\(/.test(oneLine), '取库口每次现取，不做构造期缓存');
});

test('D2: exportMigratePack 把裸包包装成 {ok,pack,skipped} —— 本版同版修掉的误判缺陷', () => {
    const j = judgeExportStub(HOST_SRC);
    assert.equal(j.present, true);
    assert.equal(j.failClosed, true, '缺 headSha / 非对象必须 fail-closed 报 pack-failed');
    assert.equal(j.wraps, true, '成功路径必须包成 {ok:true, pack:…}');
    assert.equal(j.skipped, true, 'skipped 必须归一成数组（面板要直接读长度）');
    assert.equal(j.rawLeak, false, '不许把内核裸包直接 return（面板按 !r.ok 会判成功为失败）');
    assert.equal(j.moduleGate && j.charmGate, true, '两处缺席闸必须在同一方法体内可见');
});

test('D3: applyMigrateImport 成功后回写器官（宿主侧落地，面板只负责存盘）', () => {
    const body = methodBody(HOST_SRC, 'applyMigrateImport');
    assert.ok(/M\.applyImport\(pack,\s*src,\s*decisions\)/.test(body), '必须调内核 applyImport');
    assert.ok(/r\.ok\s*&&\s*r\.state/.test(body), '只在成功且拿到 state 时回写');
    assert.ok(/this\.charMem\.import\(/.test(body), '必须回写 charMem 器官');
    assert.ok(!/this\.charMem\.import\([^)]*\)[\s\S]{0,200}catch/.test(body), '回写不吞异常来源（异常由上层 reportUiError 兜）');
});

test('D4: precheck 桩是**只读**面 —— 方法体里没有任何写入调用', () => {
    const body = methodBody(HOST_SRC, 'precheckMigrateImport');
    assert.ok(/M\.precheckImport\(pack,\s*src\)/.test(body));
    assert.ok(!/\.import\(/.test(body), '预检不许回写器官');
    assert.ok(!/\.save\(/.test(body), '预检不许存盘');
});

/* ============================================================
 * E · 面板双按钮真接上三桩
 * ============================================================ */
test('E1: 面板两个按钮都在，且各自接的是宿主桩（不是模块名）', () => {
    assert.equal(occ(UI_SRC, "#ls-migrate-pack"), 1);
    assert.equal(occ(UI_SRC, "#ls-migrate-apply"), 1);
    assert.ok(/this\.engine\.exportMigratePack\(/.test(UI_SRC), '导出按钮必须经宿主桩');
    assert.ok(occ(UI_SRC, 'this.engine.precheckMigrateImport(pack)') >= 1, '导入必须先预检');
    assert.ok(occ(UI_SRC, 'this.engine.applyMigrateImport(pack, decisions)') >= 1, '导入必须走宿主桩落地');
    /* 面板不越过宿主直接摸模块名：这是「接线」与「耦合」的分界。 */
    assert.equal(occ(UI_SRC, 'memory-migrate-pack'), 0, '面板不得出现模块文件名');
    assert.equal(occ(UI_SRC, 'LonShaMigratePack'), 0, '面板不得直接摸内核全局件');
});

test('E2: 决策映射三档真接上 —— 1/2/3 分别落 keep-local / use-pack / keep-both，未知输入默认保留本地', () => {
    const j = judgePanelApply(UI_SRC);
    assert.equal(j.present, true);
    assert.equal(j.usePack, true, "'2' 必须映射 use-pack");
    assert.equal(j.keepBoth, true, "'3' 必须映射 keep-both");
    assert.equal(j.defaultLocal, true, '兜底必须是 keep-local（不许默认覆盖用户本地记忆）');
});

test('E3: 全同直接跳过 + 成功后回写存档 + 失败不静默', () => {
    const j = judgePanelApply(UI_SRC);
    assert.equal(j.skipAllSame, true, '包内全与本地相同时必须跳过（不许空跑一次写盘）');
    assert.equal(j.persists, true, '导入成功后必须 storage.save(chatId, collectExport()) 回写');
    assert.equal(j.outGate, true, 'host 桩返回 ok:false 时必须 toast 失败，不继续写盘');
    /* 报告必须点出「待决」条数：有冲突没决策时用户得看得见，不是静默吞掉。 */
    const w = panelWindow(UI_SRC);
    assert.ok(/pending/.test(w), '导入结果提示里必须出现待决计数');
});

test('E4: 导出侧双备份 —— 本地 localStorage 与文件下载都在，且带 headSha 提示', () => {
    const at = UI_SRC.indexOf("overlay.querySelector('#ls-migrate-pack')");
    const w = UI_SRC.slice(at, at + 2600);
    assert.ok(/localStorage\.setItem\('lonsha_migrate_pack'/.test(w), '必须留本地备份');
    assert.ok(/Blob|createObjectURL/.test(w), '必须能下载成文件');
    assert.ok(/headSha/.test(w), '提示里要说明 headSha 随包（用户据此知道包可校验）');
});

/* ============================================================
 * F · 台账同版（接线不是「写在文档里」，而是记账上真的活跃）
 * ============================================================ */
test('F1: 消费台账里 migrate-pack 是**真活跃调用点**，不是零调用存量', () => {
    const led = JSON.parse(read('tests/audit/module_consumption_ledger.json'));
    const row = led.modules['memory-migrate-pack.js'];
    assert.ok(row, 'memory-migrate-pack.js 必须登记在册（本版前它整条缺失 = 接线未成）');
    assert.ok(Number(row.prod_call_sites) >= 1, '产品端调用点必须 ≥ 1（实 ' + row.prod_call_sites + '）');
    assert.equal(row.why, 'active', '必须标 active，不许拿存量豁免混过去');
});

test('F2: seam 台账里登记为 host-seam（模块被产品面经宿主桩接上）', () => {
    const tsv = read('tests/audit/extra_js_seam_ledger.tsv').split('\n');
    const row = tsv.find((l) => l.startsWith('memory-migrate-pack.js\t'));
    assert.ok(row, 'seam 台账必须登记 memory-migrate-pack.js');
    const cols = row.split('\t');
    assert.equal(cols[1], 'yes', '必须真加载');
    assert.equal(cols[4], 'host-seam', '判定必须是 host-seam（实 ' + cols[4] + '）');
});

test('F3: state-report 与当版一致，且把本模块计入 extra_js 装载面', () => {
    const rep = JSON.parse(read('tests/audit/state-report.json'));
    assert.equal(rep.version, MANIFEST.version, 'state-report 版本必须与 manifest 同版');
    assert.equal(rep.version_same, true);
    /* extra_js 名单挂在 loading 子树上（不是顶层）；顶层只有 loading.extra_js 的计数。 */
    const list = (rep.loading && rep.loading.extra_js_list) || [];
    assert.ok(Array.isArray(list), 'loading.extra_js_list 必须是数组');
    assert.ok(list.includes('memory-migrate-pack.js'), 'extra_js 装载面必须包含本模块');
    assert.equal(rep.loading.extra_js, list.length, '装载计数必须与名单长度一致（实 ' + rep.loading.extra_js + ' / ' + list.length + '）');
});

/* ============================================================
 * G · 负控制：真源码破坏 ⇒ 同一判据必红（原版对照必绿）
 * ============================================================ */
test('G1: 负控制① 把「没决策」改判成默认用包内 ⇒ pending 判据必红', () => {
    const { pack, local } = conflictScene();
    const base = K.applyImport(pack, local, {});
    assert.equal(base.pending.length, 1, '原版对照：无决策必须 pending');
    assert.equal(base.report.written, 0, '原版对照：无决策不许写');

    const broken = breakSource(KER_SRC, A_N2_DECIDE, "            const dec = raw || 'use-pack';", 'x5_n1');
    const KB = loadKernel(broken);
    const r = KB.applyImport(pack, local, {});
    assert.notEqual(r.report.written, 0, '破坏后必须真的写了（说明破坏生效）');
    assert.notEqual(r.pending.length, 1, '破坏后「无决策」不再落 pending —— 这正是原版必须防住的默认覆盖');
});

test('G2: 负控制② 让 pending 不记账（删掉 push）⇒ 「待决可见」判据必红', () => {
    const { pack, local } = conflictScene();
    const base = K.applyImport(pack, local, {});
    assert.equal(base.pending[0].reason, 'no-decision', '原版对照：待决条目必须带成因');
    const broken = breakSource(KER_SRC, A_N1_PENDING, '', 'x5_n2');
    const KB = loadKernel(broken);
    const r = KB.applyImport(pack, local, {});
    assert.equal(r.pending.length, 0, '破坏后待决清单空 —— 用户会以为「没有冲突」');
    assert.equal(r.report.pending, 1, '计数还在但清单丢了：这正是「坏得看不出来」的形态，判据必须点名');
});

test('G3: 负控制③ 两存副本不记 conflictOf ⇒ 「可追溯」判据必红', () => {
    const { pack, local } = conflictScene();
    const key = K.entryKeyOf(CHAR, 'core', 'cm_1001');
    const base = K.applyImport(pack, local, { [key]: 'keep-both' });
    assert.equal(base.state.memories[CHAR].core[1].conflictOf, 'cm_1001', '原版对照：两存副本必须记得原 id');
    const broken = breakSource(KER_SRC, A_N3_CONFLICT_OF, "            copy.conflictOf = '';", 'x5_n3');
    const KB = loadKernel(broken);
    const r = KB.applyImport(pack, local, { [key]: 'keep-both' });
    assert.equal(r.state.memories[CHAR].core.length, 2, '破坏后仍是两条（写入没坏）');
    assert.equal(r.state.memories[CHAR].core[1].conflictOf, '', '但「它替代了谁」的信息丢了');
});

test('G4: 负控制④ 去掉裸包守卫 ⇒ 包装判据必红（本版修的缺陷会原地复活）', () => {
    assert.equal(judgeExportStub(HOST_SRC).failClosed, true, '原版对照必绿');
    const broken = breakSource(HOST_SRC, A_HOST_GUARD, '            if (false) return { ok: false, reason: \'none\' };', 'x5_n4');
    assert.equal(judgeExportStub(broken).failClosed, false, '破坏后 fail-closed 判据必须变红');
    assert.equal(judgeExportStub(broken).wraps, true, '包装仍在 —— 红点必须只落在守卫上（可归因）');
});

test('G5: 负控制⑤ 面板把「两个都要」改成映射别处 ⇒ keep-both 通路判据必红', () => {
    assert.equal(judgePanelApply(UI_SRC).keepBoth, true, '原版对照必绿');
    const broken = breakSource(UI_SRC, A_UI_BOTH, "else if (pick === '9') decisions[cf.key] = 'keep-both';", 'x5_n5');
    assert.equal(judgePanelApply(broken).keepBoth, false, '破坏后 keep-both 通路判据必须变红');
    assert.equal(judgePanelApply(broken).usePack, true, 'use-pack 通路不受影响（可归因）');
});

/* ============================================================
 * H · 版本面：六源同源 + 本档出生锚（下界，不锁当版）
 * ============================================================ */
test('H1: 版本面 —— manifest/package/index/内核 同源，本档出生锚为下界', () => {
    const BORN_V = '3.445.0';
    const vnum = (v) => {
        const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(v || '').trim());
        return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
    };
    assert.equal(vnum(BORN_V), 3445000, '出生版本锚（vnum 形）：3.445.0 ⇒ 3445000');
    const live = (/const VERSION = '([0-9]+[.][0-9]+[.][0-9]+)'/.exec(HOST_SRC) || [])[1];
    assert.equal(live, MANIFEST.version, 'index.js VERSION 与 manifest 必须互等（实 ' + live + ' / ' + MANIFEST.version + '）');
    assert.equal(MANIFEST.version, PKG.version, 'manifest 与 package 必须互等');
    const kernV = (/var VERSION = '([0-9]+[.][0-9]+[.][0-9]+)'/.exec(KER_SRC) || [])[1];
    assert.ok(vnum(kernV) >= vnum(BORN_V), '内核版本不得低于本档出生版本（实 ' + kernV + '）');
    /* 上界：不承诺未来（现版可以更高，但不得低于本档出生版本）。 */
    assert.ok(vnum('3.444.0') < vnum(BORN_V), '版本序须前进（3.444.0 < 3.445.0）');
    /* 本档专有标记在场。 */
    assert.ok(KER_SRC.includes('L13-X5'), '内核必须留 L13-X5 标记');
    assert.ok(HOST_SRC.includes('L13-X5'), '宿主必须留 L13-X5 标记');
    assert.ok(UI_SRC.includes('L13-X5'), '面板必须留 L13-X5 标记');
});
