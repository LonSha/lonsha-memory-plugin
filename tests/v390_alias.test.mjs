// [v3.90] 实体别名查询扩展专项测试（吸收 MyriadKnots entity-identity）
import { readFileSync } from 'fs';
import assert from 'assert';
const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf8');
const sui = readFileSync('/home/user/lonsha-memory-plugin/settings-ui.js', 'utf8');
const man = JSON.parse(readFileSync('/home/user/lonsha-memory-plugin/manifest.json', 'utf8'));

// ---------- 静态接线检查 ----------
assert.ok(src.includes('buildAliasMap()'), '别名映射构建方法在位');
assert.ok(src.includes('_expandAliases('), 'BM25 别名扩展方法在位');
assert.ok(src.includes('aliasQueryExpansion: true,  // [v3.90] 实体别名查询扩展'), 'config 默认值在位');
assert.ok(src.includes('aliasMap: query.aliases'), '召回管线传参在位');
assert.ok(src.includes('query?.aliases || null'), '前情选段传参在位');
assert.ok(sui.includes("ck('aliasQueryExpansion', '别名查询扩展'"), '设置开关在位');
assert.strictEqual(man.version, '3.90.0', 'manifest 版本 3.90.0');
assert.strictEqual(src.match(/const VERSION = '([^']+)'/)[1], '3.90.0', 'VERSION 与 manifest 同步');
console.log('✓ 静态接线检查通过');

// ---------- 方法提取（花括号计数，复用 v388 模式） ----------
function extractMethod(source, name) {
  const marker = name + '() {';
  const start = source.indexOf(marker);
  assert.ok(start > 0, `找到方法 ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0, end = -1;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return source.slice(start, end + 1);
}
const aliasMapSrc = extractMethod(src, 'buildAliasMap');
const bm25Src = src.slice(src.indexOf('class BM25 {'), src.indexOf('class BM25 {') + 6000);

// ---------- 测试 1: buildAliasMap 归一化 + 防碰撞 ----------
const graphNodes = new Map();
graphNodes.set('a', { type: 'character', name: '珞珈', data: { aliases: ['阿珈', '珈珈', '珞珈', 'x', '这是一条超过二十个字符的超级无敌长的伪别名用来测试上限剔除机制是否生效'] } });
graphNodes.set('b', { type: 'character', name: '珞花', data: { aliases: ['花花', '阿珈'] } });   // 阿珈 与珞珈的别名撞键：先到先得
graphNodes.set('c', { type: 'event', name: '事件', data: { aliases: ['事件别名'] } });            // 非 character 节点跳过
graphNodes.set('d', { type: 'character', name: '无别名', data: {} });
graphNodes.set('e', { type: 'character', name: 'Alice', data: { aliases: ['ＱＱ', '爱丽丝'] } });  // 全角别名 NFKC 归一后为 'qq'
const buildAliasMapObj = new Function('errLog', `return ({ ${aliasMapSrc} });`)(() => {});
const engine1 = { graph: { nodes: graphNodes } };
const amap = buildAliasMapObj.buildAliasMap.call(engine1);
assert.strictEqual(amap.get('阿珈'), '珞珈', '别名→主名（首写优先：珞珈在前）');
assert.strictEqual(amap.get('珈珈'), '珞珈');
assert.ok(!amap.has('珞珈'), '别名等于主名 → 剔除');
assert.ok(!amap.has('x'), '单字别名 → 剔除');
assert.ok(!amap.has('这是一条超过二十个字符的超级无敌长的伪别名用来测试上限剔除机制是否生效'), '超长伪别名 → 剔除');
assert.strictEqual(amap.get('花花'), '珞花');
assert.ok(!amap.has('事件别名'), '非 character 节点不入映射');
assert.strictEqual(amap.get('qq'), 'Alice', '全角别名 NFKC 归一后入映射（键为归一形）');
assert.ok(!amap.has('alice'), '别名与主名归一后相同（Alice vs alice）→ 剔除');
console.log('✓ 测试 1: buildAliasMap 归一化 + 防碰撞');

// ---------- 测试 2: BM25 _expandAliases 文本层扩展 ----------
function extractInRange(source, name) {
  const idx = source.indexOf(name + '(');
  assert.ok(idx > 0, `找到 ${name}`);
  const bodyStart = source.indexOf('{', idx);
  let depth = 0, end = -1;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return source.slice(idx, end + 1);
}
const tokenSrc = extractInRange(src.slice(src.indexOf('class BM25 {')), '_tokenize');
const expandSrc = extractInRange(src.slice(src.indexOf('class BM25 {')), '_expandAliases');
const bmObj = new Function(`return ({ ${tokenSrc}, ${expandSrc} });`)();
const amap2 = new Map([['阿珈', '珞珈'], ['alice', '爱丽丝原主名']]);
assert.strictEqual(bmObj._expandAliases('阿珈今天心情怎么样', amap2), '阿珈今天心情怎么样 珞珈', '命中别名 → 附加主名');
assert.strictEqual(bmObj._expandAliases('Ａｌｉｃｅ去哪了', amap2), 'Ａｌｉｃｅ去哪了 爱丽丝原主名', '全角文本经归一化副本命中');
assert.strictEqual(bmObj._expandAliases('完全无关内容', amap2), '完全无关内容', '未命中 → 原样返回');
assert.strictEqual(bmObj._expandAliases('任意文本', null), '任意文本', '空映射 → 原样');
console.log('✓ 测试 2: BM25 _expandAliases 文本层扩展');

// ---------- 测试 3: 端到端——别名扩展让主名记忆被召回 ----------
const bm25ClsStart = src.indexOf('class BM25 {');
let depth3 = 0, end3 = -1;
for (let i = src.indexOf('{', bm25ClsStart); i < src.length; i++) {
  if (src[i] === '{') depth3++;
  else if (src[i] === '}') { depth3--; if (depth3 === 0) { end3 = i; break; } }
}
const BM25Ctor = new Function('BM25_dummy', `
  const cls = ${JSON.stringify(src.slice(bm25ClsStart, end3 + 1))};
  const factory = new Function(cls + '; return BM25;');
  return factory();
`)();
const engine3 = new BM25Ctor();
// d1 只含主名不含场景词，d2 只含场景词不含主名 → 别名扩展是 d1 被召回的唯一通路
engine3.rebuild([
  { id: 'd1', text: '珞珈站在窗边发呆了很久', floor: 1, source: 'bm25' },
  { id: 'd2', text: '图书馆里今天人很多', floor: 2, source: 'bm25' },
  { id: 'd3', text: '晚饭吃了火锅很满足', floor: 3, source: 'bm25' },
]);
const amap3 = new Map([['阿珈', '珞珈']]);
// 查询「阿珈在图书馆」二元切分 = 阿珈/珈在/在图/图书/书馆
//   无扩展：与 d1（珞珈/珈站/站在/…）无 token 交集 → d1 召不回，只有 d2 命中
//   有扩展：命中别名「阿珈」→ 文本层附加主名「珞珈」→ bigram 珞珈 命中 d1
const branch3 = [{ key: 'latestUser', text: '阿珈在图书馆', weight: 1 }];
const noExpand = engine3.searchBranches(branch3, 5, {});
const withExpand = engine3.searchBranches(branch3, 5, { aliasMap: amap3 });
const hitNo = noExpand.find(d => d.id === 'd1');
const hitWith = withExpand.find(d => d.id === 'd1');
assert.ok(!hitNo || hitNo.score === 0, '无扩展：主名记忆 d1 召不回（别名与主名 bigram 无交集）');
assert.ok(noExpand.some(d => d.id === 'd2'), '无扩展：场景词记忆 d2 正常命中（对照组，证明索引可用）');
assert.ok(hitWith && hitWith.score > 0, '有扩展：主名记忆 d1 被召回');
console.log(`  无扩展命中: [${noExpand.map(d => d.id).join(',')}] | 有扩展命中: [${withExpand.map(d => d.id).join(',')}]`);
console.log('✓ 测试 3: 端到端别名扩展召回主名记忆');

// ---------- 测试 4: 开关关闭 → 无扩展行为 ----------
const engine4ctx = { config: { config: { aliasQueryExpansion: false } }, graph: { nodes: graphNodes }, extractCharactersFromContext: () => [] };
const buildQSrc = (function extractNamed(source, name, param) {
  const marker = name + '(' + param + ') {';
  const start = source.indexOf(marker);
  assert.ok(start > 0, `找到方法 ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0, end = -1;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return source.slice(start, end + 1);
})(src, 'buildQuery', 'context');
const buildQueryObj = new Function('errLog', 'window', `return ({ ${buildQSrc} });`)(() => {}, { SillyTavern: { getContext: () => ({ chat: [], name1: '用户', name2: '珞珈' }) } });
const q = buildQueryObj.buildQuery.call(engine4ctx);
assert.strictEqual(q.aliases, null, '开关关闭 → buildQuery 不产出别名映射（null）');
console.log('✓ 测试 4: 开关关闭 → 无扩展行为');

// ---------- 测试 5: 开关开启但图谱空 → 空映射不炸 ----------
const engine5 = { config: { config: { aliasQueryExpansion: true } }, graph: null, buildAliasMap: buildAliasMapObj.buildAliasMap, extractCharactersFromContext: () => [] };
const q5 = buildQueryObj.buildQuery.call(engine5);
assert.ok(q5.aliases instanceof Map, '图谱缺失容灾 → 返回空 Map');
assert.strictEqual(q5.aliases.size, 0, '空映射');
// 开关开启 + 图谱有别名 → 映射正常产出（正向对照）
const engine5b = { config: { config: { aliasQueryExpansion: true } }, graph: { nodes: graphNodes }, buildAliasMap: buildAliasMapObj.buildAliasMap, extractCharactersFromContext: () => [] };
const q5b = buildQueryObj.buildQuery.call(engine5b);
assert.strictEqual(q5b.aliases.get('阿珈'), '珞珈', '开关开启 → 别名映射进入 query');
console.log('✓ 测试 5: 图谱空容灾 + 开关开启正向对照');

console.log('\nv3.90 专项测试 5/5 全部通过');
