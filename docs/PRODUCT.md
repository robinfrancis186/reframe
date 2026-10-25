# Reframe product notes

> Current focus: web components for a simple **pick → build behavior → save → reuse** workflow. See [the current guide](WEB_WORKFLOW.md) and [compatibility table](../README.md#what-works-today). The original, broader product notes below are retained as historical context; native adapters and advanced tools are in Labs, with separate runtime limits.

**A reusable interface workbench: observe a pattern, keep the evidence, adapt it to your product, and carry it to the next project.**

The strongest product is a component memory for builders. Unlike screenshot collections, every saved piece has editable markup, a source, known limitations and a project theme. Unlike blind cloning, the workflow separates observed structure from inferred behavior. Its value comes from reusable, reviewed components and design-system fit.

## The product loop

1. Browse a public website, paste rendered HTML, import a native hierarchy, or reconstruct screenshots and selected video/camera frames with local macOS OCR or a configured vision model.
2. Select a section or pick a nested element in the isolated preview.
3. Change its name, content, colors, typography and radius to match the destination project.
4. Review missing behavior and define supported actions. Generate frontend, API and persistent storage together, or wire an existing destination handler for a presentation-only component.
5. Save the complete package to the persistent clipboard, then review and apply its insertion with guarded undo. Full-stack installation supports React + Vite, SwiftUI and Compose; React Native supports presentation insertion.

## Implemented in this version

- Real public HTTP/HTTPS HTML capture, bounded to 2 MB and 24 top-level sections.
- Sanitized HTML import; structural adaptation rather than original CSS reproduction.
- Element picker, HTML editor, desktop/mobile previews, project token editing and CSS color-token import.
- Local browser clipboard, search, saved themes, delete/undo, JSON backup/import, drag-to-workbench reuse.
- HTML and React exports with no component package dependency and retained provenance.
- REA 6.7.0 embedded behind source analysis; uploads are analyzed locally in an ephemeral directory without executing the source.
- Ponytail policy bundled into screenshot generation, alongside REA evidence guidance.
- Local macOS Vision OCR and optional OpenAI reconstruction, with bounded inputs, timeouts, sanitized output and explicit availability checks.

- Native device discovery and screenshot capture adapters: authorized Android via ADB and booted iOS Simulator via simctl; idb accessibility extraction on iOS.
- Model-free native hierarchy import/picking, screenshot region selection, and local or remote reconstruction.
- Connected local project scanning, insertion-point discovery, framework-specific generation, source review, atomic multi-file installation, crash recovery and guarded undo that preserves runtime data.
- Eleven/twelve-file packages with React, SwiftUI and Compose clients, validated Node APIs, optional local accounts, user-isolated records/counters/toggles, and reviewed HTTPS API actions with server-side API-key setup. Ambiguous behavior must be authored before building.
- Independent web, iOS and Android destination projects. Shared SwiftUI runs as a macOS preview; Android/iOS OS builds and runtime testing remain pending by the user's choice.
- Independent document wording review for TXT, Markdown, LaTeX, HTML, JS/TS and DOCX, protecting code, math and citation fields.

## Project branding and original library

The library now maps 108 named public BeUI families to 114 independently authored Reframe entries, including six original extras. Shared behavior across variants keeps generated logic small. This is an original pattern library, not a full-fidelity reproduction of every upstream variant or paid component. Native adaptations follow their platform; complex motion and visualizations differ from the web reference.

Each identity regenerates React, SwiftUI and Android Compose source. Clipboard backups retain identity plus brand, and installation retains source review, framework guards, static REA analysis for web, conflict detection and undo. Native source is inserted into the selected container without introducing a backend for a UI-only primitive. Service requirements stay explicit; no AI response, identity verification, upload or financial execution is fabricated.

Detection reads bounded public CSS/metadata, Android color/style XML and Kotlin ColorSchemes, Swift color assets and static theme constants. Unresolved native fields inherit runtime platform tokens. Users may turn automatic adaptation off and apply a saved palette. Brand name, tagline and local bitmap logo are editable. Generated packages do not contain account data or API keys.

All SwiftUI entries typecheck with this Mac's SDK, and a saved multi-select was installed and exercised in the shared macOS preview. Android/iOS SDK builds and device or simulator runtime tests remain pending by the user's earlier choice.

## Deliberate boundaries

URL capture reads server HTML; the built-in isolated browser also captures JavaScript-rendered DOM and original reference images. Neither uses authenticated sessions or recovers private API contracts/backend rules. Exports adapt structural markup to destination styling. External image references need review before distribution; the sandboxed component preview blocks their network requests.

Native screenshots and accessibility structure feed reusable components that can be generated for SwiftUI, Compose, React Native or React. This is reconstruction of visible content, not native decompilation or proof of behavior. Direct physical iPhone inspection, APK/IPA imports and backend recovery are not implemented. Device connectors require installed platform tools. Native runtime behavior remains unverified until exercised with the target SDK/device.

Turnitout is not bundled: the user confirmed authorization, but the engine source was inaccessible and the user asked for an independent implementation. Reframe Copy Polish provides local, reviewable wording and document suggestions. Ponytail guides minimal generation and REA provides JavaScript/TypeScript static evidence; neither proves native runtime correctness, optimal code size, visual quality or human authorship.

## Product opportunity

Initial audience: independent product builders and small frontend teams moving repeatedly between reference interfaces and an existing design system. The first useful promise is “a personal library of components that already fit your project.” It is testable without claiming universal reverse engineering.

A defensible next step is a permissioned browser capture extension that records computed styles and interaction states, then deeper project adapters that reuse actual component libraries. The implemented source insertion and native capture adapters need broader real-project and hardware acceptance tests. Shared team libraries, provenance policies and reuse analytics become useful after the capture-to-export loop is reliable.

Suggested validation: measure capture-to-accepted-component time, the proportion of exports shipped after review, edits needed to fit the destination, and repeat reuse of saved components. These are proposed metrics, not measured product results.
