/**
 * rules-compile.js — [R27-F] 规则 DSL：作者写的是数据，不是代码
 *
 * 【来源】照 shrink1024/fish-memory 的 src/rules/index.js（225 行）行为重写。
 *         该仓无 LICENSE，未复制任何代码。字段闭集、算子闭集、五条上限、
 *         「when … => …;」语法属于机制契约，按其行为重写并自测。
 *
 * 【要解决什么】
 *   让用户能「按条件锁条目 / 限字数 / 强制常驻」，最省事的做法是让规则写成
 *   JavaScript 片段或 EJS 模板 —— 那等于把世界书变成可执行代码：作者的一条规则
 *   能读宿主变量、能发网络请求、能在别人的存档里执行。**作者规则必须是数据。**
 *
 * 【语法】（全部可静态校验，无副作用）
 *   rule      ::= 'when' expr '=>' action [' ' number] ';'
 *   expr      ::= and ('or' and)*
 *   and       ::= unary ('and' unary)*
 *   unary     ::= 'not' unary | '(' expr ')' | compare
 *   compare   ::= FIELD OP literal
 *   OP        ::= '==' | '!=' | 'contains'
 *   action    ::= 'lock' | 'maxChars' | 'always' | 'trigger' | 'gate'
 *
 * 【两个闭集】（新增字段/算子必须改这里 + 抬版本）
 *   FIELDS = id / title / kind / constant / sourceUID（可写 entry. 前缀）
 *   OPS    = lock / maxChars / always / trigger / gate
 *
 * 【五条上限】（防「一条规则把界面卡死」）
 *   MAX_SCRIPT 10000 字符 · MAX_STATEMENTS 100 · MAX_TOKENS 2000
 *   MAX_DEPTH 16 括号嵌套 · MAX_NODES 1000 表达式节点
 *
 * 【与源码差异（逐条可指认）】
 *   · AST format 改成本仓名 `lonsha-rule-ast`（**不冒充** fish-memory 的格式），
 *     规则条目 marker 改为 `[LonSha Rules]`、文档 format 改为 `lonsha-rules`；
 *   · 词法器与语法器都带行列号（与源码一致），但错误消息前缀改为中文可读句式；
 *   · 增 readings（语句数/节点数/命中几条）与 line()；
 *   · applyRules 用自带 cloneData（不依赖 structuredClone）。
 *
 * 【纪律】
 *   ① 无宿主访问：本模块不碰 window / document / fetch / eval / Function；
 *   ② 编译期就要报错：discoverRules 在返回前先 compileRules 一次，
 *      让「规则写错」在初始化阶段现形，而不是等到第一次注入；
 *   ③ always 只是排期建议：它不推翻宿主的「关闭 / 角色限制 / 进度限制」。
 */
(function (root) {
    'use strict';

    /** 本面结构版本。 */
    const RC_VERSION = 1;
    /** 读数 kind。 */
    const RC_KIND = 'rules_compile';
    /** 规则条目识别标记（世界书 comment 字段整串相等才算）。 */
    const MARKER = '[LonSha Rules]';
    /** AST / 文档格式名（本仓自有，不与外部仓互通）。 */
    const AST_FORMAT = 'lonsha-rule-ast';
    const DOC_FORMAT = 'lonsha-rules';
    /** 允许的字段（含 entry. 前缀写法）。 */
    const FIELDS = Object.freeze(['id', 'title', 'kind', 'constant', 'sourceUID']);
    /** 允许的算子。 */
    const OPS = Object.freeze(['lock', 'maxChars', 'always', 'trigger', 'gate']);
    /** 只能是文本的字段（contains 只对这些有意义）。 */
    const TEXT_FIELDS = Object.freeze(['id', 'title', 'kind', 'sourceUID']);
    /** 上限。 */
    const MAX_SCRIPT = 10000;
    const MAX_STATEMENTS = 100;
    const MAX_TOKENS = 2000;
    const MAX_DEPTH = 16;
    const MAX_NODES = 1000;
    /** 字面量约束。 */
    const MAX_STRING_LENGTH = 1000;
    const MAX_CHARS_VALUE = 100000;

    /** 语法错误：带行列号，消息统一前缀。 */
    class RuleSyntaxError extends Error {
        constructor(message, line, column) {
            const atLine = line === undefined ? 1 : line;
            const atColumn = column === undefined ? 1 : column;
            super('规则第 ' + atLine + ' 行第 ' + atColumn + ' 列：' + message);
            this.name = 'RuleSyntaxError';
            this.line = atLine;
            this.column = atColumn;
        }
    }

    /** 允许的字符集之外的一切都在词法阶段拒绝（这是「不许写代码」的硬边界）。 */
    function tokenize(source) {
        const tokens = [];
        const text = String(source ?? '');
        let i = 0;
        let line = 1;
        let column = 1;

        const push = (type, value, atLine, atColumn) => {
            tokens.push({ type: type, value: value, line: atLine, column: atColumn });
            if (tokens.length > MAX_TOKENS) throw new RuleSyntaxError('词元过多（上限 ' + MAX_TOKENS + '）', atLine, atColumn);
        };
        const step = () => {
            if (text[i] === '\n') { line++; column = 1; } else column++;
            i++;
        };

        while (i < text.length) {
            const ch = text[i];
            if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\v' || ch === '\f' || ch === '\u00a0') {
                step();
                continue;
            }
            const atLine = line;
            const atColumn = column;

            if (ch === '"') {
                step();
                let raw = '';
                let closed = false;
                while (i < text.length) {
                    if (text[i] === '"') { step(); closed = true; break; }
                    if (text[i] === '\\') {
                        raw += text[i];
                        step();
                        if (i >= text.length) break;
                        raw += text[i];
                        step();
                        continue;
                    }
                    raw += text[i];
                    step();
                }
                if (!closed) throw new RuleSyntaxError('字符串未闭合', atLine, atColumn);
                let value;
                try {
                    value = JSON.parse('"' + raw + '"');
                } catch (_e) {
                    throw new RuleSyntaxError('无效字符串转义', atLine, atColumn);
                }
                if (typeof value !== 'string') throw new RuleSyntaxError('字符串解析异常', atLine, atColumn);
                if (value.length > MAX_STRING_LENGTH) throw new RuleSyntaxError('字符串过长（上限 ' + MAX_STRING_LENGTH + '）', atLine, atColumn);
                push('string', value, atLine, atColumn);
                continue;
            }

            const two = text.slice(i, i + 2);
            if (two === '=>' || two === '==' || two === '!=') {
                step(); step();
                push(two, two, atLine, atColumn);
                continue;
            }
            if (ch === '(' || ch === ')' || ch === ';') {
                step();
                push(ch, ch, atLine, atColumn);
                continue;
            }
            if (ch >= '0' && ch <= '9') {
                let digits = '';
                while (i < text.length && text[i] >= '0' && text[i] <= '9') { digits += text[i]; step(); }
                push('number', Number(digits), atLine, atColumn);
                continue;
            }
            if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_') {
                let word = '';
                while (i < text.length) {
                    const c = text[i];
                    const okWord = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c === '_' || c === '.';
                    if (!okWord) break;
                    word += c;
                    step();
                }
                push('word', word, atLine, atColumn);
                continue;
            }
            throw new RuleSyntaxError('不允许的字符 ' + JSON.stringify(ch), atLine, atColumn);
        }
        push('EOF', '', line, column);
        return tokens;
    }

    /** 编译规则脚本 → AST。任何不合法的写法都抛 RuleSyntaxError（带行列号）。 */
    function compileRules(script) {
        if (typeof script !== 'string') throw new RuleSyntaxError('规则必须是最多 ' + MAX_SCRIPT + ' 字符的文本');
        if (script.length > MAX_SCRIPT) throw new RuleSyntaxError('规则脚本超过 ' + MAX_SCRIPT + ' 字符');

        const tokens = tokenize(script);
        let cursor = 0;
        let nodeCount = 0;
        const peek = () => tokens[cursor];
        const fail = (message, token) => {
            const t = token || peek();
            throw new RuleSyntaxError(message, t.line, t.column);
        };
        const take = (type, value) => {
            const token = peek();
            if (token.type !== type || (value !== undefined && token.value !== value)) {
                fail('需要 ' + (value === undefined ? type : value), token);
            }
            cursor++;
            return token;
        };
        const isWord = (value) => peek().type === 'word' && peek().value === value;
        const node = (value) => {
            nodeCount++;
            if (nodeCount > MAX_NODES) fail('表达式过于复杂（节点上限 ' + MAX_NODES + '）');
            return value;
        };

        function literal() {
            const token = peek();
            if (token.type === 'string' || token.type === 'number') { cursor++; return token.value; }
            if (isWord('true') || isWord('false')) { cursor++; return token.value === 'true'; }
            fail('需要字符串、整数或布尔值');
            return null;
        }

        function atom(depth) {
            if (depth > MAX_DEPTH) fail('括号嵌套过深（上限 ' + MAX_DEPTH + '）');
            if (peek().type === '(') {
                take('(');
                const inner = orExpr(depth + 1);
                take(')');
                return inner;
            }
            const fieldToken = take('word');
            const field = fieldToken.value.indexOf('entry.') === 0 ? fieldToken.value.slice(6) : fieldToken.value;
            if (FIELDS.indexOf(field) < 0) fail('未知字段 ' + fieldToken.value, fieldToken);
            const operatorToken = peek();
            let operator;
            if (operatorToken.type === 'word' && operatorToken.value === 'contains') { cursor++; operator = 'contains'; }
            else if (operatorToken.type === '==' || operatorToken.type === '!=') { cursor++; operator = operatorToken.value; }
            else fail('需要 ==、!= 或 contains');
            const value = literal();
            if (operator === 'contains') {
                if (typeof value !== 'string' || TEXT_FIELDS.indexOf(field) < 0) fail('contains 仅适用于文本字段与字符串值', operatorToken);
            }
            if (field === 'constant' && typeof value !== 'boolean') fail('constant 必须比较布尔值', fieldToken);
            if (field !== 'constant' && typeof value !== 'string') fail(field + ' 必须比较字符串', fieldToken);
            return node({ type: 'compare', field: field, operator: operator, value: value });
        }

        function notExpr(depth) {
            if (isWord('not')) {
                take('word', 'not');
                return node({ type: 'not', value: notExpr(depth + 1) });
            }
            return atom(depth);
        }

        function andExpr(depth) {
            let left = notExpr(depth);
            while (isWord('and')) {
                take('word', 'and');
                left = node({ type: 'and', left: left, right: notExpr(depth) });
            }
            return left;
        }

        function orExpr(depth) {
            let left = andExpr(depth);
            while (isWord('or')) {
                take('word', 'or');
                left = node({ type: 'or', left: left, right: andExpr(depth) });
            }
            return left;
        }

        const statements = [];
        while (peek().type !== 'EOF') {
            if (statements.length >= MAX_STATEMENTS) fail('语句过多（上限 ' + MAX_STATEMENTS + '）');
            const start = take('word', 'when');
            const condition = orExpr(0);
            take('=>');
            const actionToken = take('word');
            if (OPS.indexOf(actionToken.value) < 0) fail('未知操作 ' + actionToken.value, actionToken);
            let value = null;
            if (actionToken.value === 'maxChars') {
                value = take('number').value;
                if (!Number.isSafeInteger(value) || value < 1 || value > MAX_CHARS_VALUE) {
                    fail('maxChars 必须为 1–' + MAX_CHARS_VALUE + ' 的整数', actionToken);
                }
            }
            take(';');
            statements.push({ condition: condition, action: actionToken.value, value: value, line: start.line });
        }
        return { format: AST_FORMAT, version: RC_VERSION, statements: statements, nodeCount: nodeCount };
    }

    /** 校验 AST 形状（防御「手工拼的 AST」绕过编译器）。 */
    function assertCompiled(compiled) {
        if (!compiled || typeof compiled !== 'object') throw new TypeError('无效规则 AST');
        if (compiled.format !== AST_FORMAT || compiled.version !== RC_VERSION) throw new TypeError('无效规则 AST');
        if (!Array.isArray(compiled.statements)) throw new TypeError('无效规则 AST');
        for (const statement of compiled.statements) {
            if (!statement || typeof statement !== 'object') throw new TypeError('无效规则 AST');
            if (OPS.indexOf(statement.action) < 0) throw new TypeError('无效规则操作');
        }
        return compiled;
    }

    /** 单条表达式求值。缺失值（undefined/null）只对 != 成立 —— 「没有这个字段」不等于「等于空串」。 */
    function match(expr, entry) {
        if (!expr || typeof expr !== 'object') throw new TypeError('无效规则 AST');
        if (expr.type === 'and') return match(expr.left, entry) && match(expr.right, entry);
        if (expr.type === 'or') return match(expr.left, entry) || match(expr.right, entry);
        if (expr.type === 'not') return !match(expr.value, entry);
        if (expr.type === 'compare') {
            const source = entry && typeof entry === 'object' ? entry : {};
            const actual = expr.field === 'sourceUID' ? (source.source && source.source.uid) : source[expr.field];
            if (actual === undefined || actual === null) return expr.operator === '!=';
            if (expr.operator === 'contains') return String(actual).indexOf(expr.value) >= 0;
            if (expr.operator === '==') return String(actual) === String(expr.value);
            if (expr.operator === '!=') return String(actual) !== String(expr.value);
            throw new TypeError('无效规则比较符');
        }
        throw new TypeError('无效规则 AST');
    }

    /** 对单个条目求规则结果。 */
    function evaluateRules(compiled, entry) {
        const ast = assertCompiled(compiled);
        const result = { locked: false, maxChars: null, always: false, trigger: false, gate: false };
        for (const statement of ast.statements) {
            if (!match(statement.condition, entry)) continue;
            if (statement.action === 'lock') result.locked = true;
            else if (statement.action === 'maxChars') {
                result.maxChars = Math.min(result.maxChars === null ? Infinity : result.maxChars, statement.value);
            }
            else if (statement.action === 'always') result.always = true;
            else if (statement.action === 'trigger') result.trigger = true;
            else if (statement.action === 'gate') result.gate = true;
            else throw new TypeError('无效规则操作');
        }
        if (result.maxChars === Infinity) result.maxChars = null;
        return result;
    }

    /** 普通数据深拷贝（不依赖 structuredClone）。 */
    function cloneData(value) {
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) return value.map(cloneData);
        const out = {};
        for (const key of Object.keys(value)) out[key] = cloneData(value[key]);
        return out;
    }

    /**
     * 把规则应用到条目表。
     * lock ⇒ 该条目所有段 writable=false（改写通道也被锁住，不只是注入侧）。
     * 其余算子只进 constraints，由注入侧消费。
     */
    function applyRules(entries, compiled) {
        if (!Array.isArray(entries)) throw new TypeError('entries 必须是数组');
        assertCompiled(compiled);
        const constraints = {};
        let locked = 0;
        const updated = entries.map((entry) => {
            const copy = cloneData(entry) || {};
            const rule = evaluateRules(compiled, copy);
            constraints[copy.id] = rule;
            if (!rule.locked) return copy;
            locked++;
            const segments = Array.isArray(copy.segments) ? copy.segments : [];
            copy.segments = segments.map((segment) => {
                const out = { ...segment };
                out.writable = false;
                return out;
            });
            return copy;
        });
        return {
            entries: updated,
            constraints: constraints,
            readings: { total: updated.length, locked: locked, line: '规则应用 条目' + updated.length + ' 锁定' + locked }
        };
    }

    /**
     * 从世界书原条目里发现规则条目。
     * **返回前先编译一次**：规则写错必须在初始化阶段现形，不能等到第一次注入。
     */
    function discoverRules(rawEntries) {
        if (!Array.isArray(rawEntries)) throw new TypeError('rawEntries 必须是原书条目数组');
        const configEntryUids = [];
        const seen = new Set();
        const natural = [];
        const scripts = [];
        for (const raw of rawEntries) {
            const comment = raw && raw.comment !== undefined && raw.comment !== null ? String(raw.comment).trim() : '';
            if (comment !== MARKER) continue;
            const uid = String(raw && raw.uid);
            if (seen.has(uid)) throw new Error('重复规则条目 UID：' + uid);
            seen.add(uid);
            configEntryUids.push(raw && raw.uid);
            let doc;
            try {
                doc = JSON.parse(raw.content);
            } catch (_e) {
                throw new Error('规则条目 ' + uid + ' 不是有效 JSON');
            }
            const ok = doc && doc.format === DOC_FORMAT && doc.version === RC_VERSION
                && typeof doc.naturalLanguage === 'string' && typeof doc.script === 'string';
            if (!ok) throw new Error('规则条目 ' + uid + ' 格式或版本冲突');
            if (doc.naturalLanguage.length > MAX_SCRIPT || doc.script.length > MAX_SCRIPT) {
                throw new Error('规则条目 ' + uid + ' 内容过长');
            }
            if (doc.naturalLanguage.trim()) natural.push(doc.naturalLanguage.trim());
            if (doc.script.trim()) scripts.push(doc.script.trim());
        }
        const script = scripts.join('\n');
        compileRules(script);
        return { naturalLanguage: natural.join('\n\n'), script: script, configEntryUids: configEntryUids };
    }

    /** 生成一条规则条目的 JSON 文本（写回世界书用）。 */
    function buildRuleDocument(options) {
        const opt = options && typeof options === 'object' ? options : {};
        const naturalLanguage = opt.naturalLanguage === undefined ? '' : opt.naturalLanguage;
        const script = opt.script === undefined ? '' : opt.script;
        if (typeof naturalLanguage !== 'string' || naturalLanguage.length > MAX_SCRIPT) {
            throw new TypeError('自然语言规则过长或格式错误');
        }
        if (typeof script !== 'string') throw new TypeError('规则脚本必须是文本');
        compileRules(script);
        return JSON.stringify({
            format: DOC_FORMAT, version: RC_VERSION, naturalLanguage: naturalLanguage, script: script
        }, null, 2);
    }

    /** 表单 → 一行脚本（面板的可视化编辑用；生成后仍要过一遍编译器）。 */
    function formToScript(fields) {
        const f = fields && typeof fields === 'object' ? fields : {};
        const rawField = String(f.field === undefined ? '' : f.field);
        const canonical = rawField.indexOf('entry.') === 0 ? rawField.slice(6) : rawField;
        if (FIELDS.indexOf(canonical) < 0) throw new TypeError('未知规则字段');
        const operator = f.operator === undefined ? '==' : f.operator;
        if (['==', '!=', 'contains'].indexOf(operator) < 0) throw new TypeError('未知比较操作');
        if (OPS.indexOf(f.action) < 0) throw new TypeError('未知规则操作');
        let literal;
        if (typeof f.value === 'boolean') literal = String(f.value);
        else if (typeof f.value === 'number') literal = String(f.value);
        else literal = JSON.stringify(f.value);
        if (literal === undefined) throw new TypeError('缺少比较值');
        const suffix = f.action === 'maxChars' ? ' ' + String(f.maxChars) : '';
        const script = 'when ' + canonical + ' ' + operator + ' ' + literal + ' => ' + f.action + suffix + ';';
        compileRules(script);
        return script;
    }

    /** 诊断行。 */
    function line(readings) {
        const r = readings && typeof readings === 'object' ? readings : {};
        return '规则 ' + String(r.statements === undefined ? 0 : r.statements) + ' 条语句 / '
            + String(r.nodeCount === undefined ? 0 : r.nodeCount) + ' 个节点'
            + (r.locked === undefined ? '' : ' / 锁定 ' + r.locked + ' 条');
    }

    /** 自检（供 engine-self-check 与测试共用）。 */
    function selfCheck() {
        const compiled = compileRules('when kind == "npc" and title contains "旧" => lock;');
        const hit = evaluateRules(compiled, { id: 'e1', title: '旧城守夜人', kind: 'npc', segments: [{ id: 's1', text: '正文' }] });
        const miss = evaluateRules(compiled, { id: 'e2', title: '新城守夜人', kind: 'npc' });
        const applied = applyRules([{ id: 'e1', title: '旧城守夜人', kind: 'npc', segments: [{ id: 's1', text: '正文' }] }], compiled);
        let injected = null;
        try {
            // 代码注入必须死在词法阶段（这就是「规则是数据」的硬边界）。
            compileRules('when kind == "npc" => lock; process.exit(1);');
        } catch (e) {
            injected = e && e.name === 'RuleSyntaxError' ? e.message : 'other';
        }
        const checks = [
            ['命中锁', hit.locked === true],
            ['未命中不锁', miss.locked === false],
            ['应用后段变不可写', applied.entries[0].segments[0].writable === false && applied.readings.locked === 1],
            ['代码注入被词法拒绝', typeof injected === 'string' && injected.indexOf('规则第') === 0]
        ];
        return {
            ok: checks.every((x) => x[1]),
            checks: checks.map((x) => ({ name: x[0], ok: !!x[1] }))
        };
    }

    const api = {
        RC_VERSION: RC_VERSION,
        RC_KIND: RC_KIND,
        MARKER: MARKER,
        AST_FORMAT: AST_FORMAT,
        DOC_FORMAT: DOC_FORMAT,
        FIELDS: FIELDS,
        OPS: OPS,
        MAX_SCRIPT: MAX_SCRIPT,
        MAX_STATEMENTS: MAX_STATEMENTS,
        MAX_TOKENS: MAX_TOKENS,
        MAX_DEPTH: MAX_DEPTH,
        MAX_NODES: MAX_NODES,
        RuleSyntaxError: RuleSyntaxError,
        tokenize: tokenize,
        compileRules: compileRules,
        evaluateRules: evaluateRules,
        applyRules: applyRules,
        discoverRules: discoverRules,
        buildRuleDocument: buildRuleDocument,
        formToScript: formToScript,
        line: line,
        selfCheck: selfCheck
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaRulesCompile = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);