# Agent Note: L14-O7 bounded recall and incremental archive reads

Status: implemented

## Problem

Long-running chats already have BM25 search and multi-resolution archives, but the expensive paths rebuild or render the whole collection. BM25 rebuild re-tokenizes every document after a local summary change, while archive rendering concatenates every volume, beat, and active log without a caller-visible budget or cancellation boundary. These paths make large mixed payloads harder to operate and give the UI no bounded presentation contract.

## Decision

BM25 exposes incremental `upsert(doc)` and `remove(id)` operations. A replacement updates only the affected document's term map, document frequencies, and average-length statistics; a new document is appended. Existing `rebuild`, `search`, and `searchBranches` behavior remains the compatibility path, including document ordering and scoring semantics.

Multi-resolution rendering accepts an optional fourth argument with explicit per-tier limits, a character budget, an optional visibility predicate, and an abort signal. Filtering happens before limits are consumed. The default call with no options renders the existing unbounded shape, while bounded calls stop at the first safe line boundary and report cancellation/truncation markers in the returned text. Drilldown accepts an optional scan budget and abort signal without changing the existing single-floor result contract.

## Alternatives considered

- Rebuild the full BM25 index after every change: simple and behaviorally familiar, but repeats tokenization across tens of thousands of unchanged documents and cannot meet the incremental invalidation requirement.
- Add a second search/index implementation: could optimize one caller, but would duplicate tokenization, ranking, and alias/lexicon behavior; rejected because it would create divergent results.
- Change the default archive output to a fixed cap: would reduce memory pressure, but silently remove historical context from existing callers; rejected in favor of opt-in bounds.
- Cancel only between top-level phases: easier to implement, but a single large tier would still block cancellation; checks are placed inside each item loop.

## Consequences

Incremental updates avoid full corpus tokenization for local edits, while full rebuild remains available for bulk replacement or lexicon changes. The BM25 object keeps the same public search result shape, with small additional mutation APIs.

Bounded rendering and drilldown make large payload reads predictable and cancellable, but callers that need complete output must omit limits and accept the existing cost. Visibility filtering is applied before truncation so hidden items cannot consume the visible budget. Timing budgets remain measured by the caller and are not encoded as fragile device-specific thresholds.

## Verification

The O7 focused suite covers incremental replacement/removal, ranking equivalence after incremental updates, bounded archive output, visibility-before-limit ordering, drilldown cancellation, and 10k mixed-log smoke behavior. Existing BM25 branch and multi-resolution archive suites remain required regressions.
