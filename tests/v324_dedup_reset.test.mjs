// tests/v324_dedup_reset.test.mjs
// v3.24.0 补丁测试：跨调用去重指纹在事件变更时同步重置
// （NE-Memory 收编完整性：CHAT_CHANGED/MESSAGE_EDITED/MESSAGE_DELETED/MESSAGE_SWIPED 四事件）
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf-8');

// 版本断言（>= v3.24 容灾）
const vm = src.match(/const VERSION = '([^']+)'/);
if (!vm) { console.error('FAIL: VERSION 未找到'); process.exit(1); }
if (parseFloat(vm[1]) < 3.24) { console.error(`FAIL: 版本 ${vm[1]} < 3.24`); process.exit(1); }
console.log(`ok: 版本 ${vm[1]}`);

let pass = 0;
const fail = (m) => { console.error('FAIL: ' + m); process.exitCode = 1; };
const ok = (m) => { pass++; console.log('ok: ' + m); };

// ST1: resetRecallDedup 方法存在
if (src.includes('function resetRecallDedup()')) ok('ST1: resetRecallDedup 函数存在');
else fail('ST1: resetRecallDedup 缺失');

// ST2: 四事件处理器接入 resetRecallDedup（去重指纹清空）
const checks = [
    ['CHAT_CHANGED', 'events.CHAT_CHANGED去重清空'],
    ['MESSAGE_EDITED', 'events.MESSAGE_EDITED去重清空'],
    ['MESSAGE_DELETED', 'events.MESSAGE_DELETED去重清空'],
];
for (const [name, tag] of checks) {
    if (src.includes(`resetRecallDedup(); } catch (e) { errLog(e, '${tag}')`)) ok(`ST2-${name}: 去重指纹重置已接入`);
    else fail(`ST2-${name}: 去重指纹重置缺失（${tag}）`);
}

// swipe 也接入（独立 tag）
if (src.includes("errLog(e, 'events.MESSAGE_SWIPED去重清空')")) ok('ST2-SWIPED: swipe 去重指纹重置已接入');
else fail('ST2-SWIPED: swipe 去重指纹重置缺失');

// ST3: resetRecallDedup 三字段全清（防部分残留）
const rr = src.match(/function resetRecallDedup\(\) \{[\s\S]*?\n    \}/);
if (rr && rr[0].includes('lastTexts = null') && rr[0].includes('lastQuery') && rr[0].includes('lastChatId')) ok('ST3: 三字段全清');
else fail('ST3: resetRecallDedup 未清全字段: ' + (rr ? rr[0] : 'not found'));

// ST4: v3.23 收编功能仍在（回归保障）
if (src.includes('function recallDedupMark')) ok('ST4: recallDedupMark 仍在');
else fail('ST4: recallDedupMark 丢失');
if (src.includes('cliffCut')) ok('ST4: 断崖截断仍在');
else fail('ST4: cliffCut 丢失');
if (src.includes('parseStoryTimeConstraint')) ok('ST4: 时间感知仍在');
else fail('ST4: parseStoryTimeConstraint 丢失');
if (src.includes('checkEmbeddedMigration')) ok('ST4: 迁移恢复仍在');
else fail('ST4: checkEmbeddedMigration 丢失');

console.log(`\n✓ v3.24 去重指纹重置测试全过 (${pass} 项)`);
if (process.exitCode) { console.log('✗ 存在失败项'); process.exit(process.exitCode); }