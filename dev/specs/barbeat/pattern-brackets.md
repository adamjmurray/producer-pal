# Pattern Brackets (Streams)

> **Status: design locked 2026-06-01, fully implemented.** This section is the
> authoritative design contract for the bracket/stream feature. **Pitch streams
> (`[C3 E3 G3]`) and value streams for velocity/duration/probability
> (`[v80 v100]`, `[n/4 n/8]`, `[p1 p0.6]`) ship in v1.4.12, including the
> cross-event cursor, the zip, and the no-`@step` duration-fold** — streams step
> across separate time positions, multiple sibling streams cycle independently
> against a shared emission index, and (with `@step` omitted) a duration stream
> folds its cycled values into the position spacing as well as each note's
> length.

## The model: a parameter's current state is a _stream_

A **stream** is an ordered list of values for one parameter (pitch, velocity,
duration, or probability). Today every parameter holds a single scalar; a
bracket lets it hold a list. **A scalar — or a bare chord — is just a length-1
stream.** There is no separate "bracket scope"; brackets only let current state
be a _cycling list_ instead of a constant.

Emission reads two independent things, both indexed by a per-parameter cursor
`i`:

- **Value** — each active stream yields `stream[i mod stream.length]`. A bare,
  unbracketed token is a length-1 (constant) stream, so it yields the same value
  at every `i` (today's behavior, unchanged).
- **Position** — a running-sum fold: `pos[0] = start`,
  `pos[i] = pos[i-1] + advance[i-1]`, where `advance` is `@step` if present,
  else the just-emitted note's duration. This generalizes the existing "`@step`
  omitted ⇒ step defaults to the current duration" rule: when `@step` is omitted
  and a duration stream is active, `advance[i]` is the _cycled_ duration
  `durStream[(cursor + i) mod len]`, so the duration stream changes spacing as
  well as length — the duration-fold (see the Gallop example). With no duration
  stream the no-`@step` advance is the scalar current duration, as before.

When every stream is length-1, the zip reduces **exactly** to today's broadcast
(each position emits the whole pitch buffer) — full backward compatibility.

### Pitch LAYERS; velocity/duration/probability are last-wins

Pitch is the one parameter that can hold **multiple voices at once**. Within a
group, the constant chord (bare pitches) and every pitch bracket are independent
**voices**, each a stream of chords. At emission `i` the sounding chord is the
**union over all voices** of `voice[(cursor + i) mod voice.length]` — one shared
pitch cursor, each voice cycling by its own length, so voices of unequal length
phase against each other.

```
C4 [E4 G4 C5] 1|1,2,3,4   // held C4 layered under a moving line:
                          //   (C4,E4) (C4,G4) (C4,C5) (C4,E4)
[C3 C4] [E3 G3 E4] 1|1,2,3,4   // two voices (len 2, len 3) phasing:
                               //   (C3,E3) (C4,G3) (C3,E4) (C4,E3)
```

Velocity, duration, and probability are **single last-wins streams** — a note
has exactly one of each, so stacking them is meaningless; a second value bracket
for the same parameter replaces the first. Stacking _pitches_ is a chord, which
is musically meaningful, so pitch layers instead. Layering only accumulates
**within a group** (pitch tokens before the group's first time position); a
pitch token or bracket after a time position starts a fresh group (see Cursor
lifetime). A single pitch voice still behaves exactly as before — `[C1] 1|1`
emits one note, the length-1 == scalar invariant.

## Syntax

```
[ value value ... ]   // a stream of one parameter's values
( pitch pitch ... )   // a chord: one element holding simultaneous pitches
```

- A bracket holds tokens of **one parameter kind**: `[C3 E3 G3]` (pitch),
  `[v80 v100]` (velocity, ranges allowed: `[v40-80 v100]`), `[n/4 n/8]`
  (duration, bar forms allowed: `[1bar n/8]`), `[p1 p0.6]` (probability). A
  bracket mixing kinds (`[v80 C3]`) is an error. First characters are disjoint
  across kinds, so the bracket's kind is unambiguous.
- **`(...)` is strictly a chord** — simultaneous pitches at one step.
  `[(C3 E3) (D3 F3)]` is a 2-element pitch stream whose elements are 2-note
  chords. A group holds pitches only.
- Brackets **zip**: write each varying parameter as its own sibling bracket.
  `[v80 v100] [C3 E3 G3] 1|1x8@n/8` cycles velocity (len 2) against pitch
  (len 3) against the shared emission index. Each stream mods by its own length,
  so coprime lengths phase against each other.
- **Sibling brackets may abut with no separating space** — a leading `[` is a
  self-delimiting boundary, so `[C3 E3 G3][v80 v100]` parses identically to the
  space-separated form. This is an input tolerance (like comma-space and
  sticky-bar); the space is still **required** from a bracket to a non-bracket
  element (`[C3 E3 G3] 1|1x3@n/4` — the time position needs its space). Other
  adjacencies (`C3E3`, `v80v100`) remain ambiguous and are rejected.

> **Supersedes the earlier syntax sketch.** The earlier sketch treated a group
> as "whatever's grouped," bundling a velocity with a pitch
> (`[(v100 C3) (v80 E3)]`). The resolved model **deletes** per-element bundling:
> parameters vary as **independent zipped streams**, and `(...)` is a chord
> only. Per-step velocity is `[v100 v80] [C3 E3]`, never `[(v100 C3) …]`.

## Cursor lifetime

- Each `[...]` token **instantiates one cursor** at its lexical position. The
  cursor advances **once per emitted note-event** — a chord counts as one event.
  It never rewinds.
- A stream **persists until its parameter is reassigned**, advancing **globally
  across separate note events**, not just within one `x<count>` expansion. For
  **velocity/duration/probability**, a later scalar or a later `[...]` for that
  parameter replaces the stream with a fresh cursor (index 0). For **pitch**, a
  later pitch token or bracket _within the same group_ LAYERS (adds a voice); a
  pitch token or bracket _after a time position_ starts a fresh group, which
  clears the voices and rewinds the shared pitch cursor to 0. Each cursor
  carries across separate time positions and comma-separated beat lists,
  independently.
- **Identity is lexical, not textual.** The same bracket text written twice is
  two independent streams, each starting at index 0.

```
// Pitch cross-event cursor:
[C3 E3 G3] 1|1 1|2 1|3   // C3@1|1, E3@1|2, G3@1|3 (cursor crosses 3 positions)
[C3 E3] 1|1 1|2 1|3      // C3, E3, C3 (cursor wraps)
[C3 E3] 1|1 F3 1|2 1|3   // C3, then F3 rewinds the cursor and broadcasts: F3, F3

// Value stream cross-event cursor:
[v80 v100] C3 1|1 D3 1|2 E3 1|3   // C3 v80, D3 v100, E3 v80
                                  // (velocity cursor crosses 3 separate events)
```

## `x<count>` and partial cycles

`x<count>` is unchanged: it counts **emissions** from a single position token
and still lives on that token. Brackets also advance across multiple _explicit_
position tokens (each is one emission), so `x` is required only when one
position token must emit several notes. If `count` is not a whole number of a
stream's cycles, the stream simply ends mid-cycle — **silent**, not an error.

## Rules and errors

- **Bare token = constant (length-1) stream.** Don't bracket what doesn't vary.
- **Velocity/duration/probability: one active stream per parameter — last
  wins.** A second bracket for the same value parameter replaces the first with
  a fresh cursor (no error). (The locked design floated a parse-time error here;
  it was dropped — a hard error would abort the whole clip's notation, and
  last-wins is unambiguous and recoverable, matching the forgiving-parser
  philosophy.)
- **Pitch: multiple voices LAYER within a group.** A bare pitch/chord and any
  number of pitch brackets before the group's first time position stack into one
  sounding chord, each cycling on its own length against the shared pitch
  cursor. (Reassignment happens at the group boundary, not per-bracket — a pitch
  token after a time position starts a fresh group.) This never errors.
- **Flat two-level grammar; nesting is a parse-time type error.** A stream's
  element is a value (a bare token or a one-level `(...)` chord), never another
  stream. `[A [B C] D]` is rejected at parse time (`[B C]` is a schedule, not a
  value — there is no single value at that index). `(...)` does not nest and
  cannot contain `[`: `((C3 E3) G3)` and `(C3 [D3 E3])` are errors. **Top-level
  sibling brackets ARE allowed** — that is the zip; scope "no `[` inside `[`" to
  _inside a bracket_, not "one bracket per line."

## Interaction with existing features

- **Literal chords** (`C3 E3 G3 1|1`, no brackets) are unchanged: a length-1
  pitch stream whose single element is the chord. The legacy intra-chord
  per-pitch capture (`v80 C3 v100 E3 1|1`) still applies when no value stream is
  active.
- **Streams follow the same state-capture rules as bare pitches/chords.** Two
  cases, both identical to the unbracketed behavior:
  - _Within an open group_ (after the pitch token, before that group's first
    time position) a scalar can't change the already-captured group:
    `C3 E3 v80 1|1` and `[C3 E3] v80 1|1` both drop the `v80` and warn (the
    setting "has no effect … put the setting before" the notes). Put the scalar
    _before_ the pitch/bracket, or use a value stream, to vary the value.
  - _Between emitted positions_ a later scalar retroactively updates the
    _carried_ pitch state: `C1 1|1 v80 1|2` gives the second note velocity 80,
    and a carried stream behaves identically — `[C1] 1|1 v80 1|2` is
    **equivalent** (a length-1 stream is exactly a bare pitch). For a
    multi-value stream every captured value updates, so emissions at and after
    the scalar reflect it.
- **Bar copy / `v0` / `@clear`** operate post-emission on real note events, so
  once notes are emitted they are unaffected by streams. The pre-emission buffer
  warnings (`N pitch(es) buffered but not emitted`, dangling state) count a
  _pending stream_ as a new species of un-emitted state (`countBufferedPitches`
  sums the pending chord and stream).
- **Read-back is explicit notes, never re-bracketed.** Brackets are author-only
  sugar; the canonical serialized form is explicit positions (a melodic run
  serializes to `C3 1|1 E3 1|2 G3 1|3`). This round-trips losslessly because
  brackets never reach the serializer — it runs over emitted `NoteEvent[]`.

## Worked examples

**Melodic stepping, `@step` grid, meter-safe:**

```
[C3 E3 G3] 1|1x3@n/4      // C3@1|1, E3@1|2, G3@1|3
[C3 E3 G3] 1|1 1|2 1|3    // same melody, cursor steps across separate positions
[C3 E3 G3] 1|1x3          // no @step → advance by current duration (legato run)
[C3 E3 G3 C4] 1|1x4@n3/8  // four dotted-quarter steps (e.g. felt beats in 12/8)
```

**Phase pattern, coprime cycling under `@step`:**

```
[v80 v100] [C3 E3 G3] 1|1x8@n/8
// C3 v80, E3 v100, G3 v80, C3 v100, E3 v80, G3 v100, C3 v80, E3 v100
```

**Gallop (duration-fold, no `@step`):**

```
[n/4 n/8] C3 1|1x8
// durations cycle [1, 0.5] beats; each note's length also advances the cursor,
// folding to 1|1, 1|2, 1|2.5, 1|3.5, 1|4, 2|1, 2|1.5, 2|2.5
```

**Pitch layering (voices stack into chords):**

```
n/4 C4 [E4 G4 C5] 1|1,2,3,4
// held C4 under a moving line; equivalent to:
//   n/4 C4 E4 1|1 C4 G4 1|2 C4 C5 1|3 C4 E4 1|4

n/4 [C3 C4] [E3 G3 E4] 1|1,2,3,4
// two voices (len 2, len 3) phasing; equivalent to:
//   n/4 C3 E3 1|1 C4 G3 1|2 C3 E4 1|3 C4 E3 1|4
```

## AST shape

A bracket parses to a single element carrying its parameter kind and the ordered
value list: `{ stream: { param, values } }`, discriminated by `param`. For
`"pitch"` each value is a chord (a length-1 array for a bare pitch);
`"velocity"` values are `{ velocity }` or `{ velocityMin, velocityMax }`,
`"duration"` values are `{ duration, bars? }`, and `"probability"` values are
`{ probability }`. The interpreter holds the pitch voices as
`state.currentPitchStreams` (a `PitchState[][][]` — a list of voices, each a
list of chords) and each value stream as `state.current<Param>Stream` with a
per-parameter cursor; at emission `i` a value stream's value
(`values[(cursor + i) mod length]`) OVERRIDES the per-pitch captured value, and
the sounding chord is the union over all voices of
`voice[(cursor + i) mod voice.length]` (the constant chord `currentPitches` is
the implicit first voice). See the **AST Schema** section for the element type.
