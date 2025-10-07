# bar|beat Specification

A precise, stateful music notation format for MIDI sequencing in Ableton Live.

---

## Core Syntax

```
[v<velocity>] [t<duration>] [p<probability>] note [note ...] bar|beat [bar|beat ...] [@<bar>=<source>]
```

### Components:

- **Start Time (`bar|beat`)** Time position that emits buffered notes.
  - `bar` – 1-based bar number (integer), or omit for beat-only shorthand (`|2`)
  - `beat` – 1-based beat number within bar (float for sub-beat precision)
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
  - Default: 100
  - Requires whitespace separation from following elements

- **Duration (`t<float>`)**
  - Sets duration in beats for following notes until changed
  - Default: 1.0
  - Requires whitespace separation from following elements

- **Note (`C4`, `Eb2`, `F#3`, etc.)**
  - Note names follow standard pitch notation using:
    - A–G (with optional sharp `#` or flat `b`)
    - Valid pitch classes: C, C#, Db, D, D#, Eb, E, F, F#, Gb, G, G#, Ab, A, A#,
      Bb, B
    - Invalid: `Cb`, `B#`, `Fb`, `E#` (not supported)
  - Octave is a signed integer (e.g., `C3`, `A#-1`)
  - MIDI pitch is computed as `(octave + 2) * 12 + pitchClassValue`
  - Result must be in valid MIDI range: 0–127

- **Bar Copy (`@N=`, `@N=M`, `@N=M-P`)**
  - Duplicates bars of notes to other positions
  - `@N=` copies previous bar to bar N
  - `@N=M` copies bar M to bar N
  - `@N=M-P` copies range of bars M through P to bars starting at N
  - Updates current time position to N|1
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
- **Pitches persist until changed:** `C1 1|1 |2 |3` emits C1 at three positions

### State Capture

State (velocity, duration, probability) is captured with each pitch when
buffered:

```
v100 C3 v80 E3 1|1  // C3 has v100, E3 has v80
```

State changes after time positions update all buffered pitches:

```
v100 C4 1|1 v90 |2  // C4@v100 at 1|1, C4@v90 at 1|2
```

### Warnings

The parser warns about incomplete or inefficient notation:

- Pitches buffered but no time position to emit them
- Time positions with no pitches
- State changes after pitches but before time positions (wasted state)

These are console warnings, not errors - parsing completes successfully.

## State Management

All components are stateful:

- **Probability**: Set with `p<value>`, applies to following notes until changed
- **Velocity**: Set with `v<value>` or `v<min>-<max>`, applies to following
  notes until changed
- **Duration**: Set with `t<value>`, applies to following notes until changed

---

## Bar Copy

Bar copy allows duplicating bars of MIDI notes using concise notation instead of
rewriting patterns.

### Syntax

```
@N=         # Copy previous bar to bar N
@N=M        # Copy bar M to bar N
@N=M-P      # Copy bars M through P to bars N through N+(P-M)
@=          # Clear the copy buffer (forget all bars)
```

The `@` prefix distinguishes copy operations from time positions. All bar
numbers are positive integers (1-based).

### Examples

```
# Copy previous bar
C1 1|1 |2 |3 |4     # Bar 1: kick pattern
@2=                 # Bar 2: same kick pattern

# Copy specific bar
C1 1|1 |2 |3 |4
@5=1                # Bar 5: copy bar 1

# Copy range
C1 1|1 |2 |3 |4
D1 1|2 |4
@5=1-2              # Bars 5-6: copy bars 1-2

# Chain copies
C1 1|1
@2= @3= @4=         # Bars 2, 3, 4 each copy previous
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

### State Handling

When a bar copy operation executes:

#### Pitch Buffer

- **Cleared**: Any buffered pitches are discarded (NOT emitted)
- **Warning issued**: If pitches were buffered without a time position

#### Current State

- **Velocity, duration, probability**: Unchanged
- **Time position**:
  - `@N=` operations: Updates to N|1
  - `@=` operation: Stays at current position (does not update time)

#### Beat Shorthand

After `@N=` you can use beat shorthand: `@2=1` then `|2` goes to 2|2

### Composition

```
C1 1|1 |2 |3 |4     # Define bar 1
@2=1                # Copy to bar 2, time now at 2|1
D1 |2 |4            # Add notes to bar 2 at beats 2 and 4
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
- Cleared (but NOT emitted) by bar copy operations (`@N=`, `@=`)

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
- Automatically cleared after bar copy to prevent unintended accumulation

##### Auto-Clear Mechanism

The copy buffer automatically clears after bar copy operations to ensure each
"section" of notation starts fresh:

**Trigger**: The first non-barCopy element after `@N=` or `@=` operations

- Non-barCopy elements: pitch, time position, velocity, duration, probability
- Does NOT clear between consecutive `@N=...` operations

**Example**:

```
C1 1|1 @2= @3=     # Bars 1-3 all contain C1 (copy buffer intact)
E3 4|1             # E3 triggers auto-clear, bars 1-3 forgotten
@5=1               # Warning: Bar 1 is empty (was auto-cleared)
```

### Clear Copy (`@=`)

Explicitly clear the copy buffer:

- **Behavior**: Clears all bars from copy buffer, acts as a barCopy operation
  for auto-clear purposes
- **Use case**: "Forget" preliminary bars and start fresh for next copyable
  section
- **Does not update time**: Unlike `@N=`, stays at current bar/beat position
- **Clears pitch buffer**: Same as `@N=`

**Example**:

```
C1 1|1 D1 1|2      # Bar 1 with C1 and D1 (in copy buffer)
@=                 # Explicitly forget bar 1 (copy buffer cleared)
E3 2|1             # Bar 2 with E3 (bar 1 not copyable)
@3=1               # Warning: Bar 1 is empty (was cleared by @=)
```

### Warnings

The parser warns about problematic buffer states:

#### Pitch Buffer Warnings

- **Dangling pitches**: `"N pitch(es) buffered but not emitted before bar copy"`
  or `"before @="`
- **Dangling state**: `"state change won't affect anything before bar copy"` or
  `"before @="`

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
C1 1|1 |2 |3 |4

// Layered drum pattern - kick on 1 & 3, snare on 2 & 4
C1 1|1 |3  D1 1|2 |4

// Simple melody with state changes
v100 t1.0 C3 1|1 D3 1|2 E3 1|3 F3 1|4
v80 t2.0 G3 2|1

// Sub-beat timing with floating points
v100 t0.25 C3 1|1 D3 1|1.5 E3 1|2.25 F3 1|3.75

// Drum pattern with probability and velocity variation
v100 t0.25 p1.0 C1 v80-100 p0.8 Gb1 1|1
p0.6 Gb1 1|1.5
v90 p1.0 D1 v100 p0.9 Gb1 1|2

// Chord progression
C3 E3 G3 1|1  D3 F3 A3 1|2  E3 G3 B3 1|3  F3 A3 C4 1|4

// Velocity-shaped chord
v127 C3 v100 E3 v80 G3 1|1

// Same pitches with varying velocity (state updates after time)
v100 C4 G4 1|1 v90 |2 v80 |3 v70 |4
```

---

## Parsing Rules

1. Notes are emitted ONLY at time positions - pitches buffer until `bar|beat` is
   encountered
2. State is maintained throughout parsing - probability, velocity, and duration
   settings persist
3. Probability (`p`), velocity (`v`), and duration (`t`) capture their values
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
  | { pitch: number }                                    // Note (0-127)
  | { bar: number, beat: number }                        // Time with bar
  | { bar: null, beat: number }                          // Time without bar (beat shorthand)
  | { velocity: number }                                 // Single velocity (0-127)
  | { velocityMin: number, velocityMax: number }         // Velocity range (0-127)
  | { duration: number }                                 // Duration in beats
  | { probability: number }                              // Probability (0.0-1.0)
  | { barCopy: number, sourcePrevious: true }            // @N= (copy previous bar)
  | { barCopy: number, sourceBar: number }               // @N=M (copy bar M)
  | { barCopy: number, sourceRange: [number, number] }   // @N=M-P (copy range)
  | { clearCopy: true }                                  // @= (clear copy buffer)
```

### Notes

- The grammar computes a `name` variable (e.g., "C3") but only uses it for error
  messages - it's not included in the AST
- Each element is a simple object with one or two properties
- The AST is stateless - no context about what came before

---

## Parser Output

The `parseNotation()` function processes the grammar AST and returns an array of
note events:

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
- **duration**: Converted from beat duration to Ableton beats (accounts for time
  signature)
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
