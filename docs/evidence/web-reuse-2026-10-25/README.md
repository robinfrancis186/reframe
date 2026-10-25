# Web reuse verification · 25 October 2026

[← Verification history](../../VERIFICATION.md) · [Current web guide](../../WEB_WORKFLOW.md)

This is retained evidence from the local implementation session, not a remote CI result, public deployment or packaged-app certification.

## Automated checks

- [Complete 177-test log](tests.txt): all 177 passed, with zero failures or skipped tests. The suite took about 223 seconds on this Mac.
- The same session passed formatting, ESLint, client/server type checks and builds of the workbench and both web demos. Those commands were run separately; the 177-test log records the Node suite only.
- After the documentation refresh, formatting and the production build passed again, and the complete [fresh-profile capture-to-install test](new-user-flow.txt) passed in about 24 seconds.
- The verification command was subsequently reordered to build before tests, so production workflow tests do not depend on an existing `dist/` folder. The documentation refresh does not claim a second full-suite run.

Key executable checks remain in [web-components.test.js](../../../tests/web-components.test.js) and [new-user-flow.test.js](../../../tests/new-user-flow.test.js).

## Actual website capture

The built-in browser loaded RobinFrancis.in, picked its **Download CV** link, captured the rendered appearance and bundled PDF, and saved it to the Library. The app's source-blocked report checked desktop and phone rendering and verified the PDF. The live capture reported **96.2% measured match**; that score applies to this capture, not all websites.

![Actual Reframe editor with the captured CV component, copy controls and passing source-blocked report](../../images/reframe-web-reuse.png)

## Separate Go and Next.js apps

Both local hosts embedded the actual CV package and a separately authored newsletter. The newsletter validated input, saved a record through its backend and showed it after reload. Both hosts downloaded the bundled 80,412-byte CV. Browser interception blocked non-local requests; no external requests or page errors were observed.

- [Recorded results](framework-results.json)
- [Go host screenshot](go-embed.png)
- [Next.js host screenshot](nextjs-embed.png)

The framework check was an ad hoc local script; its summarized results and screenshots are retained here. The portable API/browser regressions are in the committed test files above. No Go or Next.js runtime is required to run those regression files.

## Limits

Cross-framework reuse is an iframe with an independently running Node backend. It does not generate native Go handlers or rewrite Next.js server code. The newsletter is a separate fixture, not a form recovered from RobinFrancis.in. Source-blocked checks do not establish email delivery, arbitrary private business logic, account security, public hosting or complete website fidelity. The macOS installer was not rebuilt in this session.
