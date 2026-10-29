# List and load routes

Part of the [remote script README](../README.md#routes).

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
hold the file, the load is refused with a 409 listing them. The file name must
match exactly: Live drops only a Max device's extension, so `Foo.amxd` is
matched against each item's `uri`, and `Foo.adv` never loads a Max device named
`Foo`.

## `GET /list`

| Param          | Default  | Meaning                                                                                                                          |
| -------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `type`         | required | See [Types](#types)                                                                                                              |
| `path`         | top      | Folder to start from, `/`-separated, case-insensitive                                                                            |
| `recursive`    | `true`   | `true`: loadable items at any depth. `false`: one level, folders included, with `loadable` and `has_children` flags              |
| `q`            | —        | Case-insensitive substring filter on the name                                                                                    |
| `presets`      | `false`  | With `recursive`: presets at any depth, including those under each device, instead of devices                                    |
| `plugins_only` | `false`  | With `type=plugin`: list plugins without their presets. The reply echoes `plugins_only: true`; an older script ignores the param |

A `path` that doesn't exist is a 404 listing what is there.

## `POST /load`

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

**A preset holding Producer Pal is a 409 too.** A rack preset, or one saved from
a Set, can hold the device inside. Name matching can't see that, so after the
load the script looks through what Live added (chains, return chains, drum
pads), deletes the devices that hold it, and answers 409 "nothing was loaded". A
track the request made is deleted as well. If the delete fails, the 409 says to
remove the new device by hand. It matches by device name, so a renamed Producer
Pal isn't caught.

**Hotswap mode is turned off first**: with it on (Live's own, from a device's
hotswap button), `load_item` replaces that device instead of adding one.

**Name matching**: exact name wins, ignoring case and a `.amxd`/`.adg`/`.adv`
suffix. With no exact hit it falls back to substring. More than one hit is a 409
listing candidate paths — pass one back as `path`. A plugin installed in more
than one format shares its name across them, so expect this.
