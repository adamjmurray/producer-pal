# Generated Plug-in Devices (Spike)

What we learned spiking a device generated for one plug-in, with a real Live
param for every plug-in param. It revisits the alternative ADR-0061 rejected.
Nothing here ships. The shipped design is in
[plugin-hosting.md](plugin-hosting.md).

## How it works

`scripts/live-api/plugin-host/generate-plugin-device.ts` takes a param list
(`ppal-plugin-host` `params` on a freshly loaded plug-in) and builds a device
from the wrapper template. The User Library gets `PPal <name>.amxd`:

- One `live.dial` per plug-in param, named after it. Live param names must be
  unique in a device, so a repeated name gets its group in front ("ENV1
  Attack"), or " (2)" when the group isn't known.
- With `--au` (macOS), groups come from the plug-in's Audio Unit
  (`au-param-groups.swift`). `vst~` only gives flat names. The AU numbers its
  params differently, so they're matched by name, and a repeated name takes its
  neighbours' group: in Diva and Serum 2 each group is one unbroken run of
  params.
- The panel has a page menu with one page per group (16 knobs a page, so big
  groups get "OSC 1/4"). Each knob shows the plug-in's own name above and its
  value text below. The value text comes free with each echo from the plug-in.
- Each dial's initial value is the plug-in's default, baked into the file.
  Without it, inserting the device adds an undo step per param.
- The wrapper code gets a `BAKED` block: the load request and the dial → param
  index map. On insert it loads the plug-in by itself. The slots are fixed.

Tried with Diva (281 params) and Serum 2 (543). Insert takes about as long as
the generic wrapper (under 2 s). The file is about 2.5 KB per param.

## What works

- Automation lanes, Push and the device show the real param names.
- The plug-in's state saves with the Set, and duplicates keep it.
- Automation drives the plug-in. Automated dials never follow the plug-in
  window, or playback would overwrite them.
- **Follow:** turning a knob or loading a preset in the plug-in's window moves
  the device's dials.

## Live undo facts (found by trial)

- Every Max-side param change is its own undo step, even inside
  `begin_undo_step`/`end_undo_step`. That includes setting a `live.dial` and
  writing a `pattr` blob.
- A Live API `DeviceParameter.value` set joins the open undo step. Sets made in
  one call between `begin_undo_step` and `end_undo_step` are one step.
- The plug-in state write (a Max blob) always lands as its own step, after the
  dials. Opening an undo group around it doesn't change that.

So a preset load costs **two undo steps**, and that's the floor with a Max state
blob. With follow in Python, the first undo puts the dials back (the plug-in's
params follow them) and the second puts the whole state back.

### No other place to keep the state

The plug-in's hidden state (wavetables, routings, samples) exists only inside
its one opaque state chunk, so it can't be split into params. Tried as other
stores for that chunk:

- **A v8 box in parameter mode** (stored-only blob) acts like a `pattr`. Live
  reads the value only when the box calls `notifyclients()`, and each of those
  is an undo step. Saving the Set or duplicating the device uses the last value
  Live read; it never asks for a fresh one.
- **v8 `save()` + `embedmessage`** never runs in Live: not on Set save, not on
  duplicate.

Our notes on the plug-in name also rule out a `dict` with `@embed 1` (a
duplicate doesn't get its contents).

## The follow design, and why each part exists

- **Settle first.** Echoes from the plug-in are noted, then checked once they've
  been quiet for 50 ms. Slot writes pass `speedlim 20`, so an echo can arrive 20
  ms stale. Following each echo right away ping-ponged stale values against the
  dials and looped undo.
- **Compare with the echoed values**, not fresh reads. Once echoes are quiet,
  the last one per param is its value. Asking the plug-in again costs about 0.7
  ms a param (it formats the display text too): 394 ms for Serum's 543.
- **Set the dials from the remote script.** The wrapper posts the changes with
  `XMLHttpRequest`, and Python sets them in one undo step, skipping automated
  params (setting one overrides its automation). Never `setvalueof` on the
  dials: a dial message per param floods undo. If the remote script doesn't
  answer, the wrapper sets them through the Live API in one undo group.
- **Don't follow while playing, for 1 s after a stop, or for 3 s after a state
  restore.** Echoes then are automation or the restore, not the user.
- **Follow's dial sets must not look like playback.** The generic wrapper skips
  a state save when slot writes follow an edit, taking it for playback starting.
  Follow's own sets trip that rule, which lost every preset load's state.
- **No extra edit mark after following.** It only adds an empty undo step.

## Costs and open problems

- **Follow from Max blocked Live.** Each Live API set costs about 5–6 ms on
  Live's main thread: Serum's 543 took 3.3 s, and real preset loads showed the
  OS waiting spinner for about a second. From the remote script, Python set all
  543 in 1.6 ms, as one undo step, and the plug-in followed every dial. A whole
  follow of Serum's 543 now takes about 20 ms to compare and 35–85 ms for the
  round trip to Python. Notes:
  - `XMLHttpRequest` works in Max 9.1.5 (Live 12.4). `fetch()` arrives only in
    Max 9.2 (Live 13), which also rewrote `XMLHttpRequest`, so check it there.
  - Follow at full speed needs the remote script; the Live API fallback still
    stalls. A cap on dials per device (512 or 1024) and a warning would bound
    that case.
  - The wrapper tries the script's ports in order (3349, then 3351–3358) and
    keeps the one that answers. Another Live's script may hold a port with a
    device at the same path, so each request carries some of our params' current
    values and a script whose device doesn't match refuses. Untested with two
    Lives running. With no script, it uses the Live API for 30 s before scanning
    again.
  - The first follow after load builds the device's name-to-param map, one Live
    API call per param (about 0.5 s for Serum). Build it earlier, off the user's
    way.
  - A preset load is still two undo steps. The dials' step is now the newest:
    the first undo puts the dials back (the plug-in's params follow), the second
    puts the whole state back.
- **Plug-in updates.** The map is by `vst~` param index. If an update adds,
  removes or reorders params, dials drive the wrong params and new ones have no
  dial. The device would need to check names at load and remap by name, or ask
  to be regenerated.
- **Live sorts M4L params alphabetically** and shows them as raw 0–1, not the
  plug-in's units. Live can't show the plug-in's own value text.
- **Groups need the AU.** A VST3-only plug-in, or Windows, falls back to " (2)"
  names and pages of 16. VST3 has its own groups (units), but reading them needs
  a VST3 host. Diva's group names are terse ("VCC", "Rtary1").
- **Knob labels** are cut at 11 characters, because `live.comment` wraps.
- **Producer Pal's tools** still treat the device as a slot wrapper.
- **Generating** needs a step that loads the plug-in, reads its params, writes a
  file and waits for Live's browser. That's the per-plug-in file ADR-0061 wanted
  to avoid.
- Untested: Windows, and keyboard undo while the plug-in or Max window has
  focus.
