// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  enumParam,
  readNumberProp,
  writeIntInRange,
} from "../specialized-param-access.ts";
import { type SpecializedDeviceSpec } from "../specialized-device-types.ts";

// Meld (MeldDevice, class_name "InstrumentMeld"). Exposes its polyphony mode
// and voice-count controls at the class level — none are reachable as
// DeviceParameters. See dev/specialized-devices/instruments.md.
//
// selected_engine is deliberately NOT exposed — it is a UI-only display
// selector. Both A and B engine parameters are always addressable via A * / B *
// DeviceParameters regardless of selected_engine.
//
// Live silently reverts out-of-range writes, so we pre-validate against the
// documented ranges before calling device.set.

// User-facing monophony/polyphony labels in internal-index order.
const MONO_POLY_LABELS = ["mono", "poly"] as const;

export const meldSpec: SpecializedDeviceSpec = {
  displayNames: ["Meld"],
  params: [
    enumParam("monoPoly", "mono_poly", MONO_POLY_LABELS),
    {
      name: "polyVoices",
      options: "1-6",
      read: (device) => readNumberProp(device, "poly_voices"),
      write: (device, value) =>
        writeIntInRange(device, "poly_voices", value, 1, 6, "polyVoices"),
    },
    {
      name: "unisonVoices",
      options: "0-2",
      read: (device) => readNumberProp(device, "unison_voices"),
      write: (device, value) =>
        writeIntInRange(device, "unison_voices", value, 0, 2, "unisonVoices"),
    },
  ],
};
