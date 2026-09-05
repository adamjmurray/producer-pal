# Note Deletion with v0

Notes with velocity 0 (`v0`) delete earlier notes that match both pitch and
time. This works in serial order during interpretation, making it useful for
removing specific notes from patterns, including notes created by bar copy
operations.

## How v0 Deletion Works

When a `v0` note is encountered during interpretation:

1. **Matches earlier notes**: Removes any previously-processed notes that have
   the same pitch AND time (within 0.001 beats tolerance)
2. **Serial order**: Only affects notes that appear earlier in the notation
   string
3. **Stripped from output**: The `v0` note itself is also removed —
   `interpretNotation` applies the deletions as its final step and never returns
   a `velocity: 0` note. The output contains only surviving real notes
4. **How update-clip deletes**: `update-clip` does NOT read surviving v0 notes
   from the interpreter output. It serializes the clip's existing notes to
   notation, concatenates `<existing> <new>` into one string, and interprets
   that combined string ONCE — so a `v0` in the new notation deletes the
   matching existing note during that single interpretation pass. `create-clip`
   has no existing notes to match, so any `v0` simply deletes nothing and is
   stripped

## Examples

**Basic deletion:**

```
C3 D3 E3 1|1 v0 C3 1|1  // Result: D3 and E3 at 1|1 (C3 deleted)
```

**Order matters:**

```
v0 C3 1|1 v100 C3 1|1  // Result: one note — v100 C3 (the v0 had nothing earlier
                       // to delete and is itself stripped from the output)
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

## Use Cases

- **Refining copied patterns**: Copy a bar, then remove specific notes
- **Creating variations**: Build on existing patterns by deleting and adding
- **Merge editing**: In `update-clip`, new notes overlay (merge with) the clip's
  existing notes, so you can selectively delete notes from existing clips
- **Overwrite in place**: A new (non-`v0`) note at the _same_ pitch and start
  time as an existing note replaces it — e.g. restating a note with a shorter
  duration shortens it. NB: this is currently emergent, not explicit in the
  merge code: `update-clip` does not dedupe regular notes — it concatenates
  existing-then-new notation and hands both to Live's `add_new_notes`, which
  collapses the duplicate with the later (new) note winning. To _replace_ a
  region rather than overwrite individual notes in place, clear it first with
  `preTransforms` or the un-restated notes remain.

## Technical Details

- **Time tolerance**: Notes within 0.001 beats are considered at the same time
- **Processing order**: Applied as final step after all bar copy operations
- **Output format**: v0 notes are stripped — interpreter output never contains a
  `velocity: 0` note (deletions resolve in-pass, leaving only real notes)
- **Tool behavior**:
  - `create-clip`: A v0 has no earlier match to delete and is dropped — no v0
    note reaches Live
  - `update-clip`: Deletes by interpreting `<existing-notation> <new-notation>`
    as one combined string, so a v0 in the new notation removes the matching
    existing note during that pass (it does not consume v0 notes from output)
