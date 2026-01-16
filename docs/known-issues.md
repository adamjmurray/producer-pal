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

---

If you encounter additional issues, please report them on the
[GitHub Issues page](https://github.com/adamjmurray/producer-pal/issues).
