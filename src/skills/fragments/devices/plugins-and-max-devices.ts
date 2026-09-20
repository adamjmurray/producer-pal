// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Loading a plug-in or Max for Live device by name. Shipped only while the
// Producer Pal remote script answers, since create-device can't load either
// without it. A `###` under the devices fragment's heading.
export const pluginsAndMaxDevices = `### Plug-Ins & Max for Live Devices

ppal-create-device also loads VST/AU plug-ins and Max for Live devices by name. Find one with ppal-library (\`action: "listPlugins"\` for plug-ins, \`kind: "m4l-device"\` for Max devices) and pass the result's \`name\` as \`device\`. Listing with no \`device\` shows native devices only.`;
