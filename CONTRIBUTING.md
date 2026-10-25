# Contributing to Reframe

The main product is a simple web workflow: **capture → Library → working component → reuse**. Prefer changes that make this easier to understand, more faithful or more reliable. Advanced experiments belong in Labs.

## Run locally

Use Node 24 and npm:

```sh
npm ci
npx playwright install chromium
npm run dev
```

On Linux, use `npx playwright install --with-deps chromium`. Open <http://localhost:5173>. Ordinary web capture does not need an OpenAI key. Optional configuration is documented in [`.env.example`](.env.example) and [the release guide](docs/RELEASE.md).

## Find the code

| Path                                             | Responsibility                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `src/`                                           | React workbench, Library, capture/editor workflow and project UI |
| `server/browser.js`, `server/browser-network.js` | Isolated browser and validated public-network requests           |
| `server/library-store.js`                        | Revisions, index, history and migration                          |
| `server/features/`                               | Canonical component clients, APIs and persistence                |
| `server/web-components.js`, `server/previews.js` | Portable working embeds and disposable previews                  |
| `server/projects.js`                             | Reviewed source installation and guarded undo                    |
| `tests/`                                         | Unit, API, migration and real-browser workflow checks            |
| `extension/`                                     | Explicitly paired Chrome picker                                  |
| `desktop/`                                       | Electron startup and local macOS packaging                       |
| `examples/`                                      | Owned demo applications                                          |
| `docs/`                                          | Guides, dated evidence and architecture snapshot                 |

## Verify your change

```sh
npm run verify
```

This checks formatting, ESLint and client/server types, builds the workbench and both demos, then runs the automated suite. Building first is required by tests that serve production `dist/` files.

For a focused iteration:

```sh
npm run build
npx node --test tests/web-components.test.js tests/new-user-flow.test.js
```

`npx node` selects the project's installed Node runtime after `npm ci`. Use the tests relevant to your change; a passing build alone does not establish runtime behavior. For user-facing changes, check 1280px and 390px layouts, keyboard use, errors and the complete affected workflow.

Tests that start the workbench use isolated temporary stores. For manual experiments, set an absolute `REFRAME_STORE` path to keep the development Library separate. Avoid real accounts or production API writes in fixtures.

## Keep changes reviewable

- Read callers before changing a shared capture/export/storage contract.
- Preserve user Libraries, history, metadata and guarded undo.
- Add a focused regression check for a non-trivial bug fix.
- Keep formatting-only changes separate from behavior changes where practical.
- State what was tested and which runtime, device or deployment was not checked.
- Update the web guide when labels, commands or compatibility boundaries change.

Do not commit `.env`, keys, `.reframe`, browser profiles or user captures. Use small controlled fixtures and licensed assets. Capturing a UI does not transfer rights to its artwork, fonts or private implementation.

## Report a problem or suggest a feature

Use the repository's issue templates. A useful bug report has a small reproduction, expected/actual behavior, OS/browser/Node versions and sanitized logs. For a feature, explain the user task and where the current capture-to-reuse flow stops working.

Do not put credentials or exploit details in a public issue. The workbench is local-only; public hosting requires the separate controls described in [Release scope](docs/RELEASE.md).
