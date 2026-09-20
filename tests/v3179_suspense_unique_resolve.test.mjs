// tests/v3179_suspense_unique_resolve.test.mjs
// [v3.179] 悬念簿了结的模糊回退必须【唯一命中才结】——与承诺账本 resolvePromise 同族纪律。
//
// 缺陷背景（本版治理对象，与 v3.178.0 承诺回路同族）：
//   提取 prompt 要求 AI 在 plans_resolve 里「id 必须使用【悬念簿】中列出的编号（如 s3）」，
//   但 resolve() 的 content 回退路径用 find 取【首个】模糊命中：
//     it = this.items.find(x => status==='open' && (x.content.includes(key) || key.includes(x.content)));
//   当 AI 回引里写了半句 / 泛词（如「出去」「约定」），会把一条不相干的悬项当成目标结掉，
//   且全程无痕——悬念簿自报「了结」，正文其实没发生。
//   对照：承诺账本 resolvePromise 在 v3.178.0 明确「宁可漏结，不可错结；多条并存一律不动」。
//   悬念簿是同一主线的另一半，尚未收口。
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (msg) => { pass++; console.log('✓ ' + msg); };
const bad = (msg) => { fail++; console.log('✗ ' + msg); };

function braceEnd(s, open) {
    let depth = 0;
    for (let i = open; i < s.length; i++) {
        const ch = s[i];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return i; }
        else if (ch === "'" || ch === '"' || ch === '`') { const q = ch; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } }
        else if (ch === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; }
    }
    return -1;
}
function extractClass(source, name) {
    const start = source.indexOf(`class ${name} {`);
    if (start < 0) throw new Error('missing class ' + name);
    const brace = source.indexOf('{', start);
    return source.slice(start, braceEnd(source, brace) + 1);
}
const mkSuspense = (source = src) => new Function(`
    ${extractClass(source, 'SuspenseBook')}
    return new SuspenseBook();
`)();

console.log('=== 1. 静态锚点：唯一命中纪律已落地 ===');
{
    assert.ok(src.includes('const cands = key ? this.items.filter('), 'resolve 必须用 filter 收候选集（非 find 取首个）');
    assert.ok(src.includes('if (cands.length === 1) it = cands[0];'), '必须唯一命中才结');
    assert.ok(src.includes('[v3.179]'), '版本标记存在');
    // 旧的一步式 find 取首个不得再出现
    assert.ok(!src.includes('it = this.items.find(x => x.status === \'open\' && (x.content.includes(key) || key.includes(x.content)));'),
        '旧的 find 取首个实现必须已被移除');
    ok('唯一命中判据 / 版本标记齐备，旧取首个实现已移除');
}

console.log('=== 2. 版本有效 ===');
{
    assert.ok(/const VERSION = '3\.(1[7-9]\d|[2-9]\d{2,})\./.test(src), '版本必须 >= 3.179.0');
    ok('版本号有效');
}

console.log('=== 3. 精确路径必须不受影响（行为守恒） ===');
{
    // 按 sid 了结（AI 首选路径）
    const s1 = mkSuspense();
    s1.add('plan', '去城南找老中医取验方', 3);
    s1.add('suspense', '井里的蛙鸣声从何而来', 4);
    const first = s1.openItems()[0];
    const r = s1.resolve(first.sid, 'done', '已取回', 9);
    assert.equal(r && r.sid, first.sid, '按 sid 必须精确命中');
    assert.equal(r.status, 'resolved');
    assert.equal(s1.openItems().length, 1, '另一条必须保持 open');
    ok('按 sid 精确了结：目标正确、旁条不动');
}
{
    // 按完整 content 了结（findExact 路径，idOrContent === content）
    const s2 = mkSuspense();
    s2.add('plan', '去城南找老中医取验方', 3);
    const only = s2.openItems()[0];
    const r = s2.resolve(only.content, 'done', '完成', 9);
    assert.ok(r, '完整内容回引必须命中');
    assert.equal(r.content, only.content);
    ok('按完整 content 回引：精确了结');
}

console.log('=== 4. 唯一模糊命中：结 ===');
{
    const s3 = mkSuspense();
    s3.add('plan', '去城南找老中医取验方', 3);
    s3.add('suspense', '井里的蛙鸣声从何而来', 4);
    // 只与第一条内容重叠的片段
    const r = s3.resolve('老中医', 'done', '拜访完毕', 9);
    assert.ok(r, '唯一模糊命中必须结掉');
    assert.equal(r.content, '去城南找老中医取验方');
    ok('唯一模糊命中：结掉正确目标');
}

console.log('=== 5. 多条模糊命中：必须不动（宁可漏结，不可错结）===');
{
    const s = mkSuspense();
    const a = s.add('plan', '约好一起去看城南灯会', 3);
    const b = s.add('plan', '约好陪阿婆去城北庙里还愿', 4);
    const ra = s.resolve('约好', 'done', '都做了', 9);
    assert.equal(ra, null, '泛词命中多条时必须返回 null，不得错结');
    assert.equal(s.openItems().length, 2, '两条必须都保持 open（漏结可容忍，错结不可）');
    // 精确到能唯一区分时，才可结
    const rb = s.resolve('城北庙里还愿', 'done', '做完了', 10);
    assert.ok(rb && rb.content.includes('城北'), '收窄到唯一命中后可结');
    assert.equal(s.openItems().length, 1);
    ok('多条并存：不动；收窄到唯一后：可结');
}

console.log('=== 6. 空回引 / 未知回引：不结、不抛、不得错结 ===');
{
    const s = mkSuspense();
    s.add('plan', '去城南找老中医取验方', 3);
    assert.equal(s.resolve('', 'done', '', 9), null, '空 key 必须不动');
    assert.equal(s.resolve('完全不相关的字符串xyz', 'done', '', 9), null, '无命中必须不动');
    assert.equal(s.openItems().length, 1, '悬项必须保持 open');
    ok('空/无命中回引：不动且不抛');
}

console.log('=== 7. 负控制：退回「取首个」后行为必须改变 ===');
{
    const ANCHOR = 'if (cands.length === 1) it = cands[0];';
    const hits = src.split(ANCHOR).length - 1;
    assert.equal(hits, 1, `破坏锚点必须恰中 1 次（实际 ${hits}）`);

    const brokenSrc = src.replace(ANCHOR, 'if (cands.length >= 1) it = cands[0]; // [negctl] 退回取首个');
    const bs = mkSuspense(brokenSrc);
    bs.add('plan', '约好一起去看城南灯会', 3);
    bs.add('plan', '约好陪阿婆去城北庙里还愿', 4);
    const rr = bs.resolve('约好', 'done', '都做了', 9);
    assert.ok(rr, '破坏后（取首个）泛词必然错结一条——证明负控制可观测');
    assert.equal(bs.openItems().length, 1, '破坏后只剩一条 open（错结已发生）');

    // 原版同址必须拒绝
    const os = mkSuspense();
    os.add('plan', '约好一起去看城南灯会', 3);
    os.add('plan', '约好陪阿婆去城北庙里还愿', 4);
    assert.equal(os.resolve('约好', 'done', '都做了', 9), null, '原版必须拒绝泛词错结');
    assert.equal(os.openItems().length, 2, '原版两条均保持 open');
    ok('负控制成立：退回取首个 ⇒ 错结发生；原版同址 ⇒ 拒绝');
}

console.log(`\n[v3.179] ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
