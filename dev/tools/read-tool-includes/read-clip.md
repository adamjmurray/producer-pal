# ppal-read-clip

The `ppal-read-clip` include options, response fields, and example results.
General conventions are in [README.md](README.md).

## Default response (no includes)

Always returned for any clip:

| Field               | Type                         | Description                                                                                     |
| ------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `id`                | `string`                     | Clip ID                                                                                         |
| `type`              | `"midi" \| "audio"`          | Clip type                                                                                       |
| `name`              | `string`                     | Clip name (omitted if empty)                                                                    |
| `view`              | `"session" \| "arrangement"` | Which view the clip is in                                                                       |
| `path`              | `string`                     | Where the clip is: `"t0/s3"` in the session, `"t0[5\|1]"` or `"t0/l1[5\|1]"` in the arrangement |
| `arrangementLength` | `string`                     | Arrangement clips only: how far the clip runs (`4bar`, `n/4`, `1bar+n/4`), in song meter        |
| `playing`           | `true`                       | Only present when true                                                                          |
| `triggered`         | `true`                       | Only present when true                                                                          |
| `recording`         | `true`                       | Only present when true                                                                          |
| `overdubbing`       | `true`                       | Only present when true                                                                          |
| `muted`             | `true`                       | Only present when true                                                                          |

Boolean state fields (`playing`, `triggered`, `recording`, `overdubbing`,
`muted`) are omitted when `false` to reduce response size.

## Include: `"timing"`

Adds timing/loop information.

| Field           | Type      | Description                                          |
| --------------- | --------- | ---------------------------------------------------- |
| `timeSignature` | `string`  | e.g., `"4/4"`, `"6/8"`                               |
| `looping`       | `boolean` | Whether looping is enabled                           |
| `start`         | `string`  | Active start position (bar\|beat)                    |
| `end`           | `string`  | Active end position (bar\|beat)                      |
| `length`        | `string`  | Active length (`4bar`, `n/4`, or `1bar+n/4`)         |
| `firstStart`    | `string`  | Start marker position, only if different from active |

When looping is enabled, `start`/`end` reflect loop bounds. When disabled, they
reflect the start/end markers. `firstStart` appears only when the start marker
differs from the active start (e.g., loop start has been moved).

## Include: `"notes"`

Adds formatted MIDI notes for MIDI clips. No effect on audio clips.

| Field   | Type     | Description                  |
| ------- | -------- | ---------------------------- |
| `notes` | `string` | Formatted bar\|beat notation |

The notes string uses compact bar|beat notation. This is an expensive operation
(calls `get_notes_extended` on the Live API).

All authored notes round-trip on read, including ones outside the clip's
playable region: pickups before the start (negative time, e.g. a note authored
as `1|1-n/12`) and overhang past the end. The read window spans one clip-length
of margin on each side of the playable region `[0, length]` (i.e.
`[-length, 2*length]`), so out-of-bounds notes are not silently dropped. (The
`noteCount` reported by create/update tools mirrors this same
`[-length, 2*length]` read window: it counts stored pickup and overhang notes
within that finite scan, not only notes in the playable region.)

## Include: `"sample"`

Adds base audio properties for audio clips. No effect on MIDI clips.

| Field        | Type     | Description                               |
| ------------ | -------- | ----------------------------------------- |
| `gainDb`     | `number` | Gain in dB (omitted when 0 / unity)       |
| `pitchShift` | `number` | Pitch shift in semitones (omitted when 0) |
| `sampleFile` | `string` | Full file path (omitted if no file)       |

## Include: `"warp"`

Adds warp/time-stretch properties for audio clips. No effect on MIDI clips.

| Field          | Type           | Description                         |
| -------------- | -------------- | ----------------------------------- |
| `sampleLength` | `number`       | Sample length in samples            |
| `sampleRate`   | `number`       | Sample rate in Hz                   |
| `warping`      | `boolean`      | Whether warping is enabled          |
| `warpMode`     | `string`       | Warp algorithm (beats, tones, etc.) |
| `warpMarkers`  | `WarpMarker[]` | Warp markers (if any exist)         |

`warpMarkers` is work-in-progress and gated behind the `ENABLE_WARP_MARKERS`
build flag: it appears in `npm run build:debug` builds (and in tests) only, not
in release builds. The examples below show it as it appears in a debug build.

## Include: `"color"`

| Field   | Type     | Description                       |
| ------- | -------- | --------------------------------- |
| `color` | `string` | CSS hex color (e.g., `"#3DC300"`) |

## Examples

**Minimal read (overview only):**

```json
{ "path": "t0/s0" }
```

Result:

```json
{
  "id": "2",
  "type": "midi",
  "name": "Drums",
  "view": "session",
  "path": "t0/s0",
  "playing": true
}
```

**Read MIDI clip with notes and timing:**

```json
{ "path": "t0/s0", "include": ["timing", "notes"] }
```

Result:

```json
{
  "id": "2",
  "type": "midi",
  "name": "Drums",
  "view": "session",
  "path": "t0/s0",
  "timeSignature": "4/4",
  "looping": true,
  "start": "1|1",
  "end": "5|1",
  "length": "4bar",
  "notes": "1|1 C1 n/1\n2|1 D1 n/1\n3|1 E1 n/2\n3|3 E1 n/2"
}
```

**Read audio clip with all audio details:**

```json
{ "path": "t1/s0", "include": ["sample", "warp"] }
```

Result (gainDb/pitchShift omitted when 0):

```json
{
  "id": "5",
  "type": "audio",
  "name": "Guitar Loop",
  "view": "session",
  "path": "t1/s0",
  "sampleFile": "/Users/user/Samples/guitar-loop.wav",
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
{ "path": "t0/s0", "include": ["*"] }
```

MIDI clip result:

```json
{
  "id": "2",
  "type": "midi",
  "name": "Drums",
  "view": "session",
  "path": "t0/s0",
  "color": "#3DC300",
  "timeSignature": "4/4",
  "looping": true,
  "start": "1|1",
  "end": "5|1",
  "length": "4bar",
  "notes": "1|1 C1 n/1\n2|1 D1 n/1\n3|1 E1 n/2\n3|3 E1 n/2"
}
```

Audio clip result:

```json
{
  "id": "5",
  "type": "audio",
  "name": "Guitar Loop",
  "view": "session",
  "path": "t1/s0",
  "color": "#FF6B00",
  "sampleFile": "/Users/user/Samples/guitar-loop.wav",
  "timeSignature": "4/4",
  "looping": true,
  "start": "1|1",
  "end": "9|1",
  "length": "8bar",
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
