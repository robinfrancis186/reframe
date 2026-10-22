# Release scope

Reframe is a single-user local workbench. Run `npm ci`, `npm run verify`, then `npm start` and open `http://localhost:5173`. Node 24.11.1 is the pinned development runtime. `/api/health` is the lightweight readiness endpoint; `/api/status` checks optional engines. The server binds to loopback, validates Host/Origin/fetch metadata, prevents framing, and marks API responses `no-store`.

See [external assistant MCP connections](CONNECTIONS.md), [toolchain versions](TOOLCHAIN.md) and the [UI refresh specification](design/REFRESH.md).

## Configuration and data

- Set `OPENAI_API_KEY` in the ignored local `.env`; keep that file private. `OPENAI_DECISION_MODEL` selects the existing structured decision model, falling back to `OPENAI_MODEL` then `gpt-4.1-mini`. The browser sees configuration status, never the server key. Per-request keys can be supplied instead and are cleared after use.
- OpenAI suggestions send bounded visible-source signals and component metadata, not entire project files or runtime records. Agent questions send bounded visible capture text. Requests use `store:false`, strict structured output, fixed provider endpoints, timeout/response limits and at most two concurrent decisions. These controls do not change the provider's account-level data policies or billing.
- Clipboard data stays in the browser's origin storage. Use the existing clipboard JSON backup before changing browsers or clearing site data. Connected project registry, plans, undo journals, MCP connection hashes and the explicitly shared inbox live in `.reframe/`. Feature records/accounts/key vaults live in each destination's `.reframe/data/`; preserve them through upgrades. Never include these directories, `.env`, browser profiles or credentials in distribution archives.
- Installation remains explicit: choose a component → screen/container → actual fit → source review/acknowledgement → apply. A model cannot choose arbitrary destination source files. User-started working previews recompile supported contracts into trusted source; imported executable bundle files are ignored. Undo refuses to overwrite later edits. Provider failures are visible; Local matching is an explicit separate choice.

## Disposable preview scope

Working previews run canonical UI and backend code in a separate loopback process with isolated temporary data and a restricted environment. Browser CSP limits subresources and framing; the backend rejects foreign origins and credential writes. External calls and generated navigation are disabled. This is not an OS/container sandbox for arbitrary code. Three sessions maximum, one build at a time, 30-minute expiry, stop/unmount cleanup. A forced crash can leave disposable files under `.reframe/previews/`; use nonsensitive test data. Preview verification is separate from destination and native validation.

## Release checks

`npm run verify` runs TypeScript, Node tests and builds the workbench plus both web demos. The GitHub workflow runs this on macOS with a pinned Node version and official actions pinned to commits. The workflow is supplied but must run in the destination GitHub repository before claiming CI passed. Dependency audit is a separate gate; a clean audit is not a full security assessment.

Before handing over a release, test live OpenAI suggestions, agent help, selected component installation and the component's real behavior in the demo. Check 1280px and 390px layouts, console errors, clipboard retention, primary capture/export flows and API validation. Generated controls with sample data still need binding to the destination's real domain data. Source and AI relevance scores are estimates, not runtime verification.

## Remaining platform and hosting gates

Android/iOS source and fixture flows are supported; SDK builds and real device/simulator tests remain pending by the user's existing choice. Local macOS execution of shared SwiftUI does not prove iOS runtime behavior. Optional Gradio needs its Python environment; local OCR needs macOS Vision/Swift tools.

This release is **not a public multiuser SaaS deployment**. Keep loopback binding. Public hosting requires a separate authenticated control plane with project ownership/authorization, isolated worker/filesystem access, HTTPS, managed secrets and transactional storage, abuse/spend controls and an identity lifecycle. The generated feature accounts do not provide workspace authorization, email verification, recovery, MFA or team roles. Do not expose the local project-editing API through a public reverse proxy.
