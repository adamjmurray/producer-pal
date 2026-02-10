# Arrangement Operations

Arrangement clip operations (lengthening, shortening, splitting, moving) are the
most complex algorithms in the codebase. Every technique exists to work around
non-obvious Live API limitations. This document captures the constraints, the
workarounds, and the algorithm flows so future debugging sessions don't start
from scratch.

## Live API Constraints

These constraints drive every design decision. When something seems
over-engineered, one of these is usually why.

### `end_time` is Immutable (Warped Clips)

Arrangement clip `end_time` cannot be changed after creation by any means for
warped clips. You cannot extend a warped clip's arrangement length by setting
`end_time`, `end_marker`, `loop_end`, or any other property. The only way to get
a warped clip with a specific arrangement length is to create it with that
length (via session-based tiling or duplication).

This is _the_ fundamental constraint for warped clips. It's why session-based
tiling exists for warped audio clips, why we duplicate-and-delete instead of
resizing, and why lengthening produces multiple clips instead of stretching one.

**Exception — unwarped clips**: For unlooped, unwarped audio clips, `loop_end`
is writable and in **seconds**. Setting it to a larger value extends the clip's
arrangement length. If set beyond the sample boundary, Ableton auto-clamps to
the file's end. See "Lengthening — Unlooped Unwarped Audio" below.

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

### Marker Setting on Unlooped Clips

Setting `start_marker` or `end_marker` on unlooped arrangement clips is
unreliable. The workaround:

1. Enable looping (`clip.set("looping", 1)`)
2. Set all markers (`loop_start`, `loop_end`, `start_marker`, `end_marker`)
3. Disable looping (`clip.set("looping", 0)`)

See `setClipMarkersWithLoopingWorkaround()` in `clip-marker-helpers.ts`.

### `end_marker` Accepts Any Value

`end_marker` is **not clamped** to the audio file boundary. You can set it to
99999 and it will stick. This means you can't rely on `end_marker` to tell you
the actual file content length. Use content boundary detection instead (see Core
Techniques below).

### `loop_end` Reverts on Unlooped Warped Arrangement Clips

When looping is disabled on a warped arrangement clip, `loop_end` reverts to its
default. Don't rely on `loop_end` persisting for unlooped warped clips.

**Exception — unwarped clips**: `loop_end` (in seconds) persists on unwarped
clips regardless of looping state. This is the mechanism used for unwarped audio
lengthening.

### Warped vs Unwarped Beats

- **Warped clips**: content beats = arrangement beats. 1 beat of content = 1
  beat of arrangement time. Tiling math is straightforward.
- **Unwarped clips**: content plays at native sample rate. Arrangement length
  depends on the sample rate vs project tempo. The same file content produces
  different arrangement lengths at different tempos. This requires completely
  different tiling strategies.

### Audio Clip Creation in Arrangement

`create_audio_clip` in arrangement doesn't support length control. To create an
audio clip with a specific arrangement length:

1. Create it in session view with
   `createAudioClipInSession(track, length, filePath)`
2. Set content markers
3. `duplicate_clip_to_arrangement` at the target position (inherits session
   length)
4. Clean up the session clip

MIDI clips don't have this problem — `create_midi_clip` accepts position and
length.

### LiveAPI Object Staleness

LiveAPI objects become stale after arrangement modifications (duplications,
deletions, moves). Always recreate objects from track/clip paths after
modifications. Store clip IDs (strings) rather than LiveAPI objects across
operations.

### `duplicate_clip_to_arrangement` Return Format

Returns an array like `["id", 726]`. The codebase casts the return
inconsistently (sometimes `as string`, sometimes `as [string, number]`).
`LiveAPI.from()` handles both formats via `parseIdOrPath`.

---

## Core Techniques

### Holding Area

All complex arrangement operations use this pattern to isolate changes from
adjacent clips:

1. Duplicate clip to beats 1000+ (safe working space far from actual content)
2. Perform trim/adjustment operations there
3. Duplicate result to final arrangement position
4. Clean up holding area copy

Files: `arrangement-tiling.ts` (`createShortenedClipInHolding`,
`moveClipFromHolding`)

### Temp Clip Truncation (Edge Trimming)

Ableton's overlap behavior is exploited for shortening:

1. Create a temporary clip overlapping the edge of an existing clip
2. Ableton automatically truncates the existing clip at the overlap point
3. Delete the temporary clip immediately

For audio clips, the temp clip is created via session (since arrangement audio
creation doesn't support length control). For MIDI, `create_midi_clip` is used
directly.

Files: `arrangement-tiling.ts` (`createAndDeleteTempClip`),
`arrangement-operations-helpers.ts` (`truncateWithTempClip`)

### Session-Based Tiling

When you need an arrangement audio clip with a specific length:

1. `createAudioClipInSession(track, length, filePath)` — creates in session view
2. Set content markers (`loop_start`, `loop_end`, `start_marker`, `end_marker`)
3. `duplicate_clip_to_arrangement` at target position — inherits session clip's
   arrangement length
4. Clean up session clip via `slot.call("delete_clip")`

Files: `arrangement-tiling.ts` (`createAudioClipInSession`),
`arrangement-unlooped-helpers.ts` (`tileWarpedAudioContent`)

### File Content Boundary Detection

To determine how much actual audio content a file contains (in the warped beat
grid):

1. Create a session clip with minimal `loop_end` (1 beat) — avoids extending
   `end_marker` past the file boundary
2. Read `sessionClip.getProperty("end_marker")` — this stays at the file's
   natural content length because `createAudioClipInSession` sets `loop_end` but
   not `end_marker`
3. Use the result for boundary checks

This enables three-way logic for unlooped warped audio lengthening:

- **Skip**: no additional content beyond what's shown
- **Cap**: some hidden content, but not enough for the full target
- **Proceed**: sufficient content for the full target

Files: `arrangement-unlooped-helpers.ts` (`tileWarpedAudioContent`)

### Looping Workaround for Marker Setting

Enable looping → set all four markers → disable looping. Required for unlooped
clips that reject direct marker changes.

Files: `clip-marker-helpers.ts` (`setClipMarkersWithLoopingWorkaround`)

---

## Operations

### Lengthening — Looped Clips (MIDI & Audio Warped)

Entry: `handleArrangementLengthening()` → looped branch in
`arrangement-operations-helpers.ts`

Two sub-cases based on whether the target is shorter or longer than the clip's
loop region:

**Target < clip loop length** ("expose hidden content"):

- Tiles with progressive `start_marker` offsets to show different portions of
  the loop
- Each tile starts where the previous one's content ended within the loop

**Target >= clip loop length** ("standard tiling"):

- `createLoopeClipTiles()` fills remaining space with duplicated loop iterations
- Full tiles use direct duplication
- Last tile shortened via holding area if it would overshoot the target
- Uses `tileClipToRange()` for the actual tiling work

### Lengthening — Unlooped MIDI

Entry: `handleUnloopedLengthening()` → `!isAudioClip` branch in
`arrangement-unlooped-helpers.ts`

1. Extend source clip's `end_marker` to
   `clipStartMarker + arrangementLengthBeats` (only if extending, never shrink)
2. Tile remaining space — each tile shows the next sequential content portion
3. Full tiles: direct `duplicate_clip_to_arrangement`
4. Partial (last) tile: holding area approach to avoid overshooting
5. Set markers on each tile via looping workaround

### Lengthening — Unlooped Warped Audio

Entry: `handleUnloopedLengthening()` → `isWarped` branch in
`arrangement-unlooped-helpers.ts`

This is the most complex case due to immutable `end_time` + boundary detection:

1. **Boundary detection**: create session clip, read file content boundary
2. **Three-way check**:
   - **Skip**: `totalContentFromStart <= currentArrangementLength` (no
     additional file content). Warn, return source clip unchanged.
   - **Cap**: file has content but less than target. Cap `effectiveTarget` to
     `totalContentFromStart`, warn.
   - **Proceed**: file has sufficient content for the full target.
3. **Create session tile**: set markers to the correct content range, duplicate
   to arrangement, unloop, clean up
4. **Extend source end_marker**: set to `clipStartMarker + effectiveTarget`
   (only if extending)

### Lengthening — Unlooped Unwarped Audio

Entry: `handleUnloopedLengthening()` → `!isWarped` branch in
`arrangement-unlooped-helpers.ts`

This is the simplest audio lengthening case. For unwarped clips, `loop_start`
and `loop_end` are in **seconds** and are directly writable. Setting `loop_end`
to a larger value extends the clip's arrangement length. If the target exceeds
the sample boundary, Ableton auto-clamps to the file's end.

Algorithm:

1. Read current `loop_start` and `loop_end` (in seconds)
2. Derive `beatsPerSecond` from `currentArrangementLength / currentDurationSec`
   (avoids needing project tempo)
3. Calculate
   `targetLoopEnd = loopStart + (arrangementLengthBeats / beatsPerSecond)`
4. Set `loop_end` to `targetLoopEnd`
5. Read back `end_time` to check actual achieved arrangement length
6. Three-way result:
   - **No change**: `actualArrangementLength <= currentArrangementLength` — at
     file boundary already, warn
   - **Capped**: `actualArrangementLength < arrangementLengthBeats` — extended
     but capped at file boundary, warn
   - **Full**: target achieved

No tiling, no session clips, no holding area. Returns a single clip.

### Shortening

Entry: `handleArrangementShortening()` in `arrangement-operations-helpers.ts`

1. Calculate the region to remove: `[currentStartTime + target, currentEndTime]`
2. Create temp clip covering that region (audio via session, MIDI directly)
3. Ableton's overlap behavior truncates the existing clip
4. Delete temp clip

### Moving (Arrangement Start)

Entry: `handleArrangementStartOperation()` in
`update-clip-arrangement-helpers.ts`

1. `duplicate_clip_to_arrangement` at new position
2. Verify duplicate succeeded
3. Delete original clip

**Order matters**: in combined move + lengthen operations, move happens FIRST so
lengthening uses the new position.

### Splitting

Entry: `prepareSplitParams()` parses split points, `performSplitting()`
executes. Per-clip work is in `splitSingleClip()`. All in
`arrangement-splitting.ts`.

Optimized algorithm using 2(N-1) duplications for N segments (not 2N):

1. Duplicate original once to holding area (source for all segments)
2. Right-trim original in place → keeps segment 0
3. For each middle segment (1 to N-2):
   - Duplicate holding source
   - Right-trim to segment end
   - Left-trim to segment start
   - Move to final position
4. Left-trim holding source → last segment, move to final position
5. Re-scan track after modifications to get fresh clip objects
   (`rescanSplitClips()` refreshes stale LiveAPI objects)

---

## Source File Reference

| File                                 | Role                                                              |
| ------------------------------------ | ----------------------------------------------------------------- |
| `arrangement-operations.ts`          | Top-level dispatcher (lengthen vs shorten)                        |
| `arrangement-operations-helpers.ts`  | Looped lengthening, shortening, temp clip truncation              |
| `arrangement-unlooped-helpers.ts`    | Unlooped lengthening (MIDI, warped audio, unwarped audio)         |
| `arrangement-tiling.ts`              | Core techniques (holding area, temp clips, session clips, tiling) |
| `arrangement-splitting.ts`           | Clip splitting algorithm                                          |
| `update-clip-arrangement-helpers.ts` | Update-clip integration (move + lengthen orchestration)           |
| `clip-marker-helpers.ts`             | Looping workaround for marker setting                             |

All arrangement source files are under `src/tools/shared/arrangement/` or
`src/tools/clip/arrangement/helpers/`. Test files are colocated under `tests/`
subdirectories.
