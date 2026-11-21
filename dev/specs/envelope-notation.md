# Envelope Notation

How a clip's automation envelope is spelled in `ppal-read-clip` (`envelopes`)
and `ppal-update-clip` (`envelopes`). One envelope is one string of points
joined by connectors. It is hand-parsed, not a Peggy grammar, so no parity test
holds it: update this file when the syntax changes.

Code: [src/notation/barbeat/envelope/](../../src/notation/barbeat/envelope/)
(`envelope-notation.ts`, `envelope-curves.ts`, `envelope-repeat.ts`,
`envelope-rand.ts`). How the tools answer a call (refusals, partial writes,
arrangement clips) is in
[tool-behavior](tool-behavior/clips-playback-and-sends/clip-envelopes.md); what
Live allows is in [clip-envelopes.md](../live-api/clip-envelopes.md).

```
1|1 0 / 3|1 0.8 _ 4|1 0.2 ~0.5 5|1 1
```

## Points

A point is `bar|beat value`, in the clip's own meter.

- **Time** is a bar|beat position as in [bar|beat](barbeat/README.md) (beat
  fractions and `+n/12` steps work, and a trailing dot as in `3.`). It counts
  from the clip start, so `1|1` is the start. Each clip is read in its own
  meter, so the same text can mean different beats in 4/4 and 6/8.
- **Value** is the parameter's raw value, not Live's display units. It is a
  plain decimal (`0.5`, `-1`, `.5`, `1e-2`). Range is not checked here; the tool
  refuses a value outside the parameter's range.
- **Display**: a read may add Live's display in parentheses,
  `1|1 0.25 (112 Hz)`. It is left out when it matches the value. Round brackets
  inside it are written as square ones. A write ignores a display that follows a
  value, and takes one written in place of the value, `1|1 (112 Hz)`, as the
  value to convert to raw, turning its square brackets back into round ones
  (`(1/4 [dotted])` is `1/4 (dotted)`).
- Values print with up to 3 decimals and no trailing zeros. A value below 0.1
  keeps 3 significant digits instead (`0.0004`, `0.0123`).

## Connectors

A connector sits between two points and is set off by spaces. It says how to get
from the previous point to the next.

| Connector | Meaning                                                        |
| --------- | -------------------------------------------------------------- |
| `/`       | straight ramp                                                  |
| `_`       | hold the previous value until the next point's time, then jump |
| `~N`      | curved ramp; `N` is -1..1 with no space after `~`; `~0` is `/` |

A positive `N` bends above the straight line, a negative one below it. The curve
is the cubic Bezier Live stores on the event that starts the segment
(`envelope-curves.ts`).

- A bare `~`, a malformed amount, or an amount outside -1..1 is an error that
  shows an example.
- A `/` inside a time (`2|1+n/12`) has no spaces around it, so it is not a
  connector.

## Repeats and random values (write only)

```
1|1x128@n/16 rand(0.5, 1)
1|1 0 / 1|2x7@n/4 rand()
```

- **Repeat**: `bar|beat x count @ step` writes `count` points, `step` apart,
  each with the point's value. The step is a note-value duration as in the notes
  grammar's [repeat patterns](barbeat/repeat-patterns.md) (`@n/16`, `@1bar`,
  `@1bar+n/4`) and is always written: an envelope has no duration to default to.
  The count is 1 to 1000, the most points one write takes. A step that is zero
  or less in the clip's meter is an error.
- **Connector**: the connector before a repeat arrives at every one of its
  points. A repeat that starts the line has none, so its points hold (`_`): flat
  steps.
- **`rand(min, max)`** in place of a value is a random raw value, rolled once
  per point when the envelope is written, so each point of a repeat gets its
  own. As in transforms, `rand(max)` is 0 to max, `rand()` is -1 to 1, and
  `random` is accepted. Its arguments are plain numbers. A rolled value keeps 6
  significant digits. There is no seed.
- **`~rand(min, max)`** rolls the curve amount the same way, once per point the
  connector arrives at. Its range must sit inside -1..1.
- A read never prints any of these: it lists every point.

## Order

- Points run forwards in time. A point earlier than the one before it is an
  error.
- Two points at one time are a jump: the second is the value after it. A third
  at that time is an error.
- Syntax (points, values, repeats, curves, connectors) can be checked without a
  clip (`checkEnvelopeNotation`). Times and order need the clip's meter
  (`parseEnvelopeNotation`).
- An empty string is no points. On a write that means clear.

## How a read writes it

Live's events become points with these rules, so a read parses back to the same
envelope:

- Two events at one time collapse to a jump (`_`). A leading pair is the
  parameter's value before its first jump, so it becomes one point.
- A curve prints as `~N` in hundredths. A curve that rounds to 0, or sits on a
  flat segment, prints `/`. A curve Live draws that this notation can't spell
  reads as the nearest amount.
