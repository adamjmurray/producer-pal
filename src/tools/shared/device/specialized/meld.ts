// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type SpecializedDeviceSpec } from "./specialized-device-types.ts";

// Meld (MeldDevice, class_name "InstrumentMeld"). AJM-376. See
// dev/plans/Specialized-Device-Classes.md.
// TODO(AJM-376):
//   - params: monoPoly (mono/poly → mono_poly 0/1), polyVoices (1-6),
//     unisonVoices (0-2)
//   - skip selected_engine (UI-only); pre-validate ranges (silent revert)

export const meldSpec: SpecializedDeviceSpec = {
  displayNames: ["Meld"],
};
