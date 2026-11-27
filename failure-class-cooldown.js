/* ========================================================
 * failure-class-cooldown.js — [v3.488.0] 失败分档冷却（超时类失败此前一律不落表）
 *
 * 【为什么需要这一面 / 修前实测（不是估计）】
 *   `memory-organs.js` 的 `fetchWithTimeoutRetry` 本来就有一套凭据冷却（`_credCooldowns`），
 *   但它**只在 401/403 那一条分支落表**：
 *       if (resp.status === 401 || resp.status === 403) { if (credKey) _credCooldowns.set(...) }
 *   而走 `catch` 的两条路 —— 内部超时（`timedOut`）与传输异常（`TypeError`）——
 *   在重试耗尽后直接 `throw`，**一个字节都不记**。
 *   后果是可复算的：`timeoutSec` 默认 30、`retries` 默认 2（`maxAttempts = 3`），
 *   于是一个「API 地址填错 / 代理不通」的用户，**每条记忆**都要把 90s 走满才降级。
 *   一次会话 20 条记忆就是 90s × 20，而每一次降级的读数与第一次**完全同形**
 *   （只有 `_embedDegrade.exception++`），面板上分不出「第一次就坏了」与「第二十次还在坏」。
 *
 * 【本模块做什么：把「失败」分成五档，各档冷却不同】
 *   AUTH      401 / 403         配置错，改了才会好          ⇒ 长冷却（默认 1800s）
 *   QUOTA     429 / 5xx         限流 / 上游故障            ⇒ 中冷却（默认 300s）
 *   TIMEOUT   AbortError(内部)  可能只是一时抖动            ⇒ 短冷却（默认 120s）
 *   TRANSPORT TypeError / 其它  网络层                      ⇒ 短冷却（默认 120s）
 *   UNKNOWN   分不出来            **不许猜**                 ⇒ 不冷却（TTL 0），只记 reason
 *   四档 TTL 的差别是本模块立身之处：把 auth 的 30 分钟套到一次网络抖动上，
 *   等于「抖一下就当配置错了」；把 timeout 的 2 分钟套到 auth 上，
 *   等于「明知凭据无效，还每两分钟去撞一次」。
 *
 * 【三态不可混同（本仓 R2-A 同族纪律）】
 *   'cooling'  冷却中 ⇒ 调用方**必须立刻降级并留痕**，不许静默等下一次超时
 *   'open'     可以试（从未失败，或冷却已到点被清掉）
 *   'absent'   这张表里没有这一条（与 'open' **不同形**：一个是「探过、好了」，
 *              一个是「压根没探过」。混同会让「恢复了」与「没坏过」同形）
 *
 * 【为什么不把这段直接写进 fetchWithTimeoutRetry 的 catch】
 *   ① 那个函数有 24 处调用方（LLM 提取 / 状态栏 / 世界书 / 面板），
 *      把「超时也进冷却」硬写进去，等于**全局改契约** —— 提取失败要立刻报错给人看，
 *      不该被记忆侧的冷却语义拖住。故冷却的**判定与记账**抽成纯函数，
 *      要用的调用方自己带 opts 来问（`cooldownOnTimeoutMs`），不传 = 行为与修前逐字一致。
 *   ② 判据要能直接测「档位 → TTL」「连续失败计数」「到点自动解除」，
 *      写在一个 30 行的 async 函数里就只能靠 mock 去间接看。
 *
 * 【不做什么（边界）】
 *   · 不存任何全局状态：`record()` 出入参都是 entry，表由调用方持有（key 由调用方定）；
 *   · 不发请求、不读 window / localStorage / DOM：纯函数，同输入同输出；
 *   · 不递增 TTL：连续失败只累加 `count`，**不**做「失败越多冷却越久」的指数惩罚 ——
 *     那会让一次抖动演变成永久降级，而「可复原」正是本仓要的；
 *   · 不替代既有 `_credCooldowns`：那一套照旧跑，本模块只补它没覆盖的那三条路。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaFailureClassCooldown = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /** 五档失败类别。字面量收在一处，下游断言与诊断行都取这里。 */
    var CLASSES = {
        AUTH: 'auth',
        QUOTA: 'quota',
        TIMEOUT: 'timeout',
        TRANSPORT: 'transport',
        UNKNOWN: 'unknown'
    };

    /** 三态。'absent' 与 'open' 必须不同形（见头注释）。 */
    var STATES = {
        COOLING: 'cooling',
        OPEN: 'open',
        ABSENT: 'absent'
    };

    /** 各档冷却时长（毫秒）。auth 与既有 `_credCooldowns` 的 cooldownSec=1800 同档。 */
    var DEFAULT_TTL_MS = {
        auth: 1800 * 1000,
        quota: 300 * 1000,
        timeout: 120 * 1000,
        transport: 120 * 1000,
        unknown: 0
    };

    function num(v, dflt) {
        var n = Number(v);
        return isFinite(n) ? n : dflt;
    }

    /**
     * classify(input) -> { cls, reason, status }
     *   input 可以是：HTTP 状态码（数字）/ Error / { status, name, timedOut, code }
     *   判定顺序是刻意的：**显式证据**优先于类型推断（`timedOut:true` 比 err.name 更可信）。
     */
    function classify(input) {
        var status = 0;
        var name = '';
        var timedOut = false;
        var code = '';
        if (typeof input === 'number') {
            status = num(input, 0);
        } else if (input && typeof input === 'object') {
            status = num(input.status, 0);
            name = String(input.name || '');
            timedOut = input.timedOut === true;
            code = String(input.code || '');
        }
        if (status === 401 || status === 403) {
            return { cls: CLASSES.AUTH, reason: 'http-' + status, status: status };
        }
        if (status === 429) {
            return { cls: CLASSES.QUOTA, reason: 'http-429', status: status };
        }
        if (status >= 500 && status <= 599) {
            return { cls: CLASSES.QUOTA, reason: 'http-' + status, status: status };
        }
        if (status >= 400 && status <= 499) {
            /* 其余 4xx 是请求本身不合法（缺字段 / 模型名错）。重试无意义、
             *   但与「凭据错」不同档：改请求即可，不必冷却半小时。 */
            return { cls: CLASSES.TRANSPORT, reason: 'http-' + status, status: status };
        }
        if (timedOut) {
            return { cls: CLASSES.TIMEOUT, reason: 'timeout', status: status };
        }
        if (name === 'AbortError') {
            return { cls: CLASSES.TIMEOUT, reason: 'abort', status: status };
        }
        if (name === 'TimeoutError') {
            return { cls: CLASSES.TIMEOUT, reason: 'timeout-error', status: status };
        }
        if (name === 'TypeError') {
            return { cls: CLASSES.TRANSPORT, reason: code ? 'transport-' + code : 'transport', status: status };
        }
        /* 分不出来就如实说不出来：不冷却（TTL 0），只留 reason 供人看。
         *   把 unknown 硬塞进 transport 会让「从没见过这类错」与「网络层坏」同形。 */
        return { cls: CLASSES.UNKNOWN, reason: name ? 'unclassified-' + name : 'unclassified', status: status };
    }

    /** ttlFor(cls, opts) -> 毫秒。opts 可逐档覆盖（不传就用 DEFAULT_TTL_MS）。 */
    function ttlFor(cls, opts) {
        var o = opts && typeof opts === 'object' ? opts : {};
        var key = String(cls || '');
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_TTL_MS, key)) return 0;
        var override = num(o[key], NaN);
        if (isFinite(override) && override >= 0) return override;
        return DEFAULT_TTL_MS[key];
    }

    /**
     * verdict(entry, nowMs) -> { state, remainMs, cls, count, reason }
     *   entry === null/undefined ⇒ 'absent'（不是 'open'）
     */
    function verdict(entry, nowMs) {
        if (!entry || typeof entry !== 'object' || !entry.until) {
            return { state: STATES.ABSENT, remainMs: 0, cls: '', count: 0, reason: '' };
        }
        var now = num(nowMs, Date.now());
        var until = num(entry.until, 0);
        var remainMs = until - now;
        if (remainMs > 0) {
            return {
                state: STATES.COOLING,
                remainMs: remainMs,
                cls: String(entry.cls || ''),
                count: num(entry.count, 1),
                reason: String(entry.reason || '')
            };
        }
        return {
            state: STATES.OPEN,
            remainMs: 0,
            cls: String(entry.cls || ''),
            count: num(entry.count, 1),
            reason: String(entry.reason || '')
        };
    }

    /**
     * record(prev, failure, nowMs, opts) -> entry
     *   prev 可以是 null（首次失败）/ 一个 entry / 一个只有 count 的残entry。
     *   failure 可以是 classify 的入参，也可以是 classify 的**返回值**（含 cls）。
     *   TTL 为 0 的档（unknown）仍然返回 entry，但 `until === now` ⇒ verdict 立刻是 'open'。
     *   **返回 entry 而不是改 prev**：entry 是纯数据，表由调用方持有。
     */
    function record(prev, failure, nowMs, opts) {
        var now = num(nowMs, Date.now());
        var f = (failure && typeof failure === 'object' && failure.cls)
            ? failure
            : classify(failure);
        var cls = String(f.cls || CLASSES.UNKNOWN);
        var ttl = ttlFor(cls, opts);
        var prevCount = (prev && typeof prev === 'object') ? num(prev.count, 0) : 0;
        var firstAt = (prev && typeof prev === 'object' && prev.firstAt) ? num(prev.firstAt, now) : now;
        return {
            cls: cls,
            reason: String(f.reason || ''),
            status: num(f.status, 0),
            ttlMs: ttl,
            until: now + ttl,
            firstAt: firstAt,
            lastAt: now,
            count: prevCount + 1
        };
    }

    /**
     * sweep(map, nowMs) -> { kept, cleared, clearedKeys }
     *   map: Map<key, entry>（调用方持有）。**只清到点的**，清完返回读数。
     *   过期的条目被删掉 ⇒ 下次 verdict 拿到 'absent'；这与「冷却中」不同形，
     *   也让「恢复了」这件事在账上留下一次 `cleared` 计数。
     */
    function sweep(map, nowMs) {
        var now = num(nowMs, Date.now());
        var kept = 0;
        var cleared = 0;
        var clearedKeys = [];
        if (!map || typeof map.forEach !== 'function') {
            return { kept: 0, cleared: 0, clearedKeys: [], malformed: true };
        }
        var doomed = [];
        map.forEach(function (entry, key) {
            var until = entry && num(entry.until, 0);
            if (until > now) kept += 1;
            else doomed.push(key);
        });
        for (var i = 0; i < doomed.length; i += 1) {
            map.delete(doomed[i]);
            cleared += 1;
            clearedKeys.push(doomed[i]);
        }
        return { kept: kept, cleared: cleared, clearedKeys: clearedKeys, malformed: false };
    }

    /**
     * summary(entries) -> 人话。entries 是 entry 数组（不是 map）。
     *   没有条目时回「无失败记录」，**不回「正常」** —— 「没坏过」不等于「验过是好的」。
     */
    var CLASS_LABEL = {
        auth: '凭据',
        quota: '限流/上游',
        timeout: '超时',
        transport: '传输',
        unknown: '未分类'
    };

    function summary(entries, nowMs) {
        if (!Array.isArray(entries) || entries.length === 0) return '无失败记录';
        var now = num(nowMs, Date.now());
        var parts = [];
        for (var i = 0; i < entries.length; i += 1) {
            var e = entries[i];
            if (!e || typeof e !== 'object') continue;
            var v = verdict(e, now);
            var label = CLASS_LABEL[String(e.cls || '')] || '未知档';
            var tail = v.state === STATES.COOLING
                ? '冷却 ' + Math.ceil(v.remainMs / 1000) + 's'
                : '到点';
            parts.push(label + ' ×' + num(e.count, 1) + '（' + tail + '）');
        }
        return parts.length ? parts.join(' · ') : '无失败记录';
    }

    return {
        CLASSES: CLASSES,
        STATES: STATES,
        DEFAULT_TTL_MS: DEFAULT_TTL_MS,
        CLASS_LABEL: CLASS_LABEL,
        classify: classify,
        ttlFor: ttlFor,
        verdict: verdict,
        record: record,
        sweep: sweep,
        summary: summary
    };
}));