#!/usr/bin/env node
/**
 * [FIX] 把 memory-symphony-orchestrator.js 里 69 处「空 catch」改成可诊断的留痕。
 *
 * 为什么必须改（本轮真踩的坑）：
 *   誓约反噬引擎曾有一段代码引用越出块作用域，恒抛 ReferenceError，
 *   而外层是 `catch (e) {}` —— 功能自投产起一次都没生效过，却**一点痕迹都没有**。
 *   编排器里同类空 catch 共 69 处，任何一条引擎接线写错都会这样静默失效。
 *
 * 修法（不改控制流、不新增依赖）：
 *   在 factory 作用域注入一个 `_symphonyFail(stage, e)` 采集器（有上限、不抛、无副作用），
 *   随后把 `} catch (e) {}` 逐处替换为 `} catch (e) { _symphonyFail('<附近注释里的阶段名>', e); }`。
 *   已经完全空吞失败的事实改为「静默但可读」：调用方可用 getFailureReport() 取回。
 */
import fs from 'node:fs';

const FILE = process.argv[2] || 'memory-symphony-orchestrator.js';
let src = fs.readFileSync(FILE, 'utf8');

/* 1) 注入采集器（放在 'use strict' 之后、其它逻辑之前） */
const ANCHOR = "'use strict';";
if (!src.includes('_symphonyFail')) {
  const idx = src.indexOf(ANCHOR);
  if (idx === -1) { console.error('未找到 use strict 锚点，放弃注入'); process.exit(1); }
  const inject = `${ANCHOR}
    /* [v3.461.0 · 诊断留痕] 空 catch 会把「引擎接线写错」变成永久静默失败：
     *   本轮实测誓约反噬引擎因块作用域越界恒抛 ReferenceError，被 catch(e){} 吞掉，
     *   投产以来一次都没生效且零痕迹。以下收集器只记录、不抛、不改控制流。 */
    const _SYMPHONY_FAILS = { count: 0, byStage: Object.create(null), last: null };
    function _symphonyFail(stage, e) {
        try {
            const name = String(stage || 'unknown');
            const msg = String((e && e.message) || e);
            _SYMPHONY_FAILS.count++;
            _SYMPHONY_FAILS.byStage[name] = (_SYMPHONY_FAILS.byStage[name] || 0) + 1;
            _SYMPHONY_FAILS.last = { at: Date.now(), stage: name, message: msg.slice(0, 300) };
            /* 首个失败立刻吼一次：反复失败靠 getFailureReport() 读，不刷屏。 */
            if (_SYMPHONY_FAILS.count === 1 && typeof console !== 'undefined') {
                console.warn('[LonShaSymphony] ⚠️ 引擎阶段失败（后续同类失败只计数）:', name, msg.slice(0, 200));
            }
            return _SYMPHONY_FAILS.last;
        } catch (_ignore) { return null; }
    }
    function getFailureReport() {
        return { count: _SYMPHONY_FAILS.count, byStage: Object.assign({}, _SYMPHONY_FAILS.byStage), last: _SYMPHONY_FAILS.last };
    }`;
  src = src.slice(0, idx) + inject + src.slice(idx + ANCHOR.length);
}

/* 2) 逐处替换空 catch，并从上方 12 行里的注释/方法名推断阶段名 */
const lines = src.split('\n');
const STAGE_RE = /(?:^|\/\/|\*\s*)\s*(\d+\.\s*\[[A-Za-z0-9-]+\][^\n]*)|\[([A-Za-z0-9-]+)\]\s*([^\n(]{2,28})/;
let replaced = 0;
for (let i = 0; i < lines.length; i++) {
  if (!/catch\s*\(\s*[A-Za-z_$][\w$]*\s*\)\s*\{\s*\}/.test(lines[i])) continue;
  /* 往上找最近的阶段注释 */
  let stage = '';
  for (let k = i; k >= Math.max(0, i - 14); k--) {
    const m = /\/\/\s*\d+\.\s*\[([A-Za-z0-9-]+)\]\s*([^\n]{2,30})/.exec(lines[k]);
    if (m) { stage = `${m[1]}`; break; }
    const m2 = /\/\/\s*([0-9]{1,2})\.\s*([^\n]{2,30})/.exec(lines[k]);
    if (m2) { stage = m2[1] + '-' + m2[2].trim().slice(0, 14); break; }
  }
  if (!stage) {
    const m3 = /^\s*\/\/\s*([0-9]{1,2})\.\s*([^\n]{2,30})/.exec(lines[i - 1] || '');
    if (m3) stage = m3[1] + '-' + m3[2].trim().slice(0, 14);
  }
  const tag = (stage || 'stage').replace(/['"\\\n]/g, '').slice(0, 40);
  lines[i] = lines[i].replace(/catch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)\s*\{\s*\}/,
    (_m, p1) => `catch (${p1}) { _symphonyFail('${tag}', ${p1}); }`);
  replaced++;
}
src = lines.join('\n');

fs.writeFileSync(FILE, src);
console.log(`[FIX] 已注入 _symphonyFail 采集器，并替换 ${replaced} 处空 catch。`);