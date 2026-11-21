/**
 * ui-form-controls.js — 设置类表单控件的工厂与小算法（v3.481.0）
 *
 * 【为什么要有这个文件】
 *   ui-kit-core 提供的是「卡片/面板/徽章/按钮」这类**容器件**，
 *   而设置页需要的是「开关/滑杆/分段/步进/输入」这类**取值件**。
 *   这两类的心智完全不同：容器件管布局，取值件管**值域与合法性**。
 *   把取值件塞进 ui-kit 会让底座开始管业务取值（它本来不该知道 min/max）。
 *
 * 【本文件的三条纪律】
 *   1. **纯函数与渲染分离**：所有值域判断（夹紧、步进对齐、切分、校验）
 *      都是纯函数，Node 下可测；渲染层单独一段，没有 DOM 时统一 absent。
 *   2. **el 必须是对象签名**：ui-kit 的 el 是 el(tag, props对象, children)。
 *      第二参传字符串会走 Object.keys('ls-x') → setAttribute('0','l') →
 *      InvalidCharacterError，**只在真机炸，Node 自检测不到**。
 *      本文件所有元素都经本地 mk() 构造，不裸调 el。
 *   3. **判不了要说话**：值域配置非法（min>max、step<=0）时返回
 *      { ok:false, kind:'absent', reason:'…' }，不静默降级成默认值 ——
 *      静默降级会让「配置写错了」看起来像「功能就这样」。
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.LonShaFormControls = api;
    if (typeof globalThis !== 'undefined') globalThis.LonShaFormControls = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';

    const VERSION = '1.0.0';

    function doc() {
        try { return (typeof document !== 'undefined') ? document : null; } catch (_e) { return null; }
    }

    function kit() {
        try { if (root && root.LonShaUiKit) return root.LonShaUiKit; } catch (_e) { /* ignore */ }
        try { if (typeof require === 'function') return require('./ui-kit-core.js'); } catch (_e) { /* ignore */ }
        return null;
    }

    /* ================================================================
     * A. 纯函数：值域与合法性
     * ================================================================ */

    /**
     * 把数字夹到 [min,max] 并对齐到 step 的整数倍。
     *
     * 为什么必须专门写：`Math.round(v/step)*step` 在浮点下会出 0.30000000000000004。
     * 这里按 step 的小数位数做定点回正，避免「滑块停在 0.3 但显示 0.30000000000000004」。
     *
     * @param {number} value 原值（任何东西都会被 Number 化，NaN 落回 min）
     * @param {{min:number,max:number,step:number}} conf
     * @returns {{ok:boolean,value:number,reason?:string,clamped:boolean}}
     */
    function clampStep(value, conf) {
        const c = conf || {};
        const min = Number(c.min);
        const max = Number(c.max);
        const step = Number(c.step);

        if (!Number.isFinite(min) || !Number.isFinite(max)) {
            return { ok: false, value: NaN, reason: 'min/max 不是有限数字', clamped: false };
        }
        if (min > max) {
            return { ok: false, value: NaN, reason: 'min 大于 max（值域反了）', clamped: false };
        }
        if (!Number.isFinite(step) || step <= 0) {
            return { ok: false, value: NaN, reason: 'step 必须是正数', clamped: false };
        }

        let v = Number(value);
        if (!Number.isFinite(v)) v = min;

        const clamped = (v < min || v > max);
        if (v < min) v = min;
        if (v > max) v = max;

        // 按 step 对齐：先算步数再乘回，最后按 step 的小数位回正
        const steps = Math.round((v - min) / step);
        let out = min + steps * step;

        const dec = decimalsOf(step);
        if (dec > 0) out = Number(out.toFixed(dec));
        // 对齐后可能越界（比如 max 不是 step 的整数倍），再夹一次
        if (out < min) out = min;
        if (out > max) out = max;

        return { ok: true, value: out, clamped };
    }

    /** 数字的小数位数。用字符串法而不是 log10 取整，后者在 0.1 上会得到 0。 */
    function decimalsOf(n) {
        const s = String(n);
        const i = s.indexOf('.');
        if (i < 0) return 0;
        const e = s.indexOf('e-');
        if (e >= 0) return Number(s.slice(e + 2));
        return s.length - i - 1;
    }

    /**
     * 生成步进可停靠的全部档位。
     *
     * 为什么要预生成而不用「每次加 step」：长按连击时反复浮点相加会累积误差
     * （按 20 次 0.1 得到的不是 2）。预生成后每次从档位表里取，误差不累积。
     * 上限保护：档位数超过 10000 直接截断并标注，避免 min/max/step 写成本末倒置
     * （比如 step=0.001）时把内存打满。
     *
     * @returns {{ok:boolean,values:number[],truncated:boolean,reason?:string}}
     */
    function stepValues(conf) {
        const c = conf || {};
        const min = Number(c.min);
        const max = Number(c.max);
        const step = Number(c.step);
        if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
            return { ok: false, values: [], truncated: false, reason: '值域非法' };
        }
        if (!Number.isFinite(step) || step <= 0) {
            return { ok: false, values: [], truncated: false, reason: 'step 必须是正数' };
        }
        const n = Math.floor((max - min) / step) + 1;
        if (n <= 0) return { ok: true, values: [min], truncated: false };

        const cap = 10000;
        const count = Math.min(n, cap);
        const dec = decimalsOf(step);
        const out = new Array(count);
        for (let i = 0; i < count; i += 1) {
            let v = min + i * step;
            if (dec > 0) v = Number(v.toFixed(dec));
            out[i] = v;
        }
        return { ok: true, values: out, truncated: n > cap };
    }

    /** 相对当前值移动若干档，返回新档位。到边界就停在边界（不循环）。 */
    function moveBy(values, currentIndex, delta) {
        if (!Array.isArray(values) || !values.length) {
            return { ok: false, index: -1, value: NaN, atEdge: false, reason: '档位表为空' };
        }
        const i = Number.isFinite(Number(currentIndex)) ? Math.round(Number(currentIndex)) : 0;
        const next = i + (Number(delta) || 0);
        const clamped = Math.max(0, Math.min(values.length - 1, next));
        return {
            ok: true,
            index: clamped,
            value: values[clamped],
            atEdge: clamped !== next,   // 越界即边界，用来禁用按钮
        };
    }

    /**
     * 归一化分段选项。
     *
     * 三种输入都收：字符串数组、对象数组（{value,label,disabled}）、混合。
     * 为什么必须归一：调用方常常图省事只传 ['低','中','高']，
     * 而另一个地方传 [{value:1,label:'低'}]，不统一就会在取值时各写一套转换。
     *
     * @param {Array} input
     * @returns {{ok:boolean,items:Array<{value:*,label:string,disabled:boolean}>,reason?:string}}
     */
    function normalizeSegments(input) {
        if (!Array.isArray(input)) {
            return { ok: false, items: [], reason: '选项不是数组' };
        }
        const items = [];
        const seen = Object.create(null);
        for (const raw of input) {
            let item;
            if (raw === null || raw === undefined) continue;
            if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
                item = { value: raw, label: String(raw), disabled: false };
            } else if (typeof raw === 'object') {
                const value = (raw.value !== undefined) ? raw.value : raw.label;
                if (value === undefined || value === null) continue;
                item = {
                    value,
                    label: (raw.label !== undefined && raw.label !== null) ? String(raw.label) : String(value),
                    disabled: raw.disabled === true,
                };
            } else {
                continue;
            }
            // 去重按 value 的字符串形式：1 与 '1' 视为同一项，
            // 否则会把一个选项渲染两遍且指示器永远只亮第一个。
            const key = String(item.value);
            if (seen[key]) continue;
            seen[key] = true;
            items.push(item);
        }
        if (!items.length) {
            return { ok: false, items: [], reason: '选项归一化后为空' };
        }
        return { ok: true, items };
    }

    /**
     * 在选项里找当前值的下标。
     *
     * 找不到时**不静默返回 0** —— 返回 found:false，由调用方决定是
     * 「高亮第一项」还是「一项都不高亮」。这两种在界面上含义完全不同：
     * 前者暗示「当前就是第一项」，后者才是事实（当前值不在选项里）。
     */
    function segIndexOf(value, items) {
        if (!Array.isArray(items) || !items.length) {
            return { ok: false, index: -1, found: false, reason: '选项为空' };
        }
        const key = String(value);
        for (let i = 0; i < items.length; i += 1) {
            if (String(items[i].value) === key) return { ok: true, index: i, found: true };
        }
        return { ok: true, index: -1, found: false };
    }

    /** 滑杆填充百分比：clamp 到 0–100，值域非法时返回 null（不是 0，0 会被当成「拖到底了」）。 */
    function percentOf(value, min, max) {
        const lo = Number(min);
        const hi = Number(max);
        if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi === lo) return null;
        const v = Number(value);
        if (!Number.isFinite(v)) return null;
        const p = ((v - lo) / (hi - lo)) * 100;
        return Math.max(0, Math.min(100, p));
    }

    /**
     * 文本校验。
     *
     * @param {{value:string,maxLength?:number,minLength?:number,required?:boolean,trim?:boolean,pattern?:RegExp}} conf
     * @returns {{ok:boolean,value:string,reason?:string,length:number,over:boolean}}
     *
     * 注意返回里的 over：超长时**不截断**，而是如实报告超了几字。
     * 截断会让用户以为已经存好了，实际存进去的是被砍过的内容。
     */
    function validateText(conf) {
        const c = conf || {};
        let v = (c.value === null || c.value === undefined) ? '' : String(c.value);
        if (c.trim === true) v = v.trim();
        const len = v.length;
        const max = Number.isFinite(Number(c.maxLength)) ? Number(c.maxLength) : null;
        const min = Number.isFinite(Number(c.minLength)) ? Number(c.minLength) : null;

        if (c.required === true && len === 0) {
            return { ok: false, value: v, length: len, over: false, reason: '不能为空' };
        }
        if (min !== null && len > 0 && len < min) {
            return { ok: false, value: v, length: len, over: false, reason: '至少要 ' + min + ' 个字' };
        }
        if (max !== null && len > max) {
            return { ok: false, value: v, length: len, over: true, reason: '超出 ' + (len - max) + ' 个字' };
        }
        if (c.pattern instanceof RegExp && len > 0 && !c.pattern.test(v)) {
            return { ok: false, value: v, length: len, over: false, reason: c.patternMessage || '格式不对' };
        }
        return { ok: true, value: v, length: len, over: false };
    }

    /** 字数状态：正常 / 接近上限 / 超出。三档分别对应三种样式。 */
    function countState(len, max) {
        const m = Number(max);
        if (!Number.isFinite(m) || m <= 0) return { kind: 'plain', text: String(len) };
        const ratio = len / m;
        const kind = (len > m) ? 'over' : (ratio >= 0.85 ? 'near' : 'plain');
        return { kind, text: len + '/' + m };
    }

    /**
     * 比较两组设置，返回改动的键。
     *
     * 为什么不能 JSON.stringify 比较：键顺序不同就会被判成「有改动」，
     * 而设置对象常由不同来源拼装，键顺序不稳定 —— 会出现「什么都没改但保存条一直亮」。
     * 所以按键逐个比，并且对 NaN 做特殊处理（NaN !== NaN，但在这里应视为相同）。
     *
     * @returns {{count:number,changed:string[],keys:string[]}}
     */
    function dirtyDiff(base, next, keys) {
        const a = base || {};
        const b = next || {};
        const list = Array.isArray(keys) ? keys : Object.keys(Object.assign({}, a, b));
        const changed = [];
        for (const k of list) {
            if (!sameValue(a[k], b[k])) changed.push(k);
        }
        return { count: changed.length, changed, keys: list };
    }

    function sameValue(x, y) {
        if (x === y) return true;
        if (typeof x === 'number' && typeof y === 'number') {
            return Number.isNaN(x) && Number.isNaN(y);
        }
        if (x === null || x === undefined) return (y === null || y === undefined);
        if (y === null || y === undefined) return false;
        if (Array.isArray(x) && Array.isArray(y)) {
            if (x.length !== y.length) return false;
            for (let i = 0; i < x.length; i += 1) if (!sameValue(x[i], y[i])) return false;
            return true;
        }
        return false;
    }

    /** hex 颜色校验与归一化：#abc / #aabbcc / 带 alpha 的 #aabbccdd 都收，其余拒绝。 */
    function normalizeHex(input) {
        const s = String(input === null || input === undefined ? '' : input).trim();
        if (!s) return { ok: false, value: '', reason: '空值' };
        const t = s.charAt(0) === '#' ? s.slice(1) : s;
        if (!/^[0-9a-fA-F]+$/.test(t)) return { ok: false, value: '', reason: '含非法字符' };
        if (t.length === 3) {
            return { ok: true, value: '#' + t[0] + t[0] + t[1] + t[1] + t[2] + t[2], alpha: false };
        }
        if (t.length === 6) return { ok: true, value: '#' + t.toLowerCase(), alpha: false };
        if (t.length === 8) return { ok: true, value: '#' + t.toLowerCase(), alpha: true };
        return { ok: false, value: '', reason: '长度必须是 3/6/8 位' };
    }

    /* ================================================================
     * B. 渲染层
     * ================================================================ */

    /**
     * 构造元素。**唯一入口**：所有元素都走这里，绝不裸调 kit.el。
     * 理由见文件头纪律 2。
     */
    function mk(el, tag, cls, text) {
        return el(tag, {
            class: cls || null,
            text: (text === undefined || text === null) ? null : String(text),
        });
    }

    function absent(reason) {
        return { ok: false, kind: 'absent', reason };
    }

    /**
     * 开关。
     * @param {{label?:string,on:boolean,stateText?:boolean,onChange?:function,disabled?:boolean,title?:string}} opts
     * @returns {{ok:true,root:Element,set:function,get:function}|{ok:false,kind:string,reason:string}}
     */
    function renderSwitch(opts) {
        const o = opts || {};
        const d = doc();
        if (!d) return absent('没有 document（非浏览器环境）');
        const k = kit();
        if (!k || typeof k.el !== 'function') return absent('ui-kit-core.js 未加载');
        const el = k.el;

        let on = o.on === true;

        const btn = el('button', {
            type: 'button',
            class: 'ls-switch',
            role: 'switch',
            'aria-checked': on ? 'true' : 'false',
            'aria-label': o.label || o.title || '开关',
        });
        const thumb = mk(el, 'span', 'ls-switch-thumb');
        btn.appendChild(thumb);
        btn.setAttribute('data-on', on ? '1' : '0');

        const stateNode = o.stateText === false ? null : mk(el, 'span', 'ls-switch-state', on ? '开' : '关');

        function paint() {
            btn.setAttribute('data-on', on ? '1' : '0');
            btn.setAttribute('aria-checked', on ? 'true' : 'false');
            if (stateNode) stateNode.textContent = on ? '开' : '关';
        }

        function set(v) {
            const next = v === true;
            if (next === on) return;
            on = next;
            paint();
        }

        btn.addEventListener('click', () => {
            if (o.disabled === true) return;
            on = !on;
            paint();
            if (typeof o.onChange === 'function') {
                try { o.onChange(on); } catch (_e) { /* 回调失败不改变已生效的状态 */ }
            }
        });

        if (o.disabled === true) {
            btn.setAttribute('disabled', '');
            btn.setAttribute('data-busy', '0');
        }

        return {
            ok: true,
            root: btn,
            stateNode,
            get: () => on,
            set,
            // 供整行点击时复用：不触发两次回调由调用方保证
            el: btn,
        };
    }

    /**
     * 滑杆。
     * @param {{min:number,max:number,step:number,value:number,unit?:string,onChange?:function,showTicks?:boolean}} opts
     */
    function renderSlider(opts) {
        const o = opts || {};
        // 判定顺序即优先级：先判「配置对不对」（值域/选项），再判「能不能画」（环境）。
        // 反过来会把配置错误遮成「没有 document」，真机上表现为「控件不出现」，
        // 排查时被引向完全错误的方向。这个形态在 ui-table.js 里已经复发过一次。
        // 值域非法要明说：静默用默认值会让「配置写错了」看起来像「功能就这样」
        const probe = clampStep(o.value, o);
        if (!probe.ok) return { ok: false, kind: 'absent', reason: '滑杆值域非法：' + probe.reason };

        const d = doc();
        if (!d) return absent('没有 document（非浏览器环境）');
        const k = kit();
        if (!k || typeof k.el !== 'function') return absent('ui-kit-core.js 未加载');
        const el = k.el;

        const wrap = mk(el, 'div', 'ls-slider');
        const track = mk(el, 'div', 'ls-slider-track');

        const input = el('input', {
            type: 'range',
            class: 'ls-slider-input',
            min: String(o.min),
            max: String(o.max),
            step: String(o.step),
            value: String(probe.value),
            'aria-label': o.label || '数值',
        });

        const valNode = mk(el, 'span', 'ls-slider-val', probe.value + (o.unit || ''));

        function paint(v) {
            const p = percentOf(v, o.min, o.max);
            if (p !== null) input.style.setProperty('--p', p.toFixed(2) + '%');
            valNode.textContent = v + (o.unit || '');
        }

        paint(probe.value);

        input.addEventListener('input', () => {
            const r = clampStep(input.value, o);
            if (!r.ok) return;
            paint(r.value);
            if (typeof o.onChange === 'function') {
                try { o.onChange(r.value); } catch (_e) { /* ignore */ }
            }
        });

        // 读数的双击编辑：滑块微调到精确值几乎不可能，给一个直接输入的出口
        valNode.addEventListener('dblclick', () => {
            valNode.setAttribute('contenteditable', 'true');
            valNode.setAttribute('data-editing', '1');
            valNode.focus();
        });
        valNode.addEventListener('blur', () => {
            valNode.removeAttribute('contenteditable');
            valNode.removeAttribute('data-editing');
            const raw = String(valNode.textContent || '').replace(o.unit || '', '').trim();
            const r = clampStep(raw, o);
            if (r.ok) {
                input.value = String(r.value);
                paint(r.value);
                if (typeof o.onChange === 'function') {
                    try { o.onChange(r.value); } catch (_e) { /* ignore */ }
                }
            } else {
                paint(Number(input.value));
            }
        });

        track.appendChild(input);

        if (o.showTicks === true) {
            const ticks = mk(el, 'div', 'ls-slider-ticks');
            const n = 5;
            for (let i = 0; i < n; i += 1) {
                const t = mk(el, 'i', 'ls-slider-tick');
                if (i === 0 || i === n - 1 || i === Math.floor(n / 2)) t.setAttribute('data-key', '1');
                ticks.appendChild(t);
            }
            track.appendChild(ticks);
        }

        wrap.appendChild(track);
        wrap.appendChild(valNode);

        return {
            ok: true,
            root: wrap,
            get: () => Number(input.value),
            set: (v) => {
                const r = clampStep(v, o);
                if (!r.ok) return;
                input.value = String(r.value);
                paint(r.value);
            },
        };
    }

    /**
     * 步进器。
     * @param {{min:number,max:number,step:number,value:number,unit?:string,onChange?:function,repeat?:boolean}} opts
     */
    function renderStepper(opts) {
        const o = opts || {};
        // 判定顺序即优先级：先判「配置对不对」（值域/选项），再判「能不能画」（环境）。
        // 反过来会把配置错误遮成「没有 document」，真机上表现为「控件不出现」，
        // 排查时被引向完全错误的方向。这个形态在 ui-table.js 里已经复发过一次。
        const gen = stepValues(o);
        if (!gen.ok) return { ok: false, kind: 'absent', reason: '步进器值域非法：' + gen.reason };

        const values = gen.values;
        const startProbe = clampStep(o.value, o);
        if (!startProbe.ok) return { ok: false, kind: 'absent', reason: '步进器值域非法：' + startProbe.reason };

        const d = doc();
        if (!d) return absent('没有 document（非浏览器环境）');
        const k = kit();
        if (!k || typeof k.el !== 'function') return absent('ui-kit-core.js 未加载');
        const el = k.el;

        let idx = values.indexOf(startProbe.value);
        if (idx < 0) {
            // 值不在档位表里（比如 max 不是 step 整数倍）：找最近的档位
            let best = 0;
            let bestD = Infinity;
            for (let i = 0; i < values.length; i += 1) {
                const dd = Math.abs(values[i] - startProbe.value);
                if (dd < bestD) { bestD = dd; best = i; }
            }
            idx = best;
        }

        const wrap = mk(el, 'div', 'ls-stepper');
        const minus = el('button', { type: 'button', class: 'ls-stepper-btn', 'aria-label': '减少' });
        minus.appendChild(mk(el, 'span', null, '−'));
        const valNode = mk(el, 'span', 'ls-stepper-val', String(values[idx]));
        if (o.unit) valNode.appendChild(mk(el, 'span', 'ls-stepper-unit', o.unit));
        const plus = el('button', { type: 'button', class: 'ls-stepper-btn', 'aria-label': '增加' });
        plus.appendChild(mk(el, 'span', null, '+'));

        function paint() {
            valNode.textContent = String(values[idx]);
            if (o.unit) valNode.appendChild(mk(el, 'span', 'ls-stepper-unit', o.unit));
            // 边界禁用而不是「点了没反应」：禁用是可见的信息
            minus.disabled = (idx <= 0);
            plus.disabled = (idx >= values.length - 1);
        }

        function commit() {
            paint();
            if (typeof o.onChange === 'function') {
                try { o.onChange(values[idx]); } catch (_e) { /* ignore */ }
            }
        }

        minus.addEventListener('click', () => {
            const r = moveBy(values, idx, -1);
            if (!r.ok) return;
            idx = r.index;
            commit();
        });
        plus.addEventListener('click', () => {
            const r = moveBy(values, idx, +1);
            if (!r.ok) return;
            idx = r.index;
            commit();
        });

        // 长按连击：不用 setInterval 而用 setTimeout 递归，
        // 因为 setInterval 在标签页隐藏时会堆积触发，回来后一次性跳很多档。
        if (o.repeat !== false) {
            const bind = (node, delta) => {
                let timer = null;
                let delay = 420;
                const stop = () => {
                    if (timer) { clearTimeout(timer); timer = null; }
                    delay = 420;
                };
                const tick = () => {
                    const r = moveBy(values, idx, delta);
                    if (!r.ok || r.atEdge) { stop(); return; }
                    idx = r.index;
                    commit();
                    delay = Math.max(60, delay * 0.72);
                    timer = setTimeout(tick, delay);
                };
                node.addEventListener('pointerdown', () => {
                    timer = setTimeout(tick, delay);
                });
                ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => {
                    node.addEventListener(ev, stop);
                });
            };
            bind(minus, -1);
            bind(plus, +1);
        }

        paint();
        wrap.appendChild(minus);
        wrap.appendChild(valNode);
        wrap.appendChild(plus);

        return {
            ok: true,
            root: wrap,
            get: () => values[idx],
            set: (v) => {
                const at = values.indexOf(clampStep(v, o).value);
                if (at >= 0) { idx = at; paint(); }
            },
        };
    }

    /**
     * 分段控件。
     *
     * 指示器位置靠 CSS 变量 --seg-i / --seg-n 驱动，
     * 所以切换时只改两个变量，不重建 DOM（重建会丢焦点）。
     */
    function renderSeg(opts) {
        const o = opts || {};
        // 判定顺序即优先级：先判「配置对不对」（值域/选项），再判「能不能画」（环境）。
        // 反过来会把配置错误遮成「没有 document」，真机上表现为「控件不出现」，
        // 排查时被引向完全错误的方向。这个形态在 ui-table.js 里已经复发过一次。
        const norm = normalizeSegments(o.options);
        if (!norm.ok) return { ok: false, kind: 'absent', reason: '分段选项非法：' + norm.reason };

        const d = doc();
        if (!d) return absent('没有 document（非浏览器环境）');
        const k = kit();
        if (!k || typeof k.el !== 'function') return absent('ui-kit-core.js 未加载');
        const el = k.el;

        const items = norm.items;
        const found = segIndexOf(o.value, items);
        // 当前值不在选项里时**一项都不高亮**：高亮第一项等于撒谎
        let active = found.found ? found.index : -1;

        const wrap = mk(el, 'div', 'ls-seg');
        wrap.setAttribute('role', 'tablist');
        wrap.style.setProperty('--seg-n', String(items.length));

        const nodes = [];
        items.forEach((item, i) => {
            const b = el('button', {
                type: 'button',
                class: 'ls-seg-item',
                role: 'tab',
                'aria-selected': (i === active) ? 'true' : 'false',
            });
            b.appendChild(document.createTextNode(item.label));
            if (item.disabled) {
                b.setAttribute('data-disabled', '1');
                b.disabled = true;
            }
            b.addEventListener('click', () => {
                if (item.disabled || i === active) return;
                active = i;
                paint();
                if (typeof o.onChange === 'function') {
                    try { o.onChange(item.value, i); } catch (_e) { /* ignore */ }
                }
            });
            nodes.push(b);
            wrap.appendChild(b);
        });

        function paint() {
            nodes.forEach((n, i) => {
                if (i === active) n.setAttribute('data-active', '1');
                else n.removeAttribute('data-active');
                n.setAttribute('aria-selected', (i === active) ? 'true' : 'false');
            });
            // active 为 -1（值不在选项里）时把指示器移到容器外，
            // 视觉上等于「没有选中项」，与事实一致。
            wrap.style.setProperty('--seg-i', String(active < 0 ? 0 : active));
            wrap.setAttribute('data-none', active < 0 ? '1' : '0');
            if (active < 0) wrap.style.setProperty('--seg-n', String(items.length));
        }

        paint();

        return {
            ok: true,
            root: wrap,
            get: () => (active >= 0 ? items[active].value : undefined),
            set: (v) => {
                const at = segIndexOf(v, items);
                active = at.found ? at.index : -1;
                paint();
            },
            // 供判据使用：当前是否「一项都没选中」
            hasSelection: () => active >= 0,
        };
    }

    /**
     * 文本输入。
     * @param {{value?:string,placeholder?:string,maxLength?:number,multiline?:boolean,
     *          prefix?:string,suffix?:string,required?:boolean,onChange?:function}} opts
     */
    function renderText(opts) {
        const o = opts || {};
        const d = doc();
        if (!d) return absent('没有 document（非浏览器环境）');
        const k = kit();
        if (!k || typeof k.el !== 'function') return absent('ui-kit-core.js 未加载');
        const el = k.el;

        const wrap = mk(el, 'div', 'ls-input-wrap');

        const field = o.multiline === true
            ? el('textarea', {
                class: 'ls-input2 ls-textarea',
                placeholder: o.placeholder || '',
                'aria-label': o.placeholder || '文本',
            })
            : el('input', {
                type: 'text',
                class: 'ls-input2',
                placeholder: o.placeholder || '',
                'aria-label': o.placeholder || '文本',
            });
        field.value = (o.value === null || o.value === undefined) ? '' : String(o.value);

        const countNode = (Number.isFinite(Number(o.maxLength)))
            ? mk(el, 'span', 'ls-input-count')
            : null;

        let host = field;
        if (o.prefix || o.suffix) {
            const affix = mk(el, 'div', 'ls-input-affix');
            if (o.prefix) {
                const p = mk(el, 'span', 'ls-affix', o.prefix);
                p.setAttribute('data-side', 'left');
                affix.appendChild(p);
            }
            affix.appendChild(field);
            if (o.suffix) {
                const s = mk(el, 'span', 'ls-affix', o.suffix);
                s.setAttribute('data-side', 'right');
                affix.appendChild(s);
            }
            host = affix;
        }

        function paintCount() {
            if (!countNode) return;
            const len = String(field.value || '').length;
            const st = countState(len, o.maxLength);
            countNode.textContent = st.text;
            countNode.removeAttribute('data-near');
            countNode.removeAttribute('data-over');
            if (st.kind === 'near') countNode.setAttribute('data-near', '1');
            if (st.kind === 'over') countNode.setAttribute('data-over', '1');
            // 超出时只提示，不截断：截断会让用户以为已经存好了
            field.setAttribute('data-invalid', st.kind === 'over' ? '1' : '0');
        }

        // 只在失焦时校验 required，不在每次输入时校验 ——
        // 输入过程中报「不能为空」等于骂用户，因为他正在打字。
        field.addEventListener('blur', () => {
            const r = validateText({
                value: field.value,
                maxLength: o.maxLength,
                required: o.required,
                trim: false,
            });
            if (!r.ok && r.reason !== '超出 ' + Math.max(0, r.length - Number(o.maxLength)) + ' 个字') {
                field.setAttribute('data-invalid', '1');
                field.title = r.reason;
            } else {
                field.removeAttribute('data-invalid');
                field.removeAttribute('title');
            }
        });

        field.addEventListener('input', () => {
            paintCount();
            if (typeof o.onChange === 'function') {
                try { o.onChange(String(field.value || '')); } catch (_e) { /* ignore */ }
            }
        });

        paintCount();
        wrap.appendChild(host);
        if (countNode) wrap.appendChild(countNode);

        return {
            ok: true,
            root: wrap,
            el: field,
            get: () => String(field.value || ''),
            set: (v) => { field.value = (v === null || v === undefined) ? '' : String(v); paintCount(); },
        };
    }

    /* ================================================================
     * C. 自检
     * ================================================================ */
    function selfCheck() {
        const fails = [];
        const checks = [];
        const ok = (name, cond, detail) => {
            checks.push({ name, ok: !!cond, detail });
            if (!cond) fails.push(name + (detail ? '：' + detail : ''));
        };

        // ── clampStep ──
        const c1 = clampStep(5, { min: 0, max: 10, step: 1 });
        ok('夹紧：正常值原样通过', c1.ok && c1.value === 5 && c1.clamped === false, JSON.stringify(c1));

        const c2 = clampStep(99, { min: 0, max: 10, step: 1 });
        ok('夹紧：超上限落到 max', c2.value === 10, JSON.stringify(c2));

        const c3 = clampStep(-5, { min: 0, max: 10, step: 1 });
        ok('夹紧：低于下限落到 min', c3.value === 0, JSON.stringify(c3));

        // 浮点对齐：0.1 步长不许出 0.30000000000000004
        const c4 = clampStep(0.3, { min: 0, max: 1, step: 0.1 });
        ok('浮点：0.1 步长不产生长尾小数', String(c4.value) === '0.3', String(c4.value));

        const c5 = clampStep(0.7, { min: 0, max: 1, step: 0.05 });
        ok('浮点：0.05 步长对齐正确', c5.value === 0.7, String(c5.value));

        const c6 = clampStep('abc', { min: 2, max: 8, step: 1 });
        ok('非数字落回 min（不是 NaN 传出去）', c6.ok && c6.value === 2, JSON.stringify(c6));

        const c7 = clampStep(5, { min: 10, max: 0, step: 1 });
        ok('值域反了要报错，不静默', c7.ok === false && /min 大于 max/.test(c7.reason), JSON.stringify(c7));

        const c8 = clampStep(5, { min: 0, max: 10, step: 0 });
        ok('step=0 要报错（除零）', c8.ok === false, JSON.stringify(c8));

        // ── stepValues / moveBy ──
        const g1 = stepValues({ min: 0, max: 1, step: 0.25 });
        ok('档位表：0..1 步长 0.25 得 5 档', g1.ok && g1.values.length === 5, JSON.stringify(g1.values));

        const g2 = stepValues({ min: 0, max: 100, step: 10 });
        ok('档位表：0..100 步长 10 得 11 档', g2.values.length === 11, String(g2.values.length));

        const g3 = stepValues({ min: 0, max: 1000000, step: 0.001 });
        ok('档位表：超大范围要截断并标注', g3.ok && g3.truncated === true && g3.values.length === 10000,
            'len=' + g3.values.length);

        const m1 = moveBy([0, 1, 2], 0, -1);
        ok('移动：到左边界停住并标记 atEdge', m1.index === 0 && m1.atEdge === true, JSON.stringify(m1));

        const m2 = moveBy([0, 1, 2], 2, +1);
        ok('移动：到右边界停住并标记 atEdge', m2.index === 2 && m2.atEdge === true, JSON.stringify(m2));

        const m3 = moveBy([], 0, 1);
        ok('移动：空表报错不返回 NaN 当值用', m3.ok === false, JSON.stringify(m3));

        // ── normalizeSegments / segIndexOf ──
        const n1 = normalizeSegments(['低', '中', '高']);
        ok('分段：字符串数组归一化', n1.ok && n1.items.length === 3 && n1.items[0].label === '低',
            JSON.stringify(n1.items && n1.items[0]));

        const n2 = normalizeSegments([{ value: 1, label: '低' }, { value: 2, label: '高', disabled: true }]);
        ok('分段：对象数组归一化并保留 disabled',
            n2.ok && n2.items[1].disabled === true && n2.items[0].value === 1, JSON.stringify(n2.items));

        const n3 = normalizeSegments(['a', 'a', 'b']);
        ok('分段：按 value 去重（1 与 "1" 视为同一项）', n3.items.length === 2, String(n3.items.length));

        const n4 = normalizeSegments([]);
        ok('分段：空数组报错', n4.ok === false, JSON.stringify(n4));

        const n5 = normalizeSegments('not-array');
        ok('分段：非数组报错', n5.ok === false, JSON.stringify(n5));

        const s1 = segIndexOf('中', n1.items);
        ok('下标：找到返回 found:true', s1.found === true && s1.index === 1, JSON.stringify(s1));

        const s2 = segIndexOf('不存在', n1.items);
        ok('下标：找不到返回 found:false 且 index=-1（不静默给 0）',
            s2.found === false && s2.index === -1, JSON.stringify(s2));

        // ── percentOf ──
        ok('百分比：中点得 50', percentOf(5, 0, 10) === 50, String(percentOf(5, 0, 10)));
        ok('百分比：越界被夹到 0/100', percentOf(99, 0, 10) === 100 && percentOf(-99, 0, 10) === 0);
        ok('百分比：值域退化（min==max）返回 null 而不是 0',
            percentOf(5, 5, 5) === null, String(percentOf(5, 5, 5)));
        ok('百分比：非数字返回 null', percentOf('abc', 0, 10) === null);

        // ── validateText / countState ──
        const v1 = validateText({ value: '  x  ', trim: true });
        ok('校验：trim 生效', v1.ok && v1.value === 'x', JSON.stringify(v1));

        const v2 = validateText({ value: '', required: true });
        ok('校验：required 空值报错', v2.ok === false && v2.reason === '不能为空', JSON.stringify(v2));

        const v3 = validateText({ value: 'abcdef', maxLength: 4 });
        ok('校验：超长如实报 over 且不截断',
            v3.ok === false && v3.over === true && v3.value === 'abcdef', JSON.stringify(v3));

        const v4 = validateText({ value: 'ab', pattern: /^[a-z]+$/, });
        ok('校验：正则命中通过', v4.ok === true, JSON.stringify(v4));

        const v5 = validateText({ value: 'A1', pattern: /^[a-z]+$/, patternMessage: '只能小写字母' });
        ok('校验：正则不命中带自定义理由',
            v5.ok === false && v5.reason === '只能小写字母', JSON.stringify(v5));

        const cs1 = countState(3, 10);
        ok('字数：远未到上限是 plain', cs1.kind === 'plain', JSON.stringify(cs1));
        const cs2 = countState(9, 10);
        ok('字数：接近上限是 near', cs2.kind === 'near', JSON.stringify(cs2));
        const cs3 = countState(12, 10);
        ok('字数：超出是 over', cs3.kind === 'over', JSON.stringify(cs3));

        // ── dirtyDiff ──
        const dd1 = dirtyDiff({ a: 1, b: 2 }, { a: 1, b: 2 });
        ok('脏检查：完全相同为 0 改动', dd1.count === 0, JSON.stringify(dd1));

        const dd2 = dirtyDiff({ a: 1 }, { a: 2 });
        ok('脏检查：值变化被抓到', dd2.count === 1 && dd2.changed[0] === 'a', JSON.stringify(dd2));

        const dd3 = dirtyDiff({ a: 1, b: 2 }, { b: 2, a: 1 });
        ok('脏检查：键顺序不同不算改动（JSON.stringify 会误判）', dd3.count === 0, JSON.stringify(dd3));

        const dd4 = dirtyDiff({ a: NaN }, { a: NaN });
        ok('脏检查：NaN 与 NaN 视为相同', dd4.count === 0, JSON.stringify(dd4));

        const dd5 = dirtyDiff({ a: [1, 2] }, { a: [1, 2] });
        ok('脏检查：数组按内容比较', dd5.count === 0, JSON.stringify(dd5));

        const dd6 = dirtyDiff({ a: [1, 2] }, { a: [1, 3] });
        ok('脏检查：数组内容变化被抓到', dd6.count === 1, JSON.stringify(dd6));

        const dd7 = dirtyDiff({ a: 1 }, { a: 1, b: 2 });
        ok('脏检查：新增键被抓到', dd7.count === 1 && dd7.changed[0] === 'b', JSON.stringify(dd7));

        // ── normalizeHex ──
        const h1 = normalizeHex('#abc');
        ok('颜色：#abc 展开成 #aabbcc', h1.ok && h1.value === '#aabbcc', JSON.stringify(h1));

        const h2 = normalizeHex('AABBCC');
        ok('颜色：无 # 也收，并转小写', h2.ok && h2.value === '#aabbcc', JSON.stringify(h2));

        const h3 = normalizeHex('#aabbccdd');
        ok('颜色：8 位标记 alpha', h3.ok && h3.alpha === true, JSON.stringify(h3));

        const h4 = normalizeHex('#12');
        ok('颜色：长度不对要报错', h4.ok === false, JSON.stringify(h4));

        const h5 = normalizeHex('#gggggg');
        ok('颜色：非法字符要报错', h5.ok === false, JSON.stringify(h5));

        // ── 渲染层：无 DOM 必须 absent ──
        const r1 = renderSwitch({ on: false });
        ok('渲染：无 DOM 时开关判 absent', r1.ok === false && r1.kind === 'absent', JSON.stringify(r1));

        const r2 = renderSlider({ min: 0, max: 10, step: 1, value: 5 });
        ok('渲染：无 DOM 时滑杆判 absent', r2.ok === false && r2.kind === 'absent', JSON.stringify(r2));

        const r3 = renderSeg({ options: ['a', 'b'], value: 'a' });
        ok('渲染：无 DOM 时分段判 absent', r3.ok === false && r3.kind === 'absent', JSON.stringify(r3));

        // 值域非法优先于环境缺失：理由必须是「值域」而不是「没有文档」
        const r4 = renderSlider({ min: 10, max: 0, step: 1, value: 5 });
        ok('渲染：值域非法时理由指向值域（不是环境）',
            r4.ok === false && /值域/.test(r4.reason), JSON.stringify(r4));

        // 顺序守卫：三种控件在「值域/选项非法 + 无 DOM」同时成立时，
        // 理由必须指向值域而不是环境（否则真机上看到的是「控件不出现」，
        // 而真正的原因是配置写错了）。
        const o1 = renderStepper({ min: 10, max: 0, step: 1, value: 5 });
        ok('渲染：步进器值域非法时理由指向值域',
            o1.ok === false && /值域/.test(o1.reason), JSON.stringify(o1));
        const o2 = renderSeg({ options: 'oops', value: 'a' });
        ok('渲染：分段选项非法时理由指向选项',
            o2.ok === false && /选项/.test(o2.reason), JSON.stringify(o2));

        return {
            ok: fails.length === 0,
            version: VERSION,
            total: checks.length,
            failed: fails.length,
            fails,
            checks,
        };
    }

    return {
        VERSION,
        // 纯函数
        clampStep, decimalsOf, stepValues, moveBy,
        normalizeSegments, segIndexOf, percentOf,
        validateText, countState, dirtyDiff, sameValue, normalizeHex,
        // 渲染
        renderSwitch, renderSlider, renderStepper, renderSeg, renderText,
        // 自检
        selfCheck,
    };
});