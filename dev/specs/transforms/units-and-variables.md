# Units, Variables & Operators

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
> here. Same physical duration; different unit (see
> [../BarBeat-Spec.md](../BarBeat-Spec.md)).

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

A single trailing `d` (dotted, ×3/2) or `t` (triplet, ×2/3) suffix scales the
note value, matching bar|beat: `n/4d` = dotted quarter (≡ `n3/8`), `n/4t` =
quarter triplet (≡ `n/6`), `n/8t` = eighth triplet (≡ `n/12`). Mutually
exclusive, non-stacking, and applies to any numerator (`n3/8d` = 9/16). Not the
`.` glyph (bar|beat uses `.` for decimals).

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

---

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

---

## Operators

Functions can be combined using standard arithmetic operators:

- Addition: `+`
- Subtraction: `-`
- Multiplication: `*`
- Division: `/` (division by zero yields 0, not an error)
- Modulo: `%` (uses wraparound behavior for negative numbers, modulo by zero
  yields 0)

Parentheses for grouping: `(expression)`
