# Agent Note: L14-X2 past event narration compare
Status: implemented
## Problem
The repository already had `oral-history-archive.js` (M7-X1) and `testimony-board.js` (M4-X5), but lacked an operational sentence-level side-by-side comparison journey linking subjective narratives directly back to physical canonical evidence:
- Multiple character accounts of the same event often contradict, omit, or speculate without clear visual contrast.
- Player/character edits risked mutating underlying canonical facts.
- Unsubstantiated claims lacked a clear non-disruptive representation preventing unwarranted upgrade to canon.

## Decision
The repository implements `past-event-narration-compare.js`:
- `createNarrationCompareSession(rawEvent)` anchors canonical evidence with stable evidence IDs and floors.
- `addCharacterNarration(session, input)` digests narrative segments into structured four-state items (`concordant`, `disputed`, `evasive`, `unsubstantiated`).
- `computeSegmentsMatrix` compiles multi-perspective segment diff rows aligned side-by-side by speaker.
- `traceCanonicalEvidence` guarantees immediate backlink resolution to physical evidence segments.
- Strict isolation: modifying character narrations never mutates the underlying `canonicalEvidence` array.
- Registered in `manifest.json` and host export/self-check in `index.js`.

## Consequences
Players and characters can now compare multi-party accounts of the same event, flag discrepancies, and inspect grounding evidence without corrupting objective history.
Verification is provided by `tests/v3448_l14_x2_narration_compare.test.mjs` (3 test cases).