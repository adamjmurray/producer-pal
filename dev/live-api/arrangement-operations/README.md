# Arrangement Operations

Arrangement clip operations (lengthening, shortening, splitting, moving) are the
most complex algorithms in the codebase. Every technique exists to work around
non-obvious Live API limitations. This document captures the constraints, the
workarounds, and the algorithm flows so future debugging sessions don't start
from scratch.

## Live API Constraints

These constraints drive every design decision; when something seems
over-engineered, one of these is usually why.

### Resizing a Clip in Place

An arrangement clip's span (`end_time` − `start_time`) can't be written
directly. Two moves change it, and both keep the clip's id, notes, warp markers
and envelopes (probed in Live 12.3.8 and 12.4.6):

- **Unlooped**: the span follows `loop_end`, counted from `start_marker`.
- **Looped**: the span ignores every property, but survives a toggle. Set
  `looping` 0, set `loop_end` to `start_marker` + the span, set `looping` 1.
  Live puts the loop brace back by itself.

Units: `loop_end` is in **beats** for MIDI and warped audio, and in **seconds**
for unwarped audio. A looped audio clip is always warped: Live turns `looping`
off when warp goes off, and turns warp on when `looping` is set.

Things that look wrong but aren't:

- While unlooped, `loop_start` reads as `start_marker` and `loop_end` as the end
  marker. Turning `looping` off swaps in Live's remembered unlooped end, so for
  a moment the span can be anything: write `loop_end` right after.
- `end_marker` on a looped clip is writable and doesn't change the span, so it
  can drift from `start_marker` + span.
- **Growth stops at the next clip.** Live never lets a resized clip overlap the
  next one on its lane: it stops there. On the main lane, lengthening clears the
  span first (a temp clip laid over it, then deleted) so the clip overwrites
  what it grows over, as any write into an arrangement range does. A take lane
  can't be cleared (Live deletes no clip there), so a take-lane clip stops at
  its neighbor and its entry says so.

See `resizeArrangementClip` (`arrangement-clip-resize.ts`) and
[Lengthening](operations.md#lengthening).

**Unlooped audio boundaries**:

- **Unwarped audio**: Ableton auto-clamps `loop_end` to the file boundary. See
  [Lengthening — Unlooped Unwarped Audio](operations.md#lengthening--unlooped-unwarped-audio).
- **Warped audio**: Ableton does **not** auto-clamp — the clip extends with
  silence past the file boundary. Manual boundary detection and clamping is
  required. See
  [Lengthening — Unlooped Warped Audio](operations.md#lengthening--unlooped-warped-audio).

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
the actual file content length. Use content boundary detection instead (see
[File Content Boundary Detection](core-techniques.md#file-content-boundary-detection)).

### Warped vs Unwarped Beats

- **Warped clips**: content beats = arrangement beats. 1 beat of content = 1
  beat of arrangement time.
- **Unwarped clips**: content plays at native sample rate. Arrangement length
  depends on the sample rate vs project tempo, so the same file content produces
  different arrangement lengths at different tempos.

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
   landing at or past the new loop's end (read-clip leaves it out, and the loop
   does not play it).

So selecting a smaller sub-region and doubling is non-destructive: out-of-loop
notes are displaced forward, never deleted or overwritten. The envelope/
automation copy `duplicate_loop` also performs is invisible to read-clip (so it
stays unit-test-only); the note insert/shift geometry can only be observed in
e2e (`e2e/mcp/clip/update/ppal-update-clip-duplicate-loop.test.ts`), since mocks
can't reproduce Live's native shift.

---

## Where the rest lives

| Part                                     | Covers                                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [core-techniques.md](core-techniques.md) | Holding area, edge trimming, the duplicate crash workaround, stamping automation, file content boundary detection |
| [operations.md](operations.md)           | Lengthening (looped, unlooped MIDI, warped and unwarped audio), shortening, moving, splitting                     |

## Source File Reference

| File                               | Role                                                      |
| ---------------------------------- | --------------------------------------------------------- |
| `arrangement-operations.ts`        | Top-level dispatcher (lengthen vs shorten)                |
| `arrangement-length-changes.ts`    | Lengthening and shortening                                |
| `arrangement-clip-resize.ts`       | Resizing one clip in place, looped or not                 |
| `clear-ahead-of-clip.ts`           | Clearing the span a lengthening clip grows into           |
| `unlooped-lengthening.ts`          | Unlooped lengthening (MIDI, warped audio, unwarped audio) |
| `arrangement-tiling-workaround.ts` | Holding area, crash workaround, clip movement             |
| `arrangement-tiling-clips.ts`      | Low-level primitives (temp clips, session clip creation)  |
| `arrangement-splitting.ts`         | Clip splitting algorithm                                  |
| `arrangement-move.ts`              | Update-clip integration (move + lengthen orchestration)   |
| `arrangement-lane-view.ts`         | What is on each lane; writes that leave no clip report it |

Sources are under `src/tools/shared/arrangement/` or
`src/tools/clip/arrangement/helpers/`; tests are colocated in `tests/`.
