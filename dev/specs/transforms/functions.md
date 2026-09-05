# Transform Functions

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

---

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
