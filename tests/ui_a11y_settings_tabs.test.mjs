// UI-A11Y-1：设置面板标签页与抽取节奏切换的无障碍语义（源码层契约）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');

test('tabs expose WAI-ARIA tablist/tab/tabpanel with linked ids', () => {
    assert.match(src, /class="ls-tabs-nav" role="tablist"/);
    for (const t of ['general', 'narrative', 'retrieval', 'advanced']) {
        assert.match(src, new RegExp(`data-tab="${t}" role="tab" id="ls-tab-${t}" aria-controls="ls-pane-${t}"`));
        assert.match(src, new RegExp(`data-tab-pane="${t}" role="tabpanel" id="ls-pane-${t}" aria-labelledby="ls-tab-${t}"`));
    }
    assert.equal((src.match(/role="tab" [^>]*aria-selected="true"/g) || []).length, 1, 'exactly one tab selected initially');
});

test('tab switching keeps aria-selected/tabindex in sync and supports arrow/Home/End keys', () => {
    assert.match(src, /b\.setAttribute\('aria-selected', on \? 'true' : 'false'\)/);
    assert.match(src, /b\.tabIndex = on \? 0 : -1/);
    for (const k of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) assert.ok(src.includes(k + ':'), k);
});

test('mode pills are real buttons in a radiogroup with aria-checked kept in sync', () => {
    assert.match(src, /role="radiogroup" aria-label="抽取节奏"/);
    assert.equal((src.match(/<button type="button" class="ls-mode-pill/g) || []).length, 4, '3 settings pills + 1 home-card template');
    assert.match(src, /class="ls-home-modes" role="radiogroup"/);
    assert.match(src, /p\.setAttribute\('aria-checked', on \? 'true' : 'false'\)/);
    assert.equal((src.match(/<div class="ls-mode-pill/g) || []).length, 0, 'no div-as-button pills remain');
    assert.match(src, /p\.setAttribute\('aria-checked', p === pill \? 'true' : 'false'\)/);
    assert.match(src, /\.ls-mode-pill:focus-visible/);
});