import * as console from "#src/shared/v8-max-console.ts";

/**
 * Validates a single ID matches expected type
 * @param id - The ID to validate
 * @param expectedType - Expected Live API type (case-insensitive)
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
 * @param expectedType - Expected Live API type (case-insensitive)
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
 * Checks if the actual type matches the expected type.
 * Handles device subclasses (e.g., "HybridReverbDevice" matches "device").
 * @param actualType - The actual type from the Live API object
 * @param expectedType - The expected type to match against
 * @returns True if types match
 */
function isTypeMatch(actualType: string, expectedType: string): boolean {
  const actual = actualType.toLowerCase();
  const expected = expectedType.toLowerCase();

  if (actual === expected) return true;

  // Device subclass match: "hybridreverbdevice" matches "device"
  if (expected === "device" && actual.endsWith("device")) return true;

  // DrumPad/DrumChain match: both "drumpad" and "drumchain" match "drum-pad"
  // Drum pads are now represented as chains with in_note property
  if (
    expected === "drum-pad" &&
    (actual === "drumpad" || actual === "drumchain")
  )
    return true;

  return false;
}
