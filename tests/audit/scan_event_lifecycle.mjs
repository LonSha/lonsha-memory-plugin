// 审计基建 H（v3.164）：事件生命周期面扫描（注册收口 / 台账 / 卸载消费者 / 可见性）
// ------------------------------------------------------------
// 为什么存在：
//   前七条不变量分别管「键有没有声明」（v3.160）、「声明了能不能设」（v3.161）、
//   「能设的控件是不是唯一」（v3.162）、「注册的模块是否真在跑」（v3.163）等面。
//   它们都假设「事件已经接上了」。而事件接线本身从来没有判据：
//
//   实测缺陷（v3.164 修前）：
//     1. 控制平面分离开辟了 `bindEvent(eventSource, type, handler)`，注释写明「统一事件注册
//        包装：记录 + 注册 + 防重」。但 registerEvents 里的 7 个注册点**全部直接调用**
//        `eventSource.on(types.X, _hN)`，没有一处经过 bindEvent —— 就绪检查与防重都没生效，
//        而 `_controlInfo.events` 因此**恒为 0**（它唯一的自增在 bindEvent 里）。
//     2. `_controlInfo` 这组状态**零读取点**：计数、最后事件、注册时刻全部只写不读。
//        「控制平面」在运行时是个只写不读装饰件——没有任何人能看到接线是否成立。
//     3. `unregisterEvents()` **零调用点**（v3.91 花力气修好了「按 handler 引用精确卸载」，
//        却没有任何代码调用它）；而 `registerEvents` 无幂等守卫，重复调用会把同一批 handler
//        再挂一遍（同一事件双触发），台账里两份记录都会「卸载成功」——泄漏不体现在计数上。
//     4. selfCheck 的 17 行子系统统计里**没有任何一行**覆盖事件注册状态。注册失败时插件仍
//        「看起来正常」（它自己打印的还是「✓ 事件监听已注册」），用户侧表现为「聊了很久没有
//        记忆」，却没有任何地方能看出原因。
//
// 判定策略：
//   E1 每个事件注册点必须经统一包装收口（不得存在裸的 eventSource.on(types.*)）
//   E2 注册与台账必须成对：每个 on 都有 push，且 push 必须带 handler 引用（否则卸载无效）
//   E3 卸载路径必须有真实消费者（零调用点 = 该路径已腐烂）
//   E4 控制平面台账必须被读取（只写不读 = 装饰件），且诊断面必须覆盖事件接线
//   E5 结构健康 + 每个判定面非零下限（防探测器失效后以全绿通过）
//
// 退出码：0=卫生  1=存在真缺陷  2=结构漂移（探测器失效）
// 夹具通道：LONSHA_AUDIT_FIXTURE=1 放宽下限，供单测塞合成仓库。
import fs from 'fs';
import path from 'path';

const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const idxPath = path.join(ROOT, 'index.js');
if (!fs.existsSync(idxPath)) {
    console.error('[event-lifecycle] 找不到 index.js，工作目录可能不对（' + ROOT + '）');
    process.exit(2);
}
const idx = fs.readFileSync(idxPath, 'utf8');
const MIN_BYTES = FIXTURE_MODE ? 1 : 100000;
if (idx.length < MIN_BYTES) {
    console.error('[event-lifecycle] index.js 退化（' + idx.length + ' 字节），无法分析事件接线，审计脚本需同步结构变化');
    process.exit(2);
}
const MIN_REGISTRATIONS = FIXTURE_MODE ? 1 : 5;
const defects = [];

// 剥掉注释后再做「有没有裸调用」这类判断：注释里提到 `eventSource.on(types.X)`
//   是说明文字，不是真实调用点。
// 为什么不连字符串字面量一起剥：本文件大量正则字面量中含引号（如 /['"]/ 之类），
//   手写剥离器一旦把 `/` 之后的内容误判为正则或反之，就会从某个正则字面量开始
//   把整段代码当成字符串吞掉（实测会让 this.bindEvent( 从 7 变 0，直接导致本脚本
//   以「探测器已失效」误报）。实测本文件中「字符串里出现 eventSource.on(」的伪命中
//   为 0 处，故只剥注释即可，风险更低、fail-closed 更明确。
// 剥注释时**保留换行与偏移**（注释字符换成空格），这样剥完的行号与原始文件一致，
//   报告里的「行 xxx」才可以直接跳转定位。若像初版那样直接吞掉注释内容，
//   后续所有位置的偏移都会前移，行号会指向无关代码（实测 7 处裸调用报出 8 个行号）。
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

/* ---------- 1. E1：注册点必须收口 ---------- */
// 裸调用：eventSource.on(…) —— 剥注释后仍存在即为未收口
const bareOns = [];
for (const m of bare.matchAll(/\beventSource\s*\.\s*on\s*\(/g)) {
    const line = bare.slice(0, m.index).split('\n').length;
    bareOns.push(line);
}
const viaWrapper = (bare.match(/this\.bindEvent\s*\(/g) || []).length;
// 允许的唯一直接 on：包装器自身内部的那一次。
//   查找标记不能写死缩进（真实文件是 8 空格，夹具可能不同），按签名子串定位后回退到行首。
const wrapperBody = (() => {
    const sig = 'bindEvent(eventSource, type, handler) {';
    const at0 = idx.indexOf(sig);
    if (at0 < 0) return null;
    const at = idx.lastIndexOf('\n', at0) + 1;
    let i = idx.indexOf('{', at0), depth = 0;
    for (; i < idx.length; i++) {
        if (idx[i] === '{') depth++;
        else if (idx[i] === '}') { depth--; if (depth === 0) break; }
    }
    return idx.slice(at, i + 1);
})();
if (!wrapperBody) {
    console.error('[event-lifecycle] 找不到统一注册包装 bindEvent(eventSource, type, handler)，审计脚本需同步结构变化');
    process.exit(2);
}
const wrapperOwnOns = (stripComments(wrapperBody).match(/eventSource\s*\.\s*on\s*\(/g) || []).length;
// 包装器自身那一次 on 是合法的（它就是收口点），报告未收口行号时必须排除它。
const wrapperStartLine = idx.slice(0, idx.indexOf(wrapperBody)).split('\n').length;
const wrapperEndLine = wrapperStartLine + wrapperBody.split('\n').length - 1;
const nonWrapperBareLines = bareOns.filter(l => l < wrapperStartLine || l > wrapperEndLine);
// 注册点总数 = 未收口的裸调用 + 经包装的收口调用。
//   下限判据必须用**这个总数**，不能用「经包装数」：修复前 7 个注册点全是裸调用、
//   经包装数为 0，若拿经包装数做下限，会先以 exit 2「探测器失效」把闸门拦下，
//   真正的缺陷（7 处未收口）反而一条都报不出来 —— 负控制当场暴露了这点。
//   下限只该回答「事件接线面还在不在、规模是否合理」，与「收口与否」正交。
const bareNonWrapper = bareOns.length - wrapperOwnOns;
const totalRegistrations = bareNonWrapper + viaWrapper;
if (totalRegistrations < MIN_REGISTRATIONS) {
    console.error('[event-lifecycle] 仅观测到 ' + totalRegistrations + ' 个事件注册点（低于下限 ' + MIN_REGISTRATIONS + '），事件探测器已失效');
    process.exit(2);
}
if (bareNonWrapper > 0) {
    defects.push('E1 存在 ' + bareNonWrapper + ' 处绕过统一包装的事件注册（裸 eventSource.on(…)，行 ' +
        nonWrapperBareLines.join('/') + '）；控制平面分离开辟的 bindEvent 成为装饰件' +
        ' —— 就绪检查与防重不生效，且 _controlInfo.events 恒为 0');
}

/* ---------- 2. E2：注册与台账成对，且台账带 handler 引用 ---------- */
const regCount = totalRegistrations;
const pushAll = (stripComments(idx).match(/this\.eventHandlers\.push\s*\(/g) || []).length;
// [v3.165] 登记位置的不变量：台账登记必须发生在统一包装**内部**。
//   v3.164 的判据是「push 数 == 注册点数」—— 那描述的是当时的形状（push 写在 7 个
//   调用点上），不是不变量。一旦把登记收进 bindEvent（本版就是因为「失败也登记」
//   而这么做），判据立刻报「注册 7 个但台账 1 条」，把**更正确的实现**判成缺陷。
//   真正的不变量是两条：① 登记只发生在包装内（于是它必然与注册同生共死）；
//   ② 登记条数不得超过实际注册数（散落的 push 会记下从未 on 过的 handler）。
const pushInWrapper = (stripComments(wrapperBody).match(/this\.eventHandlers\.push\s*\(/g) || []).length;
// 台账条目的两种等价写法都要认：shorthand `{ eventSource, type, … }` 与显式
//   `{ eventSource: es, type, … }`。判据不能窄到只认一种 —— 初版只认 shorthand，
//   夹具沿用旧写法就被算成「不含 handler 引用」，于是**正样本自己报缺陷**。
// [v3.165] 同时认两种 handler 写法：具名 `handler: _h1` 与 shorthand `handler`（后者
//   出现在包装内部，因为那里只有一个 handler 变量）。v3.164 只认具名，于是把登记收进
//   包装后它报「1 条不含 handler 引用」—— 而那条恰好是最准确的写法（同一个变量）。
const pushWithHandler = (stripComments(idx).match(/this\.eventHandlers\.push\(\{\s*eventSource(?:\s*:\s*[A-Za-z_$][\w$]*)?\s*,\s*type(?:\s*:\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)?\s*,\s*handler(?:\s*:\s*[A-Za-z_$][\w$]*)?\s*\}\)/g) || []).length;
if (pushInWrapper === 0) {
    defects.push('E2 台账登记不在统一包装 bindEvent 内：登记与注册不同处，bindEvent 返回 false' +
        '（未就绪 / 类型无效 / eventSource.on 抛错）时仍会记下一条「已注册」，' +
        '卸载时会去 off 一个从未 on 过的函数（真监听卸不掉，还可能误删其他扩展的同类型监听）');
}
if (pushAll > regCount) {
    defects.push('E2 台账记录 ' + pushAll + ' 条多于注册点 ' + regCount + ' 个：存在散落的登记点，' +
        '会记下从未真正挂载的 handler（与上一条同源：登记不受注册成败驱动）');
}
if (pushWithHandler !== pushAll) {
    defects.push('E2 台账记录中有 ' + (pushAll - pushWithHandler) + ' 条不含 handler 引用：卸载时只能无参移除' +
        '（会误删其他扩展的同类型监听）或直接失效 —— v3.91 已修过此缺陷，此处为回归守卫');
}

// E2 加强：台账登记的 handler 必须**就是**实际注册的那一个。
//   只数「有没有 handler 字段」不够 —— 名字记错的话，卸载会去 off 一个从未 on 过的函数：
//   真监听卸不掉，还可能顺手卸掉其他扩展的同类型监听。这在计数上完全看不出来，
//   正是 v3.91 那次「按引用精确卸载」想解决的问题的**镜像缺陷**。
const bindHandlerRefs = [...bare.matchAll(/this\.bindEvent\(\s*[^,]+,\s*[^,]+,\s*([A-Za-z_$][\w$]*)\s*\)/g)].map(m => m[1]);
const pushHandlerRefs = [...bare.matchAll(/this\.eventHandlers\.push\(\{\s*eventSource(?:\s*:\s*[^,]+)?\s*,\s*type:[^,]+,\s*handler:\s*([A-Za-z_$][\w$]*)\s*\}\)/g)].map(m => m[1]);
// 无收口调用（修复前）或无台账（已被 E2 首条报出）时不重复报同一件事。
const handlerRefsAligned = (bindHandlerRefs.length === 0 || pushHandlerRefs.length === 0)
    ? true
    : bindHandlerRefs.join(',') === pushHandlerRefs.join(',');
if (!handlerRefsAligned) {
    defects.push('E2 台账登记的 handler 与实际注册的不是同一批（注册 [' + bindHandlerRefs.join(', ') +
        '] vs 台账 [' + pushHandlerRefs.join(', ') + ']）：卸载会 off 一个从未 on 过的函数 —— 真监听卸不掉，' +
        '还可能顺手卸掉其他扩展的同类监听');
}

/* ---------- 3. E3：卸载路径必须有真实消费者 ---------- */
const unregisterCalls = (bare.match(/this\.unregisterEvents\s*\(\s*\)/g) || []).length;
const unregisterDefined = /unregisterEvents\s*\(\s*\)\s*\{/.test(bare);
if (!unregisterDefined) {
    console.error('[event-lifecycle] 找不到 unregisterEvents 定义，审计脚本需同步结构变化');
    process.exit(2);
}
if (unregisterCalls === 0) {
    defects.push('E3 unregisterEvents 定义存在但零调用点：卸载路径已腐烂（v3.91 修好的「按 handler 精确卸载」没有任何消费者），' +
        '而 registerEvents 重复调用会把同一批 handler 再挂一遍导致事件双触发');
}

/* ---------- 4. E4：台账必须被读取，且诊断面必须覆盖事件接线 ---------- */
// 逐个引用判定「写」还是「读」：写 = 对象字面量初始化 `_controlInfo = {…}`，
//   或属性赋值 `_controlInfo.x = … / += … / ++ / --`。
// 初版判据用「总引用数 - 写次数」近似读次数，结果把 `events++`（无 `=`）漏算成写、
//   又把初始化当成读，于是修复前的「只写不读」被算成「读 2 次」而漏报。
let infoWrites = 0, infoReads = 0;
for (const m of bare.matchAll(/_controlInfo/g)) {
    const after = bare.slice(m.index + m[0].length);
    const propWrite = /^\s*\.\s*[A-Za-z_]\w*\s*(\+\+|--|[+\-*/%]?=(?!=))/.exec(after);
    const selfWrite = /^\s*=(?!=)/.test(after);
    if (propWrite || selfWrite) infoWrites++;
    else infoReads++;
}
if (infoWrites > 0 && infoReads === 0) {
    defects.push('E4 控制平面台账 _controlInfo 只写不读（写 ' + infoWrites + ' 处 / 读 ' + infoReads + ' 处）：' +
        '接线状态没有任何消费者，等于「坏了没人知道」');
}
// 诊断面（selfCheck 的子系统统计）必须覆盖事件接线
if (!idx.includes('事件接线')) {
    defects.push('E4 诊断面（selfCheck）没有事件接线行：注册失败时插件仍「看起来正常」，' +
        '用户侧表现为「聊了很久没有记忆」却无处可查');
}
// 诊断面必须经只读提供者读取台账（engine 与 plugin 是两个对象，直接 this._controlInfo 读不到）
if (!/stateProvider/.test(bare)) {
    defects.push('E4 事件接线状态没有跨对象只读通道（stateProvider）：selfCheck 属于 engine、台账属于 plugin，' +
        '直接读 this._controlInfo 会永远显示「未初始化」（可见性形同虚设）');
}

/* ---------- 5. E5：结构健康 + 下限 + 哨兵自洽 ---------- */
// E5 加强：失败哨兵的期望值必须等于**实际注册点数**。写错（或加了第 8 个注册点却忘了改）
//   的话，「接线不完整」这条检测永远不会触发 —— 哨兵在，但它从不说真话。
//   这比没有哨兵更坏：它给人「已经检查过了」的错觉。
// [v3.165] 期望值现在有两个层次，判据必须分别看待：
//   ① 常量 EXPECTED_EVENT_TYPES（注册点总数，单一真源）必须等于实际注册点数；
//   ② selfCheck / 哨兵侧的 expected = <标识符> 赋值必须存在（写死字面量是上一版形状；
//      现在期望值由宿主可见性条件派生，写死反而会把「宿主缺项」误报成「接线不完整」）。
//   旧判据只认「字面量 == 注册点数」，于是本版一改实现就报「期望值 0」——又是形状绑定。
const constM = /const\s+EXPECTED_EVENT_TYPES\s*=\s*(\d+)\s*;/.exec(bare);
if (!constM) {
    defects.push('E5 找不到期望注册点常量 EXPECTED_EVENT_TYPES：注册点总数没有单一真源，' +
        '势必出现多份硬编码各自漂移（哨兵以为该有几个、实际注册了几个，无人对账）');
} else if (Number(constM[1]) !== totalRegistrations) {
    defects.push('E5 期望注册点常量（' + constM[1] + '）与实际注册点数（' + totalRegistrations +
        '）不一致：接线不完整检测会静默失效（哨兵在，但永不说真话）');
}
if (!/this\._controlInfo\.expected\s*=\s*[A-Za-z_$][\w$]*\s*;/.test(bare)) {
    defects.push('E5 失败哨兵的期望值未被赋值（或写死了字面量）：' +
        '写死会随宿主 event_types 能力差异误报，不赋值则哨兵恒为 0、永远说「不完整」');
}
if (regCount < MIN_REGISTRATIONS) {
    console.error('[event-lifecycle] 注册点数量 ' + regCount + ' 低于下限 ' + MIN_REGISTRATIONS + '，结构漂移');
    process.exit(2);
}

/* ---------- 报告 ---------- */
console.log('[event-lifecycle] 事件注册点 ' + regCount + ' 个（经统一包装收口 ' + viaWrapper + ' 个 / 裸调用 ' + bareNonWrapper + ' 处）');
console.log('[event-lifecycle] 台账记录 ' + pushAll + ' 条（带 handler 引用 ' + pushWithHandler + ' 条 / 位于包装内 ' + pushInWrapper + ' 条）| 卸载消费者 ' + unregisterCalls + ' 处 | 台账 handler 与注册一致 ' + (handlerRefsAligned ? '是' : '否'));
console.log('[event-lifecycle] 控制平面台账 写 ' + infoWrites + ' / 读 ' + infoReads + ' | 诊断面事件接线行 ' + (idx.includes('事件接线') ? '有' : '无') + ' | 只读通道 ' + (/stateProvider/.test(bare) ? '有' : '无'));
console.log('[event-lifecycle] 结构健康（注册点 ' + regCount + ' >= 下限 ' + MIN_REGISTRATIONS + '）：ok');
if (defects.length) {
    console.error('[event-lifecycle] 失败：事件生命周期面存在 ' + defects.length + ' 项缺陷。');
    for (const d of defects) console.error('  - ' + d);
    process.exit(1);
}
process.exit(0);
