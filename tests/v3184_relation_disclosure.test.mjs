// tests/v3184_relation_disclosure.test.mjs
// [v3.184.0] 关系披露条件（relation-disclosure.js）——移植 nocturne_memory 的 edge disclosure。
//
// 本文件覆盖四个面：
//   ① 判据纯函数（parseDisclosure / compileConditions / testDisclosure / partition / line）
//   ② 负控制：真源码破坏必须**按本组声称的归因翻红**（只验退出码会放过「因无关缺陷翻红」的空转假绿）
//   ③ 宿主接线自证（提取 schema 的 disclosure 字段 / addEdge 的 data 携带 / 注入侧收口 /
//      诊断行真进 selfCheck 的 rows 子系统列表 / 配置键声明 / UI 控件 / manifest 登记）
//   ④ 版权纯度（机制出处写在注释里，代码体不得含源项目标识符）
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import assert from 'node:assert/strict';
import test from 'node:test';

const ROOT = new URL('..', import.meta.url).pathname;
const require_ = createRequire(import.meta.url);
const src = readFileSync(ROOT + 'index.js', 'utf-8');
const sui = readFileSync(ROOT + 'settings-ui.js', 'utf-8');
const mf = JSON.parse(readFileSync(ROOT + 'manifest.json', 'utf-8'));
const MOD_SRC = readFileSync(ROOT + 'relation-disclosure.js', 'utf-8');

// IIFE 双导出模块：require 时自挂全局。**快照必须在 require 之后取**——
//   在 require 之前抓快照只会拿到 undefined，后面的「破坏副本污染/还原」断言就成了空转（本轮踩到）。
const RD = require_('../relation-disclosure.js');
const goodGlobal = globalThis.LonShaRelationDisclosure;

/* ══════════════ 1. 判据纯函数 ══════════════ */
test('v3184 1. parseDisclosure：分隔符 / 排除项 / 有界截断', () => {
    const a = RD.parseDisclosure('告白,结婚');
    assert.deepEqual(a.positive, ['告白', '结婚']);
    assert.deepEqual(a.negative, []);
    assert.equal(a.truncated, false);

    const b = RD.parseDisclosure('告白|结婚\n!开玩笑；约会');
    assert.deepEqual(b.positive, ['告白|结婚', '约会']);
    assert.deepEqual(b.negative, ['开玩笑']);

    // 顿号也是分隔符（中文里最常写的一个）
    assert.deepEqual(RD.parseDisclosure('甲、乙').positive, ['甲', '乙']);
    // 空串 / 只有分隔符 ⇒ 无条件
    assert.deepEqual(RD.parseDisclosure(''), { positive: [], negative: [], truncated: false });
    assert.deepEqual(RD.parseDisclosure(' , ; 、 '), { positive: [], negative: [], truncated: false });
    // 畸形输入不抛
    assert.deepEqual(RD.parseDisclosure(null), { positive: [], negative: [], truncated: false });
    assert.doesNotThrow(() => RD.parseDisclosure({ a: 1 }));
    assert.doesNotThrow(() => RD.parseDisclosure([]));

    // 有界：超 MAX_PATTERNS 截断且**必须可见**
    const many = RD.parseDisclosure('a,b,c,d,e,f,g,h');
    assert.equal(many.truncated, true);
    assert.equal(many.positive.length, RD.MAX_PATTERNS);
    // 全角标点同样是分隔符：中文输入法打出的 `，`(U+FF0C) `；`(U+FF1B) 与 ASCII 是两个码位，
    //   只收半角会把 `!甲；乙` 当成一个条件（排除项与并列条件双双错位，且不报错不留痕）。
    const full = RD.parseDisclosure('!甲；乙，丙');
    assert.deepEqual(full.negative, ['甲']);
    assert.deepEqual(full.positive, ['乙', '丙']);

    // 单字 ! 不产生空负条件（否则会编译出「空正则」匹配一切）
    const bang = RD.parseDisclosure('!,甲');
    assert.deepEqual(bang.negative, []);
    assert.deepEqual(bang.positive, ['甲']);
});

test('v3184 2. compileConditions：合法与非法分列（非法不静默）', () => {
    const r = RD.compileConditions(['甲', '[unclosed', '乙']);
    assert.equal(r.ok.length, 2);
    assert.deepEqual(r.invalid, ['[unclosed']);
    const none = RD.compileConditions(null);
    assert.deepEqual(none, { ok: [], invalid: [] });
    assert.doesNotThrow(() => RD.compileConditions('not-an-array'));
});

test('v3184 3. testDisclosure：四态 + 排除项 + 病句放行 + 空上下文放行', () => {
    // 无条件 ⇒ always
    assert.equal(RD.testDisclosure('', '任意文本').state, 'always');
    assert.equal(RD.testDisclosure(null, '任意文本').state, 'always');
    // 条件命中 ⇒ match（且报出命中的模式，供人核对是哪条生效）
    const m = RD.testDisclosure('告白|结婚', '他决定向她告白。');
    assert.equal(m.state, 'match');
    assert.equal(m.hit, '告白|结婚');
    // 条件未命中 ⇒ miss（唯一会被跳过的一态）
    assert.equal(RD.testDisclosure('告白|结婚', '他们在吃面。').state, 'miss');
    // 正条件命中但被排除项否决 ⇒ miss
    assert.equal(RD.testDisclosure('告白,!开玩笑', '我说的是开玩笑的告白啦').state, 'miss');
    // 只有负条件：不命中排除项 ⇒ match
    assert.equal(RD.testDisclosure('!开玩笑', '认真地说').state, 'match');
    assert.equal(RD.testDisclosure('!开玩笑', '这是开玩笑').state, 'miss');
    // 病句：一个合法条件都没有 ⇒ invalid 且**仍算注入**（state !== 'miss'）
    const bad = RD.testDisclosure('[unclosed', '任意文本');
    assert.equal(bad.state, 'invalid');
    assert.deepEqual(bad.invalid, ['[unclosed']);
    // 病句与好条件共存 ⇒ 按好条件判（不能因病句整条放行）
    assert.equal(RD.testDisclosure('[bad,甲', '甲的台词').state, 'match');
    // 空上下文 ⇒ 放行且标记未真筛（I6：读失败 ≠ 读到了 0）
    const e = RD.testDisclosure('告白|结婚', '');
    assert.equal(e.state, 'match');
    assert.equal(e.ctxEmpty, true);
    // 不抛
    assert.doesNotThrow(() => RD.testDisclosure('[unclosed', undefined));
    assert.doesNotThrow(() => RD.testDisclosure({ a: 1 }, { b: 2 }));
});

test('v3184 4. partition：开关 / 分区 / 计数齐备 / 不抛', () => {
    const mk = (from, to, disc) => ({ from, to, label: '暗恋', data: disc == null ? { attitude: 'positive' } : { attitude: 'positive', disclosure: disc } });
    const edges = [mk('A', 'B', ''), mk('B', 'C', '告白'), mk('C', 'D', '告白'), mk('D', 'E', '[bad')];
    const p = RD.partition(edges, '他向她告白');
    // 四条边：1 无条件 + 2 条「告白」条件（上下文命中）+ 1 条病句（放行）= 4 条全进注入
    assert.equal(p.kept.length, 4, '无条件 + 命中 + 病句放行全部进注入');
    assert.equal(p.gated.length, 0, '没有未命中的边');
    assert.deepEqual(p.counts.total, 4);
    assert.equal(p.counts.always, 1);
    assert.equal(p.counts.match, 2, '两条「告白」条件都命中');
    assert.equal(p.counts.miss, 0);
    assert.equal(p.counts.invalid, 1);
    assert.equal(p.counts.invalidPattern, 1);
    assert.equal(p.counts.gated, 0);
    // 关闭开关 ⇒ 全部照常注入（零行为变化），且不进 gated
    const off = RD.partition(edges, '他向她告白', { enabled: false });
    assert.equal(off.kept.length, 4);
    assert.equal(off.gated.length, 0);
    assert.equal(off.enabled, false);
    // 空上下文 ⇒ 全部进注入且 ctxEmpty 可见
    const empty = RD.partition(edges, '');
    assert.equal(empty.kept.length, 4);
    assert.equal(empty.ctxEmpty, true);
    // 不抛
    assert.doesNotThrow(() => RD.partition(null, 'x'));
    assert.doesNotThrow(() => RD.partition([null, undefined, 1], 'x'));
    // 无条件的边不因 data 缺失而被跳过
    const nk = RD.partition([{ from: 'A', to: 'B', label: 'x' }], '随便');
    assert.equal(nk.kept.length, 1);
});

test('v3184 5. line：四态齐报（无条件与全命中必须可分辨）', () => {
    const all = RD.line({ counts: { total: 20, always: 20, match: 0, miss: 0 } });
    const hit = RD.line({ counts: { total: 20, always: 0, match: 20, miss: 0 } });
    assert.notEqual(all, hit, '「谁都没写条件」与「条件全命中」不得同形');
    assert.ok(all.includes('无条件 20'), all);
    assert.ok(hit.includes('条件命中 20'), hit);
    assert.ok(RD.line({ moduleMissing: true }).includes('未加载'));
    assert.ok(RD.line({ enabled: false }).includes('已关闭'));
    assert.ok(RD.line({ counts: { total: 0 } }).includes('无关系边'));
    // 三类损失各自可见
    const lossy = RD.line({ counts: { total: 5, always: 1, match: 1, miss: 3, invalid: 1, invalidPattern: 2, truncated: 1 }, ctxEmpty: true });
    assert.ok(lossy.includes('条件非法放行 1'), lossy);
    assert.ok(lossy.includes('非法模式 2'), lossy);
    assert.ok(lossy.includes('条件超限截断 1'), lossy);
    assert.ok(lossy.includes('上下文为空'), lossy);
    assert.doesNotThrow(() => RD.line(null));
});

/* ══════════════ 2. 宿主接线自证 ══════════════ */
test('v3184 6. 提取 schema 有 disclosure 字段（说明 + JSON 示例两处）', () => {
    assert.ok(src.includes('3.1 relationships.disclosure'), 'schema 条款存在');
    assert.ok(src.includes('"disclosure": ""'), 'JSON 示例含字段（LLM 才知道要输出它）');
    // 字段名必须逐字一致（改名会让「模型输出什么」与「代码读什么」错位，且完全静默）
    assert.ok(src.includes('rel.disclosure'), '提取侧按同名读取');
    // 注入侧「按同名读取」发生在 module 里（partition 读 e.data.disclosure）；
    //   两侧键名一旦不同形，条件永远判不出——这条断言正是为防那种静默错位。
    assert.ok(MOD_SRC.includes('data.disclosure'), '注入侧按同名读取（模块内）');
});

test('v3184 7. addEdge 携带 disclosure：只在真写了条件时才落库', () => {
    const i = src.indexOf('const _disc = String(rel.disclosure');
    assert.ok(i > 0, '落库前先归一化');
    const seg = src.slice(i, i + 700);
    assert.ok(seg.includes('_disc ? {disclosure: _disc} : null'), '空条件不写字段（否则每条边都带空串）');
    assert.ok(seg.includes('attitude: rel.attitude'), '原有字段不丢');
    assert.ok(seg.includes('relClass: classifyRelationshipType'), '原有分类不丢');
});

test('v3184 8. 注入侧收口：关系块按条件过滤且不删边', () => {
    const i = src.indexOf("blocks.push('[角色关系]')");
    assert.ok(i > 0);
    // 收口代码在 push 之前（判条件），改用过滤后集合的循环在它之后 —— 取双向窗口。
    const before = src.slice(Math.max(0, i - 2600), i + 400);
    assert.ok(before.includes("_moduleLib(() => window.LonShaRelationDisclosure, 'relation-disclosure.js')"), '走统一取库口');
    assert.ok(before.includes('_RD.partition(relations'), '真调用判据');
    assert.ok(before.includes('_relKept.forEach'), '循环改用过滤后的集合');
    assert.ok(before.includes('_pt.gated.slice(0, 5)'), '被跳过的可查且**有界**');
    assert.ok(before.includes('_relKept.length) {'), '过滤后为空时不推空标题');
    // 缺席退路不得是「全部跳过」（那是静默数据损失）
    assert.ok(before.includes('moduleMissing: true'), '模块缺席如实记');
    assert.ok(!/moduleMissing: true[^}]*\}\s*;\s*_relKept\s*=\s*\[\]/.test(before), '缺席不得清空集合');
});

test('v3184 9. 上下文来源单一：buildQuery 记录 _lastCtxText', () => {
    assert.ok(src.includes('this._lastCtxText = String(text ||'), '记录口径唯一');
    // 只应有一处赋值（两处分别记会漂移）
    //   注意：赋值点是 `this._lastCtxText = `，读取点是 `this._lastCtxText ||`，两者不同形
    const assigns = (src.match(/this\._lastCtxText\s*=/g) || []).length;
    assert.equal(assigns, 1, '上下文只在一处赋值');
    assert.ok(src.includes('this._lastCtxText || \'\''), '注入侧真读它');
});

test('v3184 10. 诊断行真进 selfCheck 的 rows 子系统列表', () => {
    const sc = src.indexOf('async selfCheck(');
    assert.ok(sc > 0);
    const scSrc = src.slice(sc);
    assert.ok(scSrc.includes("['\u5173\u7cfb\u62ab\u9732', line + (bad ? ' \u26a0\ufe0f' : '')]"), 'rows 条目存在');
    assert.ok(scSrc.includes('selfCheck.relationDisclosure'), '异常走 errLog 不吞');
    assert.ok(src.includes('_relationDisclosureLine()'), '读数方法存在');
    // 「跳过」不报警、「条件非法」才报警 —— 报错归因必须对得上
    const ri = scSrc.indexOf("['关系披露'");
    const around = scSrc.slice(Math.max(0, ri - 1200), ri);
    assert.ok(around.includes('c.invalid > 0 || c.truncated > 0'), '报警只认真损失（放过正常跳过）');
});

test('v3184 11. 配置键声明 + UI 控件 + manifest 登记三件齐备', () => {
    assert.ok(/relationDisclosureEnabled:\s*true/.test(src), '默认配置块声明键');
    assert.ok(src.includes('this.config.config.relationDisclosureEnabled !== false'), '读取点用同一键名');
    assert.ok(sui.includes("ck('relationDisclosureEnabled'"), 'UI 有控件（否则不可达）');
    assert.ok(mf.extra_js.includes('relation-disclosure.js'), 'manifest 登记');
    // 登记与真文件都在
    assert.ok(MOD_SRC.length > 4000, '模块文件非空壳');
});

/* ══════════════ 3. 负控制（真源码破坏 → 同款判据翻红） ══════════════ */
/** 加载被破坏的模块副本，返回其 API；副本仍会自挂全局，故用完必须还原。 */
function loadBroken(mutate) {
    const broken = mutate(MOD_SRC);
    assert.notEqual(broken, MOD_SRC, '破坏必须真的发生（锚点恰中 1 次）');
    const saved = globalThis.LonShaRelationDisclosure;
    const tmp = ROOT + '__negctl_rd.tmp.cjs';
    require_('fs').writeFileSync(tmp, broken);
    let api;
    try {
        delete require_.cache[require_.resolve(tmp)];
        api = require_(tmp);
    } finally {
        try { require_('fs').unlinkSync(tmp); } catch (_e) { /* 清理失败不影响判定 */ }
        // 破坏副本已污染全局（IIFE 双导出），必须还原成原版，否则后续断言在被污染的环境里跑
        if (saved) { try { globalThis.LonShaRelationDisclosure = saved; } catch (_e) { /* 冻结全局：忽略 */ } }
    }
    return api;
}

test('v3184 N1. 病句放行判据被拆 ⇒ 该组翻红（前提：原版上判据为真）', () => {
    assert.equal(RD.testDisclosure('[unclosed', 'x').state, 'invalid', '原版：病句必须放行并标记');
    const B = loadBroken((s) => {
        const a = "if (!posC.ok.length && !negC.ok.length) { res.state = 'invalid'; return res; }";
        assert.equal(s.split(a).length - 1, 1, '锚点必须恰中 1 次（否则破坏位置不可复现）');
        return s.replace(a, "if (!posC.ok.length && !negC.ok.length) { res.state = 'miss'; return res; }");
    });
    // 破坏后：病句被当「未命中」跳过 ⇒ 关系被静默丢弃（正是本模块明令禁止的）
    assert.equal(B.testDisclosure('[unclosed', 'x').state, 'miss', '判据必须因此改变结论');
    // 工具两向自证：原版上同款断言为假
    assert.notEqual(RD.testDisclosure('[unclosed', 'x').state, 'miss', '原版上不得为 miss');
});

test('v3184 N2. 空上下文放行被拆 ⇒ 该组翻红', () => {
    assert.equal(RD.testDisclosure('告白', '').ctxEmpty, true, '原版：空上下文标记未真筛');
    const B = loadBroken((s) => {
        const a = "            if (!text) {                                   // 没有上下文 ⇒ 放行 + 标记未真筛\n                res.state = 'match';";
        assert.equal(s.split(a).length - 1, 1, '锚点唯一');
        return s.replace(a, "            if (!text) {\n                res.state = 'miss';");
    });
    assert.equal(B.testDisclosure('告白', '').state, 'miss', '破坏后空上下文被当未命中');
    assert.notEqual(RD.testDisclosure('告白', '').state, 'miss');
});

test('v3184 N3. 负条件不生效 ⇒ 该组翻红', () => {
    assert.equal(RD.testDisclosure('告白,!开玩笑', '开玩笑的告白').state, 'miss');
    const B = loadBroken((s) => {
        const a = "if (hitOf(negC.ok)) { res.state = 'miss'; return res; }   // 命中正条件但被排除项否决";
        assert.equal(s.split(a).length - 1, 1, '锚点唯一');
        return s.replace(a, "if (false) { res.state = 'miss'; return res; }");
    });
    assert.equal(B.testDisclosure('告白,!开玩笑', '开玩笑的告白').state, 'match', '排除项失效即放行');
    assert.notEqual(RD.testDisclosure('告白,!开玩笑', '开玩笑的告白').state, 'match');
});

test('v3184 N4. 非法模式计数被删 ⇒ 该组翻红（非法不得静默）', () => {
    assert.equal(RD.partition([{ data: { disclosure: '[bad' } }], 'x').counts.invalidPattern, 1);
    const B = loadBroken((s) => {
        const a = "if (r.invalid && r.invalid.length) out.counts.invalidPattern += r.invalid.length;";
        assert.equal(s.split(a).length - 1, 1, '锚点唯一');
        return s.replace(a, "if (false) out.counts.invalidPattern += 0;");
    });
    assert.equal(B.partition([{ data: { disclosure: '[bad' } }], 'x').counts.invalidPattern, 0, '破坏后静默');
    assert.notEqual(RD.partition([{ data: { disclosure: '[bad' } }], 'x').counts.invalidPattern, 0);
});

test('v3184 N5. 关闭开关不生效 ⇒ 该组翻红（开关必须真短路）', () => {
    assert.equal(RD.partition([{ data: { disclosure: '告白' } }], '无', { enabled: false }).gated.length, 0);
    const B = loadBroken((s) => {
        const a = "        if (!enabled) {\n            out.kept = list.slice();                       // 关闭开关 = 全部照常注入（零行为变化）\n            return out;\n        }";
        assert.equal(s.split(a).length - 1, 1, '锚点唯一');
        return s.replace(a, "        if (false) {\n            out.kept = list.slice();\n            return out;\n        }");
    });
    assert.equal(B.partition([{ data: { disclosure: '告白' } }], '无', { enabled: false }).gated.length, 1, '开关失效后仍被跳过');
    assert.notEqual(RD.partition([{ data: { disclosure: '告白' } }], '无', { enabled: false }).gated.length, 1);
});

test('v3184 N6. 破坏副本污染全局必须可还原（双向断言）', () => {
    assert.ok(goodGlobal, 'require 之后原版已自挂全局（快照必须在 require 之后取）');
    const B = loadBroken((s) => s.replace('DISCLOSURE_VERSION = 1', 'DISCLOSURE_VERSION = 99'));
    assert.equal(B.DISCLOSURE_VERSION, 99);
    // 工具两向自证：原版上同一断言为假
    assert.notEqual(RD.DISCLOSURE_VERSION, 99);
    assert.equal(goodGlobal.DISCLOSURE_VERSION, 1);
});

/* ══════════════ 4. 版权纯度 ══════════════ */
test('v3184 12. 版权纯度：出处写在注释里，代码体不含源项目标识符', () => {
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const body = strip(MOD_SRC);
    for (const bad of ['nocturne', 'Dataojitori', 'text_patch', 'snapshot.py', 'Luker', 'Liyuan', 'NORM_CHAR_MAP_SRC']) {
        assert.ok(!body.includes(bad), `代码体不得含 ${bad}`);
    }
    // 出处必须留档（注释里）——移植可追溯
    assert.ok(MOD_SRC.includes('nocturne_memory'), '注释留出处');
    assert.ok(MOD_SRC.includes('未复制其代码'), '声明未复制代码');
    // 无空 catch（本仓 scan_claim_truthfulness 的上限纪律）
    assert.ok(!/\}\s*catch\s*\([^)]*\)\s*\{\s*\}/.test(MOD_SRC), '不得有空 catch');
});
