# Hosting VST/AU Plug-ins in a Max for Live Wrapper

Live's API only reaches the plug-in parameters a user configured by hand (at
most 128). To reach all of them, Producer Pal hosts the plug-in itself, inside a
Max for Live device built around Max's `vst~` object.

**Status: spike, working end to end on macOS with VST3** (Live 12, Colour Copy
and Serum 2). AU, VST2 and Windows are untested.

Release builds leave it out. To use it, build with
`ENABLE_HOSTED_PLUGINS=true npm run build:debug`: that adds `hosted` to
ppal-create-device, the Skills text, hosted reads and writes, and
ppal-plugin-host.

Run `npm run install:plugin-host` to copy the wrapper devices into the User
Library (Live's browser must find them by name).

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
covers a whole `params` list. It resolves names exactly, then ignoring case and
padding; a name that matches more than one param is refused; two entries
reaching one param write the last.

### Naming the plug-in

After a Set reload or duplicate, `vst~` restores the plug-in but the wrapper has
only its file, as `C74_VST3:/Serum2 -125317540` (the number, when there is one,
is a hash of the class UID, not stored in Live's plug-in database as such). The
name must come from somewhere the Set keeps. Tried and dropped: a Max `dict`
with `@embed 1` (the contents don't reach a duplicated device), and the Live
device's name (a user or `name` may rename it). Used: `vstname`, a stored-only
blob `pattr` like `vststate`, which holds `{name, file}` from the last load. The
wrapper trusts the name only while the same file is loaded, else it falls back
to the bundle name. It still renames its Live device to the plug-in's name on
load, for display.

### Saving state

Live saves the plug-in's state in a hidden blob parameter, not through `vst~`.

- `vst~` has `parameter_enable 0` and `autosave 0`. With `parameter_enable 1`,
  every value sent to `vst~` is a Live undo step and `vst~` saves its own state
  in the Set, so Live's saved state lags: Serum 2 came back one change behind,
  and edits made outside the wrapper stayed out.
- `vstmirror` is a `pattr` bound to `vst~`. Its `getvalueof()` returns the
  plug-in's current state as a dict (a `C74Snapshot`: plug-in id plus the
  plug-in's own state chunk, 5 KB for ColourCopy and Serum 2's factory
  programs), fresh on every read.
- `vststate` is a `pattr` with `parameter_enable 1`, type blob, "stored only"
  (`parameter_invisible 1`). It is not in `device.parameters` and can't be
  automated. Live saves it in the device's blob (a 2 MB value was saved), and at
  load restores it through `vstmirror` into `vst~`. Its `thru` is 2, so writing
  it doesn't send the state back to the plug-in.
- Writing `vststate` is one undo step, whatever the size. The wrapper writes it
  only when the state changed, by comparing state strings:
  - at the end of each request, before it replies, so the tool call's own undo
    step covers it (one `ppal-update-device` call is 1 step)
  - (`set` and `write` first wait for the state to change, for at most 100 ms: a
    plug-in applies a written value 1–5 ms after the request. Saving sooner
    found nothing new and left the write to the poll, so a duplicate made just
    after the call lost it.)
  - (`load` first waits until two reads of the state, 250 ms apart, agree, for
    at most 3 s: a fresh u-he plug-in's state changes once just after loading,
    which would leave a second write outside the call's undo step. That adds
    about 0.3 s to loading Diva, Hive and ColourCopy, and nothing for Serum 2 or
    Pro-Q 4.)
  - 300 ms after the last edit in the plug-in's own window, so a drag is one
    step and a quick save still catches it
  - when playback stops, if edits are still pending
  - every 2 s (while playing too) when the state differs, which catches changes
    that send no parameter change, such as a program change
- **Gotcha:** Live saves only what was last written to `vststate`, never the
  live plug-in state, and a duplicate or a same-file hotswap restores from it
  too. A state change not written yet is lost.
- Undoing a write restores the old value into the plug-in (redo does too). The
  wrapper must not write that restored state back, which would drop the redo: it
  skips a state that equals what `vststate` already holds.
- A write that fails doesn't fail the request: the reply carries `stateError`
  and the poll retries.
- A new wrapper has an empty `vststate`, so nothing is restored over a plug-in
  loaded right after it. It writes nothing until a plug-in is loaded. The first
  poll after a load adopts what's stored instead of writing it back.
- Swapping a user's existing native plug-in for a wrapped one loses its
  settings: the Live API can't read a plug-in's state. The clean case is
  plug-ins Producer Pal inserts itself.
- Changes made through the wrapper are no longer undone one parameter at a time:
  Live's undo covers the blob, so one undo puts back the whole previous state.

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
