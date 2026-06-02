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
```

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

## Timing Functions

### swing(amount [, grid] [, raw])

Delays off-beat notes to create a swing feel. Returns absolute position — use
with `timing =`.

- **amount**: Delay in musical beats applied to off-beat notes (0.02=subtle,
  0.05=medium, 0.1=heavy). Negative values push off-beats early.
- **grid**: Swing subdivision grid. Default is half the meter's beat — the
  off-beat between beats: an 8th note in x/4 meters, a 16th in x/8 (the natural
  swing subdivision per meter). It is _not_ a fixed `n/8`, which would coincide
  only in x/4. Uses the same grid notation as `quant()` (e.g., `n/16` for
  16th-note swing). Internally, `period = grid * 2`.
- **raw**: Keyword that skips auto-quantize (see below).

**Algorithm**: Each period (2× grid) is split into two halves. Notes in the
first half (on-beat) get no offset. Notes in the second half (off-beat) get the
full amount as offset. This is a step function, not a wave — every off-beat note
gets the same delay.

**Auto-quantize**: Before applying swing, notes are snapped to a `grid/4`
quantize grid. This serves two purposes:

1. Makes `swing()` idempotent — re-applying with a different amount works
   correctly because previously swung notes snap back to the grid first.
2. Uses `grid/4` (not `grid`) to preserve notes at finer subdivisions. For
   example, 16th notes survive 8th-note swing because the quantize grid is 32nd
   notes.

The `raw` keyword skips auto-quantize entirely, applying swing to whatever
position the note is currently at.

```
timing = swing(0.05); // default swing: half the meter's beat (8th notes in 4/4)
timing = swing(0.03, n/16); // 16th-note swing
timing = swing(0.05, raw); // no auto-quantize
timing = swing(0.05, n/16, raw); // 16th-note swing, no auto-quantize
```

### quant(grid)

Snaps note timing to the nearest grid point. Returns absolute position — use
with `timing =`.

- **grid**: Grid size as a note value or numeric musical beats.

```
timing = quant(n/8); // snap to 8th-note grid (0.5 beats in 4/4)
timing = quant(n/16); // snap to 16th-note grid (0.25 beats in 4/4)
timing = quant(n/4); // snap to quarter-note grid (1 beat in 4/4)
timing = quant(n/12); // snap to triplet grid
```

### legato([tolerance])

Sets duration to fill the gap to the next distinct start time. Skips chord tones
(notes at the same start position) so all notes in a chord extend to the next
rhythmic position. The last note extends to the clip end, or keeps its current
duration (with a warning) when no clip length is available.

Optional tolerance in musical beats (default 0): notes within tolerance of the
same start time are treated as a chord. Useful after humanizing timing.

```
duration = legato()              // extend notes to fill gaps
duration = legato(0.1)           // group notes within 0.1 beats as chords
C3-C5: duration = legato()       // legato for melody notes only
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

## Transform Syntax

- **Format**: `[pitchRange] [timeRange] parameter operator expression` (one per
  line in `transforms` string)
- **Parameters**:
  - MIDI clips: velocity, timing, duration, probability, deviation, pitch
  - Audio clips: gain, pitchShift
- **Assignment Operators**:
  - `+=` Add to the value (additive modulation)
  - `-=` Subtract from the value (shorthand for `+= -(expression)`)
  - `*=` Multiply the current value (e.g. `velocity *= 0.5` halves velocity)
  - `/=` Divide the current value (e.g. `duration /= 2` halves duration)
  - `=` Set/replace the value (absolute modulation)
  - Note: `*=` and `/=` desugar to `= currentValue * expr` /
    `= currentValue / expr`. For `timing *=`, the current value is the absolute
    note position (`note.start`), so `timing *= 0.5` compresses all notes toward
    bar 1.
- **Pitch selectors** (optional): Filter by MIDI pitch or note name
  - Single pitch: `C3 velocity += 10`
  - Pitch range: `C3-C5 velocity += 10` (applies to all notes from C3 to C5
    inclusive)
- **Time range selectors** (optional): Filter by bar|beat range (e.g.,
  `1|1-2|1 velocity += 10`). Both bounds are **inclusive** by default (matching
  note start time). Two opt-in forms make the end **exclusive** (half-open), so
  a selection can stop at a bar line without catching the next downbeat:
  - **Whole-bar wildcard:** `N|*` selects all of bar N; `A|*-B|*` selects whole
    bars A through B. Each desugars to the half-open range `[first|1, after|1)`
    (end bar = the bar _after_ the last selected bar, end exclusive), so `3|*`
    is exactly bar 3 with no spill onto `4|1`. This is the foolproof "measure N"
    selector — meter-safe and off-by-one-proof. A mixed `3|*-4|1` (wildcard with
    a beat bound) is rejected.
  - **Exclusive-end marker:** `-<` on an ordinary range makes only its end bound
    exclusive — `3|1-<4|1` covers up to but not including `4|1`, and `1|2-<1|4`
    is a sub-bar half-open span (beats 2-3, excluding beat 4). Without the `<`
    the end stays inclusive.

  The beat field uses the same dialect as note positions: a whole beat, a
  decimal sub-beat (`1|1.5`), or a `±n` note-value offset off an
  integer-or-decimal grid beat (`1|1+n/12` = beat 1 + an eighth triplet,
  `1|2-n/24` just behind beat 2, `1|1.5+n/4` = beat 1.5 + a quarter note). The
  offset is a note value (meter-invariant), so a bound resolves to the same
  musical position as a note written that way. A `-n` bound may sit just before
  a downbeat — `2|1-n/12` borrows across the bar line into bar 1 — and a bound
  reaching before `1|1` resolves to negative time (before the clip start) rather
  than being rejected. A `+n` bound may likewise run past the end of its bar
  (`1|4+n/2` lands in the next bar); membership is decided by each bound's
  absolute musical position, not by its bar number, so the bound filters at its
  true position regardless of which bar it overflows into. Bare fractions
  (`1|4/3`) and mixed numbers (`1|1+1/3`) are rejected — write the grid+offset
  form instead.

- **Range clamping**: Applied after modulation:
  - velocity: 1-127
  - timing: unclamped (can shift notes before/after original position)
  - probability: 0.0-1.0
  - duration: 0.001 minimum
  - deviation: -127 to 127
  - pitch: 0-127 (rounded to integer)
  - gain: -70 to 24 dB
  - pitchShift: -48 to 48 semitones

## Shorthand Assignments

In addition to the full `parameter operator expression` form, each assignment
may be written as a single bar|beat-style **shorthand** token — convenient for
clears and simple one-shot sets (this is the form the `preTransforms` examples
in the skills use). One token per line; an optional pitch/time selector still
applies.

- `v0` deletes the note · `vN` sets velocity · `v+N` / `v-N` adjusts velocity ·
  `vA-B` sets a humanized random velocity range (e.g. `v80-120`)
- `pN` sets probability · `p+N` / `p-N` adjusts probability (no range form — the
  notes layer has none either, so `p` stays single-valued for parity)
- `n/4` (or `Nbar`, `Nbar±n/4`, e.g. `1bar-n/16`) sets duration to that note
  value
- `C4` (a bare pitch) moves/remaps matched notes to that pitch

Each desugars to the same `{ parameter, operator, expression }` as the full
form: `v0` ≡ `velocity = 0`, `C1: v0` ≡ `C1: velocity = 0`, and `C1: C4` remaps
the C1 lane to C4. The shorthand expresses only set/delete/adjust of one
property — use the full syntax for anything computed (waveforms, `*=`, ramps,
cross-note references).

The one exception is the velocity range `vA-B`, which desugars to **two**
assignments — `velocity = low` and `deviation = high - low` — matching the
bar|beat notes layer's `vA-B` exactly. This is the **persistent base velocity +
`velocity_deviation`** semantic Live shows as the per-note random-velocity range
in the clip editor, **not** a one-time `rand(A,B)` baked at transform time. Each
bound is clamped to 0-127 and the lower becomes the base, so `v120-80` ≡
`v80-120` and out-of-range bounds clamp before the deviation is computed
(`v200-250` ≡ velocity 127, deviation 0). A selector applies to both writes, so
`C1: v80-120` produces two assignment rows in the parsed AST — still written as
one token per line. (Because Peggy grammars cannot import a shared helper, this
mapping is duplicated from the barbeat interpreter and pinned by
`velocity-range-parity.test.ts`.)

## Units and Time Signatures

All transform expressions evaluate in **musical beats**, where 1 beat equals the
time signature denominator note value:

- **4/4 time**: 1 musical beat = 1 quarter note
- **3/4 time**: 1 musical beat = 1 quarter note
- **6/8 time**: 1 musical beat = 1 eighth note
- **2/2 time**: 1 musical beat = 1 half note

This ensures that `timing += 1` always adds one beat in the current time
signature. Note-value periods like `n/4` instead behave consistently in absolute
time across meters (see Absolute Durations below).

> **Beat unit (cross-layer note):** "musical beats" here are the _transforms
> layer's_ unit — meter-relative, scaled by the time-signature denominator. This
> is **not** the unit `bar|beat` notation reports: a parsed note's `duration` is
> in **Ableton (quarter-note) beats**, where `n/4` = `1.0` in any meter. So the
> same `n/4` reads as `1.0` in parsed-note output but as "1 in 4/4, 2 in 6/8"
> here. Same physical duration; different unit (see `BarBeat-Spec.md`).

### Examples by Time Signature

**In 4/4 time**:

- `timing += 1` shifts by 1 quarter note
- `duration = 2` sets to 2 quarter notes
- `cos(n/4)` completes one cycle per quarter note

**In 6/8 time**:

- `timing += 1` shifts by 1 eighth note
- `duration = 6` sets to 6 eighth notes (1 bar)
- `cos(n/4)` still completes one cycle per quarter note (= 2 eighth-note beats)
- `cos(1bar)` completes one cycle per bar (6 eighth notes)

**In 2/2 time**:

- `timing += 1` shifts by 1 half note
- `duration = 2` sets to 2 half notes (1 bar)
- `cos(n/4)` still completes one cycle per quarter note (= 0.5 half-note beats)

### Absolute Durations (`n<fraction>`)

For meter-independent durations and periods, use `n<fraction>` notation — the
same grammar as bar|beat notes — a fraction of a whole note that evaluates to a
number of musical beats:

- `n/4` = a quarter note (1 musical beat in 4/4, 2 in 6/8, 0.5 in 2/2)
- `n/8` = an eighth note
- `n/16` = a sixteenth note
- `n/12` = an eighth-note triplet
- `n3/8` = a dotted quarter
- `n/1` = a whole note

`n<fraction>` evaluates to a number and composes in any expression:

```
duration = n/8; // every note → an eighth note (any meter)
duration += n/16; // lengthen each note by a sixteenth
duration = n/4 + n/8; // a dotted quarter
duration = note.duration + n/16;
```

The denominator is required (`n1`, `n0.5` are parse errors); same rule as in
bar|beat notation. A bare fraction (`1/4`) is plain arithmetic (beats), not a
note value.

### Bar Durations (`Nbar`)

For meter-aware durations and periods, use `Nbar` — the same token as the
`create-clip`/`update-clip` length fields. A bar is the number of musical beats
in one bar (the time-signature numerator), so `Nbar` evaluates to N times the
beats-per-bar count:

- `1bar` = one bar (4 musical beats in 4/4, 6 in 6/8, 3 in 3/4)
- `4bar` = four bars

`Nbar` composes in any expression and combines with `n<fraction>` exactly as in
authoring:

```
timing += 1bar; // shift every note one bar later
duration = 1bar; // each note fills a bar
duration = 1bar + n/4; // a bar plus a quarter
velocity += 20 * cos(1bar, sync); // a bar-length cycle
```

`Nbar` is the meter-aware half of the duration vocabulary; `n<fraction>` is the
meter-invariant half. They are uniform across authoring, length fields, and
transforms.

The `n` sigil marks a denominator-bearing note value, so an `n`-prefixed bar
(`n1bar`, `n/1bar`, `n3/4bar`) is invalid on every duration surface. Because
models reach for it by analogy with the other note values, it raises a targeted
error ("bar durations don't use the `n` prefix — write Nbar"), not the generic
format error.

A plural `bars` (`2bars`, `2bars+n/4`) is accepted as an input-tolerance alias
of `Nbar` everywhere; serialized output is always singular (`2bar`).

### Note Property Units

All note properties are exposed in musical beats:

- `note.start` - Start time in musical beats
- `note.duration` - Duration in musical beats
- `note.pitch`, `note.velocity` - Natural units (0-127)
- `note.probability` - Natural units (0-1)
- `note.deviation` - Natural units (-127 to 127)

### Internal Representation

Ableton Live stores times and durations as quarter notes (Ableton beats).
Producer Pal automatically converts between musical beats (used in transforms)
and Ableton beats (stored in Live).

## Variables

### Note Properties (MIDI clips)

Access note properties in expressions using the `note.` prefix:

- `note.pitch` - MIDI pitch (0-127)
- `note.start` - Start time in musical beats (absolute, from clip start)
- `note.velocity` - Current velocity value (1-127)
- `note.deviation` - Velocity deviation (-127 to 127)
- `note.duration` - Duration in musical beats
- `note.probability` - Probability (0.0-1.0)

### Next Note Properties (MIDI clips)

Access properties of the next note in the sequence using the `next.` prefix:

- `next.pitch` - Pitch of the next note (0-127)
- `next.start` - Start time of the next note in musical beats
- `next.velocity` - Velocity of the next note (0-127)
- `next.duration` - Duration of the next note in musical beats
- `next.probability` - Probability of the next note (0-1)
- `next.deviation` - Velocity deviation of the next note (-127 to 127)

"Next" respects pitch-range filtering: in
`C1-C2: duration = next.start - note.start`, `next` refers to the next C1-C2
note. For the last note in the filtered sequence, all `next.*` variables are
unavailable and the assignment is skipped with a warning. `next.*` reads from
the current (possibly mutated) note state, consistent with `note.*`.

### Audio Properties (audio clips)

Access audio clip properties in expressions using the `audio.` prefix:

- `audio.gain` - Current gain in dB (-70 to 24)
- `audio.pitchShift` - Current pitch shift in semitones (-48 to 48)

### Context Variables (MIDI and audio clips)

Access clip and bar context in expressions:

- `note.index` - 0-based order of note in clip (MIDI only)
- `clip.duration` - Clip duration in musical beats (arrangement length for
  arrangement clips, content length for session clips)
- `clip.index` - 0-based clip order in multi-clip operations
- `clip.position` - Arrangement position in musical beats (arrangement clips
  only; on session clips it resolves to 0 with a warning, since session clips
  have no arrangement origin)
- `clip.barDuration` - **Legacy alias**, still accepted by the parser but no
  longer taught. Equals the beats-per-bar count (e.g., 4 in 4/4, 3 in 3/4, 6 in
  6/8). Prefer the `Nbar` literal: `1bar` == `clip.barDuration` and `4bar` ==
  `clip.barDuration * 4`, and it composes in any expression
  (`note.start % 1bar`), so it fully subsumes the variable while staying uniform
  with the length/duration fields.

Variables can be used anywhere in expressions: arithmetic, function arguments,
waveform periods, etc.

**Note:** Variables from the wrong context will cause an error (e.g., using
`note.velocity` in an audio clip transform or `audio.gain` in a MIDI clip
transform).

## Operators

Functions can be combined using standard arithmetic operators:

- Addition: `+`
- Subtraction: `-`
- Multiplication: `*`
- Division: `/` (division by zero yields 0, not an error)
- Modulo: `%` (uses wraparound behavior for negative numbers, modulo by zero
  yields 0)

Parentheses for grouping: `(expression)`

## Examples

### Basic Waveforms

```
// Basic envelope
velocity += 20 * cos(1bar);

// Phase-shifted
velocity += 20 * cos(1bar, 0.5);

// Pulse width modulation
velocity += 20 * square(n/2, 0, 0.25);

// Dynamic PWM (pulse width modulated by another waveform)
velocity += 20 * square(n/2, 0, cos(1bar) * 0.25 + 0.5);

// Combined functions
velocity += 20 * cos(4bar) + 10 * rand();

// Unipolar envelope (adds 0 to 40)
velocity += 20 + 20 * cos(2bar);

// Amplitude modulation
velocity += 30 * cos(4bar) * cos(n/4);

// Set absolute velocity value
velocity = 80;
```

### Ramp Function

```
// Velocity ramp from soft to loud over entire clip
velocity += ramp(0, 127);

// Reverse ramp (fade out)
velocity += ramp(127, 0);

// Ramp with arbitrary range
velocity += ramp(64, 100);

// Combine ramp with periodic modulation
velocity += ramp(20, 100) + 10 * rand();
```

### Rand Function

```
// Random velocity humanization (default range: -1 to 1)
velocity += 10 * rand();

// Random pitch variation (0 to 12 semitones)
pitch += round(rand(12));

// Random pitch variation (-6 to 6 semitones)
pitch += round(rand(-6, 6));
```

### Choose Function

```
// Random velocity from a set of values
velocity = choose(60, 80, 100, 120);

// Random chord tones
pitch += choose(0, 3, 7, 12);

// Weighted choice (60 appears 3x more often)
velocity = choose(60, 60, 60, 100);
```

### Curve Function

```
// Exponential fade-in (slow start, fast finish)
velocity += curve(0, 127, 2);

// Logarithmic fade-in (fast start, slow finish)
velocity += curve(0, 127, 0.5);

// Exponential fade-out
velocity += curve(127, 0, 2);

// Linear (same as ramp)
velocity += curve(0, 127, 1);
```

### Math Functions

```
// Round to nearest semitone
pitch += round(12 * rand());

// Ensure minimum velocity
velocity = max(60, note.velocity);

// Quantize velocity to steps of 10
velocity = floor(note.velocity / 10) * 10;

// Absolute pitch distance from C3
velocity = abs(note.pitch - 60) * 2;

// Clamp velocity to range
velocity = clamp(note.velocity, 40, 100);

// Alternating pattern (every other beat)
velocity = 60 + 40 * (floor(note.start) % 2);

// Round velocity up to next multiple of 10
velocity = ceil(note.velocity / 10) * 10;

// Exponential scaling
velocity = pow(note.velocity / 127, 2) * 127;
```

### Pitch Filtering

```
// Single pitch selector (only affects C3 notes)
C3 velocity += 20

// Pitch range selector (affects C3, C#3, D3, ... up to C5)
C3-C5 velocity += 20

// Accent bass notes (C1 through C2)
C1-C2 velocity += 30

// Different modulation for high notes
C5-C7 velocity = 100

// Combine pitch range with time range
C3-C5 1|1-2|1 velocity += 10

// Multiple pitch ranges with different modulations
C1-C2 velocity += 30
C3-C5 velocity += 10
C6-C7 velocity = 100
```

### Note Property Variables

```
// Scale velocity based on pitch (higher notes louder)
velocity = note.pitch / 127 * 100

// Self-reference: halve existing velocity
velocity = note.velocity / 2

// Delay higher notes progressively
C4-C6 timing += note.pitch * 0.01

// Reduce duration based on probability
duration = note.duration * note.probability

// Combine variables with waveforms
velocity = note.velocity * cos(n/4)

// Use note properties in expressions
velocity = (note.pitch + note.deviation) / 2
```

### Variable Periods

```
// Use note duration as waveform period
velocity += cos(note.duration);

// Expression as period (2x note duration)
velocity += tri(note.duration * 2);

// Ramp based on note velocity
velocity = ramp(0, note.velocity);

// Phase offset from note probability
velocity += cos(n/4, note.probability);
```

### Multi-Parameter

```
transforms: `velocity += 20 * cos(1bar) + 10 * rand()
timing += 0.03 * rand()
probability += 0.2 * cos(n/2)`;

// Using variables
transforms: `velocity = note.pitch
duration = note.duration * note.probability
timing += note.start / 100`;
```

### Pitch Transforms (MIDI)

```
// Transpose up an octave
pitch += 12;

// Set all notes to middle C
pitch = 60;

// Random pitch variation (±6 semitones)
pitch += round(12 * rand());

// Octave based on velocity (louder = higher)
pitch += floor(note.velocity / 32) * 12;

// Quantize to pentatonic-ish (every 2 semitones)
pitch = floor(note.pitch / 2) * 2;
```

### Context Variables

```
// Sequential crescendo using note index
velocity = 60 + note.index * 5;

// Stacked fifths across clips in multi-clip operation
pitch += clip.index * 7;

// Scale gain by arrangement position
gain = ramp(-24, 0) * (clip.position/32);

// Position within the bar drives velocity (the bar literal composes in arithmetic)
velocity += (20 * (note.start % 1bar)) / 1bar;
```

### Audio Clip Transforms

```
// Set gain to -6 dB
gain = -6;

// Add 3 dB
gain += 3;

// Self-reference: reduce by 6 dB
gain = audio.gain - 6;

// Clamps to valid range (-70 to +24 dB)
gain = -100; // clamps to -70
gain = 50; // clamps to +24

// Pitch shift up 5 semitones
pitchShift = 5;

// Transpose down an octave
pitchShift = -12;

// Self-reference: shift relative to current
pitchShift = audio.pitchShift + 7;
```
