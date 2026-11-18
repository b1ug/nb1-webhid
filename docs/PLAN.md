# Browser workbench and companion plan

The product is nb1. This development project provides two entry points sharing the same pinned Go compiler and WebHID transport. It does not replace the native daemon.

## Current development build

- Website: English by default with explicit Chinese selection, the approved nb1 artwork, contextual Action controls, one-click Play with automatic Go validation, optional Preview and a collapsed JSON editor with syntax feedback and Go-backed color samples.
- Portable files: export a canonical `{ "sequence": ... }` request. A matching API v1 nb1 can preview it, run it, or save it as a local Pattern without changing the format. Import does not play.
- Direct browser control: explicit blink(1)-only device selection and ownership acknowledgement, all nine Actions and finite serial/interval Sequences through the Go playback planner, progress, Stop/Off and disconnect. Unknown USB outcomes are not retried or followed by cleanup.
- Chrome Manifest V3: explicit device permission in an extension page, background control of one unambiguous granted blink(1), manual Set/Off, a minute-based timer reminder, cancellation, and status. A timer sends a color that remains until Off; it does not imply a multi-Step Pattern player.
- Distribution: local website, an unpacked extension ZIP, source and dependency provenance, software tests and software CI. No Chrome Web Store release; website hosting is a separate development-preview delivery.

### Acceptance

Software checks must prove compiler/native parity, import/export roundtrip, no writes during preview, exact HID payloads, no replay after uncertain results or reconnection, and correct timer state transitions. UI checks cover both languages, wide/narrow layouts, keyboard controls, and actual MV3 service-worker messaging in an isolated browser profile.

Hardware checks are separate: stop other controllers, authorize the selected light, verify Set/Off/Fade, then close the popup and observe a timer reminder. Record the device, browser/OS versions, command result and optical observation separately. Verify disconnect, permission revocation, browser restart and sleep before making broader lifecycle claims. Software mocks are not USB qualification.

## Next: broader execution evidence and extension playback

The foreground website now interprets shared Go Sequence playback descriptors. Verify browser hardware timing, optical output and lifecycle separately, and extend capability checks. The extension still provides Set/Off and a timer; multi-Step extension playback remains future work. Review a public shared compiler facade; the current build uses a frozen original module context without maintaining a second copy of the algorithms.

## Stage 3: browser event rules

Add opt-in download-complete reminders, quiet hours, event deduplication and explicit priority rules. Request download access only when the feature is enabled. System notification permission is unnecessary for light-only output. Browser alarms trigger reminders; they are not the animation Step clock.

## Stage 4: cooperating websites and distribution

Add narrowly allowlisted external messaging for websites that explicitly report task events. Websites do not gain arbitrary HID commands. Use the extension as the single browser USB owner when this mode is selected. Publish only after privacy, permissions, restart behavior, installation instructions and hardware evidence are ready.

## Shared boundaries

- No native helper is required for browser WebHID. Chrome still controls device permissions and lifecycle.
- Browser access does not participate in nb1's native process lock. Native daemon, website and extension must not compete for one light.
- WebHID exposes no general USB serial number. Multiple indistinguishable granted lights are rejected in the first milestone rather than silently selecting the first.
- Closing a connection is different from turning a light off. Unknown writes are never automatically retried.
- Browser storage is separate from the host Pattern library. Import/export provides an explicit bridge.
- The native daemon remains the route for system/CLI/Agent events and operation independent of Chrome.

Official references: [WebHID in extensions](https://developer.chrome.com/docs/extensions/how-to/web-platform/webhid), [alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms), [extension CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy), [blink(1) example](https://github.com/todbot/blink1-webhid).
