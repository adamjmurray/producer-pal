# Arrangement Operations

Arrangement clip operations (lengthening, shortening, splitting, moving) are the
most complex algorithms in the codebase. Every technique exists to work around
non-obvious Live API limitations. This document captures the constraints, the
workarounds, and the algorithm flows so future debugging sessions don't start
from scratch.

## Live API Constraints

These constraints drive every design decision; when something seems
over-engineered, one of these is usually why.

### Arrangement length is Immutable for Looped Clips

Arrangement clip length cannot be changed after creation by any means for warped
**looped** clips. You cannot extend a warped looped clip's arrangement length by
setting `end_time`, `end_marker`, `loop_end`, or any other property. The only
way to get a warped looped clip with a specific arrangement length is to create
it with that length (via session-based tiling or duplication).

This is _the_ fundamental constraint for warped looped clips. It's why
session-based tiling exists for warped looped audio clips, why we
duplicate-and-delete instead of resizing, and why lengthening produces multiple
clips instead of stretching one.

**Exception — unlooped clips**: For unlooped clips (MIDI, warped audio, and
unwarped audio), `loop_end` is writable and extends the clip's arrangement
length.

- **MIDI**: `loop_end` is in **beats**. No boundary — MIDI content is notes, so
  `loop_end` can be set to any value. See "Lengthening — Unlooped MIDI" below.
- **Unwarped audio**: `loop_end` is in **seconds**. Ableton auto-clamps to the
  file boundary. See "Lengthening — Unlooped Unwarped Audio" below.
- **Warped audio**: `loop_end` is in **content beats** (1:1 with arrangement
  beats). Ableton does **not** auto-clamp — the clip extends with silence past
  the file boundary. Manual boundary detection and clamping is required. See
  "Lengthening — Unlooped Warped Audio" below.

### Mid-Clip Splitting Doesn't Work

When a temporary clip overlaps the _middle_ of an existing arrangement clip,
Ableton truncates the original at the overlap start and **discards** the portion
after the overlap. It does NOT split into "before" and "after" clips.

Only edge trims work reliably:

- **Right-trim**: temp clip at the end of an existing clip → existing clip
  shortened
- **Left-trim**: temp clip at the start of an existing clip → existing clip
  shortened from left

This is why the splitting algorithm uses a holding-area approach with individual
segment extraction rather than splitting in place.

### Warp Markers Can't Be Written

`Clip.add_warp_marker` and `Clip.move_warp_marker` both report success and
change nothing (verified against Live 12.4.3, on a warped session clip).
`warp_markers` reads fine, so markers can be inspected but not restored.

The practical consequence: an audio clip re-created from its `file_path` gets
the sample's own markers, which match the source exactly unless someone
hand-edited them in Live. Anything re-creating an audio clip has to warn about
that rather than fix it.

### `end_marker` Accepts Any Value

`end_marker` is **not clamped** to the audio file boundary. You can set it to
99999 and it will stick. This means you can't rely on `end_marker` to tell you
the actual file content length. Use content boundary detection instead (see Core
Techniques below).

### `loop_end` Reverts on Looped Warped Arrangement Clips

When looping is disabled on a warped arrangement clip that was looping,
`loop_end` reverts to its default. Don't rely on `loop_end` persisting after
toggling looping off on warped clips.

**Exception — unlooped clips**: For clips that are already unlooped, `loop_end`
is writable and persists. This is the mechanism used for all unlooped
lengthening (MIDI, warped audio, and unwarped audio).

### Warped vs Unwarped Beats

- **Warped clips**: content beats = arrangement beats. 1 beat of content = 1
  beat of arrangement time. Tiling math is straightforward.
- **Unwarped clips**: content plays at native sample rate. Arrangement length
  depends on the sample rate vs project tempo. The same file content produces
  different arrangement lengths at different tempos. This requires completely
  different tiling strategies.

### Audio Clip Creation in Arrangement

`Track.create_audio_clip(file, position)` and
`TakeLane.create_audio_clip(file, start)` both exist, but neither takes a
length. To create an audio clip with a specific arrangement length:

1. Create it in session view with
   `createAudioClipInSession(track, length, filePath)`
2. Set content markers
3. `duplicate_clip_to_arrangement` at the target position (inherits session
   length)
4. Clean up with `removeSessionClip` (the clip, and any scene made for it)

MIDI clips don't have this problem — `create_midi_clip` accepts position and
length.

### LiveAPI Object Staleness

LiveAPI objects become stale after arrangement modifications (duplications,
deletions, moves). Always recreate objects from track/clip paths after
modifications. Store clip IDs (strings) rather than LiveAPI objects across
operations.

### `duplicate_clip_to_arrangement` Crash Bug

`duplicate_clip_to_arrangement` crashes Ableton when the source is an
**arrangement clip** and any existing arrangement clip overlaps the target
position. Session-to-arrangement duplication is unaffected. This bug was
reported to Ableton and confirmed but not yet fixed.

The workaround (`clearClipAtDuplicateTarget`) runs before every arrangement-to-
arrangement duplication, clearing overlapping clips using the same splitting
technique (dup-to-holding + edge trims) used by the splitting algorithm. See
"Duplicate Crash Workaround" under Core Techniques. The workaround has a disable
flag (`setArrangementDuplicateCrashWorkaround`) for periodic retesting.

### `duplicate_clip_to_arrangement` Return Format

Returns an array like `["id", 726]`. The codebase casts the return
inconsistently (sometimes `as string`, sometimes `as [string, number]`).
`LiveAPI.from()` handles both formats via `parseIdOrPath`.

### `duplicate_loop` Inserts (Does Not Overwrite)

Live's native `Clip.duplicate_loop` (exposed by `update-clip`'s `duplicateLoop`)
copies the current **loop region** content immediately after `loop_end`, doubles
the loop length, and **shifts any material past the old loop forward by one
loop-length**. It inserts — it does not overwrite what already sits after the
loop.

This matters when you select a sub-region smaller than the clip's content and
then double it. That takes **two calls**: `update-clip` refuses `start`/`length`
alongside `duplicateLoop`, because they set the region being doubled and the
combined call reads two ways
([why](../../specs/tool-behavior/clips-playback-and-sends/looping.md#duplicateloop)).
`firstStart` still composes — it moves the playback marker, not the loop region.

Empirical example (e2e, real Live, 2026-06-28): a 2-bar looping MIDI clip with
`C3` at bar 1 and `E3` at bar 2, then `{ length: "1bar" }` followed by
`{ duplicateLoop: true }`:

1. `length: "1bar"` sets the loop region to bar 1 only — the bar-2 `E3` is now
   outside the loop.
2. `duplicate_loop` inserts a copy of bar 1 at `loop_end` and doubles to a 2-bar
   loop.
3. Result (`length: "2bar"`, 3 notes): `C3 1|1` (original), `C3 2|1` (inserted
   copy), and `E3 3|1` — the orphaned bar-2 note **pushed forward** to bar 3,
   landing beyond the new loop (overhang; read-clip's scan window sees it, but
   the loop does not play it).

So selecting a smaller sub-region and doubling is non-destructive: out-of-loop
notes are displaced forward, never deleted or overwritten. The envelope/
automation copy `duplicate_loop` also performs is invisible to read-clip (so it
stays unit-test-only); the note insert/shift geometry can only be observed in
e2e (`e2e/mcp/clip/update/ppal-update-clip-duplicate-loop.test.ts`), since mocks
can't reproduce Live's native shift.

---

## Where the rest lives

| Part                                     | Covers                                                                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [core-techniques.md](core-techniques.md) | Holding area, edge trimming, session-based tiling, the duplicate crash workaround, stamping automation, file content boundary detection |
| [operations.md](operations.md)           | Lengthening (looped, unlooped MIDI, warped and unwarped audio), shortening, moving, splitting                                           |

## Source File Reference

| File                            | Role                                                      |
| ------------------------------- | --------------------------------------------------------- |
| `arrangement-operations.ts`     | Top-level dispatcher (lengthen vs shorten)                |
| `arrangement-length-changes.ts` | Looped lengthening, shortening, temp clip truncation      |
| `unlooped-lengthening.ts`       | Unlooped lengthening (MIDI, warped audio, unwarped audio) |
| `arrangement-tiling.ts`         | Tiling, holding area, crash workaround, clip movement     |
| `arrangement-tiling-clips.ts`   | Low-level primitives (temp clips, session clip creation)  |
| `arrangement-splitting.ts`      | Clip splitting algorithm                                  |
| `arrangement-move.ts`           | Update-clip integration (move + lengthen orchestration)   |
| `arrangement-lane-view.ts`      | What is on each lane; writes that leave no clip report it |

Sources are under `src/tools/shared/arrangement/` or
`src/tools/clip/arrangement/helpers/`; tests are colocated in `tests/`.
