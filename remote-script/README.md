# Producer Pal Remote Script

An Ableton Live remote script that listens on **http://127.0.0.1:3349** and can
list and load Live devices, Max for Live devices, VST/VST3/AU plugins and
presets, load a preset in place of a device already in the Set, and copy a
device. Prototype.

Producer Pal's `ppal-create-device` uses it to load plug-ins, Max for Live
devices and presets, `ppal-update-device` to swap a preset onto a device, and
`ppal-duplicate` to copy a device. Without it, only native Live devices load,
and device copies are slower (they go through a temp track). The model finds
plug-ins with `ppal-library`'s `list-plugins` action, and Max devices by
searching with `kind: m4l-device`.

To open or create a Set with Producer Pal in it, use the
[`ableton-open-live-set`](../examples/skills/ableton-open-live-set/) skill's
`--add-producer-pal`, which calls this script.

## Install

Users install from the Chat UI's **Settings → Remote Script** tab. See
[the guide](https://producer-pal.org/guide/remote-script).

From a checkout, set `ABLETON_USER_LIBRARY` in `.env` (see `.env.example`),
then:

```sh
npm run remote-script:install
```

Either way it replaces `<User Library>/Remote Scripts/Producer_Pal`. **Restart
Live** (it only scans Remote Scripts at startup), then pick **Producer Pal**
under Settings → Tempo & MIDI → Control Surface. Leave Input and Output as None.

`npm run remote-script:install -- --probe` also adds two dev-only routes:
`/probe`, which runs posted Python (see
[dev/live-api/python-remote-script-api/](../dev/live-api/python-remote-script-api/README.md)),
and `/reload`. See [Hot reload](#hot-reload).

The folder name must be a valid Python name: Live runs `import <folder>`, so a
space breaks it.

## Try it

```sh
curl -s localhost:3349/ping

# list everything loadable, at any depth
curl -s "localhost:3349/list?type=mfl-device"
curl -s "localhost:3349/list?type=audio-effect"
curl -s "localhost:3349/list?type=plugin&q=pro-q"

# drill down one level at a time
curl -s "localhost:3349/list?type=plugin&recursive=false"
curl -s "localhost:3349/list?type=plugin&path=VST3&recursive=false"

# load by name, onto a new track of the right type
curl -s -X POST localhost:3349/load -d '{"type": "mfl-device", "name": "Producer_Pal"}'
curl -s -X POST localhost:3349/load -d '{"type": "instrument", "name": "DS Kick"}'
curl -s -X POST localhost:3349/load -d '{"type": "plugin", "name": "Pro-Q 4", "track_type": "audio"}'

# load by path when a name is ambiguous, onto an existing track
curl -s -X POST localhost:3349/load -d '{"type": "plugin", "path": "VST3/FabFilter/Pro-Q 4", "track_index": 2}'

# presets: list a device's, load one, or load a preset file
curl -s "localhost:3349/list?type=instrument&path=Wavetable&presets=true&q=bass"
curl -s -X POST localhost:3349/load -d '{"type": "instrument", "path": "Wavetable/Bass/Abdominal Bass.adv"}'
curl -s -X POST localhost:3349/load -d '{"type": "file", "path": "/path/to/Factory Packs/Drum Essentials/Drums/Hybrid/24_7 Kit.adg"}'

# load a preset in place of the first device on track 3
curl -s -X POST localhost:3349/hotswap -d '{"type": "instrument", "path": "Drift/Bass/AG Bass.adv", "device_path": "live_set tracks 3 devices 0"}'

# copy the second device on track 1 (the copy lands right after it)
curl -s -X POST localhost:3349/device/duplicate -d '{"device_path": "live_set tracks 1 devices 1"}'
```

## Types

| `type`         | Live browser section | Lists                 | Kind                                    |
| -------------- | -------------------- | --------------------- | --------------------------------------- |
| `mfl-device`   | Max for Live         | devices               | from the top folder (`Max MIDI Effect`) |
| `audio-effect` | Audio Effects        | devices               | the type                                |
| `instrument`   | Instruments          | devices               | the type                                |
| `midi-effect`  | MIDI Effects         | devices               | the type                                |
| `plugin`       | Plug-Ins             | every loadable plugin | unknown                                 |

**A new track's type follows the kind**: instruments and MIDI effects get a MIDI
track, audio effects an audio track. Unknown kinds get MIDI, because Live
refuses an instrument on an audio track and makes a track of its own instead,
leaving ours empty. `/load` returns the `kind` it used (`null` when unknown).

**Plugins are always unknown**: the browser doesn't say whether a plugin is an
instrument or an effect. Live's plugin database does, for VST3, so the client
should look it up and pass `track_type: audio` for effects. Live hosts no
MIDI-effect plugins.

**Where Max for Live devices show up**: the Max for Live section only holds
loose `.amxd` files (e.g. your User Library) and the blank Max templates. Live's
built-in Max devices (LFO, Shaper, DS Kick...) and pack devices (CV Tools,
Softube...) are listed under Audio Effects, Instruments or MIDI Effects, and the
browser gives no way to tell them apart from native devices.

**Devices, not presets**: the device types skip presets unless you pass
`presets=true`. Live nests a device's presets (`.adv`, and `.adg` racks built
around it) under it, so list them with `path=<device>&presets=true`, or browse
down with `recursive=false`, and load one by `path`. Plugins aren't flagged as
devices by Live, so `plugin` lists everything.

**Presets filed elsewhere** (a pack's drum kits, say) aren't under any device.
Load those by file: `type: file` with the absolute `path`. The script walks that
path down whichever browser tree mirrors its folder: the User Library (the one
this script is installed in), a Places folder, or a pack under Packs. The User
Library and Places folders are matched by their real location. Live doesn't say
where a pack is on disk, so packs are matched by name. If several packs could
hold the file, the load is refused with a 409 listing them.

## Routes

Any request with an `Origin` or `Sec-Fetch-Site` header, or a `Host` other than
`127.0.0.1` or `localhost`, is refused with a 403, so a web page can't drive it.

Any request can pass `expires_in_ms`: if Live hasn't started it by then, it's
skipped with a 504 (a re-run is safe). Producer Pal sends one with every
`/list`, `/load`, `/hotswap` and `/device/duplicate` of a device call, a bit
under the time it has left, so one deadline covers the lookup and the load, and
a change it stopped waiting for isn't made later. A job Live started but didn't
finish in 30s is also a 504, with `started: true`: Live may have made the
change.

### `GET /ping`

Liveness, Live's version, and this script's (`script_version`, from
`version.py`, which the build stamps with the Producer Pal release). Also
`source_hash`: a hash of the implementation files when they were last loaded.
See [Hot reload](#hot-reload).

### `GET /list`

| Param       | Default  | Meaning                                                                                                             |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `type`      | required | See [Types](#types)                                                                                                 |
| `path`      | top      | Folder to start from, `/`-separated, case-insensitive                                                               |
| `recursive` | `true`   | `true`: loadable items at any depth. `false`: one level, folders included, with `loadable` and `has_children` flags |
| `q`         | —        | Case-insensitive substring filter on the name                                                                       |
| `presets`   | `false`  | With `recursive`: presets at any depth, including those under each device, instead of devices                       |

A `path` that doesn't exist is a 404 listing what is there.

### `POST /load`

| Param         | Default   | Meaning                                                  |
| ------------- | --------- | -------------------------------------------------------- |
| `type`        | required  | See [Types](#types), or `file`                           |
| `name`        | —         | Name to search for (pass this or `path`)                 |
| `path`        | —         | Exact path from `/list`, or a `file`'s absolute path     |
| `track_index` | new track | 0-based index of an existing track                       |
| `track_name`  | —         | Exact name of an existing track; wins over `track_index` |
| `track_type`  | by kind   | `midi` or `audio`; only applies to a new track           |

POST only, so a link or `<img>` tag can't load anything. Params work as query
string or JSON body; the body wins.

**`track_name` must match exactly one track**, or it's a 409. Tracks can shift
while a load waits in the queue, so a client that made its own track should pass
its (unique) name rather than an index.

**One Producer Pal per Set**: loading `Producer_Pal` into a Set that already has
it is a 409 naming the track that has it. Only each track's top-level devices
are checked, so one inside a rack doesn't count.

**Hotswap mode is turned off first**: with it on (Live's own, from a device's
hotswap button), `load_item` replaces that device instead of adding one.

**Name matching**: exact name wins, ignoring case and a `.amxd`/`.adg`/`.adv`
suffix. With no exact hit it falls back to substring. More than one hit is a 409
listing candidate paths — pass one back as `path`. A plugin installed in more
than one format shares its name across them, so expect this.

### `POST /hotswap`

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
- **Hotswap mode is turned off afterwards.** Left on, Live keeps filtering the
  browser to that device, and the next `/load` would replace it.

### `POST /device/duplicate`

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

### `POST /envelope/list`, `/envelope/read`, `/envelope/write`, `/envelope/clear`

Clip automation envelopes, which Max for Live's LOM can't reach. **Session clips
only**: Live refuses envelope writes on Arrangement clips and reads them as
empty, so write in Session and duplicate to the Arrangement. That copies the
envelope into the track's automation lane, which stays after the clip is deleted
but can't be read back.

Only automation on track and device parameters is reachable. Modulation,
clip-level (Gain...) and MIDI CC envelopes are invisible to every route and
`/clear` leaves them. An unwarped audio clip can't have envelopes in Live: the
API still writes one, but it never plays. See
[dev/live-api/clip-envelopes.md](../dev/live-api/clip-envelopes.md).

Common params: `track` (`t0`, `t1`.. a regular track; return and master tracks
have no clips), `slot` (0-based Session slot) or `arrangement_index`, and a
parameter: `parameter` = `volume`, `pan`, `send0`.. for the mixer, or `device`
(`d0`, `d0/c1/d0` into rack chains) plus `parameter` as an exact name or 0-based
index.

| Route    | Params                                 | Returns                                                                                                                                                  |
| -------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/list`  | clip                                   | every automated parameter on the clip with its event count                                                                                               |
| `/read`  | clip, parameter, `from`, `to`, `limit` | events in that beat range (default: all, even past the clip end): `time`, `value` (raw), `display` (Live's units: linear gain for dB, Hz), `display_str` |
| `/write` | clip, parameter, `points`              | replaces the whole envelope; `points` = `[{time, value, jump?}]`, raw values                                                                             |
| `/clear` | clip, optional parameter               | removes one envelope, or every one it can reach; see below                                                                                               |

`/clear` answers `{cleared}` for one parameter: whether it had an envelope. With
no parameter it answers `{cleared, all: true, remaining}`: `cleared` is whether
any automation it can see was removed, and `remaining` is whether the clip still
holds envelopes afterwards (modulation, clip-level or MIDI CC, which it can't
remove).

Times are beats (quarter notes) from clip start. Values are raw `min..max` (most
device params are `0..1`); `display_str` is what Live shows. Each point ramps to
the next; a point with `jump: true` holds the previous value until its time,
then jumps (two events at one time, which is how Live stores a step). A
quantized parameter holds each value until the next anyway. A read returns at
most 1000 events (`limit`, a positive whole number); a write takes at most 1000
points. Indexes must be whole numbers >= 0.

### `POST /device/macros`

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

## How it works

Live's Python is single-threaded and the Live API breaks if touched from any
other thread. So the HTTP server runs on its own thread and only queues jobs;
`update_display()`, which Live calls about 10x/sec on the main thread, drains
the queue and runs them. With `expires_in_ms`, the HTTP thread waits for Live to
start the job until then (a job still queued is skipped), and a started job gets
its own 30s to finish, so time queued behind other jobs doesn't count against
it. Without it, the thread waits 30s for the reply, and 30s more if the job
started in that time.

- `http_server.py`: the HTTP server; never touches Live
- `bridge.py`: the main-thread pump and the methods Live calls on a control
  surface
- `errors.py`: `RouteError`, a route's own HTTP status and body
- `hot_reload.py`: the dev-only reload and the source hash
- `routes.py`: what each route does; main thread only
- `params.py`: reading request params
- `browser.py`: browser tree walking, name matching, and finding a file
- `hotswap.py`: walking a device path, and loading in place of a device
- `device_copy.py`: copying a device
- `producer_pal_device.py`: recognizing the Producer Pal device
- `envelopes.py`: clip automation envelopes
- `rack_macros.py`: which rack macros are mapped

## Hot reload

Change the code and run it in Live without restarting:

```sh
npm run remote-script:install -- --probe --reload
```

It reinstalls, reloads the code in Live, and checks Live loaded what was
installed. `--reload` needs `--probe`, which adds the dev-only `/reload` route.

Every top-level `.py` file reloads except the bootstrap: `__init__.py`,
`bridge.py`, `errors.py`, `hot_reload.py` and `http_server.py`. If a module
fails to load, all of them are put back, the old code keeps running, and the
reply has the traceback.

Still needs a Live restart:

- The first install with `--probe`: the running script has no `/reload` yet.
- A change to a bootstrap file.
- Code in a subfolder.

To check what's running, `/ping` returns `source_hash`, a hash of the reloadable
files as last loaded. `/reload` returns the same `hash`.

## Notes

- **First plugin listing is slow**: Live scans the plugin folders. That's why a
  running job gets 30s.
- **Async load**: plugins and Max devices finish loading after `load_item()`
  returns, so the `devices` list in the response can lag.
- **Debugging**: `bridge.log()` writes to Live's `Log.txt`
  (`~/Library/Preferences/Ableton/Live x.x.x/` on macOS).
- **Developing**: see [Hot reload](#hot-reload). To test against the dev build
  of the Producer Pal device, open an e2e Set (`e2e/live-sets/`), which
  references the repo's device, rather than loading `Producer_Pal` from the
  browser, which finds whatever copy is in your library.
- **Tests**: `tests/` runs routes against fake Live objects, outside Live:
  `npm run remote-script:test`.
- **Stay out of the Sounds and Drums sections**: listing `app.browser.sounds`
  crashed Live 12.4.6 with an internal assert. The `type` param only reaches the
  sections above, and presets are found under their devices or by file.
