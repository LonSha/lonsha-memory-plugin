// tests/v314_extract_roles.test.mjs
// v3.14 从世界书提取角色测试（收编 zhino A5.2.1）
// 双模式：行为实测（解析/过滤/别名补入/新节点）+ 静态断言（入口/按钮/配置）
import { readFileSync } from 'fs';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');
// [v3.184] 提取提示词填充改走 fuzzy-patch（占位符宽容匹配）。本测试用 new Function 抽方法体
//   执行，方法体现在引用 _moduleLib 取库 —— 故必须把取库口一起注入，否则抽取体里 _moduleLib 未定义。
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const FP_LIB = _require('../fuzzy-patch.js');
// 抽取体写 self 读数的落点（模块级共享，各 TC 块都能用）
const __readSink = {};
const sui = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf-8');
let pass = 0;
const ok = (m) => { pass++; console.log('ok: ' + m); };
const fail = (m) => { console.error('FAIL: ' + m); process.exit(1); };

// ─── extractRolesFromLore 逻辑测试（mock 引擎上下文）───
// 从源码抽 extractRolesFromLore 方法体，注入 mock llm/config/window 行为级验证
const m1 = src.match(/    async extractRolesFromLore\(\) \{[\s\S]*?\n    \}\n/);
if (!m1) fail('未找到 extractRolesFromLore 方法体');
const m2 = src.match(/    applyExtractedRoles\(roles\) \{[\s\S]*?\n    \}\n/);
if (!m2) fail('未找到 applyExtractedRoles 方法体');

// TC1: 世界书空 → 返回空数组（不触发 llm 调用）
{
  const conf = { extractRolesPrompt: '{{LORE}} {{ROLE_COUNT}}', extractRolesLimit: 50 };
  let called = false;
  // [v3.184] 提示词填充改走 fuzzy-patch 后，方法体会写 self 读数（this._promptFillReadRoles）。
  //   抽取体在 new Function 里执行，`this` 是 undefined —— 不映射就会在填充成功后立刻抛
  //   TypeError，被方法自身的 catch 吞掉并返回 []，表现为「解析数 0」的假失败（本轮踩到）。
  const fnBody = m1[0]
    .replace(/this\.config\.config/g, 'conf')
    .replace(/this\.llm\.callAPI\(prompt\)/g, '__llmMock(prompt)')
    .replace(/this\._promptFillReadRoles\s*=\s*(\{[^\n]*?\})\s*;/g, '__readSink.last = $1;')
    .replace(/sanitizeJson\(json\)/g, 'json');
  const extractor = new Function('conf', '__llmMock', 'window', 'errLog', '_moduleLib', '__readSink', `
    ${fnBody.replace(/    async extractRolesFromLore\(\) \{/, 'async function extractRolesFromLore() {')}
    return extractRolesFromLore;
  `)(conf, async () => { called = true; return '[]'; }, { SillyTavern: { getContext: () => ({ lore: [] }) } }, () => {}, () => FP_LIB, __readSink);
  const r = await extractor();
  if (r.length !== 0) fail('TC1');
  if (called) fail('TC1 不应调用 llm');
  ok('TC1: 世界书空返回空数组且不调用 LLM');
}
// TC2: LLM 返回 ```json 围栏 → 正确解析（直接注入 llm 返回值）
{
  const lore = [{ key: 'Natsuki', comment: '夏木', content: '夏木是主角的恋人，昵称小夏。' }];
  // 用可控 llm 返回值验证 extractRolesFromLore
  const conf = { extractRolesPrompt: '{{LORE}} {{ROLE_COUNT}}', extractRolesLimit: 50 };
  let llmResult = '```json\n[{"name":"夏木","aliases":["小夏","Natsuki"]},{"name":"路人甲","aliases":[]}]\n```';
  // [v3.184] 提示词填充改走 fuzzy-patch 后，方法体会写 self 读数（this._promptFillReadRoles）。
  //   抽取体在 new Function 里执行，`this` 是 undefined —— 不映射就会在填充成功后立刻抛
  //   TypeError，被方法自身的 catch 吞掉并返回 []，表现为「解析数 0」的假失败（本轮踩到）。
  const fnBody = m1[0]
    .replace(/this\.config\.config/g, 'conf')
    .replace(/this\.llm\.callAPI\(prompt\)/g, '__llmMock(prompt)')
    .replace(/this\._promptFillReadRoles\s*=\s*(\{[^\n]*?\})\s*;/g, '__readSink.last = $1;')
    .replace(/sanitizeJson\(json\)/g, 'json');
  const extractor = new Function('conf', '__llmMock', 'window', 'errLog', '_moduleLib', '__readSink', `
    ${fnBody.replace(/    async extractRolesFromLore\(\) \{/, 'async function extractRolesFromLore() {')}
    return extractRolesFromLore;
  `)(conf, async () => llmResult, { SillyTavern: { getContext: () => ({ lore }) } }, () => {}, () => FP_LIB, __readSink);
  const r = await extractor();
  if (r.length !== 2) fail('TC2 解析数: ' + JSON.stringify(r));
  if (r[0].name !== '夏木') fail('TC2 name');
  if (r[0].aliases.length !== 2 || !r[0].aliases.includes('小夏')) fail('TC2 aliases');
  // 无效项（空 aliases 的路人甲应保留 name 但 aliases 空数组）
  if (r[1].aliases.length !== 0) fail('TC2 aliases empty');
  // [v3.184] 占位符填充必须真经 fuzzy-patch 落（读数落点有值即证明走了新路径）；
  //   只验返回值不够：填充静默没跑时返回值照样可能对。
  if (!__readSink.last || __readSink.last.site !== 'roles' || !(__readSink.last.applied >= 2)) fail('TC2 占位符未经宽容填充: ' + JSON.stringify(__readSink.last));
  if (__readSink.last.leftover && __readSink.last.leftover.length) fail('TC2 占位符残留: ' + JSON.stringify(__readSink.last.leftover));
  ok('TC2: ```json 围栏解析 + 别名清洗 + 占位符经宽容匹配填充');
}
// TC2b: LLM 返回裸 JSON（无围栏）也能解析
{
  const conf = { extractRolesPrompt: '{{LORE}} {{ROLE_COUNT}}', extractRolesLimit: 50 };
  const lore = [{ key: 'k1', comment: '甲', content: '甲' }];
  let llmResult = '[{"name":"甲","aliases":[]}]';
  // [v3.184] 提示词填充改走 fuzzy-patch 后，方法体会写 self 读数（this._promptFillReadRoles）。
  //   抽取体在 new Function 里执行，`this` 是 undefined —— 不映射就会在填充成功后立刻抛
  //   TypeError，被方法自身的 catch 吞掉并返回 []，表现为「解析数 0」的假失败（本轮踩到）。
  const fnBody = m1[0]
    .replace(/this\.config\.config/g, 'conf')
    .replace(/this\.llm\.callAPI\(prompt\)/g, '__llmMock(prompt)')
    .replace(/this\._promptFillReadRoles\s*=\s*(\{[^\n]*?\})\s*;/g, '__readSink.last = $1;')
    .replace(/sanitizeJson\(json\)/g, 'json');
  const extractor = new Function('conf', '__llmMock', 'window', 'errLog', '_moduleLib', '__readSink', `
    ${fnBody.replace(/    async extractRolesFromLore\(\) \{/, 'async function extractRolesFromLore() {')}
    return extractRolesFromLore;
  `)(conf, async () => llmResult, { SillyTavern: { getContext: () => ({ lore }) } }, () => {}, () => FP_LIB, __readSink);
  const r = await extractor();
  if (r.length !== 1 || r[0].name !== '甲') fail('TC2b: ' + JSON.stringify(r));
  ok('TC2b: 裸 JSON 无围栏解析');
}
// TC2c: LLM 返回非法 JSON → 不崩溃返回空
{
  const conf = { extractRolesPrompt: '{{LORE}} {{ROLE_COUNT}}', extractRolesLimit: 50 };
  const lore = [{ key: 'k1', comment: '甲', content: '甲' }];
  let llmResult = '这不是JSON';
  // [v3.184] 提示词填充改走 fuzzy-patch 后，方法体会写 self 读数（this._promptFillReadRoles）。
  //   抽取体在 new Function 里执行，`this` 是 undefined —— 不映射就会在填充成功后立刻抛
  //   TypeError，被方法自身的 catch 吞掉并返回 []，表现为「解析数 0」的假失败（本轮踩到）。
  const fnBody = m1[0]
    .replace(/this\.config\.config/g, 'conf')
    .replace(/this\.llm\.callAPI\(prompt\)/g, '__llmMock(prompt)')
    .replace(/this\._promptFillReadRoles\s*=\s*(\{[^\n]*?\})\s*;/g, '__readSink.last = $1;')
    .replace(/sanitizeJson\(json\)/g, 'json');
  const extractor = new Function('conf', '__llmMock', 'window', 'errLog', '_moduleLib', '__readSink', `
    ${fnBody.replace(/    async extractRolesFromLore\(\) \{/, 'async function extractRolesFromLore() {')}
    return extractRolesFromLore;
  `)(conf, async () => llmResult, { SillyTavern: { getContext: () => ({ lore }) } }, () => {}, () => FP_LIB, __readSink);
  const r = await extractor();
  if (r.length !== 0) fail('TC2c: ' + JSON.stringify(r));
  ok('TC2c: 非法 JSON 容错返回空');
}
// TC3: 新角色入图 + 无效项（空 name）在上游 extract 已过滤，apply 对合法角色正常写入
{
  // extract 过滤：空 name / 空格名被滤掉
  const conf = { extractRolesPrompt: '{{LORE}} {{ROLE_COUNT}}', extractRolesLimit: 50 };
  const lore = [{ key: 'k1', comment: '甲', content: '甲' }];
  let llmResult = '[{"name":"甲","aliases":["阿甲"]},{"name":"   ","aliases":[]},{"name":"","aliases":[]}]';
  // [v3.184] 提示词填充改走 fuzzy-patch 后，方法体会写 self 读数（this._promptFillReadRoles）。
  //   抽取体在 new Function 里执行，`this` 是 undefined —— 不映射就会在填充成功后立刻抛
  //   TypeError，被方法自身的 catch 吞掉并返回 []，表现为「解析数 0」的假失败（本轮踩到）。
  const fnBody = m1[0]
    .replace(/this\.config\.config/g, 'conf')
    .replace(/this\.llm\.callAPI\(prompt\)/g, '__llmMock(prompt)')
    .replace(/this\._promptFillReadRoles\s*=\s*(\{[^\n]*?\})\s*;/g, '__readSink.last = $1;')
    .replace(/sanitizeJson\(json\)/g, 'json');
  const extractor = new Function('conf', '__llmMock', 'window', 'errLog', '_moduleLib', '__readSink', `
    ${fnBody.replace(/    async extractRolesFromLore\(\) \{/, 'async function extractRolesFromLore() {')}
    return extractRolesFromLore;
  `)(conf, async () => llmResult, { SillyTavern: { getContext: () => ({ lore }) } }, () => {}, () => FP_LIB, __readSink);
  const r = await extractor();
  if (r.length !== 1) fail('TC3 extract 过滤: ' + JSON.stringify(r));
  if (r[0].name !== '甲') fail('TC3 name');
  // apply 对新角色入图
  const g = { nodes: new Map() };
  const applier = new Function('findChar', 'addN', 'errLog', `
    ${m2[0].replace(/    applyExtractedRoles\(roles\) \{/, 'function applyExtractedRoles(roles) {').replace(/this\.graph\.findCharacterByName/g, 'findChar').replace(/this\.graph\.addNode/g, 'addN').replace(/this\.resolveCharacterName/g, '((n)=>n)')}
    return applyExtractedRoles;
  `)((n) => null, (n) => { g.nodes.set('n_' + g.nodes.size, { ...n, id: 'n_' + g.nodes.size }); }, () => {});
  const res = applier(r);
  if (res.added !== 1) fail('TC3 added: ' + JSON.stringify(res));
  if (g.nodes.size !== 1) fail('TC3 节点数');
  ok('TC3: extract 过滤无效项 + apply 新角色入图');
}
// TC4: 已有角色只补别名（不改主名，不进新节点）
{
  const node = { name: '夏木', data: { source: '[对话]', aliases: [] } };
  const called = { add: 0, find: 0 };
  const applier = new Function('findChar', 'addN', 'errLog', `
    ${m2[0].replace(/    applyExtractedRoles\(roles\) \{/, 'function applyExtractedRoles(roles) {').replace(/this\.graph\.findCharacterByName/g, 'findChar').replace(/this\.graph\.addNode/g, 'addN').replace(/this\.resolveCharacterName/g, '((n)=>n)')}
    return applyExtractedRoles;
  `)((n) => { called.find++; return node; }, (n) => { called.add++; return 'id'; }, () => {});
  const res = applier([{ name: '夏木', aliases: ['小夏', 'Natsuki'] }]);
  if (called.add !== 0) fail('TC4 不应新建节点');
  if (res.aliasPatched !== 1) fail('TC4 aliasPatched');
  if (!node.data.aliases.includes('小夏')) fail('TC4 别名未补入');
  if (node.name !== '夏木') fail('TC4 主名被改');
  ok('TC4: 已有角色只补别名，不动主名不入新节点');
}
// TC5: 重复别名去重
{
  const node = { name: 'A', data: { source: 'x', aliases: ['b'] } };
  const applier = new Function('findChar', 'addN', 'errLog', `
    ${m2[0].replace(/    applyExtractedRoles\(roles\) \{/, 'function applyExtractedRoles(roles) {').replace(/this\.graph\.findCharacterByName/g, 'findChar').replace(/this\.graph\.addNode/g, 'addN').replace(/this\.resolveCharacterName/g, '((n)=>n)')}
    return applyExtractedRoles;
  `)(() => node, () => {}, () => {});
  const res = applier([{ name: 'A', aliases: ['b', 'b', 'c'] }]);
  if (res.aliasPatched !== 1) fail('TC5');
  if (node.data.aliases.join(',') !== 'b,c') fail('TC5 去重失败: ' + node.data.aliases);
  ok('TC5: 重复别名去重（同批次也不重复入）');
}

// ─── 静态断言 ───
// ST1: 方法在 MemoryEngine 类内（feedThinking 之后）
{
  const fi = src.indexOf('feedThinking(thinking, floor) {');
  const ei = src.indexOf('async extractRolesFromLore() {');
  if (!(fi > 0 && ei > fi && ei < src.indexOf('class MemoryGraph {'))) fail('ST1 方法不在 MemoryEngine 类内');
  ok('ST1: extractRolesFromLore 在 MemoryEngine 类内');
}
// ST2: 配置项存在（extractRolesPrompt + extractRolesLimit）
{
  if (!src.includes('extractRolesPrompt:')) fail('ST2 prompt 缺失');
  if (!src.includes('extractRolesLimit:')) fail('ST2 limit 缺失');
  ok('ST2: 配置项 extractRolesPrompt/extractRolesLimit 已加');
}
// ST3: 预览面板按钮（settings-ui）
{
  if (!sui.includes('id="ls-extract-roles"')) fail('ST3 按钮缺失');
  if (!sui.includes('plugin.showExtractRoles')) fail('ST3 绑定缺失');
  if (!sui.includes('ls-extract-cb')) fail('ST3 勾选框缺失');
  if (!sui.includes('ls-extract-apply')) fail('ST3 确认按钮缺失');
  ok('ST3: 按钮+绑定+勾选预览+确认写入齐全');
}
// ST4: 写入后立即持久化（collectExport + storage.save）
{
  if (!sui.includes('engine.storage.save(chatId, engine.collectExport())')) fail('ST4 持久化缺失');
  ok('ST4: 写入后 collectExport + storage.save 即时持久化');
}
// ST5: 版本号已前进（>= v3.14）
{
  const vm = src.match(/const VERSION = '(\d+\.\d+\.\d+)'/);
  if (!vm) fail('ST5 未找到版本号');
  const [M, m, p] = vm[1].split('.').map(Number);
  if (!(M > 3 || (M === 3 && m > 14) || (M === 3 && m === 14 && p >= 0))) fail('ST5 版本号过低: ' + vm[1]);
  ok('ST5: 版本号已前进 (>=3.14.0): ' + vm[1]);
}

console.log(`\n✓ v3.14 从世界书提取角色测试全过 (${pass} 项)`);