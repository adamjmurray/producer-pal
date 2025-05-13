// device/sleep.js
/**
 * @param {number} ms - the number of milliseconds to wait
 */
async function sleep(ms) {
  await new Promise((resolve) => new Task(resolve).schedule(ms));
}

// Time to wait in milliseconds after writing state via the Live API
// before performing a read that should reflect the state change:
const DEFAULT_SLEEP_TIME_AFTER_WRITE = 50; // ms

module.exports = { sleep, DEFAULT_SLEEP_TIME_AFTER_WRITE };
