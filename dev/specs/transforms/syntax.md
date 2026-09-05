# Transform Syntax

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
    — see [../BarBeat-Spec.md](../BarBeat-Spec.md). (`B` also reads as a flat,
    so `GB3` = `Gb3`.) The transform grammar shares one `pitchClassFromParts`,
    locked in parity with the bar|beat note grammar by
    `pitch-class-grammar-parity.test.ts`.
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

---

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
