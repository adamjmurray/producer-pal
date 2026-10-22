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

Ops: `info`, `load {file, sub?, name, synth}` (see Loading),
`params {names | search, offset, limit}`,
`set {params: [{index | name, value}]}`,
`write {params: [{index | name, text?, number?}]}` (see Setting by display
text), and debug-only `raw {message}` (send `vst~` anything). Values are
`vst~`'s normalized 0–1, with the plug-in's own display text read back (e.g.
`" 30% [-17.9 dB]"`, `"1/16 dot"`).

A wrapper answers inside the `messnamed` call that sent the request, so Producer
Pal can ask any Max audio effect or instrument "are you a wrapper?"
synchronously and get no answer, at no cost, from one that isn't.

Producer Pal's device tools use it: `ppal-create-device` with `hosted: true`
resolves the name, loads the right wrapper through the remote script's browser
load, tells it to load the plug-in (deleting the wrapper again if that fails),
and `ppal-read-device` and `ppal-update-device` read and set its params. The
debug-only `ppal-plugin-host` tool, gated with `ppal-live-api`, reaches the raw
ops.

## Findings

### Loading and parameters

- **Names.** Models use Live's browser name ("Serum 2 FX"), but `vst~` loads a
  VST3 file (`Serum2`), and one file can hold several plug-ins (Serum 2 and
  Serum 2 FX; Repro-1 and Repro-5). Live's plug-in database maps one to the
  other (`plugins` joined to `plugin_modules`), so Producer Pal looks the name
  up there first. Unverified on Live 11 and 12.0–12.1, which keep these tables
  in the files database; a failure there is an error.
- **Loading.** The wrapper sends `unplug`, `plug_vst3 <file>`, then
  `subname <name>` when the file holds several plug-ins. `subname` only matches
  in files that list their plug-ins in `Contents/Resources/moduleinfo.json`
  (Pro-Q 4 and Pianoteq 9 don't), so it's skipped for single-plug-in files. The
  choice survives duplicate. Plug-ins in `~/Library/Audio/Plug-Ins/VST3` load
  too.
- **Verify every load.** Loading by name goes wrong silently:
  `plug_vst3 "Serum 2 FX"` loads the AU, a failed load keeps the old plug-in,
  and a wrong `subname` keeps the file's first one. So `currentplug` must start
  `C74_VST3:/<file>`, must end in a numeric id after a `subname` (no id means
  the first plug-in stayed), and `isSynth` (`get -7`) must match the kind. If
  not, the wrapper unplugs and errors. `load` refuses an instrument in the
  Effect wrapper, and the reverse, before sending anything.
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

### Setting by display text

`vst~` has no way to turn a 0–1 value into text without setting the param. So
`write` searches: it sets 129 evenly spaced values and reads the text each
shows. A sample whose text matches (ignoring case and spaces; or the text in
brackets, as in `[-17.9 dB]`) wins. Otherwise, given a number, it bisects
between the two samples that bracket it, comparing the leading number of the
text (`kHz` and `s` scaled to Hz and ms), and keeps the closest. If nothing
matches, it puts the param back and says what the param does show. One request
covers a whole `params` list, and the state refresh runs once, for the last
param written. It resolves names exactly, then ignoring case and padding; a name
that matches more than one param is refused; two entries reaching one param
write the last.

### Naming the plug-in

After a Set reload or duplicate, `vst~` restores the plug-in but the wrapper has
only its file, as `C74_VST3:/Serum2 -125317540` (the number, when there is one,
is a hash of the class UID, not stored in Live's plug-in database as such). The
name must come from somewhere the Set keeps. Tried and dropped: a Max `dict`
with `@embed 1` (the contents don't reach a duplicated device). Used: on load
the wrapper renames its own Live device to the plug-in's name, which is plain
Set data. After a reload it trusts that name only while it still fits the loaded
file (so a name the user typed over it doesn't pass for the plug-in), else it
falls back to the bundle name.

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
  `Change in "<device>"` step and restores the saved state. One change through
  Producer Pal takes 2 undo steps: the change itself, and the state refresh
  re-send (a change without the refresh is 1 step). Accepted: dropping the
  refresh loses plug-in state. Changes close together share steps, and reads
  make none.

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

### Automation (not supported)

Wrapper parameters are not Live parameters, so they can't be automated. Making
them automatable needs `live.*` dials mapped to plug-in parameters, and every
way of naming those dials needs a wrapper file per plug-in or per instance, so
it was dropped. What the spike found:

- Live reads a device's parameter list once, within about 90 ms of the device
  loading. Dials created later, or renamed or re-ranged later, never reach Live.
  The v8 script's load-time code can set names, ranges and units, and hide
  unused dials (`_parameter_invisible 2`).
- The restored plug-in and stored values arrive after that, so a generic wrapper
  can't name its dials for the plug-in it holds. Real names need the dial
  attributes baked into a wrapper file. A static 2500-dial device loads and Live
  lists them all; each dial adds about 700 bytes to the `.amxd`.
- Deleting the device and undoing re-reads it from its file, and crashed Live
  twice. Hotswapping the same `.amxd` over itself reloads it more safely,
  keeping the device id and plug-in state.
- Live matches automation to parameters by name across reloads.
- With `vst~` saving the plug-in's state (`parameter_enable 1`), every value
  written to the plug-in is an undo step, automation included: 10–20 a second
  while automation moves. `begin_undo_step`/`end_undo_step` don't merge them,
  from the wrapper or the remote script.

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
