/* ============================================================
 * preset-pack.js — L26-X4 预设与模板分发
 *
 * 【治的欠债】判据/参数组合只能手工复制：想换一套「高召回」参数，得抄一堆数字，
 *   抄错一个就看不出是参数问题还是引擎问题。
 *
 * 【三条硬要求】
 *   1. 预设可导出（带 schema 与版本）、可导入、可校验；
 *   2. 导入失败必须**给原因**（哪个字段、为什么不合法），不许「导入失败」四个字；
 *   3. 未知字段不许静默接受（拼写错的字段会让用户以为生效了）。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaPresetPack = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var SCHEMA = 'lonsha-preset/1';

    /** 每个字段：类型 + 取值范围 + 人话说明（说明也要导出，用户才知道这个数字是干嘛的）。 */
    var FIELDS = Object.freeze({
        recallTopK: Object.freeze({ type: 'int', min: 1, max: 200, label: '每次召回取几条' }),
        minScore: Object.freeze({ type: 'number', min: 0, max: 1, label: '命中分数下限' }),
        decayHalfLifeDays: Object.freeze({ type: 'number', min: 0.5, max: 3650, label: '记忆衰减半衰期（天）' }),
        injectBudgetChars: Object.freeze({ type: 'int', min: 200, max: 8000, label: '注入预算（字符）' }),
        language: Object.freeze({ type: 'enum', values: Object.freeze(['zh', 'en']), label: '界面语言' })
    });

    function typeOk(field, value) {
        var spec = FIELDS[field];
        if (spec.type === 'int') return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
        if (spec.type === 'number') return typeof value === 'number' && isFinite(value);
        if (spec.type === 'enum') return typeof value === 'string' && spec.values.indexOf(value) >= 0;
        return false;
    }

    /** 校验：逐字段给原因；未知字段也点名（拼错字段最坑）。 */
    function validatePreset(preset) {
        var p = preset || {};
        var errors = [];
        if (p.schema !== SCHEMA) {
            errors.push({ field: 'schema', why: '预设 schema 应为 ' + SCHEMA + '，收到 ' + String(p.schema) });
        }
        var values = p.values && typeof p.values === 'object' ? p.values : {};
        Object.keys(values).forEach(function (k) {
            var spec = FIELDS[k];
            if (!spec) {
                errors.push({ field: k, why: '未知字段（拼写错了？本版没有这个预设项）' });
                return;
            }
            var v = values[k];
            if (!typeOk(k, v)) {
                errors.push({ field: k, why: spec.label + '：类型不对（要 ' + spec.type + '），收到 ' + JSON.stringify(v) });
                return;
            }
            if (spec.type !== 'enum') {
                if (v < spec.min || v > spec.max) {
                    errors.push({ field: k, why: spec.label + '：应在 ' + spec.min + '~' + spec.max + ' 之间，收到 ' + v });
                }
            }
        });
        Object.keys(FIELDS).forEach(function (k) {
            if (values[k] === undefined) errors.push({ field: k, why: '缺少必填项：' + FIELDS[k].label });
        });
        return { ok: errors.length === 0, errors: errors, values: values, reading: errors.length ? ('preset-invalid:' + errors.length) : 'preset-valid' };
    }

    function exportPreset(values, opts) {
        var o = opts || {};
        var preset = {
            schema: SCHEMA,
            name: typeof o.name === 'string' && o.name ? o.name : '未命名预设',
            author: typeof o.author === 'string' ? o.author : '',
            values: values || {},
            legend: Object.keys(FIELDS).map(function (k) { return { field: k, label: FIELDS[k].label }; })
        };
        var check = validatePreset(preset);
        if (!check.ok) {
            var e = new Error('[L26-X4] 导出前校验不通过：' + check.errors.map(function (x) { return x.field; }).join('、'));
            e.code = 'PRESET_INVALID';
            e.errors = check.errors;
            throw e;
        }
        return { preset: preset, text: JSON.stringify(preset, null, 2), reading: 'preset-exported' };
    }

    function importPreset(text) {
        var parsed;
        try {
            parsed = JSON.parse(String(text || ''));
        } catch (e) {
            var bad = new Error('[L26-X4] 预设不是合法 JSON：' + e.message);
            bad.code = 'PRESET_INVALID';
            throw bad;
        }
        var check = validatePreset(parsed);
        if (!check.ok) {
            var err = new Error('[L26-X4] 预设校验不通过：' + check.errors.map(function (x) { return x.field + '（' + x.why + '）'; }).join('；'));
            err.code = 'PRESET_INVALID';
            err.errors = check.errors;
            throw err;
        }
        return { name: parsed.name, values: check.values, reading: 'preset-imported' };
    }

    return {
        SCHEMA: SCHEMA,
        FIELDS: FIELDS,
        validatePreset: validatePreset,
        exportPreset: exportPreset,
        importPreset: importPreset
    };
}));