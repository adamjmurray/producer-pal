# bar|beat Specification

A precise, stateful music notation format for MIDI sequencing in Ableton Live.

> **Meter-invariant vs meter-relative.** Two kinds of time quantity run through
> this notation. **Note values** (anything wearing the `n` sigil: `n/4`, the
> `±n` beat offset, `@n/12` steps) are a fraction of a whole note and are
> **meter-invariant** — `n/12` is an eighth triplet in every time signature.
> **Bars and grid beats** (`Nbar`, `@Nbar`, the integer in `bar|beat`) are
> **meter-relative** — they scale with the time signature. Everything resolves
> through "musical beats" (denominator-beats); the time-signature denominator
> only appears as a basis change to express a note value in that unit, and it
> cancels out, so it never alters a note value's musical meaning. A bare number
> or bare fraction is never a note value (it's beats / arithmetic) — the `n`
> sigil is the sole marker of the meter-invariant side.

---

## Core Syntax

```
[v<velocity>] [n<duration>] [p<probability>] note [note ...] bar|beat [bar|beat ...] [@<bar>=<source>]
```

### Components:

- **Start Time (`bar|beat`)** Time position that emits buffered notes.
  - `bar` – 1-based bar number (integer, required)
  - `beat` – 1-based beat number within bar, **meter-relative**. Sub-beat
    positions take one of two forms:
    - a **decimal** (`2|3.5`) — a fraction of a _musical beat_, so the decimal
      itself is **meter-relative** (`2|3.5` is "half a beat past beat 3", and a
      beat is whatever the meter says);
    - a grid beat plus a `±n` **note-value offset** — `1|1+n/12` = beat 1 + an
      eighth triplet, `1|2-n/24` nudges just behind beat 2. The offset is a
      whole-note fraction (same `n` grammar as Duration), so — like any note
      value — it is **meter-invariant** in absolute time: `n/12` is always an
      eighth triplet. Its size measured _in the local beat unit_ changes only
      because the beat unit itself changes (1/3 of a quarter-beat in 4/4, 2/3 of
      an eighth-beat in 6/8 — the same musical duration). The grid beat it
      displaces, by contrast, **is** meter-relative. The displaced beat may be
      an **integer or a decimal** — `1|1.5+n/4` is "beat 1.5 plus a quarter
      note" — so a decimal sub-beat and a note-value offset compose freely.

    **The two forms are NOT interchangeable.** The decimal is meter-relative and
    the `±n` offset is absolute, so they denote the same time **only in `x/4`
    meters**. In compound/odd meters they diverge: in 6/8, `1|1.5` is half a
    musical (eighth) beat = 0.25 quarter, while `1|1+n/8` is a full eighth note
    = 0.5 quarter — off by a factor of 2. Reach for the decimal when you mean "a
    fraction of the beat" and the `±n` offset when you mean an exact note value.

    Bare fractions (`4/3`) and bar-relative mixed numbers (`1+1/3`) are rejected
    — note values always wear the `n`. A `-n` offset may pull a position earlier
    than its bar's downbeat — `2|1-n/12` is "an eighth triplet before the bar-2
    downbeat" and resolves into bar 1 (beat 4⅔ in 4/4) by borrowing across the
    bar line. A pull before `1|1` is allowed too: it resolves to negative time
    (a note before the clip start, which Live accepts). Authoring warns once
    when a note lands before the clip start.

    **Canonical serialization.** On output a position is spelled by a single
    canonical formatter (shared with note serialization): an integer or
    **dyadic** sub-beat as a plain decimal (`1|2`, `1|1.5`); a **non-dyadic
    (tuplet)** position as its exact `±n` offset (`1|1+n/12`, never the lossy
    `1|1.333`); and a position before the clip start, within bar 1, as a
    `1-n<fraction>` offset (e.g. `1|1-n/12`). This makes read → re-author → read
    a fixed point for tuplet and negative positions. A genuinely off-grid
    position ≥ 1 falls back to a bare decimal beat (`1|2.789`); a genuinely
    off-grid position **before** the downbeat (no bare sub-1 decimal beat
    exists) falls back to the `1-n<beats>/4` decimal-numerator escape, so it
    round-trips losslessly too.

  - **Repeat patterns**: `beat x times @ step` generates multiple positions.
    `step` uses the same note-value duration grammar as `n` (see Duration):
    `@n<fraction>` note value, `@Nbar` meter-aware bars, or `@Nbar±n<fraction>`
    mixed (the tail may add or subtract, e.g. `@1bar-n/4` = a near-bar advance).
    A bare `@/4` (note value with no `n`) and a bare `@1` (beats) are both
    rejected — authoring stays note-value-only. A step that resolves to zero or
    less (e.g. `@1bar-n4/4` in 4/4) is rejected.
    - Example: `1|1x4@n/4` → 4 positions a quarter note apart: beats 1,2,3,4 in
      4/4
    - Example: `1|1x3@n/12` → eighth-note triplets at beats 1, 4/3, 5/3 in 4/4
    - Example: `1|1x4@1bar` → 4 positions one bar apart
    - Example: `1|1x3@1bar-n/4` → 3 positions a near-bar apart: beats 1, 4, 7 in
      4/4
  - Notes are emitted ONLY at time positions
  - Buffered pitches persist and re-emit at subsequent time positions
  - Requires whitespace separation from following elements

- **Probability (`p<0.0–1.0>`)**
  - Sets note probability for following notes until changed
  - 1.0 = note always plays, 0.0 = note never plays
  - Default: 1.0
  - Requires whitespace separation from following elements

- **Velocity (`v<0–127>` or `v<min>-<max>`)**
  - Sets velocity for following notes until changed
  - Single value: `v100` (fixed velocity)
  - Range: `v80-120` or `v120-80` (random velocity between min and max,
    auto-ordered)
  - Range lower bound must be ≥1: a 0 lower bound (`v0-N`, `vN-0`, `v0-0`) is a
    parse error — `vA-B` desugars to base velocity `min`, and a base velocity of
    0 is the delete sentinel, so the range would silently delete every note it
    touches. The `min === 0` check catches both orderings and equal bounds.
  - Special: `v0` deletes earlier notes with matching pitch and time (see Note
    Deletion section)
  - Default: 100
  - Requires whitespace separation from following elements

- **Duration (`n`)**
  - Sets duration for following notes until changed
  - **Absolute note value**: written as a fraction of a whole note,
    `n<numerator>/<denominator>`. Numerator defaults to 1 (`n/4` == `n1/4`).
    Denominator is **mandatory** — bare integers (`n1`), bare decimals (`n0.5`),
    and mixed numbers (`n1+1/2`) are invalid and raise a parser error. A
    _decimal_ numerator is valid only with a denominator present — it is the
    off-grid escape `n<beats>/4` (see the read contract below), not something
    you author by hand
  - Common values: `n/1` whole, `n/2` half, `n/4` quarter, `n/8` eighth, `n/16`
    sixteenth, `n3/8` dotted quarter, `n5/4` five quarter notes
  - Tuplets: `n/3` half-note triplet, `n/6` quarter triplet, `n/12` eighth
    triplet, `n/24` sixteenth triplet (denominator = how many fit in a whole
    note)
  - **Dotted (`d`) / triplet (`t`) suffix**: a single trailing `d` scales the
    note value ×3/2, `t` ×2/3. `n/4d` = dotted quarter (≡ `n3/8`), `n/4t` =
    quarter triplet (≡ `n/6`), `n/8t` = eighth triplet (≡ `n/12`). Mutually
    exclusive and non-stacking (`n/4dt`, `n/4dd` are errors); applies to any
    numerator (`n3/8d` = 9/16). `.` is deliberately NOT the dotted glyph here —
    it is bar|beat's decimal glyph (`n1.5/4`, `1|2.5`), so it would be ambiguous
    (stark uses `.`, having no decimals). The suffix rides the shared note-value
    fraction, so it also works on `±n` beat offsets (`1|1+n/8t`) and `@n` step
    intervals (`@n/8t`)
  - Meter-independent: `n/4` is always one quarter note, in 4/4, 6/8, 5/4, etc.
  - **Bar durations**: `Nbar` (meter-aware, e.g. `1bar` = hold one bar in any
    meter) and `Nbar±n<fraction>` mixed (e.g. `1bar+n3/4`, or `1bar-n/16` =
    "almost a full bar") are also valid inline durations. The tail may add or
    subtract the note value; the `bar` term never wears an `n`, and the
    note-value tail keeps its own `n`. So `n1bar` is invalid — write `1bar`. The
    `n`-prefixed bar forms (`n1bar`, `n/1bar`, `n3/4bar`) are a common model
    hallucination, so every duration site rejects them with a targeted error
    ("bar durations don't use the `n` prefix — write Nbar"), not the generic
    format error. A plural `bars` (`2bars`) is accepted as an input-tolerance
    alias of `Nbar` on every duration site; serialized output is always singular
    (`2bar`). The minus form is input-tolerance only — the serializer emits the
    canonical on-grid `n<fraction>`/`Nbar`, never a `-n` tail
  - Default: `n/4` (one quarter note)
  - Requires whitespace separation from following elements
  - NOTE: clip `length` and arrangement durations use this same duration
    grammar: `Nbar` (meter-aware, e.g. `4bar`), `n<fraction>` note value (e.g.
    `n/4` quarter, `n/8` eighth, `n3/8` dotted quarter), or `Nbar±n<fraction>`
    mixed (e.g. `1bar+n/4`, `1bar-n/16`). Off-grid lengths with no clean
    note-value form (sample-derived audio lengths) use a **decimal-numerator
    escape pinned to `/4`**: `n<beats>/4` == `<beats>` Ableton beats
    (`n1.9638/4` = 1.9638 quarters, since `n<x>/4` = x quarters). This keeps the
    escape under the `n` sigil so the duration vocabulary stays uniform. Bare
    numbers (e.g. `1.9638`), bare _fractions_ (`1/4`), and bare decimals (`0.5`)
    are all **invalid** as durations — a duration is always a bar count or an
    `n`-prefixed note value, never a bare scalar; the `n` prefix marks a note
    value everywhere
  - NOTE (read contract): when a clip is serialized back to notation, a MIDI
    note duration that lands on a representable note value (within float
    epsilon) emits that exact `n<fraction>`; a genuinely off-grid duration (e.g.
    a sample-derived or computed length with no clean note value) emits the same
    `n<beats>/4` decimal-numerator escape, so it round-trips losslessly rather
    than snapping to a wrong note value. A clip/arrangement `length` behaves
    identically: exact `n<fraction>`/`Nbar` on the grid (within ~1e-6),
    otherwise the `n<beats>/4` escape at fixed precision (trailing zeros
    stripped). `@step` intervals share the same formatter. The
    implicit-numerator power-of-two dotted (`n/1d`…`n/64d`) and triplet
    (`n/1t`…`n/64t`) families read back **with** the `d`/`t` suffix (dotted
    quarter → `n/4d`, eighth triplet → `n/8t`) in place of the equivalent plain
    fraction; other numerators/tuplets (`n3/8d` = 9/16, quintuplets) keep the
    plain fraction. `±n` beat-offset positions are not sugared — they keep the
    plain fraction (`1|1+n/12`)

- **Note (`C4`, `Eb2`, `F#3`, etc.)**
  - Note names follow standard pitch notation using:
    - A–G (case-insensitive) with an optional accidental: sharp `#`, flat `b`,
      or the Unicode glyphs `♯` (U+266F) / `♭` (U+266D). An uppercase `B` also
      reads as a flat, so an all-caps `GB3` parses as `Gb3`.
    - All twelve pitch classes are spellable both ways: C, C#/Db, D, D#/Eb, E,
      F, F#/Gb, G, G#/Ab, A, A#/Bb, B.
    - Enharmonic spellings are accepted and normalized: `E#`→F, `Fb`→E, and the
      two octave-wrapping edges `B#`→C of the next octave, `Cb`→B of the
      previous octave (the `(octave+2)*12+value` formula carries the wrap: `B#3`
      = `C4`, `Cb4` = `B3`).
    - A double accidental (`Cbb`, `C##`) or a non-letter (`H`) is rejected.
  - Octave is a signed integer (e.g., `C3`, `A#-1`)
  - MIDI pitch is computed as `(octave + 2) * 12 + pitchClassValue`
  - Valid MIDI range is 0–127. Range is **not** enforced by the parser — an
    out-of-range pitch (e.g. `C9`, `C-3`) parses successfully and the
    interpreter **skips the note and warns** (it does not clamp: fabricating a
    nearby pitch for a typo would invent music). One bad note never aborts the
    rest of the clip.

- **Bar Copy (`@N=`, `@N=M`, `@N=M-P`, `@N-M=`, `@N-M=P`, `@N-M=P-Q`)**
  - Duplicates bars of notes to other positions
  - Single destination: `@N=` (previous), `@N=M` (specific bar), `@N=M-P`
    (source range)
  - Range destination: `@N-M=` (previous), `@N-M=P` (single source), `@N-M=P-Q`
    (tiling)
  - Updates current time position to destination start
  - Does not emit buffered pitches (clears buffer instead)
  - See Bar Copy section for detailed behavior

- **Events**
  - Multiple notes at same time separated by whitespace
  - No commas between elements
  - All state (time, probability, velocity, duration) persists across events

- **Targeted parse errors** — a few malformed tokens raise a specific,
  fix-suggesting error instead of peggy's generic "Expected …", because each is
  a recognizable model mistake with a single right answer:
  - `1|0` (and `1|0.x`) — beats are **1-indexed**; the downbeat is beat 1
    (`1|1`). For a pickup before it, offset from beat 1 (`1|1-n/4`). The
    `1|0`-as-pickup reading is deliberately **not** taught.
  - `1.1`, `1:1` — positions use a **pipe** (`1|1`), not `.` or `:`.
  - a bare integer standing alone (e.g. `60`) — use a **note name** (`C3`), not
    a raw MIDI number.
  - `1|1-2|1` — a position is a **single** `bar|beat`; a beat range belongs in a
    transform time filter, not a bar|beat position.

- **Standalone position fields share the 1-indexing gate.** Bar|beat positions
  that arrive as their own tool-input field (create-clip `start` / `firstStart`
  / `arrangementStart`, locator `time`, playback loop start/end) bypass the
  notes grammar, so they are guarded by `validateBarBeatPosition` at the field
  boundary. It throws the **same** 1-indexing error as the `1|0` / zero-bar
  parse-error above, keeping the two surfaces consistent. (The low-level
  `barBeatToMusicalBeats` / `barBeatToAbletonBeats` conversions stay
  intentionally **never-throw** — they allow negative time so a `-n` pickup
  resolves before the origin, and run per-note in transform `timeRange` checks
  where a throw would spam — so the gate lives at the field boundary, not in the
  conversion.)
  - **Negative time is by design, not the zero-index mistake:** a pickup before
    the downbeat is the offset form `1|1-n/4` (which keeps the beat literal at 1
    and resolves to a negative beat); it passes the gate. Only a literal `1|0` /
    `0|1` / `1|01` is the rejected 1-indexing mistake.

---

## Note Emission Rules

Notes are emitted ONLY at time positions (`bar|beat`). Pitches encountered
before a time position are buffered and emitted together when a time is reached.

### Pitch Buffering

- **Consecutive pitches form chords:** `C3 E3 G3 1|1` emits all three notes at
  1|1
- **First pitch after time clears buffer:** `C1 1|1 D1 1|2` emits C1 at 1|1,
  then D1 at 1|2
- **Pitches persist until changed:** `C1 1|1 1|2 1|3` emits C1 at three
  positions

### State Capture

State (velocity, duration, probability) is captured with each pitch when
buffered:

```
v100 C3 v80 E3 1|1  // C3 has v100, E3 has v80
```

State changes after time positions update all buffered pitches:

```
v100 C4 1|1 v90 1|2  // C4@v100 at 1|1, C4@v90 at 1|2
```

### Warnings

The parser warns about incomplete or inefficient notation:

- Pitches buffered but no time position to emit them
- Time positions with no pitches
- State changes after pitches but before time positions (wasted state)

The interpreter also warns (without throwing) on out-of-range values, matching
the transforms and code-exec paths:

- Velocity / velocity-range / probability outside their valid range are
  **clamped + warned** (velocity to 0–127, probability to 0.0–1.0)
- An out-of-range pitch is **skipped + warned** (the note is dropped, not
  clamped)

These are console warnings, not errors - parsing completes successfully.

## State Management

All components are stateful:

- **Probability**: Set with `p<value>`, applies to following notes until changed
- **Velocity**: Set with `v<value>` or `v<min>-<max>`, applies to following
  notes until changed
- **Duration**: Set with `n<value>`, applies to following notes until changed

NOTE (read contract): when a clip is serialized back to notation, the **first
note always carries an explicit `v` and `n`**, even when they match the format
defaults (`v100`, `n/4`) — so a reader never has to know the defaults to know
the opening note's core properties. Velocity and duration after that are emitted
only on change (the normal stateful behavior). Probability stays change-only: a
default-probability (`p1`) opener emits no `p` token. This is a serializer
choice, not a grammar rule — authoring may still omit a leading `v`/`n` and rely
on the defaults.

NOTE (read contract): serialized output places **one batch per line** — a
batch's state changes, pitches, and time position(s) on a single line, the next
batch on the next line. Newlines are whitespace to the parser (an element
separator like a space), so this is purely a readability choice and round-trips
unchanged; authoring may use any whitespace, including none-but-required between
elements. In drum mode each drum pad gets its own line.

---

## Feature specs

Each of these is a self-contained feature with its own syntax, rules, and
examples. Read the one you need.

| Spec                                               | Covers                                                   |
| -------------------------------------------------- | -------------------------------------------------------- |
| [v0-deletion.md](barbeat/v0-deletion.md)           | Deleting notes with `v0`                                 |
| [repeat-patterns.md](barbeat/repeat-patterns.md)   | `*n` repeat syntax                                       |
| [pattern-brackets.md](barbeat/pattern-brackets.md) | `[...]` streams and cursors                              |
| [bar-copy.md](barbeat/bar-copy.md)                 | `@` bar copy, tiling, `@clear`                           |
| [internals.md](barbeat/internals.md)               | Parsing rules, AST schema, interpreter output, precision |

---

## Examples

```
// C major triad at bar 1, beat 1
C3 E3 G3 1|1

// Drum pattern - kick on every beat (pitch persistence)
C1 1|1 1|2 1|3 1|4

// Layered drum pattern - kick on 1 & 3, snare on 2 & 4
C1 1|1 1|3  D1 1|2 1|4

// Simple melody with state changes
v100 n/4 C3 1|1 D3 1|2 E3 1|3 F3 1|4   // quarter notes
v80 n/2 G3 2|1                          // half note

// Sub-beat timing with floating points (positions stay decimal)
v100 n/16 C3 1|1 D3 1|1.5 E3 1|2.25 F3 1|3.75

// Duration examples — absolute note values
n/2 C3 1|1       // half note (2 quarters)
n/4 C3 1|1       // quarter note (default)
n/8 C3 1|1       // eighth note
n/16 C3 1|1      // sixteenth note
n3/8 C3 1|1      // dotted quarter (3 eighths)
n3/16 C3 1|1     // dotted eighth (3 sixteenths)
n/12 C3 1|1,1+n/12,1+n/6  // eighth-note triplets (3 per quarter): beats 1, 4/3, 5/3
n/6 C3 1|1,1+n/6,2+n/12   // quarter-note triplets (3 per half): beats 1, 5/3, 7/3
n/1 C3 1|1       // whole note (4 quarters)
n2/1 C3 1|1      // 2 whole notes (8 quarters)
n5/4 C3 1|1      // 5 quarter notes (e.g. fills a 5/4 bar)

// Repeat patterns - quarter-note step
C1 1|1x4@n/4    // Kick on every beat (repeat syntax)
C1 1|1,2,3,4   // Same as above (comma-separated beats still supported)

// Repeat patterns - triplets
n/12 C3 1|1x3@n/12            // eighth-note triplets (3 per quarter)
n/12 C3 1|1x3 1|2x3          // step defaults to n, two sets of triplets

// Repeat patterns - 16th notes
n/16 Gb1 1|1x16@n/16    // 16 sixteenths = 4 quarters (a full bar in 4/4)
n/16 Gb1 1|1x16        // same — step defaults to n value

// Repeat patterns - mixed with regular beats
C1 1|1x4@n/4 D1 1|2,4   // Kick on all beats, snare on 2 & 4

// Repeat patterns - bar overflow
C3 1|3x6@n/4  // Starts beat 3, overflows into bar 2 in 4/4

// Drum pattern with probability and velocity variation
v100 n/16 p1.0 C1 v80-100 p0.8 Gb1 1|1
p0.6 Gb1 1|1.5
v90 p1.0 D1 v100 p0.9 Gb1 1|2

// Chord progression
C3 E3 G3 1|1  D3 F3 A3 1|2  E3 G3 B3 1|3  F3 A3 C4 1|4

// Velocity-shaped chord
v127 C3 v100 E3 v80 G3 1|1

// Same pitches with varying velocity (state updates after time)
v100 C4 G4 1|1 v90 1|2 v80 1|3 v70 1|4

// Note deletion with v0
C3 D3 E3 1|1 v0 C3 1|1  // D3 and E3 remain (C3 deleted)

// Note deletion after bar copy
C3 D3 E3 1|1  @2=1  v0 D3 2|1  // Bar 1: C3 D3 E3, Bar 2: C3 E3
```
