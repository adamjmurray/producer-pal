# ppal-read-device

The `ppal-read-device` include options, response fields, and the `maxDepth` arg.
General conventions are in [README.md](README.md).

Default include: `[]`

Uses inline include parsing (not the shared `parseIncludeArray` framework)
because its includes are unique (`params`, `param-values`, `drum-map`,
`sample`).

## Default response (no includes)

| Field         | Type     | Description                                   |
| ------------- | -------- | --------------------------------------------- |
| `id`          | `string` | Device ID                                     |
| `path`        | `string` | Short path (e.g., `t0/d0`)                    |
| `type`        | `string` | Device type, with class name if not redundant |
| `name`        | `string` | Display name (omitted if same as class name)  |
| `deactivated` | `true`   | Only present when device is inactive          |

## Include: `"chains"`

Adds chain list for rack devices. Depth-controlled by `maxDepth` arg.

At `maxDepth: 0` (default), each chain shows `deviceCount` instead of expanded
devices. At `maxDepth: 1+`, devices are expanded recursively.

| Field    | Type      | Description                               |
| -------- | --------- | ----------------------------------------- |
| `chains` | `Chain[]` | Chain objects with devices or deviceCount |

## Include: `"return-chains"`

Same as `chains` but for rack return chains. Same depth behavior.

| Field          | Type      | Description          |
| -------------- | --------- | -------------------- |
| `returnChains` | `Chain[]` | Return chain objects |

## Include: `"drum-pads"`

Adds drum pad list for drum rack devices. Same depth behavior as `chains`.

| Field      | Type        | Description                                    |
| ---------- | ----------- | ---------------------------------------------- |
| `drumPads` | `DrumPad[]` | Drum pads with path, note, pitch, name, chains |

## Include: `"drum-map"`

Adds flat pitch-to-name mapping for drum rack devices. Internally forces chain
processing at `maxDepth >= 1` to detect instruments, then strips the chain data
from the output.

| Field          | Type                    | Description                           |
| -------------- | ----------------------- | ------------------------------------- |
| `drumMap`      | `Record<string,string>` | Pitch name to drum pad name mapping   |
| `drumRackPath` | `string`                | Path of the rack those pads belong to |

`drumRackPath` is what pad paths are built from. A kit nested inside another
rack is common, and then it is neither the device the caller read nor anything
in the track's device list.

## Include: `"params"`

Adds parameter names, macro variation info, and A/B Compare state.

| Field        | Type       | Description                                |
| ------------ | ---------- | ------------------------------------------ |
| `parameters` | `Param[]`  | Parameter names and IDs                    |
| `variations` | `object`   | Rack only: `{ count, selected }`           |
| `macros`     | `object`   | Rack only: `{ count, hasMappings }`        |
| `abCompare`  | `"a"\|"b"` | Current A/B preset (if device supports it) |

## Include: `"param-values"`

Superset of `params` — includes full parameter details (value, min, max, state,
display value, value items for quantized params).

`min`/`max` are the range the parameter can actually display. When one end of
that range is a word rather than a number — Glue Compressor's `Release` reads
`"A"` for Auto, Compressor's `Ratio` reads `"inf : 1"` — the word is trimmed off
the range and reported as `alsoAccepts`, which update-device takes as a value.

## Include: `"sample"`

A focused discovery view: adds just the Simpler sample file path as a flat
top-level field, optimized for scanning many devices at once (e.g. every pad in
a drum rack). No effect on non-Simpler devices. `gainDb`, multi-sample state
(`multiSampleMode`), and the other Simpler sample params are not in this view —
use `include: ["params"]` for the full set.

| Field    | Type     | Description                                    |
| -------- | -------- | ---------------------------------------------- |
| `sample` | `string` | File path (omitted if no single sample loaded) |

## Include: `"actions"`

Adds the device-specific actions available on `ppal-update-device` for the
device's specialized class (e.g. Simpler's `warpAs`, Wavetable's
`setModulation`). Lets the model discover what it can do to a device at runtime
instead of relying on the skills prompt. Devices with no actions (most
specialized classes and all generic devices) omit the field.

| Field     | Type       | Description                             |
| --------- | ---------- | --------------------------------------- |
| `actions` | `Action[]` | Each `{ name, signature, description }` |

## Include: `"options"`

Adds dynamic per-state/per-install catalogs for specialized devices (IR files,
sidechain sources, current-category wavetables, `modulatableParameters`) plus
Wavetable's current mod-matrix routes (`modulations`). Opt-in because the scan
can be expensive. Only devices that contribute add anything; others omit the
field. See `dev/live-api/specialized-devices/` for per-device contents.

| Field         | Type       | Description                                  |
| ------------- | ---------- | -------------------------------------------- |
| `options`     | `object`   | Per-device catalogs (omitted when none)      |
| `modulations` | `object[]` | Wavetable only: `{ target, source, amount }` |

## `maxDepth` arg

Controls device tree expansion for `chains`, `return-chains`, and `drum-pads`:

- `0` (default): Chains show `deviceCount` only (no device expansion)
- `1`: Direct devices expanded, nested rack chains show `deviceCount`
- `2+`: Deeper recursive expansion
