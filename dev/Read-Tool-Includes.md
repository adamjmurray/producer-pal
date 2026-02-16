# Read Tool Include System

The read tools (`ppal-read-live-set`, `ppal-read-track`, `ppal-read-scene`,
`ppal-read-clip`, `ppal-read-device`) use an `include` parameter to control what
data is returned. This keeps default responses small (saving context window
tokens) and lets callers request only the data they need.

## General Conventions

### Default behavior

- `include` defaults to `[]` for `ppal-read-track`, `ppal-read-clip`,
  `ppal-read-scene`, and `ppal-read-device`. `ppal-read-live-set` has a
  non-empty default that includes commonly-needed data (see its section below).

### Tool description

The first line of the tool description is the title/summary. The second line
should say:

```
Returns overview by default. Use include to add detail.
```

### Enum ordering

In the `.def.ts` schema, the `"*"` wildcard must always be **last** in the enum
array. Other options are listed alphabetically or in logical groupings.

### Include parameter description

The `include` parameter's `.describe()` lists available options as a compact
comma-separated list, ending with `"*" for all`. Example:

```
'data: sample, timing, clip-notes, color, warp, "*" for all'
```

### Wildcard `"*"`

Expands to all available include options for that tool type. Useful for
debugging, but should be avoided in production for large Live Sets.

### Include propagation

"Parent" tools (`ppal-read-live-set`, `ppal-read-track`, `ppal-read-scene`) pass
their full `include` array through to `readClip()`. Only clip-recognized
includes affect clip output — parent-level includes like `"instruments"` are
ignored by `readClip()`.

### Implementation

All include parsing is centralized in
`src/tools/shared/tool-framework/include-params.ts`:

- `parseIncludeArray(include, defaults)` — returns an `IncludeFlags` object with
  boolean flags
- `expandWildcardIncludes()` — expands `"*"` and shortcut options
- `READ_CLIP_DEFAULTS`, `READ_TRACK_DEFAULTS`, etc. — default flag values per
  tool type
- `IncludeFlags` interface — all possible boolean flags
- `FLAG_TO_OPTION` — maps flag names to option strings (used by
  `includeArrayFromFlags()`)

Each tool's `.def.ts` defines the available enum values. The handler
destructures the flags it needs from `parseIncludeArray()`.

## ppal-read-live-set

Default include: `["regular-tracks"]`

Returns the Live Set overview with regular track names and basic info. Key
includes:

- `regular-tracks`, `return-tracks`, `master-track`, `all-tracks` — which tracks
  to include
- `instruments`, `midi-effects`, `audio-effects`, `all-devices` — device info on
  tracks
- `drum-maps` — pitch-to-name mappings for drum racks
- `session-clips`, `arrangement-clips`, `all-clips` — clip info on tracks
- `clip-notes`, `sample`, `timing`, `warp`, `color` — propagated to clip reading
- `routings`, `scenes`, `mixer`, `locators` — additional set-level data

Device-structural includes (`chains`, `return-chains`, `drum-pads`) are not
available at this level. Use `ppal-read-device` for chain/drum-pad detail.

## ppal-read-track

Default include: `[]`

Returns minimal track overview by default (`id`, `name`, `type`, `trackIndex`,
`category`). Use `include` to add detail. Key includes:

- `session-clips`, `arrangement-clips` — which clips to include
- `devices` — flat device list in track signal-chain order
- `drum-maps` — pitch-to-name mappings for drum racks
- `routings`, `available-routings` — routing info
- `clip-notes`, `sample`, `timing`, `color`, `mixer` — detail data

Device-structural includes (`chains`, `return-chains`, `drum-pads`) are not
available at this level. Use `ppal-read-device` for chain/drum-pad detail.

## ppal-read-scene

Default include: `[]`

Returns scene overview by default. Use `include` to add detail.

### Default response (no includes)

| Field           | Type     | Description                                          |
| --------------- | -------- | ---------------------------------------------------- |
| `id`            | `string` | Scene ID                                             |
| `name`          | `string` | Scene name with 1-based number (e.g., `"Intro (1)"`) |
| `sceneIndex`    | `number` | 0-based scene index                                  |
| `clipCount`     | `number` | Number of non-empty clips in the scene               |
| `tempo`         | `number` | Only present when scene tempo is enabled             |
| `timeSignature` | `string` | Only present when scene time sig is enabled          |
| `triggered`     | `true`   | Only present when scene is triggered                 |

### Include: `"clips"`

Replaces `clipCount` with full clip details for all non-empty clips in the
scene. Each clip is read via `readClip()`.

| Field   | Type     | Description                               |
| ------- | -------- | ----------------------------------------- |
| `clips` | `Clip[]` | Non-empty clips across all regular tracks |

### Include: `"clip-notes"`, `"sample"`, `"timing"`, `"color"`

Propagated to `readClip()` for each clip in the scene. See ppal-read-clip
section for details on these includes.

## ppal-read-clip

### Default response (no includes)

Always returned for any clip:

| Field              | Type                         | Description                       |
| ------------------ | ---------------------------- | --------------------------------- |
| `id`               | `string`                     | Clip ID                           |
| `type`             | `"midi" \| "audio"`          | Clip type                         |
| `name`             | `string`                     | Clip name (omitted if empty)      |
| `view`             | `"session" \| "arrangement"` | Which view the clip is in         |
| `trackIndex`       | `number`                     | 0-based track index               |
| `sceneIndex`       | `number`                     | Session only: 0-based scene index |
| `arrangementStart` | `string` (bar\|beat)         | Arrangement only: start position  |
| `playing`          | `true`                       | Only present when true            |
| `triggered`        | `true`                       | Only present when true            |
| `recording`        | `true`                       | Only present when true            |
| `overdubbing`      | `true`                       | Only present when true            |
| `muted`            | `true`                       | Only present when true            |

Boolean state fields (`playing`, `triggered`, `recording`, `overdubbing`,
`muted`) are omitted when `false` to reduce response size.

### Include: `"timing"`

Adds timing/loop information. For arrangement clips, also adds
`arrangementLength`.

| Field               | Type      | Description                                          |
| ------------------- | --------- | ---------------------------------------------------- |
| `timeSignature`     | `string`  | e.g., `"4/4"`, `"6/8"`                               |
| `looping`           | `boolean` | Whether looping is enabled                           |
| `start`             | `string`  | Active start position (bar\|beat)                    |
| `end`               | `string`  | Active end position (bar\|beat)                      |
| `length`            | `string`  | Active length (bar:beat duration)                    |
| `firstStart`        | `string`  | Start marker position, only if different from active |
| `arrangementLength` | `string`  | Arrangement clips only: total length                 |

When looping is enabled, `start`/`end` reflect loop bounds. When disabled, they
reflect the start/end markers. `firstStart` appears only when the start marker
differs from the active start (e.g., loop start has been moved).

### Include: `"clip-notes"`

Adds formatted MIDI notes for MIDI clips. No effect on audio clips.

| Field   | Type     | Description                  |
| ------- | -------- | ---------------------------- |
| `notes` | `string` | Formatted bar\|beat notation |

The notes string uses compact bar|beat notation. This is an expensive operation
(calls `get_notes_extended` on the Live API).

### Include: `"sample"`

Adds base audio properties for audio clips. No effect on MIDI clips.

| Field        | Type     | Description                         |
| ------------ | -------- | ----------------------------------- |
| `gainDb`     | `number` | Gain in dB (0 = unity, -70 = min)   |
| `pitchShift` | `number` | Pitch shift in semitones            |
| `sampleFile` | `string` | Full file path (omitted if no file) |

### Include: `"warp"`

Adds warp/time-stretch properties for audio clips. No effect on MIDI clips.

| Field          | Type           | Description                         |
| -------------- | -------------- | ----------------------------------- |
| `sampleLength` | `number`       | Sample length in samples            |
| `sampleRate`   | `number`       | Sample rate in Hz                   |
| `warping`      | `boolean`      | Whether warping is enabled          |
| `warpMode`     | `string`       | Warp algorithm (beats, tones, etc.) |
| `warpMarkers`  | `WarpMarker[]` | Warp markers (if any exist)         |

### Include: `"color"`

| Field   | Type     | Description                       |
| ------- | -------- | --------------------------------- |
| `color` | `string` | CSS hex color (e.g., `"#3DC300"`) |

### Examples

TODO: Double check the example results for accuracy

**Minimal read (overview only):**

```json
{ "trackIndex": 0, "sceneIndex": 0 }
```

Result:

```json
{
  "id": "2",
  "type": "midi",
  "name": "Drums",
  "view": "session",
  "trackIndex": 0,
  "sceneIndex": 0,
  "playing": true
}
```

**Read MIDI clip with notes and timing:**

```json
{ "trackIndex": 0, "sceneIndex": 0, "include": ["timing", "clip-notes"] }
```

Result:

```json
{
  "id": "2",
  "type": "midi",
  "name": "Drums",
  "view": "session",
  "trackIndex": 0,
  "sceneIndex": 0,
  "timeSignature": "4/4",
  "looping": true,
  "start": "1|1",
  "end": "5|1",
  "length": "4:0",
  "notes": "1|1 C1 1:0\n2|1 D1 1:0\n3|1 E1 0:2\n3|3 E1 0:2"
}
```

**Read audio clip with all audio details:**

```json
{ "trackIndex": 1, "sceneIndex": 0, "include": ["sample", "warp"] }
```

Result:

```json
{
  "id": "5",
  "type": "audio",
  "name": "Guitar Loop",
  "view": "session",
  "trackIndex": 1,
  "sceneIndex": 0,
  "gainDb": 0,
  "sampleFile": "/Users/user/Samples/guitar-loop.wav",
  "pitchShift": 0,
  "sampleLength": 441000,
  "sampleRate": 44100,
  "warping": true,
  "warpMode": "beats",
  "warpMarkers": [
    { "sampleTime": 0, "beatTime": 0 },
    { "sampleTime": 10, "beatTime": 40 }
  ]
}
```

**Read everything:**

```json
{ "trackIndex": 0, "sceneIndex": 0, "include": ["*"] }
```

MIDI clip result:

```json
{
  "id": "2",
  "type": "midi",
  "name": "Drums",
  "view": "session",
  "trackIndex": 0,
  "sceneIndex": 0,
  "color": "#3DC300",
  "timeSignature": "4/4",
  "looping": true,
  "start": "1|1",
  "end": "5|1",
  "length": "4:0",
  "notes": "1|1 C1 1:0\n2|1 D1 1:0\n3|1 E1 0:2\n3|3 E1 0:2"
}
```

Audio clip result:

```json
{
  "id": "5",
  "type": "audio",
  "name": "Guitar Loop",
  "view": "session",
  "trackIndex": 1,
  "sceneIndex": 0,
  "color": "#FF6B00",
  "gainDb": 0,
  "sampleFile": "/Users/user/Samples/guitar-loop.wav",
  "pitchShift": 0,
  "timeSignature": "4/4",
  "looping": true,
  "start": "1|1",
  "end": "9|1",
  "length": "8:0",
  "sampleLength": 441000,
  "sampleRate": 44100,
  "warping": true,
  "warpMode": "beats",
  "warpMarkers": [
    { "sampleTime": 0, "beatTime": 0 },
    { "sampleTime": 10, "beatTime": 40 }
  ]
}
```

## ppal-read-device

Default include: `[]`

Uses inline include parsing (not the shared `parseIncludeArray` framework)
because its includes are unique (`params`, `param-values`, `drum-map`,
`sample`).

### Default response (no includes)

| Field         | Type     | Description                                   |
| ------------- | -------- | --------------------------------------------- |
| `id`          | `string` | Device ID                                     |
| `path`        | `string` | Short path (e.g., `t0/d0`)                    |
| `type`        | `string` | Device type, with class name if not redundant |
| `name`        | `string` | Display name (omitted if same as class name)  |
| `deactivated` | `true`   | Only present when device is inactive          |

### Include: `"chains"`

Adds chain list for rack devices. Depth-controlled by `maxDepth` arg.

At `maxDepth: 0` (default), each chain shows `deviceCount` instead of expanded
devices. At `maxDepth: 1+`, devices are expanded recursively.

| Field    | Type      | Description                               |
| -------- | --------- | ----------------------------------------- |
| `chains` | `Chain[]` | Chain objects with devices or deviceCount |

### Include: `"return-chains"`

Same as `chains` but for rack return chains. Same depth behavior.

| Field          | Type      | Description          |
| -------------- | --------- | -------------------- |
| `returnChains` | `Chain[]` | Return chain objects |

### Include: `"drum-pads"`

Adds drum pad list for drum rack devices. Same depth behavior as `chains`.

| Field      | Type        | Description                              |
| ---------- | ----------- | ---------------------------------------- |
| `drumPads` | `DrumPad[]` | Drum pads with note, pitch, name, chains |

### Include: `"drum-map"`

Adds flat pitch-to-name mapping for drum rack devices. Internally forces chain
processing at `maxDepth >= 1` to detect instruments, then strips the chain data
from the output.

| Field     | Type                    | Description                         |
| --------- | ----------------------- | ----------------------------------- |
| `drumMap` | `Record<string,string>` | Pitch name to drum pad name mapping |

### Include: `"params"`

Adds parameter names, macro variation info, and A/B Compare state.

| Field        | Type       | Description                                |
| ------------ | ---------- | ------------------------------------------ |
| `parameters` | `Param[]`  | Parameter names and IDs                    |
| `variations` | `object`   | Rack only: `{ count, selected }`           |
| `macros`     | `object`   | Rack only: `{ count, hasMappings }`        |
| `abCompare`  | `"a"\|"b"` | Current A/B preset (if device supports it) |

### Include: `"param-values"`

Superset of `params` — includes full parameter details (value, min, max, state,
display value, value items for quantized params).

### Include: `"sample"`

Adds Simpler sample info. No effect on non-Simpler devices.

| Field         | Type     | Description                              |
| ------------- | -------- | ---------------------------------------- |
| `sample`      | `string` | File path (omitted if no sample loaded)  |
| `multisample` | `true`   | Only present for multisample instruments |
| `gainDb`      | `number` | Gain in dB                               |

### `maxDepth` arg

Controls device tree expansion for `chains`, `return-chains`, and `drum-pads`:

- `0` (default): Chains show `deviceCount` only (no device expansion)
- `1`: Direct devices expanded, nested rack chains show `deviceCount`
- `2+`: Deeper recursive expansion
