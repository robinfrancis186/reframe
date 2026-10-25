# Reframe: improvements from the repaired Graphify map

23 October 2026. This is an evidence-based engineering priority list, not a new product rating. Static relationships suggest where to investigate; they do not establish adoption, runtime correctness or a 9/10 score.

## Map repair and preservation

The refresh preserves every previous node identity and every previous relationship. The map uses a directed multigraph so imports, calls and references between the same endpoints survive together. Prior-only records carry a visible **Retained ·** label. Reference stubs record imports whose definitions were not analyzed; they are not invented implementations. The original graph and candidate records remain intact in `graphify-out/evidence-ledger.json`, with recovery copies under `graphify-out/recovery-20261023T163417Z/`.

The export guard stayed enabled. Preservation assertions verify old IDs, old links, endpoint resolution, hyperedge membership and the absence of link loss during export. The HTML intentionally shows a simpler connection projection; the complete evidence remains in graph.json. Current-code analysis excludes historical and external-reference hubs. Same-file symbol relationships are retained, but are not mislabeled as module import cycles.

- [Interactive map](architecture/graphify/graph.html)
- [Complete graph report](architecture/graphify/GRAPH_REPORT.md)
- [Preservation checks](evidence/graphify-2026-10-23/preservation.json)
- Workflow paths (local-only `../graphify-out/workflow-paths.json`)
- File coupling measurements (local-only `../graphify-out/file-coupling.json`)

## What the graph reveals

The strongest current abstractions are `App()` (53 connections), `api()` (46), `LibraryStore` (41), `Projects` (37) and `ComponentItem` (36). High connectivity alone is not a defect: shared contracts are expected to have many consumers.

Two verified structural paths are particularly useful:

1. `ReadyToReuse()` → `reuseReport()` ← `checkReuse()`. The client and server already share an asset inventory, which is the right foundation for a consistent readiness contract. The report's runtime result currently lives in component state.
2. `captureVariants()` → `prepareReplica()` → `bundleImages()`. Each viewport/state variant prepares assets again. The asset fetch cache is scoped to an individual `bundleImages()` call, making shared session caching a concrete performance opportunity.

The graph also connects `ComponentItem` to server `SaveItem` and `Theme` to `LibraryManifest`. These are actual contract dependencies. Its similarity between immutable Library revisions and the private engine cache is explicitly **inferred**; it suggests an evidence-versioning pattern rather than proving a shared implementation.

## Priorities

### 1. Keep a versioned Ready to reuse receipt

**Impact: highest.** Save what was tested with the component so users can reopen it and understand whether it is ready for their destination.

**Current evidence:** [ReadyToReuse.tsx](../src/ReadyToReuse.tsx) stores `check` in React state, resets it on website changes and has no persistence operation for it. [reuse-check.js](../server/reuse-check.js) returns a website digest, timestamp, view results and verified downloads. [Projects.tsx](../src/Projects.tsx) has a separate installation receipt and tells users to check the destination runtime. These pieces are useful but do not form one persistent proof trail.

**Change:** store a scoped receipt keyed to component content revision, export mode and the destination revision when applicable. Keep asset inclusion, source-blocked rendering, declared action behavior and installed-app testing as separate statuses. A new frontend/backend edit must invalidate affected checks. A rename should preserve applicable results.

**Acceptance:** capture → test → save → reopen retains the exact receipt; changing an image, behavior or generated backend invalidates affected checks; a successful asset check never implies email delivery or arbitrary business logic works.

### 2. Expand runtime checks to captured states and real actions

**Impact: highest.** An installed component should have proof of the behavior the user expects.

**Current evidence:** [reuse-check.js](../server/reuse-check.js) tests HTML images and fonts at 1280 and 390px, then PDF downloads. [capture-variants.js](../server/capture-variants.js) can capture 390, 768 and 1280px with default, hover and focus states, while [export-workflow.js](../server/export-workflow.js) compares clean exports against captured variants. The source-blocked check does not exercise this full matrix or custom interactions. Its GET/HEAD-only isolation is intentional and should remain the default.

**Change:** test each available variant, including tablet, keyboard focus, navigation and supported controls. Offer a separate explicit behavior test against disposable local records for forms and declared actions. Verify the installed application too, using the same named assertions and recording which destination was tested.

**Acceptance:** all captured states have individual results; a broken tab, accordion, link or local form produces a visible failure; external APIs and email delivery remain unverified until their own configured tests pass. Block RobinFrancis.in and other external requests in the destination test.

### 3. Reuse asset downloads within one capture session

**Impact: high; speed improvement needs a benchmark.**

**Current evidence:** `captureVariants()` calls `prepareReplica()` inside its width/state loops; `prepareReplica()` calls `bundleImages()`. The latter creates a new resource-result map for each call. The same public image can therefore be requested repeatedly across supported variants. This is a source-level opportunity, not a measured latency claim.

**Change:** pass a bounded, session-scoped resource cache through the existing resource broker. Key by canonical resource identity, retain public-network and redirect validation, and release it when the capture session ends. Preserve failed/unsupported-resource reporting. Show progress and cancellation for longer variant jobs.

**Acceptance:** a controlled nine-variant fixture requests an unchanged image once per session; a changed response cannot leak across sessions; measure capture p50/p95 and request counts before and after. Do not introduce a permanent cache that quietly serves stale site assets.

### 4. Close server type-check coverage gaps

**Impact: high reliability; low visible UX impact.**

**Current evidence:** the actual `tsc -p tsconfig.server.json --listFilesOnly` output excludes `server/index.js`, `server/projects.js` and `server/reuse-check.js`. `portable-assets.js`, `library-store.js` and `features/website.mjs` are included transitively. The graph makes these gaps consequential: index has 39 neighboring modules; projects has 15.

**Change:** include the request handlers, installation planner and reuse-check contracts in checkJs. Type request/response boundaries and expected storage shapes without blanket suppressions. Expand incrementally so existing passing checks remain useful.

**Acceptance:** those files appear in the compiler input list; malformed readiness requests and installation records fail validation; mismatched client/server fields fail CI.

### 5. Reduce risk in the installation modules

**Impact: high maintainability.**

**Current evidence:** `server/projects.js` is 1,351 lines with 15 neighboring modules, and `src/Projects.tsx` is 1,234 lines with 12. They combine destination selection, analysis, review, integration, demo launch, receipts and undo. `src/App.tsx` is 775 lines with 31 neighbors. These counts are current source/graph measurements, not automatic failure thresholds.

**Change:** first extract the installation review and receipt UI from Projects, then isolate React/native planning from the common apply/undo transaction. Keep the current source-review approval and guarded rollback behavior. Avoid a wholesale rewrite or extra framework.

**Acceptance:** integration plans are unchanged for fixture projects; edited destination files still block stale installs and unsafe undo; React and native planning failures remain separate from application startup.

### 6. Validate the product with unaided users and another Mac

**Impact: release gate.** The current docs explicitly leave newcomer success, independent Mac installation, signed distribution and native-device runtimes as separate validation gates. Graph connectivity and automated test counts cannot close them.

**Change:** run a small formative usability test with five target React developers. Give them the signed installer and a task to capture a component, define an action, test it, install it into a supplied app and undo it. Include source blocking and a second project with a different theme. Record completion, time, help requests and wrong assumptions. Keep unsupported target frameworks visible during destination selection.

**Acceptance:** agree on targets before testing; aim for at least four of five participants completing the main task unaided, with no data loss or mistaken claim that a private backend was recovered. Five users are a usability signal, not proof of market demand.

## Recommended implementation order

1. Versioned readiness receipts and shared result contracts.
2. Variant/action/destination checks, preserving isolated defaults.
3. Session asset caching with measured capture latency.
4. Type-check the affected server boundaries.
5. Extract the installation review/receipt modules as those areas change.
6. Run newcomer and independent installation validation before another numerical rating.

The existing Library already has bounded package caching, per-item storage and image thumbnails. Rebuilding those again is lower value than completing the proof trail from capture to a working installed component.

## Verification and limitations

The Graphify reconciliation regression test covers retained concepts, parallel and reverse links, self-links, hyperedges, normalized paths, immutable inputs, idempotency and rejection of missing endpoints. The new test's formatting/lint checks passed. The map was opened in Chromium; search selected `checkReuse()` and displayed its actual source and neighbors. Theme controls worked.

The app's capture/install runtime suite and macOS package were not rerun for this analysis. Historical documentation and screenshot evidence were not promoted into new runtime claims. The extractor reported 27 code/config files without structural symbols, and does not model CSS bodies. Some dynamic relationships may be absent. Graphify's token benchmark is an estimate of text retrieval size, not a measured speed or quality improvement; host extraction-token usage was unavailable.
