# Known Issues

This page documents known bugs and limitations in Producer Pal and the
underlying Live API.

## Live API Issues

These are bugs in the Ableton Live API that affect Producer Pal.

### Crashes from Arrangement Clip Position Conflicts

**Issue:** Live crashes when attempting to duplicate a clip to the same
Arrangement start time as an existing clip. Specifically, the problem is with
the track API's `duplicate_clip_to_arrangement` function.

**Impact:** This affects the `ppal-update-clip` tool when modifying arrangement
clip positions (the Live API currently has no "move clip" operation, so Producer
Pal duplicates the clip to the desired position and then deletes the original).
If you try to move a clip to the exact start position of another clip on the
same track, Live will crash.

**Workaround:** Avoid moving clips over top of over existing clips in the
Arrangement. Producer Pal works best arranging clips from Session view into an
empty Arrangement. Transformations that don't create overlapping clips, such as
slicing a clip, work fine. If you need clips at the same position, consider:

- Moving the existing clip first
- Using slightly offset positions
- Deleting the conflicting clip before moving the new one
- Rearranging busy Arrangements by hand

**Status:** Crash reported to Ableton. Awaiting a fix.

---

If you encounter additional issues, please report them on the
[GitHub Issues page](https://github.com/adamjmurray/producer-pal/issues).
