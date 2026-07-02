# Stark Specification

A literal, **round-trippable** music notation for one clip's notes. Stark is the
twin of [Abstark](./Abstark-Spec.md): its pitched (bass / melody / chords) lines
are **identical** to Abstark's, and it ships a serializer so reading a clip with
`notation: "stark"` re-emits Stark. Stark differs from Abstark in **one** place
— **drums are event-based** (a line of drum hits with `/N` durations, like a
melody of hits) rather than Abstark's positional 16th-note grid. This makes drum
patterns count by the familiar subdivision (a 4/4 bar of quarters is 4 tokens,
of eighths is 8) instead of a fixed 16-character grid.

> **Documented lossy axes.** interpret → serialize → interpret is a fixed point
> on pitch / start_time / **duration** for any legato line (every note starting
> where the previous ends — anything Stark itself produces), modulo: velocity
> bucketing (3 dynamics) and snapping any off-16th onset or non-power-of-two
> duration to the 16th grid. Overlapping notes on one line are normalized to
> legato exactly as a melody line is — **drums and pitched lines share ONE
> timing model**, so drum note-length round-trips like a melody note's. The
> authoritative implementation is the source files:
> `parser/stark-grammar.peggy`, `stark-interpreter.ts`, `stark-serializer.ts`,
> `stark-config.ts`. Stark reuses Abstark's pitched interpreter and the
> serializer's leaf primitives (temporary A/B scaffolding); the serializer's
> line-default factoring is stark-specific.

---

## Sections

A Stark string is one or more newline-separated **sections**, each headed by
`<header>: <content>`. Every section type is **event-based** — whitespace
between tokens is only a separator and has **no** rhythmic meaning; each token
advances time by its own duration:

- **Drums** — headed by a **drum name** or an **absolute pitch name** (below),
  with an optional header `/N` line default. Tokens are hits/rests.
- **Bass / melody / chords** — identical to Abstark.

Headers are case-insensitive. Mixed section types in one string (e.g. `drums` +
`melody`) are **legal but warned**. When two voices produce the same pitch at
the same start, the later note wins (a collision warning is emitted). Invalid
syntax throws a wrapped `Stark notation parse error`.

---

## Drum lines (event-based)

```
kick: X z X z            # named drum, /4 default → hits on beats 1 & 3
snare: z X z X           # rests on the quarter grid → hits on 2 & 4
hihat /8: X X X X X X X X # header /N sets the line default → eight 8th-note hats
kick: X X/8 X            # glued inline /N overrides one token
C3: X z X z              # pitch-name header (Ableton C3 = MIDI 60)
```

**Drum tokens**: `^` accent, `X` normal, `x` soft, `z` rest. Each token lasts
the **line default** (header `/N`, else `/4`) unless a `/N` is glued directly to
it (`X/8`). A rest (`z`) advances time by its duration without emitting a note.
`|` is a visual barline — it never advances time.

**Header** resolves to a fixed MIDI pitch, tried in this order (so the readable
vocabulary wins):

1. **Drum name** (fixed General MIDI pitch), each with a two-letter alias:

   | name (alias) | MIDI | name (alias) | MIDI |
   | ------------ | ---- | ------------ | ---- |
   | kick (bd)    | 36   | tom2 (mt)    | 45   |
   | rimshot (rs) | 37   | open (oh)    | 46   |
   | snare (sd)   | 38   | tom1 (ht)    | 47   |
   | clap (cl)    | 39   | perc1 (p1)   | 48   |
   | snare2 (s2)  | 40   | crash (cc)   | 49   |
   | tom4 (ft)    | 41   | perc2 (p2)   | 50   |
   | hihat (hh)   | 42   | ride (rc)    | 51   |
   | tom3 (lt)    | 43   | pedal (ph)   | 44   |

   (toms run high→low: tom1=47 … tom4=41). `hats` is also accepted as an alias
   for `hihat`. Kept in sync with Abstark's identical `DrumName` rule.

2. **Absolute pitch name** — `letter [#|b]? (-?octave)`, e.g. `C3`, `F#1`,
   `Gb-1`, using the **Ableton convention (C3 = MIDI 60)** via `pitch.ts`. A
   header that resolves to no MIDI pitch (`Cb`, out-of-range octave) is
   warn-skipped.

The **serializer** walks each line's notes, fills gaps with `z` rests, and takes
each note's own duration as its `/N` (so lengths round-trip). It then **factors
the line default**: the most common `/N` becomes the line default — written in
the header only when it is not `/4` — and every token drops its `/N` when it
matches. So a bar of quarter kicks reads `kick: X X X X` and straight eighths
read `hihat /8: X X X X X X X X`. Trailing rests are not padded (each line stops
at its last onset). It emits the drum name when one maps to the pitch and an
absolute pitch name otherwise, so every Drum-Rack pad round-trips with no
dropped notes.

---

## Pitched lines (bass / melody / chords)

Identical to Abstark — see [Abstark-Spec § Pitched lines](./Abstark-Spec.md). In
brief:

```
melody: C Eb G' z/2 A/8!
melody/8: C D E G          # /N in the header sets the line's default duration
chords: [C Eb G]/2!        # bracket notes share the chord's /N and dynamic
```

A **note token** is `letter` (`A`–`G`) + **accidental** (`#`/`b`, immediately
after the letter, so `Cb` = C-flat while a lone `b` = note B) + any-order
suffixes: **octave marks** `'`/`,` (register-relative, stackable), **duration**
`/N`, **dynamic** `!`/`?`. **Rest** = `z` (optional `/N`). **Bracket chord** =
`[<note> …]` with the `/N`/dynamic on the whole chord. Register defaults (the
MIDI pitch a bare `C` maps to): bass = C1 = 36, melody = C3 = 60, chords = C2
= 48.

---

## Durations

`/N` is an **absolute note value**, not an ABC-style multiplier: `/1` = whole (4
beats), `/2` = half, `/4` = quarter (1 beat), `/8` = eighth, `/16` = sixteenth.
A token's own `/N` overrides the line default; line defaults are `/4` for
bass/melody **and drums**, `/1` for chords, and may be overridden in the header
(`melody/8:`, `hihat /8:`).

---

## Dynamics → velocity

Three buckets: soft (`?` / `x`) 60–80, normal (bare / `X`) ~100–110, accent (`!`
/ `^`) 115–127. Velocity is randomized within the bucket on interpret;
round-trip preserves the bucket, not the exact value.

---

## Context comes from the clip, never the notation

Stark carries only what the model authors. Time signature comes from the clip
(no meter declaration in the notation); barlines (`|`) are visual/checking only
and never advance time.
