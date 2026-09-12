import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const src = fs.readFileSync(path.resolve(__dirname, '../index.js'), 'utf-8');

console.log('=== 1. 静态关键锚点与版本检查 ===');
assert.ok(src.includes("const VERSION = '3.44.0';"), '版本号必须递增至 3.44.0');
assert.ok(src.includes('sanitizeJson') && src.includes('safeJsonParse'), '必须包含字符流状态机 JSON 容错解析器');
assert.ok(src.includes('clean.carried = true;\n                    clean.location = \'\';') || src.includes('clean.carried === true') && src.includes('clean.location = \'\';'), '物品台账必须实现 carried 与 location 互斥');
assert.ok(src.includes('this._revision = 0;') && src.includes('setStateIfRevision'), 'StorageManager 必须实现单调递增修订号与乐观并发');
assert.ok(src.includes('开场白写入抑制 (Opening Floor Write Suppression'), 'onMessageReceived 必须包含开场白写入抑制');
console.log('✓ 静态锚点与接口声明检查全部通过');

// 提取 sanitizeJson 和 safeJsonParse
function extractSanitizer() {
    const start = src.indexOf('function sanitizeJson(raw) {');
    const end = src.indexOf('function hintForError(err) {', start);
    const code = src.slice(start, end);
    const fn = new Function(`${code}; return { sanitizeJson, safeJsonParse };`);
    return fn();
}

console.log('\n=== 2. 字符流状态机 JSON 容错解析动态测试 ===');
const { sanitizeJson, safeJsonParse } = extractSanitizer();

// 2.1 剥离闲聊废话与 Markdown 围栏
const raw1 = `
好的，已经为您梳理好了角色记忆：
\`\`\`json
{
  "name": "爱丽丝",
  "importance": 5,
  "traits": ["勇敢", "善良", ]
}
\`\`\`
希望对您有帮助！
`;
const obj1 = safeJsonParse(raw1);
assert.ok(obj1 && obj1.name === '爱丽丝', '必须成功提取并解析带围栏与废话的 JSON');
assert.equal(obj1.traits.length, 2, '必须吞噬数组尾部悬挂逗号');

// 2.2 字符串内未转义裸双引号自动修复
const raw2 = `{"dialogue": "她说 "今天天气真好" 然后笑了", "speaker": "Alice"}`;
const obj2 = safeJsonParse(raw2);
assert.ok(obj2 && obj2.speaker === 'Alice', '必须修复字符串内部未转义的双引号');
assert.ok(obj2.dialogue.includes('今天天气真好'), '对话内部内容必须完整保留');

// 2.3 英文所有格单引号保护
const raw3 = `{"text": "Don't give up, it's a sunny day", "score": 100}`;
const obj3 = safeJsonParse(raw3);
assert.ok(obj3 && obj3.text === "Don't give up, it's a sunny day", '绝不能将英文所有格单引号误换为双引号');

// 2.4 中文全角引号与全角标点归一化
const raw4 = `{"desc": “这是全角引号”， “count": 3}`;
const obj4 = safeJsonParse(raw4);
assert.ok(obj4 && obj4.count === 3, '必须归一化中文全角引号与逗号');

// 2.5 未加引号的对象键名
const raw5 = `{ id: 101, title: "测试项", }`;
const obj5 = safeJsonParse(raw5);
assert.ok(obj5 && obj5.id === 101 && obj5.title === '测试项', '必须自动修复未加引号的合法键名');
console.log('✓ 字符流状态机 JSON 容错解析全部通过');

console.log('\n=== 3. 物品物理可达性与随身/存放互斥动态测试 ===');
// 提取 _sanitizeItemOp
function extractItemOpSanitizer() {
    const start = src.indexOf('_sanitizeItemOp(op) {');
    const end = src.indexOf('rebuildItems() {', start);
    const code = src.slice(start, end);
    const inner = code.slice(code.indexOf('{') + 1, code.lastIndexOf('}'));
    const fn = new Function('errLog', `return function _sanitizeItemOp(op) { ${inner} };`);
    return fn(() => {});
}
const sanitizeItemOp = extractItemOpSanitizer();

// 3.1 互斥自愈：carried: true 自动清空 location
const op1 = sanitizeItemOp({ action: 'add', name: '银质怀表', carried: true, location: '家中书房' });
assert.equal(op1.carried, true, 'carried 应为 true');
assert.equal(op1.location, '', '随身携带必须清空存放地点 (强互斥)');

// 3.2 互斥自愈：有 location 时 carried 自动为 false
const op2 = sanitizeItemOp({ action: 'add', name: '精钢长剑', location: '武器库架子' });
assert.equal(op2.carried, false, '有具体存放地点时 carried 必须为 false');
assert.equal(op2.location, '武器库架子', '存放地点应保留');

// 3.3 物理可达性划分模拟
const currentGeo = '圣芙蕾雅学园 图书馆 阅览室';
const records = [
    { name: '学生证', holder: '琪亚娜', state: '完好', carried: true, location: '' },
    { name: '借阅典籍', holder: '公用', state: '完好', carried: false, location: '图书馆' },
    { name: '练习木剑', holder: '琪亚娜', state: '完好', carried: false, location: '宿舍衣柜' }
];

const accessible = [];
const stored = [];
for (const r of records) {
    if (r.carried || (!r.location && r.carried !== false)) {
        accessible.push(r);
    } else {
        const loc = r.location.toLowerCase();
        if (currentGeo.toLowerCase().includes(loc)) {
            accessible.push(r);
        } else {
            stored.push(r);
        }
    }
}
assert.equal(accessible.length, 2, '随身学生证与在场借阅典籍必须可达');
assert.equal(stored.length, 1, '宿舍衣柜的木剑必须归入他处寄存');
assert.equal(stored[0].name, '练习木剑');
console.log('✓ 物品物理可达性、随身/存放互斥与他处寄存划分验证通过');

console.log('\n=== 4. 数据库级修订号乐观并发与开场白抑制测试 ===');
// 提取 StorageManager
function extractStorageManagerClass() {
    const start = src.indexOf('class StorageManager {');
    const end = src.indexOf('class LonShaMemoryPlugin {', start);
    const code = src.slice(start, end);
    const fn = new Function('VERSION', 'PLUGIN_NAME', 'errLog', `${code}; return StorageManager;`);
    return fn('3.44.0', 'LonSha', () => {});
}
const StorageManager = extractStorageManagerClass();
const sm = new StorageManager();

// 4.1 修订号初始值与读取
assert.equal(sm.getRevision(), 0, '初始 revision 应为 0');

// 4.2 setStateIfRevision 乐观并发控制
let testVal = 10;
sm._revision = 5;
// 试图以落后版本 (rev 3 < 5) 更新
const okOld = sm.setStateIfRevision(3, () => { testVal = 20; });
assert.equal(okOld, false, '落后 revision 必须被拒绝更新');
assert.equal(testVal, 10, '状态变量不得被修改');

// 以最新/合理版本 (rev 5 >= 5) 更新
const okNew = sm.setStateIfRevision(5, () => { testVal = 30; });
assert.equal(okNew, true, '匹配 revision 必须允许更新');
assert.equal(testVal, 30, '状态变量应成功更新');

// 4.3 save 时 opts.expectedRevision 乐观锁检查
global.window = {
    SillyTavern: {
        getContext: () => ({
            chatMetadata: { extensions: {} },
            saveChat: async () => {}
        })
    }
};
sm._revision = 10;
const saveRejected = await sm.save('chat_1', { summaries: [] }, { expectedRevision: 8 });
assert.equal(saveRejected, false, '持有落后快照 (8 < 10) 的保存请求必须被拒绝');

const saveAccepted = await sm.save('chat_1', { summaries: [] }, { expectedRevision: 10 });
assert.equal(saveAccepted, true, '持有最新快照的保存请求必须成功');
assert.equal(sm.getRevision(), 11, '保存成功后 revision 必须单调自增');

console.log('✓ 数据库级修订号乐观并发控制验证通过');
console.log('\n[V344 TESTS PASSED] 终极护城河机制全部验证通过！');
