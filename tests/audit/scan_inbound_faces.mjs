#!/usr/bin/env node
/**
 * scan_inbound_faces.mjs — 跨仓**反向**外供面登记表守卫（下游产出 → 上游消费）
 *
 * 主题：上游→下游方向的外供面已有一处可查的登记（open_face_registry.tsv，
 *   由 scan_open_faces.mjs 把守）；而反方向此前**连一个字都没有**——
 *   正向表表头第 6 行逐字写着「本表只登记上游→下游方向的外供面（下游→上游方向当前 0面，故无行）」
 *   —— 而那句现已不真：下游的手机记忆桥（`lonshaBridge`）早就在本仓真被消费
 *   （本仓 index.js 的回填 / 召回 / 楼层生命周期四族调用点）。
 *   「声明没有判据 ⇒ 声明会漂移」—— 这次漂的是**两仓的规划文档**，
 *   两边都没人说错话，两边也都没人核过。
 *
 * 【为什么另起一位判据，而不是复用 scan_open_faces.mjs 的六条】
 *   正向表的 T1~T6 与 v3253 的 N0「未破坏时全量判据为零问题」全部是
 *   **按「上游产出、下游消费」写的**，方向反转后逐条错位（逐条理由见对向表表头）。
 *   硬塞进去有两条死路：① 假红（T2 要在本仓磁盘找下游模块）；
 *   ② 丢掉正向表的原价值（把方向混装后，「本仓一共外供了几面」这个问题从此没有一处能干净回答）。
 *
 * 【边界（**显式声明，不装**）】
 *   · `downstream_symbol` 列是**声明**：本脚本不跨仓核实，而且**不能**跨仓核实 ——
 *     tests/audit/scan_cross_repo_binding.mjs 的 **P2** 逐字禁止在役面引用兄弟仓（它曾因 17 个测试捆死
 *     一棵已死掉的兄弟树而整体转红）。故本表只判**本仓可核部分**：
 *       上游消费侧出口真在场 / 消费面在分发面 / 四态 / 分态 / 下限形态。
 *     「下游符号真在场」那一格的**真核实挂在下游自己的门禁**上
 *     （ruby-phone scripts/upstream-face-audit.mjs 的 R12：挂载点符号在场 / 本仓导出名在场 / 挂载点文件在磁盘 /
 *     上游消费面在上游分发面）。这不比抄一份下游清单弱 —— 抄本必然漂移，而下游自己的门禁跑在它的 CI 上。
 *   · 上游消费侧出口判据只剥**注释**，不剥字符串字面量（与正向表 T2 同规：
 *     它也不剥字符串）⇒ 日志文案里的同名提及也算「在场」（**宽口径**，如实登记）。
 *   · 本脚本自身**版本无关**：脚本体里不出现任何 3.x.y 字面量。
 *
 * 退出码：0 无问题；1 有缺陷（附逐条明细）；2 fail-closed（前置读不到）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../_audit_lib.mjs';
import { EXIT } from '../_exit_codes.mjs';

/** 列定义（表头里逐字写明的九列，顺序即契约）。 */
export const COLS_IN = ['face', 'owner', 'producer_version', 'downstream_symbol', 'contract_shape',
    'upstream_consumers', 'upstream_floor', 'invalid_conditions', 'absent_vs_empty'];

/** 本仓自己的名字**不得**出现在 owner 列（方向反转的硬断）。 */
export const SELF_OWNER = 'lonsha-memory-plugin';

/** 计划原话点名的四种错法（按**消费方**口径：上游看到的四种不同处境）。 */
export const INVALID_STATES_IN = ['缺席', '旧版', '不产出', '空数据'];

/* 单个反斜杠。拼正则一律走它 —— 反斜杠在普通字符串字面量里会被吃掉，
 * 而那种错「看起来已经修好了」（与正向守卫同一条留痕）。 */
const B = String.fromCharCode(92);

/** 解析：注释 # 行与空行跳过（表头块也是 # 注释，故意如此 —— 表可自解释）。 */
export function parseRowsIn(raw) {
    const rows = [];
    const problems = [];
    for (const line of String(raw).split(String.fromCharCode(10))) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const cols = t.split(String.fromCharCode(9)).map((c) => c.trim());
        if (cols.length !== COLS_IN.length) {
            problems.push('I1 列数不符（应 ' + COLS_IN.length + '，实 ' + cols.length + '）：' + t.slice(0, 70));
            continue;
        }
        const rec = {};
        COLS_IN.forEach((c, i) => { rec[c] = cols[i]; });
        rows.push(rec);
    }
    return { rows, problems };
}

/** I1：面标识唯一 + 每格非空 + 版本形态 + **方向硬断**（owner 不得是本仓）。 */
export function judgeInboundTable(rows) {
    const problems = [];
    const seen = new Set();
    for (const r of rows) {
        if (seen.has(r.face)) problems.push('I1 face 重复：' + r.face);
        seen.add(r.face);
        for (const c of COLS_IN) {
            if (!r[c]) problems.push('I1 ' + r.face + ' 的 ' + c + ' 为空（登记不许留白）');
        }
        const verRe = new RegExp('^v' + '[0-9]+' + B + '.[0-9]+' + B + '.[0-9]+$');
        if (!verRe.test(r.producer_version || '')) {
            problems.push('I1 ' + r.face + ' 的 producer_version 形态非法：' + r.producer_version);
        }
        if (r.owner === SELF_OWNER) {
            problems.push('I1 ' + r.face + ' 的 owner 是本仓（' + r.owner
                + '）—— 本表只登记**下游产出**的面；本仓在这里是消费方，不是产出方');
        }
    }
    return problems;
}

/** 行里声明的模块名（用于「缺行」双向量；格式非法时返回空串）。 */
export function downstreamModule(sym) {
    const parts = String(sym || '').split('::');
    return parts.length === 2 ? parts[0] : '';
}

/** 该模块是否被任一行登记（双向量的反向入口）。 */
export function symbolHasInboundFace(rows, moduleFile) {
    return rows.some((r) => downstreamModule(r.downstream_symbol) === moduleFile);
}

/** 分发面：manifest 的 js / extra_js（宿主**按文件名**加载的清单，无路径）。 */
export function inboundDistributionFace(manifest) {
    const set = new Set();
    if (manifest && typeof manifest.js === 'string') set.add(manifest.js);
    if (manifest && Array.isArray(manifest.extra_js)) {
        for (const f of manifest.extra_js) set.add(String(f));
    }
    return set;
}

/** 从 `<文件>:<a>,<b>` 拆出文件名与出口名列表（格式非法时返回 null）。 */
export function parseConsumerSpec(spec) {
    const s = String(spec || '');
    const at = s.indexOf(':');
    if (at <= 0) return null;
    const file = s.slice(0, at).trim();
    const names = s.slice(at + 1).split(',').map((x) => x.trim()).filter(Boolean);
    if (!file || !names.length) return null;
    return { file, names };
}

/**
 * I2：消费面真在场 —— `upstream_consumers` 名点的消费面文件在磁盘上，
 *   且逐出口名在那份文件（剥注释后）真出现。
 *
 * 为什么这条是本表最有价值的判据（与正向表 T2 同位，只是方向反）：
 *   登记表最容易的死法是「上游改了消费点 / 退役了那一族，而表里还写着旧名」
 *   —— 那时表还绿、门也绿，而实际那面已经没人调了（比没有表更坏：它给出错误的安心）。
 *
 * 宽口径声明：只剥注释，不剥字符串字面量（日志文案里的同名提及也算「在场」）——
 *   与正向表 T2 同规；严格区分需要剥字符串，那是另一件事（且字符串剥除自身又要一份口径）。
 */
export function judgeConsumersInbound(rows, root) {
    const problems = [];
    for (const r of rows) {
        const spec = parseConsumerSpec(r.upstream_consumers);
        if (!spec) {
            problems.push('I2 ' + r.face + ' 的 upstream_consumers 形态非法（应 <文件>:<出口>[,<出口>...]）：'
                + String(r.upstream_consumers).slice(0, 60));
            continue;
        }
        const p = path.join(root, spec.file);
        if (!fs.existsSync(p)) {
            problems.push('I2 ' + r.face + ' 声明的消费面不在磁盘：' + spec.file);
            continue;
        }
        let code;
        try { code = stripComments(fs.readFileSync(p, 'utf-8')); }
        catch (_e) { problems.push('I2 ' + r.face + ' 读不到消费面：' + spec.file); continue; }
        for (const name of spec.names) {
            /* 三种真在场形态：成员访问 `?.name` / `.name`；方法定义简写 `name(`；赋值 `name =`。
             * 最后一种是 index.js 里外供面常见形态（类方法简写）。 */
            const asMember = new RegExp('[.?]' + B + 's*' + name + B + 'b');
            const asMethod = new RegExp('(?:^|' + B + 's)' + name + B + 's*' + B + '(');
            const asAssign = new RegExp('\b' + name + B + 's*=');
            if (!asMember.test(code) && !asMethod.test(code) && !asAssign.test(code)) {
                problems.push('I2 ' + r.face + ' 声明的上游消费出口在 ' + spec.file
                    + ' 里找不到：' + name + '（消费点退役而登记未删 = 表在绿、面已没）');
            }
        }
    }
    return problems;
}

/**
 * I3：消费面必须在**本仓分发面**上。
 *   为什么：宿主只加载 manifest 列出的文件（按文件名）。一个消费面若不在分发面，
 *   用户那边**永远不会加载它** —— 那时登记表里「上游在消费」这句话在用户侧是假的，而表会替它背书。
 */
export function judgeDistributionInbound(rows, manifest) {
    const face = inboundDistributionFace(manifest);
    const problems = [];
    for (const r of rows) {
        const spec = parseConsumerSpec(r.upstream_consumers);
        if (spec && !face.has(spec.file)) {
            problems.push('I3 ' + r.face + ' 的消费面不在本仓分发面（manifest.js / extra_js）：' + spec.file);
        }
    }
    return problems;
}

/**
 * I4：`upstream_floor` 只能是 ≥ 1 的整数（**声明值**）。
 *   为什么收得这么紧：消费点在**另一个仓**，本仓数不到它。
 *   若允许自由文本，它会从「可用数字对照的声明」退化成「一句人话」，而人话不会被任何门禁接住。
 *   0 也不行：它等于「这一面没人在调」，那不是外供面，应当删行。
 */
export function judgeFloorsInbound(rows) {
    const problems = [];
    const re = new RegExp('^[0-9]+$');
    for (const r of rows) {
        const s = String(r.upstream_floor || '');
        if (!re.test(s)) {
            problems.push('I4 ' + r.face + ' 的 upstream_floor 非整数形态：' + s);
            continue;
        }
        if (Number(s) < 1) {
            problems.push('I4 ' + r.face + ' 的 upstream_floor 为 0（等于没有消费点：那不是外供面，应删行）');
        }
    }
    return problems;
}

/**
 * I5：四态必须**分别呈现**（按**消费方**口径：上游看到的四种不同处境）。
 *   四态压成一态就是错读数（本仓最贵的老账）。
 */
export function judgeInvalidStatesInbound(rows) {
    const problems = [];
    for (const r of rows) {
        const s = String(r.invalid_conditions || '');
        const miss = INVALID_STATES_IN.filter((w) => !s.includes(w));
        if (miss.length) {
            problems.push('I5 ' + r.face + ' 的失效条件未分别呈现四态，缺：' + miss.join('、'));
        }
    }
    return problems;
}

/**
 * I6：「缺席与空如何不同形」必须真的说出**两种以上**态词。
 *   按分隔符切开数，少于 2 段即视为没分（「已分态」既不是判据也不是读数）。
 */
export function judgeAbsentVsEmptyInbound(rows) {
    const problems = [];
    const sep = new RegExp('[|｜/]');
    for (const r of rows) {
        const s = String(r.absent_vs_empty || '');
        const parts = s.split(sep).map((x) => x.trim()).filter(Boolean);
        if (parts.length < 2) {
            problems.push('I6 ' + r.face + ' 的 absent_vs_empty 未列出两种以上态（分不开就不算分）：' + s.slice(0, 60));
        }
    }
    return problems;
}

/** 全量判据（供门禁主入口与常驻套件共用 —— 同一份判据，不各写一份）。 */
export function runAll(root) {
    const tablePath = path.join(root, 'tests', 'audit', 'open_face_registry_inbound.tsv');
    let raw = null;
    try { raw = fs.readFileSync(tablePath, 'utf-8'); } catch (_e) { raw = null; }
    if (raw == null) return { fatal: '登记表缺失：' + tablePath, rows: [], problems: [] };
    const manifestPath = path.join(root, 'manifest.json');
    let manifest = null;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); }
    catch (_e) { return { fatal: 'manifest.json 读不到或不是合法 JSON', rows: [], problems: [] }; }
    const parsed = parseRowsIn(raw);
    if (parsed.rows.length === 0) return { fatal: '登记表为空（扫描面不可信）', rows: [], problems: [] };
    const problems = []
        .concat(parsed.problems, judgeInboundTable(parsed.rows), judgeConsumersInbound(parsed.rows, root),
            judgeDistributionInbound(parsed.rows, manifest), judgeFloorsInbound(parsed.rows),
            judgeInvalidStatesInbound(parsed.rows), judgeAbsentVsEmptyInbound(parsed.rows));
    return { fatal: null, rows: parsed.rows, problems };
}

/* ── 主入口：只在**直接执行**时跑，被 import 时不跑（v3258 等套件要 import 判据纯函数）。
 *   判据与入口分开写，是为了同一份判据既当门禁又当测试判据（各写一份必然漂移）。 */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
    const { fatal, rows, problems } = runAll(ROOT);
    if (fatal) { console.error('[inbound-faces] ' + fatal); process.exit(EXIT.DRIFT); }
    console.log('=== 跨仓反向外供登记表：' + rows.length + ' 面 / 问题 ' + problems.length + ' ===');
    for (const r of rows) {
        console.log('  · ' + r.face + ' （' + r.owner + ' ' + r.producer_version + '） ← ' + r.upstream_consumers);
    }
    if (problems.length) {
        for (const p of problems) console.error('  ✗ ' + p);
        console.error('[inbound-faces] 发现 ' + problems.length + ' 处。');
        process.exit(EXIT.DEFECT);
    }
    process.exit(EXIT.CLEAN);
}
