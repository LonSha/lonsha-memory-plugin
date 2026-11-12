/* ============================================================
 * tests/audit/_realhost_judge.mjs —— L12-O5 真宿主三块读数的**判定体**（纯函数）
 * ------------------------------------------------------------
 * 【为什么把判定从探针里拆出来】
 *   `_realhost_suite.mjs` 是**探针**：它需要真 Chromium + 真 SillyTavern 才能跑，
 *   而本仓纪律是「真宿主读数不进 npm test」。如果判定逻辑长在探针体内，那么
 *   「判据到底判得对不对」就**只能靠真宿主验证** —— 环境一缺，判据变成不可证伪的死文本。
 *   本仓治过这一类：不是判据，是「写在代码里的能力」。
 *   拆成纯函数后，判据可以在**合成读数**上离线证伪，也可以在**真源码破坏副本**上
 *   证明它真的承重（`v3428_l12_o5_realhost_suite.test.mjs` 的 N 段）。
 *
 * 【三块读数各自的口径（全部来自计划原文的验收条件）】
 *   ① load 装载面：`LonSha*` 全局数 ≥ MIN_GLOBALS、`_extraJsLoad.status === 'ok'`、
 *      面板入口在位。它回答「插件在真宿主里到底装起来没有」—— v3.300.0 之前
 *      宿主根本不加载 `extra_js`，这类失效只有真宿主能看见。
 *   ② write 写盘闭环：同会话真落盘 / await 期间切聊 ⇒ 必须 `false` + `deferred` +
 *      不推进 `_confirmed` + 当前会话不留一个字节 / 任何落盘那一刻
 *      「格子里的 chatId」必须等于「当前会话」。
 *      ★ 错档判据刻意不依赖返回值：返回 true/false 是**声明**，
 *        `slotChatId !== curChatId` 是**字节级事实**。
 *   ③ worldline 世界线纪元：α 1–39 → β 40–46 → 回跳 α 47–87，在第 60 楼看：
 *      第一纪元条目 `blocked`、本纪元 `kept`、中间纪元 `blocked`、
 *      既无楼层也无线标 `undecided`；且 `worldlineStartFloor` **留空**时
 *      宿主必须自动推进（`epochAdvance.applied === true`）。
 *
 * 【纪律】
 *   · 纯函数：不读盘、不读环境、不改入参、不抛（缺字段按「读数不成立」记缺陷，不崩）。
 *   · 每条缺陷都带**可读归因**：说清「哪一格、期望什么、实测什么」。
 *   · 缺读数 ≠ 通过：字段缺席一律记缺陷（`undefined` 与 `false` 都是「没读到」）。
 * ============================================================ */

/** 真宿主装载面下限（计划原文：`moduleGlobalCount ≥ 85`）。 */
export const MIN_GLOBALS = 85;

const isObj = (v) => !!v && typeof v === 'object';
const show = (v) => {
    try { return JSON.stringify(v); } catch (_e) { return String(v); }
};

/**
 * 块 ① 装载面。
 * @param {object} load 读数字段见 `_realhost_suite.mjs` 的 `note('load', …)`
 * @returns {string[]} 缺陷列表（空 = 成立）
 */
export function judgeLoad(load) {
    const bad = [];
    const L = isObj(load) ? load : {};
    if (typeof L.globals !== 'number') {
        bad.push('装载面读数缺 globals（真宿主里一个 LonSha* 全局都没数出来）；实 ' + show(L.globals));
    } else if (!(L.globals >= MIN_GLOBALS)) {
        bad.push('LonSha* 全局数 ' + L.globals + ' < ' + MIN_GLOBALS + ' —— 插件模块没挂齐（真宿主装载面塌陷）');
    }
    if (L.status !== 'ok') {
        bad.push('_extraJsLoad.status = ' + show(L.status) + '（期望 ok）；失败项 ' + show(L.fails || []));
    }
    if (L.hasUI !== true) {
        bad.push('真页面里 showSettingsPanel 不可用 —— 面板入口没挂上');
    }
    return bad;
}

/**
 * 块 ② 写盘闭环。
 * @param {object} write
 * @returns {string[]}
 */
export function judgeWrite(write) {
    const bad = [];
    const W = isObj(write) ? write : {};
    const same = isObj(W.same) ? W.same : {};
    const swap = isObj(W.swap) ? W.swap : {};
    const drain = isObj(W.drain) ? W.drain : {};

    if (same.ret !== true) bad.push('同会话主流路径必须回 true（实 ' + show(same.ret) + '）');
    if (same.markInCurrentAfter !== true) bad.push('同会话正常落盘必须真的写进当前会话（markInCurrentAfter 实 ' + show(same.markInCurrentAfter) + '）');

    if (swap.ret !== false) bad.push('await 期间切聊 ⇒ 本批不得回 true（实 ' + show(swap.ret) + '）');
    if (swap.markInCurrentAfter !== false) bad.push('await 期间切聊 ⇒ 当前会话里不得留下本批数据（一个字节都没落地）');
    if (swap.confirmed !== null) bad.push('await 期间切聊 ⇒ 不得推进 _confirmed（实 ' + show(swap.confirmed) + '）');
    if (swap.entryStatus !== 'deferred') bad.push('await 期间切聊 ⇒ 批次归宿必须如实记 deferred（实 ' + show(swap.entryStatus) + '）');

    /* 错档的直接形状：任何一次落盘那一刻，格子里的 chatId 必须等于当时的当前会话。 */
    const calls = Array.isArray(drain.calls) ? drain.calls : [];
    if (calls.length === 0) {
        bad.push('排队批读数缺 drain.calls —— 一次落盘点都没观测到（探针没接上观测点，读数不可信）');
    } else {
        const misrouted = calls.filter((c) => isObj(c)
            && c.slotChatId !== null && c.curChatId !== null
            && String(c.slotChatId) !== String(c.curChatId));
        if (misrouted.length) {
            bad.push('出现「写进别的会话」的落盘：' + show(misrouted));
        }
    }
    return bad;
}

/**
 * 块 ③ 世界线纪元。
 * @param {object} wl
 * @returns {string[]}
 */
export function judgeWorldline(wl) {
    const bad = [];
    const D = isObj(wl) ? wl : {};
    const buckets = isObj(D.buckets) ? D.buckets : {};
    /* 四格期望：每格都写清「为什么必须是它」—— 归因面与判据面同源。 */
    const want = [
        ['era1', 'blocked', '第一纪元记忆在第 60 楼必须被挡（同号跨纪元不串）'],
        ['now', 'kept', '本纪元记忆必须放行（修法不得误伤同纪元）'],
        ['beta', 'blocked', '中间纪元记忆必须被挡'],
        ['nolocate', 'undecided', '既无楼层也无线标的条目必须判不了，不许冒充本纪元'],
    ];
    for (const [key, bucket, why] of want) {
        const got = buckets[key];
        if (!isObj(got)) { bad.push(key + ' 没出现在任何桶里 —— ' + why); continue; }
        if (got.bucket !== bucket) {
            bad.push(key + ' 落在 ' + show(got.bucket) + '（期望 ' + bucket + '）—— ' + why
                + '；理由码 ' + show(got.why));
        }
    }
    const adv = isObj(D.epochAdvance) ? D.epochAdvance : {};
    if (adv.applied !== true) {
        bad.push('未填 worldlineStartFloor 时宿主必须自动推进纪元（epochAdvance.applied 实 '
            + show(adv.applied) + '，why=' + show(adv.why) + '）');
    }
    if (adv.conflict) {
        bad.push('层标记与跳跃表冲突：' + show(adv.conflict));
    }
    return bad;
}

/* ════════════════════════════════════════════════════════════
 * L21-O3 · 「跑不了」的四态成因码（唯一真源）
 * ------------------------------------------------------------
 * 【为什么必须拆（本项立项依据）】
 *   修前 `realhost_readings.json` 只有一句 `environment-unavailable`，
 *   **且没有任何门在读它** —— 三个真机套件 bail 掉之后，装载面就没人管了。
 *   而「跑不了」其实是四种不同的事，处置完全相反：
 *     · `no-st-endpoint`      端口不通       ⇒ 有人起 SillyTavern 就好了
 *     · `endpoint-timeout`    请求挂住       ⇒ 查负载/端口占用，可能需要调超时
 *     · `no-browser-driver`   Chromium 缺   ⇒ 装驱动 / 设 LONSHA_CHROME
 *     · `st-version-mismatch` 版本对不上     ⇒ 换 ST 版本或改插件兼容声明
 *   把四件事写成同一句话，等于把「装驱动」和「起服务」都记成「环境不可用」，
 *   下一个人只能从头再查一遍。
 *
 * 【实测推翻计划原文一处（如实记）】
 *   计划原文写「拆成四个成因码」。实勘 bail 点共 17 个，其中 6 个**不是环境问题**：
 *     部署目录版本不符 / 插件未装载 / init 未完成 / 块执行失败 / 读数落盘失败 / 仓库读不到。
 *   把这几档硬塞进四态，就是把「产品缺陷」和「探针自身失效」混进环境账 ——
 *   那正是本仓治过多次的「用一句话盖住两件事」。
 *   故成因码分**两组**：`env`（四态，处置=人动环境）与 `non-env`（处置=修产品/同步部署/修探针）。
 *   分组不是为了多写代码，是为了让读数能回答「下一步该谁动手」。
 * ════════════════════════════════════════════════════════════ */
/** 环境四态（计划点名的那四个，顺序即优先级）。 */
export const ENV_CAUSES = ['no-browser-driver', 'no-st-endpoint', 'endpoint-timeout', 'st-version-mismatch'];
/** 非环境成因（明列，不许悄悄混进上面四态）。 */
export const NONENV_CAUSES = ['deploy-unsynced', 'plugin-not-mounted', 'probe-self-fault'];
/** 全部合法成因码。 */
export const ALL_CAUSES = [...ENV_CAUSES, ...NONENV_CAUSES];
/** 成因码 → 「下一步谁动手」。读数必须能回答这个问题，否则还是同一句话。 */
export const CAUSE_ACTION = {
    'no-browser-driver': '装 Playwright Chromium，或设 LONSHA_CHROME 指向可用的 chrome',
    'no-st-endpoint': '起 SillyTavern（默认 http://127.0.0.1:8123/），或设 LONSHA_ST_URL',
    'endpoint-timeout': '查 ST 负载与端口占用；确认 URL 指向本机而非外网',
    'st-version-mismatch': '换 ST 到插件声明的兼容版本，或改插件的兼容声明（两者不可同时默认）',
    'deploy-unsynced': '把仓库文件同步到真宿主插件目录（两侧 manifest.version 必须逐字相同）',
    'plugin-not-mounted': '产品面缺陷：真页面里 window.LonShaMemory / LonShaMemoryOrgans 不在场，需查装载链路',
    'probe-self-fault': '探针或仓库结构自身失效（与产品无关）：先修探针，再看结论',
};
/**
 * 把一份「环境现场读数」判成一个成因码（纯函数，离线可证伪）。
 *
 * @param {object} env 现场读数，字段都是可缺的（缺 = 不知道，不是 false）：
 *   `binPresent`   Chromium 文件在不在
 *   `stStatus`     ST 根路径 HTTP 码（0 = 连不上）
 *   `stTimedOut`   fetch 是否超时（超时与拒绝是两件事：前者查负载，后者查服务）
 *   `stVersion`    真页面里 `SillyTavern.version`
 *   `stSupported`  插件声明支持的 ST 版本集合（空/缺 = 不判这条）
 *   `deploy`       部署态：`ok` / `missing` / `version-mismatch`
 *   `mounted`      真页面装配态：`ok` / `missing` / `init-incomplete`
 *   `probeOk`      探针自检（块执行 / 落盘是否成功）
 * @returns {{cause:string|null, group:'env'|'non-env'|null, action:string, why:string}}
 *   判不出来时 `cause = null`（**不许猜**：猜出来的成因码比没有更坏）。
 */
export function classifyCause(env) {
    const E = isObj(env) ? env : {};
    const out = (cause, why) => ({
        cause,
        group: cause === null ? null : (ENV_CAUSES.includes(cause) ? 'env' : 'non-env'),
        action: cause === null ? '现场读数不足，无法归因（需补读数，不许猜）' : CAUSE_ACTION[cause],
        why,
    });
    /* 探针自身失效排最前：探针坏了，它对环境的所有判断都不可信。 */
    if (E.probeOk === false) return out('probe-self-fault', '探针块执行 / 读数落盘失败 ⇒ 本次读数不可信');
    if (E.deploy === 'version-mismatch') return out('deploy-unsynced', '真宿主部署版本与仓库不一致（测旧版比测不出来更坏）');
    if (E.deploy === 'missing') return out('deploy-unsynced', '真宿主插件目录里没有 manifest.json ⇒ 插件未同步部署');
    if (E.binPresent === false) return out('no-browser-driver', 'Chromium 可执行文件不存在');
    if (E.stTimedOut === true) return out('endpoint-timeout', 'ST 根路径请求超时（连接挂住，非拒绝）');
    if (typeof E.stStatus === 'number' && E.stStatus !== 200) {
        return out('no-st-endpoint', 'ST 根路径返回 ' + E.stStatus + '（0 = 连接被拒）');
    }
    /* 版本这条只在**能连上并且读到版本**时才判：读不到版本 ≠ 版本不符。 */
    if (typeof E.stVersion === 'string' && Array.isArray(E.stSupported) && E.stSupported.length > 0) {
        if (!E.stSupported.includes(E.stVersion)) {
            return out('st-version-mismatch', 'ST 版本 ' + E.stVersion + ' 不在插件声明支持集 ' + show(E.stSupported));
        }
    }
    if (E.mounted === 'missing') return out('plugin-not-mounted', '页面里插件对象不在场（这是产品缺陷，不是环境缺失）');
    if (E.mounted === 'init-incomplete') return out('plugin-not-mounted', '插件对象在、init 未完成 ⇒ 真实装配未成立');
    return out(null, '环境四态都不成立，且装配态正常 ⇒ 不该走 environment-unavailable 分支');
}
/**
 * 收尾：真页面未捕获异常。
 * @param {string[]} pageErrors
 * @returns {string[]}
 */
export function judgePageErrors(pageErrors) {
    const bad = [];
    const list = Array.isArray(pageErrors) ? pageErrors : null;
    if (list === null) {
        bad.push('缺 pageErrors 读数 —— 「没读到」与「没有异常」是两件事，不许同形');
        return bad;
    }
    if (list.length) {
        bad.push('真页面有未捕获异常 ' + list.length + ' 条：' + show(list.slice(0, 3)));
    }
    return bad;
}

/**
 * 顶层：把一份完整报告判一遍（探针与判据单测共用同一个入口）。
 * @param {object} report `realhost_readings.json` 的形状
 * @returns {{block:string, msg:string}[]}
 */
export function judgeReport(report) {
    const R = isObj(report) ? report : {};
    const out = [];
    const push = (block, list) => { for (const m of list) out.push({ block, msg: m }); };
    push('load', judgeLoad(R.load));
    push('write', judgeWrite(R.write));
    push('worldline', judgeWorldline(R.worldline));
    push('tail', judgePageErrors(R.pageErrors));
    return out;
}
