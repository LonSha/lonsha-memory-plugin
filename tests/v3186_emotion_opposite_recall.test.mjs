// tests/v3186_emotion_opposite_recall.test.mjs
// [v3.186.0] 情绪反向召回的验收面：
//   负面情绪在场时，把「与之相对的那一面」（joy/warm 词）也带进候选——这是本仓此前**唯一**
//   没有任何通道覆盖的缺口（BM25 抓不到零字面交集的文本，向量依赖 Embedding 且不稳）。
//
// 本文件覆盖五个面：
//   ① 模块行为（真跑函数）：反向提中、同类不提、五态 reason 可分辨、词表逐词归属
//   ② 词表与词典的**同源关系**：键必在负面四维、值必在 joy/warm——照搬原库的词表会在这里成片翻红
//   ③ 宿主接线：取库助手 / 召回侧真调用 / 提权位置与幅度 / 诊断行 / selfCheck 行
//   ④ 口径守卫：默认关 + 有 UI + **未引入**原库的 CHAT_COMPLETION_PROMPT_READY 注入路线
//   ⑤ 发布卫生：版本三源同源、CHANGELOG 顶节、当版独占交出（frontier 下界已升到本版）
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import assert from 'node:assert/strict';
import test from 'node:test';
import { stripComments } from './_audit_lib.mjs';
const ROOT = new URL('..', import.meta.url).pathname;
const require_ = createRequire(import.meta.url);
const src = readFileSync(ROOT + 'index.js', 'utf-8');
const sui = readFileSync(ROOT + 'settings-ui.js', 'utf-8');
const mf = JSON.parse(readFileSync(ROOT + 'manifest.json', 'utf-8'));
const pkg = JSON.parse(readFileSync(ROOT + 'package.json', 'utf-8'));
const changelog = readFileSync(ROOT + 'CHANGELOG.md', 'utf-8');
const NP = require_('../narrative-pulse.js');
const vnum = (v) => Number(String(v).split('.').map((x) => x.padStart(3, '0')).join(''));
const KEY = 'emotionOppositeRecall';

const cleanSrc = stripComments(src);

/* ══════════════ 1. 模块行为（真跑函数，不看文本） ══════════════ */
// 夹具刻意让「查询」与「反向目标」零字面交集：正向词只出现在候选里，不出现在查询里。
//   若把正向词写进查询，本组就退化成「BM25 本来也能做到的事」，证明不了独立增量。
const FIX_DOCS = [
    { key: 'sum_11', text: '他温柔地陪着她，说会一直守护她，让她安心。' },   // 反向目标（warm/joy 词）
    { key: 'sum_12', text: '她一个人哭到很晚，心里满是难过与孤独。' },       // 同类负面（不该被当反向提）
    { key: 'sum_13', text: '窗外的风很大，店铺已经打烊了。' },                // 无关
    { key: 'sum_14', text: '他把她抱进怀里，那一下很温暖，她终于安下心来。' },
    { key: 'sum_15', text: '他承诺会守着她，这里就是她的归处。' },
];
const FIX_QUERY = '她心里难过极了。';
test('v3186 1. 夹具自证：查询里不得含任何正向线索词（否则本组证明不了独立增量）', () => {
    for (const w of ['温柔', '守护', '安心', '温暖', '陪伴']) {
        assert.ok(!FIX_QUERY.includes(w), '查询里不得含正向词「' + w + '」——含了就退化成 BM25 也能做到的事');
    }
    assert.ok(FIX_QUERY.includes('难过'), '查询必须带明确的负面情绪词（否则机制根本不该触发）');
});
test('v3186 2. 反向提中：负面主导下提中与查询零字面交集的那些摘要', () => {
    const r = NP.recallByOppositeEmotion({ queryText: FIX_QUERY, docs: FIX_DOCS });
    assert.equal(r.active, true, '负面情绪在场时机制必须进入扫描态');
    assert.equal(r.reason, 'ok', 'reason 必须是 ok（真扫了）');
    assert.equal(r.dominant, 'sad', '主导维必须是 sad');
    assert.ok(r.opposite.includes('sum_11'), '应提中含「温柔/守护/安心」的那条，实得 ' + JSON.stringify(r.opposite));
    // 关键判据：命中的条目与查询**零字面交集**。这正是 BM25 抓不到的部分。
    const hit = FIX_DOCS.find((d) => d.key === 'sum_11');
    for (const ch of ['难', '过', '极']) assert.ok(!hit.text.includes(ch), '反向目标不得与查询有字面交集（否则无独立增量）');
});
test('v3186 3. 同类不误提：含负面词的同类条目不得被当成反向线索', () => {
    const r = NP.recallByOppositeEmotion({ queryText: FIX_QUERY, docs: FIX_DOCS });
    assert.ok(!r.opposite.includes('sum_12'),
        '同类负面条目（含「难过/孤独」）被提中即说明机制跑偏成「同词提权」：' + JSON.stringify(r.opposite));
});
test('v3186 4. 五态 reason 可分辨（读数纪律：没接上 / 接上了但本轮无事 不同形）', () => {
    const empty = NP.recallByOppositeEmotion({ queryText: '', docs: FIX_DOCS });
    assert.equal(empty.reason, 'empty', '无查询文本 → empty（函数根本没开始判断）');
    const noDoc = NP.recallByOppositeEmotion({ queryText: FIX_QUERY, docs: [] });
    assert.equal(noDoc.reason, 'empty', '无候选文档 → empty');
    const none = NP.recallByOppositeEmotion({ queryText: '她走进房间，打开了窗户。', docs: FIX_DOCS });
    assert.equal(none.reason, 'no-emotion', '扫不到情绪词 → no-emotion');
    assert.equal(none.active, false, '无情绪时不得 active');
    const pos = NP.recallByOppositeEmotion({ queryText: '她笑得很开心，心里甜丝丝的。', docs: FIX_DOCS });
    assert.equal(pos.reason, 'no-polarity', '正面主导 → no-polarity（不是「没情绪」，是极性方向不对）');
    assert.equal(pos.dominant, 'joy', '必须报出主导维，否则与「无主导维」同形（本版 rev2 踩过的坑）');
    const ten = NP.recallByOppositeEmotion({ queryText: '气氛紧绷，杀意在暗处浮动。', docs: FIX_DOCS });
    assert.equal(ten.reason, 'no-polarity', '氛围维（极性 0）→ no-polarity');
    assert.equal(ten.dominant, 'tense', '氛围维也必须报出主导维（否则与「一个词都没扫到」同形）');
});
test('v3186 5. 只产反向线索：候选里含查询同词的条目不得因此被提', () => {
    // 直接证据：把「查询用词」单独放进一条候选，它不该出现在 opposite 里。
    const docs = [{ key: 'echo', text: '她难过，很难过。' }, { key: 'opp', text: '他温柔地抱着她，很温暖。' }];
    const r = NP.recallByOppositeEmotion({ queryText: '她难过。', docs });
    assert.ok(r.opposite.includes('opp'), '反向目标必须被提中');
    assert.ok(!r.opposite.includes('echo'), '与查询同词的条目不得被提中（那是 BM25 的活，不是本机制的）');
});
test('v3186 6. 上限与读数：opposite 不超过 max，scanned 反映看过的条数', () => {
    const r = NP.recallByOppositeEmotion({ queryText: FIX_QUERY, docs: FIX_DOCS, max: 2 });
    assert.ok(r.opposite.length <= 2, 'opposite 不得超过 max，实得 ' + r.opposite.length);
    assert.equal(r.scanned, FIX_DOCS.length, 'scanned 必须反映实际看过多少条（已满仍继续走，读数才可信）');
});

/* ══════════════ 2. 词表与词典的同源关系（逐词核对，不数个数） ══════════════ */
//   本节立论：缝合词表的价值**不在条数多少**，而在每个词都能被本仓词典扫到。
//   照搬原库那 17 个形容词会在这里成片翻红（它们与本仓 EMO_LEXICON 不重合）。
const LEX = NP.EMO_LEXICON || {};
const OPP = NP.EMOTION_OPPOSITES || {};
const POL = { joy: 1, warm: 0.8, sad: -0.6, fear: -0.7, anger: -0.5, tense: 0 };
// 合法来源维从极性表推导（不手抄）：tense 属「负面情形」，但极性 0 表示它是氛围而非情绪倾向，
//   故它在召回层不可达——这件事由上面的行为判据（v3186 4）钉住，此处只管词表归属。
const NEG_SOURCE_DIMS = Object.keys(POL).filter((d) => d !== 'joy' && d !== 'warm');
test('v3186 7. 键纪律：每个键都在负面四维里（否则 scanEmotion 永远扫不到它）', () => {
    const bad = [];
    for (const neg of Object.keys(OPP)) {
        const dims = Object.keys(LEX).filter((d) => neg in (LEX[d] || {}));
        if (!dims.length) { bad.push(neg + '(不在任何维)'); continue; }
        if (!dims.some((d) => NEG_SOURCE_DIMS.includes(d))) bad.push(neg + '(' + dims.join('/') + ')');
    }
    assert.deepEqual(bad, [], '这些键不在负面维里，不该作线索源：' + bad.join('、'));
    assert.ok(Object.keys(OPP).length >= 20, '词表规模下限（防被截断成空壳）');
});
test('v3186 8. 值纪律：每个值都在 joy/warm 里（写了扫不到的词 ⇒ 线索恒空）', () => {
    const bad = [];
    for (const [neg, vals] of Object.entries(OPP)) {
        for (const v of (Array.isArray(vals) ? vals : [])) {
            if (!(v in (LEX.joy || {})) && !(v in (LEX.warm || {}))) bad.push(neg + '→' + v);
        }
    }
    assert.deepEqual(bad, [], '这些值不在 joy/warm 维里（反向线索会恒空）：' + bad.join('、'));
});
test('v3186 9. 四维皆可出线索；正面两维不得作来源（它是线索的目标，不是来源）', () => {
    for (const d of ['sad', 'fear', 'anger', 'tense']) {
        assert.ok(NP.opposedWordsFor(d).length > 0, d + ' 维没有任何反向词（该维负面情绪永远出不了线索）');
    }
    for (const d of ['joy', 'warm']) {
        assert.equal(NP.opposedWordsFor(d).length, 0, d + ' 维本不该有反向词（它是目标不是来源）');
    }
});
test('v3186 10. 词表驱动行为：删掉映射后四维反向词同时归零（证明行为真由词表决定）', () => {
    // 反向验证：opposedWordsFor 若不再读 EMOTION_OPPOSITES，这条会失去意义。
    //   这里用「并集 == 各键值去重后」核对，确保函数确实在汇出映射而不是别的东西。
    for (const d of ['sad', 'fear', 'anger', 'tense']) {
        const expect = new Set();
        for (const w of Object.keys(LEX[d] || {})) for (const p of (OPP[w] || [])) expect.add(p);
        assert.deepEqual([...NP.opposedWordsFor(d)].sort(), [...expect].sort(), d + ' 维并集必须等于由映射汇出的集合');
    }
});

/* ══════════════ 3. 宿主接线（生产必须有消费者） ══════════════ */
test('v3186 11. 取库助手在场，且取的是情绪模块（不新建第二份词表）', () => {
    assert.ok(/function _emotionOppositeLib\(\)/.test(cleanSrc), '必须有取库助手');
    assert.ok(cleanSrc.includes("window.LonShaNarrativePulse, 'narrative-pulse.js'"), '取的必须是 narrative-pulse');
    // 「两份词表必然漂移」：宿主侧不得自带一份相反词映射。
    assert.equal(cleanSrc.split('EMOTION_OPPOSITES').length - 1, 0,
        '宿主侧不得出现 EMOTION_OPPOSITES（词表只能有一份，在模块里）');
});
test('v3186 12. 召回侧真调用：线索算得出、且有人在用', () => {
    assert.ok(/EL\.recallByOppositeEmotion\s*\(/.test(cleanSrc), '宿主必须真调用 recallByOppositeEmotion');
    assert.ok(cleanSrc.includes('if (_emoOppositeKeys && _emoOppositeKeys.size) {'), '必须有提权块入口');
    assert.ok(/_emoOppositeKeys\.has\(/.test(cleanSrc), '提权块必须真对键集合求值（否则块内什么都没干）');
});
test('v3186 13. 位置纪律：提权落在 hybridMerge 之后、intentRerank 之前', () => {
    const pMerge = cleanSrc.indexOf('const merged = this.hybridMerge(results);');
    const pEmo = cleanSrc.indexOf('if (_emoOppositeKeys && _emoOppositeKeys.size) {');
    const pRerank = cleanSrc.indexOf('this.intentRerank(merged, query.text);');
    assert.ok(pMerge > 0 && pEmo > 0 && pRerank > 0, '三个锚点都必须在场');
    assert.ok(pMerge < pEmo, '情绪提权必须在 hybridMerge 之后（否则改的是不存在的名次）');
    assert.ok(pEmo < pRerank, '情绪提权必须在 intentRerank 之前（否则重排会覆盖提权效果）');
});
test('v3186 14. 边界纪律：提权块内不写图、不删边、幅度只动名次边界', () => {
    const i = cleanSrc.indexOf('if (_emoOppositeKeys && _emoOppositeKeys.size) {');
    const j = cleanSrc.indexOf('this.intentRerank(merged, query.text)', i);
    const block = cleanSrc.slice(i, j > i ? j : i + 3000);
    for (const f of ['addEdge', 'removeRef', 'deleteEdge', '.splice(', 'graph.add']) {
        assert.ok(!block.includes(f), '提权块内不得出现 ' + f + '（承诺只提名次，不写图/不删边）');
    }
    const amt = /rrfScore\s*=\s*\(\s*[^()]*\|\|\s*0\s*\)\s*\+\s*([0-9.]+)/.exec(block);
    assert.ok(amt, '提权块内必须有 rrfScore = (x||0) + <常量> 形态');
    assert.ok(Number(amt[1]) > 0 && Number(amt[1]) <= 0.05,
        '提权幅度 ' + amt[1] + ' 必须 >0 且 ≤0.05（只动名次边界，不得把低相关条目抬进前排）');
});

/* ══════════════ 4. 读数与口径（五态 + 默认关 + 注入口径守卫） ══════════════ */
test('v3186 15. 诊断行五态齐（否则「机制不在场」与「本轮无事」同形）', () => {
    const lines = src.split('\n');
    let body = '';
    for (let i = 0; i < lines.length; i++) {
        // 花括号配平提取方法体：不用「遇到下一个方法头就停」的启发式——
        //   那会被方法体内部的 `if (r.reason === 'ok') {` 误判（本版正控实测踩过）。
        const m = /^(\s{4,})_emotionOppositeLine\s*\(/.exec(lines[i]);
        if (!m) continue;
        const out = [];
        let depth = 0, started = false;
        for (let j = i; j < lines.length; j++) {
            out.push(lines[j]);
            for (const ch of lines[j]) {
                if (ch === '{') { depth++; started = true; }
                else if (ch === '}') depth--;
            }
            if (started && depth <= 0) break;
            if (out.length > 60) break;
        }
        body = out.join('\n');
        break;
    }
    assert.ok(body, '必须定位到 _emotionOppositeLine 方法体');
    for (const [label, needle] of [
        ['未启用态', '未启用（默认关）'],
        ['模块缺席态', '模块未加载'],
        ['待本轮态', '待本轮'],
        ['生效读数', '主导 →'],
        ['无线索态', '无反向线索'],
    ]) {
        assert.ok(body.includes(needle), '诊断行缺「' + label + '」（' + needle + '）');
    }
});
test('v3186 16. ⚠️ 只挂长期空转（真扫过 ≥5 轮却零提权），不挂「本轮无事」', () => {
    assert.ok(/Number\(this\._emoOppositeRounds \|\| 0\) >= 5/.test(cleanSrc), '⚠️ 必须与「真扫过 ≥5 轮」绑定');
    assert.ok(/idle\s*\?\s*' ⚠️'\s*:\s*''/.test(cleanSrc), '⚠️ 必须真挂在 idle 分支上');
    // 「本条无事」不得被当成缺陷：idle 还必须以「零提权」为前提。
    assert.ok(/!\s*Number\(this\._emoOppositeBoosted \|\| 0\)/.test(cleanSrc), 'idle 必须还要求零提权');
});
test('v3186 17. 配置面：默认关（false）+ 有 UI 控件 + 有消费点', () => {
    assert.ok(new RegExp(KEY + '\\s*:\\s*false').test(cleanSrc), KEY + ' 默认必须为 false（默认关＝零行为变化承诺）');
    assert.ok(new RegExp(KEY + '\\s*===\\s*true').test(cleanSrc), KEY + ' 必须有消费点（否则是死配置）');
    assert.ok(sui.includes("ck('" + KEY + "'"), KEY + ' 缺 settings-ui 控件（v3.160 纪律）');
});
test('v3186 18. 关闭时零开销：扫描被包在开关守卫内（关时连词表都不读）', () => {
    const i = cleanSrc.indexOf(KEY + ' === true');
    assert.ok(i > 0, '必须存在开关键守卫');
    const callIdx = cleanSrc.indexOf('EL.recallByOppositeEmotion({');
    assert.ok(callIdx > i, '调用必须落在开关守卫之后（否则关着也在扫词表）');
    // 守卫与调用之间的距离须在同一块内（不被别的方法隔开）。
    assert.ok(callIdx - i < 800, '守卫与调用之间距离过大（' + (callIdx - i) + '），形态可能已漂移');
});
test('v3186 19. 口径守卫：未引入原库注入路线，本仓 setExtensionPrompt 路线在场', () => {
    // 用户明确「只取机制、保持本仓注入口径」。允许该事件名出现在注释里说明来源，
    //   但不得成为真事件注册点。判据在**剥注释后的代码**上做（注释里合法提及不算违规）。
    const reg = /on\s*\(\s*['"]CHAT_COMPLETION_PROMPT_READY['"]/.test(cleanSrc);
    assert.ok(!reg, '不得把 CHAT_COMPLETION_PROMPT_READY 变成真事件注册点（用户要求只取机制）');
    assert.ok(cleanSrc.includes('setExtensionPrompt'), '本仓 setExtensionPrompt 注入口径必须仍在场');
    // 机制来源须在注释里写清（本仓惯例：取舍写在原地）。
    assert.ok(src.includes('memory-palace'), '须在源码注释里说明机制来源');
});
test('v3186 20. 只取机制不取注入口径：原库那套「直接改 chat 本体」的做法不得引入', () => {
    // 只守**原库特有的**两样：① 直接**写入** is_system（把自己插成对话里的 system 消息）；
    //   ② hideFloorsExceptRecent。
    //   判据选材教训（本版实测踩过两次）：
    //     · 不能把 `ctx.saveChat()` 列为违禁——那是本仓既有合法调用（HEAD 版 index.js:13834）；
    //     · 也不能把 `is_system` 一词列为违禁——本仓**读侧**合法使用它 6 处（判「安静生成的消息」）。
    //   真正的违禁形态是**写**：`X.is_system = ...`。把合法用法当违禁串会让判据永远假红，
    //   而假红的判据比漏判更伤（它会让人习惯性忽略红灯）。
    const writeRe = /\.is_system\s*=\s*(?!==)/;
    assert.ok(!writeRe.test(cleanSrc), '不得写入 is_system（原库靠它把自己插成 system 消息）');
    assert.ok(!cleanSrc.includes('hideFloorsExceptRecent'), '不得引入原库的 hideFloorsExceptRecent');
    const npClean = stripComments(readFileSync(ROOT + 'narrative-pulse.js', 'utf-8'));
    assert.ok(!writeRe.test(npClean), '模块侧也不得写入 is_system');
    assert.ok(!npClean.includes('hideFloorsExceptRecent'), '模块侧也不得引入 hideFloorsExceptRecent');
    // 机制来源须在注释里写清，且写明「只取机制、不取注入口径」的取舍（本仓惯例：取舍写在原地）。
    assert.ok(src.includes('memory-palace'), '须在源码注释里说明机制来源');
    assert.ok(/不取.{0,6}注入口径|不引入那条路线/.test(src), '须在源码注释里写明「不取注入口径」的取舍');
});

/* ══════════════ 5. 发布卫生 ══════════════ */
test('v3186 21. 版本三源同源，且不低于本版', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    assert.equal(v, mf.version, 'manifest 必须跟随 index.js');
    assert.equal(v, pkg.version, 'package.json 必须跟随 index.js');
    assert.ok(vnum(v) >= vnum('3.201.0'), '版本 ' + v + ' 须 >= 3.186.0');
});
test('v3186 22. CHANGELOG 顶节为本版，且记录了本版的关键取舍现场', () => {
    const top = (changelog.match(/^## (v[0-9.]+)/m) || [])[1];
    assert.ok(top, 'CHANGELOG 必须有序节');
    assert.ok(vnum(top.replace('v', '')) >= vnum('3.201.0'), '顶节 ' + top + ' 须 >= v3.186.0');
    assert.ok(/情绪反向/.test(changelog), '须记录情绪反向召回本体');
    assert.ok(/只取机制/.test(changelog), '须记录「只取机制、不取注入口径」这一取舍');
    assert.ok(/既有更强实现|更强/.test(changelog), '须记录「点选三项里两项本仓已有更强实现」这一据实修正');
});
test('v3186 23. 当版独占交出：frontier 集合的滚动下界必须已升到本版', () => {
    const curV = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    const cur = vnum(curV);
    const frontier = ['v3160_config_declaration_gap', 'v3161_config_reachability', 'v3162_ui_binding_hygiene',
        'v3163_module_wiring', 'v3164_event_lifecycle', 'v3165_claim_truthfulness',
        'v3166_config_migration_write_ledger', 'v3167_cse_capacity_identity',
        'v3180_floor_ledger_age_anchor_public_interface', 'v3181_spatial_grounding', 'v3182_ledger_replay'];
    for (const f of frontier) {
        const t = readFileSync(ROOT + 'tests/' + f + '.test.mjs', 'utf-8');
        const hits = [...t.matchAll(/vnum\('(\d+[.]\d+[.]\d+)'\)/g)].map((m) => vnum(m[1]));
        assert.ok(hits.length > 0, f + ' 仍须锚着版本字符串');
        // 滚动下界必须是**恰好本版**：低于本版会被上版独占契约抓住，高于本版则说明本版没交棒。
        assert.ok(hits.every((h) => h <= cur), f + ' 的滚动下界不得高于当前版本（否则本版越界承诺未来）');
        assert.ok(hits.some((h) => h === cur), f + ' 的滚动下界必须已升到 ' + curV + '（当版独占交出）');
    }
});
test('v3186 24. 审计基建在场：正控 + 负控两个脚本', () => {
    const a = readFileSync(ROOT + 'tests/audit/scan_v3186_emotion_recall.mjs', 'utf-8');
    const n = readFileSync(ROOT + 'tests/audit/scan_v3186_emotion_recall_negctl.mjs', 'utf-8');
    assert.ok(a.includes('LONSHA_AUDIT_ROOT'), '正控须支持夹具通道（负控依赖它）');
    assert.ok(a.includes('判据纯度'), '正控须有判据纯度自检');
    assert.ok(n.includes('mutate('), '负控须有真源码破坏工具');
    assert.ok(n.includes('拒绝破坏') || n.includes('不静默通过'), '负控须有工具两向自证');
});
