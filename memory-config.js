(function (global) {
    'use strict';
/*
 * memory-config.js — 配置管理类（计划 A1 宿主巨兽第七刀）
 *
 * 【为什么需要这一面 / 修前实测】
 *   第一刀 memory-ledgers.js 剥叶子账本；第二刀 memory-aux.js 剥工具类；第三刀
 *   narrative-generators.js 剥生成侧派生系统；第四刀 memory-books.js 剥书册与时间；
 *   第五刀 memory-organs.js 剥六个器官级类；第六刀 memory-core.js 剥四个内核数据模型。
 *   本刀剥的是宿主剩余候选里体量最大的一块：ConfigManager（512 行，含整块默认配置
 *   字面量 + 四段配置迁移 + 角色卡覆盖 + 写盘）。
 *   与第六刀同一条读数轴（按磁盘实读）：整类 512 行；类外引用面仅 5 个宿主符号；
 *   对外只被 LonShaMemoryPlugin 在构造期 new 一次（`this.configMgr = new ConfigManager()`），
 *   之后引擎与 UI 只按**字段名与方法名**驱动它（config / loadConfig / _applyCardOverrides /
 *   saveConfig / _lastMigrationReport / _configLoadError）。
 *
 * 【依赖收口：与第六刀同型（逐字副本 + 活口 + 取库链），但本刀多出两条只有本刀才有的坐标】
 *   ① **可变态 `_configDefaultsTemplate`**：宿主侧是 `let`（首个实例构造时冻结默认值快照，
 *      供后续实例的迁移分支读）。它不是函数而是**值**，且合法值是 `null`（尚未冻结）——
 *      注入面因此必须**认 null 为有效值**，不能照抄其它键的「typeof 判断」写法
 *      （照抄会让「宿主还没冻结」被读成「宿主没提供」，于是模块永远退回自带的 null，
 *      迁移分支全部记 skipped —— 迁移静默失效）。
 *   ② **类体里没有 `VERSION` 引用**（按磁盘实读：ConfigManager 类体 0 处）。第六刀把
 *      `version` 放进注入面是因为四个内核类的诊断文案里真的读了它；本刀如果照抄会
 *      长出一条**没有消费点**的注入键。故本刀注入面只列**真有引用点**的 5 个键，并在
 *      判据里对「每个键都有类内消费点」逐条对账（键面不许空转）。
 *   ③ **逐字副本**：`PLUGIN_NAME` 与三个 `_FACTS_PROMPT_ANCHOR_*` 串常量各有一份与宿主
 *      逐字一致的副本（它们是常量，注了也是同一串字符，故不进注入面）；
 *      `_moduleLib` 另有一条**取库链副本**（只复制「怎么取到它」这一层，不复制被取对象的
 *      逻辑，故不构成第二真源）。
 *      `errLog` 与 `clearApiCooldowns` 是**非逐字**的两份最小实现（同契约，见各自留痕）。
 *   ④ **活口**：bindDeps(deps) 让宿主在引擎构造期把 errLog / moduleLib / clearApiCooldowns /
 *      configDefaultsTemplate / version 换成宿主**现算**的那一份；没注过则副本就是真实现。
 *
 * 【为什么副本必不可少（与第六刀同一条实测依据）】
 *   宿主与历史套件把这些成员抠进 new Function 单独重放
 *   （v3129 抽 _applyCardOverrides 实测卡级合并、v3166 抽 loadConfig 迁移段与构造函数段、
 *   v3209 / v3168 / v3161 / v3160 / v3153 / v3154 / v3155 / v3157 / v3159 / v3162 读默认配置块）。
 *   类内若继续引用宿主自由标识符，那些抽取面**全部当场 ReferenceError**。
 *   ★ 唯一真源仍是宿主：副本只服务「宿主不在场」这一种情形。宿主改了，副本必须同步。
 *
 * 【本刀不做什么（边界）】
 *   · 不新增第二实现：类体逐字搬，不重写任何行为；
 *   · 不搬宿主函数：clearApiCooldowns / getApiCooldownStats / _getCredKey / _credCooldowns
 *     与三个锚点常量、`_configDefaultsTemplate` 一律**留在宿主或它们的真源模块**
 *     （搬走会偷改 host_beast 与 dead_code 两条读数轴的基线口径），模块侧只用注入口；
 *   · 不持有宿主状态：类只读自己的字段；SillyTavern 上下文与 localStorage 走原有取法不换源；
 *   · 不静默丢诊断：错误一律经 errLog（bindDeps 可换成宿主那份）记下，调用点原有的
 *     console/errLog 形态逐字保留；
 *   · 不搬 `_configDefaultsTemplate` 的**写入点**（见下条口径）。
 *
 * 【口径纪律】
 *   ① 方法在字段缺失 / 环境不可用时返回空值（0 / false / [] / null / ''），**绝不抛**；
 *   ② 模块缺席时宿主退到同形空实现（常量返回），如实回报「没有」；
 *   ③ 出口面只给 ConfigManager + bindDeps + PLUGIN_NAME + VERSION，**不做二次导出** ——
 *      副本是内部实现细节，暴露出去就会长出第二个真源；
 *   ④ 模板冻结（写入 `_configDefaultsTemplate`）走**注入口回写**：模块侧的
 *      `configDefaultsTemplate` 只是本地缓存，冻结值由 bindDeps 注入的
 *      `setConfigDefaultsTemplate(v)` 回写到**宿主变量**上。否则宿主与模块各冻一份，
 *      第二真源当场成立（宿主那份的迁移分支读不到模块冻的那份）。
 */
    /* ── 一、非逐字副本：宿主函数符号（模块级 let 活口，bindDeps 可覆盖） ── */
    /* ① errLog：宿主那份含 43 条错误提示矩阵（_ERROR_HINTS），逐字副本会把整张矩阵拖进
     *   模块；故这里给的是**同契约的最小实现**（不抛、不递归、不发散），而宿主在构造期
     *   **必注入**自己的 errLog（见宿主 index.js 的 _bindConfigDeps 调用）—— 唯一真源仍是
     *   宿主，这里只保证「宿主不在场」时不炸。
     *   ★ 留痕：与 memory-organs.js / memory-core.js 同一条纪律；形态刻意一致，便于三模块对账。 */
let errLog = function (err, tag) {
    try {
        const msg = String(err && err.message || err || '');
        if (typeof console !== 'undefined' && console.warn) console.warn('[LonShaMemoryConfig][' + String(tag || '') + ']', msg);
    } catch (_) { /* 记录器自身不得再抛 */ }
};
    /* ② clearApiCooldowns：宿主那份清的是宿主模块级 `_credCooldowns` 表（401/403 冷却）。
     *   类内只在一处调用它（saveConfig 成功写盘之后），语义是「配置变了，冷却判定重来」。
     *   ★ 本模块**不复制那张表**：复制品会清空一张没人读的表，而真正被 fetchWithTimeoutRetry
     *   读的是宿主那张（第五刀已把同形的份留在 memory-organs.js，那里挂的是它自己的副本函数）。
     *   故这里给的是**同契约的空实现**（同 errLog 的处理口径），宿主在 bindDeps 里必换成自己那条。 */
let clearApiCooldowns = function clearApiCooldowns() {
    /* 宿主不在场时无表可清：如实回报「清不了」，绝不伪造一个被清空的状态。 */
};

    /* ── 二、逐字副本：宿主常量（注了也是同一串字符，故不进注入面） ── */
const PLUGIN_NAME = 'LonSha记忆引擎';
let VERSION = '3.279.0';   // [留痕] 必须 let：bindDeps 可换（const 会 TypeError，宿主 catch 吞掉并中断整轮注入）
const _FACTS_PROMPT_ANCHOR_OLD = '"visibility": "observable"}]}';
const _FACTS_PROMPT_ANCHOR_NEW = '"visibility": "observable"}], "facts": [{"subject": "主语", "predicate": "谓词", "value": "取值", "type": "九类型名之一"}]}';
const _FACTS_PROMPT_IDEMPOTENT = '"facts": [{"subject"';

    /* ── 三、逐字副本：取库链（不复制被取对象的逻辑，只复制「怎么取到它」） ── */
    /* 为什么它是副本而不是注入即可：ConfigManager 的取库调用点都在**类内部**
     * （loadConfig 的 v1.4.2 与 v3.211 两段迁移各取一次 fuzzy-patch.js），抽取面
     * （单测/审计把类抠进 new Function 重放）下宿主闭包不在作用域。故模块侧自带一条与
     * 宿主同契约的取库链：**读全局真表达式 → require 回落 → 都没有返回 null**。
     * ★ 它不构成第二真源：取库链不持有任何被取对象的实现；宿主在 bindDeps 里把自己
     *   那一条换上之后，模块用的就是宿主那条（含宿主的失败归因登记 _noteModuleFailure）。 */
let _moduleLib = function _moduleLib(getGlobal, fileName) {
    try {
        const viaGlobal = (typeof getGlobal === 'function') ? getGlobal() : null;
        if (viaGlobal) return viaGlobal;
    } catch (e) { /* 读全局失败按未取到处理，继续回落 */ }
    if (typeof require !== 'undefined') {
        try { return require('./' + fileName); } catch (e) { return null; }
    }
    return null;
};
    /* ── 四、可变态活口：默认值模板（宿主侧是 let，本模块只持本地缓存） ── */
    /* 语义：宿主在**首个实例**的构造期冻结默认值快照，之后每个实例的迁移分支都读它。
     *   `null` 是**合法值**（尚未冻结）—— bindDeps 必须认它，否则「宿主还没冻」会被
     *   读成「宿主没提供」（见文件头 ① 号坐标）。
     *   本地缓存只服务「宿主不在场」：宿主在 bindDeps 里把宿主变量读出来注入一次。 */
let _configDefaultsTemplate = null;


    /* ── 五、配置管理类（类体与宿主逐字一致，仅整体去 4 空格缩进） ── */

    // ── ConfigManager（宿主逐字副本）──
class ConfigManager {
    constructor() {
        this.config = {
            enabled: true,
            extractionEnabled: true,
            vectorEnabled: true,
            graphDiffusionEnabled: true,
            autoSave: true,
            maxSummaryLength: 200,
            // [v3.14] 从世界书提取角色提示词（zhino 触发词优先思路）
            extractRolesLimit: 50,
            extractRolesPrompt: `你是角色名提取器。从下面世界书条目中提取【角色】及其别名。
规则：
1. 只提取明确是角色/人物的条目（含拟人化角色），跳过地点/物品/组织/概念类条目
2. 条目标题路径（title）和触发词（key）是最可靠的角色名来源，优先采用
3. 正文中的其他称呼、昵称、代号、外号可作别名（aliases），最多 8 个
4. 不要提取路人、一次性出场、纯背景板（宁可漏记也不多记）
5. 输出 JSON 数组：[{"name":"角色名","aliases":["别名1","别名2"]}]，仅输出 JSON，不要解释

世界书条目：
{{LORE}}

请提取最多 {{ROLE_COUNT}} 个角色。`,
            extractionPrompt: `你是剧情记忆整理员。阅读【本轮对话】，对照【已知角色名单】、【前情提要】与【悬念簿】，只提取明确发生的事实，禁止编造与推测。注意：思维链/内心独白中的构思草稿、模拟对话、心理预演均尚未发生，严禁当作剧情事实提取。
【已知角色名单】（提取角色必须复用这些主名；识别出别名/昵称/代称时，归并到对应主名）
{{KNOWN_CHARS}}
【前情提要】（此前剧情摘要，仅供理解上下文，禁止重复提取其中已记录的内容）
{{HISTORY}}
【悬念簿】（此前立下但尚未了结的约定/伏笔/未解之谜。若本轮有进展或了结，必须在 plans.resolve 中登记；禁止重复提取已了结项）
{{SUSPENSE}}
【已知场景树】（location/scenes.path 必须使用这些已登记路径，或在其下新增更细一层）
{{SCENES}}
【用户锁定事实】（用户显式要求永久保留的剧情事实。summary 中必须逐字包含这些事实，一字不差，禁止概括改写或遗漏；没有则忽略本节）
{{LOCKED_FACTS}}
【本轮对话】
{{CONTENT}}
【提取规则】
1. characters：本轮实际登场、有名有戏份的角色。必须使用已知角色名单中的主名（别名归并）；纯路人忽略；不要把用户本人算进去。
2. events：只写已发生的事实。涉及约定、承诺、冲突、物品交付、地点移动、关系变化时，写清具体内容，禁止泛化成"某物""发生变化"。每个事件标注 scope："objective"（公开事实，所有在场角色都知道）或 "pov"（仅某角色亲眼看到/独自知道的事实，此时必须给出 owner=该角色主名）。每个事件还要标注 importance（1-10，数字越大越重要：1-3日常琐事、4-6值得注意、7-8重大事件、9-10故事定义级）。
3. relationships：单向主观关系（from 看 to）。A看B 与 B看A 可能不同，分别各记一条。type 用简短词（如：暗恋、警惕、依赖、挚友、敌视）。attitude 只能填 positive / negative / neutral。
3.1 relationships.disclosure：该关系**本轮该不该披露**的触发条件（可选，人类可读）。填法同正则片段，多个条件用逗号或换行分隔，表示「或」；前缀 ! 表示排除项。例：{"from":"A","to":"B","type":"暗恋","attitude":"positive","disclosure":"告白|结婚|约会,!开玩笑"}，意为「对话里出现告白/结婚/约会时这条关系才给模型看，但若同时说到开玩笑则不给」。仅当这条关系【只在特定情形下才成立或才有意义】时才填；普遍有效的关系一律留空字符串，留空即每轮都注入。不要为了填而填。
3b. conflicts：本轮对话中出现【同一事实的两个版本对不上】时登记（如某角色在甲事件声称X、本轮又声称Y）。
先判断是更正还是真矛盾：更正（时间线自然演进，如搬家/换工作）不登记，由正常提取覆盖；
真矛盾（说不通的版本冲突，如自相矛盾的口供、立场摇摆）填 {"subject":"角色名或事实","versionA":"版本A描述","versionB":"版本B描述","note":"矛盾性质一句话","severity":"low/medium/high（按矛盾严重度）"}。没有则填空数组。
4. summary（最重要，必填）：用【监控摄像头视角】+【警察做笔录风格】重写本轮剧情，30-80字。必须包含：①谁对谁做了/说了什么（写具体动作或台词大意）②明确写出的状态变化③新信息或结果。时间锚定：保留具体人名、物品名、地点名。story_date 若剧情明确写出时间，必须保留完整年份或纪年（如"1988年9月29日""庆历四年"），禁止省略年份只写月日的短格式（"9月29日"不带年份时照抄原文但标注无年份）；古风/奇幻题材保留完整纪年与年份。严禁照抄原文句子（必须用你自己的话重新组织）；严禁氛围描写（"气氛变得…"）和阅读理解句式（"体现了…的心态"）；严禁剧情续写（止步于原文最后一个动作）。纯叙述句，无 markdown。
5. story_date：本轮剧情中明确写出的日期（如"3月12日""2026年5月1日"）；未明确写出则填 null。禁止编造日期。
6. pov_memories：本轮产生的角色私密认知/秘密/内心独白（摄像头拍不到、仅该角色自己知道的内容）。每条必须给出 owner（哪个角色知道）和 content（一句话说清）。已在对话中公开说出口的内容不算。没有则填空数组。
7. plans：本轮剧情中【新出现】的约定、目标、伏笔或未解之谜。kind 填 "plan"（角色主动要做的事）或 "suspense"（埋下的谜团/伏笔）。content 一句话写清。contentIsNew 必须为 true。没有新悬念则填空数组。禁止把悬念簿里已有的悬项重复登记。
8. plans.resolve：本轮【了结】了悬念簿里的悬项时填写。id 必须使用【悬念簿】中列出的编号（如 s3）。outcome 填 "done"（真做成/真揭晓）或 "cancelled"（被取消/放弃/作废）或 "failed"（尝试了但失败/以坏结局收场）。reason 一句话写明怎么收场的。没有则填空数组。
9. scenes：本轮【新出现】或【描述变化】的地点。action 填 "add"（新地点）或 "update"（更新描述）。path 是由大到小的数组（如 ["城市","街区","店铺"]，最多3层，末级=具体场所）。没有则填空数组。
9b. items：本轮剧情中【明确出现实体流转】的物品。新增获得填 {"action":"add","name":"物品名","desc":"一句话描述","holder":"当前持有者角色名"}；位置/状态变化填 {"action":"update","name":"已有物品名","holder":"新持有者或空","state":"完好/损坏/丢失/使用完毕"}；禁止臆测没有依据的物品；没有则填空数组。\n10. location：本轮剧情结束时主角所在的场景完整路径（必须用已登记场景路径之一；移动了才填，没动填 null）。
9c. time_advance_days：本轮剧情结束时相对上一楼【跳过了几天】（如正文出现\"三天后\",\"次日\",\"一周后\"且未写出具体日期时，填天数3/1/7；日期明确写了具体年月日则填0；没有时间跳跃填 null）。禁止臆测。
9d. money_changes：本轮剧情中【明确写出金额变动】的记录。新增收入填 {"character":"角色名","value":新金额数字,"reason":"干了什么加多少钱"}；明确写出花了多少/赚了多少（未写总余额）填 {"character":"角色名","delta":±数字,"reason":"买了什么减多少钱"}。角色名填主角时用"主角"。禁止臆测没有明确金额的变动；没有则填空数组。
9e. outline：仅当用户消息或剧情明显进入【新阶段转折】且你在回复中规划了新阶段时，才在回复正文（非 JSON）中输出大纲标签块：
<stage_title>阶段标题</stage_title><stage_goal>阶段整体目标</stage_goal><stage_tempo>buildup|mixed|surge|aftermath</stage_tempo>
<node><node_title>节点标题</node_title><node_goal>节点目标</node_goal><turn pacing="setup|pressure|turn|cooldown">该轮要发生的具体剧情</turn>...</node>...
pacing 语义：setup=铺垫（关系/信息/情绪），pressure=施压（行动+阻碍+悬念），turn=反转（揭示/爆点），cooldown=收束（后果/余韵）。
tempo 语义：buildup=铺垫蓄力，mixed=松紧交替，surge=高压密集，aftermath=余波消化。JSON 输出中不需要包含 outline 字段。
9f. protagonist：主角客观档案变化（gender/age/identity/appearance/outfit/condition 六字段，只填本轮【明确变化或有新信息】的字段，其余省略；没有变化填 null）。例：{"outfit":"换上了蓝色礼服","condition":"左手受伤缠着绷带"}。
9g. life_details：主角的偏好/习惯/近期个人状态（如"不吃香菜""在赶项目死线"）。【铁律：只认主角自己明说过、或正文明确揭示的】禁止从行为/语气推断偏好与内心。每条 {"text":"细节文本","topics":["饮食"],"anchors":["香菜"],"until":""}：topics 填 1-3 个主题标签（饮食/作息/工作…），anchors 填原文可检索的关键词，until 填故事内到期时间表示有时效（如"3月20日"），长期稳定偏好 until 留空。已有同义条目一律不重复。没有则填空数组。
9h. promises：本轮剧情中【明确立下】的承诺/约定（只认角色说出口或正文明确写出的内容，禁止根据意图臆测）。每条 {"character":"承诺者主名","content":"承诺内容","deadlineFloor":15}；deadlineFloor 只有正文明确给出将在哪个楼层/节点前完成时才填写数字，否则填 null。没有则填空数组。不要把普通计划、愿望或悬念重复填入 promises。
9i. plot_arcs：本轮新建立或明确推进的长期剧情支线。新增填 {"action":"add","title":"支线标题","clue":"当前线索","interestedBy":"关注角色主名"}；本轮触碰既有支线填 {"action":"touch","title":"既有支线标题"}；明确解决填 {"action":"resolve","title":"既有支线标题","reason":"解决方式"}。没有则填空数组。不要凭空创建支线。
9j. knowledge_changes：角色对事实的认知边界变化。角色在场外期间明确不知道某事实填 {"action":"unaware","character":"角色主名","fact":"事实"}；本轮明确获知填 {"action":"reveal","character":"角色主名","fact":"事实"}。没有则填空数组。只记录正文明确表达的认知，不根据沉默推断。
9k. promises_resolve：本轮明确履行或违约的既有承诺。填 {"id":"承诺账本中的 prom_ 编号","status":"fulfilled|broken"}；没有则填空数组。只能处理【未竟约定与承诺】中已有的编号。
9l. facts：可选【显式类型事实】通道——九种类型里**属于**本轮的才填。每条 {"subject":"主语（角色主名/物品名/地点名）","predicate":"简短谓词（如 所在/好感/持有/结果）","value":"取值或结果","type":"九种类型名之一"}。九个 type 逐字取：character-state（人物状态）/ relationship-state（关系状态，谓词写成「对某人的关系」）/ location-state（人物所在）/ item-state（物品状态，谓词写成「持有的物品名」）/ event-outcome（已发生事件的结果，多条只并列不互相覆盖）/ plot-thread（伏笔线索）/ player-preference（用户本人的偏好）/ world-rule（长期世界规则，锁定项）/ scene-fact（只在当下场景一时成立）。type 必须逐字用上述九个名字之一【写错这条会被拒绝入账】；拿不准类型就**整条不填**，绝不猜。宁少不滥：只填正文明确写出、且上面 9b/9c/9d/9e 等专项字段没有覆盖的事实（那些字段已有的内容不要在这里重复填一份）。没有则填空数组。

11. 只输出一个 JSON 对象，不得输出解释或代码块围栏。字符串内含英文双引号时转义为 \\\"，中文引号直接用。
【输出格式】
{"characters": ["角色名"], "events": [{"type": "事件类型", "description": "描述", "scope": "objective", "owner": "", "importance": 5}], "relationships": [{"from": "A", "to": "B", "type": "关系", "attitude": "positive", "disclosure": ""}], "conflicts": [{"subject": "角色或事实", "versionA": "版本A", "versionB": "版本B", "note": "矛盾性质"}], "summary": "概括", "story_date": null, "pov_memories": [{"owner": "角色A", "content": "只有A知道的秘密"}], "status_changes": [{"character": "角色名", "field": "好感", "delta": 5, "value": null, "reason": "原因"}], "todos": [{"character": "角色名", "text": "待办事项", "date": "3月15日"}], "plans": [{"kind": "plan", "content": "新立下的约定或目标", "contentIsNew": true}], "promises": [{"character": "承诺者主名", "content": "归还典籍", "deadlineFloor": 15}], "promises_resolve": [{"id": "prom_示例", "status": "fulfilled"}], "plot_arcs": [{"action": "add", "title": "调查异变", "clue": "湖水出现不明水怪", "interestedBy": "角色主名"}], "knowledge_changes": [{"action": "unaware", "character": "角色主名", "fact": "某事实"}],  "plans_resolve": [{"id": "s3", "outcome": "done", "reason": "如何了结的"}], "scenes": [{"action": "add", "path": ["城市", "街区", "店铺"], "desc": "一句话描述"}], "time_advance_days": null, "items": [{"action": "add", "name": "物品名", "desc": "描述", "holder": "持有者", "state": ""}], "money_changes": [{"character": "角色名", "delta": -100, "value": null, "reason": "买了什么"}], "location": null, "cse_states": [{"character": "角色名", "layer": "situational", "field": "情绪", "value": "紧张", "toward": null, "visibility": "observable"}], "facts": [{"subject": "主语", "predicate": "谓词", "value": "取值", "type": "九类型名之一"}]}`,
            // [v2.2] RC: plans=本轮新出现的约定/伏笔/谜团（kind: plan|suspense），plans_resolve=了结悬念簿悬项（id用悬念簿编号，outcome: done|cancelled|failed）。无则空数组。
            // [v2.4] RE: scenes=新出现/变化地点（action add|update，path 由大到小数组）；location=本轮结束主角所在场景路径（未动填 null）；status_changes 里角色位置变化用 field:"位置"（value=场景末级名）。
            // [v3.94] cse_states=CSE 级人物状态（自研引擎，可选）：layer: core=稳定核心人设/adaptive=逐渐适应固化/situational=当下一时状态；toward=明确指向对象（有剧情证据才填，core 层不填，A→B 不自动镜像 B→A）；visibility: observable=可观察/private=该角色私密/authorial=幕后（仅 AI 知）。无则空数组。
            // [v2.0] status_changes: delta=数值增减(可负)，value=直接设绝对值，二选一；field 用简短中文（好感/疲劳/心情/健康/信任/金钱等）。todos: date 是剧情中明确出现的日期，无则空字符串。无变化填空数组。
            // [v2.0] status_changes: delta=数值增减(可负)，value=直接设绝对值，二选一；field 用简短中文（好感/疲劳/心情/健康/信任/金钱等）。todos: date 是剧情中明确出现的日期，无则空字符串。无变化填空数组。
            // [v1.4] 独立 API 配置（提取用 LLM + 向量用 Embedding）
            apiProviderCustom: false,       // false=跟随正文接口, true=用下方独立配置
            apiUrl: '',
            apiKey: '',
            apiModel: 'gpt-4o-mini',
            embeddingUrl: '',
            embeddingKey: '',
            embeddingModel: 'text-embedding-ada-002',
            vectorTopK: 5,
            hybridAlpha: 0.7,
            // [v3.156] 融合模式开关。存在理由：hybridAlpha 此前只在 _legacyHybridMerge 里被读，
            //   [v3.229.0] 该方法本体已删除（P-1 死方法处置；配置键与它无绑定关系，实测为活配置）。
            //   而该方法自 [v3.50] 起无任何调用者（主路径 hybridMerge 走 RRF 排序、不读 α）
            //   ——UI 滑块可见、引擎永不消费的「死配置」。
            //   默认 false = 继续走 RRF（零行为变化）；打开后改走加权融合，α 才真正生效。
            hybridMergeWeighted: false,
            pageRankDamping: 0.85,
            dppLambda: 0.5,
            debugMode: false,
            // [v1.7] RubyPhone 双向联动
            rubyPhoneBridge: true,      // 回填: LLM 提取结果 → RubyPhone 手机记忆
            rubyPhoneRecall: true,      // 召回: RubyPhone 记忆库作为一路召回源
            rubyPhoneRecallTopN: 3,     // 每轮从手机记忆召回条数
            // [v1.8] P0: POV 认知边界 + 剧情时间线
            povIsolation: true,         // 角色私密记忆隔离（只注入当前登场角色的 POV）
            povMaxPerTurn: 3,           // 每轮最多注入的 POV 条数
            plotTimeline: true,         // 剧情时间线（按剧情日期整理摘要）
            timelineWindowDays: 3,      // 时间线召回时间窗（天）
            // [v1.9] P1: 层级摘要折叠 + BM25 稀疏检索
            summaryFoldEnabled: true,   // 摘要超阈值自动折叠成卷摘要
            summaryFoldThreshold: 30,   // 触发折叠的活跃摘要条数
            summaryFoldBatchSize: 20,   // 每批折叠条数
            bm25Enabled: true,          // BM25 稀疏检索（词频×逆文档频率）
            bm25TopK: 5,                // BM25 每轮召回条数
            aliasQueryExpansion: true,  // [v3.90] 实体别名查询扩展（吸收 MyriadKnots entity-identity）：查询命中角色别名时附加主名词条
            prequelEnabled: true,       // [v3.87] 用户导入前情资料（Prequel）按相关性选段注入
            bridgeEnabled: true,        // [v3.88] 公开只读快照桥（window.lonsha_memory_bridge_v1）

            // [v2.0] P2: 角色状态表 + 楼层账本
            characterStateEnabled: true,   // 角色数值状态追踪（好感/疲劳/心情等）
             cseEnabled: true,              // [v3.94] CSE 级人物状态引擎（自研：分层+toward+可见性+证据链置信度）
             narrativePulseEnabled: true,   // [v3.95] 叙事心电图（完全原创：情感极性+张力节奏+角色弧光+自反性节奏建议，零额外 API）
            todoTrackingEnabled: true,     // 待办事项追踪（带剧情日期，过期自动清理）
            todoExpiryMinutes: 60,         // 待办过期延迟（分钟）
            floorLedgerEnabled: true,      // 楼层账本（删楼/重生成自动回滚记忆）
            // [v2.1] P3: 互斥锁 + 上下文预算 + 节日感知
            extractionLockEnabled: true,   // 提取互斥（防并发写坏数据）
            injectionBudget: 3000,         // 注入简报字符预算（超预算自动裁剪）
            budgetStrategy: 'balanced',    // 预算策略: balanced | recency | relevance
            holidayAware: true,            // 节日感知（剧情日期临近节日时增强相关记忆）
            // [v2.2] RC: 悬念簿 + 相对时间
            suspenseEnabled: true,         // 悬念簿（约定/伏笔/未解之谜，三态了结防复读）
            suspenseMaxOpen: 20,           // 悬念簿在追踪上限（超出最旧的自动沉降）
            relativeTime: true,            // 剧情时间线注入加相对时间前缀（如"3天前·3月12日"）
            injectionDepth: 0,             // [v2.6] RG: 注入深度（0=D0紧邻最新输入；D1/D2 需 ST 核心支持，预留）
            // [v2.3] RD: rerank 精排（抄 baibai 两阶段检索）
            rerankEnabled: false,          // LLM 精排召回结果（需配独立API，延迟+费用换精度）
            rerankApiUrl: '',
            rerankApiKey: '',
            rerankModel: '',
            rerankCandidates: 12,          // 进入精排的候选数
            // [v3.152] ANIMA 词典线 A/B：术语词典（默认开）+ BM25 词典归一（默认开）+ 感知检索配额（默认关实验）
            termLexiconEnabled: true,        // 术语词典：聊天内非角色实体术语沉淀入典（成就/物品/地名等）
            termLexiconMax: 40,              // 词典条目上限（超出按 count/lastFloor 淘汰）
            bm25LexiconNormalizeEnabled: true, // BM25 双端词典归一：文档端别名→规范名，查询端附规范名+释义
            statusAwareQuotaEnabled: false,  // 感知检索配额：剧情状态（大纲 tempo/未决矛盾/开放悬念）调制检索条数
            swipeAwareRecallEnabled: false,  // [v3.153] swipe 感知臂：当前楼处于重绘态(swipe_id>0)时上调召回配额（受 statusAwareQuotaEnabled 总门控）
            ledgerAwareQuotaEnabled: false,  // [v3.153] 台账臂：近期物品台账发生变动时上调召回配额（anima #28 智能感知轻量版，受总门控）
            // [v3.96] 缝合四模块：前置AI精选 + STM/LTM游标巩固 + 统一召回 + 副API通道
            aiSelectEnabled: false,        // 前置 AI 精选（粗召回候选→AI JSON精选本轮相关，省token提精度；需AI通道）
            aiSelectMaxCandidates: 20,     // 进入精选的粗召回候选上限
            aiSelectMaxSelect: 6,          // AI 最多精选条数
            stmLtmEnabled: false,          // STM/LTM 游标巩固（unconsolidated→stm→ltm 分层，断点续跑）
            stmLtmThreshold: 5,            // 巩固触发阈值（待巩固片段数）
            unifiedRecallEnabled: false,   // 统一召回管线（图谱节点候选化走同一套评分，类型保底）
            secondaryApis: {},             // 副API通道表 { [task]: {endpoint,apiKey,model,enabled} }，task: extract/summarize/embed/select/rerank/rewrite/state
            // [v3.95] 缝合 vectors-enhanced 智能分块（长文本向量化按语义边界切块+重叠）
            vectorChunkEnabled: false,     // 长文本向量化分块（超 vectorChunkThreshold 字符才切，短文本直向量化）
            vectorChunkThreshold: 1200,    // 触发分块的文本长度阈值
            vectorChunkSize: 800,          // 单块目标字符数
            vectorChunkOverlap: 10,        // 块间重叠百分比（跨块上下文连续）
            // [v2.4] RE: 场景树 + 在场分档 + 查询重写
            sceneEnabled: true,            // 场景地图树（由大到小路径层级，注入当前场景）
            presenceInjection: true,       // 不在场角色分档注入（防凭空出现）
            presenceMaxCandidates: 8,      // [v3.91] 不在场角色单路候选上限（防角色库膨胀灌满 RRF 融合池）
            npcTierInjection: true,        // baibai 四档角色分级压平注入
            npcTiesInjection: true,        // baibai 跨空间 NPC 长期社会人伦羁绊网注入
            protagonistTracking: true,     // baibai 主角客观档案与生活习惯癖好追踪
            dualTimeAnchorEnabled: true,    // baibai 正文起止时间锚点
            // [v3.16] zhino 三核心开关
            charMemEnabled: true,        // 角色记忆银行（两层记忆）
            neuralChainEnabled: true,    // 神经链召回（链1+链2）
            worldProgressEnabled: false, // 世界推进（默认关，需观察效果后开）
            worldProgressEveryFloors: 2,
            worldProgressMaxCandidates: 2,
            queryRewrite: false,           // 生成前用小模型重写检索查询（需API，提升召回命中）
            // [v2.5] RF: 回响池 + 活人感日记 + 每N楼提取 + 反思
            echoEnabled: true,             // 回响池（抄anima：召回过的记忆停留N轮防闪烁）
            echoBaseLife: 2,               // 常规召回停留轮数
            echoMaxCount: 10,              // 回响池容量
            livingDiary: true,             // 活人感日记（抄hcdiary：第一人称+secret+记忆回环）
            diaryEveryFloors: 3,           // 每N楼写一次日记（0=每楼）
            diaryChangeDrivenInjection: true, // [v3.120] 只向当前回合注入游标之后的新日记
            timeChangeDrivenInjection: true, // [v3.121] 按时间锚点注入游标之后的新时间线事件
            timeChangeMaxCandidates: 5,
            maxMoneyDelta: 0,               // [v3.128] 钱财账本覆盖式改值的单笔最大幅度（anima zod delta clamp；0=关闭校验，建议如 10000）
            moneyLedgerEnabled: true,        // [v3.47] 钱财账本（hcdiary）；[v3.128] 补默认值使 UI 开关状态与实际行为一致
            // [v3.154] 台账写入侧校验（anima zod 式）：LLM 提取项 / 携带包条目入账前逐项校验+归一
            ledgerWriteValidationEnabled: true,
            ledgerWriteValidationDebug: false,   // 拦截/归一明细进 console（排障用）
            ledgerViolationLogMax: 200,          // 违规环形账本容量（诊断面板读取）
            volumeRetention: 40,                 // [v3.154] 卷摘要硬上限（原硬编码 20 且静默丢卷；上调并改显式淘汰）
            historicalRetention: 24,             // [v3.154] 史记硬上限（原硬编码 6 且静默丢卷）
            floorLedgerRetention: 400,           // [v3.155] 楼层账本上限（原硬编码 400 且静默 delete 最旧；改为可配+显式淘汰）
            floorLedgerEvictionDebug: false,     // [v3.155] 楼层账本淘汰调试日志
            // [v3.168] 携带契约严格模式：旧格式携带包缺键时打告警（默认开）。
            //   声明由 v3160 审计强制（读取而未声明会让引擎静默回退硬编码值，用户无从设置）；
            //   可达性由 v3161 审计强制（无 UI 控件又无卡白名单 = 旋钮不存在）。本版初稿被前者抓中一次。
            carryoverContractStrict: true,
            reflectionEnabled: false,      // 反思节点（抄stbme：洞察提炼，需API，默认关）
            reflectEveryFloors: 10,        // [v2.8] RT-B: 反思每N楼触发
            itemLedgerEnabled: true,       // [v2.8] RT-C: 物品台账（提取物品流转，抄yuzuki物品表）
            recallCacheEnabled: true,      // [v2.9] RU-D: swipe同楼重roll复用召回缓存
            // [v3.109] 召回产物持久化（缝合 bionic turn-artifact）：跨会话复用 + 历史指纹判据
            recallArtifactEnabled: false,  // 默认关：仅显式开启后才落产物并按历史指纹判复用
            // [v3.110] 事件性门控（缝合 bionic smart-trigger）：平淡楼层跳过昂贵 LLM 提取
            smartTriggerEnabled: false,    // 默认关：开启后仅「有事件性」的楼层走 LLM 提取，其余降级本地摘要
            smartTriggerThreshold: 2,      // 触发阈值（bionic 缺省 2；越低越容易触发）
            smartTriggerPatterns: '',      // 自定义触发规则（换行/逗号分隔的正则；命中即加权）
            // [v3.111] 掉队候选补召回（缝合 bionic collectVectorTailCandidates）
            vectorTailRecoveryEnabled: false,  // 默认关：开启后把「无向量/零向量/维度不符」的条目低分补进候选池
            vectorTailRecoveryLimit: 8,        // 每轮最多补召回条数（防脏库灌爆候选池）
            atomicRestoreEnabled: true,         // [v3.146] CP: 恢复原子提交边界（部分失败自动回滚到恢复前快照）
            sessionLeaseGuardEnabled: true,     // [v3.141] CP: 异步任务会话租约校验（切换聊天后旧任务作废）
            swipeFingerprintGuard: true,   // [v3.89] 三元组定位符校验：召回缓存命中前验证末楼消息指纹（翻变体失效/翻回复用）
            volumeIntegrityGuard: true,  // [v3.149] 卷摘要 intact 判定（柏宝书 #13）：折叠区下楼层被 swipe/编辑后卷摘要嵌失效叙事→检测降级展开；对账时机=生成前+编辑/swipe/删楼事件后
            recallAuditEnabled: true,   // [v3.150] A 召回命中自检：每轮召回后记录 查询/命中分布/空结果 到环形账本
            // [v3.183] 分支感知召回过滤：摘要来源楼显示页已被翻掉（source_changed）时不注入。
            //   只剔这一态，其余（缺源/旧档/正文改写）一律放行——判不了就放行，宁多勿少。
            recallProvenanceFilter: true,
            sleepAwakenEnabled: true,      // [v3.234.0] 睡眠语义唤醒：低保留价值已归档的摘要，在相似情景再现时回程（archivedForSleep 此前是单向门）
            // [v3.235.0] R4-A：回滚预览（dry-run）。删楼前先算出「撤几面 / 量级多少」，只读不落地；
            //   预告与实撤不符时在诊断面留痕。默认开（纯读、无副作用）。
            rollbackPreviewEnabled: true,
            // [v3.183] 条目关联停用词表（逗号分隔）。通用词（主角/系统/旁白…）命中会把所有条目串成一团，
            //   故默认给一份保守表，用户可增删。读取点：crosslink.createIndex({ stopwords })。
            crosslinkStopwords: '主角,系统,旁白,此时,于是,然而,之后,之前',
            // [v3.185] 条目关联的**召回侧消费**（默认关 = 零行为变化，用户可开）。
            //   存在理由：v3.183/v3.184 的「条目关联」算出了 `linked` 候选，但全仓没有任何
            //   下游消费者——存进字段、在 debugMode 下打一行、诊断行显示个数，对注入的实际影响为 0。
            //   开与关都只做「名次微调」：命中摘要键只加一个固定小分（0.006），
            //   不写图、不删条目、不改任何过滤（召回池不变，只是排序更靠前）。
            crosslinkRecallBoost: false,
            // [v3.186] 情绪反向召回（缝合 memory-palace 的 EMOTION_OPPOSITES 机制）。
            //   存在理由：本仓的情绪能力（narrative-pulse 六维词典 + scanEmotion）此前只喂
            //   「叙事心电图」，cse-engine 的 field:情绪 也不参与召回打分——于是
            //   **负面情绪在场时，与之相对的那一面无人去取**。
            //   而那一面与查询毫无字面交集（查询是「难过」，要想起的是写着「温柔/陪伴」的
            //   那几段），BM25 抓不到、向量不稳，是本仓召回面上真正空着的一格。
            //   默认关 = 零行为变化（关闭时连词表扫描都不做）；开启后只给命中键加固定小分，
            //   不换条目、不写图、不删边——与 crosslinkRecallBoost 同一纪律。
            emotionOppositeRecall: false,
            // [v3.184] 语义汇总（Node Rollup，吸收 Luker compactNodes / createRollupWithChildren）：
            //   把「同类型、还没被认领」的散节点每 N 个压成一层父节点 + semantic_contains 边，
            //   父节点**不删除任何子节点**。此前 MemoryGraph.vacuum() 全库零调用点——
            //   图只增不减；本版把它连同 vacuum 一起接进周期维护管线（graph-rollup 步骤）。
            graphRollupEnabled: true,      // 默认开：只加一层父节点，不删任何子节点，风险面小
            graphRollupMinChildren: 4,     // 每几个节点压一层（<2 会被夹到 2；三节点压一层得不偿失）
            // [v3.184] 关系披露条件（nocturne_memory 的 edge disclosure）。
            //   存在理由：关系边一旦写入就永久无条件参与注入，长线里每轮固定带上若干
            //   当期毫无用处的关系，挤占 token 且稀释真正相关的那几行。
            //   默认开：只影响「带 disclosure 字段的边」（作者没写条件的关系一律照常注入），
            //   即默认开对存量存档是零行为变化；关掉则回到「全部无条件注入」。
            relationDisclosureEnabled: true,
            // [v3.184] 归一化补丁匹配（nocturne text_patch 的机制）。
            //   存在理由：8 处「把值填进用户可编辑模板」的字面 replace，在用户把
            //   {{KNOWN_CHARS}} 编辑成全角/带空格形态后一次都不命中，占位符原样发给模型且无日志。
            //   默认开：精确命中路径与修前逐字节相同（零行为变化），只在字面未命中时才启用回退。
            //   关掉则回到「只认字面命中」，用于排查「是不是回退改错了地方」。
            fuzzyPatchEnabled: true,
            floorRecallLedgerEnabled: true,   // [v3.150] B 楼层召回账本：把「哪楼剧情被哪轮召回」回记进楼层账本 + 向量命中续热度
            heatOnRecallEnabled: true,     // [v3.31] 召回加热：被想起→activationCount+/lastActive 刷新（kiwi-mem 热度理念，接 decayScore 续命轴）
            // [v3.25] 召回类型分级（MemoryPilot）+ token 预算双层（记忆库v5）+ 归档隐藏（Bakemono共识）
            recallTierEnabled: true,       // 召回类型分级（常驻 constant / 触发 trigger，注入预算裁剪优先保常驻）
            memoryTokenBudget: 2700,       // [v3.135] 记忆注入 token 预算（按 token 剪裁）——默认从 900 重校准：旧值为 *4 装饰口径倒推值，CJK 口径真实生效后 2700 token≈3000 中文字符，与 injectionBudget 默认等价，行为不变而上限真实
            keepRecentTokenReserve: 0,     // 保留给最近正文的 token 预留（0=不预留；>0 时注入预算自动扣减）
            // [v3.160] 以下 10 个键此前只被读取点的容灾式守卫引用（`!== false` / `|| 默认值`），
            //   从未在默认配置块里声明过 —— 即「引擎有功能、用户无法关闭」。此处补齐声明；
            //   读取点一律不改（值恒为 true / 与引擎内回退同值时短路，行为与本版之前完全一致）。
            //   布尔 7 个：
            diaryBridgeEnabled: true,        // [v3.48] 日记桥：本轮提取的日记同步写进手机日记
            clockSyncEnabled: true,          // [v3.50] 剧情时钟权威同步：正文时间锚点回填手机时钟
            pairMemoryEnabled: true,         // [v3.48] 配对记忆：从 relationships 提取双人关系记忆
            conflictBookEnabled: true,       // [v3.48] 冲突簿：从 conflicts 提取并维护矛盾关系
            cardCollectionEnabled: true,     // [v3.48] 事件收藏册：从 events 提取剧情事件卡片
            ethicsConflictEnabled: true,     // [v3.48] 伦理冲突检测：family × intimate 关系冲突标记
            adaptiveBudget: true,            // [v3.50] 注入预算第三层自适应：楼层少时扩容、多时收紧（clamp 0.6x~1.8x）
            // 数值 3 个（默认值取自引擎内回退，改声明不改行为）：
            adaptiveBudgetDecayFloors: 80,   // [v3.50] 自适应衰减参考楼层
            sleepEveryN: 10,                 // [v3.47] 睡眠周期：每 N 次提取触发一次归档遗忘
            snapshotEveryFloors: 50,         // [v2.9] 定期快照：每 N 楼一份 IndexedDB 独立快照
            // [v3.236.0] R4-B：快照恢复面板的预检开关。默认开——恢复是用户可见的破坏性操作，
            //   预检只读、不改运行时，关掉它换不到任何收益，只是把「部分失败」重新变成事后才知道。
            snapshotPrecheckEnabled: true,
            autoArchiveCovered: false,     // 归档隐藏已被卷摘要覆盖的旧楼层（默认关，防灾）
            // [v3.112] 覆盖账本重算（缝合 AnchorNote）：归档状态由有效覆盖者推导而非增量记账
            coverageLedgerEnabled: false,  // 默认关：开启后覆盖者失效时自动恢复对应楼层可见（不再靠清空集合重推）
            archivePreserveRecent: 6,      // 归档时保留最近 N 个 AI 楼层不隐藏
            // [v3.27] 命中监控 + synopsis 轻量提取 + 触发词按需注入（MemoryPilot + AnchorNote）
            trailMonitor: true,             // 记录最近一次召回轨迹（settings-ui 状态面板展示）
            synopsisFastPath: true,         // AI 回复已含 <synopsis> 标签时正则直取（省 LLM 调用）
            // [v3.33] AI 主动记忆操作符（st-memory-enhancement AI 编辑表格理念的轻量版）：AI 在回复中写标签主动更新状态/待办/物品
            aiRecallOps: true,               // 总开关：允许 AI 用 <field>/<todo>/<item> 标签主动写记忆
            aiRecallOpsMaxPerFloor: 12,     // 每楼最多归入主动操作数
            aiRecallOpsDebug: false,        // 调试日志
            onDemandTriggerPhrase: '',      // 触发词按需注入长指令（空=关闭该功能；填「请生成锚点日记」等）
            // [v3.28] 三级金字塔 + 记忆树路由（st-memory-wizzard 本地轻量版）
            historicalFoldThreshold: 12,    // 卷摘要（周记）积累多少条后折叠成史记,
            // [v3.70] 柏宝书 7 层金字塔泛化：史记（tier2）之上自动生长更高层
            pyramidAutoExtend: true,        // 自动扩展金字塔 层数总开关
            pyramidTiers: ['日记', '周记', '史记', '书', '传奇'],  // 层级名（tier0-4，可配置）
            memoryTreeEnabled: false,       // 记忆树路由召回（本地轻量版，无需第二模型；默认关观察）
            vectorMaxCount: 500,           // [v2.9] RU-B: 向量硬上限
            summaryMaxCount: 400,          // [v2.9] RU-B: 摘要硬上限
            optimizeEveryFloors: 50,       // [v2.9] RU-B: 优化周期（楼）
            // [v3.108] LLM 调用事件链审计（缝合 bionic agent 事件迁移表）
            llmEventChainEnabled: false,   // 默认关：为每次 LLM 调用记录并校验事件链（只记警告，不中断主链路）
        // [v3.260.0 缝合 shujuku] 绕包装取数：内部请求打同源生成端点时，宿主预设脚本
        //   （如 Kemini 伴生面板）会 patch 页面 fetch 并改写请求体/响应流。本项打开后，
        //   内部取数改走 pristine-fetch.js 的「剥离已知包装 → 专用隐藏同源 iframe 原生 fetch」，
        //   拿回未被改写的原始响应。默认开：纯传输层防御，不改任何请求/响应语义，
        //   拿不到原生 fetch 时逐字回退全局 fetch（pristineFetch 内部兜底，不阻断请求）。
        pristineFetchEnabled: true,
        // [v3.260.0 缝合 shujuku] 原生函数调用协议（默认关，实验）：callOpenAI 改带 tools 请求，
        //   模型回包里的 tool_calls 被真执行（search_memory / write_memory / vector_search）
        //   并以 role=tool 回灌，最多 nativeToolMaxRounds 轮。关闭时逐字节走旧路径。
        nativeToolExtractEnabled: false,
        nativeToolMaxRounds: 3,        // 工具回合上限（1~5，仅 nativeToolExtractEnabled 开启时生效）
            // [v3.106] 维护流水线（engram WorkflowEngine 缝合）：归档→优化→分诊编排为单次可诊断流水线
            maintenancePipelineEnabled: false,   // 默认关：不改动既有逐条维护路径（两路不同时执行）
            maintenanceOverdueWarnDays: 45,      // 距上次维护超过 N 天 → 跳转回优化步骤补做一次
            // [v3.30] PV: 记忆矛盾换代（supersede）——新记忆与旧记忆高置信冲突时旧条退出召回
            supersedeEnabled: true,          // 总开关
            supersedeScanPool: 30,           // 每次扫描池大小
            // [v3.62] dsh 锁定事实：用户显式锁定的剧情事实逐字进摘要与注入，校验器防遗漏
            lockedFactsEnabled: true,        // 锁定事实总开关
            lockedFactMaxChars: 4000,        // 注入预算上限（字符）
            // [v3.48/v3.56] 大纲导演配置（守卫用容灾式 !== false，此处显式声明供 settings-ui 配置）
            outlineDirectorEnabled: true,     // 大纲导演：解析 AI 回复中的大纲标签
            outlineAutoPlan: true,            // 大纲耗尽时 LLM 自动规划新阶段
            outlinePlanCooldownFloors: 10,    // 大纲规划失败冷却楼层
            // [v3.37] 工业级体系化演进新配置：
            hippoDiffusionEnabled: true,     // HippoRAG 双路引燃扩散（BM25/实体联合做种子）
            temporalGraphEnabled: true,      // 时态图谱（有效区间 validFrom/To + 历史追溯）
            entropyReflectionEnabled: true,  // 叙事熵/惊奇度累加器驱动自适应反思
            entropyThreshold: 15,            // 触发自适应反思的惊奇度累积阈值
            timeTagAnchorEnabled: true,      // 正文时间标签物理锚点快速提取
            cacheFriendlyInjection: true,    // Prompt Cache 友好型冷热槽位分流
        };
        // [v3.166] 配置迁移台账（loadConfig 填充；诊断面读取）
        this._lastMigrationReport = null;
        this._configLoadError = null;
        // [v3.166] 在合并 localStorage 之前冻结默认值模板（深拷贝，防后续改动污染）。
        if (!_configDefaultsTemplate) {
            try { _configDefaultsTemplate = JSON.parse(JSON.stringify(this.config)); }
            catch (e) { errLog(e, 'ConfigManager.默认值模板'); _configDefaultsTemplate = {}; }
        }
        this.loadConfig();
    }
    loadConfig() {
        // [v3.166] 迁移台账：回答「这次载入迁了什么、有没有跳过」。
        //   原实现迁移成功只打一行 console.log，失败（目标值无效）连日志都没有。
        const _mig = { at: Date.now(), checks: 0, applied: [], skipped: [], failed: [] };
        try {
            const saved = localStorage.getItem('lonsha_memory_config');
            if (saved) this.config = {...this.config, ...JSON.parse(saved)};
            // [v3.129] anima 配置三级合并：角色卡 data.extensions.LonShaMemory > 全局 localStorage > 默认。
            //   角色级覆盖只允许白名单键（策略/数值类），提示词与 API 密钥等全局资产不随卡携带；
            //   卡上配置只读（保存面板时写回全局层，不回写角色卡），对象深合并、数组直接覆盖。
            this._applyCardOverrides();
            // [v1.6] 迁移摘要规则到笔录风格（治照抄）
            //   [v3.166] 默认值取自 _configDefaultsTemplate（原为 new (this.constructor)()，
            //   那会在迁移条件成立时自我递归，靠栈溢出收敛——见类外模板变量处的说明）。
            _mig.checks += 1;
            if (this.config.extractionPrompt?.includes('30-60字概括本轮剧情')) {
                const defaults = _configDefaultsTemplate || {};
                if (typeof defaults.extractionPrompt === 'string' && defaults.extractionPrompt) {
                    this.config.extractionPrompt = defaults.extractionPrompt;
                    this.saveConfig();
                    _mig.applied.push('v1.6-摘要规则');
                    console.log(`[${PLUGIN_NAME}] ✓ 摘要规则已升级到 v1.6 (笔录风格·治照抄)`);
                } else {
                    _mig.skipped.push('v1.6-摘要规则(默认值缺失)');
                }
            }
            // [v1.5] 迁移到三家融合版提示词（已知角色名单+前情提要+客观纪要规范）
            _mig.checks += 1;
            if (this.config.extractionPrompt && !this.config.extractionPrompt.includes('{{KNOWN_CHARS}}')) {
                const defaults = _configDefaultsTemplate || {};
                if (typeof defaults.extractionPrompt === 'string' && defaults.extractionPrompt) {
                    this.config.extractionPrompt = defaults.extractionPrompt;
                    this.saveConfig();
                    _mig.applied.push('v1.5-提示词');
                    console.log(`[${PLUGIN_NAME}] ✓ 提取提示词已升级到 v1.5 (已知角色名单+记忆回环+客观纪要)`);
                } else {
                    _mig.skipped.push('v1.5-提示词(默认值缺失)');
                }
            }
            // [v1.4.2] 迁移旧版提示词：summary 字段描述太弱导致 LLM 返回空摘要
            //   [v3.184] 字面 replace 换成归一化宽松匹配（fuzzy-patch.js，移植 nocturne text_patch 机制）。
            //   修前实测后果：extractionPrompt 由用户在设置面板自由编辑（settings-ui 的 ls-prompt
            //   文本框），粘贴/输入后字段描述里的英文引号极易变成弯引号或全角，字面 replace 一次都不命中
            //   ——v3.166 的台账把这种情况记为「替换未命中」并跳过，于是**迁移永远不会发生**，
            //   用户停在一个永不升级的旧提示词上（静默）。现在：精确命中优先，未命中走归一化回退
            //   （弯引号/破折号/多空格/行尾空白），唯一命中才落。歧义不猜——改错地方比不改更糟。
            _mig.checks += 1;
            if (this.config.extractionPrompt?.includes('"summary": "摘要"')) {
                const _before = String(this.config.extractionPrompt);
                const _FP = _moduleLib(() => window.LonShaFuzzyPatch, 'fuzzy-patch.js');
                const _NEWDESC = '"summary": "用一句话概括这段对话发生了什么、角色间关系有何进展（30-60字，必须是你自己的概括，禁止照抄原文）"';
                let _after = null, _mode = 'module-missing';
                if (_FP && typeof _FP.applyPatch === 'function') {
                    const _r = _FP.applyPatch(_before, '"summary": "摘要"', _NEWDESC, { normalize: this.config.config.fuzzyPatchEnabled !== false });
                    _mode = _r.mode;
                    if (_r.ok) _after = _r.text;
                } else {
                    // 模块缺席：退到原字面行为（不静默跳过——那会让迁移在模块缺失时也「看起来跑过」）
                    const _lit = _before.replace('"summary": "摘要"', _NEWDESC);
                    if (_lit !== _before) { _after = _lit; _mode = 'literal-fallback'; }
                }
                // [v3.166] 迁移必须真的改动了值才算迁移：未命中时旧实现照样 saveConfig + 报「已升级」，
                //   是一次「什么都没做的成功声明」。
                if (_after !== null && _after !== _before) {
                    this.config.extractionPrompt = _after;
                    this.saveConfig();
                    _mig.applied.push('v1.4.2-summary描述');
                    // [v3.184] 本站读数（诊断面据 _fuzzyPatchRead 报「迁移用了哪条路径」）
                    this._fuzzyPatchRead = { site: 'config-migration', mode: _mode, total: 1, applied: 1, modes: { summary描述: _mode }, missed: [], leftover: [] };
                    console.log(`[${PLUGIN_NAME}] ✓ 提取提示词已自动升级 (summary 要求真概括, ${_mode})`);
                } else {
                    _mig.skipped.push('v1.4.2-summary描述(' + (_mode === 'module-missing' ? '模块未加载' : '替换未命中') + ')');
                    this._fuzzyPatchRead = { site: 'config-migration', mode: _mode, total: 1, applied: 0, modes: {}, missed: ['summary描述(' + _mode + ')'], leftover: [] };
                }
            }
            // [v3.211] 迁移旧版提取提示词：补上 facts[]（显式类型事实）通道。
            //   为什么要迁移而不只改默认值：extractionPrompt 由用户自由编辑且**持久化在配置里**，
            //   已装用户永远拿不到新默认值。而 v3.211 的落笔侧第一通道读的正是 extracted.facts[] ——
            //   不迁移则那条通道对老用户**永远为空**（v3.210 既有病：注释声称吃两种输入，
            //   实际 schema 里根本没有 facts 字段，第一通道从未有输入）。
            //   改法是**注入通道片段**（不是整段覆盖用户提示词）：保留用户的措辞与自定义，
            //   只把输出 JSON 末尾补上 facts 数组。幂等键是 facts 片段本身（重复运行不会补两次）。
            _mig.checks += 1;
            if (this.config.extractionPrompt && !this.config.extractionPrompt.includes(_FACTS_PROMPT_IDEMPOTENT)) {
                const _beforeF = String(this.config.extractionPrompt);
                const _FPF = _moduleLib(() => window.LonShaFuzzyPatch, 'fuzzy-patch.js');
                // 锚点串提到类外（见 _FACTS_PROMPT_ANCHOR_* 处的说明）：含花括号的字面量写在
                //   方法体内，会被 scan_claim_truthfulness 的裸花括号配平算歪，连带方法区间错位。
                const _OLD_F = _FACTS_PROMPT_ANCHOR_OLD;
                const _NEW_F = _FACTS_PROMPT_ANCHOR_NEW;
                let _afterF = null, _modeF = 'module-missing';
                if (_FPF && typeof _FPF.applyPatch === 'function') {
                    const _rf = _FPF.applyPatch(_beforeF, _OLD_F, _NEW_F, { normalize: this.config.config.fuzzyPatchEnabled !== false });
                    _modeF = _rf.mode;
                    if (_rf.ok) _afterF = _rf.text;
                } else {
                    const _litF = _beforeF.replace(_OLD_F, _NEW_F);
                    if (_litF !== _beforeF) { _afterF = _litF; _modeF = 'literal-fallback'; }
                }
                if (_afterF !== null && _afterF !== _beforeF) {
                    this.config.extractionPrompt = _afterF;
                    this.saveConfig();
                    _mig.applied.push('v3.211-facts通道');
                    this._fuzzyPatchRead = { site: 'config-migration', mode: _modeF, total: 1, applied: 1, modes: { facts通道: _modeF }, missed: [], leftover: [] };
                    console.log(`[${PLUGIN_NAME}] ✓ 提取提示词已补 facts[] 通道 (${_modeF})`);
                } else {
                    _mig.skipped.push('v3.211-facts通道(' + (_modeF === 'module-missing' ? '模块未加载' : '替换未命中') + ')');
                    this._fuzzyPatchRead = { site: 'config-migration', mode: _modeF, total: 1, applied: 0, modes: {}, missed: ['facts通道(' + _modeF + ')'], leftover: [] };
                }
            }
        } catch (e) {
            errLog(e, 'ConfigManager.loadConfig');
            _mig.failed.push('loadConfig:' + String(e?.message || e));
            this._configLoadError = String(e?.message || e);
        }
        // [v3.166] 台账落实例：诊断面据此回答「这次启动迁了什么 / 跳过了什么 / 失败在哪」。
        this._lastMigrationReport = _mig;
    }
    // [v3.129] 角色卡配置覆盖（anima 三级合并的卡级层）：独立方法便于单测与切换角色时重放
    _applyCardOverrides() {
        try {
            const ctx = (typeof window !== 'undefined' && window.SillyTavern?.getContext?.()) || null;
            const cardCfg = ctx?.character?.data?.extensions?.LonShaMemory;
            if (!cardCfg || typeof cardCfg !== 'object') return 0;
            const CARD_CFG_KEYS = [
                'vectorTopK', 'hybridAlpha', 'hybridMergeWeighted', 'injectionBudget', 'memoryTokenBudget', 'injectionDepth',
                'summaryFoldThreshold', 'diaryEveryFloors', 'reflectEveryFloors', 'echoBaseLife', 'echoMaxCount',
                'timeChangeMaxCandidates', 'timelineWindowDays', 'maxMoneyDelta', 'smartTriggerThreshold',
                'suspenseMaxOpen', 'recallCacheEnabled', 'diaryChangeDrivenInjection',
                'timeChangeDrivenInjection', 'itemLedgerEnabled', 'moneyLedgerEnabled', 'echoEnabled',
                'termLexiconEnabled', 'termLexiconMax', 'bm25LexiconNormalizeEnabled', 'statusAwareQuotaEnabled',
                'swipeAwareRecallEnabled', 'ledgerAwareQuotaEnabled',
                'ledgerWriteValidationEnabled', 'ledgerWriteValidationDebug', 'ledgerViolationLogMax',
                'volumeRetention', 'historicalRetention',
                'floorLedgerRetention', 'floorLedgerEvictionDebug',
                // [v3.160] 归档节奏三键：此前只被引擎内部回退值兜着，卡作者无法按卡调节奏
                'sleepEveryN', 'snapshotEveryFloors', 'adaptiveBudgetDecayFloors',
                // [v3.161] 召回调优五键（仅策略/数值/命名；提示词 extractRolesPrompt 与含密钥的
                //   secondaryApis 刻意不进卡——前者是全局资产，后者会随卡泄露 API Key）
                'budgetStrategy', 'pageRankDamping', 'dppLambda', 'memoryTreeEnabled', 'pyramidTiers',
                // [v3.261.0] 补 v3.260.0 漏登记的 nativeToolMaxRounds：该键当时被声明且被
                //   `_nativeToolMaxRounds()` 读取，却既无面板控件也不在白名单里 —— 引擎读到的
                //   永远是硬编码回退值 3，旋钮在面板上不存在（v3161 [1] 当场报红）。
                //   它是纯数值、无密钥、非全局资产，按 v3.160 三键同口径可进卡。
                'nativeToolMaxRounds',
            ];
            let applied = 0;
            for (const k of CARD_CFG_KEYS) {
                const v = cardCfg[k];
                // [v3.134] 空字符串同样跳过："" 会把布尔开关翻成误开（"" !== false）、数值键被 Number("") 归零，卡作者漏填的空值不应生效
                if (v === undefined || v === null || v === '') continue;
                if (typeof this.config[k] === 'object' && this.config[k] !== null && typeof v === 'object' && !Array.isArray(v)) {
                    this.config[k] = { ...this.config[k], ...v };
                } else {
                    this.config[k] = v;
                }
                applied++;
            }
            if (applied) console.log(`[${PLUGIN_NAME}] ✓ 已应用角色卡配置覆盖（${applied}/${Object.keys(cardCfg).length} 个键，白名单交集生效）`);
            return applied;
        } catch (e) { errLog(e, 'ConfigManager._applyCardOverrides'); return 0; }
    }
    saveConfig() {
        try {
            localStorage.setItem('lonsha_memory_config', JSON.stringify(this.config));
            clearApiCooldowns();
        } catch (e) { errLog(e, 'ConfigManager.saveConfig'); }
    }
}
    /* ── 六、宿主注入口（活口） ── */
    /** [A1 第七刀] 宿主依赖注入口：模块在场时把 ConfigManager 依赖的主人符号换成宿主
     *  **现算**的实现。为什么要有它：副本只在「宿主不在场」（单测/审计把类抠进
     *  new Function 重放）时是真实现；宿主在场却继续用副本，则宿主改了函数而副本未同步
     *  就会**静默漂移**（本仓治理过多轮的缺陷形态）。
     *  只接受函数/字符串；非法值忽略（保持副本），不抛、不改语义。返回被换掉的项数（诊断用）。
     *  五个键为什么是这五个：类体在源码里的类外引用面（按磁盘实读）恰好落到它们身上 ——
     *    constructor      → errLog / PLUGIN_NAME / _configDefaultsTemplate
     *    loadConfig       → errLog / _moduleLib（取 fuzzy-patch.js）/ _configDefaultsTemplate /
     *                       _FACTS_PROMPT_ANCHOR_OLD / _FACTS_PROMPT_ANCHOR_NEW /
     *                       _FACTS_PROMPT_IDEMPOTENT / PLUGIN_NAME
     *    _applyCardOverrides → errLog / PLUGIN_NAME
     *    saveConfig       → errLog / clearApiCooldowns
     *  （PLUGIN_NAME 与三个锚点串是逐字副本常量：注了也是同一串字符，故不进注入面；
     *    version 单独列 —— 它不服务类体，服务的是模块导出面与宿主同源。）
     *  ★ 本刀特有的键：`configDefaultsTemplate` 是**值**不是函数，且 `null` 是合法值
     *    （含义：宿主还没提供快照）。判据用 hasOwnProperty + 非 null ——
     *    写成真值判断会把合法的 null 一并挡掉；不做非 null 过滤则**每次宿主注入都会把
     *    已冻结的模板清空**，迁移分支会反复走「默认值缺失」的 skipped 分支（迁移静默失效）。 */
    function bindDeps(deps) {
        const d = deps || {};
        let n = 0;
        if (typeof d.errLog === 'function') { errLog = d.errLog; n++; }
        if (typeof d.moduleLib === 'function') { _moduleLib = d.moduleLib; n++; }
        if (typeof d.clearApiCooldowns === 'function') { clearApiCooldowns = d.clearApiCooldowns; n++; }
        /* [v3.277.0 O7] ★ 这里的 `!= null` 是**设计落地**不是写法偏好：
         *   上方 645-648 的设计注释就写着「不做非 null 过滤则每次宿主注入都会把已冻结的
         *   模板清空」——而修前实现用的是 `!== undefined`，`null` 照样放行，注释与实现相反。
         *   实测（探针）：bindDeps({ configDefaultsTemplate: null }) 真把已冻模板清成 null，
         *   触发路径即 index.js 的 _newConfigManager 首次构造前把尚为 null 的宿主变量推过来。
         *   修后：null 与 undefined 同义（都表示「宿主还没提供快照」），一律忽略、不计入 swapped。 */
        if (Object.prototype.hasOwnProperty.call(d, 'configDefaultsTemplate') && d.configDefaultsTemplate != null) {
            _configDefaultsTemplate = d.configDefaultsTemplate; n++;
        }
        if (typeof d.version === 'string' && d.version) { VERSION = d.version; n++; }
        return n;
    }
    /** [A1 第七刀] 模板这个**可变态**的唯一读取口：宿主在引擎构造期用它把自己那份
     *  （首个实例构造时由类体冻结）对齐到模块的真源，避免「宿主一份、模块一份」。
     *  这不是二次导出，而是让「谁持有模板」有唯一答案：持有者是本模块，宿主只持有引用。 */
    function getConfigDefaultsTemplate() {
        return _configDefaultsTemplate;
    }
    const api = Object.freeze({ ConfigManager, bindDeps, getConfigDefaultsTemplate, PLUGIN_NAME, VERSION });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaMemoryConfig = api;
})(typeof window !== 'undefined' ? window : globalThis);
