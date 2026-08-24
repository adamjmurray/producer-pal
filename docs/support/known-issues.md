# Known Issues

This page documents known bugs and rough edges in Producer Pal.

::: tip Looking for what Producer Pal can't do?

Automation and clip envelopes, VST/AU plug-in internals, audio analysis and
synthesis, drum pitch maps, and lengthening looped arrangement clips are
**[Limitations](/features/limitations)** — design boundaries rather than bugs,
so they aren't listed here.

:::

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

## Recent Project Context Can Be Lost on a Device Upgrade (Pre-2.1.0 Devices)

Your **project context** lives inside the Producer Pal device, so it travels
with your Live Set. A newer `.amxd` starts as a fresh, empty device, so an
upgrade used to lose it. Version 2.1.0 fixes that with a backup:
`Producer Pal Project Context.md`, saved in your Live Project folder — one file,
shared by every Set in it. It restores automatically the first time the AI uses
a tool after upgrading.

**Upgrading from a device older than 2.1.0 has nothing to restore from** — those
devices never wrote the backup. Copy the context out of the old device before
you replace it.

The backup is (re)written whenever the context changes through a Producer Pal
tool call, a chat, or an edit in the device or Chat UI. From 2.1.0 on, one
narrow sequence can still leave the newest context un-backed-up:

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

**Right after an upgrade, the context box looks empty.** The restore runs the
first time the AI uses a tool, so until you start a chat there's nothing in it
yet. Start the chat and your notes come back. Typing into the empty box before
then keeps what you type, but leaves the backup alone until the next time you
load the device.

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

## `npx` Fails Inside the Source Repository

This one only affects people working from a clone of the
[source repository](https://github.com/adamjmurray/producer-pal). A normal
install is unaffected.

If your AI tool runs `npx -y producer-pal` with its working directory set to the
repository, `npx` finds the local `package.json` — also named `producer-pal`,
but with no command for `npx` to run — and stops there instead of fetching the
published package. It exits right away with
`could not determine executable to run`, so the AI reports that the MCP server
closed the connection during startup.

**Workaround:** use `producer-pal@latest` in your MCP config. A version tag
makes `npx` resolve against npm instead of matching the local `package.json`.
Failing that, run your AI tool from a folder outside the repository, or point
the MCP server's working directory somewhere else — every tool configures that
differently, so consult your AI tool's MCP documentation.

---

If you encounter additional issues, check the
[list of open issues](https://github.com/adamjmurray/producer-pal/issues) to see
if it's already been reported. If not,
[file a new issue](https://github.com/adamjmurray/producer-pal/issues/new/choose).
