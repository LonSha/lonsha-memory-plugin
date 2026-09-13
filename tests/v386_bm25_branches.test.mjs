// tests/v386_bm25_branches.test.mjs
// v3.86 吸收 MyriadKnots：BM25 多路分支归一化 + Unicode 分词
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test } from 'node:test';
import assert from 'node:assert';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf-8');

// 版本断言
const vMatch = src.match(/const VERSION = '([^']+)'/);
assert.ok(vMatch, 'VERSION 未找到');
const verNum = parseFloat(vMatch[1]);
assert.ok(verNum >= 3.86, `版本 ${vMatch[1]} < 3.86`);

// 抽取 BM25 类（保留缩进结构，去掉类体前导 8 空格换 2 空格）
function extractClass() {
    const start = src.indexOf('class BM25 {');
    assert.ok(start > 0, 'BM25 类未找到');
    const end = src.indexOf('class CharacterState {', start);
    assert.ok(end > start, 'BM25 类终点未找到');
    const body = src.slice(start, end).replace(/\n    \/\/ \[v2\.0\] P2[\s\S]*$/, '');
    // 去一层缩进（8 空格 → 2 空格），便于 eval
    return new Function('return (' + body.replace(/\n        /g, '\n  ') + ')')();
}

// ── 1. Unicode 分词属性测试 ──
test('=== 1. Unicode 分词（NFKC + Han Script） ===', () => {
    const BM25 = extractClass();
    const bm = new BM25();
    const toks = bm._tokenize('图书馆 Hello１２３ 𝕏扩展区字');
    // NFKC：全角１２３ → 123 且与 hello 连成一个拉丁数字 token；汉字二元组；𝕏 归一化为 x
    assert.ok(toks.includes('图书') && toks.includes('书馆'), '汉字二元组: ' + JSON.stringify(toks));
    assert.ok(toks.includes('hello123'), '拉丁整词小写 + 全角数字 NFKC 归一化合并');
    assert.ok(toks.includes('x'), '扩展区数学字母 NFKC 归一化');
    assert.ok(toks.includes('扩展') || toks.some(t => t.includes('扩展')), '扩展区/兼容字符可用');
});

// ── 2. 分支归一化行为复刻：短用户输入不被长背景淹没 ──
test('=== 2. 分支归一化（核心痛点） ===', () => {
    const BM25 = extractClass();
    const bm = new BM25();
    bm.rebuild([
        { id: 'a', text: '图书馆 还书 爱丽丝 承诺 归还 书籍', floor: 1 },
        { id: 'b', text: '爱丽丝 在 图书馆 借 了 一本 魔法 书', floor: 2 },
        { id: 'c', text: '长篇 背景 描述 战争 历史 王国 兴衰 王朝 更迭 岁月 流转 时代 变迁 苍海 桑田 众生 百态 人间 烟火 城池 攻防 军队 调动 粮草 辎重 战鼓 雷鸣 硝烟 弥漫 英勇 将士 浴血 奋战 慷慨 激昂 誓言 回荡 山河 破碎 流民 失所 白骨 露野 千里 无鸡鸣 惨绝 人寰 天地 泣血 苍生 涂炭 时局 动荡 风云 诡谲 权谋 交错 阴谋 诡计 王座 之争 铁骑 踏破 关隘 烽火 连天', floor: 3 },
        { id: 'd', text: '今天 天气 不错 阳光 明媚 微风 轻拂', floor: 4 }
    ]);
    // 分支模式：用户最新输入「还书」很短但精准；长背景 recentAssistant 含大量高频词
    const results = bm.searchBranches([
        { key: 'main', text: '图书馆 还书 爱丽丝', weight: 0.3 },
        { key: 'latestUser', text: '还书', weight: 0.65 },
        { key: 'recentAssistant', text: '长篇 背景 描述 战争 历史 王国 兴衰 王朝 更迭 岁月 流转 时代 变迁 苍海 桑田 众生 百态 人间 烟火 城池 攻防 军队 调动 粮草 辎重 战鼓 雷鸣 硝烟 弥漫 英勇 将士 浴血 奋战 慷慨 激昂 誓言 回荡 山河 破碎 流民 失所 白骨 露野', weight: 0.25 }
    ], 5, { cliffCut: true, minResults: 2 });
    assert.ok(results.length >= 1, '有结果');
    // 文档 a（含 还书/图书馆/爱丽丝）应排第一：latestUser 分支独占命中
    assert.strictEqual(results[0].id, 'a', `top 应为 a，实际 ${results[0].id}`);
    assert.ok(results[0].branchScores.latestUser > 0.9, 'latestUser 分支满分: ' + results[0].branchScores.latestUser);
    // 长背景文档 c 在 recentAssistant 分支得分高，但加权后不该压过 a
    const cDoc = results.find(r => r.id === 'c');
    if (cDoc) assert.ok(results.indexOf(results[0]) < results.indexOf(cDoc), '长背景不该压过精准命中');
    // 单查询等价性
    const plain = bm.search('还书', 5);
    assert.ok(plain.length >= 1 && plain[0].id === 'a', 'search() 等价主分支');
});

// ── 3. 断崖截断回归 ──
test('=== 3. 断崖截断回归（v3.23 行为不变） ===', () => {
    const BM25 = extractClass();
    const bm = new BM25();
    bm.rebuild([
        { id: 'a', text: '龙牙剑 传说 被 爱丽丝 持有', floor: 1 },
        { id: 'b', text: '爱丽丝 用 龙牙剑 斩断 锁链', floor: 2 },
        { id: 'c', text: '食堂 今天 的 午饭 是 红烧肉', floor: 3 },
        { id: 'd', text: '天空 下 起 了 小雨 街道 湿润', floor: 4 },
        { id: 'e', text: '电路板 焊点 测试 通过 电压 稳定', floor: 5 },
        { id: 'f', text: '量子 纠缠 退相干 实验 数据 异常', floor: 6 }
    ]);
    const cliff = bm.search('龙牙剑 爱丽丝', 5, { cliffCut: true, minResults: 2 });
    assert.ok(cliff.length <= 2, `断崖截断应生效，实际 ${cliff.length} 条`);
    const plain = bm.search('龙牙剑 爱丽丝', 5);
    assert.ok(plain.length >= 2 && plain.length <= 5, `无 cliffCut 返回 ${plain.length} 条`);
    assert.strictEqual(bm.search('不存在的词xyz', 5, { cliffCut: true, minResults: 2 }).length, 0, '无相关为空');
});

// ── 4. 多分支权重合成 ──
test('=== 4. 多分支权重合成与分支全零 ===', () => {
    const BM25 = extractClass();
    const bm = new BM25();
    bm.rebuild([
        { id: 'a', text: '星星 在 夜空 闪烁', floor: 1 },
        { id: 'b', text: '月亮 升起 海面 波光', floor: 2 }
    ]);
    // 全部权重为 0 → 空
    assert.strictEqual(bm.searchBranches([{ key: 'x', text: '星星', weight: 0 }], 5).length, 0, '全零权重为空');
    // 单分支归一化
    const r1 = bm.searchBranches([{ key: 'main', text: '星星 闪烁', weight: 1 }], 5);
    assert.strictEqual(r1[0].id, 'a');
    assert.ok(Math.abs(r1[0].score - 1) < 1e-9, '单分支唯一命中归一化为 1: ' + r1[0].score);
    // 双分支：a 只在 branch1 命中（该分支满分），b 只在 branch2 命中（满分）
    const r2 = bm.searchBranches([
        { key: 'q1', text: '星星 闪烁', weight: 0.7 },
        { key: 'q2', text: '月亮 海面', weight: 0.3 }
    ], 5);
    const aDoc = r2.find(r => r.id === 'a');
    const bDoc = r2.find(r => r.id === 'b');
    assert.ok(aDoc && bDoc, '两文档都有分');
    assert.ok(aDoc.score > bDoc.score, '高权重分支命中的文档分更高');
    assert.ok(Math.abs(aDoc.branchScores.q1 - 1) < 1e-9 && aDoc.branchScores.q2 === 0, 'a 在 q1 满分');
});

// ── 5. 静态：buildQuery 分支捕获与召回路由 ──
test('=== 5. 静态检查：挂接完整性 ===', () => {
    assert.ok(src.includes("key: 'latestUser'"), 'buildQuery 有 latestUser 分支');
    assert.ok(src.includes("key: 'recentAssistant'"), 'buildQuery 有 recentAssistant 分支');
    assert.ok(src.includes("key: 'previousUser'"), 'buildQuery 有 previousUser 分支');
    assert.ok(src.includes('query.branches'), 'buildQuery 返回 branches');
    assert.ok(src.includes('this.bm25.searchBranches('), 'recallMemory 走 searchBranches');
    assert.ok(src.includes('branchScores: d.branchScores'), '结果携带 branchScores');
    assert.ok(src.includes("\\p{Script=Han}"), 'Unicode Han Script 分词');
    assert.ok(src.includes("normalize('NFKC')"), 'NFKC 归一化');
    // 旧分词正则绝迹（[a-z0-9]+ / [\u4e00-\u9fa5] 不再出现在 BM25 类内）
    const clsStart = src.indexOf('class BM25 {');
    const clsEnd = src.indexOf('class CharacterState {', clsStart);
    const cls = src.slice(clsStart, clsEnd);
    assert.ok(!cls.includes('[a-z0-9]+'), '旧拉丁分词正则绝迹');
    assert.ok(!cls.includes('\\u4e00-\\u9fa5'), '旧基本区汉字正则绝迹');
    // manifest 同步
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf-8'));
    assert.strictEqual(manifest.version, vMatch[1], 'manifest 与 index.js 版本一致');
});
console.log('v386 测试套件加载完成');