/* ============================================================
 * host-refusal-gate.js — L26-O1 宿主兼容矩阵的「拒载面」
 *
 * 【治的欠债】R24-O9 的 `host-compatibility-matrix.js` 只做到「缺了什么能力、
 *   降级成什么、用户能感知到什么」。它**不说「这种宿主干脆别装」** ——
 *   矩阵里没有「不可用」这一档，于是装错版本时表现为「装上了但记不住」，
 *   用户只能试错（路线图原文：装错版本只能试错 `【待复核】`）。
 *
 * 【三条硬要求】
 *   1. 矩阵逐格三态：`available` / `degraded` / `refused`，**没有第四态**；
 *   2. `refused` 必带 `reason`（为什么不行）与 `action`（用户该做什么），
 *      且 `assertLoadable()` 必须**抛错**而不是返回 false —— 静默降级是本档要杀的；
 *   3. 必需要求（`required:true`）缺席 ⇒ 整机 `refused`；非必需缺席 ⇒ `degraded`
 *      并逐项点名。**读数不许把 degraded 读成 ok。**
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaHostRefusalGate = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var STATUSES = Object.freeze(['available', 'degraded', 'refused']);

    /** 从宿主要求的能力里，挑出「缺了就不能跑」的那几项（可被调用方改）。 */
    var REQUIRED_BY_DEFAULT = Object.freeze(['Proxy', 'structuredClone']);

    /** 每项能力缺了以后「用户看到什么」。缺一条就说明这行没写完。 */
    var PERCEIVED = Object.freeze({
        Proxy: '设置页里改库，界面不会自己刷新，要退出去再进',
        structuredClone: '带日期的记忆会变成字符串，时间线排序出现乱序',
        'crypto.randomUUID': '极端并发下两条记忆可能拿到同一个 id',
        WeakRef: '长会话内存只增不降，需要重开页面',
        'Intl.Segmenter': '中文/日文断句变粗，召回时按字切而不是按词切',
        'Array.prototype.at': '末尾取值的兼容分支走索引计算，不影响读数',
        'Object.hasOwn': '属性判定走 hasOwnProperty 兼容分支，不影响读数',
        queueMicrotask: '写入排队退化为 setTimeout(0)，批量导入略慢'
    });

    function detect(env) {
        var e = env || {};
        var out = {};
        out.Proxy = typeof e.Proxy === 'function';
        out.structuredClone = typeof e.structuredClone === 'function';
        out['crypto.randomUUID'] = !!(e.crypto && typeof e.crypto.randomUUID === 'function');
        out.WeakRef = typeof e.WeakRef === 'function';
        out['Intl.Segmenter'] = !!(e.Intl && typeof e.Intl.Segmenter === 'function');
        out['Array.prototype.at'] = typeof [].at === 'function';
        out['Object.hasOwn'] = typeof Object.hasOwn === 'function';
        out.queueMicrotask = typeof e.queueMicrotask === 'function';
        return out;
    }

    /** 宿主版本串 → 三段数字；不是版本就返回 null（**不许返回 0**：0 会被读成「很旧」）。 */
    function parseHostVersion(v) {
        if (typeof v !== 'string') return null;
        var m = v.trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
        if (!m) return null;
        return [Number(m[1]), Number(m[2]), Number(m[3] || 0)];
    }

    function compareVersions(a, b) {
        var x = parseHostVersion(a);
        var y = parseHostVersion(b);
        if (!x || !y) return null;
        for (var i = 0; i < 3; i++) {
            if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
        }
        return 0;
    }

    /**
     * 逐格评估。
     * @param {{env?:object, hostVersion?:string, minHostVersion?:string, required?:string[]}} opts
     */
    function assess(opts) {
        var o = opts || {};
        var present = detect(o.env);
        var required = Array.isArray(o.required) ? o.required : REQUIRED_BY_DEFAULT.slice();
        var rows = [];
        var refused = [];
        var degraded = [];

        // 宿主版本低于最低要求：整机拒载，且理由要说清「升到哪个版本」。
        var minV = o.minHostVersion || null;
        var versionStatus = 'available';
        var versionReason = '';
        if (minV) {
            var cmp = compareVersions(o.hostVersion, minV);
            if (cmp === null) {
                versionStatus = 'refused';
                versionReason = '宿主版本读不出来（拿到的是「' + String(o.hostVersion) + '」），无法判定能否安装；' +
                    '请升级到 ' + minV + ' 或更新版本再装';
            } else if (cmp < 0) {
                versionStatus = 'refused';
                versionReason = '宿主版本 ' + o.hostVersion + ' 低于本版最低要求 ' + minV + '；' +
                    '请先把 SillyTavern 升到 ' + minV + ' 或更新版本';
            }
        }
        rows.push({
            cap: 'host-version',
            present: versionStatus !== 'refused',
            status: versionStatus,
            reason: versionReason,
            action: versionStatus === 'refused' ? '升级宿主到 ' + (minV || '更高版本') : ''
        });
        if (versionStatus === 'refused') refused.push('host-version');

        Object.keys(present).forEach(function (cap) {
            var has = present[cap];
            var isRequired = required.indexOf(cap) >= 0;
            var status;
            if (has) {
                status = 'available';
            } else {
                status = isRequired ? 'refused' : 'degraded';
            }
            var reason = '';
            var action = '';
            if (!has) {
                reason = '宿主缺少 ' + cap + '；' + (PERCEIVED[cap] || '相关功能会少一块，界面不一定提示');
                action = isRequired
                    ? '换用支持 ' + cap + ' 的宿主版本，或关掉依赖它的功能后再装'
                    : '可以继续用，但' + (PERCEIVED[cap] || '该功能不可用');
            }
            rows.push({ cap: cap, present: has, status: status, required: isRequired, reason: reason, action: action });
            if (status === 'refused') refused.push(cap);
            if (status === 'degraded') degraded.push(cap);
        });

        var verdict = refused.length ? 'refused' : (degraded.length ? 'degraded' : 'ok');
        var reading;
        if (verdict === 'refused') reading = 'host-refused:' + refused.join(',');
        else if (verdict === 'degraded') reading = 'host-degraded:' + degraded.join(',');
        else reading = 'host-ok';

        return {
            verdict: verdict,
            reading: reading,
            loadable: verdict !== 'refused',
            rows: rows,
            refused: refused,
            degraded: degraded,
            /** 一句话交给用户看；拒绝时说「别装」而不是「装上了但可能不好用」。 */
            message: verdict === 'refused'
                ? '这台宿主装不了本版：' + refused.join('、') + '。' + (rows.filter(function (r) { return r.status === 'refused'; })[0] || {}).action
                : (verdict === 'degraded'
                    ? '能装，但有 ' + degraded.length + ' 项会降级：' + degraded.join('、')
                    : '宿主能力齐全，本版可全功能运行')
        };
    }

    /** 拒载必须抛：返回 false 会被调用方忽略掉，等于静默降级。 */
    function assertLoadable(assessment) {
        var a = assessment || {};
        if (a.verdict === 'refused') {
            var err = new Error('[L26-O1 宿主拒载] ' + (a.message || '宿主不满足最低要求'));
            err.code = 'HOST_REFUSED';
            err.refused = (a.refused || []).slice();
            err.reading = a.reading || 'host-refused';
            throw err;
        }
        return true;
    }

    return {
        STATUSES: STATUSES,
        PERCEIVED: PERCEIVED,
        REQUIRED_BY_DEFAULT: REQUIRED_BY_DEFAULT,
        detect: detect,
        parseHostVersion: parseHostVersion,
        compareVersions: compareVersions,
        assess: assess,
        assertLoadable: assertLoadable
    };
}));
