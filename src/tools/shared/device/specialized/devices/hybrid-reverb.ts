// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { readBoolProp, writeBoolProp } from "../specialized-param-access.ts";
import { type SpecializedDeviceSpec } from "../specialized-device-types.ts";

// Hybrid Reverb (HybridReverbDevice). See
// dev/specialized-devices/audio-effects.md.
// Convolution IR library: category + file selectors plus IR shaping controls.
// Category names use underscores as word separators in the Live API (e.g.,
// "Early_Reflections"); user-facing names use spaces. File names already
// contain spaces — no transformation.

const EMPTY_FILE_SENTINEL = "<empty>";

/**
 * Read the IR category list from the device as a string array.
 * @param device - LiveAPI device object
 * @returns Array of category name strings (underscore-separated)
 */
function readCategoryList(device: LiveAPI): string[] {
  return device.getPropertyList("ir_category_list") as string[];
}

/**
 * Read the IR file list from the device as a string array.
 * @param device - LiveAPI device object
 * @returns Array of file name strings (may contain sentinel "<empty>")
 */
function readFileList(device: LiveAPI): string[] {
  return device.getPropertyList("ir_file_list") as string[];
}

/**
 * Read the current IR category as a user-facing (space-separated) string.
 * @param device - LiveAPI device object
 * @returns Category name with spaces, or undefined if index is out of range
 */
function readIrCategory(device: LiveAPI): string | undefined {
  const list = readCategoryList(device);
  const index = device.getProperty("ir_category_index") as number;
  const raw = list[index];

  return raw != null ? raw.replaceAll("_", " ") : undefined;
}

/**
 * Write an IR category by name (space-separated). Translates to underscores,
 * finds the index in ir_category_list, and sets ir_category_index.
 * @param device - LiveAPI device object
 * @param value - User-facing category name (spaces)
 * @returns Why the category was refused, or null when it was written
 */
function writeIrCategory(
  device: LiveAPI,
  value: string | number,
): string | null {
  const list = readCategoryList(device);
  const raw = String(value).replaceAll(" ", "_");
  const index = list.indexOf(raw);

  if (index < 0) {
    const available = list.map((s) => s.replaceAll("_", " ")).join(", ");

    return `"${value}" is not a valid irCategory. Available: ${available}`;
  }

  device.set("ir_category_index", index);

  return null;
}

/**
 * Read the current IR file name. Returns undefined when the file list contains
 * only the "<empty>" sentinel (i.e., empty "User" category).
 * @param device - LiveAPI device object
 * @returns File name string, or undefined when no files exist
 */
function readIrFile(device: LiveAPI): string | undefined {
  const list = readFileList(device);
  const index = device.getProperty("ir_file_index") as number;
  const value = list[index];

  if (value == null || value === EMPTY_FILE_SENTINEL) {
    return undefined;
  }

  return value;
}

/**
 * Write an IR file by name. Refuses a file that isn't in the current category,
 * or a category with no files (sentinel only).
 * @param device - LiveAPI device object
 * @param value - File name to select
 * @returns Why the file was refused, or null when it was written
 */
function writeIrFile(device: LiveAPI, value: string | number): string | null {
  const list = readFileList(device);

  if (list.length === 1 && list[0] === EMPTY_FILE_SENTINEL) {
    return `irFile cannot be set — current category has no files`;
  }

  const fileName = String(value);
  const index = list.indexOf(fileName);

  if (index < 0) {
    return `"${fileName}" is not a valid irFile in the current category`;
  }

  device.set("ir_file_index", index);

  return null;
}

/**
 * Write a float IR shaping parameter. Refuses non-finite input. Live silently
 * clamps out-of-range floats, so we just coerce and pass through.
 * @param device - LiveAPI device object
 * @param property - Live API property name
 * @param value - Incoming value
 * @param paramName - Pseudo-param name for the reason text
 * @returns Why the value was refused, or null when it was written
 */
function writeIrFloat(
  device: LiveAPI,
  property: string,
  value: string | number,
  paramName: string,
): string | null {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return `${paramName} must be a number (got "${value}")`;
  }

  device.set(property, n);

  return null;
}

export const hybridReverbSpec: SpecializedDeviceSpec = {
  displayNames: ["Hybrid Reverb"],
  params: [
    {
      name: "irCategory",
      read: readIrCategory,
      write: writeIrCategory,
    },
    {
      name: "irFile",
      read: readIrFile,
      write: writeIrFile,
    },
    {
      name: "irAttackTime",
      read: (device) => device.getProperty("ir_attack_time"),
      write: (device, value) =>
        writeIrFloat(device, "ir_attack_time", value, "irAttackTime"),
    },
    {
      name: "irDecayTime",
      read: (device) => device.getProperty("ir_decay_time"),
      write: (device, value) =>
        writeIrFloat(device, "ir_decay_time", value, "irDecayTime"),
    },
    {
      name: "irSizeFactor",
      read: (device) => device.getProperty("ir_size_factor"),
      write: (device, value) =>
        writeIrFloat(device, "ir_size_factor", value, "irSizeFactor"),
    },
    {
      name: "irTimeShapingOn",
      read: (device) => readBoolProp(device, "ir_time_shaping_on"),
      write: (device, value) =>
        writeBoolProp(device, "ir_time_shaping_on", value, "irTimeShapingOn"),
    },
  ],
  readOptions(device) {
    // Categories use underscores internally; surface user-facing (spaced) names
    // so the LLM can switch categories without first guessing a valid name.
    const irCategoryList = readCategoryList(device).map((c) =>
      c.replaceAll("_", " "),
    );
    const irFileList = readFileList(device).filter(
      (f) => f !== EMPTY_FILE_SENTINEL,
    );

    return { irCategoryList, irFileList };
  },
};
