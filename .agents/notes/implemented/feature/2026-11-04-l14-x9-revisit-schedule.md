# Agent Note: L14-X9 revisit schedule

Status: implemented

## Problem
The repository had seasonal state, user silence actions, and ritual records, but no read-only revisit schedule that could turn source-backed memories into selectable cards and a bounded topic sequence. Mixing this into facts or rituals would make merely browsing a memory look like a new fact or a concluded event.

## Decision
The repository adds `memory-revisit-schedule.js` as a pure owner for revisit cards and session receipts:

- Cards are created only from items with a non-empty source reference and source text; missing source data is rejected rather than given a synthetic anniversary or date.
- Card types are limited to `commemoration`, `farewell`, `revisit`, and `defer`.
- `buildRevisitCards(items, seasonState, options)` filters user-muted topics before applying the optional limit and reports excluded muted topics separately.
- `createRevisitSession(cards, selectedIds)` requires an explicit selected scope and preserves the card order as the topic sequence.
- `recordRevisitEvent(session, cardId, action, evidenceRefs)` records `viewed` or `deferred` receipts only. These events do not create facts, change season state, or generate character speech.
- Sessions and receipts are plain serializable data. The host remains responsible for persistence and UI presentation.

Existing season and ritual APIs remain unchanged; this module only consumes their data shape and does not call host writes.

## Alternatives considered
- Extending `memory-season.js` would keep seasonal logic together, but would mix eligibility with user-created revisit records and make read events look like season actions.
- Reusing `memory-ritual.js` would provide a status container, but a revisit card is not a ritual and must not imply participant testimony or a concluded event.
- Generating cards without source references would make the empty-data path look useful while inventing dates or evidence; the feature explicitly rejects that behavior.

## Consequences
The UI can offer selectable, source-backed revisit cards and a resumable sequence without mutating factual memory. Muted topics disappear from the candidate list while the response remains diagnosable. The module is intentionally read-oriented; a later host integration can persist its session and receipts without changing the card eligibility contract.

Verification is provided by `tests/v3445_l14_x9_revisit_schedule.test.mjs` and the existing season/ritual regression tests.