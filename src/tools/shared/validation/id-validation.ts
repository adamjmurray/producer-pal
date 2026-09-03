// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { type LiveObjectType } from "#src/types/live-object-types.ts";
import { targetLabel } from "./object-path-for-api.ts";

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
      `${toolName} failed: ${targetLabel(object)} is not a ${expectedType} (found ${object.type})`,
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
  options: ValidateIdTypesOptions = {},
): LiveAPI[] {
  return validateObjectTypes(
    ids.map((id) => ({ id, object: LiveAPI.from(id) })),
    expectedType,
    toolName,
    options,
  );
}

/** An id and the object it resolved to. */
export interface IdentifiedObject {
  id: string;
  object: LiveAPI;
}

/**
 * The same check as validateIdTypes, for a caller that already resolved the
 * ids. Resolving one twice is not free, and a tool with its own check to run
 * first would otherwise pay for both.
 * @param targets - Ids paired with the objects they resolved to
 * @param expectedType - Tool-level type (e.g., "track", "device", "drum-pad")
 * @param toolName - Name of calling tool for error messages
 * @param options - Validation options
 * @param options.skipInvalid - If true, log warnings and skip invalid objects
 * @returns Array of valid LiveAPI instances
 * @throws Only if skipInvalid=false and any object is invalid
 */
export function validateObjectTypes(
  targets: IdentifiedObject[],
  expectedType: string,
  toolName: string,
  { skipInvalid = false }: ValidateIdTypesOptions = {},
): LiveAPI[] {
  const validObjects: LiveAPI[] = [];

  for (const { id, object } of targets) {
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
          `${toolName}: ${targetLabel(object)} is not a ${expectedType} (found ${object.type})`,
        );
        continue;
      } else {
        throw new Error(
          `${toolName} failed: ${targetLabel(object)} is not a ${expectedType} (found ${object.type})`,
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
    case "chain":
      return actualType === "Chain" || actualType === "DrumChain";
    case "drum-pad":
      // DrumChain passes so a tool can reject it with advice about the pad it
      // sits on, rather than the generic type mismatch. A pad-level Live call
      // aimed at a chain is a silent no-op, so any tool letting one through
      // here must handle it — see delete's isRackChain and duplicate's
      // padTargetFromPad.
      return actualType === "DrumPad" || actualType === "DrumChain";
    default:
      return false;
  }
}
