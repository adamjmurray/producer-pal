# Skip entries: devices

Part of [Skip entries, tool by tool](README.md).

- **update-device's `macroCount` says which mapped macros it hid.** Lowering the
  count hides macros and keeps their mappings, so a hidden one is no loss but
  would otherwise vanish unremarked. With the remote script, a rack with
  mappings is asked which macros are mapped before anything is written, and the
  entry's `detail` names those the count hid
  (`macro 7 hidden; its mapping is kept`). Without it, or when it can't answer,
  the detail says the hidden range keeps any mappings, and why the check failed.
  A remote script too old to have the route counts as not running (or, for the
  detail's wording, out of date). A target that also loads a preset isn't asked,
  since a replaced device makes the answer moot. The question is asked before
  the write, so nothing can fail after the count has changed. A rack Live won't
  take below 1 macro says where the count landed.
- **update-device's `pitchBendRange` and `notePitchBendRange` are `params`
  entries written through the remote script.** Only a Simpler has them (on
  another device the name is not found, as any unknown param). Each entry comes
  back as `{ name, value }` when it read back as asked, and `ok: false` with the
  reason otherwise: not a whole number in range (nothing is sent for it), the
  remote script isn't running ("needs the Producer Pal remote script") or is out
  of date (which says so and how to update it), the remote script refused, or it
  read back different (`landed at 11, not 12`). The entries are written ahead of
  the target's other writes, one call per Simpler, the last of each name. A
  route that doesn't answer, or whose connection is lost after the request went
  out, may still have written: the entry says the value _may have changed_ and
  keeps its place (never a lone throw), and the Simplers after it in the call
  say they weren't tried and to re-run. A write whose expiry ran out before Live
  started it changed nothing: the entry says
  `not set: ... nothing changed, re-run it`, and the Simplers after it are still
  tried. A call with no time left says the value wasn't set and names the target
  to re-run. Where the sync param write is all there is (create-device, a rack's
  `pC1/d0/` shortcut) the entry says to use update-device on the Simpler's own
  path.
- **A take lane reports the params it has no use for.** `ppal-update-track`
  writes a lane's name and nothing else, so everything else the call sent is a
  `detail` on the lane's own entry, which otherwise reads like any other hit.
  `ok: false` only when the lane was neither created nor named, so nothing the
  call asked of it landed.
- **create-device answers per path named.** A path that finds no place for a
  device (no such track or rack, a scene, an index past the end, a device Live
  turned down, one the deadline never reached) holds its slot as
  `{path, ok: false, detail}`, and the other paths are still made. A device of
  the wrong kind for a track that takes only audio effects (a group, audio,
  return or main track) is refused before Live is asked, saying why:
  `group track t9 (id 12) takes only audio effects; "Operator" is an instrument`.
  The same for a chain of an audio effect rack (audio effects only) or a MIDI
  effect rack (MIDI effects only), worked out once Live has turned the insert
  down. A plug-in's kind shows once it is loaded, so it is refused then, or
  `"X" may not be an audio effect` (`a MIDI effect` for a MIDI effect rack's
  chain) when its kind can't be read. update-device's `toPath` move names the
  same reasons, in the same words, when Live drops a move onto such a place
  (checked once Live has refused it), with the move's usual skip or error shape.
  A device that is in the Set keeps its normal entry (`id`, `path`) when a later
  step threw (a name Live refused), plus a `detail` saying why and what landed:
  `<error>; already changed: device created`. A browser load's temp track that
  can't be deleted doesn't fail the load: the entry keeps `id` and `path`, plus
  `the device was created, but the temporary track at <path> couldn't be deleted: <why>`.
  If the load itself failed, that goes on the end of its error. A track
  selection that won't go back is not reported. Entries name each device where
  it sits after the call, since a later insert can push an earlier one down a
  slot. The `name` list pairs by the path's place, so a skip doesn't slide it. A
  `preset` file path that several same-named packs (or Places folders with no
  disk path) could hold is never guessed: that path's entry is
  `{path, ok: false, detail}` naming each candidate by its browser `uri`, and
  says to load the file from a uniquely named folder.
- **A `preset` name (create-device, update-device) is found wherever it's
  filed.** Live's browser is searched first, under the named device or, for
  update-device, then anywhere. The match is the whole name, any case, with or
  without `.adv`/`.adg`. Where the files are listed depends on what the browser
  finds:
  - **Nothing.** The name is looked up in Live's library database, never by
    walking the Drums or Sounds sections (that can crash Live), and loads by
    file. One file loads; several refuse.
  - **One match.** The database is asked too, for same-named files the browser
    doesn't list (a pack Max device's preset sharing a name with a Core Library
    one). Several refuse, filtered by the device's library class: racks by their
    rack class, any other device by its own. One or none: the browser's match
    loads.
  - **Several matches.** The browser lists a rack under every device it is built
    around, and two files can share a browser path, so the database settles it.
    It is asked for every file with the name; with a device named or targeted,
    the files are read and kept if they are for it (a rack counts for the device
    it is built around; an unreadable file or an unknown device counts as for
    it). Several files refuse, listing their absolute paths. One file loads only
    when the browser's matches look like that file listed under several devices:
    no two at the same browser path, all with the same path below their device
    folder, and the file's path ending with it. Otherwise, and with no files
    left, the browser's paths are listed.
  - **No database.** The browser's match loads, or its paths are listed for
    several; with no match, today's "no preset" error stands.
  - update-device asks for the target's presets first and takes any preset only
    when it has none by that name. A plug-in, or a Max device listed under Max
    for Live, has no class to filter by, so its name isn't looked up in the
    database. The database is read as of Live's last save, so a preset added
    this session may not be found.
- **A browser path two items share is refused, never guessed.** A `preset` or
  `deviceName` spelled `<section>/<path>` (e.g.
  `Instruments/Instrument Rack/Mallets/Vibraphone.adg`) that lists two or more
  loadable items at the end is refused with the count: Live can list a Core
  Library file and a pack's at one path, and the remote script would load the
  first. A `preset` refusal says to pass the file's absolute path from
  ppal-library; `deviceName` has no way to name one. A suffix picks between a
  rack and a preset of one name (`Foo.adv`); folders don't count.
- **A preset file is checked against the device a call names.** create-device
  with a `deviceName` and an absolute file path (a Windows drive or network
  share too) reads the gzipped XML and refuses a file for another device, as it
  does a browser path: `preset "<path>" is not a preset for <device>`. An `.adv`
  is for the device its root element names; an `.adg` for the rack it holds, or
  (for a device that isn't a rack) the device it is built around, the first
  device of its first chain. A rack that merely holds the device isn't for it. A
  device with no known class (plug-ins, Max devices), or a file that can't be
  read, isn't checked. update-device takes any file, as it does any preset.
- **A preset that holds the Producer Pal device is refused after Live loads
  it.** The remote script looks through what `/load` or `/hotswap` loaded
  (chains, return chains, drum pads) and deletes what holds it, by device name
  (a renamed Producer Pal isn't caught). `/load`: 409 "nothing was loaded", so
  create-device's entry is `{path, ok: false, detail}`. `/hotswap`: Live had
  already replaced the device, so the script deletes the new one and the slot is
  left empty. The swap and the delete share the call's undo step, so the 409
  says undoing the call brings the old device back, along with the rest of the
  call. update-device's entry names the target by `path` (the old id is gone)
  with `preset not loaded: <why>; already changed: the device was replaced`, and
  nothing else is written to that target. Later targets still load at their
  current path. If the delete fails, the 409 says where the device is instead
  (no undo hint: that undo would remove a Producer Pal, so it is refused). Only
  a preset can hold it: Producer Pal loaded by name is judged on its own.
- **A `/hotswap` that timed out may still land.** update-device skips that
  target with
  `preset not loaded: <why>; Live may have loaded it anyway, so check the device before re-running`
  and writes nothing else to it, since the device at its path is unknown. Later
  targets still run.
- **update-device: a target dead by its turn is a skip.** Targets resolve up
  front, so one inside a rack that an earlier target's `preset` replaced (or one
  an earlier forced pad-sample swap deleted) is gone when its turn comes. Every
  target kind is checked before any work: its entry is
  `{ id | path, ok: false, detail: "no longer exists: an earlier target in this call replaced it or its rack" }`,
  and nothing is written to it. A target that only moved keeps its path and is
  written as usual.
- **update-device's per-param drop paths became entries.** A `params` list
  answers with one entry per param sent: a disabled param, an ambiguous name, an
  unreadable value, a unit that can't be checked, a write Live ignored, a nested
  path that resolved to nothing, a resolution that threw, a param a chain or pad
  has no use for — each is `ok: false` with a detail on that param's own entry
  now, and warns nowhere. A param whose value Live changed on the way in (a
  clamp, the nearest step of a coarse ladder) reports the value it reads as plus
  a detail, and no `ok`. A specialized pseudo-param answers the same way: a
  `PseudoParam.write` returns the reason it refused a value rather than a
  boolean, so the refusal reaches the caller as that param's own entry.
- **The params that never go through `params` report on the target.** `gainDb`,
  `pan`, `mute`, `solo`, `sends` and the rest are their own arguments, so there
  is no param entry to hold them: a kind of object with no use for one collects
  it and the target's entry says `gainDb, pan ignored: can't be set on a device`
  — the type, without the label the entry already carries. They stop counting as
  work asked of that target, so a target they were the whole of keeps its slot
  as a skip and a lone one throws.
- **A rack's return chains are the rack's, so a send that names none is the
  chain's.** `sends` (and the `sendGainDb`/`sendReturn` pair) on a chain or pad
  naming no return chain of its rack is that send's own
  `{return, ok: false, detail}` on the chain's entry, the return spelled the way
  the caller wrote it. update-track's own three — no mixer, no sends, no send
  for that return — are facts about the track rather than about the Live Set,
  and answer the same way. Which return _tracks_ exist is a fact about the Set,
  so it is resolved once for the call, but a send naming none is still that
  send's own `{return, ok: false, detail}` on every track the call named.
- **A type-addressed device path that names nothing reports once.** `t0/inst` on
  a track with no instrument substitutes a fallback index, and what the
  container does hold rides back on the resolution instead of a warning: the
  target's own report carries it
  (`nothing at path "t0/inst": t0 has no instrument`), whether that is an
  entry's `detail` or a single-target error. The fallback index lands one past
  the last device, so `delete` reads it as the empty place an out-of-range
  `d<n>` names: `nothing to delete`, and no `ok`.
- **Chains a device path makes on the way are reported, also when the call then
  fails.** create-device, update-device (`toPath`, `wrapInRack`) and a device
  copy's `toPath` resolve a destination through one resolver, which makes the
  chains a path names past the last one. A success reports them as
  `created: "c1-c2"` on the entry (the rack's, for `wrapInRack`). A failure
  after them — a refused insert or move, a browser load that fails, a path that
  then names no device, Live making only some of the chains — ends its reason
  with `; left 3 empty chains: c1-c3`, the chain a `c+` appended included, since
  the path names that chain only once it exists. A failed move or copy names
  them in its reason instead of `created`. A lone target throws that reason; in
  a list it is the target's skip `detail`, the way created scenes are named: no
  device landed, so `ok: false`. Chain and drum-pad copies make no chains
  through a path (they append their own copy), so they have nothing to name.
  Wrapping an instrument keeps its undo-then-throw, and the chains `toPath` made
  before it began stay in the error. An instrument wrap's `toPath` slot reads
  against the container as the call found it, though Live keeps an instrument
  ahead of audio effects, so the rack may land before them.
