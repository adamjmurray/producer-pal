---
title: Remote Script
description:
  Install the optional Producer Pal remote script so AI can load VST/AU
  plug-ins, Max for Live devices, and presets in Ableton Live. Install from the
  Chat UI, enable it in Live, update, and uninstall.
---

# Remote Script

The remote script is an optional companion to the Producer Pal device. It is a
small Ableton control surface script that runs inside Live and listens on
`http://127.0.0.1:3349`, or on the next free port (3351 to 3358) when something
else, such as a second Live, already has it. Producer Pal finds it either way.

Install it if you want AI to:

- **Load VST/AU plug-ins and Max for Live devices by name**, like "add Pro-Q 4
  to the bass track". The AI finds them with the
  [Library](/features/tools#ppal-library) tool. Without the script,
  [Create Device](/features/tools#ppal-create-device) can only add Live's native
  devices, not Max for Live ones such as LFO or DS Kick.
- **Load presets**: create a device or rack straight from a preset (`.adv` or
  `.adg`), including drum kits from your Packs, or swap a preset onto a device
  that's already in the Set with
  [Update Device](/features/tools#ppal-update-device). A preset for a different
  device, or a rack, replaces the device, and its automation is lost.
- **Add Producer Pal to a Live Set** from a coding agent: to the open Set with
  the `producer-pal` [Agent Skill](/guide/skills), or while opening or creating
  one with `ableton-open-live-set`. This needs the device installed in your User
  Library's Max MIDI Effect folder (see
  [installing](/installation#install-the-device) or
  [upgrading](/installation/upgrading)).

::: warning Prototype

The remote script is an early prototype. It works on macOS and Windows, but how
it is installed and what it does may change.

:::

## Install from the Chat UI

1. Open the [Chat UI](/guide/chat-ui) and go to **Settings → Remote Script**.
2. **Confirm your User Library folder.** Producer Pal reads it from Live's
   browser database. If it is wrong or missing, paste the path yourself: Live
   shows it under **Settings → Library → Location of User Library**.
   - macOS: `~/Music/Ableton/User Library`
   - Windows: `C:\Users\you\Documents\Ableton\User Library`
3. Click **Install**. The script is written to
   `<User Library>/Remote Scripts/Producer_Pal`, replacing any older copy.

<img src="/img/producer-pal-chat-settings-remote-script-pre-install.png" alt="The Remote Script tab before installing, showing Not installed, the User Library path, and the Install button" width="500"/>

## Enable it in Live

Once installed, the tab says the script is **not running** yet and lists the
steps to enable it:

<img src="/img/producer-pal-chat-settings-remote-script-post-install.png" alt="The Remote Script tab after installing, showing Installed (not running) and the Enable it in Live steps" width="500"/>

1. **Restart Live.** It only scans Remote Scripts at startup, so a freshly
   installed script is invisible until then.
2. Go to **Settings → Tempo & MIDI**, and set an unused **Control Surface** slot
   to **Producer Pal**. Leave **Input** and **Output** as **None**. The script
   doesn't use MIDI.

<img src="/img/producer-pal-remote-script-control-surface-setup.png" alt="Live's Settings, Tempo & MIDI tab, with Control Surface 1 set to Producer Pal and Input and Output set to None" width="500"/>

## Check it's working

After restarting Live, click **Refresh** in the Remote Script tab. It shows the
installed version and whether Live is running it. "Running" means Live loaded it
and it is answering on its port:

<img src="/img/producer-pal-chat-settings-remote-script-running.png" alt="The Remote Script tab showing Installed v2.4.0, running in Live" width="500"/>

If it says installed but not running, you either skipped the restart or the
Control Surface slot isn't set.

## Updating

When the installed script is older than the one in your Producer Pal build, the
tab offers an **Update**. Click it, then restart Live. Your Control Surface
setting is kept.

If the installed script is newer than your Producer Pal device, the tab offers
**Downgrade to match** instead.

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
