import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
        fs: { readFileSync: readFileSync, existsSync: () => true },
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

/* [v3.204.0] 路径去绝对化：原「本机绝对路径」字面量只在开发机上成立，
 *   任何其他 checkout 位置都必红。「仓库根」按本文件位置推导（tests/ 的上一级）。 */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = __hostSurface() + String.fromCharCode(10) + readFileSync(new URL('../memory-config.js', import.meta.url), 'utf8');
test('v3.120 变化日记接入生成链', () => {
  assert.match(src, /diaryChangeDrivenInjection: true/);
  assert.match(src, /this\.diary\?\.getChangesSince\?\./);
  assert.match(src, /source: 'diary:change'/);
  assert.match(src, /this._diaryInjectFloor = _diaryChangeFloor/);
});
test('v3.120 变化日记游标持久化', () => {
  assert.match(src, /diaryInjectFloor: Number.isFinite/);
  assert.match(src, /data.diaryInjectFloor/);
  assert.match(src, /this._diaryInjectFloor = null/);
});

test('v3.126 日记游标与时间线游标同语义回退', () => {
  // 删楼/回滚时游标同步回退
  assert.match(src, /rollbackFloor\.日记游标回滚/);
  // 聊天切换重置
  const chAt = src.indexOf('events.CHAT_CHANGED变化游标重置');
  assert.ok(chAt > 0);
  const block = src.slice(chAt - 400, chAt + 400);
  assert.match(block, /_diaryInjectFloor = null/);
  assert.match(block, /_timelineCursorChatId = null/);
  // 生成路径的游标边界处理同时覆盖日记游标
  const bAt = src.indexOf('onBeforeGeneration.时间线游标边界');
  assert.ok(bAt > 0);
  const gblock = src.slice(bAt - 900, bAt);
  assert.match(gblock, /this\._diaryInjectFloor = null/);
  assert.match(gblock, /Math\.max\(-1, _cursorFloor - 1\);   \/\/ \[v3\.126\]/);
});
