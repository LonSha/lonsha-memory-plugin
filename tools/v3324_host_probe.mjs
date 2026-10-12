/* v3.324.0 宿主接线探针：D 包记忆侧第一刀（M3-O5 / M3-O7 / M3-X9）宿主面真跑读数。
 * 目的：把「宿主出口是不是真的能跑、缺席与在场是不是逐字同键」跑成数 ——
 *   判据期望值据此写（不从实现注释抄）。
 * 用法：node tools/v3324_host_probe.mjs > tools/v3324_host_probe.readings.txt
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = process.cwd();
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const IDX = read('index.js');

/* ---------- 加载两个内核（IIFE，与生产同形） ---------- */
function loadIIFE(rel, globalName) {
    const ctx = {
        console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
        isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError,
    };
    ctx.window = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    new vm.Script(read(rel), { filename: rel }).runInContext(ctx);
    return ctx[globalName];
}
const ED = loadIIFE('extraction-driver.js', 'LonShaExtractionDriver');
const CP = loadIIFE('correction-plan.js', 'LonShaCorrectionPlan');

/* ---------- 宿主方法切片（配平跳过字符串/模板串） ---------- */
function sliceMember(src, header) {
    const at = src.indexOf(header);
    if (at < 0) return null;
    const open = src.indexOf('{', at + header.length - 1);
    if (open < 0) return null;
    let d = 0;
    for (let i = open; i < src.length; i++) {
        const c = src[i];
        if (c === '"' || c === "'" || c === '`') {
            let k = i + 1;
            while (k < src.length) {
                if (src[k] === '\\') { k += 2; continue; }
                if (src[k] === c) { k++; break; }
                if (src[k] === '\n' && c !== '`') break;
                k++;
            }
            i = k - 1;
            continue;
        }
        if (c === '{') d++;
        else if (c === '}') { d--; if (d === 0) return src.slice(at, i + 1); }
    }
    return null;
}
const LIB_HEADS = ['function _moduleLib(getGlobal, fileName) {', 'function _extractionDriverLib() {',
    'function _correctionPlanLib() {'];
const METH_HEADS = ['_extractionWindowFloors(message) {', 'extractionPlan(opts) {', '_extractionDriverLine() {',
    'correctionPlanReextract(input, opts) {', 'correctionPlanConfig(feedback, trace, opts) {',
    '_correctionPlanLine() {'];
function mkHost(win, src) {
    const idx = src || IDX;
    const libs = LIB_HEADS.map((h) => sliceMember(idx, h));
    const meths = METH_HEADS.map((h) => sliceMember(idx, h));
    const missL = LIB_HEADS.filter((h, i) => !libs[i]);
    const missM = METH_HEADS.filter((h, i) => !meths[i]);
    if (missL.length || missM.length) {
        throw new Error('切片缺失：取库口[' + missL.join(' / ') + '] 出口[' + missM.join(' / ') + ']');
    }
    return new Function('errLog', 'window',
        libs.join('\n') + '\nreturn ({ ' + meths.join(',\n') + ' });')(() => {}, win);
}
const WIN_FULL = () => ({ LonShaExtractionDriver: ED, LonShaCorrectionPlan: CP });
const out = [];
const P = (k, v) => out.push(k + ' ' + v);

/* ---------- A. 切片存在性（结构位移的早期告警） ---------- */
P('A.slice.libs', LIB_HEADS.join('|'));
P('A.slice.meths', METH_HEADS.join('|'));

/* ---------- B. 恒定键面（缺席 vs 在场） ---------- */
{
    const self = Object.assign(mkHost(WIN_FULL()), { config: { config: { extractionProfile: 'balanced' } }, graph: { edges: new Map() } });
    const eng = Object.assign(mkHost({}), { config: { config: { extractionProfile: 'balanced' } }, graph: { edges: new Map() } });
    const pairs = [
        ['extractionPlan', self.extractionPlan({ floor: 5, entries: [] }), eng.extractionPlan({ floor: 5, entries: [] })],
        ['correctionPlanReextract', self.correctionPlanReextract({ range: { from: 1, to: 3 }, newFacts: [], oldFacts: [] }, {}), eng.correctionPlanReextract({ range: { from: 1, to: 3 }, newFacts: [], oldFacts: [] }, {})],
        ['correctionPlanConfig', self.correctionPlanConfig([{ cls: 'missed' }], {}, {}), eng.correctionPlanConfig([{ cls: 'missed' }], {}, {})],
    ];
    for (const [name, here, absent] of pairs) {
        const k1 = Object.keys(here).join(',');
        const k2 = Object.keys(absent).join(',');
        P('B.' + name + '.keysSame', k1 === k2);
        if (k1 !== k2) { P('B.' + name + '.keysHere', k1); P('B.' + name + '.keysAbsent', k2); }
        P('B.' + name + '.absentOkReason', absent.ok + '/' + absent.reason);
        P('B.' + name + '.keyCount', Object.keys(here).length);
    }
    P('B.line.absent', eng.extractionPlan ? String(eng._extractionDriverLine()) : '—');
    P('B.line.absentCP', String(eng._correctionPlanLine()));
}

/* ---------- C. 真跑通（在场：真窗口 → 真安排；真事实 → 真对照） ---------- */
{
    const chat = [
        { mes: '今天的天气不错。' },
        { mes: '其实我是珞花。' },
        { mes: '嗯，就这样吧。' },
        { mes: '我答应你，会把书还回去。' },
        { mes: '钥匙我放在抽屉里了。' },
    ];
    const win = {
        LonShaExtractionDriver: ED, LonShaCorrectionPlan: CP,
        SillyTavern: { getContext: () => ({ chat: chat }) },
    };
    const self = Object.assign(mkHost(win), {
        config: { config: { extractionProfile: 'balanced' } },
        isOmittedFloor: () => false,
        graph: { edges: new Map() },
    });
    const w = self._extractionWindowFloors({ index: 4 });
    P('C.window', JSON.stringify({ n: w.entries.length, omitted: w.omitted, noFloor: w.noFloor, from: w.from, to: w.to }));
    const ed = self.extractionPlan({ floor: 4, entries: w.entries });
    P('C.ed.ok', ed.ok);
    P('C.ed.readings', JSON.stringify(ed.readings));
    P('C.ed.dueFloors', JSON.stringify(ed.due.map((d) => d.floor)));
    P('C.ed.batchedAll', ed.batched.length);
    P('C.ed.line', String(self._extractionDriverLine()));
    /* 档位真消费：换档必须真的改变安排（否则配置是死配置的另一种形态） */
    const low = self.extractionPlan({ floor: 4, entries: w.entries, profile: 'low-cost' });
    P('C.ed.profileSwitch.nextBatchFloor', ed.nextBatchFloor + '->' + low.nextBatchFloor);
    P('C.ed.profileSwitch.sameDue', JSON.stringify(ed.due.map((d) => d.floor)) === JSON.stringify(low.due.map((d) => d.floor)));

    const oldFacts = [{ key: 'f1', value: '北京', floor: 3 }];
    const newFacts = [{ key: 'f1', value: '上海', floor: 3, stale: true }, { key: 'f2', value: '同事', floor: 4 }];
    const rx = self.correctionPlanReextract({ range: { from: 3, to: 4 }, oldFacts: oldFacts, newFacts: newFacts }, {});
    P('C.cp.ok', rx.ok);
    P('C.cp.byOutcome', JSON.stringify(rx.byOutcome));
    P('C.cp.writes', rx.writes);
    P('C.cp.line', String(self._correctionPlanLine()));
    const noRange = self.correctionPlanReextract({ newFacts: newFacts, oldFacts: oldFacts }, {});
    P('C.cp.noRange.scoped', noRange.scoped + '/' + noRange.decidable + '/items' + noRange.items.length);
    P('C.cp.noRange.keysSame', Object.keys(noRange).join(',') === Object.keys(rx).join(','));

    const cfgAbsent = self.correctionPlanConfig([{ cls: 'missed' }], {}, {});
    const cfgUnmeas = self.correctionPlanConfig([{ cls: 'missed' }], { compare: { measurable: false } }, {});
    const cfgOk = self.correctionPlanConfig([{ cls: 'missed' }], { compare: { measurable: true }, holdout: { measured: true, improved: true } }, {});
    P('C.cfg.states', [cfgAbsent.compareState, cfgUnmeas.compareState, cfgOk.compareState].join('/'));
    P('C.cfg.proofs', [cfgAbsent.proof, cfgUnmeas.proof, cfgOk.proof].join('/'));
    P('C.cfg.keysSame', [cfgAbsent, cfgUnmeas, cfgOk].map((x) => Object.keys(x).join(',')).every((k) => k === Object.keys(cfgOk).join(',')));
    P('C.cfg.noFeedback', JSON.stringify(self.correctionPlanConfig([], null, {}).reason));
    P('C.cfg.line', String(self._correctionPlanLine()));
}

/* ---------- D. 真每轮调用点（源码级）：必须真的在 onMessageReceived 里、且真被算 ---------- */
{
    const i = IDX.indexOf('async onMessageReceived(');
    const j = IDX.indexOf('\n        }', i);
    const omr = IDX.slice(i, j < 0 ? i + 20000 : j);
    P('D.omr.hasDriverCall', omr.indexOf('_extractionDriverLib()') >= 0);
    P('D.omr.callsPlan', omr.indexOf('_ED.plan(') >= 0);
    P('D.omr.recordsRead', omr.indexOf('this._extractionDriverRead =') >= 0);
    /* 真调用点必须在门控段之后、且**不改**门控既有判定：门控三处关键字仍在原位 */
    P('D.omr.triggerStillThere', omr.indexOf('smartTriggerEnabled === true') >= 0
        && omr.indexOf('_triggerDecision.triggered === false') >= 0
        && omr.indexOf('this.extractMemorySimple(message)') >= 0);
    P('D.omr.driverAfterTrigger', omr.indexOf('onMessageReceived.事件性门控') < omr.indexOf('onMessageReceived.抽取节奏'));
    P('D.idx.libOnce', IDX.split('function _extractionDriverLib() {').length - 1);
    P('D.idx.libOnce2', IDX.split('function _correctionPlanLib() {').length - 1);
}

/* ---------- E. 配置旋钮两跳可达（scan_config_liveness 同款口径的轻量自查） ---------- */
{
    const cfg = read('memory-config.js');
    const ui = read('settings-ui.js');
    P('E.cfg.declared', /extractionProfile:\s*'balanced'/.test(cfg));
    P('E.ui.control', ui.indexOf('data-cfg-text="extractionProfile"') >= 0);
    const i = IDX.indexOf('async onMessageReceived(');
    const j = IDX.indexOf('\n        }', i);
    const omr = IDX.slice(i, j < 0 ? i + 20000 : j);
    P('E.idx.consumedInOmr', omr.indexOf('this.config.config.extractionProfile') >= 0);
    P('E.idx.consumedInExit', IDX.indexOf('this.config.config.extractionProfile') >= 0);
}

/* ---------- F. selfCheck 体检面两行（分列 + 缺席归因） ---------- */
{
    P('F.face.extractionDriver', IDX.indexOf("['抽取节奏', line + (bad ? ' ⚠️' : '')]") >= 0);
    P('F.face.correctionPlan', IDX.indexOf("['纠错方案', line + (bad ? ' ⚠️' : '')]") >= 0);
    /* 分列的定义是「各占一行、行名互不相同」，不是「谁排在谁前面」、也不是「出现几次」：
     *   既有面的早退三态（未启用 / 模块不可用 / 诊断异常）本来就会让同一个面名出现多次。
     *   合并才是缺陷：**同一行里出现两个面名**，或把两个面名拼成一个新面名。 */
    const faceNames = ['门控读数', '提取反馈', '抽取节奏', '纠错方案'];
    const faceIdx = faceNames.map((n) => IDX.indexOf("['" + n + "'"));
    P('F.face.allPresent', faceIdx.every((i) => i >= 0));
    P('F.face.distinct', new Set(faceIdx).size === faceIdx.length);
    const dupLines = IDX.split('\n').filter((ln) => faceNames.filter((n) => ln.indexOf("['" + n + "'") >= 0).length > 1);
    P('F.face.noMergedLine', dupLines.length === 0);
    if (dupLines.length) P('F.face.mergedSample', dupLines[0].trim().slice(0, 120));
    const glued = faceNames.some((a) => faceNames.some((b) => a !== b && IDX.indexOf("['" + a + '/' + b) >= 0));
    P('F.face.noGluedName', !glued);
}

process.stdout.write(out.join('\n') + '\n');
