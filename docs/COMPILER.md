# Shared Go compiler

The browser tools reuse nb1's existing Go packages for colors, Actions and
Sequences. JavaScript does not reimplement HSV mathematics or Action recipes.
The compiler performs no device discovery, USB writes, runtime timer scheduling,
storage access, daemon requests or gamma correction.

## Source boundary

`compiler/source-lock.json` pins nb1 commit
`b5cfe68cbb412d81a80d948b845aee5b0aba586b` and the hashes of 22 upstream files:
the four pure packages `actionv1`, `sequence`, `colorinput`, `jsoninput`, their
tests and fixtures, the module files, and the license.

Those packages are currently internal to nb1. This separate repository does not
pretend to be part of the upstream module or keep a manually modified copy of
their algorithms. At build time it obtains a Git archive of the pinned commit,
verifies the locked bytes, and adds only the tracked JSON bridge to an owned,
ignored staging directory within the original module context. The bridge and
the original four packages are then compiled together. The upstream checkout
and product repositories are never edited.

A future public compiler facade in nb1 could replace this archive integration.
That packaging change should preserve the same validation and compilation
behavior. The current build is deliberately pinned to a commit, not a moving
branch or tag.

## Build and verify

Requirements: Git, Python 3, Go 1.27.4 or a compatible toolchain, and Node.js for
the offline verification. Browser support code is copied from the same Go
installation that produced the WASM binary.

From this repository:

```sh
python3 scripts/build-compiler.py
node scripts/verify-compiler.mjs
node --test tests/compiler.test.mjs tests/compiler-loader.test.mjs
```

The normal build fetches the exact public Git object once into an ignored,
builder-owned cache. Subsequent builds can use that object without network
access. An explicit clean checkout at the pinned commit can be used instead:

```sh
python3 scripts/build-compiler.py --source-repo /path/to/clean-nb1-v0.1.1-checkout
```

Relative checkout paths are relative to the current working directory. The
example path is for the original development workspace, not a required layout.
CI and independent clones should use the default pinned public fetch.

The build does not run tests by default. To additionally execute the four
upstream package suites as actual Node/WASM programs:

```sh
python3 scripts/build-compiler.py --pure-tests
```

UI-only builds can reuse the existing compiler outputs; a CSS or translation
change does not require repeating Go tests. Rebuild when the compiler bridge,
source lock or Go toolchain changes.

Output files are `.cache/compiler/nb1.wasm`, `wasm_exec.js`,
`compiler-source.json`, `GO-LICENSE.txt`, `NB1-LICENSE.txt`, and `COLORKIT-LICENSE.txt`. The parent build
copies these local assets into both website and extension packages. The native
test oracle is kept separately in `.cache/compiler-test/` and is not a runtime
asset. Test receipts are written only to this repository's ignored
`artifacts/compiler/` directory.

The compiler receipt identifies source and bridge hashes, toolchain, actual
dependency packages, licenses and output hashes. It records whether upstream
tests ran during that invocation. Go's implicit ancestor-repository VCS stamping
is disabled for archive builds; source identity is explicit in the receipt and
bridge rather than falsely attributed to the browser repository.

## Browser and extension loader

`src/shared/compiler-loader.js` imports the small bundled Go support runtime.
The WASM binary is fetched and instantiated only on the first explicit compiler
call. Concurrent startup calls share one promise. All runtime assets are local;
the loader does not download a compiler from a third-party service.

```js
import {loadCompiler, callCompiler} from './shared/compiler-loader.js';

await loadCompiler();
const preview = await callCompiler('compileRequest',
  '{"action":{"kind":"set","color":"#abc"}}');
// preview.sequence, preview.total_steps, preview.nominal_duration_ms
```

The same loader is intended for a normal Window and a Manifest V3 extension
service worker. Loading it does not obtain hardware permissions or keep a HID
connection alive. The extension must package WASM locally and declare the
appropriate WASM CSP. Browser lifecycle, device ownership and physical playback
are separate from compiler correctness.

## JSON boundary

`callCompiler(method, raw, aliases?)` is asynchronous. `raw` must be an unchanged
JSON string. It returns the successful `result`, or throws `CompilerError` with
`code` and `message`. Aliases are optional: pass an explicit map such as
`{mint: '#80c0a0'}` or a raw JSON map string. The caller owns alias storage; the
compiler reads no files or browser storage.

| Method | Required input | Result |
| --- | --- | --- |
| `info` | None | Source commit, methods, nine Actions and non-execution scope |
| `resolveColor` | One bare ColorInput, such as `"red"`, `"#abc"`, RGB8 or HSV | `canonical_color`, `rgb8` |
| `compileAction` | One bare Action object with `kind` | Canonical `sequence`, `total_steps`, `nominal_duration_ms` |
| `compileSequence` | One bare Sequence object with `timing` and `steps` | The same preview structure |
| `compileRequest` | Exactly one of `{"action": ...}` or `{"sequence": ...}` | The same preview structure |
| `planSequence` | One validated or authored Sequence object | Finite Go playback descriptors: initial, expanded Steps, relative waits, interval budgets, final settle and normal finish |

Example color objects are `{"space":"rgb8","r":8,"g":16,"b":32}` and
`{"space":"hsv","h_deg":120,"s_pct":100,"v_pct":50}`. The accepted syntax
comes from the original Go grammar; the bridge does not add HSB field aliases.

`compileRequest` preserves its nested `json.RawMessage` for the upstream Go
parser. Unknown fields, duplicate fields, explicit nulls, invalid Unicode,
trailing data, both alternatives and neither alternative are rejected. The
request and alias documents are each bounded to 1 MiB. Color values retain their
smaller original bounds. Do not parse and stringify imported JSON before
validation: doing so would erase duplicate keys and change that behavior.

Exporting `{"sequence": preview.sequence}` creates a canonical Request that can
be imported again without a browser-specific conversion. Alias colors have
already resolved to exact RGB values. Pattern IDs and titles are separate
metadata, not additional compiler request fields.

The raw Go API remains available as `globalThis.nb1Go`; it accepts JSON strings
and returns a JSON string with `{ok,result,error}`. The loader unwraps that
envelope. A preview is not a Job, a USB acknowledgement, a playback result or an
optical measurement. Nominal duration describes the compiled sequence and does
not guarantee wall-clock timing on any execution backend.

## Evidence and limits

The current verification compares 51 native/WASM input vectors, including all
nine Actions, supported color forms, serial/interval Sequences, explicit aliases,
strict Request envelopes and rejected input. It also checks seven-color Rainbow,
paired Orbit steps and canonical Request round trips. The four upstream package
suites can run separately with `--pure-tests`.

The same check additionally plans and executes all nine Action kinds with the
actual browser runner, a fake clock and a fake device. The planner is pure Go;
the browser adapter runs the returned writes and waits. Nominal offsets are
preview metadata, never deadlines to catch up by sending a burst. Cancellation
and unknown writes do not trigger normal finish cleanup. These are software
checks, not physical timing or light measurements.

The loader check instantiates the real WASM binary in Node with local asset
responses. Browser/extension rendering and real USB qualification remain separate
checks. No compiler test imports a hardware backend or contacts a daemon.
