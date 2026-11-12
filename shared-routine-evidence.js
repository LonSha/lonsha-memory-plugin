/* L21-X6: shared-routine-evidence. Does not mutate engine state read from
 * circadian-shared-routine-engine; classifies each habit into exactly one of
 * three tiers: observed (seen but count below threshold) / established
 * (mentionable) / atypical (today is off-routine, do not mention). The
 * establish threshold is a single named exported constant — no magic numbers
 * anywhere else. Decision always carries progress text and a readable reason. */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaRoutineEvidence = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const VERSION = '1.0.0-L21-X6';

    // 可读阈值：一条习惯被「见过」达到该次数，才升 established（可被角色主动提起）。
    const ESTABLISH_THRESHOLD = 5;

    function clampCount(n) {
        const v = typeof n === 'number' && isFinite(n) ? Math.floor(n) : 0;
        return v < 0 ? 0 : v;
    }

    /* classify(habit, opts) — habit: {id,name,observedCount}（其余字段忽略）；
     * opts: { atypicalToday?: boolean }。返回
     * { habitId, tier, observedCount, threshold, progressText, reason, shouldMention }
     * tier 三选一：'observed' | 'established' | 'atypical'。atypical 优先于计数：
     * 今天反常时不提，无论沉淀多少次。 */
    function classify(habit, opts) {
        const o = opts || {};
        const id = (habit && habit.id) ? String(habit.id) : '(no-id)';
        const name = (habit && habit.name) ? String(habit.name) : '(unnamed)';
        const count = clampCount(habit && habit.observedCount);
        const base = {
            habitId: id,
            name: name,
            observedCount: count,
            threshold: ESTABLISH_THRESHOLD,
            progressText: '第 ' + count + '/' + ESTABLISH_THRESHOLD + ' 次',
            shouldMention: false
        };
        if (o.atypicalToday === true) {
            return Object.assign({}, base, {
                tier: 'atypical',
                reason: '今天反常（atypicalToday），暂不主动提起；沉淀进度 ' + base.progressText
            });
        }
        if (count >= ESTABLISH_THRESHOLD) {
            return Object.assign({}, base, {
                tier: 'established',
                reason: '已沉淀：' + base.progressText + '，达到阈值 ' + ESTABLISH_THRESHOLD + '，可被角色主动提起'
            });
        }
        return Object.assign({}, base, {
            tier: 'observed',
            reason: '待观察：' + base.progressText + '，未达阈值 ' + ESTABLISH_THRESHOLD + '，本次不主动提起'
        });
    }

    /* classifyAll(habits, opts) — 批量；返回 { verdicts, mentionable, summarize }。
     * mentionable 只含 established 且 shouldMention=true 的条目。 */
    function classifyAll(habits, opts) {
        const list = Array.isArray(habits) ? habits : [];
        const verdicts = list.map(function (h) { return classify(h, opts); });
        const mentionable = verdicts.filter(function (v) {
            return v.tier === 'established' && v.shouldMention === false ? false : v.tier === 'established';
        });
        return {
            verdicts: verdicts,
            mentionable: mentionable,
            summarize: function () {
                return verdicts.map(function (v) {
                    return v.habitId + ':' + v.tier + '(' + v.progressText + ')';
                }).join('; ');
            }
        };
    }

    /* formatPanel — 玩家入口读面：生活看板「☕ 共同起居」每行带进度。 */
    function formatPanel(state) {
        const habits = state && Array.isArray(state.habits) ? state.habits : [];
        const rows = habits.map(function (h) {
            const v = classify(h);
            const mark = v.tier === 'established' ? '✅' : (v.tier === 'atypical' ? '⚠️' : '👀');
            return mark + ' ' + v.name + '　' + v.progressText;
        });
        return rows.length ? ('☕ 共同起居\n' + rows.join('\n')) : '☕ 共同起居\n（暂无习惯记录）';
    }

    return { VERSION, ESTABLISH_THRESHOLD, classify, classifyAll, formatPanel };
}));