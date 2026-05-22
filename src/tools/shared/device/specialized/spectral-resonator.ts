// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  readBoolProp,
  readEnumByIndex,
  writeBoolProp,
  writeEnumByIndex,
  writeIntInRange,
} from "./specialized-device-param-helpers.ts";
import { type SpecializedDeviceSpec } from "./specialized-device-types.ts";

// Spectral Resonator (SpectralResonatorDevice, class_name "Transmute").
// AJM-378. See dev/plans/Specialized-Device-Classes.md.
//
// frequency_dial_mode is deliberately NOT exposed — it is a UI display selector
// (Hz vs Note). Both "Freq. Hz" and "Note" are directly addressable as
// DeviceParameters.
//
// Live silently reverts out-of-range writes, so we pre-validate against the
// documented ranges before calling device.set.

// User-facing mono/poly labels in internal-index order.
const MONO_POLY_LABELS = ["mono", "poly"] as const;

/**
 * Read pitch_bend_range from the device.
 * @param device - LiveAPI device object
 * @returns The pitch bend range in semitones
 */
function readPitchBendRange(device: LiveAPI): number {
  return device.getProperty("pitch_bend_range") as number;
}

/**
 * Read mod_mode from the device.
 * @param device - LiveAPI device object
 * @returns The mod mode integer (0-3)
 */
function readModMode(device: LiveAPI): number {
  // TODO(AJM-378): map to a string enum once value semantics are verified against Live's UI
  return device.getProperty("mod_mode") as number;
}

/**
 * Read pitch_mode from the device.
 * @param device - LiveAPI device object
 * @returns The pitch mode integer (0-1)
 */
function readPitchMode(device: LiveAPI): number {
  // TODO(AJM-378): map to a string enum once value semantics are verified against Live's UI
  return device.getProperty("pitch_mode") as number;
}

/**
 * Read polyphony from the device.
 * @param device - LiveAPI device object
 * @returns The polyphony integer (0-3)
 */
function readPolyphony(device: LiveAPI): number {
  // TODO(AJM-378): map to a string enum once value semantics are verified against Live's UI
  return device.getProperty("polyphony") as number;
}

export const spectralResonatorSpec: SpecializedDeviceSpec = {
  displayNames: ["Spectral Resonator"],
  params: [
    {
      name: "midiGate",
      read: (device) => readBoolProp(device, "midi_gate"),
      write: (device, value, toolName) =>
        writeBoolProp(device, "midi_gate", value, toolName, "midiGate"),
    },
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
      name: "pitchBendRange",
      read: readPitchBendRange,
      write: (device, value, toolName) =>
        writeIntInRange(
          device,
          "pitch_bend_range",
          value,
          0,
          24,
          toolName,
          "pitchBendRange",
        ),
    },
    {
      name: "modMode",
      read: readModMode,
      write: (device, value, toolName) =>
        writeIntInRange(device, "mod_mode", value, 0, 3, toolName, "modMode"),
    },
    {
      name: "pitchMode",
      read: readPitchMode,
      write: (device, value, toolName) =>
        writeIntInRange(
          device,
          "pitch_mode",
          value,
          0,
          1,
          toolName,
          "pitchMode",
        ),
    },
    {
      name: "polyphony",
      read: readPolyphony,
      write: (device, value, toolName) =>
        writeIntInRange(
          device,
          "polyphony",
          value,
          0,
          3,
          toolName,
          "polyphony",
        ),
    },
  ],
};
