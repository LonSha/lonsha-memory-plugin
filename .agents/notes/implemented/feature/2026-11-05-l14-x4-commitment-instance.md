# Agent Note: L14-X4 commitment instance lifecycle
Status: implemented
## Problem
The repository already had `commitment-ledger.js` (tracks overall status `open / fulfilled / broken / cancelled`) and `expectation-absence-tracker.js` (detects overdue absence slots), but lacked fine-grained management of recurring/individual instances:
- Waiving or postponing a single weekly or daily occurrence risked cancelling or completing the entire long-term commitment.
- Partial fulfillment could not record what was finished vs what remained without faking full completion.
- Absence or overdue states were at risk of being fabricated when commitments had no explicit floor or timestamp deadlines.

## Decision
The repository implements `commitment-instance-lifecycle.js`:
- Decouples long-term commitments from concrete instance executions (`commId#inst_seq`).
- `waiveInstance(instance, opts)`: Waives the current instance, issues a structured receipt, and automatically plans the next instance cycle (`longTermCommitmentSurvives: true`).
- `recordPartialFulfillment(instance, fulfillData)`: Records granular ratios, completed items, and remaining items; explicitly rejects ratio >= 1.0 to prevent false completion.
- `evaluateOverdue(instance, floor, timestamp)`: Enforces that commitments without deadlines return `no-due-deadline-specified` and are never judged overdue.
- Registered in `manifest.json` and host export/self-check in `index.js`.

## Consequences
Recurring agreements, partial handoffs, and temporary exemptions can now be managed without terminating overarching character commitments.
Verification is provided by `tests/v3448_l14_x4_commitment_instance.test.mjs` (4 test cases).