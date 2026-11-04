# Agent Note: L14-X7 relationship repair response

Status: implemented

## Problem
The repository already had `relationship-repair-theater.js`, which can walk one of four whole paths (explain-and-reconcile, set boundaries, decline, postpone) inside a single encounter, and `repair-loop.js`, which is a data-repair ledger with evidence verdicts. Neither covers the journey this item asks for:

- There is no **partial acceptance**: a real answer is often "I accept this one, I do not accept that one", while the theater only offers four all-or-nothing paths.
- There is no **saved response record**: `executeRepairPath` mutates an in-memory encounter; nothing records who answered which ask and what they said.
- There is no **follow-up behavior evidence**, so "he said sorry" and "he actually kept it" end up looking the same.

## Decision
The repository adds `relationship-repair-response.js` as a pure owner for that chain, leaving the theater's contract untouched:

- `createRepairResponseRecord(proposal, opts)` builds a pending response from a proposal with concrete `asks`. A proposal with no asks is rejected rather than given a synthetic ask, because "he promised nothing" must not look like "he promised one thing".
- `recordResponse(record, response)` records `accept` / `reject` / `defer` / `partial`. `partial` requires **every** ask to be explicitly classified; an unlisted ask is "not said yet", not "accepted by default". An ask classified both accepted and rejected is refused as a contradictory input instead of being adjudicated for the user.
- `recordBehaviorEvidence(record, ev)` requires an `askId` that exists in the record and a non-empty `sourceRef`; evidence that cannot link back or has no source is refused rather than guessed.
- `computeProgress(record)` judges progress from real behavior evidence only. Declared is the ceiling while there is no evidence; `demonstrated` needs `kept` evidence; any `broken` dominates; `unknown` is neither.

Four boundaries are enforced throughout. Rejection and deferral land in `responded` as valid outcomes and never as `failed` or a pending task. `oldEventsCleared` is always false and `unresolvedHistory` is preserved verbatim, so one apology never erases the old events. Behavior evidence must link back to an ask with a real source. Draft evidence (`origin: 'draft'`) is kept in a separate `draftEvidence` bucket, excluded from progress counts, and reported as `draftEvidenceExcluded`, so a rehearsal is never read as something that happened.

## Alternatives considered
- Extending `relationship-repair-theater.js` with per-ask responses would keep repair logic in one file, but the theater is a path simulator whose unit is an encounter, while this item's unit is a saved response record that outlives the encounter.
- Reusing `repair-loop.js` evidence verdicts would avoid a second evidence vocabulary, but that ledger judges whether data repair was actually persisted; relationship progress is about a person's later behavior, and merging the two would let a successful data write look like kept faith.
- Treating `reject` as a terminal failure state was rejected: the acceptance journey states rejection is a valid ending, and a `failed` state would turn a legitimate answer into an unfinished chore on the UI.

## Consequences
The relationship detail page can offer a repair proposal, record a full or partial response, and later link real behavior evidence back to the specific ask it was about. Rejections and deferrals stop being nagged. Old grievances survive reconciliation. Drafts and simulations stay visibly separate from what actually happened.

Verification is provided by `tests/v3447_l14_x7_repair_response.test.mjs` (11 cases), together with the existing repair flow, repair settle, repair write channel, and module wiring suites.