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
const srcRaw = __hostSurface() + String.fromCharCode(10) + readFileSync(new URL('../memory-config.js', import.meta.url), 'utf8');
/* [v3.266.0 A1 第六刀] MemoryGraph / SummarySystem / GameClock / CharacterState 已外移
 *   memory-core.js：本文件的类抽取面与静态面改读「入口 + 该模块」合看（语义一字不改，
 *   只换被读的文件面；不放宽：每一条仍须在场）。 */
const src = srcRaw + String.fromCharCode(10) + readFileSync(new URL('../memory-core.js', import.meta.url), 'utf8');
/* [A1] PairMemory 已抽为 memory-ledgers.js（index.js 不再声明）。
 *   `pair:change` 源头随之移到模块；原断言只扫 index.js，现列名两个真源。 */
const mlSrc = readFileSync(`${REPO_ROOT}/memory-ledgers.js`, 'utf8');
/* [v3.259.0 A1 第四刀] IncrementBookmark / EchoPool / SuspenseBook / PrequelSystem /
 *   RelativeTimeHelper / PlotTimeline / BM25 七个类已外迁到 memory-books.js。
 *   凡是「从 index.js 抽这些类」的抽取面都改读该模块；语义一字不改，只换被读的文件。 */
const bkSrc = readFileSync(`${REPO_ROOT}/memory-books.js`, 'utf8');
test('v3.121 时间线提供游标变化读取', () => {
  assert.match(bkSrc, /getChangesSince\(floor = -1, anchorDate = ''/);
  assert.match(src, /timeChangeDrivenInjection: true/);
});
test('v3.121 生成前接入时间锚点变化', () => {
  assert.match(src, /this\.timeline\?\.getChangesSince\?\./);
  assert.match(src, /source: 'timeline:change'/);
  assert.match(src, /this\._timelineInjectFloor = _timelineChangeFloor/);
});
test('v3.121 时间线游标持久化与回滚', () => {
  assert.match(src, /timelineInjectFloor: Number\.isFinite/);
  assert.match(src, /data\.timelineInjectFloor/);
  assert.match(src, /时间线游标回滚/);
});

test('v3.121 时间变化支持日期窗口与角色关联', () => {
  assert.match(bkSrc, /windowDays = 3, characters = \[\]/);
  assert.match(bkSrc, /Date\.UTC\(anchor\.year/);
  assert.match(bkSrc, /ecs\.some\(x => allowed\.has\(x\)\)/);
  assert.match(src, /timelineWindowDays/);
});
test('v3.121 时间倒退保留诊断证据', () => {
  assert.match(src, /this\._timeWentBack = \{/);
  assert.match(src, /timeWentBack: this\._timeWentBack/);
});

test('v3.123 时间变化覆盖状态、关系、物品并隔离聊天与 swipe', () => {
  assert.match(src, /status:change/); assert.match(mlSrc, /pair:change/); assert.match(src, /items:change/);
  assert.match(src, /_timelineCursorChatId/); assert.match(src, /_timelineCursorFingerprint/);
});

test('v3.123 时间变化候选继续走统一候选池', () => {
  assert.match(src, /const _castForChanges = this\.captureCast\(\)/);
  assert.match(src, /_timelineChangeFloor = _currentTimeFloor/);
});

test('v3.124 echo 合并必须保留变化驱动候选池而非只保留普通召回', () => {
  const start = src.indexOf('if (this.config.config.echoEnabled)');
  const end = src.indexOf('// [v3.16] 世界推进', start);
  assert.ok(start >= 0 && end > start);
  const block = src.slice(start, end);
  assert.match(block, /for \(const r of candidateItems\) merged\.set/);
  assert.doesNotMatch(block, /for \(const r of recalled\) merged\.set/);
});

test('v3.125 变化候选精选后进入追踪与注入构建', () => {
  const selectAt = src.indexOf('const selRes = await this.aiSelect.route');
  const trackAt = src.indexOf('this._lastSelectedIds = Array.from', selectAt);
  const buildAt = src.indexOf('this.buildInjection(candidateItems)', trackAt);
  assert.ok(selectAt >= 0 && trackAt > selectAt && buildAt > trackAt);
});

test('v3.127 状态/关系/物品变化候选进入候选池前统一去重', () => {
  assert.match(src, /const _seenAny = new Set\(candidateItems\.flatMap/);
  assert.match(src, /const _pushChange = \(arr\) => \{/);
  // 三路都必须经过去重器，不得再直推候选池
  assert.match(src, /const _addedStatus = _pushChange\(_statusChanges\)/);
  assert.match(src, /const _addedPair = _pushChange\(_pairChanges\)/);
  assert.match(src, /const _addedItem = _pushChange\(_itemChanges\)/);
  assert.doesNotMatch(src, /for \(const _c of \(this\.status\?\.getChangesSince\?\.\(_timeCursor, _castForChanges, 8\) \|\| \[\]\)\) candidateItems\.push\(_c\)/);
  assert.doesNotMatch(src, /for \(const _c of \(this\.pairMem\?\.getChangesSince\?\.\(_timeCursor, _castForChanges, 6\) \|\| \[\]\)\) candidateItems\.push\(_c\)/);
});

test('v3.127 变化注入产量与游标对诊断可见', () => {
  assert.match(src, /this\._lastChangeTrace = \{/);
  assert.match(src, /_lastChangeTrace = null/);
  // 日记产量并入同一轨迹
  assert.match(src, /diary: \{ found: _changes\.length, added: _addedDiary, cursor: _cursor \}/);
  // 设置面板暴露变化注入诊断（含游标与时间倒跳）
  const ui = readFileSync(`${REPO_ROOT}/settings-ui.js`, 'utf8');
  assert.match(ui, /_lastChangeTrace/);
  assert.match(ui, /变化注入（Horae\/HCDiary 诊断）/);
  assert.match(ui, /_timelineInjectFloor/);
  assert.match(ui, /_timeWentBack/);
});
