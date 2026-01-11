import * as console from "#src/shared/v8-max-console.js";

/**
 * Validates a single ID matches expected type
 * @param {string} id - The ID to validate
 * @param {string} expectedType - Expected Live API type (case-insensitive, e.g., "track", "scene", "clip", "device")
 * @param {string} toolName - Name of calling tool for error messages (e.g., "updateTrack")
 * @returns {LiveAPI} The LiveAPI instance for the validated ID
 * @throws {Error} If ID doesn't exist or type doesn't match
 */
export function validateIdType(id, expectedType, toolName) {
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

/**
 * Validates multiple IDs match expected type
 * @param {Array<string>} ids - Array of IDs to validate
 * @param {string} expectedType - Expected Live API type (case-insensitive)
 * @param {string} toolName - Name of calling tool for error messages
 * @param {object} [options={}] - Validation options
 * @param {boolean} [options.skipInvalid=false] - If true, log warnings and skip invalid IDs; if false, throw on first error
 * @returns {Array<LiveAPI>} Array of valid LiveAPI instances (may be empty if skipInvalid=true and all IDs are invalid)
 * @throws {Error} Only if skipInvalid=false and any ID is invalid
 */
export function validateIdTypes(
  ids,
  expectedType,
  toolName,
  { skipInvalid = false } = {},
) {
  const validObjects = [];

  for (const id of ids) {
    const object = LiveAPI.from(id);

    // Check existence
    if (!object.exists()) {
      if (skipInvalid) {
        console.error(`${toolName}: id "${id}" does not exist`);
        continue;
      } else {
        throw new Error(`${toolName} failed: id "${id}" does not exist`);
      }
    }

    if (!isTypeMatch(object.type, expectedType)) {
      if (skipInvalid) {
        console.error(
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
 * @param {*} param1 - First parameter value
 * @param {*} param2 - Second parameter value
 * @param {string} name1 - Name of first parameter for error message
 * @param {string} name2 - Name of second parameter for error message
 * @throws {Error} If neither or both parameters are provided
 */
export function validateExclusiveParams(param1, param2, name1, name2) {
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
 * @param {string} actualType - The actual type from the Live API object
 * @param {string} expectedType - The expected type to match against
 * @returns {boolean} True if types match
 */
function isTypeMatch(actualType, expectedType) {
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
