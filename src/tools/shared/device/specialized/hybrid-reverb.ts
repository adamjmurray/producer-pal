// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type SpecializedDeviceSpec } from "./specialized-device-types.ts";

// Hybrid Reverb (HybridReverbDevice). AJM-372. See
// dev/plans/Specialized-Device-Classes.md.
// Convolution IR library: category + file selectors plus IR shaping controls.
// TODO(AJM-372):
//   - params: irCategory (enum), irFile (string), irAttackTime, irDecayTime,
//     irSizeFactor (floats), irTimeShapingOn (bool)
//   - readOptions: irFileList (files in current category, dynamic per install)
//   - underscore↔space translate; apply category before file; re-read irFile
//     after a category change; handle empty "User" category

export const hybridReverbSpec: SpecializedDeviceSpec = {
  displayNames: ["Hybrid Reverb"],
};
