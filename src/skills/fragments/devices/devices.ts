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

A Drum Rack nested inside a drum pad has no pads of its own — read-device lists its pads without an \`id\`. Reach those by path only: they can't be deleted or duplicated as pads.

ppal-select takes these paths too: \`path: "t0/d0/pC1"\` shows a pad in Live, \`t0/d0/c1\` a rack chain.

Clip destinations speak the same grammar: \`t0\` = that track's arrangement, \`t0/s1\` = a session slot.

Chains are auto-created when referenced (e.g., \`c0\` on an empty rack creates a chain). Up to 16 chains.

### VST/AU Plugins

Producer Pal can open or close a plug-in's editor window (\`openPluginWindow\` on ppal-select) but **cannot control anything inside a VST/AU plug-in directly** — its internal parameters aren't exposed to the Live API. To make a plug-in's parameters controllable, the user maps them onto the Live plug-in device in Live's Configure mode (expand the device, click "Configure", then click the controls in the plug-in to expose); Producer Pal can then read and set those mapped parameters like any other device parameter. You cannot do the mapping for the user — explain the steps and point them to the [Configure mode manual](https://www.ableton.com/live-manual/12/working-with-instruments-and-effects/#plug-in-configure-mode). Limits: up to 128 parameters can be mapped (so pick the most important ones), and not every plug-in parameter is mappable.`;

/**
 * The build recipes: loading samples into a Simpler, and building a whole Drum
 * Rack in one call. Two thirds of the subject's tokens, and only create-device
 * and update-device can act on any of it — a read-only device caller was paying
 * for a recipe it had no tool to run. The direction split notation heads use
 * (ADR-0019), applied to devices.
 *
 * The one read-device sentence rides along because it explains the write
 * asymmetry it sits beside (`sample` is a `params` entry going in, a flat field
 * coming back). A read-only caller still learns that field from read-device's
 * own `include` description.
 */
export const devicesWrite = `### Simpler & Drum Racks

**Simpler sample:** Load a sample with \`params: [{name: "sample", value: "<absolute file path>"}]\` on ppal-create-device or ppal-update-device; set its level with \`{name: "gainDb", value: <dB>}\` (0 = unity). \`sample\` is always a \`params\` entry — there is no top-level \`sample\` argument. Read-device: \`include: ["sample"]\` returns just the sample file path as a flat top-level \`sample\` field (ideal for scanning every pad's sample in a drum rack); \`include: ["params"]\` returns the full set including \`sample\`, \`gainDb\`, and \`multiSampleMode\`. Writes are skipped with a warning on non-Simpler devices and on Simpler in multi-sample mode.

**Build a Drum Rack (one call):** Create the rack and load every pad's sample in a single ppal-create-device: \`deviceName="Drum Rack" path="t0" params=[{name:"pC1/d0/sample", value:"<abs path>"}, {name:"pC#1/d0/sample", value:"<abs path>"}, ...]\`. A param \`name\` containing \`/\` is a path relative to the rack: the pad-note segment addresses the pad (\`pC1\`, \`pF#1\`), \`d0\` its first device, and the last segment is the param. Setting a pad's \`sample\` is a pad property — the pad's chain and a Simpler to hold the sample auto-create as needed. Add \`{name:"pC1/d0/gainDb", value:<dB>}\` (listed after the sample) to set a pad's level. Standard layout: 16 pads chromatically from C1 up to D#2/Eb2. Get sample paths from \`ppal-library\`; to match an existing kit's pad notes, read the track with \`drum-map\` first. The same path-prefixed params work on ppal-update-device to set/replace samples on an existing rack.

**Pad sample-write policy** (applied per pad; a skip-and-warn never tears down the rack): empty pad → create Simpler + load; pad with a Simpler → replace its sample; Simpler in multi-sample mode → skip+warn; pad with a **DrumSampler** → skip+warn (the Live API can't set its sample, so loading one would replace the whole device with a Simpler); any other device → skip+warn. To swap a pad that skip-warned, delete its device first then set the sample: \`ppal-delete type="device" path="t0/d0/pC1/d0"\` clears the device inside the pad (chain stays); to remove the whole pad instead use \`ppal-delete type="drum-pad" path="t0/d0/pC1"\`. \`ppal-delete\` accepts comma-separated paths to clear several pads at once.

**Chain trim, moving & copying pads:** every rack chain has its own fader, separate from the instrument inside it. read-device lists a chain's \`gainDb\`, \`pan\`, and \`sends\` only when non-default (omitted = 0 dB / center / off); set them with update-device \`gainDb\`, \`pan\`, or \`sendGainDb\` + \`sendReturn\` (a rack return chain's name or letter) on the chain or pad path. Work at the pad path so the chain — and its trim, choke group, and devices — comes along: \`ppal-update-device path="t0/d0/pC1" toPath="t0/d0/pD1"\` **moves** a pad, \`ppal-duplicate type="drum-pad" id="<pad id>" toPath="t0/d0/pD1"\` **copies** one (read-device lists each pad's \`id\`; \`toPath\` is required, accepts a comma-separated list, and must name pads in the same rack). Both stay within one rack. Moving or duplicating only the device (\`t0/d0/pC1/d0\`) carries the chain trim across only within the same rack, and only when the destination chain is empty and still at defaults; anywhere else it leaves the trim behind and warns. Either pad operation onto an occupied pad layers with what's there — clear it first.

**Layered pads:** a bare pad path applies \`mute\`, \`solo\`, \`chokeGroup\`, \`mappedPitch\`, \`color\` and a move to every layer. \`name\`, \`gainDb\`, \`pan\` and sends belong to one layer, so on a pad holding more than one they are skipped with a warning listing the layer paths (\`t0/d0/pC1/c0\`, \`t0/d0/pC1/c1\`) — reissue on those.`;
