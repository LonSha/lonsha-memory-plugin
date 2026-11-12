// tests/v21_x1_defense_consistency.test.mjs — L21-X1 防御叙事一致性守门 [v3.465.3]
// 规格：.agents/notes/proposed/feature/2026-11-11-product-expansion-v21.md § L21-X1
// 八条判定 + 三条真源码破坏负控制（压态/改铁律/恒放行都必须被当场识破）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const guard = (await import('../defense-narrative-consistency-guard.js')).default
    ?? (await import('../defense-narrative-consistency-guard.js'));

const S = guard.STATES;
const LF = [{ id: 'lf_1', text: '你答应过帮我修复收音机', floor: 3, createdAt: 1 }];

test('x1 A1. contradicts：铁律有记录 + 句子在否认 ⇒ 挡下并给替代措辞', () => {
    const v = guard.guard('我没明确答应过帮你', LF);
    assert.equal(v.state, S.CONTRADICTS);
    assert.ok(v.reason.includes('与已锁定事实不符'));
    assert.ok(v.suggested && v.suggested.includes('答应'));
    assert.equal(v.matchedFactId, 'lf_1');
});

test('x1 A2. 铁律里没有这件事 ⇒ 放行（不阻止自我欺骗，那本就是人设）', () => {
    const v = guard.guard('我从没答应过帮小明搬家', LF); // 铁律只有收音机
    assert.equal(v.state, S.CONSISTENT);
});

test('x1 A3. 无铁律 ⇒ 一律放行', () => {
    assert.equal(guard.guard('我从未背叛过任何人', []).state, S.CONSISTENT);
});

test('x1 A4. 承认事实 ⇒ consistent，原样放行', () => {
    const v = guard.guard('我当时确实答应过', LF);
    assert.equal(v.state, S.CONSISTENT);
});

test('x1 A5. 无法识别动作 ⇒ strained（诚实给「无法确定」，不假装一致）', () => {
    const v = guard.guard('那天天气不错', LF);
    assert.equal(v.state, S.STRAINED);
    assert.ok(v.reason.includes('无法确定') || v.reason.includes('无法'));
});

test('x1 A6. 绝不修改防御引擎输出：guardDistortions 原样回填 subjectiveTake', () => {
    const d = [{ rawFact: 'x', mechanism: 'rationalize', subjectiveTake: '我没明确答应过帮你' }];
    const out = guard.guardDistortions(d, LF);
    assert.equal(out[0].subjectiveTake, '我没明确答应过帮你'); // 原文
    assert.equal(out[0].verdict.state, S.CONTRADICTS);          // 但判定为 contradicts
    assert.deepEqual(d[0].subjectiveTake, out[0].subjectiveTake);
});

test('x1 A7. 绝不修改铁律：传入数组不被守卫写回', () => {
    const lf = [{ id: 'lf_9', text: '你答应过帮我修复收音机' }];
    const before = JSON.stringify(lf);
    guard.guard('我没答应过', lf);
    guard.guardDistortions([{ subjectiveTake: '我没答应过' }], lf);
    assert.equal(JSON.stringify(lf), before);
});

test('x1 A8. 面板摘要：contradicts 数 >0 才出摘要，且不带技术黑话', () => {
    const vs = guard.guardDistortions(
        [{ subjectiveTake: '我没明确答应过帮你' }, { subjectiveTake: '那天天气不错' }], LF);
    const s = guard.summarize(vs);
    assert.ok(s.includes('对不上'));
    assert.ok(!/state|verdict|contradicts| strained/.test(s));
    assert.equal(guard.summarize([{ verdict: { state: S.CONSISTENT } }]), '');
});

// ── 负控制 N1：把 contradicts 压成 strained ⇒ 红 ──
test('x1 N1. 源码破坏：守卫把 contradicts 压成 strained 必须被识破', () => {
    const src = readFileSync(new URL('../defense-narrative-consistency-guard.js', import.meta.url), 'utf8');
    // CONTRADICTS 只允许出现在 STATES 定义与返回对象里，不允许在 guard 判定链中被吞
    const chain = src.slice(src.indexOf('function guard('), src.indexOf('function guardDistortions('));
    assert.ok(chain.includes('CONTRADICTS'), 'guard 判定链必须产出 contradicts（不许压成 strained）');
    const bad = src.replace(/out\.state = STATES\.CONTRADICTS/g, 'out.state = STATES.STRAINED');
    assert.ok(bad !== src, '若守卫把 contradicts 压成 strained，N1 判据必须能构造出变体');
    // 变体语义自证：替换后的源码模块必须产出 strained 而非 contradicts（证明锚点真锁在产出点）。
    //   注意：data: URL 恒按 ESM 加载，本模块是 UMD —— 无 module/define ⇒ 走 globalThis 挂载分支。
    const tmpUrl = 'data:text/javascript;base64,' + Buffer.from(bad).toString('base64');
    return import(tmpUrl).then(() => {
        const g2 = globalThis.LonShaDefenseConsistency;
        assert.ok(g2 && typeof g2.guard === 'function', 'UMD globalThis 分支必须可取到守卫');
        assert.equal(g2.guard('我没明确答应过帮你', LF).state, 'strained');
        assert.notEqual(g2.guard('我没明确答应过帮你', LF).state, 'contradicts');
    });
});

// ── 负控制 N2：让守卫修改铁律 ⇒ 红 ──
test('x1 N2. 源码破坏：守卫写回铁律数组必须被识破（guard/guardDistortions 不得写回 lf）', () => {
    const src = readFileSync(new URL('../defense-narrative-consistency-guard.js', import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('function guard('));
    // 禁止 push/sort/splice/pop/shift/unshift/fill 直接作用于 facts/lockedFacts
    assert.ok(!/\bfacts\s*\.\s*(push|splice|sort|pop|shift|unshift|fill)\b/.test(body),
        '守卫不得对铁律数组做任何写操作');
    assert.ok(!/lockedFacts\s*=\s*(?!Array\.isArray)/.test(body.replace('const facts = Array.isArray(lockedFacts) ? lockedFacts : [];', '')),
        '守卫不得重新赋值 lockedFacts 引用');
});

// ── 负控制 N3：让守卫恒放行 ⇒ 红 ──
test('x1 N3. 源码破坏：恒放行（删 contradicts 分支/恒 CONSISTENT）必须被识破', () => {
    const src = readFileSync(new URL('../defense-narrative-consistency-guard.js', import.meta.url), 'utf8');
    const chain = src.slice(src.indexOf('function guard('), src.indexOf('function guardDistortions('));
    // negated 判定必须真实存在且其分支里产 CONTRADICTS
    assert.ok(chain.includes('sig.negated'), 'guard 必须判定否定形态');
    const neg = chain.slice(chain.indexOf('if (sig.negated)'));
    assert.ok(neg.includes('CONTRADICTS'), '否定+铁律命中必须走 contradicts 分支（不许恒放行）');
});

// ── 接线面：orchestrator 阶段 3.12 必须真消费守卫 ──
test('x1 W1. 接线：orchestrator 在 ego-defense 之后调用守卫并存 verdicts / 注入提醒', () => {
    const orch = readFileSync(new URL('../memory-symphony-orchestrator.js', import.meta.url), 'utf8');
    const egoAt = orch.indexOf('[阶段 3.12');
    const nextAt = orch.indexOf('[阶段 3.13');
    assert.ok(egoAt > 0 && nextAt > egoAt, '阶段 3.12/3.13 锚点必须都存在');
    const seg = orch.slice(egoAt, nextAt); // 整个阶段 3.12 段
    assert.ok(seg.includes('defense-narrative-consistency-guard'), '取库口必须指向守卫模块');
    assert.ok(seg.includes('guardDistortions') && seg.includes('_defenseConsistencyVerdicts'), '必须真调用守卫并存判定');
    assert.ok(seg.includes('summarize'), 'contradicts 时必须注入提醒指令');
});