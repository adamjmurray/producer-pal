// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  readBoolProp,
  readEnumByIndex,
  writeBoolProp,
  writeEnumByIndex,
  writeIntFromSet,
  writeIntInRange,
} from "../specialized-device-param-helpers.ts";
import { type SpecializedDeviceSpec } from "../specialized-device-types.ts";

// Spectral Resonator (SpectralResonatorDevice, class_name "Transmute").
// AJM-378. See dev/Specialized-Devices.md.
//
// Enum index→label mappings and the polyphony count set were verified against
// Live 12.4's UI (2026-05-22). pitchMode (pitch_mode) is the Hz/Note selector
// next to the Freq dial. Live silently reverts out-of-range writes, so we
// pre-validate ranges before calling device.set.

// User-facing mono/poly labels in internal-index order.
const MONO_POLY_LABELS = ["mono", "poly"] as const;

// mod_mode index → label (the Mod section's effect selector).
const MOD_MODES = ["None", "Chorus", "Wander", "Granular"] as const;

// pitch_mode index → label (the frequency dial's Hz/Note mode).
const PITCH_MODES = ["Hertz", "MIDI Note"] as const;

// polyphony index → voice count (the count box next to the Poly toggle).
const POLYPHONY_COUNTS = [2, 4, 8, 16] as const;

/**
 * Read pitch_bend_range from the device.
 * @param device - LiveAPI device object
 * @returns The pitch bend range in semitones
 */
function readPitchBendRange(device: LiveAPI): number {
  return device.getProperty("pitch_bend_range") as number;
}

/**
 * Read the polyphony voice count (maps the polyphony index to its count value).
 * @param device - LiveAPI device object
 * @returns The voice count (2, 4, 8, or 16)
 */
function readPolyphony(device: LiveAPI): number | undefined {
  const index = device.getProperty("polyphony") as number;

  return POLYPHONY_COUNTS[index];
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
      options: MONO_POLY_LABELS,
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
      options: "0-24",
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
      options: MOD_MODES,
      read: (device) => readEnumByIndex(device, "mod_mode", MOD_MODES),
      write: (device, value, toolName) =>
        writeEnumByIndex(
          device,
          "mod_mode",
          value,
          MOD_MODES,
          toolName,
          "modMode",
        ),
    },
    {
      name: "pitchMode",
      options: PITCH_MODES,
      read: (device) => readEnumByIndex(device, "pitch_mode", PITCH_MODES),
      write: (device, value, toolName) =>
        writeEnumByIndex(
          device,
          "pitch_mode",
          value,
          PITCH_MODES,
          toolName,
          "pitchMode",
        ),
    },
    {
      name: "polyphony",
      options: POLYPHONY_COUNTS,
      read: readPolyphony,
      write: (device, value, toolName) =>
        writeIntFromSet(
          device,
          "polyphony",
          value,
          POLYPHONY_COUNTS,
          toolName,
          "polyphony",
          true,
        ),
    },
  ],
};
