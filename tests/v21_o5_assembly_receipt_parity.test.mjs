// tests/v21_o5_assembly_receipt_parity.test.mjs — 注入面「组装 ↔ 回执」双向对账 [L21-O5 · v3.465.2]
//   口径：① 组装面接线在真码（_allSrc 写入回执 + projection 透传 + 同代快照）；
//   ② 判定体三档差异各可造（silent / lied / swapped，不许合成一个布尔）；
//   ③ 负控制：破坏组装写入 ⇒ 判据必红；`aligned` 只比长度 ⇒ 重排不被它拦、被 parity 判定体拦。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { judgeParity } from './audit/_assembly_receipt_judge.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PIPE_PATH = path.join(ROOT, 'engine-injection-pipeline.js');

/* ── 组装面接线锚点（字面量只在此声明；恰中 1 次由 A1 自证） ── */
const ANCHORS = {
    asmWrite: '_trace.blockSources.byInjectionOrder = _allSrc.slice();',
    asmAligned: '_trace.blockSources.aligned = (_allSrc.length === _allB.length);',
    projPass: 'byInjectionOrder: _byOrder,',
    projLen: 'byInjectionOrderLen: Number.isFinite(_bs.byInjectionOrderLen) ? _bs.byInjectionOrderLen : null,',
    commitSnap: 'this._lastInjectionTrace = p.trace || null;',
};
const wired = (src) => Object.entries(ANCHORS).filter(([, a]) => !src.includes(a)).map(([k]) => k);

test('v21_o5 A1. 组装面接线五锚齐在真码且各自恰中 1 次', () => {
    const src = fs.readFileSync(PIPE_PATH, 'utf8');
    assert.deepEqual(wired(src), [], '缺失锚点：' + wired(src).join(','));
    for (const a of Object.values(ANCHORS)) {
        assert.equal(src.split(a).length - 1, 1, '锚点必须恰中 1 次：' + a.slice(0, 50));
    }
});

test('v21_o5 B1. 判定体三档差异各可造且互不吞并', () => {
    // equal
    assert.equal(judgeParity(['a', 'b', 'c'], ['a', 'b', 'c']).verdict, 'equal');
    // silent：组装有回执无
    const s = judgeParity(['a', 'b', 'ghost'], ['a', 'b']);
    assert.equal(s.verdict, 'diff');
    assert.deepEqual(s.silent, ['ghost']);
    assert.deepEqual(s.lied, []);
    assert.equal(s.swapped, false, 'silent 档不许冒充 swapped');
    // lied：回执有组装无
    const l = judgeParity(['a'], ['a', 'phantom']);
    assert.deepEqual(l.lied, ['phantom']);
    assert.deepEqual(l.silent, []);
    // swapped：条数相同、同位不同 —— `aligned`（只比长度）拦不住的那一档
    const w = judgeParity(['x', 'y'], ['y', 'x']);
    assert.equal(w.swapped, true);
    assert.deepEqual(w.silent, [], 'swapped 档不许被 silent/lied 吞并');
    assert.deepEqual(w.lied, []);
});

test('v21_o5 B2. swapped 是「总数对」假绿的天敌', () => {
    const assembled = ['resident-1', 'trigger-2', 'fused-3'];
    const receipt = ['resident-1', 'trigger-9', 'fused-3']; // 条数相同、内容换了一格
    const v = judgeParity(assembled, receipt);
    assert.equal(v.verdict, 'diff');
    assert.equal(v.swapped, true, 'length-only 对账（aligned）看不出来，parity 必须看出来');
});

/* ── 负控制：真源码破坏 ── */
function breakSource(mutate) {
    const src = fs.readFileSync(PIPE_PATH, 'utf8');
    const broken = mutate(src);
    assert.notEqual(broken, src, '破坏必须真的改了源码');
    const t = fs.mkdtempSync(path.join(os.tmpdir(), 'o5-negctl-'));
    const p = path.join(t, 'engine-injection-pipeline.js');
    fs.writeFileSync(p, broken);
    return { brokenPath: p, cleanup: () => fs.rmSync(t, { recursive: true, force: true }) };
}

test('v21_o5 N1. 负控制·组装写入改为反向 ⇒ 接线判据必须翻红', () => {
    const anchor = ANCHORS.asmWrite;
    const { brokenPath, cleanup } = breakSource((s) => {
        assert.equal(s.split(anchor).length - 1, 1, '破坏锚点必须恰中 1 次');
        return s.replace(anchor, '_trace.blockSources.byInjectionOrder = _allSrc.slice().reverse();');
    });
    try {
        const broken = fs.readFileSync(brokenPath, 'utf8');
        assert.ok(wired(broken).includes('asmWrite'), '破坏后接线判据必须翻红（组装面写入不再保序）');
        // 且长度对账 aligned 依然恒真 —— 证明旧门（只比长度）放行了这个破坏
        assert.ok(broken.includes(ANCHORS.asmAligned), 'aligned 门在破坏后照样绿 ⇒ 只有 parity 判定体拦得住');
        const v = judgeParity(['a', 'b'], ['b', 'a']);
        assert.equal(v.swapped, true, 'parity 判定体对同一破坏给出 swapped');
    } finally { cleanup(); }
});

test('v21_o5 N2. 负控制·projection 掐断透传 ⇒ 判据必须翻红', () => {
    const anchor = ANCHORS.projPass;
    const { brokenPath, cleanup } = breakSource((s) => {
        assert.equal(s.split(anchor).length - 1, 1, '破坏锚点必须恰中 1 次');
        return s.replace(anchor, 'byInjectionOrder: null,');
    });
    try {
        const broken = fs.readFileSync(brokenPath, 'utf8');
        assert.ok(wired(broken).includes('projPass'), '破坏后接线判据必须翻红（回执面拿不到来源清单）');
    } finally { cleanup(); }
});