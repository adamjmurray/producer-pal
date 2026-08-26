# Transform System Specification

## Function Signatures

```
// Waveforms (sync is an optional trailing keyword, not an expression)
cos(frequency, [phase], [sync]); // cosine wave — phase 0 starts at peak (1.0)
sin(frequency, [phase], [sync]); // sine wave — phase 0 starts at zero, rising
tri(frequency, [phase], [sync]); // triangle wave — phase 0 starts at zero, rising
saw(frequency, [phase], [sync]); // sawtooth wave — phase 0 starts at zero, rising
square(frequency, [phase], [pulseWidth], [sync]); // square wave — phase 0 starts high
rand([min], [max]); // random value (no args: -1 to 1, 1 arg: 0 to max, 2 args: min to max)
choose(a, b, ...); // random pick from arguments (at least 1)
seq(a, b, ...); // cycle by note.index; clip-granular params (gain, pitchShift) have no note axis, so cycles by clip.index there (== clipseq)
clipseq(a, b, ...); // cycle by clip.index (per clip across a batch); forces the clip axis even on per-note params
ramp(start, end); // linear ramp over clip/time range
curve(start, end, exponent); // exponential ramp over clip/time range

// Timing functions
swing(amount, [grid], [raw]); // swing: delay off-beat notes (grid default: half the meter's beat — 8th-note in 4/4, 16th in 6/8)
quant(grid); // quantize: snap to nearest grid point
legato([tolerance]); // set duration to reach the next note's start time

// Scale functions (use the Live Set scale; pass-through if no scale is set)
snap(pitch); // snap pitch to the nearest in-scale pitch
step(basePitch, offset); // move basePitch by offset scale steps

// Math functions
round(value); // round to nearest integer
floor(value); // round down to integer
ceil(value); // round up to integer
abs(value); // absolute value
clamp(value, min, max); // clamp value to [min, max] range
wrap(value, min, max); // wrap value into [min, max] range (modular arithmetic)
reflect(value, min, max); // reflect/bounce value within [min, max] range
min(a, b, ...); // minimum of 2+ values
max(a, b, ...); // maximum of 2+ values
pow(base, exponent); // base raised to exponent

// Note-count operations (statements, NOT expression functions — see below)
ratchet(count); // divide each matched note into `count` equal pieces (a roll)
ratchet(noteValue); // cut each matched note on the absolute noteValue grid (grid form, e.g. ratchet(n/16))
repeat(offset, [copies]); // echo matched notes forward by `offset` (a note value or Nbar); `copies` (optional, default 1) is the number of echoes; does NOT resize the clip
split(barBeat, ..., [sync]); // cut each matched note at explicit bar|beat positions (e.g. split(2|1, 2|3)); trailing sync aligns to the arrangement timeline
merge(); // span ALL same-pitch matched notes into one sustained note (default)
merge(0); // glue only touching/overlapping same-pitch notes
merge(noteValue); // glue same-pitch notes within that note-value gap (e.g. merge(n/8))
```

**Bad argument counts warn rather than fail silently** (counting only positional
args — the trailing `sync`/`raw` keywords are not arguments), and the warning is
relayed once per malformed line, not once per affected note. Handling differs by
call kind:

- **Expression functions** (`cos`, `ramp`, the math helpers, …): too few _or_
  too many arguments makes the assignment apply no change — the matched notes
  pass through unchanged rather than the call guessing intent — and later lines
  still run.
- **Note-count operations** (`ratchet`, `repeat`, `split`, `merge`): a missing
  required argument skips the operation (matched notes pass through), but
  **extra** arguments warn and the call proceeds using the leading argument(s)
  it expects — `ratchet`/`merge` use the first, `repeat` uses the first two.
  `split` is variadic (any number of cut positions, so no "too many" case) and
  `merge()` with no argument is its valid span-all default.

## Parameters

- **period** (called `frequency` in the signatures above): the cycle length for
  waveforms, specified as:
  - **Note value** (`n<fraction>`): a fraction of a whole note, the same grammar
    used everywhere else (note durations, clip `length`).
    - Examples: `n/4` (quarter-note cycle), `n/8` (eighth), `n/12` (eighth
      triplet), `n3/8` (dotted quarter), `n/1` (whole note)
    - Meter-invariant in absolute time: `n/4` is one cycle per quarter note in
      any meter.
  - **Bar-length cycle** (`Nbar`): meter-aware bars, e.g. `cos(1bar)` (1 bar) or
    `cos(4bar)` (4 bars).
  - **Expressions**: Any numeric expression (including variables)
    - Examples: `note.duration`, `note.start / 4`, `2.5`
    - A bare number is treated as a period in beats
    - Must be > 0
  - The old synced-period syntax (`1t`, `4t`, `1:0t`) is **removed** and is a
    parse error.
- **phase**: cycles (0.0-1.0), optional, default 0
  - 0.0 = start of cycle
  - 0.25 = quarter cycle
  - 0.5 = half cycle
  - 0.75 = three-quarter cycle
  - Can use expressions/variables (e.g., `note.probability`)

- **pulseWidth** (square only): cycles (0.0-1.0), optional, default 0.5
  - 0.5 = 50% duty cycle
  - 0.25 = 25% high, 75% low
  - 0.75 = 75% high, 25% low
  - Can use expressions/variables

- **start** (ramp/curve): starting value (can use expressions/variables)
- **end** (ramp/curve): ending value (can use expressions/variables)
- **exponent** (curve only): curve shape, must be > 0 (can use
  expressions/variables)
  - > 1 = slow start, fast end (exponential)
  - < 1 = fast start, slow end (logarithmic)
  - = 1 = linear (same as ramp)

## Timeline Sync

By default, waveform phase resets to 0 at each clip's start. The `sync` keyword
makes phase relative to arrangement position 1|1, so waveforms are continuous
across clips on the global timeline.

- **Syntax**: `sync` is an optional trailing keyword (not an expression) on
  cyclical waveform functions: `cos`, `tri`, `saw`, `square`
- **Evaluation**: When `sync` is present,
  `effectivePosition = note.start + clip.position` is used instead of
  `note.start` for phase computation
- **Session clips**: A session clip has no arrangement position, so `sync` is
  ignored and the waveform degrades to clip-relative
  (`effectivePosition = note.start`, phase resets at clip start) with a warning
  — the modulation still applies, rather than the assignment being skipped. This
  mirrors the `clip.position` variable fallback (resolves to 0 with a warning on
  session clips)
- **Audio clips**: `sync` follows the same rule; an audio session clip (no
  `arrangementStart`) degrades to clip-relative with a warning instead of
  skipping
- **Non-cyclical functions**: `sync` on `ramp`, `curve`, `rand`, `choose`, or
  math functions is a parse error

```
// Clip-relative (default) — phase resets at each clip start
velocity += 20 * cos(4bar);

// Timeline-synced — continuous phase from 1|1
velocity += 20 * cos(4bar, sync);

// With phase offset and sync
velocity += 20 * cos(4bar, 0.25, sync);

// square with all args and sync
velocity += 20 * square(n/2, 0, 0.75, sync);
```

## Waveform Behavior

**Period-based waveforms** (cos, sin, tri, saw, square) at phase 0. `cos` and
`square` start at peak; `sin`, `tri`, and `saw` start at zero and rise:

- **cos(n/4, 0)**: starts at 1.0, descends to -1.0, returns to 1.0
- **sin(n/4, 0)**: starts at 0.0, rises to 1.0, back through 0.0 to -1.0,
  returns to 0.0
- **tri(n/4, 0)**: starts at 0.0, rises linearly to 1.0, descends to -1.0,
  returns to 0.0
- **saw(n/4, 0)**: starts at 0.0, rises linearly to 1.0, jumps to -1.0, rises
  back to 0.0
- **square(n/4, 0)**: starts high (1.0) for first half, low (-1.0) for second
  half
- **rand()**: random value between -1.0 and 1.0 per note (or rand(max) for 0 to
  max, or rand(min, max) for min to max)
- **choose(a, b, ...)**: randomly selects one of the provided values per note

**Time range-based waveforms** ramp over the clip/time range duration:

- **ramp(start, end)**: linearly interpolates from start to end
  - At the beginning of the clip/range: outputs start value
  - At the end of the clip/range: reaches end value
  - Example: ramp(0, 127) in a 4-bar clip goes 0→127 over 4 bars

- **curve(start, end, exponent)**: exponentially interpolates from start to end
  - exponent > 1: slow start, fast end (exponential growth)
  - exponent < 1: fast start, slow end (logarithmic shape)
  - exponent = 1: linear (same as ramp)
  - Example: curve(0, 127, 2) in a 4-bar clip goes 0→127 with exponential shape
  - Example: curve(0, 127, 0.5) goes 0→127 with logarithmic shape

---

## Feature specs

| Spec                                                        | Covers                                                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [functions.md](transforms/functions.md)                     | Timing functions (`swing`, `quant`, `legato`) and note-count operations (`ratchet`, `repeat`, `split`, `merge`) |
| [syntax.md](transforms/syntax.md)                           | Transform expression syntax and shorthand assignments                                                           |
| [units-and-variables.md](transforms/units-and-variables.md) | Units and time signatures, note/context variables, operators                                                    |
| [examples.md](transforms/examples.md)                       | Worked examples by feature                                                                                      |
