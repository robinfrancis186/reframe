# Reframe

Collect UI from the web, keep it in your Library, and reuse it in your apps.

**The main flow:** Capture → Library → working preview → export or install.

## Run locally

Requires Node 24 and npm. From this project folder:

```sh
npm ci
npx playwright install chromium
npm run dev
```

Open [Reframe](http://localhost:5173). The workbench listens only on this computer.

OpenAI is optional. Add `OPENAI_API_KEY` to your local `.env` for AI features, or supply a key for one request in the app. Ordinary capture, Library operations and deterministic exports do not make paid model calls. AI-assist buttons explain what they send.

## First component

1. Choose **Capture → Browse & pick**, load a public website, and pick a button, card or section. Select a parent if you need a larger region.
2. Optionally measure desktop, tablet, phone, hover and keyboard-focus states in the isolated browser. Hidden, changed or ambiguous regions are reported.
3. Save to **Library**. Use **More options** to rename, tag or export, and **Filters & sort** to narrow the list; packages load only when opened. Image thumbnails keep the Library light.
4. Open the component and choose **Define behavior**. Pick what each button does, then **Build working component**. Try it with **Start working preview**, then **Save working component**. Inputs and sign-in are under settings; generated source remains available under **Code & runtime requirements**. Captures cannot recover private services.
5. Open **Export & code options** for downloads. Export **Faithful** React/CSS/HTML, or choose **Clean & responsive** in the editor's Code view. Clean mode uses semantic names and supported React interactions, with measured visual differences.
6. Choose **Fit & install → Use demo app**, choose **Review installation**, check the behavior and file summary, allow the listed changes, then **Install component**. Source comparisons remain available on demand. **Launch demo app** builds the actual destination and opens its UI and backend inside the receipt. No terminal is needed; demo records persist across restarts. You can also connect your own project folder and run it with its normal commands. Guarded undo remains available.

Source images can remain online. Captured fonts and artwork belong to their owners; use the bundled open fonts when appropriate. Faithful appearance, reconstructed interactions and backend integration have separate validation.

## Pick in Chrome

The optional [Reframe Picker extension](extension) can capture a component in your own browser session. Install the unpacked `extension/` folder from `chrome://extensions`, reload Reframe in Chrome, and use **Library → Pick from your own browser → Connect extension**. Confirm the local address. Click the extension or press **Alt+Shift+R**, pick an element, then press Enter.

The extension runs on a site only when you start it. Captures are sanitized; it does not transfer cookies or authentication sessions into the isolated browser. Chrome Web Store publication is pending.

## Data and recovery

The development Library lives in `.reframe/library/`: immutable component revisions, a small index, shared fonts/images and ten retained manifests. Existing v1 workspaces and histories migrate automatically; the original workspace is retained as `workspace.v1.backup.json`.

Renaming or tagging updates metadata, not the captured package. Unsynced edits stay in IndexedDB. Conflicting item edits can be kept as new components, without replacing the server version. **Back up** exports the complete Library; pending edits have a separate backup action. `.reframe` and `.env` are excluded from Git and desktop packages.

Agents, device capture, Gradio, standalone browser tests and assistant connections remain available in **Labs**. Their prerequisites and runtime limits remain explicit.

## macOS desktop

Open `out/make/Reframe-arm64-local-unsigned.dmg` and double-click **Reframe** to try it, or drag it to **Applications** for regular use. The first launch unpacks a private backend cache once per app version (about 280 MB). Opening from the DMG also caches the bundled runtimes (about 760 MB total); subsequent launches reuse them. Backend compilation is cached across restarts. Preparation has a visible startup screen, and a failed startup offers **Try again** and **Open diagnostic log**. The cache is separate from your Library; no administrator access or downloads are needed. The Apple Silicon build targets macOS 13 or newer; older macOS versions have not been runtime-tested here.

To rebuild the installer:

```sh
npm run desktop:package
```

This prepares an Apple Silicon `.app` with its own Node, Chromium and compiled macOS Vision OCR helper, then creates a DMG using macOS's `hdiutil`. Outputs are under `out/`; no terminal or global Node/Chrome/Swift installation is required to run the packaged app. Its Library is in macOS application user data, separate from the development project. Use **Library → saved-location details → Import an existing Reframe Library** to copy an existing project Library.

The current local package has a verified ad-hoc resource seal, but is **not Developer ID signed or notarized**. It is a development artifact, not a verified public release. Signing uses `MAC_SIGN_IDENTITY`; notarization additionally uses `APPLE_API_KEY`, `APPLE_API_KEY_ID` and `APPLE_API_ISSUER` in the build environment. Never put signing credentials in source control. Browser extension pairing is separate from installing the desktop app.

## Verify

```sh
npm run verify
npm run benchmark
node scripts/verify-desktop.mjs
```

Verification checks formatting, linting, client/server types, automated workflows and all three web builds. Benchmarks cover 150, 500 and 1,000 realistic captures; the report distinguishes JavaScript heap from browser-process memory.

See the [current release assessment](docs/RELEASE_ASSESSMENT_2026-10-23.md), [technical reference](docs/REFERENCE.md), [previous product audit](docs/PRODUCT_AUDIT_2026-10-22.md) and [verification history](docs/VERIFICATION.md). Public multiuser hosting and physical Android/iOS runtime validation are separate from this local macOS release.
