// 审计基建 B：容灾与故障可见性扫描（空 catch / 裸 await / 定时器泄漏 / 事件卸载）
import fs from 'fs';
const src = fs.readFileSync('index.js', 'utf8');
const lines = src.split('\n');
/* ---------- 0. 结构预检（v3.159 补） ---------- */
// 本脚本旧版没有任何 exit 语句：index.js 退化为空文件时它会报「catch 0 / 全部 0 / 定时器 0/0」并以 0 退出。
//   比「数字不对」更危险的是「探测器没扫到任何东西」，因为后者看起来像「干净」。
//   故一面验输入体量，一面验每个探测器至少各自命中一次。
const MIN_SRC_BYTES = 100000;
if (src.length < MIN_SRC_BYTES) {
    console.error('[resilience] index.js 退化（' + src.length + ' 字节），无法进行容灾扫描，审计脚本需同步结构变化');
    process.exit(2);
}
// ---------- B1: 空吞噬 catch ----------
const silentCatch = [];
for (let i = 0; i < lines.length; i++) {
    const mm = lines[i].match(/catch\s*\(([^)]*)\)\s*\{(.*)$/);
    if (!mm) continue;
    // 收集 catch 体
    let body = mm[2], depth = 1, j = i;
    for (const ch of mm[2]) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    while (depth > 0 && ++j < lines.length) {
        body += '\n' + lines[j];
        for (const ch of lines[j]) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    }
    const inner = body.replace(/^[^{]*\{/, '').replace(/\}\s*$/, '').trim();
    const hasLog = /errLog|console\.(error|warn)|log\(|toastr|report|_diag|push\(/.test(inner);
    if (!inner || !hasLog) silentCatch.push({ line: i + 1, snippet: inner.replace(/\s+/g, ' ').slice(0, 70) || '(空)' });
}

// ---------- B2: 定时器注册 vs 清理 ----------
const setI = (src.match(/setInterval\(/g) || []).length;
const clrI = (src.match(/clearInterval\(/g) || []).length;
const setT = (src.match(/setTimeout\(/g) || []).length;
const clrT = (src.match(/clearTimeout\(/g) || []).length;

// ---------- B3: 事件监听注册 vs 卸载 ----------
const onEv = (src.match(/\.on\(|addEventListener\(/g) || []).length;
const offEv = (src.match(/\.off\(|removeEventListener\(/g) || []).length;

// ---------- B4: 未包裹的 await（同一函数内无 try） ----------
let bareAwait = 0;
for (let i = 0; i < lines.length; i++) {
    if (!/\bawait\b/.test(lines[i])) continue;
    let hasTry = false;
    for (let k = i; k >= Math.max(0, i - 40); k--) {
        if (/^\s*(async\s+)?[a-zA-Z_][\w]*\s*\([^)]*\)\s*\{/.test(lines[k]) && k !== i) break;
        if (/\btry\s*\{/.test(lines[k])) { hasTry = true; break; }
    }
    if (!hasTry) bareAwait++;
}

// ---------- B5: 持久化 key 一致性 ----------
const keys = new Set();
for (const km of src.matchAll(/(?:localStorage|extensionSettings)[.\[]\s*(?:getItem|setItem|removeItem)?\(?\s*['"]([^'"]{3,60})['"]/g)) keys.add(km[1]);
for (const km of src.matchAll(/['"](lonsha[a-zA-Z0-9_\-]{2,50})['"]/g)) keys.add(km[1]);

// ---------- B6: 全局污染 ----------
const globals = new Set();
for (const km of src.matchAll(/window\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g)) globals.add(km[1]);

console.log('=== B1 静默吞噬的 catch (' + silentCatch.length + ' / 共 ' + (src.match(/catch\s*\(/g) || []).length + '):');
silentCatch.slice(0, 25).forEach(c => console.log(`  L${c.line}: ${c.snippet}`));
if (silentCatch.length > 25) console.log(`  ...还有 ${silentCatch.length - 25} 处`);
console.log('=== B2 定时器: setInterval', setI, '/ clearInterval', clrI, '| setTimeout', setT, '/ clearTimeout', clrT);
console.log('=== B3 事件: 注册', onEv, '/ 卸载', offEv);
console.log('=== B4 无 try 包裹的 await 行数:', bareAwait, '/ 共', (src.match(/\bawait\b/g) || []).length);
console.log('=== B5 持久化/命名空间 key (' + keys.size + '):');
console.log('  ' + [...keys].slice(0, 30).join(', '));
console.log('=== B6 挂载到 window 的全局 (' + globals.size + '):');
console.log('  ' + [...globals].join(', '));
/* ---------- 7. 终局判定（v3.159 补）：探测器死亡检出 ---------- */
// 这些指标本身不都是缺陷（静默 catch 有时是故意），故不按数值设红线；
//   但「探测器一个都没命中」是确定性的失效信号，必须阻断。
const dead = [];
if (silentCatch.length === 0) dead.push('B1 静默 catch 探测器零命中');
if (setT + setI === 0) dead.push('B2 定时器探测器零命中');
if (onEv + offEv === 0) dead.push('B3 事件探测器零命中');
if ((src.match(/\bawait\b/g) || []).length === 0) dead.push('B4 await 探测器零命中');
if (keys.size === 0) dead.push('B5 持久化键探测器零命中');
if (globals.size === 0) dead.push('B6 全局挂载探测器零命中');
if (dead.length) {
    console.error('');
    console.error('[resilience] ' + dead.length + ' 个探测器失效（零命中），本次结果不具证明力：');
    for (const x of dead) console.error('  x ' + x);
    process.exit(2);
}
console.log('');
console.log('[resilience] 通过：6 个探测器均在工作（上方指标为参考值，静默 catch 不一律视为缺陷）。');
process.exit(0);