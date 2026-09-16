// tests/v3141_session_lease.test.mjs
// [v3.141] CP-L4 会话租约：await 跨越聊天切换后，旧任务结果不得写入新聊天运行时/存档
// [v3.145] CP-L6 更新：三处路径的开关读取与丢弃诊断已收敛到 _leaseValid/_leaseDrop 单真源，
//          本文件的锚点随之指向统一判据（守卫意图不变：捕获→await→校验→才写回）。
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
test('v3.141 会话租约开关存在且走配置层读取（v3.145 收敛为单真源）', () => {
    assert.match(src, /sessionLeaseGuardEnabled: true/, '配置默认开启');
    const reads = (src.match(/this\.config\.config\.sessionLeaseGuardEnabled/g) || []).length;
    assert.ok(reads >= 1, '开关走配置层读取');
    assert.ok(!/this\.sessionLeaseGuardEnabled/.test(src), '禁止绕过配置层直接读 engine 属性（恒 undefined → 开关失效）');
    // [v3.145] 判据单一真源：开关只在 _leaseValid 读一次，三条异步路径统一调用它（避免判据漂移）
    const body = fnBody('_leaseValid(lease) {', '\n        }');
    assert.match(body, /this\.config\.config\.sessionLeaseGuardEnabled === false\) return true/, '关闭时退回宽松行为（可回退）');
    assert.equal((src.match(/if \(!this\._leaseValid\(_(omr|bf|stl)Lease\)\) \{/g) || []).length, 3, '三处 await 路径均走统一判据');
});
test('v3.141 OMR 提取路径：await 后身份/栅栏变更则整栋丢弃（不写运行时）', () => {
    const body = fnBody('async onMessageReceived(message', '// [v3.33] AI 主动记忆操作 merged');
    const lease = body.indexOf('const _omrLease = { chatId, epoch: this._mutationEpoch }');
    const call = body.indexOf('extracted = await this.extractMemoryWithLLM(message)');
    const guard = body.indexOf('if (!this._leaseValid(_omrLease)) {');
    assert.ok(lease > 0 && call > lease && guard > call, '捕获→await→校验 顺序正确');
    assert.ok(body.indexOf('const chatId = this.getCurrentChatId();') < lease, 'chatId 在租约构造前捕获');
    assert.match(body.slice(guard, guard + 300), /this\._leaseDrop\(_omrLease, 'omr'/, '丢弃走统一诊断且标记任务');
    assert.match(body.slice(guard, guard + 400), /\n\s+return;\s*\n/, '校验失败立即 return（后续写入全不可达）');
});
test('v3.141 backfill：租约身份声明在函数体顶层（保存点在 try 块外，内层声明会 ReferenceError）', () => {
    const body = fnBody('async backfillFloors(floors, onProgress)', '\n        // [v3.47]');
    const decl = body.indexOf('const _bfLease = { chatId: this.getCurrentChatId(), epoch: this._mutationEpoch }');
    const decl0 = body.indexOf('const _bfLease0 = _bfLease.chatId;');
    const cred = body.indexOf('let _bfCred = null;');
    const save = body.indexOf('this.storage.save(_bfLease0');
    const innerTry = body.indexOf('if (!acquired)');
    assert.ok(decl > 0 && decl < innerTry, '租约声明须早于内层 try（函数体顶层）');
    assert.ok(cred > 0 && cred < innerTry, '锁凭证同样声明在顶层（finally 在 try 外，块内 const 会 ReferenceError）');
    assert.ok(decl0 > 0 && decl0 < innerTry, 'chatId 别名在顶层');
    assert.ok(save > decl, '保存点引用已声明身份');
    assert.match(body, /_bfStale0 = true/, '租约失效置位');
    assert.match(body, /if \(\(done\.ok \|\| done\.fail\) && !_bfStale0\)/, '租约失效时不落盘');
    assert.match(body, /this\._leaseDrop\(_bfLease, 'backfill', idx\)/, '逐楼丢弃走统一诊断');
});
test('v3.141 stmLtm 巩固：身份变更后游标状态不回写', () => {
    const body = fnBody('async _stmLtmConsolidate(force = false)', 'async onMessageReceived');
    const lease = body.indexOf('const _stlLease = { chatId: this.getCurrentChatId(), epoch: this._mutationEpoch }');
    const call = body.indexOf('await this.stmLtm.consolidate(');
    const guard = body.indexOf('if (!this._leaseValid(_stlLease)) {');
    const assign = body.indexOf('this._stmLtmState = r.state;');
    assert.ok(lease > 0 && call > lease && guard > call && assign > guard, '捕获→await→校验→写回 顺序正确');
    assert.match(body.slice(guard, assign), /return r;/, '失效路径在写回前 return');
    assert.match(body.slice(guard, assign), /_leaseDrop\(_stlLease, 'stmLtm', -1\)/, '丢弃带任务标记');
});
test('v3.141 故障可见性：租约丢弃进诊断面板并强制显示诊断块', () => {
    assert.match(ui, /_staleTaskDropped/, '面板展示作废次数');
    assert.match(ui, /_lastStaleDrop/, '展示最近一次作废详情');
    assert.match(ui, /_staleTaskDropped \|\| s\._epochDropped \|\| s\.mutex\?\._foreignRelease \? \(\(\) => \{/, '诊断块显示条件含租约/栅栏/越权故障（v3.145 扩展）');
    // [v3.145] task 标记由调用点传入、在 _leaseDrop 内统一落字段（取代四处手写重复对象）
    assert.match(src, /_lastStaleDrop = \{[^}]*task/, '统一诊断记录含任务标记');
});
