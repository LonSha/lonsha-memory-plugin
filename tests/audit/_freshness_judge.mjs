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
    if (typeof json.generatedAt === 'string' && json.generatedAt.trim()) {
        const t = Date.parse(json.generatedAt);
        return Number.isFinite(t) ? t : null;
    }
    if (typeof json.measured_at === 'string') {
        const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(json.measured_at.trim());
        if (!m) return null;
        if (json.current_version && json.measured_at.replace(/^v/, '') === String(json.current_version).replace(/^v/, '')) {
            return Date.now();
        }
        try {
            const out = execFileSync('git', ['log', '-1', '--format=%ct', '--find-renames',
                '-S', 'measured_at', 'v' + m[1] + '.' + m[2] + '.' + m[3], '--', json._self_path || '.'],
                { encoding: 'utf8', timeout: 5000 });
            const c = parseInt(out.trim(), 10);
            if (Number.isFinite(c) && c > 0) return c * 1000;
        } catch { /* 标签不存在等 —— 落到 null，不许猜 */ }
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
        return { state: 'expired', ageDays: null,
            why: '读数缺时间戳（generatedAt / measured_at 皆缺或不可解析）—— fail-closed：连自己多旧都不肯说的读数不能作依据' };
    }
    const ageDays = Math.max(0, (now - ts) / DAY_MS);
    if (ageDays > expiredDays) return { state: 'expired',
        why: '读数已 ' + Math.floor(ageDays) + ' 天未刷新（> ' + expiredDays + '）—— 不得再作依据' };
    if (ageDays > staleDays) return { state: 'stale',
        why: '读数已 ' + Math.floor(ageDays) + ' 天未刷新（> ' + staleDays + '）—— 尚可读，须带「待刷新」标注' };
    return { state: 'fresh', why: '读数 ' + Math.floor(ageDays) + ' 天前生成 —— 现行' };
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