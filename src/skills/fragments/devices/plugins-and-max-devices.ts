// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Loading a plug-in, Max for Live device, or preset from Live's browser. Shipped
// only while the Producer Pal remote script answers, since neither tool can
// load one without it. A `###` under the devices fragment's heading.
export const pluginsAndMaxDevices = `### Plug-Ins, Max for Live Devices & Presets

ppal-create-device also loads VST/AU plug-ins and Max for Live devices by name. Find one with ppal-library (\`action: "listPlugins"\` for plug-ins, \`kind: "m4l-device"\` for Max devices) and pass the result's \`name\` as \`device\`. Listing with no \`device\` shows native devices only.

Load a preset with \`preset\`: on ppal-create-device (add \`device\` to search only that device's presets), or on ppal-update-device to swap it onto an existing device. A device preset loads by name; for anything else, like a pack's drum kits, search ppal-library with \`kind: "preset"\` or \`"device-group"\` and pass the result's \`path\`.`;
