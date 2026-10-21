# Hosting VST/AU Plug-ins in a Max for Live Wrapper

Live's API only reaches the plug-in parameters a user configured by hand (at
most 128). To reach all of them, Producer Pal hosts the plug-in itself, inside a
Max for Live device built around Max's `vst~` object.

**Status: spike, working end to end on macOS with VST3** (Live 12, Colour Copy
and Serum 2). AU, VST2 and Windows are untested.

## How it works

Two generic wrapper devices ship with Producer Pal, in
`max-for-live-device/plugin-host/`:

| Device                         | Type         | Signal path                                  |
| ------------------------------ | ------------ | -------------------------------------------- |
| `PPal Plug-in Effect.amxd`     | audio effect | `plugin~` → `vst~` → `plugout~`              |
| `PPal Plug-in Instrument.amxd` | instrument   | `midiin` → `midiparse` → `vst~` → `plugout~` |

Nothing is generated per plug-in. Producer Pal inserts a wrapper with the remote
script's browser load, then tells it which plug-in to load. The `.amxd` files
are the source: edit them in Max. The control logic is JavaScript in a
`v8.codebox` inside each patch, so the devices need no external files.

### Messaging

No sockets or ports: named Max `send`/`receive` inside Live's one Max instance.

- Request: Producer Pal's V8 calls
  `messnamed("ppal-plugin-host-req", "request", id, json)`. Every wrapper hears
  it.
- Addressing: the JSON carries a Live `deviceId`. A wrapper answers only when
  that matches its own (`new LiveAPI("this_device").id`, read per request). A
  device keeps its id when moved within a session, so no persisted UUID is
  needed; ids change on Set reload, which Producer Pal re-reads anyway.
- Reply: the wrapper sends `plugin_host_response id chunk1 … chunkN` on
  `ppal-plugin-host-res`; the Producer Pal patch routes that channel into its
  v8. Max caps a symbol at 32,767 chars, so replies are split into 30 KB chunks
  (Serum's full param list is 150 KB).
- An absent wrapper just never answers: the request times out (3 s, or 20 s for
  `load`).

Ops: `info`, `load {plugin}`, `params {names | search, offset, limit}`,
`set {params: [{index | name, value}]}`, and debug-only `raw {message}` (send
`vst~` anything). Values are `vst~`'s normalized 0–1, with the plug-in's own
display text read back (e.g. `" 30% [-17.9 dB]"`, `"1/16 dot"`).

The spike exposes this as the debug-only `ppal-plugin-host` tool, gated with
`ppal-live-api`.

## Findings

### Loading and parameters

- `plug_vst3 <name>` finds plug-ins in the system VST3 folder by name (`Serum2`,
  `ColourCopy`). After a restore, `vst~`'s `currentplug` attribute names the
  loaded plug-in (`C74_VST3:/Serum2`).
- `vst~` answers `params` and `get <n>` synchronously, so one request can list
  and read every parameter. Listing all of Serum 2 is well under a second.
- VST3 plug-ins expose a stand-in parameter for every MIDI CC, pitch bend and
  aftertouch: one unbroken block of 2080 (16 channels × 130) or, for
  FabFilter, 132. Names vary by vendor (`CC 1, CH 4`, `MIDI CC 0|0`,
  `CC107 Chan 16`, a bare `MIDI CC`), and real params can say "Pitch Bend" too,
  so `params` hides the longest run of MIDI-looking names, and only when it's at
  least 128 long. Checked on 11 plug-ins. Real counts after hiding: Colour Copy
  31, Pianoteq 9 217, Diva 282, Hive 341, Supermodal 384, Serum 2 543, Organteq
  2 560, Pro-Q 4 605, VCV Rack 2 1025, Zebra3 2194.
- `open` / `wclose` open and close the plug-in's own editor window.
- `valuemode 2` makes `get` return the value and the display text together.

### Saving state

- `@autosave 1` on `vst~` stores the plug-in's state in the Live Set (as a
  `C74Snapshot` in the device's blob). Plug-in and settings survive save,
  reload, duplicate and a Live restart.
- **Gotcha:** `vst~` caches the plug-in's state when a parameter changes, and
  that cache is what Live saves. Serum 2 applies a change after the cache is
  taken, so saves came back exactly one change behind. Fix: the wrapper re-sends
  the last changed parameter's current value one tick after a `set`, and 250 ms
  after edits made in the plug-in's own window. Verified by hand for both.
- Swapping a user's existing native plug-in for a wrapped one loses its
  settings: the Live API can't read a plug-in's state. The clean case is
  plug-ins Producer Pal inserts itself.
- Live's undo covers changes made through the wrapper: it records a
  `Change in "<device>"` step and restores the saved state. But one change takes
  2–3 presses: a single `vst~` param change makes 2 steps, and the state refresh
  adds one. Changes close together share the same steps, and reads make none.

### Audio, MIDI and latency

- Audio passes through in stereo. `plugin~`/`plugout~` arguments are channel
  numbers, not a count: `plugout~ 2` outputs only the right channel. Use them
  with no arguments.
- `midiparse`'s last outlet emits every MIDI message as `midievent b1 b2 b3`,
  which `vst~` takes directly. Notes verified; CC, bend and aftertouch take the
  same path but are untested.
- Live compensates for the latency a device declares in its patcher `latency`
  attribute, and `this.patcher.setattr("latency", n)` changes it at runtime. The
  attribute resets on reload and plug-ins can change latency, so the wrapper
  polls `get -10` each second and updates it. Verified through the Live API's
  `latency_in_samples`, not by a null test: Pro-Q 4 switching from zero latency
  to natural and linear phase moved it 0 → 320 → 5120 samples within a second
  each.

### Building the devices

An `.amxd` is a 32-byte header (`ampf`, a type code — `aaaa` audio effect,
`iiii` instrument, `mmmm` MIDI effect — `meta`, then `ptch` and a length) around
the patcher JSON plus a trailing NUL. **A patcher whose `project` block lacks
fields Max expects (such as `searchpath`) crashes Live on load**, inside
`project_deserialize_searchpath`. Start from Live's own templates in
`Ableton Live 12 Suite.app/Contents/App-Resources/Misc/Max Devices/`.

## Not yet tested

- CC, pitch bend and aftertouch reaching the plug-in: the Live API can't write
  MIDI CC or pitch bend clip envelopes, so this needs a keyboard.
- CPU cost against the same plug-in loaded natively.
- Multi-output instruments and sidechain inputs.
- AU, VST2 and Windows.
- Sharing Sets: the wrapper must travel with the Set (Collect All and Save), and
  the other user needs Max for Live.
- Automation lanes: wrapper parameters are not Live parameters, so they can't be
  automated. That needs a wrapper with real `live.*` parameters, mapped to
  plug-in parameters (generated per plug-in, or a fixed bank renamed at runtime
  if Max allows it). A device with 2500 static `live.dial`s loads and Live
  exposes all of them, so the parameter count isn't the limit.
