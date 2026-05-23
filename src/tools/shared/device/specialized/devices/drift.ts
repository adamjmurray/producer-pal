// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  readEnumByIndex,
  writeEnumByIndex,
  writeIntFromSet,
  writeIntInRange,
} from "../specialized-device-param-helpers.ts";
import {
  type PseudoParam,
  type SpecializedDeviceSpec,
} from "../specialized-device-types.ts";

// Drift (DriftDevice, class_name "Drift"). AJM-374. See
// dev/Specialized-Devices.md.
// Declarative mod matrix: each slot is an int `_index` property; the value
// lists are stable, hardcoded. Modulation amounts are regular DeviceParameters
// and are NOT duplicated here.

const SOURCES = [
  "Env 1",
  "Env 2",
  "LFO",
  "Key",
  "Vel",
  "Mod",
  "Press",
  "Slide",
] as const;

const TARGETS = [
  "None",
  "Osc 1 Gain",
  "Osc 1 Shape",
  "Osc 2 Gain",
  "Osc 2 Detune",
  "Noise Gain",
  "LP Frequency",
  "LP Resonance",
  "HP Frequency",
  "LFO Rate",
  "Cyc Env Rate",
  "Main Volume",
] as const;

const VOICE_MODES = ["Poly", "Mono", "Stereo", "Unison"] as const;

const VOICE_COUNTS = [4, 8, 16, 24, 32] as const;

/**
 * Build a pseudo-param backed by a stable string enum via an `_index` property.
 * @param name - Camel-case param name
 * @param property - Live API property name (the `_index` int)
 * @param labels - Enum labels in index order
 * @returns A PseudoParam for the slot
 */
function enumParam(
  name: string,
  property: string,
  labels: readonly string[],
): PseudoParam {
  return {
    name,
    read: (device) => readEnumByIndex(device, property, labels),
    write: (device, value, toolName) =>
      writeEnumByIndex(device, property, value, labels, toolName, name),
  };
}

/**
 * Build a source pseudo-param for one of the 3 free mod-matrix slots. Reads are
 * omitted when the paired target is "None" (the slot is disabled) — otherwise a
 * source value implies an active route that isn't there (AJM-391). Writes still
 * set the source independently, so a source can be staged before its target.
 * @param name - Camel-case param name
 * @param sourceProperty - The source `_index` property for this slot
 * @param targetProperty - The paired target `_index` property for this slot
 * @returns A PseudoParam for the free-slot source
 */
function freeSlotSourceParam(
  name: string,
  sourceProperty: string,
  targetProperty: string,
): PseudoParam {
  return {
    name,
    read: (device) => {
      if (readEnumByIndex(device, targetProperty, TARGETS) === "None") {
        return;
      }

      return readEnumByIndex(device, sourceProperty, SOURCES);
    },
    write: (device, value, toolName) =>
      writeEnumByIndex(device, sourceProperty, value, SOURCES, toolName, name),
  };
}

/**
 * Read the voice count from voice_count_index (returns the count value, not the
 * index).
 * @param device - LiveAPI device object
 * @returns The voice count (4, 8, 16, 24, or 32)
 */
function readVoiceCount(device: LiveAPI): number | undefined {
  const index = device.getProperty("voice_count_index") as number;

  return VOICE_COUNTS[index];
}

/**
 * Write the voice count by writing its catalog index to voice_count_index.
 * Warns and skips when the value is not in the allowed set.
 * @param device - LiveAPI device object
 * @param value - Incoming value (must be 4, 8, 16, 24, or 32)
 * @param toolName - Calling tool name for warning prefix
 */
function writeVoiceCount(
  device: LiveAPI,
  value: string | number,
  toolName: string,
): void {
  writeIntFromSet(
    device,
    "voice_count_index",
    value,
    VOICE_COUNTS,
    toolName,
    "voiceCount",
    true,
  );
}

// pitch_bend_range accepts integers 0-12. Live silently REVERTS out-of-range
// writes (verified vs Live 12.4 2026-05-23 — it does NOT clamp), so we
// pre-validate the range before device.set, matching Spectral Resonator.
const PITCH_BEND_RANGE_MIN = 0;
const PITCH_BEND_RANGE_MAX = 12;

/**
 * Read pitch_bend_range from the device.
 * @param device - LiveAPI device object
 * @returns The pitch bend range in semitones
 */
function readPitchBendRange(device: LiveAPI): number {
  return device.getProperty("pitch_bend_range") as number;
}

export const driftSpec: SpecializedDeviceSpec = {
  displayNames: ["Drift"],
  params: [
    // Source slots — fixed targets (filter, LFO, pitch, shape)
    enumParam("filterMod1Source", "mod_matrix_filter_source_1_index", SOURCES),
    enumParam("filterMod2Source", "mod_matrix_filter_source_2_index", SOURCES),
    enumParam("lfoSource", "mod_matrix_lfo_source_index", SOURCES),
    enumParam("pitchMod1Source", "mod_matrix_pitch_source_1_index", SOURCES),
    enumParam("pitchMod2Source", "mod_matrix_pitch_source_2_index", SOURCES),
    enumParam("shapeSource", "mod_matrix_shape_source_index", SOURCES),
    // Source slots — three free slots (omitted from reads when the paired
    // target is "None", i.e. the slot is disabled)
    freeSlotSourceParam(
      "mod1Source",
      "mod_matrix_source_1_index",
      "mod_matrix_target_1_index",
    ),
    freeSlotSourceParam(
      "mod2Source",
      "mod_matrix_source_2_index",
      "mod_matrix_target_2_index",
    ),
    freeSlotSourceParam(
      "mod3Source",
      "mod_matrix_source_3_index",
      "mod_matrix_target_3_index",
    ),
    // Target slots — three free slots ("None" disables the slot)
    enumParam("mod1Target", "mod_matrix_target_1_index", TARGETS),
    enumParam("mod2Target", "mod_matrix_target_2_index", TARGETS),
    enumParam("mod3Target", "mod_matrix_target_3_index", TARGETS),
    // Voice / pitch config
    enumParam("voiceMode", "voice_mode_index", VOICE_MODES),
    {
      name: "voiceCount",
      read: readVoiceCount,
      write: writeVoiceCount,
    },
    {
      name: "pitchBendRange",
      read: readPitchBendRange,
      write: (device, value, toolName) =>
        writeIntInRange(
          device,
          "pitch_bend_range",
          value,
          PITCH_BEND_RANGE_MIN,
          PITCH_BEND_RANGE_MAX,
          toolName,
          "pitchBendRange",
        ),
    },
  ],
};
