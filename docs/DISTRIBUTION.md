# Install and review the browser tools

[简体中文](DISTRIBUTION.zh-CN.md) · [Playback](PLAYBACK.md) · [Extension](EXTENSION.md) · [Privacy](PRIVACY.md)

The current package is a **development candidate**, not a Chrome Web Store release or an officially supported hardware bundle. The extension manifest version is **0.1.0**. That number alone does not identify the source or prove hardware compatibility: keep the accompanying build record and checksum.

## Choose a path

| Path | Install | Lifetime |
| --- | --- | --- |
| Browser workbench | Open the locally served website in supported desktop Chrome. No native nb1 client or browser extension is needed. | Keep the page visible while a Sequence plays. |
| Chrome companion | Unzip the candidate and load its extension directory in Chrome Developer mode. | Its worker handles Set/Off and one timer; the popup can close. |
| Native nb1 | Use the separately released nb1 v0.1.1 CLI and its installation guide. | Use its foreground server or optional system service for CLI, HTTP, MCP and Agent workflows. |

These are separate device owners. Stop or disconnect one before connecting the next. The documentation site itself has no USB connection.

## Build from source

Use Git, Python 3, Node.js 22.12+ and the Go toolchain specified in [compiler notes](COMPILER.md). Use the reviewed source commit; the main branch is a development line, not a stable extension release.

~~~sh
git clone https://github.com/b1ug/nb1-webhid.git
cd nb1-webhid
npm ci --ignore-scripts
npm run build
npm test
npm run check
npm run serve
~~~

Open http://127.0.0.1:4176/. The server binds only to loopback. It serves the static website and download files; it is not the native nb1 daemon and does not open USB.

The first compiler build obtains the pinned upstream source. Runtime scripts, WASM, fonts, images and licenses are packaged locally; no runtime CDN is needed. The static build uses Node built-ins; `npm ci --ignore-scripts` prepares the pinned development checks, including Playwright browser acceptance. For a reviewed snapshot, check out the full source commit supplied with that candidate before building. A branch name or manifest version is not an immutable identity.

## Check the package

The build creates:

- **dist/web/** — website and local runtime assets.
- **dist/extension/** — unpacked Manifest V3 extension, with manifest.json at its root.
- **dist/web/extension-download/nb1-extension.zip** — a ZIP with the same extension files at its root.
- **dist/build.json** — source commit, source_dirty, pinned Go source, toolchain and per-file byte counts / SHA-256.
- **dist/web/site-build.json** — public development-preview identity, released core source and hashes of every website payload file except this manifest itself. It contains no local filesystem paths or physical-device receipts.

Publish only **dist/web/** as the static website. Asset links are relative and support a project subpath such as `/nb1-webhid/`. Pages deployment waits for both Node builds and the software browser checks; pull requests never deploy. Source publication and preview hosting do not make the experimental extension a stable release.

The extension ZIP also carries **BUILD-INFO.json**, both READMEs and the complete **docs/** directory for offline installation, privacy and recovery guidance. BUILD-INFO.json identifies the source, development status, manifest version and compiler receipt; it does not hash itself or claim to sign the package. The download page supplies SHA256SUMS for the actual ZIP.

Run npm run check against the build before sharing it. Prefer a clean source snapshot with source_dirty false. Hashes establish consistency; they are not signatures or proof that an untrusted download is safe.

For a supplied ZIP, compare its SHA-256 with the value sent separately by the trusted delivery source. On macOS/Linux:

~~~sh
shasum -a 256 nb1-extension.zip
~~~

In Windows PowerShell:

~~~powershell
Get-FileHash .\nb1-extension.zip -Algorithm SHA256
~~~

Do not infer a published download from this filename. The repository has no public release URL, Web Store listing, signed installer, automatic updater or published browser-specific Homebrew/Winget package.

## Load the extension

1. Extract the ZIP to a directory you intend to keep.
2. In desktop Chrome, open chrome://extensions and enable **Developer mode**.
3. Choose **Load unpacked** and select the directory containing manifest.json. If extracting created an extra folder, select the inner directory.
4. Pin nb1 if useful. Open its popup, then the connection page.
5. Stop any daemon, other extension or WebHID page controlling the light. Confirm this in the connection page, then explicitly choose blink(1).
6. Return to the popup to Set a color, choose Off, or start a timer.

Only the blink(1) USB filter is requested. The browser's device chooser is separate from extension manifest permissions. Granting permission is not proof that the device can be opened; an existing owner can still cause an open failure.

## Update or remove

An unpacked extension does not update automatically. Before replacing it, cancel the timer, choose Off if you want the light dark, then Disconnect. Verify the replacement package, update the chosen unpacked directory and use **Reload** at chrome://extensions. Explicitly reconnect and create any new timer. A background-session restart consumes old timer state without replaying it.

Keep a stable unpacked directory. A different directory can be treated as another installation with separate permission and local state. Keep the old verified package if you need to roll back; rollback follows the same disconnect, replace, reload and reconnect steps.

To remove the extension, first cancel its timer, choose Off if needed and Disconnect; then choose **Remove** at chrome://extensions. Removing an extension or closing a page cannot undo an already accepted color command.

Disconnect closes the connection but retains permission. To revoke website access, use Chrome's site information / site settings for that origin and remove its HID device permission. For extension grants, remove the extension or use the device-permission controls available in your Chrome version. Never use a keyboard or accessibility permission to work around a HID open error.

## Support evidence

| Area | Current evidence and limit |
| --- | --- |
| Web compiler and player | Native/WASM parity, actual Go plans, cancellation and bounded fake-HID execution are software-verified. |
| Website / MV3 UI | Isolated Chromium software checks cover English/Chinese, wide/narrow layouts, real extension messaging and browser alarms with fake HID. The QA browser was Chromium 156; Chrome 117 is the declared API minimum, not a separately tested browser version. |
| macOS with MK2 | The user confirmed browser connection after releasing the native owner. The original pre-Nightlab build has controlled Mac/MK2 WebHID command-path evidence. This clean snapshot has separate software evidence; the extension timer lifecycle and new snapshot hardware qualification remain pending. No old evidence is relabeled. |
| Windows / Linux | Desktop Chrome's API availability is a platform prerequisite; physical USB access and this package's behavior need separate evidence. Linux may need a narrowly scoped hidraw rule supplied by the OS/device setup. |
| MK3 / other generations | No hardware qualification is claimed. Device Pattern memory, Flash and startup effects are outside this browser candidate. |
| Safari / Firefox / mobile browsers | Not delivery targets for direct HID in this candidate. Offline editing and compilation depend on the actual browser environment; no USB promise is made. |

Chrome documents extension-worker WebHID from [Chrome 117](https://developer.chrome.com/docs/extensions/how-to/web-platform/webhid). See its [WebHID guide](https://developer.chrome.com/docs/capabilities/hid) for device permission and Linux access requirements. Platform API availability is separate from nb1 hardware qualification.

When reporting a failure, include the source commit from build.json, extension version, browser/OS version, known model/firmware, chosen entry point, exact action and error. Do not include unrelated profile paths or personal task text.
