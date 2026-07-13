---
title: MIDI Notation
description:
  How Producer Pal encodes MIDI for AI — the bar|beat, MIDI JSON, and Stark
  notations, their strengths and tradeoffs, and the transforms expression
  language for reshaping notes with math.
---

# MIDI Notation

Ask an AI to write MIDI directly and it has to emit raw note data: pitch
numbers, start times, and durations in abstract beats. That is error-prone and
unmusical — nothing in it reads like music, so nothing about it plays to a
language model's strengths.

So Producer Pal doesn't ask for raw MIDI. It gives the AI a **text notation** to
compose in, and translates that notation into real notes in your Live Set. The
notation is the single largest investment in the project, and it's the main
reason results feel musical rather than mechanical.

There are three notations to choose from, and one expression language —
[transforms](#transforms) — that reshapes notes in any of them.

## Choosing a notation

| Notation                | Best for                              | Strengths                                                                     | Tradeoffs                                                                 |
| ----------------------- | ------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [bar\|beat](#bar-beat)  | **The default.** Capable models.      | Most expressive: velocity ranges, probability, bar copying, note deletion     | Stateful syntax; bars and beats shift meaning in odd meters               |
| [MIDI JSON](#midi-json) | Coding agents; exact data             | Highest fidelity: exact velocities and tuplets; trivial to generate and parse | Verbose — every note spelled out in full; no delete syntax                |
| [Stark](#stark)         | Small and local models; drums; chords | Literal and round-trippable; chord symbols; event-based drum lines            | Velocity is lossy (three dynamics); no probability or velocity randomness |

If you're using Claude, GPT, Gemini, or another frontier model through the chat
UI or an MCP client, **stay on bar|beat**. It's the default, it's the most
expressive, and capable models handle it well.

Reach for **MIDI JSON** when a coding agent is driving Producer Pal, or when you
need exact velocities and tuplet ratios preserved — it's the most literal of the
three. Reach for **Stark** when you're running a small or local model, or when
you're working mostly in drums and chord progressions.

::: tip Notation and small-model mode are independent

[Small model mode](/features#small-model-mode) trims the tool schemas and
skills; the notation setting changes how notes are encoded. They're separate
switches, and any combination works. A common pairing for local models is Stark
plus small-model mode.

:::

### Setting the notation

The notation is a **global device setting**, not a per-conversation or per-tool
one. Whatever you pick applies to the built-in [Chat UI](/guide/chat-ui),
external MCP clients, and the [REST API](/guide/rest-api) alike. Set it in any
of these places:

- **Max for Live device** — the **Notation** control on the
  [Setup tab](/guide/device#behavior)
- **Chat UI** — Settings → Advanced → **Notation**
- **REST API** — `POST /config` with `{"notation": "stark"}`
- **Command line** — `npx producer-pal --notation stark`
- **Coding agents** — the [Agent Skill](/guide/skills) sets it itself with
  `node ppal.mjs --set-config '{"notation":"midi-json"}'`

::: warning Switching takes effect in a new conversation

The AI is taught its notation once, at the start of a conversation. If you
switch mid-chat, it can still _read_ your existing notes in the new notation,
but it will keep _writing_ the old one until you start a new conversation.

:::

The notation also rewrites the clip tools' own parameter descriptions, so the AI
is told what to send in the notation that's actually active. Each section below
ends with the exact `notes` parameter text the AI receives under that notation.

## bar|beat {#bar-beat}

The default. A compact, human-readable notation where time is counted the way
musicians count it.

```
v100 n/4 C3 E3 G3 1|1
```

That's a C major triad, velocity 100, quarter notes, at bar 1 beat 1. The pieces
are:

- **Pitches** are names — `C3` (middle C, MIDI 60), `F#4`, `Bb2`.
- **Positions** are `bar|beat`, both 1-indexed — `1|1` is the first beat, `2|3`
  is bar 2 beat 3. Sub-beat positions can be decimals (`2|3.5`) or note-value
  offsets (`1|1+n/12`).
- **Durations** are note values — `n/4` is a quarter, `n/8` an eighth, `n/12` an
  eighth triplet.
- **Velocity** is `v100`, or a range like `v90-110` for humanized randomness.
- **Probability** is `p0.5` — the note plays half the time.

`v`, `n`, and `p` are **stateful prefixes**: once set, they apply to every note
that follows until changed. That's what keeps it compact — you state a velocity
once, not on every note.

```
v90-110 n/4 C1 1|1,3 n/8 D1 1|2,4   // humanized kick and snare
n/12 C3 1|1x3                        // three eighth-note triplets
```

Bars can be copied rather than retyped — `@2=1` copies bar 1 to bar 2, `@2-8=1`
fans it across bars 2 through 8, and `@3-10=1-2` tiles a two-bar pattern across
bars 3 through 10.

**Strengths.** The most expressive of the three. It's the only notation with
velocity ranges, note probability, bar copying, and a delete sentinel (`v0`
removes a note at a position). Positions read the way a musician thinks about
time, which is exactly the translation an LLM is good at.

**Tradeoffs.** The statefulness is a footgun — a `n/8` in the wrong place
retimes everything after it. And bars and beats are **meter-relative**: a "beat"
is a quarter in 4/4 but an eighth in 6/8, while note values like `n/4` mean the
same duration in every meter. That distinction is precise but it's one more
thing for a model to get right.

**No chord symbols.** bar|beat deliberately has none, and won't get them — `C7`
is already a valid pitch (note C, octave 7), so a chord symbol would be
lexically ambiguous with a note name. Simultaneous notes at one position
(`1|1 C3 E3 G3`) express any chord fully, with per-note velocity and duration.
Stark gets chord symbols because its `chords:` line header declares the context
up front.

<!--@include: ../_generated/notation-params-barbeat.md-->

## MIDI JSON {#midi-json}

Notes as a compact array of objects. The most literal of the three, and the
easiest for a program to generate or parse.

```
[{p:60,t:0,d:4,v:100},{p:62,t:1,d:1,v:90,vd:10,c:0.75}]
```

The keys are `p` pitch (0-127, C3 = 60), `t` start and `d` duration in musical
beats, `v` velocity (1-127), plus optional `vd` velocity deviation and `c`
probability (chance). Defaults are omitted, so most notes are just four keys.

Times are absolute musical beats: `t:0` is the clip start, `t:4` is beat 5, and
chords share a `t`. Tuplets can be written as exact fractions — `d:2/3` is a
triplet quarter — and read back as fractions rather than a lossy `0.3333`.

The parser is deliberately tolerant, so whatever an LLM emits still parses: keys
may be quoted or bare, short (`p`/`t`/`d`/`v`) or long (`pitch`/`start`/…).

**Strengths.** Exactness. Velocities, deviations, and tuplet ratios all survive
a round trip precisely. Coding agents generate and parse JSON natively rather
than composing a text notation by hand, which is why the
[Agent Skill](/guide/skills) selects it.

**Tradeoffs.** It's the most verbose per note — there's no statefulness, no bar
copying, no repeats, so a busy clip costs the most tokens. And it has no delete
syntax; to remove or edit existing notes, use [`preTransforms`](#transforms).

<!--@include: ../_generated/notation-params-midi-json.md-->

## Stark {#stark}

A literal, round-trippable notation built for small models. One line per part,
written as `type: content`.

```
kick: X z X z
snare: z X z X
hihat /8: X X X X X X X X
```

That's a one-bar 4/4 backbeat: kick on 1 and 3, snare on 2 and 4, closed hi-hat
on every eighth. `X` is a normal hit, `x` soft, `^` an accent, and `z` a rest.

Every section is **event-based** — whitespace between tokens is just a
separator, with no rhythmic meaning. Each token advances time by its own
duration, which defaults to `/4` (a quarter note) and can be set per line
(`hihat /8:`) or glued to a single token (`X/8`). So a pattern counts by the
subdivision you're already thinking in: a 4/4 bar of quarters is four tokens, of
eighths is eight. `*N` repeats a token — `hihat /16: X*16` is a one-bar 16th
roll.

Pitched lines work the same way, and chords can be written as symbols:

```
melody: C Eb G' z/2 A/8!
chords: C Am F G7
chords: Cm7 [Eb G C']
```

`'` and `,` shift the octave, `!` accents, `?` softens, and `[...]` stacks notes
into an explicit voicing. Chord symbols (`Cm7`, `G7/B`, `Fmaj9`) get realized
into concrete pitches. Drums use the 16 General MIDI names (`kick`, `snare`,
`hihat`, `clap`, …); an absolute pitch name works as a header too (`C3:`) for
pads outside that set.

**Strengths.** Literal and predictable — no key, no scale, no snapping, and
accidentals spelled explicitly. Reading a clip back re-emits Stark rather than
falling back to another notation, so the AI sees what it wrote. The event-based
drum lines and the chord symbols are the two things small models handle
noticeably more easily than they handle bar|beat.

**Tradeoffs.** **Velocity is the lossy axis.** On read-back it snaps to three
dynamics — soft, normal, accent — and is re-randomized within each range, so
reach for bar|beat or MIDI JSON when exact velocities matter. Stark also has no
note probability and no velocity deviation at all. Chord symbols are input-only
sugar: the serializer never emits a `chords:` line, so a clip you wrote with
symbols reads back as literal notes.

<!--@include: ../_generated/notation-params-stark.md-->

## Transforms {#transforms}

Notation says _what the notes are_. Transforms say _how to reshape them_ — a
small expression language for changing notes and audio properties with math.
Pass a `transforms` string to [Create Clip](/features#ppal-create-clip),
[Update Clip](/features#ppal-update-clip), or
[Duplicate](/features#ppal-duplicate).

Each line is `[selector:] parameter operator expression`:

```
timing = swing(0.05)                  // swing the whole clip
C1-C2: velocity += 30                 // accent the bass notes
1|1-4|4.75: velocity = ramp(40, 127)  // crescendo over 4 bars
where(note.velocity < 40): delete     // drop the quiet notes
pitch += clipseq(0, 5, 7)             // per-copy transposition
```

- **Selectors** narrow what a line touches — a pitch (`C3`) or pitch range
  (`C3-C5`), a time range (`1|1-2|4`, or `3|*` for all of bar 3), a value test
  (`where(note.velocity > 100)`), or a combination. No selector means every
  note. Each selector applies only to its own line.
- **Parameters** are `velocity`, `pitch`, `timing`, `duration`, `probability`,
  and `deviation` for MIDI, plus `gain` and `pitchShift` for audio clips.
- **Operators** are `+=`, `-=`, `*=`, `/=`, and `=`.
- **Expressions** are arithmetic over the current values, with LFO waveforms
  (`sin`, `cos`, `tri`, `saw`, `square`), `ramp` and `curve` for interpolation,
  `rand` and `choose` for randomness, `seq` to cycle through values, and math
  functions including `snap` (to the Live Set's scale) and `legato`.
- **Note-count operations** change how many notes exist: `ratchet(4)` rolls a
  note into four, `repeat(n/8, 3)` echoes it, `split` cuts at explicit
  positions, and `merge()` fuses same-pitch notes into one sustained note.
- **Context variables** let expressions read where they are: `note.index`,
  `note.count`, `next.pitch`, and clip metadata like `clip.index` and
  `clip.duration`.

A transform string **broadcasts across every clip or copy** in a batch, so one
string can vary many clips at once — `clip.index` arithmetic or `clipseq(...)`
gives each one a different result. That's what makes
[Duplicate](/features#ppal-duplicate) able to generate a set of variations in a
single call, and it pairs naturally with [take lanes](/features#take-lanes).

`preTransforms` is the same language, applied to a clip's _existing_ notes
before any new `notes` merge in. It's the general editing path — and for
[MIDI JSON](#midi-json) and [Stark](#stark), which have no delete syntax of
their own, it's how you remove or rewrite notes.

::: info Transforms are the same in every notation

Transforms work identically whichever notation is active — they operate on notes
after they've been parsed, so nothing about them changes. Their _syntax_,
though, is bar|beat-flavored: selectors use bar|beat positions and pitch names
regardless. Even on MIDI JSON or Stark, you still write `1|1-2|1: delete` and
`C1: velocity += 30`.

:::

## The instructions the AI actually gets

Producer Pal teaches the AI its notation at the start of every conversation, by
returning a skill set from the [Connect tool](/features#ppal-connect). The full
text of those skills — including the notation guide for whichever notation is
active — is published on the [features page](/features#skills), and the Chat
UI's Skills tab previews them for any notation and model size. You can
[customize or replace them](/guide/customizing-skills), including swapping in
your own notation guide.
