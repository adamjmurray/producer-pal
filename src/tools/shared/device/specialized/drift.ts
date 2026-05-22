// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type SpecializedDeviceSpec } from "./specialized-device-types.ts";

// Drift (DriftDevice, class_name "Drift"). AJM-374. See
// dev/plans/Specialized-Device-Classes.md.
// Declarative mod matrix: each slot is an int `_index` into a shared `_list`.
// TODO(AJM-374):
//   - params: 9 source enums (filterMod1/2Source, lfoSource, pitchMod1/2Source,
//     shapeSource, mod1/2/3Source), 3 target enums (mod1/2/3Target incl "None"),
//     voiceMode, voiceCount (4/8/16/24/32), pitchBendRange
//   - sources are a shared 8-value list; targets a shared 12-value list
//   - amounts stay on the DeviceParameter surface (not pseudo-params)

export const driftSpec: SpecializedDeviceSpec = {
  displayNames: ["Drift"],
};
