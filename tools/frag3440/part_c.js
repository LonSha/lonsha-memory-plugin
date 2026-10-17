/* ---------------------------------------------------------------
     * 事实原文归一(与 knowledge-trace 的 normalizeFact **同形**)
     *   本模块要判「两条是不是同一句」时才有意义;此处只为**框架引用**
     *   与**去重**服务。口径照抄 knowledge-trace(逐字归一,不去停用词、
     *   不做近似),阈值不在此重立。调用方可经 `opts.normFact` 注入真源。
     * --------------------------------------------------------------- */
    function normFact(value) {
        let s = String(value == null ? '' : value);
        s = s.replace(/[\u3000\s]+/g, '');
        s = s.replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
        s = s.replace(/[\u3001\u3002\u300c\u300d\u300e\u300f\u2018\u2019\u201c\u201d\u2026\u2014\uff0c\uff1b\uff1a\uff1f\uff01]/g, '');
        s = s.replace(/[!-/:-@\[-`{-~]/g, '');
        return s.toLowerCase();
    }
    function normOf(value, inject) {
        try {
            if (typeof inject === 'function') {
                const r = inject(value);
                return (r === undefined || r === null) ? '' : String(r);
            }
        } catch (_e) { /* 注入实现抛错一律回落本地实现,不外抛 */ }
        return normFact(value);
    }
    /* ---------------------------------------------------------------
     * 层别名表(**判定只认显式标注,别名只做等价归一**)
     *   为什么要有别名:同一位标注在不同载体上写法不同(提取时可能写
     *   `layer:'dream'`、摘要里可能写 `modality:'梦境'`)。别名只把
     *   **同一个层**的几种常见写法收敛,绝不把「像梦」当成「是梦」。
     * --------------------------------------------------------------- */
    const ALIASES = Object.freeze({
        reality: ['reality', 'real', 'actual', 'fact', '现实', '真实', '实况', '实际'],
        dream: ['dream', 'dreamt', 'dreamed', 'nightmare', '梦境', '梦', '做梦', '噩梦', '梦里'],
        hypothesis: ['hypothesis', 'hypothetical', 'counterfactual', 'whatif', 'what-if', 'if',
            '假设', '假如', '如果', '反事实', '设想'],
        plan: ['plan', 'intent', 'intention', 'planned', 'proposal', '打算', '计划', '准备', '将要'],
        quote: ['quote', 'quotation', 'quoted', 'relayed', 'reported', 'hearsay', 'cited',
            '引述', '转述', '据说', '听说']
    });
    /** 反查:别名(已归一)→ 层名。构建一次,查询 O(1)。 */
    const ALIAS_TO_LAYER = (function () {
        const m = Object.create(null);
        for (const layer of MODALITIES) {
            for (const a of ALIASES[layer]) m[a] = layer;
        }
        return m;
    })();
    /**
     * 层判定(**只认显式标注**;不认关键词、不认语气)。
     *   判定序:① 显式字段 `modality` / `layer` / `narrativeLayer` / `mode`
     *           ② 显式字段 `frame.modality`(嵌套框架自带的层)
     *           ③ 都没有 ⇒ unspecified(**不猜**,并如实给出理由码)
     *   返回 { modality, stated, via, raw }:
     *     · stated=true  表示**载体明确标注了**这一层(现实问答可信);
     *     · stated=false 一律 unspecified(与「已知它在现实里」**不同形**)。
     */
    function modalityOf(raw) {
        if (!raw || typeof raw !== 'object') {
            return { modality: UNSPECIFIED, stated: false, via: 'none', raw: '' };
        }
        const keys = ['modality', 'layer', 'narrativeLayer', 'narrative_layer', 'mode', 'worldLayer'];
        for (const k of keys) {
            const v = raw[k];
            if (typeof v !== 'string') continue;
            const norm = normOf(v, null);
            if (!norm) continue;
            const hit = ALIAS_TO_LAYER[norm] || ALIAS_TO_LAYER[String(v).trim().toLowerCase()];
            if (hit) return { modality: hit, stated: true, via: 'explicit:' + k, raw: clip(v, 24) };
        }
        /* 有的载体会把层塞在 frame 对象里(`{ frame: { modality: 'dream' } }`) */
        const fr = raw.frame;
        if (fr && typeof fr === 'object' && typeof fr.modality === 'string') {
            const norm = normOf(fr.modality, null);
            const hit = ALIAS_TO_LAYER[norm];
            if (hit) return { modality: hit, stated: true, via: 'explicit:frame.modality', raw: clip(fr.modality, 24) };
        }
        /* 无显式标注 ⇒ **不猜**(关键词提示另走 hintOf,只作读数) */
        return { modality: UNSPECIFIED, stated: false, via: 'none', raw: '' };
    }
    /**
     * 原文框架引用(一层外壳的**原文**)。嵌套取**最内一层**并在读数里
     *   逐层列出(上限 MAX_FRAMES ⇒ 不无限细分)。取字段:
     *   `frame` / `frameRef` / `framing` / `within` / `inside`(字符串或对象均可)。
     */
    function frameOf(raw) {
        if (!raw || typeof raw !== 'object') return { text: '', depth: 0, chain: [] };
        const chain = [];
        let node = raw;
        let guard = 0;
        while (node && typeof node === 'object' && guard < MAX_FRAMES) {
            guard++;
            let text = '';
            for (const k of ['frame', 'frameRef', 'framing', 'within', 'inside', 'shell']) {
                const v = node[k];
                if (typeof v === 'string') { text = clip(v, 60); break; }
                if (v && typeof v === 'object' && typeof v.text === 'string') { text = clip(v.text, 60); break; }
            }
            if (!text) break;
            chain.push(text);
            /* 向里再钻一层(嵌套框架) */
            let inner = null;
            for (const k of ['frame', 'frameRef', 'framing', 'within', 'inside', 'shell']) {
                const v = node[k];
                if (v && typeof v === 'object') { inner = v; break; }
            }
            node = inner;
        }
        const innermost = chain.length ? chain[chain.length - 1] : '';
        return { text: innermost, depth: chain.length, chain: chain };
    }