# Agent Note: stitching ST-Persistent-Memory's remaining three increments (v3.467.0)

Status: implemented

## Problem

The repository had already absorbed most of `dayuseless/ST-Persistent-Memory`, and the absorption is
recorded in the source itself: `scene-state-tracker.js:5` says "核心机制（吸收自 ST-Persistent-Memory
L0 现场快照与三态在场权限）", `presence-routing-guard.js` carries the three-tier ACL, and
`engine-injection-pipeline.js:1178` names the origin. A field-by-field comparison confirmed seven
capabilities already present (L0 scene snapshot, three-tier ACL + fail-closed, POV four-tier projection
+ secret masking + `leakScan` self-proof, evolution lineage + historical slice replay, in-band tag
extraction, sleep semantic awakening, dense+sparse RRF hybrid retrieval).

Three gaps were real, and each had a measured failure behind it rather than a feature-envy argument:

1. **Semantic fallback was not merely weak, it was inverted.** `memory-organs.js:simpleEmbedding` was
   `vec[i % dim] += charCodeAt(i) / 10000`. Measured on this repo's own samples: partially-overlapping
   CJK text scored **0.8634**, while **completely unrelated** text scored **0.9467** — unrelated ranked
   higher than related. That vector was used by all four degradation paths (`noKey`, `apiError`,
   `missingVector`, `exception`) and judged against the same 0.62 threshold calibrated for real
   embeddings. The fallback could not separate related from unrelated, yet nobody could see that from
   any receipt.
2. **Budget trimming fell into "unmeasurable" when one more retry was still possible.** The recency
   branch of `injection-router.js:trimToBudget` had exactly one candidate set (`RECENCY_MARKERS`). If
   that set did not fit, it did `full.slice(0, budget)` — a cut inside a block — which forces
   `keptIdxInAll = null`, and the downstream receipt records `budgetTrimmed`/`finalKept` as null with
   the note "切口落在块内部，块级保留清单不成立". The block-level accounting was abandoned while whole
   blocks were still available.
3. **Only one dimension of "playstyle" was tunable.** `extractionProfile` (v3.324.0 M3-O5) covers
   extraction cadence only. Switching a card from mystery to romance to ensemble required hand-editing
   5–7 keys; miss one and the combination is incoherent (a mystery card running with adaptive budget
   expansion enabled).

A fourth candidate — per-item "why wasn't this injected" reasons — was deliberately **not built**.
`recall-explain.js` already emits seven `why` values including `missing` and `hit`, and it enforces the
discipline that "判不了" must not be recorded as "通过". The counterpart implementation carries a single
`reason`. Rebuilding it would be a second, weaker copy of something stricter.

## Decision

### 1. Local deterministic N-gram vectorizer + per-source thresholds (`local-ngram-vectorizer.js`, new)

Word-level plus 1/2/3-gram hashing, FNV-1a with `Math.imul` double-hash sign projection, L2
normalisation (the same construction as the counterpart's `generateLocalEmbedding`, which is the part
worth copying because it is *deterministic* — the same text always yields the same vector, so scores are
reproducible in a test).

Measured scores became the source of truth for both the threshold and the documentation:

| case | score |
|---|---|
| identical | 1.0000 |
| western words reordered | 0.9869 |
| CJK partial overlap | 0.2735 / 0.3914 |
| completely unrelated | 0.0256 |
| **pure synonymous rewrite** | **0.0169** |

The last row decided a hard documentation rule, written into the module header: **pure synonym rewrite
is indistinguishable from unrelated text, so no document, comment, or report may describe this as
"same-meaning recall"**. Shipping the same construction and claiming semantics would be exactly the kind
of unmeasured claim this repository keeps auditing.

Thresholds are therefore **per source**, not global:

- `api: 0.62` — calibrated against real embeddings, unchanged.
- `local-ngram: 0.22` — below the weakest related sample (0.2735, leaves margin) and far above unrelated (0.0256).
- `legacy-simple: null` and `unknown: null` — **no threshold is offered**. Any value would promote noise
  to "related"; `null` is the truthful answer and the caller must fall back to literal matching.

`sleep-awaken.js` now resolves the threshold from the pool's actual sources, takes `Math.min` when mixed
(marking `source: mixed(min)`), honours an explicit caller threshold (marking `thresholdFrom: 'caller'`),
and when no source has a threshold records `degrade: 'semantic-threshold-unavailable'` with mode
`literal` — kept distinct from `no-vector`, because "no vector at all" and "vector present but not
comparable in meaning" are different facts.

Four standing rules on the new module: dimension is caller-supplied (missing/invalid ⇒ `ok:false`,
never self-chosen, because a self-chosen dimension silently drops out of recall via
`emb.length === qemb.length`); it returns `source` plus `semanticParity:false` so it never impersonates
an embedding; behaviour changes only on the path that was already fake (`config.localVectorFallback !== false`,
default on); and it exports **no** `cosine` — a second similarity formula is the drift source this repo
has paid for repeatedly. `memory-organs.js` additionally gained a `dimensionMismatch` counter: when the API
returns a dimension that does not match the stored corpus, the vector is **not** cached, because mixing
dimensions makes `sleep-awaken.js`'s length check silently discard matches.

### 2. Budget trimming as a graded ladder, always whole-block (`injection-router.js` + inline fallback)

`L1-markers` (previous behaviour) → `L2-headers` (leading `[xxx]` / `〔xxx〕` structural blocks) →
`L3-all-blocks` (any non-empty trigger block). Every level still selects **whole blocks**; hard truncation
happens only when L3 cannot fit even the first block. The level actually used is recorded as
`trace.degradeStage`. This is not a relaxation of the contract: block selection was already heuristic
(`RECENCY_MARKERS` is a hand-written word list), hard truncation was never a design intent but a fallback
for when capacity cannot be computed, and moving the fallback from mid-block to whole-block is what makes
"who was dropped" measurable — which is precisely what L13-O6 demanded.

**Two implementation traps found by running the tests, recorded because both were mine:**

- **The block model splits by line.** `[相关片段·关键词命中]` and its body are *two* blocks. My first
  ladder accepted a level as soon as it fitted anything, so L2 fitted only that 10-character label and
  reported success — dropping 400 characters of body and producing a 101-character payload, when hard
  truncation would have carried 329 characters of body. **Keeping only the label is worse than
  truncating.** Fixed with `_isLabelOnly`: a level that only fits label-only blocks does not count as a
  successful degradation, and the ladder continues.
- **`_usedPred` must be looked up from `_usedStage`.** My first version always used the L1 predicate, so
  when L2/L3 actually applied, the kept-index bookkeeping silently omitted the blocks they kept.

The inline fallback in `engine-injection-pipeline.js:1960` is the **second implementation** of the same
logic. `v3273 C2` caught the drift immediately (`mod=152 inl=200`) because I had changed only the module.
The ladder was copied verbatim into the inline path, with a comment stating that either copy drifting red
is C2's job.

### 3. Gameplay presets + `/lonsha-preset` (`gameplay-preset.js`, new)

Four presets, each the set of keys that belong together for one subject matter:
`mystery_detective` (relevance / 3600 / adaptive off — old clues are the case, and adaptivity squeezes
body text on long cards), `romance` (balanced / 2800 — narrative flow is continuous, pure relevance
evicts "that silence three days ago"), `ensemble_drama` (recency / 3800 — who is present now matters
most), `fantasy_ttrpg` (balanced / 4000, `hybridAlpha 0.4` — invented proper nouns are found by BM25;
dense vectors carry almost no signal for coinages).

Three rules, each made runtime-checkable instead of being a comment:

- **Credential zero-pollution.** `SECRET_KEY_PATTERNS` rejects key/token/secret/password suffixes and
  the known credential and prompt-asset names. The table is validated **at module load**, so a future
  preset cannot quietly reintroduce one. (A comment saying "don't put credentials here" only guarantees
  that today is fine.)
- **It does not write anything itself.** `plan()` is pure; `applyPreset()` requires an injected `apply`
  callback; persistence is the host's `ConfigManager.saveConfig()` — the same path the settings panel
  uses. No second persistence channel, no localStorage in the module.
- **Unknown preset does not fall back silently.** It throws so the user sees it. Falling back to a
  default would let someone believe they switched presets when they had not — the most dangerous failure
  mode for a "switch one thing, change seven keys" feature.

`/lonsha-preset` has three shapes: no argument lists the four presets (and touches nothing), `--dry`
previews the rewrite list, an id applies. A new `gameplayPreset` config key records **which preset was
used**; it is a label only — the engine never reads it, and manually retuning one key does not clear it
(otherwise "I just want one key different" would repeatedly erase the label).

This forced one honest accounting correction: `public-interface.js` documents its boundary as "不做写入口，
三个入口全部只读". `/lonsha-preset` changes **configuration**, not **ledgers** — no memory entry, floor,
or bookkeeping record is written; the key set is limited to the preset whitelist; and the write still
goes through `saveConfig`. That distinction is stated at the injection site and in the module header,
plus a fourth independent status slot so this entry failing cannot redden slash/macro.

## Alternatives considered

- **Build the per-item injection reason too.** Rejected: `recall-explain.js` already has seven `why`
  values and a stricter discipline (unmeasurable is never recorded as pass). A second, weaker
  implementation would create two sources for the same question.
- **Give `local-ngram` the same 0.62 threshold and call it a drop-in.** Rejected by measurement: related
  samples live at 0.27–0.39, so 0.62 would reject everything; and 0.22 applied to a real embedding would
  accept noise. Swapping the vectorizer without swapping the threshold is equivalent to not changing
  anything.
- **Give `legacy-simple` some threshold so every source has one.** Rejected as dishonest. Its unrelated
  score (0.9467) exceeds its related score (0.8634); no threshold separates them. `null` plus a literal
  fallback states the truth.
- **Keep `simpleEmbedding` as the first fallback and use N-gram only later.** Rejected: it would preserve
  the inverted-ranking behaviour on the most common path. It stays as the last resort only when the
  N-gram module is absent, and its threshold remains `null`.
- **Let hard truncation remain the recency fallback (i.e. change nothing).** Rejected: it throws away
  block-level measurability while whole blocks are still available, and it was already producing
  "块级保留清单不成立" on ordinary inputs.
- **Update the seven assertions that expected hard truncation.** Rejected in favour of changing the
  *sample*. Those tests are not pinning the old behaviour for its own sake — they pin "the span-based
  judgment does not lie about a half-cut block". With the ladder, a 300-character block fits inside the
  329-character trigger capacity, so the scenario had silently gone out of scope. Raising block length to
  340 keeps the intent (L3 cannot fit; cut point 420 lands inside the *second* block, preserving the
  downstream "kept 2 / partial 1 / dropped 1" counts) and a new precondition assertion stops the sample
  from drifting back to "it fits". Taking 400 instead put the cut inside the first block, dropped two
  blocks, and reddened A3's hard-coded counts — recorded in the test.
- **Put the preset command inside `public-interface.js`'s read-only slash handler.** Rejected: that would
  make a read-only entry point write state, exactly the kind of quiet boundary erosion this repo audits.
  It lives in the same file but with its own explicit accounting and its own status slot.
- **Bind the preset's `apply` to `localStorage` inside the preset module.** Rejected: the module would
  then own persistence policy. Injection keeps "which keys" and "when to persist" separable, and lets the
  tests assert both.

## Consequences

- Semantic degradation now carries a truthful label. Every stored entry records `embedSource`, and
  `sleep-awaken.js` resolves its threshold from that, so a mixed pool is judged by the most conservative
  available threshold and says `mixed(min)`.
- Claims about same-meaning recall are now explicitly false for the local vectorizer; the measurement
  table and that prohibition live in the module header so future copy changes hit them.
- Budget trimming either keeps whole blocks or, when it truly cannot, still reports hard truncation with
  spans. The new `degradeStage` field makes "how far did we degrade this round" readable.
- Playstyle changes are one command instead of 5–7 hand edits, with a preview mode and a label recording
  which preset produced the current values.
- Seven suites, 125 assertions, all green: `v3467_local_vector_fallback` 12, `v3467_gameplay_preset` 22,
  `v3114_injection_router` 10, `v3251_injection_trace_and_source_attribution` 23,
  `v3273_o3_budget_cut_contract` 14, `v3274_o4_receipt_consumption` 20,
  `v3298_mo3_receipt_single_source` 24.
- `manifest.extra_js` 374 → 376. Version unified at **3.467.0** across `package.json`,
  `manifest.json`, `index.js`, and the three `VERSION` copies in `memory-config.js`,
  `memory-organs.js`, `memory-core.js` — which had been inconsistent *before* this version
  (`package.json`/`manifest.json` at 3.465.2 vs `index.js` at 3.466.1), a pre-existing fact that the
  version-frontier assertions surfaced during this work rather than something introduced here.
- What this version does **not** prove: the local vectorizer is deterministic and separates related from
  unrelated, but it is not semantic — a synonym-only paraphrase scores like noise. Real-host behaviour
  of `/lonsha-preset` (host WebView, actual `SlashCommandParser`) remains untested here; the command path
  is exercised against a parser stub only.