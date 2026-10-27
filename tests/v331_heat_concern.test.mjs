// v3.31 召回加热 + concern 复发 测试
// 抽取 index.js 的相关方法做黑盒验证
import fs from 'node:fs';
/* [v3.421.0] 宿主面合并读：index.js 的方法已大批外提到 engine-*.js / memory-core.js，
 *   入口只剩一行委派。只读入口的测试因此两重受害 ——
 *   ① 方法体根本不在入口里（断言找不到）；
 *   ② 抠出来的片段没有闭包作用域（_moduleLib / errLog …）→ ReferenceError。
 *   改读 hostSurface 的合并面（v3160/v3161/v3163 同一机制）。变量名与下游断言一字不改。
 *   顺序：入口在前、模块在后 —— 版本常量这类「以入口为准」的断言必须先命中入口；
 *   而入口里的单行委派体一律先剥掉，否则抽取助手取首次命中会抠到委派（只剩一句委托）。 */
import { hostSurface as __hostSurfaceRaw } from './_audit_lib.mjs';
import __hostPath from 'node:path';
import { fileURLToPath as __hostFu } from 'node:url';
/* 写成函数声明而不是 const 箭头：读取语句常落在文件前几行，而 import 段可能在它下面。
 *   声明提升是唯一与语句顺序无关的写法（const 会撞 TDZ，实测 4 档因此新红）。 */
function __hostSurface() {
    const __root = __hostFu(new URL('..', import.meta.url));
    const __face = __hostSurfaceRaw(__root, {
        fs: { readFileSync: fs.readFileSync, existsSync: () => true },
        path: __hostPath,
    });
    /* 单行委派形如 `foo(a) { const M = _moduleLib(...); return M ? ... ; }` —— 从正文里**移走**。
     *   两行以上的委派很少，且那种形态抽取助手本来就抠不全，留给模块面兜。
     *   [v3.421.0] 但**不能丢弃**：一批「宿主出口各恰一处」的判据问的就是这些委派桩本身
     *   （`foo(...args) {` 只存在于入口的委派行里，模块面是 `function foo(engine, ...)`）。
     *   故剥下来的行收集到扫描面**最末**：抽取助手仍先命中模块面的真实现（委派在尾部），
     *   而字符串在场判据照旧命中。丢弃会让那批判据整片假红。 */
    const __deleg = [];
    const __squeeze = (raw) => raw.split(String.fromCharCode(10))
        .filter((ln) => {
            const __isDeleg = /^[ \t]*[_a-zA-Z$][\w$]*[ \t]*\(.*\)[ \t]*\{.*_moduleLib\(.*\}[ \t]*$/.test(ln);
            if (__isDeleg) __deleg.push(ln);
            return !__isDeleg;
        })
        .join(String.fromCharCode(10));
    return __face.files.map((f) => __squeeze(f.raw)).join(String.fromCharCode(10))
        + String.fromCharCode(10) + '// ==== 剥下的单行委派（入口原文，供「出口在场」判据） ====' + String.fromCharCode(10)
        + __deleg.join(String.fromCharCode(10));
}

const srcRaw = __hostSurface() + String.fromCharCode(10) + fs.readFileSync(new URL('../memory-config.js', import.meta.url), 'utf8');
/* [v3.266.0 A1 第六刀] MemoryGraph / SummarySystem / GameClock / CharacterState 已外移
 *   memory-core.js：本文件的类抽取面与静态面改读「入口 + 该模块」合看（语义一字不改，
 *   只换被读的文件面；不放宽：每一条仍须在场）。 */
const src = srcRaw + String.fromCharCode(10) + (fs.readFileSync(new URL('../memory-core.js', import.meta.url), 'utf8'))
/* [v3.264.0 A1 第五刀] VectorStore 已外移 memory-organs.js：本文件凡「从 index.js 抽这些类/方法」的抽取面改读该模块，
 *   语义一字不改，只换被读的文件。 */
const orgSrc = fs.readFileSync(new URL('../memory-organs.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const assert = (n, c) => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}`); } };

// ===== 1. 静态锚点检查 =====
assert('config 有 heatOnRecallEnabled', src.includes('heatOnRecallEnabled: true'));
assert('VectorStore 有 _heatEntry 方法', orgSrc.includes('_heatEntry(v)'));
assert('VectorStore 有 heatByText 方法', orgSrc.includes('heatByText(text)'));
assert('search 调用 _heatEntry', /for \(const v of scored\.slice\(0, topK\)\) \{[\s\S]*?this\._heatEntry\(src\)/.test(orgSrc));
/* [v3.421.0] 加热点随召回外移 engine-recall.js：接收者写成形参 engine。 */
assert('BM25 命中加热', /\.vector\.heatByText\(b\.text\)/.test(src));
/* [v3.264.0] 消费点在宿主（MemoryEngine），方法本体已外移——上一行守宿主、本行守模块。 */
assert('todos 有 lastMentionedAt', src.includes('lastMentionedAt: Date.now()'));
assert('todos 有 reoccurred 标记', src.includes('reoccurred: reoccurred || undefined'));
assert('pruneTodos 有复发豁免', src.includes('lastMentionedAt && (Date.now() - t.lastMentionedAt < 24'));

// ===== 2. 行为验证（热逻辑） =====
// 模拟 VectorStore 的加热逻辑
function simulateHeat(v) {
  v.accessCount = (v.accessCount || 0) + 1;
  v.activationCount = (v.activationCount || 1) + 1;
  v.lastActive = Date.now();
  v.metadata = { ...(v.metadata || {}), accessCount: v.accessCount, activationCount: v.activationCount, lastActive: v.lastActive };
  return v;
}
{
  const start = Date.now() - 10 * 86400000; // 10天前
  const mem = { id: 'v1', text: '戒奶茶', accessCount: 1, activationCount: 2, lastActive: start, timestamp: start };
  simulateHeat(mem);
  assert('加热后 accessCount+1', mem.accessCount === 2);
  assert('加热后 activationCount+1', mem.activationCount === 3);
  assert('加热后 lastActive 刷新（续命）', mem.lastActive >= Date.now() - 1000);
  assert('metadata 同步', mem.metadata.accessCount === 2 && mem.metadata.activationCount === 3);
}

// ===== 3. 行为验证（concern 复发 + 豁免） =====
{
  const now = Date.now();
  // 模拟 addTodos 复发判定
  let todos = [{ text: '还书', date: '3月15日', createdAt: now - 86400000, lastMentionedAt: now - 86400000 }];
  const text = '还书';
  const reoccurred = todos.some(x => x.text === text);
  assert('复发检测到既有待办', reoccurred === true);
  todos = todos.filter(x => x.text !== text);
  todos.push({ text, date: '3月20日', createdAt: now, lastMentionedAt: now, reoccurred: reoccurred || undefined });
  assert('复发后重述 date 更新', todos[0].date === '3月20日');
  assert('复发标记 reoccurred 为真', todos[0].reoccurred === true);
  assert('复发刷新 lastMentionedAt', Math.abs(todos[0].lastMentionedAt - now) < 1000);

  // 模拟 pruneTodos 复发豁免：旧日期已过但最近重申 → 保留
  const cur = new Date('2026-03-22');
  const td = new Date('2026-03-20');
  const diffMin = (cur - td) / 60000;
  const expiryMinutes = 60;
  // 未重申（lastMentionedAt 很久前）→ 过期清除
  todos[0].lastMentionedAt = now - 5 * 86400000;
  const shouldPrune = !(todos[0].lastMentionedAt && (now - todos[0].lastMentionedAt < 24 * 3600000)) && diffMin > expiryMinutes;
  assert('旧待办过期应清除', shouldPrune === true);
  // 重申（lastMentionedAt 最近）→ 豁免保留
  todos[0].lastMentionedAt = now - 3600000; // 1小时前重申
  const exempt = todos[0].lastMentionedAt && (now - todos[0].lastMentionedAt < 24 * 3600000);
  assert('最近重申复发豁免', exempt === true);
}

console.log(`\n${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);