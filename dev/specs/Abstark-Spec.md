# Abstark Specification

A literal, **round-trippable** music notation for one clip's notes. Abstark
spells pitch literally (no key, no scale, no snapping), spells accidentals
explicitly, uses absolute `/N` durations, and ships a **serializer** so reading
a clip with `notation: "abstark"` re-emits Abstark rather than falling back to
bar|beat. Its twin [Stark](./Stark-Spec.md) shares Abstark's pitched syntax and
differs only in drums (Stark's are event-based; Abstark's are the positional
16th-note grid below).

> **Documented lossy axes (the only ones).** interpret → serialize → interpret
> is a fixed point on pitch / start_time / duration, modulo: velocity bucketing
> (3 dynamics), and 16th-note-grid quantization of drum timing. Pitch and octave
> are exact (literal pitch + register-relative octave marks), so the fidelity
> Stark lacks is recovered. The authoritative implementation is the
> grammar/source files: `parser/abstark-grammar.peggy`,
> `abstark-interpreter.ts`, `abstark-serializer.ts`, `abstark-config.ts`.

---

## Sections

An Abstark string is one or more newline-separated **sections**, each headed by
`<header>: <content>`. Two timing models coexist by section type — **do not
carry grid-thinking into a pitched line:**

- **Drums** — positional. Every non-whitespace, non-barline character advances
  one 16th-note step. Headed by either a **drum name** or an **absolute pitch
  name** (below).
- **Bass / melody / chords** — event-based. Duration is explicit (`/N`);
  whitespace between tokens has **no** rhythmic meaning.

Headers are case-insensitive. Mixed section types in one string (e.g. `drums` +
`melody`) are **legal but warned** (musically unusual: GM drum pitches and
melodic pitches in one clip). When two voices produce the same pitch at the same
start, the later note wins (a collision warning is emitted).

---

## Drum lines

```
kick: X.X. ....      # named drum
C3:   X... ....      # pitch-name header (Ableton C3 = MIDI 60)
Gb3:  ..x. ..x.      # pad with no name → absolute pitch name (flats on output)
```

**Drum tokens** (one character = one 16th step): `^` accent, `X` normal, `x`
soft, `.` rest. Whitespace groups visually and `|` is a visual barline — neither
advances time.

**Header** is resolved to a MIDI pitch by:

1. **Drum name** (fixed General MIDI pitch) — tried first, so the readable
   vocabulary wins:

   | name (alias) | MIDI | name (alias) | MIDI |
   | ------------ | ---- | ------------ | ---- |
   | kick (bd)    | 36   | tom3 (lt)    | 43   |
   | rimshot (rs) | 37   | tom2 (mt)    | 45   |
   | snare (sd)   | 38   | open (oh)    | 46   |
   | clap (cl)    | 39   | tom1 (ht)    | 47   |
   | hihat (hh)   | 42   | crash (cc)   | 49   |
   |              |      | ride (rc)    | 51   |

   `hats` is also accepted as an alias for `hihat`.

2. **Absolute pitch name** — `letter [#|b]? (-?octave)`, e.g. `C3`, `F#1`,
   `Gb-1`. Uses the codebase-canonical **Ableton convention (C3 = MIDI 60)** via
   `pitch.ts` — _not_ the pitched-line register convention below. A pitch-name
   header is unambiguous against pitched lines (those are keyword-led) and
   against drum aliases (two letters, no trailing digit). A header that resolves
   to no MIDI pitch (`Cb`, out-of-range octave) is warn-skipped.

The **serializer** emits the drum name when one maps to the pitch (readability)
and an absolute pitch name otherwise — so every Drum-Rack pad round-trips with
no dropped notes.

---

## Pitched lines (bass / melody / chords)

```
melody: C Eb G' z/2 A/8!
melody/8: C D E G          # /N in the header sets the line's default duration
chords: [C Eb G]/2!        # bracket notes share the chord's /N and dynamic
```

A **note token** is, in order: `letter` (`A`–`G`, case-insensitive) +
**accidental** (`#`/`b`, _immediately after the letter_, so `Cb` = C-flat while
a lone `b` = note B) + suffix modifiers in **any order**:

- **octave marks** `'` (up) / `,` (down), stackable — shift from the register
  default.
- **duration** `/N` — absolute note value (§ Durations). At most one.
- **dynamic** `!` accent / `?` soft. Omit = normal. At most one.

The suffix glyph classes are disjoint (`' ,` vs `/N` vs `! ?`), so `Eb''/8!`,
`Eb/8''!`, and `Eb!/8''` parse identically. The serializer always emits one
canonical order: pitch → accidental → octave → `/duration` → dynamic.

**Rest** = `z` with optional `/N` (`z/4`). **Bracket chord** =
`[<note> <note> ...]` with optional `/N` and dynamic applied to the whole chord;
inner notes follow the pitch rules (letter + accidental + octave), no per-note
duration/dynamic.

**Register defaults** (the MIDI pitch `C` maps to; octave marks shift from
here):

| line   | `C` maps to | MIDI |
| ------ | ----------- | ---- |
| bass   | C2          | 36   |
| melody | C4          | 60   |
| chords | C3          | 48   |

> Note the two octave conventions are intentional and separate: pitched lines
> use **register-relative** marks (no octave numbers; `C` = the register
> default), while drum pitch-name headers use **absolute Ableton note names**
> (C3 = 60). They never share syntax, so there is no ambiguity.

---

## Durations

`/N` is an **absolute note value, not an ABC-style multiplier of a unit
length**: `/1` = whole (4 beats), `/2` = half, `/4` = quarter (1 beat), `/8` =
eighth, `/16` = sixteenth. A token's own `/N` overrides the line default; line
defaults (pitched lines only) are `/4` for bass/melody and `/1` for chords, and
may be overridden in the header (`melody/8:`). A `/N` on a **drum** line has no
meaning in 1.0 (drum timing is positional).

---

## Dynamics → velocity

Three buckets: soft (`?` / `x`) 60–80, normal (bare / `X`) ~100–110, accent (`!`
/ `^`) 115–127. Velocity is randomized within the bucket on interpret;
round-trip preserves the bucket, not the exact value.

---

## Context comes from the clip, never the notation

Abstark carries only what the model authors. Time signature comes from the clip
(no meter declaration in the notation); barlines (`|`) are visual/checking only
and never advance time. Invalid syntax throws a wrapped
`Abstark notation parse error`.
