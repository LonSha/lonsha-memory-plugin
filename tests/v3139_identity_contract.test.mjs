// tests/v3139_identity_contract.test.mjs
// [v3.139] stbme CP-L3: 身份单通道收口 + 快照冻结键契约守卫
// 验证：① 去重指纹身份收编 getCurrentChatId 单一真源（私有通道废除）
//      ② ARCHIVE_TOP_LEVEL_KEYS 冻结契约存在且键集 == collectExport 实际导出键集
//      ③ storage.save 写侧契约卫兵接线
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

test('v3.139 身份单通道：去重指纹身份走 getCurrentChatId', () => {
    assert.ok(!src.includes('ctxCc?.characterId'), '私有身份通道已废除');
    assert.ok(!src.includes("ctxCc?.chatId"), 'ctxCc 通道已收编');
    assert.match(src, /const chatIdCc = window\.LonShaMemory\?\.engine\?\.getCurrentChatId\?\.\(\) \|\| '';/, '去重身份走单一真源');
});

test('v3.139 冻结键契约：清单冻结 + Set 索引 + 写侧卫兵', () => {
    assert.match(src, /const ARCHIVE_TOP_LEVEL_KEYS = Object\.freeze\(\[/, '契约清单 Object.freeze');
    assert.match(src, /const ARCHIVE_TOP_LEVEL_KEY_SET = new Set\(ARCHIVE_TOP_LEVEL_KEYS\)/, 'Set 索引');
    assert.match(src, /存档顶层键契约违约/, 'storage.save 写侧告警');
    assert.match(src, /ARCHIVE_TOP_LEVEL_KEY_SET\.has\(_k\)/, '卫兵查 Set');
});

test('v3.139 契约键集 == collectExport 实际导出键集（双向）', () => {
    const ceStart = src.indexOf('collectExport() {');
    const ceEnd = src.indexOf('getCurrentChatId() {', ceStart);
    const ceBlock = src.slice(ceStart, ceEnd);
    const exported = new Set([...ceBlock.matchAll(/^\s{16}(\w+):/gm)].map(m => m[1]));
    assert.ok(exported.size >= 40, `导出键数量异常: ${exported.size}`);
    const contractMatch = /const ARCHIVE_TOP_LEVEL_KEYS = Object\.freeze\(\[([\s\S]*?)\]\);/.exec(src);
    assert.ok(contractMatch, '契约清单存在');
    const declared = new Set([...contractMatch[1].matchAll(/'(\w+)'/g)].map(m => m[1]));
    for (const k of exported) assert.ok(declared.has(k), `契约缺导出键: ${k}（新增顶层键必须同步契约清单）`);
    for (const k of declared) assert.ok(exported.has(k), `契约多出不存在键: ${k}（契约与实现漂移）`);
    assert.equal(declared.size, exported.size, '键集大小一致');
});
