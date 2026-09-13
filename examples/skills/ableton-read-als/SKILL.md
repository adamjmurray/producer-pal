---
name: ableton-read-als
description: >-
  Read Ableton Live Set (.als) files straight from disk, without opening Live.
  One Set or a whole folder of projects: tracks, device chains (racks, drum
  pads, macros, parameters, presets), clips, mixer, routing, scenes, locators,
  tempo, time signature, scale. Use when the user asks what's in a project, or
  wants to compare or analyze many projects at once — "what master chain do I
  usually use", "which projects have a Drift on the bass", "list my sample
  paths". Live 12 files only. Any platform, Node 18+, no dependencies.
---

# Ableton: Read .als Files

`read-als.mjs` unzips a Live Set and summarizes it as JSON. It never touches
Live, so it works on closed projects, on many projects at once, and on Sets that
don't contain the Producer Pal device. Read-only.

**When to use Producer Pal instead:** anything about the Set that is open right
now (`ppal-read-live-set`, `ppal-read-track`), or any edit. This skill can't
change a file or hear what's playing.

## Usage

```bash
node read-als.mjs "My Song Project/My Song.als"          # tracks + device chains
node read-als.mjs ~/Music/Ableton/Projects                 # every Set in a folder
node read-als.mjs song.als --include devices,parameters    # with parameter values
node read-als.mjs song.als --include all
node read-als.mjs ~/Music/Ableton/Projects --compact       # one JSON line per Set
```

`--include` takes a comma-separated list. Tracks, tempo, time signature, scale,
and the arrangement loop are always included.

| Section      | Adds                                                                                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `devices`    | Device tree per track (default). Racks nest `chains`, each with its own `devices`; drum pads carry `note`. Rack `macros`, preset paths, Simpler/Sampler sample paths.                         |
| `parameters` | Every device parameter as `Name: value`, flattened with dots (`Bands.0.ParameterA.Freq`). Large.                                                                                              |
| `clips`      | Session clips (`scene` index) and arrangement clips (`start` in beats): name, length, loop, time signature, note count; sample, warp mode, pitch, gain for audio. Never the notes themselves. |
| `mixer`      | Volume, pan, active, sends.                                                                                                                                                                   |
| `routing`    | Audio and MIDI in/out as Live displays them ("Ext: All Ins", "FX Bus / Track In").                                                                                                            |
| `scenes`     | Names, colors, per-scene tempo and time signature when enabled.                                                                                                                               |
| `locators`   | Arrangement markers with beat positions.                                                                                                                                                      |
| `all`        | Everything above.                                                                                                                                                                             |

A folder is walked recursively. `Backup/` folders are skipped. A file that fails
to parse becomes `{ file, error }` so one bad Set doesn't stop the batch.

## Reading the output

- Colors are `#RRGGBB`, matching what Producer Pal reports.
- Times and lengths are in beats.
- Parameter values are Live's raw internal values (e.g. a volume of `1` is 0 dB,
  a threshold in dB, a frequency in Hz). Compare like with like across Sets;
  don't assume a unit. Mode-style parameters are integers.
- `type` on a device is Live's internal name: `Compressor2` is Compressor, `Eq8`
  is EQ Eight, `OriginalSimpler` is Simpler, `MultiSampler` is Sampler,
  `UltraAnalog` is Analog, `Hybrid` is Hybrid Reverb, `MxDevice*` is a Max for
  Live device (its `.amxd` is in `preset`). Plug-ins have `type` `vst3`, `vst`,
  or `au` and `name` is the plug-in's name; their `parameters` are only the ones
  configured in Live's device panel, as 0–1 normalized values.
- A `preset` is present only when a `.adv`, `.adg`, or `.amxd` was loaded.

## Batch analysis pattern

For "what do my projects have in common" questions, run the folder with the
sections you need, then reason over the JSON. For master chains:

```bash
node read-als.mjs ~/Music/Ableton/Projects --compact > sets.jsonl
node -e '
  for (const line of require("fs").readFileSync("sets.jsonl", "utf8").trim().split("\n")) {
    const s = JSON.parse(line);
    if (s.mainTrack) console.log(s.name, "→", s.mainTrack.devices.map((d) => d.name ?? d.type).join(", "));
  }'
```

Keep `parameters` off for the first pass. Add it for the handful of Sets you
want to compare in detail.

## Limits

- Live 12 files. Older Sets may parse but the main track and some device layouts
  differ.
- Sets are 1–3 MB of XML each; a folder of hundreds takes a few seconds.
