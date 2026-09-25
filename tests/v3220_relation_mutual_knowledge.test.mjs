/* ============================================================
 * tests/v3220_relation_mutual_knowledge.test.mjs — [v3.219.0] Gate R2-F
 *
 * 版本锚点（v3.219.0）：本套件恰好锚着它自己的出生版本，供版本守卫 V4 取基准。
 *
 * 主题：**「没给」与「给了别的」不得同形**（双向关系）+ **「同一件事的另一种说法」不得被读成「另一件事」**（知情网络）。
 *
 * 修前实测（真源码重放）：
 *   A 双向关系：buildInjection 的 [角色关系] 块只把召回边原样列出，没有任何一格说「对侧那条在不在」。
 *     于是「乙对甲是警惕」与「乙对甲从未登记」在注入面上**同形**，而后者是提取漏了一条（该补记）。
 *     更细：「对侧不在」有三种来源（本轮被披露条件挡下 / 已失效 / 压根没登记），处置方向互不相同，压成一态就会让模型去补一条不该补的关系。
 *   B 知情网络：markUnaware / revealKnowledge 用 includes / !== 逐字比较。
 *     同一件事三种措辞记 **3 条**；用「博丽灵梦告知了水晶被盗的事」去解除，**一条都清不掉** —— 认知隔离永不解除。
 *     另：getReEntryNotice 只取前 3 条，前 3 格被同一件事的旧措辞占死，真实新增的认知边界永远挤不进去。
 *
 * 负控制一律：真源码破坏（锚点恰中 1 次）→ 载入破坏副本 → 在副本上重跑**同款判据**。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { stripComments } from './_audit_lib.mjs';
const R = process.cwd();
const require_ = createRequire(import.meta.url);
const idxSrc = fs.readFileSync(path.join(R, 'index.js'), 'utf8');
const RM_SRC = fs.readFileSync(path.join(R, 'relation-mutual.js'), 'utf8');
const KN_SRC = fs.readFileSync(path.join(R, 'knowledge-network.js'), 'utf8');
const RM = require_(path.join(R, 'relation-mutual.js'));
const KN = require_(path.join(R, 'knowledge-network.js'));

function blockAt(src, at) {
    if (at < 0) return null;
    const open = src.indexOf('{', at);
    if (open < 0) return null;
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > 0 ? src.slice(at, end + 1) : null;
}
function blockOf(src, header) {
    const at = src.indexOf(header);
    assert.ok(at >= 0, '锚点必须存在：' + header);
    const n = src.split(header).length - 1;
    assert.strictEqual(n, 1, '锚点必须唯一（恰中 1 次）：' + header + '（实 ' + n + ' 次）');
    return blockAt(src, at);
}
function breakSource(src, anchor, replacement) {
    const n = src.split(anchor).length - 1;
    assert.strictEqual(n, 1, '破坏锚点必须恰中 1 次：' + anchor.slice(0, 48) + '（实 ' + n + ' 次）');
    return src.replace(anchor, replacement);
}
/** 加载被破坏的模块副本（副本会自挂全局，用完必须还原）。 */
function loadBroken(src, mutate, globalName) {
    const broken = mutate(src);
    assert.notStrictEqual(broken, src, '破坏必须真的发生');
    const saved = globalThis[globalName];
    const tmp = path.join(R, '__negctl_r2f.tmp.cjs');
    fs.writeFileSync(tmp, broken);
    let api;
    try {
        delete require_.cache[require_.resolve(tmp)];
        api = require_(tmp);
    } finally {
        try { fs.unlinkSync(tmp); } catch (_e) { /* 清理失败不影响判定 */ }
        if (saved) { try { globalThis[globalName] = saved; } catch (_e) { /* 冻结全局：忽略 */ } }
    }
    return api;
}

/* ──────────────────────────────────────────────────────────
 * A 双向关系对账
 * ──────────────────────────────────────────────────────── */
const E = (from, to, extra) => Object.assign({ from, to, label: '挚友', active: true }, extra || {});

/** 判据：四态互不相同且各落各的格（正负两跑）。 */
function jMutualFour(mod) {
    const edges = [
        E('a', 'b'), E('b', 'a'),            // 双向且两侧都进注入
        E('c', 'd'),                          // 对侧在图里但本轮没进注入（被挡）
        E('d', 'c', { label: '警惕' }),
        E('e', 'f', { active: false }),       // 对侧已失效
        E('f', 'e'),
        E('g', 'h'),                          // 对侧压根不在
    ];
    const kept = [edges[0], edges[1]];
    const r = mod.reconcile(edges, kept, { maxList: 5 });
    /* 计数按**边**而不是按**对**：d→c 在图里但没进注入（gated）、c→d 同理（gated）、
     *   e→f 的对侧 f→e 在注入里但 e→f 自己 active===false 不在 kept 里（gated）。
     *   故 gated=3、oneSided=1（只有 g→h 的对侧压根不在图里）。 */
    if (r.mutual !== 2) return { ok: false, why: '双向应为 2，实 ' + r.mutual };
    if (r.mutualGated !== 3) return { ok: false, why: '被挡应为 3，实 ' + r.mutualGated };
    if (r.mutualExpired !== 1) return { ok: false, why: '已失效应为 1，实 ' + r.mutualExpired };
    if (r.oneSided !== 1) return { ok: false, why: '对侧未登记应为 1，实 ' + r.oneSided };
    // 注解只落在 one-sided 上
    const ann = mod.annotate(edges[6], r);
    if (!ann) return { ok: false, why: '★ 对侧未登记的边没有标注' };
    const annGated = mod.annotate(edges[2], r);
    if (annGated) return { ok: false, why: '★ 被挡下的边也被标注了（标注等于把不该说的关系又说了出来）' };
    return { ok: true, why: '' };
}

test('v3220 1. 工具自证：锚点不存在/不唯一、破坏打偏都必须抛', () => {
    assert.throws(() => blockOf(idxSrc, '这个方法不存在(zz) {'), /锚点必须存在/);
    assert.throws(() => breakSource(idxSrc, '绝不存在的串zzz', 'x'), /恰中 1 次/);
    assert.throws(() => breakSource(idxSrc, 'function', 'x'), /恰中 1 次/);
});
test('v3220 2. 四态互不相同：双向 / 被挡 / 已失效 / 未登记各落各的格（判据：jMutualFour）', () => {
    const r = jMutualFour(RM);
    assert.equal(r.ok, true, r.why);
});
test('v3220 3. 自指与畸形不进任何一态，且单独可见', () => {
    const r = RM.reconcile([{ from: 'a', to: 'a' }, { from: '', to: 'b' }, null, 'x'], [], {});
    assert.strictEqual(r.self, 1, '自指必须单独计');
    assert.ok(r.malformed >= 3, '畸形必须单独计：' + r.malformed);
    assert.strictEqual(r.total, 0, '畸形/自指不得混进对账总数');
    const bad = RM.reconcile('not-an-array', [], {});
    assert.strictEqual(bad.malformedInput, true, '★ 输入不是数组必须与「空图」分开报');
    assert.strictEqual(RM.reconcile([], [], {}).malformedInput, false, '空图不是畸形输入');
});
test('v3220 4. 清单截断必须可见（「只列了 5 条」≠「真的只有 5 条」）', () => {
    const edges = [];
    for (let i = 0; i < 8; i++) edges.push(E('a' + i, 'b' + i));
    const r = RM.reconcile(edges, [], { maxList: 5 });
    assert.strictEqual(r.oneSided, 8);
    assert.strictEqual(r.oneSidedList.length, 5);
    assert.strictEqual(r.truncated, 3, '★ 截断条数必须报出来');
});
test('v3220 5. 读数一句话四态分开说，不得压成一格', () => {
    const r = RM.reconcile([E('a', 'b'), E('b', 'a'), E('c', 'd', { active: false }), E('d', 'c'), E('e', 'f')], [E('a', 'b'), E('b', 'a')], {});
    const line = RM.line(r);
    assert.ok(line.includes('双向'), '双向必须出现');
    assert.ok(line.includes('被挡'), '被挡必须单独出现');
    assert.ok(line.includes('已失效'), '已失效必须单独出现');
    assert.ok(line.includes('未登记'), '未登记必须单独出现');
});

/* ────────────────────────────────────────────────────────
 * B 知情网络
 * ──────────────────────────────────────────────────────── */
const F_LONG = '地下室魔法水晶被神秘黑影盗走';
const F_SHORT = '魔法水晶被盗';
const F_OTHER = '红美铃被迷药击倒昏睡';
const F_TOLD = '博丽灵梦告知了水晶被盗的事';

/** 判据：同一件事不堆积、措辞漂移的解除真的能解除（正负两跑）。 */
function jKnowledgeSame(mod) {
    const rec = { known: [], unaware: [] };
    const a = mod.reconcile(rec, F_LONG, 'unaware');
    if (a.verdict !== 'new') return { ok: false, why: '首次登记应为 new，实 ' + a.verdict };
    rec.unaware.push(F_LONG);
    const b = mod.reconcile(rec, F_SHORT, 'unaware');
    if (!b.dup) return { ok: false, why: '★ 同一件事的另一种措辞没被判为重复（修前形态：堆积 3 条）' };
    const c = mod.reconcile(rec, F_OTHER, 'unaware');
    if (c.dup || c.verdict === 'same') return { ok: false, why: '★ 两件不同的事被误合并（误合并 = 真实的信息边界被静默抹掉）' };
    rec.unaware.push(F_OTHER);
    const d = mod.reconcile(rec, F_SHORT, 'reveal');
    if (!(d.same && d.same.side === 'unaware')) return { ok: false, why: '★ 措辞漂移的解除没有命中已登记的那条' };
    if (d.same.index !== 0) return { ok: false, why: '解除必须按**下标**定位（值不等于措辞），实 ' + d.same.index };
    return { ok: true, why: '' };
}
/** 判据：告知式措辞判不开时必须**可见**（疑似档），且不得误合并。 */
function jKnowledgeNear(mod) {
    const rec = { known: [], unaware: [F_LONG, F_OTHER] };
    const r = mod.reconcile(rec, F_TOLD, 'reveal');
    if (r.same) return { ok: false, why: '★ 告知式措辞被误判为同一件事（误合并会让角色提前知道他不该知道的事）' };
    if (!r.suspect) return { ok: false, why: '★ 判不开的告知式措辞必须进疑似档（修前它与「没有同事实」同形）' };
    if (!r.nearList.length) return { ok: false, why: '疑似档必须带出候选原文' };
    if (!r.nearList.some(x => x.text === F_LONG)) return { ok: false, why: '候选必须指向真正相关的那条' };
    if (r.nearList.some(x => x.text === F_OTHER)) return { ok: false, why: '★ 无关事实被列进疑似候选' };
    return { ok: true, why: '' };
}

test('v3220 6. 同一件事不堆积、措辞漂移可解除，两件不同的事不误合并（判据：jKnowledgeSame）', () => {
    const r = jKnowledgeSame(KN);
    assert.equal(r.ok, true, r.why);
});
test('v3220 7. 告知式措辞判不开时进疑似档（可见、不合并、带候选）（判据：jKnowledgeNear）', () => {
    const r = jKnowledgeNear(KN);
    assert.equal(r.ok, true, r.why);
});
test('v3220 8. 已知侧有同事实 ⇒ 不再登记为「不知道」（两条相反指令不得并存）', () => {
    const rec = { known: [F_SHORT], unaware: [] };
    const r = KN.reconcile(rec, F_LONG, 'unaware');
    assert.strictEqual(r.already, true, '★ 已知的事被再登记为不知道：提示区会同时给出相反指令');
    assert.strictEqual(r.dup, false);
});
test('v3220 9. 解除的两个动作互相独立：已知侧已有同事实不得拦住清掉未知侧', () => {
    const rec = { known: [F_SHORT], unaware: [F_LONG] };
    const r = KN.reconcile(rec, '魔法水晶被盗', 'reveal');
    assert.ok(r.same && r.same.side === 'unaware', '★ 未知侧的同事实没有被点名（命中已知就 return 会把它漏掉）');
    assert.strictEqual(r.already, true, '已知侧的幂等同时成立');
});
test('v3220 10. 判不开一律判不同：空串、短片段、无关短句', () => {
    assert.strictEqual(KN.sameFact('', '水晶被盗'), false);
    assert.strictEqual(KN.sameFact('受伤', '左手受伤缠着绷带'), false, '过短片段不得按子串误合并');
    assert.strictEqual(KN.reconcile({ known: [], unaware: [F_OTHER] }, '今天天气很好', 'reveal').suspect, false,
        '无关短句不得进疑似档');
    const bad = KN.reconcile(null, '  ', 'unaware');
    assert.strictEqual(bad.degraded, true, '空事实必须降级而不是冒充 new');
});
test('v3220 11. 读数一句话：疑似档单独出现，模块缺席不伪装成全零', () => {
    const line = KN.line({ marked: 2, merged: 1, released: 1, suspect: 3 });
    assert.ok(line.includes('疑似未合并'), '疑似档必须单独报');
    assert.ok(line.includes('解除'), '解除必须单独报');
    assert.strictEqual(KN.line({ moduleMissing: true }).includes('模块未加载'), true, '缺席不得伪装成「没有可合并的」');
});

/* ────────────────────────────────────────────────────────
 * C 宿主接线面
 * ──────────────────────────────────────────────────────── */
test('v3220 12. 宿主真接线：注入侧调对账并只标 one-sided；认知侧按同一件事登记与解除', () => {
    const code = stripComments(idxSrc);
    const inj = code.slice(code.indexOf('[\u89d2\u8272\u5173\u7cfb]'), code.indexOf('[\u89d2\u8272\u5173\u7cfb]') + 6000);
    assert.ok(/LonShaRelationMutual/.test(inj), '注入侧必须走双向对账模块');
    assert.ok(/annotate\(/.test(inj), '渲染必须调标注');
    assert.ok(/_relationMutualRead/.test(code), '对账读数必须落在宿主上（否则诊断面读不到）');
    const mu = blockOf(code, 'markUnaware(charName, fact) {');
    assert.ok(/reconcile\(/.test(mu), '★ 登记必须经知情网络判定（修前是 includes 逐字比较）');
    assert.ok(/rec\.dup/.test(mu), '重复登记必须被拦下');
    const rv = blockOf(code, 'revealKnowledge(charName, fact, source = \'\') {');
    assert.ok(/reconcile\(/.test(rv), '★ 解除必须经知情网络判定');
    assert.ok(/splice\(/.test(rv), '解除必须按**下标**删（值不等于措辞）');
    assert.ok(!/filter\(x => x !== fact\)/.test(rv.split('if (!KN)')[0] || ''),
        '★ 模块在位时不得回落逐字比较');
});
test('v3220 14. 本 Gate 属于 v3.219.0（出生版本锚点，供版本守卫 V4 取基准）', () => {
    const ver = (idxSrc.match(/const VERSION = '([^']+)'/) || [])[1];
    const vnum = (s) => {
        const m = /^([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(String(s || '').trim());
        return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
    };
    assert.ok(vnum(ver) >= vnum('3.219.0'), '★ 版本不得低于本套件出生版本 3.219.0（实 ' + ver + '）');
});
test('v3220 13. 诊断行真进 selfCheck 的 rows：双向对账 + 知情网络，报警只认真损失', () => {
    const sc = blockOf(idxSrc, 'async selfCheck() {');
    assert.ok(sc.includes("['\u53cc\u5411\u5bf9\u8d26'"), 'rows 必须有双向对账行');
    assert.ok(sc.includes("['\u77e5\u60c5\u7f51\u7edc'"), 'rows 必须有知情网络行');
    const around = sc.slice(sc.indexOf("['\u53cc\u5411\u5bf9\u8d26'" ) - 600, sc.indexOf("['\u53cc\u5411\u5bf9\u8d26'"));
    assert.ok(/oneSided\s*>\s*0/.test(around), '★ 报警只认「对侧未登记」（被挡/已失效是正常态，不该报警）');
    const mf = JSON.parse(fs.readFileSync(path.join(R, 'manifest.json'), 'utf8'));
    assert.ok(mf.extra_js.includes('relation-mutual.js'), 'manifest 登记 relation-mutual.js');
    assert.ok(mf.extra_js.includes('knowledge-network.js'), 'manifest 登记 knowledge-network.js');
});

/* ────────────────────────────────────────────────────────
 * N 负控制（真源码破坏 → 同款判据翻红）
 * ──────────────────────────────────────────────────────── */
test('v3220 N1. 破坏：对侧判定改按无序键 ⇒ 四态判据必须现形', () => {
    const anchor = 'const rev = byDir.get(edgeKey(to, from));';
    assert.ok(RM_SRC.includes(anchor), '对侧反查锚点在位');
    const B = loadBroken(RM_SRC, (s) => breakSource(s, anchor, 'const rev = byDir.get(edgeKey(from, to));   // 破坏：改查自身（方向性被抹平）'), 'LonShaRelationMutual');
    const r = jMutualFour(B);
    assert.equal(r.ok, false, '方向性被抹平，判据却没转红');
});
test('v3220 N2. 破坏：对侧失效判定被摘掉 ⇒ 已失效被读成「被挡」（同款判据现形）', () => {
    const anchor = '} else if (Array.isArray(rev) && rev.length) {';
    assert.ok(RM_SRC.includes(anchor), '失效分支锚点在位');
    const B = loadBroken(RM_SRC, (s) => breakSource(s, anchor, '} else if (false) {   // 破坏：已失效不再单独成态'), 'LonShaRelationMutual');
    const edges = [E('e', 'f', { active: false }), E('f', 'e')];
    const r = B.reconcile(edges, [edges[1]], {});
    assert.strictEqual(r.mutualExpired, 0, '★ 破坏副本上已失效仍被单独计数（破坏没触到机制）');
    /* 失效分支被摘掉后，那条边会顺着 else 落进 one-sided —— 「曾经存在但已失效」被读成「压根没登记」，
     *   正是本模块要分开的两态被压回了一态。 */
    assert.ok(r.oneSided > 0, '★ 已失效的边没有落进任何一态（破坏把分支删掉了而不是改写）');
});
test('v3220 N3. 破坏：疑似档被提升成同事实 ⇒ 同款判据必须现形（误合并）', () => {
    const anchor = 'if (short.length >= MIN_BIGRAM && hit >= NEAR_HITS) out.near = true;';
    assert.ok(KN_SRC.includes(anchor), '疑似档锚点在位');
    const B = loadBroken(KN_SRC, (s) => breakSource(s, anchor, 'if (short.length >= MIN_BIGRAM && hit >= NEAR_HITS) { out.same = true; out.near = true; }   // 破坏：疑似被当成确定'), 'LonShaKnowledgeNetwork');
    const r = jKnowledgeNear(B);
    assert.equal(r.ok, false, '疑似被提升成确定，判据却没转红');
    assert.ok(/误判为同一件事/.test(r.why), '转红原因须指向真因：' + r.why);
});
test('v3220 N4. 破坏：解除改回二选一 ⇒ 同款判据必须现形（未知侧清不掉）', () => {
    const anchor = 'if (iu >= 0) {';
    // 该锚点在解除分支内恰中 1 次；用更长的上下文保证唯一
    const anchor2 = "if (iu >= 0) {\n                    out.verdict = 'same';";
    assert.ok(KN_SRC.includes(anchor2), '解除分支锚点在位');
    const B = loadBroken(KN_SRC, (s) => breakSource(s, anchor2, "if (false && iu >= 0) {   // 破坏：命中已知就不再清未知侧\n                    out.verdict = 'same';"), 'LonShaKnowledgeNetwork');
    const rec = { known: [F_SHORT], unaware: [F_LONG] };
    const r = B.reconcile(rec, '水晶被盗', 'reveal');
    assert.ok(!(r.same && r.same.side === 'unaware'), '★ 破坏副本上未知侧仍能被点名（破坏没触到机制）');
});
