# Reframe UI refresh — 21 October 2026

## Product direction

Reframe is a reference-to-component workspace: capture, isolate, adapt, assess, integrate. Keep the canvas central, controls contextual, and evidence close to the action. The user asked for an integrated experience, minimal code, video/camera inputs and a destination suitability/size score. Existing clipboard data, project connections, source review and persistent undo are preserved.

Research was focused on relevant products, not an exhaustive survey of every app:

- [Linear interface refresh](https://linear.app/changelog/2024-03-20-new-linear-ui): quiet navigation and hierarchy that keeps the work in focus.
- [Figma component properties](https://help.figma.com/hc/en-us/articles/5579474826519-Explore-component-properties): contextual properties for reusable components.
- [Framer component sharing](https://www.framer.com/developers/component-sharing): reusable assets with a direct transfer workflow.
- [Mobbin](https://mobbin.com): reference browsing and collections as a familiar source/collection model.

The resulting design uses a charcoal rail, a white header, pale gray workspace, violet actions, a source list, large preview canvas, contextual inspector, and clipboard shelf. Projects combines destination selection, component preview, source insertion controls and explainable fit. Mobile keeps labeled navigation and scrollable source choices; the main panels stack.

## Working concept and tokens

Image-generated working specifications: `design-studio-v2.png` and `design-fit-v2.png`. No generated screenshot is used as application UI. Actual controls, previews, meters and text are HTML/CSS/React.

Concept brief: a practical, polished desktop editor for Reframe with Studio/Clipboard/Projects/Native devices/Project theme navigation, URL/screenshot/video/camera inputs, source thumbnails, preview/code canvas, name/color/radius inspector, reusable clipboard, and a Project fit state. Match quiet Linear hierarchy, contextual Figma properties and Framer-style reuse. Do not invent metrics or recoverability claims. The concept's numeric fit example is illustrative only; real scores come from inspected source.

| Token | Value |
| --- | --- |
| Sidebar | `#191b22` |
| Workspace | `#f5f6f8` |
| Surface | `#ffffff` |
| Ink | `#20222a` |
| Accent | `#6956e8` |
| Muted | `#697080` |
| Border | `#e4e6eb` |
| Type | Inter, system sans fallback |
| Main heading / UI title / body | 30px / 14–17px / 12–14px |
| Spacing | 8, 12, 16, 20, 24, 32px |
| Panel radius | 9px |

Existing saved palettes are preserved. The initial palette for new workspaces is Studio violet.

## Explainable fit

Only computed after choosing a real connected project, screen and container. Screen hashes prevent a score from silently using changed source. The total is a weighted mean rounded to the nearest integer:

| Category | Weight | Evidence / limits |
| --- | --- | --- |
| Framework | 25% | Supported generator, known lossy media/form/disclosure mappings, Material 2 and Next server-component blockers. No SDK execution. |
| Theme | 20% | Bounded CSS scan (up to 20 files, four levels, 2,000 entries), primary-token presence; native semantic themes; React Native palette prop. CSS cascade is not evaluated. Detected six-digit color tokens populate the illustrative preview. |
| Action wiring | 25% | 100 for no callbacks; 20 for callbacks only logged; 90 for a scoped selected handler. Handler business behavior must be verified. |
| Accessibility | 15% | Basic labels, names and alt text. Deduct 20 per issue category. Not a WCAG audit or screen-reader test. |
| Code size | 15% | Generated UTF-8 source including imports: ≤3 KiB = 100; ≤10 KiB = 80; ≤30 KiB = 50; larger = 20. Assets, framework and compiled bundle are excluded. |

Scores describe adaptation work. They do not predict conversion, product usefulness, visual fidelity, production performance, or correctness of recovered behavior. Framework blockers are named even if other categories score well. Each category expands to show its evidence and weight.

## Media and engine behavior

Screenshot imports resize locally to 1280px maximum dimension. Video and camera recordings remain local; users choose up to six frames, inspect/remove them, and explicitly send only selected frames and instructions to OpenAI. Video files are bounded to 100 MB, camera recordings to 60 seconds, and selected frame data to about 5 MB. Audio is not captured. Camera tracks stop on close, tab switch and recording completion. Video decoding depends on browser codec support.

Ponytail's bundled minimal-code policy is included in reconstruction instructions. REA runs its real installed static-analysis command inside the backend. It can analyze the current generated React component or imported JavaScript/TypeScript without executing it.

The user confirmed Turnitout authorization, but the supplied public repo contains documentation and its referenced engine is inaccessible. At the user's request we built independent Reframe Copy Polish. It suggests a small set of conservative visible-prose replacements and requires before/after review. It preserves attributes and code. It does not implement Turnitout's document-format pipeline or detector-evasion features.

## Visual comparison ledger

The concepts and latest desktop/mobile browser screenshots were opened with `view_image` and compared directly.

| Area | Result / intentional differences |
| --- | --- |
| Hierarchy | Dark rail, compact header, headline, capture strip, three-column studio and lower clipboard match the working direction. The live inspector retains export and evidence controls. |
| Typography | Inter/system hierarchy with 30px desktop headings and 27px mobile headings; compact, readable labels and controls. |
| Palette | Charcoal/white/gray/violet scheme implemented. Solid actions replace the generated concept's slight gradients. Saved user component colors remain unchanged. |
| Layout / spacing | Canvas remains the focal point. Project connection form is collapsed, destination selectors sit in two columns, fit stays adjacent. Smaller screens stack content without page overflow. |
| Copy | Main heading and subheading match the Studio concept. Actual starter text and user data replace invented concept content. Engine states report configuration honestly. |
| Components | Code-native thumbnails, frame strip, color controls and visible score meters. Source and clipboard content are real local data. The bracket-style mark is consistent across screens. |
| Functional additions | Engines navigation, local copy review, export, source warnings, undo history, and detailed fit explanations are necessary controls absent from the concept. |
| Mobile | Labeled horizontal navigation and source list, stacked canvas/inspector, full-width actions; 390px checked across all six pages and capture dialog. |

The working design is implemented with the functional differences above; it is not a pixel-identical reproduction of the generated images.
