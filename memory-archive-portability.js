/* ============================================================
 * memory-archive-portability.js — L26-X1 记忆档案可携
 *
 * 【治的欠债】没有导出/导入，换设备即失忆。用户唯一能带走的是 SillyTavern
 *   自己的聊天记录，插件的记忆全留在 localStorage 里。
 *
 * 【三条硬要求】
 *   1. 导出**人类可读**：键排序的缩进 JSON，逐条带 `text`（人一眼能看懂记了什么）；
 *   2. 导入三模式必须**结果不同形**：`replace` / `merge` / `fill-empty`；
 *   3. 导入前出**差异预览**（新增/冲突/相同）；冲突**不许静默覆盖**，
 *      merge 模式下保留本地并在 `conflicts` 里点名。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaMemoryArchivePortability = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var MODES = Object.freeze(['replace', 'merge', 'fill-empty']);
    var SCHEMA = 'lonsha-archive/1';

    function byId(records) {
        var map = {};
        (Array.isArray(records) ? records : []).forEach(function (r) {
            if (!r || typeof r.id !== 'string' || !r.id) return;
            map[r.id] = r;
        });
        return map;
    }

    function sortedKeys(obj) {
        return Object.keys(obj || {}).sort();
    }

    function normalize(record) {
        var out = {};
        sortedKeys(record).forEach(function (k) { out[k] = record[k]; });
        return out;
    }

    /** 人类可读导出：缩进 + 键排序 + 每条补一句 `text`。 */
    function exportArchive(records, opts) {
        var o = opts || {};
        var items = (Array.isArray(records) ? records : [])
            .filter(function (r) { return r && typeof r.id === 'string' && r.id; })
            .map(function (r) {
                var copy = normalize(r);
                if (!copy.text) {
                    copy.text = String(r.content || r.summary || r.title || '').slice(0, 200);
                }
                return copy;
            });
        var archive = {
            schema: SCHEMA,
            exportedAt: o.now === undefined ? null : o.now,
            count: items.length,
            items: items
        };
        var text = JSON.stringify(archive, null, 2);
        return { archive: archive, text: text, count: items.length };
    }

    function diffFields(a, b) {
        var out = [];
        var keys = sortedKeys(a).concat(sortedKeys(b).filter(function (k) { return sortedKeys(a).indexOf(k) < 0; }));
        keys.forEach(function (k) {
            var x = JSON.stringify(a[k] === undefined ? null : a[k]);
            var y = JSON.stringify(b[k] === undefined ? null : b[k]);
            if (x !== y) out.push({ field: k, local: a[k] === undefined ? null : a[k], incoming: b[k] === undefined ? null : b[k] });
        });
        return out;
    }

    /** 差异预览：导入之前先看清会发生什么。 */
    function previewImport(current, incoming) {
        var cur = byId(current);
        var inc = byId(incoming);
        var adds = [];
        var conflicts = [];
        var identical = [];
        Object.keys(inc).forEach(function (id) {
            if (!cur[id]) {
                adds.push(inc[id]);
                return;
            }
            var df = diffFields(cur[id], inc[id]);
            if (df.length === 0) identical.push(id);
            else conflicts.push({ id: id, fields: df });
        });
        var onlyLocal = Object.keys(cur).filter(function (id) { return !inc[id]; }).map(function (id) { return id; });
        return {
            adds: adds,
            conflicts: conflicts,
            identical: identical,
            onlyLocal: onlyLocal,
            summary: '新增 ' + adds.length + ' 条 / 冲突 ' + conflicts.length + ' 条 / 相同 ' + identical.length + ' 条 / 仅本地 ' + onlyLocal.length + ' 条'
        };
    }

    /**
     * 导入。
     * @param {Array} current 现有记忆
     * @param {Array} incoming 档案里的记忆
     * @param {'replace'|'merge'|'fill-empty'} mode
     */
    function importArchive(current, incoming, mode) {
        if (MODES.indexOf(mode) < 0) {
            var err = new Error('[L26-X1] 未知导入模式「' + String(mode) + '」；只有 ' + MODES.join('/'));
            err.code = 'ARCHIVE_REFUSED';
            throw err;
        }
        var cur = byId(current);
        var inc = byId(incoming);
        var preview = previewImport(current, incoming);
        var result = [];
        var conflicts = [];

        if (mode === 'replace') {
            Object.keys(inc).forEach(function (id) { result.push(inc[id]); });
        } else if (mode === 'merge') {
            Object.keys(cur).forEach(function (id) { result.push(cur[id]); });
            Object.keys(inc).forEach(function (id) {
                if (!cur[id]) {
                    result.push(inc[id]);
                    return;
                }
                var df = diffFields(cur[id], inc[id]);
                if (df.length) conflicts.push({ id: id, kept: 'local', fields: df });
            });
        } else {
            // fill-empty：只往本地空字段里填，已有值一律不动。
            Object.keys(cur).forEach(function (id) {
                var base = normalize(cur[id]);
                var other = inc[id];
                if (other) {
                    sortedKeys(other).forEach(function (k) {
                        var empty = base[k] === undefined || base[k] === null || base[k] === ''
                            || (Array.isArray(base[k]) && base[k].length === 0);
                        if (empty) base[k] = other[k];
                    });
                }
                result.push(base);
            });
            Object.keys(inc).forEach(function (id) {
                if (!cur[id]) result.push(inc[id]);
            });
        }

        return {
            mode: mode,
            records: result,
            count: result.length,
            conflicts: conflicts,
            preview: preview,
            reading: conflicts.length ? ('archive-imported-with-conflicts:' + conflicts.length) : 'archive-imported'
        };
    }

    return {
        MODES: MODES,
        SCHEMA: SCHEMA,
        exportArchive: exportArchive,
        previewImport: previewImport,
        importArchive: importArchive,
        diffFields: diffFields
    };
}));