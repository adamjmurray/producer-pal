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

## Recent Project Context Can Be Lost on a Device Upgrade (Rare)

Your **project context** lives inside the Producer Pal device, so it travels
with your Live Set. To survive a device upgrade — a newer `.amxd` starts as a
fresh, empty device — Producer Pal also keeps a backup:
`Producer Pal Project Context.md`, saved next to your Set's `.als`. It restores
this automatically the first time the AI uses a tool after upgrading.

The backup is (re)written whenever the context changes through a Producer Pal
tool call, a chat, or an edit in the device or Chat UI. One narrow sequence can
leave the newest context un-backed-up:

1. Change the project context,
2. save the Set for the **first time**, or **Save As** to a new project folder,
   then
3. later replace the device with a newer version — with no Producer Pal activity
   in between.

The backup lives in the project's folder, and it's that first save which
establishes the folder. A Max for Live device has no reliable way to know when
the Live Set is saved, so Producer Pal can only write the backup while it's
already doing something — a tool call, chat, or context edit. If nothing touches
the context after that first save, no backup has been written there yet.

**To be safe:** after saving and before upgrading, use Producer Pal once — any
chat, tool call, or context edit writes the backup.

**If context does go missing after an upgrade:** copy it out of the old device
before removing it, or open one of Live's automatic project backups (Live keeps
several).

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
