<div align="center">
  <img src="desktop/icon.png" width="88" height="88" alt="Reframe icon" />
  <h1>Reframe</h1>
  <p><strong>Point. Pick. Make it work.</strong></p>
  <p>Turn a component you like on a website into a reusable, working part of your own web app.</p>
  <p>
    <a href="#quick-start">Get started</a> ·
    <a href="docs/WEB_WORKFLOW.md">First component</a> ·
    <a href="#what-works-today">Compatibility</a> ·
    <a href="docs/README.md">Documentation</a> ·
    <a href="CONTRIBUTING.md">Contribute</a>
  </p>
  <p><strong>Web focused</strong> · Local workspace · Optional OpenAI assistance</p>
</div>

![Reframe Home: browse a website, capture a screen or open your reusable component Library](docs/images/reframe-home.png)

## From inspiration to something you can use

You find a button, card or form you want in your own product. Reframe lets you pick it from the rendered website, keep its appearance and assets, define what it should do, and test the result before reuse.

**Browse & pick → Library → Build & test → Copy or install**

- **Pick from a real website.** The built-in browser renders JavaScript pages; an optional Chrome extension captures from your own browser.
- **Keep a reusable Library.** Save source evidence, styling, bundled assets and declared behavior together. Search, tag, organise and reopen components.
- **Make the component work.** Build supported actions, validation, APIs and local persistence. Add account or external-service requirements explicitly.
- **Check before reuse.** Compare appearance and review **Ready to reuse** for asset dependencies. Test supported assets with the source website blocked.
- **Use it in your project.** Copy a working web embed, download a standalone package, or review a direct React/Vite installation with guarded undo.

Reframe captures what the browser can observe. It independently builds the behavior you define; it does not recover another site's private backend or guarantee an exact copy of every interaction.

## Quick start

Requires **Node.js 24 and npm**. The web workbench runs on your own computer.

```sh
git clone https://github.com/robinfrancis186/reframe.git
cd reframe
npm ci
npx playwright install chromium
npm run dev
```

Open **[localhost:5173](http://localhost:5173)**. No OpenAI key is needed for ordinary website capture, Library operations or deterministic generation.

On Linux, use `npx playwright install --with-deps chromium` to install Chromium's system dependencies as well. Local OCR and macOS desktop packaging require macOS; these are separate from the web workflow.

**First try:** choose **Browse & pick**, enter a website URL and select a small component. Open it in the editor, review or define its behavior, test it, then save to **Library**. Choose **Prepare for my website → Copy component**, or **Fit & install → Use demo app** to try direct installation.

See the [step-by-step web guide](docs/WEB_WORKFLOW.md), including a first run without a project folder.

### Optional OpenAI assistance

Copy [`.env.example`](.env.example) to `.env`, add `OPENAI_API_KEY` locally and restart the server. You can also supply a key for a supported request in the app. AI actions are explicit; ordinary editing does not silently start paid requests. Keys are not included in component exports.

## What works today

| Your goal                                          | Supported route                                                              | Boundary                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Capture a React, Next.js, Go or other website      | Pick its rendered HTML/CSS in the built-in browser                           | Captures the browser result, not the original framework source                    |
| Reuse a working component in HTML or a Go template | Copy the HTML iframe embed                                                   | The component's Node backend runs separately                                      |
| Reuse in React or Next.js                          | Copy the JSX iframe embed                                                    | This is an embed, not a native framework rewrite                                  |
| Install source in a React/Vite app                 | Review files in **Projects**, install and test                               | Full working source installation is scoped to React/Vite                          |
| Run without Reframe                                | Download the standalone UI/backend ZIP and run `node start.mjs` with Node 24 | No `npm install` needed; public deployment is a separate step                     |
| Explore advanced tools                             | Open **Labs**                                                                | Agents, MCP, Gradio, native adapters and review tools have separate prerequisites |

Copied addresses are **local links**. Keep Reframe open while testing them. A public website needs a separately hosted component address, HTTPS and appropriate production identity/storage controls. Do not expose Reframe's local project-editing API publicly.

### A real website, tested

The 25 October 2026 local verification captured **Download CV from RobinFrancis.in**, saved it to the Library and tested its bundled **80,412-byte PDF** inside separate **Go and Next.js** apps with external requests blocked. A separately authored newsletter component saved records and retained them after reload in both hosts. A fresh-profile flow also covered direct React demo installation.

**177 automated tests passed**, alongside formatting, linting, client/server type checks and all three web builds. These are dated local results, not a claim that remote CI or a public release has passed.

[Verification history and evidence](docs/VERIFICATION.md) · [Capture-to-reuse screenshot](docs/images/reframe-web-reuse.png)

## Your workspace stays yours

The development Library lives in `.reframe/library/`, with individual revisions, shared assets and ten retained manifests. Metadata edits do not rewrite every component. Pending offline changes stay in IndexedDB. Backups, conflict recovery and guarded installation undo remain available.

`.env`, local Libraries, credentials and build artifacts are excluded from Git. The Chrome extension uses explicit pairing; it does not transfer your signed-in session into the isolated browser. Captured fonts, logos and artwork retain their owners' rights.

## macOS desktop

The repository includes an Electron build for **Apple Silicon** with bundled Node and Chromium:

```sh
npm run desktop:package
```

Build outputs are local under `out/`; the DMG is not committed to this repository. The current development distribution is **not Developer ID signed or notarized**. Desktop checks are separate from web-flow evidence, and the newest web changes require a fresh package build.

[Desktop configuration and release gates](docs/RELEASE.md)

## Development and documentation

```sh
npm run verify      # Formatting, lint, types, builds and automated tests
npm run benchmark   # Library benchmarks at 150 / 500 / 1,000 components
```

- [Documentation index](docs/README.md) — current guides and dated evidence.
- [Contributing](CONTRIBUTING.md) — setup, project layout and verification.
- [MCP connections](docs/CONNECTIONS.md) — scoped access for compatible assistants.
- [Architecture map](docs/architecture/graphify/README.md) — a dated, browsable Graphify snapshot.
- [Third-party notices](THIRD_PARTY_NOTICES.md) — Ponytail, REA, Graphify and other dependencies.

Ponytail supplies generation guidance, REA supplies static source analysis, and Graphify supplies optional code maps. The inaccessible Turnitout engine is **not bundled**; Reframe Copy Polish is an independently authored replacement. See the notices for exact scope and attribution.

Built by [Robin Francis](https://github.com/robinfrancis186). Reframe's current focus is a clear, testable web workflow; universal backend recovery, public multiuser hosting and verified Android/iOS runtimes are outside that scope.
