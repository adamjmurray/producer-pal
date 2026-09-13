// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type PseudoParam } from "./specialized-device-types.ts";

// Read/write helpers for specialized-device pseudo-params. Specialized state is
// nearly always a small int behind a string enum, a boolean toggle, or a
// bounded or discrete-set integer, so the index↔label mapping, coercion and
// validation live here and each device spec stays declarative. A refused write
// answers with the reason, which becomes that param's own result entry.

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
 * Matching is case-insensitive and trims surrounding whitespace.
 * @param device - LiveAPI device object
 * @param property - Live API property holding the int index
 * @param value - Incoming value (a label string)
 * @param labels - User-facing labels in internal-index order
 * @param paramName - Pseudo-param name for the reason text
 * @returns Why the label was refused, or null when it was written
 */
export function writeEnumByIndex(
  device: LiveAPI,
  property: string,
  value: string | number,
  labels: readonly string[],
  paramName: string,
): string | null {
  const target = String(value).trim().toLowerCase();
  const index = labels.findIndex((label) => label.toLowerCase() === target);

  if (index < 0) {
    return `"${value}" is not a valid ${paramName}. Options: ${labels.join(", ")}`;
  }

  device.set(property, index);

  return null;
}

/**
 * Build a whole enum pseudo-param over an int-indexed Live property: `options`
 * exposes the labels, `read` maps the stored index to one, and `write` maps a
 * label back (refusing an unknown one).
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
 * Read a numeric property.
 * @param device - LiveAPI device object
 * @param property - Live API property name
 * @returns The value
 */
export function readNumberProp(
  device: LiveAPI,
  property: string,
): number | undefined {
  return device.getProperty(property) as number | undefined;
}

/**
 * Read an int-indexed property and map it to its catalog value — the read side
 * of {@link writeIntFromSet} with `asIndex`.
 * @param device - LiveAPI device object
 * @param property - Live API property holding the int index
 * @param catalog - Values in internal-index order
 * @returns The matching value, or undefined if the index is out of range
 */
export function readNumberByIndex(
  device: LiveAPI,
  property: string,
  catalog: readonly number[],
): number | undefined {
  const index = device.getProperty(property) as number;

  return catalog[index];
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
 * Write a boolean property, coercing the input.
 * @param device - LiveAPI device object
 * @param property - Live API property name
 * @param value - Incoming value
 * @param paramName - Pseudo-param name for the reason text
 * @returns Why the value was refused, or null when it was written
 */
export function writeBoolProp(
  device: LiveAPI,
  property: string,
  value: string | number,
  paramName: string,
): string | null {
  const bool = coerceBool(value);

  if (bool == null) {
    return `"${value}" is not a valid ${paramName} (expected true/false)`;
  }

  device.set(property, bool ? 1 : 0);

  return null;
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
 * Write an integer property constrained to an inclusive range. Refuses a value
 * that isn't an integer or falls outside the range (Live silently reverts
 * out-of-range writes, so we validate first).
 * @param device - LiveAPI device object
 * @param property - Live API property name
 * @param value - Incoming value
 * @param min - Minimum allowed (inclusive)
 * @param max - Maximum allowed (inclusive)
 * @param paramName - Pseudo-param name for the reason text
 * @returns Why the value was refused, or null when it was written
 */
export function writeIntInRange(
  device: LiveAPI,
  property: string,
  value: string | number,
  min: number,
  max: number,
  paramName: string,
): string | null {
  const int = coerceInt(value);

  if (int == null || int < min || int > max) {
    return `${paramName} must be an integer ${min}-${max} (got "${value}")`;
  }

  device.set(property, int);

  return null;
}

/**
 * Write an integer property constrained to a discrete set of allowed values
 * (e.g. Simpler `voices`, Drift `voiceCount`). Refuses anything else.
 * @param device - LiveAPI device object
 * @param property - Live API property name (an int index when `asIndex`)
 * @param value - Incoming value
 * @param allowed - Allowed values in catalog order
 * @param paramName - Pseudo-param name for the reason text
 * @param asIndex - When true, write the catalog index instead of the value
 * @returns Why the value was refused, or null when it was written
 */
export function writeIntFromSet(
  device: LiveAPI,
  property: string,
  value: string | number,
  allowed: readonly number[],
  paramName: string,
  asIndex = false,
): string | null {
  const int = coerceInt(value);
  const pos = int == null ? -1 : allowed.indexOf(int);

  if (pos < 0) {
    return `${paramName} must be one of ${allowed.join(", ")} (got "${value}")`;
  }

  device.set(property, asIndex ? pos : allowed[pos]);

  return null;
}
