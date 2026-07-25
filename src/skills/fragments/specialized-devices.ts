// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The per-device pseudo-param / actions catalog. Carved out of devices.ts
// because it is the larger half of the subject and only an update-device task
// needs it — building a Drum Rack or reading a device never does.
export const specializedDevices = `### Specialized Device Controls

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
- **Spectral Resonator** \`midiGate\`, \`monoPoly\`, \`pitchBendRange\`, \`modMode\`, \`pitchMode\`, \`polyphony\`.`;
