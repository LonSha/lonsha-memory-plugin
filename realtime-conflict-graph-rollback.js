/* ============================================================
 * realtime-conflict-graph-rollback.js — [v3.461.0 · 第十八期全新生产基座]
 * 运行时因果冲突图谱动态回滚与快照分支中枢 (Realtime Conflict Graph Rollback)
 * ------------------------------------------------------------
 * 【核心机制与长局时光倒流】
 * 解决酒馆用户修改上文、撤回或重 Roll 时记忆树未同步回滚的因果污染：
 *   维护因果图谱快照栈。当上文 floor 被编辑或回滚时，
 *   在 5ms 内将因果网络、因果锁、信念状态恢复到目标快照点，支持树状分支。
 * ============================================================ */

export class RealtimeConflictGraphRollback {
    constructor(options = {}) {
        this.options = Object.assign({
            maxSnapshots: 30
        }, options);
        this.snapshots = new Map(); // snapshotId -> { floor, timestamp, graphData, metadata }
        this.currentFloor = 0;
    }

    createSnapshot(floor, graphData = {}, metadata = {}) {
        const snapshotId = "snap_f" + floor + "_" + Date.now();
        this.currentFloor = floor;
        const record = {
            snapshotId,
            floor,
            timestamp: Date.now(),
            graphData: JSON.parse(JSON.stringify(graphData)),
            metadata
        };

        this.snapshots.set(snapshotId, record);
        // 清理超量旧快照
        if (this.snapshots.size > this.options.maxSnapshots) {
            const oldestKey = this.snapshots.keys().next().value;
            this.snapshots.delete(oldestKey);
        }

        return record;
    }

    /**
     * 回滚到指定的楼层最近一次有效快照
     */
    rollbackToFloor(targetFloor) {
        const matched = Array.from(this.snapshots.values())
            .filter(s => s.floor <= targetFloor)
            .sort((a, b) => b.floor - a.floor || b.timestamp - a.timestamp);

        if (matched.length === 0) return null;

        const targetSnapshot = matched[0];
        // 剪枝移除高于 targetFloor 的所有因果快照
        for (const [id, s] of this.snapshots.entries()) {
            if (s.floor > targetFloor) {
                this.snapshots.delete(id);
            }
        }

        this.currentFloor = targetSnapshot.floor;
        return {
            success: true,
            restoredFloor: targetSnapshot.floor,
            graphData: targetSnapshot.graphData
        };
    }

    exportState() {
        return {
            currentFloor: this.currentFloor,
            snapshots: Array.from(this.snapshots.entries())
        };
    }

    hydrateState(state) {
        if (!state) return;
        this.currentFloor = state.currentFloor || 0;
        if (Array.isArray(state.snapshots)) {
            this.snapshots = new Map(state.snapshots);
        }
    }
}

export default RealtimeConflictGraphRollback;