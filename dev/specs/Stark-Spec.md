# Stark Specification

A literal, **round-trippable** music notation for one clip's notes. Stark spells
pitch literally (no key, no scale, no snapping), spells accidentals explicitly,
uses absolute `/N` durations, and ships a **serializer** so reading a clip with
`notation: "stark"` re-emits Stark rather than falling back to bar|beat. Every
section is **event-based**: drums are a line of drum hits with `/N` durations
(like a melody of hits), so drum patterns count by the familiar subdivision (a
4/4 bar of quarters is 4 tokens, of eighths is 8) rather than a fixed grid.

> **Documented lossy axes.** interpret → serialize → interpret is a fixed point
> on pitch / start_time / **duration** for any legato line (every note starting
> where the previous ends — anything Stark itself produces), modulo: velocity
> bucketing (3 dynamics) and snapping any sub-16th onset gap or off-grid
> duration to the note-value grid (the ten spellable values — plain `/1`…`/16`
> plus their dotted partners; see § Durations). Overlapping notes on one line
> are normalized to legato exactly as a melody line is — **drums and pitched
> lines share ONE timing model**, so drum note-length round-trips like a melody
> note's. The authoritative implementation is the source files:
> `parser/stark-grammar.peggy`, `stark-interpreter.ts`, `stark-serializer.ts`,
> `stark-config.ts`. The serializer's line-default factoring keeps the read-back
> clean.

---

## Sections

A Stark string is one or more newline-separated **sections**, each headed by
`<header>: <content>`. Every section type is **event-based** — whitespace
between tokens is only a separator and has **no** rhythmic meaning; each token
advances time by its own duration:

- **Drums** — headed by a **drum name** or an **absolute pitch name** (below),
  with an optional header `/N` line default. Tokens are hits/rests.
- **Melody / bass** — **literal** pitched tokens: single notes and `[..]`
  bracket stacks (below).
- **Chords** — **symbolic**: chord symbols (`Cm7`, `G7/B`) the interpreter
  realizes into notes, plus optional `[..]` bracket voicings (below).

Headers are case-insensitive. Mixed section types in one string (e.g. `drums` +
`melody`) are **legal but warned**. When two voices produce the same pitch at
the same start, the later note wins (a collision warning is emitted). Invalid
syntax throws a wrapped `Stark notation parse error`; an unknown chord symbol
throws an interpreter error naming the token (see Chord symbols).

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
it (`X/8`). A trailing `*N` repeats the token (`X*16`; § Repeat). A rest (`z`)
advances time by its duration without emitting a note. `|` is a visual barline —
it never advances time.

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

   (toms run high→low: tom1=47 … tom4=41).

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

## Pitched lines (melody / bass / chords)

Pitched lines split along a **literal-vs-symbolic** axis. `melody`/`bass` are
**literal** — single notes and `[..]` bracket stacks spelled exactly. `chords`
is **symbolic** — each bare token is a chord **symbol** the interpreter realizes
into notes, with `[..]` voicings also allowed. The three differ in register
default (below); only the chords line reads chord symbols.

```
melody: C Eb G' z/2 A/8!
melody/8: C D E G          # /N in the header sets the line's default duration
melody: [C Eb G]/2!        # a bracket stack — notes share the /N and dynamic
chords: C Am F G7          # chord symbols: bare = major, else a quality suffix
chords: Cm7 [Eb G C']      # a symbol, then an explicit voicing (chord register)
```

A **note token** (melody/bass) is, in order: `letter` (`A`–`G`,
case-insensitive) + **accidental** (`#`/`b`, _immediately after the letter_, so
`Cb` = C-flat while a lone `b` = note B) + suffix modifiers in **any order**:

- **octave marks** `'` (up) / `,` (down), stackable — shift from the register
  default.
- **duration** `/N` — absolute note value (§ Durations). At most one.
- **dynamic** `!` accent / `?` soft. Omit = normal. At most one.

The suffix glyph classes are disjoint (`' ,` vs `/N` vs `! ?`), so `Eb''/8!`,
`Eb/8''!`, and `Eb!/8''` parse identically. A terminal `*N` (§ Repeat) may
follow, after all of these. The serializer always emits one canonical order:
pitch → accidental → octave → `/duration` → dynamic.

**Rest** = `z` with optional `/N` (`z/4`). **Bracket chord** =
`[<note> <note> ...]` with optional `/N` and dynamic applied to the whole chord;
inner notes follow the pitch rules (letter + accidental + octave), no per-note
duration/dynamic. Brackets are valid on **any** pitched line — melody/bass
(their register) and chords (the chord register).

### Chord symbols (chords line)

On a `chords` line a **bare** token is a chord symbol (never a single note):

- **root** — `letter` (`A`–`G`, case-insensitive) + optional **accidental**
  `#`/`b` bound immediately, exactly like a note root (`Ebm7`, `Bb7`).
- **quality** — the suffix that names the chord. **Bare root = major triad**
  (`C` = C major); `m`/`min` = minor. The vocabulary (`chord-symbols.ts`'s
  `CHORD_QUALITY_INTERVALS`) covers triads (`maj`/`M`, `m`/`min`, `dim`,
  `aug`/`+`, `sus2`, `sus4`/`sus`, `5`), sixths (`6`, `m6`, `69`), sevenths
  (`7`, `maj7`/`M7`, `m7`/`min7`, `m7b5`, `dim7`, `mMaj7`), extensions (`9`,
  `maj9`, `m9`, `11`, `13`, `add9`, `add11`, `add13`), and alterations (`7b5`,
  `7#5`, `7b9`, `7#9`, `7#11`). Case matters: `m` = minor, `M` = a major-7th
  qualifier. An extension implies the tones below it (a `9` includes its `7`).
- **slash bass** — `/` + a pitch letter (+ optional accidental): `G7/B`. Since
  `/` + a **letter** is a bass but `/` + a **digit** is a duration, the two are
  disjoint and coexist: `G7/B/2` = G7 over B, half note.
- **suffixes** — the same octave marks, `/N` duration, `!`/`?` dynamic, and `*N`
  repeat as a note, applied to the whole chord. (Known collision: a `6/9` chord
  clashes with slash/duration — spell it `69`.)

**Voicing (v1):** closed, root position, stacked up from the chords register (C2
= 48); a slash bass is placed at the highest octave strictly below the root (a
chord tone → inversion, else an added bottom). Octave marks shift the whole
chord. No drop/open/spread voicings. An **unknown quality is an error** — the
interpreter rejects the token by name (like any other invalid syntax) rather
than guessing. This is what catches a missing space: `CG` lexes as one token
(root `C`, quality `G`), and silently skipping it would drop both intended
chords and desync everything after.

> **Chord symbols are INPUT-ONLY sugar.** They name a set of pitch classes; the
> interpreter realizes them into concrete notes. The **serializer never emits a
> `chords:` line or a symbol** — read-back is always literal notes on a
> melody/bass line (a simultaneous group becomes a `[..]` stack, placed on the
> line the median pitch selects). This preserves the literal round-trip: the
> realized notes are canonical, the symbol is lossy authoring convenience.

**Register defaults** (the MIDI pitch a bare `C` maps to; octave marks shift
from here), using the Ableton convention (C3 = MIDI 60):

| line   | `C` maps to | MIDI |
| ------ | ----------- | ---- |
| bass   | C1          | 36   |
| melody | C3          | 60   |
| chords | C2          | 48   |

> Note the two octave conventions are intentional and separate: pitched lines
> use **register-relative** marks (no octave numbers; `C` = the register
> default), while drum pitch-name headers use **absolute Ableton note names**
> (C3 = 60). They never share syntax, so there is no ambiguity.

---

## Durations

`/N` is an **absolute note value**, not an ABC-style multiplier: `/1` = whole (4
beats), `/2` = half, `/4` = quarter (1 beat), `/8` = eighth, `/16` = sixteenth.
A token's own `/N` overrides the line default; line defaults are `/4` for
bass/melody **and drums**, `/1` for chords, and may be overridden in the header
(`melody/8:`, `hihat /8:`).

A single trailing **dot** makes the value **dotted** (× 1.5): `/4.` = dotted
quarter = 1.5 beats, `/8.` = 0.75, `/2.` = 3, up to `/1.` = 6. Double-dots are
**not** supported (at most one dot). The dot binds tightly to its `/N` (no
whitespace) and is part of the duration suffix, so it does not disturb the free
ordering of the `' , ! ?` suffixes. A dot is legal everywhere a `/N` is: note,
drum hit, rest (`z/4.`), chord (`[C E]/2.`), and the line-default header
(`melody /4.:`).

This gives ten spellable note values — the five plain (`/1`…`/16`) and their
dotted partners. The serializer **snaps** every duration to the nearest of these
ten (ties resolve to the shorter value); a duration off the grid (a triplet, a
sample-derived sustain) snaps its own length but the walk advances by _emitted_
grid-time, so a shortfall is absorbed by a compensating rest and later onsets
never shift. Beats here are internal Ableton quarter-note beats.

---

## Repeat (`*N`)

A trailing `*N` expands the fully-formed token into **N** consecutive copies at
interpret time: `X*16` = sixteen `X` hits, `C/8*4` = four eighth-note Cs, `z*3`
= three rests, `[C E G]*2` = the chord twice. It is pure syntactic sugar — each
copy is an independent note (a hit re-rolls its velocity within the bucket,
exactly as separate tokens do) and time advances by the copies' summed duration.

`N` is an integer **≥ 1** with no leading zero (`*0` is a parse error; `*1` is a
harmless no-op). `*N` is the **terminal** modifier — it follows the `/N`
duration, octave marks, and dynamic (`X/8*4`, `Eb'/16!*8`), so it never disturbs
the free ordering of the `' , ! ?` suffixes. It applies to every token type:
drum hit, pitched note, rest, bracket chord, and chord symbol. There is **no
group repeat** (`(…)*N` is not supported) — repeat multiplies one token only.

The serializer **emits** `*N`: a final pass collapses each run of **3+**
consecutive identical rendered tokens (same core, `/N`, and dynamic) into
`token*N`, so a read-back of a 16th roll reads `X*16` rather than sixteen `X`s.
Runs of 1–2 stay literal (`X*2` is no shorter than `X X`). The count is the
number of copies, matching interpret-time expansion, so the collapse is lossless
(at the velocity-bucket level a run of same-bucket hits round-trips).

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
