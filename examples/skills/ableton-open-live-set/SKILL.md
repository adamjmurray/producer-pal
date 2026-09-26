---
name: ableton-open-live-set
description: >-
  Open an Ableton Live Set (.als) by path, or create a new Set, and wait until
  it has loaded, answering the dialogs in the way. Can add Producer Pal to the
  Set, and can quit and relaunch Live first. Use when the user wants to open,
  switch to, load, revert to, or start a new Set, or restart Live. macOS only.
  Opening needs no Producer Pal device.
---

# Ableton: Open a Live Set

`open-live-set.mjs` opens a `.als` file in Ableton Live or creates a new Set,
answers the dialogs that block it, waits until Live shows the Set, and prints
JSON. It can also add Producer Pal to the Set.

## Safety: never discard work without asking

Two flags throw work away:

- `--discard-unsaved` clicks **Don't Save** on the Set that's open now, losing
  its unsaved changes.
- `--discard-recovery` clicks **No** when Live offers to recover work after a
  crash, losing that work.

**Never pass either without asking the user first**, and name what will be lost:
the unsaved changes in the open Set (its name is in the error), or the work Live
recovered after a crash. Ask again for each open unless the user has told you
not to. When the script stops on one of these dialogs, relay it and ask. Don't
retry with the flag on your own.

Without the flags the script loses nothing: it clicks Cancel on the save prompt
(the open Set stays as it was), leaves the recovery dialog up, and exits with an
error.

`--restart` quits Live before opening. A save prompt on quit is handled the same
way: cancelled without `--discard-unsaved` (Live stays up, nothing opens), so
the same rule applies — ask first.

`--add-producer-pal` changes the Set: it adds a MIDI track with the Producer Pal
device, so the Set then has unsaved changes. Use it when the user asked for
Producer Pal in the Set. Without the flag nothing is added.

## Prerequisites

- **macOS** with **Accessibility permission** for the app running the agent
  (Terminal, your IDE, etc.): System Settings → Privacy & Security →
  Accessibility. The script checks this first.
- **Ableton Live** installed. It doesn't need to be running.
- English Live UI assumed.
- Node.js 18+, no npm packages.
- For `--add-producer-pal` only: the
  [Producer Pal remote script](https://github.com/adamjmurray/producer-pal/tree/main/remote-script)
  selected as a Control Surface (Live Settings → Tempo & MIDI; port 3349,
  `PPAL_REMOTE_SCRIPT_PORT` to override), and the `Producer_Pal` device in
  Live's browser (e.g. the User Library).

## Usage

```bash
node open-live-set.mjs "My Song Project/My Song.als"
node open-live-set.mjs --new                        # new Untitled Set
node open-live-set.mjs song.als --add-producer-pal  # add it if not running
node open-live-set.mjs song.als --discard-unsaved   # only after the user agreed
node open-live-set.mjs song.als --restart           # quit Live, relaunch, open
node open-live-set.mjs song.als --app "Ableton Live 12 Suite"
node open-live-set.mjs big-set.als --timeout 300    # default 120 seconds
```

Output on stdout:

```json
{ "opened": "/…/My Song.als", "producerPal": true, "dismissed": [] }
```

- `opened` — the Set's absolute path. With `--new`: `"new": true` instead.
- `producerPal` — whether the Producer Pal device answered after the load (REST
  on port 3350, `PPAL_PORT` to override).
- `addedProducerPal` — only when `--add-producer-pal` added the device:
  `{ "trackIndex": 4, "trackName": "5-MIDI" }`.
- `restarted` — only with `--restart`: whether Live was actually quit and
  relaunched (`false` when it wasn't running).
- `dismissed` — dialogs clicked away: `"unsaved-changes"`, `"crash-recovery"`.
- `warning` — only when present. See "Same name" below.

## When it fails

Exit code 1, with `Error: …` on stderr.

- **"unsaved changes, so nothing was opened"** (or "nothing was quit" with
  `--restart`) — the script clicked Cancel; the open Set is untouched. Ask the
  user to save it, or whether to lose the changes (then rerun with
  `--discard-unsaved`). Live can flag a Set as changed right after it opens, so
  this happens even when nobody edited it. Still ask.
- **"offering to recover work from a crash"** — Live's recovery dialog is still
  up. Ask the user to answer it in Live and rerun, or whether to lose that work
  (then `--discard-recovery`).
- **"would not open the Set"** — it was saved by a newer Live. Use `--app` with
  a newer Live if one is installed.
- **"not allowed assistive access"** — the Accessibility permission is missing
  or stale. Have the user grant it (toggle it off and on if it's already on).
- **"did not quit"** — Live is still running after the timeout. The error lists
  any dialog on screen; relay it.
- **"did not swap Sets" / "No Live window showed"** — timed out. The error lists
  Live's windows and any dialog on screen; relay it. For a big Set or a cold
  launch, retry with a longer `--timeout`.
- **"The Set is open, but …"** — the Set loaded; adding Producer Pal failed.
  Relay the fix in the error: install and select the remote script, keep exactly
  one `Producer_Pal` device in Live's browser, or (if the Set already has the
  device, or it was added but never answered) check the track the error names.

## After opening

- Anything you read from the previous Set is stale. Re-read before editing.
- `producerPal: false` means the new Set has no running Producer Pal device, so
  Producer Pal tools won't reach it. Not an error.

## Gotchas

- **Which Live:** the Set opens in the Live that's running. With none running,
  macOS picks its default app for `.als` files. `--app` chooses one (app name or
  `.app` path). `--new` uses the running Live and ignores `--app`; with none
  running it launches `--app`, or Live. `--restart` relaunches the Live that was
  running unless `--app` says otherwise.
- **A Set saved by a newer Live won't open** in an older one.
- **Same name:** Live windows show only the file name (`Untitled` for a new
  Set). If a window already had that name and Producer Pal wasn't running, the
  swap can't be seen, so the script returns once the name shows and adds a
  `warning`.
- **Cold launches and big Sets are slow.** Raise `--timeout` when needed.
- Live stays in the background, so the user's typing can't answer a dialog.
- To look inside a Set without opening it, use `ableton-read-als`.
