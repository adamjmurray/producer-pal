# Producer Pal Remote Script

An Ableton Live remote script that listens on **http://127.0.0.1:3349** and can
list and load Live devices, Max for Live devices and VST/VST3/AU plugins.
Prototype.

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
under Settings → Link, Tempo & MIDI → Control Surface. Leave Input and Output as
None.

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

**Devices, not presets**: the device types skip presets. Live nests a device's
presets under it, so browse down with `recursive=false` and load one by `path`.
Plugins aren't flagged as devices by Live, so `plugin` lists everything.

## Routes

Any request with an `Origin` or `Sec-Fetch-Site` header, or a `Host` other than
`127.0.0.1` or `localhost`, is refused with a 403, so a web page can't drive it.

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

A `path` that doesn't exist is a 404 listing what is there.

### `POST /load`

| Param         | Default   | Meaning                                        |
| ------------- | --------- | ---------------------------------------------- |
| `type`        | required  | See [Types](#types)                            |
| `name`        | —         | Name to search for (pass this or `path`)       |
| `path`        | —         | Exact path from `/list` (pass this or `name`)  |
| `track_index` | new track | 0-based index of an existing track             |
| `track_type`  | by kind   | `midi` or `audio`; only applies to a new track |

POST only, so a link or `<img>` tag can't load anything. Params work as query
string or JSON body; the body wins.

**One Producer Pal per Set**: loading `Producer_Pal` into a Set that already has
it is a 409 naming the track that has it. Only each track's top-level devices
are checked, so one inside a rack doesn't count.

**Name matching**: exact name wins, ignoring case and a `.amxd`/`.adg`/`.adv`
suffix. With no exact hit it falls back to substring. More than one hit is a 409
listing candidate paths — pass one back as `path`. A plugin installed in more
than one format shares its name across them, so expect this.

## How it works

Live's Python is single-threaded and the Live API breaks if touched from any
other thread. So the HTTP server runs on its own thread and only queues jobs;
`update_display()`, which Live calls about 10x/sec on the main thread, drains
the queue and runs them. The HTTP thread waits up to 30s for the reply.

- `http_server.py`: the HTTP server; never touches Live
- `bridge.py`: the main-thread pump and the methods Live calls on a control
  surface
- `routes.py`: what each route does; main thread only
- `browser.py`: browser tree walking and name matching

## Notes

- **First plugin listing is slow**: Live scans the plugin folders. That's why
  the timeout is 30s.
- **Async load**: plugins and Max devices finish loading after `load_item()`
  returns, so the `devices` list in the response can lag.
- **Debugging**: `bridge.log()` writes to Live's `Log.txt`
  (`~/Library/Preferences/Ableton/Live x.x.x/` on macOS).
- **Reloading**: code changes need a reinstall and a Live restart.
