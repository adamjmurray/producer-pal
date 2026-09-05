# Bar Copy

Bar copy allows duplicating bars of MIDI notes using concise notation instead of
rewriting patterns.

## Syntax

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

## Examples

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

## Behavior

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

### Tiling Behavior (Multi-Bar Source Ranges)

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

## State Handling

When a bar copy operation executes:

### Pitch Buffer

- **Cleared**: Any buffered pitches are discarded (NOT emitted)
- **Warning issued**: If pitches were buffered without a time position

### Current State

- **Velocity, duration, probability**: Unchanged
- **Time position**:
  - `@N=` operations: Updates to N|1
  - `@clear` operation: Stays at current position (does not update time)

## Composition

```
C1 1|1 1|2 1|3 1|4  # Define bar 1
@2=1                # Copy to bar 2, time now at 2|1
D1 2|2 2|4          # Add notes to bar 2 at beats 2 and 4
```

**Result**: Bar 1 has C1 on all beats. Bar 2 has C1 on all beats + D1 on beats 2
& 4.

Copying a bar copies everything that was emitted to that bar. After copying, you
can add more notes to the destination.

## Buffer Behavior

Bar copy operations interact with two distinct buffers in the parser:

### 1. Pitch Buffer

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

### 2. Copy Buffer (notesByBar)

**Purpose**: Tracks already-emitted notes organized by bar number for copying

**Lifecycle**:

- Populated when notes are emitted at time positions
- Used as source data for bar copy operations
- Persists until explicitly cleared with `@clear`

## Clear Buffer (`@clear`)

Explicitly clear the copy buffer:

- **Behavior**: Immediately clears all bars from copy buffer
- **Use case**: "Forget" bars and start fresh for next copyable section
- **Does not update time**: Unlike `@N=`, stays at current bar/beat position
- **Clears pitch buffer**: Same as `@N=`
- **Clears carried streams**: `@clear` and `@N=` forget ALL carried stream state
  symmetrically — the pitch stream AND any carried velocity / duration /
  probability value stream (`[...]` pattern brackets). A value stream cycles
  across emitted positions by its own cursor just as a pitch stream does, so a
  later position after `@clear` resumes neither: it falls back to the last
  scalar / default for each parameter, not to the middle of a stream.

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

## Warnings

The parser warns about problematic buffer states:

### Pitch Buffer Warnings

- **Dangling pitches**: `"N pitch(es) buffered but not emitted before bar copy"`
  or `"before @clear"`
- **Dangling state**: `"state change won't affect anything before bar copy"` or
  `"before @clear"`

### Copy Buffer Warnings

- **Empty source bar**: `"Bar N is empty, nothing to copy"`
- **Invalid source bar**: `"Cannot copy from bar 0 (no such bar)"`
- **Previous bar at bar 1**: `"Cannot copy from previous bar when at bar 1"`

These are console warnings, not errors - parsing completes successfully.
