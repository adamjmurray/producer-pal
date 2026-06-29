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

## Note-Count Operations

Every other transform is a per-note assignment (`parameter operator expression`)
that maps each note to a new property value — strictly one note in, one note
out. The note-count operations are different: they change **how many notes
exist**. They are **statements, not expression functions** — a note op stands on
its own line (with an optional `selector:` prefix) and may NOT appear inside an
expression. `velocity = ratchet(2)` is a parse error with a targeted message.

They run in the same sequential, statement-major pipeline as assignments: each
statement is fully applied before the next one runs, so an assignment after a
note op sees the rebuilt note list (e.g. `note.index` re-derives over the denser
or sparser set). The optional selector scopes which notes the op touches; notes
outside the selector pass through untouched. A note op's selector — like every
selector — is **per-line**: it applies to that op only and is not carried to or
from neighboring statements. Note ops are MIDI-only; they are ignored (with a
warning) on audio clips.

### ratchet(count) / ratchet(noteValue)

Divides each matched note into end-to-end pieces (a roll/ratchet). Each child
inherits the parent's pitch, velocity, probability, and deviation. The two
argument forms differ in geometry:

- **count** form (a bare number, e.g. `ratchet(4)`): exactly `count` EQUAL
  pieces, regardless of where the note sits — child duration = parent duration /
  count. Rounded to the nearest integer; a count below 2 warns and is skipped (1
  piece is a no-op). Counts above the per-note cap (64) are clamped with a
  warning. A bare pitch literal (e.g. `ratchet(C2)`) is not a valid count — it
  warns and is skipped rather than coercing to its MIDI number (a pitch literal
  nested in arithmetic, e.g. `ratchet(C2 - C1)`, still resolves to a number).
- **noteValue** form (a note value or `Nbar`, e.g. `ratchet(n/16)`,
  `ratchet(1bar)`): cuts the note on the ABSOLUTE grid of that size (multiples
  of the grid from bar|beat `1|1`), so the pieces line up with bar positions — a
  true grid ratchet, not an equal division. A note that starts and/or ends
  off-grid keeps a partial sliver at that end. A note that spans no grid line
  (it fits within a single grid cell) is left unchanged with a warning. The
  per-note cap (64) still applies.
- The argument is a constant (no per-note variables); an unusable argument warns
  and the op is skipped (notes pass through unchanged).
- Zero/negative-duration notes are left unchanged (and are removed later by the
  standard zero-duration deletion sweep).

```
ratchet(2)            // every note becomes two equal pieces (an 8th-note roll on quarters)
ratchet(4)            // four equal pieces
ratchet(n/16)         // cut every note on the 16th-note grid (pieces align to bar positions)
C1: ratchet(4)        // ratchet only the kick (C1)
2|*: ratchet(3)       // triplet-roll every note in bar 2
ratchet(4)            // then accent within each ratchet:
velocity -= note.index % 4 * 15
```

### repeat(offset, [copies])

Echoes each matched note forward in time: keeps the original and emits `copies`
time-shifted copies, the k-th copy displaced by `k × offset`. Each copy inherits
the parent's pitch, velocity, probability, and deviation, and its duration is
unchanged — `repeat` translates notes, it does not stretch them.

- **offset** (first argument, required): a **note value** (`n/8`, `n/4`, …) or a
  bar duration (`Nbar`). This is the only dialect accepted here — a bare number,
  a pitch, or any other expression warns and the op is skipped. The offset must
  be greater than 0. It is meter-aware: `1bar` resolves through the clip's
  beats-per-bar (one bar in 6/8 is three Ableton beats).
- **copies** (second argument, optional, default 1): the number of echoes to
  add. Rounded to the nearest integer; a count below 1 warns and is skipped (0
  echoes is a no-op). Counts above the per-note cap (64) are clamped with a
  warning. A bare pitch literal (e.g. `repeat(n/8, C2)`) is not a valid count —
  it warns and is skipped rather than coercing to its MIDI number (a pitch
  literal nested in arithmetic still resolves to a number). An arithmetic count
  (e.g. `repeat(n/4, 1 + 2)`) is fine. Omit it for the common single-echo case:
  `repeat(n/8)`.
- **Does NOT resize the clip.** Unlike `update-clip`'s `duplicateLoop` (which
  doubles clip length via Live's native Duplicate Loop), `repeat` only adds
  notes — like every transform, it never changes clip length. Copies that land
  past the clip's end are still emitted; in Live they sit beyond the loop/end
  marker, hidden until the clip is lengthened. To grow the clip to fit the
  echoes, set `length` on the same `update-clip` call (or a follow-up).
- The arguments are constants (no per-note variables); an unusable argument
  warns and the op is skipped (notes pass through unchanged). A third positional
  argument warns and is ignored (the first two are used).
- **Same-pitch onset collisions collapse keep-last.** When a copy lands on the
  exact onset of another same-pitch note (an existing note or an earlier copy,
  within `SAME_TIME_EPSILON`), the write-path dedupe keeps the last write and
  drops the other — deterministic, but the displaced note (with its own
  velocity/probability) is replaced. `repeat` emits a warning counting how many
  collisions collapsed; the op is not skipped.

`repeat` runs in the same statement-major pipeline as the other note ops, so
**order matters** when it composes with a `merge`. `repeat` then `merge` first
lays down the echoes and then collapses same-pitch runs (the copies can be
swallowed into one sustained note); `merge` then `repeat` collapses first and
echoes the merged note. `ratchet` and `repeat` commute (one subdivides in place,
the other translates), so their order does not matter.

```
repeat(1bar)          // echo every note one bar later (a 2-bar loop's worth, in place)
repeat(n/8, 3)        // three 8th-note echoes (original + 3 copies)
C1: repeat(n/4)       // echo only the kick (C1), a quarter later
2|*: repeat(n/16, 2)  // a 2-echo 16th-note flam on every note in bar 2
```

(To reveal echoes that land past the clip end, grow the clip with
`update-clip`'s `length` argument — `repeat` itself never resizes.)

### split(barBeat, ...)

Cuts each matched note at one or more **explicit, possibly unequal** clip
positions, given as bar|beat tokens. This is the free-form companion to the
`ratchet(noteValue)` grid form: instead of regularly spaced cut lines, you name
the exact positions. Each child inherits the parent's pitch, velocity,
probability, and deviation.

- Positions are **clip-relative** — measured from the clip's `1|1` origin (the
  same coordinate space as `ratchet`'s grid and a `selector:` time range), not
  relative to each note. A single position subdivides every matched note it
  falls inside, so one `split` can cut notes in different bars at once.
- Each position is the same dialect as a time-range bound: a 1-based bar|beat
  with an optional decimal sub-beat (`1|1.5`) or `±n` note-value offset
  (`2|3+n/8`). It is **meter-aware** — `2|1` resolves through the clip's
  beats-per-bar.
- A position only cuts a note when it falls **strictly inside** that note's
  span; a position on a note's own onset/offset is a boundary, not a cut. A note
  containing none of the positions is left unchanged (with a warning).
- Positions are de-duplicated, so a repeated position never makes a zero-width
  sliver. The per-note piece cap (64) still applies.
- Zero/negative-duration notes are left unchanged (and are removed later by the
  standard zero-duration deletion sweep). Calling `split()` with no positions
  warns and is skipped.
- **`sync`** (optional trailing keyword, same form as the waveform `sync`): the
  positions are interpreted against the **arrangement timeline** instead of the
  clip origin. The clip's arrangement start is subtracted from each position, so
  e.g. a clip starting at bar 5 cut with `split(6|1, sync)` cuts at
  clip-relative bar 2. Session clips have no arrangement origin, so `sync` is
  ignored (warn-and-degrade to clip-relative), mirroring the waveform `sync`
  fallback.

```
split(2|1)            // cut every note that spans bar 2's downbeat
split(2|1, 2|3, 3|2)  // cut at three explicit (unequal) clip positions
split(1|1.5)          // cut on the off-beat (an 8th past the downbeat)
split(2|3+n/8)        // an off-grid cut, an 8th-note past beat 3 — uses the ±n offset dialect
C1: split(2|2, 2|4)   // split only the kick, at two positions in bar 2
split(6|1, sync)      // arrangement bar 6's downbeat (clip-relative for session clips)
```

### merge() / merge(gap)

Collapses **same-pitch** matched notes into sustained notes. Velocity,
probability, and deviation come from the earliest note in each merged run. Notes
of different pitches stay independent — scope the merge with a pitch and/or time
selector to narrow it.

The optional **gap** argument controls how far apart (edge to edge, in beats)
two same-pitch notes may sit and still merge:

- **no argument** (`merge()`): span ALL same-pitch matched notes into one note,
  bridging any gaps (the original behavior; the default).
- **`merge(0)`**: glue only **touching or overlapping** notes (gap ≤ 0). A
  literal `0` is the one non-note-value the argument accepts.
- **note value** (`merge(n/8)`): glue same-pitch notes whose gap is within that
  note value; a wider gap starts a new merged run. The note value is
  meter-invariant in absolute time (an 8th is always an 8th).

Any other argument — a non-zero bare number (`merge(2)`, `merge(0.25)`), a bar
value (`merge(1bar)`), a pitch literal, or an expression — warns and the merge
is skipped (notes pass through unchanged). A second argument warns and is
ignored (the first is used).

```
merge()               // span every pitch's notes across the whole clip
merge(0)              // glue only same-pitch notes that touch or overlap
merge(n/8)            // glue same-pitch notes no more than an 8th-note apart
C1: merge()           // glue all the kick hits into one sustained note
1|1-2|1: merge(0)     // glue touching same-pitch notes within bar 1 only
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

- **Format**: `[selectors] parameter operator expression` (one per line in
  `transforms` string), where `[selectors]` is an optional prefix of a pitch
  selector, a time selector, and/or a `where()` predicate (see **Selector prefix
  syntax** below)
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
    bar 1. Selectors (pitch and time) are **per-line**: a selector applies only
    to the line it prefixes. It is never carried to or inherited from
    neighboring lines — a line with no selector applies to all notes. To scope
    several lines, repeat the selector on each.

- **Selector prefix syntax**: a line may carry up to three selector segments — a
  pitch selector, a time selector, and a `where()` predicate (each detailed
  below) — terminated by a `:` before the assignment/op body. The segments
  **AND-combine** (a note must satisfy all). Two conveniences make the prefix
  forgiving of how an LLM writes it:
  - **Order-free**: the segments may appear in **any order** —
    `Gb1 1|1-2|1 where(...):`, `where(...) 1|1-2|1 Gb1:`, etc. all mean the
    same.
  - **Optional `:` separators**: segments are normally space-separated
    (`Gb1 1|1-2|1: body`), but an **optional `:`** between any two segments is
    also accepted (`Gb1: 1|1-2|1: where(...): body`). A separator `:` is only
    consumed when another segment follows, so it never collides with the
    prefix-terminating `:`: in `Gb1: velocity = 120` the `:` terminates a
    pitch-only selector, and in `C1: C4` it terminates the `C1` pitch selector
    ahead of the bare-pitch body `C4`.
  - **No duplicates**: each segment kind may appear **at most once**. A repeated
    pitch, time, or `where()` (two pitch selectors AND-combine to the empty set)
    is **warned-and-skipped**, not a hard error: that line is dropped with a
    relayed `WARNING:` pointing at the fix — span pitches with a range
    (`C3-E3`), use one time range, or combine predicates with `&&`/`||` inside
    one `where(...)` — while the **other lines still apply**. (A hard parse
    error would abort the whole `transforms` string; warn-and-skip preserves
    partial success, matching the rest of the transform tool.)

- **Pitch selectors** (optional): Filter by MIDI pitch or note name
  - Single pitch: `C3: velocity += 10`
  - Pitch range: `C3-C5: velocity += 10` (applies to all notes from C3 to C5
    inclusive)
  - Note names follow the **same rules as bar|beat notes**: case-insensitive
    letters, ASCII (`#`/`b`) or Unicode (`♯`/`♭`) accidentals, and enharmonic
    spellings (`E#`→F, `B#`→C of the next octave, `Cb`→B of the previous octave)
    — see BarBeat-Spec. (`B` also reads as a flat, so `GB3` = `Gb3`.) The
    transform grammar shares one `pitchClassFromParts`, locked in parity with
    the bar|beat note grammar by `pitch-class-grammar-parity.test.ts`.
  - A bare pitch name is a value only for the `pitch` parameter (`pitch = C4`),
    as a selector (`C3:`), or as a function argument (`min(C3, C5)`). Assigned
    to any other parameter it is warned-and-skipped — not silently coerced to a
    MIDI number:

    ```
    velocity = b2    // skipped with a warning (b2 is not a velocity)
    ```

- **Time range selectors** (optional): Filter by bar|beat range (e.g.,
  `1|1-2|1: velocity += 10`). Both bounds are **inclusive** by default (matching
  note start time). Two opt-in forms make the end **exclusive** (half-open), so
  a selection can stop at a bar line without catching the next downbeat:
  - **Bare bar|beat point:** a single position with no `-` separator (`4|3.5:`,
    `2|1:`) targets only the note starting at **exactly** that position. It
    desugars to the degenerate inclusive range `[point, point]` — equivalent to
    writing `4|3.5-4|3.5` but without restating the bound. The beat uses the
    full bound dialect (decimals, `±n` offsets, bar-line borrow), so `2|1-n/12:`
    points just behind the bar-2 downbeat. Pairs with a pitch in either order
    (`Gb1 4|3.5:` / `4|3.5 Gb1:`).
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
  form instead. A **0-indexed bound** (`1|0-2|1`) is rejected too: beats count
  from 1 in time ranges just as in note positions (the downbeat is beat 1; for a
  pickup before it, offset from beat 1 — `1|1-n/4`). A **descending range** (end
  before start) is rejected for both ordinary ranges (`2|1-1|1`) and whole-bar
  spans (`3|*-1|*`), mirroring the pitch-range guard; equal bounds (a point
  range or single-bar span like `3|*-3|*`) stay valid.

- **`where(...)` predicate filter** (optional): a boolean test on note
  properties that further narrows which notes a line touches, **AND-combined**
  with any pitch/time selector —
  `C3-C5 where(note.velocity > 80): velocity += 20` matches notes that are in
  `C3-C5` AND louder than 80. It may also stand alone
  (`where(note.velocity < 40): velocity = 0`). Like the positional selectors it
  is **per-line** (no carry). This is the value-based selection the positional
  selectors cannot express (e.g. "delete quiet notes"). It combines freely with
  the pitch/time selectors in any order and with optional `:` separators (see
  **Selector prefix syntax** above).
  - **Grammar**: boolean operators with precedence `||` < `&&` < `!` <
    comparison < arithmetic, plus parenthesized grouping at the boolean layer.
    Comparison operators: `>`, `>=`, `<`, `<=`, `==`, `!=`. These boolean and
    comparison operators are legal **only inside `where(...)`** — an assignment
    RHS stays purely arithmetic, so a comparison there is a parse error (flat
    type story; no truthiness leaks into values). Boolean grouping
    (`a && (b || c)`, and the reflexive `(note.velocity > 80)`) is supported; a
    paren wrapping only arithmetic (`(1 + 2) > note.start`) still groups at the
    arithmetic layer.
  - **Operands** are the six intrinsic scalar note properties — `note.velocity`,
    `note.deviation`, `note.duration`, `note.probability`, `note.pitch`,
    `note.start` — combined with arithmetic, **functions**, and the usual
    literals (numbers, pitch names like `C3`, note values like `n/8`).
    `note.duration` and `note.start` are in musical beats. `note.deviation` is
    the velocity-deviation span as a plain scalar (the `vA-B` velocity range is
    authoring sugar = base velocity + this span), so it compares like any other
    property.
  - **Functions in operands**: every transform function is allowed in a
    predicate except the two that need the finalized selection — `legato()` (the
    next distinct start / clip cursor) and `seq()` (cycles by `note.index`). So
    math (`abs`, `min`, `max`, `clamp`, `round`/`floor`/`ceil`, `pow`, `wrap`,
    `reflect`), waveforms (`sin`/`cos`/`tri`/`saw`/`square`), `ramp`/`curve`,
    `quant`/`swing`, `snap`/`step`, and `clipseq` all resolve from the per-note
    position, the line's selector-bounds time range, and the clip context — e.g.
    `where(abs(note.start - 4) < 1): velocity += 20` (near beat 4, either side),
    `where(min(note.velocity, note.deviation) > 80): ...`. `rand()`/`choose()`
    are allowed but non-deterministic (random thinning).
  - **Rejected with targeted errors**: selection-derived references
    (`note.index`, `note.count`, `next.*`, `legato()`, `seq()`) — they are
    defined over the selected set, which `where()` itself determines, so they
    are unavailable while selecting; the `clip.*`/`audio.*` namespaces as bare
    variables; and `where()` on a note-count op (`ratchet`/`merge`/`split`).
  - **Float tolerance**: all six comparisons carry `SELECTOR_EPSILON` (1e-9, the
    same tolerance the pitch/time selectors use), so ULP-level drift in a
    note-op-generated `note.start`/`note.duration` can't drop a note that names
    a boundary. Inclusive operators widen by ε so a boundary value isn't missed
    (`>=` accepts down to `right - ε`, `<=` up to `right + ε`); strict operators
    narrow by ε so a boundary value isn't spuriously admitted (`>` requires
    `left > right + ε`, `<` requires `left < right - ε`); `==`/`!=` compare
    within ε. 1e-9 sits far below any musical distance, so distinct integer
    values (velocity, pitch) are never bridged. `<`/`>` remain the natural fit
    for ranges on the float-valued props (`duration`, `probability`, `start`).
  - **Evaluation**: the predicate is evaluated during note selection,
    AND-combined after the pitch/time filters. An evaluation failure (e.g. a
    note missing the referenced property) warns and excludes the note, matching
    warn-and-skip on the apply path. On audio clips (gain/pitchShift) a
    note-property predicate warns and passes through, mirroring noteOp/audio
    handling.

- **Range clamping**: Applied after modulation:
  - velocity: capped at a max of 127; `<=0` deletes the note (like duration); no
    minimum clamp (a positive sub-1 result is left as-is, not floored to 1)
  - timing: unclamped (can shift notes before/after original position)
  - probability: 0.0-1.0
  - duration: 0 or below deletes the note (like a v0 velocity), no minimum clamp
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

- `delete` (or `v0`) deletes the note · `vN` sets velocity · `v+N` / `v-N`
  adjusts velocity · `vA-B` sets a humanized random velocity range (e.g.
  `v80-120`)
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

`delete` is a readable alias for `v0` with an identical AST (`velocity = 0`), so
it deletes the matched note(s) and a selector still applies (`C1: delete`,
`where(note.velocity < 40): delete`). It is **transform-only** — the bar|beat
`notes` layer keeps `v0` — and **shorthand-only**: using it as a value
(`velocity = delete`, `1 + delete`) raises a targeted parse error, mirroring the
note-count-op-as-value guard.

The one exception is the velocity range `vA-B`, which desugars to **two**
assignments — `velocity = low` and `deviation = high - low` — matching the
bar|beat notes layer's `vA-B` exactly. This is the **persistent base velocity +
`velocity_deviation`** semantic Live shows as the per-note random-velocity range
in the clip editor, **not** a one-time `rand(A,B)` baked at transform time. Each
bound is clamped to 0-127 and the lower becomes the base, so `v120-80` ≡
`v80-120` and out-of-range bounds clamp before the deviation is computed
(`v200-250` ≡ velocity 127, deviation 0). A 0 lower bound (`v0-N`, `vN-0`,
`v0-0`) is a parse error rather than a silent delete: the base would be velocity
0, which is the delete sentinel, so the range would drop every matched note —
the `min === 0` check rejects both orderings and equal bounds with the same
targeted message the barbeat grammar uses. A selector applies to both writes, so
`C1: v80-120` produces two assignment rows in the parsed AST — still written as
one token per line. (Because Peggy grammars cannot import a shared helper, this
mapping — including the v0 guard and its error text — is duplicated from the
barbeat grammar and pinned by `velocity-range-parity.test.ts`.)

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
C3: velocity += 20

// Pitch range selector (affects C3, C#3, D3, ... up to C5)
C3-C5: velocity += 20

// Accent bass notes (C1 through C2)
C1-C2: velocity += 30

// Different modulation for high notes
C5-C7: velocity = 100

// Combine pitch range with time range
C3-C5 1|1-2|1: velocity += 10

// Multiple pitch ranges with different modulations
C1-C2: velocity += 30
C3-C5: velocity += 10
C6-C7: velocity = 100
```

### Note Property Variables

```
// Scale velocity based on pitch (higher notes louder)
velocity = note.pitch / 127 * 100

// Self-reference: halve existing velocity
velocity = note.velocity / 2

// Delay higher notes progressively
C4-C6: timing += note.pitch * 0.01

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

Audio transforms apply to the whole clip, so any note-level scoping is dropped
with a relayed warning rather than silently: a pitch selector, a time selector,
a `where()` predicate, MIDI parameters, and note-count operations all warn and
are ignored on audio clips.
