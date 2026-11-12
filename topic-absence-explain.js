/* L21-X9: topic-absence-explain. Topic-level (NOT entry-level) explanation of
 * "why don't I remember this". Four mutually exclusive verdicts:
 *   never-told         — 从没被告知/记录过（不用管）
 *   told-but-dropped   — 说过，被裁掉了（给裁剪原因与原楼层，可展开）
 *   told-before-branch — 在另一个世界线分支说过（给分支标记）
 *   undecided          — 判不了（要人去看；处置与 never-told 相反，绝不并档）
 * Inputs are explicit records; every missing input that matters makes the
 * verdict undecided, never never-told. */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaTopicAbsence = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const VERSION = '1.0.0-L21-X9';

    const VERDICTS = Object.freeze({
        NEVER_TOLD: 'never-told',
        TOLD_BUT_DROPPED: 'told-but-dropped',
        TOLD_BEFORE_BRANCH: 'told-before-branch',
        UNDECIDED: 'undecided'
    });

    function kw(text) {
        return String(text === undefined || text === null ? '' : text).trim();
    }

    /* explain(topic, evidence) — evidence 显式四源：
     *   everRecorded: boolean|null  — 全账（含已淘汰/墓碑）里有没有记过这个话题
     *   dropped: { floor, why }|null — 记过但被裁：在哪一楼、因什么被裁
     *   otherBranch: { lineId }|null — 在另一条世界线上记过
     *   searchable: boolean|null     — 当前正文/搜索面上能不能搜到
     * 裁决（显式、可读）：
     *   ① 当前能搜到        ⇒ 不缺，无需解释（{needed:false}）
     *   ② dropped 有据      ⇒ told-but-dropped（带楼层与裁剪原因）
     *   ③ otherBranch 有据  ⇒ told-before-branch
     *   ④ everRecorded===false（且无任何反证） ⇒ never-told
     *   ⑤ 其余（输入缺席/互斥证据并存）       ⇒ undecided —— 绝不并进 never-told */
    function explain(topic, evidence) {
        const t = kw(topic);
        const ev = evidence && typeof evidence === 'object' ? evidence : {};
        if (!t) {
            return { verdict: VERDICTS.UNDECIDED, needed: true, reason: '话题为空，无法归因（判不了）' };
        }
        const searchable = ev.searchable === true;
        if (searchable) {
            return { verdict: null, needed: false, reason: '当前能搜到，不缺这条记忆，无需归因' };
        }
        const d = ev.dropped;
        const dOk = d && typeof d === 'object' && d.floor !== undefined && d.floor !== null && kw(d.why);
        if (dOk) {
            return {
                verdict: VERDICTS.TOLD_BUT_DROPPED, needed: true,
                reason: '记录过，但在第 ' + d.floor + ' 楼因「' + kw(d.why) + '」被裁，可展开看原文',
                floor: d.floor, dropWhy: kw(d.why)
            };
        }
        const ob = ev.otherBranch;
        if (ob && typeof ob === 'object' && kw(ob.lineId)) {
            return {
                verdict: VERDICTS.TOLD_BEFORE_BRANCH, needed: true,
                reason: '在另一条世界线（' + kw(ob.lineId) + '）说过，当前线没有',
                lineId: kw(ob.lineId)
            };
        }
        if (ev.everRecorded === false) {
            // never-told 需要「全账确认没记过」这一显式读数；缺席不给这个结论。
            const fullScan = ev.everRecordedSource === true || ev.fullScan === true;
            if (fullScan) {
                return { verdict: VERDICTS.NEVER_TOLD, needed: true, reason: '全账确认从没记录过这个话题' };
            }
            return { verdict: VERDICTS.UNDECIDED, needed: true, reason: '搜索面没有，但「全账有没有记过」未核验（判不了，不是没记过）' };
        }
        return { verdict: VERDICTS.UNDECIDED, needed: true, reason: '归因证据不齐（判不了，需要人工看一眼）' };
    }

    /* 搜索结果页底部那行：「为什么没有这条？」 */
    function formatLine(result) {
        const r = result || {};
        if (r.needed === false) return '';
        const marks = { 'never-told': '🚫', 'told-but-dropped': '✂️', 'told-before-branch': '🌿', 'undecided': '❓' };
        const m = marks[r.verdict] || '❓';
        return '「为什么没有这条？」' + m + ' ' + (r.reason || '');
    }

    return { VERSION, VERDICTS, explain, formatLine };
}));