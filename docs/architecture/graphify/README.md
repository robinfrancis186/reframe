# Reframe architecture map

Snapshot of the reconciled Graphify map from 23 October 2026. It contains 2,231 nodes and 6,978 evidence links, including every previous node and relationship.

- **[Interactive map](graph.html):** download/open the HTML file locally, or serve this folder with `python3 -m http.server 5198` and open <http://localhost:5198/graph.html>. GitHub displays the source of HTML files. The viewer loads vis-network from its pinned CDN URL and needs internet for that script.
- **[Graph data](graph.json):** directed multigraph retaining parallel relationships.
- **[Graph report](GRAPH_REPORT.md):** current-code findings and coverage limits.
- **[Raw evidence ledger](evidence-ledger.json):** complete prior graph and original candidate extraction, preserving earlier attribute versions.
- **[App improvement priorities](../../GRAPHIFY_IMPROVEMENTS_2026-10-23.md):** recommendations, source evidence and acceptance tests.

`Retained ·` means historical evidence. `Reference ·` records a referenced endpoint without an analyzed definition. These labels do not prove current behavior. The HTML presents a simpler connection view; the JSON retains the full relationship evidence. This is a dated snapshot, not a live validation of subsequent commits.

Working caches and local Graphify output remain ignored. The reconciliation helper is at `scripts/reconcile-graphify.py`, with its regression test under `tests/graphify-reconcile.test.js`.
