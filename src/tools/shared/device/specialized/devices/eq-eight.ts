// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  enumParam,
  readBoolProp,
  writeBoolProp,
} from "../specialized-device-param-helpers.ts";
import { type SpecializedDeviceSpec } from "../specialized-device-types.ts";

// EQ Eight (Eq8Device). See dev/specialized-devices/audio-effects.md.
//
// Exposes two class-level properties not reachable as DeviceParameters:
// - globalMode: processing mode (Stereo / L/R / M/S) → global_mode int 0/1/2
// - oversample: oversampling toggle → oversample bool
//
// edit_mode deliberately NOT exposed — UI-only display selector (probe verified
// that A/B parameter writes are independent of it). A↔L↔M and B↔R↔S chain
// semantics are documented in skill instructions.

// User-facing processing-mode labels in internal-index order.
// global_mode: 0=Stereo, 1=L/R, 2=M/S (probe-verified 2026-05-21).
const GLOBAL_MODES = ["stereo", "L/R", "M/S"] as const;

export const eqEightSpec: SpecializedDeviceSpec = {
  displayNames: ["EQ Eight"],
  params: [
    enumParam("globalMode", "global_mode", GLOBAL_MODES),
    {
      name: "oversample",
      read: (device) => readBoolProp(device, "oversample"),
      write: (device, value, toolName) =>
        writeBoolProp(device, "oversample", value, toolName, "oversample"),
    },
  ],
};
