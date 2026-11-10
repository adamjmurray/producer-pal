// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  enumParam,
  readBoolProp,
  writeBoolProp,
} from "../specialized-param-access.ts";
import { type SpecializedDeviceSpec } from "../specialized-device-types.ts";

// EQ Eight (Eq8Device). See dev/live-api/specialized-devices/audio-effects.md.
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

const BAND_PARAMS = ["Filter On", "Filter Type", "Frequency", "Gain", "Q"];

// Stereo uses only the A bands, but Live reports a switched-on B band as
// active, so a model edits the B side and hears nothing change.
const B_SIDE = Array.from({ length: 8 }, (_, i) => i + 1).flatMap((band) =>
  BAND_PARAMS.map((param) => `${band} ${param} B`),
);

export const eqEightSpec: SpecializedDeviceSpec = {
  displayNames: ["EQ Eight"],
  inactiveWhen: [{ controller: "globalMode", cases: { stereo: B_SIDE } }],
  params: [
    enumParam("globalMode", "global_mode", GLOBAL_MODES),
    {
      name: "oversample",
      read: (device) => readBoolProp(device, "oversample"),
      write: (device, value) =>
        writeBoolProp(device, "oversample", value, "oversample"),
    },
  ],
};
