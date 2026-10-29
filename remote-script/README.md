# Producer Pal Remote Script

An Ableton Live remote script that listens on **http://127.0.0.1:3349** (or the
next free port, see [Port](#port)). It does what Max for Live's LiveAPI can't:
list and load devices, plug-ins and presets, hotswap and copy devices, read and
write clip automation envelopes, convert audio clips to MIDI, read rack macro
mappings, read a CC Control's name and on/off state (Live before 12.4.15), set
Simpler pitch bend ranges, and step Live's undo history.

Producer Pal installs it with the rest of the setup and uses it from
`ppal-create-device`, `ppal-update-device`, `ppal-duplicate`, `ppal-read-clip`,
`ppal-update-clip` and `ppal-manage`. Without it, those calls fall back or say
what is missing (see [Routes](#routes)).

To open or create a Set with Producer Pal in it, use the
[`ableton-open-live-set`](../examples/skills/ableton-open-live-set/) skill's
`--add-producer-pal`, which calls this script.

## Install

Users install from the Chat UI's **Settings → Installation** tab. See
[the guide](https://producer-pal.org/guide/remote-script).

From a checkout:

```sh
npm run install:remote-script
```

Either way it replaces `<User Library>/Remote Scripts/Producer_Pal`. It uses
`ABLETON_USER_LIBRARY` from `.env` (see `.env.example`), or finds the User
Library Live is using. `npm run uninstall:remote-script` removes it and
`npm run install:status` shows what's installed. **Restart Live** (it only scans
Remote Scripts at startup), then pick **Producer Pal** under Settings → Tempo &
MIDI → Control Surface. Leave Input and Output as None.

`npm run install:remote-script -- --probe` also adds two dev-only routes:
`/probe`, which runs posted Python (see
[dev/live-api/python-remote-script-api/](../dev/live-api/python-remote-script-api/README.md)),
and `/reload`. See [Hot reload](#hot-reload).

The folder name must be a valid Python name: Live runs `import <folder>`, so a
space breaks it.

## Try it

```sh
curl -s localhost:3349/ping  # or the port in ~/.producer-pal/remote-script-port.txt

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

## Port

It tries 3349, then 3351 to 3358 (3350 is the MCP server's), and takes the first
free one: a second Live, or another program, may have 3349. A port counts as
taken if a bind fails or something already accepts connections on it (a program
on the wildcard address can sit beside a 127.0.0.1 bind). It writes the port it
got to `~/.producer-pal/remote-script-port.txt`, even when it's 3349, and leaves
the file on shutdown. If no port is free it logs that and doesn't serve.

Producer Pal uses 3349 when the remote script answers there, else the port in
the file, else 3349 (2.4.0 and earlier write no file). With two Lives, every
Producer Pal therefore talks to the one on 3349: it can't tell which Live it is
in. It only trusts a `/ping` that has `script_version`, so another program on a
port counts as "not running". It keeps the port it found until a call finds
nothing listening there, then looks again; a busy Live that is slow to answer a
ping doesn't lose it. `PPAL_REMOTE_SCRIPT_PORT` overrides all of it.

## Routes

`MIN_REMOTE_SCRIPT_VERSION`
(`src/mcp-server/rpc/remote-script/port/remote-script-version.ts`) is the oldest
script Producer Pal talks to; it treats an older one as out of date and sends it
nothing. `npm run version:bump:*` raises it to the new release whenever
`Producer_Pal/` changed since the last release tag.

Any request with an `Origin` or `Sec-Fetch-Site` header, or a `Host` other than
`127.0.0.1` or `localhost`, is refused with a 403, so a web page can't drive it.

Any request can pass `expires_in_ms`: if Live hasn't started it by then, it's
skipped with a 504 (a re-run is safe). Producer Pal sends one with every `/list`
and with every route whose result a caller waits on and that changes the Set
(`/load`, `/hotswap`, `/replace-producer-pal`, `/device/duplicate`,
`/clip/convert`, `/envelope/write`, `/envelope/clear`, `/device/simpler/write`,
`/undo/undo`, `/undo/redo`), a bit under the time it has left, so one deadline
covers the lookup and the load, and a change it stopped waiting for isn't made
later. `/undo/end` is fire-and-forget and sends none. A new route that changes
the Set must be sent one too. A job Live started but didn't finish in 30s is
also a 504, with `started: true`: Live may have made the change.

### `GET /ping`

Liveness, Live's version, and this script's (`script_version`, from
`version.py`, which the build stamps with the Producer Pal release). Also the
`port` it is listening on, `user_library` (the User Library the script runs
from; `null` for a dev checkout, absent from older scripts), and `source_hash`:
a hash of the implementation files when they were last loaded. See
[Hot reload](#hot-reload).

`script_build` is the build ID: the same hash over every top-level `.py` file,
bootstrap included, as Live loaded them. The device hashes its bundled copy the
same way, so it can tell two builds of one version apart and offer an update.
`script_commit` is the commit of the device that installed the script (from the
`BUILD_COMMIT` file the installer writes), for diagnostics only. Both are `null`
when unknown and absent from older scripts.

The other routes, by what they work on:

| Part                                                    | Routes                                                                                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [list-and-load-routes.md](docs/list-and-load-routes.md) | The `type` values; `GET /list`, `POST /load`                                                                                                       |
| [device-routes.md](docs/device-routes.md)               | `POST /hotswap`, `/replace-producer-pal`, `/device/duplicate`, `/device/macros`, `/device/basics`, `/device/simpler/read`, `/device/simpler/write` |
| [clip-routes.md](docs/clip-routes.md)                   | `POST /envelope/list`, `/envelope/read`, `/envelope/write`, `/envelope/clear`; `/clip/convert`                                                     |

### `POST /undo/end`

Closes Live's pending undo step and answers `{ok: true}`. Live merges every
change since the last step into one, so Producer Pal sends this after each write
tool call (without waiting for the answer) and one undo reverts one call. It
does nothing when no step is pending. Max for Live's LOM can't do this.

### `POST /undo/undo`, `POST /undo/redo`

Step Live's history back or forward with `song.undo()` and `song.redo()`.
`steps` (a whole number 1 to 50, default 1; anything else is a 400) takes
several, stopping early where history ends. Answers
`{done, can_undo, can_redo, stopped?}`, read after the last step; `stopped` says
why `done` is below `steps`. The history is Live's own, so it holds the user's
edits in Live as well as Producer Pal's. It's a 409 (`nothing to undo`,
`nothing to redo`) when Live says it can't, and nothing is called.

**It never removes Producer Pal.** Before each step it counts the top-level
devices that are or hold Producer Pal. A step that lowers the count (undoing the
step that inserted it) is reversed at once, in the same call, and the call stops
with `stopped` set. The device's server restarts as a new process, so that
answer usually never arrives. The trip is remembered on the bridge (so another
Set, which gets a new bridge, starts clear): the next step in the same direction
is a 409 that touches nothing, until `/undo/end` (Producer Pal wrote again) or a
step the other way clears it.

### `POST /watch`, `POST /unwatch`, `GET /events`, `GET /watches`

Live listeners on Session clips, for the experimental generative UI panel
(`ENABLE_GEN_UI`). `/watch` takes `owner` (a widget id), `path` (`t0/s3`) and
optionally `fingerprint` (`{name, length}`, from an earlier session). It binds
to the clip object in that slot and follows the object, not the slot: when the
clip moves (tracks or scenes inserted, deleted or reordered, or Live moves it)
the watch reports `moved` with the new path; when it is deleted or replaced it
reports `gone` once, with a `reason`, and stays gone. It never re-binds to
whatever lands in the slot later. Where a clip is comes from its parents (clip,
slot, track) and their indices.

Refused (`reason` in the body): `empty` (404, no clip there), `no_slot` (404),
`mismatch` (409, a `fingerprint` was sent and the clip there differs: this is
how a watch is picked up again after a restart without binding a wrong clip),
`limit` (409, at most 32 watches, gone ones included until unwatched).
`/unwatch` takes `owner`.

`/events?since=N` answers `{epoch, seq, resync, events, watching}`. Without
`since` it only gives the position. Events are
`{seq, owner, kind, fields, path?, reason?}` with `kind` `changed`, `moved` or
`gone`. Live's callbacks only mark a watch; each read checks every watch against
the Set and turns marks into one event per owner. The last 256 events are kept:
a reader further behind gets `resync: true` and no events, and must re-read
everything. A new `epoch` means the registry was reset (Set change, hot reload,
script restart): watches are gone, register again.

`/watches` lists every watch with its state, path, listener count and, for a
gone one, whether its old clip object has become valid again (observed only; it
is never re-bound). The Live log gets a line for each gone and each revival.

Every listener is removed when its watch ends or goes gone, the Set changes,
Live disconnects the script, or a hot reload starts. Poll rather than hold the
request open: a request in flight keeps the update loop sleeping, and the HTTP
threads only run while it does.

### `GET /ui-widgets`, `POST /ui-widgets/save`

Keep the generative UI's widget list in the Live Set, with the song's own data
store (`song.set_data` / `song.get_data`). `GET` answers `{text}`: the saved
string, or `null` when none. `POST` takes `text` (a string, at most 24,000
characters; longer is a 413) and answers `{ok: true}`. The list is saved in the
.als, adds no undo step and survives reopening. It does not mark the Set as
changed, so a widget-only change is lost if the user quits without saving.

## How it works

Live's Python is single-threaded and the Live API breaks if touched from any
other thread. So the HTTP server runs on its own thread and only queues jobs;
`update_display()`, which Live calls about 10x/sec on the main thread, drains
the queue and runs them. Live holds Python's lock between those calls, so while
a request is in flight `update_display()` keeps looping with short sleeps (at
most 20ms a call) to let the HTTP threads queue the next job; it doesn't sleep
when idle. Each connection carries one request, since a Set reload replaces the
script and a kept-alive connection would still reach the old one. With
`expires_in_ms`, the HTTP thread waits for Live to start the job until then (a
job still queued is skipped), and a started job gets its own 30s to finish, so
time queued behind other jobs doesn't count against it. Without it, the thread
waits 30s for the reply, and 30s more if the job started in that time.

- `http_server.py`: the HTTP server and the port file; never touches Live
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
- `device_basics.py`: a device's name and on/off state (CC Control)
- `conversions.py`: converting an audio clip to a new track
- `clip_address.py`: finding the clip a route names
- `simpler_settings.py`: a Simpler's pitch bend ranges
- `undo.py`: Live's undo history: closing the pending step, undo and redo
- `ui_widgets.py`: the generative UI's widget list, kept in the Set
- `preset_guard.py`: refusing a loaded preset that holds the Producer Pal device
- `version.py`: the release the script was built from

## Hot reload

Change the code and run it in Live without restarting:

```sh
npm run install:remote-script -- --probe --reload
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
- **Loads finish inside `load_item()`**, plug-ins and Max devices included, so
  the response already shows the new device. Checked on Live 12.4; hotswap on
  12.3 too.
- **`device_name` can't tell two same-named devices apart** if one shifts into
  the other's slot while the request queues. Python gives devices no stable
  identity, and the window is only the queue wait, so this is left as is.
- **Debugging**: `bridge.log()` writes to Live's `Log.txt`
  (`~/Library/Preferences/Ableton/Live x.x.x/` on macOS).
- **Developing**: see [Hot reload](#hot-reload). To test against the dev build
  of the Producer Pal device, open an e2e Set (`e2e/live-sets/`), which
  references the repo's device, rather than loading `Producer_Pal` from the
  browser, which finds whatever copy is in your library.
- **Tests**: `tests/` runs routes against fake Live objects, outside Live:
  `npm run remote-script:test`.
- **No need to walk the Sounds and Drums sections**: they're tag views, and
  every item in them is also in another section, so it loads by that path.
  `ppal-library` covers their categories from Live's database. Listing
  `app.browser.sounds` crashed Live 12.4.6 once with an internal assert, which
  couldn't be reproduced since.
