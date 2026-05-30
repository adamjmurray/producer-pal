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
    positions are a decimal (`2|3.5`) or a grid beat plus a `±n` **note-value
    offset** — `1|1+n/12` = beat 1 + an eighth triplet, `1|2-n/24` nudges just
    behind beat 2. The offset is a whole-note fraction (same `n` grammar as
    Duration), so — like any note value — it is **meter-invariant** in absolute
    time: `n/12` is always an eighth triplet. Its size measured _in the local
    beat unit_ changes only because the beat unit itself changes (1/3 of a
    quarter-beat in 4/4, 2/3 of an eighth-beat in 6/8 — the same musical
    duration). The grid beat it displaces, by contrast, **is** meter-relative.
    Bare fractions (`4/3`) and bar-relative mixed numbers (`1+1/3`) are rejected
    — note values always wear the `n`.
  - **Repeat patterns**: `beat x times @ step` generates multiple positions.
    `step` uses the same note-value duration grammar as `n` (see Duration):
    `@n<fraction>` note value, `@Nbar` meter-aware bars, or `@Nbar+n<fraction>`
    mixed. A bare `@/4` (note value with no `n`) and a bare `@1` (beats) are
    both rejected — authoring stays note-value-only.
    - Example: `1|1x4@n/4` → 4 positions a quarter note apart: beats 1,2,3,4 in
      4/4
    - Example: `1|1x3@n/12` → eighth-note triplets at beats 1, 4/3, 5/3 in 4/4
    - Example: `1|1x4@1bar` → 4 positions one bar apart
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
  - Special: `v0` deletes earlier notes with matching pitch and time (see Note
    Deletion section)
  - Default: 100
  - Requires whitespace separation from following elements

- **Duration (`n`)**
  - Sets duration for following notes until changed
  - **Absolute note value**: written as a fraction of a whole note,
    `n<numerator>/<denominator>`. Numerator defaults to 1 (`n/4` == `n1/4`).
    Denominator is **mandatory** — bare integers (`n1`), decimals (`n0.5`), and
    mixed numbers (`n1+1/2`) are invalid and raise a parser error
  - Common values: `n/1` whole, `n/2` half, `n/4` quarter, `n/8` eighth, `n/16`
    sixteenth, `n3/8` dotted quarter, `n5/4` five quarter notes
  - Tuplets: `n/3` half-note triplet, `n/6` quarter triplet, `n/12` eighth
    triplet, `n/24` sixteenth triplet (denominator = how many fit in a whole
    note)
  - Meter-independent: `n/4` is always one quarter note, in 4/4, 6/8, 5/4, etc.
  - **Bar durations**: `Nbar` (meter-aware, e.g. `1bar` = hold one bar in any
    meter) and `Nbar+n<fraction>` mixed (e.g. `1bar+n3/4`) are also valid inline
    durations. The `bar` term never wears an `n`; the note-value tail keeps its
    own `n`. So `n1bar` is invalid — write `1bar`
  - Default: `n/4` (one quarter note)
  - Requires whitespace separation from following elements
  - NOTE: clip `length` and arrangement durations use this same duration
    grammar: `Nbar` (meter-aware, e.g. `4bar`), `n<fraction>` note value (e.g.
    `n/4` quarter, `n/8` eighth, `n3/8` dotted quarter), or `Nbar+n<fraction>`
    mixed (e.g. `1bar+n/4`). Off-grid lengths with no clean note-value form
    (sample-derived audio lengths) use a **decimal-numerator escape pinned to
    `/4`**: `n<beats>/4` == `<beats>` Ableton beats (`n1.9638/4` = 1.9638
    quarters, since `n<x>/4` = x quarters). This keeps the escape under the `n`
    sigil so the duration vocabulary stays uniform. A bare number (e.g.
    `1.9638`) is also **accepted on input** as a legacy round-trip form, but is
    no longer emitted. Bare _fractions_ (`1/4`) and decimals (`0.5`) as authored
    durations stay invalid — the `n` prefix marks a note value everywhere
  - NOTE (read contract): when a clip is serialized back to notation, MIDI note
    durations round to the nearest representable note value (absorbing float
    epsilon and humanized timing). A clip/arrangement `length` emits an exact
    `n<fraction>`/`Nbar` when it lands on the grid (within ~1e-6), otherwise the
    `n<beats>/4` escape at fixed precision (trailing zeros stripped)

- **Note (`C4`, `Eb2`, `F#3`, etc.)**
  - Note names follow standard pitch notation using:
    - A–G (with optional sharp `#` or flat `b`)
    - Valid pitch classes: C, C#, Db, D, D#, Eb, E, F, F#, Gb, G, G#, Ab, A, A#,
      Bb, B
    - Invalid: `Cb`, `B#`, `Fb`, `E#` (not supported)
  - Octave is a signed integer (e.g., `C3`, `A#-1`)
  - MIDI pitch is computed as `(octave + 2) * 12 + pitchClassValue`
  - Result must be in valid MIDI range: 0–127

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

These are console warnings, not errors - parsing completes successfully.

---

## Note Deletion with v0

Notes with velocity 0 (`v0`) delete earlier notes that match both pitch and
time. This works in serial order during interpretation, making it useful for
removing specific notes from patterns, including notes created by bar copy
operations.

### How v0 Deletion Works

When a `v0` note is encountered during interpretation:

1. **Matches earlier notes**: Removes any previously-processed notes that have
   the same pitch AND time (within 0.001 beats tolerance)
2. **Serial order**: Only affects notes that appear earlier in the notation
   string
3. **Kept in output**: The `v0` note itself remains in the interpreter output so
   that tools such as update-clip can make use of the data (to delete notes in
   existing clips, a separate process from notation interpretation)
4. **Filtered by tools**: `create-clip` filters out v0 notes; `update-clip` uses
   them to delete existing clip notes

### Examples

**Basic deletion:**

```
C3 D3 E3 1|1 v0 C3 1|1  // Result: D3 and E3 at 1|1 (C3 deleted)
```

**Order matters:**

```
v0 C3 1|1 v100 C3 1|1  // Result: both notes (v0 has nothing to delete)
```

**Deletion after bar copy:**

```
C3 D3 E3 1|1     // Bar 1: C3, D3, E3
@2=1             // Bar 2: copy of bar 1
v0 D3 2|1        // Delete D3 from bar 2
                 // Result: Bar 1 has C3, D3, E3; Bar 2 has C3, E3
```

**Deleting multiple notes (chord deletion):**

```
C3 D3 E3 F3 1|1 v0 C3 D3 1|1  // Result: E3 and F3 at 1|1 (deletes C3 and D3)
```

**Deleting complete chords:**

```
C3 E3 G3 1|1,2,3,4 v0 C3 E3 G3 1|2  // Result: chord at beats 1, 3, 4 only (beat 2 deleted)
```

**Different times not affected:**

```
C3 1|1 C3 1|2 v0 C3 1|1  // Result: C3 at 1|2 (only deletes C3 at 1|1)
```

### Use Cases

- **Refining copied patterns**: Copy a bar, then remove specific notes
- **Creating variations**: Build on existing patterns by deleting and adding
- **Merge editing**: In `update-clip`, new notes overlay (merge with) the clip's
  existing notes, so you can selectively delete notes from existing clips

### Technical Details

- **Time tolerance**: Notes within 0.001 beats are considered at the same time
- **Processing order**: Applied as final step after all bar copy operations
- **Output format**: v0 notes appear in interpreter output with `velocity: 0`
- **Tool behavior**:
  - `create-clip`: Filters out v0 notes (can't create v0 notes in Live)
  - `update-clip`: Uses v0 notes to delete matching existing clip notes, then
    filters them out

---

## State Management

All components are stateful:

- **Probability**: Set with `p<value>`, applies to following notes until changed
- **Velocity**: Set with `v<value>` or `v<min>-<max>`, applies to following
  notes until changed
- **Duration**: Set with `n<value>`, applies to following notes until changed

---

## Repeat Patterns

Repeat patterns generate sequences of beat positions using the syntax
`{start}x{times}@{step}`, eliminating the need to list long sequences manually.

### Syntax

```
bar|{start}x{times}@{step}
```

- **start**: Starting beat position (meter-relative; supports decimals,
  fractions, and mixed numbers)
- **times**: Number of repetitions (positive integer)
- **step**: Interval between repetitions, **same note-value duration grammar as
  `n`** — `@n<fraction>` note value (denominator mandatory, numerator defaults
  to 1, so `@n/4` == `@n1/4`), `@Nbar` meter-aware bars (`@1bar`), or
  `@Nbar+n<fraction>` mixed (`@1bar+n/4`). Bare fractions (`@/4`), bare integers
  (`@1`), decimals (`@0.5`), and mixed numbers (`@1+1/2`) are invalid and raise
  a parser error — the `n` prefix marks a note value, bars use `Nbar`

The `@` symbol reads as "at intervals" and semantically connects to bar copy
operations.

### Examples

**Quarter notes:**

```
1|1x4@n/4         // 4 positions a quarter apart: beats 1,2,3,4 in 4/4
```

**Triplets:**

```
1|1x3@n/12        // eighth-note triplet (3 in a quarter): beats 1, 4/3, 5/3 in 4/4
1|1x3@n/6         // quarter-note triplet (3 in a half): beats 1, 5/3, 7/3 in 4/4
1|3x3@n/12        // eighth-note triplet starting at beat 3
```

**16th notes:**

```
1|4x4@n/16        // four 16ths on beat 4: 4, 17/4, 18/4, 19/4
1|1x16@n/16       // 16 sixteenths = 4 quarters (a full bar in 4/4)
```

**Eighth notes:**

```
1|1x8@n/8         // eight 8ths: 1, 3/2, 2, 5/2, ..., 9/2 in 4/4
```

**Note-value offset starts (positions stay meter-relative):**

```
1|2+n/12x3@n/12   // start at 2+1/3 (beat 2 + eighth triplet), three steps
```

**Step omitted** (defaults to the current duration):

```
n/8 C1 1|1x4     // 4 eighths starting at 1|1 (step defaults to n value)
```

### Behavior

**Bar overflow**: Patterns naturally overflow into subsequent bars:

```
1|3x6@n/4         // 3,4,5,6,7,8 → 1|3, 1|4, 2|1, 2|2, 2|3, 2|4 in 4/4
```

**Mixing with regular beats**: Combine repeat patterns with explicit beats:

```
C1 1|1x4@n/4,3.5  // Beats 1,2,3,4,3.5 (beat 3.5 listed explicitly)
```

**Multiple patterns**: Use multiple repeat patterns in one beat list:

```
C1 1|1x2@n/4,3x2@n/8  // Beats 1,2,3,3.5 in 4/4
```

### Interaction with Other Features

**Pitch buffering**: All buffered pitches emit at each expanded position:

```
C3 D3 E3 1|1x4@n/4   // C3, D3, E3 at each of beats 1,2,3,4
```

**State parameters**: Velocity, duration, probability apply to all positions:

```
v80 n/8 C1 1|1x4@n/4 // All four notes have v80 and an eighth-note duration
```

**Bar copy**: Repeat patterns work with bar copy operations:

```
C1 1|1x4@n/4         // Bar 1: kick on every beat
@2=1                // Bar 2: copy of bar 1
```

### Validation

**Maximum repetitions**: Parser warns if `times > 100` (excessive notes)

**Step size**: Must be greater than 0 (validated in grammar)

**Start position**: Must be ≥ 1 (enforced by grammar)

---

## Bar Copy

Bar copy allows duplicating bars of MIDI notes using concise notation instead of
rewriting patterns.

### Syntax

```
# Single destination
@N=         # Copy previous bar to bar N
@N=M        # Copy bar M to bar N
@N=M-P      # Copy bars M through P to bars N through N+(P-M)

# Range destination
@N-M=       # Copy previous bar to range N-M
@N-M=P      # Copy bar P to range N-M
@N-M=P-Q    # Tile bars P-Q across range N-M (repeating pattern)

# Clear buffer
@clear      # Clear the copy buffer (forget all bars)
```

The `@` prefix distinguishes copy operations from time positions. All bar
numbers are positive integers (1-based).

### Examples

```
# Copy previous bar
C1 1|1 1|2 1|3 1|4  # Bar 1: kick pattern
@2=                 # Bar 2: same kick pattern

# Copy specific bar
C1 1|1 1|2 1|3 1|4
@5=1                # Bar 5: copy bar 1

# Copy range
C1 1|1 1|2 1|3 1|4
D1 1|2 1|4
@5=1-2              # Bars 5-6: copy bars 1-2

# Chain copies
C1 1|1
@2= @3= @4=         # Bars 2, 3, 4 each copy previous

# Copy to range (destination range)
C1 1|1 1|2 1|3 1|4
@2-5=1              # Bars 2-5: all copy bar 1

# Tile multi-bar pattern
C1 1|1 D1 2|1
@3-10=1-2           # Tile 2-bar pattern across bars 3-10 (4 complete tiles)

# Partial tiling (uneven division)
C1 1|1 D1 2|1 E1 3|1
@4-10=1-3           # Tile 3-bar pattern: bars 4-6, 7-9, 10 (partial)
```

### Behavior

Bar copy reads notes from the **copy buffer** (notes previously emitted at time
positions) and creates new note events at the destination bar(s):

- **Copies from copy buffer**: Uses notes stored in the parser's `notesByBar`
  map (not from Ableton Live)
- **Time shift**: Notes are shifted to destination bar(s) with correct time
  offsets
- **Creates new events**: Adds copied note events to the output (doesn't modify
  existing notes)
- **Not a time position**: Does not emit buffered pitches (clears pitch buffer
  instead)

#### Tiling Behavior (Multi-Bar Source Ranges)

When the source is a multi-bar range (`@N-M=P-Q`), the pattern **tiles** across
the destination range:

- **Repeating pattern**: Source bars repeat using modulo wrapping
  - Example: `@3-10=1-2` copies bar 1→3, bar 2→4, bar 1→5, bar 2→6, etc.
- **Partial tiles**: When destination size is not evenly divisible by source
  size
  - Example: `@3-9=1-2` tiles 3 complete times (bars 3-8), then partial (bar 9
    gets bar 1 only)
- **Self-copy prevention**: Skips copying when source bar equals destination bar
  - Example: `@1-10=5-6` skips bars 5 and 6 when tiling reaches them
  - Warning issued for each skipped self-copy
- **Source truncation**: When destination is smaller than source
  - Example: `@3-4=1-5` only copies bars 1-2 (destination has room for 2 bars)

### State Handling

When a bar copy operation executes:

#### Pitch Buffer

- **Cleared**: Any buffered pitches are discarded (NOT emitted)
- **Warning issued**: If pitches were buffered without a time position

#### Current State

- **Velocity, duration, probability**: Unchanged
- **Time position**:
  - `@N=` operations: Updates to N|1
  - `@clear` operation: Stays at current position (does not update time)

### Composition

```
C1 1|1 1|2 1|3 1|4  # Define bar 1
@2=1                # Copy to bar 2, time now at 2|1
D1 2|2 2|4          # Add notes to bar 2 at beats 2 and 4
```

**Result**: Bar 1 has C1 on all beats. Bar 2 has C1 on all beats + D1 on beats 2
& 4.

Copying a bar copies everything that was emitted to that bar. After copying, you
can add more notes to the destination.

### Buffer Behavior

Bar copy operations interact with two distinct buffers in the parser:

#### 1. Pitch Buffer

**Purpose**: Staging area for pitches before they're emitted at time positions

**Lifecycle**:

- Pitches accumulate with their state (velocity, probability, duration) as
  they're parsed
- Emitted together when a time position (`bar|beat`) is encountered
- Cleared (but NOT emitted) by bar copy operations (`@N=`, `@clear`)

**Example**:

```
v100 C3 E3 G3 @2=   # Warning: 3 pitches buffered but not emitted before bar copy
```

The pitches `C3 E3 G3` with velocity 100 are buffered but never reach a time
position, so they're discarded by the `@2=` operation.

#### 2. Copy Buffer (notesByBar)

**Purpose**: Tracks already-emitted notes organized by bar number for copying

**Lifecycle**:

- Populated when notes are emitted at time positions
- Used as source data for bar copy operations
- Persists until explicitly cleared with `@clear`

### Clear Buffer (`@clear`)

Explicitly clear the copy buffer:

- **Behavior**: Immediately clears all bars from copy buffer
- **Use case**: "Forget" bars and start fresh for next copyable section
- **Does not update time**: Unlike `@N=`, stays at current bar/beat position
- **Clears pitch buffer**: Same as `@N=`

**Example**:

```
C1 1|1 @2=         # Bars 1-2 have C1 (both in copy buffer)
E3 4|1             # Bar 4 has E3 (bars 1-2 still in buffer)
@5=1               # Bar 5 copies C1 from bar 1 (still available)
@clear             # Clear the copy buffer
@6=1               # Warning: Bar 1 is empty (was cleared by @clear)
```

**Example with immediate clearing**:

```
C1 1|1 D1 1|2      # Bar 1 with C1 and D1 (in copy buffer)
@clear             # Immediately forget bar 1 (copy buffer cleared)
E3 2|1             # Bar 2 with E3 (bar 1 not copyable)
@3=1               # Warning: Bar 1 is empty (was cleared by @clear)
```

### Warnings

The parser warns about problematic buffer states:

#### Pitch Buffer Warnings

- **Dangling pitches**: `"N pitch(es) buffered but not emitted before bar copy"`
  or `"before @clear"`
- **Dangling state**: `"state change won't affect anything before bar copy"` or
  `"before @clear"`

#### Copy Buffer Warnings

- **Empty source bar**: `"Bar N is empty, nothing to copy"`
- **Invalid source bar**: `"Cannot copy from bar 0 (no such bar)"`
- **Previous bar at bar 1**: `"Cannot copy from previous bar when at bar 1"`

These are console warnings, not errors - parsing completes successfully.

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

---

## Parsing Rules

1. Notes are emitted ONLY at time positions - pitches buffer until `bar|beat` is
   encountered
2. State is maintained throughout parsing - probability, velocity, and duration
   settings persist
3. Probability (`p`), velocity (`v`), and duration (`n`) capture their values
   with each pitch
4. State changes after time positions update all buffered pitches
5. Multiple notes at same time are whitespace-separated
6. No commas required between elements
7. Whitespace required between time positions, probability, velocity, duration,
   and notes
8. Velocity ranges are auto-ordered: `v120-80` becomes `v80-120`
9. First pitch after a time position clears the pitch buffer
10. Subsequent time positions re-emit the last buffered pitches (pitch
    persistence)

---

## AST Schema

The Peggy grammar (`barbeat-grammar.peggy`) returns an array of element objects:

```typescript
Element[]

type Element =
  | { pitch: number }                                                // Note (0-127)
  | { bar: number, beat: number | RepeatPattern }                    // Time position
  | { velocity: number }                                             // Single velocity (0-127)
  | { velocityMin: number, velocityMax: number }                     // Velocity range (0-127)
  | { duration: number, bars?: number }                              // Duration: whole-note fraction (e.g. 1/4 = quarter); meter-aware `bars` present for Nbar / Nbar+nA/B
  | { probability: number }                                          // Probability (0.0-1.0)
  | { barCopy: number, sourcePrevious: true }                        // @N= (copy previous)
  | { barCopy: number, sourceBar: number }                           // @N=M (copy bar M)
  | { barCopy: number, sourceRange: [number, number] }               // @N=M-P (copy source range)
  | { barCopyRange: [number, number], sourcePrevious: true }         // @N-M= (copy previous to range)
  | { barCopyRange: [number, number], sourceBar: number }            // @N-M=P (copy bar to range)
  | { barCopyRange: [number, number], sourceRange: [number, number] } // @N-M=P-Q (tile pattern)
  | { clearBuffer: true }                                            // @clear (clear copy buffer)

type RepeatPattern = {
  start: number,      // Starting beat position (meter-relative)
  times: number,      // Number of repetitions (integer)
  step: number | null, // Step size as a fraction of a whole note (null when @step omitted)
  stepBars?: number   // Meter-aware bar component of the step (present only for @Nbar forms)
}
```

### Notes

- The grammar computes a `name` variable (e.g., "C3") but only uses it for error
  messages - it's not included in the AST
- Each element is a simple object with one or two properties
- The AST is stateless - no context about what came before

---

## Interpreter Output

The `interpretNotation()` function parses the input and processes the resulting
grammar AST to return an array of note events:

```javascript
[
  {
    pitch: number, // MIDI pitch (0-127)
    start_time: number, // Start time in Ableton beats (float)
    duration: number, // Duration in Ableton beats (float)
    velocity: number, // Base velocity (0-127)
    probability: number, // Note probability (0.0-1.0)
    velocity_deviation: number, // Velocity randomization range (0-127)
  },
  // ... more note events
];
```

### Notes

- **start_time**: Converted from `bar|beat` notation to Ableton beats (accounts
  for time signature)
  - Example: In 4/4, bar 2 beat 3 = `(2-1) * 4 + (3-1) = 6.0` beats
  - Example: In 3/4, bar 2 beat 3 = `((2-1) * 3 + (3-1)) * (4/4) = 5.0` beats
- **duration**: The grammar emits durations as a fraction of a whole note
  (meter-independent); the interpreter then converts to Ableton beats (= quarter
  notes). A `n/4` becomes `1.0` in any meter; `n/8` becomes `0.5`; a `n3/8`
  (dotted quarter) becomes `1.5`
  - **Beat unit (cross-layer note)**: these numbers are **Ableton beats**
    (quarter-note beats — the unit of parsed-note output). The transforms layer
    instead measures in meter-relative **musical beats** (scaled by the
    time-signature denominator), so the same `n/4` evaluates to a different
    number there (1 in 4/4, 2 in 6/8). Both describe the identical physical
    quarter note — only the measuring unit differs. See `Transforms-Spec.md` →
    "Units and Time Signatures".
- **velocity**: Base velocity (0-127)
  - `v0` notes appear in output with `velocity: 0` for deletion purposes
  - Tools filter v0 notes before sending to Live API (see Note Deletion section)
- **velocity_deviation**: When velocity range is used (e.g., `v80-100`),
  velocity is min value and velocity_deviation is the range (20)
- **Precision**: Both start_time and duration support floating point for
  sub-beat accuracy
- **No bar/beat info**: The output only contains absolute Ableton beat
  positions, not the original bar|beat notation

---

## Precision

- Beat positions support floating point for sub-beat accuracy
- Equivalent to 480 PPQN timing resolution
- Beat 1.5 = halfway between beats 1 and 2
- Beat 1.25 = quarter beat after beat 1
