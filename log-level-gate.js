/* ============================================================
 * log-level-gate.js — L26-O4 日志分级与采样
 *
 * 【治的欠债】现有输出无级别（路线图原文：出问题只能翻全量 `【待复核】`）。
 *   用户报「记不住」时，我们只能让他把整个控制台贴过来。
 *
 * 【三条硬要求】
 *   1. 四级闭集 `debug/info/warn/error`，阈值可调；**error 永不采样**；
 *   2. 每条 error 必带 `context`（可复现上下文：会话 id / 条数 / 版本），缺了当场抛；
 *   3. 采样丢掉多少要**报数**（`stats().dropped[level]`），不许静默丢弃。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaLogLevelGate = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var LEVELS = Object.freeze(['debug', 'info', 'warn', 'error']);
    var RANK = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

    function levelRank(level) {
        if (!Object.prototype.hasOwnProperty.call(RANK, level)) {
            throw new TypeError('未知日志级别「' + String(level) + '」；只有 ' + LEVELS.join('/'));
        }
        return RANK[level];
    }

    function checkRate(rate, label) {
        if (typeof rate !== 'number' || !isFinite(rate)) {
            throw new TypeError(label + ' 必须是数字（0~1），收到 ' + String(rate));
        }
        if (rate < 0 || rate > 1) {
            throw new TypeError(label + ' 必须在 0~1 之间，收到 ' + rate);
        }
        return rate;
    }

    /**
     * @param {{sink?:Function, threshold?:string, sampleRate?:number, rng?:Function, now?:Function}} opts
     */
    function makeLogger(opts) {
        var o = opts || {};
        var sink = typeof o.sink === 'function' ? o.sink : function () {};
        var threshold = o.threshold || 'info';
        levelRank(threshold);
        var sampleRate = o.sampleRate === undefined ? 1 : checkRate(o.sampleRate, 'sampleRate');
        var rng = typeof o.rng === 'function' ? o.rng : Math.random;
        var now = typeof o.now === 'function' ? o.now : function () { return Date.now(); };
        var seq = 0;
        var stats = { emitted: { debug: 0, info: 0, warn: 0, error: 0 }, dropped: { debug: 0, info: 0, warn: 0, error: 0 }, below: { debug: 0, info: 0, warn: 0, error: 0 } };

        function write(level, msg, context) {
            var rank = levelRank(level);
            seq += 1;
            if (rank < levelRank(threshold)) {
                stats.below[level] += 1;
                return { emitted: false, reason: 'below-threshold' };
            }
            if (level === 'error' && (!context || typeof context !== 'object' || Object.keys(context).length === 0)) {
                throw new TypeError('[L26-O4] error 必须带可复现上下文（会话 id / 条数 / 版本 至少一项），否则报错不可复现');
            }
            // error 一律不打折：采样只作用于 debug/info/warn。
            if (level !== 'error' && sampleRate < 1 && rng() >= sampleRate) {
                stats.dropped[level] += 1;
                return { emitted: false, reason: 'sampled-out' };
            }
            var entry = { level: level, msg: String(msg), at: now(), seq: seq };
            if (context && typeof context === 'object') entry.context = context;
            stats.emitted[level] += 1;
            sink(entry);
            return { emitted: true, entry: entry };
        }

        var api = {
            level: function () { return threshold; },
            threshold: function (next) { levelRank(next); threshold = next; return threshold; },
            sampleRate: function (next) { sampleRate = checkRate(next, 'sampleRate'); return sampleRate; },
            stats: function () { return JSON.parse(JSON.stringify(stats)); },
            /** 采样丢失率读数：全部为 0 才 `log-lossless`，否则点名丢得最多的级别。 */
            reading: function () {
                var lost = 0;
                var worst = null;
                LEVELS.forEach(function (l) {
                    var n = stats.dropped[l];
                    lost += n;
                    if (n > 0 && (!worst || n > stats.dropped[worst])) worst = l;
                });
                return lost === 0 ? 'log-lossless' : ('log-sampled:' + worst + '×' + stats.dropped[worst]);
            }
        };
        LEVELS.forEach(function (level) {
            api[level] = function (msg, context) { return write(level, msg, context); };
        });
        return api;
    }

    return {
        LEVELS: LEVELS,
        RANK: RANK,
        levelRank: levelRank,
        makeLogger: makeLogger
    };
}));