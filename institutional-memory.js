/* ========================================================
 * institutional-memory.js — [M6-X5 · v3.358.0] 群体与制度记忆契约
 * 纯函数/纯契约，零依赖，零写回。
 * --------------------------------------------------------
 * 解决问题：
 *   从仅所有人知道同一件事，到以组织实体管理职责、任期、决议、惯例与换届交接。
 * 核心机制：
 *   1. 组织实体与任期（Tenure & Mandates）：记录组织身份、成员任期与授权职责；
 *   2. 公共制度与私人秘密物理隔离：群体事实与成员私人档案分开存储；
 *   3. 临时决议日落规则（Sunset on Temporary Resolutions）：临时决议到期失效，严禁提升为永久规则；
 *   4. 规范换届交接（Handover Ledger）：交接组织职责与公共决议，严禁继承前任私人秘密；
 *   5. 同名分会独立隔离（Branch Isolation）：按 institutionId + branchId 隔离。
 * ======================================================== */
'use strict';

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaInstitutionalMemory = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const VERSION = '3.358.0';

    function _str(v) { return (v != null) ? String(v).trim() : ''; }
    function _arr(v) { return Array.isArray(v) ? v : []; }
    function _clone(v) {
        if (v == null || typeof v !== 'object') return v;
        return JSON.parse(JSON.stringify(v));
    }

    /**
     * 创建组织实体
     */
    function createInstitution(spec = {}) {
        const name = _str(spec.name);
        if (!name) throw new Error('createInstitution requires name');

        const institutionId = _str(spec.institutionId) || ('inst_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
        const branchId = _str(spec.branchId) || 'main';

        return Object.freeze({
            institutionId,
            branchId,
            name,
            foundingDate: spec.foundingDate || null,
            currentLeader: _str(spec.currentLeader),
            roles: _arr(spec.roles).map(_normalizeRole),
            tenures: _arr(spec.tenures).map(_normalizeTenure),
            resolutions: _arr(spec.resolutions).map(_normalizeResolution),
            institutionalFacts: _arr(spec.institutionalFacts).map(_str).filter(Boolean),
            // 私人秘密隔离区：仅限该成员本人访问，绝对不随组织公开或换届交接
            privateDossiers: { ...(spec.privateDossiers || {}) },
            handoverLogs: _arr(spec.handoverLogs).map(_normalizeHandoverLog),
            createdAt: spec.createdAt || Date.now(),
            updatedAt: spec.updatedAt || Date.now()
        });
    }

    function _normalizeRole(r) {
        return Object.freeze({
            roleId: _str(r?.roleId) || ('role_' + Math.random().toString(36).slice(2, 7)),
            title: _str(r?.title),
            holderCharKey: _str(r?.holderCharKey),
            responsibilities: _arr(r?.responsibilities).map(_str).filter(Boolean)
        });
    }

    function _normalizeTenure(t) {
        return Object.freeze({
            tenureId: _str(t?.tenureId) || ('tnr_' + Math.random().toString(36).slice(2, 7)),
            charKey: _str(t?.charKey),
            roleTitle: _str(t?.roleTitle),
            startDate: _str(t?.startDate),
            endDate: _str(t?.endDate) || null,
            status: _str(t?.status) || 'active' // 'active' | 'completed' | 'terminated'
        });
    }

    function _normalizeResolution(res) {
        return Object.freeze({
            resolutionId: _str(res?.resolutionId) || ('res_' + Math.random().toString(36).slice(2, 7)),
            title: _str(res?.title),
            summary: _str(res?.summary),
            isTemporary: Boolean(res?.isTemporary),
            effectiveFrom: _str(res?.effectiveFrom),
            expiresAt: res?.expiresAt ? Number(res.expiresAt) : null,
            sunsetCondition: _str(res?.sunsetCondition) || null,
            status: _str(res?.status) || 'active' // 'active' | 'expired' | 'repealed'
        });
    }

    function _normalizeHandoverLog(log) {
        return Object.freeze({
            logId: _str(log?.logId) || ('log_' + Math.random().toString(36).slice(2, 7)),
            outgoingLeader: _str(log?.outgoingLeader),
            incomingLeader: _str(log?.incomingLeader),
            transferredPublicMandates: _arr(log?.transferredPublicMandates).map(_str),
            privateSecretsLeakPrevented: Boolean(log?.privateSecretsLeakPrevented),
            effectiveTimestamp: log?.effectiveTimestamp || Date.now()
        });
    }

    /**
     * 添加组织决议
     */
    function addResolution(inst, resolutionSpec) {
        if (!inst || !inst.institutionId) throw new Error('Invalid institution');
        const nextRes = [...inst.resolutions, _normalizeResolution(resolutionSpec)];
        return Object.freeze({
            ..._clone(inst),
            resolutions: nextRes,
            updatedAt: Date.now()
        });
    }

    /**
     * 记录成员私人秘密（物理隔离，严禁与组织事实混淆）
     */
    function recordPrivateSecret(inst, charKey, secretText) {
        if (!inst || !inst.institutionId) throw new Error('Invalid institution');
        const k = _str(charKey);
        if (!k) throw new Error('charKey required');

        const dossiers = { ...inst.privateDossiers };
        const list = _arr(dossiers[k]);
        dossiers[k] = [...list, {
            secretId: 'sec_' + Math.random().toString(36).slice(2, 7),
            text: _str(secretText),
            recordedAt: Date.now()
        }];

        return Object.freeze({
            ..._clone(inst),
            privateDossiers: dossiers,
            updatedAt: Date.now()
        });
    }

    /**
     * 获取当前有效决议（自动过滤日落过期的临时决议）
     */
    function getActiveResolutions(inst, currentTime = Date.now()) {
        if (!inst) return [];
        return inst.resolutions.filter(r => {
            if (r.status !== 'active') return false;
            // 临时决议若到期，则不再有效
            if (r.isTemporary && r.expiresAt && currentTime > r.expiresAt) {
                return false;
            }
            return true;
        });
    }

    /**
     * 执行负责人换届交接
     * 关键验收断言：
     * 1. 继承公共职责与有效决议；
     * 2. 绝不继承前任私人秘密；
     * 3. 记录任期变更与交接日志。
     */
    function performLeaderHandover(inst, spec = {}) {
        if (!inst || !inst.institutionId) throw new Error('Invalid institution');
        const outgoing = _str(spec.outgoingLeader) || inst.currentLeader;
        const incoming = _str(spec.incomingLeader);
        if (!incoming) throw new Error('incomingLeader is required for handover');

        const effectiveTime = spec.effectiveTimestamp || Date.now();

        // 1. 更新任期
        const nextTenures = inst.tenures.map(t => {
            if (t.charKey === outgoing && t.status === 'active') {
                return Object.freeze({ ...t, status: 'completed', endDate: String(effectiveTime) });
            }
            return t;
        });
        nextTenures.push(_normalizeTenure({
            charKey: incoming,
            roleTitle: 'Leader',
            startDate: String(effectiveTime),
            status: 'active'
        }));

        // 2. 收集公共交接物（有效公共决议、公开制度事实）
        const activeRes = getActiveResolutions(inst, effectiveTime);
        const transferredMandates = activeRes.map(r => r.title).concat(inst.institutionalFacts);

        // 3. 验证并阻断私人秘密泄露
        const outgoingSecrets = inst.privateDossiers[outgoing] || [];
        const privateSecretsLeakPrevented = outgoingSecrets.length > 0;

        // 新任领袖不能获得前任的私人秘密包，privateDossiers 保持原属权
        const preservedDossiers = { ...inst.privateDossiers };

        // 4. 记录日志
        const handoverLog = _normalizeHandoverLog({
            outgoingLeader: outgoing,
            incomingLeader: incoming,
            transferredPublicMandates: transferredMandates,
            privateSecretsLeakPrevented: true,
            effectiveTimestamp: effectiveTime
        });

        return Object.freeze({
            ..._clone(inst),
            currentLeader: incoming,
            tenures: nextTenures,
            privateDossiers: preservedDossiers,
            handoverLogs: [...inst.handoverLogs, handoverLog],
            updatedAt: Date.now()
        });
    }

    /**
     * 派生跨分会公开规则包（不含任何私人材料与非公开条目）
     */
    function exportPublicCharter(inst) {
        if (!inst) return null;
        return Object.freeze({
            institutionName: inst.name,
            branchId: inst.branchId,
            institutionalFacts: [...inst.institutionalFacts],
            activePermanentResolutions: inst.resolutions.filter(r => !r.isTemporary && r.status === 'active'),
            publicRoles: inst.roles.map(r => ({ title: r.title, responsibilities: r.responsibilities }))
        });
    }

    return Object.freeze({
        VERSION,
        createInstitution,
        addResolution,
        recordPrivateSecret,
        getActiveResolutions,
        performLeaderHandover,
        exportPublicCharter
    });
});