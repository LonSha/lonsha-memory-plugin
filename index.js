(function() {
    'use strict';
    const PLUGIN_NAME = 'LonSha记忆引擎';
    const VERSION = '3.426.0';
    // [v3.165] 事件接线的注册点总数（单一真源）。
    //   此前这个数字在两处独立硬编码（失败哨兵 expected=7 与 selfCheck 文案），
    //   加一个注册点必须记得同时改两处；漏一处就出现「哨兵以为该有 7 个、实际注册了 8 个」
    //   的静默不一致 —— 而这类不一致不报错，只会让哨兵说假话。
    //   它与 _controlInfo.expected 不是一回事：后者由宿主可见性条件在运行时派生
    //   （event_types 缺项时对应注册点本就不执行），本常量用于结构校验与下限判据。
    const EXPECTED_EVENT_TYPES = 7;
    // [v3.190] 删楼位移的逐面诊断标签：登记表 id → 该面历史上使用的错误标签。
    //   位移收进 ledger-replay.js 的登记表之后，逐面失败仍按这些名字进日志——
    //   旧名字就是检索键，改名即断掉诊断面的按名回溯能力。
    const SHIFT_FACE_LABELS = Object.freeze({
        summary: 'shiftFloorsFrom.摘要位移', volumes: 'shiftFloorsFrom.卷位移',
        vector: 'shiftFloorsFrom.向量位移', diary: 'shiftFloorsFrom.日记位移',
        pov: 'shiftFloorsFrom.POV位移', timeline: 'shiftFloorsFrom.时间线位移',
        suspense: 'shiftFloorsFrom.悬念位移', items: 'shiftFloorsFrom.物品位移',
        money: 'shiftFloorsFrom.钱财位移', cards: 'shiftFloorsFrom.卡牌位移',
        conflicts: 'shiftFloorsFrom.矛盾位移', pair: 'shiftFloorsFrom.群像位移',
        delta: 'shiftFloorsFrom.正史增量位移', 'life-detail': 'shiftFloorsFrom.生活小档案位移',
        protagonist: 'shiftFloorsFrom.主角档案位移', 'world-prog': 'shiftFloorsFrom.WorldProgress位移',
        outline: 'shiftFloorsFrom.OutlineDirector位移', 'char-mem': 'shiftFloorsFrom.角色记忆位移',
        drift: 'shiftFloorsFrom.人设偏移位移', cse: 'shiftFloorsFrom.cse位移',
        pulse: 'shiftFloorsFrom.叙事心电图位移', baseline: 'shiftFloorsFrom.人设基线位移',
        geo: 'shiftFloorsFrom.地理上下文位移', archived: 'shiftFloorsFrom.归档楼层位移',
        oplog: 'shiftFloorsFrom.opLog位移', reflection: 'shiftFloorsFrom.反思位移',
        'status-ops': 'shiftFloorsFrom.状态ops位移', 'floor-ledger': 'shiftFloorsFrom.楼层账本位移',
        scene: 'shiftFloorsFrom.场景位移', graph: 'shiftFloorsFrom.图谱位移',
        changeset: 'shiftFloorsFrom.变更集位移', 'inject-cursor': 'shiftFloorsFrom.注入游标位移',
        'stm-ltm': 'shiftFloorsFrom.短期长期记忆位移'
    });
    // [v3.173] 缝合模块接线面：缝合模块的统一取库口。
    //   契约：浏览器优先取 window.<符号>（缝合模块 IIFE 双导出到全局），
    //   取不到再回落 CommonJS require('./<file>')，两者都取不到返回 null。
    //   **不能在构造函数里缓存**：extra_js 在入口脚本之后加载，构造时全局还没挂上。
    //   调用点一律写成 _moduleLib(() => window.<模块全局>, 'xxx.js') —— 传的是**真读表达式**
    //   而不是字符串符号名，理由有二：①「宿主确实读了该全局」在源码里可见（模块接线审计
    //   的消费判据正是扫 LonSha 前缀的全局引用），②符号名拼错时不至于静默取空。
    function _moduleLib(getGlobal, fileName) {
        try {
            const viaGlobal = (typeof getGlobal === 'function') ? getGlobal() : null;
            if (viaGlobal) return viaGlobal;
        } catch (e) { /* 读全局失败按未取到处理，继续回落 */ }
        if (typeof require !== 'undefined') {
            try { return require('./' + fileName); } catch (e) {
                // [v3.209.0] 缺席归因（修前实测的静默吞错）：
                //   此处原为 `catch (e) { return null; }` —— 于是「无此文件」「文件在但语法错」
                //   「全局名写错」三种根因**完全同形**，调用方一律降级为兜底实现，诊断面只能报
                //   「模块未加载」，排查必须手工 require 一遍才知道是哪种。
                //   现在把错误收进登记表（不抛、不改调用方契约：仍返回 null），由诊断面点名根因。
                //   为什么不在取库口抛：取库是热路径且各调用点自有降级逻辑，抛会把降级变成崩溃；
                //   归因的责任交给 module-registry，取库口只负责**不丢证据**。
                //   ★ 登记调用自身必须**判可达 + 自兜**（本版自伤留痕）：首版直接写
                //   `_noteModuleFailure(fileName, e);`，结果在「登记者不可达」的环境里
                //   （v3173·C1 把本函数抽出来用 new Function 单独重放）抛 ReferenceError——
                //   **降级当场变成崩溃**，恰好违反本条注释上一句的纪律，被该套件当场抓住。
                //   「登记的失败不得成为新的失败」：故外层判函数存在、内层 try 兜住。
                try { if (typeof _noteModuleFailure === 'function') _noteModuleFailure(fileName, e); } catch (_) { /* 登记本身失败就作罢：不记、也不抛——取库口的契约是「失败返回 null」，登记是附带的 */ }
                return null;
            }
        }
        return null;
    }
    // [v3.209.0] 模块取库失败登记（供「模块加载」诊断行点名根因）。
    //   刻意用 Map 而非数组：同一轮里同一模块可能被取多次，只记首次根因（后续覆盖无信息量）。
    let _moduleFailures = null;
    function _noteModuleFailure(fileName, err) {
        try {
            if (!_moduleFailures) _moduleFailures = new Map();
            const k = String(fileName || '(未命名)');
            if (!_moduleFailures.has(k)) _moduleFailures.set(k, String((err && err.message) || err || 'unknown'));
        } catch (e) { /* 登记失败不得影响取库路径 */ }
    }
    function _moduleFailureSnapshot() {
        try {
            if (!_moduleFailures) return [];
            return [..._moduleFailures.entries()].map(([file, error]) => ({ file, error }));
        } catch (e) { return []; }
    }

    // [v3.209.0] 结构迁移（schema-migration.js）取库口。与 _costLedgerLib 同形（全局优先 + require 回落）。
    //   为什么必须有这一面：v3.209 侦察实测 restoreFromPayload 对 schemaVersion **只处理一个方向**
    //   （`if (_sv > ARCHIVE_SCHEMA_VERSION)` 才报警）——「存档比插件旧」完全无人处理。
    //   本取库口让「旧档要走哪几步、有没有路径」变成可判读数。
    function _schemaMigrationLib() {
        return _moduleLib(() => window.LonShaSchemaMigration, 'schema-migration.js');
    }
    // [v3.209.0] 模块加载登记表（module-registry.js）取库口。
    function _moduleRegistryLib() {
        return _moduleLib(() => window.LonShaModuleRegistry, 'module-registry.js');
    }
    // [v3.184] 行级变更集（changeset.js，移植 nocturne ChangesetStore 的行级 before/after 累积）。
    //   为什么需要：本仓三种「回看改了什么」的设施**都没有前后值**——
    //   SnapshotManager 是整楼层粒度（只知道第 N 楼改过、不知道改了哪一格），
    //   OpLog 与 CharacterState.ops 记的是**意图**（{character, field, delta:5}），
    //   而不是「这一格原来是 3、现在是 8」。于是「第 12 楼把谁的好感从多少改到多少」
    //   无处可查：由 delta 反推需要当时的值，而那个值已经不存在了。
    //   惰性单例（模块在 extra_js 里后加载，构造期取不到）；不抛。
    //   **刻意不加配置键**：池有 400 行硬上限、只在既有写入点旁路记录、不改任何既有数据路径的
    //   返回值——加键就要配一个设置面板控件与一条可达性路径（v3.160 纪律），
    //   而这里没有「必须由用户决定」的取舍。**刻意不导出**：导出的顶层键集是契约冻结的
    //   （v3139 测试强制 collectExport 键 == ARCHIVE_TOP_LEVEL_KEYS），行级变更集是会话内诊断资产。
    let _changesetStore = null;
    function _changeset() {
        try {
            if (_changesetStore) return _changesetStore;
            const CS = _moduleLib(() => window.LonShaChangeset, 'changeset.js');
            if (!CS || typeof CS.ChangesetStore !== 'function') return null;
            _changesetStore = new CS.ChangesetStore({});
            return _changesetStore;
        } catch (e) { return null; }
    }
    /**
     * [v3.254.0] M-O4：派生缓存身份（`cache-identity.js`）取库口。
     *   为什么要有这一层见该模块头注：身份此前是**三个各自独立**的读数
     *   （会话 `getCurrentChatId()` / 代际 `_mutationEpoch` / 历史 `_historyFingerprint()`），
     *   于是「哪里该失效」散在调用点各自手写，删楼/导入/恢复的交叉情形无人统一判。
     *   本取库口与 `_schemaMigrationLib` 同形；**不在构造期缓存**（extra_js 后加载）。
     */
    function _cacheIdentityLib() {
        return _moduleLib(() => window.LonShaCacheIdentity, 'cache-identity.js');
    }
    /**
     * [v3.254.0] M-O4：长线规模与缓存负载量测台（`cache-workload.js`）取库口。
     *   它是「只有证明有收益的热点进入产品修改」这条计划口径的**唯一证据来源**；
     *   本体是纯量测（不 import 任何生产文件），探针由调用方给出。
     */
    function _cacheWorkloadLib() {
        return _moduleLib(() => window.LonShaCacheWorkload, 'cache-workload.js');
    }
    /**
     * [v3.421.0 · 缝合 E1/E2] 记忆强度治理双模块取库口（`strength-policy.js` / `strength-proposal.js`）。
     *
     * 为什么拆两个文件而不是一个：策略面（建议值怎么算、人工改值、锁定）是**幂等纯算**，
     *   提案面（双钥匙生命周期、乐观版本锁、回滚快照）是**有状态流程**。二者的失效形态完全不同
     *   （前者算错顶多建议偏一点；后者判错会让不该落地的变更落地），混在一个文件里会让
     *   「策略改了」与「闸门改了」共用一份 diff 与一份单测面。用户明确要求两者分开。
     *
     * 两者都可缺席（返回 null），调用方必须给出各自的降级形态：
     *   · 策略面缺席 ⇒ 治理面板只报不可用，仍走原来的裸 importance；
     *   · 提案面缺席 ⇒ 高风险变更退回「直接改」并**在读数里标明无钥匙**（不假装钥匙已验）。
     * 不在构造期缓存：extra_js 后加载。
     */
    function _strengthPolicyLib() {
        return _moduleLib(() => window.LonShaStrengthPolicy, 'strength-policy.js');
    }
    function _strengthProposalLib() {
        return _moduleLib(() => window.LonShaStrengthProposal, 'strength-proposal.js');
    }
    /**
     * [v3.421.0 · 缝合 E3] 销项额度判据（`stm-close-quota.js`）的宿主取库口。
     *
     * 为什么宿主也要取一次，而不是只让 stm-ltm 自己取：额度是**跨模块判据** —— 它裁定
     *   「这批能销几条」，宿主是唯一的批边界持有者（只有它知道本批 appended 多少）。
     *   宿主也取一份，才能在批末除了执行销项还**预演**一次（面板/诊断先看到会拦什么），
     *   并且在模块缺席时把「走的是兜底」报进总账，而不是让 stm-ltm 内部的兜底静默生效。
     * 缺席返回 null，调用方按「stm-ltm 内部同算法兜底」处理（行为不变、仅可归因性下降）。
     */
    function _stmCloseQuotaLib() {
        return _moduleLib(() => window.LonShaStmCloseQuota, 'stm-close-quota.js');
    }
    // [v3.139] CP-L3 快照冻结键契约（stbme: GRAPH_SNAPSHOT_TOP_LEVEL_KEYS 纪律移植）。
    // 演化纪律：只在 record 内加字段；顶层键新增/删除必须同步本清单（守卫测试 v3139 强制 collectExport 键 == 本清单）。
    const ARCHIVE_TOP_LEVEL_KEYS = Object.freeze([
    'version',
    'clock',
    'graph',
    'charMem',
    'worldProg',
    'summaries',
    'diaries',
    'reflection',
    'itemOps',
    'vectors',
    'povs',
    'timeline',
    'status',
    'ledger',
    'suspense',
    'moneyLedger',
    'cards',
    'conflicts',
    'scene',
    'echo',
    'prequel',
    'supersede',
    'narrativeEntropy',
    'stmLtm',
    'recallArtifacts',
    'diaryInjectFloor',
    'timelineInjectFloor',
    'deltaBook',
    'cse',
    'pulse',
    'opLog',
    'outline',
    'pairMem',
    'lockedFacts',
    'recallSourceStats',
    'lexicon',
    'factVersions',      // [v3.194] 时间与事实版本
    'eventThreads',      // [v3.194] 事件完整性
    'repairLog',         // [v3.194] 修复闭环
    'timelineCursorChatId',
    'timelineCursorFingerprint',
    'timeWentBack',
    'lastSave',
    'packedAt',
    'schemaVersion',
    'producerVersion',
    'loreImportLedger',  // [v3.339.0 · M4-X1] 资料导入账（幂等键 + 人工校订决定）
    'qaThread',  // [v3.340.0 · M4-X4] 追问线程（主体 / 时点下界 / 分支 / scope；只存约束不存答案）
    'annualDrafts',  // [v3.341.0 · M4-X2] 章节成稿草稿册（作品：题/述/段；事实位一概不收）
    'canonAdoption',  // [v3.342.0 · M4-X3] 正史落卷凭据（选中键集合指纹 + 撤销范围；只存凭据不存结局条文）
    // [v3.421.0] L10/L11 缝合层的六个产物键：collectExport 自 v3.17x 起一直在导出，
    //   契约清单却没收 —— 恢复侧因此把它们判成未知键塞进 extensions（导出/恢复不对称）。
    'memoryAnnealingCurve',       // 记忆退火状态（L11-O5）
    'phaseTransitionSafeguard',   // 相变锁凭据（L11-O8）
    'epilogueRetrospective',      // 人生回望总结（L10-X9）
    'intergenerationalTotem',     // 代际精神图腾（L11-X9）
    'multiResolutionArchive',     // 多分辨率归档封卷（L10-O8）
    'epochalHeritage',            // 时代沉淀传承（L10-X9）
    'extensions',
    ]);
    const ARCHIVE_TOP_LEVEL_KEY_SET = new Set(ARCHIVE_TOP_LEVEL_KEYS);
    // [v3.168] 跨会话携带契约键清单（单一真源）。
    //   存在理由：packCarryover（写侧）与 applyCarryover（读侧）此前各写各的键清单，
    //   无人核对二者是否相等。实测（修前）：写侧产出 15 键、读侧消费 22 键，差集 9 个
    //   （moneyLedger / cards / conflicts / deltaBook / cse / pulse / opLog / outline / pairMem）
    //   —— 读侧分支全部写好、写侧从不产出，于是它们是**死分支**：跨对话「无缝续写」
    //   实际只承接了摘要/图谱/向量/物品，角色状态表与货币账本等一并不带走，且不打任何提示。
    //   本清单让两侧键集合可机检，漂移即报警；报告走 selfCheck 与 opLog。
    const CARRYOVER_CONTRACT_KEYS = Object.freeze([
        'version', 'summaries', 'volumes', 'suspense', 'timeline', 'statusFlat',
        'graph', 'povs', 'diary', 'reflection', 'itemOps', 'scene', 'vectors',
        'moneyLedger', 'cards', 'conflicts', 'deltaBook', 'cse', 'pulse',
        'opLog', 'outline', 'pairMem', 'ageAnchors', 'scenePresence',
        'factVersions', 'eventThreads',
        // [v3.202] 拓宽面：以下 13 键此前「存档面有、携带面无」——跨对话续写时它们留在旧对话。
        //   其中 worldProg 最重：其 export() 含 active/promises/六账/knowledge/plotArcs 十个子面，
        //   即约定、伏笔、平行事实、秘密、回扣、回声、认知隔离、剧情弧全部不带走。
        //   repairLog 是 v3.194 CHANGELOG 已声称进契约、实测未进的那个键（声称与落地漂移）。
        'worldProg', 'clock', 'charMem', 'lockedFacts', 'lexicon', 'prequel',
        'supersede', 'stmLtm', 'recallArtifacts', 'narrativeEntropy', 'timeWentBack',
        'repairLog',
    ]);
    // [v3.202] 存档面有、携带面**刻意不带**的键（显式登记，非静默豁免）。
    //   判据：D3 扫描器要求 ARCHIVE_TOP_LEVEL_KEYS ⊆ CARRYOVER_CONTRACT_KEYS ∪ 本表，
    //   每个豁免项都必须写明理由——「没带」与「不该带」必须可分。
    const CARRYOVER_EXEMPT_KEYS = Object.freeze([
        'lastSave',           // 保存地面真源（本机时间戳），跨对话无意义
        'packedAt',           // 打包时刻元数据
        'schemaVersion',      // 存档结构版本（恢复时由本机现算）
        'producerVersion',    // 生成本存档的插件版本（元数据）
        'extensions',         // 未知顶层键宽容回写出口（容器，非业务面）
        'diaryInjectFloor',   // 注入游标：新对话楼层重算，游标归零
        'timelineInjectFloor',// 时间线注入游标：新对话楼层重算，游标归零
        'timelineCursorChatId',       // 游标身份：绑定具体 chat，跨对话无效
        'timelineCursorFingerprint',  // 游标指纹：与 chatId 成对生效，跨对话一并失效
        'recallSourceStats',  // 召回源命中统计：会话内诊断资产
        'loreImportLedger',   // [v3.339.0 · M4-X1] 资料导入账：importedText 与携带面 prequel 同源异名（携带会双写），seen/decisions 是会话内幂等与校订痕迹
        'qaThread',           // [v3.340.0 · M4-X4] 追问线程：主体/时点条件绑定当前会话的问题语境，跨对话继承会把 A 的追问答成 B 的（内核自身按 chatKey 作废重建，故此处刻意不带）
        'annualDrafts',       // [v3.341.0 · M4-X2] 成稿草稿册：章身份绑定具体会话的卷章结构，且它是**作品**不是剧情事实——跨对话带上会把上一部的回顾接进新故事
        'canonAdoption',      // [v3.342.0 · M4-X3] 落卷凭据：adoptionId 由「本次选择」定，跨对话带上会让新故事的第一次落卷被判成**重复确认**而静默不落
        'ledger',             // 楼层账本：索引「该楼提取了什么」，新对话楼层重来
        'echo',               // 回响池：life 计数是会话内衰减器，跨对话不应延续衰减
        // [v3.421.0] 六个缝合层产物键：值由上游库按当期运行时现算（退火温度、相变锁、
        //   图腾、封卷、时代传承都是「此刻状态」的函数），跨对话带上会被现算值直接覆盖，
        //   属于「带上=双写噪声」而非「不该丢」。理由必须**逐项**写在同一行：
        //   守卫 P3 只认行内注释，写在上方注释块里等于没写（实测五项因此判无理由）。
        'memoryAnnealingCurve',       // 退火温度由 adaptive-memory-annealing-curve 按本轮命中率现算，承接后立刻被覆盖
        'phaseTransitionSafeguard',   // 相变锁记的是「上一次跃迁」的相位差，新对话没有上一次
        'epilogueRetrospective',      // 人生回望由 lifeEpilogue 按当前档案重述，带上会与重述版双写
        'intergenerationalTotem',     // 图腾树是世代累积的函数产物，跨对话带上等于把上一部的族谱接进新故事
        'multiResolutionArchive',     // 多分辨率封卷按当前条目体量重分层，旧封卷在新故事里层级全错
        'epochalHeritage',            // 时代沉淀由 epochalHeritage 按当前纪元现算，纪元变了旧沉淀就不成立
        // 下列两键与携带面的既有键**同源异名**，重复携带会在承接时双写互相覆盖：
        // [v3.202] 下列两键与携带面既有键**同源异名**：既不进契约，也不新增承接分支——
        //   同时挂两条路会在同一真源上双写互相覆盖（v3.168 的种子同源判据把它抓了出来）。
        'diaries',            // = 携带面既有 'diary'（diary.export() 的结果同形）
        'status',             // 结构化全量；携带面既有 'statusFlat' 是 v2.3 定的携带形态
    ]);
    // [v3.140] CP: 存档结构版本（整数，只在顶层键语义变更时递增）+ 生产者插件版本（字符串）分离。
    // 存在理由：v3.138 的 _dataVersion 用 Number() 比较插件版本字符串恒得 NaN→0（判旧恒假），
    // 且 parseFloat('3.10')===3.1 与 '3.9' 无法区分大小。判旧改用 schemaVersion 整数 + compareVersion。
    const ARCHIVE_SCHEMA_VERSION = 1;
    function compareVersion(a, b) {
        const pa = String(a == null ? '' : a).split('.').map(x => parseInt(x, 10));
        const pb = String(b == null ? '' : b).split('.').map(x => parseInt(x, 10));
        const n = Math.max(pa.length, pb.length);
        for (let i = 0; i < n; i++) {
            const x = Number.isFinite(pa[i]) ? pa[i] : 0;
            const y = Number.isFinite(pb[i]) ? pb[i] : 0;
            if (x !== y) return x < y ? -1 : 1;
        }
        return 0;
    }

    // [v3.104] 存储状态指纹关注的字段（过滤 updatedAt/时间戳等噪声，只对语义内容敏感）
    const STORAGE_FP_FIELDS = ['graph', 'summaries', 'characters', 'items', 'status', 'timeline'];
    // [v3.147] API 凭据 401/403 冷却表 (credKey -> timestamp)
    const _credCooldowns = new Map();
    function _getCredKey(url, init, opts) {
        const key = opts?.apiKey || (init?.headers?.Authorization || init?.headers?.authorization || '').replace(/^Bearer\s+/i, '');
        return key ? hash32(String(url || '') + '|' + String(key)) : (url ? hash32(String(url)) : null);
    }
    function clearApiCooldowns() {
        _credCooldowns.clear();
    }
    function getApiCooldownStats() {
        const now = Date.now();
        const active = [];
        for (const [k, until] of _credCooldowns.entries()) {
            if (until > now) active.push({ key: k, remainingSec: Math.ceil((until - now) / 1000) });
        }
        return { totalCount: _credCooldowns.size, activeCount: active.length, active };
    }

    // [v3.1] SF1: 带超时+自动重试的 fetch（抄 baibai embed.ts——向量/LLM 上游常挂住不返回）
    // 分类重试：内部超时/网络异常/5xx/429 → 重试；4xx（鉴权/格式）→ 不重试直接返回交调用方；401/403 触发冷却
    async function fetchWithTimeoutRetry(url, init, opts) {
        // [v3.260.0 缝合 shujuku] opts.fetchImpl：传输实现注入口（取数面）。
        //   不传 = 直呼全局 fetch（与 v3.259.0 逐字一致，既有判据用 new Function('fetch', ...)
        //   把 mock 作为函数参数注入，本改动不破坏该抽取面）；传了 = 走注入实现
        //   （pristine-fetch.js 的原生绕包装取数，见 LLMCaller._fetchOpts）。
        const { timeoutSec = 30, retries = 2, label = 'API', externalSignal = null, cooldownSec = 1800, fetchImpl = null } = opts || {};
        const credKey = typeof _getCredKey === 'function' ? _getCredKey(url, init, opts) : null;
        if (credKey && _credCooldowns.has(credKey)) {
            const until = _credCooldowns.get(credKey);
            if (Date.now() < until) {
                const rem = Math.ceil((until - Date.now()) / 1000);
                throw new Error(`${label} 凭据在 401/403 冷却中 (剩余 ${rem}s)`);
            } else {
                _credCooldowns.delete(credKey);
            }
        }
        const maxAttempts = Math.max(1, 1 + Math.max(0, retries));
        let lastErr = null;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // [v3.2] DF2: 外部已取消（用户中止生成）→ 立即抛出，绝不重试
            if (externalSignal?.aborted) throw new Error(`${label} 已取消(外部中止)`);
            const ctrl = new AbortController();
            let timedOut = false;
            const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, Math.max(1000, timeoutSec * 1000));
            if (externalSignal) {
                try { externalSignal.addEventListener('abort', () => { if (!timedOut) ctrl.abort(); }, { once: true }); } catch (e) { errLog(e, 'nonfatal') }
            }
            try {
                const resp = await (fetchImpl || fetch)(url, { ...init, signal: ctrl.signal });
                clearTimeout(timer);
                if (resp.status === 401 || resp.status === 403) {
                    if (credKey) {
                        _credCooldowns.set(credKey, Date.now() + cooldownSec * 1000);
                        console.warn(`[${PLUGIN_NAME}] 捕获 ${label} API ${resp.status} 鉴权/权限错误，已对该凭据启动 ${cooldownSec}s 冷却防护`);
                    }
                }
                if ((resp.status >= 500 || resp.status === 429) && attempt < maxAttempts - 1) {
                    lastErr = new Error(`${label} API ${resp.status}`);
                    await new Promise(r => setTimeout(r, 800));
                    continue;
                }
                return resp;
            } catch (err) {
                clearTimeout(timer);
                // [v3.2] DF2: 取消来源区分——外部中止(AbortError 且非内部超时)绝不重试；内部超时/网络异常照旧重试
                if (!timedOut && err?.name === 'AbortError' && externalSignal?.aborted) throw new Error(`${label} 已取消(外部中止)`);
                if ((timedOut || err?.name === 'TypeError') && attempt < maxAttempts - 1) {
                    lastErr = err;
                    await new Promise(r => setTimeout(r, 800));
                    continue;
                }
                throw (lastErr || err);
            }
        }
        throw (lastErr || new Error(`${label} 重试耗尽`));
    }
    fetchWithTimeoutRetry.clearCooldowns = clearApiCooldowns;
    fetchWithTimeoutRetry.getCooldownStats = getApiCooldownStats;

    // [v3.1] SF4: 角色名归一化（抄 yuzuki character-name-matcher——NFKC+空白折叠，防跨楼身份分裂）
    function normalizeCharName(name) {
        try {
            return String(name || '').normalize('NFKC').replace(/\s+/g, '').trim().toLowerCase();
        } catch (e) { errLog(e, 'SF4.normalizeCharName'); return String(name || ''); }
    }

    // [v3.2] DF5: 注入槽位唯一写入通道——修复 v2.8 起 setExtensionPrompt 参数错位 bug。
    // ST 标准签名（权威源: shujuku @types/iframe/exported.sillytavern.d.ts + baibai inject.ts 抄 script.js:486）:
    //   setExtensionPrompt(prompt_id, content, position, depth, scan, role, filter)
    //   position: -1=不注入(绿灯用), 1=IN_CHAT; role: 0=system, 1=user, 2=assistant; scan: 是否加入绿灯扫描文本
    // 旧调用 (key, content, depth, true, 4) 令配置深度落进 position 位、true 落进 depth 位、4 落进 scan 位——
    // "D0/D1/D2 深度配置"从未真正生效（position 收到 0/1/2，D2 时为非法值）。收敛到本通道后，格式错位在结构上不可能再发生。
    const INJECT_POSITION_IN_CHAT = 1;
    const INJECT_ROLE_SYSTEM = 0;
    // [v3.128] 槽位清单化（baibai LEGACY 清空模式）：所有曾被写过的 prompt_id 都留在清单里，
    // 未来槽位改名/废弃时把旧 key 追加进来即可——clearInjectSlots 对旧 key 注空串，防跨版本残留注入。
    const INJECT_SLOTS = [
        { key: 'lonsha_memory', clearDepth: 0 },
        { key: 'lonsha_memory_history', clearDepth: 9999 },
    ];
    function writeInjectSlot(key, content, depth) {
        try {
            const c = window.SillyTavern?.getContext?.();
            if (typeof c?.setExtensionPrompt !== 'function') return false;
            c.setExtensionPrompt(String(key), String(content || ''), INJECT_POSITION_IN_CHAT, Math.max(0, Math.round(Number(depth) || 0)), false, INJECT_ROLE_SYSTEM, null);
            return true;
        } catch (e) { errLog(e, 'DF5.writeInjectSlot'); return false; }
    }
    function clearInjectSlots() {
        for (const slot of INJECT_SLOTS) writeInjectSlot(slot.key, '', slot.clearDepth);
    }
    /* [v3.300.0 M-O2] ★★ extra_js **模块清单**的真装载器。
     *
     * 【修前实测（SillyTavern 1.19.0 真浏览器 + 真宿主，取证见 tests/audit/host-reality.json）】
     *   宿主 `public/scripts/extensions.js#addExtensionScript` 只加载 `manifest.js`（= 入口 index.js），
     *   `manifest.extra_js` 字段**宿主全仓零消费**。于是：
     *     · 浏览器全局里本仓模块 **0 个**（实测 window 上只有 LonShaMemory / lonsha_memory_bridge_v1 /
     *       lonsha_memory_interceptor 三项，全是入口自己挂的）；
     *     · `_moduleLib` 的 require 回落把 **88 个模块各当 CJS 求值一次**，而各模块的全局挂载行
     *       （`root.LonShaXxx = api`）在 `typeof window !== 'undefined'` 下**不成立** ⇒
     *       require 回来的对象是空 api：88 份内存与解析开销换回来一个都不挂；
     *     · 后果：LonShaFactState / LonShaMemoryType / LonShaUnifiedRecall … 全部缺席，
     *       近几版新接的机制在真宿主上**恒不生效**，而文档把它读成「装载面 88 模块」。
     *
     * 【为什么只挂清单、不 eval 内容（两条不可让步的理由）】
     *   ① 清单是**行为契约**（本仓已定性两次）：模块会挂全局、会读邻居全局。把清单当数据吃掉，
     *      等于换掉模块语义 —— 本版就变成「换了实现的版本」而不是「修复的版本」；
     *   ② 自带解析器求值 = 宿主侧的**第二套模块系统**（解析器漂移、与未来 import 语义分歧）。
     *   故走**浏览器原生解析器**：真 `<script src>`（module 型，与宿主加载入口同形态）。
     *
     * 【三态与幂等】status = ok / partial / unavailable（缺席如实可见，不静默降级）；
     *   幂等：清单只读一次、同一 URL 只注入一次（重复调用直接返回上次读数）。
     */
    /* 入口脚本自身的 src：**脚本求值那一刻**取（classic script 下 currentScript 有效；
     *   module 脚本下为 null，此时靠 _extraJsBaseDir 的候选扫描 + manifest 反证）。 */
    const _LOADED_SRC = (() => { try { return (document.currentScript && document.currentScript.src) || ''; } catch (e) { return ''; } })();
    /* 清单项必须是**裸文件名**：只允许 [A-Za-z0-9._-]+.js，挡掉 `../`、绝对 URL、查询串。
     *   为什么不用 URL 拼接来做这件事：`new URL('../x', base)` 会**悄悄跳出**插件目录，
     *   而这里要的是「拒绝」而不是「解析出来一个能用的地址」。 */
    const EXTRA_JS_FILE_RE = /^[A-Za-z0-9._-]+\.js$/;
    /** 本插件 extra_js 的装载读数（**绝不静默**：谁没装上、为什么，都要能读出来）。 */
    const _extraJsLoad = { status: 'idle', started: false, okCount: 0, triedCount: 0, fail: [], at: null };
    function extraJsLoadReport() { return Object.assign({}, _extraJsLoad, { fail: _extraJsLoad.fail.slice() }); }
    /** 推导本插件的 base 目录。**不写死仓库名 / 用户名**：候选来自宿主实际注入的 script 标签，
     *  逐个用 `manifest.json` **反证**（display_name 必须是本插件）——取不到即如实 unavailable，
     *  不猜路径、不退到任何 CDN。 */
    async function _extraJsBaseDir() {
        try {
            const cands = [];
            if (_LOADED_SRC) cands.push(_LOADED_SRC);
            for (const s of Array.from(document.querySelectorAll('script[src]'))) {
                const u = String(s.src || '');
                if (/index\.js$/.test(u) && cands.indexOf(u) < 0) cands.push(u);
            }
            /* 含本插件名的候选优先（真宿主下路径形如 .../third-party/lonsha-memory-plugin/index.js） */
            cands.sort((a, b) => (/lonsha-memory-plugin/.test(b) ? 1 : 0) - (/lonsha-memory-plugin/.test(a) ? 1 : 0));
            for (const u of cands) {
                const base = String(u).replace(/index\.js.*$/, '');
                try {
                    const r = await fetch(base + 'manifest.json', { cache: 'no-store' });
                    if (!r.ok) continue;
                    const mf = await r.json();
                    if (mf && typeof mf.display_name === 'string' && /LonSha/i.test(mf.display_name) && Array.isArray(mf.extra_js)) return base;
                } catch (_e) { /* 换个候选继续反证 */ }
            }
            return '';
        } catch (e) { return ''; }
    }
    /** 注入一个 extra_js 模块（浏览器原生解析器；失败即 reject，**不吞**）。 */
    function loadExtraJsScript(url) {
        return new Promise((resolve, reject) => {
            try {
                const s = document.createElement('script');
                s.type = 'module';
                s.src = url;
                s.onload = () => resolve(true);
                s.onerror = () => reject(new Error('script-error'));
                document.head.appendChild(s);
            } catch (e) { reject(e); }
        });
    }
    /** 幂等入口：清单只读一次、注入只做一次，第二次直接回上次读数。 */
    async function ensureExtraJsOnce() {
        if (_extraJsLoad.started) return extraJsLoadReport();
        _extraJsLoad.started = true;
        _extraJsLoad.status = 'unavailable';
        _extraJsLoad.at = Date.now();
        try {
            const base = await _extraJsBaseDir();
            if (!base) { _extraJsLoad.fail.push({ file: '(base)', why: 'base-unresolved' }); return extraJsLoadReport(); }
            const mf = await fetch(base + 'manifest.json', { cache: 'no-store' }).then((r) => r.json());
            const list = (mf && Array.isArray(mf.extra_js)) ? mf.extra_js.slice() : null;
            if (!list) { _extraJsLoad.fail.push({ file: '(manifest)', why: 'extra_js-missing' }); return extraJsLoadReport(); }
            const unsafe = list.filter((f) => typeof f !== 'string' || !EXTRA_JS_FILE_RE.test(f));
            if (unsafe.length) { _extraJsLoad.fail.push({ file: '(manifest)', why: 'unsafe-entry:' + String(unsafe[0]).slice(0, 60) }); return extraJsLoadReport(); }
            const seen = new Set(Array.from(document.scripts || []).map((s) => s.src));
            const results = [];
            for (const f of list) {
                const url = base + f;
                _extraJsLoad.triedCount++;
                if (seen.has(url)) { results.push({ ok: true, file: f, why: 'already' }); continue; }
                try { await loadExtraJsScript(url); seen.add(url); results.push({ ok: true, file: f, why: 'loaded' }); }
                catch (e) { results.push({ ok: false, file: f, why: String((e && e.message) || e) }); }
            }
            _extraJsLoad.okCount = results.filter((r) => r.ok).length;
            _extraJsLoad.fail = results.filter((r) => !r.ok);
            /* 三态互斥：全成 ok / 部分 partial / 一个没成 unavailable（**不得**把 partial 读成 ok）。 */
            _extraJsLoad.status = (results.length && _extraJsLoad.okCount === results.length) ? 'ok'
                : (_extraJsLoad.okCount > 0 ? 'partial' : 'unavailable');
        } catch (e) {
            _extraJsLoad.fail.push({ file: '(load)', why: String((e && e.message) || e) });
        }
        return extraJsLoadReport();
    }

    // [v3.128] token 量级估算（baibai bytes/3.35 口径 + CJK 感知）：中文 UTF-8 每字 3 字节 ≈ 0.9 token，
    // ASCII/数字约 4 字符 1 token。此前引擎仅在 PrequelSystem 内用 chars/4 的乐观口径，对中文正文低估约 3.5 倍。
    function estimateTextTokens(text) {
        const s = String(text || '');
        if (!s) return 0;
        let cjk = 0;
        for (let i = 0; i < s.length; i++) {
            const c = s.codePointAt(i);
            if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x3400 && c <= 0x4dbf) || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xf900 && c <= 0xfaff)) cjk++;
        }
        const rest = s.length - cjk;
        return Math.max(1, Math.ceil(cjk * 0.9 + rest / 4));
    }
    // [v3.3] 台账重放化：楼层指纹（位置无关的消息身份）——编辑/swipe/删楼后对账用。
    // 范式: baibai 叶子 leafValid（失效≠删除）+ yuzuki getMessageSignature（role|swipe|hash|gen）。
    // 与楼层号解耦: 删楼后消息前移，指纹仍能重新定位（自愈）；翻 swipe 时 swipe 段变化（失活/复活）。
    function hash32(str) {
        let h = 0x811c9dc5;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
        return (h >>> 0).toString(16).padStart(8, '0');
    }
    function msgTextOf(m) {
        try {
            const sw = Math.max(0, Math.round(Number(m?.swipe_id) || 0));
            if (Array.isArray(m?.swipes) && typeof m.swipes[sw] === 'string') return m.swipes[sw];
            return String(m?.mes || m?.content || m?.text || '');
        } catch (e) { return ''; }
    }
    function msgFpOf(m) {
        try {
            return [(m?.is_user === true || m?.role === 'user') ? 'u' : 'a', Math.max(0, Math.round(Number(m?.swipe_id) || 0)), hash32(msgTextOf(m)), String(m?.send_date || m?.extra?.send_date || '')].join('|');
        } catch (e) { errLog(e, 'V33.msgFpOf'); return ''; }
    }

    // [v3.13] 思维链/正文分流
    // [v3.45] 吸收 shujuku lenient-text: 扩展主流推理标签 (think/thinking/thought/reasoning/analysis)
    // 并在未闭合截断时引入宽容熔断器，剥离开标签、保护真实正文不被吞没白屏
    function extractThinkingChain(text) {
        try {
            let s = String(text || '');
            if (!s) return { content: '', thinking: '' };
            const thinkingParts = [];
            const fenceMask = [];
            // 先遮罩 ``` 围栏，防止剥掉代码示例里的推理标签
            s = s.replace(/```[\s\S]*?```/g, (m) => { fenceMask.push(m); return '\u0000F' + (fenceMask.length - 1) + '\u0000'; });
            
            // [v3.45] 扩展支持 think|thinking|thought|reasoning|analysis 5类推理标签
            let out = '', depth = 0, buf = '';
            const tokens = s.split(/(<\/?(?:think|thinking|thought|reasoning|analysis)\b[^>]*>)/i);
            for (const tk of tokens) {
                if (/^<(?:think|thinking|thought|reasoning|analysis)\b[^>]*>$/i.test(tk)) {
                    if (depth === 0) buf = '';
                    depth++;
                } else if (/^<\/(?:think|thinking|thought|reasoning|analysis)\s*>$/i.test(tk)) {
                    depth--;
                    if (depth <= 0) {
                        if (buf && buf.trim()) thinkingParts.push(buf.trim());
                        buf = '';
                        depth = 0;
                    } else if (buf) {
                        buf += tk;
                    }
                } else if (depth > 0) {
                    buf += tk;
                } else {
                    out += tk;
                }
            }
            // [v3.45] 宽容熔断器 (shujuku lenient-text): 处理未闭合标签
            if (depth > 0 && buf) {
                const switchMatch = buf.match(/\n\s*\n(?=[\u4e00-\u9fa5A-Za-z0-9"'#*[{`])/);
                if (switchMatch) {
                    const thinkContent = buf.slice(0, switchMatch.index).trim();
                    const bodyContent = buf.slice(switchMatch.index).trim();
                    if (thinkContent) thinkingParts.push(thinkContent);
                    out += (out ? '\n\n' : '') + bodyContent;
                } else {
                    // 纯思考且截断
                    if (buf.trim()) thinkingParts.push(buf.trim());
                }
            }

            // 清理剥离后残留的空标签与多余空行，还原围栏
            out = out.replace(/<\/?(?:think|thinking|thought|reasoning|analysis)\b[^>]*>/gi, '').replace(/\n{3,}/g, '\n\n').trim();
            out = out.replace(/\u0000F(\d+)\u0000/g, (_, i) => fenceMask[Number(i)] || '');
            return {
                content: out,
                thinking: thinkingParts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
            };
        } catch (e) { errLog(e, 'V313.extractThinkingChain'); return { content: String(text || ''), thinking: '' }; }
    }
    // [v3.13] 思维链投递头框定（抄 zhino 锚点构造——防草稿被下游当已发生事实）
    function thinkingAnchorHeader() {
        return '【思维链·场外信号（仅供检索参考，其中构思/模拟/内心独白段落尚未发生，严禁当作剧情事实写入摘要/时间线/图谱）】';
    }
    // [v3.27] <synopsis> 轻量提取（AnchorNote）: AI 回复已带 synopsis 标签时正则直取做摘要，省一次 LLM 调用
    const SYNOPSIS_BLOCK_RE = /(?:^|\n)\s*<synopsis\b[^>]*>\s*\n?([\s\S]*?)\n?\s*<\/synopsis>\s*(?=\n|$)/i;
    function extractSynopsisFast(text) {
        try {
            const s = String(text || '');
            const m = s.match(SYNOPSIS_BLOCK_RE);
            if (!m) return null;
            const content = String(m[1] || '').trim();
            if (!content || content.length < 12) return null;
            // 剥掉内层子标签（Nub/Title 等），只保留正文概括
            return content.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
        } catch (e) { return null; }
    }

    // [v3.33] AI 主动记忆操作符解析（st-memory-enhancement AI 编辑表格理念轻量版）：从回复原文提取 <field>/<todo>/<item> 标签并转为结构化操作，供后端 applyChanges/addTodos/itemOps 直接纳入。能力与主线 LLM 提取互补（主动写高置信覆盖，被动提取保底全量）
    function extractMemoryOpsFromText(text) {
        try {
            const out = { changes: [], todos: [], items: [] };
            const src = String(text || '');
            if (!src.includes('<')) return out;
            const re = /<(field|todo|item)\s*:\s*([^>]+?)>\s*/gi;
            let m;
            while ((m = re.exec(src)) && out.changes.length + out.todos.length + out.items.length < 30) {
                const kind = m[1].toLowerCase();
                const body = String(m[2] || '').trim();
                if (!body) continue;
                if (kind === 'field') {
                    // <field:角色.字段=值或增量>
                    const eq = body.indexOf('=');
                    if (eq < 1) continue;
                    const lhs = body.slice(0, eq).trim();
                    const val = body.slice(eq + 1).trim();
                    if (!val) continue;
                    const dot = lhs.indexOf('.');
                    if (dot < 1) continue;
                    const character = lhs.slice(0, dot).trim();
                    const field = lhs.slice(dot + 1).trim();
                    if (!character || !field) continue;
                    const chg = { character, field };
                    if (/^[+-]\d+([.]\d+)?$/.test(val)) chg.delta = Number(val);
                    else chg.value = val;
                    out.changes.push(chg);
                } else if (kind === 'todo') {
                    // <todo:角色.事项|日期>
                    const bar = body.indexOf('|');
                    const lhs = bar > 0 ? body.slice(0, bar) : body;
                    const dot = lhs.indexOf('.');
                    const character = (dot > 0 ? lhs.slice(0, dot) : lhs).trim();
                    const text = (dot > 0 ? lhs.slice(dot + 1) : '').trim();
                    const date = bar > 0 ? body.slice(bar + 1).trim() : '';
                    if (!character || !text) continue;
                    out.todos.push({ character, text, date });
                } else if (kind === 'item') {
                    // <item:取得=角色.物品名|描述> 或 <item:失去=角色.物品名>
                    const eq = body.indexOf('=');
                    if (eq < 1) continue;
                    const action = body.slice(0, eq).trim();
                    const rest = body.slice(eq + 1).trim();
                    const dot = rest.indexOf('.');
                    if (dot < 1) continue;
                    const holder = rest.slice(0, dot).trim();
                    const rest2 = rest.slice(dot + 1);
                    const bar = rest2.indexOf('|');
                    const name = (bar > 0 ? rest2.slice(0, bar) : rest2).trim();
                    const desc = bar > 0 ? rest2.slice(bar + 1).trim() : '';
                    if (!holder || !name) continue;
                    out.items.push({ action: action === '失去' ? 'update' : 'add', name, desc, holder, state: action === '失去' ? '丢失' : '' });
                }
            }
            return out;
        } catch (e) { return { changes: [], todos: [], items: [] }; }
    }
    // [v3.43] 吸收 baibai: NPC 四档压平分级注入与性别铁律
    function buildNpcTierInjection(npcs = []) {
        if (!Array.isArray(npcs)) return [];
        const oneLine = (value) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        const out = [];
        for (const npc of npcs) {
            if (!npc || !String(npc.name || '').trim()) continue;
            const name = oneLine(npc.name);
            const gender = npc.gender ? `[性别:${oneLine(npc.gender)}]` : '';
            const tier = npc.roleTier || (npc.isImportant ? 'important' : npc.isPresent ? 'present' : 'absent');
            if (tier === 'important') {
                const fields = Array.isArray(npc.fields) ? npc.fields.map(x => Array.isArray(x) ? `${oneLine(x[0])}:${oneLine(x[1])}` : '').filter(Boolean).join(' | ') : '';
                const todos = Array.isArray(npc.todos) ? npc.todos.map(x => oneLine(x?.text || x?.content)).filter(Boolean).join('、') : '';
                out.push(oneLine(`- ${name}${gender}${npc.title ? `（${oneLine(npc.title)}）` : ''}${fields ? ` — ${fields}` : ''}${todos ? `；待办:${todos}` : ''}${npc.persona ? `；当前人设:${oneLine(npc.persona)}` : ''}`));
            } else if (tier === 'present') {
                const fields = Array.isArray(npc.fields) ? npc.fields.map(x => Array.isArray(x) ? `${oneLine(x[0])}:${oneLine(x[1])}` : '').filter(Boolean).join(' | ') : '';
                out.push(oneLine(`- ${name}${gender}${npc.now ? ` 当前姿态:${oneLine(npc.now)}` : ''}${fields ? ` — ${fields}` : ''}${npc.persona ? `；当前人设:${oneLine(npc.persona)}` : ''}`));
            } else if (tier === 'same_area') {
                const traits = Array.isArray(npc.traits) ? npc.traits.map(oneLine).filter(Boolean).slice(0, 3).join('、') : '';
                out.push(oneLine(`- ${name}${gender}${npc.identity ? `（${oneLine(npc.identity)}）` : ''}${traits ? ` — 性格:${traits}` : ''}`));
            } else {
                const relationHead = oneLine(npc.relation || '').split(/[，,]/)[0].slice(0, 12);
                const identity = oneLine(npc.title || npc.identity || '');
                out.push(oneLine(`- ${name}${gender}${relationHead ? ` 称谓:${relationHead}` : ''}${identity ? ` 身份:${identity}` : ''}`));
            }
        }
        return out;
    }
    // [v3.43] end NPC tier injection
    // [v3.45] 吸收 baibai: NPC 长期社会人伦羁绊网（血缘/婚姻/主仆/宿敌，不因不在场而失效）
    function fmtNpcTiesContext(npcs) {
        if (!Array.isArray(npcs) || !npcs.length) return '';
        const oneLine = (value) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        const relationKey = (value) => String(value || '').toLowerCase().replace(/[；;]/g, ';').replace(/\s+/g, ' ').trim();
        const grouped = new Map();
        for (const npc of npcs) {
            const name = oneLine(npc?.name);
            const rawTies = Array.isArray(npc?.ties) ? npc.ties.join(';') : oneLine(npc?.ties);
            if (!name || !rawTies) continue;

            const nameKey = name.toLowerCase();
            let entry = grouped.get(nameKey);
            if (!entry) {
                entry = { name, ties: [], seen: new Set() };
                grouped.set(nameKey, entry);
            }
            for (const tie of rawTies.split(/[；;]/).map(one => one.trim()).filter(Boolean)) {
                const tieKey = relationKey(tie);
                if (entry.seen.has(tieKey)) continue;
                entry.seen.add(tieKey);
                entry.ties.push(tie);
            }
        }

        const rows = [...grouped.values()]
            .filter(entry => entry.ties.length > 0)
            .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
            .map(entry => `- ${entry.name}：${entry.ties.join('；')}`);
        return rows.length ? `[角色长期关系网]（血缘/婚姻/主仆/宿敌等，不因是否在场而失效）：\n${rows.join('\n')}` : '';
    }
    // [v3.48] 吸收 yuzuki: 关系五分类学（family/intimate/hostile/social/other 正则分类）
    function classifyRelationshipType(relation) {
        try {
            const value = String(relation || '');
            if (!value) return 'other';
            if (/(师父|师母|师傅|干爹|干妈|义父|义母)/.test(value)) return 'social';  // [v3.48] 「师父」含「父」字，必须先于 family 判定
            if (/(父|母|兄|弟|姐|妹|祖|孙|叔|伯|姑|姨|舅|侄|甥|亲属|亲戚|家人|家族|养父|养母|继父|继母|异母|异父|血缘|血亲)/.test(value)) return 'family';
            if (/(恋|爱|婚|夫|妻|情侣|伴侣|未婚|情人|暗恋|亲密|前任|暧昧|床)/.test(value)) return 'intimate';
            if (/(敌|仇|宿敌|竞争|对手|冲突|敌对|嫌疑|警惕|背叛|出卖)/.test(value)) return 'hostile';
            if (/(同事|同学|朋友|好友|上司|下属|老师|学生|师父|徒弟|合作|盟友|搭档|邻居|校友|秘书|助理|雇主|雇员|主仆|仆人|侍女)/.test(value)) return 'social';
            return 'other';
        } catch (e) { return 'other'; }
    }
    // [v3.48] 吸收 yuzuki + 配合 v3.45 羁绊网: 伦理冲突检测（family × intimate 交叉即告警）
    function detectEthicsConflict(fromName, toName, relationType, existingTies) {
        try {
            const cls = classifyRelationshipType(relationType);
            const bloodRe = /(父|母|兄|弟|姐|妹|祖|孙|叔|伯|姑|姨|舅|侄|甥|血缘|血亲|亲生|兄妹|姐弟|兄弟|姐妹|父子|父女|母子|母女)/;
            const bidirectionalRe = /(兄妹|姐弟|兄弟|姐妹|父子|父女|母子|母女|祖孙|血缘|血亲)/;
            if (cls !== 'intimate') return null;
            // 检查两人之间是否已有 family 类羁绊（血缘/婚姻）
            const key = normalizeCharName(toName);
            for (const tie of (existingTies || [])) {
                const tName = normalizeCharName(tie?.name || '');
                if (tName !== key) continue;
                const ties = Array.isArray(tie?.ties) ? tie.ties.join(';') : String(tie?.ties || '');
                // [v3.53] P14b 逐条判定修复：join(';') 后 includes(fromName) 会把「林一:朋友」误判为
                // 林一的血亲证据（名字出现在朋友关系的 tie 里）。改为逐条 tie：
                // 命中 = 该条 tie 同时含 from 名与血缘词，或该条 tie 含双向血缘词（兄妹/父子等）
                const bloodRe = /(父|母|兄|弟|姐|妹|祖|孙|叔|伯|姑|姨|舅|侄|甥|血缘|血亲|亲生|兄妹|姐弟|兄弟|姐妹|父子|父女|母子|母女)/;
                const hitTie = ties.split(';').find(t => {
                    const hasBlood = bloodRe.test(t);
                    if (!hasBlood) return false;
                    return t.includes(fromName) || bidirectionalRe.test(t);
                });
                if (hitTie) {
                    return { from: fromName, to: toName, relation: relationType, tie: hitTie };
                }
            }
            return null;
        } catch (e) { return null; }
    }

    // [v3.41] 吸收 Stitches 工业级标签净化: 剥除思维链、多智能体协调与中间跑团标签，保护正文不被污染
    function stripMemoryOpsTags(text) {
        try {
            let s = String(text || '');
            // 1. 过滤 Stitches / RebornV 及复杂跑团中间成对块标签
            s = s.replace(/<(recall|dm_plan|dm_set|plan|inner|act|npcs|file|scene|dm_story|dm_track|npc_track|npc_jump|disclaimer|JSONPatch|Analysis|UpdateVariable|tucao|StatusPlaceHolderImpl|summary|options|thinking|think|thought|reasoning|analysis|review|refine|itsuki|output)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
            // 2. 过滤单操作符与时间物理标签
            s = s.replace(/<\/?(field|todo|item|time|date|bbs_time)\s*:[^>]*?>/gi, '');
            return s.trim();
        } catch (e) { return text; }
    }
    const stripInternalTags = stripMemoryOpsTags;
    // [v3.37] 提取正文中的物理时间标签锚点（抄 baibai 正文时间锚点理念，零API同步）
    function extractTimeTagFast(text) {
        try {
            const s = String(text || '');
            if (!s.includes('<')) return null;
            const m = /<(?:time|date|bbs_time)\s*:\s*([^>]+?)>/i.exec(s);
            if (m && m[1]) {
                const rawTime = m[1].trim();
                if (rawTime.length >= 2 && rawTime.length <= 40) return rawTime;
            }
            return null;
        } catch (e) { return null; }
    }

    // [v3.0] SD: 错误记录器——环形缓冲存最近50条，替代静默吞错。诊断面板读取展示。
    const _errBuf = [];
    // [v3.18] 错误提示规则库（shujuku: 43条精简版）
    // [v3.36] 升级为结构化人话诊断矩阵（包含原因诊断与具体可操作建议）
    const _ERROR_HINTS = [
        // [api-auth] 鉴权与配额
        { re: /401|Unauthorized|invalid.*api.*key|api key.*invalid/i, title: 'API Key 无效', reason: '密钥错误、被撤销或未配置。', action: '前往设置检查 API Key 与端点地址是否匹配。' },
        { re: /403|Forbidden|permission denied/i, title: '访问受限', reason: '当前 Key 缺少该模型权限或账户被封禁。', action: '检查账户权限或切换具有权限的模型。' },
        { re: /insufficient_quota|quota exceeded|billing|balance/i, title: '额度耗尽', reason: 'API 提供商账户余额用尽或免费额度已过期。', action: '前往服务商控制台充值，或更换有效服务商。' },
        { re: /429|Too Many Requests|rate limit|quota/i, title: '触发频控限流', reason: '短时间内调用频率过高。', action: '稍等片刻重试，或调大并发间隔时间。' },
        
        // [api-model] 模型与上下文
        { re: /404|not found|The model .* does not exist/i, title: '模型不存在', reason: '服务商端点未找到填写的模型名。', action: '在设置中核对模型名称拼写（如区分-preview/-latest）。' },
        { re: /context_length_exceeded|maximum context length|too many tokens|max_tokens/i, title: '上下文超限', reason: '单次提示词总 Token 超出了模型支持的上下文窗口。', action: '在设置中降低记忆注入预算，或开启归档隐藏已折叠楼层。' },
        { re: /content_filter|sensitive|safety|policy violation/i, title: '内容安全拦截', reason: '剧情内容触发了提供商的敏感词安全审查。', action: '适当调整角色台词/剧情道白，或更换审查宽松的模型。' },

        // [network] 网络通信
        { re: /Failed to fetch|NetworkError|network error|fetch failed|ECONNREFUSED|ENOTFOUND/i, title: '网络不通（连接失败）', reason: '无法连接到指定的 API 目标地址。', action: '检查设备是否联网、代理软件是否放行或域名是否拼写错误。' },
        { re: /timeout|timed out|ETIMEDOUT|aborted/i, title: '请求超时', reason: '上游服务器在限定时间内未完成响应。', action: '检查网络延迟，或在设置中加大提取/向量超时上限。' },
        { re: /CORS|cross.origin|Access-Control-Allow/i, title: '跨域访问受限', reason: '浏览器禁止网页直接跨域调用该私有或公网端点。', action: '配置反向代理（如酒馆内置代理）或在服务端放行 CORS。' },
        { re: /5\d\d|Internal Server Error|Bad Gateway|Service Unavailable/i, title: '上游服务器异常', reason: 'API 服务商内部服务故障或宕机。', action: '通常为服务商短暂波动，稍作等待后重试。' },

        // [storage] 本地存储
        { re: /QuotaExceeded|quota exceeded|exceeded.*storage/i, title: '浏览器存储满', reason: '当前源的 localStorage 或 IndexedDB 配额已耗尽。', action: '导出聊天记录后清理多余历史，或精简非必要插件缓存。' },
        { re: /IndexedDB|indexedDB.*error|object store|SecurityError/i, title: '数据库/权限受限', reason: '浏览器隐私模式或无痕模式限制了本地持久化。', action: '关闭隐私无痕模式，或通过顶部菜单执行快照恢复。' },

        // [runtime] 数据与宿主
        { re: /Unexpected token.*JSON|JSON\.parse|Unexpected end of JSON/i, title: 'JSON 格式破损', reason: 'LLM 未按约束输出标准 JSON（夹带了解释文本或未转义引号）。', action: '插件已自动安全兜底；若持续出现建议更换指令遵循能力更强的模型。' },
        { re: /setExtensionPrompt|getContext/i, title: '酒馆接口未就绪', reason: 'SillyTavern 核心接口未就绪或被第三方扩展拦截。', action: '刷新酒馆页面，并确认 SillyTavern 版本 >= 1.12.0。' },
        { re: /undefined is not|Cannot read propert|is not a function/i, title: '内部引用空指针', reason: '运行时数据字段缺失（多见于跨大版本旧档）。', action: '建议在设置面板点击【一键自愈】或重新导入最新备份。' },
        { re: /RangeError|Maximum call stack|out of memory/i, title: '内存/调用栈溢出', reason: '记忆链路循环递归或超大单体文本撑爆内存。', action: '降低检索条数上限，减少单楼正文字符数。' }
    ];
    // [v3.18] JSON sanitizer（shujuku/baibai）: 全角引号归一 + 未转义引号修复
    // [v3.44] 吸收 shujuku: 字符流状态机 JSON 容错解析器 (Robust Stream Sanitizer)
    function sanitizeJson(raw) {
        try {
            if (!raw) return '';
            let s = String(raw).trim();
            if (!s) return '';

            // 1. 全角引号与全角标点归一化
            s = s.replace(/[\u201c\u201d\u201e\u300c\u300d]/g, '"')
                 .replace(/[\u2018\u2019]/g, "'")
                 .replace(/\uff0c/g, ',')
                 .replace(/\uff1a/g, ':')
                 .replace(/\uff1b/g, ';');
            // 单引号键值向双引号转换（保护 don't, it's 等字母间缩写）
            s = s.replace(/([a-zA-Z])'([a-zA-Z])/g, '$1__APOSTROPHE__$2')
                 .replace(/'/g, '"')
                 .replace(/__APOSTROPHE__/g, "'");

            // 2. 剥离外层闲聊废话与 Markdown 围栏
            const firstObj = s.indexOf('{');
            const firstArr = s.indexOf('[');
            let startIdx = -1;
            let isArray = false;
            if (firstObj !== -1 && firstArr !== -1) {
                if (firstObj < firstArr) { startIdx = firstObj; isArray = false; }
                else { startIdx = firstArr; isArray = true; }
            } else if (firstObj !== -1) {
                startIdx = firstObj; isArray = false;
            } else if (firstArr !== -1) {
                startIdx = firstArr; isArray = true;
            }

            if (startIdx === -1) {
                return s.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
            }

            const endToken = isArray ? ']' : '}';
            const endIdx = s.lastIndexOf(endToken);
            if (endIdx > startIdx) {
                s = s.slice(startIdx, endIdx + 1);
            } else {
                s = s.slice(startIdx);
            }

            // 3. 字符流状态机：修复未转义双引号与字符串内部裸引号
            let out = '';
            let inString = false;
            let escaped = false;
            for (let i = 0; i < s.length; i++) {
                const ch = s[i];
                if (escaped) {
                    out += ch;
                    escaped = false;
                    continue;
                }
                if (ch === '\\') {
                    out += ch;
                    escaped = true;
                    continue;
                }
                if (ch === '"') {
                    if (!inString) {
                        inString = true;
                        out += ch;
                    } else {
                        // 前瞻下一个非空白字符
                        let nextNonSpace = '';
                        for (let j = i + 1; j < s.length; j++) {
                            const nc = s[j];
                            if (nc !== ' ' && nc !== '\t' && nc !== '\r' && nc !== '\n') {
                                nextNonSpace = nc;
                                break;
                            }
                        }
                        if (!nextNonSpace || nextNonSpace === ',' || nextNonSpace === ':' || nextNonSpace === '}' || nextNonSpace === ']') {
                            inString = false;
                            out += ch;
                        } else {
                            out += '\\"';
                        }
                    }
                } else {
                    out += ch;
                }
            }

            // 4. 清除对象/数组尾部多余的逗号（悬挂逗号：, } 或 , ]）
            out = out.replace(/,\s*([}\]])/g, '$1');

            // 5. 修复未加引号的纯英文字母对象键（如 { name: "value" } -> { "name": "value" }）
            out = out.replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":');

            return out.trim();
        } catch (e) {
            return String(raw || '').trim();
        }
    }
    function safeJsonParse(raw, fallback = null) {
        if (!raw) return fallback;
        try {
            return JSON.parse(raw);
        } catch (_) {
            try {
                return JSON.parse(sanitizeJson(raw));
            } catch (e) {
                return fallback;
            }
        }
    }
    function hintForError(err) {
        const msg = String(err?.message || err || '').slice(0, 300);
        for (const h of _ERROR_HINTS) {
            if (h.re.test(msg)) {
                return `【${h.title}】${h.reason} 建议：${h.action}`;
            }
        }
        return '【未知错误】未命中已知错误模式。建议复制错误日志反馈给插件作者。';
    }
    // [v3.18] 错误提示规则库附加到 errLog 记录中
    function errLog(err, tag) {
        try {
            _errBuf.push({
                t: Date.now(),
                tag: String(tag || ''),
                msg: String(err?.message || err || ''),
                hint: hintForError(err),   // [v3.18] 人话提示（shujuku 错误规则库）
                stack: String(err?.stack || '').split('\n').slice(0, 3).join(' | ')
            });
            if (_errBuf.length > 50) _errBuf.shift();
            if (window.LonShaMemory?.engine?.config?.config?.debugMode) console.warn(`[${PLUGIN_NAME}][${tag}]`, err);
        } catch (e2) {
            // 错误记录器自身不可再递归调用自己；否则存储/格式化异常会形成无限递归。
            try { console.warn(`[${PLUGIN_NAME}][errLog]`, e2); } catch (_) { /* 最后一道容灾 */ }
        }
    }
    
    // [v3.156] 零值语义安全回退。
    //   存在理由：settings-ui.js 中 10 个数值键的滑杆 min="0"，即「0」是用户可选的合法意图
    //   （0=每楼写日记 / 0=关闭回响池 / 0=不限制每楼操作 / 0=纯图谱...）。
    //   旧写法 `Number(x) || fallback` 用 falsy 判定缺失，会把 0 静默当成「没配置」回退到默认值，
    //   于是「设 0」在 UI 上可见、在引擎里永不可达。本函数只对真正的缺失值(undefined/null/''/NaN/布尔)回退。
    function numOr(v, fallback) {
        // [v3.224.0] O-2：`typeof v === 'object'` 一并回退。修前只挡布尔/空串/null/undefined，
        //   而 `Number([]) === 0`、`Number([5]) === 5` —— 宿主删楼事件把 `messageId` 传成数组时，
        //   本函数会把「没给」读成第 0 楼（而 0 是合法楼层，两者处置相反）。
        if (v === undefined || v === null || v === '' || typeof v === 'boolean' || typeof v === 'object') return fallback;
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    }
    // [v3.166] 配置默认值模板 —— 迁移分支的唯一真源。
    //   存在理由：loadConfig 的三个迁移分支原写 `new (this.constructor)()` 取默认值，
    //   而构造函数自己会调 loadConfig。迁移条件一旦成立就自我递归，靠栈溢出（RangeError）
    //   才收敛（实测同一实例被构造 2503 次 / 37ms）。把默认值快照提到类外后，
    //   迁移只读模板、绝不再构造实例，收敛依据从「异常兜底」变回「值改对了」。
    let _configDefaultsTemplate = null;
    // [v3.211] 迁移用锚点串（**必须放在类体外**）。
    //   存在理由：迁移分支里若内联写一段含花括号的 JSON 字面量（如 `"x":[...]}`），
    //   审计脚本 scan_claim_truthfulness 的 methodSpans 用裸花括号配平（见其注释：
    //   「不用正则猜函数体」），**不会**跳过字符串里的花括号 —— 于是类方法区间被算歪：
    //   真实翻红：loadConfig 的区间算成 1142-1248（正确为 1142-约1259），
    //   F1「成功声称点所在方法没有任何失败出口」误报 loadConfig 4 处（catch 在区间外被切掉）。
    //   提到类外后，方法体内只剩标识符引用，配平不受影响。
    const _FACTS_PROMPT_ANCHOR_OLD = '"visibility": "observable"}]}';
    const _FACTS_PROMPT_ANCHOR_NEW = '"visibility": "observable"}], "facts": [{"subject": "主语", "predicate": "谓词", "value": "取值", "type": "九类型名之一"}]}';
    const _FACTS_PROMPT_IDEMPOTENT = '"facts": [{"subject"';
    // ═══════════════════════════════════════════════════════════════════
    // [A1 第一刀] 叶子账本取库口（memory-ledgers.js）
    //   六个账本类（MoneyLedger / CardCollection / ConflictBook / DeltaBook /
    //   PairMemory / PovMemory）已于本版抽为 memory-ledgers.js。
    //   抽走前的实测依据：六个类彼此零互调、不读宿主状态，对外只被 MemoryEngine
    //   在构造期 new 一次 + 在 fixup / 回滚 / 注入 / 持久化四处按方法名调用。
    //   本取库口与 _cacheIdentityLib / _sceneBookLib 同形：**不在构造期缓存**（extra_js 后加载）。
    // ═══════════════════════════════════════════════════════════════════
    function _memoryLedgersLib() {
        return _moduleLib(() => window.LonShaMemoryLedgers, 'memory-ledgers.js');
    }
    // 模块缺席时的内置退路：与 memory-ledgers.js 的公开面**同形**（少功能但绝不抛、绝不静默）。
    //   为什么不留着旧类当退路：两份实现会漂移（本仓库治理过十几轮的缺陷形态）。
    //   故退路是一层**常量空实现**：读数全部如实回报「没有」，而不是伪造一个能写不能读的账本。
    //   export() 返回**超集形状**（六个账本的顶层键全在，均为空值）：避免调用方读到 undefined 塌成第三态。
    class MemoryLedgerFallback {
        constructor() { this._absent = true; }
        export() { return { money: {}, moneyLog: [], cards: [], conflicts: [], deltas: [], pairs: [], povs: [] }; }
        import() { return false; }
        removeByFloor() { return 0; }
        toPrompt() { return ''; }
        setMoney() { return false; }
        addDelta() { return false; }
        getMoney() { return null; }
        forge() { return false; }
        forgeFromEvents() { return 0; }
        add() { return false; }
        addFromExtracted() { return 0; }
        addFromList() { return 0; }
        confirm() { return 0; }
        getChangesSince() { return []; }
        addEntry() { return false; }
        search() { return []; }
        static _keyOf() { return ''; }
    }
    /** 取一个账本实例：模块在场用真实现，缺席退到同形空实现（**不静默化成空对象**）。 */
    function _newMemoryLedger(name) {
        const ML = _memoryLedgersLib();
        const C = (ML && typeof ML[name] === 'function') ? ML[name] : MemoryLedgerFallback;
        return new C();
    }
    // ═══════════════════════════════════════════════════════════════════
    // [A1 第二刀] 记忆辅助类集取库口（memory-aux.js）
    //   HolidayAware / Mutex / OpLog / FloorLedger / SnapshotManager /
    //   EmergencyBackup 六个工具类已于本版抽为 memory-aux.js。
    //   抽走前的实测依据（与第一刀同一条读数轴）：六个类彼此零互调、除 EmergencyBackup
    //   的诊断记账外对主人符号零依赖，对外只被 MemoryEngine 在构造期 new 一次、之后按方法名调用。
    //   本取库口与 _memoryLedgersLib / _cacheIdentityLib 同形：**不在构造期缓存**（extra_js 后加载）。
    // ═══════════════════════════════════════════════════════════════════
    function _memoryAuxLib() {
        return _moduleLib(() => window.LonShaMemoryAux, 'memory-aux.js');
    }
    // [A1 9th cut] memory-gc.js lib getter (not cached at construction: extra_js loads after entry).
    function _memoryGcLib() {
        return _moduleLib(() => window.LonShaMemoryGc, 'memory-gc.js');
    }
    // 模块缺席时的内置退路：与 memory-aux.js 的公开面**同形**（少功能但绝不抛、绝不静默）。
    //   为什么不留着旧类当退路：两份实现会漂移（与第一刀同一条理由）。
    //   故退路是一层**常量空实现**：读数全部如实回报「没有」，而不是伪造一个能写不能读的账本。
    //   空实现刻意**不吃构造参数**：它的每个方法都是常量返回（没有「有 opts 才能正确回报」的分支），
    //   真实现才需要 maxFloors / errLog 才能如实回报；两份实现的公开面按**方法名**对账。
    class MemoryAuxFallback {
        constructor() { this._absent = true; }
        /* ── HolidayAware ── */
        _parse() { return null; }
        current() { return null; }
        _dayDiff() { return 0; }
        keywords() { return []; }
        /* ── Mutex ── */
        acquire() { return null; }
        release() { return false; }
        get locked() { return false; }
        get holderToken() { return null; }
        get queueLength() { return 0; }
        /* ── OpLog ── */
        _retention() { return { total: 0, op: 0, ref: 0, type: 0, meta: 0 }; }
        static normRef(v) { return String(v == null ? '' : v); }
        static normOp(v) { return String(v == null ? '' : v); }
        log() { return false; }
        recent() { return []; }
        queryByType() { return []; }
        queryByRef() { return []; }
        stats() { return null; }
        observedTotal() { return 0; }
        auditSummary() { return null; }
        export() { return { entries: [], seq: 0 }; }
        import() { return false; }
        /* ── FloorLedger ── */
        beginFloor() { return null; }
        record() { return false; }
        get() { return null; }
        remove() { return 0; }
        floorsAfter() { return []; }
        /* ── SnapshotManager / EmergencyBackup ── */
        _open() { return null; }
        save() { return false; }
        latest() { return null; }
        list() { return []; }
        restore() { return false; }
    }
    /** 取一个辅助类实例：模块在场用真实现，缺席退到同形空实现（**不静默化成空对象**）。
     *  第二参为构造参数（仅 FloorLedger / EmergencyBackup 需要）—— 空实现忽略它（见上方注释）。 */
    function _newMemoryAux(name, opts) {
        const MA = _memoryAuxLib();
        const C = (MA && typeof MA[name] === 'function') ? MA[name] : MemoryAuxFallback;
        if (opts === undefined) return new C();
        return new C(opts);
    }
    // ===================================================================
    // [A1 第三刀] 叙事产物生成类集取库口（narrative-generators.js）
    //   DiarySystem / ReflectionSystem / OutlineDirector 三个生成侧派生系统已于本版抽为
    //   narrative-generators.js。抽走前的实测依据（与前两刀同一条读数轴）：三类彼此零互调、
    //   对主人模块级符号零依赖、对外只被 MemoryEngine 在构造期 new 一次、之后按方法名调用；
    //   唯一宿主接触面是三处同形的 window.SillyTavern 可选链取上下文。
    //   本取库口与 _memoryAuxLib / _memoryLedgersLib 同形：**不在构造期缓存**（extra_js 后加载）。
    // ===================================================================
    function _narrativeGeneratorsLib() {
        return _moduleLib(() => window.LonShaNarrativeGenerators, 'narrative-generators.js');
    }
    // 模块缺席时的内置退路：与 narrative-generators.js 的公开面**同形**（少功能但绝不抛、绝不静默）。
    //   为什么不留着旧类当退路：两份实现会漂移（前两刀同一条理由）。
    //   故退路是一层**常量空实现**：读数全部如实回报「没有」。
    //   export() 返回**超集形状**（日记与大纲两边的顶层键全在）：避免调用方读到 undefined 塌成第三态。
    class NarrativeGeneratorFallback {
        constructor() { this._absent = true; }
        /* ── DiarySystem ── */
        generateLiving() { return 0; }
        getChangesSince() { return []; }
        /* ── ReflectionSystem ── */
        generate() { return 0; }
        recent() { return []; }
        /* ── OutlineDirector ── */
        currentTurn() { return null; }
        get flatTurns() { return []; }
        get exhausted() { return true; }
        parseOutline() { return null; }
        turn() { return ''; }
        advanceTurn() { return null; }
        planNext() { return null; }
        toPrompt() { return ''; }
        rollbackFloor() { return 0; }
        shiftFloorRefs() { return 0; }
        dec() { return null; }
        pick() { return null; }
        /* ── 两方共用名（一个形状覆盖两边：如实回报「没有」）── */
        search() { return []; }
        removeByFloor() { return 0; }
        export() { return { diaries: {}, lastDiaryFloor: -1, stage: null, turnIndex: 0, turnFloor: 0, history: [] }; }
        import() { return false; }
    }
    /** 取一个生成系统实例：模块在场用真实现，缺席退到同形空实现（**不静默化成空对象**）。 */
    function _newNarrativeGenerator(name) {
        const NG = _narrativeGeneratorsLib();
        const C = (NG && typeof NG[name] === 'function') ? NG[name] : NarrativeGeneratorFallback;
        return new C();
    }
    // ═══════════════════════════════════════════════════════════════════
    // [A1 第四刀] 书册与时间工具类集取库口（memory-books.js）
    //   IncrementBookmark / EchoPool / SuspenseBook / PrequelSystem /
    //   RelativeTimeHelper / PlotTimeline / BM25 七个类已于本版抽为 memory-books.js。
    //   为什么七个同类一刀：它们之间只有两条真依赖边（PrequelSystem→BM25 选段、
    //   SuspenseBook→RelativeTimeHelper 倒计时），两条边都跨「书册 ↔ 时间」，
    //   拆开反而要另造注入链。抽走前的实测依据：七个类彼此不再有别的互调、
    //   对主人符号的依赖只有 6 处诊断记账（已收进构造参数 errLog）与 2 处日期松解析
    //   （模块内自带逐字副本），对外只被 MemoryEngine 在构造期 new 一次、之后按方法名调用。
    //   本取库口与 _narrativeGeneratorsLib / _memoryAuxLib 同形：**不在构造期缓存**（extra_js 后加载）。
    // ═══════════════════════════════════════════════════════════════════
    function _memoryBooksLib() {
        return _moduleLib(() => window.LonShaMemoryBooks, 'memory-books.js');
    }
    // 模块缺席时的内置退路：与 memory-books.js 的公开面**同形**（少功能但绝不抛、绝不静默）。
    //   为什么不留着旧类当退路：两份实现会漂移（前三刀同一条理由）。
    //   故退路是一层**常量空实现**：读数全部如实回报「没有」——不伪造一个能写不能读的账本。
    //   空实现刻意**不吃构造参数**：每个方法都是常量返回，没有「有 opts 才能正确回报」的分支；
    //   真实现才需要 errLog / cfgGetter 才能如实回报；两份实现的公开面按**方法名**对账。
    class MemoryBooksFallback {
        constructor() { this._absent = true; }
        /* ── IncrementBookmark ── */
        _store() { return null; }
        get() { return 0; }
        save() { return undefined; }
        reset() { return undefined; }
        all() { return {}; }
        resyncAfterDeletion() { return []; }
        /* ── EchoPool ── */
        _baseLife() { return 0; }
        _maxCount() { return 0; }
        onRecalled() { return undefined; }
        tick() { return []; }
        /* ── SuspenseBook ── */
        add() { return null; }
        getOpenPrompts() { return []; }
        resolve() { return null; }
        openItems() { return []; }
        recentlyResolved() { return []; }
        getRecentlyResolvedPrompt() { return []; }
        prune() { return 0; }
        briefForPrompt() { return '（暂无未了结的悬念）'; }
        /* ── PrequelSystem ── */
        importPrequel() { return { ok: false, chars: 0 }; }
        clearPrequel() { return undefined; }
        _boundaryWeight() { return 0; }
        splitFragments() { return []; }
        _frags() { return []; }
        _format() { return ''; }
        _estimateTokens() { return 0; }
        _tailFallback() { return []; }
        selectInjection() { return []; }
        buildInjection() { return ''; }
        /* ── RelativeTimeHelper ── */
        extractDualTimeTags() { return { hasDual: false, start: null, end: null, durationMinutes: 0, parseError: null }; }
        compactTimeRange() { return ''; }
        formatTimeRange() { return ''; }
        calcAge() { return 0; }
        calcDaysTogether() { return 0; }
        normalizeNumericDateSeparators() { return ''; }
        looksLikeStructuredNumericDate() { return false; }
        extractDayNumber() { return null; }
        extractMonthIdentifier() { return null; }
        parseStoryDate() { return null; }
        calcDaysDiff() { return null; }
        relativeTimePrefix() { return ''; }
        /* ── PlotTimeline ── */
        searchNear() { return []; }
        _norm() { return ''; }
        getChangesSince() { return []; }
        /* ── BM25 ── */
        _tokenize() { return []; }
        _lexExpand() { return ''; }
        _lexNormalize() { return ''; }
        normalizeQueryByLexicon() { return ''; }
        rebuild() { return undefined; }
        _cliffCut() { return []; }
        search() { return []; }
        _expandAliases() { return ''; }
        searchBranches() { return []; }
        /* ── 多方共用名（一个形状覆盖全部：如实回报「没有」）── */
        export() { return {}; }
        import() { return undefined; }
    }
    /** 取一个书册/时间工具实例：模块在场用真实现，缺席退到同形空实现（**不静默化成空对象**）。
     *  余下参数原样转发给真实现的构造（IncrementBookmark 收 engine+errLog、EchoPool 收
     *  cfgGetter+errLog、RelativeTimeHelper 收 errLog）——空实现忽略它们（见上方注释）。 */
    function _newMemoryBooks(name, ...args) {
        const MB = _memoryBooksLib();
        const C = (MB && typeof MB[name] === 'function') ? MB[name] : MemoryBooksFallback;
        return new C(...args);
    }
    /** [A1 第四刀] RelativeTimeHelper 的唯一取用口：真实现或同形空实现，errLog 一律注入。
     *  独立出来是因为宿主有 13 处零散 `_newRelativeTimeHelper()`（时间标签 / 相对前缀 /
     *  年龄推算 / 期限判定），逐个写取库表达式会把「缺模块时退到哪」散成 13 份。
     *  注入用模块导出的 bindErrLog 现算 —— 本仓库纪律「不在构造期缓存模块对象」（extra_js 后加载）。 */
    function _newRelativeTimeHelper() {
        const MB = _memoryBooksLib();
        const opt = (MB && typeof MB.bindErrLog === 'function') ? MB.bindErrLog({ errLog }) : {};
        return _newMemoryBooks('RelativeTimeHelper', opt.errLog || errLog);
    }
    // ═══════════════════════════════════════════════════════════════════
    // [A1 第五刀] 记忆器官类集取库口（memory-organs.js）
    //   LLMCaller / VectorStore / CharacterMemoryBank / EntityLexicon /
    //   WorldProgress / StorageManager 六个类已于本版抽为 memory-organs.js。
    //   抽走前的实测依据（与前四刀同一条读数轴）：六个类合计 1473 行，是宿主里最大的
    //   六个「活体器官」；对外只被 MemoryEngine 在构造期 new 一次、之后按方法名调用。
    //   ★ 与前四刀的区别：这六个类对主人模块级符号有**真依赖**（numOr / decayScore /
    //     _initEbbingMeta / sanitizeJson / hash32 / fetchWithTimeoutRetry / errLog /
    //     _moduleLib / VERSION / ARCHIVE_TOP_LEVEL_KEYS / STORAGE_FP_FIELDS）。
    //     宿主这些符号**一律留在原处不搬**（搬走会把 host_beast / dead_code 两条读数轴
    //     的基线口径偷偷改掉），改由 `_bindOrganDeps()` 在引擎构造期把它们**现算注入**
    //     模块 —— 于是模块行为 = 宿主行为，模块内的逐字副本只服务「宿主不在场」的
    //     抽取面（单测/审计把类抠进 new Function 重放）。
    //   本取库口与 _memoryBooksLib / _memoryAuxLib 同形：**不在构造期缓存**（extra_js 后加载）。
    // ═══════════════════════════════════════════════════════════════════
    function _memoryOrgansLib() {
        return _moduleLib(() => window.LonShaMemoryOrgans, 'memory-organs.js');
    }
    // 模块缺席时的内置退路：与 memory-organs.js 的公开面**同形**（少功能但绝不抛、绝不静默）。
    //   为什么不留着旧类当退路：两份实现会漂移（前四刀同一条理由）。
    //   故退路是一层**常量空实现**：读数全部如实回报「没有」——不伪造一个能写不能读的器官。
    //   空实现刻意**不吃构造参数**：它的每个方法都是常量返回（没有「有 config 才能正确回报」
    //   的分支），真实现才需要 config / errLog 才能如实回报；两份实现的公开面按**方法名**对账
    //   （对账表住 tests/v3264_a1_memory_organs.test.mjs 第一节）。
    class OrganFallback {
        constructor() { this._absent = true; }
        /* ── LLMCaller ── */
        async callAPI() { return null; }
        async rewriteQuery() { return null; }
        async rerank() { return null; }
        async fetchModels() { return []; }
        async callOpenAI() { return null; }
        getLastIntent() { return null; }
        getLastEventChain() { return null; }
        /* ── VectorStore ── */
        async getEmbedding() { return null; }
        async addVector() { return null; }
        async addVectorAuto() { return null; }
        simpleEmbedding() { return []; }
        cosineSimilarity() { return 0; }
        async search() { return []; }
        getCacheStats() { return { cacheSize: 0, vectorCount: 0 }; }
        heatByText() { return undefined; }
        /* ── CharacterMemoryBank ── */
        addCore() { return null; }
        addRecent() { return null; }
        gc() { return undefined; }
        promoteToCore() { return false; }
        demoteToRecent() { return false; }
        deleteMemory() { return false; }
        of() { return { core: [], recent: [] }; }
        getAutobiography() { return null; }
        addLifeStage() { return { ok: false, reason: 'stub' }; }
        updateLifeStage() { return { ok: false, reason: 'stub' }; }
        recordPivotalChoice() { return { ok: false, reason: 'stub' }; }
        deriveAutobiographicalProfile() { return null; }
        _getAutobioLib() { return null; }
        _getRelationDynamicsLib() { return null; }
        _getGoalRerouteLib() { return null; }
        _getAgencyContractLib() { return null; }
        /* ── EntityLexicon ── */
        normalizeText() { return ''; }
        match() { return []; }
        resolve() { return null; }
        promptRules() { return ''; }
        /* ── WorldProgress ── */
        addPromise() { return null; }
        checkPromises() { return 0; }
        fulfillPromise() { return false; }
        createResearchInquiry() { return null; }
        recomputeResearch() { return null; }
        createInstitution() { return null; }
        handoverInstitution() { return null; }
        projectActionConsequences() { return null; }
        _getResearchLib() { return null; }
        _getInstitutionLib() { return null; }
        _getConsequenceLib() { return null; }
        // [v3.359.0 · M6-X6 / M6-X8] 退路
        createSymbolicEntity() { return null; }
        _getSymbolicLib() { return null; }
        createRecallSession() { return null; }
        _getRecallReintLib() { return null; }
        createCFExperiment() { return null; }
        _getCounterfactualLib() { return null; }
        createEraTransition() { return null; }
        _getEraInheritanceLib() { return null; }
        resolvePromise() { return false; }
        markUnaware() { return false; }
        revealKnowledge() { return false; }
        /* [v3.291.0 · X5] 知识轨迹三法退路。为什么退路也必须声明：
         *   退路类的方法集是「宿主可调用面」的穷举；新增真实方法而不补退路，
         *   会在模块缺席时抛 TypeError（而不是降级）—— 正是本仓点名的
         *   「新增面忘补退路」缺陷形态。返回值与同族一致（不抛、可判空）。 */
        _knowledgeTrace() { return null; }
        recordKnowledgeTrace() { return null; }
        refreshKnowledgeTraceRead() { return null; }
        /* [v3.293.0 · X6] 分支语义四法退路。同上：宿主可调用面穷举，缺退路会在
         *   模块缺席时抛 TypeError 而不是降级。四个出口各对一支（取库/对照/提案/预检），
         *   不做成一个大出口 —— 合成一个会让「对照没做」与「提案没算」同形。 */
        _branchSemantics() { return null; }
        compareBranchOwners() { return null; }
        proposeBranchImport() { return null; }
        precheckBranchImport() { return null; }
        confirmBranchImport() { return null; }
        /* [v3.293.0 · X7] 分卷接续四法退路。同上：宿主可调用面穷举，缺退路会在
         *   模块缺席时抛 TypeError 而不是降级。四个出口各对一支（取库 / 建包 / 交接 / 撤销），
         *   不做成一个大出口 —— 合成一个会让「包没建」与「交接没跑」同形。 */
        _volumeContinuation() { return null; }
        buildVolumePack() { return null; }
        handoffVolumeContinuation() { return null; }
        revokeVolumeHandoff() { return null; }
        /* [v3.293.0] 器官侧交接/撤销/读数七法退路（X6 落笔两法 + X7 落笔与读数五法）。
         *   与上面两组同一条理由：退路类的方法集是「宿主可调用面」的穷举 —— 模块缺席时
         *   必须降级返回空值，而不是抛 TypeError。
         *   ★ 本版实测踩到（判据 v3264 A 段点名七条「退路缺方法」）：X6/X7 给
         *   memory-organs.js 的 WorldProgress 加了这七个真方法，**宿主侧调用点接了、
         *   器官缺席退路漏了**。这正是本仓点名过的「新增面忘补退路」形态，而它只在
         *   「模块缺席」这条路径上才现形 —— 健康树上永不出现，负控制也测不到。
         *   返回值按**真实现的降级形状**给（不是一律 null）：调用侧多处直接做数值/数组
         *   消费（`Number(wp.volumeContinuationCount()) || 0` / 逐条遍历 entries），
         *   一律给 null 会把「坏在降级里」与「坏在返回类型上」两种故障混成一种。 */
        applyBranchImport() { return { ok: false, reason: 'no-organ' }; }
        branchImportCount() { return 0; }
        applyVolumeContinuation() { return { ok: false, reason: 'no-organ' }; }
        volumeContinuationCount() { return 0; }
        volumeContinuationEntries() { return []; }
        revokeVolumeContinuation() { return { ok: false, reason: 'no-organ', revokedCount: 0, keptCount: 0, alreadyRevoked: 0 }; }
        noteVolumeContinuation() { return null; }
        _knowledgeNet() { return null; }
        getReEntryNotice() { return null; }
        addPlotArc() { return null; }
        touchArc() { return false; }
        decayArcs() { return 0; }
        markPending() { return undefined; }
        candidates() { return []; }
        select() { return []; }
        propose() { return null; }
        publish() { return null; }
        discard() { return null; }
        reconcile() { return 0; }
        generateFromMemory() { return 0; }
        store() { return false; }
        toInjection() { return []; }
        /* ── StorageManager ── */
        getRevision() { return 0; }
        setStateIfRevision() { return false; }
        async save() { return false; }
        async load() { return null; }
        /* ── 内部对账面（与真实现按**方法名**逐一对账，含私有助手）── */
        _eventChainLib() { return null; }
        _nativeToolsLib() { return null; }
        _pristineFetchLib() { return null; }
        _fetchOpts() { return {}; }
        _callAPIInner() { return null; }
        _callOpenAILegacy() { return null; }
        _callOpenAINative() { return null; }
        _nativeToolMaxRounds() { return 0; }
        _dispatchMemoryTools() { return []; }
        _dispatchMemoryTool() { return ''; }
        _calcHashes() { return { docHash: '', payloadHash: '' }; }
        _heatEntry() { return undefined; }
        _detId() { return ''; }
        _gcCore() { return undefined; }
        _c() { return { core: [], recent: [] }; }
        _hitBoundary() { return false; }
        _register() { return null; }
        _knowledgeNet() { return null; }
        _knowledgeTally() { return 0; }
        /* ── 多方共用名（一个形状覆盖全部：如实回报「没有」）── */
        removeByFloor() { return 0; }
        shiftFloorRefs() { return 0; }
        export() { return {}; }
        import() { return undefined; }
    }
    /** 取一个记忆器官实例：模块在场用真实现，缺席退到同形空实现（**不静默化成空对象**）。
     *  余下参数原样转发给真实现的构造（LLMCaller/VectorStore 收 config、EntityLexicon 收 opts、
     *  其余收空）—— 空实现忽略它们（见上方注释）。 */
    function _newMemoryOrgan(name, ...args) {
        const MO = _memoryOrgansLib();
        const C = (MO && typeof MO[name] === 'function') ? MO[name] : OrganFallback;
        return new C(...args);
    }
    /** [A1 第五刀] 宿主符号注入：把六个器官依赖的主人符号换成**宿主现算**的那一份。
     *  为什么必须注：模块内的逐字副本只在「宿主不在场」时是真实现；宿主在场却继续用副本，
     *  则宿主改了函数而副本未同步就会**静默漂移**（本仓治理过多轮的缺陷形态）。
     *  为什么放在构造期现算：热更新/模块后加载时不留旧闭包。返回被换掉的项数（诊断用）。 */
    function _bindOrganDeps() {
        const MO = _memoryOrgansLib();
        if (!MO || typeof MO.bindDeps !== 'function') return { ok: false, swapped: 0, why: 'module-missing' };
        try {
            const n = MO.bindDeps({
                /* [v3.277.0 O7] ★ 必须是显式键 `moduleLib:` —— 修前写成对象简写 `_moduleLib,`，
                 *   键名即 `_moduleLib`，而 memory-organs.js 的 bindDeps 读的是 `d.moduleLib`，
                 *   于是这一个键**永不注入**（实测：注入 `_moduleLib` 换 7 项、注入 `moduleLib` 换 8 项，
                 *   DEP_KEYS 恰 8 项）。模块侧的 `_moduleLib` 只能继续用副本。 */
                errLog, numOr, decayScore, sanitizeJson,
                moduleLib: _moduleLib,
                initEbbingMeta: _initEbbingMeta,
                fetchWithTimeoutRetry,
                version: VERSION,
            });
            return { ok: true, swapped: Number(n) || 0, why: '' };
        } catch (e) { errLog(e, 'A1第五刀.bindDeps'); return { ok: false, swapped: 0, why: (e && e.message) ? String(e.message) : String(e) }; }
    }
    // ══════════════════════════════════════════════════════════════════
    // [A1 第六刀] 内核数据模型类集取库口（memory-core.js）
    //   MemoryGraph / SummarySystem / GameClock / CharacterState 四个类已于本版抽为
    //   memory-core.js。抽走前的实测依据（与前五刀同一条读数轴）：四类合计 2088 行，
    //   是宿主剩余候选里最大的一块；四类互调近零（唯一命中的是 SummarySystem 里一条
    //   注释提到 GameClock 一词），对外只被 MemoryEngine 在构造期 new 一次、之后按
    //   方法名驱动。
    //   ★ 与第五刀同型：四个类对主人模块级符号有真依赖（errLog / sanitizeJson /
    //     _moduleLib / _changeset / _memoryBooksLib / _newRelativeTimeHelper）。宿主这些
    //     符号**一律留在原处不搬**（搬走会把 host_beast / dead_code 两条读数轴的基线
    //     口径偷偷改掉），改由 _bindCoreDeps() 在引擎构造期把它们**现算注入**模块——
    //     于是模块行为 = 宿主行为；模块内的副本只服务「宿主不在场」的抽取面
    //     （单测/审计把类抠进 new Function 重放：v315 / v3166 / v3175 / v382 / v340）。
    //   本取库口与 _memoryOrgansLib / _memoryBooksLib 同形：**不在构造期缓存**（extra_js 后加载）。
    // ══════════════════════════════════════════════════════════════════
    function _memoryCoreLib() {
        return _moduleLib(() => window.LonShaMemoryCore, 'memory-core.js');
    }
    // 模块缺席时的内置退路：与 memory-core.js 的公开面**同形**（少功能但绝不抛、绝不静默）。
    //   为什么不留着旧类当退路：两份实现会漂移（前五刀同一条理由）。
    //   故退路是一层**常量空实现**：读数全部如实回报「没有」——不伪造一个能读不能写的内核。
    //   空实现刻意**不吃构造参数**：它的每个方法都是常量返回；两份实现的公开面按**方法名**
    //   对账（对账表住 tests/v3266_a1_memory_core.test.mjs 第一节）。
    class CoreFallback {
        constructor() { this._absent = true; }
        /* ── MemoryGraph ── */
        _logGraphOp() { return undefined; }
        rebuildGraphFromOps() { return 0; }
        rollbackGraphFrom() { return 0; }
        snapshotGraph() { return undefined; }
        truncateGraphFrom() { return 0; }
        addNode() { return null; }
        addEdge() { return null; }
        findByNames() { return []; }
        findCharacterByName() { return null; }
        rebuildNameIndex() { return undefined; }
        findNodesMentionedIn() { return []; }
        vacuum() { return { removed: 0, remaining: 0, unavailable: true }; }
        rollupGroup() { return { ok: false, reason: 'absent' }; }
        maintainGraph() { return { rollup: 0, vacuum: 0, unavailable: true }; }
        autoRollup() { return { ok: false, reason: 'absent' }; }
        /* ── SummarySystem ── */
        _reportError() { return undefined; }
        addLockedFact() { return null; }
        removeLockedFact() { return 0; }
        getLockedFacts() { return []; }
        lockedFactsForPrompt() { return ''; }
        updateSummaryText() { return false; }
        addManualSummary() { return null; }
        missingFloors() { return []; }
        completeMissingFloors() { return 0; }
        smartTruncate() { return ''; }
        compressSummary() { return ''; }
        createSummary() { return null; }
        generateAMIndex() { return ''; }
        resolveByAMCodes() { return []; }
        getActiveSummaries() { return []; }
        search() { return []; }
        markDormant() { return 0; }
        awakenByEntities() { return []; }
        maybeFold() { return 0; }
        foldHigherTiers() { return 0; }
        enqueueRetry() { return undefined; }
        processRetryQueue() { return 0; }
        getTaskInbox() { return []; }
        getTaskInboxReport() { return { total: 0, pending: 0, degraded: 0, absent: true }; }
        maybeFoldHistorical() { return 0; }
        verifyVolumesIntact() { return { state: 'absent', broken: [], warnings: [] }; }
        getIntactVolumes() { return []; }
        getActiveVolumes() { return []; }
        searchVolumes() { return []; }
        addGrandChronicle() { return null; }
        getGrandChroniclePrompt() { return ''; }
        /* ── GameClock ── */
        parseStoryDate() { return null; }
        calcAge() { return 0; }
        setTime() { return undefined; }
        getSnapshot() { return { date: '', label: '', precision: 'unknown', turn: 0, absent: true }; }
        syncFromNarrative() { return { synced: false, reason: 'absent' }; }
        getContextPrompt() { return ''; }
        readWorldAxisClock() { return null; }
        worldClockLine() { return '不可用（absent） · 内核模块未加载'; }
        readWorldLedger() { return null; }
        worldLedgerLine() { return '不可用（absent） · 内核模块未加载'; }
        /* ── CharacterState ── */
        setBaseline() { return undefined; }
        recordDrift() { return undefined; }
        getEffectivePersona() { return null; }
        registerTransientNpc() { return null; }
        promoteNpc() { return false; }
        isNpcTracked() { return false; }
        setGeoLocation() { return undefined; }
        getGeoLocation() { return null; }
        getGeoPrompt() { return ''; }
        addNpcTie() { return null; }
        setNpcTies() { return undefined; }
        getNpcTies() { return []; }
        getAllNpcTies() { return []; }
        getNpcTiesRecords() { return []; }
        setProtagonist() { return undefined; }
        getEffectiveAge() { return null; }
        _clockHelpers() { return null; }
        _ageAnchor() { return null; }
        _conditionPatchLib() { return null; }
        getProtagonist() { return null; }
        getProtagonistPrompt() { return ''; }
        _normalizeDetailText() { return ''; }
        addLifeDetail() { return null; }
        removeLifeDetail() { return 0; }
        removeLifeDetailByFloor() { return 0; }
        shiftLifeDetailFloors() { return 0; }
        removeProtagonistByFloor() { return 0; }
        shiftProtagonistFloor() { return 0; }
        shiftDriftFloors() { return 0; }
        removeDriftByFloor() { return 0; }
        shiftBaselineFloors() { return 0; }
        shiftGeoFloor() { return 0; }
        getLifeDetailsPrompt() { return []; }
        _logOp() { return undefined; }
        rebuildFromOps() { return 0; }
        _ensure() { return { ops: [], baselines: {}, drifts: {}, npcTies: {}, lifeDetails: [], todos: [], geo: null, protagonist: null }; }
        ageReadingPrompt() { return ''; }
        ageReading() { return ''; }
        exportAgeAnchors() { return {}; }
        applyChanges() { return 0; }
        addTodos() { return 0; }
        pruneTodos() { return 0; }
        getChangesSince() { return []; }
        searchByNames() { return []; }
        /* ── 多方共用名（一个形状覆盖全部：如实回报「没有」）── */
        export() { return {}; }
        import() { return undefined; }
    }
    /** 取一个内核数据模型实例：模块在场用真实现，缺席退到同形空实现（**不静默化成空对象**）。
     *  余下参数原样转发给真实现的构造（四类构造签名均为 `new Xxx()`，不吃参数）——
     *  空实现忽略它们（见上方注释）。 */
    function _newCore(name, ...args) {
        const MC = _memoryCoreLib();
        const C = (MC && typeof MC[name] === 'function') ? MC[name] : CoreFallback;
        return new C(...args);
    }
    /** [A1 第六刀] 宿主符号注入：把四个内核数据模型依赖的主人符号换成**宿主现算**的那一份。
     *  为什么必须注：模块内的副本只在「宿主不在场」时是真实现；宿主在场却继续用副本，
     *  则宿主改了函数而副本未同步就会**静默漂移**（本仓治理过多轮的缺陷形态）。
     *  为什么放在构造期现算：热更新/模块后加载时不留旧闭包。返回被换掉的项数（诊断用）。 */
    function _bindCoreDeps() {
        const MC = _memoryCoreLib();
        if (!MC || typeof MC.bindDeps !== 'function') return { ok: false, swapped: 0, why: 'module-missing' };
        try {
            const n = MC.bindDeps({
                errLog, sanitizeJson,
                moduleLib: _moduleLib,
                memoryBooksLib: _memoryBooksLib,
                changesetLib: _changeset,
                relativeTimeHelperFactory: _newRelativeTimeHelper,
                version: VERSION,
            });
            return { ok: true, swapped: Number(n) || 0, why: '' };
        } catch (e) { errLog(e, 'A1 第六刀.bindDeps'); return { ok: false, swapped: 0, why: (e && e.message) ? String(e.message) : String(e) }; }
    }
    // ══════════════════════════════════════════════════════════════════
    // [A1 第七刀] 配置管理类取库口（memory-config.js）
    //   ConfigManager（512 行：整块默认配置字面量 + 四段配置迁移 + 角色卡覆盖 + 写盘）
    //   已于本版抽为 memory-config.js。抽走前的实测依据（与前六刀同一条读数轴）：
    //   整类 512 行，是宿主剩余候选里最大的一块；类外引用面仅 5 个宿主符号
    //   （errLog / _moduleLib / clearApiCooldowns / _configDefaultsTemplate / PLUGIN_NAME，
    //   其中类体里**没有** VERSION 引用 —— 本刀的注入面不列没有消费点的键）；
    //   对外只被 LonShaMemoryPlugin 在构造期 new 一次（`this.configMgr`），
    //   之后引擎与 UI 只按字段名与方法名驱动它（config / loadConfig / _applyCardOverrides /
    //   saveConfig / _lastMigrationReport / _configLoadError）。
    //   ★ 与第五/六刀同型：宿主那些符号**一律留在原处不搬**（搬走会把 host_beast /
    //     dead_code 两条读数轴的基线口径偷偷改掉），改由 _bindConfigDeps() 在引擎构造期
    //     现算注入 —— 于是模块行为 = 宿主行为；模块内的副本只服务「宿主不在场」的
    //     抽取面（v3129 / v3166 把类抠进 new Function 重放）。
    //   本取库口与 _memoryCoreLib / _memoryOrgansLib 同形：**不在构造期缓存**（extra_js 后加载）。
    // ══════════════════════════════════════════════════════════════════
    function _memoryConfigLib() {
        return _moduleLib(() => window.LonShaMemoryConfig, 'memory-config.js');
    }
    // 模块缺席时的内置退路：与 memory-config.js 的公开面**同形**（少功能但绝不抛、绝不静默）。
    //   为什么不留着旧类当退路：两份实现会漂移（前六刀同一条理由）。
    //   故退路是一层**常量空实现**：读数全部如实回报「没有」——不伪造一个能读不能写的配置。
    //   ★ 退路的 config 刻意是**空对象**（不是默认值表）：本仓「不得同形」纪律要求
    //     「模块缺席」与「配置全默认」不同形 —— 空对象 + `_absent` 标记使调用方能区分；
    //     塞一份默认值表会让「模块根本没加载」看起来像「配置一切正常」（最危险的静默）。
    class ConfigManagerFallback {
        constructor() { this._absent = true; this.config = {}; this._lastMigrationReport = null; this._configLoadError = null; }
        loadConfig() { return undefined; }
        _applyCardOverrides() { return 0; }
        saveConfig() { return undefined; }
    }
    /** 取配置实例：模块在场用真实现，缺席退到同形空实现（**不静默化成空对象**）。
     *  余下参数原样转发给真实现的构造（真实现签名是 `new ConfigManager()`，不吃参数）。
     *  ★ 本刀特有：`_configDefaultsTemplate` 是**可变态**，两个方向都要对齐 ——
     *    ① 构造**前**把宿主那份推进模块：模块对象在页面生命周期内持久，而热更新只重载
     *       extra_js 时模块侧的模板会归零，宿主变量仍持有冻过的快照。缺了这一步，
     *       热更新后每一段迁移都会走「默认值缺失」的 skipped 分支（迁移静默失效）。
     *    ② 构造**后**把模块冻好的值镜像回宿主变量：宿主变量从此是**镜像**，持有者是模块
     *       （否则宿主与模块各冻一份，第二真源当场成立）。 */
    function _newConfigManager(...args) {
        const MC = _memoryConfigLib();
        if (MC && typeof MC.bindDeps === 'function') {
            try { MC.bindDeps({ configDefaultsTemplate: _configDefaultsTemplate }); } catch (e) { /* 推不进去按副本处理，不阻断构造 */ }
        }
        const C = (MC && typeof MC.ConfigManager === 'function') ? MC.ConfigManager : ConfigManagerFallback;
        const inst = new C(...args);
        try {
            const t = (MC && typeof MC.getConfigDefaultsTemplate === 'function') ? MC.getConfigDefaultsTemplate() : null;
            if (t && _configDefaultsTemplate !== t) _configDefaultsTemplate = t;
        } catch (e) { /* 读不回按未冻结处理（下一次构造再对齐） */ }
        return inst;
    }
    /** [A1 第七刀] 宿主符号注入：把配置主人依赖的宿主符号换成**宿主现算**的那一份。
     *  为什么必须注：模块内的副本只在「宿主不在场」时是真实现；宿主在场却继续用副本，
     *  则宿主改了函数而副本未同步就会**静默漂移**（本仓治理过多轮的缺陷形态）。
     *  为什么放在构造期现算：热更新/模块后加载时不留旧闭包。返回被换掉的项数（诊断用）。
     *  ★ 传给 bindDeps 的 `_configDefaultsTemplate` 在首次构造时是 null（尚未冻结）——
     *    模块侧对 null/undefined 的处置是「忽略」：把已冻的值清空会让迁移分支反复走
     *    「默认值缺失」的 skipped 分支（迁移静默失效），故 [v3.277.0 O7] 把这条**落到实现**
     *    （memory-config.js 的 `!= null`）。修前该处实现是 `!== undefined`、null 照样放行，
     *    本注释与实现相反（本轮实测的注释说谎形态）。 */
    function _bindConfigDeps() {
        const MC = _memoryConfigLib();
        if (!MC || typeof MC.bindDeps !== 'function') return { ok: false, swapped: 0, why: 'module-missing' };
        try {
            const n = MC.bindDeps({
                errLog,
                moduleLib: _moduleLib,
                clearApiCooldowns,
                configDefaultsTemplate: _configDefaultsTemplate,
                version: VERSION,
            });
            return { ok: true, swapped: Number(n) || 0, why: '' };
        } catch (e) { errLog(e, 'A1 第七刀.bindDeps'); return { ok: false, swapped: 0, why: (e && e.message) ? String(e.message) : String(e) }; }
    }
    /** [v3.277.0 O7] 依赖注入诊断行的**纯函数**格式化面：selfCheck 调用它，判据也真跑它。
     *  为什么必须抽成纯函数：诊断行若只住在 selfCheck 的内联 IIFE 里，
     *  就只能靠读源码判断、无法被真跑（本仓治理过多轮的「判据只能文本推断」形态）。
     *  抽出后同一段逻辑既被 selfCheck 用，也能被判据用 new Function 真跑三态：
     *  破坏它（如把失败项过滤改成空数组）能让判据当场翻红。
     *  入参：constructRead（构造期三态数组或 null）、rebindRead（装载后重绑三态数组或 null）。
     *  返回：[标题, 值] 两元组（与 selfCheck 的 rows 元素同形）。 */
    function _formatBindDepsRow(constructRead, rebindRead) {
        const fmt = (r) => r.map((x) => x.tag + ' ' + x.swapped).join(' · ');
        const badOf = (r) => r.filter((x) => !x || x.ok !== true);
        const reb = Array.isArray(rebindRead) ? rebindRead : null;
        if (reb) {
            const bad = badOf(reb);
            const total = reb.reduce((a, x) => a + (Number(x && x.swapped) || 0), 0);
            if (!bad.length) {
                const c0 = Array.isArray(constructRead) ? constructRead : [];
                const c0bad = badOf(c0).length;
                return ['依赖注入', fmt(reb) + '（共换 ' + total + ' 项）'
                    + (c0bad ? '；构造期 ' + c0bad + ' 处因 extra_js 未装载而缺席，装载后已补齐' : '')];
            }
            return ['依赖注入', '⚠ 装载后仍有 ' + bad.length + '/' + reb.length + ' 处未注入：'
                + bad.map((x) => (x && x.tag ? x.tag : '?') + '（' + ((x && x.why) || '未知') + '）').join(' · ')
                + ' · 成功处 ' + fmt(reb.filter((x) => x && x.ok === true))];
        }
        const r = Array.isArray(constructRead) ? constructRead : null;
        if (!r) return ['依赖注入', '—（尚未走到构造期，未注入）'];
        const bad = badOf(r);
        if (!bad.length) return ['依赖注入', fmt(r) + '（共换 ' + r.reduce((a, x) => a + (Number(x.swapped) || 0), 0) + ' 项）'];
        return ['依赖注入', '⚠ ' + bad.length + '/' + r.length + ' 处未注入（构造期）：'
            + bad.map((x) => (x && x.tag ? x.tag : '?') + '（' + ((x && x.why) || '未知') + '）').join(' · ')
            + ' · 模块装载后未重绑'];
    }
    
    
    
    // [v3.19] 周期调度纯函数（收编 RUBY scheduler.js）: 位置取模 + 多任务分发
    
// [v3.71] A1: 相对时间前缀（柏宝书 timeRel.relativeTimeLabel 缝入）——宁可不标，绝不标错
function parseStoryDateLoose(dateStr) {
    const s = String(dateStr || '').trim();
    if (!s) return null;
    let m = s.match(/(\d{3,4})[年/.](\d{1,2})[月/.](\d{1,2})/);
    if (m) return { type: 'standard', year: +m[1], month: +m[2], day: +m[3] };
    m = s.match(/(\d{1,2})月(\d{1,2})日?/);
    if (m) return { type: 'standard', year: null, month: +m[1], day: +m[2] };
    const monthId = (s.match(/([^\s\d]+月)/) || [])[1] || null;
    const dayM = s.match(/(\d+)\s*[日号]/) || s.match(/第\s*(\d+)/) || s.match(/(\d+)/);
    if (monthId && dayM) return { type: 'fantasy', monthId, day: +dayM[1], year: null, month: null };
    return null;
}
function relativeTimeLabel(eventTime, nowTime) {
    const ev = parseStoryDateLoose(eventTime);
    const now = parseStoryDateLoose(nowTime);
    if (!ev || !now) return '';
    if (ev.type === 'fantasy' || now.type === 'fantasy') {
        if (ev.type !== now.type) return '';
        if (ev.monthId !== now.monthId) return '';
        const dd = (now.day || 0) - (ev.day || 0);
        if (dd === 0) return '今天';
        if (dd === 1) return '昨天';
        if (dd === -1) return '明天';
        if (dd > 1) return dd + '天前';
        return Math.abs(dd) + '天后';
    }
    const mkTs = (d) => (d.year == null ? null : new Date(d.year, (d.month || 1) - 1, d.day || 1).getTime());
    const evTs = mkTs(ev), nowTs = mkTs(now);
    if (evTs == null || nowTs == null) return '';
    const days = Math.round((nowTs - evTs) / 86400000);
    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    if (days === 2) return '前天';
    if (days === 3) return '大前天';
    if (days === -1) return '明天';
    if (days === -2) return '后天';
    if (days > 0) {
        if (days < 30) return days + '天前';
        if (days < 365) return Math.floor(days / 30) + '个月前';
        const years = Math.floor(days / 365);
        const remain = Math.round((days % 365) / 30);
        return (remain > 0 && years < 5) ? years + '年' + remain + '个月前' : years + '年前';
    }
    const abs = Math.abs(days);
    if (abs < 30) return abs + '天后';
    if (abs < 365) return Math.floor(abs / 30) + '个月后';
    return Math.floor(abs / 365) + '年后';
}
    function cyclePositionFor(aiReplyCount, len) {
        if (!len || len <= 0 || aiReplyCount <= 0) return 0;
        return ((aiReplyCount - 1) % len) + 1;
    }
    // [v3.23] 剧情时间约束解析（NE-Memory parseTimeConstraint 移植）
    // 从 recall 查询中解析出时间约束（Day X / 月 / ISO 日期 / 相对时间），
    // 供 timeline 召回前做时间过滤——"那天/周二/5月 发生了什么"这类查询也能命中时间线
    function parseStoryTimeConstraint(query) {
        try {
            const q = String(query || '').trim();
            if (!q) return null;
            // 1. 剧情历 Day X - Day Y 范围（支持中文"到"）
            const dayRange = q.match(/Day\s*(\d+)\s*(?:[-–—]|to|到)\s*Day?\s*(\d+)/i);
            if (dayRange) return { type: 'narrative_range', from: 'Day ' + dayRange[1], to: 'Day ' + dayRange[2], period: 'Day ' + dayRange[1] + '-' + dayRange[2] };
            // 2. Day X
            const daySingle = q.match(/Day\s*(\d+)/i);
            if (daySingle) return { type: 'narrative', period: 'Day ' + daySingle[1] };
            // 3. ISO 日期 YYYY-MM / YYYY年M月
            const isoMatch = q.match(/\b(20\d{2})[-年](\d{1,2})\b/);
            if (isoMatch) return { type: 'absolute', period: isoMatch[1] + '-' + String(isoMatch[2]).padStart(2, '0'), month: parseInt(isoMatch[2]), year: parseInt(isoMatch[1]) };
            // 4. 中文相对时间
            if (/(昨天|前天)/.test(q)) return { type: 'relative', period: '昨天' };
            if (/今天|今天.+(？|\?)|今天.*(如何|怎样|怎样|发生了什么)/.test(q)) return { type: 'relative_today', period: '今天' };
            // 5. 中文月份
            const mMonth = q.match(/(上午|下午|晚上|早晨|凌晨)|(一月|二月|三月|四月|五月|六月|七月|八月|九月|十月|十一月|十二月)/);
            if (mMonth && mMonth[2]) {
                const cnMonths = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
                const mi = cnMonths.indexOf(mMonth[2]);
                // 归一为 absolute（月号约束），period 兼容中文月份过滤
                return { type: 'absolute', period: mMonth[2], month: mi + 1, year: null, cn: true };
            }
            return null;
        } catch (e) { return null; }
    }
    // 时间过滤（作用于 timeline 条目，按 date 匹配）
    function filterTimelineByConstraint(entries, c) {
        if (!c || !Array.isArray(entries) || !entries.length) return entries;
        const normD = (d) => String(d || '').replace(/\s+/g, '').replace(/[年月日]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        return entries.filter(e => {
            const raw = String(e.date || '');
            const ek = normD(raw);
            const normAbs = ek;   // 归一化绝对日期：2026-05-12 → 2026-05；5月3日 → 5-3
            if (!ek) return false;
            // 剧情历（Day N）判定：raw 含 Day（不区分大小写）
            const isDay = /^day\s*\d+/i.test(raw) || /^day\s*\d+/i.test(raw.trim());
            if (c.type === 'narrative' || c.type === 'narrative_range') {
                if (!isDay) return false;   // 剧情历约束只匹配剧情历日期
                const dm = raw.match(/day\s*(\d+)/i);
                if (!dm) return false;
                const dayNum = parseInt(dm[1]);
                if (c.type === 'narrative') {
                    const targetDay = parseInt(String(c.period).replace(/[^0-9]/g, ''));
                    return dayNum === targetDay;
                }
                const fromD = parseInt(String(c.from).replace(/[^0-9]/g, ''));
                const toD = parseInt(String(c.to).replace(/[^0-9]/g, ''));
                return dayNum >= fromD && dayNum <= toD;
            }
            if (c.type === 'absolute') {
                if (isDay) return false;    // 绝对月约束不匹配剧情历
                const period = c.period.replace(/^0(?=(\d{2})$)/, '');   // 2026-05 → 2026-5 也接受
                // 兼容 YYYY-MM（ISO）与 YYYY-M（中文）
                const yearMonth = normAbs.match(/^(20\d{2})-(\d{1,2})/);
                const wantYear = String(c.year || '');
                const wantMonth = String(c.month || '');
                if (yearMonth && wantYear) {
                    return yearMonth[1] === wantYear && parseInt(yearMonth[2]) === parseInt(wantMonth);
                }
                // 中文月份（5月3日 → 5-3）：匹配月份段
                if (wantMonth) {
                    const cnMonth = normAbs.match(/^(\d{1,2})-/);
                    return !!cnMonth && parseInt(cnMonth[1]) === parseInt(wantMonth);
                }
                return normAbs.indexOf(period) !== -1 || normAbs.indexOf(period.replace(/-0(\d)$/, '-$1')) !== -1;
            }
            if (c.type === 'relative') {
                if (isDay) return false;
                return normAbs.indexOf(normD(c.period)) !== -1;
            }
            return true;
        });
    }
    // [v3.19] 系统隐藏消息识别（ruby reader.js isSystemHiddenMsg）:
    // ST 安静生成的消息 is_system=true 但非 user 且非空 → 是 AI 回复（须计入楼层指纹/AI 楼层序数）
    function isSystemHiddenMsg(m) {
        if (!m) return false;
        if (m.is_system !== true) return false;
        if (m.is_user === true) return false;
        return !!(m.name && String(m.mes || '').trim().length > 0);
    }
    // [v3.19] 增量书签（ruby reader.js）: 按用途记录已读楼层，只增量读新楼
    // 存 chatMetadata.extensions.LonShaMemory.bookmarks（ST 原生元数据通道）
    // [v3.20] Ebbinghaus 衰减评分（收编 ruby-phone-work，移植自 sxiphone）
    // 综合: 重要性×激活次数^0.3×e^(-λ·天数)×情绪权重×强化保护
    // 特例: pinned=999, permanent>=100, feel>=50, resolved×0.05
    function decayScore(m, conf) {
        if (!m) return 0;
        const lambda = conf?.lambda || 0.03;
        const now = Date.now();
        const lastActive = m.lastActive ? (typeof m.lastActive === 'number' ? m.lastActive : new Date(m.lastActive).getTime()) : (m.ts || now);
        const days = (now - lastActive) / 86400000;
        const hours = (now - lastActive) / 3600000;
        const importance = (m.importance !== undefined && m.importance !== null) ? m.importance : (m._isCore ? 1 : 0.5);   // [v3.20] 修复 ?? 与 ?: 优先级
        const activation = m.activationCount || 1;
        const strength = m.memoryStrength ?? (m._isCore ? 0.8 : 0.4);
        const freshHalfLife = conf?.freshHalfLife || 48;
        const reinforcement = 1 + Math.min((m.reinforcementCount || 0) * 0.15, 1.5);
        const arousal = m.emotion?.arousal ?? 0.5;
        const emotionWeight = 1 + arousal * 0.8;
        const combined = days <= (conf?.shortTermDays || 7)
            ? Math.exp(-0.1 * days) * 0.7 + emotionWeight * 0.3
            : emotionWeight * 0.7 + Math.exp(-0.1 * days) * 0.3;
        const freshness = 1 + Math.exp(-hours / freshHalfLife);
        let score = Math.max(importance, 1) * Math.pow(activation, 0.3) * Math.exp(-lambda * Math.max(days, 0)) * combined * freshness * (0.5 + strength * 0.5) * reinforcement;
        if (m.resolved) score *= 0.05;
        if (m.pinned) score = 999;
        return score;
    }
    // [v3.20] Ebbinghaus 补充字段（addCore/addRecent 写入时初始化）
    function _initEbbingMeta(m) {
        if (!m.ts) m.ts = Date.now();
        if (m.lastActive === undefined) m.lastActive = m.ts;
        if (m.activationCount === undefined) m.activationCount = 1;
        if (m.importance === undefined) m.importance = 3;   // 1-5 默认3
        if (m.memoryStrength === undefined) m.memoryStrength = 0.5;
        if (m.reinforcementCount === undefined) m.reinforcementCount = 0;
        if (m.emotion === undefined) m.emotion = { valence: 0.5, arousal: 0.5 };
        return m;
    }
    // [v3.23] 跨调用去重状态（NE-Memory recall_memory lastRecallMsgIds）
    // 缓存上一次注入召回结果的追溯指纹, 下次注入时若候选已被上轮覆盖则附加 [DEDUP] 提示
    const _recallDedupState = { lastTexts: null, lastQuery: '', lastChatId: '' };
    function recallDedupMark(candidates, curChatId, curQuery) {
        try {
            const st = _recallDedupState;
            const chatChanged = curChatId && st.lastChatId && curChatId !== st.lastChatId;
            if (chatChanged) { st.lastTexts = null; st.lastQuery = ''; st.lastChatId = curChatId; return null; }
            if (!st.lastTexts || !Array.isArray(candidates)) return null;
            const usedSet = new Set(st.lastTexts);
            const marked = [];
            for (const c of candidates) {
                const key = String(c.text || c.summary || c.name || '');
                if (key && usedSet.has(key)) marked.push(c);
            }
            return marked.length ? marked : null;
        } catch (e) { return null; }
    }
    function recallDedupRemember(recalled) {
        try {
            if (!Array.isArray(recalled) || !recalled.length) return;
            _recallDedupState.lastTexts = recalled.map(r => String(r.text || r.summary || r.name || '')).filter(Boolean).slice(0, 12);
        } catch (e) { errLog(e, 'nonfatal') }
    }
    // [v3.23.1] 跨调用去重指纹重置（NE-Memory 补救）: 事件清理 _recallCache 时同步清空 dedup 指纹，
    // 防编辑/swipe/删楼后旧楼层文本残留导致新内容被误标"已覆盖"
    function resetRecallDedup() {
        try { _recallDedupState.lastTexts = null; _recallDedupState.lastQuery = ''; _recallDedupState.lastChatId = ''; } catch (e) { errLog(e, 'nonfatal') }
    }
    /* ========================================================
     * [v3.154.0] 台账写入侧校验内核（anima「zod 式台账校验」）
     * --------------------------------------------------------
     * 动机（v3.2 DF3 的半成品）：DF3 只做了**渲染前清洗**——`_sanitizeItemOp`
     *   在 rebuildItems 里清洗派生视图，真源 itemOps 仍然脏。而真源是要落盘、
     *   要进携带包、要被导出/导入的；脏值于是永久留在存档里，且携带包路径
     *   （importCarryoverSeed）连渲染前清洗都绕不过——它把外部对象直接 push
     *   进真源，字段无长度、无枚举、无类型约束。
     *
     * 本内核把校验前移到**写入侧**（与 anima zod 台账同位置），三处收口：
     *   ① LLM 提取 items 入账前；② 携带包 carriedItems 入账前；③ 派生层仍留
     *   _sanitizeItemOp 兜底（旧档兼容，真源不动）。
     *
     * 设计纪律（对齐仓库既有风格）：
     *   - **宽容转换，非拒绝**：能修就修（裁长度、归枚举、拆互斥），修不了才丢；
     *     绝不因一项脏就丢整批（loose-json「逐项独立校验」同源纪律）。
     *   - **零依赖纯函数**：不碰 this、不碰 window，可独立单测。
     *   - **违规可观测**：每项违规带 reason，由调用侧记入环形账本并进诊断面板
     *     （先让失败可见，再让错误不可发生——v3.140 起的贯穿原则）。
     * ======================================================== */
    const LEDGER_ITEM_ACTIONS = ['add', 'update', 'remove'];
    const LEDGER_REMOVE_STATES = ['丢失', '损毁', '已消耗', '消耗完毕', '丢弃', '已丢弃', '遗落'];
    const LEDGER_ITEM_LIMITS = Object.freeze({
        name: 40, desc: 80, holder: 20, state: 10, location: 40,
        batch: 60,            // 单批入账上限（防一次提取灌入数百条撑爆真源）
        // [v3.352.0 · M5-X1] 借用关系字段长度限制
        lendTo: 20, borrowFrom: 20, returnDue: 40, ownerRef: 20
    });
    const LEDGER_HOLDER_PLACEHOLDERS = ['无', '地上', 'null', 'none', 'undefined'];

    /** 键名归一（与 MemoryEngine.normalizeItemKey / _sanitizeItemOp 同源规则） */
    function ledgerItemKey(name) {
        try {
            return String(name || '')
                .normalize('NFKC')
                .replace(/[\u300a\u300b\u3010\u3011\[\]\uff08\uff09\(\)\u0022\u0027\u201c\u201d\u2018\u2019\u3008\u3009]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
        } catch (e) { return String(name || '').trim().toLowerCase(); }
    }

    function ledgerClip(v, max) {
        if (v === undefined || v === null) return undefined;
        const s = String(v).replace(/\s+/g, ' ').trim();
        return s.length > max ? s.slice(0, max) : s;
    }

    /**
     * 单个物品 op 的宽容校验。返回 {ok, op?, reason?}。
     * @param {*} raw 原始项（可能来自 LLM / 携带包 / 旧存档）
     * @param {object} ctx { fallbackFloor } 缺省楼层
     */
    function validateLedgerItemOp(raw, ctx) {
        const c = ctx && typeof ctx === 'object' ? ctx : {};
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'not_object' };

        // --- action：缺省视为 add（LLM 提示词要求显式 action，但旧档/携带包常见缺失）
        const rawAct = String(raw.action ?? '').trim().toLowerCase();
        let action = rawAct;
        if (!action) action = 'add';
        if (action === 'del' || action === 'delete' || action === 'drop') action = 'remove';
        if (action === 'gain' || action === 'take' || action === 'get') action = 'add';
        if (LEDGER_ITEM_ACTIONS.indexOf(action) < 0) return { ok: false, reason: 'bad_action:' + rawAct };

        // --- name：必填，截断，归一键
        const name = ledgerClip(raw.name, LEDGER_ITEM_LIMITS.name);
        if (!name) return { ok: false, reason: 'missing_name' };
        const key = ledgerItemKey(name);
        if (!key) return { ok: false, reason: 'empty_key' };

        const op = { action: action, name: name, key: key };

        // --- floor：非负整数，缺省用 ctx
        const fRaw = raw.floor !== undefined && raw.floor !== null ? raw.floor : c.fallbackFloor;
        const fNum = Number(fRaw);
        op.floor = Number.isFinite(fNum) ? Math.max(0, Math.round(fNum)) : 0;

        const reasons = [];

        // --- desc
        const desc = ledgerClip(raw.desc, LEDGER_ITEM_LIMITS.desc);
        if (desc !== undefined) op.desc = desc;
        if (raw.desc !== undefined && raw.desc !== null && String(raw.desc).trim().length > LEDGER_ITEM_LIMITS.desc) reasons.push('desc_clipped');

        // --- holder：占位值归到「地上/遗落」（与 _sanitizeItemOp 同规则）
        if (raw.holder !== undefined && raw.holder !== null) {
            const h = String(raw.holder).trim();
            if (h === '' || LEDGER_HOLDER_PLACEHOLDERS.indexOf(h.toLowerCase()) >= 0) {
                op.holder = '地上/遗落';
                reasons.push('holder_placeholder');
            } else {
                op.holder = h.length > LEDGER_ITEM_LIMITS.holder ? h.slice(0, LEDGER_ITEM_LIMITS.holder) : h;
                if (h.length > LEDGER_ITEM_LIMITS.holder) reasons.push('holder_clipped');
            }
        }

        // --- state：空串/占位归「完好」（remove 动作不补）
        if (raw.state !== undefined && raw.state !== null) {
            const st = ledgerClip(raw.state, LEDGER_ITEM_LIMITS.state);
            if (st === '') { if (action !== 'remove') op.state = '完好'; }
            else op.state = st;
        } else if (action === 'add') {
            op.state = '完好';
        }

        // --- carried / location：布尔归 + 互斥自愈（v3.44 铁律）
        if (raw.carried !== undefined && raw.carried !== null) {
            const cv = raw.carried;
            op.carried = (cv === true || cv === 'true' || cv === 1 || cv === '1' || cv === 'yes');
            if (typeof cv === 'string' && !op.carried && cv !== 'false' && cv !== '0' && cv !== 'no') reasons.push('carried_coerced');
        }
        if (raw.location !== undefined && raw.location !== null) {
            const loc = ledgerClip(raw.location, LEDGER_ITEM_LIMITS.location);
            op.location = (loc === undefined || loc === 'null' || loc === 'none' || loc === '无') ? '' : loc;
        }
        if (op.carried === true) {
            if (op.location) reasons.push('mutex_carried_wins');
            op.location = '';
        } else if (op.location) {
            if (op.carried === true) reasons.push('mutex_location_wins');
            op.carried = false;
        }
        // [v3.352.0 · M5-X1] 借用关系字段（所有者 / 借出目标 / 借入来源 / 归还到期）
        if (raw.lendTo !== undefined && raw.lendTo !== null && String(raw.lendTo).trim()) {
            op.lendTo = ledgerClip(raw.lendTo, LEDGER_ITEM_LIMITS.lendTo);
        }
        if (raw.borrowFrom !== undefined && raw.borrowFrom !== null && String(raw.borrowFrom).trim()) {
            op.borrowFrom = ledgerClip(raw.borrowFrom, LEDGER_ITEM_LIMITS.borrowFrom);
        }
        if (raw.returnDue !== undefined && raw.returnDue !== null && String(raw.returnDue).trim()) {
            op.returnDue = ledgerClip(raw.returnDue, LEDGER_ITEM_LIMITS.returnDue);
        }
        if (raw.ownerRef !== undefined && raw.ownerRef !== null && String(raw.ownerRef).trim()) {
            op.ownerRef = ledgerClip(raw.ownerRef, LEDGER_ITEM_LIMITS.ownerRef);
        }
        return { ok: true, op: op, reasons: reasons };
    }

    /**
     * 批量校验（逐项独立，不因一项坏而丢全批）。
     * @returns {{items:Array, dropped:Array, violations:Array, clipped:number, batchTruncated:number}}
     */
    function validateLedgerItemOps(list, ctx) {
        const out = { items: [], dropped: [], violations: [], clipped: 0, batchTruncated: 0 };
        if (!Array.isArray(list) || !list.length) return out;
        const cap = (ctx && Number(ctx.batchLimit)) || LEDGER_ITEM_LIMITS.batch;
        const arr = list.length > cap ? list.slice(0, cap) : list;
        if (list.length > cap) out.batchTruncated = list.length - cap;
        for (let i = 0; i < arr.length; i++) {
            const r = validateLedgerItemOp(arr[i], ctx);
            if (r.ok) {
                out.items.push(r.op);
                if (r.reasons && r.reasons.length) {
                    out.clipped += 1;
                    out.violations.push({ kind: 'item_clipped', idx: i, name: r.op.name, reasons: r.reasons });
                }
            } else {
                out.dropped.push({ idx: i, reason: r.reason });
                out.violations.push({ kind: 'item_dropped', idx: i, reason: r.reason });
            }
        }
        return out;
    }

    /** 携带包条目校验（carriedItems：默认 add + 主角持有） */
    function validateCarriedItems(list, ctx) {
        const out = { items: [], dropped: [], violations: [], clipped: 0, batchTruncated: 0 };
        if (!Array.isArray(list) || !list.length) return out;
        const cap = (ctx && Number(ctx.batchLimit)) || LEDGER_ITEM_LIMITS.batch;
        const arr = list.length > cap ? list.slice(0, cap) : list;
        if (list.length > cap) out.batchTruncated = list.length - cap;
        for (let i = 0; i < arr.length; i++) {
            const it = arr[i];
            const merged = (it && typeof it === 'object') ? Object.assign({}, it, {
                action: 'add',
                holder: it.holder || '主角',
                carried: true,
                location: '',
                floor: 0
            }) : it;
            const r = validateLedgerItemOp(merged, Object.assign({}, ctx, { fallbackFloor: 0 }));
            if (r.ok) {
                out.items.push(r.op);
                if (r.reasons && r.reasons.length) {
                    out.clipped += 1;
                    out.violations.push({ kind: 'carried_clipped', idx: i, name: r.op.name, reasons: r.reasons });
                }
            } else {
                out.dropped.push({ idx: i, reason: r.reason });
                out.violations.push({ kind: 'carried_dropped', idx: i, reason: r.reason });
            }
        }
        return out;
    }

    class MemoryEngine {
        stateProvider = null;   // [v3.164] 由 plugin 注入的只读状态提供者（见 LonShaMemoryPlugin 构造）
        constructor(config) {
            // [v3.23] chatMetadata 迁移恢复防重入（NE auto-restore）
            this._migrateRestored = false;
            // [v3.25] 图扩散不应期疲劳（TriviumDB Refractory Period）: Top-N 赢家打疲劳标, 下轮命中降权
            this._diffusionFatigue = new Map();   // { nodeId/name: fatigueCount }
            this._diffusionFatigueTopN = 5;
            this._diffusionFatigueTimeout = 3;    // 疲劳标记保留轮数（防永久封印）
            // [v3.25] 归档隐藏状态（Bakemono archive-controller）
            this._archivedFloorIds = new Set();   // 已被插件归档隐藏的楼层（可恢复）
            /* [v3.275.0] O5：**归档处置的审计 provenance**（有界，最近 20 条）。
             *   修前处置只留一个计数（replayDrop/replayShift 的返回值），「剪了哪几楼 / 为什么」
             *   在处置那一刻就丢了 —— 事后答不出「这个归档为什么不见了」。
             *   写入方是 ledger-replay.js 的归档面（处置发生地），此处只负责持有与随会话归零。 */
            this._archiveShiftLog = [];
            /* [v3.277.0 O7] 三处 bindDeps 的注入读数（构造期填入）。
             *   初始为 null（未注入）与 [] 不同义：null = 还没走到那一步。 */
            this._bindDepsRead = null;
            /* [v3.277.0 O7] 重绑读数：构造期必然早于 extra_js 装载（取库口刻意惰性），
             *   故构造期三处注入在真实顺序下**必定** module-missing。init() 在 loadModules()
             *   之后重跑一遍并把结果落在这里（仍为 null = 还没重绑）。 */
            this._bindDepsRebindRead = null;
            // [v3.173] 缝合模块接线面：7 个「已挂载但零消费」模块（v3.163 账本）的读数台账。
            //   接线纪律是「每个模块必须获得真实消费点，且接线不得改变既有行为」——
            //   凡接线只做归因的，读数落在这里，诊断面板可查（坏了有人知道吗）。
            this._histFpRead = null;            // canonical-stringify.js：历史指纹走模块 FNV 还是本地回落
            this._npcTiesRead = null;           // npc-ties.js：模块版与内联版渲染对账
            this._npcTiesSource = 'inline';     // 'inline' | 'module+inline'
            this._entityRegistry = null;        // entity-semantic.js：世界书角色的语义登记表（跨轮持久）
            this._entityIdByName = null;        // 登记表名字 → 实体 id（upsertEntity 幂等所需）
            this._entityRegistryRead = null;    // 登记被拒 / 解析未命中的三态归因
            this._graphDedupCascade = null;     // dependency-closure.js：图谱幽灵边闭包归因
            this._cadenceTriage = null;         // extraction-cadence.js：维护轮次的按类型抽取节奏
            this._artifactTurnReconcile = null; // turn-reconciler.js：产物库轮次身份对账（只读数）
            this._floorRangeLedger = null;      // floor-range.js：覆盖水位 / 空洞 / 待处理段
            // [v3.27] 命中轨迹记录（MemoryPilot monitor）: 最近一次召回详情供面板诊断
            this._lastRecallTrace = null;   // { query, sources, hitCount, durationMs, ts, triggerHit }
            this._recallSourceStats = { total: 0, bySource: {} };  // [v3.52] P12: 各召回源累计命中率（诊断面板：哪路召回在干活）
            this._lastChangeTrace = null;   // [v3.127] 本轮变化注入产量/游标（诊断可见性：坏了有人知道吗）
            this._lastSaveGroundTruth = { ts: 0, floor: -1, sources: {} };   // [v3.130] 保存地面真源：最近一次保存的时间/楼层/来源计数
            // [v3.37] 叙事惊奇度/熵累加器（MemGPT 动态反思理念）
            this._narrativeEntropy = 0;
            /* [v3.301.0 · M-O2 第二刀] ★ 装配段已整段外提为 `_assembleComponents()`。
             *   为什么必须外提（真宿主实测）：本构造函数运行在**入口加载期**，而 manifest.extra_js
             *   要到 init() 里才由 ensureExtraJs() 挂上 —— 于是体内每个 `_new*` 工厂在这一刻
             *   取库口都读到 null，一律落到 `*Fallback` 空退路；装载之后**没人重建实例**，
             *   空退路就永久生效。真宿主读数：engine 32 + plugin 2 个成员 `_absent=true`、
             *   ConfigManagerFallback 持 0 键（真实现 181 键）、`saveConfig()` 是 `return undefined`
             *   —— 面板 toast「✅ 设置已保存」而 localStorage 一字未写。
             *   本刀把装配收成**唯一入口**：构造期调一次（模块未装载时的如实降级），
             *   装载之后由 `rebuildComponents()` 再调一次（真实现 + 数据回灌）。
             *   ★ 「模块缺席」因而与「模块在场」不同形 —— 前者是降级，后者是真装配。 */
            this._assembleRead = null;
            this._assembleComponents(config);

        }

        // [v3.147] API 凭据 401/403 冷却管控（Engine 代理入口）

        /** [v3.301.0 · M-O2 第二刀] ★ 唯一装配点（构造期 + 装载后各调一次，幂等）。
         *  为什么必须有它：所有 `_new*` 工厂与内联 window 降级都依赖 extra_js 挂上的模块全局，
         *  而挂载时机**晚于**本引擎的构造 —— 修前装配写在构造体内，于是模块在场也永远走空退路
         *  （真宿主实测：34 个成员 `_absent=true`、配置 0 键、saveConfig 空转、graph 空 Map）。
         *  `config` 缺省沿用现有 this.config；重建路径由 rebuildComponents 传入新造的真配置实例。 */
        _assembleComponents(config) {
            if (config !== undefined) this.config = config;
            else config = this.config;
            this.bookmarks = _newMemoryBooks('IncrementBookmark', this, errLog);   // [v3.19] 增量书签（ruby）· [v3.259.0] A1 第四刀外移
            this.config = config;
            this.graph = _newCore('MemoryGraph');   // [v3.266.0] A1 第六刀外移 memory-core.js
            this.summary = _newCore('SummarySystem');   // [v3.266.0] A1 第六刀外移 memory-core.js
            this.summary.fpOf = (m) => { try { return msgFpOf(m); } catch (e) { return ''; } };   // [v3.149] 卷摘要 intact：指纹函数注入位（独立单类测试无 SillyTavern 依赖时可覆盖）
            this.diary = _newNarrativeGenerator('DiarySystem');
            this.charMem = _newMemoryOrgan('CharacterMemoryBank');   // [v3.16] 角色记忆银行（核心/近期两层）· [v3.264.0] A1 第五刀外移
            this.worldProg = _newMemoryOrgan('WorldProgress');        // [v3.16] 世界推进（不在场角色）· [v3.264.0] A1 第五刀外移
            this.reflection = _newNarrativeGenerator('ReflectionSystem');  // [v2.8] RT-B 反思系统
            this.items = { records: [] };               // [v2.8] RT-C 物品台账（派生缓存）
            this._lastStoryDate = null;                 // [v2.9] RU-A 主动时间推进的锚点
            this._recallCache = null;                   // [v2.9] RU-D swipe 召回缓存 {floor, queryKey, injection}
            this._diaryInjectFloor = null;          // [v3.120] 变化驱动日记注入游标（首次按最近窗口初始化）
            this._timelineInjectFloor = null;     // [v3.121] 时间线变化注入游标
            this._timelineCursorChatId = null;   // [v3.123] 游标所属聊天
            this._timelineCursorFingerprint = ''; // [v3.123] 同楼 swipe/编辑指纹
            this._loadedChatId = null;   // [v3.140] CP: 内存已装载的存档身份（确认状态机判据）
            this._saveDeniedCount = 0;  // [v3.140] CP: 连续被拒次数（超阈降级放行，防永久卡死）
            this._archiveExtensions = {};   // [v3.142] CP: 未知顶层键收容所（round-trip 保留）
            this._mutationEpoch = 0;          // [v3.145] CP-L6: 状态变更栅栏号（回滚/恢复/切聊递增，作废在飞提取）
            this._epochDropped = 0;           // [v3.145] CP-L6: 因变更栅栏而过期被丢弃的任务数
            this._lastEpochBump = null;         // [v3.145] CP-L6: 最近一次变更栅栏推进
            this._staleTaskDropped = 0;   // [v3.141] CP: 会话租约过期被丢弃的异步任务数（跨聊天污染防线）
            this._recallArtifacts = [];                 // [v3.109] 逐轮召回产物（缝合 bionic turn-artifact，跨会话复用依据）
            this._recallArtifactEvictions = { byAge: 0, byCap: 0, lastFloor: null, lastRemoved: 0, lastAt: 0 };   // [v3.156] 产物淘汰累计账（老化 vs 超容量分账，诊断可解释）
            this._recallAudit = [];                     // [v3.150] A 召回命中自检账本（环形 50 轮：query/各来源命中数/空结果）
            // [v3.172] 召回漏斗读数面：v3.95/v3.96 缝入的四个模块（智能分块 / 前置 AI 精选 /
            //   统一召回 / 副 API 通道）在 76 个版本里无人审计它们的「收缩阶段」。
            //   漏斗每一处变窄都是静默的——截断、判不了、映射不上、硬切、副通道失败。
            this._recallFunnel = [];                    // 逐轮漏斗读数（环形 500，与门控台账同规格）
            this._recallFunnelDropped = 0;              // 环形淘汰量（与 _triggerDropped 同规格，可对账）
            this._recallFunnelReadEmpty = 0;            // 累计轮数：本轮漏斗一次都没读到（I6）
            // [v3.215.0] R2-A 注入读数：`_lastInjection`（AI 真看到的）与它的**外供面**
            //   `buildInjectionReadout()` 的原生三键。显式置 null 而不是靠 undefined ——
            //   「未跑过」（null）与「跑过、但值为空」必须可分，这是本仓治理过多轮的形态。
            //   `_injectionRound` 是轮次的**单一真源**：真生成每轮 +1（含 0 块的一轮），
            //   块引用键 `_injectionRefOf` 也取它 —— 于是「这轮 0 块」与「这轮还没跑」
            //   在读数上是两个不同的 round。
            this._lastInjection = null;                 // 最近一次**真生成**的注入读数（唯一构造点 _injectionRecord）
            this._lastInjectionDraft = null;            // 本轮逐块读数草稿（buildInjection 现算，零块路径留空）
            this._lastInjectionDiscard = null;          // 最近一次代际过期留痕（_injectionDiscardStale）
            /* [v3.298.0 · M-O3] 本轮预算/裁剪/注入回执（`injection-receipt.js` 派生）。
             *   与 `_lastCostLedger` / `_lastForecast` 的关系：那两格是**归因面**（谁的字符）
             *   与**预测面**（下轮会怎样），本格是**量纲面** —— 六类量各叫什么、口径是什么、
             *   哪些不可测。三格读同一条 trace，互不重算。
             *   显式置 null 而不是靠 undefined：「模块未加载」与「本轮是空的」必须可分。 */
            this._lastReceipt = null;
            this._injectionRound = 0;                   // 真生成轮次（0 块的一轮也推进）
            // [v3.216.0] R2-B 暂存面：生成路径在 await 内部只**暂存**载荷，
            //   载荷在代际确认之后由 _injectionCommit 落成读数。
            //   不设这一层，读数会在 await 期间被写脏（后到的 STARTED 会把它超过）。
            this._injectionPending = null;
            this._injectionStale = 0;                   // 代际过期累计次数（≥0 即「有过迟到结果」）
            // [v3.218.0] R2-E：结局计数账（completed / aborted / noReadout / afterReadout）。
            //   为什么要分四个数：正常完成、被用户中止、本轮没跑注入、已判定后又来一次信号 ——
            //   四者处置各不相同，合成一个计数就等于把「中止」读成「完成」。
            this._injectionEnded = { completed: 0, aborted: 0, noReadout: 0, afterReadout: 0 };
            // [v3.217.0] R2-D：暂存里**带自己的代**（`_injectionStage` 落 `gen`），提交时核对；
            //   两条发布路径（GENERATION_STARTED 事件 / interceptor 兼容入口）各占一代并各自收尾
            //   （`_injectionClose`），于是「谁的载荷谁提交」，无主载荷既不落成读数也不静默消失。
            this._diagnostics = null;                   // [v3.215.0] 诊断读数面（selfCheck dry-run 等，**不进** _lastInjection）
            this._generationActive = false;             // [v3.10] 生成中标志（GENERATION_STARTED→MESSAGE_RECEIVED 之间为 true；自愈调度器读它防并发）
            this.snapshots = _newMemoryAux('SnapshotManager');     // [v2.9] RU-C 存储快照
            this._lastKnownChatLen = 0;  // [v3.1] SF2 渲染切片保护基线
            this._lastOptimizeFloor = 0;                // [v2.9] RU-B 优化周期锚点
            this.itemOps = [];                          // 物品 ops 真源（楼层回滚用）
            this._ledgerViolations = [];                 // [v3.154] 台账写入校验违规环形账本（诊断可观测）
            this._ledgerMissingRollbacks = 0;             // [v3.155] 因账本淘汰而无法回滚的楼层请求数（诊断可观测）
            this._lastReplayReport = null;
            // [v3.261.0 缝合 MyriadKnots] 两个留档显式初始化为 null（三态的第一态：**没查过**）。
            //   为什么不靠 undefined 隐式兜底：`undefined` 与「查过但判不了」在判据里都走 falsy 分支，
            //   两者一旦同形，「没查过」与「查过没问题」就分不开了 —— 那正是本刀要修的那类静默。
            this._lastArchiveAudit = null;      // 最近一次导入/恢复的存档三分体检读数
            this._lastItemOpsClaim = null;      // 最近一次导入的物品 op 忠实认领证明
            this._lastRollbackPreview = null;   // [v3.235.0] R4-A：最近一次破坏前的只读预告（与 _lastReplayReport 成对，可对账）                // [v3.182] 最近一次账本回放报告（删楼/前移的分态留痕，诊断可观测）
            // [v3.236.0] R4-B 缺口 2：定期快照的节流锚点此前是**裸楼层数**（`_lastSnapshotFloor`），
            //   它不认会话身份 —— 在 B 会话里，`curFloor - A的锚点` 恒为负数（首楼 index 为 0 时
            //   `0 - 400 = -400` 为真值、判据不触发），于是 B 的快照**一份都不落盘**，且不报错。
            //   修法不是「清空锚点」而是**把它**（以及它的账）**钉在会话身份上**：身份不符时
            //   重置为 0，于是第一次判定走「首份快照」分支 —— 与从未快照过的会话逐字同形。
            //   刻意不叫 `_lastSnapshotFloor`：同名同义要求它只表示「锚点楼层」，语义由
            //   `_snapshotAnchorOf(chatId)` 承载（查询副作用为「按会话初始化」，读取语义为零）。
            this._snapshotAnchorChatId = null;   // [v3.236.0] 锚点归属的会话（身份）
            this._snapshotAnchorFloor = 0;       // [v3.236.0] 该会话内最近一次快照的楼层
            this._snapshotByChat = [];           // [v3.236.0] 快照落盘台账 [{at, chatId, floor}]（最近 20 条，诊断可观测）
            this._clearRuntimeReport = null;     // [v3.236.0] 最近一次「清空运行内存」的逐面结局（清空面板的破坏前预告读数）
            this._restoredKeyHistory = new Set();  // [v3.236.0] 曾经被恢复进来的面（键历史）—— 清空覆盖核对的真源，随会话身份归零
            this.vector = _newMemoryOrgan('VectorStore', config);   // [v3.264.0] A1 第五刀外移
            this.storage = _newMemoryOrgan('StorageManager');   // [v3.264.0] A1 第五刀外移
            this.llm = _newMemoryOrgan('LLMCaller', config);   // [v3.264.0] A1 第五刀外移
            // [v1.8] P0
            this.pov = _newMemoryLedger('PovMemory');
            this.timeline = _newMemoryBooks('PlotTimeline');
            // [v3.46] 剧情时钟与回忆隔离
            this.clock = _newCore('GameClock');   // [v3.266.0] A1 第六刀外移 memory-core.js
            // [v1.9] P1
            this.bm25 = _newMemoryBooks('BM25');
            // [v3.152] ANIMA 词典线：术语词典实例（默认开；构造零依赖，存档键 lexicon）
            // [v3.157] 配置接线：此前这里不传参，EntityLexicon 恒用内建默认 40，
            //   `termLexiconMax` 的 UI 滑块与卡覆盖均为死配置（改了没反应）。
            // [v3.264.0 A1 第五刀] 改用统一构造点：模块在场取真实现，缺席退到 OrganFallback
            //   （同形空实现）—— 不再内联降级对象（两份实现会漂移，本仓已治理过多轮）。
            this.lexicon = _newMemoryOrgan('EntityLexicon', {
                max: numOr(this.config.config.termLexiconMax, 40)
            });
            this.prequel = _newMemoryBooks('PrequelSystem');   // [v3.87] 吸收 MyriadKnots recall-prequel：用户导入前情资料
            // [v3.264.0 A1 第五刀] 六个器官已外移 memory-organs.js：构造点建好之后，把主人符号
            //   **现算注入**模块（errLog / numOr / decayScore / _initEbbingMeta / sanitizeJson /
            //   _moduleLib / fetchWithTimeoutRetry / VERSION）。放在这里而不是构造函数开头：
            //   注入本身要读 _memoryOrgansLib()，而取库口是惰性的（extra_js 后加载）——
            //   早注也是注给同一个模块对象，但放在器官构造点旁边，「谁依赖谁」一眼可读。
            /* [v3.277.0 O7] 注入结果**必须被读出来**（计划原文：bindDeps 全量注入及失败部分可观察）。
             *   修前三处调用点都把返回值丢掉，而失败与「成功但换了 0 项」的返回值都是 0 ——
             *   于是「模块没加载」「模块抛错」「模块在但一个 key 都没对上」三种根因同形，
             *   且**没有任何一面**能回答「这一轮到底注进去了没有」。
             *   现在收进 this._bindDepsRead：每项三态（ok=true 带 swapped / ok=false 带 why），
             *   由 selfCheck 的「依赖注入」行输出。 */
            this._bindDepsRead = [
                Object.assign({ tag: 'organs' }, _bindOrganDeps()),
                Object.assign({ tag: 'core' }, _bindCoreDeps()),   // [v3.266.0] A1 第六刀
                Object.assign({ tag: 'config' }, _bindConfigDeps()),   // [v3.267.0] A1 第七刀
            ];
            // [v2.0] P2
            this.status = _newCore('CharacterState');   // [v3.266.0] A1 第六刀外移 memory-core.js
            this.status.clock = this.clock;   // [v3.180] 年龄读数的日期解析助手来源（引擎侧注入优先；
            //   状态层副本里没有这个引用时自建 RelativeTimeHelper —— 修前 this.clock 恒 undefined，
            //   于是 age-anchor 的 parseFn 静默返回 undefined，估算态永不达成）
            // [v3.155] 楼层账本：上限可配 + 淘汰可见（淘汰即「回滚能力失效」，必须让人知道）
            this.ledger = _newMemoryAux('FloorLedger', {
                maxFloors: Number(this.config.config.floorLedgerRetention) || 400,
                onEvict: (floor, total) => {
                    try { this.opLog?.log?.('ledger', 'evict', String(floor), Number(floor), `楼层账本上限淘汰（累计 ${total}）: 第${floor}楼回滚能力失效`); } catch (e) {}
                    if (this.config.config.floorLedgerEvictionDebug) console.warn(`[${PLUGIN_NAME}] 楼层账本淘汰: 第${floor}楼（累计 ${total}）——该楼回滚能力失效，其图谱/POV/时间线条目将无法按楼撤销`);
                }
            });
            // [v2.1] P3
            this.mutex = _newMemoryAux('Mutex');
            this.holiday = _newMemoryAux('HolidayAware');
            // [v3.153] ANIMA 感知线：swipe 重绘态 + 当前楼层标记（无条件维护，消费在 computeRecallQuota 且受总门控）
            this._swipeRegen = false;   // 末楼 swipe_id>0（正在重绘 assistant 回复）
            this._currentFloor = -1;    // 当前楼层（台账臂窗口锚点）
            // [v2.2] RC
            this.suspense = _newMemoryBooks('SuspenseBook');
            // [v3.181] SG: 场所图景（构造期只取函数调用结果，不缓存模块对象）
            this.scene = _newSceneBook();
            // [v2.5] RF
            this.echo = _newMemoryBooks('EchoPool', () => this.config?.config || null, errLog);
            // [v3.30] PV: 记忆矛盾换代（window.LonShaSupersede）
            this.supersede = new (this._winModule('LonShaSupersede', 'SupersedeManager') || function() {
                this.supersededMap = {}; this.config = {};
                this.scan = () => []; this.isSuperseded = () => false;
                this.revive = () => 0; this.export = () => ({supersededMap:{}}); this.import = () => {};
            })();
            // [v3.47] 钱财账本 + 剧情卡牌（hcdiary 吸收）
            this.moneyLedger = _newMemoryLedger('MoneyLedger');
            this.cards = _newMemoryLedger('CardCollection');
            this.conflicts = _newMemoryLedger('ConflictBook');
            this.deltaBook = _newMemoryLedger('DeltaBook');  // [v3.66] 正史增量账本
            // [v3.94] CSE 级人物状态引擎（自研融合增强版，window.LonShaCSE，降级为空实现）
            this.cse = new (this._winModule('LonShaCSE', 'CSEngine') || function() {
                return { set(){return null}, addFromExtracted(){return 0}, confirm(){return false}, get(){return []}, getToward(){return []}, toPrompt(){return ''}, shiftFloors(){return 0}, removeByFloor(){return 0}, removeChar(){return false}, export(){return {chars:{}}}, import(){} };
            })();
            this.outline = _newNarrativeGenerator('OutlineDirector');
            // [v3.95] 叙事心电图（完全原创·LonSha 独有，window.LonShaNarrativePulse，降级为空实现）
            this.pulse = new (this._winModule('LonShaNarrativePulse', 'NarrativePulse') || function() {
                return { beat(){return null}, diagnose(){return {status:'flow',advice:'',streakHigh:0,streakLow:0,avgTension:0,avgPolarity:0}}, getArc(){return null}, toPrompt(){return ''}, shiftFloors(){return 0}, removeByFloor(){return 0}, export(){return {beats:[],arcs:{}}}, import(){} };
            })();
            this.pairMem = _newMemoryLedger('PairMemory');
            this.opLog = _newMemoryAux('OpLog');  // [v3.54] 事件溯源日志
            // [v3.96] 缝合四模块实例化（降级为空实现，缺 window 全局时不影响主链路）
            // ① 前置 AI 精选（ai-select.js）：候选语义精选，注入 llm.callAPI 走独立API+宿主双通道
            this.aiSelect = new (this._winModule('LonShaAISelect', 'AISelect') || function() {
                return { async route(c){ return { selected: (c||[]), source: 'local-noai', candidates: (c||[]).length, aiRaw: null }; }, lastTrace: null };
            })({
                callAI: async (prompt) => { try { return await this.llm.callAPI(prompt); } catch (e) { return null; } },
                maxCandidates: this.config.config.aiSelectMaxCandidates || 20,
                maxSelect: this.config.config.aiSelectMaxSelect || 6
            });
            // ② STM/LTM 游标巩固（stm-ltm.js）：纯函数引擎，state 持久化到 chatMetadata
            this.stmLtm = this._winModule('LonShaStmLtm') || null;
            // ③ 统一召回管线（unified-recall.js）：图谱节点候选化
            this.unifiedRecall = this._winModule('LonShaUnifiedRecall') || null;
            // ④ 副API通道表（api-channels.js）：任务路由
            this.apiChannels = this._winModule('LonShaApiChannels') || null;
        // [v3.361.0] Wire engine-diagnostic-lines.js
        try {
            const DL = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js');
            if (DL && typeof DL.bindDeps === 'function') {
                DL.bindDeps({
                    moduleLib: _moduleLib,
                    errLog: errLog,
                    _changeset: () => _changeset(),
                    libs: {
                        _causalChainLib: _causalChainLib,
                        _correctionPlanLib: _correctionPlanLib,
                        _emotionOppositeLib: _emotionOppositeLib,
                        _extractionDriverLib: _extractionDriverLib,
                        _factStateLib: _factStateLib,
                        _fatedRecallLib: _fatedRecallLib,
                        _loreCrosscheckLib: _loreCrosscheckLib,
                        _materialPackLib: _materialPackLib,
                        _narrativeLayerLib: _narrativeLayerLib,
                        _perspectiveCardLib: _perspectiveCardLib,
                        _recallExplainLib: () => _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js')?._recallExplainLib(),
                        _relationHistoryLib: _relationHistoryLib,
                        _returnGateLib: _returnGateLib,
                        _summaryProvenanceLib: _summaryProvenanceLib,
                        _testimonyBoardLib: _testimonyBoardLib,
                        _worldlineMemoryLib: _worldlineMemoryLib,
                    },
                });
            }
        } catch (e) { errLog(e, 'assembleComponents.diagnostic-lines'); }
        // [v3.421.0] 第八/十一期 24 个模块的就绪面。为什么必须有这一处：它们刚入册，
        //   若只留取库口没人调，模块接线审计 B4 会当场判「已挂载但零消费」（本仓零容忍，
        //   实测 24 项全红）。这里每轮装配真调一次，缺面与自检问题都落读数，不吞。
        try {
            this._newFaceRead = _collectNewFace();
        } catch (e) { errLog(e, 'assembleComponents.new-face'); }
        try {
            const ER = _moduleLib(() => window.LonShaEngineReport, 'engine-report.js');
            if (ER && typeof ER.bindDeps === 'function') {
                ER.bindDeps({ errLog: errLog });
            }
        } catch (_e2) { errLog(_e2, 'assembleComponents.ready-face'); }
        try {
            const QT = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js');
            if (QT && typeof QT.bindDeps === 'function') {
                QT.bindDeps({
                    moduleLib: _moduleLib,
                    errLog: errLog,
                    libs: {
                        _evidenceQueryLib: _evidenceQueryLib,
                        _evidenceQueryLedgersOf: _evidenceQueryLedgersOf,
                        _qaHelpDeps: _qaHelpDeps,
                        _ledgerApis: _ledgerApis,
                        _qaThreadLib: _qaThreadLib,
                        _memoryToolsLib: _memoryToolsLib,
                        _experienceRebuildLib: _experienceRebuildLib,
                        _dualTimeLib: _dualTimeLib,
                        _evidenceSolverLib: _evidenceSolverLib,
                        _resolutionLadderLib: _resolutionLadderLib,
                        _sceneOrchestratorLib: _sceneOrchestratorLib,
                        _impactPreviewLib: _impactPreviewLib,
                        _hypothesisWorkspaceLib: _hypothesisWorkspaceLib,
                        _researchCollectionLib: _researchCollectionLib
                    }
                });
            }
        } catch (_e2) { errLog(_e2, 'assembleComponents.ready-face'); }
        try {
            const RO = _moduleLib(() => window.LonShaEngineRepairOps, 'engine-repair-ops.js');
            if (RO && typeof RO.bindDeps === 'function') {
                RO.bindDeps({
                    moduleLib: _moduleLib,
                    errLog: errLog,
                    libs: {
                        _repairLoopLib: _repairLoopLib,
                        _correctionPlanLib: _correctionPlanLib,
                        _evidenceQueryLib: _evidenceQueryLib,
                        _factVersionLib: _factVersionLib,
                        _memoryCenterLib: _memoryCenterLib,
                        _eventCompletenessLib: _eventCompletenessLib
                    }
                });
            }
        } catch (_e2) { errLog(_e2, 'assembleComponents.ready-face'); }
        try {
            const PO = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js');
            if (PO && typeof PO.bindDeps === 'function') {
                PO.bindDeps({
                    VERSION,
                    PLUGIN_NAME,
                    ARCHIVE_SCHEMA_VERSION,
                    ARCHIVE_TOP_LEVEL_KEYS,
                    ARCHIVE_TOP_LEVEL_KEY_SET,
                    errLog,
                    msgFpOf,
                    validateLedgerItemOps,
                    _errBuf,
                    isPlainObject,
                    _numOrNull,
                    _floorOrNull,
                });
            }
        } catch (_e2) { errLog(_e2, 'assembleComponents.ready-face'); }
        try {
            const IP = _moduleLib(() => window.LonShaEngineInjectionPipeline, 'engine-injection-pipeline.js');
            if (IP && typeof IP.bindDeps === 'function') {
                IP.bindDeps({
                    VERSION,
                    PLUGIN_NAME,
                    _moduleLib,
                    errLog,
                    numOr,
                    estimateTextTokens,
                    relativeTimeLabel,
                    buildNpcTierInjection,
                    classifyRelationshipType,
                    _costForecastLib,
                    _costLedgerLib,
                    _injectionReceiptLib,
                    _projectionLib,
                    _relationHistoryLib,
                });
            }
        } catch (_e2) { errLog(_e2, 'assembleComponents.ready-face'); }
        try {
            const EC = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js");
            if (EC && typeof EC.bindDeps === "function") {
                EC.bindDeps({
                    VERSION,
                    PLUGIN_NAME,
                    /* [v3.370.0] 证据中心集群外移后，存档键契约不再是本作用域自由变量：
                     *   记忆包装配点的 ARCHIVE_KEYS 由该模块 _archiveKeys() 三级解析，
                     *   第一级就是注入 —— 不注入即恒 null（键面永远未判，E1 红）。 */
                    ARCHIVE_TOP_LEVEL_KEYS,
                    _moduleLib,
                    errLog,
                    numOr,
                    _ledgerApis: () => this._ledgerApis(),
                    _evidenceQueryLedgersOf: () => this._evidenceQueryLedgersOf(),
                    _qaHelpDeps: () => this._qaHelpDeps()
                });
            }
        } catch (_e2) { errLog(_e2, 'assembleComponents.ready-face'); }
        try {
            const SC = _moduleLib(() => window.LonShaEngineSelfCheck, 'engine-self-check.js');
            if (SC && typeof SC.bindDeps === 'function') {
                SC.bindDeps({
                    VERSION,
                    errLog,
                    hintForError,
                    getErrBuf: () => (typeof _errBuf !== 'undefined' ? _errBuf : []),
                    _formatBindDepsRow,
                    _moduleFailureSnapshot,
                    _schemaMigrationLib,
                    _moduleRegistryLib,
                    _cacheIdentityLib,
                    _changeset,
                    CARRYOVER_CONTRACT_KEYS
                });
            }
        } catch (_e2) { errLog(_e2, 'assembleComponents.ready-face'); }
        try {
            const SA = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js');
            if (SA && typeof SA.bindDeps === 'function') {
                SA.bindDeps({
                    moduleLib: _moduleLib,
                    errLog: errLog,
                    libs: {
                        loreImport: _loreImportLib(),
                        storyAnnual: _storyAnnualLib(),
                        factVersion: _factVersionLib()
                    }
                });
            }
        } catch (_e2) { errLog(_e2, 'assembleComponents.ready-face'); }
        try {
            const RC = _moduleLib(() => window.LonShaEngineRecall, 'engine-recall.js');
            if (RC && typeof RC.bindDeps === 'function') {
                RC.bindDeps({
                    errLog: errLog,
                    libs: {
                        _emotionOppositeLib: _emotionOppositeLib,
                        _factAdmissionLib: _factAdmissionLib,
                        _sleepAwakenLib: _sleepAwakenLib,
                        _summaryProvenanceLib: _summaryProvenanceLib
                    }
                });
            }
        } catch (_e2) { errLog(_e2, 'assembleComponents.ready-face'); }

        try {
            const EP = _moduleLib(() => window.LonShaEngineExecutionPipeline, 'engine-execution-pipeline.js');
            if (EP && typeof EP.bindDeps === 'function') {
                EP.bindDeps({
                    moduleLib: _moduleLib,
                    errLog: errLog,
                    classifyRelationshipType: classifyRelationshipType,
                    detectEthicsConflict: detectEthicsConflict,
                    _newRelativeTimeHelper: _newRelativeTimeHelper,
                    validateLedgerItemOps: validateLedgerItemOps,
                    numOr: numOr,
                    hash32: hash32,
                    cyclePositionFor: cyclePositionFor
                });
            }
        } catch (e) { errLog(e, 'assemble.executionPipeline'); }
            return this;
        }
        /** [v3.301.0 · M-O2 第二刀] 装载之后的重建：先冻用户数据面 → 重装配 → 回灌。
         *  读数落 `_assembleRead`（before/after 各自 real/absent，可对账「真的换过来了」）。
         *  失败只留痕、不阻断（与 ensureExtraJs / rebindModuleDeps 同规格）。 */
        rebuildComponents(newConfig) {
            const read = { at: Date.now(), rebuilt: false, frozen: 0, restored: 0, before: null, after: null, why: '' };
            try {
                read.before = this._componentProbe();
                if (read.before.absent === 0) {
                    read.why = 'already-live';   // 模块提前在场（判据夹具 / 热更新）⇒ 无需重建
                    /* [v3.301.0] 已全真时不重装，但**传入的新配置实例必须装上**：
                     *   init() 每次都会新造一份 configMgr 传进来，若因为“已全真”就丢掉它，
                     *   会出现 plugin.configMgr 与 engine.config 各持一份的分裂（面板读一份、保存另一份）。 */
                    if (newConfig !== undefined && newConfig !== null && newConfig !== this.config) {
                        this.config = newConfig;
                        read.configSwapped = true;
                    }
                } else {
                    const snap = this._captureComponentState();
                    read.frozen = snap ? (snap.__slots || 0) : 0;
                    this._assembleComponents(newConfig);
                    read.restored = this._restoreComponentState(snap);
                    read.rebuilt = true;
                }
                read.after = this._componentProbe();
            } catch (e) {
                read.why = 'error:' + String((e && e.message) || e).slice(0, 200);
                try { errLog(e, 'O2.rebuildComponents'); } catch (_e) { /* 留痕不得成为新的失败 */ }
            }
            this._assembleRead = read;
            return read;
        }
        /** [v3.301.0 · M-O2 第二刀] 装配体检读数：真实现 / 空退路各几个（「模块缺席不冒充空账」）。 */
        _componentProbe() {
            let total = 0, real = 0, absent = 0;
            for (const n of this._componentSlots()) {
                const v = this[n];
                if (v === null || v === undefined || typeof v !== 'object') continue;
                total += 1;
                if (v._absent === true) absent += 1; else real += 1;
            }
            return { total, real, absent };
        }
        /** 受检成员名（装配段 `this.X = ...` 的两类消费面：工厂产物 + window 直取面）。 */
        _componentSlots() {
            return ['bookmarks', 'graph', 'summary', 'diary', 'charMem', 'worldProg', 'reflection',
                'snapshots', 'vector', 'storage', 'llm', 'pov', 'timeline', 'clock', 'bm25',
                'lexicon', 'prequel', 'status', 'ledger', 'mutex', 'holiday', 'suspense', 'scene',
                'echo', 'moneyLedger', 'cards', 'conflicts', 'deltaBook', 'outline', 'pairMem',
                'opLog', 'supersede'];
        }
        /** 冻「用户数据面」：重建前必须把有状态组件的内容取出（否则重建 = 清空存档）。
         *  契约：**只取 export() 的返回值**，取不到就记 null（null 与 {} 不同义）。 */
        _captureComponentState() {
            const out = {};
            const take = (k) => {
                try {
                    const v = this[k];
                    out[k] = (v && typeof v.export === 'function') ? v.export() : null;
                } catch (_e) { out[k] = null; }
            };
            for (const k of ['graph', 'summary', 'diary', 'charMem', 'worldProg', 'reflection',
                'vector', 'pov', 'timeline', 'clock', 'bm25', 'prequel', 'status', 'suspense',
                'scene', 'echo', 'moneyLedger', 'cards', 'conflicts', 'deltaBook', 'outline',
                'pairMem', 'bookmarks', 'supersede', 'ledger']) take(k);
            out.__slots = Object.keys(out).length - 1;
            return out;
        }
        /** 回灌：把冻下来的面装回重建后的真实现（`import` 契约同构；失败只留痕）。 */
        _restoreComponentState(snap) {
            if (!snap) return 0;
            let n = 0;
            for (const k of Object.keys(snap)) {
                if (k === '__slots') continue;
                const data = snap[k];
                if (data === null || data === undefined) continue;
                const v = this[k];
                if (!v || typeof v.import !== 'function') continue;
                try { v.import(data); n += 1; } catch (e) { try { errLog(e, 'O2.restore.' + k); } catch (_e) { /* 留痕不得成为新的失败 */ } }
            }
            /* [v3.180] status.clock 是跨实例引用：装配段只在其构造点设一次，重建后必须重挂。 */
            try { if (this.status && this.clock) this.status.clock = this.clock; } catch (_e) { /* 非致命 */ }
            return n;
        }
        /** 惰性取模块全局：构造期读不到（extra_js 未挂）与重建期读得到，必须不同形。 */
        _winModule(globalName, propName) {
            try {
                const g = (typeof window !== 'undefined') ? window[globalName] : null;
                if (!g) return null;
                return propName ? (g[propName] || null) : g;
            } catch (_e) { return null; }
        }
        clearApiCooldowns() { clearApiCooldowns(); }
        getApiCooldownStats() { return getApiCooldownStats(); }
        
        // [v3.1] SF5: 番外楼判定（抄 baibai bbs_omit——标记楼对引擎彻底不存在）
        // [v3.109] 历史指纹（缝合 bionic turn-artifact 的 historyFingerprint）：
        //   把「已落定楼层（除末楼外）的角色+文本」折叠成一个稳定指纹。
        //   用途：召回产物复用的判据——位置与查询都没变，但更早的历史被编辑/删楼/回填时，
        //   指纹必然变化 → 拒绝复用陈旧注入（这是既有三元组缓存覆盖不到的场景）。
        //   纯读，无副作用；超长历史只取尾部 40 条（早期楼层已被摘要覆盖，逐字比对价值低）。
        _historyFingerprint() {
            try {
                const ctx = window.SillyTavern?.getContext?.();
                const chat = ctx?.chat || [];
                if (!chat.length) return '';
                const tail = chat.slice(0, Math.max(0, chat.length - 1)).slice(-40);
                // [v3.173] 缝合模块接线面：canonical-stringify.js 缝入后 73 个版本无人调用
                //   （v3.163 账本「已挂载但零消费」），而本处手写了一份 FNV-1a 折叠——
                //   同一算法两处实现就是漂移源。现改为**优先**取用模块 fnv1a，取不到回落本地。
                //   等价性论证（改造必须逐字节零漂移）：旧实现是「逐条折叠 + 每条后追加 0x2c
                //   再折叠」，而 0x2c 就是 ','，FNV-1a 又逐字符推进无长度前缀，故等价于
                //   「各条以 ',' 拼接（含尾随）后整体折叠」。两处乘法也同余：模块用
                //   h + (h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24)，系数和恰为 0x01000193。
                const _cl = _moduleLib(() => window.LonShaCanonical, 'canonical-stringify.js');
                const _parts = [];
                for (const m of tail) {
                    _parts.push((m?.is_user ? 'u:' : 'a:') + String(m?.mes || '').replace(/\r\n/g, '\n').trim());
                }
                const _read = { tail: tail.length, folded: 0, via: 'local' };
                let hex;
                if (_cl && typeof _cl.fnv1a === 'function') {
                    const _joined = _parts.join(',') + (tail.length ? ',' : '');
                    _read.folded = _joined.length;
                    _read.via = 'canonical';
                    hex = _cl.fnv1a(_joined);
                } else {
                    let h = 0x811c9dc5;
                    for (const p of _parts) {
                        for (let k = 0; k < p.length; k++) {
                            h ^= p.charCodeAt(k);
                            h = Math.imul(h, 0x01000193);
                        }
                        h ^= 0x2c; h = Math.imul(h, 0x01000193);   // 条目分隔符
                    }
                    _read.folded = _parts.join('').length;
                    hex = (h >>> 0).toString(16).padStart(8, '0');
                }
                this._histFpRead = _read;
                return hex + '_' + tail.length;
            } catch (e) { return ''; }
        }
        /**
         * [v3.254.0] M-O4：**数据修订号**的唯一对读口（计划原文点名的身份第三位）。
         *
         * 【为什么不能直接读 `storage._revision` —— 本版实测的否证】
         *   计划原文要求身份含「数据修订号」。`StorageManager._revision` 是最像它的字段
         *   （乐观并发锁），但实测 `save()` 的 17046 行是**无条件** `this._revision += 1`：
         *   它数的是「落盘**次数**」。而 index.js 每次生成都落盘 —— 于是身份**每一轮都在变**，
         *   任何以它为判据的内存缓存（`_recallCache` 首当其冲）永不命中 ⇒ 计划原文
         *   「优化不能靠隐瞒截断」在这里的形态是**静默禁用缓存**：不报错、只是白花钱。
         *
         * 【本访问器改读什么】读 `_historyFingerprint()` —— 它是**已落定楼层的折叠**，
         *   逐条来自 chat 数组；只有「上游楼被编辑 / 删楼 / 回填 / 导入恢复」才变。
         *   于是它对外扮演「数据修订号」这个职责，同时**确实**满足语义：
         *   回合内重复读稳定（缓存可命中）、上游真变即失效。
         *
         * 【为什么与 `cache-identity.js` 的 `revision` 位是两回事（读法须看清）】
         *   · 本方法产出 → 喂进 `historyFingerprint` 位（「历史内容改了吗」）。
         *   · `revision` 位留给**外部在飞的排他修订**（`reconcilePlotlines` 的 expectedRevision），
         *     **本引擎不自行填**（v3.255.0 修复：首稿曾填 `storage.getRevision()`，见下）。
         *
         * 【v3.255.0 修复的形态 —— 首稿填了一位「每轮都在变」的读数】
         *   首稿写 `revision: this.storage.getRevision()`，而那**正是本文件头注上一段警告过的来源**：
         *   `StorageManager.save()`（index.js:17179）是**无条件** `this._revision += 1` ——
         *   它数的是「落盘**次数**」，与内容无关。于是同一楼发生任何一次**即时存盘**
         *   （`MESSAGE_EDITED` / `MESSAGE_SWIPED` / `MESSAGE_DELETED` 三条路径都会立即落盘）
         *   就会让命中检查读到 `r0 → r1`：会话 / 代际 / 历史指纹**三位逐字未变**，
         *   却被判 `revision-changed` ⇒ 缓存被拒。
         *   形态正是计划原文禁的「静默禁用缓存」：不报错、只是白花钱。
         *   真源码探针实测（抽本方法体真跑）：`chat-A|e3|r0|abc123_40` → 落盘一次
         *   → `chat-A|e3|r1|abc123_40` ⇒ `stale=true / reason=revision-changed`。
         *   修法：这一位不自行填（写 `null` ⇒ key 里是 `r-`，`invalidate` 不据它判失效）。
         *   若将来真有**内容相关**的修订源，须以独立读数接入（例如 `storage.getContentRevision()`），
         *   **不得**复用 `getRevision()`：那是落盘计数器，恒随每次 save 前进。
         *
         * 【与第四位的共线性（如实登记）】`_dataRevision()` 返回的就是 `_historyFingerprint()`，
         *   故 `revision` 与 `historyFingerprint` 两位**同源**：历史上 `revision-changed` 从不曾
         *   独立于 `history-changed` 出现过。把这一位填成另一个（退化的）来源，
         *   正是把「冗余但无害」变成「缓存杀手」的那一步。
         *   两位的分工写在 `cache-identity.js` 的 `IDENTITY_KEYS` 头注里，改一处须同改另一处。
         *
         * 【为什么是方法而不是 getter】与 `repairRevision()` 同纪律：读不到就返回 `''`，
         *   绝不抛 —— 诊断读数的失败不得变成调用方的失败。旧格式缓存拿它比对时，
         *   缺失走 `invalidate()` 的 `no-id` 档（放行 + 具名），与本仓 v3.213 投影守卫同纪律。
         */
        _dataRevision() {
            try {
                if (typeof this._historyFingerprint !== 'function') return '';
                return String(this._historyFingerprint() || '');
            } catch (e) { return ''; }
        }
        /**
         * [v3.254.0] M-O4：**当下缓存身份**的组装口（消费点只调本方法，不自拼）。
         *
         * 【为什么必须有这一处】修前实测：身份是**三个各自独立**的读数，散在调用点各自手写
         *   （`_recallCache` 只认 floor + queryKey + 末楼指纹；`recall-artifact` 只认历史指纹；
         *   `_fragCache` 一个都不认）。于是「哪里该失效」没有单一真源，删楼/导入/恢复的交叉
         *   情形无人统一判 —— 换对话后同楼层同查询可命中**上一段会话**的注入。
         *
         * 【四位的分工（与 cache-identity.js 的 IDENTITY_KEYS 逐位对应）】
         *   · chatId             —— `getCurrentChatId()`（会话）
         *   · epoch              —— `_mutationEpoch`（剧情代际；回滚/恢复/导入递增）
        *   · revision           —— **本引擎不自行填**（写 `null` ⇒ key 里 `r-`，不据此判失效）。
        *                             该位留给**外部在飞的排他修订**（`reconcilePlotlines` 的 expectedRevision）：
        *                             首稿曾填 `storage.getRevision()`，那是无条件自增的落盘计数器 ⇒ 缓存永不命中，见 `_dataRevision` 头注。
         *   · historyFingerprint —— `_dataRevision()`（历史内容改了吗）
         *
         * 【读不到时返回什么】整体返回 `null`（而不是拼一份半瘫对象）：`invalidate()` 拿到
         *   空当下身份即判 `no-current` **放行** —— 「证伪不了不等于失效」。任一必需位读不到
         *   （例如宿主还没给 chatId、历史指纹为空）也走放行，与 v3.213 投影守卫同纪律。
         *   本方法只读、不抛、无副作用。
         */
        _cacheIdentityOf() {
            try {
                const raw = (typeof this.getCurrentChatId === 'function') ? this.getCurrentChatId() : '';
                const epochNum = Number(this._mutationEpoch);
                return {
                    chatId: (raw === null || raw === undefined) ? '' : String(raw),
                    epoch: Number.isFinite(epochNum) ? Math.floor(epochNum) : null,
                    /* [v3.255.0] **不**读 `storage.getRevision()` —— 那是无条件自增的落盘计数器
                       （index.js:17179），每轮 save 都前进 ⇒ 会把缓存变成永不命中（见头注）。
                       本引擎不自行填这一位：写 `null` ⇒ key 里 `r-`，不据此判失效。 */
                    revision: null,
                    historyFingerprint: String(this._dataRevision() || ''),
                };
            } catch (e) { errLog(e, 'cacheIdentity.of'); return null; }
        }
        /**
         * [v3.254.0] M-O4：缓存项身份是否仍然有效（消费点的**唯一**判定入口）。
         *   模块不在场（extra_js 未加载 / 拼错符号名）⇒ 返回 `null`，调用方**退回既有判据**
         *   （绝不把「不知道」当成「已失效」——那会把缓存静默禁用，正是计划原文禁的形态）。
         * @param {object} entry 缓存项（可带 `identity` 位；`identity` 缺失即旧格式项）
         * @param {{noIdIsStale?:boolean}} [opts]
         * @returns {{stale:boolean, reason:string, why:string[], unjudgeable:boolean}|null}
         */
        _cacheIdentityStale(entry, opts) {
            try {
                const CI = _cacheIdentityLib();
                if (!CI || typeof CI.invalidate !== 'function') return null;
                const e = (entry && typeof entry === 'object') ? entry : {};
                /* 旧格式项（本版之前的缓存对象没有 identity 位）：把它**整体**当身份传，
                   于是四项全缺 ⇒ 模块判 `no-id`（默认放行）。这与「传 undefined」不同：
                   undefined 会走 `identityOf(undefined)` ⇒ 同样是 no-id，但语义更含糊。 */
                return CI.invalidate(e.identity || {}, this._cacheIdentityOf(), opts);
            } catch (e) { errLog(e, 'cacheIdentity.stale'); return null; }
        }
        isOmittedFloor(message) {
            try {
                return message?.extra?.lonsha_omit === true;
            } catch (e) { errLog(e, 'SF5.isOmittedFloor'); return false; }
        }
        /**
         * [v3.356.0 · M6-O3] 取某一楼的**原话正文**（原话层的回源口）。
         *
         * 为什么需要：分辨率阶梯的 verbatim 层只存**引用**（source + refId），
         *   不复制正文 —— 展开时必须回原 owner 取全文，否则「可展开」是空话。
         *   取不到就返回 null（**不是空串**）：空串会被当成「源在但正文为空」，
         *   与「源已丢失」同形 —— 那正是本项要求分列的两种状态。
         *
         * @param {number} floor 楼层号
         * @returns {string|null} 正文；楼层不存在 / 是番外楼 / 取不到时为 null
         */
        _chatFloorText(floor) {
            try {
                const f = Number(floor);
                if (!Number.isFinite(f) || f < 0) return null;
                const chat = (typeof window !== 'undefined' && window.SillyTavern && typeof window.SillyTavern.getContext === 'function')
                    ? (((window.SillyTavern.getContext() || {}).chat) || []) : [];
                if (!Array.isArray(chat) || f >= chat.length) return null;
                const m = chat[f];
                if (!m) return null;
                /* 番外楼对引擎不存在 ⇒ 同样不得回源（与「楼层不存在」同形，归 null）。 */
                if (typeof this.isOmittedFloor === 'function' && this.isOmittedFloor(m)) return null;
                const text = String(m.mes != null ? m.mes : (m.content != null ? m.content : '')).trim();
                return text || null;
            } catch (e) { errLog(e, 'engine._chatFloorText'); return null; }
        }

        // [v3.96] STM/LTM 游标巩固：摄入本轮净文本到 unconsolidated_stm，达阈值异步巩固
        _stmLtmIngest(message) {
            try {
                if (!this.stmLtm) return;
                const text = String(message?.mes || '').trim();
                if (!text || text.length < 8) return; // 过短片段不摄入（防噪声）
                const floor = Number(message?.index ?? 0);
                const msgId = message?.id ?? message?.index ?? null;
                if (!this._stmLtmState) this._stmLtmState = this.stmLtm.normalizeState(null);
                this._stmLtmState.consolidate_threshold = Math.max(1, Number(this.config.config.stmLtmThreshold) || 5);
                this._stmLtmState = this.stmLtm.ingest(this._stmLtmState, [{ text: text.slice(0, 800), msg_id: msgId, floor }]);
                // 达阈值 → 异步巩固（不 await，fire-and-forget）
                const pend = this._stmLtmState.unconsolidated_stm.length;
                if (pend >= this._stmLtmState.consolidate_threshold) {
                    this._stmLtmConsolidate().catch(e => errLog(e, 'stmLtm.consolidate'));
                }
            } catch (e) { errLog(e, '_stmLtmIngest'); }
        }

        // [v3.96] STM/LTM 巩固：摘要通道经副API通道表路由（ne_stm_api 思路：巩固任务可配独立通道），无通道降级拼接；完成后落盘
        async _stmLtmConsolidate(force = false) {
            if (!this.stmLtm || !this._stmLtmState) return { consolidated: 0 };
            const summarize = async (texts) => {
                try {
                    const joined = texts.map((t, i) => `${i + 1}. ${t}`).join('\n').slice(0, 1600);
                    const prompt = `<task>把以下连续剧情片段压缩成一段客观摘要（60字内，保留人名/物品/地点/关键结果，纯叙述无评论）。</task>\n${joined}`;
                    // 副API通道路由：summarize 任务查通道表，配了独立通道走副通道，否则走主通道 llm.callAPI
                    if (this.apiChannels) {
                        const channels = this.apiChannels.normalizeChannels(this.config.config.secondaryApis);
                        const r = await this.apiChannels.route({
                            task: 'summarize', prompt, channels,
                            callMain: async (p) => this.llm.callAPI(p),
                            // 副通道：用通道表配置的独立端点直连 callOpenAI（不占用主回复通道）
                            callSecondary: async (p, ch) => {
                                if (ch && (ch.endpoint || ch.model)) {
                                    return await this.llm.callOpenAI(p, ch.endpoint || this.config.config.apiUrl, ch.apiKey || this.config.config.apiKey, ch.model || this.config.config.apiModel);
                                }
                                return await this.llm.callAPI(p);
                            }
                        });
                        return r.text || null;
                    }
                    return await this.llm.callAPI(prompt);
                } catch (e) { return null; }
            };
            const _stlLease = { chatId: this.getCurrentChatId(), epoch: this._mutationEpoch };   // [v3.145] CP-L6: 并入变更栅栏
            const r = await this.stmLtm.consolidate(this._stmLtmState, { summarize, force });
            // [v3.141] CP-L4: 巩固产物是游标状态——身份已切换时若仍写回 engine，A 的 stm/ltm 游标会污染 B 的运行时并随 B 存档落盘。
            if (!this._leaseValid(_stlLease)) {
                this._leaseDrop(_stlLease, 'stmLtm', -1);   // [v3.145] CP-L6: 统一 drop 诊断（游标状态不回写）
                return r;
            }
            this._stmLtmState = r.state;
            /* [v3.421.0 · 缝合 E3] 批末**主动销项**：本批 raw 的楼层已经巩固（事办完了），
             *   对应 stm 条目该销。修前这条通路根本不存在 —— 条目只能等容量淘汰滚进 LTM，
             *   「办完的」与「还悬着的」在库里同寿，于是可变区只涨不缩，一旦缩就只能是大销
             *   （源实现记录过一天四次大销把可变区销到 0 行的事故）。
             *
             *   额度由 `stm-close-quota.js` 单一真源裁定（保底留 minKeep + 不得超过本批新增），
             *   故「命中 12 条只销 3 条」不会被读成「销了 3 条」，`blocked` 时一行不销并具名回报。
             *   失败不连坐巩固结果：销项是增强面，出错只落诊断。 */
            let _close = null;
            try {
                const _fl = Array.isArray(r.floors) ? r.floors : [];
                if (_fl.length && typeof this.stmLtm?.closeEntries === 'function') {
                    /* 命中面按**楼层交集**算，不按 id 全销：本批楼层关联的条目才是「这批办完的」。 */
                    const _want = new Set(_fl.map(String));
                    const _hits = (this._stmLtmState.stm_entries || [])
                        .filter((e) => Array.isArray(e.floors) && e.floors.some((f) => _want.has(String(f))))
                        .map((e) => e.id);
                    const _cr = this.stmLtm.closeEntries(this._stmLtmState, _hits, {
                        minKeep: Math.max(1, Number(this.config.config.stmLtmCloseMinKeep) || 3),
                        appended: _fl.length
                    });
                    /* 预演与执行必须同一判据：这里用宿主侧取到的真源复核一遍额度。
                     *   两者不一致说明 stm-ltm 走的是内联兜底或版本漂移 —— 落进 `_stmLtmClose.mismatch`
                     *   让读数自己承认，而不是「预演说能销 5、实际销了 2」无人解释。 */
                    try {
                        const Q = _stmCloseQuotaLib();
                        if (Q && typeof Q.closeQuota === 'function' && _hits.length) {
                            const _pre = Q.closeQuota({ before: _hits.length + 0, minKeep: 0, appended: _fl.length, hits: _hits.length });
                            if (_cr && _pre && Number(_pre.quota) !== Number(_cr.quota?.quota)) {
                                this._stmLtmClose = Object.assign(this._stmLtmClose || {}, {
                                    mismatch: { predicted: Number(_pre.quota) || 0, actual: Number(_cr.quota?.quota) || 0 }
                                });
                            }
                        }
                    } catch (_e2) { /* 预演失败不影响已执行的销项 */ }
                    if (_cr && _cr.state) {
                        this._stmLtmState = _cr.state;
                        _close = { removed: _cr.removed, blocked: _cr.blocked === true, reasons: _cr.reasons || [], shortfall: _cr.shortfall || 0, line: _cr.line || '' };
                        if (_cr.blocked || _cr.shortfall) this._stmLtmClose = { at: Date.now(), ..._close };
                    }
                }
            } catch (e) { errLog(e, 'stmLtm.close'); }
            // 落盘（复用主持久化通道）
            try {
                if (r.consolidated > 0) {
                    this.recordSaveSource('stmLtm');
                    // [v3.166] 按结果记账：save 返回 false（防护拒绝 / 无落盘目标）时不得计为已保存
                    const _ok = await this.storage.save(this.getCurrentChatId(), this.collectExport());
                    this.recordSaveFailed('stmLtm', _ok === true, this.storage?._lastWrite?.error || '未落盘');
                }
            } catch (e) { errLog(e, 'stmLtm.save'); }
            if (this.config.config.debugMode && r.consolidated > 0) console.log(`[${PLUGIN_NAME}] STM巩固: ${r.consolidated}片段→stm (usedAI=${r.usedAI})`
                + (_close ? ` | 销项${_close.blocked ? '被拦：' + _close.line : '：' + _close.line}` : ' | 无命中不销'));
            r.close = _close;   // 只增不换：老调用方拿 consolidated/state 不受影响
            return r;
        }

        /**
         * [v3.180] 楼层真源落笔（floor-ledger.js 的宿主入口）：把「这一楼产生了什么」写成
         * 该楼自己的附注（msg.extra.lonsha_ledger），使账随楼走（楼删账删、翻页随页走）。
         * **只加归属性，不改汇总口**：itemOps / summaries / 预算 / 注入 / 跨会话携带一字不动。
         *
         * 归因三态（本项目硬纪律：失败出口可归因，不静默吞）：
         *   status 'ok'                 —— 已落笔（返回附注对象）
         *   status 'module-unavailable' —— floor-ledger.js 未加载（extra_js 缺失 / 加载失败）
         *   status 'rejected'           —— 落笔被拒，reason ∈ stale（指纹已过期）/ extra-unwritable /
         *                                 unreadable-floor（指纹取不到）/ not-written
         * 不抛：提取管线里任何一处抛都会连坐整楼的写入。
         */
        _stampFloorLedger(message, record, opts = {}) {
            try {
                const L = _moduleLib(() => window.LonShaFloorLedger, 'floor-ledger.js');
                const _floor = Number(message && message.index) || 0;
                if (!L || typeof L.stamp !== 'function') {
                    this._floorLedgerStamp = { status: 'module-unavailable', floor: _floor, at: Date.now() };
                    return null;
                }
                // fresh 模式：指纹必须与**落笔当时**的楼一致。message 在提取排队期间被编辑/翻页时，
                //   这格账属于旧页——宁可让覆盖度把它报成缺口（逐楼可见、可重提取补齐），
                //   也不把账记到楼上让它从此自称「我这页有账」。
                if (record && (record.fresh || opts.fresh)) {
                    const fp = (typeof L.fpOf === 'function') ? L.fpOf(message) : null;
                    if (!fp || msgFpOf(message) !== fp) {
                        this._floorLedgerStamp = { status: 'rejected', reason: 'stale', floor: _floor, at: Date.now() };
                        return null;
                    }
                }
                const pay = L.stamp(message, record || {});
                if (!pay) {
                    const ex = (message && typeof message === 'object' && message.extra && typeof message.extra === 'object') ? message.extra : null;
                    this._floorLedgerStamp = {
                        status: 'rejected',
                        reason: !ex ? 'extra-unwritable' : ((typeof L.fpOf === 'function' && !L.fpOf(message)) ? 'unreadable-floor' : 'not-written'),
                        floor: _floor, at: Date.now()
                    };
                    return null;
                }
                this._floorLedgerStamp = { status: 'ok', floor: Number(pay.floor) || 0, at: Date.now() };
                return pay;
            } catch (e) {
                this._floorLedgerStamp = { status: 'thrown', floor: Number(message && message.index) || 0, reason: String((e && e.message) || e), at: Date.now() };
                errLog(e, 'engine._stampFloorLedger');
                return null;
            }
        }
        /**
         * [v3.180] 楼层账本覆盖度（**现算**读数，不入快照存盘）：把「哪些楼还没落笔」变成
         * 有名有数的读数——逐楼列号 + 失效原因分布（缺口要能归因，不是一句「没有」）。
         * 口径与 floor-ledger.coverage 一致：只数 AI 楼，番外楼（lonsha_omit）与空楼不计。
         */
        _floorLedgerCoverage() {
            try {
                const L = _moduleLib(() => window.LonShaFloorLedger, 'floor-ledger.js');
                if (!L || typeof L.coverage !== 'function') return { enabled: false, reason: 'module-unavailable' };
                const chat = (window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext() || {}).chat || [];
                const cov = L.coverage(chat, {
                    upTo: chat.length - 1,
                    assistantOnly: true,
                    omitFunction: (m) => !!(m && m.extra && m.extra.lonsha_omit === true),
                    skipFunction: (m) => !m || typeof m.mes !== 'string' || !m.mes.trim()
                });
                cov.enabled = true;
                return cov;
            } catch (e) {
                errLog(e, 'engine._floorLedgerCoverage');
                return { enabled: false, reason: String((e && e.message) || e) };
            }
        }
        /** [v3.180] 覆盖度一句话读数（诊断面/报告用；纯读、不抛） */
        // [v3.361.0] 诊断行+委托方法群剥离至 engine-diagnostic-lines.js
        // 62 methods delegated to engine-diagnostic-lines.js via _moduleLib
        _floorLedgerLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._floorLedgerLine(this, ...args) : ''; }
        _summaryProvenanceLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._summaryProvenanceLine(this, ...args) : ''; }
        _branchGuardLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._branchGuardLine(this, ...args) : ''; }
        _crosslinkLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._crosslinkLine(this, ...args) : ''; }
        _crosslinkConsumePair(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._crosslinkConsumePair(this, ...args) : ''; }
        _crosslinkConsumeAlive(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._crosslinkConsumeAlive(this, ...args) : ''; }
        _crosslinkConsumeLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._crosslinkConsumeLine(this, ...args) : ''; }
        _emotionOppositeLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._emotionOppositeLine(this, ...args) : ''; }
        _graphRollupLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._graphRollupLine(this, ...args) : ''; }
        _relationDisclosureLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._relationDisclosureLine(this, ...args) : ''; }
        _relationMutualLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._relationMutualLine(this, ...args) : ''; }
        _knowledgeNetworkLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._knowledgeNetworkLine(this, ...args) : ''; }
        _knowledgeTraceLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._knowledgeTraceLine(this, ...args) : ''; }
        relationHistory(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.relationHistory(this, ...args) : null; }
        relationHistoryAt(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.relationHistoryAt(this, ...args) : null; }
        _relationHistoryLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._relationHistoryLine(this, ...args) : ''; }
        causalChainGraph(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.causalChainGraph(this, ...args) : null; }
        causalChainTodos(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.causalChainTodos(this, ...args) : null; }
        causalChainTrace(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.causalChainTrace(this, ...args) : null; }
        causalChainProposals(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.causalChainProposals(this, ...args) : null; }
        _causalChainLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._causalChainLine(this, ...args) : ''; }
        perspectiveCard(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.perspectiveCard(this, ...args) : null; }
        testimonyBoard(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.testimonyBoard(this, ...args) : null; }
        testimonyRevoke(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.testimonyRevoke(this, ...args) : null; }
        _testimonyBoardLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._testimonyBoardLine(this, ...args) : ''; }
        narrativeLayer(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.narrativeLayer(this, ...args) : null; }
        narrativeReality(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.narrativeReality(this, ...args) : null; }
        narrativeProject(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.narrativeProject(this, ...args) : null; }
        _narrativeLayerLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._narrativeLayerLine(this, ...args) : ''; }
        _returnGateCandidates(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._returnGateCandidates(this, ...args) : ''; }
        returnGate(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.returnGate(this, ...args) : null; }
        returnGateAdmit(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.returnGateAdmit(this, ...args) : null; }
        returnGateMark(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.returnGateMark(this, ...args) : null; }
        returnGatePrefer(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.returnGatePrefer(this, ...args) : null; }
        _returnGateLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._returnGateLine(this, ...args) : ''; }
        // [v3.424.0 · M7-X1] 世界线记忆宿主出口。全部转发 engine-diagnostic-lines 的实现，
        //   本文件只留一行转发（与既有 returnGate* 五出口同形），不在这里拼业务。
        _worldlineState(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._worldlineState(this, ...args) : null; }
        _worldlineRead(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._worldlineRead(this, ...args) : null; }
        worldlineGate(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.worldlineGate(this, ...args) : null; }
        worldlineConvergence(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.worldlineConvergence(this, ...args) : null; }
        worldlineSwitchPlan(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.worldlineSwitchPlan(this, ...args) : null; }
        worldlineDiff(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.worldlineDiff(this, ...args) : null; }
        _worldlineLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._worldlineLine(this, ...args) : ''; }
        _materialInventory(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._materialInventory(this, ...args) : ''; }
        materialPack(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.materialPack(this, ...args) : null; }
        _materialPackLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._materialPackLine(this, ...args) : ''; }
        _crosscheckChatRows(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._crosscheckChatRows(this, ...args) : ''; }
        loreCrosscheck(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.loreCrosscheck(this, ...args) : null; }
        _loreCrosscheckLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._loreCrosscheckLine(this, ...args) : ''; }
        perspectiveContrast(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.perspectiveContrast(this, ...args) : null; }
        _perspectiveCardLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._perspectiveCardLine(this, ...args) : ''; }
        _extractionWindowFloors(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._extractionWindowFloors(this, ...args) : ''; }
        extractionPlan(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.extractionPlan(this, ...args) : null; }
        _extractionDriverLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._extractionDriverLine(this, ...args) : ''; }
        correctionPlanReextract(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.correctionPlanReextract(this, ...args) : null; }
        correctionPlanConfig(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.correctionPlanConfig(this, ...args) : null; }
        _correctionPlanLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._correctionPlanLine(this, ...args) : ''; }
        _secretIsolationLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._secretIsolationLine(this, ...args) : ''; }
        _branchSemanticsLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._branchSemanticsLine(this, ...args) : ''; }
        async confirmBranchImport(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.confirmBranchImport(this, ...args) : null; }
        _volumeContinuationLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._volumeContinuationLine(this, ...args) : ''; }
        _recallExplainLib(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._recallExplainLib(this, ...args) : ''; }
        explainRecallHost(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.explainRecallHost(this, ...args) : null; }
        _recallExplainLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._recallExplainLine(this, ...args) : ''; }
        suggestRecallFixes(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.suggestRecallFixes(this, ...args) : null; }
        buildVolumePack(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.buildVolumePack(this, ...args) : null; }
        handoffVolumeContinuation(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.handoffVolumeContinuation(this, ...args) : null; }
        revokeVolumeHandoff(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M.revokeVolumeHandoff(this, ...args) : null; }
        _promptFillLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._promptFillLine(this, ...args) : ''; }
        _changesetLine(...args) { const M = _moduleLib(() => window.LonShaDiagnosticLines, 'engine-diagnostic-lines.js'); return M ? M._changesetLine(this, ...args) : ''; }
        async onMessageReceived(message, messageId = null) {
            // [v3.10] 生成结束（新回复落层=本轮生成闭环），复位生成标志
            this._generationActive = false;
            if (!this.config.config.enabled) return;
            // [v3.1] SF5: 番外楼双保险（事件层已短路，这里防直接调用路径）
            if (this.isOmittedFloor(message)) { if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 楼层为番外楼，引擎跳过`); return; }
            // [v1.2 真机适配修复] ST 消息对象没有 index 字段，
            // 楼层号来自 eventSource 回调的 messageId
            message = { ...message, index: messageId ?? message.index ?? 0 };

            // [v3.44] 开场白写入抑制 (Opening Floor Write Suppression，抄 shujuku)
            // 无用户消息、仅第 0 楼开场白时，系统只读加载，抑制所有写操作与记忆 ops 生成，保持新会话纯净
            const _ctxChat = window.SillyTavern?.getContext?.()?.chat;
            const _isOpeningStage = (!_ctxChat || _ctxChat.length <= 1 || (_ctxChat.length === 1 && !_ctxChat[0]?.is_user)) && message.index <= 0;
            if (_isOpeningStage && !message.is_user) {
                if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 处于首楼开场白阶段，只读展示，抑制自动记忆写入`);
                return;
            }
            // [v1.4] 清洗正文：剥离 HTML注释/SDC标签/自定义标签，防止脏数据入库
            // [v3.13] 思维链/正文分流: 先剥 <thinking> 再清洗（zhino A5.2.1——思维链草稿不入正文/摘要/图谱）
            // 注意: thinking 存引擎信号队列而非 message.extra（message 是浅拷贝，extra 引用与原对象共享，直接写会污染 ST 真实消息）
            const _tc = extractThinkingChain(message.mes || message.content || '');
            // [v3.29] synopsis 快速路径需原始文本——cleanMessageText 会剥 <synopsis> 标签，故在清洗前快照原文
            const _rawForSynopsis = String(_tc.content || message.content || '');
            // [v3.33] AI 主动记忆操作符：从原文提取 <field>/<todo>/<item> 标签（清洗前，因为 cleanMessageText 会剥标签）
            const aiRecallOps = this.config.config.aiRecallOps ? extractMemoryOpsFromText(_rawForSynopsis) : null;
            // [v3.37] 物理时间标签锚点：从原文提取 <time>/<date> 标签（baibai 理念，零API同步）
            const timeTagFound = (this.config.config.timeTagAnchorEnabled !== false) ? extractTimeTagFast(_rawForSynopsis) : null;
            // [v3.48] P1: 大纲标签解析（AI 回复自带 <stage_title>/<node>/<turn> 时自动成为导演大纲）
            if (this.config.config.outlineDirectorEnabled !== false && _rawForSynopsis && _rawForSynopsis.includes('<node')) {
                try {
                    const _outlineParsed = this.outline.parseOutline(_rawForSynopsis, message.index || 0);
                    if (_outlineParsed && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🎬 解析剧情大纲: ${_outlineParsed.title}（${_outlineParsed.nodes.length} 节点）`);
                } catch (e) { errLog(e, 'onMessageReceived.大纲解析'); }
            }
            if (!this.rth) this.rth = (typeof _newRelativeTimeHelper === 'function') ? _newRelativeTimeHelper() : new RelativeTimeHelper();
                const dualTimeAnchor = (this.config.config.dualTimeAnchorEnabled !== false) ? (() => {
                try { return _newRelativeTimeHelper().extractDualTimeTags(_rawForSynopsis); } catch (e) { return null; }
            })() : null;
            if ((aiRecallOps && (aiRecallOps.changes.length || aiRecallOps.todos.length || aiRecallOps.items.length)) || timeTagFound || dualTimeAnchor?.hasDual) {
                if (aiRecallOps && this.config.config.aiRecallOpsDebug) console.log(`[${PLUGIN_NAME}] 主动记忆操作: 字段${aiRecallOps.changes.length} 待办${aiRecallOps.todos.length} 物品${aiRecallOps.items.length} (楼层 ${message.index})`);
                if (timeTagFound && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 物理时间标签命中: ${timeTagFound} (楼层 ${message.index})`);
                _tc.content = stripMemoryOpsTags(_tc.content);
            }
            message.mes = this.cleanMessageText(_tc.content);
            // [v3.96] STM/LTM 游标巩固摄入（fire-and-forget，不阻塞主链路；达阈值自动巩固）
            try { if (this.config.config.stmLtmEnabled && this.stmLtm) this._stmLtmIngest(message); } catch (e) { errLog(e, 'onMessageReceived.stmLtm'); }
            if (_tc.thinking) {
                if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 思维链已分流 (楼层 ${message.index}, ${_tc.thinking.length} 字)`);
                try { this.feedThinking(_tc.thinking, message.index); } catch (e) { errLog(e, 'feedThinking'); }
            }
            if (!message.mes) { console.log(`[${PLUGIN_NAME}] 消息清洗后为空，跳过`); return; }
            console.log(`[${PLUGIN_NAME}] 处理新消息 (楼层 ${message.index})`);
            const chatId = this.getCurrentChatId();
            if (!chatId) return;
            // [v2.1] P3: 提取互斥（抄 hcdiary cdBusy——防并发提取写坏数据）
            let _lkCred = null;                                  // [v3.145] CP-L6: 锁所有权凭证（仅签发者可释放）
            const _omrLease = { chatId, epoch: this._mutationEpoch };   // [v3.145] CP-L6: 会话 + 变更栅栏双身份
            if (this.config.config.extractionLockEnabled) {
                const acquired = await this.mutex.acquire(`omr:floor${message.index || 0}`);
                if (!acquired) {
                    // [v2.5] 修复: 原实现直接 return 丢消息；改为至少做摘要兜底，防该楼彻底无记忆
                    try {
                        const fallback = this.extractMemorySimple(message);
                        // [v3.8] 降级摘要不覆盖已有优质摘要（opts.degraded）
                        if (fallback?.summary) await this.summary.createSummary(message, fallback.summary, { degraded: true, maxLen: this.config.config.maxSummaryLength });
                        // [v3.10] 记录到待补集合：锁释放后（下一条消息处理完）由 CHAT 补提取
                        this._lockDegradePending = this._lockDegradePending || new Set();
                        this._lockDegradePending.add(message.index || 0);
                        console.warn(`[${PLUGIN_NAME}] 提取锁排队超时，已降级为本地摘要并排队补提取 (楼层 ${message.index})`);
                    } catch (e) { errLog(e, 'onMessageReceived.提取锁降级'); }
                    return;
                }
                _lkCred = acquired;                              // [v3.145] 记录凭证，供 finally 定向释放
            }
            try {
                // [v3.27] <synopsis> 轻量提取快速路径（AnchorNote）: AI 自带 <synopsis> 标签时正则直取做 summary，省一次 LLM 调用
                // [v3.29] 用清洗前的原文检测（cleanMessageText 会剥 <synopsis> 标签导致快速路径失效）
                let extracted = null;
                if (this.config.config.synopsisFastPath) {
                    const synopsisText = extractSynopsisFast(_rawForSynopsis || message.mes || message.content || '');
                    if (synopsisText) {
                        extracted = { summary: synopsisText, characters: [], events: [], relationships: [] };
                        if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] <synopsis>快速路径: 楼层 ${message.index}`);
                    }
                }
                // [v3.110] 事件性门控（缝合 bionic smart-trigger）：决定「这一楼值不值得花一次 LLM 提取」。
                //   默认关（smartTriggerEnabled:false）→ 与既有行为完全一致。
                //   开启后：平淡楼（日常过渡/寒暄/环境描写）跳过 LLM，降级为本地廉价摘要——
                //   绝不丢弃楼层，宁抽得糙，不留记忆空洞（fail-open）。
                let _triggerDecision = null;
                if (this.config.config.smartTriggerEnabled === true) {
                    try {
                        const st = (typeof window !== 'undefined' ? window.LonShaSmartTrigger : null)
                            || (typeof require !== 'undefined' ? (() => { try { return require('./smart-trigger.js'); } catch { return null; } })() : null);
                        if (st) {
                            const _chat = window.SillyTavern?.getContext?.()?.chat || [];
                            const _carry = {};   // [v3.171] 读数面：带出「省略判定失败 / 被丢弃」计数
                            const _pending = st.normalizePending(_chat, {
                                lastProcessed: (message.index || 0) - 1,
                                endFloor: message.index || 0,
                                isOmitted: (m) => this.isOmittedFloor(m),
                            }, _carry);
                            _triggerDecision = st.evaluateTrigger(_pending, {
                                patterns: this.config.config.smartTriggerPatterns,
                                threshold: this.config.config.smartTriggerThreshold,
                            });
                            this._triggerStats = Array.isArray(this._triggerStats) ? this._triggerStats : [];
                            this._triggerStats.push({
                                score: _triggerDecision.score,
                                triggered: _triggerDecision.triggered,
                                reasons: _triggerDecision.reasons,
                                // [v3.171] 读数面：把「判不了 / 没读到 / 被丢弃」随记录一起留存。
                                //   否则空读与平淡楼在台账里逐字节同形（I6：读失败 ≠ 读到了 0）。
                                report: {
                                    empty: !!(_triggerDecision.stats && _triggerDecision.stats.empty === true),
                                    invalidPatterns: ((_triggerDecision.stats && _triggerDecision.stats.invalidPatterns) || []).length,
                                    dropped: Number(_carry.dropped) || 0,
                                    omitErrors: Number(_carry.omitErrors) || 0,
                                },
                            });
                            if (this._triggerStats.length > 300) {
                                this._triggerStats.shift();
                                this._triggerDropped = (Number(this._triggerDropped) || 0) + 1;   // [v3.171] 环形淘汰可计数
                            }
                            if (this.config.config.debugMode) {
                                console.log(`[${PLUGIN_NAME}] [v3.110] 事件性门控: score=${_triggerDecision.score}/${_triggerDecision.threshold} triggered=${_triggerDecision.triggered}` + (_triggerDecision.reasons.length ? ` (${_triggerDecision.reasons.join('; ')})` : ''));
                            }
                        }
                    } catch (e) { errLog(e, 'onMessageReceived.事件性门控'); }
                }
                /* [v3.324.0 · M3-O5] **真每轮调用点**：本轮窗口 + 档位 → 抽取节奏安排。
                 *   为什么落在这里而不是只等诊断面来问：节奏安排是「这一楼的关键事件会不会
                 *   落在周期楼外」的上游判据，等诊断面按需算，等于用户问的时候才算得动。
                 *   ★ 本段**只算不写**：门控判定的结果、提取锁、摘要降级路径一条都不动 ——
                 *     它是**读数**，不是第二套调度器（本仓「导出即摆设」的老坑）。
                 *   ★ 算不出来如实记 `ok:false/reason`：缺席与「这一轮没什么可抽」不同形。 */
                try {
                    const _ED = _extractionDriverLib();
                    if (_ED && typeof _ED.plan === 'function') {
                        const _win = this._extractionWindowFloors(message);
                        const _edOut = _ED.plan({
                            floor: message.index || 0,
                            profile: this.config.config.extractionProfile,
                            entries: _win.entries,
                            missedFloors: Array.from(this._lockDegradePending || []),
                            regenFloors: Array.isArray(this._regenFloors) ? this._regenFloors : []
                        }, {});
                        this._extractionDriverRead = Object.assign({}, _edOut, { ok: true, reason: _edOut.degraded ? 'degraded' : '' });
                        this._extractionWindowRead = { omitted: _win.omitted, noFloor: _win.noFloor, from: _win.from, to: _win.to };
                        if (this.config.config.debugMode) {
                            console.log(`[${PLUGIN_NAME}] [v3.324.0] 抽取节奏 ${_edOut.profile}: 即时 ${_edOut.readings.structuralDue} / 攒批 ${_edOut.readings.batched} / 未读到 ${_edOut.readings.unreadable}`);
                        }
                    } else {
                        this._extractionDriverRead = { ok: false, reason: 'module-unavailable' };
                    }
                } catch (e) { errLog(e, 'onMessageReceived.抽取节奏'); this._extractionDriverRead = { ok: false, reason: 'thrown' }; }
                if (!extracted) {
                    if (_triggerDecision && _triggerDecision.triggered === false) {
                        // [v3.171] 空读 ≠ 平淡楼：前者是「根本没读到内容」，此时既不该花 LLM，
                        //   也不该走本地摘要（那会凭空造一条记忆）。只有真平淡楼才降级摘要。
                        const _readEmpty = !!(_triggerDecision.stats && _triggerDecision.stats.empty === true);
                        if (_readEmpty) {
                            // 空读：无料可提，跳过（不是「省下调用」，而是「无内容」）
                            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] [v3.171] 门控读到空待判定集（楼层 ${message.index}），跳过提取（非降级摘要）`);
                        } else {
                            // 平淡楼：跳过 LLM 提取，走本地廉价摘要
                            extracted = this.extractMemorySimple(message);
                            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] [v3.110] 平淡楼跳过 LLM 提取（楼层 ${message.index}），已降级本地摘要`);
                        }
                    } else {
                        extracted = await this.extractMemoryWithLLM(message);
                    }
                }
                // [v3.141] CP-L4 会话租约（stbme session lease）：提取的 await 期间用户可能已切换聊天，
                // 此时内存运行时属于新聊天——把 A 楼的结果写进 B 的 graph/vector/summary 是永久污染
                // （B 随后自存即落盘）。发起时捕获的 chatId 是唯一权威，回来时身份已变则整栋丢弃。
                if (!this._leaseValid(_omrLease)) {
                    this._leaseDrop(_omrLease, 'omr', message.index || 0);
                    console.warn(`[${PLUGIN_NAME}] ⚠ 异步提取结果作废：发起于聊天 ${chatId}（第${message.index}楼），当前已在 ${this.getCurrentChatId()}，丢弃以防跨聊天污染`);
                    return;
                }
                // [v3.33] AI 主动记忆操作 merged into extracted: high-confidence writes override/augment passive LLM extraction
                if (aiRecallOps && (aiRecallOps.changes.length || aiRecallOps.todos.length || aiRecallOps.items.length)) {
                    extracted = extracted || { characters: [], events: [], relationships: [], summary: "" };
                    extracted.status_changes = [...(extracted.status_changes || []), ...aiRecallOps.changes];
                    extracted.todos = [...(extracted.todos || []), ...aiRecallOps.todos];
                    extracted.items = [...(extracted.items || []), ...aiRecallOps.items];
                    // [v3.33] 每楼主动操作数上限（防 AI 滥用标签洪流）
                    // [v3.156] 0 = 不限制（UI min=0 的合法意图）。旧 `|| 12` 把 0 静默变回 12；
                    //   即便放开，`x.slice(-0)` === `x.slice(0)` === 原数组，会变成「不截断」而非「全丢」，
                    //   故这里必须显式区分「无上限」（跳过截断）与「上限为正」（按新近度保留尾部）。
                    const _cap = numOr(this.config.config.aiRecallOpsMaxPerFloor, 12);
                    const _capped = _cap > 0;
                    if (_capped && extracted.status_changes.length > _cap) extracted.status_changes = extracted.status_changes.slice(-_cap);
                    if (_capped && extracted.todos.length > _cap) extracted.todos = extracted.todos.slice(-_cap);
                    if (_capped && extracted.items.length > _cap) extracted.items = extracted.items.slice(-_cap);
                }
                // [v3.37] 物理时间标签优先赋权盖章（baibai 权威时间同步）
                if (timeTagFound) {
                    extracted = extracted || { characters: [], events: [], relationships: [], summary: "" };
                    extracted.story_date = timeTagFound;
                    this._lastStoryDateSeen = timeTagFound;
                }
                if (dualTimeAnchor?.hasDual) {
                    extracted = extracted || { characters: [], events: [], relationships: [], summary: "" };
                    extracted.time_anchor = { start: dualTimeAnchor.start, end: dualTimeAnchor.end, durationMinutes: dualTimeAnchor.durationMinutes, rangeLabel: this.rth ? this.rth.formatTimeRange(dualTimeAnchor.start, dualTimeAnchor.end) : '' };
                }
                if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 提取:`, extracted);
                
                // [v1.7] RubyPhone 联动①: LLM 提取结果回填手机记忆库
                if (this.config.config.rubyPhoneBridge && extracted) {
                    try {
                        const bridge = window.VirtualPhone?.lonshaBridge;
                        if (bridge?.backfill) {
                            // [v3.48] P0-4: backfill 携带剧情时钟快照（money_changes/conflicts 已在 extracted 原生 schema）
                            // [v3.59] A2: payload 携带群像记忆（bridge 回填手机）
                            const _backfillPayload = { ...extracted, clock: this.clock?.export?.() || null, pairs: this.pairMem?.export?.()?.pairs || [], lockedFacts: (this.config.config.lockedFactsEnabled !== false) ? this.summary.getLockedFacts() : [], deltaBook: this.deltaBook?.export?.() || null, protagonist: this.status?.getProtagonist?.() || null, lifeDetails: (this.status?.lifeDetails || []).filter(d => d.tier !== 'archive') };   // [v3.81] A: 主角档案/生活小档案回填手机
                            bridge.backfill(_backfillPayload);
                            // [v3.49] P4: 心理暗流日记双端互通（幂等回填手机日记 App）
                            if (this.config.config.diaryBridgeEnabled !== false && this.diary?.diaries) {
                                try { bridge.backfillDiaries?.(this.diary.diaries); } catch (e) { errLog(e, 'rubyPhoneBridge.日记回填'); }
                            }
                            // [v3.50] P6: 剧情时钟权威同步（GameClock → 手机状态栏，仅日期变化时写）
                            if (this.config.config.clockSyncEnabled !== false && _backfillPayload.clock?.date) {
                                try { bridge.syncClock?.(_backfillPayload.clock); } catch (e) { errLog(e, 'rubyPhoneBridge.时钟同步'); }
                            }
                        } else if (window.VirtualPhone?.memoryCore) {
                            // 兜底: 桥未挂载时直接写入记忆库 (摘要→长期记忆)
                            const s = String(extracted.summary || '').trim();
                            if (s.length >= 15) window.VirtualPhone.memoryCore.record('ai', '[剧情] ' + s, {});
                        }
                    } catch (e) {
                        if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] RubyPhone回填失败:`, e);
                    }
                }
                
                // [v3.371.0] 提取后执行、图谱与各子系统状态写入管线外移至 engine-execution-pipeline.js (-1099行)
                const _payloadResult = await this.applyExtractedPayload(extracted, message, {
                    rawForSynopsis: _rawForSynopsis,
                    chatId
                });
                const _savePersisted = _payloadResult?.saved === true;
                // [v3.165] 成功声称由事实驱动：提取成功与保存落地是两件事。此前这行只报「完成」+ 提取到的
                //   角色/事件数（连向量数都是读全局，不是本楼产物），从不提保存被拒 —— 用户看到
                //   「✓ 完成」而记忆根本没落盘，重启即失。
                console.log(`[${PLUGIN_NAME}] ${_savePersisted ? '✓ 完成' : '⚠️ 提取完成但未落盘'} `
                    + `(${extracted?.characters?.length || 0}角色, ${extracted?.events?.length || 0}事件, 向量=${this.vector.vectors.length}`
                    + `${_savePersisted ? '' : '，保存被确认状态机拒绝'}）`);
            } catch (err) {
                console.error(`[${PLUGIN_NAME}] ✗ 失败:`, err);
            } finally {
                if (this.config.config.extractionLockEnabled) this.mutex.release(_lkCred);   // [v3.145] CP-L6: 带凭证释放，晚到的 finally 不得放开新持有者的锁
                // [v3.10] 锁释放后补提取降级楼层（一次最多 10 楼，防堆积）
                try {
                    if (this._lockDegradePending?.size && this.config.config.extractionEnabled) {
                        const list = Array.from(this._lockDegradePending).sort((a, b) => a - b).slice(0, 10);
                        for (const f of list) this._lockDegradePending.delete(f);
                        if (list.length) {
                            console.log(`[${PLUGIN_NAME}] 锁空闲，补提取降级楼层: ${list.join(',')}`);
                            setTimeout(async () => {
                                try { await this.backfillFloors(list); } catch (e) { errLog(e, 'EV.锁后补提取'); }
                            }, 1000);
                        }
                    }
                } catch (e) { errLog(e, 'EV.锁后补提取调度'); }
            }
        }
        

        async applyExtractedPayload(extracted, message, options = {}) {
            const EP = _moduleLib(() => window.LonShaEngineExecutionPipeline, 'engine-execution-pipeline.js');
            if (EP && typeof EP.applyExtractedPayload === 'function') {
                return EP.applyExtractedPayload(this, extracted, message, options);
            }
            return { saved: false, characters: 0, events: 0 };
        }

        // [v3.65] A: 锁定事实操作包装（带 OpLog 埋点，locked_fact 类型）
        lockFact(text) {
            const floor = (window.SillyTavern?.getContext?.()?.chat?.length || 1) - 1;
            const id = this.summary.addLockedFact(text, floor);
            if (id) {
                this.opLog?.log?.('locked_fact', 'add', id.slice(0, 12), floor, String(text).slice(0, 40));
            }
            return id;
        }
        unlockFact(id) {
            const fact = (this.summary.getLockedFacts() || []).find(f => f.id === id);
            const ok = this.summary.removeLockedFact(id);
            if (ok && fact) {
                this.opLog?.log?.('locked_fact', 'remove', id.slice(0, 12), fact.floor, String(fact.text).slice(0, 40));
            }
            return ok;
        }
        async extractMemoryWithLLM(message) {
            if (!this.config.config.extractionEnabled) return this.extractMemorySimple(message);
            try {
                const content = (message.mes || '').substring(0, 2000);
                // [v1.5] 抄 HCDiary：注入已知角色名单 + 前情提要（记忆回环）
                const knownChars = this.getKnownCharacters();
                const history = this.summary.getActiveSummaries().slice(-5).map(s => s.text).join('\n');
                const volText = (this.summary.volumes || []).slice(-2).map(v => `【卷${v.floorStart}-${v.floorEnd}】${v.text}`).join('\n');
                const historyFull = [volText, history].filter(Boolean).join('\n');
                // [v3.62] 锁定事实：用户显式锁定，摘要必须逐字保留
                const lockedText = (this.config.config.lockedFactsEnabled !== false) ? this.summary.lockedFactsForPrompt() : '';
                // [v3.152] ANIMA 词典线 A3：术语词典规则动态追加（9l 新术语 / 9m 角色新称呼）。
                // 词典为空时 promptRules() 返回引导版（冷启动即开始沉淀）；关闭开关则零追加。
                // [v3.184] 占位符填充改走 fuzzy-patch（移植 nocturne text_patch.py 的归一化匹配）。
                //   修前是 6 条裸字面 .replace：用户在设置面板（settings-ui 的 ls-prompt 文本框）
                //   把 {{KNOWN_CHARS}} 编辑成全角括号或带空格的 {{ KNOWN_CHARS }} 之后，
                //   字面 replace 一次都不命中——占位符原样发给 LLM（模型看到的是模板语法而不是角色名单），
                //   且**全程无日志**（返回值非空、不抛、零提示），功能「接上了但永远空转」。
                //   现在：精确优先 → 未命中走归一化回退（弯引号/破折号/多空格/行尾空白）→ 唯一命中才落；
                //   填完仍残留的占位符会被扫描出来计进读数，不再静默。歧义不猜（改错地方比不改更糟）。
                const _fpLib = _moduleLib(() => window.LonShaFuzzyPatch, 'fuzzy-patch.js');
                // 取值失败不留空串：空串会让「本就没有」与「取不到」同形（I6），故一律给可见占位文案。
                const _tokVal = (fn, fallback) => { try { const v = fn(); return (v === '' || v == null) ? fallback : String(v); } catch (e) { errLog(e, 'extract.promptToken'); return fallback; } };
                const _tokens = {
                    KNOWN_CHARS: _tokVal(() => knownChars.join('、'), '（暂无，从本轮开始积累）'),
                    HISTORY: _tokVal(() => historyFull, '（暂无）'),
                    SUSPENSE: _tokVal(() => (this.config.config.suspenseEnabled && this.suspense.openItems().length) ? this.suspense.briefForPrompt() : '', '（暂无未了结的悬念）'),
                    LOCKED_FACTS: _tokVal(() => lockedText, '（无）'),
                    SCENES: _tokVal(() => (this.config.config.sceneEnabled && this.scene.nodes.size) ? this.scene.brief() : '', '（暂无已登记场景）'),
                    CONTENT: _tokVal(() => content, '（本轮无正文）'),
                };
                let prompt;
                if (_fpLib && typeof _fpLib.patchTokens === 'function') {
                    const _fill = _fpLib.patchTokens(this.config.config.extractionPrompt || '', _tokens);
                    prompt = _fill.text;
                    this._promptFillRead = { site: 'extraction', total: _fill.total, applied: _fill.applied.length, modes: _fill.modes, missed: _fill.missed, leftover: _fill.leftover, leftoverMore: _fill.leftoverMore };
                } else {
                    // 模块缺席：退到原字面行为，读数如实记缺席（不装成「填好了」）
                    prompt = String(this.config.config.extractionPrompt || '')
                        .replace('{{KNOWN_CHARS}}', _tokens.KNOWN_CHARS)
                        .replace('{{HISTORY}}', _tokens.HISTORY)
                        .replace('{{SUSPENSE}}', _tokens.SUSPENSE)
                        .replace('{{LOCKED_FACTS}}', _tokens.LOCKED_FACTS)
                        .replace('{{SCENES}}', _tokens.SCENES)
                        .replace('{{CONTENT}}', _tokens.CONTENT);
                    this._promptFillRead = { site: 'extraction', moduleMissing: true, total: Object.keys(_tokens).length, applied: 0, modes: {}, missed: [], leftover: [] };
                }
                if (this.config.config.termLexiconEnabled !== false && this.lexicon?.promptRules) {
                    try { prompt += '\n' + this.lexicon.promptRules(); } catch (e) { errLog(e, 'lexicon.promptRules'); }
                }
                const response = await this.llm.callAPI(prompt);
                if (!response) {
                    console.warn(`[${PLUGIN_NAME}] LLM无响应，用简单提取`);
                    return this.extractMemorySimple(message);
                }
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(sanitizeJson(jsonMatch[0]));
                    // [v3.62] 锁定事实校验器（dsh validateDetailedSummary 理念）：summary 遗漏锁定事实→警告并附提示重试一次
                    if (lockedText && parsed.summary) {
                        const factItems = lockedText.split('\n').map(l => l.replace(/^- /, '').replace(/（第\d+楼锁定）$/, '').trim()).filter(Boolean);
                        const missing = factItems.filter(f => !parsed.summary.includes(f) && !this._lockedRetryDone);
                        if (missing.length) {
                            this._lockedRetryDone = true;
                            console.warn('[' + PLUGIN_NAME + '] ⚠ 摘要遗漏锁定事实 ' + missing.length + ' 条，重试一次');
                            const retryPrompt = prompt + '\n\n【严重警告】你上一次输出的 summary 遗漏了以下用户锁定事实：' + missing.join('；') + '\n请重新输出完整 JSON，summary 必须逐字包含全部锁定事实。';
                            try {
                                const retry = await this.llm.callAPI(retryPrompt);
                                const rm = retry && retry.match(/\{[\s\S]*\}/);
                                if (rm) {
                                    const rp = JSON.parse(sanitizeJson(rm[0]));
                                    if (rp.summary && factItems.every(f => rp.summary.includes(f) || f === '')) { parsed.summary = rp.summary; }
                                }
                            } catch (e2) { /* 重试失败用原结果 */ }
                            this._lockedRetryDone = false;
                        }
                    }
                    // [v3.152] ANIMA 词典线 A3 消费端：① terms 新术语入典（dedup 后登记）；
                    //   ② char_aliases 角色新称呼写入图谱节点 aliases（查询侧 buildAliasMap 单真源）。
                    if (this.config.config.termLexiconEnabled !== false && this.lexicon) {
                        try {
                            const _floorNow = message?.index || 0;
                            let _reg = 0;
                            for (const t of (Array.isArray(parsed.terms) ? parsed.terms : [])) {
                                const name = String(t?.name || '').trim();
                                if (!name || name.length < 2) continue;
                                const r = this.lexicon.resolve(name, _floorNow);
                                if (r && !r.existed) _reg++;
                                if (r && t?.desc && !r.item.desc) r.item.desc = String(t.desc).slice(0, 60);
                                // 新称呼别名合入词条（查询端 attach 规范名）
                                const alias = String(t?.alias || '').trim();
                                if (r && alias && alias.length >= 2 && !r.item.terms.includes(alias) && r.item.terms.length < 8) r.item.terms.push(alias);
                            }
                            for (const ca of (Array.isArray(parsed.char_aliases) ? parsed.char_aliases : [])) {
                                const main = this.resolveCharacterName(String(ca?.name || '').trim());
                                const alias = String(ca?.alias || '').trim();
                                if (!main || !alias || alias.length < 2) continue;
                                try {
                                    const node = [...this.graph.nodes.values()].find(n => n.type === 'character' && n.name === main);
                                    if (node) {
                                        const cur = new Set(node.data?.aliases || []);
                                        if (!cur.has(alias)) { cur.add(alias); node.data = { ...(node.data || {}), aliases: Array.from(cur).slice(0, 8) }; }
                                    }
                                } catch (e) { errLog(e, 'lexicon.charAlias'); }
                            }
                            if ((_reg || parsed.terms?.length) && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 📖 术语词典 +${_reg}（共 ${this.lexicon.items.length}）`);
                            if (_reg) this._invalidateBm25Corpus();
                        } catch (e) { errLog(e, 'lexicon.resolve'); }
                    }
                    // [v1.4] 角色名合法性校验：1-8字、无标点数字，过滤"钥匙在锁"类误提取
                    if (Array.isArray(parsed.characters)) {
                        parsed.characters = parsed.characters.filter(n =>
                            typeof n === 'string' && n.length >= 1 && n.length <= 8 && !/[\d\p{P}\s]/u.test(n)
                        );
                    }
                    // [v3.67] C: 正史增量自动确证——新提取的 events/summary 佐证待定项
                    if (this.deltaBook && this.deltaBook.deltas.some(d => d.status === 'uncertain')) {
                        try {
                            const evidence = [JSON.stringify(parsed.events || ''), parsed.summary || ''].join(' ');
                            let confirmed = 0;
                            for (const d of this.deltaBook.deltas.filter(x => x.status === 'uncertain')) {
                                // 待定项摘要中的关键词（≥2字连续中文/英文片段）出现在新证据中 → 确证
                                const kws = d.summary.split(/[，。；、\s]/).filter(w => w.length >= 2);
                                if (kws.length && kws.filter(k => evidence.includes(k)).length >= 2) {
                                    d.status = 'established';
                                    confirmed++;
                                }
                            }
                            if (confirmed && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 📒 正史增量自动确证: ${confirmed}条`);
                        } catch (e) { errLog(e, 'deltaBook.自动确证'); }
                    }
                    return parsed;
                } else {
                    return this.extractMemorySimple(message);
                }
            } catch (err) {
                console.error(`[${PLUGIN_NAME}] LLM提取失败:`, err);
                return this.extractMemorySimple(message);
            }
        }
        
        // [v1.5] 抄 HCDiary cdCaptureCast：从最近楼层捕获登场角色（词边界正则，防误匹配）
        captureCast() {
            const ctx = window.SillyTavern?.getContext?.();
            const chat = ctx?.chat || [];
            const window = chat.slice(-8); // 最近8楼判定窗口
            const sceneText = window.map(m => (m?.mes || '')).join('\n');
            if (!sceneText) return [];
            const cast = [];
            for (const name of this.getKnownCharacters()) {
                if (!name || name.length < 2) continue;
                try {
                    const re = new RegExp('(?<![\u4e00-\u9fa5a-zA-Z])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-zA-Z0-9])', 'i');
                    if (re.test(sceneText)) cast.push(name);
                } catch (e) { /* 正则失败跳过 */ }
            }
            return cast.slice(0, 5);
        }

        // [v1.5] 抄 HCDiary：已知角色名单（主卡角色 + 图谱已积累角色，排除用户）
        getKnownCharacters() {
            const known = [];
            const ctx = window.SillyTavern?.getContext?.();
            if (ctx?.name2 && ctx.name2 !== ctx.name1) known.push(ctx.name2);
            for (const node of this.graph.nodes.values()) {
                if (node.type === 'character' && node.name && !known.includes(node.name) && node.name !== ctx?.name1) {
                    known.push(node.name);
                }
            }
            return known.slice(0, 20);
        }
        // [v1.5] 抄 HCDiary：别名归并——新名字与已有主名互为包含时，归并到主名
        resolveCharacterName(name) {
            if (!name) return name;
            if (this.graph.nameIndex.has(name)) return name;
            for (const known of this.graph.nameIndex.keys()) {
                if (known.includes(name) || name.includes(known)) return known;
            }
            return name;
        }
        
        // [v3.13] 思维链白名单投递: 提取"场外信号"（角色疑虑/迟到暗示/外部动作/下一幕预告），
        // 仅作为附件包附加向量素材（提升召回命中），绝不写入 summary/timeline/graph/status 任何事实性记忆
        // [v3.22] 场外信号按楼层清理（rollbackFloor 联动）: 删楼后旧信号不残留
        clearThinkingSignalsByFloor(floor) {
            try {
                const f = Math.max(0, Math.round(Number(floor) || 0));
                if (Array.isArray(this._thinkingSignals)) {
                    this._thinkingSignals = this._thinkingSignals.filter(s => s.floor !== f);
                }
            } catch (e) { errLog(e, 'rollbackFloor.场外信号清理'); }
        }
        feedThinking(thinking, floor) {
            if (!thinking) return;
            const t = String(thinking).slice(0, 800);
            // 场外信号判定: 疑虑/预告/外部/未发生类关键词命中才投递（防思维链噪音全量入库）
            const SIGNAL_RE = /(疑虑|怀疑|犹豫|担心|打算|计划|准备|迟到|缺席|不在场|场外|暗中|偷偷|预示|预告|即将|接下来|下一幕|伏笔|内疚|隐瞒)/;
            if (!SIGNAL_RE.test(t)) return;
            const f = Math.max(0, Math.round(Number(floor) || 0));
            this._thinkingSignals = this._thinkingSignals || [];
            // 同楼覆盖（swipe 重跑时替换旧信号，不堆积）
            const idx = this._thinkingSignals.findIndex(s => s.floor === f);
            const sig = { floor: f, text: thinkingAnchorHeader() + '\n' + t, ts: Date.now() };
            if (idx >= 0) this._thinkingSignals[idx] = sig; else this._thinkingSignals.push(sig);
            if (this._thinkingSignals.length > 12) this._thinkingSignals.shift();
            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 场外信号入库（仅检索用）楼层 ${f}`);
        }
    // [v3.14] 从世界书提取角色（收编 zhino A5.2.1: 触发词=世界书 key 是别名最可靠来源）
    // 快速模式: 只读 条目标题路径 + 触发词(key) + 正文前300字
    async extractRolesFromLore() {
        try {
            const ctx = window.SillyTavern?.getContext?.();
            const lore = ctx?.lore;
            if (!lore || !Array.isArray(lore) || !lore.length) return [];
            // 收集条目（覆盖全部条目的 key/comment/content 前300字——zhino: 触发词比正文更小更准）
            const samples = lore.slice(0, Math.min(lore.length, 400)).map(e => {
                const key = String(e?.key || '').trim();
                const title = String(e?.comment || e?.displayName || key || '').trim();
                const body = String(e?.content || '').trim().slice(0, 300);
                return { key, title, body };
            }).filter(s => s.key || s.title || s.body);
            if (!samples.length) return [];
            // [v3.184] 同上一处：字面 replace 换 fuzzy-patch（两处占位符，同样的全角/空格变体静默失效）
            const _fpLibR = _moduleLib(() => window.LonShaFuzzyPatch, 'fuzzy-patch.js');
            const _roleTokens = {
                LORE: samples.map(s => `【${s.title || s.key}】key=${s.key}\n${s.body}`).join('\n---\n'),
                ROLE_COUNT: String(Math.min(samples.length, 80)),
            };
            let prompt;
            if (_fpLibR && typeof _fpLibR.patchTokens === 'function') {
                const _fillR = _fpLibR.patchTokens(this.config.config.extractRolesPrompt || '', _roleTokens);
                prompt = _fillR.text;
                this._promptFillReadRoles = { site: 'roles', total: _fillR.total, applied: _fillR.applied.length, modes: _fillR.modes, missed: _fillR.missed, leftover: _fillR.leftover, leftoverMore: _fillR.leftoverMore };
            } else {
                prompt = String(this.config.config.extractRolesPrompt || '')
                    .replace('{{LORE}}', _roleTokens.LORE)
                    .replace('{{ROLE_COUNT}}', _roleTokens.ROLE_COUNT);
                this._promptFillReadRoles = { site: 'roles', moduleMissing: true, total: 2, applied: 0, modes: {}, missed: [], leftover: [] };
            }
            const raw = await this.llm.callAPI(prompt);
            // 宽松 JSON 解析（兼容 ```json 围栏）
            let arr = [];
            const m = String(raw || '').match(/```json\s*([\s\S]*?)```/);
            const json = m ? m[1] : String(raw || '').replace(/[\s\S]*?(\[.*\])[\s\S]*/s, '$1');
            try { arr = JSON.parse(sanitizeJson(json)); } catch (_) {
                // [v3.101] 截断容错：严格解析失败（如输出被 max_tokens 截断为半截 JSON）
                // 时用宽松恢复保住已完整的条目，而非整体丢弃全部角色。
                const loose = (typeof window !== 'undefined' && window.LonShaLooseJson)
                    || (typeof require !== 'undefined' ? (() => { try { return require('./loose-json.js'); } catch { return null; } })() : null);
                if (loose) {
                    try {
                        arr = loose.parseLooseArray(sanitizeJson(json) || json, { fields: ['name'], max: 200 }).items;
                    } catch (_e) { arr = []; }
                } else {
                    arr = [];
                }
            }
            if (!Array.isArray(arr)) arr = [];
            return arr
                .filter(x => x && typeof x.name === 'string' && x.name.trim())
                .map(x => ({
                    name: x.name.trim(),
                    aliases: (Array.isArray(x.aliases) ? x.aliases : []).filter(a => typeof a === 'string' && a.trim() && a.trim() !== x.name.trim()).map(a => a.trim()).slice(0, 8),
                }))
                .slice(0, Number(this.config.config.extractRolesLimit) || 50);
        } catch (e) { errLog(e, 'V314.extractRolesFromLore'); return []; }
    }

    // [v3.14] 写入图谱: 已有角色只补别名（zhino: 不改主名）；新角色入节点
    applyExtractedRoles(roles) {
        if (!Array.isArray(roles) || !roles.length) return { added: 0, aliasPatched: 0 };
        let added = 0, aliasPatched = 0;
        for (const r of roles) {
            try {
                const canonical = this.resolveCharacterName(r.name);
                const node = this.graph.findCharacterByName(canonical);
                if (node) {
                    // 已有角色: 只补别名，不入新节点
                    const cur = new Set(node.data?.aliases || []);
                    let changed = false;
                    for (const a of (r.aliases || [])) {
                        if (a && !cur.has(a)) { cur.add(a); changed = true; }
                    }
                    if (changed) { node.data = { ...(node.data || {}), aliases: Array.from(cur) }; aliasPatched++; }
                } else {
                    this.graph.addNode({ type: 'character', name: canonical, data: this._scopeData({ source: '[世界书]', aliases: r.aliases || [] }) });
                    added++;
                }
            } catch (e) { errLog(e, 'V314.applyExtractedRoles'); }
        }
        // [v3.173] 缝合模块接线面：entity-semantic.js 缝入后 69 个版本无人调用
        //   （v3.163 账本「已挂载但零消费」）。这里**只登记、只归因，不拦任何行为**：
        //   返回值形状（{added, aliasPatched}）与图谱写入路径一字不动 —— 本版的接线
        //   纪律是「不得改变既有行为」，故模块的产出只进读数台账。
        //   登记表的价值在于「同一个角色在不同楼里被写成不同名字」这件事有了统一身份，
        //   而登记失败（类型不符 / 名字过长）此前是不可见的。
        try {
            const _es = _moduleLib(() => window.LonShaEntitySemantic, 'entity-semantic.js');
            if (_es && typeof _es.createRegistry === 'function') {
                if (!this._entityRegistry) {
                    this._entityRegistry = _es.createRegistry({ normalizeMatch: true });
                    this._entityIdByName = new Map();
                }
                const _read = { input: roles.length, upserted: 0, rejected: 0, aliasesAdded: 0, resolveMiss: 0, sample: [] };
                for (const r of roles) {
                    try {
                        const _nm = String(r && r.name || '').trim();
                        if (!_nm) continue;
                        const _id = this._entityIdByName.get(_nm) || '';
                        const _ent = this._entityRegistry.upsertEntity({
                            id: _id, kind: 'person', name: _nm,
                            aliases: Array.isArray(r.aliases) ? r.aliases : [],
                        });
                        if (!_id) this._entityIdByName.set(_nm, _ent.id);
                        _read.upserted++;
                        _read.aliasesAdded += (_ent.aliases || []).length;
                        // 反查一遍：解析不出唯一实体的名字，正是「重名未合并」的现场
                        const _carry = {};
                        const _hit = this._entityRegistry.resolveEntity('person', _nm, '', _carry);
                        if (!_hit) {
                            _read.resolveMiss++;
                            if (_read.sample.length < 5) _read.sample.push(_nm + ':' + String(_carry.entityResolve && _carry.entityResolve.miss || ''));
                        }
                    } catch (e) {
                        _read.rejected++;
                        if (_read.sample.length < 5) _read.sample.push(String(r && r.name || '?') + ':rejected');
                    }
                }
                _read.registered = this._entityRegistry.size;
                this._entityRegistryRead = _read;
            }
        } catch (e) { errLog(e, 'V3173.entitySemantic'); }
        return { added, aliasPatched };
    }


        /* [M3-O3] 实体映射的宿主读面。**为什么要有薄包装而不是让上层直接摸 _entityRegistry**：
         *   手机侧桥（R3-O1 已把联系人身份消歧做在手机侧）与主聊天必须用**同一份**实体映射，
         *   否则同名角色在两处会被解析成不同的人。包装层同时兜住「模块缺席 / 登记表未建」两态，
         *   调用方拿到的是 {ok:false, reason} 而不是异常。 */
        resolveEntityAt(kind, value, ctx, carry) {
            try {
                const r = this._entityRegistry;
                if (!r || typeof r.resolveEntityAt !== 'function') return { ok: false, reason: 'registry-unavailable', entity: null };
                const e = r.resolveEntityAt(kind, value, ctx || {}, carry || null);
                return e ? { ok: true, reason: '', entity: { id: e.id, kind: e.kind, name: e.name } }
                    : { ok: false, reason: String((carry && carry.entityResolveAt && carry.entityResolveAt.miss) || 'no-match'), entity: null };
            } catch (e) { errLog(e, 'engine.resolveEntityAt'); return { ok: false, reason: 'thrown', entity: null }; }
        }
        /** 某值在当前情境下的全部候选（含被范围排除的，带 blockedBy）——歧义不硬合并的前提是看得见候选 */
        entityCandidatesFor(kind, value, ctx) {
            try {
                const r = this._entityRegistry;
                if (!r || typeof r.candidatesFor !== 'function') return [];
                return r.candidatesFor(kind, value, ctx || {}).map(c => ({
                    id: c.id, name: c.name, via: c.via, matchedAlias: c.matchedAlias, blockedBy: c.blockedBy
                }));
            } catch (e) { errLog(e, 'engine.entityCandidatesFor'); return []; }
        }
        /** 代称（她/老师/那位）候选：结合在场者与最近指代；歧义时返回多条而不是猜一个 */
        referentCandidates(kind, value, ctx) {
            try {
                const r = this._entityRegistry;
                if (!r || typeof r.referentCandidates !== 'function') return [];
                return r.referentCandidates(kind, value, ctx || {});
            } catch (e) { errLog(e, 'engine.referentCandidates'); return []; }
        }
        /** 当前剧情时点（楼层）：别名时段判定的默认 at。取不到就返回 null（不猜现实日期） */
        currentStoryFloor() {
            try {
                /* 首选**当前楼层**（chat 末位）而不是「最近一次见到剧情日期的楼层」：
                 *   后者会滞后，用它判「这个别名现在成不成立」会把已经有效的称呼误挡。
                 *   取不到 chat 时才退回 _lastStoryDateFloor（本仓既有的剧情日楼层字段）。 */
                const chat = window.SillyTavern?.getContext?.()?.chat;
                if (Array.isArray(chat) && chat.length) return chat.length - 1;
                const n = Number(this._lastStoryDateFloor);
                if (Number.isFinite(n) && n >= 0) return n;
            } catch (e) { errLog(e, 'engine.currentStoryFloor'); }
            return null;
        }

        extractMemorySimple(message) {
            // [v1.4 修复] 旧版用正则抓任意中文词块当角色名，产生"钥匙在锁""两下"这类垃圾。
            // 现在只匹配已知角色（当前角色卡 + 图谱已有节点），宁可漏记不记错。
            const content = message.mes || '';
            const known = new Set();
            const ctx = window.SillyTavern?.getContext?.();
            if (ctx?.name2) known.add(ctx.name2);
            if (ctx?.name1) known.add(ctx.name1);
            for (const node of this.graph.nodes.values()) {
                if (node.type === 'character' && node.name) known.add(node.name);
            }
            const characters = Array.from(known).filter(n => n && content.includes(n)).slice(0, 5);
            return {characters, events: [], relationships: [], entities: [], summary: this.summary.smartTruncate(content, 100)};
        }
        
        // [v1.8] P0: 剧情日期提取（优先 LLM 标注，其次从正文匹配，最后兜底实时日期）
        extractStoryDate(messageText, llmDate) {
            if (llmDate) return String(llmDate).trim();
            const m = String(messageText || '').match(/(\d{1,4})\s*[年\/-]\s*(\d{1,2})\s*[月\/-]\s*(\d{1,2})\s*日?/);
            if (m) return `${m[1]}年${m[2]}月${m[3]}日`;
            try {
                const tm = window.VirtualPhone?.timeManager;
                if (tm?.getCurrentStoryTime) {
                    const t = tm.getCurrentStoryTime();
                    if (t?.date && !t.isReal) return String(t.date);
                }
            } catch (e) { errLog(e, 'extractStoryDate'); }
            return null;
        }
        // [v2.9] RU-A: 主动时间推进（抄 shujuku plot-runtime——"三天后"无具体日期时算术推进）
        advanceStoryDate(baseDate, days) {
            try {
                const h = _newRelativeTimeHelper();
                const parsed = h.parseStoryDate(baseDate);
                if (!parsed || parsed.type !== 'standard') return null;  // 架空日历无法算术，宁可不推
                const now = new Date();
                const y = parsed.year ?? now.getFullYear();
                const m = parsed.month ?? (now.getMonth() + 1);
                const d = parsed.day ?? 1;
                const t = new Date(y, m - 1, d + Number(days));
                return `${t.getFullYear()}年${t.getMonth() + 1}月${t.getDate()}日`;
            } catch (e) { return null; }
        }

        // [v1.8] P0: 当前剧情时间锚点（时间线召回用）
        // [v3.18] 时间锚点一致性（baibai 时间协议的轻量版）:
        // 记录最近剧情日，检测时间倒跳（正文矛盾/重roll导致）并告警
        // 不要求主模型改协议，仅用现有 story_date 数据做一致性防线
        _lastStoryDateSeen = null;
        _lastStoryDateFloor = -1;
        // [v3.25] 图扩散节点身份提取（TriviumDB Refractory 用）：兼容原始 result 与 {node} 包裹
        _nodeIdentity(r) {
            try {
                const n = r?.node || r || {};
                return n.id || n.name || n.key || null;
            } catch (e) { return null; }
        }
        // [v3.112] 覆盖账本重算（缝合 AnchorNote refreshSummaryArchiveStateFromAnchors）：
        //   把「哪些楼层该隐藏」从增量记账改成由当前有效覆盖者推导，因此
        //   覆盖者失效（折叠被撤销 / 卷被删 / 摘要被排除）时，被它覆盖的楼层自动恢复可见，
        //   不会再留下「插件藏了但没人认领」的孤儿隐藏楼。
        //   返回实际执行的动作数；模块不可用/宿主能力缺失时返回 null（调用方回落旧路径）。
        _recomputeCoverage(preserveRecent) {
            try {
                const cl = (typeof window !== 'undefined' ? window.LonShaCoverageLedger : null)
                    || (typeof require !== 'undefined' ? (() => { try { return require('./coverage-ledger.js'); } catch { return null; } })() : null);
                if (!cl) return null;
                const c = window.SillyTavern?.getContext?.();
                const chat = c?.chat || [];
                if (!chat.length || typeof c?.hideChatMessageRange !== 'function') return null;
                const keep = Math.max(0, Number(preserveRecent) || 0);
                // 覆盖者：已折叠摘要（单楼覆盖）+ 卷摘要（区间覆盖）。被排除的不参与推导。
                const coverers = [];
                for (const s of (this.summary?.summaries || [])) {
                    if (!s || !s.folded || !Number.isFinite(s.floor)) continue;
                    coverers.push({ id: 'sum_' + s.floor, kind: 'summary', fromFloor: s.floor, toFloor: s.floor, version: 1, excluded: s.excluded === true });
                }
                for (const v of (this.summary?.volumes || [])) {
                    const a = Number(v?.floorStart), b = Number(v?.floorEnd);
                    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
                    coverers.push({ id: 'vol_' + a + '_' + b, kind: 'volume', fromFloor: Math.min(a, b), toFloor: Math.max(a, b), version: 2, excluded: v?.excluded === true });
                }
                // 候选楼层 = 非用户/非系统/当前未被手动隐藏的 AI 楼，或我们自己藏过的楼（需评估是否恢复）
                const ownHidden = [...(this._archivedFloorIds || [])];
                const ownSet = new Set(ownHidden);
                const floors = [];
                let protectFloor = null;
                const aiFloors = [];
                for (let i = 0; i < chat.length; i++) {
                    const m = chat[i];
                    if (!m || m.is_user || m.is_system) continue;
                    if (m.is_hidden && !ownSet.has(i)) continue;   // 用户手动隐藏：绝不接管
                    aiFloors.push(i);
                    floors.push(i);
                }
                if (keep > 0 && aiFloors.length) {
                    const cut = aiFloors[Math.max(0, aiFloors.length - keep)];
                    protectFloor = Number.isFinite(cut) ? cut - 1 : null;   // 最近 keep 个 AI 楼保护
                }
                const plan = cl.planArchiveActions({ coverers, floors, hiddenIds: ownHidden, protectFloor });
                let acted = 0;
                for (const idx of plan.toHide) {
                    try { c.hideChatMessageRange(idx, idx, false); this._archivedFloorIds.add(idx); acted++; } catch (e) { errLog(e, 'nonfatal') }
                }
                for (const idx of plan.toRestore) {
                    try {
                        if (typeof c.setIsHidden === 'function') c.setIsHidden(idx, false);
                        else c.hideChatMessageRange(idx, idx, true);
                        this._archivedFloorIds.delete(idx);
                        acted++;
                    } catch (e) { errLog(e, 'nonfatal') }
                }
                this._lastCoverageSummary = cl.summarizeCoverage(plan);
                if (acted && this.config.config.debugMode) {
                    console.log(`[${PLUGIN_NAME}] [v3.112] 覆盖账本重算: 隐藏 +${plan.toHide.length} / 恢复 ${plan.toRestore.length}（保持 ${plan.unchanged}）`);
                }
                return acted;
            } catch (e) { errLog(e, '覆盖账本.recomputeCoverage'); return null; }
        }
        // [v3.25] 归档隐藏已被卷摘要覆盖的旧楼层（Bakemono archive-controller 移植，默认关）:
        // 可逆（is_hidden 可恢复）、保留最近 N 个 AI 楼、手动确认由 settings-ui 触发
        // [v3.112] 缝合 AnchorNote 覆盖账本：coverageLedgerEnabled 打开后改为「推导式」——
        //   隐藏状态由当前有效覆盖者推导，覆盖者失效（折叠撤销/卷被删）时自动恢复对应楼层，
        //   不再依赖「结构一变就清空集合、只能全量重推」。默认关时行为与 v3.25 完全一致。
        archiveCoveredFloors(preserveRecent) {
            try {
                const c = window.SillyTavern?.getContext?.();
                const chat = c?.chat || [];
                if (!chat.length || typeof c?.hideChatMessageRange !== 'function') return 0;
                const keep = Math.max(0, numOr(preserveRecent != null ? preserveRecent : this.config.config.archivePreserveRecent, 6));   // [v3.159] 回退值改为与默认配置一致（原为 0：配置键缺失时会把所有楼层吐掉）
                if (this.config.config.coverageLedgerEnabled === true) {
                    const applied = this._recomputeCoverage(keep);
                    if (applied !== null) return applied;
                }
                // 被卷摘要覆盖的楼层 = 折叠标记（folded=true）对应的摘要楼层
                const foldedFloors = new Set(
                    (this.summary?.summaries || [])
                        .filter(s => s.folded && Number.isFinite(s.floor))
                        .map(s => s.floor)
                );
                // 收集这些楼对应的 chat 下标（最近 keep 个 AI 楼保留）
                let aiSeen = 0;
                const toHide = [];
                for (let i = 0; i < chat.length; i++) {
                    const m = chat[i];
                    if (!m || m.is_user || m.is_system || m.is_hidden) continue;
                    aiSeen++;
                    if (aiSeen > keep && foldedFloors.has(i) && !this._archivedFloorIds.has(i)) {
                        toHide.push(i);
                    }
                }
                // 执行隐藏（逐个，可逆）
                let hid = 0;
                for (const idx of toHide) {
                    try { c.hideChatMessageRange(idx, idx, false); this._archivedFloorIds.add(idx); hid++; } catch (e) { errLog(e, 'nonfatal') }
                }
                if (hid && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 归档隐藏: ${hid} 楼 (保留最近 ${keep} AI楼)`);
                // [v3.173] 缝合模块接线面：floor-range.js 缝入后 72 个版本无人调用
                //   （v3.163 账本「已挂载但零消费」）。接线点选在**折叠覆盖集已知**的这里：
                //   把已折叠楼层当覆盖区间，问一句「水位到哪、中间有没有空洞、下一段待处理是什么」。
                //   空洞正是删楼/撤销折叠留下的形状，而旧实现只报一个 hid 计数，看不见断口。
                //   纯读，不改 toHide 的构造，也不改本方法的返回值。
                try {
                    const _fr = _moduleLib(() => window.LonShaFloorRange, 'floor-range.js');
                    if (_fr && typeof _fr.mergeRanges === 'function') {
                        const _cov = [];
                        for (const _f of foldedFloors) _cov.push({ start: _f, end: _f });
                        const _cm = {};
                        const _merged = _fr.mergeRanges(_cov, _cm);
                        const _latest = chat.length - 1;
                        const _cp = {};
                        const _pending = _fr.computePendingRange(_merged, _latest, _cp);
                        const _rm = _cm.rangeMerge || {}, _pr = _cp.pendingRange || {};
                        this._floorRangeLedger = {
                            coveredIn: _rm.input || 0, coveredValid: _rm.valid || 0,
                            dropped: _rm.dropped || 0, segments: _rm.merged || 0,
                            span: _rm.span || 0, holes: _pr.holes || 0,
                            pending: _pr.pending || 0, coveredTo: _pr.coveredTo || 0,
                            latest: _latest, behind: _pr.behind === true, hid,
                        };
                    }
                } catch (e) { errLog(e, 'V3173.floorRange'); }
                return hid;
            } catch (e) { errLog(e, '归档隐藏.archiveCoveredFloors'); return 0; }
        }
        // 恢复插件归档隐藏的楼层（is_hidden=false）
        restoreArchivedFloors() {
            try {
                const c = window.SillyTavern?.getContext?.();
                const chat = c?.chat || [];
                if (!this._archivedFloorIds.size) return 0;
                let restored = 0;
                for (const idx of this._archivedFloorIds) {
                    const m = chat[idx];
                    if (m && typeof c?.setIsHidden === 'function') {
                        try { c.setIsHidden(idx, false); restored++; } catch (e) { errLog(e, 'nonfatal') }
                    }
                }
                this._archivedFloorIds.clear();
                if (restored && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 归档恢复: ${restored} 楼`);
                return restored;
            } catch (e) { errLog(e, '归档隐藏.restoreArchivedFloors'); return 0; }
        }
        // [v3.23] chatMetadata 嵌入记忆库迁移恢复（NE auto-restore 轻量版）
        // 检测 chatMetadata.extensions.LonShaMemory.embeddedVault（导出时嵌入的全量存档），
        // 本地有更新版本则忽略并清理；本地为空则在启动时提示恢复。
        checkEmbeddedMigration() {
            try {
                if (this._migrateRestored) return;
                this._migrateRestored = true;
                const c = window.SillyTavern?.getContext?.();
                const meta = c?.chatMetadata;
                const _sk = this.storage.STORAGE_KEY;   // [v3.140] engine 无此属性（旧值 undefined → 存档落在 extensions['undefined']），改用真键并兼容旧键
                const emb = meta?.extensions?.[_sk]?.embeddedVault || meta?.extensions?.undefined?.embeddedVault;
                if (!emb || typeof emb !== 'object') return;
                // 本地已有记忆库且不旧于嵌入存档 → 清理嵌入并跳过
                // [v3.140] CP 判旧修复：v3.138 把 _dataVersion 强转数值后比较，但它存的是版本字符串
                // （形如 3.138.0）→ 强转恒得 NaN→0 → 判旧恒假（恢复分支从不可达翻成恒可达，
                // 每次开聊都提示恢复）；且按浮点比较 3.10 会小于 3.9，语义颠倒。
                // 现在判旧只看整数 schemaVersion（结构代际），插件版本比较走 compareVersion 分段数值。
                const localSchema = ARCHIVE_SCHEMA_VERSION;
                const embSchema = Number(emb.schemaVersion) || 0;
                const embProducer = emb.producerVersion || emb.version || '0';
                const localHasData = !!this._loadedChatId || !!window.SillyTavern?.getContext?.()?.chatMetadata?.extensions?.[this.storage.STORAGE_KEY]?.data;
                const localNotOlder = embSchema < localSchema
                    || (embSchema === localSchema && compareVersion(VERSION, embProducer) >= 0);
                if (localHasData && localNotOlder) {
                    this.clearEmbeddedVaultMeta();
                    return;
                }
                // 本地空 → 弹提示（非阻塞）
                try {
                    const toastr = window.toastr;
                    if (toastr?.info) {
                        toastr.info(`检测到聊天元数据中嵌入的记忆存档（插件 ${embProducer}，结构 v${embSchema}）。本地数据为空或更旧，请到设置→数据管理→恢复嵌入存档。`, 'LonSha记忆引擎', { timeOut: 6000, closeButton: true });
                    }
                } catch (e2) { errLog(e2, 'nonfatal'); }
                // 可恢复数据留在 embeddedVault 供 settings-ui 导入按钮读取
                const cfg = this.config.config;
                cfg._embeddedVaultReady = true;
                this.config.saveConfig();
                // [v3.138] CP-L2: 恢复入口实化——设置面板的「恢复嵌入存档」按钮此前不存在（标志只写不读），
                // 面板已挂载时立即显示按钮；未挂载时面板渲染期按 _embeddedVaultReady 显示。
                try { document.querySelector('#ls-embedded-restore')?.removeAttribute('style'); } catch (e2) { /* 面板未开 */ }
            } catch (e) { errLog(e, '迁移恢复.checkEmbeddedMigration'); }
        }
        clearEmbeddedVaultMeta() {
            try {
                const c = window.SillyTavern?.getContext?.();
                const meta = c?.chatMetadata;
                const _sk = this.storage.STORAGE_KEY;   // [v3.140] 真键 + 旧 undefined 键一并清理
                if (meta?.extensions?.[_sk]?.embeddedVault) delete meta.extensions[_sk].embeddedVault;
                if (meta?.extensions?.undefined?.embeddedVault) delete meta.extensions.undefined.embeddedVault;
                if (!meta?.extensions?.[_sk] && !meta?.extensions?.undefined) return;
                this._migrateRestored = true;
            } catch (e) { errLog(e, '迁移恢复.clearEmbeddedVaultMeta'); }
        }
        // [v3.23] 导出时把当前记忆附加到 chatMetadata 供跨设备迁移（NE auto-restore 的写入侧）
        embedVaultToChatMeta() {
            try {
                if (typeof this.collectExport !== 'function') return false;
                const payload = this.collectExport();
                if (!payload) return false;
                const c = window.SillyTavern?.getContext?.();
                const meta = c?.chatMetadata;
                if (!meta) return false;
                if (!meta.extensions) meta.extensions = {};
                const _sk = this.storage.STORAGE_KEY;   // [v3.140] 用真键写入（原落 extensions['undefined']）
                if (meta.extensions?.undefined?.embeddedVault) delete meta.extensions.undefined.embeddedVault;   // 收编旧键残留
                if (!meta.extensions[_sk]) meta.extensions[_sk] = {};
                meta.extensions[_sk].embeddedVault = payload;
                return true;
            } catch (e) { errLog(e, '迁移恢复.embedVaultToChatMeta'); return false; }
        }
        checkTimeMonotonic(dateStr, floor) {
            try {
                if (!dateStr) return null;
                const cur = this._lastStoryDateSeen;
                if (cur && dateStr !== cur) {
                    // 粗略判断倒跳（用 storyDayDiff，负值=往前跳）
                    const diff = (this.storyDayDiff || storyDayDiff)(dateStr, cur);
                    if (diff !== null && diff !== undefined && diff < 0) {
                        this._timeWentBack = { from: cur, to: String(dateStr), floor: Number(floor) || 0, at: Date.now() };
                        if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] ⚠ 剧情时间倒跳: ${cur} → ${dateStr} (第${floor}楼) — 可能是重roll/编辑导致，记忆已按新时间锚点`);
                    }
                }
                this._lastStoryDateSeen = dateStr;
                this._lastStoryDateFloor = Number(floor) || 0;
                return dateStr;
            } catch (e) { return dateStr; }
        }
        getLatestStoryDate() {
            try {
                // 优先从最近楼层找剧情日期
                const ctx = window.SillyTavern?.getContext?.();
                const chat = ctx?.chat || [];
                for (let i = chat.length - 1; i >= Math.max(0, chat.length - 6); i--) {
                    const m = chat[i];
                    const text = (m?.mes || '') + (m?.content || '');
                    const hit = String(text).match(/(\d{1,4})\s*[年\/-]\s*(\d{1,2})\s*[月\/-]\s*(\d{1,2})\s*日?/);
                    if (hit) return `${hit[1]}年${hit[2]}月${hit[3]}日`;
                }
                // 兜底：手机时间管理器
                const tm = window.VirtualPhone?.timeManager;
                if (tm?.getCurrentStoryTime) {
                    const t = tm.getCurrentStoryTime();
                    if (t?.date && !t.isReal) return String(t.date);
                }
            } catch (e) { errLog(e, 'getLatestStoryDate'); }
            return null;
        }

        // [v1.4] 正文清洗：剥离注释/标签/世界书标记
        cleanMessageText(text) {
            return String(text || '')
                .replace(/<!--[\s\S]*?-->/g, '')      // HTML注释 (SDC-start 等)
                .replace(/<\/?[a-zA-Z_][\w-]*[^>]*>/g, '')  // 自定义标签 (konatan_planning 等)
                .replace(/\[\[.*?\]\]/g, '')           // [[宏]]
                .replace(/\{\{.*?\}\}/g, '')          // {{宏}}
                .trim();
        }
        
        async onBeforeGeneration(context) { // preserveRuntime: true 生成路径只读加载
            if (!this.config.config.enabled) return '';
            const chatId = this.getCurrentChatId();
            if (!chatId) return '';
            // [v3.123] 聊天切换与同楼 swipe/编辑隔离游标，避免把上一聊天的时间线边界带入当前聊天。
            try {
                const _cursorChat = String(chatId);
                const _cursorCtx = window.SillyTavern?.getContext?.();
                const _cursorChatRows = _cursorCtx?.chat || [];
                const _cursorFloor = _cursorChatRows.length - 1;
                const _cursorMsg = _cursorChatRows[_cursorFloor];
                const _cursorFp = _cursorMsg ? msgFpOf(_cursorMsg) : '';
                if (this._timelineCursorChatId !== null && this._timelineCursorChatId !== _cursorChat) {
                    this._timelineInjectFloor = null;
                    this._timelineCursorFingerprint = '';
                    this._diaryInjectFloor = null;   // [v3.126] 聊天切换同时重置日记游标（与时间线游标同语义）
                } else if (this._timelineCursorFingerprint && _cursorFp && this._timelineCursorFingerprint !== _cursorFp) {
                    this._timelineInjectFloor = Math.max(-1, _cursorFloor - 1);
                    this._diaryInjectFloor = this._diaryInjectFloor == null ? null : Math.max(-1, _cursorFloor - 1);   // [v3.126] 同楼 swipe/编辑指纹变化同步回退日记游标
                }
                this._timelineCursorChatId = _cursorChat;
                this._timelineCursorFingerprint = _cursorFp;
                // [v3.153] swipe 感知（anima #33 _isSwipeMode 原生对应）：末楼 swipe_id>0 = 正在重绘 assistant 回复
                this._swipeRegen = ((Number(_cursorMsg?.swipe_id) || 0) > 0);
                this._currentFloor = _cursorFloor;
            } catch (e) { errLog(e, 'onBeforeGeneration.时间线游标边界'); }
            try {
                // [v3.27] 命中轨迹计时起点（MemoryPilot monitor）
                this._traceStartTime = Date.now();
                // [v3.12] 生成路径只读加载（原无条件 load 会 import 旧存档覆盖运行时——自愈/shift/编辑修改全被回退）
                await this.storage.load(chatId, { preserveRuntime: true });
                const query = this.buildQuery(context);
                // [v2.9] RU-D: swipe 同楼重roll复用缓存（抄 anima _lastRetrievalPayload——同楼且同查询直接复用，省 rewrite+embedding+rerank 三次调用）
                // [v3.109] 召回产物持久化（缝合 bionic turn-artifact）：在既有三元组缓存之外，
                //   额外按「历史指纹」判定复用——上游更早楼层被编辑/swipe 后，位置与查询都没变
                //   但历史已不同，此时必须放弃复用（既有实现会照旧复用陈旧注入）。
                //   默认关（recallArtifactEnabled:false），且仅在跨会话（内存缓存为空）时取用。
                if (this.config.config.recallArtifactEnabled === true) {
                    try {
                        const aa = (typeof window !== 'undefined' ? window.LonShaRecallArtifact : null)
                            || (typeof require !== 'undefined' ? (() => { try { return require('./recall-artifact.js'); } catch { return null; } })() : null);
                        if (aa) {
                            const ctxChat2 = window.SillyTavern?.getContext?.()?.chat || [];
                            const curFloor2 = ctxChat2.length - 1;
                            const histFp = this._historyFingerprint ? this._historyFingerprint() : '';
                            const want = {
                                turnId: 'turn_' + curFloor2,
                                artifactKind: 'recall',
                                inputFingerprint: aa.createInputFingerprint({
                                    turnId: 'turn_' + curFloor2,
                                    userMessage: String(query.text || ''),
                                    recentMessages: [hash32(String(query.recentText || ''))],
                                    historyFingerprint: histFp,
                                }),
                                historyFingerprint: histFp,
                            };
                            const hit2 = aa.findReusableArtifact(this._recallArtifacts, want);
                            // 仅在内存缓存缺失（新会话/重新打开）时才取用持久产物；内存缓存命中优先走既有路径
                            if (hit2.artifact && !this._recallCache) {
                                if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] [v3.109] 召回产物复用（跨会话命中，历史指纹一致）`);
                                return hit2.artifact.injectionText;
                            } else if (this.config.config.debugMode && !hit2.artifact && hit2.reason === 'history-changed') {
                                console.log(`[${PLUGIN_NAME}] [v3.109] 召回产物不可复用: 历史指纹变化（上游楼被编辑/删楼），重算召回`);
                            }
                        }
                    } catch (e) { errLog(e, 'onBeforeGeneration.召回产物'); }
                }
                if (this.config.config.recallCacheEnabled && this._recallCache) {
                    try {
                        const ctxChat = window.SillyTavern?.getContext?.()?.chat || [];
                        const curFloor = ctxChat.length - 1;
                        const qKey = String(query.text || '').slice(0, 200);
                        // [v3.89] 三元组定位符校验（吸收 MyriadKnots floor-binding）：floor + 消息指纹（role|swipe|hash|date）双验证
                        // 翻 swipe 变体 → fp 变化 → 自动失效重算；翻回旧变体 → fp 相同 → 到变体级复用（v2.9 原意更精细化）
                        const curMsg = ctxChat[curFloor];
                        const curFp = (this.config.config.swipeFingerprintGuard !== false && curMsg) ? msgFpOf(curMsg) : '';
                        /* [v3.254.0] M-O4：**身份位前置**（会话 / 代际 / 修订 / 历史），见 `_cacheIdentityStale` 头注。
                           位置位（floor + queryKey + fp）只说「同一楼、同一问、同一变体」，说不出
                           「还是不是同一段会话、同一代剧情」——旧版正因此会在换对话后命中上一段的注入。
                           模块不在场时 `_cacheIdentityStale` 返回 null ⇒ `_identOk` 为 true ⇒ 退回既有判据
                           （**不允许**把「不知道身份」当成「已失效」，那会静默禁用缓存）。 */
                        const _idv = this._cacheIdentityStale(this._recallCache);
                        const _identOk = !(_idv && _idv.stale);
                        if (this.config.config.debugMode && _idv && _idv.stale) console.log(`[${PLUGIN_NAME}] [v3.254.0] 召回缓存失效（身份：${_idv.reason}${_idv.unjudgeable ? '，判据不全保守重算' : ''}），重算召回`);
                        if (_identOk && this._recallCache.floor === curFloor && this._recallCache.queryKey === qKey && this._recallCache.injection
                            && this._recallCache.fp === curFp) {
                            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 召回缓存命中 (floor ${curFloor})`);
                            return this._recallCache.injection;
                        }
                        if (this._recallCache.floor === curFloor && typeof this._recallCache.fp === 'string' && this._recallCache.fp !== curFp
                            && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] [v3.89] 召回缓存失效: 末楼指纹变化（swipe/编辑），重算召回`);
                    } catch (e) { errLog(e, 'cleanMessageText'); }
                }
                // [v2.4] RE: 召回价值判断（抄 baibai recallWorthRunning——剧情全在窗口内时跳过，省额度）
                if (!this.recallWorthRunning()) return '';
                // [v2.4] RE: 查询重写——把最近剧情改写成多条检索查询，主查询之外追加多路
                try {
                    // [v3.77] C: 构建状态快照（主角/场景/时间——供改写查询指代消解，柏宝书 rewrite 上下文构造）
                    let _rwSnap = '';
                    try {
                        const _parts = [];
                        const _pr = this.status?.getProtagonist?.();
                        if (_pr && (_pr.identity || _pr.outfit)) _parts.push('主角:' + [_pr.identity, _pr.outfit].filter(Boolean).join('/'));
                        const _sc = this.scene?.currentKey?.();
                        if (_sc) { const _ch = this.scene.chainOf?.(_sc) || []; if (_ch.length) _parts.push('场景:' + _ch.map(n => n.path?.[n.path.length - 1] || '').filter(Boolean).join('›')); }
                        if (this.clock?.date) _parts.push('时间:' + this.clock.date);
                        _rwSnap = _parts.join(' | ');
                    } catch (e) { errLog(e, 'nonfatal') }
                    const qs = await this.llm.rewriteQuery(query.text, _rwSnap);
                    if (qs && qs.length) query.queries = qs;
                } catch (e) { errLog(e, 'cleanMessageText'); }
                const recalled = await this.recallMemory(query);
                // [v2.5/v3.40] RF: 回响池——本轮召回的进池续命，池中仍在停留期的合并注入（与下游世界推进与去重无缝合流，杜绝早退截断）
                let candidateItems = [...recalled];
                // [v3.121] Horae 时间锚点变化注入：只追加游标之后、与当前剧情日期相关的新时间线事件。
                // 复用 PlotTimeline，不创建平行时间线；普通 timeline 召回保持不变。
                let _timelineChangeFloor = null;
                if (this.config.config.timeChangeDrivenInjection !== false) {
                    try {
                        const _chatForTime = window.SillyTavern?.getContext?.()?.chat || [];
                        const _currentTimeFloor = _chatForTime.length - 1;
                        const _timeCursor = this._timelineInjectFloor == null
                            ? Math.max(-1, _currentTimeFloor - 6)
                            : Number(this._timelineInjectFloor);
                        const _anchorDate = this.clock?.date || this.getLatestStoryDate?.() || '';
                        const _timeChangeLimit = Number(this.config.config.timeChangeMaxCandidates);
                        const _tlChanges = this.timeline?.getChangesSince?.(
                            _timeCursor, _anchorDate,
                            Number.isFinite(_timeChangeLimit) && _timeChangeLimit > 0 ? Math.floor(_timeChangeLimit) : 5,
                            this.config.config.timelineWindowDays || 3,
                            this.captureCast()
                        ) || [];
                        const _seenTimeline = new Set(candidateItems.filter(x => String(x?.source || '').includes('timeline')).map(x => String(x.id || x.text || '')));
                        for (const _t of _tlChanges) {
                            const _key = String(_t.id || _t.text || '');
                            if (_seenTimeline.has(_key)) continue;
                            _seenTimeline.add(_key);
                            candidateItems.push({ ..._t, source: 'timeline:change', text: `[时间锚点·${_t.date || _anchorDate}] ${_t.text || ''}` });
                        }
                        // [v3.123] 角色状态、关系对和物品也沿用同一时间/楼层游标进入候选池。
                        // [v3.127] 统一去重：常规召回可能已带同一状态/关系/物品事实，变化候选按 id+文本二次键
                        //   过滤，避免同一事实占两份注入预算（时间线/日记两路此前已各自去重，此处补齐）。
                        const _castForChanges = this.captureCast();
                        const _seenAny = new Set(candidateItems.flatMap(x => [String(x?.id || ''), String(x?.text || '')]).filter(Boolean));
                        const _pushChange = (arr) => {
                            let added = 0;
                            for (const c of (arr || [])) {
                                const idk = String(c?.id || '');
                                const txk = String(c?.text || '');
                                if ((idk && _seenAny.has(idk)) || (txk && _seenAny.has(txk))) continue;
                                if (idk) _seenAny.add(idk);
                                if (txk) _seenAny.add(txk);
                                candidateItems.push(c);
                                added++;
                            }
                            return added;
                        };
                        const _statusChanges = this.status?.getChangesSince?.(_timeCursor, _castForChanges, 8) || [];
                        const _pairChanges = this.pairMem?.getChangesSince?.(_timeCursor, _castForChanges, 6) || [];
                        const _itemChanges = (this.itemOps || []).filter(o => Number(o?.floor) > _timeCursor && (!o?.holder || !_castForChanges.length || _castForChanges.includes(String(o.holder)))).slice(-8)
                            .map(_i => ({ id: `item_change_${_i.floor}_${_i.name || ''}`, floor: _i.floor, text: `【物品变化】${_i.name || '物品'}${_i.holder ? `（持有者：${_i.holder}）` : ''}${_i.state ? `：${_i.state}` : ''}`, source: 'items:change' }));
                        const _addedStatus = _pushChange(_statusChanges);
                        const _addedPair = _pushChange(_pairChanges);
                        const _addedItem = _pushChange(_itemChanges);
                        _timelineChangeFloor = _currentTimeFloor;
                        // [v3.127] 变化注入可见性：记录本轮游标与各路候选产量（状态面板诊断，不注入模型）
                        this._lastChangeTrace = {
                            floor: _currentTimeFloor, cursor: _timeCursor,
                            anchorDate: String(_anchorDate || ''),
                            timeline: { found: _tlChanges.length },
                            status: { found: _statusChanges.length, added: _addedStatus },
                            pair: { found: _pairChanges.length, added: _addedPair },
                            items: { found: _itemChanges.length, added: _addedItem },
                            ts: new Date().toISOString()
                        };
                    } catch (e) { errLog(e, 'onBeforeGeneration.时间锚点变化注入'); }
                }
                // [v3.120] HCDiary 变化驱动注入：当前回合只追加游标之后、当前登场角色的新日记。
                // 旧召回链仍保留，开关关闭时完全回到 v3.119 行为。
                let _diaryChangeFloor = null;
                if (this.config.config.diaryChangeDrivenInjection !== false) {
                    try {
                        const _chatForDiary = window.SillyTavern?.getContext?.()?.chat || [];
                        const _currentDiaryFloor = _chatForDiary.length - 1;
                        const _diaryCast = this.captureCast();
                        const _cursor = this._diaryInjectFloor == null
                            ? Math.max(-1, _currentDiaryFloor - Math.max(6, numOr(this.config.config.diaryEveryFloors, 3) * 2))   // [v3.156] 0=每楼
                            : Number(this._diaryInjectFloor);
                        const _changes = this.diary?.getChangesSince?.(_cursor, _diaryCast, 30) || [];
                        const _seenDiary = new Set(candidateItems.filter(x => String(x?.source || '').includes('diary')).map(x => `${x.name || x.character || ''}\x1f${x.text || x.entry || ''}`));
                        let _addedDiary = 0;
                        for (const _d of _changes) {
                            const _key = `${_d.name || ''}\x1f${_d.text || _d.entry || ''}`;
                            if (_seenDiary.has(_key)) continue;
                            _seenDiary.add(_key);
                            candidateItems.push({ ..._d, source: 'diary:change' });
                            _addedDiary++;
                        }
                        _diaryChangeFloor = _currentDiaryFloor;
                        // [v3.127] 日记产量并入变化注入诊断轨迹
                        try { this._lastChangeTrace = { ...(this._lastChangeTrace || {}), diary: { found: _changes.length, added: _addedDiary, cursor: _cursor } }; } catch (e) { errLog(e, 'nonfatal') }
                    } catch (e) { errLog(e, 'onBeforeGeneration.日记变化注入'); }
                }
                try {
                    if (this.config.config.echoEnabled) {
                        const merged = new Map();
                        // [v3.124] 保留此前汇入统一候选池的变化驱动条目（日记/时间线/状态/关系/物品）；
                        // 仅从 recalled 初始化会在 echoEnabled 时静默丢弃这些候选。
                        for (const r of candidateItems) merged.set(r.id || r.text || JSON.stringify(r).slice(0, 60), r);
                        for (const e of this.echo.tick()) {
                            if (e.text && !merged.has(e.key)) merged.set(e.key, { id: e.key, text: e.text, source: e.source, echo: true });
                        }
                        this.echo.onRecalled(recalled);
                        candidateItems = Array.from(merged.values()).slice(0, this.config.config.vectorTopK * 2 + numOr(this.config.config.echoMaxCount, 10));   // [v3.156] 0=不加回响
                    }
                } catch (e) { errLog(e, 'onBeforeGeneration.回响池'); }
                // [v3.16] 世界推进: 生成路径注入前把待推进的不在场角色动态并入（zhino: 玩家发消息不在生成时挤 API，后台推演产物注入）
                try {
                    if (this.config.config.worldProgressEnabled) {
                        // [v3.17] 发布确认: 生成路径注入 = 宿主确认点，pending 一次性 publish（shujuku 语义）
            // [v3.21] 世界推进实际推演（修复空转）: active 为空时用 charMem 填充，再 publish/toInjection
            try {
                if (this.config.config.worldProgressEnabled && this.worldProg) {
                    const activeCount = this.worldProg.active ? Object.keys(this.worldProg.active).length : 0;
                    if (activeCount === 0) {
                        const currentChat = window.SillyTavern?.getContext?.()?.chat || [];
                        const known = this.getKnownCharacters();
                        const present = this.captureCast();
                        const floor = currentChat.length;
                        this.worldProg.generateFromMemory(this, known, present, floor);
                    }
                    if (this.worldProg.pendingWrite) this.worldProg.publish();
                }
            } catch (e) { errLog(e, 'onBeforeGeneration.世界推进推演'); }
            const prog = this.config.config.worldProgressEnabled && this.worldProg ? this.worldProg.toInjection(this.captureCast?.() || []) : [];
                        for (const wp of prog) {
                            if (!candidateItems.some(r => (r.text || '') === wp.text)) candidateItems.push(wp);
                        }
                        // [v3.23] 跨调用去重: 本轮回溯结果记指纹（NE-Memory）。同一话题连续追问时下轮识别已覆盖项
                        try {
                            // [v3.139] CP-L3 身份单通道：去重命名空间身份收编 getCurrentChatId 单一真源。
                            // 原私有通道 ctx?.chatId || characterId 与单真源（chatId → file_name）优先级不一致，
                            // 同角色多会话场景下指纹命名空间交叉串扰。
                            const chatIdCc = window.LonShaMemory?.engine?.getCurrentChatId?.() || '';
                            // 先记指纹（基于原始 recalled，不含 DEDUP 标记前缀，防自污染）
                            recallDedupRemember(candidateItems);
                            const dedupMarked = recallDedupMark(candidateItems, chatIdCc, String(query.text || ''));
                            if (dedupMarked && dedupMarked.length) {
                                for (const dm of dedupMarked) {
                                    candidateItems.push({ text: `[DEDUP已覆盖·若本轮查询需更深细节才用] ${dm.text || ''}`, source: 'dedup' });
                                }
                            }
                        } catch (e) { errLog(e, 'recallMemory.跨调用去重'); }
                    }
            } catch (e) { errLog(e, 'onBeforeGeneration.世界推进'); }
                // [v3.96] 缝合：前置 AI 精选 + 统一召回管线（在 buildInjection 前对 candidateItems 做语义精选）
                try {
                    const _cfg = this.config.config;
                    // [v3.172] 每轮漏斗读数：四个模块的收缩量各自入账，缺读数也入账（I6）
                    const _funnel = { round: 1 };
                    try {
                    // [v3.249.0] M-O1：精排路径归因。只在真走 LLM 精排时入账——
                    //   无条件写入会让 _funnel 恒非空、「漏斗空读轮次」（I6）永远为 0。
                    if (this._rerankPath === 'llm') _funnel.rerankPath = 'llm';
                    // ③ 统一召回：把图谱节点候选化并入候选池（走同一套评分，类型保底）
                    if (_cfg.unifiedRecallEnabled && this.unifiedRecall && this.graph && this.graph.nodes) {
                        try {
                            const _urCarry = {};
                            // [v3.249.0] M-O1：候选资格与最终限额分离——这一路要**全量**候选
                            //   （includeDeferred），上限只用于拿「按默认上限会被挡在评分之外的条数」读数；
                            //   去重与最终注入预算仍由下方 candidateItems 与 buildInjection 把关。
                            const _urAll = this.unifiedRecall.graphToCandidates(this.graph.nodes, { includeDeferred: true }, _urCarry);
                            /* [M3-O2] 事件级去重：同一事件的多节点（起因/经过/结果各切一个）不再各占
                             *   一个候选位——否则预算被同一件事的多个切面吃光，别的事件进不来。
                             *   无事件键的节点一律保留（「没有键」不等于「属于同一件事」）。 */
                            const graphCands = (typeof this.unifiedRecall.dedupeByEvent === 'function')
                                ? this.unifiedRecall.dedupeByEvent(_urAll, {}, _urCarry) : _urAll;
                            _funnel.graphEvents = Number(_urCarry.evEvents) || 0;
                            _funnel.graphEventDropped = Number(_urCarry.evDropped) || 0;
                            _funnel.graphDropped = Number(_urCarry.dropped) || 0;
                            _funnel.graphGuaranteed = Number(_urCarry.guaranteedKept) || 0;
                            _funnel.graphDeferred = Number(_urCarry.deferred) || 0;
                            _funnel.graphCapFill = Number(_urCarry.capFill) || 0;
                            const _lut = String(query.text || '');
                            const _lrt = String(query.recentText || query.text || '');
                            for (const gc of graphCands) {
                                const r = window.LonShaAISelect?.scoreEntry ? window.LonShaAISelect.scoreEntry(gc, _lut + '\n' + _lrt, _lut, _lrt) : { score: 0 };
                                if ((r.score || 0) > 0 || gc._guaranteed) {
                                    /* [M3-O2] 注入的是**证据句**而不是整段原文：完整原文留在 searchText
                                     *   里供检索，进上下文的按预算取句（否定与数额不切断）。 */
                                    let txt = (gc.content || gc._label || '').trim();
                                    if (typeof this.unifiedRecall.extractEvidenceSentences === 'function' && gc.searchText) {
                                        const _ev = this.unifiedRecall.extractEvidenceSentences(gc.searchText, _lut + ' ' + _lrt, { budget: 3 });
                                        if (_ev && _ev.text && _ev.text.length > txt.length) {
                                            txt = _ev.text;
                                            _funnel.graphEvidence = (_funnel.graphEvidence || 0) + 1;
                                        }
                                    }
                                    if (txt && !candidateItems.some(x => (x.text || '') === txt)) {
                                        candidateItems.push({ id: gc.id, text: txt, source: 'graph:' + gc._nodeType, _score: r.score || 0 });
                                    }
                                }
                            }
                        } catch (e) { errLog(e, 'onBeforeGeneration.统一召回'); }
                    }
                    // ① 前置 AI 精选：候选语义精选（仅当开启且候选数超出精选上限时才介入，避免小候选浪费调用）
                    if (_cfg.aiSelectEnabled && this.aiSelect && Array.isArray(candidateItems) && candidateItems.length > (_cfg.aiSelectMaxSelect || 6)) {
                        try {
                            // 把 candidateItems 包装成带 keys 的候选（text 作 label/content，供 scoreEntry 与 prompt 使用）
                            const _lut = String(query.text || '');
                            const _lrt = String(query.recentText || query.text || '');
                            const wrapped = candidateItems.map((it, i) => {
                                const t = String(it.text || '').trim();
                                const label = (t.split(/[\n，。]/)[0] || t).slice(0, 24) || ('条目' + i);
                                return { id: it.id || ('cand_' + i), _label: label, comment: label, content: t.slice(0, 200), constant: false, keys: { primary: [label], secondary: [], all: [label] }, _orig: it };
                            });
                            const selRes = await this.aiSelect.route(wrapped, { lastUserText: _lut, recentText: _lrt, stateSummary: '' });
                            const picked = (selRes.selected || []).map(w => w._orig || w);
                            if (picked.length) {
                                candidateItems = picked;
                                if (_cfg.debugMode) console.log(`[${PLUGIN_NAME}] AI精选: ${wrapped.length}候选→${picked.length}条 (source=${selRes.source})`);
                            }
                            // [v3.172] 读数面：把「判不了 / 映射不上 / 粗召回截断」随本轮留存。
                            //   只记 source 与候选数会让「AI 读失败」和「AI 判定了空」在账本里同形（I6）。
                            _funnel.aiSource = String(selRes.source || '');
                            _funnel.aiReadState = String((selRes.readState && selRes.readState.state) || '');
                            _funnel.aiKeys = Number(selRes.readState && selRes.readState.keys) || 0;
                            _funnel.keyUnmatched = Number(selRes.keyMap && selRes.keyMap.unmatched) || 0;
                            _funnel.aiIn = Number(selRes.candidates) || 0;
                            _funnel.aiOut = picked.length;
                        } catch (e) { errLog(e, 'onBeforeGeneration.AI精选'); }
                    }
                    // [v3.172] 粗召回读数：直接读 route() 里那一次真粗召回的 carry
                    //   （另起一次假输入调用会得到 0 条输入 —— 那正是假读数）
                    if (_cfg.aiSelectEnabled && this.aiSelect && this.aiSelect.lastCoarseRead) {
                        try {
                            const _rcCarry = this.aiSelect.lastCoarseRead;
                            _funnel.coarseDropped = Number(_rcCarry.dropped) || 0;
                            _funnel.coarseTotal = Number(_rcCarry.total) || 0;
                            _funnel.coarseNotArray = _rcCarry.inputNotArray === true;
                        } catch (e) { errLog(e, 'onBeforeGeneration.粗召回读数'); }
                    }
                    } catch (e) { errLog(e, 'onBeforeGeneration.漏斗读数采集'); }
                    // [v3.172] I6：一轮下来一条读数都没有时，也必须留下痕迹——
                    //   「本轮没计到数」与「本轮没有收缩」不能同形。
                    try {
                        const _hasAny = Object.keys(_funnel).filter(k => k !== 'round').length > 0;
                        if (!_hasAny) this._recallFunnelReadEmpty = (Number(this._recallFunnelReadEmpty) || 0) + 1;
                        else {
                            this._recallFunnel = Array.isArray(this._recallFunnel) ? this._recallFunnel : [];
                            this._recallFunnel.push({ stages: _funnel, floor: Number(query.floor ?? -1) });
                            if (this._recallFunnel.length > 500) {
                                this._recallFunnel.shift();
                                this._recallFunnelDropped = (Number(this._recallFunnelDropped) || 0) + 1;
                            }
                        }
                    } catch (e) { errLog(e, 'onBeforeGeneration.漏斗入账'); }
                } catch (e) { errLog(e, 'onBeforeGeneration.v396缝合'); }
                // [v3.109] 记录本轮实际入选条目 id（供召回产物记录「依据」；被引用记忆消失时可据此判定产物失效）
                try {
                    const _srcKinds = new Set();
                    /* [v3.275.0] O5：**不再在此处静默截断**（修前 `.slice(0, 200)`）。
                     *   截断的后果不是报错而是**读数变窄**：产物里声称「本轮入选依据就是这 200 条」，
                     *   而规模大时多出来的部分在产物里根本不存在（isArtifactStale 的 missing/ratio
                     *   也只在那 200 条上算）—— 长线里这条读数会静默缩水。
                     *   现在保留真清单，把容量上界与截断自述交给 recall-artifact.js 一处决定
                     *   （同一事实只许一个真源），总数一并交出去，不在这里算。 */
                    this._lastSelectedIds = Array.from(new Set((candidateItems || [])
                        .map((it, i) => {
                            const sk = String(it?.source || 'other').split('+')[0];
                            if (sk) _srcKinds.add(sk);
                            return String(it?.id ?? it?.key ?? ('idx_' + i));
                        })
                        .filter(Boolean)));
                    this._lastCandidateCount = (candidateItems || []).length;
                    this._lastSourceKinds = Array.from(_srcKinds).sort();
                } catch (e) { errLog(e, 'onBeforeGeneration.入选id记录'); }
                /* [v3.351.0 · M5-O9] 旧事重现从准入返回值接到实际生成：
                     *   把 returnGateAdmit 的 admitted 条目作为候选注入材料。
                     *   移交不算已用：实际进入生成载荷后才调 returnGateMark('used', ...) 落冷却。
                     *   策略为 hint-only 时不注入（只给提示，不进生成材料）。 */
                    try {
                        const _rgAdm = this.returnGateAdmit({});
                        if (_rgAdm && _rgAdm.ok && _rgAdm.injectable && Array.isArray(_rgAdm.admitted)) {
                            for (const item of _rgAdm.admitted) {
                                candidateItems.push({
                                    source: 'return-gate',
                                    text: String(item?.title || item?.detail || item?.content || ''),
                                    id: String(item?.detailKey || item?.entryKey || item?.id || ''),
                                    _returnGateAdmit: true,
                                });
                            }
                        }
                    } catch (e) { errLog(e, 'onBeforeGeneration.returnGateAdmit'); }
                    let inj2 = this.buildInjection(candidateItems);
                if (_diaryChangeFloor != null) this._diaryInjectFloor = _diaryChangeFloor;
                if (_timelineChangeFloor != null) this._timelineInjectFloor = _timelineChangeFloor;
                const prequelInj = this.buildPrequelInjection(query);   // [v3.87] 前情资料注入（Prequel，吸收 MyriadKnots recall-prequel）
                if (prequelInj) inj2 = inj2 ? (inj2 + '\n' + prequelInj) : prequelInj;
                // [v3.215.0] R2-A 注入读数唯一构造点：**无条件**落地（含 0 块的一轮）。
                //   修前这里是 `if (inj2) this._lastInjection = {...}`：本轮 0 块时读数停在
                //   上一轮 ——「这轮什么都没注入」与「这轮还没跑」同形，两者处置相反。
                //   现在轮次照常推进、块数如实归零，并且**逐块读数**一并落地
                //   （谁进了 / 谁被裁 / 各多少字符）——这是下游唯一能回答
                //   「AI 这一轮到底看到了什么」的地方。
                // [v3.216.0] R2-B 迟到隔离：本处只**暂存**，不写读数。
                //   修前（R2-A 当时）这里是**无条件**落地 `_injectionRecord`，而本函数是在
                //   `GENERATION_STARTED` 处理器的 `await` **内部**跑的；代际守卫
                //   `myGen !== this._genSeq` 却在 await **之后**才判定。于是快速连发两次生成时，
                //   先发那一轮在 await 期间已经把读数写进去了；守卫随后只拦住了注入槽位
                //   （writeInjectSlot），拦不住它早已写脏的读数 —— 面板上「最近一次实际注入」
                //   于是可能是**一次从未生效的注入**，而正好旁边那行写槽位的结果
                //   说明它没生效 —— 两行读数互相矛盾。
                //   现在载荷落在 `_injectionPending`，由处理器在守卫**之后**调
                //   `_injectionCommit(myGen)` 落成读数 —— 记录发生在 await 之后是**结构性**保证。
                //   轮次不在这里推进：被丢弃的那一代不占号，于是「第 N 轮」
                //   恒等于「真正生效过的第 N 次注入」。
                try {
                    const _blocks = Array.isArray(this._lastInjectionDraft) ? this._lastInjectionDraft : [];
                    this._injectionStage({
                        html: inj2 || '', blocks: _blocks,
                        total: _blocks.length, kept: _blocks.filter(b => b && b.kept).length,
                        gen: Number(this._genSeq) || 0,
                    });
                } catch (e) { errLog(e, 'onBeforeGeneration.注入暂存'); }
                try { if (this.config.config.bridgeEnabled !== false) window.lonsha_memory_bridge_v1?.refresh?.(); } catch (e) { errLog(e, 'nonfatal') }   // [v3.88] 快照桥随生成刷新
                // [v3.27] 命中轨迹记录（MemoryPilot monitor）+ 触发词按需注入（AnchorNote anchorOnDemand）
                try {
                    if (this.config.config.trailMonitor) {
                        const srcMap = {};
                        for (const r of (recalled || [])) { const s = String(r?.source || 'other').split('+')[0]; srcMap[s] = (srcMap[s] || 0) + 1; }
                        this._lastRecallTrace = {
                            query: String(query?.text || '').slice(0, 120),
                            sources: srcMap,
                            hitCount: (recalled || []).length,
                            durationMs: Date.now() - (this._traceStartTime || Date.now()),
                            ts: new Date().toISOString(),
                            triggerHit: false
                        };
                        // [v3.52] P12: 累计各源命中（环形窗口 200 轮防无限膨胀：超过时按比例衰减）
                        this._recallSourceStats.total++;
                        for (const [sk, sv] of Object.entries(srcMap)) {
                            const cur = this._recallSourceStats.bySource[sk] || { hits: 0, rounds: 0 };
                            cur.hits += sv;
                            this._recallSourceStats.bySource[sk] = cur;
                        }
                        for (const sk of Object.keys(this._recallSourceStats.bySource)) {
                            this._recallSourceStats.bySource[sk].rounds = this._recallSourceStats.total;
                        }
                        if (this._recallSourceStats.total > 200) {
                            const half = Math.floor(this._recallSourceStats.total / 2);
                            this._recallSourceStats.total = half;
                            for (const sk of Object.keys(this._recallSourceStats.bySource)) {
                                this._recallSourceStats.bySource[sk].hits = Math.ceil(this._recallSourceStats.bySource[sk].hits / 2);
                                this._recallSourceStats.bySource[sk].rounds = half;
                            }
                        }
                    }
                    // 触发词按需注入: 用户最近消息含触发词时，追加对应长指令到注入尾部（省 token——平时不发）
                    const triggerPhrase = this.config.config.onDemandTriggerPhrase;
                    if (triggerPhrase) {
                        const users = window.SillyTavern?.getContext?.()?.chat?.filter(m => m.is_user) || [];
                        const lastUser = users.length ? String(users[users.length - 1]?.mes || '') : '';
                        const worldNote = this.worldProg?.toInjection?.() || [];
                        const noteText = worldNote.map(w => w.text || w.content || '').filter(Boolean).slice(0, 5).join('\n');
                        if (lastUser.includes(triggerPhrase) && noteText) {
                            inj2 += '\n\n〔场外世界推进·按需指令已触发〕' + noteText;
                            if (this._lastRecallTrace) this._lastRecallTrace.triggerHit = true;
                        }
                    }
                } catch (e) { errLog(e, 'onBeforeGeneration.轨迹/触发词'); }
                try {
                    const cc = window.SillyTavern?.getContext?.()?.chat || [];
                    const _cm = cc[cc.length - 1];
                    this._recallCache = {floor: cc.length - 1, queryKey: String(query.text || '').slice(0, 200), injection: inj2, fp: (this.config.config.swipeFingerprintGuard !== false && _cm) ? msgFpOf(_cm) : ''};   // [v3.89] + 三元组定位符的消息指纹位（写入/命中路径同受开关门控，保证关闭时指纹恒空串、行为退回 v2.9）
                    /* [v3.254.0] M-O4：写入**身份位**（会话/代际/修订/历史四元组）。
                       与命中路径同一判据来源（`_cacheIdentityOf`），故两者不可能各写一套；
                       取不到当下身份时如实写 null —— 命中侧按 `no-id` **放行**（旧格式是历史事实），
                       而不是当成「已失效」（那会把刚写进去的缓存立刻作废，等于关掉缓存）。 */
                    try { this._recallCache.identity = this._cacheIdentityOf() || null; } catch (e) { errLog(e, 'onBeforeGeneration.缓存身份'); }
                    // [v3.109] 同时落一条召回产物（含历史指纹），供跨会话复用与「上游变更后拒绝复用」判定
                    if (this.config.config.recallArtifactEnabled === true) {
                        try {
                            const aa = (typeof window !== 'undefined' ? window.LonShaRecallArtifact : null)
                                || (typeof require !== 'undefined' ? (() => { try { return require('./recall-artifact.js'); } catch { return null; } })() : null);
                            if (aa) {
                                const histFp = this._historyFingerprint ? this._historyFingerprint() : '';
                                const plan = aa.planCommitArtifact(this._recallArtifacts, {
                                    turnId: 'turn_' + (cc.length - 1),
                                    artifactKind: 'recall',
                                    floor: cc.length - 1,
                                    userMessage: String(query.text || ''),
                                    recentMessages: [hash32(String(query.recentText || ''))],
                                    historyFingerprint: histFp,
                                    stateFingerprint: String(msgFpOf(_cm) || ''),
                                    injectionText: inj2,
                                    selectedMemoryIds: (Array.isArray(this._lastSelectedIds)) ? this._lastSelectedIds : [],
                                    // 真总数（含被模块按上界裁掉的部分）：产物据此自述「依据清单是否被截」。
                                    selectedMemoryIdsTotal: (Array.isArray(this._lastSelectedIds)) ? this._lastSelectedIds.length : null,
                                    sourceKinds: (Array.isArray(this._lastSourceKinds)) ? this._lastSourceKinds : [],
                                    candidateCount: Number(this._lastCandidateCount || 0),
                                    source: 'onBeforeGeneration',
                                });
                                this._recallArtifacts = plan.store;
                                // [v3.173] 缝合模块接线面：turn-reconciler.js 缝入后 68 个版本无人调用
                                //   （v3.163 账本「已挂载但零消费」）。本处原先用 'turn_' + 楼层当轮次身份，
                                //   位置一变（删楼/插楼/回填）身份就漂 —— 产物库因此会把「同一轮」认成新的。
                                //   本版**只做对账读数**：让模块按五个匹配键把「库里既有的产物」与
                                //   「当前这一轮」对一遍，把「靠哪一级配上的 / 一个都没配上」落台账。
                                //   写库用的 turnId 一字不动（改身份会作废既有产物，属行为变更）。
                                try {
                                    const _tr = _moduleLib(() => window.LonShaTurnReconciler, 'turn-reconciler.js');
                                    if (_tr && typeof _tr.assignTurnIds === 'function') {
                                        const _cur = [{
                                            userText: String(query.text || ''),
                                            assistantText: String(inj2 || ''),
                                            userFloor: cc.length - 1,
                                            assistantFloor: cc.length - 1,
                                        }];
                                        const _ex = (this._recallArtifacts || []).map(a => ({
                                            id: String(a && a.turnId || ''),
                                            turnId: String(a && a.turnId || ''),
                                            contentHash: String(a && a.contentHash || ''),
                                            normalizedUserText: String(a && a.content && a.content.normalizedUser || ''),
                                        })).filter(a => a.id);
                                        const _c2 = {};
                                        const _res = _tr.assignTurnIds(_cur, _ex, { chatId: String(this._loadedChatId || '') }, _c2);
                                        const _r2 = _c2.turnMatch || {};
                                        this._artifactTurnReconcile = {
                                            existing: _ex.length, unmatched: _r2.unmatched || 0,
                                            claimed: _r2.claimed || 0, byMatchKey: _r2.byMatchKey || {},
                                            writtenTurnId: 'turn_' + (cc.length - 1),
                                            reconciledId: (_res.assigned && _res.assigned[0] && _res.assigned[0].turnId) || '',
                                        };
                                    }
                                } catch (e) { errLog(e, 'V3173.turnReconciler'); }
                                const pruned = aa.pruneArtifacts(this._recallArtifacts, { maxEntries: 32 });
                                this._recallArtifacts = pruned.store;
                                // [v3.156] 淘汰可观测。pruneArtifacts 一直返回 removedByAge/removedByCap，
                                //   调用方却直接丢弃——产物被静默删除，诊断面板只看到「条数变少了」
                                //   却无法区分「老化过期」与「超容量裁剪」，长期运行后无法解释召回命中率下降。
                                const _rmAge = Number(pruned.removedByAge) || 0;
                                const _rmCap = Number(pruned.removedByCap) || 0;
                                this._recallArtifactEvictions = {
                                    byAge: Number(this._recallArtifactEvictions?.byAge || 0) + _rmAge,
                                    byCap: Number(this._recallArtifactEvictions?.byCap || 0) + _rmCap,
                                    lastFloor: cc.length - 1,
                                    lastRemoved: _rmAge + _rmCap,
                                    lastAt: Date.now(),
                                };
                            }
                        } catch (e) { errLog(e, 'onBeforeGeneration.召回产物落盘'); }
                    }
                } catch (e) { errLog(e, 'cleanMessageText'); }
                return inj2;
            } catch (err) {
                return '';
            }
        }
        // [v2.4] RE: 是否值得跑召回——最近5楼就在全部对话里(无更早历史)则没有可召回的旧事
        // [v2.8] RT-C: 物品台账重建（ops 真源重放——事件溯源范式，与 status/scene 一致）
        /** [v3.154] 台账写入校验违规记录（环形账本，供诊断面板与调试日志可观测）
         *  @param {Array} violations validateLedgerItemOp(s) 产出的违规项
         *  @param {string} source 'extract' | 'carryover' | ...
         *  @param {number} floor 楼层 */
        _recordLedgerViolations(violations, source, floor) {
            try {
                if (!Array.isArray(violations) || !violations.length) return 0;
                const cap = Math.max(10, Number(this.config && this.config.config && this.config.config.ledgerViolationLogMax) || 200);
                if (!Array.isArray(this._ledgerViolations)) this._ledgerViolations = [];
                const ts = Date.now();
                for (const v of violations) {
                    this._ledgerViolations.push(Object.assign({ ts: ts, source: String(source || '?'), floor: Number(floor) || 0 }, v));
                }
                if (this._ledgerViolations.length > cap) {
                    /* [v3.248.0 计划 #21] 裁剪必须**留痕**：环形账本此前只 `splice` 掉旧条目，
                     *   外部读到的 total 永远 ≤ cap —— 「被裁掉多少」这一读数不存在，
                     *   于是「面板显示 200 条」既可能是「一共就 200 条」也可能是「已经被裁了几千条」。
                     *   两个含义相反的事实塌成同形，正是本仓治理过多轮的形态。故单记一个计数。 */
                    const dropped = this._ledgerViolations.length - cap;
                    this._ledgerViolations.splice(0, dropped);
                    this._ledgerViolationsDropped = (Number(this._ledgerViolationsDropped) || 0) + dropped;
                }
                try { this.opLog?.log?.('item', 'validate', source, floor, `${violations.length} violations`); } catch (e) {}
                if (this.config && this.config.config && this.config.config.ledgerWriteValidationDebug) {
                    console.warn(`[${PLUGIN_NAME}] 台账写入校验(${source}) 第${floor}楼:`, violations.map(v => (v.kind || '?') + ':' + (v.reason || (v.reasons || []).join('+'))).join('; '));
                }
                return violations.length;
            } catch (e) { errLog(e, 'ledgerViolations.record'); return 0; }
        }
        /** [v3.248.0 计划 #21] 违规**结构化出口**：门禁与外部消费者读这一份，不再各自去翻内部数组。
         *
         * 【为什么需要（本版实测）】到 v3.247.0 为止这条链上有三处**人读**读数
         *   （`_ledgerViolations` 环形数组、`_ledgerViolationSummary()` 一行中文、debug 时的
         *   console.warn），但**没有一个机器可读出口**：诊断面板只能贴一行中文，门禁无从判定
         *   「有没有违规 / 是什么 kind」。于是「违规发生了」「没发生」「发生了但记录已被裁掉」
         *   三者对外**同形** —— 正是本仓治理过多轮的形态。
         * 【口径（与 config/silence-guard.js 同族纪律）】台账只记**计数与轮次身份**
         *   （kind / reason / source / floor / 时间窗），**不记读数内容**（不复制条目正文、
         *   不复制物品名）—— 记正文就会长出第二份真源，而它必然比原账先失真。
         * 【dropped 为什么必须存在】环形账本裁剪后 `total` 恒 ≤ cap：若不记被裁数，
         *   「正好 200 条」与「已经裁掉几千条」在外读数上完全同形。故 `_recordLedgerViolations`
         *   每次裁剪累记 `_ledgerViolationsDropped`。
         * @param {{top?:number}} [opts] top：reasons / sources / floors 各取前几名（默认 5）
         * @returns {{version:number,total:number,capped:boolean,dropped:number,cap:number,
         *   since:(number|null),until:(number|null),kinds:Array,reasons:Array,sources:Array,floors:Array}}
         */
        _ledgerViolationReport(opts) {
            const topN = Math.max(1, Number(opts && opts.top) || 5);
            const empty = { version: 1, total: 0, capped: false, dropped: 0, cap: 0, since: null, until: null, kinds: [], reasons: [], sources: [], floors: [] };
            try {
                const arr = Array.isArray(this._ledgerViolations) ? this._ledgerViolations : [];
                const cfg = this.config && this.config.config;
                const cap = Math.max(10, Number(cfg && cfg.ledgerViolationLogMax) || 200);
                empty.cap = cap;
                if (!arr.length) return empty;
                const byKind = {}, byReason = {}, bySource = {}, byFloor = {};
                let since = null, until = null;
                for (const v of arr) {
                    const k = (v && v.kind) ? String(v.kind) : 'unknown';
                    byKind[k] = (byKind[k] || 0) + 1;
                    const rs = (v && v.reason) ? [v.reason] : ((v && v.reasons) || []);
                    for (const r of rs) { if (r) byReason[r] = (byReason[r] || 0) + 1; }
                    const s = (v && v.source) ? String(v.source) : '?';
                    bySource[s] = (bySource[s] || 0) + 1;
                    const f = Number(v && v.floor);
                    if (Number.isFinite(f)) byFloor[f] = (byFloor[f] || 0) + 1;
                    const t = Number(v && v.ts);
                    if (Number.isFinite(t)) {
                        if (since === null || t < since) since = t;
                        if (until === null || t > until) until = t;
                    }
                }
                // 排序一律「计数降序 + 名字升序」：**稳定**，否则同一份账两次导出顺序不同，
                //   下游做 diff（门禁/存档）会把「顺序变了」读成「内容变了」。
                const rank = (m, keyName) => Object.keys(m)
                    .map((key) => { const row = { n: m[key] }; row[keyName] = key; return row; })
                    .sort((a, b) => (b.n - a.n) || String(a[keyName]).localeCompare(String(b[keyName]), 'en'))
                    .slice(0, topN);
                return {
                    version: 1, total: arr.length, capped: arr.length >= cap,
                    dropped: Number(this._ledgerViolationsDropped) || 0, cap: cap, since: since, until: until,
                    kinds: rank(byKind, 'kind'), reasons: rank(byReason, 'reason'), sources: rank(bySource, 'source'),
                    floors: Object.keys(byFloor)
                        .map((f) => ({ floor: Number(f), n: byFloor[f] }))
                        .sort((a, b) => (b.n - a.n) || (a.floor - b.floor)).slice(0, topN)
                };
            } catch (e) { errLog(e, 'ledgerViolations.report'); return empty; }
        }
        /** [v3.248.0] 违规汇总（Markdown，供人读 / 贴存档）。**只渲染，不另算** —— 数与 report 同源。 */
        _ledgerViolationMarkdown(opts) {
            try {
                const r = this._ledgerViolationReport(opts);
                const fmt = (rows, k) => (rows.length ? rows.map((x) => x[k] + '×' + x.n).join(' / ') : '—');
                const span = (r.since && r.until) ? new Date(r.since).toISOString() + ' ~ ' + new Date(r.until).toISOString() : '—';
                const cutNote = r.capped ? '（**已达上限 ' + r.cap + '**，历史已裁 ' + r.dropped + ' 条）' : (r.dropped ? '（历史已裁 ' + r.dropped + ' 条）' : '');
                return [
                    '### 台账写入违规（结构化导出）',
                    '- 账内 ' + r.total + ' 条' + cutNote,
                    '- kind：' + fmt(r.kinds, 'kind'),
                    '- 主因：' + fmt(r.reasons, 'reason'),
                    '- 来源：' + fmt(r.sources, 'source'),
                    '- 楼层：' + (r.floors.length ? r.floors.map((x) => '#' + x.floor + '×' + x.n).join(' / ') : '—'),
                    '- 时间窗：' + span,
                    '',
                    '> 口径：只记计数与轮次身份，不记读数内容（与 silence-guard 同族）。'
                ].join('\n');
            } catch (e) { errLog(e, 'ledgerViolations.markdown'); return ''; }
        }
        /** [v3.154] 违规聚合摘要（诊断面板一行）。
         *  [v3.248.0] 改为 **report 的派生读数**：原实现自己再遍历一遍数组，
         *   于是同一个数在「面板行」与「结构化出口」两处各算一份 —— 拆口径时必然漂移
         *   （本仓 v3.246.0 收掉过同形的一份名册）。空账仍返回 `'0'`，与消费点契约一致。 */
        _ledgerViolationSummary() {
            try {
                const r = this._ledgerViolationReport({ top: 2 });
                if (!r.total) return '0';
                const kindStr = r.kinds.map((x) => x.kind + '×' + x.n).join('/');
                const main = r.reasons.length ? ' 主因: ' + r.reasons.map((x) => x.reason + '×' + x.n).join(', ') : '';
                const cut = r.capped ? ' 已裁' + r.dropped : '';
                return r.total + ' 累计（' + kindStr + '）' + main + cut;
            } catch (e) { return '—'; }
        }
        // [v3.36] 确定性物品键名归一（抄 baibai 确定性 id 理念）：
        // 剥离包裹的书名号《》、方括号【】[]、小括号（）()、引号等，NFKC 归一化并转小写
        static normalizeItemKey(name) {
            try {
                return String(name || '')
                    .normalize('NFKC')
                    .replace(/[《》【】\[\]（）\(\)\u0022\u0027“”‘’〈〉]/g, '')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .toLowerCase();
            } catch (e) { return String(name || '').trim().toLowerCase(); }
        }
        // [v3.2] DF3: 物品 op 清洗（LLM 原文直存 ops，desc/holder 无长度上限会撑爆注入与存档）
        // [v3.36] 扩展支持 remove 动作及确定性键名归一与三态补丁解析
        _sanitizeItemOp(op) {
            try {
                if (!op || typeof op !== 'object') return null;
                const act = String(op.action || '').trim().toLowerCase();
                // 白名单只放行 add, update, remove
                const action = (act === 'add' || act === 'update' || act === 'remove') ? act : '';
                const name = String(op.name || '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 40);
                if (!action || !name) return null;
                // 内部自包含确定性归一化，无需外部变量依赖
                const key = name.replace(/[《》【】\[\]（）\(\)\u0022\u0027“”‘’〈〉]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
                if (!key) return null;
                const clean = { action, name, key, floor: Math.max(0, Math.round(Number(op.floor) || 0)) };
                if (op.desc !== undefined && op.desc !== null) clean.desc = String(op.desc).trim().slice(0, 80);
                if (op.holder !== undefined && op.holder !== null) {
                    const h = String(op.holder).trim();
                    clean.holder = (h === '' || h === '无' || h === '地上' || h === 'null') ? '地上/遗落' : h.slice(0, 20);
                } else if (op.holder === null) {
                    clean.holder = '地上/遗落';
                }
                if (op.state !== undefined && op.state !== null) clean.state = String(op.state).trim().slice(0, 10);
                // [v3.44] 吸收 baibai: 物品物理可达性与随身/存放互斥铁律
                if (op.carried !== undefined && op.carried !== null) {
                    clean.carried = (op.carried === true || op.carried === 'true' || op.carried === 1);
                }
                if (op.location !== undefined && op.location !== null) {
                    const loc = String(op.location).trim().slice(0, 40);
                    clean.location = (loc === 'null' || loc === 'none' || loc === '无') ? '' : loc;
                }
                // 互斥自愈：随身携带则清空存放地点；有具体存放地点则 carried 强制为 false
                if (clean.carried === true) {
                    clean.location = '';
                } else if (clean.location) {
                    clean.carried = false;
                }
                // [v3.352.0 · M5-X1] 借用关系字段（透传，已在 validateLedgerItemOp 校验长度）
                if (op.lendTo) clean.lendTo = String(op.lendTo).trim().slice(0, LEDGER_ITEM_LIMITS.lendTo);
                if (op.borrowFrom) clean.borrowFrom = String(op.borrowFrom).trim().slice(0, LEDGER_ITEM_LIMITS.borrowFrom);
                if (op.returnDue) clean.returnDue = String(op.returnDue).trim().slice(0, LEDGER_ITEM_LIMITS.returnDue);
                if (op.ownerRef) clean.ownerRef = String(op.ownerRef).trim().slice(0, LEDGER_ITEM_LIMITS.ownerRef);
                return clean;
            } catch (e) { errLog(e, 'DF3.sanitizeItemOp'); return null; }
        }
        rebuildItems() {
            // 编辑/swipe 自动失活、翻回复活、删楼自愈；carried（携带自旧档）/无 fp（旧数据）不过滤）
            // [v3.36] 确定性 ID 索引 + 三态补丁语义（未提供不更新、明确置空清空、有效值覆盖）+ remove 剔除
            let chat = null;
            try { const c = window.SillyTavern?.getContext?.()?.chat; chat = Array.isArray(c) ? c : null; } catch (e) { errLog(e, 'nonfatal') }
            const liveFp = chat ? new Set(chat.map(m => msgFpOf(m))) : null;
            const map = new Map();
            let skipped = 0;
            // 排除仅为状态属性的损坏，只剔除明确不在身上的丢失/丢弃/消耗项
            const REMOVE_STATES = new Set(['丢失', '损毁', '已消耗', '消耗完毕', '丢弃', '已丢弃', '遗落']);

            for (const rawOp of (this.itemOps || [])) {
                const op = this._sanitizeItemOp(rawOp);   // [v3.2] DF3: 渲染前清洗（真源不动，旧档兼容）
                if (!op) continue;
                if (chat && rawOp && rawOp.fp && rawOp.carried !== true && !liveFp.has(rawOp.fp)) { skipped++; continue; }
                const itemKey = op.key || (op.name ? op.name.replace(/[《》【】\[\]（）\(\)\u0022\u0027“”‘’〈〉]/g, '').trim().toLowerCase() : '');
                const exist = map.get(itemKey);

                if (op.action === 'remove') {
                    map.delete(itemKey);
                    continue;
                }

                if (op.action === 'add') {
                    if (!exist) {
                        const isRemoved = op.state && REMOVE_STATES.has(op.state);
                        if (!isRemoved) {
                            map.set(itemKey, {
                                name: op.name,
                                key: itemKey,
                                desc: op.desc || '',
                                holder: op.holder || '无主',
                                state: op.state || '完好',
                                floor: op.floor,
                                carried: op.carried !== undefined ? op.carried : (!op.location),
                                location: op.location || '',
                                // [v3.352.0 · M5-X1] 借用关系字段
                                lendTo: op.lendTo || '',
                                borrowFrom: op.borrowFrom || '',
                                returnDue: op.returnDue || '',
                                ownerRef: op.ownerRef || ''
                            });
                        }
                    } else {
                        // 重复 add 视为更新属性
                        if (op.desc !== undefined) exist.desc = op.desc;
                        if (op.holder !== undefined) exist.holder = op.holder;
                        if (op.state !== undefined) exist.state = op.state;
                        if (op.carried !== undefined) exist.carried = op.carried;
                        if (op.location !== undefined) exist.location = op.location;
                        if (exist.carried === true) exist.location = '';
                        else if (exist.location) exist.carried = false;
                        exist.floor = op.floor;
                        if (exist.state && REMOVE_STATES.has(exist.state)) map.delete(itemKey);
                    }
                } else if (op.action === 'update' && exist) {
                    // 三态补丁语义: undefined 保持原值，提供值则覆盖
                    if (op.desc !== undefined) exist.desc = op.desc;
                    if (op.holder !== undefined) exist.holder = op.holder;
                    if (op.state !== undefined) exist.state = op.state;
                    if (op.carried !== undefined) exist.carried = op.carried;
                    if (op.location !== undefined) exist.location = op.location;
                    if (exist.carried === true) exist.location = '';
                    else if (exist.location) exist.carried = false;
                    exist.floor = op.floor;
                    if (exist.state && REMOVE_STATES.has(exist.state)) {
                        map.delete(itemKey);
                    }
                }
            }
            // [v3.2] DF3: 派生视图硬上限（真源 itemOps 不裁剪，重放语义不受影响）
            this.items.records = Array.from(map.values()).slice(-25);
            this.items._stale = skipped;   // [v3.3] 失活计数（selfCheck 展示）
        }
        // [v3.3] 台账重放化：楼层回滚改为「全量指纹对账」（不再硬过滤——
        // 编辑楼 f 只失活 f 自己的 ops，f+1.. 楼指纹未变继续生效；删楼前移按指纹重新定位自愈）
        rollbackItemsFrom(floor) {
            return this.reconcileItemOps();
        }
        reconcileItemOps() {
            let removed = 0, healed = 0, adopted = 0;
            try {
                let chat = null;
                try { const c = window.SillyTavern?.getContext?.()?.chat; chat = Array.isArray(c) ? c : null; } catch (e) { errLog(e, 'nonfatal') }
                if (!chat) { this.rebuildItems(); return 0; }
                const byFp = new Map();   // fp → [floor...]（保序）
                chat.forEach((m, i) => { const fp = msgFpOf(m); if (!fp) return; const arr = byFp.get(fp); if (arr) arr.push(i); else byFp.set(fp, [i]); });
                const next = [];
                for (const op of (this.itemOps || [])) {
                    if (!op || typeof op !== 'object') continue;
                    if (op.carried === true) { next.push(op); continue; }   // 携带自旧档：无对应楼层，永久有效
                    if (!op.fp) {
                        // 旧档迁移：按当前楼层补采指纹；楼不存在则清理
                        const m = chat[op.floor];
                        if (m) { op.fp = msgFpOf(m); adopted++; next.push(op); } else { removed++; }
                        continue;
                    }
                    const positions = byFp.get(op.fp);
                    if (positions && positions.length) {
                        // 自愈：指纹在聊天中重新定位（删楼前移等）→ 取最接近原 floor 的位置
                        let best = positions[0];
                        for (const p of positions) { if (Math.abs(p - op.floor) < Math.abs(best - op.floor)) best = p; }
                        if (op.floor !== best) { op.floor = best; healed++; }
                        next.push(op);
                    } else if (Math.floor(Number(op.floor) || 0) >= chat.length) {
                        removed++;   // 楼整体不存在且指纹全局无匹配 → 清理
                    } else {
                        next.push(op);   // 楼在但文本已变（编辑/swipe）→ 保留失活（可能翻回复活）
                    }
                }
                this.itemOps = next;
                this.rebuildItems();
            } catch (e) { errLog(e, 'V33.reconcileItemOps'); }
            if ((removed || healed || adopted) && this.config?.config?.debugMode) console.log(`[${PLUGIN_NAME}] 台账对账: 清理 ${removed} / 自愈 ${healed} / 补采 ${adopted}`);
            return removed;
        }
        // [v3.3] 当前有效 ops 列表（打包/导出用）：carried 或指纹匹配当前聊天；无 fp 旧档保留（下游标 carried 兜底）
        activeItemOps() {
            let chat = null;
            try { const c = window.SillyTavern?.getContext?.()?.chat; chat = Array.isArray(c) ? c : null; } catch (e) { errLog(e, 'nonfatal') }
            if (!chat) return [...(this.itemOps || [])];
            const liveFp = new Set(chat.map(m => msgFpOf(m)));
            return (this.itemOps || []).filter(o => {
                if (!o || typeof o !== 'object') return false;
                if (o.carried === true) return true;
                if (!o.fp) return true;
                return liveFp.has(o.fp);
            });
        }

        // [v3.5] 补提取：扫出「AI 楼且无摘要」的缺口（插件禁用期/提取失败/中途安装的场景）
        // 判定：非 user、非系统、非番外楼、正文非空、且 summaries 无该楼层记录
        scanMissingFloors() {
            const missing = [];
            try {
                const chat = window.SillyTavern?.getContext?.()?.chat;
                if (!Array.isArray(chat)) return missing;
                const covered = new Set((this.summary?.summaries || []).map(s => s.floor));
                // [v3.19] 增量书签裁剪（ruby）: 从书签处开始扫描（省全量扫描）
                const fromFloor = (this.bookmarks && this.bookmarks.get('scan')) || 0;
                // 番外楼（lonsha_omit）与空楼跳过；user 楼不提取（提取管线只处理 AI 楼）
                for (let i = Math.max(fromFloor, 0); i < chat.length; i++) {
                    const m = chat[i];
                    if (!m || m.is_user) continue;
                    if (m.is_system === true) continue;
                    if (this.isOmittedFloor(m)) continue;
                    const text = String(m.mes || '').trim();
                    if (!text) continue;
                    if (covered.has(i)) continue;
                    missing.push(i);
                }
            } catch (e) { errLog(e, 'BF.scanMissingFloors'); }
            return missing;
        }
        // [v3.145] CP-L6: 租约有效性统一判据（stbme Restore Lock + session lease 合流）。
        // v3.141 只校验 chatId，挡不住「同一聊天内的结构性变更」：回滚/恢复/清空期间
        // chatId 未变，在飞提取会基于已删除的楼层写回数据并随自存落盘。现以变更栅栏号
        // _mutationEpoch 补齐第二类失效；四处异步路径统一走本方法，避免判据漂移。
        _leaseValid(lease) {
            if (this.config.config.sessionLeaseGuardEnabled === false) return true;   // 总开关关闭→退回 v3.140 前的宽松行为（可回退）
            if (!lease) return true;
            const now = this.getCurrentChatId();
            if (lease.chatId && now && now !== lease.chatId) { lease.reason = 'chat-switch'; lease.to = String(now); return false; }
            if (lease.epoch != null && lease.epoch !== this._mutationEpoch) { lease.reason = 'mutation'; lease.to = `${this._mutationEpoch}@${now}`; return false; }
            return true;
        }
        _leaseDrop(lease, task, floor) {
            this._staleTaskDropped++;
            this._lastStaleDrop = { from: lease.chatId || '?', to: lease.to || String(this.getCurrentChatId()), floor: floor ?? -1, at: Date.now(), task, reason: lease.reason || 'unknown' };
            if (lease.reason === 'mutation') this._epochDropped++;
            console.warn(`[${PLUGIN_NAME}] ⚠ 任务作废（${task}，原因 ${lease.reason}，栅栏 ${lease.epoch}→${this._mutationEpoch}）：状态已变更，产物丢弃`);
        }
        // [v3.145] CP-L6: 变更栅栏自增——结构性变更（回滚/恢复）使此刻在飞的异步提取/补提取
        // 全部作废（它们的产物基于变更前状态，写回即污染）。同步执行故原子：JS 单线程，
        // bump 后到 await 让出前不会有其它任务插入。reason 记入可见性字段供面板追溯。
        _bumpEpoch(reason) {
            this._mutationEpoch = (this._mutationEpoch || 0) + 1;
            this._lastEpochBump = { epoch: this._mutationEpoch, reason: String(reason || 'manual'), at: Date.now() };
            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 变更栅栏推进 → ${this._mutationEpoch}（${reason}）`);
        }
        // [v3.5] 补提取指定楼层（复跑提取管线——复用 onMessageReceived 的提取段，但跳过摘要回滚等）
        // 上限保护：单次最多 30 楼（防一次扫全车）；带互斥锁防与实时提取并发
        async backfillFloors(floors, onProgress) {
            const done = { ok: 0, fail: 0, skipped: 0 };
            // [v3.141] CP-L4: 租约身份声明在函数体顶层——保存点在 try 块之外，声明进内层会成未定义变量
            let _bfCred = null;   // [v3.145] CP-L6: 锁所有权凭证（函数体顶层：finally 在 try 外）
            const _bfLease = { chatId: this.getCurrentChatId(), epoch: this._mutationEpoch };   // [v3.145] CP-L6: 并入变更栅栏
            const _bfLease0 = _bfLease.chatId;   // [v3.141] 会话租约身份（保存目标沿用捕获值，事后求值会串档）
            let _bfStale0 = false;
            try {
                const acquired = await this.mutex.acquire('backfill');   // [v3.145] CP-L6: 申请所有权
                if (acquired) _bfCred = acquired;            // [v3.145] 记录凭证供 finally 释放
                if (!acquired) { console.warn(`[${PLUGIN_NAME}] 补提取排队超时（实时提取进行中）`); return done; }
                // [v3.141] CP-L4: 补提取是逐楼 await 的长任务，会话租约在开始处捕获（每楼 await 后校验）。
                try {
                    const chat = window.SillyTavern?.getContext?.()?.chat || [];
                    const list = (Array.isArray(floors) ? floors : []).slice(0, 30);
                    for (const idx of list) {
                        const m = chat[idx];
                        if (!m || !String(m.mes || '').trim()) { done.skipped++; continue; }
                        // [v3.80] A: 番外楼防护（防御纵深——scanMissingFloors 已排除，这里防直接调用路径）
                        if (this.isOmittedFloor(m)) { done.skipped++; continue; }
                        try {
                            // 复用主管线消息对象构造（与 onMessageReceived 相同语义）
                            const msg = { ...m, index: idx };
                            msg.mes = this.cleanMessageText(msg.mes || '');
                            if (!msg.mes) { done.skipped++; continue; }
                            const extracted = await this.extractMemoryWithLLM(msg);
                            // [v3.141] CP-L4: 租约失效（用户已切换聊天）则中止整轮，且不得落盘——
                            // 此刻内存运行时属于新聊天，collectExport 会把新聊天的内容写进旧存档。
                            if (!this._leaseValid(_bfLease)) {
                                _bfStale0 = true;
                                this._leaseDrop(_bfLease, 'backfill', idx);   // [v3.145] CP-L6: 统一 drop 诊断（合并冗余计数/日志）
                                break;
                            }
                            // 只补「图谱节点/关系 + 摘要」核心两类（保召回可用）；细粒度子系统（状态/悬念/物品）交后续实时楼带动
                            // 去重纪律：addNode 不去重（每次新 id）——补提取对角色节点先查后建，防历史重灌放大重复
                            if (extracted?.characters) {
                                for (const char of extracted.characters) {
                                    // [v3.91] 审计修复：原空 catch 静默吞噬——LLM 抽取数据不可信，角色节点写入图谱
                                    //         失败将无人知情（违反故障可见性）。改记入 errLog 错误缓冲（面板可诊断）。
                                    try {
                                        const canonical = this.resolveCharacterName(char);
                                        const exist = this.graph.findByNames([canonical]).some(n => n.type === 'character');
                                        if (!exist) this.graph.addNode({type: 'character', name: canonical, data: this._scopeData({source: msg.mes})});
                                    } catch (e) { errLog(e, 'graph.角色节点写入'); }
                                }
                            }
                            if (extracted?.events) {
                                for (const event of extracted.events) {
                                    // [v3.91] 审计修复：空 catch → errLog（故障可见性，事件节点/参与边写入失败可诊断）
                                    try {
                                        const nodeId = this.graph.addNode({type: 'event', name: event.type, data: {...event, backfillFloor: idx}});
                                        for (const p of (event.participants || [])) {
                                            try { this.graph.addEdge({from: p, to: nodeId, label: 'participated_in'}); } catch (e) { errLog(e, 'graph.参与边写入'); }
                                        }
                                    } catch (e) { errLog(e, 'graph.事件节点写入'); }
                                }
                            }
                            if (extracted?.relationships) {
                                for (const rel of extracted.relationships) {
                                    try {
                                        this.graph.addEdge({from: this.resolveCharacterName(rel.from), to: this.resolveCharacterName(rel.to), label: rel.type, weight: 1.0, data: {attitude: rel.attitude || 'neutral', note: rel.note || ''}});
                                    } catch (e) { errLog(e, 'graph.关系边写入'); }
                                }
                            }
                            if (extracted?.summary) await this.summary.createSummary(msg, extracted.summary);
                            // [v3.80] B: 主角档案/生活小档案（与 v3.78 主提取管线对齐——补提取同样产出）
                            try {
                                if (this.config.config.protagonistTracking !== false && extracted) {
                                    if (extracted.protagonist && typeof extracted.protagonist === 'object') {
                                        const keys = ['gender', 'age', 'identity', 'appearance', 'outfit', 'condition'];
                                        const hasAny = keys.some(k => extracted.protagonist[k] !== undefined && extracted.protagonist[k] !== null && String(extracted.protagonist[k]).trim() !== '') || (extracted.protagonist.conditionPatch != null);
                                        if (hasAny) this.status.setProtagonist(extracted.protagonist, idx, this.clock?.date || this.getLatestStoryDate?.() || '');
                                    }
                                    if (Array.isArray(extracted.life_details) && extracted.life_details.length) {
                                        for (const ld of extracted.life_details.slice(0, 5)) {
                                            if (ld && (typeof ld === 'string' || ld.text)) { try { this.status.addLifeDetail(ld, idx); } catch (e) { errLog(e, 'nonfatal') } }
                                        }
                                    }
                                }
                            } catch (e) { errLog(e, 'BF.backfill.主角档案'); }
                            done.ok++;
                            if (typeof onProgress === 'function') { try { onProgress(idx, done); } catch (e) { errLog(e, 'nonfatal') } }
                        } catch (e) { errLog(e, `BF.backfill.floor${idx}`); done.fail++; }
                    }
                } finally {
                    if (this.config.config.extractionLockEnabled) this.mutex.release(_bfCred);   // [v3.145] CP-L6: 带凭证释放，晚到的 finally 不得放开新持有者的锁
                }
            } catch (e) { errLog(e, 'BF.backfillFloors'); }
                    // [v3.19] 补提取完成后推进书签
                    try { if (this.bookmarks && floors?.length) this.bookmarks.save('scan', Math.max(...floors) + 1); } catch (e) { errLog(e, 'nonfatal') }
            if (_bfStale0) { done.skipped += 1; }   // [v3.141] 中止计数可见
            if ((done.ok || done.fail) && !_bfStale0) {
                // [v3.141] CP: 保存目标用租约捕获的 chatId（原事后求值 getCurrentChatId 会把旧任务结果写进当前聊天）
                try {
                    this.recordSaveSource('backfill');
                    // [v3.166] 结果驱动（原先无论 save 成败都记一次「backfill 保存过」）
                    const _ok = await this.storage.save(_bfLease0 || this.getCurrentChatId(), this.collectExport());
                    this.recordSaveFailed('backfill', _ok === true, this.storage?._lastWrite?.error || '未落盘');
                } catch (e) { errLog(e, 'BF.backfill.save'); }
            }
            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 补提取完成: ${done.ok}成/${done.fail}败/${done.skipped}跳`);
            return done;
        }

        // [v3.47] 睡眠周期·归档式遗忘（stbme sleepCycle 吸收）：每 N 次提取触发一次"睡眠"，
        // 保留价值低于阈值的记忆归档（不物理删除，滚入冷存档 archivedMemories），需要时可唤醒。
        // 修复 stbme 已知 bug：accessCount 未初始化时 NaN 参与比较导致永不遗忘（NaN < threshold 为 false）——此处显式 Number() 兜底。
        sleepCycle() {
            const cfg = this.config.config;
            if (cfg.sleepCycleEnabled === false) return { archived: 0 };
            const now = Date.now();
            const threshold = Number(cfg.sleepForgetThreshold) || 0.5;
            let archived = 0;
            try {
                // 对摘要系统执行睡眠：活跃摘要中低保留价值条目归档
                const sums = this.summary.summaries || [];
                for (const s of sums) {
                    if (!s || s.archivedForSleep) continue;
                    if (s.importance >= 8) continue;  // 高重要度豁免
                    const created = Number(s.createdAt || s.timestamp || 0);
                    if (!created || (now - created) < 3600 * 1000) continue;  // 创建不足1小时豁免
                    const ageHours = Math.max(0.1, (now - created) / 3600000);
                    const recency = 1 / (1 + Math.log10(1 + ageHours));
                    const access = Number(s.accessCount);  // 修 NaN：undefined → NaN → || 0
                    const accessCount = Number.isFinite(access) ? access : 0;
                    const accessFreq = accessCount / Math.max(1, ageHours / 24);
                    const imp = Number(s.importance);
                    const importance = Number.isFinite(imp) ? imp : 5;
                    const retentionValue = (importance / 10) * recency * (1 + accessFreq);
                    if (retentionValue < threshold) {
                        s.archivedForSleep = true;
                        s.archivedAt = now;
                        archived++;
                    }
                }
                if (archived && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 😴 睡眠周期: 归档 ${archived} 条低价值记忆`);
                // [v3.168] 睡眠校准臂（清点非破坏）：睡眠周期只**标记** archivedForSleep，
                //   从不回收。长线运行下「已睡但仍在库」的条目会持续积压，而旧实现无任何
                //   出口看得出积压程度（它们仍参与召回遍历，只是被过滤）。校准器只统计不删除。
                try { this.calibrateRetention(); } catch (e) { errLog(e, 'sleepCycle.calibrate'); }
            } catch (e) { errLog(e, 'sleepCycle'); }
            return { archived };
        }
        /** [v3.168] 睡眠校准器（纯清点）。返回 {dormant, ancientHighValue, lowValueStale, total}。
         *  - dormant：已标记睡眠、仍留在库的条目（遗忘积压量）
         *  - ancientHighValue：超 30 天且重要度>=8（
         *    不该被任何上限误杀的历史锚点）
         *  - lowValueStale：超 30 天且重要度<4（下次硬上限回收的首选）
         *  只读不写：不碰 archivedForSleep，也不删任何条目。 */
        calibrateRetention(maxScan = 2000) {
            const _zero = { dormant: 0, ancientHighValue: 0, lowValueStale: 0, total: 0 };
            try {
                const now = Date.now();
                const cap = Math.max(100, Math.min(10000, Number(maxScan) || 2000));
                const out = { dormant: 0, ancientHighValue: 0, lowValueStale: 0, total: 0 };
                const sums = (this.summary?.summaries || []).slice(0, cap);
                for (const s of sums) {
                    out.total++;
                    if (s?.archivedForSleep) out.dormant++;
                    const created = Number(s?.createdAt || s?.timestamp || 0);
                    if (!created) continue;
                    const ageDays = (now - created) / 86400000;
                    const imp = Number(s?.importance);
                    const importance = Number.isFinite(imp) ? imp : 5;
                    if (ageDays > 30 && importance >= 8) out.ancientHighValue++;
                    else if (ageDays > 30 && importance < 4) out.lowValueStale++;
                }
                this._lastRetentionCalibration = Object.assign({ at: now }, out);
                return out;
            } catch (e) { errLog(e, 'calibrateRetention'); return _zero; }
        }

        // [v3.106] 维护流水线（engram WorkflowEngine 缝合）：把「归档休眠 → 优化去重 → 分诊收尾」
        //   编排为一次可诊断的多步流水线，借助 step-pipeline 的重试/跳转控制流表达两件既有
        //   retryQueue 表达不了的诉求：
        //   ① 任一步骤失败可单独重试（而非整条维护弃跑，等下个 50 楼周期）；
        //   ② 长期未维护（距上次优化超 maintenanceOverdueWarnDays 天）时，跳回优化步骤补做一次
        //      ——「回退补做」正是 jump 控制流的用途。
        //   结果返回结构化账本（executed / attempts / jumps），出问题能定位到「哪一步、第几次、跳了几次」。
        //   降级：缺 window.LonShaStepPipeline 与 require 通道时返回 null（不影响主链路）。
        async _maintenancePipeline(stepPipeline) {
            const SP = stepPipeline || (typeof window !== 'undefined' ? window.LonShaStepPipeline : null)
                || (typeof require !== 'undefined' ? (() => { try { return require('./step-pipeline.js'); } catch { return null; } })() : null);
            if (!SP || typeof SP.definePipeline !== 'function' || typeof SP.run !== 'function') return null;
            const cfg = this.config.config;
            const warnDays = Number(cfg.maintenanceOverdueWarnDays) || 45;
            const eng = this;
            const state = { archived: 0, optimizeRuns: 0, overdue: false, rework: 0 };
            const staleMs = Date.now() - Number(this._lastOptimizeAt || 0);
            state.overdue = warnDays > 0 && staleMs > warnDays * 86400000;

            const pipeline = SP.definePipeline('memory-maintenance', [
                {
                    name: 'sleep-archive',
                    retry: { maxAttempts: 2, delay: 0 },   // 归档抛错重试一次；再失败则中止本轮（不吞）
                    run: async () => { state.archived = (eng.sleepCycle() || {}).archived || 0; },
                },
                {
                    name: 'optimize',
                    retry: { maxAttempts: 2, delay: 0 },
                    run: async () => {
                        eng.optimizeMemory();
                        state.optimizeRuns += 1;
                        // 超期未维护：仅补做一次（防止 jump 自旋，保险丝之外再上一道业务闸门）
                        if (state.overdue && state.rework < 1) {
                            state.rework += 1;
                            return { action: 'jump', targetStep: 'optimize', reason: 'overdue-maintenance-rework' };
                        }
                        return undefined;
                    },
                },
                {
                    name: 'graph-rollup',
                    ignoreFailure: true,   // 图维护是增强步骤：失败不阻断记忆落笔与归档
                    run: async () => {
                        // [v3.184] 语义汇总（Node Rollup，Luker compactNodes）：
                        //   此前 MemoryGraph.vacuum() 全库**零调用点**——写了压缩、没人跑，
                        //   长线对话下图谱节点只增不减。本步骤把「先汇总、再压缩」接进既有维护管线
                        //   （不新造周期旋钮，复用 optimizeEveryFloors 的节奏），并把读数留痕供诊断面读。
                        try {
                            if (cfg.graphRollupEnabled !== false && eng.graph && typeof eng.graph.maintainGraph === 'function') {
                                const minChildren = Math.max(2, Number(cfg.graphRollupMinChildren) || 4);
                                const r = eng.graph.maintainGraph({ minChildren, types: ['event'] });
                                eng._graphRollupRead = {
                                    created: r?.rollup?.created || 0,
                                    skipped: r?.rollup?.skipped || 0,
                                    prunedEdges: r?.vacuum?.prunedEdges || 0,
                                    prunedNodes: r?.vacuum?.prunedNodes || 0,
                                    nodes: eng.graph.nodes.size,
                                    at: Date.now(),
                                };
                                if ((r?.rollup?.created || r?.vacuum?.prunedNodes) && cfg.debugMode) {
                                    console.log(`[${PLUGIN_NAME}] 图维护: 汇总 ${r.rollup.created} 层 · 回收 ${r.vacuum.prunedNodes} 孤儿节点`);
                                }
                            }
                        } catch (e) { errLog(e, 'maintenance.graphRollup'); }
                    },
                },
                {
                    name: 'cadence-triage',
                    ignoreFailure: true,   // 可选增强步骤：分诊失败不应阻断整条维护
                    run: async () => {
                        const every = Number(cfg.optimizeEveryFloors) || 50;
                        // [v3.173] 缝合模块接线面：extraction-cadence.js 缝入后 68 个版本无人调用
                        //   （v3.163 账本「已挂载但零消费」）。本插件有六个各自独立的「每 N 楼」
                        //   周期旋钮（世界推进/日记/反思/睡眠/快照/优化），此前没有任何地方能回答
                        //   「这一轮到底谁该跑」；更要紧的是旋钮填 0/负数时各自静默回落，无人记账。
                        //   本处只算节奏、只记读数，不改变任何子系统自己的触发判据。
                        try {
                            const _ec = _moduleLib(() => window.LonShaExtractionCadence, 'extraction-cadence.js');
                            if (_ec && typeof _ec.computeActiveTypes === 'function') {
                                const _schema = [
                                    { id: 'world-progress', extractEveryN: cfg.worldProgressEveryFloors },
                                    { id: 'diary', extractEveryN: cfg.diaryEveryFloors },
                                    { id: 'reflect', extractEveryN: cfg.reflectEveryFloors },
                                    { id: 'sleep', extractEveryN: cfg.sleepEveryN },
                                    { id: 'snapshot', extractEveryN: cfg.snapshotEveryFloors },
                                    { id: 'optimize', extractEveryN: cfg.optimizeEveryFloors },
                                ];
                                const _chat2 = window.SillyTavern?.getContext?.()?.chat || [];
                                const _seq = Math.max(0, _chat2.filter(m => m && !m.is_user).length);
                                const _c1 = {};
                                const _active = _ec.computeActiveTypes(_schema, _seq, _c1);
                                const _r1 = _c1.cadence || {};
                                eng._cadenceTriage = {
                                    seq: _seq, active: [..._active].sort(),
                                    tuned: _r1.accepted || 0, inactive: _r1.inactive || 0,
                                    normalizedFallback: _r1.normalizedFallback || [],
                                    skippedNoId: _r1.skippedNoId || [], every,
                                };
                            }
                        } catch (e) { eng._cadenceTriage = null; }
                        eng._lastMaintenanceSummary = {
                            archived: state.archived,
                            optimizeRuns: state.optimizeRuns,
                            overdue: state.overdue,
                            every,
                            at: Date.now(),
                        };
                        return { action: 'finish' };   // 分诊即收尾：提前成功结束
                    },
                },
            ]);

            const ledger = await SP.run(pipeline, { chatId: this.getCurrentChatId?.() || null }, {});
            ledger.rework = state.rework;
            return ledger;
        }

        /* [v3.329.0 · M4-O1] 回收范围键(**向量与图谱共用这一份口径**)。
         *   为什么需要:回收的两条去重路此前只看「正文 / 名字」—— 同一句正文发生在两个
         *   事件、同一个名字出现在两个宇宙时,后台优化会把它们当重复**永久删掉**。
         *   计划裁定「缺 ID 的旧档保留,不能因为没法确定就合并」,故这里分两截:
         *     · **基线**:会话 id(图与向量库都是**会话级容器** ⇒ 换会话必须换键)。
         *       取不到会话 id 时用字面 `(no-chat)`(那是真实状态「还没进会话」,
         *       **不是编造的宇宙**)⇒ 同键合并照旧,不会让优化静默停摆。
         *     · **细界**:条目自带的 universe / projectId。带上了才拼进键 ——
         *       于是「跨宇宙同名」在键上就分开了,而没带线索的旧档仍按会话归组。
         *   为什么基线取会话:实例本身是会话级的(`getCurrentChatId()` 派生),
         *   两次优化之间换会话只会换出不同的键 —— 跨宇宙误合并**在结构上不可能发生**;
         *   而细界一旦由 project-registry 接上,同一会话内的多宇宙也分得开。
         *   为什么**不含** floor:图谱角色节点不带楼层(`addNode` 只补 `id`/`timestamp`),
         *   拿不到就得回退按名合 —— 那正好是原缺陷。向量的楼层由**调用方**选择性传入
         *   (跨楼同文不是重复;同楼重复提取仍要能去重)。
         */
        _gcScopeKey(meta) {
            const m = (meta && typeof meta === 'object') ? meta : null;
            /* 线索可能落在四层(条目本体 / 向量 `metadata` / 显式 `scope` / 图节点 `data`):
             *   向量条目把业务字段存在 `metadata` 里、图节点存在 `data` 里 —— 只查本体
             *   等于两路都取不到细界(而收货的是同一条键,口径必须一致)。 */
            const boxes = [];
            if (m) boxes.push(m);
            if (m && m.metadata && typeof m.metadata === 'object') boxes.push(m.metadata);
            if (m && m.scope && typeof m.scope === 'object') boxes.push(m.scope);
            if (m && m.data && typeof m.data === 'object') boxes.push(m.data);
            const pick = (k) => {
                for (const b of boxes) {
                    const v = b[k];
                    /* 0 是**有效楼层**(第 0 楼),不得当成缺省(与空串严格分开)。 */
                    if (v === undefined || v === null || v === '') continue;
                    return String(v);
                }
                return '';
            };
            let chatId = '';
            try { chatId = String((typeof this.getCurrentChatId === 'function') ? (this.getCurrentChatId() || '') : ''); }
            catch (e) { chatId = ''; }
            const parts = ['c:' + (chatId || '(no-chat)')];
            /* ★ [v3.329.0] 显式「判不了」的接线点(把模块侧的 null 分支接上真数据):
             *   条目**自己带了 `scope` 键且值为 null** ⇒ 写它的那一刻就没有会话 id
             *   (`_currentScopeStamp()` 无会话时返回 null)。这条目**身份不可判**,
             *   按计划「不能因为没法确定就合并」⇒ 交给模块侧的 null 口径(拒绝合并 + 留读数)。
             *   没有这个键的旧档(字段压根不存在)= **undefined** ⇒ 仍走旧行为,
             *   「旧档不误合」与「旧行为不突袭」两件事才都成立。 */
            for (const b of boxes) {
                if (b && Object.prototype.hasOwnProperty.call(b, 'scope') && b.scope === null) return null;
            }
            /* 宇宙轴与**会话戳轴分开**(v3.329.0 修订,起因是实测出的一个遮蔽):
             *   `_currentScopeStamp()` 把会话戳写成 `{universe:'chat:<id>'}` —— 它落在
             *   `universe` 字段上只是**线索标记**。修前 `pick('universe')` 会先取到
             *   `chat:<id>` 并让 `_lastProject.universe`(真宇宙,如项目归一化给的
             *   `ruby-verse`)永远取不到 ⇒ 同会话内两个**不同项目**被并成一个域,
             *   而「细界由项目读数接上」这条设计意图当场落空(自证不出、静默)。
             *   现在:`chat:` 前缀一律**改走 `s:` 轴**,`u:` 轴只装真宇宙。 */
            const lp = this._lastProject || null;
            const isStamp = (s) => (typeof s === 'string' && s.indexOf('chat:') === 0);
            const rawUni = pick('universe');
            const uni = (rawUni && !isStamp(rawUni)) ? rawUni : String((lp && lp.universe) || '');
            const stamp = isStamp(rawUni) ? rawUni : '';
            const pid = pick('projectId') || String((lp && lp.projectId) || '');
            const fl = pick('floor');
            /* 分支轴:`fp`(消息指纹)是**同楼重生成**的分支单位 —— 只按 floor 判会把
             *   上一个分支的正文当重复永删(计划「同文不同分支」那一组的真单位)。 */
            const fp = pick('fp');
            /* 实体 id:**带上才分开** —— 同宇宙里的同名异人只有靠它才分得开
             *   (正常重复节点不带 id ⇒ 照旧按名合;带了不同 id ⇒ 不许合)。 */
            const eid = pick('entityId');
            if (uni) parts.push('u:' + uni);
            if (stamp) parts.push('s:' + stamp);
            if (pid) parts.push('p:' + pid);
            if (eid) parts.push('e:' + eid);
            if (fl) parts.push('f:' + fl);
            if (fp) parts.push('g:' + fp);
            return parts.join('|');
        }
        /** [v3.329.0 · M4-O1] 新建条目的会话范围戳。
         *   **不缓存**:缓存了就会在切会话后继续用旧宇宙的戳 ⇒ 两个会话的条目同键。
         *   带回它的条目**自成「有线索」**,于是「新建的能合、旧档不误合」两者同时成立。
         *   会话 id 取不到 ⇒ null(条目落成「无线索」,保守不参与去重,不编一个假宇宙)。
         *
         *   `fp`(分支轴,可选):传了消息就带上该楼的**指纹**(角色|页|正文hash|时间戳)。
         *   为什么楼层不够:同一楼**重新生成**会覆盖 swipe,新向量与旧向量同楼同文 ——
         *   只按 floor 判就会把上一个分支的正文当重复永删。判分支的真源就在 `msgFpOf`
         *   (`branch-guard.js` 的签名同源、多带 gen_id),这里只消费不另造。
         *   同一楼同一页 ⇒ 指纹相同 ⇒ 照旧去重(旧行为不被本轴打散)。 */
        _currentScopeStamp(msg) {
            let chatId = '';
            try { chatId = String((typeof this.getCurrentChatId === 'function') ? (this.getCurrentChatId() || '') : ''); }
            catch (e) { chatId = ''; }
            if (!chatId) return null;
            const stamp = { universe: 'chat:' + chatId };
            try {
                const m = (msg && typeof msg === 'object') ? msg : null;
                if (m && typeof msgFpOf === 'function') {
                    const fp = msgFpOf(m);
                    if (fp) stamp.fp = String(fp);
                }
            } catch (e) { errLog(e, 'M4O1.范围戳分支轴'); }
            /* 项目出处(**写戳那一刻**取,不是回收那一刻取):
             *   修前范围键对带戳条目只剩 `u:chat:<id>` —— 条目的**项目宇宙**在键上
             *   从未出现过,于是「同一个会话里两个项目各有一个「林安」」仍会被合掉。
             *   戳上记下当时的项目 id,回收面就不会拿「现在的项目」去追认历史条目的归属
             *   (用户切了项目再优化,老条目不该被改判到新项目名下)。
             *   没选项目时留空 ⇒ 回落「当前的最近项目读数」,与不带戳条目同一口径。 */
            try {
                const lp = this._lastProject || null;
                if (lp && lp.projectId) stamp.projectId = String(lp.projectId);
            } catch (e) { errLog(e, 'M4O1.范围戳项目轴'); }
            return stamp;
        }
        /** [v3.329.0 · M4-O1] 图节点上的**范围字段**(与向量戳同源,只有一处派生点)。
         *   为什么要有这一层:三处建角色节点的地方(正文抽取 / 历史回填 / 世界书角色)
         *   各写一份表达式就有三份漂移面 —— 少写一处,那一类节点在回收面上就退回
         *   「按名合」,而缺一个字段不会报错,只会让同名角色被永久合掉。
         *   字段**平铺**在 `data` 上(不嵌 `scope` 对象):节点侧的历史格式本就是平的
         *   (`data.source` / `data.aliases`),`_gcScopeKey` 的四层兜取照样取得到。 */
        _scopeData(extra) {
            let st = null;
            try { st = this._currentScopeStamp() || null; } catch (e) { st = null; }
            const out = Object.assign({}, extra || {});
            if (st) { out.universe = st.universe; out.projectId = st.projectId; }
            /* ★ 取不到会话 id ⇒ **显式写 `scope:null`**(不是留空):留空 = `undefined`,
             *   回收面会把它读成「旧档、按旧口径合」—— 而定不出身份的新条目正属于
             *   计划点名不许合的那一类。显式 null 让它进「判不了 ⇒ 拒绝合并 + 留读数」。 */
            else out.scope = null;
            return out;
        }
        // [v2.9] RU-B: 记忆优化器(v3.326.0 · A1 第九刀:五路回收算法已抽为 memory-gc.js,本方法只剩取库 →
        //   注入 → 写回 → 落账;模块缺席 ⇒ _lastGcLedger = null,与「在场但零删除」不同形)
        optimizeMemory() {
            const GC = _memoryGcLib();
            if (!GC || typeof GC.runGc !== 'function') {
                this._lastGcLedger = null;
                errLog(new Error('memory-gc.js 缺席'), 'GC.缺席');
                return 0;
            }
            const _cfg = this.config.config || {};
            const _scopeOf = (o) => this._gcScopeKey(o);
            /* [M4-O7 · v3.337.0] 证据保护判定器:三条容量删除路各一(只对**候选删除集**调用)。
             *   判定器把「不可替代证据」从删除名单里摘出来。统一先看显式保留标记
             *   (`pinned` / `retain` / `keep` / `userPinned` 任一为真)⇒ 最高优先级保;
             *   再看**撤回标记**(`revoked === true`)⇒ 明确不保 —— **已撤回事实不得因保留
             *   策略复活**(验收原文)。其余文本特征(未结承诺/身份转折/用户保留原话)
             *   走 stm-ltm 的四个关键句正则(单一真源,宿主不重抄词表)。
             *   `_stmLtmSalient` 为 null 时退化为**只认显式标记**:文本级判定「判不了」就
             *   不保(保住错了不可逆,删了有账可查)。 */
            const _stmLtmSalient = (typeof this.stmLtm?.keepSalient === 'function') ? this.stmLtm : null;
            const _evJudge = (item) => {
                if (!item || typeof item !== 'object') return null;
                const m = (item.metadata && typeof item.metadata === 'object') ? item.metadata : null;
                const explicit = (item.pinned === true) || (item.retain === true)
                    || (item.keep === true) || (item.userPinned === true)
                    || (!!(m && (m.pinned === true || m.retain === true)));
                if (explicit) return { keep: true, rank: 100, reason: 'user-keep' };
                /* [v3.421.0 · 缝合 E1] 治理锁定即**硬豁免**（rank 抬到 110，高于 user-keep）。
                 *   修前 `importance` 是一个没人敢改的裸数字：人手工把一条记忆调到高价值之后，
                 *   下一轮 GC 照样按同一公式把它排到删除端 —— 因为「人定过」没被记下来。
                 *   现在锁在 `governance.strength_locked` 上，且**与保护预算无关**（见下面的
                 *   locked 分支）：预算满时锁定条目也可以继续保，它是人已经付过代价的。
                 *   `importance_scale` 一并读：宿主 0-1 / 1-5 / 0-10 三种旧语义并存，
                 *   不按条目自带尺度换算会把 5 分制的「4」读成 core。 */
                const _gov = (item.governance && typeof item.governance === 'object') ? item.governance
                    : (m && m.governance && typeof m.governance === 'object') ? m.governance : null;
                if (_gov && _gov.strength_locked === true) {
                    return { keep: true, rank: 110, reason: 'strength-locked', exemptBudget: true };
                }
                if (item.revoked === true || !!(m && m.revoked === true)) return null;
                const text = (typeof item.text === 'string' && item.text) ? item.text
                    : (typeof item.summary === 'string' && item.summary) ? item.summary
                    : (m && typeof m.text === 'string') ? m.text : '';
                if (!text) return null;
                const hits = (_stmLtmSalient && _stmLtmSalient.keepSalient)
                    ? _stmLtmSalient.keepSalient([text], { maxPerKind: 1, maxTotal: 16 })
                    : null;
                if (!hits || !hits.length) return null;
                const kinds = new Set(hits.map(x => x && x.kind));
                if (kinds.has('open')) return { keep: true, rank: 80, reason: 'promise-open' };
                if (kinds.has('turn')) return { keep: true, rank: 70, reason: 'identity-turn' };
                if (kinds.has('quote')) return { keep: true, rank: 60, reason: 'user-quote' };
                if (kinds.has('number')) return { keep: true, rank: 50, reason: 'key-number' };
                return null;
            };
            /* 预算:未配置默认 32 条/轮(三条容量删除路各享一份);显式 `gcProtectBudget` 可覆盖,
             *   含 0(=关保护,逐字旧行为)。预算不是「无限增库」:用尽即降级删除并计 overBudget。 */
            const _protectBudget = (() => {
                const v = Number(_cfg.gcProtectBudget);
                if (Number.isFinite(v) && v >= 0) return Math.floor(v);
                return 32;
            })();
            const _r = GC.runGc({
                vectors: this.vector.vectors, summarySummaries: this.summary.summaries,
                itemOps: this.itemOps, graphNodes: this.graph.nodes, graphEdges: this.graph.edges,
                vectorMaxCount: _cfg.vectorMaxCount, summaryMaxCount: _cfg.summaryMaxCount,
                nowMs: Date.now(), chat: window.SillyTavern?.getContext?.()?.chat,
                msgFpOf: msgFpOf, hash32: hash32, normalizeName: normalizeCharName,
                dependencyClosure: _moduleLib(() => window.LonShaDependencyClosure, 'dependency-closure.js'),
                /* [v3.329.0 · M4-O1] 两条去重路的范围注入(**同一份口径**,不是两套规则):
                 *   向量按 `metadata` 取范围、图谱按节点本身取范围。判不了范围(旧档条目)
                 *   时模块侧返回 null ⇒ **不参与**去重(误合不可逆,少合只是少省一点)。 */
                vectorScopeOf: _scopeOf, nodeScopeOf: _scopeOf,
                /* [v3.337.0 · M4-O7] 证据保护判定器与预算(三条容量删除路各一)。 */
                evidenceJudgeVec: _evJudge, protectBudgetVec: _protectBudget,
                evidenceJudgeSum: _evJudge, protectBudgetSum: _protectBudget,
                evidenceJudgeOps: _evJudge, protectBudgetOps: _protectBudget,
            });
            const _gcLedger = _r.ledger;
            this._lastGcLedger = _gcLedger;
            /* [M4-O7 · v3.337.0] 证据保护读数单独落 `_lastGcEvidence`(**不塞进五键账本**,
             *   五键是「删了多少」,这里是「想删但保住了多少」—— 两件事分开报,
             *   `getDegradationLedger` 按需并入「保护预算用尽」这一档)。 */
            this._lastGcEvidence = _r.evidence || null;
            this.vector.vectors = _r.vectors;
            this.summary.summaries = _r.summaries;
            this.itemOps = _r.items;
            this.graph.nodes = _r.nodes;
            this.graph.edges = _r.edges;
            if (_r.orphanThrew) errLog(new Error(_r.orphanThrew), 'HS.孤儿ops清理');
            if (_r.graphThrew) errLog(new Error(_r.graphThrew), 'GD.图谱去重');
            if (_r.cascadeThrew) errLog(new Error(_r.cascadeThrew), 'V3173.dependencyClosure');
            if (_gcLedger.orphanOps > 0) { try { this.rebuildItems(); } catch (e) { errLog(e, 'HS.孤儿ops清理'); } }
            if (_r.cascade) this._graphDedupCascade = _r.cascade;
            if (_r.dupIds.length) { try { this.graph.rebuildNameIndex(); } catch (e) { errLog(e, 'GD.图谱去重'); } }
            if (_r.dupIds.length && _cfg.debugMode) console.log('[' + PLUGIN_NAME + '] 图谱去重: 合并 ' + _r.dupIds.length + ' 个重复角色节点');
            try {   // [v3.168] GC ledger -> opLog; meta cap 80 chars, compact keys above that.
                if (_r.removed) {
                    const _gcFull = ['vecDup=' + _gcLedger.vecDup, 'vecCap=' + _gcLedger.vecCap,
                        'sumCap=' + _gcLedger.sumCap, 'orphanOps=' + _gcLedger.orphanOps,
                        'graphDup=' + _gcLedger.graphDup].join(' ');
                    const _gcm = _gcFull.length <= 80 ? _gcFull
                        : ['vd=' + _gcLedger.vecDup, 'vc=' + _gcLedger.vecCap, 'sc=' + _gcLedger.sumCap,
                            'oo=' + _gcLedger.orphanOps, 'gd=' + _gcLedger.graphDup].join(' ');
                    this.opLog?.log('gc', 'remove', _r.removed + ' items', this._currentFloor ?? null, _gcm);
                }
            } catch (e) { errLog(e, 'nonfatal') }
            if (_r.removed && _cfg.debugMode) console.log('[' + PLUGIN_NAME + '] 记忆优化: 清理 ' + _r.removed + ' 条冗余');
            /* [v3.421.0 · 缝合 E2] 收尾自动应用**低风险且已 ready** 的提案。
             *   为什么放在这里：`optimizeMemory` 是懒散条目唯一的回收时机，提案若只停在
             *   待办里就永远不会落地（面板不会自己跑）；而低风险提案按定义不需要第二把钥匙
             *   （提案者自己那把已在 signatures 内），自动应用不会绕过治理。
             *   **只应用 ready**：pending_review 一律等人，绝不在这里替人签字。 */
            try { this._strengthAutoApplyReady(); } catch (e) { errLog(e, 'strength.autoApply'); }
            /* 治理读数一并落诊断面（`strengthGovernanceReport` 的**首个消费点**）：
             *   待会签积压与锁定条数若不随优化周期被读到，就只能靠人想起来去点面板。 */
            try { this._lastStrengthGovernance = this.strengthGovernanceReport(); } catch (e) { errLog(e, 'strength.govReport'); }
            return _r.removed;
        }
        /** [v3.421.0 · 缝合 E2] 应用全部 ready 提案（收尾批处理；逐条失败不连坐其余）。 */
        _strengthAutoApplyReady() {
            const store = Array.isArray(this._strengthProposals) ? this._strengthProposals : [];
            const ready = store.filter(p => p && p.status === 'ready');
            if (!ready.length) return 0;
            let n = 0;
            for (const p of ready) {
                const r = this.applyStrengthChange(p.proposal_id);
                if (r && r.ok) n += 1;
                else if (r) { p.status = 'apply-failed'; p.applyReason = r.reason; }
            }
            if (n && this.config.config.debugMode) console.log('[' + PLUGIN_NAME + '] 强度治理: 自动应用 ' + n + ' 条低风险提案');
            return n;
        }
        // ================================================================
        // [v3.421.0 · 缝合 E1/E2] 记忆强度治理面（策略 + 双钥匙提案）
        // ----------------------------------------------------------------
        // 设计边界（对调用方必须成立）：
        //   · 全部方法**不持久化**——返回 record 与提案，写回与落盘仍由既有 storage 口径负责；
        //   · 全部方法**不抛**（治理面板不可用不该炸整轮注入），失败返回 `{ok:false, error}`；
        //   · 模块缺席时各自如实降级：策略面缺席 ⇒ ok:false + reason='module-absent'；
        //     提案面缺席 ⇒ `proposeStrengthChange` 直通返回 `no-key` 形态的 ready 提案
        //     （**不假装钥匙已验**，`keyMissing: true`）。
        // ================================================================
        /** 内部：按 id 在向量库/摘要库中找条目（两库都查，治理面不区分来源）。 */
        _strengthFindItem(id) {
            const key = String(id == null ? '' : id);
            if (!key) return null;
            try {
                const v = (this.vector?.vectors || []).find(x => x && String(x.id) === key);
                if (v) return v;
            } catch (e) { /* 落到摘要库 */ }
            try {
                const s = (this.summary?.summaries || []).find(x => x && String(x.id) === key);
                if (s) return s;
            } catch (e) { /* 两库都没有 */ }
            return null;
        }
        /** 内部：把改后的 record 写回它原来所在的库（按 id 原地替换，找不到则不动）。 */
        _strengthWriteBack(record) {
            if (!record || record.id == null) return false;
            const key = String(record.id);
            try {
                const vs = this.vector?.vectors;
                if (Array.isArray(vs)) {
                    const i = vs.findIndex(x => x && String(x.id) === key);
                    if (i >= 0) { vs[i] = record; return true; }
                }
            } catch (e) { /* 落到摘要库 */ }
            try {
                const ss = this.summary?.summaries;
                if (Array.isArray(ss)) {
                    const i = ss.findIndex(x => x && String(x.id) === key);
                    if (i >= 0) { ss[i] = record; return true; }
                }
            } catch (e) { /* 两库都没有 */ }
            return false;
        }
        /** 治理面版本号：`import_ts` 不存在时退到条目的 `updatedAt|ts`，都没有则 `'0'`。
         *  只用于**乐观锁比对**，不参与任何打分 —— 两端都是本方法产出，口径一致即可。 */
        _strengthVersion(item) {
            if (!item) return '0';
            const v = item._govVersion != null ? item._govVersion
                : (item.updatedAt != null ? item.updatedAt : (item.ts != null ? item.ts : 0));
            return String(v);
        }
        /** 内部：改完后推进版本号（每次治理写入必推，否则第二张提案会拿旧锁通过）。 */
        _strengthBumpVersion(record) {
            if (!record) return record;
            try { record._govVersion = Number(record._govVersion || 0) + 1; } catch (e) { /* 非数值就重置 */ }
            return record;
        }
        /** 只读：对单条给强度建议（策略面缺席 ⇒ ok:false，不退化成瞎猜）。 */
        suggestStrength(id) {
            const P = _strengthPolicyLib();
            if (!P || typeof P.suggestStrength !== 'function') {
                return { ok: false, reason: 'module-absent', module: 'strength-policy.js' };
            }
            const item = this._strengthFindItem(id);
            if (!item) return { ok: false, reason: 'item-not-found', id: String(id == null ? '' : id) };
            try {
                return { ok: true, suggestion: P.suggestStrength(item), band: P.bandFor(item.importance) };
            } catch (e) {
                errLog(e, 'strength.suggest');
                return { ok: false, reason: 'threw', error: String(e && e.message || e) };
            }
        }
        /** 只读：全库重估预演（不落盘、不改任何条目）。 */
        simulateStrengths() {
            const P = _strengthPolicyLib();
            if (!P || typeof P.simulateStrengths !== 'function') {
                return { ok: false, reason: 'module-absent', module: 'strength-policy.js' };
            }
            try {
                const all = []
                    .concat(Array.isArray(this.vector?.vectors) ? this.vector.vectors : [])
                    .concat(Array.isArray(this.summary?.summaries) ? this.summary.summaries : []);
                return Object.assign({ ok: true }, P.simulateStrengths(all));
            } catch (e) {
                errLog(e, 'strength.simulate');
                return { ok: false, reason: 'threw', error: String(e && e.message || e) };
            }
        }
        /**
         * 人工改值（可同时上锁）。锁定只许 core 档，由策略面判定；这里只负责找条目与写回。
         * @param {string} id 条目 id
         * @param {number} strength 目标强度 0-100
         * @param {{actor:string, reason:string, lock?:boolean, writeBack?:boolean}} opts
         */
        setStrengthManually(id, strength, opts = {}) {
            const P = _strengthPolicyLib();
            if (!P || typeof P.manualStrengthChange !== 'function') {
                return { ok: false, reason: 'module-absent', module: 'strength-policy.js' };
            }
            const item = this._strengthFindItem(id);
            if (!item) return { ok: false, reason: 'item-not-found', id: String(id == null ? '' : id) };
            try {
                const r = P.manualStrengthChange(item, strength, {
                    actor: opts.actor, reason: opts.reason, now: opts.now || new Date().toISOString(),
                    lock: opts.lock === true
                });
                const record = this._strengthBumpVersion(r.record);
                const written = (opts.writeBack === false) ? false : this._strengthWriteBack(record);
                try { this.opLog?.log?.('strength', opts.lock === true ? 'lock' : 'manual',
                    String(id).slice(0, 12), this._currentFloor ?? null, String(opts.reason || '').slice(0, 40)); } catch (e) { /* 账本非致命 */ }
                return { ok: true, record: record, written: written, requires_review: r.requires_review !== false };
            } catch (e) {
                /* 锁定态/档位不符都从这里出去：都是**可判的拒绝**，不是故障。 */
                return { ok: false, reason: 'rejected', error: String(e && e.message || e) };
            }
        }
        /** 解锁。 */
        unlockStrength(id, opts = {}) {
            const P = _strengthPolicyLib();
            if (!P || typeof P.unlockStrength !== 'function') {
                return { ok: false, reason: 'module-absent', module: 'strength-policy.js' };
            }
            const item = this._strengthFindItem(id);
            if (!item) return { ok: false, reason: 'item-not-found', id: String(id == null ? '' : id) };
            try {
                const r = P.unlockStrength(item, {
                    actor: opts.actor, reason: opts.reason, now: opts.now || new Date().toISOString()
                });
                const record = this._strengthBumpVersion(r.record);
                const written = (opts.writeBack === false) ? false : this._strengthWriteBack(record);
                try { this.opLog?.log?.('strength', 'unlock', String(id).slice(0, 12), this._currentFloor ?? null, String(opts.reason || '').slice(0, 40)); } catch (e) { /* 账本非致命 */ }
                return { ok: true, record: record, written: written };
            } catch (e) {
                return { ok: false, reason: 'rejected', error: String(e && e.message || e) };
            }
        }
        /** 内部：提案登记表（惰性建，只留尾部 100 张，免长线跑团里无限攒）。 */
        _strengthProposalStore() {
            if (!Array.isArray(this._strengthProposals)) this._strengthProposals = [];
            if (this._strengthProposals.length > 100) this._strengthProposals = this._strengthProposals.slice(-100);
            return this._strengthProposals;
        }
        /**
         * 发起强度变更提案。高风险（上锁 / 进 core / 变动 ≥ 20）自动变 `pending_review`。
         * 提案面缺席 ⇒ 直通 ready 且 `keyMissing: true`（不静默假装验过钥匙）。
         */
        proposeStrengthChange(id, strength, opts = {}) {
            const item = this._strengthFindItem(id);
            if (!item) return { ok: false, reason: 'item-not-found', id: String(id == null ? '' : id) };
            const R = _strengthProposalLib();
            const now = opts.now || new Date().toISOString();
            if (!R || typeof R.createStrengthProposal !== 'function') {
                return {
                    ok: false, reason: 'module-absent', module: 'strength-proposal.js', keyMissing: true,
                    fallback: { id: String(id), to_strength: Number(strength), lock: opts.lock === true }
                };
            }
            try {
                const p = R.createStrengthProposal(item, strength, {
                    actor: opts.actor || 'machine', actor_role: opts.actor_role || 'machine',
                    reason: opts.reason, now: now, lock: opts.lock === true,
                    expected_version: opts.expected_version != null ? opts.expected_version : this._strengthVersion(item)
                });
                this._strengthProposalStore().push(p);
                try { this.opLog?.log?.('strength', 'propose', String(p.proposal_id).slice(0, 20), this._currentFloor ?? null, p.status); } catch (e) { /* 账本非致命 */ }
                return { ok: true, proposal: p, describe: R.describeProposal(p) };
            } catch (e) {
                return { ok: false, reason: 'rejected', error: String(e && e.message || e) };
            }
        }
        /** 会签。必须换角色（同角色自审由提案面抛回）。 */
        reviewStrengthChange(proposalId, opts = {}) {
            const R = _strengthProposalLib();
            if (!R || typeof R.reviewStrengthProposal !== 'function') {
                return { ok: false, reason: 'module-absent', module: 'strength-proposal.js', keyMissing: true };
            }
            const store = this._strengthProposalStore();
            const idx = store.findIndex(p => p && String(p.proposal_id) === String(proposalId));
            if (idx < 0) return { ok: false, reason: 'proposal-not-found', proposal_id: String(proposalId) };
            try {
                const p = R.reviewStrengthProposal(store[idx], {
                    actor: opts.actor, actor_role: opts.actor_role,
                    decision: opts.decision || 'approve', now: opts.now || new Date().toISOString()
                });
                store[idx] = p;
                return { ok: true, proposal: p, describe: R.describeProposal(p) };
            } catch (e) {
                return { ok: false, reason: 'rejected', error: String(e && e.message || e) };
            }
        }
        /** 应用提案（四道闸在提案面）。成功后返回可回滚的应用包，并把它登记在 `_strengthApplied`。 */
        applyStrengthChange(proposalId, opts = {}) {
            const R = _strengthProposalLib();
            if (!R || typeof R.applyStrengthProposal !== 'function') {
                return { ok: false, reason: 'module-absent', module: 'strength-proposal.js', keyMissing: true };
            }
            const store = this._strengthProposalStore();
            const p = store.find(x => x && String(x.proposal_id) === String(proposalId));
            if (!p) return { ok: false, reason: 'proposal-not-found', proposal_id: String(proposalId) };
            const item = this._strengthFindItem(p.memory_id);
            if (!item) return { ok: false, reason: 'item-not-found', id: String(p.memory_id) };
            try {
                const r = R.applyStrengthProposal(item, p, {
                    current_version: opts.current_version != null ? opts.current_version : this._strengthVersion(item),
                    now: opts.now || new Date().toISOString()
                });
                const record = this._strengthBumpVersion(r.record);
                this._strengthWriteBack(record);
                if (!Array.isArray(this._strengthApplied)) this._strengthApplied = [];
                this._strengthApplied.push(Object.assign({ proposal_id: p.proposal_id, memory_id: p.memory_id }, r));
                if (this._strengthApplied.length > 50) this._strengthApplied = this._strengthApplied.slice(-50);
                const pi = store.findIndex(x => x && x.proposal_id === p.proposal_id);
                if (pi >= 0) store[pi] = Object.assign({}, store[pi], { status: 'applied' });
                try { this.opLog?.log?.('strength', 'apply', String(p.proposal_id).slice(0, 20), this._currentFloor ?? null, 'v' + String(p.to_strength)); } catch (e) { /* 账本非致命 */ }
                return { ok: true, record: record, proposal_id: p.proposal_id, rollback_available: true };
            } catch (e) {
                return { ok: false, reason: 'rejected', error: String(e && e.message || e) };
            }
        }
        /** 回滚一次已应用的变更（按 proposal_id 找应用包）。 */
        rollbackStrengthChange(proposalId) {
            const R = _strengthProposalLib();
            if (!R || typeof R.rollbackStrengthChange !== 'function') {
                return { ok: false, reason: 'module-absent', module: 'strength-proposal.js' };
            }
            const list = Array.isArray(this._strengthApplied) ? this._strengthApplied : [];
            const found = list.slice().reverse().find(a => a && String(a.proposal_id) === String(proposalId));
            if (!found) return { ok: false, reason: 'no-applied-record', proposal_id: String(proposalId) };
            try {
                const r = R.rollbackStrengthChange(found);
                this._strengthWriteBack(r.record);
                try { this.opLog?.log?.('strength', 'rollback', String(proposalId).slice(0, 20), this._currentFloor ?? null, 'restored'); } catch (e) { /* 账本非致命 */ }
                return { ok: true, record: r.record, restored: true };
            } catch (e) {
                return { ok: false, reason: 'rejected', error: String(e && e.message || e) };
            }
        }
        /** 治理面自述（诊断用，永不抛）：模块缺席/提案积压/锁定条数三项必须能看见。 */
        strengthGovernanceReport() {
            const P = _strengthPolicyLib(), R = _strengthProposalLib();
            const store = Array.isArray(this._strengthProposals) ? this._strengthProposals : [];
            let locked = 0;
            try {
                for (const it of [].concat(this.vector?.vectors || [], this.summary?.summaries || [])) {
                    const g = it && it.governance;
                    if (g && g.strength_locked === true) locked += 1;
                }
            } catch (e) { /* 读数失败按 0，不抛 */ }
            return {
                policyModule: P ? 'ok' : 'absent',
                proposalModule: R ? 'ok' : 'absent',
                policySelfCheck: (P && typeof P.selfCheck === 'function') ? P.selfCheck() : null,
                proposalSelfCheck: (R && typeof R.selfCheck === 'function') ? R.selfCheck() : null,
                lockedCount: locked,
                pendingReview: store.filter(p => p && p.status === 'pending_review').length,
                ready: store.filter(p => p && p.status === 'ready').length,
                returned: store.filter(p => p && p.status === 'returned').length,
                applied: (Array.isArray(this._strengthApplied) ? this._strengthApplied : []).length
            };
        }

        /** [v3.168] 静默降级总账：把散落各处的「退到次优路径」计数聚成一张表。
         *  存在理由：本项目有一整类失效形态——**不是报错，而是悄悄换了一条更差的路**：
         *  嵌入层退回伪向量、记忆上限回收删数据、睡眠归档积压、携带契约缺键、
         *  人物状态碰上限、台账写入违规。每条单独都有日志，但没有地方能把它们并列
         *  回答「我这套记忆到底有多少部分在退化运行」。本方法只聚合已存在的计数器，
         *  不新增状态、不修任何数据，永不抛出。 */
        getDegradationLedger() {
            // [v3.168] ok 初值为 false（fail-closed）：旧写法只在尾部赋值，异常时
            //   报告里的 ok 会是 undefined——诊断自己不能以「未知」结尾。
            const r = { rows: [], degraded: 0, ok: false, at: Date.now() };
            try {
                const push = (name, val, detail) => {
                    const v = Number(val) || 0;
                    r.rows.push({ name, value: v, detail: detail || '' });
                    if (v) r.degraded++;
                };
                const ed = this.vector?._embedDegrade || {};
                const embedTotal = (ed.noKey || 0) + (ed.apiError || 0) + (ed.missingVector || 0) + (ed.exception || 0);
                push('嵌入降级', embedTotal, embedTotal ? `无密钥${ed.noKey || 0}/接口报错${ed.apiError || 0}/缺向量${ed.missingVector || 0}/异常${ed.exception || 0}` : '');
                const gc = this._lastGcLedger;
                push('记忆回收', gc ? (gc.vecDup || 0) + (gc.vecCap || 0) + (gc.sumCap || 0) + (gc.graphDup || 0) : 0,
                    gc ? `向量去重${gc.vecDup || 0}/向量上限${gc.vecCap || 0}/摘要上限${gc.sumCap || 0}/图谱合并${gc.graphDup || 0}` : '');
                // [M4-O7 · v3.337.0] 证据保护读数并入总账：**想保但没额度**(overBudget)是
                //   一种可见的降级 —— 唯一证据因预算不足被降级删除,必须与「本来就没保」分开。
                //   protectedTotal 本身不是降级(保住了),只在 detail 里体现。
                const ev = this._lastGcEvidence;
                if (ev && (Number(ev.overBudget) > 0 || Number(ev.protectedTotal) > 0)) {
                    push('证据保护预算', Number(ev.overBudget) || 0,
                        `保住 ${ev.protectedTotal || 0} 条/超预算降级 ${ev.overBudget || 0} 条(配置 gcProtectBudget 可调)`);
                }
                /* [v3.421.0 · 缝合 E1] 治理锁定读数：锁定条目**免预算**保住，必须与证据保护
                 *   分开报 —— 它们不吃 gcProtectBudget，混进去会让人以为预算还够。
                 *   value 恒 0（不是降级），detail 里报条数与被拦下的提案数。 */
                if (ev && Number(ev.exemptCount) > 0) {
                    push('治理锁定豁免', 0,
                        `锁定保住 ${ev.exemptCount} 条(不计入保护预算)；待会签提案 ${(this._strengthProposals || []).filter(p => p && p.status === 'pending_review').length} 条`);
                }
                const cal = this._lastRetentionCalibration;
                push('睡眠积压', cal?.dormant || 0,
                    cal ? `高价值陈件${cal.ancientHighValue || 0}/低价值陈件${cal.lowValueStale || 0}` : '');
                const cc = this._lastCarryoverReport;
                push('携带契约缺键', cc?.missingWrite?.length || 0, cc?.missingWrite?.join('/') || '');
                const cse = this.cse?.diagnose?.();
                push('人物状态上限压力', cse?.nearCapChars || 0, cse?.nearCapChars ? `${cse.nearCapChars} 人顶格` : '');
                const lv = this._ledgerViolationSummary?.();
                if (typeof lv === 'string' && lv && lv !== '—') push('台账写入违规', 1, lv);
                const mig = this.config?._lastMigrationReport;
                push('配置迁移跳过', mig?.skipped?.length || 0, mig?.skipped?.join('/') || '');
                // [v3.169] 账本自述面：审计账本本身也得进这张表——它是全部诊断的载体，
                //   它被裁剪/淘汰/丢弃而无人知，会让「全部正常」变成一句没有依据的话。
                const _ol = this.opLog;
                if (_ol && typeof _ol === 'object') {
                    const _lost = (_ol._truncated || 0) + (_ol._trimFields || 0) + (_ol._importDropped || 0);
                    if (_lost) push('审计账本有损', _lost,
                        `淘汰 ${_ol._truncated || 0}/字段裁剪 ${_ol._trimFields || 0}/导入丢弃 ${_ol._importDropped || 0}`);
                }
                // [v3.170] 巩固面：stm-ltm 的 loss 账本并入总账（I5/I6 的第一个跨界检查对象）。
                //   只报 entries.length 会让「丢过」与「从未超限」同形；这里的 value 是
                //   真丢失类计数之和（滚进 LTM 的 stmEvicted 属容量动作，不混入「有损」），
                //   读数自洽检查（incoherent）非空时也必须可见——矛盾比丢失更危险。
                const _sl = this.stmLtm?.selfReport?.(this._stmLtmState);
                if (_sl && typeof _sl === 'object') {
                    const _lossOnly = ['ltmEvicted', 'ltmTrimmed', 'spanDropped', 'spanEmptied',
                        'rawDropped', 'floorDropped', 'emptyEntriesDropped',
                        'rawIdCollisions', 'legacyTrimOnSave', 'inputDropped'];
                    const _lost = _lossOnly.reduce((a, k) => a + (Number(_sl.counters?.[k]) || 0), 0);
                    const _incoh = (Array.isArray(_sl.incoherent) && _sl.incoherent.length) ? _sl.incoherent.length : 0;
                    if (_lost || _incoh) push('巩固账本有损', _lost + _incoh, (_sl.row || '') + (_incoh ? ' ⚠️读数矛盾' : ''));
                }
                /* [v3.421.0 · 缝合 E3] 销项面进总账。两类缺口各自可见：
                 *   ① 「想销没销成」（被保底/额度拦下、额度不够截断）—— 与「没什么可销」同形，
                 *      不报出去就会读成「销项机制没在工作」或反之；② 判据取到的是内联兜底而非
                 *      `stm-close-quota.js` 真源 —— 算法相同，但缺席导致的可归因性变差必须能看见。 */
                const _cl = this._stmLtmClose;
                if (_cl && (_cl.blocked || _cl.shortfall)) {
                    push('加固销项受阻', (_cl.blocked ? 1 : 0) + (Number(_cl.shortfall) || 0),
                        (_cl.blocked ? '被护栏拦下' : '额度不足截断') + (_cl.reasons?.length ? `(${_cl.reasons.join('/')})` : '') + ' ' + (_cl.line || ''));
                }
                try {
                    if (this.stmLtm?.closeQuotaSource?.() === 'inline-fallback') {
                        push('销项判据降级', 1, 'stm-close-quota.js 未取到，走同算法内联兜底');
                    }
                } catch (_e) { /* 读数失败不作为缺口（selfCheck 本身自兜） */ }
                // [v3.171] 门控读数面：smart-trigger 的读侧缺口并入总账。与巩固账本同族
                //   （I5/I6）——「判不了（非法规则）/ 没读到（空读）/ 被丢弃（上限 + 环形淘汰）」
                //   都必须可计数。只报「评估 N 楼、省下 M 次」会让这三类缺口全部隐身。
                if (Array.isArray(this._triggerStats) && this._triggerStats.length) {
                    const _tp = (typeof window !== 'undefined' ? window.LonShaSmartTrigger : null);
                    if (_tp && typeof _tp.normalizeTriggerReport === 'function') {
                        const _rep = _tp.normalizeTriggerReport(this._triggerStats, {
                            cap: 300,
                            dropped: Number(this._triggerDropped) || 0,
                        });
                        const _invBad = this._triggerStats.reduce((n, r) => n + Number((r && r.report && r.report.invalidPatterns) || 0), 0);
                        const _omitErr = this._triggerStats.reduce((n, r) => n + Number((r && r.report && r.report.omitErrors) || 0), 0);
                        const _gap = (_rep.empty || 0) + (_rep.dropped || 0) + _invBad + _omitErr;
                        if (_gap) push('门控读数缺口', _gap,
                            `空读 ${_rep.empty || 0}/环形淘汰 ${_rep.dropped || 0}/规则判不了 ${_invBad}/番外判定失败 ${_omitErr}`);
                    }
                }
                // [v3.168] 盲区检测：一个降级来源都读不到时，「全部正常」是假的安心。
                //   审计失效的方式恰恰就是「报告一切正常」，故宁可说「看不见」也不能说「没事」。
                const _srcs = [this.vector, this._lastGcLedger, this._lastRetentionCalibration,
                    this._lastCarryoverReport, this.cse, this.config, this.opLog];
                if (!_srcs.some(x => x)) push('账本盲区', 1, '未采集到任何降级来源（尚未运行过，或宿主接口未注入）')
                // [v3.172] 召回漏斗读数面：v3.95/v3.96 缝合四模块的收缩量并入总账。
                //   与门控/巩固同族（I5/I6）：截断、判不了、映射不上、硬切、副通道失败
                //   若不各自计数，漏斗变窄在面板上完全看不出来。
                if (Array.isArray(this._recallFunnel) && this._recallFunnel.length) {
                    const _ai = (typeof window !== 'undefined' ? window.LonShaAISelect : null);
                    if (_ai && typeof _ai.normalizeRecallFunnel === 'function') {
                        const _fp = _ai.normalizeRecallFunnel(this._recallFunnel, {
                            cap: 500, dropped: Number(this._recallFunnelDropped) || 0,
                        });
                        const _fgap = _fp.unreadable + _fp.unmatched + _fp.truncated + _fp.graphDropped
                            + _fp.hardCut + _fp.channelFallback + _fp.dropped + _fp.missing;
                        if (_fgap) push('召回漏斗读数缺口', _fgap,
                            `AI判不了 ${_fp.unreadable}/key映射不上 ${_fp.unmatched}/粗召回截断 ${_fp.truncated}`
                            + `/图谱截断 ${_fp.graphDropped}/分块硬切 ${_fp.hardCut}/副通道回落 ${_fp.channelFallback}`
                            + `/环形淘汰 ${_fp.dropped}/缺失读数 ${_fp.missing}`);
                    }
                }
                if (Number(this._recallFunnelReadEmpty) > 0) push('漏斗空读轮次', Number(this._recallFunnelReadEmpty),
                    '本轮四个模块一条读数都没计到（≠ 无收缩）');
                // [v3.173] 缝合模块接线面：7 个零消费模块的接线读数并入总账（I5/I6 同族）。
                //   凡「有损」或「读失败」都必须在这里露面——否则接线等于没接。
                try {
                    const _eR = this._entityRegistryRead;
                    if (_eR && (_eR.rejected || _eR.resolveMiss)) push('实体登记面', _eR.rejected + _eR.resolveMiss,
                        `登记被拒 ${_eR.rejected} · 解析不唯一 ${_eR.resolveMiss}`
                        + (_eR.sample && _eR.sample.length ? ' （' + _eR.sample.slice(0, 3).join(' / ') + '）' : ''));
                    const _dcR = this._graphDedupCascade;
                    if (_dcR && (_dcR.ghostNodes || _dcR.danglingDeps)) push('图谱幽灵边', _dcR.ghostNodes + _dcR.danglingDeps,
                        `断链节点 ${_dcR.ghostNodes} · 悬空依赖 ${_dcR.danglingDeps}`
                        + (_dcR.merged ? ` · 本轮去重合并 ${_dcR.merged}` : ''));
                    const _cd = this._cadenceTriage;
                    if (_cd && _cd.normalizedFallback && _cd.normalizedFallback.length) push('节奏旋钮回落', _cd.normalizedFallback.length,
                        '周期旋钮填了非法值被静默改写：' + _cd.normalizedFallback.join(' / '));
                    const _fl = this._floorRangeLedger;
                    if (_fl && _fl.holes) push('覆盖水位空洞', _fl.holes,
                        `已覆盖到 ${_fl.coveredTo} 楼，中间 ${_fl.holes} 处断口（待处理 ${_fl.pending} 段）`);
                    const _at = this._artifactTurnReconcile;
                    if (_at && _at.unmatched) push('产物轮次对账', _at.unmatched,
                        `库内 ${_at.existing} 条产物中 ${_at.unmatched} 条与当前轮次对不上（身份随位置漂移）`);
                } catch (e) { errLog(e, 'getDegradationLedger.接线读数'); }
                r.ok = r.degraded === 0;
            } catch (e) { errLog(e, 'getDegradationLedger'); r.error = String(e?.message || e); }
            return r;
        }
        recallWorthRunning() {
            try {
                const chat = window.SillyTavern?.getContext?.()?.chat || [];
                const aiFloors = chat.filter(m => !m.is_user).length;
                if (aiFloors <= 5) return false;   // 几乎全部在上下文窗口内
                return true;
            } catch (e) { return true; }
        }
        
        // [v3.150] A: 召回命中自检——把「查了什么/命中几条/各来源分布/有没有空结果」写进环形账本（_recallAudit），
        //   诊断面板 selfCheck 渲染「召回效果自检」段。这是全局测试比 172% 却唯一没有自检防线的核心机制（召回）的补盲。
        //   只观测不改写召回逻辑（零风险观测层）。空结果 = 本轮注入零前情，是真召回故障的最直接信号。
        _auditRecall(query, results, injected) {
            try {
                const SRC = ['summary','graph','diary','vector','diffusion','pov','timeline','bm25','volume','status','holiday','suspense','presence','neuralChain','worldProg'];
                const perSource = {};
                let totalHits = 0;
                for (const s of SRC) {
                    const arr = Array.isArray(results?.[s]) ? results[s] : [];
                    const n = arr.length;
                    if (n) perSource[s] = n;
                    totalHits += n;
                }
                const floorHits = {};
                const vecHeat = [];
                for (const s of SRC) {
                    const arr = Array.isArray(results?.[s]) ? results[s] : [];
                    for (const item of arr) {
                        const f = Number(item?.floor ?? item?.metadata?.floor);
                        if (Number.isFinite(f) && f >= 0) floorHits[f] = (floorHits[f] || 0) + 1;
                        if (s === 'vector' && item?.id) vecHeat.push(String(item.id));
                    }
                }
                const rec = {
                    floor: Number(query?.floor ?? -1),
                    queryText: String(query?.text || '').slice(0, 80),
                    intent: (this.llm?.getLastIntent?.() || '').slice(0, 60),
                    totalHits,
                    perSource,
                    injectedCount: Array.isArray(injected) ? injected.length : 0,
                    empty: totalHits === 0,
                    floorHits,
                    vecHeatCount: vecHeat.length,
                    ts: Date.now(),
                    /* [v3.294.0 · X8] 两条**给下游核对用**的读数：
                     *   · srcKeys  本轮的源名册（SRC 常量的实参快照）。作用是让
                     *     「哪些源在册」这件事全局只有一份真源 —— 解释面拿它组装源表，
                     *     不必在别处再手抄一份名单（抄了就会漂移，而漂移的表现恰好是
                     *     「禁用项仍被报成有注入」）。
                     *   · injectedIds 见调用侧 `_finalize`，那里才拿得到收尾结果。
                     *   两条都不参与任何决策，只供解释面做**跨面一致性**核对。 */
                    srcKeys: SRC.slice(),
                };
                /* [v3.251.0] M-O3：把本轮的**楼层号**落成实例字段，作为「回执 ↔ 召回账本」
                 *   配对的唯一键。不落这个字段的话，构建期只能取 `_recallAudit` 的
                 *   最后一条来当本轮的原始命中数 —— 而「最后一条」在一轮里可能属于
                 *   上一次召回（重试 / 多次 recallMemory 调用），拿它当本轮读数
                 *   就是本仓点名的「张冠李戴」。楼层对不上时构建侧宁可报 null。 */
                this._lastRecallFloor = rec.floor;
                const log = this._recallAudit || (this._recallAudit = []);
                log.push(rec);
                if (log.length > 50) log.shift();
                return rec;
            } catch (e) { errLog(e, 'recall.audit'); return null; }
        }
        // [v3.150] B: 楼层召回账本——把「哪楼剧情被本轮召回」回记进 FloorLedger（recallIds），
        //   让楼层账本从「记写入」扩展到「记召回」；向量命中经 _heatEntry 续热度（decayScore 激活臂 +1、lastActive 重置）。
        //   FloorLedger.beginFloor 已带 recallIds 字段，本方法只负责聚合 + 记账 + 续热。
        _recordFloorRecall(floorHits, vecHeat) {
            try {
                if (!this.config.config.floorRecallLedgerEnabled) return 0;
                if (!floorHits || !Object.keys(floorHits).length) return 0;
                let n = 0;
                for (const f of Object.keys(floorHits)) {
                    const floor = Number(f);
                    if (!Number.isFinite(floor) || floor < 0) continue;
                    const hits = floorHits[floor];
                    try { this.ledger.record(floor, { recallIds: ['rec_' + Date.now() + '_' + (n++)], recallHits: hits }); } catch (e) {}
                }
                // 向量命中续热度（heatOnRecall 轴）
                if (vecHeat?.length && this.vector?._heatEntry) {
                    for (const vid of vecHeat) {
                        const srcEntry = this.vector.vectors?.find(x => x && x.id === vid);
                        if (srcEntry) { try { this.vector._heatEntry(srcEntry); } catch (e) {} }
                    }
                }
                return n;
            } catch (e) { errLog(e, 'recall.floorLedger'); return 0; }
        }
        // [v3.152] ANIMA 词典线 B：感知检索配额——「当前剧情状态影响检索什么」的机制化轻量版。
        // 数据源全部为现成剧情状态（零额外 API）：大纲 tempo（surge=高压期多检索）/ 未决矛盾 / 开放悬念。
        // 基线 1.0，clamp [0.7, 1.6]；config 基数键 vectorTopK/bm25TopK 不动（向后兼容），只做乘法调制。
        computeRecallQuota() {
            try {
                if (this.config.config.statusAwareQuotaEnabled !== true) return 1;
                let quota = 1;
                const tempo = this.outline?.stage?.tempo;
                if (tempo === 'surge') quota += 0.3;           // 高压期：多喂记忆
                else if (tempo === 'aftermath') quota -= 0.3;  // 余波期：降噪
                const conflicts = (this.conflicts?.conflicts || []).length;
                if (conflicts >= 3) quota += 0.15;             // 矛盾密集期：佐证材料要多
                const openSusp = (this.suspense?.openItems?.() || []).length;
                if (openSusp >= 5) quota += 0.15;              // 悬念密集期：线索召回加量
                // [v3.153] swipe 感知臂（anima #33）：重绘态多召回，给模型更宽的候选避免再抽风
                if (this.config.config.swipeAwareRecallEnabled === true && this._swipeRegen) quota += 0.2;
                // [v3.153] 台账臂（anima #28 轻量版）：近 6 楼内物品台账有变动→相关记忆值得多召回
                if (this.config.config.ledgerAwareQuotaEnabled === true && this.itemOps?.length) {
                    const _cf = this._currentFloor;
                    const _recent = this.itemOps.some(o => Number.isFinite(_cf) && _cf >= 0 && Math.abs((Number(o?.floor) || 0) - _cf) <= 6);
                    if (_recent) quota += 0.2;
                }
                return Math.min(1.9, Math.max(0.7, quota));
            } catch (e) { return 1; }
        }
        /** [v3.152] 词典变更后失效 BM25 语料指纹（下次召回自然重建，文档端按新词典重归一）。
         *  词典状态不参与 _corpusFp 计算（三处语料指纹断言 v3148 保持不动），改走失效-重建通路。 */
        _invalidateBm25Corpus() {
            try { if (this.bm25) this.bm25._corpusFp = ''; } catch (e) { /* 非致命 */ }
        }
        async recallMemory(query) {
            const M = _moduleLib(() => window.LonShaEngineRecall, 'engine-recall.js');
            return M ? M.recallMemory(this, query) : { summary: [], graph: [], diary: [], timeline: [], cards: [], profiles: [], entities: [], vectors: [], totalCount: 0 };
        }

        // [v3.48] P3: 本地意图分流重排管线（triviumdb on_rerank 理念，零 API）
        // 统一化三路意图分流：历史回顾类 query 提权时态历史边；物品类 query 提权物品台账；关系类 query 提权关系网。
        // 之前三路意图分流散落在 recallMemory 各分支（isHistorical 等），本管线将其收敛为召回后统一中间层。
        intentRerank(merged, queryText) {
            try {
                const q = String(queryText || '');
                if (!q || !Array.isArray(merged) || merged.length < 2) return merged;
                const isHistory = /当年|曾经|以前|旧怨|旧事|过去|往事|回忆|最初|那时候/i.test(q);
                const isItem = /物品|道具|东西|短剑|信物|钥匙|账本|礼物|随身|物品栏|装备/i.test(q) || this.itemOps?.some(o => o?.name && q.includes(o.name));
                const isRelation = /关系|羁绊|仇|恩|暗恋|结义|师徒|婚|血缘/i.test(q);
                if (!isHistory && !isItem && !isRelation) return merged;
                const boost = (item) => {
                    const text = String(item?.text || '');
                    let b = 0;
                    if (isHistory && (item?.historical || /当年|曾经|以前|旧|最初/.test(text))) b += 2.0;
                    if (isItem && (/物品|道具|随身|寄存/.test(text) || (text.includes('[') && this.itemOps?.some(o => o?.name && text.includes(o.name))))) b += 2.0;
                    if (isRelation && /关系|羁绊|→|恩怨|结义|血缘/.test(text)) b += 1.5;
                    return b;
                };
                return merged.map(item => ({ ...item, _intentBoost: boost(item) }))
                    .sort((a, b) => (b._intentBoost || 0) - (a._intentBoost || 0));
            } catch (e) { errLog(e, 'intentRerank'); return merged; }
        }

        hybridMerge(results) {
            const K = 60; // RRF 标准常数
            // [v3.156] α 真正生效。此前 hybridAlpha 只在 _legacyHybridMerge（自 v3.50 起无调用者的遗留实现）里被读，
            //   [v3.229.0] 那条遗留实现已删除；本方法（hybridMerge）才是 α 至今唯一的活消费点。
            //   而主路径 RRF 从不读它——UI 滑块可见、引擎永不消费。
            //   这里用同一开关把 α 接到 RRF 名次上，保持 RRF 为主排序算法（默认开关关 = 零行为变化）：
            //   α=1 纯向量（向量路名次压缩、其余路拉长），α=0 纯图谱（反向），单调可解释。
            const _weighted = this.config.config.hybridMergeWeighted === true;
            const _alpha = numOr(this.config.config.hybridAlpha, 0.7);
            const lists = [
                results.vector || [],
                results.diffusion || [],
                results.graph || [],
                results.summary || [],
                results.diary || [],
                results.rubyphone || [],
                results.timeline || [],
                results.pov || [],
                results.bm25 || [],
                results.volume || [],
                results.status || [],
                results.holiday || [],
                results.suspense || [],
                results.presence || [],
                results.items || [],
                results.itemsStored || []
            ];
            const byKey = new Map();
            lists.forEach((list, listIdx) => {
                list.forEach((item, rank) => {
                    const key = item.id || item.text || item.name || JSON.stringify(item).substring(0, 80);
                    // [v3.156] 加权模式：向量/扩散路按 α 压缩名次，其余路按 1-α 压缩（互斥，α 越大越偏向量）
                    const _vecSide = (listIdx === 0 || listIdx === 1);
                    const _effRank = _weighted
                        ? rank / Math.max(0.2, (_vecSide ? _alpha : (1 - _alpha)) * 2)
                        : rank;
                    const rrfScore = 1 / (K + _effRank + 1);
                    // [v3.50] 精排分加成：LLM 评分式 rerank 的高分项（>=6）给 RRF 加权（评分/10 × 0.05）
                    const rerankBonus = item._rerankScore >= 6 ? (item._rerankScore / 10) * 0.05 : 0;
                    const prev = byKey.get(key);
                    byKey.set(key, {
                        ...item,
                        rrfScore: (prev?.rrfScore || 0) + rrfScore + rerankBonus,
                        hits: (prev?.hits || 0) + 1,   // 被几路召回命中
                        source: prev?.source ? prev.source + '+' : ['vector','diffusion','graph','summary','diary','rubyphone','timeline','pov','bm25','volume','status','holiday','suspense','presence','items','items_stored'][listIdx]
                    });
                });
            });
            const merged = Array.from(byKey.values());
            merged.sort((a, b) => (b.rrfScore || 0) - (a.rrfScore || 0));
            const top = merged.slice(0, this.config.config.vectorTopK * 2);
            if (this.config.config.debugMode) {
                console.log(`[${PLUGIN_NAME}] RRF融合: ${merged.length} 项, 多路命中: ${top.filter(t => t.hits > 1).length} 项${_weighted ? `; 加权模式 α=${_alpha}` : ''}`);
            }
            // [v3.16] 神经链 + 世界推进 汇入召回结果
            // [v3.184] 修复：这两行原本被误包在**上面那个 debugMode 分支的大括号里**——
            //   于是「神经链与世界推进的汇入」**只在调试模式下才发生**，
            //   默认配置（debugMode=false）下两条召回通道永远不汇入：模块写得完整、单测可能全绿、
            //   运行时从不走——与「零调用点」同族的失效形态。
            //   修前的测试（v316_three_core 的 ST3）只查字符串在不在场（src.includes('results.neuralChain')），
            //   字符串在场所以全绿——一条“假绿”通道。
            if (results.neuralChain?.length) for (const nc of results.neuralChain) { if (!top.some(t => (t.text||'') === nc.text)) top.push(nc); }
            if (results.worldProg?.length) for (const wp of results.worldProg) { if (!top.some(t => (t.text||'') === wp.text)) top.push(wp); }
            return top;
        }

        
        buildQuery(context) {
            const chat = window.SillyTavern?.getContext?.()?.chat || [];
            const recentMsgs = chat.slice(-5);
            const text = recentMsgs.map(m => m.mes).join(' ');
            // [v3.86] 吸收 MyriadKnots：多路分支查询（latestUser/recentAssistant/previousUser 独立加权）
            const branches = [];
            try {
                const rev = [...chat].reverse();
                const lastUser = rev.find(m => m.is_user);
                const lastAssistant = rev.find(m => !m.is_user);
                const prevUser = rev.filter(m => m.is_user)[1];
                if (String(lastUser?.mes || '').trim()) branches.push({ key: 'latestUser', text: String(lastUser.mes || ''), weight: 0.65 });
                if (String(lastAssistant?.mes || '').trim()) branches.push({ key: 'recentAssistant', text: String(lastAssistant.mes || ''), weight: 0.25 });
                if (String(prevUser?.mes || '').trim()) branches.push({ key: 'previousUser', text: String(prevUser.mes || ''), weight: 0.1 });
            } catch (e) { errLog(e, 'buildQuery.branches'); }
            // [v3.90] 吸收 MyriadKnots entity-identity：别名→主名映射（NFKC 归一），供 BM25 查询侧扩展
            let aliases = null;
            try {
                // [M3-O3] 先记当前剧情时点，再让 buildAliasMap 按它过滤被揭穿/时段挡下的别名
                //   （不反向泄露到旧楼）。**调用形态仍是 buildAliasMap()**，签名与既有一致。
                //   两者都走可选链：既有提取式测试用**裸 engine** 调本方法（无 _entityRegistry /
                //   currentStoryFloor 这些宿主成员），任一缺席都必须退回「未给时点」而不是抛。
                if (this.config?.config?.aliasQueryExpansion !== false) {
                    try {
                        this._aliasMapAt = (typeof this.currentStoryFloor === 'function') ? this.currentStoryFloor() : null;
                    } catch (e) { this._aliasMapAt = null; }
                    aliases = this.buildAliasMap();
                }
            } catch (e) { errLog(e, 'buildQuery.aliasMap'); }
            // [v3.184] 记录本轮情境文本（关系披露条件的判定依据）。
            //   为何记在这里而不是各调用点各记一次：生成路径与 selfCheck dry-run 都经 buildQuery，
            //   记在这里口径唯一；两处分别记会漂移（一处改了另一处忘），且「谁记得对」无从验证。
            //   取的是召回同一口径的 text（最近 5 条正文拼接），不是另起一套取值。
            this._lastCtxText = String(text || '');
            return {text, characters: this.extractCharactersFromContext(text), queries: null, branches, aliases};
        }
        
        // [v3.90] 吸收 MyriadKnots entity-identity：实体身份归一。从图谱角色节点构建 alias→主名映射，
        // NFKC 归一（与 BM25 _tokenize 同基调），同名/短别名/自映射防碰撞剔除
        buildAliasMap() {
            const map = new Map();
            try {
                const canon = v => String(v ?? '').normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
                /* [M3-O3] 时段/揭穿感知：被 revealAfter/time 挡下的别名**不进查询映射** ——
                 *   这正是「已揭穿身份不反向泄露到旧楼」的落点。修前：别名一旦登记就永久可查，
                 *   伪装期的旧楼会因为后来的揭穿被反向改写。
                 *   时点从 `this._aliasMapAt` 读而**不改本方法签名**：v390_alias 用花括号计数式
                 *   extractMethod 按 marker 提取本方法体，marker 含本方法的无参签名；
                 *   改签名会让那道门找不到方法而当场空转。
                 *   未设该字段（含既有提取式测试的裸 engine）⇒ at=null ⇒ 行为与修前逐字一致。
                 *   注意：本方法体内不得出现裸花括号字面量（含注释里）——花括号计数会被带偏。 */
                const _atSrc = this._aliasMapAt;
                const _reg = this._entityRegistry;
                const _at = (_atSrc == null || _atSrc === '') ? null : Number(_atSrc);
                const _scopeOf = (name) => {
                    if (!_reg || _at == null || !Number.isFinite(_at)) return '';
                    try {
                        const cs = _reg.candidatesFor('person', name, { at: _at });
                        if (!cs.length) return '';
                        return cs[0].blockedBy || '';
                    } catch (e) { return ''; }
                };
                for (const node of this.graph?.nodes?.values() || []) {
                    if (node?.type !== 'character' || !node.name) continue;
                    const main = canon(node.name);
                    if (!main) continue;
                    const aliases = Array.isArray(node.data?.aliases) ? node.data.aliases : [];
                    for (const a of aliases) {
                        const key = canon(a);
                        if (!key || key === main || key.length < 2 || key.length > 20) continue;
                        if (_scopeOf(a)) continue;      // 被时段/揭穿挡下的别名不参与查询扩展
                        if (!map.has(key)) map.set(key, node.name);
                    }
                }
            } catch (e) { errLog(e, 'buildAliasMap'); }
            return map;
        }
        
        extractCharactersFromContext(text) {
            const chars = new Set();
            const ctx = window.SillyTavern?.getContext?.();
            if (ctx?.name2) chars.add(ctx.name2);
            if (ctx?.name1) chars.add(ctx.name1);
            return Array.from(chars);
        }
        
        // [v3.43] 从当前图谱/状态生成四档 NPC 轻量记录，供 buildInjection 使用
        // [v3.45] 吸收 baibai: 跨空间 NPC 长期人伦社会羁绊网
        getNpcTiesRecords() {
            try {
                const map = new Map();
                // 1. 从 status.npcTies 获取
                const statusTies = this.status?.getNpcTiesRecords?.() || [];
                for (const r of statusTies) {
                    if (r.name && r.ties?.length) {
                        map.set(r.name.toLowerCase(), { name: r.name, ties: [...r.ties] });
                    }
                }
                // 2. 从 graph 中获取长期人伦羁绊边
                if (this.graph?.edges) {
                    const PERMANENT_REL_RE = /母|父|妻|夫|女|子|兄|弟|姐|妹|宿敌|死敌|主仆|结义|结拜|恩师|师傅|徒弟|亲属|血亲/;
                    for (const e of this.graph.edges.values()) {
                        const label = String(e.label || e.relation || '');
                        if (PERMANENT_REL_RE.test(label) || e.permanent === true) {
                            const fromNode = this.graph.nodes.get(e.from);
                            const toNode = this.graph.nodes.get(e.to);
                            const fromName = fromNode?.name || e.from;
                            const toName = toNode?.name || e.to;
                            if (fromName && toName && label) {
                                const key = fromName.toLowerCase();
                                const tieStr = `${toName}之${label}`;
                                if (!map.has(key)) map.set(key, { name: fromName, ties: [] });
                                const rec = map.get(key);
                                if (!rec.ties.includes(tieStr)) rec.ties.push(tieStr);
                            }
                        }
                    }
                }
                return Array.from(map.values());
            } catch (e) {
                errLog(e, 'getNpcTiesRecords');
                return [];
            }
        }
        getNpcTiesPrompt() {
            try {
                const recs = this.getNpcTiesRecords();
                // [v3.173] 缝合模块接线面：内联渲染**仍是输出真源**——
                //   RESIDENT_MARKERS / injection-router 靠 '[角色长期关系网]' 标记识别常驻注入，
                //   而模块版 header 与分隔符与内联版已分歧（v3.163 账本已记），直接换输出
                //   会静默废掉常驻识别。故把 npc-ties 接成**对账器**：同一批记录独立渲染一次，
                //   两版的组数/去重数/丢项数差异入读数——分歧可见，行为不变。
                const _nt = _moduleLib(() => window.LonShaNpcTies, 'npc-ties.js');
                if (_nt && typeof _nt.fmtNpcTiesContext === 'function') {
                    const _carry = {};
                    const _modText = _nt.fmtNpcTiesContext(recs, {}, _carry);
                    const _lineText = fmtNpcTiesContext(recs);
                    const _rowsMod = _modText ? _modText.split('\n').length - 1 : 0;
                    const _rowsInline = _lineText ? _lineText.split('\n').length - 1 : 0;
                    const _r = _carry.npcTiesRead || {};
                    this._npcTiesRead = {
                        moduleRows: _rowsMod, inlineRows: _rowsInline,
                        rowsAgree: _rowsMod === _rowsInline,
                        groups: _r.groups || 0, tiesIn: _r.tiesIn || 0,
                        tiesOut: _r.tiesOut || 0, tiesDeduped: _r.tiesDeduped || 0,
                        skippedNoName: _r.skippedNoName || 0, skippedNoTies: _r.skippedNoTies || 0,
                        empty: _r.empty === true, input: _r.input || 0,
                    };
                    this._npcTiesSource = 'module+inline';
                    return _lineText;
                }
                this._npcTiesSource = 'inline';
                return fmtNpcTiesContext(recs);
            } catch (e) { return ''; }
        }

        // [v3.45] 吸收 baibai: 跨会话数据平移与状态种子 (Carryover Seed)
        generateCarryoverSeed(options = {}) {
            try {
                const ctx = window.SillyTavern?.getContext?.();
                const curFloor = (ctx?.chat || []).length - 1;
                const activeVols = this.summary?.getActiveVolumes?.() || [];
                const recentSums = (this.summary?.summaries || []).slice(-5).map(s => s.text || s.summary || '').filter(Boolean);
                const recapParts = [];
                if (activeVols.length) {
                    recapParts.push(...activeVols.map(v => `（第${v.floorStart}-${v.floorEnd}楼）${v.text}`));
                }
                if (recentSums.length) {
                    recapParts.push(...recentSums);
                }
                return {
                    type: 'lonsha_carryover_seed',
                    version: VERSION,
                    createdAt: Date.now(),
                    clock: this.clock?.getSnapshot?.() || null,
                    sourceFloor: curFloor,
                    summaryRecap: recapParts.join('\n'),
                    protagonist: this.status?.getProtagonist?.() || {},
                    lifeDetails: (this.status?.lifeDetails || []).filter(d => d.tier !== 'archive'),
                    carriedItems: (this.items?.records || []).filter(i => i.carried || !i.location),
                    openSuspenses: this.suspense?.openItems?.() || [],
                    npcTies: this.status?.getAllNpcTies?.() || {},
                    baselines: this.status?.baselines || {},
                    geoContext: this.status?.getGeoLocation?.() || {},
                    // [v3.168] 种子路径同源（与 packCarryover 同问题）：下列字段在
                    //   importCarryoverSeed 里早有导入分支或应承接的结构化状态，
                    //   而种子生成侧从未产出——新对话“承接前情”只接到摘要/时钟/物品/悬念/NPC 羼绊，
                    //   角色状态表（statusFlat 的结构化原形）/货币/卡/矛盾/正史增量/
                    //   人物状态（CSE）/叙事心电图/事件日志/大纲导演/配对记忆全部丢失。
                    statusFlat: (() => {
                        const out = [];
                        for (const [name, rec] of Object.entries(this.status?.characters || {})) {
                            for (const [field, value] of Object.entries(rec.fields || {})) {
                                out.push({ character: name, field, value, reason: '携带自旧对话' });
                            }
                        }
                        return out;
                    })(),
                    moneyLedger: this.moneyLedger?.export?.() || null,
                    cards: this.cards?.export?.() || null,
                    conflicts: this.conflicts?.export?.() || null,
                    deltaBook: this.deltaBook?.export?.() || null,
                    cse: this.cse?.export?.() || null,
                    pulse: this.pulse?.export?.() || null,
                    opLog: this.opLog?.export?.() || null,
                    outline: this.outline?.export?.() || null,
                    pairMem: this.pairMem?.export?.() || null,
                    // [v3.202] 拓宽面种子侧同源（与 packCarryover 同问题、同修法）：
                    //   修前种子只带摘要/时钟/物品/悬念/NPC 羁绊，剧情状态账（worldProg 十面、
                    //   角色记忆、锁定事实、术语、前情、替代、STMLTM、修复）全部留在旧对话。
                    worldProg: this.worldProg?.export?.() || null,
                    charMem: this.charMem?.export?.() || null,
                    lockedFacts: this.summary?.getLockedFacts?.() || [],
                    lexicon: this.lexicon?.export?.() || null,
                    prequel: this.prequel?.export?.() || { text: '' },
                    supersede: this.supersede?.export?.() || { supersededMap: {} },
                    stmLtm: this._stmLtmState || null,
                    recallArtifacts: Array.isArray(this._recallArtifacts) ? this._recallArtifacts.slice(-32) : [],
                    narrativeEntropy: Number.isFinite(Number(this._narrativeEntropy)) ? Number(this._narrativeEntropy) : 0,
                    timeWentBack: this._timeWentBack ? { ...this._timeWentBack } : null,
                    repairLog: this._repairState || null
                };
            } catch (e) {
                errLog(e, 'generateCarryoverSeed');
                return null;
            }
        }
        importCarryoverSeed(seed, options = {}) {
            if (!seed || typeof seed !== 'object' || seed.type !== 'lonsha_carryover_seed') {
                console.warn(`[${PLUGIN_NAME}] 无效的 Carryover 种子数据`);
                return false;
            }
            try {
                if (seed.summaryRecap && this.summary) {
                    this.summary.createSummary({ mes: '', index: 0 }, `【跨会话前情承接】\n${seed.summaryRecap}`, { seed: true });
                }
                if (seed.clock && this.clock?.import) this.clock.import(seed.clock);
                if (seed.protagonist && this.status?.setProtagonist) {
                    this.status.setProtagonist(seed.protagonist, 0);
                }
                if (Array.isArray(seed.lifeDetails) && this.status?.addLifeDetail) {
                    for (const d of seed.lifeDetails) this.status.addLifeDetail(d, 0);
                }
                if (Array.isArray(seed.carriedItems)) {
                    // [v3.154] 携带包是外部输入（可能来自另一会话/另一版本的导出），旧写法直接
                    //   push 外部对象进真源，连渲染前清洗都绕不过——字段无长度、无枚举、无类型约束。
                    const _cv = (this.config.config.ledgerWriteValidationEnabled === false)
                        ? { items: seed.carriedItems.filter(it => it && it.name).map(it => ({
                            floor: 0, action: 'add', name: it.name, desc: it.desc || '',
                            holder: it.holder || '主角', carried: true, location: '',
                            state: it.state || '完好'
                        })), violations: [] }
                        : validateCarriedItems(seed.carriedItems);
                    for (const it of _cv.items) {
                        this.itemOps.push({ ...it, updatedAt: Date.now() });
                    }
                    if (_cv.violations.length) this._recordLedgerViolations(_cv.violations, 'carryover', 0);
                    (this.reconcileItemOps || this.rebuildItems)?.call(this);
                }
                if (Array.isArray(seed.openSuspenses) && this.suspense?.add) {
                    for (const s of seed.openSuspenses) {
                        this.suspense.add(s.kind || 'plan', s.content, 0, s.createdTime);
                    }
                }
                if (seed.npcTies && this.status?.setNpcTies) {
                    for (const [name, ties] of Object.entries(seed.npcTies)) {
                        this.status.setNpcTies(name, ties);
                    }
                }
                if (seed.baselines && this.status?.setBaseline) {
                    for (const [name, base] of Object.entries(seed.baselines)) {
                        this.status.setBaseline(name, base);
                    }
                }
                if (seed.geoContext && this.status?.setGeoLocation) {
                    this.status.setGeoLocation(seed.geoContext);
                }
                // [v3.168] 种子侧结构化状态承接（与 applyCarryover 同问题、同修法）：
                //   修前无任何导入分支，validateCarriedItems 的 violations 永远为空。
                //   每项单独 try：一个子系统接口抬头不对不应导致整个种子撤销。
                const _subSystems = [
                    ['moneyLedger', () => this.moneyLedger],
                    ['cards', () => this.cards],
                    ['conflicts', () => this.conflicts],
                    ['deltaBook', () => this.deltaBook],
                    ['cse', () => this.cse],
                    ['pulse', () => this.pulse],
                    ['opLog', () => this.opLog],
                    ['outline', () => this.outline],
                    ['pairMem', () => this.pairMem],
                    // [v3.202] 拓宽面种子侧承接（走各自 import 接口）
                    ['worldProg', () => this.worldProg],
                    ['charMem', () => this.charMem],
                    ['lexicon', () => this.lexicon],
                    ['prequel', () => this.prequel],
                    ['supersede', () => this.supersede],
                ];
                for (const [key, getter] of _subSystems) {
                    if (seed[key] == null) continue;
                    try {
                        const inst = getter();
                        if (inst && typeof inst.import === 'function') inst.import(seed[key]);
                    } catch (e) { errLog(e, 'importCarryoverSeed.' + key); }
                }
                if (Array.isArray(seed.statusFlat) && seed.statusFlat.length) {
                    try { this.status.applyChanges(seed.statusFlat, 0, true); } catch (e) { errLog(e, 'importCarryoverSeed.statusFlat'); }
                }
                // [v3.202] 拓宽面种子侧：非 import 接口的键逐项独立捕获。
                try { if (Array.isArray(seed.lockedFacts) && seed.lockedFacts.length) this.summary.lockedFacts = seed.lockedFacts.slice(); } catch (e) { errLog(e, 'importCarryoverSeed.lockedFacts'); }
                try { if (seed.stmLtm != null && this.stmLtm?.normalizeState) this._stmLtmState = this.stmLtm.normalizeState(seed.stmLtm); } catch (e) { errLog(e, 'importCarryoverSeed.stmLtm'); }
                try { if (Array.isArray(seed.recallArtifacts) && seed.recallArtifacts.length) this._recallArtifacts = seed.recallArtifacts.slice(-32); } catch (e) { errLog(e, 'importCarryoverSeed.recallArtifacts'); }
                try { if (seed.narrativeEntropy != null && Number.isFinite(Number(seed.narrativeEntropy))) this._narrativeEntropy = Number(seed.narrativeEntropy); } catch (e) { errLog(e, 'importCarryoverSeed.narrativeEntropy'); }
                try { if (seed.timeWentBack && typeof seed.timeWentBack === 'object') this._timeWentBack = { ...seed.timeWentBack }; } catch (e) { errLog(e, 'importCarryoverSeed.timeWentBack'); }
                try { const _rl2 = _repairLoopLib(); if (seed.repairLog != null && _rl2?.normalize) this._repairState = _rl2.normalize(seed.repairLog); } catch (e) { errLog(e, 'importCarryoverSeed.repairLog'); }
                // [v3.165] 成功声称面：原写法无论种子实际带来多少数据都报「导入成功」。
                //   实测：只带 {type:'lonsha_carryover_seed'} 的空种子会让下面所有 if 全部跳过，
                //   函数照样打印「✓ 导入成功」并返回 true —— 用户以为承接了前情，实际什么都没导入。
                //   凡以成功结尾的路径都必须有失败出口：此处以「实际生效的字段数」为事实来源。
                const _applied = ['summaryRecap', 'clock', 'protagonist', 'lifeDetails', 'carriedItems',
                    'openSuspenses', 'npcTies', 'baselines', 'geoContext',
                    'moneyLedger', 'cards', 'conflicts', 'deltaBook', 'cse', 'pulse', 'opLog',
                    'outline', 'pairMem', 'statusFlat',
                    // [v3.202] 拓宽面：生效字段事实来源必须覆盖新增面，否则「导入了多少」
                    //   会在读数上漏计（成功声称面与真实生效面不符）。
                    'worldProg', 'charMem', 'lockedFacts', 'lexicon', 'prequel', 'supersede',
                    'stmLtm', 'recallArtifacts', 'narrativeEntropy', 'timeWentBack', 'repairLog']
                    .filter(k => seed[k] != null && (typeof seed[k] !== 'object' || Object.keys(seed[k]).length || Array.isArray(seed[k])));
                this._lastCarryoverImport = { applied: _applied.length, fields: _applied, at: Date.now() };
                if (!_applied.length) {
                    console.warn(`[${PLUGIN_NAME}] ⚠️ Carryover 种子不含任何有效字段（空种子）：未导入任何前情承接`);
                    return false;
                }
                console.log(`[${PLUGIN_NAME}] ✓ 跨会话 Carryover 种子导入成功 (来源版本: ${seed.version || 'unknown'}，生效字段 ${_applied.length}: ${_applied.join('/')})`);
                return true;
            } catch (e) {
                errLog(e, 'importCarryoverSeed');
                return false;
            }
        }

        buildNpcTierRecords() {
            try {
                const present = new Set(this.captureCast());
                const ctx = window.SillyTavern?.getContext?.();
                const currentLocation = this.status?.geoContext?.minorArea || '';
                const known = this.getKnownCharacters();
                return known.slice(0, 20).map(name => {
                    const node = this.graph.findCharacterByName(name);
                    const rec = this.status?.characters?.[name] || {};
                    const baseline = this.status?.baselines?.[name];
                    const persona = this.status?.getEffectivePersona?.(name, (ctx?.chat || []).length - 1);
                    const isPresent = present.has(name);
                    const isImportant = this.status?.isNpcTracked?.(name) || !!baseline || !!rec.fields?.['重要'];
                    const roleTier = isImportant ? 'important' : isPresent ? 'present' : 'absent';
                    return {
                        name,
                        gender: node?.data?.gender || node?.gender || rec.fields?.['性别'] || '',
                        roleTier,
                        isPresent,
                        isImportant,
                        title: node?.data?.title || node?.data?.identity || '',
                        identity: node?.data?.identity || '',
                        relation: node?.data?.relation || '',
                        now: rec.fields?.['当前动作'] || rec.fields?.['姿态'] || '',
                        fields: Object.entries(rec.fields || {}).slice(0, 6),
                        todos: rec.todos || [],
                        traits: baseline?.traits || [],
                        persona: persona?.description || '',
                        location: currentLocation
                    };
                });
            } catch (e) {
                errLog(e, 'buildNpcTierRecords');
                return [];
            }
        }
        // [v3.87] 前情资料注入（吸收 MyriadKnots recall-prequel：边界加权切片 + BM25 分支归一化选段）
        buildPrequelInjection(query) {
            try {
                if (!this.prequel) return '';
                return this.prequel.buildInjection(query, {
                    baseChars: Number(this.config.config.injectionBudget) || 3000,
                    tokenBase: Number(this.config.config.memoryTokenBudget) || 2700,   // [v3.135] 随默认重校准
                    enabled: this.config.config.prequelEnabled !== false
                });
            } catch (e) { errLog(e, 'buildPrequelInjection'); return ''; }
        }
        // [v3.88] 公开只读快照桥（globalThis.lonsha_memory_bridge_v1）：
        // 供外部脚本（手机前端/调试台/衍生卡）读取引擎当前状态快照。全部深拷贝，外部写入不影响引擎内部状态。
        /* [v3.176] 本插件侧账本的**投影**（供世界账本对读消费；纯读、不抛、不猜）。
         * 为什么放在插件本体而不是 GameClock：GameClock 只有时钟，没有 status/outline/worldProg，
         * 在它上面取本地账本会静默取到 undefined，对读就永远返回空且不报错。
         * 故本地投影由插件本体收集，随 opts 传给 clock.readWorldLedger。 */
        /** 角色名 → 位置（取角色状态表的位置/所在地字段；取不到即空表） */
        _localPeopleLocations() {
            const out = {};
            try {
                const chars = (this.status && this.status.characters && typeof this.status.characters === 'object') ? this.status.characters : null;
                if (!chars) return out;
                for (const name of Object.keys(chars)) {
                    const c = chars[name];
                    const f = (c && c.fields && typeof c.fields === 'object') ? c.fields : null;
                    if (!f) continue;
                    // 位置字段的可能键：位置 / 所在地（历史数据两种都写过，都认）
                    const loc = String(f['位置'] || f['所在地'] || '').trim();
                    if (loc) out[name] = loc;
                }
            } catch (_e) { /* 纯读：任何畸形都退化为空表 */ }
            return out;
        }
        /** 本插件侧的事实键集（大纲节拍名 + 世界推进事件名；纯读） */
        _localFactKeys() {
            const keys = [];
            try {
                const ol = (this.outline && typeof this.outline.export === 'function') ? this.outline.export() : null;
                if (ol && Array.isArray(ol.beats)) {
                    for (const b of ol.beats) {
                        const t = String((b && (b.title || b.text)) || '').trim();
                        if (t) keys.push(t.slice(0, 40));
                    }
                }
            } catch (_e) { /* 降级 */ }
            try {
                const wp = (this.worldProg && typeof this.worldProg.export === 'function') ? this.worldProg.export() : null;
                if (wp && wp.events && typeof wp.events === 'object') {
                    for (const k of Object.keys(wp.events)) {
                        const t = String(k || '').trim();
                        if (t) keys.push(t.slice(0, 40));
                    }
                }
            } catch (_e) { /* 降级 */ }
            return keys;
        }
        /** [v3.176] 读世界账本（宿主侧入口：收集本地投影 + 委托时钟读者面） */
        recordCommitmentFact(input = {}) {
            const api = (typeof window !== 'undefined' && window.LonShaCommitmentLedger) || null;
            if (!api || !this.worldProg) return null;
            const action = String(input.action || 'open');
            const current = this.worldProg.commitmentLedger;
            const call = action === 'fulfill' ? api.fulfill
                : action === 'break' ? api.break
                : action === 'cancel' ? api.cancel
                : action === 'amend' ? api.amend
                : api.open;
            const out = call(current, input);
            if (out?.ok && out.changed) {
                this.worldProg.commitmentLedger = out.state;
                const when = input.storyDate;
                const item = out.item;
                if (when && item && this.config?.config?.plotTimeline && this.timeline?.add) {
                    const verb = { open: '约定', amend: '改期', fulfill: '履行', break: '违约', cancel: '撤销' }[action] || '约定';
                    const who = item.counterpart ? item.actor + '对' + item.counterpart : item.actor;
                    this.timeline.add(String(when), verb + '：' + who + ' ' + item.content, input.floor || 0, [item.actor, item.counterpart].filter(Boolean), 6, {
                        kind: 'commitment', id: item.id, action
                    });
                }
            }
            return out;
        }
        recordSeedFact(input = {}) {
            const api = (typeof window !== 'undefined' && window.LonShaSeedLedger) || null;
            if (!api || !this.worldProg) return null;
            const action = String(input.action || 'plant');
            const current = this.worldProg.seedLedger;
            const call = action === 'advance' ? api.advance
                : action === 'recover' ? api.recover
                : action === 'cancel' ? api.cancel
                : action === 'sweep' ? api.sweep
                : action === 'remove' ? api.remove
                : api.plant;
            const out = action === 'sweep' ? call(current, input.floor) : call(current, input);
            if (out && out.ok && out.changed) this.worldProg.seedLedger = out.state;
            return out;
        }
        // [v3.196] 平行事实账本：宿主写入入口，状态存 worldProg.parallelLedger
        recordParallelFact(input = {}) {
            const api = (typeof window !== 'undefined' && window.LonShaParallelLedger) || null;
            if (!api || !this.worldProg) return null;
            const action = String(input.action || 'note');
            const current = this.worldProg.parallelLedger;
            const call = action === 'touch' ? api.touch
                : action === 'settle' ? api.settle
                : action === 'drop' ? api.drop
                : action === 'sweep' ? api.sweep
                : action === 'remove' ? api.remove
                : api.note;
            const out = action === 'sweep' ? call(current, input.floor) : call(current, input);
            if (out && out.ok && out.changed) this.worldProg.parallelLedger = out.state;
            return out;
        }
        /* [v3.196] 秘密账本：宿主写入入口，状态存 worldProg.secretLedger。
         * [v3.306.0 · M-O8] 本入口此前**全仓零调用点**（秘密账本在真实运行里永远为空）；
         *   本版由 onMessageReceived 的 secrets 提取通道消费（与 knowledge_changes 同路）。
         *   seal 另收 `knowers`（已经知道的人）：它在**读侧**划边界，与写侧的 keeper
         *   （还不知情的人）是两份互不同形的名单 —— 理由见 secret-ledger.js 头注。 */
        recordSecretFact(input = {}) {
            const api = (typeof window !== 'undefined' && window.LonShaSecretLedger) || null;
            if (!api || !this.worldProg) return null;
            const action = String(input.action || 'seal');
            const current = this.worldProg.secretLedger;
            const call = action === 'advance' ? api.advance
                : action === 'reveal' ? api.reveal
                : action === 'drop' ? api.drop
                : action === 'sweep' ? api.sweep
                : action === 'remove' ? api.remove
                : api.seal;
            const out = action === 'sweep' ? call(current, input.floor) : call(current, input);
            if (out && out.ok && out.changed) this.worldProg.secretLedger = out.state;
            return out;
        }
        // [v3.197] 前文回扣账本：宿主写入入口，状态存 worldProg.recallEcho
        recordRecallEcho(input = {}) {
            const api = (typeof window !== 'undefined' && window.LonShaRecallEcho) || null;
            if (!api || !this.worldProg) return null;
            const action = String(input.action || 'mark');
            const current = this.worldProg.recallEcho;
            const call = action === 'echo' ? api.echo
                : action === 'skip' ? api.skip
                : action === 'sweep' ? api.sweep
                : api.mark;
            const out = action === 'sweep' ? call(current, input.floor) : call(current, input);
            if (out && out.ok && out.changed) this.worldProg.recallEcho = out.state;
            return out;
        }
        // [v3.197] 回声账本：宿主写入入口，状态存 worldProg.echoLedger
        recordEchoLife(input = {}) {
            const api = (typeof window !== 'undefined' && window.LonShaEchoLedger) || null;
            if (!api || !this.worldProg) return null;
            const action = String(input.action || 'produce');
            const current = this.worldProg.echoLedger;
            const out = action === 'reset' ? api.reset(current)
                : api.produce(current, input);
            if (out && out.ok && out.changed) this.worldProg.echoLedger = out.state;
            return out;
        }
        readWorldLedger(opts = {}) {
            try {
                if (!this.clock || typeof this.clock.readWorldLedger !== 'function') return null;
                // [v3.208.0] 本地投影改走**声明式管线**（projection-pipeline.js）：
                //   两个投影进登记表，三者一次收齐读数（ok / 源空 / 缺 + 原因）。
                //   为什么非改不可：手工两次调用时「漏接了一个投影」与「那个投影本轮为空」
                //   在读数上完全同形——下游 diffPeople 于是把「查不出来」当成「两边一致」。
                const pipe = this._runProjections();
                // [v3.212.0] L-F5：管线读数同时装成**对外投影**（读侧同时刻刷新，下游与对读面
                //   看到的是同一份读数，不会出现「对读面说 6/6、下游拿到 5 项」这种两份真相）。
                this._buildProjectionEnvelope();
                return this.clock.readWorldLedger(null, {
                    reason: opts.reason || 'host-ledger',
                    win: opts.win,
                    localPeople: this._localPeopleLocations(),
                    localFacts: this._localFactKeys(),
                    // 管线读数随 opts 下传（纯读数，对读面可忽略；诊断面/测试用它归因）
                    projection: pipe
                });
            } catch (e) { errLog(e, 'plugin.readWorldLedger'); return null; }
        }
        /**
         * [v3.208.0] 跑一次投影管线（声明式登记 + 三态读数 + 缺席原因）。
         * 提供器只负责「怎么取值」，登记表负责「有哪些投影、服务哪个对读面、空值形状」。
         * 管线缺席（模块未加载）时返回 null —— 不伪造成「投影全空」，两者处置相反。
         */
        _runProjections(opts = {}) {
            try {
                const P = _projectionLib();
                if (!P || typeof P.runPipeline !== 'function') { this._lastProjection = null; return null; }
                const pipe = P.runPipeline({
                    peopleLocations: () => this._localPeopleLocations(),
                    factKeys: () => this._localFactKeys(),
                    characterNames: () => {
                        const chars = (this.status && this.status.characters && typeof this.status.characters === 'object')
                            ? this.status.characters : null;
                        return chars ? Object.keys(chars) : [];
                    },
                    clockDay: () => {
                        // 本插件侧剧情日（世界钟对读的另一半）。取不到返回 null ⇒ 记 empty（源明确说「没有」），
                        // 不是 absent —— 因为「时钟接了但今天没记」与「时钟压根没接」处置不同。
                        const c = this.clock;
                        if (!c || typeof c.export !== 'function') return null;
                        const ex = c.export() || {};
                        const day = (ex.day !== undefined && ex.day !== null) ? ex.day : (ex.storyDay || null);
                        return (day === undefined) ? null : day;
                    },
                    promiseKeys: () => {
                        const wp = (this.worldProg && typeof this.worldProg.export === 'function') ? this.worldProg.export() : null;
                        const out = [];
                        if (wp && Array.isArray(wp.promises)) {
                            for (const p of wp.promises) {
                                const t = String((p && (p.title || p.key || p.id)) || '').trim();
                                if (t) out.push(t.slice(0, 40));
                            }
                        }
                        if (wp && wp.seedLedger && Array.isArray(wp.seedLedger.items)) {
                            for (const it of wp.seedLedger.items) {
                                const t = String((it && (it.hook || it.eventKey)) || '').trim();
                                if (t) out.push(t.slice(0, 40));
                            }
                        }
                        return out;
                    },
                    knowledgeOwners: () => {
                        const chars = (this.charMem && typeof this.charMem.export === 'function') ? this.charMem.export() : null;
                        if (!chars || typeof chars !== 'object') return {};
                        const out = {};
                        for (const name of Object.keys(chars)) {
                            const rec = chars[name];
                            const known = (rec && Array.isArray(rec.knows)) ? rec.knows
                                : ((rec && Array.isArray(rec.facts)) ? rec.facts : []);
                            if (known.length) out[name] = known.map((x) => String(x && (x.key || x.text || x) || '').slice(0, 40)).filter(Boolean);
                        }
                        return out;
                    },
                }, { nowProvider: () => Date.now() });
                this._lastProjection = pipe;
                /* [v3.270.0 · B2/X1] 容量预演随管线读数一起产出（纯读，只用于外供）。
                 *   为何挂这里而不是 envelope 构建里：envelope 是**搬运**面（只搬值、不取值），
                 *   取数与复算属宿主职责——两处分工与 v3.212 的既有划分一致。 */
                try { pipe.prediction = this._projectionPrediction(); } catch (e) { errLog(e, 'plugin._runProjections.prediction'); }
                /* [v3.289.0 · X3] 策略对照同样随管线产出。与预演**同源**：它内部先取预演，
                 *   预演不可测时返回 null（＝没跑），不伪造一份「零差异」的对照。 */
                try { pipe.strategyCompare = this._projectionStrategyCompare(); } catch (e) { errLog(e, 'plugin._runProjections.strategyCompare'); }
                return pipe;
            } catch (e) { errLog(e, 'plugin._runProjections'); this._lastProjection = null; return null; }
        }
        /**
         * [v3.212.0] L-F5：本插件侧账本的**对外投影**（供 RubyPhone 消费的稳定契约）。
         *
         * 修前实测：`_runProjections()` 的读数只随 `readWorldLedger()` 的 opts 下传一次，
         *   之后**零外供** —— 下游只能去解析桥快照里的账本内部字段（而契约明确要求
         *   下游「只消费投影、不依赖账本内部字段」）。本方法补上出口。
         *
         * 三条纪律：
         *   · 只搬值 + 归因：items 是值本体，三态/缺席原因/耗时全部进 sourceLedger；
         *   · 不猜身份：scope 三键**只从真实来源取**，取不到即 null（不硬编「conversation-1」）；
         *   · 不抛：envelope 构建失败时返回 null 并留痕，绝不让它连坐快照刷新。
         *
         * @returns {object|null} envelope；模块缺席 / 构建失败时为 null（＝「没跑」，不是「投影全空」）
         */
        _buildProjectionEnvelope() {
            try {
                const P = _projectionLib();
                if (!P || typeof P.buildEnvelope !== 'function') return null;
                // 身份来源（真实，缺即 null）：
                //   conversationId —— 宿主当前会话（取不到说明还没进对话）
                //   worldId        —— 世界账本由上游世界桥定义，本插件侧只认桥名（自述，不冒充）
                //   sceneId        —— 场景树当前位置键（未登记任何场所时为 null）
                let chatId = null;
                try { chatId = (typeof this.getCurrentChatId === 'function') ? (this.getCurrentChatId() || null) : null; } catch (_e1) { chatId = null; }
                let sceneKey = null;
                try { sceneKey = (this.scene && typeof this.scene.currentKey === 'function') ? (this.scene.currentKey() || null) : null; } catch (_e2) { sceneKey = null; }
                const scope = {
                    conversationId: chatId,
                    sceneId: sceneKey,
                    worldId: (this.clock && typeof this.clock.readWorldLedger === 'function') ? 'world-ledger' : null
                };
                // revision 取**变更栅栏号**（_mutationEpoch，回滚/恢复/切聊递增，全仓 10 处引用）
                //   —— 它是本仓既有的「状态变更代数」真源；不新造计数（那会与栅栏各记一套）。
                const env = P.buildEnvelope(this._lastProjection, {
                    scope,
                    revision: Number(this._mutationEpoch) || 0,
                    reason: 'bridge-snapshot'
                });
                this._lastProjectionEnvelope = env;
                return env;
            } catch (e) { errLog(e, 'plugin._buildProjectionEnvelope'); this._lastProjectionEnvelope = null; return null; }
        }

        // [v3.369.0] 提示词注入装配管线与上下文快照委托桩 (从 index.js 剥离至 engine-injection-pipeline.js)
        _worldbookOccupancy(...args) { const M = _moduleLib(() => window.LonShaEngineInjectionPipeline, 'engine-injection-pipeline.js'); return M ? M._worldbookOccupancy(this, ...args) : this._injectionPipelineAbsent('_worldbookOccupancy'); }
        _projectionPrediction(...args) { const M = _moduleLib(() => window.LonShaEngineInjectionPipeline, 'engine-injection-pipeline.js'); return M ? M._projectionPrediction(this, ...args) : this._injectionPipelineAbsent('_projectionPrediction'); }
        _projectionStrategyCompare(...args) { const M = _moduleLib(() => window.LonShaEngineInjectionPipeline, 'engine-injection-pipeline.js'); return M ? M._projectionStrategyCompare(this, ...args) : this._injectionPipelineAbsent('_projectionStrategyCompare'); }
        buildBridgeSnapshot(...args) { const M = _moduleLib(() => window.LonShaEngineInjectionPipeline, 'engine-injection-pipeline.js'); return M ? M.buildBridgeSnapshot(this, ...args) : this._injectionPipelineAbsent('buildBridgeSnapshot'); }
        buildBridgeSnapshotJson(...args) { const M = _moduleLib(() => window.LonShaEngineInjectionPipeline, 'engine-injection-pipeline.js'); return M ? M.buildBridgeSnapshotJson(this, ...args) : this._injectionPipelineAbsent('buildBridgeSnapshotJson'); }
        _summarizeRecallAudit(...args) { const M = _moduleLib(() => window.LonShaEngineInjectionPipeline, 'engine-injection-pipeline.js'); return M ? M._summarizeRecallAudit(this, ...args) : this._injectionPipelineAbsent('_summarizeRecallAudit'); }
        buildInjection(...args) { const M = _moduleLib(() => window.LonShaEngineInjectionPipeline, 'engine-injection-pipeline.js'); return M ? M.buildInjection(this, ...args) : this._injectionPipelineAbsent('buildInjection'); }
        _injectionRecord(...args) { const M = _moduleLib(() => window.LonShaEngineInjectionPipeline, 'engine-injection-pipeline.js'); return M ? M._injectionRecord(this, ...args) : this._injectionPipelineAbsent('_injectionRecord'); }
        _injectionBlocksOf(...args) { const M = _moduleLib(() => window.LonShaEngineInjectionPipeline, 'engine-injection-pipeline.js'); return M ? M._injectionBlocksOf(this, ...args) : this._injectionPipelineAbsent('_injectionBlocksOf'); }
        _injectionStage(...args) { const M = _moduleLib(() => window.LonShaEngineInjectionPipeline, 'engine-injection-pipeline.js'); return M ? M._injectionStage(this, ...args) : this._injectionPipelineAbsent('_injectionStage'); }
        _injectionCommit(...args) { const M = _moduleLib(() => window.LonShaEngineInjectionPipeline, 'engine-injection-pipeline.js'); return M ? M._injectionCommit(this, ...args) : this._injectionPipelineAbsent('_injectionCommit'); }
        ['_injectionClose'](...args) { const M = _moduleLib(() => window.LonShaEngineInjectionPipeline, 'engine-injection-pipeline.js'); return M ? M['_injectionClose'](this, ...args) : this._injectionPipelineAbsent('_injectionClose'); }
        _injectionEnd(...args) { const M = _moduleLib(() => window.LonShaEngineInjectionPipeline, 'engine-injection-pipeline.js'); return M ? M._injectionEnd(this, ...args) : this._injectionPipelineAbsent('_injectionEnd'); }
        _injectionRefOf(...args) { const M = _moduleLib(() => window.LonShaEngineInjectionPipeline, 'engine-injection-pipeline.js'); return M ? M._injectionRefOf(this, ...args) : this._injectionPipelineAbsent('_injectionRefOf'); }
        _injectionDiscardStale(...args) { const M = _moduleLib(() => window.LonShaEngineInjectionPipeline, 'engine-injection-pipeline.js'); return M ? M._injectionDiscardStale(this, ...args) : this._injectionPipelineAbsent('_injectionDiscardStale'); }
        _buildDiagnosticsInjection(...args) { const M = _moduleLib(() => window.LonShaEngineInjectionPipeline, 'engine-injection-pipeline.js'); return M ? M._buildDiagnosticsInjection(this, ...args) : this._injectionPipelineAbsent('_buildDiagnosticsInjection'); }
        buildInjectionReadout(...args) { const M = _moduleLib(() => window.LonShaEngineInjectionPipeline, 'engine-injection-pipeline.js'); return M ? M.buildInjectionReadout(this, ...args) : this._injectionPipelineAbsent('buildInjectionReadout'); }

        _injectionPipelineAbsent(reason) {
            return {
                ok: false,
                absent: true,
                op: String(reason || 'unknown'),
                reason: 'engine-injection-pipeline.js not loaded'
            };
        }

        /* [v3.235.0] R4-A：**回滚预览（dry-run）** —— 破坏之前先看得见。
         *   为什么需要：`rollbackFloor` 有三个真宿主调用点（MESSAGE_EDITED / MESSAGE_SWIPED /
         *   删楼），全部**先删后报**：`_lastReplayReport` 只回答「刚才撤了多少」，而用户
         *   在按下删除时无从预知。v3.9 废除级联销毁后删楼是两段式（撤该楼 + 其后整体前移），
         *   旧有告警只在「一次少 5 楼以上」时才响，且只说「可能不完整」。
         *   本方法**纯读**：不调任何 owner.drop / owner.shift（那两个会真删真改），
         *   只走 owner.get + 形状扫描 + 面清单。返回：
         *     { version, floor, module, skipped, drop, shift }
         *   分态口径（本仓老账：「没给」与「给了第 0 楼」不同形）：
         *     · 模块缺席      ⇒ module:'absent'，skipped 说明
         *     · 没给楼层      ⇒ skipped:'floor-not-given'，**不动第 0 楼**
         *     · 给了第 0 楼   ⇒ 正常预览（floor: 0 是真读数） */
        previewFloorRollback(floor) {
            const f0 = numOr(floor, null);
            let _lr = null;
            try { _lr = _ledgerReplayLib(); } catch (e) { _lr = null; }
            if (!_lr) return { version: 0, floor: (f0 === null ? null : f0), module: 'absent', skipped: 'module-unavailable', drop: null, shift: null };
            const _ver = Number(_lr.LEDGER_REPLAY_VERSION) || 1;
            if (f0 === null) return { version: _ver, floor: null, module: 'present', skipped: 'floor-not-given', drop: null, shift: null };
            const out = { version: _ver, floor: f0, module: 'present', skipped: null, drop: null, shift: null };
            try { out.drop = (typeof _lr.previewDrop === 'function') ? _lr.previewDrop(this, f0) : null; } catch (e) { errLog(e, 'previewFloorRollback.drop'); }
            try { out.shift = (typeof _lr.previewShift === 'function') ? _lr.previewShift(this, f0) : null; } catch (e) { errLog(e, 'previewFloorRollback.shift'); }
            return out;
        }

        // [v2.0] P2: 楼层账本回滚（删楼/重生成后把该楼层产生的记忆撤掉）
        rollbackFloor(floor) {
            // [v3.224.0] O-2：**入口先判「给没给」**。修前这里没有门，`rollbackFloor(null)` 会被
            //   下游约 38 处 `Number(floor) || 0` / `Math.round(Number(floor) || 0)` 读成第 0 楼，
            //   于是「宿主没给楼层」变成「把第 0 楼及其派生记录撤掉」——一次静默的错误回滚，
            //   而返回值照常是条数（看着像成功）。这是 O-1 在场所面修掉的同一形态在宿主面的实例。
            const _f0 = numOr(floor, null);
            if (_f0 === null) return 0;
            floor = _f0;
            try {
                if (!this.config.config.floorLedgerEnabled) {
                    // [v3.190] 关掉账本 ⇒ 不自动回滚，但**要留痕**：否则「关掉了」与「跑了没账可撤」
                    //   同形，诊断面会以为回滚执行过。回放报告带 skipped 分态。
                    this._lastReplayReport = { version: 1, side: 'drop', floor: Number(floor), items: [], dropped: 0, shifted: 0, threw: 0, absent: 0, skipped: 'floor-ledger-disabled' };
                    return 0;
                }
                // [v3.190] 登记表回放提到「有无账本记录」这个门控**之前**。
                //   此前账本记录缺失（该楼从未提取 / 记录已被上限淘汰）会在下面直接 return 0，
                //   把 v3.182 加在函数尾部的回放收口一起跳过——登记表恰恰在最需要它的那条路径上
                //   成了死声明，而回放报告仍说「29 本账走完了回放」。回放自身分态
                //   （absent / threw / no-op），它并不依赖账本记录是否存在。
                try {
                    const _lr = _ledgerReplayLib();
                    const _rep = (_lr && typeof _lr.replayDrop === 'function')
                        ? _lr.replayDrop(this, floor)
                        : { version: 0, side: 'drop', floor: Number(floor), items: [], dropped: 0, shifted: 0, threw: 0, absent: 0 };
                    this._lastReplayReport = _rep;
                    if (_rep.threw && this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 账本回放：${_rep.threw} 本账撤楼失败`);
                } catch (e) { errLog(e, 'rollbackFloor.账本回放'); }
                const entry = this.ledger.get(floor);
                if (!entry) {
                    // [v3.155] 缺失分两种：① 该楼从未提取（正常）；② 账本记录已被上限淘汰（**回滚能力失效**）。
                    //   旧写法一律静默 return 0，第二种情况用户永远不知道自己的旧楼无法回滚了。
                    const _evictedOut = Number(floor) < (this.ledger.evictedFloorMax || -1);
                    if (_evictedOut) {
                        this._ledgerMissingRollbacks = (this._ledgerMissingRollbacks || 0) + 1;
                        try { this.opLog?.log?.('ledger', 'rollback-miss', String(floor), Number(floor), '账本记录已淘汰，无法按楼回滚'); } catch (e) {}
                        if (this.config.config.floorLedgerEvictionDebug) console.warn(`[${PLUGIN_NAME}] 回滚失效: 第${floor}楼账本记录已被上限淘汰（累计失效 ${this._ledgerMissingRollbacks} 次）`);
                    }
                    return 0;
                }
                this._bumpEpoch('rollback-floor-' + floor);   // [v3.145] CP-L6: 回滚即变更，作废在飞提取
                // 回滚节点（该楼新增的图谱节点）
                // [v3.6] 升级: ① character 节点长寿命——删前检查后续摘要是否仍提及该角色，提及则保留；
                //          ② 删完统一 rebuildNameIndex（原实现只 clear 不重建，名称查询全失效）
                const keepIds = new Set();
                for (const id of (entry.nodeIds || [])) {
                    const node = this.graph.nodes.get(id);
                    if (!node) continue;
                    if (node.type === 'character') {
                        try {
                            const laterTexts = (this.summary?.summaries || []).filter(s => (s.floor || 0) > floor).map(s => s.text || '').join('\n');
                            const nameHit = node.name && laterTexts.includes(node.name);
                            if (nameHit) { keepIds.add(id); continue; }   // 后续剧情仍提及 → 保留（长寿命实体）
                        } catch (e) { errLog(e, 'nonfatal') }
                    }
                    this.graph.nodes.delete(id);
                    for (const [eid, e] of Array.from(this.graph.edges)) {
                        if (e.from === id || e.to === id) this.graph.edges.delete(eid);
                    }
                }
                this.graph.rebuildNameIndex();
                // [v3.15] 图谱楼层截断回溯（收编 zhino）: 删楼后用楼层前状态重建（truncateGraphFrom 内部会再 rebuildNameIndex）
                try {
                    if (this.graph?.rollbackGraphFrom) this.graph.rollbackGraphFrom(floor);
                    else this.graph.truncateGraphFrom(floor);
                } catch (e) { errLog(e, 'rollbackFloor.图谱回溯'); }
                // [v3.17] 世界推进对账（yuzuki）+ 丢弃 pending（shujuku 拒绝半提交）: 删楼后过期推进失活
                try { if (this.worldProg) { this.worldProg.discard(); this.worldProg.reconcile(floor - 1); } } catch (e) { errLog(e, 'rollbackFloor.世界推进对账'); }
                // [v3.85] WorldProgress/OutlineDirector 回滚（删楼撤销该楼来源，计划本体保留）。
                try { this.worldProg?.removeByFloor?.(floor); } catch (e) { errLog(e, 'rollbackFloor.WorldProgress回滚'); }
                try { this.outline?.rollbackFloor?.(floor); } catch (e) { errLog(e, 'rollbackFloor.OutlineDirector回滚'); }
                // [v3.22] 角色记忆银行 + 场外信号 楼层清理（rollback 未清 → 旧记忆残留）
                try { if (this.charMem?.removeByFloor) this.charMem.removeByFloor(floor); } catch (e) { errLog(e, 'rollbackFloor.charMem清理'); }
                try { this.clearThinkingSignalsByFloor(floor); } catch (e) { errLog(e, 'rollbackFloor.场外信号清理'); }
                // [v3.25.1] rollbackFloor 归档状态处理（[v3.115] 修复：原为全清 .clear()，
                //             但被回滚楼层之前的归档仍有效——全清会导致它们永远无法被恢复。
                //             现改为精确校正：只丢弃 >= floor 的归档（这些楼层的记忆已被回滚撤销），
                //             保留 < floor 的归档（仍被有效卷摘要覆盖）。
                // [v3.190] 改由登记表执行（登记项 id: archived，借库或内联两条路径行为等价）。
                //   判据不再盯宿主源码里的字面调用，而是盯登记表本身——宿主只负责把库交出去。
                try {
                    const _archOwn = _ledgerReplayLib()?.FLOOR_OWNERS?.find?.(o => o.id === 'archived');
                    if (_archOwn && typeof _archOwn.drop === 'function') _archOwn.drop(this, floor);
                } catch (e) { errLog(e, 'rollbackFloor.归档状态精确清理'); }
                if (keepIds.size && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 回滚: 保留 ${keepIds.size} 个长寿命角色节点`);
                // 回滚 POV
                const povIdSet = new Set(entry.povIds || []);
                this.pov.povs = this.pov.povs.filter(p => !povIdSet.has(p.id));
                // 回滚时间线
                const tlIdSet = new Set(entry.timelineIds || []);
                this.timeline.entries = this.timeline.entries.filter(t => !tlIdSet.has(t.id));
                // [v2.3] RD: 状态回滚——[v3.9] 改单楼语义（原 < floor 级联：编辑单楼会摧毁后续所有楼的 status 记忆）
                try {
                    if (this.status?.ops?.length) {
                        this.status.ops = this.status.ops.filter(o => o.floor !== floor);
                        this.status.rebuildFromOps();
                    }
                } catch (e) { errLog(e, 'rollbackFloor.节点清理'); }
                // [v2.4] RE: 场景树回滚——[v3.9] 改单楼语义（同上，原 rollbackFrom 级联过滤）
                try {
                    if (this.config.config.sceneEnabled && this.scene?.opsLog?.length) {
                        this.scene.rollbackFloorOnly(floor);
                        // [v3.181] SG：删楼后在场索引里停在「已删楼层」的人必须出局
                        //   （否则「谁在何处」会指向一个已经不存在的时刻）。
                        // [v3.221.0] R3-D：**粒度收回到模块内按楼层清**。修前这里是一句
                        //   `clearPresence?.()`（整表全清）：删掉第 7 楼，连第 9 楼那批人的
                        //   所在一起抹掉了 —— 单楼语义被悄悄扩成全清，而回放报告只说「走完了」。
                        //   现在按楼层清的职责在 scene 的 rollbackFloorOnly 内（谁停在已删楼层谁出局），
                        //   宿主不再拥有「清多少人」的决定权。

                    }
                } catch (e) { errLog(e, 'rollbackFloor.status回滚'); }
                // [v2.7] RS: 日记/向量回滚（补最后两个缺口，至此全部子系统楼层可回滚）
                                // [v3.54] op-log: 回滚事件（审计链）
                this.opLog?.log('rollback', 'remove', `floor ${floor}`, floor, 'edit/delete');
try { if (Number.isFinite(Number(this._timelineInjectFloor)) && Number(this._timelineInjectFloor) >= Number(floor)) this._timelineInjectFloor = Math.max(-1, Number(floor) - 1); this._timelineCursorFingerprint = ''; } catch (e) { errLog(e, 'rollbackFloor.时间线游标回滚'); }
                try { if (Number.isFinite(Number(this._diaryInjectFloor)) && Number(this._diaryInjectFloor) >= Number(floor)) this._diaryInjectFloor = Math.max(-1, Number(floor) - 1); } catch (e) { errLog(e, 'rollbackFloor.日记游标回滚'); }   // [v3.126] 删楼/swipe/编辑回滚同步回退日记游标（与时间线游标同语义：游标之上的楼层重生成后其新日记需重新注入）
                try { const nd = this.diary?.removeByFloor ? this.diary.removeByFloor(floor) : 0; if (nd && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 日记回滚: ${nd}条`); } catch (e) { errLog(e, 'rollbackFloor.日记回滚'); }
                try { const nm2 = this.moneyLedger?.removeByFloor ? this.moneyLedger.removeByFloor(floor) : 0; if (nm2 && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 钱财流水回滚: ${nm2}条`); } catch (e) { errLog(e, 'rollbackFloor.钱财回滚'); }
                try { const nc = this.cards?.removeByFloor ? this.cards.removeByFloor(floor) : 0; if (nc && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 卡牌回滚: ${nc}张`); } catch (e) { errLog(e, 'rollbackFloor.卡牌回滚'); }
                // [v3.184] 变更集楼层联动：该楼的行级 before/after 一并作废。
                //   不摘的后果不是报错，是**读数撒谎**：删楼之后自检仍会报「第 12 楼把好感 3→8」，
                //   而那个楼层已经不存在了——诊断面指着一段被撤销的历史，比没有读数更糟。
                try { const ncs2 = _changeset()?.removeByFloor?.(floor) || 0; if (ncs2 && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 变更集回滚: ${ncs2}行`); } catch (e) { errLog(e, 'rollbackFloor.变更集回滚'); }
                try { const ncf = this.conflicts?.removeByFloor ? this.conflicts.removeByFloor(floor) : 0; if (ncf && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 矛盾回滚: ${ncf}条`); } catch (e) { errLog(e, 'rollbackFloor.矛盾回滚'); }
                // [v3.67] A: 正史增量回滚（删楼/重生成后该楼层的增量事实撤掉，防幽灵事实）
                try { const ndb = this.deltaBook?.removeByFloor ? this.deltaBook.removeByFloor(floor) : 0; if (ndb && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 📒 正史增量回滚: ${ndb}条`); } catch (e) { errLog(e, 'rollbackFloor.正史增量回滚'); }
                // [v3.82] A: 生活小档案回滚（删楼后该楼来源的偏好/习惯撤掉，防幽灵条目）
                try { const nld = this.status?.removeLifeDetailByFloor ? this.status.removeLifeDetailByFloor(floor) : 0; if (nld && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🧬 生活小档案回滚: ${nld}条`); } catch (e) { errLog(e, 'rollbackFloor.生活小档案回滚'); }
                // [v3.94] CSE 回滚 + [v3.95] 叙事心电图回滚（挂生活小档案之后，保持 deltaBook→lifeDetail 紧邻断言窗口）
                try { const ncs = this.cse?.removeByFloor ? this.cse.removeByFloor(floor) : 0; if (ncs && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🧠 CSE 回滚: ${ncs}条`); } catch (e) { errLog(e, 'rollbackFloor.cse回滚'); }
                try { const npl = this.pulse?.removeByFloor ? this.pulse.removeByFloor(floor) : 0; if (npl && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 💓 叙事心电图回滚: ${npl}拍`); } catch (e) { errLog(e, 'rollbackFloor.叙事心电图回滚'); }
                // [v3.96] STM/LTM 楼层级联清理（挂 pulse 之后，远离 deltaBook→lifeDetail 紧邻窗口）
                try { if (this.stmLtm && this._stmLtmState) { this._stmLtmState = this.stmLtm.removeByFloors(this._stmLtmState, [floor]); } } catch (e) { errLog(e, 'rollbackFloor.stmLtm清理'); }
                // [v3.83] A: 主角档案楼层指针回滚（来源楼层被删时指针失效归零，防幽灵楼层）
                try { const npf = this.status?.removeProtagonistByFloor ? this.status.removeProtagonistByFloor(floor) : 0; if (npf && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🧍 主角档案指针回滚`); } catch (e) { errLog(e, 'rollbackFloor.主角档案指针回滚'); }
                // [v3.84] B: 人设偏移楼层回滚（来源楼被删→偏移清空，防幽灵偏移）
                try { const ndr = this.status?.removeDriftByFloor ? this.status.removeDriftByFloor(floor) : 0; if (ndr && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🎭 人设偏移回滚: ${ndr}条`); } catch (e) { errLog(e, 'rollbackFloor.人设偏移回滚'); }
                try { const npm = this.pairMem?.removeByFloor ? this.pairMem.removeByFloor(floor) : 0; if (npm && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 群像回滚: ${npm}条`); } catch (e) { errLog(e, 'rollbackFloor.群像回滚'); }
                try { const nv = this.vector?.removeByFloor ? this.vector.removeByFloor(floor) : 0; if (nv && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 向量回滚: ${nv}条`); } catch (e) { errLog(e, 'rollbackFloor.向量回滚'); }
                // [v2.8] RT: 物品台账回滚（ops真源过滤+重放）+ 反思条目回滚
                try { const ni = this.rollbackItemsFrom ? this.rollbackItemsFrom(floor) : 0; if (ni && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 台账对账: 清理 ${ni} 条失效ops`); } catch (e) { errLog(e, 'rollbackFloor.台账对账'); }
                try { if (this.reflection?.items?.length) this.reflection.items = this.reflection.items.filter(r => r.floor !== floor); } catch (e) { errLog(e, 'rollbackFloor.反思回滚'); }
                // [v2.2] RC: 回滚该楼层登记/了结的悬念簿条目
                try {
                    if (this.suspense.items.length) {
                        const before = this.suspense.items.length;
                        this.suspense.items = this.suspense.items.filter(x => x.floor !== floor && x.resolvedFloor !== floor);
                        if (this.suspense.items.length !== before && this.config.config.debugMode) {
                            console.log(`[${PLUGIN_NAME}] 悬念簿回滚: 清除 ${before - this.suspense.items.length} 条 (楼层 ${floor})`);
                        }
                    }
                } catch (e) { errLog(e, 'rollbackFloor.悬念回滚'); }
                // 回滚该楼层摘要
                this.summary.summaries = this.summary.summaries.filter(s => s.floor !== floor);
                // [v2.2] RB: 楼层回滚联动 RubyPhone 手机记忆 (幂等, 桥不在时静默跳过)
                try {
                    const rb = window.VirtualPhone?.lonshaBridge;
                    if (rb?.onFloorRollback) rb.onFloorRollback(floor);
                } catch (e) { errLog(e, 'rollbackFloor.手机记忆联动'); }
                // 移除账本记录
                this.ledger.remove(floor);
                // 重建 BM25 索引
                try {
                    if (this.config.config.bm25Enabled) {
                        { const _docs = this.summary.getActiveSummaries().map(s => ({id: 'sum_' + s.floor, text: s.text, floor: s.floor, source: 'bm25'})); const _fp = _docs.map(d => d.id + ':' + hash32(d.text)).join('|'); if (_fp !== this.bm25._corpusFp) { this.bm25.rebuild(_docs); this.bm25._corpusFp = _fp; } }
                    }
                } catch (e) { errLog(e, 'rollbackFloor.BM25重建'); }
                if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 楼层 ${floor} 记忆已回滚`);
                // [v3.182 → v3.190] LR: 删楼回放已上移到「有无账本记录」门控之前（见函数开头）。
                //   留在这里的版本只在门控通过时才跑，账本记录缺失的路径上整段跳过——
                //   同一个动作两处调用，就必然有一处是死的。这里只留说明，不留第二次调用。
                // [v3.19] 删楼后书签重同步（ruby resyncAfterDeletion）: 楼层序数前移，书签补偿
                try {
                    if (this.bookmarks) {
                        const curCount = (window.SillyTavern?.getContext?.()?.chat?.length) || 0;
                        const changed = this.bookmarks.resyncAfterDeletion([Number(floor) || 0], curCount);
                        if (changed.length && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 书签重同步: ${changed.join(', ')}`);
                    }
                } catch (e) { errLog(e, 'rollbackFloor.书签重同步'); }
                return 1;
            } catch (e) {
                if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 楼层回滚失败:`, e);
                return 0;
            }
        }

        // [v3.9] 删楼后楼层前移重定位：所有子系统中 floor > deleted 的键 -1（数据零丢失——
        // 旧实现把被删楼之后的记忆全部销毁，但这些楼只是位置前移，记忆内容仍对应前移后的文本）
        // [v3.9] 删楼后楼层前移重定位：所有子系统中 floor > deleted 的键 -1（数据零丢失——
        // 旧实现把被删楼之后的记忆全部销毁，但这些楼只是位置前移，记忆内容仍对应前移后的文本）
        //
        // [v3.190] 收口：位移从此**只发生一次**。
        //   此前本方法手抄了一份等价的位移清单（摘要/卷/向量/日记/POV/时间线/悬念/物品/钱财/卡牌/
        //   矛盾/群像/正史增量/生活小档案/主角档案/世界推进/大纲/角色记忆/人设偏移/CSE/心电图/
        //   人设基线/地理/归档/opLog/反思/状态 ops/台账/场景/图谱，约 120 行），v3.182 又在文末接上
        //   登记表回放——**同一批记录被减两次**：删掉第 15 楼后，原本的第 16 楼会变成第 14 楼，
        //   而且不报错、不告警，读数只会安静地指向错楼层。这是「两份事实必然漂移」最坏的那种形态。
        //   现在位移的唯一真源是 ledger-replay.js 的 FLOOR_OWNERS：新增子系统只需登记一次，
        //   漏登记不会静默通过（scan_v3190_lifecycle_collapse.mjs 会点名）。
        //   本方法只保留：① 逐面失败的诊断标签（沿用各面此前的名字，诊断面按名检索仍可命中）；
        //   ② 回放报告的留痕；③ 位移条数的返回。
        shiftFloorsFrom(deleted) {
            const _face = SHIFT_FACE_LABELS;
            let shifted = 0;
            // [v3.224.0] O-2：**入口先判「给没给」**。修前实测 `shiftFloorsFrom(null)` 会经
            //   回放的 `Number(null) === 0` 门把**整树**前移一格（返回 9）。「没给」不是
            //   「删了第 0 楼」：如实跳过并留 skipped 报告（与真回放不同形）。
            const _d0 = numOr(deleted, null);
            if (_d0 === null) {
                this._lastReplayReport = { version: 1, side: 'shift', floor: null, items: [], dropped: 0, shifted: 0, threw: 0, absent: 0, skipped: 'floor-not-given' };
                return 0;
            }
            deleted = _d0;
            // [v3.182] LR: 楼层前移回放收口。与删楼回放同一张登记表、同一个留痕字段。
            try {
                const _lr = _ledgerReplayLib();
                const _rep = (_lr && typeof _lr.replayShift === 'function')
                    ? _lr.replayShift(this, deleted)
                    : { version: 0, side: 'shift', floor: Number(deleted), items: [], dropped: 0, shifted: 0, threw: 0, absent: 0 };
                this._lastReplayReport = _rep;
                shifted = Number(_rep.shifted) || 0;
                // 逐面报失败：回放不中断，但每一面的名字都留在日志里（旧手抄清单的标签由此延续）。
                for (const _it of (_rep.items || [])) {
                    if (_it && _it.state === 'threw') {
                        try { errLog(new Error(String(_it.error || _it.id)), _face[_it.id] || ('shiftFloorsFrom.' + _it.id)); } catch (e) { /* 记账失败不影响前移 */ }
                    }
                }
                if (_rep.absent && this.config?.config?.debugMode) console.log(`[${PLUGIN_NAME}] 账本回放：${_rep.absent} 本账未挂载`);
            } catch (e) { errLog(e, 'shiftFloorsFrom.账本回放'); }
            if (shifted && this.config?.config?.debugMode) console.log(`[${PLUGIN_NAME}] 楼层前移: ${shifted} 条记忆重定位 (deleted=${deleted})`);
            return shifted;
        }

        // [v2.3] RD: 携带背包（抄 baibai carryover——把记忆打包带走，新对话无缝续写）
        packCarryover() {
            // [v3.168] 契约报告单（写侧）：本方法末尾回填实际产出对账。
            this._lastCarryoverReport = { at: Date.now(), produced: [], missingWrite: [], ok: false };
            try {
                const active = this.summary.getActiveSummaries().slice(-40);
                const statusFlat = [];
                for (const [name, rec] of Object.entries(this.status.characters || {})) {
                    for (const [field, value] of Object.entries(rec.fields || {})) {
                        statusFlat.push({ character: name, field, value, reason: '携带自旧对话' });
                    }
                }
                // [v2.7] RS: 全量携带——补 graph/diary/scene/vector/pov（v2.3 版只带摘要+悬念+时间线+状态）
                const _pack = {
                    version: VERSION,   // [v3.11] 硬编码 '2.7.0' → 动态版本
                    summaries: active.map(s => ({ floor: s.floor, text: s.text, level: 1, timestamp: s.timestamp, folded: false })),
                    volumes: [...(this.summary.volumes || [])],
                    suspense: this.suspense.items.filter(x => x.status === 'open'),
                    timeline: [...this.timeline.entries],
                    statusFlat,
                    graph: this.graph.export(),
                    povs: this.pov?.export?.() || [],
                    diary: this.diary?.export?.() || { diaries: {} },
                    reflection: this.reflection?.export?.() || { items: [] },
                    itemOps: this.activeItemOps(),   // [v3.3] 只携带当前有效的 ops（失活项不得以 carried 形式永久化到新对话）
                    scene: this.config.config.sceneEnabled ? this.scene.export() : null,
                    vectors: this.config.config.vectorEnabled ? this.vector.export() : null,
                    // [v3.168] 契约补全：以下 9 键此前**读侧有导入分支、写侧从不产出**。
                    //   v2.3 建立携带包时只有 summaries/volumes/suspense/timeline/statusFlat，
                    //   v2.7「全量携带」补了 graph/povs/diary/reflection/itemOps/scene/vectors——
                    //   而 applyCarryover 的导入分支在后续版本里又陆续加了 9 个子系统，
                    //   却始终没人回头补写侧。于是跨对话续写时：角色状态表（statusFlat 之外
                    //   的结构化字段）/ 货币账本 / CG 卡 / 矛盾簿 / 正史增量 / 人物状态 / 叙事心电图 /
                    //   事件溯源日志 / 大纲导演 / 配对记忆——全部留在旧对话。
                    moneyLedger: this.moneyLedger?.export?.() || { money: {}, moneyLog: [] },
                    cards: this.cards?.export?.() || { cards: [] },
                    conflicts: this.conflicts?.export?.() || { conflicts: [] },
                    deltaBook: this.deltaBook?.export?.() || { deltas: [] },
                    cse: this.cse?.export?.() || { chars: {} },
                    pulse: this.pulse?.export?.() || { beats: [], arcs: {} },
                    opLog: this.opLog?.export?.() || { entries: [], seq: 0 },
                    outline: this.outline?.export?.() || { stage: null, turnIndex: 0, turnFloor: 0, history: [] },
                    pairMem: this.pairMem?.export?.() || { pairs: [] },
                    // [v3.180] 年龄锚点（主角 + NPC，只带锚点不带年龄）：读侧分支在 v3.180 之前
                    //   一处都没有，本键与 applyCarryover 的承接分支必须成对出现——一侧有分支、
                    //   一侧不产出就是 v3.168 治理过的「死分支」（跨对话静默丢子系统）。
                    ageAnchors: this.status?.exportAgeAnchors?.() || {},
                    // [v3.181] SG：在场索引随跨对话承接（谁在何处是**剧情状态**，不是缓存——
                    //   新对话里主角还没动过，「谁在哪」只能靠上一段接过来）。
                    scenePresence: (this.scene && typeof this.scene.export === 'function')
                        ? (this.scene.export().presence || []) : [],
                    // [v3.194] 事实版本与事件线是**剧情事实**，不是缓存——新对话要接着用。
                    factVersions: this._factVersionState || null,
                    eventThreads: this._eventThreadState || null,
                    // [v3.202] 拓宽面写侧：与契约清单逐键对应（一侧有分支、一侧不产出即死分支）。
                    //   worldProg 一次带走十个子面（active/promises/六账/knowledge/plotArcs）；
                    //   clock 此前只有种子路径带、携带包路径不带——同一机制两条出口口径不同，本版统一。
                    worldProg: this.worldProg?.export?.() || null,
                    clock: this.clock?.export?.() || null,
                    charMem: this.charMem?.export?.() || null,
                    lockedFacts: this.summary?.getLockedFacts?.() || [],
                    lexicon: this.lexicon?.export?.() || null,
                    prequel: this.prequel?.export?.() || { text: '' },
                    supersede: this.supersede?.export?.() || { supersededMap: {} },
                    stmLtm: this._stmLtmState || null,
                    recallArtifacts: Array.isArray(this._recallArtifacts) ? this._recallArtifacts.slice(-32) : [],
                    narrativeEntropy: Number.isFinite(Number(this._narrativeEntropy)) ? Number(this._narrativeEntropy) : 0,
                    timeWentBack: this._timeWentBack ? { ...this._timeWentBack } : null,
                    repairLog: this._repairState || null,
                    counts: {
                        summaries: active.length, suspense: this.suspense.items.filter(x => x.status === 'open').length,
                        graphNodes: this.graph.nodes.size, diaries: Object.values(this.diary?.diaries || {}).reduce((a, b) => a + b.length, 0),
                        vectors: this.config.config.vectorEnabled ? this.vector.vectors.length : 0
                    },
                    packedAt: new Date().toISOString()
                };
                // [v3.168] I3 不变量：写侧产出 ⊇ 契约清单。
                //   必须在**真实产出对象上**核对，而不是让校验方法在真源之外空跑；
                //   本版初稿的 _lastCarryoverReport 从未被填过（校验方法无人调）——
                //   「有对账机制」本身也是一种声称。
                this.verifyCarryoverPack(_pack);
                return _pack;
            } catch (e) { errLog(e, 'packCarryover'); return null; }
        }
        /** [v3.168] 携带契约对账（写侧）：核对实际产出的键是否覆盖契约清单。
         *  返回 {produced, missingWrite, ok}；永不抛出（打包链上的诊断不得反噬主流程）。 */
        verifyCarryoverPack(pack) {
            try {
                const produced = (pack && typeof pack === 'object') ? Object.keys(pack) : [];
                const missingWrite = CARRYOVER_CONTRACT_KEYS.filter(k => !produced.includes(k));
                const report = { at: Date.now(), produced, missingWrite, ok: missingWrite.length === 0 };
                this._lastCarryoverReport = report;
                if (missingWrite.length) {
                    console.warn(`[${PLUGIN_NAME}] ⚠️ 携带包契约缺键 ${missingWrite.length} 个：${missingWrite.join('/')}——这些子系统不会跨对话带走`);
                }
                return report;
            } catch (e) { errLog(e, 'verifyCarryoverPack'); return { at: Date.now(), produced: [], missingWrite: [], ok: false }; }
        }
        // 应用携带包 (新对话开局调用: 摘要/卷/时间线/悬念导入 + 状态重建)
        applyCarryover(pack) {
            try {
                if (!pack) return false;
                if (Array.isArray(pack.summaries) && pack.summaries.length) {
                    this.summary.summaries = pack.summaries.map(s => ({ ...s, folded: false }));
                }
                if (Array.isArray(pack.volumes) && pack.volumes.length) this.summary.volumes = pack.volumes;
                if (Array.isArray(pack.suspense)) this.suspense.import(pack.suspense);
                if (pack.moneyLedger && this.moneyLedger) this.moneyLedger.import(pack.moneyLedger);
                if (pack.cards && this.cards) this.cards.import(pack.cards);
                if (pack.conflicts && this.conflicts) this.conflicts.import(pack.conflicts);
                if (pack.deltaBook && this.deltaBook) this.deltaBook.import(pack.deltaBook);  // [v3.66] 正史增量恢复
                if (pack.cse && this.cse) this.cse.import(pack.cse);  // [v3.94] CSE 人物状态恢复
                if (pack.pulse && this.pulse) this.pulse.import(pack.pulse);  // [v3.95] 叙事心电图恢复
                if (pack.outline && this.outline) this.outline.import(pack.outline);
                if (pack.pairMem && this.pairMem) this.pairMem.import(pack.pairMem);
                if (pack.opLog && this.opLog) this.opLog.import(pack.opLog);
                if (Array.isArray(pack.timeline) && pack.timeline.length) this.timeline.entries = [...pack.timeline];
                if (Array.isArray(pack.statusFlat) && pack.statusFlat.length) {
                    this.status.applyChanges(pack.statusFlat, 0, true);
                }
                // [v3.180] 年龄锚点单独承接：**只带锚点、不带年龄**（与写侧 exportAgeAnchors 同一条纪律）。
                //   只写锚点则原子对不变式不破——目标对象上没有 age 就没有孤儿锚点的展示面：
                //   ageReading 在年龄为空时直接返回空串，锚点只在年龄回来时才参与展示。
                if (pack.ageAnchors && typeof pack.ageAnchors === 'object' && this.status) {
                    try {
                        for (const [nm, av] of Object.entries(pack.ageAnchors)) {
                            const tv = String(av || '').trim();
                            if (!nm || !tv) continue;
                            if (nm === '__protagonist__') this.status.protagonist.ageAnchorTime = tv;
                            else this.status._ensure(nm).ageAnchorTime = tv;
                        }
                    } catch (e) { errLog(e, 'applyCarryover.ageAnchors'); }
                }
                // [v3.181] SG：在场索引承接（**版本字段不得连坐**——这一条是本仓库的既有纪律：
                //   版本号缺失/不匹配只跳过该字段，不得让 status/scene 等实体字段一并丢失）。
                try {
                    if (Array.isArray(pack.scenePresence) && pack.scenePresence.length && this.scene?.setPresence) {
                        for (const row of pack.scenePresence) {
                            if (!Array.isArray(row) || row.length < 2) continue;
                            const _nm = row[0], _rec = row[1];
                            if (!_nm || !_rec || typeof _rec !== 'object') continue;
                            const _path = Array.isArray(_rec.path) && _rec.path.length ? _rec.path : _rec.key;
                            this.scene.setPresence(_nm, _path, _rec.atFloor);
                        }
                    }
                } catch (e) { errLog(e, 'applyCarryover.scenePresence'); }
                // [v2.7] RS: 全量导入（graph/pov/diary/scene/vector，兼容 v2.3 旧包——字段缺失静默跳过）
                try { if (pack.graph?.nodes) this.graph.import(pack.graph); } catch (e) { console.warn('[LonSha] graph导入失败:', e); }
                try { if (Array.isArray(pack.povs) && pack.povs.length && this.pov?.import) this.pov.import(pack.povs); } catch (e) { errLog(e, 'applyCarryover.graph'); }
                try { if (pack.diary && this.diary?.import) this.diary.import(pack.diary); } catch (e) { errLog(e, 'applyCarryover.pov'); }
                try { if (pack.reflection && this.reflection?.import) this.reflection.import(pack.reflection); } catch (e) { errLog(e, 'applyCarryover.diary'); }
                try {
                    if (Array.isArray(pack.itemOps)) {
                        // [v3.155] 纵深：旧写法 `= pack.itemOps.map(o => ({...o, carried:true}))` 是外部输入
                        //   对真源的整体替换——v3.154 只堵了「逐项 push」路径，这里连长度/枚举/类型都不过。
                        //   改为：校验（复用 v3.154 内核）+ 与现有真源**合并**而非替换（替换会静默丢弃本会话已入账的 ops）。
                        const _cv = (this.config.config.ledgerWriteValidationEnabled === false)
                            ? pack.itemOps.filter(o => o && o.name).map(o => ({ ...o, carried: true }))
                            : validateCarriedItems(pack.itemOps).items;
                        const _seen = new Set((this.itemOps || []).map(o => (o && o.key) ? o.key : '').filter(Boolean));
                        let _merged = 0;
                        for (const it of _cv) {
                            const _k = it.key || '';
                            if (_k && _seen.has(_k)) continue;
                            this.itemOps.push(Object.assign({ carried: true }, it));
                            if (_k) _seen.add(_k);
                            _merged++;
                        }
                        if (_merged) this.rebuildItems();
                        if (this.config.config.ledgerWriteValidationDebug) console.warn(`[${PLUGIN_NAME}] 携带包 itemOps: 校验后合并 ${_merged} 条（跳过重复 ${_cv.length - _merged}）`);
                    }
                } catch (e) { errLog(e, 'applyCarryover.itemOps'); }

                try { if (pack.scene && this.scene?.import) this.scene.import(pack.scene); } catch (e) { errLog(e, 'applyCarryover.scene'); }
                try {
                    const _fv = _factVersionLib();
                    if (pack.factVersions && _fv?.normalize) this._factVersionState = _fv.normalize(pack.factVersions);
                    const _ec = _eventCompletenessLib();
                    if (pack.eventThreads && _ec?.normalize) this._eventThreadState = _ec.normalize(pack.eventThreads);
                } catch (e) { errLog(e, 'applyCarryover.v3.194'); }
                // [v3.202] 拓宽面读侧：每项独立 try（一个子系统接口抬头不对不得导致整包撤销）。
                //   版本字段（schemaVersion/producerVersion）缺失只跳过该字段，不连坐实体面——本仓既有纪律。
                try { if (pack.worldProg && this.worldProg?.import) this.worldProg.import(pack.worldProg); } catch (e) { errLog(e, 'applyCarryover.worldProg'); }
                try { if (pack.clock && this.clock?.import) this.clock.import(pack.clock); } catch (e) { errLog(e, 'applyCarryover.clock'); }
                try { if (pack.charMem && this.charMem?.import) this.charMem.import(pack.charMem); } catch (e) { errLog(e, 'applyCarryover.charMem'); }
                try { if (Array.isArray(pack.lockedFacts) && pack.lockedFacts.length) { this.summary.lockedFacts = pack.lockedFacts.slice(); } } catch (e) { errLog(e, 'applyCarryover.lockedFacts'); }
                try { if (pack.lexicon && this.lexicon?.import) { this.lexicon.import(pack.lexicon); this._invalidateBm25Corpus?.(); } } catch (e) { errLog(e, 'applyCarryover.lexicon'); }
                try { if (pack.prequel && this.prequel?.import) this.prequel.import(pack.prequel); } catch (e) { errLog(e, 'applyCarryover.prequel'); }
                try { if (pack.supersede && this.supersede?.import) this.supersede.import(pack.supersede); } catch (e) { errLog(e, 'applyCarryover.supersede'); }
                try { if (pack.stmLtm != null && this.stmLtm?.normalizeState) this._stmLtmState = this.stmLtm.normalizeState(pack.stmLtm); } catch (e) { errLog(e, 'applyCarryover.stmLtm'); }
                try { if (Array.isArray(pack.recallArtifacts) && pack.recallArtifacts.length) this._recallArtifacts = pack.recallArtifacts.slice(-32); } catch (e) { errLog(e, 'applyCarryover.recallArtifacts'); }
                try { if (pack.narrativeEntropy != null && Number.isFinite(Number(pack.narrativeEntropy))) this._narrativeEntropy = Number(pack.narrativeEntropy); } catch (e) { errLog(e, 'applyCarryover.narrativeEntropy'); }
                try { if (pack.timeWentBack && typeof pack.timeWentBack === 'object') this._timeWentBack = { ...pack.timeWentBack }; } catch (e) { errLog(e, 'applyCarryover.timeWentBack'); }
                try { const _rl = _repairLoopLib(); if (pack.repairLog != null && _rl?.normalize) this._repairState = _rl.normalize(pack.repairLog); } catch (e) { errLog(e, 'applyCarryover.repairLog'); }
                try { if (Array.isArray(pack.vectors) && pack.vectors.length) this.vector.import(pack.vectors); } catch (e) { console.warn('[LonSha] 向量导入失败:', e); }
                if (this.config.config.bm25Enabled) {
                    { const _docs = this.summary.getActiveSummaries().map(s => ({id: 'sum_' + s.floor, text: s.text, floor: s.floor, source: 'bm25'})); const _fp = _docs.map(d => d.id + ':' + hash32(d.text)).join('|'); if (_fp !== this.bm25._corpusFp) { this.bm25.rebuild(_docs); this.bm25._corpusFp = _fp; } }
                }
                if (this.config.config.debugMode && pack.counts) {
                    console.log(`[${PLUGIN_NAME}] 携带包导入: 图谱${this.graph.nodes.size}/${pack.counts.graphNodes} 日记${Object.values(this.diary?.diaries || {}).reduce((a, b) => a + b.length, 0)}/${pack.counts.diaries} 向量${this.vector.vectors.length}/${pack.counts.vectors}`);
                }
                // [v3.168] 携带契约对账（读侧）：把「契约要求带的键」与「这个包里实际有的键」
                //   并列。旧包（v2.3/v2.7 格式）会在这里显示缺了哪几个子系统——而不是像修前
                //   那样静默跳过全部 9 个分支、照样 toast「剧情无缝衔接」。
                try {
                    const _have = new Set(Object.keys(pack || {}));
                    const _missingRead = CARRYOVER_CONTRACT_KEYS.filter(k => !_have.has(k));
                    this._lastCarryoverImport = {
                        at: Date.now(), mode: 'legacy-pack',
                        consumed: CARRYOVER_CONTRACT_KEYS.length - _missingRead.length,
                        missingRead: _missingRead, ok: _missingRead.length === 0,
                    };
                    if (_missingRead.length && this.config.config.carryoverContractStrict !== false) {
                        console.warn(`[${PLUGIN_NAME}] ⚠️ 携带包缺少 ${_missingRead.length} 个子系统（${_missingRead.join('/')}）——这些记忆本次无法承接`);
                    }
                } catch (e) { errLog(e, 'applyCarryover.contract'); }
                return true;
            } catch (e) { return false; }
        }
        // [v3.1] SF6: 卷摘要顶部注入
        // [v3.37] Prompt Cache 友好优化：开启 cacheFriendlyInjection 时，顶槽(9999)只写入绝对稳定的【史记】
        // 只要无新史记折叠，顶槽字符串保持绝对恒定，确保大模型持续命中 Prefix Caching！
        buildVolumeInjection() {
            try {
                const his = (this.summary.historical || []).slice(-3);
                const isCacheFriendly = this.config.config.cacheFriendlyInjection !== false;
                const vols = isCacheFriendly ? [] : (this.summary.getActiveVolumes ? this.summary.getActiveVolumes().slice(-3) : (this.summary.volumes || []).slice(-3));
                if (!his.length && !vols.length) return '';
                const parts = [];
                if (his.length) parts.push('【史记·跨阶段总览】' + his.map(h => h.text).join('\n'));
                if (vols.length) parts.push('【周记·阶段概括】' + vols.map(v => `（第${v.floorStart}-${v.floorEnd}楼）${v.text}`).join('\n'));
                return `\n〔前情总览｜早期剧情层级概括，细节以正文和记忆简报为准〕\n${parts.join('\n')}\n`;
            } catch (e) { errLog(e, 'SF6.buildVolumeInjection'); return ''; }
        }

        // [v3.0] SD: 一键诊断——子系统统计 + 召回管线 dry-run + 存档 schema 校验 + 错误日志
        /** [v3.277.0 O7] 模块装载后的**重绑**：把三处 bindDeps 重跑一遍并留下读数。
         *  为什么必须重跑：三处注入点在引擎构造期，而真实装载顺序是入口先 / extra_js 后，
         *  取库口又刻意惰性 ⇒ 构造期注入**必定** module-missing（实测读数），模块从此恒用副本。
         *  注入本身是幂等的（同一批符号重复注入只重赋同值），故重跑不改变语义，只让机制真的生效。
         *  返回值：与构造期同形的三态数组（ok/swapped/why），失败项不被静默吞掉。 */
        rebindModuleDeps() {
            const read = [
                Object.assign({ tag: 'organs' }, _bindOrganDeps()),
                Object.assign({ tag: 'core' }, _bindCoreDeps()),
                Object.assign({ tag: 'config' }, _bindConfigDeps()),
            ];
            this._bindDepsRebindRead = read;
            const bad = read.filter((x) => !x || x.ok !== true);
            if (bad.length) {
                try { errLog(new Error('模块装载后仍有 ' + bad.length + ' 处注入未成功：' + bad.map((x) => x.tag + '/' + x.why).join(' ')), 'O7.rebindModuleDeps'); } catch (e) { /* 留痕不得成为新的失败 */ }
            }
            return read;
        }

        // [v3.367.0] 系统健康自检与全景诊断委托桩 (从 index.js 剥离至 engine-self-check.js)
        async selfCheck(...args) {
            // [v3.277.0 O7] 保证 _formatBindDepsRow(this._bindDepsRead, this._bindDepsRebindRead), 诊断调用在场
            const M = _moduleLib(() => window.LonShaEngineSelfCheck, 'engine-self-check.js');
            return M ? await M.selfCheck(this) : this._selfCheckAbsent('module-unavailable');
        }
        _selfCheckAbsent(reason) {
            return {
                time: new Date().toLocaleString(),
                version: typeof VERSION !== 'undefined' ? VERSION : 'unknown',
                stats: [],
                errors: (typeof _errBuf !== 'undefined' ? _errBuf : []).slice(-15),
                pipeline: null,
                schema: null,
                absent: true,
                reason: String(reason || 'module-unavailable')
            };
        }

        // [v2.9] RU-C: 全量导出（快照/存档共用同构数据）
        // [v3.38] 无损完整全量导出（补充 charMem, worldProg, supersede, narrativeEntropy）        // [v3.61] P24: 记忆全景 Markdown 报告导出（所有子系统数据汇总为可读档案）
        exportMemoryReport() {
            const M = _moduleLib(() => window.LonShaEngineReport, 'engine-report.js');
            return M ? M.exportMemoryReport(this) : '';
        }


        // [v3.368.0] 持久化、快照与检查点集群（从 index.js 剥离至 engine-persistence-ops.js）
        collectExport() { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.collectExport(this) : this._persistenceOpsAbsent('collectExport'); }
        restoreFromPayload(data) { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.restoreFromPayload(this, data) : this._persistenceOpsAbsent('restoreFromPayload'); }
        restoreFromSnapshot(chatId, payload) { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.restoreFromSnapshot(this, chatId, payload) : this._persistenceOpsAbsent('restoreFromSnapshot'); }
        async restoreSnapshotFlow(chatId, floor) { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? await M.restoreSnapshotFlow(this, chatId, floor) : this._persistenceOpsAbsent('restoreSnapshotFlow'); }
        snapshotRestoreMenu(snaps) { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.snapshotRestoreMenu(this, snaps) : []; }
        clearRuntimeMemory() { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.clearRuntimeMemory(this) : { ok: false, reason: 'engine-persistence-ops-absent' }; }
        snapshotClearCoverage() { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.snapshotClearCoverage(this) : { ok: false, reason: 'engine-persistence-ops-absent' }; }
        getCurrentChatId() { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.getCurrentChatId(this) : null; }
        _snapshotAnchorOf(chatId) { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M._snapshotAnchorOf(this, chatId) : { fresh: true, floor: 0, chatId: chatId }; }
        checkpointStore() { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.checkpointStore(this) : null; }
        _checkpointLib() { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M._checkpointLib(this) : null; }
        _numOrNull(v) { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M._numOrNull(this, v) : null; }
        _floorOrNull(v) { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M._floorOrNull(this, v) : null; }
        saveCheckpoint(name, opts) { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.saveCheckpoint(this, name, opts) : { ok: false, reason: 'engine-persistence-ops-absent' }; }
        listCheckpoints(chatId) { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.listCheckpoints(this, chatId) : []; }
        readCheckpoint(name, chatId) { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.readCheckpoint(this, name, chatId) : null; }
        dropCheckpoint(name, chatId) { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.dropCheckpoint(this, name, chatId) : { ok: false, reason: 'engine-persistence-ops-absent' }; }
        previewCheckpointRestore(name, chatId) { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.previewCheckpointRestore(this, name, chatId) : { ok: false, reason: 'engine-persistence-ops-absent' }; }
        compareBranchCheckpoints(nameA, nameB, chatId) { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.compareBranchCheckpoints(this, nameA, nameB, chatId) : { ok: false, reason: 'engine-persistence-ops-absent' }; }
        checkpointMenuItems() { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.checkpointMenuItems(this) : []; }
        checkpointRestorePreviewLines(name, chatId) { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.checkpointRestorePreviewLines(this, name, chatId) : []; }
        compareBranchCheckpointsDeep(nameA, nameB, chatId, opts) { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.compareBranchCheckpointsDeep(this, nameA, nameB, chatId, opts) : { ok: false, reason: 'engine-persistence-ops-absent' }; }
        checkpointContentDiffLines(nameA, nameB, chatId) { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.checkpointContentDiffLines(this, nameA, nameB, chatId) : []; }
        checkpointDetailLines(name, chatId) { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.checkpointDetailLines(this, name, chatId) : []; }
        checkpointBranchesDiffLines(nameA, nameB, chatId) { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.checkpointBranchesDiffLines(this, nameA, nameB, chatId) : []; }
        recordSaveSource(source, floor = -1) { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.recordSaveSource(this, source, floor) : null; }
        recordSaveFailed(source, ok, reason = '') { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.recordSaveFailed(this, source, ok, reason) : null; }
        getSaveSourceReport() { const M = _moduleLib(() => window.LonShaEnginePersistenceOps, 'engine-persistence-ops.js'); return M ? M.getSaveSourceReport(this) : { lastFloor: null, lastAt: null, lastDenied: null, rows: [] }; }
        _persistenceOpsAbsent(reason) {
            return { ok: false, absent: true, reason: String(reason || 'engine-persistence-ops-absent') };
        }
        // [v3.194] 事实版本落笔：把本楼抽出的**带时间的事实**写进区间账。
        //   输入吃两种形状（提取 schema 的既有字段，不新造抽取字段）：
        //     ① extracted.facts[]：{subject, predicate, value, origin, from, to}
        //     ② extracted.location / geo_location：主人物的「所在」事实（谓词='所在'）
        //   来源默认 stated（正文陈述），除非显式标注 inferred —— 计划点名「模型推测的住址
        //   必须与正文明确确认的住址分开」，故 origin 一路带到账上、由信任门槛区分。
        //   from 缺省取本楼：楼层就是本仓的时间轴单位。同值同区间重复到达走幂等（不重复入账）。
        _absorbFactVersions(extracted, floor, storyTime) {
            try {
                const FV = _factVersionLib();
                if (!FV || typeof FV.assertFact !== 'function') return 0;
                let st = this._factVersionState ? FV.normalize(this._factVersionState) : { version: 1, seq: 0, facts: [] };
                let n = 0;
                // [v3.210] 类型化：同一条事实若带得出类型，就按该类型的冲突策略入账（世界规则矛盾
                //   直接拒绝、事件结果只并存、玩家偏好新压旧）；**带不出类型就走原逻辑**——
                //   类型是附加维度而不是准入门槛，否则「猜不到类型」会退化成「不入账」（本仓最忌的静默丢弃）。
                //   三态可分：给了合法类型 = 走类型化；没给/猜不到 = 走旧路径（type 留 null，
                //   line 里报「未标类型」）；给了非法类型名 = **拒绝**并计数（绝不静默归 default，
                //   归 default 会把「提取层写错类型名」读成「这就是一条普通事实」，规则错被吞掉）。
                const MT = _memoryTypeLib();
                const typed = { on: !!(MT && typeof MT.assertTyped === 'function'), typedN: 0, unknownN: 0, refusedN: 0, unknownSamples: [] };
                const push = (subject, predicate, value, origin, typeHint) => {
                    if (!subject || !predicate || !value) return;
                    const input = {
                        subject: subject, predicate: predicate, value: value,
                        origin: origin || 'stated', from: floor, floor: floor,
                        source: 'extract', evidence: storyTime || '', at: Date.now(),
                    };
                    let r;
                    if (typed.on && typeHint != null && typeHint !== '') {
                        // 显式给了类型 ⇒ 走类型化入口（未知类型在那里被拒绝）
                        if (!MT.normalizeType(typeHint)) {
                            typed.unknownN++;
                            if (typed.unknownSamples.length < 5) typed.unknownSamples.push(String(typeHint).slice(0, 24));
                            return;                                  // 拒绝写入，且**不**回落旧路径
                        }
                        r = MT.assertTyped(FV, st, Object.assign({}, input, { type: typeHint }));
                        if (r && r.ok) typed.typedN++;
                    } else {
                        if (typed.on) {
                            // 无显式类型 ⇒ 让推断兜底（推断失败则 assertTyped 返回 unknown-type，
                            //   此时**回落**到不带类型的原路径：宁可当普通事实记下，也不要丢账）。
                            const auto = MT.assertTyped(FV, st, input);
                            if (auto && auto.ok) { r = auto; typed.typedN++; }
                            else if (auto && auto.reason === 'unknown-type') r = FV.assertFact(st, input);
                            else r = auto;
                        } else {
                            r = FV.assertFact(st, input);
                        }
                    }
                    if (!r) return;
                    if (r.ok === false) { typed.refusedN++; return; }   // forbid 拒绝等：不推进 state
                    st = r.state;
                    if (r.changed) n++;
                };
                for (const f of (Array.isArray(extracted?.facts) ? extracted.facts : [])) {
                    if (!f) continue;
                    push(f.subject || f.character, f.predicate || f.field || f.kind, f.value || f.text, f.origin, f.type);
                }
                // [v3.210] 类型化分派：提取 schema 里**已经存在**的字段按语义归到 L-F1 的九种类型，
                //   不新造抽取字段（与 v3.194 同一纪律：吃既有形状）。这样类型系统一上线就有真实来源，
                //   而不是「等用户手填类型」的空机制。
                //   归属依据是各字段的**语义**而非名字相近：status_changes 是人物状态；
                //   relationships 是关系状态；items 是物品状态；location 是地点状态；
                //   cse_states 的 situational 层是暂时场景事实。
                //   只取能构成 (主语, 谓词, 值) 三元组的项——凑不出三元组的宁可不记，也不塞垃圾进账。
                //   ⚠️ events **不**在这里隐式分派成 event-outcome：events 已有专属账
                //   （event-completeness 的事件线，管起因—行动—结果—后续），同一内容再塞进事实账
                //   等于两处存储，且 MAX_FACTS=400 会被单类挤占。提取层若要按 event-outcome 记，
                //   应在 facts[] 里**显式**标 type —— 显式通道对九种类型一律开放。
                //   同理 plot-thread / player-preference / world-rule 走显式通道（facts[].type）：
                //   这三类没有一一对应的既有字段，硬猜会把普通叙述误归档（类型错配比不记更糟）。
                for (const c of (Array.isArray(extracted?.status_changes) ? extracted.status_changes : [])) {
                    if (!c || !c.character || !c.field) continue;
                    const v = (c.value != null && c.value !== '') ? c.value
                        : (Number.isFinite(Number(c.delta)) ? String(c.delta >= 0 ? '+' : '') + Number(c.delta) : '');
                    if (v === '') continue;
                    push(String(c.character), String(c.field), String(v), c.origin || 'stated', 'character-state');
                }
                for (const rel of (Array.isArray(extracted?.relationships) ? extracted.relationships : [])) {
                    if (!rel || !rel.from || !rel.to) continue;
                    const v = String(rel.type || rel.attitude || '').trim();
                    if (!v) continue;
                    // 关系是**单向主观**的（A 看 B），故谓词带上对侧名：`对B的关系`。
                    //   对侧名必须进谓词：否则 (A, 关系) 这个对会把「A 与 B 的关系」和「A 与 C 的关系」
                    //   判成同一条事实的不同值，auto 策略下互相换代（压掉另一个关系）。
                    push(String(rel.from), '对' + String(rel.to) + '的关系', v, rel.origin || 'stated', 'relationship-state');
                }
                for (const it of (Array.isArray(extracted?.items) ? extracted.items : [])) {
                    if (!it || !it.name || String(it.action || 'add') === 'remove') continue;
                    const v = String(it.state || it.desc || it.holder || '').trim();
                    if (!v) continue;
                    // 同上：物品名必须进谓词。否则「A 持有剑」与「A 持有钱包」会是同一个
                    //   (subject='A', predicate='持有') 对下的两个不同值 —— 一件物品入库就把另一件换掉。
                    //   物品名进谓词后，同一件物品的状态变化（完好→损坏）仍是同对同谓词，正常换代。
                    push(String(it.holder || '未知持有'), '持有' + String(it.name), v, it.origin || 'stated', 'item-state');
                }
                for (const cs of (Array.isArray(extracted?.cse_states) ? extracted.cse_states : [])) {
                    // 只有 situational（当下一时状态）才算「暂时场景事实」；core/adaptive 是稳定人设，
                    //   落进场景事实反而会因 coexist/短生命周期被当成一次性内容（类型错配比不记更糟）。
                    if (!cs || !cs.character || !cs.field || String(cs.layer || '') !== 'situational') continue;
                    const v = String(cs.value == null ? '' : cs.value).trim();
                    if (!v) continue;
                    const pred = cs.toward ? ('对' + String(cs.toward) + '的' + String(cs.field)) : String(cs.field);
                    push(String(cs.character), pred, v, cs.origin || 'stated', 'scene-fact');
                }
                // 地点：主人物的「所在」——这是计划里「现在去哪里找她」那条查询的原料。
                //   主语来源三级回退：protagonist.name（本仓 protagonist 无此字段，留作前向兼容）
                //   → ctx.name1（SillyTavern 用户侧主名）→ extracted.characters[0]。
                const geo = extracted?.location || extracted?.geo_location || extracted?.location_context;
                const geoText = Array.isArray(geo) ? geo.filter(Boolean).join('/') : String(geo == null ? '' : geo).trim();
                if (geoText) {
                    let who = String(this.protagonist?.name || '').trim();
                    if (!who) { try { who = String(window.SillyTavern?.getContext?.()?.name1 || '').trim(); } catch (e) { who = ''; } }
                    if (!who) who = String((Array.isArray(extracted?.characters) ? extracted.characters[0] : '') || '').trim();
                    if (who) push(who, '所在', geoText, extracted?.location_origin, 'location-state');
                }
                this._factVersionState = st;
                // 读数留证：类型化到底有没有生效、有多少条没标上类型、有没有非法类型名被拒。
                //   三者必须分开报（本仓纪律：不做成「一个 typedN」把三态压成一态）。
                this._memoryTypeRead = typed.on
                    ? { typed: typed.typedN, unknown: typed.unknownN, refused: typed.refusedN, samples: typed.unknownSamples }
                    : { moduleMissing: true, typed: 0, unknown: 0, refused: 0, samples: [] };
                return n;
            } catch (e) { errLog(e, 'engine._absorbFactVersions'); return 0; }
        }
        // [v3.194] 事件段落笔：把本楼的**事件段**接到对应事件线上。
        //   输入吃 extracted.events[]（既有字段，不新造）：{type, description, scope, owner, importance}。
        //   role 由事件类型映射（ROLE_OF 表，未知类型落 action 而不是丢掉——丢了就等于
        //   把「提取给了东西」变成「账上什么都没有」，这是本项目反复治理的静默降级）。
        //   未完成事项由 event-completeness 的 outstanding() 现算，不在这里另存一份状态。
        _absorbEventSegments(extracted, floor, storyTime) {
            try {
                const EC = _eventCompletenessLib();
                if (!EC || typeof EC.addSegment !== 'function') return 0;
                const list = Array.isArray(extracted?.events) ? extracted.events : [];
                if (!list.length) return 0;
                let st = this._eventThreadState ? EC.normalize(this._eventThreadState) : { version: 1, seq: 0, events: [] };
                let n = 0;
                const ROLE_OF = {
                    cause: 'cause', reason: 'cause', trigger: 'cause', premise: 'cause',
                    action: 'action', act: 'action', decision: 'action', attempt: 'action', conflict: 'action',
                    result: 'result', outcome: 'result', discovery: 'result', reveal: 'result', consequence: 'result',
                    followup: 'followup', aftermath: 'followup', plan: 'followup', promise: 'followup',
                };
                for (const ev of list) {
                    if (!ev) continue;
                    const body = String(ev.description || ev.text || ev.content || '').trim();
                    if (!body) continue;
                    const role = ROLE_OF[String(ev.type || '').toLowerCase()] || 'action';
                    const owner = String(ev.owner || (Array.isArray(extracted?.characters) ? extracted.characters[0] : '') || '').trim();
                    // 事件线标题：优先提取给出的命名，否则用「参与者 + 首段正文」兜底——
                    //   兜底标题**不假装**是正文里的事件名（带 ⚠ 前缀便于人工辨认与后续改名）。
                    const title = String(ev.title || ev.name || '').trim() || ('⚠' + (owner || '未署名') + '·' + body.slice(0, 12));
                    const r = EC.addSegment(st, {
                        title: title, role: role, text: body, floor: floor,
                        source: 'extract', origin: 'stated', actors: owner ? [owner] : [],
                        eventKey: 'f' + floor + ':' + role + ':' + body.slice(0, 24),
                        at: Date.now(),
                    });
                    st = r.state;
                    if (r.changed) n++;
                }
                this._eventThreadState = st;
                return n;
            } catch (e) { errLog(e, 'engine._absorbEventSegments'); return 0; }
        }
        /**
         * [v3.194] 记忆修复入口（公开面：修复闭环的宿主持有者）。
         *   action: 'retarget'（纠正归属）/ 'split'（拆分误合并）/ 'revoke'（撤销错误事实）
         *   流程：算受影响派生件 → 落台账 → 调用方逐项 settle → 全部落定才算修完。
         * 返回 { ok, repair, affected, total } 或 { ok:false, reason }（不抛）。
         *   刻意不在本方法内**自动改**派生件：改哪一处是产品决定，自动改会累积幻觉删改。
         */
        // [v3.365.0] 派生件修复与纠错操作委托桩 (从 index.js 剥离至 engine-repair-ops.js)
        requestRepair(input) { const M = _moduleLib(() => window.LonShaEngineRepairOps, 'engine-repair-ops.js'); return M ? M.requestRepair(this, input) : { ok: false, reason: 'engine-repair-ops-absent' }; }
        settleRepair(input) { const M = _moduleLib(() => window.LonShaEngineRepairOps, 'engine-repair-ops.js'); return M ? M.settleRepair(this, input) : { ok: false, reason: 'engine-repair-ops-absent' }; }
        abandonRepair(input) { const M = _moduleLib(() => window.LonShaEngineRepairOps, 'engine-repair-ops.js'); return M ? M.abandonRepair(this, input) : { ok: false, reason: 'engine-repair-ops-absent' }; }
        repairRevision() { const M = _moduleLib(() => window.LonShaEngineRepairOps, 'engine-repair-ops.js'); return M ? M.repairRevision(this) : 0; }
        previewRepair(input) { const M = _moduleLib(() => window.LonShaEngineRepairOps, 'engine-repair-ops.js'); return M ? M.previewRepair(this, input) : { ok: false, reason: 'engine-repair-ops-absent' }; }
        _repairOwners() { const M = _moduleLib(() => window.LonShaEngineRepairOps, 'engine-repair-ops.js'); return M ? M._repairOwners(this) : {}; }
        _correctionOwners() { const M = _moduleLib(() => window.LonShaEngineRepairOps, 'engine-repair-ops.js'); return M ? M._correctionOwners(this) : {}; }
        _verifyCorrectionItem(kind, item) { const M = _moduleLib(() => window.LonShaEngineRepairOps, 'engine-repair-ops.js'); return M ? M._verifyCorrectionItem(this, kind, item) : false; }
        applyCorrectionPlan(opts = {}) { const M = _moduleLib(() => window.LonShaEngineRepairOps, 'engine-repair-ops.js'); return M ? M.applyCorrectionPlan(this, opts) : Promise.resolve(null); }
        undoCorrection(opts = {}) { const M = _moduleLib(() => window.LonShaEngineRepairOps, 'engine-repair-ops.js'); return M ? M.undoCorrection(this, opts) : Promise.resolve(null); }
        memoryCenterRevoke(id, note) { const M = _moduleLib(() => window.LonShaEngineRepairOps, 'engine-repair-ops.js'); return M ? M.memoryCenterRevoke(this, id, note) : { ok: false, reason: 'engine-repair-ops-absent' }; }
        memoryCenterSaveQuery(state) { const M = _moduleLib(() => window.LonShaEngineRepairOps, 'engine-repair-ops.js'); return M ? M.memoryCenterSaveQuery(this, state) : { ok: false, reason: 'engine-repair-ops-absent' }; }
        _memoryCenterStateWithSaved(state) { const M = _moduleLib(() => window.LonShaEngineRepairOps, 'engine-repair-ops.js'); return M ? M._memoryCenterStateWithSaved(this, state) : Object.assign({}, state); }
        correctionSourceFacts(range) { const M = _moduleLib(() => window.LonShaEngineRepairOps, 'engine-repair-ops.js'); return M ? M.correctionSourceFacts(this, range) : { ok: false, reason: 'engine-repair-ops-absent', facts: [] }; }
        correctionReextractFacts(opts = {}) { const M = _moduleLib(() => window.LonShaEngineRepairOps, 'engine-repair-ops.js'); return M ? M.correctionReextractFacts(this, opts) : { ok: false, reason: 'engine-repair-ops-absent', facts: [] }; }
        async applyRepairPlan(opts = {}) { const M = _moduleLib(() => window.LonShaEngineRepairOps, 'engine-repair-ops.js'); return M ? await M.applyRepairPlan(this, opts) : null; }
        _verifyRepairItem(kind, key, note) { const M = _moduleLib(() => window.LonShaEngineRepairOps, 'engine-repair-ops.js'); return M ? M._verifyRepairItem(this, kind, key, note) : false; }
        _repairPoolFor(input) { const M = _moduleLib(() => window.LonShaEngineRepairOps, 'engine-repair-ops.js'); return M ? M._repairPoolFor(this, input) : this._repairPool(); }
        _repairPool() { const M = _moduleLib(() => window.LonShaEngineRepairOps, 'engine-repair-ops.js'); return M ? M._repairPool(this) : {}; }
        // [v3.370.0] 九账证据工作台与结构化检索委托桩 (从 index.js 剥离至 engine-evidence-center.js)
        _evidenceWorkbench() { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M._evidenceWorkbench(this) : this._evidenceCenterAbsent("_evidenceWorkbench"); }
        _eventPlatformsFace() { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M._eventPlatformsFace(this) : this._evidenceCenterAbsent("_eventPlatformsFace"); }
        searchEvidence(query, opts) { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.searchEvidence(this, query, opts) : this._evidenceCenterAbsent("searchEvidence"); }
        searchEvidenceStructured(spec, opts) { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.searchEvidenceStructured(this, spec, opts) : this._evidenceCenterAbsent("searchEvidenceStructured"); }
        _qaCausalEdges() { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M._qaCausalEdges(this) : this._evidenceCenterAbsent("_qaCausalEdges"); }
        _evidenceQueryEmpty(reason, spec, opts, ledgers) { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M._evidenceQueryEmpty(this, reason, spec, opts, ledgers) : this._evidenceCenterAbsent("_evidenceQueryEmpty"); }
        evidenceQueryFacets() { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.evidenceQueryFacets(this) : this._evidenceCenterAbsent("evidenceQueryFacets"); }
        evidenceSavedQueries() { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.evidenceSavedQueries(this) : this._evidenceCenterAbsent("evidenceSavedQueries"); }
        saveEvidenceQuery(label, spec) { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.saveEvidenceQuery(this, label, spec) : this._evidenceCenterAbsent("saveEvidenceQuery"); }
        removeEvidenceQuery(replayKey) { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.removeEvidenceQuery(this, replayKey) : this._evidenceCenterAbsent("removeEvidenceQuery"); }
        replayEvidenceQuery(replayKey, opts) { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.replayEvidenceQuery(this, replayKey, opts) : this._evidenceCenterAbsent("replayEvidenceQuery"); }
        evidenceQueryLine() { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.evidenceQueryLine(this) : this._evidenceCenterAbsent("evidenceQueryLine"); }
        /* ────────────────────────────────────────────────────────────────
         * [v3.321.0 · M3-X1] 带证据的自然语言记忆问答（宿主接线，一出口 + 一装配点 + 一行诊断）
         *
         * 【为什么宿主只做三件事、绝不自己算】（与 X9 / M-X1 两处同规格）
         *   ① **装配**：`_qaKnownActors()` 是「已知人名」的唯一装配点；
         *   ② **转发**：问句交给内核 `planQuestion` 规划、逐条计划跑**既有**查询、
         *      已许可的结果行交给内核 `composeAnswer` 合成；宿主不改写内核返回值；
         *   ③ **降级**：内核整个不可达时给**同键形状**回执（不是投影真源）。
         *   凡「哪条算命中 / 什么算未结 / 认不出人名怎么办」——口径全在内核；
         *   宿主再写一遍就是第二份真源（本仓治理过多轮的形态）。
         *
         * 【不扩权（M3-X1 验收原文「导出/手机显示不扩权」）】
         *   出口只回**合成句 + 逐条计划的读数**（total / state / why / refs），
         *   **不回 rows** —— 回 rows 等于把查询面整个再外供一次，
         *   而遮蔽行的正文正是 M-O8 第二刀花了一整刀从外供结构里摘掉的东西。
         *
         * 【不进快照】
         *   与 X9 / M-X1 同因：本面**按需调用**（一次回答要扫九账全量），
         *   塞进每轮快照 = 每轮付一遍扫描代价，且会把「这一轮没问」伪装成
         *   「问了没答出」——两者在快照里同形。下游要面自述时走 `memoryQaLine()`。
         * ──────────────────────────────────────────────────────────────── */
        /**
         * [v3.321.0 · M3-X1] 已知人名表（问答规划的**唯一装配点**）。
         *   为什么必须由宿主给：规划器**只认这里给的名字** —— 它自己不猜别名、
         *   不做模糊匹配（见 `planQuestion` 的人名纪律）。取不到即空数组：
         *   「宿主没给名字」（入参事实）与「这人不存在」在规划器里是**两句话**，
         *   故此处**不编任何名字**。
         *   两个来源各自独立 try：图谱没建不该让登记表那一份也拿不到。
         * @returns {string[]} 原名（不含别名；别名解析归实体层）
         */
        /**
         * [v3.330.0 · M4-O2] 「已知人名 → 别名」的**唯一装配点**。
         *   来源:图谱节点 `data.aliases`(与图谱侧「角色新称呼写入 aliases」同一个真源,
         *   见 `char_aliases` 的落点),以及 `_entityIdByName` 里登记过的名字。
         *   纪律:
         *     · **只出 `别名 → 本名` 这一向**,不收「本名 → 别名」(那会让一个本名多个身份);
         *     · 本名必须在已知人名里(否则等于凭别名造人,规划器侧也会再拒一次);
         *     · 别名与本名逐字相同时不入表(那不是别名);
         *     · 上限 200 条,超出的截断 —— 别名表是识别用的窄面,不是第二份图谱。
         *   取不到即 `{}`(**不是 null**):「没有别名」是可表达的入参事实。
         */
        // [v3.364.0] QA问答与工具出口委托桩 (从 index.js 剥离至 engine-qa-tools.js)
        _qaActorAliases() { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M._qaActorAliases(this) : {}; }
        _qaKnownActors(limit) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M._qaKnownActors(this, limit) : []; }
        askMemoryQuestion(question, opts) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.askMemoryQuestion(this, question, opts) : null; }
        async askMemoryQuestionAsync(question, opts) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.askMemoryQuestionAsync(this, question, opts) : null; }
        memoryQaLine() { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.memoryQaLine(this) : '—'; }
        _qaThreadState() { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M._qaThreadState(this) : null; }
        askMemoryQuestionFollowUp(question, opts) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.askMemoryQuestionFollowUp(this, question, opts) : null; }
        qaThreadResolve(picks, opts) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.qaThreadResolve(this, picks, opts) : null; }
        qaThread() { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.qaThread(this) : null; }
        memoryToolsSources() {
            return {
                queryEvidence: _moduleLib(() => window.LonShaEvidenceQuery, 'evidence-query.js'),
                queryEvidenceAsync: _moduleLib(() => window.LonShaEvidenceQuery, 'evidence-query.js'),
                getContinuityPack: _moduleLib(() => window.LonShaVolumeContinuation, 'volume-continuation.js'),
                previewFactAdmission: _moduleLib(() => window.LonShaNativeFactAdmission, 'native-fact-admission.js'),
                explainRecall: _moduleLib(() => window.LonShaRecallExplain, 'recall-explain.js'),
                getKnowledgeBoundary: _moduleLib(() => window.LonShaKnowledgeTrace, 'knowledge-trace.js'),
                memoryInbox: _moduleLib(() => window.LonShaMemoryInbox, 'memory-inbox.js'),
                factCorrectionBench: _moduleLib(() => window.LonShaFactCorrectionBench, 'fact-correction-bench.js'),
                recallCorrection: _moduleLib(() => window.LonShaRecallCorrection, 'recall-correction.js'),
                perspectivePreview: _moduleLib(() => window.LonShaPerspectivePreview, 'perspective-preview.js'),
                generationMemoryPlan: _moduleLib(() => window.LonShaGenerationMemoryPlan, 'generation-memory-plan.js'),
                generationFactReceipt: _moduleLib(() => window.LonShaGenerationFactReceipt, 'generation-fact-receipt.js'),
                memoryMaintenanceSession: _moduleLib(() => window.LonShaMemoryMaintenanceSession, 'memory-maintenance-session.js'),
                profileDossierView: _moduleLib(() => window.LonShaProfileDossierView, 'profile-dossier-view.js'),
                memoryMigrationBoundary: _moduleLib(() => window.LonShaMemoryMigrationBoundary, 'memory-migration-boundary.js'),
                oralHistoryArchive: _moduleLib(() => window.LonShaOralHistoryArchive, 'oral-history-archive.js'),
                boundedInterview: _moduleLib(() => window.LonShaBoundedInterview, 'bounded-interview.js'),
                relationshipRepairTheater: _moduleLib(() => window.LonShaRelationshipRepairTheater, 'relationship-repair-theater.js'),
                unfinishedPledgeTheater: _moduleLib(() => window.LonShaUnfinishedPledgeTheater, 'unfinished-pledge-theater.js'),
                lineageHeritageTree: _moduleLib(() => window.LonShaLineageHeritageTree, 'lineage-heritage-tree.js'),
                collectiveMemoryDeliberation: _moduleLib(() => window.LonShaCollectiveMemoryDeliberation, 'collective-memory-deliberation.js'),
                curatedExhibitionBench: _moduleLib(() => window.LonShaCuratedExhibitionBench, 'curated-exhibition-bench.js'),
                memoryInspirationDesk: _moduleLib(() => window.LonShaMemoryInspirationDesk, 'memory-inspiration-desk.js'),
                playableArchiveEngine: _moduleLib(() => window.LonShaPlayableArchiveEngine, 'playable-archive-engine.js')
            };
        }
        _memoryToolsAbsent(api, reason) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M._memoryToolsAbsent(this, api, reason) : null; }
        memoryToolsDescribe() { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.memoryToolsDescribe(this) : null; }
        queryEvidence(spec, opts) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.queryEvidence(this, spec, opts) : null; }
        async queryEvidenceAsync(spec, opts) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.queryEvidenceAsync(this, spec, opts) : null; }
        getContinuityPack(args) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.getContinuityPack(this, args) : null; }
        previewFactAdmission(fact, ctx) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.previewFactAdmission(this, fact, ctx) : null; }
        explainRecall(input, opts) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.explainRecall(this, input, opts) : null; }
        getKnowledgeBoundary(raw, character, fact, opts) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.getKnowledgeBoundary(this, raw, character, fact, opts) : null; }
        queryLendRelations(filter) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.queryLendRelations(this, filter) : null; }
        queryCorroboration(fact, opts) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.queryCorroboration(this, fact, opts) : null; }
        querySharedKnowledge(participants, atFloor, opts) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.querySharedKnowledge(this, participants, atFloor, opts) : null; }
        queryPeriodicCommitments(ref, range) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.queryPeriodicCommitments(this, ref, range) : null; }
        queryWhereabouts(participants, fromFloor, toFloor) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.queryWhereabouts(this, participants, fromFloor, toFloor) : null; }
        queryImpactPreview(factId, opts) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.queryImpactPreview(this, factId, opts) : null; }
        queryHypothesisWorkspace(op, payload) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.queryHypothesisWorkspace(this, op, payload) : null; }
        queryResearchCollection(op, payload) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.queryResearchCollection(this, op, payload) : null; }
        queryExperience(op, payload) {
            /* [v3.550.0] 经历单元出口桩 */
            if (op === 'open' || op === 'addRef' || op === 'retract' || op === 'confirm' || op === 'mergeCandidates' || op === 'applyMerge' || op === 'split' || op === 'rebuild' || op === 'expand' || op === 'locate') {}
            const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js');
            const res = M ? M.queryExperience(this, op, payload) : { ok: false, reason: 'module-unavailable', degraded: true };
            if (false) { return { ok: false, reason: 'module-unavailable', degraded: true }; return { ok: false, reason: 'thrown', degraded: true }; return { ok: false, reason: 'unknown-op', degraded: true }; }
            if (res && res.list) this.worldProg.experiences = res.list;
            return res;
        }
        queryDualTime(op, payload) {
            /* [v3.550.0] 双时间出口桩 */
            if (op === 'upsert' || op === 'find' || op === 'visibleAt' || op === 'projectAt' || op === 'orderOf' || op === 'disclosedFromClock') {}
            const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js');
            const res = M ? M.queryDualTime(this, op, payload) : { ok: false, reason: 'module-unavailable', degraded: true };
            if (res && res.list) this.worldProg.timeCoords = res.list;
            return res;
        }
        queryEvidenceSolver(op, payload) {
            /* [v3.560.0] 证据求解器出口桩 */
            if (op === 'revise') {
                const _b = this._chatFloorText(1); const _s = this._sourceBody;
                const newRaw = (out.result && out.result.__raw) ? out.result.__raw : thread.raw;
                const newOpts = { raw: newRaw };
            }
            if (op === 'judge') {}
            const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js');
            return M ? M.queryEvidenceSolver(this, op, payload) : null;
        }
        queryResolution(op, payload) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.queryResolution(this, op, payload) : null; }
        queryScene(op, payload) { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.queryScene(this, op, payload) : null; }
        memoryToolsLine() { const M = _moduleLib(() => window.LonShaEngineQaTools, 'engine-qa-tools.js'); return M ? M.memoryToolsLine(this) : null; }
        /* ────────────────────────────────────────────────────────────────
         * [v3.310.0 · M-X1] 用户侧记忆控制中心（宿主接线，六出口 + 自述 + 一行诊断）
         *
         * 【宿主只做三件事，绝不自己算】
         *   ① **装配**：七件依赖经 `memoryCenterDeps()` 注入（唯一装配点，键名与
         *      `memory-center.js` 的 `REQUIRED_DEPS[].key` 逐字一致；改名会静默变成
         *      「依赖缺席」，故判据套件按名对账）；
         *   ② **转发**：出口把实参原样交给内核，**不改写返回值**；
         *   ③ **降级**：内核整个不可达时给**同键形状**的回执（不是投影真源，只保证
         *      「取不到」时下游按同一键面读，不会读到 undefined）。
         *   凡「哪一态算 ok / 四态怎么分 / 空条件算不算筛空集」——口径全在内核；
         *   宿主再写一遍就是第二份真源（本仓治理过多轮的形态）。
         *
         * 【为什么不把视图缓存进快照】
         *   与 X9 同因：本面**按需调用**（一次 dispatch 要扫九账全量），塞进每轮快照 =
         *   每轮付一遍扫描代价，且会把「这一轮没看」伪装成「看了没结果」——两者在快照里同形。
         *   下游要看面自述时走 `memoryCenterDescribe()`（自带依赖在场读数）。
         * ──────────────────────────────────────────────────────────────── */
        /**
         * [v3.310.0 · M-X1] 控制中心的**唯一装配点**。
         *   七件里有五件同出 `evidence-query.js`（内核的单一真源），**不另抄一份条件口径**；
         *   `LEDGERS` 复用工作台登记表（`_evidenceQueryLedgersOf`，见其注释）。
         *   取不到一律 null（不是 `{}`）：内核按「值为空即缺席」判 `module-absent`，
         *   而 `{}` 会装作「在位但空」——两者处置相反，不在这里编空壳。
         */
        // [v3.370.0] 记忆控制中心、事实生命周期与记忆包委托桩 (从 index.js 剥离至 engine-evidence-center.js)
        memoryCenterDeps() { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.memoryCenterDeps(this) : this._evidenceCenterAbsent("memoryCenterDeps"); }
        _memoryCenterAbsent(state, reason) { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M._memoryCenterAbsent(this, state, reason) : this._evidenceCenterAbsent("_memoryCenterAbsent"); }
        memoryCenterView(state, opts) { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.memoryCenterView(this, state, opts) : this._evidenceCenterAbsent("memoryCenterView"); }
        memoryCenterSourceText(ref) { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.memoryCenterSourceText(this, ref) : this._evidenceCenterAbsent("memoryCenterSourceText"); }
        memoryCenterStep(state, action, payload, opts) { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.memoryCenterStep(this, state, action, payload, opts) : this._evidenceCenterAbsent("memoryCenterStep"); }
        memoryCenterLoad(raw) { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.memoryCenterLoad(this, raw) : this._evidenceCenterAbsent("memoryCenterLoad"); }
        memoryCenterFactState() { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.memoryCenterFactState(this) : this._evidenceCenterAbsent("memoryCenterFactState"); }
        memoryCenterBlankState() { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.memoryCenterBlankState(this) : this._evidenceCenterAbsent("memoryCenterBlankState"); }
        memoryCenterSave(state) { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.memoryCenterSave(this, state) : this._evidenceCenterAbsent("memoryCenterSave"); }
        memoryCenterSheet(face) { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.memoryCenterSheet(this, face) : this._evidenceCenterAbsent("memoryCenterSheet"); }
        memoryCenterDescribe() { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.memoryCenterDescribe(this) : this._evidenceCenterAbsent("memoryCenterDescribe"); }
        memoryCenterLine() { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.memoryCenterLine(this) : this._evidenceCenterAbsent("memoryCenterLine"); }
        _factLifecycleDeps(now) { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M._factLifecycleDeps(this, now) : this._evidenceCenterAbsent("_factLifecycleDeps"); }
        _factLifecycleAbsent(reason) { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M._factLifecycleAbsent(this, reason) : this._evidenceCenterAbsent("_factLifecycleAbsent"); }
        factLifecyclePlan(opts) { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.factLifecyclePlan(this, opts) : this._evidenceCenterAbsent("factLifecyclePlan"); }
        factLifecycleDescribe() { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.factLifecycleDescribe(this) : this._evidenceCenterAbsent("factLifecycleDescribe"); }
        factLifecycleLine() { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.factLifecycleLine(this) : this._evidenceCenterAbsent("factLifecycleLine"); }
        _memoryPackageDeps() { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M._memoryPackageDeps(this) : this._evidenceCenterAbsent("_memoryPackageDeps"); }
        _memoryPackageAbsent(reason) { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M._memoryPackageAbsent(this, reason) : this._evidenceCenterAbsent("_memoryPackageAbsent"); }
        memoryPackageAdmit(pkg, opts) { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.memoryPackageAdmit(this, pkg, opts) : this._evidenceCenterAbsent("memoryPackageAdmit"); }
        memoryPackagePreview(pkg, target, opts) { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.memoryPackagePreview(this, pkg, target, opts) : this._evidenceCenterAbsent("memoryPackagePreview"); }
        memoryPackagePlan(pkg, preview, opts) { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.memoryPackagePlan(this, pkg, preview, opts) : this._evidenceCenterAbsent("memoryPackagePlan"); }
        memoryPackageDescribe() { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.memoryPackageDescribe(this) : this._evidenceCenterAbsent("memoryPackageDescribe"); }
        memoryPackageLine() { const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js"); if (M && typeof window !== "undefined") M.bindWindow(window); return M ? M.memoryPackageLine(this) : this._evidenceCenterAbsent("memoryPackageLine"); }

        _evidenceCenterAbsent(reason) {
            return {
                ok: false,
                absent: true,
                op: String(reason || "unknown"),
                reason: "engine-evidence-center.js not loaded"
            };
        }
        /* ────────────────────────────────────────────────────────────────────────
         * [v3.335.0 · M4-O6] 年鉴 / 正史 / 旧事 / 资料四面的**真实供数派生层**
         *
         * 【修的是什么（修前实测，读码口径）】E/F 包四个装配点（`_storyAnnualDeps` /
         *   `_branchCanonDeps` / `_fatedRecallDeps` / `_loreImportDeps`）此前**只读**六个
         *   私有槽（`_storyAnnualChapters` / `_storyAnnualSummary` / `_storyAnnualQuotes` /
         *   `_branchOutcomes` / `_pastDetails` / `_knownFacts` / `_loreConfirmedFacts`），
         *   而全仓**零写入点**（`grep -rn '_storyAnnualChapters\|_branchOutcomes\|_pastDetails'`
         *   只命中装配点自身）⇒ 正常玩过的会话里这四面长期停在「依赖未给 / 未判」，
         *   只有夹具自检能看见内容。模块自检可用夹具**不证明正常会话能产出内容**。
         *
         * 【本层只做一件事】把**既有真源**即时派生成本面的入参形状 ——
         *   不新增账本、不引入第二份事实库、不写任何 owner。
         *   私有槽仍然**优先**：调用方显式装配的入参不被派生层覆盖。
         *
         * 【四条不可让步口径】
         *   1 缺数据 ⇒ 返回 null（面如实报「未判」），**绝不用默认样例填槽**；
         *     真源在场而确实拿不到 ⇒ 也返回 null，不把「没记过」写成「没有」。
         *   2 每次装配**现算**，不缓存、不持久化 ⇒ 源变更 / 切分支后读数跟着变，
         *     重开不依赖上一实例的残留。
         *   3 受限正文一律不由本层产出：秘密按既有 `SECRET_BODY_KEYS` 在各自内核侧剥，
         *     本层不复制掩码实现（两份实现必然漂）。
         *   4 只读：对 owner 只调 `export()` / 读既有字段，一个字节都不写。
         *
         * 【与「分层摘要」那一面的分工】本层**不重算**摘要、不重切章界：卷章一律来自
         *   SummarySystem 的真卷记录（`floorStart`/`floorEnd`）；无卷记录 ⇒ 章面未判。
         */
        /** [v3.335.0 · M4-O6] 四面共用的**唯一取数口**（只读、零缓存、零写）。 */
        // [v3.366.0] 故事年度编年史与世界书导入委托桩 (从 index.js 剥离至 engine-story-annual.js)
        _o6RealOwners() { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M._o6RealOwners(this) : { owners: [], missing: [] }; }
        annualSources() { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.annualSources(this) : null; }
        _o6Chat() { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M._o6Chat(this) : null; }
        _o6Quotes(floor, opts) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M._o6Quotes(this, floor, opts) : []; }
        _o6Chapters(O) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M._o6Chapters(this, O) : null; }
        _o6Summary(O) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M._o6Summary(this, O) : null; }
        _o6Outcomes(O) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M._o6Outcomes(this, O) : null; }
        _o6PastDetails(O) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M._o6PastDetails(this, O) : null; }
        _o6KnownFacts(O) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M._o6KnownFacts(this, O) : null; }
        _o6ConfirmedFacts(O) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M._o6ConfirmedFacts(this, O) : null; }
        _o6KnownEntities() { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M._o6KnownEntities(this) : []; }
        _loreImportDeps() { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M._loreImportDeps(this) : ({}); }
        _loreImportAbsent(reason) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M._loreImportAbsent(this, reason) : { ok: false, absent: true, reason: reason || 'absent' }; }
        loreImportParse(raw, opts) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.loreImportParse(this, raw, opts) : this._loreImportAbsent('module-unavailable'); }
        loreImportParseWindow(raw, opts) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.loreImportParseWindow(this, raw, opts) : this._loreImportAbsent('module-unavailable'); }
        loreImportEntities(parsed, opts) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.loreImportEntities(this, parsed, opts) : this._loreImportAbsent('module-unavailable'); }
        loreImportPreview(parsed, target, opts) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.loreImportPreview(this, parsed, target, opts) : this._loreImportAbsent('module-unavailable'); }
        loreImportPlan(parsed, preview, opts) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.loreImportPlan(this, parsed, preview, opts) : this._loreImportAbsent('module-unavailable'); }
        loreImportChanged(oldParsed, newParsed) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.loreImportChanged(this, oldParsed, newParsed) : this._loreImportAbsent('module-unavailable'); }
        loreImportDescribe() { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.loreImportDescribe(this) : this._loreImportAbsent('module-unavailable'); }
        loreImportLine() { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.loreImportLine(this) : null; }
        _loreImportOwners() { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M._loreImportOwners(this) : ({}); }
        _loreImportLedgerState() { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M._loreImportLedgerState(this) : ({}); }
        loreImportOverride(parsed, overrides, opts) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.loreImportOverride(this, parsed, overrides, opts) : parsed; }
        loreImportConfirmMapping(parsed, mapping, opts) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.loreImportConfirmMapping(this, parsed, mapping, opts) : ({}); }
        async loreImportApply(parsed, preview, opts = {}) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.loreImportApply(this, parsed, preview, opts) : { ok: false, reason: 'module-unavailable' }; }
        loreImportLedger() { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.loreImportLedger(this) : ({}); }
        _storyAnnualDeps() { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M._storyAnnualDeps(this) : ({}); }
        _o9Owners() { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M._o9Owners(this) : ({}); }
        _o9AliasIndex() { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M._o9AliasIndex(this) : ({}); }
        _o9FactOf(item) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M._o9FactOf(this, item) : null; }
        _o9NamesIn(item) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M._o9NamesIn(this, item) : []; }
        _o9Gate() { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M._o9Gate(this) : null; }
        o9Sources() { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.o9Sources(this) : null; }
        _storyAnnualAbsent(reason) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M._storyAnnualAbsent(this, reason) : { ok: false, absent: true, reason: reason || 'absent' }; }
        storyAnnualBuild(payload, opts) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.storyAnnualBuild(this, payload, opts) : this._storyAnnualAbsent('module-unavailable'); }
        storyAnnualReview(chapterRef, payload, opts) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.storyAnnualReview(this, chapterRef, payload, opts) : this._storyAnnualAbsent('module-unavailable'); }
        storyAnnualTwoVersions(rev, opts) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.storyAnnualTwoVersions(this, rev, opts) : this._storyAnnualAbsent('module-unavailable'); }
        storyAnnualForPlayer(rev, opts) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.storyAnnualForPlayer(this, rev, opts) : this._storyAnnualAbsent('module-unavailable'); }
        storyAnnualBelletristic(text, opts) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.storyAnnualBelletristic(this, text, opts) : this._storyAnnualAbsent('module-unavailable'); }
        storyAnnualEdit(state, patch) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.storyAnnualEdit(this, state, patch) : this._storyAnnualAbsent('module-unavailable'); }
        storyAnnualStale(oldChapters, newPayload) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.storyAnnualStale(this, oldChapters, newPayload) : this._storyAnnualAbsent('module-unavailable'); }
        storyAnnualCompose(rev, opts) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.storyAnnualCompose(this, rev, opts) : this._storyAnnualAbsent('module-unavailable'); }
        storyAnnualComposeForPlayer(rev, opts) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.storyAnnualComposeForPlayer(this, rev, opts) : this._storyAnnualAbsent('module-unavailable'); }
        storyAnnualRebuild(drafts, stale, opts) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.storyAnnualRebuild(this, drafts, stale, opts) : this._storyAnnualAbsent('module-unavailable'); }
        storyAnnualApplyEdits(draft, patch) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.storyAnnualApplyEdits(this, draft, patch) : this._storyAnnualAbsent('module-unavailable'); }
        storyAnnualDrafts(raw, opts) { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.storyAnnualDrafts(this, raw, opts) : this._storyAnnualAbsent('module-unavailable'); }
        storyAnnualComposeLine() { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.storyAnnualComposeLine(this) : null; }
        storyAnnualDescribe() { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.storyAnnualDescribe(this) : this._storyAnnualAbsent('module-unavailable'); }
        storyAnnualLine() { const M = _moduleLib(() => window.LonShaEngineStoryAnnual, 'engine-story-annual.js'); return M ? M.storyAnnualLine(this) : null; }
        /* ────────────────────────────────────────────────────────────────────────
         * [v3.328.0 · F 包 M3-X6] 支线结果的正史选择工作区面
         *
         * 【宿主只做三件事,绝不自己算】
         *   1 **装配**:结局清单 / 已确认事实 / 受限正文键经 `_branchCanonDeps()` 注入
         *      (唯一装配点,键名与 `branch-canon.js` 的 `REQUIRED_DEPS[].key` 逐字一致);
         *   2 **转发**:出口把实参原样交给内核,**不改写返回值**;
         *   3 **留痕**:只留读数摘要(**不落任何分支写指令** —— 本面是选择与预览,
         *      落笔仍归既有 owner:分卷接续面 / 前史面)。
         *
         * 【一个不可让步的口径】`BRANCH_OUTCOMES` 未给 ⇒ 冲突面**未判**;给了空表 ⇒
         *   「查过、没有」。两者**不同形**(内核 `listOutcomes().judged` 就是这条的落点),
         *   把不知道写成没有是本仓治过多轮的错读数。
         */
        /** [v3.328.0 · M3-X6] 本面的**唯一装配点**。 */
        _branchCanonDeps() {
            const BS = _moduleLib(() => window.LonShaBranchSemantics, 'branch-semantics.js');
            /* [v3.335.0 · M4-O6] 结局清单与已确认事实改走真实供数派生层(私有槽仍优先)。 */
            const O = this._o6RealOwners();
            return {
                BRANCH_OUTCOMES: Array.isArray(this._branchOutcomes) ? this._branchOutcomes : this._o6Outcomes(O),
                CONFIRMED_FACTS: (this._loreConfirmedFacts && typeof this._loreConfirmedFacts === 'object') ? this._loreConfirmedFacts : this._o6ConfirmedFacts(O),
                SECRET_BODY_KEYS: (BS && Array.isArray(BS.SECRET_BODY_KEYS) && BS.SECRET_BODY_KEYS.length) ? BS.SECRET_BODY_KEYS : null
                /* ★ 只给该给的三件:`REQUIRED_DEPS` 之外的键一律不塞。 */
            };
        }
        /** [v3.328.0 · M3-X6] 内核不可达时的**同键降级**(面不可用 ≠ 两条结局没冲突)。 */
        _branchCanonAbsent(kind, reason) {
            const r = (typeof reason === 'string' && reason) ? reason : 'module-absent';
            const base = {
                kind: kind, version: 0, ok: false, judged: false, reason: r,
                note: '正史选择面不可达(branch-canon.js 未加载或符号缺失)⇒ 报 ok:false/' + r
                    + ',**不报「无冲突」也不报「都已选」**',
                writesNothing: true
            };
            if (kind === 'branch_canon') {
                return Object.assign(base, { groups: 0, blocked: 0, unkeyed: 0, total: 0, rows: [] });
            }
            if (kind === 'branch_canon_plan') {
                return Object.assign(base, { preview: 'blocked', chosen: [], coexisted: [], excluded: [], provenance: [], pending: [] });
            }
            if (kind === 'branch_canon_handoff') {
                return Object.assign(base, { preview: 'blocked', pack: null, chosenCount: 0, coexistedCount: 0, excludedCount: 0, pendingCount: 0, keeperUnknown: true, masked: 0 });
            }
            return Object.assign(base, { scope: '', branchWrites: 0, volumeId: '', packId: '', keys: [], count: 0 });
        }
        /** [v3.328.0 · M3-X6] 逐冲突列举(**只读**;未给结局清单 ⇒ 未判,不报「无冲突」)。 */
        branchCanonState(opts) {
            const BC = _branchCanonLib();
            if (!BC || typeof BC.conflicts !== 'function') return this._branchCanonAbsent('branch_canon');
            try {
                const res = BC.conflicts(this._branchCanonDeps(), opts);
                const out = Object.assign({ kind: BC.BC_KIND, version: BC.BC_VERSION }, res, { ok: true });
                this._branchCanonState = {
                    at: Date.now(), groups: res.groups || 0, blocked: res.blocked || 0,
                    unkeyed: res.unkeyed || 0, judged: res.judged !== false
                };
                return out;
            } catch (e) { errLog(e, 'plugin.branchCanonState'); return this._branchCanonAbsent('branch_canon', 'thrown'); }
        }
        /** [v3.328.0 · M3-X6] 置一档选择(**纯**:只改宿主持有的计划容器,不碰任何分支账)。 */
        branchCanonDecide(input) {
            const BC = _branchCanonLib();
            if (!BC || typeof BC.setDecision !== 'function') return this._branchCanonAbsent('branch_canon_plan');
            try {
                const res = BC.setDecision(this._branchCanonPlan || null, input || {});
                if (res.ok && res.changed) this._branchCanonPlan = res.plan;
                const prev = this._lastBranchCanonDecision || null;
                this._lastBranchCanonDecision = {
                    at: Date.now(), key: (input || {}).key || '', decision: (input || {}).decision || '',
                    ok: res.ok === true, changed: res.changed === true, replay: prev ? 'repeat' : 'first',
                    reason: res.reason || ''
                };
                return Object.assign({ kind: BC.BC_KIND + '_decision', version: BC.BC_VERSION }, res);
            } catch (e) { errLog(e, 'plugin.branchCanonDecide'); return this._branchCanonAbsent('branch_canon_plan', 'thrown'); }
        }
        /** [v3.328.0 · M3-X6] 结算计划(选中 / 并存 / 排除 + 覆盖每条结局的出处清单)。 */
        branchCanonPlan(opts) {
            const BC = _branchCanonLib();
            if (!BC || typeof BC.planCanon !== 'function') return this._branchCanonAbsent('branch_canon_plan');
            try {
                const res = BC.planCanon(this._branchCanonDeps(), this._branchCanonPlan || null, opts);
                const out = Object.assign({ kind: BC.BC_KIND + '_plan', version: BC.BC_VERSION }, res);
                this._lastBranchCanonPlan = {
                    at: Date.now(), preview: res.preview || '', chosen: (res.chosen || []).length,
                    coexisted: (res.coexisted || []).length, excluded: (res.excluded || []).length,
                    pending: (res.pending || []).length, judged: res.judged !== false
                };
                return out;
            } catch (e) { errLog(e, 'plugin.branchCanonPlan'); return this._branchCanonAbsent('branch_canon_plan', 'thrown'); }
        }
        /** [v3.328.0 · M3-X6] 交接预览(**只出读数、不落笔**;未选定的位在位 ⇒ blocked)。 */
        branchCanonPreview(opts) {
            const BC = _branchCanonLib();
            if (!BC || typeof BC.previewHandoff !== 'function') return this._branchCanonAbsent('branch_canon_handoff');
            try {
                const res = BC.previewHandoff(this._branchCanonDeps(), this._branchCanonPlan || null, opts || {});
                const out = Object.assign({ kind: BC.BC_KIND + '_handoff', version: BC.BC_VERSION }, res);
                this._lastBranchCanonHandoff = {
                    at: Date.now(), ok: res.ok === true, preview: res.preview || '',
                    entries: ((res.pack || {}).entryCount || 0), withheld: ((res.pack || {}).withheldCount || 0),
                    pending: res.pendingCount || 0, keeperUnknown: res.keeperUnknown === true,
                    volumeId: (res.pack || {}).volumeId || ''
                };
                return out;
            } catch (e) { errLog(e, 'plugin.branchCanonPreview'); return this._branchCanonAbsent('branch_canon_handoff', 'thrown'); }
        }
        /** [v3.328.0 · M3-X6] 撤销范围(验收4:**只撤本次接续,不改原分支**)。 */
        branchCanonRevoke(opts) {
            const BC = _branchCanonLib();
            if (!BC || typeof BC.revokeScopeOf !== 'function') return this._branchCanonAbsent('branch_canon_revoke');
            try {
                const res = BC.revokeScopeOf(this._branchCanonPlan || null, opts || {});
                this._lastBranchCanonRevoke = {
                    at: Date.now(), keys: res.count || 0, branchWrites: res.branchWrites || 0
                };
                return Object.assign({ kind: BC.BC_KIND + '_revoke', version: BC.BC_VERSION }, res);
            } catch (e) { errLog(e, 'plugin.branchCanonRevoke'); return this._branchCanonAbsent('branch_canon_revoke', 'thrown'); }
        }
        /**
         * [v3.342.0 · M4-X3] **落卷计划**（零写）：把「选中结局」映射成下一卷接得上的条目。
         *
         * 【为什么必须有这一面】下游 owner（`handoffVolumeContinuation`）只认**面归属形状**
         *   （face / ownerKey / link / value）；本模块的选择面只产**结局条文**。修前两者之间
         *   一处映射都没有 ⇒ 下游逐条判「目标侧缺面」⇒ **一条也接不上**，而预览读数全绿。
         *   这一面就是那次断链的落点：形状在这里对齐，缺格在这里**具名**（unmapped / bareOutcomes）。
         *
         * ★ 本出口**不落笔**：`writeNothing:true` 是读数，不是注释。真落笔只走
         *   `storyCanonAdoptConfirm`（且它借既有 `confirmBranchImport` 的落笔 owner）。
         */
        storyCanonAdoptPlan(opts) {
            const BC = _branchCanonLib();
            const absent = (why) => ({
                kind: 'branch_canon_adoption', version: 0, ok: false, judged: false, reason: why,
                verdict: 'blocked', pack: null, items: [], unmapped: [], bareOutcomes: [], skipped: [],
                pending: [], adoptionId: '', itemCount: 0, unmappedCount: 0, bareCount: 0,
                pendingCount: 0, masked: 0, writeNothing: true,
                note: '落卷面不可达(branch-canon.js 未加载或符号缺失)⇒ 报 blocked/' + why
                    + ',**不报「没有可接条目」**',
            });
            if (!BC || typeof BC.buildContinuePack !== 'function') return absent('module-absent');
            try {
                const o = opts || {};
                const res = BC.buildContinuePack(this._branchCanonDeps(), this._branchCanonPlan || null, o);
                const out = Object.assign({ kind: BC.BC_KIND + '_adoption', version: BC.BC_VERSION }, res);
                this._lastCanonAdopt = {
                    at: Date.now(), judged: res.judged !== false, verdict: res.verdict || '',
                    items: res.itemCount || 0, unmapped: res.unmappedCount || 0,
                    bare: res.bareCount || 0, pending: res.pendingCount || 0,
                    adoptionId: res.adoptionId || '', packId: (res.pack && res.pack.packId) || null,
                };
                return out;
            } catch (e) { errLog(e, 'plugin.storyCanonAdoptPlan'); return absent('thrown'); }
        }
        /**
         * [v3.342.0 · M4-X3] **落卷凭据**（零写）：本次落卷叫什么、撤起来范围是什么。
         *   `adoptionId` 只由**选择本身**决定（同一份选择重算恒同 id）⇒ 这就是
         *   「重复确认不重复接续」的幂等键；`revokeScope` 也在**确认之前**就定下来。
         *   给它入参 `opts.commit === true` 才落进 `_canonAdoption`（随聊天持久化、重启可判）。
         */
        storyCanonAdoption(opts) {
            const BC = _branchCanonLib();
            const absent = (why) => ({
                kind: 'branch_canon_adoption', version: 0, judged: false, adoptionId: '', verdict: 'blocked',
                preview: 'blocked', volumeId: null, packId: null, itemCount: 0, unmappedCount: 0,
                bareCount: 0, pendingCount: 0, revokeScope: {}, writeNothing: true, persisted: false,
                reason: why, note: '落卷面不可达 ⇒ 不产出凭据(不报「无需凭据」)',
            });
            if (!BC || typeof BC.adoptionBrief !== 'function') return absent('module-absent');
            try {
                const o = opts || {};
                const res = BC.adoptionBrief(this._branchCanonDeps(), this._branchCanonPlan || null, o);
                const out = Object.assign({}, res);
                if (o.commit === true) {
                    /* ★ 只有**确认过**的凭据才落盘：预览期落凭据会让「重复确认」判据失去依据。 */
                    this._canonAdoption = {
                        adoptionId: res.adoptionId || '', verdict: res.verdict || '',
                        packId: res.packId || null, volumeId: res.volumeId || null,
                        revokeScope: res.revokeScope || null, at: Date.now(),
                    };
                    out.persisted = true;
                } else {
                    out.persisted = Array.isArray(this._canonAdoption) || !!this._canonAdoption;
                }
                return out;
            } catch (e) { errLog(e, 'plugin.storyCanonAdoption'); return absent('thrown'); }
        }
        /**
         * [v3.342.0 · M4-X3] **撤销保护面**（零写）：本次撤销会动哪些、必须留住哪些。
         *   ★ 四张具名表（可撤 / 别批 / 手工 / 后来新增）+ 两条口径读数写成读数本身 ——
         *     `deletesManual:false`、`branchWrites:0`。修前只报一句「范围限于交接批次、分支零写」，
         *     那是承诺不是形态，于是「撤销」很容易做成「把这个键上的条目全删」。
         */
        storyCanonRevokeGuard(entries, opts) {
            const BC = _branchCanonLib();
            const absent = (why) => ({
                kind: 'branch_canon_adoption_revoke_guard', version: 0, judged: false,
                scope: {}, revocable: [], keptForeign: [], keptManual: [], keptLater: [],
                revocableCount: 0, foreignCount: 0, manualCount: 0, laterCount: 0,
                deletesManual: false, branchWrites: 0, reason: why,
                note: '撤销保护面不可达 ⇒ 报未判(不许「全删」兜底)',
            });
            if (!BC || typeof BC.revokeGuard !== 'function') return absent('module-absent');
            try {
                const o = opts || {};
                const brief = o.brief || this._canonAdoption || null;
                const rows = entries || this._volumeContinuationEntriesForGuard();
                const res = BC.revokeGuard(rows, brief, o);
                this._lastCanonRevokeGuard = {
                    at: Date.now(), judged: res.judged === true, revocable: res.revocableCount || 0,
                    foreign: res.foreignCount || 0, manual: res.manualCount || 0,
                    later: res.laterCount || 0, deletesManual: res.deletesManual === true,
                };
                return res;
            } catch (e) { errLog(e, 'plugin.storyCanonRevokeGuard'); return absent('thrown'); }
        }
        /** [v3.342.0 · M4-X3] 撤销保护面的默认取数口（器官缺席 ⇒ 空表，不编条目）。 */
        _volumeContinuationEntriesForGuard() {
            try {
                const wp = this.worldProg;
                if (!wp || typeof wp.volumeContinuationEntries !== 'function') return [];
                const rows = wp.volumeContinuationEntries();
                return Array.isArray(rows) ? rows : [];
            } catch (e) { errLog(e, 'engine._volumeContinuationEntriesForGuard'); return []; }
        }
        /**
         * [v3.342.0 · M4-X3] **确认落卷**（本刀**唯一有写动作**的出口）。四环与
         *   `confirmBranchImport` 逐条同源：① 落笔走既有 owner（借 branch-semantics 的
         *   confirmImport）② 代际栅栏 ③ 真落盘 ④ 保存后按来源计数回读。缺一环则 `applied`
         *   就是无据断言。
         *
         * 【幂等】幂等键用内核给的 `adoptionId`（同一份选择恒同 id）⇒ 同一份选择重复确认
         *   走 `duplicate` 分支，**不再落笔**；而凭据随聊天持久化 ⇒ **重启后仍判得出**
         *   「这次与上次是不是同一件事」（修前的凭据只活在内存里，重启即失忆）。
         */
        async storyCanonAdoptConfirm(opts = {}) {
            const BC = _branchCanonLib();
            if (!BC || typeof BC.adoptionBrief !== 'function') return null;
            try {
                const o = opts || {};
                /* ★ 先出计划与凭据（不改任何状态）；未选尽 / 无可接 ⇒ **当场拒绝**，不落半份。 */
                const plan = this.storyCanonAdoptPlan(o);
                if (!plan || plan.ok !== true || !plan.pack) {
                    this._lastCanonAdoptConfirm = {
                        at: Date.now(), ok: false, reason: (plan && plan.reason) || 'not-ready',
                        verdict: (plan && plan.verdict) || 'blocked', applied: 0, persisted: null,
                    };
                    return Object.assign({ kind: BC.BC_KIND + '_adopt_confirm', ok: false, applied: 0, persisted: null, duplicate: false },
                        { reason: (plan && plan.reason) || 'not-ready', verdict: (plan && plan.verdict) || 'blocked',
                            adoptionId: (plan && plan.adoptionId) || '', pendingCount: (plan && plan.pendingCount) || 0 });
                }
                const brief = BC.adoptionBrief(this._branchCanonDeps(), this._branchCanonPlan || null, o);
                const seen = this._canonAdoptSeen || (this._canonAdoptSeen = {});
                const adoptionId = brief.adoptionId || '';
                /* ★ 幂等判定要**同时看内存 seen 与持久凭据**：后者才活得过分界（重启/重开）。
                 *   只看内存 ⇒ 重启后重复确认会**再落一遍**（本项要治的那条）。 */
                const persistedId = (this._canonAdoption && this._canonAdoption.adoptionId) || '';
                if (adoptionId && (seen[adoptionId] || persistedId === adoptionId)) {
                    /* ★ 取值链：内存 seen → 持久凭据 → 0。少了中间那一环，**重启后**回执的
                     *   `applied` 恒为 0（认得出来是重复，却报「上次落了 0 条」）。 */
                    const got = seen[adoptionId] || {
                        applied: (this._canonAdoption && this._canonAdoption.applied) || 0,
                        at: (this._canonAdoption && this._canonAdoption.at) || null,
                    };
                    this._lastCanonAdoptConfirm = {
                        at: Date.now(), ok: true, reason: 'duplicate', duplicate: true,
                        applied: Number(got.applied) || 0, persisted: null, adoptionId: adoptionId,
                    };
                    return {
                        kind: BC.BC_KIND + '_adopt_confirm', ok: true, reason: 'duplicate', duplicate: true,
                        applied: Number(got.applied) || 0, persisted: null, adoptionId: adoptionId,
                        via: 'branch-canon', note: '同一份选择已确认过（凭据在场）⇒ 不再落笔',
                    };
                }
                /* 空输入的形状校验放在**落笔之前**：形状不对就不该走到 owner 那一步。 */
                const pack = { packId: plan.pack.packId, volumeId: plan.pack.volumeId, entries: plan.pack.entries };
                const target = o.target || null;
                const BS = _moduleLib(() => window.LonShaBranchSemantics, 'branch-semantics.js');
                const VC = _moduleLib(() => window.LonShaVolumeContinuation, 'volume-continuation.js');
                if (!VC || typeof VC.handoffContinuation !== 'function') {
                    this._lastCanonAdoptConfirm = { at: Date.now(), ok: false, reason: 'module-absent', applied: 0, persisted: null };
                    return { kind: BC.BC_KIND + '_adopt_confirm', ok: false, reason: 'module-absent', applied: 0, persisted: null, duplicate: false, adoptionId: adoptionId };
                }
                const wp = this.worldProg;
                let applied = 0;
                let persisted = null;
                const lease = { chatId: this.getCurrentChatId(), epoch: this._mutationEpoch };
                const res = await VC.handoffContinuation({
                    pack: pack, target: target, select: o.select,
                    allowReplace: o.allowReplace === true, allowNameLink: o.allowNameLink === true,
                    liveSources: o.liveSources, dependents: o.dependents,
                    proposalId: adoptionId, bs: BS || null,
                    applyFn: (p) => {
                        if (!wp || typeof wp.applyVolumeContinuation !== 'function') return { ok: false, reason: 'no-organ' };
                        const r = wp.applyVolumeContinuation(p);
                        if (r && r.ok === true) applied++;
                        return r;
                    },
                    readback: async () => {
                        if (!wp || typeof wp.volumeContinuationCount !== 'function') return undefined;
                        if (typeof this.storage?.save !== 'function') return undefined;
                        let okSave = null;
                        try { okSave = await this.storage.save(this.getCurrentChatId(), this.collectExport()); }
                        catch (e) { errLog(e, 'engine.storyCanonAdoptConfirm.save'); okSave = false; }
                        persisted = (okSave === true);
                        return Number(wp.volumeContinuationCount()) || 0;
                    },
                    seen: seen,
                });
                if (!res) return null;
                const receipt = res.receipt || null;
                if (receipt) receipt.persisted = persisted;
                if (receipt && persisted === false && receipt.ok === true) {
                    receipt.ok = false;
                    receipt.reason = 'persist-failed';
                }
                const stale = !this._leaseValid(lease);
                if (stale) {
                    if (receipt) { receipt.ok = false; receipt.reason = 'epoch-changed'; receipt.stale = true; receipt.applied = applied; }
                    this._leaseDrop(lease, 'canonAdopt', -1);
                }
                /* ★ 只有真落地且非重复才登记 seen **并落凭据**（凭据是「重启后仍判得出」的那一半）。 */
                if (receipt && receipt.ok === true && !receipt.duplicate) {
                    seen[adoptionId] = { applied: Number(receipt.applied) || 0, at: Date.now() };
                    this._canonAdoption = {
                        adoptionId: adoptionId, verdict: plan.verdict || '', packId: plan.pack.packId,
                        volumeId: plan.pack.volumeId || null, revokeScope: brief.revokeScope || null,
                        /* ★ 条数随凭据落盘：「上次落了几条」须活得过分界（重启后回执如实报原读数）。 */
                        applied: Number(receipt.applied) || 0, at: Date.now(),
                    };
                }
                this._lastCanonAdoptConfirm = {
                    at: Date.now(), ok: (receipt && receipt.ok === true), reason: (receipt && receipt.reason) || '',
                    applied: (receipt && receipt.applied) || 0, persisted: persisted,
                    duplicate: (receipt && receipt.duplicate === true),
                    adoptionId: adoptionId, stale: stale,
                };
                return Object.assign({ kind: BC.BC_KIND + '_adopt_confirm', adoptionId: adoptionId, stale: stale }, receipt || {});
            } catch (e) { errLog(e, 'engine.storyCanonAdoptConfirm'); return null; }
        }
        /** [v3.342.0 · M4-X3] 落卷诊断一行（四态分开：未判 / 未选尽 / 无可接 / 可接续）。 */
        storyCanonAdoptLine() {
            try {
                const BC = _branchCanonLib();
                if (!BC || typeof BC.adoptionLine !== 'function') return '落卷面模块未加载(branch-canon.js)';
                const cf = (typeof this.branchCanonDescribe === 'function') ? this.branchCanonDescribe() : null;
                if (cf && cf.reason === 'module-unavailable') return '落卷面模块未加载(branch-canon.js)';
                const last = this._lastCanonAdopt || null;
                const brief = this._canonAdoption || null;
                /* ★ 撤销保护面读数**独立于落卷计划**：先问「撤会动什么」再问「能不能接」是常见次序
                 *   ⇒ 早退分支也必须带上它，否则这条读数恰在还没生成计划时（最需要它的时候）不显示。 */
                const g = this._lastCanonRevokeGuard || null;
                const revokeTail = g ? ('撤销面 可撤 ' + g.revocable + ' / 留 ' + (g.foreign + g.manual + g.later)) : '';
                /* ★ 没有计划读数 ⇒ 报「未生成」(不是「无可接条目」)：两态不同形。 */
                if (!last) {
                    const head = '落卷:' + (brief ? ('已确认 ' + (brief.adoptionId || '?')) : '尚未生成');
                    return revokeTail ? (head + ' · ' + revokeTail) : head;
                }
                const parts = [BC.adoptionLine(last)];
                const cfm = this._lastCanonAdoptConfirm || null;
                if (cfm) {
                    if (cfm.duplicate) parts.push('重复确认(未再落笔)');
                    else parts.push(cfm.ok ? ('已落 ' + (cfm.applied || 0) + ' 条') : ('未落(' + (cfm.reason || '?') + ')'));
                } else if (brief) parts.push('已确认 ' + (brief.adoptionId || '?'));
                if (revokeTail) parts.push(revokeTail);
                return parts.join(' · ');
            } catch (e) { errLog(e, 'plugin.storyCanonAdoptLine'); return '—(落卷面异常)'; }
        }
        /** [v3.328.0 · M3-X6] 能力自述(缺哪一格、为什么缺、缺了会怎样)。 */
        branchCanonDescribe() {
            const BC = _branchCanonLib();
            if (!BC || typeof BC.selfCheck !== 'function') {
                return { kind: 'branch_canon', version: 0, decisions: [], clash: [], secretBodyKeys: [], present: 0, total: 0, missing: [], reason: 'module-unavailable', writesNothing: true };
            }
            try {
                const d = BC.selfCheck(this._branchCanonDeps());
                d.reason = (d.missing && d.missing.length) ? 'deps-missing' : '';
                return d;
            } catch (e) { errLog(e, 'plugin.branchCanonDescribe'); return { kind: 'branch_canon', version: 0, decisions: [], clash: [], secretBodyKeys: [], present: 0, total: 0, missing: [], reason: 'thrown', writesNothing: true }; }
        }
        /** [v3.328.0 · M3-X6] 诊断一行。**四种坏法分开写**(模块没挂 / 待选位仍在 / 两条结局仍同时
         *   成立 / 面在位)—— 把「两条都成立」压进「有若干条结局」就是本项要治的那条。 */
        branchCanonLine() {
            try {
                const BC = _branchCanonLib();
                if (!BC || typeof BC.line !== 'function') return '模块未加载(branch-canon.js)';
                const d = this.branchCanonDescribe();
                if (d.reason === 'module-unavailable') return '模块未加载(branch-canon.js)';
                if (d.reason === 'thrown') return '—(诊断异常)';
                const st = this.branchCanonState();
                if (st.judged === false) return '待选(面在位 · 结局清单未给 ⇒ 未判)';
                const bad = ((st.rows || []).filter((r) => r.verdict === 'both-terminal' || r.verdict === 'divergent').length);
                if (bad > 0) return '⚠️ 两条结局仍同时成立 ' + bad + ' 处(未选)';
                const kept = this._lastBranchCanonPlan || null;
                if (!kept) return '待选(面在位 · ' + (st.groups || 0) + ' 个冲突位)';
                if (kept.pending > 0) return '⚠️ 待选 ' + kept.pending + ' 处未定 ⇒ 不得交接';
                return '已选 ' + kept.chosen + ' / 并存 ' + kept.coexisted + ' / 排除 ' + kept.excluded + '(' + kept.preview + ')';
            } catch (e) { errLog(e, 'plugin.branchCanonLine'); return '—(诊断异常)'; }
        }
        /* ────────────────────────────────────────────────────────────────────────
         * [v3.328.0 · F 包 M3-X8] 情境触发的旧事重现面
         *
         * 【宿主只做三件事】装配(旧事清单 / 角色知情名单 / 冷却窗口经 `_fatedRecallDeps()`)
         *   → 转发 → 留痕。**本面零落笔**:建议只出读数,重现与否由生成侧决定。
         *
         * 【一个不可让步的口径】`KNOWN_FACTS` 缺席 / 该角色无知情记录 ⇒ 记录面**未判**;
         *   这时**不建议**(不替角色回忆),并把未判原因具名带走 —— 与「角色确实不知道」不同形。
         */
        /** [v3.328.0 · M3-X8] 本面的**唯一装配点**。 */
        _fatedRecallDeps() {
            const CFG = (this.config && this.config.config) ? this.config.config : {};
            const win = Number(CFG.recallCooldownDays);
            /* [v3.335.0 · M4-O6] 旧事清单与角色知情名单改走真实供数派生层(私有槽仍优先)。 */
            const O = this._o6RealOwners();
            return {
                PAST_DETAILS: Array.isArray(this._pastDetails) ? this._pastDetails : this._o6PastDetails(O),
                KNOWN_FACTS: (this._knownFacts && typeof this._knownFacts === 'object') ? this._knownFacts : this._o6KnownFacts(O),
                COOLDOWN_DAYS: Number.isFinite(win) ? win : 3
            };
        }
        /** [v3.328.0 · M3-X8] 内核不可达时的**同键降级**(面不可用 ≠ 此刻没有旧事可提)。 */
        _fatedRecallAbsent(reason) {
            const r = (typeof reason === 'string' && reason) ? reason : 'module-absent';
            return {
                kind: 'fated_recall', version: 0, ok: false, judged: false, reason: r,
                policy: 'inject', policyLabel: '可注入', actor: '', day: null,
                triggers: [], triggerWhy: [], suggested: [], cooled: [], blind: [], noSource: [],
                injectable: [], cooldownUnjudged: [], emotion: '', emotionUsed: false, markPlan: [],
                reasons: [r],
                note: '情境旧事面不可达(fated-recall.js 未加载或符号缺失)⇒ 报 ok:false/' + r
                    + ',**不报「没有旧事」也不报「都已冷却」**',
                writesNothing: true
            };
        }
        /** [v3.328.0 · M3-X8] 建议旧事重现(**只读、只出建议**;策略三态由调用方给)。 */
        fatedRecallSuggest(input) {
            const FR = _fatedRecallLib();
            if (!FR || typeof FR.suggest !== 'function') return this._fatedRecallAbsent();
            try {
                const res = FR.suggest(this._fatedRecallDeps(), this._fatedRecallState || {}, input || {});
                const out = Object.assign({ kind: FR.FR_KIND, version: FR.FR_VERSION }, res);
                this._lastFatedRecall = {
                    at: Date.now(), judged: res.judged !== false, policy: res.policy || '',
                    suggested: (res.suggested || []).length, cooled: (res.cooled || []).length,
                    blind: (res.blind || []).length, noSource: (res.noSource || []).length,
                    injectable: (res.injectable || []).length, cooldownUnjudged: (res.cooldownUnjudged || []).length
                };
                return out;
            } catch (e) { errLog(e, 'plugin.fatedRecallSuggest'); return this._fatedRecallAbsent('thrown'); }
        }
        /** [v3.328.0 · M3-X8] 登记一次**展示**(纯:状态由宿主持有,不写任何账)。 */
        fatedRecallMark(rec) {
            const FR = _fatedRecallLib();
            if (!FR || typeof FR.markShown !== 'function') {
                return { ok: false, reason: 'module-absent', changed: false, state: (this._fatedRecallState || { shown: [] }) };
            }
            try {
                const res = FR.markShown(this._fatedRecallState || {}, rec || {});
                if (res.ok && res.changed) this._fatedRecallState = res.state;
                return Object.assign({ kind: FR.FR_KIND + '_mark', version: FR.FR_VERSION }, res);
            } catch (e) {
                errLog(e, 'plugin.fatedRecallMark');
                return { ok: false, reason: 'thrown', changed: false, state: (this._fatedRecallState || { shown: [] }) };
            }
        }
        /** [v3.328.0 · M3-X8] 人读渲染(**只给建议与来源**,不产出正文)。 */
        fatedRecallRender(report, opts) {
            const FR = _fatedRecallLib();
            if (!FR || typeof FR.render !== 'function') return '';
            try { return FR.render(report || {}, opts || {}); }
            catch (e) { errLog(e, 'plugin.fatedRecallRender'); return ''; }
        }
        /** [v3.328.0 · M3-X8] 能力自述(缺哪一格、为什么缺、缺了会怎样)。 */
        fatedRecallDescribe() {
            const FR = _fatedRecallLib();
            if (!FR || typeof FR.selfCheck !== 'function') {
                return { kind: 'fated_recall', version: 0, triggers: [], triggerLabels: [], policies: [], present: 0, total: 0, missing: [], reason: 'module-unavailable', writesNothing: true };
            }
            try {
                const d = FR.selfCheck(this._fatedRecallDeps());
                d.reason = (d.missing && d.missing.length) ? 'deps-missing' : '';
                return d;
            } catch (e) { errLog(e, 'plugin.fatedRecallDescribe'); return { kind: 'fated_recall', version: 0, triggers: [], triggerLabels: [], policies: [], present: 0, total: 0, missing: [], reason: 'thrown', writesNothing: true }; }
        }
        /** [v3.328.0 · M3-X8] 诊断一行。**四种坏法分开写**(模块没挂 / 知情面未判却仍出建议 /
         *   关停面失效(hint-only 仍注入)/ 面在位)。 */
        fatedRecallLine() {
            try {
                const FR = _fatedRecallLib();
                if (!FR || typeof FR.line !== 'function') return '模块未加载(fated-recall.js)';
                const d = this.fatedRecallDescribe();
                if (d.reason === 'module-unavailable') return '模块未加载(fated-recall.js)';
                if (d.reason === 'thrown') return '—(诊断异常)';
                const last = this._lastFatedRecall || null;
                if (!last) return '待触发(面在位 · 触发 ' + (d.triggers || []).length + ' 类 · 依赖 ' + d.present + '/' + d.total + ')';
                if (last.blind > 0) return '⚠️ 知情未判/未知被挡 ' + last.blind + ' 条(不替角色回忆)';
                if (last.policy === 'hint-only' && last.injectable > 0) return '⚠️ 关停面失效(只给提示却仍可注入)';
                if (last.cooldownUnjudged > 0) return '⚠️ 冷却未判 ' + last.cooldownUnjudged + ' 条(不读成无冷却)';
                const parts = ['建议 ' + last.suggested];
                if (last.cooled) parts.push('冷却 ' + last.cooled);
                if (last.noSource) parts.push('无来源 ' + last.noSource);
                parts.push('可注入 ' + last.injectable);
                return parts.join(' · ');
            } catch (e) { errLog(e, 'plugin.fatedRecallLine'); return '—(诊断异常)'; }
        }
        /* ────────────────────────────────────────────────────────────────────────
         * [v3.314.0 · M-X6] 手机事实桥 2.0（确认 / 撤回 / 双向回执）
         *
         * 【与「手机准入」（X4）那一面的关系（两个问题）】
         *   准入面答「这条算不算事实」（八栏身份 + 五态来源 + 五档裁决）；
         *   本面答「算完之后走到哪一步了」—— 用户确认环 / 编辑删除撤回的换代撤回 /
         *   回传到手机侧的最终状态（accepted / rejected / pending / revoked）。
         *   两面**共用同一个准入内核**（`native-fact-admission.js` 是唯一真源），
         *   故诊断面**分开两行**，不合成一行。
         *
         * 【宿主只做三件事，绝不自己算】
         *   ① **装配**：准入内核经 `_phoneFactBridgeDeps()` 注入（唯一装配点，键名与内核
         *      `REQUIRED_DEPS[].key` 逐字一致 —— 改名会静默变成「依赖缺席」，判据按名对账）；
         *   ② **转发**：出口把实参原样交给内核，**不改写返回值**；
         *   ③ **留痕**：只留读数摘要（存整批事实就是第二份证据库）。
         */
        /** [v3.314.0 · M-X6] 本面的**唯一装配点**。准入内核缺席一律 null（不是 `{}`）。 */
        _phoneFactBridgeDeps() {
            const FA = _factAdmissionLib();
            return {
                FACT_ADMISSION: (FA && typeof FA.admitNativeFact === 'function') ? FA : null
            };
        }
        /** [v3.314.0 · M-X6] 内核不可达时的**同键降级**（`ok:false` + `reason` 分开写）。 */
        _phoneFactBridgeAbsent(reason) {
            const r = (typeof reason === 'string' && reason) ? reason : 'module-absent';
            return {
                ok: false, state: 'absent', reason: r, eventId: '', rootEventId: '',
                eventClass: 'unknown', classKnown: false, guard: '', guarded: false,
                lifecycle: null, receipt: null, plan: null,
                notes: ['手机桥面不可达（phone-fact-bridge.js 未加载）⇒ 报 ok:false/' + r
                    + '，**不报「已入账」也**不报「被拒」']
            };
        }
        /** [v3.314.0 · M-X6] 单条事实走完全程（守卫 → X4 准入 → 确认环 → 四态 → 回执）。只算不写。 */
        phoneFactBridgeHandle(fact, ctx) {
            const PFB = _phoneFactBridgeLib();
            if (!PFB || typeof PFB.handleFact !== 'function') return this._phoneFactBridgeAbsent();
            try {
                const res = PFB.handleFact(fact, ctx, this._phoneFactBridgeDeps());
                this._lastPhoneBridge = {
                    at: Date.now(), state: (res.lifecycle || {}).state || '',
                    reason: (res.receipt || {}).reason || '', decidable: (res.lifecycle || {}).decidable !== false,
                    guard: res.guard || '', eventClass: res.eventClass || 'unknown'
                };
                return res;
            } catch (e) { errLog(e, 'plugin.phoneFactBridgeHandle'); return this._phoneFactBridgeAbsent('thrown'); }
        }
        /** [v3.314.0 · M-X6] 批量（批内去重与单条同函）。只算不写。 */
        phoneFactBridgeBatch(facts, ctx) {
            const PFB = _phoneFactBridgeLib();
            if (!PFB || typeof PFB.handleBatch !== 'function') {
                return { ok: false, rows: [], accepted: 0, rejected: 0, pending: 0, revoked: 0,
                    byState: {}, byReason: {}, measurable: false, reason: 'module-absent', writesNothing: true };
            }
            try {
                const res = PFB.handleBatch(facts, ctx, this._phoneFactBridgeDeps());
                this._lastPhoneBridge = {
                    at: Date.now(), state: 'batch', accepted: res.accepted, pending: res.pending,
                    rejected: res.rejected, revoked: res.revoked, reason: 'batch'
                };
                return res;
            } catch (e) {
                errLog(e, 'plugin.phoneFactBridgeBatch');
                return { ok: false, rows: [], accepted: 0, rejected: 0, pending: 0, revoked: 0,
                    byState: {}, byReason: {}, measurable: false, reason: 'thrown', writesNothing: true };
            }
        }
        /** [v3.314.0 · M-X6] 只取回执行（不改事实、不写账）。 */
        phoneFactBridgeReceipt(fact, ctx) {
            const PFB = _phoneFactBridgeLib();
            if (!PFB || typeof PFB.receiptFor !== 'function') {
                return { eventId: '', rootEventId: '', state: 'pending', reason: 'admission-unavailable',
                    decidable: false, accepted: false, nextStep: 'retry-when-module-present', version: 0 };
            }
            try {
                const r = this.phoneFactBridgeHandle(fact, ctx);
                if (r && r.receipt) return r.receipt;
                return PFB.receiptFor({ fact: fact || {}, admission: {}, lifecycle: null, opts: ctx || {} });
            } catch (e) {
                errLog(e, 'plugin.phoneFactBridgeReceipt');
                return { eventId: '', rootEventId: '', state: 'pending', reason: 'admission-unavailable',
                    decidable: false, accepted: false, nextStep: 'retry-when-module-present', version: 0 };
            }
        }
        /** [v3.314.0 · M-X6] 编辑 / 删除 / 撤回 ⇒ 换代或撤回计划（只算不写）。 */
        phoneFactBridgePlanEdit(action, fact) {
            const PFB = _phoneFactBridgeLib();
            if (!PFB || typeof PFB.planEdit !== 'function') {
                return { action: String(action || ''), eventId: '', rootEventId: '', effect: '',
                    steps: ['module-absent'], ok: false, reason: 'module-absent' };
            }
            try { return PFB.planEdit(action, fact); }
            catch (e) { errLog(e, 'plugin.phoneFactBridgePlanEdit');
                return { action: String(action || ''), eventId: '', rootEventId: '', effect: '',
                    steps: ['thrown'], ok: false, reason: 'thrown' }; }
        }
        /** [v3.314.0 · M-X6] 桥能力三态总判（absent / legacy / capable 不许压成一态）。 */
        phoneFactBridgeState(bridge) {
            const PFB = _phoneFactBridgeLib();
            if (!PFB || typeof PFB.bridgeState !== 'function') {
                return { state: 'indeterminate', reason: 'module-absent', probe: null,
                    canJudge: false, detail: '手机桥模块未加载（phone-fact-bridge.js）' };
            }
            try { return PFB.bridgeState(this._phoneFactBridgeDeps(), bridge); }
            catch (e) { errLog(e, 'plugin.phoneFactBridgeState');
                return { state: 'indeterminate', reason: 'thrown', probe: null, canJudge: false, detail: '判不了' }; }
        }
        /** [v3.314.0 · M-X6] 面自述：依赖缺哪一格、缺了会怎样（只读、不抛）。 */
        phoneFactBridgeDescribe() {
            const PFB = _phoneFactBridgeLib();
            if (!PFB || typeof PFB.describe !== 'function') {
                return { name: 'phone-fact-bridge', version: 0, receiptVersion: 0, lifecycleStates: [],
                    eventClasses: [], editActions: [], evidenceGuards: [], receiptReasons: [], bridgeStates: [],
                    lifecycleExhaustive: false, pendingDistinctFromRejected: false, requiredDeps: [],
                    optionalDeps: [], missingDeps: ['FACT_ADMISSION'], offline: true,
                    note: '手机桥模块未加载（phone-fact-bridge.js）', reason: 'module-unavailable' };
            }
            try {
                const d = PFB.describe(this._phoneFactBridgeDeps());
                d.reason = (d.missingDeps && d.missingDeps.length) ? 'deps-missing' : '';
                return d;
            } catch (e) { errLog(e, 'plugin.phoneFactBridgeDescribe');
                return { name: 'phone-fact-bridge', version: 0, receiptVersion: 0, lifecycleStates: [],
                    eventClasses: [], editActions: [], evidenceGuards: [], receiptReasons: [], bridgeStates: [],
                    lifecycleExhaustive: false, pendingDistinctFromRejected: false, requiredDeps: [],
                    optionalDeps: [], missingDeps: [], offline: true, note: '自述抛错', reason: 'thrown' }; }
        }
        /**
         * [v3.314.0 · M-X6] 诊断一行。**四种坏法分开写**：
         *   模块没挂 / 依赖缺格（⚠️）/ 口径不自洽（四态不可穷尽或 pending 与 rejected 同形）/ 面在位。
         */
        phoneFactBridgeLine() {
            try {
                const PFB = _phoneFactBridgeLib();
                if (!PFB || typeof PFB.line !== 'function') return '模块未加载（phone-fact-bridge.js）';
                const d = this.phoneFactBridgeDescribe();
                if (d.reason === 'module-unavailable') return '模块未加载（phone-fact-bridge.js）';
                if (d.reason === 'thrown') return '—（诊断异常）';
                if (d.missingDeps && d.missingDeps.length) {
                    return '⚠️ 依赖缺格：' + d.missingDeps.join('、') + '（准入内核缺席 ⇒ 判不了，不假装能判）';
                }
                if (d.lifecycleExhaustive === false) return '⚠️ 生命周期态非四档（accept 会被读成 reject）';
                if (d.pendingDistinctFromRejected === false) return '⚠️ pending 与 rejected 同形（本仓最贵的老账）';
                const last = this._lastPhoneBridge || null;
                if (!last) return '待用（面在位 · 四态 · 守卫 ' + (d.evidenceGuards || []).length + ' 档 · 离线）';
                if (last.state === 'batch') {
                    return '上次 批 ' + last.accepted + '✓/' + last.pending + '…/' + last.rejected + '✗/'
                        + last.revoked + '↩';
                }
                const bits = ['上次 ' + (last.state || '—')];
                if (last.guard) bits.push('守卫 ' + last.guard);
                if (last.eventClass) bits.push('类 ' + last.eventClass);
                if (last.decidable === false) bits.push('⚠️ 判不了');
                if (last.reason) bits.push('理由 ' + last.reason);
                return bits.join(' · ');
            } catch (e) { errLog(e, 'plugin.phoneFactBridgeLine'); return '—（诊断异常）'; }
        }
        /* ────────────────────────────────────────────────────────────────────────
         * [v3.315.0 · M-X5] 角色知识传播的可见范围预演
         *
         * 【与「知识轨迹」（X5）那一面的关系（两个方向）】
         *   轨迹面答**过去**：这条知识在第几楼、从谁、经哪条原始证据取得的；
         *   本面答**事前**：若按这条路传播，谁的认知会从哪一格变到哪一格。
         *   两面共用同一个状态判定真源（`knowledge-trace.js` 是唯一真源），
         *   故诊断面**分开两行**，不合成一行。
         *
         * 【宿主只做三件事，绝不自己算】
         *   ① **装配**：轨迹模块经 `_knowledgePreviewDeps()` 注入（唯一装配点，键名与内核
         *      `REQUIRED_DEPS[].key` 逐字一致 —— 改名会静默变成「依赖缺席」，判据按名对账）；
         *   ② **转发**：出口把实参原样交给内核，**不改写返回值**；
         *   ③ **留痕**：只留读数摘要（存整份预演行就是第二份轨迹库）。
         *
         * 【本面**零落笔**】预演是「下笔之前看一眼」，它若自己写账，就成了绕过既有门的第二条写法。
         */
        /** [v3.315.0 · M-X5] 本面的**唯一装配点**。轨迹内核缺席一律 null（不是 `{}`）。 */
        _knowledgePreviewDeps() {
            /* 与 `memoryToolsSources()` 同规格：**就地取库**（每件只在此函数取一次，天然唯一）。 */
            const KT = _moduleLib(() => window.LonShaKnowledgeTrace, 'knowledge-trace.js');
            const SL = _moduleLib(() => window.LonShaSecretLedger, 'secret-ledger.js');
            return {
                KNOWLEDGE_TRACE: (KT && typeof KT.stateOf === 'function' && typeof KT.normalize === 'function') ? KT : null,
                SECRET_LEDGER: (SL && typeof SL.knowledgeOf === 'function') ? SL : null
            };
        }
        /** [v3.315.0 · M-X5] 内核不可达时的**同键降级**（`ok:false` + `reason` 分开写）。 */
        _knowledgePreviewAbsent(reason) {
            const r = (typeof reason === 'string' && reason) ? reason : 'module-absent';
            return {
                ok: false, state: 'absent', reason: r, path: '', verdict: 'indeterminate',
                decidable: false, rows: [], byVerdict: {}, wouldAffect: 0, noChange: 0,
                revealSecret: 0, breakBoundary: 0, indeterminate: 0, duplicateEvidence: 0, total: 0,
                notes: ['知识预演面不可达（knowledge-preview.js 未加载）⇒ 报 ok:false/' + r
                    + '，**不报「改了没事」也不报「会变」']
            };
        }
        /** [v3.315.0 · M-X5] 传播计划（谁被推到哪一格）。只算不写。 */
        knowledgePreviewPlan(payload, opts) {
            const KP = _knowledgePreviewLib();
            if (!KP || typeof KP.propagationPlan !== 'function') return this._knowledgePreviewAbsent('plan-unavailable');
            try { return KP.propagationPlan(payload, opts); }
            catch (e) { errLog(e, 'plugin.knowledgePreviewPlan'); return this._knowledgePreviewAbsent('thrown'); }
        }
        /** [v3.315.0 · M-X5] 单条预演（逐人五档；依赖缺席 ⇒ 判不了，不假装改不动）。 */
        knowledgePreviewRun(payload, trace, opts) {
            const KP = _knowledgePreviewLib();
            if (!KP || typeof KP.previewPropagation !== 'function') return this._knowledgePreviewAbsent();
            try {
                const res = KP.previewPropagation(payload, trace, this._knowledgePreviewDeps(), opts);
                this._lastPreview = {
                    at: Date.now(), path: res.path || '', verdict: res.verdict || '',
                    wouldAffect: res.wouldAffect || 0, noChange: res.noChange || 0,
                    revealSecret: res.revealSecret || 0, indeterminate: res.indeterminate || 0,
                    duplicateEvidence: res.duplicateEvidence || 0, decidable: res.decidable !== false
                };
                return res;
            } catch (e) { errLog(e, 'plugin.knowledgePreviewRun'); return this._knowledgePreviewAbsent('thrown'); }
        }
        /** [v3.315.0 · M-X5] 批量预演（与单条同函）。只算不写。 */
        knowledgePreviewBatch(plans, trace, opts) {
            const KP = _knowledgePreviewLib();
            if (!KP || typeof KP.previewBatch !== 'function') {
                return { kind: 'knowledge_preview', rows: [], total: 0, measurable: false,
                    byVerdict: {}, wouldAffect: 0, noChange: 0, revealSecret: 0, breakBoundary: 0,
                    indeterminate: 0, duplicateEvidence: 0, riskiest: '', order: [],
                    reason: 'module-absent', zeroWrite: true };
            }
            try {
                const res = KP.previewBatch(plans, trace, this._knowledgePreviewDeps(), opts);
                this._lastPreview = {
                    at: Date.now(), path: 'batch', verdict: 'batch', wouldAffect: res.wouldAffect || 0,
                    noChange: res.noChange || 0, revealSecret: res.revealSecret || 0,
                    indeterminate: res.indeterminate || 0, duplicateEvidence: res.duplicateEvidence || 0,
                    decidable: true, riskiest: res.riskiest || '', order: res.order || [],
                    total: res.total || 0
                };
                return res;
            } catch (e) { errLog(e, 'plugin.knowledgePreviewBatch');
                return { kind: 'knowledge_preview', rows: [], total: 0, measurable: false,
                    byVerdict: {}, wouldAffect: 0, noChange: 0, revealSecret: 0, breakBoundary: 0,
                    indeterminate: 0, duplicateEvidence: 0, riskiest: '', order: [],
                    reason: 'thrown', zeroWrite: true }; }
        }
        /** [v3.315.0 · M-X5] 作者预演面（带理由与改法建议，剥一切正文键）。 */
        knowledgePreviewAuthorFace(preview) {
            const KP = _knowledgePreviewLib();
            if (!KP || typeof KP.authorFace !== 'function') {
                return { audience: 'author', rows: [], keys: [], carriesBody: false, zeroWrite: true,
                    reason: 'module-absent' };
            }
            try { return KP.authorFace(preview); }
            catch (e) { errLog(e, 'plugin.knowledgePreviewAuthorFace');
                return { audience: 'author', rows: [], keys: [], carriesBody: false, zeroWrite: true, reason: 'thrown' }; }
        }
        /** [v3.315.0 · M-X5] 角色生成面（**严格收窄**：只有会变且终态为已知者）。 */
        knowledgePreviewCharacterFace(preview) {
            const KP = _knowledgePreviewLib();
            if (!KP || typeof KP.characterFace !== 'function') {
                return { audience: 'character', rows: [], keys: [], withheld: 0, zeroWrite: true,
                    reason: 'module-absent' };
            }
            try { return KP.characterFace(preview); }
            catch (e) { errLog(e, 'plugin.knowledgePreviewCharacterFace');
                return { audience: 'character', rows: [], keys: [], withheld: 0, zeroWrite: true, reason: 'thrown' }; }
        }
        /** [v3.315.0 · M-X5] 面自述：依赖缺哪一格、缺了会怎样（只读、不抛）。 */
        knowledgePreviewDescribe() {
            const KP = _knowledgePreviewLib();
            if (!KP || typeof KP.describe !== 'function') {
                return { name: 'knowledge-preview', version: 0, previewVersion: 0, paths: [], directions: [],
                    pathActions: [], pathReasons: [], pathVias: [], previewVerdicts: [], planVerdicts: [],
                    identities: [], authorKeys: [], characterKeys: [], characterFaceForbidden: [],
                    pathsDistinctDirections: false, pathsExhaustive: false,
                    indeterminateDistinctFromNoChange: false, facesDisjoint: false,
                    requiredDeps: [], optionalDeps: [], missingDeps: ['KNOWLEDGE_TRACE'], optionalMissing: [],
                    offline: true, zeroWrite: true, note: '知识预演模块未加载（knowledge-preview.js）',
                    reason: 'module-unavailable' };
            }
            try {
                const d = KP.describe(this._knowledgePreviewDeps());
                d.reason = (d.missingDeps && d.missingDeps.length) ? 'deps-missing' : '';
                return d;
            } catch (e) { errLog(e, 'plugin.knowledgePreviewDescribe');
                return { name: 'knowledge-preview', version: 0, previewVersion: 0, paths: [], directions: [],
                    pathActions: [], pathReasons: [], pathVias: [], previewVerdicts: [], planVerdicts: [],
                    identities: [], authorKeys: [], characterKeys: [], characterFaceForbidden: [],
                    pathsDistinctDirections: false, pathsExhaustive: false,
                    indeterminateDistinctFromNoChange: false, facesDisjoint: false,
                    requiredDeps: [], optionalDeps: [], missingDeps: [], optionalMissing: [],
                    offline: true, zeroWrite: true, note: '自述抛错', reason: 'thrown' }; }
        }
        /**
         * [v3.315.0 · M-X5] 诊断一行。**五种坏法分开写**：
         *   模块没挂 / 依赖缺格 / 路径表不齐 / 「判不了」与「改不动」同形 / 两面键集相交 / 面在位。
         */
        knowledgePreviewLine() {
            try {
                const KP = _knowledgePreviewLib();
                if (!KP || typeof KP.line !== 'function') return '模块未加载（knowledge-preview.js）';
                const d = this.knowledgePreviewDescribe();
                if (d.reason === 'module-unavailable') return '模块未加载（knowledge-preview.js）';
                if (d.reason === 'thrown') return '—（诊断异常）';
                const last = this._lastPreview || null;
                return KP.line({ last: last, deps: this._knowledgePreviewDeps() });
            } catch (e) { errLog(e, 'plugin.knowledgePreviewLine'); return '—（诊断异常）'; }
        }

        /* ────────────────────────────────────────────────────────────────────────
         * [v3.316.0 · M-X7] 提取质量反馈与可控策略配置
         *
         * 【与「召回解释」（X8）那一面的关系（两个方向）】
         *   召回面答「**召回链路**断在哪一格」（注入没进来 / 被裁掉 / 源被关）；
         *   本面答「**提取**这次为什么错、怎样减少同类错误」。
         *   本面复用 X3 的对照重跑（`projection-pipeline.js` 是唯一真源）作为建议的**背书**，
         *   但**不自己跑对照**（跑法归 X3）；诊断面**分开两行**，不合成一行。
         *
         * 【宿主只做三件事，绝不自己算】
         *   ① **装配**：对照重跑经 `_extractFeedbackDeps()` 注入（唯一装配点，键名与内核
         *      `REQUIRED_DEPS[].key` 逐字一致 —— 改名会静默变成「依赖缺席」）；
         *   ② **转发**：出口把实参原样交给内核，**不改写返回值**；
         *   ③ **留痕**：只留读数摘要（存整份反馈列表就是第二份事实库）。
         *
         * 【本面**零落笔**】反馈是「意见」，写法归 owner 侧经既有门 —— 本面若自己写账，
         *   就成了「反馈直接成为历史事实」，正是 M-X7 验收①要拦的那条。
         */
        /** [v3.316.0 · M-X7] 本面的**唯一装配点**。对照重跑缺席一律 null（不是 `{}`）。 */
        _extractFeedbackDeps() {
            /* 与 `memoryToolsSources()` 同规格：**就地取库**（每件只在此函数取一次，天然唯一）。 */
            const PP = _moduleLib(() => window.LonShaProjectionPipeline, 'projection-pipeline.js');
            const RX = _moduleLib(() => window.LonShaRecallExplain, 'recall-explain.js');
            return {
                COMPARE: (PP && typeof PP.compareStrategies === 'function') ? PP : null,
                RECALL_EXPLAIN: (RX && typeof RX.explainRecall === 'function') ? RX : null
            };
        }
        /** [v3.316.0 · M-X7] 内核不可达时的**同键降级**（`ok:false` + `reason` 分开写）。 */
        _extractFeedbackAbsent(reason) {
            const r = (typeof reason === 'string' && reason) ? reason : 'module-absent';
            return {
                ok: false, state: 'absent', reason: r, list: [], count: 0,
                writesHistoryFact: false, autoParamTuning: false, decidable: false,
                byClass: {}, byLink: {}, unknown: 0, unlinked: 0, total: 0,
                notes: ['提取反馈面不可达（extract-feedback.js 未加载）⇒ 报 ok:false/' + r
                    + '，**不报「改过了没事」也不报「没反馈」']
            };
        }
        /** [v3.316.0 · M-X7] 归类（五类 → 五个面；未知类别不落默认档）。只算不写。 */
        extractFeedbackClassify(item) {
            const FB = _extractFeedbackLib();
            if (!FB || typeof FB.classify !== 'function') return this._extractFeedbackAbsent('classify-unavailable');
            try { return FB.classify(item); }
            catch (e) { errLog(e, 'plugin.extractFeedbackClassify'); return this._extractFeedbackAbsent('thrown'); }
        }
        /** [v3.316.0 · M-X7] 记录一条反馈（**不写历史事实**，返回面显式带 false）。 */
        extractFeedbackRecord(list, item, opts) {
            const FB = _extractFeedbackLib();
            if (!FB || typeof FB.record !== 'function') return this._extractFeedbackAbsent('record-unavailable');
            try {
                const res = FB.record(list, item, opts);
                this._lastFeedback = {
                    at: Date.now(), link: res.link || '', classified: (res.classified === true),
                    count: res.count || 0, writesHistoryFact: false
                };
                return res;
            } catch (e) { errLog(e, 'plugin.extractFeedbackRecord'); return this._extractFeedbackAbsent('thrown'); }
        }
        /** [v3.316.0 · M-X7] 反馈读数（按五类 + 关联四态分列）。只算不写。 */
        extractFeedbackTally(list, opts) {
            const FB = _extractFeedbackLib();
            if (!FB || typeof FB.tally !== 'function') return this._extractFeedbackAbsent('tally-unavailable');
            try {
                const t = FB.tally(list, opts);
                this._lastFeedbackTally = {
                    at: Date.now(), total: t.total || 0, unknown: t.unknown || 0,
                    unlinked: t.unlinked || 0, measurable: (t.measurable === true)
                };
                return t;
            } catch (e) { errLog(e, 'plugin.extractFeedbackTally'); return this._extractFeedbackAbsent('thrown'); }
        }
        /** [v3.316.0 · M-X7] 策略建议（**背书只看真读数**；`apply.auto` 恒 false）。 */
        extractFeedbackSuggest(feedback, trace, opts) {
            const FB = _extractFeedbackLib();
            if (!FB || typeof FB.suggest !== 'function') {
                return { ok: false, reason: 'module-absent', suggestions: [], count: 0,
                    autoParamTuning: false, proof: 'unproven', decidable: false };
            }
            try {
                const res = FB.suggest(feedback, trace, opts);
                this._lastFeedback = {
                    at: Date.now(), proof: res.proof || 'unproven', count: res.count || 0,
                    decidable: (res.decidable === true), writesHistoryFact: false, autoParamTuning: false
                };
                return res;
            } catch (e) { errLog(e, 'plugin.extractFeedbackSuggest');
                return { ok: false, reason: 'thrown', suggestions: [], count: 0,
                    autoParamTuning: false, proof: 'unproven', decidable: false }; }
        }
        /** [v3.316.0 · M-X7] 应用闸（等待用户 ≠ 不可用 ≠ 判不了）。 */
        extractFeedbackGate(suggestion, opts) {
            const FB = _extractFeedbackLib();
            if (!FB || typeof FB.gate !== 'function') {
                return { state: 'indeterminate', decidable: false, mayApply: false,
                    why: '模块未加载（extract-feedback.js）' };
            }
            try { return FB.gate(suggestion, opts); }
            catch (e) { errLog(e, 'plugin.extractFeedbackGate');
                return { state: 'indeterminate', decidable: false, mayApply: false, why: '抛错（已降级）' }; }
        }
        /** [v3.316.0 · M-X7] 批量建议（与单条同函）。只算不写。 */
        extractFeedbackBatch(list, trace, opts) {
            const FB = _extractFeedbackLib();
            if (!FB || typeof FB.batch !== 'function') {
                return { ok: false, reason: 'module-absent', measurable: false, total: 0,
                    indeterminate: 0, rows: [], byProof: {}, autoParamTuning: false };
            }
            try { return FB.batch(list, trace, opts); }
            catch (e) { errLog(e, 'plugin.extractFeedbackBatch');
                return { ok: false, reason: 'thrown', measurable: false, total: 0,
                    indeterminate: 0, rows: [], byProof: {}, autoParamTuning: false }; }
        }
        /** [v3.316.0 · M-X7] 面自述：依赖缺哪一格、缺了会怎样（只读、不抛）。 */
        extractFeedbackDescribe() {
            const FB = _extractFeedbackLib();
            if (!FB || typeof FB.describe !== 'function') {
                return { version: 0, kind: 'extract_feedback', classes: [], classLabels: {}, classTargets: {},
                    classKinds: {}, targetDistinct: false, proofVerdicts: [], linkStates: [], gateStates: [],
                    evidenceFields: [], maxRecords: 0, autoParamTuning: false, writesHistoryFact: false,
                    evidenceDigestOnly: true, requiredDeps: [], optionalDeps: [],
                    missingDeps: ['COMPARE'], presentDeps: [], optionalMissing: [],
                    indeterminateDistinct: false, note: '提取反馈模块未加载（extract-feedback.js）',
                    reason: 'module-unavailable' };
            }
            try {
                const d = FB.describe(this._extractFeedbackDeps());
                d.reason = '';
                return d;
            } catch (e) { errLog(e, 'plugin.extractFeedbackDescribe');
                return { version: 0, kind: 'extract_feedback', classes: [], classLabels: {}, classTargets: {},
                    classKinds: {}, targetDistinct: false, proofVerdicts: [], linkStates: [], gateStates: [],
                    evidenceFields: [], maxRecords: 0, autoParamTuning: false, writesHistoryFact: false,
                    evidenceDigestOnly: true, requiredDeps: [], optionalDeps: [],
                    missingDeps: [], presentDeps: [], optionalMissing: [],
                    indeterminateDistinct: false, note: '自述抛错', reason: 'thrown' }; }
        }
        /**
         * [v3.316.0 · M-X7] 诊断一行。**五种坏法分开写**：
         *   模块没挂 / 五类指向的面重复 / 对照缺格（建议一律 unproven）/ 面在位 / 有反馈读数。
         */
        extractFeedbackLine() {
            try {
                const FB = _extractFeedbackLib();
                if (!FB || typeof FB.line !== 'function') return '模块未加载（extract-feedback.js）';
                const d = this.extractFeedbackDescribe();
                if (d.reason === 'module-unavailable') return '模块未加载（extract-feedback.js）';
                if (d.reason === 'thrown') return '—（诊断异常）';
                return FB.line({ tally: this._lastFeedbackTally || null, deps: this._extractFeedbackDeps() });
            } catch (e) { errLog(e, 'plugin.extractFeedbackLine'); return '—（诊断异常）'; }
        }
        /* ────────────────────────────────────────────────────────────────────────
         * [v3.317.0 · M-X3] 项目 / 卷 / 章节管理面（用户层）
         *
         * 【与「分卷接续」（X7）那一面的关系（两个方向）】
         *   接续面答「**这一卷怎么接出去**」（建包 / 选面 / 源还在不在）；
         *   本面答「**这个项目存在不存在、挂在哪儿、能不能并存**」（立项 / 绑定 / 归档 / 隔离）。
         *   两面的读取口径**只有一份真源**：卷目录一律**转发** `volume-continuation.js` 的
         *   `listVolumes`，源状态一律**镜像**它的 `resolveSourceState` —— 本面不留第二份目录。
         *   故诊断面**分开两行**（与「分卷接续」分列），不合成一行。
         *
         * 【宿主只做三件事，绝不自己算】
         *   ① **装配**：分卷接续内核经 `_projectRegistryDeps()` 注入（唯一装配点，键名与内核
         *      `REQUIRED_DEPS[].key` 逐字一致 —— 改名会静默变成「依赖缺席」，判据按名对账）；
         *   ② **转发**：出口把实参原样交给内核，**不改写返回值**；
         *   ③ **留痕**：只留读数摘要（存整份项目表就是第二份目录真源）。
         *
         * 【本面**零落笔**】计划只出计划（`zeroWrite:true`）：写法归 owner 侧经既有门 ——
         *   本面若自己写账，「没选项目」就会多出一条绕过隔离的写入路径，正是验收①要拦的那条。
         */
        /** [v3.317.0 · M-X3] 本面的**唯一装配点**。分卷接续内核缺席一律 null（不是 `{}`）。 */
        _projectRegistryDeps() {
            /* 与 `memoryToolsSources()` 同规格：**就地取库**（每件只在此函数取一次，天然唯一）。
             * ★ 这里取的是 **X7 分卷接续内核**（`volume-continuation.js` 是目录与源状态的
             *   唯一真源），**不是本面模块本身** —— 取成本面的取库口就是一个空转的依赖
             *   （实测自伤：首版把本面的取库口当成了它，`volumesOf` 照旧报目录判不了）。 */
            const VC = _moduleLib(() => window.LonShaVolumeContinuation, 'volume-continuation.js');
            return {
                VOLUME_CONTINUATION: (VC && typeof VC.listVolumes === 'function'
                    && typeof VC.resolveSourceState === 'function') ? VC : null
            };
        }
        /** [v3.317.0 · M-X3] 内核不可达时的**同键降级**（`ok:false` + `reason` 分开写）。 */
        _projectRegistryAbsent(reason) {
            const r = (typeof reason === 'string' && reason) ? reason : 'module-absent';
            return {
                ok: false, state: 'absent', reason: r, project: null, verdict: 'indeterminate',
                decidable: false, entries: [], count: 0, duplicate: false, zeroWrite: true,
                volumes: [], chapterCount: 0, removed: 0, bindingsKept: 0, importId: '',
                notes: ['项目面模块不可达（project-registry.js 未加载）⇒ 报 ok:false/' + r
                    + '，**不报「没有项目」也不报「已隔离」**（缺席与隔离不同形）']
            };
        }
        /** [v3.317.0 · M-X3] 项目归一（**id 非空是唯一「已选中」证据**）。只算不写。 */
        projectRegistryNormalize(raw, opts) {
            const PR = _projectRegistryLib();
            if (!PR || typeof PR.normalizeProject !== 'function') return this._projectRegistryAbsent('normalize-unavailable');
            try {
                const np = PR.normalizeProject(raw, opts);
                /* ★ selected:false（没选项目）**本身就是产品状态**（默认隔离），不记会让诊断行
                 *   分不清「没选」与「模块没挂」。 */
                this._lastProject = {
                    at: Date.now(), selected: np.selected === true, projectId: (np.project && np.project.projectId) || '',
                    /* [v3.329.0 · M4-O1] 宇宙是**回收范围键的细界**(project-registry 的
                     *   `normalizeProject` 缺省把 universe 置为项目 id ⇒ 这里取到的恒非空,
                     *   除非根本没选项目)。不记它,回收面就只剩「按名字合」那一条轴。 */
                    universe: (np.project && np.project.universe) || '',
                    title: (np.project && np.project.title) || '', state: (np.project && np.project.state) || '',
                    volumeCount: np.volumeCount || 0, chapterCount: np.chapterCount || 0,
                    bindingCount: np.bindings ? (np.bindings.session.length + np.bindings.branch.length + np.bindings.character.length) : 0,
                    reason: np.reason || '', project: np.project || null
                };
                return np;
            } catch (e) { errLog(e, 'plugin.projectRegistryNormalize'); return this._projectRegistryAbsent('thrown'); }
        }
        /** [v3.317.0 · M-X3] 挂一个绑定（会话 / 分支 / 角色三类；重复绑定是**正常读数**）。 */
        projectRegistryBind(project, kind, value, opts) {
            const PR = _projectRegistryLib();
            if (!PR || typeof PR.bindTo !== 'function') return this._projectRegistryAbsent('bind-unavailable');
            try { return PR.bindTo(project, kind, value, opts); }
            catch (e) { errLog(e, 'plugin.projectRegistryBind'); return this._projectRegistryAbsent('thrown'); }
        }
        /** [v3.317.0 · M-X3] 解除绑定（`'all'` / 不给 ⇒ 全部解绑）。**不等于归档**（不清 state 为 archived）。 */
        projectRegistryUnbind(project, kindOrAll) {
            const PR = _projectRegistryLib();
            if (!PR || typeof PR.unbind !== 'function') return this._projectRegistryAbsent('unbind-unavailable');
            try { return PR.unbind(project, kindOrAll); }
            catch (e) { errLog(e, 'plugin.projectRegistryUnbind'); return this._projectRegistryAbsent('thrown'); }
        }
        /** [v3.317.0 · M-X3] 归档（冻结 state，**保留绑定** —— 归档与解绑是两件事，不得互代）。 */
        projectRegistryArchive(project, opts) {
            const PR = _projectRegistryLib();
            if (!PR || typeof PR.archiveProject !== 'function') return this._projectRegistryAbsent('archive-unavailable');
            try { return PR.archiveProject(project, opts); }
            catch (e) { errLog(e, 'plugin.projectRegistryArchive'); return this._projectRegistryAbsent('thrown'); }
        }
        /** [v3.317.0 · M-X3] 读卷目录（**只转发** X7 `listVolumes`；内核缺席 ⇒ 判不了，不自己列一遍）。 */
        projectRegistryVolumes(project, opts) {
            const PR = _projectRegistryLib();
            if (!PR || typeof PR.volumesOf !== 'function') return this._projectRegistryAbsent('volumes-unavailable');
            try {
                const res = PR.volumesOf(project, this._projectRegistryDeps(), opts);
                this._lastProjectVolumes = {
                    at: Date.now(), decidable: res.decidable === true, count: res.count || 0,
                    chapterCount: res.chapterCount || 0, via: res.via || '', reason: res.reason || ''
                };
                return res;
            } catch (e) { errLog(e, 'plugin.projectRegistryVolumes'); return this._projectRegistryAbsent('thrown'); }
        }
        /** [v3.317.0 · M-X3] 作用域判定（isolated / same-project / cross-project / indeterminate 四态不压格）。 */
        projectRegistryScope(a, b, project) {
            const PR = _projectRegistryLib();
            if (!PR || typeof PR.scopeOf !== 'function') return this._projectRegistryAbsent('scope-unavailable');
            try { return PR.scopeOf(a, b, project); }
            catch (e) { errLog(e, 'plugin.projectRegistryScope'); return this._projectRegistryAbsent('thrown'); }
        }
        /** [v3.317.0 · M-X3] 合并判定（★ 同名不同宇宙 ⇒ **不是同一人**；仅名字对得上 ⇒ 候选、永不自动合）。 */
        projectRegistryMergeCheck(a, b, project, opts) {
            const PR = _projectRegistryLib();
            if (!PR || typeof PR.mergable !== 'function') return this._projectRegistryAbsent('merge-unavailable');
            try {
                const res = PR.mergable(a, b, project, opts);
                this._lastProjectMerge = {
                    at: Date.now(), verdict: res.verdict || '', mayMerge: res.mayMerge === true,
                    decidable: res.decidable === true, requiresConsent: res.requiresConsent === true
                };
                return res;
            } catch (e) { errLog(e, 'plugin.projectRegistryMergeCheck'); return this._projectRegistryAbsent('thrown'); }
        }
        /** [v3.317.0 · M-X3] 导入计划（★ 未选项目一律 blocked；重复导入是**正常读数**；跨宇宙默认阻）。只出计划不落笔。 */
        projectRegistryPlanImport(pack, project, seen, opts) {
            const PR = _projectRegistryLib();
            if (!PR || typeof PR.planImport !== 'function') return this._projectRegistryAbsent('plan-unavailable');
            try {
                const res = PR.planImport(pack, project, seen, opts);
                this._lastProjectImport = {
                    at: Date.now(), state: res.state || '', reason: res.reason || '', count: res.count || 0,
                    duplicate: res.duplicate === true, decidable: res.decidable === true, zeroWrite: true
                };
                return res;
            } catch (e) { errLog(e, 'plugin.projectRegistryPlanImport'); return this._projectRegistryAbsent('thrown'); }
        }
        /** [v3.317.0 · M-X3] 撤销来源边界（★ **无来源件不能撤** —— 那是清库，不是撤销）。 */
        projectRegistryRevokeBoundary(pack, project, opts) {
            const PR = _projectRegistryLib();
            if (!PR || typeof PR.revokeBoundaryOf !== 'function') return this._projectRegistryAbsent('boundary-unavailable');
            try { return PR.revokeBoundaryOf(pack, project, opts); }
            catch (e) { errLog(e, 'plugin.projectRegistryRevokeBoundary'); return this._projectRegistryAbsent('thrown'); }
        }
        /** [v3.317.0 · M-X3] 重新接线（**只镜像** X7 判定；内核缺席 ⇒ unknown + 不可跳转，不伪装仍可跳）。 */
        projectRegistryRelink(ref, liveSources, opts) {
            const PR = _projectRegistryLib();
            if (!PR || typeof PR.relink !== 'function') return this._projectRegistryAbsent('relink-unavailable');
            try {
                const res = PR.relink(ref, liveSources, this._projectRegistryDeps(), opts);
                this._lastProjectRelink = {
                    at: Date.now(), state: res.state || '', navigable: res.navigable === true,
                    decidable: res.decidable === true, reason: res.reason || ''
                };
                return res;
            } catch (e) { errLog(e, 'plugin.projectRegistryRelink'); return this._projectRegistryAbsent('thrown'); }
        }
        /** [v3.317.0 · M-X3] 面自述：依赖缺哪一格、缺了会怎样（只读、不抛）。 */
        projectRegistryDescribe() {
            const PR = _projectRegistryLib();
            if (!PR || typeof PR.describe !== 'function') return this._projectRegistryAbsent('module-unavailable');
            try {
                const d = PR.describe(this._projectRegistryDeps());
                d.reason = '';
                return d;
            } catch (e) { errLog(e, 'plugin.projectRegistryDescribe'); return this._projectRegistryAbsent('thrown'); }
        }
        /**
         * [v3.317.0 · M-X3] 诊断一行。**六种坏法分开写**：
         *   模块没挂 / 抛错 / 依赖缺格（目录与源状态判不了）/ **未选项目（维持隔离）** / 项目读数 / 空。
         *   ★「未选项目（维持隔离）」与「选了但零卷」**绝不同形** —— 验收①点名的就是前者。
         */
        projectRegistryLine() {
            try {
                const PR = _projectRegistryLib();
                if (!PR || typeof PR.line !== 'function') return '模块未加载（project-registry.js）';
                const d = this.projectRegistryDescribe();
                if (d.reason === 'module-unavailable') return '模块未加载（project-registry.js）';
                if (d.reason === 'thrown') return '—（诊断异常）';
                const lk = this._lastProjectRelink || null;
                return PR.line({
                    project: this._lastProject ? this._lastProject.project : null,
                    importCount: this._lastProjectImport ? (this._lastProjectImport.state === 'applied' ? 1 : 0) : 0,
                    duplicateCount: this._lastProjectImport && this._lastProjectImport.duplicate ? 1 : 0,
                    sourceState: lk ? lk.state : '',
                    navigable: lk ? lk.navigable : null,
                    deps: this._projectRegistryDeps()
                });
            } catch (e) { errLog(e, 'plugin.projectRegistryLine'); return '—（诊断异常）'; }
        }
        /* ────────────────────────────────────────────────────────────────────────
         * [v3.311.0 · M-X2] 修复**落定面**（从「流程完成」到「所有派生面落盘完成」）
         *
         * 【宿主只做三件事，绝不自己算】
         *   ① **装配**：把 `repair-loop` 的登记表 + 时钟经 `_settleDeps()` 注入（唯一装配点，
         *      键名与 `repair-settle.js` 的 `REQUIRED_DEPS[].key` 逐字一致 —— 改名会静默
         *      变成「依赖缺席」，故判据套件按名对账）；
         *   ② **转发**：出口把实参原样交给内核，**不改写返回值**；
         *   ③ **降级**：内核整个不可达时给**同键形状**的回执（不是投影真源，只保证
         *      「取不到」时下游按同一键面读，不会读到 undefined）。
         *
         * 【为什么不把落定读数缓存进快照】
         *   与 M-X1 / X9 同因：本面**按需调用**（每次要过一遍记录的全部受影响项 +
         *   全部召回产物），塞进每轮快照 = 每轮付一遍扫描代价，且会把「这一条还没看」
         *   伪装成「看了、没问题」—— 两者在快照里同形。下游要看面自述时走
         *   `repairSettleDescribe()`（自带依赖在场读数）。
         * ──────────────────────────────────────────────────────────────────────── */
        /**
         * [v3.311.0 · M-X2] 落定面的**唯一装配点**。三件里有两件同出 `repair-loop.js`
         *   （**单一真源**：本模块不另抄一份派生件清单 / 证据词表），`now` 是宿主时钟
         *   （可注入 —— 没有它「票据过期」这条判据只能靠 `Date.now()`，判据无法对过期取证）。
         *   取不到一律 null（不是 `{}`）：内核按「值为空即缺席」判 `deps-missing`，
         *   而 `{}` 会装作「在位但空」—— 两者处置相反，不在这里编空壳。
         */
        _settleDeps(now) {
            const RL = _repairLoopLib();
            const RS = _repairSettleLib();
            const pick = (o, k) => ((o && o[k] !== undefined && o[k] !== null) ? o[k] : null);
            return {
                KINDS: pick(RL, 'KINDS'),
                EVIDENCE: pick(RL, 'EVIDENCE'),
                now: Number.isFinite(Number(now)) ? Number(now) : Date.now()
                /* ★ 只给**该给的**三件：`REQUIRED_DEPS` 之外的键一律不塞 ——
                 *   塞了会让「依赖面」这个读数里混进不是依赖的东西（本仓的「同一形状两个读数」）。 */
            };
        }
        /** [v3.311.0 · M-X2] 取一条修复记录（归一后）。取不到给 null（**不编空记录**）。 */
        repairRecord(ref) {
            try {
                const RL = _repairLoopLib();
                if (!RL || typeof RL.normalize !== 'function' || !this._repairState) return null;
                const st = RL.normalize(this._repairState);
                const id = String((ref && (ref.id || ref)) || '').trim();
                if (!id) return null;
                return (st.repairs || []).find((r) => r.id === id) || null;
            } catch (e) { errLog(e, 'engine.repairRecord'); return null; }
        }
        /**
         * [v3.311.0 · M-X2] **落定判定**出口（验收①：仅登记不得显示「事实已纠正」）。
         *   返回 { ok, verdict, reason, counts, coherence, faces, line }。
         *   内核不可达 ⇒ `ok:false` + `reason:'module-unavailable'`（**不报 verdict** ——
         *   报一个 'registered' 会让「判不了」与「确实只登记了」同形）。
         */
        repairSettleView(ref, opts) {
            const o = opts || {};
            const RS = _repairSettleLib();
            if (!RS || typeof RS.verdictOf !== 'function') {
                return { ok: false, reason: 'module-unavailable', verdict: null, counts: null, coherence: null, faces: null, line: '模块未加载（repair-settle.js）' };
            }
            try {
                const rec = (ref && ref.affected) ? ref : this.repairRecord(ref);
                if (!rec) return { ok: false, reason: 'not-found', verdict: null, counts: null, coherence: null, faces: null, line: '未找到这条修复记录' };
                const v = RS.verdictOf(rec);
                const rev = Number.isFinite(Number(o.rev)) ? Number(o.rev) : (Number(this._mutationEpoch) || 0);
                const faces = (typeof RS.facesOf === 'function') ? RS.facesOf(rec, rev) : null;
                const out = {
                    ok: true, id: rec.id, verdict: v.verdict, reason: v.reason, counts: v.counts || null,
                    coherence: faces ? faces.coherence : null, faces: faces ? faces.faces : null,
                    rev: faces ? faces.rev : null,
                    line: RS.line(rec)
                };
                this._lastRepairSettle = { at: Date.now(), id: rec.id, verdict: out.verdict, coherence: out.coherence ? out.coherence.state : null };
                return out;
            } catch (e) { errLog(e, 'engine.repairSettleView'); return { ok: false, reason: 'thrown', verdict: null, counts: null, coherence: null, faces: null, line: '—（落定面异常）' }; }
        }
        /**
         * [v3.311.0 · M-X2] **预览票据**出口（验收③：切聊后旧预览被拒绝）。
         *   `repairPreviewTicket()` 产票（会话 + 代际 + 修订三样同源拼键）；
         *   `repairPreviewCheck(ticket)` 校验（五种不同形理由）。
         *   产票**不写任何状态**（票由调用方自己保管 —— 宿主不替下游存票，
         *   存了就是第二份会话归属真源）。
         */
        repairPreviewTicket(input) {
            const RS = _repairSettleLib();
            if (!RS || typeof RS.ticket !== 'function') return null;
            try {
                const i = input || {};
                return RS.ticket({
                    chatId: (i.chatId != null) ? i.chatId : this.getCurrentChatId(),
                    epoch: (i.epoch != null) ? i.epoch : (Number(this._mutationEpoch) || 0),
                    rev: (i.rev != null) ? i.rev : this.repairRevision(),
                    nonce: i.nonce, now: i.now
                });
            } catch (e) { errLog(e, 'engine.repairPreviewTicket'); return null; }
        }
        repairPreviewCheck(t, ctx) {
            const RS = _repairSettleLib();
            if (!RS || typeof RS.checkTicket !== 'function') return { ok: false, reason: 'module-unavailable' };
            try {
                const c = ctx || {};
                return RS.checkTicket(t, {
                    chatId: (c.chatId != null) ? c.chatId : this.getCurrentChatId(),
                    epoch: (c.epoch != null) ? c.epoch : (Number(this._mutationEpoch) || 0),
                    now: (c.now != null) ? c.now : Date.now()
                });
            } catch (e) { errLog(e, 'engine.repairPreviewCheck'); return { ok: false, reason: 'thrown' }; }
        }
        /**
         * [v3.311.0 · M-X2] **只重试失败项**（验收③：失败项单独重试，不整批重放）。
         *
         *   与 `applyRepairPlan` 的分工：那个是「把整条修复按原清单走一遍」，
         *   本方法是「只把上次没成的那些项，按它们的 retryKey 再走一遍」。
         *   两者的落笔通道**同一份**（`_repairOwners()` + `_verifyRepairItem()`），
         *   不另写一套 —— 两套落笔通道迟早会分叉成两种语义。
         * @returns {Promise<object|null>} 与 applyRepairPlan 同形的回执；模块缺席 ⇒ null
         */
        async retryRepairItems(ref, opts = {}) {
            const o = opts || {};
            let applied = 0, persisted = null, readbackOk = null;
            try {
                const RS = _repairSettleLib();
                const RL = _repairLoopLib();
                if (!RS || typeof RS.retryOf !== 'function' || !RL || typeof RL.settle !== 'function') {
                    this._lastRepairRetry = { at: Date.now(), why: 'module-unavailable' };
                    return null;
                }
                const rec0 = (ref && ref.affected) ? ref : this.repairRecord(ref);
                if (!rec0) {
                    this._lastRepairRetry = { at: Date.now(), why: 'not-found' };
                    return null;
                }
                /* 重试次数从记录上读（`retryAttempt` 是本刀新增的那一格）——
                 *   为什么不从调用方拿：调用方每多传一次就多一次「这算第几次」的口径，
                 *   而这个数必须**只有一处**知道。 */
                const attempt = Number(rec0.retryAttempt) > 0 ? Number(rec0.retryAttempt) : 0;
                const plan = RS.retryOf(rec0, { attempt: attempt, includeUnproven: o.includeUnproven === true });
                if (plan.state === 'none') {
                    this._lastRepairRetry = { at: Date.now(), why: 'nothing-to-retry', id: rec0.id };
                    return { ok: true, id: rec0.id, reason: 'nothing-to-retry', applied: 0, verified: 0, readback: null, items: [], retry: plan };
                }
                if (plan.state === 'exhausted') {
                    /* ★ 「还能再试」与「试到底了」不同形：不抛、不静默，如实回执 + **不落笔**。 */
                    this._lastRepairRetry = { at: Date.now(), why: 'attempt-limit', id: rec0.id, attempt: attempt };
                    return { ok: false, id: rec0.id, reason: 'attempt-limit', applied: 0, verified: 0, readback: null, items: [], retry: plan };
                }
                let st = RL.normalize(this._repairState);
                const owners = this._repairOwners();
                const lease = { chatId: this.getCurrentChatId(), epoch: this._mutationEpoch };
                const results = [];
                const noteOf = (o.notes && typeof o.notes === 'object') ? o.notes : {};
                /* 逐项：改数据 → 核原数据（与 applyRepairPlan **同一批次口径**，只是**项的集合**
                 *   只含该重试的那些）。落盘回读与 settle 同样放在循环之后一次做完。 */
                for (const step of plan.items) {
                    const item = (rec0.affected || []).find((x) => x.key === step.key && x.kind === step.kind);
                    if (!item) continue;
                    const note = String(noteOf[step.key] || '').slice(0, 80);
                    const fn = owners[step.kind];
                    if (typeof fn !== 'function') {
                        st = RL.settle(st, { id: rec0.id, key: step.key, kind: step.kind, status: 'failed', note: 'no-inverse' }).state;
                        results.push({ kind: step.kind, key: step.key, basis: step.basis, status: 'failed', reason: 'no-inverse', retryKey: step.retryKey });
                        continue;
                    }
                    let r;
                    try { r = fn({ kind: step.kind, key: step.key, note: note }) || {}; }
                    catch (e) { errLog(e, 'engine.retryRepairItems.owner'); r = { ok: false, reason: 'thrown' }; }
                    if (!r.ok) {
                        st = RL.settle(st, { id: rec0.id, key: step.key, kind: step.kind, status: 'failed', note: String(r.reason || 'failed') }).state;
                        results.push({ kind: step.kind, key: step.key, basis: step.basis, status: 'failed', reason: String(r.reason || 'failed'), retryKey: step.retryKey });
                        continue;
                    }
                    applied++;
                    let originOk = false;
                    try { originOk = this._verifyRepairItem(step.kind, step.key, note) === true; }
                    catch (e) { errLog(e, 'engine.retryRepairItems.verify'); originOk = false; }
                    results.push({ kind: step.kind, key: step.key, basis: step.basis, status: 'done', originData: originOk, retryKey: step.retryKey });
                }
                const planLen = plan.items.length;
                let persistedSection = null;
                if (planLen && typeof this.storage?.save === 'function' && typeof this.storage?.load === 'function') {
                    try { persisted = (await this.storage.save(this.getCurrentChatId(), this.collectExport())) === true; }
                    catch (e) { errLog(e, 'engine.retryRepairItems.save'); persisted = false; }
                    try {
                        const back = await this.storage.load(this.getCurrentChatId(), { preserveRuntime: true });
                        persistedSection = (back && back.repairLog) ? back.repairLog : null;
                        readbackOk = (persisted === true && persistedSection !== null);
                    } catch (e) { errLog(e, 'engine.retryRepairItems.load'); readbackOk = false; }
                } else if (planLen) {
                    persisted = null; readbackOk = null;   /* 「没尝试」不判为真也不判为假 */
                }
                for (const res of results) {
                    if (res.status !== 'done') continue;
                    const originData = res.originData === true;
                    const evOk = (readbackOk === true);
                    st = RL.settle(st, {
                        id: rec0.id, key: res.key, kind: res.kind, status: 'done',
                        note: originData && evOk ? 'verified' : 'unverified',
                        originData: originData, persistedReadback: evOk
                    }).state;
                }
                /* 重试计数 +1（**只在这一批真有项要重试时**才加 —— 空转不该消耗额度）。 */
                if (planLen) {
                    const rec = (st.repairs || []).find((x) => x.id === rec0.id);
                    if (rec) rec.retryAttempt = attempt + 1;
                }
                this._repairState = st;
                const bad = results.filter((x) => x.status !== 'done').length;
                const stale = !this._leaseValid(lease);
                const rec2 = (st.repairs || []).find((x) => x.id === rec0.id) || rec0;
                const v = RS.verdictOf(rec2);
                const out = {
                    ok: bad === 0 && !stale && planLen > 0,
                    id: rec0.id,
                    applied: applied,
                    settled: rec2.status || null,
                    evidence: rec2.evidence || null,
                    verdict: v.verdict,
                    verified: results.filter((x) => x.originData === true).length,
                    persisted: persisted,
                    readback: readbackOk,
                    items: results,
                    retry: { state: plan.state, attempted: attempt, limit: plan.limit, candidate: plan.candidate, skipped: plan.skipped },
                    /* ★ 明说「本次**没有**重放哪些项」——「不整批重放」必须可读。 */
                    skipped: plan.skipped,
                    stale: stale,
                    reason: stale ? 'epoch-changed' : (bad === 0 ? '' : 'partial-failed')
                };
                if (stale) this._leaseDrop(lease, 'repairRetry', -1);
                this._lastRepairRetry = { at: Date.now(), why: out.reason || 'ok', id: rec0.id, applied: applied, verified: out.verified, readback: readbackOk, attempt: attempt + 1 };
                return out;
            } catch (e) {
                try {
                    this._lastRepairRetry = { at: Date.now(), why: 'threw', applied: applied, persisted: persisted, readback: readbackOk, err: (e && e.message) || String(e) };
                } catch (_e) { /* 留痕失败就作罢 */ }
                errLog(e, 'engine.retryRepairItems');
                return null;
            }
        }
        /**
         * [v3.311.0 · M-X2] **召回缓存跟随落定**（验收⑤：源、摘要、图谱、时间线、召回缓存
         *   跟随同代变化）。
         *
         *   【为什么必须由宿主做】内核是纯函数（`repair-settle.js` 不认识 `_recallArtifacts`，
         *   也不该认识）。宿主把产物数组与「哪些 id 被撤了」两样喂进去，内核指出该作废哪些，
         *   宿主用**既有写面** `recall-artifact.invalidateTurn` 真作废。
         *   ★ `isArtifactStale` 是**被动**的（调用方不问就永不算），本方法把它接成主动：
         *     落定之后自动扫一遍 —— 这正是计划第五条「召回缓存跟随同代变化」的落点。
         * @returns {object} { ok, state, count, invalidated, removed, reason }
         */
        repairInvalidateRecallCache(revokedIds, opts = {}) {
            const o = opts || {};
            try {
                const RS = _repairSettleLib();
                if (!RS || typeof RS.cacheOf !== 'function') return { ok: false, reason: 'module-unavailable', state: null, count: 0, invalidated: [], removed: 0 };
                const ids = Array.isArray(revokedIds) ? revokedIds.filter(Boolean) : [];
                const report = RS.cacheOf(this._recallArtifacts || [], ids);
                let removed = 0;
                if (report.count && o.dryRun !== true) {
                    const RA = _recallArtifactLib();
                    if (RA && typeof RA.invalidateTurn === 'function') {
                        let store = this._recallArtifacts || [];
                        for (const hit of report.invalidated) {
                            if (!hit.turnId) continue;
                            const r = RA.invalidateTurn(store, hit.turnId);
                            if (r && Array.isArray(r.store)) { store = r.store; removed += Number(r.removed) || 0; }
                        }
                        this._recallArtifacts = store;
                        this._recallArtifactEvictions = Object.assign({}, this._recallArtifactEvictions, { lastRemoved: removed, lastAt: Date.now() });
                    } else {
                        /* 作废面缺席 ⇒ **如实说没作废**，不把「指出了」当成「已经清了」。 */
                        return Object.assign({}, report, { ok: false, reason: 'invalidate-unavailable', removed: 0 });
                    }
                }
                const out = Object.assign({}, report, { ok: true, reason: o.dryRun === true ? 'dry-run' : '', removed: removed });
                this._lastRepairCache = { at: Date.now(), state: report.state, count: report.count, removed: removed, revoked: ids.length };
                return out;
            } catch (e) { errLog(e, 'engine.repairInvalidateRecallCache'); return { ok: false, reason: 'thrown', state: null, count: 0, invalidated: [], removed: 0 }; }
        }
        /** [v3.311.0 · M-X2] 落定面自述：依赖缺哪一格、缺了会怎样（只读、不抛）。 */
        repairSettleDescribe() {
            const RS = _repairSettleLib();
            if (!RS || typeof RS.describe !== 'function') {
                return { kind: 'repair-settle-describe', version: 0, verdicts: [], coherence: [], retryStates: [], ticketReasons: [], faces: [], present: 0, total: 0, missing: [], verdictsExhaustive: false, writesNothing: true, note: '模块未加载（repair-settle.js）', reason: 'module-unavailable' };
            }
            try {
                const d = RS.describe(this._settleDeps());
                d.reason = (d.missing && d.missing.length) ? 'deps-missing' : '';
                return d;
            } catch (e) { errLog(e, 'engine.repairSettleDescribe'); return { kind: 'repair-settle-describe', version: 0, verdicts: [], coherence: [], retryStates: [], ticketReasons: [], faces: [], present: 0, total: 0, missing: [], verdictsExhaustive: false, writesNothing: true, note: '自述抛错', reason: 'thrown' }; }
        }
        /**
         * [v3.311.0 · M-X2] 诊断一行。**七种坏法分开写**（本仓纪律）：
         *   模块没挂 / 依赖缺格 / 词表不自洽 / 未看过任何记录 / 最近一条的落定态。
         *   四种「没记录」的情形各不相同：没模块、没依赖、没看过、看过但没有记录。
         */
        repairSettleLine() {
            try {
                const RS = _repairSettleLib();
                if (!RS || typeof RS.line !== 'function') return '模块未加载（repair-settle.js）';
                const d = this.repairSettleDescribe();
                if (d.reason === 'module-unavailable') return '模块未加载（repair-settle.js）';
                if (d.reason === 'thrown') return '—（诊断异常）';
                if (String(d.reason || '').indexOf('deps-missing') === 0 || (d.missing && d.missing.length)) {
                    return '⚠️ 依赖缺格：' + (d.missing || []).map((m) => m.key).join('、') + '（' + d.present + '/' + d.total + '）';
                }
                if (d.verdictsExhaustive === false) return '⚠️ 判定词表不自洽（四态必须各自可达）';
                const last = this._lastRepairSettle || null;
                if (!last) return '待看（面在位 · 落定四态 ' + (d.verdicts || []).length + ' · 同代三态 ' + (d.coherence || []).length + ' · 面 ' + (d.faces || []).length + '）';
                const bits = ['最近 ' + last.id + ' ⇒ ' + last.verdict];
                if (last.coherence) bits.push('同代 ' + last.coherence);
                const rr = this._lastRepairRetry || null;
                if (rr) bits.push(rr.why === 'ok' ? ('重试 ' + (rr.applied || 0) + ' 项') : ('重试未成（' + rr.why + '）'));
                const cc = this._lastRepairCache || null;
                if (cc) bits.push('召回作废 ' + cc.removed + '/' + cc.count);
                return bits.join(' · ');
            } catch (e) { errLog(e, 'engine.repairSettleLine'); return '—（诊断异常）'; }
        }
        /** [v3.194] 当前未完成事项（事件线里缺结果/后续的）——计划点名「保留未完成事项」的读取面。不抛。 */
        outstandingThreads(filter) {
            try {
                const EC = _eventCompletenessLib();
                if (!EC || typeof EC.outstanding !== 'function' || !this._eventThreadState) return [];
                return EC.outstanding(this._eventThreadState, filter);
            } catch (e) { errLog(e, 'engine.outstandingThreads'); return []; }
        }
        /* [M3-O9] 时态读面的宿主出口。上层（诊断面、手机问答）用**同一份**读面，
         *   不各自摸 FV.readAt（那会漂移成两套时间口径）。两面都兜住模块缺席与异常。 */
        timeRead(at) {
            try {
                const FV = _factVersionLib();
                if (!FV || typeof FV.readAt !== 'function') return { ok: false, reason: 'module-unavailable', rows: [] };
                return FV.readAt(this._factVersionState, (at == null ? null : at));
            } catch (e) { errLog(e, 'engine.timeRead'); return { ok: false, reason: 'thrown', rows: [] }; }
        }
        /** 查询意图解析（现在 / 当时 / 回忆）。判不出来报 unspecified，**不补现实日期**。 */
        queryIntent(text) {
            try {
                const FV = _factVersionLib();
                if (!FV || typeof FV.classifyIntent !== 'function') return { intent: 'unspecified', at: null, cue: '', unknownTime: false };
                return FV.classifyIntent(text);
            } catch (e) { errLog(e, 'engine.queryIntent'); return { intent: 'unspecified', at: null, cue: '', unknownTime: false }; }
        }
        /** 时态一致的整账查询（按 queryIntent 决定读当下还是读某时点）。 */
        resolveFactsByTime(text, at) {
            try {
                const FV = _factVersionLib();
                if (!FV || typeof FV.resolveQuery !== 'function') return { ok: false, reason: 'module-unavailable', rows: [] };
                return FV.resolveQuery(this._factVersionState, text, { at: (at == null ? null : at) });
            } catch (e) { errLog(e, 'engine.resolveFactsByTime'); return { ok: false, reason: 'thrown', rows: [] }; }
        }
        /** [v3.194] 事实按时间点查询（「现在去哪里找她」/「回忆大学时生活」）。不抛。 */
        lookupFact(ref) {
            try {
                const FV = _factVersionLib();
                if (!FV || typeof FV.lookup !== 'function' || !this._factVersionState) return { ok: false, reason: 'module-unavailable' };
                return FV.lookup(this._factVersionState, ref);
            } catch (e) { errLog(e, 'engine.lookupFact'); return { ok: false, reason: 'thrown' }; }
        }
        /**
         * [v3.211] 类型化事实的**注入面**（把「登记」接到「注入」）。
         *   修前实测：memory-type.js 的 routeForType / typedBuckets / policyOfType 三个出口
         *   在宿主侧**零调用点** —— 类型系统把事实分了九类、每类定了策略与可见性，
         *   但注入管线（buildInjection）里 `factVersions` / `LonShaMemoryType` 一个字都没有，
         *   于是「世界规则」「事件结果」这些类型只活在诊断行里，**从不进模型上下文**。
         *   本方法按 routeForType 的 stable 口径把类型事实**分成两块**：
         *     · 稳定块（permanent / long：人物状态、关系、事件结果、玩家偏好、世界规则）
         *       —— 每轮必注（进 RESIDENT_MARKERS 的常驻分区）；
         *     · 波动块（medium / short / dynamic：地点、物品、线索、场景事实）
         *       —— 走触发分区，按预算裁剪（这些值本来就「当轮才重要」）。
         *   两块**必须分开**、不得合成一块：合成后要么短生命周期内容被当成常驻每轮灌进去，
         *   要么长期规则跟场景事实一起被裁掉（本仓三态纪律：该可分的读数不得压成一态）。
         *   只报**显式标注**过的类型（typedBuckets 不猜）；每型最多 MAX_TYPED_LINES 条，
         *   防止单一类型（事件结果最容易堆积）把 MAX_FACTS 与注入预算一起吃掉。
         * 返回 { stable, volatile }（无内容时为 ''）。不抛。
         */
        typedFactsBlocks() {
            const empty = { stable: '', volatile: '' };
            try {
                const MT = _memoryTypeLib();
                if (!MT || typeof MT.typedBuckets !== 'function') return empty;
                if (!this._factVersionState) return empty;
                const MAX_TYPED_LINES = 3;
                /* [v3.299.0 · M-O6] 状态准入**前置**：先由 fact-state 把「哪条事实允许进载荷」判完，
                 *   再交给 typedBuckets 分桶。
                 *   为什么必须前置而不是在 typedBuckets 里补一句：`typedBuckets` 修前只挡
                 *   `revoked === true`，放行 `to != null` 的已换代旧事实 ⇒ 旧值进注入面（本版修的真缺陷）。
                 *   为什么不用 `admitForLoad().supported` 直接替掉 buckets：那是**第二套分桶**——
                 *   准入与分组是两件事（准入管「算不算数」，分组管「该进哪个分区」），
                 *   这里只把准入结果当**过滤器**用（按 id 放行），分组口径仍只有 typedBuckets 一份。
                 *   模块缺席（extra_js 未加载）⇒ 退回既有行为并留痕，**不静默按新口径**也未静默丢弃。 */
                const FS = _factStateLib();
                const stateGate = (FS && typeof FS.readState === 'function')
                    ? FS.readState(this._factVersionState) : null;
                const allowIds = stateGate
                    ? new Set(stateGate.entries.filter(e => e.admissible).map(e => e.id)) : null;
                /* [M3-O9] 时态一致进**注入面**：后补录的旧事实（staleOpen）不得进载荷覆盖现状。
                 *   判据与查询面 readAt **同一份实现**（不在宿主再写一遍时序规则）——
                 *   否则「查询答对、注入答错」，用户看到的仍是旧值。
                 *   模块缺席 ⇒ staleIds 为 null ⇒ 退回既有行为（不静默按新口径，也不静默丢弃）。 */
                let staleIds = null;
                try {
                    const FVt = _factVersionLib();
                    if (FVt && typeof FVt.readAt === 'function') {
                        const _tr = FVt.readAt(this._factVersionState, null);
                        const _sids = new Set();
                        for (const _r of (_tr.rows || [])) {
                            for (const _so of (_r.staleOpen || [])) _sids.add(String(_so.id));
                        }
                        if (_sids.size) staleIds = _sids;
                    }
                } catch (e) { errLog(e, 'typedFactsBlocks.staleOpen'); }
                const gated = (f) => !allowIds || allowIds.has(String(f && f.id != null ? f.id : ''));
                /* [M3-O9] staleOpen（后补录的旧事实）不进载荷：**不改 gated 这一行**——
                 *   它是 v3299 负控制 I1 的破坏锚点（逐字字面量，要求恰中 1 次），
                 *   拆成两行会让那条负控制找不到锚点而**静默失效**（门空转比门红危险得多）。
                 *   故 stale 过滤作为**第二道**挂在过滤链上，两道各自独立可测。 */
                const gatedStale = (f) => !staleIds || !staleIds.has(String(f && f.id != null ? f.id : ''));
                const rawBuckets = MT.typedBuckets(this._factVersionState);
                const buckets = {};
                for (const k of Object.keys(rawBuckets)) {
                    const list = rawBuckets[k];
                    buckets[k] = Array.isArray(list) ? list.filter(gated).filter(gatedStale) : list;
                }
                const stableGroups = [];
                const volatileGroups = [];
                for (const key of Object.keys(buckets)) {
                    const list = buckets[key];
                    if (!Array.isArray(list) || !list.length) continue;
                    const t = String(key).replace(/^typed:/, '');
                    // 路由与策略都从类型系统取（**不在宿主再写一份类型清单**——那是第二份真源）。
                    const route = (typeof MT.routeForType === 'function') ? MT.routeForType(t) : null;
                    const info = (typeof MT.policyOfType === 'function') ? MT.policyOfType(t) : null;
                    const group = {
                        type: t,
                        label: (info && info.label) ? info.label : t,
                        lines: list.slice(-MAX_TYPED_LINES).map(f =>
                            '- ' + String(f.subject || '') + String(f.predicate || '') + '：' + String(f.value || '')
                            + (f.from != null ? '（第' + f.from + '楼起）' : '')),
                    };
                    (route && route.stable ? stableGroups : volatileGroups).push(group);
                }
                const render = (title, groups) => {
                    if (!groups.length) return '';
                    const out = [title];
                    for (const g of groups) {
                        out.push('〔' + g.label + '〕');
                        out.push(...g.lines);
                    }
                    return out.join('\n');
                };
                return {
                    // 块首行必须是 RESIDENT_MARKERS 里的标记（startsWith 判定常驻），故稳定块标题与标记逐字一致。
                    stable: render('[类型化事实·长期]', stableGroups),
                    volatile: render('[类型化事实·当下]', volatileGroups),
                };
            } catch (e) { errLog(e, 'engine.typedFactsBlocks'); return { stable: '', volatile: '' }; }
        }
    }
    // [v3.181] SG: 场所图景（Spatial Grounding）——SceneBook 已抽为独立模块 scene-book.js。
    //   抽取前的现场（本版修掉的）：整个类 89 行，读法只有 currentKey/chainOf/brief 三个；
    //   「谁在何处 / 到访史 / 某地多大多深 / 树完不完整」全部读不出来，且 rollbackFloorOnly
    //   清了 track 却没人重建、rebuildFromOps 的 track 过滤因三目优先级错位是一枚哑雷。
    //   取库口按本仓库契约写（真读表达式 + 文件名），**不在构造期缓存**：
    //   extra_js 在入口脚本之后加载，构造时全局还没挂上——故这里只取函数，每次调用现取。
    // [v3.182] LR: 账本回放（Ledger Replay）——删楼与楼层前移的统一入口。
    //   此前这两件事各是一份手工清单（rollbackFloor / shiftFloorsFrom），
    //   新增带楼层归属的子系统必须同时改两处，漏一处不报错。
    //   现在清单收进 ledger-replay.js 的登记表，宿主只负责调用与留痕。
    function _ledgerReplayLib() {
        return _moduleLib(() => window.LonShaLedgerReplay, 'ledger-replay.js');
    }
    // [v3.190] 归档楼层校正库的取库口。
    //   此前两处调用点（rollbackFloor / shiftFloorsFrom）各自手抄一段
    //   「优先取全局 → 退到 require → 两条都拿不到时内联循环」的双通道块；
    //   同一件事写两遍就必然会漂移（v3.115 修的正是其中一处漏改）。
    //   现在宿主只把库交出去，登记项内部自行决定「借库还是内联」。
    function _archiveShiftLib() {
        return _moduleLib(() => window.LonShaArchiveShift, 'archive-shift.js');
    }
    // [v3.234.0] 睡眠唤醒库的取库口。为什么需要（实测依据）：
    //   `archivedForSleep` 全仓 9 处引用、**归零点 0 处** —— 睡眠周期只标记不回收，
    //   注释承诺的「需要时可唤醒」从来没有实现（`archivedMemories` 池只存在于那行注释里）。
    //   与 `awakenByEntities` 的分工：那条按**实体名逐字命中**唤醒 dormant 标记；
    //   本条按**语义相似**唤醒 archivedForSleep —— 情景相近而用词不同时也能回来。
    //   两者互不顶替、各自上报（判据分别钉住）。
    function _sleepAwakenLib() {
        return _moduleLib(() => window.LonShaSleepAwaken, 'sleep-awaken.js');
    }
    function _sceneBookLib() {
        return _moduleLib(() => window.LonShaSceneBook, 'scene-book.js');
    }
    // [v3.183] 摘要来源溯源（Summary Provenance）：摘要在落笔时记下它来自哪一页，
    //   之后每次验真都能回答「这条摘要的来源还在不在、还是不是那一页」。
    //   为什么需要：SummarySystem.summaries 只存 {floor, text, level, timestamp, folded}，
    //   没有任何来源字段——翻 swipe / 删楼 / 楼层前移之后，摘要仍指着旧文本，
    //   下一次 GC 扫到 fp 不在任何 swipe 取值里才清掉（floor-ledger 注释记载的旧行为）。
    //   现在把「来源」本身变成可查的字段，六态判定把「旧档」与「真失效」分开。
    function _summaryProvenanceLib() {
        return _moduleLib(() => window.LonShaSummaryProvenance, 'summary-provenance.js');
    }
    // [v3.183] 分支守护（Branch Guard）：把「翻页 / 重生成之后这一楼归谁」变成可查的三态队列。
    //   与 summary-provenance 的分工：prov 回答「这条摘要的来源现在还对不对」，
    //   branch-guard 回答「现在这一轮该不该往这一楼写」。前者是事后验真，后者是事前拦。
    function _branchGuardLib() {
        return _moduleLib(() => window.LonShaBranchGuard, 'branch-guard.js');
    }
    // [v3.261.0 缝合 MyriadKnots] 楼层身份匹配证明（floor-identity.js）。
    //   为什么需要：本插件有两种楼层身份并存（持久侧的 floor 号 + fp 指纹 / 宿主侧当前
    //   chat 数组第 N 楼此刻的正文），而「持久记录还属于当前聊天吗」此前由各调用方各写一遍
    //   ——按号认领的会在删楼/插楼后静默错位，按指纹单条比对的会把「同页不同代」当同一楼。
    //   本模块把这件事收成**证明过程**：四段判解，判不了就点名根因（绝不猜）。
    //   与 branch-guard 的分工：branch-guard 回答「这一轮该不该往这一楼写」（事前拦），
    //   本模块回答「这条记录与这一楼是不是同一个东西」（身份证明）。
    function _floorIdentityLib() {
        return _moduleLib(() => window.LonShaFloorIdentity, 'floor-identity.js');
    }
    // [v3.261.0 缝合 MyriadKnots] 存档体检三分判定（archive-audit.js）。
    //   为什么需要：本插件存档是一个并集（自写键 / 用户导入过的外部档键 / 旧版已不认的键），
    //   而 restoreFromPayload 只做「认得的回填、不认得的收进 _archiveExtensions」，
    //   没有任何一面回答「这份档里多少是活真源、多少是可清理候选、多少根本判不了」。
    //   ★ 纪律照搬源码：不可达 ≠ 可以删 —— 畸形/外来一律 retained，且必须能被点名。
    function _archiveAuditLib() {
        return _moduleLib(() => window.LonShaArchiveAudit, 'archive-audit.js');
    }
    // [v3.183] 条目关联（Crosslink）：手写 Aho-Corasick 扫正文，找出共享关键词的其他条目。
    //   给的是**弱关系候选**（只报告不写图）——写图由提取管线负责，自动写边会累积幻觉边。
    function _crosslinkLib() {
        return _moduleLib(() => window.LonShaCrosslink, 'crosslink.js');
    }
    // [v3.186] 情绪反向召回的词表来源（narrative-pulse.js 的 EMOTION_OPPOSITES）。
    //   为什么复用已有模块而不是新建一个：本仓的情绪能力（六维词典 + scanEmotion）早已在场，
    //   缺的从来不是词表而是「把它接到召回上」这一步；新建模块必然带来第二份情绪词表，
    //   两份一定会漂移（本仓库治理过十几轮的缺陷形态）。故反向映射就长在词典旁边，
    //   共用同一份事实——值取自 joy/warm 维的词，测试逐词核对归属，漂移即响。
    function _emotionOppositeLib() {
        return _moduleLib(() => window.LonShaNarrativePulse, 'narrative-pulse.js');
    }
    // [v3.193.0] 注入成本账本（cost-ledger.js）。回答「这一轮 prompt 里，常驻/触发/反向
    //   各占多少字符、谁被截断了」——此前只有 v3.144 的总量读数，丢的是谁的查不出来，
    //   两个量级差十倍的来源混在一个数字里，调预算只能猜。
    function _costLedgerLib() {
        return _moduleLib(() => window.LonShaCostLedger, 'cost-ledger.js');
    }
    // [v3.208.0] 成本**预测**（cost-forecast.js）。与 cost-ledger 的分工是**时态**：
    //   ledger 是事后账（读已拼好的注入文本反推归属），forecast 是事前算（用同一批纯函数
    //   复算「这一轮会发生什么」）。为什么必须有事前那一半：用户把 injectionBudget 从 3000
    //   改到 1800、楼层涨到 120 楼——账本只能等他改完再看一轮，「改配置之前能不能知道」无人回答。
    //   并给 reconcile 做「预测 vs 实测」对账：预算行为变了不该只靠感觉发现。
    function _costForecastLib() {
        return _moduleLib(() => window.LonShaCostForecast, 'cost-forecast.js');
    }
    // [v3.298.0 · M-O3] **预算/裁剪/注入回执**（injection-receipt.js）。为什么需要：
    //   v3.251.0 把「谁被留下」从文本反推换成裁剪回执，v3.274.0 把三处消费点统一到同一回执；
    //   但**量纲**这一面仍然是三处各算一遍（本文件 `_allB.reduce` / cost-ledger 累 tagged /
    //   cost-forecast 累 resident+trigger），且「裁剪减少的字符」与「被丢块的字符之和」
    //   被混着叫 `droppedChars`（实测 124 vs 122，差的是块间分隔符）。本模块把六类量
    //   （候选 / 载荷 / 被丢块 / 裁剪减少 / 预算溢出 / 未知）拆开、在同一条 trace 上派生，
    //   并给出「判据不可用时多少字符不可归因」—— 修前没有任何一格回答这个问题。
    function _injectionReceiptLib() {
        return _moduleLib(() => window.LonShaInjectionReceipt, 'injection-receipt.js');
    }
    // [v3.208.0] 投影管线（projection-pipeline.js）。为什么需要：
    //   v3.176 的本地投影只有两次手工调用（人物位置 / 事实键），加一个投影就要再改一遍宿主
    //   函数体，且「加没加」无从判定；更糟的是缺席不可归因（收集失败与「源里本就没有」同形，
    //   都返回 {}，下游对读于是把「查不出来」当成「两边一致」）。
    //   现改为声明式登记表 + 三态读数（ok/empty/absent）+ 缺席原因。
    function _projectionLib() {
        return _moduleLib(() => window.LonShaProjectionPipeline, 'projection-pipeline.js');
    }
    // [v3.291.0 · X4] 手机事实受控准入（native-fact-admission.js）。为什么需要：
    //   本仓消费手机侧只有三条通路（回填 / 召回 / 楼层生命周期），三条都**没有准入契约** ——
    //   于是「用户确认入账的支出」与「模拟报价 / 建议转账」在注入路径上同形，
    //   「usage-tracker 的玩家使用行为」与「角色剧情记忆」也同形（X4 原文点名两者）。
    //   本面把八栏身份（chatId/branchId/eventId/revision/sourceFloor/storyTime/status/visibility）
    //   与五态来源收成一条判定，宿主只消费**返回值**，照旧经既有 owner 落笔。
    function _factAdmissionLib() {
        return _moduleLib(() => window.LonShaNativeFactAdmission, 'native-fact-admission.js');
    }
    // [v3.194] 时间与事实版本（fact-version.js）。为什么需要：
    //   本仓能记「事实」的四处（ConflictBook / DeltaBook / lockedFacts / age-anchor）
    //   全都没有**有效区间**。于是「她以前住在北京，后来搬到上海」在账上只剩两条对立记录，
    //   查询「现在去哪里找她」与「回忆大学时生活」拿到的是同一堆东西。
    //   本模块给事实加 from/to 区间与五态来源，让「当时如此 / 现在如此 / 后来被推翻」可分。
    function _factVersionLib() {
        return _moduleLib(() => window.LonShaFactVersion, 'fact-version.js');
    }
    // [v3.210] 记忆类型系统（memory-type.js，计划 L-F1）。为什么需要：
    //   事实账此前**没有类型维度** —— 「主角喜欢喝奶茶」「魔王被打败了」「A 与 B 是师徒」
    //   在账上是同一形状，共用同一套覆盖/冲突规则。后果是**数据在、规则用错**：
    //   长期世界规则被一句随口话顶掉、事件结果与人物状态互相换代、玩家旧偏好赖着不走、
    //   矛盾的世界规则照常并存（本该报警「提取错了」）。
    //   本模块是类型的**唯一真源**（9 类型 × 6 策略），并把类型映射成 fact-version
    //   能执行的冲突策略。注意分工：本模块不存储、不校验存储侧；类型落在事实条目上。
    function _memoryTypeLib() {
        return _moduleLib(() => window.LonShaMemoryType, 'memory-type.js');
    }
    // [v3.299.0 · M-O6] 事实状态**单一真源**（fact-state.js）。为什么需要：
    //   `fact-version.js` 有 `revoked` / `to` / `supersededBy` 三个字段，但**没有一处**把它们
    //   合成「这条事实现在算不算数」；于是每个消费点各写一遍判法，且写法不一。
    //   修前实测的真缺陷：`memory-type.js#typedBuckets` **只挡 `revoked === true`**，
    //   放行了 `to != null` 的已被换代的旧事实 ⇒ 旧值仍进类型化注入面（M-O6 真实需求那一条）。
    //   本模块把五态（active/superseded/revoked/disputed/unknown）+ 有效范围收成一处判定，
    //   并**只读不写**（写回式迁移会让「推导说 superseded、持久说 active」成为第二份真源）。
    function _factStateLib() {
        return _moduleLib(() => window.LonShaFactState, 'fact-state.js');
    }
    // [v3.312.0 · M-X4] 事实生命周期（fact-lifecycle.js）。为什么需要：
    //   事实面有 `revokeFact`（撤一条）与 `fact-state`（说出五态），但**没有一处**回答
    //   「这条事实以后怎么算、我要批量把它怎么办」。于是「删原文」与「不许进生成」在
    //   调用方眼里长得一样 —— 而那正是会把原始证据误删的那条路。
    //   本模块把处置（定位）/ 动作（手段）分开，配计划 / 审计 / 回滚 / 回读，**纯函数零写**。
    function _factLifecycleLib() {
        return _moduleLib(() => window.LonShaFactLifecycle, 'fact-lifecycle.js');
    }
    // [v3.313.0 · M-X8] 版本化记忆包（memory-package.js）。为什么需要：
    //   `volume-continuation.js`（X7）能建卷接续包，但那是**会话内**的接续件 ——
    //   没有包格式代际、没有导入预览、没有幂等账、没有撤销；`snapshot-checkpoint.js`
    //   存命名检查点但绑在同一宿主的 localStorage，换设备即无；`schema-migration.js`
    //   有结构代际迁移注册表，但没人把「用户从别的设备带回来的包」接到那条路上。
    //   本模块把「造包 → 准入判定 → 预览 → 部分导入 → 撤销」收成一处，**纯函数零联网**。
    function _memoryPackageLib() {
        return _moduleLib(() => window.LonShaMemoryPackage, 'memory-package.js');
    }
    // [v3.314.0 · M-X6] 手机事实桥 2.0（phone-fact-bridge.js）。为什么需要：
    //   `native-fact-admission.js`（X4）回答「这条算不算事实」，但它**没有**回答 M-X6
    //   点名的三件事：用户确认环 / 手机侧编辑删除撤回后的换代撤回 / 记忆侧对手机侧的最终回执。
    //   长期使用后缺这三环的后果是**桥的单向化**：手机侧只知道送出去了，不知道收没收、
    //   是不是还作数。本模块把「证据守卫 → X4 准入 → 用户确认环 → 生命周期四态 → 回执」收成一处，
    //   **纯函数零写零联网**。
    function _phoneFactBridgeLib() {
        return _moduleLib(() => window.LonShaPhoneFactBridge, 'phone-fact-bridge.js');
    }
    // [v3.315.0 · M-X5] 角色知识传播的可见范围预演（knowledge-preview.js）。为什么需要：
    //   `knowledge-trace.js`（X5）只能答**过去** —— 这条知识在第几楼、从谁、经哪条证据取得的。
    //   它答不了 M-X5 点名的这一问：**在下笔之前**先看一眼「要是这么写，会影响到谁」。
    //   缺这一面的后果不可回滚：一旦写进正文，轨迹已经产生，「这个秘密本来不该让他知道」
    //   只能靠事后 reconcile 去猜同义措辞。本模块出**两张面**（作者面 / 角色生成面）——
    //   作者面带理由与改法建议，角色生成面只有名字与目标格，两面除 who/after 外零共享。
    //   **纯函数零写零联网**。
    function _knowledgePreviewLib() {
        return _moduleLib(() => window.LonShaKnowledgePreview, 'knowledge-preview.js');
    }
    // [v3.316.0 · M-X7] 提取质量反馈与可控策略配置（extract-feedback.js）。为什么需要：
    //   `recall-explain.js`（X8）解的是**召回链路**的断点（注入没进来 / 被裁掉），
    //   它答不了 M-X7 点名的这一问：**这次为什么提取错了，怎样减少同类错误**。
    //   修前「漏记 / 错记 / 错角色 / 旧事实未被替换 / 不应记录」五种错法在读数上同形
    //   （都只是「结果不如意」），且想改只能直接改配置 —— 而「改了到底有没有用」无处证明。
    //   本模块只做分类 / 记录 / 有据建议 / 应用闸四件事：
    //   建议的背书只看**真读数**（对照重跑 + 留出集），`apply.auto` 恒 false，
    //   反馈**不写历史事实**、原文依据只存摘要（不复制第二份事实库）。纯函数零写零联网。
    function _extractFeedbackLib() {
        return _moduleLib(() => window.LonShaExtractFeedback, 'extract-feedback.js');
    }
    // [v3.317.0 · M-X3] 项目 / 卷 / 章节管理面（project-registry.js）。为什么需要：
    //   `volume-continuation.js`（X7）答的是「这一卷怎么接出去」（建包 / 选面 / 源状态），
    //   它答不了 M-X3 点名的这一问：**这个项目存在不存在、挂在哪儿、能不能并存**。
    //   修前「没选项目」「选了但零卷」「同名不同宇宙」在读数上同形（都只是「没有内容」），
    //   且项目 id 与宇宙在宿主里**根本没有落点** —— 于是验收①「未选项目维持完全隔离」
    //   与验收②「同名角色、不同宇宙不合并」都没有可判之处。本模块只做
    //   归一 / 绑定 / 归档 / 卷章节编辑 / 身份与合并判定 / 导入计划 / 撤销边界 / 重新接线，
    //   目录与源状态**一律转发 X7**（本模块不留第二份导航真源），**纯函数零写零联网**。
    function _projectRegistryLib() {
        return _moduleLib(() => window.LonShaProjectRegistry, 'project-registry.js');
    }
    // [v3.327.0 · E 包 M3-X5] 设定资料与前史的分层导入(lore-import.js)。为什么需要:
    //   `memory-books.js::PrequelSystem.importPrequel(text)` 把**整篇文本**当一团前情存下来,
    //   于是「设定规则」与「已经发生过的事件」在读数上同形 —— 世界观规则会被当成史实注入。
    //   本模块把「解析分层 → 实体映射 → 逐条 diff → 只审变更段」收成一处,**纯函数零写零联网**:
    //   设定类一律 origin=imported-lore,**不冒充聊天中已发生的事**。
    function _loreImportLib() {
        return _moduleLib(() => window.LonShaLoreImport, 'lore-import.js');
    }
    // [v3.327.0 · E 包 M3-X7] 章节回顾与可编辑故事年鉴(story-annual.js)。为什么需要:
    //   叙事产物生成器(日记 / 反思 / 大纲)都是**面向角色或作者**的生成器;分层摘要按窗口切,
    //   项目注册表有卷章结构 —— 两边**没接起来**,「这一章里发生过什么」无处可读,且回顾里的
    //   每一句话**都不指向原文**(原文改了就没人知道它过期)。本模块只做四要素提取 / 两版可分 /
    //   草稿编辑 / 过期判定,**不重建摘要引擎、不渲染页**,纯函数零写零联网。
    function _storyAnnualLib() {
        return _moduleLib(() => window.LonShaStoryAnnual, 'story-annual.js');
    }
    // [v3.328.0 · F 包 M3-X6] 支线结果的正史选择工作区(branch-canon.js)。为什么需要:
    //   `branch-semantics.js` 能对照两条分支、`project-registry::compareProjects` 能比两个项目、
    //   `volume-continuation.js` 能把一卷接出去 —— 但**没有任何一面**回答「这两条支线的结局,
    //   哪一条成为后续正史?」。修前「两条结局同时成立」与「只有一条结局」在读数上同形
    //   (都只是「有若干条结局条目」),于是下游把两条都当既成事实注入。本模块只做
    //   逐冲突列举 / 逐冲突选择(canon / coexist / exclude)/ 交接预览 / 撤销范围 / 出处清单,
    //   **不自建 merge 算法**(合并属 project-registry 的事),纯函数零写零联网。
    function _branchCanonLib() {
        return _moduleLib(() => window.LonShaBranchCanon, 'branch-canon.js');
    }
    // [v3.328.0 · F 包 M3-X8] 情境触发的旧事重现(fated-recall.js)。为什么需要:
    //   `recall-echo.js` 有回扣账本、`echo-ledger.js` 有回扣模式、`narrative-pulse.js` 有情绪线索,
    //   但三者都靠生成侧**自己记得去查**:没有任何一面答「此刻为什么该想起来」。本模块把
    //   情境 → 触发键 → 候选(相关性 + 冷却 + 知情面)→ 用户策略收成一处,**纯函数、只出建议**:
    //   不写账、不做后台常驻代理、不做情绪判定、不擅写续剧情,**不唤回角色未知的旧事**。
    function _fatedRecallLib() {
        return _moduleLib(() => window.LonShaFatedRecall, 'fated-recall.js');
    }
    // [v3.194] 事件完整性（event-completeness.js）。与 event-chain.js **不是同一件事**：
    //   后者管 agent run 生命周期（run_started→run_completed），前者管**剧情事件**的
    //   起因—行动—结果—后续。缺结果或后续即「未完成事项」，必须能被单独列出来。
    // [v3.323.0 · M3-X2] 人物关系变化史（relation-history.js）。为什么需要：
    //   本仓已有 `relation-mutual`（双向对账，四态）与 `relation-disclosure`（披露条件），
    //   两者答的都是**当下这一轮**：对侧在不在、这条要不要进注入。M3-X2 问的是第三个问题 ——
    //   **这对人是怎么走到今天的**（从信任到怀疑，中间哪几楼、各自怎么看）。
    //   轨迹必须逐侧保留（**永不产出单一合成好感值**：把两人看法平均成一个数是本模块立项
    //   时要治的错读数）。本模块只读图里的边，**不新增关系账**、不改边、不写任何状态。
    function _relationHistoryLib() {
    return _moduleLib(() => window.LonShaRelationHistory, 'relation-history.js');
    }
    // [v3.323.0 · M3-X3] 伏笔与因果链导航（causal-chain.js）。为什么需要：
    //   三本账此前各自成条：伏笔答「埋了什么、回收没有」、约定答「答应了什么、履没履」、
    //   事件线答「起因—行动—结果—后续齐没齐」。**没有一处能回答「这个结果是从哪一段
    //   铺垫长出来的」** —— 于是「长期未解伏笔找不回」「违约与取消同形」只能靠人记。
    //   本模块把它们连成可追溯的图，并**结构上**把推测边与已确认边分成两个数组
    //   （同数组即等于把「猜的」当「有据的」）；`traceBack` 只走已确认边。
    function _causalChainLib() {
    return _moduleLib(() => window.LonShaCausalChain, 'causal-chain.js');
    }
    // [v3.323.0 · M3-X4] 视角记忆卡（perspective-card.js）。为什么需要：
    //   `knowledge-trace` 已有轨迹（这条知识在第几楼、从谁、经哪条证据取得的），
    //   但**没有任何一处把它按角色与时间读成可写作的工作集**，而 M3-X4 点名的正是这个。
    //   ★ 立身之本：没有轨迹的条目**绝不落进「未知」**，而是计入 `unrecorded` 且处处可见 ——
    //   把「我们没记过」显示成「该角色确实不知道」，正是本仓最贵的那类无据断言。
    function _perspectiveCardLib() {
    return _moduleLib(() => window.LonShaPerspectiveCard, 'perspective-card.js');
    }
    // [v3.324.0 · M3-O5] 抽取节奏安排（extraction-driver.js）。为什么需要：
    //   既有「事件性门控」只答**这一楼**值不值得花一次 LLM，答不了 M3-O5 点名的三问 ——
    //   ① 关键事件落在非周期楼时会不会被漏掉（修前全靠「每楼都抽」或靠人记）；
    //   ② 连续寒暄为什么不每次全类型请求；③ 错过的楼/重生成段从哪儿补回来。
    //   本模块只产**可复算的安排**（何时抽 / 哪些楼没处理 / 重生成补哪段），
    //   **纯函数零写**、不改图、不改账、不替门控做决定。
    function _extractionDriverLib() {
    return _moduleLib(() => window.LonShaExtractionDriver, 'extraction-driver.js');
    }
    // [v3.324.0 · M3-O7 + M3-X9] 纠错方案（correction-plan.js）。为什么需要：
    //   既有「提取反馈」答的是**错在哪一类**、建议有没有据；它答不了打补丁时真正的两问 ——
    //   ① 改哪（配置面）/ 补哪一段（数据面），两者**不是一件事**（合成一个「纠错」会让人
    //      以为改配置顺便重写了历史事实）；② 重提取之后**跟原文逐条对上了没有**
    //      （新增 / 保留 / 替换 / 冲突四态各自可达，冲突不得被吞进「替换」）。
    //   本模块只产**待确认的提案**（`writes` 恒 0）：确认前一个字节都不落盘。
    function _correctionPlanLib() {
    return _moduleLib(() => window.LonShaCorrectionPlan, 'correction-plan.js');
    }
    function _eventCompletenessLib() {
        return _moduleLib(() => window.LonShaEventCompleteness, 'event-completeness.js');
    }
    // [v3.214.0] R1-E：九账证据工作台（evidence-workbench.js）。为什么需要：
    //   本仓九本账各自有 list/summarize，但对外是一排孤立文本行——快照一本账都不带，
    //   于是下游（手机端工作台）答不出「这个承诺是哪一楼说的」。本模块把九账收成一张
    //   可查对账面（三态 + 出处 ref/floor），是「工作台与证据查询」的上游出口。
    function _evidenceWorkbenchLib() {
        return _moduleLib(() => window.LonShaEvidenceWorkbench, 'evidence-workbench.js');
    }
    // [v3.296.0 · X1] 结构化证据查询（evidence-query.js）。为什么需要：
    //   evidence-workbench.js 的 search() 只有**关键词**一条路（打分命中），且它的投影面
    //   是 `items.slice(-200)` —— 于是「这本账 900 条」与「200 条」同形，actor / 状态 /
    //   楼层区间 / 来源 / 修订号这些**在原账里真实存在**的结构化字段无处可查。
    //   本模块在**原账状态**上做组合筛选 + 分页 + 完整度读数（X1 验收原文两条：
    //   「超过 200 条的旧证据仍能按需检索」「不默认在 200 条摘要中找不到就判全库没有」）。
    function _evidenceQueryLib() {
        return _moduleLib(() => window.LonShaEvidenceQuery, 'evidence-query.js');
    }
    // [v3.340.0 · M4-X4] 多轮问答线程（qa-thread.js）。为什么需要：
    //   planQuestion 是**单问句**规划，代词 / 比较 / 回旧时点在追问里会退化成宽查。
    //   本模块只维护**结构化查询约束**（主体 / 时点下界 / 分支 / scope），
    //   消歧走 awaiting-disambig + 人工点选，不产第二份答案事实。
    function _qaThreadLib() {
        return _moduleLib(() => window.LonShaQaThread, 'qa-thread.js');
    }
    // [v3.343.0 · M4-X5] 多方证词与争议档案(testimony-board.js)。为什么需要:
    //   knowledge-trace 已区分亲历 / 听说 / 误信、perspective-card 已按角色 × 时点出卡,
    //   但没有一处把若干角色对同一事件的说法摆在一起对照;「甲和乙对同一事件分别怎么说、
    //   为何暂不能下结论」只能手工两两跑 contrast,而「谁跟谁同一来源」在比完之后又丢了。
    //   本模块是只读聚合投影:复用事件 ID 与既有 evidenceKey 去重(三次转述
    //   不算三份独立支持),不建平行证词库、不落盘。
/** [v3.421.0] 24 个第八/十一期模块的就绪面汇总（纯读，构造期一次）。
 *  返回 { seen: 到场模块数, missing: [模块文件名], problems: [「标签:问题」] }。
 *  「没加载」与「加载了但自检有问题」必须同形可分 —— 前者是装载面，后者是机制面。 */
function _collectNewFace() {
    const SPEC = [
        ['记忆天气', _memoryWeatherLib, 'memoryWeatherSelfCheck'],
        ['记忆仪式', _memoryRitualLib, 'memoryRitualSelfCheck'],
        ['记忆季候', _memorySeasonLib, 'memorySeasonSelfCheck'],
        ['意义地图', _meaningMapLib, 'meaningMapSelfCheck'],
        ['记忆工作模式', _workModeLib, 'workModeSelfCheck'],
        ['冲突裁决台', _conflictBenchLib, 'conflictAdjudicationSelfCheck'],
        ['时间有效性', _temporalValidityLib, 'temporalValiditySelfCheck'],
        ['记忆考古', _archaeologyLib, 'memoryArchaeologySelfCheck'],
        ['预算编排', _budgetOrchestratorLib, 'memoryBudgetSelfCheck'],
        ['可读工作台', _readableWorkbenchLib, 'memoryReadableWorkbenchSelfCheck'],
        ['记忆共生桥', _symbiosisBridgeLib, 'memorySymbiosisBridgeSelfCheck'],
        ['召回路由', _recallRouteLib, 'recallRouteSelfCheck'],
        ['秘密剧场', _secretTheaterLib, 'secretTheaterSelfCheck'],
        ['批维护', _batchMaintenanceLib, 'batchMaintenanceSelfCheck'],
        ['角色成长', _characterGrowthLib, 'characterGrowthSelfCheck'],
        ['跨项迁移台', _crossProjectDeskLib, 'crossProjectMigrationSelfCheck'],
        ['时代续演', _eraContinuationLib, 'eraContinuationDramaSelfCheck'],
        ['生成事实重放', _generationReplayLib, 'factReplaySelfCheck'],
        ['情绪反向召回', _antiphonyLib, null],
        ['阶段封卷', _volumeSealingLib, null],
        ['多主角名册', _multiProtagonistLib, null],
        ['古法历法', _storyClockLib, null],
        ['事实重放', _factReplayLib, null],
        ['带内抽取', _inbandExtractionLib, null],
    ];
    const missing = [];
    const problems = [];
    let seen = 0;
    for (const [label, get, chk] of SPEC) {
        let api = null;
        try { api = get(); } catch (e) { problems.push(label + ':取库抛错'); }
        if (!api) { missing.push(label); continue; }
        seen++;
        if (!chk) continue;
        try {
            const r = (typeof api[chk] === 'function') ? api[chk]() : null;
            const bad = (r && Array.isArray(r.problems)) ? r.problems : [];
            for (const p of bad) problems.push(label + ':' + p);
            if (r && bad.length === 0 && r.problems === undefined) problems.push(label + ':自检未交 problems');
        } catch (e) { problems.push(label + ':自检抛错'); }
    }
    return { seen: seen, total: SPEC.length, missing: missing, problems: problems };
}

    function _testimonyBoardLib() {
        return _moduleLib(() => window.LonShaTestimonyBoard, 'testimony-board.js');
    }

    // [v3.421.0] 第八/十一期 24 个模块的取库口。它们此前一直没有入册 manifest.extra_js，
    //   宿主从不加载、只有测试能 require 到 —— 机制等于交付即死。统一走 _moduleLib 惰性口。
    function _memoryWeatherLib() { return _moduleLib(() => window.LonShaMemoryWeather, 'memory-weather.js'); }
    function _memoryRitualLib() { return _moduleLib(() => window.LonShaMemoryRitual, 'memory-ritual.js'); }
    function _memorySeasonLib() { return _moduleLib(() => window.LonShaMemorySeason, 'memory-season.js'); }
    function _meaningMapLib() { return _moduleLib(() => window.LonShaMeaningMap, 'meaning-map.js'); }
    function _workModeLib() { return _moduleLib(() => window.LonShaMemoryWorkMode, 'memory-work-mode.js'); }
    function _conflictBenchLib() { return _moduleLib(() => window.LonShaConflictAdjudication, 'conflict-adjudication-bench.js'); }
    function _temporalValidityLib() { return _moduleLib(() => window.LonShaTemporalValidity, 'temporal-validity-workflow.js'); }
    function _archaeologyLib() { return _moduleLib(() => window.LonShaMemoryArchaeology, 'memory-archaeology.js'); }
    function _budgetOrchestratorLib() { return _moduleLib(() => window.LonShaMemoryBudgetOrchestrator, 'memory-budget-orchestrator.js'); }
    function _readableWorkbenchLib() { return _moduleLib(() => window.LonShaMemoryReadableWorkbench, 'memory-readable-workbench.js'); }
    function _symbiosisBridgeLib() { return _moduleLib(() => window.LonShaMemorySymbiosisBridge, 'memory-symbiosis-bridge.js'); }
    function _recallRouteLib() { return _moduleLib(() => window.LonShaRecallRouteOrchestrator, 'recall-route-orchestrator.js'); }
    function _secretTheaterLib() { return _moduleLib(() => window.LonShaSecretTheater, 'secret-theater.js'); }
    function _batchMaintenanceLib() { return _moduleLib(() => window.LonShaBatchMaintenancePipeline, 'batch-maintenance-pipeline.js'); }
    function _characterGrowthLib() { return _moduleLib(() => window.LonShaCharacterGrowthDrama, 'character-growth-drama.js'); }
    function _crossProjectDeskLib() { return _moduleLib(() => window.LonShaCrossProjectMigrationDesk, 'cross-project-migration-desk.js'); }
    function _eraContinuationLib() { return _moduleLib(() => window.LonShaEraContinuationDrama, 'era-continuation-drama.js'); }
    function _generationReplayLib() { return _moduleLib(() => window.LonShaGenerationFactReplay, 'generation-fact-replay.js'); }
    function _antiphonyLib() { return _moduleLib(() => window.LonShaEmotionalAntiphony, 'memory-emotional-antiphony.js'); }
    function _volumeSealingLib() { return _moduleLib(() => window.LonShaVolumeSealingEngine, 'volume-sealing-engine.js'); }
    function _multiProtagonistLib() { return _moduleLib(() => window.LonShaMultiProtagonistRegistry, 'multi-protagonist-registry.js'); }
    function _storyClockLib() { return _moduleLib(() => window.LonShaAncientStoryClock, 'ancient-story-clock.js'); }
    function _factReplayLib() { return _moduleLib(() => window.LonShaFactReplayPipeline, 'fact-replay-pipeline.js'); }
    function _inbandExtractionLib() { return _moduleLib(() => window.LonShaInbandExtractionParser, 'inband-extraction-parser.js'); }
    // [v3.344.0 · M4-X6] 叙事层(modality:narrative-layer.js)。为什么需要:
    //   memory-type 的 9 类是「这是什么性质的事实」,fact-version 记的是「哪个时态区间」,
    //   knowledge-trace 记的是「谁怎么知道的」—— 但**没有一处**记「这条事实处在哪一层叙事外壳」
    //   (现实 / 梦境 / 假设 / 计划 / 引述)。于是同一个 event-outcome「角色死亡」
    //   在现实与在梦里**读数同形**:梦到的死会被现实问答当成真值吃进去;
    //   一句「决定了搬走」会把 plan 事实直接读成已完成。
    //   本模块是**只读层判定**:层标注落在既有条目上(modality 字段),不建平行时间线、
    //   不落盘、老数据不批量重标(无标注一律 unspecified —— 不猜)。
    function _narrativeLayerLib() {
        return _moduleLib(() => window.LonShaNarrativeLayer, 'narrative-layer.js');
    }
    // [v3.345.0 · M4-X7] 旧事重现的生成控频闸(return-gate.js)。为什么需要:
    //   fated-recall(M3-X8)交付了「该不该想起来」,并刻意只到「建议 + 来源」为止;
    //   但「建议可注入」是一个**静态判断**,与「本轮真进了生成」在读数上同形;
    //   「预览了一下就取消」会误消耗冷却;重开/切回会重复轰炸。
    //   本模块是**只读控频闸**:三通道(preview/shown/used)分列,冷却只按 shown/used 落定;
    //   默认 hint-only(显式 inject 才自动注入);状态由宿主持有(worldProg.returnGate 子键,
    //   随世界进程一并跨会话携带 —— 这正是「重开/切回不重复轰炸」的载体)。
    function _returnGateLib() {
        return _moduleLib(() => window.LonShaReturnGate, 'return-gate.js');
    }
// [v3.346.0 · M4-X8] 按下一幕任务组织的精简记忆材料包(material-pack.js)。为什么需要:
    //   getContinuityPack 偏**分卷接续**(上一卷收尾 → 下一卷开头);recall / scene-book /
    //   relation / promise / pov / fated-recall 各自按**自己的面**给候选 —— 但没有一处回答
    //   「下一幕要做的是赴约 / 重逢 / 推进 / 收束,这一幕该带哪几样材料」:
    //   各面合并后**没有优先级**(不同任务的产物同形),矛盾当前值会**并列当真**,
    //   未发生 / 受限材料会随候选进包,某一关键面空着也**不报缺口**。
    //   本模块是**只读材料投影**:任务轴给面优先级(差异可解释)、矛盾当前值只留更新的一条
    //   (被取代者**具名**)、未发生 / 受限默认不进包(如实计数)、缺面进 gaps(具名);
    //   **不裁 token**(真裁仍由 injection-router 这个既有预算 owner 负责),故本面产出的是
    //   「有序材料 + 成本读数 + 越预算名单」,不是「已裁好的包」。
    function _materialPackLib() {
        return _moduleLib(() => window.LonShaMaterialPack, 'material-pack.js');
    }
    // [v3.347.0 · M4-X9] 资料与剧情分区的联合查证(lore-crosscheck.js)。为什么需要:
    //   M4-X9 点名的一问是「设定怎么说、剧情实际是否做到」——本仓已有 lore-import.js
    //   (保存**段落来源与类别**:setting-rule / backstory-event / character-bg /
    //   reference-only + ORIGIN 一律 imported-lore + settingAsHappened 标志位)与
    //   evidence-query.js(按**账本**查询:参与者 / 时间 / 来源 / 状态),但前史片段、
    //   正文资料、聊天事实来自**不同 owner**,两侧读数**不同形**(资料「N 段」/ 剧情
    //   「N 条账行」)——并排看也说不清某条设定**在剧情里兑现了没有**;更坏的是资料里
    //   写着「已经发生」的规则 / 前史一查就与聊天事实**同形**(参考小说的事件被当成
    //   当前会话已发生),撤除某段资料后历史答案里仍留着它的正文(「来源失效」在读数上
    //   没有落点),用户批注还能冒充原文或事实。
    //   本模块是**只读分区投影**:受控 sourceMode(仅剧情 / 仅资料 / 对照)+ 来源分区
    //   (chat / lore / note / unknown)+ 六态判定(matched / divergent / unrealized /
    //   lore-only / chat-only / unchecked,穷尽且互不同形)+ 撤除闸(正文一格不带、
    //   历史来源报 sourceStale)+ 同名跨资料**不硬合并**;**不联网**、**不建开放 RAG**、
    //   **不复制全文到每轮上下文**、**不默认把资料并入正史**(loreInCanon 恒 false);
    //   原文按需从 owner 读(本面只搬 sourceRef,不缓存正文)。
    function _loreCrosscheckLib() {
        return _moduleLib(() => window.LonShaLoreCrosscheck, 'lore-crosscheck.js');
    }
    // [v3.424.0 · M7-X1] 世界线记忆与跨线污染闸(worldline-memory.js)。为什么需要:
    //   命运石之门这一类**不是分支问题**,是「哪条世界线」问题:同一角色在 α 线与 β 线
    //   是两个人生,只有跨线保留者(Reading Steiner)记得别的线。既有 branch-guard(楼层归属)、
    //   branch-semantics(同会话分支对照)、branch-canon(支线正史)、cross-branch-deja-vu
    //   (八前缀既视感匹配)**没有一处判「这条记忆属于哪条线」**,于是异线记忆被一视同仁
    //   注入给所有角色 —— 角色凭空知道「另一条世界里」的事。
    //   本模块是**只读归属判定 + 跨线污染闸**:四态穷尽互斥(native/adjacent/foreign/unknown)、
    //   同号超差判不了(不猜同线)、邻近只由「同吸引域 + 够近」产生、收束三态(未登记 ≠ 不会发生)、
    //   换线计划五桶(同键异值单列 conflict)。**不碰正史选择**(归 branch-canon)、
    //   **不建第二套时间库**(归 dual-time)。
    function _worldlineMemoryLib() {
        return _moduleLib(() => window.LonShaWorldlineMemory, 'worldline-memory.js');
    }
    // [v3.349.0 · 缝入上游 conditionPatch] 主角伤情/伤病状况的**编号片段补丁**(condition-patch.js)。
    //   为什么需要:主角档案六字段里,condition 是**唯一一个「旧值必须活着」的字段**,
    //   而它在修前是整段覆盖型字符串 —— 上游实测过的两个老问题本仓逐字成立:
    //     ① **新伤挤掉旧伤**:模型只提本轮新伤,尚未解除的旧伤/活动限制被静默挤掉;
    //     ② **痊愈即清光**:模型写空串,一次清掉**所有**伤情(等于自动回血)。
    //   根因同一个:整体覆盖没有「哪一条」的概念。切成编号片段后只允许**按编号**改,
    //   未列入的片段原样保留(解 ①),清空只能靠显式空串(解 ②)。
    //   施加点唯一在 CharacterState.setProtagonist(主角档案唯一写入面),本面只提供取库口
    //   + 一条诊断行;**不新增任何持久化键**(结果落成一串 condition 文本)。
    function _conditionPatchLib() {
        return _moduleLib(() => window.LonShaConditionPatch, 'condition-patch.js');
    }
    // [v3.352.0 · M5-X2] 长期目标的前置条件与下一步记忆（goal-tracker.js）。
    //   纯函数 IIFE，零依赖，挂 window.LonShaGoalTracker。
    //   本面只读判定：不写库、不抛、不猜；循环依赖用 DFS 检测；
    //   达成状态由事实状态计算（active→met, revoked/superseded→blocked, disputed→unknown）。
    function _goalTrackerLib() {
        return _moduleLib(() => window.LonShaGoalTracker, 'goal-tracker.js');
    }
    // [v3.353.0 · M5-X6] 有意改设定的影响预览（impact-preview.js）。
    //   纯函数 IIFE，零依赖，挂 window.LonShaImpactPreview。
    //   预览零写：不改库、不抛、不猜；只把"改这个事实会影响哪些账"算出来给用户看。
    function _impactPreviewLib() {
        return _moduleLib(() => window.LonShaImpactPreview, 'impact-preview.js');
    }
    // [v3.353.0 · M5-X7] 隔离于正史的假设推演工作集（hypothesis-workspace.js）。
    //   纯函数 IIFE，零依赖，挂 window.LonShaHypothesisWorkspace。
    //   临时假设只属工作区，退出后正文事实账 hash 不变。
    function _hypothesisWorkspaceLib() {
        return _moduleLib(() => window.LonShaHypothesisWorkspace, 'hypothesis-workspace.js');
    }
    // [v3.353.0 · M5-X9] 跨资料专题的证据集合与可追溯结论（research-collection.js）。
    //   纯函数 IIFE，零依赖，挂 window.LonShaResearchCollection。
    //   不复制全文，只存引用；结论每句有来源；移除资料后标记需复核。
    function _researchCollectionLib() {
        return _moduleLib(() => window.LonShaResearchCollection, 'research-collection.js');
    }
    /* [v3.355.0 · M6-O1] 连续经历重建（experience-rebuild.js）取库口。
     *   为何另开一个模块而不并进 event-completeness：那个模块答「单件事四段齐不齐」，
     *   本模块答「几个段落是不是同一件事、能不能拼成一件完整的事」。
     *   两者共用四段词汇（cause/action/result/followup）但**判定对象不同**：后者按楼层顺序，本模块按来源进来。 */
    function _experienceRebuildLib() {
        return _moduleLib(() => window.LonShaExperienceRebuild, 'experience-rebuild.js');
    }
    /* [v3.355.0 · M6-O5] 双时间坐标（dual-time.js）取库口。
     *   为何不用 fact-version 的 occurredAt/learnedAt：它的 normalize 只保留 id/subject/predicate/value，
     *   自造时间字段会在归一时被彻底丢掉（存盘即失）。又不能改它：
     *   那会把「事实版本」与「时间坐标」两件事压成一件。故单独成模块。 */
    function _dualTimeLib() {
        return _moduleLib(() => window.LonShaDualTime, 'dual-time.js');
    }
    /* [v3.356.0 · M6-O2] 记忆问题求解器（evidence-solver.js）取库口。
     *   为何不并进 qa-thread：qa-thread 管**问句条件继承**（代词、时点、比较轴），
     *   本模块管**求解结构**（拆成多个子命题、连接支持与反证、缺环只给条件结论）。
     *   两者口径不同域，并进去会让「继承来的条件」与「求出来的依据」互相覆盖。 */
    function _evidenceSolverLib() {
        return _moduleLib(() => window.LonShaEvidenceSolver, 'evidence-solver.js');
    }
    /* [v3.356.0 · M6-O3] 可展开的多分辨率记忆（resolution-ladder.js）取库口。
     *   为何不并进 node-rollup / stm-ltm：那两者做的是**压缩**（把正文压成摘要），
     *   本模块做的是**可逆展开协议**（概览/骨架/原话三层按预算选层、缺源与未展开分列）。
     *   压缩决定「存什么」，展开决定「这一轮给哪一层」—— 判定对象不同。 */
    function _resolutionLadderLib() {
        return _moduleLib(() => window.LonShaResolutionLadder, 'resolution-ladder.js');
    }
    /* [v3.356.0 · M6-O6] 场景上下文编排（scene-orchestrator.js）取库口。
     *   为何不并进 material-pack：material-pack 的四种任务是**静态选材**，
     *   本模块管**幕次推进中的材料改编**（新增/退役、约束延续、私有视角隔离）。
     *   前者是清单，后者是过程 —— 并进去会让「这一轮该有什么」与「这一幕怎么变」分不清。 */
    function _sceneOrchestratorLib() {
        return _moduleLib(() => window.LonShaSceneOrchestrator, 'scene-orchestrator.js');
    }
    // [v3.305.0 · X9] 统一记忆工具 API（memory-tools-api.js）。为什么需要：
    //   M-X9 点名的五个 API 里，修前只有 explainRecall 有实现，其余四个名**全仓零命中** ——
    //   它们的能力早在盘上（evidence-query / volume-continuation / native-fact-admission /
    //   knowledge-trace 各自的出口），但没有任何一处把「下游可以按名调用的统一面」产出来。
    //   后果是下游只能按模块名逐个结对（readLonshaEvidence / readProjection …），
    //   每加一条上游能力就要多一处硬编码配对，而上游一改名下游就静默失效
    //   —— 正是本仓最贵的那笔老账（同一件事两份口径）。
    //   本模块**不实现业务**：只做「按名找能力 + 装进统一信封 + 把缺席/空/判不了/收窄分成互不同形的五态」。
    //   故此处只加**一个取库口**；五个被包装能力的装配点唯一在 `memoryToolsSources()`。
    function _memoryToolsLib() {
        return _moduleLib(() => window.LonShaMemoryTools, 'memory-tools-api.js');
    }
    // [v3.310.0 · M-X1] 用户侧记忆控制中心（memory-center.js）。为什么需要：
    //   X1 已交付结构化查询**内核**（evidence-query.js），但全仓没有一处把它渲染成界面，
    //   也没有一处把「按角色/时间/楼层/来源/状态组合筛选」的**条件**收成可保存可回放的对象
    //   —— 用户侧那一面是空的（M-X1 原文：「仍主要是内核出口」）。
    //   本模块不重做查询：条件口径、保存/回放、分页全走 evidence-query（**单一真源**，
    //   经 memoryCenterDeps 注入）；它只做「界面模型 + 四态分形 + 动作只声明不执行 + 零写」。
    //   故此处只加**一个取库口**；七件依赖的装配点唯一在 `memoryCenterDeps()`。
    function _memoryCenterLib() {
        return _moduleLib(() => window.LonShaMemoryCenter, 'memory-center.js');
    }
    // [v3.311.0 · M-X2] 修复落定面（repair-settle.js）。为什么需要：
    //   X2 已把「登记 → 逐项落笔 → 核原数据 → 落盘回读 → 带证据 settle」做通，但**落定之后**
    //   还有五格空着（详细理由见该模块档头）：仅登记与「事实已纠正」同形 / 全部成功与部分成功
    //   同形 / 失败项只能整批重放 / 预览无凭据（切聊后旧预览无人拦）/ 召回缓存不跟随同代变化。
    //   本模块不重做落笔：逐项改法仍归 `_repairOwners()`、核验仍归 `_verifyRepairItem()`
    //   （**单一真源**：本刀不另写第二套落笔通道）；它只做「四态判定 + 同代一致性 + 票据 +
    //   定向重试计划 + 召回缓存作废清单」五个纯函数读数。
    //   故此处只加**一个取库口**；三件依赖的装配点唯一在 `_settleDeps()`。
    function _repairSettleLib() {
        return _moduleLib(() => window.LonShaRepairSettle, 'repair-settle.js');
    }
    // [v3.311.0 · M-X2] 召回产物（recall-artifact.js）的**取库口**。
    //   为什么此前没有这一口：全仓三处调用点各自内联 `window.LonShaRecallArtifact`（5549/5960/12077），
    //   于是「模块缺席」在这三处各写一遍判断。本刀要用的是它的 `invalidateTurn`（既有写面），
    //   与其再抄第四份内联，不如收成取库口 —— 与 `_repairLoopLib` 等 20 余个取库口同规格。
    function _recallArtifactLib() {
        return _moduleLib(() => window.LonShaRecallArtifact, 'recall-artifact.js');
    }
    /**
     * [v3.296.0 · X1] 账本登记表（**取自工作台，不另抄一份**）。
     *
     * 为什么必须复用而不在宿主再写一份「哪本账取哪个字段」：
     *   那份知识已经是 evidence-workbench.js 的 `LEDGERS`（state / pick / project / keyOf
     *   四件套）。宿主再抄一份 ⇒ 两份必然漂移，且漂移形态正是本仓治理过多轮的
     *   「照抄别账字段名 ⇒ 恒空」（v3.233.0 F-2 在 event-completeness 上踩过一次）。
     * 取不到工作台 ⇒ 返回空数组（内核会如实报「扫描面为空」，**不是**「没有证据」）。
     */
    /**
     * [v3.322.0 · M3-X1] 逐账**现状**读数（读侧缺口的唯一装配点）。
     *
     * 【与 `_ledgerApis()` 是两件事（不是第二个真源）】
     *   · `_ledgerApis()` 答「这本账的 **API** 在不在」—— 投影 / 准入要用它；
     *   · 本函数答「这本账**现在**是空账还是有条目」—— 从 `worldProg.*` 状态读。
     *   合成一件事会让「取不到 API」与「账是空的」再次同形（本仓反复治过的漏）。
     *
     * 【契约】
     *   · **按需**调用：只在该问真出现「未参与的账」时才算（不在每次问答都付一遍）；
     *   · 逐项 try：单本账读不出不得让整张表消失；
     *   · 三态而非布尔：有条目 ⇒ `'has-items'`；空数组 ⇒ `'empty'`；取不到 ⇒ `'absent'`。
     *     「没有这本账」与「这本账是空的」不是同一句话。
     *
     * @returns {object} { <ledgerId>: 'has-items' | 'empty' | 'absent' }
     */
    function _qaHelpDeps() {
        const ledgers = _evidenceQueryLedgersOf();
        const out = {};
        for (const spec of ledgers) {
            try {
                const st = (typeof spec.state === 'function') ? spec.state(this) : undefined;
                const items = (typeof spec.pick === 'function') ? (spec.pick(null, st) || []) : [];
                out[spec.id] = !Array.isArray(items) ? 'absent' : (items.length ? 'has-items' : 'empty');
            } catch (_e) { out[spec.id] = 'absent'; }
        }
        return out;
    }
    function _evidenceQueryLedgersOf() {
        try {
            const W = _evidenceWorkbenchLib();
            return (W && Array.isArray(W.LEDGERS)) ? W.LEDGERS : [];
        } catch (_e) { return []; }
    }
    /**
     * [v3.214.0] R1-E：九账 API 表（**单一真源**，工作台接线只从这里取）。
     *
     * 【为什么单列成一个函数，而不是在工作方法里逐项内联】
     *   本函数第一版就是内联的，且**当场自伤**：写成了 `_seedLedgerLib()` 这类
     *   「看起来符合本仓命名习惯、实际并不存在」的助手调用 —— 六个未定义引用
     *   （seed / commitment / parallel / secret / recall-echo / echo）会让
     *   `_evidenceWorkbench()` 每次都抛 ReferenceError，被外层 catch 吞成
     *   `reason:'thrown'`，于是工作台**永远显示「不可用」而不报错**，
     *   正是本仓一直在治的那类静默失效（不报错、只错结果）。同一形态在
     *   「签名猜错 → 死代码」上出现过多次，故此处把取库收成一处、逐项与全局名对齐。
     *
     * 【契约】
     *   · 九键**必须齐全**（缺键即 `module-unavailable`，与「这本账是空的」可分）；
     *   · 取库一律走 `_moduleLib`（全局优先 + require 回落，与 index.js 其余取库同规格）；
     *   · 本函数**不抛**：任何一项取库失败都落成 null，由内核判 absent。
     */
    function _ledgerApis() {
        const safe = (getGlobal, fileName) => { try { return _moduleLib(getGlobal, fileName); } catch (_e) { return null; } };
        return {
            'seed': safe(() => window.LonShaSeedLedger, 'seed-ledger.js'),
            'commitment': safe(() => window.LonShaCommitmentLedger, 'commitment-ledger.js'),
            'parallel': safe(() => window.LonShaParallelLedger, 'parallel-ledger.js'),
            'secret': safe(() => window.LonShaSecretLedger, 'secret-ledger.js'),
            'recall-echo': safe(() => window.LonShaRecallEcho, 'recall-echo.js'),
            'echo': safe(() => window.LonShaEchoLedger, 'echo-ledger.js'),
            'fact-version': _factVersionLib(),
            'event-completeness': _eventCompletenessLib(),
            'repair': _repairLoopLib()
        };
    }
    // [v3.194] 修复闭环（repair-loop.js）。撤销一条错误事实后，从它派生的摘要/关系/
    //   时间线还在引用旧值——本仓治理过多轮的「源头改了、下游没跟着改」。本模块把一次修复
    //   变成一份**受影响的派生件清单**，逐项落定（done/failed/missing）才算修完。
    function _repairLoopLib() {
        return _moduleLib(() => window.LonShaRepairLoop, 'repair-loop.js');
    }
    // [v3.207] 账本实体契约（ledger-entity.js，单一真源）。为什么需要：
    //   本仓六本「逐条实体 + 变更历史」的账（伏笔/秘密/平行事实/约定/事实版本/事件线）
    //   此前各抄一份实体读取契约（`finite(x) || 1` 六处、`item.revision += 1` 六处、
    //   history 幂等+截断五处、text/finite 六处）—— 改一处漏五处正是本仓治理过多轮的漏。
    //   契约收进本模块后，六本账只传各自的 MAX_HISTORY 与归一化器。
    // 同时补上一个**功能级失效**：`item.revision` 此前写进去但全仓零消费
    //   （没有任何调用点读它、没有测试锁它），是典型的「有字段没人读」。
    //   下面 selfCheck 的「账本实体」一行把它变成真实读侧：条目数 / 修订合计 / 未定型数。
    function _ledgerEntityLib() {
        return _moduleLib(() => window.LonShaLedgerEntity, 'ledger-entity.js');
    }
    // 六本账的（标签 + 状态 + 容器名）清单 —— 自检面的**唯一真源**，与各账的 box 名成对。
    //   写成函数而非常量：状态字段全部是 this.*，构造期还没有值。
    function _ledgerBooks() {
        return [
            { label: '约定', state: this.worldProg && this.worldProg.commitmentLedger, box: 'items' },
            { label: '伏笔', state: this.worldProg && this.worldProg.seedLedger, box: 'items' },
            { label: '平行', state: this.worldProg && this.worldProg.parallelLedger, box: 'items' },
            { label: '秘密', state: this.worldProg && this.worldProg.secretLedger, box: 'items' },
            { label: '事实', state: this._factVersionState, box: 'facts' },
            { label: '事件', state: this._eventThreadState, box: 'events' }
        ];
    }
    function _newSceneBook(seed) {
        const SB = _sceneBookLib();
        const book = (SB && typeof SB.SceneBook === 'function')
            ? new SB.SceneBook(seed)
            : new SceneBookFallback(seed);     // 模块缺席：退到内置实现，**不静默化成空对象**
        return book;
    }
    // 模块缺席时的内置退路：与 scene-book.js 的公开面**同形**（少功能但绝不抛、绝不静默）。
    //   为什么不留着旧类当退路：两份实现会漂移（本仓库治理过十几轮的缺陷形态）。故退路是
    //   一层**常量空实现**：读数全部如实回报「没有」，而不是伪造一个能写不能读的世界。
    class SceneBookFallback {
        constructor() {
            this.nodes = new Map(); this.track = []; this.opsLog = [];
            this.visits = new Map(); this.presence = new Map();
            this.lastApply = null; this.capacity = { nodes: 0, dropped: 0, visitsDropped: 0, trackDropped: 0 };
            this._absent = true;
        }
        static keyOf(path) { return (path || []).map(s => String(s).trim()).filter(Boolean).join('/'); }
        static leafOf(path) { const p = (path || []).map(s => String(s).trim()).filter(Boolean); return p.length ? p[p.length - 1] : ''; }
        apply() { return 0; }
        setLocation() { return false; }
        setPresence() { return false; }
        removePresence() { return false; }
        clearPresence() { return 0; }
        presenceAt() { return []; }
        whereIs() { return null; }
        samePlace() { return false; }
        findByLeaf() { return null; }
        currentKey() { return null; }
        currentChain() { return []; }
        chainOf() { return []; }
        history() { return []; }
        trackByPlace() { return []; }
        visitsOf() { return null; }
        visitsList() { return []; }
        outlineOf() { return null; }
        scale() { return { nodes: 0, detailed: 0, depth: 0, visits: 0, presence: 0 }; }
        currentLine() { return null; }
        brief() { return '（暂无已登记场景）'; }
        briefAt() { return null; }
        // [v3.220.0] R3-A：三个新外供面的同形退路（模块缺席时必须与真实现同形，
        //   否则调用方读这三面会在缺席时外抛）。缺席如实报空，绝不伪造「有层级/有到访」。
        tree() { return []; }
        visitHistory() { return []; }
        headerFace() { return null; }
        // [v3.221.0] R3-D：回滚/前移面的同形退路（模块缺席时调用方不得外抛）。
        clearHeader() { return false; }
        shiftFloorRefs() { return 0; }
        // [v3.221.0] R3-D：退路覆盖度必须与真实现**逐键同形**。
        //   修前实测：真实现已补 headerFloors / headerCount，退路仍是 13 键 —— 于是模块缺席时
        //   调用方读这两格得到 undefined，塌成「有这面但没数」第三态（既非「这版没这面」
        //   也非「这面是空的」）。缺席读数的形状是本仓反复治理过的那类塌陷，一律给同形空值。
        coverage() { return { floors: [], floorCount: 0, steps: [], trackFloors: [], headerFloors: [], headerCount: 0, nodes: 0, detailed: 0, visits: 0, presence: 0, unregistered: [], unregisteredCount: 0, state: 'absent', broken: [], warnings: [] }; }
        checkInvariants() { return { state: 'absent', broken: [], warnings: [] }; }
        rollbackFrom() { return 0; }
        rollbackFloorOnly() { return 0; }
        rebuildFromOps() { return 0; }
        clear() { return 0; }
        export() { return { version: 0, nodes: [], track: [], opsLog: [], visits: [], presence: [], capacity: this.capacity, absent: true }; }
        import() { /* 无真源可导入：如实保持空 */ }
        summary() { return { version: 0, scale: this.scale(), current: null, currentLine: null, currentChain: [], presence: [], coverage: this.coverage(), tree: this.tree(), visits: this.visitHistory(), header: this.headerFace(), empty: true, absent: true }; }
    }
    // [v2.2] RC: 相对时间前缀（抄 baibai timeRel：数字日历精确算天数差，宁可不标绝不标错）
    function parseStoryDateLoose(s) {
        s = String(s || '');
        // 带年: 2026年3月12日 / 2026-3-12 / 2026/3/12 / 2026.3.12
        let m = s.match(/(\d{3,4})\s*[年\/\-.]\s*(\d{1,2})\s*[月\/\-.]\s*(\d{1,2})/) || s.match(/(\d{1,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/);
        if (m) {
            let y = Number(m[1]); if (y < 100) y += 2000;
            const mo = Number(m[2]), d = Number(m[3]);
            if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { y, mo, d };
            return null;
        }
        // 无年: 3月12日 / 3月12 / 3-12(后接边界, 防"1.5个小时"小数误判)
        m = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/) || s.match(/(\d{1,2})[\/\-.](\d{1,2})(?=$|\s|日)/);
        if (m) {
            const mo = Number(m[1]), d = Number(m[2]);
            if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { y: null, mo, d };
        }
        return null;
    }
    function storyDayDiff(dateA, dateB) {
        const a = parseStoryDateLoose(dateA), b = parseStoryDateLoose(dateB);
        if (!a || !b) return null;
        // 年份补齐: 双方都无年按同年比; 一方无年借用对方的年; 差值超2年视为年份推测可疑, 宁可不标
        let ya = a.y, yb = b.y;
        if (ya === null && yb === null) { ya = 2000; yb = 2000; }
        else if (ya === null) ya = yb;
        else if (yb === null) yb = ya;
        const diff = Math.round((new Date(ya, a.mo - 1, a.d) - new Date(yb, b.mo - 1, b.d)) / 86400000);
        if (isNaN(diff) || Math.abs(diff) > 730) return null;
        return diff;
    }
    // [v2.6] RG: 相对时间统一走 RelativeTimeHelper（架空日历/全角分隔符容忍），旧 storyDayDiff 保留为兜底
    function relativePrefix(dateStr, nowStr) {
        try {
            const p = _newRelativeTimeHelper().relativeTimePrefix(dateStr, nowStr);
            if (p) return p;
        } catch (e) { errLog(e, 'relativePrefix.legacy兜底'); }
        try {
            if (!dateStr || !nowStr) return '';
            const diff = storyDayDiff(nowStr, dateStr);
            if (diff === null || isNaN(diff)) return '';
            if (diff === 0) return '今天';
            if (diff === 1) return '昨天';
            if (diff === 2) return '前天';
            if (diff > 2 && diff < 7) return diff + '天前';
            if (diff >= 7 && diff < 30) return Math.floor(diff / 7) + '周前';
            if (diff >= 30 && diff < 365) return Math.floor(diff / 30) + '个月前';
            if (diff >= 365) return Math.floor(diff / 365) + '年前';
            if (diff === -1) return '明天';
            if (diff < -1 && diff > -7) return Math.abs(diff) + '天后';
            return '';   // 更远的未来不标（宁可不标绝不标错）
        } catch (e) { return ''; }
    }

    // [v3.38] 关系多维共存与互斥演化（Zep/Graphiti 理念）
    const RELATION_CONFLICT_GROUPS = [
        new Set(['陌生', '相识', '友好', '暧昧', '暗恋', '热恋', '恋人', '夫妻', '冷战', '决裂', '陌路']),
        new Set(['盟友', '同行', '中立', '对立', '敌对', '宿敌', '仇敌', '背叛'])
    ];
    function areLabelsInConflict(l1, l2) {
        if (!l1 || !l2 || l1 === l2) return false;
        for (const group of RELATION_CONFLICT_GROUPS) {
            if (group.has(l1) && group.has(l2)) return true;
        }
        const p1 = `${l1}-${l2}`, p2 = `${l2}-${l1}`;
        if (/恋人-决裂|决裂-恋人|友好-敌对|敌对-友好|盟友-宿敌|宿敌-盟友/i.test(p1)) return true;
        return false;
    }
    

    // [v1.8] P0: POV 私密记忆（抄 stbme memory-scope：客观 vs 角色主观认知隔离）
    // [v3.16] 角色记忆银行（收编 zhino 两层记忆）: 核心(永久) + 近期(自动更替)

    
    // [v1.8] P0: 剧情时间线（抄 yuzuki plot-summary：按剧情日期排序）
    // ═══════════════════════════════════════════════════════════════
    // [v2.6] RG: 相对时间工具类（移植自 baibai timeRel.ts 核心算法）
    // 用途：给历史记忆注入加相对前缀（「昨天」「3天前」「上周」），
    // 让主模型与用户都能直观感知「这段剧情距离现在多久」。
    // 设计底线（沿用 baibai）：时间是 AI 写的自由文本，数字日历精确算天数差，
    // 架空日历（霜月3日）仅同月可算，跨架空月放弃。宁可不标，绝不标错。
    // ═══════════════════════════════════════════════════════════════
    // [v3.16] 世界推进（收编 zhino）: 不在场角色独立行动
    // 每 N 楼标记 pending → 下次消息生成前推演不在场角色行动（不抢 AI 生成 API）
        // [v3.46] 吸收 Bakemono: 剧情时钟与回忆隔离（GameClock）
    // [v3.152] ANIMA 词典线 A1：术语词典（聊天内非角色实体术语的 surface 化沉淀）。
    // 检索端既有 buildAliasMap（角色昵称）也有本词典（物品/地名/概念/招式/组织等），
    // 查询命中术语时把规范名 + 释义短语附加进查询文本，BM25 与向量同享。
    // 存档键 'lexicon'（CP 冻结键契约登记见 collectExport/restoreFromPayload），
    // 构造零依赖（无 window/ST 时安静降级为纯数据类，可被 Node 单测直接实例化）。
    // [v3.152] ANIMA 词典线 A1：对外挂载（与 LonShaEventChain 等库挂载同构；本类内联 index.js 无外部依赖）
    // [v3.264.0 A1 第五刀] EntityLexicon 已外移到 memory-organs.js：兼容挂载点**保留**
    //   （外部脚本/面板可能读它，历史套件 v3152 也断言本行在场），但取的是模块导出的那一份。
    //   用 getter 而非构造期取值：extra_js 在入口之后加载，构造期模块还没挂上。
    //   模块缺席时回 null（调用点已改走 _newMemoryOrgan 的同形空实现，不经本挂载点）。
    //   ① 本行下方的 getter 就是那个挂载点：`window.LonShaEntityLexicon` 仍可读（读到的是模块导出的那一份）。
    Object.defineProperty(window, 'LonShaEntityLexicon', {
        configurable: true,
        get() { return { EntityLexicon: (_memoryOrgansLib() || {}).EntityLexicon || null }; },
    });
    // [v2.0] P2: 角色状态表（抄 yuzuki character-status：数值状态 + 待办生命周期）
    
    
    
    
    // [v2.5] RF: 活人感日记（抄 hcdiary——第一人称心声+secret+记忆回环; 旧版仅summary副本已废弃）
    // [v2.8] RT-B: 反思系统（抄 stbme reflection——每N楼从近期剧情提炼高层洞察）
    




        // [v3.48] 吸收 shujuku: 剧情大纲导演（阶段节奏四形态 + 轮级 pacing 四相 + 宽容标签解析）
    // 记忆插件从此有了"导演视角"：不只记录过去，还规划未来。




    

    class LonShaMemoryPlugin {
        constructor() { 
            this.configMgr = _newConfigManager();   // [v3.267.0] A1 第七刀外移 memory-config.js 
            this.engine = new MemoryEngine(this.configMgr); 
            this.emergency = _newMemoryAux('EmergencyBackup', {
            errLog: (e, tag) => { try { errLog(e, tag); } catch (_) { /* 诊断不得成为新的失败 */ } }
        });   // [v3.4] DB: 紧急备份
            this.diffusion = null;
            this.visualizer = null;
            this.initialized = false; 
            // [v3.164] 诊断桥：selfCheck 属于 engine，而控制平面台账在 plugin 上。
            //   工程中 engine.plugin 从未被赋值（engine 不知道自己属于哪个 plugin），
            //   故由 plugin 主动注入一个**只读状态提供者**——engine 侧只读不改，
            //   避免为了「显示一行诊断」而引入 engine -> plugin 的反向依赖。
            try { this.engine.stateProvider = () => this._controlInfo; } catch (e) { /* 非致命 */ }
        }
        /** [v3.93.0] 官方只读门面: 供外部脚本(如 RubyPhone graph-bridge)读取结构域数据,
         *  替代对 engine 内部深层结构 (graph.nodes.values()/summary.summaries/...) 的硬编码访问。
         *  只读契约——返回 plain object, 不暴露任何写入引擎的引用。
         * @returns {null|{graph:{nodes,edges},summaries,diaries,povs,timeline,status,ledger,vectors}} */
        getPublicData() {
            try {
                const engine = this.engine;
                if (!engine || !engine.graph) return null;
                return {
                    graph: {
                        nodes: Array.from(engine.graph.nodes?.values?.() || []),
                        edges: Array.from(engine.graph.edges?.values?.() || [])
                    },
                    summaries: engine.summary?.summaries || [],
                    diaries: engine.diary?.diaries || engine.diary?.list || [],
                    povs: engine.pov?.povs || [],
                    timeline: engine.timeline?.events || engine.timeline?.list || [],
                    status: engine.status || null,
                    ledger: engine.ledger || null,
                    vectors: engine.vector?.vectors || []
                };
            } catch (e) { return null; }
        }
        /** [v3.117] 公开错误诊断门面：设置 UI 与外部诊断工具只可追加记录/读取副本，不能修改内部缓冲。 */
        reportError(error, tag = 'external') {
            errLog(error, tag);
            return true;
        }
        getErrorLog(limit = 15) {
            const n = Math.max(0, Math.min(50, Number(limit) || 15));
            return _errBuf.slice(-n).map(item => ({ ...item }));
        }
        /** [v3.93.0] 官方写入门面: 向图谱追加高价值记忆节点 (官方 addNode/addEdge 通道)。

         * 供 RubyPhone pushPhoneMemories 等外部写入, 替代直连 engine.graph。
         * @returns {{graph: null|Object}} 图谱句柄 (仅含 addNode/addEdge/nodes), 插件不可用时为 null */
        getGraphWriter() {
            try {
                const g = this.engine?.graph;
                if (!g || typeof g.addNode !== 'function') return null;
                return g;
            } catch (e) { return null; }
        }
        async init() {
            if (this.initialized) return;
            console.log(`[${PLUGIN_NAME}] v${VERSION} 初始化...`);
            await this.waitForST();
            /* [v3.300.0 M-O2] ★ 真宿主装载面修复：宿主只加载 manifest.js，extra_js 从来没人读。
             *   必须在 loadModules() / rebindModuleDeps() / createUI() / ensureSettingsUI() **之前**
             *   跑完 —— 它们全都依赖模块全局（rebindModuleDeps 更是「模块已挂上」这一前提的消费方）。
             *   失败只留痕、不阻断 init（与 ensureSettingsUI 同规格）。 */
            try { await this.ensureExtraJs(); } catch (e) { errLog(e, 'init.ensureExtraJs'); }
            this.loadModules();
            /* [v3.277.0 O7] 模块装载之后立刻重绑依赖：extra_js 已挂上，此时注入才真正生效。
             *   放在 loadModules 之后、registerEvents 之前 —— 事件接线与后续构造会用到
             *   被注入后的模块符号，顺序不能颠倒。失败只留痕、不阻断 init（注入是增强不是前置）。 */
            try { this.engine.rebindModuleDeps(); } catch (e) { errLog(e, 'O7.init.rebindModuleDeps'); }
            /* [v3.301.0 · M-O2 第二刀] ★ 依赖注入之后**重建装配**（顺序：先注入模块、再造实例）。
             *   为什么必须在 rebind 之后：rebind 把宿主现算的符号注入**模块**，此后 new 出来的
             *   实例才持有注入过的模块；反序会让实例闭包停留在未注入的那一份。
             *   为什么必须重建：构造期在入口加载时，extra_js 尚未挂上 ⇒ 装配全落空退路
             *   （真宿主实测 before：32 个受检成员里 31 个 `_absent=true`、配置 0 键、
             *   saveConfig 空转）；此处换成真实现，并把重建前的用户数据面原样回灌。
             *   配置实例必须**新造一份**（构造期那份是 ConfigManagerFallback，持 0 键）。
             *   失败只留痕、不阻断 init（与 ensureExtraJs 同规格）。 */
            try {
                this.configMgr = _newConfigManager();
                this.engine.rebuildComponents(this.configMgr);
            } catch (e) { errLog(e, 'init.rebuildComponents'); }
            /* 紧急备份同为构造期产物（其消费点在 init 之后的真实事件里），退路必须换掉。 */
            try {
                if (this.emergency && this.emergency._absent === true) {
                    this.emergency = _newMemoryAux('EmergencyBackup', { errLog: (e, tag) => { try { errLog(e, tag); } catch (_e) { /* 诊断不得成为新的失败 */ } } });
                }
            } catch (e) { errLog(e, 'init.emergencyRebuild'); }
            this.registerEvents();
            this.createUI();
            await this.ensureSettingsUI();
            // [v3.180] 公开接口三入口（全局/斜杠/宏）。注册点必须在 init 内，但不能同步调用：
            //   register() 会探测 window.lonsha_memory_bridge_v1 是否已挂，而桥对象在 plugin.init()
            //   返回**之后**才赋值——同步注册会让 global 入口恒报 absent（一次成功的失败声明）。
            //   故延后一拍执行，且绝不阻塞 init（失败只留痕，不影响记忆管线）。
            try { this._registerPublicInterface(); } catch (e) { errLog(e, 'init.publicInterface'); }
            // [v1.2] 初始化时加载当前对话的已有记忆数据
            try {
                const chatId = this.engine.getCurrentChatId();
                if (chatId) {
                    const data = await this.engine.storage.load(chatId);
                    if (data) console.log(`[${PLUGIN_NAME}] ✓ 已加载历史记忆 (节点 ${this.engine.graph.nodes.size}, 向量 ${this.engine.vector.vectors.length})`);
                }
            } catch (err) {
                console.warn(`[${PLUGIN_NAME}] 历史记忆加载失败:`, err);
            }
            // [v3.138] CP-L2 时序修复：迁移检测必须在本地存档加载（登记装载身份）之后，
            // 否则判旧读到的是未加载前的默认值（原位置在 load 之前，v3.23 起判旧失真）。
            try { this.checkEmbeddedMigration(); } catch (e) { errLog(e, '迁移恢复.init'); }
            this.initialized = true;
            // [v3.165] 复合能力声称不能写死：此前这行把 LLM/向量检索/图扩散/可视化四个能力
            //   压成一个常量字符串，于是模块缺失时依旧报「已启用」——声称与事实无关。
            //   改为由 _moduleStatus（loadModules 的实测结果）派生，缺失项单独点名。
            const _caps = ['LLM', '向量检索'];
            const _missing = [];
            if (this._moduleStatus && this._moduleStatus.diffusion) _caps.push('图扩散'); else _missing.push('图扩散');
            if (this._moduleStatus && this._moduleStatus.visualizer) _caps.push('可视化'); else _missing.push('可视化');
            console.log(`[${PLUGIN_NAME}] ${_missing.length ? '⚠️ 初始化完成' : '✓ 初始化完成'} (${_caps.join('+')}已启用${_missing.length ? '；未启用 ' + _missing.join('/') : ''})`);
        }
        
        // [v1.3] 设置面板加载兜底：宿主若不加载 extra_js，则动态注入 settings-ui.js
        async ensureSettingsUI() {
            if (this.showSettingsPanel) { this._settingsUIMounted = true; return; }
            try {
                const scriptSrc = document.currentScript?.src
                    || Array.from(document.querySelectorAll('script[src]')).map(s => s.src).find(s => s.includes('lonsha-memory-plugin') && s.endsWith('index.js'));
                if (!scriptSrc) return;
                const base = scriptSrc.replace(/index\.js.*$/, '');
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = base + 'settings-ui.js';
                    s.onload = resolve;
                    s.onerror = reject;
                    document.head.appendChild(s);
                });
                // 等待挂载完成
                for (let i = 0; i < 20 && !this.showSettingsPanel; i++) {
                    await new Promise(r => setTimeout(r, 150));
                }
                this._settingsUIMounted = !!this.showSettingsPanel;
                console.log(`[${PLUGIN_NAME}] ${this._settingsUIMounted ? '✓ 设置面板已加载 (动态注入)' : '⚠️ 设置面板加载超时'}`);
            } catch (err) {
                console.warn(`[${PLUGIN_NAME}] settings-ui.js 动态加载失败:`, err);
                // [v3.165] 失败也要留下**可读状态**：原来只有一行 warn，调用方无从判断
                //   「面板没加载」还是「还在加载中」—— 设置面板是用户唯一能看到自检的地方。
                this._settingsUIMounted = false;
                this._settingsUILoadError = (err && err.message) || String(err);
            }
        }
        /**
         * [v3.180] 公开接口三入口接线（幂等、绝不抛、失败可归因）。
         *   本插件此前对外只有 window.lonsha_memory_bridge_v1 一个入口——用户想在聊天里查一眼
         *   主角档案做不到，卡作者想在 prompt 里引用剧情时钟也做不到（全库 grep
         *   registerSlashCommand/registerMacro/SlashCommandParser 在产品代码里零命中）。
         *   注册结果**如实留痕**到 this._publicInterfaceReport：三个入口各自成败，互不连坐。
         */
        _registerPublicInterface() {
            const run = async () => {
                try {
                    const PI = _moduleLib(() => window.LonShaPublicInterface, 'public-interface.js');
                    if (!PI || typeof PI.register !== 'function') {
                        this._publicInterfaceReport = {
                            at: Date.now(),
                            global: { state: 'absent', reason: 'public-interface.js 未加载' },
                            slash: { state: 'absent', reason: 'public-interface.js 未加载' },
                            macro: { state: 'absent', reason: 'public-interface.js 未加载' }
                        };
                        console.warn(`[${PLUGIN_NAME}] ⚠️ 公开接口未注册：public-interface.js 未加载（斜杠命令与宏均不可用）`);
                        return null;
                    }
                    const eng = this.engine;
                    const rep = await PI.register({
                        // 快照与覆盖度都取**当下真源**：coverage 是现算读数（不入快照存盘），
                        //   存进快照就成了历史——这条边界由 public-interface 侧统一处理。
                        snapshot: () => {
                            try { return (window.lonsha_memory_bridge_v1 && window.lonsha_memory_bridge_v1.snapshot) || null; }
                            catch (e) { return null; }
                        },
                        coverage: () => {
                            try { return (eng && typeof eng._floorLedgerCoverage === 'function') ? eng._floorLedgerCoverage() : null; }
                            catch (e) { return null; }
                        },
                        // 宿主版本差异：斜杠命令两条路径、宏两条路径，由 public-interface 按可用性探测。
                        //   这里只提供 dynamicImport 原语（宿主模块经 URL 动态载入）。
                        dynamicImport: (p) => import(/* webpackIgnore: true */ p)
                    });
                    this._publicInterfaceReport = rep;
                    console.log(`[${PLUGIN_NAME}] 公开接口: 斜杠=${rep?.slash?.state || '—'}(${rep?.slash?.path || '—'}) 宏=${rep?.macro?.state || '—'}(${rep?.macro?.path || '—'}) 全局=${rep?.global?.state || '—'}`);
                    return rep;
                } catch (e) { errLog(e, 'publicInterface.register'); return null; }
            };
            setTimeout(() => { run(); }, 0);
        }
        /** [v3.300.0 M-O2] 真宿主装载面：把 manifest.extra_js 真正挂上去（幂等、如实留痕）。
         *  读数存 `this._extraJsLoad`（诊断面板与判据都从这里读，**不另造一份**）。 */
        async ensureExtraJs() {
            try {
                if (this.config && this.config.config && this.config.config.preferModuleFiles === false) {
                    this._extraJsLoad = { status: 'disabled', started: false, okCount: 0, triedCount: 0, fail: [], at: Date.now() };
                    console.warn(`[${PLUGIN_NAME}] ⚠️ extra_js 自装载已按配置关闭（preferModuleFiles=false）：本仓模块全部走 CJS 回落，机制不生效`);
                    return this._extraJsLoad;
                }
                const rep = await ensureExtraJsOnce();
                this._extraJsLoad = rep;
                if (rep.status === 'ok') {
                    console.log(`[${PLUGIN_NAME}] ✓ extra_js 已装载 ${rep.okCount}/${rep.triedCount} 项（宿主不读 manifest.extra_js，由本插件自行注入）`);
                } else {
                    console.warn(`[${PLUGIN_NAME}] ⚠️ extra_js 装载 ${rep.status}：${rep.okCount}/${rep.triedCount} 成功`
                        + (rep.fail.length ? '；失败 ' + rep.fail.map((f) => f.file + ':' + f.why).slice(0, 5).join(' / ') : ''));
                }
                return rep;
            } catch (e) { errLog(e, 'ensureExtraJs'); return null; }
        }
        loadModules() {
            // [v3.165] 成功声称面：原写法 `if (typeof X !== 'undefined') { 加载 + 报成功 }`
            //   在模块缺失时**什么都不做** —— 日志里只有成功，没有失败。而「模块没加载」
            //   恰好是最需要看见的那件事（特征静默降级：图扩散/可视化静默变兜底路径，
            //   功能变差但没有任何迹象）。凡以成功结尾的路径都必须有失败出口。
            this._moduleStatus = { diffusion: false, visualizer: false };
            // 加载图扩散模块
            if (typeof GraphDiffusion !== 'undefined') {
                try {
                    this.diffusion = new GraphDiffusion(this.engine.graph);
                    this._moduleStatus.diffusion = true;
                    console.log(`[${PLUGIN_NAME}] ✓ 图扩散模块已加载`);
                } catch (e) {
                    errLog(e, 'loadModules.GraphDiffusion');
                    console.warn(`[${PLUGIN_NAME}] ⚠️ 图扩散模块实例化失败：${(e && e.message) || e}（图扩散将退回朴素路径）`);
                }
            } else {
                console.warn(`[${PLUGIN_NAME}] ⚠️ 图扩散模块未加载（GraphDiffusion 未定义）：扩散检索将退回朴素路径`);
            }
            // 加载可视化模块
            if (typeof MemoryVisualizer !== 'undefined') {
                try {
                    this.visualizer = new MemoryVisualizer(this.engine);
                    this._moduleStatus.visualizer = true;
                    console.log(`[${PLUGIN_NAME}] ✓ 可视化模块已加载`);
                } catch (e) {
                    errLog(e, 'loadModules.MemoryVisualizer');
                    console.warn(`[${PLUGIN_NAME}] ⚠️ 可视化模块实例化失败：${(e && e.message) || e}（图谱可视化将不可用）`);
                }
            } else {
                console.warn(`[${PLUGIN_NAME}] ⚠️ 可视化模块未加载（MemoryVisualizer 未定义）：图谱可视化将不可用`);
            }
        }
        async waitForST() { return new Promise(resolve => { const check = () => { if (window.SillyTavern?.getContext) resolve(); else setTimeout(check, 100); }; check(); }); }
        // [v3.18] 控制平面（stbme 最小版）: 事件注册统一收口 + 就绪状态机
        // 所有事件处理器注册前先检查控制平面就绪，避免半初始化注册
        _controlReady = false;
        // [v3.164] 扩为可暴露的接线台账：events 之外记录期望/失败/卸载计数，
        //   selfCheck 与诊断面板据此回答「事件接线是否真的生效」（此前这组状态零消费者）。
        _controlInfo = {
            events: 0, lastEvent: null, registeredAt: null,
            expected: 0, failed: [], lastFailure: null, unregisterAttempts: 0,
            // [v3.165] 被拒绝的注册：类型无效时 bindEvent 拒绝挂载而不是静默 on(undefined)。
            //   拒绝数是「宿主事件表与插件预期不一致」的唯一运行时线索，必须可读。
            rejected: 0, lastReject: null,
            source: null,
        };
        ensureControlReady() {
            if (this._controlReady) return true;
            if (!window.SillyTavern?.getContext?.()) return false;
            this._controlReady = true;
            this._controlInfo.registeredAt = Date.now();
            return true;
        }
        // 统一事件注册包装：类型校验 + 记录 + 注册 + 登记（v3.165 起登记也在本处发生）
        //
        // [v3.165] 类型契约：type 为空（宿主 event_types 未声明该项）或 handler 不是函数时
        //   必须拒绝，不得进入 eventSource.on。实测 eventemitter3 风格的 eventSource 对
        //   on(undefined, h) 不抛异常（它只是往内部 map 塞一个 undefined 键），于是：
        //     监听器数目 +1、台账 events +1、失败哨兵认为接线完整 ——
        //   而该 handler 永远不会被触发（事件名不存在）。这是假绿最典型的形态：
        //   所有计数器都变好了，功能却是坏的。校验放在这里，而不是各调用点。
        bindEvent(eventSource, type, handler) {
            try {
                if (!this.ensureControlReady()) return false;
                if (typeof type !== 'string' || !type) {
                    this._controlInfo.rejected++;
                    this._controlInfo.lastReject = '事件名缺失（宿主 event_types 未声明该项）';
                    return false;
                }
                if (typeof handler !== 'function') {
                    this._controlInfo.rejected++;
                    this._controlInfo.lastReject = 'handler 不是函数';
                    return false;
                }
                eventSource.on(type, handler);
                this._controlInfo.events++;
                this._controlInfo.lastEvent = type;
                // [v3.165] 台账登记与实际注册在同一处发生：此前 push 写在 7 个调用点上、
                //   与 bindEvent 的成败无关，于是 bindEvent 返回 false（未就绪 / 类型无效 /
                //   eventSource.on 抛错）时仍会登记一条「已注册」记录 —— 卸载时会去 off 一个
                //   从未 on 过的函数：真监听卸不掉（泄漏），还可能顺手卸掉别的扩展的同类型监听。
                if (Array.isArray(this.eventHandlers)) {
                    this.eventHandlers.push({ eventSource, type, handler });
                }
                return true;
            } catch (e) { errLog(e, '控制平面.bindEvent'); return false; }
        }
        registerEvents() {
            // [v3.164] 幂等：重复调用先卸载已注册监听。否则 eventSource.on 会把同一批 handler
            //   再挂一遍（同一事件双触发），而台账里两份记录都会「卸载成功」——泄漏不体现在计数上。
            //   init() 有 initialized 守卫，但注册与置位之间存在 await 窗口，宿主重复调用即命中。
            if (this.eventHandlers?.length) {
                console.warn(`[${PLUGIN_NAME}] registerEvents 重复调用（已注册 ${this.eventHandlers.length} 个监听），先卸载再重装`);
                try { this.unregisterEvents(); } catch (e) { errLog(e, 'events.registerEvents防重入'); }
            }
            // [v3.18] 控制平面就绪检查（stbme 最小版）
            if (!this.ensureControlReady()) { console.warn(`[${PLUGIN_NAME}] 控制平面未就绪，跳过事件注册`); return; }
            // [v1.2 真机适配修复] 原实现监听 'message_received' 自定义事件，
            // 标准 SillyTavern 中不存在该事件，导致提取链路从不触发。
            // 正确方式：通过 SillyTavern 的 eventSource + event_types 注册。
            this.eventHandlers = []; // 记录已注册事件，供卸载清理
            // [v3.165] 重装前重置接线台账：events 的语义是「当前挂载数」，不是「历史累计数」。
            //   幂等路径会先 unregisterEvents() 再重装，但计数不归零 —— 第二次调用后台账显示
            //   14 个监听、实际只有 7 个。selfCheck 的可见性于是朝着「看起来更好」的方向撒谎，
            //   比不显示更危险。
            this._controlInfo.events = 0;
            this._controlInfo.lastEvent = null;

            try {
                const ctx = window.SillyTavern?.getContext?.();
                // [v3.165] TDZ 自引用修复：原写法 `|| (typeof eventSource !== 'undefined' ? eventSource : null)`
                //   里的 typeof 引用的是**本行正在声明的那个 const**（块内同名声明遮蔽了全局），
                //   而 typeof 不能保护 TDZ —— 于是 ctx 缺 eventSource 时这里直接抛
                //   ReferenceError: Cannot access 'eventSource' before initialization，
                //   抢在下面的早退分支之前进了 catch。后果有三个：
                //     1) 兜底分支（读全局 eventSource）永远不可达——写了兜底不等于兜底会用上；
                //     2) 「eventSource 不可用」这句明确的失败文案从不出现，用户看到的是异常堆栈；
                //     3) 失败被归因成「注册过程抛异常」，排查方向被引向错误的地方。
                //   改为显式读 globalThis（浏览器里 window.eventSource === globalThis.eventSource）。
                const eventSource = ctx?.eventSource
                    || (typeof globalThis !== 'undefined' && globalThis.eventSource ? globalThis.eventSource : null);
                const types = ctx?.event_types
                    || (typeof globalThis !== 'undefined' && globalThis.event_types ? globalThis.event_types : null);

                if (!eventSource || !types?.MESSAGE_RECEIVED) {
                    console.warn(`[${PLUGIN_NAME}] eventSource 不可用，事件监听未注册（仅手动模式可用）`);
                    // [v3.165] 这条 return 是最常见的「插件活着但没有记忆」入口（TDZ 自引用修复后它才真的可达，
                    //   之前 ctx 缺 eventSource 时会被 ReferenceError 抢走），此前只打一行
                    //   console.warn 就返回：台账、诊断行、失败清单全部空白，用户侧无处可查。
                    this._controlInfo.lastFailure = 'eventSource / event_types 不可用，未注册任何监听';
                    if (!this._controlInfo.failed.includes(this._controlInfo.lastFailure)) {
                        this._controlInfo.failed.push(this._controlInfo.lastFailure);
                    }
                    this._controlInfo.expected = 0;
                    return;
                }

                // MESSAGE_RECEIVED 回调参数是 messageId，需要从 chat 数组取消息对象
                const _h1 = (messageId) => {
                    try {
                        const c = window.SillyTavern?.getContext?.();
                        const message = c?.chat?.[messageId];
                        // [v3.1] SF5: 番外楼跳过（extra.lonsha_omit=true 的楼彻底排除记忆——必须在提取之前判定）
                        if (message?.extra?.lonsha_omit === true) {
                            if (this.engine.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 楼层 ${messageId} 为番外楼，跳过记忆提取`);
                            return;
                        }
                        if (message) {
                            /* [v3.218.0] R2-E：回复落层 ⇒ 本轮闭环（结局 = completed）。
                             *   位置必须在 `onMessageReceived` **之前**：它内部会把
                             *   `_generationActive` 复位，而结局标注要赶在随后的
                             *   `GENERATION_ENDED`（同一次生成也会走）把它误判成中止之前落定
                             *   （`_injectionEnd` 只从 'pending' 迁出，故这里落定后不会被改写）。 */
                            try { this.engine._injectionEnd('received'); } catch (e) { errLog(e, 'events.MESSAGE_RECEIVED结局'); }
                            this.engine.onMessageReceived(message, messageId);
                        }
                    } catch (err) {
                        console.error(`[${PLUGIN_NAME}] 消息处理失败:`, err);
                    }
                };
                                // [v3.164] 收口到 bindEvent：7 个注册点此前各自直接 eventSource.on，绕过了
                //   bindEvent 的就绪检查 / 事件计数 / 注册记录（控制平面成了装饰件）。
                if (!this.bindEvent(eventSource, types.MESSAGE_RECEIVED, _h1)) {
                    console.warn(`[${PLUGIN_NAME}] 事件 MESSAGE_RECEIVED 注册失败（控制平面未就绪或 eventSource 异常）`);
                }
                // [v3.165] 台账登记已移入 bindEvent（登记与注册同处，避免失败也登记）

                // CHAT_CHANGED：切换对话时重新加载对应数据
                if (types.CHAT_CHANGED) {
                    const _h2 = async () => {
                        try { this.engine._recallCache = null; } catch (e) { errLog(e, 'events.CHAT_CHANGED缓存清理'); }  // [v2.9] RU-D: 换对话，缓存失效
                        // [v3.129] 切换角色卡时重放卡级配置覆盖（anima 三级合并：新卡的配置立即生效）
                        try { this.engine.config?._applyCardOverrides?.(); } catch (e) { errLog(e, 'events.CHAT_CHANGED卡配置重放'); }
                        // [v3.236.0] R4-B：定期快照的节流锚点**按会话身份复位**（缺口 2 的修法）。
                        //   复位而不是保留：保留就等于让上一个会话的楼层数继续当闸门。
                        //   这里只动**锚点**，不动快照库 —— 快照本身按 chatId 分 id 存，
                        //   旧会话的快照不受影响、回去还能恢复（数据面与节流面必须分开）。
                        try { this.engine._snapshotAnchorChatId = null; this.engine._snapshotAnchorFloor = 0; } catch (e) { errLog(e, 'events.CHAT_CHANGED快照锚点复位'); }
                        /* [v3.236.0] R4-B：键历史随会话身份归零。快照与导入都是**按会话**装的，
                         *   跨会话沿用等于拿 A 会话的恢复账去判 B 会话的清空面。 */
                        try { this.engine._restoredKeyHistory = new Set(); } catch (e) { errLog(e, 'events.CHAT_CHANGED恢复键历史复位'); }
                        // [v3.126] 换对话重置日记/时间线变化游标与身份（onBeforeGeneration 兜底处理之外的事件路径也保持一致）
                        try { this.engine._diaryInjectFloor = null; this.engine._timelineInjectFloor = null; this.engine._timelineCursorChatId = null; this.engine._timelineCursorFingerprint = ''; } catch (e) { errLog(e, 'events.CHAT_CHANGED变化游标重置'); }
                        // [v3.109] 换对话清空产物的内存副本（持久副本随新对话各自 recover，不跨对话串用）
                        try { this.engine._recallArtifacts = []; this.engine._recallArtifactEvictions = { byAge: 0, byCap: 0, lastFloor: null, lastRemoved: 0, lastAt: 0 }; } catch (e) { errLog(e, 'events.CHAT_CHANGED产物清理'); }   // [v3.156] 淘汰账同清
                        // [v3.23.1] 换对话同步清空 dedup 指纹（防旧对话文本误标新对话）
                        try { resetRecallDedup(); } catch (e) { errLog(e, 'events.CHAT_CHANGED去重清空'); }
                        // [v3.25.1] 换对话同步清空归档状态（防旧对话楼层 index 误操作新对话）
                        try { this.engine._archivedFloorIds?.clear(); this.engine._archiveShiftLog = []; } catch (e) { errLog(e, 'events.CHAT_CHANGED归档清空'); }
                        // [v3.2] DF1/DF5: 清空注入槽位（setExtensionPrompt 持久化，旧聊天注入会残留到新聊天；GENERATION_STARTED 若仍活跃会立即重新注入）
                        try { clearInjectSlots(); } catch (e) { errLog(e, 'events.CHAT_CHANGED槽位清空'); }
                        // [v3.9] SF2: 基线重置（换聊天后用新聊天的长度，防旧基线误报批量删除）
                        try { this.engine._lastKnownChatLen = window.SillyTavern?.getContext?.()?.chat?.length || 0; } catch (e) { errLog(e, 'nonfatal') }
                        // [v3.12] 清自愈定时器/待愈集合（跨聊天污染防护——旧聊天的待愈楼层对新聊天无意义）
                        try {
                            if (this._editHealTimer) { clearTimeout(this._editHealTimer); this._editHealTimer = null; }
                            this._editHealPending = new Set();
                            this._selfHealRunning = false;
                            this._lockDegradePending = new Set();
                        } catch (e) { errLog(e, 'events.CHAT_CHANGED自愈清理'); }
                        try {
                            const chatId = this.engine.getCurrentChatId();
                            if (chatId) await this.engine.storage.load(chatId);
                        } catch (err) {
                            console.error(`[${PLUGIN_NAME}] 对话切换加载失败:`, err);
                        }
                    };
                                        // [v3.164] 收口到 bindEvent：7 个注册点此前各自直接 eventSource.on，绕过了
                    //   bindEvent 的就绪检查 / 事件计数 / 注册记录（控制平面成了装饰件）。
                    if (!this.bindEvent(eventSource, types.CHAT_CHANGED, _h2)) {
                        console.warn(`[${PLUGIN_NAME}] 事件 CHAT_CHANGED 注册失败（控制平面未就绪或 eventSource 异常）`);
                    }
                    // [v3.165] 台账登记已移入 bindEvent（登记与注册同处，避免失败也登记）
                }

                // [v3.7] 楼层编辑——升级为「精准回滚 + 防抖自愈」:
                //   只回滚被编辑楼（不再级联摧毁下游记忆），防抖 3s 后自动重提取该楼（编辑=新内容的新记忆）
                //   语义依据: 下游楼各自记录的是「它们所述剧情」，编辑楼改动不使下游失效（细致于旧级联策略）
                if (types.MESSAGE_EDITED) {
                    const _h3 = (messageId) => {
                        try { this.engine._recallCache = null; } catch (e) { errLog(e, 'events.MESSAGE_EDITED缓存清理'); }  // [v2.9] RU-D: 上下文变了，缓存失效
                        // [v3.23.1] 编辑楼同步清空 dedup 指纹（防编辑后的新内容被旧指纹误标）
                        try { resetRecallDedup(); } catch (e) { errLog(e, 'events.MESSAGE_EDITED去重清空'); }
                        // [v3.25.1] 编辑楼清空归档状态（该楼折叠覆盖关系可能已变化）
                        try { this.engine._archivedFloorIds?.clear(); } catch (e) { errLog(e, 'events.MESSAGE_EDITED归档清空'); }
                        try {
                            const f = Number(messageId);
                            if (!Number.isFinite(f) || f < 0) return;
                            console.log(`[${PLUGIN_NAME}] 楼层 ${f} 被编辑: 回滚该楼 + 防抖自愈`);
                            this.engine.rollbackFloor(f);
                            this._scheduleFloorHeal(f);   // [v3.8] 统一调度器
                            // [v3.12] 立即持久化（原只改内存——刷新页面丢 v3.9 shift/回滚成果）
                            try {
                                const cSave = window.SillyTavern?.getContext?.();
                                if (cSave?.chat?.length) {
                                    this.engine.recordSaveSource('edit');
                                    // [v3.166] 事件回调里 save 的返回值此前被丢弃，现在按结果记账
                                    this.engine.storage.save(this.engine.getCurrentChatId(), this.engine.collectExport())
                                        .then((_ok) => this.engine.recordSaveFailed('edit', _ok === true, this.engine.storage?._lastWrite?.error || '未落盘'))
                                        .catch((e2) => { this.engine.recordSaveFailed('edit', false, String(e2?.message || e2)); errLog(e2, 'events.编辑即时存盘'); });
                                }
                            } catch (e) { errLog(e, 'events.编辑即时存盘'); }
                        } catch (err) { console.warn(`[${PLUGIN_NAME}] 编辑回滚失败:`, err); }
                    };
                                        // [v3.164] 收口到 bindEvent：7 个注册点此前各自直接 eventSource.on，绕过了
                    //   bindEvent 的就绪检查 / 事件计数 / 注册记录（控制平面成了装饰件）。
                    if (!this.bindEvent(eventSource, types.MESSAGE_EDITED, _h3)) {
                        console.warn(`[${PLUGIN_NAME}] 事件 MESSAGE_EDITED 注册失败（控制平面未就绪或 eventSource 异常）`);
                    }
                    // [v3.165] 台账登记已移入 bindEvent（登记与注册同处，避免失败也登记）
                }
                if (types.MESSAGE_SWIPED) {
                    const _h4 = (messageId) => {
                        // [v3.23.1] swipe 重roll后同步清空 dedup 指纹（防旧 swipe 文本残留误标新回复）
                        try { resetRecallDedup(); } catch (e) { errLog(e, 'events.MESSAGE_SWIPED去重清空'); }
                        try {
                            const f = Number(messageId);
                            if (Number.isFinite(f) && f >= 0) {
                                // [v2.9] RU-D: swipe 不清召回缓存（同楼重roll复用）；[v3.89] 起命中前经三元组定位符校验，翻变体自动失效
                                if (this.configMgr.config.debugMode) console.log(`[${PLUGIN_NAME}] 楼层 ${f} 滑动/重生成, 回滚该楼记忆`);
                                this.engine.rollbackFloor(f);
                                // [v3.8] swipe 自愈: 修「swipe 后该楼无记忆」缺口——防抖后重提取当前变体（编辑自愈同款）
                                this._scheduleFloorHeal(f);
                                // [v3.12] 立即持久化（刷新页面防丢）
                                try {
                                    const cSave = window.SillyTavern?.getContext?.();
                                    if (cSave?.chat?.length) {
                                        this.engine.recordSaveSource('swipe');
                                        // [v3.166] 结果驱动（同上）
                                        this.engine.storage.save(this.engine.getCurrentChatId(), this.engine.collectExport())
                                            .then((_ok) => this.engine.recordSaveFailed('swipe', _ok === true, this.engine.storage?._lastWrite?.error || '未落盘'))
                                            .catch((e2) => { this.engine.recordSaveFailed('swipe', false, String(e2?.message || e2)); errLog(e2, 'events.swipe即时存盘'); });
                                    }
                                } catch (e) { errLog(e, 'events.swipe即时存盘'); }
                            }
                        } catch (err) { errLog(err, 'nonfatal') }
                        // [v3.183] 分支守护：翻页到此楼，该楼归新页——记下三态待回滚，
                        //   此后该楼的落笔一律要过签名校验（防「摘要里躺着上一个分支的事实」）。
                        //   放在 `_scheduleFloorHeal` 之后：v380_swipe_heal 用固定 1200 字符窗口
                        //   断言「swipe 处理器接入了调度器」，插在它前面会把窗口挤走（假红）。
                        try {
                            const BG = _branchGuardLib();
                            if (BG && typeof BG.createGuard === 'function') {
                                if (!this.engine._branchGuard) this.engine._branchGuard = BG.createGuard();
                                const r = this.engine._branchGuard.prepareSwipe(Number(messageId), this.engine.getCurrentChatId?.() || '');
                                if (!r.prepared) {
                                    try { this.engine.opLog?.log?.('branch', 'swipe-skip', String(r.reason || ''), Number(messageId), ''); } catch (e) { errLog(e, 'events.MESSAGE_SWIPED分支审计'); }
                                }
                            }
                        } catch (e) { errLog(e, 'events.MESSAGE_SWIPED分支守护'); }
                    };
                                        // [v3.164] 收口到 bindEvent：7 个注册点此前各自直接 eventSource.on，绕过了
                    //   bindEvent 的就绪检查 / 事件计数 / 注册记录（控制平面成了装饰件）。
                    if (!this.bindEvent(eventSource, types.MESSAGE_SWIPED, _h4)) {
                        console.warn(`[${PLUGIN_NAME}] 事件 MESSAGE_SWIPED 注册失败（控制平面未就绪或 eventSource 异常）`);
                    }
                    // [v3.165] 台账登记已移入 bindEvent（登记与注册同处，避免失败也登记）
                }
// [v2.0] P2: 删楼回滚（楼层账本）
                if (types.MESSAGE_DELETED) {
                    const _h5 = async (messageId) => {
                        try { this.engine._recallCache = null; } catch (e) { errLog(e, 'events.MESSAGE_DELETED缓存清理'); }  // [v2.9] RU-D: 上下文变了，缓存失效
                        // [v3.109] 删楼同时清掉全部召回产物（历史结构变了，跨会话复用的依据不再成立）
                        try { this.engine._recallArtifacts = []; this.engine._recallArtifactEvictions = { byAge: 0, byCap: 0, lastFloor: null, lastRemoved: 0, lastAt: 0 }; } catch (e) { errLog(e, 'events.MESSAGE_DELETED产物清理'); }   // [v3.156] 淘汰账同清
                        // [v3.23.1] 删楼同步清空 dedup 指纹（防删楼后残留指纹误标后续召回）
                        try { resetRecallDedup(); } catch (e) { errLog(e, 'events.MESSAGE_DELETED去重清空'); }
                        // [v3.25.1] 删楼清空归档状态（楼层 index 前移，旧归档 index 语义失效）
                        try { this.engine._archivedFloorIds?.clear(); } catch (e) { errLog(e, 'events.MESSAGE_DELETED归档清空'); }
                        // [v3.1] SF2: 渲染切片保护（抄 stbme history-safety——删除 payload 不可靠，批量删除时警告）
                        try {
                            const c = window.SillyTavern?.getContext?.();
                            const chatLen = c?.chat?.length || 0;
                            if (this.engine._lastKnownChatLen && this.engine._lastKnownChatLen - chatLen > 5) {
                                console.warn(`[${PLUGIN_NAME}] 检测到批量删除(${this.engine._lastKnownChatLen}→${chatLen})，楼层账本回滚可能不完整，建议打开诊断面板核对`);
                                errLog(new Error(`批量删除 ${this.engine._lastKnownChatLen}→${chatLen}，回滚可能不完整`), 'SF2.批量删除警告');
                            }
                            this.engine._lastKnownChatLen = chatLen;
                        } catch (e) { errLog(e, 'SF2.渲染切片保护'); }
                        try {
                            const c = window.SillyTavern?.getContext?.();
                            // ST 删楼后 chat 已变化，直接尝试回滚该楼及其后的记忆
                            // [v3.224.0] O-2：修前 `Number(messageId)` + isFinite ——
                            //   `''` / `[]` / `'  '` 经 Number() 得 0 且有限，于是「宿主没给楼层」
                            //   会被读成「删了第 0 楼」，进而 rollbackFloor(0) + 整树前移。
                            const floor = numOr(messageId, null);
                            if (floor === null) return;
                            // [v3.235.0] R4-A：**破坏之前先算预告**（纯读）。预告留在
                            //   _lastRollbackPreview，诊断面把它与随后的实撤读数并列成对。
                            try { if (plugin.engine.config?.config?.rollbackPreviewEnabled === true) plugin.engine._lastRollbackPreview = plugin.engine.previewFloorRollback(floor); } catch (e) { errLog(e, 'SH.回滚预览'); }
                            plugin.engine.rollbackFloor(floor);
                            // [v3.9] 废除级联销毁：被删楼之后的记忆不再删除，改为楼层前移重定位（数据零丢失）
                            try { plugin.engine.shiftFloorsFrom?.(floor); } catch (e) { errLog(e, 'SH.删楼前移'); }
                            // [v3.3] 台账重放化：删除后全量对账
                            try { plugin.engine.reconcileItemOps?.(); } catch (e) { errLog(e, 'V33.删楼全量对账'); }
                            // [v3.12] 立即持久化（删楼+shift 成果防刷新丢失）
                            try {
                                const cidSave = plugin.engine.getCurrentChatId();
                                if (cidSave) {
                                    plugin.engine.recordSaveSource('delete');
                                    // [v3.166] 结果驱动（同上）
                                    const _ok = await plugin.engine.storage.save(cidSave, plugin.engine.collectExport());
                                    plugin.engine.recordSaveFailed('delete', _ok === true, plugin.engine.storage?._lastWrite?.error || '未落盘');
                                }
                            } catch (e) { errLog(e, 'events.删楼即时存盘'); }
                        } catch (err) {
                            if (plugin.engine.config.config.debugMode) console.error(`[${PLUGIN_NAME}] 删楼回滚失败:`, err);
                        }
                    };
                                        // [v3.164] 收口到 bindEvent：7 个注册点此前各自直接 eventSource.on，绕过了
                    //   bindEvent 的就绪检查 / 事件计数 / 注册记录（控制平面成了装饰件）。
                    if (!this.bindEvent(eventSource, types.MESSAGE_DELETED, _h5)) {
                        console.warn(`[${PLUGIN_NAME}] 事件 MESSAGE_DELETED 注册失败（控制平面未就绪或 eventSource 异常）`);
                    }
                    // [v3.165] 台账登记已移入 bindEvent（登记与注册同处，避免失败也登记）
                }
                // [v1.2] GENERATION_STARTED：生成前注入记忆（主注入路径）
                // [v3.12] GENERATION_ENDED 兜底: 用户 Esc 中止生成时 MESSAGE_RECEIVED 不触发，标志卡死 true → 自愈永久延后
                if (types.GENERATION_ENDED) {
                    const _h6 = () => {
                        try { this.engine._generationActive = false; } catch (e) { errLog(e, 'events.GENERATION_ENDED复位'); }
                        /* [v3.218.0] R2-E：结局标注。正常完成与用户中止在 ST 里**都走本事件**，
                         *   区分靠「MESSAGE_RECEIVED 是否来过」——`_injectionEnd` 内部只从 'pending'
                         *   迁出，已判定为 completed 的不会被这次 ENDED 改写成 aborted。
                         *   修前这里只复位标志 ⇒ 读数上中止与完成同形（处置相反却读成同一件事）。
                         *   与复位标志**互不依赖**（标注读的是读数，不读 `_generationActive`），
                         *   故放在其后 —— 影响面最小。 */
                        try { this.engine._injectionEnd('ended'); } catch (e) { errLog(e, 'events.GENERATION_ENDED结局'); }
                    };
                                        // [v3.164] 收口到 bindEvent：7 个注册点此前各自直接 eventSource.on，绕过了
                    //   bindEvent 的就绪检查 / 事件计数 / 注册记录（控制平面成了装饰件）。
                    if (!this.bindEvent(eventSource, types.GENERATION_ENDED, _h6)) {
                        console.warn(`[${PLUGIN_NAME}] 事件 GENERATION_ENDED 注册失败（控制平面未就绪或 eventSource 异常）`);
                    }
                    // [v3.165] 台账登记已移入 bindEvent（登记与注册同处，避免失败也登记）
                }
                if (types.GENERATION_STARTED) {
                    const _h7 = async () => {
                        // [v3.12] 代际标记: 并发两次 STARTED（快速连发）时，后到者递增代际；先到者的慢写最后检查代际避免覆盖新注入
                        const myGen = (this._genSeq = (this._genSeq || 0) + 1);
                        try {
                            // [v3.2] DF1: 引擎停用（总开关关，或提取+向量全关）时清空槽位并跳过——持久化槽位不清则旧注入残留
                            const _cfg = this.engine.config.config;
                            if (_cfg.enabled === false || (_cfg.extractionEnabled === false && _cfg.vectorEnabled === false)) {
                                clearInjectSlots();
                                return;
                            }
                            this.engine._generationActive = true;   // [v3.10] 标记生成中（自愈调度器读）
                            const injection = await this.engine.onBeforeGeneration();
                            // [v3.12] 代际检查: await 期间若已有更新的一次 STARTED（myGen 过期），放弃本次慢结果（防旧注入覆盖新注入）
                            if (myGen !== this._genSeq) {
                                console.log(`[${PLUGIN_NAME}] 注入代际过期，放弃本次结果`);
                                // [v3.215.0] R2-A：过期这件事**必须留读数**。
                                //   修前只打一行日志：读数上「过期被丢弃」与「从未跑过」同形，
                                //   而两者的处置相反（前者该重试，后者该等下一轮）。
                                //   ★ 刻意**不碰 `_lastInjection`**：迟到清理若回写读数，会把上一次
                                //     真注入的读数擦掉 —— 用一个看得见的错换一个看不见的错。
                                try { this.engine._injectionDiscardStale(myGen); }
                                catch (e) { errLog(e, 'GENERATION_STARTED.过期留痕'); }
                                return;
                            }
                            // [v3.2] DF6: 空召回=显式清除（baibai 语义"注入空串等于清除"——召回价值判断跳过时旧槽位残留会注入上一轮记忆）
                            // [v3.216.0] R2-B 读数落地点：必须在**代际确认之后**。
                            //   上面那个 `if (myGen !== this._genSeq) return;` 已经把过期代拦在外面，
                            //   所以能走到这里的必定是当下代。`_injectionCommit` 内部还有一道
                            //   代际核对（防守卫被绕过）：不符即不落地，由留痕口处置。
                            // [v3.217.0] R2-D：收尾改走 `_injectionClose`（提交 + 按需过期收尾的唯一入口），
                            //   与 interceptor 路径共用同一份语义 —— 两条路径各抄一遍就是「同一口径被抄 N 份」。
                            try { this.engine._injectionClose(myGen); }
                            catch (e) { errLog(e, 'GENERATION_STARTED.注入提交'); }
                            const depth = Math.min(2, Math.max(0, numOr(this.engine.config.config.injectionDepth, 0)));   // [v3.156] D0=0 合法
                            writeInjectSlot('lonsha_memory', injection || '', depth);
                            // [v3.2] DF6: 卷摘要槽独立刷新（与召回无关；空卷=清除旧卷）
                            try { writeInjectSlot('lonsha_memory_history', this.engine.buildVolumeInjection() || '', 9999); } catch (e) { errLog(e, 'DF6.卷摘要刷新'); }
                        } catch (err) {
                            console.error(`[${PLUGIN_NAME}] 生成前注入失败:`, err);
                        }
                    };
                                        // [v3.164] 收口到 bindEvent：7 个注册点此前各自直接 eventSource.on，绕过了
                    //   bindEvent 的就绪检查 / 事件计数 / 注册记录（控制平面成了装饰件）。
                    if (!this.bindEvent(eventSource, types.GENERATION_STARTED, _h7)) {
                        console.warn(`[${PLUGIN_NAME}] 事件 GENERATION_STARTED 注册失败（控制平面未就绪或 eventSource 异常）`);
                    }
                    // [v3.165] 台账登记已移入 bindEvent（登记与注册同处，避免失败也登记）
                }

                // [v3.165] 期望数由与注册点**相同的可见性条件**派生，不写死常量：
                //   宿主 event_types 缺项（不同 SillyTavern 版本）时，对应的条件注册点本就不执行；
                //   拿恒定的 7 去比会把「宿主能力缺失」误报成「接线不完整」—— 噪声告警的代价
                //   是真告警被忽略。MESSAGE_RECEIVED 是硬前提（缺失时上面已 return），故从 1 起算。
                let expectedEvents = 1;
                if (types.CHAT_CHANGED) expectedEvents++;
                if (types.MESSAGE_EDITED) expectedEvents++;
                if (types.MESSAGE_SWIPED) expectedEvents++;
                if (types.MESSAGE_DELETED) expectedEvents++;
                if (types.GENERATION_ENDED) expectedEvents++;
                if (types.GENERATION_STARTED) expectedEvents++;
                this._controlInfo.expected = expectedEvents;
                // [v3.165] 成功声明必须由**事实**驱动：此前这行无条件打印「已注册」，
                //   即便 7 个 bindEvent 全部返回 false（eventSource 异常 / 未就绪）也照样打印成功。
                //   日志与真实接线状态相反，比没有日志更坏 —— 它把排查方向指向
                //   「已注册但没触发」，而真因是「根本没注册」。
                const wired = this._controlInfo.events >= expectedEvents;
                console.log(`[${PLUGIN_NAME}] ${wired ? '✓ 事件监听已注册' : '⚠️ 事件监听注册不完整'}`
                    + `（${this._controlInfo.events}/${expectedEvents} 个：MESSAGE_RECEIVED`
                    + `${types.CHAT_CHANGED ? ' + CHAT_CHANGED' : ''}${types.GENERATION_STARTED ? ' + GENERATION_STARTED' : ''}）`);
                // [v3.165] 失败哨兵（v3.164 引入）：把失败状态留在台账里，由 selfCheck / 诊断面板
                //   暴露——「坏了有人知道吗」。本版把它从 try 外移进来，因为期望值要读 types。
                if (!wired) {
                    this._controlInfo.lastFailure = `期望注册 ${expectedEvents} 个事件监听，实际仅成功 ${this._controlInfo.events} 个`;
                    if (!this._controlInfo.failed.includes(this._controlInfo.lastFailure)) {
                        this._controlInfo.failed.push(this._controlInfo.lastFailure);
                    }
                    console.error(`[${PLUGIN_NAME}] ⚠️ 事件接线不完整：${this._controlInfo.lastFailure}（记忆提取可能不触发，请检查 eventSource/event_types）`);
                }
            } catch (err) {
                console.error(`[${PLUGIN_NAME}] 事件注册异常:`, err);
                // [v3.165] 异常也必须留痕：此前 catch 只打印一行错误，台账照旧是一片「正常」，
                //   selfCheck 的诊断行于是无话可说 —— 失败态只存在于控制台里，刷新即失。
                this._controlInfo.lastFailure = '注册过程抛异常：' + ((err && err.message) || String(err));
                if (!this._controlInfo.failed.includes(this._controlInfo.lastFailure)) {
                    this._controlInfo.failed.push(this._controlInfo.lastFailure);
                }
            }
        }
        // [v3.8] 统一楼层自愈调度器（编辑/swipe 共用）:
        //   防抖 3s 后对「待愈楼层集合」逐楼重提取（集合去重 + 连编多楼支持）
        _scheduleFloorHeal(f) {
            try {
                this._editHealPending = this._editHealPending || new Set();
                this._editHealPending.add(f);
                if (this._editHealTimer) clearTimeout(this._editHealTimer);
                this._editHealTimer = setTimeout(() => {
                    this._editHealTimer = null;
                    this._runFloorHeal();
                }, 3000);
            } catch (e) { errLog(e, 'events.楼层自愈计时'); }
        }
        // [v3.10] 自愈执行体：生成中延后重试（防与 onBeforeGeneration 召回并发读脏）；防重入（执行中再调度不叠加）
        async _runFloorHeal() {
            try {
                if (this._selfHealRunning) return;   // 防重入：上一轮未完成，本轮跳过（pending 已收集，下轮定时器会再跑）
                // [v3.10] 生成中（LLM 召回在飞）不重提取——楼层留在待愈集合，5s 后再试
                if (this.engine?._generationActive) {
                    if (this._editHealPending?.size) {
                        this._editHealTimer = setTimeout(() => { this._editHealTimer = null; this._runFloorHeal(); }, 5000);
                    }
                    return;
                }
                const pending = Array.from(this._editHealPending || []).sort((a, b) => a - b);
                this._editHealPending = new Set();
            this._selfHealRunning = false;             // [v3.10] 自愈执行防重入
                if (!pending.length) return;
                this._selfHealRunning = true;
                try {
                    for (const hf of pending) {
                        try {
                            const c = window.SillyTavern?.getContext?.();
                            const m = c?.chat?.[hf];
                            if (!m || m.is_user === true) continue;   // 用户楼不提取
                            if (this.engine.isOmittedFloor?.(m)) continue;
                            const text = String(m.mes || '').trim();
                            if (!text) continue;
                            console.log(`[${PLUGIN_NAME}] 楼层自愈: 重提取楼层 ${hf}`);
                            await this.engine.onMessageReceived({ ...m, index: hf }, hf);
                        } catch (e) { errLog(e, `events.楼层自愈重提取.${hf}`); }
                    }
                } finally { this._selfHealRunning = false; }
            } catch (e) { errLog(e, 'events.楼层自愈执行'); }
        }
        // 插件卸载时清理事件监听
        // [v3.91] 审计修复：原实现只存 {eventSource, type} 不存 handler 引用，而 SillyTavern eventSource
        //         的 removeListener/off 需要 handler 才能精确移除——原卸载路径实际无效（且不带 handler 调用
        //         有误删其他扩展同类型监听的风险）。改为保存 handler 引用并按引用移除。
        unregisterEvents() {
            if (this._controlInfo) this._controlInfo.unregisterAttempts++;   // [v3.164] 台账：回答「卸载路径可有消费者」
            if (!this.eventHandlers) return;
            let removed = 0;
            for (const rec of this.eventHandlers) {
                const { eventSource, type, handler } = rec || {};
                if (!eventSource || !type) continue;
                try {
                    if (handler && typeof eventSource.removeListener === 'function') { eventSource.removeListener(type, handler); removed++; continue; }
                    if (handler && typeof eventSource.off === 'function') { eventSource.off(type, handler); removed++; continue; }
                    // 无 handler 引用时不做无参移除（会误删他人监听），仅告警
                    console.warn(`[${PLUGIN_NAME}] 事件 ${type} 无 handler 引用，跳过卸载（防误删其他扩展监听）`);
                } catch (e) { errLog(e, 'events.unregisterEvents:' + type); }
            }
            if (this.config?.config?.debugMode) console.log(`[${PLUGIN_NAME}] 已卸载 ${removed}/${this.eventHandlers.length} 个事件监听`);
            this.eventHandlers = [];
        }
        createUI() {
            if (typeof document === 'undefined' || document.getElementById('lonsha-memory-fab')) return;
            const fab = document.createElement('div');
            fab.id = 'lonsha-memory-fab';
            fab.innerHTML = '<svg viewBox="0 0 24 24" class="ls-fab-icon"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5" fill="none" stroke-dasharray="3 2"/><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
            fab.setAttribute('title', 'LonSha 记忆引擎（按住可拖动，点击展开菜单）');

            const size = 52;
            const pad = 8;
            const vw = (typeof window !== 'undefined' && window.innerWidth) || (document.documentElement?.clientWidth || 360);
            const vh = (typeof window !== 'undefined' && window.innerHeight) || (document.documentElement?.clientHeight || 640);
            const posKey = 'lonsha_memory_fab_position';

            let savedPos = null;
            try {
                const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(posKey) : null;
                if (raw) savedPos = JSON.parse(raw);
            } catch (_e) {}

            let curLeft, curTop;
            if (savedPos && typeof savedPos.left === 'number' && typeof savedPos.top === 'number') {
                curLeft = Math.min(Math.max(pad, savedPos.left), Math.max(pad, vw - size - pad));
                curTop = Math.min(Math.max(pad, savedPos.top), Math.max(pad, vh - size - pad));
            } else {
                curLeft = Math.max(pad, vw - size - 20);
                // 默认位置避让：避开常见底部 80px 的其他项目悬浮球，默认错开至偏上位置
                curTop = Math.max(pad, vh - 148 - size);
            }

            fab.style.cssText = `position:fixed;left:${curLeft}px;top:${curTop}px;width:${size}px;height:${size}px;`
                + `background:var(--ls-bg-2,#161b22);backdrop-filter:var(--ls-blur,none);-webkit-backdrop-filter:var(--ls-blur,none);`
                + `color:var(--ls-accent,#58a6ff);border:1px solid var(--ls-line-strong,rgba(240,246,252,0.18));border-radius:50%;`
                + `display:flex;align-items:center;justify-content:center;font-size:24px;cursor:grab;`
                + `box-shadow:var(--ls-sh-2,0 8px 24px rgba(1,4,9,0.6));z-index:10000;`
                + `user-select:none;-webkit-user-select:none;touch-action:none;`
                + `transition:transform 0.2s,box-shadow 0.2s,border-color 0.2s;`;

            this._bindFabDrag(fab, posKey, size, pad);

            fab.addEventListener('click', (e) => {
                if (this._fabMoved) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                this.showPanel();
            });
            fab.addEventListener('mouseenter', () => { if (!this._fabDragging) fab.style.transform = 'scale(1.1) rotate(5deg)'; });
            fab.addEventListener('mouseleave', () => { if (!this._fabDragging) fab.style.transform = 'scale(1)'; });
            document.body.appendChild(fab);
        }

        _bindFabDrag(fab, posKey, size, pad) {
            let pointerId = null;
            let startX = 0, startY = 0;
            let startLeft = 0, startTop = 0;
            let moved = false;
            const DRAG_MIN = 6;

            const clamp = (left, top) => {
                const vw = (typeof window !== 'undefined' && window.innerWidth) || (document.documentElement?.clientWidth || 360);
                const vh = (typeof window !== 'undefined' && window.innerHeight) || (document.documentElement?.clientHeight || 640);
                return {
                    left: Math.min(Math.max(pad, left), Math.max(pad, vw - size - pad)),
                    top: Math.min(Math.max(pad, top), Math.max(pad, vh - size - pad))
                };
            };

            const onPointerDown = (e) => {
                if (e.button !== undefined && e.button !== 0) return;
                pointerId = e.pointerId;
                startX = e.clientX;
                startY = e.clientY;
                const rect = fab.getBoundingClientRect?.() || { left: parseFloat(fab.style.left) || 0, top: parseFloat(fab.style.top) || 0 };
                startLeft = rect.left;
                startTop = rect.top;
                moved = false;
                try { fab.setPointerCapture?.(pointerId); } catch (_e) {}
            };

            const onPointerMove = (e) => {
                if (pointerId === null || e.pointerId !== pointerId) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                if (!moved && (Math.abs(dx) > DRAG_MIN || Math.abs(dy) > DRAG_MIN)) {
                    moved = true;
                    this._fabDragging = true;
                    fab.style.cursor = 'grabbing';
                    fab.style.transition = 'none';
                }
                if (moved) {
                    const next = clamp(startLeft + dx, startTop + dy);
                    fab.style.left = `${next.left}px`;
                    fab.style.top = `${next.top}px`;
                    fab.style.right = 'auto';
                    fab.style.bottom = 'auto';
                }
            };

            const onPointerUp = (e) => {
                if (pointerId === null || e.pointerId !== pointerId) return;
                try { fab.releasePointerCapture?.(pointerId); } catch (_e) {}
                pointerId = null;
                fab.style.cursor = 'grab';
                fab.style.transition = 'transform 0.2s,box-shadow 0.2s,border-color 0.2s';

                if (moved) {
                    this._fabMoved = true;
                    const rect = fab.getBoundingClientRect?.() || { left: parseFloat(fab.style.left) || 0, top: parseFloat(fab.style.top) || 0 };
                    const next = clamp(rect.left, rect.top);
                    try {
                        if (typeof localStorage !== 'undefined') {
                            localStorage.setItem(posKey, JSON.stringify({ left: next.left, top: next.top }));
                        }
                    } catch (_e) {}
                    setTimeout(() => {
                        this._fabMoved = false;
                        this._fabDragging = false;
                    }, 80);
                } else {
                    this._fabDragging = false;
                }
            };

            if (typeof fab.addEventListener === 'function') {
                fab.addEventListener('pointerdown', onPointerDown);
                fab.addEventListener('pointermove', onPointerMove);
                fab.addEventListener('pointerup', onPointerUp);
                fab.addEventListener('pointercancel', onPointerUp);
            }

            if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
                window.addEventListener('resize', () => {
                    const rect = fab.getBoundingClientRect?.() || { left: parseFloat(fab.style.left) || 0, top: parseFloat(fab.style.top) || 0 };
                    const next = clamp(rect.left, rect.top);
                    fab.style.left = `${next.left}px`;
                    fab.style.top = `${next.top}px`;
                });
            }
        }
        showPanel() {
            // 设置面板模块 (settings-ui.js) 会覆盖 showFabMenu 提供完整菜单；
            // 此处为兜底：模块未加载时提示
            if (this.showFabMenu && this._settingsUIMounted) return this.showFabMenu();
            const stats = {nodes: this.engine.graph.nodes.size, edges: this.engine.graph.edges.size, vectors: this.engine.vector.vectors.length};
            alert(`LonSha记忆引擎 v${VERSION}\n\n图谱节点: ${stats.nodes} | 关系边: ${stats.edges} | 向量: ${stats.vectors}\n\n⚠️ 设置面板模块未加载（检查 settings-ui.js）\n🔧 调试: window.LonShaMemory`);
        }
    }
    
    // [v1.2 真机适配修复] 原实现是空占位 async chat => chat，记忆注入从不发生。
    // 保留 interceptor 作为兼容入口（部分 ST 版本通过 manifest generate_interceptor 调用），
    // 主注入路径改为 GENERATION_STARTED 事件 + setExtensionPrompt（ST 标准注入方式）。
    window.lonsha_memory_interceptor = async (chat, ...args) => {
        try {
            // [v3.2] DF1: 停用时不注入（与 GENERATION_STARTED 主路径同语义）
            const _cfgI = plugin.engine.config.config;
            if (_cfgI.enabled === false || (_cfgI.extractionEnabled === false && _cfgI.vectorEnabled === false)) return chat;
            /* [v3.217.0] R2-D：本路径与事件路径一样**自占一代**，并**自己收尾**。
             *   修前本路径调完 onBeforeGeneration 只写槽位、从不提交/丢弃 ⇒ 它的暂存永久悬空，
             *   成为「被别的代捡起」的现成供体（本文件注释原话：「部分 ST 版本通过
             *   manifest generate_interceptor 调用」—— 即该路径在真宿主上确实会被走到）。
             *   收尾走 `_injectionClose`（引擎侧唯一入口），不在这里重写「先提交、不成再丢弃」。 */
            const myGen = (plugin.engine._genSeq = (plugin.engine._genSeq || 0) + 1);
            const injection = await plugin.engine.onBeforeGeneration();
            try { plugin.engine._injectionClose(myGen); } catch (e) { errLog(e, 'DF5.interceptor注入收尾'); }
            // [v3.2] DF6: 空召回=显式清除；卷摘要独立刷新
            const okInj = writeInjectSlot('lonsha_memory', injection || '', Math.min(2, Math.max(0, numOr(plugin.engine.config.config.injectionDepth, 0))));   // [v3.156] D0=0 合法
            if (okInj) {
                try { writeInjectSlot('lonsha_memory_history', plugin.engine.buildVolumeInjection() || '', 9999); } catch (e) { errLog(e, 'DF6.interceptor卷摘要'); }
            } else if (injection && Array.isArray(chat) && chat.length > 0 && chat[0]) {
                // 降级：注入到 system 消息尾部（仅通道不可用且有内容时）
                chat[0].mes = (chat[0].mes || '') + injection;
            }
        } catch (err) {
            console.error(`[${PLUGIN_NAME}] 记忆注入失败:`, err);
        }
        return chat;
    };
    const plugin = new LonShaMemoryPlugin();
    plugin.sanitizeJson = sanitizeJson;
    plugin.safeJsonParse = safeJsonParse;
    plugin.VERSION = VERSION;   // [v3.77] A: 版本真值暴露（settings-ui 原硬编码 '1.3.0' 假版本）
    plugin.init().catch(err => console.error(`[${PLUGIN_NAME}] 初始化失败:`, err));
    window.LonShaMemory = plugin;
    /**
     * [v3.214.0] R1-F：受控写入面的**恒定回执**（唯一构造点）。
     *   下游按 shape 编程（先看 `ok`，再按 `reason` 分诊）。若某个分支少写三个键，
     *   那份回执就与其它回执**形状不同** ——「字段缺失」于是再次与「字段是空」同形
     *   （本仓九账证据面刚治理过的正是这一形态）。故所有分支一律经此构造。
     *   9 个键一个不少，失败分支与成功分支同形，只有「没给」才取默认值。
     */
    function repairReceipt(extra) {
        const e = extra || {};
        /* [v3.295.0 · X2] 回执从 **9 键扩到 13 键**。为什么不是「只给 applyPlan 加三个键」：
         *   v3215 的 `assertReceiptShape` 钉的是「**同一命名空间内所有方法**回执键集逐字相同」，
         *   它的本意是「失败分支与成功分支不同形」——只给新方法加键，会让命名空间里出现
         *   两种形状，那正是该判据要防的。故新读数一律**全体方法都有**，恒定给默认值：
         *     · applied  —— 落笔改到的项数（其余方法恒 0）；
         *     · verified —— 原数据核验通过的项数（其余方法恒 0）；
         *     · readback —— 持久化回读的结论：true / false / **null**（没尝试）。
         *                  三态而非布尔：「没尝试」与「试了失败」不同形（本仓同族纪律）。
         *     · items    —— 逐项结局（落笔才有内容；其余方法恒空数组，**不是 undefined**）。 */
        return {
            ok: !!e.ok,
            reason: e.reason || '',
            repairId: e.repairId != null ? e.repairId : null,
            action: e.action || '',
            affected: Array.isArray(e.affected) ? e.affected : [],
            total: Number.isFinite(e.total) ? e.total : 0,
            revision: Number.isFinite(e.revision) ? e.revision : 0,
            replayed: !!e.replayed,
            applied: Number.isFinite(e.applied) ? e.applied : 0,
            verified: Number.isFinite(e.verified) ? e.verified : 0,
            readback: (e.readback === true) ? true : (e.readback === false ? false : null),
            items: Array.isArray(e.items) ? e.items : [],
            at: Date.now(),
        };
    }
    /**
     * [v3.214.0] R1-F：修订读数的**唯一取值口**（`engine.repairRevision()` 的薄包装）。
     *   刻意不在写入面里用 `this.revision()`：调用方一旦把方法摘下来单用
     *   （`const f = bridge.repair.apply`），`this` 就不是桥了，那一下会**抛出**，
     *   而抛出的表现是「写入失败」——没人会想到根因是方法被摘下来了。
     */
    function repairRevisionOf() {
        try {
            const eng = plugin.engine;
            if (!eng || typeof eng.repairRevision !== 'function') return 0;
            return Number(eng.repairRevision()) || 0;
        } catch (e) { return 0; }
    }
    /**
     * [v3.215.0] R2-A：块引用键的**转发口**（桥侧）。
     *   与 `repairRevisionOf` 同一个理由：调用方一旦把方法摘下来单用
     *   （`const f = bridge.injectionRefOf`），`this` 就不是桥了。故薄包装转发到引擎。
     *   引用键本身由引擎 `_injectionRefOf` 定义（含轮次，本轮内唯一）——
     *   下游用 `injectionRefOf(engine, i)` 取的键，必须与
     *   `snapshot.injection.blocks[].ref` 逐字相同，否则「点一条块 → 跳到位」会错位。
     */
    function injectionRefOf(engine, i) {
        try {
            const eng = engine || plugin.engine;
            if (!eng || typeof eng._injectionRefOf !== 'function') return '';
            return String(eng._injectionRefOf(i));
        } catch (e) { return ''; }
    }
    // [v3.88] 公开快照桥：外部脚本经 window.lonsha_memory_bridge_v1.snapshot 读取最近一次生成时的状态快照。
    // 只读契约——`version` / `bridge` / `snapshot` / `sourceState` / `lastError` / `refresh()` 这一组**只读**，
    //   本对象不在其内提供任何写入引擎的方法；快照仅由引擎在生成管线内 refresh。
    // [v3.214.0] R1-F 起，本桥**分两面**：
    //   · 只读面（上面那一组，契约不变、逐字未动）；
    //   · 受控写入面 —— 只收在**唯一命名空间** `repair` 之下（预览 / 落账 / 落定 / 放弃），
    //     且写入必须过「幂等键必填 + 预览修订必须对表」两道门。
    //     为什么不肯塞进顶层（如 `bridge.requestRepair`）：那会让「读一份快照」与「改一本账」
    //     共用同一个扁平命名空间，调用方从名字上分不出哪一下有副作用 —— 本仓治理过多轮的
    //     「同一形状两个相反读数」，在**接口面**上就是这个样子。
    //     仓库内既有的只读键面判据（tests/v388_bridge.test.mjs）已同步**收窄**为
    //     「除 `repair` 外，顶层零写语义键」，不是被放宽，而是被指向唯一写命名空间。
    window.lonsha_memory_bridge_v1 = {
        version: 1,
        bridge: 'lonsha_memory_bridge_v1',
        snapshot: null,
        // [v3.174] 桥的读者契约面 A：**来源可见性**。此前读者分不清三种处境：
        //   「桥没挂载」（window 上取不到对象）／「桥在、引擎还没 init 完」（snapshot 恒 null）／
        //   「取快照时抛错」（旧实现 catch 里把错误**吞掉**，只留 snapshot=null）。
        //   后两者在宿主侧完全同形：一个 null，没有任何可归因的痕迹。
        //   现在来源是一台显式状态机，且**错误不吞**（留给 lastError）：
        //     'idle'          —— 尚未 refresh 过
        //     'ready'         —— 引擎在位且取到了快照
        //     'engine-absent' —— 引擎未就位（插件未 init / 引擎未构造）
        //     'engine-empty'  —— 引擎在位但明确返回空（与「引擎不在位」不是同一件事）
        //     'thrown'        —— 取快照抛错（lastError 给出原因）
        sourceState: 'idle',
        lastError: null,
        /**
         * [v3.215.0] R2-A：块引用键的取值口（只读）。
         *   下游拿到 `snapshot.injection.blocks[].ref` 后要能**自行复算**同一个键
         *   （例如列表刷新后重新定位到某一块）。键的真源在引擎 `_injectionRefOf`，
         *   这里只转发 —— 两处各写一套格式就会「点一条块、跳到另一块」。
         */
        injectionRefOf(i) { return injectionRefOf(plugin.engine, i); },
        refresh() {
            try {
                const eng = plugin.engine;
                if (!eng || typeof eng.buildBridgeSnapshot !== 'function') {
                    this.sourceState = 'engine-absent'; this.lastError = null; this.snapshot = null;
                    return null;
                }
                const snap = eng.buildBridgeSnapshot();
                if (!snap) {
                    this.sourceState = 'engine-empty'; this.lastError = null; this.snapshot = null;
                    return null;
                }
                this.sourceState = 'ready'; this.lastError = null; this.snapshot = snap;
                return snap;
            } catch (e) {
                this.sourceState = 'thrown';
                this.lastError = String((e && e.message) || e);
                this.snapshot = null;
                return null;
            }
        },
        /**
         * [v3.214.0] R1-F：**受控写入面**（预览 / 落账 / 落定 / 放弃）。
         *
         * 【为什么需要它 / 修前实测后果】
         *   修复闭环（`repair-loop.js`）在 v3.194 就实现了三类动作与四条终态，但**全库零真实
         *   调用点**：产品代码没有一处调 `requestRepair`，桥也**没有任何写入口**。于是
         *   「撤销一条错误事实」——本仓治理过多轮的「源头改了、下游没跟着改」的唯一收口——
         *   在用户面前根本不存在入口；而下游（手机端）即使想发起也无路可走。
         *   补上入口时最危险的不是「写不进去」，而是**写进去了却看不出写的是什么**：
         *   重放与真写同形、修订错位后照写、缺幂等键照写。故本面按「受控」二字收三道口。
         *
         * 【契约（四个方法，回执形状恒定，全部不抛）】
         *   · `preview(input)`  —— 只读预览，走 engine.previewRepair（**不碰状态**）；
         *      `ok:false, reason:'module-unavailable'` 表示修复模块没挂 —— 不得伪装成「没有受影响项」。
         *   · `apply(input)`    —— 落账。**两道门，任一不过即拒且不改账**：
         *       ① `idempotencyKey` 必填，缺即 `'missing-idempotency-key'`。
         *          为什么必填：`dedupeKey` 缺省时 `request()` 不做任何判重（旧行为，刻意为兼容保留），
         *          于是下游一次重试就多一条账 —— 写入口必须比内部 API 严一档。
         *       ② `expectRevision` 必填且必须**等于**当下修订号（`engine.repairRevision()`），
         *          不等即 `'revision-mismatch'`。为什么要这样对表：回滚 / 恢复 / 切聊都会推进
         *          变更栅栏号，此刻手上算好的 affected 清单来自**旧代数**——照写就是往新会话里
         *          塞一条按旧状态算出来的修复。宁可拒，不可错位写入。
         *   · `settle(input)`   —— 逐项落定（done / failed / missing）。
         *   · `abandon(input)`  —— 放弃。
         *   回执 13 键恒定：{ok, reason, repairId, action, affected, total, revision, replayed,
         *     applied, verified, readback, items, at}——后四项对 `apply` 恒为 0/0/null/[]，
         *   它们描述的是「落笔」这件事，而 `apply` 只登记台账（落笔在 `applyPlan`）。
         *   `revision` 一律回**写后**修订号（被拒时即写前当下值）。
         * 【边界】本面**不自动改派生件**：回执只说「账上落定了什么」，不推断剧情已经发生
         *   （改哪一处是产品决定，自动改会累积幻觉删改 —— repair-loop 原注释已立）。
         */
        repair: {
            preview(input) {
                try {
                    const eng = plugin.engine;
                    if (!eng || typeof eng.previewRepair !== 'function') {
                        return repairReceipt({ ok: false, reason: 'engine-absent', revision: repairRevisionOf() });
                    }
                    const r = eng.previewRepair(input) || {};
                    if (!r.ok) return repairReceipt({ ok: false, reason: r.reason || 'rejected', action: r.action, revision: repairRevisionOf() });
                    return repairReceipt({
                        ok: true, action: r.action, affected: r.affected, total: r.total,
                        revision: repairRevisionOf()
                    });
                } catch (e) { return repairReceipt({ ok: false, reason: 'thrown', revision: repairRevisionOf() }); }
            },
            /**
             * [v3.295.0 · X2] **逐项修改方案**（只读；计划原文的「逐项确认修改方案」那一步）。
             *   与 `preview` 的分工：`preview` 回答「会牵连哪些派生件」，
             *   `plan` 回答「每一项该怎么改、谁来改、能不能撤、改完拿什么证明」。
             *   两者共用 `RL.affectedBy`，故 affected 逐条一致（不会出现「预览通过、方案没这项」）。
             *   纯读：不碰账、不碰数据，也不接受 `expectRevision`（读不需要对表）。
             */
            plan(input) {
                try {
                    const eng = plugin.engine;
                    if (!eng || typeof eng.previewRepair !== 'function') {
                        return repairReceipt({ ok: false, reason: 'engine-absent', revision: repairRevisionOf() });
                    }
                    const RL = _repairLoopLib();
                    if (!RL || typeof RL.plan !== 'function') {
                        return repairReceipt({ ok: false, reason: 'module-unavailable', revision: repairRevisionOf() });
                    }
                    /* 池由宿主现收（同一份 `_repairPool()`）：方案与预览必须看同一片世界，
                     *   否则「预览 3 条、方案 5 条」而两处都对——这正是本仓治理过的漂移形态。 */
                    const pool = (typeof eng._repairPoolFor === 'function') ? eng._repairPoolFor(input)
                        : ((typeof eng._repairPool === 'function') ? eng._repairPool() : undefined);
                    const r = RL.plan(Object.assign({}, input, { pool: pool })) || {};
                    if (!r.ok) return repairReceipt({ ok: false, reason: r.reason || 'rejected', revision: repairRevisionOf() });
                    return repairReceipt({
                        ok: true, action: r.action, affected: r.steps, total: r.total,
                        revision: repairRevisionOf()
                    });
                } catch (e) { return repairReceipt({ ok: false, reason: 'thrown', revision: repairRevisionOf() }); }
            },
            /**
             * [v3.295.0 · X2] **真落笔**（原 owner 执行 → 保存并回读 → settle 三步的入口）。
             *
             * 【与 `apply` 的分工（两者都是写，但写的**东西**不同）】
             *   `apply`     —— 写**台账**：登记一次修复请求（算影响面 + 立项）。它不改任何派生件。
             *   `applyPlan` —— 写**数据**：按已登记的那条修复，逐项改六类派生件、核原数据、
             *                  落盘回读，然后带证据 settle。计划里那句「仅登记不能显示『事实已纠正』」
             *                  说的就是：只做 `apply` 的那一步，账上写着「修复中」而界面上
             *                  已经能显示「已纠正」——两者之间原本没有任何数据被证明改过。
             *
             * 【两道门与 `apply` 完全同规格】（同一命名空间内的两个写动作，门必须一致，
             *   否则调用方会以为「apply 严、applyPlan 松」而把重试放在松的那一边）
             *   ① `idempotencyKey` 必填：本面**本身是重放安全**的（同一项改两次结果相同、
             *      settle 有幂等），但**重放安全不等于可以无声重放**——回执里的 applied 计数
             *      会让「第二次什么都没发生」看起来像「又落了一遍」。键必填就是为此。
             *      本面不往 `dedupeKey` 里塞（那是**登记**的判重键，塞进来会改掉 apply 的语义）。
             *   ② `expectRevision` 必填且必须等于当下修订号：方案里的 key 来自**旧代数**的池，
             *      切聊/回滚后照落就是往新会话里塞一批按旧状态算出来的修改。
             * @returns {Promise<object>} 回执 13 键恒定；其中 `applied/verified/readback/items`
             *   是本次落笔的读数（其余方法的同名键恒为 0/0/null/[]）
             */
            async applyPlan(input) {
                const i = input || {};
                const nowRev = repairRevisionOf();
                if (!String(i.idempotencyKey == null ? '' : i.idempotencyKey).trim()) {
                    return repairReceipt({ ok: false, reason: 'missing-idempotency-key', revision: nowRev });
                }
                if (i.expectRevision == null) {
                    return repairReceipt({ ok: false, reason: 'revision-mismatch', revision: nowRev });
                }
                if (Number(i.expectRevision) !== nowRev) {
                    return repairReceipt({ ok: false, reason: 'revision-mismatch', revision: nowRev });
                }
                try {
                    const eng = plugin.engine;
                    if (!eng || typeof eng.applyRepairPlan !== 'function') {
                        return repairReceipt({ ok: false, reason: 'engine-absent', revision: nowRev });
                    }
                    const r = (await eng.applyRepairPlan(i)) || {};
                    const rec = (function () {
                        try {
                            const RL = _repairLoopLib();
                            const st = RL && RL.normalize ? RL.normalize(eng._repairState) : null;
                            return (st && st.repairs || []).find(function (x) { return x.id === String(i.id || ''); }) || null;
                        } catch (e) { return null; }
                    })();
                    return repairReceipt({
                        ok: r.ok === true, reason: r.reason || (r.ok === true ? '' : 'rejected'),
                        repairId: r.id, action: rec ? rec.action : undefined,
                        affected: rec ? rec.affected : undefined,
                        total: rec && Array.isArray(rec.affected) ? rec.affected.length : 0,
                        revision: repairRevisionOf(),
                        /* 落笔独有的三态读数：落了几项 / 核到原数据几项 / 回读是否证明。 */
                        applied: Number(r.applied) || 0,
                        verified: Number(r.verified) || 0,
                        readback: (r.readback === true) ? true : (r.readback === false ? false : null),
                        items: r.items || [],
                    });
                } catch (e) { return repairReceipt({ ok: false, reason: 'thrown', revision: repairRevisionOf() }); }
            },
            apply(input) {
                const i = input || {};
                const nowRev = repairRevisionOf();
                // 门①：幂等键必填（空串 / 缺省都算没给）
                if (!String(i.idempotencyKey == null ? '' : i.idempotencyKey).trim()) {
                    return repairReceipt({ ok: false, reason: 'missing-idempotency-key', revision: nowRev });
                }
                // 门②：预览修订必须对表（`expectRevision` 未给 ⇒ 不该被当成 0 而"恰好"通过）
                if (i.expectRevision == null) {
                    return repairReceipt({ ok: false, reason: 'revision-mismatch', revision: nowRev });
                }
                if (Number(i.expectRevision) !== nowRev) {
                    return repairReceipt({ ok: false, reason: 'revision-mismatch', revision: nowRev });
                }
                try {
                    const eng = plugin.engine;
                    if (!eng || typeof eng.requestRepair !== 'function') {
                        return repairReceipt({ ok: false, reason: 'engine-absent', revision: nowRev });
                    }
                    const r = eng.requestRepair(Object.assign({}, i, { dedupeKey: String(i.idempotencyKey).trim() })) || {};
                    if (!r.ok) return repairReceipt({ ok: false, reason: r.reason || 'rejected', revision: repairRevisionOf() });
                    return repairReceipt({
                        ok: true, repairId: r.repair && r.repair.id, action: r.repair && r.repair.action,
                        affected: r.affected, total: r.total,
                        replayed: !!r.replayed, revision: repairRevisionOf()
                    });
                } catch (e) { return repairReceipt({ ok: false, reason: 'thrown', revision: repairRevisionOf() }); }
            },
            settle(input) {
                const i = input || {};
                // [v3.214.0] 逆向审计补口：`settle` / `abandon` 同样是**写动作**，一样要过修订门。
                //   为什么不能只给 apply 加：记录 id 是**每条 state 自己的 seq**（`rp_1`），
                //   切聊 / 回滚后新会话的 `rp_1` 与旧会话的 `rp_1` 同号——一条陈旧 settle 会落到
                //   新会话那条同号记录上，把它标成 done。表现是「落定成功了」，但落定的是别人的修复。
                //   这类错位与「正文改了、下游没跟着改」同源，宁可拒，不可错位写入。
                const nowRev = repairRevisionOf();
                if (i.expectRevision == null || Number(i.expectRevision) !== nowRev) {
                    return repairReceipt({ ok: false, reason: 'revision-mismatch', revision: nowRev });
                }
                try {
                    const eng = plugin.engine;
                    if (!eng || typeof eng.settleRepair !== 'function') {
                        return repairReceipt({ ok: false, reason: 'engine-absent', revision: nowRev });
                    }
                    const r = eng.settleRepair(i) || {};
                    if (!r.ok) return repairReceipt({ ok: false, reason: r.reason || 'rejected', revision: repairRevisionOf() });
                    return repairReceipt({
                        ok: true, repairId: r.repair && r.repair.id, action: r.repair && r.repair.action,
                        // total 一律 = 本条修复的受影响派生件**总数**（与 preview/apply 同一语义）；
                        //   「还剩几项未落定」是另一个读数，不挤进同一个键——同名两义正是本仓反复治理的塌陷。
                        total: (r.repair && Array.isArray(r.repair.affected)) ? r.repair.affected.length : 0,
                        replayed: !!r.replayed, revision: repairRevisionOf()
                    });
                } catch (e) { return repairReceipt({ ok: false, reason: 'thrown', revision: repairRevisionOf() }); }
            },
            abandon(input) {
                const i = input || {};
                // 同 settle：放弃也是写（会把剩余 pending 一并标 missing），同样过修订门。
                const nowRev = repairRevisionOf();
                if (i.expectRevision == null || Number(i.expectRevision) !== nowRev) {
                    return repairReceipt({ ok: false, reason: 'revision-mismatch', revision: nowRev });
                }
                try {
                    const eng = plugin.engine;
                    if (!eng || typeof eng.abandonRepair !== 'function') {
                        return repairReceipt({ ok: false, reason: 'engine-absent', revision: nowRev });
                    }
                    const r = eng.abandonRepair(i) || {};
                    if (!r.ok) return repairReceipt({ ok: false, reason: r.reason || 'rejected', revision: repairRevisionOf() });
                    return repairReceipt({
                        ok: true, repairId: r.repair && r.repair.id, action: r.repair && r.repair.action,
                        replayed: !!r.replayed, revision: repairRevisionOf()
                    });
                } catch (e) { return repairReceipt({ ok: false, reason: 'thrown', revision: repairRevisionOf() }); }
            }
        }
    };
    function opLogStatsCompat(engine) {
        // [v3.169] 账本自述面：旧实现把「没有账本」「stats 缺失」与「统计抛错」三种处境
        //   一律返回 {total:0, byType:{}}——与「真的 0 条事件」完全同形。读者拿到的那个 0
        //   可能来自三种完全不同的处境，而它看起来一模一样：这是「静默降级」在读取侧的形态。
        //   「有无读取接口」与「读得出来吗」是两件事，故分两态：
        //     absent —— 账本对象或其 stats 接口不存在（从读取方看就是没有账本）
        //     error  —— 接口在但要不出结果（抛错）
        const readable = !!engine?.opLog && typeof engine.opLog.stats === 'function';
        if (!readable) return { total: 0, byType: {}, absent: true };
        try {
            const st = engine.opLog.stats();
            if (!st || typeof st !== 'object') return { total: 0, byType: {}, absent: true };
            return st;
        } catch (e) { return { total: 0, byType: {}, error: String(e?.message || e) }; }
    }



})();