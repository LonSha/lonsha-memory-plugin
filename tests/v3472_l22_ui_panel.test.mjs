/**
 * v3.472.0 — L22 UI 面板：可访问性 / 未保存改动 / 健康页出口
 *
 * 背景：`settings-ui.js` 的面板骨架此前是「一个 div + 一句 remove()」。
 *   具体形态（修前实测）：
 *     ① 关闭 = `document.getElementById(id)?.remove()`，未保存改动静默丢弃；
 *     ② 每条面板在 document 上挂 keydown 却从不退订 → 开过的面板越多，僵尸处理器越多；
 *     ③ 页签只切 `.active` 类，`aria-selected` 永远停在初始值，读屏软件报错当前页；
 *     ④ 五个页签按钮全部可 Tab 聚焦，键盘用户要按五次才能离开页签条；
 *     ⑤ 关闭键是 `<span>`，键盘永远到达不了；
 *     ⑥ 十八项 R22 读数在内核里跑、在诊断里查，但设置面板里没有任何出口。
 *
 * 本文件锁住六件事的可观测形态，而不是「有没有写这段代码」：
 *   T1 未保存计数读**控件现值**（读 config 会恒为 0 —— 指示器撒谎）
 *   T2 关窗退订监听 + 归还焦点
 *   T3 弹层语义：role=dialog / aria-modal / 关闭键是 button / Esc
 *   T4 页签语义双向自洽（每个 tab 有 pane，每个 pane 有 tab）+ aria-selected 真同步
 *   T5 键盘：方向键切页签 + Tab 焦点陷阱
 *   T6 健康页：五态面 + 十八项读数有出口 + 读不到不等于 0
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/* [v3.472.0] 审计基建一律从唯一真源 import：本档首稿在本地重写了 stripComments 与 bodyOf，
 *   被 scan_audit_lib_consolidation 的 E1 结构面当场点红（「仍在本地重写 stripComments / bodyOf」）。
 *   替换前已逐 marker 对照：真源 bodyOf 在本档 5 个 marker 上与本地实现输出逐字相同（1313/485/5391/746/4653 字），
 *   故这是**换真源不是降判据**；stripComments 换成真源是变强（真源认字符串与正则字面量，本地版不认）。 */
import { stripComments, bodyOf } from '../tests/_audit_lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sui = fs.readFileSync(path.join(root, 'settings-ui.js'), 'utf8');

/** 取设置面板 makeSheet 调用的整段（到下一个顶层常量声明为止）。 */
function settingsCall(src) {
  const at = src.indexOf("makeSheet('lonsha-settings-overlay'");
  assert.ok(at > 0, '设置面板必须走 makeSheet');
  const end = src.indexOf('const PROFILE_HELP', at);
  assert.ok(end > at, '抓不到设置面板 makeSheet 调用的边界');
  return src.slice(at, end);
}

/** 取一个具名函数的函数体。**不是第二份实现**：真正做花括号配对的是真源 bodyOf/braceMatch，
 *   这里只补回原判据需要的「找不到就真红」那一层断言（真源按设计不抛，找不到返回 null）。
 *   名字刻意不以 bodyOf 开头：E1 的 helperRe 是 `bodyOf[0-9A-Za-z_$]*`，同前缀也会被点名。 */
const _panelBody = (src, marker) => {
  const b = bodyOf(src, marker);
  assert.ok(b, '找不到函数体：' + marker);
  return b;
};

test('T1 未保存计数读控件现值，而不是读 config', () => {
  const body = _panelBody(sui, 'const _dirtyNow = () =>');
  /* 正面：必须逐类取控件现值。 */
  for (const sel of ['[data-cfg]', '[data-cfg-num]', '[data-cfg-text]']) {
    assert.ok(body.includes(sel), '_dirtyNow 必须比较 ' + sel + ' 的现值');
  }
  /* 反面：不得再拿 config 与快照比。修前的写法是
   *   const cur = this.engine.config.config; for (const k of Object.keys(cur)) ...
   *   这条路径恒为 0，因为控件在点保存前不写 config。 */
  assert.ok(!/this\.engine\.config\.config/.test(body),
    '_dirtyNow 不得读 this.engine.config.config：控件保存前不写 config，读数会恒为 0');
  /* 反面：不得用整表深比较。 */
  assert.ok(!/Object\.keys\(cur\)/.test(body), '_dirtyNow 不得整表遍历 config 键');
});

test('T2 关窗退订监听并归还焦点', () => {
  const body = _panelBody(sui, 'const closeOverlay = (id) =>');
  assert.match(body, /removeEventListener\('keydown'/, '关窗必须退订 document keydown');
  assert.match(body, /_lsButtonGuard/, '关窗必须断开 MutationObserver');
  assert.match(body, /_lsRestoreFocus/, '关窗必须归还焦点');
  assert.match(body, /disconnect\(\)/, 'MutationObserver 必须 disconnect');
  /* 退订必须在 remove() 之前，否则拿不到引用也无从退订。 */
  const iRm = body.indexOf('.remove()');
  const iOff = body.indexOf('removeEventListener');
  assert.ok(iOff > 0 && iRm > iOff, '退订必须先于 remove()');
});

test('T3 弹层语义：dialog / aria-modal / 关闭键是 button / Esc', () => {
  const body = _panelBody(sui, 'const makeSheet = (id, title, bodyHTML, opts) =>');
  assert.match(body, /role="dialog"/, '弹层必须有 role=dialog');
  assert.match(body, /aria-modal="true"/, '弹层必须声明 aria-modal');
  assert.match(body, /<button type="button" class="lonsha-sheet-close" aria-label="关闭"/,
    '关闭键必须是 <button> 且带可读名（修前是 <span>，键盘到达不了）');
  assert.match(body, /e\.key === 'Escape'/, '必须响应 Esc');
  /* Esc 走的是同一个关闭裁决入口，不能绕过 beforeClose。 */
  const escAt = body.indexOf("e.key === 'Escape'");
  const tail = body.slice(escAt, escAt + 200);
  assert.match(tail, /tryClose\(\)/, 'Esc 必须走 tryClose()，不得直接 remove()');
});

test('T4 页签语义双向自洽，aria-selected 真同步', () => {
  const tabs = [...sui.matchAll(/role="tab"[^>]*data-tab="([a-z]+)"/g)].map((m) => m[1]);
  const panes = [...sui.matchAll(/role="tabpanel"[^>]*data-tab-pane="([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(tabs.length >= 5, '页签数量异常：' + tabs.length);
  assert.deepEqual([...tabs].sort(), [...panes].sort(),
    '每个 tab 必须有一个同名的 pane，反之亦然。tabs=' + tabs.join(',') + ' panes=' + panes.join(','));
  /* aria-controls 必须指向真实存在的 pane id。 */
  const controls = [...sui.matchAll(/role="tab"[^>]*aria-controls="([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.equal(controls.length, tabs.length, '每个 tab 都要 aria-controls');
  for (const id of controls) assert.ok(sui.includes('id="' + id + '"'), 'aria-controls 指向不存在的 id: ' + id);
  /* 点击后必须同步 aria-selected 与 roving tabindex，不能只切类。 */
  const sync = _panelBody(sui, 'const _syncTabs = (activeBtn) =>');
  assert.match(sync, /setAttribute\('aria-selected'/, '切页签必须同步 aria-selected');
  assert.match(sync, /setAttribute\('tabindex'/, '切页签必须做 roving tabindex');
  /* 反面：不得再出现「只切 .active 类」的旧处理器。 */
  assert.ok(!/forEach\(b => b\.classList\.toggle\('active', b === btn\)\)/.test(sui),
    '旧的「只切类」页签处理器必须已被 _syncTabs 取代');
});

test('T5 键盘：方向键切页签 + Tab 焦点陷阱', () => {
  const body = _panelBody(sui, 'const makeSheet = (id, title, bodyHTML, opts) =>');
  for (const k of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
    assert.ok(body.includes("'" + k + "'"), '页签必须支持 ' + k);
  }
  assert.match(body, /e\.key !== 'Tab'/, '必须处理 Tab 以做焦点陷阱');
  assert.match(body, /e\.shiftKey/, '焦点陷阱必须区分 Shift+Tab 方向');
  assert.match(body, /offsetParent === null/, '焦点陷阱必须排除不可见元素');
  /* 方向键也要真的激活页签，不能只移焦点。 */
  const arrowAt = body.indexOf("e.key === 'ArrowRight'");
  assert.match(body.slice(arrowAt, arrowAt + 900), /\.click\(\)/, '方向键必须激活页签（click），不能只移焦点');
});

test('T6 健康页：五态面 + 十八项读数有出口 + 读不到不等于 0', () => {
  /* 页签存在且指向 pane。 */
  assert.match(sui, /data-tab="health"/, '必须有「记忆健康」页签');
  /* 出口容器齐全。 */
  for (const id of ['ls-health-grid', 'ls-health-summary', 'ls-health-capsule', 'ls-health-future', 'ls-health-refresh', 'ls-health-dev-body']) {
    assert.ok(sui.includes('id="' + id + '"'), '健康页缺少出口容器 #' + id);
  }
  /* 读数源必须是引擎真方法，不能自己编数。 */
  const render = _panelBody(sui, 'const renderHealth = () =>');
  assert.match(render, /r22ProductReadout\(\)/, '健康页必须取 r22ProductReadout()');
  /* 刷新要跨「渲染」与「刷新按钮」两段看：文件级读数必须由 UI 能触发，
   *   否则健康页永远停在首屏那一次 pending —— 用户点刷新也没用。 */
  const hAt = sui.indexOf('const _hRefresh');
  assert.ok(hAt > 0, '健康页必须有刷新按钮接线');
  assert.match(sui.slice(hAt, hAt + 900), /r22LoadFileReadings/, '健康页必须能触发文件级读数刷新（刷新按钮接线）');
  /* 三态纪律：内核 level 必须映射成**互不相同**的面。
   *   这里不能在 render 全文里找 'warning' / 'critical' 字样 —— 反向证伪实测过：
   *   把 _faceOfLevel 整个换成 () => 'ok'（三态塌成一态）后，这两个词
   *   仍然出现在摘要的 items.filter 里，全文搜索照样通过 = 假绿。
   *   口径改为：只看 _faceOfLevel 自己的箭头函数体，逐个 level 落到哪个面。 */
  const lm = /const _faceOfLevel = \(lv\) =>([^;]+);/.exec(render);
  assert.ok(lm, '必须有 _faceOfLevel 映射');
  const mapBody = lm[1];
  assert.match(mapBody, /'warning'\s*\?\s*'warn'/, 'warning 必须映射到 warn 面');
  assert.match(mapBody, /'critical'\s*\?\s*'crit'/, 'critical 必须映射到 crit 面');
  /* 兜底面不得是 ok：ok 表示「查过且正常」，读不到必须有自己的面。 */
  const fallback = /:\s*'([a-z]+)'\s*$/.exec(mapBody);
  assert.ok(fallback, '映射必须有兜底分支');
  assert.notEqual(fallback[1], 'ok', '兜底面不得是 ok：读不到 ≠ 正常');
  assert.ok(!/_faceOfLevel = \(lv\) =>\s*'ok'/.test(render), '不得把所有 level 一律映射成 ok');

  /* 读不到 ≠ 0：摘要必须**三条分支并存**，且「读不到」这条独立成句。
   *   反向证伪实测：只删掉 unk 分支时，render 里别处还有「读不到：」字样
   *   （胶囊/伏笔的降级文案），全文搜索照样通过 = 假绿。
   *   口径改为：只看 sum.textContent 的赋值三分支。 */
  const sumAt = render.indexOf('if (sum) {');
  assert.ok(sumAt > 0, '必须有摘要段');
  const sumBody = render.slice(sumAt, render.indexOf('if (capEl)', sumAt));
  const branches = (sumBody.match(/sum\.textContent\s*=/g) || []).length;
  assert.ok(branches >= 3, '摘要必须有「有问题 / 读不到 / 没问题」三条分支，实际 ' + branches);
  assert.match(sumBody, /读不到/, '摘要必须能说出「读不到」这第三种答案');
  assert.match(sumBody, /需要看一眼/, '摘要必须能说出「有问题」');
  assert.match(sumBody, /未发现/, '摘要必须能说出「没问题」');
  assert.ok(!/String\(items\.length\)/.test(sumBody), '摘要不得把条数当作「读不到」的替身');
});

test('T8 底栏固定：保存键常驻，不再沉在页面最底部', () => {
  const body = _panelBody(sui, 'const makeSheet = (id, title, bodyHTML, opts) =>');
  assert.match(body, /footerHTML/, 'makeSheet 必须支持固定底栏');
  assert.match(body, /ls-dirtybar/, '固定底栏必须有容器');
  const call = settingsCall(sui);
  assert.match(call, /footerHTML:/, '设置面板必须使用固定底栏');
  assert.match(call, /id="ls-save"/, '保存键必须在固定底栏里');
  assert.match(call, /id="ls-dirty-count"/, '底栏必须显示未保存计数');
  assert.match(call, /id="ls-dirty-reset"/, '底栏必须有还原');
  /* 反面：保存键不得再从 body 模板里生成（否则会出现两个 #ls-save）。 */
  const saveIds = (sui.match(/id="ls-save"/g) || []).length;
  assert.equal(saveIds, 1, 'id="ls-save" 必须唯一，实际 ' + saveIds + ' 个');
});

test('T9 关闭确认用面板内确认条，不用原生 confirm', () => {
  const call = settingsCall(sui);
  assert.match(call, /beforeClose:/, '设置面板必须接管关闭裁决');
  assert.match(call, /ls-confirm-inline/, '必须用面板内确认条');
  /* 反面：关闭路径不得调原生 confirm —— 不可样式化、移动端体验差。
   *   必须在**剥注释后**的文本上判，且不能只看 confirm( 字样：
   *   面板自己的元素 id 就叫 ls-confirm-back / ls-confirm-drop，
   *   任何宽松的 /confirm/ 匹配都会把它当成调用点，形成假红。
   *   口径：只认「真的作为函数被调用」的形态 —— window.confirm( 或裸 confirm(。 */
  const callCode = stripComments(call);
  assert.ok(!/window\s*\.\s*confirm\s*\(/.test(callCode), '关闭裁决不得调 window.confirm()');
  assert.ok(!/(^|[^.\w$])confirm\s*\(/.test(callCode), '关闭裁决不得调裸 confirm()');
  /* 确认条两个按钮都必须存在，且「回去保存」是默认安全项。 */
  assert.match(call, /ls-confirm-back/, '确认条必须有「回去保存」');
  assert.match(call, /ls-confirm-drop/, '确认条必须有「放弃」');
  assert.match(call, /_confirming = false/, '确认态必须能在返回后复位，否则第二次关闭永不提示');
});

test('T10 还原是原地回填，不重建面板', () => {
  const at = sui.indexOf('const _resetBtn');
  assert.ok(at > 0, '必须有还原按钮接线');
  const seg = sui.slice(at, at + 2400);
  assert.match(seg, /_syncDirty\(\)/, '还原后必须刷新未保存计数');
  /* 反面：不得关窗重建 —— 重建会丢当前页签，且在用户眼里像「被弹回首页」。 */
  assert.ok(!/closeOverlay\('lonsha-settings-overlay'\)[\s\S]{0,200}?plugin\.showSettingsPanel\(\)/.test(seg),
    '还原不得关窗重建面板（会丢当前页签）');
});
