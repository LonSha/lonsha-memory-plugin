// 审计基建 I（v3.165）：声称真实性面扫描（成功声明的失败出口 / 派生性 / 棘轮）
// ------------------------------------------------------------
// 为什么存在：
//   第八条不变量（v3.164，scan_event_lifecycle）管的是「事件到底有没有接上」。
//   它的四次修复留下了一个同源的洞：**状态被登记了，但登记不由事实驱动**。
//   本脚本把那个洞抽成一个独立判定面：**打印出来的结论本身可不可信**。
//
//   实测缺陷（v3.165 修前）：
//     1. registerEvents 无条件打印 `✓ 事件监听已注册` —— 即便 7 个 bindEvent
//        全部返回 false（未就绪 / 类型无效 / on 抛错）也照样报成功。日志与真实
//        接线状态相反，**比没有日志更坏**：它把排查方向指向「已注册但没触发」，
//        而真因是「根本没注册」。
//     2. loadModules 在模块缺失时**什么都不做**：原写法 `if (typeof X !== 'undefined')
//        { 加载 + 报成功 }`，缺失时日志里只有成功、没有失败——而「模块没加载」恰好
//        是最需要看见的那件事（图扩散静默退回朴素检索路径：功能变差但毫无迹象）。
//     3. extractAndSave 的 `✓ 完成` 落在 if/else 之外 —— 连「被确认状态机拒绝、根本
//        没写盘」也报「完成」，重启即失。
//     4. importCarryoverSeed 空种子照样报 `✓ 导入成功` 并返回 true —— 用户以为承接
//        了前情，实际什么都没导入。
//     5. `✓ 初始化完成 (LLM+向量检索+图扩散+可视化已启用)`：**复合能力声称写成常量**，
//        四个能力压成一个字符串，只要有一个模块缺失它就必错。
//
// 判定策略：
//   F1 每个成功声称点，其所在方法体内必须有失败出口（⚠️ / console.error / catch）。
//      立论：一个方法如果只能成功、没有任何地方说失败，那它的成功又案就是**常量**，
//      与执行结果无关。失败出口的存在性是「这句成功语已被事实否定过」的最低结构证据。
//   F2 复合能力声称必须由状态变量派生：✓ 文案里同时提到 >= 2 个能力名时，
//      模板字符串必须含 ${ 插值。能力名固定清单（LLM / 向量检索 / 图扩散 / 可视化 ...）。
//   F3 失败出口数量下限（⚠️ / console.error）—— 防后来者只往成功方向加日志。
//   F4 空 catch 棘轮：真正空白（无注释、无日志）的 catch 数不得超过已登记上限。
//      空 catch 未必是缺陷（容灾降级经常需要），但**静默增长**一定是。
//   F5 结构健康 + 声称点下限 + fail-closed（退出码 2）。
//
// 退出码：0=卫生  1=存在真缺陷  2=结构漂移（探测器失效）
// 夹具通道：LONSHA_AUDIT_FIXTURE=1 放宽下限，供单测塞合成仓库。
import fs from 'fs';
import path from 'path';
const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const idxPath = path.join(ROOT, 'index.js');
if (!fs.existsSync(idxPath)) {
    console.error('[claim-truthfulness] 找不到 index.js，工作目录可能不对（' + ROOT + '）');
    process.exit(2);
}
const idx = fs.readFileSync(idxPath, 'utf8');
const MIN_BYTES = FIXTURE_MODE ? 1 : 100000;
if (idx.length < MIN_BYTES) {
    console.error('[claim-truthfulness] index.js 退化（' + idx.length + ' 字节），无法分析声称面，审计脚本需同步结构变化');
    process.exit(2);
}
const CHECK = '\u2713';        // ✓
const WARNMARK = '\u26a0\ufe0f'; // ⚠️
const MIN_CLAIMS = FIXTURE_MODE ? 1 : 8;
const MIN_WARNMARKS = FIXTURE_MODE ? 0 : 12;
const MIN_ERRORS = FIXTURE_MODE ? 0 : 8;
// 空 catch 棘轮：真实空白 catch 数不得超过已登记上限（新增即阻断）。
//   修复前基线 14 处。允许持平，不允许增长。
const EMPTY_CATCH_CEILING = FIXTURE_MODE ? 0 : 14;
// 能力名清单：出现在 ✓ 文案里即视为「声称了某个能力」。
//   只放可被布尔开关控制的能力（模块加载 / 子系统启用），不放纯动作词。
const CAPABILITIES = ['LLM', '\u5411\u91cf\u68c0\u7d22', '\u56fe\u6269\u6563', '\u53ef\u89c6\u5316', '\u56fe\u8c31',
    '\u5d4c\u5165', 'BGE', '\u53ec\u56de', '\u6458\u8981', '\u65e5\u8bb0', '\u65f6\u95f4\u7ebf', '\u60ac\u5ff5\u7c3f',
    '\u573a\u666f\u6811', '\u7269\u54c1\u53f0\u8d26', '\u56de\u54cd\u6c60', 'POV', '\u53cd\u601d', '\u89d2\u8272\u72b6\u6001'];
// 剥注释（保留换行与偏移，行号才可定位）：注释里提到 ✓ 是说明文字，不是声称点。
//   与 scan_event_lifecycle 同一策略与同一理由：不连字符串字面量一起剥（手写剥离器
//   一旦把正则字面量误判为字符串就会从某处开始吞掉大段代码，比不剥更危险）。
function stripComments(code) {
    const out = code.split('');
    let i = 0;
    while (i < code.length) {
        const c = code[i];
        if (c === '/' && code[i + 1] === '/') {
            while (i < code.length && code[i] !== '\n') { out[i] = ' '; i++; }
            continue;
        }
        if (c === '/' && code[i + 1] === '*') {
            out[i] = ' '; out[i + 1] = ' '; i += 2;
            while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
                if (code[i] !== '\n') out[i] = ' ';
                i++;
            }
            if (i < code.length) { out[i] = ' '; out[i + 1] = ' '; i += 2; }
            continue;
        }
        i++;
    }
    return out.join('');
}
const bare = stripComments(idx);
/* ---------- 方法区间表 ---------- */
// 声称点的「所属方法」必须真的抽出来：不看区间就只能看到「文件里有 ⚠️」，
//   而那种宽松判据在「十个方法里只有一个写了失败出口」时照样全绿。
//   匹配行首 8 空格缩进的方法定义（本文件全部类方法均是此缩进），
//   并只对 `this.xxx` 定义块做花括号配平——不用正则猜函数体。
function methodSpans(src) {
    const spans = [];
    const re = /^ {8}(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\([^;\n]*?\)\s*\{/gm;
    let m;
    while ((m = re.exec(src)) !== null) {
        const start = m.index;
        let i = m.index + m[0].length - 1, depth = 0;
        for (; i < src.length; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') { depth--; if (depth === 0) break; }
        }
        spans.push({ name: m[1], start, end: i, lo: src.slice(0, start).split('\n').length, hi: src.slice(0, i).split('\n').length });
    }
    return spans;
}
const spans = methodSpans(bare);
if (spans.length < (FIXTURE_MODE ? 1 : 200)) {
    console.error('[claim-truthfulness] 仅识别出 ' + spans.length + ' 个方法区间，探测器已失效');
    process.exit(2);
}
function ownerOf(pos) {
    let best = null;
    for (const s of spans) {
        if (pos >= s.start && pos <= s.end) {
            if (!best || (s.end - s.start) < (best.end - best.start)) best = s;
        }
    }
    return best;
}
const defects = [];
/* ---------- F1：每个成功声称点所在方法必须有失败出口 ---------- */
const claims = [];
for (const m of bare.matchAll(new RegExp(CHECK, 'g'))) {
    const line = bare.slice(0, m.index).split('\n').length;
    const owner = ownerOf(m.index);
    claims.push({ line, owner });
}
if (claims.length < MIN_CLAIMS) {
    console.error('[claim-truthfulness] 仅观测到 ' + claims.length + ' 个成功声称点（低于下限 ' + MIN_CLAIMS + '），声称面探测器已失效');
    process.exit(2);
}
const noOwner = claims.filter(c => !c.owner);
for (const c of noOwner) {
    defects.push('F1 成功声称未落在任何方法体内（行 ' + c.line + '）：无法判定其是否有失败出口，声称面判据失效');
}
const orphanClaims = [];
for (const c of claims) {
    if (!c.owner) continue;
    const body = bare.slice(c.owner.start, c.owner.end);
    const hasFail = body.includes(WARNMARK) || /console\.error\s*\(/.test(body) || /catch\s*\(/.test(body);
    if (!hasFail) orphanClaims.push(c.line + '（' + c.owner.name + '）');
}
if (orphanClaims.length) {
    defects.push('F1 有 ' + orphanClaims.length + ' 个成功声称点所在方法没有任何失败出口：' + orphanClaims.join('/') +
        ' —— 只能成功、没有地方说失败，其成功文案就是常量，与执行结果无关（日志与真实状态相反比没日志更坏）');
}
/* ---------- F2：复合能力声称必须由状态变量派生 ---------- */
// 命中的是「同一句成功文案里声称了 >= 2 个能力」。单能力声称（「提取完成」「已加载历史记忆」）
//   本身是事实陈述，不属于本判据；而把多个能力压成一个常量字符串，只要有一个缺失就必错。
//   插值要求只看那一行（文案就在那一行里），不是看整个方法——否则方法里任何一处 ${ 都能过。
// 关键：不能只看「这一行有没有 ${」—— 那一行的 `${PLUGIN_NAME}` 会让判据自满，
//   而四个能力名依旧是写死的字面文本（负控制实测：上一版就是被它骗过的，
//   跑 v3.164 的旧源码时报「复合声称 0 处未派生」）。正确判据是**剥掉全部插值后**
//   再看剩余的字面文本里还剩几个能力名：剩 >= 2 个，说明这些能力根本没由状态派生。
function stripInterpolations(line) {
    let out = '', i = 0;
    while (i < line.length) {
        if (line[i] === '$' && line[i + 1] === '{') {
            i += 2;
            let depth = 1;
            while (i < line.length && depth > 0) {
                if (line[i] === '{') depth++;
                else if (line[i] === '}') depth--;
                if (depth > 0) i++;
            }
            i++;
            continue;
        }
        out += line[i];
        i++;
    }
    return out;
}
const flatClaims = [];
for (const m of bare.matchAll(new RegExp(CHECK, 'g'))) {
    const at = bare.lastIndexOf('\n', m.index) + 1;
    let end = bare.indexOf('\n', m.index);
    if (end < 0) end = bare.length;
    const line = bare.slice(at, end);
    const literal = stripInterpolations(line);
    const hits = CAPABILITIES.filter(c => literal.includes(c));
    if (hits.length >= 2) {
        const ln = bare.slice(0, m.index).split('\n').length;
        flatClaims.push(ln + '（字面声称 ' + hits.join('+') + '）');
    }
}
if (flatClaims.length) {
    defects.push('F2 有 ' + flatClaims.length + ' 处复合能力声称写成了常量：' + flatClaims.join('/') +
        ' —— 多个能力被压成一个固定字符串，只要有一个缺失它就必错；必须改由 _moduleStatus 等实测状态派生');
}
/* ---------- F3：失败出口数量下限 ---------- */
const warnCount = (bare.match(new RegExp(WARNMARK, 'g')) || []).length;
const errCount = (bare.match(/console\.error\s*\(/g) || []).length;
const successCount = (bare.match(new RegExp(CHECK, 'g')) || []).length;
if (warnCount < MIN_WARNMARKS) {
    defects.push('F3 失败告警文案（⚠️）仅 ' + warnCount + ' 处，低于下限 ' + MIN_WARNMARKS +
        '：声称面只增成功不增失败，失败出口正在被蚀掉');
}
if (errCount < MIN_ERRORS) {
    defects.push('F3 console.error 出口仅 ' + errCount + ' 处，低于下限 ' + MIN_ERRORS);
}
/* ---------- F4：空 catch 棘轮 ---------- */
// 「真正空白」= body 里**既没有可执行代码、也没有注释**。
//   只看「去注释后为空」会把 `catch (e) { /* 容灾 */ }` 也算进去（实测虚报成 29），
//   而那种写法已把「为什么吞」写下来了，是合理的降级；真正的问题是**什么都没写**的
//   catch —— 连「我知道这里会抛」这个信息都没留下，新增即阻断。
function emptyCatchLines(src) {
    const lines = [];
    for (const m of src.matchAll(/catch\s*\([^)]*\)\s*\{/g)) {
        let i = m.index + m[0].length - 1, depth = 0;
        for (; i < src.length; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') { depth--; if (depth === 0) break; }
        }
        const body = src.slice(m.index + m[0].length, i);
        const hasComment = body.includes('/*') || body.includes('//');
        const noBlock = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').trim();
        if (noBlock === '' && !hasComment) lines.push(src.slice(0, m.index).split('\n').length);
    }
    return lines;
}
// 注意：必须传**原始** idx —— bare 已把注释整段换成空格，若对它剥离注释，
//   `catch (e) { /* 容灾 */ }` 会被误算成「真正空白」（实测把它从 14 虚报成 29）。
const emptyCatches = emptyCatchLines(idx);
if (emptyCatches.length > EMPTY_CATCH_CEILING) {
    defects.push('F4 真正空白的 catch 从基线 ' + EMPTY_CATCH_CEILING + ' 涨到了 ' + emptyCatches.length +
        ' 处（行 ' + emptyCatches.join('/') + '）：空 catch 未必是缺陷（容灾降级经常需要），' +
        '但静默增长一定是——异常被吞掉后没有任何痕迹，与「声称与实际解耦」同源');
}
/* ---------- F5：结构健康 + 失败出口/声称点比例 ---------- */
if (successCount < MIN_CLAIMS) {
    console.error('[claim-truthfulness] 成功声称点 ' + successCount + ' 低于下限 ' + MIN_CLAIMS + '，结构漂移');
    process.exit(2);
}
/* ---------- 报告 ---------- */
const failExits = warnCount + errCount;
console.log('[claim-truthfulness] 成功声称点 ' + successCount + ' 处（所属方法有失败出口 ' + (successCount - orphanClaims.length) + ' 处）| 复合能力声称 ' + flatClaims.length + ' 处未派生');
console.log('[claim-truthfulness] 失败出口 ⚠️ ' + warnCount + ' + console.error ' + errCount + ' = ' + failExits + ' 处 | 真正空白 catch ' + emptyCatches.length + '（上限 ' + EMPTY_CATCH_CEILING + '）');
console.log('[claim-truthfulness] 方法区间 ' + spans.length + ' 个 | 声称没有失败出口的比例 ' + (successCount ? (orphanClaims.length / successCount * 100).toFixed(0) : '0') + '%');
console.log('[claim-truthfulness] 结构健康（声称点 ' + successCount + ' >= 下限 ' + MIN_CLAIMS + '）：ok');
if (defects.length) {
    console.error('[claim-truthfulness] 失败：声称真实性面存在 ' + defects.length + ' 项缺陷。');
    for (const d of defects) console.error('  - ' + d);
    process.exit(1);
}
process.exit(0);
