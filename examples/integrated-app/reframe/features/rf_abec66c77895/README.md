# Community contacts

Generated from captured UI; action rules were reviewed and authored independently.

React + Vite, Node 24+. No added dependencies beyond the destination's React/Vite. Install through Reframe Projects to wire source, API and scripts. Run npm run reframe:dev (development) or npm run build && npm run reframe:start (production).

The API /api/reframe/rf_abec66c77895 provides GET state and POST declared actions. Data stays in .reframe/data/rf_abec66c77895.json. One local workspace, no multiuser authentication. Back up the data directory. No external-service or payment behavior is implied.

Persistent actions use schema validation, optimistic versions, idempotent request IDs and atomic writes. Supports 200 records and 10000 writes before migration. Generated feature data is not part of the clipboard bundle.
