/**
 * Test helper functions for read-track tests
 */

/**
 * Creates a mock track object with default properties
 * @param {object} overrides - Properties to override the defaults
 * @returns {object} Mock track properties
 */
export const mockTrackProperties = (overrides = {}) => ({
  name: "Test Track",
  has_midi_input: 1,
  color: 0,
  mute: 0,
  solo: 0,
  arm: 0,
  is_foldable: 0,
  is_grouped: 0,
  group_track: ["id", 0],
  playing_slot_index: -1,
  fired_slot_index: -1,
  clip_slots: [],
  devices: [],
  ...overrides,
});
