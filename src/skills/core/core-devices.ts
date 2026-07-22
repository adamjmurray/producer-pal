// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A section of the standard skills body, pulled into the standard driver via
// `@include` (see core-standard.ts, which lists the manifest). Each section is
// its own override slot (skill-slots.ts) so users can edit it in isolation —
// or suppress it by deleting its include line in a `standard` driver override.
// The Devices & Instruments section of the standard core: device paths,
// Simpler/Drum Rack building, specialized device controls, and VST/AU limits.
export const coreDevices = `## Devices & Instruments

### Device Paths

Slash-separated segments: \`t\`=track, \`rt\`=return, \`mt\`=master, \`d\`=device, \`c\`=chain, \`rc\`=return chain, \`p\`=drum pad

- \`t0/d0\` = first device on first track
- \`rt0/d0\` = first device on Return A
- \`mt/d0\` = first device on master track
- \`t0/d0/c0/d0\` = first device in rack's first chain
- \`t0/d0/rc0/d0\` = first device in rack's return chain
- \`t0/d0/pC1/d0\` = first device in Drum Rack's C1 pad

Chains are auto-created when referenced (e.g., \`c0\` on an empty rack creates a chain). Up to 16 chains.

### Simpler & Drum Racks

**Simpler sample:** Load a sample with \`params: [{name: "sample", value: "<absolute file path>"}]\` on ppal-create-device or ppal-update-device; set its level with \`{name: "gainDb", value: <dB>}\` (0 = unity). \`sample\` is always a \`params\` entry — there is no top-level \`sample\` argument. Read-device: \`include: ["sample"]\` returns just the sample file path as a flat top-level \`sample\` field (ideal for scanning every pad's sample in a drum rack); \`include: ["params"]\` returns the full set including \`sample\`, \`gainDb\`, and \`multiSampleMode\`. Writes are skipped with a warning on non-Simpler devices and on Simpler in multi-sample mode.

**Build a Drum Rack (one call):** Create the rack and load every pad's sample in a single ppal-create-device: \`deviceName="Drum Rack" path="t0" params=[{name:"pC1/d0/sample", value:"<abs path>"}, {name:"pC#1/d0/sample", value:"<abs path>"}, ...]\`. A param \`name\` containing \`/\` is a path relative to the rack: the pad-note segment addresses the pad (\`pC1\`, \`pF#1\`), \`d0\` its first device, and the last segment is the param. Setting a pad's \`sample\` is a pad property — the pad's chain and a Simpler to hold the sample auto-create as needed. Add \`{name:"pC1/d0/gainDb", value:<dB>}\` (listed after the sample) to set a pad's level. Standard layout: 16 pads chromatically from C1 up to D#2/Eb2. Get sample paths from \`ppal-library\`; to match an existing kit's pad notes, read the track with \`drum-map\` first. The same path-prefixed params work on ppal-update-device to set/replace samples on an existing rack.

**Pad sample-write policy** (applied per pad; a skip-and-warn never tears down the rack): empty pad → create Simpler + load; pad with a Simpler → replace its sample; Simpler in multi-sample mode → skip+warn; pad with a **DrumSampler** → replaced with a Simpler + a notice (DrumSampler's sample is not controllable via the Live API); any other device → skip+warn. To swap a pad that skip-warned, delete its device first then set the sample: \`ppal-delete type="device" path="t0/d0/pC1/d0"\` clears the device inside the pad (chain stays); to remove the whole pad instead use \`ppal-delete type="drum-pad" path="t0/d0/pC1"\`. \`ppal-delete\` accepts comma-separated paths to clear several pads at once.

### Specialized Device Controls

Some native devices expose class-level controls beyond their DeviceParameters, through two surfaces: **pseudo-params** (set via \`params\` {name, value} entries, read back in \`parameters\`) and **\`actions\`** (function-call strings on update-device). Discover a device's surface at runtime rather than guessing values: read-device \`include: ["params"]\` lists its pseudo-params, \`include: ["actions"]\` lists action signatures, and \`include: ["options"]\` returns the valid values for each pseudo-param (\`paramOptions\`) plus dynamic catalogs (wavetables, IR files, sidechain sources) and Wavetable mod routes/sources. Invalid enum values warn-and-skip and list the valid options. The bullets below give each device's pseudo-params and non-obvious behavior — read options for accepted values.

Instruments:

- **Drift** mod matrix. Fixed-target source slots \`filterMod1Source\` \`filterMod2Source\` \`lfoSource\` \`pitchMod1Source\` \`pitchMod2Source\` \`shapeSource\`; three free slots pair \`mod1Source\`/\`mod2Source\`/\`mod3Source\` with \`mod1Target\`/\`mod2Target\`/\`mod3Target\` (target None disables the slot). For each active free slot also set its matching amount DeviceParameter (e.g. \`Mod Matrix Amt 1\`). Plus \`voiceMode\` (Poly/Mono/Stereo/Unison), \`voiceCount\`, \`pitchBendRange\`.
- **Wavetable** \`filterRouting\`, \`monoPoly\`, \`polyVoices\`, \`unisonMode\`, \`unisonVoiceCount\`, \`osc1Engine\`/\`osc2Engine\`. For \`osc1Category\`/\`osc2Category\` + \`osc1Wavetable\`/\`osc2Wavetable\`, set category first (options \`oscWavetableCategories\`, then \`osc1Wavetables\`/\`osc2Wavetables\` list the selected category's tables). Mod matrix via actions; options returns current routes (\`modulations\`), \`modulatableParameters\`, and \`modulationSources\`.
- **Meld** \`monoPoly\`, \`polyVoices\`, \`unisonVoices\`.
- **Simpler** \`sample\` (file path), \`gainDb\` (sample level, 0 = unity), \`playbackMode\` (classic/one-shot/slicing), \`slicingPlaybackMode\`, \`retrigger\`, \`voices\`; read-only \`multiSampleMode\`, \`estimatedPlaybackLength\`. Sample-editing actions operate on the active region — set the \`S Start\`/\`S Length\` DeviceParameters first to target a sub-range.

Audio effects:

- **Compressor** sidechain: \`sidechainSourceTrackId\` (a trackId, or null for No Input), then \`sidechainChannel\` — set the source first, as the valid channels vary by source. options lists \`sidechainSourceTrackIds\` and the current source's \`sidechainChannels\`.
- **EQ Eight** \`globalMode\` (stereo / L/R / M/S), \`oversample\`. In L/R the A bands process Left and B bands Right; in M/S, A = Mid and B = Side. Set \`globalMode\`, then write the A-/B-suffix band DeviceParameters (e.g. \`5 Frequency B\`).
- **Hybrid Reverb** \`irCategory\`, \`irFile\` (set category first; options \`irCategoryList\`, then \`irFileList\` lists the selected category's files), \`irAttackTime\`, \`irDecayTime\`, \`irSizeFactor\`, \`irTimeShapingOn\`.
- **Roar** \`routingMode\`, \`envListen\`.
- **Spectral Resonator** \`midiGate\`, \`monoPoly\`, \`pitchBendRange\`, \`modMode\`, \`pitchMode\`, \`polyphony\`.

### VST/AU Plugins

Producer Pal can open or close a plug-in's editor window (\`openPluginWindow\` on ppal-select) but **cannot control anything inside a VST/AU plug-in directly** — its internal parameters aren't exposed to the Live API. To make a plug-in's parameters controllable, the user maps them onto the Live plug-in device in Live's Configure mode (expand the device, click "Configure", then click the controls in the plug-in to expose); Producer Pal can then read and set those mapped parameters like any other device parameter. You cannot do the mapping for the user — explain the steps and point them to the [Configure mode manual](https://www.ableton.com/live-manual/12/working-with-instruments-and-effects/#plug-in-configure-mode). Limits: up to 128 parameters can be mapped (so pick the most important ones), and not every plug-in parameter is mappable.`;
