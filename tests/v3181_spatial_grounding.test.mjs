// tests/v3181_spatial_grounding.test.mjs
// v3.181 场所图景（Spatial Grounding）：把「地点」从一句注记做成可查询的面（scene-book.js）
//   背景：场景树自 v2.4 就在 index.js 里，但它是全库**最薄的一个子系统**——整个 SceneBook
//     只有 89 行，对外读法只有三个（currentKey / chainOf / brief）。于是四个日常问题在运行期
//     全是死路：「上一次去『老城›钟楼›顶层』是什么时候」「这一段剧情发生时人在哪儿」
//     「谁在这个地方」「这个街区下还藏着多少处场所、写到了第几层」。地点侧只有一句注记，没有面。
//   层次：A 六面真能回答（树/到访/在场/挂账/覆盖/不变量 —— ★ 行为驱动，不看声明面）
//         B 不变量三态可达且互不同形（★ 三态不得塌成两态，本仓库反复治理的缺陷族）
//         C 三处旧缺陷根除（哑雷三目 / 无到访史 / 清了却没人重建）+ 重建可复现
//         D 有界性（上限常量必须真被消费，不是只声明）
//         E 接线真被消费（★ 声明了却零消费 = 死声明）
//         F 持久化与旧格式兼容（老存档升上来要回填到访史，而不是一片空白）
//         G 模块缺席的同形退路（★ 读数如实回报「没有」，绝不伪造能写不能读的世界）
//         H 对外只读口（13 项资源 / 单一实现 / 只读边界）
//         I 负控制（真源码破坏 → 破坏副本 → 同款真判据）+ 判据纯度两向自证
//         J 发布卫生
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const SB_PATH = path.join(REPO, 'scene-book.js');
const AUDIT = path.join(REPO, 'tests', 'audit', 'scan_v3181_spatial_grounding.mjs');
const NEGCTL = path.join(REPO, 'tests', 'audit', 'scan_v3181_spatial_grounding_negctl.mjs');
const SB = require(SB_PATH);
const sbSrc = fs.readFileSync(SB_PATH, 'utf8');
const idxSrc = fs.readFileSync(path.join(REPO, 'index.js'), 'utf8');
const piSrc = fs.readFileSync(path.join(REPO, 'public-interface.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const changelog = fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8');
const PI = require(path.join(REPO, 'public-interface.js'));
function vnum(s) {
    const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
    return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}
/** 从源码里取出一个具名函数的源码（用于把 stripComments 拿进本测试真跑）。 */
function extractNamed(src, header) {
    const start = src.indexOf(header);
    assert.ok(start >= 0, '找到 ' + header);
    let i = src.indexOf('{', start), depth = 0, end = -1;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    assert.ok(end > 0, header + ' 花括号闭合');
    return src.slice(start, end);
}
// ── 判据纯度工具：从审计脚本里取同一份实现来真跑（本测试自己的形态判据也走它） ──
const stripSrc = extractNamed(fs.readFileSync(AUDIT, 'utf8'), 'function stripComments(src) {');
const stripComments = new Function('return (' + stripSrc + ');')();
/** 破坏副本装载器：与真判据同源（判据接受 SceneBook 类，破坏副本也走这里载入）。 */
function loadSBFrom(src) {
    const mod = { exports: {} };
    new Function('module', 'window', 'globalThis', src)(mod, {}, {});
    return mod.exports;
}
// ══════════ A 六面真能回答 ══════════
test('【A1】★ 场景树：登记深层路径自动补齐祖先；未定位不编造当前位置', () => {
    const b = new SB.SceneBook();
    const applied = b.apply([
        { action: 'add', path: ['老城', '钟楼', '顶层'], desc: '铜钟与半截梯' },
        { action: 'add', path: ['老城', '钟楼', '地室'], desc: '水痕与铁门' },
        { action: 'add', path: ['老城', '西街'], desc: '夜市' }
    ], 5);
    assert.equal(applied, 3, '三条 add 计 3 条变更（不是 ops 条数之外的虚增）');
    assert.ok(b.nodes.has('老城') && b.nodes.has('老城/钟楼'), '★ 祖先自动补齐（层级不断裂）');
    assert.equal(b.nodes.get('老城').desc, '', '补齐的祖先不带描述（不伪造内容）');
    assert.equal(b.currentKey(), null, '★ 未定位却报出当前位置 = 编造读数');
    assert.equal(b.chainOf('老城/钟楼/顶层').length, 3, '当前位置链由粗到细三层齐全');
    assert.deepEqual(b.chainOf('没有/这条路径'), [], '不存在的键返回空链（不是 [null]）');
    assert.ok(/老城/.test(b.brief()), '注入清单含已登记场景');
    assert.equal(new SB.SceneBook().brief(), '（暂无已登记场景）', '空树给占位句（与旧行为一致）');
});
test('【A2】★ 如实计数：被拒的 op 单独计数，不静默吞也不虚增', () => {
    const b = new SB.SceneBook();
    b.apply([{ action: 'add', path: ['老城', '西街'], desc: '夜市' }], 5);
    const n = b.apply([
        { action: 'update', path: ['不存在'], desc: 'x' },      // update 只改已存在的
        { action: 'add', path: [], desc: 'y' },                 // 空路径
        { action: 'del', path: ['老城'], desc: 'z' },           // 非 add/update
        { action: 'add', path: ['老城', '西街'], desc: '夜市' } // 同描述重复提取
    ], 6);
    assert.equal(n, 0, '四条全被拒 ⇒ 变更数为 0');
    assert.equal(b.lastApply.rejected, 4, '★ 被拒条数如实计数（不静默吞掉）');
    assert.equal(b.lastApply.applied, 0, '变更数为 0 与拒绝数 4 分别为两个读数');
});
test('【A3】★ 到访史：同楼覆盖不重复计，「去过几次」第一次可数', () => {
    const b = new SB.SceneBook();
    b.apply([{ action: 'add', path: ['城', '店'], desc: '铺面' }], 3);
    assert.equal(b.setLocation(3, ['城', '店']), true, '首次落位 = 真的移动了');
    assert.equal(b.setLocation(3, ['城', '店']), false, '同楼同址再落位 = 未移动');
    const v1 = b.visitsOf(['城', '店']);
    assert.equal(v1.count, 1, '★ 同楼覆盖不重复计到访（否则重访率虚增）');
    assert.equal(v1.revisit, false, '只去过一次算不上重访');
    b.setLocation(7, ['城', '店']);
    const v2 = b.visitsOf(['城', '店']);
    assert.equal(v2.count, 2, '换楼再访 ⇒ 计 2 次');
    assert.equal(v2.firstFloor, 3, '首次到访楼层可读');
    assert.equal(v2.lastFloor, 7, '最近到访楼层可读');
    assert.deepEqual(v2.floors, [3, 7], '近期楼层列表可读');
    assert.equal(v2.revisit, true, '去过两次 = 重访');
    assert.equal(b.visitsOf(['没有的地方']), null, '★ 从未到访如实返回 null（不编造 0）');
    const list = b.visitsList();
    assert.equal(list.length, 1, '到访史列表按场所聚合');
    assert.ok(list[0].count === 2, '列表读数与单点读数同源');
});
test('【A4】★ 在场索引：含层级包含，精确者排前，且绝不模糊匹配', () => {
    const c = new SB.SceneBook();
    c.apply([{ action: 'add', path: ['老城', '钟楼', '顶层'], desc: '塔顶' }], 2);
    c.setPresence('阿沅', ['老城', '钟楼', '顶层'], 2);
    c.setPresence('陆辞', ['老城', '钟楼'], 2);
    assert.equal(c.whereIs('阿沅').key, '老城/钟楼/顶层', '「谁在何处」可读');
    assert.equal(c.whereIs('不存在的人'), null, '★ 不在场如实返回 null（不编「大概在主角身边」）');
    const at = c.presenceAt('老城/钟楼');
    assert.equal(at.length, 2, '★ 在『钟楼›顶层』的人也在『钟楼』这一层（层级包含）');
    assert.equal(at[0].name, '陆辞', '★ 精确者排前（层级包含必须可分，否则两种在场同形）');
    assert.equal(at[0].exact, true, '精确标记如实');
    assert.equal(c.samePlace('阿沅', '陆辞'), true, '★ samePlace 认层级包含（同街区下的两处也算同处）');
    assert.equal(c.samePlace('阿沅', '不存在'), false, '任一不在场 ⇒ false');
    assert.equal(c.setPresence('', ['老城'], 1), false, '空角色名被拒（不静默建空条目）');
    assert.equal(c.findByLeaf('钟楼').key, '老城/钟楼', '按末级名精确定位（状态层的「位置」只有末级名）');
    assert.equal(c.findByLeaf('钟'), null, '★ 不做模糊匹配——猜出来的路径比没有路径更有害');
    assert.equal(c.removePresence('陆辞'), true, '离场可移除');
    assert.equal(c.removePresence('陆辞'), false, '重复移除如实返回 false');
    assert.equal(c.clearPresence(), 1, '清空在场如实回报清掉几条');
});
test('【A5】★ 地点挂账：广度/深度/自述句三个读数都在（「这个地方有多大」）', () => {
    const b = new SB.SceneBook();
    b.apply([
        { action: 'add', path: ['老城', '钟楼', '顶层'], desc: '铜钟' },
        { action: 'add', path: ['老城', '钟楼', '地室'], desc: '铁门' },
        { action: 'add', path: ['老城', '西街'], desc: '夜市' }
    ], 5);
    const o = b.outlineOf(['老城', '钟楼']);
    assert.equal(o.places, 3, '子树场所总数含自身（钟楼 + 顶层 + 地室）');
    assert.equal(o.detailed, 2, '其中已细写的处数');
    assert.equal(o.depth, 1, '子树最大层级差');
    assert.equal(o.self, '钟楼：3 处场所，其中 2 处已细写，最深 1 层', '★ 自述句逐项对得上读数');
    assert.equal(o.leaf, '钟楼', '末级名如实');
    assert.equal(b.outlineOf(['不存在']), null, '★ 不存在的地点返回 null（不编造一个 0）');
    assert.equal(b.outlineOf([]), null, '空路径返回 null');
    assert.equal(b.briefAt(['没有']), null, '以某地为中心的清单读不到时返回 null（不返回半截）');
    assert.ok(/老城\/钟楼\/顶层/.test(b.briefAt(['老城', '钟楼'])), '清单含该地下级');
});
test('【A6】★ 覆盖度：逐楼列号 + 缺口有数 + 未登记到访有名', () => {
    const d = new SB.SceneBook();
    d.apply([{ action: 'add', path: ['甲'], desc: 'x' }], 2);
    d.apply([{ action: 'add', path: ['乙'], desc: 'y' }], 9);
    d.setLocation(3, ['无节点之地']);
    const cov = d.coverage();
    assert.deepEqual(cov.floors, [2, 9], '逐楼列号（可对账）');
    assert.equal(cov.floorCount, 2, '变更楼层数');
    assert.deepEqual(cov.steps, [{ after: 2, before: 9, missing: 6 }], '★ 缺口有数（不是一句「有缺口」）');
    assert.deepEqual(cov.unregistered, ['无节点之地'], '★ 未登记到访有名（有位置无节点）');
    assert.equal(cov.unregisteredCount, 1, '未登记计数与名单同源');
    assert.ok(['ok', 'warn', 'broken'].includes(cov.state), '覆盖度带不变量态');
});
// ══════════ B 不变量三态可达 ══════════
test('【B1】★ 三态互相可达且互不同形：ok / warn / broken 都必须真造得出来', () => {
    const ok = new SB.SceneBook().checkInvariants();
    assert.equal(ok.state, 'ok', '空书 = ok');
    assert.deepEqual(ok.broken, [], 'ok 态无违例');
    const warnBook = new SB.SceneBook();
    warnBook.setLocation(1, ['没登记过的地方']);
    const warn = warnBook.checkInvariants();
    assert.equal(warn.state, 'warn', '★ 有到访无节点 = warn（修前这一态根本不存在）');
    assert.ok(warn.warnings.some(w => w.kind === 'visit-unregistered'), 'warn 态给出可归因的 kind');
    assert.ok(warn.warnings.some(w => w.kind === 'track-unregistered'), '轨迹失联同样成 warn');
    assert.deepEqual(warn.broken, [], 'warn 不得被误报成 broken');
    const brokenBook = new SB.SceneBook();
    brokenBook.nodes.set('伪造/键', { path: ['别的', '路径'], desc: 'x', floor: 1, updatedAt: 1 });
    const broken = brokenBook.checkInvariants();
    assert.equal(broken.state, 'broken', '键与 path 不符 = broken');
    assert.ok(broken.broken.some(b => b.kind === 'key-path-mismatch'), '给出 key-path-mismatch 归因');
    assert.ok(broken.broken.some(b => b.kind === 'broken-chain'), '层级断裂同样归因');
    const three = new Set([ok.state, warn.state, broken.state]);
    assert.equal(three.size, 3, '★ 三态塌缩检测：可达态数必须为 3（塌成两态即本仓库缺陷族）');
});
test('【B2】★ 层级断裂必须被判出来（apply 会补祖先；断裂说明被外部改过）', () => {
    const b = new SB.SceneBook();
    b.apply([{ action: 'add', path: ['甲', '乙', '丙'], desc: 'd' }], 1);
    assert.equal(b.checkInvariants().state, 'ok', '补齐祖先之后无违例');
    b.nodes.delete('甲/乙');
    const iv = b.checkInvariants();
    assert.equal(iv.state, 'broken', '抽掉中间层 ⇒ broken');
    assert.ok(iv.broken.some(x => x.kind === 'broken-chain' && x.missing === '甲/乙'), '缺口有名（指出缺哪一级）');
});
test('【B3】不变量缓存与诊断面：_broken 如实反映最近一次判定', () => {
    const b = new SB.SceneBook();
    b.nodes.set('坏/键', { path: ['好', '路径'], desc: 'x', floor: 1, updatedAt: 1 });
    const iv = b.checkInvariants();
    assert.equal(b._broken, iv.broken, '_broken 缓存与返回值同源（诊断面读的是同一份）');
    const s = b.summary();
    assert.equal(s.coverage.state, 'broken', '快照外供的覆盖度带不变量态');
});
// ══════════ C 三处旧缺陷根除 ══════════
test('【C1】★ 哑雷根除：轨迹切片走显式入参，不再有隐式 _cutoff 状态', () => {
    const code = stripComments(sbSrc);
    assert.ok(!/\?\s*true\s*:\s*false/.test(code), '★ 无「三目优先级错位」的布尔折叠');
    assert.ok(!/\b_cutoff\b/.test(code), '★ 不再依赖隐式 _cutoff 实例状态');
    assert.ok(/rebuildFromOps\(cutoff\)\s*\{/.test(code), 'rebuildFromOps 收显式入参');
    assert.ok(/rollbackFrom\(floor, cutoff\)\s*\{/.test(code), 'rollbackFrom 同样收显式入参');
    // 行为面：cutoff 有值时必须按值过滤，而不是恒真/恒假
    const b = new SB.SceneBook();
    b.apply([{ action: 'add', path: ['a'] }], 1);
    b.setLocation(1, ['a']);
    b.setLocation(5, ['a']);
    b.rebuildFromOps(5);
    assert.deepEqual(b.track.map(t => t.floor), [1], 'cutoff=5 ⇒ 只保留 floor<5 的轨迹（不是全清、也不是全留）');
    const c = new SB.SceneBook();
    c.apply([{ action: 'add', path: ['a'] }], 1);
    c.setLocation(1, ['a']); c.setLocation(5, ['a']);
    c.rebuildFromOps();
    assert.deepEqual(c.track.map(t => t.floor), [1, 5], '缺省 cutoff ⇒ 全保留');
});
test('【C2】★ 到场史只有一个真源：记账口一处，另一处只允许出现在载入路径', () => {
    const code = stripComments(sbSrc);
    const rs = code.indexOf('_recordVisit(key, floor) {');
    const re = code.indexOf('\n    }', rs);
    assert.ok(rs >= 0 && re > rs, '记账单可定位');
    const body = code.slice(rs, re);
    assert.equal((body.match(/this\.visits\.set\(/g) || []).length, 1, '★ 记账单内恰 1 处写源');
    const total = (code.match(/this\.visits\.set\(/g) || []).length;
    const imp = code.indexOf('import(data) {');
    const inImport = (code.slice(imp).match(/this\.visits\.set\(/g) || []).length;
    assert.equal(total, 1 + inImport, '★ 除记账单外只允许载入路径写（多处写源会让读数飘）');
    assert.ok(inImport >= 1, '载入路径确实写入（否则导入的到访史读不出来）');
});
test('【C3】★ 清了必须有人重建：_rebuild 同时重放 opsLog 与 track', () => {
    const code = stripComments(sbSrc);
    const rb = code.slice(code.indexOf('_rebuild() {'), code.indexOf('clear() {'));
    assert.ok(/this\.nodes\.clear\(\)/.test(rb), '_rebuild 清节点派生缓存');
    assert.ok(/this\.visits\.clear\(\)/.test(rb), '★ _rebuild 清到访史（不是清了不管）');
    assert.ok(/for \(const t of \[\.\.\.this\.track\]/.test(rb), '★ 按 track 回填到访史');
    assert.ok(/for \(const e of log\) this\.apply\(e\.ops, e\.floor, true\)/.test(rb), '按 opsLog 重放节点');
    // 删楼回滚不得手动扣减到访史（会被紧随的 _rebuild 覆盖 = 写了等于没写）
    const s = code.indexOf('rollbackFloorOnly(floor) {');
    const e = code.indexOf('rebuildFromOps(cutoff) {');
    assert.ok(s >= 0 && e > s, 'rollbackFloorOnly 段可定位');
    assert.ok(!/visits\.delete|visits\.set|\.count\s*-=|\.count--/.test(code.slice(s, e)),
        '★ 删楼回滚不手动扣减到访史（到场史只能有一个真源）');
    // 行为面：删楼之后轨迹与到访同步回滚（不是只清一半）
    const b = new SB.SceneBook();
    b.apply([{ action: 'add', path: ['楼1'] , desc: 'a' }], 1);
    b.apply([{ action: 'add', path: ['楼3'], desc: 'b' }], 3);
    b.apply([{ action: 'add', path: ['楼5'], desc: 'c' }], 5);
    b.setLocation(1, ['楼1']); b.setLocation(3, ['楼3']); b.setLocation(5, ['楼5']);
    b.rollbackFloorOnly(3);
    assert.equal(b.visitsOf(['楼3']), null, '★ 被删楼的到访读数随之消失（不是旧账影子）');
    assert.ok(b.visitsOf(['楼1']) && b.visitsOf(['楼5']), '未删楼的到访读数保留');
    assert.deepEqual(b.track.map(t => t.floor), [1, 5], '轨迹同步回滚');
});
test('【C4】★ 重建可复现：同一现场重建前后到访读数不得漂', () => {
    const b = new SB.SceneBook();
    b.apply([{ action: 'add', path: ['甲', '乙'], desc: 'd' }], 2);
    b.setLocation(2, ['甲', '乙']);
    b.setLocation(6, ['甲', '乙']);
    const before = JSON.stringify(b.visitsOf(['甲', '乙']));
    b.rollbackFloorOnly(99);              // 触发一次全量重建（不动真源）
    const after = JSON.stringify(b.visitsOf(['甲', '乙']));
    assert.equal(after, before, '★ 重建前后读数一致（口径 = 到访过的不同楼层数）');
    const twice = new SB.SceneBook();
    twice.apply([{ action: 'add', path: ['甲', '乙'], desc: 'd' }], 2);
    twice.setLocation(2, ['甲', '乙']);
    twice.setLocation(6, ['甲', '乙']);
    twice.rollbackFloorOnly(99);
    twice.rollbackFloorOnly(98);
    assert.equal(JSON.stringify(twice.visitsOf(['甲', '乙'])), before, '重建幂等（连做两次读数不变）');
});
// ══════════ D 有界性 ══════════
test('【D1】★ 八个上限常量必须真被消费（不是只声明）', () => {
    for (const [name, re, why] of [
        ['MAX_NODES', /this\.nodes\.size <= MAX_NODES/, '节点裁剪'],
        ['MAX_TRACK', /this\.track\.length > MAX_TRACK/, '轨迹条数上限'],
        ['MAX_OPS', /this\.opsLog\.length > MAX_OPS/, 'opsLog 条数上限'],
        ['MAX_VISIT_KEYS', /this\.visits\.size >= MAX_VISIT_KEYS/, '到访史键上限'],
        ['MAX_VISIT_FLOORS', /v\.floors\.length > MAX_VISIT_FLOORS/, '单键楼层上限'],
        ['MAX_PRESENCE', /this\.presence\.size >= MAX_PRESENCE/, '在场索引上限'],
        ['MAX_SCAN', /scanned >= MAX_SCAN/, '子树遍历读取预算'],
        ['MAX_DESC', /slice\(0, MAX_DESC\)/, '描述字符上限']
    ]) {
        assert.ok(re.test(sbSrc), '★ ' + name + ' 未真被消费（' + why + '）');
    }
});
test('【D2】★ 节点裁剪真生效：超限后节点数收敛到上限附近（不是无界膨胀）', () => {
    const b = new SB.SceneBook();
    for (let i = 0; i < 1200; i++) b.apply([{ action: 'add', path: ['城', 'p' + i], desc: '' }], 1);
    assert.ok(b.nodes.size <= SB.MAX_NODES + 2, '节点 ' + b.nodes.size + ' 收敛到 ' + SB.MAX_NODES + ' 附近');
    assert.ok(b.capacity.dropped > 0, '★ 裁剪如实记账（dropped 不是 0）');
});
test('【D3】描述与路径深度切片：超长描述与超深路径被截断而非报错', () => {
    const b = new SB.SceneBook();
    b.apply([{ action: 'add', path: ['a', 'b', 'c', 'd', 'e', 'f'], desc: 'x'.repeat(500) }], 1);
    assert.equal(SB.MAX_PATH_DEPTH, 4, '路径最大层级为 4');
    assert.equal(b.nodes.has('a/b/c/d'), true, '超深路径被截断到 4 层；截断是有界性、不是失败');
    assert.equal(b.nodes.has('a/b/c/d/e'), false, '第 5 层不登记');
    const long = [...b.nodes.values()].find(n => n.desc);
    assert.equal(long.desc.length, 120, '描述被截到 MAX_DESC=120（内部预算，不进导出面）');
    assert.ok(!('MAX_DESC' in SB), 'MAX_DESC 是内部读取预算，不进导出面（导出面 12 项恒定）');
    assert.equal('MAX_DESC'.length > 0 && b.apply([{ action: 'add', path: ['z'.repeat(300)] }], 1), 1,
        '超长单级名不抛（apply 不因畸形输入中断）');
});
// ══════════ E 接线真被消费 ══════════
test('【E1】★ 宿主 14 处接线逐条在位（声明了却零消费 = 死声明）', () => {
    const both = idxSrc + '\n' + piSrc;
    const wires = [
        ['取库口（真读表达式）', /_moduleLib\(\(\) => window\.LonShaSceneBook, 'scene-book\.js'\)/],
        ['构造封装 _newSceneBook', /function _newSceneBook\(seed\)\s*\{/],
        ['构造器内接线', /this\.scene = _newSceneBook\(\);/],
        ['提取登记 apply', /this\.scene\.apply\(extracted\.scenes, message\.index \|\| 0\)/],
        ['提取落位 setLocation', /const _moved = this\.scene\.setLocation\(message\.index \|\| 0, extracted\.location\);/],
        ['在场写入 setPresence', /this\.scene\.setPresence\(_nm, extracted\.location, message\.index \|\| 0\)/],
        ['注入清单 {{SCENES}}', /\{\{SCENES\}\}/],
        ['注入取 brief', /this\.scene\.brief\(\)/],
        ['编辑回滚走单出口', /this\.scene\.rebuildFromOps\(\);/],
        ['删楼回滚', /this\.scene\.rollbackFloorOnly\(floor\);/],
        ['携带写侧 scenePresence', /scenePresence: \(this\.scene && typeof this\.scene\.export === 'function'\)/],
        ['携带读侧 scenePresence', /pack\.scenePresence/],
        ['快照外供 scene', /const rawScene = \(this\.scene && typeof this\.scene\.summary === 'function'\)/],
        ['诊断行消费 scale/checkInvariants', /this\.scene\.checkInvariants \? this\.scene\.checkInvariants\(\)/]
    ];
    for (const [what, re] of wires) assert.ok(re.test(both), '★ 接线缺失：' + what);
    assert.ok(/scene: deep\(rawScene\)/.test(idxSrc), '快照把 scene 面落进去');
    assert.ok(/scene: this\.scene\.export\(\)/.test(idxSrc), '携带/快照两条路径都真取 export()');
});
test('【E2】★ 走单出口：删楼/编辑回滚都不得再调级联老接口', () => {
    assert.ok(!/this\.scene\.rollbackFrom\(/.test(idxSrc), '★ 级联回滚调用绝迹（改走 rollbackFloorOnly）');
    assert.ok(/this\.scene\.rollbackFloorOnly\(floor\);/.test(idxSrc), '单楼回滚落位');
    assert.ok(/this\.scene\.clearPresence\?\.\(\);/.test(idxSrc), '在场由宿主清理（不由 track/opsLog 派生）');
});
test('【E3】★ 诊断行必须消费六面读数（缺席与树断裂一并报警）', () => {
    assert.ok(/到访 \$\{sc\.visits\} \/ 在场 \$\{sc\.presence\}/.test(idxSrc), '诊段行报 到访/在场');
    assert.ok(/细写 \$\{sc\.detailed\} \/ 最深 \$\{sc\.depth\} 层/.test(idxSrc), '诊断行报 细写/最深');
    assert.ok(/this\.scene\._absent \? ' ⚠️模块缺席'/.test(idxSrc), '★ 模块缺席要在诊断行现身（否则缺席没人知道）');
    assert.ok(/iv\.state === 'broken' \? ' ⚠️树断裂'/.test(idxSrc), 'broken 要报警');
    assert.ok(/iv\.state === 'warn' \? ' ⚠️读数可疑'/.test(idxSrc), 'warn 要报警（两态分别不同字样）');
});
test('【E4】index.js 里不得留第二份 SceneBook 实现（两份实现必然漂移）', () => {
    assert.ok(!/class SceneBook\s*\{/.test(idxSrc), '★ index.js 无第二份实现');
    assert.ok(/this\.scene = _newSceneBook\(\);/.test(idxSrc), '实例字段声明区只放取库结果，接线落构造器内');
});
// ══════════ F 持久化与旧格式兼容 ══════════
test('【F1】★ export/import 往返：六面读数一致（含在场）', () => {
    const a = new SB.SceneBook();
    a.apply([{ action: 'add', path: ['甲', '乙'], desc: 'd' }], 2);
    a.setLocation(2, ['甲', '乙']);
    a.setLocation(4, ['甲', '乙']);
    a.setPresence('阿沅', ['甲', '乙'], 2);
    const dump = a.export();
    const b = new SB.SceneBook(dump);
    assert.equal(JSON.stringify(b.visitsOf(['甲', '乙'])), JSON.stringify(a.visitsOf(['甲', '乙'])), '到访读数往返一致');
    assert.equal(b.whereIs('阿沅').key, '甲/乙', '在场读数往返一致');
    assert.equal(b.nodes.size, a.nodes.size, '节点数往返一致');
    assert.equal(dump.version, SB.SCENE_VERSION, '导出带结构版本（改格式即须同步 CHANGELOG）');
    assert.ok(Array.isArray(dump.nodes) && Array.isArray(dump.visits), '导出的是纯数据（可直接 JSON.stringify）');
});
test('【F2】★ 旧格式（无 visits）导入必须回填到访史——老存档升上来不能是一片空白', () => {
    const a = new SB.SceneBook();
    a.apply([{ action: 'add', path: ['甲', '乙'], desc: 'd' }], 2);
    a.setLocation(2, ['甲', '乙']);
    a.setLocation(4, ['甲', '乙']);
    const dump = a.export();
    const legacy = { nodes: dump.nodes, track: dump.track, opsLog: dump.opsLog };   // v3.180 及以前的形状
    const b = new SB.SceneBook();
    b.import(legacy);
    const v = b.visitsOf(['甲', '乙']);
    assert.ok(v, '★ 有轨迹就有到访（回填生效，而不是到访史是死的）');
    assert.equal(v.count, 2, '回填口径与记账口径一致（不同楼层数）');
    assert.equal(v.firstFloor, 2, '首次到访楼层从轨迹推得');
    assert.equal(b.presence.size, 0, '旧格式无在场面 ⇒ 空（不编造）');
});
test('【F3】畸形输入一律不抛，且如实返回结构', () => {
    const b = new SB.SceneBook();
    assert.doesNotThrow(() => b.import(null), 'import(null) 不抛');
    assert.doesNotThrow(() => b.import({ nodes: '怪类型', track: 42, opsLog: null }), '字段类型怪也不抛');
    assert.equal(b.nodes.size, 0, '怪输入按空处理（不伪造）');
    assert.equal(b.visitsOf(['x']), null, '未到访仍如实 null');
    assert.doesNotThrow(() => new SB.SceneBook({ track: 1, nodes: 2 }), '构造器喂畸形 seed 不抛');
    assert.equal(new SB.SceneBook().summary().empty, true, '空书 summary.empty = true');
    assert.equal(b.scale().nodes, 0, 'scale 如实为 0');
});
// ══════════ G 缺席退路同形 ══════════
test('【G1】★ 缺席退路与真实现同形：12 个同位方法一个不缺，且都如实回报「没有」', () => {
    assert.ok(/class SceneBookFallback\s*\{/.test(idxSrc), '退路存在');
    for (const m of ['apply', 'setLocation', 'setPresence', 'removePresence', 'clearPresence', 'presenceAt',
        'whereIs', 'samePlace', 'findByLeaf', 'currentKey', 'currentChain', 'chainOf', 'history',
        'trackByPlace', 'visitsOf', 'visitsList', 'outlineOf', 'scale', 'currentLine', 'brief', 'briefAt',
        'coverage', 'checkInvariants', 'rollbackFrom', 'rollbackFloorOnly', 'rebuildFromOps', 'clear',
        'export', 'import', 'summary']) {
        assert.ok(new RegExp('\\b' + m + '\\(\\)?[^)]*\\)\\s*\\{').test(idxSrc)
            || new RegExp('\\b' + m + '\\([^)]*\\)\\s*\\{').test(idxSrc),
            '★ 退路缺同形方法：' + m + '（调用方会在模块缺席时外抛）');
    }
    assert.ok(/_absent = true/.test(idxSrc), '退路标记缺席');
    assert.ok(/state: 'absent'/.test(idxSrc), '★ 缺席的覆盖度/不变量态是 absent，不得与 ok 同形');
    assert.ok(/absent: true/.test(idxSrc), '导出面也标 absent');
});
test('【G2】★ 缺席退路不得伪造「能写不能读」的世界（读侧一律空/假）', () => {
    // 段锚点用类名（'[v2.2] RC: 悬念簿' 这类注记在文件前部也出现过，indexOf 会取到更早的位置而切出空段）
    const at = idxSrc.indexOf('class SceneBookFallback');
    const end = idxSrc.indexOf('class SuspenseBook', at);
    assert.ok(at > 0 && end > at, '退路段可定位（at=' + at + ' end=' + end + '）');
    const seg = idxSrc.slice(at, end);
    assert.ok(seg.length > 800, '退路段长度为实（' + seg.length + ' 字符）');
    assert.ok(/whereIs\(\) \{ return null; \}/.test(seg), 'whereIs 退路返回 null（不是编一个位置）');
    assert.ok(/visitsOf\(\) \{ return null; \}/.test(seg), 'visitsOf 退路返回 null');
    assert.ok(/outlineOf\(\) \{ return null; \}/.test(seg), 'outlineOf 退路返回 null（不编 0）');
    assert.ok(/findByLeaf\(\) \{ return null; \}/.test(seg), 'findByLeaf 退路返回 null');
    assert.ok(/brief\(\) \{ return '（暂无已登记场景）'; \}/.test(seg), 'brief 退路给占位句（与空树同形）');
    assert.ok(/apply\(\) \{ return 0; \}/.test(seg), 'apply 退路返回 0（不假装写了）');
});
// ══════════ H 对外只读口 ══════════
test('【H1】★ 资源清单 13 项冻结 + 单一实现（scene 已入清单）', () => {
    assert.ok(Object.isFrozen(PI.RESOURCES), '资源清单被冻结（不可被外部改写）');
    assert.equal(PI.RESOURCES.length, 13, '★ 资源清单 13 项（v3.181 新增 scene）');
    assert.ok(PI.RESOURCES.includes('scene'), '新资源 scene 在清单里');
    assert.equal(new Set(PI.RESOURCES).size, PI.RESOURCES.length, '无重复项');
    const uses = (piSrc.match(/RESOURCES/g) || []).length;
    assert.ok(uses >= 3, '★ 单一实现：斜杠 enumList / 宏表 / queryResource 共用同一份清单（不复述）');
});
test('【H2】★ scene 资源按快照真取到值；非法格式浮到用户面前', () => {
    const snap = { scene: { nodes: 3 }, floor: 7 };
    assert.deepEqual(PI.queryResource(snap, 'scene'), { nodes: 3 }, 'scene 从快照取值');
    assert.deepEqual(PI.queryResource(snap, 'SCENE'), { nodes: 3 }, '资源名大小写不敏感');
    assert.equal(PI.queryResource(snap, '不存在的资源'), undefined, '未知名如实 undefined');
    assert.equal(PI.queryResource(null, 'scene'), null, '空快照返回 null（snap && snap.scene 的短路语义，不抛）');
    assert.equal(PI.formatResult(undefined, 'json'), 'null', 'undefined 走 json 也如实成 null 字符串（不抛）');
    assert.doesNotThrow(() => PI.formatResult(PI.queryResource(snap, 'scene'), 'text'), 'text 格式化不抛');
    assert.throws(() => PI.formatResult(1, 'yaml'), TypeError, '★ 非法 format 抛 TypeError（不静默回退 json）');
});
// ══════════ I 负控制 ══════════
function mk(src, anchor, repl, tag) {
    const hits = src.split(anchor).length - 1;
    assert.equal(hits, 1, tag + '：锚点须恰中 1 次（实 ' + hits + '）——锚点漂移即判据失效');
    return src.split(anchor).join(repl);
}
/** 六面判据（真行为驱动）：每条判据对应一个可被破坏的观测面。 */
function judgeFaces(M2) {
    const SBx = M2.SceneBook;
    const out = {};
    // 树：祖先补齐 + 不编造当前位置
    const t = new SBx();
    t.apply([{ action: 'add', path: ['老城', '钟楼', '顶层'], desc: '铜钟' }], 5);
    out.treeAncestors = t.nodes.has('老城') && t.nodes.has('老城/钟楼');
    out.noFabricatedCurrent = t.currentKey() === null;
    // 到访史：同楼覆盖不重复计
    const v = new SBx();
    v.apply([{ action: 'add', path: ['城', '店'], desc: 'd' }], 3);
    v.setLocation(3, ['城', '店']);
    v.setLocation(3, ['城', '店']);
    v.setLocation(7, ['城', '店']);
    const vv = v.visitsOf(['城', '店']);
    out.visitDistinctFloors = !!vv && vv.count === 2 && vv.firstFloor === 3 && vv.lastFloor === 7;
    // 在场：whereIs 读得出 + 层级包含 + 精确者排前
    const p = new SBx();
    p.apply([{ action: 'add', path: ['老城', '钟楼', '顶层'], desc: '塔顶' }], 2);
    p.setPresence('阿沅', ['老城', '钟楼', '顶层'], 2);
    p.setPresence('陆辞', ['老城', '钟楼'], 2);
    out.presenceReadable = !!p.whereIs('阿沅') && p.whereIs('阿沅').key === '老城/钟楼/顶层';
    out.presenceHierarchic = p.samePlace('阿沅', '陆辞') === true && p.presenceAt('老城/钟楼').length === 2
        && p.presenceAt('老城/钟楼')[0].exact === true;
    // 挂账：广/深/细写 + 自述句
    const o = t.outlineOf(['老城', '钟楼']);
    out.outlineShape = !!o && o.places === 2 && o.detailed === 1 && o.depth === 1 && /处场所/.test(o.self);
    // 覆盖度：逐楼列号 + 缺口有数 + 未登记有名
    const c = new SBx();
    c.apply([{ action: 'add', path: ['甲'], desc: 'x' }], 2);
    c.apply([{ action: 'add', path: ['乙'], desc: 'y' }], 9);
    c.setLocation(3, ['无节点之地']);
    const cv = c.coverage();
    out.coverageHonest = Array.isArray(cv.floors) && cv.floors.length === 2
        && cv.steps.length === 1 && cv.steps[0].missing === 6 && cv.unregistered.length === 1;
    // 不变量三态
    const okB = new SBx(), warnB = new SBx(), brkB = new SBx();
    warnB.setLocation(1, ['没登记过']);
    brkB.nodes.set('伪造/键', { path: ['别的', '路径'], desc: 'x', floor: 1, updatedAt: 1 });
    const three = new Set([okB.checkInvariants().state, warnB.checkInvariants().state, brkB.checkInvariants().state]);
    out.threeStates = three.size === 3;
    // 旧缺陷③：重建同时重放（删楼后读数不飘）
    const r = new SBx();
    r.apply([{ action: 'add', path: ['甲', '乙'], desc: 'd' }], 2);
    r.setLocation(2, ['甲', '乙']);
    r.setLocation(6, ['甲', '乙']);
    const before = JSON.stringify(r.visitsOf(['甲', '乙']));
    r.rollbackFloorOnly(99);
    out.rebuildReproducible = before === JSON.stringify(r.visitsOf(['甲', '乙']));
    // ★ 可观测面：删楼之后被删楼的到访读数必须随之消失（未删楼保留）
    //   为什么单列一条：'不动真源的重建' 读数不变，恰好是 F5 型破坏（清了没人重建）观测不到的地方。
    const rb = new SBx();
    rb.apply([{ action: 'add', path: ['甲', '乙'], desc: 'd' }], 2);
    rb.apply([{ action: 'add', path: ['丙', '丁'], desc: 'e' }], 6);
    rb.setLocation(2, ['甲', '乙']);
    rb.setLocation(6, ['丙', '丁']);
    rb.rollbackFloorOnly(6);
    out.visitRolledBack = rb.visitsOf(['丙', '丁']) === null && !!rb.visitsOf(['甲', '乙']);
    // 有界
    const bd = new SBx();
    for (let i = 0; i < 1200; i++) bd.apply([{ action: 'add', path: ['城', 'p' + i], desc: '' }], 1);
    out.bounded = bd.nodes.size <= M2.MAX_NODES + 2;
    return out;
}
function brokenCopies() {
    return [
        {
            tag: 'F1-dud-boolean', what: '哑雷回归：显式入参退回三目优先级错位的布尔折叠',
            src: mk(sbSrc,
                '        if (Number.isFinite(Number(cutoff))) this.track = this.track.filter(t => t.floor < Number(cutoff));',
                '        this.track = this.track.filter(t => t.floor < (cutoff || 0) || cutoff === undefined ? true : false);',
                'F1')
        },
        {
            tag: 'F2-implicit-cutoff', what: '隐式状态回归：轨迹切片重新依赖实例上的 _cutoff',
            src: mk(sbSrc,
                '        if (Number.isFinite(Number(cutoff))) this.track = this.track.filter(t => t.floor < Number(cutoff));',
                '        if (this._cutoff === undefined) this._cutoff = cutoff;',
                'F2')
        },
        {
            tag: 'F3-second-writer', what: '到场史第二写源：记账单里再塞一处 visits.set',
            src: mk(sbSrc,
                '            v.count++;                       // 去重计数：只有「又去了一个别的楼层」才算再次到访',
                '            v.count++; this.visits.set(key, v);',
                'F3')
        },
        {
            tag: 'F4-manual-decrement', what: '删楼回滚手动扣减到访史（与 _rebuild 双写源）',
            src: mk(sbSrc,
                '        this.track = this.track.filter(t => t.floor !== f);',
                "        this.track = this.track.filter(t => t.floor !== f); this.visits.delete('x');",
                'F4')
        },
        {
            tag: 'F5-clear-without-rebuild', what: '清了却没人重建：_rebuild 不再清/重建到访史',
            src: mk(sbSrc,
                '        this.nodes.clear();\n        this.visits.clear();',
                '        this.nodes.clear();',
                'F5')
        },
        {
            tag: 'F6-presence-stub', what: '在场面空转：whereIs 恒 null（方法在位但答不出）',
            src: mk(sbSrc,
                '    whereIs(name) {\n        const rec = this.presence.get(trim(name));\n        if (!rec) return null;\n        return { name: trim(name), key: rec.key, path: rec.path || [], atFloor: rec.atFloor };\n    }',
                '    whereIs(name) { return null; }',
                'F6')
        },
        {
            tag: 'F7-two-states', what: '三态塌两态：checkInvariants 恒返 ok',
            src: mk(sbSrc,
                "        return { state: broken.length ? 'broken' : (warnings.length ? 'warn' : 'ok'), broken, warnings };",
                "        return { state: 'ok', broken, warnings };",
                'F7')
        },
        {
            tag: 'F8-no-ancestors', what: '层级断裂：apply 不再补齐祖先',
            src: mk(sbSrc,
                '                for (const pk of ancestorsOf(path)) {',
                '                for (const pk of []) {',
                'F8')
        }
    ];
}
test('【I1】负控制·原版对照：全部判据在真源码上必须干净（否则「破坏翻红」不可归因）', () => {
    const f = judgeFaces(SB);
    assert.equal(f.treeAncestors, true, '原版：祖先补齐');
    assert.equal(f.noFabricatedCurrent, true, '原版：不编造当前位置');
    assert.equal(f.visitDistinctFloors, true, '原版：到访按不同楼层数计');
    assert.equal(f.presenceReadable, true, '原版：whereIs 可读');
    assert.equal(f.presenceHierarchic, true, '原版：层级包含 + 精确者排前');
    assert.equal(f.outlineShape, true, '原版：挂账广/深/细写与自述句');
    assert.equal(f.coverageHonest, true, '原版：覆盖度有数有名');
    assert.equal(f.threeStates, true, '原版：三态互不同形');
    assert.equal(f.rebuildReproducible, true, '原版：重建可复现');
    assert.equal(f.visitRolledBack, true, '原版：删楼后该楼到访读数随之消失（未删楼保留）');
    assert.equal(f.bounded, true, '原版：有界');
});
test('【I2】★ 负控制：八组真源码破坏逐项现形，且互不掩护', () => {
    const seen = {};
    for (const v of brokenCopies()) seen[v.tag] = judgeFaces(loadSBFrom(v.src));
    assert.equal(seen['F1-dud-boolean'].rebuildReproducible, true, 'F1 只把切片改错，不动重建（口径分离）');
    assert.equal(seen['F2-implicit-cutoff'].threeStates, true, 'F2 不连坐三态');
    assert.equal(seen['F3-second-writer'].visitDistinctFloors, true, 'F3 破坏的是写源数，不是读数（读数仍对）');
    assert.equal(seen['F4-manual-decrement'].rebuildReproducible, true, 'F4 手动扣减不改变读数（写了等于没写 ⇒ 只能靠源码形态判据抓，见 I3）');
    assert.equal(seen['F5-clear-without-rebuild'].visitRolledBack, false, '★ F5 破坏后：删楼后该楼到访读数仍是旧账影子（清了没人重建）');
    assert.equal(seen['F5-clear-without-rebuild'].rebuildReproducible, true, 'F5 在「不动真源」的观测面上不可见（判据面须覆盖可观测的那一面）');
    assert.equal(seen['F6-presence-stub'].presenceReadable, false, '★ F6 破坏后：whereIs 答不出所在');
    assert.equal(seen['F6-presence-stub'].presenceHierarchic, false, 'F6 连带层级包含失守（同一处判据的两个观测面）');
    assert.equal(seen['F6-presence-stub'].treeAncestors, true, 'F6 不连坐树判据');
    assert.equal(seen['F7-two-states'].threeStates, false, '★ F7 破坏后：三态塌两态');
    assert.equal(seen['F7-two-states'].coverageHonest, true, 'F7 不连坐覆盖度（三态口径与列号是两件事）');
    assert.equal(seen['F8-no-ancestors'].treeAncestors, false, '★ F8 破坏后：祖先不再补齐（层级断裂）');
    assert.equal(seen['F8-no-ancestors'].threeStates, true, 'F8 不连坐三态判据（空书仍 ok）');
});
test('【I3】★ 负控制·源码形态判据：真破坏必报（形态面与行为面互补）', () => {
    const code = (src) => stripComments(src);
    // 原版：形态判据干净（非恒真）
    assert.ok(!/\?\s*true\s*:\s*false/.test(code(sbSrc)), '原版无三目错位');
    assert.ok(!/\b_cutoff\b/.test(code(sbSrc)), '原版无隐式 _cutoff');
    assert.equal((code(sbSrc).match(/this\.visits\.set\(/g) || []).length, 2, '原版：记账单 1 + 载入路径 1');
    // ① 三目错位必须被形态判据抓到
    const c1 = code(mk(sbSrc,
        '        if (Number.isFinite(Number(cutoff))) this.track = this.track.filter(t => t.floor < Number(cutoff));',
        '        this.track = this.track.filter(t => t.floor < (cutoff || 0) || cutoff === undefined ? true : false);',
        'I3-1'));
    assert.ok(/\?\s*true\s*:\s*false/.test(c1), '★ 破坏后形态判据必须报出三目错位');
    // ② 隐式 _cutoff 必须被抓到
    const c2 = code(mk(sbSrc,
        '        if (Number.isFinite(Number(cutoff))) this.track = this.track.filter(t => t.floor < Number(cutoff));',
        '        if (this._cutoff === undefined) this._cutoff = cutoff;',
        'I3-2'));
    assert.ok(/\b_cutoff\b/.test(c2), '★ 破坏后形态判据必须报出隐式状态');
    // ③ 第二写源必须被抓到
    const c3 = code(mk(sbSrc,
        '            v.count++;                       // 去重计数：只有「又去了一个别的楼层」才算再次到访',
        '            v.count++; this.visits.set(key, v);',
        'I3-3'));
    assert.equal((c3.match(/this\.visits\.set\(/g) || []).length, 3, '★ 破坏后写源数 3 ≠ 记账单 1 + 载入 1');
});
test('【I4】★ 判据纯度两向自证：注释里的旧写法不得误报，真破坏必报', () => {
    // ① stripComments 真跑：注释内容被清、代码保留
    const sample = "const a = 1; // 旧写法：t.floor < (this._cutoff || 0) || this._cutoff === undefined ? true : false\n"
        + "/* 块注释里的 ? true : false 与 _cutoff 也必须被清 */\n"
        + "const b = 'this._cutoff 在字符串里';\nconst c = 3;";
    const out = stripComments(sample);
    assert.ok(!/_\s?_cutoff/.test(out.replace(/'[^']*'/g, '')), '注释里的 _cutoff 被清除');
    assert.ok(!/\?\s*true\s*:\s*false/.test(out.replace(/'[^']*'/g, '')), '注释里的三目错位被清除');
    assert.ok(out.includes('const a = 1;') && out.includes('const c = 3;'), '非注释代码保留');
    // ② 只在注释里写回旧写法 ⇒ 形态判据必须仍然判「干净」（不得误报）
    const commentOnly = mk(sbSrc, '    rebuildFromOps(cutoff) {',
        '    // 旧写法（已修）：t.floor < (this._cutoff || 0) || this._cutoff === undefined ? true : false\n'
        + '    rebuildFromOps(cutoff) {', 'I4-2');
    const cc = stripComments(commentOnly);
    assert.ok(!/\?\s*true\s*:\s*false/.test(cc), '★ 注释里的旧写法不误报（形态判据读注释 = 判据失效）');
    assert.ok(!/\b_cutoff\b/.test(cc), '★ 注释里的 _cutoff 不误报');
    assert.notEqual(commentOnly, sbSrc, '破坏确实改了源码（只是改在注释里）');
    // ③ 反向：真代码坏、注释干净 ⇒ 必须报（两向夹逼）
    const realBad = stripComments(mk(sbSrc,
        '        if (Number.isFinite(Number(cutoff))) this.track = this.track.filter(t => t.floor < Number(cutoff));',
        '        if (this._cutoff === undefined) this._cutoff = cutoff;',
        'I4-3'));
    assert.ok(/\b_cutoff\b/.test(realBad), '★ 真代码里的隐式状态必报');
    // ④ 破坏表须与原版不同，且 tag 不重复、意图有说明
    const ORIG = sbSrc;
    const tags = new Set();
    for (const v of brokenCopies()) {
        assert.ok(!tags.has(v.tag), '破坏 tag 不得重复：' + v.tag);
        tags.add(v.tag);
        assert.notEqual(v.src, ORIG, v.tag + ' 必须真的改了源码');
        assert.ok(/[^\s]/.test(v.what), v.tag + ' 必须说明破坏意图');
        assert.doesNotThrow(() => new Function('module', 'window', 'globalThis', v.src), v.tag + ' 破坏副本须语法合法');
    }
    assert.equal(tags.size, 8, '破坏组数（8 组）');
});
// ══════════ J 发布卫生 ══════════
test('【J1】版本三源一致且不低于 v3.186.0', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
    assert.equal(v, manifest.version, 'manifest follows index.js');
    assert.equal(v, pkg.version, 'package follows index.js');
    assert.ok(vnum(v) >= vnum('3.188.0'), 'index.js 版本 ' + v + ' >= 3.186.0');
    const top = changelog.split('\n').filter(l => l.startsWith('## v'))
        .map(l => l.slice(4).trim()).sort((a, b) => vnum(b) - vnum(a))[0];
    assert.equal(top, v, '★ CHANGELOG 顶节是本版（highest section is the released version）');
    assert.ok(/场所图景/.test(changelog.split('## v3.180.0')[0]), '顶节记录本版主题');
});
test('【J2】模块已注册 extra_js，且结构版本/键名与快照同源', () => {
    assert.ok(manifest.extra_js.includes('scene-book.js'), 'scene-book.js 已注册 extra_js');
    assert.equal(SB.SCENE_KEY, 'lonsha_scene', '附注键（改此即持久化格式变化，须同步 CHANGELOG）');
    assert.equal(SB.SCENE_VERSION, 1, '结构版本');
    assert.ok(/global\.LonShaSceneBook = Object\.freeze\(api\)/.test(sbSrc), '挂全局符号（宿主按真读表达式取库）');
    assert.ok(/module\.exports = api;/.test(sbSrc), '双导出（IIFE 契约）');
});
test('【J3】★ 配套审计与负控制脚本在位，且审计在健康树上真跑绿', () => {
    assert.ok(fs.existsSync(AUDIT), '审计脚本在位');
    assert.ok(fs.existsSync(NEGCTL), '负控制脚本在位');
    assert.ok(/process\.exit\(1\)/.test(fs.readFileSync(AUDIT, 'utf8')), '审计具备 exit 1（真缺陷）');
    assert.ok(/process\.exit\(2\)/.test(fs.readFileSync(AUDIT, 'utf8')), '审计具备 exit 2（结构漂移）');
    const r = spawnSync(process.execPath, [AUDIT], { cwd: REPO, encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0, '审计在健康树上 exit 0（stderr: ' + String(r.stderr || '').slice(0, 300) + '）');
    assert.ok(/六面可读/.test(r.stdout), '审计出一句可读的结论');
    const runner = fs.readFileSync(path.join(REPO, 'tests', 'run.mjs'), 'utf8');
    assert.ok(/readdirSync\(AUDIT_DIR\)\.filter\(f => f\.endsWith\('\.mjs'\)\)/.test(runner),
        '★ 审计按目录自动发现（新脚本无需登记）');
});
test('【J4】scene-book.js 结构自洽：导出面 12 项 + 类可构造 + 常量齐备', () => {
    for (const k of ['SCENE_KEY', 'SCENE_VERSION', 'MAX_PATH_DEPTH', 'MAX_NODES', 'MAX_BRIEF_LINES',
        'SceneBook', 'keyOf', 'partsOfKey', 'partsOf', 'leafOf', 'ancestorsOf', 'describeShape']) {
        assert.ok(k in SB, '导出面缺 ' + k);
    }
    assert.equal(typeof SB.SceneBook, 'function', 'SceneBook 是可构造的类');
    assert.equal(typeof SB.SceneBook.keyOf, 'function', '静态口径 keyOf 在位（index.js 按其引用）');
    assert.equal(SB.keyOf(['a', 'b']), 'a/b', 'keyOf 派生键');
    assert.deepEqual(SB.ancestorsOf(['a', 'b', 'c']), ['a', 'a/b'], '祖先由粗到细');
    assert.equal(SB.leafOf(['a', 'b']), 'b', '末级名');
    assert.deepEqual(SB.partsOfKey('a/b/c'), ['a', 'b', 'c'], '键反向解析（不做深度截断）');
    assert.ok(sbSrc.split('\n').length > 600, '模块行数 > 600（防被静默截断）');
});
