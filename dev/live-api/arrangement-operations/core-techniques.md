# Core Techniques

Part of [Arrangement Operations](README.md).

## Holding Area

All complex arrangement operations use this pattern to isolate changes from
adjacent clips:

1. Find the lane's last clip end (`LaneView.lastEnd`) to place a holding area
   beyond all content
2. Duplicate clip there (safe working space far from actual content)
3. Perform trim/adjustment operations there
4. Duplicate result to final arrangement position
5. Clean up holding area copy

The holding area position is always dynamic — never hardcoded. A fixed large
position would permanently bloat the arrangement length, causing unwanted
zoom-out range and scrolling.

Files: `arrangement-tiling.ts` (`createShortenedClipInHolding`,
`moveClipFromHolding`)

## Temp Clip Truncation (Edge Trimming)

Ableton's overlap behavior is exploited for shortening:

1. Create a temporary clip overlapping the edge of an existing clip
2. Ableton automatically truncates the existing clip at the overlap point
3. Delete the temporary clip immediately

For audio clips, the temp clip is created via session (since arrangement audio
creation doesn't support length control). For MIDI, `create_midi_clip` is used
directly.

Files: `arrangement-tiling-clips.ts` (`createAndDeleteTempClip`),
`arrangement-length-changes.ts` (`truncateWithTempClip`)

## Session-Based Tiling

When you need an arrangement audio clip with a specific length:

1. `createAudioClipInSession(track, length, filePath, report?)` — creates in
   session view. If it throws, it removes what it made (clip, scene) first.
2. Set content markers (`loop_start`, `loop_end`, `start_marker`, `end_marker`)
3. `duplicate_clip_to_arrangement` at target position — inherits session clip's
   arrangement length
4. Clean up with `removeSessionClip`, in a `finally`: it removes the session
   clip and the scene `createAudioClipInSession` made when the last one held
   clips. It never throws; what it couldn't remove goes on the clip's entry
   (`reportScratch`), or is a warning for the song extension, which has none.

Files: `arrangement-tiling-clips.ts` (`createAudioClipInSession`),
`unlooped-lengthening.ts` (`lengthenWarpedUnloopedAudio`)

## Duplicate Crash Workaround

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

Overlaps under `EPSILON` (0.001 beats) are Live's rounding and are left alone:
trimming them leaves a zero-length clip Live won't delete. A clip wholly inside
the range is still cleared however short.

This reuses the same holding area + edge trim primitives as the splitting
algorithm. The workaround is guarded by a disable flag for periodic retesting.

Files: `arrangement-tiling.ts` (`clearClipAtDuplicateTarget`,
`clearOverlappingClip`)

## Stamping a Session Clip's Automation

Copying a session clip to the arrangement writes its automation into the lane
over the copy's own span, and nothing else does (arrangement copies, tiles and
holding-area moves write none). So at any other length than the clip's own, the
lane would be wrong: a shortened copy goes through the holding area and writes
past the song end, and a lengthened one tiles arrangement copies that carry
none. `createClipsForLength` writes the lane first instead:

1. Copy the session clip to a scratch slot on the destination track
   (`openScratchSlot`, the same slot and scene logic `createAudioClipInSession`
   uses).
2. Work out the content playback goes through over the length: a looped clip
   plays start marker to loop end (pre-roll included), then loop start to loop
   end, cut at the length; an unlooped one plays on from its start marker
   (`contentSegments`).
3. For each stretch, set the scratch clip's markers to show just that, copy it
   to the arrangement at its place, and delete the copy at once. The lane keeps
   what the copy wrote. Looped clips set loop and markers (`clipRegionWrites`
   orders them); unlooped ones set the start marker and loop end. Never toggle
   `looping`: a warped clip's loop end resets.
4. Copy the source onto the scratch slot again (exact markers), call
   `clear_all_envelopes`, and run the normal shorten or lengthen with that
   envelope-free clip as the source. Nothing it does touches the lane.

Cost: about length / loop length + 2 copy and delete pairs. It is skipped when
`has_envelopes` is false, for unwarped audio, for arrangement sources and when
the length is the clip's own.

The stamps clear what the final copy would clear (the same span), so the
overwrite report is unchanged. Stamping stops at the request deadline or at the
first failure and says how far the lane got on the clip's entry; the clip is
still placed. A failure after the lane changed says so (`already changed:`). The
scratch copy and its scene are always removed.

Files: `stamp-automation.ts`, `content-segments.ts` (under
`src/tools/actions/duplicate/helpers/clip/`)

## File Content Boundary Detection

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

Files: `unlooped-lengthening.ts` (`tileWarpedAudioContent`)
