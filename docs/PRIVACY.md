# Local data and permissions

[简体中文](PRIVACY.zh-CN.md) · [Installation and removal](DISTRIBUTION.md)

This describes the current development candidate. Review a replacement package's manifest and build identity before granting it device access.

## Website

The website keeps the explicitly selected language in localStorage under its own origin. Draft JSON and compiled output live in the page's memory; exporting downloads a file that you choose to keep. Imported files are read locally. There is no server-side Pattern library or automatic connection to the native nb1 filesystem.

The packaged website has no analytics, account, remote font, runtime CDN, PWA service worker or automatic task monitoring. Its local server serves static files on loopback. Source links and official documentation links open outside resources only when you follow them; browser/network software may have its own independent traffic.

**Check status** contacts only the selected service at `http://127.0.0.1:<port>`. It reads `/v1/presence` first. Only a matching nb1 identity triggers a second GET to `/v1/service-status` on that port. The combined deadline is eight seconds. Both requests omit credentials and referrer, reject redirects, and accept bounded JSON records. A successful summary includes service health and aggregate counts from the daemon’s device cache. A missing summary can still confirm presence. Chrome may ask for loopback or local network permission separately from USB permission. The debugger link opens the selected service directly.

Selecting a service, opening the website or opening the USB chooser starts no probe. The site remembers the selected port and up to four recently confirmed non-default ports in localStorage. Health, counts and the time of the last check stay in page memory. These checks send no serials or drafts and make no hardware or playback requests.

Closing a page does not clear its browser permission or turn the light off. Clear site data to remove language and port preferences. Remove the origin’s HID permission in Chrome settings to revoke future access.

## Extension

The manifest requests exactly two permissions:

| Permission | Purpose |
| --- | --- |
| storage | Keep the selected language, one reminder plan and the latest state/error record locally in the extension. |
| alarms | Trigger the user-created minute-based reminder. |

The reminder record can contain its deadline, resolved RGB value, compiled request and background-session identifier. The latest event includes status, time and explanatory text. No arbitrary website content, browsing history, system notification text, Agent prompts or native files are read.

Data uses chrome.storage.local, not sync storage or a remote service. A disconnected device's last error/status can remain until it is replaced or the extension data is removed. Uninstalling removes extension-local data through Chrome. Exported files are ordinary user files and are not removed by uninstalling.

The extension has no all-sites access, content scripts, external messaging, native messaging, downloads, tabs, keyboard, screen-capture, accessibility or system notification permission. It does not observe task completion automatically.

## Device permission

WebHID uses a separate browser device chooser triggered by an explicit action. The filter is vendor **0x27b8**, product **0x01ed**, for blink(1). It is not a request to read keyboard input.

An authorized page or extension can still fail to open a light already held by another controller. The ownership acknowledgement cannot stop another process. Switch ownership explicitly and never add unrelated system permissions as a workaround.

The current controls send bounded light commands. They do not expose Pattern-row, Flash, startup-effect or arbitrary HID report writing. Disconnect is separate from Off; an accepted color can remain after a page or extension is gone.

For the browser permission model, see [Chrome's WebHID extension guide](https://developer.chrome.com/docs/extensions/how-to/web-platform/webhid). To report a problem, use the repository's existing issue channel with browser/OS/build identity and a redacted error. Do not include personal drafts or unrelated device information unless necessary.
