# Clip routes

Part of the [remote script README](../README.md#routes).

## `POST /envelope/list`, `/envelope/read`, `/envelope/write`, `/envelope/clear`

Clip automation envelopes, which Max for Live's LOM can't reach. **Session clips
only**: Live refuses envelope writes on Arrangement clips and reads them as
empty, so write in Session and duplicate to the Arrangement. That copies the
envelope into the track's automation lane, which stays after the clip is deleted
but can't be read back.

The routes themselves only touch Session clips. `ppal-update-clip` writes an
arrangement clip's lane by parking the clip and stamping a scratch Session clip,
using only `/clip` copies and these routes; see
[arrangement-automation.md](../../dev/live-api/arrangement-automation.md).

Only automation on track and device parameters is reachable. Modulation,
clip-level (Gain...) and MIDI CC envelopes are invisible to every route and
`/clear` leaves them. An unwarped audio clip can't have envelopes in Live: the
API still writes one, but it never plays. See
[dev/live-api/clip-envelopes.md](../../dev/live-api/clip-envelopes.md).

Common params: `track` (`t0`, `t1`.. a regular track; return and master tracks
have no clips), `slot` (0-based Session slot) or `arrangement_index`, and a
parameter: `parameter` = `volume`, `pan`, `send0`.. for the mixer, or `device`
(`d0`, `d0/c1/d0` into rack chains) plus `parameter` as an exact name or 0-based
index.

| Route    | Params                                 | Returns                                                                                                                                                                              |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/list`  | clip                                   | every automated parameter on the clip with its event count                                                                                                                           |
| `/read`  | clip, parameter, `from`, `to`, `limit` | events in that beat range (default: all, even past the clip end): `time`, `value` (raw), `display` (Live's units: linear gain for dB, Hz), `display_str`, `coefficients` when curved |
| `/write` | clip, parameter, `points`              | replaces the whole envelope; `points` = `[{time, value, jump?, coefficients?}]`, raw values                                                                                          |
| `/clear` | clip, optional parameter               | removes one envelope, or every one it can reach; see below                                                                                                                           |

`/write` re-enables the parameter's automation, and answers `re_enabled: true`
when the user had overridden it (`automation_state` 2) before the write.

`/clear` answers `{cleared}` for one parameter: whether it had an envelope. With
no parameter it answers `{cleared, all: true, remaining}`: `cleared` is whether
any automation it can see was removed, and `remaining` is whether the clip still
holds envelopes afterwards (modulation, clip-level or MIDI CC, which it can't
remove).

Times are beats (quarter notes) from clip start. Values are raw `min..max` (most
device params are `0..1`); `display_str` is what Live shows. Each point ramps to
the next; a point with `jump: true` holds the previous value until its time,
then jumps (two events at one time, which is how Live stores a step).
`coefficients` is the curve of the segment the point starts (see
[dev/live-api/clip-envelopes.md](../../dev/live-api/clip-envelopes.md)); events
are created last point first so Live keeps the curves. If Live throws while the
points go in, the new envelope is removed and the call answers a 500 saying so.
A quantized parameter holds each value until the next anyway. A read returns at
most 1000 events (`limit`, a positive whole number); a write takes at most 1000
points. Indexes must be whole numbers >= 0.

## `POST /clip/convert`

Starts converting an audio clip into a new track, as Live's "Convert ... to New
MIDI Track" menu does. Max for Live can't reach `Live.Conversions`.

| Param   | Meaning                                                              |
| ------- | -------------------------------------------------------------------- |
| `track` | `t0`, `t1`.. a regular track                                         |
| `slot`  | 0-based Session slot, or `arrangement_index` for an Arrangement clip |
| `type`  | `drums`, `melody` or `harmony`: a MIDI clip of the detected notes    |

Answers `{started: true, type}`. It's a 409 for a clip that isn't audio, is
recording, or Live says isn't convertible, and for anything Live refuses.

**The new track doesn't exist yet when it answers.** Live does the work a moment
later, blocking Live for about a second, and nothing says where the track lands.
The caller finds it by comparing the track list from before. See
[dev/live-api/conversions.md](../../dev/live-api/conversions.md).
