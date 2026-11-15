// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Loading a plug-in, Max for Live device, or preset from Live's browser. Shipped
// only while the Producer Pal remote script answers, since neither tool can
// load one without it. A `###` under the devices fragment's heading.
export const pluginsAndMaxDevices = `### Plug-Ins, Max for Live Devices & Presets

ppal-create-device also loads VST/AU plug-ins and Max for Live devices by name. Find one with ppal-library (\`action: "list-plugins"\` for plug-ins, \`kind: "m4l-device"\` for Max devices) and pass the result's \`name\` as \`deviceName\` (a search result without a \`name\`: use the file name ending its \`path\`). A plug-in in several formats loads VST3, else AU, else VST2; to pick one, pass \`Plug-Ins/<format>/<vendor>/<name>\` from the result's \`format\` (VST3, AU, VST), \`vendor\` and \`name\` (VST has no vendor folder). Listing with no \`deviceName\` shows native devices only.

Load a preset with \`preset\`: on ppal-create-device (add \`deviceName\` to search only that device's presets), or on ppal-update-device to swap it onto an existing device. A preset loads by name, including a pack's drum kits; a name that matches several lists their paths to pass instead. To browse presets, search ppal-library with \`kind: "preset"\` or \`"device-group"\` and pass a result's \`path\`.`;
