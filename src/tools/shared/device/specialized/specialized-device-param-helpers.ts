// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { type PseudoParam } from "./specialized-device-types.ts";

// Shared read/write helpers for specialized-device pseudo-params. Most
// specialized state is a small int that maps to a stable string enum
// (Roar routing mode, EQ Eight global mode, ...), a boolean toggle, or a
// bounded / discrete-set integer. These helpers centralize the index↔label
// mapping, coercion, and warn-and-skip validation so each device spec stays
// declarative. See dev/Specialized-Devices.md.

/**
 * Read an int-indexed property and map it to its enum label.
 * @param device - LiveAPI device object
 * @param property - Live API property holding the int index
 * @param labels - User-facing labels in internal-index order
 * @returns The matching label, or undefined if the index is out of range
 */
export function readEnumByIndex(
  device: LiveAPI,
  property: string,
  labels: readonly string[],
): string | undefined {
  const index = device.getProperty(property) as number;

  return labels[index];
}

/**
 * Map an enum label to its index and write it to an int-indexed property.
 * Matching is case-insensitive and trims surrounding whitespace. Warns and
 * skips when the label isn't in the catalog.
 * @param device - LiveAPI device object
 * @param property - Live API property holding the int index
 * @param value - Incoming value (a label string)
 * @param labels - User-facing labels in internal-index order
 * @param paramName - Pseudo-param name for warning text
 */
export function writeEnumByIndex(
  device: LiveAPI,
  property: string,
  value: string | number,
  labels: readonly string[],
  paramName: string,
): void {
  const target = String(value).trim().toLowerCase();
  const index = labels.findIndex((label) => label.toLowerCase() === target);

  if (index < 0) {
    console.warn(
      `"${value}" is not a valid ${paramName}. Options: ${labels.join(", ")}`,
    );

    return;
  }

  device.set(property, index);
}

/**
 * Build a complete enum pseudo-param backed by an int-indexed Live property:
 * `options` exposes the labels, `read` maps the stored index to its label, and
 * `write` maps a label back to its index (warn-and-skip on an unknown label).
 * Collapses the otherwise-identical read/write wiring that every index↔label
 * control across the specialized device specs would repeat.
 * @param name - camelCase pseudo-param name
 * @param property - Live API int-indexed property backing it
 * @param labels - User-facing labels in internal-index order
 * @returns A ready-to-use enum PseudoParam
 */
export function enumParam(
  name: string,
  property: string,
  labels: readonly string[],
): PseudoParam {
  return {
    name,
    options: labels,
    read: (device) => readEnumByIndex(device, property, labels),
    write: (device, value) =>
      writeEnumByIndex(device, property, value, labels, name),
  };
}

/**
 * Read a boolean property (Live stores 0/1).
 * @param device - LiveAPI device object
 * @param property - Live API property name
 * @returns true when the property is > 0
 */
export function readBoolProp(device: LiveAPI, property: string): boolean {
  return (device.getProperty(property) as number) > 0;
}

/**
 * Coerce an input value to a boolean. Accepts true/false, on/off, yes/no,
 * 1/0 (string or number).
 * @param value - Incoming value
 * @returns The boolean, or null if uninterpretable
 */
export function coerceBool(value: string | number): boolean | null {
  if (typeof value === "number") {
    return value !== 0;
  }

  const lower = value.trim().toLowerCase();

  if (["true", "on", "yes", "1"].includes(lower)) {
    return true;
  }

  if (["false", "off", "no", "0"].includes(lower)) {
    return false;
  }

  return null;
}

/**
 * Write a boolean property, coercing the input. Warns and skips on
 * uninterpretable input.
 * @param device - LiveAPI device object
 * @param property - Live API property name
 * @param value - Incoming value
 * @param paramName - Pseudo-param name for warning text
 */
export function writeBoolProp(
  device: LiveAPI,
  property: string,
  value: string | number,
  paramName: string,
): void {
  const bool = coerceBool(value);

  if (bool == null) {
    console.warn(
      `"${value}" is not a valid ${paramName} (expected true/false)`,
    );

    return;
  }

  device.set(property, bool ? 1 : 0);
}

/**
 * Coerce an input value to an integer.
 * @param value - Incoming value
 * @returns The integer, or null if not an integer
 */
export function coerceInt(value: string | number): number | null {
  const num = typeof value === "number" ? value : Number(value);

  return Number.isInteger(num) ? num : null;
}

/**
 * Write an integer property constrained to an inclusive range. Warns and skips
 * when the value isn't an integer or falls outside the range (Live silently
 * reverts out-of-range writes, so we validate first).
 * @param device - LiveAPI device object
 * @param property - Live API property name
 * @param value - Incoming value
 * @param min - Minimum allowed (inclusive)
 * @param max - Maximum allowed (inclusive)
 * @param paramName - Pseudo-param name for warning text
 */
export function writeIntInRange(
  device: LiveAPI,
  property: string,
  value: string | number,
  min: number,
  max: number,
  paramName: string,
): void {
  const int = coerceInt(value);

  if (int == null || int < min || int > max) {
    console.warn(
      `${paramName} must be an integer ${min}-${max} (got "${value}")`,
    );

    return;
  }

  device.set(property, int);
}

/**
 * Write an integer property constrained to a discrete set of allowed values
 * (e.g. Simpler `voices`, Drift `voiceCount`). Warns and skips otherwise.
 * @param device - LiveAPI device object
 * @param property - Live API property name (an int index when `asIndex`)
 * @param value - Incoming value
 * @param allowed - Allowed values in catalog order
 * @param paramName - Pseudo-param name for warning text
 * @param asIndex - When true, write the catalog index instead of the value
 */
export function writeIntFromSet(
  device: LiveAPI,
  property: string,
  value: string | number,
  allowed: readonly number[],
  paramName: string,
  asIndex = false,
): void {
  const int = coerceInt(value);
  const pos = int == null ? -1 : allowed.indexOf(int);

  if (pos < 0) {
    console.warn(
      `${paramName} must be one of ${allowed.join(", ")} (got "${value}")`,
    );

    return;
  }

  device.set(property, asIndex ? pos : allowed[pos]);
}
