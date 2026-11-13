# Operations

Part of [Arrangement Operations](README.md).

## Lengthening — Looped Clips

Entry: `handleArrangementLengthening()` → looped branch in
`arrangement-length-changes.ts`

1. **Clear the span** the clip will grow into (`clearAheadOfClip`), only when
   the lane view finds a clip there: a temp clip laid over
   `[currentEnd, start + target)` trims or removes what's there, then is
   deleted. Without this, Live stops the clip at the next one.
2. **Resize in place** (`resizeArrangementClip`): `looping` 0, `loop_end` =
   `start_marker` + target, `looping` 1. See
   [Resizing a Clip in Place](README.md#resizing-a-clip-in-place).

One clip, same id. A start marker inside the loop or before it (pre-roll) needs
nothing special: Live plays it the same way across the longer span. Every
unlooped case below clears the same way before it grows.

## Lengthening — Unlooped MIDI

Entry: `handleUnloopedLengthening()` → `!isAudioClip` branch in
`unlooped-lengthening.ts`

Sets `loop_end` directly on the source clip to extend the arrangement length.
Also extends `end_marker` so notes are visible in the extended region. No
boundary detection needed (MIDI has no file boundary — content is just notes).

Algorithm:

1. **Clear** the target span
2. **Extend `end_marker`**: set to `clipStartMarker + arrangementLengthBeats`
   (only if extending, never shrink)
3. **Set `loop_end`**: `loopStart + arrangementLengthBeats`

Returns a single clip (preserves clip ID, envelopes, and automation).

## Lengthening — Unlooped Warped Audio

Entry: `handleUnloopedLengthening()` → `isWarped` branch in
`unlooped-lengthening.ts`

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
3. **Clear** up to `effectiveTarget`, so nothing past the file's reach goes
4. **Set `loop_end`**: `loopStart + effectiveTarget` (in content beats, 1:1 with
   arrangement beats)
5. **Extend `end_marker`**: set to `clipStartMarker + effectiveTarget` (only if
   extending)

Returns a single clip (preserves clip ID, envelopes, and automation).

## Lengthening — Unlooped Unwarped Audio

Entry: `handleUnloopedLengthening()` → `!isWarped` branch in
`unlooped-lengthening.ts`

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
4. Clear up to the file's reach (`sample_length` / `sample_rate` past
   `loop_start`), or the whole target when the sample's length is unknown
5. Set `loop_end` to `targetLoopEnd`
6. Read back `end_time` to check actual achieved arrangement length
7. Three-way result:
   - **No change**: `actualArrangementLength <= currentArrangementLength` — at
     file boundary already, warn
   - **Capped**: `actualArrangementLength < arrangementLengthBeats` — extended
     but capped at file boundary, warn
   - **Full**: target achieved

No session clips, no holding area. Returns a single clip.

## Shortening

Entry: `handleArrangementShortening()` in `arrangement-length-changes.ts`

`resizeArrangementClip` to the target, for every clip kind: the looping toggle
for a looped clip, `loop_end` and `end_marker` for an unlooped one. No temp
clip, nothing else on the lane touched.

## Moving (Arrangement Start)

Entry: `handleArrangementStartOperation()` in `arrangement-move.ts`

1. `duplicate_clip_to_arrangement` at new position
2. Verify duplicate succeeded
3. Delete original clip

**Order matters** when one call moves and resizes a clip:

- **Shortening, main lane to main lane:** shorten first, where the clip sits,
  then move. The move copies the clip at its current length and clears that
  whole span, so moving first would wipe neighbors the shortened clip no longer
  reaches. Shortening in place touches nothing else.
- **Everything else:** move first, so lengthening grows from the new position
  instead of over the clip's old neighbors. Take-lane moves re-create the clip
  and take-lane clips refuse `arrangementLength`, so they keep this order too.

Neither step can be undone, so a move that would be refused (a track that won't
take the clip) is checked first: nothing is moved or resized, and the refusal is
the reason on the entry. A lengthen whose move then fails anyway is skipped too
(`not resized`): growing the clip where it sits would clear neighbors the call
never named. If Live throws after a step landed, the entry names what exists now
(the copy, not the source it replaced) and says what landed:
`<error>; already changed: shortened, copy at t0[5|1]` (a lengthening says
`lengthened`, once it grew the clip). A resize that throws after a move landed
says `moved, but arrangementLength didn't finish`, and a move refused after the
shortening adds `shortened in place` to the refusal.

**The duplicate clears its destination range first**, so it destroys whatever
sat there — including another clip the same call names. A take-lane create does
the same on its own lane. `update-clip-move-order.ts` orders the moves to avoid
that where an order exists, keying each span by track AND lane so clips on
different lanes never hold each other up. Two clips sent to one spot have no
such order — that stack is what the call asked for, and the write pipeline
settles it before anything is written: a target a later one covers whole is left
unwritten (`overwritten later in this call by t0[5|1]`, no `ok`), and one it
covers only part of is written and says
`shortened by t0[5|1] later in this call`. What nobody predicted is reported
once the writes are done (`settle-clip-update.ts`): an entry whose clip a later
write cleared drops its `id` and says it was overwritten, or follows what is
left of it. A clip found gone before its turn is skipped
(`not updated: the clip was overwritten earlier in this call`). Nothing is ever
reported `deleted` unless the call asked.

## Splitting

Entry: `readSplitPoints()` parses split points, `performSplitting()` executes.
Per-clip work is in `splitSingleClip()`. All in `arrangement-splitting.ts`.

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

A split can't be combined with `toPath`, `toSlot`, `arrangementStart` or
`arrangementLength`, whatever they name. `refuseSplitWithMove()` throws before
anything is cut. Live keeps only the first piece on the id that was named, so a
list reaches that piece and no other; a single value reaches every piece, which
is worse. One `arrangementStart` stacks them all on one bar and the covers leave
all but the last unwritten — doing as it is told, not a guard. One
`arrangementLength` longer than a piece grows it from its end, which is where
the next piece starts, so each piece buries the one after it. Telling a safe
length from a destructive one needs each piece's own length, and that needs a
Live read this has to answer before, so the whole param is refused.
