# nb1 WebHID

- b1ug/nb1-webhid publishes the browser controller and packages the experimental Light Reminders extension. Keep each product’s permission and hardware qualification separate.
- The product is nb1; blink(1) is the hardware. B-3 is only an internal artwork selection identifier, never a public name. Use only the approved production icon and mascot assets.
- Public UI and developer documentation are English by default, with explicit Chinese selection and an extensible locale catalog. Preserve JSON, user content, IDs, and canonical API values when switching languages.
- Share the pinned Go compiler; do not rewrite color mathematics or Action recipes in JavaScript. Use Action, Sequence, Step and Pattern terminology.
- Serve all assets locally. No CDN, analytics, external runtime downloads or website PWA service worker. The MV3 extension service worker is intentional.
- Preview/edit/import/export never changes hardware. Device selection and writes require explicit actions. Filter WebHID to blink(1), never request unrelated keyboard/media permissions. Browser access does not share nb1 native locks.
- Unknown USB writes are not retried or replayed. No RAM/Flash/startup-pattern writes in the first milestone. Report command acceptance separately from playback completion or optical measurement.
- Keep hardware tests separate from software/fake-HID checks. No hardware may be opened while another controller owns it. Tests must not contact the daily daemon.
- Source is in src/; dist/ is generated. Keep test packages and browser profiles out of Git.

- Play validates the current captured draft internally; a manual Screen preview is optional. Solid separate LED colors use the existing serial Sequence with two zero-fade, zero-hold Steps in one operation/Job, never a new Action or physically atomic USB promise. Capture device/draft identity across validation, submit the canonical result, and never retry an unknown outcome automatically.
- Color-set browsing and comparison are read-only. Recommended `pair` metadata is independent of the stored hue-order `colors`; preserve Action parameters and physical LED mapping when applying it. Color-bank names are UI metadata, never new ColorInput aliases.
- Each of the eight themes contains exactly eight colors. The nine historical common colors are a separate utility outside the theme grid; they must not offer or generate a nine-color Sequence.
