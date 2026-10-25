# Third-party integrations

## Ponytail

Source: https://github.com/DietrichGebert/ponytail
Inspected revision: `09c434ab73ca43761c5d8b0c5d341926c2fba710`.
Bundled policy: `vendor/ponytail/rules.md`; MIT copyright and license retained in `vendor/ponytail/LICENSE`.
Used as built-in generation instructions, not a standalone app or a deterministic code optimizer.
Verified on 2026-10-21: bundled policy Git blob SHA-1 `d64edd32265ba21cbf5270158f04e97d96925f27` matches the current upstream `skills/ponytail/SKILL.md`. Runtime status reports its SHA-256 and readability; package review adds local syntax/import checks inspired by the policy.

## REA

Source: https://github.com/morluto/rea
Inspected repository revision: `efab044f303ae3d957d977730bb1628063223236`.
Runtime dependency pinned to published `rea-agents@6.7.0`; npm's lockfile records package integrity independently of the inspected repository revision.
Local static JavaScript/TypeScript analysis is invoked by the app backend through the bundled package's CLI. Full feature reviews include `Component.tsx`, `server.mjs`, `native-server.mjs`, `runtime.mjs` and `feature.json`, with evidence IDs, file coverage, source hashes and upstream limitations retained. The user does not operate a separate REA interface. The source is written to a temporary directory, analyzed without execution, then removed. Swift/Java analysis, native decompilers and optional runtime instrumentation are not activated. Installed version 6.7.0 matches the upstream package version checked on 2026-10-21.
Evidence guidance is bundled in `vendor/rea/evidence-workflows.md`; MIT copyright and license retained in `vendor/rea/LICENSE`. The dependency ships its own third-party notices.

## Turnitout Humanizer — evaluated, not redistributed

Source: https://github.com/AhmadHassan-BTed/Turnitout-Humanizer
Inspected revision: `b2f95139d08dd674a192cdb91af32bc6222f1469`.
Its LICENSE is proprietary. On 2026-10-21 the user confirmed authorization to use it. Inspection showed the public repository contains documentation and the marketing website, not the engine. Its referenced `Turnitout-core` repository was inaccessible (404 on recheck). The user then requested our own implementation. Reframe Copy Polish is independently authored; no Turnitout code or documentation is distributed. It provides conservative UI, parsed JS/TS comments, TXT, Markdown, LaTeX and DOCX wording review with protected code, math and citation fields. It does not promise upstream feature parity, detector evasion or human authorship.

Other application dependencies are declared in package.json and pinned in package-lock.json. Their respective licenses remain in their packages.

## Playwright / browser runtime

Playwright is an Apache-2.0 dependency used on the backend to render and inspect reference pages. Its version is pinned in package.json/package-lock.json. It is not shipped in the frontend bundle. Installed Google Chrome is preferred; Playwright Chromium can be installed separately. Browser binaries retain their respective licenses. Remote website content belongs to its respective owners.

## Local OCR, document archives and native starters

Local reconstruction uses Apple Vision and ImageIO through a small independently authored Swift helper; Apple frameworks remain system dependencies. DOCX archive handling uses MIT-licensed `fflate@0.8.3` on the server. The Android starter includes the official Apache-2.0 Gradle 8.13 wrapper, with its wrapper checksum and distribution checksum verified from services.gradle.org, and references Android/Kotlin/AndroidX artifacts under their respective licenses. No Android SDK, emulator image or Xcode installation was performed. Native platform runtime testing was explicitly deferred by the user.

## BeUI — design research reference

Reference: https://beui.dev/ and https://github.com/starc007/ui-components . The public free catalog has an MIT license (copyright 2026 Saurabh Chauhan); Pro has separate commercial terms. Reframe Originals is independently authored React source based on common UI interaction patterns. No BeUI source, paid component code, branding or assets are bundled. Reframe does not claim ownership of BeUI's library.

Reframe's 2026-10-21 public-family survey is recorded in `src/library/inspiration.json` (108 named families). Catalog names and links identify design references. Source implementations, grouped behavior adapters and native ports were authored independently. Family coverage does not claim complete feature/animation parity with BeUI or ownership of its code and assets.

## Gradio and original agent portraits

Gradio (https://github.com/gradio-app/gradio) is Apache-2.0 licensed. The optional local Python runtime is pinned to Gradio 6.30.0 in server/gradio-requirements.txt; its dependencies keep their respective licenses in the local environment. The user-supplied Hugging Face Gradio skill is retained in vendor/gradio/SKILL.md as a selectively loaded instruction resource. The in-app lab and public-feature Python adapter are independently authored using Gradio Blocks and documented event APIs. No hosted Hugging Face Space or model is implied.

The 24 framework guidance packs link to official documentation and are authored instructions, not copies of documentation or trained model weights. Six original agent portraits were generated with the built-in image tool using the user's supplied image as a style reference; no pictured brand's logo or character was copied. Prompts and asset paths are recorded in docs/AGENT-ART.md.

## Graphify and Model Context Protocol

Graphify (`graphifyy` 0.9.93) is an optional local Python tool, verified against PyPI on 2026-10-22 and invoked for AST source graphs without executing supplied code or using an LLM. Upstream project: https://github.com/Graphify-Labs/graphify ; PyPI declares Apache-2.0. Its package environment remains external to this repository. The Codex host skill was refreshed after updating the tool.

The official `@modelcontextprotocol/sdk` 1.32.1 is used for Streamable HTTP and stdio interoperability. Its MIT license and dependency notices remain in its installed npm package. No third-party assistant brand affiliation or universal product compatibility is implied.

## Bundled open fonts

`public/fonts/` redistributes the Latin variable-weight WOFF2 files of Inter, DM Sans, Manrope, Space Grotesk, Playfair Display, Lora, Fraunces and JetBrains Mono, taken from the Fontsource 5.3.0 `@fontsource-variable/*` npm packages. Each family is licensed under the SIL Open Font License 1.1; its copyright notice and full licence text ship beside the files as `OFL.txt`. Reserved Font Names (for example "Lora" and "Playfair Display") apply to modified versions. Fonts captured from websites are not redistributed by Reframe; they stay in the user's local browser storage as references.
