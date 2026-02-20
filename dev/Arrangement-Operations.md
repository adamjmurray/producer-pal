# Arrangement Operations

Arrangement clip operations (lengthening, shortening, splitting, moving) are the
most complex algorithms in the codebase. Every technique exists to work around
non-obvious Live API limitations. This document captures the constraints, the
workarounds, and the algorithm flows so future debugging sessions don't start
from scratch.

## Live API Constraints

These constraints drive every design decision. When something seems
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

---

## Core Techniques

### Holding Area

All complex arrangement operations use this pattern to isolate changes from
adjacent clips:

1. Read `song_length` to find a holding area beyond all existing content
2. Duplicate clip there (safe working space far from actual content)
3. Perform trim/adjustment operations there
4. Duplicate result to final arrangement position
5. Clean up holding area copy

The holding area position is always dynamic — never hardcoded. A fixed large
position would permanently bloat the arrangement length, causing unwanted
zoom-out range and scrolling.

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

Files: `arrangement-tiling-helpers.ts` (`createAndDeleteTempClip`),
`arrangement-operations-helpers.ts` (`truncateWithTempClip`)

### Session-Based Tiling

When you need an arrangement audio clip with a specific length:

1. `createAudioClipInSession(track, length, filePath)` — creates in session view
2. Set content markers (`loop_start`, `loop_end`, `start_marker`, `end_marker`)
3. `duplicate_clip_to_arrangement` at target position — inherits session clip's
   arrangement length
4. Clean up session clip via `slot.call("delete_clip")`

Files: `arrangement-tiling-helpers.ts` (`createAudioClipInSession`),
`arrangement-unlooped-helpers.ts` (`lengthenWarpedUnloopedAudio`)

### Duplicate Crash Workaround

Before every `duplicate_clip_to_arrangement` where the source is an arrangement
clip, `clearClipAtDuplicateTarget()` checks for overlapping clips at the target
position. If found, `clearOverlappingClip()` handles all four overlap cases
uniformly:

- **Full containment** (clip within target range): delete the clip
- **Before only** (clip extends before target, ends within): right-trim with
  temp clip
- **After only** (clip starts within target, extends past): dup to holding,
  delete original, left-trim holding, move "after" to target end
- **Both sides** (mid-clip overlap): dup to holding, right-trim original,
  left-trim holding, move "after" to target end

This reuses the same holding area + edge trim primitives as the splitting
algorithm. The workaround is guarded by a disable flag for periodic retesting.

Files: `arrangement-tiling.ts` (`clearClipAtDuplicateTarget`,
`clearOverlappingClip`)

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

Sets `loop_end` directly on the source clip to extend the arrangement length.
Also extends `end_marker` so notes are visible in the extended region. No
boundary detection needed (MIDI has no file boundary — content is just notes).

Algorithm:

1. **Extend `end_marker`**: set to `clipStartMarker + arrangementLengthBeats`
   (only if extending, never shrink)
2. **Set `loop_end`**: `loopStart + arrangementLengthBeats`

No tiling, no holding area. Returns a single clip (preserves clip ID, envelopes,
and automation).

### Lengthening — Unlooped Warped Audio

Entry: `handleUnloopedLengthening()` → `isWarped` branch in
`arrangement-unlooped-helpers.ts`

Sets `loop_end` directly on the source clip. Unlike unwarped clips, Ableton does
**not** auto-clamp at the file boundary for warped clips, so boundary detection
and manual clamping is required.

Algorithm:

1. **Boundary detection**: create session clip with `loop_end=1`, read
   `end_marker` for file content boundary, delete session clip
2. **Three-way check**:
   - **Skip**: `totalContentFromStart <= currentArrangementLength` (no
     additional file content). Warn, return source clip unchanged.
   - **Cap**: file has content but less than target. Cap `effectiveTarget` to
     `totalContentFromStart`, warn.
   - **Proceed**: file has sufficient content for the full target.
3. **Set `loop_end`**: `loopStart + effectiveTarget` (in content beats, 1:1 with
   arrangement beats)
4. **Extend `end_marker`**: set to `clipStartMarker + effectiveTarget` (only if
   extending)

No tiling, no holding area. Returns a single clip (preserves clip ID, envelopes,
and automation).

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

| File                                 | Role                                                      |
| ------------------------------------ | --------------------------------------------------------- |
| `arrangement-operations.ts`          | Top-level dispatcher (lengthen vs shorten)                |
| `arrangement-operations-helpers.ts`  | Looped lengthening, shortening, temp clip truncation      |
| `arrangement-unlooped-helpers.ts`    | Unlooped lengthening (MIDI, warped audio, unwarped audio) |
| `arrangement-tiling.ts`              | Tiling, holding area, crash workaround, clip movement     |
| `arrangement-tiling-helpers.ts`      | Low-level primitives (temp clips, session clip creation)  |
| `arrangement-splitting.ts`           | Clip splitting algorithm                                  |
| `update-clip-arrangement-helpers.ts` | Update-clip integration (move + lengthen orchestration)   |

All arrangement source files are under `src/tools/shared/arrangement/` or
`src/tools/clip/arrangement/helpers/`. Test files are colocated under `tests/`
subdirectories.
