# macOS rebuild verification — 25 October 2026

The final delivery is local at `out/make/Reframe-arm64-local-unsigned.dmg` (Apple Silicon, 408,271,066 bytes). SHA-256:

```text
0cf3f97023bc2302d4e17121c386f7273dc7531bc7a8f18af44f888f739b5f72
```

The artifact is not committed. Its [archive inspection](final-artifact.json) confirms body-parser 2.4.0, Zod 4.6.7, the compiled demo receipt fix, and exclusion of environment/workspace folders. The local ad-hoc resource seal passes `codesign --verify --deep --strict`; this is not Developer ID signing or notarization.

## Final artifact results

| Launch | First Home | Restart Home | Complete automated workflow |
| --- | ---: | ---: | ---: |
| Read-only mounted DMG, Playwright Electron | 16.4 s | 3.2 s | 57.1 s |
| Copied app outside project, Playwright Electron | 13.7 s | 2.6 s | 54.1 s |
| DMG through macOS Launch Services, no debugger | 11.8 s | 1.9 s | Home, empty Library, cache reuse and Quit checked |

Raw evidence: [DMG flow](final-dmg-flow.json), [copied-app flow](final-installed-flow.json), [normal macOS launches](final-finder-launch.json), [10 focused regressions](regressions.log), [installed components screenshot](final-dmg-installed-components.png).

The full workflows use fresh isolated stores/profiles and a system-only PATH. They:

1. Run bundled macOS OCR and capture an HTML form.
2. Define a real record-saving action and build the frontend/backend package.
3. Reject an empty required input and save a disposable preview record.
4. Save the package to Library, reopen it, review destination changes and install it.
5. Confirm the receipt points to the one-click launcher, then submit and reload the installed form.
6. Capture a second component from live example.com with bundled Chromium and install it beside the first.
7. Restart the app, confirm the installed record persists and preview-only data was excluded.
8. Stop the backend, recover through the app, retain Library/records and exercise the real Library import bridge (native folder selection stubbed).
9. Inspect sandbox/context isolation, confirm renderer Node access is absent, quit and verify all 16 observed owned processes and both servers close.

The normal macOS launches use `open -n -a` on the mounted app with an isolated `--user-data-dir`, no inspection or remote-debugging flags. Home was also observed through the native UI. A repeat uses the existing execution cache; both Quit checks verified the backend stopped.

## Reproduce

```sh
npm run desktop:package
hdiutil attach -readonly -nobrowse -mountpoint /Volumes/Reframe-test out/make/Reframe-arm64-local-unsigned.dmg
codesign --verify --deep --strict /Volumes/Reframe-test/Reframe.app
node scripts/verify-desktop.mjs /Volumes/Reframe-test/Reframe.app/Contents/MacOS/Reframe
hdiutil detach /Volumes/Reframe-test
```

`scripts/verify-desktop.mjs` accepts either a mounted or copied app executable. It creates disposable profiles/stores and does not import the user's Library or environment. It produces `/tmp/reframe-packaged-demo-flow.json` and screenshots. The test itself needs the checkout's Playwright dependency; the application is launched with only system tools in PATH and uses its bundled runtimes.

## Limits

These are fresh application profiles on this Mac, not rebooted machines. Earlier first-profile launches during this session took 37.2 seconds through Launch Services and 58.8 seconds with automation attached, before the receipt-only change. There was no startup-code optimization in this change, and the faster final measurements must not be interpreted as a guaranteed latency improvement.

Developer ID signing/notarization, installation on another Mac, independent newcomer usability, physical camera capture and live OpenAI calls were not checked. The tested backend is an explicitly defined local form action; it does not recover a source site's private business logic or send real email.
