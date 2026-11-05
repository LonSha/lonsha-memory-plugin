# Agent Note: L14-X1 knowledge relay chain
Status: implemented
## Problem
The repository already had `knowledge-trace.js`, which records past facts acquisition and state transitions (knows, doubts, misled, unknown, notRecorded), and `social-rumor-drift-network.js`, which describes text distortion across social hops. However:
- There was no structured multi-hop relay chain with explicit sender authorization: anyone could arbitrarily claim a relay hop even if they hadn't learned the fact yet.
- Delayed news lacked deterministic temporal validation: queries at floors prior to the relay hop could erroneously observe future knowledge.
- Retraction of a relay hop had no cascaded provenance tracking that safely invalidated downstream knowledge while preserving historical audit records.

## Decision
The repository adds `knowledge-relay-chain.js` as a pure, zero-dependency engine module:
- `createRelayChain(rawOrigin)` establishes the root origin of a fact or secret, anchored at an origin speaker and root floor.
- `appendRelayHop(chain, draft)` enforces sender authorization: the sender must be verified as `isKnownAt(chain, from, floor)` prior to forwarding. Passing secret content requires the sender to possess secret access.
- `isKnownAt(chain, character, atFloor)` validates temporal availability: queries at `atFloor < hop.floor` fail-closed with `not-yet-known-at-floor`.
- `retractHop(chain, hopId)` invalidates the target hop and cascades retraction to all downstream hops derived from that speaker, setting `status: 'retracted'` while strictly preserving historical hops for audit trails.
- Exported via CJS/IIFE and wired into `index.js` and `manifest.json`.

## Consequences
Multi-hop knowledge propagation can now be audited, simulated, and queried with rigorous causality and temporal boundaries.
Verification is provided by `tests/v3448_l14_x1_relay_chain.test.mjs` (5 test cases).