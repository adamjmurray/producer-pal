# Known Issues

This page documents known bugs and limitations in Producer Pal.

## Undo/Redo Behavior

Live groups all Live API changes into a single undo step until you interact with
Live's UI (clicking, typing, etc.). So if you make multiple requests to Producer
Pal without clicking in Live between them, Cmd+Z / Ctrl+Z may undo everything at
once. On the other hand, heavier operations can get split across multiple undo
steps, so you might need to press undo several times.

This is a Max for Live limitation, not specific to Producer Pal.

**Workaround:** Save your Live Set before big changes. Click somewhere in Live's
UI between requests if you want separate undo steps.

## Lengthening Looped Arrangement Clips

Looped arrangement clips cannot be directly lengthened. Instead, they are
duplicated and tiled, which can create a lot of clips. Unlooped clips (MIDI and
audio) are extended in place without creating additional clips.

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
