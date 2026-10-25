# Self-contained website components — 23 October 2026

Website packages now embed supported public raster images and CSS image resources, alongside existing bundled fonts and PDF downloads. The editor and installation review include a **Ready to reuse** report. Older website packages can use **Bundle supported assets**, review the result and save it to the Library.

The report separates asset inclusion, measured appearance, supported behavior and destination testing. **Test with source blocked** runs an isolated local rendering with all external requests blocked. It checks HTML image decoding and fonts at 1280px and 390px, and compares bundled PDF downloads against their saved bytes. Results are session-local and reset when the package changes; this is not a permanent certification of arbitrary business logic.

## Real RobinFrancis.in verification

Captured the live About card containing the portrait, biography and Download CV through Reframe's built-in browser. Saved and reopened the package, reviewed installation, installed it into a separate React demo and launched it.

- Fresh capture measured **99.6% fidelity** against its captured reference.
- Included **two portrait images** (light/dark variants) and **one PDF**; no remaining external resources in this component.
- A separate browser context explicitly rejected a fetch to RobinFrancis.in, then blocked every non-local request.
- Installed component images decoded on desktop, after reload and at 390px. No external requests or page errors came from the component during these checks.
- Download CV worked in all three checks. Each 80,412-byte PDF matched the source SHA-256: `f66a67fde98d60f0c361d1511da2b12a8eb66171fae257eae0f86a390d5d9483`.
- An older capture with two external images was upgraded using the actual UI button, saved and reopened. Both images remained embedded. The report had no page-level overflow at 390px.
- Added **Robin About · self-contained** to the main Library as a new item. All five existing Library summaries were unchanged; the count became six.

The installed demo is available while its local validation server runs at <http://127.0.0.1:52195/>. The main workspace runs at <http://localhost:5173/>.

## Checks and evidence

`npm run verify` passed: **168 tests**, formatting, ESLint, client/server type checks and all three production builds. New tests cover bundling, relative and cross-origin redirects, malicious data resources, private-network rejection, unsupported/oversized resources, changed asset revisions, both React export modes, and real Chromium checks with lazy images and PDF downloads.

The original evidence is local-only under `output/playwright/portable-robin/` (ignored by Git). See [the current committed web-reuse evidence](evidence/web-reuse-2026-10-25/README.md) for downloadable screenshots and results. Original local artifact names:

- Ready to reuse report — `output/playwright/portable-robin/report-desktop.png` (local-only)
- Phone-width report — `output/playwright/portable-robin/report-mobile.png` (local-only)
- Installed component — `output/playwright/portable-robin/installed-desktop.png` (local-only)
- Installed phone-width check — `output/playwright/portable-robin/installed-mobile.png` (local-only)
- Source-blocked report — `output/playwright/portable-robin/source-blocked-report.json` (local-only)
- Destination browser checks — `output/playwright/portable-robin/installed-check.log` (local-only)
- Complete verification log — `output/playwright/portable-robin/verify-final.log` (local-only)
- Importable single-component Library backup — `output/playwright/portable-robin/Reframe-Robin-Self-Contained.json` (local-only)

## Deliberate limits

- Only supported public raster resources are newly embedded. External SVG documents, unsupported formats, failed requests and oversized assets remain external and are reported. Requests use the existing public-network broker and do not inherit browser credentials.
- The isolated check verifies HTML images, fonts and PDF downloads. It does not prove CSS visual equivalence, external APIs, form delivery, authentication, custom business actions or destination integration. Those require their own tests. This Robin component has no form.
- The faithful component retains its captured layout. At phone width its embedded content can scroll internally; it is not claimed to be a newly responsive redesign.
- Source-blocked operation requires the destination application's local backend to serve its bundled PDF. This is not a service-worker/offline installation feature.
- No paid model call was needed. Native runtimes, macOS packaging, signing, another-Mac installation and newcomer validation were not repeated for this change.
