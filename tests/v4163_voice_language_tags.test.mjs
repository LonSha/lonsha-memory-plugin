// [v4.163.0 · R26-X3] 语音跳语言标注：原文与译文分列，召回只读原文
// 验收口径：只出现在译文里的词搜不到原文条目（不混用两套文本）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const M = require(join(ROOT, 'multimodal-memory.js'));

const ZH = '他说明天去码头';            // 原文
const EN = 'He said he will go to the wharf tomorrow';  // 译文

function scene() {
    let st = M.createStore();
    st = M.register(st, { modality: 'audio', id: 'v1', floor: 30, transcript: ZH, lang: 'zh', description: '码头那段' }).store;
    st = M.register(st, { modality: 'audio', id: 'v2', floor: 31, transcript: 'またね', lang: 'ja' }).store;
    st = M.register(st, { modality: 'audio', id: 'v3', floor: 32, transcript: '没有语言标的转写' }).store;
    return st;
}

test('X3-1 原文与译文分列：original 是转写，translated 单开一栏', () => {
    const t = M.translate(scene(), 'v1', EN, 'en');
    const bi = M.bilingual(t.store, 'v1');
    assert.equal(bi.ok, true);
    assert.equal(bi.original, ZH);
    assert.equal(bi.translated, EN);
    assert.equal(bi.hasTranslation, true);
});

test('X3-2 转写带语言标；没标就诚实报 und 而不是猜一门语言', () => {
    const st = scene();
    assert.equal(M.bilingual(st, 'v1').lang, 'zh');
    assert.equal(M.bilingual(st, 'v1').langKnown, true);
    assert.equal(M.bilingual(st, 'v2').lang, 'ja');
    assert.equal(M.bilingual(st, 'v3').lang, 'und');
    assert.equal(M.bilingual(st, 'v3').langKnown, false);
});

test('X3-3 只出现在译文里的词搜不到原文条目', () => {
    const t = M.translate(scene(), 'v1', EN, 'en');
    const r = M.recall(t.store, 'wharf');
    assert.equal(r.hits.length, 0, '译文不得进检索面');
    assert.equal(M.recall(t.store, 'tomorrow').hits.length, 0);
});

test('X3-4 负控制：原文里有的词照样搜得到', () => {
    const t = M.translate(scene(), 'v1', EN, 'en');
    const r = M.recall(t.store, '码头');
    assert.ok(r.hits.length >= 1, 'original 「他说明天去码头」里的「码头」必须能命中');
    assert.equal(r.hits[0].id, 'v1');
});

test('X3-5 标注译文只动 translation / lang，不碰转写与描述', () => {
    const st = scene();
    const before = st.entries.find((e) => e.id === 'v1');
    const t = M.translate(st, 'v1', EN, 'en');
    const after = t.entry;
    assert.equal(after.transcript, before.transcript);
    assert.equal(after.description, before.description);
    assert.equal(after.lang, 'en');
    assert.equal(after.translation, EN);
});

test('X3-6 标注译文不改变可检索文本（searchable 与标注前逐字相同）', () => {
    const st = scene();
    const s0 = M.bilingual(st, 'v1').searchable;
    const t = M.translate(st, 'v1', EN, 'en');
    assert.equal(t.searchable, s0);
    assert.equal(M.bilingual(t.store, 'v1').searchable, s0);
});

test('X3-7 标注后两套文本仍不混：原文命中数不变，译本文本仍不可检索', () => {
    const st = scene();
    const before = M.recall(st, '码头').hits.map((h) => h.id);
    const t = M.translate(st, 'v1', EN, 'en');
    assert.deepEqual(M.recall(t.store, '码头').hits.map((h) => h.id), before);
    assert.equal(M.recall(t.store, 'tomorrow').hits.length, 0);
});

test('X3-8 查不到条目 ⇒ 具名 no-such-entry（两个入口一致）', () => {
    const st = scene();
    assert.deepEqual(M.bilingual(st, 'nope').bad, ['no-such-entry']);
    const t = M.translate(st, 'nope', 'x', 'en');
    assert.equal(t.ok, false);
    assert.deepEqual(t.bad, ['no-such-entry']);
});

test('X3-9 只有译文没有原文 ⇒ 不可检索（不因为译文而有可检索文本）', () => {
    let st = M.createStore();
    st = M.register(st, { modality: 'audio', id: 'x1', transcript: '', description: '' }).store;
    const t = M.translate(st, 'x1', EN, 'en');
    assert.equal(t.ok, true);
    const bi = M.bilingual(t.store, 'x1');
    assert.equal(bi.searchable, '');
    assert.equal(bi.hasTranslation, true);
    assert.equal(M.recall(t.store, 'wharf').hits.length, 0);
});

test('X3-10 自检绿', () => {
    assert.equal(M.mmSelfCheck().ok, true, JSON.stringify(M.mmSelfCheck().bad));
});
