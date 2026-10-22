# Reframe product and usability audit — 22 October 2026

## Follow-up implementation: confidence before installation

The local React workflow is materially stronger after this pass. My scoped expert assessment is **approximately 8.5/10**, not a claim of a 9.5/10 overall product. Native readiness, public multiuser hosting and adoption evidence have not improved merely because web tests pass.

| Area changed | Earlier rating | Follow-up assessment | Evidence / limit |
|---|---:|---:|---|
| Test before installation | Missing | 8.5 | Real generated UI/backend in separate disposable process; reload/reset/stop, mobile view and explicit Playwright assertions. External services are deliberately disabled. |
| Working frontend/backend packages | 7 | 8.5 | Canonical source is exercised before installation; original imported code is ignored; form-safe controls. Destination contracts still need testing. |
| Real project-data reuse | Partial | 8 | Search/table accept host props; recognized in-scope arrays and search callback can be connected through the installer. Complex/imported sources require manual props. |
| Journey clarity | 8 | 9 | Define behavior → test → save together → fit/install, with an explicit test handoff. |
| Performance / recovery | 7 | 8.5 | Heavy screens load on demand; initial JS about 19% smaller, no large-main-chunk warning, reload recovery boundary. Not a measured end-user speed benchmark. |
| Native readiness | 4 | 4 | Runtime verification remains pending. |
| Public multiuser release | 2 | 2 | Local workbench remains local; previews do not provide SaaS workspace authorization or tenant isolation. |

Implemented source and behavior checks cover bindings, lexical scope, malicious binding rejection, generated props, apply/undo, disposable storage, canonical recompilation, origin/host checks, credential refusal and form-safe controls. The in-app Playwright newsletter run passed four mobile assertions with no browser errors. Haven receives an app-owned resource array and returns selected values to app state; live UI verification added and selected a new resource. Existing feature records/accounts were not modified by these tests.

A defensible **9.5 target** still requires real-developer task testing, full keyboard/screen-reader review, broader live data adapters, native runtime evidence for native claims, and a separately designed hosted control plane for public multiuser claims. Proposed adoption gate: at least 9 of 10 representative developers complete capture → behavior → preview → install unaided, with no critical data-loss or security defects. This is a proposed product gate, not a measured result.

## Product verdict (initial audit)

**Useful developer workbench; not yet a general-purpose, public consumer product.** The strongest job is: “I saw a useful UI pattern; help me rebuild a small, understandable version in my existing app, with its behavior, project styling and an undoable source change.”

The combination of source picking, a reusable clipboard, declared frontend/backend packages, project-fit evidence and local MCP access is worth developing. More capture formats and more agent characters do not by themselves make the main task easier. The immediate adoption constraint is confidence in the result: users must know what was captured, what was inferred, what they still need to specify, and whether it actually runs.

My expert assessment is **6/10 before these workflow changes, approximately 7/10 afterward for a local React developer workflow**. These are judgment scores, not customer ratings, measured conversion rates or proof of market demand. Public SaaS readiness and native runtime readiness remain substantially lower. No customer interviews, willingness-to-pay study, competitor account trials or longitudinal retention study were conducted.

Recommended product promise:

> Turn a UI reference into a reusable component for your existing app. Define the behavior, adapt the branding, review the source, and test the result.

Avoid promising recovery of an arbitrary app’s private backend or business rules. A screenshot, video or public DOM cannot supply those. The app implements supported behavior contracts and independent backends; it does not recover an original proprietary implementation.

## Who should use it

| User | Useful task | Fit today | Main obstacle |
|---|---|---|---|
| Indie React developer | Reuse a card, form, list or small product flow in an existing Vite app | Strongest initial audience | Wants confidence that generated code is understandable and easy to remove |
| Agency or internal product engineer | Bring references into an established brand and review a small source change | Promising | Needs actual design-system component reuse, stronger diffs and team workflow |
| Designer or product manager with an engineering partner | Explain a desired interaction and hand over a component package | Useful with assistance | Local paths, screen/container choices and launch commands require development knowledge |
| Native developer | Generate or port a simple SwiftUI/Compose interface and API client | Experimental | Real SDK/device verification is pending; advanced web motion and commerce do not have equivalent native support |
| Nontechnical user expecting “copy any app” | Copy an entire app, authentication and backend from its screen | Poor fit today | The promise exceeds available evidence and installation support |

Start with one excellent web journey and a small set of working interaction types. Keep the other formats available as optional entry points. Do not make every beginner choose between six agents, 24 guidance packs and three engines before installing one component.

## Audit method and evidence boundaries

Reviewed the current running app on localhost:5173, Haven on localhost:5175, navigation and state ownership, capture/reconstruction, feature compilation, installation/undo, engine evidence, API/auth contracts, tests and release scope. Fresh screenshots were taken **before** the changes and inspected, rather than using old screenshots as proof of the current product.

Current-run evidence folder: `/Users/robinfrancis/.codex/visualizations/2026/10/22/reframe-product-audit/`.

- 01: Home; 02: saved library; 03: integration; 04: agents; 05: review tools; 06: connections.
- 07: canvas and feature builder; 08: native availability; 09: reference browser; 10: Originals.
- 11: branding; 12: reconstruction dialog; 13: framework guidance; 14: Gradio availability.
- 15 onward: updated workflow, filtered clipboard, installed suggestion and responsive checks.

The automated suite exercises parsers, trust boundaries, APIs, generation and source insertion with fixtures. It does not prove every public website, every Original interaction, every external API, physical camera capture or native device behavior. Current machine reports no connected native devices. No new simulator/SDK setup was performed, following the existing decision to leave runtime testing pending.

## Ratings by product area

Ratings assess task usefulness, discoverability, completion and trust on a ten-point expert scale. “After” is a targeted reassessment of changes made here, not a claim that the entire area was rebuilt. Unchanged scores explicitly retain existing limitations.

| Area | Before | After | Finding and next improvement |
|---|---:|---:|---|
| Product purpose and promise | 6 | 7 | Useful small-component job; use the narrower promise above and validate it with real developers |
| Home and first-use orientation | 6 | 8 | Restored visual design is coherent; added a short first-component guide and resume action |
| Main navigation | 7 | 7 | Five groups are manageable; keep the existing consolidation and avoid adding audit/settings dashboards |
| URL / HTML capture | 7 | 7 | Good low-friction structure extraction; styles/scripts are intentionally removed, so do not imply pixel equivalence |
| In-app browser and picking | 7 | 7 | Real rendered source picking and reference image; constrained read-only sessions exclude logins, POST flows and some sites |
| Screenshot reconstruction | 6 | 6 | Useful reference input; layout/roles are inference, model/OCR quality varies; needs a stronger compare-and-correct loop |
| Video and camera | 5 | 5 | Selected frames give visual evidence; neither continuous interaction understanding nor hidden workflow recovery is proven |
| Android/iOS capture and generation | 4 | 4 | Hierarchy/screenshot and source paths exist; SDK and real runtime tests remain pending |
| Canvas and source identity | 5 | 8 | Fixed unrelated starter source list after opening a saved capture; clearly label visual reference vs interactive preview |
| Behavior discovery / feature builder | 6 | 7 | Declared behavior is useful; journey links directly to the builder with focus/scroll handoff; arbitrary domain rules still need input |
| Working UI + API + storage packages | 7 | 7 | Real portable packages and validation; package existence alone does not mean runtime or production verification |
| Product options / cart | 7 | 7 | Own prices, stock, cart and durable demo orders; one local shared cart, no payments, shipment or native product client |
| Authentication | 6 | 6 | Local generated accounts, sessions and isolation tests exist; identity recovery, MFA and public hosting are separate work |
| External APIs / user API keys | 6 | 6 | Explicit destinations and encrypted server storage are useful; arbitrary APIs require a known contract and live provider tests |
| Clipboard discovery / reuse | 6 | 8 | Added reference/UI/backend filters, counts, source search, reset and direct Fit & install handoff |
| Clipboard backup / import | 7 | 7 | Existing portable JSON, canonical validation and sanitization; browser-local storage needs deliberate backups |
| Originals library | 7 | 7 | 114 discoverable patterns and platform source; some are sample-data UI patterns, not connected product features |
| Branding / theme adaptation | 7 | 8 | Evidence-based token extraction exists; move destination choice first and collapse detailed branding controls |
| Project-purpose recommendations | 6 | 8 | Retain live OpenAI project analysis; save purpose/goal per project; paid requests are explicit and local matching remains automatic |
| Fit / size / evidence | 7 | 7 | Useful explainable estimate and package size; cannot represent conversion, desirability, full accessibility or runtime performance |
| Destination context | 4 | 8 | Remember project, screen, container and branding preferences; re-read current source before fit/review, never restore an old source plan or acknowledgement |
| Source review and apply | 7 | 8 | Existing explicit review/undo is valuable; focus the source review and show a specific post-install testing handoff |
| Undo / history | 7 | 8 | Preserve edit-conflict refusal and user data; collapse long history so it does not dominate the primary flow |
| Agents / contextual help | 6 | 7 | Tips appear once per page per session and expire after eight seconds; specialist help stays available; characters are not proof of independent intelligence |
| REA / Ponytail / Graphify / copy review | 7 | 7 | Real bounded tools with explicit scope; no proof of perfect minimality, native decompilation or human authorship |
| Language/framework guidance | 6 | 6 | 24 useful guidance packs; guidance is not a compiler or installer for all languages |
| Gradio lab | 6 | 6 | Installed local Python lab is useful for experts; should remain secondary to the main journey |
| MCP / OpenAI connections | 7 | 7 | Scoped local tools, shared inbox and revocation; remote assistants need a supported secure local bridge |
| Responsive UI / keyboard clarity | 6 | 7 | Existing narrow layouts and labels; new controls wrap and receive focus; full assistive-technology audit remains outstanding |
| Dark/light appearance | 8 | 8 | Existing separate workbench toggle is useful; preserve separation from destination branding |
| Performance / perceived simplicity | 6 | 7 | Removed repeated paid calls during brief editing and hid secondary controls; large combined frontend remains a future profiling target |
| Public multiuser release | 2 | 2 | Local project-editing API must stay local; no SaaS control plane, workspace authorization or isolated execution service |

## Main user journeys and failure points

### 1. New user with a visual reference

1. Paste a public URL, use Browse & pick, or upload a reference.
2. Select and name one useful piece. Compare source appearance with the adapted preview.
3. Read its capability label. Define missing behavior if needed; the visual preview does not run the package’s API.
4. Save the whole item. The clipboard retains the reference, theme and behavior package together.
5. Choose a destination project/screen/container; inspect fit and requirements.
6. Review actual changed files and action contracts; apply explicitly.
7. Start/restart the destination; test positive, error, reload and narrow-screen cases.

Before: the source looked finished while its hidden behavior was still undefined; exports could accidentally omit a working package; installation stopped at a success sentence. After: the journey names these stages and explains what still needs testing. A fully embedded isolated working-package preview is still a valuable next step; it requires safe runtime lifecycle management, not executing captured scripts in the workbench.

### 2. Returning user reusing a component

Before: finding a backend package among visual references required opening cards; leaving Projects reset the destination. After: filter by package type, choose Fit & install directly, and return to the remembered destination and branding preferences. Screen targets are loaded again from current source; old plans and acknowledgement are intentionally not persisted.

### 3. User who knows the project but not the component

Choose a destination, describe audience/purpose and the gap, then request OpenAI suggestions or use automatic local matching. Relevance and compatibility are separate estimates. The live test suggested Searchable list at **95/100 AI relevance**, but also detected similar existing controls. This is useful evidence to review, not a command to install another control blindly. The example was chosen to verify the workflow; its included project names are sample content.

### 4. External assistant user

Choose minimal MCP permissions, let the assistant capture/build/save to the shared inbox, review/import privately, then install through Projects. No assistant gets automatic arbitrary-folder writes. Keep the distinction between the shared inbox and browser-local clipboard visible. Remote reachability is not implied by a localhost URL.

## Market comparison — current official sources

This is a comparison of documented workflows, not a performance benchmark or endorsement of vendors’ marketing claims. Competitor paid accounts and generated output were not tested.

| Product | Documented strength | Pattern worth using in Reframe | Decision here |
|---|---|---|---|
| [v0 screenshot input](https://v0.app/docs/screenshots) | Screenshot input plus instructions about behavior and edge cases | Keep the visual reference and explicit behavior brief together | Clear reference/package labels and behavior handoff implemented; richer visual comparison remains next |
| [v0 design systems](https://v0.app/docs/design-systems-2) | Real components, tokens and consuming-app conventions as context | Existing project context should survive across work | Remember destination and project purpose; component-mapping is future work |
| [Builder Fusion](https://site.builder.io/fusion) | Existing code/design-system context, visual iteration, review/export/PR workflow | Begin from the destination; make review and handoff concrete | Destination first, collapsed branding, source-review focus and post-install instructions implemented |
| [Locofy CLI](https://www.locofy.ai/docs/plugin/export-and-deployment/cli-pull/) | Pull generated components into an existing codebase, preserve structure and refine | Individual-component reuse should lead directly to the destination | Direct clipboard handoff, retained conflict-aware review/undo; no unrelated CLI dependency added |
| [Magic Patterns](https://www.magicpatterns.com/docs/documentation/get-started/introduction) | Product-team prototypes with design-system context and engineering/MCP handoff | Organize around a product task rather than a catalog of tools | Persist project purpose, keep agents secondary to the main component journey |
| [html.to.design](https://html.to.design/docs/web-tab/) and [browser capture](https://html.to.design/docs/extension-tab/) | Clear URL capture versus browser-state capture paths, editable design output | Tell users which capture method fits and what it produces | Clearer capture/reference language; private-page extension is an optional future feature, not a bypass of browser restrictions |

Reframe should compete on a **small, inspectable component plus declared behavior that can move into existing code**, not on having more capture buttons than general app generators. Styling-token adaptation is already useful, but actual reuse of the destination’s own components is the next important engineering advantage to build.

## Findings fixed in this change

| Priority | Evidence / problem | Implemented correction |
|---|---|---|
| P1 | Canvas preview looks like a finished component even when it is only captured HTML (07) | Shared readiness classifier, explicit visual-reference explanation and full-package export beside visual export |
| P1 | No clear “what next?” after capture; behavior builder below the viewport (07) | Three-stage journey: define behavior, save together, fit/install; builder focus and scroll |
| P1 | Opening Apple from clipboard still shows unrelated starter items (07) | Source list follows the opened item; multi-element capture groups remain intact |
| P1 | Destination/screen context disappears on navigation (03) | Remember only selection identifiers; fetch fresh insertion points and recompute fit, with visible storage/unavailable-project errors |
| P1 | Goal edits automatically trigger paid OpenAI suggestions | Explicit OpenAI request; cancellation and stale-result handling; automatic local matching remains available |
| P2 | UI and backend packages mixed with captures in a long clipboard (02) | Counts, type filters, search, clear filters and direct installation handoff |
| P2 | Project branding precedes choosing a project, while history overwhelms the screen (03) | Destination first; branding and undo history progressively disclosed |
| P2 | Installation success has no next test action | Post-install receipt explains runtime still pending, launch command and task-specific checks |
| P2 | App is visually welcoming but offers no first-success guide or continuation (01) | Preserve the restored home; add a short guide and recent-component resume |
| P2 | Website capture initially selects global navigation ahead of useful page content | Prefer a content section when available; all source elements remain selectable |
| P2 | Agent tips stay over primary actions and recur when revisiting a page | Show each contextual tip once per session and auto-hide after eight seconds; keep the interactive launcher |
| P2 | An older async fit result could arrive after destination input changed | Ignore aborted fit responses; cancel insertion-point requests on context changes; invalidate reviewed plans when branding changes |

No new dependencies, broad redesign, external publication, changes to account secrets or replacement of existing clipboard/data were needed. Current-run fingerprints show eight existing root data files unchanged; the earlier eleven-file records/security snapshot also remains unchanged. One requested test component was added to the clipboard and demo, taking the clipboard from 17 to 18 items.

## Requirements and roadmap

### Keep as core requirements

- Pick one understandable component, preserve its source/evidence, and let users correct inferred intent.
- Move UI, declared behavior, required setup and backend together.
- Adapt to a real destination with clear source review, conflict protection and undo.
- Explain requirements, costs, unsupported targets and runtime-verification status at the point of use.
- Keep the reference path quick; make advanced engines and agents optional.

### Next engineering priorities

1. **Isolated working preview and behavioral acceptance tests.** Run trusted canonical packages in a bounded local preview process. Show UI/API failures without claiming that a green source-fit score is a passing test. Define input, action, expected state and reload checks per component. Do not run untrusted captured scripts.
2. **Destination component mapping and editable real data bindings.** Prefer an existing Button/Card/Form and actual domain entities over duplicating markup or installing sample-data controls. Preserve imports, providers and ownership. Start with React/Vite; one reliable adapter beats several incomplete ones. Original exports currently repeat shared library CSS; measure and deduplicate that cost when reusing many patterns. Current dependency checks do not prove that every CSS rule is necessary.
3. **Reference comparison with corrections.** Side-by-side source/adapted screenshots, explicit viewport/state, user-marked differences and visual regression baselines. A pixel-diff score should be separate from behavior and project-fit scores.
4. **Per-component versions and provenance.** Retain successive behavior/theme contracts, source URL/capture time and meaningful package diffs. Never label a newer generated package “tested” based on an older installation.
5. **Real native completion.** Build the current supported native fixtures with the SDKs, run device/simulator capture-to-install cases, validate network/security configuration, then widen support based on failures. Commerce is currently web-only.
6. **Release architecture before public hosting.** Authenticated workspace ownership, isolated project workers, transactional storage, identity lifecycle and encrypted managed secrets, HTTPS, quotas and spend controls. Preserve the current loopback guard until that work exists.

These items are **not claimed as implemented** by this audit. They are substantial product/runtime changes requiring their own verification. This change completes the high-impact workflow fixes rather than adding superficial switches that pretend to provide these capabilities.

### Optional only after validation

- Private-page browser extension with explicit user-selected captures and appropriate access boundaries.
- Team review / PR workflow, with component ownership and permission checks.
- Storybook fixtures and accessibility/visual regression exports.
- More native motion variants or additional backend languages only when users show demand.

Do not prioritize another mascot, generic chat tab, detector-evasion claims, more static component counts or automatic cloud deployment. None resolves the current confidence and integration bottleneck.

## How to decide whether people will use it

Recruit five React developers with existing projects and three designer/developer pairs. Observe, rather than guide, a task to capture one pattern, define behavior, save it, insert it into their project and make it pass a stated acceptance test. Compare time and corrections against their current copy/manual/AI workflow.

Record task completion without help, time to first working component, misunderstanding of reference vs behavior, manual edits after insertion, failed/undone installations and whether the same person reuses a package in another project within two weeks. Ask what they would pay only after they complete a real task. A reasonable proposed pilot gate is at least four of five developers completing the core web task without facilitator rescue and choosing to reuse it; this is a proposed target, not an observed result.

## Verification for this implementation

- `npm run verify`: TypeScript, **94 Node tests passed**, and all three web production builds passed. Two added tests cover readiness/filter/saved-state logic and safe destination/brief persistence, including invalid/unavailable storage.
- `npm audit --omit=dev --audit-level=moderate`: zero reported vulnerabilities. This is a dependency check, not a comprehensive security audit.
- Live OpenAI recommendation: actual `gpt-4.1-mini` result using Haven’s purpose and existing UI, with explicit request and visible reasons/questions.
- Selected Searchable list, saved it, reviewed **96/100 compatibility**, and installed `ReframeResourceFinder` into Haven. Ran filtering, selection and no-results behavior in the real demo; this Original intentionally uses sample data/local UI state.
- Existing Apple product package remains in the clipboard and demo, alongside all earlier packages. Runtime records/accounts/keys were not part of export or model requests.
- Additional current-run responsive, persistence and data-retention results are recorded in `VERIFICATION.md`.

This audit does not certify all 114 patterns, all websites/APIs, native devices or production security. Keep those claims separate from the checked local developer workflow.
