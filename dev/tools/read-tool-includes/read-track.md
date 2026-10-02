# ppal-read-track

The `ppal-read-track` include options and response fields. General conventions
are in [README.md](README.md).

Default include: `[]`

Returns track overview by default. Use `include` to add detail.

## Default response (no includes)

| Field                  | Type     | Description                                                   |
| ---------------------- | -------- | ------------------------------------------------------------- |
| `id`                   | `string` | Track ID                                                      |
| `path`                 | `string` | Where the track is: `"t0"`, `"rt1"`, `"mt"`                   |
| `name`                 | `string` | Track name                                                    |
| `type`                 | `string` | `"midi"` or `"audio"`; omitted on a return or the main track  |
| `instrument`           | `string` | Instrument class name (omitted if no instrument)              |
| `groupId`              | `string` | Parent group track ID (only when grouped)                     |
| `isArmed`              | `true`   | Only present when armed                                       |
| `isGroup`              | `true`   | Only present for group tracks                                 |
| `isGroupMember`        | `true`   | Only present when inside a group                              |
| `playingSlotIndex`     | `number` | 0-based playing clip slot (only when >= 0)                    |
| `firedSlotIndex`       | `number` | 0-based triggered clip slot (only when >= 0)                  |
| `state`                | `string` | Only present when not "ACTIVE" (e.g., muted, soloed)          |
| `sessionClipCount`     | `number` | Number of session clips (replaced by array when included)     |
| `arrangementClipCount` | `number` | Number of arrangement clips (replaced by array when included) |
| `takeLaneCount`        | `number` | Number of take lanes (only when the track has any)            |
| `deviceCount`          | `number` | Number of devices (replaced by array when included)           |
| `hasProducerPalDevice` | `true`   | Only present on the Producer Pal host track                   |

## Include: `"session-clips"`, `"arrangement-clips"`

Replaces `sessionClipCount` / `arrangementClipCount` with full clip arrays. Each
clip is read via `readClip()`. Nested clips have `view` and `type` stripped (see
[Redundant field stripping](README.md#redundant-field-stripping)).

`arrangement-clips` also replaces `takeLaneCount` with `takeLanes`: one entry
per lane, each with its `id`, `path` (e.g. `"t2/l0"`), `name`, and `clips`.

A lane reads on its own too: `path: "t2/l0"`, or the lane's own `id`, answers
with that lane — `id`, `path`, `name` — plus its `clips` under the same
`arrangement-clips` include. Every other include is a track's, and a lane
ignores them.

## Other includes

- `devices` — flat device list in track signal-chain order
- `drum-map` — pitch-to-name mappings for drum racks, plus the owning rack's
  path
- `routings`, `available-routings` — routing info
- `notes`, `sample`, `timing`, `warp`, `color` — propagated to nested clip reads

## Include: `"mixer"`

Adds track-level mixer properties. Fields are merged into the track object.

| Field         | Type     | Description                                                    |
| ------------- | -------- | -------------------------------------------------------------- |
| `gainDb`      | `string` | Volume display value (e.g., `"0.00 dB"`)                       |
| `panningMode` | `string` | Only present when `"split"` (stereo mode omitted)              |
| `pan`         | `number` | Pan position -1 to 1 (stereo mode)                             |
| `leftPan`     | `number` | Left split pan (split mode only)                               |
| `rightPan`    | `number` | Right split pan (split mode only)                              |
| `sends`       | `Send[]` | Send levels; each `{ gainDb, return }` (omitted when no sends) |

Device-structural includes (`chains`, `return-chains`, `drum-pads`) are not
available at this level. Use `ppal-read-device` for chain/drum-pad detail.
