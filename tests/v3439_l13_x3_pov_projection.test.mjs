// tests/v3439_l13_x3_pov_projection.test.mjs — [v3.439.0 · L13-X3] 视角投影面产品判定
//
// 主题：`povs` 从「列名单」变成「投影内容」（Proposal L13-X3 验收）
//   · 三个视角对同一账投影出三种不同结果；
//   · 秘密条目的正文在任何视角下都不出现在 blind / undecided 档；
//   · 负控制：把盲档的**两道**防线各自拆掉 → 判据必红。
//
// 【本套件首跑暴露的六类口径错（全红在判据侧，内核只被翻出一处真缺陷）】
//   ① A3 锚点不唯一：`const absent = (why) => ({` 在诊断层出现 27 次（每个面各一份），
//      切片取到第一个（relation_history），于是「POV 缺席面缺键」是**假红**。
//   ② B2 把注释与导出表也算进去了：SECRET_MASK 字面 7 处（注释 2 / 定义 1 / 遮蔽行 1 /
//      自检 1 / 导出表 1），判据写死 3 是**随手定的数**。改为判「赋值给 title 的那一处」唯一。
//   ③ B3 夹具自相矛盾：sec_known 的 keeper 与 knowers 同时含阿绣。修夹具（矛盾账另立 B5）。
//   ④ C1 切片终点取在起点之前（区间为空）。改用 `const src = {` 当起点。
//   ⑤ D1/D3 面板：盲档自述与逐档列表在**绑定块**里（povRow/povRun），不在视图块里；
//      且 `if (viewType === 'povs') {` 在文件里出现 2 次（视图是 else-if，绑定另有 if）。
//   ⑥ E1/E3/E4 三条负控制首跑全绿 = 判据假绿，逐条见各 test 内注（两条是我自己的断言写错，
//      一条是真缺陷：原判据「拿来源比」在盲档判不了「整行是不是站位串」）。
//   内核真缺陷一处：leakScan 的 catch 分支缺 tooShort 键 ⇒ 键面不恒定（已在内核侧补齐）。
//
// 【两条纪律（本仓反复付过学费）】
//   1. 判据切片一律用**真实锚点 + 唯一性自证**，锚点不唯一时判据自己先红。
//   2. 负控制一律「真源码破坏 → 加载破坏副本 → 在副本上重跑同一条判据」；
//      判据函数不引用锚点串（避免自我指涉）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { breakOnce } from './_break_kit.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const require_ = createRequire(import.meta.url);
const POV_SRC = read('pov-projection.js');
const DIAG_SRC = read('engine-diagnostic-lines.js');
const HOST_SRC = read('index.js');
const UI_SRC = read('settings-ui.js');
const MANIFEST = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const POV = require_(path.join(ROOT, 'pov-projection.js'));

// ── 锚点（文件头声明一次；判据函数**不**引用这些串） ──────────────────────
const A_MKROW = 'function mkRow(tier, fields) {';
const A_PROJECT = 'function project(raw, opts) {';
const A_MASK_LINE = "title: tier === 'blind' ? SECRET_MASK : text(f.title, 180),";
// 本面专属的缺席面锚点（诊断层 27 个面各有一份 `const absent`，必须带 kind 才唯一）
const A_POV_ABSENT = "const absent = (why) => ({\n            kind: 'pov_projection'";
// 缺席面的**终点**锚：顶层 notes 之后（`});` 在 counts 内联对象里不会命中，但显式写清更稳）
const A_POV_ABSENT_END = '            ok: false, reason: why';
// 终点锚必须是**缺席面对象的收尾**（`        });` 这一行），而不是行首的 notes ——
//   取行首会把 degraded / notes / ok / reason 四个键切在片外（首跑即栽在这）。
// 终点必须落在 ok/reason **之后**：seg 的终点是排他的，取 ok 那一行会把两格切在片外。
//   `        });` + 换行（8 空格缩进）是缺席对象的收尾行，全文件仅此一处。
const A_POV_ABSENT_TAIL = '        });\n';
const A_HOST_FWD = 'povProject(...args) {';
const A_UI_VIEW = "else if (viewType === 'povs') {";
const A_UI_BIND = "\n            if (viewType === 'povs') {";
const A_UI_BIND_END = '/* [v3.430.0 · L12-X] 机制面动作绑定';

const at = (hay, needle) => hay.indexOf(needle);
const occ = (hay, needle) => hay.split(needle).length - 1;
/** 切片；并**自证锚点唯一**（不唯一直接红，不许取第一个了事）。 */
function seg(hay, start, end, label) {
  const n = occ(hay, start);
  assert.equal(n, 1, '切片锚点必须唯一（' + (label || start.slice(0, 30)) + '），实际出现 ' + n + ' 次');
  const s = at(hay, start);
  if (end == null) return hay.slice(s);
  const e = hay.indexOf(end, s + start.length);
  assert.ok(e > s, '终点锚点必须在起点之后：' + String(end).slice(0, 40));
  return hay.slice(s, e);
}

// ── 测试夹具 ────────────────────────────────────────────────────────────
// ★ 夹具纪律：keeper（还不知情的人）与 knowers（已知情的人）**不得重叠** ——
//   一份账同时把某人写进两份名单是自相矛盾的（首跑 ③ 号口径错正是从这里翻出来的），
//   矛盾账另有专门判据（B5）。
const SECRETS = [
  { id: 'sec_known', secret: '养女实为仇家之后', keeper: ['柳氏'], knowers: ['沈砚'], floor: 3 },
  { id: 'sec_keeper', secret: '账房里那笔钱是挪来的', keeper: ['阿绣'], knowers: [], floor: 5 },
  { id: 'sec_listed', secret: '县城的旧约还压着', keeper: ['沈砚'], knowers: ['柳氏'], floor: 7 },
  { id: 'sec_unlisted', secret: '谁都没登记这一条', keeper: [], knowers: [], floor: 9 }
];
const POVS = [
  { id: 'pov_a', owner: '沈砚', content: '他其实怕水', floor: 4 },
  { id: 'pov_b', owner: '阿绣', content: '她夜里偷偷哭过', floor: 6 }
];
const TRACES = [
  { traceId: 't1', character: '沈砚', fact: '柳氏要改嫁', action: 'acquire', via: 'witnessed', floor: 2 },
  { traceId: 't2', character: '阿绣', fact: '柳氏要改嫁', action: 'doubt', via: 'rumor', floor: 2 },
  { traceId: 't3', character: '阿绣', fact: '粮仓亏空', action: 'misbelieve', via: 'told', floor: 3 },
  { traceId: 't4', character: '阿绣', fact: '旧宅地契', action: 'acquire', via: 'document', floor: 4 },
  { traceId: 't5', character: '阿绣', fact: '旧宅地契', action: 'retract', floor: 8 },
  { traceId: 't6', character: '柳氏', fact: '沈砚身份', action: 'unaware', floor: 5 }
];
const BANK = { povs: POVS, secrets: SECRETS, traces: TRACES };
const VIEWERS = ['沈砚', '阿绣', '柳氏'];
const run = (viewer, extra) => POV.project(BANK, Object.assign({ viewer }, extra || {}));

// ── 复用判据①：盲档 / 判不了档不得含任何来源正文 ─────────────────────────
// 只吃「模块实例 + 账」，不引用锚点串 ⇒ 既能判原版，也能判破坏副本。
function judgeNoLeakInBlind(mod, bank) {
  const leaks = [];
  const texts = []
    .concat((bank.secrets || []).map((s) => String(s.secret || '')))
    .concat((bank.povs || []).map((p) => String(p.content || '')))
    .concat((bank.traces || []).map((t) => String(t.fact || '')))
    .filter((t) => t.length >= 4);
  for (const viewer of VIEWERS) {
    const r = mod.project(bank, { viewer });
    for (const tier of ['blind', 'undecided']) {
      for (const row of (r.tiers && r.tiers[tier]) || []) {
        for (const t of texts) {
          if (String(row.title || '').indexOf(t) >= 0) { leaks.push({ viewer, tier, id: row.id, leak: t }); break; }
        }
      }
    }
  }
  return leaks;
}
// ── 复用判据②：盲档**整行**必须就是遮蔽站位串 ────────────────────────────
// 比①更硬：①靠「拿来源比」，而 blind 档成立的依据（keeper 名单 / 撤回）本身
//   不依赖来源正文 ⇒ 拆掉遮蔽后①在某些行上仍可能成立。②直接看形状，拆了就必红。
function judgeBlindMasked(mod, bank) {
  const bad = [];
  for (const viewer of VIEWERS) {
    const r = mod.project(bank, { viewer });
    for (const row of (r.tiers && r.tiers.blind) || []) {
      if (String(row.title) !== mod.SECRET_MASK) bad.push({ viewer, id: row.id, title: String(row.title).slice(0, 40) });
      if (row.masked !== true) bad.push({ viewer, id: row.id, masked: row.masked });
    }
  }
  return bad;
}

// ═══════════════════════════════════════════════════════════════════════
// A 组：内核形状与五档纪律（缺一不可，压格即红）
// ═══════════════════════════════════════════════════════════════════════
test('A1: 五档互不同形 —— 档位 / 标签 / 遮蔽串三处各自的唯一性', () => {
  assert.equal(POV.TIERS.length, 5, '档位必须五格（四档 + 判不了）');
  assert.deepEqual([...POV.TIERS], ['knows', 'suspects', 'believes', 'blind', 'undecided']);
  const labels = POV.TIERS.map((t) => POV.TIER_LABEL[t]);
  assert.equal(new Set(labels).size, 5, '五个标签必须互不相同');
  assert.notEqual(POV.TIER_LABEL.blind, POV.TIER_LABEL.undecided, '最贵的一格：不知道 vs 判不了');
  // 「不知道」必须自称正文不给，「判不了」必须自称本模块不知道 ——
  //   两者若同说「不知道」，读者（与模型）就分不出「有据」与「没记过」。
  assert.ok(POV.TIER_LABEL.blind.indexOf('正文不对外提供') >= 0);
  assert.ok(POV.TIER_LABEL.undecided.indexOf('本模块') >= 0);
  assert.ok(POV.SECRET_MASK.length >= 10, '遮蔽站位串必须是一句可辨的话（不是空串）');
  // 遮蔽串不得与 evidence-workbench 同字面（常量复制账本盯的就是这个）
  const EW = read('evidence-workbench.js');
  assert.equal(at(EW, POV.SECRET_MASK) >= 0, false, '遮蔽站位串不得与证据诊断面同字面（否则下游分不清来源）');
  const sc = POV.selfCheck();
  assert.equal(sc.ok, true, 'selfCheck 必须自证通过：' + JSON.stringify(sc.problems));
  assert.equal(sc.tiers, 5);
  assert.equal(sc.version, POV.POV_VERSION);
});

test('A2: 三个视角对同一账投影出三种不同结果（计划原文验收第一条）', () => {
  const combo = (v) => {
    const r = run(v);
    return [r.counts.knows, r.counts.suspects, r.counts.believes, r.counts.blind, r.counts.undecided].join('/');
  };
  const a = combo('沈砚'), b = combo('阿绣'), c = combo('柳氏');
  assert.equal(new Set([a, b, c]).size, 3, '三人必须投影出三种不同结果：' + [a, b, c].join(' | '));
  // 逐档都在工作（不是靠「全都没数据」造出来的不同）
  const ra = run('阿绣');
  assert.ok(ra.counts.suspects >= 1, '起疑档必须真有条目（阿绣对「柳氏要改嫁」只有 rumor）');
  assert.ok(ra.counts.believes >= 1, '他以为档必须真有条目（阿绣对「粮仓亏空」是误信且未被纠正）');
  assert.ok(ra.counts.blind >= 1, '盲档必须真有条目');
  assert.ok(run('沈砚').counts.knows >= 1, '有据已知档必须真有条目（沈砚在 sec_known 的 knowers 里）');
  const rb = ra.tiers.believes[0];
  assert.ok(rb && rb.note && rb.note.indexOf('不得当世界真相') >= 0, '误信档必须自带「不得当真相」自述（这一行会被直接拿去写正文）');
  assert.equal(rb.masked, false, '误信档不是遮蔽档：他知道（虽然知道错了），正文要给');
  assert.ok(ra.tiers.suspects[0].tierLabel.indexOf('不得据此行动') >= 0, '起疑档必须自述「不得据此行动」');
});

test('A3: 缺席面与在场面逐字同键（宿主 stub 不是手写的第二份形状）', () => {
  const live = run('阿绣');
  // ★ 锚点必须带本面专属串（kind: 'pov_projection'）—— 裸 `const absent` 出现 27 次
  const block = seg(DIAG_SRC, A_POV_ABSENT, A_POV_ABSENT_TAIL, 'pov 缺席面');
  const liveKeys = Object.keys(live).filter((k) => k !== 'leakScan').sort();
  for (const k of liveKeys) assert.ok(block.indexOf(k + ':') >= 0, '缺席面缺键（会塌成第三态）：' + k);
  assert.ok(block.indexOf('ok: false, reason: why') > 0, '缺席必须带 ok:false + reason 两格');
  // 缺席面不得比在场面多出**读数键**（多出来的只能是 ok / reason 这两格告知键）。
  // ★ 首跑这里假红：counts 是**嵌套对象**（counts.input.povs 等），裸正则把嵌套键也抓了出来。
  //   修法：只取顶层键（括号深度 = 1），嵌套结构另由「counts 键面一致」一条判。
  const topKeys = (txt) => {
    const out = [], re = /([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
    let m, depth = 0, open = 0;
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i];
      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') depth--;
    }
    // 逐字符扫，记录「键出现时的深度」
    re.lastIndex = 0;
    const hits = [];
    while ((m = re.exec(txt))) hits.push({ k: m[1], i: m.index });
    for (const h of hits) {
      let d = 0;
      for (let i = 0; i < h.i; i++) { const c = txt[i]; if (c === '{' || c === '[') d++; else if (c === '}' || c === ']') d--; }
      if (d === 1) out.push(h.k);
    }
    return out;
  };
  const absentTop = topKeys(block);
  const extra = absentTop.filter((k) => liveKeys.indexOf(k) < 0 && k !== 'ok' && k !== 'reason');
  assert.deepEqual(extra, [], '缺席面多出在场面没有的顶层键（那是手写的第二份形状）：' + extra.join(','));
  // counts 的键面也必须一致（嵌套层一起对，防「缺席面少报一格计数」）
  const liveCountKeys = Object.keys(live.counts).sort().join(',');
  // 终点锚必须是**顶层** viewers（`            viewers: [],`）——
  //   counts 里也有一个 `viewers: 0`，用裸 'viewers:' 会把切片提前截断（首跑即栽在这）。
  const absentCountsBlock = block.slice(block.indexOf('counts: {'), block.indexOf('            viewers: [],'));
  assert.ok(absentCountsBlock.length > 20, 'counts 切片必须非空');
  for (const k of Object.keys(live.counts)) {
    assert.ok(absentCountsBlock.indexOf(k + ':') >= 0, '缺席面 counts 缺计数格：' + k + '（live=' + liveCountKeys + '）');
  }
});

test('A4: 状态词与 knowledge-trace 同源 —— 两份实现不得漂移', () => {
  const KT = require_(path.join(ROOT, 'knowledge-trace.js'));
  // 折换规则必须逐条一致（known→acquire / reveal→correct）
  assert.equal(POV.actionOf('known'), 'acquire');
  assert.equal(POV.actionOf('reveal'), 'correct');
  assert.equal(POV.actionOf('acquire'), 'acquire');
  assert.equal(POV.actionOf('unaware'), 'unaware');
  assert.equal(POV.actionOf('nonsense'), '');
  // ★ knowledge-trace **不导出** actionOf（首跑 KT.actionOf is not a function）——
  //   它是私有折换器，故不能逐词对照。改为「源码级同源」：两边的折换写法必须在盘上一致，
  //   且本模块的折换结果必须与 KT 归一面（normalize）后得到的 action 逐条一致。
  const KT_SRC = read('knowledge-trace.js');
  assert.ok(KT_SRC.indexOf("if (s === 'known' || s === 'reveal')") >= 0, 'knowledge-trace 折换写法变了，本判据要跟着复核');
  // 它的写法是**一条三元式**（`return s === 'reveal' ? 'correct' : 'acquire';`），
  //   不是两条 return —— 首跑我按两条 return 找，假红。
  assert.ok(KT_SRC.indexOf("s === 'reveal' ? 'correct' : 'acquire'") >= 0, 'knowledge-trace 的 known/reveal 折法变了，本判据要跟着复核');
  const ktNorm = KT.normalize({ traces: [
    { traceId: 'a1', character: '甲', fact: '某事', action: 'known', floor: 1 },
    { traceId: 'a2', character: '甲', fact: '某事', action: 'reveal', floor: 2 }
  ] });
  const ktActions = ktNorm.traces.map((t) => t.action);
  assert.deepEqual(ktActions, [POV.actionOf('known'), POV.actionOf('reveal')], 'known/reveal 折换必须与 KT 归一同结果：' + ktActions);
  // 档位与五态的逐格对齐（用真 stateOf 当对照）
  const map = { knows: 'knows', doubts: 'suspects', misled: 'believes', unknown: 'blind', notRecorded: 'undecided' };
  const seen = new Map();
  for (const t of TRACES) seen.set(t.character + '\u0000' + t.fact, { c: t.character, f: t.fact });
  let compared = 0;
  for (const p of seen.values()) {
    const st = KT.stateOf({ traces: TRACES }, p.c, p.f);
    const want = map[st.state];
    const r = POV.project({ traces: TRACES }, { viewer: p.c });
    let got = null;
    for (const tier of POV.TIERS) {
      for (const row of r.tiers[tier]) {
        if (row.source !== 'trace' || !row.ref) continue;
        const src = TRACES.find((x) => x.traceId === row.ref.id);
        if (src && src.fact === p.f) got = tier;
      }
    }
    assert.equal(got, want, '与 stateOf 漂移：' + p.c + ' / ' + p.f + ' → kt=' + st.state + ' pov=' + got);
    compared++;
  }
  // 夹具里「角色 × 事实」去重后是 5 格（沈砚/柳氏要改嫁、阿绣/柳氏要改嫁、阿绣/粮仓亏空、
  //   阿绣/旧宅地契、柳氏/沈砚身份），首跑按 6 判是**随手定的数**；改为按真实格数 >= 5。
  assert.ok(compared >= 5, '对照格数必须够（防夹具塌成 1 格后判据空转）：' + compared);
  // ★ 历史事故锚：retract 自己**不得**算进「最后有效动作」——否则第①档永远进不去
  const onlyRetract = POV.project({ traces: [{ traceId: 'r1', character: '甲', fact: '某事', action: 'retract', floor: 2 }] }, { viewer: '甲' });
  assert.equal(onlyRetract.tiers.blind.length, 1, '只有一条撤回 ⇒ blind（有据：他曾知道，现在不）');
  assert.equal(onlyRetract.tiers.blind[0].basis, 'retract');
  assert.equal(onlyRetract.tiers.knows.length, 0, '撤回不得被读成 knows（历史事故形态）');
});

// ═══════════════════════════════════════════════════════════════════════
// B 组：秘密三刀（本面最贵的一条）
// ═══════════════════════════════════════════════════════════════════════
test('B1: 盲档 / 判不了档在三个视角下都不含任何来源正文', () => {
  assert.deepEqual(judgeNoLeakInBlind(POV, BANK), [], '盲档/判不了档泄漏正文');
  assert.deepEqual(judgeBlindMasked(POV, BANK), [], '盲档整行必须是遮蔽站位串');
  for (const v of VIEWERS) {
    const r = run(v);
    for (const tier of POV.TIERS) {
      for (const row of r.tiers[tier]) {
        assert.equal(row.masked, tier === 'blind', 'masked 标记与档位不符：' + tier + ' / ' + row.id);
      }
    }
    assert.equal(r.leakScan.hits, 0, '内核自检必须零命中：' + JSON.stringify(r.leakScan));
    assert.equal(r.counts.masked, r.counts.blind, 'masked 计数必须等于 blind 条数（不许少报也不许多报）');
  }
});

test('B2: 遮蔽发生在行构造那一刻（不是渲染时再遮）—— 判据锁源码位置', () => {
  // ① 那一行必须存在、且唯一
  assert.equal(occ(POV_SRC, A_MASK_LINE), 1, '遮蔽行必须唯一（不许多处各写一份）');
  // ② 它必须在 mkRow 之内（行构造即遮蔽，不是渲染时再遮）
  const mk = seg(POV_SRC, A_MKROW, A_PROJECT, 'mkRow');
  assert.ok(at(mk, A_MASK_LINE) > 0, '遮蔽必须写在 mkRow 的 title 赋值那一行');
  // ③ 三要素：只对 blind 档、取站位串、否则取原值
  assert.ok(A_MASK_LINE.indexOf("tier === 'blind'") > 0, '遮蔽必须只对 blind 档生效（别的档要给正文）');
  assert.ok(A_MASK_LINE.indexOf('SECRET_MASK') > 0 && A_MASK_LINE.indexOf('f.title') > 0);
  // ④ 「第二条路」的反向排除：把 title 赋成遮蔽串的地方只许一处
  const outsideMaskWrites = (POV_SRC.match(/title\s*[:=][^\n]*SECRET_MASK/g) || []);
  assert.equal(outsideMaskWrites.length, 1, '把 title 赋成遮蔽串的地方只许一处，实际：' + outsideMaskWrites.length);
  // ⑤ 遮蔽串的真身只许有一处定义（其余引用必须走标识符）
  assert.equal(occ(POV_SRC, 'var SECRET_MASK = '), 1, '遮蔽站位串只许定义一处');
});

test('B3: knowers 含此人则正文可见，keeper 含此人则正文遮蔽（三档依据互不同形）', () => {
  const shen = run('沈砚');
  const known = shen.tiers.knows.find((r) => r.ref && r.ref.id === 'sec_known');
  assert.ok(known, '沈砚在 knowers 名单里 ⇒ 必须进 knows');
  assert.ok(known.title.indexOf('养女实为仇家之后') >= 0, 'knowers 命中时正文必须给出（他已经知道了）');
  assert.equal(known.basis, 'knower-list');
  assert.equal(known.masked, false);

  // ★ 按键位取行（不是「猜它在哪一档」）
  const byId = (viewer) => {
    const r = run(viewer), out = {};
    for (const tier of POV.TIERS) for (const row of r.tiers[tier]) if (row.ref && row.ref.source === 'secret') out[row.ref.id] = row;
    return out;
  };
  const ax = byId('阿绣');
  assert.equal(ax.sec_keeper.tier, 'blind', 'keeper 点名他不知情 ⇒ blind');
  assert.equal(ax.sec_keeper.basis, 'keeper-list', '依据必须与 not-knower 分写（否则查不回为什么他不知道）');
  assert.equal(ax.sec_listed.tier, 'blind', '知情名单给了却不含他 ⇒ blind');
  assert.equal(ax.sec_listed.basis, 'not-knower');
  assert.equal(ax.sec_unlisted.tier, 'undecided', '两份名单都没给 ⇒ 判不了（不并进 blind）');
  // 三种 basis 互不相同（「为什么他不知道」这件事必须查得回来）
  assert.equal(new Set([ax.sec_keeper.basis, ax.sec_listed.basis, ax.sec_unlisted.basis]).size, 3, '三种「为什么」必须互不同形');
  // 两档处置相反：blind 给站位串、undecided 给空标题但不是遮蔽串
  assert.equal(ax.sec_keeper.title, POV.SECRET_MASK);
  assert.notEqual(ax.sec_unlisted.title, POV.SECRET_MASK, '判不了不得冒充遮蔽（那不是「有据的不知道」）');
});

test('B4: undecided 绝不并进 blind —— 与 secret-ledger 的三条硬边', () => {
  const SL = require_(path.join(ROOT, 'secret-ledger.js'));
  const edges = { knower: 0, listed: 0, unlisted: 0 };
  for (const viewer of VIEWERS) {
    const r = run(viewer);
    const byId = {};
    for (const tier of POV.TIERS) for (const row of r.tiers[tier]) if (row.ref && row.ref.source === 'secret') byId[row.ref.id] = row.tier;
    for (const s of SECRETS) {
      const k = SL.knowledgeOf(s, viewer);
      const got = byId[s.id];
      edges[k]++;
      if (k === 'knower') assert.equal(got, 'knows', 'knower⇒knows 破：' + viewer + '/' + s.id);
      if (k === 'listed') assert.equal(got, 'blind', 'listed⇒blind 破：' + viewer + '/' + s.id);
      if (k === 'unlisted') assert.notEqual(got, 'knows', 'unlisted⇒不得 knows：' + viewer + '/' + s.id);
    }
  }
  // 三条边必须都真被走过（防夹具塌成只剩一条边后判据空转）
  assert.ok(edges.knower > 0 && edges.listed > 0 && edges.unlisted > 0, '三条硬边必须都有样本：' + JSON.stringify(edges));
});

test('B5: 自相矛盾的账（keeper 与 knowers 同时点名）—— 不许两边都算', () => {
  // 这不是「内核该怎么处置矛盾账」的产品问题，而是**不许静默挑两个数**：
  //   本模块口径 = knowers 优先（记了「他知道」就是知道），keeper 只作 fallback。
  const contradiction = [{ id: 'c1', secret: '两个人都在名单上', keeper: ['甲'], knowers: ['甲'], floor: 1 }];
  const r = POV.project({ secrets: contradiction }, { viewer: '甲' });
  const total = r.counts.knows + r.counts.blind + r.counts.undecided;
  assert.equal(total, 1, '同一条不得被算两次（两边都算会让面板数虚高）');
  assert.equal(r.tiers.knows.length, 1, 'knowers 优先 ⇒ 判 knows');
  assert.equal(r.tiers.blind.length, 0);
});

// ═══════════════════════════════════════════════════════════════════════
// C 组：宿主接线（面在场 / 缺席两态都不塌）
// ═══════════════════════════════════════════════════════════════════════
test('C1: manifest 注册 + 宿主装配点 + 转发方法三处齐备', () => {
  assert.ok(MANIFEST.extra_js.includes('pov-projection.js'), 'manifest.extra_js 必须注册本模块');
  assert.equal(occ(MANIFEST.extra_js.filter((x) => x === 'pov-projection.js').join(''), 'pov-projection.js'), 1, '不许重复注册');
  assert.equal(occ(DIAG_SRC, 'const res = PP.project(src, o);'), 1, '装配点不得有多处（多处即第二套取数）');
  assert.equal(occ(DIAG_SRC, '            const src = {'), 1, '本面的取数装配点必须唯一');
  assert.equal(occ(HOST_SRC, A_HOST_FWD), 1, '宿主转发方法必须唯一');
  // 取数必须来自**既有三账**，不得新开存储
  // ★ `const src = {` 在诊断层出现 3 次（另两个面各一份），必须带缩进锚定到本面
  const assembly = seg(DIAG_SRC, '            const src = {', 'const res = PP.project', '装配点');
  assert.ok(assembly.indexOf('secretLedger') > 0, '秘密账必须来自 worldProg.secretLedger');
  assert.ok(assembly.indexOf('knowledgeTraces') > 0, '轨迹必须来自 worldProg.knowledgeTraces');
  // ★ 心声是从 `povExport` 变量带进来的，而 `povExport` 在 `const src = {` **之前**就取好了
  //   （`const povExport = (engine && engine.pov && typeof engine.pov.export === 'function') ? ...`），
  //   所以切片里看不到 `engine.pov` —— 首跑按「切片里找 engine.pov」判是**假红**。
  //   正确判法：① 装配体里必须引用 `povExport`；② `povExport` 的取数点必须真读 engine.pov.export()。
  assert.ok(assembly.indexOf('povExport') > 0, '私密心声必须由 povExport 带入装配');
  const povFetch = seg(DIAG_SRC, 'const povExport = ', ';', 'pov 取数点');
  assert.ok(povFetch.indexOf('engine.pov') > 0 && povFetch.indexOf('export()') > 0, '心声取数点必须真读 engine.pov.export()');
  assert.equal(/(localStorage|indexedDB|writeFile)/.test(assembly), false, '装配点不得引入新存储');
  // 转发只许补 ok/reason 两格，不许重算；不得二次调用内核
  const fwd = seg(DIAG_SRC, 'const res = PP.project(src, o);', 'if (engine) engine._povProjectionLastRead', '转发');
  assert.ok(/Object\.assign\(\{\}, res, \{ ok: true/.test(fwd), '转发只许补 ok/reason 两格，不许重算');
  assert.equal(occ(fwd, 'PP.project('), 1, '一次投影只算一次（不得二次调用内核）');
});

test('C2: 内核缺席时报「不可用」，不回落成一张空投影', () => {
  const block = seg(DIAG_SRC, A_POV_ABSENT, A_POV_ABSENT_TAIL, 'pov 缺席面');
  assert.ok(block.indexOf('ok: false, reason: why') > 0, '缺席必须 ok:false + reason');
  assert.ok(/module-unavailable/.test(DIAG_SRC), '内核缺席必须报 module-unavailable');
  // 源码层面：缺席判定必须先于装配（不能先 project 再判空）
  const fn = seg(DIAG_SRC, 'function povProject(engine, opts) {', 'function _povProjectionLine', 'povProject');
  assert.ok(fn.indexOf('module-unavailable') < fn.indexOf('const res = PP.project'), '缺席判定必须早于装配');
  // 缺席面必须带 version 0（与在场面 version:1 不同形，下游据此判「这一面在不在」）
  assert.ok(/version:\s*0/.test(block), '缺席面必须 version: 0');
  // 运行层面：真调一次，必须给同一 kind 且带 ok 布尔值（不塌成 undefined）
  const M = require_(path.join(ROOT, 'engine-diagnostic-lines.js'));
  assert.equal(typeof M.povProject, 'function', '诊断层必须导出 povProject');
  const r = M.povProject({}, { viewer: '甲' });
  assert.equal(r.kind, 'pov_projection', '缺席也必须给同一 kind（不塌成 undefined）');
  assert.equal(typeof r.ok, 'boolean', '缺席必须带 ok 布尔值');
  assert.ok(Array.isArray(r.viewers), '缺席面名单必须是数组（不是缺键）');
});

// ═══════════════════════════════════════════════════════════════════════
// D 组：面板（渲染与绑定缺一不可）
// ═══════════════════════════════════════════════════════════════════════
test('D1: 面板渲染面齐全 —— 三种态 / 逐档行 / 盲档自述 / 档位标签取内核', () => {
  const view = seg(UI_SRC, A_UI_VIEW, "else if (viewType === 'timeline')", 'povs 视图');
  for (const need of ['data-pov-state="absent"', 'data-pov-state="empty"', 'data-pov-state="pick"', 'data-pov-viewers="1"', 'id="ls-pov-result"']) {
    assert.ok(view.indexOf(need) >= 0, '面板缺渲染态：' + need);
  }
  assert.ok(view.indexOf('视角投影面不可用') >= 0 && view.indexOf('还没有任何角色') >= 0, '缺席与空必须各有文案（不许同形）');
  assert.ok(view.indexOf('不是「他什么都不知道」') >= 0, '缺席必须显式否掉误读（否则读者会把「面不在」读成「没有认知」）');
  // 逐档行渲染在**绑定块**里（povRow / povRun）—— 首跑切在视图块里是假红
  const bind = seg(UI_SRC, A_UI_BIND, A_UI_BIND_END, 'povs 绑定');
  assert.ok(bind.indexOf('正文不对外提供') >= 0, '盲档必须显式写「正文不对外提供」');
  for (const tier of ['knows', 'suspects', 'believes', 'blind', 'undecided']) {
    assert.ok(bind.indexOf("'" + tier + "'") >= 0, '五档必须逐档渲染：' + tier);
  }
  assert.ok(bind.indexOf('row.tierLabel') >= 0, '档位标签必须取内核 tierLabel，不许面板自编');
  assert.ok(bind.indexOf('data-pov-row=') >= 0 && bind.indexOf('data-pov-tier=') >= 0, '逐行必须带机器可判标记');
  assert.ok(bind.indexOf('data-pov-masked=') >= 0, '盲档必须带 data-pov-masked 标记');
});

test('D2: 面板不重算判定、不做算术合成 —— 只搬内核读数', () => {
  const both = seg(UI_SRC, A_UI_VIEW, "else if (viewType === 'timeline')", 'povs 视图')
    + seg(UI_SRC, A_UI_BIND, A_UI_BIND_END, 'povs 绑定');
  assert.equal(/c\.knows\s*\+\s*c\.blind|c\.blind\s*\+\s*c\.undecided/.test(both), false, '面板不得把多档相加成一个数');
  assert.ok(both.indexOf('s.povProject') >= 0, '面板必须经宿主 povProject 取数');
  assert.equal(/s\.worldProg\.secretLedger/.test(both), false, '面板不得直接读账（面板不重判）');
});

test('D3: 交互绑定与渲染选择器一一对应（点了没反应是本仓反复治过的一类）', () => {
  const bind = seg(UI_SRC, A_UI_BIND, A_UI_BIND_END, 'povs 绑定');
  assert.ok(bind.indexOf('[data-pov-pick]') >= 0, '绑定必须挂 data-pov-pick 上');
  assert.ok(occ(UI_SRC, 'data-pov-pick') >= 2, 'data-pov-pick 必须在渲染与绑定两处都出现，实际 ' + occ(UI_SRC, 'data-pov-pick'));
  assert.ok(bind.indexOf('povRun(') >= 0, '点击必须真的调用投影读取');
  assert.ok(bind.indexOf('s.povProject') >= 0, '绑定必须回主机重取（不就地重算）');
  // 必须遍历全部视角按钮逐个绑定（不是挂一次就完）
  assert.ok(/querySelectorAll\(\s*['"]\[data-pov-pick\]/.test(bind), '必须遍历全部视角按钮逐个绑定');
  // 机器可判标记至少 5 种（X4 复用样式要读它们）
  const marks = new Set(UI_SRC.match(/data-pov-[a-z-]+/g) || []);
  assert.ok(marks.size >= 5, '机器可判标记至少 5 种，实际：' + [...marks].join(','));
});

// ═══════════════════════════════════════════════════════════════════════
// E 组：负控制 —— 真源码破坏 → 加载破坏副本 → 在副本上重跑同一条判据
// ═══════════════════════════════════════════════════════════════════════
// 【三种假绿形态，逐条避开】
//   ① 对原文件断言（破坏没发生也绿）→ 一律在破坏副本上跑；
//   ② 破坏写死成模拟常量（真判据根本没被调用）→ 一律 loadBroken 真加载；
//   ③ 破坏把判据自己删了（自我指涉）→ 判据函数不引用锚点串。
let NEG_SEQ = 0;
function loadBroken(mutatedSrc, tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3439_neg_'));
  const f = path.join(dir, 'pov-broken-' + (NEG_SEQ++) + '-' + (tag || 'x') + '.js');
  fs.writeFileSync(f, mutatedSrc, 'utf8');
  const mod = require_(f);
  fs.rmSync(dir, { recursive: true, force: true });
  return mod;
}
/* 破坏工具不再是本地重写：从唯一真源 `tests/_break_kit.mjs` 取（v3247 门禁 B2 口径），
 *   本档只保留 `loadBroken`（真加载破坏副本的那一步，属于运行器职责）。 */

test('E1: 负控制①把盲档遮蔽拆掉 → 判据必红（真源码破坏）', () => {
  const mod = loadBroken(breakOnce(POV_SRC, A_MASK_LINE, 'title: text(f.title, 180),', '拆遮蔽'), 'nomask');
  assert.equal(typeof mod.project, 'function', '破坏副本必须还能加载（否则红在加载栈，判据没跑）');
  // ★ 首跑这条**绿**了：原判据「拿来源比 title」在 blind 档上不成立 ——
  //   盲档成立的依据（keeper 名单 / 撤回）本身不含来源正文，拆了遮蔽后
  //   「来源没出现在 title」在某些行上仍然成立。改用「整行必须是站位串」后必红。
  assert.ok(judgeBlindMasked(mod, BANK).length > 0, '遮蔽拆掉后「整行是站位串」判据必须红（若仍绿说明判据没盯住真源）');
  assert.deepEqual(judgeBlindMasked(POV, BANK), [], '原版上同判据必须绿（否则是判据本身错）');
  // ★★ 首跑最后这一条**假红**，但它翻出了一条比原设想更好的事实：
  //   盲档其实是**两道互补防线**——
  //     防线甲（上游）：秘密/心声/轨迹三条账构造 blind 行时**根本不传 title**，
  //       故 f.title 为 undefined ⇒ 拆掉遮蔽行只会得到空串，不是泄漏；
  //     防线乙（mkRow）：即便上游传了正文，遮蔽行会把它换成站位串。
  //   两道同时成立 ⇒ 单拆任意一道都不会漏（这正是它们互补的意义）。
  //   所以「泄露判据必须红」的正确构造是**两道全拆**：下面把上游也改成传正文。
  const bothBroken = breakOnce(
    breakOnce(POV_SRC, A_MASK_LINE, 'title: text(f.title, 180),', '拆遮蔽'),
    "takeRow(mkRow('blind', Object.assign({}, rowBase, { basis: 'keeper-list', reason: 'keeper-list' })));",
    "takeRow(mkRow('blind', Object.assign({}, rowBase, { title: text(it.secret, 180), basis: 'keeper-list', reason: 'keeper-list' })));",
    '上游给正文'
  );
  const mod2 = loadBroken(bothBroken, 'bothgone');
  assert.ok(judgeNoLeakInBlind(mod2, BANK).length > 0, '两道防线全拆后「来源正文比对」判据必须红（否则它盯不住真源）');
  // 而**只拆甲**（上游给正文、遮蔽行仍在）时，判据必须是绿的 —— 这才证明防线乙真在岗
  const onlyUpstream = breakOnce(
    POV_SRC,
    "takeRow(mkRow('blind', Object.assign({}, rowBase, { basis: 'keeper-list', reason: 'keeper-list' })));",
    "takeRow(mkRow('blind', Object.assign({}, rowBase, { title: text(it.secret, 180), basis: 'keeper-list', reason: 'keeper-list' })));",
    '只拆上游'
  );
  assert.deepEqual(judgeNoLeakInBlind(loadBroken(onlyUpstream, 'uponly'), BANK), [], '只拆上游时遮蔽行必须顶住（防线乙在岗）');
});

test('E2: 负控制②把 undecided 并进 blind → 档位判据必红', () => {
  const anchor = "var TIERS = Object.freeze(['knows', 'suspects', 'believes', 'blind', 'undecided']);";
  const mod = loadBroken(breakOnce(POV_SRC, anchor, "var TIERS = Object.freeze(['knows', 'suspects', 'believes', 'blind', 'blind']);", '并档'), 'merge');
  const labels = mod.TIERS.map((t) => mod.TIER_LABEL[t]);
  assert.ok(new Set(labels).size !== 5 || mod.selfCheck().ok === false, '并档后必须被「不同形」判据抓到');
  assert.equal(POV.selfCheck().ok, true, '原版自检必须绿');
});

test('E3: 负控制③把自检的取样面拆掉一份 → 自检当场失明', () => {
  // ★ 首跑这条**红**（5 !== 0）：我拆的是**调用点**的 traces，但 leakScan 是按
  //   传入的 sources 扫的，调用点拆不拆都一样。真正的破坏在**取样表**那一行：
  //   删掉它，轨迹正文就再也进不了扫描面。
  const sampleLine = 'for (var m = 0; m < tr.length; m++) take(tr[m] && (tr[m].fact || tr[m].content));';
  const mod = loadBroken(breakOnce(POV_SRC, sampleLine, '/* 破坏：轨迹正文不再进扫描面 */', '拆取样'), 'nosample');
  const r = mod.project(BANK, { viewer: '阿绣' });
  for (const row of r.tiers.blind) row.title = TRACES[2].fact;
  assert.equal(mod.leakScan(r, { povs: POVS, secrets: SECRETS, traces: TRACES }).hits, 0, '拆掉取样后必须扫不到轨迹正文');
  const r2 = POV.project(BANK, { viewer: '阿绣' });
  for (const row of r2.tiers.blind) row.title = TRACES[2].fact;
  assert.ok(POV.leakScan(r2, { povs: POVS, secrets: SECRETS, traces: TRACES }).hits > 0, '原版自检必须扫得到（否则自检恒绿 = 假绿）');
  // 且原版在内核里就会把结论降级（不靠人记得去扫）——用一条 4 字 unaware 事实自证
  const degraded = POV.project({ traces: [{ traceId: 'z', character: '甲', fact: '粮仓亏空', action: 'unaware', floor: 1 }] }, { viewer: '甲' });
  assert.equal(degraded.tiers.blind.length, 1, 'unaware 必须进盲档');
  assert.equal(degraded.degraded, false, '正常遮蔽下自检必须干净（degraded 只在真泄漏时置位）');
  assert.equal(degraded.leakScan.hits, 0, '正常遮蔽下自检零命中');
  // 破坏副本的可观测差异：轨迹正文进了盲档，而它的自检说「干净」
  assert.equal(mod.project({ traces: [{ traceId: 'z2', character: '甲', fact: '仓里没粮', action: 'unaware', floor: 1 }] }, { viewer: '甲' }).leakScan.hits, 0);
});

test('E4: 负控制④取数门槛静默化 → tooShort 判据必红', () => {
  // ★ 首跑这条**红**（0 !== undefined）：我断言「拆掉计数后 tooShort === undefined」，
  //   但 out 初始化里本来就有 `tooShort: 0`，拆掉 `out.tooShort++` 只让它恒为 0 ——
  //   即「短正文被略掉」这件事被**静默**了，值却仍是 0。故判据比「值」而不是比「键」。
  assert.equal(occ(POV_SRC, 'out.tooShort++;'), 1, '过短计数必须恰有一处');
  const mod = loadBroken(breakOnce(POV_SRC, 'out.tooShort++;', '/* 破坏：被略掉的短正文不再计数 */', '拆计数'), 'notooshort');
  const shortSrc = { secrets: [{ id: 's1', secret: '甲', keeper: ['某人'], knowers: [] }], povs: [], traces: [] };
  const empty = { tiers: { knows: [], suspects: [], believes: [], blind: [], undecided: [] } };
  assert.equal(mod.leakScan(empty, shortSrc).tooShort, 0, '拆掉计数后恒 0（「被略掉多少」被静默）');
  assert.equal(POV.leakScan(empty, shortSrc).tooShort, 1, '原版必须如实报 tooShort=1（不许静默）');
  // 门槛本身必须有界且可见：1 字正文不进扫描面（否则噪声淹掉真命中）
  assert.equal(POV.leakScan(empty, { secrets: [{ secret: '甲' }] }).scanned, 0, '1 字正文不得进扫描面');
  // skipped 与 tooShort 必须并列（有界扫描不报被略掉多少 = 「没扫过」被读成「扫过且干净」）
  const keys = Object.keys(POV.leakScan(empty, shortSrc));
  for (const k of ['scanned', 'skipped', 'tooShort', 'hits', 'at']) assert.ok(keys.indexOf(k) >= 0, '自检读数缺键：' + k);
});

// ═══════════════════════════════════════════════════════════════════════
// F 组：只读纪律 + 当版锚点
// ═══════════════════════════════════════════════════════════════════════
test('F1: 只读 —— 投影全程不写账、不抛', () => {
  const r = run('阿绣');
  assert.equal(r.writesNothing, true, 'writesNothing 必须恒 true');
  const snapshot = JSON.stringify(BANK);
  POV.project(BANK, { viewer: '沈砚' });
  POV.project(BANK, { viewer: '沈砚', at: 5 });
  assert.equal(JSON.stringify(BANK), snapshot, '投影不得改写输入（纯函数）');
  const junk = POV.project({ povs: 'x', secrets: 42, traces: null }, { viewer: '谁' });
  assert.equal(junk.kind, 'pov_projection');
  assert.equal(junk.degraded, false, '畸形输入应当降级为读数而不是 degraded');
  assert.ok(junk.counts.malformed >= 0, '成形不了的条目必须计数可见');
  const thrown = POV.project(null, { viewer: '谁' });
  assert.equal(thrown.kind, 'pov_projection', 'null 输入也不许外抛');
  // 未选视角 ⇒ 只报名单、不给档（不假设「全体」）
  const noViewer = POV.project(BANK, {});
  assert.equal(noViewer.viewerKnown, false);
  assert.ok(noViewer.viewers.length >= 3, '未选视角时必须报名单');
  assert.equal(noViewer.counts.total, 0, '未选视角时不得给任何档（不假设全体视角）');
});

test('F2: 出生版本下界锚点 —— 锁 3.439.0（不随抬版上抬）', () => {
  /* ★ [v3.441.0] 交棒链拆除：历史档案锁**自己的出生版本**，当版锚交棒给当版档案
   *   （tests/v3441_l13_x4_evidence_gap.test.mjs 的 F1）。
   *   改前形态（v3.439.0 首版）是三源逐字 `assert.equal(x, CUR)`，抬版当天即红 ——
   *   那不是产品缺陷，是历史档案把「当版」写死成「永恒当版」的欠账。
   *   现状：下界 = 出生版本 3.439.0；三源改为**互等**（不对外承诺等于当版）。 */
  const BORN_V = '3.439.0';
  const vnum = (v) => {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(v || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
  };
  assert.equal(vnum(BORN_V), 3439000, '出生版本锚（vnum 形）：3.439.0 ⇒ 3439000');
  assert.equal(MANIFEST.version, PKG.version, 'manifest 与 package 必须互等');
  const live = (/const VERSION = '([0-9]+[.][0-9]+[.][0-9]+)'/.exec(HOST_SRC) || [])[1];
  assert.ok(live, 'index.js VERSION 必须在场');
  assert.equal(live, MANIFEST.version, 'index.js VERSION 与 manifest 必须互等（实 ' + live + '）');
  assert.ok(vnum(live) >= vnum(BORN_V), '当版不得低于本档出生版本 ' + BORN_V + '（实 ' + live + '）');
  assert.ok(at(POV_SRC, 'var POV_VERSION = ') > 0, '内核版本常量必须在场（防测了旧版）');
  assert.equal(POV.POV_VERSION, 1);
  assert.ok(fs.existsSync(path.join(ROOT, 'pov-projection.js')));
});