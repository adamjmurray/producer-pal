# ppal-read-scene

The `ppal-read-scene` include options and response fields. General conventions
are in [README.md](README.md).

Default include: `[]`

Returns scene overview by default. Use `include` to add detail.

## Default response (no includes)

| Field           | Type     | Description                                          |
| --------------- | -------- | ---------------------------------------------------- |
| `id`            | `string` | Scene ID                                             |
| `path`          | `string` | Where the scene is: `"s0"`                           |
| `name`          | `string` | Scene name with 1-based number (e.g., `"Intro (1)"`) |
| `clipCount`     | `number` | Number of non-empty clips in the scene               |
| `tempo`         | `number` | Only present when scene tempo is enabled             |
| `timeSignature` | `string` | Only present when scene time sig is enabled          |
| `triggered`     | `true`   | Only present when scene is triggered                 |

## Include: `"clips"`

Replaces `clipCount` with full clip details for all non-empty clips in the
scene. Each clip is read via `readClip()`. Nested clips have `view` stripped
(see [Redundant field stripping](README.md#redundant-field-stripping)).

| Field   | Type     | Description                               |
| ------- | -------- | ----------------------------------------- |
| `clips` | `Clip[]` | Non-empty clips across all regular tracks |

## Include: `"notes"`, `"sample"`, `"timing"`, `"warp"`, `"color"`

Propagated to `readClip()` for each clip in the scene. See
[read-clip.md](read-clip.md) for details on these includes.
