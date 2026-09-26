# Producer Pal Remote Script

An Ableton Live remote script that listens on **http://127.0.0.1:3349** and can
list and load Live devices, Max for Live devices, VST/VST3/AU plugins and
presets, and load a preset in place of a device already in the Set. Prototype.

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
Live** (it only scans Remote Scripts at startup), then pick **Producer_Pal**
under Settings → Tempo & MIDI → Control Surface. Leave Input and Output as None.

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
this script is installed in), a pack under Packs, or a Places folder.

## Routes

Any request with an `Origin` or `Sec-Fetch-Site` header, or a `Host` other than
`127.0.0.1` or `localhost`, is refused with a 403, so a web page can't drive it.

Any request can pass `expires_in_ms`: if Live hasn't started it by then, it's
skipped with a 504. Producer Pal sends one with every `/load` and `/hotswap`, a
bit under how long it waits, so a change it stopped waiting for isn't made
later.

### `GET /ping`

Liveness, Live's version, and this script's (`script_version`, from
`version.py`, which the build stamps with the Producer Pal release).

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

### `POST /envelope/list`, `/envelope/read`, `/envelope/write`, `/envelope/clear`

Clip automation envelopes, which Max for Live's LOM can't reach. **Session clips
only**: Live refuses envelope writes on Arrangement clips and reads them as
empty, so write in Session and duplicate to the Arrangement. That copies the
envelope into the track's automation lane, which stays after the clip is deleted
but can't be read back.

Common params: `track` (`t0`, `rt0`, `mt`), `slot` (0-based Session slot) or
`arrangement_index`, and a parameter: `parameter` = `volume`, `pan`, `send0`..
for the mixer, or `device` (`d0`, `d0/c1/d0` into rack chains) plus `parameter`
as an exact name or 0-based index.

| Route    | Params                                 | Returns                                                                                                                   |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `/list`  | clip                                   | every automated parameter on the clip with its event count                                                                |
| `/read`  | clip, parameter, `from`, `to`, `limit` | events in that beat range (default: all, even past the clip end): `time`, `value` (raw), `display` (Hz/dB), `display_str` |
| `/write` | clip, parameter, `points`              | replaces the whole envelope; `points` = `[{time, value, jump?}]`, raw values                                              |
| `/clear` | clip, optional parameter               | removes one envelope, or all of them                                                                                      |

Times are beats (quarter notes) from clip start. Values are raw `min..max` (most
device params are `0..1`); `display` is what Live shows. Each point ramps to the
next; a point with `jump: true` holds the previous value until its time, then
jumps (two events at one time, which is how Live stores a step). A quantized
parameter holds each value until the next anyway. Capped at 1000 events per read
or write.

## How it works

Live's Python is single-threaded and the Live API breaks if touched from any
other thread. So the HTTP server runs on its own thread and only queues jobs;
`update_display()`, which Live calls about 10x/sec on the main thread, drains
the queue and runs them. The HTTP thread waits up to 30s for the reply, or until
`expires_in_ms` if that's sooner. A job still queued by then is skipped; one
already running is waited for.

- `http_server.py`: the HTTP server; never touches Live
- `bridge.py`: the main-thread pump and the methods Live calls on a control
  surface
- `routes.py`: what each route does; main thread only
- `browser.py`: browser tree walking, name matching, and finding a file
- `hotswap.py`: walking a device path, and loading in place of a device
- `envelopes.py`: clip automation envelopes

## Notes

- **First plugin listing is slow**: Live scans the plugin folders. That's why
  the timeout is 30s.
- **Async load**: plugins and Max devices finish loading after `load_item()`
  returns, so the `devices` list in the response can lag.
- **Debugging**: `bridge.log()` writes to Live's `Log.txt`
  (`~/Library/Preferences/Ableton/Live x.x.x/` on macOS).
- **Developing**: code changes need a reinstall
  (`npm run remote-script:install`) and a Live restart. To test against the dev
  build of the Producer Pal device, open an e2e Set (`e2e/live-sets/`), which
  references the repo's device, rather than loading `Producer_Pal` from the
  browser, which finds whatever copy is in your library.
- **Tests**: `tests/` runs routes against fake Live objects, outside Live:
  `npm run remote-script:test`.
- **Stay out of the Sounds and Drums sections**: listing `app.browser.sounds`
  crashed Live 12.4.6 with an internal assert. The `type` param only reaches the
  sections above, and presets are found under their devices or by file.
