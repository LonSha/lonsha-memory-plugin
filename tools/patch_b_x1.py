#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch_b_x1.py - [v3.321.0 · B 包 M3-X1] 带证据的自然语言记忆问答。

落点：既有 evidence-query.js（查询 owner）。**不新增运行时模块**（extra_js 保持 96）。
不 require 任何兄弟模块：查询面由宿主经 opts.apis 注入（与既有 query 同规格）。

【为什么放在这里而不是新造一个问答模块】
  M3-X1 的原话是「增量是多条件问题规划和证据合成，不是再造查询API」。
  故本段做两件事，且只做这两件：
    ① **规划**：把「谁答应了什么 / 后来怎样 / 为何改变」拆成**受控查询条件**
       （受控 = 只产出 FILTERS 登记表里的键，未知意图一律进 gaps 并说出理由）；
    ② **合成**：把**已经许可的结果行**（query 的 rows）装订成带出处的短答。
  判定一律走 matchRow（唯一真源），本段不写第二套筛选/排序/可见性口径。

【三条硬边界（写进代码，不只在文档里）】
  · 只基于许可结果：合成只读 query 返回的 rows —— 被遮蔽的行（masked）只报存在性与
    知识范围，正文一格不带（秘密正文属注入面，M-O8 第二刀已收口）。
  · 每个关键句可回源：每句带 ref（账本 + 引用键 + 楼层），不写没有出处的句子。
  · 无答案给缺口而非编补：查不到就报 gaps（具名原因），**绝不**回落成编造的句子。
"""
import io
import sys

P = 'evidence-query.js'
src = io.open(P, encoding='utf-8').read()
lines = src.split('\n')


def only(pred, label):
    hits = [i for i, l in enumerate(lines) if pred(l, i)]
    if len(hits) != 1:
        sys.exit('[x1] anchor %s hit %d (expect 1)' % (label, len(hits)))
    return hits[0]


def has(sub):
    return lambda l, i: sub in l


def eqline(sub):
    return lambda l, i: l.strip() == sub


i_dir = only(eqline("const DIRECTIONS = Object.freeze(['asc', 'desc']);"), 'directions')
i_line = only(eqline('function line(res) {'), 'line-fn')
i_api = only(eqline('const api = Object.freeze({'), 'api')
i_exp = only(eqline('normalizeSaved, upsertSaved, removeSaved, replaySaved, line'), 'exports')

CORE = [
    '    /* ── [v3.321.0 · M3-X1] 带证据的自然语言问答：问题规划 + 证据合成 ──────',
    '     * 【这一段的边界（与计划逐条对齐，写死在代码里）】',
    '     *   · **不造查询 API**：条件一律产出 FILTERS 登记表里的键，判定一律走 matchRow；',
    '     *   · **只基于许可结果**：合成只读 query 返回的 rows；被遮蔽的行只报存在性；',
    '     *   · **每个关键句可回源**：每句带 ref（账本 + 引用键 + 楼层）；',
    '     *   · **无答案给缺口而非编补**：查不到报 gaps（具名原因），不回落成编造句子。',
    '     *',
    '     * 【为什么先规划再合成，而不是一次大查询】',
    '     *   用户问的是「谁答应了什么、后来怎样、为何改变」—— 这是一个**多条件问题**：',
    '     *   前半句要按人筛约定，后半句要按同一本账的状态看它后来变成了什么。',
    '     *   合成一条条件会把「按人筛」与「按状态筛」塌成一次筛选，答不出「后来怎样」。',
    '     *   故这里产出**若干条受控查询**（每条都可在 UI 上单列、可单独重放）。',
    '     */',
    '    const QA_VERSION = 1;',
    '    /** 问题意图登记表（**面向用户的问题型只有这些**；未知一律进 gaps，不猜）。 */',
    '    const QA_INTENTS = Object.freeze([',
    "        { id: 'promise', label: '谁答应了什么', hint: /答应|承诺|说好|约定|保证|发誓|欠/ },",
    "        { id: 'later', label: '后来怎样', hint: /后来|结果|最终|最后|现在|怎么样了/ },",
    "        { id: 'why', label: '为何改变', hint: /为什么|为何|怎么会|原因|转变|反悔|变卦/ },",
    "        { id: 'where', label: '在哪一楼', hint: /哪一?楼|什么时候|何时|第几楼/ },",
    "        { id: 'who', label: '涉及谁', hint: /谁|哪个角色|哪位/ }",
    '    ]);',
    '    /**',
    '     * 从自然语言问题里取**受控查询条件**（纯函数，不摸 host、不查任何东西）。',
    '     *',
    '     * 三条纪律：',
    '     *   ① **只产出登记表里的键**：返回的每个 spec 都经 normalizeSpec 走一遍，',
    '     *      于是未知键进 dropped、空值不落进条件 —— 规划器不可能造出非法条件；',
    '     *   ② **没识别出人名就说出来**：`who` 面为空时不编一个人名进去（那是编造），',
    '     *      而是把「谁」留在 gaps 里，由合成阶段如实说「这条问句里没认出人名」。',
    '     *   ③ **意图不明也要有产出**：至少一条按 text 的宽查，否则「问了个怪问题」',
    '     *      会与「系统坏了」同形（都返回空）。',
    '     *',
    '     * @param {string} question 用户问句',
    '     * @param {object} [opts] { knownActors?:string[], ledgers?:string[], now?:number }',
    '     * @returns {object} { intents, plans[], gaps[], actor }',
    '     */',
    '    function planQuestion(question, opts) {',
    '        const o = opts || {};',
    '        const q = text(question, 200);',
    '        const intents = [];',
    '        const gaps = [];',
    '        for (const it of QA_INTENTS) if (it.hint.test(q)) intents.push(it.id);',
    '        if (!intents.length) gaps.push({ kind: \'intent\', why: \'问句里没认出任何受控问题型（答应/后来/为何/哪一楼/谁）—— 按正文宽查，不假装理解\' });',
    '        /* 人名识别：**只从宿主给的 knownActors 里认**（不猜别名、不做模糊匹配）。',
    '         *   为什么不让规划器自己从问句里切词当人名：切出来的多半是动词短语，',
    '         *   而「按一个不存在的人名筛」会返回空 —— 空与「这人确实没答应过」同形。 */',
    '        const known = (Array.isArray(o.knownActors) ? o.knownActors : [])',
    '            .map((x) => text(x, 40)).filter(Boolean);',
    '        let actor = null;',
    '        for (const k of known) if (q.indexOf(k) >= 0) { actor = k; break; }',
    '        if (!actor) {',
    '            gaps.push({',
    '                kind: \'actor\',',
    '                why: known.length',
    '                    ? \'问句里没认出在场人名（只认 knownActors 里的原名，不猜别名）—— 不按人名筛，避免「筛一个不存在的人」与「这人确实没答应过」同形\'',
    '                    : \'宿主未提供 knownActors：无人名可比对（这是入参事实，不是「没有这个人」）\'',
    '            });',
    '        }',
    '        const ledgersOf = (id) => {',
    '            if (id === \'promise\') return [\'commitment\'];',
    '            if (id === \'later\' || id === \'why\') return [\'commitment\', \'seed\', \'fact-version\'];',
    '            if (id === \'where\') return null;',
    '            return null;',
    '        };',
    '        const plans = [];',
    '        const pushPlan = (id, spec, why) => {',
    '            const n = normalizeSpec(spec);',
    '            plans.push({ id: id, spec: n.spec, droppedKeys: n.dropped, why: why });',
    '        };',
    '        /* ① 「谁答应了什么」——按人 + 约定账。这是**受控**的一步：账名写死，不推导。 */',
    '        if (intents.indexOf(\'promise\') >= 0) {',
    '            const spec = { ledgers: ledgersOf(\'promise\'), text: \'\' };',
    '            if (actor) spec.actors = [actor];',
    '            pushPlan(\'promise\', spec, actor',
    '                ? \'按「\' + actor + \'」筛约定账：答「谁答应了什么」\'',
    '                : \'无人在场人名可比对：按约定账全量取（不按人名筛）\');',
    '        }',
    '        /* ② 「后来怎样」——同一批账看**已结/未结**两态。',
    '         *   这里刻意**不**用 statuses 过滤成 open：那样答不出「后来怎样」（已结的会被滤掉）。',
    '         *   两态分列由合成阶段按行的 status 分档，而不是靠两条互斥查询 ——',
    '         *   互斥查询会把「没查到」与「已被过滤」混成一件事。 */',
    '        if (intents.indexOf(\'later\') >= 0) {',
    '            const spec = { ledgers: ledgersOf(\'later\') };',
    '            if (actor) spec.actors = [actor];',
    '            pushPlan(\'later\', spec, \'按同一批账取全部状态：由合成阶段分「未结 / 已结」两档（不用两条互斥查询）\');',
    '        }',
    '        /* ③ 「为何改变」——转折类线索走正文宽查（只做子串，不做同义改写）。 */',
    '        if (intents.indexOf(\'why\') >= 0) {',
    '            const spec = { ledgers: ledgersOf(\'why\'), text: actor ? actor : \'\' };',
    '            pushPlan(\'why\', spec, \'按转折词/人名做正文子串查：本面只做子串命中，不解释因果（因果解释不是查询面的职责）\');',
    '        }',
    '        /* ④ 意图不明（或只问「在哪一楼」）时兜底：至少给一条正文宽查。',
    '         *   否则「问了个怪问题」与「系统坏了」都是空结果，两者同形。 */',
    '        if (!plans.length) {',
    '            const spec = { text: q.slice(0, 80) };',
    '            if (actor) spec.actors = [actor];',
    '            pushPlan(\'text\', spec, \'未命中受控问题型：按问句正文做子串宽查（如实说明这是宽查，不是理解）\');',
    '        }',
    '        return { question: q, intents: intents, actor: actor, plans: plans, gaps: gaps };',
    '    }',
    '    /**',
    '     * 证据合成：把**已经许可的结果行**装订成带出处的短答（纯函数，不查任何东西）。',
    '     *',
    '     * 四类句子，每类都可回源：',
    '     *   · 存在句：查到 N 条（分账计）；',
    '     *   · 未结句：status 属未结档的行（各账未结档在 QA_OPEN_STATES 里写死）；',
    '     *   · 已结句：其余行（含 broken / cancelled —— **不合并成一档**）；',
    '     *   · 遮蔽句：masked 行只报「存在 + 知识范围」，**正文一格不带**。',
    '     *',
    '     * 无答案时：`answer` 为空数组 + `gaps` 具名原因。**不产出任何无出处的句子。**',
    '     *',
    '     * @param {object} plan planQuestion 的返回',
    '     * @param {Array} results [{ id, query }] —— query 是 query() 的返回（已许可）',
    '     * @param {object} [opts] { maxSentences?:number }',
    '     * @returns {object} { answer[], gaps[], refs[], masked, truncated }',
    '     */',
    '    function composeAnswer(plan, results, opts) {',
    '        const o = opts || {};',
    '        const maxSentences = Math.max(1, Number(o.maxSentences) || 8);',
    '        const p = (plan && typeof plan === \'object\') ? plan : { plans: [], gaps: [] };',
    '        const gaps = (Array.isArray(p.gaps) ? p.gaps.slice() : []);',
    '        const answer = [];',
    '        const refs = [];',
    '        let masked = 0;',
    '        let truncated = false;',
    '        const add = (s) => {',
    '            if (answer.length >= maxSentences) { truncated = true; return false; }',
    '            answer.push(s);',
    '            return true;',
    '        };',
    '        const list = Array.isArray(results) ? results : [];',
    '        let anyRows = false;',
    '        for (const r of list) {',
    '            const q = r && r.query;',
    '            if (!q || typeof q !== \'object\') {',
    '                gaps.push({ kind: \'result-absent\', planId: (r && r.id) || \'\', why: \'该条计划没有查询结果（不是「没有命中」，是没跑）\' });',
    '                continue;',
    '            }',
    '            const rows = Array.isArray(q.rows) ? q.rows : [];',
    '            if (q.state === \'empty\' || q.state === \'inverted-range\' || q.total === 0) {',
    '                gaps.push({',
    '                    kind: \'no-rows\', planId: r.id,',
    '                    why: (q.emptyReason || \'该条件下没有命中\') + \'（扫了 \' + (q.scanned || 0) + \' 行）\'',
    '                });',
    '                continue;',
    '            }',
    '            if (q.pageOutOfRange) {',
    '                gaps.push({ kind: \'page-out-of-range\', planId: r.id, why: \'翻过头（共 \' + q.pages + \' 页）—— 这不是「没有」\' });',
    '                continue;',
    '            }',
    '            anyRows = true;',
    '            /* 存在句：**带总数与账分布**（不是「找到几条」一句话）。 */',
    '            const byLedger = q.hitsByLedger || {};',
    '            const parts = Object.keys(byLedger).map((k) => k + \' \' + byLedger[k]);',
    '            add({',
    '                kind: \'exists\', planId: r.id,',
    '                text: \'查到 \' + q.total + \' 条\' + (parts.length ? \'（\' + parts.join(\'、\') + \'）\' : \'\'),',
    '                ref: null, floor: null',
    '            });',
    '            for (const row of rows) {',
    '                if (row && row.masked === true) {',
    '                    masked += 1;',
    '                    add({',
    '                        kind: \'masked\', planId: r.id,',
    '                        text: \'（存在但不可展示：\' + (row.ledgerLabel || row.ledger) + \' 知识范围 \' + (row.scope || \'判不了\') + \'）\',',
    '                        ref: row.ref, floor: row.floor, ledger: row.ledger',
    '                    });',
    '                    if (row.ref) refs.push({ ref: row.ref, ledger: row.ledger, floor: row.floor });',
    '                    continue;',
    '                }',
    '                const isOpen = (QA_OPEN_STATES[row.ledger] || []).indexOf(row.status) >= 0;',
    '                add({',
    '                    kind: isOpen ? \'open\' : \'settled\',',
    '                    planId: r.id,',
    '                    text: (row.title || \'（无标题）\')',
    '                        + (row.status ? \'［\' + row.status + \'］\' : \'\')',
    '                        + (row.detail ? \' — \' + row.detail : \'\'),',
    '                    ref: row.ref, floor: row.floor, ledger: row.ledger, status: row.status',
    '                });',
    '                if (row.ref) refs.push({ ref: row.ref, ledger: row.ledger, floor: row.floor });',
    '            }',
    '        }',
    '        if (!anyRows && !answer.length) {',
    '            gaps.push({ kind: \'no-answer\', why: \'没有任何一条计划查到可展示的行 —— 这是「查不到」，不是「没有这件事」\' });',
    '        }',
    '        return {',
    '            version: QA_VERSION,',
    '            question: p.question || \'\',',
    '            intents: Array.isArray(p.intents) ? p.intents : [],',
    '            answer: answer,',
    '            gaps: gaps,',
    '            refs: refs,',
    '            masked: masked,',
    '            truncated: truncated,',
    '            /* 回源率是**读数**不是承诺：每条有 ref 的句子都在 refs 里。 */',
    '            resourced: answer.filter((s) => !!s.ref).length,',
    '            total: answer.length',
    '        };',
    '    }',
    '    /** 各账的「未结」状态档（**写死，不推导** —— 各账状态词表本就不同）。',
    '     *   fact-version 的 active / seed 的 advancing 都属「还没结」：如实分档，不合并。 */',
    '    const QA_OPEN_STATES = Object.freeze({',
    '        commitment: [\'open\'],',
    '        seed: [\'open\', \'advancing\'],',
    '        secret: [\'sealed\'],',
    '        parallel: [\'open\'],',
    '        \'fact-version\': [\'active\'],',
    '        repair: [\'open\'],',
    '        \'recall-echo\': [\'open\'],',
    '        echo: [\'on\'],',
    '        \'event-completeness\': [\'open\']',
    '    });',
    '    /** 诊断一行（纯字符串，不抛）。**没查 / 查了没有 / 判不了**三者分开写。 */',
    '    function qaLine(composed) {',
    '        try {',
    '            const c = composed;',
    '            if (!c || typeof c !== \'object\') return \'—（问答面异常）\';',
    '            const parts = [\'问答 \' + (c.total || 0) + \' 句\'];',
    '            if (c.resourced) parts.push(\'可回源 \' + c.resourced);',
    '            if (c.masked) parts.push(\'遮蔽 \' + c.masked);',
    '            if (c.intents && c.intents.length) parts.push(\'问题型 \' + c.intents.join(\'/\'));',
    '            if (c.gaps && c.gaps.length) parts.push(\'缺口 \' + c.gaps.length);',
    '            if (c.truncated) parts.push(\'⚠ 句子数触顶\');',
    '            return parts.join(\' · \');',
    '        } catch (_e) { return \'—（问答面异常）\'; }',
    '    }',
]

EXP_NEW = [
    '        normalizeSaved, upsertSaved, removeSaved, replaySaved, line,',
    '        /* [v3.321.0 · M3-X1] 带证据的自然语言问答（规划 + 合成；不造查询 API） */',
    '        QA_VERSION, QA_INTENTS, QA_OPEN_STATES, planQuestion, composeAnswer, qaLine',
]

ops = [
    (i_dir + 1, i_dir + 1, CORE),
    (i_exp, i_exp + 1, EXP_NEW),
]
ops.sort(key=lambda x: x[0])
for a, b in zip(ops, ops[1:]):
    if a[1] > b[0]:
        sys.exit('[x1] ops overlap %r %r' % (a, b))
for start, end, new in sorted(ops, key=lambda x: -x[0]):
    lines[start:end] = new

out = '\n'.join(lines)
if not out.endswith('\n'):
    out += '\n'
for mark in ['QA_VERSION', 'planQuestion', 'composeAnswer', 'qaLine', 'QA_OPEN_STATES']:
    if mark not in out:
        sys.exit('[x1] self-check missing: %s' % mark)
if out.count('function planQuestion(') != 1 or out.count('function composeAnswer(') != 1:
    sys.exit('[x1] 新函数出现次数不为 1')
io.open(P, 'w', encoding='utf-8').write(out)
print('[x1] wrote %s lines %d -> %d' % (P, len(src.split('\n')), len(out.split('\n'))))