# Clip Envelopes

How Live's Python API handles clip automation envelopes, as measured on Live
12.4.6. Max for Live's LOM can't reach them, so Producer Pal goes through the
remote script (`remote-script/Producer_Pal/envelopes.py`). Not yet checked on
Live 12.3, the minimum version.

## What the API can reach

Only **automation** envelopes on **track and device parameters** (mixer volume,
pan, sends, and device parameters inside racks too), on **Session** clips that
are **MIDI or warped audio**.

| Envelope                                  | Read / write                  | `clear_all_envelopes` |
| ----------------------------------------- | ----------------------------- | --------------------- |
| Automation on a track or device parameter | yes                           | removes it            |
| Modulation                                | invisible                     | leaves it             |
| Clip-level (Gain, Transpose…)             | invisible                     | leaves it             |
| MIDI CC                                   | invisible                     | leaves it             |
| Anything on an unwarped audio clip        | yes, but see below            | —                     |
| Arrangement clip                          | `automation_envelope` is None | —                     |

- `automation_envelope(param)` and `clip.automation_envelopes` see the same
  envelopes. Neither sees modulation, even while Live's editor shows that
  parameter in Modulation mode or after `clip.view.select_envelope_parameter`.
  Nothing in the API picks automation or modulation.
- Asking `automation_envelope(param)` of every parameter is cheap: 1,170
  parameters in under 0.1 ms. Matching `clip.automation_envelopes` back to
  parameters is about 50 times slower, because hashing or comparing a parameter
  costs more than the call. So the list route asks every parameter.
- Automation and modulation on the same parameter coexist. Writing automation
  leaves the modulation alone.
- `has_envelopes` is true for any envelope, reachable or not. So "has envelopes
  but none readable" means the clip holds envelopes we can't see. Every clip
  read shows it as `envs: true` on session clips.
- **Unwarped audio clips can't have envelopes in Live**: an unwarped clip has no
  beat grid to line envelope times up with, so the UI offers no Envelopes tab.
  The API still writes one, and reads one copied from a warped clip, but it
  never plays. It isn't lost: warping the clip again brings it back. Unwarping
  also switches `loop_end` to seconds while `end_marker` stays as it was.
  `ppal-update-clip` refuses to write points to one (a clear still runs), and
  `ppal-read-clip` reports its envelopes with a note that they don't play.
- `/envelope/clear` with no parameter calls `clear_all_envelopes`, so it answers
  with whether it removed any automation it can see (`cleared`) and whether
  envelopes are still on the clip afterwards (`remaining`, from
  `has_envelopes`). `ppal-read-clip` says so when `has_envelopes` is true but
  the list route found none. It can't tell unreadable envelopes from readable
  ones when both exist.
- Duplicating a Session clip keeps its envelopes, curves included. Duplicating
  to the Arrangement writes the envelope into the track's automation lane, which
  neither API can read.

## Overridden automation

Moving an automated parameter by hand sets its `automation_state` to 2
(overridden): Live ignores the automation until Re-Enable Automation. A Session
clip's override ends when the clip stops (state reads 0 and the envelope plays
again on the next launch).

`/envelope/write` always calls `parameter.re_enable_automation()`, which is safe
in every state (0, 1, 2). It takes effect after the call returns: the state
still reads 2 right afterwards and 1 a moment later. So the route answers
`re_enabled: true` from the state read before the write, never from a re-read,
and `ppal-update-clip` turns that into a note on the clip's entry. The state
belongs to the parameter, not the clip, so this also re-enables an overridden
Arrangement lane on it.

## Times and values

Times are beats from the clip start, on MIDI and warped audio clips alike.

Writes, `value_at_time` and `parameter.value` use raw `min..max`. The
`EnvelopeEvent.value` that `events_in_range` returns is in Live's own units for
that parameter, so don't treat it as raw:

| Parameter kind  | Event value                           |
| --------------- | ------------------------------------- |
| dB              | linear gain (volume raw 0.2 → 0.0191) |
| frequency       | Hz                                    |
| time            | seconds                               |
| bipolar %       | −1..1                                 |
| stepped         | rounded to whole steps                |
| pan, plain 0..1 | same as raw                           |

The read route takes the raw value from `value_at_time` and the label from
`str_for_value`, and passes the event value through as `display`, which nothing
uses.

## Curves

Each event has `control_coefficients` (`x1, y1, x2, y2`) that shape the segment
it starts: a cubic bezier in a 0..1 box, x the fraction of the segment's time, y
the fraction of the way from the start value to the end value (so a falling ramp
measures progress toward the end value, not height). `0.5, 0.5, 0.5, 0.5` is
straight. Curves drawn by hand in Live (Option-drag) read back the same way, and
`value_at_time` follows them. The editor rounds each coefficient to 1/256; a
write from the remote script is stored as given.

Every curve the editor draws is one amount `t` (0..1) on one side:

- slow start (y below x): P1 = (0.25 + 0.75t, 0.25 - 0.25t), P2 = (0.75 + 0.25t,
  0.75 - 0.75t)
- fast start (y above x): P1 = (0.25 - 0.25t, 0.25 + 0.75t), P2 = (0.75 - 0.75t,
  0.75 + 0.25t)

`t = 1` is `1, 0, 1, 0` (slow) or `0, 1, 0, 1` (fast).

The notation's `~N` is that amount, signed: positive bends above the straight
line, negative below. Above means a fast start on a rising ramp and a slow start
on a falling one. `src/notation/barbeat/envelope/envelope-curves.ts` maps both
ways; the remote script only passes the coefficients through. `~0` and `/` write
Live's own straight (`0.5` four times), not `t = 0`. A read fits the nearest
amount in hundredths, so coefficients from another source read as the closest
curve Live's editor could draw. Every amount in hundredths survives the editor's
1/256 rounding.

- **Write the last point first.** Live straightens a curve on an event that has
  no later event yet, so writing left to right loses every curve.
- An event added at a time that already has events goes **after** them. So a
  step (two events at one time, old value then new) must keep its pair in
  forward order even when the rest is written right to left. Reversing the pair
  flips the jump. The curve for a step's next segment goes on the second event.
- Re-creating an existing event (same time and value) with a curve is ignored. A
  new value at an existing time adds a step instead of replacing the event.
- Adding a point inside a curved segment keeps the start event's coefficients,
  but the curve now spans the shorter segment, so its shape changes.

## Undo

The write route wraps one envelope's clear and rewrite in one undo step, so
undoing a rewrite restores the old envelope. Each `envelopes` line in
`ppal-update-clip` is its own route call, so a multi-line write takes one undo
per line.

## Probing

Install the remote script with `npm run remote-script:install -- --probe` to run
Python in Live. See
[python-remote-script-api/](python-remote-script-api/README.md).
