// tests/v3141_session_lease.test.mjs
// [v3.141] CP-L4 会话租约：await 跨越聊天切换后，旧任务结果不得写入新聊天运行时/存档
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');
const fnBody = (marker, endMarker) => {
    const st = src.indexOf(marker);
    assert.ok(st >= 0, `${marker} 存在`);
    const en = src.indexOf(endMarker, st);
    assert.ok(en > st, `${endMarker} 存在`);
    return src.slice(st, en);
};
test('v3.141 会话租约开关存在且走配置层读取', () => {
    assert.match(src, /sessionLeaseGuardEnabled: true/, '配置默认开启');
    assert.equal((src.match(/this\.config\.config\.sessionLeaseGuardEnabled/g) || []).length, 3, '三处 await 路径均读配置层');
    assert.ok(!/this\.sessionLeaseGuardEnabled/.test(src), '禁止绕过配置层直接读 engine 属性（恒 undefined → 开关失效）');
});
test('v3.141 OMR 提取路径：await 后身份变更则整栋丢弃（不写运行时）', () => {
    const body = fnBody('async onMessageReceived(message', '// [v3.33] AI 主动记忆操作 merged');
    const lease = body.indexOf('const chatId = this.getCurrentChatId();');
    const call = body.indexOf('extracted = await this.extractMemoryWithLLM(message)');
    const guard = body.indexOf('this.getCurrentChatId() !== chatId)');
    assert.ok(lease > 0 && call > lease && guard > call, '捕获→await→校验 顺序正确');
    const gi = body.indexOf('if (this.config.config.sessionLeaseGuardEnabled !== false && this.getCurrentChatId() !== chatId)');
    assert.match(body.slice(gi, gi + 500), /this\.\_staleTaskDropped\+\+/, '计数累加');
    assert.match(body.slice(gi, gi + 500), /\n\s+return;\s*\n/, '校验失败立即 return（后续写入全不可达）');
});
test('v3.141 backfill：租约身份声明在函数体顶层（保存点在 try 块外，内层声明会 ReferenceError）', () => {
    const body = fnBody('async backfillFloors(floors, onProgress)', '\n        // [v3.47]');
    const decl = body.indexOf('const _bfLease0');
    const save = body.indexOf('this.storage.save(_bfLease0');
    const innerTry = body.indexOf('if (!acquired)');
    assert.ok(decl > 0 && decl < innerTry, '声明须早于内层 try 块（函数体顶层）');
    assert.ok(save > decl, '保存点引用已声明身份');
    assert.ok(!/_bfLease\b(?!0)/.test(body), '禁止残留未声明的 _bfLease 裸引用');
    assert.ok(!/let _bfStale\b(?!0)/.test(body), '禁止残留未声明的 _bfStale 裸引用');
    assert.match(body, /_bfStale0 = true/, '租约失效置位');
    assert.match(body, /if \(\(done\.ok \|\| done\.fail\) && !_bfStale0\)/, '租约失效时不落盘');
});
test('v3.141 stmLtm 巩固：身份变更后游标状态不回写', () => {
    const body = fnBody('async _stmLtmConsolidate(force = false)', "// [v3.47]");
    const lease = body.indexOf('const _stlLease = this.getCurrentChatId();');
    const call = body.indexOf('await this.stmLtm.consolidate(');
    const guard = body.indexOf('this.getCurrentChatId() !== _stlLease)');
    const assign = body.indexOf('this._stmLtmState = r.state;');
    assert.ok(lease > 0 && call > lease && guard > call && assign > guard, '捕获→await→校验→写回 顺序正确');
    const gi = body.indexOf('if (this.config.config.sessionLeaseGuardEnabled !== false && _stlLease');
    assert.match(body.slice(gi, assign), /return r;/, '失效路径在写回前 return');
});
test('v3.141 故障可见性：租约丢弃进诊断面板并强制显示诊断块', () => {
    assert.match(ui, /_staleTaskDropped/, '面板展示作废次数');
    assert.match(ui, /_lastStaleDrop/, '展示最近一次作废详情');
    assert.match(ui, /_lastRestore\?\.failed\?\.length \|\| s\._staleTaskDropped \? \(\(\) => \{/, '诊断块显示条件含写入失败/恢复失败/租约作废');
    assert.match(src, /_lastStaleDrop = \{ from:.*task: 'stmLtm'/, 'stmLtm 作废带任务标记');
});
