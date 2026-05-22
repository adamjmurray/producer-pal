// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type SpecializedDeviceSpec } from "./specialized-device-types.ts";

// EQ Eight (Eq8Device). AJM-377. See dev/plans/Specialized-Device-Classes.md.
// TODO(AJM-377):
//   - params: globalMode (stereo/L-R/M-S → global_mode 0/1/2), oversample (bool)
//   - skip edit_mode (UI-only); A↔L↔M / B↔R↔S mapping documented in Skills

export const eqEightSpec: SpecializedDeviceSpec = {
  displayNames: ["EQ Eight"],
};
