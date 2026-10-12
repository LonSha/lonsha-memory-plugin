/* ============================================================
 * tests/v3325_d_pack_memory_center_pages.test.mjs — [v3.325.0 · M3-O8] D 包记忆侧收口：
 *   记忆控制中心从**技术表**变成**可操作资料页**（15 条 test，含 12 条真源码破坏负控制）
 *
 * 【本套件要证明的六件事（不是「函数返回了对象」）】
 *   ① **普通用户不必认识内部账名**：资料页按**人物 / 事件 / 时间**三轴组织，
 *      行可同时属于多张（**不合并成一张合著页**）；技术账名不当主标签（单列 technical）；
 *      没楼层落「时间未知」一张页（**判不了与没有不同形**）；
 *      **没命中 ⇒ 无资料页**（不是「归不了类」）—— 两档 reason 分开。
 *   ② **看得到原文与修订链**：详情里正文**三档可分** ——
 *      `ledger-source`（宿主读口现取的真原文）/ `projection`（投影面摘要，**不是全文**）/
 *      `masked*`（受限正文保持遮蔽，**一格不带**）；且**取不到**（source-failed）与
 *      **没接读口**（projection）不同形。修订链把 `counter`（浅链）与 `versioned`
 *      （换代链）**分开说**：链 absent / empty / unknown 三态互不同形，
 *      **绝不拿浅链冒充换代信息**。
 *   ③ **批量操作有影响预览**：三档（保留 / 隐藏于生成 / 撤回）的影响面**不在这里编** ——
 *      从 `fact-lifecycle.RULES` / `ACTION_SPEC` 真读（撤回含 `delete-source` ⇒
 *      **可逆 0 / 不可逆 N**，用户在执行前就看得见）；未知动作 / 未选条 / 生命周期缺席 /
 *      不在本页 **四态各自具名**；★ **失败后未完成选择仍在选区里**（验收原文那一句的落点）。
 *   ④ **进出详情保留筛选和页码**：`navigate()` 只动组织轴与详情位，
 *      条件与页码逐字不变（并**回报 kept**：看不见回报时「保留」与「被静默重置」同形）。
 *   ⑤ **零写**：资料页 / 详情 / 链 / 批量预览 / 选区 —— 全程宿主账本逐字节相同。
 *   ⑥ **宿主与面板逐符号在场**：两出口（真原文取数口 / 事实账读口）+ 可选依赖装配
 *      （缺席即降级并具名、**不进 REQUIRED_DEPS**）+ 组织层交互（面板不重建状态）。
 *
 * 负控制一律：**真源码破坏**（锚点恰中 1 次）→ 在**破坏副本**上重跑**同款真判据** → 必须现形；
 *   并反向对照「原版同判据必须通过」。期望值全部由 `tools/v3325_probe.mjs` 的真跑读数写成。
 * 【当版锚点】形态按本仓 V4 惯例：**本档自锚常量 + vnum**（锚必须住在当版档案里）。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { breakOnce } from './_break_kit.mjs';
import { stripComments } from './_audit_lib.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const require_ = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const MOD = 'memory-center.js';
const MOD_SRC = read(MOD);
const SELF_REL = 'tests/v3325_d_pack_memory_center_pages.test.mjs';
const SELF = read(SELF_REL);
const IDX = read('index.js');
const UI = read('settings-ui.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const C = require_(path.join(R, MOD));
const Q = require_(path.join(R, 'evidence-query.js'));
const W = require_(path.join(R, 'evidence-workbench.js'));
const FL = require_(path.join(R, 'fact-lifecycle.js'));
const FV = require_(path.join(R, 'fact-version.js'));
const FS = require_(path.join(R, 'fact-state.js'));
/* ── 夹具（与探针完全同形；期望值来自真跑读数） ── */
const APIS = {};
for (const s of W.LEDGERS) APIS[s.id] = {};
function hostOf() {
    return {
        worldProg: {
            commitmentLedger: { items: [
                { id: 'cm1', actor: '苏晴', counterpart: '林一', content: '住=老城', status: 'open', floor: 3, updatedFloor: 4, revision: 2 },
                { id: 'cm2', actor: '林一', counterpart: '阿青', content: '第二件', status: 'done', floor: 25, updatedFloor: 25, revision: 1 }
            ] },
            seedLedger: { items: [{ id: 's1', hook: '零楼伏笔', source: 'seedLedger', status: 'open', floor: 0, updatedFloor: 0, revision: 1 }] },
            parallelLedger: { items: [{ id: 'p1', title: '无楼层的事', who: [], status: 'open' }] },
            secretLedger: { items: [{ id: 'k1', keeper: '苏晴', secret: '她其实在躲', status: 'open', floor: 7 }] },
            recallEcho: null, echoLedger: null
        },
        _factVersionState: { facts: [
            { id: 'f1', subject: '苏晴', predicate: '住', value: '老城', origin: 'dialog', status: 'active', from: 1, to: 5, floor: 1, revision: 1 },
            { id: 'f2', subject: '苏晴', predicate: '住', value: '新城', origin: 'dialog', status: 'active', from: 6, to: null, floor: 6, revision: 2 }
        ] },
        _eventThreadState: { events: [] },
        _repairState: { repairs: [] }
    };
}
const HOST = hostOf();
const depsOf = (over) => Object.assign({
    query: Q.query, normalizeSpec: Q.normalizeSpec, upsertSaved: Q.upsertSaved,
    removeSaved: Q.removeSaved, replaySaved: Q.replaySaved, FILTERS: Q.FILTERS, LEDGERS: W.LEDGERS,
    FACT_LIFECYCLE: { RULES: FL.RULES, ACTION_SPEC: FL.ACTION_SPEC, DISPOSITIONS: FL.DISPOSITIONS },
    FACT_STATE: FS, versionsOf: FV.versionsOf, factState: () => HOST._factVersionState
}, over || {});
const baseState = () => Object.assign(C.blankState(), { actor: '苏晴', ledgers: ['commitment', 'seed'], page: 2, text: '住' });
const run = (o, opt, d) => C.dispatch(d || depsOf(), Object.assign(C.blankState(), o),
    Object.assign({ host: HOST, apis: APIS }, opt || {}));
/* ── 判据 ── */
/** A：资料页三轴组织（真跑读数：7 张 / 人物 3 / 技术 0）。 */
function judgeProfiles(Cx, deps) {
    const f = Cx.dispatch(deps, Cx.blankState(), { host: HOST, apis: APIS });
    const pf = f.profiles;
    if (!pf) return '必须产出 profiles（资料页组织面）';
    if (pf.kind !== 'memory-center-profiles') return 'profiles.kind 须自证形态';
    if (pf.count !== 7 || pf.total !== 7) return '7 条命中须出 7 张资料页（真跑读数），实 ' + pf.count + '/' + pf.total;
    if (pf.personCount !== 3 || pf.technicalCount !== 0) return '人物页 3 / 技术页 0（真跑读数），实 ' + pf.personCount + '/' + pf.technicalCount;
    const keys = pf.pages.map((p) => p.kind + '|' + p.label + '|' + p.count);
    const want = ['person|苏晴|4', 'person|林一|2', 'time|第 0-19 楼|5', 'person|阿青|1', 'time|第 20-39 楼|1',
        'time|时间未知（未归到任何时段）|1', 'event|伏笔|1'];
    if (JSON.stringify(keys) !== JSON.stringify(want)) return '资料页逐张须与真跑读数一致，实 ' + JSON.stringify(keys);
    const su = pf.pages.filter((p) => p.kind === 'person' && p.label === '苏晴')[0];
    const lin = pf.pages.filter((p) => p.kind === 'person' && p.label === '林一')[0];
    if (!su || !lin) return '两位参与者必须各出一张人物页（**不合并成一张合著页**）';
    if (su.refs.indexOf('commitment:cm1') < 0 || lin.refs.indexOf('commitment:cm1') < 0) {
        return '同一条行须同时进两张人物页（行可属于多张）';
    }
    const unknown = pf.pages.filter((p) => p.kind === 'time' && p.label.indexOf('时间未知') >= 0)[0];
    if (!unknown) return '没楼层的行须落「时间未知」一张页（判不了 ≠ 没有）';
    if (unknown.refs.indexOf('parallel:p1') < 0) return '「时间未知」页须真含那条无楼层行';
    const e = Cx.dispatch(deps, Object.assign(Cx.blankState(), { text: '绝对不存在的词ZZZ' }), { host: HOST, apis: APIS });
    if (e.view !== 'empty') return '无命中须仍落 empty（真跑读数）';
    if (e.profiles.pages.length !== 0 || e.profiles.count !== 0) return '无命中不得产出资料页';
    if (e.profiles.note.indexOf('不是「归不了类」') < 0) return '无命中与「归不了类」必须分开说（两档 reason 不同形）';
    if (pf.note.indexOf('判不了的一项单列') < 0) return '有资料页时须说明判不了项单列';
    const techno = Cx.buildProfiles([{ ref: 'x:1', ledger: 'x', ledgerLabel: 'X', title: 't', floor: 1, actors: [{ field: 'actor', name: 'actor_id_1' }] }], {});
    if (!techno.pages[0] || techno.pages[0].technical !== true) return '技术账名（下划线 / 无中文）须标 technical（不当人物资料页）';
    if (techno.technicalCount !== 1) return '技术页须单列计数（真读数）';
    return '';
}
/** B：详情面（正文三档 + 参与者 + 遮蔽一格不带）。 */
function judgeDetail(Cx, deps) {
    const f = Cx.dispatch(deps, Object.assign(Cx.blankState(), { ledgers: ['commitment'], text: '住=老城', detail: 'commitment:cm1' }), { host: HOST, apis: APIS });
    const dt = f.detailFace;
    if (!dt) return '有详情位且行在本页 ⇒ 必须产出 detailFace';
    if (dt.ref !== 'commitment:cm1') return 'detailFace 须指向该行';
    if (dt.kind !== 'memory-center-detail') return 'detailFace.kind 须自证形态';
    if (dt.bodyState !== 'visible' || dt.textChannel !== 'projection') {
        return '未接原文读口时须落 visible/projection（真跑读数），实 ' + dt.bodyState + '/' + dt.textChannel;
    }
    if (dt.textTruncated !== true) return '投影摘要必须显式标 textTruncated（摘要不得冒充全文）';
    if (dt.note.indexOf('不是全文') < 0) return 'projection 档须自述「不是全文」';
    if (dt.actors.length !== 2) return '参与者须逐条列出（真读数 2）';
    const ok = Cx.dispatch(depsOf({ textSource: () => ({ ok: true, text: '真原文（宿主现取）', field: 'content' }) }),
        Object.assign(Cx.blankState(), { detail: 'commitment:cm1', ledgers: ['commitment'] }), { host: HOST, apis: APIS });
    if (ok.detailFace.textChannel !== 'ledger-source' || ok.detailFace.text !== '真原文（宿主现取）') {
        return '原文读口成功须走 ledger-source 并逐字用其 text，实 ' + ok.detailFace.textChannel;
    }
    if (ok.detailFace.textTruncated !== false || ok.detailFace.sourceField !== 'content') return 'ledger-source 档不得标截断、须带来源字段';
    const bad = Cx.dispatch(depsOf({ textSource: () => ({ ok: false, reason: 'not-found' }) }),
        Object.assign(Cx.blankState(), { detail: 'commitment:cm1', ledgers: ['commitment'] }), { host: HOST, apis: APIS });
    if (bad.detailFace.textChannel !== 'source-failed' || bad.detailFace.sourceReason !== 'not-found') {
        return '读口取不到须走 source-failed 并带 reason（不得与 projection 同形）';
    }
    const thr = Cx.dispatch(depsOf({ textSource: () => { throw new Error('boom'); } }),
        Object.assign(Cx.blankState(), { detail: 'commitment:cm1', ledgers: ['commitment'] }), { host: HOST, apis: APIS });
    if (thr.detailFace.textChannel !== 'source-failed' || thr.detailFace.sourceReason !== 'source-thrown') {
        return '读口抛错须落 source-thrown（不许把整面带塌）';
    }
    const off = Cx.dispatch(deps, Object.assign(Cx.blankState(), { ledgers: ['seed'], detail: 'commitment:cm1' }), { host: HOST, apis: APIS });
    if (off.detailFace !== null) return '详情位指到不在本页的行 ⇒ **不渲染空详情**';
    if (!off.detailNote || off.detailNote.indexOf('不在本页') < 0) return '须具名说明「不在本页」（与「这条不存在」不同形）';
    const sec = Cx.dispatch(deps, Object.assign(Cx.blankState(), { ledgers: ['secret'] }), { host: HOST, apis: APIS });
    const secD = Cx.dispatch(deps, Object.assign(Cx.blankState(), { ledgers: ['secret'], detail: sec.rows[0].ref }), { host: HOST, apis: APIS });
    if (secD.detailFace.bodyState !== 'masked-unknown-scope') return '范围判不了须走 masked-unknown-scope（与「知道范围」不同形），实 ' + secD.detailFace.bodyState;
    if (secD.detailFace.text !== '' || secD.detailFace.textChannel !== 'masked') return '受限正文必须保持遮蔽：返回面一个字符都不带';
    return '';
}
/** C：修订链（浅链 / 换代链分开说；三态互不同形）。 */
function judgeChain(Cx, deps) {
    const f = Cx.dispatch(deps, Object.assign(Cx.blankState(), { ledgers: ['commitment'], detail: 'commitment:cm1' }), { host: HOST, apis: APIS });
    const ch = f.revisionChain;
    if (!ch) return '有详情时须产出 revisionChain';
    if (ch.counter.revision !== 2 || ch.counter.revisionKnown !== true || ch.counter.updatedFloor !== 4) {
        return '浅链须逐字读出该行真读数（revision 2 / known / updatedFloor 4）';
    }
    if (ch.state !== 'versioned') return '同主谓下有两版 ⇒ 须落 versioned（真跑读数），实 ' + ch.state;
    if (!ch.versioned || ch.versioned.subject !== '苏晴' || ch.versioned.predicate !== '住' || ch.versioned.count !== 2) {
        return '换代链主体须由参与者 + 标题「键=值」推出（真读数：苏晴 / 住 / 2 版）';
    }
    const got = ch.chain.map((v) => v.value + '|' + v.from + '|' + v.to + '|' + v.state);
    if (JSON.stringify(got) !== JSON.stringify(['老城|1|5|superseded', '新城|6|null|active'])) {
        return '链上每条须带值 / 区间 / 五态，实 ' + JSON.stringify(got);
    }
    const noVO = Cx.dispatch(depsOf({ versionsOf: null }), Object.assign(Cx.blankState(), { detail: 'commitment:cm1' }), { host: HOST, apis: APIS });
    if (noVO.revisionChain.state !== 'unknown' || noVO.revisionChain.reason.indexOf('versionsOf-absent') !== 0) {
        return '换代链读面缺席须落 unknown/versionsOf-absent';
    }
    if (noVO.revisionChain.counter.revision !== 2) return '读面缺席时**浅链仍须在**（不得整块塌掉）';
    const noFS = Cx.dispatch(depsOf({ factState: null }), Object.assign(Cx.blankState(), { detail: 'commitment:cm1' }), { host: HOST, apis: APIS });
    if (noFS.revisionChain.state !== 'unknown' || noFS.revisionChain.reason.indexOf('factState-absent') !== 0) {
        return '事实账读口缺席须落 unknown/factState-absent（**不是**「没有版本」）';
    }
    if (noFS.revisionChain.reason === noVO.revisionChain.reason) return '两种「判不了」必须具名不同 reason';
    const alone = Cx.revisionChain('commitment:cm2', deps, { row: { ref: 'commitment:cm2', revision: 1, revisionKnown: true, updatedFloor: 25, times: [], actors: [{ field: 'actor', name: '阿青' }], title: '第二件' } });
    if (alone.state !== 'empty' || alone.reason !== 'no-versions') return '确实没有别的版本 ⇒ empty/no-versions，实 ' + alone.state + '/' + alone.reason;
    if (alone.note.indexOf('确实没有') < 0) return 'empty 档须自述「确实没有」而非「没读出来」';
    const noFive = Cx.dispatch(depsOf({ FACT_STATE: null }), Object.assign(Cx.blankState(), { detail: 'commitment:cm1' }), { host: HOST, apis: APIS });
    if (noFive.revisionChain.state !== 'versioned') return '五态面缺席不得把换代链整块弄没';
    if (noFive.revisionChain.chain.some((v) => v.state !== '')) return '五态面缺席时 state 列须留空（**不编一个 active**）';
    return '';
}
/** D：批量影响预览（三档 + 四态具名 + 未完成选择保留）。 */
function judgeBatch(Cx, deps) {
    const pick = ['commitment:cm1', 'commitment:cm2'];
    const rr = (action, refs) => Cx.dispatch(deps, Cx.blankState(), { host: HOST, apis: APIS, batchSelection: { action: action, refs: refs } });
    if (Cx.dispatch(deps, Cx.blankState(), { host: HOST, apis: APIS }).batch !== null) return '未传选区时不得产出 batch（本模块不猜选区）';
    const rv = rr('revoke', pick);
    if (rv.batch.state !== 'ok' || rv.batch.selected !== 2) return '撤回档须 ok 且报选中数';
    if (rv.batch.reversibleCount !== 0 || rv.batch.irreversibleCount !== 2) {
        return '撤回含 delete-source ⇒ **可逆 0 / 不可逆 2**（真跑读数），实 ' + rv.batch.reversibleCount + '/' + rv.batch.irreversibleCount;
    }
    if (JSON.stringify(rv.batch.irreversibleActions) !== JSON.stringify(['delete-source'])) return '须点名不可逆动作';
    if (rv.batch.ledgerState !== 'revoked') return '账本态须真读自 fact-lifecycle.RULES';
    if (JSON.stringify(rv.batch.faces) !== JSON.stringify(['ledger', 'generation', 'audit'])) return '作用面须真读自 RULES';
    if (rv.batch.note.indexOf('不可逆') < 0) return '含不可逆动作时必须在预览里说出来（不能等执行后才知道）';
    const hd = rr('hide-generate', pick);
    if (hd.batch.ledgerState !== null || JSON.stringify(hd.batch.faces) !== JSON.stringify(['generation', 'audit'])) {
        return '「隐藏于生成」须落 author-only（账本态不动、只作用生成面 / 审计）';
    }
    const kp = rr('keep', pick);
    if (kp.batch.ledgerState !== 'active' || kp.batch.reversibleCount !== 2) return '保留档须可逆且账本态 active';
    const un = rr('__不存在__', pick);
    if (un.batch.state !== 'unknown-action' || un.batch.reason.indexOf('未登记的动作名') < 0) return '未知动作须落 unknown-action 并点名';
    const em = rr('revoke', []);
    if (em.batch.state !== 'empty-selection' || em.batch.reason.indexOf('不是「选了零条有效」') < 0) return '未选条须落 empty-selection（与「选了零条有效」不同形）';
    const noFL = Cx.dispatch(depsOf({ FACT_LIFECYCLE: null }), Cx.blankState(), { host: HOST, apis: APIS, batchSelection: { action: 'revoke', refs: pick } });
    if (noFL.batch.state !== 'unavailable' || noFL.batch.reason !== 'lifecycle-absent') return '生命周期缺席须落 unavailable/lifecycle-absent（不编影响面）';
    const part = Cx.dispatch(deps, Object.assign(Cx.blankState(), { selection: ['commitment:cm1', '__不在本页__'], batchAction: 'revoke' }), { host: HOST, apis: APIS });
    if (part.batch.state !== 'ok' || part.batch.affected.length !== 1) return '部分命中须 ok + 只算命中的';
    if (part.batch.skipped.length !== 1 || part.batch.skipped[0].ref !== '__不在本页__') return '未命中条须逐条具名 why';
    if (part.batch.skipped[0].why.indexOf('not-on-this-page') < 0) return '未完成选择的 why 须具名（不得静默丢弃）';
    if (part.state.selection.indexOf('__不在本页__') < 0) return '★ 失败后**未完成选择必须仍在选区里**（验收原文那一句的落点）';
    if (JSON.stringify(part.selection) !== JSON.stringify(part.state.selection)) return 'face.selection 须回读自状态';
    return '';
}
/** E：导航保留筛选与页码（并回报 kept）。 */
function judgeNavigate(Cx, deps) {
    const st0 = baseState();
    const n1 = Cx.navigate(st0, { to: 'detail', ref: 'commitment:cm1' });
    if (n1.handled !== true || n1.state.detail !== 'commitment:cm1') return '进详情须处理且写入详情位';
    if (n1.state.page !== 2 || n1.state.actor !== '苏晴' || n1.state.text !== '住') return '★ 进详情必须保留页码与筛选条件';
    if (JSON.stringify(n1.state.ledgers) !== JSON.stringify(['commitment', 'seed'])) return '多值条件也须逐字保留';
    if (n1.kept.indexOf('page') < 0 || n1.kept.indexOf('条件') < 0) return '须回报 kept（看不见回报时「保留」与「被重置」同形）';
    const n2 = Cx.navigate(n1.state, { to: 'profile', profile: 'person|苏晴' });
    if (n2.state.profile !== 'person|苏晴' || n2.state.page !== 2 || n2.state.actor !== '苏晴') return '切资料页须保留页码与条件';
    if (n2.state.detail !== '') return '换资料页时旧详情须清（它已不在视野内）';
    const n3 = Cx.navigate(n2.state, { to: 'profile', profile: 'person|苏晴' });
    if (n3.state.profile !== '') return '再点同一张资料页 = 退出该页（组织轴本身要能退出）';
    const n4 = Cx.navigate(n3.state, { to: 'list' });
    if (n4.handled !== true || n4.state.page !== 2 || n4.state.actor !== '苏晴') return '出详情回列表须保留页码与条件';
    const n5 = Cx.navigate(st0, { to: '__乱写__' });
    if (n5.handled !== false || n5.ignored !== '__乱写__') return '未知去向须点名 ignored（不静默）';
    const n6 = Cx.navigate(st0, { to: 'detail', ref: '' });
    if (n6.handled !== false || n6.ignored !== 'detail-ref-missing') return '空 ref 须具名 detail-ref-missing';
    const f1 = Cx.step(deps, Object.assign(Cx.blankState(), { page: 5, detail: 'commitment:cm1' }), 'filter', { key: 'actor', value: '苏晴' }, { host: HOST, apis: APIS });
    if (f1.state.page !== 1 || f1.state.detail !== '') return '改条件须回第一页并退出详情（两件事分开，不混在导航里）';
    const s1 = Cx.step(deps, st0, 'select', { ref: 'commitment:cm1', mode: 'toggle' }, { host: HOST, apis: APIS });
    if (s1.handled !== true || JSON.stringify(s1.selection) !== JSON.stringify(['commitment:cm1'])) return 'toggle 须选入';
    if (s1.state.page !== 2 || s1.state.actor !== '苏晴') return '选区动作不得动条件与页码';
    const s2 = Cx.step(deps, s1.state, 'select', { ref: 'commitment:cm1', mode: 'toggle' }, { host: HOST, apis: APIS });
    if (JSON.stringify(s2.selection) !== JSON.stringify([])) return '再点 = 取消（不得只加不减）';
    const s3 = Cx.step(deps, st0, 'select', { mode: 'set', refs: ['commitment:cm1', '__off__'] }, { host: HOST, apis: APIS });
    if (JSON.stringify(s3.selection) !== JSON.stringify(['commitment:cm1', '__off__'])) return 'set 须逐字写入（含对不上的 ref：失败要留在选区里）';
    const s4 = Cx.step(deps, s3.state, 'batch', { action: 'revoke' }, { host: HOST, apis: APIS });
    if (s4.state.batchAction !== 'revoke' || s4.batch.state !== 'ok') return '批量档位须住进状态并驱动预览';
    if (s4.state.page !== 2 || s4.state.actor !== '苏晴') return '批量档位不得动条件与页码';
    const s5 = Cx.step(deps, s4.state, 'batch', { action: '__没这档__' }, { host: HOST, apis: APIS });
    if (s5.handled !== false || s5.ignored !== '__没这档__' || s5.state.batchAction !== 'revoke') return '未知档位须点名且不改现档';
    const s6 = Cx.step(deps, s4.state, 'select', { mode: 'clear' }, { host: HOST, apis: APIS });
    if (JSON.stringify(s6.selection) !== JSON.stringify([]) || s6.state.batchAction !== '' || s6.batch !== null) {
        return '清空选区须连档位一起收回（否则会留下一个指向空选区的预览）';
    }
    const s7 = Cx.step(deps, st0, 'select', { ref: 'x', mode: '__x__' }, { host: HOST, apis: APIS });
    if (s7.handled !== false || s7.ignored !== '__x__') return '未知 mode 须点名';
    const s8 = Cx.step(deps, st0, 'select', { mode: 'toggle' }, { host: HOST, apis: APIS });
    if (s8.handled !== false || s8.ignored !== 'select-ref-missing') return '缺 ref 须具名';
    return '';
}
/** F：零写 + 存档往返（组织态随状态走，且不得混进查询条件）。 */
function judgeZeroWriteAndStore(Cx, deps) {
    const before = JSON.stringify([HOST.worldProg, HOST._factVersionState, HOST._eventThreadState, HOST._repairState]);
    Cx.dispatch(deps, Object.assign(Cx.blankState(), { detail: 'commitment:cm1' }), { host: HOST, apis: APIS });
    Cx.dispatch(deps, Cx.blankState(), { host: HOST, apis: APIS, batchSelection: { action: 'revoke', refs: ['commitment:cm1'] } });
    Cx.step(deps, baseState(), 'select', { ref: 'commitment:cm1' }, { host: HOST, apis: APIS });
    Cx.step(deps, baseState(), 'batch', { action: 'revoke' }, { host: HOST, apis: APIS });
    const after = JSON.stringify([HOST.worldProg, HOST._factVersionState, HOST._eventThreadState, HOST._repairState]);
    if (before !== after) return '组织层 / 详情 / 链 / 批量预览 / 选区全程不得改动宿主账本（逐字节）';
    /* 夹具前提按**真跑读数**钉（920 字节；照搬 v3310 的 1000 阈值会把本档夹具判成「过小」）。
     *   目的不变：扫描面不能小到「改不改都看不出来」。 */
    if (before.length !== 920) return '夹具前提不成立：宿主账本读数应为 920 字节（真跑），实 ' + before.length;
    const sv = Cx.saveState(Object.assign(Cx.blankState(), {
        profile: 'person|苏晴', detail: 'commitment:cm1', selection: ['commitment:cm1', 'commitment:cm2'],
        batchAction: 'revoke', actor: '苏晴', page: 3
    }));
    if (sv.profile !== 'person|苏晴' || sv.detail !== 'commitment:cm1') return '组织轴与详情位须随状态存（重开还在）';
    if (JSON.stringify(sv.selection) !== JSON.stringify(['commitment:cm1', 'commitment:cm2'])) return '选区须随状态存（失败后未完成选择要能跨渲染存活）';
    if (sv.batchAction !== 'revoke' || sv.page !== 3 || sv.actor !== '苏晴') return '档位 / 页码 / 条件须一并存';
    const back = Cx.loadState(sv);
    if (back.profile !== 'person|苏晴' || JSON.stringify(back.selection) !== JSON.stringify(sv.selection) || back.page !== 3) {
        return 'loadState 往返须逐字（组织态不得在往返中被抹掉）';
    }
    const spec = Cx.buildSpec(back);
    for (const k of ['profile', 'detail', 'selection', 'batchAction']) {
        if (Object.prototype.hasOwnProperty.call(spec, k)) return '组织态 `' + k + '` **不得**进查询条件（spec 只收条件）';
    }
    for (const k of ['profile', 'detail', 'selection']) {
        if (Cx.UI_FIELDS.some((f) => f.specKey === k)) return '组织态不得进 UI_FIELDS（那是条件键对账表）';
    }
    return '';
}
/** G：渲染面（三面标记 + 复选框 + 通道自证 + 转义照旧）。 */
function judgeRender(Cx, deps) {
    const f = Cx.dispatch(deps, Object.assign(Cx.blankState(), { ledgers: ['commitment'], detail: 'commitment:cm1' }), { host: HOST, apis: APIS });
    const html = Cx.sheetHtml(f);
    if (html.indexOf('data-mc="profile"') < 0) return '资料页须带 data-mc="profile" 标记（宿主据此绑定）';
    if (html.indexOf('data-detail="commitment:cm1"') < 0) return '详情块须带 data-detail';
    if (html.indexOf('data-chain=') < 0) return '换代链条目须带 data-chain（可否取消看得到）';
    if (html.indexOf('data-mc="detail-back"') < 0) return '详情须有「回到列表」出口';
    if (html.indexOf('data-text-channel="projection"') < 0) return '正文块须自证通道（projection 与真原文不同形）';
    const all = Cx.sheetHtml(Cx.dispatch(deps, Cx.blankState(), { host: HOST, apis: APIS }));
    if (all.indexOf('data-mc="select"') < 0) return '每行须有选区复选框';
    if (all.indexOf('已选 0 条') < 0) return '须有选区读数（否则「选了没生效」看不出来）';
    if (all.indexOf('data-mc="batch"') < 0) return '须有批量三档入口';
    if (all.indexOf('data-batch-action="hide-generate"') < 0) return '三档入口须逐档在场（含隐藏于生成）';
    const firstRef = Cx.dispatch(deps, Cx.blankState(), { host: HOST, apis: APIS }).rows[0].ref;
    const tok = Cx.step(deps, Cx.blankState(), 'select', { ref: firstRef, mode: 'toggle' }, { host: HOST, apis: APIS });
    if (Cx.sheetHtml(tok).indexOf('checked') < 0) return '已选中的行须在渲染串里 checked（真读数回灌）';
    const b = Cx.dispatch(deps, Cx.blankState(), { host: HOST, apis: APIS, batchSelection: { action: 'revoke', refs: ['commitment:cm1'] } });
    const bh = Cx.sheetHtml(b);
    if (bh.indexOf('data-batch="revoke"') < 0 || bh.indexOf('data-batch-state="ok"') < 0) return '批量预览块须带动作与状态标记';
    const bad = Cx.dispatch(deps, Cx.blankState(), { host: HOST, apis: APIS, batchSelection: { action: '__不存在__', refs: ['commitment:cm1'] } });
    if (Cx.sheetHtml(bad).indexOf('data-batch-state="unknown-action"') < 0) return '不可用的预览也须在渲染面如实自证（不得静默无块）';
    const esc = Cx.dispatch(deps, Object.assign(Cx.blankState(), { text: 'a"b<c' }), { host: HOST, apis: APIS });
    if (/value="a"b/.test(Cx.sheetHtml(esc))) return '属性值里的引号必须仍被转义（新增面不得打开注入）';
    const none = Cx.dispatch({ FILTERS: Q.FILTERS, LEDGERS: W.LEDGERS }, Cx.blankState(), { host: HOST, apis: APIS });
    if (!/data-view="error"/.test(Cx.sheetHtml(none))) return '内核缺席时渲染串仍须自证 data-view="error"';
    return '';
}
/** H：登记面与自述（新增登记面 + 既有口径未变）。 */
function judgeDeclarations(Cx, deps) {
    for (const k of ['PROFILE_KINDS', 'BATCH_ACTIONS', 'OPTIONAL_DEPS', 'EVENT_LEDGERS']) {
        if (!Array.isArray(Cx[k])) return '导出面缺登记表：' + k;
    }
    if (JSON.stringify(Cx.PROFILE_KINDS) !== JSON.stringify(['person', 'event', 'time'])) return '资料页三轴词表须逐字';
    if (Cx.TIME_BUCKET !== 20) return '时间桶宽须为当版口径（20）';
    if (JSON.stringify(Cx.BATCH_ACTIONS.map((b) => b.id)) !== JSON.stringify(['keep', 'hide-generate', 'revoke'])) {
        return '批量三档词表须逐字（保留 / 隐藏于生成 / 撤回）';
    }
    if (Cx.BATCH_ACTIONS.some((b) => !b.disposition)) return '每档须指向 fact-lifecycle 的处置名（不另抄一份语义）';
    if (JSON.stringify(Cx.OPTIONAL_DEPS.map((d) => d.key)) !== JSON.stringify(['FACT_LIFECYCLE', 'FACT_STATE', 'versionsOf', 'factState', 'textSource'])) {
        return '可选依赖面须逐字（缺席时相应能力降级并具名）';
    }
    if (Cx.REQUIRED_DEPS.length !== 7) return '★ 可选依赖**不得**混进 REQUIRED_DEPS（把落靠能力升为硬依赖 = 把整面弄瞎）';
    for (const d of Cx.OPTIONAL_DEPS) if (Cx.REQUIRED_DEPS.some((rr) => rr.key === d.key)) return '可选依赖 ' + d.key + ' 不得同时是硬依赖';
    if (Cx.UI_FIELDS.length !== 10) return '界面字段仍须 10 项（组织态不入条件键表）';
    if (!Cx.keysAligned({ FILTERS: Q.FILTERS }).ok) return '条件键对账须仍成立';
    for (const fn of ['buildProfiles', 'timeBucketOf', 'detailOf', 'revisionChain', 'batchPreview', 'navigate',
        'profileHtml', 'detailHtml', 'batchHtml']) {
        if (typeof Cx[fn] !== 'function') return '导出面缺函数：' + fn;
    }
    const sc = Cx.selfCheck(deps);
    if (sc.ok !== true) return '自检须为真：' + JSON.stringify(sc);
    const ub = Cx.timeBucketOf(null);
    if (ub.kind !== 'unknown' || ub.label.indexOf('时间未知') < 0) return '无楼层须落 kind:unknown（**不归到第 0 桶**）';
    if (ub.from !== null || ub.to !== null) return 'unknown 桶不得编出区间';
    const b0 = Cx.timeBucketOf(0);
    if (b0.kind !== 'range' || b0.from !== 0 || b0.to !== 19) return '第 0 楼须与「没有楼层」不同形（0 / 19）';
    if (Cx.timeBucketOf(25).label !== '第 20-39 楼') return '桶标签须与真跑读数一致';
    return '';
}
/** I：宿主接线。 */
function judgeHost(src) {
    const once = ['memoryCenterSourceText(ref) {', 'memoryCenterFactState() {'];
    for (const s of once) {
        const n = src.split(s).length - 1;
        if (n !== 1) return '宿主新口须恰好在场一次：' + s + '（实 ' + n + '）';
    }
    const depsAt = src.indexOf('memoryCenterDeps() {');
    if (depsAt < 0) return '装配点必须在场';
    const seg = src.slice(depsAt, depsAt + 2400);
    for (const k of ['versionsOf:', 'factState:', 'FACT_STATE:', 'FACT_LIFECYCLE:']) {
        if (seg.indexOf(k) < 0) return '装配点缺可选依赖键：' + k;
    }
    if (seg.indexOf('memoryCenterFactState') < 0) return '事实账读口须经方法取（引用而非拷贝）';
    if (!src.includes('textSource: (o.textSource !== undefined) ? o.textSource : ((r) => this.memoryCenterSourceText(r))')) {
        return 'view 出口须接真原文取数口（每次现取）';
    }
    if (!src.includes('textSource: ((opts || {}).textSource !== undefined) ? opts.textSource : ((r) => this.memoryCenterSourceText(r))')) {
        return 'step 出口须接真原文取数口（否则翻页 / 选区后详情取不到原文）';
    }
    if (src.split('profiles: (face.profiles || {}).count || 0').length - 1 !== 2) return '两出口的最近读数都须记组织层读数（2 处）';
    if (!src.includes("bits2.push('资料页 ' + last.profiles)")) return '诊断行须报资料页读数';
    if (!/bits2\.push\('详情 ' \+ last\.detail \+ \(last\.detailChannel/.test(src)) return '诊断行须报**正文通道**（projection 与真原文不同形）';
    if (!src.includes("bits2.push('批量预览 ' + last.batch)")) return '诊断行须报批量预览态';
    if (!src.includes('Q.FACETS.filter((f) => f && f.id === lid)[0]')) return '真原文取数口须走既有 facet 登记表（不另立字段口径）';
    if (!src.includes('const fields = Array.isArray(facet.textFields) ? facet.textFields : [];')) return '正文列须取自 textFields 单一真源';
    if (!src.includes("out.reason = 'not-found'; return out;")) return '取数口须逐态具名（not-found 等）';
    const tsv = read('tests/audit/open_face_registry.tsv');
    if (/memoryCenterSource\w*\t/.test(tsv) || /memoryCenterPages\t/.test(tsv)) return '本版不新增跨仓外供面（真原文口是自包含的）';
    return '';
}
/** J：面板接线。 */
function judgePanel(src) {
    for (const s of ['[data-mc="profile"]', '[data-mc="select"]', '[data-mc="select-clear"]',
        '[data-mc="batch"]', '[data-mc="detail-back"]']) {
        if (src.indexOf(s) < 0) return '面板缺组织层交互绑定：' + s;
    }
    if (src.indexOf("stepOrg('profile', { to: 'profile', profile: b2.dataset.profile })") < 0) return '资料页点击须走内核动作名';
    if (src.indexOf("stepOrg('select', { ref: cb.dataset.ref, mode: 'toggle' })") < 0) return '复选框须走 select/toggle';
    if (src.indexOf("stepOrg('batch', { action: b2.dataset.batchAction })") < 0) return '批量档位须走 batch 动作名';
    if (src.indexOf("stepOrg('navigate', { to: 'list' })") < 0) return '回列表须走 navigate/to:list';
    /* 回写点**真读数 4 处**（筛选提交 / 筛选应用 / 翻页 / stepOrg）；少一处即意味着
     *   某条路径在面板里自造状态 —— 那样页码与筛选就会丢。 */
    const writes = src.split('plugin._memoryCenterState = face.state || plugin._memoryCenterState;').length - 1;
    if (writes !== 4) return '回写点应为 4 处（真读数），实 ' + writes;
    /* stepOrg 是**唯一**组织层入口：五处绑定都须经它（不经它就会绕过内核算状态）。 */
    if (src.split('stepOrg(').length - 1 !== 5) return 'stepOrg 须恰 5 次（1 定义 + 4 绑定，真读数）';
    return '';
}
/* ── 破坏副本装载（真源码 → 真装载，不走 mock） ── */
function loadBroken(tag, src, anchor, repl) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3325-' + tag + '-'));
    const p = path.join(dir, MOD);
    const broken = breakOnce(src, anchor, repl, tag);
    fs.writeFileSync(p, broken);
    const chk = require_('node:child_process').spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
    assert.equal(chk.status, 0, '破坏副本必须语法可过（否则归因不成立）：' + String(chk.stderr).slice(-300));
    return require_(p);
}
/* ── 锚点（每处只声明一次 = 判据纯度） ── */
const ANCHORS = Object.freeze({
    bucket: "        const to = from + TIME_BUCKET - 1;",
    bucketBroken: "        const to = from + TIME_BUCKET - 2;",
    merge: "                    push('person', nm, nm, r);",
    mergeBroken: "                    push('team', nm, nm, r);",
    unknownTime: "        if (n === null) return { kind: 'unknown', from: null, to: null, label: '时间未知（未归到任何时段）' };",
    unknownTimeBroken: "        if (n === null) return { kind: 'range', from: 0, to: TIME_BUCKET - 1, label: '第 0-19 楼' };",
    maskText: "        const textChannel = masked ? 'masked'",
    maskTextBroken: "        const textChannel = false ? 'masked'",
    chainClaim: "        base.state = chain.length ? 'versioned' : 'empty';",
    chainClaimBroken: "        base.state = 'versioned';",
    reversible: "                faces: faces, undo: undo, reversible: reversibleAll",
    reversibleBroken: "                faces: faces, undo: undo, reversible: true",
    batchUnknown: "            out.state = 'unknown-action';",
    batchUnknownBroken: "            out.state = 'ok';",
    skipDrop: "            if (!r) { out.skipped.push({ ref: ref, why: 'not-on-this-page（不在本页 / 条件变过）' }); continue; }",
    skipDropBroken: "            if (!r) { continue; }",
    keepPageHdr: "            st.detail = ref; out.handled = true; out.kept = ['page', '条件', 'profile'];",
    keepPageHdrBroken: "            st.detail = ref; out.handled = true; st.page = 1; out.kept = ['page', '条件', 'profile'];",
    chan: ' data-text-channel="',
    chanBroken: ' data-channel-removed="'
});
const UI_FROM = "                    stepOrg('profile', { to: 'profile', profile: b2.dataset.profile });";
const UI_TO = "                    plugin._memoryCenterState = Object.assign({}, plugin._memoryCenterState, { profile: b2.dataset.profile });";
/* ══════════════════ A 模块与资料页 ══════════════════ */
test('v3325 A1. ★★★★ 模块登记面：分发面恰一次 + 双导出 + 冻结（本版不新增模块）', () => {
    assert.ok(fs.existsSync(path.join(R, MOD)), MOD + ' 必须在场');
    assert.equal(MF.extra_js.filter((x) => x === MOD).length, 1, MOD + ' 须恰登记一次');
    assert.equal(MF.extra_js.length, 101, '本版**不新增模块**：extra_js 仍 101（99 → 101 是 v3.324.0 的账）');
    const code = stripComments(MOD_SRC);
    if (code.includes('require(')) assert.fail('模块不得 require 兄弟模块（依赖经 deps 注入）');
    if (!code.includes('module.exports = api')) assert.fail('必须保留 CJS 导出');
    if (!/root\.LonSha[A-Za-z]* = api;/.test(code)) assert.fail('必须挂浏览器全局');
    if (!/const api = Object\.freeze\(\{/.test(code)) assert.fail('导出面须冻结');
    if (Object.isFrozen(globalThis.LonShaMemoryCenter) !== true) assert.fail('全局挂载须冻结');
});
test('v3325 A2. ★★★★★ 资料页三轴：多张不合并 / 判不了单列 / 无命中与归不了类不同形', () => {
    assert.equal(judgeProfiles(C, depsOf()), '', '资料页判据');
});
/* ══════════════════ B 详情与修订链 ══════════════════ */
test('v3325 B1. ★★★★★ 详情面：正文三档可分（真原文 / 投影摘要 / 遮蔽一格不带）', () => {
    assert.equal(judgeDetail(C, depsOf()), '', '详情判据');
});
test('v3325 B2. ★★★★★ 修订链：浅链与换代链分开说，三态互不同形（不拿浅链冒充换代信息）', () => {
    assert.equal(judgeChain(C, depsOf()), '', '修订链判据');
});
/* ══════════════════ C 批量影响预览 ══════════════════ */
test('v3325 C1. ★★★★★ 批量三档影响预览真读自 fact-lifecycle（可逆 / 不可逆逐档可分）', () => {
    assert.equal(judgeBatch(C, depsOf()), '', '批量判据');
});
/* ══════════════════ D 导航与选区 ══════════════════ */
test('v3325 D1. ★★★★★ 进出详情 / 切资料页 / 选区 / 批量档位：全保留筛选与页码', () => {
    assert.equal(judgeNavigate(C, depsOf()), '', '导航判据');
});
test('v3325 D2. ★★★★ 零写 + 存档往返：组织态随状态走，且**不得**混进查询条件', () => {
    assert.equal(judgeZeroWriteAndStore(C, depsOf()), '', '零写与往返判据');
});
/* ══════════════════ E 渲染与登记面 ══════════════════ */
test('v3325 E1. ★★★★ 渲染面：三面标记 + 选区复选框 + 正文通道自证 + 转义照旧', () => {
    assert.equal(judgeRender(C, depsOf()), '', '渲染判据');
});
test('v3325 E2. ★★★★ 登记面：三轴 / 三档 / 可选依赖逐字，可选**不得**混进硬依赖', () => {
    assert.equal(judgeDeclarations(C, depsOf()), '', '登记面判据');
});
/* ══════════════════ F 宿主与面板 ══════════════════ */
test('v3325 F1. ★★★★★ 宿主接线：两出口（真原文取数口自包含）+ 可选依赖装配 + 两处传参 + 诊断行', () => {
    assert.equal(judgeHost(IDX), '', '宿主接线判据');
});
test('v3325 F2. ★★★★★ 面板接线：组织层交互逐条在场，且只从 face.state 回写（不重建状态）', () => {
    assert.equal(judgePanel(UI), '', '面板接线判据');
});
/* ══════════════════ G 负控制（真源码破坏） ══════════════════ */
test('v3325 G1. ★★★★★ 十二条真源码破坏负控制（每条必须让对应判据转红）+ 正向对照', () => {
    const deps = depsOf();
    assert.equal(judgeProfiles(C, deps), '', '原件上资料页判据必须为真');
    assert.equal(judgeDetail(C, deps), '', '原件上详情判据必须为真');
    assert.equal(judgeChain(C, deps), '', '原件上链判据必须为真');
    assert.equal(judgeBatch(C, deps), '', '原件上批量判据必须为真');
    assert.equal(judgeNavigate(C, deps), '', '原件上导航判据必须为真');
    assert.equal(judgeRender(C, deps), '', '原件上渲染判据必须为真');
    /* ① 桶宽改一 ⇒ 桶标签错。 */
    const b1 = loadBroken('bucket', MOD_SRC, ANCHORS.bucket, ANCHORS.bucketBroken);
    assert.equal(b1.timeBucketOf(25).to, 38, '破坏必须真的生效（桶止用了 18）');
    assert.ok(judgeDeclarations(b1, deps).indexOf('真跑读数') >= 0 || judgeProfiles(b1, deps).indexOf('真跑读数') >= 0,
        '同款判据须点名：' + (judgeDeclarations(b1, deps) || judgeProfiles(b1, deps)));
    /* ② 人物轴改合并页 ⇒ 多张变一张。 */
    const b2 = loadBroken('merge', MOD_SRC, ANCHORS.merge, ANCHORS.mergeBroken);
    const p2 = b2.buildProfiles([{ ref: 'a:1', ledger: 'a', ledgerLabel: 'A', title: 't', floor: 1, actors: [{ field: 'actor', name: '苏晴' }, { field: 'counterpart', name: '林一' }] }], {});
    assert.equal(p2.pages.filter((p) => p.kind === 'person').length, 0, '破坏必须真的生效（人物轴被整轴改道）');
    assert.ok(judgeProfiles(b2, deps).indexOf('资料页') >= 0 || judgeProfiles(b2, deps).indexOf('人物页') >= 0,
        '同款判据须点名：' + judgeProfiles(b2, deps));
    /* ③ 「判不了」被归到第 0 桶。 */
    const b3 = loadBroken('unknownTime', MOD_SRC, ANCHORS.unknownTime, ANCHORS.unknownTimeBroken);
    assert.equal(b3.timeBucketOf(null).kind, 'range', '破坏必须真的生效（判不了被当第 0 桶）');
    assert.ok(judgeDeclarations(b3, deps).indexOf('第 0 桶') >= 0, '同款判据须点名：' + judgeDeclarations(b3, deps));
    /* ④ 遮蔽被摘 ⇒ 受限正文漏出。 */
    const b4 = loadBroken('mask', MOD_SRC, ANCHORS.maskText, ANCHORS.maskTextBroken);
    const sec = b4.dispatch(deps, Object.assign(b4.blankState(), { ledgers: ['secret'] }), { host: HOST, apis: APIS });
    const secD = b4.dispatch(deps, Object.assign(b4.blankState(), { ledgers: ['secret'], detail: sec.rows[0].ref }), { host: HOST, apis: APIS });
    assert.notEqual(secD.detailFace.textChannel, 'masked', '破坏必须真的生效（文本通道不再标遮蔽）');
    assert.ok(judgeDetail(b4, deps).indexOf('遮蔽') >= 0, '同款判据须点名：' + judgeDetail(b4, deps));
    /* ⑤ 「没有版本」被说成 versioned。 */
    const b5 = loadBroken('chain', MOD_SRC, ANCHORS.chainClaim, ANCHORS.chainClaimBroken);
    const lone = b5.revisionChain('commitment:cm2', deps, { row: { ref: 'commitment:cm2', revision: 1, revisionKnown: true, updatedFloor: 25, times: [], actors: [{ field: 'actor', name: '阿青' }], title: '第二件' } });
    assert.equal(lone.state, 'versioned', '破坏必须真的生效（没有版本也报 versioned）');
    assert.ok(judgeChain(b5, deps).indexOf('empty') >= 0, '同款判据须点名：' + judgeChain(b5, deps));
    /* ⑥ 逐条可逆性写死 true ⇒ 不可逆被说成可撤销。 */
    const b6 = loadBroken('reversible', MOD_SRC, ANCHORS.reversible, ANCHORS.reversibleBroken);
    const rv6 = b6.dispatch(deps, b6.blankState(), { host: HOST, apis: APIS, batchSelection: { action: 'revoke', refs: ['commitment:cm1'] } });
    assert.equal(rv6.batch.reversibleCount, 1, '破坏必须真的生效（全部报可逆）');
    assert.ok(judgeBatch(b6, deps).indexOf('可逆') >= 0, '同款判据须点名：' + judgeBatch(b6, deps));
    /* ⑦ 未知动作被当 ok。 */
    const b7 = loadBroken('batchUnknown', MOD_SRC, ANCHORS.batchUnknown, ANCHORS.batchUnknownBroken);
    const un7 = b7.dispatch(deps, b7.blankState(), { host: HOST, apis: APIS, batchSelection: { action: '__不存在__', refs: ['commitment:cm1'] } });
    assert.equal(un7.batch.state, 'ok', '破坏必须真的生效（未知动作被当可用）');
    assert.ok(judgeBatch(b7, deps).indexOf('unknown-action') >= 0, '同款判据须点名：' + judgeBatch(b7, deps));
    /* ⑧ 未完成选择被静默丢弃。 */
    const b8 = loadBroken('skipDrop', MOD_SRC, ANCHORS.skipDrop, ANCHORS.skipDropBroken);
    const pt8 = b8.dispatch(deps, Object.assign(b8.blankState(), { selection: ['commitment:cm1', '__不在本页__'], batchAction: 'revoke' }), { host: HOST, apis: APIS });
    assert.equal(pt8.batch.skipped.length, 0, '破坏必须真的生效（未命中条被静默丢弃）');
    assert.ok(judgeBatch(b8, deps).indexOf('具名') >= 0, '同款判据须点名：' + judgeBatch(b8, deps));
    /* ⑨ 进详情顺手回第一页 ⇒ 「保留页码」被偷掉。 */
    const b9 = loadBroken('keepPage', MOD_SRC, ANCHORS.keepPageHdr, ANCHORS.keepPageHdrBroken);
    const n9 = b9.navigate(baseState(), { to: 'detail', ref: 'commitment:cm1' });
    assert.equal(n9.state.page, 1, '破坏必须真的生效（进详情被回第一页）');
    assert.ok(judgeNavigate(b9, deps).indexOf('保留页码') >= 0, '同款判据须点名：' + judgeNavigate(b9, deps));
    /* ⑩ 正文通道自证被摘（projection 与真原文同形）。 */
    const b10 = loadBroken('chan', MOD_SRC, ANCHORS.chan, ANCHORS.chanBroken);
    const f10 = b10.dispatch(deps, Object.assign(b10.blankState(), { ledgers: ['commitment'], detail: 'commitment:cm1' }), { host: HOST, apis: APIS });
    assert.equal(b10.sheetHtml(f10).indexOf('data-text-channel="') < 0, true, '破坏必须真的生效（通道属性被摘）');
    assert.ok(judgeRender(b10, deps).indexOf('通道') >= 0, '同款判据须点名：' + judgeRender(b10, deps));
    /* ⑪ 迭代版硬依赖锁：用真源码破坏改 REQUIRED_DEPS 长度 ⇒ 登记面判据须点名。 */
    const b11 = loadBroken('hardDep', MOD_SRC,
        '        { key: "LEDGERS", why: "账本登记表（查询面必给的 ledgers）" }'.replace(/"/g, "'"),
        '        { key: "LEDGERS", why: "账本登记表（查询面必给的 ledgers）" },\n        { key: "FACT_LIFECYCLE", why: "硬依赖化实验" }'.replace(/"/g, "'"));
    assert.equal(b11.REQUIRED_DEPS.length, 8, '破坏必须真的生效（硬依赖多一格）');
    assert.ok(judgeDeclarations(b11, deps).indexOf('硬依赖') >= 0, '同款判据须点名：' + judgeDeclarations(b11, deps));
    /* ⑫ 组织态混进查询条件（会滤空集）。 */
    const b12 = loadBroken('specLeak', MOD_SRC,
        "        if (st.hasFloor === true || st.hasFloor === false) spec.hasFloor = st.hasFloor;",
        "        if (st.hasFloor === true || st.hasFloor === false) spec.hasFloor = st.hasFloor;\n        if (st.profile) spec.profile = st.profile;");
    assert.equal(b12.buildSpec({ profile: 'person|苏晴' }).profile, 'person|苏晴', '破坏必须真的生效（组织态进了条件）');
    assert.ok(judgeZeroWriteAndStore(b12, deps).indexOf('不得') >= 0, '同款判据须点名：' + judgeZeroWriteAndStore(b12, deps));
    /* 面板侧负控制：自造状态 ⇒ 面板判据须点名。 */
    const uiBroken = breakOnce(UI, UI_FROM, UI_TO, 'panel-selfstate');
    assert.notEqual(uiBroken, UI, '面板破坏必须真的生效');
    const pj = judgePanel(uiBroken);
    assert.ok(pj.indexOf('stepOrg') >= 0 || pj.indexOf('回写') >= 0 || pj.indexOf('内核动作名') >= 0,
        '面板判据须点名自造状态：' + pj);
    /* 反向对照：原版上同判据仍须零问题。 */
    assert.equal(judgeProfiles(C, deps), '', '对照：原件上资料页判据仍为零问题');
    assert.equal(judgeDetail(C, deps), '', '对照：原件上详情判据仍为零问题');
    assert.equal(judgeChain(C, deps), '', '对照：原件上链判据仍为零问题');
    assert.equal(judgeBatch(C, deps), '', '对照：原件上批量判据仍为零问题');
    assert.equal(judgeNavigate(C, deps), '', '对照：原件上导航判据仍为零问题');
    assert.equal(judgeRender(C, deps), '', '对照：原件上渲染判据仍为零问题');
    assert.equal(judgeZeroWriteAndStore(C, deps), '', '对照：原件上零写判据仍为零问题');
    assert.equal(judgePanel(UI), '', '对照：原件上面板判据仍为零问题');
});
/* ══════════════════ H 判据纯度 / 工具自证 / 版本锚 ══════════════════ */
test('v3325 H1. ★★★ 判据纯度：每个锚点与面板锚点在本档只声明一次', () => {
    for (const [k, v] of Object.entries(ANCHORS)) {
        assert.equal(SELF.split(v).length - 1, 1, '锚点 ' + k + ' 在本档里必须恰出现 1 次（纯度检查才有内容）');
    }
    assert.equal(SELF.split(UI_FROM).length - 1, 1, '面板锚必须在场恰 1 次');
    assert.equal(SELF.split(UI_TO).length - 1, 1, '面板破坏锚必须在场恰 1 次');
    assert.throws(() => fs.accessSync(path.join(R, 'no-such-file-' + MOD)), /ENOENT/);
});
test('v3325 H2. ★★★ H6 工具两向自证：锚点不存在 / 不唯一 / 同值替换必须抛', () => {
    assert.throws(() => breakOnce(MOD_SRC, '__不存在__', 'x'), /恰中 1 次/);
    assert.throws(() => breakOnce(MOD_SRC, 'e', 'x'), /恰中 1 次/, '单字符锚点必不唯一');
    assert.throws(() => breakOnce(MOD_SRC, ANCHORS.bucket, ANCHORS.bucket), /同值替换/);
    assert.notEqual(breakOnce(MOD_SRC, ANCHORS.bucket, ANCHORS.bucketBroken), MOD_SRC, '真破坏必须可观测地改变源码');
});
const vnum = (s) => { const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s).trim()); return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN; };
const BORN = '3.325.0';
test('v3325 H3. ★★★ 版本锚：本档出生版本 + 六源同源', () => {
    assert.equal(vnum(BORN), 3325000, 'vnum 序数必须可数（当版锚点）');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(codeVer, '入口版本常量必须在场');
    assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立；当前 ' + codeVer);
    assert.equal(MF.version, codeVer, 'manifest 与入口同源');
    assert.equal(PKG.version, codeVer, 'package.json 与入口同源');
    for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const mv = (/let VERSION = '([^']+)'/.exec(read(m)) || [])[1];
        assert.equal(mv, codeVer, m + ' 副本须与入口同源（须是 let）');
    }
    assert.ok(SELF.includes("const BORN = '3.325.0'"), '当版锚点必须显式留在本档里');
});
