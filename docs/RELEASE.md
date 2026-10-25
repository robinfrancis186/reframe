# Release scope

Reframe is a single-user local workbench. Run `npm ci`, install Chromium with `npx playwright install chromium`, run `npm run verify`, then `npm start` and open `http://localhost:5173`. Node 24.11.1 is the pinned development runtime. `/api/health` is the lightweight readiness endpoint; `/api/status` checks optional engines. The server binds to loopback, validates Host/Origin/fetch metadata, prevents framing, and marks API responses `no-store`.

See [external assistant MCP connections](CONNECTIONS.md), [toolchain versions](TOOLCHAIN.md) and the [UI refresh specification](design/REFRESH.md).

## Configuration and data

- Set `OPENAI_API_KEY` in the ignored local `.env`; keep that file private. `OPENAI_DECISION_MODEL` selects the existing structured decision model, falling back to `OPENAI_MODEL` then `gpt-4.1-mini`. The browser sees configuration status, never the server key. Per-request keys can be supplied instead and are cleared after use.
- OpenAI suggestions send bounded visible-source signals and component metadata, not entire project files or runtime records. Agent questions send bounded visible capture text. Requests use `store:false`, strict structured output, fixed provider endpoints, timeout/response limits and at most two concurrent decisions. These controls do not change the provider's account-level data policies or billing.
- Library packages and revisions live in `.reframe/library/`; pending individual operations stay in IndexedDB until synchronized. Use Library **Back up** and the separate pending-edits backup before changing machines or clearing browser data. The last ten manifests and migration backups support recovery. Connected project registry, plans, undo journals, MCP connection hashes and the explicitly shared inbox live in `.reframe/`. Feature records/accounts/key vaults live in each destination's `.reframe/data/`; preserve them through upgrades. Never include these directories, `.env`, browser profiles or credentials in distribution archives.
- Installation remains explicit: choose a component → screen/container → actual fit → source review/acknowledgement → apply. A model cannot choose arbitrary destination source files. User-started working previews recompile supported contracts into trusted source; imported executable bundle files are ignored. Undo refuses to overwrite later edits. Provider failures are visible; Local matching is an explicit separate choice.

## Portable working web components

**Prepare for my website** compiles a canonical frontend/backend package and starts it on loopback. HTML or JSX iframe snippets work in an existing page without translating its framework. Reframe allows up to three running web-component sessions and serializes builds. Re-preparing a feature replaces its running process; the old local link must be updated. **Stop local component** is under **What is included?**. Closing Reframe stops its owned component processes.

Prepared component data lives under `.reframe/web-components/<feature-id>/.reframe/data/`, separate from disposable previews and installed demos. The standalone ZIP excludes records, accounts, saved credentials and `.env`. It includes compiled frontend assets, canonical server/runtime files and the declared feature contract. It runs with Node 24 and no Reframe or npm install. Local framing is permitted only from loopback addresses; a public deployment requires its own configuration and production services. These processes are not a sandbox for arbitrary imported source code.

Direct working source installation remains scoped to React/Vite. Other web frameworks use the embed, not a native rewrite of their backend. See [the web workflow](WEB_WORKFLOW.md).

## Desktop packaging

On an Apple Silicon Mac with the Xcode command-line tools, run `npm run desktop:package`. Electron Forge and the local preparation scripts produce an `.app` and `out/make/Reframe-arm64-local-unsigned.dmg`, with bundled Node, Chromium and the macOS Vision OCR helper. Binaries are local build artifacts; this repository does not provide a verified signed download.

The desktop app keeps data in its user-data directory, separate from the development `.reframe/` folder. Existing project Libraries can be explicitly imported from the Library's saved-location details. First launch prepares a private runtime cache; later launches reuse it. Consult the dated [verification history](VERIFICATION.md) for measured startup checks and remaining validation gates. New source changes require rebuilding the package.

Developer ID signing uses `MAC_SIGN_IDENTITY`. Notarization additionally uses `APPLE_API_KEY`, `APPLE_API_KEY_ID` and `APPLE_API_ISSUER` in the build environment. The unsigned local artifact is not a verified public distribution. Signing, notarization and installation on another Mac remain separate checks.

## Disposable preview scope

Working previews run canonical UI and backend code in a separate loopback process with isolated temporary data and a restricted environment. Browser CSP limits subresources and framing; the backend rejects foreign origins and credential writes. External calls and generated navigation are disabled. This is not an OS/container sandbox for arbitrary code. Three sessions maximum, one build at a time, 30-minute expiry, stop/unmount cleanup. A forced crash can leave disposable files under `.reframe/previews/`; use nonsensitive test data. Preview verification is separate from destination and native validation.

## Release checks

`npm run verify` checks formatting, ESLint and client/server types, builds the workbench plus both web demos, then runs the Node suite. Building before tests is required for fresh checkouts because production workflow tests serve `dist/`. The GitHub workflow runs this on macOS with a pinned Node version and official actions pinned to commits. The workflow is supplied but must run in the destination GitHub repository before claiming CI passed. Dependency audit is a separate gate; a clean audit is not a full security assessment.

Before handing over a release, test live OpenAI suggestions, agent help, selected component installation and the component's real behavior in the demo. Check 1280px and 390px layouts, console errors, clipboard retention, primary capture/export flows and API validation. Generated controls with sample data still need binding to the destination's real domain data. Source and AI relevance scores are estimates, not runtime verification.

## Remaining platform and hosting gates

Android/iOS source and fixture flows are supported; SDK builds and real device/simulator tests remain pending by the user's existing choice. Local macOS execution of shared SwiftUI does not prove iOS runtime behavior. Optional Gradio needs its Python environment; local OCR needs macOS Vision/Swift tools.

This release is **not a public multiuser SaaS deployment**. Keep loopback binding. Public hosting requires a separate authenticated control plane with project ownership/authorization, isolated worker/filesystem access, HTTPS, managed secrets and transactional storage, abuse/spend controls and an identity lifecycle. The generated feature accounts do not provide workspace authorization, email verification, recovery, MFA or team roles. Do not expose the local project-editing API through a public reverse proxy.
