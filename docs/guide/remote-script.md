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
`http://127.0.0.1:3349`.

Install it if you want AI to:

- **Load VST/AU plug-ins and Max for Live devices by name.** Without it,
  [Create Device](/features/tools#ppal-create-device) can only add Live's
  built-in devices.
- **Load presets**: create a device or rack straight from a preset (`.adv` or
  `.adg`), including drum kits from your Packs, or swap a preset onto a device
  that's already in the Set with
  [Update Device](/features/tools#ppal-update-device). A preset for a different
  device, or a rack, replaces the device, and its automation is lost.
- **Open or create a Live Set with Producer Pal already in it**, from the
  `ableton-open-live-set` [Agent Skill](/guide/skills).

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

## Enable it in Live

1. **Restart Live.** It only scans Remote Scripts at startup, so a freshly
   installed script is invisible until then.
2. Go to **Settings → Tempo & MIDI**, and set an unused **Control Surface** slot
   to **Producer_Pal**. Leave **Input** and **Output** as **None**. The script
   doesn't use MIDI.

## Check it's working

The Remote Script tab shows whether the script is installed, its version, and
whether it is running. "Running" means Live loaded it and it is answering on
port 3349.

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
