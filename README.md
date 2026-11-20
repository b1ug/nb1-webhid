# nb1 WebHID

A development preview of nb1 WebHID and the experimental nb1 Light Reminders Chrome extension for blink(1). Choose an Action, adjust its controls and play it from the website; the extension provides browser-triggered light reminders without installing the native nb1 client.

The interactive 3D view ships [blink(1) Models](https://github.com/b1ug/blink1-models). The dependency lock pins the exact MK2 source archive. The build verifies the model manifest and copies its assets into the site for same-origin, offline use.

**Development preview.** The website and source are separate from stable native nb1 releases. The extension is **Experimental**: closing its popup before a real-device reminder remains pending acceptance.

The workbench shares nb1's Go color, Action/Sequence compiler and finite playback planner. Play validates and compiles the current input automatically. Preview is optional, and the JSON editor is available under Advanced. Background reminders, browser lifecycle behavior and real USB evidence are tracked separately.

The workbench defaults to Nightlab with a local 3D blink(1) model. **Screen preview** animates the actual compiled Sequence without connecting or writing a device; **Play on device** retains the explicit ownership and connection flow. The fixed LED faces also remain available at `?view=faces` and when WebGL is unavailable. See the [Nightlab integration and software checks](docs/NIGHTLAB.md).

Solid also offers separate LED colors through its existing LED control. One operation compiles an ordinary two-Step Sequence with fixed LED 1 / LED 2 targets; it does not add an Action kind or claim physically atomic writes. Switching Actions preserves their drafts.

Color sets offer eight themes with eight colors each: Afterglow, Sea Breeze, Mist Garden, City Lights, Woodland Glow, Midnight Drift, Summer Orchard and Aurora. The themes share 30 literal RGB recipes in a common hue order. The separate **Common colors** utility retains nine quick swatches and does not create a Sequence. **Compare by hue** shows exact hex values across themes without changing the draft. A swatch or **Use pair** explicitly updates colors while preserving Action parameters; each recommended pair is independent of swatch order. **Create Sequence** fills editable JSON with an eight-color, three-repeat progression; it does not save, preview or play it.

This is a development repository, not a published extension or a replacement for the nb1 daemon. Do not run browser and native controllers against the same light at once.

Received an extension ZIP? Start with [loading the extension](docs/DISTRIBUTION.md#load-the-extension). The build commands below require a source checkout; they do not run inside the generated extension directory.

## Build and review locally

Use Git, Python 3, Node 22.12+ and Go 1.27.4. The first build fetches one pinned public nb1 commit. Runtime assets are packaged locally; the tools do not load code or fonts from a CDN.

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run check
npm run serve
```

Open `http://127.0.0.1:4176/`. The website offers a ZIP under **Extension package and instructions**. Unzip it, enable Developer mode at `chrome://extensions`, then use **Load unpacked**. It is not a Chrome Web Store release. Use a supported desktop Chrome; the extension requires Chrome 117+.

The extension manifest version is `0.1.1`, a development identifier rather than a published release. Keep the source and hashes in `dist/build.json` with a supplied package. See [installation, checksum, update and removal steps](docs/DISTRIBUTION.md), [local data and permissions](docs/PRIVACY.md), and the [support evidence table](docs/DISTRIBUTION.md#support-evidence) before granting device access.

The site starts in English and offers an explicit Chinese switch. Device selection is never automatic. Stop other controllers before granting this page or the extension access to the same light. No native helper is required for WebHID, but browser and operating-system device permissions still apply.

Under **Connection options**, select a **Local nb1 service** (default port `5885`) and click **Check status**. The same controls appear beside a USB open error. A compatible daemon reports its health and the cached number of online and configured lights. An older daemon may confirm only its presence. Click **Open local debugger** to see the service directly, including released nb1 v0.1.2 which predates these checks. A running daemon may control a different light. Release the selected light in its current controller before retrying WebHID. The picker keeps previously saved ports, including `8931`. Choose **Default · 5885** to follow the new default.

For UI-only changes after a compiler build, run `npm run build:ui`; it reuses the compiler artifacts. `npm run test:compiler` runs native/WASM parity checks. To run the original four Go package suites as well, use `python3 scripts/build-compiler.py --pure-tests`.

The compiler build is reproducible from a fixed upstream module context. It validates the shared source files and adds only the bridge, without keeping a second maintained copy of the algorithms. See [compiler notes](docs/COMPILER.md).

## Current scope

The website plays all nine Actions and finite serial/interval Sequences through the Go planner and WebHID adapter. It shows progress beside Play; Stop cancels future Steps, while Off also sends black. A fade already sent to the device can finish after Stop. Hiding the page cancels scheduling; returning does not resume it. Browser I/O and timer delays are additional to nominal duration. Completion is not optical confirmation. See [playback behavior](docs/PLAYBACK.md).

Action controls apply to the selected Action: single-color effects have one color, Alternate/Orbit have two, and Off/Rainbow have none. Editing Advanced JSON or importing a file uses that original JSON without rewriting it from the Action controls. Play and Export both compile the current input; no prior Preview click is required. Import/export uses the existing `{ "sequence": ... }` format and does not start playback.

The extension provides explicit connection, Set/Off, a minute-based reminder, cancellation and disconnect. A reminder leaves its color on until Off. It requests only `storage` and `alarms`. It does not automatically reconnect, replay missed timers, read websites or observe arbitrary AI/system tasks.

See the [development plan](docs/PLAN.md) and [extension guide](docs/EXTENSION.md) for acceptance and lifecycle boundaries. Software tests, isolated Chrome checks and real USB qualification must be reported separately. No device storage or startup effect is written.

[中文说明](README.zh-CN.md)
