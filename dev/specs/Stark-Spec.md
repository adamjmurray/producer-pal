# Stark Specification

An ultra-minimal music notation for small/weak LLMs ("small-model mode"). Stark
trades expressiveness for a tiny, low-ambiguity token alphabet that small models
can emit reliably. It is currently **input-only**: a parser/interpreter turns
Stark into MIDI note events, but there is no serializer yet, so reading a clip
with `notation: "stark"` falls back to bar|beat (see **Serialization** below).

> **Lossy by design.** Stark discards information that small models struggle to
> place: exact velocity (3 dynamic buckets), exact octave (auto-chosen per
> register), sub-16th and tuplet timing (16th-note grid floor), and chromatic
> pitch (letters snap to the configured scale). It is a coarse, opinionated
> down-projection of MIDI, not a faithful encoding. Round-trip fidelity is
> bounded by this vocabulary, not by interpreter/serializer cleverness — see the
> grammar/source files (`parser/stark-grammar.peggy`, `stark-interpreter.ts`,
> `stark-interpreter-helpers.ts`, `stark-config.ts`) for the authoritative
> implementation.

---

## Modes

A Stark string is in exactly one of four modes, selected by line header(s):

- **Drums** — one or more lines, each `<drumname>: <hits>`. Multiple drum lines
  are newline-separated and layered.
- **Bass** — a single `bass: <notes>` line.
- **Melody** — a single `melody: <notes>` line.
- **Chords** — a single `chords: <chords>` line.

Headers are case-insensitive. There is no mode-mixing within one string (no
melody + drums together); each clip's notation is one mode.

---

## Tokens and Grid

A line's content is a sequence of single-character tokens (plus `7` for chord
sevenths and `/` bar markers). **Spacing sets the note value:**

- token **followed by whitespace** → **quarter note** (1.0 beat)
- token **packed** (no trailing whitespace) → **16th note** (0.25 beat)

The 16th note is the grid floor; the quarter is the only coarser value. There is
**no 8th-note, dotted, or triplet token** — 8th-note rhythms are written as
packed 16ths with rests (`x.x.`), and longer notes come from sustain (`-`).
Triplets and swing are not expressible.

```
kick: X x X x      // four quarter-note hits → beats 1,2,3,4 (4/4)
hihat: xxxx        // four 16th-note hits   → beats 1, 1.25, 1.5, 1.75
kick: X . X .      // hit, rest, hit, rest  → beats 1 and 3
```

### Bar marker `/`

`/` advances to the next bar's downbeat (time resets to `(bar-1) * beatsPerBar`,
using the time-signature numerator). It also resets the sustain target in
bass/melody/chords modes, so a sustain immediately after `/` has nothing to
extend.

```
kick: X x / X x    // bar 1 beats 1,2; bar 2 beats 1,2 → start_times 0,1,4,5 (4/4)
```

---

## Drums Mode

`<drumname>: <hits>` — one line per drum. Drum names map to fixed General MIDI
pitches; each has a short alias:

| Name      | Alias | MIDI |
| --------- | ----- | ---- |
| `kick`    | `bd`  | 36   |
| `snare`   | `sd`  | 38   |
| `hihat`   | `hh`  | 42   |
| `open`    | `oh`  | 46   |
| `tom1`    | `ht`  | 47   |
| `tom2`    | `mt`  | 45   |
| `tom3`    | `lt`  | 43   |
| `ride`    | `rc`  | 51   |
| `crash`   | `cc`  | 49   |
| `clap`    | `cl`  | 39   |
| `rimshot` | `rs`  | 37   |

### Hit tokens

- `X` — loud hit
- `x` — soft hit
- `^` — accent hit
- `.` — rest (advances time, no note)
- `-` — **treated as a rest** (drums don't retrigger/sustain; advances time)

```
kick:  X . X .
snare: . X . X
hihat: xxxxxxxx
```

---

## Bass / Melody Mode

`bass: <notes>` or `melody: <notes>` — a single monophonic voice.

### Note tokens

- `A`–`G` — loud note
- `a`–`g` — soft note
- `.` — rest
- `-` — **sustain**: extends the previous note's duration (a leading sustain
  with nothing to extend just advances time)

Letter names are **snapped to the configured scale**: each natural pitch class
is mapped to the nearest in-scale pitch class (`applyScale`). There are no
accidentals in the token set; chromatic notes are not expressible.

**Octave is auto-chosen**, not written:

- The **first** note is placed near the middle of the mode's register.
- Each later note picks the octave that minimizes the interval from the previous
  note (voice-leading), clamped to the register (`chooseOctave`).

Registers (`stark-config.ts`; octave is −1 vs standard pitch-name octave, so
octave 3 = standard C2 = MIDI 36):

| Mode   | Default      | Range              |
| ------ | ------------ | ------------------ |
| Bass   | MIDI 36 (C2) | MIDI 24–48 (C1–C3) |
| Melody | MIDI 60 (C4) | MIDI 48–72 (C3–C5) |

```
bass:   C D E F     // C major, bass register
melody: E G A       // C major, melody register
bass:   C - - E     // C held for a whole note, then E (sustain extends)
```

---

## Chords Mode

`chords: <chords>` — a sequence of diatonic chords.

### Chord tokens

- `A`–`G` — chord root, loud
- `a`–`g` — chord root, soft
- trailing `7` — add a diatonic seventh (`C7`, `d7`)
- `.` — rest
- `-` — **sustain**: extends every note of the most recent chord

The **quality is inferred from the scale degree** (diatonic triads/sevenths per
`getChordQuality`), not written — e.g. in C major, `C` is major, `D` is minor,
`B` is diminished. Chords are voiced as a stacked triad (or tetrad with `7`) in
a **fixed register** (`CHORD_OCTAVE` 4 → MIDI 48 / C3). Inversions and open
voicings are not expressible.

```
chords: C F G C     // I–IV–V–I triads in C major
chords: C7          // Cmaj7 (diatonic 7th in C major)
chords: C - F       // C triad held for a half note, then F
```

---

## Dynamics → Velocity

Tokens carry one of three dynamic levels, each randomized within a range
(`stark-config.ts`):

| Level  | Tokens           | Velocity range |
| ------ | ---------------- | -------------- |
| soft   | `x`, `a`–`g`     | 60–80          |
| loud   | `X`, `A`–`G`     | 100–110        |
| accent | `^` (drums only) | 115–127        |

All notes are emitted with `probability: 1.0`.

---

## Scale

Bass/melody/chords modes take a scale string of the form `"<Root> <Type>"` (e.g.
`"C Major"`, `"Eb Minor"`), defaulting to **C Major**. Supported types: `major`,
`minor`, `dorian`, `phrygian`, `lydian`, `mixolydian`, `aeolian`, `locrian`. The
root accepts standard pitch-class names with accidentals (`pitchClassToNumber`).
Drums mode ignores the scale.

---

## Interpreter Output

`interpretNotation(starkExpression, { timeSigNumerator, scale })` returns
`NoteEvent[]` with the same shape as the bar|beat interpreter (`pitch`,
`start_time`, `duration`, `velocity`, `probability`). `start_time` and
`duration` are in Ableton beats (quarter notes). Invalid syntax throws a wrapped
`Stark notation parse error`.

---

## Serialization (read-back)

> **Status: NOT YET IMPLEMENTED.** There is no Stark serializer.
> `formatNotation` has no `stark` branch, so a clip read with
> `notation: "stark"` is serialized as **bar|beat**
> (`src/notation/notation.ts`). This is a deliberate fallback, not a bug — but
> it breaks input/output symmetry (you can author in Stark but never read Stark
> back).

A Stark serializer (`NoteEvent[]` → Stark) is planned to restore symmetry. Its
fidelity is **capped by the grammar above**, so it is a best-effort, lossy
down-projection — read → author → read is **not** a fixed point. The design must
resolve:

- **Mode classification.** Arbitrary MIDI doesn't announce its mode. Heuristics:
  all pitches on GM drum pitches → drums; a single monophonic voice → bass or
  melody (by register); simultaneous-note stacks → chords.
- **Scale inference / context.** Pitch-class → letter requires a scale; the
  serializer needs the clip's scale (config or inferred) and must handle
  out-of-scale pitches (snap + drop, or fall back).
- **Velocity → bucket, pitch → register, timing → 16th grid.** All quantized;
  document the rounding rules.

Until implemented, the bar|beat fallback stands (lossless and more informative).

### Planned grammar enhancements (deferrable follow-ups)

Tighter round-trips require enriching the **grammar** (parser + interpreter +
serializer together), not just the serializer. Each trades away Stark's
minimalism, so they are tracked separately and are not prerequisites for the v1
serializer:

- 8th-note spacing tier (avoid faking 8ths as packed 16ths)
- tuplet / swing support (triplets are currently inexpressible)
- octave markers for wide leaps (e.g. `C+` / `C-`)
- accidentals for chromatic notes outside the scale
- finer dynamics than 3 buckets
- chord voicing / inversion hints
