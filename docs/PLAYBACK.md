# Browser playback

[简体中文](PLAYBACK.zh-CN.md) · [Installation and support](DISTRIBUTION.md)

Choose an Action, adjust its parameters and press **Play**. The current input is
validated and compiled in Go automatically; Preview is optional. Single-color
Actions show a color input, Alternate and Orbit show two, and Rainbow and Off
need no color. Advanced JSON accepts the existing Action or Sequence request.
Once edited or imported, that original JSON is the source for Play and Export.

Play uses nb1's `sequence.Plan` through the bundled Go/WASM compiler. It expands
finite repeat counts and returns ordered target writes, relative serial waits,
per-Step interval budgets and final settling waits. The browser does not
recreate the Action recipes, color mathematics or timing constants. This does
not change the native daemon executor or add another authoring format.

Before playback, the adapter disables the previous device server-down watchdog
with `D(play=0,keep=1)` and stops autonomous playback with `p(play=0)`. It then
sends the Go-planned fades. These operations do not write Pattern rows, flash,
Notes or startup settings. Normal `on_finish:off` sends all-LED black after the
final wait; `hold` leaves the final output. The hardware performs each fade.

**Stop** prevents future Steps and waits for an in-flight write. It cannot undo
a USB report or freeze an already-started hardware fade. **Off** stops future
Steps, waits for an in-flight write, then explicitly sends black. Disconnect
first stops future scheduling, then closes the device handle even when an
in-flight write fails. An unconfirmed close remains an unknown state. Hide or leave the
page and scheduling stops; returning never resumes or replays it.

Serial waits begin when the prior write returns. Each interval Step gets a new
budget from its actual start, with ordered target spacing; an expired write
budget stops the run. The last fade is allowed to settle before normal finish.
Timers delayed by more than one second also stop the run. No old Steps are sent
in a burst to catch up. Keep the page visible during playback. The native daemon
is the route for operation independent of a foreground browser page.

An unknown USB result is never retried, reconnected or followed by automatic
cleanup. The status remains failed/unknown; explicitly disconnect before trying
again. Progress indicates accepted commands and elapsed host waits, not device
readback or optical measurement. Nominal duration excludes USB time, preflight,
normal finish and timer lateness.

Software tests use the real Go compiler, native/WASM parity, the actual player,
manual clocks and fake HID. Real USB, optical output, browser lifecycle and each
hardware generation need their own evidence; a passing mock does not establish
those results. The Chrome extension currently retains its separate Set/Off and
timer scope; website Sequence playback does not imply an extension Pattern player.
