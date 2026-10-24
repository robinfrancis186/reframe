# Graph Report - devinhack  (2026-10-23)

## Reconciliation and scope

All previous node identities and the full previous graph are retained. **Retained ·** nodes and historical links are evidence from the previous map, not current code verification. **Reference ·** nodes represent referenced endpoints with no analyzed definition. Direction and parallel relationship evidence are preserved in graph.json; the HTML draws a simple connection projection for readability. Self-links remain recorded as supplied; they are not automatically bugs.

The ranking below uses the current evidence subgraph, excluding historical and external-reference hubs. Cohesion is calculated on current communities; the retained/reference groups have a displayed placeholder 0.0 rather than a computed cohesion. **Token cost is unavailable**: host-agent usage was not exposed; generated zero counters below are unmeasured placeholders, not free extraction.

Raw previous and candidate records remain in evidence-ledger.json, and the pre-update files are backed up under recovery-20261023T163417Z/. graphify-out/ is already ignored by Git.


## Corpus Check
- Large corpus: 391 files · ~1,017,273 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 1985 nodes · 4255 edges · 107 communities (84 shown, 23 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 93 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Library Store
- Swift Feature Client
- Organize
- Capture & MCP Tools
- OpenAI Help & Suggestions
- iOS Demo App
- Expanded Library Components
- Projects UI & Suggestions
- Reference Browser & Replica
- Feature Generation
- Review Engines (REA/Ponytail)
- Connected Demo Shop
- App State Handlers
- Theme Model & Export
- Code Export
- Browser & Testing UI
- Feature Runtime
- Projects Fit & Plan
- Feature Builder UI
- Server Routes & Vision
- App Shell & Clipboard
- Android Community View
- Connected App Package
- Library Packaging & Branding
- Integrated App Package
- Connections Store
- Haven Services
- npm Scripts
- Manifest
- Agent Pipeline Server
- Main
- Haven Installed Features
- Android Runtime
- Competitor Landscape
- Server Dependencies
- Extension
- Fidelity
- Root Dependencies
- Native Capture Server
- Fieldnotes Demo App
- Website Feature Backends
- Commerce Feature Backend
- Tsconfig.Server
- Portable
- Product Documentation
- Dev Dependencies
- Catalog Recommendations
- Browser Workspace Actions
- Library Primitive Components
- TypeScript Config
- Haven Backend Server
- iOS Runtime
- Evidence Workflows
- Contracts.D
- Examples
- Port
- Haven Account Feature
- Haven Runtime
- Verify Desktop
- React UI Dependencies
- Library Interest Presets
- Website Client Template
- Native Library Codegen
- Extension Pairing
- Agents & Fit Concepts
- Toolchain & Validation Docs
- Haven Commerce UI
- Commerce Component Template
- Demo Launcher
- Media Capture
- Gradio Lab (Python)
- Prepare
- Installed Feature Evidence
- Website Client A
- Website Client B
- Website Client C
- Options
- Picker
- .Prettierrc
- Account Template
- Android Package
- iOS Package
- Reconcile Graphify
- Regression Test Suites
- Recorded UI Evidence
- Haven Feature 8b40
- Haven Feature b83d
- Haven Feature f5dd
- Setup and Build Configuration
- MCP stdio Bridge
- Recovery
- Haven Feature afff
- Background
- Bundled Font Licenses
- Make Dmg
- Preload
- Swift Package
- iOS Build Script
- Skill

## God Nodes (most connected - your core abstractions)
1. `App()` - 53 edges
2. `api()` - 46 edges
3. `LibraryStore` - 41 edges
4. `Projects` - 37 edges
5. `ComponentItem` - 36 edges
6. `download()` - 30 edges
7. `cleanHtml()` - 26 edges
8. `isItem()` - 26 edges
9. `mountLibrary()` - 25 edges
10. `Theme` - 24 edges

## Surprising Connections (you probably didn't know these)
- `Immutable Library revisions` --semantically_similar_to--> `Versioned private engine cache`  [INFERRED] [semantically similar]
  README.md → docs/RELEASE_ASSESSMENT_2026-10-23.md
- `Guarded source installation and undo` --semantically_similar_to--> `Optimistic versions and idempotent writes`  [INFERRED] [semantically similar]
  docs/REFERENCE.md → examples/integrated-app/reframe/features/rf_344d24f39eef/README.md
- `ComponentItem` --references--> `SaveItem`  [EXTRACTED]
  src/model.ts → server/contracts.d.ts
- `Theme` --references--> `LibraryManifest`  [EXTRACTED]
  src/model.ts → server/contracts.d.ts
- `isItem()` --indirect_call--> `inspect()`  [INFERRED]
  src/model.ts → server/library-store.js

## Import Cycles

No cross-file eager import cycles found in the current extracted dependencies.

Same-file symbol references are retained as evidence; they are not reported as module cycles.


## Communities (107 total, 23 thin omitted)

### Community 0 - "Library Store"
Cohesion: 0.09
Nodes (16): exec, reference, results, root, rss(), thumbs, digest(), fail() (+8 more)

### Community 1 - "Swift Feature Client"
Cohesion: 0.09
Nodes (32): ReframeAction, ReframeClient, ReframeFailure, .errorDescription, ReframeField, ReframeRecord, ReframeRequest, ReframeSnapshot (+24 more)

### Community 2 - "Organize"
Cohesion: 0.09
Nodes (43): AssetLibrary, AssetLibrary(), Tab, tabs, bundledFontFor(), bundledFonts, familyOf(), fontFaceCss() (+35 more)

### Community 3 - "Capture & MCP Tools"
Cohesion: 0.06
Nodes (55): GradioLab, root, labels, LibrarySync(), load(), restore(), when(), isFeature() (+47 more)

### Community 4 - "OpenAI Help & Suggestions"
Cohesion: 0.09
Nodes (28): assist(), decisionModel(), definitions, mcpSession(), runOpenAIMcp(), text, openAIResponse(), structuredDecision() (+20 more)

### Community 5 - "iOS Demo App"
Cohesion: 0.07
Nodes (14): MainActivity, ReframeNativeCommunity(), ReframeNativeInterests(), Screen(), NativeDemo, .body, ReframeNativeInterests, .background (+6 more)

### Community 7 - "Projects UI & Suggestions"
Cohesion: 0.10
Nodes (29): Projects, installationName(), sameComponent(), signatures, readDestination(), readProjectBrief(), writeDestination(), writeProjectBrief() (+21 more)

### Community 8 - "Reference Browser & Replica"
Cohesion: 0.05
Nodes (59): safeImageData(), buildReplicaFeature(), digest(), pageContext(), prepareReplica(), q(), replicaCSS(), replicaHTML() (+51 more)

### Community 9 - "Feature Generation"
Cohesion: 0.14
Nodes (14): buildCommerce(), buildFeature(), validateCatalog(), frontend(), inspectFeature(), nativeSources(), validatedFeature(), html() (+6 more)

### Community 10 - "Review Engines (REA/Ponytail)"
Cohesion: 0.10
Nodes (33): analysisSummary(), analyzeFiles(), analyzeSource(), completed, inFlight, queue, root, sourceDigest() (+25 more)

### Community 11 - "Connected Demo Shop"
Cohesion: 0.13
Nodes (15): app, root, server, product, Shop, shopRouter(), variants, bodyKeys() (+7 more)

### Community 12 - "App State Handlers"
Cohesion: 0.14
Nodes (26): App(), applyEdit(), captured(), changeTheme(), copy(), importItems(), inspect(), notify() (+18 more)

### Community 13 - "Theme Model & Export"
Cohesion: 0.08
Nodes (37): CaptureDialog, EngineTools, BehaviorSummary(), operations, CaptureDialog(), CaptureResult, Polish, Status (+29 more)

### Community 14 - "Code Export"
Cohesion: 0.15
Nodes (24): validateVariants(), cleanComponent(), cleanStyles(), escape(), interactionBindings(), interactionHelpers, slug(), ATTRIBUTES (+16 more)

### Community 15 - "Browser & Testing UI"
Cohesion: 0.08
Nodes (43): AgentAvatar(), exportRun(), BrowserWorkspace, PageShot, SavedReference, ScrapedPage, Snapshot, Tab (+35 more)

### Community 16 - "Feature Runtime"
Cohesion: 0.13
Nodes (22): handlers, port, root, credentialScope(), fail(), featureHandler(), execute(), persist() (+14 more)

### Community 17 - "Projects Fit & Plan"
Cohesion: 0.14
Nodes (13): compatibleRuntime(), digest(), inside(), Projects, destinationBrand(), projectFixture(), insertionPoints(), walk() (+5 more)

### Community 18 - "Feature Builder UI"
Cohesion: 0.11
Nodes (22): NativeCapture, WorkingPreview, EngineTools(), reviewDocument(), run(), FeatureBuilder(), build(), connection() (+14 more)

### Community 19 - "Server Routes & Vision"
Cohesion: 0.07
Nodes (28): appRoot, desktopDemo(), mountDownloads(), app, browserTests, connections, demo, extensionPairing (+20 more)

### Community 20 - "App Shell & Clipboard"
Cohesion: 0.15
Nodes (14): ComponentLibrary, loadAppearance(), setAppearance(), ComponentLibrary(), Home(), libraryItem(), componentReview(), profiles (+6 more)

### Community 22 - "Connected App Package"
Cohesion: 0.09
Nodes (22): dependencies, express, react, react-dom, devDependencies, typescript, vite, engines (+14 more)

### Community 23 - "Library Packaging & Branding"
Cohesion: 0.12
Nodes (26): aliases, cssColor(), detectBranding(), detectTokens(), hex(), aliases, calls(), colorHex() (+18 more)

### Community 24 - "Integrated App Package"
Cohesion: 0.10
Nodes (20): dependencies, react, react-dom, devDependencies, typescript, vite, engines, node (+12 more)

### Community 25 - "Connections Store"
Cohesion: 0.20
Nodes (10): Connections, fail(), identityStore(), auth(), credential(), current(), key(), token() (+2 more)

### Community 26 - "Haven Services"
Cohesion: 0.19
Nodes (18): allowed6, apiURL(), blocked4, blocked6, callExternal(), derive, fail(), identityStore() (+10 more)

### Community 27 - "npm Scripts"
Cohesion: 0.10
Nodes (20): scripts, benchmark, build, check, check:server, demo, desktop:dev, desktop:package (+12 more)

### Community 28 - "Manifest"
Cohesion: 0.11
Nodes (17): action, default_title, background, service_worker, commands, _execute_action, content_scripts, description (+9 more)

### Community 29 - "Agent Pipeline Server"
Cohesion: 0.22
Nodes (12): agentStatus(), decide(), gradioSource(), operations, runAgents(), validateDecision(), agents, detectSkills() (+4 more)

### Community 30 - "Main"
Cohesion: 0.14
Nodes (15): { app, BrowserWindow, dialog, ipcMain, shell }, { availablePort }, backend(), log, {
  mkdir,
  appendFile,
  cp,
  mkdtemp,
  rm,
  access,
  readFile,
  writeFile,
}, path, { pathToFileURL }, { readOnlyVolume, prepareRuntime } (+7 more)

### Community 31 - "Haven Installed Features"
Cohesion: 0.14
Nodes (7): ReframeFeature(), ReframeFeature(), ReframeFeature(), ReframeFeature(), ReframeFeature(), ReframeFeature(), ReframeFeature()

### Community 32 - "Android Runtime"
Cohesion: 0.18
Nodes (15): state(), state(), state(), fail(), featureHandler(), execute(), read(), operations (+7 more)

### Community 33 - "Competitor Landscape"
Cohesion: 0.16
Nodes (10): Built-in OpenAI local MCP host, Connect assistants through MCP, HTTP and stdio transports, Disposable working previews, DNS-pinned public capture, Reframe technical reference, Public hosting gates, Release scope (+2 more)

### Community 34 - "Server Dependencies"
Cohesion: 0.12
Nodes (16): dependencies, @babel/parser, cheerio, express, fflate, ipaddr.js, lucide-react, @modelcontextprotocol/sdk (+8 more)

### Community 35 - "Extension"
Cohesion: 0.31
Nodes (6): digest(), ExtensionPairing, fail(), mountExtension(), validCapture(), finishCapture()

### Community 36 - "Fidelity"
Cohesion: 0.31
Nodes (14): canScore(), compare(), documentFor(), fidelityGrade(), findRepairs(), measure(), repairAndScore(), scoreExport() (+6 more)

### Community 37 - "Root Dependencies"
Cohesion: 0.13
Nodes (14): author, config, forge, description, express, react, react-dom, typescript (+6 more)

### Community 38 - "Native Capture Server"
Cohesion: 0.23
Nodes (10): adbPath(), captureDevice(), devices(), escape(), nativeItem(), options, parseHierarchy(), run (+2 more)

### Community 39 - "Fieldnotes Demo App"
Cohesion: 0.23
Nodes (12): App(), addToCart(), configure(), handleReframeAction(), mutate(), reserve(), Line, money() (+4 more)

### Community 40 - "Website Feature Backends"
Cohesion: 0.30
Nodes (11): featureHandler(), q(), replicaDocument(), featureHandler(), q(), replicaDocument(), featureHandler(), q() (+3 more)

### Community 41 - "Commerce Feature Backend"
Cohesion: 0.36
Nodes (5): bodyKeys(), fail(), featureHandler(), Shop, validateCatalog()

### Community 42 - "Tsconfig.Server"
Cohesion: 0.14
Nodes (13): compilerOptions, allowImportingTsExtensions, allowJs, checkJs, lib, module, moduleResolution, noEmit (+5 more)

### Community 43 - "Portable"
Cohesion: 0.21
Nodes (10): { constants }, { createHash }, { execFile }, {
  mkdir,
  readFile,
  writeFile,
  cp,
  mkdtemp,
  rename,
  rm,
  access,
  readdir,
}, path, prepareRuntime(), { promisify }, readOnlyVolume() (+2 more)

### Community 44 - "Product Documentation"
Cohesion: 0.06
Nodes (21): Ready to reuse report, Robin About self-contained capture, Self-contained website components, Destination data binding, Reframe product and usability audit, Packaged startup and recovery evidence, Runtime data preservation, Self-contained Robin capture evidence (+13 more)

### Community 45 - "Dev Dependencies"
Cohesion: 0.15
Nodes (13): devDependencies, electron, @electron-forge/cli, @electron-forge/maker-zip, eslint, @eslint/js, globals, node (+5 more)

### Community 46 - "Catalog Recommendations"
Cohesion: 0.11
Nodes (18): needs, recommendComponents(), screenSignals(), stop, tagFeatures, tokens(), recommend(), theme (+10 more)

### Community 47 - "Browser Workspace Actions"
Cohesion: 0.35
Nodes (11): BrowserWorkspace(), acquire(), action(), capture(), closeTab(), newTab(), probe(), release() (+3 more)

### Community 49 - "TypeScript Config"
Cohesion: 0.15
Nodes (12): compilerOptions, allowJs, esModuleInterop, jsx, lib, module, moduleResolution, noEmit (+4 more)

### Community 50 - "Haven Backend Server"
Cohesion: 0.17
Nodes (9): handlers, port, production, root, server, handlers, port, production (+1 more)

### Community 51 - "iOS Runtime"
Cohesion: 0.29
Nodes (10): fail(), featureHandler(), execute(), read(), operations, validatedValues(), validateSpec(), handlers (+2 more)

### Community 52 - "Evidence Workflows"
Cohesion: 0.17
Nodes (6): Ponytail development rules, HAR environment manifest, HAR environment state, REA Evidence records, HAR API surface projection, Process capture and deadline finalization

### Community 53 - "Contracts.D"
Cohesion: 0.22
Nodes (9): BrowserHost, ExportOptions, LibraryEntry, LibraryManifest, LibraryMetadata, PublicResource, RenderingOptions, Resource (+1 more)

### Community 54 - "Examples"
Cohesion: 0.18
Nodes (8): Gradio 6.30.0 dependency pin, Gradio end-to-end examples, Image, audio, and video transformation examples, Gradio Blocks, Gradio ChatInterface, Gradio event listeners, Gradio Python web UI library, Gradio Interface

### Community 55 - "Port"
Cohesion: 0.31
Nodes (4): archiveEngine(), availablePort(), net, copyRuntime()

### Community 56 - "Haven Account Feature"
Cohesion: 0.31
Nodes (6): ReframeAccount(), authenticate(), refresh(), request(), saveKey(), ReframeFeature()

### Community 57 - "Haven Runtime"
Cohesion: 0.47
Nodes (9): credentialScope(), fail(), featureHandler(), execute(), persist(), read(), operations, validatedValues() (+1 more)

### Community 58 - "Verify Desktop"
Cohesion: 0.20
Nodes (8): env, errors, executablePath, ids, observed, responses, start, timings

### Community 59 - "React UI Dependencies"
Cohesion: 0.27
Nodes (7): Connections, Client, Connections(), refresh(), task(), State, OpenAIMcp()

### Community 60 - "Library Interest Presets"
Cohesion: 0.14
Nodes (9): App(), ReframeInterests(), ReframeInterestsView(), ReframeOriginalTabs(), ReframeOriginalTabsView(), ReframeResourceFinder(), ReframeResourceFinderView(), ReframeWorkspaceCommands() (+1 more)

### Community 61 - "Website Client Template"
Cohesion: 0.25
Nodes (3): websiteClient(), apply(), feedback()

### Community 62 - "Native Library Codegen"
Cohesion: 0.42
Nodes (8): compose(), composeChart(), kotlin(), nativeLibrarySource(), quote(), quoted(), swift(), swiftChart()

### Community 63 - "Extension Pairing"
Cohesion: 0.25
Nodes (5): BridgeReply, ExtensionPairing(), connect(), Status, when()

### Community 64 - "Agents & Fit Concepts"
Cohesion: 0.25
Nodes (7): Lossless WebP portraits, Original agent portraits, Bundled open fonts, Ponytail, REA, Reframe Copy Polish, Third-party integrations

### Community 65 - "Toolchain & Validation Docs"
Cohesion: 0.29
Nodes (4): Fresh-profile packaged workflow, Reframe macOS release assessment, Local unsigned macOS distribution, Reframe

### Community 66 - "Haven Commerce UI"
Cohesion: 0.29
Nodes (7): Line, Order, ReframeFeature(), mutate(), read(), Snapshot, Variant

### Community 67 - "Commerce Component Template"
Cohesion: 0.29
Nodes (7): Line, Order, ReframeFeature(), mutate(), read(), Snapshot, Variant

### Community 69 - "Media Capture"
Cohesion: 0.52
Nodes (7): MediaCapture(), camera(), frame(), record(), snapshot(), stop(), upload()

### Community 70 - "Gradio Lab (Python)"
Cohesion: 0.12
Nodes (8): GradioLabTest, invoke(), load(), records(), request(), load_capture(), run(), workbench()

### Community 71 - "Prepare"
Cohesion: 0.33
Nodes (5): chromiumRoot, executable, folder, require, root

### Community 72 - "Installed Feature Evidence"
Cohesion: 0.04
Nodes (14): Account-scoped encrypted API keys, Agent community board, Declared action API, Community contacts, Apple MCP product card, Connected API lookup, MCP idea inbox, Contact form (+6 more)

### Community 73 - "Website Client A"
Cohesion: 0.40
Nodes (3): websiteClient(), apply(), feedback()

### Community 74 - "Website Client B"
Cohesion: 0.40
Nodes (3): websiteClient(), apply(), feedback()

### Community 75 - "Website Client C"
Cohesion: 0.40
Nodes (3): websiteClient(), apply(), feedback()

### Community 76 - "Options"
Cohesion: 0.21
Nodes (5): form, server, status, token, Reframe Picker settings

### Community 77 - "Picker"
Cohesion: 0.53
Nodes (4): close(), render(), save(), screenshot()

### Community 78 - ".Prettierrc"
Cohesion: 0.33
Nodes (5): printWidth, semi, singleQuote, tabWidth, trailingComma

### Community 79 - "Account Template"
Cohesion: 0.53
Nodes (5): ReframeAccount(), authenticate(), refresh(), request(), saveKey()

### Community 80 - "Android Package"
Cohesion: 0.40
Nodes (4): private, scripts, reframe:backend, type

### Community 81 - "iOS Package"
Cohesion: 0.40
Nodes (4): private, scripts, reframe:backend, type

### Community 82 - "Reconcile Graphify"
Cohesion: 0.50
Nodes (3): reconcile(), normalized(), relative()

### Community 84 - "Recorded UI Evidence"
Cohesion: 0.01
Nodes (118): Library gallery with interactive starter cards and export controls, Help accordion starter using native disclosure behavior, Workspace tabs starter with roving keyboard focus and linked panels, Component name, project theme, primary color, and corner radius controls, Selected pricing card starter with 24 dollar monthly plan preview, Save to clipboard, export HTML, and check project fit actions, Mobile Studio screen for capture, adaptation, and clipboard reuse, Displayed source-based project fit estimate of 96 out of 100 (+110 more)

### Community 88 - "Setup and Build Configuration"
Cohesion: 0.10
Nodes (9): Material 3 Compose Android component destination, SwiftUI iOS native component destination, Node 24.11.1, Verify Reframe, Fieldnotes React root, Fieldnotes Reframe destination, Haven integrated features, Haven React root (+1 more)

### Community 89 - "MCP stdio Bridge"
Cohesion: 0.50
Nodes (3): client, port, server

### Community 90 - "Recovery"
Cohesion: 0.30
Nodes (4): Local engine startup, Reframe recovery screen, Try again and diagnostic log, query

### Community 93 - "Bundled Font Licenses"
Cohesion: 0.07
Nodes (16): SIL Open Font License 1.1, Space Grotesk, DM Sans, SIL Open Font License 1.1, Fraunces, SIL Open Font License 1.1, Inter, SIL Open Font License 1.1 (+8 more)

## Knowledge Gaps
- **180 isolated node(s):** `.errorDescription`, `flag`, `text`, `ImageIO`, `.id` (+175 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 805 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `file()` connect `Android Runtime` to `Capture & MCP Tools`, `Native Capture Server`, `Theme Model & Export`, `iOS Runtime`, `Library Packaging & Branding`, `Connections Store`, `Haven Services`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **What connects `.errorDescription`, `flag`, `text` to the rest of the system?**
  _180 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Library Store` be split into smaller, more focused modules?**
  _Cohesion score 0.09326923076923077 - nodes in this community are weakly interconnected._
- **Why does `isItem()` connect `Capture & MCP Tools` to `Android Runtime`, `Library Store`, `Organize`, `Reference Browser & Replica`, `Theme Model & Export`, `Server Routes & Vision`, `Library Packaging & Branding`, `Connections Store`, `Agent Pipeline Server`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Should `Swift Feature Client` be split into smaller, more focused modules?**
  _Cohesion score 0.08778424114225278 - nodes in this community are weakly interconnected._
- **Why does `auth()` connect `Haven Services` to `Website Feature Backends`, `Android Runtime`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Should `Organize` be split into smaller, more focused modules?**
  _Cohesion score 0.08563134978229318 - nodes in this community are weakly interconnected._