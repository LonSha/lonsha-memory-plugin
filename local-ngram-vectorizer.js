/* ========================================================
 * local-ngram-vectorizer.js — 确定性本地稠密向量（嵌入的四条降级路径的收口）
 * --------------------------------------------------------
 * 【治的是什么（真实现场）】
 *   `memory-organs.js` 的 `getEmbedding()` 自己登记了四条降级路径：
 *   无密钥 / API 报错 / 返回体缺 embedding / 异常 —— 四条**全部**退回
 *   `simpleEmbedding()`。而那一份实现是：
 *       vec[i % dim] += charCodeAt(i) / 10000
 *   即「按字符码位摊到固定下标」。它有三个结构性毛病：
 *     ① 只有**位置**信息、没有**共现**信息：同一句话换个说法，向量几乎正交；
 *     ② 长文本尾巴被 `i < dimension` 直接截掉，后半句不参与；
 *     ③ 与真嵌入的语义空间毫不相干 —— 一旦库里有 API 期与降级期两条向量混存，
 *        余弦在两者之间是噪声，而召回侧照常当成可比读数用。
 *   结果：无密钥用户的「向量召回」整层失效，还照常占着召回名额与 topK 位次。
 *
 * 【本模块做什么】
 *   把自然语言确定性映射成**同语义空间内可比**的稠密向量：
 *     ① 词级（西文按词、CJK 按 2-3 字片段）+ 字符级 1/2/3-gram 多尺度取词；
 *     ② FNV-1a 双散列符号投射（h1 定桶、h2 定号）—— 保留哈希碰撞下的期望无偏；
 *     ③ L2 模长归一化 ⇒ 余弦即点积。
 *   全部为纯函数运算：同输入恒同输出（可复算、可判据）、零网络、零额度、毫秒级。
 *
 * 【能力边界：本模块只做「字面/词形重叠」，不做同义改写（实测如实登记）】
 *   本仓不允许把「机制描述里的宣传语」当成读数，故这里把**实测**写死：
 *     完全相同                       1.0000
 *     西文词序调换（river/granary）    0.9869
 *     CJK 部分重叠（山洪把粮仓冲垮了）  0.2735
 *     CJK 部分重叠（茶馆/阿绣/等了）    0.3914
 *     完全无关（天气/逛街）            0.0256
 *     纯同义改写·零字面重叠            0.0169  ← **与无关同档，认不出来**
 *   对照旧 `simpleEmbedding`（同两例）：部分重叠 0.8634 / 完全无关 **0.9467**
 *     —— 无关比相关还高，即旧实现连「区分」都做不到（这正是要修的缺陷）。
 *   结论：本模块**建立起了相关性区分度**，但**不具备跨词形语义泛化**。
 *     任何文档/注释/报账都不得写成「同义改写也能召回」——那是对方 README 的宣传语，
 *     在本地 n-gram 方案上不成立。要做同义泛化只能靠真嵌入 API（`api` 来源）。
 *
 * 【阈值必须随向量器一起换（否则等于没换）】
 *   `sleep-awaken.js` 的默认 `threshold: 0.62` 是按**真嵌入**的分数分布标定的；
 *   本地 n-gram 的相关档落在 0.27~0.39。换出口不换阈值 ⇒ 中文条目仍然一条都不唤醒。
 *   故本模块导出 `THRESHOLD_BY_SOURCE`，由消费侧按**向量来源**取阈值（见该文件）。
 *
 * 【三条硬纪律（本仓口径）】
 *   ① **维度由调用方给，本模块不自己定**：既有向量库的 `dimension` 是存量向量
 *      的既有前提，`sleep-awaken.js` 用 `emb.length === qemb.length` 判可比。
 *      若这里塞一个自己的维度，跨期向量会被判成「不可比」并静默掉出召回。
 *      故 `vectorize(text, dim)` 的 `dim` 必填；缺/非法 ⇒ `{ok:false}`，不猜。
 *   ② **不冒充真嵌入**：返回值带 `source:'local-ngram'`，并明写
 *      `semanticParity:false` —— 它是**确定性近似**，不是 API 嵌入的等价物。
 *      消费侧要能把两者分开统计（见 `memory-organs.js` 的 `embedSource` 字段），
 *      否则「降级向量」与「真向量」在同一张召回表上无法区分。
 *   ③ **不改既有行为**：本模块只提供工具函数，不接管任何现有调用点。
 *      是否启用由 `config.localVectorFallback` 决定（默认开：它只替换原本就是
 *      伪向量的那一条路径，不抢占任何真嵌入的机会）。
 *
 * 【它不做什么】
 *   · 不做分词词典、不做停用词表外的语言学处理（多语言一致性优先于精度）；
 *   · 不缓存、不落盘（缓存属 `memory-organs.js` 的 `embedCache`，一处即可）；
 *   · 不提供 cosine —— 重复实现第二份相似度公式是本报反复治过的漂移源，
 *     余弦一律走调用方已有的那一份。
 *
 * 零依赖、UMD 双导出（与全仓缝合模块同形）。挂 window.LonShaLocalNgramVectorizer。
 * ======================================================== */
'use strict';
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LonShaLocalNgramVectorizer = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = '3.467.0';
  var SOURCE = 'local-ngram';

  /** 默认维度：只在调用方没给时用于**报错文案**，不参与计算（见纪律①）。 */
  var DEFAULT_DIM = 256;

  /* 停用词只收跨语种里最高频、最无区分力的那一批。
   *   刻意保持极短：长停用词表对 CJK 分片是净损失（会把「不」「没」这类
   *   语义关键否定词抹掉，而否定词恰恰是记忆里最要紧的差异）。 */
  var STOPWORDS = (function () {
    var list = ['the', 'a', 'an', 'of', 'to', 'in', 'is', 'are', 'was', 'were',
      'and', 'or', 'it', 'this', 'that', 'for', 'on', 'at', 'as', 'by', 'with',
      '的', '了', '是', '在', '和', '与', '就', '都', '而', '及', '着', '把', '被',
      /* [v3.467.0] 判据 A5 首跑当场补的：中文语气助词信息量极低，但修前不在表里，
       *   于是「的了吧是」这种纯虚词串靠「吧」一个字拿到了可用方向。
       *   收这批字的标准是「单独出现时不承载任何命题内容」，不是「出现频率高」——
       *   故「不/没/别/未」一律不收（否定词翻转语义，是记忆里最要紧的差异）。 */
      '吧', '呢', '啊', '吗', '嘛', '哦', '呀', '哈', '嗯', '啦', '哇', '呗'];
    var s = Object.create(null);
    for (var i = 0; i < list.length; i++) s[list[i]] = true;
    return s;
  }());

  /* [v3.467.0] 「全停用词片段」必须整条丢掉。
   *   判据 v3467 A5 首跑当场抓到：输入「的了吧是」这种纯虚词串，单字都被停用词表挡了，
   *   但 2-gram「的了」「了吧」「吧是」**不在词表里**（词表是按词收的），于是每个都成了
   *   「有效特征」—— 结果是一条毫无信息量的文本拿到了一个可用方向。
   *   这不是判据写严了，是取词真漏了：片段的信息量不会高于它的成分，
   *   全部成分都是停用词 ⇒ 片段本身也是停用词。故在片段层补一道 all-stop 判定。
   *   （否定词「不/没/别」不在表里，故「不行」「没想到」这类不会被误杀 —— 这正是
   *     注释前面担心的那件事，这里用「逐字都在表里才算停用」来规避。） */
  function allStopChars(term) {
    for (var i = 0; i < term.length; i++) {
      if (!STOPWORDS[term.charAt(i)]) return false;
    }
    return term.length > 0;
  }

  /** 标点/空白：按码位判，避免正则字符类在不同宿主上的差异。 */
  function isPunctOrSpace(ch) {
    if (ch === undefined) return true;
    var c = ch.charCodeAt(0);
    if (c <= 0x20) return true;                       // 控制符与空格
    if (c === 0x3000) return true;                    // 全角空格
    if (c >= 0x2000 && c <= 0x206f) return true;      // 通用标点
    if (c >= 0x3001 && c <= 0x303f) return true;      // CJK 标点
    if (c >= 0xff01 && c <= 0xff20) return true;      // 全角符号
    if ('!-/:-@[-`{-~'.indexOf(ch) >= 0) return true; // ASCII 标点
    return false;
  }

  /**
   * 取词：多尺度、确定性。
   *   · CJK 片段：按 2-gram / 3-gram 切片（CJK 无空格，词边界不可靠，故用片段）；
   *   · 西文：按非字母数字边界切词，长度 >= 2 才收；
   *   · 单字符：只在非标点非停用时收，权重最低（它负责兜住极短查询）。
   * 权重是**手工标定的量纲**，不是学习出来的参数：3-gram 最特异、
   *   2-gram 次之、单字最泛，故 2.0 / 1.6 / 0.6；西文整词按长度加成。
   */
  function extractTerms(text) {
    var out = [];
    var s = String(text == null ? '' : text).toLowerCase();
    if (!s) return out;

    // ① 单字符 + CJK 片段（同时产出 2/3-gram，西文也可，但西文另有整词通道）
    for (var i = 0; i < s.length; i++) {
      var c1 = s.charAt(i);
      if (!isPunctOrSpace(c1) && !STOPWORDS[c1]) {
        out.push({ term: c1, weight: 0.6 });
      }
      if (i + 2 <= s.length) {
        var c2 = s.slice(i, i + 2);
        if (!isPunctOrSpace(c2.charAt(0)) && !isPunctOrSpace(c2.charAt(1))
            && !STOPWORDS[c2] && !allStopChars(c2)) {
          out.push({ term: c2, weight: 1.6 });
        }
      }
      if (i + 3 <= s.length) {
        var c3 = s.slice(i, i + 3);
        if (!isPunctOrSpace(c3.charAt(0)) && !isPunctOrSpace(c3.charAt(1))
            && !isPunctOrSpace(c3.charAt(2)) && !STOPWORDS[c3] && !allStopChars(c3)) {
          out.push({ term: c3, weight: 2.0 });
        }
      }
    }

    // ② 西文整词（按标点/空格切开，逐段判）
    /* [v3.467.0] 修：这条通道**只该吃西文**。首跑抓到的形态是「的了吧是」四个虚词被
     *   当成一个「西文整词」收了（flush 里只判了长度>=2 与不在词表），于是纯虚词串
     *   靠整词通道拿到了方向 —— 上面片段层那道 allStopChars 完全绕过了。
     *   修法是给通道加**字符面判据**：段里必须至少有一个拉丁字母/数字才算西文词；
     *   CJK 由 ①②的 2/3-gram 通道负责，不需要也不应该走整词。 */
    var buf = '';
    var flush = function () {
      if (buf.length >= 2 && !STOPWORDS[buf] && /[0-9a-z]/.test(buf)) {
        out.push({ term: buf, weight: 2.5 });
      }
      buf = '';
    };
    for (var j = 0; j < s.length; j++) {
      var cj = s.charAt(j);
      if (isPunctOrSpace(cj)) { flush(); continue; }
      buf += cj;
    }
    flush();

    return out;
  }

  /**
   * FNV-1a 双散列：h1 定桶、h2 定符号。
   *   Math.imul 保证 32 位乘积不丢精度（这是与「* 16777619 直接算」的唯一区别，
   *   后者在超过 2^53 时精度丢失，会让不同词落到同桶的规律化偏差变成系统性偏差）。
   */
  function fnvPair(term) {
    var h1 = 2166136261;
    var h2 = 16777619;
    for (var i = 0; i < term.length; i++) {
      var code = term.charCodeAt(i);
      h1 = Math.imul(h1 ^ code, 16777619);
      h2 = Math.imul(h2 ^ code, 2166136261);
    }
    return { h1: h1 >>> 0, h2: h2 >>> 0 };
  }

  /**
   * 主入口：确定性稠密向量。
   * @param {string} text
   * @param {number} dim 目标维度（**必填**；必须与存量向量库的 dimension 一致）
   * @returns {{ok:boolean, vector:number[]|null, dim:number|null, source:string,
   *            tokenCount:number, reason:string}}
   */
  function vectorize(text, dim) {
    var d = Number(dim);
    if (!Number.isFinite(d) || d < 8 || Math.floor(d) !== d) {
      return {
        ok: false, vector: null, dim: null, source: SOURCE,
        tokenCount: 0,
        reason: '维度缺失或非法（' + String(dim) + '）：本模块不自定维度，'
          + '必须由调用方传入存量向量库的 dimension；默认参考 ' + DEFAULT_DIM
      };
    }
    var s = String(text == null ? '' : text);
    if (!s.trim()) {
      return {
        ok: false, vector: null, dim: d, source: SOURCE,
        tokenCount: 0, reason: '空文本：零向量不构成有意义的方向，拒绝编一个'
      };
    }

    var terms = extractTerms(s);
    if (!terms.length) {
      return {
        ok: false, vector: null, dim: d, source: SOURCE,
        tokenCount: 0, reason: '取词为空（全是标点/停用词）：同上，不编方向'
      };
    }

    var vec = new Float64Array(d);
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      var p = fnvPair(t.term);
      var index = p.h1 % d;
      var sign = (p.h2 & 1) === 0 ? 1 : -1;
      vec[index] += sign * t.weight;
    }

    // L2 归一化：归一后余弦即点积，且不随文本长度整体缩放（长文本不该天然更「近」）。
    var sumSq = 0;
    for (var k = 0; k < d; k++) sumSq += vec[k] * vec[k];
    var norm = Math.sqrt(sumSq);
    if (!(norm > 0)) {
      return {
        ok: false, vector: null, dim: d, source: SOURCE,
        tokenCount: terms.length,
        reason: '归一化失败（符号投射恰好全抵消）：如实失败，不回退成零向量'
      };
    }
    var out = new Array(d);
    for (var m = 0; m < d; m++) out[m] = vec[m] / norm;

    return {
      ok: true,
      vector: out,
      dim: d,
      source: SOURCE,
      tokenCount: terms.length,
      semanticParity: false,   // 明示：不是 API 嵌入的等价物（见纪律②）
      reason: ''
    };
  }

  return {
    VERSION: VERSION,
    SOURCE: SOURCE,
    DEFAULT_DIM: DEFAULT_DIM,
    /* 按向量来源分档的语义阈值。**不是置信度换算表，是各自分布的实测门槛**：
     *   · api       —— 真嵌入（OpenAI/bge 等）标定值 0.62（沿用 sleep-awaken 原默认，
     *                  未在真机重测，故标注为「沿用」而非「实测」）；
     *   · local-ngram —— 实测：相关档 0.27~0.39、无关档 ≈0.02~0.03。
     *                  取 0.22：低于最弱的相关样本（0.2735）留余量，同时远高于无关档。
     *                  比它更保守会漏掉句式差异大的真相关；比它更松会被 short 片段噪声吵醒。
     *   · legacy-simple —— 旧伪向量**不提供阈值**：它的无关分高于相关分（0.9467 > 0.8634），
     *                  任何阈值都只会把噪声当相关。消费侧读到 null 必须**拒绝按语义唤醒**
     *                  （不是静默用默认值，那正是「两态同形」）。
     */
    THRESHOLD_BY_SOURCE: Object.freeze({
      'api': 0.62,
      'local-ngram': 0.22,
      'legacy-simple': null,
      'unknown': null
    }),
    thresholdFor: function (source) {
      var t = this.THRESHOLD_BY_SOURCE[String(source == null ? 'unknown' : source)];
      return (typeof t === 'number') ? t : null;
    },
    extractTerms: extractTerms,
    vectorize: vectorize
  };
}));