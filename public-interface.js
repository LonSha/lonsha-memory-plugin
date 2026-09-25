/* ========================================================
 * public-interface.js — [v3.180.0] 公开接口三入口（全局 / 斜杠命令 / 宏）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   本插件对外只有**一个**入口：`window.lonsha_memory_bridge_v1`（v3.88）。
 *   全库 grep `registerSlashCommand` / `registerMacro` / `SlashCommandParser` ——
 *   **产品代码零命中**。后果是实测可复现的：
 *     · 用户在聊天里想「把主角档案贴出来看一眼」，没有任何办法——只能开设置页翻；
 *     · 想让**卡作者**在 prompt 模板里引用引擎的剧情时钟/物品栏，只能靠本插件主动注入，
 *       卡里写不了 `{{...}}`；
 *     · 手机端之外的第三方扩展要读记忆，必须自己写 JS（只有开发者能做）。
 *   对照柏宝书：同一个生态位它给了 JS 全局 + `/bbs-get` 斜杠命令 + 五个宏
 *   （`src/public/register.ts`），三种能力的用户面覆盖完全不同的三类人。
 *
 * 【本模块的职责（三个入口，一个实现）】
 *   ① 资源读取的**单一实现**（`queryResource`）：三个入口共用同一份取值逻辑，
 *      不允许「宏能读到、命令读不到」这类入口间漂移；
 *   ② 三个入口各自**独立成败**：斜杠命令注册失败不得连坐宏，反之亦然
 *      （对照柏宝书：`Promise.all` 后各自记 capabilities）；
 *   ③ 成败必须**如实回报**（registered + reason），且 `capabilities` 把三个入口的
 *      实际可得性写成字段——「有没有这个入口」是可读的，而不是靠试。
 *
 * 【本模块**不做**什么（边界）】
 *   不做写入口。三个入口全部只读（与桥同规格）：能查、能引用，不能改账。
 *   本插件在这套体系里的角色是**记账的那一个**——查账口可以多开，改账口不开。
 *
 * 【宿主版本差异（为什么必须走探测而不是直接 import）】
 *   ST 的斜杠命令有两条路径：新版 `SlashCommandParser.addCommandObject`、
 *   旧版 `SlashCommandParser.addCommand`（后者无 named args）。
 *   宏同样两条：实验性 `macros.register`（支持参数化）、经典 `MacrosParser.registerMacro`。
 *   本模块**按可用性顺序探测**，并把最终走到哪条路径写进 capabilities——
 *   「注册成功了」与「注册到哪条路径」是两件事，后者决定调用方能不能用参数。
 *
 * 挂 window.LonShaPublicInterface，由 index.js 在 init 后调用 register()。
 * ======================================================== */
'use strict';
(function (global) {
/** 命令/宏的前缀。改此处即用户侧写法变化，须同步 README。 */
const NS = 'lonsha';
/** 本模块对外的接口版本（与桥的 apiVersion 同源同步，见 index.js 桥的 apiVersion）。 */
const API_VERSION = 1;

/** 资源清单：三个入口共用（斜杠命令的 enumList 与宏名都从这里派生，不各写一份）。 */
const RESOURCES = Object.freeze([
    'snapshot',        // 完整快照
    'protagonist',     // 主角档案（含锚点年龄读数）
    'lifeDetails',     // 生活小档案
    'characters',      // 角色状态表
    'moneyLedger',     // 金钱账
    'outline',         // 大纲
    'worldProg',       // 世界推进（承诺/支线/认知）
    'clock',           // 剧情时钟
    'recallAudit',     // 召回自检摘要
    'worldLedgerRead', // 对推演侧世界的读数（含未外供缺口）
    'coverage',        // 覆盖度（楼层缺口/未提取楼层）
    'scene',           // [v3.181] 场所图景（当前位置链/在场名单/到访读数/覆盖度/不变量）
    'evidence',        // [v3.214.0] 九账证据工作台（伏笔/约定/平行事实/秘密/回扣/回声/事实版本/事件完整性/修复）
    'floor'            // 当前楼层号
]);

/** 取值的单一实现：从快照对象里按资源名取值。纯函数、不抛、缺项如实返回 undefined。 */
function queryResource(snap, resource) {
    const key = String(resource || '').trim().toLowerCase();
    const map = {
        snapshot: () => snap,
        protagonist: () => snap && snap.protagonist,
        lifedetails: () => snap && snap.lifeDetails,
        characters: () => snap && snap.characters,
        moneyledger: () => snap && snap.moneyLedger,
        outline: () => snap && snap.outline,
        worldprog: () => snap && snap.worldProg,
        clock: () => snap && snap.clock,
        recallaudit: () => snap && snap.recallAudit,
        worldledgerread: () => snap && snap.worldLedgerRead,
        coverage: () => snap && snap.coverage,
        scene: () => snap && snap.scene,
        evidence: () => snap && snap.evidence,
        floor: () => (snap ? snap.floor : undefined)
    };
    const fn = map[key];
    return fn ? fn() : undefined;
}

/** 结果格式化：json（缺省）| raw | text。**非法格式抛 TypeError**（与柏宝书同：错误要浮到用户面前）。 */
function formatResult(value, format) {
    const f = String(format || 'json').trim().toLowerCase();
    if (f === 'json') return JSON.stringify(value === undefined ? null : value, null, 2);
    if (f === 'raw') return value === undefined ? '' : String(value);
    if (f === 'text') return value === undefined ? '' : (typeof value === 'string' ? value : JSON.stringify(value));
    throw new TypeError('format 只能是 json、raw 或 text');
}

/** 取上下文（宿主不可用返回 null，不抛）。 */
function ctxOf() {
    try { return (global.SillyTavern && global.SillyTavern.getContext && global.SillyTavern.getContext()) || null; } catch (_e) { return null; }
}

/**
 * 注册结果对象：三个入口各自一态。
 * 每个入口三态：'ready'（成功）| 'absent'（宿主没这个设施）| 'failed'（有但注册失败，带 reason）。
 */
function makeReport() {
    return {
        apiVersion: API_VERSION,
        ns: NS,
        slash: { state: 'absent', reason: null, path: null },
        macro: { state: 'absent', reason: null, path: null, parameterized: false },
        global: { state: 'absent', reason: null }
    };
}

/* ---------- ① 全局对象：由 index.js 的桥对象充当（本模块只做可得性确认） ---------- */
function probeGlobal(report) {
    try {
        const b = global.lonsha_memory_bridge_v1;
        if (b && typeof b === 'object') {
            report.global.state = 'ready';
            report.global.reason = null;
        } else {
            report.global.state = 'absent';
            report.global.reason = 'window.lonsha_memory_bridge_v1 未挂载（桥未启用或插件未 init）';
        }
    } catch (e) { report.global.state = 'failed'; report.global.reason = String((e && e.message) || e); }
    return report;
}

/* ---------- ② 斜杠命令：新版 addCommandObject 优先，旧版 addCommand 兜底 ---------- */
async function registerSlash(report, deps) {
    try {
        const mod = await deps.dynamicImport('/scripts/slash-commands/SlashCommandParser.js');
        const parser = mod && mod.SlashCommandParser;
        if (!parser) { report.slash.state = 'failed'; report.slash.reason = 'SlashCommandParser 未导出'; return report; }
        // 回调：解析命名参数 → 取值 → 格式化。抛错要浮出去（用户能看到「未知 resource」）。
        const callback = (args, unnamed) => {
            const named = String((args && args.resource) || '').trim();
            const first = Array.isArray(unnamed) ? unnamed[0] : unnamed;
            const resource = named || (first == null ? '' : String(first).trim());
            if (!resource) throw new TypeError('缺少 resource（可用：' + RESOURCES.join('、') + '）');
            const norm = RESOURCES.find(r => r.toLowerCase() === resource.toLowerCase());
            if (!norm) throw new TypeError('未知 resource：' + resource);
            const snap = deps.snapshot();
            // 覆盖度不是快照字段而是**现算**的读数：它是「当场缺口」，存进快照就成了历史。
            const value = (norm === 'coverage') ? deps.coverage() : queryResource(snap, norm);
            return formatResult(value, (args && args.format) || 'json');
        };
        const canObject = typeof deps.makeCommandObject === 'function' && typeof parser.addCommandObject === 'function';
        if (canObject) {
            const cmdObj = deps.makeCommandObject({ name: NS + '-get', callback, resources: RESOURCES });
            if (cmdObj) {
                parser.addCommandObject(cmdObj);
                report.slash.state = 'ready'; report.slash.path = 'addCommandObject'; report.slash.reason = null;
                return report;
            }
            report.slash.reason = 'SlashCommand.fromProps 不可用（无法构造命令对象）';
        }
        if (typeof parser.addCommand === 'function') {
            // 旧路径：无 named args，只吃一个无名参数（resource）。功能降级但**可用**，
            // 且如实标注 path，调用方据此知道 `/lonsha-get resource=x` 这种写法在这台宿主上不成立。
            parser.addCommand(NS + '-get', callback, [], '读取 LonSha 记忆引擎的只读快照资源', true, false);
            report.slash.state = 'ready'; report.slash.path = 'addCommand'; report.slash.reason = report.slash.reason || null;
            return report;
        }
        report.slash.state = 'failed'; report.slash.reason = report.slash.reason || 'SlashCommandParser 无 addCommandObject/addCommand';
    } catch (e) {
        report.slash.state = 'failed';
        report.slash.reason = String((e && e.message) || e);
    }
    return report;
}

/* ---------- ③ 宏：实验性引擎（参数化）优先，经典 registerMacro 兜底 ---------- */
/** 宏清单：名 → 取值器。三个入口共用 queryResource，避免入口间漂移。 */
function macroTable(deps) {
    const one = (res, fmt) => () => {
        try {
            const snap = deps.snapshot();
            const v = (res === 'coverage') ? deps.coverage() : queryResource(snap, res);
            return formatResult(v, fmt || 'text');
        } catch (e) { return ''; }   // 宏求值失败返回空串（宏系统的通用约定），不炸掉整条 prompt
    };
    return {
        [`${NS}Snapshot`]: one('snapshot', 'json'),
        [`${NS}Protagonist`]: one('protagonist', 'text'),
        [`${NS}Chars`]: one('characters', 'text'),
        [`${NS}Clock`]: one('clock', 'text'),
        [`${NS}Items`]: one('moneyLedger', 'text'),
        [`${NS}Coverage`]: one('coverage', 'text'),
        [`${NS}Recall`]: one('recallAudit', 'text')
    };
}
async function registerMacro(report, deps) {
    const table = macroTable(deps);
    const names = Object.keys(table);
    // 路径 A：实验性宏引擎（支持参数化宏 {{lonshaGet::clock}}）
    try {
        const pu = await deps.dynamicImport('/scripts/power-user.js');
        if (pu && pu.power_user && pu.power_user.experimental_macro_engine) {
            const ms = await deps.dynamicImport('/scripts/macros/macro-system.js');
            if (ms && ms.macros && typeof ms.macros.register === 'function') {
                for (const [name, fn] of Object.entries(table)) {
                    ms.macros.register(name, { category: (ms.MacroCategory && ms.MacroCategory.CHAT) || 'chat', handler: fn, description: `LonSha 记忆引擎只读读数：${name}` });
                }
                // 参数化宏：{{lonshaGet::<resource>}}
                try {
                    ms.macros.register(`${NS}Get`, {
                        category: (ms.MacroCategory && ms.MacroCategory.CHAT) || 'chat',
                        handler: (args) => {
                            const raw = String((args && (args.resource || args.value || args._)) || '').trim();
                            const norm = RESOURCES.find(r => r.toLowerCase() === raw.toLowerCase());
                            if (!norm) return '';
                            const snap = deps.snapshot();
                            return formatResult(norm === 'coverage' ? deps.coverage() : queryResource(snap, norm), 'text');
                        },
                        description: 'LonSha 记忆引擎只读读数（参数：resource）',
                        parameters: [{ name: 'resource', optional: true, type: 'string', sampleValue: 'clock', description: '资源名：' + RESOURCES.join('/') }]
                    });
                    report.macro.parameterized = true;
                } catch (_e) { report.macro.parameterized = false; }
                report.macro.state = 'ready'; report.macro.path = 'macro-system'; report.macro.reason = null;
                return report;
            }
        }
    } catch (_e) { /* 落到经典路径 */ }
    // 路径 B：经典 MacrosParser（无参数化）
    try {
        const legacy = await deps.dynamicImport('/scripts/macros.js');
        const parser = legacy && legacy.MacrosParser;
        if (parser && typeof parser.registerMacro === 'function') {
            for (const [name, fn] of Object.entries(table)) {
                parser.registerMacro(name, fn, `LonSha 记忆引擎只读读数：${name}`);
            }
            report.macro.state = 'ready'; report.macro.path = 'macros'; report.macro.parameterized = false; report.macro.reason = null;
            return report;
        }
        report.macro.state = 'failed';
        report.macro.reason = '未找到可用的宏注册设施（macro-system / macros.js 均不可用）';
    } catch (e) {
        report.macro.state = 'failed';
        report.macro.reason = String((e && e.message) || e);
    }
    return report;
}

/**
 * 主入口：按依赖注入注册三入口。
 * deps = { snapshot(), coverage(), makeCommandObject?, dynamicImport? }
 * 契约：
 *   · **绝不抛**——三个入口任一失败都只是该入口 state='failed'；
 *   · **幂等**——同一实例重复调用不重复注册（宿主重复 init 时不该报「已声明」错）；
 *   · 返回 report（含 capabilities 三态 + apiVersion），供桥外供与诊断面读取。
 */
async function register(deps = {}) {
    const report = makeReport();
    const D = {
        snapshot: typeof deps.snapshot === 'function' ? deps.snapshot : () => null,
        coverage: typeof deps.coverage === 'function' ? deps.coverage : () => null,
        makeCommandObject: deps.makeCommandObject,
        dynamicImport: typeof deps.dynamicImport === 'function' ? deps.dynamicImport : ((p) => import(/* @vite-ignore */ p))
    };
    if (register._done) { register._report.global.state = probeGlobal(makeReport()).global.state; return register._report; }
    probeGlobal(report);
    await registerMacro(report, D);
    await registerSlash(report, D);
    register._done = true;
    register._report = report;
    return report;
}
/** 只读最近一次注册结果（未注册过返回 null——「没试过」与「试了失败」不是一件事）。 */
function lastReport() { return register._report || null; }
/** 供测试与宿主复用（不注册，只取值）。 */
function snapshotOf(deps) { return { resources: RESOURCES, apiVersion: API_VERSION, ns: NS }; }

const api = { register, lastReport, queryResource, formatResult, macroTable, RESOURCES, API_VERSION, NS, snapshotOf };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof global !== 'undefined' && global) {
    try { global.LonShaPublicInterface = Object.freeze(api); } catch (_e) { /* 忽略 */ }
}
return api;
})(typeof window !== 'undefined' ? window : globalThis);