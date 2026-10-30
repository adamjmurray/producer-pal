# Hosting VST/AU Plug-ins in a Max for Live Wrapper

Live's API only reaches the plug-in parameters a user configured by hand (at
most 128). To reach all of them, Producer Pal hosts the plug-in itself, inside a
Max for Live device built around Max's `vst~` object.

**Status: spike, working end to end on macOS with VST3** (Live 12, Colour Copy
and Serum 2). AU and VST2 load too (probed on Live 12). Windows and VST2 shell
plug-ins are untested.

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
script's browser load, then tells it which plug-in to load. The control logic is
`wrapper.js` beside the devices, embedded in a `v8.codebox` in each patch, so
the devices need no external files. See
[Building the devices](#building-the-devices).

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

Ops: `info`, `load {format, file, sub?, name, synth}` (see Loading),
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
- **Formats.** A name installed in several formats loads as VST3, else AU, else
  VST2, chosen automatically (the order `browser-device-lookup.ts` uses for
  native devices). Several plug-ins of one name in the chosen format are
  refused, naming the vendors. The load request carries `format`
  (`VST3`/`AU`/`VST2`) and the `file` that format loads by, and the wrapper
  sends `plug_vst3 <bundle>`, `plug_au <AU name>` or `plug_vst <bundle>` (bundle
  names without the extension). `currentplug` then reads `C74_VST3:/Serum2`,
  `C74_AU:/Serum 2 FX` or `C74_VST:/Kaivo`, each with a number after it that
  varies and can be missing right after a load. `plug_au "Apple: AUDelay"` (with
  the vendor) loads nothing, and a bundle holding two AUs needs nothing extra,
  because the name picks one. `subname` is VST3 only. Saving state works
  unchanged for all three, and survives a track duplicate.
- **VST2.** Live's plug-in database has VST2 rows (`device:vst:instr:…?n=Kaivo`,
  path `…/VST/Kaivo.vst`), so VST2 resolves like VST3. A VST2 _shell_ plug-in
  (several in one module, like Waves' WaveShell) is refused: `subname` can't
  pick one.
- **AU.** The database has no AU rows: Live asks macOS for AUs. Candidates are
  the AUs Live's browser lists, which honors Live's "Use Audio Units v2"
  setting; if the remote script can't answer, there are none. The browser
  doesn't say instrument or effect, so Producer Pal reads it from the bundles'
  `Contents/Info.plist` (`read-au-components.ts`, a small XML reader). Each
  `AudioComponents` entry has a `name` ("Xfer Records: Serum 2 FX": vendor, then
  the AU name) and a `type`: `aumu` is an instrument, `aufx` and `aumf` are
  effects, anything else (`aumi`, …) is refused. Folders:
  `/Library/Audio/Plug-Ins/Components`, the same under `~`, and
  `/System/Library/Components` (Apple's AUs, e.g. `CoreAudio.component`). A
  binary plist, or an AU with no matching entry, is "can't tell". Plists are
  read only when no VST3 matched. AU presets aren't supported.
- **Loading.** The wrapper sends `unplug`, then `plug_vst3 <file>`,
  `plug_au <name>` or `plug_vst <file>`, then `subname <name>` when the VST3
  file holds several plug-ins. `subname` only matches in files that list their
  plug-ins in `Contents/Resources/moduleinfo.json` (Pro-Q 4 and Pianoteq 9
  don't), so it's skipped for single-plug-in files. The choice survives
  duplicate. Plug-ins in `~/Library/Audio/Plug-Ins/VST3` load too.
- **Verify every load.** Loading by name goes wrong silently:
  `plug_vst3 "Serum 2 FX"` loads the AU, `plug_au Serum2` loads the VST3, a
  failed load keeps the old plug-in or loads nothing, and a wrong `subname`
  keeps the file's first one. So `currentplug` must start with the prefix of the
  format asked for (`C74_VST3:/`, `C74_AU:/` or `C74_VST:/`) then the file, then
  at most a numeric id; after a `subname` the id must be there (no id means the
  first plug-in stayed); and `isSynth` (`get -7`) must match the kind. If not,
  the wrapper unplugs and errors. `load` refuses an instrument in the Effect
  wrapper, and the reverse, before sending anything.
- `vst~` answers `params` and `get <n>` synchronously, so one request can list
  and read every parameter. Listing all of Serum 2 is well under a second.
- VST3 plug-ins expose a stand-in parameter for every MIDI CC, pitch bend and
  aftertouch: one unbroken block of 2080 (16 channels × 130) or, for
  FabFilter, 132. Names vary by vendor (`CC 1, CH 4`, `MIDI CC 0|0`,
  `CC107 Chan 16`, a bare `MIDI CC`), and real params can say "Pitch Bend" too,
  so `params` hides the longest run of MIDI-looking names, and only when it's at
  least 128 long. Checked on 11 plug-ins. Real counts after hiding: Colour Copy
  31, Pianoteq 9 217, Diva 282, Hive 341, Supermodal 384, Serum 2 543, Organteq
  2 560, Pro-Q 4 605, VCV Rack 2 1025, Zebra3 2194. Serum 2's AU has the same
  2080-param block and comes to 542.
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
  - not when slots moved the plug-in: reads and the poll adopt that state
    without writing (see Automation)
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
- Only one stereo pair each way: the wrappers use `vst~ 2 2`. A multi-output
  instrument (Organteq 2 has 8 outputs) sends Live only its first two, and an
  effect gets no sidechain input.
- `midiparse`'s last outlet emits every MIDI message as `midievent b1 b2 b3`,
  which `vst~` takes directly. Notes verified; CC, bend and aftertouch take the
  same path but are untested.
- Live compensates for the latency a device declares in its patcher `latency`
  attribute, and `this.patcher.setattr("latency", n)` changes it at runtime. The
  attribute resets on reload and plug-ins can change latency, so the wrapper
  polls `get -10` each second and updates it. Verified through the Live API's
  `latency_in_samples`, not by a null test: Pro-Q 4 switching from zero latency
  to natural and linear phase moved it 0 → 320 → 5120 samples within a second
  each, and a duplicated copy came back at 5120.

### Automation

Plug-in params aren't Live parameters, so the wrapper carries a fixed set of
`live.dial`s, 0–1, that Live can automate. Each dial is a slot that can drive
one plug-in param. There are 128: a dial, a `prepend slot N` and two cords per
slot in the patcher, and `SLOT_COUNT` in the code box. Change both together.

- **Names are fixed and zero-padded**: "Automation 001" to "Automation 128" (two
  digits under 100 slots). Live reads a device's parameter list once, about 90
  ms after load, before the plug-in is restored, so the dials can't be named for
  it. Live sorts the names as text, so unpadded ones would list as 1, 10, 11,
  … 2.
- **Live matches automation to parameters by name** across reloads, so a slot
  keeps its automation whatever it drives.
- **The mapping** is `vstslots`, a stored-only blob like `vststate`: JSON
  `{"<slot>": {index, name, file}}`, where `file` is the plug-in file the entry
  was made for. Entries for another file are ignored, and dropped the next time
  the mapping is saved. `ppal-plugin-host` has `map`, `unmap` and `slots` (which
  also gives the slot count). The panel shows the list ("3: Cutoff").
- **Running**: a dial change reaches the code box as `slot <n> <value>`, which
  writes the mapped param. `vst~` echoes a write straight back, while the script
  is still busy, so the echo isn't taken for an edit in the plug-in's window.
- **After load**: once the restored plug-in is ready, the wrapper sends each
  mapped dial's value to the plug-in, so a reopened Set matches its dials.
- **`map`** sets the dial to the param's current value, so dial and plug-in
  agree. It leaves the dial alone when the slot already drives that param (it
  changes nothing and saves nothing) or when the dial has arrangement automation
  (`automation_state` not 0 on its `DeviceParameter`), since setting a dial from
  the wrapper overrides playing automation, as touching an automated knob does.
  The reply says whether it did (`dialSet`).
- **Undo**: the plug-in's state changes while slots write, but a state written
  to `vststate` is an undo step, and a moving envelope writes its slot hundreds
  of times a second. So a read request, or the poll, that finds the state
  changed only because slots wrote since the last save takes it as saved without
  writing it. Stand-in params for MIDI don't count as edits either: Live's All
  Notes Off lands there when playback starts and stops. Trade-off: an edit in
  the plug-in window or a program change made while slots move is saved only by
  the next real save. Setting the dial in `map` is one extra undo step.
- **How the tools use slots**: `ppal-update-clip` takes a hosted param as an
  `envelopes` target spelled as the wrapper's device path plus the param's `h`
  id (`t3/d0/h206`; a rack-nested wrapper is `t3/d0/c1/d0/h206`). The wrapper
  must be on the clip's own track. The tool picks the slot: the one already
  driving that param; else the lowest unmapped slot with no arrangement
  automation; else a mapped slot that has lost its automation everywhere (its
  `automation_state` is 0 and no session clip on the track holds an envelope for
  it), which it remaps. A slot with automation is never remapped. If none
  qualifies the line is skipped. Reclaiming is off while the track plays from
  Session, since `automation_state` reads 0 there whatever the lane holds. It
  maps with `map`, then writes the envelope to the slot's Live parameter (found
  by name) like any parameter id. A wrapper still loading (`map` refuses for
  about 1.5 s after a Set opens or a track is duplicated) skips the line with a
  "try again" detail. Clearing a hosted target clears its slot's envelope, and
  does nothing when no slot drives the param. Slots are asked about once per
  call per wrapper.
- **Reads**: `ppal-read-clip` names an envelope on a mapped slot by the
  plug-in's param, with `id` `t3/d0/h206` and `slot` "Automation 002"; an
  unmapped slot reads as any parameter. `ppal-read-device` adds `slot`, and with
  values `automation`, to hosted params that a slot drives.
- **Why 128**: each slot adds about 1.5 KB to the `.amxd` (18 KB gzipped for the
  whole wrapper) and under 1 ms to loading it: 128 slots loaded about 40 ms
  slower than 32, and 1000 about 0.6 s slower. Slots can be added later, but
  never renamed or removed: that would cut off automation saved in users' Sets.
  Three digits leave room up to 999.
- Deleting the device and undoing re-reads it from its file, and crashed Live
  twice. Hotswapping the same `.amxd` over itself reloads it more safely,
  keeping the device id and plug-in state.
- With `vst~` saving the plug-in's state itself (`parameter_enable 1`), every
  value written to the plug-in is an undo step, automation included.
  `begin_undo_step`/`end_undo_step` don't merge them, from the wrapper or the
  remote script. That is why `vst~` has it off.

### Building the devices

An `.amxd` is a 32-byte header (`ampf`, a type code — `aaaa` audio effect,
`iiii` instrument, `mmmm` MIDI effect — `meta`, then `ptch` and a length) around
the patcher JSON plus a trailing NUL. **A patcher whose `project` block lacks
fields Max expects (such as `searchpath`) crashes Live on load**, inside
`project_deserialize_searchpath`. Start from Live's own templates in
`Ableton Live 12 Suite.app/Contents/App-Resources/Misc/Max Devices/`.

`npm run plugin-host:build` rebuilds both devices in place
(`scripts/live-api/plugin-host/build-plugin-host.ts`). It puts `wrapper.js` into
each `v8.codebox` and regenerates the 128 automation dials, their
`prepend slot N` boxes and cords, the `vstslots` pattr and the slot list. It
leaves every other box, and the `project` block, alone. Edit `wrapper.js` and
the generated boxes through the script; edit the rest of the patch in Max, then
run the script so the files match what a rebuild gives. A test fails while a
device is out of date with `wrapper.js`. After editing the code inside Max's
code box instead, `npm run plugin-host:build -- --extract` copies it back into
`wrapper.js` first.

### Installing the devices

Live's browser must find the wrappers by name, so they go in the User Library:
`Presets/Audio Effects/Max Audio Effect/` and
`Presets/Instruments/Max Instrument/`.

- **Bundles.** The device and portal bundles embed both `.amxd` files as base64
  (`config/rolldown-plugin-embed-plugin-host.mjs` replaces
  `src/portal/setup/plugin-host/embedded-plugin-host-wrappers.ts`). Only a build
  with `ENABLE_HOSTED_PLUGINS=true` does. Any other build embeds an empty map
  and the install step returns before touching it, so a release carries no
  wrapper bytes and installs none.
- **Where they install.** Every install path copies them: `ppal-manage`
  `install-producer-pal` (device and portal), `update-producer-pal`, the
  portal's offline `add-producer-pal`, and the chat UI's Settings → Installation
  copy. The copy is temp-file-and-rename, the same step the device uses
  (`src/portal/setup/replace-via-temp.ts`).
- **Chat UI button.** In a hosting build, `GET /device-install` also reports
  each wrapper (`pluginHost`: missing, current or differs), and the Installation
  tab offers Install when the device or any wrapper needs it, even with the
  device current. A failed wrapper's message says "click Install", not
  `install-producer-pal`. A release build's response and `chat-ui.html` carry
  none of this (`release-bundle-contents.test.ts`).
- **Bytes decide.** A wrapper that differs from the embedded one is replaced; no
  version is compared. A Set that's already open keeps the old wrapper until
  it's reopened.
- **A wrapper never fails an install.** Each reports for itself (`pluginHost` in
  the result). On Windows, Live holding the file open is the usual cause; the
  entry says to close the Sets that use it and run `install-producer-pal` again.
- **Missing wrapper.** `ppal-create-device` with `hosted: true` fails with
  nothing changed and says how to install it. Live's browser can take a few
  seconds to see a file that was just copied.
- **Dev scripts.** `npm run install:plugin-host` copies from the repo files,
  whatever the build flags. `install:status` reports each wrapper as missing,
  current or differing from the repo; `uninstall`, `uninstall:all` and
  `uninstall:plugin-host` remove them.

## Not yet tested

- CC, pitch bend and aftertouch reaching the plug-in: the Live API can't write
  MIDI CC or pitch bend clip envelopes, so this needs a keyboard.
- CPU cost against the same plug-in loaded natively.
- Windows, and VST2 shell plug-ins.
- Sharing Sets: the wrapper must travel with the Set (Collect All and Save), and
  the other user needs Max for Live.
