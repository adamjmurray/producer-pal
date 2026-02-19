// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import { type LiveObjectType } from "#src/types/live-object-types.ts";

/**
 * Validates a single ID matches expected type
 * @param id - The ID to validate
 * @param expectedType - Tool-level type (e.g., "track", "device", "drum-pad")
 * @param toolName - Name of calling tool for error messages
 * @returns The LiveAPI instance for the validated ID
 * @throws If ID doesn't exist or type doesn't match
 */
export function validateIdType(
  id: string,
  expectedType: string,
  toolName: string,
): LiveAPI {
  const object = LiveAPI.from(id);

  if (!object.exists()) {
    throw new Error(`${toolName} failed: id "${id}" does not exist`);
  }

  if (!isTypeMatch(object.type, expectedType)) {
    throw new Error(
      `${toolName} failed: id "${id}" is not a ${expectedType} (found ${object.type})`,
    );
  }

  return object;
}

interface ValidateIdTypesOptions {
  skipInvalid?: boolean;
}

/**
 * Validates multiple IDs match expected type
 * @param ids - Array of IDs to validate
 * @param expectedType - Tool-level type (e.g., "track", "device", "drum-pad")
 * @param toolName - Name of calling tool for error messages
 * @param options - Validation options
 * @param options.skipInvalid - If true, log warnings and skip invalid IDs
 * @returns Array of valid LiveAPI instances
 * @throws Only if skipInvalid=false and any ID is invalid
 */
export function validateIdTypes(
  ids: string[],
  expectedType: string,
  toolName: string,
  { skipInvalid = false }: ValidateIdTypesOptions = {},
): LiveAPI[] {
  const validObjects: LiveAPI[] = [];

  for (const id of ids) {
    const object = LiveAPI.from(id);

    // Check existence
    if (!object.exists()) {
      if (skipInvalid) {
        console.warn(`${toolName}: id "${id}" does not exist`);
        continue;
      } else {
        throw new Error(`${toolName} failed: id "${id}" does not exist`);
      }
    }

    if (!isTypeMatch(object.type, expectedType)) {
      if (skipInvalid) {
        console.warn(
          `${toolName}: id "${id}" is not a ${expectedType} (found ${object.type})`,
        );
        continue;
      } else {
        throw new Error(
          `${toolName} failed: id "${id}" is not a ${expectedType} (found ${object.type})`,
        );
      }
    }

    validObjects.push(object);
  }

  return validObjects;
}

/**
 * Validates that exactly one of two mutually exclusive parameters is provided
 * @param param1 - First parameter value
 * @param param2 - Second parameter value
 * @param name1 - Name of first parameter for error message
 * @param name2 - Name of second parameter for error message
 * @throws If neither or both parameters are provided
 */
export function validateExclusiveParams(
  param1: unknown,
  param2: unknown,
  name1: string,
  name2: string,
): void {
  if (!param1 && !param2) {
    throw new Error(`Either ${name1} or ${name2} must be provided`);
  }

  if (param1 && param2) {
    throw new Error(`Provide either ${name1} or ${name2}, not both`);
  }
}

/**
 * Checks if the Live API type matches the expected tool-level type.
 * Handles device subclasses (e.g., "HybridReverbDevice" matches "device").
 * @param actualType - The Live API object type (e.g., "Track", "Eq8Device")
 * @param expectedType - The tool-level type (e.g., "track", "device", "drum-pad")
 * @returns True if types match
 */
function isTypeMatch(
  actualType: LiveObjectType,
  expectedType: string,
): boolean {
  switch (expectedType) {
    case "track":
      return actualType === "Track";
    case "scene":
      return actualType === "Scene";
    case "clip":
      return actualType === "Clip";
    case "device":
      return actualType.endsWith("Device");
    case "drum-pad":
      return actualType === "DrumPad" || actualType === "DrumChain";
    default:
      return false;
  }
}
