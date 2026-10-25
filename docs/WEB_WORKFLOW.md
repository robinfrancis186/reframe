# Your first working web component

[← Reframe](../README.md) · [All documentation](README.md)

Start with one small button, card or form. You do not need an API key, a destination project folder or a native development toolchain for the basic workflow.

## 1. Pick from a website

1. Run Reframe and open <http://localhost:5173>.
2. Choose **Browse & pick**, enter a public website address and press **Go**.
3. Turn on **Pick element** and click the part you want. Use **Select parent container** if a label was selected instead of its whole button or card.
4. Choose **Open in editor**. The capture retains the rendered appearance and evidence; supported assets can be bundled with its website package.

Source framework does not determine capture compatibility: Reframe reads the rendered page. It does not download the site's React project, Go server or private API implementation. Sites that block browser access, inaccessible resources and unsupported controls can still limit capture.

Optional viewport/state measurement runs in Reframe's isolated browser. Extension captures retain their actual viewport; additional measurements need an explicit capture session. Your signed-in Chrome session is not transferred.

## 2. Make the behavior explicit

If the capture already includes supported navigation, bundled downloads or authored form behavior, choose **Review included behavior**. Otherwise choose **Define behavior**:

1. Select what each control should do: save a record, remember an on/off choice, add to a count, open a page or show information.
2. Review required inputs, validation and any account or external-service requirements.
3. Choose **Build working component**.
4. Start a **working preview**. Try an empty/invalid submission as well as a valid one, then reload to check persistence.
5. Choose **Save working component** and save it to **Library**.

A form receipt saved locally is not an email delivery. A cart is not a payment system. If your action needs a service, define its contract and configure it explicitly. Unknown business logic must be specified rather than replaced with a success message.

Working previews use disposable data. Installed apps and prepared web components have separate stores; preview test records are not copied into them.

## 3. Check Ready to reuse

Open **Ready to reuse** in the editor:

- **Assets included** tells you whether the supported images, backgrounds, fonts and PDFs are bundled. External, failed or oversized resources remain listed.
- **Appearance** shows measured fidelity when available. A visual score does not establish backend correctness.
- **Test with source blocked** checks images/fonts at desktop and phone widths and verifies bundled PDF bytes with external requests blocked.

For an older capture, use **Bundle supported assets**, review the result and save it again. Custom actions, external services and destination integration need their own tests. Permission to reuse the captured artwork and fonts remains your responsibility.

## 4. Choose how to use it

### Copy into a website

Choose **Prepare for my website**. Reframe builds the canonical frontend and backend, then gives you:

- **HTML, Go or another website** — an HTML iframe for a page/template or builder that accepts custom HTML.
- **React or Next.js** — the same iframe with valid JSX style syntax.
- **Try working component** — open the running component before copying.
- **Copy component** — copy the selected snippet.

The embed width fills its container. Captured website components use their saved height; other working packages use a default height that can be adjusted in the pasted snippet. Embedding isolates the component's styling; it does not rewrite the destination's framework or backend.

For account flows, use the same hostname on both sides, such as `127.0.0.1` for both your app and the component. Do not mix it with `localhost` during these local tests.

**The generated address is local.** Keep Reframe open while using it. A public page cannot rely on a visitor having your local component server running.

### Try installation without your own project

Choose **Fit & install → Use demo app**:

1. Choose **Review installation**.
2. Read the behavior and file summary, then allow the listed changes.
3. Choose **Install component → Launch demo app**.
4. Test the component in the actual demo and reload it to confirm saved behavior.

This launches the owned React/Vite demo from the app; no terminal is needed after Reframe is running. Direct full working source installation in your own project is currently scoped to React/Vite. Guarded undo refuses to overwrite later edits.

### Run independently

Choose **Download standalone package**, unzip it and run:

```sh
node start.mjs
```

Requires Node 24. No Reframe installation or `npm install` is needed. The package includes compiled frontend assets, canonical backend code and the declared feature contract. Saved accounts, API keys and existing records are excluded. New data is stored in the extracted folder's `.reframe/data/`.

The default port is 5175. If it is occupied, use a free port, for example `PORT=5180 node start.mjs`, and update your pasted iframe address to match. The local server permits loopback embedding; public hosting needs an explicit production deployment, allowed origins, identity and durable storage. It is not a hosted service or an arbitrary-code sandbox.

## Optional AI assistance

Ordinary capture, Library operations and deterministic generation work without a model. Explicit OpenAI actions can help with suggestions, decisions or screenshot reconstruction. Set a server key in `.env` using [the example configuration](../.env.example), or enter a key for a supported request in the app. AI requests have provider costs and send the selected context described by that action.

## If something goes wrong

| Symptom                                | What to try                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Only a label or small box was captured | Pick again and use **Select parent container**; inspect the captured reference before building              |
| A button looks right but does nothing  | Review/define behavior and test a working preview; the visual reference alone does not run source scripts   |
| Images or a PDF depend on the source   | Review **Ready to reuse**, bundle supported assets and repeat the source-blocked check                      |
| The copied component stops loading     | Keep Reframe open, prepare it again if its process stopped, and replace the old local URL                   |
| A form saves but sends no email        | Local persistence is its current behavior; configure a reviewed external service to deliver messages        |
| Port 5173 is occupied                  | Start Reframe with `PORT=5183 npm run dev` and open that address                                            |
| Chrome extension reports no capture    | Choose **Connect again**, confirm the current Reframe address, then pick and **Save to Reframe**            |
| A website cannot be loaded             | Check its public address and access restrictions; try the extension in an authorized session or import HTML |

For an issue report, include the expected result, actual result, platform, reproduction steps and a sanitized screenshot. See [Contributing](../CONTRIBUTING.md).
