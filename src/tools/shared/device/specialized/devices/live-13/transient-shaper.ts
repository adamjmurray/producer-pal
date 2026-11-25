// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type SpecializedDeviceSpec } from "../../specialized-device-types.ts";

// Transient Shaper (Live 13, generic Device, class_name "TransientShaper").
// Max lists 8 params: Device On, Attack, Sustain, Soft Clip On, Dry/Wet, S/C Emph
// Type, S/C Gain, S/C On. The sidechain ones only act while `S/C On` is on.
// See dev/live-api/specialized-devices/live-13-devices.md.

export const transientShaperSpec: SpecializedDeviceSpec = {
  displayNames: [],
  classNames: ["TransientShaper"],
  params: [],
  inactiveWhen: [
    { controller: "S/C On", cases: { Off: ["S/C Gain", "S/C Emph Type"] } },
  ],
};
