/**
 * Sleep utility for V8 environment in Max for Live
 * Uses Max's Task object for scheduling
 */

/**
 * Sleep for the specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>} Resolves after the delay
 */
const sleep = (ms) => new Promise((resolve) => new Task(resolve).schedule(ms));

/**
 * Wait until a predicate returns true, polling at intervals
 * @param {() => boolean} predicate - Function that returns true when condition is met
 * @param {object} [options] - Options
 * @param {number} [options.pollingInterval=10] - Milliseconds between polls
 * @param {number} [options.maxRetries=10] - Maximum number of retries before giving up
 * @returns {Promise<boolean>} True if predicate became true, false if max retries exceeded
 */
export async function waitUntil(
  predicate,
  { pollingInterval = 10, maxRetries = 10 } = {},
) {
  for (let i = 0; i < maxRetries; i++) {
    if (predicate()) {
      return true;
    }

    await sleep(pollingInterval);
  }

  return false;
}
