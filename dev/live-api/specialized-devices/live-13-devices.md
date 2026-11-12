# Live 13 Devices

Probed on Live 13.0b25. Live 12 has none of these, so every spec here matches by
`class_name` (a spec's `classNames`), which Live 12 never reports for them.
`ppal-create-device` makes each one by name; no code is needed for that.

| Device              | Create name        | `class_name`                      | Handling                                       |
| ------------------- | ------------------ | --------------------------------- | ---------------------------------------------- |
| Drum Synth          | `Drum Synth`       | `DrumSynth`                       | generic Device, 57 params; gated               |
| Clipper             | `Clipper`          | `Clipper`                         | generic, 6 params, nothing to gate             |
| Transient Shaper    | `Transient Shaper` | `TransientShaper`                 | generic, 8 params in Max (10 in Python); gated |
| Mid-Side Rack       | `Mid-Side Rack`    | `AudioEffectMidSideGroupDevice`   | fixed-chain rack (see racks docs)              |
| Multiband Rack      | `Multiband Rack`   | `AudioEffectMultibandGroupDevice` | fixed-chain rack                               |
| Softube (5 devices) | see below          | `MxDeviceAudioEffect`             | hosted Max for Live, params read cleanly       |

Fixed-chain racks read `max_num_chains` (2 and 3; ordinary racks read INT_MAX,
Live 12 has no such property). A device read shows it as `maxChains`, and adding
a chain to a full one is refused up front.

Softube: FET Compressor, OPTO Compressor, BCA Compressor, BCA Equaliser, BCA
Drive. A Max for Live pack, loaded through the browser, so it may not be
installed.

Clipper's params: Ceiling, Input, Output, Mode (Soft/Hard), Lift.

## Drum Synth

`Sound Type` (Kick, Snare, Rim Shot, HiHat, Clap, Tom, Percussion, Cymbal, FX)
and a per-type model param decide which params do anything. Live leaves all 57
active. Read order (13.0b25): `Device On`, `Sound Type`, shared `Transpose`,
`Tune`, `Decay`, `Color`, `Volume`; then per type its model param (`Kick Model`,
`Snare Model`, `Rim Model`, `HiHat Model`, `Clap Model`, `Perc Model`,
`Tom Model`, `Cymbal Model`, `FX Model`) with the params after it; then
`Vol Mod Src/Amt` and `Timbre Mod Src/Amt`.

Model options (13.0b25): Kick Model [Kick 80x, Kick 90x, Kick 78]; Snare Model
[Snare TR, Snare Modal, Snare Acoustic]; Rim Model [Rim TR, Zapp]; HiHat Model
[HiHat TR, HiHat Digi, Spark]; Clap Model [Clap TR, Marbles, Guiro]; Perc Model
[Simple Drum, Bongo, Timpani]; Tom Model [Tom 80x, Tom 90x]; Cymbal Model
[Cymbal TR, Cymbal RH]; FX Model [Cow TR, FM, Metallic, Liquid]. A model's
params are named after its option (`Kick 80x Click`, `Zapp Snap`,
`Marbles Start`, `Liquid Glide`), except Simple Drum, which owns `Simple Noise`.
Rim TR and the Cymbal models have none.

Live reports all 57 params active (state 0) at every Sound Type, so the gating
is by name (`specialized/devices/live-13/drum-synth.ts`, one table):

- Under a Sound Type, a param of another type is inactive: its `* Model` param
  and its models' params (the type prefix `Kick`, `Snare`, `Rim`, `HiHat`,
  `Clap`, `Tom`, `Perc`, `Cymbal`, `FX`, plus each of its model prefixes).
- Inside a type, the params of the models other than the one selected in its
  `* Model` param are inactive.
- Both are `prefixModes` rules: a param starting with a listed prefix and a
  space is inactive unless it starts with the active value's prefix.

`Material` (Wood, Plastic, Marble) has no model prefix, but Live's schema names
it `Clap_MarblesMaterial`, so it belongs to the Clap type's Marbles model. It is
inactive unless Sound Type = Clap and Clap Model = Marbles (a name-based `cases`
entry on the Sound Type and Clap Model rules).

On a drum pad, the chain is named after the preset ("Kick 80x"), not the device.

## Transient Shaper

Max lists 8 params: Device On, Attack, Sustain, Soft Clip On, Dry/Wet, S/C Emph
Type (Off, Low, Mid, High), S/C Gain, S/C On. Live's Python API lists the same 8
(checked on 13.0b25, sidechain on and off), so nothing is out of reach.

`transientShaperSpec` marks `S/C Gain` and `S/C Emph Type` inactive while
`S/C On` is Off (`Off`/`On` labels confirmed). That `S/C Emph Type`, a sidechain
filter setting, goes with the sidechain is an inference; Live itself reports
both active either way.
