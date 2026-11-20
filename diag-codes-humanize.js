/* ============================================================
 * diag-codes-humanize.js — L26-O8 错误可读化收尾（全部诊断码有人话）
 *
 * 【治的欠债】承接 L25-O7：只把「最常撞的几条」翻了人话，其余诊断码仍是
 *   大写下划线串。用户贴一句 `MIGRATION_REFUSED` 过来，两边都得猜。
 *
 * 【三条硬要求】
 *   1. 诊断码有人话与「下一步做什么」两段，缺一段即未登记；
 *   2. 未登记不许上线：`auditCodes()` 扫源码里的码，未登记就红（**可扫**，不靠自觉）；
 *   3. 未登记码在 `humanOf()` 里返回显式标记，**不许回落成码本身**（那看起来像已翻译）。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaDiagCodesHumanize = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var UNREGISTERED_MARK = '⟦未登记诊断码:';

    /** 本版已知诊断码。新增码必须同时在 REGISTRY 登记人话与下一步。 */
    var REGISTRY = Object.freeze({
        HOST_REFUSED: Object.freeze({
            human: '这台宿主版本/能力不够，本插件拒绝装载，以免「装上了却记不住」',
            next: '先把 SillyTavern 升到 manifest 要求的版本再装'
        }),
        RETIRE_BLOCKED: Object.freeze({
            human: '要退役的模块仍被别的模块引用，退役会让那条链路读到空',
            next: '先改掉引用它的地方，再重新生成退役计划'
        }),
        MIGRATION_REFUSED: Object.freeze({
            human: '这份数据的格式版本本版读不了（通常是数据比插件还新）',
            next: '升级插件到读过该版本的版本；不要降级写回，会写坏'
        }),
        ARCHIVE_REFUSED: Object.freeze({
            human: '导入包不合法或缺少必要字段，本插件没有动现有记忆',
            next: '用「导出」重新生成一份档案再导入'
        }),
        BRIDGE_CONFLICT: Object.freeze({
            human: '同一段对话在手机仓与插件仓记的内容不一致',
            next: '在互通页里逐条看过差异再选保留哪一方（本插件不会自动覆盖）'
        }),
        PRESET_INVALID: Object.freeze({
            human: '预设文件缺字段或值越界，导入已中止',
            next: '检查预设的 schema 版本与必填项，或换一份预设'
        }),
        BATCH_UNDO_EXPIRED: Object.freeze({
            human: '这次批量操作已超过可回滚窗口，撤销会失败',
            next: '改用导出档案手工恢复；下次批量前先导一份备份'
        })
    });

    function humanOf(code) {
        var row = REGISTRY[code];
        if (!row || !row.human || !row.next) return UNREGISTERED_MARK + String(code) + '⟧';
        return row.human + '（下一步：' + row.next + '）';
    }

    function isRegistered(code) {
        var row = REGISTRY[code];
        return !!(row && typeof row.human === 'string' && row.human.length > 4
            && typeof row.next === 'string' && row.next.length > 4);
    }

    /** 从源码文本里抽诊断码：`code = 'X'` / `code: 'X'` / `err.code = 'X'`。 */
    function extractCodes(text) {
        var out = [];
        var src = String(text || '');
        var re = /\.?code\s*[:=]\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g;
        var m;
        while ((m = re.exec(src)) !== null) {
            if (out.indexOf(m[1]) < 0) out.push(m[1]);
        }
        return out;
    }

    /**
     * 扫全仓诊断码。
     * @param {{sources:object, registry?:object}} opts sources: {文件名: 源码文本}
     */
    function auditCodes(opts) {
        var o = opts || {};
        var registry = o.registry || REGISTRY;
        var sources = o.sources || {};
        var found = [];
        var unregistered = [];
        Object.keys(sources).forEach(function (file) {
            extractCodes(sources[file]).forEach(function (code) {
                var row = registry[code];
                if (found.indexOf(code) < 0) found.push(code);
                var ok = !!(row && typeof row.human === 'string' && row.human.length > 4
                    && typeof row.next === 'string' && row.next.length > 4);
                if (!ok) unregistered.push({ file: file, code: code });
            });
        });
        return {
            codes: found,
            unregistered: unregistered,
            ok: unregistered.length === 0,
            reading: unregistered.length === 0
                ? ('diag-humanized:' + found.length + ' 个码')
                : ('diag-unregistered:' + unregistered.map(function (u) { return u.code; }).join(','))
        };
    }

    /** 人话表渲染：给「诊断码一览」页面直接铺。 */
    function renderTable(registry) {
        var reg = registry || REGISTRY;
        return Object.keys(reg).sort().map(function (code) {
            return { code: code, human: reg[code].human, next: reg[code].next };
        });
    }

    return {
        REGISTRY: REGISTRY,
        UNREGISTERED_MARK: UNREGISTERED_MARK,
        humanOf: humanOf,
        isRegistered: isRegistered,
        extractCodes: extractCodes,
        auditCodes: auditCodes,
        renderTable: renderTable
    };
}));