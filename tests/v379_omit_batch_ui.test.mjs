import { readFileSync } from 'fs';
import { test } from 'node:test';
import assert from 'node:assert';

const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf-8');
const su = readFileSync('/home/user/lonsha-memory-plugin/settings-ui.js', 'utf-8');

test('=== 1. A: 批量补齐 UI 入口（v3.76 管线首次可触达） ===', () => {
    // 按钮
    assert.ok(su.includes('id="ls-ms-complete"'), '批量补齐按钮');
    assert.ok(su.includes('🔧 批量补齐'), '按钮文案');
    // 绑定
    assert.ok(su.includes("const compBtn = ov.querySelector('#ls-ms-complete');"), '绑定获取');
    assert.ok(su.includes('s.summary.completeMissingFloors(s.config.config, s.llm'), '管线调用');
    // 缺失预检
    assert.ok(su.includes('s.summary.missingFloors((window.SillyTavern?.getContext?.()?.chat?.length || 1) - 1).length'), '缺失预检');
    assert.ok(su.includes('无缺失楼层'), '空缺失提示');
    // 确认门
    assert.ok(su.includes('不含番外/用户楼'), '确认文案说明');
    // 防重入提示
    assert.ok(su.includes('上一批仍在进行中'), 'skipped 提示');
    // BM25 重建
    assert.ok(su.includes('s.bm25.rebuild(s.summary.getActiveSummaries()'), 'BM25 重建');
    // 按钮防重复点击
    assert.ok(su.includes('compBtn.disabled = true;'), '防重复点击');
});

test('=== 2. B: missingFloors 排除番外/用户/系统楼（逻辑复刻） ===', () => {
    // 静态特征
    assert.ok(src.includes('番外楼 / 用户楼 / 系统楼不列入缺失'), '排除注释');
    assert.ok(src.includes("if (m.extra?.lonsha_omit === true) continue;"), '番外楼排除');
    assert.ok(src.includes("if (m.is_user === true) continue;"), '用户楼排除');
    assert.ok(src.includes("if (m.is_system === true && m.extra?.type) continue;"), '系统楼排除');
    // 逻辑复刻
    const missingFloors = (summaries, chat, maxFloor) => {
        const have = new Set(summaries.map(s => s.floor));
        const missing = [];
        for (let f = 0; f <= maxFloor; f++) {
            if (have.has(f)) continue;
            const m = chat?.[f];
            if (m) {
                if (m.extra?.lonsha_omit === true) continue;
                if (m.is_user === true) continue;
                if (m.is_system === true && m.extra?.type) continue;
            }
            missing.push(f);
        }
        return missing;
    };
    const chat = [
        { mes: 'user', is_user: true },                     // 0 用户楼
        { mes: 'ai1' },                                      // 1 AI 楼
        { mes: 'ai2', extra: { lonsha_omit: true } },        // 2 番外楼
        { mes: 'sys', is_system: true, extra: { type: 'narrator' } },  // 3 系统楼
        { mes: 'ai3' },                                      // 4 AI 楼
    ];
    const r1 = missingFloors([{ floor: 1 }], chat, 4);
    assert.deepStrictEqual(r1, [4], '仅 4 楼缺失（0 用户/2 番外/3 系统被排除）');
    const r2 = missingFloors([], chat, 4);
    assert.deepStrictEqual(r2, [1, 4], '全缺失时也只列 AI 楼');
    const r3 = missingFloors([{ floor: 1 }, { floor: 4 }], chat, 4);
    assert.deepStrictEqual(r3, [], '全覆盖无缺失');
});

test('=== 3. C: 番外楼标记 UI（bbs_omit 的 UI 入口） ===', () => {
    // 输入与按钮
    assert.ok(su.includes('id="ls-omit-floor"'), '楼层输入框');
    assert.ok(su.includes('id="ls-omit-mark"'), '标记按钮');
    assert.ok(su.includes('id="ls-omit-unmark"'), '取消按钮');
    assert.ok(su.includes('🎬 标记番外'), '标记文案');
    assert.ok(su.includes('↩️ 取消番外'), '取消文案');
    // 绑定逻辑
    assert.ok(su.includes("m.extra.lonsha_omit = mark;"), '写入标记');
    assert.ok(su.includes('该楼层不存在'), '不存在守卫');
    // 标记时联动移除既有摘要（防残留）
    assert.ok(su.includes('if (mark && s.summary?.removeByFloor)'), '联动清理');
});

test('=== 4. NUL 字节清除回归 ===', () => {
    const buf = readFileSync('/home/user/lonsha-memory-plugin/index.js');
    let n = 0;
    for (const b of buf) if (b === 0) n++;
    assert.strictEqual(n, 0, 'index.js 无 NUL 字节');
    // confirm 语义恢复
    assert.ok(src.includes("String(summaryMatch || '')"), 'confirm 空串兜底恢复');
});

test('=== 5. 回归防护 ===', () => {
    assert.ok(src.includes('[v3.79]'), 'index.js v3.79 标记');
    assert.ok(su.includes('[v3.79]'), 'settings-ui v3.79 标记');
    // v376 管线保留
    assert.ok(src.includes('async completeMissingFloors'), 'v376 管线保留');
});