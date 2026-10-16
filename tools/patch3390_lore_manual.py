# -*- coding: utf-8 -*-
"""[v3.339.0 · M4-X1 第一刀] lore-import.js 人工校订面 + 选入面。

缺口（修前实测，读码可复算）：
  ① `classify()` 关键词启发式是**唯一口径** —— 同段混合设定/前史无法拆分改类；
  ② `planApply` 无 `selected` 过滤 —— 「未选段不写」无处落；
  ③ 全仓零 `override`/`reclass` 面（grep 确认）。

本刀（内核面，纯函数零写）：
  · LI_VERSION 1 → 2；
  · 新增 MANUAL 三态（accept / override / split）—— 三态**都不改 origin**；
  · 新增 applyOverrides（人工决定叠加，clsRule 与 cls 分离：规则痕迹永不丢）；
  · 新增 reclassify（单条改类薄封装）与 splitText（拆分原语，切点缺则拒）；
  · planApply 增 selected 过滤（未选段具名 not-selected，不静默丢）；
  · describe / selfCheck 增 manual 面读数。

幂等：锚点不存在（已打过）则原样返回。
"""
import io
import re

P = '/home/user/lonsha-memory-plugin/lore-import.js'

NEW_MANUAL = """    /**
     * [v3.339.0 · M4-X1] 人工校订决定三态(**穷尽**):
     *   accept   —— 人工看过,接受规则判的类目(不改);
     *   override —— 人工改类(规则判错,人工指定新类);
     *   split    —— 同段混合(设定 / 前史混在一段),按人工给的切点拆成两条各带类。
     *   ★ 三态**都不改 origin**:人工改类只改「归到哪一类」,不改「这是导入资料」这件事 ——
     *     「规则不冒充已发生」这条口径对人工决定同样成立(人工也不能把资料说成聊天事实)。
     */
    const MANUAL = Object.freeze({ ACCEPT: 'accept', OVERRIDE: 'override', SPLIT: 'split' });
"""

NEW_FUNCS = """    /* ── 1c [v3.339.0 · M4-X1] 人工校订面(改类 / 拆分 / 选入) ── */
    /**
     * 人工校订叠加(**零写、不改入参**)。把人工决定叠到解析结果上:
     *   `overrides` 形态:`[{ key, decision, cls?, clsA?, clsB?, at?, atText?, why? }]`
     *   或对象形态 `{ <itemKey>: { decision, cls } }`(便于 UI 回填)。
     *   返回 `{ ok, items, applied, rejected, counts, why }` ——
     *   ★ 每条 item 增 `clsRule`(规则原判,**永不丢**)/ `cls`(最终)/ `manual`(是否人工改过)/
     *     `judgeWhy`(规则判命中的词,人工改类后仍在 —— 规则痕迹与人工痕迹**分列**)。
     *   ★ 未在 overrides 里的段**保持规则判**(人工没说的不替他决定)。
     *   ★ 非法 cls(不在 CLASSES 里)⇒ 拒收并具名,不静默落回默认类。
     *   ★ 拆分切点缺(at / atText 都没给)⇒ 拒收具名 split-point-absent,不猜切点。
     */
    function applyOverrides(parsed, overrides, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const p = (parsed && typeof parsed === 'object') ? parsed : null;
        const out = { ok: false, items: [], applied: 0, rejected: [], counts: {}, why: [] };
        for (const c of CLASSES) out.counts[c] = 0;
        if (!p || !Array.isArray(p.items)) return Object.assign(out, { why: ['no-parsed-source'] });
        const map = new Map();
        const src = Array.isArray(overrides) ? overrides
            : (overrides && typeof overrides === 'object' ? Object.keys(overrides).map((k) => Object.assign({ key: k }, overrides[k])) : []);
        for (const ov of src) {
            if (!ov || typeof ov !== 'object') continue;
            const k = keyOf(ov.key);
            if (k) map.set(k, ov);
        }
        const lines = Array.isArray(o.lines) ? o.lines : null;
        const snip = numOr(o.snippetMax, SNIPPET_MAX);
        for (const it of p.items) {
            const key = keyOf(it.key);
            const base = {
                key: key, title: keyOf(it.title), text: strOf(it.text), textHash: keyOf(it.textHash),
                origin: keyOf(it.origin), sourceRef: it.sourceRef, sensitive: it.sensitive === true,
                clsRule: keyOf(it.cls), judgeWhy: keyOf(it.judgeWhy), manual: false,
            };
            const ov = map.get(key);
            const keepRule = () => {
                out.items.push(Object.assign({}, base, {
                    cls: base.clsRule, clsLabel: CLASS_LABEL[base.clsRule] || '', decision: MANUAL.ACCEPT,
                    settingAsHappened: base.clsRule === 'setting-rule' && !!hitAny(base.text, HAPPENED_WORDS),
                }));
                out.counts[base.clsRule] = (out.counts[base.clsRule] || 0) + 1;
            };
            if (!ov) { keepRule(); continue; }
            const dec = keyOf(ov.decision) || MANUAL.OVERRIDE;
            if (dec === MANUAL.SPLIT) {
                const parts = splitText(base.text, ov, lines);
                if (!parts.ok) { out.rejected.push({ key: key, why: parts.why }); keepRule(); continue; }
                const clsA = CLASSES.indexOf(keyOf(ov.clsA)) >= 0 ? keyOf(ov.clsA) : base.clsRule;
                const clsB = CLASSES.indexOf(keyOf(ov.clsB)) >= 0 ? keyOf(ov.clsB) : base.clsRule;
                out.items.push(Object.assign({}, base, {
                    key: key + '#a', text: clip(parts.a, snip), textHash: hash32(parts.a),
                    cls: clsA, clsLabel: CLASS_LABEL[clsA], manual: true, decision: MANUAL.SPLIT,
                    settingAsHappened: clsA === 'setting-rule' && !!hitAny(parts.a, HAPPENED_WORDS),
                }));
                out.items.push(Object.assign({}, base, {
                    key: key + '#b', text: clip(parts.b, snip), textHash: hash32(parts.b),
                    cls: clsB, clsLabel: CLASS_LABEL[clsB], manual: true, decision: MANUAL.SPLIT,
                    settingAsHappened: clsB === 'setting-rule' && !!hitAny(parts.b, HAPPENED_WORDS),
                }));
                out.counts[clsA] = (out.counts[clsA] || 0) + 1;
                out.counts[clsB] = (out.counts[clsB] || 0) + 1;
                out.applied += 1;
                continue;
            }
            if (dec === MANUAL.ACCEPT) { keepRule(); continue; }
            const want = keyOf(ov.cls);
            if (CLASSES.indexOf(want) < 0) {
                out.rejected.push({ key: key, why: 'bad-class', got: want });
                keepRule();
                continue;
            }
            out.items.push(Object.assign({}, base, {
                cls: want, clsLabel: CLASS_LABEL[want], manual: true, decision: MANUAL.OVERRIDE,
                manualWhy: keyOf(ov.why),
                settingAsHappened: want === 'setting-rule' && !!hitAny(base.text, HAPPENED_WORDS),
            }));
            out.counts[want] = (out.counts[want] || 0) + 1;
            out.applied += 1;
        }
        out.ok = out.rejected.length === 0;
        if (!out.applied && !out.rejected.length) out.why.push('no-overrides');
        return out;
    }
    /** 拆分原语:按人工切点切一段。切点缺(at / atText 都没给)⇒ 拒,**不猜切点**。 */
    function splitText(text, ov, lines) {
        const t = strOf(text);
        const o = (ov && typeof ov === 'object') ? ov : {};
        const atText = keyOf(o.atText);
        if (atText) {
            const i = t.indexOf(atText);
            if (i <= 0 || i >= t.length) return { ok: false, why: 'split-marker-not-found' };
            return { ok: true, a: t.slice(0, i).trim(), b: t.slice(i).trim() };
        }
        const at = numOr(o.at, NaN);
        if (!Number.isFinite(at)) return { ok: false, why: 'split-point-absent' };
        if (lines && lines.length) {
            const a = lines.slice(0, at).join(NL).trim();
            const b = lines.slice(at).join(NL).trim();
            if (!a || !b) return { ok: false, why: 'split-empty-side' };
            return { ok: true, a: a, b: b };
        }
        if (at <= 0 || at >= t.length) return { ok: false, why: 'split-out-of-range' };
        return { ok: true, a: t.slice(0, at).trim(), b: t.slice(at).trim() };
    }
    /** 单条改类(**薄封装**,走 applyOverrides —— 不另立第二份口径)。 */
    function reclassify(parsed, itemKey, cls, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const res = applyOverrides(parsed, [{ key: itemKey, decision: MANUAL.OVERRIDE, cls: cls, why: o.why }], o);
        if (res.rejected.length) return { ok: false, why: res.rejected[0].why, got: res.rejected[0].got || '', items: res.items, applied: 0 };
        return { ok: true, why: '', items: res.items, applied: res.applied };
    }
"""


def patch():
    s = io.open(P, encoding='utf-8').read()
    orig = s
    hits = {}

    # 1. LI_VERSION 1 -> 2
    a = '    const LI_VERSION = 1;'
    assert s.count(a) == 1, ('LI_VERSION anchor', s.count(a))
    s = s.replace(a, '    const LI_VERSION = 2;')
    hits['version'] = 1

    # 2. MANUAL 常量插在 PREVIEW 之后
    a = "    const PREVIEW = Object.freeze({ OK: 'ok', WARN: 'warn', BLOCKED: 'blocked' });"
    assert s.count(a) == 1, ('PREVIEW anchor', s.count(a))
    s = s.replace(a, a + '\n' + NEW_MANUAL.rstrip('\n'))
    hits['manual'] = 1

    # 3. 新函数插在「3 逐条 diff」段头之前
    a = '    /* ── 3 逐条 diff(验收4:不自动覆盖玩家已确认事实) ── */'
    assert s.count(a) == 1, ('diff section anchor', s.count(a))
    s = s.replace(a, NEW_FUNCS.rstrip('\n') + '\n' + a)
    hits['funcs'] = 1

    # 4. planApply 增 selected 过滤
    a = """        for (const e of entries) {
            if (!e || typeof e !== 'object') continue;
            if (e.action === 'skip') { out.skipped.push({ key: keyOf(e.key), why: keyOf(e.why) }); continue; }"""
    assert s.count(a) == 1, ('planApply loop anchor', s.count(a))
    b = """        /* [v3.339.0 · M4-X1] 选入面:给了 selected ⇒ 只落选中的段(未选段具名 not-selected,
         *   不静默丢 —— 「未选段不写」是验收原文,而「没选」与「选了但落不下」必须可分)。 */
        const selected = Array.isArray(o.selected) ? o.selected.map(keyOf).filter(Boolean) : null;
        for (const e of entries) {
            if (!e || typeof e !== 'object') continue;
            const ek = keyOf(e.key);
            if (selected && selected.indexOf(ek) < 0) { out.skipped.push({ key: ek, why: 'not-selected' }); continue; }
            if (e.action === 'skip') { out.skipped.push({ key: ek, why: keyOf(e.why) }); continue; }"""
    s = s.replace(a, b)
    hits['selected'] = 1

    # 5. describe 增 manual 面
    a = "            secretBodyKeys: SECRET_BODY_KEYS.slice(), secretMask: SECRET_MASK, maxSourceChars: MAX_SOURCE_CHARS,"
    assert s.count(a) == 1, ('describe anchor', s.count(a))
    s = s.replace(a, a + "\n            manual: Object.keys(MANUAL).map((k) => MANUAL[k]), manualDecisions: 3,")
    hits['describe'] = 1

    # 6. selfCheck 增 manual 面
    a = "            classesDistinct: new Set(CLASSES).size === CLASSES.length,"
    assert s.count(a) == 1, ('selfCheck anchor', s.count(a))
    s = s.replace(a, a + "\n            manualDistinct: new Set(Object.keys(MANUAL).map((k) => MANUAL[k])).size === 3,")
    hits['selfcheck'] = 1

    # 7. 导出面
    a = "        LI_VERSION, LI_KIND, CLASSES, CLASS_LABEL, ORIGIN, ADMIT, PREVIEW,"
    assert s.count(a) == 1, ('export anchor 1', s.count(a))
    s = s.replace(a, "        LI_VERSION, LI_KIND, CLASSES, CLASS_LABEL, ORIGIN, ADMIT, PREVIEW, MANUAL,")
    a = "        entityCandidates, diffPreview, planApply, changedSections, provenanceOf, originVerdict,"
    assert s.count(a) == 1, ('export anchor 2', s.count(a))
    s = s.replace(a, a + "\n        applyOverrides, reclassify, splitText,")
    hits['export'] = 1

    print('hits:', hits)
    if s != orig:
        io.open(P, 'w', encoding='utf-8').write(s)
        print('lore-import.js patched: %d -> %d chars' % (len(orig), len(s)))
    else:
        print('no change')


if __name__ == '__main__':
    patch()