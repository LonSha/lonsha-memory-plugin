import { readFileSync } from 'fs';
import { test } from 'node:test';
import assert from 'node:assert';

const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf-8');
const su = readFileSync('/home/user/lonsha-memory-plugin/settings-ui.js', 'utf-8');

test('=== 1. A: 版本真值 + 更新检测 静态特征 ===', () => {
    // index.js 暴露 plugin.VERSION
    assert.ok(src.includes('plugin.VERSION = VERSION;'), 'plugin.VERSION 暴露');
    // settings-ui 读真值
    assert.ok(su.includes('const VERSION = plugin.VERSION ||'), 'UI 读真值');
    assert.ok(!su.includes(`'1.3.0' : '1.3.0'`), '假版本 1.3.0 已移除');
    // 更新检测
    assert.ok(su.includes('plugin.checkUpdate = async function()'), 'checkUpdate 定义');
    assert.ok(su.includes('raw.githubusercontent.com/LonSha/lonsha-memory-plugin'), '远端 manifest URL');
    assert.ok(su.includes('data-act="update"'), 'FAB 菜单项');
    assert.ok(su.includes("else if (act === 'update') plugin.checkUpdate();"), 'dispatch');
    // 不缓存设计（柏宝书：防「更新完仍提示」）
    assert.ok(su.includes("cache: 'no-store'"), 'no-store 防缓存');
});

test('=== 2. A: 版本比较逻辑复刻（isNewer） ===', () => {
    // 复刻 checkUpdate 里的 isNewer
    const isNewer = (a, b) => {
        const pa = a.split('.').map(n => parseInt(n, 10) || 0);
        const pb = b.split('.').map(n => parseInt(n, 10) || 0);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const x = pa[i] || 0, y = pb[i] || 0;
            if (x > y) return true;
            if (x < y) return false;
        }
        return false;
    };
    assert.strictEqual(isNewer('3.78.0', '3.77.0'), true, '次版本更新');
    assert.strictEqual(isNewer('3.77.1', '3.77.0'), true, '补丁更新');
    assert.strictEqual(isNewer('4.0.0', '3.99.9'), true, '大版本更新');
    assert.strictEqual(isNewer('3.77.0', '3.77.0'), false, '同版本');
    assert.strictEqual(isNewer('3.76.0', '3.77.0'), false, '旧版本');
    assert.strictEqual(isNewer('3.77', '3.77.0'), false, '缺段补 0 等价');
    assert.strictEqual(isNewer('3.77.0.1', '3.77.0'), true, '多段版本');
    assert.strictEqual(isNewer('', '3.77.0'), false, '空串安全');
    assert.strictEqual(isNewer('abc', '3.77.0'), false, '非数字安全降级');
});

test('=== 3. C: 查询重写上下文增强 ===', () => {
    // rewriteQuery 签名升级
    assert.ok(src.includes('async rewriteQuery(recentText, ctxSnapshot = \'\')'), '签名带 ctxSnapshot 默认值');
    // 快照注入 prompt
    assert.ok(src.includes('[当前状态快照（供指代消解'), '快照注入行');
    assert.ok(src.includes('String(ctxSnapshot).substring(0, 400)'), '快照 400 截断');
    // 调用处构建快照
    assert.ok(src.includes('let _rwSnap = \'\';'), '快照变量');
    assert.ok(src.includes('this.status?.getProtagonist?.()'), '主角来源');
    assert.ok(src.includes('this.scene?.currentKey?.()'), '场景来源');
    assert.ok(src.includes('this.clock?.date'), '时间来源');
    assert.ok(src.includes('this.llm.rewriteQuery(query.text, _rwSnap)'), '调用传参');
    // 向后兼容：无快照时 prompt 不含快照行（逻辑复刻）
    const snapLine = (ctxSnapshot) => ctxSnapshot ? `\n[当前状态快照（供指代消解，查询可引用其中人名/地点/物件）]\n${String(ctxSnapshot).substring(0, 400)}\n` : '';
    assert.strictEqual(snapLine(''), '', '空快照无注入');
    assert.ok(snapLine('主角:剑客/白衣 | 时间:霜月三日').includes('剑客'), '快照内容进入');
    // 长快照截断
    const longSnap = 'x'.repeat(500);
    assert.strictEqual(snapLine(longSnap).length <= 400 + 60, true, '400 截断生效');
});

test('=== 4. B: 携带包预览 ===', () => {
    assert.ok(su.includes('🚚 携带包预览'), '预览消息');
    assert.ok(su.includes('if (!confirm(prevMsg)) { toast(\'已取消打包\'); return; }'), '确认门');
    // 预览消息构造复刻
    const buildPrev = (pack) => {
        const c = pack.counts || {};
        return '摘要 ' + (c.summaries ?? pack.summaries?.length ?? 0) + ' 条\n悬念 ' + (c.suspense ?? pack.suspense?.length ?? 0) + ' 条\n图谱节点 ' + (c.graphNodes ?? 0) + '\n日记 ' + (c.diaries ?? 0) + '\n向量 ' + (c.vectors ?? 0);
    };
    const msg1 = buildPrev({ counts: { summaries: 5, suspense: 2, graphNodes: 10, diaries: 3, vectors: 20 }, summaries: [1, 2, 3, 4, 5] });
    assert.ok(msg1.includes('摘要 5 条'), 'counts 优先');
    const msg2 = buildPrev({ summaries: [1, 2], suspense: [1] });   // 无 counts 降级
    assert.ok(msg2.includes('摘要 2 条'), '无 counts 降级到数组长度');
    assert.ok(msg2.includes('悬念 1 条'), '悬念降级');
    assert.ok(msg2.includes('向量 0'), '缺失字段 0 兜底');
    // 取消路径不落盘（源码结构验证：confirm 在 localStorage 写入之前）
    const confirmIdx = su.indexOf("if (!confirm(prevMsg))");
    const lsIdx = su.indexOf("localStorage.setItem('lonsha_carryover_pack'");
    assert.ok(confirmIdx > 0 && lsIdx > 0 && confirmIdx < lsIdx, 'confirm 在落盘之前');
});

test('=== 5. 语法与回归防护 ===', () => {
    // 版本号不再出现 1.3.0 假值（仅允许注释残留：v3.77 新注释 + v3.11 历史注释）
    const fakeVer = (su.match(/1\.3\.0/g) || []).length;
    assert.ok(fakeVer <= 2, '1.3.0 仅注释残留（实际 ' + fakeVer + ' 处）');
    // 且不在代码逻辑位置（每处 1.3.0 所在行必须含注释符 //）
    const lines = su.split('\n').filter(l => l.includes('1.3.0'));
    for (const l of lines) assert.ok(l.includes('//'), '1.3.0 仅出现在注释中: ' + l.trim().slice(0, 60));
    // 三个补丁标记共存
    assert.ok(src.includes('[v3.77]'), 'index.js v3.77 标记');
    assert.ok(su.includes('[v3.77]'), 'settings-ui v3.77 标记');
});