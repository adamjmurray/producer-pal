import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.js";

/**
 * Generate a stable locator ID from a locator's index
 * @param {number} locatorIndex - The index of the locator in the cue_points array
 * @returns {string} Locator ID in format "locator-{index}"
 */
export function getLocatorId(locatorIndex) {
  return `locator-${locatorIndex}`;
}

/**
 * Read all locators from the Live Set
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {Array<{id: string, name: string, time: string}>} Array of locator objects
 */
export function readLocators(liveSet, timeSigNumerator, timeSigDenominator) {
  const locatorIds = liveSet.getChildIds("cue_points");
  /** @type {Array<{id: string, name: string, time: string}>} */
  const locators = [];

  for (let i = 0; i < locatorIds.length; i++) {
    const locator = LiveAPI.from(/** @type {string} */ (locatorIds[i]));
    const name = /** @type {string} */ (locator.getProperty("name"));
    const timeInBeats = /** @type {number} */ (locator.getProperty("time"));
    const timeFormatted = abletonBeatsToBarBeat(
      timeInBeats,
      timeSigNumerator,
      timeSigDenominator,
    );

    locators.push({
      id: getLocatorId(i),
      name,
      time: timeFormatted,
    });
  }

  return locators;
}

/**
 * Find a locator by ID or time position
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {object} options - Search options
 * @param {string} [options.locatorId] - Locator ID to find (e.g., "locator-0")
 * @param {number} [options.timeInBeats] - Exact time position in beats
 * @returns {{locator: LiveAPI, index: number} | null} Locator object and index, or null if not found
 */
export function findLocator(liveSet, { locatorId, timeInBeats }) {
  const locatorIds = liveSet.getChildIds("cue_points");

  for (let i = 0; i < locatorIds.length; i++) {
    const locator = LiveAPI.from(/** @type {string} */ (locatorIds[i]));

    if (locatorId != null && getLocatorId(i) === locatorId) {
      return { locator, index: i };
    }

    if (timeInBeats != null) {
      const locatorTime = /** @type {number} */ (locator.getProperty("time"));

      if (Math.abs(locatorTime - timeInBeats) < 0.001) {
        return { locator, index: i };
      }
    }
  }

  return null;
}

/**
 * Find all locators matching a name
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {string} locatorName - Name to match
 * @returns {Array<{locator: LiveAPI, index: number, time: number}>} Array of matching locators with their times
 */
export function findLocatorsByName(liveSet, locatorName) {
  const locatorIds = liveSet.getChildIds("cue_points");
  /** @type {Array<{locator: LiveAPI, index: number, time: number}>} */
  const matches = [];

  for (let i = 0; i < locatorIds.length; i++) {
    const locator = LiveAPI.from(/** @type {string} */ (locatorIds[i]));
    const name = locator.getProperty("name");

    if (name === locatorName) {
      const time = /** @type {number} */ (locator.getProperty("time"));

      matches.push({ locator, index: i, time });
    }
  }

  return matches;
}

/**
 * Resolve a locator by ID or name to its time in beats
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {object} options - Locator identifier options
 * @param {string} [options.locatorId] - Locator ID to find
 * @param {string} [options.locatorName] - Locator name to find
 * @param {string} toolName - Name of the tool for error messages
 * @returns {number} Time in beats
 * @throws {Error} If locator is not found
 */
export function resolveLocatorToBeats(
  liveSet,
  { locatorId, locatorName },
  toolName,
) {
  if (locatorId != null) {
    const found = findLocator(liveSet, { locatorId });

    if (!found) {
      throw new Error(`${toolName} failed: locator not found: ${locatorId}`);
    }

    return /** @type {number} */ (found.locator.getProperty("time"));
  }

  if (locatorName != null) {
    const matches = findLocatorsByName(liveSet, locatorName);

    if (matches.length === 0) {
      throw new Error(
        `${toolName} failed: no locator found with name "${locatorName}"`,
      );
    }

    // Use the first matching locator
    return /** @type {NonNullable<typeof matches[0]>} */ (matches[0]).time;
  }

  throw new Error(`${toolName} failed: locatorId or locatorName is required`);
}
