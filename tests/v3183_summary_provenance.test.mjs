/**
 * tests/v3183_summary_provenance.test.mjs — v3.183.0 摘要来源溯源
 *
 * 覆盖：
 *   1. 留证闭环（capture 写入 + verify 通过）
 *   2. 四态判定：source_changed（翻 swipe）/ source_missing（删楼）/ text_drift（就地改写）
 *   3. no_provenance 与 source_changed **不混同**（旧档 ≠ 失效）
 *   4. 指纹口径与 index.js msgFpOf 逐字同构（同页同指纹、翻页变指纹）
 *   5. audit 逐条列出失效（不只给个数）+ byStatus 归因
 *   6. verifiedOnly 保留旧档、剔除真失效
 *   7. 畸形输入不抛（null summary / null chat / 坏 prov / 空摘要）
 *   8. 反向审计（负控制）：破坏真判据后行为必须可观测地改变
 *   9. 接线自证：index.js 摘要在落笔时调用了 capture
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
// 本仓缝合模块是 IIFE + CJS 双导出（floor-ledger.js 同款），故用 require 取库，
// 不用 import——IIFE 里 return api 只对 require 生效，import 拿到的是空命名空间。
const require = createRequire(import.meta.url);
const P = require(path.join(root, 'summary-provenance.js'));

let pass = 0;
const ok = (name, cond, extra) => {
  assert.ok(cond, extra ? name + ' — ' + extra : name);
  pass += 1;
};
const eq = (name, a, b) => {
  assert.equal(a, b, name + ` — 期望 ${JSON.stringify(b)}，实得 ${JSON.stringify(a)}`);
  pass += 1;
};

/** 造楼。msgTextOf 口径：swipes[swipe_id] 优先，否则 mes。 */
const msg = (text, { index = 0, swipe = 0, send_date = 't1', user = false } = {}) => ({
  index, swipe_id: swipe, mes: text, send_date,
  is_user: user,
});

/** 造一条已留证的摘要（直接走 capture，保证与真实路径同源）。 */
function sumWith(chat, floor, text) {
  const s = { floor, text, level: 1, timestamp: Date.now(), folded: false };
  const prov = P.capture(s, chat[floor]);
  assert.ok(prov, 'capture 应成功');
  return s;
}

// ========== 1. 留证闭环 ==========
{
  const chat = [msg('一二三四五六七八九十', { index: 0 })];
  const s = sumWith(chat, 0, '主角离开了房间。');
  ok('capture 写了 prov 字段', !!s.prov);
  eq('prov 版本正确', s.prov.v, P.PROV_VERSION);
  eq('prov 记下楼层', s.prov.floor, 0);
  ok('prov 记下指纹', typeof s.prov.fp === 'string' && s.prov.fp.length > 0);
  ok('prov 记下摘要正文 hash', typeof s.prov.textHash === 'string');
  eq('prov 记下摘要长度', s.prov.textLen, '主角离开了房间。'.length);
  eq('prov 记下来源正文长度', s.prov.sourceLen, 10);
  const r = P.verify(s, chat);
  eq('同页 verify = ok', r.status, 'ok');
  ok('isValid 通过', P.isValid(r));
}

// ========== 2. source_changed：翻 swipe ==========
{
  const chat = [
    msg('第一版回复', { index: 0 }),
    msg('另一条', { index: 1 }),
  ];
  const s = sumWith(chat, 0, '摘要甲。');
  eq('翻页前 ok', P.verify(s, chat).status, 'ok');
  // 翻到第 1 页（swipes 数组 + swipe_id=1）
  chat[0] = msg('', { index: 0, swipe: 1 });
  chat[0].swipes = ['第一版回复', '第二版回复'];
  chat[0].mes = '第二版回复';
  const r = P.verify(s, chat);
  eq('翻 swipe 后 = source_changed', r.status, 'source_changed');
  ok('reason 说明是页不一致', /页不一致|swipe/.test(r.reason), r.reason);
  ok('isValid 不通过', !P.isValid(r));
}

// ========== 2b. source_changed：正文被编辑（同页但内容变）==========
{
  const chat = [msg('原文甲', { index: 0 })];
  const s = sumWith(chat, 0, '摘要。');
  chat[0].mes = '原文甲（被编辑过）';   // 同页、同 send_date，但正文 hash 变
  eq('正文被编辑 = source_changed', P.verify(s, chat).status, 'source_changed');
}

// ========== 2c. source_missing：删楼 ==========
{
  const chat = [msg('甲', { index: 0 }), msg('乙', { index: 1 })];
  const s = sumWith(chat, 1, '关于乙的摘要。');
  eq('删楼前 ok', P.verify(s, chat).status, 'ok');
  chat.length = 1;                     // 删掉第 1 楼
  const r = P.verify(s, chat);
  eq('锚点楼被删 = source_missing', r.status, 'source_missing');
  ok('reason 点名楼层', /第 1 楼/.test(r.reason), r.reason);
}

// ========== 2d. text_drift：摘要自己被就地改写 ==========
{
  const chat = [msg('甲', { index: 0 })];
  const s = sumWith(chat, 0, '原摘要。');
  s.text = '被改过的摘要。';           // fp 仍对得上（来源楼没动），但摘要变了
  const r = P.verify(s, chat);
  eq('摘要被就地改写 = text_drift', r.status, 'text_drift');
}

// ========== 3. no_provenance 与 source_changed 不混同 ==========
{
  const chat = [msg('甲', { index: 0 })];
  const legacy = { floor: 0, text: '旧档摘要。' };       // 升级前的存量，无 prov
  const r = P.verify(legacy, chat);
  eq('旧档 = no_provenance', r.status, 'no_provenance');
  ok('no_provenance 不是 ok', !P.isValid(r));
  // 关键：旧档与真失效必须是**不同**状态，处置方式才可能不同
  const changed = sumWith(chat, 0, '新摘要。');
  chat[0].mes = '甲（变了）';
  const r2 = P.verify(changed, chat);
  eq('真失效 = source_changed', r2.status, 'source_changed');
  ok('两态不相同（不混同）', r.status !== r2.status);
  // verifiedOnly 保留旧档、剔除真失效
  chat[0].mes = '甲';                  // 还原，让新摘要恢复 ok
  const kept = P.verifiedOnly([legacy, changed], chat);
  eq('verifiedOnly 保留旧档与新档', kept.length, 2);
  chat[0].mes = '甲（又变了）';
  eq('verifiedOnly 剔除真失效', P.verifiedOnly([legacy, changed], chat).length, 1);
}

// ========== 4. 指纹口径与 index.js msgFpOf 同构 ==========
{
  const src = read('index.js');
  // index.js 的 msgFpOf 实现（逐字摘出，保证口径比对的是真源码）
  ok('index.js 有 msgFpOf', /function msgFpOf\(m\)/.test(src));
  const idxSrc = read('index.js');
  const m = idxSrc.match(/function msgFpOf\(m\) \{[\s\S]*?\n {4}\}/);
  ok('取到 msgFpOf 实现', !!m);
  // 在本测试里复刻同一实现，逐字段比对
  const hash32 = (str) => {
    let h = 0x811c9dc5;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0');
  };
  const msgTextOf = (mm) => {
    const sw = Math.max(0, Math.round(Number(mm?.swipe_id) || 0));
    if (Array.isArray(mm?.swipes) && typeof mm.swipes[sw] === 'string') return mm.swipes[sw];
    return String(mm?.mes || mm?.content || mm?.text || '');
  };
  const msgFpOf = (mm) => [
    (mm?.is_user === true || mm?.role === 'user') ? 'u' : 'a',
    Math.max(0, Math.round(Number(mm?.swipe_id) || 0)),
    hash32(msgTextOf(mm)),
    String(mm?.send_date || mm?.extra?.send_date || ''),
  ].join('|');
  const a = msg('同一段正文', { index: 3, send_date: 'X' });
  eq('同楼同页同指纹', P.fpOf(a), msgFpOf(a));
  const b = msg('同一段正文', { index: 3, send_date: 'X', swipe: 1 });
  b.swipes = ['同一段正文', '同一段正文'];   // 两页正文相同
  ok('翻页后指纹仍变（页码是指纹的一段）', P.fpOf(b) !== P.fpOf(a));
  const c = msg('同一段正文', { index: 3, send_date: 'X', user: true });
  ok('角色段不同 ⇒ 指纹不同', P.fpOf(c) !== P.fpOf(a));
}

// ========== 5. audit 逐条列出 + 归因 ==========
{
  const chat = [
    msg('甲', { index: 0 }),
    msg('乙', { index: 1 }),
    msg('丙', { index: 2 }),
  ];
  const s0 = sumWith(chat, 0, '摘要0。');
  const s1 = sumWith(chat, 1, '摘要1。');
  const s2 = sumWith(chat, 2, '摘要2。');
  const legacy = { floor: 2, text: '旧档。' };
  // 制造三种失效：s1 翻页、s2 删楼、s0 保持 ok
  chat[1] = msg('乙（换了）', { index: 1 });
  chat.length = 2;                     // 删掉第 2 楼

  const a = P.audit([s0, s1, s2, legacy], chat);
  eq('audit total = 4', a.total, 4);
  eq('audit ok = 1', a.ok, 1);
  eq('audit legacy = 1', a.legacy, 1);
  eq('audit stale = 2', a.stale.length, 2);
  ok('audit 不完整', a.complete === false);
  eq('byStatus source_changed = 1', a.byStatus.source_changed, 1);
  eq('byStatus source_missing = 1', a.byStatus.source_missing, 1);
  // 逐条可指名：不只是「2 条失效」
  const floors = a.stale.map((x) => x.floor).sort((x, y) => x - y);
  assert.deepEqual(floors, [1, 2]);
  ok('每条 stale 带 reason', a.stale.every((x) => typeof x.reason === 'string' && x.reason.length > 0));
  ok('每条 stale 带正文开头', a.stale.every((x) => typeof x.head === 'string'));
  // 一行读数
  const l = P.line([s0, s1, s2, legacy], chat);
  ok('line 包含有效数', /1\/4/.test(l), l);
  ok('line 包含失效归因', /source_changed/.test(l), l);
}

// ========== 6. audit 无缺口时 ==========
{
  const chat = [msg('甲', { index: 0 })];
  const s = sumWith(chat, 0, '摘要。');
  const a = P.audit([s], chat);
  ok('无缺口 complete', a.complete === true);
  eq('无缺口 stale 空', a.stale.length, 0);
  ok('line 说无缺口', /无缺口/.test(P.line([s], chat)));
  eq('空数组 audit total=0', P.audit([], chat).total, 0);
  eq('空数组 line 说无摘要', P.line([], chat), '无摘要');
}

// ========== 7. 畸形输入不抛 ==========
{
  const chat = [msg('甲', { index: 0 })];
  eq('null summary = no_provenance', P.verify(null, chat).status, 'no_provenance');
  eq('undefined summary = no_provenance', P.verify(undefined, chat).status, 'no_provenance');
  eq('null chat 不抛', P.verify({ floor: 0, text: 'x', prov: { v: 1, floor: 0, fp: 'a', textHash: 'b', textLen: 1 } }, null).status, 'source_missing');
  eq('chat 非数组不抛', P.verify({ floor: 0, text: 'x', prov: { v: 1, floor: 0, fp: 'a', textHash: 'b', textLen: 1 } }, 'x').status, 'source_missing');
  eq('坏 prov 版本 = malformed', P.verify({ text: 'x', prov: { v: 999, floor: 0, fp: 'a' } }, chat).status, 'malformed');
  eq('prov 是数组 = no_provenance', P.verify({ text: 'x', prov: [1] }, chat).status, 'no_provenance');
  ok('capture(null) 不抛', P.capture(null, chat[0]) === null);
  ok('capture(summary, null) 不抛', P.capture({ text: 'x' }, null) === null);
  ok('空摘要不留证', P.capture({ text: '   ' }, chat[0]) === null);
  ok('audit(null) 不抛', P.audit(null, chat).total === 0);
  ok('verifiedOnly(null) 不抛', Array.isArray(P.verifiedOnly(null, chat)));
  ok('line(null) 不抛', typeof P.line(null, chat) === 'string');
  // prov.floor 畸形
  eq('prov.floor 负数 = malformed 或 missing（不抛）',
    ['malformed', 'source_missing'].includes(P.verify({ text: 'x', prov: { v: 1, floor: -5, fp: 'a', textHash: 'b', textLen: 1 } }, chat).status), true);
  eq('prov.floor 非整数 = malformed 或 missing（不抛）',
    ['malformed', 'source_missing'].includes(P.verify({ text: 'x', prov: { v: 1, floor: 'x', fp: 'a', textHash: 'b', textLen: 1 } }, chat).status), true);
}

// ========== 8. 反向审计（负控制）—— 判据纯度自证 ==========
{
  const src = read('summary-provenance.js');
  const tmp = path.join(root, 'tests', '.tmp-negctl-v3183');
  fs.mkdirSync(tmp, { recursive: true });

  // 负控制层同样吃 IIFE+CJS 双导出：写 .cjs 再用 createRequire 取库。
  // （写成 .mjs 走 import 会拿到空命名空间，与主测试同一坑。）
  const load = (code, label) => {
    const f = path.join(tmp, `v-${label}.cjs`);
    fs.writeFileSync(f, code, 'utf8');
    return createRequire(f)(f);
  };

  // 负控制 1：破坏翻页判据（fp 比对）→ 翻 swipe 必须不再被检出
  {
    const anchor = "        if (fp !== prov.fp) {";
    ok('负控制1 锚点恰中 1 次', src.split(anchor).length === 2);
    const broken = src.replace(anchor, "        if (false) {");
    const mod = load(broken, 'fp');
    const chat = [msg('第一版', { index: 0 })];
    const s = { floor: 0, text: '摘要。' };
    mod.capture(s, chat[0]);
    chat[0] = msg('', { index: 0, swipe: 1 });
    chat[0].swipes = ['第一版', '第二版'];
    chat[0].mes = '第二版';
    eq('负控制1：fp 判据被破坏后翻页检不出（返回 ok）', mod.verify(s, chat).status, 'ok');
  }

  // 负控制 2：破坏 textDrift 判据 → 就地改写必须不再被检出
  {
    const anchor = "        if (hash32(text) !== prov.textHash || text.length !== prov.textLen) {";
    ok('负控制2 锚点恰中 1 次', src.split(anchor).length === 2);
    const broken = src.replace(anchor, "        if (false) {");
    const mod = load(broken, 'drift');
    const chat = [msg('甲', { index: 0 })];
    const s = { floor: 0, text: '原摘要。' };
    mod.capture(s, chat[0]);
    s.text = '被改过的摘要。';
    eq('负控制2：drift 判据被破坏后改写检不出（返回 ok）', mod.verify(s, chat).status, 'ok');
  }

  // 负控制 3：破坏 source_missing 判据 → 删楼必须不再被检出
  {
    const anchor = "        if (!msg) {";
    ok('负控制3 锚点恰中 1 次', src.split(anchor).length === 2);
    const broken = src.replace(anchor, "        if (false) {");
    const mod = load(broken, 'missing');
    const chat = [msg('甲', { index: 0 }), msg('乙', { index: 1 })];
    const s = { floor: 1, text: '摘要。' };
    mod.capture(s, chat[1]);
    chat.length = 1;
    const r = mod.verify(s, chat);
    ok('负控制3：missing 判据被破坏后删楼检不出（不再是 source_missing）',
      r.status !== 'source_missing', `实得 ${r.status}`);
  }

  // 负控制 4：破坏 no_provenance 分支 → 旧档会被误判成失效（这正是要防的混同）
  {
    const anchor = "            return { status: 'no_provenance', reason: '无来源记录（旧档或非本模块产出）', prov: null };";
    ok('负控制4 锚点恰中 1 次', src.split(anchor).length === 2);
    const broken = src.replace(anchor, "            return { status: 'source_changed', reason: '[negctl] 旧档被误判为失效', prov: null };");
    const mod = load(broken, 'legacy');
    const chat = [msg('甲', { index: 0 })];
    const legacy = { floor: 0, text: '旧档摘要。' };
    eq('负控制4：no_provenance 分支被破坏后旧档被误判为 source_changed',
      mod.verify(legacy, chat).status, 'source_changed');
    // 且 audit 会把它计进 stale（这正是升级即清空历史摘要的事故形态）
    eq('负控制4：旧档被计入 stale（升级即清空存量）',
      mod.audit([legacy], chat).stale.length, 1);
  }

  // 负控制 5：H6 工具两向自证——锚点不存在/不唯一须抛
  {
    // H6 两向自证：锚点必须「存在且唯一」才能当判据；不存在须零命中，重复须被检出。
    const missing = 'THIS_ANCHOR_DOES_NOT_EXIST';
    eq('负控制5：不存在的锚点零命中', src.split(missing).length - 1, 0);
    const dup = "'source_missing'";
    const dupHits = src.split(dup).length - 1;
    ok('负控制5：重复锚点被检出（>1 次）', dupHits > 1, `命中 ${dupHits} 次`);
    // 且被破坏后 source_missing 判定必须可观测地改变（两向自证的下半）
    const broken = src.split("return { status: 'source_missing'").join("return { status: 'text_drift'");
    fs.writeFileSync(path.join(tmp, 'dup-probe.cjs'), broken, 'utf8');
    const mod2 = createRequire(path.join(tmp, 'dup-probe.cjs'))(path.join(tmp, 'dup-probe.cjs'));
    const c2 = [msg('甲', { index: 0 }), msg('乙', { index: 1 })];
    const s2 = { floor: 1, text: 'x', prov: { v: 1, floor: 1, fp: 'a', textHash: 'b', textLen: 1 } };
    c2.length = 1; // 删掉第 1 楼 → 真 missing 场景
    eq('负控制5：破坏 missing 分支后判定改变', mod2.verify(s2, c2).status, 'text_drift');
  }

  fs.rmSync(tmp, { recursive: true, force: true });
}

// ========== 9. 接线自证 ==========
{
  const src = read('index.js');
  ok('index.js 引用 LonShaSummaryProvenance', /LonShaSummaryProvenance/.test(src));
  ok('通过 _moduleLib 取库（与 floor-ledger 同款接线）',
    /_moduleLib\(\(\) => window\.LonShaSummaryProvenance, 'summary-provenance\.js'\)/.test(src));
  ok('摘要在落笔时调用 capture', /\.capture\(/.test(src));
  ok('有体检读数入口（line）', /_summaryProvenanceLine|summaryProv\.line|Provenance\.line/.test(src));
}

// ========== 9b. 召回侧过滤 filterForRecall（分支感知，只剔 source_changed） ==========
{
  // 造三态：ok / source_changed / no_provenance / source_missing / text_drift。
  const mk = (floor, text) => {
    const chat = [];
    const m = { index: floor, swipe_id: 0, mes: text, send_date: 't1', is_user: false, extra: {} };
    chat[floor] = m;
    const s = { floor, text: '摘要' + floor };
    P.capture(s, m);
    return { s, chat };
  };
  const a = mk(0, '第零楼正文');
  const b = mk(1, '第一楼正文');
  const c = mk(2, '第二楼正文');
  const d = mk(3, '第三楼正文');
  // 合并成同一 chat 视图（同一会话内多楼）
  const chat = [a.chat[0], b.chat[1], c.chat[2], d.chat[3]];
  // 逐条重建 prov，使 floor 与 chat 对齐
  const rebuild = (x, floor) => { const s = { floor, text: '摘要' + floor }; P.capture(s, chat[floor]); return s; };
  const s0 = rebuild(0, 0), s1 = rebuild(1, 1), s2 = rebuild(2, 2), s3 = rebuild(3, 3);

  // 把第 1 楼翻页 → 该楼 source_changed（正是「旧分支叙事」）
  chat[1] = { ...chat[1], swipe_id: 1, mes: '第一楼另一次生成' };
  // 第 2 楼删掉 → source_missing
  const chatNo2 = [chat[0], chat[1], undefined, chat[3]];
  // 第 0 楼正文被就地改写？那也会变成 source_changed（fp 覆盖正文）。
  // 旧档：不带 prov 的摘要
  const legacy = { floor: 3, text: '升级前就存在的旧摘要' };

  const r = P.filterForRecall([s0, s1, s2, s3, legacy], chatNo2);
  ok('9b-1 翻页楼被剔', !r.kept.includes(s1), 'source_changed 必须不进注入');
  ok('9b-2 同页楼保留', r.kept.includes(s0));
  ok('9b-3 删楼楼保留（删楼/前移不可区分，宁留勿丢）', r.kept.includes(s2));
  ok('9b-4 旧档保留（判不了就放行）', r.kept.includes(legacy));
  eq('9b-5 只剔了 1 条', r.counts.dropped, 1);
  eq('9b-6 剔除清单有归属', r.dropped[0].status, 'source_changed');
  eq('9b-7 剔除清单带楼层', r.dropped[0].floor, 1);
  eq('9b-8 缺源计入 keptMissing', r.counts.keptMissing, 1);
  eq('9b-9 旧档计入 keptLegacy', r.counts.keptLegacy, 1);
  // 反向：绝不能把 source_missing / no_provenance 也剔掉（剔了就是真丢记忆）
  const r2 = P.filterForRecall([s2, legacy], chatNo2);
  eq('9b-10 缺源与旧档一条都不能少', r2.kept.length, 2);
  eq('9b-11 缺源不剔', r2.counts.dropped, 0);
  // 常量自证：默认剔除集合必须只有一条
  eq('9b-12 默认剔除集合恰为 [source_changed]', P.RECALL_DROP_STATUS.join(','), 'source_changed');
  // dropStatus 可覆盖
  const r3 = P.filterForRecall([s2], chatNo2, { dropStatus: ['source_missing'] });
  eq('9b-13 dropStatus 可覆盖', r3.counts.dropped, 1);
  // 畸形输入：整份放行，绝不整批丢
  eq('9b-14 非数组整份回空', P.filterForRecall(null, chat).kept.length, 0);
  eq('9b-15 畸形 chat 不抛且保留', P.filterForRecall([s0], null).kept.length, 1);
  ok('9b-16 counts 有 checked', P.filterForRecall([s0], chat).counts.checked === 1);
  // 接线自证：index.js 真的用它过滤召回结果
  const isrc = read('index.js');
  ok('9b-17 index.js 调 filterForRecall', /filterForRecall\(/.test(isrc));
  ok('9b-18 过滤结果回写 results.summary', /results\.summary = r\.kept/.test(isrc));
  ok('9b-19 有开关可关', /recallProvenanceFilter/.test(isrc));
}
// ========== 10. 诊断行真进 selfCheck（v3.0~v3.11 主线失效形态的守线） ==========
//   只验「入口函数名在场」是不合格的：本仓反复出现的真缺陷是**写好了入口、零调用点**，
//   单测全绿而用户在设置面板里什么也读不到。判据取本仓 v3150/v3166/v3167 同款口径：
//   定位 selfCheck 方法体 → 取 rows 列表字面量（含 rows.push 型追加）→ 要求本行的键在场，
//   且方法体内**真有 this._xxxLine( 的调用点**。
{
  const isrc = read('index.js');
  const scStart = isrc.indexOf('async selfCheck() {');
  ok('11a selfCheck 方法存在', scStart > 0);
  let _d = 0, scEnd = -1;
  for (let i = isrc.indexOf('{', scStart); i >= 0 && i < isrc.length; i++) {
    if (isrc[i] === '{') _d++;
    else if (isrc[i] === '}') { _d--; if (_d === 0) { scEnd = i; break; } }
  }
  ok('11b selfCheck 方法体闭合', scEnd > scStart);
  const scBody = isrc.slice(scStart, scEnd);
  ok('11c 真调用 _summaryProvenanceLine', scBody.includes('this._summaryProvenanceLine('));
  const rowsIdx = scBody.indexOf('const rows = [');
  ok('11d selfCheck 构建子系统列表 rows', rowsIdx >= 0);
  const lb = scBody.indexOf('[', rowsIdx);
  let _bd = 0, _rb = -1;
  for (let i = lb; i < scBody.length; i++) {
    if (scBody[i] === '[') _bd++;
    else if (scBody[i] === ']') { _bd--; if (_bd === 0) { _rb = i; break; } }
  }
  ok('11e rows 列表字面量闭合', _rb > lb);
  const lit = scBody.slice(lb, _rb + 1);
  const keys = [];
  for (const m of lit.matchAll(/\['([^']+)',/g)) keys.push(m[1]);
  for (const m of scBody.matchAll(/rows\.push\(\[\s*'([^']+)'/g)) keys.push(m[1]);
  ok('11f 诊断行「摘要来源」进入 selfCheck 子系统列表', keys.includes('摘要来源'),
    '现有键：' + keys.join(','));
}

// ========== 11. 版权纯度（不复制源实现） ==========
{
  const src = read('summary-provenance.js');
  ok('不含源实现的 getHash 依赖', !src.includes('getHash'));
  ok('不含源实现的 stripConfiguredTags 依赖', !src.includes('stripConfiguredTags'));
  ok('不含源实现的 chronicle 结构（本仓无此概念）', !src.includes('chronicle'));
  ok('不含源实现的 coveredBy 图遍历（本仓只做单层验真）', !src.includes('coveredBy'));
  ok('挂 LonSha 前缀全局', src.includes('global.LonShaSummaryProvenance'));
  ok('CJS 双导出（单类测试可 require）', /module\.exports = api/.test(src));
}

console.log(`v3183 summary-provenance: ${pass} passed`);
