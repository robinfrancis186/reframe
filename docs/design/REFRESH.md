# UI refresh — 22 October 2026

Research: [Componentry](https://componentry.dev/), [Space UI](https://www.spaceui.one/components), [SketchUI](https://sketchui.sanjoydev.com/), [Planes](https://useplanes.com/components), [Arc UI](https://uiarc.dev/). All five were opened in the rendered browser as well as checked in their public documentation. These are visual references; their source, Pro components and assets are not copied into Reframe.

The built-in image generator produced `reframe-ui-2026-10-22.png` as the Home-screen specification. Prompt: a complete Reframe Home screen with a neutral dark canvas, quiet lilac accents, precise thin borders, 12px corners, a compact five-section rail plus Connections, left-aligned two-line existing headline, capture composer first, three compact action tiles, existing starter previews and a subtle hand-drawn underline. No invented metrics, badges or decorative shader workloads. Code-native controls and existing workflows were required.

The implementation uses shared workspace tokens, restrained hover/press feedback, reduced-motion overrides, a compact sidebar, underlined subviews, consistent panel geometry and accessible focus treatment. Existing component previews retain their separate project theme; the chrome palette does not overwrite destination branding. Connections uses the same design system.

## Fidelity ledger

| Check | Reference / concept | Implemented decision |
| --- | --- | --- |
| Layout | Capture composer above three equal action tiles | Same hierarchy; website capture is primary |
| Typography | Left-aligned sans-serif headline, deliberate small UI controls | Inter/system sans with bounded responsive scale and explicit control sizes |
| Palette | Dark neutral surfaces and lilac selection/focus | Shared chrome tokens; destination preview branding remains separate |
| Geometry | Thin borders, compact icons, quiet corners | Existing Lucide icons, 8–12px controls/panels; no new icon/runtime package |
| Motion | Small state transitions rather than continuous shaders | Hover/press feedback with reduced-motion overrides |
| Copy | Existing headline, source labels and actions | Preserved visible Home copy; capture composer intentionally moved before action tiles |
| Mobile | Responsive continuation of the same flow | Single-column action tiles and starter previews; five primary navigation items plus separate Connections access |

Intentional deviations from generated raster detail: preserved the real three starter components and their actual branded previews rather than the image generator's invented pricing/content variants; retained recent-component shortcuts; used the specified 224px sidebar rather than the wider raster interpretation; retained existing footer wording and semantic controls. Live component counts and disabled empty-URL submission reflect real state rather than the raster example. First-visit contextual agent tips remain as explicitly requested functionality. The generated image is a design reference only, never shipped as app UI. Screenshots and final comparison results are recorded in VERIFICATION.md.
