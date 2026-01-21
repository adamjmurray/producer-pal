# Known Issues

This page documents known bugs and limitations in Producer Pal.

## Crashes from Arrangement Clip Position Conflicts

Moving an arrangement clip to the exact start position of another clip on the
same track will crash Live. This is a bug in the Live API's
`duplicate_clip_to_arrangement` function.

**Workaround:** Avoid moving clips on top of existing clips. Delete the
conflicting clip first, or use slightly offset positions.

## Slicing Unwarped Audio Clips

Slicing unwarped audio clips produces incorrect results. The first slice may be
correct, but subsequent slices have offset audio content.

**Workaround:** Enable warping on the audio clip before slicing.

## Lengthening Arrangement Clips

Arrangement clips cannot be directly lengthened. Instead, looped clips are
duplicated and tiled, creating additional clips.

No workaround needed, but it can create a lot of clips.

## Claude Desktop Caches Tool Definitions

If you change the "small model mode" setting in the Max for Live device while
Claude Desktop is running, Claude Desktop will continue using the previously
cached tool definitions. For example, if you launch Claude Desktop with small
model mode enabled and then disable it, Claude Desktop will remain stuck in
small model mode.

**Workaround:** Either fully quit Claude Desktop (not just close the window) and
relaunch it, or go to Settings → Extensions → Producer Pal → Configure and
toggle the "Enabled" switch off and on.

---

If you encounter additional issues, please report them on the
[GitHub Issues page](https://github.com/adamjmurray/producer-pal/issues).
