import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const R = '/home/user/lonsha-memory-plugin';
const req = createRequire(path.join(R, 'x.js'));
const C = req(path.join(R, 'memory-center.js'));
const Q = req(path.join(R, 'evidence-query.js'));
const W = req(path.join(R, 'evidence-workbench.js'));
const FL = req(path.join(R, 'fact-lifecycle.js'));
const FV = req(path.join(R, 'fact-version.js'));
const FS = req(path.join(R, 'fact-state.js'));
const APIS = {};
for (const s of W.LEDGERS) APIS[s.id] = {};
function host() {
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
function deps(over) {
  return Object.assign({
    query: Q.query, normalizeSpec: Q.normalizeSpec, upsertSaved: Q.upsertSaved,
    removeSaved: Q.removeSaved, replaySaved: Q.replaySaved, FILTERS: Q.FILTERS, LEDGERS: W.LEDGERS,
    FACT_LIFECYCLE: { RULES: FL.RULES, ACTION_SPEC: FL.ACTION_SPEC, DISPOSITIONS: FL.DISPOSITIONS },
    FACT_STATE: FS, versionsOf: FV.versionsOf, factState: () => HOST._factVersionState
  }, over || {});
}
const HOST = host();
const run = (o, opt) => C.dispatch(deps(), Object.assign(C.blankState(), o), Object.assign({ host: HOST, apis: APIS }, opt || {}));
const out = {};
/* A 资料页 */
const A = run({});
out.rowsA = A.rows.length;
out.profiles = { count: A.profiles.count, total: A.profiles.total, person: A.profiles.personCount, tech: A.profiles.technicalCount,
  pages: A.profiles.pages.map((p) => p.kind + '|' + p.label + '|' + p.count + (p.technical ? '|tech' : '')),
  note: A.profiles.note };
/* B 空结果 */
const B = run({ text: '绝对不存在的词ZZZ' });
out.empty = { view: B.view, pages: B.profiles.pages.length, note: B.profiles.note, batch: B.batch, detail: B.detailFace };
/* C 详情 */
const Cd = run({ ledgers: ['commitment'], text: '住=老城', detail: 'commitment:cm1' });
out.detail = { ref: Cd.detailFace.ref, bodyState: Cd.detailFace.bodyState, ch: Cd.detailFace.textChannel,
  textTruncated: Cd.detailFace.textTruncated, actors: Cd.detailFace.actors.length,
  chain: { state: Cd.revisionChain.state, reason: Cd.revisionChain.reason,
    counter: Cd.revisionChain.counter, chain: Cd.revisionChain.chain.map((v) => v.value + '|' + v.from + '|' + v.to + '|' + v.state),
    versioned: Cd.revisionChain.versioned } };
/* C2 原文读口 */
const Cd2 = C.dispatch(deps({ textSource: (ref) => ({ ok: true, text: '真原文（宿主现取）', field: 'content' }) }), Object.assign(C.blankState(), { detail: 'commitment:cm1', ledgers: ['commitment'] }), { host: HOST, apis: APIS });
out.sourceOk = { ch: Cd2.detailFace.textChannel, text: Cd2.detailFace.text, truncated: Cd2.detailFace.textTruncated, field: Cd2.detailFace.sourceField, note: Cd2.detailFace.note };
const Cd3 = C.dispatch(deps({ textSource: () => ({ ok: false, reason: 'not-found' }) }), Object.assign(C.blankState(), { detail: 'commitment:cm1', ledgers: ['commitment'] }), { host: HOST, apis: APIS });
out.sourceFail = { ch: Cd3.detailFace.textChannel, reason: Cd3.detailFace.sourceReason, text: Cd3.detailFace.text, note: Cd3.detailFace.note };
const Cd4 = C.dispatch(deps({ textSource: () => { throw new Error('x'); } }), Object.assign(C.blankState(), { detail: 'commitment:cm1', ledgers: ['commitment'] }), { host: HOST, apis: APIS });
out.sourceThrow = { ch: Cd4.detailFace.textChannel, reason: Cd4.detailFace.sourceReason };
/* D 详情不在本页 */
const D = run({ ledgers: ['seed'], detail: 'commitment:cm1' });
out.detailOffPage = { face: D.detailFace, note: D.detailNote };
/* E 遮蔽 */
const E = run({ ledgers: ['secret'] });
const E2 = run({ ledgers: ['secret'], detail: E.rows[0].ref });
out.masked = { rowMasked: E.rows[0].masked, scope: E.rows[0].scope, bodyState: E2.detailFace.bodyState, text: E2.detailFace.text, ch: E2.detailFace.textChannel, note: E2.detailFace.note };
/* F 链条缺席 */
const F = C.dispatch(deps({ factState: null }), Object.assign(C.blankState(), { detail: 'commitment:cm1' }), { host: HOST, apis: APIS });
out.chainNoFactState = { state: F.revisionChain.state, reason: F.revisionChain.reason };
const F2 = C.dispatch(deps({ versionsOf: null }), Object.assign(C.blankState(), { detail: 'commitment:cm1' }), { host: HOST, apis: APIS });
out.chainNoVersionsOf = { state: F2.revisionChain.state, reason: F2.revisionChain.reason, counter: F2.revisionChain.counter };
const F3 = C.dispatch(deps({ FACT_STATE: null }), Object.assign(C.blankState(), { detail: 'commitment:cm1' }), { host: HOST, apis: APIS });
out.chainNoFiveStates = { state: F3.revisionChain.state, chain: F3.revisionChain.chain.map((v) => v.state) };
/* G 批量 */
const pick2 = ['commitment:cm1', 'commitment:cm2'];
const G1 = run({}, { batchSelection: { action: 'revoke', refs: pick2 } });
out.batchRevoke = { state: G1.batch.state, selected: G1.batch.selected, rev: G1.batch.reversibleCount, irr: G1.batch.irreversibleCount, ledgerState: G1.batch.ledgerState, faces: G1.batch.faces, undo: G1.batch.undo, irrActions: G1.batch.irreversibleActions, note: G1.batch.note };
const G2 = run({}, { batchSelection: { action: 'keep', refs: pick2 } });
out.batchKeep = { ledgerState: G2.batch.ledgerState, faces: G2.batch.faces, rev: G2.batch.reversibleCount };
const G3 = run({}, { batchSelection: { action: 'hide-generate', refs: pick2 } });
out.batchHide = { ledgerState: G3.batch.ledgerState, faces: G3.batch.faces, rev: G3.batch.reversibleCount };
const G4 = run({}, { batchSelection: { action: '__x__', refs: pick2 } });
out.batchUnknown = { state: G4.batch.state, reason: G4.batch.reason };
const G5 = run({}, { batchSelection: { action: 'revoke', refs: [] } });
out.batchEmpty = { state: G5.batch.state, reason: G5.batch.reason };
const G6 = run({}, { batchSelection: { action: 'revoke', refs: ['commitment:cm1', '__off__'] } });
out.batchPartial = { state: G6.batch.state, affected: G6.batch.affected.length, skipped: G6.batch.skipped, sel: G6.selection };
const G7 = C.dispatch(deps({ FACT_LIFECYCLE: null }), Object.assign(C.blankState(), { batchAction: 'revoke', selection: pick2 }), { host: HOST, apis: APIS });
out.batchNoFL = { state: G7.batch.state, reason: G7.batch.reason };
out.batchNone = run({}).batch;
/* H 导航 */
const base = () => Object.assign(C.blankState(), { actor: '苏晴', ledgers: ['commitment', 'seed'], page: 2, text: '住' });
const N1 = C.navigate(base(), { to: 'detail', ref: 'commitment:cm1' });
out.navIn = { handled: N1.handled, page: N1.state.page, actor: N1.state.actor, ledgers: N1.state.ledgers, text: N1.state.text, detail: N1.state.detail, kept: N1.kept };
const N2 = C.navigate(N1.state, { to: 'profile', profile: 'person|苏晴' });
out.navProfile = { page: N2.state.page, actor: N2.state.actor, profile: N2.state.profile, detail: N2.state.detail };
const N3 = C.navigate(N2.state, { to: 'profile', profile: 'person|苏晴' });
out.navProfileOff = { profile: N3.state.profile };
const N4 = C.navigate(N3.state, { to: 'list' });
out.navOut = { handled: N4.handled, page: N4.state.page, actor: N4.state.actor, detail: N4.state.detail };
const N5 = C.navigate(base(), { to: '__x__' });
out.navUnknown = { handled: N5.handled, ignored: N5.ignored };
const N6 = C.navigate(base(), { to: 'detail', ref: '' });
out.navNoRef = { handled: N6.handled, ignored: N6.ignored };
const S1 = C.step(deps(), base(), 'select', { ref: 'commitment:cm1', mode: 'toggle' }, { host: HOST, apis: APIS });
out.selToggle = { handled: S1.handled, sel: S1.selection, page: S1.state.page, actor: S1.state.actor };
const S2 = C.step(deps(), S1.state, 'select', { ref: 'commitment:cm1', mode: 'toggle' }, { host: HOST, apis: APIS });
out.selUntoggle = { sel: S2.selection };
const S3 = C.step(deps(), base(), 'select', { mode: 'set', refs: ['commitment:cm1', '__off__'] }, { host: HOST, apis: APIS });
out.selSet = { sel: S3.selection, page: S3.state.page };
const S4 = C.step(deps(), S3.state, 'batch', { action: 'revoke' }, { host: HOST, apis: APIS });
out.selBatch = { action: S4.state.batchAction, state: S4.batch.state, sel: S4.state.selection, skipped: S4.batch.skipped, page: S4.state.page, actor: S4.state.actor };
const S5 = C.step(deps(), S4.state, 'batch', { action: '__x__' }, { host: HOST, apis: APIS });
out.selBatchUnknown = { handled: S5.handled, ignored: S5.ignored, action: S5.state.batchAction };
const S6 = C.step(deps(), S4.state, 'select', { mode: 'clear' }, { host: HOST, apis: APIS });
out.selClear = { sel: S6.selection, action: S6.state.batchAction, batch: S6.batch, page: S6.state.page };
const S7 = C.step(deps(), base(), 'select', { ref: 'x', mode: '__x__' }, { host: HOST, apis: APIS });
out.selBadMode = { handled: S7.handled, ignored: S7.ignored };
/* I 渲染 */
const html = C.sheetHtml(Cd);
out.render = { profile: html.indexOf('data-mc="profile"') >= 0, detail: html.indexOf('data-detail="commitment:cm1"') >= 0,
  chain: html.indexOf('data-chain=') >= 0, back: html.indexOf('data-mc="detail-back"') >= 0,
  checkbox: C.sheetHtml(A).indexOf('data-mc="select"') >= 0,
  checkboxChecked: C.sheetHtml(C.step(deps(), C.blankState(), 'select', { ref: A.rows[0].ref, mode: 'toggle' }, { host: HOST, apis: APIS })).indexOf('checked') >= 0,
  selInfo: C.sheetHtml(A).indexOf('已选 0 条') >= 0, batchBtn: C.sheetHtml(G1).indexOf('data-batch="revoke"') >= 0,
  batchState: C.sheetHtml(G1).indexOf('data-batch-state="ok"') >= 0, chAttr: html.indexOf('data-text-channel="projection"') >= 0 };
/* J 零写 */
const before = JSON.stringify([HOST.worldProg, HOST._factVersionState]);
run({ detail: 'commitment:cm1' }, { batchSelection: { action: 'revoke', refs: pick2 } });
C.step(deps(), base(), 'select', { ref: 'commitment:cm1' }, { host: HOST, apis: APIS });
out.zeroWrite = before === JSON.stringify([HOST.worldProg, HOST._factVersionState]);
/* K store 往返 */
const sv = C.saveState(Object.assign(C.blankState(), { profile: 'person|苏晴', detail: 'commitment:cm1', selection: pick2, batchAction: 'revoke', actor: '苏晴', page: 3 }));
const back = C.loadState(sv);
out.store = { profile: sv.profile, detail: sv.detail, sel: sv.selection, batch: sv.batchAction, page: sv.page, actor: sv.actor,
  backProfile: back.profile, backSel: back.selection, backPage: back.page };
/* L 自检/自述 */
out.selfCheck = C.selfCheck(deps());
out.describe = { complete: C.describe(deps()).complete, uiFields: C.describe(deps()).uiFields, views: C.describe(deps()).views.length, actions: C.describe(deps()).actions };
out.keys = C.keysAligned({ FILTERS: Q.FILTERS });
out.optionalDeps = C.OPTIONAL_DEPS.map((d) => d.key);
out.line = C.line(Cd);
console.log(JSON.stringify(out, null, 1));
