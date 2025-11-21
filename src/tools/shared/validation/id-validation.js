import * as console from "../../../shared/v8-max-console.js";

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

  // Live API returns "Track", user passes "track" - normalize both sides for comparison
  if (object.type.toLowerCase() !== expectedType.toLowerCase()) {
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

    // Check type match
    if (object.type.toLowerCase() !== expectedType.toLowerCase()) {
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
