/* ================================================================
 * story-eval-corpus.js — 剧情结果质量固定评测集（首批 40 样本 / 12 类）
 * [v3.250.0] 计划 A 批 M-O2 首批。反向情绪评测（tests/fixtures/eval-corpus.js）
 *   只覆盖「情绪倾向」这一面（自然表达 0/2、动作性安慰 0/1，聚合还有错判）；
 *   它答不了「接上之后叙事结果对不对」。本文件补的是**剧情事实**面。
 *
 * 与 eval-corpus 的分工（不建第二套真相）：
 *   eval-corpus = 情绪机制面（反向召回八类 + 六项指标）
 *   story-eval  = 剧情事实面（十二类记忆/事实场景 + 三阶段验收）
 *   两者**不共用量表**（口径不同，强行合并会让任一方失真），但共用同名失败总账字段
 *   （knownGaps），tests/run.mjs 能把两边缺口一起打印。
 *
 * 每例写清四件事（计划原文：每例明确必须找回/禁止带入的事实、来源与时点）：
 *   must    必须找回（进候选层）
 *   mustIn  必须进**最终注入**（前两步对、裁剪后丢了不算成功）
 *   forbid  禁止带入（隐藏身份泄露 / 已撤销事实 / 跨会话误注 为零）
 *   floor/session  来源与时点，用来断言「找回来的是这一条」
 *
 * 三阶段（计划原文：分别测候选、排序、最终注入）都在真管线上跑：
 *   ① 候选 = unified-recall.graphToCandidates（includeDeferred 全量）
 *   ② 排序 = ai-select.scoreEntry（**真实评分**，不注水）
 *   ③ 注入 = unified-recall.mergeWithGuaranteed → injection-router.trimToBudget
 *
 * 行格式（紧凑行而不是对象字面量）：
 *   cls|case|floor|session|must|mustIn|forbid|nodes|note
 *   · must/mustIn/forbid = 逗号分隔的 slot 名（空 = 无）
 *   · nodes = 分号分隔的 slot/type/name/summary；节点 id = case + '_' + slot
 *   为什么紧凑：40 个样本要能**一屏看全并逐行对比**；对象字面量会把同一份信息
 *   摊成几百行，改一处要滚三屏，且“缺了哪一个”看不出来。
 * ================================================================ */
(function () {
  'use strict';
  const STORY_EVAL_VERSION = 1;
  /** 12 类（计划点名，逐类必须有样本）。 */
  const CLASSES = [
    'legacy-clue', 'paraphrase', 'action-emotion', 'same-name',
    'disguised', 'flashback-now', 'unresolved', 'fact-supersede',
    'commitment', 'secret-boundary', 'floor-regen', 'cross-session',
  ];
  const CLASS_LABEL = {
    'legacy-clue': '旧关键线索', paraphrase: '自然转述', 'action-emotion': '动作与情绪',
    'same-name': '同名异人', disguised: '伪装身份', 'flashback-now': '闪回与现状',
    unresolved: '矛盾未决', 'fact-supersede': '事实换代', commitment: '约定兜现',
    'secret-boundary': '秘密边界', 'floor-regen': '删楼重生成', 'cross-session': '跨会话隔离',
  };
  /** 造节点：id = case + '_' + slot；data.mark 是该节点独有的可检标记（泄露判定用）。 */
  function N(id, type, name, summary, ts, mark) {
    return { id: id, type: type, name: name, timestamp: ts || 1000,
      data: { summary: summary, mark: mark || id } };
  }
  /** 无关噪声：每样本都带 4 条，好让「候选全收」的偷懒写法拿不到分。 */
  function noise(seed, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const nm = '无关事件' + seed + i;
      out.push(N(seed + '_n' + i, 'event', nm, '那天什么也没发生 ' + seed + i, 100 - i, seed + '_n' + i));
    }
    return out;
  }
  /* ── 紧凑行（cls|case|floor|session|must|mustIn|forbid|query|nodes|note） ── */
  const ROWS = [
    "legacy-clue|lc1|300|s1|lc1_a,lc1_b|lc1_a||他掏出那枚旧钥匙，铜锈已经发黑|lc1_a~event~旧钥匙的来历~老宅抽屉里找到的黄铜钥匙，是母亲留下的;lc1_b~character~母亲~母亲临终前把钥匙交给了他|三百楼前理的钥匙，现在要用||||",
    "legacy-clue|lc2|120|s1|lc2_a|lc2_a||他卷起袖子，那道疤又露出来了|lc2_a~event~左臂的旧伤~那道疤是十年前在码头被人用刀划的|旧伤：一直说是摔的，其实是刀伤||||",
    "legacy-clue|lc3|88|s1|lc3_a|lc3_a||他说欠条一直没拿出来过|lc3_a~event~欠条的归属~三年前那张欠条一直由她保管|旧债：那张欠条还在她手里||||",
    "legacy-clue|lc4|40|s1||||他推门进去，屋里只有一盏灯|lc4_a~event~无关的旧闻~镇上有人丢了只猫|旧事与当前无关，不得被顺手带出|lc4_a|||",
    "paraphrase|pp1|210|s1|pp1_a|pp1_a||又想起那天在码头的事|pp1_a~event~渡口送别~渡口那天她没回头，船开走了|自然转述：「码头」对应原文「渡口」||||",
    "paraphrase|pp2|155|s1|pp2_a|pp2_a||她说她那天身体不舒服|pp2_a~event~她的旧疾~她说撑不住了，扶着墙才没倒下|自然转述：「身体不舒服」对应「撑不住了」||||",
    "paraphrase|pp3|190|s1|pp3_a|||他问她那件事到底怎么解决的|pp3_a~event~那件事的了结~那件事最后是赔了钱私了的;pp3_b~event~另一件无关事~隔壁院子在修屋顶，吵了三天|同格不得把无关那一条一起带出|pp3_b|||",
    "action-emotion|ae1|260|s1|ae1_a|||他攥着杯子，一口没喝|ae1_a~event~她的隐忍~她当时也是攥着杯子不说话，指甲都掐白了|动作写情绪：期望召回当时的隐忍记录||||",
    "action-emotion|ae2|233|s1|ae2_a|||他把外套脱下来披在她肩上|ae2_a~event~一件外套~他从前也这样做过，把外套给她就走了|动作性安慰：不说别哭，只做动作||||",
    "action-emotion|ae3|240|s1||||她把碗放在桌上，转身进了里屋|ae3_a~event~无关的情绪记录~他今天心情很好，哼了一路歌|纯动作场景不得把情绪词命中的无关记录带出|ae3_a|||",
    "same-name|sn1|700|s1|sn1_a|sn1_a||他要去省城找林晚|sn1_a~character~林晚（省城）~省城那位林晚是医生的女儿，从没来过镇上;sn1_b~character~林晚（镇上）~镇上那位林晚在杂货铺帮工|同名异人：两个林晚不是一个人||||",
    "same-name|sn2|710|s1|sn2_a|sn2_a||省城的林晚和家里还有联系吗|sn2_a~character~林晚（省城）~省城的林晚和家里断了联系三年;sn2_b~character~林晚（镇上）~镇上的林晚每周都回家看母亲|同名异人的关系不得互相嫁接||||",
    "same-name|sn3|720|s1|sn3_a|||他说他认识林晚这个人|sn3_a~character~林晚（省城）~省城林晚的出生年份是一九八八年;sn3_b~character~林晚（镇上）~镇上林晚的出生年份是一九七四年|同名异人：不得因同名就把另一个人的资料注进去；★ 实测：按名字的评分会给同名的另一人 2 分（**分不开**）—— 故不立机制级硬零，只把「low 命中了多少分」做成读数；真要分开得靠身份锚，那是另一条轴|sn3_b||~|",
    "disguised|dg1|800|s1|dg1_a|dg1_a||掌柜又把账本推回来了|dg1_a~character~布庄掌柜~布庄掌柜做事利落，账目从不出错|伪装未揭穿阶段：只按明面身份召回||||",
    "disguised|dg2|810|s1|dg2_a|dg2_a|dg2_b|掌柜今天穿的还是那件靛蓝褂子|dg2_a~character~布庄掌柜~掌柜常年一件靛蓝褂子，领口洗得发白;dg2_b~character~失散的妹妹~妹妹左耳后有颗小痣|隐藏身份泄露：真身记录不得进注入||disclosure|!掌柜|",
    "disguised|dg3|820|s1|dg3_a||dg3_b|他把风帽压低了些|dg3_a~character~风帽客~风帽客说话带着南边口音;dg3_b~character~真实身份的旧名~他本名不叫这个，是后来改的|伪装身份：名号不得串；守卫条件用查询里真出现的词（否则门永不开 = 假绿）||disclosure|!风帽|",
    "flashback-now|fn1|500|s1|fn1_a|||他想起那年她还留着长头发|fn1_a~event~旧时长发~那年她头发到腰，用一根木簪绾着;fn1_b~character~现在的她~她去年把头发剪短了|闪回里的旧状态不得当现状用||||",
    "flashback-now|fn2|905|s1|fn2_b|fn2_b||她现在还住在那条巷子吗|fn2_a~event~旧居~她从前住在西头那条巷子;fn2_b~character~现在的住址~她现在不住巷子了，前年就搬到河东去了|闪回与现状：问现状必须给新值（节点文本含 query 的实体词，但措辞不同）||||",
    "unresolved|ur1|600|s1|ur1_a,ur1_b|||那天晚上他到底在不在场|ur1_a~event~在场说~有人看见他那天晚上在场;ur1_b~event~不在场说~他自己说那天晚上根本不在|矛盾未决：账上两条并列||||",
    "unresolved|ur2|610|s1|ur2_a,ur2_b|||他那句承诺到底算不算数|ur2_a~event~他声称算数~他在酒桌上说过一定算数;ur2_b~event~他声称不算~他第二天又说那只是酒话|矛盾未决：任一条都不得当定论||||",
    "fact-supersede|fs1|800|s1|fs1_b|fs1_b||他现在人在哪儿|fs1_a~location~北码头~他先前在北码头等船;fs1_b~location~南站~他后来说人在南站|事实换代：现状查南站||||",
    "fact-supersede|fs2|810|s1|fs2_b|fs2_b||他的伤现在好到什么程度了|fs2_a~event~旧诊断~先前说他的伤是骨裂;fs2_b~event~复诊结论~他的伤现在确认只是软组织挫伤，骨裂是误诊|已撤销的旧诊断不得出现在现状查询里||fact-revoked|他;伤情;骨裂;软组织挫伤;300|",
    "fact-supersede|fs3|330|s1|fs3_a|||当时他登记的是哪个名字|fs3_a~event~旧登记名~入店时登记的是甲名;fs3_b~event~现用名~后来一直用乙名|时点问：应给旧值||||",
    "commitment|cm1|400|s1|cm1_a|||周三是谁要去接人|cm1_a~quest~周三的约定~说好周三去码头接她|未兜现约定：查得到这一条||||",
    "commitment|cm2|410|s1|cm2_a|||他答应过的事后来办了吗|cm2_a~quest~修好的窗框~他答应帮她修窗框，第二天就修好了|已兜现的约定不得再报未兜现||||",
    "commitment|cm3|420|s1||||那个约定还算数吗|cm3_a~quest~取消的约定~后来说不用去了，约定作废|约定取消后不得再进未兜现清单||||",
    "secret-boundary|sb1|450|s1|sb1_a|||她是不是还瞒着他什么|sb1_a~event~没说出口的事~她一直没把这件事说出口，还瞒着他|秘密未揭露：只给「谁不知 · 进度」，不给结论||||",
    "secret-boundary|sb2|460|s1|sb2_a|||那件事她后来知道了吗|sb2_a~event~揭破的时刻~她终于知道了那件事|已揭露后不得再出现在未揭露清单||||",
    "secret-boundary|sb3|470|s1|sb3_a|||他当着她的面要说出那件事|sb3_a~event~险些说破~他当着她的面差点说漏|知情人就在场时不得推进揭露进度||||",
    "floor-regen|fr1|550|s1|||fr1_a|他刚才说的那句话是什么|fr1_a~event~被删的那楼~那一楼说的话后来被删掉了|删楼重生成：该楼楼层账必须随之消失||provenance|floor:300|",
    "floor-regen|fr2|553|s1|fr2_a|||换过之后他改口说了别的|fr2_a~event~改口后的话~他改口说那天另有安排|删楼后新插入的楼照常落账||||",
    "floor-regen|fr3|560|s1|fr3_a|||别的楼层有受影响吗|fr3_a~event~旁人记录~另一个人在别的楼层记了别的事|删楼不影响别的楼层账||||",
    "cross-session|cs1|1000|s2|cs1_a||cs1_b|他推门进来，这边是另一个开头了|cs1_a~event~本会话的事~他推门进来这一条属于当前会话;cs1_b~event~旧会话的事~这一条属于上一个会话，不该出现|跨会话误注为零：旧会话记录不得进本会话；★ 本环境只能验到「来源页已翻」这一层，真会话隔离（chatMetadata 键域）需真宿主，登记为未验证||provenance|floor:300|",
    "cross-session|cs2|1100|s3|cs2_a|||这次该从头讲起|cs2_a~event~本会话开头~这次从头讲起，前面没有前情|换会话后上一轮回执不得串联||||",
    "flashback-now|fn3|520|s1|fn3_a|||他想起从前她说话总是很轻|fn3_a~event~从前的声音~那年她说话总是很轻，怕吵到人;fn3_b~character~现在的声音~她现在说话嗓门大了许多|闪回的旧印象不得当现状||||",
    "flashback-now|fn4|910|s1|fn4_b|fn4_b||他现在还抽烟吗|fn4_a~event~旧习惯~他从前一天两包烟;fn4_b~character~现在的习惯~他现在不抽烟了，去年就戒了|闪回与现状：问现状必须给新值||||",
    "unresolved|ur3|620|s1|ur3_a,ur3_b|||钱到底是谁拿的|ur3_a~event~甲的说法~甲说钱是乙拿的;ur3_b~event~乙的说法~乙说钱是甲拿的|矛盾未决：任一条都不得当定论||||",
    "unresolved|ur4|630|s1|ur4_a,ur4_b|||她到底知不知道那件事|ur4_a~event~知情的说法~她自己说早就知道了;ur4_b~event~不知情的说法~她朋友说她根本不知情|矛盾未决：两条并列||||",
    "cross-session|cs3|1200|s4|cs3_a||cs3_b|这边刚开头，什么都没有|cs3_a~event~本会话开头~这一条是本次会话的;cs3_b~event~旧会话的记录~上一轮的记录不该串过来|跨会话隔离；★ 本环境只能验到「来源页已翻」这一层，真会话隔离（chatMetadata 键域）需真宿主，登记为未验证||provenance|floor:300|",
    "cross-session|cs4|1300|s5|cs4_a|||这一轮该从头讲起，前面没有前情|cs4_a~event~空会话的第一楼~这一楼就昰开头|换会话后回执不得串联||||",
    "legacy-clue|gp1|700|s1||||他想起那件事，心里发沉|gp1_a~event~旧账~当年那档子事情一直没结清|代词指代：query 用「那件事」、节点写「当年那档子事情」——无字面交集，字面匹配召不回||||gap",
    "paraphrase|gp2|710|s1||||他后来把那地方卖了|gp2_a~event~房产处置~名下的那处不动产已经过户给旁人|自然转述：query「那地方」vs 节点「那处不动产」——无字面交集||||gap",
  ];
  /** 展开成对象：nodes 的 slot 已是全名（如 lc1_a），不再加 case 前缀。
   *  第 10 列之后的扩展（v3.250.0）：low = 低分噪声（只报读数，不是硬零）；
   *    gate = 守这道门的**真机制名**；guardCond = 该机制的入参（披露条件 / 事实键 / 楼层）。
   *  为什么把「禁止带入」拆成两类：图管线根本没有 forbid 概念 —— 把危险项与低分噪声
   *    混成一个 forbid 列表，会让「门从没开过」也被读成「没泄露」（假绿）。
   */
  function parseRows(rows) {
    const out = [];
    for (const raw of rows) {
      const line = String(raw).trim();
      if (!line || line.startsWith('#')) continue;
      const f = line.split('|');
      if (f.length < 14) continue;
      const cls = f[0].trim(), cs = f[1].trim();
      const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
      const nodes = String(f[8] || '').split(';').map((x) => x.trim()).filter(Boolean).map((p) => {
        const a = p.split('~');
        if (a.length < 4) return null;
        return N(a[0].trim(), a[1].trim(), a[2].trim(), a[3].trim(), Number(f[2]) || 1000, a[0].trim());
      }).filter(Boolean);
      const ns = noise(cs, 4);
      const gate = f[11].trim();
      const guardCond = f[12].trim();
      const sc = {
        cls: cls, case: cs, floor: Number(f[2]) || 0, session: f[3].trim(),
        query: f[7].trim(), note: f[9].trim(),
        must: list(f[4]), mustIn: list(f[5]), forbid: list(f[6]),
        low: f[10].trim() || '', gate: gate, guardCond: guardCond,
        kind: (f[13] || '').trim(),
        nodes: nodes.concat(ns), noiseIds: ns.map((x) => x.id),
        src: { floor: Number(f[2]) || 0, session: f[3].trim() },
      };
      /* 守卫夹具按机制拆（不把三种机制的入参挤在一个字符串里） */
      if (gate === 'fact-revoked') {
        const p = guardCond.split(';');
        sc.factSubject = (p[0] || '').trim();
        sc.factPredicate = (p[1] || '').trim();
        /* 守卫入参：subject;predicate;旧值;现状值;旧版本时点
         *   —— 事实账要**逐条断言**才知道「旧值退没退役」，所以序列在这里就展开。 */
        const sub = (p[0] || '').trim(), pre = (p[1] || '').trim();
        const oldV = (p[2] || '').trim(), newV = (p[3] || '').trim();
        const oldFrom = Number(p[4]) || 0;
        sc.forbidValue = oldV;
        sc.facts = [
          { subject: sub, predicate: pre, value: oldV, from: oldFrom, origin: 'reported' },
          { subject: sub, predicate: pre, value: newV, from: oldFrom + 10, origin: 'confirmed' },
        ].filter(function (x) { return x.value; });
      }
      if (gate === 'provenance' && /^floor:/.test(guardCond)) sc.deletedFloor = Number(guardCond.split(':')[1]) || 0;
      out.push(sc);
    }
    return out;
  }
  const SCENARIOS = parseRows(ROWS);
  /** 类目覆盖自证：十二类逐类必须有样本（少一类即拒判，不给“静默少样本”留口）。 */
  function coverageCheck(list) {
    const got = {};
    for (const s of (list || SCENARIOS)) got[s.cls] = (got[s.cls] || 0) + 1;
    const missing = CLASSES.filter((c) => !got[c]);
    const gaps = (list || SCENARIOS).filter((s) => s.kind === 'gap').length;
    return { total: (list || SCENARIOS).length, byClass: got, missing: missing, gaps: gaps, main: (list || SCENARIOS).length - gaps };
  }
  const api = { STORY_EVAL_VERSION, CLASSES, CLASS_LABEL, SCENARIOS, parseRows, coverageCheck, N, noise };
  if (typeof window !== 'undefined') window.LonShaStoryEvalCorpus = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
