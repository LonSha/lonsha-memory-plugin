/**
 * tests/v3183_crosslink.test.mjs — v3.183.0 条目关联（Aho-Corasick 多模式匹配）
 *
 * 覆盖：
 *   1. 基础命中：位置正确（code point 下标，中文不按 UTF-16 错位）
 *   2. 嵌套词：同时命中「珞珈」与「珞珈山」（AC 相对逐词 indexOf 的核心价值）
 *   3. fail 链：只出现后缀词也要命中；output 继承
 *   4. 过短词拒收，且**拒收要计数**（不静默吞）
 *   5. 停用词拒收（防通用词把所有条目串成一团）
 *   6. 幂等：重复登记不改指纹
 *   7. removeRef：引用消失后关键词自动出表
 *   8. maxHits 截断三态：hits 截了 / total 报真实数 / truncated 为真
 *   9. refsFor 去重
 *  10. loadFromNodes 适配 MemoryGraph.nodes
 *  11. 指纹：区分度 + 顺序无关 + 词间分隔（防 ab+c 与 a+bc 同指纹）
 *  12. 畸形输入不抛（null / 数字 / undefined）
 *  13. 只报告不写图的契约（scan 不改词表；无 DB 写入面）
 *  14. 性能：2000 词表 + 长文本
 *  15. 反向审计（负控制）：破坏真判据后行为必须可观测地改变
 *  16. 接线自证 + 版权纯度
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
// IIFE + CJS 双导出：必须用 require 取库（import 拿到的是空命名空间）。
const require = createRequire(import.meta.url);
const C = require(path.join(root, 'crosslink.js'));
let pass = 0;
const ok = (name, cond, extra) => {
  assert.ok(cond, extra ? name + ' — ' + extra : name);
  pass += 1;
};
const eq = (name, a, b) => {
  assert.equal(a, b, name + ` — 期望 ${JSON.stringify(b)}，实得 ${JSON.stringify(a)}`);
  pass += 1;
};

// ========== 1. 基础命中与位置 ==========
{
  const idx = C.createIndex();
  eq('1a 登记成功', idx.add('王玉兰', 'n1'), true);
  idx.add('筒子楼', 'n2');
  const r = idx.scan('王玉兰住在筒子楼里');
  eq('1b 命中两个词', r.hits.length, 2);
  eq('1c 首词位置 0', r.hits.find(h => h.keyword === '王玉兰').positions[0], 0);
  eq('1d 次词位置 5', r.hits.find(h => h.keyword === '筒子楼').positions[0], 5);
  eq('1e 未截断', r.truncated, false);
}
// 位置口径必须是 code point：代理对（emoji/罕见字）不能让后续位置整体偏移。
{
  const idx = C.createIndex();
  idx.add('玉兰', 'n1');
  const r = idx.scan('𝌆𝌆玉兰');   // 两个非 BMP 字符
  eq('1f 代理对后位置按 code point 算', r.hits[0].positions[0], 2);
}

// ========== 2. 嵌套词（AC 的核心场景） ==========
{
  const idx = C.createIndex();
  idx.add('珞珈', 'a');
  idx.add('珞珈山', 'b');
  const r = idx.scan('他去了珞珈山');
  const kws = r.hits.map(h => h.keyword).sort().join(',');
  eq('2a 长短词同时命中', kws, '珞珈,珞珈山');
  eq('2b 长词位置 3', r.hits.find(h => h.keyword === '珞珈山').positions[0], 3);
  eq('2c 长词排在前（越具体越优先）', r.hits[0].keyword, '珞珈山');
}

// ========== 3. fail 链 / output 继承 ==========
{
  const idx = C.createIndex({ minLength: 1 });
  idx.add('山', 'a');
  idx.add('珞山', 'b');
  const r = idx.scan('珞山脚下');
  const kws = r.hits.map(h => h.keyword).sort();
  // 精确比对（不能用字符串 includes：'珞山' 自带 '山'，只命中长词也会假绿）。
  ok('3a 后缀词命中', kws.includes('珞山'), kws.join(','));
  ok('3b 被包含的短词也命中（output 继承）', kws.includes('山'), kws.join(','));
}

// ========== 4. 过短词拒收且计数 ==========
{
  const idx = C.createIndex();
  eq('4a 单字词被拒', idx.add('门', 'x'), false);
  eq('4b 拒收计数为 1', idx.stats().rejected, 1);
  eq('4c 被拒词不进词表', idx.stats().keywords, 0);
  eq('4d 文本里的该字不命中', idx.scan('开门').hits.length, 0);
  eq('4e minLength 可放宽', C.createIndex({ minLength: 1 }).add('门', 'x'), true);
}

// ========== 5. 停用词 ==========
{
  const idx = C.createIndex({ stopwords: ['主角', '系统'] });
  eq('5a 停用词拒收', idx.add('主角', 'x'), false);
  eq('5b 停用词不进词表', idx.stats().keywords, 0);
  eq('5c 非停用词正常', idx.add('玉兰', 'y'), true);
  eq('5d 停用词计数可见', idx.stats().stopwords, 2);
  // 配置面板给的是逗号分隔**字符串**；按 Array.from 拆会得到单字停用词，
  // 于是「主角」照样进表（用户以为设了其实没设）。字符串必须按分隔符切。
  const idxS = C.createIndex({ stopwords: '主角,系统' });
  eq('5e 字符串停用词按逗号切（不是拆字）', idxS.stats().stopwords, 2);
  eq('5f 字符串停用词真的拦住通用词', idxS.add('主角', 'x'), false);
  eq('5g 字符串形式下正常词仍可登记', idxS.add('玉兰', 'y'), true);
  const idxS2 = C.createIndex({ stopwords: '主角，系统\n旁白' });
  eq('5h 中英文逗号与换行都当分隔符', idxS2.stats().stopwords, 3);
}

// ========== 6. 幂等 ==========
{
  const idx = C.createIndex();
  idx.add('玉兰', 'n1');
  const f1 = idx.stats().fingerprint;
  eq('6a 重复登记返回 false', idx.add('玉兰', 'n1'), false);
  eq('6b 指纹不变', idx.stats().fingerprint, f1);
  eq('6c 同词不同引用可登记', idx.add('玉兰', 'n2'), true);
}

// ========== 7. removeRef ==========
{
  const idx = C.createIndex();
  idx.add('玉兰', 'n1'); idx.add('玉兰', 'n2'); idx.add('筒子楼', 'n1');
  eq('7a 移除 2 条关联', idx.removeRef('n1'), 2);
  const r = idx.scan('玉兰在筒子楼');
  eq('7b 只剩另一引用', r.hits.length, 1);
  eq('7c 剩余引用正确', r.hits[0].refs.join(','), 'n2');
  eq('7d 引用全空后关键词出表', (idx.removeRef('n2'), idx.scan('玉兰').hits.length), 0);
  eq('7e 无效引用返回 0', idx.removeRef(''), 0);
}

// ========== 8. 截断三态 ==========
{
  const idx = C.createIndex({ maxHits: 2 });
  ['甲甲', '乙乙', '丙丙', '丁丁'].forEach((k, i) => idx.add(k, 'r' + i));
  const r = idx.scan('甲甲乙乙丙丙丁丁');
  eq('8a 截断到 2 条', r.hits.length, 2);
  eq('8b total 报真实数 4', r.total, 4);
  eq('8c truncated 为真', r.truncated, true);
  const r2 = C.createIndex({ maxHits: 9 }).scan('甲甲乙乙');
  eq('8d 未超限不报截断', r2.truncated, false);
}

// ========== 9. refsFor 去重 ==========
{
  const idx = C.createIndex();
  idx.add('玉兰', 'shared'); idx.add('筒子楼', 'shared');
  const refs = idx.refsFor('玉兰住筒子楼');
  eq('9a 去重后 1 个引用', refs.length, 1);
  eq('9b 引用正确', refs[0], 'shared');
}

// ========== 10. loadFromNodes ==========
{
  const idx = C.createIndex();
  const n = idx.loadFromNodes([{ id: 'x1', name: '王玉兰' }, { id: 'x2', name: '筒子楼' }, { name: '' }, null]);
  eq('10a 载入 2 个（空名/空节点跳过）', n, 2);
  eq('10b 用 id 作引用', idx.scan('王玉兰').hits[0].refs[0], 'x1');
  const idx2 = C.createIndex();
  idx2.loadFromNodes([{ name: '甲甲' }]);
  eq('10c 无 id 时用名字作引用', idx2.scan('甲甲').hits[0].refs[0], '甲甲');
  const idx3 = C.createIndex();
  idx3.loadFromNodes([{ name: '甲甲' }], (node) => 'custom:' + node.name);
  eq('10d refOf 可定制', idx3.scan('甲甲').hits[0].refs[0], 'custom:甲甲');
}

// ========== 11. 指纹 ==========
{
  ok('11a 不同切分不同指纹', C.fingerprintOf(['ab', 'c']) !== C.fingerprintOf(['a', 'bc']));
  eq('11b 顺序无关', C.fingerprintOf(['b', 'a']), C.fingerprintOf(['a', 'b']));
  ok('11c 内容变了指纹变', C.fingerprintOf(['甲', '乙']) !== C.fingerprintOf(['甲', '丙']));
  eq('11d 空表有稳定指纹', C.fingerprintOf([]), C.fingerprintOf([]));
  ok('11e 畸形输入不抛', typeof C.fingerprintOf(null) === 'string');
  // 词间分隔：'ab'+'c' 与 'a'+'bc' 拼接内容相同，必须被分隔符区分开。
  ok('11f 词间分隔生效', C.fingerprintOf(['ab', 'c']) !== C.fingerprintOf(['abc']));
}

// ========== 12. 畸形输入不抛 ==========
{
  const idx = C.createIndex();
  ok('12a scan(null) 返回数组', Array.isArray(idx.scan(null).hits));
  ok('12b scan(数字)', Array.isArray(idx.scan(12345).hits));
  ok('12c scan(对象)', Array.isArray(idx.scan({}).hits));
  eq('12d add(null,null) 拒收', idx.add(null, null), false);
  eq('12e add(空串)', idx.add('  ', 'x'), false);
  eq('12f removeRef(null)', idx.removeRef(null), 0);
  eq('12g loadFromNodes(null)', idx.loadFromNodes(null), 0);
  eq('12h addAll(null)', idx.addAll(null), 0);
  ok('12i refsFor(undefined) 返回数组', Array.isArray(idx.refsFor(undefined)));
  ok('12j line() 是字符串', typeof idx.line() === 'string');
  ok('12k stats() 有版本号', idx.stats().version === 1);
  // 构造非法 opts 不得让实例崩。
  const bad = C.createIndex({ minLength: -5, maxHits: 'NaN', stopwords: null });
  ok('12l 非法 opts 被夹到合法值', bad.stats().minLength >= 1);
  ok('12m 非法 opts 后仍可用', bad.add('甲乙', 'r') === true && bad.scan('甲乙').hits.length === 1);
}

// ========== 13. 只报告不写图 ==========
{
  const idx = C.createIndex();
  idx.add('玉兰', 'n1');
  const f1 = idx.stats().fingerprint;
  eq('13a 词表规模 1', idx.stats().keywords, 1);
  idx.scan('玉兰玉兰玉兰');
  eq('13b scan 不改词表（已有关键词）', idx.stats().keywords, 1);
  eq('13c scan 不改指纹', idx.stats().fingerprint, f1);
  // scan 遇到未登记的词不得凭空造边。
  const r = idx.scan('从未登记过的词汇');
  eq('13d 未登记词不产生命中', r.hits.length, 0);
  eq('13e 词表仍为 1', idx.stats().keywords, 1);
}

// ========== 14. 性能 ==========
{
  const idx = C.createIndex({ maxHits: 100 });
  const words = [];
  for (let i = 0; i < 2000; i++) { const w = '词条' + i; words.push(w); idx.add(w, 'r' + i); }
  const text = words.slice(0, 500).join('，') + '。'.repeat(100);
  const t0 = Date.now();
  const r = idx.scan(text);
  const dt = Date.now() - t0;
  ok('14a 大词表命中 500 条', r.total >= 500, String(r.total));
  ok('14b 2000 词表 + 长文本 < 2000ms', dt < 2000, dt + 'ms');
}

// ========== 15. 反向审计（负控制） ==========
const src = read('crosslink.js');
const goodGlobal = globalThis.LonShaCrosslink;
{
  const tmp = path.join(root, 'tests', '.tmp-negctl-v3183xl');
  fs.mkdirSync(tmp, { recursive: true });

  // 负控制 1：破坏 scan 相位 fail 回退 → 重叠词的命中必须整段消失。
  // 注意锚点必须选 scan 里的 `cur` 行：build 相位的 `f` 行同样是 fail 赋值，
  // 但它算的是失配表、对本用例无可观测影响（实测破坏后 total 仍为 2）。
  // 选错相位会写出「破坏发生了但判据没动」的假负控制。
  {
    const anchor = 'while (cur !== 0 && !nodes[cur].next.has(ch)) cur = nodes[cur].fail;';
    eq('负控1 锚点恰中 1 次', src.split(anchor).length, 2);
    const f = path.join(tmp, 'fail.cjs');
    fs.writeFileSync(f, src.replace(anchor, 'while (false) cur = nodes[cur].fail;'), 'utf8');
    const mod = require(f);
    const idx = mod.createIndex({ minLength: 1 });
    idx.add('ab', 'A');
    idx.add('aab', 'B');
    const r = idx.scan('aaab');
    // 未破坏时 'aaab' 必须同时命中 aab 与 ab；破坏后回退失效 → 一个都不命中。
    const good = C.createIndex({ minLength: 1 });
    good.add('ab', 'A'); good.add('aab', 'B');
    eq('负控1 前提：未破坏时命中 2 词', good.scan('aaab').total, 2);
    eq('负控1：fail 回退破坏后命中整段消失（判据确实在跑）', r.total, 0);
  }

  // 负控制 1b：破坏 output 继承 → 嵌套短词不再命中（长词仍在，恰好区分两者）
  {
    const anchor = 'nodes[child].out = nodes[child].out.concat(nodes[nodes[child].fail].out);';
    eq('负控1b 锚点恰中 1 次', src.split(anchor).length, 2);
    const f = path.join(tmp, 'outinh.cjs');
    fs.writeFileSync(f, src.replace(anchor, ''), 'utf8');
    const mod = require(f);
    const idx = mod.createIndex({ minLength: 1 });
    idx.add('山', 'a');
    idx.add('珞山', 'b');
    // 必须按精确关键词比对——用字符串 includes 会被 '珞山' 包含 '山' 骗过（假绿）。
    const kws = idx.scan('珞山脚下').hits.map(h => h.keyword);
    ok('负控1b：output 继承破坏后被包含的短词不再命中', !kws.includes('山'), `命中 ${kws.join(',') || '(空)'}`);
    ok('负控1b2：长词仍命中（证明断的是继承而非全部）', kws.includes('珞山'), kws.join(','));
  }

  // 负控制 2：破坏过短词闸 → 单字词会被收录（正是要防的误报源）
  {
    const anchor = 'if (toChars(kw).length < minLen || stop.has(kw)) { rejected++; return false; }';
    eq('负控2 锚点恰中 1 次', src.split(anchor).length, 2);
    const f = path.join(tmp, 'len.cjs');
    fs.writeFileSync(f, src.replace(anchor, 'if (false) { rejected++; return false; }'), 'utf8');
    const mod = require(f);
    const idx = mod.createIndex();
    eq('负控2：闸破坏后单字词被收录', idx.add('门', 'x'), true);
  }

  // 负控制 3：破坏停用词闸 → 通用词进表（长线把所有条目串成一团）
  {
    const anchor = "if (toChars(kw).length < minLen || stop.has(kw)) { rejected++; return false; }";
    const f = path.join(tmp, 'stop.cjs');
    fs.writeFileSync(f, src.replace(anchor, 'if (toChars(kw).length < minLen) { rejected++; return false; }'), 'utf8');
    const mod = require(f);
    const idx = mod.createIndex({ stopwords: ['主角'] });
    eq('负控3：停用词闸破坏后通用词被收录', idx.add('主角', 'x'), true);
  }

  // 负控制 4：破坏截断 → 截断三态自身要能证伪（hits 仍会被 total 兜住）
  {
    const anchor = 'const truncated = all.length > maxHits;';
    eq('负控4 锚点恰中 1 次', src.split(anchor).length, 2);
    const f = path.join(tmp, 'trunc.cjs');
    fs.writeFileSync(f, src.replace(anchor, 'const truncated = false;'), 'utf8');
    const mod = require(f);
    const idx = mod.createIndex({ maxHits: 2 });
    ['甲甲', '乙乙', '丙丙', '丁丁'].forEach((k, i) => idx.add(k, 'r' + i));
    const r = idx.scan('甲甲乙乙丙丙丁丁');
    eq('负控4：截断标志破坏后 truncated 恒假（可观测）', r.truncated, false);
    eq('负控4b 但 total 仍是真实数（不静默）', r.total, 4);
  }

  // 负控制 5：H6 工具两向自证
  {
    eq('负控5a 不存在的锚点零命中', src.split('THIS_ANCHOR_DOES_NOT_EXIST').length, 1);
    // H6 自证用 'dirty = true;'（源码里真出现 3 次）；'rejected++' 只出现 1 次，
    // 拿单次锚点断言「>1」是写反了，会假红（这条断言本身就是前一轮留下的错判据）。
    const hits = src.split('dirty = true;').length - 1;
    eq('负控5b 该锚点确实多次出现（故破坏须逐个精确匹配）', hits, 3);
    // H5 锚点纯度：build 相位与 scan 相位各有一条 fail 回退，二者必须都唯一且互不相同。
    // 若哪天被合并成同一串，上面 负控1 就会打到 build 相位、静默失去证伪力。
    const buildWalk = 'while (f !== 0 && !nodes[f].next.has(ch)) f = nodes[f].fail;';
    const scanWalk = 'while (cur !== 0 && !nodes[cur].next.has(ch)) cur = nodes[cur].fail;';
    eq('负控5c build 相位 fail 回退锚点唯一', src.split(buildWalk).length, 2);
    eq('负控5d scan 相位 fail 回退锚点唯一', src.split(scanWalk).length, 2);
    ok('负控5e 两相位锚点互不相同（负控1 打的是 scan 相位）', buildWalk !== scanWalk);
  }

  // 破坏副本自身会挂全局 → 必须还原，否则 16d~16f 验的是坏副本。
  ok('负控5c 破坏副本确实污染了宿主全局（还原断言非空转）', globalThis.LonShaCrosslink !== goodGlobal);
  globalThis.LonShaCrosslink = goodGlobal;
  ok('负控5d 宿主全局已还原为真模块', globalThis.LonShaCrosslink === goodGlobal);

  fs.rmSync(tmp, { recursive: true, force: true });
}

// ========== 16. 接线自证 + 版权纯度 ==========
{
  const idx = read('index.js');
  ok('16a index.js 引用 LonShaCrosslink', /LonShaCrosslink/.test(idx));
  ok('16b 通过 _moduleLib 取库', /_moduleLib\(\(\) => window\.LonShaCrosslink, 'crosslink\.js'\)/.test(idx));
  ok('16c 有诊断读数入口', /_crosslinkLine/.test(idx));
  ok('16d 摘要落笔路径里建索引', /this\._crosslinkIndex = XL\.createIndex\(/.test(idx));
  ok('16e 落笔后扫描并记录', /_crosslinkLast = \{/.test(idx));
  const mf = JSON.parse(read('manifest.json'));
  ok('16f manifest 登记 crosslink.js', mf.extra_js.includes('crosslink.js'));

  const src2 = read('crosslink.js');
  // 版权纯度判据必须区分「代码复用」与「出处注释」：源码里提到参考项目名是正当的
  // 出处标注，不能据此判抄袭；真正的判据是**去掉注释后的代码体**里不含源实现的
  // 标识符/命名空间。用粗判据会把出处注释误判成抄袭（假红）。
  const codeBody = src2
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  ok('16g 代码体不含源实现的 Python 侧命名', !codeBody.includes('ahocorasick'));
  ok('16h 代码体不含源实现的数据表名', !codeBody.includes('glossary'));
  ok('16i 代码体不含参考项目命名（出处只允许出现在注释）', !/nocturne|luker|liyuan/i.test(codeBody));
  ok('16i2 但保留出处注释（可追溯）', /nocturne/.test(src2), '出处注释缺失则无法回溯参考来源');
  ok('16j CJS 双导出', /module\.exports = api/.test(src2));
  ok('16k 挂 LonSha 前缀全局', globalThis.LonShaCrosslink === C && C.CROSSLINK_VERSION === 1);
}
// ========== 17. 诊断行真进 selfCheck ==========
//   入口函数名在场**不等于**用户读得到：本仓主线失效正是「写好了入口、零调用点」。
{
  const isrc = read('index.js');
  const scStart = isrc.indexOf('async selfCheck() {');
  ok('17a selfCheck 方法存在', scStart > 0);
  let _d = 0, scEnd = -1;
  for (let i = isrc.indexOf('{', scStart); i >= 0 && i < isrc.length; i++) {
    if (isrc[i] === '{') _d++;
    else if (isrc[i] === '}') { _d--; if (_d === 0) { scEnd = i; break; } }
  }
  ok('17b selfCheck 方法体闭合', scEnd > scStart);
  const scBody = isrc.slice(scStart, scEnd);
  ok('17c 真调用 _crosslinkLine', scBody.includes('this._crosslinkLine('));
  const rowsIdx = scBody.indexOf('const rows = [');
  ok('17d selfCheck 构建子系统列表 rows', rowsIdx >= 0);
  const lb = scBody.indexOf('[', rowsIdx);
  let _bd = 0, _rb = -1;
  for (let i = lb; i < scBody.length; i++) {
    if (scBody[i] === '[') _bd++;
    else if (scBody[i] === ']') { _bd--; if (_bd === 0) { _rb = i; break; } }
  }
  ok('17e rows 列表字面量闭合', _rb > lb);
  const lit = scBody.slice(lb, _rb + 1);
  const keys = [];
  for (const m of lit.matchAll(/\['([^']+)',/g)) keys.push(m[1]);
  for (const m of scBody.matchAll(/rows\.push\(\[\s*'([^']+)'/g)) keys.push(m[1]);
  ok('17f 诊断行「条目关联」进入 selfCheck 子系统列表', keys.includes('条目关联'),
    '现有键：' + keys.join(','));
}
console.log(`v3183 crosslink: ${pass} passed`);
