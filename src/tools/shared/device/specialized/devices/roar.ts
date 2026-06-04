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

// Roar (RoarDevice, class_name "Roar"). Exposes its processing-topology
// selector and an envelope-audition toggle at the class level — neither is
// reachable as a DeviceParameter. AJM-379. See
// dev/Specialized-Devices.md.
//
// This is the reference implementation for the simplest device shape:
// stable enum + boolean pseudo-params, no actions/options/modulations.

// User-facing routing-mode labels in internal-index order. The Live API
// `routing_mode_list` (RO) is the stable 7-value catalog
// ["Single","Serial","Parallel","Multi Band","Mid Side","Feedback","Delay"];
// these are the lowercased/hyphenated user-facing equivalents.
const ROUTING_MODES = [
  "single",
  "serial",
  "parallel",
  "multi-band",
  "mid-side",
  "feedback",
  "delay",
] as const;

export const roarSpec: SpecializedDeviceSpec = {
  displayNames: ["Roar"],
  params: [
    enumParam("routingMode", "routing_mode_index", ROUTING_MODES),
    {
      name: "envListen",
      read: (device) => readBoolProp(device, "env_listen"),
      write: (device, value, toolName) =>
        writeBoolProp(device, "env_listen", value, toolName, "envListen"),
    },
  ],
};
