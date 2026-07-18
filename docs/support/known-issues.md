# Known Issues

This page documents known bugs and limitations in Producer Pal.

## Undo/Redo Behavior

Live groups all Live API changes into a single undo step until you interact with
Live's UI (clicking, typing, etc.). So if you make multiple requests to Producer
Pal without clicking in Live between them, Cmd+Z / Ctrl+Z may undo everything at
once. On the other hand, heavier operations can get split across multiple undo
steps, so you might need to press undo several times.

This comes from Live's own undo model as exposed through the Live API, not a Max
for Live limitation specific to Producer Pal.

**Workaround:** Save your Live Set before big changes. Click somewhere in Live's
UI between requests if you want separate undo steps.

## Lengthening Looped Arrangement Clips

Looped arrangement clips cannot be directly lengthened. Instead, they are
duplicated and tiled, which can create a lot of clips. Unlooped clips (MIDI and
audio) are extended in place without creating additional clips.

## Automation and Envelopes Not Supported

Producer Pal cannot read, create, or edit arrangement automation or clip
envelopes (parameter values that change over time). See
[Limitations](/features#limitations) on the Features page for details.

## Claude Desktop Caches Tool Definitions

If you change a setting that rewrites the tool definitions — **small model
mode** or the **[notation](/features/midi-notation)** — in the Max for Live
device while Claude Desktop is running, Claude Desktop will continue using the
previously cached definitions. For example, if you launch Claude Desktop with
small model mode enabled and then disable it, Claude Desktop will remain stuck
in small model mode; switch the notation to Stark and it will keep writing
bar|beat.

**Workaround:** Either fully quit Claude Desktop (not just close the window) and
relaunch it, or go to Settings → Extensions → Producer Pal → Configure and
toggle the "Enabled" switch off and on.

---

If you encounter additional issues, check the
[list of open issues](https://github.com/adamjmurray/producer-pal/issues) to see
if it's already been reported. If not,
[file a new issue](https://github.com/adamjmurray/producer-pal/issues/new/choose).
