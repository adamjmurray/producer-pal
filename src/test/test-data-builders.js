/**
 * Create a note object with default values for testing
 * @param {object} overrides - Property overrides
 * @returns {object} - Note object with standard Live API note properties
 */
export const createNote = (overrides = {}) => ({
  pitch: 60,
  start_time: 0,
  duration: 1,
  velocity: 100,
  probability: 1.0,
  velocity_deviation: 0,
  ...overrides,
});
