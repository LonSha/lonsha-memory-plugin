/**
 * memory-aux.js — 记忆辅助类集（计划 A1 第二刀）
 *
 * 【为什么需要这一面 / 修前实测】
 *   A1 第一刀（v3.257.0 memory-ledgers.js）已把六个叶子账本类剥出去；
 *   本刀按同一条读数轴（成员级预算 + 文件规模上界）继续剥**零/低依赖的工具类**。
 *   选它们的读数依据（逐条实测，不是感觉）：
 *     · 六个类彼此**零互调**（无任何相互引用）；
 *     · 除 EmergencyBackup 的一处诊断记账外，对主人符号**零依赖**（只用 Date / setTimeout / indexedDB / localStorage 这类标准面）；
 *     · 对外只被 MemoryEngine 在构造期 new 一次，之后按**方法名**调用。
 *
 * 【本模块的职责】
 *   · `HolidayAware`    节日感知（日期窗口 + 节日关键词，供召回加权 / 注入提示）
 *   · `Mutex`           提取互斥锁（[v3.145] 所有权令牌：非签发者释放被拒并计数可见）
 *   · `OpLog`           事件溯源日志（环形 500 + 三类损失落账：淘汰 / 字段裁剪 / 导入丢弃）
 *   · `FloorLedger`     楼层账本（[v3.155] 上限可配 + 淘汰可见：evicted 计数 + onEvict 回调）
 *   · `SnapshotManager` 快照管理（IndexedDB，同对话保留最近 5 份，同楼覆盖）
 *   · `EmergencyBackup` 紧急备份（IndexedDB + localStorage 双写，摘要骤减时保命）
 *   六个类的公开面（方法名 / 返回形状 / 字段名 / 中文诊断字面量）与抽取前**逐字一致**。
 *
 * 【本模块不做什么（边界）】
 *   · 不读 `window.SillyTavern`、不发请求、不解析剧情语言；
 *   · 不做跨类聚合（六个类互不引用，统合在宿主 `MemoryEngine`）；
 *   · **不另存一份诊断记账**：`EmergencyBackup` 的错误子入口走构造参数
 *     `opts.errLog` 显式注入（与 `FloorLedger` 的 `opts.maxFloors/onEvict` 同形），
 *     缺席时宁可丢诊断也不丢备份——不在模块里另写一个同名函数。
 *
 * 【口径纪律】
 *   ① 全部方法在字段缺失 / 环境不可用时返回空值（0 / false / [] / null / 0），**绝不抛**；
 *   ② 模块缺席时宿主退到 `MemoryAuxFallback`（常量空实现），如实回报「没有」；
 *   ③ 导出冻结（`Object.freeze(api)`）。
 *
 * 零依赖、CJS/IIFE 双导出（与全仓缝合模块同形）。
 */
(function (global) {
    'use strict';

     class HolidayAware {
        constructor() {
            this.holidays = [
                { date: '12-25', name: '圣诞节', before: 3, after: 3 },
                { date: '02-14', name: '情人节', before: 2, after: 2 },
                { date: '01-01', name: '元旦', before: 3, after: 3 },
                { date: '10-31', name: '万圣节', before: 1, after: 1 },
                { date: '05-20', name: '网络情人节', before: 1, after: 1 },
                { date: '06-01', name: '儿童节', before: 1, after: 1 },
                { date: '08-15', name: '中秋节', before: 3, after: 3 },
                { date: '07-07', name: '七夕', before: 2, after: 2 }
            ];
        }
        _parse(dateStr) {
            const s = String(dateStr || '');
            // [v2.2] 修复: 支持无年日期("3月12日"); 节日比较只看月/日, 年缺省用占位年
            const m = s.match(/(\d{3,4})\s*[年\/\-.]\s*(\d{1,2})\s*[月\/\-.]\s*(\d{1,2})/)
                || s.match(/(\d{1,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/)
                || s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
            if (!m) return null;
            const mo = Number(m[m.length - 2]), d = Number(m[m.length - 1]);
            if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
            let y = m.length === 4 ? Number(m[1]) : 2024;
            if (y < 100) y += 2000;
            return { y, mo, d };
        }
        /** 返回当前日期所处的节日（含临近窗口），无则 null */
        current(dateStr) {
            const p = this._parse(dateStr);
            if (!p) return null;
            for (const h of this.holidays) {
                const [hm, hd] = h.date.split('-').map(Number);
                const cur = p.mo * 100 + p.d;
                const target = hm * 100 + hd;
                // 允许跨月窗口（简单按天数近似）
                const diff = this._dayDiff(p.mo, p.d, hm, hd, p.y);
                if (diff >= -h.before && diff <= h.after) {
                    return { name: h.name, date: h.date, offsetDays: diff };
                }
            }
            return null;
        }
        _dayDiff(m1, d1, m2, d2, year) {
            const a = new Date(year, m1 - 1, d1).getTime();
            let bYear = year;
            const b = new Date(bYear, m2 - 1, d2).getTime();
            let diff = Math.round((a - b) / 86400000);
            // 处理跨年（如 12月 看 1月1日）
            if (diff > 180) diff -= 365;
            if (diff < -180) diff += 365;
            return diff;
        }
        /** 节日关键词（用于召回加权 / 注入提示） */
        keywords(holidayName) {
            const map = {
                '圣诞节': ['圣诞', '圣诞树', '礼物', '平安夜', '雪'],
                '情人节': ['情人节', '玫瑰', '巧克力', '告白', '约会'],
                '元旦': ['元旦', '新年', '跨年', '倒计时'],
                '万圣节': ['万圣', '南瓜', '糖果', '变装'],
                '网络情人节': ['520', '告白', '我爱你'],
                '儿童节': ['儿童节', '游乐场', '糖果'],
                '中秋节': ['中秋', '月饼', '团圆', '赏月'],
                '七夕': ['七夕', '牛郎织女', '鹊桥', '乞巧']
            };
            return map[holidayName] || [];
        }
    }

    class Mutex {
        // [v3.145] CP-L6: 所有权令牌（stbme Restore Lock 语义）——此前 release() 无凭证，
        // 任何持有引用的任务在 finally 里都能放锁：排队超时降级路径、聊天切换后晚到的
        // finally、回滚期间的旧任务都可能把别人（甚至新会话）的锁放开，导致并发写。
        // acquire() 现在返回签发凭证（truthy，既有 `if (!acquired)` 判定不受影响），
        // release(cred) 只认签发者；无凭证/非签发者一律拒绝并计入 _foreignRelease 可见化。
        constructor() { this.busy = false; this.pending = false; this.waiters = []; this._holder = null; this._tokenSeq = 0; this._foreignRelease = 0; }
        async acquire(ownerHint) {
            const issue = () => ({ id: ++this._tokenSeq, owner: String(ownerHint || 'anon'), at: Date.now() });
            if (!this.busy) { this.busy = true; this._holder = issue(); return this._holder; }
            // 已有任务在跑：排队等待（最多等 30s，避免死等）
            return new Promise((resolve) => {
                let done = false;
                const timer = setTimeout(() => {
                    if (done) return;
                    done = true;
                    const i = this.waiters.indexOf(entry);
                    if (i >= 0) this.waiters.splice(i, 1);
                    resolve(false);   // 超时→假值（调用方走降级路径，语义不变）
                }, 30000);
                const entry = (cred) => {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    if (cred) this.busy = true;
                    resolve(cred);
                };
                this.waiters.push(entry);
            });
        }
        release(cred) {
            if (!this.busy) return true;                     // 未持锁：空放，不算越权
            if (cred && cred === this._holder) { /* 正当释放 */ }
            else if (cred && typeof cred === 'object') {
                this._foreignRelease++;                       // [v3.145] 越权释放：晚到的 finally 不得放开新持有者的锁
                try { console.warn(`[Mutex] 拒绝越权释放：令牌 #${cred?.id}(${cred?.owner}) 非当前持有者 #${this._holder?.id}(${this._holder?.owner})`); } catch (e) {}
                return false;
            }                                                 // 无凭证→兼容既有/测试调用，按当前持有者释放
            if (this.waiters.length) {
                const next = this.waiters.shift();
                const cred2 = { id: ++this._tokenSeq, owner: next._ownerHint || 'queued', at: Date.now() };
                this._holder = cred2;
                next(cred2);   // 直接把锁（含新签发凭证）交给下一个等待者
            } else {
                this.busy = false; this._holder = null;
            }
            return true;
        }
        get locked() { return this.busy; }
        get holderToken() { return this._holder; }
        get queueLength() { return this.waiters.length; }
    }

    class OpLog {
        constructor() { this.entries = []; this._seq = 0; this._truncated = 0; this._trimFields = 0; this._importDropped = 0; this.lastTruncation = null; }
        /** 记录一条变更事件 */
        log(type, op, ref, floor, meta) {
            // [v3.169] 裁剪不得改写身份：截断是可接受的取舍，但必须留痕。
            //   旧实现把 'rollback-miss'(13) 静默存成 'rollback-m'(10)，于是「按 op 检索」这条
            //   诊断路径对同一 op 永远返回 0 命中——诊断工具先改了证据的名字。
            const _cap = OpLog._retention();
            const _type = String(type ?? '').slice(0, _cap.type);
            const _op = String(op ?? '').slice(0, _cap.op);
            const _ref = String(ref ?? '').slice(0, _cap.ref);
            const _meta = meta ? String(meta).slice(0, _cap.meta) : '';
            const _opLen = String(op ?? '').length, _refLen = String(ref ?? '').length, _metaLen = meta ? String(meta).length : 0;
            if (_opLen > _cap.op || _refLen > _cap.ref || _metaLen > _cap.meta) {
                this._trimFields = (this._trimFields || 0) + 1;
                this.lastTruncation = { at: Date.now(), op: _op, seq: (this._seq || 0) + 1, opFrom: _opLen, refFrom: _refLen, metaFrom: _metaLen };
            }
            this.entries.push({
                seq: ++this._seq,
                ts: Date.now(),
                type: _type,          // summary|graph|status|item|suspense|diary|pov|timeline|card|money|conflict|pair|locked_fact
                op: _op,              // add|update|remove|resolve|forge|shift
                ref: _ref,            // 目标 id/键/摘要签名
                floor: floor ?? null,
                meta: _meta
            });
            if (this.entries.length > 500) {
                const _over = this.entries.length - 500;
                this.entries.splice(0, _over);
                this._truncated = (this._truncated || 0) + _over;   // [v3.169] 淘汰即记账：数字不涨 = 没有淘汰过
            }
        }
        // [v3.169] 身份保真：**读侧必须用与写侧同一套规范化**。
        //   修前写侧截 60、读侧拿完整 id 直接比 —— 于是「自己写进去的 id 查不到自己」，
        //   这是同一条记录在两侧各有一套换算规则。现把规范化提为唯一真源（_retention），
        //   写入与三类检索全部经它，任何以后调整上限都只改一处、两侧自动同源。
        static _retention() { return { type: 20, op: 10, ref: 60, meta: 80 }; }
        static normRef(v) { return String(v ?? '').slice(0, OpLog._retention().ref); }
        static normOp(v) { return String(v ?? '').slice(0, OpLog._retention().op); }
        queryByType(type) { return this.entries.filter(e => e.type === String(type ?? '').slice(0, OpLog._retention().type)); }
        queryByRef(refId) { return this.entries.filter(e => e.ref === OpLog.normRef(refId)); }
        recent(n) { return this.entries.slice(-Math.max(1, Number(n) || 20)); }
        /** [v3.169] 账本实际覆盖的事件总数（含已淘汰）——读者不该把展示条数当成事件总数。 */
        observedTotal() { return Math.max(this._seq || 0, this.entries.length); }
        /** [v3.169] 一行自述：窗口 / 累计 / 三类损失。 */
        auditSummary() {
            const st = this.stats();
            const bits = ['窗口 ' + st.total + '/' + st.cap];
            const ever = this.observedTotal();
            if (ever > st.total) bits.push('累计 ' + ever);
            if (st.truncated) bits.push('已淘汰 ' + st.truncated);
            if (st.trimFields) bits.push('字段裁剪 ' + st.trimFields);
            if (st.importDropped) bits.push('导入丢弃 ' + st.importDropped);
            if (!st.truncated && !st.trimFields && !st.importDropped) bits.push('无损失');
            return bits.join(' · ');
        }
        /** 审计摘要：各类型事件计数 + 账本自述（窗口/容量/三类损失） */
        stats() {
            const byType = {};
            for (const e of this.entries) byType[e.type] = (byType[e.type] || 0) + 1;
            // [v3.169] 旧实现只回 {total, byType}：淘汰过 200 条的账本与从未超限的账本返回
            //   同一个形状，而 byType 里那 200 条的类型计数连同事件一起消失。
            return {
                total: this.entries.length,
                byType,
                cap: 500,
                seq: this._seq || 0,
                truncated: this._truncated || 0,
                trimFields: this._trimFields || 0,
                importDropped: this._importDropped || 0,
            };
        }
        export() { return { entries: this.entries, seq: this._seq, truncated: this._truncated || 0, trimFields: this._trimFields || 0 }; }
        import(data) {
            if (data && typeof data === 'object') {
                // [v3.169] 旧实现 `data.entries.slice(-500)` 静默丢弃超窗部分：900 条存进来只剩
                //   500，无计数、无告警。丢弃必须落账，否则「账本少了 400 条」只存在于
                //   「有人去数过原文件」这个前提里。
                const _all = Array.isArray(data.entries) ? data.entries : [];
                const _kept = _all.length > 500 ? _all.slice(-500) : _all;
                if (_all.length > 500) {
                    const _drop = _all.length - _kept.length;
                    this._importDropped = (this._importDropped || 0) + _drop;
                    this._truncated = (this._truncated || 0) + _drop;
                }
                this.entries = _kept;
                this._seq = Number(data.seq) || this.entries.length;
                // 存档自带的历史淘汰量：相加而非覆盖（宁可多算，不可漏算）
                this._truncated = (this._truncated || 0) + (Number(data.truncated) || 0);
                this._trimFields = (this._trimFields || 0) + (Number(data.trimFields) || 0);
            }
        }
    }

    class FloorLedger {
        constructor(opts) {
            this.floors = {};   // { floor: { nodeIds:[], summaryFloors:[], povIds:[], timelineIds:[], statusSnapshot:{} } }
            // [v3.155] 旧写法 MAX_FLOORS=400 硬编码 + 超限 `delete` 最旧楼层：删除后 rollbackFloor 遇
            //   `!entry` 直接 return 0，**回滚能力静默失效**（该楼产生的图谱节点/POV/时间线永远留在记忆里，
            //   成为幽灵记忆）。长线连载（>400 楼）必然触发。改为可配 + 淘汰可见（evicted 计数 + 回调 + op-log）。
            this.MAX_FLOORS = Math.max(20, Number(opts && opts.maxFloors) || 400);
            this.evicted = 0;                      // 累计淘汰楼层数（诊断可观测）
            this.onEvict = (opts && typeof opts.onEvict === 'function') ? opts.onEvict : null;
        }
        beginFloor(floor, statusSnapshot) {
            this.floors[floor] = {
                floor,
                nodeIds: [],
                summaryFloors: [],
                povIds: [],
                timelineIds: [],
                recallIds: [],        // [v3.150] B 楼层召回账本：该楼剧情被后续哪轮召回过（recallHits 聚合计数）
                statusSnapshot: statusSnapshot || null,
                createdAt: Date.now()
            };
            const keys = Object.keys(this.floors);
            if (keys.length > this.MAX_FLOORS) {
                // [v3.155] 逐个淘汰（原实现只 delete 一条，批量导入超限时会残留超限状态）+ 显式记账
                const _sorted = keys.sort((a, b) => a - b);
                while (_sorted.length > this.MAX_FLOORS) {
                    const _victim = _sorted.shift();
                    delete this.floors[_victim];
                    this.evicted++;
                    const _vn = Number(_victim);
                    if (Number.isFinite(_vn)) this.evictedFloorMax = Math.max(Number(this.evictedFloorMax) || -1, _vn);
                    if (this.onEvict) { try { this.onEvict(_victim, this.evicted); } catch (e) {} }
                }
            }
            return this.floors[floor];
        }
        record(floor, patch) {
            const e = this.floors[floor] || this.beginFloor(floor);
            if (patch.nodeIds) e.nodeIds.push(...patch.nodeIds);
            if (patch.summaryFloors) e.summaryFloors.push(...patch.summaryFloors);
            if (patch.povIds) e.povIds.push(...patch.povIds);
            if (patch.timelineIds) e.timelineIds.push(...patch.timelineIds);
            // [v3.150] B 楼层召回账本：本轮召回命中该楼的条目数（反向记账，非写入条目 id）
            if (patch.recallHits) { e.recallIds = e.recallIds || []; const _marks = Array.isArray(patch.recallIds) && patch.recallIds.length ? patch.recallIds : ['rec_' + Date.now()]; for (const _m of _marks) e.recallIds.push(_m); e.recallHits = (e.recallHits || 0) + (Number(patch.recallHits) || 0); }
            return e;
        }
        get(floor) { return this.floors[floor] || null; }
        // 移除楼层记录，返回被移除的条目（供调用方回滚）
        remove(floor) {
            const e = this.floors[floor];
            if (!e) return null;
            delete this.floors[floor];
            return e;
        }
        // 该楼层之后的所有楼层（重生成/删楼后需回滚的）
        floorsAfter(floor) {
            return Object.keys(this.floors).map(Number).filter(f => f > floor).sort((a, b) => a - b);
        }
        export() { return this.floors; }
        import(data) { this.floors = (data && typeof data === 'object') ? data : {}; }
    }

    class SnapshotManager {
        constructor() { this.DB_NAME = 'lonsha_snapshots'; this.STORE = 'snaps'; this.MAX_KEEP = 5; this._db = null; }
        async _open() {
            if (this._db) return this._db;
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(this.DB_NAME, 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.STORE)) {
                        db.createObjectStore(this.STORE, { keyPath: 'id' });
                    }
                };
                req.onsuccess = () => { this._db = req.result; resolve(req.result); };
                req.onerror = () => reject(req.error);
            });
        }
        /** 保存快照（同对话只保留最近 MAX_KEEP 份，同楼覆盖） */
        async save(chatId, floor, data) {
            try {
                const db = await this._open();
                const id = `${chatId}`;
                // 读出该对话现有快照
                const existing = await new Promise((resolve) => {
                    const tx = db.transaction(this.STORE, 'readonly');
                    const req = tx.objectStore(this.STORE).get(id);
                    req.onsuccess = () => resolve(req.result || {id, snaps: []});
                    req.onerror = () => resolve({id, snaps: []});
                });
                const snaps = (existing.snaps || []).filter(s => s.floor !== floor);
                snaps.push({floor, data, timestamp: Date.now()});
                snaps.sort((a, b) => a.floor - b.floor);
                while (snaps.length > this.MAX_KEEP) snaps.shift();
                const doc = {id, snaps};
                await new Promise((resolve, reject) => {
                    const tx = db.transaction(this.STORE, 'readwrite');
                    tx.objectStore(this.STORE).put(doc);
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });
                return snaps.length;
            } catch (e) { return 0; }
        }
        /** 列出该对话的快照（楼层+时间） */
        async list(chatId) {
            try {
                const db = await this._open();
                return await new Promise((resolve) => {
                    const tx = db.transaction(this.STORE, 'readonly');
                    const req = tx.objectStore(this.STORE).get(`${chatId}`);
                    req.onsuccess = () => resolve((req.result?.snaps || []).map(s => ({floor: s.floor, timestamp: s.timestamp})));
                    req.onerror = () => resolve([]);
                });
            } catch (e) { return []; }
        }
        /** 恢复指定楼层的快照数据 */
        async restore(chatId, floor) {
            try {
                const db = await this._open();
                return await new Promise((resolve) => {
                    const tx = db.transaction(this.STORE, 'readonly');
                    const req = tx.objectStore(this.STORE).get(`${chatId}`);
                    req.onsuccess = () => {
                        const snap = (req.result?.snaps || []).find(s => s.floor === floor);
                        resolve(snap?.data || null);
                    };
                    req.onerror = () => resolve(null);
                });
            } catch (e) { return null; }
        }
    }

    class EmergencyBackup {
        /**
         * 【参数】opts.errLog —— 主人传入的诊断记账函数（与 FloorLedger 的 opts 同形：显式注入，
         *   不在模块里另存一份同名函数）。缺席时用空实现 —— 只丢诊断、不丢备份。
         */
        constructor(opts) {
            this.DB_NAME = 'lonsha_snapshots'; this.STORE = 'snaps'; this.MAX_EMERGENCY = 8;
            this.LS_KEY = 'lonsha_emergency_backup'; this._db = null;
            this._errLog = (opts && typeof opts.errLog === 'function') ? opts.errLog : function () {};
        }
        async _open() {
            if (this._db) return this._db;
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(this.DB_NAME, 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.STORE)) db.createObjectStore(this.STORE, { keyPath: 'id' });
                };
                req.onsuccess = () => { this._db = req.result; resolve(req.result); };
                req.onerror = () => reject(req.error);
            });
        }
        /** 写紧急备份（同聊天最多保留 MAX_EMERGENCY 份；IndexedDB + localStorage 双写） */
        async save(chatId, reason, data, counts) {
            const entry = { floor: -1, emergency: true, reason: String(reason || ''), counts: counts || {}, data, timestamp: Date.now() };
            // localStorage 兜底（IndexedDB 不可用时也能保命）
            try {
                if (data.summaries && JSON.stringify(data.summaries).length < 900000) {
                    localStorage.setItem(this.LS_KEY + ':' + String(chatId || 'default'), JSON.stringify({ reason: entry.reason, counts: entry.counts, timestamp: entry.timestamp, data: { summaries: data.summaries, diaries: data.diaries, graph: data.graph, itemOps: data.itemOps } }));
                }
            } catch (e) { this._errLog(e, 'nonfatal'); }
            try {
                const db = await this._open();
                const id = 'emergency:' + String(chatId || 'default');
                const existing = await new Promise((resolve) => {
                    const tx = db.transaction(this.STORE, 'readonly');
                    const req = tx.objectStore(this.STORE).get(id);
                    req.onsuccess = () => resolve(req.result || { id, snaps: [] });
                    req.onerror = () => resolve({ id, snaps: [] });
                });
                const snaps = (existing.snaps || []).slice(-(this.MAX_EMERGENCY - 1));
                snaps.push(entry);
                await new Promise((resolve, reject) => {
                    const tx = db.transaction(this.STORE, 'readwrite');
                    tx.objectStore(this.STORE).put({ id, snaps });
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });
                return true;
            } catch (e) { this._errLog(e, 'DB.emergency.save'); return false; }
        }
        /** 读最近一份紧急备份 */
        async latest(chatId) {
            try {
                const db = await this._open();
                return await new Promise((resolve) => {
                    const tx = db.transaction(this.STORE, 'readonly');
                    const req = tx.objectStore(this.STORE).get('emergency:' + String(chatId || 'default'));
                    req.onsuccess = () => { const s = req.result?.snaps || []; resolve(s.length ? s[s.length - 1] : null); };
                    req.onerror = () => resolve(null);
                });
            } catch (e) { return null; }
        }
    }

    const api = Object.freeze({ HolidayAware, Mutex, OpLog, FloorLedger, SnapshotManager, EmergencyBackup });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaMemoryAux = api;
})(typeof window !== 'undefined' ? window : globalThis);
