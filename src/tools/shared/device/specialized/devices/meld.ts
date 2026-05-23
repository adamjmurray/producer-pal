// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  readEnumByIndex,
  writeEnumByIndex,
  writeIntInRange,
} from "../specialized-device-param-helpers.ts";
import { type SpecializedDeviceSpec } from "../specialized-device-types.ts";

// Meld (MeldDevice, class_name "InstrumentMeld"). Exposes its polyphony mode
// and voice-count controls at the class level — none are reachable as
// DeviceParameters. AJM-376. See dev/Specialized-Devices.md.
//
// selected_engine is deliberately NOT exposed — it is a UI-only display
// selector. Both A and B engine parameters are always addressable via A * / B *
// DeviceParameters regardless of selected_engine.
//
// Live silently reverts out-of-range writes, so we pre-validate against the
// documented ranges before calling device.set.

// User-facing monophony/polyphony labels in internal-index order.
const MONO_POLY_LABELS = ["mono", "poly"] as const;

/**
 * Read poly_voices from the device.
 * @param device - LiveAPI device object
 * @returns The poly voice count
 */
function readPolyVoices(device: LiveAPI): number {
  return device.getProperty("poly_voices") as number;
}

/**
 * Read unison_voices from the device.
 * @param device - LiveAPI device object
 * @returns The unison voice count
 */
function readUnisonVoices(device: LiveAPI): number {
  return device.getProperty("unison_voices") as number;
}

export const meldSpec: SpecializedDeviceSpec = {
  displayNames: ["Meld"],
  params: [
    {
      name: "monoPoly",
      read: (device) => readEnumByIndex(device, "mono_poly", MONO_POLY_LABELS),
      write: (device, value, toolName) =>
        writeEnumByIndex(
          device,
          "mono_poly",
          value,
          MONO_POLY_LABELS,
          toolName,
          "monoPoly",
        ),
    },
    {
      name: "polyVoices",
      read: readPolyVoices,
      write: (device, value, toolName) =>
        writeIntInRange(
          device,
          "poly_voices",
          value,
          1,
          6,
          toolName,
          "polyVoices",
        ),
    },
    {
      name: "unisonVoices",
      read: readUnisonVoices,
      write: (device, value, toolName) =>
        writeIntInRange(
          device,
          "unison_voices",
          value,
          0,
          2,
          toolName,
          "unisonVoices",
        ),
    },
  ],
};
