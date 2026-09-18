/**
 * entity-semantic.js — [v3.96 缝合] 实体语义登记与解析引擎
 *
 * 【来源】缝合 Bakemono/BakemonoMemory（剧情剪辑台 src/memory/story-state.js）
 *         的实体语义子机制，按记忆插件工程规范重写为可测纯函数 IIFE 模块。
 *         剥离其 chronicle 账本/表格数据库耦合（记忆插件无此重型结构），
 *         提取「实体登记 + 别名解析 + 单元格绑定」自包含核心，非照抄。
 *
 * 【机制】
 *   长篇 RP 中角色/物品/地点/计划等实体常以多种称呼出现（本名/别名/代称）。
 *   本引擎维护一个实体注册表，把 AI 填表/正文中出现的名称解析为唯一实体，
 *   解决「同一实体多种写法导致记忆碎片化」的问题：
 *   - upsertEntity：登记/更新实体（kind 校验，text 不可为实体；改名不改 kind）
 *   - resolveEntity：按 kind + name/aliases 精确匹配，仅唯一匹配才返回（重名不自动合并）
 *   - bindValue / unbindValue：把某个原始字符串值绑定到实体 id（显式校正）
 *   - findUnresolved：列出已声明语义类型但无法解析到实体的值（提示需人工校正）
 *
 * 【与源码差异】
 *   - 源码实体存于 state.chronicle.entities、绑定存于 table.cellRefs；
 *     本实现自包含 EntityRegistry 实例（state 由调用方持久化），不依赖账本
 *   - 源码 resolveEntity 仅在「唯一匹配」时返回；本实现保留该语义并补充
 *     resolveAll 返回全部候选（供 UI 展示重名歧义）
 *   - 增加 normalizeName 归一化匹配选项（默认关闭，保持与源码精确一致语义）
 */

(function (global) {
    'use strict';

    /** 实体语义类型（text 为普通描述列，不可作为实体） */
    const SEMANTIC_KINDS = ['text', 'person', 'item', 'plan', 'location'];
    const ENTITY_KINDS = SEMANTIC_KINDS.filter(k => k !== 'text');

    /** 生成实体 id */
    function uid(prefix) {
        const rnd = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        return `${prefix}-${rnd}`;
    }

    /**
     * 创建实体注册表
     * @param {object} [options]
     * @param {boolean} [options.normalizeMatch=false] 匹配时是否归一化（trim+小写+去空白）
     */
    function createRegistry(options = {}) {
        const normalizeMatch = options.normalizeMatch === true;

        /** @type {Array<{id:string,kind:string,name:string,aliases:string[]}>} */
        let entities = [];
        /** 值绑定表：normalizedValue|kind -> entityId（显式校正覆盖自动匹配） */
        let valueBindings = new Map();

        const norm = (v) => normalizeMatch
            ? String(v ?? '').trim().toLowerCase().replace(/\s+/g, '')
            : String(v ?? '').trim();

        const bindKey = (kind, value) => `${kind}::${norm(value)}`;

        /**
         * 登记或更新实体
         * @param {object} input
         * @param {string} [input.id] 已有实体 id（更新）；缺省为新建
         * @param {string} input.kind 实体类型（person/item/plan/location）
         * @param {string} input.name 实体名
         * @param {string[]} [input.aliases] 别名
         */
        function upsertEntity({ id = '', kind, name, aliases = [] } = {}) {
            if (!ENTITY_KINDS.includes(kind)) throw new Error('请选择实体类型并填写名称');
            if (!String(name ?? '').trim()) throw new Error('请选择实体类型并填写名称');
            let entity = id ? entities.find(e => e.id === id) : null;
            if (id && !entity) throw new Error('实体不存在');
            if (entity && entity.kind !== kind) throw new Error('已有实体不能直接更改类型，请新建另一实体');
            if (String(name).length > 200 || aliases.length > 30 || aliases.some(v => String(v).length > 200)) {
                throw new Error('实体名称或别名过长');
            }
            if (!entity) {
                entity = { id: uid(kind), kind };
                entities.push(entity);
            }
            entity.name = String(name).trim();
            entity.aliases = [...new Set(aliases.map(String).map(v => v.trim()).filter(Boolean))];
            return entity;
        }

        /**
         * 解析值为实体（explicitId 优先 → 显式绑定 → 唯一名字/别名匹配）
         * @returns {object|null} 唯一匹配才返回实体，否则 null
         */
        function resolveEntity(kind, value, explicitId = '', carry = null) {
            // [v3.173] 读数：本模块缝合后 69 个版本无人调用（v3.163 账本零消费）。
            //   resolveEntity 的失败有三态，而旧实现把它们全部返回 null：
            //     missing（登记表里根本没有这个名字）/ ambiguous（重名，故不敢合并）/
            //     kind-mismatch（名字命中但类型不对）。三者需要的处置完全不同，
            //     而在调用方看来都是「没解析出来」。读数走可选末位参数。
            const _read = { kind, hit: false, via: '', candidates: 0, miss: '', resolvedId: '', named: false };
            if (carry && typeof carry === 'object') carry.entityResolve = _read;
            const _fin = (entity, via) => {
                if (entity) { _read.hit = true; _read.via = via; _read.resolvedId = entity.id; }
                return entity;
            };
            _read.named = !!String(value ?? '').trim();
            if (explicitId) {
                const e = entities.find(x => x.id === explicitId && x.kind === kind) || null;
                if (!e) _read.miss = 'explicit-not-found';
                return _fin(e, 'explicit');
            }
            // 显式值绑定优先（人工校正）
            const bound = valueBindings.get(bindKey(kind, value));
            if (bound) {
                const e = entities.find(x => x.id === bound && x.kind === kind);
                if (e) return _fin(e, 'binding');
                _read.miss = 'binding-dangling';   // 绑定指向已删实体：悬空绑定必须看得见
            }
            const matches = resolveAll(kind, value);
            _read.candidates = matches.length;
            if (matches.length === 1) return _fin(matches[0], 'name');
            if (matches.length > 1) { _read.miss = 'ambiguous'; return null; }
            if (!_read.miss) _read.miss = _read.named ? 'no-match' : 'blank-value';
            return null;
        }

        /** 返回匹配某值的全部候选实体（供重名歧义展示） */
        function resolveAll(kind, value) {
            const target = norm(value);
            if (!target) return [];
            return entities.filter(e =>
                e.kind === kind &&
                [e.name, ...(e.aliases || [])].some(n => norm(n) === target)
            );
        }

        /** 显式绑定一个原始值到实体 id（人工校正歧义） */
        function bindValue(kind, value, entityId) {
            const entity = entities.find(e => e.id === entityId && e.kind === kind);
            if (!entity) throw new Error('字段类型与实体不匹配');
            valueBindings.set(bindKey(kind, value), entity.id);
            return entity;
        }

        /** 解除一个值的显式绑定 */
        function unbindValue(kind, value) {
            return valueBindings.delete(bindKey(kind, value));
        }

        /** 列出某 kind 下无法解析到实体的值（提示需校正） */
        function findUnresolved(kind, values) {
            const out = [];
            for (const v of values || []) {
                if (!norm(v)) continue;
                if (!resolveEntity(kind, v)) out.push(v);
            }
            return [...new Set(out)];
        }

        /** 删除实体（同时清除其值绑定） */
        function removeEntity(id) {
            const idx = entities.findIndex(e => e.id === id);
            if (idx < 0) return false;
            entities.splice(idx, 1);
            for (const [k, v] of valueBindings) if (v === id) valueBindings.delete(k);
            return true;
        }

        /** 导出可持久化状态 */
        function exportState() {
            return {
                entities: entities.map(e => ({ ...e, aliases: [...(e.aliases || [])] })),
                valueBindings: [...valueBindings.entries()],
            };
        }

        /** 从持久化状态恢复 */
        function importState(state = {}, carry = null) {
            const _raw = Array.isArray(state.entities) ? state.entities : [];
            const _kept = [];
            const _read = { input: _raw.length, kept: 0, droppedBadKind: 0, droppedNoId: 0,
                bindingsIn: 0, bindingsKept: 0, bindingsDangling: 0, sample: [], malformed: false };
            for (const e of _raw) {
                if (!e || typeof e !== 'object' || !ENTITY_KINDS.includes(e.kind) || !String(e.id || '').trim()) {
                    if (!e || typeof e !== 'object' || !ENTITY_KINDS.includes(e?.kind)) _read.droppedBadKind++;
                    else _read.droppedNoId++;
                    if (_read.sample.length < 5) _read.sample.push(String(e?.kind ?? typeof e));
                    continue;
                }
                _kept.push({ id: e.id, kind: e.kind, name: e.name, aliases: [...(e.aliases || [])] });
            }
            entities = _kept;
            _read.kept = _kept.length;
            _read.malformed = !Array.isArray(state.entities) && state.entities !== undefined;
            const _binds = new Map(Array.isArray(state.valueBindings) ? state.valueBindings : []);
            _read.bindingsIn = _binds.size;
            const _ids = new Set(_kept.map(e => e.id));
            for (const k of [..._binds.keys()]) {
                if (!_ids.has(_binds.get(k))) { _binds.delete(k); _read.bindingsDangling++; }
            }
            valueBindings = _binds;
            _read.bindingsKept = _binds.size;
            if (carry && typeof carry === 'object') carry.entityImport = _read;
        }

        return {
            SEMANTIC_KINDS,
            ENTITY_KINDS,
            upsertEntity,
            resolveEntity,
            resolveAll,
            bindValue,
            unbindValue,
            findUnresolved,
            removeEntity,
            exportState,
            importState,
            get size() { return entities.length; },
        };
    }

    const api = { SEMANTIC_KINDS, ENTITY_KINDS, createRegistry };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaEntitySemantic = api;
})(typeof window !== 'undefined' ? window : globalThis);