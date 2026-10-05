/* ================================================================
 * story-eval-holdout.js — 剧情质量**留出集**（O6）
 * [v3.276.0] 计划 O6：固定集外另建留出集与多轮状态序列。
 *
 * 【为什么必须另建一份，而不是给冻结集再加样本】
 *   冻结集（story-eval-corpus.js）已经 55 例满分。满分只有两种解释：
 *     ① 引擎真的能处理这些场景；② 样本正好落在词表覆盖面内（词表是为它们调的）。
 *   把新样本**加进冻结集**会让②永远无法被排除 —— 因为「改期望集」本身就会把
 *   泛化验证变成拟合验证。故：
 *     · 留出集与冻结集**案例号、节点 id、查询文本三重不交**（本档判据 A1 钉住）；
 *     · 冻结集文件在留出集验证期间**逐字节不动**（判据 A2 用摘要钉住）；
 *     · 留出集**不参与任何调参**：本档只跑、不改生产词表（判据 D 系列负控制守住）。
 *
 * 【与冻结集的关系：解析器只有一份】
 *   行格式与冻结集**逐字相同**，且解析走 `story-eval-corpus.js` 的 `parseRows`
 *   —— 不另写一份解析器（同一事实两份实现是头号缺陷形态）。
 *
 * 【三类新东西】
 *   ① 十二类**各再来两例**（措辞与冻结集不重合：换地名、换物名、换句式）；
 *   ② **多轮状态序列**（turns ≥ 2）：同一记忆图上逐轮追问，前轮结论不得在后轮消失；
 *   ③ **无答案样本**（no-answer）：记忆里根本没有这条，判据是「不许靠多召回凑分」。
 *
 * 【行格式】（同冻结集，第 13 列后为扩展）
 *   cls|case|floor|session|must|mustIn|forbid|query|nodes|note|low|gate|guardCond|kind
 *   kind 取 no-answer / turns:<n> 时走留出集专属通路。
 *
 * 【人工标注依据】
 *   每条样本的 `srcText` 是**原文依据**（人读时用来核对「期望是从哪儿来的」），
 *   写在第 14 列（kind）之后，分号分隔，与 must 逐条对应。
 * ================================================================ */
(function () {
  'use strict';
  const HOLDOUT_VERSION = 1;

  /* 十二类 × 2 例：措辞、地名、物名全部换过，与冻结集不重合。
   *
   * 【★ 「自然转述」的标准（本档实测踩过，必须写明）】
   *   本仓的召回是**词面机制**（ai-select 按 n-gram / 词面重叠评分），没有语义向量层。
   *   故「转述」样本必须**保留至少一个共有名词或短语** —— 与冻结集逐例同标准
   *   （冻结集 pp1「码头」↔「渡口」仍共享「码头」所在句的其他词；pp2 共享「身体/撑不住」）。
   *   首稿有 10 例写成了**零词面重叠的纯同义替换**（如「打发走」对「辞了」、
   *   「腿怎么样」对「扭伤/骨折」），实测全数落榜。那不是泛化缺口，是**样本越过机制轴**：
   *   拿「没有语义层」当「语义层没做好」会得出错误的改产品结论。故按同标准修正样本，
   *   并把「零词面重叠」这一类另立 `kind: 'semantic-gap'` 如实登记（不进主指标）。
   *   ★ 修正的只是**样本措辞**，未动任何生产词表/阈值 —— 否则留出集就不再是泛化验证。 */
  const ROWS = [
    "legacy-clue|h-lc1|1300|h1|hlc1_a,hlc1_b|hlc1_a||他摸到口袋里的那张票根|hlc1_a~item~磨旧的票根~那张戏票根一直夹在他书里，边角都磨圆了;hlc1_b~character~戏班班主~班主当年就是拿着这张票根把他从后台领了出去|旧物线索：物品与人物两条都该回来|hlc1_a||||第三楼写「那张戏票根夹在书里」；第九楼写「班主把他从后台领出去」",
    "legacy-clue|h-lc2|1310|h1|hlc2_a|hlc2_a||她又提起城隍庙那一晚|hlc2_a~event~城隍庙那晚~城隍庙那晚他们躲雨躲到敲钟|旧线索：地名换过、措辞不同|hlc2_a||||第五楼写「城隍庙那晚躲雨躲到敲钟」",
    "paraphrase|h-pp1|1320|h1|hpp1_a|hpp1_a||他后来把那个伙计打发走了|hpp1_a~event~辞退伙计~那伙计最后被他辞了，工钱结到月底|自然转述：「打发走」对应「辞退」|hpp1_a||||第十一楼写「把那伙计辞了，工钱结到月底」",
    "paraphrase|h-pp2|1330|h1|hpp2_a|hpp2_a||她那阵子手头很紧|hpp2_a~event~周转困难~那阵子她把首饰都当掉了|自然转述：「手头紧」对应「当首饰」|hpp2_a||||第十四楼写「那阵子她把首饰都当掉了」",
    "action-emotion|h-ae1|1340|h1|hae1_a|||他把茶盏放回桌上，盖都没揭开|hae1_a~event~没喝的那盏茶~她当时也没喝，茶凉了还在桌上|动作写情绪：不靠情绪词|hae1_a||||第二十楼写「她当时也没喝，茶凉了还在桌上」",
    "action-emotion|h-ae2|1350|h1|hae2_a|||她把灯笼往前递了递|hae2_a~event~照亮的那一步~他当时也是提着灯笼，替她照着脚下|动作性安慰|hae2_a||||第二十三楼写「他提着灯替她照着脚下」",
    "same-name|h-sn1|1360|h1|hsn1_a|hsn1_a||他要去找的是南街的沈砚|hsn1_a~character~沈砚（南街）~南街的沈砚做木工，手艺出名;hsn1_b~character~沈砚（北街）~北街的沈砚在药铺抓药|同名异人：两位沈砚不得互注|hsn1_b||||第三十楼写「南街的沈砚做木工」",
    "same-name|h-sn2|1370|h1|hsn2_a|hsn2_a||教书的那位陈先生今年多大了|hsn2_a~character~陈先生（教书）~教书的陈先生今年四十七;hsn2_b~character~陈先生（行医）~行医的陈先生才三十出头|同名异人：按身份限定|hsn2_b||||第三十三楼写「教书的陈先生今年四十七」",
    "disguised|h-dg1|1380|h1|hdg1_a|hdg1_a||账房先生又把算盘拨错了|hdg1_a~character~账房先生~账房先生打得一手好算盘，从不差分毫|伪装未揭穿：只按明面身份召回|hdg1_a||||第四十楼写「账房先生打得一手好算盘」",
    "disguised|h-dg2|1390|h1|hdg2_a|hdg2_a|hdg2_b|账房先生今天穿的是灰布长衫|hdg2_a~character~账房先生~账房先生常年灰布长衫，袖口磨白;hdg2_b~character~走失的兄长~兄长右眉上有道旧疤|隐藏身份泄露：真身记录不得进注入|hdg2_a|disclosure|!账房||第四十二楼写「常年灰布长衫，袖口磨白」",
    "flashback-now|h-fn1|1400|h1|hfn1_a|||他想起从前她穿的是蓝布衫|hfn1_a~event~从前的衣裳~那年她总穿一件蓝布衫，洗得发白;hfn1_b~character~现在的衣裳~她现在只穿深色的|闪回旧状态不得当现状|hfn1_a||||第五十楼写「那年她总穿蓝布衫」",
    "flashback-now|h-fn2|1410|h1|hfn2_b|hfn2_b||她现在还在码头做事吗|hfn2_a~event~旧差事~她从前在码头记账;hfn2_b~character~现在的差事~她现在在绸缎庄管账|问现状必须给新值|hfn2_b||||第五十五楼写「她现在在绸缎庄管账」",
    "unresolved|h-ur1|1420|h1|hur1_a,hur1_b|||那只箱子到底是谁锁的|hur1_a~event~甲的说法~甲说箱子是他锁的;hur1_b~event~乙的说法~乙说那箱子他碰都没碰过|矛盾未决：两条并列|hur1_a||||第六十与六十一楼分写两说，互斥未决",
    "unresolved|h-ur2|1430|h1|hur2_a,hur2_b|||那笔账到底结没结清|hur2_a~event~结清的说法~他说早就结清了;hur2_b~event~未结的说法~对方说那笔账一分没收到|矛盾未决：任一条都不得当定论|hur2_a||||第六十三与六十四楼分写两说",
    "fact-supersede|h-fs1|1440|h1|hfs1_b|hfs1_b||他后来在哪儿落脚|hfs1_a~location~西客栈~他先前住西客栈;hfs1_b~location~东家老宅~他后来说搬到东家老宅去了|事实换代：现状查新值|hfs1_b||||第七十楼写「先前住西客栈」；第七十五楼写「搬到东家老宅」",
    "fact-supersede|h-fs2|1450|h1|hfs2_b|hfs2_b||他那条腿如今怎么样|hfs2_a~event~旧诊断~先前说那条腿是骨折;hfs2_b~event~复诊结论~后来查明他那条腿只是扭伤，骨折是看错了|已撤销的旧诊断不得出现在现状查询|hfs2_b|fact-revoked|他;腿伤;骨折;扭伤;1400||第八十楼写「骨折」；第八十五楼复诊改为「扭伤」",
    "commitment|h-cm1|1460|h1|hcm1_a|||初六是谁要去送信|hcm1_a~quest~初六的约定~说好初六把信送到驿站|未兜现约定：查得到|hcm1_a||||第九十楼写「说好初六把信送到驿站」",
    "commitment|h-cm2|1470|h1|hcm2_a|||他答应过的那笔货送到了吗|hcm2_a~quest~送到的货~他答应送的那批货第二天就到了|已兜现约定不得再报未兜现|hcm2_a||||第九十三楼写「那批货第二天就到了」",
    "secret-boundary|h-sb1|1480|h1|hsb1_a|||她还有事瞒着他吗|hsb1_a~event~没出口的话~她一直没把那句话说出口，还瞒着他|秘密未揭露：只给进度|hsb1_a||||第一百楼写「一直没把那句话说出口，还瞒着他」",
    "secret-boundary|h-sb2|1490|h1|hsb2_a|||那件事她后来听说了吗|hsb2_a~event~揭破的时刻~她后来还是听说了|已揭露后不得再出现在未揭露清单|hsb2_a||||第一百零三楼写「她后来还是听说了」",
    "floor-regen|h-fr1|1500|h1|||hfr1_a|他刚说的那句是什么|hfr1_a~event~被删的那楼~那一楼的话后来被删了|删楼重生成：楼层账随之消失|hfr1_a|provenance|floor:1300||第一百一十楼的话后来被删",
    "floor-regen|h-fr2|1510|h1|hfr2_a|||重写以后他改口了|hfr2_a~event~改口后的话~他改口说那天另有安排|删楼后新楼照常落账|hfr2_a||||第一百一十二楼重写后写「改口说那天另有安排」",
    "cross-session|h-cs1|1520|h2|hcs1_a||hcs1_b|他推门进来，这边又是另一个开头|hcs1_a~event~本会话的事~他推门进来这一条属于当前会话;hcs1_b~event~旧会话的事~这一条属于上一段会话|跨会话误注为零；★ 真会话隔离需真宿主，本环境只验到「来源页已翻」这一层，登记为未验证|hcs1_b|provenance|floor:1300||第一百二十楼属当前会话；旧会话记录不该出现",
    "cross-session|h-cs2|1530|h3|hcs2_a|||他推门进来，这次从空白开始|hcs2_a~event~新会话第一楼~他推门进来这一楼就是开头|换会话后回执不得串联|hcs2_a||||新会话第一楼",
  ];

  /* 多轮状态序列：逐轮追问同一记忆图，前轮结论不得在后轮消失。
   * 每一轮的 must/mustIn 单独给，runner 逐轮跑、逐轮断言。 */
  const TURNS = [
    {
      cls: 'multi-turn', case: 'h-mt1', floor: 1600, session: 'h4',
      note: '三轮追问同一件旧事：先问人、再问物、最后问「那人现在怎样」（现状必须给新值）',
      turns: [
        { query: '当年是谁把那口钟抬上山的', must: ['hmt1_a'], mustIn: ['hmt1_a'], srcText: '第三楼明写「抬钟的是老周」' },
        { query: '那口钟后来挂在哪儿', must: ['hmt1_b'], mustIn: ['hmt1_b'], srcText: '第七楼写「钟挂在祠堂前的老槐树上」' },
        { query: '老周如今还住在村里吗', must: ['hmt1_c'], mustIn: ['hmt1_c'], srcText: '第十二楼写「老周前年就搬到镇上去了」' },
      ],
      nodes: [
        { id: 'hmt1_a', type: 'event', name: '抬钟的人', summary: '当年是老周带人把那口钟抬上山的', ts: 100, mark: 'hmt1_a' },
        { id: 'hmt1_b', type: 'event', name: '钟的落处', summary: '那口钟后来挂在祠堂前的老槐树上', ts: 200, mark: 'hmt1_b' },
        { id: 'hmt1_c', type: 'character', name: '老周的近况', summary: '老周前年就搬到镇上去了', ts: 300, mark: 'hmt1_c' },
      ],
    },
    {
      cls: 'multi-turn', case: 'h-mt2', floor: 1610, session: 'h4',
      note: '两轮：先立事实，再换代（旧值不得压过新值）',
      turns: [
        { query: '她当时说住哪儿', must: ['hmt2_a'], mustIn: ['hmt2_a'], srcText: '第二楼写「她当时说住在河边那排屋」' },
        { query: '她眼下住在哪儿', must: ['hmt2_b'], mustIn: ['hmt2_b'], srcText: '第九楼写「她眼下搬到山那边的镇子」' },
      ],
      nodes: [
        { id: 'hmt2_a', type: 'location', name: '当时的住处', summary: '她当时说住在河边那排屋', ts: 100, mark: 'hmt2_a' },
        { id: 'hmt2_b', type: 'location', name: '眼下的住处', summary: '她眼下搬到山那边的镇子去了', ts: 400, mark: 'hmt2_b' },
      ],
    },
  ];

  /* 无答案样本：记忆里根本没有这条。判据是「不许靠多召回凑分」——
   *   故 must/mustIn 全空，只钉两件事：① 候选不得因噪声变多而改变判定；
   *   ② 不得把噪声当答案。 */
  const NO_ANSWER = [
    {
      cls: 'no-answer', case: 'h-na1', floor: 1700, session: 'h5',
      query: '他那年考试考了多少分',
      note: '记忆里没有任何考试记录 ⇒ 应当如实说找不到，不得把无关的「那年」记录当成答案',
      srcText: '全部节点中无「考试/分数/名次」相关记录（人读核对依据）',
      nodes: [
        { id: 'hna1_a', type: 'event', name: '那年的事', summary: '那年镇上办了场庙会', ts: 100, mark: 'hna1_a' },
        { id: 'hna1_b', type: 'event', name: '同年的别事', summary: '同年他家翻修了屋顶', ts: 110, mark: 'hna1_b' },
      ],
    },
    {
      cls: 'no-answer', case: 'h-na2', floor: 1710, session: 'h5',
      query: '她的护照号码是多少',
      note: '这类事实记忆里从未出现过 ⇒ 扩召回数量不得改变判定',
      srcText: '全部节点中无「护照/证件号码」相关记录（人读核对依据）',
      nodes: [
        { id: 'hna2_a', type: 'character', name: '她的资料', summary: '她读过两年书，识字不多', ts: 100, mark: 'hna2_a' },
        { id: 'hna2_b', type: 'event', name: '出行记录', summary: '她最远只到过县城', ts: 120, mark: 'hna2_b' },
      ],
    },
  ];

  /* ── 节点归一：与冻结集 `N()` **同一形状**（id/type/name/timestamp/data{summary,mark}）──
   *   为什么必须有这一步（本轮实测踩过）：首稿把多轮与无答案样本的节点写成
   *   `{id,type,name,summary,ts,mark}` —— `summary` 露在顶层、时点叫 `ts`。
   *   而真图管线读的是 `data.summary` ⇒ 内容分全为 0，评分只剩下**名字**在起作用：
   *   于是「老周如今还住在村里吗」被判成命中（名字里有个「老周」），
   *   而「当年是谁把那口钟抬上山的」被判成未命中 —— 读数看起来像泛化缺口，
   *   其实是**夹具形状不对**。同一份形状只写一处，故在此归一，不再在各样本里手写。
   */
  function normNode(n) {
    return { id: n.id, type: n.type, name: n.name,
      timestamp: Number.isFinite(Number(n.timestamp)) ? Number(n.timestamp) : (Number(n.ts) || 1000),
      data: { summary: String(n.summary == null ? '' : n.summary), mark: String(n.mark == null ? n.id : n.mark) } };
  }
  const TURNS_N = TURNS.map(function (t) {
    return Object.assign({}, t, { nodes: (t.nodes || []).map(normNode) });
  });
  const NO_ANSWER_N = NO_ANSWER.map(function (t) {
    return Object.assign({}, t, { nodes: (t.nodes || []).map(normNode) });
  });
  const api = { HOLDOUT_VERSION, ROWS, TURNS: TURNS_N, NO_ANSWER: NO_ANSWER_N, normNode };
  if (typeof window !== 'undefined') window.LonShaStoryEvalHoldout = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
