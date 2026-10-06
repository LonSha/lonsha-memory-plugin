(function() {
    'use strict';
    const PLUGIN_NAME = 'LonSha记忆引擎';
    const VERSION = '3.284.0';
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
        'ledger',             // 楼层账本：索引「该楼提取了什么」，新对话楼层重来
        'echo',               // 回响池：life 计数是会话内衰减器，跨对话不应延续衰减
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
        /* ── EntityLexicon ── */
        normalizeText() { return ''; }
        match() { return []; }
        resolve() { return null; }
        promptRules() { return ''; }
        /* ── WorldProgress ── */
        addPromise() { return null; }
        checkPromises() { return 0; }
        fulfillPromise() { return false; }
        resolvePromise() { return false; }
        markUnaware() { return false; }
        revealKnowledge() { return false; }
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
        batch: 60            // 单批入账上限（防一次提取灌入数百条撑爆真源）
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
            this.supersede = new (window.LonShaSupersede?.SupersedeManager || function() {
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
            this.cse = new (window.LonShaCSE?.CSEngine || function() {
                return { set(){return null}, addFromExtracted(){return 0}, confirm(){return false}, get(){return []}, getToward(){return []}, toPrompt(){return ''}, shiftFloors(){return 0}, removeByFloor(){return 0}, removeChar(){return false}, export(){return {chars:{}}}, import(){} };
            })();
            this.outline = _newNarrativeGenerator('OutlineDirector');
            // [v3.95] 叙事心电图（完全原创·LonSha 独有，window.LonShaNarrativePulse，降级为空实现）
            this.pulse = new (window.LonShaNarrativePulse?.NarrativePulse || function() {
                return { beat(){return null}, diagnose(){return {status:'flow',advice:'',streakHigh:0,streakLow:0,avgTension:0,avgPolarity:0}}, getArc(){return null}, toPrompt(){return ''}, shiftFloors(){return 0}, removeByFloor(){return 0}, export(){return {beats:[],arcs:{}}}, import(){} };
            })();
            this.pairMem = _newMemoryLedger('PairMemory');
            this.opLog = _newMemoryAux('OpLog');  // [v3.54] 事件溯源日志
            // [v3.96] 缝合四模块实例化（降级为空实现，缺 window 全局时不影响主链路）
            // ① 前置 AI 精选（ai-select.js）：候选语义精选，注入 llm.callAPI 走独立API+宿主双通道
            this.aiSelect = new (window.LonShaAISelect?.AISelect || function() {
                return { async route(c){ return { selected: (c||[]), source: 'local-noai', candidates: (c||[]).length, aiRaw: null }; }, lastTrace: null };
            })({
                callAI: async (prompt) => { try { return await this.llm.callAPI(prompt); } catch (e) { return null; } },
                maxCandidates: this.config.config.aiSelectMaxCandidates || 20,
                maxSelect: this.config.config.aiSelectMaxSelect || 6
            });
            // ② STM/LTM 游标巩固（stm-ltm.js）：纯函数引擎，state 持久化到 chatMetadata
            this.stmLtm = window.LonShaStmLtm || null;
            // ③ 统一召回管线（unified-recall.js）：图谱节点候选化
            this.unifiedRecall = window.LonShaUnifiedRecall || null;
            // ④ 副API通道表（api-channels.js）：任务路由
            this.apiChannels = window.LonShaApiChannels || null;
        }

        // [v3.147] API 凭据 401/403 冷却管控（Engine 代理入口）
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
            // 落盘（复用主持久化通道）
            try {
                if (r.consolidated > 0) {
                    this.recordSaveSource('stmLtm');
                    // [v3.166] 按结果记账：save 返回 false（防护拒绝 / 无落盘目标）时不得计为已保存
                    const _ok = await this.storage.save(this.getCurrentChatId(), this.collectExport());
                    this.recordSaveFailed('stmLtm', _ok === true, this.storage?._lastWrite?.error || '未落盘');
                }
            } catch (e) { errLog(e, 'stmLtm.save'); }
            if (this.config.config.debugMode && r.consolidated > 0) console.log(`[${PLUGIN_NAME}] STM巩固: ${r.consolidated}片段→stm (usedAI=${r.usedAI})`);
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
        _floorLedgerLine() {
            try {
                const L = _moduleLib(() => window.LonShaFloorLedger, 'floor-ledger.js');
                if (!L) return '模块未加载（floor-ledger.js）';
                const c = this._floorLedgerCoverage();
                if (!c || c.enabled !== true) return '不可用 · ' + String((c && c.reason) || 'unknown');
                const last = this._floorLedgerStamp ? ` · 最近落笔 ${this._floorLedgerStamp.status}${this._floorLedgerStamp.reason ? '(' + this._floorLedgerStamp.reason + ')' : ''}` : '';
                if (c.complete) return `${c.stamped}/${c.total} 楼已落笔（无缺口）` + last;
                const why = Object.keys(c.byWhy || {}).map(k => `${k}×${c.byWhy[k]}`).join(' ');
                const head = c.missing.slice(0, 6).join(',');
                return `${c.stamped}/${c.total} 楼已落笔 · 缺 ${c.missing.length}（第${head}${c.missing.length > 6 ? '…' : ''}楼）${why ? ' · ' + why : ''}` + last;
            } catch (e) { errLog(e, 'engine._floorLedgerLine'); return '—（诊断异常）'; }
        }
        /**
         * [v3.183] 摘要来源溯源体检读数（诊断面用；纯读、不抛、不入快照存盘）。
         * 与 _floorLedgerLine 同族：一句话回答「摘要来源现在有多少对不上、分别为什么」。
         * 六态里 **no_provenance 单独报**——它是旧档（升级前落的摘要本来就没来源字段），
         * 不是失效；把它和 source_changed 混成一句「N 条无效」就是升级即清空存量。
         */
        _summaryProvenanceLine() {
            try {
                const PV = _summaryProvenanceLib();
                if (!PV || typeof PV.line !== 'function') return '模块未加载（summary-provenance.js）';
                const chat = (window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext() || {}).chat || [];
                const sums = (this.summary && typeof this.summary.getActiveSummaries === 'function')
                    ? this.summary.getActiveSummaries() : [];
                const body = PV.line(sums, chat);
                const last = this._summaryProvenanceStamp
                    ? ` · 最近留证 ${this._summaryProvenanceStamp.status}${this._summaryProvenanceStamp.reason ? '(' + this._summaryProvenanceStamp.reason + ')' : ''}`
                    : '';
                // [v3.183] 召回侧过滤读数：判不了而放行的条数必须一并报出——
                // 否则「本轮过滤掉 N 条」与「本轮什么都没判」在读数上同形（I6）。
                const fl = this._provRecallFilter;
                const filt = (fl && fl.rounds)
                    ? ` · 召回过滤 ${fl.dropped}/${fl.checked}（放行 判不了${fl.keptLegacy} 缺源${fl.keptMissing} 正文改${fl.keptDrift}${fl.moduleMissing ? ' · 模块缺席' + fl.moduleMissing : ''}）`
                    : '';
                return body + last + filt;
            } catch (e) { errLog(e, 'engine._summaryProvenanceLine'); return '—（诊断异常）'; }
        }
        /**
         * [v3.183] 分支守护读数（诊断面用；纯读、不抛）。
         * 回答「此刻有几楼待回滚、最近有没有被拦」——被拦是**正常**的（说明保护生效），
         * 真正要警惕的是 pending 长期不清（翻页后没人来认领）。
         */
        _branchGuardLine() {
            try {
                if (!this._branchGuard) return '分支守护未启用（尚无翻页/重生成）';
                const body = this._branchGuard.line();
                const last = this._branchGuardLast
                    ? ` · 最近拦截 ${this._branchGuardLast.reason}（第${this._branchGuardLast.floor}楼）`
                    : '';
                return body + last;
            } catch (e) { errLog(e, 'engine._branchGuardLine'); return '—（诊断异常）'; }
        }
        /**
         * [v3.183] 条目关联读数（诊断面用；纯读、不抛）。
         * 与 _branchGuardLine / _summaryProvenanceLine 同族：一句话说清关联词表规模与最近一次扫描结果。
         */
        _crosslinkLine() {
            try {
                if (!this._crosslinkIndex || typeof this._crosslinkIndex.line !== 'function') return '关联未启用（尚无摘要落笔）';
                const body = this._crosslinkIndex.line();
                const last = this._crosslinkLast
                    ? ` · 最近第${this._crosslinkLast.floor}楼${this._crosslinkLast.linked.length}条候选${this._crosslinkLast.truncated ? '(已截断)' : ''}`
                    : '';
                return body + last;
            } catch (e) { errLog(e, 'engine._crosslinkLine'); return '—（诊断异常）'; }
        }
        /**
         * [v3.185] 条目关联的消费判定（纯读、不抛）：从「已确认过的关系」里挑出一条本轮正文显式支持的。
         * 为什么只挑带 disclosure 的边：本仓里只有这类边是「作者写过触发条件的关系」——
         *   最可能真的被剧情用上的那一批；再用「两端点名同时出现在本楼正文」做一次收口，
         *   避免把无关关系每轮提给模型。返回 null = 本轮没有可提项（正常态，不等于失效）。
         */
        _crosslinkConsumePair(text) {
            try {
                const g = this.graph;
                const t = String(text || '');
                if (!g || !g.edges || !t) return null;
                for (const e of g.edges.values()) {
                    if (!e || e.active === false) continue;
                    if (!e.data || !e.data.disclosure) continue;          // 只提「确认过且写过触发条件」的关系
                    const fromName = String(g.nodes?.get?.(e.from)?.name || e.from || '');
                    const toName = String(g.nodes?.get?.(e.to)?.name || e.to || '');
                    if (fromName.length < 2 || toName.length < 2) continue;   // 单字名命中率无意义（与 crosslink 同一口径）
                    if (!t.includes(fromName) || !t.includes(toName)) continue;
                    return { from: fromName, to: toName, label: String(e.label || '相关'), alive: true };
                }
                return null;
            } catch (_e) { return null; }
        }
        /** [v3.185] 上一条提项是否仍有效（端点边未被回滚/未失效）——过期提示必须退场。 */
        _crosslinkConsumeAlive(item) {
            try {
                const g = this.graph;
                if (!g || !g.edges || !item) return false;
                for (const e of g.edges.values()) {
                    if (!e) continue;
                    const fromName = String(g.nodes?.get?.(e.from)?.name || e.from || '');
                    const toName = String(g.nodes?.get?.(e.to)?.name || e.to || '');
                    if (fromName === item.from && toName === item.to) return e.active !== false;
                }
                return false;
            } catch (_e) { return false; }
        }
        /**
         * [v3.185] 条目关联**消费面**读数（诊断面用；纯读、不抛）。
         * 为什么必须单独一行：v3.184 的「条目关联」行只报「词表多大、候选几条」——
         *   候选算出来却没有任何消费者时，那一行照样好看（本轮修的就是这个）。
         *   本行回答的是「这些产出到底有没有被用掉」：提了几条、累计几次、查询侧被动复用几次。
         */
        _crosslinkConsumeLine() {
            try {
                if (this._xrefIdx == null) return '关联未启用（尚无摘要落笔）';
                const it = this._crosslinkConsume;
                const head = it ? `${it.from} → ${it.to}（${it.label}）可提` : '本轮无可提关联';
                return head + `｜累计提 ${this._crosslinkConsumed || 0} 次 · 未命中 ${this._crosslinkConsumeMissN || 0} 次`
                    + `｜摘要入表 ${this._crosslinkXrefN == null ? '—' : this._crosslinkXrefN} 条 · 召回提权 ${this._crosslinkRefRanked || 0} 次`;
            } catch (e) { errLog(e, 'engine._crosslinkConsumeLine'); return '—（诊断异常）'; }
        }
        /**
          * [v3.186] 情绪反向召回读数（诊断面用；纯读、不抛）。
          *   为什么必须与「条目」「复用」那组读数并列单独一行：机制接上了不等于它在本轮起了作用，
          *   （措辞说明：本行刻意不连写那三个字——旧审计以该短语作为**固定文本窗口**的定位锚，
          *   在注释里复用它会把窗口撑偏，属「新注释扰动旧锚点」，与本机制的实现无关。）
         *   而「没情绪词」与「词表对不上正文」在结果上都是 0 条——必须靠 reason 分开：
         *     · 未启用 / 模块未加载        —— 机制不在场
         *     · no-emotion / no-polarity   —— 在场且已判定，只是本轮不构成线索（正常态）
         *     · ok                         —— 真扫过（此时 hits 为 0 才是有信息量的读数）
         *   ⚠️ 只标「长期空转」：真扫过 5 轮以上却一条都没提过 ⇒ 反向词表与正文永远对不上，
         *   机制看着接上了、实际等于白接（这正是本仓最忌的那种「坏了没人知道」）。
         */
        _emotionOppositeLine() {
            try {
                if (this.config.config.emotionOppositeRecall !== true) return '未启用（默认关）';
                const EL = _emotionOppositeLib();
                if (!EL || typeof EL.recallByOppositeEmotion !== 'function') return '模块未加载（narrative-pulse.js）';
                const r = this._emoOppositeRead;
                if (!r) return '待本轮（尚无召回）';
                const CN = { joy: '喜', warm: '暖', sad: '悲', fear: '惧', anger: '怒', tense: '悬' };
                const dim = r.dominant ? (CN[r.dominant] || r.dominant) : '—';
                // [v3.193.0] 「无线索」有四种完全不同的成因，糊成一个等于把这条判据做哑：
                //   没情绪词（词典没覆盖或正文确实平）／情绪词全在回忆·引用·否定·他述里（不可信）／
                //   主导维是氛围型（极性 0，挑不出方向）／该维压根没配反向词（配置缺失，不是世界没情绪）。
                const RSN = {
                    'empty': '无查询文本或无候选',
                    'no-emotion': '无情绪词',
                    'no-trusted': '情绪词不可信（回忆/引用/否定/他述）',
                    'no-polarity': '主导维无极性（氛围型）',
                    'no-opposites': '该维未配反向词（配置缺失）'
                };
                if (r.reason === 'ok') {
                    const _ex = r.expanded ? ` · 预算挡下 ${r.expanded} 条` : '';
                    const _cr = r.credibleWords ? ` · 可信词 ${r.credibleWords}` : '';
                    // [v3.201] D1: 「提权」与「真进注入」是两件事——提权只改排序、不增块，
                    //   被提的条目完全可能仍被预算挤掉。只报「提权 N 条」会把「提了但没进」
                    //   读成「机制起了作用」。账本（v3.200）已按摘要正文片段测出真读数，
                    //   本行必须消费它：待账本 / 不可测 / X/Y 条，三态不可糊成一态。
                    //   （账本缺席的归属不复述：模块是否加载由「注入成本」行另行报出。）
                    const _iop = (this._lastCostLedger && this._lastCostLedger.opposite) ? this._lastCostLedger.opposite : null;
                    const _inj = _iop
                        ? (_iop.measurable === false ? '不可测' : `${Number(_iop.injectedEstimate) || 0}/${Number(_iop.promotedCount) || 0} 条`)
                        : '待账本';
                    return `${dim}主导 → 本轮提 ${r.hits} 条（生效 ${this._emoOppositeRounds || 0} 轮 · 提权 ${this._emoOppositeBoosted || 0} 条 · 真进注入 ${_inj} · 已扫 ${r.scanned} 条${_ex}${_cr}）`;
                }
                return `无反向线索（${RSN[r.reason] || r.reason}·${dim}）`;
            } catch (e) { errLog(e, 'engine._emotionOppositeLine'); return '—（诊断异常）'; }
        }
        /**
         * [v3.184] 图谱汇总读数（诊断面用；纯读、不抛）。
         * 与 _crosslinkLine 同族：回答「图里现在有几层汇总、盖住多少子节点、最近一轮维护干了什么」。
         * 三件事必须分开报，否则同形：
         *   · 累计 created=0 且 rejected 有值 → 接上了但**一次没压成**（判据在拒），
         *   · 模块缺席 / 维护管线压根没跑   → `_graphRollupRead` 为空（不是「压了 0 层」），
         *   · 压成了但边界字段全缺           → line() 里的「有边界 X/N」。
         */
        _graphRollupLine() {
            try {
                const g = this.graph;
                if (!g) return '图未启用';
                const RU = _moduleLib(() => window.LonShaNodeRollup, 'node-rollup.js');
                const body = (RU && typeof RU.line === 'function') ? RU.line(g.nodes) : '模块未加载（node-rollup.js）';
                const rr = g._rollupRead;
                const cum = rr
                    ? ` · 累计压成 ${rr.created} 层${rr.rejected ? ' / 拒 ' + rr.rejected : ''}`
                    : '';
                const last = rr && rr.lastReason && rr.lastReason !== 'ok' ? `（最近拒因 ${rr.lastReason}）` : '';
                const m = this._graphRollupRead;
                const run = m
                    ? ` · 最近维护 第${m.at ? new Date(m.at).toTimeString().slice(0, 5) : '—'} 压成${m.created}层 跳${m.skipped} 回收${m.prunedNodes}点/${m.prunedEdges}边（图 ${m.nodes} 点）`
                    : ' · 维护管线未跑过';
                return body + cum + last + run;
            } catch (e) { errLog(e, 'engine._graphRollupLine'); return '—（诊断异常）'; }
        }
        /**
         * [v3.184] 关系披露读数（诊断面用；纯读、不抛）。
         * 与 _graphRollupLine 同族：回答「本轮几条关系、几条写了条件、跳过了几条、有没有病句」。
         * 为什么必须把「无条件」单列：「无条件 20 条」与「条件全命中 20 条」在只看注入条数时同形，
         *   前者说明谁都没写 disclosure（功能空转），后者说明筛选真在工作。
         */
        _relationDisclosureLine() {
            try {
                const RD = _moduleLib(() => window.LonShaRelationDisclosure, 'relation-disclosure.js');
                const read = this._relationDisclosureRead;
                if (!read) return '本轮未注入关系块';
                if (!RD || typeof RD.line !== 'function') return '模块未加载（relation-disclosure.js）';
                const gated = (this._relationGated || []).length ? ` · 跳过：${this._relationGated.join('，')}` : '';
                return RD.line(read) + gated;
            } catch (e) { errLog(e, 'engine._relationDisclosureLine'); return '—（诊断异常）'; }
        }
        /**
         * [v3.219.0] R2-F 双向关系对账读数（诊断面用；纯读、不抛）。
         * 四态必须分开说：「对侧未登记」是唯一该补记的一态，
         *   把它与「对侧本轮被挡」「对侧已失效」并成一格会让读者去补一条不该补的关系。
         */
        _relationMutualLine() {
            try {
                const RM = _moduleLib(() => window.LonShaRelationMutual, 'relation-mutual.js');
                const read = this._relationMutualRead;
                if (!read) return '本轮未对账';
                if (!RM || typeof RM.line !== 'function') return '模块未加载（relation-mutual.js）';
                return RM.line(read);
            } catch (e) { errLog(e, 'engine._relationMutualLine'); return '—（诊断异常）'; }
        }
        /**
         * [v3.219.0] R2-F 知情网络读数（诊断面用；纯读、不抛）。
         * 「疑似未合并」必须单独报：它是唯一说不出结论的那一档，并进任何一格都会让读者以为判过了。
         */
        _knowledgeNetworkLine() {
            try {
                const KN = _moduleLib(() => window.LonShaKnowledgeNetwork, 'knowledge-network.js');
                const read = this.worldProg && this.worldProg._knowledgeRead;
                if (!read) return '尚无认知记录';
                if (!KN || typeof KN.line !== 'function') return '模块未加载（knowledge-network.js）';
                return KN.line(read);
            } catch (e) { errLog(e, 'engine._knowledgeNetworkLine'); return '—（诊断异常）'; }
        }
        /**
         * [v3.184] 提示词填充读数（诊断面用；纯读、不抛）。
         * 回答「模板里的占位符填进去了几条、有几条靠宽容回退才填上、有没有填完还残留的」。
         * 为什么必须报「残留」：残留 = 用户把占位符写成了别的形态（全角/空格/单括号），
         *   该处**这次没填上**，发给模型的是模板语法。旧实现对此完全静默（无日志、不抛）。
         */
        _promptFillLine() {
            try {
                const FP = _moduleLib(() => window.LonShaFuzzyPatch, 'fuzzy-patch.js');
                const a = this._promptFillRead, b = this._promptFillReadRoles;
                if (!a && !b) return '尚未跑过提取';
                if (!FP || typeof FP.line !== 'function') return '模块未加载（fuzzy-patch.js）';
                const parts = [];
                if (a) parts.push('提取[' + FP.line(a) + ']');
                if (b) parts.push('角色[' + FP.line(b) + ']');
                const cfg = this.config?._fuzzyPatchRead;
                if (cfg) parts.push('迁移[' + cfg.mode + (cfg.applied ? '·已迁' : '·未命中') + ']');
                return parts.join(' · ');
            } catch (e) { errLog(e, 'engine._promptFillLine'); return '—（诊断异常）'; }
        }
        /**
         * [v3.184] 行级变更集读数（诊断面用；纯读、不抛）。
         * 回答「这一轮/最近把哪些格改成了什么」。为什么要有它：
         *   OpLog 回答「系统做了哪些动作」、SnapshotManager 回答「哪一楼的整份快照」，
         *   都不回答「这一格原来是几」。撤销一次误改需要的正是这个数。
         */
        _changesetLine() {
            try {
                const cs = _changeset();
                if (!cs) return '模块未加载（changeset.js）';
                return cs.summarize(true);
            } catch (e) { errLog(e, 'engine._changesetLine'); return '—（诊断异常）'; }
        }
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
                
                const messageText = message.mes || '';
                
                if (extracted?.characters) {
                    // [v3.6] 图谱膨胀修复: 先查后建（原实现每楼新 id——同角色 N 楼 = N 个重复节点，长对话无限膨胀）
                    for (const char of extracted.characters) {
                        const canonical = this.resolveCharacterName(char);
                        this.graph.snapshotGraph(message.index);   // [v3.15] 图谱快照: 楼层起点
                        const existChar = this.graph.findCharacterByName(canonical);
                        if (existChar) {
                            // 已存在: 只补首次出现信息（不重复建；source 保留首次）
                            if (!existChar.data?.source && messageText) existChar.data = {...(existChar.data || {}), source: messageText};
                        } else {
                            this.graph.addNode({type: 'character', name: canonical, data: {source: messageText}});
                            this.opLog?.log('graph', 'add', canonical, message?.index || 0, 'character node');  // [v3.54] op-log
                        }
                    }
                }
                
                if (extracted?.events) {
                    for (const event of extracted.events) {
                        const nodeId = this.graph.addNode({type: 'event', name: event.type, data: event});
                        if (event.participants) {
                            for (const p of event.participants) {
                                this.graph.addEdge({from: p, to: nodeId, label: 'participated_in', floor: message.index || 0});
                            }
                        }
                    }
                }
                
                if (extracted?.relationships) {
                    for (const rel of extracted.relationships) {
                        const relFrom = this.resolveCharacterName(rel.from);
                        const relTo = this.resolveCharacterName(rel.to);
                        // [v1.5] 单向主观关系：主名归并 + attitude 三值入边数据
                        // [v3.37] 传入时态楼层 floor（时态图谱 Zep 理念）
                        // [v3.184] disclosure：关系的「何时该披露」条件（nocturne_memory 的 edge disclosure）。
                        //   只在作者真写了条件时才落库——无条件的关系不写这个字段，
                        //   否则每条边都带一个空串，存档体积白涨且「谁写了条件」不可辨（全是空）。
                        const _disc = String(rel.disclosure == null ? '' : rel.disclosure).trim();
                        this.graph.addEdge({
                            from: relFrom,
                            to: relTo,
                            label: rel.type, weight: 1.0,
                            floor: message.index || 0,
                            data: Object.assign(
                                {attitude: rel.attitude || 'neutral', note: rel.note || '', relClass: classifyRelationshipType(rel.type)},
                                _disc ? {disclosure: _disc} : null
                            )
                        });
                        // [v3.43] 图谱关系已由 addEdge 记录为楼层 delta，供 swipe/删楼重放
                        // [v3.48] P2: 伦理冲突检测（family × intimate 交叉即告警，配合 v3.45 羁绊网防乱伦）
                        // [v3.53] P14 静默缺口修复: extracted.ties_context 从未在提取 schema 中定义（v3.48 遗留），
                        // existingTies 永远 undefined → 检测从未工作。改用 engine 侧真实羁绊数据。
                        if (this.config.config.ethicsConflictEnabled !== false) {
                            const _tiesData = this.status?.getNpcTiesRecords?.() || [];
                            if (_tiesData.length) {
                                const _ethics = detectEthicsConflict(relFrom, relTo, rel.type, _tiesData);
                                if (_ethics && this.config.config.debugMode) {
                                    console.warn(`[${PLUGIN_NAME}] ⚠️ 伦理冲突: ${_ethics.from} × ${_ethics.to}（${_ethics.relation}）与既有血缘羁绊「${_ethics.tie}」交叉`);
                                }
                            }
                        }
                    }
                }
                
                // [v3.42/v3.43] 将提取出的结构化人格、地理与不在场认知写入对应真源
                try {
                    const storyFloor = message.index || 0;
                    for (const ch of (extracted?.characters || [])) {
                        const cn = this.resolveCharacterName(ch);
                        const node = this.graph.findCharacterByName(cn);
                        const fields = extracted?.character_states?.[ch] || extracted?.character_states?.[cn] || null;
                        if (fields?.baseline) this.status.setBaseline(cn, { ...fields.baseline, floor: storyFloor });
                        if (fields?.drift) this.status.recordDrift(cn, { ...fields.drift, floor: storyFloor });
                    }
                    const geo = extracted?.geo_location || extracted?.location_context;
                    if (geo && typeof geo === 'object') this.status.setGeoLocation({ ...geo, floor: storyFloor });
                } catch (e) { errLog(e, 'onMessageReceived.caikis状态增强'); }

                // [v1.8] P0: 写入角色私密记忆（POV 隔离）
                if (this.config.config.povIsolation && Array.isArray(extracted?.pov_memories)) {
                    let povCount = 0;
                    for (const p of extracted.pov_memories) {
                        if (p?.owner && p?.content) {
                            const owner = this.resolveCharacterName(p.owner);
                            this.pov.add(owner, String(p.content).trim(), message.index || 0);
                            this.opLog?.log('pov', 'add', owner, message.index || 0, String(p.content).slice(0, 40));  // [v3.58] P20
                            povCount++;
                        }
                    }
                    // 事件里标了 scope:pov 的也收进 POV 池
                    for (const ev of (extracted?.events || [])) {
                        if (ev?.scope === 'pov' && ev?.owner && ev?.description) {
                            this.pov.add(this.resolveCharacterName(ev.owner), String(ev.description).trim(), message.index || 0);
                            povCount++;
                        }
                    }
                    if (povCount && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] POV私密记忆 +${povCount}`);
                }
                // [v3.16] 角色记忆银行写入（收编 zhino 两层记忆）: 近期=每轮摘要; 核心=关系变化/约定/重大事件
                if (this.config.config.charMemEnabled && extracted) {
                    try {
                        const floor = message.index || 0;
                        // 近期记忆: 当前角色最近发生了什么
                        const chars = (extracted.characters || []).slice(0, 5);
                        if (chars.length && extracted.summary) {
                            for (const ch of chars) {
                                const cn = this.resolveCharacterName(ch);
                                this.charMem.addRecent(cn, extracted.summary.slice(0, 120), floor);
                            }
                        }
                        // 核心记忆: 关系变化（关系建立/恶化）、约定/目标新立
                        for (const rel of (extracted.relationships || [])) {
                            const att = rel?.attitude;
                            if (att === 'positive' || att === 'negative') {
                                const a = this.resolveCharacterName(rel.from), b = this.resolveCharacterName(rel.to);
                                const coreText = `${a}与${b}关系（${att === 'positive' ? '友好' : '对立'}）`;
                                this.charMem.addCore(a, coreText, floor);
                                this.charMem.addCore(b, coreText, floor);
                            }
                        }
                        for (const pl of (extracted.plans || [])) {
                            if (pl?.contentIsNew && pl.content) {
                                const owner = (pl.character && this.resolveCharacterName(pl.character)) || (chars[0] && this.resolveCharacterName(chars[0]));
                                if (owner) this.charMem.addCore(owner, `约定/目标: ${String(pl.content).slice(0, 100)}`, floor);
                            }
                        }
                    } catch (e) { errLog(e, 'onMessageReceived.charMem写入'); }
                }

                // [v3.46] 吸收 Bakemono: 剧情时钟维护与回忆隔离
                try {
                    const curFloor = message.index || 0;
                    const clk = extracted?.story_clock;
                    if (clk && typeof clk === 'object') {
                        this.clock.setTime({
                            date: clk.date,
                            label: clk.label,
                            flashback: !!clk.is_flashback,
                            relativeDays: clk.relative_days,
                            floor: curFloor
                        });
                    } else if (extracted?.story_date) {
                        const isFlashback = /回忆|往事|当年|曾经|十年前|百年前/.test(message.mes || '');
                        this.clock.setTime({
                            date: extracted.story_date,
                            flashback: isFlashback,
                            floor: curFloor
                        });
                    }
                    // [v3.94] 缝入 MyriadKnots story-clock 解析：正文 HTML 注释时间戳回读校准。
                    // 正文为最高事实源——若 LLM 按 v3.72 在正文首尾写了结构化时间注释，
                    // 优先用正文实际时间校准（LLM 提取的 story_clock 仅为次优推断）。
                    // 须在 cleanMessageText 剥标签前的原文上解析。
                    try {
                        const rawMes = (typeof _rawForSynopsis !== 'undefined' && _rawForSynopsis) ? _rawForSynopsis : (message.mes || '');
                        if (rawMes) this.clock.syncFromNarrative(rawMes, { floor: curFloor });
                        // [v3.175] 世界钟对账（只读）：读 WorldAxis 世界桥，记下「另一个插件认为现在是几号」。
                        //   本插件此前对 WorldAxis **零消费**——两个钟各走各的，谁都不知道谁不一致。
                        //   此处只对账、不改时钟：正文仍是最高事实源（见 readWorldAxisClock 注释）。
                        try { this.clock.readWorldAxisClock(null, { reason: 'after-message' }); } catch (_e0) { errLog(_e0, 'nonfatal'); }
                        // [v3.176] 世界账本对读（只读）：不只读钟，把推演侧的全账本（暗流/事实/人物/舆情）
                        //   以及对本地账本的对读（人物位置、权威事实差集）一并取回。**含未外供缺口**——
                        //   修前本插件连「有多少东西没给我」都读不到。
                        //   宿主侧入口：本地投影由插件收集后传入（时钟上取不到 status/outline）。
                        try { this.readWorldLedger({ reason: 'after-message' }); } catch (_e0b) { errLog(_e0b, 'nonfatal'); }
                    } catch (e) { errLog(e, 'onMessageReceived.syncFromNarrative'); }
                    // [v3.130] baibai 正文时间标签协议闭环：bbs_start/bbs_end → GameClock 校准。
                    // 此前标签只喂时间线与向量元数据，时钟本体只被 LLM 推断的 story_clock 校准——
                    // 正文最高事实源反而不影响时钟。结束时间为本楼后的当前时钟；坏标签降级只统计不污染。
                    try {
                        const _tts = this.clock.timeTagStats || (this.clock.timeTagStats = { total: 0, paired: 0, unparseable: 0, calibrated: 0 });
                        _tts.total++;
                        const _dtt = _newRelativeTimeHelper().extractDualTimeTags(_rawForSynopsis || message.mes || '');
                        if (_dtt?.parseError === 'half-pair') {
                            // 半对：另一侧缺失——记录但不校准
                            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 时间标签半对(缺${_dtt.start ? 'end' : 'start'})，跳过时钟校准 (楼层 ${curFloor})`);
                        } else if (_dtt?.hasDual) {
                            _tts.paired++;
                            if (_dtt.parseError) {
                                _tts.unparseable++;
                                if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 时间标签无法解析(${_dtt.parseError})，跳过时钟校准 (楼层 ${curFloor})`);
                            } else {
                                const _endD = String(_dtt.end).split(/\s+/)[0];
                                if (_endD && /[\d年月/.]/.test(_endD)) {
                                    this.clock.setTime({ date: _endD, label: String(_dtt.end).split(/\s+/).slice(1).join(' '), floor: curFloor });
                                    _tts.calibrated++;
                                    // [v3.132] 标签驱动的时间跳变同样纳入倒跳检测（此前只有 LLM 提取的 story_date 走 checkTimeMonotonic）
                                    this.checkTimeMonotonic(_endD, curFloor);
                                    if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🕐 正文时间标签校准时钟: ${_endD} (楼层 ${curFloor})`);
                                }
                            }
                        }
                    } catch (e) { errLog(e, 'onMessageReceived.timeTagClock'); }
                } catch (e) { errLog(e, 'onMessageReceived.GameClock'); }

                // [v1.8] P0: 写入剧情时间线
                if (this.config.config.plotTimeline && extracted?.summary) {
                    let sd = this.extractStoryDate(message.mes || '', extracted.story_date);
                    // [v3.72] B: 正文时间标签的 end 优先为剧情日期（正文事实优先于 LLM 猜测）
                    try {
                        const dta = _newRelativeTimeHelper().extractDualTimeTags(_rawForSynopsis || message.mes || '');  // [v3.73] 清洗前原文（cleanMessageText 会剥 bbs 标签）
                        if (dta?.hasDual && dta.end) {
                            const endDate = String(dta.end).split(/\s+/)[0];  // 取日期部分（去时刻）
                            if (endDate && /[\d年月/.]/.test(endDate)) sd = endDate;
                        }
                    } catch (e) { /* 时间标签解析失败用原 story_date */ }
                    // [v3.32] event importance aggregation - Visual-Memory tiering
                    let tlImp = 5;
                    for (const ev of (extracted?.events || [])) {
                        const v = Number(ev?.importance);
                        if (v >= 1 && v <= 10 && v > tlImp) tlImp = v;
                    }
                    // [v3.18] 时间锚点一致性校验（检测倒跳）
                    if (sd) this.checkTimeMonotonic(sd, message.index || 0);
                    if (extracted?.time_anchor?.end) this.checkTimeMonotonic(extracted.time_anchor.end, message.index || 0);
                    if (sd) this.timeline.add(sd, extracted.summary, message.index || 0, extracted.characters || [], tlImp);
                    this.opLog?.log('timeline', 'add', `tl_${message.index || 0}`, message.index || 0, sd || '');  // [v3.58] P20
                    // [v2.9] RU-A: 主动时间推进——正文说"三天后/次日"但没写日期时，基于上一楼日期算术推进
                    const adv = Number(extracted.time_advance_days) || 0;
                    if (adv > 0) {
                        const base = sd || this._lastStoryDate;
                        const advanced = base ? this.advanceStoryDate(base, adv) : null;
                        if (advanced) {
                            this.timeline.add(advanced, extracted.summary, message.index || 0, extracted.characters || [], tlImp);
                            this._lastStoryDate = advanced;
                            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 时间推进: ${base} +${adv}天 → ${advanced}`);
                        }
                    } else if (sd) {
                        this._lastStoryDate = sd;
                    }
                }

                // [v3.48] P1: 大纲轮次推进（每个 AI 楼层处理完 → 当前 turn 记入简史并推进指针）
                if (this.config.config.outlineDirectorEnabled !== false && this.outline?.stage && !message.is_user) {
                    try {
                        const _curBefore = this.outline._turnIndex;
                        this.outline.advanceTurn(message.index || 0);
                        if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🎬 大纲推进: 第${_curBefore + 1}轮完成 → 指针 ${this.outline._turnIndex}`);
                        // [v3.56] P18: 大纲耗尽时异步规划新阶段（不阻塞生成流）
                        if (this.config.config.outlineAutoPlan && this.outline.exhausted && !this.outline._planning) {
                            this.outline.planNext(this.config.config, this.llm, this, message.index || 0)
                                .then(st => { if (st && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🎬 新阶段已规划: ${st.title}（${st.nodes.length} 节点）`); })
                                .catch(() => {});
                        }
                    } catch (e) { errLog(e, 'onMessageReceived.大纲推进'); }
                }
                // [v2.2] RC: 悬念簿（新悬项登记 + 了结核销 + 超限沉降）
                if (this.config.config.suspenseEnabled && extracted) {
                    try {
                        let susN = 0;
                        for (const pl of (extracted.plans || [])) {
                            if (pl && pl.contentIsNew !== false && pl.content) {
                                if (this.suspense.add(pl.kind, pl.content, message.index || 0, extracted.story_date || null)) susN++;
                            }
                        }
                        let resN = 0;
                        for (const pr of (extracted.plans_resolve || [])) {
                            if (pr && (pr.id || pr.content)) {
                                if (this.suspense.resolve(pr.id || pr.content, pr.outcome, pr.reason, message.index || 0)) resN++;
                            }
                        }
                        // [v3.54] op-log: 悬念簿变更事件
                        if (susN) this.opLog?.log('suspense', 'add', `${susN} items`, message?.index || 0, '');
                        const pruned = this.suspense.prune(this.config.config.suspenseMaxOpen || 20);
                        if ((susN || resN || pruned) && this.config.config.debugMode) {
                            console.log(`[${PLUGIN_NAME}] 悬念簿: +${susN} 新增, ${resN} 了结, ${pruned} 沉降`);
                        }
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 悬念簿处理失败:`, e); }
                }
                // [v3.85] A/B/C: WorldProgress 数据源接线（承诺账本/剧情支线/认知隔离）
                if (this.config.config.worldProgressEnabled && extracted) {
                    try {
                        const wpFloor = Number(message.index) || 0;
                        let promiseCount = 0, arcCount = 0, knowledgeCount = 0;
                        const explicitPromises = Array.isArray(extracted.promises) ? extracted.promises : [];
                        for (const raw of explicitPromises.slice(0, 3)) {
                            const item = typeof raw === 'string' ? { content: raw } : (raw || {});
                            const content = String(item.content || item.text || '').trim();
                            if (!content) continue;
                            const character = String(item.character || item.owner || '通用').trim().slice(0, 40) || '通用';
                            const deadline = Number(item.deadlineFloor);
                            const p = this.worldProg.addPromise({
                                character,
                                content: content.slice(0, 180),
                                deadlineFloor: Number.isFinite(deadline) && deadline > 0 ? deadline : null,
                                floor: wpFloor
                            });
                            if (p) promiseCount++;
                            this.recordCommitmentFact({
                                actor: character,
                                content,
                                due: Number.isFinite(deadline) && deadline > 0 ? String(deadline) : null,
                                storyDate: extracted.story_date || null,
                                floor: wpFloor,
                                source: 'promises',
                                eventKey: 'open:' + character + ':' + content
                            });
                        }
                        const arcs = Array.isArray(extracted.plot_arcs) ? extracted.plot_arcs : [];
                        for (const raw of arcs.slice(0, 3)) {
                            if (!raw || typeof raw !== 'object') continue;
                            const action = String(raw.action || 'add').trim().toLowerCase();
                            const key = String(raw.id || raw.title || '').trim();
                            if (!key) continue;
                            if (action === 'touch') {
                                if (this.worldProg.touchArc(key, wpFloor)) arcCount++;
                            } else if (action === 'resolve') {
                                const arc = this.worldProg.plotArcs.find(a => a.id === raw.id || a.title === key);
                                if (arc) {
                                    arc.status = 'resolved';
                                    arc.resolutionFloor = wpFloor;
                                    arc.resolutionReason = String(raw.reason || '').slice(0, 120);
                                    arcCount++;
                                }
                            } else {
                                const arc = this.worldProg.addPlotArc({
                                    title: key.slice(0, 80),
                                    clue: String(raw.clue || raw.content || '').slice(0, 180),
                                    interestedBy: String(raw.interestedBy || raw.character || '').slice(0, 40),
                                    currentFloor: wpFloor,
                                    createdFloor: wpFloor
                                });
                                if (arc) arcCount++;
                            }
                        }
                        // [v3.178] promises_resolve 消费口（此前提取了但产品零消费 ⇒ 承诺永不了结）。
                        //   注入区已带 prom_id，AI 按 id 回引；id 缺失时按「未了结且内容唯一匹配」回退，
                        //   匹配到多条则不动（宁可不结，不可错结）。
                        let resolvedCount = 0;
                        const resolveReqs = Array.isArray(extracted.promises_resolve) ? extracted.promises_resolve : [];
                        for (const raw of resolveReqs.slice(0, 5)) {
                            if (!raw || typeof raw !== 'object') continue;
                            let target = null;
                            const rid = String(raw.id || '').trim();
                            if (rid) {
                                target = this.worldProg.promises.find(x => x.id === rid) || null;
                            } else {
                                const rc = String(raw.content || raw.text || '').trim();
                                if (rc) {
                                    const cands = this.worldProg.promises.filter(x =>
                                        (x.status === 'pending' || x.status === 'imminent' || x.status === 'overdue') &&
                                        (x.content === rc || x.content.includes(rc) || rc.includes(x.content)));
                                    if (cands.length === 1) target = cands[0];
                                }
                            }
                            if (target && this.worldProg.resolvePromise(target.id, raw.status, wpFloor)) {
                                resolvedCount++;
                                const broken = String(raw.status || '').toLowerCase() === 'broken';
                                this.recordCommitmentFact({
                                    actor: target.character,
                                    content: target.content,
                                    action: broken ? 'break' : 'fulfill',
                                    storyDate: extracted.story_date || null,
                                    floor: wpFloor,
                                    source: 'promises_resolve',
                                    eventKey: (broken ? 'break:' : 'fulfill:') + target.id + ':' + wpFloor
                                });
                            }
                        }
                        const changes = Array.isArray(extracted.knowledge_changes) ? extracted.knowledge_changes : [];
                        for (const raw of changes.slice(0, 8)) {
                            if (!raw || typeof raw !== 'object') continue;
                            const character = String(raw.character || raw.owner || '').trim().slice(0, 40);
                            const fact = String(raw.fact || raw.content || '').trim().slice(0, 180);
                            if (!character || !fact) continue;
                            const action = String(raw.action || 'unaware').toLowerCase();
                            if (action === 'reveal' || action === 'known') this.worldProg.revealKnowledge(character, fact, raw.source || '');
                            else this.worldProg.markUnaware(character, fact);
                            knowledgeCount++;
                        }
                        // 即时推进检查：不等到下一次生成才刷新 imminent/overdue 与支线沉降。
                        this.worldProg.checkPromises(wpFloor);
                        this.worldProg.decayArcs(wpFloor, 15);
                        // [v3.195] 已回收伏笔只留到下一回合。sweep 清 recoveredFloor < 本楼 的条。
                        //   本回合刚回收的留下；没有账本时 recordSeedFact 自己返回 null。
                        try { this.recordSeedFact({ action: 'sweep', floor: wpFloor }); }
                        catch (e) { errLog(e, 'onMessageReceived.伏笔清扫'); }
                        if (promiseCount || arcCount || knowledgeCount || resolvedCount) {
                            this.opLog?.log('worldprogress', 'update', promiseCount + ' promises/' + arcCount + ' arcs/' + knowledgeCount + ' knowledge/' + resolvedCount + ' resolved', wpFloor, '');
                            if (this.config.config.debugMode) console.log('[' + PLUGIN_NAME + '] 🌐 世界推进接线: 承诺' + promiseCount + '·支线' + arcCount + '·认知' + knowledgeCount + '·了结' + resolvedCount);
                        }
                    } catch (e) { errLog(e, 'onMessageReceived.WorldProgress接线'); }
                }

                // [v2.4] RE: 场景树（新地点登记 + 位置追踪）
                if (this.config.config.sceneEnabled && extracted) {
                    try {
                        const scN = this.scene.apply(extracted.scenes, message.index || 0);
                        // [v3.195] 场景头只吃提取明确给出的日期 / 时段 / 天气。三者皆空 setHeader 自己拒绝。
                        //   不从正文推断，不回退到上一楼。story_date 是已有字段，不是新造的抽取口。
                        try {
                            const _hdr = {
                                date: extracted.story_date || extracted.scene_date || '',
                                period: extracted.period || extracted.time_of_day || '',
                                weather: extracted.weather || ''
                            };
                            if (this.scene.setHeader) this.scene.setHeader(message.index || 0, _hdr);
                        } catch (e) { errLog(e, 'onMessageReceived.场景头'); }
                        if (extracted.location) {
                            const _moved = this.scene.setLocation(message.index || 0, extracted.location);
                            // [v3.181] SG：位置一变，把**本轮在场角色**写进在场索引（谁在何处）。
                            //   来源是同一轮提取的 characters（本轮实际登场者），不额外猜。
                            //   这是「地点侧第一次能回答空间共处的谁」——此前角色在哪只以
                            //   status_changes 的 field:'位置'（末级名）散落在状态表里。
                            if (_moved && Array.isArray(extracted.characters)) {
                                for (const _nm of extracted.characters) {
                                    if (_nm && typeof _nm === 'string') this.scene.setPresence(_nm, extracted.location, message.index || 0);
                                }
                            }
                        }
                        // [v2.8] RT-C: 物品台账应用（ops 真源记录，回滚可重放）
                        // [v3.8] 修复 v3.3「先清」自相矛盾：改为「同状态(fp)清、多变体保留」——
                        //   同一文本状态重复提取时清旧防堆积；不同 swipe 变体（不同 fp）保留，
                        //   切回旧变体时由 rebuildItems 的 fp 匹配自动复活（不再依赖重提取重建）
                        if (this.config.config.itemLedgerEnabled && Array.isArray(extracted.items) && extracted.items.length) {
                            const fpNow = msgFpOf(message);
                            const floorNow = message.index || 0;
                            if (fpNow) this.itemOps = (this.itemOps || []).filter(o => !(o && o.floor === floorNow && o.fp === fpNow));
                            // [v3.154] 写入侧校验（anima #30）：真源 itemOps 要落盘/进携带包/被导出，
                            //   旧写法把 LLM 原始对象直接 push 进真源，字段无长度、无枚举、无类型约束。
                            //   改为入账前逐项宽容校验（能修就修，修不了才丢，不因一项脏丢整批）。
                            const _lv = (this.config.config.ledgerWriteValidationEnabled === false)
                                ? { items: extracted.items.filter(it => it && it.name), violations: [] }
                                : validateLedgerItemOps(extracted.items, { fallbackFloor: floorNow });
                            for (const it of _lv.items) {
                                this.itemOps.push({ floor: floorNow, fp: fpNow, ...it });
                            }
                            if (_lv.violations.length) this._recordLedgerViolations(_lv.violations, 'extract', floorNow);
                            this.rebuildItems();
                            // [v3.54] op-log: 物品台账变更事件
                            if (this.itemOps?.length) this.opLog?.log('item', 'update', `${this.itemOps.length} items`, floorNow, '');
                            // [v3.180] 真源下沉：同一次提取命中的物品**同时**写成该楼自己的附注。
                            //   汇总口（itemOps → rebuildItems → 预算/注入/携带）一字不动，
                            //   新增的是**归属性**：这一格账属于哪一楼哪一页，由楼层自己证明。
                            //   与摘要落笔共用合并语义（同页二次落笔互不覆盖），故谁先谁后都对。
                            this._stampFloorLedger(message, { floor: floorNow, items: _lv.items });
                        }
                        if ((scN || extracted.location) && this.config.config.debugMode) {
                            console.log(`[${PLUGIN_NAME}] 场景树: +${scN} 地点, 位置=${SceneBook.keyOf(extracted.location) || '未变'}`);
                        }
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 场景树处理失败:`, e); }
                }

                // [v2.0] P2: 角色状态 + 待办 + 楼层账本
                const floor = message.index || 0;
                const nodesBefore = this.graph.nodes.size;
                if (this.config.config.characterStateEnabled && extracted?.status_changes) {
                    try {
                        const n = this.status.applyChanges(extracted.status_changes, floor, false, this.clock?.date || this.getLatestStoryDate?.() || '');
                        if (n && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 状态更新 ${n} 项`);
                        // [v3.54] op-log: 状态变更事件
                        if (n) this.opLog?.log('status', 'update', `${n} changes`, floor, (extracted.status_changes || []).map(c => c?.character + '.' + c?.field).join(',').slice(0, 60));
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 状态写入失败:`, e); }
                }
                // [v3.78] A: 主角客观档案 + 生活小档案写入（修复 v3.45 有壳无水源——提取管线从不产出这两字段）
                if (this.config.config.protagonistTracking !== false && extracted) {
                    try {
                        if (extracted.protagonist && typeof extracted.protagonist === 'object') {
                            const keys = ['gender', 'age', 'identity', 'appearance', 'outfit', 'condition'];
                            const hasAny = keys.some(k => extracted.protagonist[k] !== undefined && extracted.protagonist[k] !== null && String(extracted.protagonist[k]).trim() !== '');
                            if (hasAny) {
                                this.status.setProtagonist(extracted.protagonist, floor, this.clock?.date || this.getLatestStoryDate?.() || '');
                                this.opLog?.log('status', 'update', 'protagonist', floor, keys.filter(k => extracted.protagonist[k] !== undefined).join(','));
                            }
                        }
                        if (Array.isArray(extracted.life_details) && extracted.life_details.length) {
                            let ln = 0;
                            for (const ld of extracted.life_details.slice(0, 5)) {
                                if (ld && (typeof ld === 'string' || ld.text)) { if (this.status.addLifeDetail(ld, floor)) ln++; }
                            }
                            if (ln && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🧬 生活小档案 + ${ln} 条`);
                            if (ln) this.opLog?.log('status', 'add', `${ln} life details`, floor, '');
                        }
                    } catch (e) { errLog(e, 'onMessageReceived.主角档案'); }
                }
                if (this.config.config.todoTrackingEnabled && extracted?.todos) {
                    try {
                        this.status.addTodos(extracted.todos, floor);
                    } catch (e) { errLog(e, 'onMessageReceived.文本清洗'); }
                }
                if (this.config.config.todoTrackingEnabled) {
                    try {
                        const sd = this.getLatestStoryDate();
                        if (sd) this.status.pruneTodos(sd, this.config.config.todoExpiryMinutes || 60);
                    } catch (e) { errLog(e, 'onMessageReceived.状态应用'); }
                }
                // [v3.49] P5: 群像共同记忆（关系对归因式切片）
                if (this.config.config.pairMemoryEnabled !== false && Array.isArray(extracted?.relationships)) {
                    try {
                        const sd = this.getLatestStoryDate();
                        const n = this.pairMem.addFromExtracted(extracted.relationships, extracted.characters, floor, sd);
                        if (n && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 👥 群像记忆更新 ${n} 条`);
                        // [v3.58] P20: op-log 群像埋点
                        if (n) this.opLog?.log('pair', 'add', `${n} pairs`, floor, '');
                    } catch (e) { errLog(e, 'onMessageReceived.群像记忆'); }
                }
                // [v3.47] 钱财账本 + 剧情卡牌（hcdiary 吸收）
                if (this.config.config.moneyLedgerEnabled !== false && Array.isArray(extracted?.money_changes) && extracted.money_changes.length) {
                    try {
                        const sd = this.getLatestStoryDate();
                        for (const mc of extracted.money_changes) {
                            const nm = String(mc?.character || '').trim();
                            if (!nm) continue;
                            if (mc.value !== null && mc.value !== undefined && mc.value !== '') {
                                // [v3.128] anima zod 式台账校验：覆盖式改值幅度超上限则 clamp 到 旧值±上限（防 LLM 幻觉一键暴富/清零家产）
                                let next = Number(mc.value) || 0;
                                const maxDelta = numOr(this.config.config.maxMoneyDelta, 0);   // [v3.156] 0=关闭校验，语义等价，统一形态
                                if (maxDelta > 0) {
                                    const prev = Number(this.moneyLedger.getMoney(nm)?.amount) || 0;
                                    if (Math.abs(next - prev) > maxDelta) {
                                        next = prev + Math.sign(next - prev) * maxDelta;
                                        errLog(new Error(`钱财覆盖式改值幅度超限，已 clamp: ${nm} ${prev}→${next}（申报 ${mc.value}）`), 'ledger.clamp');
                                    }
                                }
                                this.moneyLedger.setMoney(nm, next, mc.reason || '', floor, sd);
                            } else if (mc.delta) {
                                this.moneyLedger.addDelta(nm, Number(mc.delta) || 0, mc.reason || '', floor, sd);
                            }
                        }
                        if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 钱财账本更新 ${extracted.money_changes.length} 项`);
                        // [v3.58] P20: op-log 钱财埋点
                        if (extracted.money_changes.length) this.opLog?.log('money', 'update', `${extracted.money_changes.length} changes`, floor, extracted.money_changes.map(mc => mc?.character).join(',').slice(0, 50));
                    } catch (e) { errLog(e, 'onMessageReceived.钱财账本'); }
                }
                // [v3.47] 矛盾账本（memorybooks 吸收：真矛盾显式标注并存）
                if (this.config.config.conflictBookEnabled !== false && Array.isArray(extracted?.conflicts) && extracted.conflicts.length) {
                    try {
                        const sd = this.getLatestStoryDate();
                        const n = this.conflicts.addFromExtracted(extracted.conflicts, floor, sd);
                        if (n && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] ⚔️ 登记真矛盾 ${n} 条`);
                        // [v3.58] P20: op-log 矛盾埋点
                        if (n) this.opLog?.log('conflict', 'add', `${n} conflicts`, floor, '');
                    } catch (e) { errLog(e, 'onMessageReceived.矛盾账本'); }
                }
                // [v3.194] 时间与事实版本 / 事件完整性落笔（**独立于矛盾账**）。
                //   为什么必须独立：挂在矛盾账条件里会让「本楼的事实与事件段是否入账」取决于
                //   「本楼恰好提取出了矛盾」——没有矛盾的楼层全部不入账且零报错，查询
                //   「现在去哪里找她」只命中恰好有矛盾的那几楼（静默丢账，读数上也看不出来）。
                //   两面各自独立 try：一面坏不连坐另一面。
                try {
                    const sd = this.getLatestStoryDate();
                    try {
                        const _fvn = this._absorbFactVersions(extracted, floor, sd);
                        if (_fvn && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 📌 事实版本 +${_fvn}`);
                    } catch (e) { errLog(e, 'extraction.v3194.factVersions'); }
                    try {
                        const _ecn = this._absorbEventSegments(extracted, floor, sd);
                        if (_ecn && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🧵 事件段 +${_ecn}`);
                    } catch (e) { errLog(e, 'extraction.v3194.eventThreads'); }
                } catch (e) { errLog(e, 'extraction.v3194'); }
                // [v3.94] CSE 级人物状态引擎（自研融合增强：分层+toward+visibility+证据链+置信度）
                if (this.config.config.cseEnabled !== false && Array.isArray(extracted?.cse_states) && extracted.cse_states.length) {
                    try {
                        const n = this.cse.addFromExtracted(extracted.cse_states, floor);
                        if (n && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🧠 CSE 登记人物状态 ${n} 条`);
                        if (n) this.opLog?.log('cse', 'set', `${n} states`, floor, (extracted.cse_states || []).map(s => s?.character + '.' + s?.field).join(',').slice(0, 60));
                        // [v3.167] 容量账目必须与写入量并列可见。修前这一段的记账口径是
                        //   「addFromExtracted 返回了几个非 null」，而 CSE 是全插件唯一会
                        //   **主动丢弃已写入数据**的子系统（MAX_STATES_PER_CHAR 淘汰）
                        //   且此前还会把有向状态**静默降级**为无向（toward 上限）。
                        //   两种处置都不进任何日志：丢了多少、拒了多少，用户侧零线索。
                        const _cr = this.cse.lastExtractReport;
                        if (_cr && (_cr.evicted || _cr.rejected)) {
                            this.opLog?.log('cse', 'cap', `evict ${_cr.evicted}/${_cr.attempted} reject ${_cr.rejected}`, floor,
                                `上限淘汰 ${_cr.evicted} 条 · 身份约束拒绝 ${_cr.rejected} 条${_cr.rejectedSamples?.length ? '（如 ' + _cr.rejectedSamples.join(' / ') + '）' : ''}`);
                            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🧠 CSE 容量：淘汰 ${_cr.evicted} / 拒绝 ${_cr.rejected}（共尝试 ${_cr.attempted}）`);
                        }
                    } catch (e) { errLog(e, 'onMessageReceived.cse'); }
                }
                // [v3.95] 叙事心电图（完全原创：情感极性+张力节奏+角色弧光+自反性节奏建议，零额外 API）
                if (this.config.config.narrativePulseEnabled !== false) {
                    try {
                        const _suspCnt = (this.suspense?.openItems?.() || []).length;
                        const _beat = this.pulse.beat(floor, {
                            mesText: _rawForSynopsis || message.mes || '',
                            events: extracted?.events || [],
                            suspenseCount: _suspCnt,
                            characters: extracted?.characters || []
                        });
                        if (_beat && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 💓 叙事心电图 floor=${floor} 张力=${Math.round(_beat.tension*100)}% 极性=${_beat.polarity.toFixed(2)}`);
                    } catch (e) { errLog(e, 'onMessageReceived.叙事心电图'); }
                }
                if (this.config.config.cardCollectionEnabled !== false && Array.isArray(extracted?.events)) {
                    try {
                        const sd = this.getLatestStoryDate();
                        const n = this.cards.forgeFromEvents(extracted.events, floor, sd, 8);
                        if (n && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🃏 铸造剧情卡牌 ${n} 张`);
                        // [v3.58] P20: op-log 卡牌埋点
                        if (n) this.opLog?.log('card', 'forge', `${n} cards`, floor, '');
                    } catch (e) { errLog(e, 'onMessageReceived.剧情卡牌'); }
                }
                if (this.config.config.floorLedgerEnabled) {
                    try {
                        const allIds = Array.from(this.graph.nodes.keys());
                        this.ledger.record(floor, {
                            nodeIds: allIds.slice(nodesBefore),
                            povIds: this.pov.povs.filter(p => p.floor === floor).map(p => p.id),
                            timelineIds: this.timeline.entries.filter(t => t.floor === floor).map(t => t.id),
                            timeAnchor: extracted?.time_anchor || null
                        });
                    } catch (e) { errLog(e, 'onMessageReceived.楼层账本'); }
                }

                // [v3.201] D2: 摘要 storyTime 独立提取（与时间线条目同口径：正文标签 end 优先），
                //   不依赖 plotTimeline 开关——相对时间前缀是摘要注入的显示属性。
                //   ⚠️ 不得引用 3074 行的 `sd`：它在 if 块内声明、块已闭合，跳块引用会抛
                //   ReferenceError 被外层静默吞掉（与 v3.185 queryText 同类坑，本次修正前实测一次）。
                let _summaryStoryTime = '';
                try {
                    _summaryStoryTime = String(this.extractStoryDate(message.mes || '', extracted?.story_date) || '').trim();
                    const _dta2 = _newRelativeTimeHelper().extractDualTimeTags(_rawForSynopsis || message.mes || '');
                    if (_dta2?.hasDual && _dta2.end) {
                        const _endDate2 = String(_dta2.end).split(/\s+/)[0];
                        if (_endDate2 && /[\d年月/.]/.test(_endDate2)) _summaryStoryTime = _endDate2;
                    }
                } catch (e) { errLog(e, 'createSummary.storyTime'); }
                const summary = await this.summary.createSummary(message, extracted?.summary, { maxLen: this.config.config.maxSummaryLength, storyTime: _summaryStoryTime });
                // [v3.180] 第二次落笔：同一楼先落物品、后落摘要，**共用合并语义**（floor-ledger.stamp 读
                //   现有附注判定「是否仍属本页」，属于则继承字段）。顺序不可交换的意义在于：后到的那次
                //   读到的是「本页已有物品账」，于是补上 summary 字段而不是整格换新；两次落笔谁先谁后都对，
                //   但**同一次提取内先物品后摘要**是唯一能把两边都写全的顺序。
                //   fresh 模式：指纹必须与落笔当时的楼一致——提取排队期间被翻页/编辑时，这格账属于旧页，
                //   宁可让覆盖度把它报成缺口（逐楼可见、可重提取补齐），也不把账记到新页上。
                if (summary) {
                    try {
                        this._stampFloorLedger(message, {
                            floor: floor || 0,
                            summary: { floor: floor || 0, text: summary.text }
                        }, { fresh: true });
                    } catch (e) { errLog(e, 'onMessageReceived.楼层落笔.摘要'); }
                    // [v3.183] 分支守护（事前拦）：这轮的摘要该不该写到这一楼。
                    //   翻页 / 重生成之后，本轮提取算的是**另一个分支**的账，落上去就是
                    //   「摘要里躺着上一个分支的事实」——用户翻回去才发现内容对不上。
                    //   判定用**签名**（角色+页码+正文hash+代次+时间戳），不用楼层号：
                    //   楼层号在翻页时不变化，签名才有辨别力。
                    let _branchOk = true;
                    try {
                        const BG = _branchGuardLib();
                        if (BG && typeof BG.createGuard === 'function') {
                            if (!this._branchGuard) this._branchGuard = BG.createGuard();
                            const sess = this.getCurrentChatId ? this.getCurrentChatId() : '';
                            const f = Number(message && message.index);
                            const g = this._branchGuard.guardApply(message, this._branchGuard.getProcessedSignature(f, sess), sess);
                            if (!g.accept) {
                                _branchOk = false;
                                this._branchGuardLast = { floor: f, reason: g.reason, at: Date.now() };
                                if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] ⛔ 分支守护拦截第${f}楼摘要落笔（${g.reason}）`);
                                try { this.opLog?.log?.('branch', 'apply-skip', String(g.reason), f, ''); } catch (e) { errLog(e, 'onMessageReceived.分支守卫审计'); }
                            }
                        }
                    } catch (e) { errLog(e, 'onMessageReceived.分支守护'); }
                    // [v3.183] 来源留证：把「这条摘要来自哪一页」写进摘要自己（summary.prov）。
                    //   与 floor-ledger 分工：ledger 记的是**楼上有过什么**，这里记的是
                    //   **这条摘要的来源还对不对得上**。楼删了、翻页了、摘要被就地改了，
                    //   三件事都能在验真时分开归因（source_missing / source_changed / text_drift）。
                    //   留证失败不影响摘要本身：capture 契约是「要么写全，要么什么都不改」。
                    if (_branchOk) try {
                        const PV = _summaryProvenanceLib();
                        if (PV && typeof PV.capture === 'function') {
                            const prov = PV.capture(summary, message);
                            this._summaryProvenanceStamp = prov
                                ? { status: 'ok', floor: floor || 0, at: Date.now() }
                                : { status: 'rejected', reason: 'not-captured', floor: floor || 0, at: Date.now() };
                        } else {
                            this._summaryProvenanceStamp = { status: 'module-unavailable', floor: floor || 0, at: Date.now() };
                        }
                    } catch (e) {
                        this._summaryProvenanceStamp = { status: 'thrown', floor: floor || 0, reason: String((e && e.message) || e), at: Date.now() };
                        errLog(e, 'onMessageReceived.摘要留证');
                    }
                    // [v3.183] 落笔成功后记下**这一代的签名**——下次同楼再提取时才有比对基准，
                    //   否则守卫每次都判不了（no-signature），保护形同虚设。
                    //   记在留证成功之后：没留证的摘要本来就不受溯源保护。
                    if (_branchOk && this._summaryProvenanceStamp && this._summaryProvenanceStamp.status === 'ok') {
                        try {
                            const BG = _branchGuardLib();
                            if (BG && this._branchGuard && typeof BG.signatureOf === 'function') {
                                this._branchGuard.setProcessedSignature(
                                    Number(message && message.index),
                                    BG.signatureOf(message),
                                    this.getCurrentChatId ? this.getCurrentChatId() : ''
                                );
                            }
                        } catch (e) { errLog(e, 'onMessageReceived.分支签名记录'); }
                    }
                }
                        this.opLog?.log('summary', 'add', `sum_${message?.index || 0}`, message?.index || 0, (extracted?.summary || '').slice(0, 40));  // [v3.54] op-log
                
                // [v3.183] 条目关联（Crosslink）：给刚落的摘要扫一遍已有关联词表，记下它和哪些
                //   既有条目共享关键词。**只报告、不写图**——写图是提取管线的职责，这里给的是弱关系候选。
                //   为什么要这一步：召回纯按查询相关性取条目，A 条目正文提到 B 条目的人/地/事时系统完全不知道，
                //   同一概念散在不同楼的记忆永远连不起来（nocturne 的 Glossary 解决的正是这个）。
                try {
                    const XL = _crosslinkLib();
                    if (XL && typeof XL.createIndex === 'function') {
                        // 停用词配置是逗号分隔字符串（设置面板给的是 textarea），必须先 split 再传数组：
                        // crosslink 内部按 Array.from 取项，直接喂字符串会被拆成一个个**字符**，
                        // 于是「主角」这类词永远进不了停用表（静默失效，不报错）。
                        const _stopRaw = this.config.config.crosslinkStopwords;
                        const _stop = Array.isArray(_stopRaw)
                            ? _stopRaw
                            : String(_stopRaw || '').split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
                        if (!this._crosslinkIndex) this._crosslinkIndex = XL.createIndex({ stopwords: _stop });
                        const idx = this._crosslinkIndex;
                        this._xrefIdx = idx;      // [v3.185] 供「条目复用」诊断行区分「模块缺席 / 尚未建索引 / 正常」
                        // [v3.185] 摘要键 → 它提到过的词（幂等登记用）。必须在此初始化：
                        //   若漏了它，下面「摘要入表」段每轮都会在 `.get` 上抛进 catch——
                        //   功能看着接上了、读数却恒空，正是本仓最忌的那种「坏了没人知道」。
                        if (!this._crosslinkXrefs) this._crosslinkXrefs = new Map();
                        // 词表来源：图谱节点名（人物/地点/事件）。节点是「可被指称的东西」，
                        // 摘要正文里提到的正是它们。
                        if (this._crosslinkLoadedFloor !== true) {
                            try {
                                const nodes = Array.from(this.graph?.nodes?.values?.() || []);
                                idx.loadFromNodes(nodes, (n) => n.id || n.name);
                                this._crosslinkLoadedFloor = true;
                            } catch (e) { errLog(e, 'onMessageReceived.crosslink载入'); }
                        }
                        if (summary && summary.text) {
                            const res = idx.scan(summary.text);
                            const selfRef = 'sum_' + (floor || 0);
                            const linked = [];
                            for (const h of res.hits) {
                                for (const ref of h.refs) {
                                    if (ref === selfRef) continue;
                                    if (!linked.some(l => l.ref === ref)) linked.push({ ref, keyword: h.keyword });
                                }
                            }
                            this._crosslinkLast = { floor: floor || 0, total: res.total, truncated: res.truncated, linked: linked.slice(0, 20) };
                            if (linked.length && this.config.config.debugMode) {
                                console.log(`[${PLUGIN_NAME}] 🔗 关联候选 ${linked.length} 条（第${floor}楼摘要）`);
                            }
                            // [v3.185] 摘要入表：给每条活跃摘要算出「它提到了哪些已知名」，并把这些名
                            //   以「摘要图键（sum_<floor>）」为引用登记进词表 —— 这样 recallMemory 按 query.text
                            //   扫同一份词表时，命中的 ref 就是**可回指到具体摘要**的键，才有了真正可消费的产出。
                            //   为什么直接扫摘要正文而不是走 loadFromNodes：图的 refOf 回落取的是
                            //   `node.id || node.name`，而这些名字登记进去的 ref 是**节点 id**，
                            //   落到 merged 条目上根本对不上（条目带的键是 sum_<floor>），
                            //   于是「命中算得出、却匹配不到任何条目」——看着接上了，实际仍然零影响。
                            try {
                                const _sums = (this.summary && typeof this.summary.getActiveSummaries === 'function')
                                    ? this.summary.getActiveSummaries() : [];
                                let _regN = 0;
                                for (const _s of _sums) {
                                    if (!_s) continue;
                                    const _sk = _s.key || _s.id || ('sum_' + (_s.floor == null ? '' : _s.floor));
                                    const _tx = String(_s.text || '');
                                    if (!_sk || !_tx) continue;
                                    const _hit = idx.scan(_tx);
                                    if (!_hit.hits.length) continue;
                                    const _set = new Set();
                                    for (const _h of _hit.hits) { const _w = String(_h.keyword || '').trim(); if (_w) _set.add(_w); }
                                    if (!_set.size) continue;
                                    const _prev = this._crosslinkXrefs.get(_sk);
                                    const _changed = !_prev || _prev.size !== _set.size;
                                    this._crosslinkXrefs.set(_sk, _set);
                                    if (_changed) { for (const _w of _set) idx.add(_w, _sk); }   // add 幂等：重复登记不改指纹
                                    _regN++;
                                }
                                this._crosslinkXrefN = _regN;      // 诊断行读：「摘要入表几条」（0 而摘要存在 ⇒ 对召回侧等于没接）
                            } catch (e) { errLog(e, 'onMessageReceived.crosslink摘要入表'); }
                        }
                    }
                } catch (e) { errLog(e, 'onMessageReceived.crosslink'); }
                // [v3.185] 条目关联的**消费点**：v3.184 之前这里只有生产、没有消费（产出进字段即终止）。
                //   本处按「本楼正文同时出现了某条已确认关系的两端名」收口出一条可提项，交给注入侧消费
                //   （见 buildInjection 的〔本轮可提关联…〕行）。不做自动写边：自动写边会在长线里累积幻觉边
                //   且不可逆（与 v3.183 的立论一致）；这里只**提条**，由图谱语义与模型自己决定是否据实落边。
                //   命中即交棒；未命中则让上一条提项退场（边已被回滚/失效时立刻退，防每轮带过期关系进注入）。
                try {
                    const _pair = (typeof this._crosslinkConsumePair === 'function')
                        ? this._crosslinkConsumePair(summary && summary.text) : null;
                    if (_pair) {
                        this._crosslinkConsume = _pair;
                        this._crosslinkConsumed = Number(this._crosslinkConsumed || 0) + 1;
                    } else {
                        const _held = this._crosslinkConsume;
                        if (_held && typeof this._crosslinkConsumeAlive === 'function'
                            && !this._crosslinkConsumeAlive(_held)) this._crosslinkConsume = null;
                        this._crosslinkConsumeMissN = Number(this._crosslinkConsumeMissN || 0) + 1;
                    }
                } catch (e) { errLog(e, 'onMessageReceived.crosslink消费'); }
                
                // [v3.30] PV: 记忆矛盾换代 —— 新摘要与既有活跃摘要做高置信冲突检测, 旧条 superseded 退出召回
                if (window.LonShaSupersede && this.config.config.supersedeEnabled) {
                    try {
                        const newKey = 'sum_' + (message.index || 0);
                        const activeSumsLc = this.summary.getActiveSummaries()
                            .map(s => ({ key: 'sum_' + s.floor, text: s.text, importance: s.importance || extracted?.importance || 5 }));
                        const newSumsLc = activeSumsLc.filter(s => s.key === newKey);
                        const oldSumsLc = activeSumsLc.filter(s => s.key !== newKey)
                            .slice(-(this.config.config.supersedeScanPool || 30));
                        const supersededLc = newSumsLc.length
                            ? this.supersede.scan(newSumsLc, oldSumsLc)
                            : [];
                        if (supersededLc.length) {
                            this.statsSuperseded = (this.statsSuperseded || 0) + supersededLc.length;
                            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🕊 矛盾换代: ${supersededLc.length} 条旧记忆被新事实压制`);
                        }
                        this.supersede.revive(activeSumsLc.map(s => s.key));
                    } catch (e) { errLog(e, 'onMessageReceived.supersede'); }
                }
                
                // [v2.5] RF: 活人感日记——每N楼一次批量生成登场角色第一人称日记
                if (this.config.config.livingDiary) {
                    try {
                        const dn = await this.diary.generateLiving(this.config.config, this.llm, extracted?.characters ? this.getKnownCharacters() : [], message.index || 0);
                        if (dn && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 活人感日记 +${dn} 条`);
                        // [v3.58] P20: op-log 日记埋点
                        if (dn) this.opLog?.log('diary', 'add', `${dn} entries`, message.index || 0, '');
                    } catch (e) { errLog(e, 'onMessageReceived.POV状态回收'); }
                }

                // [v3.37] 叙事惊奇度/熵累加器（MemGPT 动态反思理念）
                let deltaEntropy = 0;
                let hasTurnaround = false;
                if (Array.isArray(extracted?.events)) {
                    for (const ev of extracted.events) {
                        const imp = Number(ev.importance) || 5;
                        if (imp >= 9) { deltaEntropy += 6; hasTurnaround = true; }
                        else if (imp >= 7) { deltaEntropy += 3; }
                        else if (imp >= 5) { deltaEntropy += 1; }
                    }
                }
                if (Array.isArray(extracted?.status_changes) && extracted.status_changes.length) {
                    deltaEntropy += Math.min(5, extracted.status_changes.length);
                }
                if (Array.isArray(extracted?.plans_resolve) && extracted.plans_resolve.length) {
                    deltaEntropy += extracted.plans_resolve.length * 4;
                }
                this._narrativeEntropy = (this._narrativeEntropy || 0) + deltaEntropy;
                const entropyThresh = Number(this.config.config.entropyThreshold || 15);
                const isEntropyTriggered = this.config.config.entropyReflectionEnabled !== false && (this._narrativeEntropy >= entropyThresh || hasTurnaround);

                // [v2.8] RT-B + [v3.37]: 反思生成（周期节流 OR 惊奇度冲顶自适应触发，与日记独立）
                try {
                    if (this.config.config.reflectionEnabled) {
                        const didReflect = await this.reflection.generate(this.config.config, this.llm, this, message.index || 0, isEntropyTriggered);
                        if (didReflect) {
                            this._narrativeEntropy = 0;
                            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 💡 触发反思提炼（${isEntropyTriggered ? '惊奇度自适应' : '周期节流'}）`);
                        }
                    }
                } catch (e) { errLog(e, 'onMessageReceived.反思生成'); }

                // [v2.9] RU-B: 定期记忆优化（每N楼防膨胀）
                try {
                    const oEvery = this.config.config.optimizeEveryFloors || 50;
                    if (!this._lastOptimizeFloor || (message.index || 0) - this._lastOptimizeFloor >= oEvery) {
                        this._lastOptimizeFloor = message.index || 0;
                        if (this.config.config.maintenancePipelineEnabled === true) {
                            // [v3.106] 维护流水线模式（engram 缝合）：归档+优化+分诊编排为单次可诊断流水线
                            this._lastOptimizeAt = Date.now();
                            try {
                                const led = await this._maintenancePipeline();
                                if (led && !led.ok && this.config.config.debugMode) {
                                    console.warn(`[${PLUGIN_NAME}] ⚠️ 维护流水线未完成:`, led.error?.message || '(未知)');
                                }
                            } catch (e) { errLog(e, 'onMessageReceived.维护流水线'); }
                        } else {
                            // 既有逐条维护路径（默认）——行为与 v3.106 之前完全一致
                            this.optimizeMemory();
                            this._lastOptimizeAt = Date.now();
                            // [v3.47] 睡眠周期：每 sleepEveryN 次提取触发一次归档遗忘
                            try {
                                this._sleepCount = (this._sleepCount || 0) + 1;
                                const sleepN = Number(this.config.config.sleepEveryN) || 10;
                                if (this._sleepCount % sleepN === 0) this.sleepCycle();
                            } catch (e) { errLog(e, 'sleepCycle.触发'); }
                        }
                    }
                } catch (e) { errLog(e, 'onMessageReceived.优化器'); }
                
                if (this.config.config.vectorEnabled) {
                    // [v3.13] 场外信号拼入向量素材（只影响检索，不进注入文本）
                const _sig = (this._thinkingSignals || []).filter(s => s.floor === message.index).map(s => (s.text.split('\n')[1] || '').slice(0, 120));
                const vectorText = `${extracted?.summary || this.summary.compressSummary(messageText, 160)}\n角色:${extracted?.characters?.join(',') || ''}${_sig.length ? '\n场外:' + _sig.join(' ') : ''}`;
                    await this.vector.addVectorAuto(vectorText, {
                        floor: message.index || 0,
                        characters: extracted?.characters || [],
                        events: extracted?.events || [],
                        summary: extracted?.summary || '',
                        timeAnchor: extracted?.time_anchor || null
                    }, this.config.config);
                }
                
                // [v1.9] P1: BM25 索引重建 + 层级摘要折叠
                // [v3.148] 语料缓存（shujuku BM25-corpus-cache）：素材指纹一致时跳过重建（断崖截断/折叠后的高频重建全免）
                if (this.config.config.bm25Enabled) {
                    try {
                        const _docs = this.summary.getActiveSummaries().map(s => ({id: 'sum_' + s.floor, text: s.text, floor: s.floor, source: 'bm25'}));
                        const _fp = _docs.map(d => d.id + ':' + hash32(d.text)).join('|');
                        if (_fp !== this.bm25._corpusFp) {
                            this.bm25.rebuild(_docs);
                            this.bm25._corpusFp = _fp;
                        }
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] BM25重建失败:`, e); }
                }
                if (this.config.config.summaryFoldEnabled) {
                    try { await this.summary.maybeFold(this.config.config, this.llm);
                            try { await this.summary.processRetryQueue?.(this.config.config, this.llm); } catch (e) { errLog(e, 'nonfatal') } } catch (e) { errLog(e, 'onMessageReceived.摘要折叠'); }
                }
                // [v3.38] 语义级休眠检测（TriviumDB 理念，防长篇跑团上下文与内存膨胀）
                try { if (this.summary?.markDormant) this.summary.markDormant(message.index || 0, 30); } catch (e) { errLog(e, 'nonfatal') }
                // [v3.25] 归档隐藏已覆盖楼层（Bakemono 共识，默认关）: 折叠成功后把 folded 旧楼设 is_hidden
                if (this.config.config.autoArchiveCovered) {
                    try { this.archiveCoveredFloors(); } catch (e) { errLog(e, 'onMessageReceived.归档隐藏'); }
                }
                // [v3.16] 世界推进触发: 每 EVERY_FLOORS 楼标记 pending，等下次生成前推演（独立于摘要折叠开关）
                try {
                    const wpEvery = Number(this.config.config.worldProgressEveryFloors || (this.worldProg?.EVERY_FLOORS || 2));
                    // [v3.19] 周期纯函数（ruby）: 位置取模替代固定锚点
                    if (this.config.config.worldProgressEnabled && wpEvery > 0 && cyclePositionFor(message.index || 0, wpEvery) === wpEvery) {
                        this.worldProg.markPending();
                    }
                } catch (e) { errLog(e, 'onMessageReceived.世界推进标记'); }

                // [v3.1] SF2: 更新聊天长度基线（供删除事件对比，防渲染切片误判）
                try { this._lastKnownChatLen = (window.SillyTavern?.getContext?.()?.chat?.length) || this._lastKnownChatLen; } catch (e) { errLog(e, 'SF2.基线更新'); }
                // [v2.2] RB: 楼层提交盖章 → 桥同步手机侧楼层状态 (幂等)
                try {
                    const rb = window.VirtualPhone?.lonshaBridge;
                    if (rb?.onFloorCommitted) rb.onFloorCommitted(message.index || 0);
                } catch (e) { errLog(e, 'onMessageReceived.RubyPhone桥'); }
                if (this.config.config.autoSave) {
                    // [v2.9] RU-C: 定期快照（每 snapshotEveryFloors 楼一份，IndexedDB 独立于 chatMetadata）
                    try {
                        const snapEvery = this.config.config.snapshotEveryFloors || 50;
                        const curFloor = message.index || 0;
                        // [v3.236.0] R4-B：闸门从「裸楼层数」改成「**按会话身份的锚点**」（缺口 2）。
                        //   修前在 B 会话里 curFloor(0) - A的锚点(400) = -400，判据不触发 ⇒
                        //   B 的快照一份都不落盘，且不报错（本仓最忌讳的静默降级形态）。
                        //   ★ 这里 **不再调 getCurrentChatId()**：外层 `const chatId = this.getCurrentChatId()`
                        //   的推导结果与它逐字相同，再取一次只会多出一个与 chatId 可能不一致的第二真源
                        //   （本仓的「同名不同源」正是要靠单一读数来避免的）。
                        const anchor = this._snapshotAnchorOf(chatId);
                        if (anchor.fresh || curFloor - anchor.floor >= snapEvery) {
                            const snapData = await this.collectExport();
                            const kept = await this.snapshots.save(chatId, curFloor, snapData);
                            if (kept) {
                                this._snapshotAnchorFloor = curFloor;
                                this._snapshotByChat.push({ at: Date.now(), chatId: chatId, floor: curFloor });
                                if (this._snapshotByChat.length > 20) this._snapshotByChat.shift();
                            }
                            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 快照已保存 (floor ${curFloor})`);
                        }
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 快照失败:`, e); }
                    // [v3.23] 定期把记忆快照嵌入 chatMetadata 供跨设备迁移（NE auto-restore）——每 20 楼一次，避免频繁写大头元数据
                    try {
                        if (!this._embedCount) this._embedCount = 0;
                        this._embedCount++;
                        if (this._embedCount >= 20) {
                            this._embedCount = 0;
                            this.embedVaultToChatMeta?.();
                        }
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 嵌入元数据失败:`, e); }
                    // [v3.130] CP: 主保存路径统一走 collectExport() 单真源（stbme 控制平面分离第一层）。
                    // 此前此处是手写键清单，已与 collectExport 漂移：缺 clock（时钟每楼不落盘）、缺游标/STM/prequel/锁定事实；
                    // 且 load 又不恢复其中若干键。此后新键只在 collectExport 登记一处，全链路自动生效。
                    // 保存地面真源：最近一次保存的时间/楼层/来源计数（诊断面板展示，随存档持久化）。
                    // [v3.138] CP-L2 持久化确认状态机：本地内存状态有已确认存档（同一 chatId 的 _confirmed 存在
                    // 且 revision 未落后）才允许覆写。恢复管线正在半途导入时、或确认状态被并发破坏时拒绝覆盖，
                    // 防止半初始化的内存态把已落地的完整记忆洗掉（stbme: 让"pending 卡住写入"结构上不可能）。
                    const _omrPayload = await this.collectExport();
                    // [v3.140] CP 确认状态机（重写 v3.138 版）：v3.138 判据方向是错的——_confirmed 为 null
                    // （恰恰是最危险的未装载态）时反而放行，且 _revision 比较在写入合流下恒真会误拒正常保存。
                    // 新判据用可观测身份：磁盘存档属于当前聊天且内存确实装载过它才允许覆写；
                    // 连续拒绝超阈则降级放行（stbme：陈旧挂起必须自动解除，不许永久卡死写入）。
                    let _savePersisted = false;   // [v3.165] 成功声称的事实来源（见下方 if/else 之后）
                    const _disk = window.SillyTavern?.getContext?.()?.chatMetadata?.extensions?.[this.storage.STORAGE_KEY];
                    const _diskOk = !_disk?.data || _disk.chatId == null || String(_disk.chatId) === String(chatId);
                    const _loadedOk = this._loadedChatId === chatId || !_disk?.data;
                    if ((!_diskOk || !_loadedOk) && this._saveDeniedCount < 5) {
                        this._saveDeniedCount++;
                        console.warn(`[${PLUGIN_NAME}] OMR 保存被确认状态机拒绝（第${this._saveDeniedCount}次）：磁盘存档=${_disk?.chatId ?? '无'} / 内存装载=${this._loadedChatId ?? '未装载'}，身份不一致不得覆写`);
                    } else {
                        if (this._saveDeniedCount >= 5) console.warn(`[${PLUGIN_NAME}] 确认状态机降级放行（已连续拒绝 ${this._saveDeniedCount} 次，允许落盘避免记忆完全不保存）`);
                        this._saveDeniedCount = 0;
                        this.recordSaveSource('realtime', message.index || 0);
                        const _rtOk = await this.storage.save(chatId, _omrPayload);
                        // [v3.166] 按结果记账：这条路径原先登记与 save 相邻但返回值被忽略，
                        //   结果上仍是「意图」而非「事实」。
                        this.recordSaveFailed('realtime', _rtOk === true, this.storage?._lastWrite?.error || '未落盘');
                        // [v3.165] 保存是否真落地：下面的成功声明必须由这个事实驱动。
                        //   此前它落在 if/else 之外，连「被确认状态机拒绝、根本没写盘」也照样报「✓ 完成」。
                        _savePersisted = true;
                    }
                }
                
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
                    this.graph.addNode({ type: 'character', name: canonical, data: { source: '[世界书]', aliases: r.aliases || [] } });
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
                            const graphCands = this.unifiedRecall.graphToCandidates(this.graph.nodes, { includeDeferred: true }, _urCarry);
                            _funnel.graphDropped = Number(_urCarry.dropped) || 0;
                            _funnel.graphGuaranteed = Number(_urCarry.guaranteedKept) || 0;
                            _funnel.graphDeferred = Number(_urCarry.deferred) || 0;
                            _funnel.graphCapFill = Number(_urCarry.capFill) || 0;
                            const _lut = String(query.text || '');
                            const _lrt = String(query.recentText || query.text || '');
                            for (const gc of graphCands) {
                                const r = window.LonShaAISelect?.scoreEntry ? window.LonShaAISelect.scoreEntry(gc, _lut + '\n' + _lrt, _lut, _lrt) : { score: 0 };
                                if ((r.score || 0) > 0 || gc._guaranteed) {
                                    const txt = (gc.content || gc._label || '').trim();
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
                                location: op.location || ''
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
                                        if (!exist) this.graph.addNode({type: 'character', name: canonical, data: {source: msg.mes}});
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
                                        const hasAny = keys.some(k => extracted.protagonist[k] !== undefined && extracted.protagonist[k] !== null && String(extracted.protagonist[k]).trim() !== '');
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

        // [v2.9] RU-B: 记忆优化器（抄 shujuku optimization——防长对话记忆无限膨胀）
        optimizeMemory() {
            // [v3.168] GC 帐本：本方法会**永久删除**数据（向量去重 / 向量硬上限 /
            //   摘要硬上限 / 孤儿物品 ops / 图谱去重），而旧实现只返回一个总数 removed，
            //   调用方一律丢弃它（两处调用点都是裸调）——「鲸鱼了哪些东西」完全不可查。
            //   本版把分路删除数归入账本与 opLog。
            const _gcLedger = { vecDup: 0, vecCap: 0, sumCap: 0, orphanOps: 0, graphDup: 0 };
            this._lastGcLedger = _gcLedger;
            let removed = 0;
            // 1. 向量文本级去重（完全相同文本只留最新）
            const seen = new Map();
            for (const v of this.vector.vectors) {
                const key = String(v.text || '').trim();
                if (!key) continue;
                const prev = seen.get(key);
                if (prev && prev.timestamp <= v.timestamp) { prev._dup = true; seen.set(key, v); }
                else if (prev) { v._dup = true; }
                else seen.set(key, v);
            }
            const beforeDup = this.vector.vectors.length;
            this.vector.vectors = this.vector.vectors.filter(v => !v._dup);
            removed += beforeDup - this.vector.vectors.length;
            _gcLedger.vecDup = beforeDup - this.vector.vectors.length;
            // 2. 向量硬上限（超限按遗忘价值淘汰）
            const vMax = this.config.config.vectorMaxCount || 500;
            if (this.vector.vectors.length > vMax) {
                // [v3.1] SF3: 遗忘价值淘汰（importance/10 × recency × (1+accessFreq)，淘汰没人在乎的而非最老的）
                const now = Date.now();
                const rv = (v) => {
                    const ageH = Math.max(0.5, (now - (v.timestamp || now)) / 3600000);
                    const recency = 1 / (1 + Math.log10(1 + ageH));
                    const accessFreq = (v.accessCount || 0) / Math.max(1, ageH / 24);
                    return ((v.importance || 5) / 10) * recency * (1 + accessFreq);
                };
                this.vector.vectors.sort((a, b) => rv(a) - rv(b));
                const cut = this.vector.vectors.length - vMax;
                this.vector.vectors = this.vector.vectors.slice(cut);
                removed += cut;
                _gcLedger.vecCap = cut;
            }
            // 3. 摘要硬上限（已折叠的最旧条目物理删除；maybeFold 负责合并，这里兜底）
            const sMax = this.config.config.summaryMaxCount || 400;
            const sums = this.summary.summaries;
            if (sums.length > sMax) {
                const foldedOld = sums.filter(s => s.folded);
                const foldable = Math.min(sums.length - sMax, foldedOld.length);
                if (foldable > 0) {
                    const removeIds = new Set(foldedOld.slice(0, foldable).map(s => s.floor));
                    this.summary.summaries = sums.filter(s => !removeIds.has(s.floor));
                    removed += foldable;
                    _gcLedger.sumCap = foldable;
                }
            }
            // 3b. [v3.8] 孤儿物资 ops 清理（v3.8 多变体保留后的必要对账：fp 不在该楼任何 swipe 取值中的 ops 是彻底废除的变体）
            try {
                const chat = window.SillyTavern?.getContext?.()?.chat;
                if (Array.isArray(chat) && this.itemOps?.length) {
                    const floorFps = new Map();   // floor → Set(该楼所有 swipe 文本的 fp)
                    chat.forEach((m, i) => {
                        const set = new Set();
                        set.add(msgFpOf(m));
                        if (Array.isArray(m?.swipes)) {
                            for (let sw = 0; sw < m.swipes.length; sw++) {
                                if (typeof m.swipes[sw] === 'string') {
                                    set.add([(m?.is_user === true || m?.role === 'user') ? 'u' : 'a', sw, hash32(m.swipes[sw]), String(m?.send_date || m?.extra?.send_date || '')].join('|'));
                                }
                            }
                        }
                        floorFps.set(i, set);
                    });
                    const beforeOps = this.itemOps.length;
                    this.itemOps = this.itemOps.filter(o => {
                        if (!o || typeof o !== 'object') return false;
                        if (o.carried === true || !o.fp) return true;   // carried/旧档保留
                        const set = floorFps.get(o.floor);
                        if (!set) return Math.floor(Number(o.floor) || 0) < chat.length;   // 越界清（楼层不存在）；界限内保（pending）
                        return set.has(o.fp);
                    });
                    const opGone = beforeOps - this.itemOps.length;
                    if (opGone > 0) { removed += opGone; _gcLedger.orphanOps = opGone; this.rebuildItems(); }

                }
            } catch (e) { errLog(e, 'HS.孤儿ops清理'); }
            // 4. [v3.6] 图谱重复角色节点合并（兜底：对历史已膨胀的图谱——同归一化名只留最早一个，迁移边）
            try {
                const byName = new Map();
                const dupIds = [];
                for (const node of Array.from(this.graph.nodes.values())) {
                    if (node.type !== 'character' || !node.name) continue;
                    const nk = normalizeCharName(node.name);
                    const prev = byName.get(nk);
                    if (!prev) { byName.set(nk, node); continue; }
                    // 保留更早创建的，另一个标记合并
                    const [keep, drop] = (prev.timestamp || 0) <= (node.timestamp || 0) ? [prev, node] : [node, prev];
                    byName.set(nk, keep);
                    dupIds.push({ keepId: keep.id, dropId: drop.id });
                }
                for (const { keepId, dropId } of dupIds) {
                    // 迁移边: 指向 drop 的边重定向到 keep（去重后 addEdge 复合 id 天然去重）
                    for (const [eid, e] of Array.from(this.graph.edges)) {
                        if (e.from === dropId || e.to === dropId) {
                            this.graph.edges.delete(eid);
                            const newFrom = e.from === dropId ? keepId : e.from;
                            const newTo = e.to === dropId ? keepId : e.to;
                            if (newFrom !== newTo) this.graph.edges.set(`${newFrom}-${newTo}-${e.label || 'related'}`, {...e, from: newFrom, to: newTo, id: `${newFrom}-${newTo}-${e.label || 'related'}`});
                        }
                    }
                    this.graph.nodes.delete(dropId);
                    removed++;
                }
                _gcLedger.graphDup = dupIds.length;
                if (dupIds.length) this.graph.rebuildNameIndex();
                if (dupIds.length && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 图谱去重: 合并 ${dupIds.length} 个重复角色节点`);
                // [v3.173] 缝合模块接线面：dependency-closure.js 缝入后 70 个版本无人调用
                //   （v3.163 账本「已挂载但零消费」）。接线点选在**图谱去重之后**：
                //   去重会删节点、迁移边，而「边指向一个已不存在的节点」正是幽灵边的来源。
                //   本处只做闭包归因（丢弃根因分类），不删不改任何边 —— 行为零变化。
                try {
                    const _dc = _moduleLib(() => window.LonShaDependencyClosure, 'dependency-closure.js');
                    if (_dc && typeof _dc.computeCascade === 'function') {
                        const _ids = new Set();
                        for (const _nid of this.graph.nodes.keys()) _ids.add(String(_nid));
                        const _adj = new Map();
                        for (const _nid of _ids) _adj.set(_nid, new Set());
                        for (const _e of this.graph.edges.values()) {
                            const _f = String(_e && _e.from || ''), _t = String(_e && _e.to || '');
                            if (!_ids.has(_f)) continue;
                            _adj.get(_f).add(_t);
                        }
                        const _items = [];
                        for (const _nid of _ids) _items.push({ id: _nid, refs: [], deps: [..._adj.get(_nid)] });
                        const _carry = {};
                        const _res = _dc.computeCascade({ items: _items, allowedRefs: null }, _carry);
                        const _r = _carry.cascade || {};
                        this._graphDedupCascade = {
                            nodes: _ids.size, edges: this.graph.edges.size,
                            ghostNodes: _r.dropped || 0, danglingDeps: _r.danglingDeps || 0,
                            byReason: _r.byReason || {}, merged: dupIds.length, kept: _res.keptIds.length,
                        };
                    }
                } catch (e) { errLog(e, 'V3173.dependencyClosure'); }
            } catch (e) { errLog(e, 'GD.图谱去重'); }
            // [v3.168] GC 账本落 opLog（可追溯）+ 脏链路（物品真源变更后派生层重建）
            try {
                // [v3.168] OpLog 的真实 API 是 log(type, op, ref, floor, meta)；
                //   本版初稿曾误写成不存在的 push()，会让回收账本无声丢失——
                //   正是本版要声讨的那种失败。此处按现行埋点惯例（type/op/ref/floor/meta）落账。
                if (removed) {
                    // [v3.169] 账本自述面：meta 上限 80 字符，而这里拼的是「键=值」串。
                    //   累计量长到一定位数后尾巴会被切成半截键（`graphD` / `orphanO`），
                    //   字符串从此不可解析——账本记下了回收量，却把回收量的**结构**污染了。
                    //   超限时改用紧凑键：宁可少几个字节，也不产出半截键。
                    const _gcFull = ['vecDup=' + _gcLedger.vecDup, 'vecCap=' + _gcLedger.vecCap,
                        'sumCap=' + _gcLedger.sumCap, 'orphanOps=' + _gcLedger.orphanOps,
                        'graphDup=' + _gcLedger.graphDup].join(' ');
                    const _gcm = _gcFull.length <= 80 ? _gcFull
                        : ['vd=' + _gcLedger.vecDup, 'vc=' + _gcLedger.vecCap, 'sc=' + _gcLedger.sumCap,
                            'oo=' + _gcLedger.orphanOps, 'gd=' + _gcLedger.graphDup].join(' ');
                    this.opLog?.log('gc', 'remove', removed + ' items', this._currentFloor ?? null, _gcm);
                }
            } catch (e) { errLog(e, 'nonfatal') }
            if (removed && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 记忆优化: 清理 ${removed} 条冗余`);
            return removed;
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
            const results = {summary: [], graph: [], diary: [], vector: [], diffusion: [], pov: [], timeline: [], bm25: [], volume: [], status: [], holiday: [], suspense: [], presence: [], neuralChain: [], worldProg: []};
            // [v3.149] 卷摘要 intact 对账（柏宝书 #13 缝入）：折叠区下楼层被 swipe/编辑后卷摘要嵌失效叙事——召回前先校验并降级展开（零 LLM 调用纯机制自愈）
            try { if (this.config.config.volumeIntegrityGuard !== false && this.summary?.verifyVolumesIntact) this.summary.verifyVolumesIntact(this.config.config); } catch (e) { errLog(e, 'recallMemory.卷摘要对账'); }
            results.summary = this.summary.search(query.text);
            // [v3.183] 分支感知召回过滤（Branch-aware recall filter，Liyuan onCurrentBranch 的 LonSha 映射）：
            //   LonSha 没有会话树，「废弃分支」在这里表现为**摘要的来源楼层显示页已被翻掉**——
            //   摘要仍在索引里（它是按文本进的库），于是旧分支叙事会和当前分支一起被注入。
            //   Liyuan 源码注释记载了这个代价：13 次重 roll 中第 5、10 拍入库，第 11 拍起开始写「承接上一拍」。
            //   **只剔除 source_changed**（来源楼还在、但显示页已非当初那一页），其余一律保留：
            //     · no_provenance / malformed —— 判不了（旧档、结构异常）→ 放行，宁可多注入也别丢记忆；
            //     · source_missing —— 删楼与楼层前移不可区分，前移时丢掉就是真丢；
            //     · text_drift     —— 正文被就地改过，那是有意为之。
            //   纪律：过滤漏一点，好过让用户的记忆整体消失（与 branch-guard「判不了就放行」同源）。
            try {
                if (this.config.config.recallProvenanceFilter !== false) {
                    const PV = _summaryProvenanceLib();
                    if (PV && typeof PV.filterForRecall === 'function' && Array.isArray(results.summary) && results.summary.length) {
                        const _chat = (window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext() || {}).chat || [];
                        // 判据本体在 summary-provenance.js（纯函数、可单测）；此处只负责取数与留痕。
                        const r = PV.filterForRecall(results.summary, _chat);
                        results.summary = r.kept;
                        const _st = this._provRecallFilter = this._provRecallFilter || {
                            rounds: 0, checked: 0, dropped: 0, keptLegacy: 0, keptMissing: 0, keptDrift: 0, moduleMissing: 0, lastDropped: [],
                        };
                        _st.rounds++;
                        _st.checked += Number(r.counts.checked) || 0;
                        _st.dropped += Number(r.counts.dropped) || 0;
                        _st.keptLegacy += Number(r.counts.keptLegacy) || 0;
                        _st.keptMissing += Number(r.counts.keptMissing) || 0;
                        _st.keptDrift += Number(r.counts.keptDrift) || 0;
                        _st.lastDropped = (r.dropped || []).slice(0, 20);
                        if (r.dropped && r.dropped.length && this.config.config.debugMode) {
                            console.log(`[${PLUGIN_NAME}] 来源过滤: ${r.dropped.length} 条旧分支摘要未注入（第${r.dropped.map(d => d.floor).join('、')}楼）`);
                        }
                    } else if (!PV) {
                        this._provRecallFilter = this._provRecallFilter || { rounds: 0, checked: 0, dropped: 0, keptLegacy: 0, keptMissing: 0, keptDrift: 0, moduleMissing: 0, lastDropped: [] };
                        this._provRecallFilter.moduleMissing++;
                    }
                }
            } catch (e) { errLog(e, 'recallMemory.来源过滤'); }

            
            // [v1.5] 登场角色捕获（抄 HCDiary）：从最近楼层窗口判断谁登场，只召回这些角色的记忆
            const castCaptured = this.captureCast();
            if (castCaptured.length > 0) query.characters = castCaptured;
            
            if (query.characters?.length > 0) {
                results.graph = this.graph.findByNames(query.characters);
                results.diary = this.diary.search(query.characters);

                // [v3.37/v3.38] 时态知识图谱（Temporal Graph, Zep 理念）：支持角色名与节点ID双向匹配
                try {
                    const isHistorical = /当年|曾经|以前|旧怨|旧事|过去|往事|回忆|最初/i.test(query.text || '');
                    const charMatchKeys = new Set();
                    (query.characters || []).forEach(c => {
                        charMatchKeys.add(c);
                        charMatchKeys.add(normalizeCharName(c));
                    });
                    (results.graph || []).forEach(n => {
                        if (n.id) charMatchKeys.add(n.id);
                        if (n.name) {
                            charMatchKeys.add(n.name);
                            charMatchKeys.add(normalizeCharName(n.name));
                        }
                    });
                    const relEdges = [];
                    // [v3.91] 审计修复：config.temporalGraphEnabled 此前全项目零引用（历史边追溯恒开）。
                    //         关闭时只召回 active 边，不回溯 validTo 已闭合的历史关系。
                    const _temporalOn = this.config.config.temporalGraphEnabled !== false;
                    for (const edge of this.graph.edges.values()) {
                        const hitFrom = charMatchKeys.has(edge.from) || charMatchKeys.has(normalizeCharName(edge.from));
                        const hitTo = charMatchKeys.has(edge.to) || charMatchKeys.has(normalizeCharName(edge.to));
                        if (hitFrom || hitTo) {
                            if (edge.active !== false) {
                                relEdges.push(edge);
                            } else if (_temporalOn && isHistorical && (edge.validTo != null || edge.active === false)) {
                                relEdges.push({ ...edge, historical: true });
                            }
                        }
                    }
                    if (relEdges.length) {
                        results.relations = relEdges.slice(0, 6);
                    }
                } catch (e) { errLog(e, 'recallMemory.时态关系'); }

                // [v3.28] 记忆树路由召回（st-memory-wizzard 本地轻量版，无需第二模型）
                try {
                    if (this.config.config.memoryTreeEnabled && this.graph?.nodes?.size) {
                        const treePaths = [];
                        for (const ch of query.characters.slice(0, 4)) {
                            const node = this.graph.findCharacterByName(ch);
                            if (!node) continue;
                            const neighborNames = new Set();
                            for (const edge of this.graph.edges.values()) {
                                if (edge.from === node.id) neighborNames.add(this.graph.nodes.get(edge.to)?.name);
                                else if (edge.to === node.id) neighborNames.add(this.graph.nodes.get(edge.from)?.name);
                            }
                            for (const nn of neighborNames) {
                                if (!nn || nn === ch) continue;
                                const nm = this.graph.findCharacterByName(nn);
                                if (nm?.data?.description) {
                                    treePaths.push({ id: 'tree_' + node.id + '_' + nm.id, text: `${ch} → ${nn}：${String(nm.data.description).slice(0, 80)}`, source: 'memoryTree', character: ch });
                                }
                            }
                        }
                        if (treePaths.length) {
                            const exists = new Set((results.graph || []).map(g => g.id || g.name || g.node?.id));
                            results.graph = [...(results.graph || []), ...treePaths.filter(t => !exists.has(t.id))].slice(0, this.config.config.vectorTopK * 2 + 4);
                        }
                    }
                } catch (e) { errLog(e, 'recallMemory.记忆树路由'); }

                // [v3.16] 神经链召回（抄 zhino）
                try {
                    if (this.config.config.neuralChainEnabled && query.characters.length > 0) {
                        const userQuery = `${query.text || ''}`;
                        const chain1 = query.characters.slice(0, 3).map(c => {
                            const mems = (this.charMem?.search ? this.charMem.search(c, userQuery) : []);
                            return mems.map(m => ({ id: 'c1_' + c + '_' + m.id, text: `${c}：${m.text}`, source: 'neuralChain', chain: 1, character: c }));
                        }).flat().slice(0, 6);
                        const seenC1 = new Set(chain1.map(x => x.text));
                        const chain2 = [];
                        for (let i = 0; i < query.characters.length; i++) {
                            for (let j = i + 1; j < query.characters.length; j++) {
                                const a = query.characters[i], b = query.characters[j];
                                for (const mem of (this.charMem?.search ? [...this.charMem.search(a, b), ...this.charMem.search(b, a)] : [])) {
                                    const text = `${a}↔${b}：${mem.text}`;
                                    if (!seenC1.has(text)) chain2.push({ id: 'c2_' + mem.id, text, source: 'neuralChain', chain: 2 });
                                }
                            }
                        }
                        results.neuralChain = [...chain1, ...chain2].slice(0, 8);
                    }
                } catch (e) { errLog(e, 'recallMemory.神经链'); }
            }

            // [v1.9] P1: BM25 稀疏检索召回（提前执行，为 HippoRAG 准备文本实体输入）
            // [v3.86] 吸收 MyriadKnots：有分支查询时走 searchBranches 多路归一化（主查询降权为 0.3 锚点），
            // 防长背景文本绝对分淹没最新用户输入；无分支时主查询 weight=1 行为等价旧版
            if (this.config.config.bm25Enabled && this.bm25.N && query.text) {
                try {
                    const bmTopK = Math.round((this.config.config.bm25TopK || 5) * this.computeRecallQuota());
                    const branchSet = [{ key: 'main', text: query.text, weight: 0.3 }];
                    if (Array.isArray(query.branches) && query.branches.length) {
                        for (const b of query.branches) branchSet.push({ key: b.key, text: b.text, weight: Number(b.weight) || 0 });
                    }
                    results.bm25 = this.bm25.searchBranches(branchSet, bmTopK, {cliffCut: true, minResults: 2, aliasMap: query.aliases})
                        .map(d => ({id: d.id, text: d.text, floor: d.floor, score: d.score, branchScores: d.branchScores, source: 'bm25'}));
                    if (this.config.config.heatOnRecallEnabled) {
                        for (const b of results.bm25) { try { this.vector.heatByText(b.text); } catch (e) { errLog(e, 'nonfatal') } }
                    }
                    if (Array.isArray(query.queries) && query.queries.length) {
                        const seenB = new Set(results.bm25.map(x => x.id));
                        for (const q2 of query.queries) {
                            for (const d of this.bm25.search(q2, 3)) {
                                if (!seenB.has(d.id)) { seenB.add(d.id); results.bm25.push({id: d.id, text: d.text, floor: d.floor, score: d.score, source: 'bm25'}); }
                            }
                        }
                    }
                } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] BM25检索失败:`, e); }
            }

            // [v2.8] RT-C: 物品台账召回（提前执行，为 HippoRAG 提取道具实体输入）
            // [v3.44] 吸收 baibai: 物品物理可达性与随身/寄存解耦（Carried vs Location 互斥）
            if (this.config.config.itemLedgerEnabled && this.itemOps?.length) {
                const cast = this.captureCast();
                const qText = query.text || '';
                let currentGeo = '';
                try {
                    const charState = window.LonShaMemory?.engine?.characterState;
                    if (charState?.getGeoLocation) {
                        const geo = charState.getGeoLocation();
                        currentGeo = `${geo.majorArea || ''} ${geo.minorArea || ''} ${geo.detailLocation || ''}`.trim().toLowerCase();
                    }
                } catch (e) { errLog(e, 'nonfatal') }

                const relevant = this.items.records.filter(r => {
                    const isRemoved = r.state && (r.state === '丢失' || r.state === '损毁' || r.state === '已消耗' || r.state === '丢弃');
                    if (isRemoved) return qText && qText.includes(r.name);
                    return cast.some(c => (r.holder || '').includes(c)) || (qText && qText.includes(r.name));
                }).slice(-8);

                if (relevant.length) {
                    const accessible = [];
                    const stored = [];
                    for (const r of relevant) {
                        const isCarried = (r.carried === true || (!r.location && r.carried !== false));
                        if (isCarried) {
                            accessible.push({
                                name: r.name,
                                text: `${r.name}（随身·${r.holder || '无主'}持有，${r.state || '完好'}）${r.desc ? '：' + r.desc : ''}`,
                                source: 'items'
                            });
                        } else {
                            const loc = (r.location || '').trim();
                            const locLower = loc.toLowerCase();
                            const isNearby = locLower && currentGeo && (currentGeo.includes(locLower) || locLower.includes(currentGeo));
                            if (isNearby) {
                                accessible.push({
                                    name: r.name,
                                    text: `${r.name}（在场·存放于${loc}，${r.state || '完好'}）${r.desc ? '：' + r.desc : ''}`,
                                    source: 'items'
                                });
                            } else {
                                stored.push({
                                    name: r.name,
                                    text: `${r.name}（存放于${loc || '他处'}，${r.holder || '无主'}持有）`,
                                    source: 'items_stored'
                                });
                            }
                        }
                    }
                    results.items = accessible;
                    if (stored.length) results.itemsStored = stored;
                }
            }

            // Phase 3: 图扩散增强召回（HippoRAG 实体引燃在此顺利读取 BM25 与 items）
            if (this.config.config.graphDiffusionEnabled && window.LonShaMemory?.diffusion) {
                try {
                    let seedNodes = [...(results.graph || [])];
                    if (this.config.config.hippoDiffusionEnabled !== false) {
                        // [v3.37/v3.38] HippoRAG 双路引燃扩散：BM25 文本 + 活跃物品联合识别种子节点
                        const entityCandidates = new Set();
                        (results.bm25 || []).slice(0, 5).forEach(b => {
                            if (b.text) {
                                const matched = this.graph.findNodesMentionedIn(b.text);
                                for (const node of matched) entityCandidates.add(node);
                            }
                        });
                        (results.items || []).slice(0, 3).forEach(it => {
                            const raw = it.name || it.text || '';
                            if (raw) {
                                const matched = this.graph.findNodesMentionedIn(raw);
                                for (const node of matched) entityCandidates.add(node);
                            }
                        });
                        for (const cand of entityCandidates) {
                            if (!seedNodes.some(s => s.id === cand.id)) seedNodes.push(cand);
                        }
                    }
                    seedNodes = seedNodes.slice(0, 5);
                    if (seedNodes.length > 0) {
                        for (const [k, v] of this._diffusionFatigue) {
                            if (v <= 1) this._diffusionFatigue.delete(k);
                            else this._diffusionFatigue.set(k, v - 1);
                        }
                        const diffusionResults = window.LonShaMemory.diffusion.personalizedPageRank(
                            seedNodes, 
                            3, 
                            this.config.config.vectorTopK,
                            this.config.config.pageRankDamping   // [v3.91] 审计修复：此前该配置全项目零引用，扩散阻尼恒为库内硬编码 0.85
                        );
                        const fatigue = this._diffusionFatigue;
                        const suppressed = [];
                        for (const r of diffusionResults) {
                            const nid = this._nodeIdentity(r);
                            if (nid && fatigue.has(nid)) {
                                suppressed.push({ ...r, score: (r.score || 0) * 0.15 });
                                fatigue.delete(nid);
                            } else {
                                suppressed.push(r);
                            }
                        }
                        const diverseResults = window.LonShaMemory.diffusion.diversitySampling(
                            suppressed,
                            Math.min(5, suppressed.length),
                            this.config.config.dppLambda
                        );
                        results.diffusion = diverseResults.map(r => ({
                            ...r.node,
                            score: r.score,
                            source: 'diffusion'
                        }));
                        for (const r of results.diffusion.slice(0, this._diffusionFatigueTopN)) {
                            const nid = this._nodeIdentity({ node: r });
                            if (nid) this._diffusionFatigue.set(nid, this._diffusionFatigueTimeout);
                        }
                        if (this.config.config.debugMode) {
                            console.log(`[${PLUGIN_NAME}] 图扩散召回: ${results.diffusion.length}条`);
                        }
                    }
                } catch (err) {
                    console.warn(`[${PLUGIN_NAME}] 图扩散失败:`, err);
                }
            }
            
            // [v2.4] RE: 多查询召回——主查询 + rewriteQuery 改写的查询分别检索
            if (this.config.config.vectorEnabled && query.text) {
                const vectorResults = await this.vector.search(query.text, Math.round(this.config.config.vectorTopK * this.computeRecallQuota()));
                results.vector = vectorResults.map(v => ({
                    text: v.text,
                    score: v.score,
                    metadata: v.metadata,
                    source: 'vector'
                }));
                if (Array.isArray(query.queries) && query.queries.length) {
                    for (const q2 of query.queries) {
                        try {
                            const more = await this.vector.search(q2, 3);
                            for (const v of more) results.vector.push({text: v.text, score: v.score * 0.9, metadata: v.metadata, source: 'vector'});
                        } catch (e) { errLog(e, 'recallMemory.向量重试'); }
                    }
                }
            }

            // [v3.111] 掉队候选补召回（缝合 bionic collectVectorTailCandidates）：
            //   向量库里有相当一部分条目因「无向量 / 零向量 / 维度不符」永远进不了向量检索的候选池
            //   ——它们不是不重要，只是检索通道坏了。默认关；开启后把这些掉队条目以低分补进候选池，
            //   让 BM25/图谱与预算裁剪照常决定留不留，避免「记忆在库里却怎么都召不回」。
            if (this.config.config.vectorTailRecoveryEnabled === true && this.vector?.vectors?.length) {
                try {
                    const ra = (typeof window !== 'undefined' ? window.LonShaRetrievalAudit : null)
                        || (typeof require !== 'undefined' ? (() => { try { return require('./retrieval-audit.js'); } catch { return null; } })() : null);
                    if (ra && Array.isArray(results.vector)) {
                        const tail = ra.planVectorTail(this.vector.vectors, {
                            expectedDimension: Number(this.vector.dimension) || 0,
                            limit: numOr(this.config.config.vectorTailRecoveryLimit, 8),   // [v3.156] 0=不补召回（planVectorTail 内部对 0 走 normInt 下限，语义为「不通知候选」）
                            includeReasons: ['missing-embedding', 'zero-vector', 'dimension-mismatch'],
                        });
                        let added = 0;
                        const existing = new Set(results.vector.map(v => String(v.text || '').trim()));
                        for (const cand of tail.candidates) {
                            const text = String(cand.text || '').trim();
                            if (!text || existing.has(text)) continue;
                            existing.add(text);
                            results.vector.push({ text, score: 0.3, source: 'vector:tail', metadata: { floor: cand.floor, reasons: cand.reasons } });
                            added++;
                        }
                        if (added && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] [v3.111] 掉队候选补召回 ${added} 条（累计 ${tail.flaggedTotal} 条有问题）`);
                    }
                } catch (e) { errLog(e, 'recallMemory.掉队候选补召回'); }
            }
            // [v1.9] P1: 卷摘要召回（已折叠的高层概括）
            if (this.config.config.summaryFoldEnabled && this.summary.volumes.length) {
                results.volume = this.summary.searchVolumes(2)
                    .map(v => ({id: v.id, text: `【卷${v.floorStart}-${v.floorEnd}】${v.text}`, floor: v.floorStart, source: 'volume'}));
            }
            
            // [v2.1] P3: 节日感知召回
            if (this.config.config.holidayAware) {
                try {
                    const sd = this.getLatestStoryDate();
                    const h = sd ? this.holiday.current(sd) : null;
                    if (h) {
                        const kw = this.holiday.keywords(h.name);
                        const kwHits = [];
                        if (kw.length) {
                            for (const s of this.summary.getActiveSummaries()) {
                                if (kw.some(k => s.text.includes(k))) kwHits.push({id: 'hol_' + s.floor, text: s.text, floor: s.floor, holiday: h.name, source: 'holiday'});
                            }
                            results.holiday = kwHits.slice(0, 3);
                        }
                        if (this.config.config.debugMode && h) console.log(`[${PLUGIN_NAME}] 🎉 节日感知: ${h.name} (偏移${h.offsetDays}天)`);
                    }
                } catch (e) { errLog(e, 'recallMemory.节日感知'); }
            }
            
            // [v2.0] P2: 角色状态召回
            if (this.config.config.characterStateEnabled && Object.keys(this.status.characters || {}).length) {
                const presentCast = this.captureCast();
                const owners = presentCast.length ? presentCast : (window.SillyTavern?.getContext?.()?.name2 ? [window.SillyTavern.getContext().name2] : []);
                if (owners.length) {
                    const _ageOpts = {
                        now: this.clock?.date || this.getLatestStoryDate?.() || '',
                        calcAge: (a, b) => this.clock?.calcAge?.(a, b),
                        parseFn: (s) => this.clock?.parseStoryDate?.(s)
                    };
                    results.status = this.status.searchByNames(owners, 5).map(r => ({
                        name: r.name, fields: r.fields, todos: r.todos,
                        // [v3.180] 年龄随状态条目一起外供（三态读数）；未记年龄的角色为空串，不占位。
                        age: this.status.ageReading(r.name, _ageOpts),
                        source: 'status'
                    }));
                }
            }
            
            // [v1.8] P0: 剧情时间线召回
            if (this.config.config.plotTimeline && this.timeline.entries.length) {
                const anchorDate = this.getLatestStoryDate();
                const tcQuery = parseStoryTimeConstraint(query.text);
                let timelinePool = this.timeline.entries;
                if (tcQuery) {
                    const filteredTl = filterTimelineByConstraint(this.timeline.entries, tcQuery);
                    if (filteredTl.length > 0) timelinePool = filteredTl;
                }
                if ((tcQuery ? timelinePool.length > 0 : anchorDate)) {
                    const relOn = this.config.config.relativeTime !== false;
                    const tlSource = tcQuery
                        ? [...timelinePool].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5)
                        : this.timeline.searchNear(anchorDate, this.config.config.timelineWindowDays, 5);
                    results.timeline = tlSource
                        .map(e => {
                            let rel = '';
                            if (relOn) {
                                try { rel = relativePrefix(e.date, anchorDate); } catch (err) { rel = ''; }
                            }
                            return {id: e.id, text: `[${rel ? rel + '·' : ''}${e.date}] ${e.text}`, date: e.date, floor: e.floor, source: 'timeline', importance: e.importance || 5};
                        });
                }
            }

            // [v2.8] RT-B: 反思召回（重要度 Top-2）
            if (this.config.config.reflectionEnabled && this.reflection?.items?.length) {
                results.reflections = this.reflection.search(2).map(r => ({ text: `洞察：${r.insight}${r.suggestion ? '（提示：' + r.suggestion + '）' : ''}`, source: 'reflection' }));
            }

            // [v1.7] RubyPhone 联动②: 手机记忆库作为一路召回源
            // [v3.48] P0 桥修复: queryPhoneMemory 是 v1.7 时代写错的方法名（bridge 只有 recall），守卫开关 rubyPhoneSync 也不存在（配置叫 rubyPhoneRecall）——三处断线导致手机召回通道从未生效
            if (this.config.config.rubyPhoneRecall && window.VirtualPhone?.lonshaBridge) {
                try {
                    const _phoneQuery = window.VirtualPhone.lonshaBridge.queryPhoneMemory || window.VirtualPhone.lonshaBridge.recall.bind(window.VirtualPhone.lonshaBridge);
                    const phoneHits = await _phoneQuery(query.text, numOr(this.config.config.rubyPhoneRecallTopN, 3));   // [v3.156] 0=不向手机库取记忆
                    if (phoneHits?.length) {
                        results.rubyphone = phoneHits.map((h, i) => ({
                            // [v3.48] P0 字段对齐: bridge.recall 返回 {content, score, layer, floor}，旧映射期望 h.id/h.type  恒 undefined
                            id: 'phone_' + (h.id ?? (h.floor ?? 'i') + '_' + i),
                            text: `[手机记忆·${h.layer || h.type || '生活'}] ${h.content}`,
                            source: 'rubyphone',
                            importance: h.importance || 5,
                            score: h.score || 0.5
                        }));
                    }
                } catch (e) { errLog(e, 'recallMemory.手机记忆召回'); }
            }
            
            // [v2.4] RE: 在场分档——不在场已登场角色给极简档
            // [v3.91] 审计修复：门控键原为 presenceTier（无默认值，恒 undefined 导致功能死锁关闭），
            //         与 config/UI 声明的 presenceInjection 键名断裂。统一到 presenceInjection。
            if (this.config.config.presenceInjection !== false) {
                const present = new Set(this.captureCast());
                const allKnown = this.getKnownCharacters();
                const absent = allKnown.filter(c => !present.has(c));
                if (absent.length) {
                    // [v3.91] 该路此前因键名断裂从未生效；启用后加候选上限，防角色库膨胀时单路灌满 RRF 融合池
                    const cap = Math.max(1, Number(this.config.config.presenceMaxCandidates) || 8);
                    results.presence = absent.slice(0, cap).map(a => ({
                        character: a, text: `${a}（当前不在场）`, source: 'presence'
                    }));
                }
            }
            
            // [v2.2] RC: 悬念簿召回
            if (this.config.config.suspenseEnabled && this.suspense.items.length) {
                const openList = this.suspense.openItems().slice(-3)
                    .map(x => ({ id: 'sus_' + x.id, text: `【待解决·悬念】${x.content}${x.createdTime ? ' (' + x.createdTime + ')' : ''}`, source: 'suspense', status: 'open' }));
                const resolvedList = this.suspense.recentlyResolved(2)
                    .map(x => ({ id: 'sus_res_' + x.id, text: `【近期了结】${x.content} → ${x.resolution || '已解决'}`, source: 'suspense', status: x.status }));
                results.suspense = openList.concat(resolvedList);
            }
            
            // [v1.8] P0: POV 私密记忆召回
            if (this.config.config.povIsolation && this.pov.povs.length) {
                const present = this.captureCast();
                const owners = present.length ? present : (window.SillyTavern?.getContext?.()?.name2 ? [window.SillyTavern.getContext().name2] : []);
                if (owners.length) {
                    results.pov = this.pov.search(owners, this.config.config.povMaxPerTurn || 3)
                        .map(p => ({id: p.id, owner: p.owner, text: p.content, floor: p.floor, source: 'pov'}));
                }
            }
            
            // [v3.30] PV: superseded 摘要排除
            if (window.LonShaSupersede && this.config.config.supersedeEnabled && results.summary?.length) {
                try {
                    results.summary = results.summary.filter(item => {
                        const key = item.id || (item.source === 'summary' ? 'sum_' + item.floor : null);
                        return !(key && this.supersede.isSuperseded(key));
                    })
                    .filter(i => !(i?.source === 'summary' && i?.archivedForSleep));  // [v3.47] 睡眠归档：低价值记忆不进入召回（存档中可查）
                } catch (e) { errLog(e, 'recallMemory.supersede过滤'); }
            }

            // [v3.38] 语义级休眠伏笔唤醒检测（TriviumDB 双区记忆理念）
            try {
                if (this.summary?.awakenByEntities) {
                    const presentEntities = [...(query.characters || []), ...((results.items || []).map(i => i.name || ''))].filter(Boolean);
                    const awakened = this.summary.awakenByEntities(presentEntities);
                    if (awakened?.length) {
                        for (const aw of awakened) {
                            results.summary.push({ id: 'sum_' + aw.floor, text: `【久别重现】${aw.text}`, floor: aw.floor, source: 'summary', awakened: true });
                        }
                    }
                }
            } catch (e) { errLog(e, 'recallMemory.休眠唤醒'); }
            // [v3.234.0] 语义唤醒（与上一段实体名唤醒分工：那条管 dormant 标记、按名字逐字命中；
            //   本段管 archivedForSleep、按语义——有向量走余弦，无向量退字面共现）。两者互不顶替。
            //   纪律：plan 只算不写、apply 才翻标记；不删不重排；每条带 reason 与 score；
            //   缺库/畸形容器一律降级放行（不阻断召回主链路）。
            try {
                if (this.config.config.sleepAwakenEnabled === true) {
                    const SA = _sleepAwakenLib();
                    if (SA && typeof SA.plan === 'function' && typeof SA.apply === 'function') {
                        const _pool = (this.summary && this.summary.summaries) ? this.summary.summaries : [];
                        const _q = String(query && query.text ? query.text : '').trim();
                        let _r = null;
                        if (_pool.length && _q) {
                            _r = SA.plan({ summaries: _pool, queryText: _q });
                            if (_r && _r.ok === true && Array.isArray(_r.awakened) && _r.awakened.length) {
                                const _ap = SA.apply(_r, _pool);
                                if (_ap && _ap.applied) {
                                    for (const _id of (_ap.ids || [])) {
                                        const _s = _pool.find((x) => (x && (x.id || ('sum_' + x.floor))) === _id);
                                        if (_s && !results.summary.some((y) => y && y.floor === _s.floor && y.source === 'summary')) {
                                            results.summary.push({ id: 'sum_' + _s.floor, text: '【情景重现】' + _s.text, floor: _s.floor, source: 'summary', awakened: true });
                                        }
                                    }
                                }
                            }
                        }
                        this._sleepAwakenSt = { at: Date.now(), result: _r, described: (typeof SA.describe === 'function' ? SA.describe(_r) : '') };
                    } else {
                        this._sleepAwakenSt = { at: Date.now(), result: null, described: '模块缺席（降级放行）' };
                    }
                }
            } catch (e) { errLog(e, 'recallMemory.语义唤醒'); }
            
            // [v3.185] 条目关联的召回侧消费：按 query.text 扫同一份关联词表，命中的引用（摘要图键）
            //   在本轮落实召回时提权；开关关时**连扫描都不做**（零开销、零行为变化）。
            //   这里给的是「分值加成」而不是「换掉条目」——池子仍是原来那些条，只是名次可能前移。
            let _crosslinkBoostKeys = null;
            if (this.config.config.crosslinkRecallBoost === true && this._crosslinkIndex) {
                try {
                    if (typeof this._crosslinkIndex.refsFor === 'function' && query.text) {
                        const _refs = this._crosslinkIndex.refsFor(query.text);
                        const _keys = [];
                        for (const _r of _refs) { const _k = String(_r || ''); if (/^sum_\d+$/.test(_k)) _keys.push(_k); }
                        if (_keys.length) {
                            _crosslinkBoostKeys = new Set(_keys);
                            this._crosslinkRefRanked = Number(this._crosslinkRefRanked || 0) + 1;
                        }
                    }
                } catch (e) { errLog(e, 'recallMemory.crosslink提权'); }
            }
            // [v2.3] RD: 两阶段精排
            const merged = this.hybridMerge(results);
            // [v3.185] 提权落点：hybridMerge 是「分数 + 排序」的唯一收口，故在它之后、rerank 之前追加小分。
            //   0.006 是「只动名次边界」的量级：不足以把一条低相关的条目抬进前排，
            //   但足以在同分/相邻名次上做出稳定区分。命中不到任何关联键时逐字节等同旧行为。
            if (_crosslinkBoostKeys && _crosslinkBoostKeys.size) {
                try {
                    for (const _it of merged) {
                        if (!_it) continue;
                        // 摘要条目的图键可能是 id / key，也可能只有 floor（任一命中即算命中）。
                        const _k1 = String(_it.id || _it.key || '');
                        const _k2 = (_it.floor == null) ? '' : ('sum_' + _it.floor);
                        if (_crosslinkBoostKeys.has(_k1) || (_k2 && _crosslinkBoostKeys.has(_k2))) {
                            _it.rrfScore = (_it.rrfScore || 0) + 0.006;
                        }
                    }
                    merged.sort((a, b) => (b.rrfScore || 0) - (a.rrfScore || 0));
                } catch (e) { errLog(e, 'recallMemory.crosslink提权落位'); }
            }
            // [v3.186] 情绪反向召回的**召回侧消费**（缝合 memory-palace EMOTION_OPPOSITES 的机制；
            //   只取机制、不取它的注入口径——该库走 CHAT_COMPLETION_PROMPT_READY 向 chat 直推
            //   system 消息，本仓沿用 setExtensionPrompt 路线，那条路线不引入）。
            //   做法与 crosslinkRecallBoost 同族：命中键加固定小分（0.006，只动名次边界），
            //   不换条目、不写图、不删边；开关关时连词表扫描都不做（零开销、零行为变化）。
            //   与 crosslink 的分工：crosslink 答「正文提到了哪个**名字**」（实体锚），
            //   本机制答「当下的情绪指向哪一段**经历**」（情绪锚）——两者互不覆盖。
            let _emoOppositeKeys = null;
            // 每轮重置：否则上一轮名单粘住，账本会把「本轮没提权」算成「提权了上轮那几条」
            this._emoOppositeMatched = null;   // null=机制没跑｜{}=跑了零提权｜{key:[dim]}=真提权
            if (this.config.config.emotionOppositeRecall === true) {
                try {
                    const EL = _emotionOppositeLib();
                    if (EL && typeof EL.recallByOppositeEmotion === 'function') {
                        const _emoDocs = (this.summary && typeof this.summary.getActiveSummaries === 'function'
                            ? this.summary.getActiveSummaries() : [])
                            .map(_s => ({
                                key: String(_s.key || _s.id || ('sum_' + (_s.floor == null ? '' : _s.floor))),
                                text: String(_s.text || '')
                            }))
                            .filter(_d => _d.key && _d.text);
                        const _er = EL.recallByOppositeEmotion({ queryText: query.text, docs: _emoDocs });
                        // [v3.200.0] 成本账本要回答「提权的那条进没进注入」。
                        //   promoted 的 key 是图键（sum_<floor>），注入文本只渲染摘要正文，
                        //   图键永不出现。这里把每条被提权摘要的正文片段带给账本，按片段匹配。
                        const _emoSnippets = {};
                        for (const _d of _emoDocs) if (_er.matched && _er.matched[_d.key]) {
                            const _snip = String(_d.text || '').trim().slice(0, 24);
                            if (_snip.length >= 4) _emoSnippets[_d.key] = _snip;
                        }
                        this._emoOppositeSnippets = _emoSnippets;
                        this._emoOppositeRead = {
                            reason: _er.reason, dominant: _er.dominant,
                            hits: (_er.opposite || []).length, scanned: _er.scanned,
                            // [v3.193.0] 成本与预算读数：本轮真提出的线索条数（hits）只是结果，
                            //   还要能回答「本来能提多少、被预算挡下多少」——否则候选膨胀看不见。
                            expanded: _er.expanded || 0, merged: _er.merged || 0, dimHits: _er.dimHits || {},
                            credibleWords: _er.credibleWords || 0, scopes: _er.scopes || {},
                            // 命中维名单（key → [dim,...]）：回答「这条为什么被提」。
                            // 成本账本靠它区分「提权了」与「提权后真进了注入」，缺了它只能报总条数。
                            matched: _er.matched || {}
                        };
                        // 「生效轮数」只在真扫过（reason==='ok'）时累加：否则「没有情绪词」也会被算成一轮，
                        // 读出来的轮数就不是「机制跑了多少轮」而是「召回跑了多少轮」。
                        if (_er.reason === 'ok') this._emoOppositeRounds = Number(this._emoOppositeRounds || 0) + 1;
                        this._emoOppositeMatched = _er.matched || {};
                        if (_er.opposite && _er.opposite.length) _emoOppositeKeys = new Set(_er.opposite);
                    } else {
                        this._emoOppositeRead = null;   // 模块缺席：不伪装成「无线索」，诊断行会报「模块未加载」
                    }
                } catch (e) { errLog(e, 'recallMemory.emotionOpposite'); }
            }
            if (_emoOppositeKeys && _emoOppositeKeys.size) {
                try {
                    for (const _it of merged) {
                        if (!_it) continue;
                        const _ek1 = String(_it.id || _it.key || '');
                        const _ek2 = (_it.floor == null) ? '' : ('sum_' + _it.floor);
                        if (_emoOppositeKeys.has(_ek1) || (_ek2 && _emoOppositeKeys.has(_ek2))) {
                            _it.rrfScore = (_it.rrfScore || 0) + 0.006;
                            this._emoOppositeBoosted = Number(this._emoOppositeBoosted || 0) + 1;
                        }
                    }
                    merged.sort((a, b) => (b.rrfScore || 0) - (a.rrfScore || 0));
                } catch (e) { errLog(e, 'recallMemory.emotionOpposite落位'); }
            }
            // [v3.48] P3: 本地意图分流重排（零 API 中间层，历史/物品/关系三路意图统一收敛）
            // [v3.185] 修：`queryText` 在此**从未声明**（它是下面 intentRerank 自己的形参名，不在本作用域）——
            //   本行此前恒抛 `ReferenceError: queryText is not defined`，被 onBeforeGeneration 外层的
            //   `catch (err) { return ''; }`（静默、零日志、无归因）吞掉 ⇒ **整轮记忆注入为空**：
            //   召回算了、图与摘要也读了，最后一步抛掉，模型收到的是空注入，而诊断面只显示「没注入」。
            //   实测（本轮）：把 recallMemory 原样取出、只注入 errLog/numOr 等自由名后真跑一次，
            //   debugMode 下稳定抛该错；把 `queryText` 也作为外部名注入桩值则不再抛。
            //   意图重排的入参就是查询文本，与 buildQuery 的既有口径一致（query.text）。
            // [v3.249.0] M-O1：重排结果**就地**落在 `finalMerged`（不另建数组），
            //   于是「收尾顺序 = 上游最后一次重排的顺序」这条语义对四条路径是同一份。
            const finalMerged = this.intentRerank(merged, query.text);
            // [v3.249.0] M-O1 唯一收尾出口：LLM 精排成功不再提前 return（原因见 CHANGELOG）
            const _finalize = () => {
                if (this.config.config.recallAuditEnabled) {
                    try {
                        const rec = this._auditRecall(query, results, finalMerged);
                        if (rec) {
                            // 坏归因时能分辨「顺序是本地重排给的」还是「LLM 精排给的」
                            rec.rerankPath = String(this._rerankPath || 'local');
                            rec.injectedIds = finalMerged.slice(0, 8).map(x => String((x && (x.id ?? x.key)) ?? '')).filter(Boolean);
                        }
                        if (rec && rec.floorHits) this._recordFloorRecall(rec.floorHits, rec.vecHeatCount ? (results.vector || []).map(v => v && v.id).filter(Boolean) : null);
                    } catch (e) { errLog(e, 'recall.auditWire'); }
                }
                return finalMerged;
            };
            // [v3.48] P3: 本地意图分流重排已在上方完成——本块只负责可选的 LLM 精排。
            // [v3.249.0] M-O1 缺口二：此前精排成功即 `return [...picked, ...restSet, ...rest]` 离场，
            //   于是本地意图重排、召回审计、楼层记账三件事在那条路径上一次都没跑
            //   （实测：精排关闭 audit=1 / record=1 / intent=1；精排成功 audit=0 / record=0 / intent=0）。
            //   现在四条路径（成功 / 关闭 / 失败 / 回空值）都经 `_finalize()` 收口：只观测与记账，
            //   不再用自己的排序覆盖精排结果（顺序由上游那一次重排定）。
            if (this.config.config.rerankEnabled && merged.length > 3 && query.text) {
                try {
                    const candN = this.config.config.rerankCandidates || 12;
                    // 精排吃掉的是**已排好序**的名单，故前 candN 名 = 本地重排后的头部（语义与修前一致，
                    //   只是顺序来源换了；修前那里吃的是未做本地重排的 hybridMerge 结果）。
                    const candidates = finalMerged.slice(0, candN);
                    const rest = finalMerged.slice(candN);
                    // [v3.148] INTENT 优先作 rerank query（baibai: 意图一句话比原始剧情文本更贴评分语义）
                    const _rq = (this.llm.getLastIntent?.() || query.text);
                    const order = await this.llm.rerank(_rq, candidates);
                    if (order && order.length) {
                        const _pickedRaw = order.map(i => candidates[i]).filter(Boolean);
                        // 去重：order 里出现重复下标时，同一个候选不得在名单里出现两次
                        //   （本版首跑实测：order=[9,1,1] 会把名单撑成 5 条且 b 重复、d 掉队）。
                        const _seen = new Set(); const picked = [];
                        for (const c of _pickedRaw) if (!_seen.has(c)) { _seen.add(c); picked.push(c); }
                        const restSet = candidates.filter((_, i) => !order.includes(i));
                        const head = picked.concat(restSet);
                        // 长度守恒：order 里若有越界/重复，缺失位按原序补齐 —— 精排只换次第、不丢条目。
                        if (head.length < candidates.length) {
                            const _in = new Set(head);
                            for (const c of candidates) if (!_in.has(c)) head.push(c);
                        }
                        finalMerged.splice(0, candidates.length, ...head);
                        void rest;   // 尾随段原地不动（不在 splice 范围内）
                        this._rerankPath = 'llm';
                        return _finalize();
                    }
                } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] rerank失败(降级):`, e); }
            }
            this._rerankPath = 'local';
            return _finalize();
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
                if (this.config?.config?.aliasQueryExpansion !== false) aliases = this.buildAliasMap();
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
                for (const node of this.graph?.nodes?.values() || []) {
                    if (node?.type !== 'character' || !node.name) continue;
                    const main = canon(node.name);
                    if (!main) continue;
                    const aliases = Array.isArray(node.data?.aliases) ? node.data.aliases : [];
                    for (const a of aliases) {
                        const key = canon(a);
                        if (!key || key === main || key.length < 2 || key.length > 20) continue;
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
        // [v3.196] 秘密账本：宿主写入入口，状态存 worldProg.secretLedger
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

        /**
         * [v3.270.0 · B2/X1] 世界书占用读数（宿主侧取数，**只读**，不注入）。
         *
         * 取数通道（本轮实测）：SillyTavern.getContext().lore 是宿主给扩展的世界书条目数组
         *   （全库仅两处真入口，另一处是 extractRolesFromLore 的角色提取）。
         *
         * ★ 口径是本方法最要紧的部分（取错就会算出一个「看着正常、实际夸大」的占用）：
         *   · chars        —— 只算 **enabled && constant===true** 的条目。理由：这局部是
         *      **无需关键词命中、每轮必进提示词**的部分，也是真正吃预算的那一类
         *      （「一堆常驻世界书把记忆预算吃光」正是本轮要治的形态）。
         *   · upperChars   —— 全库启用条目之和（**上限**）。非 constant 条目要不要进，
         *      取决于激活引擎的关键词匹配，而那个引擎在宿主/世界书扩展里，**不在本插件可观测面内**
         *      （buildInjection 对宿主最终请求体的既有自述就是「不在可观测面内 ⇒ 不可测」）。
         *      故它只作上限，**不得拿去当实际占用算挤占**。
         *   · known:false  —— 取不到（无宿主上下文 / 无 lore 通道 / 取数抛错）⇒ 占用**未知**，
         *      三个量全 null 且**不写 0**。
         *      「读不到」与「零占用」同形，会让用户看到「世界书不占空间」这种假读数。
         *
         * @returns {object} { known, reason, source, count, enabledCount, constantCount, chars, upperChars }
         */
        _worldbookOccupancy() {
            const unk = (reason) => ({ known: false, reason: reason, source: null, count: null,
                enabledCount: null, constantCount: null, chars: null, upperChars: null });
            try {
                const ctx = (typeof window !== 'undefined' && window.SillyTavern && typeof window.SillyTavern.getContext === 'function')
                    ? window.SillyTavern.getContext() : null;
                if (!ctx) return unk('no-host-context');
                const lore = ctx.lore;
                if (!Array.isArray(lore)) return unk('no-lore-channel');
                let chars = 0, upperChars = 0, enabledCount = 0, constantCount = 0;
                for (const e of lore) {
                    if (!e || e.enabled === false || e.disable === true) continue;
                    enabledCount++;
                    const c = String(e.content || '').length;
                    upperChars += c;
                    if (e.constant === true) { constantCount++; chars += c; }
                }
                return {
                    known: true, reason: 'ok', source: 'SillyTavern.getContext().lore',
                    count: lore.length, enabledCount: enabledCount, constantCount: constantCount,
                    chars: chars,           // ★ 确定进提示词的占用（enabled && constant）
                    upperChars: upperChars, // 全库启用上限（不得当实际占用）
                };
            } catch (e) { errLog(e, 'plugin._worldbookOccupancy'); return unk('threw:' + String((e && e.message) || e)); }
        }
        /**
         * [v3.270.0 · B2/X1] 投影出口的**注入容量预演**（只读，不注入、不改任何状态）。
         *
         * 记忆候选面从**真注入路径的读数**取（`_lastInjectionDraft` 的逐块字符数）：
         *   不另算一遍「候选块该有多大」—— 那会与真路径漂移，而本仓最忌「同一事实两个真源」。
         * 宿主还没跑过注入（草稿为空）⇒ items=null ⇒ memory.known=false，**不写 0**。
         * 不可测一律 null + reason：模块缺席 / 世界书读不到 / 未跑过注入 三种情形分别归因。
         * @returns {object|null} 预演读数；模块缺席时为 null（＝「没跑」，不是「占用为零」）
         */
        _projectionPrediction() {
            try {
                const P = _projectionLib();
                if (!P || typeof P.predictInjection !== 'function') return null;
                // 预算输入与 buildInjection 的取值点**同源**（同一批配置键、同一个推导模块）
                const _ir = (typeof window !== 'undefined' ? window.LonShaInjectionRouter : null)
                    || (typeof require !== 'undefined' ? (() => { try { return require('./injection-router.js'); } catch { return null; } })() : null);
                const cfg = (this.config && this.config.config) ? this.config.config : {};
                const chatLength = (typeof window !== 'undefined' ? window.SillyTavern?.getContext?.()?.chat?.length : 0) || 0;
                const draft = Array.isArray(this._lastInjectionDraft) ? this._lastInjectionDraft : null;
                const items = draft ? draft.filter((b) => b && Number(b.chars) > 0).map((b) => ({
                    id: b.id, label: b.label, chars: Number(b.chars) || 0,
                    // 常驻口径与 buildInjection 同一真源（RESIDENT_MARKERS），不自立一套
                    resident: (typeof RESIDENT_MARKERS !== 'undefined')
                        ? RESIDENT_MARKERS.some((m) => String(b.label || '').startsWith(m)) : false,
                })) : null;
                return P.predictInjection({
                    items: items,
                    baseBudget: cfg.injectionBudget || 3000,
                    tokenBudget: Number(cfg.memoryTokenBudget) || 0,
                    reserve: numOr(cfg.keepRecentTokenReserve, 0),
                    chatLength: chatLength,
                    adaptive: cfg.adaptiveBudget,
                    decayFloors: cfg.adaptiveBudgetDecayFloors,
                    router: _ir,
                    worldbook: this._worldbookOccupancy(),
                    strategy: cfg.budgetStrategy || 'balanced',
                    now: Date.now(),
                });
            } catch (e) { errLog(e, 'plugin._projectionPrediction'); return null; }
        }
        buildBridgeSnapshot() {
            try {
                // [v3.174 B] **undefined 必须被保住**，不得走 JSON 回退把它变成 null：
                //   `JSON.stringify(undefined) === undefined`，round-trip 后成 null，
                //   于是「源里没有这项」又被伪装成「有这项、值是空」——三态塌回两态，
                //   读者仍然无从归因（这正是 R2「null 三义同形」的根）。
                //   结构化克隆可用时原样保留；不可用时也如实回 undefined（字段缺席）。
                const deep = (v) => {
                    if (v === undefined) return undefined;
                    try { return (typeof structuredClone === 'function') ? structuredClone(v) : JSON.parse(JSON.stringify(v)); }
                    catch (e) { try { return JSON.parse(JSON.stringify(v)); } catch (e2) { return null; } }
                };
                const floor = (window.SillyTavern?.getContext?.()?.chat?.length || 1) - 1;
                // [v3.174] 桥的读者契约面 B：**字段类型三态**。此前 `deep()` 的 JSON 回退路径
                //   会把 undefined 变成 null（`JSON.stringify(undefined) === undefined`，
                //   round-trip 后成 null）。读者拿到的 null 于是有两个来源——源字段本来就是
                //   null，或源字段是 undefined/不可序列化被吞成 null——**两者同形，无从分辨**。
                //   现在每个顶层字段带 {present, kind} 进 snapshot.meta.fieldTypes：
                //     present=false ⇒ 源字段不存在/undefined（读者应视作「没有这项」）
                //     kind='null'   ⇒ 源字段显式是 null（读者应视作「有这项、值是空」）
                //   值本体照旧（渲染契约零破坏，读数只加字段）。
                const typeOf = (v) => {
                    if (v === undefined) return 'undefined';
                    if (v === null) return 'null';
                    if (Array.isArray(v)) return 'array';
                    return typeof v;
                };
                const fieldTypes = (obj) => {
                    const out = {};
                    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
                    for (const k of Object.keys(obj)) {
                        const t = typeOf(obj[k]);
                        out[k] = { present: t !== 'undefined', kind: t };
                    }
                    return out;
                };
                // [v3.174 B] **如实报在场**：旧写法每个字段都带 `|| {}` / `|| null` 兜底，
                //   于是「引擎压根没有这项」与「有这项、值是空」在快照里完全同形——
                //   fieldTypes.present 永远为 true，三态里两态是空的，这份「类型读数」就是摆设。
                //   现在先取**原样值**（宿主没这项即 undefined），deep 之后直接落进快照：
                //     present=false ⇒ 源里没有这项（读者应视作「没有」，而不是「空」）
                //     present=true  ⇒ 源里给了这项（kind='null' 才表示「给了，但是空」）
                //   容灾要求不变：字段缺失只让该字段缺席，不得连坐 floor / bridge / version 等自述字段。
                const rawProt = (this.status && typeof this.status.getProtagonist === 'function') ? this.status.getProtagonist() : undefined;
                const rawLife = (this.status && Array.isArray(this.status.lifeDetails)) ? this.status.lifeDetails.filter(d => d && d.tier !== 'archive') : undefined;
                const rawChars = (this.status && this.status.characters && typeof this.status.characters === 'object') ? this.status.characters : undefined;
                const rawMoney = (this.moneyLedger && typeof this.moneyLedger.export === 'function') ? this.moneyLedger.export() : undefined;
                const rawOutline = (this.outline && typeof this.outline.export === 'function') ? this.outline.export() : undefined;
                const rawWorld = (this.worldProg && typeof this.worldProg.export === 'function') ? this.worldProg.export() : undefined;
                const rawClock = (this.clock && typeof this.clock.export === 'function') ? this.clock.export() : undefined;
                // [v3.151] 召回自检摘要（外供手机端织光机「最常回望的时光」维度；只读、深拷贝）
                //   typeof 守卫：本方法被单测「提取执行」模式（v388 bridge 专项）复用时无 this 宿主，
                //   缺失该方法不得连坐整张快照（缺失即 present=false，其余字段照常外供）。
                const rawRecall = (typeof this._summarizeRecallAudit === 'function') ? this._summarizeRecallAudit() : undefined;
                // [v3.176] 世界账本对读读数（本插件**读到的推演侧世界**，含未外供缺口 + 人物位置对读结果）。
                //   外供出去的意义：手机端能读到「记忆插件眼里的世界长什么样」，形成三方对读闭环——
                //   而 defect 形态（缺口/位置冲突）不再只存在于记忆插件的诊断面里。
                const rawLedgerRead = (this.clock && this.clock._worldLedgerRead && typeof this.clock._worldLedgerRead === 'object')
                    ? this.clock._worldLedgerRead : undefined;
                // [v3.181] SG：场所图景对读读数（本插件**看到的场所世界**：当前位置链/在场名单/
                //   到访读数/覆盖度/不变量状态）。外供的意义与 worldLedgerRead 同构——手机端与
                //   推演侧能读到「记忆插件眼里的场所长什么样」，形成三方对读，而「树断了/谁在哪
                //   对不上」不再只存在于本插件的诊断面里。
                //   只读 + 有界：summary() 已是纯数据（Map 已转数组），deep() 只做克隆。
                const rawScene = (this.scene && typeof this.scene.summary === 'function')
                    ? this.scene.summary() : undefined;
                // [v3.213.0] R1-C：投影 envelope 的**导出期新鲜度守卫**（「归属」而不是「时刻」）。
                //   修前实测：`_lastProjectionEnvelope` 的归属（conversationId + revision）只在
                //   `readWorldLedger()` 写它的那一刻成立。切聊只换 chatId、回滚/恢复只递增
                //   `_mutationEpoch`，两条路径都**不清缓存** ⇒ 快照于是把**旧会话/旧代数**的投影
                //   当作当下的读数导出。下游拿到的是一份看起来正常、归属却错了的状态（本仓最贵
                //   的那类错读数：不报错、只错结果）。
                //   为什么不是「顺手更新一下时间戳」：`generatedAt` 记的是**封装生成时刻**，不携带
                //   归属。宿主没重跑管线时，旧缓存依然是「最新生成」的那一份 —— 改时间戳等于把陈旧
                //   内容**伪装**成新鲜（掩盖而非消除）；且时间戳与 `_mutationEpoch` 无耦合，识别不出
                //   回滚/切聊造成的状态跳变。只有比对「会话 + 代数」才能保证导出与当前状态同代。
                //   三态处置：同代 ⇒ 照常导出；不符 ⇒ 不导出（`projection` 缺席 ⇒ 自述 present=false），
                //   原因留在 `this._projectionDropped` 与 `snap.meta.projectionFreshness`（扔掉了要说出来，
                //   「扔掉了」与「本来就没这面」必须可分）；取不到 chatId（宿主无该方法 / 「提取执行」
                //   模式的独立实例）⇒ **放行**：拿不到判据不等于证伪，原契约（照常导出）不变。
                const freshProjectionFace = (() => {
                    const env = this._lastProjectionEnvelope;
                    if (!env) { this._projectionDropped = null; return undefined; }
                    let nowChatId;
                    try { nowChatId = (typeof this.getCurrentChatId === 'function') ? (this.getCurrentChatId() ?? undefined) : undefined; }
                    catch (_e3) { nowChatId = undefined; }
                    if (nowChatId === undefined) { this._projectionDropped = null; return env; }
                    const envChat = (env.conversationId === undefined || env.conversationId === null) ? '' : String(env.conversationId);
                    const envRev = Number(env.revision) || 0;
                    const nowRev = Number(this._mutationEpoch) || 0;
                    if (String(envChat || '') !== String(nowChatId || '')) {
                        this._projectionDropped = { reason: 'stale-conversation', from: envChat || null, to: String(nowChatId || ''), at: Date.now() };
                        return undefined;
                    }
                    if (envRev !== nowRev) {
                        this._projectionDropped = { reason: 'stale-revision', from: envRev, to: nowRev, at: Date.now() };
                        return undefined;
                    }
                    this._projectionDropped = null;
                    return env;
                })();
                const snap = {
                    version: 1,
                    bridge: 'lonsha_memory_bridge_v1',
                    pluginVersion: VERSION,
                    floor,
                    exportedAt: Date.now(),
                    protagonist: deep(rawProt),
                    lifeDetails: deep(rawLife),
                    characters: deep(rawChars),
                    moneyLedger: deep(rawMoney),
                    outline: deep(rawOutline),
                    worldProg: deep(rawWorld),
                    clock: deep(rawClock),
                    recallAudit: deep(rawRecall),
                    worldLedgerRead: deep(rawLedgerRead),
                    scene: deep(rawScene),
                    // [v3.212.0] L-F5：本插件侧账本的**对外投影**（stable projection API）。
                    //   为什么进快照：它与 worldLedgerRead / scene 同族——都是「本插件眼里的
                    //   某样东西」，下游要能读到；且进快照就自动获得 meta.fieldTypes 三态
                    //   （present=false ⇒ 本版没这面；present=true + kind='null' ⇒ 跑过但没装成），
                    //   不需要另开一套自述通道。
                    //   取值器：取本轮已由 readWorldLedger() 刷新的缓存；**不在这里现跑管线**
                    //   —— buildBridgeSnapshot 会被经 `.default` 取出的独立实例调用（无 this 账本），
                    //   现跑会静默拿到全空投影并把「没跑」伪装成「都是空」。
                    //   取不到即 undefined ⇒ present=false（如实报「本版没这面」）。
                    projection: deep(freshProjectionFace || undefined),
                    // [v3.214.0] R1-E：九账证据工作台读数（只读对账面）。
                    //   为什么进快照：它与 worldLedgerRead / scene / projection 同族——都是
                    //   「本插件眼里的某样东西」，下游要能读到；且进快照就自动获得
                    //   meta.fieldTypes 三态（present=false ⇒ 本版没这面）。
                    //   取值器：`_evidenceWorkbench()` 从**九账既有状态**现投影（纯读，不写账）。
                    //   typeof 守卫：本方法会被单测「提取执行」模式的独立实例复用，缺失即
                    //   present=false（如实报「没这面」），不得连坐 floor / bridge / version 等自述字段。
                    //   三态在内核里已分（ok / empty / absent + reason），快照只负责搬运。
                    // [v3.215.0] R2-A：**最终实际注入**读数（只读）。
                    //   为什么进快照：它是「AI 这一轮究竟看到了什么」的唯一对外答案。
                    //   修前：约定/伏笔/回扣/回声各有 render()，但快照字段里**注入面一个都没有**
                    //   —— 下游只能看到「账本里有什么」，看不到「这一轮真的送进去的是哪几块」，
                    //   也看不到「哪几块被预算裁掉了」。两者是相反的问题，压成一态就会
                    //   把「被裁了」误读成「本来就没有」。
                    //   取值器：buildInjectionReadout()（纯读，不写账）；typeof 守卫：本方法被
                    //   单测「提取执行」模式的独立实例复用时，缺失即 present=false（如实报「没这面」），
                    //   不连坐 floor / bridge / version 等自述字段。
                    injection: deep((typeof this.buildInjectionReadout === 'function') ? this.buildInjectionReadout() : undefined),
                    evidence: deep((typeof this._evidenceWorkbench === 'function') ? this._evidenceWorkbench() : undefined),
                    // [v3.233.0] F-2：事件**来源构成**（跨平台对照的**结构化**读数）。
                    //   为什么必须结构化、不能只给上面证据面里的那行 detail 文本：
                    //   让下游去解析显示字符串，就是「同一口径抄 N 份」的种子（本仓治理过多轮）；
                    //   下游要的是数字，不是一句人话。
                    //   三态（本仓纪律，缺一态就是错读数）：
                    //     meta.fieldTypes.eventPlatforms.present === false ⇒ 插件太旧（本版没这面）
                    //     present + reason='no-events'                     ⇒ 这版有面、但还没有事件线（真读数）
                    //     present + reason='ok'                            ⇒ 有构成可读
                    //   reason 另可出 'module-unavailable' / 'thrown'（都不是「空」）。
                    //   只给构成、不给判断：不含可信度 / 优先级 / 「哪个平台更重要」这类字段。
                    eventPlatforms: deep((typeof this._eventPlatformsFace === 'function') ? this._eventPlatformsFace() : undefined)
                };
                // [v3.174] 快照自述：宿主存盘前要能先判「这份快照多大、能不能直接序列化」。
                //   此前读者只能自己试着 stringify 一遍、再从失败里反推——而字符串化失败与
                //   「快照本来就是空对象」同形。故把两个判定前置成字段：
                //     selfBytes    —— **负载**字节数＝JSON.stringify(不含 meta 的快照).length
                //                    （刻意不含 meta 自身：自述里若含自己的字节数就会自指漂移——
                //                     填进去后长度又变，读者永远读到一个偏小的值。
                //                     0 表示负载根本无法序列化。）
                //     strictJsonOk —— 是否可被 JSON.stringify（false 时给出 strictJsonError）
                //     contract     —— 本快照由哪版契约产出（读者可据此判新旧）
                try {
                    const json = JSON.stringify(snap);
                    snap.meta = {
                        fieldTypes: fieldTypes(snap),
                        selfBytes: typeof json === 'string' ? json.length : 0,
                        strictJsonOk: typeof json === 'string',
                        contract: 'v3.174',
                        // [v3.213.0] R1-C：被新鲜度守卫扣下的投影必须**可归因**。
                        //   `projection` 缺席（present=false）有两种来源：本版没这面 / 有面但归属不同代。
                        //   两者处置相反（前者等上游升级，后者等宿主重跑），压成一态就是错读数。
                        projectionFreshness: (() => {
                            try {
                                const d = this._projectionDropped;
                                if (!d || typeof d !== 'object') return null;
                                return { dropped: true, reason: String(d.reason || 'unknown'), from: (d.from === undefined ? null : d.from), to: (d.to === undefined ? null : d.to) };
                            } catch (_e4) { return null; }
                        })()
                    };
                } catch (e2) {
                    snap.meta = { fieldTypes: {}, selfBytes: 0, strictJsonOk: false, strictJsonError: String((e2 && e2.message) || e2), contract: 'v3.174', projectionFreshness: null };
                }
                return snap;
            } catch (e) { errLog(e, 'buildBridgeSnapshot'); return null; }
        }
        /** [v3.174] 严格 JSON 出口：宿主把快照存盘/跨端传输时用。
         *  与 snapshot 本体分开——本体保持对象（渲染契约），出口给字符串（序列化契约）。
         *  契约：**要么给出可 JSON.parse 的字符串，要么给出 {ok:false, error}**，
         *  绝不返回空串（空串会让读者以为「存成功了，只是内容是空的」）。
         *  也不抛（入口契约与 snapshot 同规格）。 */
        buildBridgeSnapshotJson() {
            try {
                const snap = this.buildBridgeSnapshot();
                if (!snap) return { ok: false, error: 'no-snapshot', json: null, bytes: 0 };
                const json = JSON.stringify(snap);
                if (typeof json !== 'string' || !json) return { ok: false, error: 'serialize-empty', json: null, bytes: 0 };
                return { ok: true, error: null, json, bytes: json.length };
            } catch (e) {
                return { ok: false, error: String((e && e.message) || e), json: null, bytes: 0 };
            }
        }
        /* [v3.151] 召回自检摘要（v3.150 A 账本的对外只读投影）。
         * 把 _recallAudit 环形账本（每轮 查询/命中分布/空结果/楼层命中）压成
         * 轻量摘要：轮数 / 空结果轮数 / 平均命中 / 最常被回望的楼层 Top10 / 末轮查询。
         * 纯读，不改写账本；供 window.lonsha_memory_bridge_v1.snapshot.recallAudit 外供。 */
        _summarizeRecallAudit() {
            const EMPTY = { rounds: 0, emptyRounds: 0, avgHits: 0, hotFloors: [], lastQuery: '', lastTs: 0 };
            try {
                const ra = Array.isArray(this._recallAudit) ? this._recallAudit : [];
                const n = ra.length;
                if (!n) return EMPTY;
                let emptyRounds = 0, hits = 0;
                const hot = new Map();
                for (const r of ra) {
                    if (!r) continue;
                    if (r.empty) emptyRounds++;
                    hits += Number(r.totalHits) || 0;
                    const fh = r.floorHits || {};
                    for (const k of Object.keys(fh)) {
                        const f = Number(k);
                        if (!Number.isFinite(f) || f < 0) continue;
                        hot.set(f, (hot.get(f) || 0) + (Number(fh[k]) || 0));
                    }
                }
                const hotFloors = [...hot.entries()]
                    .map(([floor, count]) => ({ floor, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 10);
                const last = ra[n - 1] || {};
                return {
                    rounds: n,
                    emptyRounds,
                    avgHits: Number((hits / n).toFixed(2)),
                    hotFloors,
                    lastQuery: String(last.queryText || '').slice(0, 80),
                    lastTs: Number(last.ts) || 0
                };
            } catch (e) { errLog(e, 'summarizeRecallAudit'); return EMPTY; }
        }
        // [v1.5] 注入格式（抄 baibai 私密简报包裹 + HCDiary 分区结构）
        buildInjection(recalled) {
            // [v3.215.0] R2-A：本轮逐块读数草稿**无条件归零**（含空召回早返回路径）。
            //   修前：读数由调用方在 `if (inj2)` 里写，于是「本轮 0 块」与「本轮还没跑」
            //   在读数上同形（`total` 停在上一轮）。现在每次进入 buildInjection 先清空，
            //   出块时再填 —— 零块路径天然留下「空草稿」，而不是上一轮的残留。
            //   ★ 必须在早返回**之前**清：「本轮召回为空」正是 0 块的主要来源，
            //     若清空写在早返回后面，这条路径反而成了唯一漏网的那条。
            this._lastInjectionDraft = null;
            /* [v3.251.0] M-O3：本轮**构建过程回执草稿**（同生命期、同归零纪律）。
             *   为什么必须与 `_lastInjectionDraft` 一样在早返回**之前**归零：
             *   回执回答「本轮各阶段的计数与裁剪事实」，若残留上一轮的值，
             *   那么「本轮召回为空」就会带着上一轮的 kept/stages 一起被读出去 ——
             *   正是 R2-A 治过的「同形」在回执面的翻版。 */
            this._injectionTraceDraft = null;
            if (!recalled?.length) return '';
            const NOTE = '〔记忆系统私密简报｜仅你可见〕以下内容帮助保持剧情连贯;严禁在回复正文中复述、罗列或提及本节内容。';
            const END = '〔私密简报结束〕请像一个已读过前情的叙述者那样自然续写,不要复述简报本身。';
            
            // 分区：剧情摘要 / 角色关系 / 角色日记 / 手机记忆（抄 HCDiary 的分类注入）
            // [v3.114] 路由决策移入可测纯函数 injection-router.partitionRecalled（模块缺失时回落本体内联 if-else）
            const summaries = [], relations = [], diaries = [], phoneMem = [], timelines = [], povs = [], volumes = [], bm25Hits = [], statuses = [], holidays = [], suspenses = [], itemRecs = [], itemStoredRecs = [], reflectRecs = [], neuralChains = [], worldProgs = [], dedupNotes = [], treeNotes = [];
            const _irPart = (typeof window !== 'undefined' ? window.LonShaInjectionRouter : null)
                || (typeof require !== 'undefined' ? (() => { try { return require('./injection-router.js'); } catch { return null; } })() : null);
            if (_irPart) {
                const _bk = _irPart.partitionRecalled(recalled, { maxItems: this.config.config.vectorTopK * 2 });
                worldProgs.push(..._bk.worldProgs); neuralChains.push(..._bk.neuralChains);
                itemRecs.push(..._bk.itemRecs); itemStoredRecs.push(..._bk.itemStoredRecs);
                reflectRecs.push(..._bk.reflectRecs); statuses.push(..._bk.statuses);
                suspenses.push(..._bk.suspenses); holidays.push(..._bk.holidays);
                volumes.push(..._bk.volumes); bm25Hits.push(..._bk.bm25Hits);
                povs.push(..._bk.povs); timelines.push(..._bk.timelines);
                phoneMem.push(..._bk.phoneMem); diaries.push(..._bk.diaries);
                relations.push(..._bk.relations); treeNotes.push(..._bk.treeNotes);
                dedupNotes.push(..._bk.dedupNotes); summaries.push(..._bk.summaries);
            } else {
            for (const item of recalled.slice(0, this.config.config.vectorTopK * 2)) {
                if (item.source === 'worldprogress') worldProgs.push(item);
                else if (item.source === 'neuralChain') neuralChains.push(item);
                else if (item.source === 'items') itemRecs.push(item);
                else if (item.source === 'items_stored' || item.source?.includes('items_stored')) itemStoredRecs.push(item);
                else if (item.source === 'reflection') reflectRecs.push(item);
                else if (item.source === 'status') statuses.push(item);
                else if (item.source === 'suspense') suspenses.push(item);
                else if (item.source?.includes('holiday')) holidays.push(item);
                else if (item.source?.includes('volume')) volumes.push(item);
                else if (item.source === 'bm25') bm25Hits.push(item);
                else if (item.source?.includes('pov')) povs.push(item);
                else if (item.source?.includes('timeline')) timelines.push(item);
                else if (item.source?.includes('rubyphone')) phoneMem.push(item);
                else if (item.source?.includes('diary')) diaries.push(item);
                else if (item.source?.includes('graph')) relations.push(item);
                else if (item.source === 'memoryTree') treeNotes.push(item);
                else if (item.source === 'dedup') dedupNotes.push(item);
                else summaries.push(item);
            }
            }   // [v3.114] 闭合 else 分支
            
            const blocks = [];
            /* [v3.251.0] M-O3：**拼装现场归因记账**（必须在回执草稿建立之前就开始记）。
             *   为什么不能等到裁剪后再记：块是**渲染后的文本**，「这块是哪来的」这个信息
             *   只在 push 的那一刻存在于局部变量里；等到裁剪回执那一层，源归属早已丢失
             *   （cost-ledger 只能靠「分节继承」猜节名，正是这个丢失的下游补偿）。
             *   这里只记**计数**（谁贡献了几块），不记内容、不参与任何决策：
             *     · 回执在裁剪前才建草稿（那时才有 budget / strategy），故本处先用两个局部
             *       容器收着，等草稿建立时并入 —— 不提前建草稿是为了不动既有回归基线。
             *     · 有开关的源**无论开关开合都落一个键**（闸门关 ⇒ 0），于是
             *       「某源被禁用 ⇒ 它贡献 0 块」是一条可在回执上直接断言的判据，
             *       而不是事后从块文本反推（M-O3 第 ⑦ 条）。 */
            const _srcBlocks = {};
            const _stageCnt = { relationGated: null, povOffstage: null, povScoped: false, relationScoped: false };
            const _countSource = (key, n) => {
                const _n = Number(n);
                _srcBlocks[key] = (_srcBlocks[key] || 0) + (Number.isFinite(_n) && _n > 0 ? Math.floor(_n) : 0);
            };
            /* [v3.251.0] M-O3 第 ⑦ 条的**单一真源**：召回侧开关表。
             *   修前这张表只在下方的 cost-ledger 调用处**就地写死一份**（10 键），
             *   若回执再抄一份，就是本仓点名的「同一事实两个真源」——
             *   两处迟早漂移，而漂移的表现恰好是「禁用项仍被报成有注入」。
             *   故提到拼装之前建一次：拼装侧按它开闸/计数，账本侧原样读同一对象。
             *   键面与语义**一字不改**（保持既有诊断行「禁用 N 源」的读数不变）。 */
            const _srcGate = {
                emotionOppositeRecall: this.config.config.emotionOppositeRecall === true,
                vector: this.config.config.vectorEnabled !== false,
                cse: this.config.config.cseEnabled !== false,
                scene: this.config.config.sceneEnabled !== false,
                suspense: this.config.config.suspenseEnabled !== false,
                worldProgress: this.config.config.worldProgressEnabled !== false,
                lockedFacts: this.config.config.lockedFactsEnabled !== false,
                timeTagAnchor: this.config.config.timeTagAnchorEnabled !== false,
                itemLedger: this.config.config.itemLedgerEnabled !== false,
                narrativePulse: this.config.config.narrativePulseEnabled !== false,
            };
            /* 有注入期**自有块**的源（构建期能真判「它贡献了几块」）与没有的，必须分开记：
             *   本插件的块是从**召回候选池**融合渲染出来的：`vector` / `suspense` / `worldProgress`
             *   这些源在**召回**侧生效，禁用它们的效果是「候选池里少几条」，而不是
             *   「渲染时少几个块」—— 在构建期把它们拆成「谁贡献了几块」是**做不到的**，
             *   硬拆只会得到一份看起来精确、实则编造的归属表。
             *   故：自有块的源逐一记数（禁用 ⇒ 恒 0，可断言）；融合源记在 `fused`
             *   并指向召回侧读数（`recallPerSource`），不假装构建期可分。 */
            const _OWNED_SOURCES = ['lockedFacts', 'cse', 'narrativePulse', 'scene', 'npcTier', 'typedFacts', 'protagonist', 'npcTies'];
            const _FUSED_SOURCES = ['vector', 'suspense', 'worldProgress', 'timeTagAnchor', 'itemLedger', 'emotionOppositeRecall'];
            // ===== A. 静态锚定前缀区 (Static Cache Anchor Zone - Prompt Cache Guard) =====
            // [v3.46] 宏观世界线·纪元史记 (Grand Chronicle)
            if (this.summary?.getGrandChroniclePrompt) {
                const grandText = this.summary.getGrandChroniclePrompt();
                if (grandText) blocks.push(grandText);
            }
            // [v3.62] 用户锁定事实（dsh lockedFacts）：逐字进静态锚定区，最高优先级事实保护
            if (this.config.config.lockedFactsEnabled !== false) {
                const lfText = this.summary?.lockedFactsForPrompt?.(this.config.config.lockedFactMaxChars);
                if (lfText) blocks.push('[用户锁定剧情事实]\n' + lfText);
                _countSource('lockedFacts', lfText ? 1 : 0);
            } else {
                // 闸门关也必须落键并记 0（M-O3 ⑦）：不落键的话，「这个源被禁用 ⇒ 它贡献 0 块」
                //   在回执上就查不到，只能落进账本的「未参与核对」——那是把可判的事实弄成不可判。
                _countSource('lockedFacts', 0);
            }
            // [v3.45] 吸收 baibai: 主角客观档案与生活习惯癖好追踪
            if (this.config.config.protagonistTracking !== false) {
                // [v3.148] 传入当前剧情日期（age 锚点推算用；时间跳跃自动长岁）
                const proPrompt = this.status?.getProtagonistPrompt?.(this.clock?.date || this.getLatestStoryDate?.() || '');
                const lifePrompt = this.status?.getLifeDetailsPrompt?.(5) || [];
                if (proPrompt || lifePrompt.length) {
                    blocks.push('[主角当前客观状态与生活习惯]');
                    if (proPrompt) blocks.push(`- ${proPrompt}`);
                    if (lifePrompt.length) blocks.push(...lifePrompt);
                    _countSource('protagonist', 1 + (proPrompt ? 1 : 0) + lifePrompt.length);
                }
            }
            // [v3.45] 吸收 baibai: 跨空间角色长期人伦社会羁绊网（稳定字典序排序）
            if (this.config.config.npcTiesInjection !== false) {
                const tiesText = this.getNpcTiesPrompt?.();
                if (tiesText) {
                    blocks.push(tiesText);
                }
                _countSource('npcTies', tiesText ? 1 : 0);
            }
            // [v3.94] CSE 级人物状态引擎注入（分层呈现+toward+可见性+待证标注）
            if (this.config.config.cseEnabled !== false) {
                try {
                    const cseText = this.cse?.toPrompt?.(null, { includePrivate: true, maxStates: 10 });
                    if (cseText) blocks.push(cseText);
                    _countSource('cse', cseText ? 1 : 0);
                } catch (e) { errLog(e, 'buildInjection.cse'); }
            } else { _countSource('cse', 0); }
            // [v3.95] 叙事心电图注入（原创：节奏自反提示，仅在连续高压/平淡时输出，避免每轮噪音）
            if (this.config.config.narrativePulseEnabled !== false) {
                try {
                    // [v3.156] 角色弧光接真源。此前恒传 []：toPrompt 的弧光板块要求
                    //   opts.characters 非空且该角色已积累 >=3 拍极性轨迹，空数组使
                    //   「[角色弧光·阶段参考]」永不产出——beat() 侧记录了轨迹却没人读。
                    //   真源与 beat() 同源：captureCast()（最近 8 楼窗口，上限 5 人）。
                    const _pulseCast = this.captureCast();
                    const pulseText = this.pulse?.toPrompt?.({ characters: _pulseCast });
                    if (pulseText) blocks.push(pulseText);
                    _countSource('narrativePulse', pulseText ? 1 : 0);
                } catch (e) { errLog(e, 'buildInjection.叙事心电图'); }
            } else { _countSource('narrativePulse', 0); }
            if (this.config.config.npcTierInjection !== false) {
                const npcTierLines = buildNpcTierInjection(this.buildNpcTierRecords());
                if (npcTierLines.length) {
                    blocks.push('[角色索引·分级注入]');
                    blocks.push(...npcTierLines);
                }
                _countSource('npcTier', npcTierLines.length ? 1 + npcTierLines.length : 0);
            } else { _countSource('npcTier', 0); }

            // ===== B. 动态易变尾部区 (Volatile Dynamic Zone) =====
            // [v3.211] 类型化事实入注入：消费 memory-type.js 的 routeForType / typedBuckets / policyOfType。
            //   修前实测：这三个出口在全仓**零调用点** —— 类型系统把事实分了九类、每类定了可见性与
            //   生命周期，但注入管线里一个类型化块都没有，于是「世界规则」「事件结果」「叙事线索」
            //   这些类型只活在 selfCheck 诊断行里，**从不进模型上下文**（功能级失效的典型）。
            //   稳定块（permanent/long）首行是 RESIDENT_MARKERS 的 `[类型化事实·长期]` ⇒ 落常驻分区、
            //   每轮必注；波动块（medium/short/dynamic）走触发分区、随预算裁剪。
            //   两块**分开 push**、不合并：合成一块后要么短生命周期的场景事实被当成常驻每轮灌进去，
            //   要么长期世界规则跟一次性的场景事实一起被裁掉（正是本仓三态纪律禁止的那种压缩）。
            try {
                const _tf = (typeof this.typedFactsBlocks === 'function') ? this.typedFactsBlocks() : null;
                if (_tf && _tf.stable) blocks.push(_tf.stable);
                if (_tf && _tf.volatile) blocks.push(_tf.volatile);
                _countSource('typedFacts', (_tf && _tf.stable ? 1 : 0) + (_tf && _tf.volatile ? 1 : 0));
            } catch (e) { errLog(e, 'buildInjection.typedFacts'); _countSource('typedFacts', 0); }
            // [v3.91] 审计修复：setGeoLocation 从 LLM geo_location 抽取并写入，getGeoLocation 被召回路径消费，
            //         但 getGeoPrompt 从未进入注入（数据空转）。位置会随剧情变化，故放动态区而非静态锚定。
            try {
                const geoPrompt = this.status?.getGeoPrompt?.();
                if (geoPrompt) blocks.push(geoPrompt);
            } catch (e) { errLog(e, 'buildInjection.geoPrompt'); }
            // [v3.46] 吸收 Bakemono: 当前剧情时钟与回忆隔离
            const clockPrompt = this.clock?.getContextPrompt?.();
            if (clockPrompt) {
                blocks.push(clockPrompt);
            }
            if (volumes.length) {
                blocks.push('[早前剧情概括·卷]');
                const seenV = new Set();
                volumes.forEach(i => {
                    const key = i.text || '';
                    if (seenV.has(key)) return;
                    seenV.add(key);
                    blocks.push(`- ${key}`);
                });
            }
            if (summaries.length) {
                blocks.push('[前情摘要]');
                // [v3.201] D2: 摘要注入加相对时间前缀（与 timeline 注入同规格：宁可不标，绝不标错）
                const _relOn = this.config.config.relativeTime !== false;
                const _anchorDate = this.clock?.date || this.getLatestStoryDate?.() || '';
                summaries.forEach(i => {
                    const _rel = (_relOn && i.storyTime && _anchorDate)
                        ? relativeTimeLabel(i.storyTime, _anchorDate) : '';
                    blocks.push(`- ${i.text || i.summary || i.name || ''}${_rel ? '（' + _rel + '）' : ''}`);
                });
            }
            if (bm25Hits.length) {
                const seenB = new Set((summaries.length ? summaries : []).map(x => x.text));
                const fresh = bm25Hits.filter(b => !seenB.has(b.text));
                if (fresh.length) {
                    blocks.push('[相关片段·关键词命中]');
                    fresh.forEach(i => blocks.push(`- ${i.text || ''}`));
                }
            }
            if (statuses.length) {
                blocks.push('[角色状态]');
                statuses.forEach(s => {
                    const fieldText = (s.fields || []).map(([k, v]) => `${k}:${v}`).join(' | ');
                    const todoText = (s.todos || []).length ? `；待办: ${s.todos.map(t => (t.date ? `${t.date} ` : '') + t.text).join('、')}` : '';
                    // [v3.180] 年龄三态读数（与主角同规格）：算得出给数字/约数，算不出给「原文(锚点时)」，
                    //   而不是像修前那样只把它当普通状态字段原样透出（读者分不清「准」与「猜」）。
                    const ageText = s.age ? ` | 年龄:${s.age}` : '';
                    blocks.push(`- ${s.name}${fieldText ? ' — ' + fieldText : ''}${ageText}${todoText}`);
                });
            }
            if (relations.length) {
                // [v3.184] 关系披露收口（relation-disclosure.js，移植 nocturne_memory 的 edge disclosure）。
                //   修前：关系边一旦写入就**永久无条件**参与注入——不看当前剧情走到哪里。
                //   长线里的实测后果：每轮固定带上若干当期毫无用处的关系（某条「暗恋」在两条线
                //   各走各的二十楼里仍然每轮出现），挤占 token 且稀释真正相关的那几行。
                //   现在：带 disclosure 的边按当前情境判条件，未触发的本轮不进注入。
                //   **仍在图里、仍在召回池里**——情境对了下一轮照常出现（转瞬过滤，不是永久降级）。
                const _RD = _moduleLib(() => window.LonShaRelationDisclosure, 'relation-disclosure.js');
                let _relKept = relations, _rdRead = null;
                if (_RD && typeof _RD.partition === 'function') {
                    const _pt = _RD.partition(relations, this._lastCtxText || '', { enabled: this.config.config.relationDisclosureEnabled !== false });
                    _relKept = _pt.kept;
                    _rdRead = { enabled: _pt.enabled, counts: _pt.counts, ctxEmpty: _pt.ctxEmpty };
                    // 被跳过的那几条也要可查（有界 5 条）：否则「这条关系为什么没出现」无从回答。
                    this._relationGated = _pt.gated.slice(0, 5).map(g => `${g.from}→${g.to}(${g.label || '相关'})`);
                } else {
                    // 模块缺席：不静默化成「全部跳过」（那是数据损失），如实记为缺席并原样放行。
                    this._relationGated = [];
                    _rdRead = { moduleMissing: true };
                }
                this._relationDisclosureRead = _rdRead;
                if (_rdRead && _rdRead.counts && Number.isFinite(_rdRead.counts.gated)) {
                    _stageCnt.relationGated = _rdRead.counts.gated;   // 有效的「挡下几条」，可测
                } else {
                    // 模块缺席 / 读数缺失 ⇒ 如实 null（不写 0：0 是「测到了，一条都没挡」）
                    _stageCnt.relationGated = null;
                }
                _stageCnt.relationScoped = true;   // 关系面本轮参与过构建（判据据此知道这一格为何有值）
                /* [v3.219.0] R2-F：**双向关系对账**（relation-mutual.js）——单向主观边要能看出「对侧在不在」，
                 *   收两份输入（图里全量边 + 本轮真进注入的那批）；只读、不抛、不改边。 */
                let _mutualRead = null;
                try {
                    const _RM = _moduleLib(() => window.LonShaRelationMutual, 'relation-mutual.js');
                    if (_RM && typeof _RM.reconcile === 'function') {
                        const _allEdges = [...(this.graph?.edges?.values?.() || [])].slice(0, 200);
                        _mutualRead = _RM.reconcile(_allEdges, _relKept, { maxList: 5 });
                    } else {
                        // 模块缺席：如实记为缺席（不静默当成「都对上了」——那是假读数）。
                        _mutualRead = { moduleMissing: true };
                    }
                } catch (e) { errLog(e, 'buildInjection.双向对账'); _mutualRead = { degraded: true }; }
                this._relationMutualRead = _mutualRead;
                if (_relKept.length) {
                blocks.push('[角色关系]');
                const CLS_CN = { family: '血缘', intimate: '亲密', hostile: '敌对', social: '社交', other: '其他' };
                const _RM2 = _moduleLib(() => window.LonShaRelationMutual, 'relation-mutual.js');
                _relKept.forEach(i => {
                    const att = i.data?.attitude === 'positive' ? '友好' : i.data?.attitude === 'negative' ? '排斥' : '中立';
                    const fromName = this.graph.nodes.get(i.from)?.name || i.from || i.name;
                    const toName = this.graph.nodes.get(i.to)?.name || i.to || '';
                    const histNote = (i.active === false && i.validTo != null) ? `（曾于第${i.validTo}楼前）` : '';
                    const cls = i.data?.relClass || classifyRelationshipType(i.label);
                    /* 只对「对侧压根不在图里」标注：被挡下/已失效两态标了反而误导
                     *   （前者是此刻不该给模型看，标注等于把它又说了出来）。 */
                    const _mu = (_RM2 && typeof _RM2.annotate === 'function') ? _RM2.annotate(i, _mutualRead) : '';
                    blocks.push(`- ${fromName} → ${toName}：${i.label || '相关'}[${att}·${CLS_CN[cls] || '其他'}]${histNote}${_mu}`);
                });
                }
            }
            // [v3.185] 条目关联的注入侧消费：本楼正文同时提到了某条已确认关系的两端 ⇒ 并列一行可提项。
            //   为什么不直接写边：见 _crosslinkConsumePair 的立论。这一行是**对关系块的再收窄**
            //   （关系块按披露条件过滤，这里再筛出「本轮正文真的用到了」的那一条）；
            //   没有可提项时整行不出现——不占 token、也不给模型任何暗示。
            if (this._crosslinkConsume) {
                const _xc = this._crosslinkConsume;
                blocks.push(`〔本轮可提关联｜本楼正文同时出现了「${_xc.from}」与「${_xc.to}」：若剧情确实推进了这层关系，可按（${_xc.label}）据实更新；不要凭空新增别的关系〕`);
            }
            // [v3.45] 吸收 baibai: 近期已了结/已作废事项防复读注入
            const recentDone = this.suspense?.getRecentlyResolvedPrompt?.(3) || [];
            if (recentDone.length) {
                blocks.push('[近期已了结事项·切勿重复执行或提及]');
                blocks.push(...recentDone);
            }
            // [v3.37] Prompt Cache 友好优化：活跃阶段周记随底层动态槽注入
            if (this.config.config.cacheFriendlyInjection !== false && this.summary.getActiveVolumes) {
                const activeVols = this.summary.getActiveVolumes().slice(-2);
                if (activeVols.length) {
                    blocks.push('[阶段进展·周记]');
                    activeVols.forEach(v => blocks.push(`- （第${v.floorStart}-${v.floorEnd}楼）${v.text}`));
                }
            }
            if (treeNotes.length) {
                // [v3.28] 记忆树路由召回（st-memory-wizzard）
                blocks.push('[记忆树·角色关联]');
                treeNotes.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (diaries.length) {
                blocks.push('[角色日记·近期]（第一人称心声，仅作内心参考，不得在对话中直接引用原文）');
                diaries.forEach(i => blocks.push(`- ${i.name || i.character || ''}（${i.floor != null ? '第' + i.floor + '楼' : ''}${i.mood ? '·' + i.mood : ''}）：${i.text || i.entry || ''}${i.secret ? ' ｜未说出口: ' + i.secret : ''}${i.attitude ? ' ｜对用户态度: ' + i.attitude : ''}${Array.isArray(i.keyEvents) && i.keyEvents.length ? ' ｜亲历要事: ' + i.keyEvents.join('；') : ''}${Array.isArray(i.subjRelations) && i.subjRelations.length ? ' ｜主观关系印象: ' + i.subjRelations.join('；') : ''}`));
            }
            // [v3.47] 钱财账本 + 剧情卡牌注入（hcdiary 吸收）
            if (this.moneyLedger) {
                const moneyPrompt = this.moneyLedger.toPrompt();
                if (moneyPrompt) blocks.push(moneyPrompt);
            }
            if (this.cards) {
                const cardsPrompt = this.cards.toPrompt();
                if (cardsPrompt) blocks.push(cardsPrompt);
            }
            if (this.conflicts) {
                const conflictPrompt = this.conflicts.toPrompt();
                if (conflictPrompt) blocks.push(conflictPrompt);
            }
            // [v3.66] 正史增量注入（established/uncertain 分状态展示）
            if (this.deltaBook) {
                const deltaPrompt = this.deltaBook.toPrompt();
                if (deltaPrompt) blocks.push(deltaPrompt);
            }
            // [v3.48] P1: 大纲导演注入（导演视角：本轮目标+节奏）
            if (this.outline) {
                const outlinePrompt = this.outline.toPrompt();
                if (outlinePrompt) blocks.push(outlinePrompt);
            }
            // [v3.49] P5: 群像共同记忆注入（只注入在场角色相关的关系对）
            if (this.pairMem) {
                const pairPrompt = this.pairMem.toPrompt(extracted?.characters || this.captureCast());
                if (pairPrompt) blocks.push(pairPrompt);
            }
            if (timelines.length) {
                // [v3.32] chronicle timeline tiering (Visual-Memory highlightThreshold idea): key events >=7 top block, rest as list
                const tlKey = timelines.filter(i => (i.importance || 5) >= 7);
                const tlRest = timelines.filter(i => (i.importance || 5) < 7);
                if (tlKey.length) {
                    blocks.push("[关键事件·影响当前]");
                    const seenK = new Set();
                    tlKey.forEach(i => {
                        const key = i.text || "";
                        if (seenK.has(key)) return;
                        seenK.add(key);
                        // [v3.71] A2: 相对时间前缀（柏宝书 timeRel 理念：宁可不标，绝不标错）
                        const rel = i.storyTime ? relativeTimeLabel(i.storyTime, this.clock?.date || '') : '';
                        blocks.push(`- ${key}${rel ? '（' + rel + '）' : ''}`);
                    });
                }
                if (tlRest.length) {
                    blocks.push("[剧情时间线]");
                    const seen = new Set();
                    tlRest.forEach(i => {
                        const key = i.text || "";
                        if (seen.has(key)) return;
                        seen.add(key);
                        // [v3.71] A2: 相对时间前缀
                        const rel = i.storyTime ? relativeTimeLabel(i.storyTime, this.clock?.date || '') : '';
                        blocks.push(`- ${key}${rel ? '（' + rel + '）' : ''}`);
                    });
                }
            }
            if (dedupNotes.length) {
                // [v3.23] 跨调用去重提示（NE-Memory）: 标记上轮已覆盖项，防连续追问复读
                blocks.push('[已覆盖记忆·防复读]');
                dedupNotes.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (povs.length) {
                const present = this.captureCast();
                const presentSet = new Set(present.map(p => this.resolveCharacterName(p)));
                // [v3.46] 视界隔离与全知禁令：当前有在场角色时，滤除不在场角色的私密心声防隔空读心透视
                const validPovs = (present.length > 0)
                    ? povs.filter(p => !p.owner || presentSet.has(this.resolveCharacterName(p.owner)))
                    : povs;
                /* [v3.251.0] M-O3 第 ③ 条：有效性过滤的**第二支**（视界隔离挡下的心声条数）。
                 *   与关系披露同一形态：这是**构建期真发生的一次有效性过滤**，
                 *   修前它只在「块有没有出现」上留痕（整段消失），没有任何一格说「挡下了几条」。
                 *   仅在**真做了过滤**时给数（present.length > 0）；没有在场角色时不筛，
                 *   那一格记 null（不写 0 —— 0 是「筛了，一条都没挡」）。 */
                if (present.length > 0) _stageCnt.povOffstage = Math.max(0, povs.length - validPovs.length);
                _stageCnt.povScoped = true;
                if (validPovs.length) {
                    const who = present.length ? present.join('、') : '当前角色';
                    blocks.push(`〔全知禁令与私密视界｜仅${who}知晓，其他角色绝不知情，严禁未卜先知或在对话动作中直接戳破〕`);
                    validPovs.forEach(i => blocks.push(`- ${i.owner}：${i.text || ''}`));
                }
            }
            if (phoneMem.length) {
                blocks.push('[手机生活记忆]');
                phoneMem.forEach(i => blocks.push(`- ${i.text || i.content || ''}`));
            }
            const scenesList = [], presenceList = [];
            for (const item of recalled.slice(0, this.config.config.vectorTopK * 2)) {
                if (item.source === 'scene') scenesList.push(item);
                else if (item.source === 'presence') presenceList.push(item);
            }
            if (itemRecs.length) {
                blocks.push(itemStoredRecs.length ? '[物品台账·在场/随身]' : '[物品台账]');
                itemRecs.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (itemStoredRecs.length) {
                blocks.push('[物品台账·他处寄存]（注意：以下物品存放于其他地点或未随身携带，角色当前不可随手隔空取出）');
                itemStoredRecs.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (reflectRecs.length) {
                blocks.push('[高层洞察]（长线关系趋势/线索，供叙事参考不作事实）');
                reflectRecs.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (this.config.config.sceneEnabled) {
                try {
                    let _sceneN = 0;
                    const cur = this.scene.currentKey();
                    if (cur) {
                        const chain = this.scene.chainOf(cur);
                        if (chain.length) {
                            blocks.push('[当前场景]');
                            const line = chain.map(n => n.path[n.path.length - 1] + (n.desc ? `（${n.desc}）` : '')).join(' › ');
                            blocks.push(`- ${line}`);
                            _sceneN += 2;
                        }
                    }
                    // [v3.195] 场景头只读本楼。没有就不出行，不回退到别的楼。
                    const _hdrFloor = (typeof window !== 'undefined' ? window.SillyTavern?.getContext?.()?.chat?.length : 0) || 0;
                    const _hdr = _hdrFloor > 0 && this.scene.headerLine ? this.scene.headerLine(_hdrFloor - 1) : '';
                    if (_hdr) { blocks.push(_hdr); _sceneN += 1; }
                    _countSource('scene', _sceneN);   // sceneEnabled 关 ⇒ 整块不进 ⇒ 恒 0
                } catch (e) { errLog(e, 'buildInjection.场景链'); _countSource('scene', 0); }
            } else { _countSource('scene', 0); }
            if (scenesList.length) {
                blocks.push('[相关地点]');
                scenesList.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (neuralChains.length) {
                blocks.push('[关系记忆·神经链]（链1用户→角色 / 链2角色↔角色）');
                const seenN = new Set();
                neuralChains.forEach(i => { const key = i.text || ''; if (!seenN.has(key)) { seenN.add(key); blocks.push(`- ${key}`); } });
            }
            if (worldProgs.length) {
                blocks.push('〔场外角色动态｜他们已各自行动，可自然成为后续话题〕');
                const seenW = new Set();
                worldProgs.forEach(i => { const key = i.text || ''; if (!seenW.has(key)) { seenW.add(key); blocks.push(`- ${key}`); } });
            }
            if (presenceList.length) {
                blocks.push('〔不在场角色｜未经剧情发展不得让他们凭空出现或立即知晓场内发生的事〕');
                presenceList.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (suspenses.length) {
                blocks.push('[悬念簿]');
                const seenS = new Set();
                suspenses.forEach(i => {
                    const key = i.text || '';
                    if (seenS.has(key)) return;
                    seenS.add(key);
                    blocks.push(`- ${key}`);
                });
            }
            if (holidays.length) {
                blocks.push(`〔剧情时间临近 ${holidays[0].holiday}｜氛围提示，可自然融入但不强求〕`);
                const seenH = new Set();
                holidays.forEach(i => {
                    const key = i.text || '';
                    if (seenH.has(key)) return;
                    seenH.add(key);
                    blocks.push(`- ${key}`);
                });
            }
            
            if (!blocks.length) return '';
            let full = `\n\n${NOTE}\n${blocks.join('\n')}\n${END}\n`;
            // [v3.25] 召回类型分级 + token 预算双层（MemoryPilot + 记忆库v5）:
            // 常驻分区（role=constant，每轮必注）优先保留；触发分区按预算裁剪
            const RESIDENT_MARKERS = ['[前情摘要]', '[角色状态]', '[角色关系]', '[关键事件·影响当前]', '[剧情时间线]', '[卷]', '[早前剧情概括]', '[角色长期关系网]', '[主角当前客观状态与生活习惯]', '[近期已了结事项', '[宏观世界线·纪元史记]', '[当前剧情时间]', '[类型化事实·长期]'];
            // [v3.91] 审计修复：config.recallTierEnabled 此前全项目零引用（分级恒开，开关形同虚设）。
            //         关闭时不做常驻/触发分区，全部块走统一预算裁剪。
            const _tierOn = this.config.config.recallTierEnabled !== false;
            const residentBlocks = _tierOn ? blocks.filter(b => RESIDENT_MARKERS.some(m => b.startsWith(m))) : [];
            const triggerBlocks = _tierOn ? blocks.filter(b => !RESIDENT_MARKERS.some(m => b.startsWith(m))) : blocks.slice();
            // [v2.1] P3: 注入预算裁剪（抄 stbme context-window：超预算优先保近期/相关）
            // [v3.114] 缝合：裁剪决策移入可测纯函数 injection-router（模块缺失时回落本体内联实现）
            let budget = this.config.config.injectionBudget || 3000;
            // [v3.25] token 预算双层：memoryTokenBudget（记忆注入 token 上限）扣减 keepRecentTokenReserve（最近正文预留）
            const reserve = numOr(this.config.config.keepRecentTokenReserve, 0);   // [v3.156] 语义等价，统一为 numOr 使「min=0 键无 || 回退」可被扫描断言
            const tokenBudget = Number(this.config.config.memoryTokenBudget) || 0;
            const _chatLen = (typeof window !== 'undefined' ? window.SillyTavern?.getContext?.()?.chat?.length : 0) || 0;
            const _ir = (typeof window !== 'undefined' ? window.LonShaInjectionRouter : null)
                || (typeof require !== 'undefined' ? (() => { try { return require('./injection-router.js'); } catch { return null; } })() : null);
            if (_ir) {
                budget = _ir.deriveBudget(budget, tokenBudget, reserve, _chatLen, {
                    adaptive: this.config.config.adaptiveBudget,
                    decayFloors: this.config.config.adaptiveBudgetDecayFloors,
                });
            } else {
                // [v3.208.0] 与 injection-router.deriveBudget **逐项对齐**（此前不等价，实测 1152 组里 58 组分歧）：
                //   · 缺 `Math.max(200, Math.floor(base))` ⇒ base<200 时内联不做 200 地板（100 vs 200）；
                //   · 缺 `Math.floor` ⇒ 非整数 base 内联不取整（3000.7 vs 3000）。
                //   同一事实两份真源，且**预测侧走的是模块**（cost-forecast 复用 deriveBudget）——
                //   不修就会导致「模块在时预测 200、模块不在时真跑 100」这类只在降级路径上出现的漂移。
                //   等价性由 tests/v3208 的 parity 用例枚举断言守住（漂移即红）。
                budget = Math.max(200, Math.floor(Number(budget) || 0));
                if (tokenBudget > 0) budget = Math.max(200, Math.min(budget, Math.floor(tokenBudget * 10 / 9)));  // [v3.133] CJK 口径（≈1.11 字符/token，与 estimateTextTokens 逆变换一致）
                if (reserve > 0) budget = Math.max(200, budget - Math.floor(reserve * 10 / 9));
                // [v3.50] 第三层：上下文感知自适应——聊天楼层少（上下文占用低）时自动扩容预算（早期多喂记忆加速建立世界感），
                // 楼层多时按基准收紧（保护最近正文空间）。扩张系数随楼层衰减，clamp 0.6x~1.8x 基准。
                if (this.config.config.adaptiveBudget !== false) {
                    try {
                        if (_chatLen > 0) {
                            const decayRef = Number(this.config.config.adaptiveBudgetDecayFloors) || 80;
                            const factor = Math.max(0.6, Math.min(1.8, 1.8 - (_chatLen / decayRef) * 1.2));
                            budget = Math.max(200, Math.floor(budget * factor));
                        }
                    } catch (e) { /* 上下文不可用时用基准预算 */ }
                }
            }
            const _preTrimLen = full.length;   // [v3.144] CP: 预算实测基线（裁剪前字符数）
            const keepCount = this.config.config.budgetStrategy || 'balanced';
            const _opt = {};   // [v3.251.0] M-O3：构建期外部输入口（本版**不扩签名**，见下）
            /* 为什么这里不写成 `opts` 形参：本方法的方法头字面量是**判据的一部分**
             *   （tests/v3216 的 HOST_METHODS 逐一按字面量抽方法体、v3211 的负控制
             *   按方法头定位真源码破坏点）。改签名会让那些
             *   判据定位失败 —— 判据失效比方法签名健壮性重要得多，故签名**一字不动**。
             *   本轮需要外部输入的只有「原始命中数」，而它在本仓有**更可靠的来源**：
             *   召回自检账本（`_recallAudit`）按楼层配对取，不依赖调用方传参。
             *   将来若真要从外部注入，走 `_opt` 的赋值口（属性挂载），不改方法头。 */
            if (this.__buildInjectionOpts && typeof this.__buildInjectionOpts === 'object') {
                Object.assign(_opt, this.__buildInjectionOpts);
            }
            /* [v3.251.0] M-O3 第 ⑤ 条：**真实 tokenizer 探测**（按能力探测，不按版本号硬判）。
             *   为什么必须在**每次构建时**探一次而不是启动时缓存一次：酒馆的 tokenizer
             *   随版本/加载顺序变化，缓存一份会在「本来是估算、后来宿主装上了」时继续报估算
             *   （正是本仓点名的「读数停在过去」形态）。探测本身是常量代价的几个 typeof。
             *   探测不到一律退回 `estimateTextTokens` 并**在回执上标明**是估算 ——
             *   绝不把估算值当精确值摆出去。 */
            const _tokSrc = (() => {
                try {
                    const _st = (typeof window !== 'undefined') ? window.SillyTavern : null;
                    const _c = (_st && typeof _st.getContext === 'function') ? _st.getContext() : null;
                    if (_c && typeof _c.getTokenCountAsync === 'function') return { mode: 'host-async', name: 'SillyTavern.getContext().getTokenCountAsync' };
                    if (_c && typeof _c.getTokenCount === 'function') return { mode: 'host', name: 'SillyTavern.getContext().getTokenCount' };
                    if (_st && typeof _st.getTokenCount === 'function') return { mode: 'host', name: 'SillyTavern.getTokenCount' };
                } catch (e) { /* 探测失败 ⇒ 估算 */ }
                return { mode: 'estimate', name: 'estimateTextTokens(CJK 口径)' };
            })();
            /* 本轮对应的**召回自检记录**：原始命中数（第 ① 阶段）与各源命中分布的唯一真源。
             *   配对纪律（本仓老账「别拿上一轮的读当本轮的」）：**只认楼层号相符的那一条**，
             *   不取「最后一条」。构建跑在召回之后、同一楼层，故楼层号可靠；
             *   楼层号缺失或对不上 ⇒ 不配对（宁可 null，也不给一条别的轮次的读数）。 */
            const _auditLastRec = (() => {
                try {
                    const _ra = this._recallAudit;
                    if (!Array.isArray(_ra) || !_ra.length) return null;
                    const _fl = Number(this._lastRecallFloor);
                    if (!Number.isFinite(_fl)) return null;
                    for (let i = _ra.length - 1; i >= 0; i--) {
                        if (Number(_ra[i] && _ra[i].floor) === _fl) return _ra[i];
                    }
                    return null;
                } catch (e) { return null; }
            })();
            /* [v3.251.0] M-O3：**回执草稿**（本次构建的事实，由构建过程自己派生）。
             *   与「事后反推」的分工（口径写死在这里，别处不得再解释一遍）：
             *     · 本对象里的一切（策略 / 是否裁剪 / 谁留下 / 切在哪 / 各阶段计数）都产生于
             *       **判定发生的地点**；
             *     · 下游的 `_injectionBlocksOf`、cost-ledger 与手机端 **读** 它，不再拿最终文本猜；
             *     · 它**不是第二份事实库**：只记本轮留下哪些块与各阶段计数，不复制块的内容语义，
             *       也不参与任何决策（决策全在 trimToBudget 内）。
             *   未超预算时 trimmed=false、keptAll=true，同样如实落下来。 */
            const _trace = this._injectionTraceDraft = {
                version: 1,
                strategy: keepCount,
                trimmed: false,
                hardTruncated: false,
                preTrimChars: _preTrimLen,
                budget: budget,
                tierOn: _tierOn,
                recallCount: Array.isArray(recalled) ? recalled.length : 0,
                /* [v3.251.0] M-O3 第 ③ 条：**五阶段计数**（原始命中 → 合并 → 有效性过滤 →
                 *   预算裁剪 → 最终保留）。每一格只写本仓**真能测**的量；测不出的写 null
                 *   并在 `stageNotes` 里写明为什么 —— 编一个 0 会让「没测到」与「真的是 0」同形。
                 *   口径（写死在这里，别处不得另解释一遍）：
                 *     · rawHits       各召回源返回条目总数（含重复），取自本仓召回自检账本
                 *                     最后一次记录；调用侧未带 / 楼层对不上 ⇒ null。
                 *     · merged        送入本函数的候选条数（已过合并去重与精选）。
                 *     · validityFiltered 构建期被**有效性规则**挡下的条数（分项见 byRule）。
                 *     · budgetTrimmed 预算裁剪丢掉的块数（裁剪回执给出；硬截断时不可测）。
                 *     · finalKept     最终进载荷的块数（裁剪回执给出）。 */
                stages: {
                    rawHits: (_auditLastRec && Number.isFinite(_auditLastRec.totalHits))
                        ? Number(_auditLastRec.totalHits)
                        : (Number.isFinite(_opt.rawHits) ? Number(_opt.rawHits) : null),
                    merged: Array.isArray(recalled) ? recalled.length : 0,
                    validityFiltered: null,
                    budgetTrimmed: null,
                    finalKept: null,
                    byRule: {
                        relationGated: _stageCnt.relationGated,
                        povOffstage: _stageCnt.povOffstage,
                        relationScoped: _stageCnt.relationScoped,
                        povScoped: _stageCnt.povScoped,
                    },
                },
                stageNotes: {
                    rawHits: ((_auditLastRec && Number.isFinite(_auditLastRec.totalHits)) || Number.isFinite(_opt.rawHits))
                        ? '' : '召回自检账本无**楼层相符**的记录（或本轮未跑召回）⇒ 原始命中数不可测',
                    validityFiltered: '',
                    budgetTrimmed: '',
                },
                /* [v3.251.0] M-O3 第 ⑤ 条：token 口径。**真实 tokenizer 可用就用真的**，
                 *   不可用只给字符数与**明确标记**的估算值。
                 *   修前全仓只有 `estimateTextTokens` 一个来源，而它在面板上被写成
                 *   「约 N token」—— 读的人分不清「酒馆真 tokenizer 算的」与「本插件估的」。
                 *   本仓是酒馆扩展，宿主若提供 tokenizer（SillyTavern 不同版本的挂载点不同，
                 *   故按能力探测而不是按版本号硬判）就用真的；探测不到如实退回估算并标注。 */
                tokenSource: _tokSrc.mode,
                tokenizer: _tokSrc.name,
                /* [v3.251.0] M-O3 第 ⑧ 条：**分层标识**。本仓只产出自己的注入块；
                 *   宿主最终请求体（世界书 / 角色卡 / 其它扩展塞进 prompt 的部分）
                 *   **不在本插件可观测面内** —— 如实标注不可测，不假装自己看得见。
                 *   故 `hostRequestBody` 的 `observed` 恒为 false：这一格存在的意义是
                 *   **说清边界**，而不是给出一个看起来很精确的宿主侧数字。 */
                layer: {
                    pluginBlocks: 'own',        // 本回执描述的就是本插件的注入块
                    hostRequestBody: 'unobserved',
                    hostNote: '宿主最终请求体（世界书/角色卡/其它扩展）不在本插件可观测面内 ⇒ 不可测',
                },
                /* [v3.251.0] M-O3 第 ⑦ 条：**禁用项注入量为零**的可判形式。
                 *   修前「某源被禁用 ⇒ 它没贡献任何块」这件事无处可查：块是渲染后的文本，
                 *   源归属在拼装时就丢了（cost-ledger 正是因此只能做「分节继承」的启发式）。
                 *   现在在**拼装现场**逐源记贡献块数（谁 push 的谁记账），于是
                 *   「禁用 ⇒ 该源块数为 0」是一条可在回执上直接断言的判据，而不是事后推断。 */
                sourceBlocks: _srcBlocks,
                /* 融合源（在召回侧生效、构建期不可分）单独一格：**不假装能拆**。
                 *   `recallPerSource` 是召回自检账本里各源命中数 —— 它是「召回给了几条」，
                 *   不是「注入里几条」；两件事分开摆，读的人自己不会混。 */
                fusedSourceBlocks: {
                    keys: _FUSED_SOURCES.slice(),
                    separable: false,
                    why: '这些源经召回候选池融合渲染，构建期无法把某个块归给某个源；禁用它们的效果是候选池少条目（见 recallPerSource）',
                    recallPerSource: (_auditLastRec && _auditLastRec.perSource) ? _auditLastRec.perSource : {},
                },
                disabledSources: Object.keys(_srcGate).filter((k) => _srcGate[k] === false),
            };
            // [v3.195] 召回只读边界。recalled 是已经发生过的记录，不是本轮指令。
            //   没有显式维护指令就不产生写回；与更新事实同键的旧记录只标 shadowed，不覆盖。
            //   这里只记账，不改 full 的正文——边界是「不得当成本轮动作」，不是再改一遍已拼好的块。
            try {
                if (_ir && typeof _ir.sealRecall === 'function') {
                    const _sealed = _ir.sealRecall(recalled, [], {});
                    this._lastRecallSeal = {
                        recalled: Array.isArray(recalled) ? recalled.length : 0,
                        shadowed: _sealed.shadowed || 0,
                        writable: Array.isArray(_sealed.writable) ? _sealed.writable.length : 0,
                        refusedWrite: _sealed.refusedWrite === true,
                        ts: Date.now()
                    };
                }
            } catch (e) { errLog(e, 'buildInjection.召回只读边界'); }
            /* [v3.274.0] O4：**是否真的走过裁剪路径**必须留一个本地事实。
             *   修前下游只看 `_trace.trimmed`（回执自己标的字段）就下结论，于是
             *   「模块在场但**没标** trimmed」被当成「没超预算 ⇒ 整批都在」——
             *   而那是**谎报全留**：载荷其实已经被裁过。
             *   两条真实可达的路径：模块版本错配（旧 router.js 不写回执）、
             *   模块调用抛错后回退内联（catch 分支）。两者都让 `trimmed` 停在 false。 */
            let _trimAttempted = false;
            if (full.length > budget) {
                _trimAttempted = true;
                // [v3.251.0] M-O3：把**重试参照**交给裁剪（模块在时用于重试判定，见下方 catch）
                if (_trace) _trace.preTrimFull = full;
                if (_ir) {
                    // [v3.114] 裁剪决策走可测纯函数（与内联实现等价；recallTierEnabled 关闭时 blocks 全为触发区）
                    full = _ir.trimToBudget(full, budget, _tierOn ? [...residentBlocks, ...triggerBlocks] : blocks, keepCount, { trace: _trace });
                } else {
                const strategy = keepCount;
                if (strategy === 'relevance') {
                    // 常驻全保留 + 触发保留 RRF 前 60%（[v3.273.0] O3 同源等价：候选序仍是相关性序，装多少由容量定）
                    const prefer = Math.max(3, Math.floor(triggerBlocks.length * 0.6));
                    const ranked = triggerBlocks.slice(0, prefer);
                    const _resFrameLen = residentBlocks.length ? (`\n\n${NOTE}\n${residentBlocks.join('\n')}`).length : 0;
                    const _trigBudget = Math.max(0, budget - _resFrameLen - (`\n${END}\n`).length - (residentBlocks.length ? 1 : (`\n\n${NOTE}\n`).length));
                    const keptT = [];
                    let _acc = 0;
                    for (const t of ranked) {
                        const _sep = (residentBlocks.length + keptT.length) ? 1 : 0;
                        if (_acc + t.length + _sep > _trigBudget) break;
                        keptT.push(t); _acc += t.length + _sep;
                    }
                    const kept = [...residentBlocks, ...keptT];
                    full = `\n\n${NOTE}\n${kept.join('\n')}\n${END}\n`;
                } else if (strategy === 'recency') {
                    // 保留常驻 + 近期分区（[v3.273.0] O3 同源等价：kept 同样按容量装，不再整批全塞）
                    const recencyTypes = ['[关键事件·影响当前]', '[剧情时间线]', '[角色状态]', 'POV', '[手机生活记忆]', '[前情摘要]', '[节日]'];
                    const _cands = triggerBlocks.filter(b => recencyTypes.some(k => b.startsWith(k) || b.includes(k)));
                    const _resFrameLen = residentBlocks.length ? (`\n\n${NOTE}\n${residentBlocks.join('\n')}`).length : 0;
                    const _trigBudget = Math.max(0, budget - _resFrameLen - (`\n${END}\n`).length - (residentBlocks.length ? 1 : (`\n\n${NOTE}\n`).length));
                    const keptT = [];
                    let _acc = 0;
                    for (const t of _cands) {
                        const _sep = (residentBlocks.length + keptT.length) ? 1 : 0;
                        if (_acc + t.length + _sep > _trigBudget) break;
                        keptT.push(t); _acc += t.length + _sep;
                    }
                    const kept = [...residentBlocks, ...keptT];
                    full = kept.length ? `\n\n${NOTE}\n${kept.join('\n')}\n${END}\n` : full.slice(0, budget);
                } else {
                    // balanced：常驻全保留 + 触发截断到剩余预算（[v3.273.0] O3 同源等价：TAIL 与连接符计入）
                    const residentFrame = `\n\n${NOTE}\n${residentBlocks.join('\n')}`;
                    const triggerBudget = Math.max(0, budget - residentFrame.length - (`\n${END}\n`).length);
                    const triggerKept = [];
                    let acc = 0;
                    for (const t of triggerBlocks) {
                        const sep = (residentBlocks.length + triggerKept.length) ? 1 : 0;
                        if (acc + t.length + sep > triggerBudget) break;
                        triggerKept.push(t); acc += t.length + sep;
                    }
                    // ★ 拼接必须与模块版**同构**（统一 join 常驻+触发），不能分开拼：
                    //   分开拼在**无常驻**时会多出一个连接符（实测 mod=152 / inl=153），
                    //   而 residentFrame 只用于算容量，不用于拼装。
                    full = `\n\n${NOTE}\n${[...residentBlocks, ...triggerKept].join('\n')}\n${END}\n`;
                }
                }   // [v3.114] 闭合 else 分支
                if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 注入预算裁剪: ${budget} 字符 (常驻${residentBlocks.length}块保留)`);
            }
            if (_trace) {
                /* [v3.251.0] M-O3：未裁剪路径也要留下**同形**的载荷内块清单。
                 *   理由：「没超预算、全部留下」与「裁剪后恰好全留下」在 `trimmed` 上是两态，
                 *   但下游要判「谁留下」时不该为此分两条路读 —— 两条路就是同形隐患的温床。
                 *
                 *   ★★ 但必须再分一层：本函数里的 `trimmed=false` 有**两种**来源，处置相反：
                 *     · 真的没超预算（走模块或走内联都一样）⇒ 整批都在载荷里，回执可给全下标；
                 *     · **模块缺席时的内联回落**（`_ir` 为空，裁剪在下面的 else 分支里做）
                 *       ⇒ 裁剪确实发生了，而**留下哪些块这件事没有留下回执**
                 *         （内联分支只拼 `full`，不记 kept 清单）。
                 *   修前本处若一律按「整批都在」填满下标，就是**谎报**：把真实被裁掉的块
                 *   报成保留 —— 实测会直接打红 v3216 的「有被裁掉的块」判据（本轮真实发生）。
                 *   故内联回落**如实记不可测**（`keptIdxInAll=null` + `traceFrom:'inline'`），
                 *   由消费侧退回 `includes` 并在逐块 `via` 上现形 ——
                 *   与 cost-ledger「不可测就写不可测」同一纪律。
                 *   不给内联分支补一份 kept 清单的理由：那会让「谁留下」这个事实在同一文件里
                 *   有两份实现，而两者迟早漂移（v3.208 已在 deriveBudget 上吃过这个亏）。 */
                const _allT = _tierOn ? [...residentBlocks, ...triggerBlocks] : blocks;
                _trace.blockCount = _allT.length;
                /* trimmed 的三态：false=真没超预算 / true=走模块裁过 / null=**裁了但不可测**
                 *   （模块缺席时的内联回落；判定见下方 `_ir` 分支）。
                 *   `keptAll` 必须与它同口径：`!null === true` 会把「不可测」静默读成
                 *   「全部留下」——正是本版要治的谎报形态，故此处显式按 `=== false` 算。 */
                _trace.keptAll = (_trace.trimmed === false);
                if (!_trace.trimmed) {
                    if (_ir && !_trimAttempted) {
                        _trace.traceFrom = 'router';
                        _trace.keptIdxInAll = _allT.map((_, i) => i);   // 整批都在载荷里
                        _trace.keptTexts = _allT.slice();
                        _trace.droppedTriggerIdx = [];
                    } else if (_ir && _trimAttempted) {
                        /* [v3.274.0] O4：走了裁剪路径、模块也在场，但回执**没标** `trimmed`
                         *   ⇒ 「留下哪些块」这件事没有留下可信回执。如实记不可测，
                         *   绝不按「整批都在」填满下标（那是把「测不了」写成「全部留下」）。
                         *   与内联回落同一处置，只是来源仍如实标 `router`（确实走了路由）。 */
                        _trace.traceFrom = 'router';
                        _trace.trimmed = null;
                        _trace.trimmedUnknown = true;
                        _trace.keptIdxInAll = null;
                        _trace.keptTexts = [];
                        _trace.droppedTriggerIdx = null;
                        _trace.contiguous = null;
                    } else {
                        /* 模块缺席时的内联回落：裁剪确实发生了（就在上面的 else 分支里），
                         *   但**留下哪些块这件事没有留下回执**（内联分支只拼 full，不记 kept 清单）。
                         *   这里若一律按「整批都在」填满下标，就是谎报 —— 实测会直接打红
                         *   v3216 的「有被裁掉的块」判据（本轮真实发生过一次，已修）。
                         *   故如实记**不可测**：`trimmed=null`（不是 false）+ `traceFrom='inline'`，
                         *   消费侧据此退回 `includes` 并让逐块 `via` 现形。
                         *   不给内联分支补一份 kept 清单的理由：那会让「谁留下」这个事实在同一
                         *   文件里出现两份实现，而两者迟早漂移（v3.208 已在 deriveBudget 上吃过）。 */
                        _trace.traceFrom = 'inline';
                        _trace.trimmed = null;
                        _trace.trimmedUnknown = true;
                        _trace.keptIdxInAll = null;
                        _trace.keptTexts = [];
                        _trace.droppedTriggerIdx = null;
                        _trace.contiguous = null;
                    }
                    if (_trace.trimmed === false) {
                        _trace.triggerTotal = (_tierOn ? triggerBlocks : blocks).length;
                        _trace.contiguous = true;
                        _trace.residentKept = _tierOn ? residentBlocks.length : 0;
                    }
                } else if (!_trace.traceFrom) {
                    // 模块在时由 trimToBudget 填 `traceFrom`；此处兜住「裁剪走了模块但没标来源」
                    _trace.traceFrom = _ir ? 'router' : 'inline';
                }
            }
            /* [v3.251.0] M-O3 第 ③ 条：**五阶段的最后两格收口**（预算裁剪 / 最终保留）。
             *   为什么拖到最后才填：这两格只有拿到**处置结果**才算得出 ——
             *   裁剪发生在上面，而「留下几块 / 丢掉几块」在裁剪回执里才有。
             *
             *   三态纪律（本仓老账，与 dedup.savedChars 同款）：
             *     · 有块级清单（未裁剪 / 模块裁过且给出了下标）⇒ 两个数都是**真读数**；
             *     · 硬截断 ⇒ 块级清单**不成立**（切口在块内部），两格记 null + 指明原因，
             *       绝不按 `blockCount - 明显估计` 编一个差数（那是把「测不了」写成数字）；
             *     · 内联回落 ⇒ 同上（裁剪真发生了，但没留清单）。
             *   `validityFiltered` 是各支**已测项之和**：只有测到的那几支才计入，
             *   一支都没测到记 null（不写 0 —— 0 是「测了，一条都没挡」）。 */
            if (_trace && _trace.stages) {
                const _st = _trace.stages;
                if (Array.isArray(_trace.keptIdxInAll) && Number.isFinite(_trace.blockCount)) {
                    _st.finalKept = _trace.keptIdxInAll.length;
                    _st.budgetTrimmed = Math.max(0, _trace.blockCount - _trace.keptIdxInAll.length);
                    _trace.stageNotes.budgetTrimmed = '';
                } else if (_trace.hardTruncated === true) {
                    _st.budgetTrimmed = null; _st.finalKept = null;
                    _trace.stageNotes.budgetTrimmed = '硬截断（切口落在块内部，块级保留清单不成立）⇒ 裁剪丢了几块 / 最终留了几块均不可测';
                } else if (_trace.trimmedUnknown === true || _trace.traceFrom === 'inline') {
                    _st.budgetTrimmed = null; _st.finalKept = null;
                    _trace.stageNotes.budgetTrimmed = '内联回落（注入裁剪模块缺席）：裁剪已发生但未留块级清单 ⇒ 不可测';
                } else {
                    // 未裁剪：整批都在载荷里，两格是真读数（不是 null）
                    _st.finalKept = Number.isFinite(_trace.blockCount) ? _trace.blockCount : null;
                    _st.budgetTrimmed = _st.finalKept === null ? null : 0;
                    _trace.stageNotes.budgetTrimmed = '';
                }
                const _ruleParts = [];
                if (Number.isFinite(_st.byRule.relationGated)) _ruleParts.push(_st.byRule.relationGated);
                if (Number.isFinite(_st.byRule.povOffstage)) _ruleParts.push(_st.byRule.povOffstage);
                if (_ruleParts.length) {
                    _st.validityFiltered = _ruleParts.reduce((a, b) => a + b, 0);
                    _trace.stageNotes.validityFiltered = '';
                } else {
                    _st.validityFiltered = null;
                    _trace.stageNotes.validityFiltered = '本轮没有可测的有效性过滤支（关系披露模块缺席 / 无在场角色时不筛 / 相关分区未参与构建）⇒ 不可测（不写 0）';
                }
            }
            // [v3.144] CP: 预算实测（丢弃可见性）——此前超预算时 trimToBudget 静默 break，
            // 丢了几块/丢多少字符/命中哪个策略全部无处可查，调预算只能靠猜。
            try {
                const _allB = _tierOn ? [...residentBlocks, ...triggerBlocks] : blocks;
                // [v3.215.0] R2-A：逐块读数草稿 —— 「谁进了 / 谁被裁」的**唯一来源**。
                //   放在这里的原因：`_allB` 正是本次裁剪的输入全集（常驻 + 触发），
                //   而 `full` 是裁剪后的最终载荷。两者的差集就是被裁掉的那些块。
                //   修前这两件事都无处可查：`_lastBudgetStats` 只报聚合数
                //   （丢了几块 / 多少字符），回答不了「丢的是哪一块」。
                //   非致命：失败时不写草稿（读数会如实报 0 块），不连坐注入本身。
                try { this._lastInjectionDraft = this._injectionBlocksOf(_allB, full); } catch (e) { errLog(e, 'buildInjection.逐块读数'); }
                /* [v3.274.0] O4：**块级聚合数改为从逐块读数导出**，不再拿最终文本 
                 *   `full.includes(块)` 反推。
                 *   为什么必须换（同一事实两个真源）：逐块读数自 v3.251.0 起按下标 / span 判定，
                 *   而这一格此前仍走文本反推 —— 于是**同一轮里**可以同时出现
                 *   「逐块读数：两条同文块裁掉了 1 条」与「预算实测：2 块全留」。
                 *   反推的两个已知盲区（同文重复 / 互为子串 / 半段截断）在那一格已被治理，
                 *   此处只做聚合，不另立一套判据。
                 *
                 *   三态（本仓老账，与 dedup.savedChars 同款）：
                 *     · `via` 全为精确判据（trace / trace-span）⇒ 聚合数是**真读数**；
                 *     · 硬截断但块 span 定位不到 ⇒ 整块与半段都不可判，如实记该态；
                 *     · 退回 `includes`（回执缺席 / 内联回落 / 规模不符）⇒ **未知，记 null**，
                 *       不倒推成一个数 —— 反推在那些场景恰好偏向「全部留下」（未裁剪时
                 *       每条块都能被载荷命中），那正是本版要断的谎报形态。
                 *   混合判据（一批里既有精确又有反推）整体不当精确读数：报一个总数会让读的人
                 *   以为整批都精确。 */
                const _draft = Array.isArray(this._lastInjectionDraft) ? this._lastInjectionDraft : [];
                const _vias = new Set(_draft.map(x => String((x && x.via) || '')));
                const _keptFrom = (!_draft.length) ? 'unknown'
                    : (_vias.size === 1 && _vias.has('trace')) ? 'trace'
                        : (_vias.size === 1 && _vias.has('trace-span')) ? 'trace-span'
                            : (_vias.size === 1 && _vias.has('trace-truncated-nospan')) ? 'trace-truncated-nospan'
                                : 'unknown';
                const _keptMeasurable = (_keptFrom === 'trace' || _keptFrom === 'trace-span');
                const _keptN = _keptMeasurable ? _draft.filter(x => x && x.kept).length : null;
                const _partialN = (_keptFrom === 'trace-span') ? _draft.filter(x => x && x.partial).length : null;
                /* [v3.274.0] O4：**三态三分**——整块保留 / 整块被丢 / 被切半，互斥且穷尽。
                 *   修前 `_droppedN = 总数 - 保留数` 把「被切半」也算进「被丢」：
                 *   半段其实进了载荷，读成「整块被丢」是另一种假读数（与把「测不了」写成 0 同族）。
                 *   故被丢一律排除 partial；被丢 + 被切半 + 保留 = 总数（可在回执上直接对账）。 */
                const _droppedN = _keptMeasurable ? _draft.filter(x => x && !x.kept && !x.partial).length : null;
                const _keptBlockChars = _keptMeasurable
                    ? _draft.reduce((a, x) => a + ((x && x.kept && Number.isFinite(x.chars)) ? x.chars : 0), 0) : null;
                const _droppedBlockChars = _keptMeasurable
                    ? _draft.reduce((a, x) => a + ((x && !x.kept && !x.partial && Number.isFinite(x.chars)) ? x.chars : 0), 0) : null;
                const _partialBlockChars = (_keptFrom === 'trace-span')
                    ? _draft.reduce((a, x) => a + ((x && x.partial && Number.isFinite(x.chars)) ? x.chars : 0), 0) : null;
                const _candChars = _allB.reduce((a, b) => a + String(b == null ? '' : b).length, 0);
                const _ro = (_trace && _trace.residentOverflow && typeof _trace.residentOverflow === 'object')
                    ? _trace.residentOverflow : null;
                const _roChars = (_ro && Number.isFinite(_ro.chars)) ? _ro.chars : null;
                const _roOver = (_ro && Number.isFinite(_ro.over)) ? _ro.over : null;
                const _droppedSamples = _draft.filter(x => x && !x.kept && !x.partial && x.label)
                    .slice(0, 3).map(x => String(x.label).slice(0, 36));
                const _keptWhy = _keptMeasurable ? '' : (_keptFrom === 'trace-truncated-nospan'
                    ? '硬截断但块 span 定位不到 ⇒ 整块 / 半段均不可判'
                    : (!_draft.length ? '逐块读数缺席（本轮无块或读数构造失败）⇒ 不可测'
                        : '留存判据退回文本反推（回执缺席 / 内联回落 / 规模不符）⇒ 已知盲区，不倒推成功'));
                this._lastBudgetStats = {
                    requested: budget, beforeChars: _preTrimLen, afterChars: full.length,
                    droppedChars: Math.max(0, _preTrimLen - full.length),
                    keptBlocks: _keptN, totalBlocks: _allB.length, droppedSamples: _droppedSamples,
                    /* [v3.274.0] O4：**参与三态判定的块数**（空块是候选里的占位，不占载荷字符，
                     *   逐块读数按 v3251 G3 的纪律把它排除在保留/丢弃之外）——
                     *   于是 `保留 + 被丢 + 被切半 = countedBlocks` 是一条可直接对账的等式，
                     *   而 `totalBlocks`（候选总数）保持原语义不动（旧字段兼容）。 */
                    countedBlocks: _draft.length,
                    droppedBlocks: _droppedN, partialBlocks: _partialN,
                    keptFrom: _keptFrom, keptWhy: _keptWhy,
                    candidateChars: _candChars, keptBlockChars: _keptBlockChars, droppedBlockChars: _droppedBlockChars,
                    partialBlockChars: _partialBlockChars,
                    overBudgetChars: Math.max(0, full.length - budget),
                    residentOverflowChars: _roChars, residentOverflowOver: _roOver,
                    strategy: keepCount, tokens: estimateTextTokens(full),
                    tokenBudget: tokenBudget || null, ts: Date.now(),
                };
                // [v3.193.0] 成本账本：把「总量丢弃」拆成「谁的丢弃」。
                //   常驻（每轮都在）与触发（命中才有）成本量级差十倍，混在一个数字里没法取舍；
                //   反向召回的真实代价也在此显形（它不新增块，只改排序 ⇒ 挤掉别人）。
                const _CL = _costLedgerLib();
                if (_CL && typeof _CL.buildCostLedger === 'function') {
                    this._lastCostLedger = _CL.buildCostLedger({
                        allBlocks: _allB,
                        injectedText: full,
                        preTrimChars: _preTrimLen,
                        budget: budget,
                        strategy: keepCount,
                        residentMarkers: RESIDENT_MARKERS,   // 常驻口径的单一真源在本文件，不另立一套
                        emotionOpposite: this._emoOppositeRead,
                        promoted: this._emoOppositeMatched,
                        promotedSnippets: this._emoOppositeSnippets || {},
                        recallSources: (this._recallAudit && this._recallAudit.length
                            ? (this._recallAudit[this._recallAudit.length - 1].perSource || {}) : {}),
                        /* [v3.251.0] M-O3 第 ⑦ 条：开关表提到拼装前建一次（`_srcGate`），
                         *   此处**原样引用同一对象**。修前这里是就地写死的一份表 ——
                         *   若回执再抄一份就是「同一事实两个真源」，而漂移的表现恰好是
                         *   「禁用项仍被报成有注入」。键面与语义一字未改。 */
                        enabledSources: _srcGate,
                        /* [v3.251.0] M-O3：**把裁剪回执交给账本**，让它不再靠 `includes` 反推
                         *   「谁被留下」。这是「禁用项不计入实际注入成本」可信的前提：
                         *   块级留存数从回执来，才有资格谈「某个被禁用的源贡献了多少成本」。 */
                        trace: _trace,
                        tokensOf: estimateTextTokens,
                        now: this._lastBudgetStats.ts,
                    });
                    this._lastBudgetStats.ledger = this._lastCostLedger;
                    this._lastBudgetStats.ledgerLine = (_CL.costLine ? _CL.costLine(this._lastCostLedger) : '');
                } else {
                    // 模块缺席不伪装成「成本为零」：留 null + 诊断面报「模块未加载」
                    this._lastCostLedger = null;
                    this._lastBudgetStats.ledger = null;
                }
                // [v3.208.0] 成本**预测** + 预测/实测对账。
                //   预测用的是与真路径**同一批纯函数**（injection-router 的 deriveBudget/trimToBudget），
                //   故「预测值」不是近似公式，而是「同样输入下真路径会算出什么」的复算——
                //   两者一旦漂移，说明真路径被改了而预测没跟上（或反之），对账会当场报 drift。
                try {
                    const _CF = _costForecastLib();
                    if (_CF && typeof _CF.forecast === 'function') {
                        this._lastForecast = _CF.forecast({
                            allBlocks: _allB,
                            residentMarkers: RESIDENT_MARKERS,
                            baseBudget: this.config.config.injectionBudget || 3000,
                            tokenBudget: tokenBudget,
                            reserve: reserve,
                            chatLength: _chatLen,
                            adaptive: this.config.config.adaptiveBudget,
                            decayFloors: this.config.config.adaptiveBudgetDecayFloors,
                            strategy: keepCount,
                            router: _ir,
                            promotedSnippets: this._emoOppositeSnippets || {},
                            tokensOf: estimateTextTokens,
                            now: this._lastBudgetStats.ts,
                        });
                        this._lastReconcile = (typeof _CF.reconcile === 'function')
                            ? _CF.reconcile(this._lastForecast, this._lastCostLedger)
                            : null;
                        this._lastBudgetStats.forecast = this._lastForecast;
                        this._lastBudgetStats.reconcile = this._lastReconcile;
                        this._lastBudgetStats.forecastLine = (_CF.forecastLine ? _CF.forecastLine(this._lastForecast) : '');
                    } else {
                        this._lastForecast = null; this._lastReconcile = null;
                        this._lastBudgetStats.forecast = null;
                        this._lastBudgetStats.reconcile = null;
                    }
                } catch (e) { errLog(e, 'buildInjection.成本预测'); }
            } catch (e) { errLog(e, 'buildInjection.预算实测'); }
            return full;
        }
        
        /**
         * [v3.215.0] R2-A：注入读数的**唯一构造点**。
         *   修前实测（真源码两条写入点）：`_lastInjection` 同时被
         *     · `onBeforeGeneration`（真注入），
         *     · `selfCheck()` 的「召回管线 dry-run（**不注入**，只验证链路通）」
         *   写入，而面板文案写的是「最近一次实际注入 … 即 AI 真实所见」。
         *   于是「跑了一次诊断」与「跑了一次真生成」在下游**处置相反**，读数上却同形。
         *
         *   现在这里收口：真生成路径一律经本方法写；诊断另走 `_diagnostics.dryRun`，
         *   连键名都不共用（不叫 `_lastInjection`），从根上不可能再塌陷。
         *
         *   恒定 10 键，一个不少 —— 「少写一个键」就是失败分支与成功分支不同形，
         *   本仓在 `repairReceipt` 上刚治理过同一形态（下游按 shape 编程）。
         *   `origin` 缺省即 `'generation'`：**诊断必须显式另走一路**，不得靠「没传」蒙混。
         *
         *   `round` 是「第几轮」的单一真源（调用方不该自己数）：
         *     0 块的一轮也照常推进轮次 —— 这正是「这轮 0 块」与「这轮还没跑」的分界。
         *   `prev` 照旧串上一轮 html（面板 diff 高亮用），首轮为 null。
         */
        _injectionRecord(extra) {
            const e = extra || {};
            const html = String(e.html == null ? '' : e.html);
            const blocks = Array.isArray(e.blocks) ? e.blocks : [];
            const round = Number.isFinite(e.round) ? e.round : (Number(this._injectionRound) || 0);
            const rec = {
                html,
                tokens: Number.isFinite(e.tokens) ? e.tokens : estimateTextTokens(html),
                ts: Number.isFinite(e.ts) ? e.ts : Date.now(),
                prev: (this._lastInjection && this._lastInjection.html) || null,
                origin: String(e.origin || 'generation'),
                /* [v3.218.0] R2-E：这一轮的**结局**。修前中止与完成同形（都停在注入那一刻），
                 *   而两者处置相反 —— 前者该重发、后者该看回复。
                 *   缺省 'pending'（已注入、结局未完），由 `_injectionEnd` 从两个事件落定。 */
                outcome: String(e.outcome || 'pending'),
                round,
                blocks,
                total: Number.isFinite(e.total) ? e.total : blocks.length,
                kept: Number.isFinite(e.kept) ? e.kept : blocks.filter(b => b && b.kept).length,
                gen: Number.isFinite(e.gen) ? e.gen : (Number(this._genSeq) || 0),
            };
            this._lastInjection = rec;   // ← 全源码**唯一**赋值点（结构判据 v3216 T2 守着）
            return rec;
        }
        /**
         * [v3.215.0] R2-A：本轮逐块读数的**重算**（从块清单与最终载荷现算）。
         *   为什么重算而不是在拼装时一路收集：拼装函数有 20+ 个 `blocks.push`
         *   分散在静态区 / 动态区 / 预算裁剪三处，逐处收集等于把「谁进了」这个事实
         *   抄成二十份真源。这里只做一次判定：**块文本在最终载荷里出现过 ⇒ kept**。
         *
         *   [v3.251.0] M-O3 **改判据**：优先读构建过程派生的**回执**（`_injectionTraceDraft`
         *   的 `keptIdxInAll`），只在回执不可用/规模对不上时才退回文本 `includes`。
         *   为什么必须换：修前那条 `indexOf(块) >= 0` 有两个实测盲区（探针 `/tmp/mo3/probe1.mjs`
         *   A 例的实证）——
         *     · **同文重复**：候选含两条完全相同的触发块、预算只装得下一条时，
         *       留下的那条让**两条**的 `indexOf` 都 ≥ 0 ⇒ 把「裁了一份」读成「两份都留」；
         *     · **半段截断**：recency 硬截断切在块内部 ⇒ 半段块被读成「整块被丢」。
         *   回执按下标说话（`keptIdxInAll`），这两态在构造上不可能发生。
         *   `via` 字段如实登记本次用的是哪条判据 —— 「换了判据」这件事本身必须可见，
         *   否则下一次读这块读数的人会以为它一直是精确的。
         *
         *   逐块键面恒定 6 项：`ref / id / label / kept / chars / reason / at`。
         *   被裁的块也必须可辨认（`label` 取块首行，截断到 40 字），
         *   否则「丢了什么」在面板上仍然是一团空白。
         */
        _injectionBlocksOf(allBlocks, fullText) {
            const list = Array.isArray(allBlocks) ? allBlocks : [];
            const full = String(fullText == null ? '' : fullText);
            /* 回执可用性两问（缺一不可，且必须**分开**问）：
             *   ① 这批回执对的是不是本批块清单（`blockCount` 规模自证）——
             *      诊断 dry-run 路径也会调 buildInjection 并各自重建草稿，
             *      不核对就会按**别人那批**的下标判 kept（错读数且看不出来）；
             *   ② 回执是「块级清单」还是「硬截断」形态 —— 后者不成立块级清单，
             *      只能判「整块落在切点内 / 被切半」，不能假装能判整块。 */
            const tr = this._injectionTraceDraft;
            const traceUsable = !!(tr && tr.version && Number(tr.blockCount) === list.length);
            // 来源必须是**路由模块**：内联回落时 `keptIdxInAll` 为 null（不可测），
            //   这里再把 `traceFrom` 也纳入条件，防止将来有人给内联分支补一份清单后
            //   消费侧仍按旧口径读（那时「清单来自哪」必须重新过一遍这道门）。
            const idxOk = traceUsable && tr.traceFrom === 'router' && Array.isArray(tr.keptIdxInAll);
            // 第二态：硬截断（recency 无保留项时的 `slice(0, budget)`）。它与「块级清单」
            //   互斥（那时回执把 keptIdxInAll 显式置 null），故两态的先后不影响判定。
            const hardCut = traceUsable && tr.hardTruncated === true;
            const keptSet = idxOk ? new Set(tr.keptIdxInAll) : null;
            const sliceAt = hardCut ? Number(tr.sliceAt) : NaN;
            const out = [];
            for (let i = 0; i < list.length; i++) {
                const text = String(list[i] == null ? '' : list[i]);
                if (!text) continue;
                const at = full.indexOf(text);
                /* 三态判据，互斥且穷尽（每条都真的可达，不存在「声明了却不发生」的分支）：
                 *   idxOk   回执带块级下标清单 ⇒ 按下标判（精确，同文重复也分得开）
                 *   hardCut 回执是硬截断形态   ⇒ 整块落在切点内才算 kept，跨切点记 partial
                 *   否则     回执缺席/规模不符  ⇒ 退回文本反推（已知盲区如实标注） */
                let kept, via, partial = false;
                if (idxOk) { kept = keptSet.has(i); via = 'trace'; }
                else if (hardCut) {
                    /* 硬截断：块级清单不成立，改按**原始 full 的 span** 判三态。
                     *   为什么不能用截断后的 `full.indexOf(块)` 判：切半的块在截断文本里
                     *   根本找不到完整文本（indexOf = -1），于是「被切半」与「整块被丢」
                     *   会双双落进同一个 false —— 那正是修前那个盲区。
                     *   span 缺席（未定位到 / 无 span 表）⇒ 一律 kept=false 且 partial=false，
                     *   并在 `via` 上标明是降级判据，不假装精确。 */
                    const sp = (Array.isArray(tr.blockSpans) && Array.isArray(tr.blockSpans[i])) ? tr.blockSpans[i] : null;
                    if (sp) {
                        kept = sp[1] <= sliceAt;
                        partial = (sp[0] < sliceAt && sp[1] > sliceAt);
                        via = 'trace-span';
                    } else { kept = false; partial = false; via = 'trace-truncated-nospan'; }
                } else { kept = at >= 0; via = 'includes'; }
                const head = text.split('\n')[0].trim();
                out.push({
                    ref: this._injectionRefOf(i),
                    id: i,
                    label: head.length > 40 ? head.slice(0, 40) + '…' : head,
                    kept,
                    chars: text.length,
                    reason: partial ? 'truncated-partial' : (kept ? 'kept' : 'dropped-budget'),
                    at: (kept && at >= 0) ? at : null,
                    via: via,
                    // 半段：块的下标在切点之前、末尾在切点之后 —— 真实发生过的「裁剪半段」，
                    //   修前它与「整块被丢」同形（两者都只是 includes=false）。
                    partial: partial,
                });
            }
            return out;
        }
        /**
         * [v3.216.0] R2-B：本轮注入读数的**暂存口**（生成路径在 await 内部调）。
         *   只写 `_injectionPending`，**绝不动 `_lastInjection`** ——
         *   那是「AI 真实所见」的唯一读数，它只能由**代际确认过的提交**写。
         *   为什么不能在这里直接落地：本方法跑在 `await onBeforeGeneration()` 里，
         *   而代际守卫在 await **之后**才判定（快速连发时先发那一轮必定过期）。
         *   提前落地 = 把一次**从未生效**的注入写成「最近一次实际注入」。
         */
        _injectionStage(payload) {
            const p = payload || {};
            const blocks = Array.isArray(p.blocks) ? p.blocks : [];
            const rec = {
                html: String(p.html == null ? '' : p.html),
                blocks,
                total: Number.isFinite(p.total) ? p.total : blocks.length,
                kept: Number.isFinite(p.kept) ? p.kept : blocks.filter(b => b && b.kept).length,
                gen: Number.isFinite(p.gen) ? p.gen : (Number(this._genSeq) || 0),
                stagedAt: Date.now(),
            };
            this._injectionPending = rec;
            return rec;
        }
        /**
         * [v3.216.0] R2-B：读数的**唯一落地点**（代际确认之后调）。
         *
         *   ① 轮次号只在**这里**推进：被丢弃的那一代不占号，于是「第 N 轮」
         *     恒等于「真正生效过的第 N 次注入」。若轮次在暂存时就推进，读数上会多出一些
         *     从未生效的空号，而下游把 round 当作「有效注入次数」用。
         *   ② 内部再做一道代际核对：即便被误调（外层守卫被绕过 / 被当作工具单用），
         *     也**不会默默落一个别的代的载荷** —— 不符即返回 null，由留痕口处置。
         *   ③ 提交后清空暂存：不清则下一轮若没暂存，会被误认为「本轮的载荷」。
         */
        _injectionCommit(myGen) {
            const p = this._injectionPending;
            const gen = Number.isFinite(myGen) ? myGen : (Number(this._genSeq) || 0);
            if (!p) return null;
            if (gen !== (Number(this._genSeq) || 0)) return null;   // ② 代际不符：不落地、不消耗暂存（由留痕口处置）
            /* [v3.217.0] R2-D ②b **载荷自身代**核对：上面那一道只看「调用者传进来的代」，
             *   拦不住「载荷由 A 路径留下、被 B 路径提交」。R2-B 立下的「过期清暂存」只覆盖
             *   「过期分支跑了」那种情形；而**根本没人提交它**的载荷会一直悬在暂存里，
             *   被下一轮的提交当成自己的载荷落成读数（round 照常前进，gen 却停在旧代）。
             *   这正是 R2-B 注释点名过的「张冠李戴比不落地更坏」，只是来自另一侧。
             *   不符即**不落地**并按过期收尾：清暂存 + 留痕 —— 既不落成读数，也不静默消失。 */
            if (Number.isFinite(p.gen) && p.gen !== gen) {
                try { this._injectionDiscardStale(p.gen); } catch (e) { errLog(e, '注入提交.无主载荷收尾'); }
                return null;
            }
            this._injectionRound = (Number(this._injectionRound) || 0) + 1;
            const rec = this._injectionRecord({
                html: p.html, origin: 'generation', blocks: p.blocks,
                total: p.total, kept: p.kept,
                round: this._injectionRound, gen: p.gen,
            });
            this._injectionPending = null;   // ③
            return rec;
        }
        /**
         * [v3.217.0] R2-D：一条发布路径本次生成的**收尾唯一入口**。
         *
         *   为什么必须有：R2-B 之后，「读数落地」与「过期收尾」是两件事，由调用方按序拼；
         *   而本仓有**两条**发布路径（`GENERATION_STARTED` 事件 / `window.lonsha_memory_interceptor`
         *   兼容入口）。修前 interceptor 那条**根本不收尾** ⇒ 它的暂存永久悬空，
         *   成了「被别的代捡起」的现成供体。让每条路径各抄一遍「先提交、不成再丢弃」，
         *   就是本仓 v2.97 之前「同一口径被抄 7 份」的老形态 —— 收尾的正确性
         *   （不重复留痕、不留下无主暂存）属于**引擎不变量**，只能有一份。
         *
         *   语义（三条，互斥且穷尽）：
         *     · 暂存属于本次代 ⇒ 提交落地（轮次推进、读数更新）；
         *     · 暂存属于别的代 ⇒ `_injectionCommit` 内部已按过期收尾并返回 null ⇒ 这里**不再**留痕（防重复计数）；
         *     · 压根没有暂存（本轮什么都没留下）⇒ 返回 null 且**不**记过期（那不是「迟到」，是「无内容」）。
         *   `had` 必须在提交**之前**读：提交成功会把 `_injectionPending` 清空，
         *   事后读就分不清「本来就没有」与「刚刚提交掉了」—— 那正是本仓最忌的两义同形。
         */
        _injectionClose(myGen) {
            const had = !!this._injectionPending;
            const rec = this._injectionCommit(myGen);
            if (rec) return rec;
            // 提交不成且暂存仍在 ⇒ 按过期收尾；已被提交内部清掉的不重复留痕。
            if (had && this._injectionPending) {
                try { this._injectionDiscardStale(myGen); } catch (e) { errLog(e, '注入收尾.过期留痕'); }
            }
            return null;
        }
        /**
         * [v3.218.0] R2-E：给**当前读数**标注这一轮的结局（唯一标注入口）。
         *
         *   为什么必须有：修前 `GENERATION_ENDED`（用户 Esc 中止）只复位 `_generationActive`，
         *   于是读数上「被中止」与「正常完成」**同形** —— 两者处置相反（前者该重发、
         *   后者该看回复），压成一态就是本仓最贵的那类错读数。
         *
         *   三条语义（互斥且穷尽）：
         *     · `kind === 'received'`（MESSAGE_RECEIVED，本轮闭环）⇒ `'completed'`；
         *     · 其余（`GENERATION_ENDED`）⇒ `'aborted'`；
         *     · **只从 `'pending'` 迁出**：已判定的不重写。因为 ST 的正常次序是
         *       `MESSAGE_RECEIVED` **先于** `GENERATION_ENDED`，若无此门，一次正常完成
         *       会被随后的 ENDED 改写成「中止」——那正是「用一个看得见的错换一个看得见的错」。
         *   无读数时（本轮没跑过注入）计入 `noReadout`：**「没有可标注的注入」与
         *   「标注成功」是两件事**，不能都表现为「函数跑过了」。
         */
        _injectionEnd(kind) {
            try {
                const st = this._injectionEnded || (this._injectionEnded = { completed: 0, aborted: 0, noReadout: 0, afterReadout: 0 });
                const inj = this._lastInjection;
                if (!inj || typeof inj !== 'object') { st.noReadout += 1; return null; }
                if (inj.outcome !== 'pending') { st.afterReadout += 1; return inj.outcome; }   // 已判定：不重写（幂等）
                const next = (kind === 'received') ? 'completed' : 'aborted';
                inj.outcome = next;
                inj.outcomeAt = Date.now();
                st[next] += 1;
                return next;
            } catch (e) { errLog(e, '注入读数.结局标注'); return null; }
        }
        /** [v3.215.0] R2-A：块引用键。本轮内唯一（含轮次号），跨轮不混淆。 */
        _injectionRefOf(i) {
            const round = Number(this._injectionRound) || 0;
            return 'inj_' + round + '_' + (Number.isFinite(i) ? i : 0);
        }
        /**
         * [v3.215.0] R2-A：代际过期的**留痕口**（`GENERATION_STARTED` 的代际守卫调用）。
         *   修前：过期只打一行 console.log —— 读数上「过期被丢弃」与「从未跑过」同形。
         *   修后：累计计数 + 记下是哪一代过期、当下是哪一代。
         *
         *   ★ **刻意不碰 `_lastInjection`**：迟到清理若回写读数，就会把上一次真注入的
         *     读数擦掉 —— 那等于用一个看得见的错误换一个看不见的错误。
         *     本方法不抛：它被事件处理器调用，抛出会让守卫本身变成故障源。
         */
        _injectionDiscardStale(myGen) {
            const staleGen = Number.isFinite(myGen) ? myGen : -1;
            const currentGen = Number(this._genSeq) || 0;
            this._injectionStale = (Number(this._injectionStale) || 0) + 1;
            // [v3.216.0] R2-B：过期必须**清掉暂存**。
            //   不清则下一次新鲜提交会捡起这一轮的载荷落成读数 —— 比「不落地」更坏：
            //   那是一份**张冠李戴**的读数，而读数上看不出来。
            //   与此同时把被丢弃载荷的读数也记下（chars / blocks），于是
            //   「过期丢了多大一块」在诊断面上可读，而不是只有一个计数。
            const _pd = this._injectionPending;
            const _payloadChars = (_pd && typeof _pd.html === 'string') ? _pd.html.length : 0;
            const _payloadBlocks = (_pd && Array.isArray(_pd.blocks)) ? _pd.blocks.length : 0;
            const _hadPending = !!_pd;
            this._injectionPending = null;   // ★ 必须清：不清则下一次新鲜提交会捡起旧载荷
            const rec = {
                staleGen,
                currentGen,
                kind: 'generation-superseded',
                at: Date.now(),
                stale: this._injectionStale,
                pendingDiscarded: _hadPending,
                payloadChars: _payloadChars,
                payloadBlocks: _payloadBlocks,
            };
            this._lastInjectionDiscard = rec;
            return rec;
        }
        /**
         * [v3.215.0] R2-A：诊断路径（selfCheck 的召回 dry-run）的注入读数。
         *   **不写 `_lastInjection`** —— 它只回答「链路通不通、载荷多大」，
         *   不回答「AI 看到了什么」。两者混在一个字段里就是本版修掉的归属塌陷。
         *   落点 `_diagnostics.dryRun`，`id:'diagnostics'` 可归因。
         */
        _buildDiagnosticsInjection(recalled) {
            let html = '';
            try { html = String(this.buildInjection(recalled) || ''); } catch (e) { html = ''; }
            const rec = {
                id: 'diagnostics',
                origin: 'dry-run',
                chars: html.length,
                bytes: html.length,
                html,
                ts: Date.now(),
            };
            this._diagnostics = Object.assign({}, this._diagnostics, { dryRun: rec });
            return rec;
        }
        /**
         * [v3.215.0] R2-A：注入面的**对外读数**（`buildBridgeSnapshot().injection` 的唯一来源）。
         *   修前：约定 / 伏笔 / 回扣 / 回声各有 `render()`，但快照 15 字段里**注入面一个都没有**，
         *   下游拿不到「AI 这一轮实际看到的是哪几块」。
         *   本方法纯读：未跑过一律 `null`（**不是空壳对象** —— 空壳会与「跑过、真的 0 块」同形）。
         */
        buildInjectionReadout() {
            const inj = this._lastInjection;
            if (!inj || typeof inj !== 'object') return null;
            const blocks = Array.isArray(inj.blocks) ? inj.blocks : [];
            return {
                origin: String(inj.origin || 'generation'),
                // [v3.218.0] R2-E：结局外供（9 → 10 键）。下游据此把「被中止」与「正常完成」分开报 ——
                //   本仓把它加进出面时，下游 `config/injection-contract.js` 必须**同一轮**接上，
                //   否则又是一次「上游给了没人读」。
                outcome: String(inj.outcome || 'pending'),
                round: Number(inj.round) || 0,
                ts: Number(inj.ts) || 0,
                tokens: Number(inj.tokens) || 0,
                chars: String(inj.html || '').length,
                html: String(inj.html || ''),
                total: Number.isFinite(inj.total) ? inj.total : blocks.length,
                kept: Number.isFinite(inj.kept) ? inj.kept : blocks.filter(b => b && b.kept).length,
                blocks: blocks.map(b => ({
                    ref: String((b && b.ref) || ''),
                    id: Number.isFinite(b && b.id) ? b.id : 0,
                    label: String((b && b.label) || ''),
                    kept: !!(b && b.kept),
                    chars: Number.isFinite(b && b.chars) ? b.chars : 0,
                    reason: String((b && b.reason) || ''),
                })),
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

        async selfCheck() {
            const report = { time: new Date().toLocaleString(), version: VERSION, stats: [], errors: _errBuf.slice(-15), pipeline: null, schema: null };   // [v3.2] DF4: 面板只展示最近15条
            try {
                // 1. 各子系统数据量统计
                const rows = [
                    ['图谱', `${this.graph.nodes.size} 节点 / ${this.graph.edges.size} 边`],
                    ['向量', `${this.vector.vectors.length} 条${(this.vector.vectors.length || 0) > (this.config.config.vectorMaxCount || 500) ? ' ⚠️超限' : ''}`],
                    ['摘要', `${this.summary.summaries.length} 条（${this.summary.summaries.filter(s => s.folded).length} 已折叠 / 卷 ${this.summary.volumes.length}）`],
                    ['日记', `${Object.keys(this.diary.diaries).length} 角色 / ${Object.values(this.diary.diaries).reduce((a, b) => a + b.length, 0)} 篇`],
                    ['时间线', `${this.timeline.entries.length} 条`],
                    ['悬念簿', `${this.suspense.items.filter(x => x.status === 'open').length} 开放 / ${this.suspense.items.length} 总`],
                    ['场景树', (() => {
                        try {
                            const sc = this.scene.scale ? this.scene.scale() : { nodes: this.scene.nodes.size, detailed: 0, depth: 0, visits: 0, presence: 0 };
                            const iv = this.scene.checkInvariants ? this.scene.checkInvariants() : { state: '—' };
                            return `${sc.nodes} 节点（细写 ${sc.detailed} / 最深 ${sc.depth} 层）/ ops ${this.scene.opsLog.length} / 到访 ${sc.visits} / 在场 ${sc.presence}${this.scene._absent ? ' ⚠️模块缺席' : ''}${iv.state === 'broken' ? ' ⚠️树断裂' : (iv.state === 'warn' ? ' ⚠️读数可疑' : '')}`;
                        } catch (e) { return '—'; }
                    })()],
                    ['物品台账', `${this.items.records.length} 件 / ops ${this.itemOps.length}${this.items._stale ? `（失活 ${this.items._stale}）` : ''}`],
                    ['台账校验', this._ledgerViolationSummary ? this._ledgerViolationSummary() : '—'],
                    ['补提取', `${this.scanMissingFloors().length} 个楼层无记忆（可在设置面板补提取）`],
                    ['反思', `${this.reflection.items.length} 条`],
                    ['POV', `${this.pov.povs.length} 条`],
                    ['角色状态', `${Object.keys(this.status.characters || {}).length} 人`],
                    // [v3.167] 人物状态（CSE）诊断行。此前近 20 行子系统统计里 CSE
                    //   **一行都没有**——于是「有状态在看不见的地方被丢弃 / 身份被改写」
                    //   没有任何用户可见出口。修后本行同时回答四个问题：
                    //   体量（几人几条）、容量压力（几人已顶格）、账本（丢/拒/自愈各几次）、
                    //   以及**索引是否与 store 同源**（幽灵键一旦非 0 即说明收口被绕过）。
                    (() => {
                        try {
                            const d = this.cse?.diagnose?.();
                            if (!d) return ['人物状态', '—（引擎未挂载）'];
                            let txt = `${d.chars} 人 / ${d.states} 条`;
                            if (d.towardKeys) txt += ` · 关系向 ${d.towardKeys}`;
                            txt += `（上限 ${d.caps.states}）`;
                            if (d.nearCapChars) txt += ` ⚠️${d.nearCapChars}人顶格`;
                            const lg = d.ledger || {};
                            if (lg.evicted || lg.rejected || lg.ghostReclaimed) {
                                txt += ` · 淘汰 ${lg.evicted || 0} / 拒绝 ${lg.rejected || 0}`;
                                if (lg.ghostReclaimed) txt += ` / 索引自愈 ${lg.ghostReclaimed}`;
                            }
                            // 幽灵键是实时体检（不依赖账本）：非 0 说明某条路径绕过了 _reindexTargets 收口
                            if (d.ghosts) txt += ` ⚠️索引幽灵 ${d.ghosts}（与 store 不同源）`;
                            if (d.lastReject) txt += ` · 末次拒绝 ${d.lastReject.character}·${d.lastReject.field}→${d.lastReject.toward}（关系向上限）`;
                            return ['人物状态', txt];
                        } catch (e) { errLog(e, 'selfCheck.cse'); return ['人物状态', '—（诊断异常）']; }
                    })(),
                    ['回响池', `${this.echo.pool ? this.echo.pool.size : (this.echo.items ? this.echo.items.length : '?')}`],
                    ['楼层账本', `${Object.keys(this.ledger.floors || {}).length} 楼${this.ledger.evicted ? `（已淘汰 ${this.ledger.evicted}）` : ''}`],
                    ['回滚失效', this._ledgerMissingRollbacks ? `${this._ledgerMissingRollbacks} 次（账本已淘汰）` : '0'],
                    // [v3.182] 账本回放：回答「删楼/前移时，每一本账到底撤了没有」。
                    //   此前回滚是 40 余处各自 try/catch，任何一处失败只进错误日志，
                    //   诊断面上一片正常。现在最近一次回放的分态直接念出来。
                    // [v3.235.0] R4-A：回滚预览 —— 回答「上一次破坏之前预告了什么」，
                    //   与下一行的「账本回放」（实际撤了多少）并列成对，预告落空一眼可见。
                    ['回滚预览', (() => {
                        try {
                            const _lr = _ledgerReplayLib();
                            if (!_lr || typeof _lr.previewLine !== 'function') return '—（模块缺席）';
                            const pv = this._lastRollbackPreview;
                            if (!pv) return '—（未预览）';
                            if (pv.module === 'absent') return '—（模块缺席）';
                            if (pv.skipped === 'floor-not-given') return '—（未给楼层）';
                            let txt = _lr.previewLine(pv.drop, pv.shift);
                            const act = this._lastReplayReport;
                            if (act && typeof act.dropped === 'number' && pv.drop && pv.drop.projected !== null
                                && act.floor === pv.floor) {
                                txt += ' ｜ 实撤 ' + act.dropped + ' 条';
                                if (act.dropped !== pv.drop.projected) txt += ' ⚠️与预告不符';
                            }
                            return txt;
                        } catch (e) { return '—（诊断异常）'; }
                    })()],
                    // [v3.236.0] R4-B：**定期快照观测**（缺口 2 的读数面）。
                    //   此前「每 50 楼一份快照」这句话在诊断面上没有任何对应读数：
                    //   落没落盘、落在哪个会话、锚点是谁的，一律不可见 —— 于是「切了会话
                    //   以后再也不存快照」这件事只能靠人去翻 IndexedDB 才知道。
                    //   本行刻意把三态分开写：未启用 / 本会话尚无锚点 / 锚点读数，
                    //   并把落盘账里**属于别的会话**的份数单列（跨会话污染一眼可见）。
                    ['定期快照', (() => {
                        try {
                            if (!this.config || !this.config.config || !this.config.config.autoSave) return '—（未启用）';
                            const _every = Number((this.config.config || {}).snapshotEveryFloors) || 50;
                            const _own = (this._snapshotByChat || []).length;
                            const _mine = (this._snapshotByChat || []).filter(r => r.chatId === this._snapshotAnchorChatId).length;
                            const _head = '每 ' + _every + ' 楼';
                            const _tail = '｜落盘账 ' + _own + ' 份（本会话 ' + _mine + '，跨会话 ' + (_own - _mine) + '）';
                            if (!this._snapshotAnchorChatId) return _head + '｜本会话尚无锚点' + _tail;
                            return _head + '｜锚点 ' + (Number(this._snapshotAnchorFloor) || 0) + ' 楼' + _tail;
                        } catch (e) { return '—（诊断异常）'; }
                    })()],
                    ['账本回放', (() => {
                        try {
                            const _lr = _ledgerReplayLib();
                            if (!_lr) return '—（模块缺席）';
                            return _lr.diagnoseLine(this._lastReplayReport);
                        } catch (e) { return '—（诊断异常）'; }
                    })()],
                    // [v3.164] 事件接线：回答「记忆提取到底有没有被接上」。此前 17 行子系统统计里
                    //   没有任何一行覆盖事件注册状态——注册失败时插件仍「看起来正常」，用户侧表现为
                    //   「聊了很久没有记忆」，却没有任何地方能看出原因（坏了没人知道）。
                    (() => {
                        const ci = (typeof this.stateProvider === 'function' ? this.stateProvider() : null);
                        if (!ci) return ['事件接线', '—（控制平面未初始化）'];
                        let txt = `${ci.events} 个监听`;
                        if (ci.lastEvent) txt += `（最后由 ${String(ci.lastEvent).replace(/^(MESSAGE_|GENERATION_)/, '')} 触发）`;
                        if (ci.registeredAt) txt += ' · ' + new Date(ci.registeredAt).toLocaleTimeString('zh-CN');
                        if (ci.unregisterAttempts) txt += ` · 卸载 ${ci.unregisterAttempts} 次`;
                        // [v3.165] 被拒绝的注册也要可见：类型无效时 bindEvent 拒绝挂载而非静默
                        //   on(undefined)，拒绝数是「宿主事件表与插件预期不一致」的唯一用户侧线索。
                        if (ci.rejected) txt += ` · 拒绝 ${ci.rejected} 次（${ci.lastReject || '类型无效'}）`;
                        if (ci.lastFailure || ci.events === 0) txt += ' ⚠️ ' + (ci.lastFailure || '尚无任何事件触发——若已聊天请检查 eventSource');
                        return ['事件接线', txt];
                    })(),
                    // [v3.166] 配置迁移：回答「本次载入迁了什么 / 跳过了什么 / 失败在哪」。
                    //   修前这三个迁移分支靠自引用构造 + 栈溢出收敛，迁移结果除了
                    //   一行成功 console.log 之外无任何记录（跳过与失败完全不可见）。
                    (() => {
                        const cm = this.config;
                        const m = cm?._lastMigrationReport;
                        if (cm?._configLoadError) {
                            return ['配置迁移', `⚠️ 载入失败：${cm._configLoadError}`];
                        }
                        if (!m) return ['配置迁移', '—（未执行载入）'];
                        let txt = `检查 ${m.checks} 项`;
                        if (m.applied?.length) txt += ` · 已迁移 ${m.applied.join('、')}`;
                        else txt += ' · 无迁移需要';
                        if (m.skipped?.length) txt += ` · 跳过 ${m.skipped.length}（${m.skipped.join('、')}）`;
                        if (m.failed?.length) txt += ` ⚠️ 失败 ${m.failed.length}（${m.failed.join('、')}）`;
                        return ['配置迁移', txt];
                    })(),
                    // [v3.166] 写盘合流：回答「这一轮写盘吞了几批、有没有丢过、确认修订号走到哪」。
                    //   修前单槽覆盖是静默的——丢批不计数、不告警、不可查。
                    (() => {
                        const st = this.storage;
                        if (!st) return ['写盘合流', '—（存储层未初始化）'];
                        const pend = st._pendingWrites instanceof Map ? st._pendingWrites.size : 0;
                        const merged = Number(st._mergedBatches) || 0;
                        const lw = st._lastWrite || {};
                        let txt = `同 chat 合并 ${merged} 批 · 挂起 ${pend}`;
                        if (lw.status) txt += ` · 末次 ${lw.status}${lw.revision != null ? '(rev' + lw.revision + ')' : ''}`;
                        if (st._confirmed?.revision != null) txt += ` · 已确认 rev${st._confirmed.revision}`;
                        if (lw.status === 'failed') txt += ` ⚠️ ${lw.error || '未落盘'}`;
                        return ['写盘合流', txt];
                    })(),
                    // [v3.166] 保存来源：把「谁想保存」与「谁真保存了」并列。
                    //   修前 sources 只由调用意图驱动，无法察觉某个来源一直在被拒绝。
                    (() => {
                        const r = this.getSaveSourceReport?.();
                        if (!r || !r.rows?.length) return ['保存来源', '暂无记录'];
                        const parts = r.rows.slice(0, 6).map(x =>
                            `${x.source}:${x.persisted}/${x.attempted}${x.denied ? `(拒${x.denied})` : ''}`);
                        let txt = parts.join(' ');
                        if (r.rows.length > 6) txt += ` …共${r.rows.length}源`;
                        if (r.lastDenied) txt += ` ⚠️ 末次拒绝 ${r.lastDenied.source}：${r.lastDenied.reason}`;
                        return ['保存来源', txt];
                    })(),
                    // [v3.168] 静默降级总账（本版中心机制）：把「不是报错、而是悄悄换了更差的路」
                    //   这类失效并列成一张表。修前每一类只能各自看日志，没有地方回答
                    //   「我这套记忆有多少部分在退化运行」。
                    (() => {
                        try {
                            const g = this.getDegradationLedger?.();
                            if (!g || !Array.isArray(g.rows)) return ['静默降级', '—（无账本）'];
                            const hot = g.rows.filter(x => x.value > 0);
                            if (!hot.length) return ['静默降级', `全部正常（检查 ${g.rows.length} 项）`];
                            let txt = hot.slice(0, 4).map(x => `${x.name} ${x.value}`).join(' · ');
                            if (hot.length > 4) txt += ` …共 ${hot.length} 项退化`;
                            return ['静默降级', txt + ' ⚠️'];
                        } catch (e) { errLog(e, 'selfCheck.degradation'); return ['静默降级', '—（诊断异常）']; }
                    })(),
                    // [v3.169] 审计账本自述：账本是全部诊断的载体，它自己必须报出
                    //   「窗口 / 累计 / 损失」。只报 entries.length 会让「淘汰过」与
                    //   「从未超限」在面板上完全同形——而两者的诊断价值截然不同。
                    (() => {
                        try {
                            const ol = this.opLog;
                            if (!ol) return ['审计账本', '—（未初始化）'];
                            const st = opLogStatsCompat(this);
                            if (st.error) return ['审计账本', `⚠️ 读取失败（${st.error}）——计数不可信`];
                            if (st.absent) return ['审计账本', '—（无 stats 接口）'];
                            const sum = ol.auditSummary?.() || `窗口 ${ol.entries?.length || 0}`;
                            const lossy = !!(st.truncated || st.trimFields || st.importDropped);
                            let txt = `累计 ${ol.observedTotal?.() ?? st.total} · ${sum}`;
                            if (ol.lastTruncation) txt += ` · 末次裁剪 seq#${ol.lastTruncation.seq}(${ol.lastTruncation.op})`;
                            return ['审计账本', txt + (lossy ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.oplog'); return ['审计账本', '—（诊断异常）']; }
                    })(),
                    // [v3.170] 巩固账本自述：stm-ltm（v3.96 缝入后 74 个版本无人审计的子系统）
                    //   现在有一行 selfReport——「待巩固 / 已巩固 / 窗口 / 有损明细」。
                    //   只报「窗口里还有几条」而不报「丢过几条」，会让学生子系统在面板上
                    //   永远显得健康；lossSummary 与 selfReport 同源，不各写一套。
                    (() => {
                        try {
                            const sl = this.stmLtm;
                            if (!sl || typeof sl.lossSummary !== 'function') return ['巩固账本', '—（未启用）'];
                            if (!this.config.config.stmLtmEnabled) return ['巩固账本', '—（未启用）'];
                            const sr = sl.selfReport(this._stmLtmState);
                            return ['巩固账本', (sr.row || '—') + (sr.ok ? '' : ' ⚠️')];
                        } catch (e) { errLog(e, 'selfCheck.stmLtm'); return ['巩固账本', '—（诊断异常）']; }
                    })(),
                    // [v3.171] 门控读数自述：与巩固账本同族（I5/I6），看读侧缺口是否可见。
                    //   「判不了 / 没读到 / 被丢弃」若不上面板，会与「真平淡」完全同形。
                    (() => {
                        try {
                            if (!Array.isArray(this._triggerStats) || !this._triggerStats.length) return ['门控读数', '—（未启用）'];
                            if (this.config.config.smartTriggerEnabled !== true) return ['门控读数', '—（未启用）'];
                            const tp = (typeof window !== 'undefined' ? window.LonShaSmartTrigger : null);
                            if (!tp || typeof tp.normalizeTriggerReport !== 'function') return ['门控读数', '—（模块不可用）'];
                            const rep2 = tp.normalizeTriggerReport(this._triggerStats, {
                                cap: 300,
                                dropped: Number(this._triggerDropped) || 0,
                            });
                            const invBad = this._triggerStats.reduce((n, r) => n + Number((r && r.report && r.report.invalidPatterns) || 0), 0);
                            const omitErr = this._triggerStats.reduce((n, r) => n + Number((r && r.report && r.report.omitErrors) || 0), 0);
                            const gap = (rep2.empty || 0) + (rep2.dropped || 0) + invBad + omitErr;
                            const row = `评估 ${rep2.records} · 正常读数 ${rep2.plain} · 空读 ${rep2.empty || 0}`
                                + (rep2.dropped ? ` · 淘汰 ${rep2.dropped}` : '')
                                + (invBad ? ` · 判不了 ${invBad}` : '')
                                + (omitErr ? ` · 判定失败 ${omitErr}` : '');
                            return ['门控读数', row + (gap ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.smartTrigger'); return ['门控读数', '—（诊断异常）']; }
                    })(),
                    // [v3.172] 召回漏斗自述：v3.95/v3.96 缝合四模块的收缩量。
                    //   与门控/巩固同族（I5/I6），漏斗变窄必须可见。
                    (() => {
                        try {
                            const _on = ['aiSelectEnabled', 'unifiedRecallEnabled', 'vectorChunkEnabled']
                                .some(k => this.config.config[k] === true);
                            if (!Array.isArray(this._recallFunnel) || !this._recallFunnel.length) {
                                return ['召回漏斗', _on ? '—（已开启但尚无读数）' : '—（未启用）'];
                            }
                            const _ai2 = (typeof window !== 'undefined' ? window.LonShaAISelect : null);
                            if (!_ai2 || typeof _ai2.normalizeRecallFunnel !== 'function') return ['召回漏斗', '—（模块不可用）'];
                            const fp2 = _ai2.normalizeRecallFunnel(this._recallFunnel, {
                                cap: 500, dropped: Number(this._recallFunnelDropped) || 0,
                            });
                            const gap2 = fp2.unreadable + fp2.unmatched + fp2.truncated + fp2.graphDropped
                                + fp2.hardCut + fp2.channelFallback + fp2.dropped + fp2.missing
                                + (Number(this._recallFunnelReadEmpty) || 0);
                            const row2 = `读数 ${fp2.records} 轮 · 空集 ${fp2.empty}`
                                + (fp2.unreadable ? ` · 判不了 ${fp2.unreadable}` : '')
                                + (fp2.unmatched ? ` · 映射不上 ${fp2.unmatched}` : '')
                                + (fp2.truncated ? ` · 粗召回截断 ${fp2.truncated}` : '')
                                + (fp2.graphDropped ? ` · 图谱截断 ${fp2.graphDropped}` : '')
                                + (fp2.hardCut ? ` · 硬切 ${fp2.hardCut}` : '')
                                + (fp2.channelFallback ? ` · 副通道回落 ${fp2.channelFallback}` : '')
                                + (Number(this._recallFunnelReadEmpty) ? ` · 空读轮 ${this._recallFunnelReadEmpty}` : '');
                            return ['召回漏斗', row2 + (gap2 ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.recallFunnel'); return ['召回漏斗', '—（诊断异常）']; }
                    })(),
                    // [v3.173] 缝合模块接线面自述：7 个零消费模块接线后各自的活性。
                    //   与召回漏斗同族（I5/I6）：接上了但读不到、与没接上，必须可分。
                    (() => {
                        try {
                            const _libs = [
                                ['canonical-stringify.js', () => window.LonShaCanonical],
                                ['dependency-closure.js', () => window.LonShaDependencyClosure],
                                ['entity-semantic.js', () => window.LonShaEntitySemantic],
                                ['extraction-cadence.js', () => window.LonShaExtractionCadence],
                                ['floor-range.js', () => window.LonShaFloorRange],
                                ['npc-ties.js', () => window.LonShaNpcTies],
                                ['turn-reconciler.js', () => window.LonShaTurnReconciler],
                            ];
                            let _up = 0;
                            const _down = [];
                            for (const [f, g] of _libs) {
                                let ok = false;
                                try { ok = !!g(); } catch (e) { ok = false; }
                                if (!ok && typeof require !== 'undefined') {
                                    try { ok = !!require('./' + f); } catch (e) { ok = false; }
                                }
                                if (ok) _up++; else _down.push(f);
                            }
                            const _act = [];
                            if (this._histFpRead && this._histFpRead.via === 'canonical') _act.push('指纹·模块');
                            if (this._npcTiesSource === 'module+inline') _act.push('关系网·对账');
                            if (this._entityRegistryRead) _act.push(`实体 ${this._entityRegistryRead.upserted}`);
                            if (this._graphDedupCascade) _act.push(`幽灵边 ${this._graphDedupCascade.ghostNodes}`);
                            if (this._cadenceTriage) _act.push(`节奏 ${(this._cadenceTriage.active || []).length}`);
                            if (this._floorRangeLedger) _act.push(`水位 ${this._floorRangeLedger.coveredTo}`);
                            if (this._artifactTurnReconcile) _act.push(`轮次对账 ${this._artifactTurnReconcile.claimed}`);
                            const _row = `模块 ${_up}/7 可用` + (_act.length ? ` · 已产出 ${_act.join(' / ')}` : ' · 尚无读数')
                                + (_down.length ? ` · 不可用 ${_down.length}（${_down.join(' ')}）` : '');
                            return ['模块接线', _row + (_down.length ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.moduleWiring'); return ['模块接线', '—（诊断异常）']; }
                    })(),
                    // [v3.168] I3 携带契约：写侧产出必须覆盖契约清单。
                    //   与「静默降级」同族：导入侧有分支、写侧不产出时，跨对话续写会静默丢掉子系统，而 toast 仍写着「无缝衔接」。
                    (() => {
                        try {
                            const strict = this.config.config.carryoverContractStrict !== false;
                            const rep = this._lastCarryoverReport;
                            if (!rep || !(rep.produced || []).length) return ['携带契约', strict ? '尚未打包（严格模式开）' : '尚未打包（严格模式关）'];
                            const tot = CARRYOVER_CONTRACT_KEYS.length;
                            const _n = rep.produced.length;
                            const _ok = rep.ok === true;
                            return ['携带契约', _n + '/' + tot + ' 键'
                                + (_ok ? ' ✓' : ' ⚠️ 缺 ' + (rep.missingWrite || []).join('/'))];
                        } catch (e) { errLog(e, 'selfCheck.carryover'); return ['携带契约', '—（诊断异常）']; }
                    })(),
                    // [v3.175] 世界钟读者面：本插件此前对 WorldAxis 零消费，「两个世界对不上」在本插件侧
                    //   完全不可观测。本行把「另一个插件认为现在是几号、与本插件差几天」念出来。
                    //   口径：未读（本会话尚未对账）只报「未读」不报警；不可用报归因（桥没装/没开都要能分辨）；
                    //   真对不上（世界钟在前/在后）才标 ⚠️——「有缺陷时告警、没缺陷时安静」。
                    (() => {
                        try {
                            const cl = this.clock;
                            if (!cl) return ['世界钟', '—（时钟不可用）'];
                            const r = (cl._worldClockRead && typeof cl._worldClockRead === 'object') ? cl._worldClockRead : null;
                            if (!r) return ['世界钟', '未读'];
                            if (!r.ok) return ['世界钟', '不可用 · ' + r.reason + (r.describe ? '（' + r.describe + '）' : '')];
                            const line = (typeof cl.worldClockLine === 'function') ? cl.worldClockLine() : '';
                            const d = r.diff || {};
                            const bad = d.verdict === 'world-ahead' || d.verdict === 'world-behind';
                            return ['世界钟', (line || '已读') + (bad ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.worldClock'); return ['世界钟', '—（诊断异常）']; }
                    })(),
                    // [v3.176] 世界账本对读面：不只读钟，把推演侧的**全账本**（暗流/权威事实/人物位置/舆情）
                    //   与「有多少东西没外供我」一并念出来。修前那一整个世界在本插件侧不可观测。
                    //   口径：未读不报警；不可用报归因；有未外供缺口或位置冲突才标 ⚠️。
                    (() => {
                        try {
                            const r = this._worldLedgerRead;
                            if (!r) return ['世界账本', '未读'];
                            if (!r.ok) return ['世界账本', '不可用 · ' + r.reason + (r.describe ? '（' + r.describe + '）' : '')];
                            const cl = this.clock;
                            const line = (cl && typeof cl.worldLedgerLine === 'function') ? cl.worldLedgerLine() : '';
                            const gap = r.gap || {};
                            const pd = r.peopleDiff || {};
                            const bad = (gap.verdict === 'gapped') || (pd.mismatched && pd.mismatched.length > 0);
                            return ['世界账本', (line || '已读') + (bad ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.worldLedger'); return ['世界账本', '—（诊断异常）']; }
                    })(),
                    // [v3.208.0] 本地投影管线体检面：回答「这一轮我给了推演侧几个投影、漏接了几个」。
                    //   三态必须可分：模块未加载 / 尚未跑过 / 有读数（缺席才列 id 与原因）。
                    //   为什么这行非有不可：缺席此前不可观测——「漏接一个投影」与「那个投影本轮为空」
                    //   在旧读数上完全同形，对读于是把「查不出来」当成「两边一致」。
                    (() => {
                        try {
                            const P = _projectionLib();
                            if (!P || typeof P.pipelineLine !== 'function') return ['投影管线', '模块未加载（projection-pipeline.js）'];
                            const pg = this._lastProjection;
                            if (!pg) return ['投影管线', '待本轮（尚未收集）'];
                            const line = P.pipelineLine(pg);
                            const miss = (typeof P.absentList === 'function') ? P.absentList(pg) : [];
                            const bad = (pg.identity && pg.identity.ok === false) || miss.length > 0;
                            // 缺席**点名**（不只是报个数）：漏接了哪个、为什么，一眼看到。
                            const detail = miss.length ? ('｜缺 ' + miss.map((m) => m.id + '(' + m.reason + ')').join('、')) : '';
                            return ['投影管线', line + detail + (bad ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.projectionPipeline'); return ['投影管线', '—（诊断异常）']; }
                    })(),
                    // [v3.270.0 · B2/X1] 注入容量预演体检面（「世界书占多少、挤掉哪条记忆」）。
                    //   三态必须可分：模块未加载 / 世界书读不到 / 有读数在算。
                    //   为何不可压成一态：世界书读不到时占用是**未知**，报「0 占用」会让用户
                    //   把「读不到」读成「不占空间」—— 正是本仓最贵的「未知与零同形」形态。
                    (() => {
                        try {
                            const pr = this._projectionPrediction();
                            if (!pr) return ['注入预演', '模块未加载（projection-pipeline.js）'];
                            const wb = pr.worldbook || {};
                            const wbTxt = wb.known
                                ? ('世界书常驻 ' + wb.chars + ' 字符/' + wb.tokens + ' token（' + wb.constantCount + ' 条；全库上限 ' + wb.upperChars + '）')
                                : ('世界书占用未知（' + String(wb.reason || '?') + '）');
                            if (pr.measurable !== true) return ['注入预演', wbTxt + ' · 预算不可测（' + String(pr.reason || '?') + '）'];
                            const sq = pr.squeeze || {};
                            const memTxt = (pr.memory && pr.memory.known)
                                ? ('候选 ' + pr.memory.chars + ' 字符 · 剩余 ' + pr.headroom.now + '')
                                : '候选面待本轮（尚未跑过注入）';
                            const isSqueezing = (sq.deltaChars > 0);
                            return ['注入预演', wbTxt + ' · ' + memTxt
                                + (isSqueezing ? (' · 挤占 ' + sq.deltaChars + ' 字符') : ' · 无挤占')
                                + (sq.pushesIntoTrim ? ' · ⚠️ 会把记忆推过裁剪线' : '')];
                        } catch (e) { errLog(e, 'selfCheck.injectionPrediction'); return ['注入预演', '—（诊断异常）']; }
                    })(),                    // [v3.180] 楼层真源落笔面：覆盖度是**现算**读数（不入快照存盘），把「哪些楼还没落笔」
                    //   连同失效原因一并念出来。口径：模块未加载如实报（不装成「无缺口」）；无缺口安静；
                    //   有缺口标 ⚠️——「有缺陷时告警、没缺陷时安静」与前述各行同规格。
                    (() => {
                        try {
                            const line = (typeof this._floorLedgerLine === 'function') ? this._floorLedgerLine() : '—';
                            const cov = (typeof this._floorLedgerCoverage === 'function') ? this._floorLedgerCoverage() : null;
                            const bad = !!(cov && cov.enabled === true && cov.complete === false);
                            const dead = !!(cov && cov.enabled !== true);
                            return ['楼层落笔', line + ((bad || dead) ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.floorLedger'); return ['楼层落笔', '—（诊断异常）']; }
                    })(),
                    // [v3.180] 年龄锚点读数面：三态必须可分辨（exact=原值 / estimated=推算 /
                    //   anchor-only=算不出，只给原文与锚点）。修前「算不出」被静默回落成静态原值，
                    //   与「原值即准」同形——三态塌成两态，用户无从知道那个数字是不是猜的。
                    (() => {
                        try {
                            const st = this.status;
                            if (!st) return ['年龄锚点', '—（状态层不可用）'];
                            const A = (typeof st._ageAnchor === 'function') ? st._ageAnchor() : null;
                            if (!A || typeof A.ageDisplay !== 'function') return ['年龄锚点', '模块未加载（age-anchor.js）⚠️'];
                            const p = st.protagonist || {};
                            if (!p.age && !p.ageAnchorTime) return ['年龄锚点', '无档案'];
                            const now = this.clock?.date || this.getLatestStoryDate?.() || '';
                            const d = A.ageDisplay(p.age, p.ageAnchorTime, now, {
                                calcAge: (a, b) => this.clock?.calcAge?.(a, b),
                                parseFn: (s) => this.clock?.parseStoryDate?.(s)
                            });
                            const state = (d && d.state) || 'exact';
                            const shown = (d && d.text) || p.age || '—';
                            // anchor-only 是**主动报警态**：不给数字，且必须让人看见「为什么没数字」。
                            const flag = (state === 'anchor-only') ? ' ⚠️ 算不出（只给原文与锚点）' : '';
                            const bad = (typeof A.checkInvariants === 'function') ? A.checkInvariants(p) : [];
                            return ['年龄锚点', `${state}(${shown})${p.ageAnchorTime ? ' @' + p.ageAnchorTime : ''}${flag}${bad.length ? ' · 违规 ' + bad.join(',') : ''}`];
                        } catch (e) { errLog(e, 'selfCheck.ageAnchor'); return ['年龄锚点', '—（诊断异常）']; }
                    })(),
                    // [v3.183] 摘要来源体检面：本版把「摘要在落笔时来自哪一页」变成可查字段，
                    //   诊断面就必须能读出「现在有多少条对不上、分别为什么」。口径与前述各行同规格：
                    //   模块未加载如实报（不装成「无缺口」）、无缺口安静、真对不上才 ⚠️。
                    (() => {
                        try {
                            const line = (typeof this._summaryProvenanceLine === 'function') ? this._summaryProvenanceLine() : '—';
                            const st = this._summaryProvenanceStamp;
                            // module-unavailable（未接线）与 ok（无缺口）都不报警；stale/thrown 才报。
                            const bad = !!(st && st.status !== 'ok' && st.status !== 'module-unavailable');
                            return ['摘要来源', line + (bad ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.summaryProvenance'); return ['摘要来源', '—（诊断异常）']; }
                    })(),
                    // [v3.183] 分支守护体检面：**被拦是正常的**（说明保护生效，不该报警），
                    //   真正要警惕的是三张队列长期不清——翻页/重生成后没人来认领，积压即症状。
                    (() => {
                        try {
                            const line = (typeof this._branchGuardLine === 'function') ? this._branchGuardLine() : '—';
                            const s = (this._branchGuard && typeof this._branchGuard.stats === 'function') ? this._branchGuard.stats() : null;
                            const backlog = s ? (s.request + s.apply + s.swipe) : 0;
                            return ['分支守护', line + (backlog > 0 ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.branchGuard'); return ['分支守护', '—（诊断异常）']; }
                    })(),
                    // [v3.183] 条目关联体检面：关联**只报告不写图**，所以这里不回答「连了几条边」，
                    //   只回答「词表多大、有多少词被拒收」。拒收必须是可见的——否则
                    //   「词表压根没建起来」与「建了但全是短词被拒」在读数上同形。
                    (() => {
                        try {
                            const line = (typeof this._crosslinkLine === 'function') ? this._crosslinkLine() : '—';
                            const idx = this._crosslinkIndex;
                            const s = (idx && typeof idx.stats === 'function') ? idx.stats() : null;
                            const bad = !!(s && s.keywords > 0 && s.rejected > 0);
                            return ['条目关联', line + (bad ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.crosslink'); return ['条目关联', '—（诊断异常）']; }
                    })(),
                    // [v3.184] 图谱汇总体检面：回答「图里现在有几层汇总、盖住多少子节点、
                    //   最近一轮维护压成了几层 / 回收了几个孤儿」。要警惕的不是「压成 0 层」
                    //   （节点本来就不够一批，属正常），而是**维护管线从没跑过**——
                    //   那说明 graph-rollup 步骤压根没被触发（此前 vacuum 零调用点即此形态）。
                    (() => {
                        try {
                            const line = (typeof this._graphRollupLine === 'function') ? this._graphRollupLine() : '—';
                            const ran = !!this._graphRollupRead;
                            const rr = this.graph && this.graph._rollupRead;
                            const stuck = !!(rr && rr.rejected > 0 && !rr.created);
                            return ['图谱汇总', line + (stuck ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.graphRollup'); return ['图谱汇总', '—（诊断异常）']; }
                    })(),
                    // [v3.184] 关系披露体检面：**跳过是正常的**（说明筛选在工作，不该报警），
                    //   真正要警惕的是 invalid > 0 —— 作者写了条件却一个都编译不出来，
                    //   该关系被静默放行、筛选对它就等于没接。积压式失效必须可见。
                    (() => {
                        try {
                            const line = (typeof this._relationDisclosureLine === 'function') ? this._relationDisclosureLine() : '—';
                            const c = this._relationDisclosureRead && this._relationDisclosureRead.counts;
                            const bad = !!(c && (c.invalid > 0 || c.truncated > 0));
                            return ['关系披露', line + (bad ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.relationDisclosure'); return ['关系披露', '—（诊断异常）']; }
                    })(),
                    // [v3.219.0] R2-F 双向关系对账体检面：**对侧未登记才是该补记的**。
                    //   「对侧本轮被挡」「对侧已失效」是正常态（前者等情境、后者是历史），
                    //   与「对侧压根不在图里」压成一格会让读者去补一条不该补的关系。
                    //   报警只认 oneSided > 0（真损失）与 degraded（算炸了）。
                    (() => {
                        try {
                            const line = (typeof this._relationMutualLine === 'function') ? this._relationMutualLine() : '—';
                            const r = this._relationMutualRead;
                            const bad = !!(r && (r.oneSided > 0 || r.degraded));
                            return ['双向对账', line + (bad ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.relationMutual'); return ['双向对账', '—（诊断异常）']; }
                    })(),
                    // [v3.219.0] R2-F 知情网络体检面：**疑似未合并必须可见**。
                    //   它是唯一说不出结论的那一档（告知式措辞判不开），并进任何一格都会让读者
                    //   以为「判过了」—— 那正是修前「认知隔离永不解除」看起来像「本来就没有」的原因。
                    (() => {
                        try {
                            const line = (typeof this._knowledgeNetworkLine === 'function') ? this._knowledgeNetworkLine() : '—';
                            const r = this.worldProg && this.worldProg._knowledgeRead;
                            const bad = !!(r && r.suspect > 0);
                            return ['知情网络', line + (bad ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.knowledgeNetwork'); return ['知情网络', '—（诊断异常）']; }
                    })(),
                    // [v3.184] 提示词填充体检面：**未填**与**残留**都要现形。
                    //   残留（占位符写成了全角/带空格形态）意味着这一处根本没填进去，
                    //   而模型收到的是一句模板语法——修前这件事零日志、零提示。
                    (() => {
                        try {
                            const line = (typeof this._promptFillLine === 'function') ? this._promptFillLine() : '—';
                            const a = this._promptFillRead, b = this._promptFillReadRoles;
                            const bad = !!((a && a.leftover && a.leftover.length) || (b && b.leftover && b.leftover.length));
                            return ['提示词填充', line + (bad ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.promptFill'); return ['提示词填充', '—（诊断异常）']; }
                    })(),
                    // [v3.184] 行级变更体检面：回答「这一格从前是多少、现在是多少」——
                    //   OpLog 只答「做了什么动作」、SnapshotManager 只答「哪楼存了整份快照」，
                    //   撤销一次误改需要的那个数（原值）此前无处可查。
                    //   不报警的场景：「无变更」是正常的；真该警惕的是非法输入（写入点传了空键）。
                    (() => {
                        try {
                            const cs = _changeset();
                            if (!cs) return ['行级变更', '模块未加载（changeset.js）'];
                            const line = (typeof this._changesetLine === 'function') ? this._changesetLine() : '—';
                            const bad = !!cs.badInput;
                            return ['行级变更', line + (bad ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.changeset'); return ['行级变更', '—（诊断异常）']; }
                    })(),
                    // [v3.185] 条目关联**消费面**体检：上面那行报的是「词表多大、候选几条」——
                    //   候选算出来却没人用时它照样好看（本版修的就是这个形态）。本行回答「产出有没有被用掉」。
                    //   要警惕的不是「本轮无可提关联」（正文没同时提到某条已确认关系的两端，属正常），
                    //   而是**摘要一条都没进表**：那意味着关联对召回侧等于没接（生产跑着、消费恒空）。
                    (() => {
                        try {
                            const line = (typeof this._crosslinkConsumeLine === 'function') ? this._crosslinkConsumeLine() : '—';
                            const hasSums = !!(this.summary && typeof this.summary.getActiveSummaries === 'function'
                                && this.summary.getActiveSummaries().length);
                            const idle = !!(hasSums && this._xrefIdx != null && !Number(this._crosslinkXrefN || 0));
                            return ['条目复用', line + (idle ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.crosslinkConsume'); return ['条目复用', '—（诊断异常）']; }
                    })(),
                    // [v3.186] 情绪反向召回体检面：回答「负面的当下有没有想起相对的那一面」。
                    //   （措辞说明：本行刻意不连写「召回」「体检」四字——旧审计以该短语作为导出报告块的
                    //   固定文本定位锚，在这里复用会把窗口撑偏，属「新注释扰动旧锚点」，与实现无关。）
                    //   要警惕的**不是**「本轮无反向线索」——没有情绪词、主导维是「悬」（极性 0）
                    //   都属正常；真该亮灯的是**长期空转**：真扫过 5 轮以上却一条都没提过，
                    //   那说明反向词表与正文永远对不上，机制等于白接。
                    (() => {
                        try {
                            const line = (typeof this._emotionOppositeLine === 'function') ? this._emotionOppositeLine() : '—';
                            const r = this._emoOppositeRead;
                            const idle = !!(r && r.reason === 'ok' && Number(this._emoOppositeRounds || 0) >= 5
                                && !Number(this._emoOppositeBoosted || 0));
                            return ['情绪反向', line + (idle ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.emotionOpposite'); return ['情绪反向', '—（诊断异常）']; }
                    })(),
                    // [v3.193.0] 注入成本体检面：回答「这一轮 prompt 里谁占了多少」。
                    //   三态必须可分，否则「模块没接上」与「这轮注入为空」同形：
                    //     · 模块未加载 / 尚无注入 → _lastCostLedger 为 null（不是「成本为 0」）
                    //     · 账目不自洽（identity.ok=false）→ 亮 ⚠️，账本自己报自己算错了
                    (() => {
                        try {
                            const CL = _costLedgerLib();
                            if (!CL || typeof CL.costLine !== 'function') return ['注入成本', '模块未加载（cost-ledger.js）'];
                            const lg = this._lastCostLedger;
                            if (!lg) return ['注入成本', '待本轮（尚无注入）'];
                            const line = CL.costLine(lg);
                            const bad = lg.identity && lg.identity.ok === false;
                            return ['注入成本', line + (bad ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.costLedger'); return ['注入成本', '—（诊断异常）']; }
                    })(),
                    // [v3.208.0] 成本**预测**体检面：回答「这一轮预计注入多少、有没有按预期走」。
                    //   与上一行的分工是**时态**：上行事后（已注入的），这行事前（本该注入的）+对账。
                    //   三态可分：模块未加载 / 尚未预测 / 有预测（drift 或不可测才标 ⚠️）。
                    //   ⚠️ 的三义必须区分（否则「测不了」会被读成「一致」）：
                    //     · not-measurable —— 预测或实测任一侧缺料，**不得**降级成「一致」
                    //     · drift          —— 逐项偏差，且 why 里点名是哪个量偏了多少
                    (() => {
                        try {
                            const CF = _costForecastLib();
                            if (!CF || typeof CF.forecastLine !== 'function') return ['成本预测', '模块未加载（cost-forecast.js）'];
                            const fc = this._lastForecast;
                            if (!fc) return ['成本预测', '待本轮（尚未预测）'];
                            const line = CF.forecastLine(fc);
                            const rc = this._lastReconcile;
                            const note = rc ? (rc.verdict === 'match' ? '｜对账一致'
                                : (rc.verdict === 'drift' ? '｜对账漂移：' + rc.why : '｜对账不可测：' + rc.why)) : '｜对账未做';
                            const bad = !!(rc && rc.verdict !== 'match');
                            return ['成本预测', line + note + (bad ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.costForecast'); return ['成本预测', '—（诊断异常）']; }
                    })(),
                    // [v3.194] 时间与事实版本：回答「同一格事实账上有几个版本、多少已闭合、多少只是推测」。
                    //   三态可分：模块未加载 / 尚无事实 / 有账（含未决冲突 ⚠️）。
                    (() => {
                        try {
                            const FV = _factVersionLib();
                            if (!FV || typeof FV.line !== 'function') return ['事实版本', '模块未加载（fact-version.js）'];
                            if (!this._factVersionState) return ['事实版本', '待本轮（尚无事实账）'];
                            return ['事实版本', FV.line(this._factVersionState)];
                        } catch (e) { errLog(e, 'selfCheck.factVersion'); return ['事实版本', '—（诊断异常）'];
                        }
                    })(),
                    // [v3.210] 记忆类型：回答「账上事实按类型怎么分布、有多少条还没归类、有没有类型名被拒」。
                    //   三态可分：模块未加载 / 尚无事实账 / 有账（未归类亮 ⚠️）。
                    //   为什么不并进上一行：上一行答的是「多少个版本、多少未决」，这一行答的是
                    //   「这些事实**各自守什么规则**」——压成一行会让「类型没接上」与「类型都接上了但都没标」
                    //   看起来一样（正是本版要修的那种「该可分的读数被压成一态」）。
                    (() => {
                        try {
                            const MT = _memoryTypeLib();
                            if (!MT || typeof MT.lineByType !== 'function') return ['记忆类型', '模块未加载（memory-type.js）'];
                            if (!this._factVersionState) return ['记忆类型', '待本轮（尚无事实账）'];
                            const base = MT.lineByType(this._factVersionState);
                            const rd = this._memoryTypeRead;
                            // 读取数只报**有信息量**的部分：全部走旧路径（无类型）时 base 已经用「未归类 N」说了，
                            //   再补一句「类型化 0」是重复；只有真的走了类型化、或真的拒了非法类型名才追加。
                            const extra = [];
                            if (rd && !rd.moduleMissing) {
                                if (rd.typed) extra.push('类型化 ' + rd.typed);
                                if (rd.unknown) extra.push('类型名未知被拒 ' + rd.unknown + (rd.samples?.length ? '（如 ' + rd.samples.join(' / ') + '）' : ''));
                                if (rd.refused) extra.push('策略拒绝 ' + rd.refused);
                            }
                            return ['记忆类型', extra.length ? (base + ' · ' + extra.join(' · ')) : base];
                        } catch (e) { errLog(e, 'selfCheck.memoryType'); return ['记忆类型', '—（诊断异常）']; }
                    })(),
                    // [v3.194] 事件完整性：回答「有几条线，几条还缺结果/后续」。
                    //   未完成事项是**交付物**不是缺陷，故 'open' 不亮 ⚠️；越序（result 早于 action）才亮。
                    (() => {
                        try {
                            const EC = _eventCompletenessLib();
                            if (!EC || typeof EC.line !== 'function') return ['事件完整', '模块未加载（event-completeness.js）'];
                            if (!this._eventThreadState) return ['事件完整', '待本轮（尚无事件线）'];
                            return ['事件完整', EC.line(this._eventThreadState)];
                        } catch (e) { errLog(e, 'selfCheck.eventCompleteness'); return ['事件完整', '—（诊断异常）'];
                        }
                    })(),
                    // [v3.233.0] F-2：事件**来源构成**。与上一行是两个不同的问题：
                    //   「事件完整」答的是这条线缺哪一段；本行答的是这条线里的段**从哪来**
                    //   （插件从正文提的 / 手机 App 里发生的 / 其它 / 没标）。
                    //   为什么要分开：段的 source 此前是从未被折算的自由文本，全仓唯一赋值点是
                    //   `_absorbEventSegments` 写死的 'extract' —— 下游于是答不出「这条是插件提的、
                    //   还是手机侧发生的」，而这正是 F-2（跨平台事件）要回答的第一件事。
                    //   只按受控词表**分级计数**，不做文本猜测（同 plan 的 T11 纪律）。
                    (() => {
                        try {
                            const EC = _eventCompletenessLib();
                            if (!EC || typeof EC.platformLine !== 'function') return ['事件来源', '模块未加载（event-completeness.js）'];
                            if (!this._eventThreadState) return ['事件来源', '待本轮（尚无事件线）'];
                            return ['事件来源', EC.platformLine(this._eventThreadState)];
                        } catch (e) { errLog(e, 'selfCheck.eventPlatform'); return ['事件来源', '—（诊断异常）'];
                        }
                    })(),
                    // [v3.194] 修复闭环：回答「修过几次、几次还没落定」。
                    //   「修了但有一处没跟上」必须看得见（line 里未落定/部分完成自带 ⚠️）。
                    (() => {
                        try {
                            const RL = _repairLoopLib();
                            if (!RL || typeof RL.line !== 'function') return ['记忆修复', '模块未加载（repair-loop.js）'];
                            if (!this._repairState) return ['记忆修复', '待本轮（尚无修复记录）'];
                            return ['记忆修复', RL.line(this._repairState)];
                        } catch (e) { errLog(e, 'selfCheck.repairLoop'); return ['记忆修复', '—（诊断异常）'];
                        }
                    })(),
                    // [v3.207] 账本实体契约：回答「六本账有多少条目、多少被替代过、有没有读不出修订号的」。
                    //   这行同时是 `item.revision` 的**首个真实读侧** —— 此前它写进去但全仓无人读。
                    //   三态可分：模块未加载 / 尚无条目 / 有账（未定型条目数 > 0 才亮 ⚠️）。
                    (() => {
                        try {
                            const LE = _ledgerEntityLib();
                            if (!LE || typeof LE.line !== 'function') return ['账本实体', '模块未加载（ledger-entity.js）'];
                            const books = _ledgerBooks.call(this);
                            const live = books.filter((b) => {
                                const box = b.box || 'items';
                                return !!(b.state && Array.isArray(b.state[box]) && b.state[box].length);
                            }).length;
                            if (!live) return ['账本实体', '待本轮（尚无账本条目）'];
                            return ['账本实体', LE.line(books)];
                        } catch (e) { errLog(e, 'selfCheck.ledgerEntity'); return ['账本实体', '—（诊断异常）'];
                        }
                    })(),
                    // [v3.209.0] 结构迁移：回答「导入的这个档是什么代际、要不要走迁移、有没有路径」。
                    //   三态可分：模块未加载 / 尚未导入（无留档）/ 有留档（按 verdict 自述 + 步骤）。
                    //   真源是恢复现场留档（那时才有真载荷可算），**不在此处合成载荷重算**。
                    (() => {
                        try {
                            const SM = _schemaMigrationLib();
                            if (!SM || typeof SM.plan !== 'function') return ['结构迁移', '模块未加载（schema-migration.js）'];
                            const m = this._lastSchemaMigration;
                            if (!m) return ['结构迁移', '待导入（尚无恢复记录 · 注册 ' + SM.MIGRATIONS.length + ' 条）'];
                            const steps = Array.isArray(m.steps) && m.steps.length ? ' · 步骤 ' + m.steps.join('→') : '';
                            const extra = m.needsAction ? '（需授权迁移）' : (m.applied ? '（已迁 ' + m.applied + ' 步）' : '');
                            const warn = (m.verdict === 'unknown' || m.verdict === 'too-new') ? ' ⚠️' : '';
                            return ['结构迁移', '载荷 v' + (m.from === null ? '无代际' : m.from) + ' → 目标 v' + m.to + ' · ' + m.verdict + steps + extra + warn];
                        } catch (e) { errLog(e, 'selfCheck.schemaMigration'); return ['结构迁移', '—（诊断异常）'];
                        }
                    })(),
                    // [v3.209.0] 模块加载归因：回答「本会话取库失败过哪些模块、根因是什么」。
                    //   读 engine 侧登记表 —— **唯一能区分**「无此文件 / 文件在但坏了 / 全局名写错」的地方
                    //   （取库口把三者压成同一个 null，这正是本版修掉的静默吞错）。
                    //   三态可分：模块未加载 / 本会话零失败（登记表为空 = 查过、没有）/ 有失败（点名 + 根因）。
                    //   刻意不在此比对 extra_js 清单：那是 scan_module_wiring 的静态面，重复会造第二真源。
                    (() => {
                        try {
                            const MR = _moduleRegistryLib();
                            if (!MR || typeof MR.probe !== 'function') return ['模块加载', '模块未加载（module-registry.js）'];
                            const fails = _moduleFailureSnapshot();
                            if (!fails.length) return ['模块加载', '本会话取库 0 次失败（登记表空）'];
                            const rs = fails.map((f) => MR.probe({ attempted: true, file: f.file, error: new Error(f.error) }));
                            return ['模块加载', MR.line(rs) + ' ⚠️'];
                        } catch (e) { errLog(e, 'selfCheck.moduleRegistry'); return ['模块加载', '—（诊断异常）'];
                        }
                    })(),
                    // [v3.260.0 缝合 shujuku] 原生工具回合自述：回答「本会话真发起过工具调用吗、几轮、读了多少条」。
                    //   零调用时显式说「未启用」，与「启用了但没触发」和「触发了但零命中」三态可分——
                    //   这正是本仓九账证据面治理后留下的纪律：坏了有人知道吗，且三种坏法不能同形。
                    (() => {
                        try {
                            const nt = (typeof window !== 'undefined' ? window.LonShaNativeTools : null);
                            if (!nt) return ['原生工具回合', '—（模块不可用）'];
                            const _lc = this.llm || (this.engine && this.engine.llm) || null;
                            const led = _lc && _lc._nativeToolLedger;
                            const _on = this.config.config.nativeToolExtractEnabled === true;
                            const _pf = this.config.config.pristineFetchEnabled === true;
                            if (!led) return ['原生工具回合', _on ? '—（已开启但尚无回合）' : '—（未启用）'];
                            const bits = [];
                            if (led.rounds !== undefined) bits.push('回合 ' + led.rounds);
                            if (led.tool) bits.push(led.tool);
                            if (led.hits !== undefined) bits.push('命中 ' + led.hits);
                            if (led.saved !== undefined) bits.push(led.saved ? '已写入' : '未写入');
                            return ['原生工具回合', bits.join(' · ') + (_pf ? ' · 原生取数' : '')];
                        } catch (e) { errLog(e, 'selfCheck.nativeToolRound'); return ['原生工具回合', '—（诊断异常）']; }
                    })(),
                    // [v3.261.0 缝合 MyriadKnots] 存档体检：回答「导进来的这份档，有多少键谁都不认、
                    //   有多少读不出、有多少是活真源」。三态可分：模块不可用 / 待导入（无恢复记录）/
                    //   有判定（verdict 非 classified 时如实说判不了，不编「没问题」）。
                    //   真源是恢复现场留档（那时才有真载荷），**不在此处合成载荷重算**。
                    (() => {
                        try {
                            const AA = _archiveAuditLib();
                            if (!AA || typeof AA.line !== 'function') return ['存档体检', '模块未加载（archive-audit.js）'];
                            const au = this._lastArchiveAudit;
                            if (!au) return ['存档体检', '待导入（尚无恢复记录）'];
                            if (au.verdict !== 'classified') return ['存档体检', '—（' + au.verdict + (au.why ? '：' + au.why : '') + '）'];
                            return ['存档体检', '总 ' + au.total + ' 键 / ' + au.bytes + ' 字节 · 活真源 ' + au.active + ' · 保留 ' + au.retained + (au.cleanup ? ' ⚠️ 可清理候选 ' + au.cleanup : '')];
                        } catch (e) { errLog(e, 'selfCheck.archiveAudit'); return ['存档体检', '—（诊断异常）']; }
                    })(),
                    // [v3.261.0 缝合 MyriadKnots] 物品 op 忠实认领：回答「导入档里的 op，有多少**能证明**
                    //   属于当前聊天、多少判不了、判不了是哪种根因」。只读证明，不删任何 op ——
                    //   失效清理已有唯一真源（优化 3b 段），两份判据一定漂移。
                    (() => {
                        try {
                            const FI = _floorIdentityLib();
                            if (!FI || typeof FI.line !== 'function') return ['物品认领', '模块未加载（floor-identity.js）'];
                            const c = this._lastItemOpsClaim;
                            if (!c) return ['物品认领', '待导入（本次导入无 op 或聊天未就绪）'];
                            return ['物品认领', '候选 ' + c.ops + ' 条 / ' + c.floors + ' 层 · 可证明 ' + c.proved + ' · 判不了 ' + c.unproved + (c.issue ? '（根因 ' + c.issue + '）' : '')];
                        } catch (e) { errLog(e, 'selfCheck.itemOpsClaim'); return ['物品认领', '—（诊断异常）']; }
                    })(),
                    /* [v3.275.0] O5：归档处置留痕。回答「刚才那次删楼/回滚，把哪些归档楼层处理掉了、为什么」。
                     *   修前只有计数（replayDrop 的返回值），处置记录在那一刻就丢了 ——
                     *   事后无从回答「这个归档为什么不见了」，正是 O5 要治的「抹掉 provenance」。
                     *   三态可分：没发生过处置 / 有处置（列最近一条细节）/ 面不在场。 */
                    (() => {
                        try {
                            const log = Array.isArray(this._archiveShiftLog) ? this._archiveShiftLog : null;
                            if (!log) return ['归档处置', '—（本轮尚无归档面）'];
                            if (!log.length) return ['归档处置', '暂无（本会话未剪/未移任何归档）'];
                            const last = log[log.length - 1];
                            const _rm = Array.isArray(last.removed) ? last.removed.map(x => x.from).join(',') : '不可读';
                            const _mv = Array.isArray(last.moved) ? last.moved.map(x => x.from + '→' + x.to).join(',') : '不可读';
                            return ['归档处置', '共 ' + log.length + ' 次 · 最近 ' + String(last.side) + ' 于第 ' + last.floor + ' 楼'
                                + (last.removedCount ? ' 剪 ' + last.removedCount + '（' + _rm + '）' : '')
                                + (last.movedCount ? ' 移 ' + last.movedCount + '（' + _mv + '）' : '')
                                + ' · 保留 ' + last.keptCount];
                        } catch (e) { errLog(e, 'selfCheck.archiveShiftLog'); return ['归档处置', '—（诊断异常）']; }
                    })(),
                    /* [v3.277.0 O7] 依赖注入读数：三处 bindDeps 的**成功/失败/缺席**必须可分。
                     *   修前返回值被丢弃 ⇒ 「模块没加载」「模块抛错」「模块在但一个 key 都没对上」
                     *   三种根因同形（都是 0），且没有任何一面能回答「这一轮注进去了没有」。
                     *   修后两轮都展示：构造期（真实顺序下必定 module-missing，那是**时机**不是缺陷）
                     *   与模块装载后的重绑（这才是机制该生效的那一轮）。最终态以重绑为准。 */
                    _formatBindDepsRow(this._bindDepsRead, this._bindDepsRebindRead),
                ];
                // [v3.150] A 召回效果自检：最近 N 轮召回命中分布 + 空结果警示（召回效果唯一盲区补自检）
                try {
                    const ra = (this._recallAudit || []).slice(-8).reverse();
                    if (ra.length) {
                        const emptyN = ra.filter(r => r.empty).length;
                        const totHit = ra.reduce((a, r) => a + (r.totalHits || 0), 0);
                        const avgHit = (totHit / ra.length).toFixed(1);
                        const last = ra[0];
                        const dist = Object.entries(last.perSource || {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}:${v}`).join(' ');
                        rows.push(['召回自检', `近${ra.length}轮 平均命中${avgHit} 空结果${emptyN}次${emptyN ? ' ⚠️' : ''}｜末轮 ${last.totalHits}命中{${dist || '无'}}${last.vecHeatCount ? ' 续热' + last.vecHeatCount : ''}`]);
                        if (emptyN) rows.push(['召回自检·警示', `${emptyN}/${ra.length} 轮空结果——上游编辑/删楼或召回键漂移，建议核对`]);
                    } else {
                        rows.push(['召回自检', '暂无数据（首轮生成后填充）']);
                    }
                } catch (e) { errLog(e, 'selfCheck.recallAudit'); }
                // [v3.215.0] R2-A 注入读数行：回答「本会话最近一次真生成，AI 实际看到几块 / 被裁几块」。
                //   与上面的「召回自检」是两个不同的问题：召回自检说「召回了什么」，
                //   本行说「**最终送进上下文的是什么**」——中间隔着预算裁剪与去重。
                //   修前这一段的读数被下面 dry-run 覆盖，且 0 块与「没跑过」同形。
                try {
                    const _ir = (typeof this.buildInjectionReadout === 'function') ? this.buildInjectionReadout() : null;
                    const _dryR = this._diagnostics && this._diagnostics.dryRun;
                    if (!_ir) {
                        rows.push(['注入读数', `暂无数据（尚未真生成过）${_dryR ? '；诊断 dry-run 载荷 ' + _dryR.chars + ' 字符（不计入实际注入）' : ''}`]);
                    } else {
                        const _stale = Number(this._injectionStale) || 0;
                        // [v3.218.0] R2-E：结局必须进这一行 —— 「被中止」与「正常完成」处置相反
                        //   （前者该重发、后者该看回复），读数上不分开就等于把两者读成同一件事。
                        const _oc = String(_ir.outcome || 'pending');
                        const _ocTxt = _oc === 'completed' ? '已完成' : (_oc === 'aborted' ? '被中止 ⚠️' : '结局未定');
                        const _end = this._injectionEnded || {};
                        rows.push(['注入读数', `第${_ir.round}轮 ${_ir.total}块 保留${_ir.kept} 裁掉${Math.max(0, _ir.total - _ir.kept)}｜${_ir.chars}字符 约${_ir.tokens}token｜结局${_ocTxt}（完成${Number(_end.completed) || 0}·中止${Number(_end.aborted) || 0}）${_stale ? `｜代际过期${_stale}次` : ''}`]);
                    }
                } catch (e) { errLog(e, 'selfCheck.注入读数'); }
                // [v3.254.0] M-O4 缓存身份行：回答「召回缓存凭什么说自己是有效的」。
                //   与上面的「召回自检」是两个不同的问题：那一行说「召回了什么」，
                //   本行说「缓存**凭什么**敢命中」——修前身份是三个各自独立的读数
                //   （会话/代际/历史），换对话后同楼层同查询可命中上一段会话的注入。
                //   三态必须**不同形**（本仓老账）：没跑过 / 模块缺席 / 有读数。
                try {
                    const _ci = _cacheIdentityLib();
                    const _cur = this._cacheIdentityOf();
                    if (!_ci || typeof _ci.line !== 'function') {
                        rows.push(['缓存身份', '模块缺席（cache-identity.js 未加载）——身份判定退回既有位置位，不停机']);
                    } else if (!_cur) {
                        rows.push(['缓存身份', '当下身份读不出（会话/代际/历史任一位缺失）——按放行处置，不判失效']);
                    } else {
                        const _rc = this._recallCache;
                        const _v = _rc ? this._cacheIdentityStale(_rc) : null;
                        const _key = _ci.identityKey(_cur);
                        const _verdict = _v ? _ci.line(Object.assign({}, _v, { count: 1 })) : '模块缺席';
                        rows.push(['缓存身份', `${_key}｜召回缓存${_rc ? '在册' : '未建'}：${_verdict}`]);
                    }
                } catch (e) { errLog(e, 'selfCheck.cacheIdentity'); }
                report.stats = rows.map(([k, v]) => ({k, v}));
                // 2. 召回管线 dry-run（不注入，只验证链路通）
                try {
                    const query = this.buildQuery(null);
                    const qText = String(query.text || '').trim();
                    if (!qText) {
                        report.pipeline = { ok: false, note: '查询文本为空（对话太短？）', hint: '多聊几句产生对话正文后会自动恢复正常' };
                    } else {
                        const t0 = Date.now();
                        const recalled = await this.recallMemory(query);
                        // [v3.215.0] R2-A：诊断路径**不再写 `_lastInjection`**。
                        //   修前：这里与真生成共用同一个字段，于是「跑了一次自检」会把面板上
                        //   「最近一次实际注入…即 AI 真实所见」改写成一个**从未进过模型上下文**的
                        //   字符串。诊断读数是另一个问题（链路通不通 / 载荷多大），故另存
                        //   `_diagnostics.dryRun`（id:'diagnostics'）——连键名都不共用。
                        const _dry = this._buildDiagnosticsInjection(recalled);
                        const inj = _dry.html;
                        const merged = recalled.filter(Boolean).reduce((a, b) => a + (Array.isArray(b) ? b.length : 0), 0);
                        report.pipeline = { ok: true, queryLen: qText.length, routes: Object.entries(recalled).filter(([, v]) => Array.isArray(v) && v.length).map(([k, v]) => `${k}:${v.length}`), merged, injLen: (inj || '').length, ms: Date.now() - t0 };
                    }
                } catch (e) { report.pipeline = { ok: false, note: 'dry-run异常: ' + (e?.message || e), hint: hintForError(e) }; }
                // 3. 存档 schema 校验（export 字段 vs load 导入字段配对）
                try {
                    const saved = this.collectExport();
                    const expected = ['graph', 'summaries', 'diaries', 'vectors', 'povs', 'timeline', 'status', 'ledger', 'suspense', 'scene'];
                    const missing = expected.filter(k => saved[k] === undefined || saved[k] === null);
                    const nonEmpty = expected.filter(k => saved[k] && (Array.isArray(saved[k]) ? saved[k].length : Object.keys(saved[k]).length) > 0);
                    report.schema = { ok: missing.length === 0, missing, nonEmpty, hint: missing.length ? '建议点击设置面板【一键自愈】以自动补齐缺省数据' : '' };
                } catch (e) { report.schema = { ok: false, missing: ['collectExport异常: ' + (e?.message || e)], hint: hintForError(e) }; }
            } catch (e) { report.fatal = String(e?.message || e); }
            return report;
        }

        // [v2.9] RU-C: 全量导出（快照/存档共用同构数据）
        // [v3.38] 无损完整全量导出（补充 charMem, worldProg, supersede, narrativeEntropy）        // [v3.61] P24: 记忆全景 Markdown 报告导出（所有子系统数据汇总为可读档案）
        exportMemoryReport() {
            const L = [];
            const push = (s) => L.push(s);
            push('# LonSha 记忆库全景报告');
            push('');
            push('> 导出时间：' + new Date().toLocaleString('zh-CN'));
            push('');
            // 概览
            const opStats = this.opLog?.stats?.() || { total: 0, byType: {} };
            push('## 📊 概览');
            push('');
            push(`-  剧情时钟：${this.clock?.date || '未设定'}${this.clock?.label ? ' · ' + this.clock.label : ''}`);
            push(`- 活跃摘要：${(this.summary?.getActiveSummaries?.() || []).length} 条`);
            push(`- 卷/史记：${(this.summary?.volumes || []).length} / ${(this.summary?.historical || []).length}`);
            push(`- 图谱：${this.graph?.nodes?.size || 0} 节点 · ${this.graph?.edges?.size || 0} 边`);
            push(`- 物品台账：${(this.itemOps || []).length}`);
            push(`- 悬念簿：${(this.suspense?.openItems?.() || []).length} 未结`);
            // [v3.169] 账本自述面：此处原为 `${opLogStatsCompat(this)} 条`，而该 helper 返回的
            //   是对象——概览行从 v3.61 起一直输出「[object Object] 条」，用户拿不到审计事件数。
            //   同文件的「审计统计」板块却正确解构了 byType，说明这纯粹是一处没人看过的显示路径。
            push(`- 审计事件：${opLogStatsCompat(this).total} 条（${this.opLog?.auditSummary?.() || '无账本'}）`);
            push(`- 锁定事实：${(this.summary?.getLockedFacts?.() || []).length} 条`);
            push('');
            /* [v3.248.0 计划 #21] 台账写入违规**结构化出口**的真实读侧。
             *   【为什么放在这里】`_ledgerViolationReport/Markdown` 上线时是**零引用**方法
             *   （被 scan_wiring 的 A7.1 当场抓到：方法 454 / 零引用 1）—— 本仓纪律：
             *   写完没人调 = 等于没写。故本版同时把它接进「记忆全景报告」这个真实读侧，
             *   而不是只留一个 API 等人来用。
             *   【为什么只在有内容时输出】违规段对绝大多数用户永远是空 —— 无条件输出一个
             *   空板块会让报告变长且把「没有违规」和「违规没被记录」混成同形（都是空白）。
             *   故空账**整段不出现**，由诊断面板那一行的 `0` 承担「明确没有」的表述。 */
            try {
                const _lvArr = Array.isArray(this._ledgerViolations) ? this._ledgerViolations : [];
                if (_lvArr.length) {
                    push('## ⚠️ 台账写入违规');
                    push('');
                    push(this._ledgerViolationMarkdown({ top: 5 }));
                    push('');
                }
            } catch (e) { errLog(e, 'exportMemoryReport.ledgerViolation'); }
            // [v3.64] 锁定事实板块（用户主权的铁律档案）
            const lfList = this.summary?.getLockedFacts?.() || [];
            if (lfList.length) {
                push('## 🔒 用户锁定事实');
                push('');
                push('> 以下事实由用户显式锁定，逐字进入每轮摘要与注入流，永不因压缩丢失。');
                push('');
                for (const f of lfList) push(`- ${f.text}（第${f.floor}楼锁定）`);
                push('');
            }
            // [v3.69] A1: 正史增量板块（established/uncertain 分状态）
            const dbList = this.deltaBook?.deltas || [];
            if (dbList.length) {
                push('## 📒 正史增量');
                push('');
                const est = dbList.filter(d => d.status === 'established');
                const unc = dbList.filter(d => d.status === 'uncertain');
                if (est.length) {
                    push('**已确证：**');
                    push('');
                    for (const d of est.slice(-8)) push(`- ${d.summary}（第${d.evidenceFloor}楼佐证）`);
                    push('');
                }
                if (unc.length) {
                    push('**待定：**');
                    push('');
                    for (const d of unc.slice(-8)) push(`- ${d.summary}（第${d.evidenceFloor}楼，待佐证）`);
                    push('');
                }
            }
            // 主角
            const prot = this.status?.protagonist;
            if (prot) {
                push('## 🧍 主角档案');
                push('');
                for (const k of ['gender', 'age', 'identity', 'appearance', 'outfit', 'condition']) {
                    if (prot[k]) push(`- **${k}**：${prot[k]}`);
                }
                push('');
            }
            // [v3.83] C: 生活小档案板块（三投放层：置顶/常规/沉降）
            const ldList = this.status?.lifeDetails || [];
            if (ldList.length) {
                push('## 🧬 生活小档案');
                push('');
                for (const d of ldList) {
                    const tag = d.tier === 'pinned' ? '📌 ' : d.tier === 'archive' ? '📦 ' : '';
                    push(`- ${tag}${d.text}${d.floor ? `（第${d.floor}楼）` : ''}`);
                }
                push('');
            }
            // NPC 羁绊
            const ties = this.status?.getNpcTiesRecords?.() || [];
            if (ties.length) {
                push('## 🕸️ 角色羁绊网');
                push('');
                for (const t of ties) push(`- **${t.name}**：${(t.ties || []).join('；')}`);
                push('');
            }
            // 卷摘要 + 史记
            const vols = this.summary?.volumes || [];
            if (vols.length) {
                push('## 📚 章节卷摘要');
                push('');
                for (const v of vols.slice(-5)) push(`- 【卷${v.floorStart}-${v.floorEnd}】${v.text}`);
                push('');
            }
            const hist = this.summary?.historical || [];
            if (hist.length) {
                push('## 🏛️ 纪元史记');
                push('');
                for (const h of hist) push(`- ${h.text || h}`);
                push('');
            }
            // 群像
            const pairs = this.pairMem?.pairs || [];
            if (pairs.length) {
                push('## 👥 群像共同记忆');
                push('');
                for (const p of pairs.slice(-8)) {
                    for (const e of (p.entries || []).slice(-2)) {
                        push(`- **${p.a} × ${p.b}**：${e.event}${e.actorDo ? `（${e.actorDo}）` : ''}${e.knownBy === 'one' ? ' ⚠️仅单方知晓' : ''}`);
                    }
                }
                push('');
            }
            // 悬念簿
            const open = this.suspense?.openItems?.() || [];
            if (open.length) {
                push('## 🧩 未结悬念');
                push('');
                for (const x of open) push(`- [${x.kind || 'plan'}] ${x.content}`);
                push('');
            }
            // 群像日记
            const diaries = this.diary?.diaries || {};
            if (Object.keys(diaries).length) {
                push('## 📔 角色日记');
                push('');
                for (const [name, arr] of Object.entries(diaries)) {
                    const last = (arr || []).slice(-1)[0];
                    if (last) push(`- **${name}**（第${last.floor ?? '?'}楼·${last.mood || '平静'}）：${String(last.text || '').slice(0, 80)}${last.secret ? ` ｜未说出口：${last.secret}` : ''}`);
                }
                push('');
            }
            // 物品
            if ((this.itemOps || []).length) {
                push('## 🎒 物品台账');
                push('');
                for (const o of (this.itemOps || []).slice(-10)) {
                    if (o?.name) push(`- **${o.name}**（持有：${o.holder || '无主'} · 状态：${o.state || '完好'}）`);
                }
                push('');
            }
            // 大纲
            if (this.outline?.stage) {
                push('## 🎬 当前大纲');
                push('');
                push(`**「${this.outline.stage.title}」**：${this.outline.stage.goal}（tempo: ${this.outline.stage.tempo}）`);
                const cur = this.outline.currentTurn;
                if (cur) push(`- 本轮（第${this.outline._turnIndex + 1}/${this.outline.flatTurns.length}轮）：${cur.goal} [${cur.pacing}]`);
                push('');
            }
            // 事件统计
            push('## 🔍 审计统计');
            push('');
            // [v3.169] 账本自述：byType 只统计「还在窗口里的」事件——已淘汰的事件连类型一起
            //   消失，读者会据此断定「那类变更从未发生」。窗口与累计必须并排写出。
            {
                const _ost = opLogStatsCompat(this);
                if (_ost.error || _ost.absent) {
                    push(`-   ⚠️ ${_ost.error ? '账本读取失败：' + _ost.error : '账本不存在'}——下列计数不可信（不是 0，是看不见）`);
                } else {
                    push(`-   窗口 ${_ost.total}/${_ost.cap || 500} 条 · 累计事件 ${this.opLog?.observedTotal?.() ?? _ost.total} · ${this.opLog?.auditSummary?.() || ''}`);
                    if (_ost.truncated) push(`-   ⚠️ 其中 ${_ost.truncated} 条事件已因环形上限淘汰，按类型统计已不完整`);
                }
            }
            for (const [k, v] of Object.entries(opLogStatsCompat(this).byType || {})) {
                push(`- ${k}：${v} 次`);
            }
            // [v3.76] B: 金字塔与重试队列状态
            const gt = this.summary?.genericTiers || [];
            if (gt.length) {
                push('');
                push('**金字塔扩展层：**');
                for (const g of gt) push(`- ${g.name}（tier${g.tier}）：${(g.items || []).length} 条`);
            }
            const rq = this.summary?.retryQueue || [];
            if (rq.length) {
                push('');
                push(`**重试队列：** ${rq.length} 个待重试任务`);
                for (const j of rq.slice(-3)) push(`- ${j.kind}/tier${j.tier}：已试 ${j.attempts} 次`);
            }
            // [v3.107] 任务收件箱状态（缝合 bionic memory-inbox）：卡在哪个阶段 / 最旧待办等了多久
            try {
                const inbox = this.getTaskInboxReport?.();
                if (inbox && inbox.total) {
                    push('');
                    push(`**任务收件箱：** 共 ${inbox.total} 条（可执行 ${inbox.runnable}）`);
                    push(`- 待办 ${inbox.counts.pending || 0} / 已领取 ${inbox.counts.claimed || 0} / 已完成 ${inbox.counts.completed || 0} / 已推迟 ${inbox.counts.deferred || 0} / 已放弃 ${inbox.counts.cancelled || 0}`);
                    if (inbox.waitingMs > 0) push(`- 最旧待办等待：${Math.round(inbox.waitingMs / 60000)} 分钟`);
                }
            } catch (e) { errLog(e, 'exportMemoryReport.任务收件箱'); }
            // [v3.109] 召回产物诊断（缝合 bionic turn-artifact）：命中率 / 平均注入长度
            try {
                const aa = (typeof window !== 'undefined' ? window.LonShaRecallArtifact : null)
                    || (typeof require !== 'undefined' ? (() => { try { return require('./recall-artifact.js'); } catch { return null; } })() : null);
                if (aa && this._recallArtifacts && this._recallArtifacts.length) {
                    const s = aa.summarizeArtifacts(this._recallArtifacts);
                    push('');
                    push(`**召回产物：** ${s.total} 条（复用 ${s.reuses} 次，命中率 ${(s.hitRate * 100).toFixed(1)}%）`);
                    push(`- 平均注入 ${s.avgInjectionChars} 字 / 空产物 ${s.empties} 条`);
                    /* [v3.275.0] O5：依据清单被截过的产物数必须出现在报告里。
                     *   截断时 isArtifactStale 的 missing/ratio 只覆盖清单内那部分（窄读数），
                     *   报告不写这一行，读的人会把「这 200 条里没丢」读成「依据完整」。 */
                    if (Number(s.selectedTruncatedCount) > 0) {
                        push(`- ⚠️ ${s.selectedTruncatedCount} 条产物的入选依据清单被截（每条至多保留 ${aa.MAX_SELECTED_IDS || 200} 条，`
                            + `合计依据 ${s.selectedIdsSum} 条下界）—— 其失效判定只覆盖清单内部分`);
                    }
                    // [v3.157] 术语词典可观测：上限是多少、当前多少条，一眼可查
                    try {
                        const _lx = this.lexicon;
                        if (_lx && Array.isArray(_lx.items)) {
                            const _lxMax = Number.isFinite(Number(_lx.max)) ? Number(_lx.max) : 40;
                            push(`**术语词典：** ${_lx.items.length}/${_lxMax} 条${_lx.items.length >= _lxMax ? '（已达上限，新术语将按 count/lastFloor 淘汰旧条目）' : ''}`);
                        }
                    } catch (e) { errLog(e, 'exportMemoryReport.术语词典'); }
                    // [v3.156] 淘汰分账（老化 vs 超容量），解释「条数为何变少」
                    const _ev = this._recallArtifactEvictions || {};
                    const _evAge = Number(_ev.byAge) || 0;
                    const _evCap = Number(_ev.byCap) || 0;
                    if (_evAge || _evCap) {
                        push(`- 本会话淘汰 ${_evAge + _evCap} 条（老化 ${_evAge} / 超容量 ${_evCap}）${Number.isFinite(Number(_ev.lastFloor)) ? `，最近一次在第 ${_ev.lastFloor} 楼淘汰 ${_ev.lastRemoved} 条` : ''}（会话内计数，换会话归零）`);
                    }
                }
            } catch (e) { errLog(e, 'exportMemoryReport.召回产物'); }
            // [v3.110] 事件性门控诊断（缝合 bionic smart-trigger）：省下的提取调用数 / 判定分布
            try {
                const st = (typeof window !== 'undefined' ? window.LonShaSmartTrigger : null)
                    || (typeof require !== 'undefined' ? (() => { try { return require('./smart-trigger.js'); } catch { return null; } })() : null);
                if (st && Array.isArray(this._triggerStats) && this._triggerStats.length) {
                    const s = st.summarizeTriggers(this._triggerStats);
                    push('');
                    push(`**事件性门控：** 评估 ${s.evaluated} 楼（触发 ${s.fired} / 跳过 ${s.skipped}，命中率 ${(s.fireRate * 100).toFixed(1)}%）`);
                    push(`- 估计省下 LLM 提取 ${s.savedCalls} 次 / 平均得分 ${s.avgScore}`);
                    if (s.topReasons.length) push(`- 高频理由：${s.topReasons.map(r => `${r.reason}×${r.count}`).join('、')}`);
                    // [v3.171] 读数面：读数缺口必须入面板，否则「判不了 / 没读到 / 被丢弃」
                    //   会与「真平淡」在面板上同形（I6）。
                    if (typeof st.normalizeTriggerReport === 'function') {
                        const panel = st.normalizeTriggerReport(this._triggerStats, {
                            cap: 300,
                            dropped: Number(this._triggerDropped) || 0,
                        });
                        if (panel.hasReadGap) {
                            const bits = [];
                            if (panel.empty) bits.push(`空读 ${panel.empty} 楼`);
                            if (panel.missing) bits.push(`缺失 ${panel.missing} 条`);
                            if (panel.dropped) bits.push(`环形淘汰 ${panel.dropped} 条`);
                            push(`- ⚠️ 读数缺口：${bits.join(' / ')}（正常读数 ${panel.plain} 楼）`);
                        }
                        const _invBad = this._triggerStats.reduce((n, r) => n + Number((r && r.report && r.report.invalidPatterns) || 0), 0);
                        const _omitErr = this._triggerStats.reduce((n, r) => n + Number((r && r.report && r.report.omitErrors) || 0), 0);
                        if (_invBad || _omitErr) {
                            // 用字符串拼接而非数组 .push（v3111 体检段窗口内只允许 push 文本行）
                            let _bad = '';
                            if (_invBad) _bad += `自定义规则无法编译 ${_invBad} 次`;
                            if (_omitErr) _bad += (_bad ? ' / ' : '') + `番外判定抛错 ${_omitErr} 次`;
                            push(`- ⚠️ 判定失败：${_bad}（已 fail-open，未影响提取）`);
                        }
                    }
                }
            } catch (e) { errLog(e, 'exportMemoryReport.事件性门控'); }
            // [v3.111] 召回体检（缝合 bionic recall-candidate-packet + task-graph-stats）：
            //   回答「为什么这条记忆没被想起来」——索引覆盖率 / 问题分布 / 掉队候选数。
            //   纯读诊断，不参与召回决策（无配置键、默认生效）。
            try {
                const ra = (typeof window !== 'undefined' ? window.LonShaRetrievalAudit : null)
                    || (typeof require !== 'undefined' ? (() => { try { return require('./retrieval-audit.js'); } catch { return null; } })() : null);
                if (ra && this.vector && Array.isArray(this.vector.vectors) && this.vector.vectors.length) {
                    const audit = ra.auditVectorStore(this.vector.vectors, {
                        expectedDimension: Number(this.vector.dimension) || 0,
                    });
                    const sum = ra.summarizeAudit(audit);
                    const tail = ra.planVectorTail(this.vector.vectors, {
                        expectedDimension: Number(this.vector.dimension) || 0,
                        limit: 5,
                    });
                    push('');
                    push(`**召回体检：** ${sum.total} 条（健康 ${sum.healthy}，覆盖率 ${(sum.coverage * 100).toFixed(1)}%）`);
                    if (sum.topIssues.length) push(`- 问题分布：${sum.topIssues.map(i => `${i.reason}×${i.count}`).join('、')}`);
                    if (sum.blockingRecall > 0) push(`- ️ ${sum.blockingRecall} 条因向量缺陷基本不可召回（可修复）`);
                    if (tail.flaggedTotal > 0) push(`- 掉队候选 ${tail.flaggedTotal} 条（含最近 ${tail.candidates.length} 条示例）`);
                    const nodes = this.graph?.nodes ? Array.from(this.graph.nodes.values()) : [];
                    if (nodes.length) {
                        const rows = ra.summarizeTypeCounts(nodes, null, {});
                        if (rows.length) push(`- 图谱节点：${rows.map(r => `${r.label}${r.count}`).join('、')}`);
                    }
                }
            } catch (e) { errLog(e, 'exportMemoryReport.召回体检'); }
            // [v3.172] 召回漏斗面板（缝合四模块的收缩阶段）：漏斗在哪一段变窄、窄了多少
            try {
                const _aiP = (typeof window !== 'undefined' ? window.LonShaAISelect : null);
                if (_aiP && typeof _aiP.normalizeRecallFunnel === 'function'
                    && Array.isArray(this._recallFunnel) && this._recallFunnel.length) {
                    const _fpR = _aiP.normalizeRecallFunnel(this._recallFunnel, {
                        cap: 500, dropped: Number(this._recallFunnelDropped) || 0,
                    });
                    push('');
                    push(`**召回漏斗：** 读数 ${_fpR.records} 轮（AI 空集 ${_fpR.empty}，正常读数 ${_fpR.recorded}）`);
                    if (_fpR.hasReadGap) push(`- 收缩读数：${_fpR.unreadable} 判不了 / ${_fpR.unmatched} 映射不上 / `
                        + `${_fpR.truncated} 粗召回截断 / ${_fpR.graphDropped} 图谱截断 / ${_fpR.hardCut} 硬切 / `
                        + `${_fpR.channelFallback} 副通道回落 / ${_fpR.dropped} 环形淘汰 / ${_fpR.missing} 缺失读数`);
                    else push(`- 本轮窗口内未观测到收缩（≠ 从未收缩：环形淘汰 ${_fpR.dropped} 条）`);
                    if (Number(this._recallFunnelReadEmpty) > 0) push(`- 空读轮次 ${this._recallFunnelReadEmpty}（一轮下来一条读数都没计到）`);
                }
            } catch (e) { errLog(e, 'exportMemoryReport.召回漏斗'); }
            // [v3.173] 模块接线面板（v3.163 账本 7 个零消费模块的接线产出）
            try {
                const _ax = [];
                if (this._entityRegistryRead) _ax.push(`实体登记 ${this._entityRegistryRead.upserted} 条`
                    + (this._entityRegistryRead.rejected ? ` / 被拒 ${this._entityRegistryRead.rejected}` : '')
                    + (this._entityRegistryRead.resolveMiss ? ` / 身份不唯一 ${this._entityRegistryRead.resolveMiss}` : ''));
                if (this._graphDedupCascade) _ax.push(`图谱 ${this._graphDedupCascade.nodes} 节点 / ${this._graphDedupCascade.edges} 边`
                    + ` / 幽灵边 ${this._graphDedupCascade.ghostNodes} / 悬空依赖 ${this._graphDedupCascade.danglingDeps}`);
                if (this._cadenceTriage) _ax.push(`抽取节奏 seq=${this._cadenceTriage.seq}`
                    + ` 本轮激活 ${(this._cadenceTriage.active || []).length}/${this._cadenceTriage.tuned}`
                    + (this._cadenceTriage.normalizedFallback && this._cadenceTriage.normalizedFallback.length
                        ? ` / 旋钮回落 ${this._cadenceTriage.normalizedFallback.join(' ')}` : ''));
                if (this._floorRangeLedger) _ax.push(`覆盖水位 ${this._floorRangeLedger.coveredTo} 楼`
                    + ` / ${this._floorRangeLedger.segments} 段 / 空洞 ${this._floorRangeLedger.holes}`
                    + ` / 待处理 ${this._floorRangeLedger.pending} 段`);
                if (this._artifactTurnReconcile) _ax.push(`产物轮次对账 认领 ${this._artifactTurnReconcile.claimed}`
                    + ` / 对不上 ${this._artifactTurnReconcile.unmatched}（库内 ${this._artifactTurnReconcile.existing}）`);
                if (this._histFpRead) _ax.push(`历史指纹走${this._histFpRead.via === 'canonical' ? '模块 FNV' : '本地回落'}`);
                if (this._npcTiesRead) _ax.push(`关系网对账 模块 ${this._npcTiesRead.moduleRows} 行 / 内联 ${this._npcTiesRead.inlineRows} 行`
                    + `（${this._npcTiesRead.rowsAgree ? '一致' : '格式已分歧'}）`);
                if (_ax.length) {
                    push('');
                    push('**模块接线：** v3.163 账本 7 个零消费模块的接线产出');
                    for (const _line of _ax) push('- ' + _line);
                }
            } catch (e) { errLog(e, 'exportMemoryReport.模块接线'); }
            // [v3.112] 覆盖账本诊断（缝合 AnchorNote）：归档隐藏的推导结果 / 待恢复数 / 孤儿覆盖者
            try {
                const cs = this._lastCoverageSummary;
                if (cs && cs.candidateFloors) {
                    push('');
                    push(`**覆盖账本：** 候选 ${cs.candidateFloors} 楼（被覆盖 ${cs.coveredFloors}，覆盖率 ${(cs.coverageRate * 100).toFixed(1)}%）`);
                    push(`- 当前归档隐藏 ${cs.hiddenFloors} 楼（上次重算：新增 ${cs.toHide} / 恢复 ${cs.toRestore} / 保持 ${cs.unchanged}）`);
                    if (cs.orphans.length) push(`- 孤儿覆盖者 ${cs.orphans.length} 个（覆盖区间内已无可归档楼层）`);
                }
            } catch (e) { errLog(e, 'exportMemoryReport.覆盖账本'); }
            return L.join('\n');
        }


        collectExport() {
            // [v3.138] CP-L2: 数据版本戳 = 最近一次成功存档时的插件版本（区别于恒为当前版本的 payload.version）。
            // 嵌入存档恢复判旧用它，不再被「collectExport 恒打当前版本戳」污染。
            return {
                version: VERSION,
                clock: this.clock?.export?.() || null,
                graph: this.graph.export(),
                charMem: this.charMem ? this.charMem.export() : {},
                worldProg: this.worldProg ? this.worldProg.export() : {},
                summaries: this.summary.export(),
                diaries: this.diary.export(),
                reflection: this.reflection?.export?.(),
                itemOps: this.itemOps,
                vectors: this.vector.export(),
                povs: this.pov.export(),
                timeline: this.timeline.export(),
                status: this.status.export(),
                ledger: this.ledger.export(),
                suspense: this.suspense.export(),
                moneyLedger: this.moneyLedger.export(),
                cards: this.cards.export(),
                conflicts: this.conflicts.export(),
                scene: this.scene.export(),
                echo: this.echo?.export?.(),
                prequel: this.prequel ? this.prequel.export() : { text: '' },   // [v3.87] 前情资料随聊天持久化
                supersede: window.LonShaSupersede ? this.supersede.export() : { supersededMap: {} },
                narrativeEntropy: this._narrativeEntropy || 0,
                stmLtm: this._stmLtmState || null,   // [v3.96] STM/LTM 游标巩固状态随聊天持久化
                // [v3.109] 召回产物随聊天持久化（跨会话复用依据；默认关时为空数组，序列化开销可忽略）
                recallArtifacts: this._recallArtifacts || [],
                diaryInjectFloor: Number.isFinite(Number(this._diaryInjectFloor)) ? Number(this._diaryInjectFloor) : null,
                timelineInjectFloor: Number.isFinite(Number(this._timelineInjectFloor)) ? Number(this._timelineInjectFloor) : null,
                deltaBook: this.deltaBook.export(),  // [v3.130] CP: 此前 collectExport 漏载本键（OMR 手写清单有、单真源没有的漂移键）
                cse: this.cse?.export?.() || { chars: {} },   // [v3.130] CP
                pulse: this.pulse?.export?.() || { beats: [], arcs: {} },   // [v3.130] CP
                opLog: this.opLog?.export?.() || null,   // [v3.130] CP: 事件溯源日志此前只在 OMR 手写清单里，正式导出/快照路径一直丢失
                outline: this.outline.export(),   // [v3.130] CP
                pairMem: this.pairMem.export(),   // [v3.130] CP
                lockedFacts: this.summary.getLockedFacts?.() || [],   // [v3.130] CP
                recallSourceStats: this._recallSourceStats || null,   // [v3.130] CP
                lexicon: this.lexicon.export(),   // [v3.152] 术语词典随聊天持久化
                factVersions: this._factVersionState || null,   // [v3.194] 时间与事实版本账
                eventThreads: this._eventThreadState || null,   // [v3.194] 事件线账（含未完成事项）
                repairLog: this._repairState || null,           // [v3.194] 修复闭环台账
                // [v3.130] CP: 游标身份（chatId/指纹）随存档走——CHANGED 自愈重置后，同楼层重入也能判定"同楼重放"而非误初始化
                timelineCursorChatId: this._timelineCursorChatId,
                timelineCursorFingerprint: this._timelineCursorFingerprint,
                timeWentBack: this._timeWentBack ? { ...this._timeWentBack } : null,
                lastSave: this._lastSaveGroundTruth ? { ...this._lastSaveGroundTruth, sources: { ...(this._lastSaveGroundTruth.sources || {}) } } : null,   // [v3.130] 保存地面真源
                packedAt: new Date().toISOString(),
                schemaVersion: ARCHIVE_SCHEMA_VERSION,   // [v3.140] CP: 判旧用整数结构版本（与插件版本解耦）
                producerVersion: VERSION,   // [v3.140] CP: 生成本存档的插件版本（v3.138 的 dataVersion 与本键同值，已合并废除）
                extensions: this._archiveExtensions || {},   // [v3.142] CP: 宽容解析出口——导入时遇到的未知顶层键随存档回写，不丢不炸
            };
        }

        // [v3.138] CP-L2: 恢复管线单真源（stbme「身份/持久化/配置收敛单一真源」第二层）。
        // storage.load / 设置面板导入 / 嵌入存档恢复三处手写清单此前必然漂移——
        // v3.23 的嵌入恢复按钮缺失、v3.136 前 UI 导入丢新键都是这个结构性缺口的历史实例。
        // 此后新恢复键只在此登记一处，三个入口自动同步。
        restoreFromPayload(data) {
            // [v3.140] CP: 结构化恢复结果（v3.138 整体 try/catch + 返回计数：一个子系统抛错则后续字段
            // 全部不再恢复，调用方却仍收到数字并被 UI 报成“导入成功”）。
            // 现在逐字段独立捕获，返回 {ok, restored, skipped, failed, count, source}，部分失败可定位。
            const opts = arguments[1] || {};
            const res = { ok: true, dryRun: opts.dryRun === true, restored: [], skipped: [], missing: [], failed: [], count: 0, source: String(opts.source || 'unknown'), at: Date.now() };
            if (!data || typeof data !== 'object') { res.ok = false; res.error = 'invalid payload'; return res; }
            // [v3.142] CP: 预检（dryRun）不得动确认状态——只读校验不该有任何副作用
            if (opts.dryRun !== true) this.storage._confirmed = null;   // 恢复期间清除确认（真实落盘后由 storage.save 重新推进）
            if (opts.dryRun !== true) this._bumpEpoch('restore:' + res.source);   // [v3.145] CP-L6: 整体替换运行时，作废在飞任务
            const _sv = Number(data.schemaVersion) || 0;
            if (_sv > ARCHIVE_SCHEMA_VERSION) {
                res.schemaWarning = `存档结构版本 ${_sv} 新于当前 ${ARCHIVE_SCHEMA_VERSION}（可能丢失未知字段语义）`;
            }
            const dry = opts.dryRun === true;   // [v3.142] CP: 两阶段恢复——先预检（不写运行时），再落盘
            // [v3.209.0] 结构迁移面（缺口的**另一个方向**）。
            //   修前实测：此前只有上面那一条 `_sv > 当前` 的分支 —— 「存档比插件**旧**」
            //   完全无人处理，旧档被逐字段塞进新运行时（缺字段静默缺失、语义变化静默沿用）。
            //   结构代际一旦升到 2，旧档会以「看起来恢复成功」的姿态落盘，实际语义错位。
            //   位置纪律（本版两度踩坑、二次才真修对）：块内引用 `const dry`，
            //   故**必须**落在 `dry` 声明之后 —— 写在之前 TDZ 会抛 ReferenceError，
            //   外层 try/catch 把它吞成一句 errLog，症状是「迁移面静默不生效」（不报错、不生效）。
            //   首版即写在前面，首次「修正」只改了本注释的文字、没搬位置（自伤留痕）；
            //   本版实测复现（`else if (!dry)` 先于声明）后才真正搬移。
            try {
                const _SM = _schemaMigrationLib();
                if (_SM && typeof _SM.plan === 'function') {
                    const _mp = _SM.plan(data, ARCHIVE_SCHEMA_VERSION);
                    res.migration = { verdict: _mp.verdict, from: _mp.from, to: _mp.to, steps: _mp.steps.map((s) => s.id), why: _mp.why };
                    // [v3.209.0] 一行读数**在恢复现场就地算**：此处 data 还是真载荷，
                    //   `line()` 的消费点因此有真源。刻意不在 selfCheck 里合成 `{schemaVersion: from}`
                    //   重算 —— 合成载荷会把「载荷无代际」与「代际不可解析」两类成因抹平，
                    //   而这两类处置完全不同（前者要人工确认结构，后者要修字段）。
                    res.migration.line = _SM.line(data, ARCHIVE_SCHEMA_VERSION);
                    if (_mp.verdict === 'plan') {
                        if (opts.migrate === true && typeof _SM.run === 'function') {
                            const _mr = _SM.run(data, { target: ARCHIVE_SCHEMA_VERSION, apply: true, plan: _mp });
                            res.migration.applied = _mr.applied;
                            res.migration.ok = _mr.ok;
                            res.migration.why = _mr.why;
                            // 迁移后的载荷继续走同一条恢复管线（单真源：不为迁移另开一条导入路径）
                            if (_mr.ok && _mr.payload) {
                                data = _mr.payload;
                                res.migrated = true;
                            } else {
                                // 迁移失败：**不继续恢复**（半套结构比不恢复更危险），把快照留给调用方决定
                                res.migration.snapshotAvailable = !!_mr.snapshot;
                                res.ok = false;
                                res.failed.push({ key: 'schemaMigration', error: _mr.why });
                                return res;
                            }
                        } else if (!dry) {
                            // 真实恢复但未授权迁移：必须让调用方看见「这个档是旧结构、需要迁移」
                            res.migration.needsAction = true;
                        }
                    }
                } else {
                    // 模块缺席**不伪装成「无需迁移」**：留 null + 诊断面报未加载
                    res.migration = null;
                }
            } catch (e) { errLog(e, 'restoreFromPayload.schemaMigration'); res.migration = { verdict: 'unknown', why: '迁移面异常：' + String(e?.message || e) }; }
            // [v3.209.0] 留档最后一次**结构代际**迁移读数：selfCheck「结构迁移」行的真源。
            //   命名纪律：刻意不叫 _lastMigrationReport —— 那个名字已被 v3.166 的**配置迁移**
            //   台账占用（ConfigManager.loadConfig 填充，回答「这次启动迁了哪些配置键」）。
            //   同名必须同义：配置键迁移与存档结构代际迁移是两件事，不得共用一个名字。
            //   模块缺席或载荷不可判时存 null（**不编默认值**：「没查过」与「查过没问题」必须可分）。
            this._lastSchemaMigration = res.migration ? Object.assign({ at: Date.now() }, res.migration) : null;
            // [v3.140] CP: 装载来源版本随恢复结果上报（v3.138 的 _dataVersion 字段判旧改道后只写不读，已删）
            res.loadedProducer = (typeof data.producerVersion === 'string' || typeof data.version === 'string') ? String(data.producerVersion || data.version) : null;
            // [v3.146] CP 原子提交边界：真实恢复前抓一份「改前全量快照」（collectExport 与
            // restoreFromPayload 是同一套契约键的对称原语，不另建快照系统）。仅在调用方
            // 显式 opts.snapshot 且开关开启时抓取。storage.load 刻意不抓：其失败回滚目标是「上一聊天
            // 残留的运行时」，把旧聊天数据装回新聊天比半套状态更危险（跨档污染）。
            let _pre = null;
            if (!dry && opts.snapshot === true && this.config.config.atomicRestoreEnabled !== false) {
                try { _pre = this.collectExport(); }
                catch (e) { errLog(e, 'restoreFromPayload.snapshot'); _pre = null; }
            }
            // [v3.142] CP 宽容解析（stbme round-trip 纪律）：未知顶层键不丢不炸，收进 extensions 命名空间随存档回写。
            const _ext = data.extensions && typeof data.extensions === 'object' ? data.extensions : null;
            if (!dry && _ext) { this._archiveExtensions = Object.assign({}, this._archiveExtensions || {}, _ext); }
            const _unknown = Object.keys(data).filter(k => !ARCHIVE_TOP_LEVEL_KEY_SET.has(k) && k !== 'exportedAt');
            res.unknown = _unknown;
            // [v3.261.0 缝合 MyriadKnots] 存档体检：在恢复现场就地做**三分判定**
            //   （活真源 / 可清理候选 / 保留），契约取本插件存档顶层键集合这一**现成真源**
            //   （ARCHIVE_TOP_LEVEL_KEY_SET，与上方 _unknown 判定同源，不另造第二份清单）。
            //   为什么就地算而不在 selfCheck 里合成：此处 data 还是真载荷——合成载荷会把
            //   「键不在册」与「值判不了」两类成因抹平，而两者处置完全不同。
            //   模块缺席 / 载荷不可判时留 null（**不编默认值**：「没查过」≠「查过没问题」）。
            try {
                const _AA = _archiveAuditLib();
                if (_AA && typeof _AA.classifyArchive === 'function') {
                    const _au = _AA.classifyArchive(data, ARCHIVE_TOP_LEVEL_KEY_SET);
                    if (_au && _au.ok === true) {
                        res.archiveAudit = {
                            verdict: _au.verdict,
                            active: _au.stats.active.count, cleanup: _au.stats.cleanup.count, retained: _au.stats.retained.count,
                            total: _au.stats.total.count, bytes: _au.stats.total.bytes,
                            cleanupKeys: _au.entries.filter((e) => e.verdict === 'cleanup').map((e) => e.key).slice(0, 12),
                            retainedKeys: _au.entries.filter((e) => e.verdict === 'retained').map((e) => e.key + '(' + e.reason + ')').slice(0, 12),
                            line: _AA.line(_au),
                        };
                    } else res.archiveAudit = { verdict: 'invalid-payload', why: _au?.reason || '未知' };
                } else res.archiveAudit = null;
            } catch (e) { errLog(e, 'restoreFromPayload.archiveAudit'); res.archiveAudit = { verdict: 'threw', why: String(e?.message || e) }; }
            this._lastArchiveAudit = res.archiveAudit ? Object.assign({ at: Date.now(), source: res.source }, res.archiveAudit) : null;
            if (!dry && _unknown.length) {
                const bag = this._archiveExtensions || (this._archiveExtensions = {});
                for (const k of _unknown) bag[k] = data[k];
                res.unknownPreserved = _unknown.length;
            }
            const _impKeys = [];   // [v3.236.0] R4-B：登记序号（只增不改序），与 _imp 的**调用序**逐位一致
            const _imp = (key, need, fn) => {
                _impKeys.push(key);
                if (data[key] == null) { res.skipped.push(key); return; }        // payload 无此字段
                if (!need) { res.missing.push(key); return; }                    // [v3.142] 有数据但引擎无对应模块：单列，不与「无数据」混为一谈
                if (dry) { res.restored.push(key); res.count++; return; }        // [v3.142] 预检只出计划，绝不写运行时
                try { fn(); res.restored.push(key); res.count++; }
                catch (e) { res.failed.push({ key, error: String(e?.message || e) }); errLog(e, 'restoreFromPayload.' + key); }
            };
            const engine = this;
            _imp('graph', !!engine.graph, () => engine.graph.import(data.graph));
            _imp('summaries', !!engine.summary, () => engine.summary.import(data.summaries));
            _imp('diaries', !!engine.diary, () => engine.diary.import(data.diaries));
            _imp('vectors', !!engine.vector, () => engine.vector.import(data.vectors));
            _imp('povs', !!engine.pov, () => engine.pov.import(data.povs));
            _imp('timeline', !!engine.timeline, () => engine.timeline.import(data.timeline));
            _imp('status', !!engine.status, () => engine.status.import(data.status));
            _imp('clock', !!engine.clock, () => engine.clock.import(data.clock));
            _imp('ledger', !!engine.ledger, () => engine.ledger.import(data.ledger));
            _imp('suspense', !!engine.suspense, () => engine.suspense.import(data.suspense));
            _imp('scene', !!engine.scene, () => engine.scene.import(data.scene));
            _imp('echo', !!engine.echo, () => engine.echo.import(data.echo));
            _imp('prequel', !!engine.prequel, () => engine.prequel.import(data.prequel));
            _imp('supersede', !!engine.supersede, () => engine.supersede.import(data.supersede));
            _imp('reflection', !!engine.reflection, () => engine.reflection.import(data.reflection));
            _imp('charMem', !!engine.charMem, () => engine.charMem.import(data.charMem));
            _imp('worldProg', !!engine.worldProg, () => engine.worldProg.import(data.worldProg));
            _imp('itemOps', true, () => {
                // [v3.155] 纵深：旧写法把外部存档的 data.itemOps 整体赋给真源（连长度/枚举/类型都不过）。
                //   改为校验后落盘；校验内核逐项宽容转换（能修就修），关卡关闭时逐位回退旧行为。
                const _raw = Array.isArray(data.itemOps) ? data.itemOps : [];
                const _vres = (engine.config && engine.config.config && engine.config.config.ledgerWriteValidationEnabled === false)
                    ? _raw.filter(o => o && o.name)
                    : validateLedgerItemOps(_raw, { fallbackFloor: 0 });
                // [v3.261.0 缝合 MyriadKnots] 忠实认领**证明**（只读，不改数据）。
                //   回答的是一个此前无人回答的问题：这份导入档里的物品 op，有多少**能证明**
                //   属于当前聊天、有多少判不了、判不了是哪种根因。
                //   为什么只证明不删：op 的失效清理**已有唯一真源**（optimizeMemory 的 3b 段
                //   按「fp 不在该楼任何 swipe 取值里」判定），在此再删一份就是第二份判据——
                //   两份判据一定漂移，且会先把「越界楼层」这类 pending 误删（3b 明确保留它们）。
                //   故本处产出的是**可查证明**：proved / unproved / 根因，供诊断面点名。
                //   op 与本聊天楼层的对应关系不能用 locator 段（op 只存 floor 号，不存页码），
                //   故把候选 locator 置为永不可能命中的负值，只让「全局唯一指纹对」段生效。
                let _claim = null;
                try {
                    const _FI = _floorIdentityLib();
                    const _chat = window.SillyTavern?.getContext?.()?.chat;
                    const _ops = (_vres.items || _vres);
                    if (_FI && typeof _FI.matchFloorCandidates === 'function' && Array.isArray(_chat) && _chat.length && _ops.length) {
                        const _entries = _chat.map((m, i) => {
                            const _sw = Math.max(0, Math.round(Number(m?.swipe_id) || 0));
                            const _fp = msgFpOf(m);
                            return { id: 'floor:' + i, hostLocator: { messageIndex: i, swipeId: _sw, selectedSwipeIndex: _sw }, content: { canonicalFingerprint: _fp, rawFingerprint: _fp } };
                        });
                        const _candidates = _ops.map((o) => {
                            const _fp = String(o?.fp || '');
                            return { hostLocator: { messageIndex: -1, swipeId: -1, selectedSwipeIndex: -1 }, canonicalFingerprint: _fp, rawFingerprint: _fp, messageAnchor: { status: 'none' } };
                        });
                        const _m = _FI.matchFloorCandidates(_entries, _candidates);
                        _claim = {
                            at: Date.now(),
                            ops: _ops.length,
                            floors: _entries.length,
                            proved: _m.matches.length,
                            unproved: _m.unmatchedCandidateIndexes.length,
                            issue: _m.issue ? _m.issue.code : null,
                            line: _FI.line(_m),
                        };
                    }
                } catch (e) { errLog(e, 'restoreFromPayload.itemOpsClaim'); _claim = null; }
                engine._lastItemOpsClaim = _claim;
                engine.itemOps = _vres.items || _vres;
                if (_vres.violations && _vres.violations.length) engine._recordLedgerViolations?.(_vres.violations, 'import', 0);
                (engine.reconcileItemOps || engine.rebuildItems)?.call(engine);
            });
            _imp('narrativeEntropy', typeof data.narrativeEntropy === 'number', () => { engine._narrativeEntropy = data.narrativeEntropy; });
            _imp('stmLtm', !!engine.stmLtm, () => { engine._stmLtmState = engine.stmLtm.normalizeState(data.stmLtm); });
            _imp('recallArtifacts', Array.isArray(data.recallArtifacts), () => { engine._recallArtifacts = data.recallArtifacts.slice(-32); });
            _imp('diaryInjectFloor', Number.isFinite(Number(data.diaryInjectFloor)), () => { engine._diaryInjectFloor = Number(data.diaryInjectFloor); });   // [v3.140] 保留 v3.138 的数值守卫，脏值不写成 NaN
            _imp('timelineInjectFloor', Number.isFinite(Number(data.timelineInjectFloor)), () => { engine._timelineInjectFloor = Number(data.timelineInjectFloor); });
            _imp('timelineCursorChatId', true, () => { engine._timelineCursorChatId = String(data.timelineCursorChatId); });
            _imp('timelineCursorFingerprint', true, () => { engine._timelineCursorFingerprint = String(data.timelineCursorFingerprint); });
            _imp('deltaBook', !!engine.deltaBook, () => engine.deltaBook.import(data.deltaBook));
            _imp('cse', !!engine.cse, () => engine.cse.import?.(data.cse));
            _imp('pulse', !!engine.pulse, () => engine.pulse.import?.(data.pulse));
            _imp('outline', !!engine.outline, () => engine.outline.import?.(data.outline));
            _imp('pairMem', !!engine.pairMem, () => engine.pairMem.import?.(data.pairMem));
            _imp('moneyLedger', !!engine.moneyLedger, () => engine.moneyLedger.import?.(data.moneyLedger));
            _imp('cards', !!engine.cards, () => engine.cards.import?.(data.cards));
            _imp('conflicts', !!engine.conflicts, () => engine.conflicts.import?.(data.conflicts));
            _imp('opLog', !!engine.opLog, () => engine.opLog.import?.(data.opLog));
            // 直赋：summary.import 会重置其他字段，不可复用
            _imp('lockedFacts', Array.isArray(data.lockedFacts), () => { engine.summary.lockedFacts = data.lockedFacts.slice(); });
            _imp('recallSourceStats', typeof data.recallSourceStats === 'object', () => { engine._recallSourceStats = data.recallSourceStats; });
            _imp('lexicon', !!engine.lexicon, () => { engine.lexicon.import?.(data.lexicon); engine._invalidateBm25Corpus?.(); });
            // [v3.194] 三面新账：各自独立捕获（单面坏不连坐其余两面）
            _imp('factVersions', data.factVersions != null, () => { engine._factVersionState = _factVersionLib()?.normalize?.(data.factVersions) || null; });
            _imp('eventThreads', data.eventThreads != null, () => { engine._eventThreadState = _eventCompletenessLib()?.normalize?.(data.eventThreads) || null; });
            _imp('repairLog', data.repairLog != null, () => { engine._repairState = _repairLoopLib()?.normalize?.(data.repairLog) || null; });
            _imp('timeWentBack', typeof data.timeWentBack === 'object', () => { engine._timeWentBack = { ...data.timeWentBack }; });
            // 地面真源：只回填不回退（本地更新者保持自己的计数）
            _imp('lastSave', data.lastSave && typeof data.lastSave === 'object' && Number(data.lastSave.ts) > Number((engine._lastSaveGroundTruth || {}).ts || 0), () => {
                engine._lastSaveGroundTruth = { ts: Number(data.lastSave.ts) || 0, floor: Number(data.lastSave.floor ?? -1), sources: { ...(data.lastSave.sources || {}) } };
            });
            res.ok = res.failed.length === 0;
            // [v3.146] CP 原子提交边界：部分失败 = 运行时处于「半套状态」（导入档部分生效、
            // 原档其余残留），此前只上报不补救。现在自动回滚到恢复前快照，让失败成为
            // 唯一可发生的结果。回滚自身走同一单真源管线且不带 snapshot/原子标志，杜绝递归。
            if (!res.ok && _pre && this.config.config.atomicRestoreEnabled !== false) {
                try {
                    const rb = this.restoreFromPayload(_pre, { source: 'auto-rollback:' + res.source });
                    res.rolledBack = rb.count > 0;
                    res.rollback = { restored: rb.count, failed: rb.failed.length };
                    if (rb.count === 0) res.rollbackWarning = '自动回滚未恢复任何字段，运行时可能仍为半套状态';
                    console.warn(`[${PLUGIN_NAME}] ⚠ 恢复部分失败（${res.failed.map(f => f.key).join('/')}），已自动回滚至恢复前快照（${rb.count} 字段）`);
                } catch (e) {
                    res.rolledBack = false;
                    res.rollbackError = String(e?.message || e);
                    errLog(e, 'restoreFromPayload.rollback');
                }
            }
            /* [v3.236.0] R4-B：**曾经被恢复进来的面**的累积账（键历史，跨载荷、跨快照）。
             *   存在理由：`res.registered` 只回答「这一次登记了哪些面」，而清空面板要问的是
             *   「历史上装进来过的面，清空面覆盖得住吗」—— 快照/导入可以只带字段子集，
             *   只用本次载荷的键集合会漏判（这次没带的字段，历史上可能已经装进来过）。
             *   归零点与会话身份同步（构造期 + CHAT_CHANGED），与 `_snapshotAnchorChatId` 同一纪律。 */
            try {
                if (!(this._restoredKeyHistory instanceof Set)) this._restoredKeyHistory = new Set();
                for (const _k of _impKeys) this._restoredKeyHistory.add(_k);
                res.everRestored = Array.from(this._restoredKeyHistory);
            } catch (e) { errLog(e, 'restoreFromPayload.everRestored'); }
            this._lastRestore = res;
            // [v3.236.0] R4-B：把**登记过的恢复键**随结果外供。
            //   存在理由：v3.23 的嵌入恢复按钮缺失、v3.136 前 UI 导入丢新键，都是
            //   「恢复/清空这类成套动作各自手抄一份清单」的产物。清空面板要收编，就必须
            //   问得出一句「恢复面到底有哪几面」—— 让答案来自**登记点自身**，而不是再抄一遍。
            //   `res.restored`/`failed`/`missing` 是**本次载荷的结局**（无此字段即 skipped），
            //   与「登记了什么」不是一回事，故单列一个字段，不重用名单。
            res.registered = _impKeys;
            return res;
        }
        /**
         * [v3.236.0] R4-B 缺口 1 的修法本体：**从快照恢复（两阶段 + 闸门在引擎侧）**。
         *
         * 为什么必须住在引擎侧、而不是写成面板里的两行 `if`：本仓 v3160 [1b] 要求
         *   「每个默认配置键必须在默认配置块之外有消费点」—— `snapshotPrecheckEnabled`
         *   的读点若落在 settings-ui.js，这个键在 index.js 里就是**死配置**（门禁当场翻红，
         *   而翻红是对的：UI 侧读点不参与引擎行为，测试替不掉它）。
         *
         * 两阶段的边界（与 v3.142 的 dryRun 契约逐字对齐）：
         *   · 预检**只读**：`dryRun` 分支保证不清确认、不推栅栏、不动 _archiveExtensions、
         *     不抓快照 —— 这里**不再自己实现一份**，否则就是第二真源；
         *   · 预检发现「无可恢复内容」⇒ 在**任何写盘之前**返回 `applied:false`，
         *     面板据此拦住、不落盘（修前会把「恢复了个空」写进存档）；
         *   · 真恢复带 `snapshot:true` ⇒ v3.146 的部分失败自动回滚仍然生效（不留半套）；
         *   · 闸门关闭时**跳过的只是预检，不是恢复**（关的是那一步只读校验）。
         *
         * 刻意不返回 `count` 这类裸数字给面板去猜：`applied` / `reason` 是可判定的三态，
         *   面板只播报、不判断（判断都留在这一处）。
         * @returns {{ok:boolean, applied:boolean, reason:string, precheck:(object|null), result:(object|null), chatId:(string|null)}}
         */
        restoreFromSnapshot(chatId, payload) {
            const res = { ok: false, applied: false, reason: '', precheck: null, result: null, chatId: chatId || null };
            if (!payload || typeof payload !== 'object') { res.reason = 'invalid-payload'; return res; }
            const cfg = (this.config && this.config.config) ? this.config.config : {};
            const gate = cfg.snapshotPrecheckEnabled !== false;   // 默认开可关（读点必须在引擎侧，见上）
            if (gate) {
                const pre = this.restoreFromPayload(payload, { source: 'snapshot-precheck', dryRun: true });
                res.precheck = { count: pre.count, skipped: pre.skipped.length, missing: pre.missing.length, failed: pre.failed.length };
                if (pre.count === 0) { res.reason = 'empty-snapshot'; return res; }
            }
            const rn = this.restoreFromPayload(payload, { source: 'snapshot-restore', snapshot: true });
            res.result = rn;
            if (!rn || rn.count === 0) { res.reason = 'empty-snapshot'; return res; }
            res.applied = true;
            res.ok = rn.ok !== false;
            return res;
        }
        /**
         * [v3.236.0] R4-B：**快照恢复的完整流程**（读快照 → 两阶段恢复 → 落盘）。
         *
         * 为什么连「读快照」与「落盘」也住在引擎侧、而不是留在面板里：
         *   面板此前持有流程的三段（`snapshots.restore` / `restoreFromSnapshot` /
         *   `storage.save`），每留一段就多一处「流程到底谁说了算」的暗面；更要紧的是
         *   `snapshotPrecheckEnabled` 的消费点必须落在**真实调用链**上 ——
         *   v3160 [1b] 要求「每个声明键在默认配置块之外有消费点」，D1 活性判据把它实现为
         *   两跳可达性（键 → 提及键的方法 → 该方法**有调用者**）。流程不下沉时，
         *   闸门读点所在的 `restoreFromSnapshot` 零调用者，声明键就成了死配置（实测红）。
         *
         * 三态（面板只播报、不判断）：
         *   · `{ok:false, reason}`    —— 没做成（无对话 / 快照读不出），**不要落盘**；
         *   · `{ok:true, applied:false}` —— 做成了但没动数据（空快照），**不要落盘**；
         *   · `{ok:true, applied:true}`  —— 恢复完成，且**已经落盘**（落盘发生在返回之前）。
         * @returns {Promise<{ok:boolean, applied:boolean, reason:string, precheck:(object|null), result:(object|null), chatId:(string|null)}>}
         */
        async restoreSnapshotFlow(chatId, floor) {
            const cid = chatId || this.getCurrentChatId();
            if (!cid) return { ok: false, applied: false, precheck: null, result: null, chatId: null, reason: '无可用对话' };
            const data = await this.snapshots.restore(cid, floor);
            if (!data) return { ok: false, applied: false, precheck: null, result: null, chatId: cid, reason: '快照数据为空' };
            const rs = this.restoreFromSnapshot(cid, data);
            if (!rs.applied) {
                return {
                    ok: true, applied: false, chatId: cid,
                    precheck: rs.precheck || null, result: rs.result || null,
                    reason: rs.reason === 'empty-snapshot'
                        ? '该快照无可恢复内容，当前记忆保持不变（未落盘）'
                        : '快照载荷无效，当前记忆保持不变（未落盘）'
                };
            }
            /* 落盘时机刻意留在流程内：面板「先判断后落盘」的顺序曾经是本版要修的缺陷形状
             *   （空快照被写进存档）。把它放在这里，顺序就不依赖调用方的自觉。 */
            await this.storage.save(cid, this.collectExport());
            return { ok: true, applied: true, reason: '', precheck: rs.precheck || null, result: rs.result || null, chatId: cid };
        }
        /**
         * [v3.236.0] R4-B：快照恢复菜单的**行构造**（纯函数：无 DOM、无副作用、无引擎状态读取）。
         *
         * 为什么放引擎侧而不是留在面板：面板手里的 HTML 是「恢复菜单长什么样」这份知识，
         *   而它与「哪些楼层能恢复」紧紧相邻（同一份 `snaps` 读数）。两份知识分开两处，
         *   下一次改菜单就得同时记住面板与引擎 —— 这正是本版反复在治的漂移形状。
         * @returns {string} 菜单行 HTML（空数组 ⇒ 空串）
         */
        snapshotRestoreMenu(snaps) {
            return (Array.isArray(snaps) ? snaps : []).map(s => {
                const time = new Date(s.timestamp).toLocaleString();
                return '<div class="lsm-item" data-floor="' + s.floor + '" style="display:flex;justify-content:space-between;">'
                    + '<span>楼层 ' + s.floor + '</span>'
                    + '<span style="color:var(--ls-text-2,#9da7b3);font-size:12px;">' + time + '</span>'
                    + '</div>';
            }).join('');
        }

        /**
         * [v3.236.0] R4-B 缺口 3：**清空运行内存（收编入口）** —— 把「清空当前对话全部记忆」
         * 从设置面板的一段手抄赋值搬到这里，改成**逐面登记**。
         *
         * 修前的形状（实测，可复算）：面板 `#ls-clear` 处理器手抄清空 16 个模块，
         * 而 `restoreFromPayload` 登记了 **42** 个恢复面 —— 其中**模块路径的 16 个面**
         * 从未被清空触达（`cards / charMem / clock / conflicts / cse / deltaBook / lexicon /
         * moneyLedger / opLog / outline / pairMem / prequel / pulse / stmLtm / supersede / worldProg`）。
         * 它们的清空路径从来没有代码（grep 实证：这些类的 `items=[]` / `.clear()` 在其
         * 类体内零代码命中），而清空末尾的 `collectExport()` 是**全量序列化** ——
         * 于是用户看到「已清空」，这 16 个面却原样落盘，换个对话再回来又全在。
         *
         * 本方法只做**一件事**：把 B 段那些写动作执行一遍，逐面记录结局，返回读数。
         * 为什么读数必须有名字（`perFace` 带 face/id/label/ok/error）：`this.engine.graph.nodes.clear()`
         * 这种赋值语句**抛不出错也留不下痕**，一个面没清干净时调用方只能看到一个 toCatch；
         * 本仓的既有写法是「失败必须点名、跳过必须计数」（见 restoreFromPayload 的
         * failed/missing/unknown 三态）。这里把同一口径落到清空面：**每面非 ok 即具名**。
         *
         * 刻意**不在本方法里存盘**：存盘的调用点只有一个（面板处理器），让「清空」是
         * 纯内存动作、可被测试逐字节比对（与 R4-A 的「预览是纯读」同一纪律的镜像面：
         * 这里是「清空是纯内存，落盘是调用方的自觉且只有一处」）。
         *
         * 覆盖边界（如实声明，不假装穷尽）：本方法只清**运行时内存** —— 快照库（IndexedDB）、
         * 嵌入存档（chatMetadata）、紧急备份是**恢复退路**，清空它们等于销毁用户唯一的回滚手段，
         * 故不在此列（面板文案与 runFaceReport 的行文案都据此写）。
         * @returns {{ok:boolean, cleared:string[], skipped:string[], failed:Array<{face:string,error:string}>, count:number, at:number}}
         */
        clearRuntimeMemory() {
            const res = { ok: true, cleared: [], skipped: [], failed: [], count: 0, at: Date.now() };
            const e = this;
            const A = (face, id, label, need, fn) => {
                if (!need) { res.skipped.push(face + ':' + id); return; }
                try { fn(); res.cleared.push(face + ':' + id); res.count++; }
                catch (err) { res.failed.push({ face: face, id: id, label: label, error: String(err && err.message || err) }); const er = e.errLog || (typeof errLog === 'function' ? errLog : null); if (er) er(err, 'clearRuntimeMemory.' + face + '.' + id); }
            };
            /* ── 模块面：与 restoreFromPayload 的模块面逐条同源（同序、同名、同判据）──
             *   顺序刻意与 restoreFromPayload 的 `_imp(...)` 调用序一致：两处对照时不必心算映射。 */
            A('module', 'graph', '图谱', !!e.graph, () => { e.graph.nodes.clear(); e.graph.edges.clear(); e.graph.nameIndex.clear(); });
            A('module', 'summaries', '摘要', !!e.summary, () => { e.summary.import([]); e.summary.lockedFacts = []; });
            A('module', 'diaries', '日记', !!e.diary, () => { e.diary.import({}); e.diary._lastDiaryFloor = -1; });
            A('module', 'vectors', '向量', !!e.vector, () => { e.vector.import([]); });
            A('module', 'povs', 'POV', !!e.pov, () => { e.pov.import([]); });
            A('module', 'timeline', '时间线', !!e.timeline, () => { e.timeline.import([]); });
            A('module', 'status', '人物状态', !!e.status, () => { e.status.import({ characters: {} }); });
            A('module', 'clock', '时钟', !!e.clock, () => { e.clock.import({}); });
            A('module', 'ledger', '楼层账本', !!e.ledger, () => { e.ledger.import({}); });
            A('module', 'suspense', '悬念', !!e.suspense, () => { e.suspense.import([]); });
            A('module', 'scene', '场景', !!e.scene, () => { if (typeof e.scene.clear === 'function') e.scene.clear(); else e.scene.import({}); });
            A('module', 'echo', '回响池', !!e.echo, () => { e.echo.import([]); });
            A('module', 'prequel', '前情资料', !!e.prequel, () => { if (typeof e.prequel.clearPrequel === 'function') e.prequel.clearPrequel(); else e.prequel.import({}); });
            A('module', 'supersede', '记忆取代', !!e.supersede, () => { e.supersede.import({ supersededMap: {} }); });
            A('module', 'reflection', '反思', !!e.reflection, () => { e.reflection.import([]); });
            A('module', 'charMem', '角色记忆', !!e.charMem, () => { e.charMem.import({}); });
            A('module', 'worldProg', '世界推进', !!e.worldProg, () => { e.worldProg.import({}); });
            A('module', 'itemOps', '物品账', true, () => { e.itemOps = []; (e.reconcileItemOps || e.rebuildItems)?.call(e); });
            A('module', 'deltaBook', '正史增量', !!e.deltaBook, () => { e.deltaBook.import({ deltas: [] }); });
            A('module', 'cse', '人物状态引擎', !!e.cse, () => { e.cse.import({}); });
            A('module', 'pulse', '叙事心电图', !!e.pulse, () => { e.pulse.import({}); });
            A('module', 'outline', '大纲导演', !!e.outline, () => { e.outline.import({}); });
            A('module', 'pairMem', '群像记忆', !!e.pairMem, () => { e.pairMem.import({ pairs: [] }); });
            A('module', 'moneyLedger', '钱财账本', !!e.moneyLedger, () => { e.moneyLedger.import({}); });
            A('module', 'cards', '卡牌', !!e.cards, () => { e.cards.import({ cards: [] }); });
            A('module', 'conflicts', '矛盾账本', !!e.conflicts, () => { e.conflicts.import({ conflicts: [] }); });
            A('module', 'opLog', '操作日志', !!e.opLog, () => { e.opLog.import({}); });
            A('module', 'lexicon', '术语词典', !!e.lexicon, () => { e.lexicon.import([]); if (typeof e._invalidateBm25Corpus === 'function') e._invalidateBm25Corpus(); });
            /* ── 直赋面：这些键没有独立模块，状态就在宿主字段上（与 restoreFromPayload 同源）──
             *   与模块面的区别只在于写法的必然性，不改变「一面一登记」的纪律。 */
            A('direct', 'narrativeEntropy', '叙事熵', true, () => { e._narrativeEntropy = 0; });
            A('direct', 'stmLtm', '短期长期记忆', !!e.stmLtm, () => { e._stmLtmState = (e.stmLtm && typeof e.stmLtm.normalizeState === 'function') ? e.stmLtm.normalizeState(null) : null; });
            A('direct', 'recallArtifacts', '召回产物', true, () => { e._recallArtifacts = []; });
            A('direct', 'diaryInjectFloor', '日记注入游标', true, () => { e._diaryInjectFloor = null; });
            A('direct', 'timelineInjectFloor', '时间线注入游标', true, () => { e._timelineInjectFloor = null; });
            A('direct', 'timelineCursorChatId', '时间线游标身份', true, () => { e._timelineCursorChatId = null; });
            A('direct', 'timelineCursorFingerprint', '时间线游标指纹', true, () => { e._timelineCursorFingerprint = ''; });
            A('direct', 'lockedFacts', '锁定事实', !!(e.summary && Array.isArray(e.summary.lockedFacts)), () => { e.summary.lockedFacts = []; });
            A('direct', 'recallSourceStats', '召回来源统计', true, () => { e._recallSourceStats = { total: 0, bySource: {} }; });
            A('direct', 'factVersions', '事实版本账', true, () => { e._factVersionState = null; });
            A('direct', 'eventThreads', '事件线账', true, () => { e._eventThreadState = null; });
            A('direct', 'repairLog', '修复闭环台账', true, () => { e._repairState = null; });
            A('direct', 'timeWentBack', '时间回退留痕', true, () => { e._timeWentBack = null; });
            A('direct', 'lastSave', '保存地面真源', true, () => { e._lastSaveGroundTruth = null; });
            res.ok = res.failed.length === 0;
            this._clearRuntimeReport = res;
            return res;
        }
        /**
         * [v3.236.0] R4-B：**恢复面 ↔ 清空面**的覆盖核对（可机检，不必靠人读两份清单）。
         *
         * 为什么要有这一条：缺口 3 的形状是「两份手抄清单必然漂移」——面板清空时抄了 16 面，
         * 而恢复面有 42 面。漂移本身不可怕，可怕的是它**无声**（用户看到「已清空」、落盘却是全量）。
         * 本方法把「谁没被清空」变成一个有名字、有数、可被测试逐字断言的读数。
         *
         * 三态口径（与 restoreFromPayload 一致：**「没查过」≠「查过没问题」**）：
         *   · 恢复面模块从未加载（`_imp` 把它们记进 `missing`）⇒ 清空侧记 `skipped`，**不算漏**；
         *   · 载荷无此字段（`skipped`）⇒ 同上；
         *   · 其余（本次真恢复过的 + 部分失败的）都必须能在清空面找到对应写动作。
         * 已知边界（如实记录）：`lastSave` 的地面真源语义是「只进不退」，清空侧把它置 null；
         *   `recallSourceStats` / `factVersions` / `eventThreads` / `repairLog` / `timeWentBack`
         *   同样是宿主直赋字段。这五个在恢复侧是**直赋**而不是模块 `import`，两侧的
         *   「同一面」判定按**键名**（而非路径）成立 —— 键名是契约（ARCHIVE_TOP_LEVEL_KEYS），
         *   路径是实现；按路径比对会把「换了实现写法」误报成「漏了一面」。
         *   · `everRestored` 是**三态的入口**：从来没有一次真恢复（`_lastRestore` 为 null）
         *   ⇒ `everRestored:false`，此时 `ok` 不表示「对得上」，只表示「没有证据说对不上」。
         * @returns {{everRestored:boolean, restoredKeys:string[], clearFaces:string[], missingInClear:string[], skippedInRestore:string[], ok:boolean}}
         */
        snapshotClearCoverage() {
            const rest = this._lastRestore || null;
            const registered = (rest && Array.isArray(rest.registered)) ? rest.registered.slice() : [];
            /* ★ 三态的**第三态**（本轮补实现，注释早就承诺、实现一直缺）：`everRestored`。
             *   修前形状：`_lastRestore` 为 null ⇒ restoredKeys 空 ⇒ missingInClear 空 ⇒ `ok:true`，
             *   于是「**一次恢复都没做过**」与「恢复面全被清空面覆盖」在读数上**同形**。
             *   判据写 `cov.everRestored` 时读到 undefined、断言静默跳过（v3236 C3 的测试名
             *   早就在等这个字段）。这与 v3.166「sources 与 attempts 必须分家」是同一条纪律：
             *   **「没查过」不等于「查过没问题」**。 */
            const hist = (rest && Array.isArray(rest.everRestored) && rest.everRestored.length)
                ? rest.everRestored.slice()
                : ((this._restoredKeyHistory instanceof Set) ? Array.from(this._restoredKeyHistory) : []);
            const everRestored = !!(hist && hist.length);
            /* 键集合口径：有累积账时用**累积账**（快照/导入可只带字段子集，用本次载荷的键
             *   会漏判「历史上装进来过、这次没带」的面）；无累积账时退回本次登记。 */
            const restoredKeys = everRestored ? hist : registered;
            const skippedKeys = (rest && Array.isArray(rest.skipped)) ? rest.skipped.slice() : [];
            const rep = this._clearRuntimeReport || null;
            const clearFaces = rep ? rep.cleared.concat(rep.skipped).map(x => String(x).split(':').slice(1).join(':')) : [];
            const skippedSet = new Set(skippedKeys);
            const faceSet = new Set(clearFaces);
            const missingInClear = restoredKeys.filter(k => !faceSet.has(k) && !skippedSet.has(k));
            return { everRestored: everRestored, restoredKeys: restoredKeys, clearFaces: clearFaces, missingInClear: missingInClear, skippedInRestore: skippedKeys, ok: missingInClear.length === 0 };
        }
        getCurrentChatId() {
            try {
                const c = window.SillyTavern?.getContext?.();
                return c?.chatId || c?.chatMetadata?.file_name || null;
            } catch { return null; }
        }
        /**
         * [v3.236.0] R4-B 缺口 2 的修法本体：**按会话身份的定期快照锚点**。
         *
         * 契约（调用点是 `onMessageReceived` 的定期快照分支）：
         *   · `chatId` 与调用点外层那个 `const chatId` 是**同一个读数**（调用点传参，不各自再取一次）；
         *   · 身份不符（或还没有身份）⇒ 把锚点**重置为 0** 并返回 `fresh:true`；
         *   · 身份相同 ⇒ 返回现锚点与 `fresh:false`；
         *   · `chatId` 为空 ⇒ 不建身份、不重置，返回 `fresh:false`（拿不到会话就不该记「谁存的」）。
         *
         * 为什么「身份不符」要 reset 成 0、而不是保留旧楼层：保留旧楼层就是保留那个 bug。
         *   reset 之后 `fresh:true` 让新会话先落**一份**快照（与从未快照过的会话逐字同形），
         *   再按 `curFloor - 0` 正常节流 —— 于是「B 会话永无快照」这个形状在结构上不可能再出现。
         * @returns {{fresh:boolean, floor:number, chatId:(string|null)}}
         */
        _snapshotAnchorOf(chatId) {
            const id = (chatId === undefined || chatId === null) ? '' : String(chatId);
            if (!id) return { fresh: false, floor: Number(this._snapshotAnchorFloor) || 0, chatId: this._snapshotAnchorChatId || null };
            if (this._snapshotAnchorChatId !== id) {
                this._snapshotAnchorChatId = id;
                this._snapshotAnchorFloor = 0;
                return { fresh: true, floor: 0, chatId: id };
            }
            return { fresh: false, floor: Number(this._snapshotAnchorFloor) || 0, chatId: id };
        }
        /* ────────────────────────────────────────────────────────────────
         * [v3.237.0] R4-C：**命名检查点 + 分支只读对照**（引擎侧接线）
         *
         * 为什么接线住在这里而不是面板里：R4-B 刚把「面板持一段流程」当作缺陷形状收过一次
         *   （快照恢复的读/写两段下沉引擎）。检查点是同一形状的延伸 —— 若面板自己
         *   `localStorage.getItem` + `JSON.parse`，就是第二处「检查点长什么样」的知识，
         *   而 v3160 [1b] 的活性判据也会把这些方法判成零调用者。
         *
         * 边界（三条，逐条对齐模块头的声明）：
         *   · 引擎**不自己算键面差异**：`compareBranchCheckpoints` / `previewCheckpointRestore`
         *     把对照交给 `snapshot-checkpoint.js`（同一口径只许一份实现）；
         *   · 引擎**不执行恢复**：预览只出计划，真落地仍走 `restoreFromPayload` 那一条管线；
         *   · 引擎**不编会话身份**：`chatId` 缺省取 `getCurrentChatId()`，取不到即如实报。
         * ──────────────────────────────────────────────────────────────── */
        /**
         * [v3.237.0] R4-C：检查点存储口（唯一）。
         *   形状判定只许存在一处：直接调 `snapshot-checkpoint.js` 的 `fromLocalStorage()`，
         *   **不在此重写** `length` + `key(i)` 判断（那个判断在模块里，且被 A5 判据看住）。
         * @returns {object|null} 契约形状；宿主无 localStorage / 模块未加载 / 形态不合 ⇒ null
         */
        checkpointStore() {
            try {
                const CP = _moduleLib(() => window.LonShaSnapshotCheckpoint, 'snapshot-checkpoint.js');
                if (!CP || typeof CP.fromLocalStorage !== 'function') return null;
                if (typeof localStorage === 'undefined' || !localStorage) return null;
                return CP.fromLocalStorage(localStorage);
            } catch (e) { errLog(e, 'checkpointStore'); return null; }
        }
        /** [v3.237.0] R4-C：模块取库口（与其余模块同契约：真读表达式 + 文件名）。 */
        _checkpointLib() {
            return _moduleLib(() => window.LonShaSnapshotCheckpoint, 'snapshot-checkpoint.js');
        }
        /**
         * [v3.239.0] 「没给」与「给了 0」的分界口（引擎侧，**不带符号过滤**）。
         *
         * 与 `snapshot-checkpoint.js` 的 `numOrNull` **同判据**，且刻意各留一份：
         *   模块不加载时这一处仍要能工作（否则「模块未加载」会让楼层判据跟着失守）。
         *   为什么值得单列：`Number(null) === 0`、`Number(undefined) === NaN` 之外的
         *   一大票「没给」（空串 / 布尔 / 对象）都能骗过 `Number.isFinite(Number(x))`
         *   —— 于是「我不知道这是第几楼」会被念成「第 0 楼」，本仓最贵的那类错读数。
         *   本文件的**所有**「外部来的数」判据一律走它（展示层同族修复在 v3.239.0 一并落地：
         *   4 个文案口此前也写成 `Number.isFinite(Number(x))`，会把 `null` 显示成 1970 / 第 0 楼）。
         * @returns {number|null}
         */
        _numOrNull(v) {
            if (v === null || v === undefined) return null;
            if (typeof v === 'string' && v.trim() === '') return null;
            /* 布尔刻意不接受（true 与 1 不是一回事）；对象/数组/函数一律 null ——
             *   它们能骗过旧判据（Number([]) 恒为 0），正是本版要断的那条路。 */
            if (typeof v === 'boolean' || typeof v === 'object' || typeof v === 'function') return null;
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
        }
        /**
         * [v3.239.0] 楼层专用的分界口：在 `_numOrNull` 之上再拒负值。
         *   负楼层不是合法位置（`_currentFloor` 的 **-1** 表示「还没进楼层」，
         *   它被当成楼层念出去就是「第 -1 楼」）。
         * @returns {number|null}
         */
        _floorOrNull(v) {
            const n = this._numOrNull(v);
            return (n !== null && n >= 0) ? n : null;
        }
        /**
         * [v3.237.0] R4-C：存一份命名检查点。
         *   载荷默认取 `collectExport()`（与恢复侧同一套契约键，不另建形状）。
         * @returns {{ok:boolean, reason:string, name:(string|null), at:(number|null),
         *   meta:(object|null), overwritten:boolean, previousAt:(number|null),
         *   evicted:(string[]|null), count:(number|null)}}
         */
        saveCheckpoint(name, opts) {
            const o = opts || {};
            const CP = this._checkpointLib();
            const store = this.checkpointStore();
            const bad = (reason) => ({ ok: false, reason: reason, name: null, at: null, meta: null, overwritten: false, previousAt: null, evicted: null, count: null });
            if (!CP || typeof CP.saveCheckpoint !== 'function') return bad('模块未加载');
            if (!store) return bad('宿主无可用存储');
            const cid = o.chatId || this.getCurrentChatId();
            let payload = o.payload;
            if (!payload) {
                try { payload = this.collectExport(); }
                catch (e) { errLog(e, 'saveCheckpoint.collectExport'); return bad('载荷生成失败：' + String(e && e.message || e)); }
            }
            /* [v3.239.0] 同族修：`o.floor` 显式 null / 空串算「没给」，回落当前楼层；
             *   而 `_currentFloor` 初始化是 **-1**（「还没进任何楼层」），它不是合法楼层，
             *   故此处只接受 **>= 0** 的读数 —— 否则面板会把「第 -1 楼」念给用户。 */
            const _fo = (typeof this._floorOrNull === 'function') ? this._floorOrNull(o.floor) : o.floor;
            const _cf = (typeof this._floorOrNull === 'function') ? this._floorOrNull(this._currentFloor) : this._currentFloor;
            const floor = (_fo !== null && _fo !== undefined) ? _fo
                : ((typeof _cf === 'number' && _cf >= 0) ? _cf : null);
            const r = CP.saveCheckpoint(store, { chatId: cid, name: name, payload: payload, at: o.at, floor: floor, note: o.note });
            return {
                ok: r.ok, reason: CP.describe ? CP.describe(r.reason) : r.reason, name: r.name, at: r.at, meta: r.meta,
                overwritten: r.overwritten, previousAt: r.previousAt, evicted: r.evicted, count: r.count
            };
        }
        /** [v3.237.0] R4-C：列本会话检查点（只读）。`items === null` 与 `[]` 语义不同（见模块头）。 */
        listCheckpoints(chatId) {
            const CP = this._checkpointLib();
            const store = this.checkpointStore();
            if (!CP || typeof CP.listCheckpoints !== 'function') return { ok: false, reason: '模块未加载', items: null };
            const r = CP.listCheckpoints(store, chatId || this.getCurrentChatId());
            return { ok: r.ok, reason: CP.describe ? CP.describe(r.reason) : r.reason, items: r.items };
        }
        /** [v3.237.0] R4-C：读一份检查点（只读）。 */
        readCheckpoint(name, chatId) {
            const CP = this._checkpointLib();
            const store = this.checkpointStore();
            if (!CP || typeof CP.readCheckpoint !== 'function') return { ok: false, reason: '模块未加载', record: null };
            const r = CP.readCheckpoint(store, chatId || this.getCurrentChatId(), name);
            return { ok: r.ok, reason: CP.describe ? CP.describe(r.reason) : r.reason, record: r.record };
        }
        /** [v3.237.0] R4-C：删一份检查点（幂等；只删本插件命名空间下的键）。 */
        dropCheckpoint(name, chatId) {
            const CP = this._checkpointLib();
            const store = this.checkpointStore();
            if (!CP || typeof CP.dropCheckpoint !== 'function') return { ok: false, reason: '模块未加载', existed: false };
            const r = CP.dropCheckpoint(store, chatId || this.getCurrentChatId(), name);
            return { ok: r.ok, reason: CP.describe ? CP.describe(r.reason) : r.reason, existed: r.existed };
        }
        /**
         * [v3.237.0] R4-C：**恢复预览**（只读）—— 检查点相对当前运行时会带来什么差异。
         *   刻意只出计划：真落地仍走 `restoreFromPayload`（单真源，不为检查点开第二条导入路径）。
         */
        previewCheckpointRestore(name, chatId) {
            const CP = this._checkpointLib();
            const store = this.checkpointStore();
            if (!CP || typeof CP.previewRestore !== 'function') return { ok: false, reason: '模块未加载', diff: null, plan: null };
            let cur = null;
            try { cur = this.collectExport(); } catch (e) { errLog(e, 'previewCheckpointRestore.collectExport'); }
            const r = CP.previewRestore(store, chatId || this.getCurrentChatId(), name, cur);
            return { ok: r.ok, reason: CP.describe ? CP.describe(r.reason) : r.reason, diff: r.diff, plan: r.plan };
        }
        /** [v3.237.0] R4-C：**分支只读对照**（两份检查点并排比，零写、不切分支、不合并）。 */
        compareBranchCheckpoints(nameA, nameB, chatId) {
            const CP = this._checkpointLib();
            const store = this.checkpointStore();
            if (!CP || typeof CP.compareCheckpoints !== 'function') return { ok: false, reason: '模块未加载', diff: null, a: null, b: null };
            const r = CP.compareCheckpoints(store, chatId || this.getCurrentChatId(), nameA, nameB);
            return { ok: r.ok, reason: CP.describe ? CP.describe(r.reason) : r.reason, diff: r.diff, a: r.a, b: r.b };
        }
        /**
         * [v3.238.0] R4-D：检查点菜单行的**行构造**（纯函数：无 DOM、无副作用）。
         *
         * 为什么要有这一族：R4-C 把检查点做出来了，但**产品面零消费** —— 引擎里这一族
         *   8 个方法在 `settings-ui.js` 里的命中数是 **0**（唯一命中落在测试与本文件自己的
         *   注释里）。这正是本仓反复点名的「建好不消费 / 功能级失效」，也正是 CHANGELOG
         *   v3.237.0 主题自陈的那句「登记出来的一份，用户拿不到手里」。
         *
         * 为什么行构造住引擎侧：与 `snapshotRestoreMenu` 同一形状（R4-B 已确立的纪律：
         *   行长什么样是引擎的知识、面板只负责把它塞进 popup）。面板自己拼 HTML 就是
         *   第二处「检查点长什么样」的知识，下一次改行就得同时记住两处。
         *
         * 三态必须不同形（沿用模块头的老账 ①）：
         *   · `items === null`（存储没给 / 形态不合 / 读不到）⇒ 返回 `null` ——
         *     面板必须说「读不到」，**不得**渲染成「还没有检查点」；
         *   · `items === []` ⇒ 返回空串（真的是空的）；
         *   · 有记录 ⇒ 每行带 `data-name`，供面板按名取预览与对照。
         * @returns {string|null} 菜单行 HTML；`null` 表示清单读不到（不是「空」）
         */
        checkpointMenuItems() {
            const r = this.listCheckpoints();
            if (!r || r.items === null || r.items === undefined) return null;
            return r.items.map((it) => {
                const esc = (t) => String(t === undefined || t === null ? '' : t)
                    /* [v3.239.0] 全改 split/join：含引号的正则字面量会让 v3169 的 classSpan
                     *   （无正则态的词法扫描）失衡；实体一律经 String.fromCharCode 拼出。
                     *   修前实测：双引号那一支被写成恒等替换（属性转义等于没做）。
                     *   顺序纪律：AMP 必须最先，否则会把已生成的实体再转一次。 */
                    .split(String.fromCharCode(38)).join(String.fromCharCode(38) + 'amp;')
                    .split(String.fromCharCode(60)).join(String.fromCharCode(38) + 'lt;')
                    .split(String.fromCharCode(62)).join(String.fromCharCode(38) + 'gt;')
                    .split(String.fromCharCode(34)).join(String.fromCharCode(38) + 'quot;');
                const when = this._numOrNull(it.at) !== null ? new Date(this._numOrNull(it.at)).toLocaleString() : '时间未知';
                const floorTxt = this._numOrNull(it.floor) !== null ? ('第 ' + this._numOrNull(it.floor) + ' 楼') : '楼层未记';
                const meta = (it.meta && this._numOrNull(it.meta.keyCount) !== null) ? (this._numOrNull(it.meta.keyCount) + ' 面') : '面数未知';
                return '<div class="lsm-item" data-name="' + esc(it.name) + '" style="display:flex;justify-content:space-between;gap:10px;">'
                    + '<span>' + esc(it.name) + '</span>'
                    + '<span style="color:var(--ls-text-2,#9da7b3);font-size:12px;">' + esc(floorTxt + ' · ' + meta + ' · ' + when) + '</span>'
                    + '</div>';
            }).join('');
        }
        /**
         * [v3.238.0] R4-D：**恢复预览**的多行文案（纯函数，只读）。
         *
         * 只出计划、**不执行恢复**（真落地仍走 `restoreFromPayload` 单真源）。
         * 两侧差异的措辞是刻意对称的：`onlyInA` 是「当前有、检查点没有 ⇒ 恢复后会消失」，
         * `onlyInB` 是「检查点有、当前没有 ⇒ 恢复后会回来」—— 两者都被点名，
         * 不靠「差异 N 项」这种计数让用户自己猜方向。
         * @returns {string|null} 多行文本；读不到即 `null`（调用方必须说出来，不得渲染成空字符串）
         */
        checkpointRestorePreviewLines(name, chatId) {
            const r = this.previewCheckpointRestore(name, chatId);
            if (!r || r.ok !== true || !r.plan) return null;
            const d = r.diff || {};
            const p = r.plan;
            const list = (arr) => (Array.isArray(arr) && arr.length) ? arr.join('、') : '（无）';
            return [
                '恢复到：' + String(p.name) + '（' + (this._numOrNull(p.floor) !== null ? ('第 ' + this._numOrNull(p.floor) + ' 楼') : '楼层未记') + '）',
                '将恢复 ' + (this._numOrNull(p.willRestoreCount) !== null ? this._numOrNull(p.willRestoreCount) : '?') + ' 个字段',
                '恢复后会消失的字段：' + list(d.onlyInA),
                '恢复后会回来的字段：' + list(d.onlyInB),
                '存档代际：' + (p.schemaCross === 'same' ? '同代' : ('跨代 ' + String(p.fromSchema) + ' → ' + String(p.toSchema)))
            ].join('\n');
        }
        /**
         * [v3.252.0] F7 首阶段：**内容级只读对照**（读侧唯一出口）。
         *
         * 与 `compareBranchCheckpoints` 的分工（计划二 F7 原文点名的缺口）：
         *   若只给「键面 + 规模 + 代际」，用户看到的是「两边的键一样、字节差不多」，
         *   而计划点名的反例「同键同长度但值不同」（余额 100→900、朋友→仇人）**零读数**。
         *   本方法在既有键面读数**之上**叠一层有界的逐条内容差异，键面口径逐字不动。
         *
         * 为什么**并列新出口**而不改 `diffPayloads`：那是「键面 + 规模 + 代际」的既有契约，
         *   由 `v3237` F 组与 `v3239` B3/B4 逐条钉着（含「代际未给不得压成 0」）；
         *   就地扩成深比较会**静默改掉那两张判据的含义**（同一处改动静默改掉既有断言）。
         *
         * 三态不同形（本仓老账）：
         *   · 任一侧缺失 ⇒ `ok:false` 且 `deep:null`（**不拿空载荷冒充「那边是空的」**）；
         *   · 载荷损坏 ⇒ `reason` 如实报 `corrupt`（与「没有这份」不同形）；
         *   · 模块过旧（无 `diffPayloadsDeep`）⇒ `reason` 报 `deep-unavailable`，
         *     且**仍给出键面读数** —— 「深比较这版没有」不得把已经能给的键面读数一起吞掉；
         *   · 深比较内部出错 ⇒ 向上仍报 `ok:true` 且 `deep.ok:false`（键面能用就说能用）。
         * 纯读：零写、零全局读写、绝不抛（与本族其余成员同规格）。
         * @returns {{ok:boolean, reason:string, face:object|null, deep:object|null}}
         */
        compareBranchCheckpointsDeep(nameA, nameB, chatId, opts) {
            const faceRes = this.compareBranchCheckpoints(nameA, nameB, chatId);
            if (!faceRes || faceRes.ok !== true) {
                return { ok: false, reason: (faceRes && faceRes.reason) || '未知', face: null, deep: null };
            }
            const CP = this._checkpointLib();
            if (!CP || typeof CP.diffPayloadsDeep !== 'function') {
                /* 键面读数照给：模块过旧是「这面没有」，不是「什么都没读到」。 */
                return { ok: false, reason: 'deep-unavailable', face: faceRes.diff, deep: null };
            }
            const store = this.checkpointStore();
            const cid = chatId || this.getCurrentChatId();
            /* 两侧载荷走与 compareCheckpoints 同一条读取口（不另开一条读法）。 */
            const ra = CP.readCheckpoint(store, cid, nameA);
            const rb = CP.readCheckpoint(store, cid, nameB);
            if (!ra || ra.ok !== true || !rb || rb.ok !== true) {
                return { ok: false, reason: 'corrupt', face: faceRes.diff, deep: null };
            }
            const pa = ra.record ? ra.record.payload : null;
            const pb = rb.record ? rb.record.payload : null;
            if (!pa || !pb || typeof pa !== 'object' || typeof pb !== 'object') {
                return { ok: false, reason: 'corrupt', face: faceRes.diff, deep: null };
            }
            let deep = null;
            try { deep = CP.diffPayloadsDeep(pa, pb, opts); }
            catch (e) { errLog(e, 'compareBranchCheckpointsDeep'); deep = null; }
            if (!deep) return { ok: false, reason: 'internal', face: faceRes.diff, deep: null };
            return { ok: true, reason: 'ok', face: faceRes.diff, deep: deep };
        }
        /**
         * [v3.252.0] F7 首阶段：**内容级对照**的多行文案（纯函数，只读、零写）。
         *
         * 为什么文案口住引擎侧：与 `checkpointBranchesDiffLines` 同规格 ——
         *   行长什么样是引擎的知识，面板只负责塞进 popup。
         * 三态不同形（面板必须能分辨）：
         *   · 读不到（模块未加载 / 某一侧缺失 / 损坏）⇒ `null`；
         *   · 模块过旧（无深比较出口）⇒ **仍出一段键面文案**，并明说「本版无深比较」——
         *     不得与「两边内容完全一样」同形；
         *   · 有深比较 ⇒ 出「改动/未动/类型变化」并**点名路径**（折成计数等于把这件事还回用户）；
         *     截断 / 未下钻 / 循环引用各自单列（「没比」不得与「一样」同形）。
         * @returns {string|null}
         */
        checkpointContentDiffLines(nameA, nameB, chatId) {
            const r = this.compareBranchCheckpointsDeep(nameA, nameB, chatId);
            if (!r || (r.ok !== true && r.reason !== 'deep-unavailable') || !r.face) return null;
            const f = r.face;
            const list = (arr) => (Array.isArray(arr) && arr.length) ? arr.join('、') : '（无）';
            const out = [
                'A = ' + String(nameA) + ' ／ B = ' + String(nameB) + '（只对照，不改任何一份）',
                '键面：共同 ' + Number(f.sharedCount) + '；A 独有 ' + list(f.onlyInA) + '；B 独有 ' + list(f.onlyInB)
            ];
            if (r.reason === 'deep-unavailable') {
                out.push('内容级对照：**本版插件没有这个出口**（模块过旧）；上面只是键面读数，不等同于「内容一样」。');
                return out.join('\n');
            }
            const d = r.deep;
            if (!d || d.ok !== true) {
                out.push('内容级对照：**比不成**（' + String((d && d.reason) || '未知') + '）—— 这不是「没有差异」。');
                return out.join('\n');
            }
            const changed = Array.isArray(d.changes) ? d.changes : [];
            out.push('内容级：改动 ' + changed.length + ' 处；同键且值相同 ' + ((d.sameValueKeys || []).length) + ' 个');
            for (const c of changed.slice(0, 20)) {
                const from = c.from || {}; const to = c.to || {};
                const tag = (c.kind === 'type-changed') ? ('（类型变了：' + String(from.kind) + ' → ' + String(to.kind) + '）') : '';
                out.push('  · ' + String(c.path) + tag + '：' + String(from.text) + ' → ' + String(to.text));
            }
            if (changed.length > 20) out.push('  （只列前 20 处，另有 ' + (changed.length - 20) + ' 处未列出）');
            if (d.changesTruncated) out.push('⚠ 差异已达记录上限（' + Number((d.limits || {}).maxChanges) + ' 条）**截断**；后面还有差异没记，这不是「没有更多差异」。');
            for (const s of (Array.isArray(d.sets) ? d.sets : [])) {
                if (!Array.isArray(s.addedIds) || !Array.isArray(s.removedIds)) continue;
                if (!s.addedIds.length && !s.removedIds.length && !(s.modifiedIds || []).length) continue;
                let how;
                if (s.byId === true) how = '按 id ' + String(s.idKey) + ' 对齐';
                else if (s.byId === 'duplicate') how = '元素 id 有重复，未按 id 对齐';
                else how = '元素无可识别 id，按索引对齐';
                out.push('集合 ' + String(s.path) + '（' + how + '）：新增 ' + s.addedIds.length + ' / 删除 ' + s.removedIds.length + ' / 改动 ' + (s.modifiedIds || []).length);
                if (s.addedIds.length) out.push('  新增：' + list(s.addedIds.slice(0, 10)));
                if (s.removedIds.length) out.push('  删除：' + list(s.removedIds.slice(0, 10)));
                if ((s.modifiedIds || []).length) out.push('  改动：' + list(s.modifiedIds.slice(0, 10)));
            }
            if (Array.isArray(d.capped) && d.capped.length) out.push('未下钻（达深度/宽度上限，**没比**，不等于一样）：' + list(d.capped));
            if (Array.isArray(d.cycles) && d.cycles.length) out.push('循环引用（不下钻）：' + list(d.cycles));
            return out.join('\n');
        }
        /**
         * [v3.238.0] R4-D：**单份检查点详情**的多行文案（纯函数，只读）。
         *
         * 与「恢复预览」的分工：预览回答「相对**现在**会差什么」，详情回答「这一份**本身**是什么」
         *   （名字 / 时间 / 楼层 / 备注 / 面数 / 字节 / 存档代际）。两者都在产品面有入口。
         * 读不到即 `null`（记录不存在 / 载荷损坏 / 存储读不到三者由 `reason` 区分，面板如实播报）。
         * @returns {string|null}
         */
        checkpointDetailLines(name, chatId) {
            const r = this.readCheckpoint(name, chatId);
            if (!r || r.ok !== true || !r.record) return null;
            const rec = r.record;
            const mt = rec.meta || {};
            const at = this._numOrNull(rec.at) !== null ? new Date(this._numOrNull(rec.at)).toLocaleString() : '时间未记';
            const floor = this._numOrNull(rec.floor) !== null ? ('第 ' + this._numOrNull(rec.floor) + ' 楼') : '楼层未记';
            const faces = this._numOrNull(mt.keyCount) !== null ? (this._numOrNull(mt.keyCount) + ' 面') : '面数未知';
            const bytes = this._numOrNull(mt.bytes) !== null ? (this._numOrNull(mt.bytes) + ' 字节') : '字节未知';
            const gen = (mt.producerVersion || mt.version) ? String(mt.producerVersion || mt.version) : '代际未记';
            const schema = this._numOrNull(mt.schemaVersion) !== null ? String(this._numOrNull(mt.schemaVersion)) : '未记';
            return [
                '「' + String(rec.name) + '」',
                '存于 ' + at + ' · ' + floor,
                '规模 ' + faces + ' · ' + bytes + ' · 存档代际 ' + gen + '（schema ' + schema + '）',
                (rec.note ? ('备注：' + String(rec.note)) : '备注：（无）')
            ].join('\n');
        }
        /**
         * [v3.238.0] R4-D：**分支只读对照**的多行文案（纯函数，只读、零写、不切分支、不合并）。
         *
         * 两侧独有字段都**逐个列名**（不截断、不折叠成计数）：对照的用途就是看名字，
         * 折成数字等于把这件事还回给用户。
         * 任一侧缺失时 `compareBranchCheckpoints` 报 `a-missing` / `b-missing`，
         * 这里如实返回 `null` —— **不拿空载荷冒充「那边是空的」**。
         * @returns {string|null}
         */
        checkpointBranchesDiffLines(nameA, nameB, chatId) {
            const r = this.compareBranchCheckpoints(nameA, nameB, chatId);
            if (!r || r.ok !== true || !r.diff) return null;
            const d = r.diff;
            const list = (arr) => (Array.isArray(arr) && arr.length) ? arr.join('、') : '（无）';
            /* [v3.239.0] 差值走 _numOrNull：缺失即 '?'，不打印 NaN（本仓「不拿空冒充」的反面）。 */
            return [
                'A = ' + String(nameA) + ' ／ B = ' + String(nameB) + '（只对照，不改任何一份）',
                '共同字段 ' + Number(d.sharedCount) + ' 个；A 独有 ' + ((d.onlyInA || []).length) + ' 个；B 独有 ' + ((d.onlyInB || []).length) + ' 个',
                'A 独有：' + list(d.onlyInA),
                'B 独有：' + list(d.onlyInB),
                '字节：A ' + (this._numOrNull(d.bytesA) === null ? '?' : String(this._numOrNull(d.bytesA)))
                    + ' ／ B ' + (this._numOrNull(d.bytesB) === null ? '?' : String(this._numOrNull(d.bytesB)))
                    + '（差 ' + (this._numOrNull(d.bytesDelta) === null ? '?'
                        : ((d.bytesDelta >= 0 ? '+' : '') + String(d.bytesDelta))) + '）',
                '存档代际：' + (d.sameSchema ? '同代' : ('跨代 ' + String(d.schemaA) + ' → ' + String(d.schemaB)))
            ].join('\n');
        }
        // [v3.131] CP: 保存来源登记——所有 storage.save 调用点经此登记地面真源（来源计数随存档持久化，诊断面板展示"谁在保存"）
        //
        // [v3.166] 语义修正：登记的时机会决定它登记的是什么。
        //   六个调用点里五个写成 `recordSaveSource('X'); await storage.save(...)` ——
        //   登记在 save **之前**。而 storage.save 有两条不落盘路径（修订/指纹防护拒绝、
        //   真实写入失败），两条都只是 return false 而不抛错。于是这份「谁在保存」
        //   会把一次根本没发生的保存记进去，还会随存档持久化到其它设备。
        //   现在 sources 只由**结果**驱动；separate 出 attempts / denied 两个计数器，
        //   让「谁在尝试、谁在丢」分别可见，拒绝可归因到具体来源。
        recordSaveSource(source, floor = -1) {
            try {
                const prev = this._lastSaveGroundTruth || { ts: 0, floor: -1, sources: {}, attempts: {}, denied: {}, lastDenied: null };
                const f = Number.isFinite(Number(floor)) ? Number(floor) : prev.floor;
                const attempts = { ...(prev.attempts || {}) };
                attempts[source] = (attempts[source] || 0) + 1;
                // sources 保持 v3.131 的既有字段名（下游测试与诊断面板读它），
                //   但语义收紧为「确认落地过的保存」——由 recordSaveFailed 推进。
                this._lastSaveGroundTruth = {
                    ts: Date.now(), floor: f,
                    sources: { ...(prev.sources || {}) },
                    attempts,
                    denied: { ...(prev.denied || {}) },
                    lastDenied: prev.lastDenied || null,
                };
            } catch (e) { errLog(e, 'recordSaveSource'); }
        }
        /**
         * [v3.166] 按 storage.save 的**结果**记账。
         * @param {string} source 保存来源标识
         * @param {boolean} ok storage.save 的返回值（true=真实落盘证据已成立）
         * @param {string} [reason] 失败原因（ok=false 时用于归因）
         */
        recordSaveFailed(source, ok, reason = '') {
            try {
                const prev = this._lastSaveGroundTruth || { ts: 0, floor: -1, sources: {}, attempts: {}, denied: {}, lastDenied: null };
                if (ok) {
                    const sources = { ...(prev.sources || {}) };
                    sources[source] = (sources[source] || 0) + 1;
                    this._lastSaveGroundTruth = {
                        ts: Date.now(), floor: prev.floor,
                        sources, attempts: { ...(prev.attempts || {}) },
                        denied: { ...(prev.denied || {}) }, lastDenied: prev.lastDenied || null,
                    };
                    return true;
                }
                const denied = { ...(prev.denied || {}) };
                denied[source] = (denied[source] || 0) + 1;
                this._lastSaveGroundTruth = {
                    ts: prev.ts, floor: prev.floor,
                    sources: { ...(prev.sources || {}) }, attempts: { ...(prev.attempts || {}) },
                    denied,
                    lastDenied: { source: String(source), reason: String(reason || '未落盘'), at: Date.now() },
                };
                return false;
            } catch (e) { errLog(e, 'recordSaveFailed'); return false; }
        }
        /**
         * [v3.166] 保存地面真源报告：把「想保存」与「真保存」并列，
         *   回答「哪个来源在尝试、哪个来源在丢、最后一次丢是谁丢的」。
         */
        getSaveSourceReport() {
            const g = this._lastSaveGroundTruth || { ts: 0, floor: -1, sources: {}, attempts: {}, denied: {}, lastDenied: null };
            const sources = g.sources || {}, attempts = g.attempts || {}, denied = g.denied || {};
            const names = new Set([...Object.keys(sources), ...Object.keys(attempts), ...Object.keys(denied)]);
            const rows = [];
            for (const n of [...names].sort()) {
                rows.push({ source: n, attempted: attempts[n] || 0, persisted: sources[n] || 0, denied: denied[n] || 0 });
            }
            return { lastFloor: g.floor, lastAt: g.ts, lastDenied: g.lastDenied || null, rows };
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
        requestRepair(input) {
            try {
                const RL = _repairLoopLib();
                if (!RL || typeof RL.request !== 'function') return { ok: false, reason: 'module-unavailable' };
                const st = this._repairState ? RL.normalize(this._repairState) : { version: 1, seq: 0, repairs: [] };
                // 派生件池收在 _repairPool()（单一真源；本方法此前内联一份，previewRepair 一加就会分叉）
                const r = RL.request(st, Object.assign({}, input, { pool: this._repairPool() }));
                if (!r.ok) return { ok: false, reason: r.reason };
                this._repairState = r.state;
                this._lastRepair = { at: Date.now(), action: r.repair.action, total: r.total, id: r.repair.id };
                if (r.total && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 修复请求 ${r.repair.id}（${r.repair.action}）：受影响派生件 ${r.total} 项待落定`);
                // [v3.214.0] R1-F：`replayed`/`changed` **必须透出**。幂等重放与真登记在下游
                //   看起来一模一样（都是 ok:true + 同一条 id、同一个 total），吞掉这两个字段
                //   等于把「这次什么都没写」伪装成「这次写了」——桥的 apply 回执直接取用它们。
                return { ok: true, repair: r.repair, affected: r.affected, total: r.total,
                    replayed: !!r.replayed, changed: r.changed !== false };
            } catch (e) { errLog(e, 'engine.requestRepair'); return { ok: false, reason: 'thrown' }; }
        }
        /** [v3.194] 落定一条派生件的修复（宿主逐项回报 done/failed/missing）。不抛。 */
        settleRepair(input) {
            try {
                const RL = _repairLoopLib();
                if (!RL || typeof RL.settle !== 'function') return { ok: false, reason: 'module-unavailable' };
                const st = this._repairState ? RL.normalize(this._repairState) : { version: 1, seq: 0, repairs: [] };
                const r = RL.settle(st, input);
                if (!r.ok) return { ok: false, reason: r.reason };
                this._repairState = r.state;
                return { ok: true, repair: r.repair, item: r.item, pending: r.pending, failed: r.failed, settled: r.settled };
            } catch (e) { errLog(e, 'engine.settleRepair'); return { ok: false, reason: 'thrown' }; }
        }
        /**
         * [v3.214.0] R1-F：**放弃一次修复**（用户改主意）。
         *   与 requestRepair/settleRepair 同规格：模块缺席如实回 'module-unavailable'（不抛、
         *   不伪装成「没有这条修复」）；`replayed` 照实透出（已放弃的再放弃是重放，不是新动作）。
         */
        abandonRepair(input) {
            try {
                const RL = _repairLoopLib();
                if (!RL || typeof RL.abandon !== 'function') return { ok: false, reason: 'module-unavailable' };
                const st = this._repairState ? RL.normalize(this._repairState) : { version: 1, seq: 0, repairs: [] };
                const r = RL.abandon(st, input);
                if (!r.ok) return { ok: false, reason: r.reason };
                this._repairState = r.state;
                return { ok: true, repair: r.repair, replayed: !!r.replayed, changed: r.changed !== false };
            } catch (e) { errLog(e, 'engine.abandonRepair'); return { ok: false, reason: 'thrown' }; }
        }
        /**
         * [v3.214.0] R1-F：修复面的**修订读数**（`_mutationEpoch` 的唯一对读口）。
         *
         * 【为什么要有这一面】
         *   写方的 `expectRevision` 要拿变更栅栏号对表（回滚/恢复/切聊都会递增它），
         *   若让桥直接读 `engine._mutationEpoch`，一个**私有字段**就成了对外契约的一部分
         *   ——改名即悄悄失配，而失配的表现是「写入被拒」，没人会想到是改名。
         *   故在此收一个方法口：读不到就是 0，绝不抛。
         */
        repairRevision() {
            try { return Number(this._mutationEpoch) || 0; } catch (e) { return 0; }
        }
        /**
         * [v3.214.0] R1-F：**修复预览**（只算受影响派生件，不写台账）。
         *
         * 【为什么需要它 / 修前实测后果】
         *   修复链路此前只有 `requestRepair()`：它既算清单又写账，且**不幂等**——
         *   于是「先看看这次修复会牵连哪些派生件」只能靠真登记一次再放弃，
         *   而重试一次就多一条记录，`pending()` 里混进一批从未打算执行的修复。
         *   本方法复用与 requestRepair **同一批派生物池**（现收、不另存），
         *   只调纯函数 `RL.preview()`（签名里没有状态，写不进去），故预览与登记
         *   在 affected 上逐条一致——预览过 ⇒ 登记也会过同一个清单。
         *   不抛；模块缺席时如实回 reason='module-unavailable'（不得伪装成「没有受影响项」）。
         */
        previewRepair(input) {
            try {
                const RL = _repairLoopLib();
                if (!RL || typeof RL.preview !== 'function') return { ok: false, reason: 'module-unavailable', affected: [], total: 0 };
                const r = RL.preview(Object.assign({}, input, { pool: this._repairPool() }));
                if (!r.ok) return { ok: false, reason: r.reason, affected: [], total: 0 };
                return { ok: true, action: r.action, subject: r.subject, target: r.target, affected: r.affected, total: r.total, wrote: false };
            } catch (e) { errLog(e, 'engine.previewRepair'); return { ok: false, reason: 'thrown', affected: [], total: 0 }; }
        }
        /**
         * 派生件池（`requestRepair` 与 `previewRepair` 的**单一真源**）。
         * 从当前运行时现收，**不另存副本**（另存就是第二份真源）。
         * 六个池各自独立 try —— 任一池缺席不影响其余池参与判定。
         */
        _repairPool() {
            let summaries = [];
            try { summaries = (this.summary?.getActiveSummaries?.() || []).map(s => ({ key: 'sum_' + s.floor, text: s.text, floor: s.floor })); } catch (e) { /* 池可缺 */ }
            let events = [];
            try { events = (this._eventThreadState?.events || []).map(e => ({ key: e.id, title: e.title })); } catch (e) { /* 池可缺 */ }
            let relations = [];
            try { relations = [...(this.graph?.edges?.values?.() || [])].slice(0, 200).map(e => ({ key: e.from + '->' + e.to, text: e.label || '' })); } catch (e) { /* 池可缺 */ }
            let promises = [];
            try {
                const CL = (typeof window !== 'undefined' && window.LonShaCommitmentLedger) || null;
                promises = (CL?.list?.(this.worldProg?.commitmentLedger, {}) || []).map(c => ({ key: c.id, content: c.content }));
            } catch (e) { /* 池可缺 */ }
            const facts = ((this._factVersionState?.facts) || []).map(f => ({ key: f.id, text: f.subject + f.predicate + f.value }));
            let timeline = [];
            try { timeline = (this.timeline?.entries || []).slice(-100).map(t => ({ key: t.id || ('tl_' + t.floor), text: t.text })); } catch (e) { /* 池可缺 */ }
            return { summaries: summaries, events: events, relations: relations, promises: promises, facts: facts, timeline: timeline };
        }
        /**
         * [v3.214.0] R1-E：九账证据工作台读数（只读，不写任何账）。
         *
         * 【为什么需要这一面 / 修前实测后果】
         *   本仓九本账（伏笔/约定/平行事实/秘密/前文回扣/回声/事实版本/事件完整性/修复闭环）
         *   各自有 list/summarize/render，但快照 `buildBridgeSnapshot()` **一本账都不带**
         *   （`worldProg` 只带四本账的原始状态，三面账连状态都没进）。下游于是答不出
         *   「这个承诺是哪一楼说的」——出处（floor + 来源账 + 引用键）从未被汇成同一张表。
         *
         * 【九账 API 的取法：与其余模块同规格的「全局优先 + require 回落」】
         *   本方法是宿主侧接线，**不把 window 访问放进纯函数内核**
         *   （evidence-workbench.js 只吃 `opts.apis`，便于单测与移植）。
         *   渠道取法与 ledger-replay 的 FLOOR_OWNERS 同源：账本 API 经 _moduleLib 取，
         *   取不到即缺席（`module-unavailable`），**不静默当作空账**。
         *
         * 【三态处置（本面的核心纪律）】
         *   · 模块没挂   ⇒ absent + reason='module-unavailable'（等上游/宿主，不是「没有」）
         *   · 宿主没这本账 ⇒ absent + reason='state-missing'（这本账从没写过）
         *   · 账在位且空 ⇒ empty（**真读数**，不是错误）
         *   三者处置相反，压成一态就是错读数。
         */
        _evidenceWorkbench() {
            try {
                const W = _evidenceWorkbenchLib();
                if (!W || typeof W.buildWorkbench !== 'function') {
                    return {
                        version: 0, at: Date.now(), ledgers: {},
                        summary: { total: 0, counts: { ok: 0, empty: 0, absent: 0 }, items: 0 },
                        selfConsistent: false, reason: 'module-unavailable'
                    };
                }
                // apis 表：id → 账本模块（**取不到给 null 而不是省略键**：
                //   省略会让「模块没装」与「登记表写漏了」同形）。
                //   九键的取法收在 _ledgerApis()（单一真源，见该函数注释：内联版曾因
                //   六个不存在的 `_xxxLedgerLib()` 而永远抛错、被吞成 'thrown'）。
                const apis = _ledgerApis();
                return W.buildWorkbench(this, { apis: apis });
            } catch (e) {
                errLog(e, 'plugin._evidenceWorkbench');
                return {
                    version: 0, at: Date.now(), ledgers: {},
                    summary: { total: 0, counts: { ok: 0, empty: 0, absent: 0 }, items: 0 },
                    selfConsistent: false, reason: 'thrown'
                };
            }
        }
        /**
         * [v3.233.0] F-2：事件来源构成的**外供面**（结构化，只读，不抛）。
         *
         * 与 `_evidenceWorkbench()` 的关系：证据面把九账收成一张可查表（「这个承诺是哪一楼说的」），
         * 本方法只答其中**一件**事：事件线里的段**从哪来**（插件提取 / 手机侧 / 其它 / 未标）。
         * 为什么单独外供：构成要的是数字，不该让下游去切显示字符串。
         *
         * 三种「没有」必须可分（**不得**用 undefined 一把盖掉）：
         *   · 模块没挂 ⇒ ok:false + reason='module-unavailable'（等环境修，不是「没有事件」）
         *   · 抛错     ⇒ ok:false + reason='thrown'
         *   · 还没线   ⇒ ok:true  + reason='no-events'（真读数：这版有面，只是还没发生）
         * 返回面恒定（内核对空账也给全键），故下游按键断言即可、不必猜。
         */
        _eventPlatformsFace() {
            const empty = {
                ok: false, reason: 'module-unavailable', events: [], segments: 0,
                platforms: [], levels: { extract: 0, platform: 0, other: 0, none: 0 },
                unlabeled: 0, countedEvents: 0, truncated: false
            };
            try {
                const EC = _eventCompletenessLib();
                if (!EC || typeof EC.platformFace !== 'function') return empty;
                // 状态为 null（还没写过任何线）**也照样出面**：
                //   内核对空账返回 reason='no-events' —— 那是**真读数**，
                //   与「本版没这面」（字段 present=false）处置相反。
                return EC.platformFace(this._eventThreadState || null, {});
            } catch (e) {
                errLog(e, 'plugin._eventPlatformsFace');
                return Object.assign({}, empty, { reason: 'thrown' });
            }
        }
        /** [v3.214.0] R1-E：证据面内检索（纯转发到内核；取不到内核即给结构完整的空结果，不抛）。 */
        searchEvidence(query, opts) {
            try {
                const W = _evidenceWorkbenchLib();
                if (!W || typeof W.search !== 'function') {
                    return { query: String(query == null ? '' : query), hits: [], missLedgers: [], emptyLedgers: [], absentLedgers: [], scanned: 0, limit: 0, truncated: false, reason: 'module-unavailable' };
                }
                return W.search(this._evidenceWorkbench(), query, opts);
            } catch (e) { errLog(e, 'plugin.searchEvidence'); return { query: '', hits: [], missLedgers: [], emptyLedgers: [], absentLedgers: [], scanned: 0, limit: 0, truncated: false, reason: 'thrown' }; }
        }
        /** [v3.194] 当前未完成事项（事件线里缺结果/后续的）——计划点名「保留未完成事项」的读取面。不抛。 */
        outstandingThreads(filter) {
            try {
                const EC = _eventCompletenessLib();
                if (!EC || typeof EC.outstanding !== 'function' || !this._eventThreadState) return [];
                return EC.outstanding(this._eventThreadState, filter);
            } catch (e) { errLog(e, 'engine.outstandingThreads'); return []; }
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
                const buckets = MT.typedBuckets(this._factVersionState);
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
    // [v3.208.0] 投影管线（projection-pipeline.js）。为什么需要：
    //   v3.176 的本地投影只有两次手工调用（人物位置 / 事实键），加一个投影就要再改一遍宿主
    //   函数体，且「加没加」无从判定；更糟的是缺席不可归因（收集失败与「源里本就没有」同形，
    //   都返回 {}，下游对读于是把「查不出来」当成「两边一致」）。
    //   现改为声明式登记表 + 三态读数（ok/empty/absent）+ 缺席原因。
    function _projectionLib() {
        return _moduleLib(() => window.LonShaProjectionPipeline, 'projection-pipeline.js');
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
    // [v3.194] 事件完整性（event-completeness.js）。与 event-chain.js **不是同一件事**：
    //   后者管 agent run 生命周期（run_started→run_completed），前者管**剧情事件**的
    //   起因—行动—结果—后续。缺结果或后续即「未完成事项」，必须能被单独列出来。
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
            this.loadModules();
            /* [v3.277.0 O7] 模块装载之后立刻重绑依赖：extra_js 已挂上，此时注入才真正生效。
             *   放在 loadModules 之后、registerEvents 之前 —— 事件接线与后续构造会用到
             *   被注入后的模块符号，顺序不能颠倒。失败只留痕、不阻断 init（注入是增强不是前置）。 */
            try { this.engine.rebindModuleDeps(); } catch (e) { errLog(e, 'O7.init.rebindModuleDeps'); }
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
            const fab = document.createElement('div');
            fab.id = 'lonsha-memory-fab'; fab.innerHTML = '🧠';
            fab.style.cssText = 'position:fixed;bottom:80px;right:20px;width:52px;height:52px;background:var(--ls-bg-2,#161b22);backdrop-filter:var(--ls-blur,none);-webkit-backdrop-filter:var(--ls-blur,none);color:var(--ls-accent,#58a6ff);border:1px solid var(--ls-line-strong,rgba(240,246,252,0.18));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;cursor:pointer;box-shadow:var(--ls-sh-2,0 8px 24px rgba(1,4,9,0.6));z-index:10000;transition:transform 0.2s,box-shadow 0.2s,border-color 0.2s;';
            fab.addEventListener('click', () => this.showPanel());
            fab.addEventListener('mouseenter', () => fab.style.transform = 'scale(1.1) rotate(5deg)');
            fab.addEventListener('mouseleave', () => fab.style.transform = 'scale(1)');
            document.body.appendChild(fab);
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
        return {
            ok: !!e.ok,
            reason: e.reason || '',
            repairId: e.repairId != null ? e.repairId : null,
            action: e.action || '',
            affected: Array.isArray(e.affected) ? e.affected : [],
            total: Number.isFinite(e.total) ? e.total : 0,
            revision: Number.isFinite(e.revision) ? e.revision : 0,
            replayed: !!e.replayed,
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
         *   回执 9 键恒定：{ok, reason, repairId, action, affected, total, revision, replayed, at}。
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