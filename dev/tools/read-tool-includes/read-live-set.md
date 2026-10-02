# ppal-read-live-set

The `ppal-read-live-set` include options and response fields. General
conventions are in [README.md](README.md).

Default include: `[]`

Returns the Live Set overview. Use includes to expand track/scene detail.

## Default response (no includes)

| Field               | Type     | Description                                             |
| ------------------- | -------- | ------------------------------------------------------- |
| `name`              | `string` | Live Set name (omitted if empty)                        |
| `tempo`             | `number` | Tempo in BPM                                            |
| `timeSignature`     | `string` | e.g., `"4/4"`                                           |
| `sceneCount`        | `number` | Number of scenes (replaced by array when included)      |
| `regularTrackCount` | `number` | Number of regular tracks (replaced by `tracks` include) |
| `returnTrackCount`  | `number` | Number of return tracks (replaced by `tracks` include)  |
| `scale`             | `string` | e.g., `"A Minor"` (only when scale is enabled)          |
| `scalePitches`      | `string` | e.g., `"A,B,C,D,E,F,G"` (only when scale is enabled)    |
| `isPlaying`         | `true`   | Only present when playing                               |

## Includes

- `tracks` — replaces `regularTrackCount`/`returnTrackCount` with full track
  arrays (`tracks`, `returnTracks`, `mainTrack`). Each track uses read-track
  default format: id, name, type, instrument name, clip/device counts
- `scenes` — replaces `sceneCount` with scene list (read-scene default format)
- `routings` — propagated: adds routing info to tracks
- `mixer` — propagated: adds gain, pan, sends to tracks
- `color` — propagated: adds hex color to tracks and scenes
- `locators` — adds arrangement cue points with names and bar|beat positions

For device details, use `ppal-read-track` with `devices` include. For clip
details, use `ppal-read-track` with `session-clips` or `arrangement-clips`. For
clip notes and audio properties, use `ppal-read-clip`.
