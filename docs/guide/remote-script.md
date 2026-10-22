---
title: Remote Script
description:
  The Producer Pal remote script adds clip automation, undo, and loading
  plug-ins and Max for Live devices to Ableton Live. How to install, enable,
  update and remove it.
---

# Remote Script

The remote script is a small Ableton control surface script that runs inside
Live and works alongside the Producer Pal device. Install it as part of the
standard setup. It adds:

- **Clip automation**: read and write automation on clips (volume, pan, sends,
  device parameters) with [Update Clip](/features/tools#ppal-update-clip).
  Arrangement clips can be written, not read back. Writing it needs Live 12.4 or
  later. See [Clip Automation](/guide/automation).
- **Undo and redo**: each request is one undo step in Live, so Cmd+Z / Ctrl+Z
  reverts just that request. The AI can also undo and redo with the
  [Manage](/features/tools#ppal-manage) tool. Live's history includes your own
  edits, so an undo can revert something you did.
- **Plug-ins and Max for Live devices**: load VST/AU plug-ins and Max for Live
  devices by name, like "add Pro-Q 4 to the bass track". The AI finds them with
  the [Library](/features/tools#ppal-library) tool. Without the script,
  [Create Device](/features/tools#ppal-create-device) only adds Live's native
  devices.
- **Presets**: create a device or rack from a preset (`.adv` or `.adg`),
  including drum kits from your Packs, or swap a preset onto a device with
  [Update Device](/features/tools#ppal-update-device). A preset for a different
  device, or a rack, replaces the device, and its automation is lost.
- **Audio to MIDI**: Live's
  [Convert to New MIDI Track](https://www.ableton.com/en/manual/converting-audio-to-midi/)
  commands. Each makes a new MIDI track with an instrument and a clip of the
  notes Live detects: **drums** takes the rhythm of unpitched, percussive audio
  (kick, snare and hi-hat go to a Drum Rack), **melody** the pitches of
  monophonic audio such as a voice or solo instrument, and **harmony** the
  pitches of polyphonic audio such as chords or a full mix.
- **More device settings**: Simpler's pitch-bend ranges, and which rack macros
  are mapped.
- **Adding Producer Pal to a new Set** from a coding agent or the Claude Desktop
  extension. This also needs the device in your User Library (see below).

It works on macOS and Windows. It listens on `http://127.0.0.1:3349`, or on the
next free port (3351 to 3358) when something else, such as a second Live,
already has it. Producer Pal finds it either way.

## Install from the Chat UI

Click **Finish installation…** on the device's Main tab. Or open the
[Chat UI](/guide/chat-ui) with **Open Chat UI** and go to **Settings →
Installation**.

<!-- TODO screenshot: Installation tab (Remote script and device cards) -->

1. **Confirm your User Library folder.** Producer Pal reads it from Live's
   browser database or settings, or finds it in the default location. If it is
   wrong or missing, paste the path yourself: Live shows it under **Settings →
   Library → Location of User Library**.
   - macOS: `~/Music/Ableton/User Library`
   - Windows: `C:\Users\you\Documents\Ableton\User Library`
2. **Remote script:** click **Install** (or **Update**). The script is written
   to `<User Library>/Remote Scripts/Producer_Pal`, replacing any older copy.
3. **Max for Live device:** click **Copy** (or **Update copy**) to copy the
   Producer Pal device to
   `<User Library>/Presets/MIDI Effects/Max MIDI Effect/Producer_Pal.amxd`. One
   copy there serves all your projects, and lets a coding agent or the Claude
   Desktop extension add Producer Pal to a new project.

<img src="/img/producer-pal-chat-settings-remote-script-pre-install.png" alt="The Installation tab before installing, showing Not installed, the User Library path, and the Install button" width="500"/>

### Swap the running device for the User Library copy

Your Live Set remembers which file its device was loaded from, so a device
loaded from Downloads stays tied to that file. Once the remote script is running
and the User Library copy is the same version or newer, click **Swap** on the
Max for Live device card. The AI connection drops for a moment while the new
device starts. **Save your Live Set afterwards** so it keeps using the User
Library copy.

### The reminder

The device's Main tab shows **Finish installation…** while the User Library copy
is missing or older, or the remote script is missing or out of date. It stays
hidden while **Update available** is showing. To turn it off, untick **Warn when
installation is incomplete** in **Settings → Installation**.

## Install by asking the AI

If you use `npx producer-pal` or the Claude Desktop extension, ask the AI to
connect to Ableton. It uses the [Manage](/features/tools#ppal-manage) tool to
install the script (it finds your User Library, or asks you for it) and tells
you the steps below. It works before the device is running, and it isn't offered
in [small model mode](/features#small-model-mode). See
[Claude Desktop](/installation/claude-desktop) for the full setup.

## Enable it in Live

A freshly installed script is **not running** yet:

<img src="/img/producer-pal-chat-settings-remote-script-post-install.png" alt="The Installation tab after installing, showing Installed (not running) and the Enable it in Live steps" width="500"/>

1. **Restart Live.** It only scans Remote Scripts at startup.
2. Go to **Settings → Tempo & MIDI**, and set an unused **Control Surface** slot
   to **Producer Pal**. Leave **Input** and **Output** as **None**. The script
   doesn't use MIDI.

<img src="/img/producer-pal-remote-script-control-surface-setup.png" alt="Live's Settings, Tempo & MIDI tab, with Control Surface 1 set to Producer Pal and Input and Output set to None" width="500"/>

## Check it's working

After restarting Live, click **Check again** (or **Refresh**) in the
Installation tab. It shows the installed version and whether Live is running it.
"Running" means Live loaded it and it is answering on its port:

<img src="/img/producer-pal-chat-settings-remote-script-running.png" alt="The Installation tab showing Installed v2.4.0, running in Live" width="500"/>

If it says installed but not running, you either skipped the restart or the
Control Surface slot isn't set.

## Updating

When the installed script is older than the one in your Producer Pal build, the
tab offers an **Update**. Click it, then restart Live. Your Control Surface
setting is kept.

If the installed script is newer than your Producer Pal device, the tab offers
**Downgrade to match** instead.

You don't need to open Settings to notice. The Chat UI header shows **(script
update)** when the installed script doesn't match your Producer Pal build, and
**(restart Live)** when Live is still running another version than the one
installed. Click either to open the Installation tab. The badge clears once Live
runs the installed script.

## Uninstalling

There is no uninstall button yet, so remove it by hand:

1. In Live, set that **Control Surface** slot back to **None**.
2. Delete the `Remote Scripts/Producer_Pal` folder from your User Library.
3. Restart Live.

## Notes

- **Local only.** The script listens on `127.0.0.1`, so nothing outside your
  computer can reach it. It also refuses requests from web pages in your
  browser.
- **The first plug-in listing is slow.** Live scans your plug-in folders the
  first time it is asked.
- **Developers** can install from a checkout with
  `npm run remote-script:install`. See
  [`remote-script/README.md`](https://github.com/adamjmurray/producer-pal/blob/main/remote-script/README.md)
  for the HTTP API.
