# Chrome companion

[简体中文](EXTENSION.zh-CN.md) · [Install and update](DISTRIBUTION.md) · [Privacy](PRIVACY.md)

The Manifest V3 extension controls a blink(1) through WebHID without a native nb1 client. The development milestone provides explicit connection, Set/Off, and one minute-based timer. All executable commands pass through the shared Go compiler and the same bounded transport used by the website.

It is not a published Chrome Web Store extension. Software and fake-HID checks do not qualify physical USB operation, optical output, or browser restart/sleep/unplug behavior.

## Build and load

Run the repository build. Load the generated `dist/extension/` directory using **Load unpacked** on Chrome's extensions page in a dedicated test profile. Chrome 117 or newer is required for extension-worker WebHID. The build packages its own WASM, Go runtime, fonts, icons, and scripts; there is no remote executable code or startup download.

Do not load the extension into a user's normal browser profile during automated checks. Browser fixtures must not request a real device or access a native daemon.

## Connect

1. Stop other controllers of the same light, including the native daemon and direct WebHID pages. Browser access does not share nb1's native ownership lock.
2. Open the extension's connection page from the toolbar popup. Confirm that other controllers are stopped, then choose **Choose blink(1)**.
3. Chrome prompts only for the blink(1) vendor/product filter. The page grants access without opening the device; the background worker retrieves the granted device and opens it.
4. Return to the toolbar popup to set a color, choose Off, or start a timer. Closing this popup does not close the worker's HID connection.

The first milestone requires exactly one granted blink(1). Multiple granted matching devices are reported as ambiguous, rather than choosing the first device. This preview does not manufacture a serial number: WebHID exposes product information, not a general USB serial-number property. Opening a handle sends no color or storage commands.

An `open_failed` result means Chrome rejected opening the handle. A native daemon or another browser controller may still own the light even after its permission was granted. Stop or disconnect that controller, then explicitly choose the device again; the ownership checkbox does not release another process's handle. If the error remains, check Chrome's device permission. The extension sends no light command on an open failure and does not automatically retry. Disconnect here before switching back to the native daemon.

## Timer behavior

The timer accepts an integer number of minutes from 1 through 1440 and a native nb1 ColorInput. The Go compiler resolves the color before the timer is scheduled. Creating a timer sends no USB command and replaces the previous timer.

At its deadline, the alarm consumes the stored plan before sending. It stops native playback and sends one Set command. The light holds that color until an explicit Off. Off changes the current light; it does not cancel a future timer. Use **Cancel timer** to cancel the reminder. Disconnect cancels the timer and closes the handle without changing the light's last color.

Chrome alarms may be delayed and cannot wake a sleeping computer. They trigger reminders, not individual animation Steps. A background-session restart cancels the previous timer. A timer due without a usable connection is marked missed. Neither case reconnects or replays automatically.

## Failure and state

The device connection keeps an extension worker alive on supported Chrome versions, but a browser exit, crash, permission change, or device disconnect still needs recovery. This first milestone requires explicit reconnection. It does not claim continuous system-service behavior.

Only these messages are accepted from this extension's own pages:

| Operation | Input | Effect |
| --- | --- | --- |
| `status` | none | Read cached extension state; does not inspect USB |
| `connect` | `otherControllersStopped: true` | Retrieve/open the single granted light; no color write |
| `set` | `colorJSON: string` | Resolve the original ColorInput JSON in Go, then compile and send one Set command |
| `off` | none | Compile and send one black target |
| `timer` | `minutes`, `colorJSON` | Resolve and compile the reminder, persist it, then create an alarm |
| `cancel-timer` | none | Clear the current alarm and plan |
| `disconnect` | none | Cancel timer and close the handle |

Unknown operations and messages from outside the extension are rejected. No website or other extension is enabled to submit requests in this milestone.

The USB write result is **command sent**, not a Job terminal result or optical measurement. An unknown write is never retried. Further writes require explicit disconnect/reconnect, including when Chrome loses the handle. Queued writes cannot move to a replacement device. Chrome HID calls cannot be forcibly cancelled by a JavaScript timeout; cached status remains responsive while a call is pending.

## Permissions

The manifest contains only `storage` and `alarms`. It needs no `nativeMessaging`, `offscreen`, `notifications`, `tabs`, all-sites, keyboard, screen, history, cookies or downloads permission. WebHID uses Chrome's separate user device chooser. Only a stop command and RGB/fade report are exposed; RAM/Flash/startup-pattern writing is absent.

English is the default, with an explicit Chinese switch. The switch preserves authored ColorInput values, state records and API tokens. Configuration stays in extension-local storage; it is not automatically shared with the native filesystem library.

## Planned after this milestone

- Extend the [closed-popup one-minute test](https://b1ug.github.io/nb1-guide/browser#load-the-chrome-companion) to browser restart, system sleep, unplug/reconnect, permission revocation and competing controllers.
- Optional download-completion events, requested only when the user enables that feature.
- Explicit trusted-site events with a source allowlist and bounded messages.
- Go-backed multi-Step playback, Pattern import/export, priorities and quiet hours after scheduling and ownership behavior are qualified.

References: [Chrome extension WebHID](https://developer.chrome.com/docs/extensions/how-to/web-platform/webhid), [Alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms), [extension CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy).
