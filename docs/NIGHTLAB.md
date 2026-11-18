# Nightlab browser integration

The browser workbench adopts the approved `design-nightlab` presentation, including the default Nightlab palette, semantic typography, compact layout, contextual Action labels, appearance menu, explicit screen playback, and the complete local 3D model. `?view=faces` selects the two-face view without creating WebGL. Loading, unavailable WebGL, and context loss preserve that fallback.

The public snapshot adopts the approved Nightlab design. The private design handoff remains outside this repository. `src/shared/nightlab/handoff-provenance.json` records its source hashes and the required integration adaptations.

## Mount and asset contract

`dist/web/` is a standalone static package that can mount at an origin root or a nested path ending in `/`. All application, compiler, model, Three.js, font, image, documentation, and license references are relative. `data-nb1-app="browser"` explicitly selects the browser adapter; pathname conventions have been removed. Shared presentation source is maintained in `src/shared/nightlab/` and packaged only into the browser workbench.

The full 3D view is the default. Both official raw STL files, the corrected derived enclosure, original engraving, USB orientation, fixed LED identities, and continuous additive two-source light field are retained. LED 1 is the blink(1) wordmark face; LED 2 is ThingM. The local Three.js files and MIT license come from the handoff's pinned Three.js 0.187.0 build. CAD attribution and its CC-BY-SA-4.0 license remain beside the assets. These assets deliberately increase the browser package size; the embedded daemon's separate asset budget does not apply to this standalone static distribution.

The existing browser CSP already permits same-origin WASM and required editor styles. It is unchanged. No CDN, startup download, analytics, service worker, native daemon connection, or device discovery is added. The model documentation is bilingual and starts in English.

## Solid and direct playback

Play continues to validate the current draft internally without requiring Screen preview. Solid extends the existing LED target control with separate LED colors. That choice shows fixed LED 1 / LED 2 fields and generates an ordinary serial Sequence with two zero-fade, zero-hold Steps, repeat 1 and finish hold. The two writes are ordered, not physically atomic; no new Action kind or API is introduced. Export uses the canonical dual-color Sequence. Fresh browser drafts for Blink, Breathe, Pulse, Alternate, Orbit and Rainbow start at three cycles; edited drafts and imported Sequences retain their authored counts. Each Action keeps its own parameters and targets, and reselecting the active effect does not reset it.

An invalid or stale validation never writes hardware. A validated explicit playback request cancels screen playback at the submission boundary; validation alone does not. Unknown hardware outcomes retain the existing disconnect/recovery flow without retry. When disconnected, the explanation and a link to the existing Connect control appear beside Play. The redundant Screen preview title tooltip is removed while its accessible label and visible help remain.

## Mobile hierarchy

The authorized mobile refinement keeps the editor first in document order and groups Solid targets as both LEDs with one color, separate colors, LED 1 · blink(1), and LED 2 · ThingM. Short visible Play/Preview labels retain their full accessible device/screen names. Mobile effects keep complete readable labels; secondary import/export and explanatory content live in Advanced/Help disclosures. Connection failures, active Stop, uncertain outcomes and actual errors remain visible. The palette, typography, model and transport behavior are unchanged.

The shared Color sets disclosure offers eight themes with exactly eight colors each, using a shared bank of 30 literal Hex6 recipes. The nine unchanged common quick colors are a separate utility outside the theme grid; its Sequence button is hidden and sequence generation rejects that utility. All scenes follow the same stored hue order; recommended pairs have independent, explicit A/B metadata. Browsing a family or opening the read-only Compare by hue table changes no draft or Screen preview. The table aligns eight hue columns across eight scenes and shows exact hex values; shared recipes are identical inputs, without a claim of calibrated physical appearance. A swatch changes one slot; Use pair assigns the explicit pair without changing parameters or Alternate/Orbit order. Create Sequence loads an editable serial Sequence following the theme’s stored eight colors, with 600 ms fades, 400 ms holds, repeat 3 and finish off. These are local authoring suggestions, not new Go Actions, saved Patterns or playback commands. Family selection survives field and language changes. The shared composer module and marked chooser CSS block match the embedded workbench; the original shared Nightlab styles and geometry retain their delivered bytes.

The standalone one-column breakpoint explicitly resets the composer to column 1. This prevents an implicit desktop column from collapsing the preview sidebar to zero width on narrow screens; it does not alter the Nightlab palette, type scale or model. Existing responsive checks retain their caption and zoom-control bounds.

## Preserved behavior

The initial Nightlab integration preserved all baseline business modules. The authorized usability follow-up updates the browser composer while preserving the compiler loader/bridge/source lock, transport, commands, Sequence player, extension source, and approved artwork. The matching Go/WASM compiler is pinned to released nb1 v0.1.1 source `b5cfe68cbb412d81a80d948b845aee5b0aba586b`. Software parity compares the native oracle and WASM built from that exact source; it is not hardware qualification.

Screen playback consumes the actual compiled Sequence and the same Go `planSequence` contract. It neither connects a device nor sends commands. Draft targets, screen frames, and accepted targets remain distinct. The browser has no cached daemon readback to display. The presentation adapter observes the existing `#live-swatches` canonical attributes, rendered only from the existing player's accepted target states. It publishes private `nb1-command-accepted` presentation events; it never creates a hardware observation. A software review event cannot mark a command accepted.

Real WebHID access retains the visible ownership checkbox, explicit Connect action, blink(1)-only chooser filter, connection epochs, unknown-outcome handling, and no retry/replay behavior. Screen editing, importing, exporting, language, appearance, and camera controls do not change hardware. No simulated HID, software device identity, hidden ownership check, review backend, or in-memory Jobs are packaged.

The Chrome extension retains its current presentation and first-milestone capabilities. A future extension pass can reuse the semantic tokens and state colors while preserving MV3 popup/options constraints, manual control, timer behavior, and the existing permissions. This workbench migration does not expand that scope.

## Software validation

After `npm ci --ignore-scripts` and preparing the existing compiler cache:

```sh
npm run build:ui
npm run check
npm test
npm run test:nightlab:preview
npm run test:nightlab:model
npm run test:nightlab:fit
npm run test:nightlab
```

For the bounded color-set authoring checks, run `node scripts/nightlab/smoke.mjs --color-sets`. This mode compiles all eight curated templates with the actual WASM and checks browse/pair/create behavior, language and mobile layout, authored repeat preservation, and one explicit playback using the injected software HID.

The browser suite launches an ephemeral loopback static server and installs a test-only HID object before application scripts execute. It never invokes the browser's real hardware chooser and never contacts the daily daemon. It checks root/nested mounts, nine Actions, actual Rainbow animation and pause/resume/stop/replay, draft-preserving languages/themes, menus, mobile caption bounds, twelve joint poses, production GLSL radiance, accepted-target separation, unknown writes, stale intentions, and two-face fallbacks. Set `NIGHTLAB_ARTIFACT_DIR` to choose the screenshots and JSON receipt destination. Hardware qualification and publishing remain separate activities.
