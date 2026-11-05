# Agent Note: L14-X5 lore version conclusion reconcile
Status: implemented

## Problem & Motivation
When worldbooks or lore documents update, traditional systems either overwrite all prior conclusions or blindly retain outdated inferences. L14-X5 establishes a section-level diff and impact analysis workbench, marking conclusions as stale rather than silently rewriting, and strictly protecting manually edited user conclusions.

## Implementation Details
1. **Engine**: `lore-version-conclusion-reconcile.js`
   - `createLoreReconcileSession`: Tracks diffing session between two lore doc versions.
   - `diffLoreSections`: Identifies unchanged, modified, added, and removed sections.
   - `reconcileConclusionsWithDiff`: Inspects dependency section IDs, flags affected conclusions as `stale` with clear reasons, while leaving untouched conclusions as `fresh`.
   - `applyConclusionDecision`: Supports accepting recomputed draft conclusions or explicitly preserving manually edited conclusions (`kept_original`).
2. **Integration**: Registered in `manifest.json` and wired up in `index.js`.
3. **Verification**: `tests/v3448_l14_x5_lore_conclusion_reconcile.test.mjs` (3 test cases).