# Generated Plug-in Devices (Spike)

What we learned spiking a device generated for one plug-in, with a real Live
param for every plug-in param. It revisits the alternative ADR-0061 rejected.
Nothing here ships. The shipped design is in
[plugin-hosting.md](plugin-hosting.md).

## How it works

`scripts/live-api/plugin-host/generate-plugin-device.ts` takes a param list
(`ppal-plugin-host` `params` on a freshly loaded plug-in) and builds a device
from the wrapper template. The User Library gets `PPal <name>.amxd`:

- One `live.dial` per plug-in param, named after it. Repeated names get " (2)",
  " (3)": Live param names must be unique in a device.
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
blob. The first undo puts the whole sound back. The second puts the dials back.

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
- **Set dials through the Live API**, all in one undo group, never with
  `setvalueof`. A dial message per param floods undo.
- **Don't follow while playing, for 1 s after a stop, or for 3 s after a state
  restore.** Echoes then are automation or the restore, not the user.
- **Follow's dial sets must not look like playback.** The generic wrapper skips
  a state save when slot writes follow an edit, taking it for playback starting.
  Follow's own sets trip that rule, which lost every preset load's state.
- **No extra edit mark after following.** It only adds an empty undo step.

## Costs and open problems

- **Follow blocks Live.** Each Live API set costs about 5–6 ms on Live's main
  thread: 200 changed params took 0.9 s, 543 took 3.3 s. A remote script ping
  stalled 2.4 s while Serum's 543 followed. Loading real Serum presets showed
  the OS waiting spinner for about a second, then Live recovered. Older machines
  will be slower. Ways to manage it:
  - Cap the dials per device (512 or 1024, say), possibly set by the user. This
    bounds the worst case, but then something has to pick which params get
    dials.
  - Warn users about the cost on big plug-ins.
  - **Set the dials from the remote script.** Python set all 543 of Serum's in
    1.6 ms (against 3.3 s from Max), inside `begin_undo_step`/`end_undo_step`,
    as one undo step. Live didn't stall, and the plug-in followed every dial.
    The wrapper still has to hand its changes to Python: Max's v8 has no HTTP,
    so it would go through a `maxurl` object in the device, or through Producer
    Pal's device. Either way, follow then needs the remote script.
- **Plug-in updates.** The map is by `vst~` param index. If an update adds,
  removes or reorders params, dials drive the wrong params and new ones have no
  dial. The device would need to check names at load and remap by name, or ask
  to be regenerated.
- **Live sorts M4L params alphabetically** and shows them as raw 0–1, not the
  plug-in's units. Live can't show the plug-in's own value text.
- **Repeated names.** Diva repeats names across modules ("Attack" in both
  envelopes); " (2)" doesn't say which module. Serum 2's names are unique except
  its Pitch Bend and Mod Wheel stand-ins.
- **Producer Pal's tools** still treat the device as a slot wrapper.
- **The panel** pages 16 knobs at a time; 543 params is 34 pages.
- **Generating** needs a step that loads the plug-in, reads its params, writes a
  file and waits for Live's browser. That's the per-plug-in file ADR-0061 wanted
  to avoid.
- Untested: Windows, and keyboard undo while the plug-in or Max window has
  focus.
