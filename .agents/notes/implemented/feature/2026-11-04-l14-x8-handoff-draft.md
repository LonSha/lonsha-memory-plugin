# Agent Note: L14-X8 era handoff draft

Status: implemented

## Problem
The repository already had two neighbouring pieces, but neither reached "handoff orchestration":

- `era-inheritance.js` creates era transitions and four proposal kinds, but `applyTransition` only understands an `action` — it cannot record **which heir** an item went to.
- `era-continuation-inheritance-tree.js` derives a read-only roster (four fates plus a separate `pending` axis, four secret boundaries), but it is a projection over existing `eraTransitions` and never answers "what can the next generation actually use".

The missing segment between them was the **draft**: something per-item, editable, revocable, and strictly zero-write before confirmation.

## Decision
The repository adds `era-handoff-draft.js` as a pure owner for the handoff draft, with no storage of its own:

- `createHandoffDraft(items, opts)` builds a draft from the previous generation's artifacts / stories / crafts. Items without an `id` are skipped rather than given a synthetic identity; duplicates collapse to the first entry rather than having two contents merged; an empty list is rejected so that "this save has not handed anything over yet" cannot be read as a draft.
- `assignHandoffItem(draft, assignment)` assigns one heir and one fate per item. Unknown fates are rejected instead of defaulting to `accepted`, and `sharedWith` is discarded (with a `sharesIgnored` trace) for `rejected` / `lost`, where sharing is meaningless.
- `previewNextGeneration(draft, opts)` produces the next generation's usable materials. Without `heirId` it groups per heir, which is how "given to A" is proven not to become "owned by the family". It reports `writesNothing`, `createsFact: false`, and marks the prompt preview `promptPreviewIsDraft`.
- `revokeHandoffDraft(draft)` clears every assignment, keeps the revoked decisions in `revokedAssignments` for audit, and reports `sourceUntouched` / `oldEraReadable`. A revoked draft refuses further assignment and preview.
- `buildCommitPayload(draft, opts)` is the only exit. It returns `writes: false` always and hands a payload to the existing `eraTransitions` owner; `opts.confirm !== true` yields `not-confirmed` and no payload.

Two axes are kept strictly separate. `accepted` / `rejected` / `reformed` / `lost` are results of a transition that has already happened; `pending` is "not yet decided" and is deliberately absent from `RESULT_FATES`, so the "four fates are exhaustive" claim stays true. Undecided items preview as `还没传`, never as lost or rejected.

Secret handling calls only the injected `knowledgeOf` and does not implement its own visibility rule. Only `knower` (disclosed) releases content; `listed` (withheld), `absent` (not in the secret ledger), a throwing kernel, and a missing kernel all withhold it, and `absent` stays distinguishable from `withheld`.

## Alternatives considered
- Extending `era-inheritance.js` with an heir field would keep era logic together, but that module is a transition executor; drafts must be editable and revocable without touching a transition record.
- Computing "next generation materials" inside `era-continuation-inheritance-tree.js` would reuse the roster, but that module is intentionally a read-only projection over an existing slot and must not gain a draft lifecycle.
- Emitting a full payload containing undecided items was rejected after a real run: `buildInheritanceRoster` reads "transition applied but this item was not handled" as `lost:dropped-in-transition`, so a player who decided nothing would be told the heirloom was lost. The commit now declares only items that actually passed on and reports the rest as `carriedOverItemIds`.

## Consequences
The handoff page can offer per-item heir assignment, a per-heir preview of the next generation's materials, and a revocable draft, without writing anything before confirmation. Secrets that are not authorized never reach next-generation materials or the preview string. Items the player leaves undecided stay pending and remain assignable in a later round.

Verification is provided by `tests/v3446_l14_x8_handoff_draft.test.mjs`, together with the era inheritance, inheritance roster, intergenerational totem, revisit schedule, generation state, and module wiring suites.
