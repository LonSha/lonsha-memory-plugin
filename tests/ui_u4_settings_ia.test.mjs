// tests/ui_u4_settings_ia.test.mjs
// U4 信息架构与交互能力定向自测
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');

test('U4: advanced tab possesses real-time search input with proper ID', () => {
    assert.match(src, /id="ls-adv-search"/, '高级搜索输入框必须在册');
    assert.match(src, /class="ls-adv-search-wrap"/, '高级搜索包裹容器必须在册');
    assert.match(src, /advSearch\.addEventListener\('input'/, '高级搜索必须绑定实时输入过滤事件');
});

test('U4: advanced tab 11 functional groups upgraded to expandable details groups', () => {
    const p1 = src.indexOf('data-tab-pane="advanced"');
    const p2 = src.indexOf('data-tab-pane="retrieval"');
    assert.ok(p1 > 0 && p2 > p1, '能够定位高级设置面板范围');
    const adv = src.slice(p1, p2);

    const advDetails = adv.match(/<details class="ls-group ls-adv-group" open>/g) || [];
    assert.equal(advDetails.length, 11, '高级面板 11 个功能组全部升级为 details.ls-adv-group');

    const advSummaries = adv.match(/<summary class="ls-group-title"/g) || [];
    assert.equal(advSummaries.length, 11, '高级面板 11 个分组标题全部升级为 summary.ls-group-title');
});

test('U4: mobile responsive breakpoint and utilities in place', () => {
    assert.match(src, /@media \(max-width: 480px\)/, '480px 窄屏移动端断点必须在册');
    assert.match(src, /\.ls-pad-h \{ padding: 0 8px; \}/, '内联样式工具类 .ls-pad-h 必须就绪');
    assert.match(src, /\.ls-text-warn/, '工具类 .ls-text-warn 必须就绪');
});
