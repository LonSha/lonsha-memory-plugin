/* ============================================================
 * tests/v3330_m4o2_qa_topic_actors.test.mjs — [v3.330.0 · 第四期 M4-O2]（26 条）
 *
 * 【本套件要证明的是「问句里的主题、人名与时点不被丢掉」，不是「函数返回了对象」】
 *   M4-O2「问句保留主题、多人物与时点」四条验收，逐条对应修前**实测**出来的真缺陷
 *   （探针口径：40 条问句 = 20 条固定 + 20 条未调参改写，见 E4 口径自证）：
 *      ① **首个子串命中获选**（顺序依赖）：`knownActors=['林','林安']` 时
 *         「林安答应…」会选到「林」，**名单顺序一变答案就变** —— 同一问句两个答案；
 *      ② **影子名**：短名是长名的前缀 ⇒ 被当成第二个在场者，双人问句读成「两人都在场」；
 *      ③ **主题恒空**：promise 计划的 `text` 固定 `''` ⇒ 问「答应送什么生日礼物」
 *         返回该人**全部**承诺（把宽答冒充精确答）；
 *      ④ **双人关系退化**：条件面的 `actors` 是「命中任一」，单条 OR 计划把
 *         「甲和乙之间」退化成「甲乙任选其一」；
 *      ⑤ **别名认不出**：旧称一律进 gaps（纪律正确）但**没有任何通道**让宿主把
 *         图谱里已有的 `data.aliases` 喂进来 ⇒ 用户看到的是「查不到」；
 *      ⑥ **相对时点被静默吞掉**：「那时候 / 当年」既不保留也不提示。
 *
 * 【判据设计纪律（本仓已定性）】
 *   · 全部走**真源**：`evidence-query.js` 真加载（隔离 vm，与生产同形），宿主侧
 *     取 `index.js` 的**同一份函数体文本**在 `new Function` 里装起来跑
 *     （不重写一份宿主逻辑 —— 重写就是把实现抄进判据，第二份真源）；
 *   · 断言锚在**行为读数**上，不锚在被破坏的那处字面量上：本仓负控制一律
 *     「真源码破坏 → 破坏副本上重跑同款真判据 → 必须现形」；
 *   · 主题词断言只钉**必须被保留**的实词、**必须不被当成主题**的骨架词，
 *     以及**主题必须被某条计划当条件消费**这条不变量 —— 不钉「恰好等于某串」
 *     （词表会演进，钉死会把对的实现判红）。
 *
 * 【本档自己的判据翻修留痕（第一版判据错，不是实现错）】
 *   · **判据必须拿到被测模块**：首版五个判据声明成无参、内部闭包在**原版** EQ 上，
 *     破坏副本传进去被静默丢弃 ⇒ D 段十条负控制「仍然绿」（多余实参被 JS 忽略，
 *     不报错）。现在每个判据都显式收 `E`，且**正向复跑**也走同一函数。
 *   · **锚点必须可观测**：首版 D1 锚「长名排序」被 `actors.sort((x,y) => x.at - y.at)`
 *     兜住（去掉排序后按问句位置仍选长名）；D4 锚「关系只出首侧」时另一侧由 `promise`
 *     循环补上；D6 锚 `via:'alias'` 改的是**装饰字段**（决策在上面的 `hits.some` 里
 *     已经做完）⇒ 破坏后读数不变。三者换成实测承重的锚（影子名判定 / 别名登记位 /
 *     字符级功能字清理 / 停止词次序）。
 *   · **锚点必须唯一**：`sort((x, y) => y.length - x.length)` 在真源码里命中 2 次
 *     （`words.sort` 同款表达式），`breakOnce` 当场抛「锚点命中 2 次」——
 *     缩窄成含 `STOP.slice()` 的唯一上下文。
 *   · **宿主夹具不许两道守卫重叠**：C1 原夹具的事件节点名不在已知人名里，
 *     `if (!known.has(c)) return;` 已把它挡掉 ⇒「只收 character」那道守卫冗余不可观测。
 *     事件节点改名成已知人名「王五」，两道守卫才各自承重。
 *   · **主题读数与兜底宽查正文已分列**（[v3.330.0] `literals`）：宽查不带主题，
 *     故 A2 不再要求「没主题也不许有宽查正文」；改钉「主题若被上报，必须被某条计划
 *     的 text 条件逐字消费」这条不变量。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { breakOnce } from './_break_kit.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const require_ = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const IDX = read('index.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const EQ_SRC = read('evidence-query.js');
const SELF = read(path.join('tests', 'v3330_m4o2_qa_topic_actors.test.mjs'));
/** 在隔离 vm 里加载 IIFE 模块（与生产同形：window 即全局，module 缺席）。 */
function loadIIFE(src, globalName, extra) {
    const ctx = Object.assign({
        console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
        isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError
    }, extra || {});
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const api = ctx[globalName];
    if (!api) throw new Error('模块未挂 ' + globalName);
    return api;
}
const EQ = loadIIFE(EQ_SRC, 'LonShaEvidenceQuery');
const CL = require_(path.join(R, 'commitment-ledger.js'));
/* ══════════════ 负控制锚点（在判据层只声明一次 —— H5 判据纯度） ══════════════
 *   ★ 锚点若在「破坏调用」与「纯度断言」两处各写一份，改一处漏一处时纯度检查会恒过。
 *   ★ 用 String.raw 保留真字符，避免「按字面量数出现次数」数的是转义串
 *     （v3329 收口实测：`\'p:\'` 形式被跨仓守卫的 Windows 盘符启发式误判，故全档一律 String.raw）。
 *   ★ 每个锚都经**实测**确认：破坏后对应判据**真的转红**（见 D 段每条的自证输出）。 */
const ANCHORS = Object.freeze({
    /* 影子名判定：去掉它 ⇒ 短名「林」被当成第二个在场者（实测红：影子名没被吸收）。 */
    shadowPred: String.raw`if (hits.some((z) => z !== h && z.name.length > h.name.length && z.name.indexOf(h.name) >= 0)) {`,
    /* 主题取值：置空 ⇒ 「生日礼物」不进条件（实测红：主题没进条件 ""）。 */
    topicKept: String.raw`const topic = words.length ? words[0].slice(0, 40) : '';`,
    /* 停止词次序：改成短词优先 ⇒ 「她为什么变卦」的「为什么」被切成「为」,
     *   「什么时候」被切成「时候」，残渣进主题（实测红：骨架被当主题「时候」）。 */
    stopLongFirst: String.raw`const stopSorted = STOP.slice().sort((x, y) => y.length - x.length);`,
    /* 字符级功能字清理（按词剥首尾）：空转 ⇒ 剥剩的「事有」（「要做的事有哪些」）进主题
     *   （实测红：骨架被当主题「事有」）。
     *   ★ 锚取「词首尾剥」这一步而非旧版的整行全局替换 —— 后者在 v3.330.0 修订里
     *     已改成按词剥（位置无关会把「周三还书」的「还」也剥掉，主题退化成「周三」）。 */
    charCleanup: String.raw`rest = rest.split(' ').map((w) => w.replace(FNHEAD, '').replace(FNTAIL, '')).filter(Boolean).join(' ')`,
    /* 双人拆侧：关系问句只出首侧（实测红：关系没拆两侧 1）。 */
    twoSides: String.raw`for (const nm of actorNames.slice(0, 4)) {`,
    /* 连接词弱形态：「苏晴跟林一有什么约定」不再算双人（实测红：弱形态未识别为双人）。 */
    joinDetect: String.raw`if (joined) intents.push('relation');`,
    /* 别名登记位：登记**别名本身**而不是本名 ⇒ 落不进按人条件（实测红：别名未解析 小安）。 */
    aliasRegister: String.raw`hits.push({ name: canon, via: 'alias', at: at, alias: a2 });`,
    /* 别名准入守卫：指向未登记人名也采纳 ⇒ 凭空造人（实测红：别名指向未登记人名仍被采纳 张明）。 */
    aliasGuard: String.raw`if (known.indexOf(canon) < 0) continue;`,
    /* 关系求交：交集置空 ⇒ 共现变「无共同」（实测红：未报共现 no-co-occur）。 */
    commonRefs: String.raw`let common = [...rel[0].refs];`,
    /* 时点缺口：把缺口弹掉 ⇒ 静默吞掉（实测红：时点未给缺口）。 */
    timeGap: String.raw`kind: 'time-hint',`,
    /* 宿主别名装配：类型守卫去掉 ⇒ 事件节点混入别名表（夹具事件名是已知人名「王五」时
     *   才可观测；实测红：别名表内容多出「老王」）。 */
    hostCharType: String.raw`if (!nd || nd.type !== 'character') continue;`,
    /* 宿主别名方向：反向写表 ⇒ 本名成了键（实测红：别名表内容变成 林一,苏晴）。 */
    hostAliasDir: String.raw`out[a] = c;`,
    /* 宿主出口主题外送：置空 ⇒ 核心算了但出口不报（实测红：出口没带主题 []）。 */
    hostTopicOut: String.raw`topics: Array.isArray(plan.topics) ? plan.topics : [],`,
    /* 关系专属缺口的抑噪判据:去掉它 ⇒ 一侧缺席时额外多报一条宽泛 no-answer,
     *   缺席与「都没查到」在读数条数上又同形(实测红见 D14)。 */
    noAnswerSuppressed: String.raw`const relationGap = gaps.some((g) => g && g.planId === 'relation');`,
});
/* ══════════════ 判据（纯函数，逐个显式收被测模块 `E` —— 见档头翻修留痕①） ══════════════ */
const KNOWN = ['苏晴', '林一', '林', '王五'];
const ALIAS = { 小安: '林一', 晴姐: '苏晴' };
const plan = (q, opts) => EQ.planQuestion(q, Object.assign({ knownActors: KNOWN, actorAliases: ALIAS }, opts || {}));
/** ① 首个子串命中获选（顺序依赖）：正序 / 反序必须给出**逐字同形**的结论。 */
function o2JudgeOrder(E) {
    const a = E.planQuestion('林一答应了什么？', { knownActors: ['林', '林一'] });
    const b = E.planQuestion('林一答应了什么？', { knownActors: ['林一', '林'] });
    if (a.actor !== '林一' || b.actor !== '林一') {
        throw new Error('短名抢选：同一问句两份名单得到 ' + a.actor + ' / ' + b.actor + '（顺序依赖＝同一问句两个答案）');
    }
    if (JSON.stringify(a.plans) !== JSON.stringify(b.plans)) throw new Error('两份名单的计划不同形');
    if (a.actors.join(',') !== '林一') throw new Error('影子名「林」没被实名吸收：actors=' + a.actors.join(','));
    if (a.shadowed.indexOf('林') < 0) throw new Error('影子名未如实登记（静默吞掉比报出来更坏）');
    /* 点名问「林」时仍按短名答（不是永远取长名）——「没被吸收」与「不许单独问」是两回事。 */
    if (E.planQuestion('林答应了什么？', { knownActors: ['林', '林一'] }).actor !== '林') {
        throw new Error('单独问短名时被长名吞掉（影子名排除不得变成「短名不可问」）');
    }
    return a;
}
/** ② 主题词保留：实词必须进 `text`；骨架词必须不进；主题必须被某条计划消费。 */
const MUST = ['生日礼物', '周三还书', '还书', '反悔', '变卦'];
const NEVER = ['什么', '为什么', '有没有', '和谁', '之间', '所有人', '她为', '事有', '要做', '时候', '说些'];
/* 内容问句（剥掉问句骨架后**必须**留下实词）。 */
const CONTENT = ['苏晴答应送什么生日礼物？', '苏晴有没有答应送生日礼物？', '她为什么变卦？',
    '苏晴为什么反悔？', '谁答应了周三还书？'];
/* 纯骨架问句（剥完只剩问句骨架 ⇒ 主题读数必须为空，不许凑一个词）。 */
const BARE = ['苏晴答应了什么？', '所有人都答应过什么？', '林一与苏晴之间有什么约定？',
    '那件事后来怎样了？', '事情最后结果如何？', '双方之间有过约定吗？', '苏晴保证要做的事有哪些？',
    '苏晴什么时候答应过？', '苏晴说些什么？', '他们之间是什么关系？'];
function o2JudgeTopic(E) {
    /* I2 内容问句必须保留实词。 */
    for (const q of CONTENT) {
        const p = E.planQuestion(q, { knownActors: KNOWN, actorAliases: ALIAS });
        if (!p.topics.length) throw new Error('内容问句主题丢了（宽答冒充精确答）：' + q);
        if (!MUST.some((m) => p.topics.some((t) => t.indexOf(m) >= 0))) {
            throw new Error('内容问句里没有一个必需实词：' + q + ' → ' + JSON.stringify(p.topics));
        }
    }
    const a = E.planQuestion('苏晴答应送什么生日礼物？', { knownActors: KNOWN, actorAliases: ALIAS });
    const pa = a.plans.filter((x) => x.id === 'promise')[0];
    if (!pa) throw new Error('未产出 promise 计划');
    if (pa.spec.text !== '生日礼物') throw new Error('主题词没进正文条件（修前恒空 ⇒ 返回该人全部承诺）：' + JSON.stringify(pa.spec.text));
    if (a.topics.join(',') !== '生日礼物') throw new Error('主题读数不对：' + a.topics.join(','));
    /* 复合问句（两个问题拼一句）里两侧主题都得在条件上 —— 不要求「恰好一档」。 */
    const c = E.planQuestion('苏晴答应送什么生日礼物并且和林一之间有什么约定？', { knownActors: KNOWN, actorAliases: ALIAS });
    if (c.plans.filter((x) => x.id === 'promise')[0].spec.text.indexOf('生日礼物') < 0) {
        throw new Error('复合问句里主题丢了');
    }
    if (c.actors.join(',') !== '苏晴,林一') throw new Error('复合问句里第二个人名丢了：' + c.actors.join(','));
    /* I3 骨架词不得被当主题（它会被当下发的正文子串条件 ⇒ 命中 0 条，
     *   而那是「主题没提出来」被显示成「查不到」——两者处置相反）。 */
    for (const q of CONTENT.concat(BARE)) {
        const p = E.planQuestion(q, { knownActors: KNOWN, actorAliases: ALIAS });
        for (const t of p.topics) {
            for (const bad of NEVER) {
                if (t.indexOf(bad) >= 0) throw new Error('问句骨架被当主题「' + t + '」← ' + q + '（骨架词 ' + bad + '）');
            }
        }
    }
    /* I4 纯骨架问句：主题读数必须为空（凑一个词会把宽答说成精确答）。 */
    for (const q of BARE) {
        const p = E.planQuestion(q, { knownActors: KNOWN, actorAliases: ALIAS });
        if (p.topics.length) throw new Error('纯骨架问句硬塞了主题：' + q + ' → ' + p.topics.join(','));
    }
    /* I1 ★ 不变量：主题若被上报，必须在某条计划的 text 条件上**逐字在场**
     *   —— 「报了主题却没进条件」是「宽答冒充精确答」的另一种写法。 */
    for (const q of CONTENT.concat(BARE)) {
        const p = E.planQuestion(q, { knownActors: KNOWN, actorAliases: ALIAS });
        if (!p.topics.length) continue;
        const t = p.topics[0];
        if (!p.plans.some((pl) => String(pl.spec.text || '').indexOf(t) >= 0)) {
            throw new Error('主题被上报却没进任何条件（假报）：' + q + ' → ' + JSON.stringify(p.topics)
                + ' / ' + JSON.stringify(p.plans.map((x) => x.id + ':' + x.spec.text)));
        }
    }
    return a;
}
/** ③ 多人物：两侧各出一条计划（不是一条 OR 计划）。 */
function o2JudgeMany(E) {
    const p = E.planQuestion('林一和苏晴之间发生了什么？', { knownActors: KNOWN, actorAliases: ALIAS });
    if (p.actors.join(',') !== '林一,苏晴') throw new Error('多人物识别不全：' + p.actors.join(','));
    if (p.intents.indexOf('relation') < 0) throw new Error('关系问题型未命中');
    const rel = p.plans.filter((x) => x.id === 'relation');
    if (rel.length !== 2) throw new Error('关系问句没拆成两侧各一条计划（实 ' + rel.length + ' 条）');
    const side = rel.map((x) => x.spec.actors[0]).sort().join(',');
    if (side !== '林一,苏晴') throw new Error('两侧计划的人名不对：' + side);
    if (rel.some((x) => x.spec.actors.length !== 1)) throw new Error('单条计划带了多个人名（那又退化成 OR）');
    /* promise 也多人物：两侧各一条（不让首个人名替另一侧作答）。 */
    const q = E.planQuestion('林一和苏晴答应了什么？', { knownActors: KNOWN, actorAliases: ALIAS });
    const pr = q.plans.filter((x) => x.id === 'promise');
    if (pr.length !== 2) throw new Error('promise 只为首个人名出了计划（另一侧没有计划，答不出两人）：' + pr.length);
    /* 弱形态：连接词紧邻（无「之间/两人」字样）也必须识别为双人。 */
    const w = E.planQuestion('苏晴跟林一有什么约定？', { knownActors: KNOWN, actorAliases: ALIAS });
    if (w.intents.indexOf('relation') < 0) throw new Error('「A跟B」形态未识别为双人问句（退化成单人答案）');
    if (w.plans.filter((x) => x.id === 'relation').length !== 2) throw new Error('弱形态没拆两侧');
    /* 0 人名时必须留缺口（静默退化＝「不知道在问谁」被显示成「没有这件事」）。 */
    const z = E.planQuestion('双方之间有过约定吗？', { knownActors: KNOWN, actorAliases: ALIAS });
    if (z.gaps.filter((g) => String(g.kind).indexOf('relation') === 0).length === 0) {
        throw new Error('双人问句两侧都没认出时未给具名缺口');
    }
    return p;
}
/** ④ 别名：只认宿主给的（给了就认并落到按人条件上）—— 不给仍不猜。 */
function o2JudgeAlias(E) {
    const a = E.planQuestion('小安答应了什么？', { knownActors: KNOWN, actorAliases: ALIAS });
    if (a.actor !== '林一') throw new Error('别名未解析成本名（宿主已给别名表）：' + a.actor);
    if (a.gaps.some((g) => g.kind === 'actor')) throw new Error('认出别名却仍留「没认出人名」的缺口');
    const pa = a.plans.filter((x) => x.id === 'promise')[0];
    if (pa.spec.actors[0] !== '林一') throw new Error('别名没落到按人条件上：' + JSON.stringify(pa.spec.actors));
    /* 不给别名表 ⇒ 仍不猜（这是纪律，不是能力）：不许凭空把「小安」当人名。 */
    const b = E.planQuestion('小安答应了什么？', { knownActors: KNOWN });
    if (b.actor !== null) throw new Error('宿主没给别名表却认出了别名（等于凭空造人）');
    if (!b.gaps.some((g) => g.kind === 'actor')) throw new Error('认不出人名却未留缺口');
    /* 别名指向的人名不在 knownActors 里 ⇒ 拒收（不许凭别名造人）。 */
    const c = E.planQuestion('阿明答应了什么？', { knownActors: KNOWN, actorAliases: { 阿明: '张明' } });
    if (c.actor !== null) throw new Error('别名指向未登记人名却仍被采纳：' + c.actor);
    /* 别名与本名同名 ⇒ 不是别名；不上表也不出错。 */
    const d = E.planQuestion('苏晴答应了什么？', { knownActors: KNOWN, actorAliases: { 苏晴: '苏晴' } });
    if (d.actor !== '苏晴') throw new Error('同名别名把识别搅坏了');
    return a;
}
/** ⑤ 时点：保留线索并如实说「未折算成楼层」（不猜）。 */
function o2JudgeTime(E) {
    for (const [q, hint] of [['那时候苏晴答应过什么？', '那时候'], ['当年林一说过什么？', '当年'],
        ['之前苏晴答应过什么？', '之前']]) {
        const p = E.planQuestion(q, { knownActors: KNOWN, actorAliases: ALIAS });
        if (p.timeHints.join(',') !== hint) throw new Error('相对时点没保留：' + q + ' → ' + JSON.stringify(p.timeHints));
        const g = p.gaps.filter((x) => x.kind === 'time-hint')[0];
        if (!g) throw new Error('相对时点未如实说明「未折算成楼层」（静默吞掉）：' + q);
        if (String(g.why).indexOf('未施加') < 0 && String(g.why).indexOf('不把它折算') < 0) {
            throw new Error('时点缺口的说法没交代折算与否：' + g.why);
        }
        /* 不许把它折算成楼层（猜出来的楼层会让「查不到」变成谎话）。 */
        for (const pl of p.plans) {
            if (pl.spec.floorFrom !== null || pl.spec.floorTo !== null) {
                throw new Error('相对时点被折算成楼层（那是猜）：' + q);
            }
        }
    }
    const n = E.planQuestion('苏晴答应了什么？', { knownActors: KNOWN, actorAliases: ALIAS });
    if (n.timeHints.length) throw new Error('无时点问句却报出了时点');
    return null;
}
/* ══════════════ 合成面判据（关系四态） ══════════════ */
const rowOf = (over) => Object.assign({
    ref: 'commitment:c1', ledger: 'commitment', ledgerLabel: '约定',
    title: '答应周三还书', detail: '苏晴 对 林一', status: 'open',
    floor: 3, scope: null, masked: false
}, over || {});
const resOf = (id, over) => Object.assign({
    state: 'ok', total: 1, scanned: 5, pages: 1, pageOutOfRange: false,
    rows: [rowOf()], hitsByLedger: { commitment: 1 }, emptyReason: ''
}, over || {});
/** 关系四态：共现 / 无共同 / 一侧空 / 单侧。 */
function o2JudgeRelationState(E) {
    const mkPlan = (planObj) => Object.assign({ question: 'q', intents: ['relation'], plans: [], gaps: [] }, planObj);
    /* 共现：两侧引用键相交。 */
    const co = E.composeAnswer(mkPlan({}), [
        { id: 'relation', spec: { actors: ['林一'] }, query: resOf(null, { rows: [rowOf({ ref: 'commitment:c9' }), rowOf({ ref: 'commitment:c1' })], total: 2, hitsByLedger: { commitment: 2 } }) },
        { id: 'relation', spec: { actors: ['苏晴'] }, query: resOf(null, { rows: [rowOf({ ref: 'commitment:c9' }), rowOf({ ref: 'commitment:c2' })], total: 2, hitsByLedger: { commitment: 2 } }) }
    ]);
    if (!co.relation || co.relation.state !== 'co-occur') throw new Error('两侧有共同引用键却没报共现：' + JSON.stringify(co.relation && co.relation.state));
    if (co.relation.common !== 1) throw new Error('共现条数不对：' + co.relation.common);
    if (!co.answer.some((s) => s.kind === 'relation')) throw new Error('共现句没产出');
    if (co.relation.sides.map((x) => x.total).join(',') !== '2,2') throw new Error('两侧单独读数丢了：' + JSON.stringify(co.relation.sides));
    /* 无共同：两侧各有行、引用键不相交 ⇒ 必须报「没有共现」，且**不得**把任一侧的行当答案。 */
    const no = E.composeAnswer(mkPlan({}), [
        { id: 'relation', spec: { actors: ['林一'] }, query: resOf(null, { rows: [rowOf({ ref: 'commitment:c1' })], total: 1 }) },
        { id: 'relation', spec: { actors: ['苏晴'] }, query: resOf(null, { rows: [rowOf({ ref: 'commitment:c2' })], total: 1 }) }
    ]);
    if (no.relation.state !== 'no-co-occur') throw new Error('无共同引用键未如实报：' + no.relation.state);
    if (no.relation.common !== 0) throw new Error('无共同却报出共现条数');
    if (!no.gaps.some((g) => g.kind === 'no-co-occur')) throw new Error('「两人各有其事」未给具名缺口');
    if (no.answer.some((s) => s.kind === 'relation-row')) throw new Error('无共现却把单侧行当答案（任选一人的另一种说法）');
    /* 一侧没跑：报缺口，不冒充共现。 */
    const half = E.composeAnswer(mkPlan({}), [
        { id: 'relation', spec: { actors: ['林一'] }, query: resOf(null) },
        { id: 'relation', spec: { actors: ['苏晴'] }, query: null }
    ]);
    if (half.relation.coOccurred !== null) throw new Error('一侧没跑却给出了共现结论');
    if (!half.gaps.some((g) => g.kind === 'relation-side-absent')) throw new Error('一侧缺席未给具名缺口');
    /* ★ 缺席与「查不到」在**条数**上也不得同形:专属缺口在场时不许再补宽泛 no-answer。 */
    if (half.gaps.some((g) => g.kind === 'no-answer')) {
        throw new Error('关系一侧缺席时多报了宽泛 no-answer:'
            + JSON.stringify(half.gaps.map((g) => g.kind)));
    }
    if (half.relation.state !== '') throw new Error('一侧缺席却给出了关系态:' + half.relation.state);
    /* 单侧（规划器已记 partial）：按单人如实处理。 */
    const part = E.composeAnswer(mkPlan({}), [
        { id: 'relation', spec: { actors: ['林一'] }, query: resOf(null, { rows: [rowOf({ ref: 'commitment:c1' })], total: 1 }) }
    ]);
    if (part.relation.state !== 'partial') throw new Error('只认出一侧却报成了别的态：' + part.relation.state);
    if (!part.answer.some((s) => s.kind === 'relation-partial-row')) throw new Error('单侧行没产出');
    /* 遮蔽行仍只报存在性（关系路径不得成为「带正文出去」的后门）。 */
    const masked = E.composeAnswer(mkPlan({}), [
        { id: 'relation', spec: { actors: ['林一'] }, query: resOf(null, { rows: [rowOf({ ref: 'secret:s1', ledger: 'secret', masked: true, scope: 'listed', title: '（正文不对外提供）' })], total: 1, hitsByLedger: { secret: 1 } }) },
        { id: 'relation', spec: { actors: ['苏晴'] }, query: resOf(null, { rows: [rowOf({ ref: 'secret:s1', ledger: 'secret', masked: true, scope: 'listed', title: '（正文不对外提供）' })], total: 1, hitsByLedger: { secret: 1 } }) }
    ]);
    if (masked.masked < 1) throw new Error('关系路径的遮蔽行没被计数（会把正文带出去）');
    if (masked.answer.some((s) => s.ref === 'secret:s1' && s.kind !== 'masked')) throw new Error('遮蔽行被当普通行产出');
    /* 非关系问句：relation 恒 null（不给「看着像关系」的伪读数）。 */
    const plain = E.composeAnswer({ question: 'q', intents: ['promise'], plans: [], gaps: [] }, [{ id: 'promise', query: resOf() }]);
    if (plain.relation !== null) throw new Error('非关系问句却给了关系读数');
    return co;
}
/* ══════════════ 宿主出口（真方法体 + 真内核 + 真账本） ══════════════ */
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
function mkHost(win, src) {
    const idx = src || IDX;
    const heads = ['function _moduleLib(getGlobal, fileName) {', 'function _evidenceQueryLib() {',
        'function _evidenceWorkbenchLib() {', 'function _evidenceQueryLedgersOf() {',
        'function _qaHelpDeps() {', 'function _ledgerApis() {', 'function _factVersionLib() {',
        'function _eventCompletenessLib() {', 'function _repairLoopLib() {'];
    const libs = heads.map((h) => sliceMember(idx, h));
    if (libs.some((x) => !x)) throw new Error('取库口切片缺失：' + heads.filter((h, i) => !libs[i]).join(' / '));
    const mHeads = ['_qaActorAliases() {', '_qaKnownActors(limit) {', 'askMemoryQuestion(question, opts) {', 'memoryQaLine() {'];
    const meths = mHeads.map((h) => sliceMember(idx, h));
    if (meths.some((x) => !x)) throw new Error('宿主出口切片缺失：' + mHeads.filter((h, i) => !meths[i]).join(' / '));
    return new Function('errLog', 'window',
        libs.join('\n') + '\nreturn ({ ' + meths.join(',\n') + ' });')(() => {}, win);
}
/** 真账本造的宿主状态（两条约定、一条已履行，用真 `open/fulfill` 造，不手写条目形状）。 */
function hostState() {
    let cs = CL.normalize(undefined);
    cs = CL.open(cs, { actor: '苏晴', counterpart: '林一', content: '答应周三还书', floor: 3, eventKey: 'e1' }).state;
    cs = CL.open(cs, { actor: '苏晴', counterpart: '林一', content: '答应带生日礼物', floor: 9, eventKey: 'e2' }).state;
    cs = CL.fulfill(cs, { actor: '苏晴', content: '答应带生日礼物', floor: 12, eventKey: 'e3' }).state;
    return { worldProg: { commitmentLedger: cs } };
}
/** 在场宿主：真内核 + 真账本 + 图谱带别名（图谱节点的 `data.aliases` 是别名唯一真源）。
 *   ★ 事件节点名取**已知人名**「王五」：否则 `if (!known.has(c)) return;` 会先把事件节点
 *     挡掉，「只收 character」那道守卫就成了冗余第二道（破坏它读不出差异 —— 实测）。 */
function qaSelf(win, src) {
    const eng = mkHost(win, src);
    return Object.assign({}, eng, {
        _entityIdByName: new Map([['林一', 'ent_lin'], ['王五', 'ent_wang']]),
        graph: {
            nodes: new Map([
                ['n1', { type: 'character', name: '苏晴', data: { aliases: ['晴姐', '苏晴'] } }],
                ['n2', { type: 'character', name: '林一', data: { aliases: ['小安', '林一'] } }],
                ['n3', { type: 'event', name: '王五', data: { aliases: ['老王', '王五'] } }]
            ])
        },
        worldProg: hostState().worldProg,
        _lastInjection: 'SENTINEL'
    });
}
const WIN = () => ({ LonShaEvidenceQuery: EQ, LonShaEvidenceWorkbench: require_(path.join(R, 'evidence-workbench.js')), LonShaCommitmentLedger: CL });
/** ⑥ 宿主接线：别名表只出「别名 → 本名」一向、本名须在已知人名里、不上同名、只收 character。 */
function o2JudgeHostAliases(src) {
    const self = qaSelf(WIN(), src);
    const al = self._qaActorAliases();
    const keys = Object.keys(al).sort().join(',');
    if (keys !== '小安,晴姐') throw new Error('别名表内容不对（事件节点 / 同名别名 / 未登记本名都不得进表）：' + keys);
    if (al['小安'] !== '林一' || al['晴姐'] !== '苏晴') throw new Error('别名指向的本名不对：' + JSON.stringify(al));
    /* 只出「别名 → 本名」一向：本名不得作为键出现（否则一个本名多个身份）。 */
    for (const k of Object.keys(al)) {
        if (al[k] === k) throw new Error('同名别名进了表：' + k);
    }
    if (Object.prototype.hasOwnProperty.call(al, '苏晴')) throw new Error('本名被当成别名键（方向反了）');
    if (Object.prototype.hasOwnProperty.call(al, '老王')) throw new Error('事件节点的别名进了表（只收 character）');
    /* 图谱取不到 ⇒ `{}`（**不是 null**）：「没有别名」是可表达的入参事实。 */
    const none = Object.assign({}, self, { graph: null })._qaActorAliases();
    if (none === null || typeof none !== 'object') throw new Error('图谱缺席时别名表不是空对象');
    if (Object.keys(none).length) throw new Error('图谱缺席却报出了别名');
    return al;
}
/** ⑦ 宿主出口真跑：主题 / 多人物 / 别名 / 时点四读数都在**出口**上读到（不是只在核心里算过）。 */
function o2JudgeHostExit(src) {
    const self = qaSelf(WIN(), src);
    const r = self.askMemoryQuestion('苏晴答应送什么生日礼物？', {});
    if (r.version < 1) throw new Error('内核在场却报缺席：version=' + r.version);
    if (r.actor !== '苏晴') throw new Error('出口没认出人名：' + r.actor);
    if (r.topics.join(',') !== '生日礼物') throw new Error('出口没把主题带出来：' + JSON.stringify(r.topics));
    /* 主题进了条件 ⇒ 只该命中带该主题的那一条（修前命中该人全部两条）。 */
    const texts = r.answer.filter((s) => s.ref).map((s) => s.text).join(' | ');
    if (texts.indexOf('生日礼物') < 0) throw new Error('主题条件下的答案里没有该主题：' + texts);
    if (texts.indexOf('周三还书') >= 0) throw new Error('主题条件下的答案里混进了另一条承诺（主题没生效）：' + texts);
    /* 别名经宿主图谱装配后真的可用（这是「旧称认不出」那条缺口的闭环）。 */
    const a = self.askMemoryQuestion('小安答应了什么？', {});
    if (a.actor !== '林一') throw new Error('出口没经宿主别名表认出旧称：' + a.actor);
    /* 多人物读数在出口上分列（不是合成一格）。 */
    const m = self.askMemoryQuestion('林一和苏晴之间发生了什么？', {});
    if (m.actors.join(',') !== '林一,苏晴') throw new Error('出口没报多人物：' + JSON.stringify(m.actors));
    if (m.relation === null || typeof m.relation !== 'object') throw new Error('出口没报关系读数');
    if (m.relation.state !== 'co-occur' && m.relation.state !== 'no-co-occur' && m.relation.state !== 'partial') {
        throw new Error('关系态不是四态之一：' + m.relation.state);
    }
    /* 时点在出口上在场（不折算成楼层）。 */
    const t = self.askMemoryQuestion('那时候苏晴答应过什么？', {});
    if (t.timeHints.join(',') !== '那时候') throw new Error('出口没带时点读数：' + JSON.stringify(t.timeHints));
    /* ★ 诊断行在场（一个诊断位，不是沉默）—— **紧接着关系问句**取，因为诊断面说的是
     *   「上次」：先问别的会把「上次」覆盖成那次问句读数（首版即栽在这里）。 */
    self.askMemoryQuestion('林一和苏晴之间发生了什么？', {});
    const line = self.memoryQaLine();
    if (line.indexOf('关系') < 0) throw new Error('诊断行没带关系读数：' + line);
    /* 只读：跑真查询不得动注入面。 */
    if (self._lastInjection !== 'SENTINEL') throw new Error('问答跑了真查询却动了注入面');
    return r;
}
/* ══════════════ A. 规划面（①~⑤） ══════════════ */
test('v3330 A1. ★★★ M4-O2 首个子串命中获选（顺序依赖）：两份名单必须同形', () => {
    o2JudgeOrder(EQ);
    console.log('  ✓ 长名胜出、影子名被实名吸收且如实登记、单独问短名仍答短名');
});
test('v3330 A2. ★★★ M4-O2 主题词保留：实词进条件、骨架词不进、上报必被消费', () => {
    o2JudgeTopic(EQ);
    console.log('  ✓ 「送什么生日礼物」→ 条件「生日礼物」；骨架词一个都没当上主题；上报的主题都在条件上');
});
test('v3330 A3. ★★★ M4-O2 多人物：两侧各一条计划（不是一条 OR 计划）', () => {
    o2JudgeMany(EQ);
    console.log('  ✓ 关系两侧各一条；promise 两侧各一条；连接词弱形态也识别');
});
test('v3330 A4. ★★ M4-O2 别名：宿主给就认、没给仍不猜、指向未登记人名拒收', () => {
    o2JudgeAlias(EQ);
    console.log('  ✓ 别名解析成本名并落条件；无别名表时不凭空造人');
});
test('v3330 A5. ★★ M4-O2 时点：保留线索 + 如实说未折算（不猜楼层）', () => {
    o2JudgeTime(EQ);
    console.log('  ✓ 那时候 / 当年 / 之前 都保留并具名缺口；无时点问句不报时点');
});
/* ══════════════ B. 合成面（关系四态） ══════════════ */
test('v3330 B1. ★★★ M4-O2 关系四态：共现 / 无共同 / 一侧缺席 / 单侧', () => {
    o2JudgeRelationState(EQ);
    console.log('  ✓ 共现按引用键求交集；无共同不把单侧行当答案；遮蔽行不外带');
});
/* ══════════════ C. 宿主接线 ══════════════ */
test('v3330 C1. ★★★ M4-O2 宿主别名装配：只出别名→本名一向，事件节点与同名不入表', () => {
    o2JudgeHostAliases(IDX);
    console.log('  ✓ 别名表 2 条（晴姐/小安）；事件节点的「老王」不入表；图谱缺席时给空对象而非 null');
});
test('v3330 C2. ★★★ M4-O2 宿主出口真跑：主题 / 多人物 / 别名 / 时点四读数都在场', () => {
    o2JudgeHostExit(IDX);
    console.log('  ✓ 主题条件下不混进另一条承诺；旧称经宿主别名表认出；诊断行带关系读数');
});
/* ══════════════ D. 负控制（真源码破坏 → 破坏副本上重跑同款真判据） ══════════════ */
test('v3330 D1. ★★★ 破坏影子名判定 ⇒ A1 判据必须转红', () => {
    const bad = breakOnce(EQ_SRC, ANCHORS.shadowPred, 'if (false) {', 'o2 影子名判定');
    const EQ2 = loadIIFE(bad, 'LonShaEvidenceQuery');
    let threw = false, msg = '';
    try { o2JudgeOrder(EQ2); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '影子名判定失效后判据必须转红（否则「短名抢选／两条名单不同形」抓不住）');
    assert.match(msg, /短名|影子名|顺序依赖|吸收/);
    o2JudgeOrder(EQ);
});
test('v3330 D2. ★★★ 破坏主题词取值 ⇒ A2 判据必须转红', () => {
    const bad = breakOnce(EQ_SRC, ANCHORS.topicKept, "const topic = '';", 'o2 主题词取值');
    const EQ2 = loadIIFE(bad, 'LonShaEvidenceQuery');
    let threw = false, msg = '';
    try { o2JudgeTopic(EQ2); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '主题恒空后判据必须转红（否则「宽答冒充精确答」抓不住）');
    assert.match(msg, /主题/);
    o2JudgeTopic(EQ);
});
test('v3330 D3. ★★★ 破坏停止词长词优先 ⇒ A2 骨架词判据必须转红', () => {
    const bad = breakOnce(EQ_SRC, ANCHORS.stopLongFirst, 'const stopSorted = STOP.slice().sort((x, y) => x.length - y.length);', 'o2 停止词次序');
    const EQ2 = loadIIFE(bad, 'LonShaEvidenceQuery');
    let threw = false, msg = '';
    try { o2JudgeTopic(EQ2); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '短词先剥后判据必须转红（否则「时候 / 为」这类残渣抓不住）');
    assert.match(msg, /骨架|主题/);
    o2JudgeTopic(EQ);
});
test('v3330 D4. ★★★ 破坏字符级功能字清理 ⇒ A2 骨架词判据必须转红', () => {
    const bad = breakOnce(EQ_SRC, ANCHORS.charCleanup, 'rest = rest', 'o2 功能字清理');
    const EQ2 = loadIIFE(bad, 'LonShaEvidenceQuery');
    let threw = false, msg = '';
    try { o2JudgeTopic(EQ2); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '剥后功能字残留不清后判据必须转红（否则「事有 / 会转」这类残渣抓不住）');
    assert.match(msg, /骨架|主题/);
    o2JudgeTopic(EQ);
});
test('v3330 D5. ★★★ 破坏双人拆侧（只出首侧）⇒ A3 判据必须转红', () => {
    const bad = breakOnce(EQ_SRC, ANCHORS.twoSides, 'for (const nm of actorNames.slice(0, 1)) {', 'o2 双人拆侧');
    const EQ2 = loadIIFE(bad, 'LonShaEvidenceQuery');
    let threw = false, msg = '';
    try { o2JudgeMany(EQ2); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '只出一侧后判据必须转红（否则「双人问题退化成任选一人」抓不住）');
    assert.match(msg, /两侧|计划/);
    o2JudgeMany(EQ);
});
test('v3330 D6. ★★★ 破坏连接词弱形态 ⇒ A3 判据必须转红', () => {
    const bad = breakOnce(EQ_SRC, ANCHORS.joinDetect, "if (false) intents.push('relation');", 'o2 连接词形态');
    const EQ2 = loadIIFE(bad, 'LonShaEvidenceQuery');
    let threw = false, msg = '';
    try { o2JudgeMany(EQ2); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '弱形态失效后判据必须转红（否则「A跟B有什么约定」退化成单人）');
    assert.match(msg, /双人|两侧|计划/);
    o2JudgeMany(EQ);
});
test('v3330 D7. ★★★ 破坏别名登记位（登记别名而非本名）⇒ A4 判据必须转红', () => {
    const bad = breakOnce(EQ_SRC, ANCHORS.aliasRegister, "hits.push({ name: a2, via: 'alias', at: at, alias: a2 });", 'o2 别名登记');
    const EQ2 = loadIIFE(bad, 'LonShaEvidenceQuery');
    let threw = false, msg = '';
    try { o2JudgeAlias(EQ2); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '别名登记位失效后判据必须转红（否则「旧称认不出／别名落不进条件」抓不住）');
    assert.match(msg, /别名|人名/);
    o2JudgeAlias(EQ);
});
test('v3330 D8. ★★★ 破坏别名准入守卫（指向未登记人名也采纳）⇒ A4 判据必须转红', () => {
    const bad = breakOnce(EQ_SRC, ANCHORS.aliasGuard, 'if (false) continue;', 'o2 别名准入');
    const EQ2 = loadIIFE(bad, 'LonShaEvidenceQuery');
    let threw = false, msg = '';
    try { o2JudgeAlias(EQ2); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '准入守卫失效后判据必须转红（否则「凭别名造人」抓不住）');
    assert.match(msg, /别名|人名/);
    o2JudgeAlias(EQ);
});
test('v3330 D9. ★★★ 破坏关系求交 ⇒ B1 判据必须转红', () => {
    const bad = breakOnce(EQ_SRC, ANCHORS.commonRefs, 'let common = [];', 'o2 关系求交');
    const EQ2 = loadIIFE(bad, 'LonShaEvidenceQuery');
    let threw = false, msg = '';
    try { o2JudgeRelationState(EQ2); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '不求交后判据必须转红（否则「各有其事」被报成共现）');
    assert.match(msg, /共现|交集|共同/);
    o2JudgeRelationState(EQ);
});
test('v3330 D10. ★★ 破坏时点缺口登记 ⇒ A5 判据必须转红', () => {
    const bad = breakOnce(EQ_SRC, ANCHORS.timeGap, "kind: 'time-softened',", 'o2 时点缺口');
    const EQ2 = loadIIFE(bad, 'LonShaEvidenceQuery');
    let threw = false, msg = '';
    try { o2JudgeTime(EQ2); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '时点缺口被改名（等于下游读不到）后判据必须转红（否则「静默吞掉」抓不住）');
    assert.match(msg, /时点/);
    o2JudgeTime(EQ);
});
test('v3330 D11. ★★★ 破坏宿主别名类型守卫（事件节点混入）⇒ C1 判据必须转红', () => {
    const bad = breakOnce(IDX, ANCHORS.hostCharType, 'if (!nd) continue;', 'o2 宿主别名来源');
    let threw = false, msg = '';
    try { o2JudgeHostAliases(bad); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '事件节点混入别名表后判据必须转红（否则「事件节点也算角色」抓不住）');
    assert.match(msg, /别名|事件|不进表|表内容/);
    o2JudgeHostAliases(IDX);
});
test('v3330 D12. ★★★ 破坏宿主别名方向（反向写表）⇒ C1 判据必须转红', () => {
    const bad = breakOnce(IDX, ANCHORS.hostAliasDir, 'out[c] = a;', 'o2 宿主别名方向');
    let threw = false, msg = '';
    try { o2JudgeHostAliases(bad); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '写表方向反了后判据必须转红（否则「本名当别名键」抓不住）');
    assert.match(msg, /别名|方向|内容/);
    o2JudgeHostAliases(IDX);
});
test('v3330 D13. ★★★ 破坏宿主出口的主题外送 ⇒ C2 判据必须转红', () => {
    const bad = breakOnce(IDX, ANCHORS.hostTopicOut, 'topics: [],', 'o2 出口主题外送');
    let threw = false, msg = '';
    try { o2JudgeHostExit(bad); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '出口不再外送主题后判据必须转红（否则「核心算了但出口不报」抓不住）');
    assert.match(msg, /主题/);
    o2JudgeHostExit(IDX);
});
/* ══════════════ E. 口径自证（本档声明的问句面 / 判据纯度 / 工具两向） ══════════════ */
test('v3330 D14. ★★★ 关系缺口抑噪:一侧缺席不得再多报宽泛 no-answer', () => {
    const bad = breakOnce(EQ_SRC, ANCHORS.noAnswerSuppressed,
        'const relationGap = false;', 'o2 关系缺口抑噪');
    const EQ2 = loadIIFE(bad, 'LonShaEvidenceQuery');
    let threw = false, msg = '';
    try { o2JudgeRelationState(EQ2); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '抑噪判据被拆掉后 B1 必须转红(否则缺席读数会与「都没查到」同形)');
    assert.match(msg, /no-answer|缺席/);
    o2JudgeRelationState(EQ);
});

test('v3330 E1. ★★★ H5 判据纯度：每个破坏锚点在**本档源码**里恰中 1 次', () => {
    for (const k of Object.keys(ANCHORS)) {
        const n = SELF.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '锚点 ' + k + ' 在本档里出现 ' + n + ' 次（判据纯度要求恰 1 次；两处各写一份会让纯度检查恒过）');
    }
});
test('v3330 E2. ★★ H6 工具两向自证：锚点不存在 / 不唯一 / 同值替换必须抛', () => {
    assert.throws(() => breakOnce(EQ_SRC, '这段源码根本不存在', 'x', '不存在锚点'), /恰中 1 次|命中 0 次/);
    assert.throws(() => breakOnce(EQ_SRC, 'const ', 'x', '不唯一锚点'), /恰中 1 次|要求恰好 1 次/);
    assert.throws(() => breakOnce(EQ_SRC, ANCHORS.topicKept, ANCHORS.topicKept, '同值替换'), /必须真的改变源码/);
});
test('v3330 E3. ★★★ 真源锚活：十四个破坏锚在**真源码**里各自恰中 1 次', () => {
    /* 为什么单列一条：判据纯度（E1）只保证**本档**里锚点写了一次；
     *   而破坏能否成立取决于**真源码**里恰中一次。真源改了形态而锚点没同步时，
     *   D 段的 breakOnce 会自己抛（那是对的），但抛在 D 段里读起来像「实现坏了」。
     *   这条把「锚是否活着」单独报出来，归因立刻分明。 */
    const SRC_OF = (k) => (k.indexOf('host') === 0 ? 'index.js' : 'evidence-query.js');
    for (const k of Object.keys(ANCHORS)) {
        const rel = SRC_OF(k);
        const n = read(rel).split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '锚点 ' + k + ' 在 ' + rel + ' 里出现 ' + n + ' 次（真源锚活要求恰 1 次）');
    }
});
test('v3330 E4. ★★ 40 条问句面自证：20 条固定 + 20 条未调参改写，全部有规划产出', () => {
    /* 为什么是「有产出」而不是「答案对」：本档钉的是**问句面不被丢掉**
     *   （主题 / 人名 / 时点各按各的判据钉）；这一条只保证**面没塌**
     *   —— 40 条问句若有一条产不出计划，说明规划器在某个形态上静默失效了。 */
    const FIXED = ['苏晴答应了什么？', '林一答应了什么？', '林答应了什么？', '苏晴有没有答应送生日礼物？',
        '苏晴答应送什么生日礼物？', '林一和苏晴之间发生了什么？', '林一与苏晴之间有什么约定？',
        '苏晴和谁答应了什么？', '谁答应了周三还书？', '苏晴后来还书了吗？', '那件事后来怎样了？',
        '事情最后结果如何？', '苏晴为什么反悔？', '她为什么变卦？', '为什么会这样？', '这是在哪一楼？',
        '什么时候发生的？', '第几楼提起的？', '那时候苏晴答应过什么？', '当年林一说过什么？'];
    const PARA = ['苏晴承诺过什么？', '苏晴保证要做的事有哪些？', '苏晴说好的事情是哪些？', '林一的约定有哪些？',
        '小安答应过什么？', '晴姐答应过什么？', '林一苏晴两人之间有什么？', '双方之间有过约定吗？',
        '彼此之间发生过什么？', '苏晴跟林一有什么约定？', '两人有没有共同的承诺？', '后来怎么样了？',
        '最终结果是什么？', '现在这事的进展如何？', '为什么她会转变？', '原因是什么？', '怎么会发生这种事？',
        '这是第几楼的事？', '哪一楼提到过？', '何时说过？'];
    assert.equal(FIXED.length, 20, '固定问句面必须是 20 条');
    assert.equal(PARA.length, 20, '改写问句面必须是 20 条');
    for (const q of FIXED.concat(PARA)) {
        const p = plan(q);
        /* 「谁和谁之间发生了什么」这类**没人名**的问句也必须给兜底宽查（不静默空手回来）。 */
        if (!p.plans.length) throw new Error('问句无任何规划产出（规划器静默失效）：' + q);
        for (const pl of p.plans) {
            if (!pl.id) throw new Error('计划缺 id：' + q);
            for (const k of Object.keys(pl.spec)) {
                if (k === 'inverted') continue;
                if (!EQ.FILTERS.map((f) => f.key).includes(k)) throw new Error('规划产出非登记键：' + k + ' ← ' + q);
            }
        }
    }
    /* 别名面：宿主给了别名表时，带旧称的问句都必须认出人名。 */
    for (const q of ['小安答应过什么？', '晴姐答应过什么？']) {
        if (!plan(q).actor) throw new Error('别名问句没认出人名：' + q);
    }
    console.log('  ✓ 40 条问句全部有规划产出，条件键全在登记表内');
});
/* ══════════════ F. 版本锚 + 自防护 ══════════════ */
const vnum = (s) => { const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s).trim()); return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN; };
const BORN = '3.330.0';
test('v3330 F1. ★★★ 版本锚：本档出生版本 + 六源同源（V4 当版锚点形态）', () => {
    assert.equal(vnum(BORN), 3330000, 'vnum 序数必须可数（当版锚点）');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(codeVer, '入口版本常量必须在场');
    assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立；当前 ' + codeVer);
    assert.equal(MF.version, codeVer, 'manifest 与入口同源');
    assert.equal(PKG.version, codeVer, 'package.json 与入口同源');
    for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const mv = (/let VERSION = '([^']+)'/.exec(read(m)) || [])[1];
        assert.equal(mv, codeVer, m + ' 副本须与入口同源（须是 let：bindDeps 可换，const 会 TypeError）');
    }
    /* [v3.331.0 交棒] 本档出生时该面为 2（M4-O2 抬版读数由本档持有）；
     *   v3.331.0 M4-O3 把它抬到 3 ⇒ 这里改判「不低于 2」的下界，
     *   当版锚（== 3）由 v3331 持有（版本守卫 V4：出生版读数不得被新抬版判红）。 */
    assert.ok(EQ.QA_VERSION >= 2, '本档只在问答面不低于 2 时成立（出生时为 2）');
    assert.ok(SELF.includes("const BORN = '3.330.0'"), '当版锚点必须显式留在本档里');
    assert.equal(SELF.includes('vnum(BORN)'), true, '锚形须可被守卫计数');
});
test('v3330 F2. ★★★ 自防护：本档判据不得依赖被破坏的那一处字面量', () => {
    /* 判据若锚在被破坏的表达式上（例如断言「源码里有 sort((x,y)=>y.length-x.length)」），
     *   破坏之后判据会因为「源码不含该串」而红 —— 那不是**行为**转红，
     *   是自指转红；两种红混在一起会让负控制失去归因力（本仓 H5 同族）。
     *   这里逐条确认判据函数体里不出现任何破坏锚。 */
    const from = SELF.indexOf('function o2JudgeOrder');
    const body = SELF.slice(from, SELF.indexOf('/* ══════════════ A.'));
    for (const k of Object.keys(ANCHORS)) {
        if (body.indexOf(ANCHORS[k]) >= 0) throw new Error('判据函数体里出现了破坏锚 ' + k + '（自指转红）：' + ANCHORS[k]);
    }
    assert.ok(EQ.QA_VERSION >= 2, '问答面版本锚必须在场（不低于出生时的 2）');
});
