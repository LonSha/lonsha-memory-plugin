# Agent Note: L14-O2 fact correction transaction

Status: implemented

## Problem
The repository had two neighbouring correction pieces, but neither carried a correction all the way to the next generation:

- `fact-correction-bench.js` is a pure revision bench: it can trace an impact graph and mark downstream entries `stale`, but it only returns new objects. It does not organise commits per owner, and it knows nothing about the index or the recall side.
- `recall-correction.js` is a recall correction ledger: it filters candidates and can drop one correction, but it only acts on a candidate list. It never touches the fact store, and it has no cross-face consistency reading.

The missing piece was the **correction transaction**: one confirmation has to affect the fact store, the search index, the perspective projection, and injection — and each of those has its own owner.

## Decision
The repository adds `fact-correction-transaction.js` as a pure owner for that transaction:

- `previewCorrectionImpact(input)` classifies every dependent into one of four faces (`facts` / `index` / `perspective` / `injection`) and one of the existing three tiers (`recomputable` / `needs_confirm` / `manual_only`). Index entries that point at the corrected fact are pulled in even when they were not listed as dependents, because a stale inverted index would keep serving the old value. A value change always adds an injection-face item ("retire the old version"). Dependents whose face cannot be determined go into `undecided` rather than being counted as "this face is unaffected".
- `commitCorrection(preview, opts)` produces `ownerBatches` — one payload per owner — and never writes anything itself (`writes: false`). `confirm !== true` returns `not-confirmed` without producing batches, so a caller cannot write just by holding the preview. `atomicAcrossOwners` is false: partial failure is reported per owner and no cross-ledger atomic rollback is promised. `originalEvidenceUntouched` is true and the facts payload carries `rewritesEvidence: false`.
- `isVersionUsable(factVersion, tx)` is the single judge for the recall and injection side. A version listed in `retiredVersions` is unusable even if it never set `revoked`; the active version is usable; other facts are untouched; explicitly revoked versions are always unusable.
- `rollbackCorrection(tx, opts)` restores the retired version and retires the corrected one, requires confirmation, reports `already-rolled-back` on a second attempt instead of pretending to undo something, and keeps `originalEvidenceUntouched: true` — evidence text never enters this module's write path.
- `buildNextRoundReceipt(tx, opts)` returns a read-only ledger whose per-face `ok` stays `null` until the host reports, marked `facesPendingHostReport: true`.

## Alternatives considered
- Extending `fact-correction-bench.js` to emit owner batches was rejected: the bench is a pure impact/revise calculator with no notion of owners, and giving it commit duties would blur "computes impact" with "orchestrates writes".
- Reusing `recall-correction.js` as the version gate was rejected: that ledger filters recall candidates by correction scope, while the question here is whether a specific fact version may still be used at all.
- Writing the four faces from this module was rejected: the plan requires per-owner submission, and a single cross-owner writer would either need cross-ledger atomicity (explicitly not promised) or would silently leave half-applied corrections.

## Consequences
The fact detail page can show an impact preview across all four faces, commit a correction as per-owner batches, and report which faces succeeded. From the next round on, the retired version is refused by the shared version gate, so recall and injection stop using the corrected-away value. Rolling back restores the original version without rewriting the underlying evidence.

Verification is provided by `tests/v3448_l14_o2_correction_transaction.test.mjs` (9 cases), together with the module wiring and module consumption binding suites.