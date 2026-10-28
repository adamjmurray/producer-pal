# Device routes

Part of the [remote script README](../README.md#routes).

## `POST /hotswap`

Loads an item in place of a device already in the Set, the way Live's hotswap
button does. Takes `type` and `name` or `path` as `/load` does, plus:

| Param         | Default  | Meaning                                                                                   |
| ------------- | -------- | ----------------------------------------------------------------------------------------- |
| `device_path` | required | The device's Live path, e.g. `live_set tracks 0 devices 1 chains 0 devices 0`             |
| `device_name` | —        | The device's current name; a 409 if it's changed, since devices can shift while it queues |

Returns the device's name afterwards and whether Live `replaced` it.

- **A preset for the same device keeps it**: same object, parameters and
  automation. Anything else (another device, a rack, a plug-in) puts a new
  device in its place, and the old one's automation is gone.
- **Kinds must match.** Live silently loads nothing when they don't (a reverb
  preset onto an instrument), so a known mismatch is a 409 up front. A plug-in
  or file's kind isn't known, so an untouched device afterwards is a 409 too,
  unless it's already named after the preset: Live names a kept device after the
  preset it loads, so reloading the same one changes nothing visible. A
  mismatched preset with that same name then goes unnoticed.
- **A plug-in's own preset** (`.vstpreset`, `.fxp`, `.fxb`, `.aupreset`) filed
  under the device's plug-in counts as loaded: Live keeps the device and never
  renames it, so there's nothing to check. Onto another plug-in or a native
  device, Live replaces the device with the preset's plug-in.
- **Hotswap mode is turned off afterwards.** Left on, Live keeps filtering the
  browser to that device, and the next `/load` would replace it.
- **A preset holding Producer Pal is a 409** (see `/load`), and so is a target
  that is, or holds, the Producer Pal device (checked before loading). Live has
  already changed the device by the time the preset is found, so the script
  deletes the new one and **the slot is left empty**. The 409 says so, and that
  undoing the call brings the old device back, along with the rest of the call
  (the swap and the delete share an undo step), and has `changed: true`. If the
  delete fails, it says where the device is, still with `changed: true`.

## `POST /replace-producer-pal`

Swaps the Set's Producer Pal device for another build of itself, in place, the
way `/hotswap` does. The portal uses it to update a running device.

| Param  | Default  | Meaning                                        |
| ------ | -------- | ---------------------------------------------- |
| `path` | required | Absolute path of a `Producer_Pal.amxd` on disk |

Finds the device itself: the one Producer Pal device sitting directly on a
track, return track or the main track (racks aren't searched). Returns the
`track` (`path`, in the tools' vocabulary: `t2`, `rt0` or `mt`, and `name`) and
the new `device` name.

- **The old device's server dies with the swap** and the new one starts its own,
  usually within a second. The track, the device's position and its saved
  settings (the project context) stay.
- **The swap is closed as its own undo step,** as `/undo/end` would, since the
  server that would close it is gone. Undoing it puts the old build back.
- **Refused before anything changes** with a 409: the file isn't a Producer Pal
  device, the Set has none, or it has more than one. A file the browser can't
  find is a 404 (a file just written can take a few seconds to show up), and a
  missing `path` a 400.
- **A 500, or a 504 with `started`,** means Live may have swapped the device.

## `POST /device/duplicate`

Copies a device with Live's own `duplicate_device`, which Max for Live can't
call.

| Param         | Default  | Meaning                                                                                   |
| ------------- | -------- | ----------------------------------------------------------------------------------------- |
| `device_path` | required | The device's Live path, e.g. `live_set tracks 0 devices 1 chains 0 devices 0`             |
| `device_name` | —        | The device's current name; a 409 if it's changed, since devices can shift while it queues |

Returns the copy's `name` and `index`. Live puts it right after the original
(`index` is the original's plus one), keeping its name, parameter values and,
for a rack, its chains and macros. Works on tracks, rack chains and drum chains,
including return and main tracks.

- **Instruments are a 409**: Live raises `Can not duplicate instrument.` for an
  instrument, an instrument rack, a drum rack, and an instrument inside a chain.
  The client copies those another way.
- **The Producer Pal device is a 409**, as is a rack holding it. Live would copy
  it.
- Max for Live devices copy (about 170 ms; a native effect about 60 ms).
  Plug-ins haven't been tried.

## `POST /device/macros`

Which macros of a rack are mapped, which Max for Live's LOM can't say (it only
reports whether any are). Takes `device_paths`, a list of up to 200 Live device
paths (`live_set tracks 2 devices 0 chains 1 devices 0`), and answers
`{racks: [...]}`, one entry per path in order: `{mapped: [7]}` (macro numbers,
from 1, hidden macros included) or `{error}` when the path names nothing or a
device that isn't a rack. One bad path doesn't fail the rest. A missing or empty
list is a 400. Producer Pal asks in chunks of 200.

```sh
curl -s -X POST localhost:3349/device/macros -d '{"device_paths": ["live_set tracks 0 devices 0"]}'
```

Lowering a rack's macro count hides macros but keeps their mappings, so a hidden
macro can still be mapped.

## `POST /device/simpler/read`, `/device/simpler/write`

A Simpler's pitch bend ranges, which Max for Live's LOM doesn't have:
`pitch_bend_range` (semitones the pitch wheel bends, 0-24) and
`note_pitch_bend_range` (MPE per-note bend, 0-48). Both are whole numbers.

`/device/simpler/read` takes `device_paths` (up to 200, as for `/device/macros`)
and answers `{simplers: [...]}`, one entry per path in order:
`{pitch_bend_range, note_pitch_bend_range}`, or `{error}` when the path names
nothing or a device that isn't a Simpler. One bad path doesn't fail the rest.

`/device/simpler/write` takes one `device_path` and `pitch_bend_range`,
`note_pitch_bend_range` or both, and answers both values read back. Live clamps
an out-of-range write without saying so and raises on a float, so a value that
isn't a whole number in range, a call that sets neither, or a device that isn't
a Simpler is a 400 and nothing is written.

```sh
curl -s -X POST localhost:3349/device/simpler/write -d '{"device_path": "live_set tracks 0 devices 0", "pitch_bend_range": 12}'
```
