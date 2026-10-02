(function (global) {
    'use strict';
/**
 * pristine-fetch.js — [v3.260.0 缝合] 绕过宿主页面第三方脚本对 fetch 的包装
 *
 * 【来源】缝合 AlbusKen/shujuku（数剧）src/data/gateways/pristine-fetch.ts，
 *         按本插件工程规范重写为经典脚本 IIFE 模块（双导出），保留完整解析语义。
 *
 * 【为什么需要这一面】
 *   酒馆预设脚本（如 Kemini 伴生面板）会 patch 宿主页面的 fetch，命中生成端点后
 *   改写请求体并重写响应流（注入它们自己的「传输函数」工具与控制提示词）。本插件的
 *   内部请求（提取 / 召回 / 精选 / 嵌入）打同源端点且自带自己的协议，被改写后
 *   轻则响应混入外来注入文本，重则工具调用被剥——而且这一切都静默发生。
 *
 * 【解析顺序（与源码逐字同构）】
 *   1. 按已知拦截器登记的原始实现逐层剥离包装链（wrapper[MARKER] = { original }）；
 *   2. 剥离结果仍不是原生 fetch（外层还有未登记标记的包装）时，改用本模块专用
 *      隐藏同源 iframe 的原生 fetch——第三方脚本只包装已有窗口的 fetch，
 *      碰不到这里新建的浏览上下文；
 *   3. 两者都拿不到时回退当前全局 fetch 并一次性告警，不阻断请求。
 *   每次调用都重新解析（源码同款纪律）：脚本可能在本模块加载之后才安装，
 *   缓存会让屏蔽静默失效。
 *
 * 【与源码差异】
 *   - TS 类型与 _ACU 后缀按本仓经典脚本惯例去除；模块级告警去重保留；
 *   - 新增 options 参数（_doc / fetch 注入口），供 Node 判据套件在无 DOM 环境下
 *     确定性驱动 iframe 分支——真浏览器路径零变化；
 *   - 宿主正文生成不经过本模块（源码同款边界）：脚本对聊天正文的效果不受影响。
 *
 * 挂 window.LonShaPristineFetch，双导出（对齐 memory-books 约定）。
 */

    /** 已知拦截器在 wrapper 上登记原函数的标记键，形如 wrapper[MARKER] = { original }。 */
    var KNOWN_FETCH_PATCH_MARKERS = [
        '__keminiAntiTruncation__',
        '__keminiFetchInterceptor__',
    ];

    /** 包装链深度上限，防御环形引用与异常长的链条。 */
    var MAX_UNWRAP_DEPTH = 16;

    /** 专用隐藏 iframe 的元素 id。 */
    var PRISTINE_FRAME_ID = 'lonsha-pristine-fetch-frame';

    var warnedFallback = false;

    /** 读取 wrapper 登记的原始实现；不是已知包装时返回 null。 */
    function readRegisteredOriginal(candidate) {
        if (typeof candidate !== 'function') return null;
        for (var i = 0; i < KNOWN_FETCH_PATCH_MARKERS.length; i++) {
            var marker = KNOWN_FETCH_PATCH_MARKERS[i];
            var slot = null;
            try { slot = candidate[marker]; } catch (e) { slot = null; }
            if (!slot || typeof slot !== 'object') continue;
            var original = slot.original;
            if (typeof original === 'function') return original;
        }
        return null;
    }

    /**
     * 判断是否为浏览器原生 fetch：源码为 [native code] 且函数名为 fetch。
     * bind 出来的函数名是 "bound fetch"，JS 包装函数源码不是 native code，二者都不算原生。
     */
    function isNativeFetch(candidate) {
        if (typeof candidate !== 'function') return false;
        try {
            return candidate.name === 'fetch'
                && /\{\s*\[native code\]\s*\}\s*$/.test(Function.prototype.toString.call(candidate));
        } catch (e) {
            return false;
        }
    }

    /** 按已知标记逐层剥离包装链。 */
    function unwrapKnownPatches(start) {
        var current = start;
        for (var depth = 0; depth < MAX_UNWRAP_DEPTH; depth++) {
            var original = readRegisteredOriginal(current);
            if (!original || original === current) break;
            current = original;
        }
        return current;
    }

    /** 相对地址按当前文档解析为绝对地址：隐藏 iframe 的基址与宿主页面不一定一致。 */
    function toAbsoluteInput(input, doc) {
        if (typeof input !== 'string') return input;
        try {
            var base = (doc && doc.baseURI) || (global.location && global.location.href) || '';
            return base ? new URL(input, base).href : input;
        } catch (e) {
            return input;
        }
    }

    /**
     * 取专用隐藏同源 iframe 的原生 fetch，并绑定到该 iframe 窗口。
     * iframe 常驻复用：请求进行中移除浏览上下文会中断请求。
     * @returns 原生 fetch；无 DOM、创建失败或该窗口 fetch 也非原生时返回 null
     */
    function resolveFrameFetch(doc) {
        if (!doc || typeof doc.createElement !== 'function') return null;
        try {
            var frame = doc.getElementById(PRISTINE_FRAME_ID);
            if (!frame || !frame.isConnected || !frame.contentWindow) {
                if (frame && frame.remove) frame.remove();
                frame = doc.createElement('iframe');
                frame.id = PRISTINE_FRAME_ID;
                frame.setAttribute('aria-hidden', 'true');
                frame.tabIndex = -1;
                frame.style.cssText = 'display:none !important;width:0;height:0;border:0;position:absolute;';
                (doc.body || doc.documentElement).appendChild(frame);
            }
            var frameWindow = frame.contentWindow;
            var frameFetch = frameWindow && frameWindow.fetch;
            if (!frameWindow || !isNativeFetch(frameFetch)) return null;
            return function frameBoundFetch(input, init) {
                // 隐藏 iframe 的基址不一定与宿主页面一致，相对地址先按宿主文档解析为绝对地址。
                return frameFetch.call(frameWindow, toAbsoluteInput(input, doc), init);
            };
        } catch (e) {
            return null;
        }
    }

    /**
     * 解析当前未被第三方脚本包装的 fetch。
     * 每次调用都重新解析：脚本可能在本模块加载之后才安装，缓存会让屏蔽静默失效。
     * @param options 可选 { _doc } 注入文档（判据套件确定性驱动 iframe 分支用）
     * @returns 原生 fetch；无法获得时返回当前全局 fetch，不阻断请求（一次性告警）
     */
    function resolvePristineFetch(options) {
        var opts = options || {};
        var current = global.fetch;
        var unwrapped = unwrapKnownPatches(current);
        if (isNativeFetch(unwrapped)) {
            return function unwrappedFetch(input, init) {
                return unwrapped.call(global, input, init);
            };
        }
        var doc = opts._doc || (typeof document !== 'undefined' ? document : null);
        var frameFetch = resolveFrameFetch(doc);
        if (frameFetch) return frameFetch;
        if (!warnedFallback) {
            warnedFallback = true;
            console.warn('[LonShaMemory][pristine-fetch] 无法取得未包装的原生 fetch（全局 fetch 已被未知脚本包装且无 DOM 可建隔离上下文），回退全局 fetch——若生成端点被第三方脚本改写，内部请求可能被注入或剥改。');
        }
        return current;
    }

    /**
     * 以原生 fetch 发起请求，绕过第三方脚本对生成端点的改写。
     * @param input 请求地址或 Request
     * @param init 请求参数
     * @returns 宿主返回的原始响应（解析失败时 resolvePristineFetch 已回退全局，不抛、不阻断）
     */
    function pristineFetch(input, init, options) {
        var send = resolvePristineFetch(options);
        return send.call(global, input, init);
    }

    /** 测试钩子：重置告警去重与专用 iframe（判据套件确定性用；生产不调用）。 */
    function __resetFrameForTest(doc) {
        warnedFallback = false;
        try {
            if (doc) {
                var frame = doc.getElementById(PRISTINE_FRAME_ID);
                if (frame && frame.remove) frame.remove();
            }
        } catch (e) { /* 作罢 */ }
    }

    var api = Object.freeze({
        KNOWN_FETCH_PATCH_MARKERS: KNOWN_FETCH_PATCH_MARKERS,
        MAX_UNWRAP_DEPTH: MAX_UNWRAP_DEPTH,
        PRISTINE_FRAME_ID: PRISTINE_FRAME_ID,
        readRegisteredOriginal: readRegisteredOriginal,
        isNativeFetch: isNativeFetch,
        unwrapKnownPatches: unwrapKnownPatches,
        resolveFrameFetch: resolveFrameFetch,
        toAbsoluteInput: toAbsoluteInput,
        resolvePristineFetch: resolvePristineFetch,
        pristineFetch: pristineFetch,
        __resetFrameForTest: __resetFrameForTest,
    });

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaPristineFetch = api;
})(typeof window !== 'undefined' ? window : globalThis);
