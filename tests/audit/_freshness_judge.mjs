/* ============================================================
 * tests/audit/_freshness_judge.mjs — 冻结读数新鲜度三态判定体 [L21-O7 · v3.465.2]
 * ------------------------------------------------------------
 * 【它回答的唯一问题】
 *   「一份冻结在盘上的机器读数（measured_at / generatedAt），现在还能不能当作现行事实读？」
 *
 * 【为什么值一条判据】
 *   本仓各基线/读数 JSON 是「证据的真源」，但证据会过期：
 *   `realhost_readings.json` v3.461.0 的读数在 v3.465.2 已不再描述现行世界。
 *   此前没有任何门在读「读数本身新不新」⇒ 旧读数被当现行读。
 *
 * 【三态口径（不许合成一个布尔）】
 *   fresh  ：ageDays ≤ stale_days —— 现行，可作依据
 *   stale  ：stale_days < ageDays ≤ expired_days —— 尚可读但必须带「待刷新」标注
 *   expired：ageDays > expired_days —— 不得再作依据，判红并给可复制的刷新命令
 *   缺时间戳 ⇒ 一律 expired（fail-closed：读数连自己多旧都不肯说，不能信）
 *
 * 【诚实边界】
 *   本判定体只看文件内声明的时间戳，不校验文件内容是否仍与代码一致；
 *   「内容仍真」只能由各读数的专用扫描器给。
 *   版本式时间戳（measured_at: vX.Y.Z）按「该版本提交日」计龄；
 *   与当前仓版本相同的 measured_at 视为 fresh（同轮交付）。
 * ============================================================ */
import { execFileSync } from 'node:child_process';

const DAY_MS = 86400000;
/** 三态阈值（天）：读数超过 30 天算陈旧、90 天算过期。 */
export const STALE_DAYS = 30;
export const EXPIRED_DAYS = 90;

/** 解析时间戳字段：支持 ISO（generatedAt）与版本式（measured_at）。缺失返回 null。 */
export function parseTimestamp(json) {
    if (!json || typeof json !== 'object') return null;
    /* [L23-O9] 同义键名必须一起认：本仓实测两种写法并存 —— `generatedAt`（camel，多数）
     *   与 `generated_at`（snake，module_consumption_ledger.json 等）。
     *   修前只认 camel，snake 那一份就被判成「缺时间戳」⇒ 明明有时间的读数被当成
     *   「连自己多旧都不肯说」而 fail-closed 成 expired。这不是保守，是把有证据读成没证据。 */
    for (const key of ['generatedAt', 'generated_at']) {
        const raw = json[key];
        if (typeof raw === 'string' && raw.trim()) {
            const t = Date.parse(raw);
            if (Number.isFinite(t)) return t;
        }
    }
    if (typeof json.measured_at === 'string') {
        const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(json.measured_at.trim());
        if (!m) return null;
        if (json.current_version && json.measured_at.replace(/^v/, '') === String(json.current_version).replace(/^v/, '')) {
            return Date.now();
        }
        const tag = 'v' + m[1] + '.' + m[2] + '.' + m[3];
        /* ① 先按标签/版本号取该提交的提交时间（历史口径，保留）。
         * ② [L23-O9] 标签不存在时回落一次：按 package.json 里改成该版本的那次提交计时。
         *    —— 本仓实测**没有**逐版本的 git tag（`fatal: bad revision 'v3.431.0'`），
         *    修前这条路径对 7 份版本式读数**从来就没成功过**：全都落到 null，
         *    然后被报成「缺时间戳」。那不是「读数没写时间」，是**解析器找不到**。
         *    两者必须分开报（下面 judgeFreshness 的 why 里体现）。 */
        const tries = [
            ['log', '-1', '--format=%ct', '--find-renames', '-S', 'measured_at', tag, '--', json._self_path || '.'],
            ['log', '-1', '--format=%ct', '-S', '"version": "' + m[1] + '.' + m[2] + '.' + m[3] + '"', '--', 'package.json'],
        ];
        for (const args of tries) {
            try {
                const out = execFileSync('git', args, { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
                const c = parseInt(String(out).trim(), 10);
                if (Number.isFinite(c) && c > 0) return c * 1000;
            } catch { /* 这一路取不到就换下一路；全取不到才 null，且原因在 why 里点名 */ }
        }
        return null;
    }
    return null;
}

/**
 * 三态判定（纯函数：输入读数对象与当前时刻，输出三态；不写盘、不 side-effect）。
 * @returns {{state:'fresh'|'stale'|'expired', ageDays:number|null, why:string}}
 */
export function judgeFreshness(json, now = Date.now(), opts = {}) {
    const staleDays = opts.staleDays ?? STALE_DAYS;
    const expiredDays = opts.expiredDays ?? EXPIRED_DAYS;
    let ts = null;
    if (json && typeof json === 'object' && json._ts_override != null) ts = json._ts_override;
    else ts = parseTimestamp(json);
    if (ts == null) {
        const ver = (json && typeof json.measured_at === 'string') ? String(json.measured_at).trim() : '';
        const looksVersion = /^v?\d+\.\d+\.\d+/.test(ver);
        if (looksVersion) {
            return { state: 'expired', ageDays: null,
                why: '读数写了版本式时间戳 ' + ver + '，但解析不到对应提交（git 里既无该 tag、package.json 里也没找到改成该版本的提交）'
                    + ' —— fail-closed 按 expired 处置；这不是「没说时间」，是「说了却查不到」' };
        }
        return { state: 'expired', ageDays: null,
            why: '读数缺时间戳（generatedAt / generated_at / measured_at 皆缺或不可解析）—— fail-closed：连自己多旧都不肯说的读数不能作依据' };
    }
    const ageDays = Math.max(0, (now - ts) / DAY_MS);
    if (ageDays > expiredDays) return { state: 'expired',
        ageDays, why: '读数已 ' + Math.floor(ageDays) + ' 天未刷新（> ' + expiredDays + '）—— 不得再作依据' };
    if (ageDays > staleDays) return { state: 'stale',
        ageDays, why: '读数已 ' + Math.floor(ageDays) + ' 天未刷新（> ' + staleDays + '）—— 尚可读，须带「待刷新」标注' };
    return { state: 'fresh', ageDays, why: '读数 ' + Math.floor(ageDays) + ' 天前生成 —— 现行' };
}

/** expired 读数的刷新命令（判据红时给可复制动作）。
 *  读数 JSON 与其生成器脚本不同名（realhost_readings.json ← _realhost_suite.mjs），
 *  故脚本名由登记表显式给出，不猜。 */
export function refreshCommand(script) {
    return 'node ' + script;
}
/** 读数 → 生成器登记表（恰好两条 ISO 冻结读数；新增冻结读数时在此登记）。 */
export const READING_PRODUCERS = {
    'tests/audit/realhost_readings.json': 'tests/audit/_realhost_suite.mjs',
    'tests/audit/loading_surface_proof.json': 'tests/audit/loading_surface_proof.mjs',
};

/** [L23-O9] 全量冻结读数登记表（盘上**每一份**带时间戳的 tests/audit/*.json 都在这里）。
 *  `producer_verified: true`  = 已实测「跑它真的会重写这份 JSON」（跑过、见过文件 mtime/内容变化）；
 *  `producer_verified: false` = 只确认「这份读数归它管」，**没有**逐份验过重跑会不会重写 ——
 *  这类条目必须带 `why_unverified`，判据会要求它写清「没验过什么」，不许用「大概能重生」糊过去。
 *  ★ 为什么必须有这张表：修前只有 2 条登记，盘上带时间戳的冻结读数有 9 份 ⇒
 *  另外 7 份**没有任何新鲜度门**，谁把它当现行读都没人管。 */
export const FROZEN_READINGS = [
    { rel: 'tests/audit/realhost_readings.json', producer: 'tests/audit/_realhost_suite.mjs', producer_verified: true },
    { rel: 'tests/audit/loading_surface_proof.json', producer: 'tests/audit/loading_surface_proof.mjs', producer_verified: true },
    { rel: 'tests/audit/doc_readings.json', producer: 'tools/_rebind_doc_readings.py', producer_verified: false,
        why_unverified: '文档读数由 Python 重绑脚本改写；本刀没有真跑它（重绑会改多份文档读数），只确认归属。' },
    { rel: 'tests/audit/test_cost_readings.json', producer: 'tools/gen_test_budget.mjs', producer_verified: false,
        why_unverified: '测试成本读数由生成器重写；本刀没有真跑（会重算全量耗时），只确认归属。' },
    { rel: 'tests/audit/host_beast_baseline.json', producer: 'tests/audit/host_beast_probe.cjs', producer_verified: false,
        why_unverified: '宿主巨兽基线由探针重建脚本改写；本刀未跑探针（需重建全仓基线），只确认归属。' },
    { rel: 'tests/audit/gate_timing_baseline.json', producer: 'tests/v3227_gate_isolation_and_timing.test.mjs', producer_verified: false,
        why_unverified: '门耗时基线由该判据在「重建模式」下改写；本刀未进重建模式跑它，只确认归属。' },
    { rel: 'tests/audit/perf_baseline.json', producer: 'tests/v3229_perf_evidence.test.mjs', producer_verified: false,
        why_unverified: '性能基线由该判据改写；本刀未进重建模式跑它，只确认归属。' },
    { rel: 'tests/audit/scale_archive_baseline.json', producer: 'tests/v3231_snapshot_scale_evidence.test.mjs', producer_verified: false,
        why_unverified: '规模/存档基线由该判据改写；本刀未进重建模式跑它，只确认归属。' },
    { rel: 'tests/audit/snapshot_baseline.json', producer: 'tests/v3231_snapshot_scale_evidence.test.mjs', producer_verified: false,
        why_unverified: '快照规模基线同上（同一判据拥有两份基线）；本刀未进重建模式跑它，只确认归属。' },
    /* 这一份正是本刀修的那个键名缺陷的现场：它用的是 `generated_at`（snake），
     * 修前 parseTimestamp 只认 `generatedAt` ⇒ 这份**有时间戳**的读数被判成「缺时间戳」。 */
    { rel: 'tests/audit/module_consumption_ledger.json', producer: 'tests/audit/scan_module_consumption.mjs', producer_verified: true },
];