// tests/v3178_promises_closure.test.mjs
// [v3.178] 承诺回路闭环测试：提取 prompt 声明的 promises_resolve 必须有产品消费口，
// 且注入区必须携带 prom_id（否则 AI 无从回引，"履行/违约" 永不可能发生）。
//
// 缺陷背景（本版治理对象）：
//   · 提取 prompt 第 761 行声明 "9k. promises_resolve ... 只能处理【未竟约定与承诺】中已有的编号"，
//     但应用块从不读取 extracted.promises_resolve —— 承诺一旦登记便永久滞留【未竟约定】注入区。
//   · 注入文本格式为 `- [约定|角色|截止第N楼]`，不含 prom_id ⇒ 即便想回引也无从下手。
//   两层断裂叠加：提取端声明了、注入端不给钥匙、消费端不存在。
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
const errLog = () => {};
const mkWorldProgress = (source = src) => new Function('errLog', `
    ${extractClass(source, 'WorldProgress')}
    return new WorldProgress();
`)(errLog);

console.log('=== 1. 静态锚点：回路三端齐备 ===');
{
    // 消费端：应用块必须读 promises_resolve 并调 resolvePromise
    assert.ok(src.includes('extracted.promises_resolve'), '应用块必须读取 extracted.promises_resolve');
    assert.ok(src.includes('this.worldProg.resolvePromise('), '应用块必须调用 worldProg.resolvePromise');
    // 钥匙端：注入文本必须携带 prom_id
    assert.ok(src.includes('`- [${p.id}|约定|'), '注入文本必须携带 prom_id（AI 回引的钥匙）');
    // 方法端
    assert.ok(/resolvePromise\(id, status = 'fulfilled'/.test(src), 'WorldProgress 必须实现 resolvePromise');
    // 记账端
    assert.ok(src.includes('resolvedCount'), 'resolve 结果必须纳入应用块记账');
    ok('promises_resolve 消费口 / prom_id 钥匙 / resolvePromise 方法 / 记账 四位齐备');
}

console.log('=== 2. 版本有效 ===');
{
    assert.ok(/const VERSION = '3\.(1[7-9]\d|[2-9]\d{2,})\./.test(src), '版本必须 >= 3.178.0');
    ok('版本号有效');
}

console.log('=== 3. resolvePromise 动态行为 ===');
{
    const wp = mkWorldProgress();
    const p1 = wp.addPromise({ character: '爱丽丝', content: '归还禁忌典籍', deadlineFloor: 15, floor: 5 });
    assert.equal(p1.status, 'pending');

    // 按 id 履行
    const r1 = wp.resolvePromise(p1.id, 'fulfilled', 9);
    assert.equal(r1.status, 'fulfilled');
    assert.equal(r1.resolvedFloor, 9);
    assert.ok(r1.resolvedAt > 0, '必须打上了结时间戳');

    // 已了结的承诺离开活跃注入区
    const inj = wp.toInjection();
    assert.ok(!inj.some(i => i.text.includes(p1.id)), '已履行的承诺不再出现在活跃注入区');
    ok('按 id 履行：状态/prom_id/时间戳/注入移除 全链路正确');
}
{
    const wp = mkWorldProgress();
    const p = wp.addPromise({ character: '鲍勃', content: '赴约', deadlineFloor: 10, floor: 2 });
    const r = wp.resolvePromise(p.id, 'broken', 4);
    assert.equal(r.status, 'broken', 'status=broken 必须判违约');
    ok('按 id 违约：broken 分支正确');
}
{
    // 幂等：已了结不重复
    const wp = mkWorldProgress();
    const p = wp.addPromise({ character: 'C', content: 'x', floor: 1 });
    assert.ok(wp.resolvePromise(p.id, 'fulfilled', 2), '首次了结成功');
    assert.equal(wp.resolvePromise(p.id, 'broken', 3), null, '二次了结必须返回 null（幂等，防状态翻转）');
    assert.equal(p.status, 'fulfilled', '二次调用不得改写已了结状态');
    ok('幂等：已了结承诺不可被二次改写（防 fulfilled→broken 翻转）');
}
{
    // 未知 id 不抛、返回 null
    const wp = mkWorldProgress();
    assert.equal(wp.resolvePromise('prom_不存在', 'fulfilled', 1), null);
    assert.equal(wp.resolvePromise('', 'fulfilled', 1), null);
    assert.equal(wp.resolvePromise(null, 'fulfilled', 1), null);
    ok('未知/空 id 返回 null 且不抛');
}
{
    // 默认参数
    const wp = mkWorldProgress();
    const p = wp.addPromise({ character: 'D', content: 'y', floor: 1 });
    const r = wp.resolvePromise(p.id);
    assert.equal(r.status, 'fulfilled', '缺省 status 应为 fulfilled');
    ok('缺省参数：默认履行');
}

console.log('=== 4. 注入格式携带 prom_id ===');
{
    const wp = mkWorldProgress();
    const p = wp.addPromise({ character: '爱丽丝', content: '归还借阅的禁忌典籍', deadlineFloor: 15, floor: 5 });
    const inj = wp.toInjection();
    const bloc = inj.find(i => i.id === 'wp_promises');
    assert.ok(bloc, '承诺注入块必须存在');
    assert.ok(bloc.text.includes(p.id), '注入文本必须含 prom_id（AI 据此在 promises_resolve 中回引）');
    assert.ok(bloc.text.includes('爱丽丝'), '人名与内容仍保留');
    assert.ok(bloc.text.includes('约定'), '语义标签仍保留');
    ok('注入块携带 prom_id + 人名 + 语义标签');
}

console.log('=== 5. 负控制：破坏幂等后行为必须改变 ===');
{
    const ANCHOR = "if (p.status === 'fulfilled' || p.status === 'broken') return null; // 幂等：已了结不重复";
    const hits = src.split(ANCHOR).length - 1;
    assert.equal(hits, 1, `破坏锚点必须恰中 1 次（实际 ${hits}）`);

    const brokenSrc = src.replace(ANCHOR, '// [negctl] 幂等守卫已移除');
    const bwp = mkWorldProgress(brokenSrc);
    const p = bwp.addPromise({ character: 'N', content: 'negctl', floor: 1 });
    bwp.resolvePromise(p.id, 'fulfilled', 2);
    const second = bwp.resolvePromise(p.id, 'broken', 3);
    assert.ok(second, '破坏幂等后二次调用必须能成功（证明负控制真能观测到行为差异）');
    assert.equal(second.status, 'broken', '破坏后状态会被翻转 ⇒ 原版判据非恒真');

    // 原版同一逻辑下必须为 null
    const o2 = mkWorldProgress();
    const op = o2.addPromise({ character: 'O', content: 'orig', floor: 1 });
    o2.resolvePromise(op.id, 'fulfilled', 2);
    assert.equal(o2.resolvePromise(op.id, 'broken', 3), null, '原版必须拒绝二次改写');
    ok('负控制成立：移除幂等守卫 ⇒ 行为改变；原版同址 ⇒ 拒绝');
}

console.log(`\n[v3.178] ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);