# Agent Note: L14-O9 scoped maintenance tasks

Status: implemented

## Problem
The existing batch maintenance pipeline already provided previews, receipts, and rollback snapshots, but its public preview accepted the entire input array as the target. It did not express a user-selected scope, a resumable checkpoint, or the recall/evidence consequence of a maintenance action. The existing season silence contract is intentionally single-item and must not be widened into a destructive bulk operation.

## Decision
The repository adds a separate scoped maintenance task layer on top of `batch-maintenance-pipeline.js`:

- `createScopedMaintenanceTask(items, selectedIds, action, params, now)` requires a non-empty, known, deduplicated selection and returns a read-only preview payload.
- `applyScopedMaintenanceTask(state, task, { confirm: true })` is the only path that returns a write payload and an auditable receipt. Without confirmation it returns `writes: false`.
- `resumeScopedMaintenanceTask(checkpoint, items, now)` reconstructs the same selected scope from a JSON-safe checkpoint; it never widens the selection to all candidates.
- Mute is represented as a reversible `muted` marker in the returned transformed item. Evidence and sources are copied into the receipt and are never deleted by this layer.
- Every task reports a small recall impact contract: default recall effect, evidence preservation, and reversibility.
- Existing `createBatchPreview`, `executeBatchPipeline`, and `revertBatchPipeline` remain unchanged for compatibility.

The new layer is pure: it returns transformed items for the host owner to persist and does not mutate the input array.

## Alternatives considered
- Replacing the old batch API with mandatory selection parameters would make accidental whole-array writes harder, but would break existing callers and historical tests; the scoped API is additive instead.
- Calling `memory-season.js` directly for bulk mute would reuse the action vocabulary, but it would broaden the existing single-topic silence semantics and create an implicit host write path; the task layer returns explicit item deltas instead.
- Deleting evidence when archiving or muting would simplify storage, but violates the product requirement that silence and maintenance preserve provenance and makes rollback incomplete.

## Consequences
The maintenance UI or host can now show exactly which selected IDs will change, how recall is affected, and what evidence is retained before confirmation. Interrupted tasks can be persisted and resumed from their checkpoint. The host still owns persistence and application of `transformedItems`; this commit does not invent a second storage owner or silently write to engine state. Direct ID lookup is linear over the candidate list, which is acceptable for the bounded maintenance batches covered here and can be indexed later if real workloads require it.

Verification is provided by `tests/v3445_l14_o9_scoped_maintenance.test.mjs`, plus the historical batch pipeline regression suite.
