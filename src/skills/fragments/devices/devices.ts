// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What every device task needs regardless of direction: the path grammar and
// the VST/AU limits. Gated by any *-device tool. Two siblings hang off it —
// `devicesWrite` below (the build recipes, create/update-device only) and the
// per-device pseudo-param catalog (specialized-devices.ts).
//
// This fragment owns the `## Devices & Instruments` heading; both siblings hang
// off it as `###` sections, so the standard driver's manifest order matters.
//
// Device Paths (131 tok) and the VST/AU limits blurb are both under the ~200-tok
// granularity floor on their own, so they ride together rather than each earning
// an entry.
export const devices = `## Devices & Instruments

### Device Paths

Slash-separated segments: \`t\`=track, \`rt\`=return, \`mt\`=master, \`d\`=device, \`c\`=chain, \`rc\`=return chain, \`p\`=drum pad

- \`t0/d0\` = first device on first track
- \`rt0/d0\` = first device on Return A
- \`mt/d0\` = first device on master track
- \`t0/d0/c0/d0\` = first device in rack's first chain
- \`t0/d0/rc0/d0\` = first device in rack's return chain
- \`t0/d0/pC1/d0\` = first device in Drum Rack's C1 pad
- \`t0/d0/pC1\` = the whole C1 pad; \`t0/d0/pC1/c1\` = one layer of it, when a pad stacks several chains

A Drum Rack nested inside a drum pad has no pads of its own — read-device lists its pads without an \`id\`. Reach those by path only: they can't be deleted or duplicated as pads, and Live offers no way to delete their chains either — empty one by deleting its devices, or move it with \`toPath\`.

ppal-select takes these paths too: \`path: "t0/d0/pC1"\` shows a pad in Live, \`t0/d0/c1\` a rack chain.

Clip destinations speak the same grammar: \`t0\` = that track's arrangement, \`t0/s1\` = a clip slot.

Chains are auto-created when referenced (e.g., \`c0\` on an empty rack creates a chain). Up to 16 chains.

### VST/AU Plugins

Producer Pal can open or close a plug-in's editor window (\`openPluginWindow\` on ppal-select) but **cannot control anything inside a VST/AU plug-in directly** — its internal parameters aren't exposed to the Live API. To make a plug-in's parameters controllable, the user maps them onto the Live plug-in device in Live's Configure mode (expand the device, click "Configure", then click the controls in the plug-in to expose); Producer Pal can then read and set those mapped parameters like any other device parameter. You cannot do the mapping for the user — explain the steps and point them to the [Configure mode manual](https://www.ableton.com/live-manual/12/working-with-instruments-and-effects/#plug-in-configure-mode). Limits: up to 128 parameters can be mapped (so pick the most important ones), and not every plug-in parameter is mappable.`;

/**
 * How a param write behaves (values snap; the response says where they landed),
 * plus the build recipes: loading samples into a Simpler, and building a whole
 * Drum Rack in one call. Only create-device and update-device can act on any of
 * it — a read-only device caller was paying for a recipe it had no tool to run. The direction split notation heads use
 * (ADR-0019), applied to devices.
 *
 * The one read-device sentence rides along because it explains the write
 * asymmetry it sits beside (`sample` is a `params` entry going in, a flat field
 * coming back). A read-only caller still learns that field from read-device's
 * own `include` description.
 */
export const devicesWrite = `### Setting Parameters

A parameter often accepts only a coarse ladder of values even when its range looks continuous — Glue Compressor's Attack has seven steps between 0.01 and 30 ms — so a request lands on the nearest value Live allows. Send a value in the \`unit\` read-device reports for that param, or with no unit at all — a param reporting no \`unit\` shows a bare number whose quantity Live never states, so send a plain number there. A wrong or uncheckable unit is refused, not guessed. create-device and update-device return a \`params\` array with each written param's \`id\`, \`name\` and the value it reads as afterward: check that rather than following a write with a read-device.

### Simpler & Drum Racks

**Simpler sample:** Load a sample with \`params: [{name: "sample", value: "<absolute file path>"}]\` on ppal-create-device or ppal-update-device; set the sample's gain with \`{name: "gainDb", value: <dB>}\` (0 = unity). \`sample\` is always a \`params\` entry — there is no top-level \`sample\` argument. Read-device: \`include: ["sample"]\` returns just the sample file path as a flat top-level \`sample\` field (ideal for scanning every pad's sample in a drum rack); \`include: ["params"]\` returns the full set including \`sample\`, \`gainDb\`, and \`multiSampleMode\`. Writes are skipped with a warning on non-Simpler devices and on Simpler in multi-sample mode.

**Build a Drum Rack (one call):** Create the rack and load every pad's sample in a single ppal-create-device: \`deviceName="Drum Rack" path="t0" params=[{name:"pC1/d0/sample", value:"<abs path>"}, {name:"pC#1/d0/sample", value:"<abs path>"}, ...]\`. A param \`name\` containing \`/\` is a path relative to the rack: the pad-note segment addresses the pad (\`pC1\`, \`pF#1\`), \`d0\` its first device, and the last segment is the param. Setting a pad's \`sample\` is a pad property — the pad's chain and a Simpler to hold the sample auto-create as needed. Add \`{name:"pC1/d0/gainDb", value:<dB>}\` (listed after the sample) to set that Simpler's sample gain — a pad's own level is the chain fader, a separate \`gainDb\` argument on the pad path (below). Standard layout: 16 pads chromatically from C1 up to D#2/Eb2. Get sample paths from \`ppal-library\`; to match an existing kit's pad notes, read the track with \`drum-map\` first. The same path-prefixed params work on ppal-update-device to set/replace samples on an existing rack.

**Pad sample-write policy** (applied per pad; a skip-and-warn never tears down the rack): the write targets the pad's **instrument**, wherever it sits in the chain — MIDI effects in front of it are left alone. Pad with no instrument → create Simpler + load; pad with a Simpler → replace its sample; pad with a Simpler in multi-sample mode, or with any other instrument → skip+warn (the Live API can't set their sample, so loading one would replace the whole instrument). To swap a pad that skip-warned, delete its instrument first then set the sample: \`ppal-delete type="device" path="t0/d0/pC1/d0"\` clears the device at that index inside the pad, chain intact (read the pad first if anything sits in front of its instrument); to remove the whole pad instead use \`ppal-delete type="drum-pad" path="t0/d0/pC1"\`. \`ppal-delete\` accepts comma-separated paths to clear several pads at once.

**Chain trim, moving & copying pads:** every rack chain has its own fader, separate from the instrument inside it. read-device lists a chain's \`gainDb\`, \`pan\`, and \`sends\` only when non-default (omitted = 0 dB / center / off); set them with update-device \`gainDb\`, \`pan\`, or \`sendGainDb\` + \`sendReturn\` (a rack return chain's \`id\`, name, or letter) on the chain or pad path. To set several sends at once, pass \`sends\` instead: \`[{return, gainDb}]\`, taking the \`returnId\` or \`return\` a chain read reports. Work at the pad path so the chain — and its trim, choke group, and devices — comes along: \`ppal-update-device path="t0/d0/pC1" toPath="t0/d0/pD1"\` **moves** a pad, \`ppal-duplicate type="drum-pad" path="t0/d0/pC1" toPath="t0/d0/pD1"\` **copies** one (a pad \`id\` from read-device works as the source instead, but not alongside \`path\`; \`toPath\` is required, accepts a comma-separated list, and must name pads in the same rack). Both stay within one rack. Moving or duplicating only the device (\`t0/d0/pC1/d0\`) carries the chain trim across only within the same rack, and only when the destination chain is empty and still at defaults; anywhere else it leaves the trim behind and warns. Either pad operation onto an occupied pad layers with what's there — clear it first.

**Layered pads:** every pad read reports \`chainCount\` — check it, don't read the pad's \`name\`, which Live sets to "Multi" on a stacked pad but which a chain can also be named. A bare pad path applies \`mute\`, \`solo\`, \`chokeGroup\`, \`mappedPitch\`, \`color\` and a move to every layer; a \`toPath\` move from a layer path takes only that layer, which is how you split a stack apart (\`path="t0/d0/pC1/c1" toPath="t0/d0/pF1"\`) or merge one layer onto another pad. \`name\`, \`gainDb\`, \`pan\` and sends belong to one layer, so on a pad holding more than one they are skipped with a warning listing the layer paths (\`t0/d0/pC1/c0\`, \`t0/d0/pC1/c1\`) — reissue on those. To remove one layer and keep the rest, \`ppal-delete type="chain" path="t0/d0/pC1/c1"\` (drum rack chains only — Live can't delete an Instrument Rack's). A pad with \`chainCount: 0\` is inert: Live drops every write to it, so update-device warns and skips.`;
